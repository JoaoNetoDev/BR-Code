# CUA: spec de migração para SDK + `node_repl`

## Status

Concluído

## Objetivo

O CUA deixa de ser injetado no modelo como 30 ferramentas MCP independentes. O modelo chama
apenas o MCP unificado `node_repl`, faz o bootstrap do CUA SDK em cada JS Worker e então executa o
contract de CUA existente através de uma bridge privada.

## Contrato de modelo e SDK

A superfície de ferramentas visível ao modelo é fixa nas três ferramentas do node_repl: `js`,
`js_add_node_module_dir` e `js_reset`. O manifest do plugin de CUA não declara mais MCP server.

A entrada do SDK é:

```js
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const computerUseRoot =
  process.env.ZCODE_CUA_PLUGIN_ROOT ??
  process.env.ZCODE_PLUGIN_ROOT ??
  process.env.CLAUDE_PLUGIN_ROOT;
const { setupComputerUseRuntime } = await import(
  pathToFileURL(join(computerUseRoot, "scripts", "computer-use-client.mjs")).href,
);

await setupComputerUseRuntime({ globals: globalThis });
const app = await agent.computerUse.getApp("Notes");
await app.getAXState();
```

O `agent.computerUse` expõe uma **API de objetos vinculados** (`getApp` / `getState` /
`listApps` / `requestAccess` / `stop`, além de `getAXState` / `click` / `setValue` / `elements`
em camelCase no Target); o antigo conjunto de ferramentas em snake_case foi convergido para a
saída de escape `agent.computerUse.computer.<tool>`, com os nomes de método congelados pela union
fixa `COMPUTER_METHOD_NAMES` do SDK (14 existentes, com o zcode-cua `src/tools/manifest.ts` do
`TOOL_NAMES` como fonte de fato; os 16 como `open_application` já foram removidos no lado do
producer, e start/activate foram incorporados à inicialização transparente de `get_app_state`). O
schema de parâmetros é idêntico palavra por palavra ao zod `.strict()` do producer, e o envelope
MCP interno do runtime não é mais exposto ao Worker. A bridge privada usa
`{ method, input, context }` e se adapta internamente ao
`ComputerUseRuntime.execute({ toolName, arguments, ... })` do staging atual, de modo que BrokerClient,
Helper, freshness de frame e semântica de action-state continuam implementados de forma unificada
pelo runtime de staging. O SDK não pode acessar o socket do broker, o token nem o módulo nativo.

Cada chamada `mcp__node_repl__js` cria um Worker novo, portanto o bootstrap é um contrato
prévio de célula única, e não uma inicialização de session: cada célula que usa CUA precisa
reimportar e executar `setupComputerUseRuntime({ globals: globalThis })` antes e então chamar
`agent.computerUse.<method>()` na mesma célula. É proibido colocar o bootstrap em uma chamada e a
ação na chamada seguinte, e é proibido depender do `agent`, do `runtime` ou dos bindings de import
do Worker anterior. A skill visível ao modelo, a documentação sob demanda e a descrição da tool
`js` devem usar exatamente o mesmo template de bootstrap; um contract test trava essa regra.

Browser Use e Computer Use podem coexistir no mesmo Worker; ambos compartilham
`agent.documentation.get`, roteando seus próprios nomes de documentação sem sobrescrever o document
loader um do outro. O que é compartilhado é o canal `node_repl`, não o diretório de runtime do
plugin: o `ZCODE_CUA_PLUGIN_ROOT` do CUA fornece prioritariamente a closure nativa como `sharp` e
a documentação do CUA, enquanto o root do Browser Use responde apenas pelo bridge de browser e pelo
host server. Capturas de tela, zoom e leituras de estado com captura não dependem do `node_modules`
do Browser Use.

### Resultados estruturados e saída do Worker

O CUA SDK não expõe ao Worker o envelope MCP `content` legado do producer e também não cria
espelhos `content[0].text`, `text` ou `message` com o mesmo conteúdo. Resultados textuais de um
único JSON object (por exemplo a tabela de janelas de `list_windows`) são normalizados em campos de
SDK de topo; ações de sucesso comuns retornam apenas campos de receipt estáveis. Somente resultados
de leitura não JSON mantêm um único campo `text`.

O sink de resultado estruturado do Host transporta apenas duas categorias de informação:

1. a imagem oficial do CUA e o `image_ref` adjacente, além do `_meta` necessário para emitir esses
   conteúdos;
2. `_meta` de app-display, action-state e demais sideband que não devem entrar no corpo do modelo,
   caso em que o `content` precisa ficar vazio.

Resultados de erro podem manter o `content` de erro do producer. Resultados bem-sucedidos de ação
ou metadados em texto puro não podem entrar novamente no tool result pelo sink estruturado, sob
pena de se juntarem ao `nodeRepl.write(...)` do fim da célula em duas saídas. `toMcpRunResult`
continua tratando a imagem estruturada como fonte autoritativa, evitando que um
`console.log(JSON.stringify(result))` acidental quebre a adjacência `image`/`image_ref` do CUA
oficial. Os métodos de observação (`getAXState` / `getScreenshot` / `getAXStateAndScreenshot` /
`getState` / `listApps`) **apresentam o resultado por conta própria**, então a skill proíbe
explicitamente passar o retorno deles a `nodeRepl.write(...)` ou `nodeRepl.emitImage(...)`: uma
segunda rasterização em um mesmo resultado viola a regra de one-raster e o quadro inteiro é
removido, não sobrando nenhuma imagem. Para obter um valor sem apresentá-lo, passe
`{ emit: false }`. `getApp` apenas vincula, sem apresentar.

A elegibilidade para injeção de credenciais de broker da bridge do CUA e a autoridade de frame
oficial do CUA são dois conjuntos independentes. O `node_repl` pode obter a primeira para acessar
o runtime CUA do shared host, mas apenas um descritor MCP de CUA com autoridade real de plugin
obtém a segunda; resultados de node_repl/Browser Use genéricos não podem entrar por isso no
caminho de validação de raster exato. Para resultados do SDK CUA dentro do node_repl compartilhado,
o Host habilita dinamicamente essa proteção apenas quando o mesmo resultado possui o
`zcode.cua/official-frame-integrity-v1` emitido pelo producer, um `image_ref` adjacente válido e o
raster; os resultados de Browser Use do mesmo server continuam pelo caminho normal de mídia.

## Limites de runtime

```text
node_repl MCP / shared host
  └─ CuaRuntimePool（按 workspaceKey + sessionId + remoteSessionId 隔离）
       └─ AccessibilitySession + KillSwitch + InputHoldRegistry
            └─ BrokerClient → signed Computer Use Helper
```

O Worker de cada chamada `js` é de curta duração; a session do CUA, o frame registry, o
action-state e o kill switch são mantidos pelo runtime do shared host. `js_reset` apenas reinicia o
JS Worker e não destrói o runtime do CUA.

Toda identidade de workspace usa:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

O `/remote` remoto só pode se anexar a um shared host desktop já existente e não pode criar um
Helper independente, um runtime de Agent independente nem estado de CUA no relay. O desktop mantém
`desktop-continuous` e o celular mantém `web-remote-replayable`.

## Autorização e erros

O `mcp__node_repl__js` externo faz uma única aprovação de alto risco; o nível interno reutiliza
Helper/TCC, kill switch, freshness de frame, `possibly_sent` e limpeza de input-hold.
`request_access` ainda pode disparar o fluxo de permissões do sistema, mas não acrescenta
aprovação por ação no nível do modelo.

Frame stale, Helper indisponível, permissão negada, `possibly_sent` e anexo perdido devem falhar
fechado e retornar um resultado estruturado. Pedidos de subagent retornam diretamente CUA
unavailable.

## Limites de observação após ações

As ferramentas de ação retornam por padrão apenas o resultado da ação e não chamam
`get_app_state` automaticamente dentro da ação. Depois que um elemento sofre escrita, o runtime
compartilhado continua marcando o estado antigo como necessitando de refresh e recusa reutilizar um
`state_id` antigo enquanto o refresh não for concluído; portanto desativar a observação implícita
não afrouxa a verificação de segurança de estado stale. Cada célula `node_repl` gerada pelo modelo
que contenha uma ou mais ações de UI precisa chamar explicitamente uma observação
(`app.getAXState()`) no final, e é esse método que apresenta o resultado por conta própria — **não**
envolva isso em mais uma camada de `nodeRepl.write(state.text)` (ver o contrato de saída da seção
anterior); ação e observação ficam na mesma chamada externa de tool, evitando mais uma chamada
independente de `mcp__node_repl__js`. A mesma célula pode executar em lote ações fortemente
relacionadas, mas observa apenas uma vez no final.

O resultado de ação padrão não carrega `state_sync_status`; o resultado só acrescenta um post-state e
seu `state_sync_status` quando se pede explicitamente `return_state="compact"|"full"`. O workflow
comum mantém `return_state="none"`, deixando um único `get_app_state` explícito no fim da célula
capturar o estado uma vez, evitando que cada ação do SDK gere internamente um `capture_app` e
evitando mais uma chamada independente de tool node_repl após a operação.

Os indicadores de operação no Windows e o PiP no macOS continuam consumindo os eventos de sideband
do shared host; para `mcp__node_repl__js`, o sideband carrega apenas o `operationAction` fixo,
analisado a partir do nome de chamada do SDK, e não carrega código JS, argumentos ou credenciais.
Chamar apenas `agent.browsers.*` do Browser Use não dispara o indicador de CUA.

> **Substituído (2026-09-14)**: a convenção de `operationAction` aqui dependia da extração do nome
> da ação a partir do código gerado pelo modelo e ficou totalmente desalinhada depois que `e2d7a9f2e9`
> remodelou a surface do SDK, com o indicador do Windows deixando de funcionar. Agora o sideband
> carrega apenas o fato booleano `computerUse` (a âncora é a instrução de bootstrap
> `setupComputerUseRuntime`). Ver `2026-09-14-windows-cua-indicator-repair-spec.md`. As duas
> conclusões "não transporta código/argumentos/credenciais" e "Browser Use não dispara o indicador"
> permanecem inalteradas.

### Reforço do contrato de observação dirigido por logs em 2026-08-25

O `structuredContent` de `get_app_state` é a única fonte de fato estruturada do SDK no Worker e
precisa atravessar

```text
Helper capture_app
  -> CuaRuntime / observation mapper
  -> broker JSON response
  -> node_repl bridge
  -> computer-use-client.mjs
```

Os três modos de observação — completo, `delta` e `no_change` — precisam retornar o mesmo conjunto
de campos de AppState (pelo menos `state_id`, `elements`, `app`, `window` e `text`); o modo
incremental pode comprimir o texto da árvore AX em um resumo das mudanças, mas não pode omitir a
lista estruturada de elementos acionáveis. Como cada `js` é um Worker novo, o SDK não pode depender
da memória do Worker anterior para recuperar um `state_id` ou elementos que faltaram.

Se o SDK receber uma resposta de `get_app_state` sem o AppState completo, precisa lançar o erro de
contrato estável `STRUCTURED_STATE_UNAVAILABLE` (`ComputerUseError.code`) e interromper as ações
seguintes; é proibido deixar o modelo receber `undefined` e adivinhar ou codificar um `state_id`
antigo por conta própria. O resultado da observação é emitido automaticamente pelo SDK (desligável
com `{ emit: false }), e o modelo não injeta mais manualmente o texto AX.

Observações que não apresentam resultado precisam se autodeclarar: as observações de vinculação de
`getApp`, `getScreenshot` (sem texto de árvore) e `elements()` (devolve apenas o array
estruturado) precisam passar `tree_shown_to_model: false`, senão o registro de deslocamento de
índices do producer contará como vista uma árvore que o modelo não viu, e a validação degenera em
comparar a árvore atual consigo mesma; além disso, esses caminhos precisam limpar o `treeSeen` do
lado do SDK para forçar a árvore inteira no próximo `getAXState`, evitando que o modelo receba um
diff relativo a uma árvore não apresentada.

A visão do Worker mantém apenas os campos de SDK de que o modelo precisa, removendo o `content`
legado, a duplicata `message`, o `_meta`, o base64 da imagem e a autorização interna de frame,
evitando despejar novamente um envelope sensível ou de grande volume em
`console.log(JSON.stringify(result))`. A skill precisa tratar "observar explicitamente no fim da
célula de ação e escrever o texto AX" como template fixo, proibindo usar o JSON de resultado da
ação como saída da célula.

## Migração e histórico

- Remover o MCP server independente do CUA, as projeções antigas de ferramentas, os aliases e
  qualquer novo caminho de execução.
- As novas chamadas usam uniformemente o renderer genérico do node_repl; capturas de tela e
  resultados estruturados continuam no caminho de imagens do node_repl.
- Para transcripts históricos, manter a leitura da interpretação antiga de
  `mcp__computer-use__*`, proibindo qualquer novo registro ou execução.

## Aceitação

1. A lista de ferramentas de uma nova sessão não contém nenhum `mcp__computer-use__*`, e a primeira
   rodada contém apenas a descrição das ferramentas do node_repl.
2. Os 14 contracts de CUA sobreviventes, chamados via SDK, mantêm o schema original, as validações
   de estado e a cobertura de oracles externos; nomes de ferramentas já removidos não podem
   aparecer em nenhuma documentação visível ao modelo (travado por contract test).
3. Múltiplas chamadas de Worker no mesmo shared host não criam um processo MCP de CUA independente
   nem fazem a memória do runtime crescer linearmente.
4. Browser Use, desktop continuous, celular replayable, isolamento de subagent e replay de
   transcripts antigos passam na regressão.