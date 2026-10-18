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

### SPT-E2E-007 Duas entradas para o painel de plugin

- Setup: `AnimatedSidePanePanel` real, hook de descoberta de plugins, menu e ação de abrir; o bridge injeta duas surfaces habilitadas, cobrindo largura desktop/en-US/claro e largura mobile/zh-CN/escuro.
- Action: primeiro disparar um pedido de abertura de plugin a partir de uma página em branco, depois fornecer o estado de tab existente e abrir o menu «+»; selecionar o mesmo plugin com o mouse e outro com o teclado. Cobrir ainda rascunho, diretório vazio, ausência de ação de abrir e host sem bridge.
- Assertions: os candidatos dos dois caminhos coincidem com os títulos localizados; a seleção no menu fecha o menu; o pedido de abertura preserva os campos de isolamento de workspace/sessão; aberturas repetidas apenas ativam o mesmo tab; rascunho/diretório vazio/host sem bridge não têm itens de plugin. O menu fica dentro do viewport e a página não tem overflow horizontal.
- Limites: a UI E2E do browser injeta um diretório de serviço e verifica o resultado da abertura na fronteira de owner de tab existente, sem iniciar sandbox de plugin, Agent ou cadeia de controle remoto do celular; essas capacidades de host continuam com a validação existente.

## Invariantes

- O `+` não participa do cálculo de largura igual dos Tabs.
- A rolagem só pode ocorrer depois que todos os Tabs atingiram o limite inferior de 60px.
- Clicar no botão de fechar não pode disparar ativação de Tab nem arrasto.
- Fechar com o botão do meio do mouse não pode ativar primeiro o Tab alvo nem disparar a rolagem padrão do browser para o botão do meio.
- O estado temporizado do Tooltip não pode alterar o comportamento de flex shrink do Tab.
- Este grupo de testes não pode iniciar requisições de modelo nem depender de fixture de replay de provider.

## Padrão de interface geral / de programação M1

O escopo e os casos MODE-01～07 estão em [matriz de verificação de modos](general-coding-mode-verification.md). Os novos casos de desktop estão em `packages/desktop/test/e2e/ui-shell/general-coding-mode.test.ts`, cobrindo preferências de Settings, ocultação da entrada e preservação de painéis existentes; já foram aceitos manualmente e convertidos em casos formais de ui-shell, mas ainda não foram adicionados ao preset Docker. A exibição da conversa é complementada por testes unitários de componente, e o estado de validação segue o da matriz.