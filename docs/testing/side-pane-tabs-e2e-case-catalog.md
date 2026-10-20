# Catálogo de Cases E2E de Side Pane Tabs

## Escopo

Este documento registra a semântica de UI E2E no desktop para a largura responsiva, o overflow, os botões de ação e o Tooltip de título do Side Pane Tab strip. Essa capacidade pertence à apresentação do UI shell e não depende de Agent, fixture de provider, session realtime ou recuperação por persistência.

## Dimensões de estado e podas

| Dimensão          | Classe de equivalência                                                       | Decisão                                                                                  |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Largura disponível      | comporta 156px / precisa encolher entre 156px e 60px / 60px ainda não comporta | as três são cobertas                                                                            |
| Tipo de Tab      | Browser / Terminal / Diff / Code Viewer / tab de escopo de sessão | usa-se um Terminal recriável para representar o `SidePaneTabTrigger` compartilhado; o conteúdo específico de cada tipo não é coberto de novo neste grupo |
| Estado do Tab      | active / inactive                                            | o case do botão de fechar também é coberto                                                                |
| Hover do Tooltip | menos de 1500ms / mais de 1500ms / atravessando Tabs                             | as três são cobertas                                                                            |
| Cliente        | Desktop / mobile Web touch                                   | Desktop é coberto; o toque não depende de hover, então o Tooltip é podado; o layout mobile é coberto por testes responsivos no nível de componente          |
| Botão do meio do mouse      | tab active / tab inactive                                        | Desktop é coberto; fechar com o botão do meio não ativa o tab de destino e bloqueia a rolagem padrão do navegador pelo botão do meio                        |
| Outras interações      | arrastar, botão direito, visão geral de abas                                 | não fazem parte desta mudança; usam os testes de componente já existentes e não são cobertos de novo neste grupo                                    |

## Cases aceitos

### SPT-E2E-000 Raio de canto da plataforma no painel independente e linha de indicação de arraste

- Setup: desktop com rascunho de nova tarefa, Side Pane e Terminal inferior expandidos, usando temas claro e escuro respectivamente.
- Action: aguardar o estado da plataforma e o layout ficarem prontos, passar o mouse e arrastar os handles de Sidebar, Side Pane e Terminal.
- Assertions: Windows 5px, Sequoia e macOS anteriores 6px, Tahoe 26+ 12px, Linux 12px; as três hot zones mantêm 4px, a linha de indicação é de 2px ao longo da borda em foreground-subtlest/50, sem mask, oculta por padrão e visível no hover/arrasto, com mudança real de tamanho.
- Complemento da cadeia de dados: useAppChromeStateAutoUpdate.test.ts executa o hook real, com a consulta assíncrona da plataforma retornando macOS 15/26, validando o raio e a limpeza da assinatura; serve para capturar, em CI que não é macOS, o problema da consulta de macOS ser pulada por um guard. Não substitui a aceitação visual nativa no macOS.

### SPT-E2E-001 Largura padrão e segue o botão de adicionar

- Setup: janela do desktop com o Side Pane aberto, criando apenas um tab Terminal, com espaço suficiente para a largura padrão.
- Action: observar o tab strip.
- Assertions: largura do Tab de 156px (tolerando erro de subpixel); sem overflow no viewport horizontal; o botão de adicionar fica dentro do conteúdo rolável e logo após o último Tab.

### SPT-E2E-002 Encolhimento de larguras iguais sem rolagem

- Setup: criar três Terminal tabs e ajustar a janela para uma largura em que seja necessário encolher, mas ainda mantendo cada Tab acima de 60px.
- Action: aguardar o ResizeObserver concluir o layout.
- Assertions: todos os Tabs têm larguras iguais; a largura está em `[60px, 156px)`; sem overflow no viewport horizontal; o botão de adicionar continua dentro do conteúdo rolável.

### SPT-E2E-003 Rolagem após atingir a largura mínima

- Setup: continuar criando Terminal tabs, de modo que a soma das larguras mínimas de 60px ultrapasse o espaço disponível.
- Action: aguardar a atualização do estado de overflow.
- Assertions: nenhum Tab com menos de 60px; `scrollWidth > clientWidth` no viewport; o botão de adicionar sai do viewport e fica fixo na área de ações à direita.

### SPT-E2E-004 Botão de fechar exibido ao selecionar ou passar o mouse, sem ativar

- Setup: pelo menos dois Tabs, com o segundo active e o primeiro inactive.
- Action: afastar o mouse e limpar o foco, verificando a visibilidade do botão de fechar; fazer hover no Tab inactive e clicar no seu botão de fechar.
- Assertions: o botão de fechar do Tab active está visível; o Tab inactive fica oculto sem hover e visível com hover; o Tab inactive é fechado; o Tab active original permanece active.

### SPT-E2E-005 Tooltip espera de forma independente por 1500ms

- Setup: pelo menos dois Tabs.
- Action: passar o mouse sobre o primeiro Tab por menos de 1500ms, mover para o segundo Tab e esperar até que o segundo Tab complete seus próprios 1500ms.
- Assertions: nenhum Tooltip é exibido durante a janela de espera do primeiro; após cruzar Tabs, o tempo já esperado não é herdado; quando o segundo Tab completa 1500ms, o Tooltip aparece com o título completo.

### SPT-E2E-006 Fechar com o botão do meio do mouse sem ativar

- Setup: pelo menos dois Tabs, com o segundo active e o primeiro inactive.
- Action: despachar um evento de mouse do botão do meio (`button=1`) no corpo do rótulo do Tab inactive.
- Assertions: o Tab inactive é fechado; o Tab active original permanece active; o comportamento padrão do evento é impedido e a ativação do rótulo não é disparada.


### SPT-E2E-007 Estado vazio e dupla entrada do painel de plugin na new-tab

- Setup: `AnimatedSidePanePanel` real, hook de descoberta de plugins e ação de abrir; a fixture cria e ativa o tab por `activateNewTabSidePane` e pela função de atribuição unificada. A lista de recomendados inclui dois surfaces, e outro surface de desenvolvimento não é recomendado; cobre 1200px/en-US/claro e 390px/zh-CN/escuro.
- Action: abrir um plugin a partir do launcher de new-tab padrão da primeira expansão; depois clicar em «+» para criar uma new-tab e, a partir do launcher do tabpanel active, abrir o mesmo plugin novamente; criar outro tab e usar Tab/Enter para abrir um segundo plugin.
- Assertions: as duas entradas exibem os mesmos recomendados e títulos localizados; a requisição preserva os campos de workspace/sessão, e a abertura repetida reaproveita o plugin tab; depois de instalar e habilitar, é preciso clicar em abrir de novo. Sessão de rascunho oculta toda a área de plugins do app e o separador, bem como a entrada «ver todos os plugins»; sessão existente parte para o mercado tanto pelo estado vazio padrão quanto por uma new-tab explícita, e o retorno do estado vazio padrão mantém o painel expandido. Sem host ou sem bridge não há itens de plugin; lista de recomendados vazia ou falha de configuração mostra o estado vazio; carregamento frio mostra skeleton. A new-tab permanece visível, e em tela estreita não há overflow horizontal.
- Regressão de progresso de operação: controlar as respostas de instalação/habilitação e confirmar que apenas o plugin alvo mostra carregamento e fica desabilitado, enquanto os outros plugins mantêm o texto original e o estado clicável. Submeter duas instalações de plugins diferentes em sequência, cada uma mantendo o próprio progresso; uma falha ou um sucesso limpa apenas o seu, e um plugin já habilitado continua abrível. Clicar de novo no mesmo plugin submete só uma vez, a falha pode ser retentada e o sucesso não abre automaticamente. Cobre o estado vazio e a new-tab, desktop claro em inglês e celular escuro em chinês.
- Regressão do ícone de carregamento: durante a espera da resposta, a entrada alvo mostra um ícone giratório visível e `aria-busy`; depois do sucesso ou da falha, tudo é limpo. Os dois surfaces do mesmo plugin exibem o progresso em sincronia, e os outros plugins não têm progresso; com a preferência de reduzir animações, o ícone permanece, mas não gira.
- Limites: o serviço é injetado por uma fixture de browser, e a requisição é verificada na fronteira de owner do plugin tab, sem iniciar sandbox, Agent ou link de controle remoto real do celular.
- Validação atual: em 2026-10-19 o E2E de browser automatizado passou 16/16, incluindo 4 grupos de instalações concorrentes sem bloqueio mútuo, 8 grupos de progresso de operação e as regressões de múltiplos surfaces do mesmo plugin e da preferência de reduzir animações. A fixture inicializa o new-tab padrão conforme o owner de painel atual; continua em manual-review/pending e não representa validação de instalação real do Agent, sandbox de plugin ou controle remoto do celular.

### SPT-E2E-008 Fechamento e restauração isolados por conversa (manual-review/pending)

- Setup: duas conversas A/B do mesmo workspace, cada uma com tabs de Browser e de configurações de permissões de site.
- Action: em B, fechar as outras e fechar todas; voltar para A e conferir a preservação; depois fechar o tab de configurações de A; ir a B e conferir as fechadas recentemente; voltar a A e reabrir.
- Assertions: o fechamento em B não apaga o tab oculto de A; as fechadas recentemente mostram apenas os registros do owner atual; a reabertura em A restaura o tab de configurações original; o fechamento do Browser main é consistente com a UI.
- Evidência: menu, tabs e página de settings reais do Electron, com logs do renderer. Não solicita modelo, não altera decisões de permissão de páginas e não precisa de provider fixture. A aprovação automática continua mantida em revisão manual pending.
- Complemento por testes unitários: mesmo caminho com workspaceIdentity diferente, tabs pública/de conversa/de rascunho, cada tipo de owner intrínseco, ausência de tabs visíveis, troca de workspace/conversa ou abertura de novo tab durante o fechamento assíncrono em espera, e recusa de fechar o main.

## Invariantes

- O `+` não participa do cálculo de largura igual dos Tabs.
- A rolagem só pode ocorrer depois que todos os Tabs atingiram o limite inferior de 60px.
- Clicar no botão de fechar não pode disparar ativação de Tab nem arrasto.
- Fechar com o botão do meio do mouse não pode ativar primeiro o Tab alvo nem disparar a rolagem padrão do browser para o botão do meio.
- O estado temporizado do Tooltip não pode alterar o comportamento de flex shrink do Tab.
- Este grupo de testes não pode iniciar requisições de modelo nem depender de fixture de replay de provider.

## Padrão de interface geral / de programação M1

O escopo e os casos MODE-01～07 estão em [matriz de verificação de modos](general-coding-mode-verification.md). Os novos casos de desktop estão em `packages/desktop/test/e2e/ui-shell/general-coding-mode.test.ts`, cobrindo preferências de Settings, ocultação da entrada e preservação de painéis existentes; já foram aceitos manualmente e convertidos em casos formais de ui-shell, mas ainda não foram adicionados ao preset Docker. A exibição da conversa é complementada por testes unitários de componente, e o estado de validação segue o da matriz.
### Nova aba múltipla e comportamento padrão das tabs

- Setup: abrir um tab Terminal.
- Action: clicar duas vezes seguidas em «+», escolher a primeira new-tab e depois fechar as duas novas tabs.
- Assert: ids independentes, a mais recente ativa, título de new-tab, largura não maior que 156px; a antiga pode ser re-focada e mostra a entrada de lançamento; fechar remove apenas o tab alvo.
- Ajuste de entrada: a seleção no menu do antigo «+» passa a ser a linha de lançamento dentro da new-tab, usando a ação de abertura de app já existente.

### SPT-E2E-009 New-tab padrão e substituição de ferramenta

- Setup: rascunho de nova tarefa, sem tab de scope atual.
- Action: expandir, escolher terminal, recolher e expandir de novo, clicar no «+», fechar a nova tab e a última tab de ferramenta.
- Assertions: na primeira vez há exatamente uma new-tab e o «+»; o terminal substitui essa tab; recolher e expandir restaura o id original; o «+» adiciona de forma independente; fechar a última tab recolhe o painel; expandir de novo cria uma new-tab.
- Escopo: interação do desktop e estado de UI compartilhado; travessia de scope e fechamento assíncrono são complementados pela regressão do hook.

SPT-E2E-009 complementar: depois de fechar a última tab, o painel recolhe e não é recriado; expandir de novo cria uma new-tab. Depois que o comando real de menu de fechamento fecha a única new-tab, o próximo evento de contexto de fechamento não é interceptado pelo App e pode entrar no fallback de fechar a janela.

## Visão completa (SPFV, spec: `docs/ui/side-pane-full-view.md`)

### Dimensões de estado e podas

| Dimensão     | Classe de equivalência                               | Decisão                                                                 |
| -------- | ------------------------------------ | -------------------------------------------------------------------- |
| Entrada     | botão / atalho                        | ambas as classes cobrem entrada e saída                                                 |
| surface  | tab de conversa / tab de painel / nenhum tab de painel visível | as duas primeiras classes são cobertas; quando não há tab visível, a página inicial fica por conta da lógica do componente e não é coberta à parte            |
| Forma da janela flutuante | recolhida / recolhida + barra de ações / expandida / minimizada | todas são cobertas                                                             |
| Forma de saída | botão / atalho / ◫ / fechar o último tab | as três primeiras classes são cobertas; fechar o último tab reaproveita a lógica de recolhimento existente, coberta por teste unitário de memória do owner |
| owner    | voltar à mesma session / session diferente       | coberto por caso de provider                                                 |
| Interação bloqueante | aparece no estado recolhido / aparece quando minimizado | o caso minimizado é coberto (o que também prova que o card está dentro da janela flutuante)                             |
| Cliente   | desktop / Web / controle remoto do celular                | só desktop; Web e controle remoto não renderizam a entrada, e são cobertos por teste unitário condicional do componente                   |

### SPFV-E2E-001 Entrada, saída e instância única

- Setup: rascunho no desktop, Side Pane aberto e um novo tab Terminal; aplicar uma marca DOM no nó raiz do SessionPane principal.
- Action: clicar em «entrar na visão completa»; sair com o atalho; entrar de novo pelo botão.
- Assertions: na visão completa a largura da lista de tasks da esquerda não muda, o grupo de botões do canto superior esquerdo continua presente, o WorkspaceHeader não existe e a largura da moldura do Side Pane fica próxima da largura de `#content`; a primeira tab da barra de tabs é a tab de conversa, e o estilo computado `-webkit-app-region` é `no-drag` (clicável com o mouse real); ao sair, a largura da sidebar e do painel volta à de antes da entrada; durante todo o processo o nó raiz do SessionPane mantém a mesma marca DOM (não foi remontado).

### SPFV-E2E-002 Tab de conversa em largura total e janela flutuante do tab de painel

- Setup: continua de 001, na visão completa o tab atual é Terminal.
- Action: clicar na tab de conversa; depois clicar na tab Terminal.
- Assertions: quando a tab de conversa está ativa, o host de conversa cobre o slot (erro de até 2px), a janela flutuante não existe, o input é de layout de duas linhas (`data-composer-layout=stacked`) e tem a barra de itens do rascunho; ao voltar para a tab Terminal, a janela flutuante aparece no canto inferior direito do slot (16px da borda), expondo apenas a área de input: a área de input tem a mesma largura da janela flutuante, a borda inferior é alinhada, não há margem externa, o drawer não está visível; o input é de linha única (`data-composer-layout=inline`, altura da janela flutuante de no máximo 64px, «+», área de input e botão de envio alinhados da esquerda para a direita na mesma linha, centralizados verticalmente com erro de até 2px, e a área de input ocupando pelo menos metade da largura), sem barra de itens do rascunho; a marca DOM colocada no nó do input antes da troca continua no lugar (o editor não foi remontado).

### SPFV-E2E-003 Barra de ações, minimizar e restaurar

- Setup: continua de 002, janela flutuante no estado recolhido.
- Action: clicar no input da janela flutuante e digitar texto; clicar na área vazia do painel; focar o input de novo e clicar em «−»; clicar no botão redondo.
- Assertions: com o input focado o drawer desliza, a barra de ações fica visível e sem título (nem loading quando ocioso), e o drawer se estende até a borda inferior do input (erro de até 1.5px, sem entalhes laterais); fica oculto após a perda de foco; depois de «−» resta apenas o botão redondo; ao clicar, o estado recolhido é restaurado e o input recebe foco com o texto ainda lá; ao trocar para a tab de conversa, o input principal mostra o mesmo texto.

### SPFV-E2E-004 Arrastar com encaixe e menu

- Setup: continua de 003, janela flutuante no estado recolhido.
- Action: arrastar ⠿ para a região superior esquerda do slot e soltar; clicar em ⠿ para abrir o menu e escolher «abrir na visão completa».
- Assertions: ao soltar, a janela flutuante encosta no canto superior esquerdo do slot (16px); a preferência global `zcode:side-pane-full-view:floating-anchor` é gravada como `top-left`; depois de escolher o item de menu a visualização muda para a tab de conversa, e o estado expandido da janela flutuante não é alterado pelo clique no menu (regressão: o evento do portal sobe pela árvore do React).

### SPFV-MODEL-001 Fechamento do menu de modelos da janela flutuante (pending)

- Setup: janela flutuante na visão completa, com uma página de plugin independente atrás; há dois modelos disponíveis e um bloqueado.
- Action: abrir o menu de modelos e clicar na área do plugin; abrir de novo e escolher um modelo (incluindo o modelo atual e a confirmação por teclado), depois clicar fora para fechar; ajustar a faixa e trocar o Provider; fechar com Escape.
- Assertions: um clique fora fecha o menu e não dispara a ação do plugin por baixo; depois de escolher um modelo disponível a escolha vale e o menu permanece aberto, e o modelo bloqueado não fecha; o ajuste de faixa e a navegação de Provider mantêm o menu aberto; depois de escolher o modelo ainda é possível clicar fora uma vez para fechar, e depois de fechar o plugin continua interativo. O desktop Electron usa um webview real e a largura de celular no browser usa um iframe independente, cobrindo os temas claro e escuro.
- Candidatos de automação: `packages/ui/test/browser/manual-review/pending/composer-menu-dismiss.test.mjs`; junto com o `ui-shell/side-pane-full-view.test.ts` já existente, valida o comportamento da janela flutuante no App completo. A fixture de nível de componente não cobre instalação de plugin, handshake de Agent nem conexão de controle remoto.

### SPFV-E2E-005 Expandir e recolher o fluxo de mensagens

- Setup: janela flutuante recolhida + barra de ações.
- Action: clicar no botão «⌃»; depois clicar no botão «⌄».
- Assertions: ao expandir, a altura da janela flutuante passa de 400px e a timeline fica visível, com o botão `aria-expanded=true`; a borda inferior do contêiner de rolagem das mensagens fica pelo menos 8px acima do topo da área de input (a barra de rolagem não se estende para trás do input); clicar de novo volta ao estado recolhido.

### SPFV-E2E-009 A camada da página de plugin não é coberta pela moldura do painel

- Setup: continua de 005, na forma de janela flutuante da visão completa, o tab atual é Terminal.
- Action: com o mesmo conjunto de estilos de `pluginUiPagePlane`, colocar no final do `body` uma camada de ancoragem (`[data-sandbox-page-parking]`, `position:fixed; inset:0`, sem z-index) contendo um nó de página `position:fixed; z-index:10` que cobre o slot; tomar `elementFromPoint` na região inferior direita do slot.
- Assertions: o elemento atingido é o nó da página, e não um elemento dentro da moldura do painel (regressão: a moldura `z-10` encobre a UI do plugin, deixando o plugin tab em branco).

### SPFV-E2E-006 Saída pelo painel

- Setup: visão completa.
- Action: clicar no botão de painel ◫; depois clicar no botão de painel no WorkspaceHeader para reabrir.
- Assertions: ao fechar, volta-se ao layout comum; ao reabrir, continua-se na visão comum (não volta para a visão completa).

### SPFV-E2E-007 Envio pela janela flutuante e memória por session (provider)

- Setup: session A existente (primeira mensagem concluída), tab Terminal aberto, entrada na visão completa.
- Action: enviar uma mensagem no input da janela flutuante; na visão completa, criar um rascunho pela paleta de comandos (⌘K → New task); voltar para A na lista de tasks da esquerda.
- Assertions: a mensagem aparece na timeline de A e recebe resposta; ao fim da resposta, uma bolha de resposta aparece acima da janela flutuante contendo apenas o corpo da resposta (sem ícone, sem título); o rascunho fica na visão comum; ao voltar para A, a visão completa e a janela flutuante são restauradas, e a bolha continua lá (só some com × ou clique); ao clicar na bolha, a janela flutuante expande e a bolha some, e ao recolher ela não aparece de novo (regressão: trocar de sessão não gera React #185, e o painel não fica preso no estado recolhido).

### SPFV-E2E-008 AskUserQuestion ao minimizar (provider)

- Setup: continua de 007, sessão A na visão completa, tab atual Terminal.
- Action: enviar na janela flutuante um prompt que dispare AskUserQuestion (replay com atraso de 4s), minimizar assim que a mensagem do usuário aparecer e aguardar a requisição da pergunta.
- Assertions: depois que a mensagem do usuário aparece (com a requisição da pergunta ainda não chegada, com a conversa em execução), a barra de ações mostra loading à direita de «⌃ / ⌄», e o texto de placeholder do input é «trabalhando há N segundos» / `Working for …`, idêntico ao texto de duração da última linha da mensagem em streaming; a janela flutuante volta sozinha ao estado recolhido, e o card de pergunta aparece dentro da janela flutuante; depois de enviar a resposta, o card some e o input é restaurado; ao fim da resposta aparece uma nova bolha (`spfv-ask-done`), e clicar em × faz a bolha sumir mantendo a janela flutuante recolhida; com a conversa ociosa, ao focar a janela flutuante, a barra de ações fica visível, mas sem loading.

### Invariantes

- A troca para a visão completa não pode remontar o SessionPane, nem gravar persistência de proporção do painel ou de largura da sidebar.
- A janela flutuante e a tab de conversa compartilham o mesmo rascunho.
- A instância de webview / terminal do tab de painel permanece montada durante as trocas de surface.
