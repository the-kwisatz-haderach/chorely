#!/usr/bin/env bash
# Usage: deploy.sh <staging|prod> <image@digest>
# Runs the environment's migration job on the image, then deploys it. Migrations finish before
# the new revision takes traffic, and are expand/contract so the previous revision keeps working
# against the migrated schema (ADR 0006). Needs REGION and gcloud authenticated as the deployer.
set -euo pipefail

target=$1
image=$2
service="chorely-$target"

# Terraform sets EMAIL_ALLOWLIST on staging, but applying is manual. Refuse to deploy a staging
# that could email anyone.
if [ "$target" = staging ]; then
  env_names=$(gcloud run services describe "$service" --region="$REGION" \
    --format='value(spec.template.spec.containers[0].env[].name)')
  if [[ ";$env_names;" != *";EMAIL_ALLOWLIST;"* ]]; then
    echo "chorely-staging has no EMAIL_ALLOWLIST; apply infra/envs/staging first (infra/README.md)." >&2
    exit 1
  fi
fi

gcloud run jobs update "$service-migrate" --region="$REGION" --image="$image" \
  --command=node --args=migrate.mjs,drizzle --quiet
gcloud run jobs execute "$service-migrate" --region="$REGION" --wait

gcloud run deploy "$service" --region="$REGION" --image="$image" --quiet
# A rollback pins traffic to an older revision (infra/README.md); a new deploy takes it back.
gcloud run services update-traffic "$service" --region="$REGION" --to-latest --quiet
