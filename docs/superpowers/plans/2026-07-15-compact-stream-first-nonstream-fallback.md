# Plano de implementação Compact Stream-first → Non-stream Fallback

## Objetivo e limites congelados

Objetivo: ajustar apenas o transporte do compact summary para:

```text
uma tentativa lógica de compact
├─ streamText(compactRequest)
│  ├─ finish → summary agregado oculto
│  ├─ 404 no request setup, ou falha elegível antes do commit do response body
│  │  └─ generateText(o mesmo compactRequest semanticamente idêntico)
│  └─ outras falhas de request setup / pós-commit → lançadas como estão
└─ seguir para a validação de summary, timeline e persistence já existentes
```

Congelado e sem alterações:

- compact prompt, tools, thinking, selection, preserved tail e boundary;
- ciclos de vida manual / auto / reactive e no máximo 3 tentativas lógicas no auto;
- contagem de retry de SSE/HTTP do adapter, backoff e idle timeout;
- streaming, eager tool-call e estratégia de recuperação do main turn comum;
- protocol, UI, desktop continuous, web-remote replayable;
- cache-sharing fork, summarizer independente e compact model fixo.

Contrato de design atual:

- `docs/superpowers/specs/2026-07-15-compact-stream-first-nonstream-fallback-design.md`

Os documentos históricos de spec/plan do Responses JSON mantêm apenas a nota superseded no topo; o corpo preserva os
fatos de 2026-07-11 e não é misturado com o contrato atual.

## Phase 0: Congelar a linha de base

### Checklist

- [x] Confirmar que o caminho alvo é streaming-first, podendo cair para non-stream após falha terminal pré-commit.
- [x] Confirmar que, antes das mudanças no ZCode, a entrada de compact chamava `generateText()` diretamente.
- [x] Distinguir a tentativa lógica de compact da requisição SSE/HTTP física do provider.
- [x] Esclarecer que cache-sharing fork e fallback de transporte são dois conceitos independentes, e que o primeiro não é
      implementado nesta rodada.

### Aceitação

```bash
git status --short --branch
```

## Phase 1: Contrato spec-first e E2E de sessão

### Arquivos

- criar o spec atual e este plan;
- atualizar:
  - `docs/conversation-session-case-catalog.md`
  - `docs/conversation-session-ui-testid-contract.md`
  - `docs/superpowers/plans/2026-07-11-openai-responses-nonstream-json-compat.md`
  - `docs/superpowers/specs/2026-07-11-openai-responses-nonstream-json-compat-design.md`
  - `docs/testing/conversation-session-e2e-coverage-matrix.md`
  - `docs/testing/conversation-session-decision-e2e-roadmap.md`
  - `docs/testing/conversation-session-decision-workflow-board.md`
  - `docs/testing/conversation-session-compact-decision-worksheet.md`
  - `docs/testing/conversation-session-e2e-plan.md`
  - `docs/testing/conversation-session-environment-fault-catalog.md`
  - `docs/testing/conversation-session-fault-e2e-coverage-matrix.md`

### Checklist

- [x] Separar a formulação da contagem de requisições de compact em "tentativa lógica / pernas físicas de transporte".
- [x] Registrar em F08 os dois caminhos representativos: stream success e stream failure → HTTP success.
- [x] Em F09/C01, atualizar apenas a premissa de transporte, sem mudar o estado terminal de falha do produto.
- [x] Registrar a poda: não fazer o produto cartesiano de provider × trigger × error.
- [x] Manter P32 cache-sharing/direct-summarizer como postponed.
- [x] Nos documentos históricos de Responses, adicionar apenas a nota superseded, sem reescrever o corpo histórico.

### Aceitação

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
```

Se for bloqueado pelo backlog preexistente de catalog/generated-doc do repositório, registrar o erro original e confirmar
que os novos casos desta rodada não introduziram novos erros de auditoria.

## Phase 2: Helper de transporte de compact no Core

### Arquivos

- `apps/zcode-cli/packages/core/src/runtime/methods/compact-summary-model-request.ts`
- `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- `apps/zcode-cli/packages/core/tests/compact-summary-model-request.test.ts`
- `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
- `apps/zcode-cli/packages/core/tests/media-budget.test.ts`

### Checklist

- [x] A requisição de compact é construída uma única vez, e stream e fallback reaproveitam a mesma entrada semântica.
- [x] O agregador oculto apenas confirma text block que passou pelo fim de texto, tool calls, usage, finish reason e
      metadata de provider do topo; reasoning mantém apenas o estado de delta/commit.
- [x] Não criar nem persistir `ModelStreaming` de compact.
- [x] Delta parcial pode ser descartado; quando há provenance de raw message-block, validar primeiro a matriz de block
      start do mesmo índice e de tipo de delta, e então deixar o commit a cargo do `content_block_stop` do provider; sem
      esse provenance, usar o block end normalizado para inferir.
- [x] abort, context exceeded e media too large são devolvidos às rotas de recuperação especializadas já existentes.
- [x] O finish normal com block já confirmado ou com stop reason truthy final do provider é devolvido à validação de
      compact já existente; SSE vazio, response start ausente, ausência de block e de stop reason obrigam o fallback.
- [x] O fallback registra um único warn de baixa frequência.
- [x] O request setup pode antes reaproveitar o retry de adapter/API já existente e, após esgotá-lo, apenas um HTTP 404
      real entra no fallback; setup síncrono, erros determinísticos de configuração/modelo/requisição e outros
      HTTP 4xx/5xx são lançados como estão, o logical status do corpo SSE não se passa por setup status, e um 404 real
      também não é sobreposto pelo logical status.
- [x] Convergir o estado do collector: um único resultado de finish opcional no lugar de `finishSeen + finishReason padrão
      + usage padrão`.
- [x] Ler o trace da requisição de compact obrigatória, removendo parâmetros duplicados, verificações de runtime
      redundantes de `streamText` e type casts.
- [x] Remover os testes duplicados entre a camada de core e os casos de malformed-input do adapter.

### Aceitação

```bash
pnpm --filter @zcode/core exec vitest run \
  tests/compact-summary-model-request.test.ts \
  tests/runtime-compact.test.ts \
  tests/media-budget.test.ts \
  tests/compact-policy.test.ts
```

## Phase 3: Dupla fronteira de provider-event e content-block no Adapter

### Arquivos

- `apps/zcode-cli/packages/contracts/src/model/index.ts`
- `apps/zcode-cli/packages/adapters/src/model/streaming-tool-call-assembler.ts`
- `apps/zcode-cli/packages/adapters/src/model/runner-stream.ts`
- `apps/zcode-cli/packages/adapters/tests/runner.test.ts`

### Checklist

- [x] Em compact e afins, o tool call só é publicado no fim do input; o commit de providers message-block reconhece
      apenas o raw `content_block_stop`, e a main request comum permanece eager.
- [x] O retry de SSE existente antes do `start` sintético do AI SDK é preservado; internamente, compact observa os raw
      provider events do SDK (excluindo `ping`), cobrindo o `message_start` engolido pelo SDK; após o primeiro event real,
      o retry de SSE é interrompido e a decisão de HTTP fallback é delegada ao Core.
- [x] Usar o iterator para distinguir request setup / response body por meio de estado, status real de response, chunk de
      erro do fullStream, content type do event stream e fronteira do provider; o status de transporte real tem
      precedência sobre o header e sobre o logical status. O setup preserva o retry de API já existente; erros de
      protocolo/business em SSE com HTTP 200 não fazem mais inner SSE retry, mantendo apenas stale/watchdog antes do
      primeiro event, e o cancelamento do caller tem precedência.
- [x] Sem raw provenance, o block end de text/reasoning vazio do compact também é tratado como block concluído: encerra
      o retry de SSE e proíbe o HTTP fallback; o caminho raw de Anthropic Messages continua reconhecendo apenas o
      `content_block_stop` correspondente, e o comportamento da main request comum não muda.
- [x] Delta de JSON completo que sofre corte/EOF antes do fim real não sintetiza um commit falso.
- [x] O adapter projeta como fronteiras semânticas exclusivas de compact o raw response start, o content block
      start/delta/stop com index/type, e cada stop reason; orphan/mismatch não confirma nem desfaz commits já existentes,
      um `null` posterior limpa um estado truthy anterior, e end/finish sintéticos do AI SDK não se passam por commit do
      provider.
- [x] raw start/delta/stop inválidos são lançados imediatamente no ponto de observação do Core; após unificar o cleanup
      do iterator, o patch de estado de "continuar drenando" não é mais mantido.
- [x] Falha de validação de name/input de um tool call direto do provider primeiro confirma o commit comprovável e
      interrompe o retry de SSE, e só então propaga o erro.
- [x] O iterator manual com opt-in de compact aborta uniformemente a tentativa física atual em todos os caminhos de EOF
      não natural, faz um best-effort `return()` e completa o estado terminal cancelled quando o consumer fecha
      antecipadamente, sem acumular ramos de limpeza distintos para direct tool/retry/error; o fechamento do consumer da
      main comum mantém o ciclo de vida existente.
- [x] Um finish limpo não confirma delta pendente que não passou pelo fim de texto; blocos de cauda não fechados após um
      block concluído não contaminam o summary.
- [x] Malformed input já confirmado não deixa o erro de normalização disparar primeiro o replay HTTP.
- [x] Estreitar a enumeração de estratégia `"eager" | "input-end"` para um único
      `preserveProviderStreamBoundaries?: boolean` unidirecional, expressando de forma uniforme o primeiro provider event,
      o commit de content e o provenance do fim do input da tool.
- [x] Convergir o assembler em um flush unificado: a main mantém o fechamento best-effort, e o finish/EOF do compact não
      fabrica blocos de tool não fechados.
- [x] Os casos de adapter são organizados em três grupos de contrato — fronteira de retry, provenance de provider e
      commit de tool-call — extraindo apenas o scaffolding de runtime duplicado, sem acoplar a quantidades de casos,
      que envelhecem rápido.

### Aceitação

```bash
pnpm --filter @zcode/adapters exec vitest run \
  tests/runner.test.ts \
  tests/runner-retry.test.ts \
  tests/openai-responses-json-compat.test.ts
```

## Phase 4: Convergência dos fakes de teste e das fixtures do Desktop

### Arquivos

- `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-plan-file-compact-continuity.json`
- `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-v4-compact.json`
- `packages/desktop/test/e2e/fixtures/upstream/provider-basic.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-compact-interrupted.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-compact-manual-queue.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-edit.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-goal-interruptions.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-plan-file-compact-continuity.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-v4-compact.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-v4-edit.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-v4-rewind-compact-extended.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-v4-rewind-queue-background.json`

### Checklist

- [x] Remover o `text_end` sintético sem origem dos fakes de teste do runtime; falhas são propagadas como o erro real
      pré-commit.
- [x] Renomear o helper para `withStreamTextFromGenerateText`, deixando claro que ele migra apenas fakes antigos de
      sucesso.
- [x] "A mesma requisição de fallback" é comparada semanticamente com `toEqual`, sem acoplar a identidade do objeto.
- [x] 19 fixtures existentes de compact com sucesso passam a usar o gerador SSE `response.text` do replay server.
- [x] As fixtures de sucesso casam explicitamente com `"stream":true`.
- [x] No novo caso de fallback, o 404 e o raw body JSON non-stream são preservados, sem serem engolidos pelo shorthand e
      sem perder a evidência de transporte.
- [x] Não adicionar E2E cartesiano de provider/trigger.

### Aceitação

```bash
pnpm --dir packages/desktop e2e:fixture:check -- \
  --spec ./test/e2e/conversation-session/conversation-session-compact-stream-fallback.test.ts

pnpm --dir packages/desktop typecheck:e2e
```

## Phase 5: Caminhos representativos de Provider e Desktop

### Arquivos

- `apps/zcode-cli/e2e/compact-microcompact/README.md`
- `apps/zcode-cli/e2e/compact-microcompact/case-openai-responses-compact.mjs`
- `packages/desktop/test/e2e/conversation-session/conversation-session-compact-stream-fallback.test.ts`
- `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-compact-stream-fallback.json`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-compact-stream-fallback.json`

### Responses roteirizados

```text
setup main stream success
→ compact stream:true / deterministic 404
→ compact non-stream / missing-field JSON success
→ post-compact main stream success with summary
```

- [x] As duas main requests afirmam `stream:true` diretamente pelo marker.
- [x] O compact tem exatamente duas pernas, stream → non-stream, com entrada semântica idêntica.
- [x] Um `ModelRequest` de compact, um `ModelComplete` e zero `ModelStreaming` de compact.
- [x] A request pós-compact traz o marker de fallback summary.

### Desktop SF

- [x] O case catalog e a coverage matrix registram `SF` primeiro.
- [x] A fixture local do caso casa explicitamente com a primeira perna stream e com a perna de fallback non-stream.
- [x] A spec oficial afirma duas requisições ao provider, a última perna 2xx non-stream e o marker success final.
- [x] O compact v4 existente continua provando o stream success normal.

### Aceitação

```bash
pnpm --dir apps/zcode-cli build
pnpm --filter zcode-cli exec tsx \
  ../../apps/zcode-cli/e2e/compact-microcompact/run.mjs \
  --case=openai-responses-compact --keep-tmp

pnpm --dir packages/desktop test:e2e:serial -- \
  --spec ./test/e2e/conversation-session/conversation-session-compact-stream-fallback.test.ts
```

## Phase 6: Regressão completa e Gates mecânicos

### Checklist

- [x] Todos os testes alvo de Core/Adapter passaram.
- [x] CLI typecheck 20/20, build 13/13.
- [x] Fixture check do Desktop, `typecheck:e2e` e a regressão oficial de compact passaram.
- [x] `pnpm typecheck` da raiz passou.
- [x] `pnpm lint` da raiz com 0 erro; os warnings preexistentes foram registrados como estão.
- [x] Se o lint completo da CLI continuar bloqueado pela dívida preexistente de `max-lines`, registrar o limite e
      verificar que os arquivos alvo desta rodada não têm erros novos.
- [x] `git diff --check` passou.
- [x] O diff final contém apenas o transporte de compact, o spec/E2E necessários e a refatoração convergente desta
      rodada.

### Comandos

```bash
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli build
pnpm --dir apps/zcode-cli lint

pnpm --dir packages/desktop typecheck:e2e
pnpm typecheck
pnpm lint

git diff --check
git status --short
```

## Phase 7: Entrega

### Checklist

- [x] Resumir os pontos de convergência no código de produção, os limites de segurança preservados e o ruído de
      testes/fixtures removido.
- [x] Reportar os resultados reais de teste, sem repetir caminhos de artifact obsoletos.
- [x] Não fazer stage, commit ou push automaticamente.
- [x] Somente quando o usuário pedir explicitamente o commit mais tarde, fazer stage preciso conforme o
      `git diff --name-only` final e usar Conventional Commit.

### Migrações de teste subsequentes já registradas

Arquivos realmente migrados nesta rodada:

- `packages/desktop/test/e2e/helpers/v4-conversation.ts`
- `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-auto-compact.test.ts`

A atualização documental desta rodada confirma que as specs `manual-review/pending` a seguir ainda afirmam non-stream de
forma fixa; até que a migração das asserções stream-first e a reexecução sejam concluídas em uma rodada de código
posterior, elas não entram na cobertura de transporte nem na admissão de promoção:

- [ ] `conversation-session-compact.test.ts`
- [x] `conversation-session-model-switch-auto-compact.test.ts`: helper do V4 e asserções de streaming success já
      migrados; na execução real, N06 (no-op saudável) passou, e N05 (confirm/cancel) falhou antes da requisição de
      compact por falta do diálogo de guarda, sendo mantido como failing probe de semântica de produto.
- [ ] `conversation-session-model-switch-compact.test.ts`

Essas migrações não alteram a implementação de produção atual nem as evidências oficiais de SF/v4 compact; corrigem
apenas o contrato de teste desatualizado do próprio caso pending. A lacuna de produto N05 não está no escopo desta
mudança stream-first e não foi implementada nem afrouxada por conveniência.

## Critério estável de aceitação

| Camada    | O que precisa provar                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Core      | stream success; fallback por SSE vazio/orphan/falha elegível no body/HTTP 404 no setup; sem fallback em outros casos de setup, pós-commit, abort/context/media; fluxo oculto não vai para a sessão |
| Adapter   | compact observa raw event não-ping e projeta response-start/block-start-stop/stop-reason; distingue setup/body por status de transporte rígido; setup preserva o retry de API existente, e o stream interno só faz retry de stale/watchdog antes do primeiro event, com o cancelamento tendo precedência; tool direto confirma o commit antes; a main eager não muda |
| Responses | `stream:true / failure → non-stream / success`, e JSON sem campo continua compatível                              |
| Desktop   | tanto o compact normal em stream quanto o compact com fallback chegam ao marker success, sem regressão na seleção de modelo e na main request |
| Static    | testes de core/adapters, typecheck de CLI/root, lint da raiz, fixture/typecheck:e2e e diff check                           |

Definição de conclusão: implementar apenas compact stream-first → non-stream fallback; nenhum cache-sharing fork,
framework de estratégia de transporte genérico, fallback de main request, estado de UI/protocol ou capacidade extra de
retry foi introduzido.