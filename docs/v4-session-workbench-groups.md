# v4 Session Workbench Groups

Estado: **todas as entradas de criação foram desativadas (2026-10-16)**. Arrastar da lista de Tasks para a borda da
área de conversa e o 「Abrir em tela dividida」 pelo botão direito não criam nem expandem mais um group
(veja `docs/v4-split-pane-workbench.md`); os groups já existentes ainda podem ser restaurados, ter o foco e ter seus
panes fechados. O texto abaixo preserva o design original como contrato de comportamento dos groups existentes.

## Resumo da funcionalidade

| Campo | Valor |
| --- | --- |
| Mudança | Uma sessão à esquerda pode ser arrastada para o workbench v4 do meio, criando um split pelas drop zone acima/abaixo/esquerda/direita do pane de destino; múltiplas sessões formam um workbench group preservável e restaurável (termo do usuário: 「a casinha」). |
| Superfícies visíveis ao usuário | Lista de sessões à esquerda, workbench de chat v4 do meio, workspace header, entrada de branch Git, pane chrome, drag preview. |
| Docs existentes | `docs/v4-split-pane-workbench.md`, `docs/v4-refactor/06-ui.md`, `docs/testing/conversation-session-e2e-coverage-matrix.md`. |
| Owners de código existentes | `packages/ui/src/v4/paneLayoutStore.ts`, `packages/ui/src/v4/paneLayoutTree.ts`, `packages/ui/src/v4/V4WorkspaceChatArea.tsx`, `packages/ui/src/v4/WorkbenchPane.tsx`, componentes relacionados aos itens de task/session da esquerda. |
| Fora de escopo | Web no celular, `/remote` web-remote replayable (deve contornar completamente o ciclo de vida de group), mudanças em agent/protocol/schema, afundamento de estado de negócio em main/relay, sincronização de estado de group entre dispositivos. |

## Semântica de produto

O que o usuário quer não é um 「abrir em split」 pontual, e sim a mentalidade de editor group de uma IDE:

```text
lista de sessões à esquerda
   drag session C
       |
       v
grupo workbench atual do meio
+-------------------+-------------------+
| session A         | session B         |
|  drop zone        |  drop zone        |
|  top/left/right/  |  top/left/right/  |
|  bottom           |  bottom           |
+-------------------+-------------------+
       |
       v
Após o drop bem-sucedido, session C entra neste group e um novo pane é dividido na direção indicada do pane de destino.
```

O group é a 「casinha」 do lado do renderer:

```text
Group G1
+-----------+-----------+
| session A | session B |
+-----------+-----------+

Group G2
+-----------+
| session C |
+-----------+
```

Ao clicar numa sessão à esquerda, consulta-se primeiro `sessionId -> groupId`:

```text
clicar em A -> activeGroupId = G1 -> focar o pane onde está A
clicar em B -> activeGroupId = G1 -> focar o pane onde está B
clicar em C -> activeGroupId = G2/pane único implícito -> focar C
```

Se a sessão não pertencer a nenhum group de múltiplos panes, o comportamento de clique mantém a semântica antiga: uma
vista de pane único é exibida pelo caminho de abertura de sessão original. Se depois ela for arrastada para um group existente,
migra da casinha implícita de pane único original para o group de destino.

## Registro de esclarecimentos

| Rodada | Pergunta | Resposta do usuário | Fronteira fixada | Seguimento necessário |
| --- | --- | --- | --- | --- |
| 1 | A área central de drop deve substituir o pane atual, focar um pane existente, ou não aceitar? | O centro não aceita drop, apenas split em quatro direções. | Existem apenas quatro drop zones (acima/abaixo/esquerda/direita); o centro não exibe estado de drop válido. | não |
| 2 | Há suporte a sessões de workspaces diferentes? | Sim. | O drop usa o próprio `workspacePath/workspaceIdentity/remoteSessionId` da sessão arrastada. | não |
| 3 | E se uma sessão já aberta na view atual for arrastada de novo? | Não deixar arrastar; ou, mesmo arrastando, não disparar a área semitransparente. | Sessão já existente no mesmo group não pode entrar de novo; a origem fica sem drag e o drop target faz guard novamente. | não |
| 4 | A âncora de drop nas quatro direções é o pane de destino ou o workbench inteiro? | É o pane de destino. | Ao dropar numa borda de um pane, o split é relativo a aquele pane. | não |
| 5 | O que significa o limite de 4 panes? | Número total de panes; cheio, não deixa dividir. | Um group tem no máximo 4 panes, podendo combinar horizontalmente, em grade ou aninhado. | não |
| 6 | Qual a forma do drop preview? | Uma área semitransparente demonstrativa. | Usa um preview semitransparente da metade correspondente do pane de destino, e não um estado de substituição central. | não |
| 7 | Qual o escopo de habilitação? | Funciona no desktop e também no Web App comum; não no celular nem no web-remote. | Habilita o V4 em `desktop-continuous` e no Web App comum; desabilita mobile e o `/remote` web-remote replayable. | não |
| 8 | Depois de arrastar uma sessão de outro workspace, header/sidebar acompanham? | Acompanham conforme a sessão ativa muda. | `focusedPaneId` deriva o contexto ativo atual; workspace header, branch e o highlight da esquerda acompanham o pane focado. | não |
| 9 | Qual a semântica de clique na 「casinha」? | A/B estão na mesma casinha; clicar em A/B mostra essa casinha e ativa a sessão correspondente; sessão sem split abre uma nova casinha pela lógica antiga. | Introduz o conceito de group; o clique numa sessão primeiro localiza o group e depois foca o pane. | não |
| 10 | O group é preservado? | Sim. | Ao trocar para outra sessão/group, o layout do group original é preservado e clicar em qualquer membro o restaura. | não |
| 11 | Uma sessão só pode pertencer a um group? | Sim. | `sessionId` pertence a um único group; não pode ser aberta em duplicidade entre groups. | não |
| 12 | Quando o group se dissolve? | Degrada com 1 sessão, é removido com 0. | A identidade especial de group só é mantida com 2+ sessões; depois de fechar/remover, há GC por número de membros. | não |
| 13 | O group é persistido? | Pode ser, já no renderer, por exemplo localStorage. | Persistência local ao renderer; restaurada em refresh/reinício, sem entrar em agent/protocol. | não |
| 14 | Depois de arrastar o C não agrupado para G1, o que acontece com a casinha original? | C entra em G1 e a casinha implícita de sessão única original desaparece. | O move de sessão é a única migração de pertencimento; o group implícito antigo não é preservado. | não |
| 15 | O 「abrir à direita」 inline do subagent substitui a sessão principal? | Não substitui; o detalhe pertence à tab da direita do workspace. | O child não cria mais workbench group/pane; exibe/oculta conforme a sessão pai, com a semântica completa em `subagent-session-side-tabs.md`. | não |
| 16 | O child de subagent aberto ao lado aceita continuar digitando? | Não; é uma view de observação somente leitura. | O child binding gerado pelo split de subagent é marcado `readOnly`, o pane não renderiza composer/input e não oferece nova entrada de prompt. | não |
| 17 | É possível arrastar uma sessão para dividir quando o centro atual está em estado de rascunho? | Sim. | O draft não é sessão e não cria workbench group; após o drop o primary draft é mantido e a sessão arrastada entra em um pane não primário. | não |
| 18 | Ao focar um child de subagent somente leitura, a active task da esquerda é sincronizada? | Não sincroniza. | Um pane readOnly tem apenas focus local do workbench; a active task do shell, o highlight da esquerda e a active otimista da lista de tasks não mudam para a sessão child. | não |
| 19 | Depois de fechar o pane focado atual, qual active task externa fica? | Fica a sessão focada e navegável do workbench após o fechamento. | Fechando o child em 2 panes, volta-se ao primary/main; fechar um pane não focado não altera o shell active. | não |
| 20 | `Cmd/Ctrl+N` cria a nova task de qual lugar dentro do split? | Do workspace do pane focado atual. | O subagent já não entra no workbench; um pane focado comum só usa `workspaceScope` e cria a sessão em rascunho daquele workspace. | não |
| 21 | `Cmd/Ctrl+N` faz split de um novo rascunho dentro do split atual? | Não. | Após criar, sai-se do group workbench ativo e o layout de panes volta a um único painel primário; o group histórico é preservado e clicar num membro o restaura. | não |
| 22 | Depois de excluir a sessão primária do group, o que é exibido? | Volta ao rascunho do workspace atual. | Com a exclusão aceita pelo CLI, o group é dissolvido e a sessão excluída é limpa do shell; o secundário não é promovido implicitamente. | não |
| 23 | Em `/remote`, basta esconder a UI de group? | Não basta. | O renderer remoto não pode restaurar, criar, persistir nem consumir groups; a sidebar e a criação de nova task contornam o group store. | não |
| 24 | Em 2026-07-13, foi desativado todo o split ou só os botões explícitos? | Só os botões explícitos; a lista de Tasks ainda pode ser arrastada para a área de conversa. | O pane chrome não renderiza os botões de split; as drop zones de drag, o estado de group e o isolamento entre workspaces continuam sendo contrato oficial. | não |
| 25 | Depois de arrastar a task B existente ao lado do rascunho A, como o primeiro envio de A deve ser promovido? | A se vincula no lugar à sessão nova criada pelo primeiro envio; após focar B, A continua lá. | No `accepted` do `createSession`, o primary draft é primeiro vinculado como A′ e todo o layout é promovido atomicamente a group, e só então o shell active é sincronizado; focar outro pane depois só muda o contexto ativo e não pode fazer A′ regredir para draft. | não |
| 26 | Ao clicar com o botão direito numa sessão que já está em outro workbench group, é split duplicado ou troca? | Troca. | 「Abrir em split」 procura primeiro um pane/group existente por `workspaceKey + sessionId`; ao atingir outro group, ativa e foca o pane existente, sem criar cópia. | não |
| 27 | Depois de abrir B ao lado do draft primário pelo menu de contexto e clicar normalmente na C não agrupada, deve-se sair do split ou substituir algum pane? | Preservar o split, com C substituindo o B focado, resultando em `[draft A | C]`. | O clique normal numa sessão, no layout temporário de draft, apenas revincula o pane non-primary focado; o primary draft não participa da substituição. | não |

## Decisões de fronteira

| Fronteira | Decisão | Inclui | Exclui / poda | Fonte |
| --- | --- | --- | --- | --- |
| Drop target | Aceita apenas as quatro áreas de borda. | Preview e split das metades top/right/bottom/left. | Substituição no centro, foco no centro, drop em lugar nenhum. | usuário |
| Âncora | Split relativo ao pane sob o mouse. | Inserir um novo pane acima/abaixo/esquerda/direita do pane de destino. | Inserção fixa na camada mais externa do workbench inteiro. | usuário |
| Cross workspace | Suportado. | Local, SSH/WSL/Docker, desde que o session meta tenha o scope completo. | Sobrescrever o scope da sessão arrastada com o workspace atual do shell. | usuário + `docs/v4-split-pane-workbench.md` |
| Sessão duplicada | Uma sessão só pode pertencer a um group. | Quando já está em um group, a origem não pode ser arrastada; o guard de drop não mostra preview. | Múltiplas cópias da mesma sessão em view. | usuário |
| Ciclo de vida do group | 2+ sessões formam group; 1 degrada; 0 é removido. | Clicar em qualquer membro restaura o group. | Preservar group vazio ou group com apenas 1 membro. | usuário |
| Limite de panes | No máximo 4 panes por group. | 4 horizontais, 4 em grade, 4 aninhados são permitidos. | Dividir além de 4. | usuário + `MAX_WORKBENCH_PANES` atual |
| Contexto ativo | O pane focado deriva header/sidebar. | Workspace header, branch e highlight da sidebar acompanham a sessão focada. | Depois do drop mudar só o pane e não o contexto ativo; ou trocar a tab do shell e quebrar o group. | usuário |
| Entrada de split de subagent | Abre o child apenas ao lado do pane atual. | A sessão child entra em um pane lateral; o pane primário continua exibindo a sessão pai; o pane child é uma view de observação somente leitura. | Reutilizar o split open global antigo, que faz o foco no child reverter a sessão ativa do shell para a primária; ou tratar o child como sessão comum exibindo input. | usuário |
| Entrada de drop de draft | O pane de draft também aceita split por drag nas quatro direções. | O primary continua como draft; a sessão arrastada entra em um pane não primário do `paneLayoutStore`; depois o primeiro envio do draft continua se vinculando no lugar. | Proibir preview/drop por causa de `sessionId === null`; ou forçar a criação de group exigindo sessionId no draft. | usuário |
| Camadas do drop preview | O preview semitransparente cobre o pane de destino inteiro. | O preview fica acima do dock/input do composer e do conteúdo do pane. | Ser coberto na parte de baixo pelo `z-20` sticky do composer/input. | usuário |
| Focus de pane vs shell active | Focus em pane readOnly não equivale a shell active task. | Focus/fechamento de pane comum sincroniza o shell active; focus em child readOnly só muda o focus do workbench. | A sessão child aparecer com highlight na lista da esquerda ou como active otimista de task. | usuário |
| Reparo de foco ao fechar | Depois de fechar o pane focado, sincroniza-se a sessão navegável restante. | Fechando o child focado, volta-se ao primary/main; com 3+ panes, sincroniza pelo focus do workbench após o fechamento. | Forçar a troca de active ao fechar um pane não focado. | usuário |
| Atalho de nova task | `Cmd/Ctrl+N` cria um rascunho de painel único no workspace do pane focado. | Menu `NewTask` do desktop, `Cmd/Ctrl+N` do Web comum e o botão do topo reutilizam a entrada de criação no Root; o workspace alvo vem do pane focado do workbench, incluindo child readOnly. | Fazer split de um rascunho dentro do group/paneLayout atual; criar apenas pelo workspace da tab ativa do shell. | usuário |
| Persistência | localStorage local ao renderer. | Layout de group, pane binding, pane focado e mapeamento sessão-para-group. | Persistência em agent/runtime/main/relay, sincronização entre dispositivos. | usuário |
| Modos de cliente | Habilitados no desktop e no Web App comum. | `desktop-continuous`, web v4 comum. | Celular, telas pequenas, `/remote` web-remote replayable. | usuário |
| Botões explícitos de split | Botões de split do pane chrome desativados. | Arrastar uma sessão da lista de Tasks para a borda da área de conversa. | Os botões 「Dividir para a direita / Dividir para baixo」 do pane chrome. | usuário |
| Promoção do primary draft | O layout temporário de draft + sessão existente é promovido atomicamente no primeiro envio do draft. | O novo session binding do primary draft, os bindings secundários e a transferência de root/focus acontecem uma única vez para o group; o shell active é atualizado com a nova sessão. | Atualizar apenas o `activeTaskId` do shell e deixar o primary depender dele; redefinir o primary já enviado como draft após focar o secundário. | usuário |
| Paridade de split pelo menu de contexto | O 「abrir em split」 pelo menu de contexto à esquerda compartilha o owner de pane/group com o drag. | Sessão única cria group; group existente ganha pane; draft usa paneLayout temporário; sessão existente em outro group só troca/foca. | O menu escrever incondicionalmente no paneLayout global; reabrir a mesma sessão em duplicidade; criar uma segunda view quando já há group. | usuário |
| Guard de sessão atual | O item de menu fica desabilitado quando o pane focado atual já exibe a sessão alvo. | Pane único comum, pane focado de group, pane secundário focado do layout temporário de draft. | Julgar apenas pelo `activeTaskId` do shell, perdendo o focus local de group/pane. | usuário |
| Substituição pelo pane draft focado | Clicar normalmente numa sessão não agrupada dentro do layout temporário de draft substitui o binding secundário focado no lugar. | `[draft A | B] --clicar C--> [draft A | C]`, com workspace scope e sessionId trocados juntos. | Jogar `shell.activeTaskId=C` direto no primary; substituir o draft; criar sem querer um terceiro pane. | usuário |

## Modelo de estado

Sobre a base do pane layout existente, adiciona-se um group store local ao renderer. O essencial não é mudar o protocolo para group, e sim manter na camada de UI 「a qual workbench group restaurável uma sessão pertence」.

```text
WorkbenchGroupState
  activeGroupId: string | null
  groups: Record<groupId, WorkbenchGroup>
  sessionIndex: Record<sessionKey, { groupId, paneId }>

WorkbenchGroup
  id: string
  root: PaneLayoutNode
  panes: Record<paneId, PaneBinding>
  focusedPaneId: string
  updatedAt: number

PaneBinding
  workspaceScope: {
    workspacePath: string
    workspaceIdentity?: string
    remoteSessionId?: string
  }
  sessionId: string
  readOnly?: boolean  // sessão child aberta inline pelo subagent: somente leitura, sem composer/input
```

`sessionKey` precisa incluir a fronteira de identidade do workspace:

```text
sessionKey = `${workspaceIdentity?.trim() || workspacePath}::${sessionId}`
```

`workspacePath` continua sendo usado para exibição de caminho e execução; a semântica de identidade/isolamento usa uniformemente `workspaceIdentity?.trim() || workspacePath`.

### Relação entre sessão única e group

Uma sessão comum sem split não precisa ser gravada previamente no group store. Ao clicar numa sessão não agrupada, pode-se exibir um pane único pela lógica antiga. Apenas as ações a seguir criam/preservam um group:

- Arrastar uma sessão não agrupada para ao lado de outra sessão/pane, formando um group de 2 panes.
- Continuar arrastando novas sessões não agrupadas para um group existente, formando um group de 3/4 panes.
- Restaurar do localStorage um group com 2+ membros válidos.

Quando um group fica com apenas 1 membro válido:

```text
remove group
remove a sessão restante do sessionIndex
o próximo clique nessa sessão abre pela lógica comum de pane único
```

## Ordem dos eventos

### Clique numa sessão da esquerda

```text
clique do usuário numa sessão da sidebar
        |
        v
build sessionKey(workspaceIdentity?.trim() || workspacePath, sessionId)
        |
        +-- sessionIndex casa um group
        |       |
        |       v
        |   activeGroupId = groupId
        |   focusedPaneId = o paneId indexado
        |   contexto ativo = o binding do pane focado
        |
        +-- sem match
                |
                v
            lógica antiga: abrir a view de sessão única
```

O layout temporário de draft é uma exceção explícita a essa 「lógica antiga」: ele não tem um sessionId de draft que possa ser
gravado no índice de groups, mas ainda precisa preservar a semântica de pane focado de editor group.

```text
paneLayout = [draft A | B]，focused=B
        |
        | clique normal na C não agrupada
        v
substituição atômica do binding completo do pane B (workspaceScope + sessionId)
        |
        v
paneLayout = [draft A | C]，focused=C

caminho proibido: shell.activeTaskId=C -> primary lê C -> [C | B]
```

### 「Abrir em split» pelo botão direito

```text
drag / context-menu / sidebar-select alvo T
        |
        v
resolver workbenchSessionPlacement（apenas decide, não escreve no store）
        |
        +-- T == sessão focada atual -> disabled / no-op
        +-- T já está em outro group/pane ------> foca o contexto existente; drag rejeita duplicata
        +-- o atual é uma sessão comum A ------> cria / estende o group
        +-- o primary atual é draft --------> divide um paneLayout temporário
        `-- clique normal sobre split de draft -> substitui o secundário focado
        |
        v
executor: primeiro confirma o owner de pane/group e só então sincroniza o shell active
```

### Arrastar para um split

```text
dragstart numa sessão da sidebar
        |
        +-- a sessão já está em algum group -> draggable=false / sem payload
        +-- contagem de panes cheia no group alvo atual -> o payload pode existir mas o alvo não mostra preview
        v
dragover sobre o pane de destino
        |
        +-- cliente não suporta -> ignore
        +-- group alvo cheio -> ignore
        +-- a sessão arrastada já está no group alvo/atual -> ignore
        +-- pointer no centro -> ignore
        +-- pointer na zona de borda -> mostra preview
        v
drop
        |
        v
divide o pane de destino pela direção
vincula o novo pane ao workspaceScope + sessionId da sessão arrastada
sessionIndex[sessionKey] = { groupId, paneId }
activeGroupId = groupId
focusedPaneId = newPaneId
persiste no localStorage
```

### Recuperação após fechar pane / excluir sessão

```text
fecha o pane ou o guard de recuperação remove a sessão ausente
        |
        v
remove o binding do pane e a entrada do sessionIndex
        |
        +-- contagem de panes do group >= 2 -> preserva o group
        +-- contagem de panes do group == 1 -> degrada para sessão única comum e remove o group
        +-- contagem de panes do group == 0 -> remove o group
```

Excluir a primária é um evento de ciclo de vida de sessão independente: o GC do group store e a navegação de sessão do shell precisam fechar de forma atômica.

```text
exclusão da primária A aceita
        |
        +-- remove o group/session index
        `-- shell.onSessionDeleted -> activeTaskId/sessionId = null -> rascunho do workspace
```

`web-remote-replayable` não é apenas esconder a affordance de split. Enquanto o shell remoto está habilitado, todas as entradas de sidebar/new-task
precisam contornar o contexto de group, e o renderer não lê nem escreve `workbench-groups:v1`; um estado residual antigo também não pode virar
alvo de workspace.

### Propriedade única de paneLayout → group

```text
split de draft / não agrupado: paneLayout:v2 é dono do root
        |
        | o pane secundário vincula uma sessão comum e a promoção tem sucesso
        v
group de sessões: workbench-groups:v1 é dono do root
        |
        +-- consome/reseta a origem paneLayout para um único primary
        +-- a razão do divider escreve em group.root
        `-- o GC do group cai para o primary único consumido
```

A promoção não é copiar o layout e manter escrita dupla. Depois do sucesso, o split antigo do paneLayout precisa ser consumido; caso contrário o divider
escreve a razão em um owner invisível e, após o fechamento do group, o pane secundário antigo ressuscita. O workspace scope/binding é preservado como está na atualização de
razão, e a chave de isolamento continua sendo `workspaceIdentity?.trim() || workspacePath`.

### Fronteira de migração do detalhe de subagent

```text
clique do usuário em "Abrir à direita" no child de um subagent
        |
        v
a linha fornece parentSessionId + childSessionId + subagentType
        |
        v
abre/reutiliza a tab lateral do workspace com chave workspace + parent + child
        |
        +-- contagem de group/pane do workbench inalterada
        +-- a tab child é um SessionPane completo somente leitura
        v
ativa a tab child, mas a active task do shell continua sendo a pai
        |
        v
todas as tabs child abertas mantêm leases vivos; trocar a pai apenas filtra os gatilhos de tab
```

Esta entrada não entra mais no `paneLayoutStore` nem em workbench group. Um group antigo que contenha um binding child `readOnly` é descartado ao restaurar o
histórico do localStorage; groups de sessões comuns mantêm a semântica de restauração original.
Ao mesmo tempo, o pane child não pode ser tratado como uma sessão comum em que se possa digitar: a sessão child de um subagent é produzida pela
orquestração da sessão pai, e abri-la inline na linha é apenas ver sua execução e resultado, portanto não se deve permitir que o usuário continue digitando novos
prompts no pane child.

## Restrições de design da UI

- O drag preview é uma camada sobre a metade correspondente do pane de destino, usando design tokens:
  - fundo: expressão de baixa opacidade de brand/accent;
  - borda: brand ou borda de foco;
  - sem azul fixo, compatível com os temas light/dark/Zai.
- Com múltiplos panes, um pane não focado usa uma máscara fraca para expressar o estado 「não active」:
  - a máscara usa uma mistura de baixa opacidade do token de background e não reduz diretamente a opacity do conteúdo do pane, evitando que texto, blocos de código e imagens clareiem juntos;
  - a máscara tem `pointer-events: none`, e o clique/foco continuam sendo recebidos pelo shell do pane;
  - a camada do drop preview precisa ficar acima da máscara de não active, para que a demonstração de drag não fique encoberta;
  - com pane único não se exibe máscara, evitando um escurecimento sem sentido no rascunho/sessão única comum.
- A área central não exibe preview e não dispara drop.
- Um item de sessão que já pertence a algum group não exibe affordance de drag; e, se o navegador ainda disparar dragover, o workbench não mostra preview.
- Ao atingir 4 panes, não se exibe drop preview e não se dispara split.
- O header e o highlight da esquerda seguem o contexto ativo do pane focado:

```text
binding do pane focado
        |
        +--> path/remote label do workspace header
        +--> workspacePath do switcher de branch Git
        +--> highlight de workspace/session da sidebar
        +--> roteamento de comandos do pane focado
```

- O branch/status de um pane de outro workspace não pode reaproveitar o Git summary do workspace atual do shell. Se o Git summary do workspace alvo ainda não
  foi carregado, pode-se mostrar primeiro o badge/path do workspace, e a entrada de branch carrega de forma independente por aquele workspace ou degrada para um estado vazio.
- Celular e o web-remote `/remote` não habilitam split por drag; a entrada correspondente não é exibida e o drop target não é registrado.

## Escopo de Domínio

| Domínio | Incluído? | Por que pode mudar comportamento | Fontes primárias |
| --- | --- | --- | --- |
| UI shell/theme/locale/responsivo | sim | A affordance de drag, o drop preview e o contexto ativo de header/sidebar são comportamentos de UI shell. | `DESIGN.md`, `packages/ui/src/v4/*` |
| Comportamento de conversation/session | sim | O clique em sessão, o focus e o roteamento de comandos de pane afetam a sessão ativa atual. | `docs/conversation-protocol-declaration.md`, `packages/ui/src/v4/SessionPane.tsx` |
| Identidade de workspace/runtime remoto | sim | Um group entre workspaces precisa manter o isolamento por `workspaceIdentity` e o scope de sessão remota. | `docs/v4-split-pane-workbench.md`, `docs/remote-workspace-session-unified-settings.md` |
| Persistência/índice/snapshot | sim | Restauração do layout de group pelo localStorage e limpeza após exclusão/arquivamento. | `packages/ui/src/v4/paneLayoutPersistence.ts` |
| Realtime remoto mobile/replayable | limitado | Usado apenas para desabilitar explicitamente `/remote`, evitando a propagação da semântica replayable. | `docs/web-remote-control/web-remote-control-architecture.md` |
| Protocolo/agent runtime | não | O group é estado de UI local ao renderer e não altera o protocolo v4. | `docs/v4-split-pane-workbench.md` |

## Produtos Cruzados de Alto Risco

| Cross-product | Risco candidato | Tratamento inicial |
| --- | --- | --- |
| pane focado x contexto ativo de header/sidebar | O header mostra A, mas o comando/highlight continua apontando para B. | O contexto ativo precisa ser derivado de uma única fonte, o binding do pane focado. |
| cross workspace x switcher de branch Git | Um pane de outro workspace reaproveita o Git summary errado. | A leitura de branch/status precisa respeitar o workspace scope do pane focado. |
| persistência de group x sessão excluída/arquivada | O localStorage restaura uma sessão que não existe mais. | Validar pelo sessions-index após restaurar; membros inválidos são removidos e o group sofre GC. |
| sessão duplicada x drag preview | Uma sessão já aberta ainda mostra a área de drop azul. | Guard duplo na origem do drag e no drop target. |
| desktop/web x web-remote replayable | Estado de group afundado por engano na cadeia remota replayable. | Gate de cliente: apenas desktop/web comum; remoto/mobile desabilitado. |
| limite de panes x dragover | Depois de completar 4 ainda há preview, mas o drop falha. | Ao completar 4 não se mostra preview e não se aceita drop. |
| menu de contexto x propriedade current/group | A sessão atual ainda é clicável, ou uma sessão que já está em outro group é criada em duplicidade. | Alvo focado desabilitado; quando outro owner casa, apenas ativa/foca. |
| paneLayout de draft x navegação da sidebar | Um clique normal em C sobrescreve o primary draft pelo valor único de sessão do shell. | Revincular atomicamente o secundário focado primeiro e só então confirmar a navegação do shell; o primary draft nunca tem binding de sessão. |

## Combinações Candidatas

| Candidate ID | Estado | Evento | Alvo/superfície | Guard/efeito esperado | Status inicial | Observações |
| --- | --- | --- | --- | --- | --- | --- |
| SWG-01 | sessão A em pane único, sessão B não agrupada | Arrastar B para a direita de A | workbench desktop/web | Cria G1, split esquerdo/direita de A/B, foco em B. | accepted | Caminho básico. |
| SWG-02 | G1 já tem A/B | Clicar em A na esquerda | sidebar | Mostra G1, foca A, header/sidebar acompanham A. | accepted | Semântica de restauração de group. |
| SWG-03 | G1 já tem A/B, C não agrupada | Arrastar C para baixo de B | bottom zone do pane B | C entra no G1, split abaixo de B, a casinha implícita original de C desaparece. | accepted | Migração de pertencimento único. |
| SWG-04 | G1 já tem A/B | Arrastar A para dentro do workbench | sidebar/workbench | A origem não é arrastável; se o dragover acontecer, não mostra preview. | accepted | Guard de duplicata. |
| SWG-05 | G1 já tem 4 panes | Arrastar E para qualquer pane | workbench | Não mostra preview, não dispara split. | accepted | Limite de panes. |
| SWG-06 | Pointer no centro do pane de destino | dragover | workbench | Não mostra preview, não dispara drop. | accepted | Centro desabilitado. |
| SWG-07 | G1 A/B entre workspaces | Focar B | header/sidebar | Header e highlight da esquerda mostram o workspace/sessão de B. | accepted | Derivação do contexto ativo. |
| SWG-08 | web-remote/mobile | Arrastar uma sessão | shell remoto | Sem affordance de drag split, drop target não registrado. | pruned | Desabilitado explicitamente. |
| SWG-09 | localStorage restaura G1, mas B foi excluída | restore | boot do renderer | Remove B; sobrando apenas A, o group degrada e é removido. | accepted | Guard de restauração. |
| SWG-10 | child de subagent em foreground B da sessão A já foi gerado | Clicar em 「Abrir à direita」 ao lado do título `Prompt` da área expansível do Agent | Bloco de ferramenta do Agent | Não cria workbench group; ativa à direita do workspace a tab completa somente leitura de B, e A continua sendo a sessão principal. | migrated-to-SAT | A semântica atual está em `subagent-session-side-tabs.md` e em SAT01-SAT10. |
| SWG-11 | O pane primário está em rascunho, sessão B não agrupada | Arrastar B para a direita do pane de rascunho | pane de draft do workbench | Mostra o preview da metade direita inteira; após o drop o primary continua sendo draft, B fica no pane da direita e nenhum group é criado. | accepted | O draft não é sessão e passa pelo paneLayoutStore. |
| SWG-12 | Estado histórico contém um pane de child de subagent readOnly B | restore do renderer | migração do workbench | Descarta o group readOnly antigo; B só pode ser reaberto como tab à direita a partir da linha do Agent pai. | migrated-to-SAT | Groups de sessões comuns não são afetados. |
| SWG-13 | Sessão A primary + pane focado de sessão/subagent B; se o split de draft já foi promovido, a origem paneLayout já foi consumida | Fechar o pane B | fechamento do workbench | O workbench volta a A; o activeTaskId/highlight da esquerda voltam a A; após o GC do group, B não pode ressuscitar de um paneLayout sombra. | accepted | Uma sessão fechada não pode ser preservada; o layout visível tem apenas um owner por vez. |
| SWG-14 | Sessão main do workspace A + pane histórico de subagent readOnly do workspace B | restore do renderer | migração | O group antigo de subagent readOnly não é restaurado e não participa mais do roteamento de pane focado em `Cmd/Ctrl+N`. | migrated-to-SAT | A nova tab lateral de subagent não altera o workspace/task ativo do shell. |
| SWG-15 | O pane focado atual já exibe a sessão A | Botão direito em A | menu de contexto da sidebar | 「Abrir em split」 permanece visível, mas desabilitado; não escreve paneLayout/group/shell. | accepted | O guard de current precisa ser julgado pelo owner focado. |
| SWG-16 | A sessão B já pertence ao G2, que não é o atual | Botão direito em B no pane único atual/em G1 | menu de contexto da sidebar | Ativa G2 e foca o pane existente de B; a contagem de panes e o membership único não mudam. | accepted | O usuário confirmou 「trocar」. |
| SWG-17 | O primary é o draft A, B não agrupada | Botão direito em B escolhendo 「Abrir em split」 | menu de contexto da sidebar | Forma o mesmo paneLayout temporário `[draft A | B]` que o drag, com foco em B; não cria sessão real nem group duplicado. | accepted | Menu e drag compartilham owner/ação. |
| SWG-18 | Layout temporário `[draft A | B]` com foco em B, C não agrupada | Clique normal em C | sidebar | Substitui no lugar o binding completo do secundário focado, resultando em `[draft A | C]`; a contagem de panes não muda e o draft A não é sobrescrito pela sessão do shell. | accepted | bug-candidate deste ciclo. |

## Cases Aceitos

| Case ID | Setup | Action | Assertions | Camadas de evidência | Status E2E |
| --- | --- | --- | --- | --- | --- |
| SWG-E2E-01 | Desktop/web comum, A em pane único atual, B não agrupada. | Arrastar B da sidebar para a right zone de A. | Aparece o preview da metade direita; após o drop há dois panes A/B; foco em B; o localStorage tem G1. | UI + localStorage + v4 pane testids | planned |
| SWG-E2E-02 | G1 A/B já existe. | Clicar em A na esquerda e depois em B. | O group não é reconstruído no meio; o pane focado alterna; header/sidebar acompanham a sessão correspondente. | UI + store probe | planned |
| SWG-E2E-03 | G1 A/B, C não agrupada. | Arrastar C para a bottom zone de B. | O alvo fica abaixo do pane B; G1 tem três panes; C passa de não agrupada para membro de G1. | UI + localStorage | planned |
| SWG-E2E-04 | G1 A/B. | Tentar arrastar A. | O item de A não é arrastável ou o dragover não mostra preview; a contagem de panes não muda. | UI | planned |
| SWG-E2E-05 | G1 com quatro panes. | Arrastar E para qualquer pane. | Não mostra preview; o drop é no-op. | UI + store | planned |
| SWG-E2E-06 | G1 A/B persistido. | Recarregar o renderer e clicar em A/B. | G1 é restaurado; o pane correspondente é focado. | UI + restauração do localStorage + guard de sessions-index | planned |
| SWG-E2E-07 | Shell mobile ou `/remote`. | Ver a lista de sessões/workbench. | Sem entrada de split por drag; o comportamento de clique existente não muda. | UI | planned |
| SWG-E2E-08 | A sessão A expande o subagent child B na timeline. | Clicar em 「Abrir à direita」. | Não aumenta o pane do workbench; a tab child à direita é completa e somente leitura, e a active task da esquerda continua sendo A. | UI + store probe | migrated-to-SAT |
| SWG-E2E-09 | O pane primário é o rascunho de uma nova sessão. | Arrastar a sessão B para a edge zone do pane de rascunho. | O preview não é coberto pelo input; após o drop há rascunho+B em dois panes; o workbench group continua vazio. | UI + store probe | planned |
| SWG-E2E-10 | O subagent child B foi aberto à direita da sessão A. | Ativar e fechar a tab B. | A esquerda sempre destaca A; fechar só libera a tab/lease do child, sem mudar a área principal. | UI + store probe | migrated-to-SAT |
| SWG-E2E-11 | O workspace B tem uma tab oculta de subagent child. | `Cmd/Ctrl+N` / menu New task. | O atalho continua roteado pelo pane comum focado do shell/workbench, e a tab child oculta não vira alvo de criação de task. | UI + store probe | migrated-to-SAT |
| SWG-E2E-12 | Sessão A em pane único comum/focado de group. | Botão direito em A. | 「Abrir em split」 desabilitado; o snapshot de pane/group mantém a mesma referência. | UI + store probe | planned |
| SWG-E2E-13 | B já está em outro group G2. | Botão direito em B na view atual e escolher 「Abrir em split」. | Restaura G2 diretamente e foca B; sem novo pane/session membership. | UI + localStorage + store probe | planned |
| SWG-E2E-14 | Primary draft A; B/C são sessões não agrupadas do mesmo workspace. | Botão direito em B para abrir em split e depois clique normal em C. | Primeiro se obtém `[draft A | B]` e depois `[draft A | C]`; a contagem de panes é sempre 2; o sessionId primário é sempre o draft. | UI + store do paneLayout + v4 pane testids + log de debug da UI | planned |

## Sugestões de implementação

Recomenda-se o esquema B: criar um `workbenchGroupStore` novo, sem enfiar o conceito de group no `paneLayoutStore` único já existente.

```text
packages/ui/src/v4/workbenchGroupStore.ts
  - activeGroupId
  - groups
  - sessionIndex
  - openSessionFromSidebar(scope, sessionId)
  - splitSessionIntoGroup(targetPaneId, direction, draggedSession)
  - closePane(groupId, paneId)
  - focusPane(groupId, paneId)
  - restore/persist localStorage
```

As funções puras do `paneLayoutTree.ts` atual podem ser reaproveitadas: árvore binária de divisão, `splitPaneAt`, `closePane`, `setSplitNodeRatio`, `effectiveFocusedPaneId` e assim por diante continuam válidos. Na implementação, é preciso elevar 「um layout global」 para 「um layout por group」.

O payload de drag carrega apenas os fatos mínimos necessários à UI:

```ts
type DraggedSessionPayload = {
  sessionId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
};
```

O drop target precisa revalidar o payload a partir do store e não pode confiar na origem do drag:

- se a sessão já pertence a algum group;
- se o group alvo existe e não está cheio;
- se o modo de cliente permite;
- se o pointer caiu na edge zone;
- se o workspace scope está completo.

## Matrix Backfill

| Arquivo | Mudança |
| --- | --- |
| `docs/conversation-session-case-catalog.md` | Adicionar entradas de case de produto para session workbench group / split por drag. |
| `docs/testing/conversation-session-e2e-coverage-matrix.md` | Adicionar SWG-E2E-01 a SWG-E2E-07, marcados inicialmente como planned. |
| `docs/v4-split-pane-workbench.md` | Na fase de implementação, atualizar o status atual de 「layout único de workbench」 para workbench(group-aware) e apontar para este documento. |

## Notas de Handoff E2E

- Fixture de provider: reaproveitar a fixture de conversation do v4; não é necessária resposta especial de provider.
- Fixture de sistema de arquivos: pelo menos dois workspaces, cobrindo casos representativos de identidade local + remota; a regressão em máquina remota real pode ser adicionada depois.
- Estratégia de timing: o preview de dragover usa mouse move do Playwright com asserção por data-testid; após o drop, espera-se o testid de pane e o estado de focus.
- Preset Docker: não obrigatório; a cobertura de workspace remoto pode seguir as especialidades existentes de SSH/WSL/Docker.
- Riscos de review:
  - O contexto ativo de header/sidebar não pode ser implementado alterando grosseiramente o `activeTabId` global, senão a semântica de preservação de group é quebrada.
  - O Web App comum pode usar o recurso, mas `/remote` e mobile são desabilitados; o gate de cliente precisa ser testável.
  - A restauração do localStorage precisa tolerar exclusão de sessão, queda de conexão do workspace e schema corrompido.