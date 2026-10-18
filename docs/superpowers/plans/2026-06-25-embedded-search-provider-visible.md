# Plano de implementação do branch de busca embutida (Embedded Search)

> Para agentes: SKILL OBRIGATÓRIA: use superpowers:executing-plans para executar este plano passo a passo.

> Correção de revisão de 2026-06-25: o ZCode habilita por padrão o branch de embedded search (gate de embedded search ligado e Bash disponível). A requisição provider-visible tem como evidência os testes de contrato do branch embutido; a short description de Glob/Grep direto é validada separadamente por uma baseline de contrato dedicada.

> Política temporária de runtime de 2026-06-25: o branch de embedded search provider-visible continua ligado por padrão, mas a camada de execução do Bash temporariamente não injeta o prelude `find()` / `grep()`. O modelo ainda verá e priorizará `find` / `grep` no Bash, e os comandos reais dependem primeiro do ambiente de shell local do usuário; se for CMD ou faltar o comando, o erro da primeira execução do Bash é devolvido ao modelo para adaptação. O construtor de prelude, os tipos de backend e o código de suporte do adapter são preservados e podem ser restaurados depois por um interruptor.

## Objetivo

Mudar de forma unificada o main agent do ZCode, o subagent Agent/Explore, as descrições das ferramentas Glob/Grep e o comportamento de runtime de `find`/`grep` no Bash para o **branch de embedded search** como padrão.

O baseline padrão atual é o branch de embedded search:

1. camada provider-visible: por padrão não expõe ao modelo as ferramentas diretas `Glob` / `Grep`.
2. prompt do Bash: por padrão não orienta mais a evitar rodar `find` / `grep` diretamente no Bash.
3. prompt do Plan: por padrão usa ``find``/Glob, ``grep``/Grep, and Read``.
4. camada de runtime: atualmente não injeta temporariamente o prelude `find()` / `grep()` do embedded search, dependendo primeiro do `find` / `grep` local do usuário.

## Comportamento alvo do branch de embedded search

- O gate de embedded search é ligado por padrão; ele pode ser desligado em cenários não padrão, como o entry de agent local.
- Com o gate ligado e o Bash disponível:
  - a orientação de exploração ampla do main system usa ``find`` / ``grep`` via Bash tool.
  - o prompt do Explore usa as orientações de `find` / `grep` sob o Bash.
  - a lista de avoid do prompt do Bash deixa de exigir evitar `find` / `grep`.
  - na inicialização do Bash são injetadas as functions `find` / `grep`, executadas pelo backend de embedded search (na forma bundled, distribuídas para `bfs` / `ugrep`).
  - a function `grep` usa `ugrep -G --ignore-files --hidden -I` e exclui por padrão `.git/.svn/.hg/.bzr/.jj/.sl`.
  - ao encontrar `-*-filter*`, `-*-pager*`, `-*-view*`, `-*-format-open*`, `-*-config*`, `---*`, `-@*` ou `-*-save-config*`, a `grep` volta ao `grep "$@"` do sistema.
  - as functions `find` / `grep` fazem fallback para os comandos do sistema quando o binário interno não é executável.
- Branch Windows/Git Bash:
  - ainda exige semântica de shell POSIX e não injeta functions `find()` / `grep()` no CMD.
  - sob Git Bash/MSYS/Cygwin, as functions `find` / `grep` chamam na forma `ARGV0=... "<binary>"`, sem depender do `exec -a` de Linux/macOS.
  - o snapshot do shell converte caminhos do host Windows para caminhos do Git Bash, por exemplo `C:\repo` -> `/c/repo`, e filtra os aliases `winpty` gerados automaticamente pelo Git Bash.
- Os prompts das ferramentas Glob/Grep têm também um branch de simple/short description:
  - o modelo padrão pertence ao branch de short description.
  - Esse ponto afeta apenas a descrição direta das ferramentas Glob/Grep e não equivale ao gate de embedded search.

## Trade-offs de implementação da primeira versão

Os trade-offs a seguir existem para reduzir o custo de implementação da primeira versão; são permitidos, mas devem ficar claramente refletidos no código e nos testes:

- A primeira versão não implementa o auto-dispatch dos binários `ARGV0=bfs/ugrep`.
  - Na primeira versão o ZCode usa o backend `internal-cli` para assumir `find` / `grep`.
  - O fato arquitetural deve ser chamado de backend de embedded search, e não de internal search shim.
  - O comportamento provider-visible padrão continua sendo o embedded search; o modelo vê e chama `find` / `grep` no Bash.
  - Reserva-se a porta de backend `argv0-dispatch`, que futuramente poderá ser trocada por uma implementação de auto-dispatch de binário único, sem mudar a exposição de prompt/tool.
  - O `internal-cli` ainda chama o `find` / `grep` real do host, mas o `grep` completa parâmetros padrão de baixo custo: `-G -I --exclude-dir=.git --exclude-dir=.svn --exclude-dir=.hg --exclude-dir=.bzr --exclude-dir=.jj --exclude-dir=.sl`.
  - A shell function `grep` e o `internal-cli grep` devem preservar a lista de bypass dos parâmetros especiais acima, para evitar misturar os parâmetros padrão em modos especiais como filter/pager/view/config.
  - O `internal-cli` não faz parse nem recorte dos argumentos reais de `find` / `grep`; além dos parâmetros padrão e do bypass acima, argv, stdin, stdout, stderr e exit code devem ser transmitidos de forma transparente.
- Não fazer um gate de decisão por provider/source.
  - Dentro deste objetivo, o gate não distingue provider/source/variant e tudo é considerado habilitado.
  - A função de decisão do branch de embedded search deve receber informações do modelo, com forma semelhante ao helper de capability do MCS.
  - Na primeira etapa um feature flag global faz curto-circuito na decisão; depois a mesma função pode decidir se entra no branch de embedded search conforme o modelo.
  - Não ler provider/source para decidir se está habilitado.
- Manter a implementação das ferramentas diretas Glob/Grep.
  - O branch embutido não expõe ferramentas diretas.
  - O branch non-embedded/direct é usado nas degradações não padrão, como o flag global desligado ou Bash indisponível, e continua usando as ferramentas Glob/Grep existentes.

## Restrições globais

- Atualizar/criar primeiro a documentação, depois implementar o código.
- Toda lógica nova precisa ter cobertura automatizada de testes para o prompt/tool schema provider-visible e para o wrapping de shell do runtime.
- Não alterar a UI nem tocar na semântica realtime de mobile/web remote.
- Não transformar a decisão por provider/source em um gate mutável; dentro deste objetivo o gate é uniformemente considerado habilitado.
- O branch de embedded search precisa ser decidido por uma função de capability consciente do modelo, e a decisão não pode ficar espalhada pelos pontos de chamada de registro de prompt/tool.
- A função de capability recebe também a seleção do shell Bash, preservando contexto para futuras estratégias de modelo/runtime; o branch de embedded search provider-visible não faz mais fallback por dialeto de shell.
- Não usar decisões esparsas do tipo patch-on-patch; extrair uniformemente helpers de branch capability, backend e prelude.
- Comentários que precisem explicar bug/diferença devem ser escritos em chinês.
- Antes de commitar é obrigatório executar:
  - `pnpm --filter @zcode/core typecheck`
  - `pnpm --filter @zcode/core lint`
  - `pnpm --filter @zcode/adapters typecheck`
  - `pnpm --filter @zcode/adapters lint`
  - os testes unitários relacionados

## Fronteira do contrato provider-visible

O critério de aceite provider-visible desta tarefa é tudo o que o modelo consegue ver no corpo final da requisição, e não apenas algumas linhas de texto do system prompt. O branch embutido do modelo padrão precisa atender integralmente ao seguinte:

1. `tools[]` não expõe por padrão as ferramentas diretas `Glob` / `Grep`.
   - as ferramentas provider-visible do main agent não devem conter `Glob` / `Grep`.
   - as ferramentas provider-visible do subagent Explore não devem conter `Glob` / `Grep`.
2. A descrição da ferramenta Bash segue por padrão o branch de embedded search.
   - `Avoid using Bash to run ...` não contém `find` / `grep`.
3. O prompt do Explore segue por padrão o branch embutido.
   - usa `Use \`find\` via Bash for broad file pattern matching`.
   - usa `Use \`grep\` via Bash for searching file contents with regex`.
   - a allowlist do Explore não contém `Glob` / `Grep` diretos.
4. O prompt do Plan segue por padrão o branch embutido.
   - usa ``find``, ``grep``, and Read`` para encontrar patterns/conventions.
5. A descrição da ferramenta Agent não lista por padrão ferramentas de busca direta.
   - a descrição do Explore não pode escrever `(Tools: Glob, Grep, Read, Bash, WebFetch, WebSearch, TodoWrite)`.
6. A orientação do main system não emite por padrão o session guidance de Agent/Explore.
   - a orientação simples do branch embutido não contém essas duas linhas; o ZCode mantém os comentários sem emiti-los.

Sob a política temporária atual, o fallback para CMD / shell legado deixa de alterar o branch provider-visible: os `Glob` / `Grep` diretos continuam ocultos por padrão e o prompt do Bash continua permitindo que o modelo use `find` / `grep`. A camada de execução não injeta o prelude do Bash; se o shell local não suportar esses comandos, o erro da primeira execução do Bash é devolvido ao modelo para adaptação.

## Fronteira da arquitetura de três camadas

A implementação precisa ser dividida em três camadas, evitando que a estratégia `internal-cli` da primeira version contamine o contrato provider-visible:

1. Branch capability provider-visible
   - uma função consciente do modelo decide se entra no branch de embedded search, com forma semelhante à `evaluateMidConversationSystemCapability` do MCS.
   - controla se Glob/Grep diretos são expostos, o prompt do Bash, o prompt do Explore, o prompt do Plan, a descrição do Agent e a orientação do main system.
   - não se importa com qual backend executa no final o `find` / `grep` no Bash.
2. Construtor de prelude do Bash
   - responsável apenas por gerar as shell functions:
     ```bash
     find() { ... "$@"; }
     grep() { ... "$@"; }
     ```
   - recebe `EmbeddedSearchBackend` e não faz hardcode de `zcode __internal-search`.
3. Backend de embedded search
   - a primeira versão usa `internal-cli` para reduzir o custo de implementação.
   - futuramente será permitido trocar por `argv0-dispatch`.
   - trocar de backend não deve afetar a branch capability provider-visible, os testes de prompt, os testes de exposição de tools e a maior parte do wiring do handler de Bash.

## Fronteira de adaptação de shell no Windows

- Git Bash:
  - a política provider-visible pode habilitar o branch embutido.
  - adapter/prelude é responsável por converter o comando do backend e argumentos de caminho absoluto do Windows para caminhos do Git Bash.
  - o backend atual ainda é `internal-cli`; ao trocar no futuro para `argv0-dispatch` a mesma fronteira de prelude é reutilizada.
- CMD / fallback de shell legado:
  - atualmente não desabilita o branch de embedded search provider-visible.
  - a camada de execução não injeta functions POSIX e depende diretamente da disponibilidade dos comandos no shell local.
  - mesmo que a camada de adapter receba `bashPrelude`, ela não pode injetar functions POSIX no CMD, como salvaguarda contra uso indevido.
- Esta etapa não implementa a geração completa do arquivo de snapshot de shell `.sh`; esse problema fica para a tarefa separada de shell snapshot/prelude.
- A injeção do prelude do Bash está temporariamente desabilitada; o fallback para CMD / shell legado deixa de ser condição de desligamento do branch provider-visible e a camada de execução uniformemente deixa o shell local errar ou ter sucesso.

## Arquivos afetados

Adições esperadas:

- `apps/zcode-cli/packages/core/src/embedded-search/capability.ts`
- `apps/zcode-cli/packages/core/tests/runtime-embedded-search-capability.test.ts`
- `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`
- `apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts`
- `apps/zcode-cli/packages/cli/src/internal-search/embedded-search-cli.ts`
- `apps/zcode-cli/packages/cli/tests/internal-search.test.ts`

Modificações esperadas:

- `docs/plan/trajectory/embedded-search-provider-visible.md`
- `apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts`
- `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`
- `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- `apps/zcode-cli/packages/core/src/tool/types.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/bash.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/bash-prompt.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`
- `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts`
- `apps/zcode-cli/packages/core/src/subagent/explore.ts`
- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`
- `apps/zcode-cli/packages/core/tests/context-builder.test.ts`
- `apps/zcode-cli/packages/core/tests/bash-handler.test.ts`
- `apps/zcode-cli/packages/adapters/src/exec/index.ts`
- `apps/zcode-cli/packages/adapters/src/exec/cwd-capture.ts`
- `apps/zcode-cli/packages/cli/src/run.ts`

Restrição adicional do usuário: ao concluir esta rodada não fazer commit, push nem stage; todas as alterações ficam na árvore de trabalho sem stage, aguardando review.

## Phase 0: estabelecer a baseline antes da implementação

### 0.1 Verificar o estado da árvore de trabalho

Executar:

```bash
git status --short
```

Esperado:

- Se houver alterações não commitadas do usuário, registrar a lista de arquivos.
- Modificar somente os arquivos listados neste plano.

### 0.2 Registrar o comportamento provider-visible atual

Executar:

```bash
pnpm --filter @zcode/core test -- tool-contracts.test.ts context-builder.test.ts
```

Esperado:

- Os testes atuais passam.
- Se falharem, registrar primeiro os itens que falham, sem corrigir problemas alheios a esta tarefa.

### 0.3 Criar o documento de design

Criar:

```text
docs/plan/trajectory/embedded-search-provider-visible.md
```

Conteúdo do documento:

- comportamento alvo do branch de embedded search:
  - gate de embedded search.
  - injeção de `find` / `grep` na inicialização do Bash.
  - branch embutido nos prompts main/Explore/Bash.
  - relação entre o branch de short description de Glob/Grep e o gate.
- estratégia de implementação do ZCode:
  - branch capability provider-visible.
  - branch provider-visible.
  - prelude do Bash.
  - backend de embedded search.
- trade-offs de implementação:
  - o backend da primeira versão usa `internal-cli` e não implementa diretamente o auto-dispatch `ARGV0=bfs/ugrep`.
  - reserva-se o backend `argv0-dispatch`, que futuramente pode ser trocado por uma implementação de auto-dispatch de binário único.
  - o gate é uniformemente considerado habilitado, sem decisão por provider/source.
  - a branch capability recebe informações do modelo e, na primeira etapa, faz curto-circuito por um feature flag global.

Verificação:

```bash
test -f docs/plan/trajectory/embedded-search-provider-visible.md
```

## Phase 1: extrair a branch capability de embedded search

As phases 1 a 5 abaixo são os passos de implementação do branch embutido padrão; o fallback para CMD / shell legado volta ao branch direto Glob/Grep.

### 1.1 Escrever testes que falham

Adicionar:

```text
apps/zcode-cli/packages/core/tests/runtime-embedded-search-capability.test.ts
```

Cobertura de testes:

- a entrada de capability precisa receber `ModelRef`.
- sem `embeddedSearchBranchEnabled` explícito + Bash disponível, o embedded search é habilitado.
- `embeddedSearchBranchEnabled: true` explícito + Bash indisponível não habilita o embedded search.
- com o flag global desligado, faz curto-circuito para disabled.
- o decision context preserva informações seguras do modelo, com forma semelhante ao MCS:
  - `context.modelRef`
  - `context.modelId`
  - `context.providerId`
  - `context.providerKind`
  - `context.baseURL`
- Na primeira etapa o interruptor não é decidido por model id/provider/source, mas os testes devem provar que a informação do modelo já é passada ao decision context.

Comando de teste:

```bash
pnpm --filter @zcode/core test -- runtime-embedded-search-capability.test.ts
```

Esperado:

- Os testes falham primeiro, indicando que o módulo ou a função não existe.

### 1.2 Implementar o helper de branch capability

Adicionar:

```text
apps/zcode-cli/packages/core/src/embedded-search/capability.ts
```

Exportar:

```ts
import type { ModelConnectionInfo, ModelConnectionPort, ModelRef } from "@zcode/contracts";

const ENABLE_EMBEDDED_SEARCH_BRANCH = true;

type SanitizedModelConnectionInfo = Omit<ModelConnectionInfo, "apiKey" | "headers">;

export interface EmbeddedSearchBranchCapabilityContext {
  bashAvailable: boolean;
  connection?: ModelConnectionInfo;
  embeddedSearchBranchEnabled?: boolean;
  modelRef: ModelRef;
}

export interface ResolvedEmbeddedSearchBranchCapabilityContext {
  baseURL?: string;
  connection?: SanitizedModelConnectionInfo;
  modelId: string;
  modelRef: ModelRef;
  providerId?: string;
  providerKind?: ModelConnectionInfo["providerKind"];
}

export type EmbeddedSearchBranchCapabilityReason =
  | "supported"
  | "disabled_by_global_flag"
  | "bash_unavailable";

export interface EmbeddedSearchBranchCapabilityDecision {
  context: ResolvedEmbeddedSearchBranchCapabilityContext;
  reason: EmbeddedSearchBranchCapabilityReason;
  useEmbeddedSearchBranch: boolean;
}

export function evaluateEmbeddedSearchBranchCapability(
  context: EmbeddedSearchBranchCapabilityContext,
): EmbeddedSearchBranchCapabilityDecision {
  const resolvedContext = resolveCapabilityContext(context);
  const branchEnabled =
    context.embeddedSearchBranchEnabled ?? ENABLE_EMBEDDED_SEARCH_BRANCH;

  if (!branchEnabled) {
    return {
      context: resolvedContext,
      reason: "disabled_by_global_flag",
      useEmbeddedSearchBranch: false,
    };
  }

  if (!context.bashAvailable) {
    return {
      context: resolvedContext,
      reason: "bash_unavailable",
      useEmbeddedSearchBranch: false,
    };
  }

  return {
    context: resolvedContext,
    reason: "supported",
    useEmbeddedSearchBranch: true,
  };
}

export function resolveEmbeddedSearchBranchCapability(input: {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
  modelConnectionPort?: ModelConnectionPort;
  modelRef: ModelRef;
}): EmbeddedSearchBranchCapabilityDecision {
  let connection: ModelConnectionInfo | undefined;
  try {
    connection = input.modelConnectionPort?.resolveConnection(input.modelRef);
  } catch {
    connection = undefined;
  }

  return evaluateEmbeddedSearchBranchCapability({
    bashAvailable: input.bashAvailable,
    connection,
    embeddedSearchBranchEnabled: input.embeddedSearchBranchEnabled,
    modelRef: input.modelRef,
  });
}

function resolveCapabilityContext(
  context: EmbeddedSearchBranchCapabilityContext,
): ResolvedEmbeddedSearchBranchCapabilityContext {
  return {
    baseURL: context.connection?.baseURL,
    connection: context.connection ? sanitizeModelConnectionInfo(context.connection) : undefined,
    modelId: context.connection?.model?.modelId ?? context.modelRef.modelId,
    modelRef: context.modelRef,
    providerId: context.connection?.providerId,
    providerKind: context.connection?.providerKind,
  };
}

function sanitizeModelConnectionInfo(
  connection: ModelConnectionInfo,
): SanitizedModelConnectionInfo {
  const { apiKey: _apiKey, headers: _headers, ...safeConnection } = connection;
  return safeConnection;
}
```

Ao estender para o branch por modelo mais adiante, só é permitido adicionar decisões dentro de `evaluateEmbeddedSearchBranchCapability`, por exemplo:

```ts
if (isEmbeddedSearchCapableModel(resolvedContext.modelId)) {
  return {
    context: resolvedContext,
    reason: "supported",
    useEmbeddedSearchBranch: true,
  };
}
```

Explicação:

- O helper recebe `modelRef`; hoje não liga/desliga por modelo e depois pode ser completado com um branch por modelo.
- `resolveEmbeddedSearchBranchCapability` tem a mesma forma do MCS: o ponto de chamada passa `modelConnectionPort` e `modelRef`, e o helper faz resolve/sanitize seguro da connection internamente.
- O flag global é a entrada de curto-circuito da primeira etapa; o runtime lê por padrão `ENABLE_EMBEDDED_SEARCH_BRANCH`, e testes e bench podem sobrescrever explicitamente via `embeddedSearchBranchEnabled`.
- A decisão do flag global não pode ser reescrita em cada prompt builder ou tool registry.
- Dentro do branch alvo o gate é uniformemente considerado habilitado e não pode ser adivinhado por provider/source/variant.
- O wording curto de prompt/tool do modelo padrão continua controlado pelo branch de prompt de modelo existente e não pode se misturar com a embedded search branch capability.
- O helper precisa ser uma função pura, para facilitar os testes e a reutilização na construção provider-visible.

### 1.3 Rodar os testes

Executar:

```bash
pnpm --filter @zcode/core test -- runtime-embedded-search-capability.test.ts
```

Esperado:

- Os testes de branch capability passam.

## Phase 2: ajustar prompt provider-visible e exposição de tools

### 2.1 Modificar a lógica de registro de built-in tools

Arquivo:

```text
apps/zcode-cli/packages/core/src/tool/handlers/index.ts
```

Objetivo:

- branch embutido: não registrar provider tools diretas `Glob` / `Grep`.
- branch direto: continuar registrando `Glob` / `Grep`.
- remover a lógica temporária de exclude baseada em comentário e passar a usar um parâmetro explícito.
- o main agent e o subagent Explore precisam reutilizar a mesma decisão de branch capability, para que um não esconda tools e o outro ainda exponha tools.

Forma da interface:

```ts
export interface RegisterBuiltInToolsOptions {
  embeddedSearchEnabled?: boolean;
}

export function registerBuiltInTools(
  registry: ToolRegistry,
  dependencies: BuiltInToolDependencies,
  options: RegisterBuiltInToolsOptions = {},
): void {
  const exposeDirectSearchTools = !options.embeddedSearchEnabled;

  if (exposeDirectSearchTools) {
    registry.register(globToolEntry(dependencies));
    registry.register(grepToolEntry(dependencies));
  }
}
```

Pontos de aceite:

- O comportamento não é mais controlado por "comentar a lógica de exclude".
- O comportamento de registro é determinado apenas por `embeddedSearchEnabled`.
- O `tools[]` final do branch embutido padrão não contém `Glob` / `Grep`.

### 2.2 Modificar o branch do prompt do Bash

Arquivo:

```text
apps/zcode-cli/packages/core/src/tool/handlers/bash-prompt.ts
```

Objetivo:

- contrato exato do branch embutido: a lista de avoid não contém `find` / `grep` e mantém apenas ``cat``, ``head``, ``tail``, ``sed``, ``awk``, or ``echo```.
- branch direto: manter a regra atual do ZCode de "evitar rodar find/grep/cat/head/tail/sed/awk/echo no Bash".

Interface sugerida:

```ts
export interface BuildBashPromptOptions {
  embeddedSearchEnabled?: boolean;
}

export function buildBashPrompt(options: BuildBashPromptOptions = {}): string {
  const avoidTools = options.embeddedSearchEnabled
    ? "`cat`, `head`, `tail`, `sed`, `awk`, or `echo`"
    : "`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`";

  return `... ${avoidTools} ...`;
}
```

Pontos de aceite:

- Para o branch embutido padrão, o prompt do Bash não desaconselha mais o modelo a evitar `find` / `grep`.
- Para o branch embutido padrão, a lista de avoid do prompt do Bash contém exatamente ``cat``, ``head``, ``tail``, ``sed``, ``awk``, or ``echo```.
- O branch direto não é afetado.

### 2.3 Modificar a descrição da ferramenta Agent principal

Arquivo:

```text
apps/zcode-cli/packages/core/src/tool/handlers/agent.ts
```

Objetivo:

- branch embutido: a descrição de Agent/Task não afirma que o subagent possui direct tools `Glob` / `Grep`.
- branch direto: continuar listando `Glob` / `Grep`.
- a descrição do Explore no branch embutido não pode vazar direct tools como `(Tools: Glob, Grep, Read, Bash, WebFetch, WebSearch, TodoWrite)`.

Pontos de aceite:

- O tool schema provider-visible do branch embutido padrão não contém direct tools Glob/Grep.
- A descrição da ferramenta Agent também não contém "Tools: Glob, Grep".

### 2.4 Modificar o prompt e as tools permitidas do subagent Explore

Arquivo:

```text
apps/zcode-cli/packages/core/src/subagent/explore.ts
```

Objetivo:

- branch embutido:
  - as tools permitidas não contêm `Glob` / `Grep`.
  - o prompt usa exatamente `Use \`find\` via Bash for broad file pattern matching`.
  - o prompt usa exatamente `Use \`grep\` via Bash for searching file contents with regex`.
  - a lista de comandos Bash read-only permite `find` e `grep`.
- branch direto:
  - as tools permitidas contêm `Glob` / `Grep`.
  - o prompt usa formulações de `Glob` / `Grep` diretos.

Interface sugerida:

```ts
export interface BuildExploreSubagentOptions {
  embeddedSearchEnabled?: boolean;
}

export function buildExploreAllowedTools(options: BuildExploreSubagentOptions = {}): string[] {
  const baseTools = ["Bash", "Read", "WebFetch", "WebSearch", "TodoWrite"];

  if (options.embeddedSearchEnabled) {
    return baseTools;
  }

  return ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"];
}
```

Pontos de aceite:

- A presença ou não de Glob/Grep no Explore é inteiramente decidida pelo branch.
- Os comentários no arquivo deixam explícito que a exposição direta de Glob/Grep é comportamento do branch non-embedded.
- A lista de comandos Bash read-only do Explore contém `find, grep` no branch embutido.

### 2.5 Modificar o prompt do plan mode

Arquivo:

```text
apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts
```

Objetivo:

- branch embutido: fazer o prompt do Plan usar ``find``, ``grep``, and Read`` para encontrar patterns/conventions.
- branch direto: continuar usando `${GLOB_TOOL_NAME}` / `${GREP_TOOL_NAME}`.

Pontos de aceite:

- O plan prompt provider-visible do branch embutido padrão não contém orientação de Glob/Grep direto.

### 2.6 Modificar a lista de dedicated-tools da orientação do main system

Arquivo:

```text
apps/zcode-cli/packages/core/src/context/dynamic-sections.ts
```

Objetivo:

- a lista de dedicated-tools de `# Using your tools` do branch embutido não contém Glob/Grep.
- somente o branch direto pode exibir a orientação de dedicated tools Glob/Grep.
- se essa section não estiver habilitada no prompt compacto atual, completar mesmo assim o branch no nível de helper e os testes, evitando drift quando ela for aberta no futuro.

Pontos de aceite:

- A orientação do main system do branch embutido padrão não emite mais a sugestão de "usar direct tools Glob/Grep".
- A orientação de dedicated tools existente do branch direto não é removida por engano.

### 2.7 Modificar o fallback do session guidance

Arquivo:

```text
apps/zcode-cli/packages/core/src/context/dynamic-sections.ts
```

Objetivo:

- se o session guidance atual ainda construir o fallback de exploração ampla, o branch embutido usa exatamente as seguintes strings:
  - ``find`` or ``grep`` via the Bash tool
- o branch direto usa exatamente:
  - the Glob or Grep

Pontos de aceite:

- não pode mais existir drift com `Glob or Grep` sem o `the` ou `via Bash` sem o `the Bash tool`.
- Se a section estiver desabilitada no prompt compacto, os testes mantêm a cobertura no nível de helper para evitar drift quando ela for habilitada depois.

### 2.8 Atualizar os testes provider-visible

Modificar:

```text
apps/zcode-cli/packages/core/tests/tool-contracts.test.ts
apps/zcode-cli/packages/core/tests/context-builder.test.ts
```

Novas asserções:

- branch embutido padrão:
  - `tools[].name` não contém `Glob` / `Grep`.
  - o prompt do Bash não contém "avoid find/grep".
  - a lista de avoid do prompt do Bash contém exatamente ``cat``, ``head``, ``tail``, ``sed``, ``awk``, or ``echo``` e não contém `find` / `grep`.
  - a lista de dedicated-tools de `# Using your tools` do main não contém Glob/Grep.
  - o fallback de session do main contém ``find`` or ``grep`` via the Bash tool``.
  - a orientação do Explore contém exatamente `Use \`find\` via Bash for broad file pattern matching`.
  - a orientação do Explore contém exatamente `Use \`grep\` via Bash for searching file contents with regex`.
  - a lista Bash read-only do Explore contém `find, grep`.
  - o prompt do Plan contém ``find``, ``grep``, and Read``.
  - a descrição da ferramenta Agent não contém `Tools: Glob, Grep`.
- branch direto:
  - `tools[].name` contém `Glob` / `Grep`.
  - a short description de Glob/Grep continua atendendo à baseline de contrato do branch direto.

Executar:

```bash
pnpm --filter @zcode/core test -- tool-contracts.test.ts context-builder.test.ts
```

Esperado:

- Os testes provider-visible passam.

## Phase 3: adicionar o backend de embedded search internal-cli

### 3.1 Escrever os testes do backend internal-cli

Adicionar:

```text
apps/zcode-cli/packages/cli/tests/internal-search.test.ts
```

Cobertura de testes:

- `grep pattern file` imprime as linhas reais que casam no `grep`.
- argumentos reais de `grep` como `grep -e pattern file` não podem ser rejeitados pelo shim do ZCode.
- `grep -Rni --include "*.ts" --exclude-dir ignored pattern .` é repassado ao `grep` real.
- entradas de pipe por stdin como `cat file | grep pattern` devem ser preservadas.
- `find . -name "*.ts"` imprime os arquivos reais que casam no `find`.
- predicates reais do `find` como `find . -type f -name "*.ts" -print` não podem ser rejeitados pelo shim do ZCode.
- o stderr e o exit code de predicate/flag inválidos vêm do comando real, e não de textos privados de unsupported do ZCode.

Executar:

```bash
pnpm --filter @zcode/cli test -- internal-search.test.ts
```

Esperado:

- Os testes falham primeiro, indicando que o módulo não existe ou que o comando não foi conectado.

### 3.2 Definir a spec de lançamento do backend

Adicionar ou colocar em um arquivo de tipos compartilhado:

```ts
export type EmbeddedSearchBackendKind = "internal-cli" | "argv0-dispatch";

export interface EmbeddedSearchBackend {
  kind: EmbeddedSearchBackendKind;
  command: string;
  args?: string[];
}
```

Restrições:

- `internal-cli` é o backend realmente habilitado na primeira versão.
- `argv0-dispatch` é a porta de backend de auto-dispatch de binário único para o futuro; na primeira versão só se exige que o construtor de prelude consiga gerar a string, sem exigir que o subcomando de runtime funcione de forma completa.
- O handler de Bash, a ExecutionRequest e os testes do adapter só podem passar `EmbeddedSearchBackend`, sem espalhar strings `__internal-search`.

### 3.3 Implementar o shim transparente de passthrough nativo

Adicionar:

```text
apps/zcode-cli/packages/cli/src/internal-search/embedded-search-cli.ts
```

Exportar:

```ts
export type EmbeddedSearchCommand = "grep" | "find";

export interface EmbeddedSearchIo {
  cwd: string;
  stdin?: NodeJS.ReadableStream;
  stdout: { write(chunk: string | Uint8Array): void };
  stderr: { write(chunk: string | Uint8Array): void };
}

export async function runEmbeddedSearchCli(argv: string[], io: EmbeddedSearchIo): Promise<number>;
```

Estratégia de implementação:

- O backend interno da primeira versão não pode fazer parse manual de um subconjunto de argumentos de `find` / `grep`; o modelo gera argumentos de comando reais, e o parse de subconjunto causaria degradação de comportamento.
- `__internal-search grep ...` é repassado ao `grep` real do host via `spawn("grep", argv)`.
- `__internal-search find ...` é repassado ao `find` real do host via `spawn("find", argv)`.
- stdin, stdout, stderr, cwd e exit code devem ser preservados conforme a semântica do comando real.
- Todos os argumentos suportados pelo comando real devem ser repassados; o shim do ZCode apenas valida que o primeiro subcomando é `find` ou `grep`.
- Se mais adiante for necessário oferecer capacidades consistentes entre plataformas, deve-se trocar o backend para bundled `bfs` / `ugrep` ou `argv0-dispatch`, sem voltar ao parse manual de subconjunto de argumentos.

Explicação:

- Isso não é uma diferença provider-visible; o modelo continua vendo apenas `find` / `grep` no Bash.
- As diferenças em relação ao backend bundled `bfs` / `ugrep` ficam registradas na documentação.

### 3.5 Conectar o dispatch do CLI

Modificar:

```text
apps/zcode-cli/packages/cli/src/run.ts
```

Objetivo:

- suportar comandos internos:

```bash
zcode __internal-search grep ...
zcode __internal-search find ...
```

Pontos de aceite:

- o caminho de uso normal do CLI não muda.
- o comando interno não inicializa um runtime de agent interativo completo.
- o comando interno não imprime mensagem de boas-vindas, banner de versão ou textos de debug.
- esse comando aparece apenas como detalhe de implementação do backend com `EmbeddedSearchBackend.kind === "internal-cli"`.

Executar:

```bash
pnpm --filter @zcode/cli test -- internal-search.test.ts
```

Esperado:

- Os testes do backend internal-cli passam.

## Phase 4: manter o código de suporte do prelude find/grep do Bash (atualmente sem injeção)

### 4.1 Estender o contrato de execution

Modificar:

```text
apps/zcode-cli/packages/contracts/src/interfaces/execution.port.ts
```

Adicionar:

```ts
export type EmbeddedSearchBackendKind = "internal-cli" | "argv0-dispatch";

export interface EmbeddedSearchBackend {
  kind: EmbeddedSearchBackendKind;
  command: string;
  args?: string[];
}

export interface ExecutionEmbeddedSearchPrelude {
  kind: "embedded-search";
  backend: EmbeddedSearchBackend;
}
```

Adicionar em `ExecutionRequest`:

```ts
bashPrelude?: ExecutionEmbeddedSearchPrelude;
```

Restrições:

- o adapter só pode usar isso quando `command.mode === "shell"` e `shellProfile === "posix-bash"`.
- é completamente sem efeito para `execFile`, shells que não sejam Bash e mode que não seja shell.

### 4.2 Escrever os testes do prelude

Adicionar:

```text
apps/zcode-cli/packages/adapters/tests/embedded-search-prelude.test.ts
```

Cobertura de testes:

- a saída contém `unalias find` / `unalias grep`.
- a saída contém a shell function `find()`.
- a saída contém a shell function `grep()`.
- command e args passam por shell quote.
- o backend `internal-cli` gera `command <backend> find "$@"` / `command <backend> grep "$@"`.
- o backend `argv0-dispatch` gera shell functions na forma `ARGV0=bfs` / `ARGV0=ugrep`.
- o comando do usuário é concatenado depois do prelude.
- sem `bashPrelude`, o comando não muda.

Executar:

```bash
pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts
```

Esperado:

- Os testes falham primeiro, indicando que o módulo não existe.

### 4.3 Implementar o helper de prelude

Adicionar:

```text
apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts
```

Exportar:

```ts
import type { ExecutionEmbeddedSearchPrelude } from "@zcode/contracts";

export function applyEmbeddedSearchPrelude(
  command: string,
  prelude?: ExecutionEmbeddedSearchPrelude,
): string {
  if (!prelude || prelude.kind !== "embedded-search") {
    return command;
  }

  const findFunction = buildEmbeddedSearchFunction("find", prelude.backend);
  const grepFunction = buildEmbeddedSearchFunction("grep", prelude.backend);

  return [
    "unalias find 2>/dev/null || true",
    "unalias grep 2>/dev/null || true",
    findFunction,
    grepFunction,
    command,
  ].join("\n");
}
```

O backend `internal-cli` gera:

```bash
find() { command zcode __internal-search find "$@"; }
grep() { command zcode __internal-search grep "$@"; }
```

O backend `argv0-dispatch` fica reservado para gerar:

```bash
find() { ARGV0=bfs command zcode -S dfs -regextype findutils-default "$@"; }
grep() { ARGV0=ugrep command zcode -G --ignore-files --hidden -I "$@"; }
```

Atenção:

- o helper de shell quote pode reutilizar a função de quote interna já existente no adapter; se não existir, criar uma `shellQuote` privada e testar por completo o escape de aspas simples.
- o uso de `command <invocação do backend com quote>` no `internal-cli` evita recursão da shell function.
- o `argv0-dispatch` na primeira versão é mantido apenas como porta de extensão de backend; sem suporte real de runtime, ele não é habilitado no runtime config.
- esse helper não é responsável por decidir a branch capability; ele só faz transformação de string.

### 4.4 Conectar ao NodeExecutionAdapter (somente para requisições com prelude)

Modificar:

```text
apps/zcode-cli/packages/adapters/src/exec/index.ts
apps/zcode-cli/packages/adapters/src/exec/cwd-capture.ts
```

Ordem de conexão:

1. Só gerar o comando com prelude envolvido quando o chamador passar explicitamente `ExecutionRequest.bashPrelude` e `shellProfile === "posix-bash"`.
2. Depois executar o wrapping de captura de cwd.
3. Depois entregar a `resolveExecutionCommand`.

Motivo:

- a captura de cwd precisa capturar o cwd final após a execução do comando do usuário.
- o prelude é conteúdo de inicialização do shell e deve valer antes do comando do usuário.

Atualizar os testes:

```text
apps/zcode-cli/packages/adapters/tests/exec.test.ts
```

Novos cases:

- no shell command `grep foo file.txt`, o comando real só contém a injeção de function quando existe `bashPrelude`.
- com captura de cwd e prelude habilitados ao mesmo tempo, o marker de captura de cwd continua depois do comando do usuário.

Executar:

```bash
pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts exec.test.ts
```

Esperado:

- Os testes do adapter passam.

## Phase 5: propagar a branch capability até o runtime e o handler de Bash

### 5.1 Adicionar o backend de embedded search à configuração do runtime

Modificar:

```text
apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts
apps/zcode-cli/packages/core/src/tool/executor/types.ts
```

Objetivo:

- o runtime config carrega:

```ts
embeddedSearchBackend?: {
  kind: "internal-cli" | "argv0-dispatch";
  command: string;
  args?: string[];
};
```

Ao iniciar o runtime, o CLI preenche:

```ts
{
  kind: "internal-cli",
  command: process.execPath,
  args: [resolvedCliEntryPath, "__internal-search"],
}
```

No cenário SEA/packaged, preenche:

```ts
{
  kind: "internal-cli",
  command: process.execPath,
  args: ["__internal-search"],
}
```

Requisitos de implementação:

- o modo dev Node e o modo de binário empacotado são distinguidos pelas informações de bootstrap do CLI já existentes.
- não adivinhar `process.argv` diretamente dentro do core.
- se não for possível construir o backend, a branch capability não injeta o prelude de runtime mesmo que esteja enabled, e registra o motivo em nível de debug.
- a primeira versão passa de fato `internal-cli`; `argv0-dispatch` é apenas a interface estável para substituir o backend depois.
- as deps de `createToolExecutor(...)` recebem `embeddedSearchBackend`, fornecido pelo runtime config.

### 5.2 Propagar a branch capability no ToolExecutionContext

Modificar:

```text
apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts
apps/zcode-cli/packages/core/src/tool/types.ts
```

Objetivo:

- calcular uma vez por tool call:

```ts
const embeddedSearchDecision = resolveEmbeddedSearchBranchCapability({
  bashAvailable: registry.has("Bash"),
  modelConnectionPort: deps.modelConnectionPort,
  modelRef,
});
```

- passar para `ToolExecutionContext`:

```ts
embeddedSearch: {
  enabled: embeddedSearchDecision.useEmbeddedSearchBranch,
  backend: deps.embeddedSearchBackend,
}
```

Pontos de aceite:

- a construção provider-visible e a execução de runtime usam o mesmo helper de branch capability.
- a branch capability provider-visible não depende do kind do backend.
- não repetir a decisão de modelo dentro de cada prompt builder.

### 5.3 O handler de Bash não define bashPrelude por enquanto

Modificar:

```text
apps/zcode-cli/packages/core/src/tool/handlers/bash.ts
```

Objetivo:

- o branch de embedded search provider-visible ainda pode ser ligado, mas o handler de Bash atualmente não constrói:

```ts
bashPrelude: {
  kind: "embedded-search",
  backend: context.embeddedSearch.backend,
}
```

- mesmo com `context.embeddedSearch.enabled === true` e backend presente, não passar `bashPrelude` para o adapter por enquanto.
- deixar o shell local do usuário executar `find` / `grep` diretamente; em CMD ou quando faltar o comando, deixar o erro do Bash adaptar o modelo.
- manter os tipos de prelude, o helper do adapter e o código do backend, para restauração futura por interruptor.

Adicionar comentário em chinês:

```ts
// 临时策略：provider-visible embedded branch 保持开启，但执行层先不注入
// find()/grep() function，直接依赖用户本地 shell 的 find/grep。
```

Atualizar os testes:

```text
apps/zcode-cli/packages/core/tests/bash-handler.test.ts
```

Novos cases:

- embedded enabled + backend presente: a ExecutionRequest não contém `bashPrelude`.
- embedded enabled + backend ausente: a ExecutionRequest não contém `bashPrelude` e não lança erro.
- embedded disabled: a ExecutionRequest não contém `bashPrelude`.

Executar:

```bash
pnpm --filter @zcode/core test -- bash-handler.test.ts
```

Esperado:

- Os testes do handler de Bash passam.

### 5.4 Usar a branch capability no registro de tools

Modificar:

```text
apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts
```

Objetivo:

- ao inicializar o registry no runtime:

```ts
const builtInToolAllowlist = resolveBuiltInToolAllowlist(this.config);
const bashAvailableForBuiltIns =
  builtInToolAllowlist === undefined || builtInToolAllowlist.includes("Bash");

const embeddedSearchDecision = resolveEmbeddedSearchBranchCapability({
  bashAvailable: bashAvailableForBuiltIns,
  modelConnectionPort: this.modelConnectionPort,
  modelRef: this.defaultModelRef,
});

registerBuiltInTools(registry, dependencies, {
  embeddedSearchEnabled: embeddedSearchDecision.useEmbeddedSearchBranch,
});
```

Pontos de aceite:

- não chamar `registry.has("Bash")` antes do registro das built-ins para julgar a disponibilidade do Bash.
- o branch embutido padrão não expõe direct tools Glob/Grep.
- com o flag global disabled ou o Bash indisponível, o comportamento atual de Glob/Grep direto é preservado.

## Phase 6: verificação ponta a ponta

### 6.1 Verificação do snapshot provider-visible

Adicionar ou atualizar os testes:

```text
apps/zcode-cli/packages/core/tests/tool-contracts.test.ts
```

Asserções:

- model `claude-opus-4-8-cc`:
  - as tools não contêm `Glob` / `Grep`.
  - a descrição do Bash não desaconselha `find` / `grep`.
  - a embedded avoid list exata da descrição do Bash é ``cat``, ``head``, ``tail``, ``sed``, ``awk``, or ``echo``` e não contém `find` / `grep`.
  - o dedicated-tool guidance do main system não contém Glob/Grep.
  - o fallback de session é ``find`` or ``grep`` via the Bash tool``.
  - a descrição do Agent não vaza `Tools: Glob, Grep`.
  - o prompt do Explore usa exatamente as duas linhas com `find` / `grep` do Bash.
  - as tools permitidas do Explore não contêm `Glob` / `Grep`.
  - o prompt do Plan usa ``find``, ``grep``, and Read``.
- flag global disabled:
  - Glob/Grep direto ainda pode aparecer.
  - os testes de branch direto de description/schema do Glob/Grep mantêm as restrições atuais.
- Bash indisponível:
  - Glob/Grep direto ainda pode aparecer.
  - o prompt provider-visible não entra no branch de embedded search.

Executar:

```bash
pnpm --filter @zcode/core test -- tool-contracts.test.ts context-builder.test.ts
```

Esperado:

- Os testes provider-visible passam.

### 6.2 Verificação de smoke do runtime

Prioridade de localização dos novos testes:

1. `apps/zcode-cli/packages/adapters/tests/exec.test.ts`
2. se for necessário um shim de CLI completo, colocar em `apps/zcode-cli/packages/cli/tests/internal-search.test.ts`

Construir um diretório temporário:

```text
tmp/
  src/a.ts       // contém "needle"
  src/b.ts       // sem match
  README.md      // contém "needle"
```

Comandos de verificação:

```bash
grep -n needle src/a.ts
find . -name "*.ts"
```

Esperado:

- o `grep` retorna a saída do shim interno.
- o `find` retorna a saída do shim interno.
- o exit code é consistente com a semântica comum de grep/find:
  - match: 0
  - sem match: 1
  - erro de uso/unsupported: 2

### 6.3 Comandos de teste completos

Executar:

```bash
pnpm --filter @zcode/core test -- runtime-embedded-search-capability.test.ts tool-contracts.test.ts context-builder.test.ts bash-handler.test.ts
pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts exec.test.ts
pnpm --filter @zcode/cli test -- internal-search.test.ts
pnpm --filter @zcode/core typecheck
pnpm --filter @zcode/core lint
pnpm --filter @zcode/adapters typecheck
pnpm --filter @zcode/adapters lint
pnpm --filter @zcode/cli typecheck
pnpm --filter @zcode/cli lint
```

Esperado:

- Todos os comandos passam.
- Se o package do CLI não tiver script próprio de `typecheck` / `lint`, registrar a situação real do package.json e executar os comandos alternativos no nível raiz:

```bash
pnpm typecheck
pnpm lint
```

## Phase 7: encerramento e commit

### 7.1 Revisar o diff

Executar:

```bash
git diff -- docs/plan/trajectory/embedded-search-provider-visible.md apps/zcode-cli/packages/core apps/zcode-cli/packages/adapters apps/zcode-cli/packages/cli apps/zcode-cli/packages/contracts
```

Checklist:

- o wording provider-visible é coerente com o objetivo do branch.
- o helper de branch capability não tem decisões duplicadas e espalhadas.
- as direct tools Glob/Grep não foram removidas, apenas expostas conforme o branch.
- o prelude do Bash não é injetado pelo handler de Bash; o adapter só afeta a requisição de shell Bash quando recebe `bashPrelude` explicitamente.
- a internal search do CLI não imprime banners extras.
- os testes cobrem o wording exato, a exposição de tools e a estratégia de runtime sem prelude.
- a documentação registra os trade-offs de implementação da primeira versão.

### 7.2 Não fazer Stage / Commit nesta rodada

O usuário já acrescentou o requisito: ao concluir, não fazer commit, push nem stage automaticamente. Na execução real, manter apenas as alterações da árvore de trabalho sem stage, para review do usuário.

### 7.3 Verificação final do diff sem stage

Executar:

```bash
git diff --stat
git diff
```

Confirmar:

- nenhum arquivo de dump de requisição provider-visible foi incluído.
- nenhuma formatação alheia foi misturada.
- nenhum arquivo de UI ou de remote control foi modificado.

### 7.4 Rascunho de commit (não executar nesta rodada)

Se o usuário, após o review, pedir explicitamente o commit, a mensagem pode ser:

```text
Switches ZCode's default provider-visible surface to the embedded search branch.

Keeps CMD and legacy shell fallback on the direct Glob/Grep branch, while Bash find/grep are routed through an embedded search backend for supported POSIX shells.

Verification:
- pnpm --filter @zcode/core test -- runtime-embedded-search-capability.test.ts tool-contracts.test.ts context-builder.test.ts bash-handler.test.ts
- pnpm --filter @zcode/adapters test -- embedded-search-prelude.test.ts exec.test.ts
- pnpm --filter @zcode/cli test -- internal-search.test.ts
- pnpm --filter @zcode/core typecheck
- pnpm --filter @zcode/core lint
- pnpm --filter @zcode/adapters typecheck
- pnpm --filter @zcode/adapters lint
- pnpm --filter @zcode/cli typecheck
- pnpm --filter @zcode/cli lint
```

## Plano de rollback

Se o bench ou o smoke de runtime mostrar que o branch de embedded search causa regressão:

1. Definir temporariamente `ENABLE_EMBEDDED_SEARCH_BRANCH` como `false`, mantendo o código e desligando a entrada padrão.
2. Se for necessário reverter por completo:

```bash
git revert <commit-sha>
```

3. Após o rollback, executar novamente:

```bash
pnpm --filter @zcode/core test -- tool-contracts.test.ts context-builder.test.ts bash-handler.test.ts
pnpm --filter @zcode/adapters test -- exec.test.ts
```

## Critérios de aceite

- A requisição provider-visible padrão não expõe direct tools Glob/Grep.
- O prompt do Bash padrão não desaconselha mais o modelo a evitar `find` / `grep` no Bash.
- O prompt do Explore, o prompt do Plan e a descrição do Agent usam o wording de `find` / `grep` no Bash.
- A requisição provider-visible do fallback CMD / shell legado expõe direct tools Glob/Grep.
- O runtime do Bash, no branch embutido padrão, chama o backend de embedded search do ZCode pela function injetada.
- O branch de fallback direto Glob/Grep é mantido e passa nos testes existentes de description/schema.
- Todas as novas decisões de branch estão concentradas em `embedded-search-capability.ts`, sem decisões espalhadas por provider/source.
- `internal-cli` é apenas a estratégia de backend da primeira versão e pode ser trocada no futuro por `argv0-dispatch`.
- A documentação registra o comportamento alvo do branch de embedded search e os trade-offs de implementação da primeira versão.
- Os testes direcionados, o typecheck e o lint passam todos.