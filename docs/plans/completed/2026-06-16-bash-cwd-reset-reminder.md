# Plano de implementação do lembrete de reset de cwd do Bash

> **Requisitos para o agente executor:** implemente este plano item a item. Acompanhe cada passo com checkbox; antes de executar mudanças de código, escreva os testes primeiro. Recomenda-se usar `superpowers:executing-plans` para executar por tarefa. Não faça commit automático, a menos que o usuário peça explicitamente.

**Objetivo:** implementar o tratamento de cwd drift do Bash na thread principal: após uma execução de Bash em foreground bem-sucedida, se o cwd final ainda estiver dentro dos limites do projeto, persistir o cwd; se o cwd final tiver saído do projeto, resetar o cwd do runtime de volta para a raiz do projeto e acrescentar `Shell cwd was reset to <root>` ao resultado do Bash visível ao provider.

**Arquitetura:** não introduzir shell residente, nem adicionar um novo system-reminder global. Continuar usando o canal de captura existente `ExecutionResult.resolvedCwd` e adicionar dentro do handler do Bash uma pequena camada de política de cwd que decida centralmente se o cwd é atualizado, se há reset e se o texto de stderr do Bash é acrescentado. Outras ferramentas, hooks, Bash em background, Bash com falha e Bash com timeout não consomem essa policy.

**Stack técnico:** TypeScript, Vitest, `@zcode/contracts`, `@zcode/core`, captura de cwd existente via `ExecutionPort`.

## Status de execução

Revisão concluída de acordo com a implementação atual. A implementação final tem duas estreitamento intencionais em relação ao plano original:

- Não há mais suporte ao ramo adicional que mantém o diretório de trabalho do projeto por variável de ambiente (`maintainProjectWorkingDir`); atualmente só é implementado o comportamento de cwd drift do Bash em foreground na main.
- Não são adicionados testes de reset de subagent no nível do runtime; o comportamento de subagent já é coberto na camada do handler/policy do Bash, evitando expandir o harness do runtime por causa de um único ramo.

Resultados de verificação de 2026-06-16:

- `pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts tests/runtime-tool-loop.test.ts tests/bash-result-mapping.test.ts --reporter=dot` passou, 129 tests passed.
- `pnpm --filter @zcode/adapters exec vitest run tests/exec.test.ts --reporter=dot` passou, 52 tests passed / 2 skipped.
- `pnpm --filter @zcode/core typecheck` passou.
- `pnpm --filter @zcode/adapters typecheck` passou.
- `pnpm lint` passou, 0 errors / 66 warnings.
- `pnpm typecheck` ainda falha no problema histórico de export/type de `@zcode/shared` em nível de repositório; os arquivos que falham não fazem parte da superfície de implementação do reset do Bash desta vez.

---

## Comportamento alvo

- Somente o Bash da thread principal (não subagent) altera o cwd da sessão; o Bash de subagent não altera o cwd.
- Após o sucesso do Bash da thread principal, verificar se o cwd final saiu dos limites originais do projeto; se saiu, resetar para o cwd original e expor ao provider, como stderr do Bash result, `<stderr original sem espaços nas pontas>\nShell cwd was reset to <root>`.
- O texto de reset aparece apenas no stderr do Bash tool result, não como um system-reminder independente; outras configurações, como model effort, não afetam esse comportamento.

## Estado do ZCode antes da implementação

- `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - O Bash em foreground define `captureCwdAfterSuccess: true`.
  - Em caso de sucesso e `exitCode === 0`, chama diretamente `setWorkingDirectory(result.resolvedCwd)`.
  - Atualmente não verifica se `resolvedCwd` saiu de `workspaceRoot`, nem acrescenta `Shell cwd was reset to ...`.
- `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
  - `workingDirectory` pode ser atualizado pelo Bash.
  - `workspaceRoot` mantém o limite do workspace inicial da sessão.
- `apps/zcode-cli/packages/core/src/tool/types.ts`
  - `ToolExecutionContext` atualmente não tem um scope que distinga thread principal de subagent.

## Limites de design

- Consumir `resolvedCwd` apenas no handler do Bash. Executor, serializer e outras ferramentas não fazem inferência de cwd.
- Tratar apenas Bash em foreground; Bash em background continua sem capturar e sem atualizar cwd.
- Tratar apenas resultados com `status === "completed"` e `exitCode === 0`; failed, timed out e cancelled não disparam o reset reminder.
- Tratar `taskType === "subagent_child"` como o ramo de subagent. Os demais runtimes mantêm a semântica de thread principal por enquanto, evitando alterar junto o comportamento de workflow / fork.
- Não serializar o próprio campo `resolvedCwd` para o provider; o provider só pode ver o texto `Shell cwd was reset to <root>`.
- `workspaceRoot` / identidade da sessão / `path.root` da mensagem persistida não sofre drift com o `cd` do Bash.
- A verificação de contenção de caminho precisa ser compatível com macOS, Linux e Windows; não pode usar `startsWith` de string.

## Planejamento de arquivos

- Modificar: `apps/zcode-cli/docs/bash-cwd-persistence-plan.md`
  - Atualizar o limite antigo: a saída de Bash visível ao provider acrescentará stderr de reset no cenário de reset.
- Modificar: matriz de conformidade do Bash (removida; o comportamento do Bash segue `apps/zcode-cli/docs/design/v2/tool/04-bash.md`)
  - Atualizar o caso de cwd reset, marcando-o como comportamento do Bash handler de produção.
- Modificar: `apps/zcode-cli/packages/core/src/tool/types.ts`
  - Adicionar um scope estreito: `ToolRuntimeScope = "main" | "subagent"`.
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
  - Adicionar `runtimeScope` às options/deps do executor.
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
  - Scope padrão do executor é `"main"`.
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
  - Colocar o scope no `ToolExecutionContext`.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
  - Passar `runtimeScope: "subagent"` quando `taskType === "subagent_child"`, e `"main"` nos demais cenários.
- Novo: `apps/zcode-cli/packages/core/src/tool/handlers/bash-cwd-policy.ts`
  - Implementar centralmente a decisão de update/reset/reminder de cwd.
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - Substituir o `setWorkingDirectory(result.resolvedCwd)` direto pela policy.
  - Acrescentar o stderr de reset via parâmetro em `toBashOutput`.
- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
  - Adicionar cobertura de cwd reset / subagent / env / caminho Windows na camada do handler.
- Modificar: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
  - Adicionar regressão de cwd reset para duas chamadas de Bash no lado do runtime.

---

## Task 1: atualizar primeiro o documento de spec

**Arquivos:**

- Modificar: `apps/zcode-cli/docs/bash-cwd-persistence-plan.md`
- Modificar: matriz de conformidade do Bash (removida; o comportamento do Bash segue `apps/zcode-cli/docs/design/v2/tool/04-bash.md`)

- [x] **Step 1: atualizar o limite visível ao provider na documentação de cwd persistence**

Em `apps/zcode-cli/docs/bash-cwd-persistence-plan.md`, trocar o antigo "a saída de Bash visível ao provider não muda" por:

```md
### Provider-visible cwd reset

旧计划只实现了 Bash cwd persistence，没有实现 cwd reset reminder。现在边界更新为：main-thread foreground Bash 成功执行后，如果最终 cwd 离开 session project boundary，runtime 必须 reset 回 session root，并通过 Bash stderr 追加 `Shell cwd was reset to <root>`。

这不是独立 `<system-reminder>`，也不是 serializer 层拼出来的消息；它属于 Bash tool result 的 provider-visible content。`resolvedCwd` 仍然是内部字段，不允许直接进入 provider-visible output。
```

- [x] **Step 2: atualizar a linha de cwd reset da conformance matrix**

Na matriz de conformidade do Bash (removida; o comportamento do Bash segue `apps/zcode-cli/docs/design/v2/tool/04-bash.md`), atualizar o caso de cwd reset para:

```md
| 20 | real shell execution | `commands that leave cwd outside the project append a shell reset message` | 命令 `cd /tmp` 离开项目 cwd 后，provider-visible result 附加 cwd reset 提示。 | planned | 在 Bash result stderr 中追加 `Shell cwd was reset to <root>`，不是单独 system-reminder。 | 在 Bash handler 消费 `resolvedCwd` 时执行 cwd policy：main foreground success 出界 reset 到 workspaceRoot 并追加 stderr；subagent/background/failed/timeout 不触发。 |
```

- [x] **Step 3: verificar o diff da documentação**

Executar:

```bash
git diff -- apps/zcode-cli/docs/bash-cwd-persistence-plan.md
```

Esperado: apenas atualização de semântica da documentação, sem mudanças de código.

---

## Task 2: dar ao tool context um runtime scope mínimo

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/src/tool/types.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`

- [x] **Step 1: adicionar scope opcional no tool context**

Em `apps/zcode-cli/packages/core/src/tool/types.ts`, adicionar:

```ts
export type ToolRuntimeScope = "main" | "subagent";
```

Adicionar o campo opcional em `ToolExecutionContext`:

```ts
  runtimeScope?: ToolRuntimeScope;
```

O campo permanece opcional para reduzir a superfície de mudanças em testes não relacionados e contexts escritos à mão; a Bash policy trata a ausência como `"main"`.

- [x] **Step 2: adicionar scope nos types do executor**

Em `apps/zcode-cli/packages/core/src/tool/executor/types.ts`, alterar o import para incluir `ToolRuntimeScope`:

```ts
import type {
  ExecutableToolCall,
  ReadFileStateMap,
  ToolBatchEvent,
  ToolExecutionResult,
  ToolRuntimeScope,
} from "../types.js";
```

Adicionar em `ToolExecutorOptions`:

```ts
  runtimeScope?: ToolRuntimeScope;
```

Adicionar em `ToolExecutorDeps`:

```ts
  runtimeScope: ToolRuntimeScope;
```

- [x] **Step 3: executor com padrão main**

Em `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`, adicionar ao construir `this.deps`:

```ts
      runtimeScope: options.runtimeScope ?? "main",
```

- [x] **Step 4: call-runner passar o context**

Em `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`, adicionar ao construir o `ToolExecutionContext`:

```ts
      runtimeScope: deps.runtimeScope,
```

- [x] **Step 5: AgentRuntime mapeia o scope de subagent**

Em `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`, adicionar nos argumentos de `createToolExecutor({...})`:

```ts
        runtimeScope: this.config.taskType === "subagent_child" ? "subagent" : "main",
```

Não use `parentSessionId` para generalizar a verificação. O ramo de subagent precisa de uma identidade explícita de agente filho, e a semântica explícita mais próxima no ZCode hoje é `taskType === "subagent_child"`.

- [x] **Step 6: rodar verificação estreita de type/test**

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado: se falhar, devem restar apenas problemas de tipo em que helpers de teste precisam de `runtimeScope`; não deve haver mudança de comportamento em outras ferramentas.

---

## Task 3: novo helper de Bash cwd policy

**Arquivos:**

- Novo: `apps/zcode-cli/packages/core/src/tool/handlers/bash-cwd-policy.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

- [x] **Step 1: criar o arquivo helper**

Adicionar `apps/zcode-cli/packages/core/src/tool/handlers/bash-cwd-policy.ts`:

```ts
import path from "node:path";
import type { ExecutionResult } from "@zcode/contracts";
import type { ToolRuntimeScope } from "../types.js";

export interface BashCwdPolicyInput {
  resolvedCwd: string | undefined;
  status: ExecutionResult["status"];
  exitCode: number | undefined;
  workspaceRoot: string;
  runtimeScope?: ToolRuntimeScope;
  maintainProjectWorkingDir?: boolean;
}

export interface BashCwdPolicyDecision {
  nextWorkingDirectory?: string;
  stderrSuffix?: string;
}

export function decideBashCwdPolicy(input: BashCwdPolicyInput): BashCwdPolicyDecision {
  if (input.status !== "completed") return {};
  if (input.exitCode !== 0) return {};
  if (!input.resolvedCwd) return {};
  if ((input.runtimeScope ?? "main") !== "main") return {};

  const workspaceRoot = normalizeCwdBoundary(input.workspaceRoot, choosePathApi(input.workspaceRoot));
  const resolvedCwd = normalizeCwdBoundary(
    input.resolvedCwd,
    choosePathApi(input.resolvedCwd, input.workspaceRoot),
  );

  if (input.maintainProjectWorkingDir) {
    return { nextWorkingDirectory: workspaceRoot };
  }

  if (isInsideOrSamePath(resolvedCwd, workspaceRoot)) {
    return { nextWorkingDirectory: resolvedCwd };
  }

  return {
    nextWorkingDirectory: workspaceRoot,
    stderrSuffix: `Shell cwd was reset to ${workspaceRoot}`,
  };
}

function isInsideOrSamePath(child: string, parent: string): boolean {
  const pathApi = choosePathApi(child, parent);
  const normalizedChild = normalizeCwdBoundary(child, pathApi);
  const normalizedParent = normalizeCwdBoundary(parent, pathApi);
  const relativePath = pathApi.relative(normalizedParent, normalizedChild);
  return relativePath === "" || (!relativePath.startsWith("..") && !pathApi.isAbsolute(relativePath));
}

function choosePathApi(...values: string[]): typeof path.posix | typeof path.win32 {
  return values.some(looksLikeWindowsPath) ? path.win32 : path.posix;
}

function looksLikeWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function normalizeCwdBoundary(
  value: string,
  pathApi: typeof path.posix | typeof path.win32,
): string {
  let normalized = pathApi.normalize(value);
  if (pathApi === path.posix) {
    normalized = normalized
      .replace(/^\/private\/var\//, "/var/")
      .replace(/^\/private\/tmp(\/|$)/, "/tmp$1");
  }
  return pathApi === path.win32 ? normalized.toLowerCase() : normalized;
}
```

- [x] **Step 2: adicionar entrada de teste no nível do helper**

Se não for adequado testar o helper diretamente em `bash-handler.test.ts`, pode-se adicionar `describe("Bash cwd policy", ...)` no mesmo arquivo. Cobrir estes quatro casos básicos:

```ts
describe("Bash cwd policy", () => {
  it("keeps cwd when resolved cwd stays inside workspace", () => {
    expect(
      decideBashCwdPolicy({
        status: "completed",
        exitCode: 0,
        resolvedCwd: "/repo/subdir",
        workspaceRoot: "/repo",
        runtimeScope: "main",
      }),
    ).toEqual({ nextWorkingDirectory: "/repo/subdir" });
  });

  it("resets cwd and returns provider-visible stderr suffix when resolved cwd leaves workspace", () => {
    expect(
      decideBashCwdPolicy({
        status: "completed",
        exitCode: 0,
        resolvedCwd: "/tmp/outside",
        workspaceRoot: "/repo",
        runtimeScope: "main",
      }),
    ).toEqual({
      nextWorkingDirectory: "/repo",
      stderrSuffix: "Shell cwd was reset to /repo",
    });
  });

  it("does not update cwd for subagent scope", () => {
    expect(
      decideBashCwdPolicy({
        status: "completed",
        exitCode: 0,
        resolvedCwd: "/tmp/outside",
        workspaceRoot: "/repo",
        runtimeScope: "subagent",
      }),
    ).toEqual({});
  });

  it("handles Windows path containment case-insensitively", () => {
    expect(
      decideBashCwdPolicy({
        status: "completed",
        exitCode: 0,
        resolvedCwd: "C:\\Repo\\Subdir",
        workspaceRoot: "c:\\repo",
        runtimeScope: "main",
      }),
    ).toEqual({ nextWorkingDirectory: "c:\\repo\\subdir" });
  });
});
```

- [x] **Step 3: rodar os testes para confirmar a falha inicial** (lançado retroativamente: a implementação já está em terra; o red-run não foi refeito; a verificação final green está na Task 8)

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado: falhar enquanto o helper/import ainda não estiver conectado ou as asserções não baterem. A falha deve vir dos testes relacionados à cwd policy.

---

## Task 4: Bash handler consome a policy

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`

- [x] **Step 1: importar a policy**

Adicionar no topo de `bash.ts`:

```ts
import { decideBashCwdPolicy } from "./bash-cwd-policy.js";
```

- [x] **Step 2: substituir o setWorkingDirectory direto** (a implementação final não inclui o ramo de variável de ambiente que mantém o diretório de trabalho do projeto)

Trocar a lógica atual:

```ts
  if (result.status === "completed" && result.exitCode === 0 && result.resolvedCwd) {
    // 修复原因：不复用 shell 进程，但成功 Bash 需要把最终 cwd 写回会话。
    await context.setWorkingDirectory?.(result.resolvedCwd);
  }
  return toBashOutput(result, parsed, context);
```

por:

```ts
  const cwdDecision = decideBashCwdPolicy({
    status: result.status,
    exitCode: result.exitCode,
    resolvedCwd: result.resolvedCwd,
    workspaceRoot: context.workspaceRoot,
    runtimeScope: context.runtimeScope,
  });
  if (cwdDecision.nextWorkingDirectory) {
    // 修复原因：主线程 Bash 成功后保留项目内 cwd；
    // 离开项目边界时 reset 回原始工作区，并把 reset 文案放进 Bash stderr。
    await context.setWorkingDirectory?.(cwdDecision.nextWorkingDirectory);
  }
  return toBashOutput(result, parsed, context, {
    stderrSuffix: cwdDecision.stderrSuffix,
  });
```

- [x] **Step 3: dar options ao toBashOutput**

Alterar a assinatura para:

```ts
async function toBashOutput(
  result: ExecutionResult,
  input: BashInput,
  context: ToolExecutionContext,
  options: { stderrSuffix?: string } = {},
): Promise<BashOutput> {
```

Alterar a construção do stderr para:

```ts
  const stderr = appendStderrSuffix(result.stderr.text || result.error?.message || "", options.stderrSuffix);
```

Adicionar no final do arquivo:

```ts
function appendStderrSuffix(stderr: string, suffix: string | undefined): string {
  if (!suffix) return stderr;
  return [stderr.trim(), suffix].filter(Boolean).join("\n");
}
```

- [x] **Step 4: rodar os testes do Bash handler**

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado: os testes unitários da cwd policy e os testes existentes do Bash handler passam; se o teste de privacy do `resolvedCwd` falhar, é preciso atualizar as asserções conforme a Task 5.

---

## Task 5: completar os testes de comportamento do Bash handler

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

- [x] **Step 1: atualizar o teste de cwd persistence dentro do projeto**

O teste existente `"updates session cwd from successful foreground Bash execution"` mantém a semântica; basta garantir que `resolvedCwd` está dentro do workspace:

```ts
const nextCwd = resolve(projectRoot, "nested");
```

O esperado continua sendo:

```ts
expect(observedCwd).toBe(nextCwd);
expect(content).not.toContain("Shell cwd was reset");
```

- [x] **Step 2: adicionar teste de reset ao sair do workspace**

Adicionar:

```ts
it("resets main Bash cwd to workspace root and exposes reset stderr when final cwd leaves workspace", async () => {
  const outsideCwd = resolve("/tmp/zcode-outside");
  let observedCwd: string | undefined;
  const executionPort: ExecutionPort = {
    async run() {
      return executionResult({
        status: "completed",
        exitCode: 0,
        resolvedCwd: outsideCwd,
        stdout: "done\n",
      });
    },
  };

  const output = (await bashHandler(
    { command: "cd /tmp/zcode-outside && echo done" } satisfies BashInput,
    contextWith(executionPort, {
      workingDirectory: projectRoot,
      workspaceRoot: projectRoot,
      setWorkingDirectory: (cwd) => {
        observedCwd = cwd;
      },
    }),
  )) as BashOutput;

  expect(observedCwd).toBe(projectRoot);
  expect(output.stderr).toBe(`Shell cwd was reset to ${projectRoot}`);
  expect(bashToolEntry.formatModelContent?.(output)).toBe(
    `done\nShell cwd was reset to ${projectRoot}`,
  );
  expect(JSON.stringify(output)).not.toContain("resolvedCwd");
  expect(JSON.stringify(output)).not.toContain(outsideCwd);
});
```

- [x] **Step 3: adicionar teste de que subagent não acrescenta reset**

Adicionar:

```ts
it("does not reset or expose cwd reminder for subagent Bash scope", async () => {
  let observedCwd: string | undefined;
  const executionPort: ExecutionPort = {
    async run() {
      return executionResult({
        status: "completed",
        exitCode: 0,
        resolvedCwd: "/tmp/subagent-outside",
        stdout: "child\n",
      });
    },
  };

  const output = (await bashHandler(
    { command: "cd /tmp/subagent-outside && echo child" } satisfies BashInput,
    contextWith(executionPort, {
      runtimeScope: "subagent",
      setWorkingDirectory: (cwd) => {
        observedCwd = cwd;
      },
    }),
  )) as BashOutput;

  expect(observedCwd).toBeUndefined();
  expect(output.stderr).toBe("");
  expect(bashToolEntry.formatModelContent?.(output)).toBe("child");
});
```

As options de `contextWith` precisam de:

```ts
    runtimeScope?: ToolExecutionContext["runtimeScope"];
```

E no valor de retorno:

```ts
    runtimeScope: options.runtimeScope,
```

- [x] **Step 4: atualizar o teste antigo de privacy**

O teste antigo `"does not expose resolved cwd in provider-visible Bash content"`, se usar `/tmp/secret-cwd`, agora dispara o reset reminder. Altere para um caminho dentro do workspace:

```ts
const secretCwd = resolve(projectRoot, "secret-cwd");
```

As asserções continuam iguais:

```ts
expect(JSON.stringify(output)).not.toContain("resolvedCwd");
expect(JSON.stringify(content)).not.toContain("resolvedCwd");
```

Não afirme mais que o content visível ao provider não contém nenhuma string de cwd, porque no cenário de reset a raiz é exposta de propósito.

- [x] **Step 5: rodar os testes do handler**

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado: todos os testes do Bash handler passam.

---

## Task 6: completar a regressão do runtime loop

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

- [x] **Step 1: manter o teste existente de cwd persistence dentro do projeto**

O teste existente `"persists successful foreground Bash cwd across tool calls"` deve continuar passando: o primeiro Bash resolve para um diretório dentro do workspace, e o `request.cwd` do segundo Bash deve ser esse subdiretório.

- [x] **Step 2: adicionar teste de runtime que faz reset para a raiz ao sair do workspace**

Adicionar o teste:

```ts
it("resets Bash cwd to workspace root after a successful command leaves the workspace", async () => {
  const sessionId = createSessionId("runtime-bash-cwd-reset-reminder");
  const workspaceRoot = await mkdtemp(join(tmpdir(), "zcode-bash-root-"));
  const outsideCwd = await mkdtemp(join(tmpdir(), "zcode-bash-outside-"));
  const requests: ExecutionRequest[] = [];

  const executionPort: ExecutionPort = {
    async run(request) {
      requests.push(request);
      if (requests.length === 1) {
        return executionResult({
          status: "completed",
          exitCode: 0,
          stdout: "left\n",
          resolvedCwd: outsideCwd,
        });
      }
      return executionResult({
        status: "completed",
        exitCode: 0,
        stdout: "root\n",
      });
    },
  };

  const runtime = createRuntimeForToolLoop(
    {
      sessionId,
      mode: "yolo",
      workingDirectory: workspaceRoot,
      executionPort,
    },
  );

  await runOneTurnWithToolCalls(runtime, [
    {
      id: "tool_1",
      name: "Bash",
      input: { command: "cd /tmp && echo left" },
    },
    {
      id: "tool_2",
      name: "Bash",
      input: { command: "pwd" },
    },
  ]);

  expect(requests[0]?.cwd).toBe(workspaceRoot);
  expect(requests[1]?.cwd).toBe(workspaceRoot);
  expect(providerVisibleToolResultFor("tool_1")).toContain(
    `Shell cwd was reset to ${workspaceRoot}`,
  );
});
```

Os nomes de helper do teste devem seguir as ferramentas já existentes no arquivo; não criar um novo harness de runtime.

- [x] **Step 3: adicionar um teste estreito de que scope de subagent não faz reset** (por decisão de plano, não expandir o harness do runtime; já coberto na camada handler/policy)

Se o harness atual de runtime test conseguir criar facilmente `taskType: "subagent_child"`, adicionar um teste confirmando que o runtime de subagent não dispara o reset reminder. Se o custo do harness for alto, não refatorar o runtime por causa desse teste; manter a cobertura no nível do handler.

- [x] **Step 4: rodar os testes de runtime**

Executar:

```bash
pnpm --filter @zcode/core test -- runtime-tool-loop.test.ts
```

Esperado: o teste antigo de cwd persistence passa e o novo teste de reset passa.

---

## Task 7: verificar o conteúdo visível ao provider

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- Modificação opcional: `apps/zcode-cli/packages/core/tests/bash-result-mapping.test.ts`

- [x] **Step 1: confirmar o shape da saída comum de sucesso**

Adicionar ou reutilizar a asserção:

```ts
expect(bashToolEntry.formatModelContent?.({
  stdout: "ok\n",
  stderr: `Shell cwd was reset to ${projectRoot}`,
  interrupted: false,
  status: "completed",
  exitCode: 0,
} satisfies BashOutput)).toBe(`ok\nShell cwd was reset to ${projectRoot}`);
```

- [x] **Step 2: confirmar que failed/timeout não acrescentam reset**

Os testes existentes de failed/timed_out precisam de asserções visíveis ao provider:

```ts
expect(bashToolEntry.formatModelContent?.(output)).not.toContain("Shell cwd was reset");
```

- [x] **Step 3: confirmar que o ramo de image não é ampliado pelo cwd reset** (nenhum comportamento novo de image cwd reset foi adicionado nesta vez; a cobertura existente de image short-circuit continua passando)

Se o stdout for image e o cwd estiver fora dos limites, o ramo de image faz short-circuit. O comportamento de image do ZCode já foi tratado separadamente; não alterar o comportamento de image por conta própria nesta vez. Verificar apenas o reset reminder de Bash de texto comum, sem adicionar comportamento novo de image cwd reset.

- [x] **Step 4: rodar os testes relacionados**

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts bash-result-mapping.test.ts
```

Esperado: o texto visível ao provider corresponde à semântica de cwd reset acima; sem novas mudanças em image / error output.

---

## Task 8: verificação completa e checagem de riscos

**Arquivos:**

- Nenhum arquivo de código novo.
- Apenas rodar comandos de verificação e inspecionar o diff.

- [x] **Step 1: verificar o escopo do diff**

Executar:

```bash
git diff --stat
git diff -- apps/zcode-cli/packages/core/src/tool/handlers/bash.ts apps/zcode-cli/packages/core/src/tool/handlers/bash-cwd-policy.ts apps/zcode-cli/packages/core/src/tool/types.ts apps/zcode-cli/packages/core/src/tool/executor/types.ts apps/zcode-cli/packages/core/src/tool/executor/impl.ts apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts
```

Esperado:

- O Bash handler não define mais `resolvedCwd` diretamente.
- A cwd reset policy está centralizada em `bash-cwd-policy.ts`.
- O executor apenas repassa `runtimeScope`, sem alterar outras ferramentas.
- O runtime mapeia apenas `subagent_child` para `"subagent"`.

- [x] **Step 2: rodar os testes do pacote**

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts runtime-tool-loop.test.ts bash-result-mapping.test.ts
```

Esperado: passar.

- [x] **Step 3: rodar os testes de captura de cwd do adapter e confirmar que a camada do executor não foi quebrada**

Executar:

```bash
pnpm --filter @zcode/adapters test -- exec.test.ts
```

Esperado: o comportamento existente de `captureCwdAfterSuccess` continua passando; background não captura cwd.

- [x] **Step 4: rodar typecheck/lint** (o `pnpm typecheck` na raiz ainda tem falhas históricas sem relação, ver status de execução)

Executar:

```bash
pnpm --filter @zcode/core typecheck
pnpm typecheck
pnpm lint
```

Esperado: passar. Se o `pnpm lint` na raiz expor problemas históricos sem relação, registrar o arquivo que falhou e se está relacionado a este diff; não corrigir módulos sem relação por conta própria.

- [x] **Step 5: verificação opcional de sessão real** (já coberta por `sess_3894adde-75bc-4be3-bde2-977020725c69`; não foi rerodada desta vez)

Rodar uma sessão com o prompt de Bash existente em `apps/zcode-cli/real-world-test-prompt`, contendo os comandos seriais a seguir:

```md
请串行执行以下 Bash tool call，不要做验证总结：

1. `pwd`
2. `mkdir -p /tmp/zcode-cwd-reset-check && cd /tmp/zcode-cwd-reset-check && pwd`
3. `pwd`
4. `cd "$PWD" && pwd`
```

Depois de executar, converter a trajetória do prompt em uma trajetória anthropic e verificar:

- O resultado provider-visible do item 2 contém `Shell cwd was reset to <workspaceRoot>`.
- O cwd da requisição Bash do item 3 volta para a raiz do workspace.
- Não há vazamento do campo `resolvedCwd`.

## O que não será feito

- Não implementar subprocesso de shell residente.
- Não persistir env / alias / function.
- Não adicionar um `SystemReminderSource` global.
- Não deixar o serializer montar mensagens automaticamente com base no cwd.
- Não deixar hooks / configured commands / `mode: "shell"` genérico capturarem cwd automaticamente.
- Não tratar workflow/fork uniformemente como subagent; a menos que a semântica de identidade de agente filho seja explicitada depois.
- Não fazer commit automático.

## Critérios de aceitação

- Bash em foreground da main entra com sucesso em um diretório dentro do workspace: o próximo Bash é executado a partir desse diretório; o output visível ao provider não mostra reset reminder.
- Bash em foreground da main entra com sucesso em um diretório fora do workspace: o cwd do runtime é resetado para a raiz do workspace; o Bash result visível ao provider contém `Shell cwd was reset to <workspaceRoot>`.
- Bash de subagent, Bash em background, Bash com falha e Bash com timeout não disparam o cwd reset reminder.
- `resolvedCwd` continua não entrando no content visível ao provider.
- A verificação de contenção para caminhos no estilo Windows trata corretamente maiúsculas/minúsculas, letra de drive e barra invertida.
- Aliases `/private/tmp` e `/private/var` do macOS não causam falso positivo.
- Sob workspace com symlink, o caminho físico filho retornado por `pwd -P` ainda é reconhecido como cwd dentro do projeto, sem acrescentar reset indevidamente.
- Shell command de hooks/plugin, requisição de shell de `ExecutionPort` genérico, Bash em background, Bash de subagent e outras ferramentas de arquivo não consomem a cwd policy automaticamente.
- `pnpm --filter @zcode/core test -- bash-handler.test.ts runtime-tool-loop.test.ts bash-result-mapping.test.ts` passa.
- `pnpm --filter @zcode/adapters test -- exec.test.ts` passa.
- `pnpm typecheck` e `pnpm lint` passam, ou restam apenas falhas históricas claramente sem relação e registradas.