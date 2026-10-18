# Plano de Implementação do Runtime bfs/ugrep Embutido

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer o ZCode consumir os binários `rg` / `bfs` / `ugrep` empacotados em todas as plataformas suportadas, e fazer a camada de execução Bash `find` / `grep` usar de fato o `bfs` / `ugrep` embutidos no branch embedded-search.

**Arquitetura:** a policy de embedded-search visível ao provider permanece como está; a camada de execução passa do passthrough atual de `internal-cli` para `argv0-dispatch` quando há binários embutidos disponíveis. O ZCode não faz multicall ELF nativo do Bun; a primeira versão usa um shim de multicall de CLI que lê `ARGV0` / `process.argv0` e encaminha para o `rg` / `bfs` / `ugrep` empacotado. Mais adiante, se houver um binário multicall realmente nativo, basta substituir o backend resolver.

**Stack tecnológico:** TypeScript, Node.js CLI, recursos de runtime do Electron, assets SEA, scripts de inicialização do shell snapshot, `@zcode/contracts`, `@zcode/shared`, `@zcode/adapters`, Vitest.

## Restrições Globais

- Versões alvo: `rg 14.1.1`, `bfs 4.1.1`, `ugrep 7.5.0`.
- Semântica das shell functions: zsh / msys / cygwin / win32 usam `ARGV0=<tool> "$_bin"`; bash usa `exec -a <tool> "$_bin"`.
- Argumentos padrão de `find`: `-S dfs -regextype findutils-default`.
- Argumentos padrão de `grep`: `-G --ignore-files --hidden -I --exclude-dir=.git/.svn/.hg/.bzr/.jj/.sl`.
- Padrões de bypass de `grep`: `-*-filter*`, `-*-pager*`, `-*-view*`, `-*-format-open*`, `-*-config*`, `---*`, `-@*`, `-*-save-config*`.
- A matriz de plataformas suportadas deve cobrir explicitamente: `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`.
- Cada plataforma suportada deve fornecer e verificar os três binários empacotados `rg` / `bfs` / `ugrep`; release, desktop packaging, remote resource e SEA smoke devem falhar se faltar qualquer um deles. Não é permitido produzir um pacote oficial "de plataforma suportada, mas com fallback apenas para comandos do sistema".
- Realidade do upstream: o release de `bfs` só tem pacote de código-fonte; o release de `ugrep` só tem pacote pré-compilado para Windows x64; não há pacote npm utilizável de binários `ugrep` / `bfs` reais. Portanto, a capacidade embutida em todas as plataformas precisa depender de artefatos pré-compilados construídos pelo próprio ZCode ou hospedados na intranet.
- Quando faltarem binários embutidos em runtime, ainda é preciso degradar com elegância, sem deixar a chamada da ferramenta Bash sem saída ou travada; mas esse fallback serve apenas para dev/manual/ambiente corrompido anômalo, e não é um estado aceitável para artefatos de release em plataformas suportadas.
- Não alterar a superfície de prompt/tool visível ao provider, a menos que se abra depois uma tarefa separada de ajuste de prompt.
- Não commitar blobs binários grandes no git; carregá-los por script de download, desktop bundled-tools, remote resource package e mecanismo de SEA asset.
- Qualquer suporte a Windows Git Bash deve usar a conversão de caminho existente `windowsPathToGitBashPath`.

---

## Resumo da Pesquisa

- A forma alvo do argv0-dispatch é um único binário multicall: `ARGV0=rg` executa `ripgrep 14.1.1`; `ARGV0=bfs` executa `bfs 4.1.1`; `ARGV0=ugrep` executa `ugrep 7.5.0`.
- As functions `find` / `grep` do prelude primeiro verificam se o binário multicall é executável; quando não é, caem para `command find "$@"` / `command grep "$@"`.
- A parte reaproveitável de `origin/xiaodexiong` é o paradigma de distribuição/resolver de runtime tools; ele não empacota `bfs` de forma completa. Seu ADR-0007 diz explicitamente que `bfs` nunca é empacotado, que `ugrep` só é baixado para Windows x64 e que `rg` vem de `@vscode/ripgrep`.
- O trunk atual já tem `packages/shared/src/runtime-tool-runtime.ts`, `packages/services/src/runtime-tools/runtimeToolResolver.ts`, `scripts/download-ripgrep.mjs`, `scripts/prepare-prebuilds.mjs`, desktop bundled-tools e o mecanismo de remote resource package; esses são as costuras corretas para adicionar os novos recursos `bfs` / `ugrep`.
- O remote prebuild atual publica apenas `linux-arm64`, `linux-x64`, `darwin-arm64`, `darwin-x64`; o desktop packaging suporta macOS, Linux e Windows em x64/arm64 via `ZCODE_TARGET_OS` / `ZCODE_TARGET_ARCH`. O plano de ferramentas de busca precisa preparar assets para a matriz completa de seis plataformas e deixar o remote consumir apenas as quatro de macOS/Linux.

## Estrutura de Arquivos

- Modificar `packages/shared/src/runtime-tool-runtime.ts`
  - Adicionar `RuntimeToolId = "ripgrep" | "bfs" | "ugrep"`.
  - Adicionar os descriptors `ZCODE_BFS_BINARY` / `ZCODE_UGREP_BINARY`.

- Modificar `packages/services/src/runtime-tools/runtimeToolResolver.ts`
  - Manter a capacidade genérica do resolver; completar os testes cobrindo múltiplas ferramentas.

- Modificar `packages/services/src/runtime-tools/runtimeCommandEnv.ts`
  - `buildRuntimeProcessEnvPatch()` passa de `["ripgrep"]` para `["ripgrep", "bfs", "ugrep"]`.

- Criar `scripts/search-runtime-tools.mjs`
  - Definir centralmente as versões de `rg/bfs/ugrep`, a matriz de plataformas suportadas, a nomenclatura interna de download e o manifesto sha256.

- Modificar `scripts/download-ripgrep.mjs`
  - Preservar a compatibilidade dos argumentos de CLI existentes, apenas atualizando a versão padrão de ripgrep de `v13.0.0-10` para a versão alvo `14.1.1`.

- Criar `scripts/download-search-runtime-tool.mjs`
  - Responsável apenas pelo novo download de `bfs` / `ugrep`, sem assumir o entrypoint existente de `ripgrep`.

- Modificar `scripts/prepare-prebuilds.mjs`
  - Adicionar os resource components `bfs` / `ugrep` aos assets remotos.

- Modificar `packages/desktop/scripts/prepare-runtime-assets.mjs`
  - Adicionar `prepare:bfs` / `prepare:ugrep` aos runtime assets locais do desktop.

- Modificar `packages/desktop/scripts/ensure-local-runtime-assets.mjs`
  - Adicionar `bfs` / `ugrep` à autoverificação de startup de dev.

- Modificar a fonte de configuração de packaging do desktop
  - As asserções de teste atuais estão em `packages/desktop/test/runtime-asset-scripts.test.ts`; a configuração real de extraResources deve incluir `tools/bfs` / `tools/ugrep`.

- Criar `apps/zcode-cli/packages/cli/src/bundled-search/multicall.ts`
  - Ler `process.env.ARGV0 || process.argv0` e, quando o valor for `rg` / `bfs` / `ugrep`, encaminhar para o runtime binary correspondente.

- Modificar `apps/zcode-cli/packages/cli/src/run.ts`
  - Adicionar o dispatch multicall antes de `__internal-search`.

- Modificar `apps/zcode-cli/packages/bootstrap/src/app/embedded-search-backend.ts`
  - Retornar `kind: "argv0-dispatch"` quando `ZCODE_BFS_BINARY` / `ZCODE_UGREP_BINARY` forem executáveis; caso contrário manter o `internal-cli` atual.

- Modificar `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
  - O branch `argv0-dispatch` passa a ser uma argv0 shell function: zsh / Windows com `ARGV0=...`, bash com `exec -a ...`.

- Testes
  - `packages/shared/test/runtimeToolRuntime.test.ts`
  - `packages/services/test/runtimeToolResolver.test.ts`
  - `packages/desktop/test/download-search-runtime-tool.test.ts`
  - `packages/desktop/test/runtime-asset-scripts.test.ts`
  - `apps/zcode-cli/packages/bootstrap/tests/embedded-search-backend.test.ts`
  - `apps/zcode-cli/packages/cli/tests/bundled-search-multicall.test.ts`
  - `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`
  - `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`
  - `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

---

### Tarefa 1: Fixar os Descriptors de Runtime Tools

**Arquivos:**
- Modificar: `packages/shared/src/runtime-tool-runtime.ts`
- Criar: `packages/shared/test/runtimeToolRuntime.test.ts`

**Interfaces:**
- Produz: `RuntimeToolId = "ripgrep" | "bfs" | "ugrep"`
- Produz: `getRuntimeToolRuntime(toolId: RuntimeToolId): RuntimeToolRuntimeDescriptor`

- [ ] **Passo 1: Escrever testes de descriptor que falham**

Criar `packages/shared/test/runtimeToolRuntime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRuntimeToolRuntime } from "../src/runtime-tool-runtime.js";

describe("runtime tool descriptors", () => {
  it("defines bundled search runtime tools", () => {
    expect(getRuntimeToolRuntime("ripgrep")).toMatchObject({
      binaryEnvVar: "ZCODE_RG_BINARY",
      bundledResourceDir: "ripgrep",
      version: "14.1.1",
    });
    expect(getRuntimeToolRuntime("bfs")).toMatchObject({
      binaryEnvVar: "ZCODE_BFS_BINARY",
      bundledResourceDir: "bfs",
      version: "4.1.1",
    });
    expect(getRuntimeToolRuntime("ugrep")).toMatchObject({
      binaryEnvVar: "ZCODE_UGREP_BINARY",
      bundledResourceDir: "ugrep",
      version: "7.5.0",
    });
  });

  it("uses platform executable names", () => {
    expect(getRuntimeToolRuntime("bfs").resolveEntrySegments("darwin")).toEqual(["bfs"]);
    expect(getRuntimeToolRuntime("bfs").resolveEntrySegments("win32")).toEqual(["bfs.exe"]);
    expect(getRuntimeToolRuntime("ugrep").resolveEntrySegments("win32")).toEqual(["ugrep.exe"]);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que ele falha**

Executar:

```bash
pnpm --filter @zcode/shared test -- runtimeToolRuntime.test.ts
```

Esperado: FALHA porque `bfs` / `ugrep` não fazem parte de `RuntimeToolId`.

- [ ] **Passo 3: Implementar os descriptors**

Atualizar `packages/shared/src/runtime-tool-runtime.ts`:

```ts
export type RuntimeToolId = "ripgrep" | "bfs" | "ugrep";
```

Adicionar entradas:

```ts
bfs: {
  binaryEnvVar: "ZCODE_BFS_BINARY",
  bundledResourceDir: "bfs",
  version: "4.1.1",
  resolveEntrySegments: (platform) => [resolvePlatformBinaryName("bfs", platform)],
},
ugrep: {
  binaryEnvVar: "ZCODE_UGREP_BINARY",
  bundledResourceDir: "ugrep",
  version: "7.5.0",
  resolveEntrySegments: (platform) => [resolvePlatformBinaryName("ugrep", platform)],
},
```

- [ ] **Passo 4: Executar o teste para verificar que ele passa**

Executar:

```bash
pnpm --filter @zcode/shared test -- runtimeToolRuntime.test.ts
```

Esperado: PASSA.

---

### Tarefa 2: Estender o Resolver de Env de Runtime

**Arquivos:**
- Modificar: `packages/services/src/runtime-tools/runtimeCommandEnv.ts`
- Modificar: `packages/services/test/runtimeToolResolver.test.ts`

**Interfaces:**
- Consome: `RuntimeToolId` da Tarefa 1
- Produz: `buildRuntimeProcessEnvPatch()` inclui `ZCODE_BFS_BINARY`, `ZCODE_UGREP_BINARY` e adiciona os diretórios deles ao início do `PATH`

- [ ] **Passo 1: Adicionar testes do resolver para bfs e ugrep**

Estender `packages/services/test/runtimeToolResolver.test.ts` com:

```ts
it("会从 bundled-tools 平台目录发现 bfs 和 ugrep binary 并注入 PATH", () => {
  delete process.env.ZCODE_BFS_BINARY;
  delete process.env.ZCODE_UGREP_BINARY;

  const sandboxRoot = mkdtempSync(join(tmpdir(), "zcode-search-tool-"));
  createdDirs.push(sandboxRoot);

  const appRepoDir = join(sandboxRoot, "z-code-2");
  const platformKey = `${process.platform}-${process.arch}`;
  const bfsName = process.platform === "win32" ? "bfs.exe" : "bfs";
  const ugrepName = process.platform === "win32" ? "ugrep.exe" : "ugrep";
  const bfsPath = join(appRepoDir, "packages", "desktop", "bundled-tools", platformKey, "bfs", bfsName);
  const ugrepPath = join(appRepoDir, "packages", "desktop", "bundled-tools", platformKey, "ugrep", ugrepName);

  mkdirSync(dirname(bfsPath), { recursive: true });
  mkdirSync(dirname(ugrepPath), { recursive: true });
  writeFileSync(bfsPath, "bfs\n");
  writeFileSync(ugrepPath, "ugrep\n");
  if (process.platform !== "win32") {
    chmodSync(bfsPath, 0o755);
    chmodSync(ugrepPath, 0o755);
  }

  process.chdir(appRepoDir);

  expect(realpathSync(findRuntimeToolBinary("bfs")!)).toBe(realpathSync(bfsPath));
  expect(realpathSync(findRuntimeToolBinary("ugrep")!)).toBe(realpathSync(ugrepPath));

  const envPatch = buildRuntimeToolEnvPatch(["bfs", "ugrep"], { PATH: "/usr/bin:/bin" });
  expect(realpathSync(envPatch.ZCODE_BFS_BINARY!)).toBe(realpathSync(bfsPath));
  expect(realpathSync(envPatch.ZCODE_UGREP_BINARY!)).toBe(realpathSync(ugrepPath));
});
```

- [ ] **Passo 2: Atualizar o patch de env do processo de runtime**

Alterar `packages/services/src/runtime-tools/runtimeCommandEnv.ts`:

```ts
const runtimeToolEnvPatch = buildRuntimeToolEnvPatch(["ripgrep", "bfs", "ugrep"], {
  ...baseEnv,
  ...(loginShellPath ? { PATH: loginShellPath } : {}),
});
```

- [ ] **Passo 3: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/services test -- runtimeToolResolver.test.ts
```

Esperado: PASSA.

---

### Tarefa 3: Adicionar o Manifesto de Download das Search Runtime Tools

**Arquivos:**
- Criar: `scripts/search-runtime-tools.mjs`
- Criar: `packages/desktop/test/searchRuntimeToolsManifest.test.ts`

**Interfaces:**
- Produz: `SEARCH_RUNTIME_TOOLS`
- Produz: `SUPPORTED_SEARCH_RUNTIME_PLATFORM_KEYS`
- Produz: `REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS`
- Produz: `resolveSearchRuntimeToolPlan({ toolId, targetPlatform, targetArch, env })`

- [ ] **Passo 1: Adicionar testes do manifesto**

Criar `packages/desktop/test/searchRuntimeToolsManifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS,
  SEARCH_RUNTIME_TOOLS,
  SUPPORTED_SEARCH_RUNTIME_PLATFORM_KEYS,
  resolveSearchRuntimeToolPlan,
} from "../../../scripts/search-runtime-tools.mjs";

describe("search runtime tool manifest", () => {
  const supportedPlatformKeys = [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-arm64",
    "win32-x64",
  ];

  it("pins search runtime tool versions", () => {
    expect(SEARCH_RUNTIME_TOOLS.ripgrep.version).toBe("14.1.1");
    expect(SEARCH_RUNTIME_TOOLS.bfs.version).toBe("4.1.1");
    expect(SEARCH_RUNTIME_TOOLS.ugrep.version).toBe("7.5.0");
  });

  it("locks the full supported search runtime platform matrix", () => {
    expect(SUPPORTED_SEARCH_RUNTIME_PLATFORM_KEYS).toEqual(supportedPlatformKeys);
    expect(REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
    ]);
  });

  it("builds platform-scoped output paths", () => {
    const plan = resolveSearchRuntimeToolPlan({
      toolId: "bfs",
      targetPlatform: "darwin",
      targetArch: "arm64",
      env: { ZCODE_SEARCH_TOOLS_BASE_URL: "https://deps.example.test/search-tools" },
    });
    expect(plan.platformKey).toBe("darwin-arm64");
    expect(plan.binaryName).toBe("bfs");
    expect(plan.releaseFileName).toBe("bfs-4.1.1-darwin-arm64.tar.gz");
    expect(plan.downloadUrl).toBe("https://deps.example.test/search-tools/bfs-4.1.1/bfs-4.1.1-darwin-arm64.tar.gz");
  });

  it("has an asset plan for every bundled search tool on every supported platform", () => {
    for (const platformKey of supportedPlatformKeys) {
      const [targetPlatform, targetArch] = platformKey.split("-");
      if (!targetPlatform || !targetArch) throw new Error(`Invalid test platform key: ${platformKey}`);

      for (const [toolId, tool] of Object.entries(SEARCH_RUNTIME_TOOLS)) {
        const plan = resolveSearchRuntimeToolPlan({
          toolId,
          targetPlatform,
          targetArch,
          env: { ZCODE_SEARCH_TOOLS_BASE_URL: "https://deps.example.test/search-tools" },
        });
        const archiveExt = targetPlatform === "win32" ? "zip" : "tar.gz";
        const binaryName = targetPlatform === "win32" ? `${tool.binary}.exe` : tool.binary;
        expect(plan.platformKey).toBe(platformKey);
        expect(plan.binaryName).toBe(binaryName);
        expect(plan.releaseFileName).toBe(`${tool.binary}-${tool.version}-${platformKey}.${archiveExt}`);
      }
    }
  });
});
```

- [ ] **Passo 2: Implementar o manifesto**

Criar `scripts/search-runtime-tools.mjs` com:

```js
import { join, resolve } from "node:path";
import { resolveIntranetDepsBaseUrl } from "./intranetDefaults.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

export const SEARCH_RUNTIME_TOOLS = {
  ripgrep: { version: "14.1.1", binary: "rg" },
  bfs: { version: "4.1.1", binary: "bfs" },
  ugrep: { version: "7.5.0", binary: "ugrep" },
};

export const SUPPORTED_SEARCH_RUNTIME_PLATFORM_KEYS = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
]);

export const REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
]);

export function normalizePlatform(raw) {
  switch ((raw ?? "").toLowerCase()) {
    case "mac":
    case "macos":
    case "darwin":
    case "osx":
      return "darwin";
    case "win":
    case "windows":
    case "win32":
      return "win32";
    case "linux":
      return "linux";
    default:
      return raw;
  }
}

export function normalizeArch(raw) {
  switch ((raw ?? "").toLowerCase()) {
    case "x86_64":
    case "x64":
    case "amd64":
      return "x64";
    case "aarch64":
    case "arm64":
      return "arm64";
    default:
      return raw;
  }
}

export function resolveSearchRuntimeDownloadBaseUrl(env = process.env) {
  return (
    env.ZCODE_SEARCH_TOOLS_BASE_URL?.trim().replace(/\/+$/, "") ||
    `${resolveIntranetDepsBaseUrl(env)}/search-tools`
  );
}

export function resolveSearchRuntimeToolPlan({
  toolId,
  targetPlatform,
  targetArch,
  forceRemoteOutput = false,
  env = process.env,
}) {
  const tool = SEARCH_RUNTIME_TOOLS[toolId];
  if (!tool) throw new Error(`Unsupported search runtime tool: ${toolId}`);

  const platform = normalizePlatform(targetPlatform);
  const arch = normalizeArch(targetArch);
  const platformKey = `${platform}-${arch}`;
  if (!SUPPORTED_SEARCH_RUNTIME_PLATFORM_KEYS.includes(platformKey)) {
    throw new Error(`Unsupported search runtime platform: ${platformKey}`);
  }
  const archiveExt = platform === "win32" ? "zip" : "tar.gz";
  const binaryName = platform === "win32" ? `${tool.binary}.exe` : tool.binary;
  const releaseFileName = `${tool.binary}-${tool.version}-${platformKey}.${archiveExt}`;
  const localOutputDir = join(repoRoot, "packages/desktop/bundled-tools", platformKey, toolId);
  const remoteOutputDir = join(repoRoot, "packages/desktop/mock-cdn/releases", "local", "tools", platformKey, toolId);
  const outputDir = forceRemoteOutput ? remoteOutputDir : localOutputDir;

  return {
    toolId,
    version: tool.version,
    platformKey,
    binaryName,
    releaseFileName,
    archiveExt,
    outputDir,
    downloadUrl: `${resolveSearchRuntimeDownloadBaseUrl(env)}/${tool.binary}-${tool.version}/${releaseFileName}`,
  };
}
```

- [ ] **Passo 3: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/desktop test -- searchRuntimeToolsManifest.test.ts
```

Esperado: PASSA.

---

### Tarefa 4: Baixar e Preparar os Assets de Runtime Tools

**Arquivos:**
- Criar: `scripts/download-search-runtime-tool.mjs`
- Modificar: `scripts/download-ripgrep.mjs`
- Modificar: `packages/desktop/package.json`
- Criar: `packages/desktop/test/download-search-runtime-tool.test.ts`

**Interfaces:**
- Consome: `resolveSearchRuntimeToolPlan()` da Tarefa 3
- Produz: `pnpm --filter @zcode/desktop prepare:bfs`
- Produz: `pnpm --filter @zcode/desktop prepare:ugrep`
- Preserva: `pnpm --filter @zcode/desktop prepare:rg`

- [ ] **Passo 1: Adicionar testes de planejamento de download de ferramenta**

Criar `packages/desktop/test/download-search-runtime-tool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSearchRuntimeToolPlan } from "../../../scripts/search-runtime-tools.mjs";

describe("download search runtime tool plan", () => {
  it("uses pinned bfs asset names", () => {
    const plan = resolveSearchRuntimeToolPlan({
      toolId: "bfs",
      targetPlatform: "linux",
      targetArch: "x64",
      env: { ZCODE_SEARCH_TOOLS_BASE_URL: "https://deps.example.test/search-tools" },
    });
    expect(plan.releaseFileName).toBe("bfs-4.1.1-linux-x64.tar.gz");
    expect(plan.binaryName).toBe("bfs");
  });

  it("uses Windows executable suffix for ugrep", () => {
    const plan = resolveSearchRuntimeToolPlan({
      toolId: "ugrep",
      targetPlatform: "win32",
      targetArch: "x64",
      env: { ZCODE_SEARCH_TOOLS_BASE_URL: "https://deps.example.test/search-tools" },
    });
    expect(plan.releaseFileName).toBe("ugrep-7.5.0-win32-x64.zip");
    expect(plan.binaryName).toBe("ugrep.exe");
  });
});
```

- [ ] **Passo 2: Implementar o downloader genérico**

Implementar `scripts/download-search-runtime-tool.mjs` apenas para `bfs` / `ugrep`. Não rotear `ripgrep` por este script na v1; o `download-ripgrep.mjs` existente já tem chamadores de produção e deve receber apenas o bump de versão no Passo 3.

```js
#!/usr/bin/env node

import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { resolveSearchRuntimeToolPlan } from "./search-runtime-tools.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function download(url, destinationPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const client = url.startsWith("https:") ? https : http;
    const file = createWriteStream(destinationPath);
    const cleanupAndReject = (error) => {
      file.close(() => {
        rmSync(destinationPath, { force: true });
        rejectPromise(error);
      });
    };
    client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close(() => {
          rmSync(destinationPath, { force: true });
          download(response.headers.location, destinationPath).then(resolvePromise, rejectPromise);
        });
        return;
      }
      if (response.statusCode !== 200) {
        cleanupAndReject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close((error) => (error ? rejectPromise(error) : resolvePromise())));
    }).on("error", cleanupAndReject);
    file.on("error", cleanupAndReject);
  });
}

function findBinaryRecursively(rootDir, binaryName) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findBinaryRecursively(fullPath, binaryName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === binaryName) {
      return fullPath;
    }
  }
  return null;
}

export async function downloadSearchRuntimeTool(argv = process.argv.slice(2), env = process.env) {
  const toolId = argv[0];
  if (toolId !== "bfs" && toolId !== "ugrep") {
    throw new Error("Usage: node scripts/download-search-runtime-tool.mjs <bfs|ugrep> [platform] [arch]");
  }
  const targetPlatform = argv[1] || env.ZCODE_TARGET_OS || process.platform;
  const targetArch = argv[2] || env.ZCODE_TARGET_ARCH || process.arch;
  const plan = resolveSearchRuntimeToolPlan({
    toolId,
    targetPlatform,
    targetArch,
    forceRemoteOutput: env.ZCODE_FORCE_REMOTE_MOCK_CDN === "1",
    env,
  });
  const binaryPath = join(plan.outputDir, plan.binaryName);
  if (existsSync(binaryPath)) return;

  mkdirSync(plan.outputDir, { recursive: true });
  mkdirSync(tmpdir(), { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), `zcode-${toolId}-`));
  const archivePath = join(tempDir, `${toolId}.${plan.archiveExt}`);
  const extractDir = join(tempDir, "extract");
  try {
    await download(plan.downloadUrl, archivePath);
    mkdirSync(extractDir, { recursive: true });
    if (plan.archiveExt === "zip") {
      if (process.platform === "win32") {
        run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force`]);
      } else {
        run("unzip", ["-q", archivePath, "-d", extractDir]);
      }
    } else {
      run("tar", ["-xzf", archivePath, "-C", extractDir]);
    }
    const extractedBinaryPath = findBinaryRecursively(extractDir, plan.binaryName);
    if (!extractedBinaryPath) throw new Error(`Failed to locate ${plan.binaryName}`);
    copyFileSync(extractedBinaryPath, binaryPath);
    if (!plan.binaryName.endsWith(".exe")) chmodSync(binaryPath, 0o755);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await downloadSearchRuntimeTool();
}
```

- [ ] **Passo 3: Manter a forma da CLI de `download-ripgrep.mjs` e subir a versão padrão**

Em `scripts/download-ripgrep.mjs`, manter o contrato de argumentos existente:

```text
node scripts/download-ripgrep.mjs [version] [platform] [arch]
```

Mudar apenas o padrão:

```js
const RIPGREP_VERSION = process.argv[2] || "14.1.1";
```

Depois atualizar os testes ou snapshots que afirmem a URL padrão de download do ripgrep de `ripgrep-v13.0.0-10` para `ripgrep-14.1.1`. Isso mantém intactos o `prepare:rg`, o `prepare-prebuilds` e a sobrescrita manual de versão existentes, ao mesmo tempo que move o padrão empacotado para a versão fixada.

- [ ] **Passo 4: Adicionar scripts do desktop**

Atualizar `packages/desktop/package.json`:

```json
"prepare:bfs": "node ../../scripts/download-search-runtime-tool.mjs bfs",
"prepare:ugrep": "node ../../scripts/download-search-runtime-tool.mjs ugrep"
```

- [ ] **Passo 5: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/desktop test -- download-search-runtime-tool.test.ts searchRuntimeToolsManifest.test.ts
```

Esperado: PASSA.

---

### Tarefa 5: Conectar os Runtime Assets de Desktop e Remotos

**Arquivos:**
- Modificar: `packages/desktop/scripts/prepare-runtime-assets.mjs`
- Modificar: `packages/desktop/scripts/ensure-local-runtime-assets.mjs`
- Modificar: `scripts/prepare-prebuilds.mjs`
- Modificar a fonte de extraResources do desktop builder
- Modificar: `packages/desktop/test/runtime-asset-scripts.test.ts`
- Modificar: `packages/desktop/test/preparePrebuildsReleaseReuse.test.ts`

**Interfaces:**
- Consome: scripts da Tarefa 4
- Produz: recursos do app empacotado localmente `tools/bfs/<binary>` e `tools/ugrep/<binary>`
- Produz: recursos do app empacotado localmente `tools/ripgrep/<binary>`
- Produz: componentes de release remotos `tools/<platform>/ripgrep`, `tools/<platform>/bfs` e `tools/<platform>/ugrep`

- [ ] **Passo 1: Adicionar testes de script**

Estender `packages/desktop/test/runtime-asset-scripts.test.ts`:

```ts
it("desktop 安装包应显式携带内置 bfs 和 ugrep runtime", () => {
  expect(electronBuilderConfigSource).toContain("from: `bundled-tools/${targetPlatform.key}/bfs`");
  expect(electronBuilderConfigSource).toContain('to: "tools/bfs"');
  expect(electronBuilderConfigSource).toContain("from: `bundled-tools/${targetPlatform.key}/ugrep`");
  expect(electronBuilderConfigSource).toContain('to: "tools/ugrep"');
});

it("runtime asset preparation should cover all bundled search tools", () => {
  expect(prepareRuntimeAssetsScriptSource).toContain('"prepare:rg"');
  expect(prepareRuntimeAssetsScriptSource).toContain('"prepare:bfs"');
  expect(prepareRuntimeAssetsScriptSource).toContain('"prepare:ugrep"');
  expect(ensureLocalRuntimeAssetsScriptSource).toContain('label: "ripgrep"');
  expect(ensureLocalRuntimeAssetsScriptSource).toContain('label: "bfs"');
  expect(ensureLocalRuntimeAssetsScriptSource).toContain('label: "ugrep"');
});

it("remote prebuilds should use the shared search runtime platform matrix", () => {
  expect(preparePrebuildsScriptSource).toContain("REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS");
  expect(preparePrebuildsScriptSource).toContain("SEARCH_RUNTIME_TOOLS");
  expect(preparePrebuildsScriptSource).toContain('id: "bfs"');
  expect(preparePrebuildsScriptSource).toContain('id: "ugrep"');
});
```

- [ ] **Passo 2: Atualizar a preparação local de runtime**

Em `packages/desktop/scripts/prepare-runtime-assets.mjs`:

```js
const localRuntimeScripts = [
  "prepare:agent-bundle",
  "prepare:rg",
  "prepare:bfs",
  "prepare:ugrep",
];
```

Em `packages/desktop/scripts/ensure-local-runtime-assets.mjs`, adicionar entradas para `bfs` / `ugrep` em `REQUIRED_LOCAL_RUNTIME_ASSETS`, ao lado da entrada `ripgrep` existente:

```js
{
  label: "bfs",
  script: "prepare:bfs",
  isReady: () => existsSync(join(bundledToolsRoot, "bfs", resolvePlatformBinaryName("bfs"))),
},
{
  label: "ugrep",
  script: "prepare:ugrep",
  isReady: () => existsSync(join(bundledToolsRoot, "ugrep", resolvePlatformBinaryName("ugrep"))),
},
```

- [ ] **Passo 3: Atualizar os remote prebuilds**

Em `scripts/prepare-prebuilds.mjs`:

- Importar `REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS` e `SEARCH_RUNTIME_TOOLS` de `./search-runtime-tools.mjs`.
- Substituir a fonte local de plataformas remotas de busca por `const remotePlatforms = [...REMOTE_SEARCH_RUNTIME_PLATFORM_KEYS];` para que a cobertura de plataformas remotas não possa divergir do manifesto de search runtime.
- Em `runRemoteBinaryDownloads()`, para cada `platformKey` em `remotePlatforms`, rodar downloads das três search tools:

```js
for (const platformKey of remotePlatforms) {
  const [targetOs, targetArch] = platformKey.split("-");
  if (!targetOs || !targetArch) throw new Error(`Invalid remote platform key: ${platformKey}`);

  for (const toolId of Object.keys(SEARCH_RUNTIME_TOOLS)) {
    const scriptName = toolId === "ripgrep" ? "download-ripgrep.mjs" : "download-search-runtime-tool.mjs";
    const args =
      toolId === "ripgrep"
        ? [join(rootDir, "scripts", scriptName), SEARCH_RUNTIME_TOOLS.ripgrep.version, targetOs, targetArch]
        : [join(rootDir, "scripts", scriptName), toolId, targetOs, targetArch];
    runCommand(process.execPath, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ZCODE_FORCE_REMOTE_MOCK_CDN: "1",
      },
    });
  }
}
```

- Em `buildReusableComponentRequiredPaths()`, retornar os nomes exatos de binário para todos os componentes de search tool:

```js
case "ripgrep":
  return [platformKey.startsWith("win32-") ? "rg.exe" : "rg"];
case "bfs":
  return [platformKey.startsWith("win32-") ? "bfs.exe" : "bfs"];
case "ugrep":
  return [platformKey.startsWith("win32-") ? "ugrep.exe" : "ugrep"];
```

- Em `buildRemoteComponentDefinitions()`, adicionar os ids de componente `bfs` e `ugrep` montados em `tools/<platformKey>/bfs` e `tools/<platformKey>/ugrep`; manter `ripgrep` montado em `tools/<platformKey>/ripgrep`.

- [ ] **Passo 4: Executar os testes de script**

Executar:

```bash
pnpm --filter @zcode/desktop test -- runtime-asset-scripts.test.ts preparePrebuildsReleaseReuse.test.ts
```

Esperado: PASSA.

---

### Tarefa 6: Implementar o Dispatch Multicall da CLI

**Arquivos:**
- Criar: `apps/zcode-cli/packages/cli/src/bundled-search/multicall.ts`
- Modificar: `apps/zcode-cli/packages/cli/src/run.ts`
- Criar: `apps/zcode-cli/packages/cli/tests/bundled-search-multicall.test.ts`

**Interfaces:**
- Produz: `resolveEffectiveMulticallName(env, argv0): "rg" | "bfs" | "ugrep" | undefined`
- Produz: `runBundledSearchMulticall(name, argv, io): Promise<number>`

- [ ] **Passo 1: Escrever os testes**

Criar `apps/zcode-cli/packages/cli/tests/bundled-search-multicall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveEffectiveMulticallName } from "../src/bundled-search/multicall.js";

describe("bundled search multicall", () => {
  it("prefers ARGV0 for zsh/Git Bash invocation", () => {
    expect(resolveEffectiveMulticallName({ ARGV0: "bfs" }, "zcode")).toBe("bfs");
    expect(resolveEffectiveMulticallName({ ARGV0: "ugrep" }, "zcode")).toBe("ugrep");
  });

  it("falls back to process.argv0 for bash exec -a invocation", () => {
    expect(resolveEffectiveMulticallName({}, "bfs")).toBe("bfs");
    expect(resolveEffectiveMulticallName({}, "/usr/local/bin/ugrep")).toBe("ugrep");
  });

  it("ignores normal zcode invocation", () => {
    expect(resolveEffectiveMulticallName({}, "zcode")).toBeUndefined();
  });
});
```

- [ ] **Passo 2: Implementar o resolver multicall**

Criar `apps/zcode-cli/packages/cli/src/bundled-search/multicall.ts`:

```ts
import { spawn } from "node:child_process";
import { basename } from "node:path";

export type SearchMulticallName = "rg" | "bfs" | "ugrep";

const MULTICALL_NAMES = new Set<SearchMulticallName>(["rg", "bfs", "ugrep"]);
const ENV_BY_NAME: Record<SearchMulticallName, string> = {
  rg: "ZCODE_RG_BINARY",
  bfs: "ZCODE_BFS_BINARY",
  ugrep: "ZCODE_UGREP_BINARY",
};

export function resolveEffectiveMulticallName(
  env: NodeJS.ProcessEnv = process.env,
  argv0: string = process.argv0,
): SearchMulticallName | undefined {
  const raw = env.ARGV0?.trim() || basename(argv0);
  return MULTICALL_NAMES.has(raw as SearchMulticallName) ? (raw as SearchMulticallName) : undefined;
}

export function runBundledSearchMulticall(
  name: SearchMulticallName,
  argv: readonly string[],
  io: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stderr: NodeJS.WritableStream;
    stdin?: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
  },
): Promise<number> {
  const binary = io.env?.[ENV_BY_NAME[name]]?.trim();
  if (!binary) {
    io.stderr.write(`zcode ${name}: bundled binary env ${ENV_BY_NAME[name]} is not set\n`);
    return Promise.resolve(127);
  }

  return new Promise((resolve) => {
    const child = spawn(binary, [...argv], {
      cwd: io.cwd,
      env: io.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    child.stdout.on("data", (chunk) => io.stdout.write(chunk));
    child.stderr.on("data", (chunk) => io.stderr.write(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      io.stderr.write(`zcode ${name}: ${error.message}\n`);
      resolve(error.code === "ENOENT" ? 127 : 1);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve(code ?? (signal ? 128 : 1));
    });
    if (io.stdin) io.stdin.pipe(child.stdin);
    else child.stdin.end();
  });
}
```

- [ ] **Passo 3: Conectar `run.ts`**

Em `apps/zcode-cli/packages/cli/src/run.ts`, antes de `__internal-search`:

```ts
const multicallName = resolveEffectiveMulticallName(process.env, process.argv0);
if (multicallName) {
  return runBundledSearchMulticall(multicallName, ctx.argv, {
    cwd: (deps.cwd ?? process.cwd)(),
    env: process.env,
    stderr: ctx.stderr,
    stdin: ctx.stdin,
    stdout: ctx.stdout,
  });
}
```

Não adicionar `env` ao `RunContext` nesta tarefa. O env do processo da CLI é a fonte de verdade para `ARGV0`, `ZCODE_RG_BINARY`, `ZCODE_BFS_BINARY` e `ZCODE_UGREP_BINARY`.

- [ ] **Passo 4: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/cli test -- bundled-search-multicall.test.ts
```

Esperado: PASSA.

---

### Tarefa 7: Trocar o Resolver de Backend para argv0-dispatch Quando as Ferramentas Embutidas Existem

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/bootstrap/src/app/embedded-search-backend.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/tests/embedded-search-backend.test.ts`

**Interfaces:**
- Consome: `ZCODE_BFS_BINARY`, `ZCODE_UGREP_BINARY`
- Produz: `EmbeddedSearchBackend.kind === "argv0-dispatch"` quando as ferramentas embutidas são executáveis
- Preserva: o fallback atual `internal-cli`

- [ ] **Passo 1: Adicionar testes**

Adicionar testes em `apps/zcode-cli/packages/bootstrap/tests/embedded-search-backend.test.ts`:

```ts
it("uses argv0-dispatch when bfs and ugrep binaries are executable", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "zcode-search-backend-"));
  const bfsPath = join(tempDir, process.platform === "win32" ? "bfs.exe" : "bfs");
  const ugrepPath = join(tempDir, process.platform === "win32" ? "ugrep.exe" : "ugrep");
  writeFileSync(bfsPath, "");
  writeFileSync(ugrepPath, "");
  if (process.platform !== "win32") {
    chmodSync(bfsPath, 0o755);
    chmodSync(ugrepPath, 0o755);
  }

  const backend = resolveDefaultEmbeddedSearchBackend({
    argv: ["/usr/local/bin/zcode"],
    env: {
      ZCODE_BFS_BINARY: bfsPath,
      ZCODE_UGREP_BINARY: ugrepPath,
    },
    execArgv: [],
    execPath: "/usr/local/bin/zcode",
  });

  expect(backend).toEqual({
    kind: "argv0-dispatch",
    command: "/usr/local/bin/zcode",
    env: {
      ZCODE_BFS_BINARY: bfsPath,
      ZCODE_UGREP_BINARY: ugrepPath,
    },
  });
});

it("keeps internal-cli when bundled bfs/ugrep are absent or not executable", () => {
  const backend = resolveDefaultEmbeddedSearchBackend({
    argv: ["/usr/local/bin/zcode"],
    env: {
      ZCODE_BFS_BINARY: "/missing/bfs",
      ZCODE_UGREP_BINARY: "/missing/ugrep",
    },
    execArgv: [],
    execPath: "/usr/local/bin/zcode",
  });
  expect(backend.kind).toBe("internal-cli");
});
```

- [ ] **Passo 2: Implementar o branch do resolver**

Em `resolveDefaultEmbeddedSearchBackend()`, antes do fallback `internal-cli`:

```ts
const bfsBinary = input.env?.ZCODE_BFS_BINARY?.trim();
const ugrepBinary = input.env?.ZCODE_UGREP_BINARY?.trim();
if (isExecutableSearchTool(bfsBinary) && isExecutableSearchTool(ugrepBinary)) {
  return {
    kind: "argv0-dispatch",
    command: input.execPath,
    env: {
      ...(inheritedEnv ?? {}),
      ZCODE_BFS_BINARY: bfsBinary,
      ZCODE_UGREP_BINARY: ugrepBinary,
      ...(input.env?.ZCODE_RG_BINARY ? { ZCODE_RG_BINARY: input.env.ZCODE_RG_BINARY } : {}),
    },
  };
}
```

Adicionar um pequeno helper local:

```ts
function isExecutableSearchTool(path: string | undefined): path is string {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
```

Quando `argv[1]` é um script entrypoint, incluí-lo em `args` exatamente como o `internal-cli` atual faz; `argv0-dispatch` ainda precisa executar o mesmo entrypoint do ZCode, apenas com `ARGV0` / `exec -a` alterado pela shell function.

- [ ] **Passo 3: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/bootstrap test -- embedded-search-backend.test.ts
```

Esperado: PASSA.

---

### Tarefa 8: Implementar o Prelude argv0

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
- Modificar: `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`
- Modificar: `apps/zcode-cli/packages/adapters/tests/bash-startup-script.test.ts`

**Interfaces:**
- Consome: `EmbeddedSearchBackend.kind === "argv0-dispatch"`
- Produz: shell functions usando a estratégia de dispatch argv0

- [ ] **Passo 1: Adicionar testes de forma exata**

Em `embedded-search-prelude.test.ts`, afirmar que o conteúdo de argv0-dispatch contém:

```ts
expect(content).toContain("if [[ -n $ZSH_VERSION ]]; then");
expect(content).toContain("ARGV0=bfs");
expect(content).toContain("elif [[ \"$OSTYPE\" == \"msys\" ]] || [[ \"$OSTYPE\" == \"cygwin\" ]] || [[ \"$OSTYPE\" == \"win32\" ]]; then");
expect(content).toContain("exec -a bfs");
expect(content).toContain("-S dfs -regextype findutils-default");
expect(content).toContain("ARGV0=ugrep");
expect(content).toContain("-G --ignore-files --hidden -I");
```

- [ ] **Passo 2: Implementar `createArgv0Function()`**

Refatorar `embedded-search-prelude.ts` para que `argv0-dispatch` use:

```ts
function createArgv0Function(
  name: "find" | "grep",
  argv0: "bfs" | "ugrep",
  backend: EmbeddedSearchBackend,
  defaultArgs: readonly string[],
  bypassLines: readonly string[] = [],
): string {
  const invocationArgs = defaultArgs.length > 0 ? `${defaultArgs.join(" ")} "$@"` : '"$@"';
  const envAssignments = createBackendEnvAssignments(backend);
  const executable = shellQuote(backend.command);
  const backendArgs = (backend.args ?? []).map(shellQuote).join(" ");
  const commandPrefix = [envAssignments, executable, backendArgs].filter(Boolean).join(" ");
  return [
    `${name}() {`,
    ...bypassLines,
    `  [[ -x ${executable} ]] || { command ${name} "$@"; return; }`,
    "  if [[ -n $ZSH_VERSION ]]; then",
    `    ARGV0=${argv0} ${commandPrefix} ${invocationArgs}`,
    '  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then',
    `    ARGV0=${argv0} ${commandPrefix} ${invocationArgs}`,
    "  elif [[ $BASHPID != $$ ]]; then",
    `    ${envAssignments ? `${envAssignments} ` : ""}exec -a ${argv0} ${executable}${backendArgs ? ` ${backendArgs}` : ""} ${invocationArgs}`,
    "  else",
    `    (${envAssignments ? `${envAssignments} ` : ""}exec -a ${argv0} ${executable}${backendArgs ? ` ${backendArgs}` : ""} ${invocationArgs})`,
    "  fi",
    "}",
  ].join("\n");
}
```

`createBackendEnvAssignments()` deve reutilizar o helper existente `createShellEnvAssignment()` e unir as entradas de `backend.env` com espaços:

```ts
function createBackendEnvAssignments(backend: EmbeddedSearchBackend): string {
  return Object.entries(backend.env ?? {})
    .map(([name, value]) => createShellEnvAssignment(name, value))
    .join(" ");
}
```

- [ ] **Passo 3: Manter `internal-cli` inalterado**

Não alterar o comportamento de `internal-cli` nesta tarefa. O passthrough atual é o caminho de fallback.

- [ ] **Passo 4: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts bash-startup-script.test.ts
```

Esperado: PASSA.

---

### Tarefa 9: Adicionar Testes de Execução Real com Binários Stub

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
- Modificar: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

**Interfaces:**
- Verifica: o prelude Bash realmente faz source de `.sh` e chega ao `argv0-dispatch`

- [ ] **Passo 1: Adicionar fixture de dispatcher zcode falso no teste**

Nos testes de exec dos adapters, criar um script executável temporário:

```sh
#!/usr/bin/env sh
case "${ARGV0:-$(basename "$0")}" in
  bfs) printf 'BFS:%s\n' "$*" ;;
  ugrep) printf 'UGREP:%s\n' "$*" ;;
  rg) printf 'RG:%s\n' "$*" ;;
  *) printf 'ZCODE:%s\n' "$*" ;;
esac
```

- [ ] **Passo 2: Executar o comando de shell pelo adapter**

Comando de teste:

```ts
const result = await adapter.run({
  command: {
    mode: "shell",
    command: 'find . -maxdepth 1 -type f; grep -R needle .',
    shellProfile: "posix-bash",
  },
  bashPrelude: {
    kind: "embedded-search",
    backend: { kind: "argv0-dispatch", command: fakeZcodePath },
  },
  cwd: tempDir,
  timeoutMs: 30_000,
  outputLimit: { maxInlineBytes: 1_000_000, maxBufferBytes: 1_000_000, persistOutput: "none" },
  trace: { sessionId: "s", turnId: "t", attributes: { toolCallId: "c" } } as never,
});
```

Esperado que o stdout contenha:

```text
BFS:-S dfs -regextype findutils-default . -maxdepth 1 -type f
UGREP:-G --ignore-files --hidden -I --exclude-dir=.git --exclude-dir=.svn --exclude-dir=.hg --exclude-dir=.bzr --exclude-dir=.jj --exclude-dir=.sl -R needle .
```

- [ ] **Passo 3: Executar os testes**

Executar:

```bash
pnpm --filter @zcode/adapters test -- exec.test.ts
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado: PASSA.

---

### Tarefa 10: Verificação Manual com Binários Reais

**Arquivos:**
- Sem mudanças de código-fonte

**Interfaces:**
- Verifica: o comportamento real de `bfs` / `ugrep`

- [ ] **Passo 1: Verificar que os runtime assets existem**

Executar em cada máquina alvo:

```bash
echo "$ZCODE_BFS_BINARY"
echo "$ZCODE_UGREP_BINARY"
"$ZCODE_BFS_BINARY" --version
"$ZCODE_UGREP_BINARY" --version
```

Esperado:

```text
bfs 4.1.1
ugrep 7.5.0
```

- [ ] **Passo 2: Verificar o comportamento dos aliases do Bash através do ZCode**

Executar uma chamada de ferramenta Bash em uma sessão do ZCode:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/.git" "$tmp/src" "$tmp/.hidden"
printf 'needle visible\n' > "$tmp/src/a.txt"
printf 'needle git\n' > "$tmp/.git/config"
printf 'needle hidden\n' > "$tmp/.hidden/b.txt"
find "$tmp" -maxdepth 3 -type f -name '*.txt' -print | sort
grep -R -n needle "$tmp" | sort
rm -rf "$tmp"
```

Esperado:

- `find` inclui `src/a.txt` e `.hidden/b.txt`。
- `grep` inclui `src/a.txt` e `.hidden/b.txt`。
- `grep` exclui `.git/config` porque `--exclude-dir=.git` é aplicado。

- [ ] **Passo 3: Verificar o fallback**

Remover as env vars de binário e executar:

```bash
env -u ZCODE_BFS_BINARY -u ZCODE_UGREP_BINARY zcode --version
```

Depois executar um comando `find` / `grep` do Bash em uma sessão.

Esperado:

- Nenhuma falha no startup。
- O backend resolver retorna `internal-cli`。
- A busca ainda funciona com o fallback best-effort atual。

---

## Decisões da V1

1. Versões estritamente fixadas: `rg 14.1.1`, `bfs 4.1.1`, `ugrep 7.5.0`.
2. `rg` / `bfs` / `ugrep` devem todos cobrir a matriz completa de plataformas suportadas na fonte de artefatos pré-compilados do próprio ZCode: `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`.
3. Windows arm64 é uma plataforma obrigatória na v1, porque o fluxo atual de build/release do desktop já cobre Windows arm64. Quando a fonte interna não tiver `bfs.exe` / `ugrep.exe` / `rg.exe`, o job de prepare/package correspondente deve falhar.
4. O resolver de runtime mantém o teste defensivo de "sem env ou não executável, não habilitar `argv0-dispatch`", mas isso é apenas para instalações corrompidas, execução em dev ou manual, e não é a semântica de degradação permitida em release.
5. A SEA na v1 não embute `bfs` / `ugrep` diretamente no binário de arquivo único; o artefato SEA precisa conseguir consumir o mesmo conjunto de search binaries por injeção de runtime asset/env externo. O smoke test da SEA deve verificar o caminho de injeção bem-sucedido; na falta de assets é permitido um fallback defensivo, mas isso não pode ser a configuração oficial de avaliação/publicação.

## Comandos de Verificação

Executar testes focados:

```bash
pnpm --filter @zcode/shared test -- runtimeToolRuntime.test.ts
pnpm --filter @zcode/services test -- runtimeToolResolver.test.ts
pnpm --filter @zcode/desktop test -- searchRuntimeToolsManifest.test.ts download-search-runtime-tool.test.ts runtime-asset-scripts.test.ts preparePrebuildsReleaseReuse.test.ts
pnpm --filter @zcode/cli test -- bundled-search-multicall.test.ts
pnpm --filter @zcode/bootstrap test -- embedded-search-backend.test.ts
pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts bash-startup-script.test.ts exec.test.ts
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Executar os gates obrigatórios do repo:

```bash
pnpm typecheck
pnpm lint
```

Executar o smoke manual:

```bash
pnpm --filter @zcode/desktop prepare:runtime-assets
pnpm --filter @zcode/cli build
pnpm --filter @zcode/cli build:sea
```

Executar o preflight de assets por plataforma antes de publicar:

```bash
for platform_key in darwin-arm64 darwin-x64 linux-arm64 linux-x64 win32-arm64 win32-x64; do
  os=${platform_key%-*}
  arch=${platform_key##*-}
  ZCODE_TARGET_OS="$os" ZCODE_TARGET_ARCH="$arch" pnpm --filter @zcode/desktop prepare:rg
  ZCODE_TARGET_OS="$os" ZCODE_TARGET_ARCH="$arch" pnpm --filter @zcode/desktop prepare:bfs
  ZCODE_TARGET_OS="$os" ZCODE_TARGET_ARCH="$arch" pnpm --filter @zcode/desktop prepare:ugrep
done
```

## Critérios de Aceitação

- O branch de embedded visível ao provider permanece inalterado.
- Com `ZCODE_BFS_BINARY` e `ZCODE_UGREP_BINARY` válidos, o `find` / `grep` do Bash é roteado pelas argv0 shell functions.
- Sem binários embutidos válidos, o comportamento cai para o caminho existente `internal-cli` / comando do sistema, sem travamento de comando nem saída vazia.
- `grep` recebe os argumentos padrão exatos e a lista de bypass definidos nas Restrições Globais.
- `find` recebe os argumentos padrão exatos definidos nas Restrições Globais.
- macOS zsh, macOS bash, Linux bash, Windows Git Bash e Windows cmd são todos cobertos por testes unitários; o cmd não faz source de shell functions POSIX.
- Para cada plataforma de desktop suportada (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`), `prepare:rg`, `prepare:bfs` e `prepare:ugrep` produzem binários empacotados executáveis em `packages/desktop/bundled-tools/<platform>/<tool>/`.
- Os manifestos de remote resource incluem `ripgrep`, `bfs` e `ugrep` para cada plataforma remota (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`).
- O smoke da SEA verifica que o mesmo caminho de injeção de `ZCODE_RG_BINARY`, `ZCODE_BFS_BINARY` e `ZCODE_UGREP_BINARY` funciona com a saída SEA construída.