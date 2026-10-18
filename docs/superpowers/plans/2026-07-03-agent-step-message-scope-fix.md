# Plano de Implementação do Agent Step Message Scope Fix

> Status (2026-07-15): implementado; este documento é mantido como o plano de correção histórico. O contrato atual de telemetry é definido por
> `docs/monitoring/business-monitoring.md`, `docs/monitoring/performance-telemetry-catalog.md`
> e `packages/ui/src/lib/messageTelemetry.ts`; o antigo caminho de chamada do `useZCodeChat` descrito abaixo serve apenas para rastreabilidade.

> **Para agentes workers:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer com que as contagens de steps e ferramentas do `message_completion` descrevam apenas o prompt ativo, em vez de todo o histórico da task.

**Arquitetura:** Acumular métricas de steps finalizadas em `PromptTelemetryState`, usando o mesmo caminho `finalizeAgentStep()` que emite `agent_step`. Manter o `loop_index` no `AgentStepTelemetryState` de reset por prompt já existente, e remover `taskMessages` da finalização de completion e dos seus chamadores.

**Stack Técnico:** TypeScript, Vitest, WebdriverIO/Electron E2E.

---

### Tarefa 1: Fixar o contrato de escopo por mensagem em testes unitários

**Arquivos:**
- Modificar: `packages/ui/test/messageTelemetry.test.ts`

- [x] **Passo 1:** Adicionar um teste de dois prompts em uma mesma task. Finalizar um step de geração em cada prompt passando as mensagens de assistant históricas para a API antiga, e então afirmar que o segundo completion reporta `agent_step_cnt="1"` e que o step emitido tem `loop_index="1"`.
- [x] **Passo 2:** Adicionar um teste de ferramentas do prompt atual que finaliza um step de ferramenta com sucesso e um com falha, e então afirmar `tool_call_total="2"`, `tool_call_failed="1"` e o fallback do primeiro erro de ferramenta.
- [x] **Passo 3:** Executar `pnpm vitest run packages/ui/test/messageTelemetry.test.ts` e confirmar que a nova asserção de escopo por mensagem falha contra a varredura histórica.

### Tarefa 2: Acumular métricas de completion no ciclo de vida do prompt

**Arquivos:**
- Modificar: `packages/ui/src/lib/messageTelemetry.ts`

- [x] **Passo 1:** Adicionar no estado o contador de steps finalizados em nível de prompt, a contagem de ferramentas, a contagem de ferramentas com falha e o estado do primeiro erro de ferramenta, inicializados por `queuePromptTelemetry()`.
- [x] **Passo 2:** Atualizar `finalizeAgentStep()` para incrementar esses campos exatamente uma vez para cada step emitido.
- [x] **Passo 3:** Fazer `finalizePromptTelemetry()` ler os contadores do prompt e remover `countAgentSteps()`, `collectToolCallCompletionMetrics()`, `TaskChatMessage` e `FinalizePromptTelemetryInput.taskMessages`.
- [x] **Passo 4:** Executar o arquivo Vitest focado e confirmar GREEN.

### Tarefa 3: Simplificar os chamadores de completion e atualizar o contrato de monitoramento

**Arquivos:**
- Modificar: `packages/ui/src/hooks/useZCodeChat.ts`
- Modificar: `packages/ui/src/lib/zcodeTaskRuntimeMonitor.ts`
- Modificar: `docs/monitoring/business-monitoring.md`
- Modificar: `docs/monitoring/performance-telemetry-catalog.md`

- [x] **Passo 1:** Remover as leituras do message store e os argumentos `taskMessages` usados apenas pela telemetria de completion.
- [x] **Passo 2:** Documentar o acúmulo de steps/ferramentas no ciclo de vida do prompt e a igualdade entre `agent_step_cnt` e os steps emitidos da mesma mensagem.
- [x] **Passo 3:** Executar os testes unitários focados e o typecheck do E2E de desktop.

### Tarefa 4: Verificar a correção de produção

**Arquivos:**
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modificar: `docs/superpowers/specs/2026-07-02-agent-step-message-scope-e2e-design.md`

- [x] **Passo 1:** Executar o E2E formal de escopo por mensagem com seu fixture de replay local ao caso e confirmar que a antiga asserção RED passa.
- [x] **Passo 2:** Alterar R01 de `failing` para `covered` e registrar a evidência GREEN.
- [x] **Passo 3:** Executar `pnpm typecheck`, `pnpm lint`, os testes unitários focados, `git diff --check` e inspecionar o diff final.
- [x] **Passo 4:** Fazer commit com uma mensagem no formato Conventional Commit.