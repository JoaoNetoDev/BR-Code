# Layout de Painéis Independentes do Workspace

## Objetivo

O desktop e o Web em tela larga mantêm a barra lateral e separam a sessão e o Side Pane, que antes compartilhavam o mesmo quadro externo, em painéis independentes; o fundo raiz da janela e a barra lateral mantêm a semântica original.

Cantos arredondados por plataforma no workspace layout: `rounded-md` (6px por padrão) no Windows, 6px no macOS Sequoia e anteriores, 12px no Tahoe 26+, e 6px provisório para versões de macOS desconhecidas; `xl` (12px) no Linux e na Web. A página de configurações do Windows usa 6px de forma sincronizada.

A aceitação do token de canto no SPT-E2E-000 distingue os estados do Side Pane: com ele expandido, verifica-se apenas o `rounded-md` / `rounded-l-md` do quadro externo do Side Pane, e o quadro externo da sessão mantém o canto de painel independente por meio de `--workspace-panel-radius`; depois de recolhido, verifica-se o chrome token do quadro externo da sessão. Os dois estados checam o raio efetivamente calculado, evitando interpretar a variável dinâmica do estado expandido como ausência de token.

## Dimensões da borda externa por plataforma (2026-10-09, substitui as dimensões históricas abaixo)

- No Windows, o espaçamento extra à direita, na base e no topo do workspace, e também a margem esquerda depois de recolher a Sidebar, são de 6px; no Linux todos permanecem em 4px, e o canto de 12px do painel principal é preservado.
- A página de configurações do Windows sincroniza as margens de 6px à direita, na base e no topo e o canto de 6px; o lado esquerdo, onde a navegação encosta no conteúdo, não ganha espaçamento. macOS, Web e celular mantêm as regras existentes.
- Nova task, sessão, plugins e Automations reutilizam a borda compartilhada do workspace, e o terminal e o Side Pane sincronizam o canto; a zona quente de arrasto de 4px entre os painéis não muda.
- A linha indicadora de arrasto mantém 2px, foreground-subtlest/50, a extensão ao longo da borda e as regras atuais de exibição. As pontas da linha indicadora da Sidebar recuam conforme a margem externa da plataforma somada ao canto: 12px no Windows e 16px no Linux.
- O SPT-E2E-000 valida as dimensões por plataforma, a margem esquerda recolhida e o arrasto, e o UP-00 valida a página de configurações; os testes unitários das funções de plataforma cobrem Linux, capacidade desconhecida do Windows e janela normal e maximizada.

A versão do macOS precisa ser consultada via `IPlatformService.getDesktopWindowChromeState` e acompanhada por meio dos eventos de estado da janela, e então repassada por `useAppChromeState` ao cálculo dos cantos do workspace. Anteriormente o hook excluía o macOS, o que fazia todas as versões de macOS caírem no ramo de 6px de versão desconhecida; os desktops de todas as plataformas compartilham o mecanismo já existente de revisão contra sobrescrita de consulta/evento, e a Web não consulta o estado do desktop. O teste de regressão precisa rodar o hook real e validar os cantos de Sequoia/Tahoe após a consulta assíncrona, bem como a limpeza da assinatura; não basta injetar a versão na função de raio.

```text
Window / Sidebar / transparent body layout
                  + conversation frame ---+ 4px + side frame --------+
                  | WorkspaceHeader       |     | Side Pane tab bar  |
                  | conversation          |     | preview/browser    |
                  +-----------------------+     |                    |
                  | 4px resize handle     |     |                    |
                  + terminal frame -------+     |                    |
                  | terminal (optional)   |     |                    |
                  +-----------------------+     +--------------------+
```

- A sessão e o terminal inferior usam cada um seu próprio quadro externo com `bg-background`, `rounded-xl` e `border-border`, e o WorkspaceHeader fica dentro do quadro externo da sessão; quando o terminal está fechado, a sessão preenche a coluna esquerda.
- O fundo raiz da janela no macOS usa `bg-background-alt`; Windows, Linux e Web continuam usando `bg-background-win-alt`.
- O launcher / barra de tabs / conteúdo do Side Pane compartilham um quadro externo `bg-background` independente, com os dois painéis alinhados no topo e na base.
- Os painéis internos usam por padrão cantos `xl` e uma borda fraca `border-border`; o lado encostado na borda do sistema no Windows continua seguindo as regras existentes de native corner / maximized. O quadro externo do layout não conta como um nível de cantos de conteúdo.
- Entre os painéis permanece um espaçamento transparente de 4px, que carrega o resize handle; ao fechar o Side Pane o espaçamento não é mantido e a sessão volta a preencher tudo.
- O Sidebar do workspace, o Side Pane e o Terminal mantêm zonas de arrasto transparentes de 4px, com linha indicadora de 2px de largura e a cor de texto do terceiro nível `foreground-subtlest/50` (a opacidade reduzida para 50% sobre a base da cor do tema). Ficam ocultas por padrão e aparecem no hover, no foco por teclado e durante o arrasto. A linha indicadora não usa mask; a linha vertical volta a se estender ao longo da altura do painel e a horizontal ao longo da largura, com as duas pontas recuadas para dentro conforme os cantos do painel e extremidades arredondadas. As regras de arrasto, espaçamento e ocultação no celular permanecem iguais.

- Preservam-se as chaves de persistência, a largura mínima, o arrasto e os limites de fechamento explícito já existentes de `workspace-body-layout`, `conversation-column`, `browser` e dos painéis de sessão/terminal. O Side Pane não é desmontado por ligar/desligar ou troca de visão principal, e o transporte de screenshots do Browser Guest continua no caminho original.
- Os controles de janela de Windows/Linux pertencem ao grupo de ações inline do Header mais à direita: com o Side Pane fechado ficam no WorkspaceHeader; quando aberto, ficam no Side Header ou no topo do estado vazio. Não se mantém uma camada flutuante separada nem um placeholder de controle de janela nativo.
- A área vazia da barra de tabs do Side Pane no desktop suporta arrastar a janela; tabs e botões ficam de fora do arrasto da janela, preservando a reordenação de tabs, a troca, o fechamento e as ações de menu. Web e o painel de sobreposição do celular não habilitam a área de arrasto da janela.
- Quando recolhido, o WorkspaceHeader mostra o botão de expandir; quando expandido, esse botão vai para o lado direito do Side Header, e o estado vazio mantém a mesma entrada de recolhimento. Reaproveita-se o toggle e o atalho existentes, e o painel de sobreposição do celular continua usando a entrada de fechamento por gaveta.
- A visão geral de tabs, o botão de nova tab e os tab items do Side Header usam uniformemente o estilo ghost. O tab, por padrão, tem a mesma cor do fundo do header, usa `bg-hover` no hover e `bg-selected` quando selecionado, sem nenhuma borda de outline; o botão de fechar é posicionado de forma absoluta, não ocupa espaço no título e não sobrepõe uma máscara de fundo, e a pré-visualização de arrasto também não mostra borda, preservando a indicação de foco por teclado.
- O botão de fechar de um tab só aparece quando o tab está selecionado, sob hover ou quando o foco por teclado está dentro dele; quando oculto, não recebe clique do mouse; ícone e texto entram em um item-content separado e o overflow é apagado apenas com mask, sem reticências; quando o botão de fechar aparece, apenas a região com o fade é deslocada para a esquerda, sem alterar a largura nem a posição do conteúdo. Usuários de touch selecionam primeiro o tab e só depois usam o botão de fechar.
- Um tab selecionado mantém `bg-selected` também no hover, sem trocar para `bg-hover`.
- O separador entre WorkspaceHeader e Side Header usa `border-border/50`; o WorkspaceHeader do rascunho de nova task sempre usa um separador transparente, inclusive quando o Side Pane está expandido.
- O WorkspaceHeader de uma task existente mostra, antes do nome, um botão de ícone ghost do workspace: Folder para local, Cloud para nuvem/remoto, seguindo a verificacao existente de identidade do workspace. A cápsula do workspace depois do nome e a entrada de troca de branch são removidas; no hover, no foco por teclado ou ao tocar no ícone em telas sensíveis ao toque, mostram-se o nome do workspace (incluindo o identificador de host remoto já existente) e o branch atual. Detached HEAD usa o texto localizado já existente e workspaces sem Git não mostram branch. O rascunho de nova task continua sem esta entrada de contexto. Não se modifica a identidade do workspace, a conexão, o menu da task nem as outras entradas de troca de branch.
- O flyout de informações do workspace no WorkspaceHeader reaproveita o offset padrão de 2px do `ControlHintTooltip` e o `rounded-lg` do Tooltip, sem sobrescrever distância ou raio por conta própria.
- A lista de tabs do Side Header usa `gap-1` (4px), e o orçamento de largura de overflow usa o mesmo espaçamento.
- O tab do terminal inferior não tem ícone à esquerda, e o padding esquerdo usa `pl-2` (8px).
- O tab do terminal inferior também usa ghost: o fundo de seleção permanece igual no hover, o conteúdo usa fade com mask; o botão de fechar participa do layout flex normal, aparece somente quando selecionado, em hover ou em focus-within, mantém um espaço reservado quando oculto e a mask não é deslocada conforme o estado de exibição. O espaçamento entre tabs é de 4px, a largura acompanha o conteúdo, com máximo de 144px, sem largura fixa nem largura mínima. O título “终端” permanece como está, e o nome do shell usa texto auxiliar comum, sem fundo de pill, raio ou padding.
- Nova task, sessão comum, plugins e Automations usam a mesma borda de painel principal, sem criar um segundo estado de negócio.
- O controle remoto no celular mantém o caminho de coluna única / gaveta de sobreposição, sem espaçamento extra entre dois painéis; a contração responsiva não pode espremer a área de entrada nem gerar rolagem horizontal.

- Validação no Windows aprovada: SPT-E2E-000 `desktop-e2e-20261009070445229-p20968-57b667c6addfb7fa`; UP-00 `desktop-e2e-20261009070918592-p12424-e7971ff15e21066b`. 65 testes unitários relacionados passaram e 1 existente foi pulado; typecheck, typecheck:e2e, lint e a checagem de arquitetura passaram. As máquinas reais Linux/macOS, o navegador real do celular e a visualização página a página das páginas de plugins/Automations ainda precisam ser complementados; os testes unitários já existentes de plataforma e de layout do celular passaram.

## Cor da linha indicadora de arrasto no desktop (2026-10-09)

A Sidebar, o Side Pane e o terminal inferior unificam o uso do token `resize-handle`: sky-500 no tema claro e sky-400 no tema escuro; vale para os desktops macOS, Windows e Linux. A Web mantém foreground-subtlest/50, e a regra de ocultação no celular não muda. Mantêm-se a espessura de 2px, as pontas arredondadas, a extensão ao longo da borda e a exibição no hover, no foco por teclado e durante o arrasto, com ocultação por padrão. A zona quente de 4px e a lógica de arrasto não mudam. O SPT-E2E-000 valida nos dois temas a cor, o comprimento, a exibição/ocultação das três linhas indicadoras e o arrasto real.

## Limites de Compatibilidade

Apenas o layout e os estilos React mudam, sem alteração de protocolo/serviço/Host. Os limites de attachment, restauração e CommandInbox do desktop `desktop-continuous` e do celular `web-remote-replayable` permanecem inalterados; workspaceIdentity / remoteSessionId são repassados como estão.

## Alinhamento do Linux ao Windows (2026-09-04)

Esta seção substitui o acordo, no registro histórico abaixo, de que o Linux mantinha o layout antigo. O desktop Linux usa as mesmas margens externas de 4px, a borda completa de 5px nos quatro cantos, 13px à esquerda e 5px no topo do grupo de ferramentas do topo e 8px de padding dos dois lados do Header que o Windows usa. Janela normal e maximizada são iguais, e o Linux não aplica a exceção de cantos nativos do Windows 10.

Windows/Linux reaproveitam o mesmo componente inline de controles de janela, com botão de 28px, ícone de 16px, espaçamento de 2px e hover de fechamento destructive; quando recolhido, acompanha o toggle de Side Pane do WorkspaceHeader, e quando expandido, acompanha o Side Header (incluindo o estado vazio). Remove-se o antigo controle de janela flutuante do Linux e o placeholder de 120px; o WorkspaceHeader passa a usar a entrada de ajuda comum, sem seta para baixo independente. Os controles de janela da página de configurações seguem o grupo de menus assim como no Windows. macOS, Web e layout do celular não mudam; o frameless já existente no Linux e o DesktopCommand/eventos de estado continuam reaproveitados.

A aceitação segue SPT-E2E-000/007, com Windows/Linux executando as asserções de expandir/recolher, dimensões de layout e operação dos controles de janela nativos; os testes unitários de plataforma cobrem o isolamento entre Linux e Web/macOS. O ambiente Windows não substitui a validação em um gerenciador de janelas Linux real, e o registro do commit precisa deixar explícitos os itens pendentes.

## Aceitação

- Os painéis de workspace no macOS Sequoia (15) e anteriores usam cantos de 6px; Tahoe (26) e posteriores usam 12px. Versão desconhecida usa 6px primeiro. Sessão, Side Pane e Terminal inferior compartilham essa escolha de versão. Os raios atuais de Windows, Linux e Web não mudam.

- O painel de conteúdo principal da página de configurações usa cantos de 5px no Windows, coerente com o workspace principal do Windows; macOS e Linux mantêm por enquanto os 12px existentes. Os cantos afetam apenas o painel de conteúdo com 4px de margem externa, sem alterar a borda nativa da janela.
- O Sidebar da página de configurações ganha 4px sobre o tamanho anterior: 68px na largura compacta e 268px na largura desktop. O Sidebar não ganha espaçamento extra em relação ao conteúdo principal, e a ligação na borda esquerda da caixa de conteúdo é preservada.

- A página de configurações remove a seta para baixo de caption independente no Windows/Linux e passa a reutilizar a entrada de ajuda com interrogação do macOS; o interrogação e os controles inline formam o mesmo grupo de ações à direita, e o comportamento dos controles de janela, o hover de fechamento e a margem direita de 8px permanecem iguais. O macOS continua usando os controles nativos de janela, e a Web continua mostrando apenas o interrogação.

- A caixa principal de conteúdo da página de configurações usa de forma unificada 4px de padding externo no macOS, Windows e Linux no desktop: preserva o espaçamento de 0px já existente junto à borda da navegação lateral à esquerda e usa 4px de respiro de arrasto no topo para receber o painel de conteúdo; a Web não ganha margem externa de desktop. Este item uniformiza apenas as margens da estrutura grande, sem alterar o padding próprio da área de conteúdo das configurações.

- O Side Header e o WorkspaceHeader usam de forma unificada 8px de padding interno esquerdo e direito: visão geral de tabs à esquerda, grupo de ações dos controles de janela à direita e estado vazio do launcher, com o tamanho dos botões e o espaçamento interno dos tabs inalterados.

- Os controles de janela no Windows/Linux da página de onboarding profissional se alinham ao Workspace e às Settings: a área de título de 48px contabiliza as 4px de margem externa e a borda de 1px, e os controles ficam a 15px do topo da janela e a 13px da direita. A mesma geometria CSS é mantida com temas claro/escuro e variação de tamanho de janela; macOS e o Web no celular não mostram esse grupo de controles desenhados pelo app.

- Os controles de janela desenhados pelo app no Windows usam layout flex comum, encostando no toggle do Side Pane e reaproveitando seu tamanho `icon-md`, raio padrão e espaçamento de 2px, com o hover de fechamento mantendo o vermelho. Com o Side Pane recolhido pertencem ao WorkspaceHeader e, expandido, ao Side Header (incluindo o estado vazio do launcher); não usam camada de posicionamento absoluto nem reservam espaço extra de caption nativo. Os controles de janela da página de configurações seguem o grupo de ações de menu já existente.

- A janela principal e a janela de configurações no Windows adotam controles de janela desenhados pelo app: botão de 28px, ícone de 16px, raio de 5px, espaçamento de 4px e hover de fechamento na cor destructive. Maximizado mostra o ícone de restaurar, reaproveitando DesktopCommand e os eventos de estado da janela. O centro dos controles da janela principal é alinhado ao Header, o titleBarOverlay nativo não é habilitado e, no zoom, os controles desenhados e o espaço reservado escalam em sincronia com os CSS pixels. macOS/Linux não mudam. O menu de Snap Layout no hover do botão nativo de maximizar do Windows não faz parte da capacidade dos botões desenhados.

- Os botões de terminal/Side Pane no Header do Windows usam o mesmo estilo compacto do macOS, sem usar o fundo de clique de 48px de altura cheia e o espaçamento zero do caption do Windows; o espaço reservado para os botões de minimizar/maximizar/fechar do sistema continua sendo mantido de forma independente.

- O grupo de ferramentas do topo esquerdo no Windows usa 12px de padding horizontal mais 1px de margem à esquerda, resultando em margem real de 13px, ou seja, 5px mais à direita do que antes; o alinhamento vertical e o posicionamento de Linux/macOS não mudam.

- O grupo de ferramentas do topo esquerdo no Windows é deslocado em 4px de margem externa + 1px de borda de painel, alinhando-se à linha central de 48px do Header do workspace principal; vale tanto com a barra lateral expandida quanto recolhida, e o posicionamento original de macOS/Linux/Web não muda.

- Depois de remover a seta para baixo independente do Header no Windows, a área de ações volta a compartilhar `p-2`, com padding direito de 8px; o `pr-0` que existia para o menu de caption antigo deixa de ser mantido. O espaço reservado da área de botões de janela do sistema é preservado de forma independente.

- O WorkspaceHeader no Windows compartilha a área de ações comum com o macOS, removendo o menu de seta para baixo de caption e o placeholder de separador à direita do terminal; a entrada de ajuda padrão e o espaço reservado para os botões de janela do sistema são preservados. As entradas de menu de Linux e da página de configurações não mudam.

- A sessão, o terminal e o Side Pane, tanto em janela normal quanto maximizada no Windows, usam de forma unificada cantos de layout de 5px e borda completa de 1px: os painéis têm 4px de margem externa e não sustentam mais diretamente a borda do sistema. Quando a capacidade é desconhecida, adota-se o mesmo valor padrão; as regras existentes de canto reto externo do Windows 10 são mantidas por enquanto, e o macOS usa Sequoia 6px / Tahoe 12px conforme a versão.

- O workspace principal do Windows e do macOS mantém de forma unificada padding externo de 4px no topo, à direita e na base; depois que a barra lateral é recolhida, os 4px à esquerda também são mantidos. As pontas da linha de arrasto da barra lateral contabilizam também essa camada de margem. Linux, Web e celular mantêm as regras originais, e a área de controle de caption do Windows continua reservada segundo as regras originais.

- Com o Side Pane expandido: o Header pertence ao painel da sessão, os dois painéis têm cantos e fundo independentes; a diferença entre topo e base é <= 1px e o espaçamento entre painéis é de 4px.
- Com o Side Pane fechado: o painel esquerdo recupera a largura original; expandir e recolher repetidamente não perde tabs, conteúdo do terminal nem a sessão.

- Fundo e borda são verificados nos dois temas; os testes unitários já existentes de caption no Windows/Linux e de controle remoto no celular passam.
- Executar os testes unitários relacionados, o E2E de Electron, typecheck e lint, registrando a validação visual independente de plataforma que não foi possível concluir.

## Resultados da Validação

- 2026-09-10 retorno ao comprimento original: a linha indicadora se estende ao longo da borda do painel e recua conforme os cantos, mantendo foreground-subtlest/50 e sem mask. O SPT-E2E-000 de Electron no Windows falhou por timeout de hover na primeira rodada e passou na reexecução com o mesmo build (`desktop-e2e-20260910-034045-447`); cobre comprimento, tema claro/escuro e arrasto. typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). Os outras plataformas não foram retestados em máquina real.

- 2026-09-10 handle de comprimento fixo: a linha indicadora passou a ter 48px centralizados, mantendo 2px de espessura e foreground-subtlest/50, com remoção do mask. O SPT-E2E-000 de Electron no Windows validou comprimento fixo nos temas claro/escuro, ausência de mask, exibição/ocultação e arrasto real (`desktop-e2e-20260910-033653-782`); typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). Os outras plataformas não foram retestados em máquina real.

- 2026-09-10 linha com fade reduzida para foreground-subtlest/50: o SPT-E2E-000 de Electron no Windows passou (`desktop-e2e-20260910-033454-339`). A primeira rodada corrigiu um falso positivo do teste por nó de referência sem Tailwind utility, a segunda teve timeout de hover e a reexecução com o mesmo build passou. typecheck, typecheck:e2e e lint passaram (44 avisos já existentes); os outras plataformas não foram retestados em máquina real.

- 2026-09-10 linha com fade passando a usar a cor de terceiro nível foreground-subtlest: o SPT-E2E-000 de Electron no Windows passou, com run ID `desktop-e2e-20260910-032826-700`; typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). O fade, o arrasto e a exibição/ocultação não mudaram; os outras plataformas não foram retestados em máquina real.

- 2026-09-10 linha com fade na cor secundária: o SPT-E2E-000 de Electron no Windows passou, cobrindo a cor secundária dos três handles, a mask em gradiente, a ocultação padrão, a exibição em hover/arrasto, o arrasto real e os temas claro/escuro. Run ID `desktop-e2e-20260910-032455-191`. 17 testes unitários passaram e 1 existente foi pulado; typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). macOS/Linux e celular não foram retestados em máquina real.

- 2026-09-10 remoção da linha indicadora do handle: o SPT-E2E-000 de Electron no Windows passou; as três zonas de arrasto transparentes não têm linha indicativa em hover, durante o arrasto nem nos temas claro/escuro, e o redimensionamento real continua funcionando. 17 testes unitários relacionados passaram e 1 existente foi pulado; typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). macOS/Linux e celular não foram retestados em máquina real.

- 2026-09-10 cor sky do handle: sky-500 no claro, sky-400 no escuro, sem redução adicional de opacidade. O SPT-E2E-000 de Electron no Windows passou, cobrindo dimensões dos três handles, arrasto real e asserções de cor clara/escura; run ID `desktop-e2e-20260910-031310-945`. 16 testes unitários relacionados, typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). macOS/Linux e celular não foram retestados em máquina real.

- 2026-09-10 correção dos cantos de Sequoia: 20 testes de identificação de versão e raio passaram; typecheck, typecheck:e2e e lint passaram (44 avisos já existentes). No Electron do Windows a primeira rodada deu 6/8 (hover de tab e sequência de minimização falharam), e o reteste com o mesmo build de renderer deu 8/8, run ID `desktop-e2e-20260910-030905-004`. A aparência nativa de janela em Sequoia/Tahoe ainda precisa de validação em máquina macOS real.

- 2026-09-10 cor de texto de terceiro nível no handle: SPT-E2E-000~007 de Electron no Windows passou 8/8, cobrindo o arrasto dos três handles e as cores Zai claro/escuro; 14 testes unitários relacionados passaram e 1 existente foi pulado. typecheck, typecheck:e2e e lint passaram (46 avisos já existentes). macOS/Linux e celular não foram executados, e a mudança afeta apenas a cor da linha indicadora compartilhada, com a regra de ocultação no celular inalterada.

- 2026-09-07 E2E completo: os três handles validam zona quente de 4px, linha indicadora `bg-foreground` de 2px, ocultação padrão, exibição em hover/arrasto e mudança real de tamanho; também foi validada a largura desktop de 268px do Sidebar das configurações. Os testes encontraram e corrigiram o problema de a linha do Terminal sumir no estado de arrasto após o ponteiro sair da zona quente. Workspace E2E 7/7, Settings E2E 5/5 e 47/47 testes unitários relacionados passaram; os run IDs são `desktop-e2e-20260907065558567-p30371-3b85b0c85fbbae83` e `desktop-e2e-20260907065702167-p33040-7fa462d329a4436b`.
- 2026-09-07 alinhamento dos cantos da página de configurações no Windows: o painel de conteúdo principal usa 5px e macOS/Linux mantêm 12px. 14 testes unitários relacionados, 4 E2E de Electron da página de configurações no Windows, typecheck e lint passaram (44 avisos já existentes, 0 erros); run ID do E2E `desktop-e2e-20260907034259243-p15484-0c781c55b70b3943`.

- 2026-09-07 alinhamento da entrada de caption da página de configurações: Windows/Linux removem a seta para baixo antiga e o placeholder dinâmico do native overlay, reaproveitando a entrada de ajuda com interrogação do macOS e formando com ela uma área de ações de 134px junto aos três controles inline. 15 testes unitários relacionados, 4 E2E de Electron da página de configurações no Windows, typecheck e lint passaram (44 avisos já existentes, 0 erros); run ID do E2E `desktop-e2e-20260907033146942-p24568-0c3e36ba64f67d99`.

- 2026-09-07 alinhamento do quadro externo das configurações: a caixa principal de conteúdo em macOS, Windows e Linux usa de forma unificada 4px de padding externo, e a Web mantém 0px; 22 testes unitários relacionados, typecheck e lint passaram (41 avisos já existentes, 0 erros). A validação visual independente de Linux/macOS não foi executada no ambiente atual.

- 2026-09-04 Linux alinhado ao Windows: 60 testes unitários relacionados passaram; 8 regressões de interação em Electron no Windows passaram, com run ID `desktop-e2e-20260904131942845-p10384-c7851f1c1af7bbc7`, cobrindo minimize/close reais dos controles compartilhados, maximizar/restaurar e expandir/recolher dos painéis. typecheck e lint passaram (41 avisos já existentes, 0 erros). O branch de Linux já foi incluído nas mesmas asserções de E2E, mas o ambiente Windows atual não executou a validação real no gerenciador de janelas Linux/X11/Wayland; macOS e celular não tiveram reteste visual independente.

- 2026-09-04 controles de janela inline desenhados no Windows: 8 E2E de Electron no Windows passaram, cobrindo a atribuição após expandir/recolher e o espaçamento adjacente de 2px, o tamanho de 28px, os ícones de maximizar/restaurar, os eventos reais de minimize/close e as interações de painel existentes. Run ID `desktop-e2e-20260904125135324-p11372-6864a58ebc85a27d`. Os testes unitários relacionados, typecheck e lint passaram (41 avisos já existentes). O hover nativo de Snap Layout do Windows não foi implementado; macOS/Linux/celular mantêm o caminho original e não tiveram reteste visual independente. Janelas antigas precisam ser reiniciadas para que os parâmetros de criação frameless sejam aplicados.

- 2026-09-04 ajuste final dos cantos de layout do Windows para 5px: medição via CDP mostrou 5px nos quatro cantos; 28 testes unitários, 7 E2E de Electron no Windows, typecheck e lint passaram (41 avisos já existentes).

- 2026-09-04 restauração do estilo compacto dos botões do Header no Windows: a medição via CDP mostrou altura de 28px tanto para o botão de terminal quanto para o toggle do Side Pane; 10 testes unitários de Header, 7 E2E de Electron no Windows, typecheck e lint passaram (41 avisos já existentes).

- 2026-09-04 alinhamento do grupo de ferramentas do topo no Windows: a medição via CDP mostrou centros de 24px/29px antes do ajuste e 29px/29px depois; 3 testes unitários relacionados, 7 E2E de Electron no Windows, typecheck e lint passaram (41 avisos já existentes).

- 2026-09-04 correção da margem direita do Header no Windows: remoção do `pr-0` antigo; a medição via CDP voltou de 0px para 8px; 10 testes unitários de Header, 7 E2E de Electron no Windows, typecheck e lint passaram (41 avisos já existentes).

- 2026-09-04 remoção da seta para baixo independente do Header no Windows: em tempo de execução confirmou-se que restam apenas a ajuda comum e as ações de terminal; 33 testes unitários relacionados, 7 E2E de Electron no Windows, typecheck e lint passaram (41 avisos já existentes).

- 2026-09-04 correção da maximização do Side Pane: em tempo de execução confirmou-se que o estilo antigo era raio de 0px e apenas borda de 1px à esquerda; após a correção são 6px nos quatro cantos e 1px nos quatro lados. 28 testes unitários, typecheck e lint passaram; o E2E de Electron no Windows com maximize/unmaximize reais passou 7/7, com run ID `desktop-e2e-20260904121343959-p7064-eb22b5d3fbfec48a`.

- 2026-09-04 unificação dos cantos de layout do Windows com `rounded-md`: 28 testes unitários, typecheck e lint passaram (41 avisos já existentes); a medição via CDP mostrou 6px nos quatro cantos tanto da sessão quanto do Side Pane. Na primeira execução do E2E de Electron no Windows o resultado foi 6/7, com falha na asserção de atraso do Tooltip, e a reexecução com o mesmo build deu 7/7; as asserções de cantos de layout passaram nas duas vezes. macOS, Linux e celular não tiveram reteste visual independente nesta rodada.

- 2026-09-04 alinhamento do padding externo do Windows ao macOS: 23 testes unitários de layout, 7 E2E de Electron no Windows, `pnpm typecheck` e `pnpm lint` passaram (41 avisos já existentes). A medição via CDP mostrou 4px no topo do painel principal e 4px de padding direito/inferior do content. Run ID do E2E: `desktop-e2e-20260904120237923-p17680-a5f5b3aeaa873805`. macOS, Linux e celular não tiveram reteste visual independente nesta rodada.

- 2026-09-04 quadro externo independente do terminal: 39 testes unitários relacionados, 7 E2E de Electron, typecheck e lint passaram; o E2E verifica que o terminal fica fora do quadro da sessão, na mesma coluna à esquerda, com 4px de espaçamento, e que o fundo dos três painéis é igual nos temas claro e escuro. Run ID: `desktop-e2e-20260904104922835-p29510-089fd6229a80617c`. A lógica de borda nativa do Windows foi preservada, e a validação visual independente de Windows/Linux e celular ficou pendente.
- 2026-09-04: nos 8 arquivos de teste unitário relacionados, 51 casos passaram e 1 caso existente foi pulado. Os novos casos de atribuição do Header e de reserva da área de controle falharam antes e passaram depois.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e` e `pnpm lint` passaram; 41 avisos de lint já existentes, 0 erros.
- Versão final de 4px no Electron do macOS: 7/7; run ID `desktop-e2e-20260904084050358-p6937-68e000533efda13e`.
- A validação em tempo de execução inclui: espaçamento de 4px, alinhamento topo/base, dois quadros externos xl, atribuição do Header, mudança real de largura por arrasto do ponteiro, quadro externo independente do terminal inferior, restauração da largura após fechar, toggle da barra de tabs e interação de resize, e consistência do fundo claro/escuro. Os screenshots dos dois temas foram verificados.
- Caption de Windows/Linux e o caminho de controle remoto no celular têm cobertura de teste unitário, mas ainda não executaram E2E visual independente dessas plataformas; o fundo transparente da janela nos screenshots não equivale ao material de vibrancy que o sistema operacional finally sintetiza.

## Atividade Recente da Sessão Atual

Abaixo do nome/caminho no flyout de informações, mostram-se um ícone de relógio e “最近活动 2 分钟前” (Last active 2 minutes ago em inglês), no lugar das estatísticas tasks/active do workspace. Usa-se o `activity.lastActivityAt` em tempo real do meta da sessão atual, com fallback para `updatedAt`; quando o tempo é desconhecido, nada é exibido. Enquanto o flyout está aberto, o tempo relativo é atualizado a cada minuto, e o timer é limpo ao fechar. O componente de estatísticas original e sua query de lista são removidos; nenhum serviço, protocolo ou persistência é adicionado.

## Tipografia das Informações do Workspace

O ícone e o nome do workspace ficam na mesma linha, e abaixo do nome aparece o caminho alinhado à borda esquerda do nome. O caminho usa o foreground secundário e `text-ui-sm`; ele é abreviado como `~` apenas quando pertence ao diretório home do host ao qual o workspace atual pertence, e quando o home não é obtido, o caminho original é exibido. Abaixo aparece a atividade recente da sessão atual, com um separador `border-border/50` antes do branch; workspaces sem Git não mostram branch nem separador.

Validação da tipografia: 7/7 testes unitários relacionados, 7/7 de Electron no macOS (TTL01–TTL07), caminho medido `~/ZCodeProject`; typecheck e lint passaram (46 avisos já existentes). Registro da execução: `desktop-e2e-20260907080616432-p60066-d11800800bd11757`.

- 2026-09-10 MR !2586 CR-01: correção da consulta de estado de janela do macOS estar sendo pulada pelo guarda do hook. Duas novas regressões com o hook real falharam antes e passaram depois; 26 testes unitários relacionados, typecheck e lint (44 avisos já existentes, 0 erros) passaram. O SPT-E2E-000 de Electron no Windows passou, com run ID desktop-e2e-20260910-040930-907. A visual nativa do macOS e o celular em máquina real não foram verificados.

- O footer inferior do Workspace Sidebar mantém padding esquerdo de 16px (`pl-4`) e padding direito de 12px (`pr-3`); o padding vertical não muda. Essa sobrescrita é passada apenas pelo chamador do Workspace, e o footer reaproveitado pelas Settings mantém o padrão de 16px dos dois lados (`px-4`).

2026-10-09 correção de cantos: o workspace e a página de configurações do Windows são unificados em 6px, mantendo a margem externa de 6px e as pontas da linha indicadora da Sidebar em 12px. 50 testes unitários relacionados passaram; o SPT-E2E-000 do Windows (run desktop-e2e-20261009071323579-p14952-58feeab7544382d9) e o UP-00 (run desktop-e2e-20261009071448683-p19548-4169d17082d86dfb) passaram. typecheck, typecheck:e2e, lint e a checagem de arquitetura passaram.

2026-10-09 validação da cor da linha indicadora: o SPT-E2E-000 do Windows nos dois temas passou (desktop-e2e-20261009071748019-p456-09549c1404406786), com 39 testes unitários relacionados, typecheck, typecheck:e2e, lint e checagem de arquitetura aprovados; as máquinas reais Linux/macOS ainda precisam ser complementadas.

## Token de canto por plataforma (2026-10-12)

O canto de painel de 6px do Windows e das versões antigas do macOS usa `rounded-md`, e o lado esquerdo do caminho de canto não nativo do Windows usa `rounded-l-md`. A página de configurações reutiliza o mesmo token. Mantêm-se os 6px do cálculo de raio por plataforma, o recuo da linha indicadora de arrasto e os raios das outras plataformas; o layout e a interação de desktop e celular não mudam. A base do Logo segue o `rounded` já existente. Os testes unitários validam a escolha do token, e o E2E valida ao mesmo tempo a class da plataforma e o raio calculado.

Registro de verificação: 44 testes unitários relacionados passaram; typecheck, typecheck:e2e, lint (0 erros) e a checagem de arquitetura passaram. A tentativa de SPT-E2E-000 no macOS saiu na etapa de download do ChromeDriver por falha na validação do certificado do proxy, com 0 casos executados; as máquinas reais Windows/Linux e o navegador do celular não foram executados. Esta rodada não altera o cálculo do raio por plataforma nem os eventos de layout.

Limite de regressão dos controles de janela: o onboarding de tela cheia do OccupationOnboarding continua usando o deslocamento de 4px no topo e à direita; o painel independente da página de configurações posiciona os controles de janela conforme a margem externa de 6px do Windows e de 4px do Linux. Ambos mantêm a mesma compensação de borda de 1px, a altura de 48px e o padding horizontal de 8px. O teste antigo forçava erroneamente a igualdade dos deslocamentos dos dois contêineres; ele passa a verificar separadamente cada deslocamento e as dimensões compartilhadas, sem mudar a interface.