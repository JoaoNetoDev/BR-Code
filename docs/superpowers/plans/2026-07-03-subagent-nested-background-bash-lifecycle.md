# Plano de Implementação do Ciclo de Vida de Bash em Background Aninhado de Subagent

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** convergir BG06: depois que um subagent em background inicia um Bash em background internamente, a conclusão do Bash pertence ao ciclo de vida de cleanup do child runtime, não ressuscita o model loop do child já concluído e não reenvia o Agent result do parent.

**Arquitetura:** não introduzir roteamento global de owner `agentId -> task`. O ZCode já resolveu o problema de crossover de runtime via isolamento main/child do `AgentRuntime`; este plano apenas adiciona, dentro do child runtime, a política de notificação de background terminal/sealed, o tempo máximo de execução do Bash em escopo de subagent e o cleanup de cancelamento. O Agent em background do parent/main, o Bash do parent e o caminho principal de goal defer/wake permanecem como estão.

**Stack técnico:** TypeScript, `AgentRuntime`, `ToolExecutor`, `RuntimeTaskRegistry`, `ExecutionPort`, Vitest, replay E2E de conversa no desktop.

## Restrições Globais

- Atualizar spec / matrix primeiro, depois implementar o código; a semântica de BG06 precisa passar de `deferred` para o novo boundary aceito.
- Não introduzir nenhuma variável de ambiente, identificador, comentário ou texto provider-visible com nome de produto externo.
- Não implementar grafo global de owners, nem adicionar ao Bash campos de owner visíveis a parent/main apenas para roteamento; o isolamento de runtime é o boundary de roteamento.
- Não reescrever o resultado do nested Bash no Agent output do parent já concluído.
- Não enviar uma segunda Agent notification para o main.
- Não alterar o comportamento de notification wake de background Agent / Bash / Workflow em nível de parent.
- Não mudar a superfície de provider do `output-file` único do Bash; a convergência de stdout/stderr é uma exigência separada.
- Não mudar a semântica de `web-remote-replayable` no celular; este plano cobre apenas o desktop continuous / core runtime.
- Não commitar automaticamente; só executar `git commit` quando o usuário pedir explicitamente.

---

## Fatos Atuais

- O child runtime é um `AgentRuntime` independente, criado em `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`.
- O tracking de Bash em background é responsabilidade de `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`; após o terminal ele tenta enfileirar `<task-notification>`.
- A fila de comandos do runtime consome `task-notification` em `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts`, e atualmente executa diretamente um turno de `executeTurnCommand(...)`.
- O `RuntimeTaskRegistry` já consegue registrar `local_bash` / `local_agent` / `local_workflow`, mas não tem estado de owner lifecycle.
- A documentação atual de BG06 ainda está como `deferred`, e o texto ainda conserva um mal-entendido antigo: "o child runtime forma o Agent result final após consumir a notification do Bash". Este plano corrige primeiro a semântica da documentação.

## Semântica-Alvo

### Esperado

- Após o primeiro child turn do background subagent terminar, o parent Agent pode concluir e enviar ao main a única Agent `<task-notification>`.
- Se ainda houver Bash em background rodando dentro do child runtime, ele continua sendo rastreado pelo child runtime / execution adapter.
- Depois que o child runtime é sealed, o terminal de nested Bash apenas:
  - atualiza o estado terminal do `RuntimeTaskRegistry` do child;
  - grava o output artifact;
  - emite um UI session event espelhado child/parent, se o espelhamento de eventos existente suportar;
  - limpa tracker / timer / process state.
- Depois que o child runtime é sealed, o terminal de nested Bash não:
  - enfileira um model turn de `<task-notification>` do child visível ao provider;
  - dispara `executeTurnCommand(...)` do child;
  - reenvia o Agent result do parent;
  - faz o goal do main esperar pelo nested Bash.
- O Bash em background de escopo de subagent tem tempo máximo de execução; padrão `3_600_000ms`, com kill/cancel e terminal cleanup no timeout.
- Se o owner subagent for explicitamente cancelado/killed, o Bash em background ainda rodando dentro do child runtime deve ser cancelado.

### Não-objetivos

- Não fazer o subagent esperar o nested Bash terminar para então retornar ao main.
- Não fazer o resultado do nested Bash aparecer no output do parent Agent.
- Não ampliar o escopo para terminal resume / controles manuais de background não suportados.
- Não incluir Workflow em BG06; o Workflow já tem integração com o background registry, mas o output artifact completo é um item de convergência separado.

---

## Mapa de Arquivos

### Documentação

- Modify: `docs/conversation-session-case-catalog.md`
  - Atualizar BG06 de `deferred` para a nova redação accepted/pruned.
- Modify: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
  - Atualizar o boundary de Nested background e o accepted case de BG06.
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
  - Atualizar o status de cobertura de BG06.
- Create later: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-background-nested-bash.test.ts`
  - Escrito apenas na Phase 5; não promovido antes de o comportamento core estar estável.

### Runtime / Tool Executor

- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
  - Adicionar estado sealed local do runtime.
  - Passar a policy de notification e a config de timeout de Bash de subagent para `createToolExecutor(...)`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
  - Estender os tipos de campos/métodos de `AgentRuntimeInternal`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
  - Adicionar config interna de runtime: `subagents.backgroundBashMaxMs?: number`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`
  - Adicionar `sealBackgroundTaskNotifications(...)` e o helper de decisão de policy.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
  - Sealar o child runtime após o `executeTurn(...)` do child.
  - Cancelar o Bash em background ainda rodando no child runtime quando o child turn for abortado/cancelado.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
  - Instalar o novo runtime method.
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
  - Adicionar as deps `shouldEnqueueBackgroundTaskNotification` e `subagentBackgroundBashMaxMs`.
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
  - Passar as novas deps.
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
  - Verificar a notification policy antes do terminal; Bash de child sealed só faz terminal cleanup, sem marcar como notified.
  - Instalar o timer de tempo máximo para background tasks de Bash em escopo de subagent.
  - Limpar o timer em `stopTracking()`.

### Testes

- Modify: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
  - Testes de policy do core runtime.
- Modify: `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`
  - Testes de wiring do child runtime de subagent, se o harness existente couber.
- Modify or add: `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
  - Só entra na spec formal (ou na spec de BG existente) depois de passar pelo manual review.

---

## Phase 0: Spec e Matrix Primeiro

**Arquivos:**
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Consumes: a documentação atual de BG06 como `deferred`.
- Produces: o novo contrato semântico aceito de BG06, usado pelos testes e pela implementação seguintes.

- [x] **Step 1: Update BG06 catalog wording**

Substituir a expectativa de BG06 por:

```markdown
| BG06 | background 子 agent 内部启动 background Bash | 子 Bash 在 child runtime sealed 后完成 | subagentRuntimeBackgroundTaskCleanup | background subagent 首轮 child turn 结束后可以完成并通知 parent；child 内部 background Bash completion 只更新 child runtime task/artifact/event cleanup，不再驱动 child model turn，不回写 parent Agent output，也不补发 parent notification | accepted |
```

- [x] **Step 2: Update background coverage matrix boundary**

Alterar a decisão `Nested background` para:

```markdown
| Nested background | accepted as cleanup-only child lifecycle | child runtime 内 background Bash terminal cleanup、timeout、cancel cleanup | nested Bash result 回写 parent Agent output；main/goal 等待 nested Bash | runtime-local queue 设计 + owner-scoped lifecycle 语义 |
```

- [x] **Step 3: Update BG06 accepted case**

Usar esta linha de BG06:

```markdown
| BG06 | background subagent 内启动 background Bash；subagent 首轮 child turn 已完成 | 子 Bash 完成或超时 | parent 只收到一次 Agent completion notification；child Bash terminal 不再触发 child provider request；child registry/event/artifact terminal cleanup 完成；UI 不出现 parent fake-running | core runtime tests + manual/replay E2E parent surface | planned |
```

- [x] **Step 4: Run docs sanity check**

Executar:

```bash
rg -n "BG06|Nested background|subagentRuntimeBackgroundTaskCleanup|deferred" docs/conversation-session-case-catalog.md docs/testing/conversation-session-background-e2e-coverage-matrix.md docs/testing/conversation-session-e2e-coverage-matrix.md
```

Esperado:

- BG06 não descreve mais "aguardar o child Bash e então reescrever o Agent result final".
- BG06 pode continuar `planned`, mas não pode continuar sendo a antiga semântica `deferred`.

**Critérios de saída da Phase 0:**

- A semântica de produto de BG06 está claramente expressa como child lifecycle somente de cleanup.
- Nenhuma mudança de código.

---

## Phase 1: Notification Policy Sealed Local ao Runtime

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**
- Produces:
  - `AgentRuntime.sealBackgroundTaskNotifications(input: { reason: "subagent_terminal" | "subagent_cancelled"; traceContext?: TraceContext }): void`
  - `ToolExecutorOptions.shouldEnqueueBackgroundTaskNotification?: (input: BackgroundTaskNotificationPolicyInput) => boolean`
  - `BackgroundTaskNotificationPolicyInput = { taskId: string; toolName: string; status: string; runtimeScope: ToolRuntimeScope; traceContext: TraceContext }`
- Consumes:
  - Atualização terminal existente do `RuntimeTaskRegistry`.
  - Enfileiramento do sync command `enqueueBackgroundTaskNotification` existente.

- [x] **Step 1: Write failing test for sealed subagent runtime**

Adicionar um teste focado em `runtime-tool-loop.test.ts`:

```ts
it("does not wake a sealed subagent runtime for background Bash completion", async () => {
  const sessionId = createSessionId("sealed-subagent-background-bash");
  const eventStore = createTestSessionEventStore();
  const sessionStore = new RecordingSessionStore();
  const startedAt = new Date(0);
  const completedAt = new Date(1);
  let modelCallCount = 0;
  let backgroundCompleted = false;

  const executionPort: ExecutionPort = {
    async run() {
      throw new Error("run should not be called for explicit background Bash");
    },
    async start() {
      return {
        taskId: "child_bash_bg",
        status: "running",
        startedAt,
        outputPath: "/tmp/child-bash.log",
      };
    },
    async getBackgroundTask(taskId) {
      if (!backgroundCompleted) {
        return { taskId, status: "running", startedAt, outputPath: "/tmp/child-bash.log" };
      }
      return {
        taskId,
        status: "completed",
        startedAt,
        completedAt,
        outputPath: "/tmp/child-bash.log",
        result: {
          status: "completed",
          exitCode: 0,
          stdout: { text: "done", bytes: 4, truncated: false },
          stderr: { text: "", bytes: 0, truncated: false },
          durationMs: 1,
          timedOut: false,
          cancelled: false,
          startedAt,
          completedAt,
        },
      };
    },
  };

  const runtime = new AgentRuntime(
    sessionId,
    {
      mode: "yolo",
      taskType: "subagent_child",
      workingDirectory: "/tmp/zcode-sealed-subagent-bg-bash",
    },
    {
      ...mcsCapableModelConnectionDeps(),
      eventStore,
      executionPort,
      modelAdapter: {
        async generateText(request: any) {
          modelCallCount += 1;
          if (modelCallCount === 1) {
            return {
              finishReason: "tool-calls",
              model: request.model,
              providerMetadata: undefined,
              text: "",
              toolCalls: [
                {
                  id: "bash-bg",
                  name: "Bash",
                  input: {
                    command: "node long-running.js",
                    description: "child long task",
                    run_in_background: true,
                  },
                },
              ],
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          }
          return {
            finishReason: "stop",
            model: request.model,
            providerMetadata: undefined,
            text: "child launched background bash",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
      sessionStore,
    },
  );

  await runtime.executeTurn("start child background bash");
  runtime.sealBackgroundTaskNotifications({ reason: "subagent_terminal" });

  backgroundCompleted = true;
  await waitForCondition(async () => {
    const projection = await runtime.getProjection();
    return projection.backgroundTasks.some(
      (task) => task.taskId === "child_bash_bg" && task.status === "completed",
    );
  });

  expect(modelCallCount).toBe(2);
  const persisted = await sessionStore.messages({ sessionID: sessionId });
  expect(JSON.stringify(persisted)).not.toContain("<task-notification>");
});
```

Esperado antes da implementação: falha porque o método sealed não existe e/ou porque a notification ainda acorda o model.

- [x] **Step 2: Add runtime sealed state**

Adicionar estado privado ao `AgentRuntime`:

```ts
private backgroundTaskNotificationsSealed = false;
private backgroundTaskNotificationSealReason?: "subagent_terminal" | "subagent_cancelled";
```

Adicionar os campos correspondentes ao `AgentRuntimeInternal`.

- [x] **Step 3: Add seal method in background-notifications**

Em `runtime/methods/background-notifications.ts`, adicionar:

```ts
export function sealBackgroundTaskNotifications(
  this: AgentRuntimeInternal,
  input: {
    reason: "subagent_terminal" | "subagent_cancelled";
    traceContext?: TraceContext;
  },
): void {
  if (this.config.taskType !== "subagent_child") return;
  this.backgroundTaskNotificationsSealed = true;
  this.backgroundTaskNotificationSealReason = input.reason;
  this.logger?.info?.("Subagent runtime background task notifications sealed", {
    ...traceContextToLogContext(input.traceContext ?? this.rootTraceContext),
    event: "runtime.background_task_notifications.sealed",
    module: "core.runtime",
    reason: input.reason,
  });
}
```

- [x] **Step 4: Add notification policy input**

Em `tool/executor/types.ts`, adicionar:

```ts
export interface BackgroundTaskNotificationPolicyInput {
  runtimeScope: ToolRuntimeScope;
  status: string;
  taskId: string;
  toolName: string;
  traceContext: TraceContext;
}

export type ShouldEnqueueBackgroundTaskNotification = (
  input: BackgroundTaskNotificationPolicyInput,
) => boolean;
```

Adicionar `shouldEnqueueBackgroundTaskNotification?: ShouldEnqueueBackgroundTaskNotification` às options e deps.

- [x] **Step 5: Wire runtime policy into ToolExecutor**

Em `agent-runtime.ts`, passar:

```ts
shouldEnqueueBackgroundTaskNotification: (input) => {
  if (this.config.taskType !== "subagent_child") return true;
  if (!this.backgroundTaskNotificationsSealed) return true;
  if (input.toolName !== "Bash") return true;
  this.logger?.info?.("Suppressed sealed subagent background Bash notification", {
    ...traceContextToLogContext(input.traceContext),
    event: "runtime.background_task_notification.suppressed",
    module: "core.runtime",
    reason: this.backgroundTaskNotificationSealReason,
    taskId: input.taskId,
    taskStatus: input.status,
    toolName: input.toolName,
  });
  return false;
},
```

- [x] **Step 6: Check policy before enqueue**

Em `BackgroundTaskTracker.maybeEnqueueBackgroundTaskNotification(...)`, antes de formatar/enfileirar:

```ts
if (
  this.deps.shouldEnqueueBackgroundTaskNotification?.({
    runtimeScope: this.deps.runtimeScope,
    status,
    taskId,
    toolName: toolCall.name,
    traceContext,
  }) === false
) {
  this.deps.logger?.info?.("Background task notification suppressed by runtime policy", {
    ...traceContextToLogContext(traceContext),
    event: "background_task.notification.suppressed",
    module: "core.tool.executor",
    taskId,
    taskStatus: status,
    toolName: toolCall.name,
  });
  return;
}
```

Não chamar `markRuntimeBackgroundTaskNotified(...)` quando a policy suprime a notification.

- [x] **Step 7: Install method**

Em `runtime/methods/index.ts`, instalar:

```ts
proto.sealBackgroundTaskNotifications = sealBackgroundTaskNotifications;
```

Adicionar o método à interface pública `AgentRuntime` se o TypeScript exigir `childRuntime.sealBackgroundTaskNotifications(...)` mais tarde.

- [x] **Step 8: Run focused test**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts -t "sealed subagent runtime|background Bash"
```

Esperado:

- O novo teste sealed passa.
- Os testes existentes de wake de background Bash do parent continuam passando.

**Critérios de saída da Phase 1:**

- O subagent runtime sealed suprime a notificação de provider/model do nested Bash.
- O runtime parent/main ainda acorda para background Bash normal.
- O cleanup terminal de registry/event continua ocorrendo para o nested Bash.

---

## Phase 2: Sealar o Child Runtime Quando o Turno do Subagent Termina

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Test: `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**
- Consumes: `AgentRuntime.sealBackgroundTaskNotifications(...)` da Phase 1.
- Produces: o child runtime é sealed depois que o turno inicial do subagent retorna ou lança erro.

- [x] **Step 1: Write failing subagent integration test**

Adicionar um teste que use o caminho real de `createDefaultSubagentPort` quando viável:

```ts
it("seals child runtime after subagent turn completion", async () => {
  // Arrange a parent runtime whose Agent tool starts a child runtime.
  // Child model: first request starts Bash(run_in_background=true), then stops.
  // Background Bash completion occurs after child stop.
  // Assert parent receives only the Agent completion notification and child does not issue a later model request.
});
```

Se o harness existente não conseguir expor facilmente a contagem de chamadas ao model do child, manter isto como unit de child runtime em `runtime-tool-loop.test.ts` e adicionar o teste de wiring direto na E2E da Phase 5.

- [x] **Step 2: Wrap child executeTurn with finally**

Em `createDefaultSubagentPort(...).runExploreAgent`, substituir o return direto:

```ts
return childRuntime.executeTurn(request.prompt, undefined, {
  abortSignal: options?.signal,
  traceContext: request.traceContext,
});
```

por:

```ts
try {
  return await childRuntime.executeTurn(request.prompt, undefined, {
    abortSignal: options?.signal,
    traceContext: request.traceContext,
  });
} finally {
  childRuntime.sealBackgroundTaskNotifications({
    reason: options?.signal?.aborted ? "subagent_cancelled" : "subagent_terminal",
    traceContext: request.traceContext,
  });
}
```

- [x] **Step 3: Keep parent notification unchanged**

Verificar que não há mudança em:

- `finalizeBackgroundCompletion(...)`
- `finalizeBackgroundFailure(...)`
- `enqueueParentTaskNotification(...)`

A conclusão do Agent do parent continua sendo a única notification em nível de parent.

- [x] **Step 4: Run focused tests**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/subagent-background.test.ts packages/core/tests/runtime-tool-loop.test.ts -t "background|sealed|subagent"
```

Esperado:

- Os testes existentes de background subagent passam.
- Os testes existentes de notification do parent passam.
- O novo comportamento de child sealed passa.

**Critérios de saída da Phase 2:**

- Um child runtime concluído não pode ser reavivado para um model turn por uma conclusão posterior de nested Bash.
- O output do Agent e o comportamento de notificação do parent/main ficam inalterados.

---

## Phase 3: Tempo Máximo de Runtime do Bash em Background de Escopo de Subagent

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**
- Produces:
  - `AgentRuntimeConfig.subagents?.backgroundBashMaxMs?: number`
  - `ToolExecutorDeps.subagentBackgroundBashMaxMs?: number`
- Consumes:
  - `ExecutionPort.cancelBackgroundTask(taskId)`.

- [x] **Step 1: Write failing timeout test**

Adicionar:

```ts
it("cancels subagent background Bash after the subagent max runtime", async () => {
  vi.useFakeTimers();
  try {
    const sessionId = createSessionId("subagent-background-bash-timeout");
    const eventStore = createTestSessionEventStore();
    const sessionStore = new RecordingSessionStore();
    const startedAt = new Date(0);
    const cancelled: string[] = [];

    const executionPort: ExecutionPort = {
      async run() {
        throw new Error("run should not be called");
      },
      async start() {
        return { taskId: "child_bash_timeout", status: "running", startedAt };
      },
      async getBackgroundTask(taskId) {
        return { taskId, status: "running", startedAt };
      },
      async cancelBackgroundTask(taskId) {
        cancelled.push(taskId);
        return {
          taskId,
          status: "cancelled",
          startedAt,
          completedAt: new Date(10),
        };
      },
    };

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "yolo",
        taskType: "subagent_child",
        subagents: { backgroundBashMaxMs: 10 },
        workingDirectory: "/tmp/zcode-subagent-bash-timeout",
      },
      {
        ...mcsCapableModelConnectionDeps(),
        eventStore,
        executionPort,
        modelAdapter: {
          async generateText(request: any) {
            modelCallCount += 1;
            if (modelCallCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "",
                toolCalls: [
                  {
                    id: "bash-bg",
                    name: "Bash",
                    input: {
                      command: "node long-running.js",
                      description: "child long task",
                      run_in_background: true,
                    },
                  },
                ],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "child launched background bash",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
        sessionStore,
      },
    );

    await runtime.executeTurn("launch child bash");
    await vi.advanceTimersByTimeAsync(10);

    expect(cancelled).toEqual(["child_bash_timeout"]);
  } finally {
    vi.useRealTimers();
  }
});
```

- [x] **Step 2: Add config**

Em `AgentRuntimeConfig.subagents`, adicionar:

```ts
backgroundBashMaxMs?: number;
```

Não expor config de CLI/usuário nesta fase, a menos que o encanamento de config de runtime existente exija isso para os testes.

- [x] **Step 3: Pass config into child runtime**

Em `subagent.ts`, ao construir o child runtime:

```ts
subagents: {
  enabled: false,
  backgroundBashMaxMs: this.config.subagents?.backgroundBashMaxMs,
},
```

Se for undefined, o child runtime usa o padrão.

- [x] **Step 4: Pass timeout into ToolExecutor deps**

Em `agent-runtime.ts`:

```ts
subagentBackgroundBashMaxMs:
  this.config.taskType === "subagent_child"
    ? normalizeSubagentBackgroundBashMaxMs(this.config.subagents?.backgroundBashMaxMs)
    : undefined,
```

Adicionar o helper:

```ts
const DEFAULT_SUBAGENT_BACKGROUND_BASH_MAX_MS = 3_600_000;

function normalizeSubagentBackgroundBashMaxMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SUBAGENT_BACKGROUND_BASH_MAX_MS;
  }
  return Math.trunc(value);
}
```

- [x] **Step 5: Start timeout in BackgroundTaskTracker**

Em `trackBackgroundTask(...)`, após o registro da background task e antes do poll/wait:

```ts
let maxRuntimeTimer: ReturnType<typeof setTimeout> | undefined;

if (
  toolCall.name === "Bash" &&
  this.deps.runtimeScope === "subagent" &&
  this.deps.subagentBackgroundBashMaxMs !== undefined
) {
  maxRuntimeTimer = setTimeout(() => {
    this.deps.logger?.warn("Subagent background Bash exceeded max runtime; cancelling", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.subagent_bash.max_runtime_exceeded",
      module: "core.tool.executor",
      taskId,
      toolName: toolCall.name,
    });
    void this.deps.executionPort?.cancelBackgroundTask?.(taskId);
  }, this.deps.subagentBackgroundBashMaxMs);
  maxRuntimeTimer.unref?.();
}
```

Em `stopTracking()`:

```ts
if (maxRuntimeTimer) clearTimeout(maxRuntimeTimer);
maxRuntimeTimer = undefined;
```

- [x] **Step 6: Run focused timeout tests**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts -t "subagent background Bash|max runtime|background Bash"
```

Esperado:

- O teste de timeout passa.
- Os testes existentes de background Bash continuam passando.

**Critérios de saída da Phase 3:**

- O background Bash de escopo de subagent não pode rodar indefinidamente por padrão.
- O background Bash do runtime main não recebe o timer de tempo máximo de subagent.
- Nenhuma palavra-chave de produto externo foi introduzida.

---

## Phase 4: Cancelar o Bash em Background do Child em Execução no Cancelamento do Subagent

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/background.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**
- Produces:
  - `AgentRuntime.cancelRunningRuntimeBackgroundTasks(input: { reason: "subagent_cancelled"; traceContext?: TraceContext }): Promise<void>`
- Consumes:
  - `runtimeTaskRegistry.all()`
  - `executionPort.cancelBackgroundTask(taskId)`

- [x] **Step 1: Write failing cancellation test**

Adicionar:

```ts
it("cancels running subagent background Bash tasks when the subagent turn is cancelled", async () => {
  const runtimeTaskRegistry = new InMemoryRuntimeTaskRegistry();
  const cancelled: string[] = [];
  const runtime = new AgentRuntime(
    createSessionId("subagent-background-bash-cancel-cleanup"),
    { mode: "yolo", taskType: "subagent_child", workingDirectory: "/tmp/zcode-child-cancel" },
    {
      ...mcsCapableModelConnectionDeps(),
      eventStore: createTestSessionEventStore(),
      executionPort: {
        async run() {
          throw new Error("not used");
        },
        async cancelBackgroundTask(taskId) {
          cancelled.push(taskId);
          return { taskId, status: "cancelled", startedAt: new Date(0), completedAt: new Date(1) };
        },
      },
      modelAdapter: {
        async generateText(request: any) {
          return {
            finishReason: "stop",
            model: request.model,
            providerMetadata: undefined,
            text: "done",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
      runtimeTaskRegistry,
      sessionStore: new RecordingSessionStore(),
    },
  );

  runtimeTaskRegistry.register({
    agentId: "child_bash_cancel",
    agentType: "local_bash",
    description: "child bash",
    isBackgrounded: true,
    startedAt: new Date(0),
    status: "running",
    taskId: "child_bash_cancel",
    taskType: "local_bash",
    type: "local_bash",
  });

  await runtime.cancelRunningRuntimeBackgroundTasks({
    reason: "subagent_cancelled",
  });

  expect(cancelled).toEqual(["child_bash_cancel"]);
});
```

- [x] **Step 2: Implement runtime cancellation helper**

Em `runtime/methods/background.ts`, adicionar:

```ts
export async function cancelRunningRuntimeBackgroundTasks(
  this: AgentRuntimeInternal,
  input: { reason: "subagent_cancelled"; traceContext?: TraceContext },
): Promise<void> {
  if (this.config.taskType !== "subagent_child") return;
  const traceContext = input.traceContext ?? this.rootTraceContext;
  const tasks = Object.values(this.runtimeTaskRegistry.all()).filter(
    (task) =>
      task.type === "local_bash" &&
      task.isBackgrounded === true &&
      task.status === "running",
  );

  for (const task of tasks) {
    this.logger?.info?.("Cancelling subagent background task during runtime cleanup", {
      ...traceContextToLogContext(traceContext),
      event: "runtime.background_task.cleanup_cancel",
      module: "core.runtime",
      reason: input.reason,
      taskId: task.taskId,
    });
    await this.cancelBackgroundTask(task.taskId, { traceContext });
  }
}
```

- [x] **Step 3: Wire cancellation on aborted child turn**

Em `subagent.ts`, estender o `finally` da Phase 2:

```ts
const cancelled = options?.signal?.aborted === true;
try {
  return await childRuntime.executeTurn(...);
} finally {
  childRuntime.sealBackgroundTaskNotifications({
    reason: cancelled ? "subagent_cancelled" : "subagent_terminal",
    traceContext: request.traceContext,
  });
  if (cancelled) {
    await childRuntime.cancelRunningRuntimeBackgroundTasks({
      reason: "subagent_cancelled",
      traceContext: request.traceContext,
    });
  }
}
```

- [x] **Step 4: Run focused cancellation tests**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts packages/core/tests/subagent-background.test.ts -t "cancel|background Bash|subagent"
```

Esperado:

- O helper de cancelamento cancela o background Bash do child em execução.
- Um child runtime concluído normalmente não cancela o nested Bash; ele depende do terminal cleanup/timeout.

**Critérios de saída da Phase 4:**

- O cancelamento explícito do subagent não deixa um child Bash órfão.
- O subagent concluído ainda permite que o child Bash termine em modo cleanup-only.

---

## Phase 5: Manual Review e Promoção da E2E de BG06

**Arquivos:**
- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
- Modify: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json`
- Modify: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-background.json`
- Modify after promotion: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modify after promotion: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Consumes: o comportamento de core runtime das Phases 1-4.
- Produces: prova replayável de BG06 na superfície do parent.

- [x] **Step 1: Write replay E2E spec**

A spec deve dirigir:

```text
E2E_BACKGROUND_NESTED_BASH:
1. main launches Agent(run_in_background=true)
2. child Agent starts Bash(run_in_background=true)
3. child Agent ends its first turn
4. parent receives exactly one Agent completion notification
5. child Bash later completes
  6. parent does not receive a second Agent notification and does not show fake-running
```

Asserções:

- o model request do parent contém o resultado de lançamento do Agent.
- o model request posterior do parent contém exatamente uma Agent `<task-notification>`.
- nenhum request posterior do parent contém `<task-notification>` do nested Bash.
- as mensagens de usuário visíveis na UI não incluem `<task-notification>`.
- a sessão retorna para idle após a notification do Agent do parent.
- o model-io do child não contém `<task-notification>` do nested Bash depois que o child runtime é sealed.

- [x] **Step 2: Run fixture validation**

Executar:

```bash
python -m json.tool packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json >/dev/null
python -m json.tool packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-background.json >/dev/null
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-background.test.ts
```

Esperado:

- O JSON da fixture é válido.
- O contrato da fixture inclui os novos requests de BG06.

- [x] **Step 3: Reuse existing background suite instead of promotion**

BG06 faz parte da mesma superfície de background aceita que BG01-BG03/BG07, então foi adicionado diretamente à suite formal de replay de background existente, em vez de criar e promover uma spec separada de manual review.

- [x] **Step 4: Fill fixture contract**

Classificar os requests:

```text
main: Agent launch request
main: parent Agent completion notification request
ignore: title generation
ignore or synthetic: child-internal provider requests if the spec only asserts parent surface
```

Respostas específicas do caso foram adicionadas apenas à fixture local do caso de background existente.

- [x] **Step 5: Verify fixture and replay**

Executar:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-background.test.ts

E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json \
  pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-background.test.ts'

pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-background.test.ts'
```

Esperado:

- O fixture check passa.
- O replay passa com apenas a fixture common + case-local.
- O replay padrão passa.

**Critérios de saída da Phase 5:**

- BG06 está coberto por E2E replayável ou permanece documentado como pending de manual review, com motivo explícito.
- A coverage matrix reflete o status real.

---

## Phase 6: Verificação de Regressão

**Arquivos:**
- Nenhum arquivo de implementação novo.
- Atualizar docs somente se a verificação revelar uma nota de escopo intencional.

- [x] **Step 1: Run core focused tests**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts packages/core/tests/subagent-background.test.ts packages/core/tests/bash-handler.test.ts
```

Esperado:

- Todos os testes core focados passam.

- [x] **Step 2: Run existing background E2E fixture checks**

Executar:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-background.test.ts
```

Esperado:

- O fixture check existente de BG01-BG05/BG07 continua verde.

- [x] **Step 3: Run typecheck/lint**

Executar:

```bash
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
```

Esperado:

- O typecheck passa; o lint sai com sucesso apenas com os warnings já existentes.
- Se aparecerem falhas existentes não relacionadas, registrar o comando exato que falhou e o primeiro erro relevante.

- [x] **Step 4: Provider-visible keyword scan**

Executar:

```bash
python - <<'PY'
from pathlib import Path
import subprocess
import sys

paths = subprocess.check_output(
    [
        "git",
        "diff",
        "--name-only",
        "--",
        "apps/zcode-cli/packages/core/src",
        "apps/zcode-cli/packages/adapters/src",
        "packages/desktop/test/e2e",
        "docs/conversation-session-case-catalog.md",
        "docs/testing/conversation-session-background-e2e-coverage-matrix.md",
        "docs/testing/conversation-session-e2e-coverage-matrix.md",
    ],
    text=True,
).splitlines()

# 用 char code 构造禁用词，避免本计划文件自身包含禁用字面量。
terms = [
    "".join(map(chr, [67, 76, 65, 85, 68, 69])),
    "".join(map(chr, [67, 108, 97, 117, 100, 101])),
    "".join(map(chr, [99, 108, 97, 117, 100, 101])),
]

matches = []
for item in paths:
    path = Path(item)
    if not path.is_file():
        continue
    text = path.read_text(errors="ignore")
    for line_number, line in enumerate(text.splitlines(), 1):
        if any(term in line for term in terms):
            matches.append(f"{item}:{line_number}:{line}")

if matches:
    print("\n".join(matches))
    sys.exit(1)
PY
```

Esperado:

- Nenhum identificador provider/runtime novo ou texto de docs introduzido por este trabalho que ancore o comportamento em nomes de produtos externos.
- Docs existentes de vendors não fazem parte deste scan.

**Critérios de saída da Phase 6:**

- Testes core verdes.
- Comportamento de background existente sem regressão.
- A nova semântica de BG06 verificada ou explicitamente deixada como pending de manual review.
- Nenhuma mudança unintended na superfície provider-visible.

---

## Checklist de Revisão

- [x] A redação de BG06 não diz mais que o nested Bash deve atualizar o output do Agent do parent.
- [x] O isolamento de runtime continua sendo o boundary de roteamento.
- [x] O child runtime sealed suprime apenas a model notification do child Bash, não as notifications do parent Bash nem do parent Agent.
- [x] A notification suprimida não marca a task como `notified: true`.
- [x] O `BackgroundTaskCompleted` / estado terminal do registry ainda acontece para o nested Bash.
- [x] O tempo máximo de runtime do background Bash de subagent se aplica apenas a `runtimeScope === "subagent"` e a Bash.
- [x] O cancelamento explícito do child cancela o background Bash do child em execução.
- [x] Nenhuma palavra-chave de produto externo foi adicionada.
- [x] Nenhum comportamento de replayable no celular foi alterado.
- [x] Nenhum commit foi feito sem pedido explícito do usuário.

## Notas de Implementação

- Preferir pequenos helpers locais ao runtime em vez de um grafo global de owners.
- Se um teste precisar observar requests do child runtime, preferir um teste unitário de core em vez de uma asserção de timing E2E.
- Se a E2E não conseguir capturar de forma confiável o tráfego de provider interno do child, afirmar os invariantes visíveis ao parent e deixar o comportamento do child para os testes de core.
- Não ampliar isto para o output artifact de Workflow nem para o trabalho de output-file único do Bash.