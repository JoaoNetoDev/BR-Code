# Release Platform Contract

Este é o ponto de entrada do contrato v1 entre o z-code e a plataforma de empacotamento independente.

| Arquivo | Finalidade |
| --- | --- |
| [`release-candidate.v1.schema.json`](./release-candidate.v1.schema.json) | Schema de validação de máquina para versão candidata e artefatos de plataforma |
| [`release-platform.v1.openapi.yaml`](./release-platform.v1.openapi.yaml) | Descrição OpenAPI 3.1 da Control plane REST API |
| [`release-platform-api-v1.md`](./release-platform-api-v1.md) | Máquina de estados, regras de validação, erros, eventos, segurança e restrições de migração |
| [`docs/adr/0004-release-packaging-platform-contract.md`](../../adr/0004-release-packaging-platform-contract.md) | Por que a plataforma hospeda o estado da candidata e o lançamento oficial |

## O que precisa ser concluído antes da implementação do v1

1. Incluir `release-candidate.v1.schema.json` nos contract tests do servidor da plataforma e do worker.
2. Unificar a revision de notes para `sha256:<hex>` + o cálculo RFC 8785 JCS.
3. Adaptar o diretório compartilhado atual do runner ao candidate prefix de object storage; o diretório compartilhado não pode entrar na API da plataforma.
4. O servidor da plataforma precisa reler o objeto e validar tamanho, SHA-256, SHA-512 e o YAML de atualização básico.
5. A interface de publicação precisa implementar idempotência, auditoria e a retentativa `publish_failed_retryable`.

No z-code atual, `release:approve` e o diretório compartilhado do runner são caminhos compatíveis do período de migração, e não a fonte de estado final da plataforma v1; nenhum `candidate-manifest.json` adicional é gerado no repositório.