# Infrastructure

Terraform for one GCP project hosting staging and prod (ADR 0006). Applying is manual: CI never runs `terraform apply`. It only checks formatting, validates the roots and runs the module tests.

| Path                        | What it owns                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/shared`            | Project APIs, the Cloud SQL instance, the Artifact Registry repository (keeps 10 images plus `prod*` tags), the image tagger role and the GitHub Workload Identity pool |
| `modules/environment`       | The environment's database and user, secret containers, runtime and deployer service accounts, Cloud Run service, migration job, domain mapping                         |
| `envs/shared`               | Root for `modules/shared`; apply it first                                                                                                                               |
| `envs/staging`, `envs/prod` | One root per environment; each reads `envs/shared` outputs from remote state                                                                                            |

Expected cost is about $15-20/month, mostly the db-f1-micro instance (#7).

## Tests

```sh
cd infra/modules/environment   # or infra/modules/shared
terraform init -backend=false
terraform test                 # offline: mocked provider, no GCP credentials needed
```

## First-time setup

Needs `gcloud`, Terraform 1.11+, a GCP project with billing, and Owner on it.

```sh
PROJECT=chorely-513612
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

Cloud Run will not create a service whose secrets have no value yet. Create the secret containers first, set the values out-of-band, then apply the rest:

```sh
ENV=staging   # then prod
cd infra/envs/$ENV
terraform init -backend-config="bucket=$PROJECT-tfstate"
terraform apply -target=module.environment.google_secret_manager_secret.app
```

Set the secret values (see [Secrets](#secrets) below). Then apply the rest, passing the database password from its secret. Cloud SQL needs it to create the user. Terraform sends it as a write-only value and never stores it in state or plan files. Later applies don't need it.

```sh
TF_VAR_db_password="$(gcloud secrets versions access latest --secret=chorely-$ENV-db-password)" \
  terraform apply
terraform output dns_records   # create these records at the registrar
```

If the secrets were created outside Terraform (`Error 409: Secret ... already exists`), import them instead of creating them:

```sh
for s in db-password auth-secret resend-api-key; do
  terraform import "module.environment.google_secret_manager_secret.app[\"$s\"]" \
    "projects/$PROJECT/secrets/chorely-$ENV-$s"
done
```

The service starts on a placeholder image. The deploy workflow (`.github/workflows/deploy.yml`) replaces it, and Terraform ignores image changes from then on.

### 6. Database isolation (after both environments exist)

Cloud SQL makes every user it creates a member of `cloudsqlsuperuser`, which owns the databases, so `chorely_staging` could otherwise read `chorely_prod`. [`sql/isolate-environments.sql`](sql/isolate-environments.sql) has `postgres` take ownership of both databases and grant each environment's user its own database only; its header explains why. It is safe to re-run, and CI checks it against Postgres with Cloud SQL's role setup (`sql/test-isolation.sh`).

Give `postgres` its own password (keep it in a password manager, not Secret Manager). `gcloud sql connect` needs `psql` and `cloud-sql-proxy` on `PATH` (`gcloud components install cloud-sql-proxy`, which installs into the SDK's `bin` folder). From the repo root:

```sh
gcloud sql users set-password postgres --instance=chorely --prompt-for-password
gcloud sql connect chorely --user=postgres
```

```sql
\i infra/sql/isolate-environments.sql
```

It asks for the `postgres` password again at each `\c`. To confirm, `\c postgres` and check that each database's access list (`\l chorely_*`) names only `postgres` and its own user.

### 7. GitHub

Create GitHub Environments named `staging` and `prod`, and add required reviewers to `prod`. Each Environment's deployer service account can only be used from jobs running in that Environment, so the job that builds and pushes the image must run in `staging`. The deploy workflow (`.github/workflows/deploy.yml`) reads these GitHub variables (not secrets; none of them is sensitive):

| Variable                         | Where                        | Value                                                                  |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | Repository                   | The project id                                                         |
| `GCP_REGION`                     | Repository                   | The region, for example `europe-north1`                                |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Repository                   | `terraform output github_provider_name` in `envs/shared`               |
| `GCP_SERVICE_ACCOUNT`            | Each Environment, separately | `terraform output deployer_service_account` in that environment's root |

```sh
gh variable set GCP_PROJECT_ID --body "$PROJECT"
gh variable set GCP_REGION --body "$REGION"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$(terraform -chdir=infra/envs/shared output -raw github_provider_name)"
for ENV in staging prod; do
  gh variable set GCP_SERVICE_ACCOUNT --env $ENV --body "$(terraform -chdir=infra/envs/$ENV output -raw deployer_service_account)"
done
```

Once CI passes on main, the workflow builds the image, runs the staging migration job, deploys staging, and waits for a `prod` reviewer to approve before doing the same in prod with the same digest.

After a successful prod deploy, the workflow tags the deployed image `prod` and moves the previous `prod` tag to `prod-previous`. Registry cleanup keeps the 10 newest images plus anything tagged `prod*`, so prod's image and its rollback target are never deleted. The prod deployer has a tag-only custom role for this and cannot push.

### Rollback

Migrations are expand/contract (ADR 0006), so the previous revision still works against the current schema. Send its traffic back:

```sh
gcloud run revisions list --service=chorely-prod --region=$REGION
gcloud run services update-traffic chorely-prod --region=$REGION --to-revisions=<previous revision>=100
```

The next deploy moves traffic back to the latest revision. The image prod ran before is also tagged `prod-previous`.

## Staging email

Staging only emails addresses in `email_allowlist` and drops mail to anyone else, logging the recipient but not the code. Terraform refuses to plan staging without it, and the deploy workflow refuses to deploy a staging service that lacks it, so apply `envs/staging` with it before the first deploy.

The addresses are personal and this repository is public, so they live in `envs/staging/email.auto.tfvars`, which git ignores and Terraform loads by itself. Create it, then apply:

```hcl
email_allowlist = ["you@example.com", "tester@example.com"]
```

## Secrets

Terraform creates the secret containers and grants the runtime service account access. Values never appear in code or state. Set them like this, replacing `staging` with `prod` as needed:

| Secret                           | App variable     | Value                                                                   |
| -------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `chorely-staging-db-password`    | `PGPASSWORD`     | Any long random string; Terraform sets it on the `chorely_staging` user |
| `chorely-staging-auth-secret`    | `AUTH_SECRET`    | Any long random string                                                  |
| `chorely-staging-resend-api-key` | `RESEND_API_KEY` | From the Resend dashboard                                               |

```sh
ENV=staging
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add chorely-$ENV-db-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add chorely-$ENV-auth-secret --data-file=-
read -rs RESEND_KEY && printf %s "$RESEND_KEY" | gcloud secrets versions add chorely-$ENV-resend-api-key --data-file=-
```

Services read the `latest` version when a revision starts. To rotate a value, add a new version and deploy a new revision. To rotate the database password after the user exists, run `gcloud sql users set-password chorely_$ENV --instance=chorely --password="$NEW"` and add the secret version back to back, because running instances fail to reconnect until the new revision is live.

## How the app reaches Postgres

Cloud Run mounts the Cloud SQL connector socket at `/cloudsql`. postgres-js cannot take a socket path in a URL, so the environment sets `DATABASE_URL=postgres:///chorely_<env>` (database only) together with `PGHOST=/cloudsql/<connection name>`, `PGUSER` and `PGPASSWORD`, which postgres-js falls back to. The instance's public IP has no authorized networks, so connections must go through the connector.
