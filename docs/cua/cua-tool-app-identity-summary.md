# Resumo da Identidade de App na Ferramenta CUA

## Objetivo

O resumo da ferramenta CUA exibe o nome e o ícone do App-alvo desde a fase de início da execução,
quando o Agent já observou a identidade do App via `list_apps` e as chamadas seguintes carregam
explicitamente o PID, reduzindo o custo de identificação de operações CUA consecutivas.

## Origem da identidade na era `node_repl` (2026-09-17)

Depois que o Computer Use foi concolhido à superfície JS do `node_repl`, o único nome de ferramenta
visível ao modelo passou a ser `mcp__node_repl__js`, e todo o critério baseado em nomes de ferramenta
`mcp__computer-use__*` do qual as seções "Fontes de Fato e Temporalidade" e "CUA Tool Call Group"
abaixo dependem deixou de valer, permanecendo válido apenas para **replay de sessões históricas**.
Novas sessões seguem a projeção desta seção.

```text
Helper application_info / capture
        |
        v
producer 统一 wrapper 附加 _meta["zcode.cua/app-associations-v1"].primary
  { appKey, displayName?, icon? }
        |
        v  broker 响应（沙箱不可见）
node-repl-host CUA bridge —— 唯一可信记录点
        |
        v  run 结果的可信槽位
node_repl 工具结果 _meta["zcode/nodeReplCuaApp"] = { appKey, displayName? }
        |
        v
Core display `node_repl_images.app`
        |
        v
Node REPL 工具卡 leading icon -> IPlatformService.getApplicationIcon(locator)
```

- **Fronteira de confiança**: a identidade só pode ser registrada pela CUA bridge do node-repl-host ao
  receber a resposta do broker. `nodeRepl.setResponseMeta` e `nodeRepl.emitStructuredResult` estão
  montados em globals de sandbox visíveis ao modelo, portanto qualquer `zcode.cua/app-associations-v1`
  que chegue por esses dois canais é **descartado** e não pode participar da exibição (o mesmo
  tratamento já aplicado a `zcode/nodeReplBrowserScreenshotContentIndices`). A chave
  `zcode/nodeReplCuaApp`, escrita pelo próprio host, é a única consumida pelo Core.
- **Múltiplas chamadas em uma mesma cell**: o último método CUA a produzir `primary` vence, coerente
  com a semântica last-write-wins já existente em `_meta`. `request_access`,
  `stop_computer_control` declaram `none` e `list_apps` declara `items`; nenhum dos três produz
  `primary`, portanto não sobrescrevem a identidade anterior.
- **Resolução de ícone**: o `appKey` deriva o locator por prefixo — `darwin:` →
  `darwin-bundle-id`, `windows-aumid:` → `windows-aumid`, `windows-exe:` →
  `windows-executable-path`. `linux-exe:` não tem locator correspondente e, assim como no controle
  remoto Web/mobile, cai no ícone genérico do Node REPL. O PNG `icon` embutido no `_meta` do producer
  **não é projetado**: o protocolo de sessão não transporta data URL (ver "Protocolo e Exibição"
  abaixo), e o ícone do mesmo app se repetiria dezenas de vezes ao longo de uma sessão longa.
- **Fora do escopo desta vez**: o nome `app` não entra na linha de resumo (o `title` do `js` já foi
  descrito pelo modelo para esta ação, e repetir o nome do App seria redundante); os `items` de
  `list_apps` não são projetados (não há card de listagem item a item sob `node_repl`); o agrupamento
  CUA Group continua válido apenas para sessões históricas.

## Fontes de Fato e Temporalidade

> Esta seção e "CUA Tool Call Group" são desviadas pelo nome de ferramenta `mcp__computer-use__*` e
> valem apenas para replay de sessões históricas; para novas sessões, ver a seção acima.

```text
list_apps #1 success ── snapshot #1 ── pid tool ── pid tool
list_apps #2 success ── snapshot #2 ── pid tool ── ...
```

- O escopo do snapshot é o fluxo ordenado de eventos de uma única task; não pode ser reutilizado
  entre tasks/sessões.
- Apenas um resultado de sucesso do `list_apps` oficial do CUA substitui o snapshot por inteiro;
  um resultado de falha preserva o snapshot antigo.
- Quando uma tool CUA oficial seguinte é agendada, consulta-se primeiro o snapshot atual a partir do
  `app_ref.pid` já presente na entrada; sem PID, consulta-se por `bundle_id` exatamente igual. `name`
  não é usado como chave de busca.
- `app_ref` / posição equivalente de AppRef aceita tanto objetos estruturados quanto strings JSON
  parseáveis como objeto, mantendo consistência com a normalização de entrada da camada de execução
  do CUA; strings inválidas não participam do casamento.
- Não há busca reversa a partir de `state_id`, nenhuma chamada implícita a `list_apps` por causa do
  resumo, e nenhuma adivinhação do App para operações globais como screenshot e espera.
- A recuperação a frio reconstrói o snapshot pelo mesmo log de eventos; consumo continuous e replayable
  consomem os mesmos fatos de `ToolCallRow`.

## Protocolo e Exibição

`ToolCallRow` pode carregar opcionalmente:

```ts
cuaApp?: {
  pid: number;
  name: string;
  bundleId?: string;
};
```

A identidade exibida prioriza o App presente no resultado de conclusão da própria chamada, em
segundo lugar o `cuaApp` fixado no momento do agendamento e, por fim, o fallback `Computer Use`. Em
caso de match, exibe-se `App Icon + App Name + Action`; o ícone é resolvido de forma assíncrona pelo
serviço de plataforma a partir do `bundleId`, sem gravar data URL no protocolo de sessão. Quando a
plataforma não suporta, não há bundle id ou a leitura do ícone falha, o CUA Icon é mantido, mas o nome
do App continua sendo exibido.

### Rótulo de alvo da ação de elemento

- A tag de alvo da ação usa uniformemente `text-ui-sm`, como informação secundária compacta do
  corpo App/ação.
- Após `left_click`, `right_click` e `type`, prioriza-se o nome legível do elemento-alvo no estado do
  resultado como tag de resumo.
- Se o elemento-alvo tiver apenas um nome-placeholder numérico igual ao index, é possível ler, na
  lista plana de elementos do estado do resultado, os nós de texto contínuos do seu final até o
  próximo elemento acionável e combiná-los em um rótulo. Por exemplo, após `[59] 59 (pressable)`, o
  trecho "智谱 / 快速 / 订餐" é exibido como "智谱快速订餐".
- Essa leitura deve parar no próximo elemento `pressable` ou `editable` e não pode concatenar textos
  alheios atravessando resultados de busca; quando não for possível obter texto confiável, continua
  recurrendo ao index do elemento.
- Ao recorrer apenas ao index numérico puro, a tag de resumo deve exibir o `元素 #57` /
  `Element #57` localizado, sem expor `57` diretamente; nomes legíveis de elementos já resolvidos
  permanecem inalterados.

### Momento da Expansão

- Todas as ferramentas CUA, nas fases `pending` / `running`, exibem apenas o resumo, sem oferecer
  entrada de expansão e sem responder a `forceOpen` da camada superior.
- Só após a ferramenta entrar no estado de conclusão é permitido expandir pelas regras de detalhe
  existentes; screenshots de falha sem dados de imagem não renderizam o item de screenshot.

## CUA Tool Call Group

O CUA Group é uma projeção de exibição renderer-only do V4, mas a atribuição de response necessária
para o agrupamento é um fato de protocolo. No V4, `ReasoningRow`, `AssistantTextRow` e `ToolCallRow`
apontam, via `assistantResponseId` opcional, para o `assistantMessageId` já existente no runtime;
o continuous do desktop e o replayable do mobile constroem o Group de forma determinística a partir
dos mesmos fatos ordenados de rows.

```text
Assistant response start
                 ── 创建稳定 ResponseEnvelope，正文正常 streaming
response 只含官方 CUA
                 ── reasoning + message + CUA 加入或延续活动 Group
response 含非 CUA tool
                 ── 关闭旧 Group；message/非 CUA 外置，CUA 从新 Group 开始
response 无 tool ── message 外置，response/turn 完成时关闭 Group
未分类 reasoning / message
                 ── 外置显示，本身不关闭 Group
marker / status  ── 外置显示，本身不关闭 Group
turn / work segment / user boundary
                 ── 强制关闭 Group
```

- Um único CUA oficial também forma um Group; MCP de terceiros com o mesmo nome não participa.
- A identidade estável do Group e seu positionamento são ancorados no primeiro Assistant response que
  contenha CUA oficial, usando o `assistantResponseId` dele como key; deixa de ser ancorado na tool
  call. Apenas responses somente de tools usam a primeira CUA como fallback visual.
- No início do response, o reasoning e o corpo sempre aparecem em fluxo no lugar original, sem criar,
  fechar ou suspender dentro de um CUA Group; quando a CUA oficial do mesmo response chega, o
  reasoning, o corpo e o contêiner são removidos de fora e entram inteiramente no Group.
- Quando chega algo não-CUA, o corpo permanece fora e o Group antigo é fechado; o text-only só é
  confirmado e o Group antigo fechado quando o response é concluído e ainda não tem tools. Mensagens
  em streaming não classificadas não entram no resumo de rolagem.
- Depois que o response é confirmado como CUA puro, o item de render Assistant externo deve ser
  removido por inteiro, incluindo RowShell, espaçamentos e contêiner de actions; ao expandir o Group, a
  mesma row renderiza internamente um contêiner de mensagem completo, não sendo permitido mover
  apenas o corpo e deixar uma casca vazia.
- O history chunk na projeção de flow externo também deve passar pela projeção interna de
  visibilidade e agrupamento de ferramentas; se após a projeção não houver nenhum item renderizável,
  não se deve criar `CollapsibleContent`, padding nem contêiner de work-items. Isso garante que o
  consumo CUA de uma message ou o atraso de classificação de ferramenta em execução não deixe uma
  estrutura de history vazia capaz de ocupar espaçamento fora do Group.
- `request_access`, `list_apps` e os demais `mcp__computer-use__*` oficiais são tratados por igual. MCP
  de terceiros com o mesmo nome é tratado como tool não-CUA. Marker e todo/status não entram no
  Group nem o fecham ativamente.
- Quando snapshots antigos não têm `assistantResponseId`, apenas as CUA tools são agregadas, sem
  adivinhar reasoning/message adjacentes, mantendo o fallback de compatibilidade.
- Tanto o Group ativo quanto o Group já fechado permitem que o usuário expanda todos os filhos CUA por
  clique ou teclado; o Group ativo continua ignorando `forceOpen` da camada superior, evitando a
  expansão automática passiva durante a execução, mas sem desabilitar mais a entrada de expansão
  manual.
- Os detalhes expandidos usam um viewport interno de rolagem com altura máxima fixa; na primeira
  expansão, ao adicionar um filho ou quando a altura dos detalhes muda, a rolagem sempre vai ao fim,
  mantendo o evento CUA mais recente visível e sem fazer a conversation externa crescer sem limite.
- O viewport interno de rolagem reaproveita a máscara condicional de bordas superior/inferior do
  Thinking: o gradiente de 24px só aparece quando ainda há conteúdo oculto naquela direção, e é
  removido ao rolar até o topo ou o fim; os temas claro e escuro usam a mesma semântica de opacidade.
- O resumo recolhido em execução é `<conteúdo rolável> · N events[, M messages]`; após a conclusão,
  converge de forma fixa para `<CUA Icon> Computer Use · N events, M messages`, sem manter o último
  conteúdo de App/ação. No estado concluído o nome de produto sempre segue o locale: em inglês exibe
  `Computer Use`, em chinês exibe `电脑控制`; e exibe a contagem de messages, incluindo `M=0`. `N`
  conta o reasoning, o CUA e as Assistant messages atualmente visíveis dentro do Group; reasoning
  oculto por "mostrar processo de pensamento" não conta, e o primeiro reasoning continua seguindo o
  contrato global de visibilidade. `M` conta apenas Assistant messages; plural e quantificador chinês
  passam por i18n. O ponto separador e as contagens não são concatenados com caractere de espaço, mas
  exibidos como nós de layout independentes.
- O CUA Icon no estado concluído ocupa o slot de leading icon do resumo comum de tool, com cor igual
  à dos demais tool icons usando `text-foreground-subtlest`; o estado concluído não passa mais pelo
  contêiner de resumo rolável, evitando que um primary slot vazio adicione espaçamento extra entre o
  nome de produto e o ponto separador. No estado em execução, o App/CUA icon continua pertencendo ao
  conteúdo rolável e não participa do gradiente de texto.
- O conteúdo rolável projeta apenas CUA em estado final: sem identidade de App exibe
  `CUA Icon + Computer Use + Action`; com identidade exibe `App Icon + App Name + Action`. Assistant
  messages não entram como candidatas de rolagem nem disparam animação de rolagem; continuam
  contando em events/messages e são exibidas na linha do tempo expandida com cor de texto secundária,
  sem repetir o ícone. Falha no App icon só recorre ao ícone, sem perder o nome do App.
- O texto de ação dinâmico no resumo CUA deve usar as locale keys de zh/en já declaradas. `key` e
  `hold_key`, quando a entrada contém teclas combinadas, exibem a ação localizada mais a tag de teclas
  combinadas; `list_windows` exibe a contagem localizada de janelas quando a quantidade é parseável no
  resultado, e nenhum caminho de renderização pode vazar message id para o usuário.
- Os ícones App/CUA do Group summary são colocados uniformemente em um contêiner
  `shrink-0 size-4 flex items-center justify-center [&_svg]:size-4`: o SVG de fallback do CUA
  mantém `size-4`; o App Icon real recebe explicitamente `size-5` de `CuaAppSummaryIcon` no momento da
  projeção do Group, sem usar o descendant selector do pai para sobrescrever seu `size-4` padrão.
  Nenhum dos dois participa da compressão de texto; usa-se `gap-2` entre o contêiner do ícone e o texto
  rolável.
- As CUA tools filhas depois de o Group ser expandido também recebem o App Icon `size-5` por meio de
  um render context explícito; o renderer da tool filha adiciona ao ícone um contêiner pai fixo
  `shrink-0 size-4 flex items-center justify-center`, para que o App Icon de 20px seja exibido
  centralizado em um slot de 16px. A tool CUA isolada comum continua usando o `size-4` padrão, sem
  esse contêiner extra; nenhuma das duas usa descendant selector de CSS para sobrescrever o tamanho
  da imagem.
- Quando o pai virtual está `in_progress`, o nome do App e a ação no resumo rolável usam a faixa de
  brilho rápida legada exclusiva do CUA: `1s / 200% / faixa fraca 40%–60% / 0.5s delay`. Ícones,
  separadores, contagens e estados de falha não participam da animação; com reduced-motion a rolagem e
  o gradiente são desligados.
- Itens de rolagem consomem apenas filhos CUA em estado final: `success / error / cancelled` correspondem,
  via adaptadores legados, a `completed / failed / stopped`. Os estados de streaming, conclusão ou falha
  de Assistant messages não geram chave de rolagem; outras CUA ativas e messages não sobrescrevem o
  resumo da última tool em estado final.
- Falha de negócio é estado final e entra na fila de rolagem, mas erros longos aparecem apenas em
  tooltip e detalhes.
- A rolagem reaproveita a semântica de reprodução de atualizações ao vivo do Explore; a recuperação a
  frio exibe diretamente o último item final, sem reproduzir animações históricas.
- Os detalhes expandidos exibem em ordem original de response/part: o reasoning reaproveita o
  componente de Reasoning existente e as regras de visibilidade, mas como o Group já atua como
  fronteira de pai, o conteúdo de pensamento expandido não repete o fio e a indentação à esquerda; o
  CUA reaproveita os detalhes de tool existentes; Assistant messages usam uma linha leve de corpo sem
  ícone e sem as actions de copy/fork/retry/preview do corpo final.
- O fluxo principal de turn e o caminho de work items de compatibilidade history/background-result
  devem passar ao mesmo renderer de CUA Group os `events` completos. O caminho de compatibilidade não
  pode passar apenas o pai virtual, senão as Assistant messages desaparecem da linha do tempo expandida
  após serem consumidas pela projeção externa.
- Os "dados brutos" nos detalhes das CUA subferramentas devem exibir o JSON `toolCall` completo, e não
  apenas input/output separados; `toolId`, nome da ferramenta, status, `raw.display`, `v4Status` e os
  metadados de streaming são fatos necessários para diagnóstico. Os dados completos ficam em uma
  disclosure de segundo nível, colapsados por padrão, para não comprometer a legibilidade do detalhe
  comum.
- O Group não atravessa user input, turn, work segment, workspace nem session.

## Compatibilidade e Semântica de Falha

- Quando o snapshot antigo não tem `cuaApp`, o resumo atual é mantido.
- No Linux, `bundle_id` pode ser vazio e o nome ainda pode ser usado; no Windows, `bundle_id` pode ser
  um AUMID.
- O PID é tratado, entre dois `list_apps` explícitos, como o fato mais recentemente observado pelo
  Agent; mudanças no sistema não disparam refresh implícito.
- MCP de terceiros, mesmo com nome de ferramenta semelhante, não pode receber a projeção de identidade
  oficial do CUA.