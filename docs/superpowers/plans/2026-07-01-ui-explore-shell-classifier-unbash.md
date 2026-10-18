# Plano de Implementação: alinhamento da classificação Shell do UI Explore com unbash

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Substituir a lógica de varredura de strings por regex de Bash na agregação do UI Explore pela análise de AST `unbash` com a mesma origem da CLI, evitando que comandos reais de execução como `pnpm install ... | tail -5` sejam exibidos indevidamente no grupo "Explorar".

**Architecture:** Extrair a análise de Bash segura para navegador, a política somente leitura e a classificação de exibição do Explore para o subpath `@zcode/shared/shell`; o core da CLI e a UI passam a depender das funções puras do shared. O guard de runtime git exclusivo de Node continua em `@zcode/core`, evitando que o bundle Web/mobile introduza `node:fs` / `node:path`. A classificação de PowerShell na UI mantém as regras atuais; apenas comandos Unix shell / Bash / sh / zsh passam a usar o shared classifier.

**Tech Stack:** TypeScript, Vitest, `unbash@4.0.1`, `@zcode/shared`, `@zcode/core`, agregação de tool-call da UI React.

## Restrições globais

- Esta é uma correção de bug na classificação de exibição da UI; não altera a semântica de execução do runtime Bash, permissões, sandbox, session stream, desktop continuous nem web remote replayable.
- Envolve `packages/ui`; antes de implementar é obrigatório ler e respeitar o `DESIGN.md` da raiz; este plano não faz redesenho visual.
- A camada de UI está proibida de depender diretamente de `apps/zcode-cli/packages/core` ou `@zcode/core`.
- Guard de runtime exclusivo de Node (por exemplo, a lógica que lê `.git`) está proibido de ser exportado do topo do shared ou de subpaths voltados ao navegador.
- `packages/ui/src/lib/toolCallAggregation.ts` continua sendo apenas o ponto de entrada da agregação; a correção real deve ocorrer em `packages/ui/src/lib/exploreToolCall.ts` e no shared classifier.
- Caminhos de import permanecem absolutos; a UI importa de `@zcode/shared/shell`, sem caminhos relativos entre domínios.
- Comentários em português, explicando apenas a causa do bug e os limites, sem comentários vazios.
- Não commitar automaticamente; só commitar quando o usuário pedir explicitamente um commit na tarefa atual. Após a conclusão da implementação, pode-se sugerir uma mensagem de Conventional Commits.
- A verificação deve executar no mínimo o Vitest direcionado, `pnpm typecheck` e `pnpm lint`; se o build Web não puder rodar por completo, é preciso listar a causa e o risco nas notas de entrega.

---

## Fase 0: Travar o escopo e reproduzir a situação atual

### Tarefa 0.1: Travar a cadeia de falso positivo e os limites imutáveis

**Arquivos:**
- Ler: `DESIGN.md`
- Ler: `docs/ui/tool-display-rendering.md`
- Ler: `packages/ui/src/lib/exploreToolCall.ts`
- Ler: `packages/ui/src/lib/toolCallAggregation.ts`
- Ler: `apps/zcode-cli/packages/core/src/tool/handlers/bash-command-parser.ts`
- Ler: `apps/zcode-cli/packages/core/src/tool/handlers/bash-semantics.ts`

**Interfaces:**
- Consome: ponto de entrada de agregação da UI atual `shouldAggregateToolCall(toolCall)`.
- Produz: limite de correção explícito: alterar apenas a classificação de exibição de shell, sem alterar execução de runtime nem permissões.

- [ ] **Passo 1: Ler as restrições de design da UI**

Execute:

```bash
sed -n '1,220p' DESIGN.md
```

Esperado: confirmar que não há mudança de estilo visual nesta rodada; se algum componente de UI for alterado na implementação, é preciso manter compatibilidade com desktop/Web/móvel, temas claro/escuro e i18n.

- [ ] **Passo 2: Ler o documento atual de semântica de exibição da UI**

Execute:

```bash
sed -n '28,44p' docs/ui/tool-display-rendering.md
```

Esperado: confirmar que o limite semântico é "comandos de sondagem somente leitura entram no Explore; comandos que não são de sondagem permanecem como Run / shell tool independente".

- [ ] **Passo 3: Reproduzir a classificação errada atual**

Execute:

```bash
node <<'NODE'
const command = 'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5';
const EXECUTE_READ_COMMAND_RE = /\b(rg|grep|find|ls|cat|head|tail|wc|stat|pwd|which|readlink|tree|sed\s+-n|get-childitem|gci|dir|get-content|gc|type|select-string|sls|get-location|test-path|resolve-path)\b|^git\s+(status|log|show|diff)\b/i;
const EXECUTE_WRITE_COMMAND_RE = /\b(sed\s+-i|perl\s+-pi|tee|mv|cp|rm|mkdir|rmdir|touch|truncate|chmod|chown|remove-item|del|erase|set-content|add-content|clear-content|out-file|new-item|move-item|copy-item|rename-item|set-item)\b|^git\s+(add|commit|rm|mv|checkout|switch|restore|reset|clean|revert|cherry-pick|merge|rebase)\b/i;
const SHELL_REDIRECT_WRITE_RE = /(^|[^\d<])>>?\s*\S|&>\s*\S/i;
const segments = command.split(/&&|\|\||;/g).map((segment) => segment.trim()).filter(Boolean);
const result = segments.some((segment) => EXECUTE_WRITE_COMMAND_RE.test(segment))
  ? false
  : segments.some((segment) => SHELL_REDIRECT_WRITE_RE.test(segment))
    ? false
    : segments.some((segment) => EXECUTE_READ_COMMAND_RE.test(segment));
console.log(JSON.stringify({ segments, result }, null, 2));
NODE
```

Esperado: `result` é `true`, e o terceiro segmento casa com a regex de comando de leitura por conter `tail -5`.

- [ ] **Passo 4: Usar o dist atual do core para verificar que o mesmo comando não é sondagem na semântica da CLI**

Execute:

```bash
node --input-type=module <<'NODE'
import { isRuntimeReadOnlyBashCommand, isSearchOrReadBashCommand } from './apps/zcode-cli/packages/core/dist/tool/handlers/bash-semantics.js';
const command = 'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5';
console.log({
  readOnly: isRuntimeReadOnlyBashCommand(command),
  searchOrRead: isSearchOrReadBashCommand(command),
});
NODE
```

Esperado:

```text
{
  readOnly: false,
  searchOrRead: { isList: false, isRead: false, isSearch: false }
}
```

---

## Fase 1: Extrair o módulo shared de shell seguro para navegador

### Tarefa 1.1: Adicionar o subpath `@zcode/shared/shell` e a atribuição de dependências

**Arquivos:**
- Modificar: `packages/shared/package.json`
- Modificar: `apps/zcode-cli/packages/core/package.json`
- Modificar: `pnpm-lock.yaml`
- Criar: `packages/shared/src/shell/index.ts`

**Interfaces:**
- Produz: subpath `@zcode/shared/shell`, para import pela UI e pelo core.
- Produz: shared passa a ser dono da dependência direta `unbash@4.0.1`.
- Consome: core usa os shell helpers do shared via workspace dependency.

- [ ] **Passo 1: Modificar os exports e as dependências do pacote shared**

Edite `packages/shared/package.json`:

```json
{
  "name": "@zcode/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./zcodeEndpoint": "./src/zcodeEndpoint.ts",
    "./shell": "./src/shell/index.ts"
  },
  "dependencies": {
    "unbash": "4.0.1",
    "zod": "^4.3.6"
  },
  "scripts": {
    "lint": "oxlint",
    "lint:fix": "oxlint --fix"
  },
  "devDependencies": {
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Passo 2: Modificar as dependências do pacote core**

Edite as dependencies de `apps/zcode-cli/packages/core/package.json`:

```json
{
  "dependencies": {
    "@zcode/contracts": "workspace:*",
    "@zcode/shared": "workspace:*",
    "@zcode/shared-types": "workspace:*",
    "cheerio": "^1.0.0",
    "diff": "^9.0.0"
  }
}
```

Esperado: `unbash` deixa de ser dependency direta de `@zcode/core`, evitando que a posse do parser continue no agent core.

- [ ] **Passo 3: Criar a entrada shared de shell**

Crie `packages/shared/src/shell/index.ts`:

```ts
export * from "./bash-command-parser.js";
export * from "./bash-display-classifier.js";
export * from "./bash-readonly-policy.js";
export type * from "./bash-readonly-policy-types.js";
```

- [ ] **Passo 4: Atualizar o lockfile**

Execute:

```bash
pnpm install --lockfile-only
```

Esperado: no `pnpm-lock.yaml`, `@zcode/shared` depende diretamente de `unbash@4.0.1` e `@zcode/core` não lista mais `unbash` diretamente.

### Tarefa 1.2: Mover o parser Bash e a política somente leitura seguros para navegador

**Arquivos:**
- Mover: `apps/zcode-cli/packages/core/src/tool/handlers/bash-command-parser.ts` -> `packages/shared/src/shell/bash-command-parser.ts`
- Mover: `apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy*.ts` -> `packages/shared/src/shell/`
- Modificar: `packages/shared/src/shell/bash-readonly-policy-argv.ts` movido
- Teste: `packages/shared/test/bashCommandParser.test.ts`

**Interfaces:**
- Produz: `analyzeBashCommand(command: string): BashCommandAnalysis`
- Produz: `isBashCommandPermissionSafe(analysis: BashCommandAnalysis): boolean`
- Produz: `evaluateBashReadonlyPolicy(commandPart, options?): boolean | undefined`
- Produz: `hasKnownBashWriteOption(commandPart): boolean`

- [ ] **Passo 1: Mover os arquivos de parser e policy**

Execute:

```bash
mkdir -p packages/shared/src/shell
git mv apps/zcode-cli/packages/core/src/tool/handlers/bash-command-parser.ts packages/shared/src/shell/bash-command-parser.ts
for file in apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy*.ts; do git mv "$file" packages/shared/src/shell/; done
```

Esperado: sobram apenas as versões shared do parser e dos arquivos `bash-readonly-policy*`; `apps/zcode-cli/packages/core/src/tool/handlers/bash-git-runtime-safety.ts` não é movido.

- [ ] **Passo 2: Remover a dependência de `process.platform` (exclusiva de Node) da readonly policy**

Edite `packages/shared/src/shell/bash-readonly-policy-argv.ts`, alterando a assinatura da função para:

```ts
import type { BashCommandInvocation } from "./bash-command-parser.js";

export interface BashReadonlyPolicyOptions {
  readonly platform?: string;
}

export function evaluateBashReadonlyPolicy(
  commandPart: BashCommandInvocation,
  options: BashReadonlyPolicyOptions = {},
): boolean | undefined {
  const platform = options.platform ?? "browser";
  if (!areEnvAssignmentsAllowed(commandPart)) return false;
  if (!areRedirectsAllowed(commandPart)) return false;

  const argv = stripSafeCommandWrappers(commandPart.argv);
  if (argv.length === 0) return false;
  if (argv.some(isUnsafeWindowsUncPath)) return false;
  if (argv[0] === "git") return isGitReadOnlyCommand(argv);

  const directArgvResult = evaluateDirectReadonlyArgv(argv);
  if (directArgvResult !== undefined) return directArgvResult;

  const prefixPolicyResult = evaluateReadonlyPrefixPolicy(argv, commandPart.commandText);
  if (prefixPolicyResult !== undefined) return prefixPolicyResult;

  if (READONLY_ALLOW_ANY_ARG_COMMANDS.has(argv[0] ?? "")) return true;
  if (platform === "win32" && argv[0] === "xargs") return undefined;

  const policy = READONLY_COMMAND_POLICIES.get(argv[0] ?? "");
  if (!policy) return undefined;
  if (argv[0] === "cd" && argv.length > 2) return false;
  if (policy.additionalCommandIsDangerousCallback?.(commandPart.commandText, argv.slice(1)))
    return false;
  if (!isArgvAllowedByPolicy(argv, policy, argv[0] ?? "")) return false;
  if (policy.regex && !policy.regex.test(commandPart.commandText)) return false;
  return true;
}
```

Mantenha as funções auxiliares existentes abaixo deste bloco inalteradas, a menos que o TypeScript indique um problema de ordem de import.

- [ ] **Passo 3: Exportar as opções da policy**

Edite `packages/shared/src/shell/bash-readonly-policy.ts`:

```ts
export {
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
  type BashReadonlyPolicyOptions,
} from "./bash-readonly-policy-argv.js";
export { isSedInPlaceOption } from "./bash-readonly-policy-callbacks.js";
```

- [ ] **Passo 4: Adicionar teste de regressão do parser**

Crie `packages/shared/test/bashCommandParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeBashCommand } from "../src/shell/bash-command-parser.js";

describe("bash command parser", () => {
  it("keeps pipeline stages separate so output filters do not hide mutating commands", () => {
    const analysis = analyzeBashCommand(
      'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
    );

    expect(analysis.commands.map((command) => command.name)).toEqual([
      "eval",
      "cd",
      "pnpm",
      "tail",
    ]);
    expect(analysis.commands.map((command) => command.operatorBefore ?? "start")).toEqual([
      "start",
      "sequence",
      "&&",
      "|",
    ]);
    expect(analysis.hasDynamicWords).toBe(true);
    expect(analysis.commands[2]?.redirects).toEqual([
      {
        fileDescriptor: 2,
        operator: ">&",
        target: "1",
      },
    ]);
  });
});
```

- [ ] **Passo 5: Executar o teste do parser e confirmar que passa**

Execute:

```bash
pnpm exec vitest run packages/shared/test/bashCommandParser.test.ts
```

Esperado: PASS.

---

## Fase 2: Classificação de exibição do Explore em Bash no shared

### Tarefa 2.1: Adicionar o Bash display classifier

**Arquivos:**
- Criar: `packages/shared/src/shell/bash-display-classifier.ts`
- Teste: `packages/shared/test/bashDisplayClassifier.test.ts`

**Interfaces:**
- Produz:
  - `classifyBashCommandForExplore(command: string, options?: BashExploreClassifierOptions): BashExploreClassification`
  - `BashExploreClassification` com `isExplore`, `isSearch`, `isRead`, `isList`, `reason`
- Consome:
  - `analyzeBashCommand`
  - `isBashCommandPermissionSafe`
  - `evaluateBashReadonlyPolicy`
  - `hasKnownBashWriteOption`

- [ ] **Passo 1: Adicionar a implementação do classifier**

Crie `packages/shared/src/shell/bash-display-classifier.ts`:

```ts
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
  type BashCommandInvocation,
} from "./bash-command-parser.js";
import {
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
  type BashReadonlyPolicyOptions,
} from "./bash-readonly-policy.js";

export type BashExploreClassificationReason =
  | "empty"
  | "unsafe-syntax"
  | "write-command"
  | "non-readonly-command"
  | "non-explore-command"
  | "read-only-explore";

export interface BashExploreClassification {
  readonly isExplore: boolean;
  readonly isList: boolean;
  readonly isRead: boolean;
  readonly isSearch: boolean;
  readonly reason: BashExploreClassificationReason;
}

export type BashExploreClassifierOptions = BashReadonlyPolicyOptions;

const EMPTY_CLASSIFICATION: BashExploreClassification = {
  isExplore: false,
  isList: false,
  isRead: false,
  isSearch: false,
  reason: "empty",
};

const SEARCH_COMMANDS = new Set(["ag", "ack", "egrep", "fgrep", "grep", "locate", "rg"]);
const READ_COMMANDS = new Set([
  "awk",
  "cat",
  "cut",
  "file",
  "head",
  "jq",
  "less",
  "more",
  "pwd",
  "sed",
  "sort",
  "stat",
  "strings",
  "tail",
  "tr",
  "uniq",
  "wc",
  "which",
  "whereis",
  "yq",
]);
const LIST_COMMANDS = new Set(["du", "find", "ls", "tree"]);
const NEUTRAL_COMMANDS = new Set(["", ":", "cd", "echo", "false", "printf", "true"]);

export function classifyBashCommandForExplore(
  command: string,
  options: BashExploreClassifierOptions = {},
): BashExploreClassification {
  const analysis = analyzeBashCommand(command);
  if (analysis.commands.length === 0) return { ...EMPTY_CLASSIFICATION };
  if (!isBashCommandPermissionSafe(analysis)) {
    return { ...EMPTY_CLASSIFICATION, reason: "unsafe-syntax" };
  }

  let isList = false;
  let isRead = false;
  let isSearch = false;
  let sawExploreCommand = false;

  for (const commandPart of analysis.commands) {
    if (hasKnownBashWriteOption(commandPart)) {
      return { ...EMPTY_CLASSIFICATION, reason: "write-command" };
    }
    if (evaluateBashReadonlyPolicy(commandPart, options) !== true) {
      return { ...EMPTY_CLASSIFICATION, reason: "non-readonly-command" };
    }

    const displayCommand = resolveDisplayCommand(commandPart);
    if (NEUTRAL_COMMANDS.has(displayCommand)) {
      continue;
    }

    const bucket = classifyDisplayCommand(displayCommand, commandPart.argv);
    if (!bucket) {
      return { ...EMPTY_CLASSIFICATION, reason: "non-explore-command" };
    }

    sawExploreCommand = true;
    isList ||= bucket === "list";
    isRead ||= bucket === "read";
    isSearch ||= bucket === "search";
  }

  if (!sawExploreCommand) {
    return { ...EMPTY_CLASSIFICATION, reason: "non-explore-command" };
  }

  return {
    isExplore: true,
    isList,
    isRead,
    isSearch,
    reason: "read-only-explore",
  };
}

function resolveDisplayCommand(commandPart: BashCommandInvocation): string {
  const argv = stripDisplayWrappers(commandPart.argv);
  if (argv[0] === "git") {
    return `git ${resolveGitSubcommand(argv) ?? ""}`.trim();
  }
  return argv[0] ?? commandPart.name;
}

function stripDisplayWrappers(argv: readonly string[]): readonly string[] {
  let words = [...argv];
  for (;;) {
    if (words[0] === "command") {
      let index = 1;
      while (words[index] !== undefined && /^-p+$/.test(words[index] ?? "")) index += 1;
      if (words[index] === "--") index += 1;
      if (index >= words.length || words[index]?.startsWith("-")) return words;
      words = words.slice(index);
      continue;
    }
    if (words[0] === "builtin") {
      const index = words[1] === "--" ? 2 : 1;
      if (index >= words.length) return words;
      words = words.slice(index);
      continue;
    }
    if (words[0] === "noglob") {
      if (words.length <= 1) return words;
      words = words.slice(1);
      continue;
    }
    return words;
  }
}

function resolveGitSubcommand(argv: readonly string[]): string | undefined {
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg.startsWith("-")) {
      if (arg === "-C" || arg === "-c") index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

function classifyDisplayCommand(
  commandName: string,
  argv: readonly string[],
): "list" | "read" | "search" | undefined {
  if (commandName === "git grep") return "search";
  if (
    commandName === "git diff" ||
    commandName === "git log" ||
    commandName === "git show" ||
    commandName === "git status"
  ) {
    return "read";
  }
  if (commandName === "git ls-files" || commandName === "git branch") return "list";
  if (commandName === "git rev-parse" && argv.includes("--show-toplevel")) return "read";
  if (SEARCH_COMMANDS.has(commandName)) return "search";
  if (READ_COMMANDS.has(commandName)) return "read";
  if (LIST_COMMANDS.has(commandName)) return "list";
  return undefined;
}
```

- [ ] **Passo 2: Adicionar testes do classifier**

Crie `packages/shared/test/bashDisplayClassifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyBashCommandForExplore } from "../src/shell/bash-display-classifier.js";

describe("bash display classifier", () => {
  it("rejects package install commands even when output is piped through tail", () => {
    const result = classifyBashCommandForExplore(
      'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
    );

    expect(result).toMatchObject({
      isExplore: false,
      isList: false,
      isRead: false,
      isSearch: false,
    });
    expect(["unsafe-syntax", "non-readonly-command"]).toContain(result.reason);
  });

  it("keeps read-only search pipelines in Explore", () => {
    expect(classifyBashCommandForExplore("grep -R -n foo src | head -20")).toMatchObject({
      isExplore: true,
      isRead: true,
      isSearch: true,
      reason: "read-only-explore",
    });
  });

  it("allows workspace cd before a read-only search command", () => {
    expect(
      classifyBashCommandForExplore('cd "/workspace/project" && grep -R -n "foo" src'),
    ).toMatchObject({
      isExplore: true,
      isSearch: true,
    });
  });

  it("rejects mutating commands that include read-only output filters", () => {
    for (const command of [
      "npm install 2>&1 | tail -20",
      "pnpm add lodash | head",
      "yarn remove left-pad | tail -5",
      "bun install | tail -5",
      "rm -rf dist | cat",
    ]) {
      expect(classifyBashCommandForExplore(command), command).toMatchObject({
        isExplore: false,
      });
    }
  });

  it("rejects dynamic command expansion before read-only tools", () => {
    expect(classifyBashCommandForExplore("grep foo $(touch out.txt)")).toMatchObject({
      isExplore: false,
      reason: "unsafe-syntax",
    });
  });
});
```

- [ ] **Passo 3: Executar os testes do shared classifier**

Execute:

```bash
pnpm exec vitest run packages/shared/test/bashCommandParser.test.ts packages/shared/test/bashDisplayClassifier.test.ts
```

Esperado: PASS.

---

## Fase 3: Fazer o core consumir o parser / policy de shell do shared

### Tarefa 3.1: Atualizar os imports do core mantendo a semântica de permissões

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-semantics.ts`
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/bash-metadata.ts`
- Modificar: quaisquer imports restantes do core encontrados por busca
- Teste: `apps/zcode-cli/packages/core/tests/bash-permission.test.ts`

**Interfaces:**
- Consome de `@zcode/shared/shell`:
  - `analyzeBashCommand`
  - `isBashCommandPermissionSafe`
  - `evaluateBashReadonlyPolicy`
  - `hasKnownBashWriteOption`
  - `isSedInPlaceOption`
- Mantém inalterados os exports existentes do core:
  - `isRuntimeReadOnlyBashCommand`
  - `isSimpleReadOnlyBashCommand`
  - `isSearchOrReadBashCommand`
  - `isSedInPlaceBashCommand`

- [ ] **Passo 1: Substituir os imports do core em `bash-semantics.ts`**

Edite o bloco de imports para:

```ts
import type { ExecutionResult } from "@zcode/contracts";
import {
  analyzeBashCommand,
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
  isBashCommandPermissionSafe,
  isSedInPlaceOption,
} from "@zcode/shared/shell";
import {
  analysisContainsGitAndDirectoryChange,
  analysisContainsGitCommand,
  isGitRuntimeContextUnsafe,
  type BashReadonlyRuntimeContext,
} from "./bash-git-runtime-safety.js";
```

- [ ] **Passo 2: Passar a plataforma Node para a readonly policy de runtime**

Em `isSimpleReadOnlyBashCommand`:

```ts
return (
  commandPart.argv.length > 0 &&
  evaluateBashReadonlyPolicy(commandPart, { platform: process.platform }) === true
);
```

No laço de `isRuntimeReadOnlyBashCommand`:

```ts
const policyResult = evaluateBashReadonlyPolicy(commandPart, { platform: process.platform });
```

Esperado: a CLI mantém o mesmo comportamento do branch de `xargs` no Windows, enquanto os chamadores de navegador do shared evitam `process`.

- [ ] **Passo 3: Buscar imports relativos obsoletos**

Execute:

```bash
rg -n "bash-command-parser|bash-readonly-policy" apps/zcode-cli/packages/core/src
```

Esperado: nenhum import aponta para `./bash-command-parser.js` ou `./bash-readonly-policy.js` removidos; as referências restantes ou importam de `@zcode/shared/shell` ou se referem a texto de teste/documentação.

- [ ] **Passo 4: Executar os testes de permissão Bash do core**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-permission.test.ts
```

Esperado: PASS. O comportamento somente leitura existente em plan mode não pode regredir.

### Tarefa 3.2: Manter estável o comportamento do classifier de search/read do core

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/bash-permission.test.ts`
- Teste: o mesmo arquivo

**Interfaces:**
- Verifica que `isBashInputReadOnly({ command })` rejeita o comando relatado.
- Verifica que o core continua mais conservador que a exibição da UI quando existe expansão dinâmica.

- [ ] **Passo 1: Adicionar regressão explícita nos testes de permissão do core**

Adicione à lista de comandos de `"keeps mutating Bash commands denied in plan mode"`:

```ts
'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
"npm install 2>&1 | tail -20",
"pnpm add lodash | head",
```

- [ ] **Passo 2: Executar o teste focado do core**

Execute:

```bash
pnpm --filter @zcode/core exec vitest run tests/bash-permission.test.ts -t "keeps mutating Bash commands denied in plan mode"
```

Esperado: PASS.

---

## Fase 4: Fazer a agregação do UI Explore usar o shared classifier

### Tarefa 4.1: Substituir a classificação por regex de Bash na UI

**Arquivos:**
- Modificar: `packages/ui/src/lib/exploreToolCall.ts`
- Teste: `packages/ui/test/toolCallBlocks.test.ts`
- Teste: `packages/ui/test/toolCallAggregation.test.ts`

**Interfaces:**
- Consome: `classifyBashCommandForExplore(command)` de `@zcode/shared/shell`
- Produz: `isExploreToolCall({ kind, input }): boolean` mantém a assinatura pública inalterada.

- [ ] **Passo 1: Mudar a extração de comandos para preservar o script de shell completo**

Em `packages/ui/src/lib/exploreToolCall.ts`, substitua `normalizeCommandCandidate` por:

```ts
function normalizeCommandCandidate(candidate: string): string[] {
  const unwrapped = unwrapShellCommand(candidate);
  return unwrapped.length === 0 ? [] : [unwrapped];
}
```

Esperado: a UI deixa de dividir o Bash por `&&` / `||` / `;`; quem responde pela estrutura do shell passa a ser o `unbash`.

- [ ] **Passo 2: Separar a classificação de PowerShell e de Bash**

Adicione os imports:

```ts
import { classifyBashCommandForExplore } from "@zcode/shared/shell";
import { resolveToolCallIdentity } from "@/lib/toolIdentity.js";
```

Substitua as constantes regex de Bash por constantes específicas de PowerShell:

```ts
const POWERSHELL_READ_COMMAND_RE =
  /\b(get-childitem|gci|dir|get-content|gc|type|select-string|sls|get-location|test-path|resolve-path)\b/i;
const POWERSHELL_WRITE_COMMAND_RE =
  /\b(remove-item|del|erase|set-content|add-content|clear-content|out-file|new-item|move-item|copy-item|rename-item|set-item)\b/i;
```

Adicione os helpers:

```ts
function isWrappedPowerShellCommand(command: string): boolean {
  return /^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i.test(command.trim());
}

function classifyPowerShellExploreCommand(command: string): boolean | undefined {
  const unwrapped = unwrapShellCommand(command).toLowerCase();
  if (POWERSHELL_WRITE_COMMAND_RE.test(unwrapped)) return false;
  if (isWrappedPowerShellCommand(command) || POWERSHELL_READ_COMMAND_RE.test(unwrapped)) {
    return POWERSHELL_READ_COMMAND_RE.test(unwrapped);
  }
  return undefined;
}

function isExploreShellCommand(command: string): boolean {
  const powerShellResult = classifyPowerShellExploreCommand(command);
  if (powerShellResult !== undefined) return powerShellResult;
  return classifyBashCommandForExplore(command).isExplore;
}
```

- [ ] **Passo 3: Usar a semântica de todos os comandos em `isExploreToolCall`**

Substitua a seção de shell por:

```ts
const commands = extractToolCommands(input);
if (commands.length === 0) {
  return false;
}

for (const command of commands) {
  if (!isExploreShellCommand(command)) {
    return false;
  }
}

return true;
```

Esperado: a agregação ocorre apenas quando todos os comandos shell candidatos podem ser confirmados como comandos de sondagem; qualquer comando que não seja de sondagem misturado na mesma entrada precisa permanecer como shell tool independente. O comando de install do relatório deixa de ser agregado, porque o único candidato é rejeitado pelo shared Bash classifier.

- [ ] **Passo 4: Manter os comentários focados no bug**

Adicione um comentário perto de `normalizeCommandCandidate`:

```ts
// 修复原因：Bash 的管道/分号/条件执行必须交给 unbash AST 判断；
// 不能先按字符串切段，否则 `pnpm install | tail` 会被尾部 `tail` 误判成探索。
```

### Tarefa 4.2: Adicionar testes de regressão na UI

**Arquivos:**
- Modificar: `packages/ui/test/toolCallBlocks.test.ts`
- Modificar: `packages/ui/test/toolCallAggregation.test.ts`
- Modificar: `packages/ui/test/chatMessage.test.ts`

**Interfaces:**
- Verifica que tanto `isExploreToolCall` quanto a regra de agregação rejeitam install-com-tail.
- Verifica que pipelines de shell somente leitura ainda entram no Explore.
- Verifica que o comportamento de leitura/escrita em PowerShell permanece inalterado.

- [ ] **Passo 1: Adicionar testes diretos de `isExploreToolCall`**

Em `packages/ui/test/toolCallBlocks.test.ts`, estenda `describe("isExploreToolCall", ...)`:

```ts
it("does not classify install commands piped through tail as explore", () => {
  expect(
    isExploreToolCall({
      kind: "bash",
      input: {
        command:
          'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
      },
    }),
  ).toBe(false);
});

it("keeps read-only search pipelines classified as explore", () => {
  expect(
    isExploreToolCall({
      kind: "bash",
      input: { command: "grep -R -n foo src | head -20" },
    }),
  ).toBe(true);
});

it("does not classify package manager mutations with read-only output filters as explore", () => {
  for (const command of [
    "npm install 2>&1 | tail -20",
    "pnpm add lodash | head",
    "yarn remove left-pad | tail -5",
    "bun install | tail -5",
  ]) {
    expect(
      isExploreToolCall({
        kind: "bash",
        input: { command },
      }),
      command,
    ).toBe(false);
  }
});
```

- [ ] **Passo 2: Adicionar regressão no nível da agregação**

Em `packages/ui/test/toolCallAggregation.test.ts`, adicione:

```ts
it("does not aggregate install commands whose output is trimmed with tail", () => {
  expect(
    shouldAggregateToolCall({
      toolId: "tool-install-tail",
      kind: "bash",
      title: "Run pnpm install",
      input: {
        command:
          'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
      },
      status: "completed",
    }),
  ).toBe(false);
});

it("still aggregates read-only Bash search pipelines", () => {
  expect(
    shouldAggregateToolCall({
      toolId: "tool-grep-head",
      kind: "bash",
      title: "Search source",
      input: { command: "grep -R -n foo src | head -20" },
      status: "completed",
    }),
  ).toBe(true);
});
```

- [ ] **Passo 3: Adicionar regressão de renderização de chat**

Em `packages/ui/test/chatMessage.test.ts`, adicione um caso ao lado de `"keeps an independent classifiable non-explore shell tool visible"`:

```ts
it("keeps install output filters as an independent shell tool instead of Explore", () => {
  const html = renderChatMessage({
    id: "assistant-run-install-tail-shell",
    role: "assistant",
    content: "",
    streaming: true,
    timestamp: Date.now(),
    parts: [{ type: "tool-call", toolId: "tool-run-install-tail-shell" }],
    toolCalls: [
      {
        toolId: "tool-run-install-tail-shell",
        kind: "bash",
        title: "Running shell",
        input: {
          command:
            'eval "$(fnm env --shell bash 2>/dev/null)"; cd /d/aai-projects/www-aicodezen && pnpm install --ignore-workspace 2>&1 | tail -5',
        },
        status: "in_progress",
      },
    ],
  });

  expect(html).toContain("Running shell");
  expect(html).toContain("执行中");
  expect(html).not.toContain("探索");
});
```

- [ ] **Passo 4: Executar os testes focados da UI**

Execute:

```bash
pnpm exec vitest run packages/ui/test/toolCallBlocks.test.ts packages/ui/test/toolCallAggregation.test.ts packages/ui/test/chatMessage.test.ts -t "install|read-only Bash search pipelines|PowerShell"
```

Esperado: PASS para os novos casos e para os casos existentes de leitura/escrita em PowerShell.

---

## Fase 5: Documentação e verificação multiplataforma

### Tarefa 5.1: Atualizar a documentação de exibição de ferramentas da UI

**Arquivos:**
- Modificar: `docs/ui/tool-display-rendering.md`

**Interfaces:**
- Produz: a documentação deixa explícito que Unix shell usa a classificação por AST `unbash` do shared e que PowerShell continua classificado por tabela de comandos.

- [ ] **Passo 1: Atualizar o parágrafo de classificação de shell do Explore**

No bullet existente sobre classificação de shell do Explore, acrescente a seguinte frase em português:

```md
Comandos Unix shell / Bash / sh / zsh devem usar a classificação por AST `unbash` do shared; não é permitido primeiro fatiar `&&` / `;` / pipe por regex de string e depois casar qualquer fragmento. Comandos de recorte de saída como `tail` / `head` não podem sobrescrever a semântica de exibição de comandos anteriores que não são de sondagem, como `pnpm install` / `npm install`.
```

- [ ] **Passo 2: Verificar se o documento não ficou com regras conflitantes**

Execute:

```bash
rg -n "Explore 聚合的 shell|unbash|tail|pnpm install" docs/ui/tool-display-rendering.md
```

Esperado: o documento mantém ao mesmo tempo as regras de leitura/escrita de PowerShell e a nova regra de AST para Unix shell.

### Tarefa 5.2: Verificação final

**Arquivos:**
- Todos os arquivos alterados.

**Interfaces:**
- Verifica que shared, core e UI concordam sobre esse limite de bug.

- [ ] **Passo 1: Executar todos os testes focados**

Execute:

```bash
pnpm exec vitest run \
  packages/shared/test/bashCommandParser.test.ts \
  packages/shared/test/bashDisplayClassifier.test.ts \
  packages/ui/test/toolCallBlocks.test.ts \
  packages/ui/test/toolCallAggregation.test.ts \
  packages/ui/test/chatMessage.test.ts \
  apps/zcode-cli/packages/core/tests/bash-permission.test.ts
```

Esperado: PASS.

- [ ] **Passo 2: Executar o typecheck do core**

Execute:

```bash
pnpm --filter @zcode/core typecheck
```

Esperado: PASS.

- [ ] **Passo 3: Executar o typecheck do pacote shared pelo grafo de build da raiz**

Execute:

```bash
pnpm typecheck
```

Esperado: PASS. Se aparecerem erros pré-existentes não relacionados, registrar os caminhos exatos dos arquivos e as mensagens de erro.

- [ ] **Passo 4: Executar o lint**

Execute:

```bash
pnpm lint
```

Esperado: PASS ou apenas warnings já existentes.

- [ ] **Passo 5: Verificar que o bundle Web não puxa módulos exclusivos de Node**

Execute:

```bash
pnpm --filter @zcode/web exec vite build --base=/remote/__test__/
```

Esperado: PASS. Não deve haver erros de bundle com `node:fs`, `node:path` ou `process is not defined` vindos de `@zcode/shared/shell`.

- [ ] **Passo 6: Inspecionar a posse das dependências**

Execute:

```bash
pnpm list unbash --depth 4 --recursive
```

Esperado: `@zcode/shared` é dono de `unbash@4.0.1`; `@zcode/core` chega a ele através de `@zcode/shared` e não como dependência direta.

- [ ] **Passo 7: Revisar o diff antes do handoff**

Execute:

```bash
git diff -- packages/shared packages/ui apps/zcode-cli/packages/core docs/ui/tool-display-rendering.md package.json pnpm-lock.yaml
git status --short
```

Esperado: apenas os arquivos deste plano mudaram. Nenhuma edição não relacionada do usuário é revertida.

---

## Sugestão de mensagem de commit

Use apenas se o usuário pedir explicitamente um commit na tarefa atual:

```bash
git add packages/shared packages/ui apps/zcode-cli/packages/core docs/ui/tool-display-rendering.md pnpm-lock.yaml
git commit -m "fix(ui): align Explore shell classification with bash parser"
```

## Checklist de execução

- [ ] Fase 0 concluída: causa raiz e comportamento-alvo verificados.
- [ ] Fase 1 concluída: o parser / policy de shell do shared existe e não tem dependência de navegador exclusiva de Node.
- [ ] Fase 2 concluída: o shared Bash Explore classifier rejeita install-com-tail e aceita pipelines de busca somente leitura.
- [ ] Fase 3 concluída: o core importa os shell helpers do shared e os testes de permissão do core passam.
- [ ] Fase 4 concluída: a agregação do UI Explore usa o shared classifier e os testes de regressão passam.
- [ ] Fase 5 concluída: documentação atualizada, testes focados passando, `pnpm typecheck`, `pnpm lint` e a verificação do build Web concluídos ou documentados com bloqueadores exatos.