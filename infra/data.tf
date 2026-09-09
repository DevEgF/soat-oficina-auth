data "terraform_remote_state" "k8s" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "infra-k8s/terraform.tfstate"
    region = var.aws_region
  }
}
data "terraform_remote_state" "db" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "infra-db/terraform.tfstate"
    region = var.aws_region
  }
}
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "auth/shared/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  prefix             = "soat-oficina-auth-${var.environment}"
  artifact_directory = coalesce(var.artifact_directory, "${path.module}/../dist")
  k8s                = data.terraform_remote_state.k8s.outputs
  db                 = data.terraform_remote_state.db.outputs
  function_types     = toset(["auth", "authorizer"])
  tags = {
    Project     = "soat-oficina"
    Component   = "auth"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Phase       = "3"
  }
}
provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
}
