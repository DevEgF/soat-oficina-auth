# Oficina Auth

## Implantação atual e decisões da solução

Atualizado em 13/09/2026 (horário de São Paulo). A solução opera na **Oracle Cloud Infrastructure (OCI), com K3s e PostgreSQL gerenciado no Neon**. A implementação AWS foi executada na etapa anterior e permanece versionada para rastreabilidade. A conta AWS foi encerrada pelo responsável para evitar custos recorrentes; os workflows de deploy AWS permanecem desabilitados. CI de qualidade não é sinônimo de deploy habilitado.

### Por que saímos da AWS e fomos para a Oracle?

A AWS foi escolhida pela familiaridade da equipe e integração entre API Gateway, Lambda, EKS, ECR, RDS, IAM, Secrets Manager e CloudWatch. Essa arquitetura atendia à composição da Fase 3, mas manter control plane, compute, banco e rede gerenciados consumia o orçamento acadêmico mesmo com poucas requisições. Créditos promocionais e alertas de orçamento não eliminam cobranças nem funcionam como bloqueio de gastos.

Após a demonstração AWS, a decisão foi encerrar a conta e aproveitar a VM OCI disponível, com **2 OCPUs, 12 GB de memória e arquitetura ARM64**, para manter a aplicação acessível. O K3s concentra os workloads nessa VM; o Neon mantém o banco fora dela; o New Relic recebe a observabilidade. A mudança foi motivada por continuidade e custo operacional, não por uma falha funcional do PostgreSQL, do EKS ou da AWS. Não há benchmark que demonstre superioridade da Oracle nem promessa de custo zero permanente: franquias, disponibilidade, armazenamento e tráfego dependem das contas e do consumo.

O compromisso aceito é operar um cluster de nó único, administrado pela equipe, e integrar serviços de provedores diferentes. K3s não é OKE/EKS gerenciado; o adaptador HTTP de autenticação não é Lambda/OCI Functions. O código e as evidências AWS continuam relevantes para requisitos específicos de Kubernetes gerenciado e serverless.

### RFCs e evolução das decisões

| Decisão | Histórico | Decisão em operação e consequência |
|---|---|---|
| RFC-0001: nuvem | A proposta inicial considerou GCP; a revisão aceita implementou AWS | Continuação em OCI/K3s após encerramento da conta AWS; mantém containers e contratos, assume operação do nó |
| RFC-0002: banco | PostgreSQL local; proposta Cloud SQL; implementação RDS PostgreSQL 16 | Neon PostgreSQL 16, preservando modelo relacional, JPA e Flyway |
| RFC-0003: autenticação | Proposta anterior com JWKS/OTP; implementação acadêmica CPF + JWT HS256 | Mesmo contrato no adaptador HTTP OCI; OTP e JWKS não são funcionalidades entregues |
| Ambientes | Uma infraestrutura compartilhada para reduzir custo | Namespaces e schemas hml/prod separados, sem isolamento físico nem HA entre nós |
| Segredos OCI | AWS usava Secrets Manager e identidades de workload | Exceção autorizada: arquivos protegidos na VM e Kubernetes Secrets; valores fora do Git e dos logs |
| Entrega OCI | AWS mantém seus workflows e promoção por artefato | Deploy via SSH/Helm, ARM64 por digest; registry e pipeline OCI completos ainda não foram executados |

As RFCs versionadas registram agora a continuação OCI e preservam a decisão AWS anterior em seção histórica. Consulte as [RFCs e o contexto completo da aplicação](https://github.com/DevEgF/soat-oficina-app/blob/develop/README.md#rfcs-e-documentação-de-referência).

### Por que PostgreSQL e por que Neon?

O domínio relaciona clientes, veículos, ordens de serviço, serviços, peças e reservas. Transações, chaves estrangeiras, unicidade e consultas relacionais sustentam a consistência de estoque, orçamento e andamento da OS. PostgreSQL preserva as migrations existentes, os tipos temporais, valores monetários em centavos e a integração JPA/Hibernate. Trocar para MySQL exigiria revalidar DDL e semântica temporal; SQL Server acrescentaria mudança de dialeto/licenciamento; uma base documental exigiria remodelar relações sem uma necessidade demonstrada. Essas alternativas não traziam benefício suficiente para justificar a migração de engine.

Neon foi adotado como **serviço PostgreSQL gerenciado externo**, evitando disputar memória, disco e recuperação do banco com os containers na VM pequena. O projeto `oficina` fica em Ohio (`us-east-2`), enquanto a VM OCI fica em Ashburn (`us-ashburn-1`): há dependência de internet e latência entre regiões/provedores. A conexão direta, sem pooler, usa TLS com verificação de certificado; sete migrations Flyway foram aplicadas em cada schema. O banco operacional é `neondb`, com schemas `hml` e `prod`.

Os ambientes compartilham o proprietário do banco: schemas oferecem separação lógica, **não isolamento de privilégios**. Papéis dedicados, restauração ensaiada, capacidade de conexões e política de backup/retenção precisam ser tratados antes de ampliar o uso. Não se afirma aqui que o projeto Neon foi provisionado por Terraform: o módulo IaC de banco preservado é o RDS. Credenciais S3 ou AI Gateway do Neon não substituem credenciais PostgreSQL.

### Repositórios e responsabilidades

| Repositório | Responsabilidade |
|---|---|
| [soat-oficina-app](https://github.com/DevEgF/soat-oficina-app) | Kotlin/Spring, domínio e API, frontend React, Flyway, charts AWS/OCI, smoke e telemetria de negócio |
| [soat-oficina-auth](https://github.com/DevEgF/soat-oficina-auth) | Autenticação de cliente, JWT, handlers Lambda e adaptador HTTP OCI |
| [soat-oficina-infra-k8s](https://github.com/DevEgF/soat-oficina-infra-k8s) | Fundação Terraform AWS e bootstrap da VM/K3s OCI |
| [soat-oficina-infra-db](https://github.com/DevEgF/soat-oficina-infra-db) | Terraform RDS, rede, criptografia e lifecycle do banco AWS preservado |

### Evidências, observabilidade e vídeo

- [Saúde HML](https://hml.129.213.121.122.sslip.io/actuator/health) e [saúde PROD](https://oficina.129.213.121.122.sslip.io/actuator/health): HTTPS validado com certificado Let's Encrypt; endereço gratuito baseado no IP via sslip.io.
- [Dashboard HML](https://one.newrelic.com/dashboards/detail/ODQzOTI5M3xWSVp8REFTSEJPQVJEfGRhOjEzMTY1MzA5?account=8439293) e [dashboard PROD](https://one.newrelic.com/dashboards/detail/ODQzOTI5M3xWSVp8REFTSEJPQVJEfGRhOjEzMTY1MzEw?account=8439293): negócio, API/auth e Kubernetes. São privados e exigem acesso à conta New Relic.
- [Alertas New Relic](https://one.newrelic.com/alerts?account=8439293&duration=259200000): o ensaio HML enviou 80 chamadas controladas, 40 respostas 400 e 40 respostas 401, e confirmou dois incidentes críticos. São rejeições de autenticação, não erros internos 5xx; consultar também incidentes fechados e o período de 12/09/2026, 23h15 BRT, se não estiverem ativos.
- Jornada HML verificada até OS entregue, autorização por proprietário, bloqueio de acesso administrativo por cliente e rejeição de JWT entre ambientes. Produção foi validada com saúde, login e leitura, sem criar OS de teste.
- Rollback OCI verificado com mudança de configuração Helm, preservando a OS e os mesmos digests. Não equivale a rollback de binário ou reversão de migrations.
- **Vídeo: gravado com todos os requisitos, conforme confirmação do responsável.** [Assistir à demonstração](https://drive.google.com/file/d/1OGqlACabTZnHzdbG0k2q0ttf29OQkWOF/view?usp=sharing). O link foi fornecido pelo responsável; esta atualização não afirma revisão independente do conteúdo nem da duração.

As evidências descrevem o ensaio realizado, não uma garantia de disponibilidade contínua. Não foi comprovada entrega de notificações por e-mail/Slack. A instalação OCI não inclui publicação do frontend, registry remoto ou pipeline completa de promoção OCI. Essas diferenças técnicas permanecem explícitas mesmo com o vídeo concluído.

## Arquitetura AWS preservada e verificações locais

Customer authentication and authorization for the academic Phase 3 delivery.
CPF-only authentication checks ACTIVE/BLOCKED status but does not prove identity;
OTP or another verified factor is required before a real production use case.

Node.js 22, TypeScript, Lambda and HTTP API Gateway, with private NLB integrations.
Authentication emits a 15-minute HS256 JWT derived from SHA256 of the UTF-8 secret,
with UUID subject, `iss=oficina`, `aud=oficina-api`, exact `env` and CUSTOMER scope.
JWTs contain no CPF. Unknown and blocked customers get the same 401 response.

For the current OCI deployment, see the [HTTP adapter guide](deploy/oci/README.md). The Lambda ZIP promotion and Terraform states below describe the preserved AWS path; its deploy workflows are disabled.

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
also exposes `hml_api_url`, and prod exposes `prod_api_url`. AWS endpoints are no longer advertised as active; current OCI URLs are listed above. [OpenAPI](openapi/fase3.yaml) defaults to localhost;
inject the appropriate output when calling the API.

See [architecture](docs/architecture.md) and [runbook](docs/runbook.md) for bootstrap,
fixtures, smoke tests, promotion and destruction. Complete implementation and local
validation before enabling the cloud deployment pipelines.
