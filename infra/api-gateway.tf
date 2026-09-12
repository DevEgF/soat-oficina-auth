resource "aws_apigatewayv2_api" "this" {
  name          = local.prefix
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = var.cors_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type", "X-Correlation-Id"]
    max_age       = 300
  }
}
resource "aws_cloudwatch_log_group" "api" {
  #checkov:skip=CKV_AWS_158: The approved ephemeral stack uses CloudWatch service-managed encryption and logs only allowlisted request metadata.
  #checkov:skip=CKV_AWS_338: Seven-day retention is the approved cost and data-minimization requirement for this academic environment.
  name              = "/aws/apigateway/${local.prefix}"
  retention_in_days = 7
}
resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId         = "$context.requestId", routeKey = "$context.routeKey", status = "$context.status",
      integrationStatus = "$context.integration.status", responseLatency = "$context.responseLatency"
    })
  }
  default_route_settings {
    detailed_metrics_enabled = true
    throttling_rate_limit    = 50
    throttling_burst_limit   = 100
  }
  route_settings {
    route_key                = "POST /auth/token"
    detailed_metrics_enabled = true
    throttling_rate_limit    = 5
    throttling_burst_limit   = 10
  }
  depends_on = [aws_apigatewayv2_route.auth]
}
resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_alias.live["auth"].invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 6000
}
resource "aws_apigatewayv2_integration" "app" {
  api_id                 = aws_apigatewayv2_api.this.id
  connection_type        = "VPC_LINK"
  connection_id          = data.terraform_remote_state.shared.outputs.vpc_link_id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = var.environment == "hml" ? local.k8s.hml_listener_arn : local.k8s.prod_listener_arn
  payload_format_version = "1.0"
  timeout_milliseconds   = 10000
  request_parameters = {
    "overwrite:path"                    = "$request.path"
    "overwrite:header.X-Correlation-Id" = "$context.requestId"
  }
}
resource "aws_apigatewayv2_authorizer" "customer" {
  api_id                            = aws_apigatewayv2_api.this.id
  name                              = "customer-jwt"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_alias.live["authorizer"].invoke_arn
  identity_sources                  = ["$request.header.Authorization"]
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  authorizer_result_ttl_in_seconds  = 0
}
resource "aws_apigatewayv2_route" "auth" {
  #checkov:skip=CKV_AWS_309: This is the public credential-exchange route; Lambda validates CPF/status and the stage throttles requests.
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "POST /auth/token"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.auth.id}"
}
resource "aws_apigatewayv2_route" "customer" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "ANY /api/customer/{proxy+}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.customer.id
  target             = "integrations/${aws_apigatewayv2_integration.app.id}"
}
resource "aws_apigatewayv2_route" "spring" {
  #checkov:skip=CKV_AWS_309: Staff routes validate JWT and authorities in Spring; login, health and API documentation are intentionally public.
  for_each = toset([
    "ANY /api/admin/{proxy+}", "ANY /api/attendant/{proxy+}", "ANY /api/technician/{proxy+}", "ANY /api/warehouse/{proxy+}",
    "POST /api/public/auth/login", "GET /actuator/health", "GET /v3/api-docs", "ANY /v3/api-docs/{proxy+}", "GET /swagger-ui.html", "ANY /swagger-ui/{proxy+}"
  ])
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.app.id}"
}
resource "aws_lambda_permission" "auth" {
  statement_id  = "AllowApiTokenRoute"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handler["auth"].function_name
  qualifier     = aws_lambda_alias.live["auth"].name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/POST/auth/token"
}
resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowCustomerAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handler["authorizer"].function_name
  qualifier     = aws_lambda_alias.live["authorizer"].name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.customer.id}"
}
