# Plano de Implementação do Owner do Ambiente de Shell da Sessão

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** convergir o snapshot de shell no início da sessão, a exibição de Shell provider-visible, a seleção do executor Bash, a restauração no resume e a herança do Explore em um único owner de runtime, eliminando a complexidade atual de múltiplas camadas que mantêm o estado de shell separadamente.

**Arquitetura:** mantém a capacidade de resolução existente de `ExecutionShellSelection` / `resolveEffectiveBashShellSelection()`, mas adiciona um owner de runtime do core: `session-shell-environment.ts`. Todas as leituras e escritas do estado de shell interno do runtime, o patch de shell no EnvInfo e a persistência/restauração do snapshot passam por esse owner; o rebuild do contexto pre-conversation é extraído para um shared helper sem ciclos, e o owner apenas chama o helper, sem depender de volta de `config.ts` / `context.ts`. bootstrap/protocol passa a fornecer apenas a “selection candidata atual”, sem manter estado prepared adicional.

**Stack Tecnológico:** TypeScript, Vitest, `@zcode/contracts`, `@zcode/adapters`, `@zcode/core`, `@zcode/bootstrap`, ZCode Protocol.

## Restrições Globais

- Semântica alvo: a configuração de shell do Bash só afeta novas sessões; sessões existentes usam o session shell snapshot da momento de sua criação.
- Na fase de prewarm do draft adiado, a configuração de shell do usuário não é lida; a selection candidata é lida uma vez antes da primeira fronteira real de execução do usuário.
- O shell usado pelo executor Bash e o `Shell` do `# Environment` provider-visible devem vir do mesmo session shell environment.
- No resume, o session shell snapshot persistido tem prioridade; quando o snapshot é inválido, usa-se a selection candidata atual como fallback, e um reminder provider-visible explica o drift.
- A resolução de shell em macOS / Linux permanece como está: zsh/bash têm prioridade; shells não compatíveis com Bash, como fish, não são usados como shell do Bash tool; em caso de falha de resolução, usa-se o fallback legado.
- A resolução de shell no Windows permanece como está: a escolha explícita do usuário tem prioridade; auto prefere o Git Bash; quando não encontrado, usa-se o fallback legado cmd/ComSpec.
- O texto provider-visible é proibido de exibir o path absoluto do shell; exibe-se apenas `display.name`.
- Este plano não refaz as settings de escopo remoto; o setting de UI continua com o comportamento de global setting existente.
- Não fazer commit automático; após o código e as verificações, aguardar o review do usuário.
- Cada tarefa primeiro escreve/altera testes focados e só depois muda a implementação; ao final, executar testes focados, `pnpm typecheck` e `pnpm lint`.

---

## Problema Atual

O `freat/shell-fix` atual já tem muitas capacidades corretas, mas o owner está disperso:

- `apps/zcode-cli/packages/core/src/runtime/methods/bash-shell-selection.ts` é apenas um conjunto de getter/setter e não expressa o ciclo de vida completo.
- `apps/zcode-cli/packages/core/src/runtime/methods/config.ts` aplica a selection, atualiza o contexto pre-conversation e faz patch no envInfo.
- `apps/zcode-cli/packages/core/src/runtime/methods/context.ts` lê a selection diretamente e passa `effectiveShellDisplayName`.
- `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts` lê o snapshot, faz fallback e insere o reminder de drift diretamente.
- `apps/zcode-cli/packages/core/src/runtime/methods/events.ts` persiste o snapshot diretamente.
- `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts` mantém um `bashShellSelectionPrepared` local, duplicando o estado interno de selection do runtime.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` resolve e repassa o shell candidate em vários pontos de create/resume/send.

Isso faz com que quem mantém tenha de entender simultaneamente sete pontos de lógica — protocol, bootstrap, runtime config, context, resume, persistence e executor —, aumentando o risco de continuar esquecendo entradas como `/goal`, workflow, steer, deferred draft e resume.

## Forma Alvo

Um novo owner de runtime:

```ts
// apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts
export interface SessionShellEnvironment {
  selection: ExecutionShellSelection;
  promptShell: string;
}

export function getSessionShellEnvironment(
  runtime: AgentRuntimeInternal,
): SessionShellEnvironment | undefined;

export function initializeSessionShellEnvironmentIfNeeded(
  runtime: AgentRuntimeInternal,
  candidate: ExecutionShellSelection,
): boolean;

export function applySessionShellEnvironment(
  runtime: AgentRuntimeInternal,
  selection: ExecutionShellSelection | undefined,
  options?: { refreshPreConversationContext?: boolean },
): void;

export function getContextSourceShellDisplayName(
  runtime: AgentRuntimeInternal,
): string | undefined;

export function applySessionShellToEnvInfo<T extends { shell?: string }>(
  envInfo: T | undefined,
  selection: ExecutionShellSelection | undefined,
): T | undefined;
```

As relações de chamada convergem para:

```text
settings/current env
        |
        v
bootstrap/protocol resolves candidate selection
        |
        v
runtime.initializeSessionShellEnvironmentIfNeeded(candidate)
        |
        +--> config.bashShellSelection
        +--> EnvInfo.shell / # Environment shell
        +--> Bash tool execution context
        +--> Explore child runtime
        +--> session snapshot persist/restore
```

---

## Estrutura de Arquivos

- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`
  - Owner único do ciclo de vida do session shell environment.
- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/context-history-entries.ts`
  - Shared helper `buildContextHistoryEntries()`, evitando que owner/context-refresh importem `context.ts` de volta.
- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/context-refresh.ts`
  - Shared helper de rebuild do context prefix, usado tanto pelo refresh de model/language/style em config quanto pelo refresh pre-conversation do owner de shell.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/bash-shell-selection.ts`
  - Excluir ou reduzir a re-exports de compatibilidade após a migração para o owner.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
  - Remover helpers locais de aplicação/refresh de shell; delegar ao owner.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`
  - Pedir ao owner o override de exibição de shell do contexto.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts`
  - Pedir ao owner que restaure o ambiente de shell persistido e emita o reminder de drift.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/events.ts`
  - Pedir ao owner que persista o snapshot do ambiente de shell atual.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
  - Pedir ao owner o `envInfo.shell` e o `bashShellSelection` herdados pelo filho.
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
  - Consumir apenas `getBashShellSelection`; remover o fallback `bashShellOverride` após a migração do runtime.
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - Consumir apenas `context.bashShellSelection`.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/types.ts`
  - Remover o `bashShellOverride` de nível de runtime depois que os call sites forem migrados.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
  - Renomear o método público de `initializeBashShellSelectionIfNeeded` para `initializeSessionShellEnvironmentIfNeeded`.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
  - Mesma renomeação de método na interface interna.
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
  - Remover o `bashShellSelectionPrepared` local; o owner do runtime decide se a inicialização é necessária.
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/types.ts`
  - Manter `bashShellSelection` como candidate de fronteira; adicionar `platform` opcional no nível do app se a resolução de default do bootstrap precisar preservar a injeção de plataforma dos testes de protocol.
- Modificar: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`
  - Manter o resolver de setting-para-selection do protocol, mas passar o candidate apenas para a fronteira de execução do usuário/send.
- Modificar: `docs/runtime-tools/bash-effective-shell-snapshot.md`
  - Atualizar a spec para nomear `session-shell-environment.ts` como owner único.
- Testar: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`
- Testar: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`
- Testar: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`
- Testar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- Testar: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

---

### Tarefa 1: Introduzir o Owner do Session Shell Environment

**Arquivos:**
- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/context-history-entries.ts`
- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/context-refresh.ts`
- Criar: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/bash-shell-selection.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`
- Testar: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`

**Interfaces:**
- Consome: `ExecutionShellSelection`
- Produz: `SessionShellEnvironment`, `getSessionShellEnvironment()`, `initializeSessionShellEnvironmentIfNeeded()`, `applySessionShellEnvironment()`, `getContextSourceShellDisplayName()`, `applySessionShellToEnvInfo()`

- [ ] **Etapa 1: Adicionar cobertura falhando do owner pelos testes de runtime trace**

Adicione um teste focado em `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`, perto dos testes existentes de shell snapshot:

```ts
it("initializes session shell environment once and ignores later candidates", async () => {
  const sessionId = createSessionId("runtime-session-shell-owner-once");
  const eventStore = createTestSessionEventStore();
  let requestShellDisplayName: unknown;
  const requests: Array<Array<{ role: string; content: string }>> = [];
  const firstSelection = {
    dialect: "posix" as const,
    display: { name: "zsh" },
    path: "/bin/zsh",
    source: "auto-detected" as const,
  };
  const secondSelection = {
    dialect: "posix" as const,
    display: { name: "bash" },
    path: "/bin/bash",
    source: "auto-detected" as const,
  };

  const runtime = new AgentRuntime(
    sessionId,
    {
      workingDirectory: "/workspace",
    },
    {
      contextSourcePort: {
        async resolveContextSources(request) {
          requestShellDisplayName = request.effectiveShellDisplayName;
          return {
            currentDate: "2026-06-23",
            diagnostics: [],
            envInfo: {
              cwd: "/workspace",
              nodeVersion: "v24.14.0",
              osVersion: "Linux 6.6.0",
              platform: "linux",
              shell: request.effectiveShellDisplayName ?? "fish",
            },
            workingDirectory: "/workspace",
          };
        },
      },
      eventStore,
      modelAdapter: {
        async generateText(request) {
          requests.push(
            request.messages.map((message) => ({
              content: providerContentToText(message.content),
              role: message.role,
            })),
          );
          return {
            finishReason: "stop",
            model: request.model as never,
            providerMetadata: undefined,
            text: "ok",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
    },
  );

  expect(runtime.initializeSessionShellEnvironmentIfNeeded(firstSelection)).toBe(true);
  expect(runtime.initializeSessionShellEnvironmentIfNeeded(secondSelection)).toBe(false);

  await runtime.executeTurn("check shell");

  expect(requestShellDisplayName).toBe("zsh");
  expect(providerMessagesToText(requests[0])).toContain("- Shell: zsh");
});
```

- [ ] **Etapa 2: Extrair o helper de context history entries**

Crie `apps/zcode-cli/packages/core/src/runtime/methods/context-history-entries.ts`:

```ts
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import type { ContextBuildResult } from "../deps.js";

export function buildContextHistoryEntries(
  contextResult: ContextBuildResult,
): RuntimeMessageEntry[] {
  return [
    ...contextResult.systemMessages.map((message): RuntimeMessageEntry => ({ message })),
    ...contextResult.metaUserAttachments.map((attachment) =>
      systemReminderAttachmentEntry(attachment.source, attachment.content),
    ),
  ];
}
```

Depois, em `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`, remova a função local `buildContextHistoryEntries()` e importe:

```ts
import { buildContextHistoryEntries } from "./context-history-entries.js";
```

Remova também de `context.ts` os imports de `systemReminderAttachmentEntry` e `RuntimeMessageEntry`, que ficaram sem uso.

- [ ] **Etapa 3: Extrair o helper de context refresh**

Crie `apps/zcode-cli/packages/core/src/runtime/methods/context-refresh.ts`:

```ts
import { countContextPrefixMessages } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { buildContextHistoryEntries } from "./context-history-entries.js";

export function refreshContextModelSnapshot(runtime: AgentRuntimeInternal): void {
  if (!runtime.contextBuilder || !runtime.contextInitialized) {
    // Bugfix: 首轮 context 初始化前，model/outputStyle/language 变更只能刷新同步预览，
    // 不能把 config-only fallback envInfo 写入 config.envInfo。否则真实 context source
    // 会以为 envInfo 已由外部显式提供，跳过平台和 git 探测。
    if (runtime.contextBuilder) {
      runtime.contextBuilder = runtime.createContextBuilderFromSnapshot(
        runtime.createConfigOnlyContextSnapshot(runtime.workingDirectory),
        runtime.memoryContext,
        { persistEnvInfo: false },
      );
    }
    return;
  }

  runtime.contextBuilder = runtime.createContextBuilderFromSnapshot(
    runtime.contextSourceSnapshot ?? runtime.createConfigOnlyContextSnapshot(runtime.workingDirectory),
    runtime.memoryContext,
  );
  const effectiveContextResult = runtime.contextBuilder.build();
  const activeEntries = runtime.messageHistory.toRuntimeEntries();
  const conversationEntries = activeEntries.slice(countContextPrefixMessages(activeEntries));

  runtime.latestContextBuildResult = effectiveContextResult;
  runtime.messageHistory.replaceMessages([
    ...buildContextHistoryEntries(effectiveContextResult),
    ...conversationEntries,
  ]);
}
```

Depois, em `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`, substitua a função local `refreshContextModelSnapshot()` por um import:

```ts
import { refreshContextModelSnapshot } from "./context-refresh.js";
```

Atualize todas as chamadas em `config.ts` de:

```ts
refreshContextModelSnapshot.call(this);
```

para:

```ts
refreshContextModelSnapshot(this);
```

- [ ] **Etapa 4: Criar o módulo do owner**

Crie `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`:

```ts
import { countContextPrefixMessages } from "../deps.js";
import type { ExecutionShellSelection } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { refreshContextModelSnapshot } from "./context-refresh.js";

export interface SessionShellEnvironment {
  selection: ExecutionShellSelection;
  promptShell: string;
}

export function getSessionShellEnvironment(
  runtime: AgentRuntimeInternal,
): SessionShellEnvironment | undefined {
  const selection = runtime.config.bashShellSelection;
  if (!selection) return undefined;
  return {
    promptShell: selection.display.name,
    selection,
  };
}

export function getSessionShellSelection(
  runtime: AgentRuntimeInternal,
): ExecutionShellSelection | undefined {
  return getSessionShellEnvironment(runtime)?.selection;
}

export function getContextSourceShellDisplayName(
  runtime: AgentRuntimeInternal,
): string | undefined {
  return getSessionShellEnvironment(runtime)?.promptShell;
}

export function initializeSessionShellEnvironmentIfNeeded(
  runtime: AgentRuntimeInternal,
  candidate: ExecutionShellSelection,
): boolean {
  if (getSessionShellEnvironment(runtime)) {
    return false;
  }
  // 修复原因：Bash shell 是 session-start 快照。所有入口都只表达“当前候选值”，
  // runtime 统一负责首次真实用户执行前初始化一次，避免 prompt shell 和执行 shell 分叉。
  applySessionShellEnvironment(runtime, candidate, { refreshPreConversationContext: true });
  return true;
}

export function applySessionShellEnvironment(
  runtime: AgentRuntimeInternal,
  selection: ExecutionShellSelection | undefined,
  options: { refreshPreConversationContext?: boolean } = {},
): void {
  runtime.config.bashShellSelection = selection;
  delete runtime.config.bashShellOverride;

  if (options.refreshPreConversationContext !== false) {
    refreshPreConversationShellContext(runtime, selection);
  }
}

export function applySessionShellToEnvInfo<T extends { shell?: string }>(
  envInfo: T | undefined,
  selection: ExecutionShellSelection | undefined,
): T | undefined {
  if (!envInfo || !selection?.display.name) return envInfo;
  return {
    ...envInfo,
    shell: selection.display.name,
  };
}

function refreshPreConversationShellContext(
  runtime: AgentRuntimeInternal,
  selection: ExecutionShellSelection | undefined,
): void {
  if (
    !selection ||
    !runtime.contextBuilder ||
    !runtime.contextInitialized ||
    !runtime.contextSourceSnapshot ||
    runtime.sessionPersisted
  ) {
    return;
  }

  const activeEntries = runtime.messageHistory.toRuntimeEntries();
  if (activeEntries.length !== countContextPrefixMessages(activeEntries)) {
    return;
  }

  runtime.config.envInfo = applySessionShellToEnvInfo(runtime.config.envInfo, selection);
  runtime.contextSourceSnapshot = {
    ...runtime.contextSourceSnapshot,
    envInfo: applySessionShellToEnvInfo(runtime.contextSourceSnapshot.envInfo, selection)!,
  };
  refreshContextModelSnapshot(runtime);
}
```

- [ ] **Etapa 5: Converter o helper antigo em wrapper de compatibilidade**

Substitua `apps/zcode-cli/packages/core/src/runtime/methods/bash-shell-selection.ts` por:

```ts
export {
  applySessionShellEnvironment as setEffectiveBashShellSelection,
  getSessionShellSelection as getEffectiveBashShellSelection,
} from "./session-shell-environment.js";
```

Isso mantém os call sites existentes compilando enquanto as tarefas seguintes migram os nomes.

- [ ] **Etapa 6: Renomear no local o método público de inicialização do runtime**

Em `agent-runtime.ts`, `internal-methods.ts` e `methods/index.ts`, substitua o nome antigo do método no local:

```ts
initializeSessionShellEnvironmentIfNeeded(selection: ExecutionShellSelection): boolean;
```

Não mantenha um alias público temporário para `initializeBashShellSelectionIfNeeded`; atualize os call sites nesta mesma tarefa para que exista apenas um nome de API do runtime.

- [ ] **Etapa 7: Executar o teste focado**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-trace.test.ts
```

Esperado: os testes de runtime trace passam. O novo teste prova que a API do owner inicializa uma única vez e produz a exibição de shell provider-visible usada pelo contexto.

---

### Tarefa 2: Mover a Mutação de Contexto do Runtime Para o Owner

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
- Testar: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`

**Interfaces:**
- Consome: funções de owner da Tarefa 1
- Produz: método público do runtime `initializeSessionShellEnvironmentIfNeeded(selection): boolean`

- [ ] **Etapa 1: Verificar que não há ciclo de import config/owner**

Confirme estas direções de import:

```text
config.ts -> session-shell-environment.ts
config.ts -> context-refresh.ts
session-shell-environment.ts -> context-refresh.ts
context-refresh.ts -> context-history-entries.ts
context.ts -> session-shell-environment.ts
context.ts -> context-history-entries.ts
```

Não pode haver import de `session-shell-environment.ts` para `config.ts`, nem import de `context-refresh.ts` para `context.ts`.

- [ ] **Etapa 2: Substituir a lógica de aplicação de shell em config**

Em `config.ts`, remova os locais `applyBashShellSelection()`, `initializeBashShellSelectionIfNeeded()`, `refreshPreConversationShellContext()` e `updateEnvInfoShell()`.

Importe o owner:

```ts
import {
  applySessionShellEnvironment,
  initializeSessionShellEnvironmentIfNeeded as initializeSessionShellEnvironment,
} from "./session-shell-environment.js";
```

Atualize o ramo de shell de `updateConfig()`:

```ts
if ("bashShellSelection" in patch || "bashShellOverride" in patch) {
  applySessionShellEnvironment(this, patch.bashShellSelection ?? patch.bashShellOverride, {
    refreshPreConversationContext: true,
  });
}
```

Adicione o método exportado:

```ts
export function initializeSessionShellEnvironmentIfNeeded(
  this: AgentRuntimeInternal,
  selection: ExecutionShellSelection,
): boolean {
  return initializeSessionShellEnvironment(this, selection);
}
```

- [ ] **Etapa 3: Fazer o contexto consumir o owner, e não a config crua**

Em `context.ts`, substitua:

```ts
const bashShellSelection = getEffectiveBashShellSelection(this);
```

por:

```ts
const shellDisplayName = getContextSourceShellDisplayName(this);
```

e passe:

```ts
effectiveShellDisplayName: shellDisplayName,
```

Isso mantém `ContextSourceRequest.effectiveShellDisplayName` como um simples campo de transporte; o owner continua sendo o único ponto de decisão de shell do runtime.

- [ ] **Etapa 4: Verificar que o método público do runtime tem um único nome**

Confirme que `agent-runtime.ts`, `internal-methods.ts` e `methods/index.ts` expõem apenas:

```ts
initializeSessionShellEnvironmentIfNeeded(selection: ExecutionShellSelection): boolean;
```

e não expõem mais:

```ts
initializeBashShellSelectionIfNeeded(selection: ExecutionShellSelection): boolean;
```

Atualize quaisquer call sites restantes em bootstrap/testes para usar `initializeSessionShellEnvironmentIfNeeded`.

- [ ] **Etapa 5: Executar os testes focados do runtime**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-trace.test.ts tests/context-builder.test.ts
```

Esperado: os testes de runtime trace e de context builder passam.

---

### Tarefa 3: Mover a Persistência do Snapshot e a Restauração no Resume Para o Owner

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/bash-shell-snapshot.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/events.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts`
- Testar: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`

**Interfaces:**
- Consome: `readPersistedBashShellSelectionSnapshot()`, `resolveBashShellSnapshotForResume()`, `persistBashShellSelectionSnapshot()`
- Produz: `persistSessionShellEnvironmentSnapshot(runtime, traceContext)`, `restoreSessionShellEnvironmentSelectionForResume(runtime, options)` e `announceSessionShellEnvironmentDriftAfterResume(runtime, options)`

- [ ] **Etapa 1: Adicionar wrappers de persistência do owner**

Em `session-shell-environment.ts`, acrescente:

```ts
import type { EnvInfo, TraceContext } from "../deps.js";
import {
  persistBashShellSelectionSnapshot,
  readPersistedBashShellSelectionSnapshot,
  resolveBashShellSnapshotForResume,
  type BashShellSnapshotRestore,
} from "./bash-shell-snapshot.js";
import {
  buildShellEnvironmentChangeReminder,
  hasShellDisplayChanged,
} from "./shell-environment.js";

export async function persistSessionShellEnvironmentSnapshot(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  await persistBashShellSelectionSnapshot({
    logger: runtime.logger,
    selection: getSessionShellSelection(runtime),
    sessionId: runtime.sessionId,
    sessionStore: runtime.sessionStore,
    traceContext,
  });
}

export async function restoreSessionShellEnvironmentSelectionForResume(
  runtime: AgentRuntimeInternal,
  options: {
    currentSelection: ExecutionShellSelection | undefined;
    traceContext: TraceContext;
  },
): Promise<BashShellSnapshotRestore> {
  const restore = resolveBashShellSnapshotForResume({
    currentSelection: options.currentSelection,
    logger: runtime.logger,
    restore: await readPersistedBashShellSelectionSnapshot({
      logger: runtime.logger,
      sessionId: runtime.sessionId,
      sessionStore: runtime.sessionStore,
      traceContext: options.traceContext,
    }),
    traceContext: options.traceContext,
  });

  if (restore.status === "restored" || restore.status === "fallback") {
    applySessionShellEnvironment(runtime, restore.selection, {
      refreshPreConversationContext: false,
    });
  }

  return restore;
}

export function announceSessionShellEnvironmentDriftAfterResume(
  runtime: AgentRuntimeInternal,
  options: {
    persistedEnvInfo: EnvInfo | undefined;
    restore: BashShellSnapshotRestore;
  },
): void {
  if (
    options.restore.status !== "restored" &&
    hasShellDisplayChanged(options.persistedEnvInfo?.shell, getSessionShellSelection(runtime))
  ) {
    // 修复原因：旧 session 没有可用的 runtime/bash_shell_selection 快照，或快照失效后
    // 只能使用当前 fallback selection。历史 # Environment 仍显示旧 Shell，必须补
    // provider-visible reminder，避免模型误以为 Bash 仍在旧 shell 下执行。
    runtime.messageHistory.addAttachment(
      "shell_environment_change",
      buildShellEnvironmentChangeReminder(getSessionShellSelection(runtime)),
    );
  }
}
```

- [ ] **Etapa 2: Simplificar a persistência em events**

Em `events.ts`, substitua a chamada direta `persistBashShellSelectionSnapshot(...)` por:

```ts
await persistSessionShellEnvironmentSnapshot(this, traceContext);
```

Remova os imports diretos de `persistBashShellSelectionSnapshot` e `getEffectiveBashShellSelection`.

- [ ] **Etapa 3: Simplificar a restauração no resume**

Em `resume.ts`, substitua o bloco direto de leitura/resolução/aplicação do snapshot antes da inicialização do contexto por:

```ts
const shellRestore = await restoreSessionShellEnvironmentSelectionForResume(this, {
  currentSelection: getSessionShellSelection(this),
  traceContext,
});
```

Depois, após `hydrateMessageHistoryFromSession(...)`, substitua `announceLegacyBashShellDriftIfNeeded(...)` por:

```ts
announceSessionShellEnvironmentDriftAfterResume(this, {
  persistedEnvInfo,
  restore: shellRestore,
});
```

Esse timing importa: `messageHistory` é resetado e hidratado durante o resume, portanto o attachment de drift provider-visible precisa ser adicionado após a hidratação, e não durante a restauração inicial da selection.

- [ ] **Etapa 4: Manter `bash-shell-snapshot.ts` apenas como codec de storage**

Após a Etapa 3, `bash-shell-snapshot.ts` deve saber apenas como:

- persistir a selection serializada
- ler a selection serializada
- validar a usabilidade da selection persistida
- resolver uma selection persistida obsoleta contra um candidate de fallback atual

Ele não deve alterar a config do runtime nem o histórico de mensagens.

- [ ] **Etapa 5: Executar os testes de persistência**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts
```

Esperado: os testes cobrem snapshot restaurado, fallback de snapshot obsoleto, reminder de drift de sessão legada e fallback de snapshot inválido.

---

### Tarefa 4: Colapsar a Inicialização de Bootstrap e Protocol Around the Runtime Owner

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/types.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/input-facade.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/workflow-methods.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/workflow-facade.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/script-workflow-methods.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`
- Testar: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Interfaces:**
- Consome: `runtime.initializeSessionShellEnvironmentIfNeeded(candidate)`
- Produz: uma única implementação da fronteira de execução do usuário, sem flag prepared local duplicada

- [ ] **Etapa 1: Adicionar injeção de platform no nível do app para a resolução de shell default**

Em `apps/zcode-cli/packages/bootstrap/src/app/types.ts`, acrescente a `ZCodeAppOptions`:

```ts
platform?: NodeJS.Platform | string;
```

Em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`, repasse a platform do protocol ao criar as opções do app:

```ts
platform: context.deps.platform,
```

Mantenha o comportamento existente de `env: context.deps.env` inalterado.

- [ ] **Etapa 2: Remover o estado prepared local do bootstrap do app**

Em `create-app.ts`, exclua:

```ts
let bashShellSelectionPrepared = Boolean(
  runtimeConfig.bashShellSelection ?? runtimeConfig.bashShellOverride,
);
```

Substitua `initializeBashShellSelection()` por:

```ts
const resolveDefaultShellSelection = (): ExecutionShellSelection =>
  resolveEffectiveBashShellSelection({
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
  }).selection;

const initializeSessionShellEnvironment = (candidate?: ExecutionShellSelection): void => {
  const selection = candidate ?? resolveDefaultShellSelection();
  getRuntime().initializeSessionShellEnvironmentIfNeeded(selection);
};
```

Isso torna a config do runtime a única verdade de inicializado/não inicializado.

- [ ] **Etapa 3: Atualizar a fronteira de resume**

Em `resumeFromStore()`, mantenha o comportamento de fallback atual, mas chame a função renomeada:

```ts
initializeSessionShellEnvironment();
const result = await runtime.resumeFromStore({ traceContext: resumeTraceContext });
```

Essa selection atual é apenas um candidate de fallback; o snapshot persistido tem precedência dentro do owner do runtime.

- [ ] **Etapa 4: Atualizar a fronteira de execução do usuário**

Em `prepareUserExecutionBoundary`, substitua:

```ts
initializeBashShellSelection(boundaryOptions?.bashShellSelection);
```

por:

```ts
initializeSessionShellEnvironment(boundaryOptions?.bashShellSelection);
```

Não adicione casos especiais para `/goal`, workflow ou deferred draft aqui; todos devem chamar esta única fronteira.

- [ ] **Etapa 5: Manter o resolver do protocol apenas como produtor de candidate**

Em `server-operations.ts`, mantenha `resolveProtocolBashShellSelection()`, mas trate o resultado como um candidate:

```ts
const bashShellSelectionCandidate = resolveProtocolBashShellSelection(
  context,
  params.integratedTerminalShell,
);
```

Passe-o para `record.app.sendInput(..., { bashShellSelection: bashShellSelectionCandidate })`.

Não passe shell selection por `session/create` na criação de draft que não seja resume.

- [ ] **Etapa 6: Atualizar os testes de protocol**

Em `zcode-protocol.test.ts`, afirme que:

- `session/create` adiado não inicializa a shell selection
- o primeiro `session/send` inicializa a shell selection a partir do candidate da configuração atual
- um segundo `session/send` com um candidate diferente não sobrescreve a selection do runtime
- um `session/resume` a frio restaura o snapshot persistido quando presente
- um resume legado frio usa o candidate atual como fallback e emite o reminder de shell drift somente quando o shell visível no prompt mudou

Use os helpers de teste existentes nos pontos em que `recordShellInitialization()` já está presente; remova asserções que dependem do `bashShellSelectionPrepared` local do bootstrap.

- [ ] **Etapa 7: Executar os testes de protocol do bootstrap**

Execute:

```bash
pnpm --filter @zcode/bootstrap exec vitest run tests/zcode-protocol.test.ts
```

Esperado: os testes de protocol passam.

---

### Tarefa 5: Remover o `bashShellOverride` do Runtime Como Fonte de Estado

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/types.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- Testar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

**Interfaces:**
- Consome: `ExecutionShellSelection`
- Produz: apenas um campo de runtime: `bashShellSelection`

- [ ] **Etapa 1: Remover o campo de override da config do runtime**

Em `AgentRuntimeConfig`, exclua:

```ts
bashShellOverride?: ExecutionShellOverride | undefined;
```

Mantenha `ExecutionShellOverride` em `@zcode/contracts` porque a fronteira de execução de baixo nível ainda nomeia `shellOverride` em `ExecutionCommand`.

- [ ] **Etapa 2: Atualizar o tipo de patch de updateConfig do runtime**

Em `agent-runtime.ts`, `internal-methods.ts` e `config.ts`, remova `"bashShellOverride"` das listas `Pick<AgentRuntimeConfig, ...>`.

Em `config.ts`, o ramo de shell passa a ser:

```ts
if ("bashShellSelection" in patch) {
  applySessionShellEnvironment(this, patch.bashShellSelection, {
    refreshPreConversationContext: true,
  });
}
```

- [ ] **Etapa 3: Atualizar o contexto de execução de tool**

Em `call-runner.ts`, substitua:

```ts
bashShellSelection: deps.getBashShellSelection?.() ?? deps.bashShellSelection,
bashShellOverride: deps.getBashShellOverride?.() ?? deps.bashShellOverride,
```

por:

```ts
bashShellSelection: deps.getBashShellSelection?.() ?? deps.bashShellSelection,
```

Remova `bashShellOverride` dos tipos de dependências do executor.

- [ ] **Etapa 4: Atualizar o handler Bash**

Em `bash.ts`, substitua:

```ts
const shellSelection = context.bashShellSelection ?? context.bashShellOverride;
```

por:

```ts
const shellSelection = context.bashShellSelection;
```

Mantenha o nome do campo do comando de execução:

```ts
shellOverride: shellSelection,
```

porque `ExecutionCommand` é a fronteira do adapter e já documenta que isso é exclusivo do Bash.

- [ ] **Etapa 5: Executar os testes do handler Bash**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado: os testes de Bash passam e nenhum call site referencia mais o `bashShellOverride` de nível de runtime.

- [ ] **Etapa 6: Confirmar que não restam referências obsoletas de override do runtime**

Execute:

```bash
rg -n "bashShellOverride|getBashShellOverride" apps/zcode-cli/packages/core apps/zcode-cli/packages/bootstrap
```

Esperado: nenhum hit no estado de runtime de core/bootstrap. Hits em contracts/adapters são aceitáveis apenas para a fronteira de baixo nível `ExecutionCommand.shellOverride`.

---

### Tarefa 6: Atualizar a Herança do Explore Através do Owner

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Testar: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`

**Interfaces:**
- Consome: `getSessionShellEnvironment()`
- Produz: `envInfo.shell` e `bashShellSelection` do filho a partir do mesmo ambiente do pai

- [ ] **Etapa 1: Substituir as leituras diretas de selection**

Em `subagent.ts`, substitua:

```ts
const bashShellSelection = getEffectiveBashShellSelection(this);
const childEnvInfo = {
  ...baseChildEnvInfo,
  ...(bashShellSelection ? { shell: bashShellSelection.display.name } : {}),
};
```

por:

```ts
const shellEnvironment = getSessionShellEnvironment(this);
const childEnvInfo = {
  ...baseChildEnvInfo,
  ...(shellEnvironment ? { shell: shellEnvironment.promptShell } : {}),
};
const bashShellSelection = shellEnvironment?.selection;
```

- [ ] **Etapa 2: Manter a config do runtime filho mínima**

Ao criar o `AgentRuntime` filho, passe apenas:

```ts
bashShellSelection,
envInfo: childEnvInfo,
```

Não passe nenhum alias de shell override.

- [ ] **Etapa 3: Executar os testes do Explore**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/subagent-explore.test.ts
```

Esperado: tanto o prompt shell quanto a seleção de execução Bash do filho do Explore herdam o shell de início de sessão do pai.

---

### Tarefa 7: Atualizar a Documentação e Remover o Modelo Mental Superado

**Arquivos:**
- Modificar: `docs/runtime-tools/bash-effective-shell-snapshot.md`
- Modificar: `docs/superpowers/plans/2026-06-19-bash-effective-shell-snapshot.md`

**Interfaces:**
- Produz: documentação que nomeia o owner único e marca o plano antigo como histórico

- [ ] **Etapa 1: Atualizar a spec de runtime tool**

Em `docs/runtime-tools/bash-effective-shell-snapshot.md`, acrescente uma nova seção depois de “核心契约”:

```md
## Runtime Owner

`apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts` é o owner único do session shell environment.

Ele é responsável por:

- inicializar o snapshot de shell de session-start.
- aplicar o display name visível ao provider em `EnvInfo.shell`.
- fornecer o `ExecutionShellSelection` ao executor do Bash.
- persistir e restaurar `runtime/bash_shell_selection`.
- inserir o attachment `shell_environment_change` no fallback de resume legacy / stale.

bootstrap, protocol, services e UI só podem fornecer a selection candidata atual; não podem modificar diretamente o shell environment de uma session já inicializada.
```

- [ ] **Etapa 2: Marcar o plano antigo como superado**

No topo de `docs/superpowers/plans/2026-06-19-bash-effective-shell-snapshot.md`, acrescente:

```md
> Superado por `docs/superpowers/plans/2026-06-23-session-shell-environment-owner.md`.
> Este documento registra o plano original de implementação do snapshot de shell; o plano de refatoração atual centraliza a posse do ciclo de vida em `session-shell-environment.ts`.
```

- [ ] **Etapa 3: Executar o sanity check de grep no markdown**

Execute:

```bash
rg -n "bashShellOverride|effectiveShellDisplayName|session-shell-environment|runtime/bash_shell_selection" docs/runtime-tools docs/superpowers/plans/2026-06-19-bash-effective-shell-snapshot.md docs/superpowers/plans/2026-06-23-session-shell-environment-owner.md
```

Esperado: a documentação menciona `bashShellOverride` apenas como conceito removido do runtime ou como fronteira de execução de baixo nível; a documentação nomeia `session-shell-environment.ts` como owner.

---

### Tarefa 8: Verificação Completa

**Arquivos:**
- Nenhuma edição de código, a menos que os testes revelem uma migração esquecida.

**Interfaces:**
- Produz: refatoração verificada, com o mesmo comportamento e menor complexidade

- [ ] **Etapa 1: Executar os testes focados do pacote**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run \
  tests/runtime-trace.test.ts \
  tests/runtime-persistence.test.ts \
  tests/subagent-explore.test.ts \
  tests/bash-handler.test.ts
```

Esperado: todos os testes selecionados do core passam.

- [ ] **Etapa 2: Executar os testes do bootstrap**

Execute:

```bash
pnpm --filter @zcode/bootstrap exec vitest run tests/zcode-protocol.test.ts
```

Esperado: os testes de inicialização de shell do protocol, de draft adiado, de resume e de send passam.

- [ ] **Etapa 3: Executar os testes do adapter se o resolver de shell tiver mudado**

Se a Tarefa 2 tiver tocado `apps/zcode-cli/packages/adapters/src/exec/bash-shell-provider.ts` ou `apps/zcode-cli/packages/adapters/src/exec/index.ts`, execute:

```bash
pnpm --filter @zcode/adapters exec vitest run tests/exec.test.ts tests/fs-context.test.ts
```

Esperado: os testes de adapters passam.

- [ ] **Etapa 4: Executar as verificações obrigatórias de todo o repositório**

Execute:

```bash
pnpm typecheck
pnpm lint
```

Esperado: ambos passam.

- [ ] **Etapa 5: Auditoria final de comportamento**

Execute:

```bash
rg -n "initializeBashShellSelectionIfNeeded|bashShellSelectionPrepared|getBashShellOverride|bashShellOverride" apps/zcode-cli/packages/core apps/zcode-cli/packages/bootstrap
```

Esperado:

- nenhum `initializeBashShellSelectionIfNeeded`
- nenhum `bashShellSelectionPrepared`
- nenhum `getBashShellOverride`
- nenhum `bashShellOverride` de nível de runtime

Execute:

```bash
rg -n "getSessionShellEnvironment|initializeSessionShellEnvironmentIfNeeded|restoreSessionShellEnvironmentSelectionForResume|announceSessionShellEnvironmentDriftAfterResume|persistSessionShellEnvironmentSnapshot" apps/zcode-cli/packages/core apps/zcode-cli/packages/bootstrap
```

Esperado:

- as funções do owner são usadas por context, config, resume, events, subagent e pela fronteira de execução do usuário do bootstrap
- protocol/services não alteram diretamente o estado de shell do runtime

## Critérios de Aceitação

- Nova sessão: a shell selection é indefinida até a primeira fronteira real de execução do usuário.
- Primeiro send: o candidate da configuração atual inicializa uma única vez o session shell environment.
- Send posterior na mesma sessão: um candidate de configuração alterado é ignorado.
- A execução do Bash tool e o `Shell` do `# Environment` usam o mesmo `ExecutionShellSelection.display.name`.
- Draft adiado: o prewarm não congela a configuração de shell; o primeiro send congela.
- `/goal`, expert workflow, script workflow: chamam a mesma fronteira de execução do usuário antes do primeiro estado persistido/executado.
- Resume com snapshot válido: usa o shell persistido e não insere reminder de drift.
- Resume com snapshot obsoleto: não passa o path obsoleto ao executor; faz fallback para o candidate atual e insere o reminder de drift se o Shell histórico for diferente.
- Resume legado sem snapshot: usa o candidate atual e insere o reminder de drift somente quando o Shell histórico é diferente.
- Runtime filho do Explore: herda o session shell environment do pai tanto para o prompt quanto para a execução Bash.
- Nenhum caminho de estado do runtime trata mais `bashShellOverride` como segunda fonte de verdade.
- `pnpm typecheck` e `pnpm lint` passam.

## Checklist de Auto-Revisão

- [ ] Todo comportamento do ciclo de vida do shell aponta para uma função de owner em `session-shell-environment.ts`.
- [ ] bootstrap/protocol apenas produzem a selection candidata e não mantêm estado local de “já inicializado”.
- [ ] context, executor Bash, Explore, resume e persistence não têm mais lógica própria de composição do shell display.
- [ ] O nome de shell provider-visible continua sem conter path absoluto.
- [ ] O comportamento de fallback em Windows/macOS/Linux não virou hard spawn error.
- [ ] A documentação e os testes não exigem mais que quem mantém entenda o antigo modelo mental de múltiplos owners.