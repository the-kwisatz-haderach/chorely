locals {
  service_name = "chorely-${var.name}"
  # Runs until the first CI deploy replaces it; Terraform ignores image changes after that.
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
  db_name           = "chorely_${var.name}"

  # postgres-js cannot take a socket path in the URL, so the URL names only the database and
  # the socket, user and password come from the PG* variables it falls back to.
  db_env = {
    DATABASE_URL = "postgres:///${local.db_name}"
    PGHOST       = "/cloudsql/${var.sql_connection_name}"
    PGUSER       = local.db_name
  }
  app_env = merge(
    local.db_env,
    var.email_from == null ? {} : { EMAIL_FROM = var.email_from },
    # The app drops mail to anyone else (apps/web/src/server/email.ts).
    var.email_allowlist == null ? {} : { EMAIL_ALLOWLIST = join(",", var.email_allowlist) },
  )
  secret_env = {
    PGPASSWORD     = "db-password"
    AUTH_SECRET    = "auth-secret"
    RESEND_API_KEY = "resend-api-key"
  }
  # Containers only: values are added out-of-band (see infra/README.md), never in code or state.
  secrets = toset(values(local.secret_env))
}

resource "google_sql_database" "app" {
  project  = var.project_id
  instance = var.sql_instance_name
  name     = local.db_name
}

# Cloud SQL needs a password to create a Postgres user. It is write-only, so it never enters
# state, and it is only read on create; rotate with `gcloud sql users set-password` (infra/README.md).
resource "google_sql_user" "app" {
  project         = var.project_id
  instance        = var.sql_instance_name
  name            = local.db_name
  deletion_policy = "ABANDON"
  password_wo     = var.db_password
}

resource "google_project_iam_member" "runtime_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "${local.service_name}-run"
  display_name = "Chorely ${var.name} runtime"
}

resource "google_secret_manager_secret" "app" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = "${local.service_name}-${each.key}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = google_secret_manager_secret.app[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "app" {
  project  = var.project_id
  name     = local.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # The app authenticates its own users, so the service is public. Disabling the invoker check
  # does that without an allUsers binding, which domain-restricted sharing org policies reject.
  invoker_iam_disabled = true

  template {
    service_account = google_service_account.runtime.email

    # Scale to zero so idle time is free. Two instances per environment, each with a pool of
    # five, stay within db-f1-micro's 25 connections alongside the migration job.
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.sql_connection_name]
      }
    }

    containers {
      image = local.placeholder_image

      dynamic "env" {
        for_each = local.app_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime, google_project_iam_member.runtime_sql_client]

  lifecycle {
    ignore_changes = [client, client_version, template[0].containers[0].image]
  }
}

# Run by the deploy workflow before traffic shifts. CI owns the image and command; Terraform owns access.
resource "google_cloud_run_v2_job" "migrate" {
  project  = var.project_id
  name     = "${local.service_name}-migrate"
  location = var.region

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.sql_connection_name]
        }
      }

      containers {
        image = local.placeholder_image

        dynamic "env" {
          for_each = local.db_env
          content {
            name  = env.key
            value = env.value
          }
        }

        env {
          name = "PGPASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app["db-password"].secret_id
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime, google_project_iam_member.runtime_sql_client]

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].template[0].containers[0].image,
      template[0].template[0].containers[0].command,
      template[0].template[0].containers[0].args,
    ]
  }
}

# Cloud Run domain mapping instead of a load balancer, which would add about $18/month (ADR 0006).
resource "google_cloud_run_domain_mapping" "app" {
  project  = var.project_id
  location = var.region
  name     = var.domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}

# The deploy workflow impersonates this account through Workload Identity Federation, only from jobs
# running in the GitHub Environment of the same name, so prod inherits that Environment's approval.
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "${local.service_name}-deploy"
  display_name = "Chorely ${var.name} deployer (GitHub Actions)"
}

resource "google_service_account_iam_member" "deployer_federation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${var.github_pool_name}/attribute.environment/${var.name}"
}

resource "google_cloud_run_v2_service_iam_member" "deployer" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_cloud_run_v2_job_iam_member" "deployer" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.migrate.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  count      = var.push_images ? 1 : 0
  project    = var.project_id
  location   = var.region
  repository = var.image_repository
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Prod tags the image it deploys so registry cleanup keeps it (modules/shared).
resource "google_artifact_registry_repository_iam_member" "deployer_tag" {
  count      = var.push_images ? 0 : 1
  project    = var.project_id
  location   = var.region
  repository = var.image_repository
  role       = var.image_tagger_role
  member     = "serviceAccount:${google_service_account.deployer.email}"
}
