locals {
  services = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "enabled" {
  for_each           = local.services
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# One shared-core instance with a database per environment keeps the fixed cost at about
# $10/month (ADR 0006). Cloud Run connects through the Cloud SQL connector socket, so the public
# IP accepts no direct connections (no authorized networks).
resource "google_sql_database_instance" "main" {
  project             = var.project_id
  name                = "chorely"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = true

  settings {
    tier              = "db-f1-micro"
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled    = true
      start_time = "02:00"

      backup_retention_settings {
        retained_backups = 7
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

# Both environments run images from here: staging pushes, prod promotes the same digest.
resource "google_artifact_registry_repository" "images" {
  project                = var.project_id
  location               = var.region
  repository_id          = "chorely"
  format                 = "DOCKER"
  cleanup_policy_dry_run = false

  # KEEP wins over DELETE, so everything but the ten most recent versions is removed.
  cleanup_policies {
    id     = "delete-all"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  cleanup_policies {
    id     = "keep-ten-most-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  depends_on = [google_project_service.enabled]
}

# GitHub Actions authenticates with short-lived OIDC tokens instead of service account keys.
# Each environment's deployer is bound to attribute.environment (modules/environment).
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  attribute_condition                = "assertion.repository == \"${var.github_repository}\""

  attribute_mapping = {
    "google.subject" = "assertion.sub"
    # GitHub only sends the environment claim for jobs that declare one.
    "attribute.environment" = "has(assertion.environment) ? assertion.environment : \"none\""
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
