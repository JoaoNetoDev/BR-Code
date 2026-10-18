# V4 Chat Turn Render Units

## Objetivo

O protocolo de conversa v4 mantém o modelo de fatos plano `ConversationRow[]`; a UI não trata cada row como uma mensagem visível, mas primeiro deriva uma unidade visual de renderização de turn e então renderiza a interface de chat.

O objetivo central é reproduzir a semântica de leitura do ChatView antigo:

- A query do usuário fica acima, e o trabalho do assistant fica abaixo daquela query do usuário.
- `turnHeader` é um limite de protocolo e um fato de diagnóstico, e não aparece diretamente como uma linha visível ao usuário.
- Reasoning, tool, explore, subagent, timeline de compactação e corpo do assistant pertencem todos ao mesmo turno de trabalho do assistant.
- Cada input inicial ou cada guided input injetado com sucesso abre um segmento visual de trabalho independente; segmentos concluídos normalmente são recolhidos por padrão como "已工作 N 秒", e segmentos em execução ou encerrados com desfecho anormal interrupted / failed / error são forçados a abrir.
- O `/compact` manual é um comando de manutenção e não exibe um bubble de usuário `/compact`; exibe apenas a timeline de compactação / atividade de trabalho do assistant.

## Estrutura

```text
ConversationSnapshot.rows.window
  |
  | buildConversationTurnRenderUnits(rows)
  v
ConversationTurnRenderUnit[]
  |
  +-- product turn identity / final action target
  +-- workSegments[]
      +-- trigger user input（首段为原始输入，后续为 guided input）
      +-- history status + rows（每段独立折叠）
      +-- assistant text / following rows
  +-- tail boundary rows
```

`ConversationTurnRenderUnit` é um view model de UI; não altera os fatos do protocolo v4 nem participa de command target, snapshot recovery ou da verificação de gap replayable.

## Visibilidade de `/compact`

O `/compact` manual é disparado pelo command `compact` do v4. Ele não é uma query real do usuário:

```text
composer "/compact"
  -> command compact
  -> runtime compact turn
  -> compact timeline marker
  -> no visible user bubble
```

O runtime / projection precisa fornecer `inputVisibility="model-only"` ou uma semântica de manutenção equivalente, de modo que a projection não gere uma row visível de `userInput`. O view model de UI é proibido de farejar `userInput.text === "/compact"`; quando o campo estiver ausente em históricos antigos, a hydration do transcript da CLI normaliza para a visibilidade/origem/marcador canônicos antes de enviar.

Turn actions consome `row.actions` linha a linha. Toda row de assistant que tenha action precisa renderizar a entrada de action; não se pode usar `lastFlowRow`, a posição no array dentro do turno ou a regra de "último assistant" para esconder de novo ações que a CLI já autorizou.

## Histórico de trabalho do assistant

Cada product turn é primeiro dividido em segmentos visuais de trabalho pelos `userInput` guiados e, dentro de cada segmento, dividido pelas regras a seguir. Essa divisão afeta apenas a área de trabalho da UI e não cria um novo `turnId` / `productTurnId`:

- `latestAssistantTextRow`: a última row `assistantText` do turno, exibida como o corpo mais recente.
- `historyRows`: as rows de reasoning, toolCall, subagent, marcador de compactação e `assistantText` anteriores ao latest assistant text dentro do turno.
- `tailRows`: as boundary rows posteriores ao latest assistant text dentro do turno, como aviso de fork / verificação de goal. Elas pertencem ao fechamento deste turno, mas não são histórico de trabalho do assistant e não podem ser recolhidas por "已工作 N 秒" acima do corpo.
- Se não houver latest assistant text, todas as rows de assistant são history rows e devem ser abertas, evitando um assistant vazio que só mostra "已工作" sem conteúdo.
- O segmento running atual deve abrir o history; quando um novo guide chega, o segmento anterior é fechado e pode ser recolhido de forma independente, e o novo segmento usa seu próprio estado de abertura.
- Os estados terminais anormais `completedInterrupted`, `failed` e `error` devem forçar a abertura do history, mesmo já existindo um partial de assistant interrupted / failed; o contexto anormal não pode ficar escondido dentro do recolhimento "已工作". `completedSuccess` continua seguindo a regra de recolhimento padrão de conclusão normal.
- Quando a recuperação a frio encontra uma mensagem de assistant do transcript sem tempo de conclusão, isso indica que o aplicativo ou o Agent saiu antes do fechamento do turno; a hydration precisa normalizar esse turno órfão para `completedInterrupted`, sendo proibido forjar `completedSuccess` e disparar o recolhimento normal.
- O rótulo de estado do histórico de trabalho do assistant precisa distinguir execução, conclusão normal e interrupção: em execução mostra "工作中 N 秒", em encerramento normal mostra "已工作 N 秒", e a última parte de `completedInterrupted` mostra apenas "已停止" / `Stopped`, sem duração. Turnos com guide priorizam o tempo segmentado autoritativo de `turnHeader.workSegments`; apenas snapshots comuns ou antigos sem fato de segmentação recorreem ao `activeMs` de nível de turno, a `endedAt - startedAt` ou ao relógio de UI do runtime.
- `turnHeader.executionKind` é o fato autoritativo sobre a existência de um ciclo de vida de trabalho do Agent. Turnos `controlOnly` carregam apenas inputs de controle visíveis e não produzem work status; snapshots antigos sem o campo só obtém derivação compatível quando há row real de trabalho, execução em andamento ou tempo positivo de trabalho.
- `lightBoundary` (por exemplo, troca de modelo) é separado primeiro das rows de trabalho do assistant, e só então o work status é calculado; a própria linha de fronteira não pode empurrar uma query control-only para "工作中/已工作".

```text
turn
  workSegment(initial)
    userInput(real user)
    historyStatus(running ? "工作中 11 秒" : "已工作 11 秒")
    historyRows(collapsed by default)
    assistantText
  workSegment(guide-1)
    userInput(guided)
    historyStatus(independent)
    assistantText
  tailRows(always after product-turn final assistant text)
```

A cadeia de estado do rótulo em execução:

```text
ConversationSnapshot.rows
  -> buildConversationTurnRenderUnits(rows, nowMs)
  -> split leadingBoundaryRows / assistantWorkRows
  -> unit.workSegments[].workStatus { state, durationMs } | undefined
  -> each segment AssistantHistoryStatus
       state=running   => "工作中 N 秒"
       state=completed => "已工作 N 秒"
       state=interrupted => "已停止"
       undefined       => 不渲染工作状态
```

A query visível de `/goal` e a continuação real são dois product turns, mas apenas a segunda executa o Agent:

```text
model A completed
  -> select model B
  -> /goal controlOnly turn
       leadingBoundary(modelChange) + userInput
       no session running / activeWorks / workStatus
  -> goalContinuation agent turn
       session running + one work segment status
```

## Limites da rolagem virtual

A unidade de rolagem virtual é a turn render unit, e não a row bruta. Motivos:

- A query do usuário e o seu trabalho de assistant não podem ser separados por um `turnHeader` ou por uma linha de ferramenta.
- As ferramentas explore / agent / subagent já têm sua própria semântica interna de recolhimento e agregação, e a rolagem virtual não pode entrar dentro dessas agregações.
- O estado de history recolhido precisa ser memorizado por turn / chave de trabalho do assistant, e não por índice transitório de row.

## Agregação de Explore e visibilidade de reasoning

Explore é uma visão de agregação de UI do trabalho do assistant e não altera a ordem original de `ConversationRow[]`. O limite de agregação precisa ser coerente com a visibilidade de reasoning do fluxo de mensagens atual:

- Com "显示思考过程" ligado, todo reasoning é visível e também é um limite rígido de Explore; as ferramentas somente-leitura dos dois lados são agregadas separadamente.
- Com "显示思考过程" desligado, o primeiro reasoning de cada turno ainda é exibido pelas regras existentes e preserva o limite; os demais reasonings ocultos são transparentes para a agregação de Explore, e as ferramentas somente-leitura consecutivas antes e depois são mescladas no mesmo Explore.
- A regra de transparência vale apenas para rows de reasoning ocultas pelo interruptor de reasoning. Texto de assistant visível, reasoning visível, ferramentas fora de exploração, subagent, marcadores de timeline etc. ainda encerram o Explore atual, e a ordem original das linhas não pode ser reordenada para ampliar a agregação.
- Essa é uma semântica compartilhada de view-model de UI, e Desktop, Web e o controle remoto do celular usam o mesmo resultado; não é permitido modificar as fronteiras de mensagem do conversation snapshot, do `desktop-continuous` ou do `web-remote-replayable`.

```text
raw rows:       Explore(A) -> reasoning(2) -> Explore(B)
                                  |
showReasoning: on                visible
render items:   Explore(A) -> reasoning(2) -> Explore(B)

showReasoning: off               hidden / transparent
render items:   Explore(A + B)
```

## Estado de expansão do reasoning

Se a row de reasoning no fluxo de mensagens é exibida é decidido pela configuração "显示思考过程" e pela regra do primeiro reasoning de cada turno; depois de exibida, o estado de expansão do seu conteúdo segue uma semântica unificada de baixa interferência:

- Reasoning em streaming e reasoning completo aparecem inicialmente sempre recolhidos, mostrando apenas o gatilho "正在思考" ou "思考".
- O conteúdo só é expandido depois que o usuário clica no gatilho; chunks de streaming posteriores e as transições de estado `streaming -> complete/interrupted` não podem sobrescrever a escolha manual de abrir/recolher do usuário.
- `isStreaming` continua responsável pelo texto de estado de execução e pela contagem de duração e já não equivale implicitamente a `open=true`.
- O estado de expansão pertence à interação local da UI compartilhada, não é gravado no conversation snapshot e não altera a ordem de linhas do Desktop continuous nem do Web remote replayable.

```text
reasoning row visible
  -> default closed
  -> user toggles open/closed
  -> streaming state updates preserve the user's choice
```

## Painel de status

O canto superior direito do chat v4 recupera a semântica do status panel do ChatView antigo e não usa pills de resumo:

- Ferramentas Git: resumo de mudanças do worktree, branch, ações de commit/push/create branch.
- Goal: estado do objetivo atual.
- Todo / Plan: usar prioritariamente `plan.items` do v4; se mais tarde o snapshot v4 receber `todoGroups`, restaurar o todo de iteração do goal.
- Running: bash/subagent em execução entre `backgroundWorks`.

O painel de status é uma camada derivada de UI e não modifica a semântica do conversation stream, da queue, do owner command, do desktop continuous nem do mobile replayable.

A forma do painel de status reaproveita a interação do summary panel do ChatView antigo, em vez de uma expansão fixa de uma só vez:

- O painel tem apenas duas formas renderizáveis, `panel` e `mini`; `auto` é a estratégia de resolução quando o override do usuário está vazio, e não uma terceira DOM.
- O JavaScript não mede mais a largura do contêiner do chat nem troca `panel` / `mini` automaticamente; sem override do usuário, o padrão resolve para `panel`, e os layouts largo e estreito passam a ser responsabilidade uniforme do CSS.
- O menu no canto superior direito do estado expandido mostra apenas "自动", usado para devolver o override a `null`; os modos manuais `panel` / `mini` continuam sendo escritos pelos botões de recolher/expandir do painel, e as opções de menu "始终展开 / 始终收起" deixam de ser exibidas.
- `mini` é o estado recolhido do mesmo shell flutuante e exibe a linha de resumo mais importante no momento: todo / goal em andamento, running, diff do Git, progresso de goal concluído ou de todo. Enquanto a seção de goal tiver conteúdo, `active`, `notSatisfied`, `paused`, `verifying` e `verified` devem todos preservar uma linha de resumo de goal clicável, sem deixar um shell vazio; o título compartilha `summaryTitle.trim() || objective.trim()` com o estado expandido e não pode degenerar no estado recolhido para um objective longo ou texto vazio.
- O estado expandido mantém no topo o título, o menu de mais opções e o botão de recolher; por dentro ele é dividido em seções Git / Goal / Todo / Running, e cada seção pode ser recolhida de forma independente.
- Esse override pertence às preferências de UI do workspace shell, é passado por `WorkspaceShellLayout -> V4WorkspaceChatArea -> WorkbenchPane -> SessionPane` e não pode cair dentro do conversation snapshot do v4.

A área principal de chat segue `WorkspaceShellLayout -> V4WorkspaceChatArea -> WorkbenchPane -> SessionPane`. `V4WorkspaceChatArea` precisa colocar no shell binding do pane principal o workspace Git summary, a contagem de arquivos dirty, o resumo de mudanças do worktree, o resumo de mudanças da tarefa ativa, a variante do summary panel e o refresh handler que o shell já mantém; e `WorkbenchPane` repassa as props de Git/status de nível de workspace apenas para o `SessionPane` do pane de workspace do shell, sendo que o resumo de mudanças da tarefa ativa é repassado somente ao pane principal. Um pane não principal de outro workspace não pode reaproveitar o Git summary do workspace atual do shell, evitando exibir o estado do repositório errado na tela dividida.

Git Tools só é exibido quando o worktree tem `added + removed > 0`; um repositório limpo não pode montar um status panel só por ser um repositório Git.

## Limites entre plataformas

- O Desktop `desktop-continuous` continua usando a cadeia principal continuous direta.
- O Mobile `web-remote-replayable` continua recuperado por snapshot / gap replayable, sem buscar o histórico completo por causa da rolagem virtual da UI.
- `workspaceIdentity?.trim() || workspacePath` é usado apenas para o isolamento de identidade do workspace; a exibição de arquivos e o cwd dos comandos continuam usando `workspacePath`.