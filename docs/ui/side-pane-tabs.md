# Tabs do Painel Lateral

## Objetivo

O side pane direito evolui do modelo de slot único para um modelo de múltiplas tabs, permitindo manter Browser, Diff e Code Viewer ao mesmo tempo e alternando entre eles dentro do pane.

## Design-chave

- O estado do side pane passa a ser `tabs + activeTabId`, em vez de um único `type`
- Diff usa tab singleton; cliques repetidos apenas ativam ou fecham a tab atual
- Browser suporta tabs de múltiplas instâncias; o fallback de Browser da entrada principal prioriza alternar para um Browser já existente, enquanto o Browser no menu «+» da tab strip cria uma tab independente
- Code Viewer reutiliza tabs por `sourceKey` estável, evitando o acúmulo do mesmo arquivo
- Ao trocar de workspace, apenas as tabs de Browser são mantidas; Diff / Code Viewer, fortemente ligados ao workspace, são descartados

## Comportamento da UI

- A página em branco e o menu «+» da tab strip mostram os painéis de plugins já habilitados no workspace atual (`ui.surfaces`), compartilhando `usePluginUiSurfaces` e as ações de abertura de plugin existentes; o menu usa `DropdownMenuItem` padrão, suportando seleção por mouse, toque e teclado, e fecha após a escolha.
- A entrada de plugin só aparece em sessões formais, quando a ação de abertura do host e o bridge estão disponíveis; rascunhos, ausência de painéis disponíveis ou hosts sem suporte não exibem itens de plugin. O título segue as regras localizadas do manifesto. Na abertura, workspacePath, workspaceIdentity, remoteSessionId e parentSessionId são repassados integralmente, e reabrir a mesma surface segue as regras de deduplicação de tabs já existentes.
- Motivo da correção: a entrada de plugin antes estava conectada apenas à página em branco; com a existência de tabs, a ação passou a usar outro menu «+», que ficou sem a lista de plugins. Os dois pontos de entrada compartilham o componente, mudando apenas a apresentação do botão/menu; não se adiciona registro de plugins, estado de sessão ou runtime. Os limites de suporte de desktop continuous, celular replayable e os hosts de plugin existentes permanecem inalterados.

```text
Host 已启用插件 → usePluginUiSurfaces → 空白页按钮 / + 菜单项
                                            ↓ 选择
                         useOpenPluginUi → 既有 side pane tab owner
```

- O topo do painel direito usa o componente `Tabs` já existente no projeto para renderizar a tab strip
- Ao alternar de tab, a instância do pane já aberto é preservada, evitando que a webview do Browser seja destruída
- A tab de Browser acompanha os eventos `page-title-updated` / `page-favicon-updated` da webview para exibir o título e o favicon da página; quando o evento não retorna nada, há fallback para o título padrão do Browser e o ícone Globe
- Os botões separados de Browser / Diff no Header foram removidos e unificados no botão do side pane na extremidade direita
- O botão do side pane é sempre clicável; ele apenas expande/recolhe o contêiner da direita e não cria automaticamente nenhuma tab como Browser / Review / Terminal
- O estado de rascunho de New Task e uma Task já existente reutilizam o mesmo esqueleto `WorkspaceHeader`; `variant="draft"` oculta o contexto e os menus específicos da task e preserva Help / Terminal / Side Pane e a área de caption de plataforma. Ao entrar em um novo rascunho, o side pane continua recolhido por padrão, e ao clicar no botão as tabs existentes são restauradas conforme o owner do rascunho; sem tab visível, exibe-se o estado vazio `Open tab`, sem criar tab implicitamente. O Web remoto do celular continua reutilizando o overlay de side pane existente, sem novo runtime ou cadeia de restauração. As restrições completas estão em `docs/ui/workspace-header-variants.md`.
- Quando o side pane está expandido mas a task atual não tem tab visível, exibe-se a página de estado vazio `Open tab`; a verificação usa o conjunto de tabs visíveis filtrado pela active task, e não todas as tabs do workspace registry. Mesmo que o registry ainda mantenha tabs ocultas de session-scoped de outras tasks, o estado vazio precisa ser exibido, sem tab strip vazia nem menu «+». O usuário precisa clicar explicitamente no botão do estado vazio para criar uma tab. Na entrada em painel estreito, os botões usam uma coluna `icon + name`; quando o side pane é alargado para mais de 480px, o layout passa a ser horizontal conforme a largura do contêiner e cada botão passa a ter icon acima e name abaixo; o raio dos botões é `rounded-xl`, o tamanho da fonte do nome é 13px, o ícone tem 16px, o fundo usa `surface` e nenhuma borda é exibida.
- Após fechar a última tab ou executar «fechar todas», o side pane entra imediatamente no estado recolhido; ao abrir novamente uma tab como Browser / Diff / Code Viewer / Terminal, ele expande de novo automaticamente
- Quando Browser / Diff / Code Viewer são reativados, o estado recolhido é limpo automaticamente, evitando que o conteúdo à direita exista mas continue oculto
- Tabs de nível de conversa são ocultas conforme o scope de pertencimento, sem serem destruídas; ao mudar para uma conversa sem tabs o painel recolhe, mas o Browser comum e a `<webview>` do browser-use
  continuam montados em segundo plano para manter a página viva. Ao voltar a uma conversa com tabs, a tab preferred/current/latest daquela conversa é reselecionada,
  e o painel é expandido ativamente, sem herdar o estado recolhido das conversas intermediárias
- O Code Viewer continua usando pré-visualização com realce de sintaxe para arquivos de código; para arquivos `.md/.markdown` e para sources de texto markdown passa a renderizar o corpo, permitindo inspecionar diretamente no side pane títulos, listas, links de arquivos do workspace e saltos para links externos
- O topo do Code Viewer mostra um breadcrumb compacto de caminho: por preferência `workspace -> diretório -> arquivo` conforme o workspace atual, com o nó final de arquivo tendo ícone do tipo de arquivo; caminhos muito longos são vistos por rolagem horizontal
- O canto superior direito do Code Viewer passa a ter dois botões, `更多 + 打开`; o fechamento continua passando pela entrada de fechamento da própria tab, e o menu `更多` hospeda apenas a troca de visualização relacionada ao tipo de arquivo, com suporte atual a preview/código-fonte de markdown, preview/código de SVG e o interruptor de quebra de linha automática para arquivos de código comuns
- A tab strip suporta reordenação por arrasto horizontal; a ordenação altera apenas a ordem do array `tabs`, sem mudar o `activeTabId` atual
- Cada tab tem largura padrão de 156px (`w-39`); quando a largura disponível da tab strip é insuficiente para manter a largura padrão, todas as tabs encolhem em partes iguais, com largura mínima de 60px (`min-w-15`). Somente quando todas as tabs encolheram até 60px e ainda assim não couberem é que a tab strip permite rolagem horizontal. O título usa o espaço restante dentro da tab além do ícone e do badge; o botão de fechamento é posicionado de forma absoluta e não ocupa espaço; ícone e texto formam o item-content, e conteúdo muito longo usa máscara com esmaecimento em vez de reticências; quando o botão de fechamento aparece, a área com esmaecimento se desloca para a esquerda, sem deslocamento ou reformatação do conteúdo
- A visão geral de tabs não participa da divisão igual das larguras. O botão de adicionar fica logo após a última tab enquanto não houver overflow; quando todas as tabs encolheram até 60px e ainda assim não couberem, com a tab strip em rolagem horizontal, o botão de adicionar se move para fora da área de rolagem e fica fixo à direita
- O botão de fechamento de cada tab é posicionado de forma absoluta, não ocupa espaço no título e só aparece quando selecionado, sob hover ou em focus-within; quando oculto, não responde a clique do mouse, e o foco por teclado pode fazê-lo aparecer. Em toque, seleciona-se primeiro e fecha-se depois; a operação de fechamento continua impedindo a ativação da tab ou o arrasto
- As abas suportam fechamento pelo botão do meio do mouse: quando o botão do meio é pressionado em qualquer área não interativa da tab, ela fecha diretamente, sem antes ativá-la; o comportamento padrão de rolagem automática do navegador com o botão do meio também precisa ser bloqueado. Essa interação é reutilizada por todos os tipos de tab do Side Pane (incluindo chat lateral, Browser, Terminal etc.); o toque na Web móvel não tem botão do meio e não depende dessa interação
- Cada tab reutiliza o Tooltip encapsulado pelo projeto para exibir o título completo sem truncamento. A exibição só ocorre após 1500ms de entrada do ponteiro; ao sair ou mover para outra tab, a dica atual é cancelada imediatamente, e a nova tab precisa esperar os 1500ms completos novamente, sem aproveitar a janela de troca rápida do grupo de Tooltip. Ao arrastar uma tab a dica é forçadamente fechada, e no toque não se depende dessa interação de hover
- O arrasto usa um limiar de distância, e o clique simples continua responsável apenas por alternar a tab; a área do ícone de fechamento não dispara arrasto
- A tab strip suporta menu de contexto com o clique direito, oferecendo atualmente fechar a tab atual e fechar as outras tabs; ao fechar as outras, a tab sobre a qual foi feito o clique direito é mantida e ativada
- Ao lado do botão de adição da tab strip há uma entrada de visão geral de abas, que permite buscar por múltiplas palavras em título, caminho/URL e tipo das abas abertas, ver o horário de abertura, alternar para a aba alvo e ainda fechar as outras abas ou todas
- O rodapé da visão geral de abas exibe as abas fechadas recentemente; clicar em um item fechado recentemente reabre e ativa a tab correspondente
- A busca da visão geral de abas filtra simultaneamente abas abertas e abas fechadas recentemente; os resultados são ordenados priorizando casamento de título e depois por caminho/URL e tipo
- As tabs, o estado recolhido, a seleção de source do Git e a URL atual do Browser do side pane são mantidas em memória com a chave `workspaceIdentity?.trim() || workspacePath`, sendo restauradas após troca de workspace; não sobrevivem a refresh ou reinício do aplicativo
- A URL de múltiplas tabs de Browser é registrada por `browser tab id -> URL`, evitando que múltiplas webviews compartilhem o mesmo endereço de restauração
- No desktop, `Cmd/Ctrl+W` segue a semântica de «fechar o contexto atual»: se o side pane direito estiver expandido e houver tab ativa, fecha-se primeiro essa tab; caso contrário, faz fallback para fechar a janela atual. O atalho é encaminhado pelo processo main ao renderer para a decisão, evitando que o role `close` nativo do Electron feche a janela diretamente e contorne o estado do side pane