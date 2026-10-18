# Embedded Search Branch

## Objetivo

O ZCode habilita por padrão o embedded search branch: em provider-visible, Glob/Grep diretos ficam ocultos por padrão, e o prompt orienta a usar `find` / `grep` via Bash; na camada de runtime, um Bash prelude assume `find` / `grep`.
No Windows CMD e no fallback de shell legado, o embedded branch não é habilitado por enquanto, voltando ao Glob/Grep direto, para evitar que o texto provider-visible afirme a existência de uma function do Bash quando a runtime não consegue injetá-la.

## Comportamento-alvo do Branch

- Entra-se no embedded search branch quando o gate de embedded search está ligado e o Bash está disponível.
- Na inicialização do Bash são injetadas as functions `find` / `grep`, executadas pelo embedded search backend (na forma bundled, distribuídas para `bfs` / `ugrep`).
- O shell snapshot verifica a disponibilidade de `rg`: a function ou alias embedded de `rg` só é complementada quando o `rg` do sistema ainda não for encontrado após `unalias rg`. `rg` é um preenchimento de lacuna, diferente do shadow forçado de `find` / `grep`.
- A function `grep` usa por padrão `ugrep` com `-G --ignore-files --hidden -I`, excluindo `.git/.svn/.hg/.bzr/.jj/.sl`; ao encontrar `-*-filter*`, `-*-pager*`, `-*-view*`, `-*-format-open*`, `-*-config*`, `---*`, `-@*`, `-*-save-config*`, volta ao `grep "$@"` do sistema.
- A shell function verifica se o binário interno é executável; quando não está disponível, faz degrade para o `find` / `grep "$@"` do sistema.
- No Windows, as embedded search functions só são injetadas em shells POSIX como Git Bash/MSYS/Cygwin; ao encontrar `msys` / `cygwin` / `win32`, a chamada usa a forma `ARGV0=... "<binary>"`, evitando depender de `exec -a`.
- O shell snapshot no Windows converte caminhos de host como binário interno, arquivo de snapshot e arquivo de captura de cwd para a forma `/c/...` ou `//server/...` reconhecível pelo Git Bash, e filtra os aliases `winpty` gerados automaticamente pelo Git Bash.
- No embedded branch, o `tools[]` provider-visible não expõe `Glob` / `Grep` direto.
- No embedded branch, a avoid list da descrição do Bash não contém `find` / `grep`; os itens restantes exatos são ``cat``, ``head``, ``tail``, ``sed``, ``awk``, or ``echo``.
- No embedded branch, o prompt Explore usa:
  - `Use \`find\` via Bash for broad file pattern matching`
  - `Use \`grep\` via Bash for searching file contents with regex`
- No embedded branch, o prompt Plan usa ``find``/Glob, ``grep``/Grep, and Read para localizar padrões/convenções。
- A descrição das tools diretas Glob/Grep tem ainda ramos separados de prompt short/long, escolhidos por modelo; isso não equivale ao gate de embedded search.
- O request provider-visible do embedded branch tem como evidência os testes de contrato; a descrição short de Glob/Grep do branch direto é validada separadamente por um baseline de contrato dedicado.

## Estratégia de Implementação no ZCode

A implementação foi dividida em três camadas:

- branch capability: `evaluateEmbeddedSearchBranchCapability` / `resolveEmbeddedSearchBranchCapability` sensíveis ao modelo, com forma derivada dos MCS capability helper. Atualmente a flag global padrão é ligada; depois pode-se decidir na mesma função se habilita por modelo ou runtime gate.
- Bash prelude builder: gera as shell functions `find()` / `grep()` a partir do backend e complementa a function `rg()` quando o ambiente do usuário não tem `rg`.
- embedded search backend: a primeira versão usa `internal-cli` para encaminhar transparentemente ao `find` / `grep` reais do ambiente do host; no futuro pode migrar para `argv0-dispatch` (um único binário distribuindo `bfs` / `ugrep` por `ARGV0`).

## Limites da Implementação Atual

- O capability helper fica em `apps/zcode-cli/packages/core/src/embedded-search/capability.ts`, compartilhado por runtime e tool executor, evitando que a camada de tool dependa inversamente de helpers do runtime.
- O bootstrap injeta por padrão o backend `internal-cli`; a command do backend da primeira fase pode ser sobrescrita com `ZCODE_EMBEDDED_SEARCH_COMMAND`.
- O `internal-cli` não faz parsing manual de subconjunto de argumentos de `find` / `grep`; ele repassa por padrão argv, stdin, stdout, stderr e exit code, evitando que o shim do ZCode rejeite argumentos reais gerados pelo modelo.
- O `internal-cli rg` reaproveita a dependência WASM do `ripgrep` para executar os argumentos reais de `rg`, e só é complementado pelo prelude quando não há `rg` disponível no shell; ele não é substituto de `grep` nem muda o contrato provider-visible da tool `Grep`.
- A shell function `grep` volta primeiro ao `grep "$@"` do sistema conforme a lista de bypass acima; o `internal-cli grep` também mantém o mesmo conjunto de bypass, garantindo que a chamada direta ao backend ainda não injete os argumentos padrão.
- O `grep` do `internal-cli` implementa de baixo custo o controle de ruído padrão do embedded branch: em cenários sem argumentos especiais, prefixa `-G -I --exclude-dir=.git --exclude-dir=.svn --exclude-dir=.hg --exclude-dir=.bzr --exclude-dir=.jj --exclude-dir=.sl`.
- O embedded search branch provider-visible é independente do suporte a shell prelude; mesmo que a seleção de shell seja CMD, main e Explore continuam ocultando Glob/Grep direto no embedded branch.
- A injeção do Bash prelude no runtime é ligada por padrão para seleção de shell POSIX e Git Bash no Windows; CMD / fallback de shell legado não injetam POSIX function.
- A conversão de caminho do prelude de Git Bash no adapter é usada quando há injeção do prelude de Git Bash, garantindo que a command do backend e argumentos de caminho absoluto do Windows sejam convertidos em caminhos do Git Bash.
- Por padrão, as tools runtime provider-visible de main e Explore não expõem Glob/Grep direto no embedded branch; só voltamos ao Glob/Grep direto quando o embedded branch está desligado ou o Bash está indisponível.
- O request de Bash só carrega `bashPrelude` quando `embeddedSearch.enabled === true`, existe backend e a seleção de shell da sessão suporta injeção de prelude de runtime.
- O backend `internal-cli` do Bash prelude verifica primeiro se a command do backend é executável; se não estiver disponível, a shell function degrada para o `find` / `grep "$@"` do sistema.
- O `argv0-dispatch` já está reservado no contrato do prelude, com os argumentos padrão completos `ugrep -G --ignore-files --hidden -I --exclude-dir=...`; o padrão atual continua sendo `internal-cli`.

## Limites do Contrato Provider-Visible de Tools

Nesta rodada a linha de base é o teste de contrato do provider-visible tool contract, e não os registros de requisição exportados localmente; o fixture provider-visible exportado serve apenas como evidência de regressão. As ferramentas dentro da partição de ordenação são ordenadas por `name.localeCompare(...)`, e o Glob/Grep direto é pulado na lista de candidatos do embedded search branch.

Nesta rodada ajustam-se apenas as superfícies provider-visible que o ZCode já suporta:

- `AskUserQuestion`: atualiza o input schema provider-visible.
- `Bash`: usa a descrição curta do embedded search branch; esse ramo não tem `find` / `grep` na avoid list, e o texto de timeout usa o padrão `120000` e o máximo `600000`. O valor padrão de timeout em runtime está fora do escopo desta rodada.
- `Read`: não adiciona parâmetros provider-visible como `pages` que o ZCode não suporta; apenas atualiza o texto de capacidades já suportadas no prompt curto.
- `EnterPlanMode`: usa o prompt curto. No embedded search branch o texto das ferramentas de exploração usa ``find``/Glob、``grep``/Grep、Read。
- `ExitPlanMode`: mantém a ausência atual de sistema de plan file no ZCode, com schema que ainda exige que o modelo passe o parâmetro `plan`; usa a estrutura e a semântica do prompt curto dentro desse limite.
- `WebFetch`: usa o prompt curto.
- `WebSearch`: atualiza o input schema provider-visible.
- Ordem das ferramentas: a partição de ordenação contém apenas as ferramentas já registradas pelo ZCode; as ferramentas dentro da partição (inclusive as incluídas por convenção local) são ordenadas por `name.localeCompare(...)`, e as demais são acrescentadas ao final na ordem relativa de registro/filtro local.

`TodoRead` / `TodoWrite` entram na partição de ordenação por convenção local e são ordenadas pelo próprio nome; isso não mapeia para o slot de ordenação `Task*` e não significa que o ZCode tenha implementado a semântica de task-store baseada em id do `Task*`.

## Trade-offs de Implementação

- O gate atual não distingue provider/source/variant e trata tudo uniformemente como habilitado.
- A primeira versão do embedded branch não usa um binário de auto-dispatch `ARGV0=bfs/ugrep`, e sim o backend `internal-cli` para reduzir o custo de implementação; a capacidade de argumentos não é reduzida, acompanha o `find` / `grep` reais do host e ganha as exclusões padrão de baixo custo do `grep`, o `-I`, o `-G`, o bypass de argumentos especiais e o fallback do prelude.
- `internal-cli` é estratégia de implementação, não fato arquitetural; o nome da fronteira pública é `EmbeddedSearchBackend`.
- O CMD hoje segue intencionalmente o branch non-embedded/direct. Caso se queira suportar depois shells não POSIX como PowerShell/CMD, é preciso projetar separadamente o texto provider-visible e o shim de runtime, sem poder reaproveitar o prelude de functions do Bash.
- O ZCode não adiciona por enquanto registro padrão de `Cron*`, `EnterWorktree`, `ExitWorktree`, `LSP`, `NotebookEdit`, `ScheduleWakeup`, `Task*`, `Workflow`.
- O `ExitPlanMode` ainda não implementa leitura de plan file, então o prompt exige explicitamente o parâmetro `plan`.