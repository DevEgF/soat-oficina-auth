terraform {
  required_version = ">= 1.11, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    key          = "auth/shared/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
variable "state_bucket" { type = string }
provider "aws" {
  region = "us-east-1"
  default_tags { tags = { Project = "soat-oficina", Component = "auth", ManagedBy = "Terraform", Phase = "3" } }
}
data "terraform_remote_state" "k8s" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "infra-k8s/terraform.tfstate"
    region = "us-east-1"
  }
}
resource "aws_apigatewayv2_vpc_link" "shared" {
  name               = "soat-oficina-auth-shared"
  security_group_ids = [data.terraform_remote_state.k8s.outputs.lambda_security_group_id]
  subnet_ids         = data.terraform_remote_state.k8s.outputs.private_subnet_ids
}
output "vpc_link_id" { value = aws_apigatewayv2_vpc_link.shared.id }
