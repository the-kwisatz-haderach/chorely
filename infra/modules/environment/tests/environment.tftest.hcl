mock_provider "google" {
  override_resource {
    target = google_service_account.runtime
    values = { email = "chorely-staging-run@chorely-test.iam.gserviceaccount.com", name = "projects/chorely-test/serviceAccounts/chorely-staging-run@chorely-test.iam.gserviceaccount.com" }
  }

  override_resource {
    target = google_service_account.deployer
    values = { email = "chorely-staging-deploy@chorely-test.iam.gserviceaccount.com", name = "projects/chorely-test/serviceAccounts/chorely-staging-deploy@chorely-test.iam.gserviceaccount.com" }
  }
}

variables {
  name                = "staging"
  project_id          = "chorely-test"
  region              = "europe-west1"
  sql_instance_name   = "chorely"
  sql_connection_name = "chorely-test:europe-west1:chorely"
  domain              = "staging.chorely.example"
  github_pool_name    = "projects/123/locations/global/workloadIdentityPools/github"
  image_repository    = "chorely"
  push_images         = true
}

run "cloud_run_scales_to_zero_and_caps_at_three" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.app.template[0].scaling[0].min_instance_count == 0
    error_message = "The service must scale to zero so idle time is free."
  }

  assert {
    condition     = google_cloud_run_v2_service.app.template[0].scaling[0].max_instance_count == 3
    error_message = "The service must cap at three instances."
  }
}

run "secrets_are_per_environment_containers_readable_by_the_runtime_only" {
  command = apply

  assert {
    condition = toset([for s in google_secret_manager_secret.app : s.secret_id]) == toset([
      "chorely-staging-db-password",
      "chorely-staging-auth-secret",
      "chorely-staging-resend-api-key",
    ])
    error_message = "Each environment needs its own db password, auth secret and Resend key containers."
  }

  assert {
    condition = alltrue([for m in google_secret_manager_secret_iam_member.runtime :
      m.role == "roles/secretmanager.secretAccessor" &&
      m.member == "serviceAccount:chorely-staging-run@chorely-test.iam.gserviceaccount.com"
    ]) && length(google_secret_manager_secret_iam_member.runtime) == 3
    error_message = "The runtime service account must be able to read each secret."
  }
}

run "service_reaches_its_own_database_over_the_cloud_sql_socket" {
  command = apply

  assert {
    condition     = google_sql_database.app.name == "chorely_staging" && google_sql_database.app.instance == "chorely"
    error_message = "Each environment gets its own database on the shared instance."
  }

  assert {
    condition     = google_sql_user.app.name == "chorely_staging" && google_sql_user.app.instance == "chorely"
    error_message = "Each environment gets its own database user."
  }

  assert {
    condition     = google_cloud_run_v2_service.app.template[0].service_account == "chorely-staging-run@chorely-test.iam.gserviceaccount.com"
    error_message = "The service must run as the environment's runtime service account."
  }

  assert {
    condition     = google_cloud_run_v2_service.app.template[0].volumes[0].cloud_sql_instance[0].instances == toset(["chorely-test:europe-west1:chorely"])
    error_message = "The Cloud SQL socket must be mounted."
  }

  assert {
    condition = {
      for e in google_cloud_run_v2_service.app.template[0].containers[0].env : e.name => e.value if e.value != null && e.value != ""
      } == {
      DATABASE_URL = "postgres:///chorely_staging"
      PGHOST       = "/cloudsql/chorely-test:europe-west1:chorely"
      PGUSER       = "chorely_staging"
    }
    error_message = "postgres-js reads the socket and user from PG* variables when DATABASE_URL has no host."
  }

  assert {
    condition = {
      for e in google_cloud_run_v2_service.app.template[0].containers[0].env : e.name => e.value_source[0].secret_key_ref[0].secret if length(e.value_source) > 0
      } == {
      PGPASSWORD     = "chorely-staging-db-password"
      AUTH_SECRET    = "chorely-staging-auth-secret"
      RESEND_API_KEY = "chorely-staging-resend-api-key"
    }
    error_message = "Secrets reach the app as env vars from Secret Manager."
  }
}

run "migration_job_reaches_the_same_database_with_only_the_db_password" {
  command = apply

  assert {
    condition     = google_cloud_run_v2_job.migrate.name == "chorely-staging-migrate"
    error_message = "Each environment has its own migration job."
  }

  assert {
    condition     = google_cloud_run_v2_job.migrate.template[0].template[0].service_account == "chorely-staging-run@chorely-test.iam.gserviceaccount.com"
    error_message = "The job runs as the runtime service account."
  }

  assert {
    condition     = tolist(google_cloud_run_v2_job.migrate.template[0].template[0].volumes[0].cloud_sql_instance[0].instances) == tolist(["chorely-test:europe-west1:chorely"])
    error_message = "The job must mount the Cloud SQL socket."
  }

  assert {
    condition = {
      for e in google_cloud_run_v2_job.migrate.template[0].template[0].containers[0].env :
      e.name => length(e.value_source) > 0 ? e.value_source[0].secret_key_ref[0].secret : e.value
      } == {
      DATABASE_URL = "postgres:///chorely_staging"
      PGHOST       = "/cloudsql/chorely-test:europe-west1:chorely"
      PGUSER       = "chorely_staging"
      PGPASSWORD   = "chorely-staging-db-password"
    }
    error_message = "The job gets the database connection and nothing else."
  }
}

run "domain_maps_to_a_public_service" {
  command = apply

  assert {
    condition = (
      google_cloud_run_domain_mapping.app.name == "staging.chorely.example" &&
      google_cloud_run_domain_mapping.app.location == "europe-west1" &&
      google_cloud_run_domain_mapping.app.spec[0].route_name == "chorely-staging"
    )
    error_message = "The environment's domain must route to its service."
  }

  assert {
    condition = (
      google_cloud_run_v2_service_iam_member.public.name == "chorely-staging" &&
      google_cloud_run_v2_service_iam_member.public.role == "roles/run.invoker" &&
      google_cloud_run_v2_service_iam_member.public.member == "allUsers"
    )
    error_message = "Anyone can reach the app; it does its own auth."
  }
}

run "only_the_matching_github_environment_can_deploy" {
  command = apply

  assert {
    condition = (
      google_service_account_iam_member.deployer_federation.role == "roles/iam.workloadIdentityUser" &&
      google_service_account_iam_member.deployer_federation.member == "principalSet://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/github/attribute.environment/staging"
    )
    error_message = "Only GitHub jobs in the staging Environment may act as the staging deployer."
  }

  assert {
    condition = (
      google_cloud_run_v2_service_iam_member.deployer.name == "chorely-staging" &&
      google_cloud_run_v2_job_iam_member.deployer.name == "chorely-staging-migrate" &&
      google_cloud_run_v2_service_iam_member.deployer.role == "roles/run.developer" &&
      google_cloud_run_v2_job_iam_member.deployer.role == "roles/run.developer" &&
      google_cloud_run_v2_service_iam_member.deployer.member == "serviceAccount:chorely-staging-deploy@chorely-test.iam.gserviceaccount.com" &&
      google_cloud_run_v2_job_iam_member.deployer.member == "serviceAccount:chorely-staging-deploy@chorely-test.iam.gserviceaccount.com"
    )
    error_message = "The deployer may deploy this environment's service and run its migration job, nothing more."
  }

  assert {
    condition = (
      google_service_account_iam_member.deployer_acts_as_runtime.role == "roles/iam.serviceAccountUser" &&
      google_service_account_iam_member.deployer_acts_as_runtime.member == "serviceAccount:chorely-staging-deploy@chorely-test.iam.gserviceaccount.com"
    )
    error_message = "Deploying a revision that runs as the runtime account requires acting as it."
  }

  assert {
    condition = (
      length(google_artifact_registry_repository_iam_member.deployer_push) == 1 &&
      google_artifact_registry_repository_iam_member.deployer_push[0].repository == "chorely" &&
      google_artifact_registry_repository_iam_member.deployer_push[0].role == "roles/artifactregistry.writer"
    )
    error_message = "Staging builds and pushes the image."
  }
}

run "prod_deploys_the_pushed_image_without_push_rights" {
  command = plan

  variables {
    name        = "prod"
    domain      = "chorely.example"
    push_images = false
  }

  assert {
    condition     = length(google_artifact_registry_repository_iam_member.deployer_push) == 0
    error_message = "Prod promotes the staging digest, so it never pushes."
  }

  assert {
    condition     = google_service_account_iam_member.deployer_federation.member == "principalSet://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/github/attribute.environment/prod"
    error_message = "Only GitHub jobs in the prod Environment (behind its approval) may deploy prod."
  }
}

run "email_sender_is_set_when_given" {
  command = plan

  variables {
    email_from = "Chorely <login@chorely.example>"
  }

  assert {
    condition     = contains([for e in google_cloud_run_v2_service.app.template[0].containers[0].env : "${e.name}=${coalesce(e.value, "-")}"], "EMAIL_FROM=Chorely <login@chorely.example>")
    error_message = "EMAIL_FROM must reach the app so mail is sent from a verified domain."
  }
}
