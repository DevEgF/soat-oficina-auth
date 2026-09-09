mock_provider "aws" {
  mock_resource "aws_synthetics_canary" { defaults = { engine_arn = "arn:aws:lambda:us-east-1:111122223333:function:cwsyn-oficina-prod-health-test" } }
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

run "observability_contract" {
  command = plan
  variables {
    state_bucket = "soat-oficina-test-state"
    environment  = "prod"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.api_latency.extended_statistic == "p99" && aws_cloudwatch_metric_alarm.api_latency.threshold == 2000 && aws_cloudwatch_metric_alarm.api_latency.datapoints_to_alarm == 2 && aws_cloudwatch_metric_alarm.api_latency.evaluation_periods == 3
    error_message = "API latency must use the approved p99 2-of-3 threshold."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.processing_failures.treat_missing_data == "notBreaching" && length(aws_cloudwatch_metric_alarm.processing_failures.metric_query) == 5
    error_message = "Sparse failures must aggregate the four bounded operation dimensions."
  }
  assert {
    condition     = alltrue([for q in aws_cloudwatch_metric_alarm.processing_failures.metric_query : alltrue([for m in q.metric : m.dimensions.Environment == "prod" && m.dimensions.ServiceName == "oficina"])])
    error_message = "Business metric dimensions must exactly match the app EMF contract."
  }
  assert {
    condition     = aws_synthetics_canary.health.schedule[0].expression == "rate(15 minutes)" && aws_synthetics_canary.health.runtime_version == "syn-nodejs-puppeteer-17.0" && aws_cloudwatch_metric_alarm.health.treat_missing_data == "breaching"
    error_message = "Canary must run every 15 minutes and missing availability data must alarm."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.canary.block_public_acls && aws_s3_bucket_public_access_block.canary.block_public_policy && aws_s3_bucket_public_access_block.canary.ignore_public_acls && aws_s3_bucket_public_access_block.canary.restrict_public_buckets
    error_message = "Canary artifacts must never be public."
  }
  assert {
    condition     = aws_cloudwatch_dashboard.service.dashboard_name == "soat-oficina-prod"
    error_message = "Dashboards must remain isolated per environment."
  }
}
