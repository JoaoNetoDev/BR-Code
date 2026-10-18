# Plano de Implementação da Montagem do Prompt Provider-Visible de Subagent

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** convergir a montagem do system prompt provider-visible do child request de subagent do ZCode para uma forma única de subagent comum, preservando `system[0] = "You are ZCode, an interactive coding agent"`; o body agent-specific de Explore/general-purpose usa como linha de base apenas o texto único congelado nos testes.

**Architecture:** adicionar um context builder dedicado a subagent que gere diretamente o `ContextBuildResult` do child runtime, evitando rodar primeiro o `ContextBuilder` da main thread e depois sobrescrever as system messages. Explore, general-purpose e agent custom passam uniformemente por `prefixo do ZCode + prompt agent-specific + common Notes + env/model context`, em que o body agent-specific de Explore/general-purpose adota somente o texto congelado único; common Notes e env/model context seguem a segmentação fixa `agentPrompt + common Notes + env/model context`, mas a origem dos dados, o fallback e a formatação do env/model context priorizam a reutilização da lógica atual do main runtime/context builder.

**Tech Stack:** TypeScript, Vitest, `AgentRuntime`, `MessageHistoryImpl`, captura de request provider-visible por meio do `modelAdapter` mockado.

## Restrições Globais

- Este plano trata apenas da montagem do prompt provider-visible de subagent; não modifica o schema/description da tool `Agent` do lado pai, o schema `tools[]` do child, `SendMessage`, notificação de background, teammate, isolamento por worktree nem hidratação de fork/repl.
- `system[0]` precisa preservar o prefixo de produto atual do ZCode: `You are ZCode, an interactive coding agent`.
- Requisito forte: o body agent-specific de Explore e general-purpose só pode usar um único texto congelado (conforme as asserções exatas de `subagent-explore.test.ts` / `subagent-prompt-assembly.test.ts`); não introduzir variantes de texto por modelo, provider ou canal, nem misturar textos de versões históricas ou de branches temporários de experimento do ZCode.
- A pontuação, as quebras de linha e a redação operacional do body de Explore/general-purpose fazem parte da aceitação provider-visible; além da substituição do nome de produto do ZCode e das diferenças de nomes de ferramentas atuais do ZCode, não faça reescritas do tipo "com o mesmo sentido".
- Exceto por `system[0]`, o system body do subagent comum é organizado com estrutura fixa: agent-specific prompt, common subagent Notes, env/model context; e os valores de campo, fallback, exibição do shell, deteccao de git repo e formatação do model name do env/model context seguem a lógica já existente do main runtime/context builder.
- Não fabrique dados que o main atual não tem; só dados que o main já consiga fornecer ou que já são provider-visible podem entrar no subagent env/model context.
- Não crie narrativas de identidade extras do tipo "você é um subagent"; mantenha apenas as dicas operacionais já existentes, como `Agent threads...` e `parent agent reads your text output...`.
- O body de request provider-visible é a superfície de aceitação; não afirme apenas a runtime config ou objetos intermediários retornados por helpers.
- Use nomenclatura semântica local; não use nomes de produtos externos em identificadores de código, comentários ou nomes de teste.
- Não faça commit automático; ao terminar a implementação, deixe apenas mudanças revisáveis na working tree.

---

## Escopo

### Dentro do Escopo

- ordem e conteúdo das `system` messages do child:
  - `system[0]`: prefixo do ZCode CLI
  - `system[1]`: agent-specific prompt
  - `system[2]`: common subagent Notes
  - `system[3]`: env/model context
- Remover Notes/env/model context embutidos do prompt do Explore.
- O prompt do general-purpose e do custom profile também passa a receber o mesmo conjunto de common Notes/env/model context.
- O child request deixa de acionar o branch de custom prompt do `ContextBuilder` por causa da string `systemPrompt` e deixa de sobrescrever o resultado do builder principal via `systemMessages`.
- Os testes capturam o child provider request final e afirmam o shape preciso de `messages.filter(role === "system")`.
- Durante a execução é obrigatório fazer double check de se o body agent-specific de Explore/general-purpose continua igual ao texto congelado; se houver drift, é preciso corrigir o texto primeiro nesta rodada e só então seguir com a divisão das system messages e a convergência da montagem.

### Fora do Escopo

- schema de input provider-visible e description da tool `Agent`.
- alias de runtime `Task` / filtragem provider-visible.
- allowlist/disallowlist de tools do child / semântica de MCP required server.
- schema provider-visible, result text e texto de injeção no child de `SendMessage`.
- `<task-notification>` de background e idle wake.
- A implementação completa de omissão de arquivos de instruções do projeto por agent somente leitura, agent memory, prompt de sistema adicional de subagent, hidratação de fork/repl e isolamento por teammate/worktree.
- Introduzir variantes de texto do prompt de subagent por modelo, provider, canal, versão histórica ou branch de experimento.

## Resumo do Estado Atual

Caminho atual:

- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
  - calcula `systemPrompt: string` dentro de `runExploreAgent`.
  - chama `buildExploreSystemPrompt(...)` quando é Explore e o `systemPrompt` do profile está vazio.
  - o `AgentRuntime` do child entra no `ContextBuilder` configurado por `systemPrompt`.
- `apps/zcode-cli/packages/core/src/context/builder.ts`
  - quando `customSystemPrompt` existe, emite:
    - `system[0] = buildCliPrefixSection()`
    - `system[1] = "\n" + customSystemPrompt`
  - e ao mesmo tempo pula os system segments padrão de identity/dynamic/env/git/output style.
- `apps/zcode-cli/packages/core/src/subagent/explore.ts`
  - hoje `buildExploreSystemPrompt(...)` contém ao mesmo tempo o prompt do agent Explore, as common Notes e o env/model context.
- `apps/zcode-cli/packages/core/src/agent/message-history.ts`
  - `MessageHistoryImpl.init(...)` já aceita `Array<ModelInputMessage | RuntimeMessageEntry>` e pode inicializar várias system messages de uma vez.
- `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`
  - hoje a asserção `exploreSystemMessages` diz que `system[0]` é o prefixo do ZCode e `system[1]` é o bloco inteiro do prompt Explore com leading newline.

Caminho alvo:

- `subagent.ts` deixa de passar o prompt do child como `systemPrompt: string` para o child runtime.
- Novo `SubagentContextBuilder` emite o `ContextBuildResult` completo, em que `sections`, `systemMessages` e `metaUserAttachments` são todos gerados segundo a semântica de subagent.
- O child runtime usa a nova config `subagentContext` para selecionar o subagent builder; `ensureContextInitialized`, `refreshContextModelSnapshot` e resume/lazy context seguem uniformemente a mesma estratégia de builder.

## Estrutura de Arquivos

- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
  - adicionar `subagentContext?: { agentPrompt: string }` a `AgentRuntimeConfig`, sem nova config de sobrescrita de `systemMessages`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`
  - `createContextBuilderFromSnapshot(...)` cria o `SubagentContextBuilder` conforme `config.subagentContext`, e o runtime principal continua criando o `ContextBuilder` principal.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
  - garantir que o `getContextBuilder()` lazy também passe por `createContextBuilderFromSnapshot(...)`, sem introduzir special-case de subagent.
- Modify: `apps/zcode-cli/packages/core/src/context/sections/env-info.ts`
  - exportar a lógica atual de deteccao de git repo do main como helper compartilhado, evitando que o subagent env/model context duplique uma deteccao similar que pode derivar.
- Create: `apps/zcode-cli/packages/core/src/subagent/system-prompt.ts`
  - fornecer `buildSubagentCommonNotes()`, `buildSubagentEnvironmentContext(...)`; o builder consome somente o `EnvInfo` já preparado segundo a lógica do main.
- Create: `apps/zcode-cli/packages/core/src/subagent/context-builder.ts`
  - fornecer `SubagentContextBuilder` / `createSubagentContextBuilder(...)`, retornando o `ContextBuildResult` completo e reutilizando os helpers de common Notes/env/model.
- Modify: `apps/zcode-cli/packages/core/src/subagent/explore.ts`
  - mudar `buildExploreSystemPrompt(...)` para retornar apenas o agent-specific prompt do Explore.
- Modify: `apps/zcode-cli/packages/core/src/subagent/general-purpose.ts`
  - fazer double check de se o body agent-specific do general-purpose é igual ao texto congelado; se houver drift, corrigir nesta rodada.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
  - passar `subagentContext.agentPrompt` e o `envInfo` do child, deixando a montagem do prompt por conta do builder do próprio child runtime.
- Modify: `apps/zcode-cli/packages/core/src/runtime/deps.ts`
  - se o barrel de deps do runtime exportar hoje `buildExploreSystemPrompt`, exportar/importar o novo builder em sincronia.
- Modify: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`
  - atualizar as asserções de system message provider-visible do Explore.
- Create: `apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts`
  - cobrir a montagem do child system prompt de Explore, general-purpose e custom agent.
- Modify: `docs/conversation-session-case-catalog.md`
  - adicionar ou atualizar a entrada de conversation E2E case para subagent prompt assembly.
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
  - atualizar o status de cobertura dos novos cases de missing/undefined para covered.
- Create or Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts`
  - rodar um E2E real de conversation/session pela janela em primeiro plano do desktop e verificar que o resultado corresponde ao esperado.
- Modify: documento de auditoria de diferenças históricas (removido)
  - atualizar o estado do prompt assembly: esta rodada só conclui o common context do child prompt e não reivindica alinhamento de tool/schema/background.

---

## Fase 1: Golden Tests For Child Prompt Shape

### Task 1: Add Provider-Visible Prompt Assembly Tests

**Files:**
- Create: `apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`

**Interfaces:**
- Consumes:
  - `AgentRuntime` from `apps/zcode-cli/packages/core/src/runtime.ts`
  - `createSessionId`, `ModelRole`, `ModelRefSource`, `modelMessageContentToText` from `@zcode/contracts`
- Produces:
  - Failing tests that describe final child provider request shape before implementation.

- [ ] **Step 1: Double-check frozen prompt body baseline**

Run:

```bash
rg -n "You are ZCode Explore|You are an agent for ZCode|buildExploreSystemPrompt|buildGeneralPurposeSystemPrompt" apps/zcode-cli/packages/core/src/subagent apps/zcode-cli/packages/core/tests/subagent-explore.test.ts
```

Expected:

- o body de Explore/general-purpose do ZCode bate exatamente com o texto esperado congelado em `subagent-explore.test.ts`.
- o body do ZCode não inclui variantes de texto específicas de modelo, de provider, históricas ou experimentais.

Se o body do ZCode não bater com o texto esperado congelado, não trate isso como fora de escopo. Adicione o body esperado aos testes que falham nesta tarefa e então alinhe a implementação na Task 2 antes de mudar a montagem das system messages.

- [ ] **Step 2: Create a helper to capture child provider requests**

Add this helper in `apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ModelRefSource,
  ModelRole,
  createModelId,
  createModelProviderId,
  createSessionId,
  modelMessageContentToText,
} from "@zcode/contracts";
import { AgentRuntime } from "../src/runtime.js";
import { createTestSessionEventStore } from "./test-event-store.js";

function createMainModelRef() {
  return {
    providerId: createModelProviderId("anthropic"),
    modelId: createModelId("claude-haiku-4-5-20251001-cc"),
    role: ModelRole.Main,
    source: ModelRefSource.Config,
  };
}

function systemContents(request: any): string[] {
  return request.messages
    .filter((message: any) => message.role === "system")
    .map((message: any) => message.content);
}

function allMessageText(request: any): string {
  return request.messages
    .map((message: any) => modelMessageContentToText(message.content))
    .join("\n");
}
```

- [ ] **Step 3: Add Explore system array test**

Add this test:

```ts
describe("subagent provider-visible prompt assembly", () => {
  it("assembles Explore child system messages with ZCode prefix, agent prompt, notes, and environment context", async () => {
    const sessionId = createSessionId("subagent-prompt-explore");
    const eventStore = createTestSessionEventStore();
    const childRequests: any[] = [];
    let parentCallCount = 0;

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "build",
        modelRef: createMainModelRef(),
        modelProviderOptions: { reasoningEffort: "medium" },
        bashShellSelection: {
          dialect: "git-bash",
          display: { name: "Git Bash" },
          path: "C:\\Program Files\\Git\\bin\\bash.exe",
          source: "user-config",
        },
        workingDirectory: "/Users/dev/Desktop/Z/z-code/apps/zcode-cli",
        currentDate: "2026-06-04",
        envInfo: {
          cwd: "/Users/dev/Desktop/Z/z-code/apps/zcode-cli",
          platform: "darwin",
          shell: "zsh",
          osVersion: "Darwin 24.3.0",
          nodeVersion: "24.14.0",
          isGitRepository: true,
        },
      },
      {
        eventStore,
        modelAdapter: {
          resolveConnection() {
            return {
              baseURL: "https://api.example.test/anthropic",
              providerId: "anthropic",
              providerKind: "anthropic",
            };
          },
          async generateText(request: any) {
            const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
            if (toolNames.includes("Agent")) {
              parentCallCount++;
              if (parentCallCount === 1) {
                return {
                  finishReason: "tool-calls",
                  model: request.model,
                  text: "",
                  toolCalls: [
                    {
                      id: "call_explore",
                      name: "Agent",
                      input: {
                        description: "Find runtime loop",
                        prompt: "Find where the runtime injects tool results.",
                        subagent_type: "Explore",
                      },
                    },
                  ],
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                };
              }
              return {
                finishReason: "stop",
                model: request.model,
                text: "parent used explore result",
                usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
              };
            }
            childRequests.push(request);
            return {
              finishReason: "stop",
              model: request.model,
              text: "Explore found the runtime path.",
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("Use an explore agent for this question");

    expect(childRequests).toHaveLength(1);
    const systems = systemContents(childRequests[0]);
    expect(systems).toHaveLength(4);
    expect(systems[0]).toBe("You are ZCode, an interactive coding agent");
    expect(systems[1]).toContain("You are ZCode Explore");
    expect(systems[1]).toContain("READ-ONLY MODE");
    expect(systems[1]).not.toContain("Agent threads always have their cwd reset");
    expect(systems[1]).not.toContain("Here is useful information about the environment");
    expect(systems[2]).toContain("Notes:");
    expect(systems[2]).toContain("Agent threads always have their cwd reset between bash calls");
    expect(systems[2]).toContain("the parent agent reads your text output");
    expect(systems[3]).toContain("Here is useful information about the environment you are running in:");
    expect(systems[3]).toContain("Working directory: /Users/dev/Desktop/Z/z-code/apps/zcode-cli");
    expect(systems[3]).toContain("Is directory a git repo: Yes");
    expect(systems[3]).toContain("Platform: darwin");
    expect(systems[3]).toContain("Shell: Git Bash");
    expect(systems[3]).toContain("OS Version: Darwin 24.3.0");
    expect(systems[3]).toContain("You are powered by the model named anthropic/claude-haiku-4-5-20251001-cc.");

    const text = allMessageText(childRequests[0]);
    expect(text).not.toContain("You help the user with software engineering work in the current workspace.");
    expect(text).not.toContain("# claudeMd");
    expect(text).not.toContain("# user_instructions");
    expect(text).not.toContain("Project context:");
  });
});
```

- [ ] **Step 4: Add general-purpose prompt test**

Add this test in the same `describe` block:

```ts
  it("adds common notes and environment context to general-purpose child prompts", async () => {
    const sessionId = createSessionId("subagent-prompt-general-purpose");
    const eventStore = createTestSessionEventStore();
    const childRequests: any[] = [];
    let parentCallCount = 0;

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "build",
        modelRef: createMainModelRef(),
        workingDirectory: "/repo",
        currentDate: "2026-06-04",
        envInfo: {
          cwd: "/repo",
          platform: "darwin",
          shell: "zsh",
          osVersion: "Darwin 24.3.0",
          nodeVersion: "24.14.0",
          isGitRepository: true,
        },
      },
      {
        eventStore,
        modelAdapter: {
          resolveConnection() {
            return {
              baseURL: "https://api.example.test/anthropic",
              providerId: "anthropic",
              providerKind: "anthropic",
            };
          },
          async generateText(request: any) {
            const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
            if (toolNames.includes("Agent")) {
              parentCallCount++;
              if (parentCallCount === 1) {
                return {
                  finishReason: "tool-calls",
                  model: request.model,
                  text: "",
                  toolCalls: [
                    {
                      id: "call_general",
                      name: "Agent",
                      input: {
                        description: "Research runtime",
                        prompt: "Research how child runtimes are created.",
                      },
                    },
                  ],
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                };
              }
              return {
                finishReason: "stop",
                model: request.model,
                text: "parent used general result",
                usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
              };
            }
            childRequests.push(request);
            return {
              finishReason: "stop",
              model: request.model,
              text: "General-purpose agent found the runtime path.",
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("Use a general-purpose agent for this question");

    const systems = systemContents(childRequests[0]);
    expect(systems).toHaveLength(4);
    expect(systems[0]).toBe("You are ZCode, an interactive coding agent");
    expect(systems[1]).toContain("You are an agent for ZCode");
    expect(systems[1]).toContain("the caller will relay this to the user");
    expect(systems[1]).not.toContain("Agent threads always have their cwd reset");
    expect(systems[2]).toContain("Agent threads always have their cwd reset between bash calls");
    expect(systems[3]).toContain("Working directory: /repo");
  });
```

- [ ] **Step 5: Add custom profile prompt test**

Add this test:

```ts
  it("adds common notes and environment context to custom child prompts", async () => {
    const sessionId = createSessionId("subagent-prompt-custom");
    const eventStore = createTestSessionEventStore();
    const childRequests: any[] = [];
    let parentCallCount = 0;

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "build",
        modelRef: createMainModelRef(),
        workingDirectory: "/repo",
        currentDate: "2026-06-04",
        envInfo: {
          cwd: "/repo",
          platform: "darwin",
          shell: "zsh",
          osVersion: "Darwin 24.3.0",
          nodeVersion: "24.14.0",
          isGitRepository: false,
        },
        subagents: {
          profiles: [
            {
              name: "code-researcher",
              description: "Research code paths.",
              color: "blue",
              source: "user",
              systemPrompt: "You are a focused code researcher. Return concise findings.",
              tools: ["Read", "Grep", "Glob"],
            },
          ],
        },
      },
      {
        eventStore,
        modelAdapter: {
          resolveConnection() {
            return {
              baseURL: "https://api.example.test/anthropic",
              providerId: "anthropic",
              providerKind: "anthropic",
            };
          },
          async generateText(request: any) {
            const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
            if (toolNames.includes("Agent")) {
              parentCallCount++;
              if (parentCallCount === 1) {
                return {
                  finishReason: "tool-calls",
                  model: request.model,
                  text: "",
                  toolCalls: [
                    {
                      id: "call_custom",
                      name: "Agent",
                      input: {
                        description: "Research custom",
                        prompt: "Research the custom profile path.",
                        subagent_type: "code-researcher",
                      },
                    },
                  ],
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                };
              }
              return {
                finishReason: "stop",
                model: request.model,
                text: "parent used custom result",
                usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
              };
            }
            childRequests.push(request);
            return {
              finishReason: "stop",
              model: request.model,
              text: "Custom agent found the runtime path.",
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("Use the custom researcher agent for this question");

    const systems = systemContents(childRequests[0]);
    expect(systems).toHaveLength(4);
    expect(systems[0]).toBe("You are ZCode, an interactive coding agent");
    expect(systems[1]).toBe("You are a focused code researcher. Return concise findings.");
    expect(systems[2]).toContain("Notes:");
    expect(systems[3]).toContain("Is directory a git repo: No");
  });
```

- [ ] **Step 6: Update existing Explore test expectation**

In `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`, replace the single combined `exploreSystemMessages` constant with split constants:

```ts
const exploreAgentPrompt = `...`;
const subagentCommonNotes = `...`;
const subagentEnvironmentContext = `...`;

const exploreSystemMessages = [
  "You are ZCode, an interactive coding agent",
  exploreAgentPrompt,
  subagentCommonNotes,
  subagentEnvironmentContext,
];
```

Mantenha o texto do body exatamente consistente com o novo builder da Fase 2. O leading newline esperado no `system[1]` antigo deve ser removido, porque as child system messages não são mais geradas pelo wrapping de custom prompt do `ContextBuilder`.

- [ ] **Step 7: Run failing tests**

Run:

```bash
pnpm --filter @zcode/core exec vitest run apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts
```

Expected before implementation:

- `subagent-prompt-assembly.test.ts` falha porque as child system messages ainda têm apenas duas entradas system ou Notes/env estão embutidos em `system[1]`.
- `subagent-explore.test.ts` falha depois de atualizar o shape split esperado.

---

## Fase 2: Shared Subagent Prompt Pieces

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/context/sections/env-info.ts`
- Create: `apps/zcode-cli/packages/core/src/subagent/system-prompt.ts`
- Modify: `apps/zcode-cli/packages/core/src/subagent/explore.ts`
- Modify: `apps/zcode-cli/packages/core/src/subagent/general-purpose.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/deps.ts`

**Interfaces:**
- Consumes:
  - `EnvInfo` from `@zcode/contracts`
  - `isEnvInfoGitRepository(info: EnvInfo): boolean` from `apps/zcode-cli/packages/core/src/context/sections/env-info.ts`
- Produces:
  - `buildSubagentCommonNotes(): string`
  - `buildSubagentEnvironmentContext(options): string`
  - `buildExploreAgentPrompt(options): string`

- [ ] **Step 1: Export main helper de deteccao de git repo**

Modify `apps/zcode-cli/packages/core/src/context/sections/env-info.ts`.

Substitua o helper privado:

```ts
function isGitRepository(info: EnvInfo): boolean {
  return info.isGitRepository ??
    (info.gitStatus !== undefined ? info.gitStatus !== "not_repo" : Boolean(info.gitBranch));
}
```

por:

```ts
export function isEnvInfoGitRepository(info: EnvInfo): boolean {
  return info.isGitRepository ??
    (info.gitStatus !== undefined ? info.gitStatus !== "not_repo" : Boolean(info.gitBranch));
}
```

Depois atualize os dois call sites existentes no mesmo arquivo:

```ts
const hasGitRepository = isEnvInfoGitRepository(info);
```

e:

```ts
if (!isEnvInfoGitRepository(envInfo)) {
  return null;
}
```

Isso mantém a detecção de git repo do subagent ligada à mesma lógica que o main usa hoje.

- [ ] **Step 2: Create the shared prompt-piece file**

Create `apps/zcode-cli/packages/core/src/subagent/system-prompt.ts`:

```ts
import type { EnvInfo } from "@zcode/contracts";
import { isEnvInfoGitRepository } from "../context/sections/env-info.js";

export interface SubagentEnvironmentContextOptions {
  agentPrompt: string;
  envInfo: EnvInfo;
}

export function buildSubagentCommonNotes(): string {
  return [
    "Notes:",
    "- Agent threads always have their cwd reset between bash calls, as a result please only use absolute file paths.",
    "- In your final response, share file paths (always absolute, never relative) that are relevant to the task. Include code snippets only when the exact text is load-bearing (e.g., a bug you found, a function signature the caller asked for) — do not recap code you merely read.",
    "- For clear communication with the user the assistant MUST avoid using emojis.",
    '- Do not use a colon before tool calls. Text like "Let me read the file:" followed by a read tool call should just be "Let me read the file." with a period.',
    "- Do NOT Write report/summary/findings/analysis .md files. Return findings directly as your final assistant message — the parent agent reads your text output, not files you create.",
  ].join("\n");
}

export function buildSubagentEnvironmentContext(options: SubagentEnvironmentContextOptions): string {
  const { envInfo } = options;
  const modelLine = envInfo.currentModel
    ? [`You are powered by the model named ${envInfo.currentModel}.`]
    : [];

  return [
    "Here is useful information about the environment you are running in:",
    "<env>",
    `Working directory: ${envInfo.cwd}`,
    `Is directory a git repo: ${isEnvInfoGitRepository(envInfo) ? "Yes" : "No"}`,
    `Platform: ${envInfo.platform}`,
    `Shell: ${envInfo.shell}`,
    `OS Version: ${envInfo.osVersion}`,
    "</env>",
    ...modelLine,
  ]
    .join("\n");
}
```

Fronteira importante:

- `buildSubagentEnvironmentContext(...)` usa um shape de seção de env de subagent fixo, mas os valores vêm do mesmo objeto `EnvInfo` que o main já usa.
- Não adicione `additionalWorkingDirectories`, knowledge cutoff, detalhes de snapshot do git, versão do node ou outros campos a menos que o context principal atual já os exponha no contexto provider-visible relevante.
- O model name é lido de `envInfo.currentModel`, seguindo o `createContextBuilderFromSnapshot(...)` do main, em vez de formatar model refs dentro do builder.

- [ ] **Step 3: Refactor Explore prompt to agent-specific prompt only**

In `apps/zcode-cli/packages/core/src/subagent/explore.ts`, rename `buildExploreSystemPrompt` to `buildExploreAgentPrompt` or keep the exported name with updated semantics if broader call sites are easier. Preferred:

```ts
export function buildExploreAgentPrompt(options: {
  embeddedSearchEnabled?: boolean;
}): string {
  const searchGuidelines = options.embeddedSearchEnabled
    ? [
        "- Use `find` via Bash for broad file pattern matching",
        "- Use `grep` via Bash for searching file contents with regex",
      ]
    : [
        "- Use Glob for broad file pattern matching",
        "- Use Grep for searching file contents with regex",
      ];
  const bashReadOnlyCommands = options.embeddedSearchEnabled
    ? "ls, git status, git log, git diff, find, grep, cat, head, tail"
    : "ls, git status, git log, git diff, find, cat, head, tail";

  return [
    "You are ZCode Explore, a file search and codebase research specialist for ZCode CLI. You excel at thoroughly navigating and exploring codebases.",
    "",
    "=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===",
    "This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:",
    "- Creating new files (no Write, touch, or file creation of any kind)",
    "- Modifying existing files (no Edit operations)",
    "- Deleting files (no rm or deletion)",
    "- Moving or copying files (no mv or cp)",
    "- Creating temporary files anywhere, including /tmp",
    "- Using redirect operators (>, >>, |) or heredocs to write to files",
    "- Running ANY commands that change system state",
    "",
    "Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools - attempting to edit files will fail.",
    "",
    "Your strengths:",
    "- Rapidly finding files using glob patterns",
    "- Searching code and text with powerful regex patterns",
    "- Reading and analyzing file contents",
    "",
    "Guidelines:",
    ...searchGuidelines,
    "- Use Read when you know the specific file path you need to read",
    `- Use Bash ONLY for read-only operations (${bashReadOnlyCommands})`,
    "- NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification",
    "- Adapt your search approach based on the thoroughness level specified by the caller",
    "- Communicate your final report directly as a regular message - do NOT attempt to create files",
    "",
    "NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:",
    "- Make efficient use of the tools that you have at your disposal: be smart about how you search for files and implementations",
    "- Wherever possible you should try to spawn multiple parallel tool calls for grepping and reading files",
    "",
    "Complete the user's search request efficiently and report your findings clearly.",
  ].join("\n");
}
```

Remova `workingDirectory`, `workspaceRoot`, `envInfo` e `modelName` das options desta função, porque agora pertencem a `buildSubagentEnvironmentContext(...)`.

- [ ] **Step 4: Align general-purpose body if the baseline check found drift**

If Task 1 Step 1 shows `apps/zcode-cli/packages/core/src/subagent/general-purpose.ts` has drifted from the frozen expected body, update `buildGeneralPurposeSystemPrompt()` before wiring the new system message builder.

Mantenha o body idêntico ao texto esperado congelado. Preserve exatamente a pontuação, as quebras de parágrafo e a redação operacional visíveis para o provider.

Não altere este arquivo se a verificação de baseline provar que ele já está alinhado.

- [ ] **Step 5: Keep a temporary compatibility export if needed**

If other imports still expect `buildExploreSystemPrompt`, add this shim in `explore.ts` during the refactor:

```ts
export const buildExploreSystemPrompt = buildExploreAgentPrompt;
```

Remove the shim only if all imports can be updated in the same task.

- [ ] **Step 6: Export the new prompt pieces through runtime deps**

In `apps/zcode-cli/packages/core/src/runtime/deps.ts`, export/import:

```ts
export { buildExploreAgentPrompt, EXPLORE_AGENT_TYPE } from "../subagent/explore.js";
export { buildSubagentCommonNotes, buildSubagentEnvironmentContext } from "../subagent/system-prompt.js";
```

If `deps.ts` currently exports `buildExploreSystemPrompt`, replace that export only after all call sites have moved.

- [ ] **Step 7: Run builder tests**

Run:

```bash
pnpm --filter @zcode/core exec vitest run apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts
```

Expected after Task 2 only:

- Os testes ainda podem falhar porque o runtime ainda não seleciona o subagent context builder.
- Qualquer erro direto de import/tipo das novas peças de prompt deve ser corrigido antes de prosseguir.

---

## Fase 3: Runtime Wiring With SubagentContextBuilder

### Task 3: Let Child Runtime Select Its Own Context Builder

**Files:**
- Create: `apps/zcode-cli/packages/core/src/subagent/context-builder.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`

**Interfaces:**
- Consumes:
  - `ContextBuildResult`, `ContextSection`, `ContextBuilderConfig` from context package
  - `buildSubagentCommonNotes(...)`
  - `buildSubagentEnvironmentContext(...)`
  - `buildExploreAgentPrompt(...)`
- Produces:
  - `AgentRuntimeConfig.subagentContext?: { agentPrompt: string }`
  - `SubagentContextBuilder` whose `build()` returns subagent sections, system messages, and meta-user attachments.

- [ ] **Step 1: Add `SubagentContextBuilder`**

Create `apps/zcode-cli/packages/core/src/subagent/context-builder.ts`.

The builder must extend or otherwise satisfy the runtime's existing context builder type and return a full `ContextBuildResult`:

```text
sections:
  CLI Prefix
  Subagent Agent Prompt
  Subagent Notes
  Subagent Environment
  Current Date, if present
  Skills, if declared and discovered

systemMessages:
  one provider-visible system message per subagent system section, all with ephemeral cache-control

metaUserAttachments:
  skills_listing for filtered declared skills
  context_prefix for currentDate
```

Do not include main identity, task behavior, project instructions, project context, memory, output style, or context management in this builder.

- [ ] **Step 2: Add `subagentContext` to runtime config**

In `apps/zcode-cli/packages/core/src/runtime/types.ts`, add near `systemPrompt?: string`:

```ts
  /**
   * Selects the subagent-specific context builder for child runtimes. The
   * builder still receives env/date/model data through the normal runtime
   * context snapshot, but assembles provider-visible system sections with the
   * subagent prompt shape instead of the main ContextBuilder stack.
   */
  subagentContext?: { agentPrompt: string };
```

- [ ] **Step 3: Select builder strategy in `createContextBuilderFromSnapshot(...)`**

In `apps/zcode-cli/packages/core/src/runtime/methods/context.ts`, keep the shared `envInfo = { ...snapshot.envInfo, currentModel: formatModelRef(this.defaultModelRef) }` logic. After persisting `envInfo`, add:

```ts
if (this.config.subagentContext) {
  return createSubagentContextBuilder({
    agentPrompt: this.config.subagentContext.agentPrompt,
    currentDate: snapshot.currentDate,
    envInfo,
    skillMetadataBudget: this.config.skillMetadataBudget,
    skills: this.skillLoadOutcome,
  });
}
```

Main runtime continues to use the existing `createContextBuilder(contextConfig)` path.

- [ ] **Step 4: Remove the `systemMessages` override branch**

`initializeMessageHistoryFromContext(...)` should simply build the currently selected builder and initialize history from that `ContextBuildResult`. Do not special-case subagent messages in this method. `refreshContextModelSnapshot(...)` should keep calling `createContextBuilderFromSnapshot(...)`; the selected builder strategy handles subagent refresh automatically.

- [ ] **Step 5: Pass `subagentContext` from `subagent.ts`**

In `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`, replace the current `systemPrompt` calculation with an `agentPrompt` calculation:

```ts
const agentPrompt =
  request.agentType === EXPLORE_AGENT_TYPE && request.systemPrompt?.trim() === ""
    ? buildExploreAgentPrompt({ embeddedSearchEnabled })
    : request.systemPrompt?.trim();
```

Passe ao `AgentRuntime` do child:

```ts
envInfo: childPromptEnvInfo,
subagentContext: {
  agentPrompt: agentPrompt ?? "",
},
```

Keep the existing `baseChildEnvInfo` source order:

```ts
this.contextSourceSnapshot?.envInfo ?? this.config.envInfo ?? fallbackUnknownEnvInfo
```

Mantenha o shell override existente de `getSessionShellEnvironment(this)` antes de adicionar `currentModel`. Isso reflete o caminho de context do main, em que `createContextBuilderFromSnapshot(...)` deriva o env info provider-visible do snapshot de context atual e acrescenta `currentModel: formatModelRef(this.defaultModelRef)`.

Do not add new env discovery, git probing, node-version output, knowledge-cutoff output, or additional-working-directory output in this task unless the current main prompt path already provides that exact data in provider-visible context.

- [ ] **Step 6: Keep current date behavior through shared meta-user context**

Do not put currentDate into the four subagent system messages. If `currentDate` exists, preserve the existing meta-user `context_prefix` path by including the normal current-date section in `SubagentContextBuilder.metaUserAttachments`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @zcode/core exec vitest run apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts
```

Expected:

- Os novos testes de prompt assembly passam.
- O teste existente do Explore passa depois de atualizar o split esperado das system messages.
- Se as falhas mostrarem texto duplicado de identity/dynamic prompt padrão, verifique se `initializeMessageHistoryFromContext` ainda roda depois de `systemMessages`.

---

## Fase 4: Documentation And Provider-Visible Verification

### Task 4: Document The Narrow Prompt Assembly Alignment

**Files:**
- Modify: documento de auditoria de diferenças históricas (removido)

**Interfaces:**
- Consumes:
  - Implementation result from Tasks 2-3.
- Produces:
  - Updated audit section that records exactly what is now aligned and what remains out of scope.

- [ ] **Step 1: Add a dated section**

Add a section near the prompt/system context part:

```md
## 2026-07-07 situação atual do prompt assembly de subagent

Esta rodada só convergei a montagem do system prompt provider-visible do child request de subagent comum, sem tratar o schema da tool `Agent` pai, a superfície de tools do child, SendMessage, notificação de background, hidratação de fork/repl nem teammate/worktree.

O body agent-specific de Explore/general-purpose usa apenas um texto congelado. Na execução desta rodada já foi feito double check da consistência entre o body atual do ZCode e o texto congelado; se houver drift, ele foi corrigido nesta rodada antes da divisão das system messages e da convergência da montagem. Não são introduzidas variantes de texto diferenciadas por modelo, provider, versão histórica ou branch de experimento.

Ordem atual das child system messages:

1. `You are ZCode, an interactive coding agent`
2. agent-specific prompt（body do Explore / general-purpose / custom profile）
3. common subagent Notes（cwd reset、absolute paths、no emoji、no colon before tool calls、não escrever report/summary/findings/analysis `.md`）
4. env/model context（working directory、git repo、platform、shell、OS version、model name）

A posição do segmento e a estrutura externa do 4º item são fixas, mas os valores de campo, o fallback, a exibição do shell, a deteccao de git repo e a formatação do model name seguem a lógica atual do main runtime/context builder: herdados de `contextSourceSnapshot.envInfo` / `config.envInfo`, com o shell override da session e `envInfo.currentModel` escrito por `formatModelRef(childModelRef)`. Dados que o main atual não oferece não são fabricados nesta rodada.

Isso preserva o prefixo de identidade de produto do ZCode e ao mesmo tempo unifica o body do prompt do child como a estrutura `agentPrompt + common Notes + env/model context`.
```

- [ ] **Step 2: Update gap matrix entry for child system prompt**

Find the row about `Child system prompt` and change status from broad unaligned wording to:

```md
As common Notes / env-model context do child system prompt comum já foram unificadas por um builder compartilhado; ainda não foram implementados a omissão de arquivos de instruções do projeto por agent somente leitura, agent memory, prompt de sistema adicional de subagent, a hidratação de fork/repl e a superfície de controle de teammate/worktree.
```

- [ ] **Step 3: Run doc grep sanity check**

Run:

```bash
# O documento de auditoria de diferenças históricas foi removido; este passo não é mais executado
```

Expected:

- A nova seção datada aparece.
- As funcionalidades restantes fora de escopo ainda estão listadas explicitamente.

### Task 5: Final Validation Checklist

**Files:**
- No code files; validation only.

**Interfaces:**
- Consumes:
  - All previous tasks.
- Produces:
  - Verification evidence for final report.

- [ ] **Step 1: Run focused prompt tests**

Run:

```bash
pnpm --filter @zcode/core exec vitest run apps/zcode-cli/packages/core/tests/subagent-prompt-assembly.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts
```

Expected:

- PASS.

- [ ] **Step 2: Run broader runtime prompt tests**

Run:

```bash
pnpm --filter @zcode/core exec vitest run apps/zcode-cli/packages/core/tests/context-builder.test.ts apps/zcode-cli/packages/core/tests/runtime-trace.test.ts
```

Expected:

- PASS.
- If failures are only stale expectations around child system prompt shape, update expectations to the new split system messages.
- If failures involve main-thread prompt shape, stop and inspect because this plan must not change main runtime ContextBuilder behavior.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

- PASS, or only known unrelated baseline failures. If failures are unrelated, record exact failing package/file in final report.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected:

- PASS, or only known unrelated baseline failures. If failures are unrelated, record exact failing package/file in final report.

- [ ] **Step 5: Inspect final child provider request shape from test capture**

Use the failing/passing test debug output only if needed. The final child request must satisfy:

```text
system[0] === "You are ZCode, an interactive coding agent"
system[1] contains agent-specific prompt
system[1] does not contain "Agent threads always have their cwd reset"
system[2] starts with "Notes:"
system[2] contains "the parent agent reads your text output"
system[3] starts with "Here is useful information about the environment you are running in:"
system[3] contains Working directory / git repo / Platform / Shell / OS Version / model name
```

### Task 6: Add And Run Foreground Desktop E2E

**Files:**
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Create or Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts`

**Interfaces:**
- Consumes:
  - Prompt assembly implementation from Tasks 2-3.
  - Existing desktop WDIO helpers under `packages/desktop/test/e2e/helpers/`.
  - Existing E2E command from `docs/testing/desktop-e2e-reporting.md`.
- Produces:
  - A desktop conversation/session E2E that opens the real Electron foreground window and verifies subagent prompt assembly behavior through user-visible flow plus provider/request evidence.

- [ ] **Step 1: Add or update the conversation-session case catalog**

In `docs/conversation-session-case-catalog.md`, add a case entry for subagent prompt assembly. Use the existing table style in that file, with this semantic content:

```md
| <next-id> | Subagent prompt assembly | o usuário inicia, pela janela em primeiro plano, uma conversa que dispara um subagent Explore/general-purpose | o system prompt provider-visible do sub agent preserva o prefixo do ZCode e separa agent prompt / common Notes / env-model context em system messages independentes; o prompt da thread principal não regride | covered | `conversation-session-subagent-prompt-assembly.test.ts` |
```

Use the next valid case id according to the current catalog conventions; do not invent a new numbering family if an existing subagent/conversation family already exists.

- [ ] **Step 2: Update the E2E coverage matrix**

In `docs/testing/conversation-session-e2e-coverage-matrix.md`, add or update the matching row:

```md
| <same-id> | Subagent prompt assembly | covered | `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts` | Verifies foreground-window conversation path and child provider-visible prompt shape |
```

Keep the row format consistent with the current matrix. If the matrix separates source case id, state, and spec path into different columns, fill the equivalent columns rather than copying this row literally.

- [ ] **Step 3: Write the desktop E2E spec**

Create `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts`.

The spec must:

- Launch the real desktop app through WDIO.
- Use an existing replay/mock provider helper so the run is deterministic.
- Create a conversation from the foreground Electron window.
- Send a prompt that triggers `Agent` with `subagent_type: "Explore"` or the default general-purpose agent.
- Wait for the subagent result to appear in the conversation.
- Inspect captured model request evidence or persisted model-io/debug artifact from the E2E run.
- Assert the child request system messages satisfy:

```text
system[0] === "You are ZCode, an interactive coding agent"
system[1] contains the agent-specific prompt
system[1] does not contain "Agent threads always have their cwd reset"
system[2] starts with "Notes:"
system[2] contains "the parent agent reads your text output"
system[3] starts with "Here is useful information about the environment you are running in:"
```

Use existing helpers from nearby specs rather than creating a parallel E2E harness. Good reference files to inspect before writing the spec:

```text
packages/desktop/test/e2e/conversation-session/conversation-session-subagent-provider-registry-cold-start.test.ts
packages/desktop/test/e2e/conversation-session/conversation-session-built-in-subagent-model-overrides.test.ts
packages/desktop/test/e2e/helpers/conversation-session.ts
packages/desktop/test/e2e/helpers/model-provider-replay.ts
packages/desktop/test/e2e/helpers/conversation-session-network.ts
```

- [ ] **Step 4: Run the E2E through the foreground desktop window**

Run the new spec with the local foreground Electron window, not only the container runner:

```bash
ZCODE_E2E_SPEC=./test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts pnpm --filter @zcode/desktop test:e2e
```

Expected:

- PASS.
- A real Electron desktop window is launched by WDIO during the run.
- The E2E report is written under `packages/desktop/.e2e-artifacts/<run-id>/`.
- The test result and captured provider/request evidence show the child system prompt split exactly as expected.

- [ ] **Step 5: Run conversation coverage audit**

Run:

```bash
pnpm audit:conversation-session-coverage
```

Expected:

- PASS.
- If the audit reports stale generated docs or missing coverage rows, update the catalog/matrix entries and rerun until it passes.

- [ ] **Step 6: Record E2E evidence in the final implementation report**

The final implementation report must include:

```text
E2E command:
ZCODE_E2E_SPEC=./test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts pnpm --filter @zcode/desktop test:e2e

E2E result:
PASS

Artifact path:
packages/desktop/.e2e-artifacts/<run-id>/

Provider-visible check:
child system[0..3] matched the expected prompt assembly shape
```

If the local machine cannot run foreground Electron E2E, do not mark the task complete. Report the blocker and leave the implementation uncommitted for review.

---

## Risks And Guardrails

- Risco de regressão do prompt principal: adicionar `systemMessages` não pode mudar o comportamento do `ContextBuilder` do runtime main. Proteja com `context-builder.test.ts` e `runtime-trace.test.ts`.
- Ambiguidade do contexto de data: os testes child atuais afirmam `# currentDate`; o env/model context alvo não inclui data. Não adicione uma nova seção de data a menos que a semântica atual do produto exija isso; se for mantida em outro lugar, documente a origem separadamente.
- Drift da lógica de env do main: o env/model context não deve virar um segundo formatador de ambiente independente. Reutilize a ordem de origem do `EnvInfo` do main, o shell override, o helper booleano de git repo e a formatação de `currentModel`; não adicione campos que o main não fornece.
- Drift do leading newline do custom prompt: o custom prompt atual do `ContextBuilder` adiciona `\n` antes do `system[1]`. As novas child system messages não devem herdar esse leading newline a menos que um fixture provider-visible prove que ele é necessário.
- Drift de branch de texto: o body de Explore/general-purpose usa um único texto congelado. A execução precisa fazer double check do body atual contra o texto esperado congelado antes da implementação; se houver drift, alinhe o body nesta mudança antes de mover seções entre system messages.
- Drift de nomenclatura: os nomes de helpers de código devem ser locais e semânticos, como `createSubagentContextBuilder`, e não específicos de produtos externos.
- Expansão de escopo: se a implementação começar a tocar tool schemas, background, SendMessage ou comportamento de MCP required server, pare e separe um plano próprio.
- Risco de conclusão do E2E: testes unitários não bastam para esta mudança. A conclusão exige um spec E2E de desktop e uma execução bem-sucedida com WDIO na janela em primeiro plano.
- Guarda de commit: não crie um commit git automaticamente após a implementação ou a validação. Deixe as mudanças na working tree, a menos que o usuário peça explicitamente um commit.

## Critérios de Conclusão

- Existe o novo builder compartilhado e ele é usado pelos runtimes child de Explore, general-purpose e custom.
- O body agent-specific de Explore/general-purpose passou por double check contra o texto esperado congelado e permanece ou foi trazido para o alinhamento, sem mistura de texto específico de modelo/provider/histórico/experimental.
- O prompt do Explore não embute mais common Notes/env/model context.
- O env/model context do subagent usa o posicionamento e a forma externa fixos da seção, enquanto valores de campo/fallbacks seguem a lógica atual do main runtime/context builder.
- As child system messages provider-visible são divididas em quatro entradas, com o prefixo do ZCode em `system[0]`.
- A montagem do prompt da thread principal permanece inalterada.
- Os testes focados de prompt passam.
- Um spec E2E de conversation-session cobre esse comportamento de prompt assembly.
- O spec E2E foi executado pela janela local do Electron em primeiro plano com `ZCODE_E2E_SPEC=./test/e2e/conversation-session/conversation-session-subagent-prompt-assembly.test.ts pnpm --filter @zcode/desktop test:e2e`, e o resultado é PASS.
- `pnpm audit:conversation-session-coverage` passa depois das atualizações de catálogo/matrix.
- `pnpm typecheck` e `pnpm lint` foram executados, com quaisquer falhas de baseline não relacionadas explicitamente reportadas.
- Nenhum commit automático é criado. O estado final permanece revisável na working tree até o usuário pedir explicitamente um commit.