# Plano de implementação do refactor de limite estreito do auto-background do Bash

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** remover a abstração generic `runBackgroundable` introduzida nesta rodada no background do Bash, recolher o auto-background por timeout do Bash de volta para um caminho exclusivo do Bash e reutilizar as notificações de background / wake / runtime command queue já existentes.

**Arquitetura:** manter `ExecutionPort.run()`, `ExecutionPort.start()`, `getBackgroundTask()` e `cancelBackgroundTask()` como fronteiras públicas de execution; a nova capacidade existe apenas como uma capability estruturada e estreita entre o handler do Bash e o adapter de execution do Node, sem estender o `ExecutionPort` público. O auto-background do Bash cuida apenas de "transferir para tarefa de background o mesmo processo de foreground depois do timeout" e, ao terminar, continua passando pelo `BackgroundTaskTracker` existente, usando a task-notification, o runtime wake, o runtime command queue e o post-turn goal driver já existentes.

**Stack técnico:** TypeScript, Vitest, pnpm, `@zcode/contracts`, `@zcode/adapters`, `@zcode/core`, apenas o source atual do workspace.

## Restrições globais

- Consultar apenas o source atual do workspace e `docs/bash-background-parity.md`; não consultar outros branches.
- Não fazer commit automático; nem este plano nem o processo de execução contêm `git commit`, a menos que o usuário peça explicitamente na tarefa atual.
- Não adicionar uma nova API generic de foreground-promotion; é proibido continuar estendendo `ExecutionPort.runBackgroundable`, `BackgroundableExecutionRunOptions`, `BackgroundableExecutionRunResult`.
- Não expor os detalhes internos de persistência em disco do auto-background do Bash como uma semântica `persistOutput: "always"` visível ao chamador.
- Não adicionar feature flag, timer de fallback, estratégia especial de poller nem entrada manual de operação de background.
- Código novo, nomes de teste, comentários e textos visíveis ao provider usam apenas nomenclatura semântica local, sem introduzir nomes de produtos externos.
- Antes de começar cada phase, reler a phase atual deste plan, executar `git status --short` e confirmar que nenhuma alteração nova do usuário foi sobrescrita.
- Após concluir cada phase, é obrigatório rodar os testes unitários e a checagem de tipos especificados daquela phase; em caso de falha, parar na phase atual e não avançar para a próxima.

---

## Alvo do refactor atual

No workspace atual, o WIP de background do Bash já implementa a maior parte das capacidades de notification/wake/queue, mas a entrada de auto-background é larga demais:

- `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts` adicionou `runBackgroundable`, `waitForBackgroundTask` e tipos `BackgroundableExecution*`.
- `apps/zcode-cli/packages/adapters/src/exec/index.ts` faz a completion de foreground e a promoção por timeout dentro de `NodeExecutionAdapter.runBackgroundable()`.
- `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts` chama o auto-background via `executionPort.runBackgroundable()` e força `persistOutput: "always"`.
- `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts` já consegue emitir a task notification `local_bash` do Bash e pode usar um waiter direto para evitar o poller do Bash.

Forma alvo:

- O `ExecutionPort` público não tem mais `runBackgroundable` / `BackgroundableExecution*`.
- O handler do Bash chama o auto-background apenas por uma capability exclusiva do Bash, como `runBashWithAutoBackground(request, options)`.
- Essa capability não é um contrato generic de execution, serve apenas ao handler do Bash; os demais chamadores continuam usando `run()` ou `start()`.
- O auto-background do Bash continua reutilizando o `BackgroundTaskTracker`, o `formatTaskNotification({ taskType: "local_bash" })`, o `enqueueBackgroundTaskNotification` e o runtime command queue existentes.

## Estrutura de arquivos

- Modificar: `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`
  - Remover os tipos e métodos de interface genéricos de auto-background.
  - Manter os existentes `BackgroundExecutionStartResult`, `BackgroundExecutionSnapshot`, `ExecutionPort.start/getBackgroundTask/cancelBackgroundTask`.

- Modificar: `apps/zcode-cli/packages/adapters/src/exec/index.ts`
  - Remover `NodeExecutionAdapter.runBackgroundable()`.
  - Adicionar o método estreito `runBashWithAutoBackground(request, options)`, que trata apenas a promoção por timeout do Bash.
  - Manter `waitForBackgroundTask(taskId, options?)` na classe como capability estruturada interna, sem colocá-lo de volta no `ExecutionPort` público.
  - Limitar a limpeza dos artefatos de foreground ao cenário interno de persistência forçada do auto-background do Bash, sem quebrar a semântica de `persistOutput` do `run()` comum.

- Criar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-auto-background.ts`
  - Conter os tipos estreitos, o type guard e o wrapper usados pelo handler do Bash.
  - Fazer com que `bash.ts` não escreva mais structural cast diretamente.

- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - Remover `createAutoBackgroundExecutionRequest()` e `restoreForegroundOutputPersistence()`.
  - Passar a chamar `runBashWithOptionalAutoBackground()`.
  - Manter o `run_in_background` explícito passando por `executionPort.start()`.

- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
  - Mudar a verificação de tipo do waiter direto para uma structural capability interna deste arquivo, sem depender de `ExecutionPort["waitForBackgroundTask"]`.
  - Quando o waiter direto do Bash existir, continuar sem usar o poller; quando não existir, manter o fallback original de `getBackgroundTask()`.

- Modificar: testes
  - `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
  - `apps/zcode-cli/packages/core/tests/bash-run-conformance.test.ts`
  - `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
  - `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`

- Modificar: docs
  - `docs/bash-background-parity.md`
  - Manter este plan como checklist de execução: `docs/superpowers/plans/2026-07-01-bash-background-refactor.md`

---

## Phase 0: Baseline e reconferência do comportamento alvo

**Propósito:** reconfirmar o diff atual e o comportamento alvo do background do Bash antes de mexer no código, evitando continuar aplicando patch sobre conclusões desatualizadas.

**Arquivos:** nenhuma mudança de código nesta phase.

**Checklist**

- [ ] **Step 0.1: Confirmar worktree sujo**

Executar:

```bash
git status --short
```

Esperado:

- É possível ver os arquivos atuais do WIP de background do Bash.
- Se aparecerem arquivos novos fora deste plan ou alterações novas do usuário, parar e ler o diff antes.

- [ ] **Step 0.2: Confirmar que a abstração generic é WIP atual, não baseline do HEAD**

Executar:

```bash
git show HEAD:apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts | rg -n "runBackgroundable|BackgroundableExecution|waitForBackgroundTask|BackgroundExecution" -C 2
```

Esperado:

- Só devem aparecer `BackgroundExecution*`, `start()`, `getBackgroundTask()` e `cancelBackgroundTask()`.
- Não deve aparecer `runBackgroundable` nem `BackgroundableExecution*`.

- [ ] **Step 0.3: Confirmar as referências atuais do WIP a remover ou estreitar**

Executar:

```bash
rg -n "runBackgroundable|BackgroundableExecution|autoBackgroundOnTimeout|waitForBackgroundTask" apps/zcode-cli/packages docs/bash-background-parity.md
```

Esperado:

- Lista as referências pendentes de refactor no WIP atual.
- Após a conclusão das phases seguintes, `runBackgroundable|BackgroundableExecution|autoBackgroundOnTimeout` deve ser 0 em `apps/zcode-cli/packages`.

- [ ] **Step 0.4: Reconferir os fatos alvo do background do Bash**

Executar:

```bash
rg -n "assistantAutoBackgrounded|backgroundTaskId|persistedOutputPath|run_in_background|TaskOutput" apps/zcode-cli/packages/contracts/src/tools/bash.ts docs/bash-background-parity.md
```

Esperado:

- O schema de output do Bash inclui `backgroundTaskId`, `backgroundedByUser`, `assistantAutoBackgrounded`, `persistedOutputPath`.
- O caminho de chamada do auto-background do Bash pertence à ferramenta Bash, e não a um contrato público de execution generic.
- O caminho de output da task pertence à task, e o modelo é notificado com o caminho de output da task depois de ir para background.

**Critérios de aprovação da Phase 0**

- A origem da abstração atual e o comportamento alvo foram reconfirmados.
- Nenhum código alterado.

---

## Phase 1: testar primeiro o limite estreito desejado

**Propósito:** mudar primeiro os testes da API generic para a capability exclusiva do Bash, formando os testes que falham do alvo do refactor.

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/bash-run-conformance.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`

**Interfaces:**

- Produz o nome de método esperado: `runBashWithAutoBackground(request: ExecutionRequest, options?: ExecutionRunOptions): Promise<BashAutoBackgroundRunResult>`
- Produz a forma esperada do waiter direto: `waitForBackgroundTask(taskId: string, options?: { signal?: AbortSignal }): Promise<BackgroundExecutionSnapshot | undefined>`

**Checklist**

- [ ] **Step 1.1: Substituir o entrypoint de teste do adapter**

Em `apps/zcode-cli/packages/adapters/tests/exec.test.ts`, renomear os testes de auto-background para que chamem `runBashWithAutoBackground` em vez de `runBackgroundable`.

Use este helper estrutural no arquivo de teste:

```ts
type BashAutoBackgroundCapableAdapter = NodeExecutionAdapter & {
  runBashWithAutoBackground?: (
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ) => Promise<
    | { kind: "completed"; result: ExecutionResult }
    | {
        assistantAutoBackgrounded: true;
        kind: "backgrounded";
        task: BackgroundExecutionStartResult;
      }
  >;
  waitForBackgroundTask?: (
    taskId: string,
    options?: { signal?: AbortSignal },
  ) => Promise<BackgroundExecutionSnapshot | undefined>;
};
```

Adicione uma asserção explícita de limite perto do primeiro teste de auto-background do adapter:

```ts
expect("runBackgroundable" in adapter).toBe(false);
expect(typeof capable.runBashWithAutoBackground).toBe("function");
```

- [ ] **Step 1.2: Substituir o fake de conformidade do handler do Bash**

Em `apps/zcode-cli/packages/core/tests/bash-run-conformance.test.ts`, mudar o teste do execution port fake de `runBackgroundableCalled` para `runBashWithAutoBackgroundCalled`.

O método fake deve retornar:

```ts
async runBashWithAutoBackground() {
  runBashWithAutoBackgroundCalled = true;
  return {
    assistantAutoBackgrounded: true,
    kind: "backgrounded" as const,
    task: {
      outputPath: "/tmp/zcode-bash-output.log",
      startedAt: new Date(),
      status: "running" as const,
      taskId: "exec_auto_background",
    },
  };
}
```

Asserção esperada:

```ts
expect(runBashWithAutoBackgroundCalled).toBe(true);
expect(output.status).toBe("backgrounded");
expect(output.assistantAutoBackgrounded).toBe(true);
```

- [ ] **Step 1.3: Adicionar regressão de ausência de contrato generic**

Em `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`, adicionar uma checagem de shape em runtime de que o schema de provider do Bash ainda expõe os campos de resultado de background mas não depende da promoção generic do execution port.

Use este estilo de expectativa:

```ts
expect(BashOutputJsonSchema.properties).toHaveProperty("backgroundTaskId");
expect(BashOutputJsonSchema.properties).toHaveProperty("assistantAutoBackgrounded");
expect(BashInputJsonSchema.properties).toHaveProperty("run_in_background");
```

Não afirme nenhum campo visível ao provider para `runBackgroundable`; ele precisa continuar sendo apenas de implementação e ausente do schema da ferramenta.

- [ ] **Step 1.4: rodar os testes focados e confirmar a falha**

Executar:

```bash
../../node_modules/.bin/vitest run packages/adapters/tests/exec.test.ts -t "auto-background|foreground results foreground|persisted output"
../../node_modules/.bin/vitest run packages/core/tests/bash-run-conformance.test.ts -t "auto-backgrounds eligible foreground commands"
```

Esperado:

- Falha porque `NodeExecutionAdapter.runBashWithAutoBackground` ainda não existe.
- Falha porque `bashHandler` ainda chama `runBackgroundable`.

**Critérios de aprovação da Phase 1**

- Os testes codificam a API estreita desejada.
- O motivo da falha é apenas API ausente/antiga, e não comportamento não relacionado.

---

## Phase 2: remover a superfície generic do ExecutionPort público

**Propósito:** remover dos contracts públicos a API generic de foreground-promotion, estreitando primeiro o limite.

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`
- Modificar imports em `apps/zcode-cli/packages/adapters/src/exec/index.ts`
- Modificar imports nos testes afetados

**Checklist**

- [ ] **Step 2.1: Remover os tipos genéricos dos contracts**

Apagar estas declarações de `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`:

```ts
export interface BackgroundableExecutionRunOptions extends ExecutionRunOptions {
  autoBackgroundOnTimeout?: {
    taskId?: string;
    enabled: boolean;
  };
}

export type BackgroundableExecutionRunResult = ...
```

- [ ] **Step 2.2: Remover os métodos genéricos do `ExecutionPort`**

Remover estes métodos opcionais do `ExecutionPort`:

```ts
waitForBackgroundTask?(
  taskId: string,
  options?: { signal?: AbortSignal },
): Promise<BackgroundExecutionSnapshot | undefined>;
runBackgroundable?(
  request: ExecutionRequest,
  options?: BackgroundableExecutionRunOptions,
): Promise<BackgroundableExecutionRunResult>;
```

Manter:

```ts
start?(
  request: ExecutionRequest,
  options?: ExecutionRunOptions,
): Promise<BackgroundExecutionStartResult>;
getBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
cancelBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
```

- [ ] **Step 2.3: Remover imports obsoletos**

Em `apps/zcode-cli/packages/adapters/src/exec/index.ts`, remover os imports de:

```ts
BackgroundableExecutionRunOptions,
BackgroundableExecutionRunResult,
```

- [ ] **Step 2.4: Checar os tipos dos contracts**

Executar:

```bash
cd apps/zcode-cli/packages/contracts && ../../../../node_modules/.bin/tsc --noEmit
```

Esperado:

- PASS.

**Critérios de aprovação da Phase 2**

- O `ExecutionPort` não expõe mais auto-background generic.
- A checagem de tipos dos contracts passa.

---

## Phase 3: adicionar a capability de auto-background exclusiva do Bash no NodeExecutionAdapter

**Propósito:** manter a capacidade de promoção por timeout no mesmo processo, mas limitá-la a uma capability de adapter exclusiva do Bash.

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/adapters/src/exec/index.ts`
- Modificar: `apps/zcode-cli/packages/adapters/tests/exec.test.ts`

**Interfaces:**

Adicionar tipos locais apenas do adapter, próximos aos tipos de background task existentes em `index.ts`:

```ts
interface BashAutoBackgroundRunOptions extends ExecutionRunOptions {}

type BashAutoBackgroundRunResult =
  | {
      kind: "completed";
      result: ExecutionResult;
    }
  | {
      assistantAutoBackgrounded: true;
      kind: "backgrounded";
      task: BackgroundExecutionStartResult;
    };
```

Adicionar o método de classe:

```ts
async runBashWithAutoBackground(
  request: ExecutionRequest,
  options: BashAutoBackgroundRunOptions = {},
): Promise<BashAutoBackgroundRunResult>
```

**Checklist**

- [ ] **Step 3.1: Renomear e estreitar o método**

Em `NodeExecutionAdapter`, substituir `runBackgroundable()` por `runBashWithAutoBackground()`.

Mudanças semânticas obrigatórias:

- Remover o objeto de options `autoBackgroundOnTimeout`.
- Usar `request.timeoutMs ?? DEFAULT_TIMEOUT_MS` como o limiar de auto-background.
- Se o limiar for `<= 0`, retornar `{ kind: "completed", result: await this.run(request, options) }`.
- Gerar o task id internamente com `exec_${crypto.randomUUID()}`.
- Não aceitar task id fornecido pelo chamador.

- [ ] **Step 3.2: Manter a persistência forçada como interna**

Dentro de `runBashWithAutoBackground()`, criar uma requisição de execução interna:

```ts
const originalPersistOutput = request.outputLimit?.persistOutput ?? "none";
const runRequest: ExecutionRequest = {
  ...request,
  timeoutMs: 0,
  outputLimit: {
    ...request.outputLimit,
    persistOutput: "always",
  },
};
```

Este `persistOutput: "always"` interno não pode ser criado em `bash.ts`.

- [ ] **Step 3.3: Normalizar a completion de foreground**

Substituir `cleanupAutoBackgroundForegroundArtifacts()` por um helper mais estreito:

```ts
private normalizeBashAutoBackgroundForegroundResult(
  result: ExecutionResult,
  paths: ExecutionOutputPaths,
  originalPersistOutput: OutputPersistenceMode,
): ExecutionResult
```

Comportamento obrigatório:

- Se `originalPersistOutput === "always"`, retornar `result` sem alterações.
- Se `originalPersistOutput === "on_truncate"`, preservar os metadados de artefato apenas para os streams em que `stream.truncated === true`; apagar os arquivos de output internos não truncados.
- Se `originalPersistOutput === "none"`, apagar os arquivos de output internos e remover os metadados de artefato dos dois streams, a menos que o stream esteja truncado pela semântica existente de output limit.

- [ ] **Step 3.4: Manter o kill por output limit somente após a promoção**

Preservar o comportamento fixo atual:

```ts
let backgrounded = false;
let persistedLimitReached = false;

const backgroundRunOptions: InternalExecutionRunOptions = {
  ...options,
  signal: controller.signal,
  onPersistedLimit: () => {
    persistedLimitReached = true;
  },
  onEvent: (event) => {
    this.updateBackgroundTaskRecordFromEvent(record, event);
    return options.onEvent?.(event);
  },
  shouldStopOnPersistedLimit: () => backgrounded,
};
```

Quando a promoção por timeout vencer:

```ts
backgrounded = true;
this.backgroundTasks.set(taskId, record);
if (persistedLimitReached) {
  controller.abort("output_limit");
}
```

- [ ] **Step 3.5: Manter o waiter direto fora do contrato público**

Manter este método em `NodeExecutionAdapter`:

```ts
async waitForBackgroundTask(
  taskId: string,
  options: { signal?: AbortSignal } = {},
): Promise<BackgroundExecutionSnapshot | undefined>
```

Não recolocá-lo no `ExecutionPort`.

- [ ] **Step 3.6: Rodar os testes do adapter**

Executar:

```bash
../../node_modules/.bin/vitest run packages/adapters/tests/exec.test.ts -t "auto-background|foreground results foreground|persisted output"
```

Esperado:

- PASS.
- Um comando de foreground rápido não deixa arquivos de artefato ocultos quando a requisição original não pediu persistência.
- Um comando levado a background automaticamente pode ser aguardado por `waitForBackgroundTask`.

**Critérios de aprovação da Phase 3**

- O adapter suporta auto-background do Bash sem `runBackgroundable`.
- Os testes do adapter passam.
- `rg -n "runBackgroundable|BackgroundableExecution|autoBackgroundOnTimeout" apps/zcode-cli/packages/adapters apps/zcode-cli/packages/contracts` não retorna nenhuma ocorrência.

---

## Phase 4: mover o handler do Bash para o helper estreito

**Propósito:** fazer o handler do Bash usar a capability exclusiva do Bash e remover do handler o patch de persistência forçada.

**Arquivos:**

- Criar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-auto-background.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/bash-run-conformance.test.ts`

**Interfaces:**

Criar `apps/zcode-cli/packages/core/src/tool/handlers/bash-auto-background.ts`:

```ts
import type {
  BackgroundExecutionSnapshot,
  BackgroundExecutionStartResult,
  ExecutionPort,
  ExecutionRequest,
  ExecutionResult,
  ExecutionRunOptions,
} from "@zcode/contracts";

export type BashAutoBackgroundRunResult =
  | {
      kind: "completed";
      result: ExecutionResult;
    }
  | {
      assistantAutoBackgrounded: true;
      kind: "backgrounded";
      task: BackgroundExecutionStartResult;
    };

export interface BashAutoBackgroundExecutionPort extends ExecutionPort {
  runBashWithAutoBackground(
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ): Promise<BashAutoBackgroundRunResult>;
  waitForBackgroundTask?(
    taskId: string,
    options?: { signal?: AbortSignal },
  ): Promise<BackgroundExecutionSnapshot | undefined>;
}

export function supportsBashAutoBackground(
  executionPort: ExecutionPort,
): executionPort is BashAutoBackgroundExecutionPort {
  return typeof (executionPort as Partial<BashAutoBackgroundExecutionPort>)
    .runBashWithAutoBackground === "function";
}

export async function runBashWithOptionalAutoBackground(input: {
  eligible: boolean;
  executionPort: ExecutionPort;
  options: ExecutionRunOptions;
  request: ExecutionRequest;
}): Promise<BashAutoBackgroundRunResult> {
  if (input.eligible && supportsBashAutoBackground(input.executionPort)) {
    return await input.executionPort.runBashWithAutoBackground(input.request, input.options);
  }
  return {
    kind: "completed",
    result: await input.executionPort.run(input.request, input.options),
  };
}
```

**Checklist**

- [ ] **Step 4.1: Adicionar o arquivo helper**

Criar `bash-auto-background.ts` exatamente para a capability estreita do Bash e o wrapper. Não exportar isto dos contracts.

- [ ] **Step 4.2: Atualizar o ponto de chamada de `bash.ts`**

Substituir o bloco runResult atual por:

```ts
const runResult = await runBashWithOptionalAutoBackground({
  eligible: isBashAutoBackgroundEligible(parsed),
  executionPort,
  options: runOptions,
  request,
});
```

- [ ] **Step 4.3: Apagar os helpers de persistência forçada no nível do handler**

Remover de `bash.ts`:

```ts
function createAutoBackgroundExecutionRequest(...)
function restoreForegroundOutputPersistence(...)
```

Remover também os imports que agora ficarem sem uso:

```ts
type ExecutionResult
```

- [ ] **Step 4.4: Rodar os testes de conformidade do Bash**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/bash-run-conformance.test.ts -t "auto-backgrounds eligible foreground commands|conformance"
```

Esperado:

- PASS no teste focado de auto-background.
- Os casos de conformidade existentes permanecem inalterados.

**Critérios de aprovação da Phase 4**

- O handler do Bash não referencia mais `runBackgroundable`.
- O handler do Bash não altera mais a persistência da requisição para auto-background.
- Os testes focados do Bash passam.

---

## Phase 5: manter a notificação do Bash no pipeline de background existente

**Propósito:** continuar reutilizando as notificações de background / wake / runtime command queue já existentes, sem adicionar um mecanismo de wake exclusivo do Bash.

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**

Em `background-tasks.ts`, definir um tipo de waiter estrutural local:

```ts
type BackgroundTaskWaiter = {
  waitForBackgroundTask(
    taskId: string,
    options?: { signal?: AbortSignal },
  ): Promise<BackgroundTaskSnapshot | undefined>;
};
```

Adicionar o helper:

```ts
function getBackgroundTaskWaiter(
  executionPort: ExecutionPort | undefined,
): BackgroundTaskWaiter | undefined {
  const candidate = executionPort as Partial<BackgroundTaskWaiter> | undefined;
  return typeof candidate?.waitForBackgroundTask === "function"
    ? (candidate as BackgroundTaskWaiter)
    : undefined;
}
```

**Checklist**

- [ ] **Step 5.1: Remover a dependência de `ExecutionPort["waitForBackgroundTask"]`**

Mudar o tipo `BackgroundTaskSnapshot` para que não referencie mais `ExecutionPort["waitForBackgroundTask"]`.

Manter esta união:

```ts
type BackgroundTaskSnapshot =
  | Awaited<ReturnType<NonNullable<ExecutionPort["getBackgroundTask"]>>>
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot;
```

- [ ] **Step 5.2: Atualizar o caminho do waiter direto do Bash**

Substituir:

```ts
return toolCall.name === "Bash" && Boolean(this.deps.executionPort?.waitForBackgroundTask);
```

por:

```ts
return toolCall.name === "Bash" && Boolean(getBackgroundTaskWaiter(this.deps.executionPort));
```

Substituir a chamada do waiter por:

```ts
return getBackgroundTaskWaiter(this.deps.executionPort)?.waitForBackgroundTask(taskId);
```

- [ ] **Step 5.3: Manter o poller de fallback apenas como fallback de capability**

Não remover nesta phase o fallback de polling por `getBackgroundTask()` existente; ele permanece para execution ports que não conseguem fornecer um waiter direto. O Bash no `NodeExecutionAdapter` deve usar o waiter direto e portanto não fazer polling.

- [ ] **Step 5.4: Verificar o caminho de enqueue da notificação**

Manter `maybeEnqueueBackgroundTaskNotification()` inalterado, exceto por efeitos de tipo. Ele ainda precisa chamar:

```ts
this.deps.enqueueBackgroundTaskNotification({ text, traceContext });
```

O texto ainda precisa vir de:

```ts
formatTaskNotification({
  taskType: "local_bash",
  ...
});
```

- [ ] **Step 5.5: Rodar os testes do runtime loop**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts -t "background Bash|direct execution wait|stale Bash|task-notification|goal|notification"
```

Esperado:

- PASS.
- Uma falha na emissão de started não mantém um tracker obsoleto.
- A notificação de completion do Bash é enfileirada após a espera direta.
- O runtime command queue consome a task notification como um comando enfileirado normal.

**Critérios de aprovação da Phase 5**

- A espera direta do Bash funciona sem o `ExecutionPort.waitForBackgroundTask` público.
- O caminho de notificação permanece unificado com o mecanismo de background existente.
- Os testes focados do runtime loop passam.

---

## Phase 6: remover referências genéricas e atualizar docs

**Propósito:** limpar a dívida conceitual deixada por várias rodadas de patch e garantir que os docs descrevam a implementação final, e não abstrações desatualizadas.

**Arquivos:**

- Modificar: `docs/bash-background-parity.md`
- Modificar: `docs/superpowers/plans/2026-07-01-bash-background-parity.md` somente se ele contiver orientação de implementação que agora seja perigosa
- Manter: `docs/superpowers/plans/2026-07-01-bash-background-refactor.md`

**Checklist**

- [ ] **Step 6.1: Atualizar a redação do documento de feature**

Em `docs/bash-background-parity.md`, descrever a arquitetura final como:

```md
Bash timeout auto-background is implemented as a Bash-owned execution path.
It reuses existing background task events, task notification enqueue, runtime wake,
and runtime command queue. It does not expose a generic foreground-promotion method
on ExecutionPort.
```

Use chinês se o resto do arquivo for em chinês; mantenha a redação curta.

- [ ] **Step 6.2: Remover orientações genéricas obsoletas**

Executar:

```bash
rg -n "runBackgroundable|BackgroundableExecution|autoBackgroundOnTimeout|persistOutput: \"always\"" apps/zcode-cli/packages docs/bash-background-parity.md
```

Esperado:

- Nenhuma ocorrência de `runBackgroundable`, `BackgroundableExecution`, `autoBackgroundOnTimeout`.
- `persistOutput: "always"` ainda pode aparecer em testes explícitos de background existentes ou em internos do adapter para a semântica atual de persistência de output, mas não na policy de auto-background do handler do Bash.

- [ ] **Step 6.3: Conferir se a nomenclatura continua local**

Executar:

```bash
node opensource/tools/check-competitor-terms.mjs apps/zcode-cli/packages/core/src/tool/handlers/bash.ts apps/zcode-cli/packages/core/src/tool/handlers/bash-auto-background.ts apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts docs/bash-background-parity.md
```

Esperado:

- Relata 0 achados.

**Critérios de aprovação da Phase 6**

- Os docs correspondem ao limite final do código.
- Nenhum nome de API generic de auto-background permanece nos pacotes de source.
- Os arquivos tocados de Bash/background usam apenas nomenclatura local.

---

## Phase 7: verificação completa

**Propósito:** provar que este refactor não quebrou Bash, background, notificação, contracts, typecheck e lint existentes.

**Arquivos:** nenhuma mudança de código pretendida.

**Checklist**

- [ ] **Step 7.1: Testes do adapter**

Executar:

```bash
../../node_modules/.bin/vitest run packages/adapters/tests/exec.test.ts
```

Esperado:

- PASS com apenas os skips existentes.

- [ ] **Step 7.2: Testes de Bash e ferramentas do core**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/bash-run-conformance.test.ts packages/core/tests/tool-contracts.test.ts
```

Esperado:

- PASS com apenas os skips existentes.

- [ ] **Step 7.3: Testes de background do runtime**

Executar:

```bash
../../node_modules/.bin/vitest run packages/core/tests/runtime-tool-loop.test.ts -t "background Bash|direct execution wait|stale Bash|task-notification|goal|notification"
```

Esperado:

- PASS.

- [ ] **Step 7.4: Checagens de tipos dos pacotes**

Executar:

```bash
cd apps/zcode-cli/packages/contracts && ../../../../node_modules/.bin/tsc --noEmit
cd ../adapters && ../../../../node_modules/.bin/tsc --noEmit
cd ../core && ../../../../node_modules/.bin/tsc --noEmit
```

Esperado:

- Todos PASS.

- [ ] **Step 7.5: Checagens do repositório**

Executar a partir da raiz do repositório:

```bash
pnpm lint
pnpm typecheck
git diff --check
```

Esperado:

- `pnpm lint`: exit 0; warnings existentes são aceitáveis se não foram introduzidos por este refactor.
- `pnpm typecheck`: exit 0.
- `git diff --check`: sem erros de whitespace.

- [ ] **Step 7.6: Varredura final do source**

Executar:

```bash
rg -n "runBackgroundable|BackgroundableExecution|autoBackgroundOnTimeout" apps/zcode-cli/packages
node opensource/tools/check-competitor-terms.mjs apps/zcode-cli/packages/core/src/tool/handlers/bash.ts apps/zcode-cli/packages/core/src/tool/handlers/bash-auto-background.ts apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts docs/bash-background-parity.md
```

Esperado:

- Primeiro comando: nenhuma ocorrência.
- Segundo comando: relata 0 achados.

**Critérios de aprovação da Phase 7**

- Todos os testes focados passam.
- As checagens de tipos dos pacotes passam.
- O lint/typecheck do repositório passa.
- A API generic de auto-background sumiu dos pacotes de source.

---

## Definição de Concluído

- [ ] O contrato público `ExecutionPort` voltou a ter apenas as primitivas existentes de execution/background.
- [ ] O auto-background do Bash funciona pela capability estrutural estreita `runBashWithAutoBackground()`, e não pelo `runBackgroundable()` generic.
- [ ] O handler do Bash não força `persistOutput: "always"` no ponto de chamada.
- [ ] A completion de foreground rápido do Bash preserva a semântica normal de output de foreground e não vaza artefatos ocultos.
- [ ] A completion de Bash levada a background automaticamente emite os eventos de background task existentes e enfileira a task notification `local_bash` existente.
- [ ] O runtime wake e a continuação são tratados pelo caminho existente do runtime command queue.
- [ ] O comportamento explícito existente de `run_in_background` continua usando `executionPort.start()`.
- [ ] Nenhum controle manual de background, feature flag, timer de wake de fallback ou fila de notificação de Bash separada foi introduzido.
- [ ] Todos os comandos de verificação da Phase 7 passam.