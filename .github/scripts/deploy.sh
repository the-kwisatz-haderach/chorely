#!/usr/bin/env bash
# Usage: deploy.sh <staging|prod> <image@digest>
# Runs the environment's migration job on the image, then deploys it. Migrations finish before
# the new revision takes traffic, and are expand/contract so the previous revision keeps working
# against the migrated schema (ADR 0006). Needs REGION and gcloud authenticated as the deployer.
set -euo pipefail

env=$1
image=$2
service="chorely-$env"

gcloud run jobs update "$service-migrate" --region="$REGION" --image="$image" \
  --command=node --args=migrate.mjs,drizzle --quiet
gcloud run jobs execute "$service-migrate" --region="$REGION" --wait

gcloud run deploy "$service" --region="$REGION" --image="$image" --quiet
# A rollback pins traffic to an older revision (infra/README.md); a new deploy takes it back.
gcloud run services update-traffic "$service" --region="$REGION" --to-latest --quiet
