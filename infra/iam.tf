resource "aws_iam_role" "lambda" {
  for_each = local.function_types
  name     = "${local.prefix}-${each.key}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy" "lambda" {
  for_each = local.function_types
  name     = "runtime"
  role     = aws_iam_role.lambda[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "ReadExactRuntimeSecrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = each.key == "auth" ? [local.k8s.jwt_secret_arn, local.db.master_secret_arn] : [local.k8s.jwt_secret_arn]
      },
      {
        Sid      = "WriteFunctionLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lambda[each.key].arn}:*"
      },
      {
        Sid      = "WriteTracing"
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*"
      },
      {
        Sid      = "ManageLambdaNetworkInterfaces"
        Effect   = "Allow"
        Action   = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DescribeSubnets", "ec2:DeleteNetworkInterface", "ec2:AssignPrivateIpAddresses", "ec2:UnassignPrivateIpAddresses"]
        Resource = "*"
      }
      ], each.key == "auth" ? [{
        Sid      = "DecryptExactDatabaseSecret"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = local.db.database_kms_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService"                  = "secretsmanager.${var.aws_region}.amazonaws.com"
            "kms:EncryptionContext:SecretARN" = local.db.master_secret_arn
          }
        }
    }] : [])
  })
}
