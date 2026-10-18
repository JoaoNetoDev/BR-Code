# Tool Runtime Perf Telemetry Implementation Plan

> Status (2026-07-15): implementado; este documento é preservado como plano de implementação histórico. O contrato estruturado atual de perf de ferramentas tem como
> referência `apps/zcode-cli/packages/contracts/src/tools/performance.ts` e o executor/handlers de ferramentas do core;
> a definição dos eventos de UI tem como referência `packages/ui/src/lib/uiPerfArmsTelemetry.ts`; os pontos de integração antigos de task-stream abaixo servem apenas para rastreabilidade.

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar campos de atribuição de performance em runtime para Bash, Write e Edit e espelhá-los na RUM de UI, sem alterar os resultados de ferramentas visíveis ao modelo.

**Arquitetura:** definir um `ToolPerformanceTelemetrySchema` compartilhado no nível de contracts, anexar `perf` opcional às saídas estruturadas de Bash/Write/Edit, incorporar a espera de permissão do nível do executor em `tool_call_result.payload.result.perf` e reportar um evento ARMS de UI por atualização terminal de ferramenta.

**Stack técnico:** TypeScript, contracts com Zod, Vitest, session events existentes do ZCode, wrapper existente de evento custom do ARMS.

---

### Tarefa 1: Documentar o escopo de perf de ferramentas em runtime

**Arquivos:**
- Modificar: `docs/superpowers/specs/2026-06-16-ui-perf-arms-telemetry-design.md`
- Modificar: `apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md`
- Criar: `docs/superpowers/plans/2026-06-25-tool-runtime-perf-telemetry.md`

- [x] **Passo 1: Atualizar as specs antes do código**

Documentar `perf` apenas como metadado estruturado, com restrições de baixa cardinalidade e de privacidade.

### Tarefa 2: Escrever testes que falham

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/write-tool-contract.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/edit-tool-contract.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/tool-executor-trace.test.ts`
- Modificar: `packages/ui/test/uiPerfArmsTelemetry.test.ts`

- [x] **Passo 1: Testar o perf de saída do handler**

Campos esperados:
- Bash: `commandRunMs`, `outputBytes`, `exitCode`, `timedOut`, `commandCategory`, `commandHash`.
- Write: `fsReadMs`, `fsWriteMs`, `fileCount`, `totalBytes`, `maxFileBytes`, `workspaceKind`.
- Edit: `fsReadMs`, `fsWriteMs`, `patchMatchMs`, `hunkCount`, `matchAttempts`, `totalBytes`.

- [x] **Passo 2: Testar a incorporação do perf no resultado do executor**

Espera-se que `ToolCallResult.payload.result.perf.permissionWaitMs` esteja presente quando a solicitação de permissão esperar antes da execução.

- [x] **Passo 3: Testar o evento ARMS de UI**

Espera-se que `reportUiToolCallDetail` emita `perf_ui_tool_call_detail` com campos higienizados.

### Tarefa 3: Implementar o perf em runtime

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/contracts/src/tools/bash.ts`
- Modificar: `apps/zcode-cli/packages/contracts/src/tools/write.ts`
- Modificar: `apps/zcode-cli/packages/contracts/src/tools/edit.ts`
- Criar: `apps/zcode-cli/packages/contracts/src/tools/performance.ts`
- Criar: `apps/zcode-cli/packages/core/src/tool/handlers/tool-perf.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/permission-flow.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/events.ts`
- Modificar: `apps/zcode-cli/packages/contracts/src/events/session.events.ts`

- [x] **Passo 1: Adicionar o schema e os campos de saída**

Adicionar `perf` opcional aos schemas de saída de Bash/Write/Edit.

- [x] **Passo 2: Medir os estágios dos handlers**

Usar `Date.now()` em torno das chamadas ao adapter e do matching de patch. Não adicionar I/O extra.

- [x] **Passo 3: Incorporar a espera de permissão**

Medir apenas o span de espera do ask/broker. O auto-allow permanece `0`/undefined.

- [x] **Passo 4: Adicionar o perf de resultado ao session event**

Definir `payload.result.perf` a partir da saída estruturada mais a espera de permissão.

### Tarefa 4: Implementar o reporte na UI

**Arquivos:**
- Modificar: `packages/ui/src/lib/uiPerfArmsTelemetry.ts`
- Modificar: `packages/ui/src/hooks/taskStreamEventHandlers.ts`
- Modificar: `packages/ui/test/uiPerfArmsTelemetry.test.ts`

- [x] **Passo 1: Adicionar o reporter `perf_ui_tool_call_detail`**

Emitir apenas campos higienizados, uma vez na atualização terminal da ferramenta.

- [x] **Passo 2: Ligar o evento de atualização da ferramenta**

Ler `event.raw.result.perf` para os status `completed/failed/denied` e reportar.

### Tarefa 5: Verificação e commit

- [x] **Passo 1: Executar os testes direcionados**

```bash
pnpm vitest run apps/zcode-cli/packages/core/tests/bash-handler.test.ts apps/zcode-cli/packages/core/tests/write-tool-contract.test.ts apps/zcode-cli/packages/core/tests/edit-tool-contract.test.ts apps/zcode-cli/packages/core/tests/tool-executor-trace.test.ts packages/ui/test/uiPerfArmsTelemetry.test.ts
```

- [x] **Passo 2: Executar as verificações obrigatórias**

```bash
pnpm typecheck
pnpm lint
```

- [x] **Passo 3: Commitar**

```bash
git add docs/superpowers/specs/2026-06-16-ui-perf-arms-telemetry-design.md apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md docs/superpowers/plans/2026-06-25-tool-runtime-perf-telemetry.md apps/zcode-cli/packages/contracts/src/tools apps/zcode-cli/packages/contracts/src/events/session.events.ts apps/zcode-cli/packages/core/src/tool packages/ui/src/lib/uiPerfArmsTelemetry.ts packages/ui/src/hooks/taskStreamEventHandlers.ts packages/ui/test/uiPerfArmsTelemetry.test.ts
git commit -m "feat: add tool runtime perf telemetry"
```