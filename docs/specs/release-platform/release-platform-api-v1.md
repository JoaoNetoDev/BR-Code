# API e contrato da plataforma de empacotamento do ZCode v1

- Status: Proposed
- Versão: `release-platform.v1`
- Data: 2026-08-18
- Escopo de aplicação: build worker do z-code, control plane da plataforma de empacotamento, UI de aprovação, serviço de publicação

## 1. Objetivos e não objetivos

O objetivo é transformar o z-code em um build worker substituível e fazer da plataforma de empacotamento a única fonte de estado do release candidate.

Este contrato não prescreve o uso de PostgreSQL, filas, object storage ou um framework Web específico pela plataforma; ele define apenas as fronteiras observáveis e retentáveis entre sistemas.

Não objetivos: não transformar o protocolo de autoatualização do Electron em um novo protocolo de cliente; não exigir que a primeira versão da plataforma assuma o cálculo de versão do release-it; não permitir que o worker escreva diretamente no feed estável.

## 2. Modelo de recursos

### 2.1 ReleaseCandidate

O JSON Schema completo está em [`release-candidate.v1.schema.json`](./release-candidate.v1.schema.json). Campos principais:

| Campo | Semântica |
| --- | --- |
| `candidateId` | identidade imutável do candidato gerada pela plataforma, no formato `cand_...` |
| `source` | repository, commit completo, versão SemVer e ref opcional |
| `state` | estado atual da máquina de estados da plataforma |
| `platforms` | artifact e metadados básicos de atualização por OS/arch |
| `provenance` | builder, imagem, versões de ferramentas e signer |
| `createdAt` / `expiresAt` | ciclo de retenção do candidato |

A fonte de verdade dos artefatos do candidato é o `objectKey` e o digest no object storage, e não o caminho do runner, a URL de artifact do GitLab ou um diretório compartilhado do workspace.

### 2.2 NotesDraft e Approval

As notas são versionadas independentemente da versão do artefato do candidato:

```json
{
  "candidateId": "cand_01J...",
  "revision": "sha256:...",
  "locales": {
    "zh-CN": { "markdown": "# Release ..." },
    "en-US": { "markdown": "# Release ..." }
  },
  "status": "approved",
  "approvedBy": { "userId": "u_123", "displayName": "Reviewer" },
  "approvedAt": "2026-08-18T14:00:00Z"
}
```

`approvedBy` e `approvedAt` devem ser escritos pela plataforma com base na identidade autenticada atual, e não podem confiar no que o worker declara por conta própria no corpo da requisição.

Ao modificar as notas, é obrigatório gerar um novo `revision`; a revision antiga não pode ser sobrescrita no lugar.

O cálculo de `revision` é fixo assim: primeiro normaliza-se o Markdown de cada locale para UTF-8, com quebras de linha LF e sem espaços em branco no início e no fim; depois monta-se o objeto em ordem lexicográfica de locale key; em seguida serializa-se com o RFC 8785 JSON Canonicalization Scheme; por fim calcula-se o SHA-256 hex, no formato `sha256:<64-hex>`. Assim, runtimes com idiomas diferentes não geram revisions diferentes por causa da ordem das JSON keys.

### 2.3 Publication

Uma publication é a vinculação entre o artefato do candidato e a revision das notas aprovadas:

```json
{
  "publicationId": "pub_01J...",
  "candidateId": "cand_01J...",
  "notesRevision": "sha256:...",
  "channel": "gray",
  "state": "publishing"
}
```

A plataforma gera o `latest.yml` final contendo `releaseNotesByLocale` e só avança para `published` depois de gravá-lo no caminho definitivo do objeto; não é permitido gerar um manifesto de atualização separado por locale.

## 3. Máquina de estados

```text
created -> building -> ready -> approval_pending -> approved -> publishing -> published
             |             |             |              |
             v             v             v              v
        build_failed    cancelled      rejected   publish_failed_retryable
```

Restrições de transição de estado:

| Estado atual | Transições permitidas | Disparador |
| --- | --- | --- |
| `created` | `building`, `cancelled` | platform scheduler |
| `building` | `ready`, `build_failed`, `cancelled` | build worker callback |
| `ready` | `approval_pending`, `cancelled` | platform |
| `approval_pending` | `approved`, `rejected` | approval API |
| `approved` | `publishing`, `cancelled` | platform |
| `publishing` | `published`, `publish_failed_retryable` | publisher |
| `publish_failed_retryable` | `publishing`, `cancelled` | retry API |

Requisições repetidas devem retornar o recurso atual, sem criar candidatos, tarefas de publicação ou objetos duplicados.

## 4. API

Base URL: `/v1`. Todas as respostas devem conter `requestId`; operações de escrita devem suportar `Idempotency-Key`.

### 4.1 Criar candidato de versão

```http
POST /v1/release-candidates
Idempotency-Key: <client-generated-key>
Authorization: Bearer <service-token>
Content-Type: application/json
```

Requisição:

```json
{
  "source": {
    "repository": "z-code",
    "commit": "40-to-64-char-git-sha",
    "version": "3.8.0",
    "ref": "refs/tags/v3.8.0"
  },
  "targets": [
    { "os": "macos", "arch": "arm64" },
    { "os": "macos", "arch": "x64" },
    { "os": "windows", "arch": "x64" },
    { "os": "windows", "arch": "arm64" },
    { "os": "linux", "arch": "x64" },
    { "os": "linux", "arch": "arm64" }
  ]
}
```

Retorna `201` e o `ReleaseCandidate` em caso de sucesso. Uma nova tentativa com o mesmo `Idempotency-Key` retorna o mesmo `candidateId`.

### 4.2 Criar tarefa de build

```http
POST /v1/release-candidates/{candidateId}/builds
Idempotency-Key: <candidateId>:<os>:<arch>:<attempt>
```

Requisição:

```json
{
  "platform": { "os": "windows", "arch": "x64" },
  "workerPool": "windows-signing",
  "constraints": { "signingRequired": true, "notarizationRequired": false }
}
```

Resposta `202`:

```json
{
  "buildId": "build_01J...",
  "candidateId": "cand_01J...",
  "state": "queued",
  "upload": {
    "manifestUploadUrl": "https://...",
    "artifactUploadPrefix": "candidates/cand_01J.../windows/x64/",
    "expiresAt": "2026-08-18T15:00:00Z"
  }
}
```

Os artefatos são enviados por URL pré-assinada / credencial de curto prazo, sem passar pelo application server do control plane.

### 4.3 Concluir o build

```http
POST /v1/release-candidates/{candidateId}/builds/{buildId}/complete
Idempotency-Key: <buildId>:complete
```

O corpo da requisição é o subconjunto do manifest daquela plataforma mais o provenance. Antes de aceitar, a plataforma precisa verificar:

1. Todos os `objectKey` estão sob o prefixo daquele candidate;
2. Os objetos existem, têm tamanho consistente e SHA-256/SHA-512 consistentes;
3. platform/arch batem com a requisição de build;
4. A version, o path e os digests de arquivos dos metadados básicos de atualização batem com os do artifact.

Retorna `200` em caso de sucesso, com o build como `succeeded`; em caso de falha de validação, retorna `422`, e o candidato entra em `build_failed` ou permanece em um estado retentável.

### 4.4 Enviar o rascunho das notas

```http
POST /v1/release-candidates/{candidateId}/notes
Idempotency-Key: <candidateId>:notes:<revision>
```

Requisição:

```json
{
  "revision": "sha256:<canonical-localized-notes-json>",
  "locales": {
    "zh-CN": { "markdown": "# Release ..." },
    "en-US": { "markdown": "# Release ..." }
  }
}
```

Após validar a revision, a plataforma cria o `notesDraftId` e coloca o candidato em `approval_pending`. A mesma revision é idempotente.

### 4.5 Aprovar as notas

```http
POST /v1/release-candidates/{candidateId}/approvals
Idempotency-Key: <candidateId>:approve:<revision>
If-Match: <candidate-etag>
```

Requisição:

```json
{
  "notesRevision": "sha256:...",
  "decision": "approve"
}
```

`decision` aceita `approve` ou `reject`. O aprovador é determinado pelo token autenticado; a interface de aprovação não aceita um `approvedBy` definido pelo chamador.

### 4.6 Publicação

```http
POST /v1/release-candidates/{candidateId}/publications
Idempotency-Key: <candidateId>:publish:<notesRevision>:<channel>
```

Requisição:

```json
{
  "notesRevision": "sha256:...",
  "channel": "gray"
}
```

Antes de entrar em `publishing`, a plataforma precisa confirmar: o candidato está `approved`, a revision bate, todas as plataformas alvo estão `ready` e não há publication em andamento no mesmo channel.

Retorna `202` e o `publicationId`. A geração do YAML definitivo, o upload e a chamada à release API pertencem a essa publication; em caso de falha, retorna `publish_failed_retryable`, sem regredir para uma reconstrução.

### 4.7 Consultas e retentativas

```http
GET  /v1/release-candidates/{candidateId}
GET  /v1/release-candidates/{candidateId}/events
POST /v1/release-candidates/{candidateId}/retry
```

`retry` só é permitido para `build_failed` ou `publish_failed_retryable`, e precisa produzir uma nova attempt sem modificar os digests de artifact já existentes.

## 5. Contrato de erros

Todas as respostas 4xx/5xx retornam:

```json
{
  "error": {
    "code": "ARTIFACT_DIGEST_MISMATCH",
    "message": "artifact sha256 does not match object",
    "details": { "artifactId": "art_01J..." },
    "retryable": false,
    "requestId": "req_01J..."
  }
}
```

Códigos de erro mínimos:

- `INVALID_SCHEMA`
- `CANDIDATE_NOT_FOUND`
- `INVALID_STATE_TRANSITION`
- `IDEMPOTENCY_CONFLICT`
- `ARTIFACT_NOT_FOUND`
- `ARTIFACT_DIGEST_MISMATCH`
- `UPDATE_METADATA_MISMATCH`
- `NOTES_REVISION_MISMATCH`
- `APPROVAL_REQUIRED`
- `PUBLICATION_IN_PROGRESS`
- `PUBLISH_FAILED_RETRYABLE`

## 6. Contrato de eventos

A plataforma emite para fora eventos no estilo CloudEvents 1.0; os eventos expressam apenas mudanças de estado e não carregam arquivos grandes:

```json
{
  "specversion": "1.0",
  "type": "zcode.release.candidate.state_changed.v1",
  "id": "evt_01J...",
  "source": "packaging-platform",
  "subject": "cand_01J...",
  "time": "2026-08-18T14:00:00Z",
  "data": {
    "candidateId": "cand_01J...",
    "from": "building",
    "to": "ready",
    "buildId": "build_01J..."
  }
}
```

Tipos de evento mínimos:

- `zcode.release.candidate.created.v1`
- `zcode.release.build.state_changed.v1`
- `zcode.release.notes.approval_changed.v1`
- `zcode.release.publication.state_changed.v1`

Os consumidores de evento precisam deduplicar por `id` e usar a API de consulta como fonte final de verdade.

## 7. Autenticação e segurança

- O worker usa OIDC workload identity ou service token de curto prazo; chaves de longa duração do OSS não são escritas em variáveis do GitLab.
- Os scopes da API distinguem pelo menos `candidate:create`, `build:complete`, `notes:submit`, `publish:create` e `release:promote`.
- As URLs de upload pré-assinadas precisam ter prazo de expiração, prefixo de candidate e restrição a um único objeto.
- O servidor da plataforma recalcula/ lê o digest dos objetos e não pode confiar apenas no resumo enviado pelo worker.
- Antes da publicação, mantém-se um registro de auditoria completo: solicitante, aprovador, candidateId, notes revision, publicationId e digest dos objetos.

## 8. Fronteira de migração

1. Primeiro, fazer o worker do GitLab existente gerar o manifest v1 e enviar o diretório compartilhado como objetos do candidato.
2. Introduzir o platform adapter: `create candidate -> build complete -> notes submit -> publish`.
3. A plataforma assume a aprovação e a geração do YAML final; o `release:approve` do z-code mantém apenas o caminho de compatibilidade.
4. A plataforma assume as credenciais de OSS/CDN/release API e o estado gray/stable.
5. Remover os scripts de publicação oficial internos do z-code, mantendo apenas as ferramentas locais de validação de manifest/YAML.

## 9. Casos de aceitação do contrato

- Uma nova tentativa com o mesmo `Idempotency-Key` não cria um segundo candidate/build/publication.
- Com qualquer digest de artifact errado no manifest, o build não entra em `ready`.
- Quando a notes revision não bate com o candidate, tanto a aprovação quanto a publicação retornam `NOTES_REVISION_MISMATCH`.
- Chamar publish em um candidate não aprovado retorna `APPROVAL_REQUIRED` e não grava objeto definitivo.
- Depois de uma falha de publish, o retry não reconstrói e o digest do artifact não muda.
- A entrega duplicada de eventos não provoca transições de estado duplicadas.
- O token do worker não pode chamar `release:promote`.