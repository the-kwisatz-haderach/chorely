terraform {
  required_version = ">= 1.7"

  # Bucket is passed at init: terraform init -backend-config="bucket=<project>-tfstate"
  backend "gcs" {
    prefix = "shared"
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

variable "github_repository" {
  type = string
}

module "shared" {
  source            = "../../modules/shared"
  project_id        = var.project_id
  region            = var.region
  github_repository = var.github_repository
}

output "sql_instance_name" {
  value = module.shared.sql_instance_name
}

output "sql_connection_name" {
  value = module.shared.sql_connection_name
}

output "image_repository" {
  value = module.shared.image_repository
}

output "github_pool_name" {
  value = module.shared.github_pool_name
}

output "github_provider_name" {
  value = module.shared.github_provider_name
}
