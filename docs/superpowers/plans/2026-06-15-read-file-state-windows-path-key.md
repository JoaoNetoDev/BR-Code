# Plano de Implementação da Correção da Chave de Caminho do Read File State no Windows

> **Para o agent que executa este plano:** é obrigatório usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar as tarefas uma a uma. O progresso é rastreado com a sintaxe de checkbox (`- [ ]`).

**Objetivo:** corrigir no Windows o problema em que o mesmo arquivo físico, por ter strings de caminho diferentes (por exemplo `c:/repo/a.txt`, `C:\repo\a.txt` ou o caminho relativo `a.txt`), faz com que Write/Edit depois de um Read ainda sejam julgados incorretamente como “não lidos antes”.

**Arquitetura:** Read, Write e Edit compartilham o mesmo read-state key normalizado, em vez de cada handler comparar suas próprias strings de caminho original. A canonicalização de caminho é usada apenas para a identidade interna de estado read-before-write/edit, sem alterar o `filePath` visível ao provider, os caminhos de permissão, os caminhos de diff ou a política global de caminhos.

**Stack técnico:** TypeScript, API de path do Node, Vitest, os handlers de ferramentas de arquivo existentes do `@zcode/core`.

---

## Estrutura de Arquivos

- Novo: `apps/zcode-cli/packages/core/src/tool/read-file-state.ts`
  - Responsável pela construção do read-state key, pela normalização de identidade de caminho no Windows e pelo helper de busca de read-state compartilhado por Read/Write/Edit.
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/read.ts`
  - Usa o helper compartilhado no lugar da construção local de cache-key.
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`
  - Usa o helper compartilhado no lugar da lógica de varredura `entry.path !== filePath` e da construção local da chave de full-read.
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`
  - Usa o helper compartilhado no lugar da lógica de varredura `entry.path !== filePath` e da construção local da chave de full-read, preservando ao mesmo tempo o comportamento existente de fallback de partial-read.
- Modificado: `apps/zcode-cli/packages/core/tests/write-tool-contract.test.ts`
  - Adiciona um teste de regressão de Write para o read-state key normalizado, evitando que o runner mac teste por engano o comportamento do handler de Windows usando o `node:path` da plataforma atual.
- Modificado: `apps/zcode-cli/packages/core/tests/edit-tool-contract.test.ts`
  - Adiciona um teste de regressão de Edit para o read-state key normalizado, evitando que o runner mac teste por engano o comportamento do handler de Windows usando o `node:path` da plataforma atual.
- Novo teste: `apps/zcode-cli/packages/core/tests/read-file-state.test.ts`
  - Testes unitários da lógica de normalização de key dependente de plataforma, sem depender de um runner Windows real.

---

### Tarefa 1: adicionar o teste unitário de path-key que falha

**Arquivos:**
- Novo: `apps/zcode-cli/packages/core/tests/read-file-state.test.ts`

- [ ] **Passo 1: escrever o teste unitário que falha para a identidade interna de caminho**

Crie `apps/zcode-cli/packages/core/tests/read-file-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createReadFileStatePathKey } from "../src/tool/read-file-state.js";

describe("read file state path keys", () => {
  it("treats equivalent Windows drive-letter paths as the same read-state file", () => {
    expect(createReadFileStatePathKey("c:/zcode-readwrite-repro/repro.txt", "win32")).toBe(
      createReadFileStatePathKey("C:\\zcode-readwrite-repro\\repro.txt", "win32"),
    );
  });

  it("normalizes Windows extended drive prefixes before comparing read-state files", () => {
    expect(createReadFileStatePathKey("\\\\?\\c:\\Repo\\File.txt", "win32")).toBe(
      createReadFileStatePathKey("C:\\Repo\\File.txt", "win32"),
    );
  });

  it("preserves non-drive Windows device namespace paths", () => {
    expect(createReadFileStatePathKey("\\\\?\\Volume{123}\\Repo\\File.txt", "win32")).toBe(
      "\\\\?\\Volume{123}\\Repo\\File.txt",
    );
    expect(
      createReadFileStatePathKey(
        "\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy1\\File.txt",
        "win32",
      ),
    ).toBe("\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy1\\File.txt");
  });

  it("normalizes Windows POSIX drive aliases", () => {
    expect(createReadFileStatePathKey("/c/Repo/File.txt", "win32")).toBe(
      createReadFileStatePathKey("C:\\Repo\\File.txt", "win32"),
    );
  });

  it("does not normalize cygdrive aliases in the read-state path", () => {
    expect(createReadFileStatePathKey("/cygdrive/c/Repo/File.txt", "win32")).not.toBe(
      createReadFileStatePathKey("C:\\Repo\\File.txt", "win32"),
    );
  });

  it("keeps cygdrive alias casing strict", () => {
    expect(createReadFileStatePathKey("/Cygdrive/c/Repo/File.txt", "win32")).not.toBe(
      createReadFileStatePathKey("C:\\Repo\\File.txt", "win32"),
    );
  });

  it("does not case-fold Windows path segments without a canonical filesystem identity", () => {
    expect(createReadFileStatePathKey("C:\\Repo\\File.txt", "win32")).not.toBe(
      createReadFileStatePathKey("C:\\repo\\File.txt", "win32"),
    );
  });

  it("does not case-fold non-Windows paths", () => {
    expect(createReadFileStatePathKey("/tmp/ZCode/File.txt", "linux")).not.toBe(
      createReadFileStatePathKey("/tmp/zcode/file.txt", "linux"),
    );
  });

  it("Unicode-normalizes paths on all platforms", () => {
    expect(createReadFileStatePathKey("/tmp/é.txt", "linux")).toBe(
      createReadFileStatePathKey("/tmp/é.txt", "linux"),
    );
  });
});
```

- [ ] **Passo 2: executar o novo teste unitário e confirmar que ele falha primeiro**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/read-file-state.test.ts
```

Esperado: falha, porque `../src/tool/read-file-state.js` ainda não existe.

---

### Tarefa 2: implementar o helper compartilhado de read-state key

**Arquivos:**
- Novo: `apps/zcode-cli/packages/core/src/tool/read-file-state.ts`

- [ ] **Passo 1: criar o módulo de helper compartilhado**

Crie `apps/zcode-cli/packages/core/src/tool/read-file-state.ts`:

```ts
// ============================================================
// Read File State Helpers
// ============================================================

import { normalize, win32 } from "node:path";
import { platform as currentPlatform } from "node:process";
import type { ReadFileStateEntry, ReadFileStateMap } from "./types.js";

type ReadFileStatePlatform = NodeJS.Platform;

export function createReadFileStatePathKey(
  filePath: string,
  platform: ReadFileStatePlatform = currentPlatform,
): string {
  return normalizeReadStatePath(filePath, platform).normalize("NFC");
}

export function createReadFileStateKey(
  filePath: string,
  offset: number | undefined,
  limit: number | undefined,
  platform: ReadFileStatePlatform = currentPlatform,
): string {
  return [
    createReadFileStatePathKey(filePath, platform),
    String(offset ?? 1),
    limit === undefined ? "" : String(limit),
  ].join("\0");
}

export function findStrictFullReadFileState(
  readFileState: ReadFileStateMap | undefined,
  filePath: string,
  platform: ReadFileStatePlatform = currentPlatform,
): ReadFileStateEntry | undefined {
  if (!readFileState) return undefined;

  const direct = readFileState.get(createReadFileStateKey(filePath, 1, undefined, platform));
  if (direct && isStrictFullReadState(direct)) return direct;

  return findReadFileStateByPath(readFileState, filePath, platform, (entry) =>
    isStrictFullReadState(entry),
  );
}

export function findEditableReadFileState(
  readFileState: ReadFileStateMap | undefined,
  filePath: string,
  platform: ReadFileStatePlatform = currentPlatform,
): ReadFileStateEntry | undefined {
  if (!readFileState) return undefined;

  const direct = readFileState.get(createReadFileStateKey(filePath, 1, undefined, platform));
  if (direct && !direct.isPartialView) return direct;

  let partialRead: ReadFileStateEntry | undefined;
  const pathKey = createReadFileStatePathKey(filePath, platform);
  for (const entry of readFileState.values()) {
    if (createReadFileStatePathKey(entry.path, platform) !== pathKey) continue;
    if (entry.isPartialView) {
      partialRead ??= entry;
      continue;
    }
    return entry;
  }
  // Bugfix：允许未变更文件的 partial Read 作为 Edit 的上下文依据；
  // 仍交给 stale guard 校验 revision/mtime，避免文件变化后绕过 read-before-edit 保护。
  return partialRead;
}

function findReadFileStateByPath(
  readFileState: ReadFileStateMap,
  filePath: string,
  platform: ReadFileStatePlatform,
  accepts: (entry: ReadFileStateEntry) => boolean,
): ReadFileStateEntry | undefined {
  const pathKey = createReadFileStatePathKey(filePath, platform);
  for (const entry of readFileState.values()) {
    if (createReadFileStatePathKey(entry.path, platform) !== pathKey) continue;
    if (!accepts(entry)) continue;
    return entry;
  }
  return undefined;
}

function isStrictFullReadState(entry: ReadFileStateEntry): boolean {
  if (entry.isPartialView) return false;
  if ((entry.offset ?? 1) > 1) return false;
  return entry.limit === undefined;
}

function normalizeReadStatePath(filePath: string, platform: ReadFileStatePlatform): string {
  if (platform !== "win32") return normalize(filePath);
  const driveAliasNormalized = normalizeWindowsDriveAlias(filePath);
  const prefixStripped = stripWindowsExtendedPathPrefix(win32.normalize(driveAliasNormalized));
  return canonicalizeWindowsDriveLetter(prefixStripped);
}

function normalizeWindowsDriveAlias(filePath: string): string {
  // read-state 路径入口只把 /c/... 这种 Git Bash 盘符别名交给转换器。
  const driveAliasMatch = filePath.match(/^\/([A-Za-z])\//);
  if (!driveAliasMatch) return filePath;

  const drive = driveAliasMatch[1]!.toUpperCase();
  const rest = filePath.slice(2);
  return `${drive}:${rest}`.replaceAll("/", "\\");
}

function canonicalizeWindowsDriveLetter(filePath: string): string {
  return filePath.replace(/^([a-zA-Z]):/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

function stripWindowsExtendedPathPrefix(filePath: string): string {
  // 只剥离 extended UNC 和 drive path，保留 Volume/GLOBALROOT 等设备命名空间。
  if (filePath.startsWith("\\\\?\\UNC\\")) return `\\\\${filePath.slice("\\\\?\\UNC\\".length)}`;
  if (filePath.startsWith("\\\\?\\") && filePath.length >= 7 && filePath[5] === ":") {
    return filePath.slice("\\\\?\\".length);
  }
  return filePath;
}
```

- [ ] **Passo 2: executar o teste unitário de path-key**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/read-file-state.test.ts
```

Esperado: passa.

---

### Tarefa 3: fazer Read usar a key compartilhada

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/read.ts`

- [ ] **Passo 1: importar o helper de key compartilhado**

Perto dos imports locais, acrescente:

```ts
import { createReadFileStateKey } from "../read-file-state.js";
```

- [ ] **Passo 2: substituir o uso local de cache-key**

Troque:

```ts
const cacheKey = createReadCacheKey(filePath, cacheOffset, limit);
```

por:

```ts
const cacheKey = createReadFileStateKey(filePath, cacheOffset, limit);
```

- [ ] **Passo 3: remover a função local de key**

Remova:

```ts
function createReadCacheKey(filePath: string, offset: number, limit: number | undefined): string {
  return [filePath, String(offset), limit === undefined ? "" : String(limit)].join("\0");
}
```

- [ ] **Passo 4: executar os testes vizinhos de Read**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/read-file-state.test.ts tests/file-tool-port.test.ts
```

Esperado: passa.

---

### Tarefa 4: adicionar cobertura de regressão para Write

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/tests/write-tool-contract.test.ts`

- [ ] **Passo 1: importar o helper de key compartilhado**

Acrescente:

```ts
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
```

- [ ] **Passo 2: adicionar o teste de regressão do read-state key normalizado**

Dentro do `describe("Write model-result harness", () => { ... })`, acrescente:

```ts
it("accepts a normalized read-state key when the stored display path differs", async () => {
  const file = join(tmpDir, "existing-normalized-key.txt");
  const fs = createMemoryFileSystem({
    [file]: "old line\n",
  });
  const revision = revisionFor(file, "old line\n");
  const readFileState: ReadFileStateMap = new Map([
    [
      createReadFileStateKey(file, 1, undefined),
      {
        path: `${tmpDir}/nested/../existing-normalized-key.txt`,
        content: "old line\n",
        offset: 1,
        limit: undefined,
        isPartialView: false,
        readAt: new Date(),
        revisionId: revision.id,
        mtimeMs: revision.mtimeMs,
        sizeBytes: revision.sizeBytes,
      },
    ],
  ]);
  const context = contextWith(fs, { readFileState });

  const result = await writeForModel(
    {
      file_path: file,
      content: "new line\n",
    },
    context,
  );

  expect(result.output).toMatchObject({
    type: "update",
    filePath: file,
    content: "new line\n",
  });
  expect(fs.files.get(file)).toBe("new line\n");
});
```

- [ ] **Passo 3: executar o teste de Write e confirmar que falha antes da implementação**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/write-tool-contract.test.ts -t "normalized read-state key"
```

Esperado antes da implementação da Tarefa 5: falha, com o erro `File has not been read yet. Read it first before writing to it.`

---

### Tarefa 5: fazer Write usar o lookup compartilhado

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`

- [ ] **Passo 1: importar o helper compartilhado**

Acrescente:

```ts
import {
  createReadFileStateKey,
  findStrictFullReadFileState,
} from "../read-file-state.js";
```

- [ ] **Passo 2: substituir o lookup local**

Troque:

```ts
const lastRead = findFullReadState(readFileState, filePath);
```

por:

```ts
const lastRead = findStrictFullReadFileState(readFileState, filePath);
```

- [ ] **Passo 3: remover o helper de varredura local**

Remova a função local `findFullReadState(...)` inteira:

```ts
function findFullReadState(
  readFileState: ReadFileStateMap | undefined,
  filePath: string,
): ReadFileStateEntry | undefined {
  if (!readFileState) return undefined;
  for (const entry of readFileState.values()) {
    if (entry.path !== filePath) continue;
    if (entry.isPartialView) continue;
    if ((entry.offset ?? 1) > 1) continue;
    if (entry.limit !== undefined) continue;
    return entry;
  }
  return undefined;
}
```

- [ ] **Passo 4: substituir o read-state key após a escrita**

Troque:

```ts
readFileState.set(createFullReadCacheKey(filePath), {
```

por:

```ts
readFileState.set(createReadFileStateKey(filePath, 1, undefined), {
```

- [ ] **Passo 5: remover a função local de full-read key**

Remova:

```ts
function createFullReadCacheKey(filePath: string): string {
  return [filePath, "1", ""].join("\0");
}
```

- [ ] **Passo 6: remover o import de tipo não utilizado, se necessário**

Se o TypeScript reclamar que `ReadFileStateEntry` está sem uso, troque:

```ts
import type { ReadFileStateEntry, ReadFileStateMap, ToolExecutionContext } from "../types.js";
```

por:

```ts
import type { ReadFileStateMap, ToolExecutionContext } from "../types.js";
```

- [ ] **Passo 7: executar a validação de Write**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/write-tool-contract.test.ts tests/read-file-state.test.ts
```

Esperado: passa.

---

### Tarefa 6: adicionar cobertura de regressão para Edit

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/tests/edit-tool-contract.test.ts`

- [ ] **Passo 1: importar o helper de key compartilhado**

Acrescente:

```ts
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
```

- [ ] **Passo 2: adicionar o teste de regressão do read-state key normalizado**

Dentro do bloco `describe` dos testes de contrato de Edit, acrescente:

```ts
it("accepts a normalized read-state key when the stored display path differs", async () => {
  const file = join(tmpDir, "existing-normalized-key.txt");
  const fs = createMemoryFileSystem({
    [file]: "original\n",
  });
  const revision = revisionFor(file, "original\n");
  const readFileState: ReadFileStateMap = new Map([
    [
      createReadFileStateKey(file, 1, undefined),
      {
        path: `${tmpDir}/nested/../existing-normalized-key.txt`,
        content: "original\n",
        offset: 1,
        limit: undefined,
        isPartialView: false,
        readAt: new Date(),
        revisionId: revision.id,
        mtimeMs: revision.mtimeMs,
        sizeBytes: revision.sizeBytes,
      },
    ],
  ]);
  const context = contextWith(fs, { readFileState });

  const output = await editHandler(
    {
      file_path: file,
      old_string: "original",
      new_string: "modified-by-edit",
    },
    context,
  );

  expect(output).toMatchObject({
    filePath: file,
    oldString: "original",
    newString: "modified-by-edit",
    originalFile: "original\n",
  });
  expect(fs.files.get(file)).toBe("modified-by-edit\n");
});
```

- [ ] **Passo 3: executar o teste de Edit e confirmar que falha antes da implementação**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/edit-tool-contract.test.ts -t "normalized read-state key"
```

Esperado antes da implementação da Tarefa 7: falha, com o erro `File has not been read yet. Read it first before writing to it.`

---

### Tarefa 7: fazer Edit usar o lookup compartilhado

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`

- [ ] **Passo 1: importar o helper compartilhado**

Acrescente:

```ts
import {
  createReadFileStateKey,
  findEditableReadFileState,
} from "../read-file-state.js";
```

- [ ] **Passo 2: substituir a chamada de lookup local**

Troque:

```ts
const lastRead = findEditableReadState(readFileState, filePath);
```

mantendo a chamada com o mesmo nome, mas fazendo-a vir do módulo compartilhado. Para evitar conflito de nomes, remova primeiro a função local conforme o Passo 3 e só então execute o TypeScript.

- [ ] **Passo 3: remover o helper de lookup local**

Remova a função local `findEditableReadState(...)`:

```ts
function findEditableReadState(
  readFileState: ReadFileStateMap,
  filePath: string,
): ReadFileStateEntry | undefined {
  let partialRead: ReadFileStateEntry | undefined;
  for (const entry of readFileState.values()) {
    if (entry.path !== filePath) continue;
    if (entry.isPartialView) {
      partialRead ??= entry;
      continue;
    }
    return entry;
  }
  // Bugfix：允许未变更文件的 partial Read 作为 Edit 的上下文依据；
  // 仍交给 stale guard 校验 revision/mtime，避免文件变化后绕过 read-before-edit 保护。
  return partialRead;
}
```

- [ ] **Passo 4: substituir o read-state key após a escrita de edição**

Troque:

```ts
readFileState.set(createFullReadCacheKey(filePath), {
```

por:

```ts
readFileState.set(createReadFileStateKey(filePath, 1, undefined), {
```

- [ ] **Passo 5: remover a função local de full-read key**

Remova:

```ts
function createFullReadCacheKey(filePath: string): string {
  return [filePath, "1", ""].join("\0");
}
```

- [ ] **Passo 6: preservar o comentário de bugfix em chinês**

Mova o comentário existente sobre a base de partial-read para o `findEditableReadFileState(...)` em `read-file-state.ts`:

```ts
// Bugfix：允许未变更文件的 partial Read 作为 Edit 的上下文依据；
// 仍交给 stale guard 校验 revision/mtime，避免文件变化后绕过 read-before-edit 保护。
return partialRead;
```

- [ ] **Passo 7: remover o import de tipo não utilizado, se necessário**

Se o TypeScript reclamar que `ReadFileStateEntry` está sem uso, remova-o do import de tipos do handler de Edit.

- [ ] **Passo 8: executar a validação de Edit**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run tests/edit-tool-contract.test.ts tests/read-file-state.test.ts
```

Esperado: passa.

---

### Tarefa 8: calibrar os testes de direct-handler do file-tool-port

**Arquivos:**
- Modificado: `apps/zcode-cli/packages/core/tests/file-tool-port.test.ts`

- [ ] **Passo 1: dar read-state explícito ao caso de Write com arquivo existente do direct-handler**

Nas options de `contextWith(...)`, acrescente:

```ts
readFileState?: ReadFileStateMap;
```

- [ ] **Passo 2: adicionar o helper local de read-state do file-tool-port**

No arquivo de teste, acrescente:

```ts
function createReadFileState(filePath: string, content: string): ReadFileStateMap {
  const revision = revisionFor(filePath, content);
  return new Map([
    [
      createReadFileStateKey(filePath, 1, undefined),
      {
        path: filePath,
        content: normalizeTestLineEndings(content),
        offset: 1,
        limit: undefined,
        isPartialView: false,
        readAt: new Date(),
        revisionId: revision.id,
        sizeBytes: revision.sizeBytes,
      },
    ],
  ]);
}
```

- [ ] **Passo 3: mudar o caso de Write com arquivo existente do direct-handler para fornecer read-state explicitamente**

O contrato existente de Write exige que já haja Read state antes de um Write em arquivo existente; esses casos de direct-handler não devem burlar o contrato.

- [ ] **Passo 4: mudar a expectativa de saída de caminho relativo do Write para o input path original**

O result provider-visible de Write/Edit continua preservando o path original do input da ferramenta; não espere um caminho absoluto resolvido.

---

### Tarefa 9: validação final

**Arquivos:**
- Validar apenas o pacote core modificado.

- [ ] **Passo 1: executar os testes focados de ferramentas de arquivo**

Executar:

```bash
pnpm --filter @zcode/core exec vitest run \
  tests/read-file-state.test.ts \
  tests/write-tool-contract.test.ts \
  tests/edit-tool-contract.test.ts \
  tests/file-tool-port.test.ts
```

Esperado: passa.

- [ ] **Passo 2: executar o typecheck do core**

Executar:

```bash
pnpm --filter @zcode/core typecheck
```

Esperado: passa.

- [ ] **Passo 3: executar o lint do core**

Executar:

```bash
pnpm --filter @zcode/core lint
```

Esperado: passa.

- [ ] **Passo 4: conferir que o comportamento visível ao provider não foi alterado**

Executar:

```bash
git diff -- apps/zcode-cli/packages/core/src/tool/handlers/read.ts \
  apps/zcode-cli/packages/core/src/tool/handlers/write.ts \
  apps/zcode-cli/packages/core/src/tool/handlers/edit.ts \
  apps/zcode-cli/packages/core/src/tool/read-file-state.ts
```

Confirme:

- Os textos de sucesso/falha não mudaram.
- O `output.filePath` nos resultados de Write/Edit continua usando o path original do input da ferramenta.
- Os metadata de permissão e a descrição da ferramenta não mudaram.
- `resolveWorkspacePath(...)` não mudou.
- O Windows normaliza apenas internamente, na read-state key, separadores, o POSIX drive alias `/c/...` do Git Bash, prefixos estendidos de drive/UNC e a letra de drive; não faz dobra de caixa do caminho inteiro e não mescla adicionalmente `/cygdrive/...` nem caminhos de device namespace.

---

## Autoavaliação

- Escopo: o plano corrige o problema já reproduzido no Windows em que `Write repro.txt` após `Read c:/...` é acusado incorretamente como não lido, e cobre também o Edit, porque o Edit usa a mesma classe de guard de read-before-write.
- Estrutura de key compartilhada: o plano faz Read/Write/Edit compartilharem a key normalizada, e a entrada de read-state reutiliza apenas a normalização do drive alias `/c/...` do Windows; `/cygdrive/...` não é mesclado adicionalmente nessa entrada. Para evitar mesclar arquivos diferentes em diretórios Windows sensíveis a caixa, o plano canonicaliza apenas a letra de drive e não aplica `toLowerCase()` ao caminho inteiro.
- Limite de risco: não altera a estrutura de saída visível ao provider, nem o comportamento de permissão, nem a resolução global de caminhos, nem a semântica do adapter de sistema de arquivos, nem a descrição das ferramentas.
- Cobertura de testes: testes unitários cobrem o comportamento de key dependente de plataforma; testes de contrato cobrem a regressão de Write/Edit; testes de forma integrada cobrem o caminho real de reprodução absolute-to-relative.

O plano foi salvo em `docs/superpowers/plans/2026-06-15-read-file-state-windows-path-key.md`.

Opções de execução:

1. **Subagent-Driven (recomendado)**: despachar um subagent novo para cada tarefa, com review entre as tarefas e iteração mais rápida.
2. **Execução inline**: usar `executing-plans` na session atual, por lotes, parando para review nos pontos críticos.