# Coding standards

Rules for review. Tooling already enforces formatting, lint, types, Terraform validity, workflow
and shell lint, and email addresses in tracked files (`.github/workflows/ci.yml`); this file holds
what it cannot check.

## Deploy permissions

Every `gcloud` command in `.github/scripts/` and `.github/workflows/deploy.yml` runs as an
environment's deployer service account. For each command the diff adds or changes, name the
permission it needs and the deployer binding in `infra/modules/environment/main.tf` that grants it,
for **both** staging and prod: their bindings differ through `push_images`, so a command that works
on staging can still be denied on prod. Keep the binding list in the `deploy.sh` header true.
`infra/README.md` (Checking deployer permissions) checks a permission against the applied policy.
