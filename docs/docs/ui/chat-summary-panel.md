# Painel de Status do Chat

> **Status atual**: este documento descreve a semântica de produto atual e os limites de projeção do `ConversationStatusPanel` da V4.

O painel de status do chat é o painel de status permanente no canto superior direito do conversation pane da V4, usado para exibir de forma centralizada as ferramentas Git, o progresso
do goal, o catálogo de planos em estado terminal, os todos e os recursos de execução em segundo plano. `packages/ui/src/v4/ConversationStatusPanel.tsx` usa o mesmo shell para
conter o conteúdo recolhido / expandido.

## Regras de Exibição

- Quando o pane V4 atual já está vinculado a uma session e há conteúdo exibível, o status panel é exibido; sem override do usuário, a forma é decidida pelo container query
  nomeado `conversation`: quando o container tem menos de `1280px`, exibe-se o mini e a sessão não é deslocada; ao atingir `1280px`, o painel completo é expandido e a coluna de
  mensagens e o Composer são deslocados em `168px` para a esquerda. O modo sempre expandido reutiliza a mesma regra de deslocamento `@min-[1280px]`, sem deslocamento em container
  estreito; o modo sempre recolhido nunca desloca. O layout largo `max-w-6xl` da Conversation também é habilitado de forma unificada após `1280px`. Essa decisão não pode ler
  `window.innerWidth` nem registrar `ResizeObserver`: a tela dividida e as variações do pane direito são unificadas e dirigidas pelo tamanho de container do CSS.
- No estado de nova tarefa / rascunho o status panel não é exibido, evitando que o bloco de Git tools ocupe o estado vazio e a entrada de texto.
- Uma task existente só exibe o bloco de Git tools quando no worktree atual `added + removed > 0`; um repositório limpo não monta o status panel só por "ser um repositório Git".
- Quando há task existente, mas Git, goal, todo e running não têm nada exibível, o status panel não é montado e não há inline offset reservado para o painel completo. Subagents
  encerrados não montam mini/status panel isoladamente; as abas de diretório já abertas pelo usuário não são afetadas.
- O nó raiz do componente `ChatViewEmptyState` reutiliza `CHAT_VIEW_SUMMARY_PANEL_INLINE_OFFSET_CLASS_NAME` quando o status panel completo usa layout inline, e mantém a
  transição de transform, alinhando-se horizontalmente à coluna de mensagens e à área de entrada; a empty region externa e o placeholder de carregamento de restauração de task
  compartilham o layout centralizado e não aplicam esse deslocamento.
- O workspace header não exibe interruptor do status panel; no estado expandido, o botão no canto superior direito do painel recolhe; no estado recolhido, clicar na linha de resumo expande.
- A linha de resumo recolhida exibe apenas um resumo, sem juntar o status principal e a atividade em tempo real na mesma cápsula. **O workflow em execução vem primeiro**: sempre que houver
  um workflow run pending / running, a cápsula mostra o nome do primeiro (ordem de início), a luz de status, a palavra de phase e `+n` (regras em
  `docs/dynamic-workflow/presentation.md`, seção "Other places a run appears"). Ela fala de nome e posição, não de uma contagem, portanto não duplica a contagem de segundo plano da
  caixa de entrada. Ao clicar em uma cápsula que exibe workflows, o painel é expandido e a seção "workflow" é aberta ao mesmo tempo — o que aparece depois de expandir não pode ser
  menos do que a cápsula. Quando não há workflow em execução, a prioridade do status principal segue Progress current, Goal active, Git, Goal done, Progress finish, Progress fallback:
  assim que qualquer um deles estiver visível, a cápsula mostra apenas esse status principal; somente quando não há nenhum status principal, usa-se o recurso em execução como resumo
  de reserva. Progress current usa o ícone arrow-right e o título do todo atual; Goal active usa o ícone target e o título do goal; Git usa o ícone de mudança do Git e
  `Changes +added -removed / 更改 +added -removed` apenas quando `added + removed > 0`, com added / removed na cor semântica de diff; Goal done usa o ícone target/goal e o título do
  goal; Progress finish usa o ícone circle-check-big e o título do último todo concluído; Progress fallback usa o ícone de lista e `Progress completed/total` / `进程 completed/total`.
  Na reserva em tempo real, Bash é contado a partir de `backgroundWorks` e Subagent a partir de `session/subagents.running` unificado; apenas Bash mostra o ícone terminal, apenas
  Subagent mostra o ícone Bot, e quando ambos coexistem mostra o ícone Activity, com o texto exibindo apenas o total de running e sem cronômetro contínuo. Subagents encerrados não entram
  no mini. Todo o texto da linha de resumo recolhida usa a fonte de UI comum, sem `font-mono`.
- O shell do status panel é sempre o mesmo `aside`. As dimensões visuais, a altura e o padding do estado recolhido seguem a cápsula de resumo original, mas o raio do shell e o estado
  expandido usam uniformemente `rounded-2xl`. A cápsula do estado recolhido permanece no DOM; no estado expandido ela é escondida apenas por `opacity` / `visibility` /
  `pointer-events`. A largura do shell no estado recolhido é determinada pelo CSS: `w-max`, com teto `max-w-[min(20rem,calc(100cqw-2rem))`, ou seja, medindo o container da
  conversation (`@container/conversation`) e não a janela. Não se mede mais a largura do resumo com JS para escrever em variável CSS: essa medição existia para fazer uma animação de
  interpolação de largura, mas o shell já não faz transição de largura, e o valor medido renderiza um quadro atrasado em relação ao conteúdo e seu teto é calculado com `100vw` — ambos
  podem fazer o texto escapar da cápsula. O estado expandido mantém a largura original do painel completo `w-80` (com o mesmo teto de container), e o teto de altura é unificado em
  `min(64dvh, 32rem)`, evitando que o breakpoint de desktop sobrescreva a restrição relativa ao viewport com um `36rem` fixo. `p-2` fica no container do conteúdo expandido, para não
  afetar as dimensões da cápsula recolhida. A animação de recolhimento/expansão fica no shell, fazendo transição de altura máxima, raio, padding, fundo e sombra; o conteúdo faz apenas
  uma troca leve de opacidade, evitando que a quebra da animação venha de desmontar a cápsula e o painel separados.
- O status panel externo usa sempre `pt-4 right-4` em relação ao conversation pane (16px no topo e à direita); os modos automático, sempre expandido e mini compartilham essa
  margem externa, sem reduzir para 12px em telas estreitas.
- A cápsula do estado recolhido acompanha a largura do conteúdo de resumo; o conteúdo de resumo de item único tem altura `h-8`, e o teto de largura é o próprio teto de container do
  shell; o conteúdo interno do resumo usa `truncate` para evitar que títulos longos de goal / todo / workflow estiquem o layout.
- Na linha de resumo recolhida, no hover / focus o ícone de status à esquerda muda para `maximize-2`, indicando que é possível clicar para expandir o status panel completo.
- Quando o usuário clica no botão de recolhimento do canto superior direito do painel ou na linha de resumo recolhida, é gravada a preferência manual do workspace shell atual: `panel`
  significa sempre expandido, `mini` significa sempre recolhido e `null` significa resposta automática pelo CSS. No modo automático, o conteúdo expandido e o resumo mini permanecem
  dentro do mesmo shell, exibidos de forma mutuamente exclusiva por `@container/conversation`; o React não troca a variant com base na largura. O menu "mais" do canto superior direito no
  estado expandido mostra apenas a opção "automático"; ao escolher, a preferência volta a `null`; "sempre expandido / sempre recolhido" deixam de ser opções de menu, mas os botões
  existentes de recolhimento/expansão e a lógica interna de `panel` / `mini` são mantidos. A preferência só é salva no workspace shell do renderer atual, não é gravada em task,
  session, relay ou main process e, portanto, não afeta a semântica de tempo real do desktop continuous nem do web remote replayable.

## Blocos

Todos os títulos de bloco usam peso de fonte comum e não fazem conversão para maiúsculas, evitando que os títulos do painel de status roubem atenção demais no layout compacto. Git
Tools, Goal, planos, processos, terminal e agentes são empilhados na ordem real de renderização; o segundo bloco em diante usa uma linha divisória `border-border` no topo, e blocos
ausentes não reservam espaço nem mostram divisórias extras. Exceto pelo Git Tools, de conteúdo fixo, Goal, planos, processos, terminal e agentes recebem uniformemente a viewport de
rolagem pelo tipo de bloco de `StatusSection`, e o chamador não pode decidir sozinho se há limite de altura; o título fica fixo fora da sua própria viewport de rolagem. O conteúdo
expandido de Goal, planos, terminal e agentes ocupa no máximo `12rem`; o bloco de processos ocupa no máximo `20rem`, para acomodar 6 Todos de duas linhas. Depois de exceder o respectivo teto,
apenas o conteúdo daquele bloco rola. Essa restrição é independente da combinação de blocos: mesmo que apenas um bloco exceda o limite e existam ao mesmo tempo outros blocos curtos, o bloco
longo deve manter seu próprio teto e sua posição de rolagem. Quando os títulos e o conteúdo limitado de vários blocos expandidos ainda excedem o teto do shell, o container do conteúdo
expandido fornece a rolagem vertical de reserva de todo o painel; é proibido cortar diretamente os blocos seguintes. O bloco de agentes exibe os itens em execução da projeção
unificada; depois dele, uma linha única `已结束 · N / Ended · N` abre ou reutiliza o catálogo de Subagent, sem pré-visualizar item de terminal no resumo.

O tamanho de fonte do Status Panel usa uniformemente UI Token: o ponto circular de número do Goal usa `text-ui-xs`; títulos de seção, linhas do Git, corpo do Goal, planos, processos,
botão de parar, corpo e metadados de terminal e agentes, linha de encerrados e resumo recolhido usam `text-ui-base`; somente o resumo à direita do título da seção, a quantidade de
mudanças do Git e o progresso do Goal usam `text-ui-sm`.

### Git Tools

O Git Tools exibe o status Git no nível do workspace, sem depender de a task atual estar em execução:

- Quando o workspace atual não é um repositório Git, ou quando `added` e `removed` do worktree são ambos 0, o bloco Git Tools não é exibido, e a linha de resumo recolhida também
  não mostra os indicadores de mudança do Git.
- O título do Git Tools suporta recolhimento / expansão, com expansão por padrão; o título e a seta à esquerda são clicáveis, e quando recolhido o lado direito da linha de título mostra o
  resumo de mudanças `+added -removed`.
- Changes: exibe as linhas added / removed do worktree atual. Ao clicar, abre o painel de revisão Git já existente, priorizando o worktree source que tenha conteúdo.
- Branch: reutiliza o `GitBranchSwitcher`, exibido com o mesmo estilo de botão de linha inteira de Changes; dentro do status panel o menu de branch abre pela esquerda, a seta do gatilho
  fica imediatamente após o texto do branch, e continua passando pelo Git service existente e pelo tratamento de bloqueio de troca de branch.
- Commit / Push / Create branch: reutiliza o `GitActionMenu`; o próprio menu exibe o nome da ação principal conforme o estado atual do repositório; dentro do status panel o gatilho
  mantém a interação em dois estágios da ação principal e do menu "mais", e clicar na área de linha inteira do elemento pai dispara a ação principal; a entrada "mais" usa o ícone `...`
  com o estilo de icon button comum, posicionado logo após o texto da ação, com cor de texto padrão no nível secondary, e ao clicar apenas abre o menu; no hover da linha pai, o botão
  `...` exibe o fundo `surface`. Quando não há commit / push executável, o botão de linha inteira exibe `Create branch`.

O Git Tools não dispara Git RPC diretamente. Os dados do Git vêm do `gitSummary` já mantido por `useGitRepository` e do agregado do dataset de worktrees.

### Goal

O Goal exibe o progresso do objetivo/prompt e não carrega mais o detalhe dos todos:

- O resumo de objetivo da V4 lê apenas o estado autoritativo de `goal` do `ProductProjection` da CLI. A projeção deve preservar o `targetId`, `summaryTitle`, `timeUsedSeconds`,
  `activeRunStartedAtMs`, os todos por rodada e o `reason/nextAction` do verifier do target atual; live delta e cold snapshot usam a mesma estrutura de projeção, e o renderer não
  persiste o estado do objetivo por conta própria.
- Quando o Goal está active, o lado direito do título mostra o tempo acumulado e oferece um `pauseGoal` independente; quando está paused, mostra o tempo congelado e o `resumeGoal` em
  triângulo; quando está verified, mostra o tempo congelado e um círculo verde de check. pause/resume são comandos de controle do target, não reutilizam o stop genérico e não alteram a
  semântica de stop/hold da fila.
- O título do Goal suporta recolhimento / expansão, com expansão por padrão; o título e a seta à esquerda são clicáveis, e o lado direito mostra apenas o `elapsed` de nível de goal, sem
  uso de goal/token; quando recolhido, acrescenta `· ícone de status`, por exemplo `1m 42s · <icon>`. O ícone de status no estado recolhido de active / paused continua sendo um icon button
  de pausar / continuar clicável, e o tooltip e o aria-label continuam usando o texto localizado; complete usa o ícone de conclusão. O resumo de status e as métricas de nível de goal
  usam o estilo comum de texto auxiliar, sem fundo de cápsula. O prompt é ocultado após o recolhimento.
- O resumo do Goal consome apenas o verifier timeline, os todos de iteração do goal e as goal stats correspondentes ao `target.targetID` atual. Depois de trocar para um novo goal, o verifier do
  target antigo continua no timeline do chat, mas não pode mais conduzir o título, o número da iteração ou o tempo gasto no resumo do canto superior direito.
- O título da linha vem do título da iteração do goal: na rodada 1, por padrão, prioriza `target.summaryTitle`; após substituir por um novo goal, a rodada 1 prioriza o
  `target.objective` atual, e o `summaryTitle` do target antigo ou o fallback de session title não pode continuar servindo como título do novo objetivo; os títulos das rodadas seguintes
  ainda priorizam o `nextAction` do verifier da rodada anterior do target atual.
- Cada item de prompt usa um layout horizontal compacto: ícone de status à esquerda e título do prompt à direita com no máximo três linhas, com o progresso `completed/total` fixo no canto
  superior direito da área do título, por exemplo `0/5`; o item de prompt não repete o elapsed de nível de goal nem carrega botões de pausar / continuar, evitando expressar informação de nível de
  goal como se fosse de nível de iteração.
- A ordenação dos itens de prompt prioriza o estado concluído, exibindo iterações concluídas acima das não concluídas / em execução; dentro do mesmo estado de conclusão, a ordem original de
  iteração é mantida.
- Itens de prompt não concluídos / em andamento usam uniformemente o ícone de goal à esquerda, por exemplo `prompt... 3/5` continua expressando que o objetivo atual está em avanço; itens de
  prompt concluídos exibem o número da iteração correspondente à esquerda, envolvido em texto verde de 10px com borda circular verde, evitando que o histórico de conclusão continue sendo
  lido por engano como estado atual em andamento. pause / resume aparecem apenas como botões de controle na linha de título.
- Cada rodada deve preservar uma action e um estado visíveis. A action da rodada 1 prioriza `summaryTitle`, senão objective; as rodadas seguintes priorizam o `nextAction` de fallback não interno
  do verifier da rodada anterior, exibindo o título de rodada localizado quando ausente. Assim que uma rodada tiver todos, exibe `completed/total`; somente quando os todos não estão vazios
  e estão todos concluídos, o lado esquerdo passa a ser o círculo de número verde. Rodas sem todos mantêm o ícone de goal e a action da rodada, sem desaparecer inteira por escassez de
  dados de projeção.
- A lista de prompts do Goal é renderizada por completo e limitada à viewport de rolagem de `12rem` dentro do bloco; título, tempo acumulado e controles de pause / resume não rolam
  com a lista. Não é permitido cortar diretamente os blocos de processos, terminal ou agentes que ficam depois do Goal só porque o número de iterações cresceu.
- Um prompt item que não seja o latest running e que tenha todos de iteração exibe, no hover, um painel de pré-visualização leve à esquerda: acima, o título do processo, com estilo
  referenciando o texto auxiliar comum do título de Progress e sem controle de recolhimento; abaixo, a lista de todos daquela iteração, sem repetir o prompt; o painel de pré-visualização
  usa `rounded-xl`, com borda e sombra alinhadas ao menu de Branch, e posição e distância referenciando o alinhamento à esquerda e ao topo do menu de Branch e o espaçamento de 4px; o
  conteúdo de todos pode ser muito longo, então o painel de pré-visualização tem altura máxima, com o título fixo e a área da lista de todos rolável; o prompt item latest running não
  exibe a pré-visualização no hover, para não obstruir o controle atual.

O `reason` do verifier continua sendo carregado pelo timeline da conversa; o bloco de Goal do canto superior direito não acrescenta um card cinza extra de resumo de verificação depois da action
da iteração. O detalhe dos todos entra uniformemente no bloco de processos.

Ciclo de tempo do objetivo e cadeia de comandos:

```text
TargetChanged / TodoWrite / verifier
                 |
                 v
CLI ProductProjection (fatos persistentes + estado por rodada)
                 |
       snapshot / ordered delta
                 |
                 v
SessionDataLayer -> UI goal summary
                         |
                         +-- active: base + (now - startedAt) apenas na exibição
                         +-- paused/verified: base congelado

UI pauseGoal/resumeGoal -> Host -> CLI command handler -> target state event
```

### Planos

O bloco de planos é o catálogo `ExitPlanMode` em estado terminal do ramo efetivo da conversation atual, não equivale aos todos do bloco de processos:

- A lista mantém por completo os planos em estado terminal do ramo efetivo atual e é ordenada por `rowId` decrescente; clicar em uma entrada abre o Side Pane correspondente
  pela identidade estável de parent session + tool call.
- O título dos planos fica fixo fora da viewport de rolagem; quando os itens de plano excedem `12rem`, apenas a lista de planos rola, sem aumentar a altura de todo o status panel e sem
  perder o limite por causa de processos, terminal ou agentes aparecendo simultaneamente antes e depois.
- Planos, processos, terminal e agentes podem existir ao mesmo tempo; cada bloco mantém seu próprio `scrollTop`, e a rolagem externa de reserva serve apenas para tornar os títulos dos
  blocos alcançáveis, não substitui a rolagem interna de nenhum bloco longo.

### Processos

O bloco de processos exibe uniformemente as tarefas pendentes:

- Quando há todos de iteração de goal, exibe apenas a lista de todos mais recente do goal atual, sem agrupar por iteração de goal; o estilo da lista reutiliza o de todo comum. Quando a
  iteração de goal atual ainda não tem todos, não volta a exibir os todos antigos da rodada anterior.
- Sem todos do goal atual, exibe o `plan` ao vivo; na falta dele, exibe os todos de `todoGroups` com `source === "session"`.
- Itens concluídos continuam visíveis, apenas atenuados por estilo; pending / in_progress / completed continuam usando os ícones de estado existentes.
- A lista de processos mantém estritamente a ordem original autoritativa do snapshot de todos atual (`plan.items`); mudanças de estado apenas atualizam o ícone e a atenuação do item
  correspondente, sem mover itens concluídos para o fim da lista.
- Com até 6 Todos, exibe tudo na ordem original do snapshot. Acima de 6, entra em janela reduzida: prioriza `in_progress`; sem item em execução, posiciona no primeiro item não concluído;
  com tudo concluído, posiciona no fim; por padrão exibe 3 itens consecutivos e, perto do fim, recompensa a partir da frente. Os itens antes e depois da janela convergem para baldes de
  posição: o balde anterior, quando todo concluído, exibe "已完成 n 项", caso contrário "前面 n 项"; o balde posterior, quando tudo pending, exibe "待处理 n 项", caso contrário "后面
  n 项"; é proibido usar fatias de posição para relatar status falsamente.
- As entradas "已完成 n 项 / 待处理 n 项" usam o corpo de UI principal `text-ui-base`. No hover em desktop ou no focus por teclado, referenciando o card de hover do item de Goal,
  abrem uma pré-visualização leve a 4px à esquerda do Status Panel, sem inserir o detalhe no fluxo do documento do painel; sem entrada de hover, a entrada clicável abre o mesmo card.
  É possível se mover com segurança entre o card e o gatilho, e largura, raio, borda, sombra e os atrasos de abertura/fechamento de `120ms / 80ms` seguem a pré-visualização de Goal; quando o
  conteúdo é longo demais, apenas a lista dentro do card rola.
- Cada texto de Todo exibe no máximo duas linhas; acima de duas linhas, as reticências aparecem no fim da segunda linha; essa restrição se aplica apenas à renderização visual, e o conteúdo completo
  permanece no snapshot e no texto do DOM, sem truncar dados do model.
- Quando a id, o conteúdo ou o estado de um Todo muda e forma um novo snapshot, a pré-visualização de grupo oculto já aberta é fechada e a janela de foco é recalculada; esse estado pertence
  apenas ao renderer e não é gravado em session, store ou protocol.
- A linha de título do bloco de processos pode ser recolhida, e apenas o título e a seta à esquerda são clicáveis; o lado direito da linha de título sempre exibe `completed/total`; quando
  recolhido, acrescenta `· ícone de status` referenciando o estilo de informação auxiliar à direita do título de Goal, por exemplo `3/4 · <icon>`, e a seta para a direita também só
  aparece no hover / focus sobre o conteúdo do título.
- O model de processos deve preservar o snapshot completo de todos, e o renderer aplica apenas a janela de foco reversível pelo usuário descrita acima, sem descartar itens na camada de
  projeção. O conteúdo do bloco ocupa no máximo `20rem` e precisa acomodar 6 Todos com textos de duas linhas cada; com textos mais longos ou grupos expandidos, a rolagem ocorre dentro do bloco de
  processos, e o título e o `completed/total` permanecem sempre fixos e visíveis.

Todos de goal e todos comuns são ambos `ZCodePlanStep[]`; a semântica de rodada dos todos de goal é usada apenas nas linhas de prompt do Goal e não afeta mais a estrutura da lista do bloco de
processos.

### Terminal e Agentes

Os recursos em execução em segundo plano são divididos por kind em dois blocos independentes, sem mais compartilhar a lista de Running: `kind === "bash"` vai para "terminal",
`kind === "subagent"` vai para "agentes". Os dois blocos têm recolhimento, estatísticas e cálculo de maior tempo de execução independentes; quando um tipo é zero, o bloco correspondente não
reserva espaço.

- A barra de ferramentas do Composer oferece, depois de "menu Adicionar → seleção de modo", uma única entrada de tarefas em segundo plano; a entrada consome apenas os `backgroundWorks`
  com `status === "running"` do snapshot da session atual, sem agregar outras tasks, sessions ou workspaces. Na área de entrada larga, o mesmo botão exibe separadamente o ícone terminal +
  a contagem de Bash e o ícone Bot + a contagem de Subagent, e tipos com contagem 0 não reservam espaço; quando o container do Composer tem largura `<= 480px`, mescla em ícone Activity +
  total de running. O tooltip de hover também deve seguir os tipos não zero: apenas Bash é "运行中的终端", apenas Subagent é "打开运行中的智能体" e, no caso misto, "打开运行中的终端与智能体";
  o nome acessível continua incluindo a contagem completa de Bash, Subagent e total. `resultPending`, `failed`, `cancelled` e as tarefas já concluídas não são contadas, e a entrada desaparece
  assim que a última task running é encerrada.
- Clicar na entrada de segundo plano do Composer precisa colocar a preferência efetiva do painel em `panel` e expandir simultaneamente os blocos "terminal" e "agentes" não vazios,
  para que uma única operação mostre todo o detalhe de segundo plano. Depois disso, os dois blocos podem ser recolhidos manualmente em separado; na troca de session, ambos são
  resetados, e quando a contagem de running de um tipo vai a zero, apenas o bloco correspondente é resetado. Se o pane atual não tiver callback de preferência do workspace shell, usa-se
  o fallback de variant local do pane, e a entrada não pode se tornar um botão inválido.
- Nesta fase, a decisão de inline/overlay em JavaScript para tela estreita foi removida; clicar na entrada sempre muda para o `panel` completo. O layout CSS posterior deve restaurar o overlay
  em container estreito sem deixar o Composer transbordar horizontalmente; no celular `/remote` continua proibido abrir o Side Pane de Subagent a partir da linha de agente.
- Os títulos "terminal" e "agentes" suportam recolhimento / expansão e vêm recolhidos por padrão. O título e a seta à esquerda são clicáveis; ao expandir, o lado direito mostra a contagem
  localizada de execuções em segundo plano daquele tipo; ao recolher, o lado direito mostra o maior tempo de execução e a contagem daquele tipo, sem mostrar a soma de várias tarefas.
- "terminal" e "agentes" renderizam por completo as listas running atuais e rolam cada uma dentro do teto de altura de `12rem`; os dois blocos não compartilham posição de rolagem, e
  título, contagem e controle de recolhimento ficam fixos fora da viewport de rolagem.
- Cada item running referencia o item de prompt do Goal usando layout de duas linhas: background subagent usa bot icon, e bash/process usa terminal icon; a primeira linha à direita mostra
  apenas o `title` autoritativo, sem concatenar o kind interno `bash/subagent` no título visível ao usuário; a segunda linha mostra o "已运行 elapsed" localizado e o botão de parar com
  texto curto.
- Quando um background subagent tem também `childSessionId` e a interface atual já tem injetada a capacidade de abrir a aba direita de subagent, o item running inteiro é uma entrada de sessão
  acessível: clicar ou pressionar Enter/Space precisa reutilizar a lógica de abertura por `parentSessionId + childSessionId` da linha de resumo da ferramenta Agent, criando ou
  ativando no lado direito a mesma tab de child session completa e somente leitura. Não é permitido guardar estado de abertura dentro do status panel nem criar um segundo child session; ativações
  repetidas continuam sendo deduplicadas pelo ID de tab estável do workspace side pane.
- Um background subagent recém-iniciado precisa gravar o `childSessionId` do Agent launch output / runtime task snapshot exatamente como está em
  `BackgroundTaskStarted/Updated/Completed`, e então projetar em `backgroundWorks`; `workId` serve apenas para controle da tarefa de segundo plano e não substitui a identidade do child
  session. Somente eventos históricos sem esse campo podem degradar para um item não navegável.
- bash/process, subagents sem `childSessionId` ou interfaces sem capacidade de aba à direita continuam como itens comuns não interativos. O modo compacto do celular `/remote` segue
  usando o gate de entrada existente e não pode contornar o limite `web-remote-replayable` só porque o status panel está visível.
- O botão de parar só é exibido quando a projeção declara `cancellable !== false`; a UI não infere capacidade de cancelamento a partir do kind ou da phase local.
- Dentro de um item de subagent que pode ser aberto, o botão de parar continua sendo uma ação independente; clicar ou ativar por teclado o botão de parar envia apenas o cancel e não
  borbulha para abrir a tab do child session.
- Itens de segundo plano não exibem `outputTail`, `stderrTail`, `stdoutTail`, comando de fallback nem texto auxiliar de PID, evitando que a lista de tarefas de segundo plano ocupe o nível
  visual de goal/todo no painel compacto.
- A lista é ordenada por tempo de execução em ordem decrescente. A classificação das tarefas vem de `backgroundWorks[].kind` da CLI; a UI não lê `toolName` para classificar de novo. A
  compatibilidade com aliases de ferramenta de eventos antigos precisa ser concluída antes da materialização na CLI.

Os blocos de terminal e de agentes não exibem jobs encerrados; o estado terminal continua sendo encerrado pelo snapshot do runtime.

```text
CLI backgroundWorks (current session snapshot)
        |
        +-- status=running --+--> Composer：Bash / Subagent 计数
        |                    +--> kind=bash ----> Status Panel / 终端
        |                    `--> kind=subagent -> Status Panel / 智能体
        `-- terminal ----------------> 不展示

Composer background trigger
        |
        +--> effective panel variant = panel
        +--> Bash count > 0 ----> 终端 open = true
        `--> Subagent count > 0 -> 智能体 open = true

Status capsule
        |
        +-- 有 pending / running 工作流 --> 显示第一条 run：名称 · 灯 · phase · +n
        +-- 有 Goal / Todo / Git 等主状态 --> 只显示主状态
        `-- 无主状态且有 running work ----> 显示实时活动兜底（终端 / 智能体计数）
```

## Compatibilidade

- Desktop local e web remote reutilizam a mesma projeção de UI, sem novo protocolo de agent e sem nova tabela de DB.
- A abertura da revisão Git só opera o side pane de UI e o source selecionado, sem alterar a semântica de task stream, snapshot, queue ou owner command.
- Nesta fase, o controle remoto móvel não alterna mais automaticamente a linha de resumo por largura; o overlay em container estreito e a semântica de não espremer o conteúdo principal
  aguardam a restauração pelo refactor do layout CSS.