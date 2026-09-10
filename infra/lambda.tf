resource "aws_cloudwatch_log_group" "lambda" {
  #checkov:skip=CKV_AWS_158: CloudWatch service-managed encryption is retained for the approved ephemeral stack; handlers never log CPF or secrets.
  #checkov:skip=CKV_AWS_338: The approved environment retains safe diagnostic logs for seven days.
  for_each          = local.function_types
  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = 7
}
resource "aws_lambda_function" "handler" {
  #checkov:skip=CKV_AWS_272: Protected PR checks and immutable hashed release bundles control code promotion; a Signer service is outside the approved academic stack.
  #checkov:skip=CKV_AWS_116: These handlers are invoked synchronously by API Gateway, so an asynchronous DLQ would not receive these failures.
  #checkov:skip=CKV_AWS_173: Environment variables contain only metadata and ARNs and retain AWS-managed encryption; secret values are fetched at runtime.
  for_each                       = local.function_types
  function_name                  = "${local.prefix}-${each.key}"
  description                    = "Oficina ${each.key} for ${var.environment}"
  role                           = aws_iam_role.lambda[each.key].arn
  filename                       = "${local.artifact_directory}/${each.key}.zip"
  source_code_hash               = filebase64sha256("${local.artifact_directory}/${each.key}.zip")
  handler                        = "index.handler"
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  memory_size                    = 256
  timeout                        = 5
  reserved_concurrent_executions = 2
  publish                        = true
  tracing_config { mode = "Active" }
  vpc_config {
    subnet_ids         = local.k8s.private_subnet_ids
    security_group_ids = [local.k8s.lambda_security_group_id]
  }
  environment {
    variables = merge({
      ENVIRONMENT                        = var.environment
      JWT_SECRET_ARN                     = local.k8s.jwt_secret_arn
      NODE_EXTRA_CA_CERTS                = "/var/task/certs/global-bundle.pem"
      POWERTOOLS_LOGGER_LOG_EVENT        = "false"
      POWERTOOLS_TRACER_CAPTURE_RESPONSE = "false"
      POWERTOOLS_TRACER_CAPTURE_ERROR    = "false"
      }, each.key == "auth" ? {
      DB_SECRET_ARN = local.db.master_secret_arn
      DB_HOST       = local.db.database_endpoint
      DB_PORT       = tostring(local.db.database_port)
      DB_NAME       = local.db.database_name
    } : {})
  }
  depends_on = [aws_iam_role_policy.lambda]
}
resource "aws_lambda_alias" "live" {
  for_each         = local.function_types
  name             = "live"
  function_name    = aws_lambda_function.handler[each.key].function_name
  function_version = aws_lambda_function.handler[each.key].version
}
