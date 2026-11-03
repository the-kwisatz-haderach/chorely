# Cloud Run and Cloud SQL in one Terraform-managed GCP project

Staging and prod run in one GCP project as two Cloud Run services (request-based billing, 0 to 2 instances) sharing one Cloud SQL Postgres `db-f1-micro` instance, with a database and user per environment, for about $15-20/month. Always-on instances and open WebSockets keep Cloud Run billed, so we avoided both. Neon Launch (about $7/month) is the fallback if the fixed database cost binds. Custom domains use Cloud Run domain mapping rather than a load balancer, which would add about $18/month.

## Consequences

- `infra/modules` holds the reusable pieces: `shared` for project-wide resources (APIs, the SQL instance, Artifact Registry, the GitHub Workload Identity pool) and `environment` for everything one environment owns. `infra/envs/{shared,staging,prod}` are the roots. Environment roots read `shared` outputs from remote state, so `shared` is applied first.
- State lives in a versioned GCS bucket created by hand (`infra/README.md`). Applying is manual; CI only formats, validates and runs `terraform test` with a mocked provider.
- Secret Manager holds containers only. Values are set out-of-band, so they never enter code or state. The database user's password is set the same way and Terraform ignores it.
- CI owns the image: Terraform creates the service and migration job on a placeholder image and ignores image changes after that.
- Each environment has its own deployer service account, which only GitHub jobs running in the same-named GitHub Environment can impersonate. Prod therefore inherits that Environment's approval. Only staging may push images; prod promotes the same digest.
- Cloud Run reaches Postgres through the Cloud SQL connector socket. postgres-js cannot take a socket path in a URL, so the socket, user and password come from `PGHOST`, `PGUSER` and `PGPASSWORD`, and `DATABASE_URL` names only the database.
- Cloud SQL makes every user it creates a member of `cloudsqlsuperuser`, which can reach every database. Each environment's user is made owner of its own database and removed from that role by a one-time SQL step (`infra/README.md`), so staging cannot read prod.
- Two instances per environment, each with a pool of five connections, keep both environments and the migration job within db-f1-micro's 25 connections.
- One instance means staging load and maintenance affect prod, and the shared-core tier has no SLA. Both are accepted at household scale.
