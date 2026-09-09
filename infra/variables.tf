variable "aws_region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "Only the approved region us-east-1 is supported."
  }
}
variable "environment" {
  type = string
  validation {
    condition     = contains(["hml", "prod"], var.environment)
    error_message = "Environment must be hml or prod."
  }
}
variable "state_bucket" {
  type = string
}
variable "artifact_directory" {
  type     = string
  default  = null
  nullable = true
}
variable "cors_origins" {
  type    = list(string)
  default = ["http://localhost:5173"]
}
