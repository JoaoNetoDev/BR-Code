# Plano de Implementação de Atribuição de Telemetry de Performance da UI

> Status (2026-07-15): já implementado; este documento é preservado como plano de implementação histórico. Os campos de evento e o critério de atribuição atuais têm como referência
> `docs/monitoring/performance-telemetry-catalog.md`, `docs/monitoring/business-monitoring.md`
> e `packages/ui/src/lib/uiPerfArmsTelemetry.ts`.

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fortalecer a telemetry de Agent/RUM do lado da UI para que os problemas de performance da 3.1.5 possam ser atribuídos à conclusão de turno, travamentos de stream e status de rede do modelo sem adicionar overhead de runtime de alta frequência.

**Arquitetura:** Reaproveitar os wrappers existentes `uiPerfArmsTelemetry.ts` e `planUsageArmsTelemetry.ts`. Adicionar um evento de baixa frequência de breakdown de turno emitido uma vez por conclusão de prompt, enriquecer o travamento de stream com o tipo de chunk e espelhar os status de rede de modelo existentes em `plan_request` com propriedades saneadas.

**Stack técnico:** TypeScript, Vitest, `IPlatformService.reportArmsCustomEvent` existente, payloads de custom event do ARMS.

---

### Tarefa 1: Documentar o escopo e as guardrails de performance

**Arquivos:**
- Modificar: `docs/superpowers/specs/2026-06-16-ui-perf-arms-telemetry-design.md`
- Criar: `docs/superpowers/plans/2026-06-25-ui-perf-telemetry-attribution.md`

- [x] **Passo 1: Atualizar a spec existente**

Documentar a lacuna de atribuição, as regras de baixo overhead, os novos nomes de evento e os campos futuros apenas de runtime.

- [x] **Passo 2: Salvar este plano de implementação**

Salvar este arquivo em `docs/superpowers/plans/`.

### Tarefa 2: Adicionar testes falhando para os payloads de UI Perf

**Arquivos:**
- Modificar: `packages/ui/test/uiPerfArmsTelemetry.test.ts`

- [x] **Passo 1: Adicionar testes antes do código de produção**

Adicionar testes para:

```ts
reportUiTurnBreakdown({
  durationMs: 9000,
  result: "success",
  model: "glm-4",
  talkId: "task-1",
  messageId: "message-1",
  ttftMs: 1200,
  waitingMs: 300,
  toolCallTotal: 2,
  toolCallFailed: 1,
  agentStepCount: 4,
  retryCount: 1,
  fileChangeCount: 3,
  generatedCodeLines: 20,
});
```

Payload esperado: `name=perf_ui_turn_breakdown`, `group=ui_perf`, `value=9000`, com propriedades numéricas arredondadas e ids de string preservados.

Adicionar um teste de travamento de stream com `chunkType: "thought"` e esperar `properties.chunk_type = "thought"`.

- [x] **Passo 2: Executar o teste direcionado e verificar a falha**

Executar:

```bash
pnpm vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts
```

Esperado: falhar porque `reportUiTurnBreakdown` e o suporte a `chunkType` ainda não existem.

### Tarefa 3: Implementar as melhorias de payload de UI Perf

**Arquivos:**
- Modificar: `packages/ui/src/lib/uiPerfArmsTelemetry.ts`
- Modificar: `packages/ui/src/hooks/taskStreamEventHandlers.ts`
- Modificar: `packages/ui/src/hooks/useZCodeChat.ts`

- [x] **Passo 1: Adicionar `UI_PERF_EVENT_TURN_BREAKDOWN` e `reportUiTurnBreakdown`**

A implementação deve:
- Emitir um evento por conclusão de prompt.
- Reaproveitar o helper async `emit()` existente.
- Arredondar valores numéricos.
- Manter indefinidos os valores opcionais ausentes.

- [x] **Passo 2: Adicionar `chunkType` ao travamento de stream**

Estender as options de `recordStreamChunkArrival()` com `chunkType?: "message" | "thought" | "unknown"` e adicionar `chunk_type` às propriedades.

- [x] **Passo 3: Passar o tipo de chunk nos pontos de chamada**

Passar `chunkType: "message"` para `agent_message_chunk` e `chunkType: "thought"` para `agent_thought_chunk`.

- [x] **Passo 4: Emitir o breakdown de turno a partir da conclusão do prompt**

Parsear os valores existentes de `completionTelemetry.eventExtraDetail` em `useZCodeChat.ts` e chamar `reportUiTurnBreakdown()` uma vez junto com `reportUiMessageComplete()`.

### Tarefa 4: Adicionar testes falhando para o espelhamento do status de rede do Plan

**Arquivos:**
- Modificar: `packages/ui/test/planUsageArmsTelemetry.test.ts` ou criá-lo, caso não exista.
- Modificar: `packages/ui/src/lib/planUsageArmsTelemetry.ts`

- [x] **Passo 1: Adicionar testes antes do código de produção**

Testar que `model_request_completed`, `model_request_failed`, `model_retry_scheduled` e `model_stream_stalled` são espelhados em `plan_request` com campos de duration/status/retry saneados.

- [x] **Passo 2: Executar o teste direcionado e verificar a falha**

Executar:

```bash
pnpm vitest run packages/ui/test/planUsageArmsTelemetry.test.ts
```

Esperado: falhar porque hoje apenas `model_request_started` é espelhado.

### Tarefa 5: Implementar o espelhamento do status de rede do Plan

**Arquivos:**
- Modificar: `packages/ui/src/lib/planUsageArmsTelemetry.ts`

- [x] **Passo 1: Renomear o helper internamente ou estendê-lo no local**

Manter o nome exportado existente `reportPlanUsageModelRequestStartedToArms()` por compatibilidade com os pontos de chamada, mas permitir que passem todos os tipos de status de modelo de `task_network_debug_status`.

- [x] **Passo 2: Incluir propriedades saneadas**

Incluir `duration_ms`, `status_code`, `delay_ms`, `idle_ms`, `timeout_ms`, `retryable`, `reason`, `transport`, `provider_kind`, `next_attempt` quando presentes. Não incluir headers nem mensagens brutas.

### Tarefa 6: Verificação e commit

**Arquivos:**
- Todos os arquivos modificados.

- [x] **Passo 1: Executar os testes direcionados**

```bash
pnpm vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts packages/ui/test/planUsageArmsTelemetry.test.ts
```

- [x] **Passo 2: Executar as verificações obrigatórias**

```bash
pnpm typecheck
pnpm lint
```

- [x] **Passo 3: Commitar**

```bash
git add docs/superpowers/specs/2026-06-16-ui-perf-arms-telemetry-design.md docs/superpowers/plans/2026-06-25-ui-perf-telemetry-attribution.md packages/ui/src/lib/uiPerfArmsTelemetry.ts packages/ui/src/lib/planUsageArmsTelemetry.ts packages/ui/src/hooks/taskStreamEventHandlers.ts packages/ui/src/hooks/useZCodeChat.ts packages/ui/test/uiPerfArmsTelemetry.test.ts packages/ui/test/planUsageArmsTelemetry.test.ts
git commit -m "feat: enrich ui perf telemetry attribution"
```
