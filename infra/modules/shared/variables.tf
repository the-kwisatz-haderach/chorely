variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "github_repository" {
  description = "owner/name of the only GitHub repository allowed to federate."
  type        = string
}
