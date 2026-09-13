# Oficina Auth

> **Ambiente AWS encerrado após a demonstração para evitar custos recorrentes.** A implantação e os testes foram executados; os workflows AWS estão desabilitados e o CI permanece ativo. Consulte o [registro de execução, evidências e limites da remoção](docs/delivery/encerramento-aws.md). Não há endpoint AWS ativo anunciado.

Customer authentication and authorization for the academic Phase 3 delivery.
CPF-only authentication checks ACTIVE/BLOCKED status but does not prove identity;
OTP or another verified factor is required before a real production use case.

Node.js 22, TypeScript, Lambda and HTTP API Gateway, with private NLB integrations.
Authentication emits a 15-minute HS256 JWT derived from SHA256 of the UTF-8 secret,
with UUID subject, `iss=oficina`, `aud=oficina-api`, exact `env` and CUSTOMER scope.
JWTs contain no CPF. Unknown and blocked customers get the same 401 response.

## Local checks

```sh
npm ci
npm run check
terraform -chdir=infra init -backend=false
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
terraform -chdir=infra test
terraform -chdir=infra/shared init -backend=false
terraform -chdir=infra/shared test
```

The PostgreSQL timeout integration test requires `AUTH_TEST_DATABASE_URL` pointing
to a disposable local database. CI supplies a synthetic PostgreSQL service. No
AWS credentials or real secret values are required by the local tests.

## Deployment boundaries

`develop` targets hml and `main` targets prod. Required checks are `auth / node-check`,
`auth / terraform`, `auth / security`. Production downloads the exact ZIP bytes from
a successful protected hml deployment and verifies source ancestry, source equality
and manifest SHA256 hashes. A locally rebuilt ZIP cannot substitute for promotion.

State ownership: `auth/hml/terraform.tfstate`, `auth/prod/terraform.tfstate`, and
`auth/shared/terraform.tfstate` for the single shared VPC Link. The public HTTP APIs
connect privately to the NLB. They are not private API endpoints.

After deployment, use `terraform -chdir=infra output -raw api_url`; the hml state
also exposes `hml_api_url`, and prod exposes `prod_api_url`. No live URLs are
claimed before deployment. [OpenAPI](openapi/fase3.yaml) defaults to localhost;
inject the appropriate output when calling the API.

See [architecture](docs/architecture.md) and [runbook](docs/runbook.md) for bootstrap,
fixtures, smoke tests, promotion and destruction. Cloud deployment was completed and validated before account closure. AWS workflows are now disabled; see the [execution and closure record](docs/delivery/encerramento-aws.md).
