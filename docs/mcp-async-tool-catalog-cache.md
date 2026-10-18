# Inicialização Assíncrona de MCP e Cache do Tool Catalog

## Status

- Fase: planejamento
- Escopo: Agent runtime, adaptador MCP, tool registry / executor, dependências de bootstrap em nível de processo
- Objetivo: introduzir um cache de tool catalog em nível de processo, para que novas sessions que acertem o cache possam disparar a primeira requisição ao modelo antes que a inicialização MCP live seja concluída
- Não-objetivos: não implementar LRU de servidores/clientes MCP live, não reduzir a quantidade de servidores MCP realmente iniciados por session ativa

Portanto, esta proposta resolve a latência da inicialização MCP que bloqueia a primeira requisição ao modelo; não resolve o crescimento contínuo de processos e memória MCP live causados por sessions/runtimes não liberados. Se o segundo problema ainda existir, ele deve ser investigado separadamente como ownership / ciclo de vida de session, e o tool catalog cache não deve ser tratado como mecanismo de reciclagem de recursos.

## Contexto

O ZCode já agenda hoje a inicialização MCP antecipadamente na criação de session/runtime, mas ainda executa o seguinte antes da primeira requisição ao provider:

```text
startMcpStartup()
  -> connectConfiguredServers()
  -> initializeMcp() await startup
  -> registerMcpTools(live tools)
  -> provider request
```

Logo, hoje o "assíncrono" apenas faz a inicialização MCP rodar em paralelo com as etapas de preparo de context, skills e memory; a primeira requisição ao modelo continua bloqueada pelo server mais lento em `initialize + tools/list`.

O foco da otimização não é compartilhar o runtime MCP live, mas separar dois fatos:

```text
tool catalog visível ao provider
  pode vir de um cache de schema em nível de processo, de curta duração e higienizado

execução live de tools
  precisa aguardar o client live da session atual e reconfirmar ferramentas, schemas e permission metadata
```

Este design adota essa semântica de dois canais.

## Trade-offs de design

| Capacidade                          | Semântica                                                                                         | Planejamento do ZCode                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| LRU de tool catalog por processo     | 32 entradas, TTL de 30 minutos; lido apenas enquanto startup está pendente                        | Adotado na Fase 1/2                                    |
| identidade de transport              | command/args/env/cwd/environment/capability de client do stdio; HTTP ignorado por identidade de auth instável | Adotado, complementando com limite de workspace identity |
| higienização de payload              | remover connection instructions e tool annotations antes de publicar                              | Adotado; o cache não participa de permissão             |
| publicação concorrente              | generation local da entrada; fetch mais antigo não pode sobrescrever snapshot mais novo         | Adotado                                                 |
| cold miss                            | listagem de tools aguarda o client live; não se oculta MCP silenciosamente para ganhar velocidade | Adotado com aggregate complete-hit                      |
| execução live                        | aguardar o client atual antes de chamar e consultar tool/visibility/annotations no inventário live antes de aprovar | Adotado, adaptado à ordem de schema validation do ZCode |
| ciclo de vida                        | startup future por server, cancelamento de startup, shutdown do manager e limpeza do stdio       | Preservar o ownership de session atual e adicionar regressões |
| status / auth / elicitation          | atualização de startup por server, auth state, espera por ready, roteamento de elicitation        | Não é responsabilidade do catalog                      |
| cache exclusivo de connector         | uso de cache por longo tempo após falha, reconnect em background, hard refresh; semântica diferente da do MCP comum | Não generalizar para o MCP comum                      |
| servidor obrigatório                 | marcar alguns servers como required, bloqueando enquanto não estiverem prontos                     | O ZCode hoje não tem semântica de produto equivalente; este recurso não a introduz de passagem |
| resources / templates                | continuam sendo consultados no client live, sem passar pelo tool catalog cache comum              | Fora do escopo deste recurso                            |
| `tools/list_changed`                 | o cache comum ainda não tem invalidação dinâmica completa                                        | O ZCode na Fase 3 pode marcar dirty ao identificar a notificação |

O trade-off central é fazer apenas o "caminho rápido de anúncio de startup", sem introduzir um fallback stale de longo prazo exclusivo de connectors, nem deixar o cache virar um segundo runtime MCP.

## Limites confirmados

1. Cada session continua possuindo seu próprio `NodeMcpAdapter` e seus próprios servers/clientes MCP.
2. Não implementar LRU de servers live, eviction por ociosidade ou compartilhamento de clients entre sessions.
3. O cache guarda apenas o tool catalog, não clients, transports, sessões OAuth ou process handles.
4. Um acerto de cache não significa que o server está conectado; o status na página de configurações continua refletindo apenas o estado live do control-plane.
5. O cache otimiza apenas a espera pelas declarações de tools do provider; não muda a semântica de criação/retomada de session, projeção de conversa, continuous no desktop nem replayable no mobile.
6. A chamada de tool deve migrar para o descriptor live antes da validação de entrada e da decisão de permissão.

## Impact Brief

### Resumo do Recurso

| Item         | Conteúdo                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------- |
| Objetivo     | em um warm catalog hit, a primeira requisição ao provider não espera o startup MCP live da session |
| Valor para o usuário | sessions novas ou retomadas obtêm a primeira resposta mais rápido, enquanto chamadas MCP reais continuam usando o server live desta session |
| Limite central | o catalog cuida apenas do anúncio de capabilities; o adaptador live cuida de conexão, fatos de permissão e execução |
| Fora de escopo explícito | LRU de MCP live, compartilhamento de client/process entre sessions, cache de catalog HTTP/SSE, fallback stale de longo prazo |

### Matriz de Superfície de UI

| Superfície                      | Altera UI | Impacto no comportamento                                             | Evidência/Regressão                  |
| ------------------------------- | --------- | --------------------------------------------------------------------- | ------------------------------------ |
| Primeira amostragem da conversa  | Não       | provider request é disparado antes no caso de complete-hit             | core/bootstrap deterministic tests   |
| Página de configurações de MCP  | Não       | continua exibindo o status live do control-plane; cache hit não mostra connected | `MO01-MO03` + testes unitários de status |
| Chamada/aprovação de tool MCP   | Não       | aguarda e resolve o descriptor live antes da permissão                | `Y01/Y02` + testes do tool executor  |
| Subagent                        | Não       | continua emprestando o snapshot live do pai, não herda o cache de anúncio | testes de borrowed port            |
| Desktop / mobile remoto         | Não       | compartilha os fatos do Agent; não altera entrega continuous / replayable | regressão de invariantes            |

### Comportamento Compartilhado vs. Divergente

- Compartilhado: todos os session runtimes usam as mesmas regras de catalog lookup, higienização, generation e live preflight.
- Divergente: um warm complete-hit pode amostrar antes; cold/partial/unsupported miss continua aguardando o startup live.
- Divergente: o control-plane só pode popular o catalog após um connect live bem-sucedido; consultas somente de status não populam.
- Divergente: o subagent consome apenas o snapshot live conectado do pai, não o anúncio cacheado.
- Invariante: desktop continuous e mobile replayable só cuidam da entrega de mensagens; não são donos do catalog nem do runtime MCP.

### Donos de Estado

| Estado                                             | Dono                                                       | Ciclo de vida                |
| -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| LRU de tool catalog higienizado                     | implementação de `McpToolCatalogPort` injetada por Agent/bootstrap | Processo do Agent            |
| client/process/status MCP live                      | `McpPort` / `NodeMcpAdapter` de cada session                | Session                      |
| Promise / AbortController / coordinator de startup   | session runtime do `AgentRuntime`                          | Session                      |
| conjunto de `ToolEntry` MCP cacheados/live           | `ToolRegistry` da session                                  | Session                      |
| status MCP do control-plane                          | adaptador do control-plane                                 | Control-plane do processo do Agent |

`AgentRuntime` possui apenas a coordenação de startup; `SessionFacade.closeSessionResources()` continua sendo dono do agendamento real de `McpPort.close()` e da limpeza de processos. Os dois donos não podem ser fundidos em um mesmo `finally` assíncrono, ou a ordem do shutdown voltaria a ficar implícita.

## Semântica de produto recomendada para a primeira versão

A semântica abaixo é o padrão recomendado para a primeira versão; se for preciso mudá-la antes da implementação, este documento deve ser atualizado primeiro.

| Condição                                                                 | Tools do provider no 1º turno | Chamada de tool                                                       | Próximo passo do modelo                          |
| ------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Todos os servers cacheáveis acertaram um catalog novo e o startup live está pendente | usar o cached catalog imediatamente | aguardar a mesma promise de startup; validar e aprovar com o descriptor live | usar o catalog live após o startup dar certo   |
| Existe no cache um catalog vazio válido                                     | usar o conjunto vazio de MCP tools imediatamente | não existe MCP tool chamável                                      | usar o catalog live após o startup dar certo     |
| Qualquer server habilitado com cold miss, expirado ou com transport sem suporte a cache | aguardar o startup live         | usar o descriptor live                                              | usar o catalog live                               |
| Após warm hit, o startup live tem sucesso                                  | a requisição já enviada mantém os contracts cacheados | executar após revalidação live                                    | substituir atomicamente pelos contracts live    |
| Após warm hit, o startup do MCP comum falha                               | a requisição já enviada ainda pode conter tools cacheadas | retornar falha de startup/unavailable estruturada                  | não anunciar mais depois; tombstone execution-only recebe as chamadas antigas |
| Após warm hit, o startup é cancelado pelo shutdown da session              | o waiter atual recebe cancelamento | não executar                                                          | session é fechada                                |
| Tool cacheada foi removida ou ocultada pelo server live                    | o modelo pode gerar uma chamada de tool antiga | rejeitar como unavailable antes da permissão                       | o catalog live já não contém a ferramenta        |
| Schema cacheado difere do schema live                                    | o modelo pode gerar parâmetros com o schema antigo | revalidar com o schema live; erro devolvido como tool result recuperável | o catalog live substitui o schema antigo |

Em um cold miss real, continua-se aguardando o MCP. A primeira versão não adota a estratégia mais agressiva de "omitir silenciosamente as MCP tools no primeiro turno e só fazê-las aparecer no próximo", para evitar que o modelo julgue incorretamente que a capability não existe quando o usuário pediu explicitamente para usar MCP.

## Arquitetura geral

```text
ZCode Protocol / Agent process
│
├─ McpToolCatalogPort                        process scoped
│    ├─ stdio identity A -> sanitized tools
│    ├─ stdio identity B -> sanitized tools
│    └─ LRU capacity=32, TTL=30m
│
├─ control-plane NodeMcpAdapter              live，设置页 mcp/list
│    └─ 成功 tools/list 可发布 catalog
│
├─ Session A NodeMcpAdapter                  live，session scoped
│    ├─ startup shared Promise
│    └─ 成功 tools/list 可发布 catalog
│
└─ Session B NodeMcpAdapter                  live，session scoped
     ├─ startup shared Promise
     └─ 命中 catalog 时 provider 不等待 startup
```

A implementação em memória do catalog port pode ficar na camada de adaptador, mas não deve ser embutida no `NodeMcpAdapter`, nem estender o `McpPort` live existente. O ciclo de vida é injetado explicitamente pelo bootstrap:

```text
bootstrap creates one McpToolCatalogPort
  -> inject Agent protocol control-plane
  -> inject every createZCodeApp / session runtime

each session still creates its own NodeMcpAdapter
  -> existing connectConfiguredServers()
  -> existing listTools() / callTool() / close()
```

É proibido usar um singleton implícito em nível de módulo. Testes, múltiplas instâncias de Agent no mesmo processo e futuros ambientes com runtimes diferentes precisam poder obter um cache independente via injeção de dependência.

## Sequência de inicialização

### Warm catalog hit

```text
session/runtime create
  -> catalogPort.context(scope) for each enabled server
       ├─ 同步读取 complete cached catalog
       └─ 为每个可缓存 server 分配 fetch generation ticket
  -> 立即调用现有 mcpPort.connectConfiguredServers()
       └─ 把同一个 Promise 保存为 session shared startup
  -> 注册 advertisement-only cached ToolEntry
  -> provider request 使用 cached contracts

后台 startup 完成
  -> connected server publishIfNewest()
  -> 用 live ToolEntry 替换 cached ToolEntry
  -> live inventory 中已不存在的 cached ToolEntry 改为 provider-invisible tombstone
  -> invalidate provider tool contract cache
```

### Cold catalog miss

```text
session/runtime create
  -> catalogPort lookup 得到 incomplete coverage
  -> 立即调用现有 mcpPort.connectConfiguredServers()
       └─ 把同一个 Promise 保存为 session shared startup
  -> 首轮 sampling await live startup
  -> 注册 live ToolEntry
  -> provider request
```

### Sessões novas e retomadas

- Session nova e session retomada a frio seguem a mesma regra de lookup; a "session antiga" em si não é tratada como cache hit.
- Se uma session ainda viva tiver seu runtime e seu adaptador live intactos, ela continua usando seu próprio estado live, sem refazer o caminho rápido do catalog.
- Retomar uma session depois de fechá-la cria um novo adaptador live; se ainda houver um catalog correspondente no mesmo processo do Agent, é possível fazer uma amostragem warm, mas a chamada de tool ainda aguarda esse novo adaptador.
- O catalog não é gravado em rollout, snapshot de task nem evento replayable; após reiniciar o processo do Agent, o catalog comum é um cold miss, o que também evita confundir o cache de schema com permissões de session persistidas.

### Chamada de tool cacheada

```text
provider returns cached MCP tool call
  -> registry 找到 advertisement-only cached ToolEntry
  -> resolveForExecution(signal)
       ├─ await 当前 session shared startup Promise
       ├─ 从当前 live adapter 查找 serverName + toolName
       ├─ 不存在 / 不可见 / 当前 provider name 已变化 -> structured unavailable
       └─ 存在 -> 构造 live ToolEntry
  -> 使用 live input schema 校验
  -> 运行 PreToolUse / permission policy
  -> 使用 live annotations 判断 readOnly/destructive/risk
  -> live callTool()
```

`resolveForExecution` precisa acontecer antes da validação inicial de entrada, do hook PreToolUse e da permissão. Esperar o startup apenas dentro do handler cacheado não é seguro, porque o executor atual já toma decisões de permissão usando `ToolEntry.metadata` antes do handler.

## Port e interfaces de runtime

O `McpPort` existente permanece inalterado. Ele continua expressando apenas a capacidade de conexão e execução live da session atual:

```text
McpPort
  connectConfiguredServers / connectServer / disconnectServer
  status / listTools / callTool / close
```

É adicionado um `McpToolCatalogPort` separado e injetável, que expressa o cache de schema somente-leitura entre sessions. O runtime obtém de forma síncrona o contexto de lookup e o ticket de generation antes de chamar o `connectConfiguredServers()` existente:

```ts
type McpToolCatalogWorkspaceScope =
  | {
      kind: "local";
      workspaceIdentity?: string;
      workspacePath: string;
    }
  | {
      kind: "remote";
      workspaceIdentity?: string;
      workspacePath: string;
      remoteSessionId?: string;
    };

interface McpToolCatalogScope {
  workspace: McpToolCatalogWorkspaceScope;
  serverName: string;
  serverConfig: McpServerConfig;
  clientCapabilityFingerprint: string;
}

interface McpToolCatalogFetchTicket {
  generation: number;
}

interface McpToolCatalogContext {
  current():
    | { kind: "hit"; tools: McpCatalogToolDescriptor[] }
    | { kind: "miss"; reason: "absent" | "expired" | "dirty" | "oversize" };

  beginFetch(): McpToolCatalogFetchTicket;

  publishIfNewest(
    ticket: McpToolCatalogFetchTicket,
    tools: McpToolDescriptor[],
  ): void;

  invalidate(): void;
}

interface McpToolCatalogPort {
  context(scope: McpToolCatalogScope): McpToolCatalogContext | undefined;
}
```

`context()` retorna `undefined` para HTTP/SSE, não suportados na primeira versão, o que faz a cobertura agregada virar `incomplete`. A normalização da identidade de cache, o digest de campos sensíveis, TTL, LRU e generation ficam encapsulados na implementação do port; o runtime do core não monta chaves.

`McpCatalogToolDescriptor` deve excluir no tipo os campos que não podem ser confiáveis entre sessions, evitando uso incorreto por parte dos chamadores:

```ts
type McpCatalogToolDescriptor = Pick<
  McpToolDescriptor,
  | "serverName"
  | "toolName"
  | "name"
  | "description"
  | "inputSchema"
  | "outputSchema"
>;
```

Um array vazio válido precisa representar um cache hit e não pode compartilhar `undefined` com um cache miss.

As responsabilidades de coordenação de `startMcpStartup()` são:

```text
1. 为 enabled servers 取得 catalog contexts、读取 snapshot、分配 fetch tickets
2. 无条件立即启动现有 mcpPort.connectConfiguredServers()
3. 保存且复用同一个 startup Promise
4. complete-hit：先注册 advertisement entries；cold/incomplete：首轮 await startup
5. startup success：按 server publishIfNewest()，包括成功的零工具 catalog
6. reconcile 当前 session 的 live registry；缺失项改为 provider-invisible tombstone
7. startup failure/cancel：不 publish；停止广告 cached entries，并保留旧响应可解析的 tombstone
```

Essa divisão permite desligar ou substituir a otimização do catalog isoladamente e evita que o control-plane, o subagent ou o adaptador live sejam obrigados a entender a semântica warm/cold da amostragem do provider.

### Coordinator de startup da session

Os dois booleanos atuais `mcpInitialized` / `mcpToolsRegistered` não conseguem distinguir "entries cacheadas já anunciadas" de "entries live convergidas". Na implementação, um coordinator em escopo de session deve ser o único dono da Promise, dos contextos de catalog e dos nomes do registry, evitando que múltiplos turnos, compactações ou chamadas de tool montem o estado separadamente:

```text
                         complete-hit
IDLE ── start ──> STARTING_CACHED ──────> provider sampling allowed
                    │   │
                    │   ├─ live snapshot settled ──> LIVE_SETTLED
                    │   └─ session close ──────────> CLOSED
                    │
                    └─ tool call ── wait same Promise ── live resolve

                         incomplete
IDLE ── start ──> STARTING_BLOCKED ─────> provider waits same Promise
                         │
                         ├─ live snapshot settled ──> LIVE_SETTLED
                         └─ session close ──────────> CLOSED
```

`LIVE_SETTLED` é um resultado por server: servers conectados usam entries live; servers com falha ou desabilitados param de anunciar as entradas cacheadas correspondentes, mas mantêm o tombstone execution-only. Um aggregate throw e o cancelamento da session também precisam formar um desfecho terminal legível pelo preflight, e não apenas engolir o erro e deixar um booleano de "registrado".

## Tool registry e executor

### Advertisement entry

Um descriptor cacheado só pode gerar uma entrada de anúncio para o provider:

- Fornece name, description e schemas de input/output para `ToolRegistry.toContracts()`.
- Filtra novamente pela allowlist / denylist de tools da session atual.
- Não fornece annotations, risk, approval nem session instructions em que o sistema de permissão possa confiar.
- Carrega `resolveForExecution`, que resolve para um `ToolEntry` live no limite de execução.
- Os campos obrigatórios de permission/metadata do `ToolEntry` existente usam placeholders fixos e conservadores (risco alto, requer aprovação) e não podem ser derivados do cache; o executor deve afirmar que uma entrada adiada já foi resolvida, e o placeholder não pode entrar no fluxo real de permissão.

Sugere-se adicionar um preflight opcional ao `ToolEntry`:

```ts
type ToolExecutionEntryResolution =
  | { kind: "ready"; entry: ToolEntry }
  | { kind: "unavailable"; message: string; recoverable: true }
  | { kind: "cancelled"; message: string };

interface ToolEntry {
  resolveForExecution?: (context: {
    input: unknown;
    signal?: AbortSignal;
  }) => Promise<ToolExecutionEntryResolution>;
}
```

O `call-runner` executa o preflight uma única vez depois do lookup no registry e antes de canonicalize / normalize / validation; `ready.entry` passa a ser a única entry do restante do fluxo. `unavailable` gera um MCP tool result estável e recuperável, e `cancelled` gera o resultado de cancelamento existente; nenhum dos dois entra em hook, permissão ou handler, e ambos precisam publicar os respectivos eventos de tool error, para que a linha da UI não fique permanentemente presa em input streaming.

O preflight aguarda a mesma Promise de startup compartilhada da session e faz race simultaneamente entre o signal do tool caller atual e o signal de shutdown da session. O startup compartilhado precisa continuar sujeito às timeouts existentes de MCP connect / initialize / auth; se algum transport não tiver timeout de startup finito, a habilitação desse transport na Fase 2 precisa antes complementar o timeout, para que uma chamada de tool cacheada não espere indefinidamente. Falha terminal de startup é mapeada para `unavailable`, e abort do caller é mapeado para o `ToolCancelled` existente, publicando o evento terminal de tool.

Essa espera de startup não conta no execution timeout do handler live da tool; a semântica é a mesma da espera por permissão: só depois de o preflight obter a entry live e de a validação de schema live e da permissão serem concluídas é que o `executeWithTimeout` do handler existente começa a contar. Também registre `mcp.tool.live_preflight.waitMs`, para distinguir inicialização lenta de execução lenta de tool.

### Reconcile do registry

Hoje `registerMcpTools()` apenas sobrescreve entries de mesmo nome e não remove tools que sumiram do inventário live. O catalog assíncrono precisa gerenciar explicitamente os nomes de MCP tools registrados nesta session:

```text
cached names = {A, B, C}
live names   = {A, C, D}

reconcile:
  replace A/C with live entries
  replace B with provider-invisible unavailable tombstone
  register D
  invalidate provider tool cache
```

Uma requisição ao provider já emitida mantém seu próprio array de tool contracts e não é reescrita por um reconcile posterior do registry. Portanto, não se pode desregistrar B imediatamente: quando a resposta antiga chegar, ela viraria um `ToolNotFound` irrecuperável já na etapa de lookup do registry, sem nunca chegar ao preflight live.

Na primeira versão, a entrada do registry recebe uma marca de anúncio indicando se participa de `toContracts()`. O tombstone não entra mais nos contracts posteriores do provider, mas o lookup no registry ainda consegue resolver a resposta antiga e retornar de forma estável um unavailable recuperável. Como a configuração MCP da session atual não faz hot-swap, o tombstone pode ser mantido até o fechamento da session; se no futuro for introduzido um refresh de runtime, a reciclagem segura pode usar generation/ref-count de contracts do provider, e não um unregister imediato que presume que a resposta antiga já terminou.

## Tool Catalog Cache

### Escopo

A primeira versão armazena em cache apenas o MCP stdio comum.

HTTP/SSE não são cacheados por enquanto, porque hoje não existe uma identidade de principal autenticado resolvida, estável e normalizada. Compartilhar apenas por URL, headers ou nome do server pode misturar tool catalogs de contas, tokens OAuth ou escopos de permissão diferentes.

### Capacidade e validade padrão

- Capacidade do LRU: 32 identidades de catalog de server
- Limite de JSON higienizado por entrada: 2 MiB
- Orçamento total de JSON higienizado no cache do processo: 16 MiB, com descarte por LRU ponderado
- TTL: 30 minutos
- Ciclo de vida: apenas em processo, sem gravação em disco
- Snapshot: `tools + publishedAt`
- Entrada: `nextFetchGeneration + lastAcceptedGeneration`

Além do limite de contagem de entradas, o ZCode adiciona um orçamento em bytes para evitar que poucos schemas anormalmente grandes criem um novo problema de memória. Um catalog obtido com sucesso mas acima do limite por entrada é marcado como `oversize` e o snapshot antigo daquela identidade é removido; o caminho passa a ser cold. Não se pode continuar anunciando o valor antigo só porque o "novo valor não cabe".

Os parâmetros começam como opções internas injetáveis, para facilitar fake clock e testes de capacidade, sem adicionar itens de configuração de usuário. Um acerto no lookup pode elevar a recência do LRU, mas o TTL é sempre calculado a partir do último publish bem-sucedido e não pode se renovar indefinidamente por leituras repetidas.

### Identity

A identity precisa expressar "esta conexão deveria receber o mesmo schema de tools", devendo conter ao menos:

```text
local workspaceKey = workspaceIdentity?.trim() || workspacePath
remote workspaceKey = workspaceIdentity.trim()（必需）
+ remoteSessionId（remote scope 必需）
+ serverName
+ normalized stdio command
+ ordered args
+ explicit cwd / effective fallback cwd
+ effective environment digest
+ client capability fingerprint
+ tool catalog schema version
```

Requisitos:

- `workspacePath` é usado apenas para o cwd de execução; o isolamento usa `workspaceKey`.
- Mesmo path com identity remota diferente deve dar miss.
- Localmente é permitido omitir `workspaceIdentity` e recorrer ao path; para SSH/WSL/Docker, se não for possível obter o `workspaceIdentity` / `remoteSessionId` que deveria existir, a primeira versão retorna unsupported/cold miss e não pode degradar para compartilhamento apenas pelo path remoto.
- Valores de env entram apenas em um digest criptográfico com sal de processo mantido pela instância do cache, e não em uma chave raw serializável; não podem aparecer em logs, erros ou telemetria.
- O port calcula o fingerprint normalizado apenas a partir do `serverConfig`, sem manter a config raw na entrada do cache.
- O log da chave só pode emitir um fingerprint opaco e o motivo do hit/miss.
- Mudanças na capability do client ou no schema do payload do catalog precisam invalidar as entradas antigas.
- A resolução de cwd, a mesclagem de env base, env de rede e env do server precisam reutilizar as funções puras do adaptador live, sem escrever um conjunto paralelo de "chave aproximada"; nomes de variáveis de ambiente no Windows são normalizados case-insensitivamente e os caminhos usam a semântica da plataforma atual.
- Broker de browser específico da session, sockets temporários e tokens temporários, se entrarem na config efetiva, precisam participar do fingerprint; portanto o `node_repl` embutido pode não conseguir acertar entre sessions na primeira versão, o que é um resultado esperado com prioridade para segurança.

### Higienização de payload

Permitido armazenar em cache:

- identidade estável de server/tool
- name visível ao modelo
- description
- input schema
- output schema

Proibido armazenar ou proibido confiar a partir do cache:

- `annotations`
- inferências de readOnly / destructive / idempotent / openWorld
- permission / approval / risk level
- session-specific initialize instructions
- disponibilidade de OAuth/auth
- runtime scope, sandbox, cwd execution state
- proveniência de plugin/session
- client, transport, process handle

### Generation

Cada fetch live obtém um ticket de generation local da entrada antes de realmente conectar:

```text
ticket.generation <= lastAcceptedGeneration
  -> 丢弃 publish

ticket.generation > lastAcceptedGeneration
  -> sanitize
  -> 保存 snapshot
  -> 更新 lastAcceptedGeneration
```

Após um descarte pelo LRU, um fetch que já detém um contexto de entrada antigo pode terminar, mas não pode reinserir implicitamente a identidade descartada de volta no LRU. Um novo lookup cria uma nova entrada, gerenciada de forma independente pela nova generation.

### Cobertura agregada

A primeira versão adota semântica de cobertura completa:

- Todos os servers habilitados e cacheáveis precisam ter uma entrada nova para que `complete-hit` seja retornado.
- Se qualquer server der miss, estiver expirado ou tiver transport sem suporte, o resultado agregado é `incomplete` e o primeiro turno aguarda o startup live.
- Servers desabilitados/não confiáveis não exigem entrada de cache e também não contribuem com tools para o provider.

Não se faz um "tool set progressivo" em que parte dos servers aparece primeiro e o resto depois, evitando que o modelo veja capacidades incompletas no primeiro turno.

## Falhas, cancelamento e refresh

### Falha de startup

- Um resultado de falha não pode sobrescrever um catalog bem-sucedido existente.
- Depois que o startup entra em estado terminal, a session com falha não pode continuar expondo tools cacheadas aos próximos passos do modelo.
- Se uma requisição ao modelo já enviada chamar uma tool cacheada, o live preflight retorna unavailable/falha de startup.
- O registry não desregistra imediatamente o nome cacheado anunciado; em vez disso, vira um tombstone invisível ao provider, para atender as requisições ao provider já emitidas.
- Uma nova session pode usar novamente, na janela de startup pendente, um catalog ainda dentro do TTL; se esta também falhar, para de expor depois do estado terminal, da mesma forma.

"Usar o cache por longo tempo após falha de startup e reconectar em background" é semântica exclusiva de connectors e não é generalizada para o MCP comum na primeira versão.

### Cancelamento

```text
turn/tool waiter abort
  -> 只取消当前 waiter
  -> 不取消 session shared startup

AgentRuntime.beginShutdown()
  -> 同步把 startup coordinator 转成 CLOSED
  -> abort session-owned startup controller
  -> completion handler 检查 CLOSED + generation，不 publish / reconcile

SessionFacade.closeSessionResources()
  -> 仍负责调用 mcpPort.close()
  -> 执行现有 adapter / stdio process tree cleanup
  -> 不 publish cancelled fetch
```

Hoje o `await` direto de `record.connecting` em `callTool()` não é sujeito ao `AbortSignal` desta chamada de tool. A implementação precisa adicionar um race de abort por waiter, sem cancelar o startup ainda pertencente à session só porque um waiter parou. `AgentRuntime.beginShutdown()` é o ponto de fechamento síncrono do coordinator, responsável por impedir que a conclusão assíncrona escreva de volta; ele não assume a posse do fechamento real do adaptador. A limpeza real do processo MCP continua sendo responsabilidade da cadeia de fechamento concorrente existente em `SessionFacade.closeSessionResources()`, evitando fechamento duplo ou fechamento遗漏 por parte do runtime e da facade.

Para manter o contrato atual do `McpPort`, o controller pertencente à session pode primeiro cancelar o wrapper de startup compartilhado exposto pelo coordinator; a promise raw de connect subjacente é interrompida/limpa pelo `mcpPort.close()` concorrente que ocorre em seguida. Seja a promise raw finalmente resolvida ou rejeitada, a conclusão precisa checar CLOSED primeiro e não pode republicar nem alterar o registry.

### Refresh de configuração

A configuração MCP da session atual ainda é uma configuração de tempo de startup; este design não introduz hot-swap de configuração no session runtime.

Se um refresh for adicionado no futuro:

- Só é possível publicar depois que a nova generation tiver sucesso.
- Um passo do modelo já emitido mantém seus próprios contracts.
- Uma chamada de tool live em andamento não é interrompida pelo novo catalog.

### `tools/list_changed`

A Fase 2 pode, sob uma feature flag, não implementar o refresh dinâmico completo; a Fase 3 consolida a notificação:

- A leitura do cache não renova `publishedAt`.
- Depois que o adaptador reconhece `tools/list_changed`, ele marca a entrada correspondente como dirty / invalida, sem tratar o payload da notificação como o novo catalog.
- Se o adaptador hoje não consome essa notificação, a análise de riscos deve declarar explicitamente a dependência de TTL + revalidação live, sem afirmar que o catalog fica sempre sincronizado com o server.

## Control-plane e página de configurações

O handler de protocolo do control-plane em escopo de processo pode injetar o mesmo `McpToolCatalogPort`, para que um `connect + tools/list` bem-sucedido disparado pela página de configurações já na Fase 3 preencha o schema para novas sessions; os adaptadores live em si não precisam segurar o cache.

Os limites permanecem:

- O status de `mcp/list` continua vindo do status live do adaptador do control-plane.
- Cache hit não é projetado como `connected` nem altera a UI de contagem/status de tools.
- Requisições somente de status não conectam nem publicam novo catalog.
- O connect replace só publica quando a obtenção de tools live tem sucesso.
- OAuth pendente, epoch de workspace, prontidão de configuração e isolamento de informações sensíveis continuam obedecendo a `docs/mcp-oauth-client-auth.md`.

## Subagent

Hoje o subagent empresta o `McpPort` do pai e consome o snapshot exato de startup do pai; a child não possui o ciclo de vida da conexão.

A primeira versão mantém esse contrato:

- O modelo principal do pai pode fazer amostragem mais cedo usando o cached catalog.
- Quando o modelo realmente inicia a tool `Agent` e a child precisa herdar o MCP, a ponte do subagent continua aguardando o startup live do pai.
- A child recebe apenas o snapshot exato e filtrado por scope dos servers live conectados no momento.
- A child não pode usar o snapshot cacheado do pai, apenas para anúncio, nem publicar/fechar o catalog ou a conexão do pai.

Se mais tarde for preciso otimizar o fato de que "uma child que não usa MCP também espera o startup do pai", isso deve ser desenhado separadamente, recortando por necessidade de server por profile/scope, e não neste recurso tratando metadata cacheada como permissão de execução da child.

## Limites de Desktop, Web, Mobile e remoto

```text
desktop-continuous ─┐
                    ├─ shared Host / Agent session -> session MCP adapter
mobile replayable ──┘
```

- O cache existe apenas no processo do Agent real.
- O `/remote` do mobile continua se anexando ao Host/Agent já existente no desktop, sem criar um runtime MCP independente nem uma autoridade de cache.
- Relay, main do desktop e renderer não guardam estado de negócio do tool catalog.
- Continuous no desktop e replayable no mobile afetam apenas como os eventos chegam à UI; não mudam os fatos de tool catalog do provider nem de execução live.
- A identidade de workspace remoto precisa entrar na chave do cache; não se pode compartilhar apenas pelo `workspacePath` remoto.
- Hoje o `ZCodeWorkspaceRef` só tem `workspaceIdentity` / `workspaceKey` / `workspacePath`, sem `remoteSessionId`. A Fase 2 usa apenas um parser de identidade remota unificado para decidir que é um workspace remoto, sem derivar ou inventar um session id a partir da string de identidade; assim que for classificado como remoto, o contexto de catalog retorna unsupported e o primeiro turno continua pelo caminho live frio.
- Se a Fase 3 quiser habilitar o catalog remoto, o `remoteSessionId` real precisa primeiro atravessar o resolver de sessão host/workspace existente até o contexto interno de workspace/session e o escopo do catalog, e construir a chave junto com a `workspaceIdentity`. Faltando qualquer um dos campos, continua desabilitado; não se pode compartilhar apenas por path nem afundar esse estado em main/relay.

Este design não modifica `getTaskSnapshot`, eventos dinâmicos de task, owner lease, fila ou recuperação de replay gap.

## Logs e métricas

Os logs da camada de serviço usam `createServiceLogger(scope)`; Agent/bootstrap continuam usando o logger existente. É proibido registrar env, headers, segredos OAuth, tokens ou o schema completo de tools.

Eventos sugeridos:

| Evento                           | Nível  | Campos-chave                                            |
| -------------------------------- | ------ | ------------------------------------------------------- |
| `mcp.catalog.lookup`             | debug  | fingerprint, hit/miss/expired/unsupported, serverCount   |
| `mcp.catalog.published`          | debug  | fingerprint, toolCount, generation                      |
| `mcp.catalog.publish_discarded`  | debug  | fingerprint, generation, lastAcceptedGeneration         |
| `mcp.startup.sampling_ready`     | info   | source=cache/live, waitMs, serverCount, toolCount       |
| `mcp.tool.live_preflight`        | debug  | serverName, toolName, waitMs, outcome                   |
| `mcp.startup.failed`             | warn   | resumo de falha existente, sem configuração sensível    |

Métricas agregadas sugeridas:

- proporção de catalog complete-hit / incomplete / expired / unsupported
- espera de MCP antes do provider em caso de warm hit
- espera de MCP antes do provider em caso de cold miss
- duração da espera de uma chamada de tool cacheada pelo startup live
- contagem de unavailable / schema drift no preflight live
- quantidade de entradas no LRU e de evictions

Detalhes de tool calls de alta frequência devem ir para debug; o ciclo de vida de produção guarda apenas um sampling-ready por session e as exceções.

## Implementação por fases

### Fase 1: Cache somente de escrita

Objetivo: não mudar a semântica de espera do provider; validar primeiro identity, higienização e publish generation.

Principais mudanças:

- Adicionar o contract `McpToolCatalogPort` e a implementação em memória na camada de adaptador.
- O bootstrap cria o port em escopo de processo e o injeta em cada session runtime.
- O session runtime publica após um `tools/list` bem-sucedido; sem modificar o `NodeMcpAdapter`.
- Adicionar métricas de cache hit/miss/publish, mas o runtime ainda não lê o cache.
- O seed pelo control-plane não é habilitado ainda, evitando acoplar status e autoridade de cache já na primeira fase.

Aceitação:

- Não alterar o comportamento existente do runtime MCP, das permissões, da página de configurações nem do E2E.
- Quando duas sessions concorrentes terminam fora de ordem, a generation antiga não pode sobrescrever o snapshot novo.
- Nenhuma configuração sensível entra em log.

### Fase 2: Catalog assíncrono para o provider

Objetivo: primeiro em workspaces locais, fazer a primeira requisição ao provider em complete-hit não esperar o MCP live, e usar os limites seguros de execução e ciclo de vida como porta de habilitação.

Principais mudanças:

- O runtime lê o contexto de catalog antes de chamar o `McpPort.connectConfiguredServers()` existente e salva a mesma Promise de startup compartilhada.
- O runtime registra entradas de anúncio cacheadas.
- Após a conclusão do startup, faz reconcile das entries live; itens ausentes/com falha viram tombstones invisíveis ao provider.
- O executor ganha um `resolveForExecution` live antes da permissão.
- O waiter de tool suporta um AbortSignal independente, sem cancelar o startup compartilhado.
- `AgentRuntime.beginShutdown()` fecha o coordinator de forma síncrona e aborta o startup da session; a facade continua dona do `mcpPort.close()`.
- Workspaces locais podem ler o cache; ao identificar um workspace remoto como SSH/WSL/Docker, retorna unsupported/cold miss até que o `remoteSessionId` chegue de ponta a ponta ao runtime.
- O subagent continua aguardando o startup live do pai e apenas empresta o snapshot live conectado; não pode ler o advertisement cache.

Aceitação:

- A requisição ao provider de uma session warm chega antes de a barreira MCP ser liberada.
- A chamada de tool continua esperando antes da barreira e, após ser liberada, chama o processo live da session atual.
- Remoção de tool cacheada, mudança de schema e mudança de anotação destrutiva são todas decididas pelo preflight live.
- Quando um reconcile ocorre depois de os contracts terem sido emitidos, uma chamada de tool stale ainda entra no preflight do tombstone e não vira `ToolNotFound`.
- Na corrida entre shutdown e conclusão de startup, não há publish nem reconcile, e o cleanup existente da árvore de processos continua sendo executado.
- Workspace remoto degrada com segurança ao caminho live frio; subagent permanece live-only. Ambas são portas de habilitação da Fase 2 e não são adiadas para a etapa de ativação por padrão.

### Fase 3: Refinamento das bordas e ativação por padrão

Objetivo: concluir o seed do control-plane, as notificações e a observabilidade e, depois que a identidade atravessar o sistema, habilitar opcionalmente o catalog remoto.

Principais mudanças:

- O connect live bem-sucedido na página de configurações popula o catalog.
- dirty/invalidation de `tools/list_changed`.
- Opcional: fazer o `remoteSessionId` real atravessar até o escopo de catalog do runtime, então habilitar o cache SSH/WSL/Docker e fazer testes representativos sem mistura de identities; enquanto a travessia não estiver completa, manter o comportamento de remote unsupported da Fase 2.
- Confirmar a ativação por padrão com base nas métricas; manter um cache mode interno para rollback de emergência.

## Impacto previsto no código

| Rank           | Área                                                                                  | Mudança prevista                                             |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| invariant-only | `apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts`                        | a interface live port existente permanece inalterada        |
| must-inspect   | `apps/zcode-cli/packages/contracts/src/interfaces/`                                   | novos tipos de catalog port, scope e descriptor higienizado |
| must-inspect   | `apps/zcode-cli/packages/adapters/src/mcp-tool-catalog/`                              | LRU em memória, identity, TTL, generation, higienização     |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts`                   | dono do cache em escopo de processo                          |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`                 | catalog port entra no contexto do processo de protocolo      |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`            | scope local e classificação remota; session id opcional na Fase 3 |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`      | passa o mesmo port para cada app de session de workspace    |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`                             | injeção de dependência do catalog port no session runtime   |
| must-inspect   | `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`                         | mantém a posse real do close MCP e do cleanup               |
| must-inspect   | `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`                           | shutdown fecha o coordinator de forma síncrona e aborta o startup |
| must-inspect   | `apps/zcode-cli/packages/core/src/runtime/methods/mcp.ts`                             | estado de startup cached/live e reconcile                   |
| must-inspect   | `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`                       | escolha warm/cold antes da amostragem                       |
| must-inspect   | `apps/zcode-cli/packages/core/src/mcp/index.ts`                                       | construção de advertisement entry e live entry              |
| must-inspect   | `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`                       | preflight live antes da permissão, abort de waiter          |
| should-inspect | `apps/zcode-cli/packages/core/src/tool/registry.ts`                                   | reconcile / tombstone invisível ao provider                 |
| should-inspect | `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`                        | startup do pai e snapshot emprestado                        |
| should-inspect | `apps/zcode-cli/packages/core/src/subagent/borrowed-mcp-port.ts`                      | manter apenas live e filtrado por scope                     |
| conditional    | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts`                         | resultados bem-sucedidos do control-plane populam o cache  |
| conditional    | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace.ts`                   | travessia do remoteSessionId real na Fase 3                |
| conditional    | `packages/shared/src/zcode-protocol/index.ts`                                         | schema estrito, se a interface entre processos precisar ser estendida |
| invariant-only | `packages/ui/src/settings/McpSettingsSection.tsx`                                     | a UI de status não lê o catalog                             |
| invariant-only | web remote / relay / desktop main                                                     | sem nova autoridade de cache nem estado de runtime          |

## Planejamento de testes

### Adapter unit

1. miss, fresh hit, hit vazio válido, expiração por TTL, eviction por contagem/bytes ponderados.
2. Qualquer mudança em server/config/cwd/digest de env/workspace identity/client capability gera miss.
3. Mesmo path com `workspaceIdentity` / `remoteSessionId` diferentes não é compartilhado.
4. Chave de env e resolução de path no Windows usam semântica do Windows; macOS/Linux não recebem regras do Windows indevidamente.
5. HTTP/SSE retorna unsupported e não cria entrada de catalog comum.
6. annotations, timeout, session instructions e campos sensíveis não entram no payload.
7. Com conclusões fora de ordem de generation, vence a mais nova.
8. Uma entrada in-flight descartada pelo LRU não é reinserida ao terminar.
9. A leitura do cache pode atualizar a recência do LRU, mas não estende o TTL baseado em `publishedAt`.
10. Um catalog live oversize remove o snapshot antigo e entra no caminho frio, sem manter anúncio desatualizado.

### Core runtime

1. complete-hit: a requisição ao provider não espera o startup.
2. cold miss: o primeiro turno ainda espera o startup, mantendo a semântica existente.
3. cached empty: envia imediatamente e não expõe MCP tools.
4. startup bem-sucedido: o próximo passo do modelo usa o descriptor live.
5. falha de startup: os próximos passos não anunciam mais tools cacheadas e as requisições já emitidas recebem unavailable do tombstone.
6. Tool cacheada removida pelo live: retorna unavailable antes da permissão, sem degradar para `ToolNotFound` do registry.
7. cached safe / live destructive: usa metadata live e é corretamente rejeitado pelo Plan mode ou pela permission policy.
8. cached schema v1 / live schema v2: valida com v2, o erro vai para o tool result e a session pode continuar.
9. allowlist/denylist são reaplicados ao cached catalog por session.
10. Vários callers esperam a mesma Promise de startup, sem conectar de novo.
11. O abort do caller cancela apenas o seu próprio waiter de startup, não o startup compartilhado da session.
12. O abort do caller gera um evento terminal `ToolCancelled`; a falha de startup gera um evento unavailable recuperável.
13. A espera de startup do preflight não consome o execution timeout do handler live e registra um waitMs separado.
14. Quando `beginShutdown()` ocorre antes da conclusão do startup, entra em CLOSED de forma síncrona e a conclusão atrasada não faz publish nem reconcile.

### Bootstrap / integração

1. A Session A inicializa com sucesso e popula o catalog.
2. A Session B usa um PID de MCP próprio e, antes de a barreira de initialize ser liberada, o provider já recebeu o schema cacheado da A.
3. A chamada de tool da Session B espera a barreira e, após a liberação, confirma que chamou o PID da B, e não o da A.
4. Um connect bem-sucedido no control-plane pode popular sessions seguintes; status-only não popula.
5. O fechamento da session continua limpando sua própria árvore de processos stdio, sem afetar o catalog do processo.
6. O subagent aguarda o startup live do pai e recebe apenas o snapshot conectado e filtrado por scope.
7. Na Fase 2, o catalog local pode acertar; SSH/WSL/Docker é sempre unsupported/cold, sem misturar catalogs por path.
8. Na Fase 3, só se verifica que as identities remotas representativas não misturam catalogs depois que o `remoteSessionId` real tiver atravessado o sistema.
9. O close do adaptador, a falha de startup e o timeout continuam executando o cleanup existente da árvore de processos entre plataformas.
10. Na corrida entre shutdown e conclusão, a facade ainda chama o `McpPort.close()` real uma única vez e o coordinator não mantém posse duplicada do cleanup.

### Regressões existentes

- `mcp-runtime.test.ts`
- `mcp-tool-bridge.test.ts`
- `mcp.test.ts`
- `mcp-process-lifecycle.test.ts`
- `subagent-borrowed-mcp-port.test.ts`
- Permissão MCP do Plan mode `Y01/Y02`
- Isolamento de OAuth/status do MCP `MO01-MO03`

A primeira versão se apoia principalmente em testes determinísticos de adapter/core/bootstrap e não exige novos E2E de GUI. Se casos E2E de conversa forem adicionados depois, os casos aceitos precisam primeiro ser gravados em `docs/conversation-session-case-catalog.md` e em `docs/testing/conversation-session-e2e-coverage-matrix.md`, e só então entrar em manual-review/capture.

## Combinações de estado e podas

| Case ID | Status    | Combinação representativa                          | Esperado                                                        |
| ------- | --------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `MCA01` | accepted  | warm complete-hit + startup pendente               | o provider faz sampling imediato, a tool call espera o live    |
| `MCA02` | accepted  | cold / expired / partial / unsupported            | o primeiro turno espera o live, mantendo a integridade atual das capacidades |
| `MCA03` | accepted  | cached vazio válido                                | sampling imediato, sem expor MCP tools                         |
| `MCA04` | accepted  | startup bem-sucedido / falha parcial / cancelamento | sucesso faz publish + reconcile live; falha/cancelamento não faz publish |
| `MCA05` | accepted  | cached presente + live ausente/oculto              | tombstone devolve unavailable recuperável antes da permissão  |
| `MCA06` | accepted  | schema / annotations cacheados diferentes do live | validação com schema live, aprovação com metadata live        |
| `MCA07` | accepted  | generation concorrente + eviction por LRU         | vence a mais nova; após o descarte, o fetch antigo não revive a entrada |
| `MCA08` | accepted  | connect do control-plane / status-only             | na Fase 3 só o connect bem-sucedido popula; status-only não   |
| `MCA09` | accepted  | pai / subagent                                      | gate da Fase 2: a child só empresta o snapshot live conectado  |
| `MCA10` | accepted  | local / SSH / WSL / Docker                         | remoto frio na Fase 2; só na Fase 3 pode acertar com identity completa |
| `MCA11` | ignored   | catalog HTTP/SSE/OAuth                             | v1 não tem identity de principal autenticado normalizada       |
| `MCA12` | ignored   | LRU de server live / compartilhamento              | o usuário já confirmou que não será feito                      |
| `MCA13` | accepted  | shutdown / conclusão de startup atrasada            | após CLOSED não há publish/reconcile; a facade ainda conclui o close |

Notas de poda:

- desktop continuous vs mobile replayable: podados como invariante mais um conjunto de regressões representativas, porque compartilham o mesmo runtime do Agent e este recurso não muda os fatos de entrega.
- provider/model/thought, queue/goal/compact/fork/edit: podados porque não mudam o dono do startup MCP nem a autoridade de execução.
- theme/locale/responsive: podados porque não há mudança de UI.
- Cada tool MCP concreta: podada em quatro categorias representativas — safe, destructive, missing e schema-drift.

## Invariantes a Preservar

1. O client/server MCP live de cada session continua independente.
2. Um tool catalog cacheado não pode autorizar execução nem afetar julgamento de readOnly/destructive/approval.
3. A chamada real só pode chegar ao adaptador live da session atual.
4. Um cache hit não pode ser projetado como connected na UI.
5. A chave do cache não vaza env, header, segredo OAuth ou token.
6. O isolamento local usa `workspaceIdentity?.trim() || workspacePath`; o remoto exige simultaneamente `workspaceIdentity` e `remoteSessionId`; `workspacePath` é usado apenas para o cwd de execução.
7. O `/remote` do mobile não cria Agent, Host ou runtime MCP independentes.
8. Continuous no desktop e replayable no web remoto não compartilham nem disseminam estado de entrega.
9. O subagent não possui o ciclo de vida MCP do pai nem obtém permissão de execução do advertisement cache.
10. O fechamento da session, a falha de connect e o timeout continuam executando o cleanup existente da árvore de processos stdio entre plataformas.
11. Uma tool stale nos contracts já emitidos ainda consegue entrar no preflight recuperável depois do reconcile e não vira `ToolNotFound` prematuramente.
12. Depois que o coordinator entra em CLOSED, nenhuma conclusão atrasada de startup pode publicar catalog nem alterar o registry.

## Riscos e rollback

| Risco                                   | Tratamento                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| tool stale chamada pelo modelo          | preflight live; se não existir, unavailable recuperável                       |
| schema stale gera parâmetros errados    | revalidação com schema live; erro devolvido ao modelo                         |
| annotation stale gera autorização errada| annotations não são cacheadas; entry live é resolvida antes da permissão       |
| inicialização antiga sobrescreve resultado novo | generation por entrada, newest-wins                                   |
| mistura de cache entre workspaces remotos | desabilitado na Fase 2; na Fase 3 só com identity completa + cwd/env       |
| vazamento de env/token                  | apenas digest; log só com fingerprint opaco                                 |
| description dinâmica desatualizada/vazada entre sessions | limitado à mesma workspace identity; config efêmera entra na chave; bypass interno possível |
| compartilhamento inseguro de HTTP       | a v1 não cacheia HTTP/SSE de forma alguma                                   |
| poucos schemas enormes inflam a memória do cache | 2 MiB por entrada + 16 MiB por processo como guarda de bytes; oversize limpa o valor antigo |
| server falha por muito tempo após warm hit e continua anunciado | após o terminal deixa de entrar nos contracts; tombstone só atende às respostas antigas |
| reconcile transforma resposta antiga em ToolNotFound | itens ausentes mantêm tombstone invisível ao provider até o fechamento da session |
| conclusão atrasada após shutdown escreve de volta | beginShutdown fecha com CLOSED + abort de forma síncrona; a conclusão checa state/generation |
| o caminho de cache introduz regressões    | começa com shadow somente de escrita, depois habilita leitura; mode interno permite rollback |

## Decisões padrão da primeira versão

Este planejamento adota os seguintes valores padrão; se a revisão de implementação derrubar qualquer um deles, este documento e o case correspondente devem ser atualizados primeiro:

1. cold/partial miss continua bloqueando a primeira requisição ao provider.
2. Só o aggregate complete-hit permite amostragem antecipada; não há progressive partial tool set.
3. O cache é apenas em processo, com capacidade 32 e TTL de 30 minutos, acrescido de 2 MiB/entrada e 16 MiB/processo como guarda de bytes serializados, para evitar que poucos schemas enormes inflam a memória do cache.
4. HTTP/SSE não são cacheados de forma alguma; a identity do principal autenticado será desenhada separadamente.
5. A primeira versão não adiciona status de startup visível ao usuário; mantém apenas logs, métricas e o status live existente na página de configurações.

## Planning Handoff

| Entregável              | Status              | Descrição                                                                                  |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Feature spec            | complete            | este documento define warm/cold, segurança de execução, ownership, remoto e limites de rollback |
| Feature graph           | updated             | `capability.mcp-async-tool-catalog` e as relações cache/live/status/subagent/identity estão registradas |
| Case catalog            | planned             | hoje apoiado em testes de core/adapter/bootstrap; registrar `MCA*` primeiro se houver necessidade de E2E de conversa com GUI |
| Coverage matrix         | planned             | entra em manual-review/capture após sincronizar com o case catalog                      |
| Fixture / replay / Docker | not-needed for v1 | a primeira versão pode ser coberta por um fake MCP server determinístico e barreiras |

Não há blocker de semântica de produto antes da implementação. Dois itens precisam ser acompanhados separadamente, mas não bloqueiam esta proposta:

- Não fazer LRU live significa que este recurso não vai corrigir o crescimento de processos e memória causado por session/runtime que não fazem close.
- Se a capacidade atual do MCP comum de consumir `tools/list_changed` for insuficiente, a v1 depende de TTL + revalidação live a cada execução; a invalidação por notificação fica para a Fase 3.

## Referências

- `docs/mcp-platform-boundary.md`
- `docs/runtime-tools/mcp-status-list-control-plane.md`
- `docs/design/v2/mcp-stdio-process-lifecycle.md`
- `docs/mcp-oauth-client-auth.md`
- `docs/plugin-mcp-session-runtime-merge.md`