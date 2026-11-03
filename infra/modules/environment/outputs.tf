output "service_name" {
  value = google_cloud_run_v2_service.app.name
}

output "migration_job_name" {
  value = google_cloud_run_v2_job.migrate.name
}

output "deployer_service_account" {
  description = "Set as the service_account input of google-github-actions/auth in this GitHub Environment."
  value       = google_service_account.deployer.email
}

output "secret_ids" {
  description = "Secret Manager containers to fill out-of-band."
  value       = [for s in google_secret_manager_secret.app : s.secret_id]
}

output "dns_records" {
  description = "DNS records to create at the registrar for the domain mapping."
  value       = try(google_cloud_run_domain_mapping.app.status[0].resource_records, [])
}
