output "api_url" { value = aws_apigatewayv2_api.this.api_endpoint }
output "hml_api_url" { value = var.environment == "hml" ? aws_apigatewayv2_api.this.api_endpoint : null }
output "prod_api_url" { value = var.environment == "prod" ? aws_apigatewayv2_api.this.api_endpoint : null }
output "api_id" { value = aws_apigatewayv2_api.this.id }
output "function_names" { value = { for key, function in aws_lambda_function.handler : key => function.function_name } }
