data "aws_caller_identity" "current" {}

variable "enable_canary_start" {
  description = "Run the post-log-group canary start step. Disabled only by mocked Terraform tests."
  type        = bool
  default     = true
}

locals {
  canary_name   = "oficina-${var.environment}-health"
  operations    = ["CREATE", "TRACK", "QUOTE_DECISION", "TRANSITION"]
  alarm_actions = [local.k8s.alerts_topic_arn]
}

resource "aws_s3_bucket" "canary" {
  #checkov:skip=CKV2_AWS_62: Health alarms consume Synthetics metrics directly; artifact arrival notifications have no consumer.
  #checkov:skip=CKV_AWS_144: Disposable seven-day health artifacts do not require cross-region replication.
  #checkov:skip=CKV_AWS_18: This private canary-only artifacts bucket contains no application data; separate S3 access logs are outside the approved small stack.
  #checkov:skip=CKV_AWS_145: SSE-S3 is the approved artifacts encryption; there are no secrets or response bodies in artifacts.
  bucket = "${local.prefix}-canary-${data.aws_caller_identity.current.account_id}"
  # Disposable health-only artifacts are removed with an explicitly authorized destroy.
  force_destroy = true
}
resource "aws_s3_bucket_public_access_block" "canary" {
  bucket                  = aws_s3_bucket.canary.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "canary" {
  bucket = aws_s3_bucket.canary.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "canary" {
  bucket = aws_s3_bucket.canary.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_versioning" "canary" {
  bucket = aws_s3_bucket.canary.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "canary" {
  bucket = aws_s3_bucket.canary.id
  rule {
    id     = "seven-day-artifacts"
    status = "Enabled"
    filter {}
    expiration { days = 7 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
  depends_on = [aws_s3_bucket_versioning.canary]
}
resource "aws_s3_bucket_policy" "canary" {
  bucket = aws_s3_bucket.canary.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Sid       = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.canary.arn, "${aws_s3_bucket.canary.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_iam_role" "canary" {
  name = "${local.prefix}-canary"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_role_policy" "canary" {
  name = "health-artifacts-and-telemetry"
  role = aws_iam_role.canary.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${aws_s3_bucket.canary.arn}/*" },
    { Effect = "Allow", Action = ["s3:GetBucketLocation"], Resource = aws_s3_bucket.canary.arn },
    { Effect = "Allow", Action = ["s3:ListAllMyBuckets"], Resource = "*" },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-${local.canary_name}-*:*" },
    { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*", Condition = { StringEquals = { "cloudwatch:namespace" = "CloudWatchSynthetics" } } },
    { Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"], Resource = "*" }
  ] })
}
resource "aws_synthetics_canary" "health" {
  name                 = local.canary_name
  artifact_s3_location = "s3://${aws_s3_bucket.canary.id}/health/"
  execution_role_arn   = aws_iam_role.canary.arn
  handler              = "health.handler"
  zip_file             = "${local.artifact_directory}/canary-${filesha256("${path.module}/canary/health.js")}.zip"
  runtime_version      = "syn-nodejs-puppeteer-17.0"
  # The provider starts an enabled canary before returning its engine ARN. Create it
  # stopped so Terraform can create the engine Lambda log group first.
  start_canary             = false
  delete_lambda            = true
  success_retention_period = 7
  failure_retention_period = 7
  schedule { expression = "rate(15 minutes)" }
  run_config {
    timeout_in_seconds    = 60
    memory_in_mb          = 960
    active_tracing        = true
    environment_variables = { API_URL = aws_apigatewayv2_api.this.api_endpoint }
  }
  artifact_config {
    s3_encryption { encryption_mode = "SSE_S3" }
  }
  depends_on = [aws_iam_role_policy.canary, aws_s3_bucket_policy.canary, aws_s3_bucket_server_side_encryption_configuration.canary, aws_apigatewayv2_stage.this]
}
resource "aws_cloudwatch_log_group" "canary" {
  #checkov:skip=CKV_AWS_158: Health metadata uses CloudWatch service-managed encryption.
  #checkov:skip=CKV_AWS_338: Seven-day retention is the approved ephemeral stack requirement.
  # The execution role cannot create this group; Terraform owns its retention.
  name              = "/aws/lambda/${split(":", aws_synthetics_canary.health.engine_arn)[6]}"
  retention_in_days = 7
}
resource "terraform_data" "canary_start" {
  count = var.enable_canary_start ? 1 : 0

  # Re-run after a canary replacement, whose generated Lambda engine ARN changes.
  triggers_replace = aws_synthetics_canary.health.engine_arn

  provisioner "local-exec" {
    command = "node ${path.module}/canary/start.mjs"
    environment = {
      CANARY_NAME = aws_synthetics_canary.health.name
      AWS_REGION  = var.aws_region
    }
  }

  depends_on = [aws_cloudwatch_log_group.canary]
}
resource "aws_cloudwatch_metric_alarm" "health" {
  alarm_name          = "${local.prefix}-health"
  alarm_description   = "Synthetic health failed or stopped reporting"
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  dimensions          = { CanaryName = aws_synthetics_canary.health.name }
  statistic           = "Average"
  period              = 900
  evaluation_periods  = 1
  threshold           = 100
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.prefix}-api-p99"
  alarm_description   = "API p99 latency exceeds two seconds in two of three minutes"
  namespace           = "AWS/ApiGateway"
  metric_name         = "Latency"
  dimensions          = { ApiId = aws_apigatewayv2_api.this.id }
  extended_statistic  = "p99"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 2000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}
resource "aws_cloudwatch_metric_alarm" "processing_failures" {
  alarm_name          = "${local.prefix}-processing-failures"
  alarm_description   = "At least one work order operation failed"
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  metric_query {
    id          = "failures"
    expression  = "SUM(METRICS())"
    label       = "All processing failures"
    return_data = true
  }
  dynamic "metric_query" {
    for_each = { for i, operation in local.operations : "op${i}" => operation }
    content {
      id          = metric_query.key
      return_data = false
      metric {
        namespace   = "Oficina"
        metric_name = "WorkOrderProcessingFailures"
        period      = 60
        stat        = "Sum"
        dimensions  = { Environment = var.environment, ServiceName = "oficina", Operation = metric_query.value }
      }
    }
  }
}

resource "aws_cloudwatch_dashboard" "service" {
  dashboard_name = "soat-oficina-${var.environment}"
  dashboard_body = jsonencode({ start = "-PT8H", widgets = [
    { type = "alarm", x = 0, y = 0, width = 24, height = 3, properties = {
      title = "Service alarms", alarms = [aws_cloudwatch_metric_alarm.health.arn, aws_cloudwatch_metric_alarm.api_latency.arn, aws_cloudwatch_metric_alarm.processing_failures.arn]
    } },
    { type = "metric", x = 0, y = 3, width = 12, height = 6, properties = {
      title   = "API requests and errors", region = var.aws_region, period = 60, stat = "Sum",
      metrics = [for metric in ["Count", "4xx", "5xx"] : ["AWS/ApiGateway", metric, "ApiId", aws_apigatewayv2_api.this.id]]
    } },
    { type = "metric", x = 12, y = 3, width = 12, height = 6, properties = {
      title   = "API latency percentiles", region = var.aws_region, period = 60,
      metrics = [for stat in ["p50", "p95", "p99"] : ["AWS/ApiGateway", "Latency", "ApiId", aws_apigatewayv2_api.this.id, { stat = stat }]]
    } },
    { type = "metric", x = 0, y = 9, width = 12, height = 6, properties = {
      title   = "Lambda errors and throttles", region = var.aws_region, period = 60, stat = "Sum",
      metrics = flatten([for name in local.function_types : [for metric in ["Errors", "Throttles"] : { row = ["AWS/Lambda", metric, "FunctionName", aws_lambda_function.handler[name].function_name] }]])[*].row
    } },
    { type = "metric", x = 12, y = 9, width = 12, height = 6, properties = {
      title   = "Lambda duration p99", region = var.aws_region, period = 60, stat = "p99",
      metrics = [for name in local.function_types : ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.handler[name].function_name]]
    } },
    { type = "metric", x = 0, y = 15, width = 12, height = 6, properties = {
      title   = "Work orders created", region = var.aws_region, period = 60, stat = "Sum",
      metrics = [["Oficina", "WorkOrdersCreated", "Environment", var.environment, "ServiceName", "oficina"]]
    } },
    { type = "metric", x = 12, y = 15, width = 12, height = 6, properties = {
      title   = "Processing failures by operation", region = var.aws_region, period = 60, stat = "Sum",
      metrics = [for op in local.operations : ["Oficina", "WorkOrderProcessingFailures", "Environment", var.environment, "ServiceName", "oficina", "Operation", op]]
    } },
    { type = "metric", x = 0, y = 21, width = 12, height = 6, properties = {
      title   = "Work order stage duration (ms)", region = var.aws_region, period = 60, stat = "Average",
      metrics = [for status in ["DIAGNOSIS", "APPROVAL", "EXECUTION"] : ["Oficina", "WorkOrderStageDurationMs", "Environment", var.environment, "ServiceName", "oficina", "Status", status]]
    } },
    { type = "metric", x = 12, y = 21, width = 12, height = 6, properties = {
      title   = "Synthetic availability", region = var.aws_region, period = 900, stat = "Average",
      metrics = [["CloudWatchSynthetics", "SuccessPercent", "CanaryName", aws_synthetics_canary.health.name]]
    } },
    { type = "log", x = 0, y = 27, width = 24, height = 6, properties = {
      title = "Correlated errors", region = var.aws_region, view = "table",
      query = "SOURCE '${aws_cloudwatch_log_group.api.name}' | SOURCE '${aws_cloudwatch_log_group.lambda["auth"].name}' | SOURCE '${aws_cloudwatch_log_group.lambda["authorizer"].name}' | fields @timestamp, requestId, environment, operation, eventName, coalesce(statusCode, status) as responseCode | filter level = 'ERROR' or responseCode >= 500 | sort @timestamp desc | limit 50"
    } }
  ] })
}
