# Plano de Implementação do Limite de Permissão MCP no Plan Mode

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer com que as ferramentas MCP no Plan mode dispensem a verificação normal de somente leitura, mas ainda preservem a identificação de identidade MCP, o bloqueio explícito de operações destrutivas, as regras deny/ask do projeto e a proteção de escrita já existente para ferramentas não MCP.

**Arquitetura:** Não alterar o registry MCP, metadados, protocolo ou UI. As ferramentas MCP continuam registradas por `apps/zcode-cli/packages/core/src/mcp/index.ts`, e a camada de permissão identifica o MCP pela `capability.permissionName` formada por `permission.permission === "mcp"`. O Plan mode apenas adiciona um ramo de permissão exclusivo para MCP, evitando liberar também ferramentas desconhecidas comuns ou nomes falsos com `mcp__`.

**Stack técnico:** TypeScript, Vitest, serviço de permissão do `@zcode/core`, MCP bridge, loop de ferramentas do runtime ZCode.

## Restrições globais

- Atualizar primeiro a spec de documentação, depois alterar testes e código.
- Não modificar `packages/shared/src/zcode-protocol/index.ts`, pois esta mudança não adiciona campos de protocolo.
- Não modificar o registry / metadados / contrato de ferramentas visíveis ao modelo do MCP.
- Não modificar a UI; não envolve `packages/ui` nem `DESIGN.md`.
- Não usar `toolName.startsWith("mcp__")` como critério principal; a identidade MCP é determinada por `permission.permission === "mcp"`.
- No Plan mode, o deny/ask do projeto continua tendo prioridade sobre o allow exclusivo de MCP.
- No Plan mode, um MCP com `destructiveHint: true` explícito ainda é rejeitado.
- No Plan mode, um MCP com `permission.permission === "mcp"` e `destructive !== true` tem sua execução permitida, mesmo que `readOnlyHint` esteja ausente ou seja `false`.
- Manter inalteradas as regras específicas existentes de `ExitPlanMode` / `EnterPlanMode`.
- Não fazer commit automaticamente, a menos que o usuário solicite explicitamente depois.

---

## Fase 0: Mapa de arquivos e responsabilidades

**Arquivos com alterações planejadas:**

- Modificar: `docs/plan-mode-approval-boundary.md`
  - Registrar a semântica de exceção do MCP no Plan mode, deixando claro que "dispensar a verificação de readonly" não significa "dispensar destructive / regras do projeto".
- Modificar: `apps/zcode-cli/packages/core/src/permission/service.ts`
  - Adicionar um ramo exclusivo para MCP em `PermissionService.checkPlanMode()`.
  - Adicionar um helper privado que centralize a verificação de `capability.permissionName === "mcp"`.
- Modificar: `apps/zcode-cli/packages/core/tests/permission-service.test.ts`
  - Cobrir a política de MCP em plan mode na camada do serviço de permissão.
- Modificar: `apps/zcode-cli/packages/core/tests/mcp-runtime.test.ts`
  - Cobrir, no runtime real, que uma ferramenta MCP pode ser executada no Plan mode sem passar pelo permission broker.

**Arquivos não alterados:**

- `apps/zcode-cli/packages/core/src/mcp/index.ts`
  - O MCP continua mapeando `readOnly` / `destructive` por anotação do descriptor.
- `apps/zcode-cli/packages/core/src/tool/executor/permission-flow.ts`
  - Já mescla `entry.permission.permission` em `PermissionToolCapability.permission.permission`.
- `packages/shared/src/zcode-protocol/index.ts`
  - Não há mudança de protocolo.
- `packages/ui/**`
  - Não há mudança de interação de UI.

---

## Fase 1: Atualizar primeiro a spec de comportamento

### Tarefa 1: Atualizar a documentação do limite de permissão MCP do Plan mode

**Arquivos:**

- Modificar: `docs/plan-mode-approval-boundary.md`

**Interfaces:**

- Consome: a semântica de aprovação de `ExitPlanMode` na documentação atual do Plan mode.
- Produz: a semântica de exceção do MCP que implementação e testes seguirão em conjunto.

- [ ] **Passo 1: Adicionar a explicação da exceção do MCP após a seção "Semântica" da documentação**

Acrescentar após a lista `## 语义` em `docs/plan-mode-approval-boundary.md`:

```md

## MCP 工具例外

Plan mode 默认只允许只读、非 destructive 的工具执行。MCP 工具是外部 server 动态暴露的能力，部分工具不会声明 `readOnlyHint`，但仍需要在计划阶段用于读取外部上下文、设备状态或远端资料。

因此 Plan mode 对 MCP 工具使用独立权限边界：

- MCP 身份由工具权限声明 `permission.permission === "mcp"` 识别，不靠 `mcp__` 名称前缀推断。
- 项目级 `deny` / `ask` 规则仍优先生效，不能被 MCP 例外绕过。
- 显式声明 `destructiveHint: true` 的 MCP 工具仍在 Plan mode 下拒绝执行。
- 未显式 destructive 的 MCP 工具允许在 Plan mode 下执行，即使该工具没有声明 `readOnlyHint: true`。
- 该例外只跳过 Plan mode 的 readonly 判定，不改变 MCP 工具注册、模型可见 schema、输出预算、timeout、取消、日志或 UI 权限展示协议。
```

- [ ] **Passo 2: Autoverificar os limites da documentação**

Verificar se a documentação afirma simultaneamente que:

- A origem da identificação MCP é a declaração de permissão.
- MCP destrutivo ainda é rejeitado.
- deny/ask do projeto ainda tem prioridade.
- UI / protocolo não são alterados.

Executar:

```sh
rg -n "MCP 工具例外|permission.permission|destructiveHint|项目级" docs/plan-mode-approval-boundary.md
```

Esperado:

```text
docs/plan-mode-approval-boundary.md:<line>:## MCP 工具例外
docs/plan-mode-approval-boundary.md:<line>:- MCP 身份由工具权限声明 `permission.permission === "mcp"` 识别，不靠 `mcp__` 名称前缀推断。
docs/plan-mode-approval-boundary.md:<line>:- 项目级 `deny` / `ask` 规则仍优先生效，不能被 MCP 例外绕过。
docs/plan-mode-approval-boundary.md:<line>:- 显式声明 `destructiveHint: true` 的 MCP 工具仍在 Plan mode 下拒绝执行。
```

---

## Fase 2: Adicionar primeiro os testes que falham na camada do PermissionService

### Tarefa 2: Cobrir a política de MCP no Plan mode

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/permission-service.test.ts`

**Interfaces:**

- Consome: `PermissionService.checkPermission(context, capability, projectRules?)`
- Produz: o novo comportamento esperado, que orienta a implementação de `checkPlanMode()`.

- [ ] **Passo 1: Adicionar fixtures de capability de MCP**

Adicionar após as fixtures existentes no topo de `permission-service.test.ts`:

```ts
const mcpCapability: PermissionToolCapability = {
  destructive: false,
  needsApproval: true,
  permission: {
    denyPriority: "beforeAsk",
    needsApproval: true,
    permission: "mcp",
    reason: "MCP tool executes through an external server",
    riskLevel: "medium",
    sideEffectScope: "network",
  },
  readOnly: false,
  riskLevel: "medium",
  sideEffectScope: "network",
};

const destructiveMcpCapability: PermissionToolCapability = {
  ...mcpCapability,
  destructive: true,
  permission: {
    ...mcpCapability.permission!,
    riskLevel: "high",
  },
  riskLevel: "high",
};

const fakeMcpNameCapability: PermissionToolCapability = {
  destructive: false,
  needsApproval: true,
  readOnly: false,
  riskLevel: "medium",
  sideEffectScope: "network",
};
```

- [ ] **Passo 2: Escrever o teste que falha para MCP não readonly, porém não destrutivo**

Adicionar dentro de `describe("PermissionService mode policy", () => {`, perto dos testes de Plan mode:

```ts
  it("allows non-destructive MCP tools in plan mode without requiring readOnly metadata", () => {
    const service = new PermissionService();

    const decision = service.checkPermission(
      {
        input: { query: "current simulator state" },
        mode: "plan",
        riskLevel: "medium",
        toolName: "mcp__ios_simulator__status",
      },
      mcpCapability,
    );

    expect(decision).toMatchObject({
      allowed: true,
      decision: "allow",
      ruleId: "mode.plan.mcp",
      sideEffectScope: "network",
    });
  });
```

- [ ] **Passo 3: Escrever o teste que falha para MCP destrutivo ainda rejeitado**

Continuar adicionando no mesmo describe:

```ts
  it("denies destructive MCP tools in plan mode", () => {
    const service = new PermissionService();

    const decision = service.checkPermission(
      {
        input: { target: "device" },
        mode: "plan",
        riskLevel: "high",
        toolName: "mcp__device__reset",
      },
      destructiveMcpCapability,
    );

    expect(decision).toMatchObject({
      allowed: false,
      decision: "deny",
      ruleId: "mode.plan.nonReadOnly",
    });
  });
```

- [ ] **Passo 4: Escrever o teste que falha para nome falso de MCP não aprovado**

Continuar adicionando no mesmo describe:

```ts
  it("does not treat an mcp-prefixed tool name as MCP without the mcp permission declaration", () => {
    const service = new PermissionService();

    const decision = service.checkPermission(
      {
        input: {},
        mode: "plan",
        riskLevel: "medium",
        toolName: "mcp__fake__write",
      },
      fakeMcpNameCapability,
    );

    expect(decision).toMatchObject({
      allowed: false,
      decision: "deny",
      ruleId: "mode.plan.nonReadOnly",
    });
  });
```

- [ ] **Passo 5: Escrever os testes que falham para deny/ask do projeto com prioridade sobre a exceção de MCP**

Continuar adicionando no mesmo describe:

```ts
  it("lets project deny rules override the plan-mode MCP exception", () => {
    const service = new PermissionService();

    const decision = service.checkPermission(
      {
        input: { query: "secret" },
        mode: "plan",
        riskLevel: "medium",
        toolName: "mcp__external__search",
      },
      mcpCapability,
      {
        version: 1,
        deny: [{ toolName: "mcp__external__search" }],
      },
    );

    expect(decision).toMatchObject({
      allowed: false,
      decision: "deny",
      ruleId: "rule.project.deny",
    });
  });

  it("lets project ask rules override the plan-mode MCP exception", () => {
    const service = new PermissionService();

    const decision = service.checkPermission(
      {
        input: { query: "maybe external" },
        mode: "plan",
        riskLevel: "medium",
        toolName: "mcp__external__search",
      },
      mcpCapability,
      {
        version: 1,
        ask: [{ toolName: "mcp__external__search" }],
      },
    );

    expect(decision).toMatchObject({
      allowed: false,
      decision: "ask",
      ruleId: "rule.project.ask",
    });
  });
```

- [ ] **Passo 6: Executar os testes e confirmar a falha**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run tests/permission-service.test.ts
```

Esperado antes da implementação:

```text
FAIL  tests/permission-service.test.ts
...
expected ... ruleId ... "mode.plan.mcp"
```

---

## Fase 3: Implementar o ramo exclusivo de MCP do Plan mode

### Tarefa 3: Adicionar a exceção de MCP no PermissionService

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/src/permission/service.ts`

**Interfaces:**

- Consome:
  - `ResolvedPermissionCapability.permissionName?: string`
  - `ResolvedPermissionCapability.destructive: boolean`
- Produz:
  - regra allow `mode.plan.mcp`
  - helper centralizado de identificação MCP

- [ ] **Passo 1: Modificar `checkPlanMode()`**

Substituir o `checkPlanMode()` atual por:

```ts
  private checkPlanMode(
    context: PermissionContext,
    capability: ResolvedPermissionCapability,
  ): PermissionDecisionResult {
    if (capability.readOnly && !capability.destructive) {
      return this.allow(
        context,
        capability,
        "mode.plan.readOnly",
        "Plan mode allows read-only tool execution",
      );
    }

    if (this.isMcpToolCapability(capability) && !capability.destructive) {
      return this.allow(
        context,
        capability,
        "mode.plan.mcp",
        "Plan mode allows non-destructive MCP tool execution",
      );
    }

    return this.deny(
      context,
      capability,
      "mode.plan.nonReadOnly",
      "Plan mode only allows read-only, non-destructive tools",
    );
  }
```

- [ ] **Passo 2: Adicionar o helper de identidade MCP**

Adicionar um método privado próximo de `checkPlanMode()`:

```ts
  private isMcpToolCapability(capability: ResolvedPermissionCapability): boolean {
    return capability.permissionName === "mcp";
  }
```

- [ ] **Passo 3: Manter `resolveCapability()` inalterado**

Confirmar que `resolveCapability()` ainda preserva:

```ts
      permissionName: toolCapability?.permission?.permission,
```

Não adicionar nenhuma verificação `toolName.startsWith("mcp__")`.

- [ ] **Passo 4: Executar os testes do PermissionService e confirmar que passam**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run tests/permission-service.test.ts
```

Esperado:

```text
Test Files  1 passed (1)
```

---

## Fase 4: Complementar a regressão no nível do MCP bridge e do runtime

### Tarefa 4: Cobrir o mapeamento do descriptor MCP para metadados destrutivos

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/mcp-tool-bridge.test.ts`

**Interfaces:**

- Consome: `registerMcpTools(registry, mcpPort, descriptors)`
- Produz: um teste provando que `destructiveHint: true` vira `entry.metadata.destructive === true` e risco alto.

- [ ] **Passo 1: Adicionar teste de mapeamento de destructiveHint**

Adicionar dentro de `describe("MCP tool bridge", () => {`:

```ts
  it("maps destructive MCP annotations into tool metadata", () => {
    const registry = createToolRegistry();
    const mcpPort = createMockMcpPort();

    registerMcpTools(registry, mcpPort, [
      {
        serverName: "device",
        toolName: "reset",
        description: "Reset a device",
        inputSchema: { type: "object" },
        annotations: {
          destructiveHint: true,
        },
      },
    ]);

    const entry = registry.get("mcp__device__reset");

    expect(entry?.metadata).toMatchObject({
      destructive: true,
      readOnly: false,
      riskLevel: "high",
      sideEffectScope: "network",
    });
    expect(entry?.permission).toMatchObject({
      permission: "mcp",
      riskLevel: "high",
      sideEffectScope: "network",
    });
  });
```

- [ ] **Passo 2: Executar os testes do MCP bridge**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run tests/mcp-tool-bridge.test.ts
```

Esperado:

```text
Test Files  1 passed (1)
```

### Tarefa 5: Cobrir a execução real de ferramenta MCP no Plan mode

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/mcp-runtime.test.ts`

**Interfaces:**

- Consome:
  - `AgentRuntime`
  - `createMockMcpPort(...)`
  - registro MCP na inicialização do runtime
- Produz: regressão no runtime real: no Plan mode, uma ferramenta MCP sem `readOnlyHint` não é bloqueada por `mode.plan.nonReadOnly`.

- [ ] **Passo 1: Adicionar `type PermissionBrokerPort` aos imports**

Ajustar os imports atuais para incluir:

```ts
  type PermissionBrokerPort,
```

Ou seja:

```ts
import {
  SessionEventType,
  createSessionId,
  type McpConnectionSnapshot,
  type McpPort,
  type PermissionBrokerPort,
  type SessionEventStorePort,
  type SessionId,
} from "@zcode/contracts";
```

- [ ] **Passo 2: Adicionar teste de execução de MCP no Plan mode**

Adicionar dentro de `describe("AgentRuntime MCP integration", () => {`:

```ts
  it("executes non-destructive MCP tools in plan mode without readOnlyHint", async () => {
    const sessionId = createSessionId("runtime-mcp-plan-mode");
    const eventStore = createTestSessionEventStore();
    let modelCallCount = 0;
    let mcpCallCount = 0;
    let permissionRequestCount = 0;

    const permissionBroker: PermissionBrokerPort = {
      async requestPermission() {
        permissionRequestCount++;
        return {
          decision: "deny",
          reason: "permission broker should not be called for plan-mode MCP allow",
        };
      },
    };

    const mcpPort = createMockMcpPort({
      connectConfiguredServers: async () => ({
        statuses: {
          local: {
            status: "connected",
            transport: "stdio",
            toolCount: 1,
            updatedAt: "now",
          },
        },
        tools: [
          {
            serverName: "local",
            toolName: "lookup",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
            },
          },
        ],
      }),
      callTool: async (request) => {
        mcpCallCount++;
        return {
          content: [{ type: "text", text: `lookup:${request.arguments?.query}` }],
        };
      },
    });

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "plan",
        mcp: {
          enabled: true,
          servers: {
            local: {
              type: "stdio",
              command: "node",
              args: ["server.js"],
            },
          },
        },
      },
      {
        eventStore,
        mcpPort,
        permissionBroker,
        modelAdapter: {
          async generateText(request: any) {
            modelCallCount++;
            if (modelCallCount === 1) {
              expect(request.tools.map((tool: { name: string }) => tool.name)).toContain(
                "mcp__local__lookup",
              );
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "I will look this up.",
                toolCalls: [
                  {
                    id: "mcp-lookup",
                    name: "mcp__local__lookup",
                    input: { query: "plan context" },
                  },
                ],
                usage: {
                  inputTokens: 1,
                  outputTokens: 1,
                  totalTokens: 2,
                },
              };
            }

            expect(request.messages.some((message: any) => {
              return message.role === "tool" && String(message.content).includes("lookup:plan context");
            })).toBe(true);

            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "done",
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
              },
            };
          },
        } as never,
      },
    );

    const result = await runtime.executeTurn("use mcp while planning");

    expect(result.response).toBe("done");
    expect(mcpCallCount).toBe(1);
    expect(permissionRequestCount).toBe(0);
  });
```

- [ ] **Passo 3: Adicionar teste de MCP destrutivo não executado no Plan mode**

Adicionar no mesmo describe:

```ts
  it("denies destructive MCP tools in plan mode before calling the MCP server", async () => {
    const sessionId = createSessionId("runtime-mcp-plan-destructive");
    const eventStore = createTestSessionEventStore();
    let modelCallCount = 0;
    let mcpCallCount = 0;
    let secondRequest: any;

    const mcpPort = createMockMcpPort({
      connectConfiguredServers: async () => ({
        statuses: {
          device: {
            status: "connected",
            transport: "stdio",
            toolCount: 1,
            updatedAt: "now",
          },
        },
        tools: [
          {
            serverName: "device",
            toolName: "reset",
            inputSchema: {
              type: "object",
              properties: {},
            },
            annotations: {
              destructiveHint: true,
            },
          },
        ],
      }),
      callTool: async () => {
        mcpCallCount++;
        return { content: [{ type: "text", text: "should-not-run" }] };
      },
    });

    const runtime = new AgentRuntime(
      sessionId,
      {
        mode: "plan",
        mcp: {
          enabled: true,
          servers: {
            device: {
              type: "stdio",
              command: "node",
              args: ["server.js"],
            },
          },
        },
      },
      {
        eventStore,
        mcpPort,
        modelAdapter: {
          async generateText(request: any) {
            modelCallCount++;
            if (modelCallCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "I will reset the device.",
                toolCalls: [
                  {
                    id: "mcp-reset",
                    name: "mcp__device__reset",
                    input: {},
                  },
                ],
                usage: {
                  inputTokens: 1,
                  outputTokens: 1,
                  totalTokens: 2,
                },
              };
            }

            secondRequest = request;
            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "done",
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
              },
            };
          },
        } as never,
      },
    );

    const result = await runtime.executeTurn("do not mutate while planning");
    const toolMessage = secondRequest.messages.find((message: any) => message.role === "tool");

    expect(result.response).toBe("done");
    expect(mcpCallCount).toBe(0);
    expect(toolMessage?.content).toContain("Plan mode only allows read-only, non-destructive tools");
  });
```

- [ ] **Passo 4: Executar os testes do MCP runtime**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run tests/mcp-runtime.test.ts
```

Esperado:

```text
Test Files  1 passed (1)
```

---

## Fase 5: Verificação de regressão e revisão

### Tarefa 6: Verificação agregada

**Arquivos:**

- Apenas testes; nenhuma alteração de código-fonte esperada.

**Interfaces:**

- Consome: todas as alterações das Fases 1 a 4.
- Produz: uma conclusão de verificação entregável.

- [ ] **Passo 1: Executar os testes focados de permissão e MCP**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run \
  tests/permission-service.test.ts \
  tests/mcp-tool-bridge.test.ts \
  tests/mcp-runtime.test.ts
```

Esperado:

```text
Test Files  3 passed (3)
```

- [ ] **Passo 2: Executar a regressão relacionada ao runtime tool loop**

Executar:

```sh
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts -t "continues later tool calls after a blocking permission denial"
```

Esperado:

```text
Test Files  1 passed (1)
```

Propósito:

- Confirmar que, no Plan mode, ferramentas de escrita não MCP ainda são bloqueadas.
- Confirmar que, após o bloqueio, as ferramentas somente leitura subsequentes ainda podem ser executadas.

- [ ] **Passo 3: Executar o typecheck do core**

Executar:

```sh
pnpm --filter @zcode/core typecheck
```

Esperado:

```text
No TypeScript errors from @zcode/core
```

- [ ] **Passo 4: Executar o lint da raiz**

Executar:

```sh
pnpm lint
```

Esperado:

```text
Lint passes, or only reports pre-existing unrelated warnings/errors.
```

Se o lint da raiz relatar falhas existentes não relacionadas, registrar o arquivo e a mensagem exatos no relatório final. Não corrigir arquivos não relacionados nesta tarefa.

- [ ] **Passo 5: Executar o typecheck da raiz**

Executar:

```sh
pnpm typecheck
```

Esperado:

```text
Typecheck passes, or only reports pre-existing unrelated failures.
```

Se o typecheck da raiz ainda falhar com as declarações conhecidas e não relacionadas de Istanbul do desktop e2e, registrar a falha exata e manter esta tarefa delimitada.

---

## Fase 6: Checklist final de revisão manual

### Tarefa 7: Revisão das mudanças e nota de entrega

**Arquivos:**

- Revisar:
  - `docs/plan-mode-approval-boundary.md`
  - `apps/zcode-cli/packages/core/src/permission/service.ts`
  - `apps/zcode-cli/packages/core/tests/permission-service.test.ts`
  - `apps/zcode-cli/packages/core/tests/mcp-tool-bridge.test.ts`
  - `apps/zcode-cli/packages/core/tests/mcp-runtime.test.ts`

**Interfaces:**

- Consome: todos os resultados de implementação e verificação.
- Produz: a nota final para revisão do usuário.

- [ ] **Passo 1: Verificar que UI/protocol/registry não foram alterados indevidamente**

Executar:

```sh
git diff --name-only
```

Arquivos esperados apenas:

```text
docs/plan-mode-approval-boundary.md
apps/zcode-cli/packages/core/src/permission/service.ts
apps/zcode-cli/packages/core/tests/permission-service.test.ts
apps/zcode-cli/packages/core/tests/mcp-tool-bridge.test.ts
apps/zcode-cli/packages/core/tests/mcp-runtime.test.ts
docs/superpowers/plans/2026-07-07-plan-mode-mcp-permission.md
```

- [ ] **Passo 2: Verificar que não há critério principal baseado no prefixo toolName**

Executar:

```sh
rg -n "startsWith\\(\\\"mcp__\\\"\\)|mode\\.plan\\.mcp|permissionName === \\\"mcp\\\"" apps/zcode-cli/packages/core/src/permission apps/zcode-cli/packages/core/tests
```

Esperado:

- `permissionName === "mcp"` aparece apenas no helper ou em semântica relacionada a asserções de teste.
- `mode.plan.mcp` aparece na implementação e nos testes.
- Nenhum código novo usa `startsWith("mcp__")` como critério principal de permissão.

- [ ] **Passo 3: Verificar que a semântica de destructive não foi sobrescrita**

Executar:

```sh
rg -n "destructive MCP|destructiveHint|mode.plan.nonReadOnly|mode.plan.mcp" apps/zcode-cli/packages/core/tests docs/plan-mode-approval-boundary.md
```

Esperado:

- A documentação contém que MCP destrutivo ainda é rejeitado.
- `permission-service.test.ts` contém a rejeição de MCP destrutivo.
- `mcp-runtime.test.ts` contém que MCP destrutivo não chama o server.

- [ ] **Passo 4: Preparar a nota final**

A nota final deve conter:

- Os arquivos efetivamente alterados nesta rodada.
- A nova semântica de MCP no Plan mode.
- Os comandos de verificação e seus resultados.
- Se houve comandos que não puderam ser verificados por completo.
- Que nenhum commit foi feito, aguardando um pedido explícito do usuário.

---

## Plano de commit

Commitar somente quando o usuário disser explicitamente "帮我提交吧" ("me ajude a commitar").

Mensagem de commit sugerida:

```text
fix(zcode-cli): allow non-destructive mcp tools in plan mode
```

Antes de commitar, é obrigatório executar novamente:

```sh
pnpm --filter @zcode/core exec vitest run \
  tests/permission-service.test.ts \
  tests/mcp-tool-bridge.test.ts \
  tests/mcp-runtime.test.ts
pnpm --filter @zcode/core typecheck
pnpm lint
```

Comando de commit:

```sh
git add \
  docs/plan-mode-approval-boundary.md \
  apps/zcode-cli/packages/core/src/permission/service.ts \
  apps/zcode-cli/packages/core/tests/permission-service.test.ts \
  apps/zcode-cli/packages/core/tests/mcp-tool-bridge.test.ts \
  apps/zcode-cli/packages/core/tests/mcp-runtime.test.ts \
  docs/superpowers/plans/2026-07-07-plan-mode-mcp-permission.md
git commit -m "fix(zcode-cli): allow non-destructive mcp tools in plan mode"
```

---

## Auto-revisão

- Cobertura da spec: a Fase 1 escreve a spec de exceção de MCP do Plan mode; as Fases 2 a 5 cobrem permissão, MCP bridge, runtime e verificação.
- Varredura de placeholders: sem TBD / TODO / implementar depois.
- Consistência de tipos: usa o `PermissionToolCapability`, `ResolvedPermissionCapability.permissionName`, `PermissionService.checkPermission()`, `registerMcpTools()` e `AgentRuntime` já existentes.
- Verificação de escopo: não altera a UI, o protocolo, o MCP registry nem o contrato visível ao modelo.
- Nota de risco: `destructiveHint` vem da anotação do MCP server, e a implementação atual só reconhece `destructiveHint: true` explícito; um MCP sem a anotação é tratado como não destrutivo, e esse é um limite de produto explicitamente aceito por este plano.