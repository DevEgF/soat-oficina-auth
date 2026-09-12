# Registro de execução e encerramento AWS - Autenticação serverless

## Por que o serviço AWS foi encerrado

O ambiente foi criado temporariamente para integração, validação e gravação da Fase 3. Após concluir a demonstração e preservar o vídeo e as evidências, o responsável encerrou a conta AWS para evitar custos recorrentes de manter a infraestrutura ligada.

A limpeza começou somente depois da verificação do vídeo. Durante esse processo, o acesso à AWS foi bloqueado e a tela de login informou suspensão; posteriormente, o responsável confirmou que encerrou a conta. O encerramento foi informado pelo titular. Não foi possível consultar independentemente o inventário final, e este documento não afirma que todos os recursos foram individualmente destruídos ou que o saldo final foi auditado.

## Estado atual de CI/CD e acesso

- Os workflows que acessam a AWS foram desabilitados manualmente no GitHub nos quatro repositórios; os arquivos permanecem versionados como documentação executável da entrega.
- Os workflows de CI permanecem ativos para testes e validações sem deploy AWS. Nenhum workflow de nuvem deve ser reativado automaticamente por esta documentação.
- Os links de Actions abaixo são evidências históricas de execução, não endpoints ativos. O ambiente AWS foi encerrado após a demonstração e não é oferecido para acesso atual do avaliador.
- Os quatro repositórios são públicos. O acesso de escrita do usuário `soat-architecture` foi reconfirmado nos quatro, sem convite pendente.
- Código, documentação e histórico de PRs foram preservados. Não é necessário reabrir a conta apenas para ler os repositórios ou assistir ao vídeo preservado.

Uma futura implantação dependerá de decisão explícita do responsável, conta acessível, revisão de custos/permissões e novos planos Terraform. Não reaplicar planos históricos nem presumir recursos ainda existentes.

## O que foi executado

- Lambdas de autenticação e authorizer, HTTP API Gateway por ambiente e integração privada com o NLB por VPC Link foram provisionados com Terraform.
- A autenticação validou CPF, consultou existência/status do cliente no PostgreSQL e emitiu JWT de 900 segundos, sem CPF nos claims.
- Os testes reais em hml/prod confirmaram CPF inválido com 400, bloqueado/inexistente com resposta genérica 401, token válido com acesso à própria OS, outro cliente com 404 e rejeição entre ambientes com 403.
- Produção promoveu os bundles verificados de homologação. Os pipelines completos passaram após a aplicação e as fixtures estarem disponíveis.
- Canários, alarmes e dashboard CloudWatch foram provisionados. O último canário de produção registrado antes da limpeza retornou PASSED.

### Evidências públicas

- [Deploy homologação](https://github.com/DevEgF/soat-oficina-auth/actions/runs/34662143785).
- [Deploy produção concluído após nova execução do smoke](https://github.com/DevEgF/soat-oficina-auth/actions/runs/34664445948).
- [Tentativa de remoção hml](https://github.com/DevEgF/soat-oficina-auth/actions/runs/34666639872).
- [Tentativa de remoção prod](https://github.com/DevEgF/soat-oficina-auth/actions/runs/34666641077).

### Limite da remoção

A destruição foi parcial. O papel de deploy não tinha `logs:ListLogDeliveries` para excluir o estágio do Gateway com logging nem `iam:ListInstanceProfilesForRole` para excluir o papel do canário. Esses erros estão nos workflows indicados. A correção dessas permissões ainda é pendente; esta atualização altera somente documentação.

O estado final dos recursos restantes de autenticação e do VPC Link compartilhado não pôde ser consultado após o bloqueio de acesso à conta. Não interpretar a falha de destroy como falha do deploy anterior, nem declarar remoção integral.

## Registros dos quatro componentes

- [Aplicação](https://github.com/DevEgF/soat-oficina-app/blob/main/docs/delivery/encerramento-aws.md)
- [Autenticação](https://github.com/DevEgF/soat-oficina-auth/blob/main/docs/delivery/encerramento-aws.md)
- [Fundação EKS](https://github.com/DevEgF/soat-oficina-infra-k8s/blob/main/docs/delivery/encerramento-aws.md)
- [Banco RDS](https://github.com/DevEgF/soat-oficina-infra-db/blob/main/docs/delivery/encerramento-aws.md)

As datas dos workflows podem aparecer em 12/09/2026 UTC; a demonstração foi gravada em 11/09/2026 no horário de Brasília.
