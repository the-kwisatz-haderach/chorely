-- Run once per instance as postgres: gcloud sql connect chorely --user=postgres, then
-- \i infra/sql/isolate-environments.sql (infra/README.md step 6). Safe to re-run.
--
-- Cloud SQL makes every user it creates a member of cloudsqlsuperuser and makes that role own
-- the databases it creates, so chorely_staging could otherwise read chorely_prod. postgres can
-- neither revoke that membership (Postgres 16+ only revokes grants it made itself) nor hand the
-- databases to the app users (it cannot SET ROLE to them), so it takes ownership itself and grants
-- each app user its own database. CREATE on the database lets migrations create their drizzle schema.
-- Checked in CI by test-isolation.sh.

ALTER DATABASE chorely_staging OWNER TO CURRENT_USER;
ALTER DATABASE chorely_prod OWNER TO CURRENT_USER;
REVOKE ALL ON DATABASE chorely_staging, chorely_prod FROM PUBLIC, cloudsqlsuperuser;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE chorely_staging TO chorely_staging;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE chorely_prod TO chorely_prod;

\c chorely_staging
GRANT USAGE, CREATE ON SCHEMA public TO chorely_staging;

\c chorely_prod
GRANT USAGE, CREATE ON SCHEMA public TO chorely_prod;
