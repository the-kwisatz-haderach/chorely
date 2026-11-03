variable "name" {
  description = "Environment name (staging or prod). Also the GitHub Environment allowed to deploy it."
  type        = string
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

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 3
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
