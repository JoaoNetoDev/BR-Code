# Side Pane em visão completa

Status: implementado (2026-10-16), E2E promovido (2026-10-17): `ui-shell/side-pane-full-view.test.ts`, `conversation-session/conversation-session-side-pane-full-view.test.ts`. Somente desktop Electron; a Web comum e o controle remoto pelo celular em `/remote` não oferecem entrada. Módulo de código: `packages/ui/src/side-pane-full-view/` (managed, ver o `CONTRACT.md` dele).

## Objetivo

O painel da direita pode ocupar temporariamente toda a área à esquerda da lista de tarefas. A área de conversa no meio deixa de ocupar espaço no layout, a conversa passa a ser o primeiro tab da barra de tabs do painel e um campo de entrada flutuante é oferecido acima da barra de tabs. A lista de tarefas à esquerda e o grupo de botões no canto superior esquerdo (alternar barra lateral, voltar, avançar, nova conversa) permanecem como estão.

## Entrada e saída

| Ação                                                                       | Resultado                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Botão «Entrar na visão completa» no canto superior direito do painel (à esquerda do alternador do painel), `⇧⌘F` / `Ctrl+Shift+F` | Entra na visão completa, o tab atual permanece como tab do painel e a janela flutuante fica no estado recolhido |
| O mesmo botão (naquele momento «Sair da visão completa»), o mesmo atalho   | Sai da visão completa e volta ao layout original de três colunas |
| Alternador do painel ◫                                                  | Fecha o painel e sai da visão completa ao mesmo tempo; reabrir o painel não retorna à visão completa |
| Fechar o último tab do painel                                            | O painel é recolhido conforme as regras existentes e a visão completa é encerrada ao mesmo tempo |
| Pressionar o atalho com o painel fechado                                 | Abre o painel e entra na visão completa                      |

- O id do comando de atalho é `toggleSidePaneFullView` e pode ser remapeado na página de configurações; a Web não registra handler nem exibe o comando na página de configurações.
- Sair da visão completa não modifica nenhum estado existente: visibilidade da barra lateral, largura da barra lateral, largura do painel e abertura do terminal mantêm os valores de antes da entrada.

## Layout

```
Visão comum                                             Visão completa
┌─────────────────┬─────────────────┬───────────────┐   ┌─────────────────┬─────────────────────────────────┐
│ Lista de tarefas│ WorkspaceHeader│ [tabs][⤢][◫] │   │ Lista de tarefas│ [💬 Conversa][tab…][+]  [⤡][◫] │
│                 │ Conversa       │ Conteúdo do  │   │                 │ Conteúdo do painel ou conversa │
│                 │ Terminal       │ painel       │   │                 │                 ┌───────────┐  │
└─────────────────┴─────────────────┴───────────────┘   │                 │                 │ Entrada   │  │
                                                        │                 │                 └───────────┘  │
                                                        └─────────────────┴─────────────────────────────────┘
```

- A lista de tarefas à esquerda e o grupo de botões no canto superior esquerdo continuam sendo exibidos normalmente, e o alternador da barra lateral continua funcionando. Quando a barra lateral está recolhida, o lado esquerdo da barra de tabs reserva espaço para o grupo de botões conforme a mesma regra do `WorkspaceHeader`; quando a barra lateral está expandida, não há espaço reservado.
- O `WorkspaceHeader` não é exibido, e a barra de tabs do painel o substitui como barra superior da área de conteúdo; os botões de janela de Windows/Linux continuam no canto superior direito do painel.
- O tab de conversa fica fixo na primeira posição: ícone de chat + título da tarefa atual (o rascunho exibe «Nova tarefa»), não pode ser fechado, não pode ser arrastado para reordenar e não tem menu «⋯» (o menu da tarefa continua na barra de título depois de sair da visão completa). A barra de tabs é a área de arraste da janela (`app-region: drag`), e o tab de conversa precisa ser marcado explicitamente como `no-drag`, caso contrário cliques reais de mouse seriam tratados como arraste da janela.
- Clicar no tab de conversa: a conversa é exibida em largura total na área de conteúdo do painel (incluindo o terminal inferior). Clicar em qualquer tab do painel: exibe esse tab e a janela flutuante de entrada aparece.
- A moldura do painel, na visão completa, é `absolute inset-0 z-0`: cria apenas o próprio contexto de empilhamento, sem elevar a camada. As páginas de UI de plugin não ficam no DOM do painel, e sim em uma camada fixed estacionada ao final do `body` (`[data-sandbox-page-parking]`, sem z-index), posicionada pelas coordenadas do elemento que reserva o lugar do tab; se a moldura usasse um z-index positivo, desenharia o fundo opaco por cima das páginas de plugin. Todo o conteúdo da conversa fica no host (`fixed z-30`), e a janela flutuante continua acima das páginas de plugin.
- O conjunto de tabs vazio após a expansão do painel é preenchido por `useAppPanels`, que cria o tab «Nova aba» (ver `docs/ui/side-pane-tabs.md`); a visão completa reaproveita esse tab. No instante anterior à criação, a área de conteúdo exibe a mesma página de inicialização, e a barra de tabs contém apenas o tab de conversa e o «+».

## Princípio de instância única

A área de conversa mantém apenas uma instância de `SessionPane`. A visão completa apenas muda o modo de posicionamento do contêiner que a hospeda, sem mover o DOM, sem remontar e sem duplicar um segundo composer.

```
WorkspaceShellLayout (a árvore React é a mesma nas três formas)
└─ #content / ResizablePanelGroup (as proporções salvas dos painéis não mudam)
   ├─ conversation-column
   │   └─ Host da visão completa (camada de embrulho sempre presente)
   │       ├─ Visão comum: layout estático, h-full
   │       ├─ Visão completa + tab de conversa: position: fixed, preenche a área de conteúdo do painel (slot)
   │       └─ Visão completa + tab do painel: position: fixed, flutua dentro do slot conforme a posição de encaixe
   ├─ ResizableHandle: oculto na visão completa
   └─ Painel do painel: ocupa toda a largura na visão completa
```

Motivos:

- Dois composers vinculados à mesma session mantêm cópias separadas do rascunho, e o último a escrever sobrescreve o outro; o controlador de upload de anexos também é guardado por instância.
- Trocar de contêiner remonta o SessionPane e perde a posição de rolagem, o foco e os anexos em upload.
- Permissões e cartões de pergunta dependem do contexto da conversa e precisam permanecer dentro da árvore React original.
- O Esc de parada só funciona quando o foco está dentro do DOM da conversa; como a janela flutuante continua sendo o mesmo DOM, pressionar Esc em uma tab do navegador não para o agent.
- O navegador embutido é um `<webview>` do DOM, e uma sobreposição HTML pode cobrir a página web.

O slot é a área de conteúdo abaixo da barra de tabs do painel. O host lê via ResizeObserver as coordenadas do slot na janela e as escreve no style do host; isso é apenas uma projeção de layout do DOM, não estado de negócio.

Largura do painel: a visão completa não altera o flex gerenciado pelo react-resizable-panels; a moldura do painel passa a ser `absolute inset-0`, usando o PanelGroup como contêiner de posicionamento para preencher a linha inteira. A biblioteca calcula o tamanho do group pela soma do `offsetWidth` de cada panel; se o CSS comprimisse a coluna da conversa para 0, o group teria tamanho 0 ao expandir o painel a partir do estado recolhido, e o resize falharia.

## Posse do estado

```
Memorizado por session: taskSidePaneMemory.sidePaneFullViewByOwner[ownerTaskId ?? "__draft__"]
└─ { surface: "conversation" | "side-pane", floating: "collapsed" | "expanded" | "minimized" } | ausente

Preferência global: localStorage «zcode:side-pane-full-view:floating-anchor»
└─ uma das 7 posições de encaixe, padrão bottom-right

Estado temporário dentro do componente host (não memorizado)
└─ coordenadas durante o arraste, se a barra de ações está exibida, altura da área de entrada inferior

Derivado somente-leitura
├─ Visão completa ativa = desktop && não remoto && painel aberto && o owner atual tem registro
├─ Exibir WorkspaceHeader = !visão completa ativa
└─ Exibir janela flutuante = visão completa ativa && surface === "side-pane"
```

- O owner é o mesmo de `sidePaneCollapsedByOwner`: taskId para tarefas formais e `__draft__` para rascunhos. Ao trocar de sessão e voltar para a mesma session, a visão completa, a surface atual e a forma da janela flutuante são preservadas.
- Assim como as tabs do painel, existe apenas em memória, com LRU por workspace; não é preservado após recarregar ou reiniciar o aplicativo.
- Quando o mesmo owner tem o painel aberto e depois fechado, o registro desse owner é limpo (tanto ◫ quanto fechar o último tab passam por esse caminho). Na troca de owner, a variação de abertura e fechamento do painel não limpa nenhum registro.
- A política de recolhimento automático quando a janela fica estreita só vale na visão comum; na visão completa a conversa é posicionada pelo host, e a largura da coluna da conversa não representa a área de conversa visível, portanto não se pode recolher o painel ou a barra lateral com base nela.

## Janela flutuante de entrada

A janela flutuante é composta por duas camadas: na frente, o próprio campo de entrada; atrás, uma gaveta. No estado recolhido só se vê o campo de entrada, sem borda externa nem preenchimento; a gaveta fica escondida atrás do campo de entrada e, ao receber foco, desliza para cima a partir de trás do campo de entrada, revelando a barra de ações; ao expandir, a gaveta continua sendo esticada para cima, e dentro há um fluxo de mensagens estreito.

```
Recolhido (sem foco)            Recolhido + barra de ações     Expandido
                                ┌─────────────────────────────┐   ┌─────────────────────────────┐
                                │[−] [⌃] ◌        [⠿]         │   │[−] [⌄] ◌        [⠿]         │
╭───────────────────────────╮   │╭───────────────────────────╮│   │Fluxo de mensagens estreito  │
│[+] Entrada…  [Ctrl][↑]    │   ││[+] Entrada…  [Ctrl][↑]    ││   │╭───────────────────────────╮│
╰───────────────────────────╯   │╰───────────────────────────╯│   ││[+] Entrada…  [Ctrl][↑]    ││
                                └─────────────────────────────┘   │╰───────────────────────────╯│
                                                                  └─────────────────────────────┘
                                ▲ a gaveta desliza para cima a partir de trás do campo de entrada

 ◌ = loading quando a conversa está em execução, não é exibido quando ocioso
 Foco entra na janela flutuante ─▶ a gaveta desliza para fora (recolhido + barra de ações); foco sai ─▶ a gaveta recolhe para trás do campo de entrada
 Clicar em [⌃] ─▶ expandir; clicar em [⌄] ─▶ recolher
 Qualquer forma ──«−» ou menu «Minimizar editor»──▶ minimizar (botão circular, exibe o status de execução)
 Botão circular ── clique ─▶ recolher + barra de ações, o campo de entrada recebe foco
 Nova requisição de permissão / pergunta durante a minimização ─▶ volta automaticamente ao estado recolhido, o cartão substitui o campo de entrada
 Arrastar ⠿ ou arrastar o botão circular ── soltar ─▶ encaixa na posição mais próxima
```

- Camada do campo de entrada: expõe apenas a área de entrada inferior do SessionPane (`data-v4-composer-dock`); na forma flutuante a área de entrada não tem padding interno, a casca do campo de entrada é a camada mais externa da janela flutuante e tem `shadow-lg`. O SessionPane interno mantém a altura fixa do estado expandido e é encostado no fundo, o conteúdo acima da área de entrada é cortado, mas continua montado. Quando aparecem cartões de permissão ou de pergunta, a área de entrada cresce e a janela flutuante cresce junto, com o mesmo comportamento da conversa principal do desktop.
- Na forma flutuante a área de entrada não fica dentro do contêiner de rolagem das mensagens: ela continua sendo o mesmo nó de DOM (sem remontagem), mas passa de sticky para encostar no fundo relativa à raiz da linha do tempo; a borda inferior do contêiner de rolagem cede «altura da área de entrada + 12px», as mensagens deixam mais 16px de espaço no fundo, a barra de rolagem termina acima do campo de entrada e não se estende mais para trás dele. Na forma flutuante a camada de mensagens não recebe máscara de esmaecimento no fundo (as mensagens não passam por trás do campo de entrada). O tab de conversa e a visão comum continuam com área de entrada sticky.
- Na forma flutuante a conversa não usa o layout centralizado de sessão vazia, a área de entrada fica sempre encostada no fundo e as dicas de recomendação de rascunho e a barra «Selecionar projeto / branch» no topo do rascunho não são exibidas (é possível selecionar o projeto indo ao tab de conversa).
- Na forma flutuante o campo de entrada usa layout de linha única: `[+] [área de entrada] [controles de modo / modelo etc.] [enviar]` ficam na mesma linha. A área de entrada ocupa pelo menos metade da largura; quando os controles não cabem, vale a regra de recolhimento progressivo da barra de ferramentas do campo de entrada principal (primeiro o texto, por último apenas os ícones). Quando o texto passa de uma linha, a área de entrada cresce para cima e os botões laterais encostam no fundo. Anexos e demais `topContent` ocupam sozinhos uma linha inteira acima da linha de entrada.
- A linha única e o layout normal de duas linhas compartilham a mesma árvore DOM, trocando apenas o estilo: a posição do nó do editor não muda, e alternar entre a janela flutuante e o tab de conversa remonta o editor, preservando rascunho, cursor e histórico de undo. Apenas o botão de menu «+» muda de posição e é remontado.
- Placeholder de execução: com a conversa em execução na forma flutuante, o texto de placeholder do campo de entrada exibe «Trabalhando há {duração}» (`chat.history.workingFor`), e a duração tem o mesmo valor do «Trabalhando há N segundos» do work segment em execução na mensagem em streaming (o mesmo `workStatus.durationMs`, atualizado a cada segundo), usando o mesmo formato de duração (`formatConversationWorkDuration`, com sufixos de dia / hora / minuto / segundo, no máximo dois segmentos). Enquanto a duração ainda não foi produzida, vale o placeholder original; o tab de conversa e a visão comum não mudam.
- Balão de resposta: na forma flutuante, quando uma rodada de resposta termina (aparece um turno encerrado, com resposta final complete e diferente da linha de base), um balão é exibido acima da janela flutuante (abaixo, quando a posição de encaixe é a de topo), mostrando apenas as duas primeiras linhas do texto puro do corpo da resposta, sem ícone e sem título. Linha de base: quando a janela flutuante vê uma session pela primeira vez, os turnos encerrados contam como vistos, os turnos em execução não; ao sair da forma flutuante a linha de base é limpa e reestabelecida ao voltar, de modo que respostas vistas no tab de conversa não saltam. Não é exigido ver o «em execução»: uma reprodução ou uma resposta muito rápida pode passar de nunca iniciada a encerrada em uma única renderização.
  - Há apenas dois jeitos de fazer o balão sumir: clicar no × no canto superior esquerdo; clicar no próprio balão (ao mesmo tempo em que a janela flutuante passa ao estado expandido, mostrando o fluxo de mensagens). Ao enviar a próxima mensagem o balão é mantido e, quando a próxima rodada de resposta termina, é substituído pela nova resposta.
  - O balão é memorizado por session (apenas em memória) e permanece ao trocar de sessão e voltar; é exibido somente no estado recolhido da janela flutuante, sendo ocultado nos estados expandido e minimizado sem ser limpo.
  - Origem única dos dados: o último turno da linha do tempo (render unit) fornece ao mesmo tempo turnKey, status de execução, duração de execução e resposta final, reportados de uma só vez via `reportFloatingStatus`, evitando inconsistência de ordem entre status de execução e resposta vindos de fontes diferentes.
- Camada da gaveta: tem a mesma largura do campo de entrada, com `rounded-2xl`, `bg-background`, `border-border` e `shadow-lg`. Sem foco, fica totalmente escondida atrás do campo de entrada; quando a barra de ações está visível, estende-se continuamente para baixo até a borda inferior do campo de entrada, com as linhas laterais contínuas até o fundo, e o que aparece além do canto arredondado superior do campo de entrada é o fundo da gaveta (quando a gaveta se estende só um pouco para trás do campo de entrada, o canto inferior da gaveta e o canto superior do campo de entrada formam um entalhe). A altura transiciona junto com o tamanho da janela flutuante, produzindo o efeito de deslizar a partir de trás do campo de entrada.
- A barra de ações tem apenas botões: à esquerda «−» para minimizar, «⌃ / ⌄» para expandir ou recolher o fluxo de mensagens; à direita, ⠿ é a alça de arraste e o menu ao mesmo tempo. Não exibe o título da tarefa (o título fica no tab de conversa). Quando a conversa está em execução (`snapshot.control.canStop`, a mesma fonte de estado do botão circular), à direita de «⌃ / ⌄» aparece um ícone de loading giratório, que não é exibido quando ocioso. A área vazia da barra de ações não tem comportamento de clique e não rouba o foco do campo de entrada ao ser pressionada.
- A barra de ações, no estado recolhido, só é exibida quando há foco dentro da janela flutuante ou quando o menu está aberto; no estado expandido é sempre exibida.
- O tooltip de ⠿ é «Arraste para mover · clique para ver as opções». O clique (movimento inferior a 4px) abre o menu: «Abrir na visão completa» vai para o tab de conversa; «Minimizar editor» entra no estado minimizado. Ao arrastar mais de 4px a janela flutuante acompanha o ponteiro e encaixa ao soltar. Os cliques no portal do menu de ⠿ sobem pela árvore React, portanto o contêiner da barra de ações não pode ter comportamento de clique.
- Na alternância entre minimizar e restaurar, o tamanho da janela flutuante chega de uma vez, sem transição de largura e altura; em vez disso, há escala a partir do canto de encaixe do botão circular (0.92 → 1) com fade, em 150ms. Durante a minimização a camada de entrada mantém a tipografia da largura da janela flutuante (invisível), sem se reorganizar para o botão de 48px. Motivo: na transição de largura de 48px para 560px o campo de entrada de linha única se quebra em várias linhas, a altura medida da área de entrada primeiro aumenta e depois encolhe, e o fundo da janela flutuante primeiro fica mais alto e depois desce.
- Posições de encaixe: superior esquerda, superior direita, meio esquerda, meio direita, inferior esquerda, inferior centro, inferior direita; mantém 16px em relação às bordas do slot. A posição de topo abre para baixo, a de baixo abre para cima e a do meio é centralizada.
- No estado expandido tem 560px de largura e min(640px, altura do slot − 32px) de altura, com o fluxo de mensagens rolando dentro da janela; o estado recolhido tem a mesma largura; quando o slot é estreito demais, a largura encolhe para a largura do slot − 32px.

## Descontinuação da entrada de split pane na área de conversa

Este recurso descontinua ao mesmo tempo todas as entradas de split pane da área de conversa (ver `docs/v4-split-pane-workbench.md`): «Abrir em tela dividida» no menu de contexto da linha da tarefa e o arraste da linha da tarefa até a borda da área de conversa para criar uma divisão. Arrastar a linha da tarefa sobre um projeto para mover a tarefa continua valendo. Layouts de divisão já existentes ainda podem ser exibidos e fechados normalmente. A janela flutuante da visão completa exibe apenas o pane em foco.

## Verificação

- Testes unitários: cálculo das posições de encaixe, ponto de encaixe mais próximo, memorização por owner e regras de saída, tabela de atalhos.
- E2E desktop (oficial): ver os casos SPFV em `docs/testing/side-pane-tabs-e2e-case-catalog.md`.
