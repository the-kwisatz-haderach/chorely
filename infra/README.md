# Infrastructure

Terraform for one GCP project hosting staging and prod (ADR 0006). Applying is manual: CI never runs `terraform apply`. It only checks formatting, validates the roots and runs the module tests.

| Path                        | What it owns                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/shared`            | Project APIs, the Cloud SQL instance, the Artifact Registry repository (keeps 10 images) and the GitHub Workload Identity pool                  |
| `modules/environment`       | The environment's database and user, secret containers, runtime and deployer service accounts, Cloud Run service, migration job, domain mapping |
| `envs/shared`               | Root for `modules/shared`; apply it first                                                                                                       |
| `envs/staging`, `envs/prod` | One root per environment; each reads `envs/shared` outputs from remote state                                                                    |

Expected cost is about $15-20/month, mostly the db-f1-micro instance (#7).

## Tests

```sh
cd infra/modules/environment   # or infra/modules/shared
terraform init -backend=false
terraform test                 # offline: mocked provider, no GCP credentials needed
```

## First-time setup

Needs `gcloud`, Terraform 1.7+, a GCP project with billing, and Owner on it.

```sh
PROJECT=chorely-123456
REGION=europe-north1
gcloud auth application-default login
gcloud config set project $PROJECT
```

### 1. State bucket

Terraform cannot create the bucket that holds its own state, so create it once by hand. Versioning keeps every earlier state so a bad apply can be rolled back.

```sh
gcloud storage buckets create gs://$PROJECT-tfstate --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$PROJECT-tfstate --versioning
```

### 2. Variables

In each of `envs/shared`, `envs/staging` and `envs/prod`, copy `terraform.tfvars.example` to `terraform.tfvars` and fill it in. These files contain no secrets, so commit them.

### 3. Domains

Cloud Run only maps domains that the applying account has verified. Do this once per domain:

```sh
gcloud domains verify chorely.example
```

### 4. Shared root

```sh
cd infra/envs/shared
terraform init -backend-config="bucket=$PROJECT-tfstate"
terraform apply
```

### 5. Each environment (staging first, then prod)

Cloud Run will not create a service whose secrets have no value yet. Create the secret containers and the database user first, set the values out-of-band, then apply the rest:

```sh
ENV=staging   # then prod
cd infra/envs/$ENV
terraform init -backend-config="bucket=$PROJECT-tfstate"
terraform apply \
  -target=module.environment.google_secret_manager_secret.app \
  -target=module.environment.google_sql_user.app
```

Set the secret values (see [Secrets](#secrets) below), then:

```sh
terraform apply
terraform output dns_records   # create these records at the registrar
```

The service starts on a placeholder image. The deploy workflow (#27) replaces it, and Terraform ignores image changes from then on.

### 6. Database isolation (one-time, per environment)

Cloud SQL makes every user it creates a member of `cloudsqlsuperuser`, so `chorely_staging` could otherwise read `chorely_prod`. As `postgres`, make each environment's user own only its own database:

```sh
gcloud sql users set-password postgres --instance=chorely --prompt-for-password
gcloud sql connect chorely --user=postgres
```

```sql
ALTER DATABASE chorely_staging OWNER TO chorely_staging;
ALTER DATABASE chorely_prod OWNER TO chorely_prod;
REVOKE ALL ON DATABASE chorely_staging, chorely_prod FROM PUBLIC;
REVOKE cloudsqlsuperuser FROM chorely_staging, chorely_prod;
```

These statements have not yet been run against a live instance, so check them on staging first.

### 7. GitHub

Create GitHub Environments named `staging` and `prod`, and add required reviewers to `prod`. Each Environment's deployer service account can only be used from jobs running in that Environment, so the job that builds and pushes the image must run in `staging`. The deploy workflow (#27) needs:

- `workload_identity_provider`: `terraform output github_provider_name` in `envs/shared`
- `service_account`: `terraform output deployer_service_account` in each environment root

## Secrets

Terraform creates the secret containers and grants the runtime service account access. Values never appear in code or state. Set them like this, replacing `staging` with `prod` as needed:

| Secret                           | App variable     | Value                                   |
| -------------------------------- | ---------------- | --------------------------------------- |
| `chorely-staging-db-password`    | `PGPASSWORD`     | The `chorely_staging` database password |
| `chorely-staging-auth-secret`    | `AUTH_SECRET`    | Any long random string                  |
| `chorely-staging-resend-api-key` | `RESEND_API_KEY` | From the Resend dashboard               |

```sh
ENV=staging
DB_PASSWORD=$(openssl rand -hex 32)
gcloud sql users set-password chorely_$ENV --instance=chorely --password="$DB_PASSWORD"
printf %s "$DB_PASSWORD" | gcloud secrets versions add chorely-$ENV-db-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add chorely-$ENV-auth-secret --data-file=-
read -rs RESEND_KEY && printf %s "$RESEND_KEY" | gcloud secrets versions add chorely-$ENV-resend-api-key --data-file=-
```

Services read the `latest` version when a revision starts. To rotate a value, add a new version and deploy a new revision. For the database password, run `set-password` and add the secret version back to back, because running instances fail to reconnect until the new revision is live.

## How the app reaches Postgres

Cloud Run mounts the Cloud SQL connector socket at `/cloudsql`. postgres-js cannot take a socket path in a URL, so the environment sets `DATABASE_URL=postgres:///chorely_<env>` (database only) together with `PGHOST=/cloudsql/<connection name>`, `PGUSER` and `PGPASSWORD`, which postgres-js falls back to. The instance's public IP has no authorized networks, so connections must go through the connector.
