# Plano de Implementação do Snapshot de Script de Startup de Sessão Bash

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** introduzir um arquivo snapshot `.sh` de startup Bash no nível da sessão, nativo do ZCode, para que a Bash tool faça `source` de um arquivo de script gerado internamente pelo ZCode e materializado por sessão/hash antes de executar o comando do modelo.

**Arquitetura:** a primeira versão implementa apenas a infraestrutura de startup snapshot `.sh`, sem reabilitar aliases de find/grep, sem alterar o system prompt provider-visible do main agent e sem alterar a estratégia atual de exposição de ferramentas. O `core` é responsável por gerar o descriptor interno de startup; os `adapters` são responsáveis por materializar com segurança o descriptor em um arquivo `.sh` e fazer o `source` dele; futuramente um embedded search prelude pode entrar como um fragmento de conteúdo do mesmo startup script, em vez de continuar sendo concatenado inline antes de cada comando.

**Stack Tecnológico:** TypeScript, Vitest, `@zcode/contracts`, `@zcode/core`, `@zcode/adapters`, fronteira de execução do Bash tool do ZCode.

## Restrições Globais

- Este plano implementa apenas a opção dois: startup snapshot `.sh` real, nativo do ZCode; não implementa a distribuição própria via `ARGV0=bfs/ugrep`.
- Não reabilitar a injeção de aliases `find()` / `grep()` em runtime; `shouldInjectEmbeddedSearchBashPrelude()` continua retornando `false`.
- O conteúdo provider-visible permanece inalterado: o system prompt do main agent não ganha texto de shell snapshot, e a descrição/exposição de tools não muda por causa deste plano.
- O conteúdo do script de startup do Bash só pode vir dos builders internos do ZCode; é proibido aceitar hook, entrada do usuário ou comando do modelo escrevendo diretamente nos campos do startup script.
- CMD e `legacy-shell` não fazem `source` de startup script `.sh`; apenas POSIX e Git Bash fazem.
- No Git Bash, o caminho do script usado no `source` precisa ser convertido para o caminho do Git Bash.
- O caminho de materialização do arquivo `.sh` deve ficar sob a raiz de storage/output do ZCode, isolado por sessão, com permissões de arquivo o mais restritas possível a leitura/escrita do owner.
- O startup script deve ser livre de efeitos colaterais, a menos que o builder interno acrescente explicitamente definições de funções; por padrão, na primeira versão o conteúdo contém apenas comentários/guards e não muda o comportamento dos comandos do usuário.
- Não persistir o caminho absoluto do arquivo `.sh` no session store; após o resume, o adapter materializa novamente a partir do descriptor/hash de conteúdo.
- Não fazer commit nem push automático; ao terminar a execução, deixar para o usuário revisar.

---

## Estado Atual

Hoje já existem duas camadas de capacidade relacionadas, mas ainda não há um arquivo snapshot `.sh` de verdade:

- snapshot de seleção de shell da sessão: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`
  - fixa o `ExecutionShellSelection` usado pela sessão atual.
  - trocar o shell nas settings só afeta novas sessões.
  - no resume, é restaurado a partir da session entry `runtime:bash_shell_selection`.
- inline Bash prelude: `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
  - atualmente consegue concatenar o embedded search prelude inline no command.
  - mas a injeção em runtime já está desligada por `apps/zcode-cli/packages/core/src/embedded-search/shell.ts`.

O objetivo deste plano é evoluir o startup do Bash de “prefixo inline do comando” para “o adapter materializa um arquivo `.sh` e faz `source` do arquivo”, mantendo o comportamento atual como padrão inalterado.

## Forma Alvo

O comando Bash antes da execução passa conceitualmente a ser:

```sh
. '/path/to/zcode/session-startup/<script-id>-<hash>.sh'
<model command>
```

Interface central:

```ts
export interface ExecutionBashStartupScript {
  kind: "session-script";
  id: string;
  content: string;
}
```

O materializer do adapter é responsável por:

```ts
export function materializeBashStartupScript(
  startup: ExecutionBashStartupScript,
  options: BashStartupScriptMaterializeOptions,
): MaterializedBashStartupScript | undefined;
```

O handler Bash do core é responsável por anexar o descriptor de startup da sessão ao request do Bash tool:

```ts
bashStartup: createBashSessionStartupScript({
  sessionId: context.sessionId,
})
```

Na primeira versão, o conteúdo de startup é um header no-op; se a flag futura de embedded prelude for ativada, o adapter mescla o conteúdo das funções de embedded search no mesmo arquivo `.sh`.

---

## Estrutura de Arquivos

- Modificar: `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`
  - Adiciona `ExecutionBashStartupScript` e `ExecutionRequest.bashStartup`.
- Criar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-startup.ts`
  - Gera o descriptor de startup de sessão exclusivo do Bash tool.
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - Anexa `bashStartup` dentro de `createExecutionRequest()`.
- Criar: `apps/zcode-cli/packages/adapters/src/exec/bash-startup-script.ts`
  - Materializa o arquivo `.sh` de startup, gera o comando de source e trata as diferenças POSIX/Git Bash/CMD.
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
  - Extrai o construtor de conteúdo do prelude e mantém `applyEmbeddedSearchPrelude()` compatível com os testes existentes.
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/index.ts`
  - Aplica o `source` do startup script antes da captura de cwd; mantém a lógica existente de output root.
- Criar: `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`
  - Cobre materialize/source/quoting/Git Bash/skip de CMD.
- Modificar: `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`
  - Acrescenta a semântica de mesclagem do content builder.
- Modificar: `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
  - Adiciona teste de integração de execução com `source` de `.sh` por um shell real.
- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
  - Cobre o request do Bash com descriptor de startup no-op e sem embedded prelude.
- Modificar: `apps/zcode-cli/packages/core/tests/embedded-search-shell.test.ts`
  - Confirma que a injeção de aliases continua desabilitada.
- Modificar: `docs/runtime-tools/bash-effective-shell-snapshot.md`
  - Acrescenta a descrição do contrato do startup snapshot `.sh` de sessão.

---

### Tarefa 1: Adicionar o contrato de Bash Startup de execução

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`

**Interfaces:**
- Produz: `ExecutionBashStartupScript`
- Produz: `ExecutionRequest.bashStartup?: ExecutionBashStartupScript`
- Consome: `ExecutionRequest`, `ExecutionEmbeddedSearchPrelude` existentes

- [ ] **Etapa 1: Adicionar o tipo de contrato**

Em `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`, insira a nova interface depois de `ExecutionEmbeddedSearchPrelude`:

```ts
export interface ExecutionBashStartupScript {
  /**
   * Internal Bash startup script generated by ZCode. The adapter materializes
   * this into a session/hash-scoped .sh file and sources it before the Bash
   * tool command. This must never accept user hook or model-provided content.
   */
  kind: "session-script";
  /** Stable logical script id. The adapter sanitizes this before using it in paths. */
  id: string;
  /** Complete script content generated by internal builders. */
  content: string;
}
```

- [ ] **Etapa 2: Adicionar o campo de request**

No mesmo arquivo, acrescente este campo em `ExecutionRequest` depois de `bashPrelude`:

```ts
  /**
   * Internal Bash startup script used by the Bash tool only. The adapter may
   * materialize this to a .sh file and source it before command execution.
   * This must not be accepted from hooks or generic command runners.
   */
  bashStartup?: ExecutionBashStartupScript;
```

- [ ] **Etapa 3: Manter `bashPrelude` compatível**

Não remova `bashPrelude` nesta tarefa. Ele continua sendo a entrada estruturada de embedded search, para que o adapter possa depois combiná-lo no mesmo startup script.

- [ ] **Etapa 4: Executar o typecheck de contracts**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/contracts typecheck
```

Esperado: o comando sai com 0.

---

### Tarefa 2: Adicionar o construtor de descriptor de Bash Startup no core

**Arquivos:**
- Criar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-startup.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- Testar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- Testar: `apps/zcode-cli/packages/core/tests/embedded-search-shell.test.ts`

**Interfaces:**
- Consome: `SessionId`
- Produz: `createBashSessionStartupScript(input): ExecutionBashStartupScript`
- Produz: Bash `ExecutionRequest.bashStartup`

- [ ] **Etapa 1: Adicionar asserção falhando no handler Bash**

Em `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`, estenda o teste existente de request de execução Bash ou acrescente um teste focado:

```ts
it("attaches a session Bash startup script without enabling embedded search aliases", async () => {
  const executionRequests: ExecutionRequest[] = [];
  const executionPort = createRecordingExecutionPort({
    onRun: (request) => {
      executionRequests.push(request);
      return createCompletedExecutionResult({ stdout: "ok\n" });
    },
  });

  await bashHandler(
    { command: "echo ok" },
    createBashToolContext({
      executionPort,
      sessionId: "session-startup-test" as SessionId,
    }),
  );

  expect(executionRequests).toHaveLength(1);
  expect(executionRequests[0]?.bashStartup).toMatchObject({
    kind: "session-script",
    id: "session-startup-test:bash-startup",
  });
  expect(executionRequests[0]?.bashStartup?.content).toContain(
    "Generated by ZCode for Bash tool session startup.",
  );
  expect(executionRequests[0]?.bashPrelude).toBeUndefined();
});
```

Use os nomes de helper locais que já existem em `bash-handler.test.ts`; se os nomes forem diferentes, mantenha a mesma forma de asserção e integre-a à fixture de teste existente.

- [ ] **Etapa 2: Executar o teste focado e verificar a falha**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/core exec vitest run tests/bash-handler.test.ts -t "attaches a session Bash startup script"
```

Esperado: falha porque `bashStartup` ainda não é preenchido.

- [ ] **Etapa 3: Criar o construtor de descriptor**

Crie `apps/zcode-cli/packages/core/src/tool/handlers/bash-startup.ts`:

```ts
import type { ExecutionBashStartupScript, SessionId } from "@zcode/contracts";

export function createBashSessionStartupScript(input: {
  sessionId: SessionId;
}): ExecutionBashStartupScript {
  return {
    kind: "session-script",
    id: `${input.sessionId}:bash-startup`,
    content: [
      "# Generated by ZCode for Bash tool session startup.",
      "# This file is sourced before each Bash tool command in this session.",
      "# It is intentionally side-effect free unless internal builders append functions.",
      "",
    ].join("\n"),
  };
}
```

- [ ] **Etapa 4: Ligar o handler Bash**

Em `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`, importe o construtor:

```ts
import { createBashSessionStartupScript } from "./bash-startup.js";
```

Depois acrescente `bashStartup` dentro de `createExecutionRequest()`:

```ts
    bashStartup: createBashSessionStartupScript({
      sessionId: context.sessionId,
    }),
```

Mantenha o condicional existente de `bashPrelude` inalterado:

```ts
    ...(bashPrelude ? { bashPrelude } : {}),
```

- [ ] **Etapa 5: Confirmar que a flag de alias de embedded search continua desabilitada**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/core exec vitest run tests/embedded-search-shell.test.ts
```

Esperado: passa e ainda afirma que `shouldInjectEmbeddedSearchBashPrelude()` é `false`.

- [ ] **Etapa 6: Executar os testes do handler Bash**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado: todos os testes do handler Bash passam.

---

### Tarefa 3: Materializar o startup script `.sh` no adapter

**Arquivos:**
- Criar: `apps/zcode-cli/packages/adapters/src/exec/bash-startup-script.ts`
- Testar: `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`

**Interfaces:**
- Consome: `ExecutionBashStartupScript`
- Consome: `ExecutionShellDialect | "legacy-shell"`
- Produz: `materializeBashStartupScript()`
- Produz: `applyBashStartupScriptSource()`

- [ ] **Etapa 1: Adicionar testes do materializer**

Crie `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBashStartupScriptSource,
  materializeBashStartupScript,
} from "../src/exec/bash-startup-script.js";

describe("bash startup script materializer", () => {
  it("writes a hash-scoped script and sources it before the command", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "zcode-bash-startup-"));
    try {
      const materialized = materializeBashStartupScript(
        {
          kind: "session-script",
          id: "session/with spaces:bash-startup",
          content: "zcode_startup_marker() { echo startup-ok; }\n",
        },
        {
          rootDir,
          sessionId: "session/with spaces",
          shellDialect: "posix",
        },
      );

      expect(materialized).toBeDefined();
      expect(materialized?.path).toContain("session-with-spaces");
      expect(readFileSync(materialized!.path, "utf8")).toBe(
        "zcode_startup_marker() { echo startup-ok; }\n",
      );
      expect(statSync(materialized!.path).isFile()).toBe(true);

      const command = applyBashStartupScriptSource("zcode_startup_marker", materialized!);
      expect(command).toBe(`. '${materialized!.path}'\nzcode_startup_marker`);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("skips CMD and legacy shell dialects", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "zcode-bash-startup-"));
    try {
      for (const shellDialect of ["cmd", "legacy-shell"] as const) {
        expect(
          materializeBashStartupScript(
            {
              kind: "session-script",
              id: "startup",
              content: "echo no\n",
            },
            {
              rootDir,
              sessionId: "session",
              shellDialect,
            },
          ),
        ).toBeUndefined();
      }
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("converts materialized Windows paths for Git Bash source commands", () => {
    const materialized = {
      path: "C:\\Users\\me\\AppData\\Local\\ZCode\\startup.sh",
      shellPath: "/c/Users/me/AppData/Local/ZCode/startup.sh",
    };

    expect(applyBashStartupScriptSource("echo ok", materialized)).toBe(
      ". /c/Users/me/AppData/Local/ZCode/startup.sh\necho ok",
    );
  });
});
```

- [ ] **Etapa 2: Executar os testes e verificar a falha**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/bash-startup-script.test.ts
```

Esperado: falha porque `bash-startup-script.ts` não existe.

- [ ] **Etapa 3: Implementar o materializer**

Crie `apps/zcode-cli/packages/adapters/src/exec/bash-startup-script.ts`:

```ts
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ExecutionBashStartupScript,
  ExecutionShellDialect,
} from "@zcode/contracts";
import { windowsPathToGitBashPath } from "@zcode/contracts";

type StartupShellDialect = ExecutionShellDialect | "legacy-shell";

export interface BashStartupScriptMaterializeOptions {
  rootDir: string;
  sessionId: string;
  shellDialect?: StartupShellDialect;
}

export interface MaterializedBashStartupScript {
  path: string;
  shellPath: string;
}

export function materializeBashStartupScript(
  startup: ExecutionBashStartupScript | undefined,
  options: BashStartupScriptMaterializeOptions,
): MaterializedBashStartupScript | undefined {
  if (!startup || startup.kind !== "session-script") return undefined;
  if (!supportsBashStartupScript(options.shellDialect)) return undefined;
  if (startup.content.length === 0) return undefined;

  const sessionDir = join(options.rootDir, "bash-startup", sanitizePathSegment(options.sessionId));
  mkdirSync(sessionDir, { recursive: true });

  const hash = hashContent(startup.content);
  const fileName = `${sanitizePathSegment(startup.id)}-${hash}.sh`;
  const path = join(sessionDir, fileName);

  if (!existsSync(path) || readFileSync(path, "utf8") !== startup.content) {
    writeFileSync(path, startup.content, { encoding: "utf8", mode: 0o600 });
    try {
      chmodSync(path, 0o600);
    } catch {
      // Windows may not preserve POSIX mode bits; the file remains in ZCode-owned storage.
    }
  }

  return {
    path,
    shellPath: options.shellDialect === "git-bash" ? windowsPathToGitBashPath(path) : path,
  };
}

export function applyBashStartupScriptSource(
  command: string,
  materialized: MaterializedBashStartupScript | undefined,
): string {
  if (!materialized) return command;
  return [`. ${shellQuote(materialized.shellPath)}`, command].join("\n");
}

function supportsBashStartupScript(shellDialect: StartupShellDialect | undefined): boolean {
  return shellDialect === "posix" || shellDialect === "git-bash";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "unknown";
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/u.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
```

- [ ] **Etapa 4: Executar os testes do materializer**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/bash-startup-script.test.ts
```

Esperado: todos os testes passam.

---

### Tarefa 4: Ligar o startup script ao Node Execution Adapter

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/index.ts`
- Testar: `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
- Testar: `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`

**Interfaces:**
- Consome: `ExecutionRequest.bashStartup`
- Produz: comando Bash cuja primeira linha faz `source` do startup script materializado

- [ ] **Etapa 1: Adicionar teste de integração de source por shell real**

Em `apps/zcode-cli/packages/adapters/tests/exec.test.ts`, acrescente um teste de integração exclusivo de POSIX perto dos testes existentes de execução de shell:

```ts
const posixOnly = process.platform === "win32" ? it.skip : it;

posixOnly("sources Bash startup script before executing the command", async () => {
  const outputRootDir = mkdtempSync(join(tmpdir(), "zcode-exec-startup-"));
  try {
    const adapter = new NodeExecutionAdapter({
      outputRootDir,
      platform: process.platform,
      processEnv: process.env,
    });

    const result = await adapter.run({
      command: {
        mode: "shell",
        command: "zcode_startup_marker",
        shellProfile: "posix-bash",
      },
      bashStartup: {
        kind: "session-script",
        id: "integration-startup",
        content: "zcode_startup_marker() { echo startup-ok; }\n",
      },
      cwd: process.cwd(),
      timeoutMs: 30_000,
    });

    expect(result.status).toBe("completed");
    expect(result.stdout.text.trim()).toBe("startup-ok");
  } finally {
    rmSync(outputRootDir, { force: true, recursive: true });
  }
});
```

Acrescente os imports que faltarem no topo se este arquivo ainda não os tiver:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

- [ ] **Etapa 2: Executar o teste de integração e verificar a falha**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/exec.test.ts -t "sources Bash startup script"
```

Esperado: falha porque o adapter ainda não faz `source` de `bashStartup`.

- [ ] **Etapa 3: Importar os helpers de startup no adapter**

Em `apps/zcode-cli/packages/adapters/src/exec/index.ts`, acrescente:

```ts
import {
  applyBashStartupScriptSource,
  materializeBashStartupScript,
} from "./bash-startup-script.js";
```

- [ ] **Etapa 4: Substituir a aplicação apenas inline do prelude pela materialização do startup**

Em `NodeExecutionAdapter.spawnChild()`, depois que `resolvedCommand` é calculado e antes de `createCwdCapturePlan(...)`, calcule um request com o startup aplicado:

```ts
    const requestWithStartup = this.applyBashStartupToExecutionRequest(
      request,
      resolvedCommand.cwdDialect,
    );
```

Depois use `requestWithStartup` para a captura de cwd:

```ts
    const capturePlan = createCwdCapturePlan(requestWithStartup, {
      dialect: resolvedCommand.cwdDialect,
      platform: this.platform,
    });
```

Mantenha o fluxo posterior `resolveExecutionCommand(capturePlan.command, ...)` inalterado.

- [ ] **Etapa 5: Adicionar o método privado do adapter**

Em `NodeExecutionAdapter`, acrescente:

```ts
  private applyBashStartupToExecutionRequest(
    request: ExecutionRequest,
    cwdDialect: ExecutionShellDialect,
  ): ExecutionRequest {
    if (
      request.command.mode !== "shell" ||
      request.command.shellProfile !== "posix-bash"
    ) {
      return request;
    }

    const rootDir =
      this.options.outputRootDir ?? resolveDefaultOutputRootDir(this.options.processEnv);
    const sessionId = sanitizePathSegment(String(request.trace?.sessionId ?? "unknown-session"));
    const materialized = materializeBashStartupScript(request.bashStartup, {
      rootDir,
      sessionId,
      shellDialect: cwdDialect,
    });
    const command = applyBashStartupScriptSource(request.command.command, materialized);
    if (command === request.command.command) return request;

    return {
      ...request,
      command: {
        ...request.command,
        command,
      },
    };
  }
```

Nesta etapa, deixe `applyBashPreludeToExecutionRequest(...)` no arquivo. A Tarefa 5 vai migrar o conteúdo do embedded prelude para o mesmo caminho de materialização.

- [ ] **Etapa 6: Executar os testes de startup do adapter**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/bash-startup-script.test.ts tests/exec.test.ts -t "startup"
```

Esperado: os testes relacionados a startup passam.

---

### Tarefa 5: Mesclar o conteúdo do embedded prelude no caminho do startup script

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/index.ts`
- Modificar: `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`
- Modificar: `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`

**Interfaces:**
- Produz: `buildEmbeddedSearchPreludeContent(prelude, options): string | undefined`
- Preserva: `applyEmbeddedSearchPrelude(command, prelude, options): string`

- [ ] **Etapa 1: Adicionar teste do content builder**

Em `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`, acrescente:

```ts
it("can build prelude content without appending the user command", () => {
  const content = buildEmbeddedSearchPreludeContent({
    kind: "embedded-search",
    backend: {
      kind: "internal-cli",
      command: "zcode",
      args: ["__internal-search"],
    },
  });

  expect(content).toContain("unalias find 2>/dev/null || true");
  expect(content).toContain('command zcode __internal-search find "$@"');
  expect(content).not.toContain("grep needle file.txt");
});
```

Atualize o import:

```ts
import {
  applyEmbeddedSearchPrelude,
  buildEmbeddedSearchPreludeContent,
} from "../src/exec/embedded-search-prelude.js";
```

- [ ] **Etapa 2: Executar o teste e verificar a falha**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/embedded-search-prelude.test.ts -t "build prelude content"
```

Esperado: falha porque `buildEmbeddedSearchPreludeContent` não existe.

- [ ] **Etapa 3: Refatorar o builder do embedded prelude**

Em `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`, acrescente:

```ts
export function buildEmbeddedSearchPreludeContent(
  prelude?: ExecutionEmbeddedSearchPrelude,
  options: EmbeddedSearchPreludeOptions = {},
): string | undefined {
  if (prelude?.kind !== "embedded-search") return undefined;
  if (!supportsPosixShellFunctionPrelude(options.shellDialect)) return undefined;

  const backend = normalizeBackendForShell(prelude.backend, options.shellDialect);
  return [
    "unalias find 2>/dev/null || true",
    "unalias grep 2>/dev/null || true",
    createFindFunction(backend),
    createGrepFunction(backend),
  ].join("\n");
}
```

Depois reescreva `applyEmbeddedSearchPrelude()` como:

```ts
export function applyEmbeddedSearchPrelude(
  command: string,
  prelude?: ExecutionEmbeddedSearchPrelude,
  options: EmbeddedSearchPreludeOptions = {},
): string {
  const content = buildEmbeddedSearchPreludeContent(prelude, options);
  return content ? [content, command].join("\n") : command;
}
```

- [ ] **Etapa 4: Combinar o conteúdo de startup e do embedded prelude no adapter**

Em `apps/zcode-cli/packages/adapters/src/exec/index.ts`, importe:

```ts
import { buildEmbeddedSearchPreludeContent } from "./embedded-search-prelude.js";
```

Depois atualize `applyBashStartupToExecutionRequest()` para materializar o conteúdo combinado:

```ts
    const embeddedPreludeContent = buildEmbeddedSearchPreludeContent(request.bashPrelude, {
      shellDialect: cwdDialect,
    });
    const startup =
      request.bashStartup || embeddedPreludeContent
        ? {
            kind: "session-script" as const,
            id: request.bashStartup?.id ?? "embedded-search-startup",
            content: [request.bashStartup?.content, embeddedPreludeContent]
              .filter((part): part is string => Boolean(part && part.length > 0))
              .join("\n"),
          }
        : undefined;

    const materialized = materializeBashStartupScript(startup, {
      rootDir,
      sessionId,
      shellDialect: cwdDialect,
    });
```

Depois que isso estiver ligado, remova a chamada antiga de `applyBashPreludeToExecutionRequest()` de `spawnChild()`, de modo que exista apenas um caminho de Bash startup.

- [ ] **Etapa 5: Preservar o comportamento desabilitado atual**

Confirme que o core ainda não envia `bashPrelude` enquanto a flag estiver desabilitada:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/core exec vitest run tests/embedded-search-shell.test.ts tests/bash-handler.test.ts
```

Esperado: os testes passam e o request do Bash tem `bashStartup` mas não `bashPrelude`.

- [ ] **Etapa 6: Executar os testes de prelude do adapter**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/embedded-search-prelude.test.ts tests/bash-startup-script.test.ts
```

Esperado: todos os testes passam.

---

### Tarefa 6: Documentar o contrato de runtime

**Arquivos:**
- Modificar: `docs/runtime-tools/bash-effective-shell-snapshot.md`
- Modificar: `docs/superpowers/plans/2026-06-26-bash-session-startup-script-snapshot.md`

**Interfaces:**
- Produz: limites de propriedade documentados e critérios de aceitação.

- [ ] **Etapa 1: Adicionar a seção de startup snapshot `.sh`**

Em `docs/runtime-tools/bash-effective-shell-snapshot.md`, acrescente uma seção depois da seção existente de session shell owner:

```md
## Bash Startup `.sh` Snapshot

Bash tool execution may source a ZCode-generated session startup script before running the model command. This script is internal execution infrastructure; it is not provider-visible prompt content and does not change the tool schema.

- `core` produces an `ExecutionBashStartupScript` descriptor for Bash tool requests.
- `adapters` materializes the descriptor under ZCode-owned storage using a session/hash-scoped path.
- POSIX and Git Bash shells source the materialized `.sh` file before the user command.
- CMD and legacy shell fallback do not source `.sh` files.
- The startup script content must come only from ZCode internal builders.
- The first implementation keeps the script side-effect free; embedded search aliases remain disabled unless the dedicated runtime flag is changed.

This file path is not persisted as session state. Resume reconstructs the descriptor and lets the adapter materialize the script again.
```

- [ ] **Etapa 2: Adicionar nota de conclusão do plano**

No final deste plano, atualize a seção de status de execução após a implementação:

```md
## Execution Notes

- Provider-visible main system prompt remained unchanged.
- Runtime find/grep alias injection remained disabled.
- Bash startup `.sh` file is sourced only for POSIX/Git Bash shell profiles.
```

- [ ] **Etapa 3: Executar as verificações de grep na documentação**

Execute:

```bash
rg -n "Bash Startup `.sh` Snapshot|ExecutionBashStartupScript|embedded search aliases remain disabled" docs/runtime-tools/bash-effective-shell-snapshot.md docs/superpowers/plans/2026-06-26-bash-session-startup-script-snapshot.md
```

Esperado: as três frases estão presentes na documentação.

---

### Tarefa 7: Verificação final

**Arquivos:**
- Nenhuma edição de código, a menos que a verificação exponha uma falha concreta.

**Interfaces:**
- Consome: as saídas de todas as tarefas anteriores.
- Produz: working tree pronto para revisão.

- [ ] **Etapa 1: Executar os testes focados**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/contracts typecheck
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/bash-startup-script.test.ts tests/embedded-search-prelude.test.ts tests/exec.test.ts
pnpm --dir apps/zcode-cli --filter @zcode/core exec vitest run tests/bash-handler.test.ts tests/embedded-search-shell.test.ts tests/context-builder.test.ts tests/main-tool-pool.test.ts tests/subagent-explore.test.ts
```

Esperado: todos os comandos saem com 0.

- [ ] **Etapa 2: Executar os typechecks de pacote**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/contracts typecheck
pnpm --dir apps/zcode-cli --filter @zcode/adapters typecheck
pnpm --dir apps/zcode-cli --filter @zcode/core typecheck
```

Esperado: todos os comandos saem com 0.

- [ ] **Etapa 3: Executar o lint no código tocado**

Execute:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec oxlint src/exec/bash-startup-script.ts src/exec/embedded-search-prelude.ts src/exec/index.ts
pnpm --dir apps/zcode-cli --filter @zcode/core exec oxlint src/tool/handlers/bash-startup.ts src/tool/handlers/bash.ts src/embedded-search/shell.ts
```

Esperado: ambos os comandos saem com 0.

- [ ] **Etapa 4: Confirmar que o prompt provider-visible não mudou**

Execute:

```bash
git diff -- apps/zcode-cli/packages/core/src/context apps/zcode-cli/packages/core/src/context/sections apps/zcode-cli/packages/core/tests/context-builder.test.ts
```

Esperado: nenhum diff causado por este plano. Se houver diff, ele deve ser sem relação e já estar presente antes de executar este plano.

- [ ] **Etapa 5: Confirmar que o alias de runtime continua desabilitado**

Execute:

```bash
rg -n "const ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE = false|shouldInjectEmbeddedSearchBashPrelude" apps/zcode-cli/packages/core/src/embedded-search/shell.ts apps/zcode-cli/packages/core/tests/embedded-search-shell.test.ts
```

Esperado:

- `ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE = false` está presente.
- o teste ainda afirma que `shouldInjectEmbeddedSearchBashPrelude()` retorna `false`.

- [ ] **Etapa 6: Verificação de higiene**

Execute:

```bash
git diff --check
git status --short
```

Esperado:

- `git diff --check` sai com 0.
- `git status --short` mostra apenas os arquivos pretendidos deste plano e quaisquer alterações preexistentes do usuário.

---

## Critérios de Aceitação

- Requests do Bash tool incluem um descriptor interno `bashStartup`.
- O adapter materializa `bashStartup` em um arquivo `.sh` sob storage pertencente ao ZCode.
- Execuções do Bash tool em POSIX e Git Bash fazem `source` do script materializado antes do comando do modelo.
- Execuções em CMD e legacy shell pulam o `source` do startup `.sh`.
- O Git Bash recebe um caminho de `source` compatível com Git Bash.
- A lógica existente de embedded search prelude consegue produzir conteúdo de script, mas a injeção de aliases em runtime continua desabilitada por flag.
- O system prompt provider-visible do main agent permanece inalterado por este plano.
- A política de exposição provider-visible das ferramentas `Glob/Grep` permanece inalterada por este plano.
- Nenhum caminho absoluto de startup script é persistido no session store.
- Testes focados e typechecks passam.

## Checklist de Auto-Revisão

- [ ] Nenhuma tarefa altera o system prompt provider-visible do main agent.
- [ ] Nenhuma tarefa reabilita a injeção de aliases `find()` / `grep()`.
- [ ] `ExecutionBashStartupScript` é claramente de uso interno apenas.
- [ ] O adapter é dono da materialização em filesystem e da conversão de caminho.
- [ ] O core não importa builders de prelude do adapter.
- [ ] `embedded-search-prelude.ts` permanece retrocompatível com os testes existentes.
- [ ] O `source` do startup script acontece antes do wrapper de captura de cwd, para que a execução do comando enxergue as definições de startup.
- [ ] O comportamento de fallback CMD/legacy não se transforma em erro de spawn.
- [ ] A documentação explica a diferença entre snapshot de seleção de shell e startup snapshot `.sh`.

## Notas de Execução

- O system prompt provider-visible do main agent permaneceu inalterado.
- A injeção de aliases find/grep em runtime permaneceu desabilitada.
- O arquivo `.sh` de startup do Bash tem `source` apenas para shell profiles POSIX/Git Bash.