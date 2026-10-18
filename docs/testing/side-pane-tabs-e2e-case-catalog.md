# Catálogo de Cases E2E de Side Pane Tabs

## Escopo

Este documento registra a semântica de UI E2E no desktop para a largura responsiva, o overflow, os botões de ação e o Tooltip de título do Side Pane Tab strip. Essa capacidade pertence à apresentação do UI shell e não depende de Agent, fixture de provider, session realtime ou recuperação por persistência.

## Dimensões de estado e podas

| 维度          | 等价类                                                       | 决策                                                                                  |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 可用宽度      | 可容纳 156px / 需要在 156px 与 60px 间收缩 / 60px 仍无法容纳 | 三类均覆盖                                                                            |
| Tab 类型      | Browser / Terminal / Diff / Code Viewer / session-scoped tab | 使用可重复创建的 Terminal 代表共享 `SidePaneTabTrigger`；类型专属内容不在本组重复覆盖 |
| Tab 状态      | active / inactive                                            | 关闭按钮 case 同时覆盖                                                                |
| Tooltip hover | 未满 1500ms / 满 1500ms / 跨 Tab                             | 三类均覆盖                                                                            |
| 客户端        | Desktop / mobile Web touch                                   | Desktop 覆盖；触屏不依赖 hover，剪枝 Tooltip；移动布局由组件级响应式测试覆盖          |
| 鼠标中键      | active / inactive tab                                        | Desktop 覆盖；中键关闭不激活目标 tab，并阻止浏览器默认中键滚动                        |
| 其他交互      | 拖拽、右键、标签总览                                         | 不属于本次改动，使用既有组件测试，不在本组重复覆盖                                    |

## Cases aceitos

### SPT-E2E-000 独立面板平台圆角与拖动指示线

- Setup: desktop com rascunho de nova tarefa, Side Pane e Terminal inferior expandidos, usando temas claro e escuro respectivamente.
- Action: aguardar o estado da plataforma e o layout ficarem prontos, passar o mouse e arrastar os handles de Sidebar, Side Pane e Terminal.
- Assertions: Windows 5px, Sequoia e macOS anteriores 6px, Tahoe 26+ 12px, Linux 12px; as três hot zones mantêm 4px, a linha de indicação é de 2px ao longo da borda em foreground-subtlest/50, sem mask, oculta por padrão e visível no hover/arrasto, com mudança real de tamanho.
- Complemento da cadeia de dados: useAppChromeStateAutoUpdate.test.ts executa o hook real, com a consulta assíncrona da plataforma retornando macOS 15/26, validando o raio e a limpeza da assinatura; serve para capturar, em CI que não é macOS, o problema da consulta de macOS ser pulada por um guard. Não substitui a aceitação visual nativa no macOS.

### SPT-E2E-001 默认宽度与跟随加号

- Setup: janela do desktop com o Side Pane aberto, criando apenas um tab Terminal, com espaço suficiente para a largura padrão.
- Action: observar o tab strip.
- Assertions: largura do Tab de 156px (tolerando erro de subpixel); sem overflow no viewport horizontal; o botão de adicionar fica dentro do conteúdo rolável e logo após o último Tab.

### SPT-E2E-002 等宽收缩但不滚动

- Setup: criar três Terminal tabs e ajustar a janela para uma largura em que seja necessário encolher, mas ainda mantendo cada Tab acima de 60px.
- Action: aguardar o ResizeObserver concluir o layout.
- Assertions: todos os Tabs têm larguras iguais; a largura está em `[60px, 156px)`; sem overflow no viewport horizontal; o botão de adicionar continua dentro do conteúdo rolável.

### SPT-E2E-003 达到最小宽度后滚动

- Setup: continuar criando Terminal tabs, de modo que a soma das larguras mínimas de 60px ultrapasse o espaço disponível.
- Action: aguardar a atualização do estado de overflow.
- Assertions: nenhum Tab com menos de 60px; `scrollWidth > clientWidth` no viewport; o botão de adicionar sai do viewport e fica fixo na área de ações à direita.

### SPT-E2E-004 选中或 hover 时显示关闭按钮且不激活

- Setup: pelo menos dois Tabs, com o segundo active e o primeiro inactive.
- Action: afastar o mouse e limpar o foco, verificando a visibilidade do botão de fechar; fazer hover no Tab inactive e clicar no seu botão de fechar.
- Assertions: o botão de fechar do Tab active está visível; o Tab inactive fica oculto sem hover e visível com hover; o Tab inactive é fechado; o Tab active original permanece active.

### SPT-E2E-005 Tooltip 独立等待 1500ms

- Setup: pelo menos dois Tabs.
- Action: passar o mouse sobre o primeiro Tab por menos de 1500ms, mover para o segundo Tab e esperar até que o segundo Tab complete seus próprios 1500ms.
- Assertions: nenhum Tooltip é exibido durante a janela de espera do primeiro; após cruzar Tabs, o tempo já esperado não é herdado; quando o segundo Tab completa 1500ms, o Tooltip aparece com o título completo.

### SPT-E2E-006 鼠标中键关闭且不激活

- Setup: pelo menos dois Tabs, com o segundo active e o primeiro inactive.
- Action: despachar um evento de mouse do botão do meio (`button=1`) no corpo do rótulo do Tab inactive.
- Assertions: o Tab inactive é fechado; o Tab active original permanece active; o comportamento padrão do evento é impedido e a ativação do rótulo não é disparada.

### SPT-E2E-007 插件面板的双入口

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

## 通用 / 编程界面模式 M1

O escopo e os casos MODE-01～07 estão em [matriz de verificação de modos](general-coding-mode-verification.md). Os novos casos de desktop estão em `packages/desktop/test/e2e/ui-shell/general-coding-mode.test.ts`, cobrindo preferências de Settings, ocultação da entrada e preservação de painéis existentes; já foram aceitos manualmente e convertidos em casos formais de ui-shell, mas ainda não foram adicionados ao preset Docker. A exibição da conversa é complementada por testes unitários de componente, e o estado de validação segue o da matriz.