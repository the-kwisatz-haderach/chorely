mock_provider "google" {}

variables {
  project_id        = "chorely-test"
  region            = "europe-west1"
  github_repository = "the-kwisatz-haderach/chorely"
}

run "database_is_the_cheapest_shared_core_postgres" {
  command = plan

  assert {
    condition = (
      google_sql_database_instance.main.database_version == "POSTGRES_17" &&
      google_sql_database_instance.main.settings[0].tier == "db-f1-micro" &&
      google_sql_database_instance.main.settings[0].edition == "ENTERPRISE" &&
      google_sql_database_instance.main.settings[0].availability_type == "ZONAL"
    )
    error_message = "One db-f1-micro Postgres 17 instance (about $10/month) is shared by both environments."
  }

  assert {
    condition     = google_sql_database_instance.main.deletion_protection == true
    error_message = "The instance holds prod data and must not be destroyable by a plan."
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].enabled == true
    error_message = "Daily backups must be on."
  }
}

run "registry_keeps_only_the_ten_most_recent_images" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.images.format == "DOCKER" && google_artifact_registry_repository.images.cleanup_policy_dry_run == false
    error_message = "Cleanup policies must actually delete."
  }

  assert {
    condition = anytrue([for p in google_artifact_registry_repository.images.cleanup_policies :
      p.action == "KEEP" && length(p.most_recent_versions) > 0 && p.most_recent_versions[0].keep_count == 10
      ]) && anytrue([for p in google_artifact_registry_repository.images.cleanup_policies :
      p.action == "DELETE" && p.condition[0].tag_state == "ANY"
    ])
    error_message = "Everything but the ten most recent images is deleted."
  }
}

run "github_federation_trusts_only_this_repository" {
  command = plan

  assert {
    condition     = google_iam_workload_identity_pool_provider.github.oidc[0].issuer_uri == "https://token.actions.githubusercontent.com"
    error_message = "Tokens must come from GitHub Actions."
  }

  assert {
    condition     = google_iam_workload_identity_pool_provider.github.attribute_condition == "assertion.repository == \"the-kwisatz-haderach/chorely\""
    error_message = "Only this repository may exchange tokens."
  }

  assert {
    condition     = google_iam_workload_identity_pool_provider.github.attribute_mapping["attribute.environment"] == "has(assertion.environment) ? assertion.environment : \"none\""
    error_message = "Deployers bind by GitHub Environment, and jobs without one must still get a token."
  }
}

run "images_tagged_for_prod_survive_cleanup" {
  command = plan

  assert {
    condition = anytrue([for p in google_artifact_registry_repository.images.cleanup_policies :
      p.action == "KEEP" && length(p.condition) > 0 &&
      p.condition[0].tag_state == "TAGGED" && tolist(p.condition[0].tag_prefixes) == tolist(["prod"])
    ])
    error_message = "The images prod runs and rolls back to (tagged prod and prod-previous) must never be cleaned up."
  }

  assert {
    condition = google_project_iam_custom_role.image_tagger.permissions == toset([
      "artifactregistry.repositories.get",
      "artifactregistry.versions.get",
      "artifactregistry.tags.create",
      "artifactregistry.tags.delete",
      "artifactregistry.tags.get",
      "artifactregistry.tags.list",
      "artifactregistry.tags.update",
    ])
    error_message = "The tagger may move tags but never push images."
  }
}
