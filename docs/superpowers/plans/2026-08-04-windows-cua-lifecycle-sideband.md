# Plano de Implementação do Sideband de Ciclo de Vida do CUA no Windows

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** fazer com que o aviso superior do CUA no Windows obtenha seu estado a partir do ciclo de vida real das ferramentas do runtime do CLI, sem depender mais do antigo `session/event`, que a conversa de desktop v4 atual não envia.

**Arquitetura:** o CLI envia, adicionalmente, quando o `SessionEvent` bruto entra na projeção de protocolo, uma notificação `computer-use/operation-event` estrita, enxuta e não reprodutível; a notificação corre em paralelo ao frame de conversa v4 e fica antes do teste de `record.deliveryKind`. Os Services usam apenas essa notificação para alimentar o `CuaOperationTurnTracker` e então exibem a camada flutuante pela cadeia Host→Main `cua-operation-state` já existente; o antigo `session/event`, o Renderer, o snapshot e o relay não têm o estado do aviso.

**Stack técnico:** TypeScript 6, Zod, Vitest 4, ZCode Protocol NDJSON, Electron UtilityProcess/BrowserWindow, pnpm.

## Restrições globais

- Modificar os testes primeiro e observar a falha esperada, e só então escrever a implementação mínima; nunca alterar antes o código de produção.
- O novo protocolo App ↔ Agent precisa ser definido em `packages/shared/src/zcode-protocol/index.ts`, usando schema de runtime estrito.
- O method é fixo como `computer-use/operation-event`; a identidade oficial só aceita a forma com hífen `computer-use`, sem introduzir `computer_use`.
- A notificação carrega apenas metadados de ciclo de vida, nunca input/result de ferramenta, texto do modelo, capturas de tela ou conteúdo do usuário.
- A notificação não é afetada pelo `deliveryKind` do antigo `session/event` nem pelo estado de subscription v4, e não entra em snapshot/replayable/v4 topic/relay.
- O tracker consome apenas o `sequenceNumber` de runtime do sideband e não o mistura com o `seq` do protocolo antigo.
- O comportamento do reporter no Windows desktop-local permanece inalterado; workspace remoto/server/Web não recebem nova camada flutuante, e o shared-host do celular apenas reutiliza o Host local.
- UI, visual da camada flutuante no Desktop Main, exclusão de captura, foco e agregação em múltiplas janelas permanecem inalterados.
- Diagnósticos de ciclo de vida de alta frequência vão para `debug`; transições de estado vão para `info`; exceções no caminho secundário não podem bloquear o frame v4 nem a execução da ferramenta.
- Ao final é obrigatório executar os testes direcionados, `pnpm typecheck`, `pnpm lint`, `git diff --check` e fazer um Conventional Commit; não dar push.

---

## Estrutura de arquivos

- Modify `packages/shared/src/zcode-protocol/index.ts`: definir o method do sideband, o schema de união discriminada estrita e o tipo exportado.
- Modify `packages/shared/test/zcodeProtocol.test.ts`: validar o method, os seis tipos de payload, os campos estritos e as entradas inválidas.
- Create `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/computer-use-operation-event.ts`: projetar o `SessionEvent` de runtime no payload mínimo do sideband.
- Modify `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`: enviar o sideband em best-effort antes da bifurcação v4/legacy.
- Modify `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`: validar que envia mesmo sem `deliveryKind`, que não há payload sensível e que falha de envio não bloqueia o v4.
- Modify `packages/services/src/zcode-agent/cuaOperationTurnTracker.ts`: passar a consumir o tipo do sideband e deduplicar por `eventId`/`sequenceNumber`.
- Modify `packages/services/test/cuaOperationTurnTracker.test.ts`: migrar fixtures e todas as asserções da máquina de estados para o ciclo de vida do sideband.
- Modify `packages/services/src/zcode-agent/zcodeAgentService.ts`: adicionar o ramo de notificação do sideband e remover a condução do tracker pelo antigo `session/event`.
- Modify `packages/services/test/zcodeAgentService.test.ts`: o agente fake envia apenas sideband, validando as transições do reporter e que o fluxo comum de sessão não é afetado.
- Modify `docs/product-capability-map-office-computer-use.md`: atualizar a cadeia de estado real.
- Modify `apps/dev-docs/src/data/productCapabilityMap.ts`: atualizar a descrição de produtor/consumidor do grafo de capacidades.
- Modify `apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`: fixar a cadeia de estado do sideband.

---

### Tarefa 1: Contrato estrito de ciclo de vida App ↔ Agent

**Arquivos:**

- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Test: `packages/shared/test/zcodeProtocol.test.ts`

**Interfaces:**

- Produces: `zcodeProtocolMethods.computerUseOperationEvent === "computer-use/operation-event"`
- Produces: `zcodeComputerUseOperationEventSchema`
- Produces: `ZCodeComputerUseOperationEvent`

- [ ] **Passo 1: escrever os testes de contrato de protocolo que falham**

Importar o novo schema e afirmar a nomenclatura exata do method mais um payload válido para cada kind:

```ts
expect(zcodeProtocolMethods.computerUseOperationEvent).toBe("computer-use/operation-event");

const base = {
  eventId: "evt-1",
  sequenceNumber: 1,
  sessionId: "sess-1",
  timestamp: 1_700_000_000_000,
};

for (const event of [
  { ...base, kind: "turn-started", turnId: "turn-1" },
  { ...base, kind: "turn-completed", turnId: "turn-1" },
  { ...base, kind: "turn-failed", turnId: "turn-1" },
  {
    ...base,
    kind: "tool-scheduled",
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName: "mcp__computer-use__left_click",
  },
  {
    ...base,
    kind: "tool-started",
    turnId: "turn-1",
    toolCallId: "call-1",
  },
  { ...base, kind: "session-closed" },
]) {
  expect(zcodeComputerUseOperationEventSchema.safeParse(event).success).toBe(true);
}
```

Adicionar casos em tabela recusando ids vazios, `sequenceNumber` negativo, campos de turn/ferramenta ausentes, `toolName` em um kind incompatível, chaves desconhecidas e kinds desconhecidos.

- [ ] **Passo 2: rodar RED**

Run: `pnpm exec vitest run packages/shared/test/zcodeProtocol.test.ts`

Expected: FAIL porque as exportações de method e schema não existem.

- [ ] **Passo 3: adicionar o schema estrito mínimo**

Definir uma base estrita compartilhada e uma união discriminada:

```ts
const zcodeComputerUseOperationEventBaseSchema = z.object({
  eventId: nonEmptyString,
  sequenceNumber: z.number().int().nonnegative(),
  sessionId: nonEmptyString,
  timestamp: timestampMsSchema,
});

export const zcodeComputerUseOperationEventSchema = z.discriminatedUnion("kind", [
  ...["turn-started", "turn-completed", "turn-failed"].map((kind) =>
    zcodeComputerUseOperationEventBaseSchema
      .extend({
        kind: z.literal(kind),
        turnId: nonEmptyString,
      })
      .strict(),
  ),
  zcodeComputerUseOperationEventBaseSchema
    .extend({
      kind: z.literal("tool-scheduled"),
      turnId: nonEmptyString,
      toolCallId: nonEmptyString,
      toolName: nonEmptyString,
    })
    .strict(),
  zcodeComputerUseOperationEventBaseSchema
    .extend({
      kind: z.literal("tool-started"),
      turnId: nonEmptyString.optional(),
      toolCallId: nonEmptyString,
      toolName: nonEmptyString.optional(),
    })
    .strict(),
  zcodeComputerUseOperationEventBaseSchema
    .extend({
      kind: z.literal("session-closed"),
    })
    .strict(),
]);
```

Usar declarações explícitas de schema em vez de `.map()` se o TypeScript não conseguir preservar o tipo de tuple do Zod. Exportar o tipo inferido e adicionar a constante de method.

- [ ] **Passo 4: rodar GREEN**

Run: `pnpm exec vitest run packages/shared/test/zcodeProtocol.test.ts`

Expected: PASS com zero falhas.

---

### Tarefa 2: Sideband de Eventos do Runtime do CLI

**Arquivos:**

- Create: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/computer-use-operation-event.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Interfaces:**

- Consumes: `SessionEvent`
- Produces: `mapComputerUseOperationEvent(event): ZCodeComputerUseOperationEvent | undefined`
- Emits: `{ method: zcodeProtocolMethods.computerUseOperationEvent, params }`

- [ ] **Passo 1: escrever os testes de projeção e entrega do CLI que falham**

Adicionar um teste que constrói um record sem `deliveryKind`, passa `TurnStarted`, `ToolCallScheduled`, `ToolCallStarted`, `ToolCallResult`, `TurnComplete` e `SessionEnded` por `onSessionEvent` e afirma:

```ts
expect(notify.mock.calls.map(([message]) => message.method)).toEqual([
  "computer-use/operation-event",
  "computer-use/operation-event",
  "computer-use/operation-event",
  "computer-use/operation-event",
  "computer-use/operation-event",
]);
expect(notify.mock.calls.map(([message]) => message.params.kind)).toEqual([
  "turn-started",
  "tool-scheduled",
  "tool-started",
  "turn-completed",
  "session-closed",
]);
expect(notify.mock.calls[1]?.[0].params).not.toHaveProperty("input");
expect(notify.mock.calls[2]?.[0].params).not.toHaveProperty("result");
```

Afirmar que `v4Gateway.ingest` ainda recebe todo evento de sessão pai. Adicionar um teste separado cujo `notify` lança para um evento relevante e afirmar que `onSessionEvent` não lança e que `v4Gateway.ingest` continua rodando.

- [ ] **Passo 2: rodar RED**

Run: `pnpm --dir apps/zcode-cli exec vitest run packages/bootstrap/tests/zcode-protocol.test.ts`

Expected: FAIL porque nenhum sideband é emitido.

- [ ] **Passo 3: implementar o mapper puro**

Criar um switch sobre `SessionEventType` que copie apenas `id`, `sequenceNumber`, `sessionId`, `turnId`, `timestamp`, `toolCallId` e `toolName`. Retornar `undefined` para todos os outros eventos. Adicionar um comentário em chinês explicando a causa do bug: o caminho de desktop v4 não tem o `deliveryKind` legado, então o ciclo de vida da camada sobreposta precisa ser emitido antes desse portão.

- [ ] **Passo 4: ligar a notificação best-effort antes dos portões de projeção de protocolo**

No topo de `onSessionEvent`, antes do retorno de sessão filha e antes de `record.deliveryKind`, chamar um helper:

```ts
const operationEvent = mapComputerUseOperationEvent(event);
if (operationEvent) {
  try {
    context.notify({
      method: zcodeProtocolMethods.computerUseOperationEvent,
      params: operationEvent,
    });
  } catch (error) {
    context.logger?.warn("Computer Use operation lifecycle notification failed", {
      event: "zcode_protocol.computer_use_operation_event.failed",
      eventId: operationEvent.eventId,
      sessionId: operationEvent.sessionId,
      turnId: "turnId" in operationEvent ? operationEvent.turnId : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

O identificador de evento de log pode usar sublinhados como chave de logger, mas a identidade de method/ferramenta precisa permanecer `computer-use`. Não retornar a partir do catch.

- [ ] **Passo 5: rodar GREEN**

Run: `pnpm --dir apps/zcode-cli exec vitest run packages/bootstrap/tests/zcode-protocol.test.ts`

Expected: PASS com zero falhas.

---

### Tarefa 3: Tracker nos Services e wiring de notificação

**Arquivos:**

- Modify: `packages/services/src/zcode-agent/cuaOperationTurnTracker.ts`
- Modify: `packages/services/test/cuaOperationTurnTracker.test.ts`
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`
- Modify: `packages/services/test/zcodeAgentService.test.ts`

**Interfaces:**

- `CuaOperationTurnTracker.accept(workspace, event: ZCodeComputerUseOperationEvent): void`
- `ZCodeAgentService.wireClient` consome `zcodeProtocolMethods.computerUseOperationEvent`

- [ ] **Passo 1: migrar os testes do tracker para o novo contrato de evento**

Substituir as fixtures `ZCodeSessionEvent` por fixtures de sideband usando `kind`, `sequenceNumber` e `eventId`. Preservar todas as asserções existentes de ativação, exclusão, estado terminal, isolamento de workspace e falha do reporter. Remover a entrega de fixtures de result/error porque o sideband as omite deliberadamente; manter a asserção de que o estado permanece ativo até um terminal de turn.

Adicionar um teste explícito de id duplicado:

```ts
const started = operationEvent("tool-started", {
  turnId: "turn-1",
  toolCallId: "call-1",
  toolName: "mcp__computer-use__left_click",
});
tracker.accept(workspace, started);
tracker.accept(workspace, started);
expect(states).toHaveLength(1);
```

- [ ] **Passo 2: rodar tracker RED**

Run: `pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts`

Expected: FAIL porque `accept` ainda espera os kinds legados de `ZCodeSessionEvent`.

- [ ] **Passo 3: implementar a adaptação mínima da máquina de estados ao sideband**

Importar `ZCodeComputerUseOperationEvent`, substituir `seq` por `sequenceNumber`, adicionar um conjunto/ordem `seenEventIds` limitado e alternar sobre os novos kinds. Manter todo o casamento de ferramenta canônica existente, as ações não operacionais, o comportamento de stop, a proteção de turn aposentado, o isolamento do reporter e a limpeza de workspace. Adicionar um comentário em chinês explicando a causa do bug: por que os domínios de sequência do `session/event` legado e do sideband não podem ser misturados.

- [ ] **Passo 4: rodar tracker GREEN**

Run: `pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts`

Expected: PASS com zero falhas.

- [ ] **Passo 5: mudar o fake de integração do serviço para apenas sideband e observar RED**

Atualizar `CUA_OPERATION_LIVE_EVENT_FAKE_AGENT` para enviar notificações estritas `computer-use/operation-event` depois do ACK de subscribe já existente, mas sem enviar nenhum `session/event`. Afirmar que os estados do reporter são `[true, false]`, que payload inválido é ignorado, que `eventId` duplicado é idempotente e que os eventos de sessão legados recebidos permanecem vazios.

Run: `pnpm exec vitest run packages/services/test/zcodeAgentService.test.ts`

Expected: FAIL porque `wireClient` ignora a nova notificação.

- [ ] **Passo 6: ligar a notificação estrita e desvincular o tracker dos eventos legados**

Em `wireClient`, antes dos ramos genéricos de estado/interação:

```ts
if (message.method === zcodeProtocolMethods.computerUseOperationEvent) {
  const parsed = zcodeComputerUseOperationEventSchema.safeParse(message.params);
  if (parsed.success) {
    cuaOperationTurnTracker?.accept(workspace, parsed.data);
  } else {
    logger.warn(undefined, "丢弃无效 Computer Use operation event", {
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join("."),
      })),
      workspaceKey: resolveWorkspaceKey(workspace),
    });
  }
  return;
}
```

Remover `cuaOperationTurnTracker?.accept(workspace, normalizedEvent)` de `handleSessionEvent`. Não alterar a emissão comum de `session.event` nem o encaminhamento de frames v4.

- [ ] **Passo 7: rodar services GREEN**

Run:

```powershell
pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts packages/services/test/zcodeAgentService.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts
```

Expected: PASS com zero falhas.

---

### Tarefa 4: Verdade das capacidades e verificação completa

**Arquivos:**

- Modify: `docs/product-capability-map-office-computer-use.md`
- Modify: `apps/dev-docs/src/data/productCapabilityMap.ts`
- Modify: `apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`
- Review: todos os arquivos acima mais `docs/superpowers/specs/2026-08-04-windows-cua-operation-indicator-design.md`

**Interfaces:**

- Documenta a cadeia `CLI runtime lifecycle -> computer-use/operation-event -> desktop-local Host tracker -> cua-operation-state -> Desktop Main overlay`.

- [ ] **Passo 1: escrever a asserção do grafo de capacidades que falha**

Exigir que o texto do nó/aresta atual da experiência de Computer Use inclua `computer-use/operation-event` e a fonte do ciclo de vida do CLI em vez de `validated live session event`.

- [ ] **Passo 2: rodar RED**

Run: `pnpm exec vitest run apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`

Expected: FAIL porque a verdade das capacidades ainda nomeia a fonte antiga.

- [ ] **Passo 3: atualizar a verdade das capacidades**

Mudar apenas a redação da fonte/aresta atual; preservar que vídeo ao vivo, pausa e takeover permanecem planejados. Atualizar a cadeia ASCII do documento para:

```text
CLI runtime lifecycle
        -> computer-use/operation-event
        -> desktop-local Host turn tracker
        -> strict Host→Main cua-operation-state
        -> capture-excluded Windows BrowserWindow
```

- [ ] **Passo 4: rodar a suíte focada**

Run:

```powershell
pnpm exec vitest run packages/shared/test/zcodeProtocol.test.ts packages/services/test/cuaOperationTurnTracker.test.ts packages/services/test/zcodeAgentService.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/desktop/test/desktopHostProcess.test.ts packages/desktop/test/windowsCuaOperationIndicator.test.ts apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts
pnpm --dir apps/zcode-cli exec vitest run packages/bootstrap/tests/zcode-protocol.test.ts
```

Expected: os dois comandos passam com zero testes falhando.

- [ ] **Passo 5: rodar os portões do repositório**

Run:

```powershell
git diff --check
pnpm typecheck
pnpm lint
```

Expected: todos os comandos saem com 0. Qualquer falha introduzida por esta mudança bloqueia o commit; falhas preexistentes e não relacionadas precisam ser relatadas com evidência exata.

- [ ] **Passo 6: revisar invariantes e commitar**

Verificar:

```powershell
git status --short
git diff --stat
rg -n -- "computer_use" packages/shared/src/zcode-protocol apps/zcode-cli/packages/bootstrap/src/zcode-protocol packages/services/src/zcode-agent
```

Confirmar que nenhuma nova identidade de ferramenta/method `computer_use` foi introduzida, que `.tmp/` e arquivos de usuário não relacionados não estão preparados, e que o diff final corresponde à spec aprovada. Então commitar apenas os arquivos no escopo:

```powershell
git add -- packages/shared/src/zcode-protocol/index.ts packages/shared/test/zcodeProtocol.test.ts apps/zcode-cli/packages/bootstrap/src/zcode-protocol/computer-use-operation-event.ts apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts packages/services/src/zcode-agent/cuaOperationTurnTracker.ts packages/services/src/zcode-agent/zcodeAgentService.ts packages/services/test/cuaOperationTurnTracker.test.ts packages/services/test/zcodeAgentService.test.ts apps/dev-docs/src/data/productCapabilityMap.ts apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts docs/product-capability-map-office-computer-use.md docs/superpowers/plans/2026-08-04-windows-cua-lifecycle-sideband.md
git diff --cached --check
git commit -m "fix(cua): drive Windows indicator from runtime lifecycle"
```

Expected: um Conventional Commit, sem push.