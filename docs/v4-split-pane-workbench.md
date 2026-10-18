# v4 多 pane 跨 workspace 工作台（分屏二期）

# Workbench de múltiplos panes entre workspaces no v4 (fase dois da tela dividida)

状态：**已实现，2026-07-17 再次确认产品边界**。Task 列表拖拽 session 到
对话区边缘仍会创建/恢复 workbench group；2026-07-13 仅临时下线 pane chrome
的“向右拆分 / 向下拆分”显式按钮。

Status: **implementado, com os limites de produto reconfirmados em 2026-07-17**. Arrastar uma session da lista de Tasks
para a borda da área de conversa ainda cria/restaura um workbench group; em 2026-07-13 apenas os botões explícitos
“向右拆分 / 向下拆分” do pane chrome foram temporariamente desativados.

## 目标

## Objetivo

把 M5⑤ 的「同 workspace 1+1 左右分屏」升级为「N pane 工作台」：

Elevar o “1+1 em左右 dividido no mesmo workspace” do M5⑤ para um “workbench de N panes”:

- 布局从单值 `splitPane` 升级为**二叉分割树**（VS Code editor groups 模型）：任意 pane 可向右/向下拆分，嵌套即得 2x2 等网格。叶子上限 `MAX_WORKBENCH_PANES = 4`（对齐 06-ui 性能验收基线「4 pane 同时流式不掉帧」；同时是 host 内 CLI 子进程数的软上限）。
- pane 绑定升级为 `(workspaceScope, sessionId)`：pane 自带 workspace 归属，**不再限制同 workspace**；本地与远程（SSH/WSL/Docker）workspace 任意组合。
- 连接层新增 `workspaceConnectionRegistry`：按 `endpointKey + workspaceKey` 引用计数复用 `transport + SessionDataLayer`（与 `sessionsIndexRegistry` 同构，多一层 30s keep-warm）。
- primary pane（`workspace-main`）保持 shell 驱动（绑 `activeTaskId`，随 workspace tab 切换）；其余 pane 归 `paneLayoutStore` 自管、**跨 tab 常驻**——tabStore 及其 ~46 个 `activeTabId` 消费者零改动。

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

## 连接拓扑

## Topologia de conexão

```text
window renderer                          host / 远程 host                  CLI 进程
  pane(A/s1) ─┐
  pane(A/s2) ─┼─ workspaceConnectionRegistry
  pane(B/s3) ─┘   Map<endpointKey+workspaceKey,
  pane(R/s4) ─┐       { transport, SessionDataLayer, refCount, keepWarm }>
              │        │
              │        ├─ 本地 scope ──→ base services.zcodeAgentService ──→ base local host
              │        │                   └─ processesByWorkspaceKey ┬─→ agent(A)  conversation/s1,s2
              │        │                      （每 workspace 一个 CLI）└─→ agent(B)  conversation/s3
              │        └─ 远程 scope ──→ sessionsById[remoteSessionId].services ──→ remote host ──→ agent(R)  conversation/s4
              └─ 远程连接不在场 → 断连代理（rejects）→ pane 进 error/等待连接态，不另起 runtime
```

要点：

Pontos principais:

- conversation topic 只含 sessionId（`conversationTopic`），workspace 隔离靠 host 按 workspaceKey 分桶到独立 CLI 进程 + 下行帧按 workspaceKey emitter 过滤——协议面**零 schema 改动**即支持同窗口并发订阅 N 个 workspace。
- 同 workspaceKey + endpointKey 的多个 pane 共享一条 transport + 一个 SessionDataLayer（同 session 多 pane 靠 layer 内 refCount 单订阅收口，不触发 CLI `(connectionId, topic)` 重订阅替换）。
- 远程 pane 的 services 复用 `remoteWorkspaceSessionStore.sessionsById`（既有多连接 Map）；远程连接断开时 `useWorkspaceServices` 给出断连代理（所有 RPC reject），订阅失败落在投影 store 的 error 态 → pane 显示重连/等待占位。**禁止**为 pane 另起独立 SSH/runtime（远控保护约束）。

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

## Layout 层：二叉分割树（paneLayoutStore v2）

## Camada de layout: árvore de divisão binária (paneLayoutStore v2)

```text
LayoutNode = Leaf { paneId }
           | Split { id, direction: "row"|"column", ratio, first, second }

ratio = first 占比，clamp [0.25, 0.75]（沿用一期 splitRatio 语义，每个 Split 节点独立一份）

单 pane:          leaf(main)
左右分屏:         split(row){ leaf(main), leaf(pane-1) }
2x2 网格:         split(row){ split(col){ leaf(main), leaf(pane-2) },
                              split(col){ leaf(pane-1), leaf(pane-3) } }
```

- 状态：`{ root: LayoutNode, panes: Record<paneId, PaneBinding>, focusedPaneId }`；primary pane（`workspace-main`）是保留叶子——**不进 `panes`**，绑定沿用 shell props（activeTaskId）。
- `PaneBinding = { workspaceScope, sessionId | null, restoredUnvalidated? }`；
  `workspaceScope = { workspacePath, workspaceIdentity?, remoteSessionId? }`。
- **`workspaceScope` 语义 = session 归属的主（primary）workspace，是连接路由键**；不是「session 能触达的全部路径」（见下文跨 workspace session 兼容）。
- workspaceKey 口径统一 `workspaceIdentity?.trim() || workspacePath`（Workspace Identity 约束）。
- 转移函数全部纯函数、no-op 返回原引用：`splitPaneAt`（叶子数达上限 no-op）、`closePane`（primary 不可关；父 Split 塌缩为兄弟节点）、`bindPaneSession`、`setSplitNodeRatio`、`focusPane`、`confirmRestoredPaneSession`。
- Focus 层不变：`focusedPaneId` 单值；焦点 pane 不在树中时退化为 primary。全局快捷键（Esc stop、add-to-chat）路由到 focused pane（06-ui 分屏规则 4）。
- 一期的「split 属于别的 workspace 时不渲染」规则**删除**——pane 自带 workspace，永远渲染、跨 tab 常驻。

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

### 持久化 v2 与迁移

### Persistência v2 e migração

- key `zcode-v4-pane-layout:v2`：整树 + `panes` 绑定（scope + sessionId）+ `focusedPaneId`。`restoredUnvalidated` 不持久化，恢复时对非空 sessionId 补标。
- 兼容读取 v1（`zcode-v4-pane-layout:v1` 单值 splitPane）：v1 只存了 `workspaceKey`，仅当它是可信本地路径（`/...` 或 `X:\...`）时迁移为 `split(row){ main, split }`（scope.workspacePath = workspaceKey），否则丢弃回单 pane。损坏数据整体丢弃回初始布局（沿用一期 sanitize 哲学，不做部分救回）。

- chave `zcode-v4-pane-layout:v2`: a árvore inteira + os bindings de `panes` (scope + sessionId) + `focusedPaneId`.
  `restoredUnvalidated` não é persistido e é marcado na restauração para sessionId não vazios.
- Leitura compatível da v1 (`zcode-v4-pane-layout:v1`, splitPane de valor único): a v1 guardava apenas `workspaceKey` e só
  é migrada para `split(row){ main, split }` (scope.workspacePath = workspaceKey) quando esse valor é um caminho local
  confiável (`/...` ou `X:\...`); caso contrário é descartada e volta a um único pane. Dados corrompidos são descartados por
  completo e voltam ao layout inicial (seguindo a filosofia de sanitização da fase um, sem resgate parcial).

## 连接层：workspaceConnectionRegistry

## Camada de conexão: workspaceConnectionRegistry

- 模块级注册表（与 `sessionsIndexRegistry` 同构）：key = `endpointKey(remoteSessionId ?? "__base__") + workspaceKey`。
- `acquireWorkspaceConnection(scope, agentService)` → `{ layer, transport, release }`；首个引用创建 `createAgentConversationTransport + SessionDataLayer`，refCount 归零后 **30s keep-warm** 再 dispose（防 pane 关/开、布局拖拽抖动）。
- 条目记住创建它的 `agentService` 引用：同 key 再次 acquire 时若 service 引用变化（远程断连→重连后 services 换新），旧条目立即失效移出注册表（存量租约继续持有直至 release），新条目用新 service 重建——重连恢复不需要手动刷新。
- services 解析归 React 层（`V4PaneConversationProvider` 内 `useWorkspaceServices(path, remoteSessionId, identity)`）：远程目标断连时得到断连代理，订阅失败 → pane error 态 + 重试按钮；**不回落 base services**（避免远程 task 被本机 host 查询）。

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

## per-pane Provider

## Provider por pane

- `V4PaneConversationProvider({ scope, isShellWorkspace, children })`：per-pane 包裹。
  - `isShellWorkspace = pane scope 的 workspaceKey === shell 当前 workspace`：成立时直接用上下文 services（与一期行为逐字节一致，web 宽屏远控 shell 也走这条），否则经 `useWorkspaceServices` 按 scope 解析（跨 workspace pane 仅桌面入口可创建）。
  - 内层包 `ServiceProvider services={paneServices}`：pane 子树的附件上传、sessions-index 守卫等 hook 用 pane 自己的 accessor。
  - context 形状不变（`{ layer, sendCommand, attachmentPut }`），`SessionPane` 零感知。
- 手机 `/remote` 的 `V4ChatPane`（单 pane，无分屏）继续用原 `V4ConversationProvider`（per-workspace 直建），远控 replayable 链路不动。

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

## 恢复守卫（per-pane 泛化）

## Guard de restauração (generalizado por pane)

```text
恢复时序（每个 restoredUnvalidated pane 独立）：

localStorage ─→ paneLayoutStore(v2 恢复, 补 restoredUnvalidated)
                    │
V4PaneWorkbench ────┼─→ pane 渲染（先渲染，不阻塞）
                    └─→ PaneRestoredGuard(pane scope)
                          acquireSessionsIndex({ workspaceKey, endpointKey: remoteSessionId })
                          等首个真 snapshot（workspaceId !== null）
                            ├─ session 在场 → confirmRestoredPaneSession(paneId)
                            ├─ session 已删 → closePane(paneId)
                            └─ 订阅失败/远程 endpoint 不在场 → 不判定，pane 保留为
                               error/等待连接态（交由 pane 自身 retry 兜底，不误关）
```

对数据层的契约：**session 会且只会出现在其主 workspace 的 sessions-index 里**——守卫按 pane 的主 workspace scope 查找即完备（跨 workspace session 落地后仍然成立）。

Contrato com a camada de dados: **uma sessão aparece, e só aparece, no sessions-index do seu workspace principal** —
logo o guard, procurando pelo workspace principal do pane, é completo (e continua valendo depois que a sessão entre
workspaces existir).

## 入口

## Entradas

- 拖拽、侧栏会话项「在分屏打开」和普通 session 点击统一进入 `workbenchSessionPlacement`：纯 resolver 决定 current guard、focus existing、split draft、create/extend group 或 replace focused pane，executor 再按“pane/group owner 先更新，shell active 后同步”的顺序提交。拖拽只接受实际 split decision 并传入命中的 side/anchor；右键默认向右且允许 focus existing；普通点击使用 selection intent。task 项携带完整的 workspacePath/workspaceIdentity/remoteSessionId，跨 workspace 判等使用 workspaceKey。入口闸门 `V4SplitPaneEntryProvider`（桌面 shell 且非远控）语义不变。
- pane chrome（2026-07-08 裁决）：不再渲染占布局高度的横向 header 条。拆分入口「向右拆分 / 向下拆分」（draft，绑当前 pane 的 workspaceScope）和「关闭 pane」（primary 无关闭）统一放在 pane 右上角悬浮操作组里，避免挤占对话内容首行。非 primary 且 workspace ≠ shell 当前 workspace 时，workspace 名徽标进入同一悬浮组左侧（远程加主机标识）。徽标是纯展示位，未来跨 workspace session 的「A +2」多路径徽标在此扩展。
- **临时下线（2026-07-13）**：对话区域 pane chrome 暂不展示「向右拆分 / 向下拆分」两个按钮；保留底层二叉布局、拆分回调接口、关闭 pane、workspace 徽标及侧栏「在分屏打开」入口，后续恢复 chrome 入口时无需迁移状态或协议。

- O arraste, o item de sessão da barra lateral com “在分屏打开” e o clique normal em uma session entram todos em
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

## 与「跨 workspace session」的兼容（未来输入，本期预埋）

## Compatibilidade com “sessão entre workspaces” (entrada futura, já preparada nesta fase)

未来的跨 workspace session = 一个主 workspace + 多个辅助路径（agent 可操作的额外目录），主/辅同 endpoint，关系记录在数据层。本期钉死四条：

Uma futura sessão entre workspaces = um workspace principal + múltiplos caminhos auxiliares (diretórios extras que o agent
pode operar), com principal e auxiliares no mesmo endpoint e a relação registrada na camada de dados. Esta fase fixa quatro
pontos:

1. `PaneBinding.workspaceScope` 语义固定为 **primary workspace**（连接路由键）；辅助路径是 session 属性（经 projection/sessions-index 下发），不进布局层——届时 `paneLayoutStore` 零 schema 变更。
2. 连接注册表按主 workspace 路由（跨 workspace session 仍是单 agent 单连接）；不留「多 workspace 连接聚合」的 API 口子。
3. workspaceKey 判等只用于归属/隔离，绝不用于「路径能力」推导；辅助路径的 UI 呈现是纯展示增量。
4. 主/辅同 endpoint 约束由创建入口保证；pane 工作台不做跨 endpoint 聚合假设。

1. A semântica de `PaneBinding.workspaceScope` fica fixada no **workspace principal** (chave de roteamento da conexão); os
   caminhos auxiliares são atributos da sessão (entregues via projection/sessions-index) e não entram na camada de layout —
   quando isso existir, o `paneLayoutStore` não terá nenhuma mudança de schema.
2. O registro de conexões roteia pelo workspace principal (uma sessão entre workspaces continua sendo um agent com uma única
   conexão); não se deixa uma abertura de API para “agregação de conexões de múltiplos workspaces”.
3. A igualdade por workspaceKey serve apenas para atribuição/isolamento, nunca para deduzir “capacidade de caminho”; a
   apresentação na UI dos caminhos auxiliares é um incremento puramente visual.
4. A restrição de principal e auxiliares no mesmo endpoint é garantida pela entrada de criação; o workbench de panes não faz
   suposições de agregação entre endpoints.

协议扩展路径（届时 additive，不改既有字段）：`createSession` payload 加 `auxiliaryPaths?`；sessions-index item 透出主/辅关系。

Caminho de extensão do protocolo (aditivo, sem alterar campos existentes): o payload de `createSession` ganha
`auxiliaryPaths?`; o item do sessions-index expõe a relação entre principal e auxiliares.

## 协议面备忘（本期结论）

## Memorandos sobre o protocolo (conclusões desta fase)

- **零 schema 改动**。已补的实现缺口：CLI `v4-bridge.createSessionRecord` 的 `workspaceId` 从「一律当本地 workspacePath」升级为经远程 identity 对偶解析（`buildRemoteWorkspaceIdentity` 家族，不手写拼接）——远程 pane 里 draft 首发建会话的前置。
- `visibility: foreground/background` 订阅字段协议已预留、CLI 未消费；4 pane 同时流式若实测掉帧，再做 CLI flush 按 visibility 分级（additive）。
- conversation subscribe 无 `subscriberScope`（host 进程级单 connectionId + 每 topic 单订阅已收口）；仅当未来出现「同 session 多个独立订阅消费者」需要参照 sessions-index 增补。

- **Zero mudança de schema**. Lacuna de implementação já preenchida: o `workspaceId` de `v4-bridge.createSessionRecord` no CLI
  deixou de “tratar sempre como workspacePath local” e passou a ser resolvido pelo par de identidade remota (família
  `buildRemoteWorkspaceIdentity`, sem concatenação manual) — pré-requisito para criar sessão a partir do primeiro envio de
  um draft em um pane remoto.
- O campo de assinatura `visibility: foreground/background` já está reservado no protocolo e não é consumido pelo CLI; se
  4 panes com streaming simultâneo perderem frames na medição, faz-se o flush do CLI em níveis por visibility (aditivo).
- A assinatura de conversation não tem `subscriberScope` (connectionId único por processo no host + uma única assinatura por
  topic já resolve); só seria preciso complementar参照 o sessions-index caso surjam “vários consumidores independentes
  assinando a mesma sessão”.

## 实施改动面清单（按落地顺序）

## Lista de pontos de mudança da implementação (na ordem de entrega)

| # | 触点 | 改动 |
| --- | --- | --- |
| 1 | `packages/ui/src/v4/paneLayoutStore.ts` | 重写为 v2：二叉分割树 + `panes: Record<paneId, PaneBinding>` + 持久化 v2（`zcode-v4-pane-layout:v2`）与 v1 迁移；删除 `splitPaneForWorkspace` 可见性规则。新 pane id 取树内 `pane-<n>` 最大序号 +1（v1 迁移保留 `split` id） |
| 2 | `packages/ui/test/v4PaneLayoutStore.test.ts` | 单测重写：树操作/上限/塌缩/v1 迁移/focus 退化/持久化闭环 |
| 3 | `packages/ui/src/v4/workspaceConnectionRegistry.ts`（新建） | 引用计数 + 30s keep-warm + agentService 换代失效；模式对照 `sessionsIndexRegistry.ts` |
| 4 | `packages/ui/src/v4/V4ConversationContext.tsx` | 新增 `V4PaneConversationProvider`（注册表租约 + pane 级 `ServiceProvider` 包裹 + `isShellWorkspace` 走上下文 services）；原 `V4ConversationProvider` 保留给手机 `V4ChatPane` |
| 5 | `packages/ui/src/v4/V4WorkspaceChatArea.tsx` | 重写为递归分割树渲染；`SplitPaneDivider` 泛化（direction 感知 + per-node CSS 变量 `--v4-split-<nodeId>`，拖动仍 rAF 直写零渲染）；per-pane 恢复守卫组件化（`PaneRestoredGuard`） |
| 6 | `packages/ui/src/v4/SessionPane.tsx` | Esc-stop 与 add-to-chat 监听从「仅 primary」改为「focused pane」（06-ui 分屏规则 4）；新增拆分/关闭/徽标 props 透传 |
| 7 | `packages/ui/src/v4/ConversationHeader.tsx` | 「分屏/关闭分屏」改「向右拆分/向下拆分/关闭 pane」+ workspace 徽标（非 primary 且 ≠ shell 当前 workspace 时显示，远程加主机标识）；文案进 i18n 两语言 |
| 8 | `packages/ui/src/v4/workbenchSessionPlacement.ts` / `V4WorkspaceChatArea.tsx` / `app-shell/WorkspaceShellLayout.tsx` | 拖拽、右键分屏和普通点击共享 placement resolver/executor；入口只提供 intent、side、anchor 和完整 workspace scope，叶子达上限且目标无已有归属时禁用 |
| 9 | subagent child 详情 | 已迁移到 workspace 右侧 tabs，不再进入 split-pane workbench；普通 session「在分屏打开」保持不变 |
| 10 | `packages/ui/src/v4/index.ts` | 导出面更新（新旧转移函数/类型替换） |
| 11 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | `createSessionRecord` 的 `workspaceId` 经远程 identity 对偶解析（`buildRemoteWorkspaceIdentity` 家族），补单测——远程 pane draft 首发建会话的前置 |
| 12 | 历史三条 `conversation-session-v4-split*.test.ts` | 2026-07-13 因显式按钮下线而删除；Task 列表拖拽入口的回归覆盖仍需维护 |

| # | Ponto de toque | Mudança |
| --- | --- | --- |
| 1 | `packages/ui/src/v4/paneLayoutStore.ts` | Reescrito como v2: árvore de divisão binária + `panes: Record<paneId, PaneBinding>` + persistência v2 (`zcode-v4-pane-layout:v2`) e migração da v1; removida a regra de visibilidade de `splitPaneForWorkspace`. O novo pane id usa o maior `pane-<n>` da árvore +1 (a migração da v1 preserva o id `split`) |
| 2 | `packages/ui/test/v4PaneLayoutStore.test.ts` | Testes unitários reescritos: operações da árvore/limite/collapse/migração da v1/degradação do focus/fecho da persistência |
| 3 | `packages/ui/src/v4/workspaceConnectionRegistry.ts` (novo) | Contagem de referências + keep-warm de 30s + invalidação por troca de agentService;参照 o padrão de `sessionsIndexRegistry.ts` |
| 4 | `packages/ui/src/v4/V4ConversationContext.tsx` | Novo `V4PaneConversationProvider` (lease do registro + wrapper de `ServiceProvider` por pane + `isShellWorkspace` usando os services do contexto); o `V4ConversationProvider` original fica com o `V4ChatPane` do celular |
| 5 | `packages/ui/src/v4/V4WorkspaceChatArea.tsx` | Reescrito como renderização recursiva da árvore de divisão; `SplitPaneDivider` generalizado (sensível a direction + variável CSS por node `--v4-split-<nodeId>`, com o arraste ainda escrevendo direto em rAF, sem render); guard de restauração por pane componentizado (`PaneRestoredGuard`) |
| 6 | `packages/ui/src/v4/SessionPane.tsx` | As escutas de Esc-stop e add-to-chat passam de “somente primary” para “pane em foco” (regra 4 da tela dividida do 06-ui); novas props de divisão/fechamento/insígnia repassadas |
| 7 | `packages/ui/src/v4/ConversationHeader.tsx` | “分屏/关闭分屏” vira “向右拆分/向下拆分/关闭 pane” + insígnia de workspace (exibida quando não é primary e difere do workspace atual do shell, com identificação de host quando remoto); textos entram no i18n nos dois idiomas |
| 8 | `packages/ui/src/v4/workbenchSessionPlacement.ts` / `V4WorkspaceChatArea.tsx` / `app-shell/WorkspaceShellLayout.tsx` | Arraste, divisão por botão direito e clique normal compartilham o resolver/executor de placement; a entrada fornece apenas intent, side, anchor e o workspace scope completo, e é desabilitada quando o limite de folhas é atingido e o alvo não tem atribuição existente |
| 9 | Detalhes de subagent child | Já migrados para as tabs à direita do workspace e não entram mais no split-pane workbench; o “在分屏打开” da session comum permanece igual |
| 10 | `packages/ui/src/v4/index.ts` | Superfície de exports atualizada (substituição das antigas funções de transição/tipos) |
| 11 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | O `workspaceId` de `createSessionRecord` passa pela resolução pelo par de identidade remota (família `buildRemoteWorkspaceIdentity`), com testes unitários — pré-requisito para criar sessão a partir do primeiro envio de um draft em um pane remoto |
| 12 | Três `conversation-session-v4-split*.test.ts` antigos | Removidos em 2026-07-13 por causa da desativação dos botões explícitos; a cobertura de regressão da entrada de arraste da lista de Tasks ainda precisa ser mantida |

不动的面：`tabStore`（及其 ~46 个 `activeTabId` 消费者）、`splitPaneEntryContext` 闸门语义、手机 `/remote` 的 `V4ChatPane` 链路、`zcode-protocol-v4` schema、host/services 层（`processesByWorkspaceKey` 分桶已就绪）。

O que não muda: `tabStore` (e seus ~46 consumidores de `activeTabId`), a semântica do portão `splitPaneEntryContext`, a
cadeia `V4ChatPane` do `/remote` no celular, o schema `zcode-protocol-v4` e a camada host/services (o particionamento por
`processesByWorkspaceKey` já está pronto).

已核实的关键事实（实施时可直接依赖）：

Fatos-chave já verificados (a implementação pode depender diretamente deles):

- host 侧 `conversationFrameEmitters` / `processesByWorkspaceKey` 均按 workspaceKey 分桶，同窗口并发订阅 N 个 workspace 无单值假设；
- `remoteWorkspaceSessionStore` 已有 `sessionsById` 多连接 Map 与 `resolveRegisteredWorkspaceServices`；但远程目标断连时**必须**走 `useWorkspaceServices` 的断连代理路径，不得回落 base services；
- `sessionsIndexRegistry` 已按 `endpointKey + workspaceKey` 隔离，per-pane 恢复守卫可直接复用；
- e2e 既有契约：`v4-pane-shell-<paneId>`（`data-pane-id`/`data-focused`）、`v4-session-pane-<paneId>`、`TID_V4_SPLIT_OPEN/CLOSE/DIVIDER`、侧栏 `TID_V4_TASK_OPEN_IN_SPLIT`、localStorage key（v1→v2 需同步 helper 常量）。

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

## 验证基线

## Base de verificação

- 单测：paneLayoutStore v2 状态机（树操作/上限/塌缩/v1 迁移/focus 退化/持久化闭环）、workspaceConnectionRegistry（计数/keep-warm/service 换代/复用）。
- E2E（testid 契约）：`TID_V4_PANE_SHELL`/`TID_V4_SESSION_PANE` 动态后缀 paneId 不变；分隔条 `TID_V4_SPLIT_DIVIDER` 带 data-split-id；主流程（开分屏→draft 首发绑定→拖宽→刷新恢复→关闭）沿用既有三条 split e2e。
- 性能基线（06-ui）：4 pane 同时流式输出交互不掉帧。
- 待补验证项：远程 pane 真机 SSH 回归（断连占位/重连恢复/远程 draft 建会话）。

- Testes unitários: máquina de estados do paneLayoutStore v2 (operações da árvore/limite/collapse/migração da v1/degradação
  do focus/fecho da persistência) e workspaceConnectionRegistry (contagem/keep-warm/troca de service/uso compartilhado).
- E2E (contratos de testid): os sufixos dinâmicos de paneId de `TID_V4_PANE_SHELL`/`TID_V4_SESSION_PANE` permanecem
  iguais; o divisor `TID_V4_SPLIT_DIVIDER` carrega data-split-id; o fluxo principal (abrir divisão → binding pelo primeiro
  envio do draft → arrastar a largura → restaurar após refresh → fechar) reaproveita os três e2e de split já existentes.
- Base de performance (06-ui): 4 panes com saída em streaming simultânea não perdem frames na interação.
- Verificações ainda pendentes: regressão SSH real de pane remoto (placeholder de desconexão/recuperação após reconexão/criação
  de sessão a partir de draft remoto).

<!-- pt-BR -->
