# Plano de reformulação da homepage de tarefas do controle remoto no celular

> **Status: descontinuado (confirmado em 2026-10, no merge do staging).** Após a refatoração
> de projetos virtuais, o home do celular passou a compartilhar o `ProjectSidebar` com o desktop
> (ver `docs/superpowers/specs/2026-09-09-virtual-project-design.md` §6.0.3 e o registro de desvio
> D64), e a homepage de tarefas exclusiva do celular, o snapshot de tarefas desktop→celular e o
> código relacionado descritos neste documento foram removidos. O texto abaixo serve apenas como
> histórico de fundo e não como base de implementação.

> **Status original: implementado.** Os pontos de entrada originais no código são
> `packages/ui/src/WebRemoteControlMobileShell.tsx`,
> `WebRemoteControlMobileTaskHome.tsx` e `hooks/useWebRemoteControlTaskOpen.ts`; a seção
> “Recomendação/ordem de implementação” abaixo preserva o rastro do design e não indica estado
> pendente.
>
> O caminho (chain) de controle remoto atual usa o app payload `data.payload` de um relay externo. As
> interações envolvendo a homepage de tarefas e a troca de workspace neste documento continuam
> válidas; as suposições antigas de relay token, bootstrap HTTP e `bridgeToken/wsUrl` estão
> obsoletas e não são mais uma base para a implementação.

A visão geral de produto e arquitetura está em
[Web remote control overview](./web-remote-control-architecture.md). Este documento registra o
contrato de interação da homepage e da página de chat no celular; linha do tempo, temas e listas em
telas largas são navegados de forma unificada pela visão geral.

## Contexto (antes da reformulação)

Antes da reformulação, o controle remoto Web no celular reaproveitava o `WorkspaceSidebar` e a área
de chat do desktop:

1. Em tela pequena, a página do celular era transformada pelo `WorkspaceShellLayout` em uma
   estrutura vertical.
2. A metade superior continuava sendo uma versão recortada da sidebar do desktop, com workspace,
   entradas de tarefas e algumas capacidades da barra lateral do desktop.
3. A metade inferior reutilizava a área de chat do desktop.

Essa estrutura permite reaproveitar rapidamente a lógica existente, mas não serve à nova
arquitetura de informação do celular. O novo objetivo é transformar o celular em duas páginas
claras:

1. Homepage: a lista de workspaces e tarefas do dispositivo atual.
2. Página de chat: a interface de chat depois que uma tarefa é selecionada, continuando a
   reaproveitar os componentes de chat do desktop.

A mudança central é: o celular deixa de reutilizar a UI de lista de tarefas do desktop, mas a lógica
de negócio — clique na tarefa, troca entre workspaces, reporte de mobile view state — continua
reaproveitando a cadeia de controle remoto existente do desktop.

## Objetivos

1. A homepage de controle remoto no celular exibe workspace cards; o card pode ser expandido e, ao
   expandido, mostra as tarefas daquele workspace.
2. Ao clicar em uma tarefa, entra-se na página de chat, que continua reaproveitando o header
   existente e a V4 session chat surface.
3. A lógica de clique na tarefa reaproveita a lógica Web remota existente:
   - tarefa do mesmo workspace: seleciona a tarefa diretamente e reporta o mobile view state.
   - tarefa de outro workspace: solicita um novo workspace bridge e depois entra na tarefa
     correspondente.
4. O estado inicial de leitura do QR code não entra mais automaticamente na página de chat.
5. Se o ponto de entrada do QR code trouxer uma tarefa inicial, a homepage expande automaticamente o
   workspace card ao qual a tarefa pertence e exibe a linha da tarefa correspondente como
   selecionada.
6. Mantém-se a separação entre o estado selecionado do desktop e do celular; uma ação no celular não
   troca de volta a tab/task atual do desktop.
7. Respeita-se a regra de isolamento de identidade
   `workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## Não objetivos

A primeira versão não faz:

1. Criar workspace no celular.
2. Criar SSH / WSL / Docker remote session no celular.
3. Gerenciar, no celular, workspaces fora da janela do desktop.
4. Vários celulares controlando a mesma janela do desktop ao mesmo tempo.
5. Refazer os componentes de chat, o runtime do ZCode ou o caminho principal do protocolo de relay.
6. Fazer o desktop mudar para a task escolhida no celular.

## Complemento de 2026-05-02: entrada de criação de task no nível do workspace

Para completar o ciclo de operação no celular, a homepage de tarefas oferece uma entrada “新建任务”
(desde 2026-09-23, um botão flutuante no canto inferior direito + uma camada de seleção de workspace,
veja a seção “Homepage”), com o seguinte comportamento depois de selecionado o workspace:

1. Mesmo workspace:
   - chama `startDraft(workspacePath, workspaceIdentity)` para entrar no estado de rascunho;
   - reporta `updateMobileViewState(workspaceKey)` (sem taskId), evitando continuar realçando a task
     antiga;
   - entra na página de chat.
2. Outro workspace:
   - segue por `switchWorkspace(workspaceKey, { mobileNavigationIntent: "chat" })`, sem passar
     `taskId`;
   - o Root de destino inicia com `initialTaskId=undefined`, entrando no estado de rascunho daquele
     workspace.
3. O `switcher` do controle remoto Web ganha a capacidade opcional
   `startDraft(workspaceKey, { mobileNavigationIntent })`, para o celular chamar de forma uniforme;
   implementações que não suportam essa capacidade ainda podem recorrer a
   `switchWorkspace + updateMobileViewState`.

Este complemento mantém a regra de isolamento de identidade existente:
`workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## Solução recomendada

Adotar um shell dedicado ao mobile, em vez de continuar reformulando o `WorkspaceSidebar`.

Recomenda-se adicionar uma camada de UI de controle remoto do celular:

```text
WebRemoteControlMobileShell
  ├── home: WebRemoteControlMobileTaskHome
  │     └── workspace card list
  │           └── task rows
  └── chat: existing chat header + V4 session chat surface
```

O desktop e o controle remoto Web em tela larga continuam usando o layout de desktop existente do
`WorkspaceShellLayout`. O shell de duas páginas do mobile só entra em uso quando
`webRemoteControlWorkspaceSwitcher` é satisfeito e o breakpoint de tela pequena é atingido.

Os benefícios dessa abordagem:

1. A UI da homepage pode ser projetada inteiramente para a experiência do celular, sem ficar limitada
   pela estrutura histórica da sidebar do desktop.
2. A página de chat continua reaproveitando a capacidade de chat existente, reduzindo o risco.
3. O clique na tarefa, o workspace bridge e o mobile view state não são reinventados; apenas são
   extraídos como um hook compartilhado.
4. Se a homepage do celular evoluir depois, por exemplo com busca, filtro por status ou estado de login
   de dispositivo, isso não contamina a sidebar do desktop.

## Modelo de página

### Homepage

A homepage serve para navegar pelos workspaces e tasks já abertos dentro da janela atual do desktop.
Em 2026-09-23 ela foi reformulada, com a prioridade “处理阻塞 > 看进度 > 继续工作 > 切换电脑”, para
uma lista agrupada em estilo de app nativo (protótipo confirmado arquivado no branch
`prototype/mobile-remote-redesign`).

```text
┌──────────────────────────────────────┐
│ [] Alice’s MacBook Pro ●  ⌄    (...) │  ← 页头：平台图标 + 电脑名 + 在线点，点击回设备列表
├──────────────────────────────────────┤
│ 已置顶 1                             │
│ 全部任务              [最近 | 工作区] │
│ 今天 3                               │
│ ┌──────────────────────────────────┐ │
│ │ ✋ 迁移设备列表到 relay v2 接口    │ │
│ │    z-code · 2 分钟前 · 2 项待确认  │ │
│ │ ◌  补充 attention 去重签名测试     │ │
│ │    z-code · 刚刚                   │ │
│ │ •  修复手机端主题切换闪白          │ │
│ └──────────────────────────────────┘ │
│ 昨天 / 本周 / 更早 …    [+ 新建任务] │
└──────────────────────────────────────┘
```

1. Cabeçalho (fixo no topo):
   - Entrada de dispositivo (comportamento vigente desde 2026-10-14, depois que o home do celular e
     o controle remoto em tela larga passaram a compartilhar a sidebar de projetos; protótipo
     arquivado no branch `prototype/mobile-device-row`): fica no topo da sidebar, acima de
     “新建任务”, e é uma linha ghost `lg` como “新建任务 / 自动化 / 插件市场”, sem divisor. A linha
     traz, nesta ordem, o ícone de plataforma (a plataforma do dispositivo lembrada pela máquina;
     ícone genérico de computador quando desconhecida), o nome do computador (`font-medium`,
     truncado em uma linha, sem reescrever o nome original; “未命名设备” quando ausente) e a seta
     `ChevronsUpDown`; sem o prefixo “当前设备：” e sem ponto de online. A linha inteira é clicável,
     com nome acessível e tooltip “切换设备”, e o clique chama
     `deviceNavigation.chooseOtherDevice()` para voltar à lista de dispositivos. No celular a linha
     de dispositivo ocupa o respiro do topo original (sem `pt-11` adicional); em tela larga fica
     abaixo da área de arraste de `h-12`. A linha de dispositivo não é renderizada quando
     `deviceNavigation` não é injetado.
   - Quando o terminal transport está em `reconnecting`, mantém-se o aviso flutuante centralizado
     no topo do mobile shell (“正在自动重连...”, sem interceptar cliques); a linha de dispositivo não
     carrega o estado de conexão.
   - Menu “更多” à direita: modo de ordenação (更新时间 / 创建时间), recolher tudo (apenas na visão
     de workspace), aparência (submenu de tema) e atualizar.
2. Não se exibem mais o card de aviso do QR code, o título “当前设备上的工作区和任务” nem a contagem
   “n 个工作区 · m 个任务”.
3. Seções de cima para baixo: “已置顶” → a linha “全部任务” (com o seletor segmentado
   “最近 | 工作区” à direita) → a lista comum. Em 2026-09-24 foram canceladas as seções
   independentes de “需要处理” e “运行中” e a ordenação running-first do celular, sem adicionar
   filtro por status:
   - “已置顶”: todas as tasks `pinned` não arquivadas, inclusive as em execução e as aguardando
     aprovação.
   - Lista comum: as demais tasks não arquivadas. A visão “最近” (padrão) agrupa pela linha do tempo
     do desktop; a visão “工作区” agrupa, na primeira exibição, pela ordem de workspaces devolvida
     pelo desktop. A exibição inicial ordena de forma decrescente pelo horário de atualização /
     de criação escolhido.
   - Cada task aparece uma única vez. Mudanças de status, attention, trabalho em segundo plano ou
     horário de atualização apenas atualizam o conteúdo da linha, sem mover a task já exibida e sem
     alterar o bucket de data desta permanência nem a ordem relativa dos grupos já existentes.
   - Uma task nova entra imediatamente na primeira posição do seu grupo; tasks novas do mesmo lote
     são ordenadas pela preferência de tempo vigente; um grupo novo é acrescentado ao fim da lista
     comum, sem expansão automática e sem rolagem automática. Fixar ou Desafixar muda a atribuição
     imediatamente; a área de fixados fica sempre no topo. Tasks arquivadas, removidas ou que
     saem do alcance visível do snapshot deixam a exibição imediatamente.
   - A reordenação é uniforme na primeira carga, em um refresh bem-sucedido (inclusive retry /
     refresh ao voltar para a home), ao voltar para a home, e ao trocar de seção ou de ordenação de
     propósito. Um refresh que falha mantém a ordem e o conteúdo atuais; o push automático não
     reordena. A mudança de idioma recalcula os grupos por data.
   - Seções de fixados e de data sem membros não são exibidas; o workspace mantém título
     recolhível e estado vazio. O título da seção é um texto pequeno esmaecido com a contagem, e
     cada seção é um grupo de listas `rounded-xl`.
4. Linha de task (altura clicável de pelo menos 56px):
   - Coluna de status fixa de 20px à esquerda: spinner durante a troca; ícone de mão em cor de aviso
     quando precisa de processamento; spinner quando está em execução; ícone de alarme em vermelho
     quando há erro; ponto azul quando não lida; vazio caso contrário. Os ícones têm formas
     diferentes e nome acessível, e não dependem apenas da cor.
   - A primeira linha tem o título truncado em uma linha; a segunda é “nome do workspace · tempo
     relativo” (a visão de workspace omite o nome do workspace), com “{count} 项待确认” em cor de
     aviso ao final quando precisa de processamento e “报错” em vermelho quando há erro; sem rótulo
     de status à direita da linha.
   - Quando há workflow em execução, a linha de execução é desenhada abaixo da segunda linha.
   - A task atualmente selecionada usa o fundo selected; tasks de um workspace remoto desconectado
     ficam desabilitadas.
5. O título de grupo da visão de workspace pode ser clicado para recolher: ícone do workspace (pasta
   local / nuvem remota / conversa), nome, o rótulo “远程” dos workspaces remotos, contagem de tasks
   e seta de recolhimento; quando recolhido, as não lidas aparecem como um ponto azul agregado. O
   título mostra ainda “运行中 n” e “待处理 m”, ocultos quando a contagem é 0, visíveis tanto
   expandido quanto recolhido. Conta-se apenas as tasks não fixadas do próprio grupo; o
   “a processar” conta tasks e não interações; tasks com attention contam como “a processar”, e as
   demais em execução ou com trabalho em segundo plano contam como “em execução”. Mudanças na
   contagem não expandem nem reordenam. O caminho é oculto por padrão e só aparece em texto pequeno
   quando há workspaces homônimos. Quando o remoto está desconectado, mostram-se “未连接” e o botão
   “重新连接”, e `lastConnectionError` aparece em texto pequeno abaixo do título. O workspace atual
   vem expandido por padrão, e “全部收起” fica no menu “更多”.
6. Nova task: botão flutuante “+ 新建任务” no canto inferior direito (nas duas visões). O clique
   abre a seleção de workspace a partir da parte de baixo, ordenada pela atividade recente do
   workspace (maior `updatedAt` do grupo), mostrando tipo, caminho e horário recente; com apenas um
   workspace disponível, entra direto no rascunho; workspaces remotos desconectados ficam
   esmaecidos e oferecem “重新连接”. Depois da seleção vale a regra de `startDraft` acima.
7. Estado: na primeira carga, linhas de esqueleto; sem nenhuma task, “还没有任务” e o botão
   “新建任务” (nesse caso o botão flutuante fica oculto, e sem workspace nenhum o botão não é
   exibido); falhas de carga ou de operação mostram uma barra de erro embutida e “重试”.
8. A lista de tasks do controle remoto em tela larga não está no escopo desta reformulação e não
   exibe `attention`.

Complemento de 2026-05-28: a homepage do celular ganha uma seção global pinned no topo. Quando o
renderer do desktop sincroniza o snapshot de tarefas, ele lê simultaneamente as duas listas sqlite
`kind: "pinned"` e `kind: "timeline"`; ao receber os task targets unificados, a homepage do mobile
separa primeiro a seção de fixados por `pinned === true` e depois entrega as tarefas não fixadas às
listas normais por workspace/timeline. As tarefas fixadas não aparecem mais duplicadas em workspace
cards comuns nem na lista de timeline, mas a validação de task ativa e o estado selecionado precisam
casar simultaneamente com a seção pinned e com o agrupamento comum. Desde 2026-09-24 o status não
afeta mais a atribuição de seção.

A homepage tem sua própria área de rolagem e não pode depender do container de rolagem da sidebar do
desktop. O snapshot de workspaces (primeira carga, refresh ao voltar para a home, push de
`onWorkspaceListUpdated`) é mantido de forma unificada pelo `WebRemoteControlMobileShell` através do
`useWebRemoteControlWorkspaceList`; a homepage e a barra superior da página de chat leem a mesma
projeção. Ele é apenas o cache de exibição do snapshot do desktop, não cria uma nova entrada de
consulta e não faz polling.

### Limite de rolagem da lista de tasks do workspace

Depois que a homepage do celular muda para a visão “工作区”, cada grupo expandido mostra a altura
completa de, no máximo, as cinco primeiras tasks; quando passa de cinco, a lista de tasks rola
verticalmente dentro do grupo, preservando todas as tasks e o comportamento de clique já existente.
Dentro de cinco, a exibição segue a altura do conteúdo, sem reservar linhas vazias. O título do
grupo fica fora da área de rolagem da lista, e a contagem continua representando todas as tasks do
grupo.

A altura é calculada com as cinco primeiras linhas de task reais e é atualizada conforme mudam o
tamanho da fonte da interface, a linha de execução de workflow e conteúdos semelhantes, sem cortar a
quinta linha. Cada workspace rola de forma independente, e a homepage ainda pode rolar até os
outros grupos. A visão “最近”, a área global de fixados, a tela larga e as listas do desktop mantêm
a exibição já existente. Essa limitação é apenas de layout de UI e não altera o snapshot, a
ordenação, o owner das tasks nem as cadeias continuous/replayable.

Aceitação MH05: cobre 0, menos de cinco, exatamente cinco e mais de cinco; depois de ultrapassar, é
possível rolar até a última linha, e os outros grupos e os títulos não rolam junto com o grupo
interno; a limitação continua correta depois de expandir/recolher, adicionar/remover tasks, mudar o
tamanho da fonte e mudar a altura da linha de workflow. Validado em Zai Light / Zai Dark do celular,
em chinês e inglês, mantendo a regressão de tela larga. O caso de navegador reaproveita
`remote-device-switch.mjs`, e as asserções de rolagem ficam em
`remote-mobile-workspace-scroll.helpers.mjs`, ainda como validação pending de relay controlado.

### Propriedade e aceitação da ordem de exibição da homepage do celular

```text
桌面任务 owner → 既有 replayable 快照 → Shell 的唯一快照投影
                                         ├→ 任务行/工作区计数：读取最新事实
                                         └→ 首页本次停留的展示顺序（仅身份 key、日期桶）
自动推送 → 保留已有归属/顺序 + 首部插入新增项 + 移除不可见项
成功刷新 / 切换视图或排序 / 重新进入 → 按最新快照重建展示顺序
离开首页 → 丢弃本次展示顺序；不持久化、不增加 accepted queue
```

A identidade usa `workspaceIdentity?.trim() || workspacePath` mais o `taskId`; tasks diferentes com o
mesmo taskId e workspaces diferentes não podem compartilhar a mesma posição. O refresh bem-sucedido
publica o snapshot de forma atômica; um refresh expirado não pode sobrescrever um push que chegou
entre ele e a publicação, e um refresh que falha não pode disparar reordenação. Essa memória de
exibição pertence apenas à UI do celular e não altera os fatos de task do continuous do desktop, do
replayable do celular nem os limites de recuperação.

Cenários de aceitação:

- MH01: execução → aguardando aprovação → retomada → conclusão/erro/fim do trabalho em segundo plano:
  o conteúdo da linha e a contagem dos títulos são atualizados, e o workspace/bucket de data e a
  ordem relativa das linhas já existentes não mudam.
- Task de ontem atualizada para hoje, push recebido à meia-noite: a permanência não troca de bucket
  de data; depois de um refresh bem-sucedido, a ordenação passa a usar a data e os campos de tempo
  atuais.
- MH02: task nova entra na primeira posição do grupo; fixar/desafixar migra na hora e sem duplicar;
  arquivar/apagar/workspace sumindo do snapshot remove na hora.
- MH03: com o workspace recolhido, mostram-se as contagens de tasks em execução e a processar, sem
  contar os fixados globais e sem contar os múltiplos interacting de uma mesma task como várias
  tasks.
- MH04: refresh manual bem-sucedido reordena, o que falha preserva, e um push mais novo durante o
  refresh não é sobrescrito por uma requisição antiga; voltar para a home e trocar ordenação/visão
  usam a nova ordem.
- Tema claro e escuro, chinês e inglês, título legível sob nome de workspace longo e sem transbordo
  horizontal; tela larga e desktop continuam usando a semântica de ordenação existente.

### Página de chat

A página de chat reutiliza o conteúdo principal existente do workspace:

1. Barra superior: à esquerda o “‹” de volta à homepage; no centro o título da task atual (“新任务”
   quando é rascunho) e o nome do workspace, com o subtítulo substituído por um spinner e
   “正在自动重连...” quando o transport está reconectando; à direita o menu de tema.
2. O botão de voltar carrega um contador numérico na cor de aviso: conta as tasks com `attention`
   além da task atual, e não é exibido quando a contagem é 0; o nome acessível inclui essa contagem.
3. O título da aba do browser recebe o prefixo “(n) ” quando há tasks aguardando confirmação (a
   homepage conta todas, a página de chat não conta a task atual), e o título original é restaurado
   ao sair da página de controle remoto.
4. Abaixo da barra superior continuam sendo renderizados o chat header simplificado para mobile e o
   V4 chat content injetado pelo Root (finalmente hospedado por
   `packages/ui/src/v4/SessionPane.tsx`, que carrega a sessão).
5. As regras de exibição móvel de terminal, browser e side pane seguem a estratégia de controle
   remoto existente; desta vez elas não são estendidas, e a área de conteúdo do chat não muda.

### Limite das camadas flutuantes de interação na página de chat

A página de chat do controle remoto no celular reutiliza os componentes de sessão do desktop e
mantém a mesma hierarquia de camadas e as mesmas formas de interação do desktop; o celular apenas
estreita as dimensões das camadas, evitando introduzir outro comportamento de seleção de modelo só
por causa da viewport estreita.
Em `web-remote-replayable` e em uma viewport de celular com ponteiro grosso, as camadas flutuantes de
interação precisam satisfazer:

1. Depois de abertas, o conteúdo interativo fica inteiro dentro da viewport visível atual e não pode
   ser cortado nas laterais pela raiz da página.
2. A seleção de modelo continua usando o menu primário de provider e o menu secundário de model,
   iguais aos do desktop; no celular o menu secundário de model tem uma largura máxima menor e encolhe
   automaticamente até a borda da viewport conforme o available width do Radix na direção atual; ao
   encolher, o limite de largura mínima do menu compartilhado é cancelado e nomes longos de modelo são
   truncados dentro do item do menu, sem transformar o conteúdo primário e secundário em uma única
   lista longa de coluna única.
3. A seleção de branch e a pré-visualização de colapso de Todo dentro do painel de status à direita
   abrem preferencialmente na vertical, com o Radix alternando entre cima/baixo; é proibido fixá-los
   no lado esquerdo do painel de status.
4. A largura de uma única camada flutuante não pode ultrapassar `calc(100vw - 2rem)`; nomes longos de
   modelo, nomes de branch e textos em chinês/inglês são truncados dentro da camada ou absorvidos por
   rolagem, e a própria página não pode gerar rolagem horizontal.

Limite de apresentação atual e depois da correção:

```text
当前（手机）
provider root menu -> desktop-width model submenu -> viewport clip
status panel row    -> forced left popover             -> viewport clip

修复后（手机）
provider root menu -> narrow model submenu（保持二级交互）
                   -> min(desired width, Radix available width) -> viewport edge
status panel row    -> bottom/top popover                       -> viewport collision handling

桌面 / 宽屏 Web
provider root menu -> desktop-width model submenu（保持现状）
status panel row    -> left popover（保持现状）
```

Esse limite pertence apenas à apresentação do renderer; não altera a navegação do shell do mobile,
a projeção de task/session, o `CommandInbox`, owner/lease, o relay nem a semântica de entrega
`desktop-continuous` / `web-remote-replayable`.

## Estado inicial de leitura do QR code

No caminho atual, o desktop main retorna o workspace/task do momento da leitura do QR code por
`initialViewState`.

Novo comportamento:

1. O bootstrap continua escolhendo `mobileViewState -> initialViewState -> primeiro workspace`.
2. O web continua abrindo o workspace bridge correspondente, garantindo que o Root/App atual tenha um
   serviço de workspace disponível.
3. A página inicial do mobile shell é sempre `home`.
4. A homepage expande o workspace card correspondente conforme `activeWorkspaceKey`.
5. A homepage marca a linha da task correspondente como selecionada conforme `activeTaskId`.
6. Não entra automaticamente na página de chat.

Nesta etapa, `initialTaskId` expressa apenas o «estado selecionado da homepage»; ele não pode
disparar `onNavigateToChat` nem reutilizar o fluxo de abertura por clique numa task.

Assim, depois de ler o QR code, o usuário vê primeiro uma visão geral de todos os workspaces/tasks do
dispositivo atual e ainda sabe claramente em qual workspace estava a task correspondente quando o
desktop gerou o QR code.

## Fluxo de clique numa tarefa

A lógica de abertura de tarefa é extraída do `WebRemoteControlTaskIndex` existente e forma um hook
compartilhado:

```text
useWebRemoteControlTaskOpen
  input:
    switcher
    activeWorkspacePath
    activeWorkspaceIdentity
    activeTaskId
    onSelectTask
    onNavigateToChat
    onSwitchingChange

  output:
    openTask(task)
    switchingTaskKey
    error
```

Entrar na página de chat depois de trocar de workspace exige uma intenção de navegação de uso único,
que não pode ser deduzida a partir de `initialTaskId`:

```ts
type WebRemoteControlMobileNavigationIntent = "chat";

interface WebRemoteControlWorkspaceSwitchOptions {
  taskId?: string;
  mobileNavigationIntent?: WebRemoteControlMobileNavigationIntent;
  markTaskReadExpectedUnreadAt?: number;
}

interface WebRemoteControlMobileShellProps {
  initialNavigationIntent?: WebRemoteControlMobileNavigationIntent;
}
```

Regras:

1. O segundo parâmetro de `WebRemoteControlWorkspaceSwitcherApi.switchWorkspace()` é estendido para
   `WebRemoteControlWorkspaceSwitchOptions`; as chamadas antigas que não passam
   `mobileNavigationIntent` mantêm o comportamento.
2. A entrada web armazena o `mobileNavigationIntent` como pending intent em memória antes de chamar
   `openWorkspaceBridge()`.
3. Quando o novo bridge renderiza o Root/MobileShell, o pending intent é passado como
   `initialNavigationIntent` e consumido e limpo após o primeiro mount do MobileShell.
4. O pending intent não é escrito na URL nem no `mobileViewState`, e não é repassado ao desktop main;
   ele existe apenas para resolver o ponto de chegada da página no browser atual após um remount do
   Root entre workspaces.
5. O `initialTaskId` inicial da leitura do QR code não define pending intent, portanto apenas expande
   o card da homepage e seleciona a linha da task.

Task do mesmo workspace:

1. Calcula `taskWorkspaceKey`.
2. Verifica se é igual ao `activeWorkspaceKey` atual.
3. Se a task do snapshot da homepage tiver `unreadAt`, chama explicitamente
   `setTaskUnread(..., false)` via `switcher.markTaskRead(task)` do bridge Web remoto atual; essa
   ação não pode depender de o task query cache interno do Root do celular já estar hidratado.
4. Chama `onSelectTask(task.workspacePath, task.taskId, task.workspaceIdentity)`.
5. Chama `switcher.updateMobileViewState(taskWorkspaceKey, task.taskId)`.
6. Troca o mobile shell para a página `chat`.

Task de outro workspace:

1. Define o estado de switching.
2. Chama `switcher.switchWorkspace(taskWorkspaceKey, { taskId: task.taskId,
   mobileNavigationIntent: "chat", markTaskReadExpectedUnreadAt: task.unreadAt })`.
3. Depois que o lado web conecta o shared-host bridge do workspace de destino, usa o
   `workspacePath/workspaceIdentity` do bridge de destino e o `unreadAt` do snapshot da homepage para
   chamar `setTaskUnread(..., false, expectedUnreadAt)`; uma falha apenas registra log e não pode
   impedir a abertura da tarefa.
4. Depois que o novo bridge finishes de renderizar, o Root recebe `initialTaskId` e seleciona a
   tarefa.
5. O MobileShell consome a intenção de navegação de uso único trazida por este fluxo de clique e entra
   na página `chat`.
6. Em caso de falha, registra `logger.error` e permanece na homepage exibindo o erro.

Limites de identidade e de falha na abertura de uma task remota já existente (2026-10-13):

- O adaptador de projetos remotos do Host precisa, antes de `resolveSessionDirectories` retornar,
  registrar e completar o `workspaceIdentity` para o **cwd real retornado**, usando o mesmo resolver
  de `readTree` e `prepareSession`. Ele não copia diretamente a identidade da requisição e não muda o
  cwd, a pertença ao projeto nem os diretórios anexos; uma resolução que falha é recusada como veio.
- `project-workspace-navigation` mantém as validações de task, diretório, identidade de dispositivo e
  troca de membro. Quando o diretório ou a identidade não batem, a recusa continua valendo, sem criar
  um scope local novo e sem relaxar para comparar apenas o caminho.
- Ao clicar em uma task de outro workspace, apenas o estado de espera é definido. O Root antigo não
  entra antecipadamente na página de chat; depois que o bridge de destino tem sucesso, a navegação é
  concluída pela intenção única `chat` do novo Root. Em caso de falha, a homepage e a task ativa
  original são preservadas, e o alvo que falhou não é registrado como o workspace/task da UI atual;
  é possível clicar de novo para tentar de novo, sem retry automático e sem trocar para uma task
  local.
- A falha estruturada do bridge `{ reason, message }` deve exibir `message`, preservando o `reason`
  original para o 판단 de recuperação de transporte. Não é permitido exibir o erro por
  `String(object)` nem reescrever o tipo do erro de transporte para quebrar o contrato de recuperação.
  Tasks do mesmo workspace continuam sendo selecionadas diretamente e entrando na página de chat.

```text
手机列表点击 → 等待 bridge → Host 恢复已有任务目录 → 适配器登记远程身份
                                               → 导航校验 → shared-host attachment
                   ├─ 成功 → 新 Root 消费 chat 意图 → 目标远程任务
                   └─ 失败 → 退出等待、显示 message → 保留列表和原任务
```

A regressão `MRO01` cobre a abertura bem-sucedida de uma task remota já existente, a recusa por
diretório/identidade divergentes, a falha estruturada, a nova tentativa após a falha e a abertura no
mesmo workspace. A camada de serviço usa o armazenamento real de projetos e o adaptador de
identidade; o candidato de interação do celular está em
`packages/web/test/e2e/manual-review/pending/remote-task-open.mjs`, e controla o sucesso/falha do
bridge pela entrada Web real e pelo protocolo de quadros RPC, cobrindo temas claro/escuro e
chinês/inglês. Esse candidato não representa validação em SSH real, em aparelho real ou em
implantação em produção.

Validação de 2026-10-13: as 4 combinações de tema/idioma no Chrome local a 390px passaram; primeiro
abre-se o histórico local e então se verificam a espera/falha do bridge remoto mantendo a lista, a
mensagem exibida, o corpo e a identidade remotos após o retry bem-sucedido, e a abertura no mesmo
workspace sem criar bridge. O snapshot de histórico controlado entra na página pelo V4 schema e por
eventos RPC reais, sem nenhuma requisição de modelo; as capturas e os registros de comunicação estão
em `.tmp/remote-task-open-e2e/`. O caso permanece pending.

Atenção: a task inicial do QR code afeta apenas o estado selecionado da homepage e não chama este
fluxo de clique.

### Limite de limpeza de não lida após abrir uma tarefa no celular

O ponto azul da homepage de tarefas do celular vem do snapshot `WebRemoteControlTaskTarget.unreadAt`
empurrado pelo desktop renderer; o task query cache dentro do Root do celular é outro plano de dados
que hidrata de forma assíncrona conforme o bridge atual. Ao clicar numa tarefa, não se pode usar
novamente «o query cache tem `unreadAt`» como condição para limpar a não lida, porque assim a mesma
task já ativa, um cache frio ou um remount entre Roots pulariam a persistência.

```text
mobile home snapshot task.unreadAt
  │
  ├─ same workspace -> current bridge markTaskRead(expectedUnreadAt)
  │                     -> tasks-index compare-and-clear
  │
  └─ cross workspace -> switch option markTaskReadExpectedUnreadAt
                         -> target bridge connected
                         -> target service compare-and-clears tasks-index unreadAt

desktop task selection -> existing query-cache optimistic clear（保持不变）
```

Restrições:

1. A escrita só é iniciada quando o clique veio da homepage do celular e o snapshot traz claramente
   `unreadAt`; uma task já lida não gera uma mutation sem sentido.
2. No mesmo workspace usa-se o service do bridge atual; em outro workspace é preciso esperar o bridge de
   destino ser estabelecido e usar o service de destino. É proibido que main/relay mantenha ou modifique
   o estado de negócio das tasks.
3. Os parâmetros de destino precisam atravessar `workspaceIdentity`; a semântica de execução por
   caminho continua usando `workspacePath`.
4. Falhar ao marcar como lida não pode impedir a navegação. Ao voltar à homepage, o snapshot
   autoritativo do tasks-index decide se o ponto azul reaparece.
5. O `useWorkspaceTaskNavigation`, o overlay de query cache, a ordenação e a lógica de `lastActivityAt`
   do `desktop-continuous` do desktop não mudam; esta ação existe apenas no switcher de controle
   remoto Web do celular.
6. A leitura do celular confirma apenas a notificação correspondente ao snapshot atual da homepage: o
   repository precisa comparar o `unreadAt` atual com o `expectedUnreadAt` dentro da mesma fronteira
   de escrita atômica. Se forem iguais, limpa; se não forem, devolve o meta atual sem emitir evento de
   mudança, proibindo que um clique antigo e atrasado sobrescreva a não lida de conclusão ou de erro
   gerada depois.

## Divisão de componentes

Sugere-se adicionar ou ajustar os seguintes arquivos de UI:

1. `packages/ui/src/WebRemoteControlMobileShell.tsx`
   - shell de duas páginas do controle remoto do celular.
   - gerencia o estado de página `home/chat`.
   - gerencia o retorno à homepage.
   - consome o `mobileNavigationIntent` de uso único trazido pelo clique entre workspaces.
   - mantém o overlay de switching.
2. `packages/ui/src/WebRemoteControlMobileTaskHome.tsx`
   - renderiza a homepage.
   - carrega o snapshot de workspaces/tasks.
   - gerencia o estado de expansão dos workspace cards.
   - inicializa expansão e seleção conforme o workspace/task ativos.
3. `packages/ui/src/hooks/useWebRemoteControlTaskOpen.ts`
   - extrai a lógica de abertura de task do `WebRemoteControlTaskIndex` existente.
   - é reaproveitado pela homepage do mobile e pelo antigo task index.
4. `packages/ui/src/lib/webRemoteControlTaskIndex.ts`
   - preserva e estende o cálculo de agrupamento, ordenação e chaves de expansão padrão.
5. `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
   - renderiza `WebRemoteControlMobileShell` no breakpoint de controle remoto do celular.
   - remove a dependência do controle remoto do celular em relação ao arraste de altura da sidebar
     superior.
   - o layout de controle remoto do desktop permanece como está.

## Complementos no modelo de dados

O `WebRemoteControlTaskTarget` atual já contém os campos básicos necessários à homepage:

1. `taskId`
2. `title`
3. `workspacePath`
4. `workspaceIdentity`
5. `remoteSessionId`
6. `workspaceLabel`
7. `workspaceKind`
8. `createdAt`
9. `updatedAt`
10. `provider`
11. `unreadAt`
12. `pinned`

Campos de exibição derivados na homepage:

1. A área de dispositivo no topo não adiciona, na primeira versão, um campo de protocolo `deviceLabel`
   e mostra apenas o estado da conexão de controle remoto atual. Se depois for necessário exibir o nome
   real do dispositivo, é preciso estender explicitamente
   `WebRemoteControlWindowBootstrapResult` / `WebRemoteControlWorkspaceListResult` com um
   `deviceLabel` opcional e fornecer o texto de status da conexão como fallback.
2. O horário de atualização mais recente do workspace card não adiciona um campo de protocolo
   `workspaceUpdatedAt`: a homepage do mobile o deriva agrupando por workspace e tomando o maior
   `updatedAt` do grupo. Um workspace sem tasks não exibe horário de atualização.

Para suportar o pill de status da captura de tela, sugere-se acrescentar um campo de exibição
opcional:

```ts
displayStatus?: "idle" | "running" | "completed" | "error";
// 2026-09-09 追记：会话是否挂着后台工作（动态工作流 run / 后台 bash / 分离子代理）。
// 只参与列表运行层排序，不影响 displayStatus；来源是 sessions-index sidecar 的 hasBackgroundWork。
hasBackgroundWork?: boolean;
// 2026-09-14 追记：工作流运行摘要（≤ 4 条 run：在跑优先，其后最近结束的），来源是 sidecar 的 workflowActivity。
// 手机行在标题下绘制 Workflow 图标 + 迷你轨道灯 + 当前 phase 名（24px，13px 文字）；只绘制，不参与排序或状态 pill。
workflowActivity?: SessionWorkflowActivity;
// 2026-09-23 追记：会话挂着的待确认交互（权限审批 / 用户提问），见下文「需要处理信号」。
attention?: { kind: "permission" | "userInput"; count: number };
```

A origem dos campos é stratified por nível de autoridade; não se pode tratar vários caches como
fatos de mesmo nível:

1. Quando a linha da task traz o activity sidecar do sessions-index, o `phase` em tempo real é a
   única autoridade para o estado exibido:
   - `prewarming` / `running` → `running`
   - `completedSuccess` / `completedInterrupted` → `completed`
   - `error` → `error`
   - `draft` não gera linha de task persistente; se dados compatíveis trouxerem `draft` por
     engano, ele não é tratado como estado terminal e segue para o próximo nível de fallback
2. Sem activity do sessions-index, só então lê-se o task runtime cache do renderer atual:
   - status live como `creating` / `queued` / `streaming` / `waiting_permission` /
     `waiting_user_input` → `running`
   - `failed` → `error`
   - `completed` → `completed`
3. Sem um estado explícito também no runtime cache, só então lê-se o estado terminal persistido do
   tasks-index:
   - `completed` → `completed`
   - `error` → `error`
4. Um `status=running` persistido isolado indica apenas que um processo antigo pode não ter finalizado
   corretamente e não prova que o host atual ainda esteja em execução; o fallback é `idle`.

Essa precedência precisa cobrir todas as direções de conflito, e não apenas corrigir `running`:

| sessions-index activity                     | runtime antigo / cache persistente            | exibição no celular                             |
| ------------------------------------------- | -------------------------------- | ------------------------------------ |
| `prewarming` / `running`                    | `completed` / `failed` / `error` | `running`                            |
| `completedSuccess` / `completedInterrupted` | live / `failed` / `running`      | `completed`                          |
| `error`                                     | live / `completed` / `running`   | `error`                              |
| ausente ou compatível com `draft`            | qualquer                         | mantém o runtime existente → fallback de estado terminal persistido |

Assim, um novo frame do sessions-index tanto consegue promover um cache antigo `completed/error` para
`running` quanto consegue encerrar um cache live antigo como `completed/error`. A homepage do celular
não combina essas origens por conta própria.

Limites de agregação:

1. `displayStatus` é calculado pelo desktop renderer ao construir o snapshot
   `WebRemoteControlTaskTarget`; `buildWebRemoteControlTaskTargets()` lê primeiro o activity do
   sessions-index carregado pela linha da task e só então faz fallback, na ordem acima, para o task
   runtime state do Zustand e para `ZCodeTaskMeta.status`.
2. A homepage do mobile consome apenas `WebRemoteControlTaskTarget.displayStatus` e não pode ler
   diretamente o runtime do ZCode, o Repo, o Service ou a implementação de persistência.
3. A cadeia de sincronização continua sendo renderer `syncWebRemoteControlTasks()` -> desktop main ->
   relay -> mobile bootstrap/listWorkspaces, sem nova entrada de consulta de estado no lado do mobile.
4. Tanto mudanças no activity do sessions-index quanto no task runtime state compatível precisam
   disparar a reconstrução e a sincronização do snapshot de tarefas, evitando que o pill de
   `running` / `completed` / `error` fique atrasado até a próxima atualização da lista de tasks.
5. Esse campo é usado apenas para exibição na homepage do celular e não altera a origem real do
   estado no runtime do ZCode. Quando os dados antigos não têm o campo, o frontend do mobile faz
   fallback para `idle`.

### Sinal de item a processar (attention)

A seção “需要处理” da homepage do celular recebe apenas as tasks com interações aguardando
confirmação (aprovação de permissão ou pergunta do usuário); um erro não é um item a processar e
continua sendo expresso por `displayStatus = error`. Esse sinal é uma dimensão independente do
phase: enquanto se aguarda uma confirmação, o phase normalmente continua `running`, por isso a
enumeração de `displayStatus` não é estendida e o sinal é carregado separadamente em `attention`.

1. Origem: o `pendingInteractions` do activity sidecar do sessions-index (`permissionCount` /
   `userInputCount`), normalizado pelo desktop renderer em `buildWebRemoteControlTaskTargets()`
   reutilizando o `getTaskListAttention()` da sidebar do desktop: `count = permissionCount +
   userInputCount`; quando há pergunta do usuário, `kind = "userInput"`, caso contrário `"permission"`.
   Com `count = 0` ou sem activity, o campo não é carregado.
2. Schema: `count` é um inteiro positivo, e `kind` só permite `permission | userInput`; a página do
   celular é implantada na mesma versão do desktop, e não se mantém um ramo de compatibilidade extra
   para versões antigas.
3. Owner: o fato das interações aguardando confirmação continua pertencendo ao session runtime /
   sessions-index; o desktop main, o relay e o celular apenas repassam e exibem, sem alterar por
   causa disso o estado da task ou da session. O celular não lê o runtime nem o Repo para inferir por
   conta própria.
4. O celular separa a seção “需要处理” conforme a presença de `attention`; o texto reaproveita a
   semântica de “等待确认” do desktop, e a contagem é exibida como “{count} 项待确认”.

```text
sessions-index pendingInteractions ─> getTaskListAttention ─> WebRemoteControlTaskTarget.attention
                                                                   └─> main 快照签名 ─> relay ─> 手机“需要处理”
```

### Limite de deduplicação do push do snapshot da homepage

O desktop main faz apenas deduplicação de transporte sobre o `WebRemoteControlWorkspaceListResult`
já construído pelo renderer; ele não possui nem reinterpreta o estado de negócio das tasks. A
assinatura de deduplicação precisa cobrir os campos que a homepage do celular precisa adotar
imediatamente, mas que só mudam em pontos do ciclo de vida ou em ações do usuário:

1. task: `title`, `unreadAt`, `displayStatus`, `attention`, `pinned`, `archived`, `remoteSessionId`;
2. estado de conexão do workspace: `kind`, `connectionState`, `remoteSessionId`,
   `lastConnectionError`;
3. os campos de identidade estáveis de task/workspace continuam participando da assinatura, garantindo
   que adições, remoções e mudanças de pertencimento entre workspaces fiquem visíveis.

Os campos são normalizados conforme a semântica de exibição do celular: `displayStatus` ausente
equivale a `idle`, `connectionState` ausente equivale a `connected`, string opcional ausente equivale
a string vazia e pertencimento booleano ausente equivale a `false`. Qualquer mudança em um desses
valores válidos precisa enviar um novo `workspace-list-updated`.

O `updatedAt` vem do `lastActivityAt` do sessions-index e muda com alta frequência durante texto em
streaming e eventos de ferramentas. Esta rodada não o inclui na assinatura de push imediato; se for
necessário atualizar o tempo relativo e a ordenação por tempo em tempo real, uma estratégia de
throttle/agregação precisa ser desenhada à parte, para que cada evento de streaming não empurre a
snapshot inteira da homepage de tarefas.

```text
低频展示/连接字段变化 ──> main 快照签名变化 ──> workspace-list-updated ──> 手机立即采用
高频 updatedAt 变化 ────> 本轮不触发整表即时推送（保留后续节流/合并边界）
```

### Limite de impacto da projeção de status

Esta correção pertence a presentation / state-source precedence e não altera o command de sessão, o
runtime, a persistência nem o protocolo de recuperação.

```text
sessions-index phase (实时 activity) ───────────────┐
                                                     ├─> desktop renderer target projection
renderer runtime cache (仅 activity 缺失时 fallback) ┤       └─> relay payload ─> 手机状态 pill
tasks-index terminal status (最后 fallback) ─────────┘

desktop task list ── sessions-index continuous projection（保持原链路）
mobile /remote ───── renderer task snapshot + replayable delivery（只修正 payload 字段）
```

É preciso manter:

1. relay, desktop main e shared-host attachment continuam apenas repassando e não possuem estado de
   negócio de task/session.
2. As semânticas de snapshot/gap, owner e queue do `desktop-continuous` do desktop e do
   `web-remote-replayable` do celular não mudam.
3. O tasks-index continua sendo dono das rows persistentes e do pertencimento; o activity do
   sessions-index é dono apenas do phase em tempo real.
4. `workspaceIdentity?.trim() || workspacePath`, o `remoteSessionId` e o pertencimento
   pinned/archived não são afetados pela combinação de estados.
5. A ordenação running-first do celular continua consumindo o `displayStatus` final, de modo que um
   cache obsoleto não coloca mais uma linha terminal no topo nem rebaixa uma linha realmente em
   execução para a ordenação temporal comum.

A regressão focada cobre todas as combinações de phase e cache conflitante; esta rodada não adiciona
E2E de conversa, porque não há nova interação, comando ou comportamento de entrega, e o NDJSON de
runtime já provou que o sessions-index publica o phase correto continuamente na janela do defeito,
que estava na projeção de targets puramente do renderer.

Para suportar a seção pinned, `WebRemoteControlTaskTarget` ganha um campo opcional:

```ts
pinned?: boolean;
```

Origem do campo:

1. O desktop renderer lê as tarefas no `Root` separadamente através de `useGlobalTaskList({ kind: "pinned" })`
   e `useGlobalTaskList({ kind: "timeline" })`.
2. `buildWebRemoteControlTaskTargets()` marca `pinned: true` no resultado da consulta de pinned e não
   marca o resultado da consulta de timeline.
3. A homepage do mobile consome apenas esse campo de exibição para fazer a divisão; ela não lê
   diretamente o task repo, o sqlite, o service do ZCode nem o runtime.
4. O evento incremental `workspace_task_list_changed`, que carrega mudanças de metadados da task meta
   como título, horário e status, não indica mudança de pertencimento pinned/archived. A atualização
   do cache no frontend precisa preservar a lista existente, evitando que uma atualização de status
   tire uma tarefa fixada da seção pinned.

## Estado e roteamento

A primeira versão não precisa introduzir roteamento real por URL; pode usar React state dentro do
shell do mobile:

```text
currentMobilePage: "home" | "chat"
```

Entrar no chat:

1. O usuário clica numa task.
2. A seleção da task tem sucesso.
3. Define-se `currentMobilePage = "chat"`.
4. Se o history state atual não for `{ zcodeMobilePage: "chat" }`, adiciona-se uma camada de chat
   history state.

Voltar à homepage:

1. Clica-se no botão de retorno do header.
2. Se o history state atual for `{ zcodeMobilePage: "chat" }`, chama-se `history.back()`, e o
   `popstate` volta para home.
3. Se não houver chat history state, define-se diretamente `currentMobilePage = "home"` como
   fallback.
4. Preserva-se o estado selecionado da task ativa.

Botão de voltar do navegador:

1. Quando o mobile shell entra inicialmente em `home`, nenhum history é escrito, preservando a pilha
   de histórico original do ponto de entrada do QR code.
2. Só quando o usuário clica numa task em `home` e entra com sucesso em `chat` chama-se uma vez
   `history.pushState({ zcodeMobilePage: "chat" }, "")`.
3. Se o estado atual já for esse state de `chat`, não se faz push de novo, evitando que cliques
   repetidos na mesma task empilhem histórico.
4. Quando o `popstate` atinge `{ zcodeMobilePage: "chat" }`, define-se
   `currentMobilePage = "chat"`; ao clicar no botão de voltar a partir do chat, usa-se
   `history.back()` para voltar a home, em vez de alterar o state diretamente.
5. Quando o `popstate` volta a um state diferente de `zcodeMobilePage`, define-se
   `currentMobilePage = "home"` e o comportamento padrão de retorno do navegador é liberado.
6. Quando o clique numa task de outro workspace tem sucesso e o Root é remontado, ainda se adiciona
   uma camada de state `chat` conforme a regra «o usuário clicou e entrou no chat»; essa camada vem do
   `mobileNavigationIntent` de uso único do fluxo de clique, e o `initialTaskId` inicial do QR code não
   adiciona essa camada.
7. Quando o mobile shell é desmontado, remove-se o listener de `popstate`.

Não se deve colocar o estado de workspace/task na URL, evitando acoplá-lo ao ponto de entrada do QR
code e ao estado de pareamento.

## Regras de estilo

A UI precisa seguir o `DESIGN.md` da raiz:

1. Usar tokens semânticos, por exemplo `bg-background`, `bg-card`, `border-card-border`,
   `text-foreground-subtle`.
2. O container da lista agrupada usa `rounded-xl`, e os controles internos seguem a hierarquia de
   raio de canto do DESIGN.md; a camada inferior reutiliza `BottomSheet`, e o shell usa
   `bg-popover border-popover-border rounded-t-2xl` do diálogo.
3. A homepage é uma interface de ferramenta de negócio: mantê-la compacta, clara e legível, sem cara de
   página de marketing.
4. Suportar light, dark, Zai light e Zai dark.
5. Suportar o comprimento dos textos em chinês e inglês, sem depender de frases curtas fixas em
   inglês.
6. Botões usam o componente `Button` existente e ícones lucide.
7. A rolagem da homepage, a altura dos cards e a altura das linhas de task precisam ser estáveis, e
   expandir/recolher não pode causar transbordo horizontal descontrolado.

## Logs

Quando houver problemas de interação, é preciso registrar logs para ajudar a localizar, sem adivinhar o
estado.

A camada de UI usa uniformemente:

```ts
import { logger } from "@/logger.js";
```

Pontos de log sugeridos:

1. Falha ao carregar o snapshot de workspaces/tasks da homepage: `error`.
2. Falha ao atualizar o mobile view state após clicar numa task do mesmo workspace: `error`.
3. Início da troca ao clicar numa task de outro workspace: `info`.
4. Falha na troca ao clicar numa task de outro workspace: `error`.
5. Estado inicial do QR code sem correspondência de workspace/task: `warn`.

Renderizações de alta frequência e hovers comuns não geram log.

## Implementação e testes de regressão

É preciso executar:

```bash
pnpm typecheck
pnpm lint
```

Entradas de teste atuais:

1. `packages/ui/test/webRemoteControlMobileTaskHome.test.ts`
   - workspaces agrupados na ordem retornada pelo desktop.
   - expansão padrão do `activeWorkspaceKey`.
   - a task correspondente ao `activeTaskId` aparece como selected.
   - a prioridade de atribuição entre “需要处理” / “运行中” / “已置顶” / lista comum, com cada task
     aparecendo uma única vez.
   - o ícone de status na linha e o “n 项待确认”/“报错” na segunda linha; a visão de workspace omite
     o nome do workspace, e o caminho só aparece em workspaces homônimos.
   - a entrada de dispositivo no cabeçalho, o menu “更多”, o estado vazio e a entrada de nova task.
2. `packages/ui/test/webRemoteControlMobileShell.test.ts`
   - a barra superior da página de chat mostra o título da task atual e o workspace; o contador do
     botão de voltar não conta a task atual.
   - o estado de reconexão passa a fazer parte do cabeçalho/barra superior, e o aviso flutuante não é
     mais renderizado.
3. `packages/ui/test/useWebRemoteControlTaskOpen.test.ts`
   - task do mesmo workspace chama `onSelectTask` e `updateMobileViewState`.
   - task de outro workspace chama `switchWorkspace` com `{ taskId, mobileNavigationIntent: "chat" }`.
   - em caso de falha na troca, o erro é preservado e o estado de switching é limpo.
4. `packages/ui/test/workspaceShellRemoteMobileLayout.test.ts`
   - o breakpoint de controle remoto do celular renderiza o mobile shell.
   - fora do breakpoint de celular, continua renderizando o shell/sidebar existente.
   - a task inicial do QR code apenas expande o card da homepage e seleciona a linha da task, sem
     entrar no chat.
   - quando o usuário clica numa task e entra no chat, apenas uma camada de history state é
     adicionada, e o retorno do browser volta para home.
   - após um clique entre workspaces remontar o Root, o `mobileNavigationIntent` de uso único é
     consumido para entrar no chat e é limpo após o consumo.
5. `packages/shared/test/webRemoteControl.test.ts`
   - se `displayStatus` for novo, acrescentar testes de compatibilidade de schema/tipo.
6. `packages/ui/test/webRemoteControlTaskIndex.test.ts`
   - `buildWebRemoteControlTaskTargets()` calcula `displayStatus` pela prioridade activity do
     sessions-index → task runtime → `ZCodeTaskMeta.status`.
   - cobre os conflitos entre phase live e cache runtime/persistido obsoleto nas três direções
     running, completed e error.
   - quando o activity está ausente ou é o `draft` compatível, o fallback runtime/persistido original
     é mantido, e um `running` persistido ainda não pode fabricar um running falso.
   - `pendingInteractions` é normalizado como `attention` (kind/count); com contagem 0 ou sem activity
     o campo não é carregado, e o `displayStatus` não muda.
7. `packages/desktop/test/webRemoteControlManagerExternalRelay.test.ts`
   - quando apenas `title`, `unreadAt`, `displayStatus`, `attention`, `pinned`, `archived` ou
     `remoteSessionId` mudam na mesma task, é preciso enviar `workspace-list-updated`.
   - quando apenas `connectionState`, `remoteSessionId` ou `lastConnectionError` mudam no mesmo
     workspace, é preciso enviar; um snapshot de campos válidos totalmente idêntico ainda deve ser
     deduplicado.
   - mudar apenas o `updatedAt` de alta frequência não faz parte do contrato de push imediato desta
     rodada.

Validação da reformulação de 2026-09-23: além dos testes unitários acima, foi adicionado
`packages/ui/test/webRemoteControlMobileShellAttention.test.ts` (jsdom), cobrindo o contador do botão
de voltar e o título da aba dirigidos por push, a entrada de dispositivo no cabeçalho e a criação
direta de rascunho com um único workspace. O caso de navegador pending
`packages/web/test/e2e/manual-review/pending/remote-device-switch.mjs` passou a usar, na homepage após
a conexão, um snapshot com amostras de seções; as capturas do mobile bridge/home-only cobrem as
visões “最近” e “工作区” e a camada de seleção de nova task, com 12 configurações aprovadas; uma
resposta de desktop controlada não equivale à validação em aparelho real ou em implantação em produção.

## Ordem histórica de implementação

Sugere-se a seguinte ordem de execução:

1. Extrair `useWebRemoteControlTaskOpen`, mantendo o comportamento do `WebRemoteControlTaskIndex`
   existente inalterado.
2. Adicionar o componente de homepage do mobile, usando primeiro os campos de task target existentes
   para completar os workspace cards e as task rows.
3. Adicionar o mobile shell e integrá-lo no modo de controle remoto em tela pequena.
4. Ajustar o estado inicial do QR code: permanecer por padrão na homepage, expandindo e selecionando
   apenas a task correspondente.
5. Acrescentar o campo `displayStatus` e o pill de status.
6. Remover ou contornar a lógica antiga de arrastar e recolher o topo da sidebar no controle remoto do
   celular.
7. Acrescentar os testes e executar `pnpm typecheck` e `pnpm lint`.
8. Atualizar a descrição atual da UI móvel em
   `docs/web-remote-control/web-remote-control-architecture.md`.

## Riscos

1. Clicar numa task de outro workspace recria o bridge, e o estado do primeiro frame do novo Root
   precisa se articular bem com o estado de página do mobile shell, evitando piscar a homepage antes
   de entrar no chat.
2. O estado inicial do QR code ainda precisa abrir o workspace bridge, porque a página de chat
   depende dos serviços existentes; mas a UI não deve pular automaticamente para o chat.
3. Workspace remoto precisa usar sempre `workspaceIdentity` como key e nunca apenas `workspacePath`.
4. `WorkspaceShellLayout` já tem bastante lógica histórica de layout de controle remoto no celular, e
   é preciso ter cuidado ao integrar o mobile shell para preservar o comportamento de controle
   remoto do desktop.
5. Se uma rota real por URL for adicionada depois, é preciso evitar misturar o `remoteControlToken` de
   curto prazo com o estado interno de página de task.

Validação de estabilidade de posição de 2026-09-24: `webRemoteControlMobileTaskOrder.test.ts`
cobre o bucket de data, o isolamento de identidade, o término de status e a atribuição de tasks;
`useWebRemoteControlMobileTaskOrder.test.ts` cobre refresh bem-sucedido, com falha e concorrente, e
respostas expiradas, e a regressão do Shell cobre a reordenação após o retorno do chat. Os
MH01–MH04 acima são semântica confirmada, e o caso de navegador pending `remote-device-switch.mjs`
reaproveita `remote-mobile-task-order.helpers.mjs`, validando pela entrada Web real e por snapshots
de relay controlados a atualização no lugar, o refresh bem-sucedido e com falha, a task nova na
primeira posição, a migração de fixados, a remoção e a contagem de recolhimento. As combinações de
tema claro/escuro e de chinês/inglês do mobile bridge/home-only e do bridge em tela larga continuam
seguindo o MD07; as capturas estão em `.tmp/remote-device-switch-e2e/`. Não foi promovido, e a
validação por interface controlada não substitui a validação em aparelho real e em ambiente de
produção.
