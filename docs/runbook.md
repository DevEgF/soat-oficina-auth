# Operations runbook

## Bootstrap and deployment order

Finish implementation and local checks before deploying. Recreate the state bucket,
foundation and database through reviewed IaC; do not reuse saved plans from the
previous teardown. Foundation must export private subnet IDs, Lambda SG, JWT secret
ARN, listener ARNs and an SNS topic that accepts CloudWatch alarm notifications.
Database must export `database_kms_key_arn`, endpoint, name, port and secret ARN.

Bootstrap hml/prod namespaces, stable application ServiceAccounts and scoped
SecretProviderClass RBAC from the foundation administrator context. For the first
installation, provision the shared VPC Link and environment API/Lambda resources
through reviewed Terraform before invoking the app deployment workflow. Publish
each resulting API URL as the app's `API_BASE_URL`, then deploy application
migrations and synthetic fixtures. Finally run the complete auth deployment/smoke
pipelines. Resource provisioning alone is not successful delivery: auth smoke is
a mandatory integration gate, and missing schemas/fixtures are failures. This
initial bootstrap ordering resolves the app's gateway-URL dependency without a
permanent smoke bypass. Environment pipelines serialize their own state; the shared
state has a separate concurrency lock.

Required GitHub Environment variables: `AWS_REGION`, `AWS_ROLE_ARN`, `TF_STATE_BUCKET`,
`SMOKE_ACTIVE_CPF`, `SMOKE_BLOCKED_CPF`, `SMOKE_UNKNOWN_CPF`, `SMOKE_OTHER_ACTIVE_CPF`,
`SMOKE_TRACKING_CODE`. Identity values must be synthetic fixtures only. The tracking
code belongs to the first active fixture; the other active fixture owns no such
order. Set `OTHER_API_URL` for cross-environment validation; it is mandatory for
prod and points to hml. Once both APIs exist, repeat hml smoke against prod as well.
Do not put live credentials or JWTs in GitHub variables or exported collections.

The Terraform runner requires Node.js, AWS CLI and `synthetics:StartCanary`; the
ordered canary helper fails the apply if startup fails. The deploy role also needs
the exact foundation/DB state reads and service lifecycle actions documented in
the foundation policies. Never widen secret access to fix an unrelated failure.

## Smoke and promotion

`node scripts/smoke.mjs` verifies malformed CPF 400, blocked/unknown identical401,
missing identity401, active token shape/claims, owned order200, foreign order404,
correlation header and cross-environment403 when the peer endpoint exists. It keeps
tokens only in process memory and emits generic diagnostics on failure. A missing
fixture stops deployment; use only the fixture bootstrap supplied by the app.

Only a successful hml deployment uploads `auth-bundle-SHA`. Production looks through
successful hml runs, selects an ancestor with identical runtime/build/canary source,
compiler configuration and delivery workflows,
downloads that bundle and verifies every ZIP hash against its manifest. Missing,
modified or unrelated artifacts fail closed. Rebuild in hml if the artifact has
expired. Keep normal branch protection and required checks enabled.

## Failures and teardown

Use request IDs to correlate Gateway, Lambda and Spring logs. Never paste token or
request bodies into diagnostics. Check API integration health, schema/fixture
availability and Lambda dependency metrics; no-token401 and authorizer403 are
different expected failure classes.

The manual destroy workflow requires `DESTROY-soat-oficina-auth` before obtaining
AWS credentials, then saves and applies the selected environment's destroy plan.
The manual confirmation also authorizes deletion of all versions in this
environment's disposable health-artifacts bucket. Terraform uses `force_destroy`
for that bucket only, preventing leftover canary objects from blocking teardown.
The execution role's object-deletion permissions cover only that exact bucket.

Destroy both environments before destroying `infra/shared`, then app, DB and
foundation in dependency order. The environment workflow never destroys the shared
VPC Link. The state bucket and any final DB snapshots have independent lifecycles;
include them in the authorized cost cleanup. Do not cancel scheduled KMS deletions.
