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
variable "lambda_reserved_concurrency" {
  description = "Use 2 where account quota allows reservation, or -1 for reduced-quota accounts with no reservable capacity. API route throttling remains enabled."
  type        = number
  default     = 2
  nullable    = false
  validation {
    condition     = contains([-1, 2], var.lambda_reserved_concurrency)
    error_message = "Lambda concurrency must be 2 (reserved) or -1 (shared account pool)."
  }
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
