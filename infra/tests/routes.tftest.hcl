mock_provider "aws" {
  mock_resource "aws_synthetics_canary" { defaults = { engine_arn = "arn:aws:lambda:us-east-1:111122223333:function:cwsyn-oficina-hml-health-test" } }
  mock_data "aws_caller_identity" { defaults = { account_id = "111122223333" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::111122223333:role/soat-oficina-auth-test" } }
  mock_resource "aws_cloudwatch_log_group" { defaults = { arn = "arn:aws:logs:us-east-1:111122223333:log-group:oficina-test" } }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn     = "arn:aws:lambda:us-east-1:111122223333:function:oficina-test"
      version = "1"
    }
  }
  mock_resource "aws_lambda_alias" {
    defaults = {
      arn        = "arn:aws:lambda:us-east-1:111122223333:function:oficina-test:live"
      invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:111122223333:function:oficina-test:live/invocations"
    }
  }
  mock_resource "aws_apigatewayv2_api" { defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111122223333:abc123" } }
}

override_data {
  target = data.terraform_remote_state.k8s
  values = {
    outputs = {
      private_subnet_ids       = ["subnet-11111111", "subnet-22222222"]
      lambda_security_group_id = "sg-11111111"
      jwt_secret_arn           = "arn:aws:secretsmanager:us-east-1:111122223333:secret:soat-oficina/shared/jwt-test"
      hml_listener_arn         = "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/net/hml/1111/2222"
      prod_listener_arn        = "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/net/prod/3333/4444"
      alerts_topic_arn         = "arn:aws:sns:us-east-1:111122223333:soat-oficina-alerts"
    }
  }
}
override_data {
  target = data.terraform_remote_state.db
  values = {
    outputs = {
      database_endpoint    = "soat-oficina-db.example.us-east-1.rds.amazonaws.com"
      database_port        = 5432
      database_name        = "oficina"
      master_secret_arn    = "arn:aws:secretsmanager:us-east-1:111122223333:secret:rds!db-example"
      database_kms_key_arn = "arn:aws:kms:us-east-1:111122223333:key/11111111-2222-3333-4444-555555555555"
    }
  }
}
override_data {
  target = data.terraform_remote_state.shared
  values = { outputs = { vpc_link_id = "test-link" } }
}

run "hml_routes_and_isolation" {
  command = plan
  variables {
    state_bucket = "soat-oficina-test-state"
    environment  = "hml"
  }
  assert {
    condition     = aws_apigatewayv2_route.auth.route_key == "POST /auth/token" && aws_apigatewayv2_route.customer.authorization_type == "CUSTOM"
    error_message = "Token issuance must be public and customer operations must use the authorizer."
  }
  assert {
    condition     = aws_lambda_function.handler["auth"].reserved_concurrent_executions == 2 && aws_lambda_function.handler["auth"].environment[0].variables.ENVIRONMENT == "hml"
    error_message = "Concurrency and environment must remain fixed."
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.handler["authorizer"].environment[0].variables), "DB_SECRET_ARN")
    error_message = "The authorizer must not receive database configuration."
  }
  assert {
    condition     = aws_apigatewayv2_integration.app.integration_uri == "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/net/hml/1111/2222" && aws_apigatewayv2_integration.app.request_parameters["overwrite:header.X-Correlation-Id"] == "$context.requestId"
    error_message = "Private integration must select hml and preserve request correlation."
  }
}
run "prod_listener" {
  command = plan
  variables {
    state_bucket = "soat-oficina-test-state"
    environment  = "prod"
  }
  assert {
    condition     = aws_apigatewayv2_integration.app.integration_uri == "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/net/prod/3333/4444" && startswith(aws_lambda_function.handler["auth"].function_name, "soat-oficina-auth-prod-")
    error_message = "Production must not target hml functions or listener."
  }
}
run "runtime_secret_permissions" {
  command = apply
  variables {
    state_bucket = "soat-oficina-test-state"
    environment  = "hml"
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.lambda["authorizer"].policy).Statement[0].Resource == ["arn:aws:secretsmanager:us-east-1:111122223333:secret:soat-oficina/shared/jwt-test"]
    error_message = "The authorizer may read only the exact JWT secret."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.lambda["auth"].policy).Statement[4].Resource == "arn:aws:kms:us-east-1:111122223333:key/11111111-2222-3333-4444-555555555555" && jsondecode(aws_iam_role_policy.lambda["auth"].policy).Statement[4].Condition.StringEquals["kms:EncryptionContext:SecretARN"] == "arn:aws:secretsmanager:us-east-1:111122223333:secret:rds!db-example"
    error_message = "Database secret decryption must be limited to its CMK and exact encryption context."
  }
}
