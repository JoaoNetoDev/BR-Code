# Plano de Implementação de Read File State no Bash

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa a tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer o runtime do Bash manter `readFileState`, corrigindo a lacuna em que, depois de `Bash cat file`, o `Edit` ainda reporta `File has not been read yet`, e completando o stale hint para quando o Bash modifica um arquivo já lido.

**Arquitetura:** Desta vez adicionamos apenas um read-state producer conservador na camada de runtime da ferramenta Bash em agent/core, sem alterar prompt, lista de ferramentas visíveis ao provider, protocol, desktop, UI nem remote control. `bashHandler`, antes de retornar o Bash em foreground, gera primeiro o stale hint com base no read state antigo e depois preenche o read state do Bash conforme a semântica conservadora de comandos de leitura.

**Stack técnico:** TypeScript, Vitest, `unbash`, `FileSystemPort` / `ExecutionResult` / `BashOutput` de `@zcode/contracts`, e o `ReadFileStateMap` existente.

## Restrições Globais

- Este plano adiciona apenas um read-state producer na camada de runtime do Bash e não depende de o prompt exigir que o modelo faça Read antes.
- Este plano não modifica o prompt (incluindo o trecho `# Using your tools`).
- Capabilities relacionadas a seed são adiadas; `seed_read_state` não é implementado.
- NotebookEdit é adiado; nenhum estado de ferramenta do tipo Notebook é adicionado.
- `packages/ui` não é modificado, portanto não é necessário ler `DESIGN.md`.
- Nenhum campo de protocolo novo; `staleReadFileStateHint` já existe no contract `BashOutput`.
- O metadata de read-state gerado pelo Bash não é persistido no session store; a primeira versão mantém apenas `context.readFileState` dentro do turn/runtime.
- Nenhum commit automático; se o executor for explicitamente instruído a commitar, usa Conventional Commits.
- Após concluir as alterações de código é obrigatório rodar `pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts`, `pnpm --filter @zcode/core typecheck` e `pnpm --filter @zcode/core lint`, e ao final rodar `pnpm typecheck` e `pnpm lint` conforme as restrições do repositório.

---

## Fase 0: Escopo e Especificação

**Propósito:** Deixar primeiro o contrato de comportamento nos docs, antes de escrever código, conforme a restrição NL -> Code do repositório.

**Arquivos:**
- Create: `docs/runtime-tools/bash-read-file-state.md`

**Checklist:**

- [ ] Criar `docs/runtime-tools/bash-read-file-state.md`.
- [ ] Escrever no documento a conclusão: o ponto de mudança desta rodada é o read-state producer do runtime do Bash, e não o texto do prompt.
- [ ] Escrever o que está in scope:
  - `Bash cat/head/tail/sed -n/grep` com sucesso e sem truncamento do stdout do Bash preenche `readFileState` de forma conservadora.
  - Comandos Bash de escrita que modificam arquivos já lidos geram `staleReadFileStateHint`.
- [ ] Escrever o que está out of scope:
  - `seed_read_state`.
  - NotebookEdit.
  - O prompt `# Using your tools`.
  - Persistência do metadata de read-state.
- [ ] Escrever a ordem de execução:
  - O comando Bash em foreground termina.
  - O `BashOutput` é construído.
  - O stale hint é calculado primeiro, porque ele precisa ser baseado no read-state que já existia antes da execução do comando.
  - Depois é feito o backfill do read-state do Bash.
  - O `BashOutput` final é retornado.

**Corpo de doc sugerido:**

```markdown
# Contrato de Runtime de Read File State do Bash

## Contexto

O ZCode não depende de textos de prompt como `# Using your tools` para exigir que o modelo faça Read antes; em vez disso, mantém um read-state producer dentro do runtime do Bash: comandos Bash de leitura simples, identificados de forma conservadora, gravam o conteúdo do arquivo no readFileState, de modo que o guard de read-before-write de Edit/Write considere que o arquivo já foi lido.

## Escopo desta rodada

- Suportar o backfill de read-state conservador para `cat`, `head`, `tail`, `sed -n` e `grep`/`egrep`/`fgrep` do Bash; quando o stdout do Bash ou o resultado de leitura de arquivo do FileSystemPort for truncado, não há backfill.
- Suportar o `staleReadFileStateHint` para comandos Bash de escrita que modificam arquivos já lidos.

## Fora de escopo

- Não implementar seed read state.
- Não implementar NotebookEdit.
- Não modificar o prompt nem a lista de ferramentas visíveis ao provider.
- Não persistir o metadata de read-state gerado pelo Bash.

## Ordem de runtime

1. O comando Bash em foreground termina a execução.
2. O runtime constrói primeiro o `BashOutput` normal.
3. Se o comando for um comando de escrita, o runtime varre o readFileState existente antes da execução e, ao detectar que algum mtime avançou depois do início do Bash, acrescenta o stale hint; o texto do hint exibe os 5 primeiros caminhos relativos ao cwd, acrescentando `and N more` quando houver mais, e usa `file`/`files` no singular ou plural.
4. Se o comando for um comando de leitura do Bash identificado de forma conservadora e o stdout do Bash não estiver truncado, o runtime relê o arquivo real pelo FileSystemPort e o grava no readFileState; se o resultado de leitura de arquivo do FileSystemPort estiver truncado, o backfill também é pulado, evitando mascarar como lido um arquivo completo que o modelo não viu.
5. background, image output e interrupted não produzem stale hint nem fazem backfill de read-state.
6. Um provider-error que não seja falha semântica não produz stale hint nem faz backfill de read-state; `grep`/`egrep`/`fgrep` só fazem backfill quando o exit code é 0.
```

**Validação:**

```bash
git diff -- docs/runtime-tools/bash-read-file-state.md
```

Esperado: apenas o novo documento de spec acima, sem alterações de código de runtime.

---

## Fase 1: Testes que Falham

**Propósito:** Travar primeiro com testes unitários a lacuna real e suas bordas, evitando corrigir apenas o ponto do `cat`.

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`

**Alterações nos test helpers:**

- [ ] Importar `FileSystemPort`, `FileSystemReadTextResult` e `FileSystemStatResult` de `@zcode/contracts`.
- [ ] Importar `createReadFileStateKey` de `../src/tool/read-file-state.js`.
- [ ] Importar o tipo `ReadFileStateMap` de `../src/tool/types.js`.
- [ ] Estender as options de `contextWith`:

```ts
fileSystemPort?: FileSystemPort;
readFileState?: ReadFileStateMap;
```

- [ ] Encaminhar no `ToolExecutionContext` retornado:

```ts
fileSystemPort: options.fileSystemPort,
readFileState: options.readFileState,
```

- [ ] Estender as options de `executionResult`, permitindo ao teste definir o horário de início:

```ts
startedAt?: Date;
completedAt?: Date;
```

- [ ] Trocar o tempo dentro de `executionResult` por:

```ts
const now = new Date();
const startedAt = options.startedAt ?? now;
const completedAt = options.completedAt ?? startedAt;
```

e retornar:

```ts
startedAt,
completedAt,
```

**Adicionar helper no arquivo de teste:**

```ts
function memoryFileSystemPort(
  files: Record<
    string,
    {
      content: string;
      mtimeMs?: number;
      revisionId?: string;
    }
  >,
): FileSystemPort {
  return {
    async stat(request) {
      const file = files[request.path];
      if (!file) {
        throw new Error(`missing fixture file: ${request.path}`);
      }
      return {
        path: request.path,
        kind: "file",
        sizeBytes: Buffer.byteLength(file.content),
        mtimeMs: file.mtimeMs,
        revision: {
          id: file.revisionId ?? `${request.path}:${file.mtimeMs ?? 0}`,
          mtimeMs: file.mtimeMs,
          sizeBytes: Buffer.byteLength(file.content),
        },
      } satisfies FileSystemStatResult;
    },
    async readTextFile(request) {
      const file = files[request.path];
      if (!file) {
        throw new Error(`missing fixture file: ${request.path}`);
      }
      return {
        path: request.path,
        content: file.content,
        encoding: "utf8",
        bytesRead: Buffer.byteLength(file.content),
        sizeBytes: Buffer.byteLength(file.content),
        truncated: false,
        revision: {
          id: file.revisionId ?? `${request.path}:${file.mtimeMs ?? 0}`,
          mtimeMs: file.mtimeMs,
          sizeBytes: Buffer.byteLength(file.content),
        },
      } satisfies FileSystemReadTextResult;
    },
  } as FileSystemPort;
}
```

**Casos de teste a adicionar dentro de `describe("bashHandler", ...)`:**

- [ ] `it("backfills readFileState from successful cat before Edit", async () => { ... })`
  - Setup:
    - `filePath = resolve(defaultCommandRoot, ".env.example")`
    - `readFileState = new Map()`
    - `fileSystemPort = memoryFileSystemPort({ [filePath]: { content: "FOO=bar\n", mtimeMs: 1000 } })`
    - `executionPort.run` retorna `status: "completed"`, `exitCode: 0`, `stdout: "FOO=bar\n"`
  - Executa `bashHandler({ command: "cat .env.example" }, contextWith(...))`
  - Asserções:
    - `readFileState.get(createReadFileStateKey(filePath, 1, undefined))?.content === "FOO=bar\n"`
    - `offset === undefined`
    - `limit === undefined`
    - `isPartialView === false`
    - `mtimeMs === 1000`

- [ ] `it("backfills ranged readFileState for head tail and sed print commands", async () => { ... })`
  - Usa o conteúdo `"a\nb\nc\nd\ne\n"`.
  - Executa casos separados:
    - `head -n 2 fixture.txt` -> content `"a\nb"`, offset `1`, limit `2`
    - `tail -n 2 fixture.txt` -> content `"d\ne"`, offset `4`, limit `2`
    - `sed -n '2,3p' fixture.txt` -> content `"b\nc"`, offset `2`, limit `2`
  - Cada caso usa um `readFileState` novo.

- [ ] `it("backfills full readFileState for grep only when grep exits zero", async () => { ... })`
  - Exit code `0` para `grep needle fixture.txt` grava o conteúdo completo do arquivo, com offset/limit indefinidos.
  - Exit code `1` para `grep missing fixture.txt` não grava read-state.

- [ ] `it("does not backfill readFileState for complex or unsafe Bash read commands", async () => { ... })`
  - Asserta ausência de read-state para:
    - `cat fixture.txt | head`
    - `cat fixture.txt > out.txt`
    - `cat "$TARGET"`
    - `cat fixture.txt other.txt`
    - `sed -i 's/a/b/' fixture.txt`
    - `head -n 0 fixture.txt`

- [ ] `it("emits stale read hint when a write-like Bash command modifies a previously read file", async () => { ... })`
  - Pré-popula o read state:

```ts
readFileState.set(createReadFileStateKey(filePath, 1, undefined), {
  path: filePath,
  content: "old\n",
  isPartialView: false,
  readAt: new Date(500),
  sourceTool: "Read",
  mtimeMs: 1000,
  sizeBytes: 4,
});
```

  - `executionResult.startedAt = new Date(1500)`
  - `fileSystemPort.stat` retorna `mtimeMs = 2000`
  - comando: `pnpm format`
  - Asserta que a saída contém:

```text
[This command modified 1 file you've previously read: fixture.ts. Call Read before editing.]
```

  - Asserta que `bashToolEntry.formatModelContent?.(output)` também contém o texto do hint.

- [ ] `it("does not emit stale hint when write-like Bash exits with provider error", async () => { ... })`
  - Cobre o caminho de provider-error com `status: "failed"`, `exitCode: 2`, `command: "pnpm format"` e um mtime mais novo.
  - Asserta que o stale hint não é acrescentado.

- [ ] Teste do formato de caminho do stale hint quando vários arquivos já lidos mudam
  - Cobre 6 arquivos lidos alterados.
  - Asserta que a saída usa caminhos relativos ao cwd, `files`, os 5 primeiros caminhos e `and 1 more`.

**Rodar os testes que falham:**

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado antes da implementação: os novos testes de read-state/stale producer falham porque o handler do Bash hoje nunca escreve `readFileState` nem preenche `staleReadFileStateHint`.

---

## Fase 2: Helper de Read-State do Bash

**Propósito:** Adicionar um pequeno helper de runtime, centralizado, que carregue a identificação conservadora de comandos, a leitura de arquivos, a escrita de read-state e a geração do stale hint.

**Arquivos:**
- Create: `apps/zcode-cli/packages/core/src/tool/handlers/bash-read-file-state.ts`

**Imports:**

```ts
import type { BashOutput, ExecutionResult, FileSystemPort, FileSystemStatResult, TraceContext } from "@zcode/contracts";
import { resolveWorkspacePath } from "../path-policy.js";
import {
  createReadFileStateKey,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../read-file-state.js";
import type { ReadFileStateEntry, ToolExecutionContext } from "../types.js";
import { analyzeBashCommand, isBashCommandPermissionSafe, type BashCommandInvocation } from "./bash-command-parser.js";
import { isBashProviderErrorStatus } from "./bash-semantics.js";
```

**Interfaces públicas:**

```ts
interface BashReadFileSource {
  filePath: string;
  startLine?: number;
  endLine?: number;
  tailLines?: number;
  requiresExitZero?: boolean;
}

export async function applyBashReadFileStateEffects(input: {
  command: string;
  context: ToolExecutionContext;
  output: BashOutput;
  result: ExecutionResult;
}): Promise<void>;
```

**Contrato de execução principal:**

```ts
export async function applyBashReadFileStateEffects(input: {
  command: string;
  context: ToolExecutionContext;
  output: BashOutput;
  result: ExecutionResult;
}): Promise<void> {
  const hint = await createStaleReadFileStateHint(input);
  if (hint) input.output.staleReadFileStateHint = hint;
  await backfillReadFileStateFromBash(input);
}
```

**Guard compartilhado:**

- [ ] Implementar `shouldSkipBashReadFileStateEffects(output: BashOutput): boolean`:
  - pula quando `output.backgroundTaskId` existe
  - pula quando `output.isImage === true`
  - pula quando `output.interrupted === true`
  - pula a saída de provider-error; falhas de shell não semânticas não produzem nem stale hint nem backfill de read-state

**Parser de comandos de leitura:**

- [ ] Implementar `collectBashReadFileSources(command: string): BashReadFileSource[]`.
- [ ] Primeiro rejeita o comando se o texto bruto contiver `|`, `<` ou `>`.
- [ ] Usa `analyzeBashCommand(command)`.
- [ ] Rejeita se `!isBashCommandPermissionSafe(analysis)`.
- [ ] Rejeita se `analysis.hasRedirects`.
- [ ] Para cada invocação de comando:
  - Tenta `parseSedPrintSource`.
  - Senão `parseCatSource`.
  - Senão `parseHeadSource`.
  - Senão `parseTailSource`.
  - Senão, apenas quando `analysis.commands.length === 1`, tenta `parseGrepSource`.
  - Senão, se houver múltiplos comandos e o texto do comando corresponder a `/^\s*(echo|printf|true|:)\b/`, ignora esse segmento.
  - Senão retorna `[]`.

**Regras específicas por comando:**

- [ ] `cat`
  - o nome do comando deve ser `cat`
  - flags aceitas: `-n`, `--number`
  - exatamente um caminho de arquivo sem flag
  - rejeita o caminho de arquivo `-`
  - retorna a source completa: sem offset/limit

- [ ] `head`
  - o nome do comando deve ser `head`
  - contagem padrão `10`
  - formas de contagem aceitas:
    - `-n N`
    - `--lines N`
    - `--lines=N`
    - `-nN`
    - `-N`
  - a contagem deve ser um inteiro positivo
  - exatamente um caminho de arquivo, diferente de `-`
  - retorna `{ startLine: 1, endLine: count }`

- [ ] `tail`
  - o nome do comando deve ser `tail`
  - mesmo parser de contagem do `head`
  - retorna `{ tailLines: count }`

- [ ] `sed`
  - o nome do comando deve ser `sed`
  - precisa incluir o modo silencioso: `-n`, qualquer flag curta contendo `n`, `--quiet` ou `--silent`
  - rejeita `-i`, qualquer flag curta contendo `i`, `--in-place`, `--in-place=*`, `-e`, `--expression`
  - expressões de print aceitas:
    - `/^(\d+)p$/`
    - `/^(\d+),(\d+)p$/`
  - exatamente uma expressão e um caminho de arquivo
  - retorna as linhas inicial e final correspondentes

- [ ] `grep` / `egrep` / `fgrep`
  - o nome do comando deve ser um entre `grep`, `egrep`, `fgrep`
  - só é aceito quando o comando Bash completo tem exatamente uma invocação de comando
  - exatamente um argumento de padrão e um caminho de arquivo
  - rejeita o caminho de arquivo `-`
  - rejeita o caminho de arquivo contendo caracteres glob casaados por `/[*?[{]/`
  - flags aceitas:
    - flags curtas combinadas casaadas por `/^-[niwxEFGPHh]+$/`
    - flags curtas de contexto casaadas por `/^-[ABC]\d+$/`
    - flags longas de contexto casaadas por `/^--(?:after-context|before-context|context)=\d+$/`
    - `-A N`, `-B N`, `-C N` onde `N` são dígitos
    - `--line-number`
    - `--ignore-case`
    - `--word-regexp`
    - `--line-regexp`
    - `--extended-regexp`
    - `--fixed-strings`
    - `--basic-regexp`
    - `--perl-regexp`
    - `--with-filename`
    - `--no-filename`
    - `--color=never`
    - `--color=auto`
  - retorna a source completa com `requiresExitZero: true`

**Algoritmo de backfill:**

- [ ] Implementar `backfillReadFileStateFromBash`.
- [ ] Retorna cedo se `shouldSkipBashReadFileStateEffects(output)`.
- [ ] Retorna cedo se `!context.fileSystemPort || !context.readFileState`.
- [ ] Coleta as sources e filtra `source.requiresExitZero ? result.exitCode === 0 : true`.
- [ ] Resolve cada arquivo de source com:

```ts
const resolvedPath = resolveWorkspacePath({
  inputPath: source.filePath,
  operation: "read",
  workingDirectory: context.workingDirectory,
  workspaceRoot: context.workspaceRoot,
});
```

- [ ] Pula se `findLatestReadFileState(context.readFileState, resolvedPath)` retornar uma entrada.
- [ ] Executa `stat` via `context.fileSystemPort.stat({ path: resolvedPath, trace }, { signal })`.
- [ ] Pula se `stat.kind !== "file"`.
- [ ] Pula se `stat.sizeBytes > 10 * 1024 * 1024`.
- [ ] Verifica de novo `context.abortSignal.aborted`; pula se estiver abortado.
- [ ] Executa `readTextFile` via `context.fileSystemPort.readTextFile({ path: resolvedPath, maxBytes: 10 * 1024 * 1024, trace }, { signal })`.
- [ ] Calcula o conteúdo selecionado:
  - source completa: todo o conteúdo
  - intervalo head/sed: divide em `\n`, `start = max(1, startLine)`, `end = max(start, endLine ?? start)`, pula quando `start > lineCount`
  - tail: divide em `\n`, remove a linha vazia final, pula quando não há linhas, `count = min(tailLines, lineCount)`, `offset = lineCount - count + 1`, `limit = count`
- [ ] Define o `readFileState`:

```ts
const entry: ReadFileStateEntry = {
  path: resolvedPath,
  content: selectedContent,
  offset,
  limit,
  isPartialView: false,
  readAt: new Date(),
  revisionId: read.revision?.id ?? stat.revision?.id,
  mtimeMs: normalizeReadFileStateMtimeMs(read.revision?.mtimeMs ?? stat.revision?.mtimeMs ?? stat.mtimeMs),
  sizeBytes: read.revision?.sizeBytes ?? stat.revision?.sizeBytes ?? stat.sizeBytes,
};
context.readFileState.set(createReadFileStateKey(resolvedPath, offset ?? 1, limit), entry);
```

- [ ] Não definir `sourceTool: "Bash"` nesta fase. O tipo existente só permite `"Read" | "Write" | "Edit"` e a projeção compacta trata o indefinido como estado compatível com leitura; ampliar a persistência está fora de escopo de propósito.
- [ ] Captura e ignora erros de stat/read por arquivo (best-effort).

**Algoritmo do stale hint:**

- [ ] Implementar `createStaleReadFileStateHint`.
- [ ] Retorna cedo se `shouldSkipBashReadFileStateEffects(output)`.
- [ ] Retorna cedo se `!context.fileSystemPort || !context.readFileState`.
- [ ] Retorna cedo a menos que o comando corresponda a:

```ts
const WRITE_COMMAND_MARKERS = new RegExp(
  [
    "--write",
    "--fix",
    "--in-place",
    "--auto-correct",
    "\\brun\\s+format\\b",
    "\\brun\\s+fix\\b",
    "\\b(yarn|pnpm)\\s+format\\b",
    "\\blint:file\\b",
    "\\blint:fix\\b",
    "\\bblack\\b",
    "\\bisort\\b",
    "\\bruff\\s+format\\b",
    "\\bcargo\\s+(fmt|fix)\\b",
    "\\brustfmt\\b",
    "\\bgo\\s+fmt\\b",
    "\\bterraform\\s+fmt\\b",
    "\\bdprint\\s+fmt\\b",
    "\\bswiftformat\\b",
    "\\bphpcbf\\b",
  ].join("|"),
);
```

- [ ] Para cada entrada de read-state:
  - executa `stat` de `entry.path`
  - calcula `currentMtime = normalizeReadFileStateMtimeMs(stat.revision?.mtimeMs ?? stat.mtimeMs)`
  - calcula `entryMtime = normalizeReadFileStateMtimeMs(entry.mtimeMs)`
  - inclui o caminho apenas quando `currentMtime > result.startedAt.getTime()` e `currentMtime > entryMtime`
- [ ] Retorna undefined se nenhum caminho mudou.
- [ ] Retorna exatamente o formato de string voltado ao provider:

```ts
`[This command modified ${paths.length} ${paths.length === 1 ? "file" : "files"} you've previously read: ${displayPaths}${hiddenSuffix}. Call Read before editing.]`
```

**Helper de trace:**

- [ ] Adicionar um `createBashReadFileStateTrace(context: ToolExecutionContext): TraceContext` local, espelhando o formato de trace existente de Bash/Read/Edit:

```ts
function createBashReadFileStateTrace(context: ToolExecutionContext): TraceContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  } as unknown as TraceContext;
}
```

**Rodar os testes focados:**

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado após apenas a Fase 2: os testes ainda falham até que a integração do handler importe e chame o helper.

---

## Fase 3: Integração no Handler

**Propósito:** Ligar o helper ao caminho de conclusão do Bash em foreground, mantendo o output formatter e os ramos de image/background sem contaminação.

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- Não modificar a menos que os testes revelem necessidade: `apps/zcode-cli/packages/core/src/tool/handlers/bash-output.ts`
- Não modificar: `apps/zcode-cli/packages/contracts/src/tools/bash.ts`
- Não modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-model-content.ts`

**Passos:**

- [ ] Importar o helper:

```ts
import { applyBashReadFileStateEffects } from "./bash-read-file-state.js";
```

- [ ] Substituir o return direto atual no final de `bashHandler`:

```ts
return toBashOutput(result, parsed, context, {
  progressTiming,
  stderrSuffix: cwdDecision.stderrSuffix,
});
```

por:

```ts
const output = await toBashOutput(result, parsed, context, {
  progressTiming,
  stderrSuffix: cwdDecision.stderrSuffix,
});
await applyBashReadFileStateEffects({
  command: parsed.command,
  context,
  output,
  result,
});
return output;
```

- [ ] Não chamar o helper no ramo `parsed.run_in_background`.
- [ ] Não chamar o helper para `emptyBashOutput`; o backfill está atrelado à execução real do Bash, e não a um comando vazio.
- [ ] Manter a geração do stale hint antes do backfill dentro do helper.

**Rodar os testes focados:**

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado: os novos testes de read-state do Bash e de stale hint passam.

---

## Fase 4: Endurecimento de Bordas

**Propósito:** Impedir que a implementação cubra apenas o happy path; travar as bordas conservadoras.

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- Modify se forem encontradas lacunas: `apps/zcode-cli/packages/core/src/tool/handlers/bash-read-file-state.ts`

**Checklist:**

- [ ] Adicionar ou verificar um teste de que `cat -n fixture.txt` faz backfill do conteúdo completo.
- [ ] Adicionar ou verificar um teste de que `cat --number fixture.txt` faz backfill do conteúdo completo.
- [ ] Adicionar ou verificar um teste de que `head --lines=2 fixture.txt` funciona.
- [ ] Adicionar ou verificar um teste de que `head -2 fixture.txt` funciona.
- [ ] Adicionar ou verificar um teste de que `tail --lines 2 fixture.txt` funciona.
- [ ] Adicionar ou verificar um teste de que `sed --quiet '3p' fixture.txt` funciona.
- [ ] Adicionar ou verificar um teste de que `sed --expression '3p' fixture.txt` não faz backfill.
- [ ] Adicionar ou verificar um teste de que `grep -n --color=never needle fixture.txt` só faz backfill com exit `0`.
- [ ] Adicionar ou verificar um teste de que `grep needle "*.txt"` não faz backfill.
- [ ] Adicionar ou verificar um teste de que um arquivo com mais de 10MB não faz backfill.
- [ ] Adicionar ou verificar um teste de que o read state existente do mesmo caminho não é sobrescrito.
- [ ] Adicionar ou verificar um teste de que o stale hint ignora arquivos cujo mtime atual é mais novo que o read-state mas não mais novo que o `startedAt` do Bash.
- [ ] Adicionar ou verificar um teste de que o stale hint ignora arquivos cujo mtime não pode ser obtido por stat.
- [ ] Adicionar ou verificar um teste de que o truncamento do stdout do Bash pula o backfill de read-state.

**Rodar os testes focados:**

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts
```

Esperado: todos os testes do handler do Bash passam.

---

## Fase 5: Typecheck, Lint e Revisão Final

**Propósito:** Confirmar que a mudança não saiu dos limites e não introduziu problemas de tipo nem de lint.

**Comandos:**

```bash
pnpm --filter @zcode/core typecheck
pnpm --filter @zcode/core lint
pnpm typecheck
pnpm lint
```

**Checklist:**

- [ ] `pnpm --filter @zcode/core exec vitest run tests/bash-handler.test.ts` passa.
- [ ] `pnpm --filter @zcode/core typecheck` passa.
- [ ] `pnpm --filter @zcode/core lint` passa.
- [ ] `pnpm typecheck` passa.
- [ ] `pnpm lint` passa.
- [ ] `git diff --stat` inclui apenas:
  - `docs/runtime-tools/bash-read-file-state.md`
  - `apps/zcode-cli/packages/core/src/tool/handlers/bash-read-file-state.ts`
  - `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
  - `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
  - este arquivo de plano, se ele fizer parte do mesmo branch.
- [ ] Confirmar que não há mudanças em:
  - `apps/zcode-cli/packages/contracts/src/tools/bash.ts`
  - `packages/ui`
  - arquivos de desktop/app/service/protocol
- [ ] Inspecionar manualmente a saída voltada ao provider para o stale hint:

```text
[This command modified 1 file you've previously read: fixture.ts. Call Read before editing.]
```

- [ ] Inspecionar manualmente o efeito de read-state para o caminho do ticket:
  - `Bash cat .env.example`
  - em seguida `Edit .env.example`
  - esperado: nenhum `File has not been read yet` apenas porque a leitura anterior foi via `cat` do Bash.

---

## Notas de Risco

- **Risco de parsing de comandos:** O parser de read-state do Bash precisa ser uma whitelist conservadora. Não fazer backfill em Bash complexo é aceitável; fazer backfill errado não é.
- **Risco de ordem do stale:** O stale hint precisa ser calculado antes do backfill, senão um mesmo comando de escrita pode contaminar a verificação de stale com o próprio estado de leitura.
- **Risco de semântica de leitura por intervalo:** `head/tail/sed` produzem uma range view, mas não um `isPartialView`. Isso é consistente com a semântica de intervalo do Read existente; não marcar como partial, senão Edit/Write continuarão rejeitando.
- **Risco de metadata:** Não ampliar `sourceTool` nem persistir metadata nesta rodada. Isso arrastaria a projeção de compact/resume, que não é a causa raiz deste feedback.
- **Risco de provider-error / stdout truncado:** Falhas não semânticas precisam pular o stale hint e o backfill de read-state; não deixar o stdout de um Bash que falhou contaminar o read-state. O truncamento do stdout do Bash também precisa pular o backfill, evitando mascarar como lido um arquivo completo que o modelo não viu. `grep`/`egrep`/`fgrep` continuam passando por `requiresExitZero`, fazendo backfill apenas quando o exit code é 0.

## Aceitação da Implementação

Após a conclusão deste plano, o ZCode deve atender a:

- `Bash cat .env.example` permitir que um `Edit .env.example` posterior passe pelo guard de read-before-write.
- As formas simples e seguras de `Bash head/tail/sed -n/grep` gerarem read-state conforme a semântica conservadora acima.
- Comandos Bash de formatter/fixer modificarem arquivos já lidos e acrescentarem ao modelo o stale hint `Call Read before editing`.
- Não afetar o Bash em background, o image output do Bash nem o output interrupted do Bash.
- Não depender do prompt ensinar ao modelo que "cat não conta como Read"; o próprio runtime fornece o read-state producer.