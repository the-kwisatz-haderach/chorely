variable "name" {
  description = "Environment name (staging or prod). Also the GitHub Environment allowed to deploy it."
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.name)
    error_message = "name must be staging or prod."
  }
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "sql_instance_name" {
  description = "The shared Cloud SQL instance this environment gets a database on."
  type        = string
}

variable "sql_connection_name" {
  description = "project:region:instance, mounted as a Unix socket under /cloudsql."
  type        = string
}

variable "domain" {
  description = "Custom domain mapped to the service. Must be verified for the applying account first (infra/README.md)."
  type        = string
}

variable "github_pool_name" {
  description = "Full resource name of the shared GitHub Workload Identity pool."
  type        = string
}

variable "image_repository" {
  description = "Artifact Registry repository ID holding the app images."
  type        = string
}

variable "push_images" {
  description = "Whether this environment's deployer builds and pushes images. Prod only promotes staging's digest."
  type        = bool
}

variable "email_from" {
  description = "Sender for sign-in emails, on a domain verified in Resend. Null uses the app's Resend test sender."
  type        = string
  default     = null
}

variable "image_tagger_role" {
  description = "Custom role that can move image tags but not push, granted to deployers without push rights."
  type        = string
}

variable "db_password" {
  description = "The database user's password, read from the db-password secret at apply time. Only needed when the user is created."
  type        = string
  default     = null
  ephemeral   = true
}

variable "email_allowlist" {
  description = "Staging only: the only addresses the app emails, so testers get codes and nobody else gets mail. Must be null for prod."
  type        = list(string)
  default     = null

  validation {
    condition     = var.name == "staging" ? length(coalesce(var.email_allowlist, [])) > 0 : var.email_allowlist == null
    error_message = "Staging needs a non-empty email_allowlist; prod must not have one."
  }
}
