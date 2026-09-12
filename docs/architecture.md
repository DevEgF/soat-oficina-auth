# Architecture

`POST /auth/token` invokes the environment-specific authentication Lambda. It
normalizes CPF, queries `hml.clientes` or `prod.clientes` with parameterized SQL,
rejects missing/BLOCKED customers uniformly and signs an environment-bound JWT.
The authorizer verifies the JWT before API Gateway forwards customer traffic
through the shared VPC Link to the matching private NLB listener. Spring verifies
the JWT again and checks work-order ownership using the subject UUID.

The runtime retrieves secrets from Secrets Manager with an expiring in-memory
cache. Terraform and Lambda configuration contain ARNs and connection metadata
only. Database TLS verifies the RDS CA bundle. Auth has access to the exact DB/JWT
secrets and DB CMK; the authorizer has access only to the JWT secret.

Gateway overwrites `X-Correlation-Id` with its request ID. Auth replies with
`x-request-id`. Logs omit CPF, bearer tokens, request bodies and connection strings.
Metrics use bounded service/environment dimensions, never customer IDs.

One canary per environment checks health every 15 minutes. Terraform creates it
stopped, creates the generated Lambda log group, and then starts it through an
ordered helper. Its execution role cannot create arbitrary log groups. Artifacts
are private, encrypted and retained seven days. CloudWatch publishes alarms to the
foundation SNS topic through its customer-managed KMS key.

HTTP API simple-authorizer rejection returns 403; an absent configured identity
source returns 401. Spring directly returns 401 for invalid JWTs. This distinction
is intentional and follows [the API Gateway authorizer contract](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html).
