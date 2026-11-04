#!/usr/bin/env bash
# Checks isolate-environments.sql against a scratch Postgres with roles set up the way Cloud SQL
# sets them up: runs it twice (it must be idempotent), then checks each environment's user can
# migrate its own database and cannot connect to the other one.
# Drops and recreates the chorely_staging/chorely_prod databases and roles: scratch clusters only.
#
# Usage: ADMIN_URL=postgres://chorely:chorely@localhost:5433/chorely infra/sql/test-isolation.sh
set -euo pipefail

: "${ADMIN_URL:?set ADMIN_URL to a superuser connection URL}"
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
host_port=${ADMIN_URL#*@}
host_port=${host_port%%/*}
export PGPASSWORD=test-only

url() { echo "postgres://$1:$PGPASSWORD@$host_port/$2"; }
admin() { psql "$ADMIN_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
as() { psql "$(url "$1" "$2")" -X -q -v ON_ERROR_STOP=1 "${@:3}"; }

teardown() {
  admin -c "DROP DATABASE IF EXISTS chorely_staging WITH (FORCE)" \
    -c "DROP DATABASE IF EXISTS chorely_prod WITH (FORCE)" \
    -c "DROP ROLE IF EXISTS chorely_staging" -c "DROP ROLE IF EXISTS chorely_prod" \
    -c "DROP ROLE IF EXISTS cloudsql_admin" -c "DROP ROLE IF EXISTS cloudsqlsuperuser"
}
trap teardown EXIT
teardown

# As Cloud SQL: API-created users join cloudsqlsuperuser through a grant the admin user (postgres
# on Cloud SQL) did not make, so it cannot revoke it, and cloudsqlsuperuser owns API-created
# databases. The admin user is a member with ADMIN but cannot SET ROLE to the app users.
admin <<SQL
CREATE ROLE cloudsqlsuperuser NOLOGIN CREATEROLE CREATEDB;
CREATE ROLE cloudsql_admin LOGIN PASSWORD '$PGPASSWORD' CREATEROLE CREATEDB;
GRANT cloudsqlsuperuser TO cloudsql_admin WITH ADMIN OPTION;
CREATE ROLE chorely_staging LOGIN PASSWORD '$PGPASSWORD' IN ROLE cloudsqlsuperuser;
CREATE ROLE chorely_prod LOGIN PASSWORD '$PGPASSWORD' IN ROLE cloudsqlsuperuser;
CREATE DATABASE chorely_staging OWNER cloudsqlsuperuser;
CREATE DATABASE chorely_prod OWNER cloudsqlsuperuser;
SQL

for run in 1 2; do
  echo "Applying isolate-environments.sql (run $run)"
  as cloudsql_admin postgres -f "$here/isolate-environments.sql"
done

for env in staging prod; do
  other=$([ "$env" = staging ] && echo prod || echo staging)

  echo "Migrating chorely_$env as chorely_$env"
  (cd "$repo" && DATABASE_URL=$(url "chorely_$env" "chorely_$env") pnpm --silent db:migrate)

  if as "chorely_$env" "chorely_$other" -c "SELECT 1" >/dev/null 2>&1; then
    echo "chorely_$env can connect to chorely_$other"
    exit 1
  fi
done

echo "Isolation OK"
