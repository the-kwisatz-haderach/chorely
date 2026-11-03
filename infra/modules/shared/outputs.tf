output "sql_instance_name" {
  value = google_sql_database_instance.main.name
}

output "sql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "image_repository" {
  value = google_artifact_registry_repository.images.repository_id
}

output "github_pool_name" {
  value = google_iam_workload_identity_pool.github.name
}

output "github_provider_name" {
  description = "Set as the workload_identity_provider input of google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}
