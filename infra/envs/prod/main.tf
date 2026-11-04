terraform {
  required_version = ">= 1.11"

  # Bucket is passed at init: terraform init -backend-config="bucket=<project>-tfstate"
  backend "gcs" {
    prefix = "prod"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "state_bucket" {
  description = "The bucket holding the shared root's state."
  type        = string
}

variable "domain" {
  type = string
}

# Never stored: pass as TF_VAR_db_password from the db-password secret (infra/README.md).
variable "db_password" {
  type      = string
  default   = null
  ephemeral = true
}

variable "email_from" {
  type    = string
  default = null
}

data "terraform_remote_state" "shared" {
  backend = "gcs"
  config = {
    bucket = var.state_bucket
    prefix = "shared"
  }
}

module "environment" {
  source              = "../../modules/environment"
  name                = "prod"
  project_id          = var.project_id
  region              = var.region
  sql_instance_name   = data.terraform_remote_state.shared.outputs.sql_instance_name
  sql_connection_name = data.terraform_remote_state.shared.outputs.sql_connection_name
  github_pool_name    = data.terraform_remote_state.shared.outputs.github_pool_name
  image_repository    = data.terraform_remote_state.shared.outputs.image_repository
  image_tagger_role   = data.terraform_remote_state.shared.outputs.image_tagger_role
  push_images         = false
  domain              = var.domain
  email_from          = var.email_from
  db_password         = var.db_password
}

output "service_name" {
  value = module.environment.service_name
}

output "migration_job_name" {
  value = module.environment.migration_job_name
}

output "deployer_service_account" {
  value = module.environment.deployer_service_account
}

output "secret_ids" {
  value = module.environment.secret_ids
}

output "dns_records" {
  value = module.environment.dns_records
}
