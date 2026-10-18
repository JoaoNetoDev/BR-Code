# O Release Candidate é hospedado pela plataforma de empacotamento

- Status: Proposed
- Data: 2026-08-18
- Especificação relacionada: `docs/specs/release-platform/release-platform-api-v1.md`

## Context

O build e o publish do z-code já foram separados, mas o manifest candidato, os arquivos de aprovação e os artefatos ainda dependem do diretório compartilhado do GitLab runner. Essa fronteira não pode ser consumida de forma estável por uma plataforma de empacotamento independente, nem oferece retry, auditoria, idempotência e estado multiplataforma unificados.

## Decision

Introduzir o contrato versionado `release-candidate.v1` e adopter a plataforma de empacotamento como única fonte de estado do Release Candidate:

```text
z-code worker                    Packaging Platform
build/sign/notarize              candidate state machine
upload immutable artifacts  ---> object storage + manifest
submit build result         ---> approval / publication
                                  final latest*.yml + rollout
```

O z-code worker não pode escrever diretamente no feed estável, chamar a API de release oficial nem manter credenciais OSS de longo prazo. O `latest.yml` final e único é gerado pela plataforma com base no `update.base.yml` imutável, no artifact digest e na revisão de notes já aprovada; logs multilíngue são gravados de forma unificada em `releaseNotesByLocale`.

Os contratos entre sistemas usam sempre:

- JSON Schema `release-candidate.v1`
- REST API `release-platform.v1`
- Eventos de estado no estilo CloudEvents
- `Idempotency-Key` e request ID
- OIDC / escopo de token de curto prazo

## Alternatives

### Continuar estendendo o GitLab CI

É o de menor custo de implementação, mas o estado continua preso ao runner, ao diretório compartilhado e ao YAML de CI; quando a plataforma assumir, os scripts internos precisariam ser reinterpretados, e os limites de retry e auditoria ficam pouco claros. Rejeitado.

### Enviar apenas o pacote comprimido, sem o manifest padrão

A plataforma poderia guardar o arquivo, mas não conseguiria validar de forma confiável versão, plataforma, digest, metadata base de update e provenance. Rejeitado.

### A plataforma faz apenas a aprovação e o z-code continua publicando

A experiência manual melhora pouco, o feed/API oficial continua controlado pelo worker e não é possível ter isolamento de permissões nem um estado de publicação unificado. Rejeitado.

## Consequences

Impactos positivos:

- O worker de build pode ser substituído por GitLab, Buildkite ou um runner self-hosted.
- Os artefatos candidatos podem ser publicados de forma repetível, e uma modificação de log não dispara um novo empacotamento.
- A plataforma passa a gerenciar de forma unificada aprovação, retry, auditoria e gray/stable.
- O runner não precisa mais de credenciais de longo prazo para OSS/release API oficial.

Custos e riscos:

- É preciso manter um serviço de estado candidato e o ciclo de vida do object storage.
- O contrato v1 precisa ser compatível com o CI antigo do z-code durante um período de migração.
- A plataforma deve assumir a verificação de digest, o tratamento de idempotência e a recuperação de falhas de publicação.

## Rollback

Durante a migração, manter uma flag do caminho de publicação compatível do z-code. Se a plataforma estiver indisponível, é possível voltar para a cadeia antiga de release do CI; o rollback não pode deixar os caminhos test/sandbox ultrapassar as guardas do ambiente oficial nem reutilizar uma revisão de notes não confirmada pela plataforma.