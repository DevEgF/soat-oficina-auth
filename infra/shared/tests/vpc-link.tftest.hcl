mock_provider "aws" {}
override_data {
  target = data.terraform_remote_state.k8s
  values = {
    outputs = {
      private_subnet_ids       = ["subnet-11111111", "subnet-22222222"]
      lambda_security_group_id = "sg-11111111"
    }
  }
}
run "single_private_link" {
  command = plan
  variables { state_bucket = "soat-oficina-test-state" }
  assert {
    condition     = length(aws_apigatewayv2_vpc_link.shared.subnet_ids) == 2 && tolist(aws_apigatewayv2_vpc_link.shared.security_group_ids)[0] == "sg-11111111"
    error_message = "The shared VPC Link must use the two private subnets and approved Lambda security group."
  }
}
