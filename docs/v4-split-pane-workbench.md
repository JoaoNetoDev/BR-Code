# Workbench de múltiplos panes entre workspaces no v4 (fase dois da tela dividida)

Status: **implementado, com os limites de produto reconfirmados em 2026-07-17**. Arrastar uma session da lista de Tasks
para a borda da área de conversa ainda cria/restaura um workbench group; em 2026-07-13 apenas os botões explícitos
“向右拆分 / 向下拆分” (dividir para a direita / dividir para baixo) do pane chrome foram temporariamente desativados.

## Objetivo

Elevar o “1+1 dividido lado a lado no mesmo workspace” do M5⑤ para um “workbench de N panes”:

- O layout passa de um único `splitPane` para uma **árvore de divisão binária** (modelo de editor groups do VS Code):
  qualquer pane pode ser dividido para a direita/para baixo, e aninhar gera uma grade 2x2 uniforme. O limite de folhas é
  `MAX_WORKBENCH_PANES = 4` (alinhado à base de aceitação de performance do 06-ui “4 panes com streaming simultâneo sem
  queda de frames”; é também um limite suave para o número de subprocessos CLI dentro do host).
- O binding do pane sobe para `(workspaceScope, sessionId)`: o próprio pane carrega sua atribuição de workspace,
  **sem mais exigir o mesmo workspace**; workspaces locais e remotos (SSH/WSL/Docker) podem ser combinados livremente.
- A camada de conexão ganha o `workspaceConnectionRegistry`: reuso por contagem de referências de `transport +
  SessionDataLayer` por `endpointKey + workspaceKey` (isomórfico ao `sessionsIndexRegistry`, com mais uma camada de
  keep-warm de 30s).
- O primary pane (`workspace-main`) permanece conduzido pelo shell (ligado ao `activeTaskId`, troca junto com a tab de
  workspace); os demais panes são geridos pelo próprio `paneLayoutStore` e **persistem entre tabs** — o tabStore e seus
  ~46 consumidores de `activeTabId` não têm nenhuma alteração.

## Topologia de conexão

```text
window renderer                          host / host remoto                 processo CLI
  pane(A/s1) ─┐
  pane(A/s2) ─┼─ workspaceConnectionRegistry
  pane(B/s3) ─┘   Map<endpointKey+workspaceKey,
  pane(R/s4) ─┐       { transport, SessionDataLayer, refCount, keepWarm }>
              │        │
              │        ├─ scope local ──→ base services.zcodeAgentService ──→ base local host
              │        │                   └─ processesByWorkspaceKey ┬─→ agent(A)  conversation/s1,s2
              │        │                      (um CLI por workspace)  └─→ agent(B)  conversation/s3
              │        └─ scope remoto ──→ sessionsById[remoteSessionId].services ──→ remote host ──→ agent(R)  conversation/s4
              └─ conexão remota ausente → proxy de desconexão (rejects) → pane entra no estado error/aguardando conexão, sem iniciar outro runtime
```

Pontos principais:

- O topic de conversation contém apenas o sessionId (`conversationTopic`); o isolamento por workspace vem do host, que
  distribui em buckets por workspaceKey para processos CLI independentes, e da filtragem dos frames de downlink pelo
  emitter de workspaceKey — **zero mudança de schema** no protocolo já suporta a assinatura concorrente de N workspaces na
  mesma janela.
- Vários panes com o mesmo workspaceKey + endpointKey compartilham uma transport e um SessionDataLayer (vários panes da
  mesma sessão são agrupados em uma única assinatura pelo refCount dentro do layer, sem disparar a reassinatura que
  substituiria `(connectionId, topic)` no CLI).
- Os services dos panes remotos reutilizam o `remoteWorkspaceSessionStore.sessionsById` (Map de múltiplas conexões já
  existente); quando a conexão remota cai, o `useWorkspaceServices` devolve um proxy de desconexão (todas as RPC rejeitam) e
  a falha de assinatura cai no estado de erro do store projetado → o pane exibe o placeholder de reconexão/aguardando.
  **É proibido** iniciar um SSH/runtime separado para o pane (restrição de proteção do controle remoto).

## Camada de layout: árvore de divisão binária (paneLayoutStore v2)

```text
LayoutNode = Leaf { paneId }
           | Split { id, direction: "row"|"column", ratio, first, second }

ratio = proporção de first, clamp [0.25, 0.75]（mantém a semântica de splitRatio da fase um, cada nó Split tem a sua própria cópia）

pane único:         leaf(main)
divisão esquerda/direita: split(row){ leaf(main), leaf(pane-1) }
grade 2x2:          split(row){ split(col){ leaf(main), leaf(pane-2) },
                                split(col){ leaf(pane-1), leaf(pane-3) } }
```

- Estado: `{ root: LayoutNode, panes: Record<paneId, PaneBinding>, focusedPaneId }`; o primary pane (`workspace-main`) é uma
  folha reservada — **não entra em `panes`** e seu binding continua vindo das props do shell (activeTaskId).
- `PaneBinding = { workspaceScope, sessionId | null, restoredUnvalidated? }`;
  `workspaceScope = { workspacePath, workspaceIdentity?, remoteSessionId? }`.
- **A semântica de `workspaceScope` é o workspace principal ao qual a sessão pertence, e é a chave de roteamento da
  conexão**; não é “todos os caminhos que a sessão pode alcançar” (ver abaixo a compatibilidade com sessão entre workspaces).
- O critério de workspaceKey é unificado em `workspaceIdentity?.trim() || workspacePath` (restrição de Workspace Identity).
- Todas as funções de transição são puras e devolvem a referência original em caso de no-op: `splitPaneAt` (no-op quando o
  limite de folhas é atingido), `closePane` (o primary não pode ser fechado; o Split pai colapsa no irmão), `bindPaneSession`,
  `setSplitNodeRatio`, `focusPane`, `confirmRestoredPaneSession`.
- A camada de foco não muda: `focusedPaneId` é um único valor; quando o pane em foco não está na árvore, ele degrada para o
  primary. Os atalhos globais (Esc stop, add-to-chat) são roteados para o pane em foco (regra 4 da tela dividida do 06-ui).
- A regra da fase um de “não renderizar quando o split pertence a outro workspace” é **removida** — o pane carrega seu próprio
  workspace, é sempre renderizado e persiste entre tabs.

### Persistência v2 e migração

- chave `zcode-v4-pane-layout:v2`: a árvore inteira + os bindings de `panes` (scope + sessionId) + `focusedPaneId`.
  `restoredUnvalidated` não é persistido e é marcado na restauração para sessionId não vazios.
- Leitura compatível da v1 (`zcode-v4-pane-layout:v1`, splitPane de valor único): a v1 guardava apenas `workspaceKey` e só
  é migrada para `split(row){ main, split }` (scope.workspacePath = workspaceKey) quando esse valor é um caminho local
  confiável (`/...` ou `X:\...`); caso contrário é descartada e volta a um único pane. Dados corrompidos são descartados por
  completo e voltam ao layout inicial (seguindo a filosofia de sanitização da fase um, sem resgate parcial).

## Camada de conexão: workspaceConnectionRegistry

- Registro em nível de módulo (isomórfico ao `sessionsIndexRegistry`): chave = `endpointKey(remoteSessionId ??
  "__base__") + workspaceKey`.
- `acquireWorkspaceConnection(scope, agentService)` → `{ layer, transport, release }`; a primeira referência cria
  `createAgentConversationTransport + SessionDataLayer`, e depois que o refCount chega a zero há um **keep-warm de 30s**
  antes do dispose (evita o tremor de panes fechando/abrindo e arrastando o layout).
- Cada entrada guarda a referência do `agentService` que a criou: ao fazer acquire da mesma chave com uma referência de
  service diferente (após queda e reconexão remota os services são trocados), a entrada antiga é invalidada imediatamente e
  removida do registro (as leases existentes continuam até o release) e a nova entrada é reconstruída com o novo service —
  a recuperação após reconexão não exige atualização manual.
- A resolução dos services fica na camada React (`useWorkspaceServices(path, remoteSessionId, identity)` dentro do
  `V4PaneConversationProvider`): quando o alvo remoto está desconectado obtém-se o proxy de desconexão, e a falha de
  assinatura vira o estado de erro do pane com botão de nova tentativa; **não há fallback para os services base** (evita que
  uma task remota seja consultada pelo host local).

## Provider por pane

- `V4PaneConversationProvider({ scope, isShellWorkspace, children })`: wrapper por pane.
  - `isShellWorkspace = workspaceKey do scope do pane === workspace atual do shell`: quando verdadeiro usa diretamente os
    services do contexto (byte a byte igual à fase um, e o shell de controle remoto em web larga também segue esse
    caminho); caso contrário resolve pelo scope via `useWorkspaceServices` (pane entre workspaces só pode ser criado pela
    entrada de desktop).
  - O wrapper interno `ServiceProvider services={paneServices}` faz com que o upload de anexos da subárvore do pane, os
    guards de sessions-index e outros hooks usem o accessor do próprio pane.
  - O formato do context não muda (`{ layer, sendCommand, attachmentPut }`), e o `SessionPane` não percebe nada.
- O `V4ChatPane` do `/remote` no celular (um pane, sem tela dividida) continua usando o `V4ConversationProvider` original
  (criação direta por workspace), e a cadeia replayable de controle remoto permanece intacta.

## Guard de restauração (generalizado por pane)

```text
sequência de restauração（cada pane com restoredUnvalidated de forma independente）:

localStorage ─→ paneLayoutStore(v2 restore, adiciona restoredUnvalidated)
                    │
V4PaneWorkbench ────┼─→ render do pane（renderiza primeiro, não bloqueia）
                    └─→ PaneRestoredGuard(pane scope)
                          acquireSessionsIndex({ workspaceKey, endpointKey: remoteSessionId })
                          aguarda o primeiro snapshot real（workspaceId !== null）
                            ├─ sessão presente → confirmRestoredPaneSession(paneId)
                            ├─ sessão já excluída → closePane(paneId)
                            └─ falha na assinatura / endpoint remoto ausente → sem veredito, o pane permanece no
                               estado error/aguardando conexão（o retry do próprio pane serve de fallback, sem fechar por engano）
```

Contrato com a camada de dados: **uma sessão aparece, e só aparece, no sessions-index do seu workspace principal** —
logo o guard, procurando pelo workspace principal do pane, é completo (e continua valendo depois que a sessão entre
workspaces existir).

## Entradas

- O arraste, o item de sessão da barra lateral com “在分屏打开” (abrir em tela dividida) e o clique normal em uma session entram todos em
  `workbenchSessionPlacement`: um resolver puro decide entre current guard, focus existing, split draft,
  create/extend group ou replace focused pane, e o executor então confirma na ordem “primeiro atualiza o owner do
  pane/group, depois sincroniza o active do shell”. O arraste só aceita uma decisão de split real e passa o side/anchor
  atingido; o clique com o botão direito aponta para a direita por padrão e permite focus existing; o clique normal usa o
  selection intent. Os itens de task carregam workspacePath/workspaceIdentity/remoteSessionId completos, e a igualdade entre
  workspaces usa o workspaceKey. O portão de entrada `V4SplitPaneEntryProvider` (shell de desktop e fora do controle
  remoto) mantém a mesma semântica.
- pane chrome (decisão de 2026-07-08): não se renderiza mais a barra horizontal de header que ocupava altura do layout. As
  entradas de divisão “向右拆分 / 向下拆分” (draft, ligadas ao workspaceScope do pane atual) e “关闭 pane” (sem fechamento
  para o primary) ficam unificadas no grupo de ações flutuante no canto superior direito do pane, para não apertar a
  primeira linha do conteúdo de conversa. Quando o pane não é primary e o workspace difere do workspace atual do shell, a
  insígnia com o nome do workspace entra à esquerda do mesmo grupo flutuante (com identificação de host quando remoto). A
  insígnia é puramente de exibição, e é nela que a futura insígnia de múltiplos caminhos “A +2” da sessão entre workspaces
  será estendida.
- **Desativação temporária (2026-07-13)**: o pane chrome da área de conversa não exibe temporariamente os dois botões
  “向右拆分 / 向下拆分”; a árvore binária subjacente, a interface de callback da divisão, o fechamento de pane, a insígnia
  de workspace e a entrada “在分屏打开” da barra lateral são mantidos, de modo que restaurar as entradas do chrome não exige
  migrar estado nem protocolo.

## Compatibilidade com “sessão entre workspaces” (entrada futura, já preparada nesta fase)

Uma futura sessão entre workspaces = um workspace principal + múltiplos caminhos auxiliares (diretórios extras que o agent
pode operar), com principal e auxiliares no mesmo endpoint e a relação registrada na camada de dados. Esta fase fixa quatro
pontos:

1. A semântica de `PaneBinding.workspaceScope` fica fixada no **workspace principal** (chave de roteamento da conexão); os
   caminhos auxiliares são atributos da sessão (entregues via projection/sessions-index) e não entram na camada de layout —
   quando isso existir, o `paneLayoutStore` não terá nenhuma mudança de schema.
2. O registro de conexões roteia pelo workspace principal (uma sessão entre workspaces continua sendo um agent com uma única
   conexão); não se deixa uma abertura de API para “agregação de conexões de múltiplos workspaces”.
3. A igualdade por workspaceKey serve apenas para atribuição/isolamento, nunca para deduzir “capacidade de caminho”; a
   apresentação na UI dos caminhos auxiliares é um incremento puramente visual.
4. A restrição de principal e auxiliares no mesmo endpoint é garantida pela entrada de criação; o workbench de panes não faz
   suposições de agregação entre endpoints.

Caminho de extensão do protocolo (aditivo, sem alterar campos existentes): o payload de `createSession` ganha
`auxiliaryPaths?`; o item do sessions-index expõe a relação entre principal e auxiliares.

## Memorandos sobre o protocolo (conclusões desta fase)

- **Zero mudança de schema**. Lacuna de implementação já preenchida: o `workspaceId` de `v4-bridge.createSessionRecord` no CLI
  deixou de “tratar sempre como workspacePath local” e passou a ser resolvido pelo par de identidade remota (família
  `buildRemoteWorkspaceIdentity`, sem concatenação manual) — pré-requisito para criar sessão a partir do primeiro envio de
  um draft em um pane remoto.
- O campo de assinatura `visibility: foreground/background` já está reservado no protocolo e não é consumido pelo CLI; se
  4 panes com streaming simultâneo perderem frames na medição, faz-se o flush do CLI em níveis por visibility (aditivo).
- A assinatura de conversation não tem `subscriberScope` (connectionId único por processo no host + uma única assinatura por
  topic já resolve); só seria preciso complementar tomando o sessions-index como referência caso surjam “vários consumidores independentes
  assinando a mesma sessão”.

## Lista de pontos de mudança da implementação (na ordem de entrega)

| # | Ponto de toque | Mudança |
| --- | --- | --- |
| 1 | `packages/ui/src/v4/paneLayoutStore.ts` | Reescrito como v2: árvore de divisão binária + `panes: Record<paneId, PaneBinding>` + persistência v2 (`zcode-v4-pane-layout:v2`) e migração da v1; removida a regra de visibilidade de `splitPaneForWorkspace`. O novo pane id usa o maior `pane-<n>` da árvore +1 (a migração da v1 preserva o id `split`) |
| 2 | `packages/ui/test/v4PaneLayoutStore.test.ts` | Testes unitários reescritos: operações da árvore/limite/collapse/migração da v1/degradação do focus/fecho da persistência |
| 3 | `packages/ui/src/v4/workspaceConnectionRegistry.ts` (novo) | Contagem de referências + keep-warm de 30s + invalidação por troca de agentService; seguindo o padrão de `sessionsIndexRegistry.ts` |
| 4 | `packages/ui/src/v4/V4ConversationContext.tsx` | Novo `V4PaneConversationProvider` (lease do registro + wrapper de `ServiceProvider` por pane + `isShellWorkspace` usando os services do contexto); o `V4ConversationProvider` original fica com o `V4ChatPane` do celular |
| 5 | `packages/ui/src/v4/V4WorkspaceChatArea.tsx` | Reescrito como renderização recursiva da árvore de divisão; `SplitPaneDivider` generalizado (sensível a direction + variável CSS por node `--v4-split-<nodeId>`, com o arraste ainda escrevendo direto em rAF, sem render); guard de restauração por pane componentizado (`PaneRestoredGuard`) |
| 6 | `packages/ui/src/v4/SessionPane.tsx` | As escutas de Esc-stop e add-to-chat passam de “somente primary” para “pane em foco” (regra 4 da tela dividida do 06-ui); novas props de divisão/fechamento/insígnia repassadas |
| 7 | `packages/ui/src/v4/ConversationHeader.tsx` | “分屏/关闭分屏” vira “向右拆分/向下拆分/关闭 pane” + insígnia de workspace (exibida quando não é primary e difere do workspace atual do shell, com identificação de host quando remoto); textos entram no i18n nos dois idiomas |
| 8 | `packages/ui/src/v4/workbenchSessionPlacement.ts` / `V4WorkspaceChatArea.tsx` / `app-shell/WorkspaceShellLayout.tsx` | Arraste, divisão por botão direito e clique normal compartilham o resolver/executor de placement; a entrada fornece apenas intent, side, anchor e o workspace scope completo, e é desabilitada quando o limite de folhas é atingido e o alvo não tem atribuição existente |
| 9 | Detalhes de subagent child | Já migrados para as tabs à direita do workspace e não entram mais no split-pane workbench; o “在分屏打开” (abrir em tela dividida) da session comum permanece igual |
| 10 | `packages/ui/src/v4/index.ts` | Superfície de exports atualizada (substituição das antigas funções de transição/tipos) |
| 11 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | O `workspaceId` de `createSessionRecord` passa pela resolução pelo par de identidade remota (família `buildRemoteWorkspaceIdentity`), com testes unitários — pré-requisito para criar sessão a partir do primeiro envio de um draft em um pane remoto |
| 12 | Três `conversation-session-v4-split*.test.ts` antigos | Removidos em 2026-07-13 por causa da desativação dos botões explícitos; a cobertura de regressão da entrada de arraste da lista de Tasks ainda precisa ser mantida |

O que não muda: `tabStore` (e seus ~46 consumidores de `activeTabId`), a semântica do portão `splitPaneEntryContext`, a
cadeia `V4ChatPane` do `/remote` no celular, o schema `zcode-protocol-v4` e a camada host/services (o particionamento por
`processesByWorkspaceKey` já está pronto).

Fatos-chave já verificados (a implementação pode depender diretamente deles):

- No host, `conversationFrameEmitters` e `processesByWorkspaceKey` são ambos particionados por workspaceKey, e a assinatura
  concorrente de N workspaces na mesma janela não tem suposição de valor único;
- `remoteWorkspaceSessionStore` já tem o Map de múltiplas conexões `sessionsById` e `resolveRegisteredWorkspaceServices`; mas,
  quando o alvo remoto cai, é **obrigatório** passar pelo caminho do proxy de desconexão de `useWorkspaceServices`, sem
  fallback para os services base;
- `sessionsIndexRegistry` já isola por `endpointKey + workspaceKey`, e o guard de restauração por pane pode reaproveitá-lo
  diretamente;
- contratos de e2e já existentes: `v4-pane-shell-<paneId>` (`data-pane-id`/`data-focused`), `v4-session-pane-<paneId>`,
  `TID_V4_SPLIT_OPEN/CLOSE/DIVIDER`, o `TID_V4_TASK_OPEN_IN_SPLIT` da barra lateral e a chave de localStorage (a v1→v2 exige
  sincronizar a constante no helper).

## Base de verificação

- Testes unitários: máquina de estados do paneLayoutStore v2 (operações da árvore/limite/collapse/migração da v1/degradação
  do focus/fecho da persistência) e workspaceConnectionRegistry (contagem/keep-warm/troca de service/uso compartilhado).
- E2E (contratos de testid): os sufixos dinâmicos de paneId de `TID_V4_PANE_SHELL`/`TID_V4_SESSION_PANE` permanecem
  iguais; o divisor `TID_V4_SPLIT_DIVIDER` carrega data-split-id; o fluxo principal (abrir divisão → binding pelo primeiro
  envio do draft → arrastar a largura → restaurar após refresh → fechar) reaproveita os três e2e de split já existentes.
- Base de performance (06-ui): 4 panes com saída em streaming simultânea não perdem frames na interação.
- Verificações ainda pendentes: regressão SSH real de pane remoto (placeholder de desconexão/recuperação após reconexão/criação
  de sessão a partir de draft remoto).