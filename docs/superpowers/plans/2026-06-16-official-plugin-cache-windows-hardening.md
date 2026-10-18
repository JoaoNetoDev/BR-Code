# Plano de Implementação de Hardening do Cache de Plugins Oficiais no Windows

> **Para o agent que executa este plano:** é obrigatório usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar as tarefas uma a uma. O progresso é rastreado com a sintaxe de checkbox (`- [ ]`).

**Objetivo:** corrigir no Windows o problema em que a substituição do seed/cache dos plugins oficiais embutidos deixa resíduos `0.1.0.tmp-*` por causa de `ENOTEMPTY` / `EPERM`, e esses resíduos acabam sendo carregados como versões reais pelo fluxo de descoberta de plugins.

**Arquitetura:** dividir a correção em duas camadas: o lado de escrita do seed no bootstrap cuida de retry limitado, limpeza de diretórios de trabalho obsoletos, seed lock e retry de escrita atômica de manifest; o lado de descoberta de plugins no adapter cuida de ignorar diretórios de trabalho no cache dos plugins oficiais, garantindo que resíduos históricos não poluam o carregamento de plugins. bootstrap e adapters pertencem a pacotes diferentes e não importam módulos auxiliares de implementação de forma cruzada; o bootstrap hospeda o módulo auxiliar de retry do sistema de arquivos e os adapters hospedam a lógica mínima de filtragem de varredura.

**Stack técnico:** TypeScript, API síncrona `fs` do Node.js, Vitest, seed de plugins oficiais do `@zcode/bootstrap`, descoberta de plugins do `@zcode/adapters`.

---

## Contexto e Causa Raiz

Cadeia de falha já confirmada:

- O `seedBundledOfficialPlugins()` em `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts` escreve primeiro os plugins oficiais em `${targetRoot}.tmp-${process.pid}-${Date.now()}` e depois usa `replaceSeedRoot()` para remover o diretório da versão oficial e fazer `renameSync(tmp, targetRoot)`.
- Currently `replaceSeedRoot()` trata apenas `EEXIST` / `ENOTEMPTY` como um número limitado de retentativas de concorrência, e o `rmSync(targetRoot)` e o `rmSync(temporaryRoot)` dentro do catch não têm retry/backoff limitado unificado. No Windows, handles de arquivo, subprocessos MCP e varreduras do Defender/EDR podem fazer a remoção do diretório ou o rename falharem temporariamente.
- O `writeTextFileAtomically()` em `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts` também usa um `renameSync` cru para reescrever `.zcode-plugin/plugin.json`, e plugins oficiais com servidor MCP têm mais facilidade de encontrar competição de handles de manifest no Windows.
- O `scanOfficialCache()` em `apps/zcode-cli/packages/adapters/src/plugins/index.ts` trata todos os diretórios sob `cache/zcode-plugins-official/<plugin>/` como candidatos a versão, sem filtrar `0.1.0.tmp-*` nem `0.1.0.seed-lock`.

Critérios de aceite da correção:

- Não pode mais deixar muitos diretórios tmp e falhar na inicialização por causa de uma竞争ição transitória do sistema de arquivos do Windows.
- Os `0.1.0.tmp-*` que já existem na máquina não podem mais entrar no fluxo de descoberta de plugins.
- Os caminhos desktop continuous / Web remote replayable não devem ser afetados; esta mudança toca apenas no sistema de arquivos e no fluxo de descoberta de plugins do bootstrap/adapters do agent, sem alterar o protocolo app/remote/session/task realtime.

## Estrutura de Arquivos

- Novo: `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-cache-fs.ts`
  - Módulo auxiliar de sistema de arquivos do cache de plugins oficiais, exclusivo do bootstrap.
  - Responsável pela identificação de erros transitórios do Windows, retry/backoff síncrono, remoção de diretórios, rename, escrita atômica de manifest, limpeza de tmp/lock obsoletos e seed lock.
- Modificado: `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`
  - Usa o módulo auxiliar para substituir os `rmSync` / `renameSync` crus dentro de `replaceSeedRoot()`.
  - Limpa diretórios de trabalho obsoletos antes do seed e usa um seed lock em nível de versão para serializar a substituição da mesma versão de plugin.
  - Depois de obter o lock, reavalia `isSeedCurrent()` para evitar seed duplicado enquanto processos concorrentes esperam.
- Modificado: `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts`
  - Usa o `writeTextFileAtomicallyWithRetry()` do módulo auxiliar para reescrever `.zcode-plugin/plugin.json`.
- Modificado: `apps/zcode-cli/packages/adapters/src/plugins/index.ts`
  - O `scanOfficialCache()` filtra os diretórios de trabalho do cache de plugins oficiais, evitando tratar `*.tmp-*` / `*.seed-lock` como diretórios de versão de plugin.
- Novo teste: `apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts`
  - Testes unitários de retry/backoff, julgamento de erro transitório, limpeza de diretório de trabalho obsoleto e tomada de posse de seed lock obsoleto.
- Teste modificado: `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts`
  - Adiciona um teste de regressão em que o seed de plugin oficial limpa um `0.1.0.tmp-*` obsoleto e ainda grava a versão oficial.
- Teste modificado: `apps/zcode-cli/packages/adapters/tests/plugins.test.ts`
  - Adiciona um teste de regressão em que o fluxo de descoberta de plugins ignora diretórios de trabalho tmp/lock do cache de plugins oficiais.
- Nova documentação: `docs/official-plugin-cache-windows-hardening.md`
  - Registra a causa deste bug, a estratégia de correção e o escopo de validação no Windows, atendendo ao requisito de trilha de bugfix.

---

### Tarefa 1: Travar primeiro a regressão de poluição por tmp/lock no fluxo de descoberta do adapter

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/adapters/tests/plugins.test.ts`
- Modificado: `apps/zcode-cli/packages/adapters/src/plugins/index.ts`

- [ ] **Passo 1: escrever um teste que falha, provando que `.tmp-*` e `.seed-lock` hoje poluem a descoberta de plugins**

Dentro do `describe("NodePluginAdapter", () => { ... })` em `apps/zcode-cli/packages/adapters/tests/plugins.test.ts`, acrescente:

```ts
  it("ignores official cache work directories left by interrupted seed attempts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zcode-plugin-official-cache-workdirs-"));
    const storageRoot = join(dir, "plugins");
    const cacheRoot = join(storageRoot, "cache", "zcode-plugins-official", "document-skills");
    const temporaryVersionRoot = join(cacheRoot, "0.1.0.tmp-1234-1700000000000");
    const lockRoot = join(cacheRoot, "0.1.0.seed-lock");

    try {
      await writePluginManifest(temporaryVersionRoot, {
        name: "document-skills",
        skills: "skills",
        version: "0.1.0",
      });
      await mkdir(join(temporaryVersionRoot, "skills", "docx"), { recursive: true });
      await writeFile(join(temporaryVersionRoot, "skills", "docx", "SKILL.md"), "# docx");
      await mkdir(lockRoot, { recursive: true });

      const outcome = await createNodePluginAdapter({ storageRoot }).discoverPlugins({
        config: {
          dirs: [],
          enabled: true,
          enabledPlugins: {},
          options: {},
        },
        env: {},
        storageRoot,
        workingDirectory: dir,
      });

      expect(outcome.plugins).toEqual([]);
      expect(outcome.skillRoots).toEqual([]);
      expect(outcome.diagnostics).toEqual([]);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
```

- [ ] **Passo 2: executar o teste e confirmar que ele falha primeiro**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/plugins.test.ts
```

Esperado (antes da implementação): falha (FAIL). O ponto de falha deve ser `outcome.plugins` contendo `document-skills@zcode-plugins-official`, ou diagnostics contendo o erro de diretório de lock sem manifest.

- [ ] **Passo 3: filtrar diretórios de trabalho no lado de varredura da descoberta**

Modifique `apps/zcode-cli/packages/adapters/src/plugins/index.ts`.

Adicione um helper acima de `scanOfficialCache()`:

```ts
function isOfficialCacheWorkDirectoryName(name: string): boolean {
  return name.includes(".tmp-") || name.endsWith(".seed-lock");
}
```

Mude o laço interno de `scanOfficialCache()` para:

```ts
      for (const versionEntry of readdirSync(pluginDir, { withFileTypes: true })) {
        // Bugfix：Windows official plugin seed 失败后可能残留 0.1.0.tmp-* 或
        // 0.1.0.seed-lock；discovery 必须忽略这些工作目录，避免把未完成替换当真实版本加载。
        if (isOfficialCacheWorkDirectoryName(versionEntry.name)) continue;
        if (versionEntry.isDirectory()) roots.push(join(pluginDir, versionEntry.name));
      }
```

- [ ] **Passo 4: executar o teste do adapter e confirmar que passa**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/plugins.test.ts
```

Esperado (após a implementação): passa (PASS); o novo teste não descobre mais plugins a partir de diretórios tmp/lock.

---

### Tarefa 2: Bootstrap ganha um módulo auxiliar de sistema de arquivos para o cache de plugins oficiais

**Arquivos:**
- Novo: `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-cache-fs.ts`
- Novo: `apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts`

- [ ] **Passo 1: escrever o teste que falha do módulo auxiliar**

Crie `apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanupStaleOfficialPluginWorkDirectories,
  isTransientOfficialPluginCacheFsError,
  retryOfficialPluginCacheFs,
  withOfficialPluginSeedLock,
} from "../src/app/official-plugin-cache-fs.js";

describe("official plugin cache fs helpers", () => {
  it("classifies Windows directory replacement errors as transient", () => {
    for (const code of ["ENOTEMPTY", "EPERM", "EBUSY", "EEXIST"]) {
      expect(isTransientOfficialPluginCacheFsError(Object.assign(new Error(code), { code }))).toBe(
        true,
      );
    }
    expect(isTransientOfficialPluginCacheFsError(Object.assign(new Error("missing"), {
      code: "ENOENT",
    }))).toBe(false);
  });

  it("retries transient file-system errors with bounded attempts", () => {
    let attempts = 0;
    const result = retryOfficialPluginCacheFs(
      () => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error("busy"), { code: "EPERM" });
        }
        return "ok";
      },
      { attempts: 4, delayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("removes stale official plugin tmp and lock directories but keeps active tmp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zcode-official-plugin-cache-fs-"));
    const pluginDir = join(dir, "document-skills");
    const staleTmp = join(pluginDir, "0.1.0.tmp-111-1700000000000");
    const freshTmp = join(pluginDir, "0.1.0.tmp-222-1700000001000");
    const staleLock = join(pluginDir, "0.1.0.seed-lock");
    const oldDate = new Date(Date.now() - 10 * 60_000);

    try {
      await mkdir(staleTmp, { recursive: true });
      await mkdir(freshTmp, { recursive: true });
      await mkdir(staleLock, { recursive: true });
      await writeFile(join(staleTmp, "marker.txt"), "stale");
      await writeFile(join(freshTmp, "marker.txt"), "fresh");
      await utimes(staleTmp, oldDate, oldDate);
      await utimes(staleLock, oldDate, oldDate);

      cleanupStaleOfficialPluginWorkDirectories(pluginDir, "0.1.0", {
        minimumAgeMs: 60_000,
        nowMs: Date.now(),
      });

      expect(existsSync(staleTmp)).toBe(false);
      expect(existsSync(staleLock)).toBe(false);
      expect(existsSync(freshTmp)).toBe(true);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("takes over a stale seed lock and releases it after the action", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zcode-official-plugin-seed-lock-"));
    const targetRoot = join(dir, "document-skills", "0.1.0");
    const lockRoot = `${targetRoot}.seed-lock`;
    const oldDate = new Date(Date.now() - 10 * 60_000);

    try {
      await mkdir(lockRoot, { recursive: true });
      await utimes(lockRoot, oldDate, oldDate);

      let ran = false;
      withOfficialPluginSeedLock(
        targetRoot,
        () => {
          ran = true;
        },
        { attempts: 2, staleLockAgeMs: 60_000, delayMs: 0 },
      );

      expect(ran).toBe(true);
      expect(existsSync(lockRoot)).toBe(false);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
```

- [ ] **Passo 2: executar o novo teste e confirmar que ele falha primeiro**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/official-plugin-cache-fs.test.ts
```

Esperado (antes da implementação): falha (FAIL), porque `../src/app/official-plugin-cache-fs.js` ainda não existe.

- [ ] **Passo 3: criar a implementação do módulo auxiliar**

Crie `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-cache-fs.ts`:

```ts
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const TRANSIENT_OFFICIAL_PLUGIN_CACHE_ERROR_CODES = new Set([
  "EBUSY",
  "EEXIST",
  "ENOTEMPTY",
  "EPERM",
]);

const DEFAULT_RETRY_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_STALE_WORK_DIRECTORY_AGE_MS = 5 * 60_000;
const DEFAULT_STALE_LOCK_AGE_MS = 5 * 60_000;

interface RetryOptions {
  attempts?: number;
  delayMs?: number;
}

interface CleanupOptions {
  minimumAgeMs?: number;
  nowMs?: number;
}

interface SeedLockOptions extends RetryOptions {
  staleLockAgeMs?: number;
}

export function isTransientOfficialPluginCacheFsError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return TRANSIENT_OFFICIAL_PLUGIN_CACHE_ERROR_CODES.has(code);
}

export function retryOfficialPluginCacheFs<T>(
  operation: () => T,
  options: RetryOptions = {},
): T {
  const attempts = options.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_RETRY_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!isTransientOfficialPluginCacheFsError(error) || attempt === attempts - 1) {
        throw error;
      }
      sleepSync(delayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export function removeOfficialPluginCacheDirectory(path: string): void {
  retryOfficialPluginCacheFs(() => {
    rmSync(path, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
    });
  });
}

export function renameOfficialPluginCacheDirectory(from: string, to: string): void {
  retryOfficialPluginCacheFs(() => renameSync(from, to));
}

export function writeTextFileAtomicallyWithRetry(filePath: string, contents: string): void {
  const temporaryPath = join(
    dirname(filePath),
    `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  try {
    writeFileSync(temporaryPath, contents);
    retryOfficialPluginCacheFs(() => renameSync(temporaryPath, filePath));
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function cleanupStaleOfficialPluginWorkDirectories(
  pluginDirectory: string,
  version: string,
  options: CleanupOptions = {},
): void {
  const nowMs = options.nowMs ?? Date.now();
  const minimumAgeMs = options.minimumAgeMs ?? DEFAULT_STALE_WORK_DIRECTORY_AGE_MS;

  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(pluginDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isOfficialPluginWorkDirectoryName(entry.name, version)) continue;

    const entryPath = join(pluginDirectory, entry.name);
    let ageMs = 0;
    try {
      ageMs = nowMs - statSync(entryPath).mtimeMs;
    } catch (error) {
      if (isNotFoundError(error)) continue;
      throw error;
    }
    if (ageMs < minimumAgeMs) continue;
    removeOfficialPluginCacheDirectory(entryPath);
  }
}

export function withOfficialPluginSeedLock<T>(
  targetRoot: string,
  action: () => T,
  options: SeedLockOptions = {},
): T {
  const lockRoot = `${targetRoot}.seed-lock`;
  const attempts = options.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_RETRY_DELAY_MS;
  const staleLockAgeMs = options.staleLockAgeMs ?? DEFAULT_STALE_LOCK_AGE_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      mkdirSync(dirname(lockRoot), { recursive: true });
      mkdirSync(lockRoot);
      try {
        writeFileSync(
          join(lockRoot, "owner.json"),
          JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid }, null, 2),
        );
        return action();
      } finally {
        removeOfficialPluginCacheDirectory(lockRoot);
      }
    } catch (error) {
      if (!isAlreadyExistsError(error) || attempt === attempts - 1) throw error;
      cleanupStaleOfficialPluginWorkDirectories(dirname(targetRoot), basename(targetRoot), {
        minimumAgeMs: staleLockAgeMs,
      });
      sleepSync(delayMs * (attempt + 1));
    }
  }

  return action();
}

function isOfficialPluginWorkDirectoryName(name: string, version: string): boolean {
  return name.startsWith(`${version}.tmp-`) || name === `${version}.seed-lock`;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    String((error as NodeJS.ErrnoException).code) === "EEXIST"
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    String((error as NodeJS.ErrnoException).code) === "ENOENT"
  );
}

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
```

- [ ] **Passo 4: executar o teste do módulo auxiliar e confirmar que passa**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/official-plugin-cache-fs.test.ts
```

Esperado (após a implementação): passa (PASS); os 4 testes do módulo auxiliar passam.

---

### Tarefa 3: Lado de escrita do seed no bootstrap ganha lock, limpeza de diretórios obsoletos e retry

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`
- Modificado: `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts`

- [ ] **Passo 1: escrever o teste de regressão de limpeza de tmp obsoleto**

Nos imports do topo de `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts`, acrescente `utimes`:

```ts
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
```

Dentro do `describe("ZCode plugins", () => { ... })`, acrescente:

```ts
  it("cleans stale official plugin seed work directories before reseeding", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-bootstrap-stale-plugin-tmp-"));
    const entryRoot = join(root, "resources", "glm");
    const pluginStorageRoot = join(root, "plugins");
    const staleTmpRoot = join(
      pluginStorageRoot,
      "cache",
      "zcode-plugins-official",
      "document-skills",
      "0.1.0.tmp-1234-1700000000000",
    );
    const targetRoot = join(pluginStorageRoot, OFFICIAL_DOCUMENT_SKILLS_PLUGIN_CACHE_PATH);
    const originalEntrypoint = process.argv[1];
    const oldDate = new Date(Date.now() - 10 * 60_000);

    try {
      await writeTestFile(join(entryRoot, "zcode.cjs"), "");
      await writePackagedPluginFixture(entryRoot, "document-skills-plugin", "document-skills");
      await writeTestFile(join(staleTmpRoot, ".zcode-plugin", "plugin.json"), "{}");
      await utimes(staleTmpRoot, oldDate, oldDate);

      process.argv[1] = join(entryRoot, "zcode.cjs");
      resolveOfficialPluginRoots({ storageRoot: pluginStorageRoot });

      expect(existsSync(staleTmpRoot)).toBe(false);
      expect(existsSync(join(targetRoot, ".zcode-plugin", "plugin.json"))).toBe(true);
      expect(existsSync(join(targetRoot, "skills", "demo", "SKILL.md"))).toBe(true);
    } finally {
      process.argv[1] = originalEntrypoint;
      await rm(root, { force: true, recursive: true });
    }
  });
```

- [ ] **Passo 2: executar o teste de plugins do bootstrap e confirmar que o novo teste falha primeiro**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/plugins.test.ts
```

Esperado (antes da implementação): falha (FAIL). O ponto de falha deve ser o tmp obsoleto ainda existindo.

- [ ] **Passo 3: modificar os imports de `bundled-plugins.ts`**

Em `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`:

Remova `renameSync` e `rmSync` do import de `node:fs`, mantendo os demais usos.

Acrescente `basename` ao import de `node:path`:

```ts
import { basename, dirname, join, resolve, sep } from "node:path";
```

Acrescente o import do helper:

```ts
import {
  cleanupStaleOfficialPluginWorkDirectories,
  removeOfficialPluginCacheDirectory,
  renameOfficialPluginCacheDirectory,
  withOfficialPluginSeedLock,
} from "./official-plugin-cache-fs.js";
```

- [ ] **Passo 4: adicionar lock em nível de versão ao fluxo de seed e uma segunda checagem de current após o lock**

Mude o corpo que gera o tmp e escreve os arquivos dentro de `for (const plugin of source.plugins) { ... }` para a forma abaixo:

```ts
  for (const plugin of source.plugins) {
    const targetRoot = officialPluginCacheRoot(input.storageRoot, plugin.definition);
    if (isSeedReady(targetRoot, plugin)) continue;

    withOfficialPluginSeedLock(targetRoot, () => {
      cleanupStaleOfficialPluginWorkDirectories(dirname(targetRoot), basename(targetRoot));
      if (isSeedReady(targetRoot, plugin)) return;

      const temporaryRoot = `${targetRoot}.tmp-${process.pid}-${Date.now()}`;
      removeOfficialPluginCacheDirectory(temporaryRoot);
      mkdirSync(temporaryRoot, { recursive: true });

      try {
        for (const file of plugin.files) {
          const bytes = readSeedFileBytes(source, plugin, file);
          if (hashBytes(bytes) !== file.sha256) {
            throw new Error(
              `Bundled plugin asset hash mismatch: ${plugin.definition.name}/${file.path}`,
            );
          }
          const outputPath = join(temporaryRoot, ...file.path.split("/"));
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, bytes);
          chmodSync(outputPath, modeForSeedFile(file.path, file.mode));
        }

        writeFileSync(
          join(temporaryRoot, SEED_MARKER_FILE),
          JSON.stringify(seedMarker(source, plugin), null, 2),
        );
        replaceSeedRoot(temporaryRoot, targetRoot, plugin);
        writeOfficialPluginRuntimeManifest({
          pluginName: plugin.definition.name,
          rootPath: targetRoot,
        });
      } catch (error) {
        // Bugfix：Windows 上 seed 替换失败后，tmp 目录本身也可能被 Defender/EDR 或子进程
        // 短暂占用；这里使用 bounded retry 清理，避免 0.1.0.tmp-* 在后续启动污染 discovery。
        removeOfficialPluginCacheDirectory(temporaryRoot);
        throw error;
      }
    });
  }
```

Adicione `isSeedReady()`, que substitui o julgamento inline de reescrita de manifest que ficava no topo do laço:

```ts
function isSeedReady(targetRoot: string, plugin: OfficialPluginSeedPluginSource): boolean {
  if (!isSeedCurrent(targetRoot, plugin)) return false;
  return tryWriteOfficialPluginRuntimeManifest({
    pluginName: plugin.definition.name,
    rootPath: targetRoot,
  });
}
```

- [ ] **Passo 5: modificar `replaceSeedRoot()` para usar o helper de retry**

Substitua `replaceSeedRoot()` por:

```ts
function replaceSeedRoot(
  temporaryRoot: string,
  targetRoot: string,
  plugin: OfficialPluginSeedPluginSource,
): void {
  for (let attempt = 0; attempt < 3; attempt++) {
    removeOfficialPluginCacheDirectory(targetRoot);
    mkdirSync(dirname(targetRoot), { recursive: true });
    try {
      renameOfficialPluginCacheDirectory(temporaryRoot, targetRoot);
      return;
    } catch (error) {
      if (!isDirectoryReplaceRace(error) || attempt === 2) throw error;
      if (isSeedCurrent(targetRoot, plugin)) {
        removeOfficialPluginCacheDirectory(temporaryRoot);
        return;
      }
    }
  }
}
```

Amplie os códigos de erro de `isDirectoryReplaceRace()` para:

```ts
    ["EBUSY", "EEXIST", "ENOTEMPTY", "EPERM"].includes(
      String((error as NodeJS.ErrnoException).code),
    )
```

- [ ] **Passo 6: executar o teste de plugins do bootstrap e confirmar que passa**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/plugins.test.ts
```

Esperado (após a implementação): passa (PASS); tanto a regressão de limpeza de tmp obsoleto quanto o comportamento existente de seed de plugin oficial passam.

---

### Tarefa 4: Reescrita do manifest de runtime usa escrita atômica com retry

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts`
- Modificado: `apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts`

- [ ] **Passo 1: adicionar teste de cobertura para a escrita atômica de texto**

Nos imports de `apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts`, acrescente:

```ts
  readFile,
```

Ao import de helper, acrescente:

```ts
  writeTextFileAtomicallyWithRetry,
```

Acrescente o teste:

```ts
  it("writes text files atomically without leaving temporary files on success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zcode-official-plugin-atomic-write-"));
    const filePath = join(dir, "plugin.json");

    try {
      writeTextFileAtomicallyWithRetry(filePath, "{\"name\":\"document-skills\"}\n");

      expect(await readFile(filePath, "utf8")).toBe("{\"name\":\"document-skills\"}\n");
      const entries = await import("node:fs/promises").then(({ readdir }) => readdir(dir));
      expect(entries.filter((entry) => entry.startsWith(".tmp-"))).toEqual([]);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
```

- [ ] **Passo 2: executar o teste do módulo auxiliar**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/official-plugin-cache-fs.test.ts
```

Esperado: passa (PASS).

- [ ] **Passo 3: modificar a implementação da escrita atômica do manifest de runtime**

Em `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts`:

Remova os imports `renameSync` e `writeFileSync`, mantendo apenas:

```ts
import { readFileSync } from "node:fs";
```

Acrescente o import do helper:

```ts
import { writeTextFileAtomicallyWithRetry } from "./official-plugin-cache-fs.js";
```

Remova `writeTextFileAtomically()` do final do arquivo e substitua a chamada:

```ts
  writeTextFileAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
```

por:

```ts
  writeTextFileAtomicallyWithRetry(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
```

- [ ] **Passo 4: executar o teste de plugins do bootstrap e confirmar que a reescrita de runtime não regrediu**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/plugins.test.ts
```

Esperado: passa (PASS); os args do MCP server de iOS/Android ainda apontam para `dist/mcp/server.js` sob o cache de plugins oficiais.

---

### Tarefa 5: Registrar a documentação de bugfix

**Arquivos:**
- Novo: `docs/official-plugin-cache-windows-hardening.md`

- [ ] **Passo 1: escrever o documento de trilha de bugfix**

Crie `docs/official-plugin-cache-windows-hardening.md`:

```md
# Windows 官方插件缓存加固

## 背景

Windows 桌面端启动时，内置官方插件会 seed 到：

`~/.zcode/cli/plugins/cache/zcode-plugins-official/<plugin>/<version>/`

事故日志显示 `document-skills@0.1.0` 附近有大量 `0.1.0.tmp-*` 残留，并伴随 `ENOTEMPTY` 与 `EPERM` rename 失败。

## 根因

seed 流程先写 `${version}.tmp-<pid>-<time>`，再删除正式版本目录并 rename tmp 到正式目录。Windows 上目录删除/rename 可能被运行中的进程、MCP 子进程、Defender 或 EDR 的短暂文件句柄打断。旧实现对 `rmSync`、`renameSync` 和失败后的 tmp 清理缺少统一有界重试，因此会留下完整 tmp 目录。

第二层问题是插件发现流程会扫描官方插件缓存下所有目录。历史残留的 `0.1.0.tmp-*` 会被当成真实版本目录，导致启动继续加载错误候选。

## 修复

- bootstrap seed 使用版本级 seed lock，避免多个进程同时替换同一官方插件缓存。
- seed 前清理足够老的 `${version}.tmp-*` 和 `${version}.seed-lock`。
- 官方插件缓存的 `rm`、`rename`、manifest 原子写统一走有界重试/退避，覆盖 `ENOTEMPTY`、`EPERM`、`EBUSY`、`EEXIST`。
- 插件发现流程明确忽略 `${version}.tmp-*` 和 `${version}.seed-lock` 工作目录，防止历史残留污染插件候选。

## 验证

- `pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/plugins.test.ts`
- `pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/official-plugin-cache-fs.test.ts`
- `pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/plugins.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## 影响面

本修复只涉及 agent 侧 bootstrap/adapters 官方插件缓存文件系统逻辑，不改变 app/main/host process 职责，不改变 ZCode protocol，不改变桌面端 continuous 与 Web remote replayable 的 task realtime 语义。
```

- [ ] **Passo 2: conferir que o documento não transformou o plano em promessa de implementação**

Executar:

```bash
PLACEHOLDER_PATTERN='T[B]D|TO[D]O|implement[ ]later|fill[ ]in[ ]details|待[补]|之后[补]'
rg -n "$PLACEHOLDER_PATTERN" docs/official-plugin-cache-windows-hardening.md
```

Esperado: nenhuma saída.

---

### Tarefa 6: validação completa e commit

**Arquivos:**
- Validar todos os arquivos tocados nas Tarefas 1-5.

- [ ] **Passo 1: executar o teste direcionado do adapter**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run tests/plugins.test.ts
```

Esperado: passa (PASS).

- [ ] **Passo 2: executar o teste do módulo auxiliar do bootstrap**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/official-plugin-cache-fs.test.ts
```

Esperado: passa (PASS).

- [ ] **Passo 3: executar o teste de plugins do bootstrap**

Executar:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/plugins.test.ts
```

Esperado: passa (PASS).

- [ ] **Passo 4: executar as validações obrigatórias do repositório**

Executar:

```bash
pnpm typecheck
```

Esperado: passa (PASS).

Executar:

```bash
pnpm lint
```

Esperado: passa (PASS).

- [ ] **Passo 5: conferir que o diff contém apenas os arquivos listados neste plano**

Executar:

```bash
git diff -- apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts apps/zcode-cli/packages/bootstrap/src/app/official-plugin-cache-fs.ts apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts apps/zcode-cli/packages/adapters/src/plugins/index.ts apps/zcode-cli/packages/adapters/tests/plugins.test.ts docs/official-plugin-cache-windows-hardening.md
```

Esperado: o diff contém apenas mudanças relacionadas ao hardening do cache de plugins oficiais no Windows.

- [ ] **Passo 6: fazer o commit no formato Conventional Commit**

Executar:

```bash
git add apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts apps/zcode-cli/packages/bootstrap/src/app/official-plugin-runtime.ts apps/zcode-cli/packages/bootstrap/src/app/official-plugin-cache-fs.ts apps/zcode-cli/packages/bootstrap/tests/official-plugin-cache-fs.test.ts apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts apps/zcode-cli/packages/adapters/src/plugins/index.ts apps/zcode-cli/packages/adapters/tests/plugins.test.ts docs/official-plugin-cache-windows-hardening.md
git commit -m "fix(cli): harden official plugin cache replacement on Windows"
```

Esperado: o commit é criado com sucesso; se houver arquivos não relacionados já em stage na área de trabalho, use commit com pathspec para enviar somente os arquivos acima.

---

## Autoavaliação

- Cobertura de requisitos: o plano cobre retry do lado de escrita do seed, escrita atômica do manifest de runtime, limpeza de tmp obsoleto, seed lock, filtragem de tmp/lock no fluxo de descoberta, testes, documentação e as validações obrigatórias `pnpm typecheck` / `pnpm lint`.
- Varredura de palavras de placeholder: o documento não mantém as strings de marcador de placeholder proibidas pela skill de plan.
- Consistência de tipos: o nome do helper permanece igual nos testes, no seed do bootstrap e no manifest de runtime; o filtro do adapter é independente dentro do pacote adapters e não importa a implementação do bootstrap de forma cruzada.