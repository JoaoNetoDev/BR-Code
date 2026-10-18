# Inconsistência de status de tarefa no WSL：análise de causa raiz e plano de correção

Data：2026-08-21（T1／T2）、2026-09-04（T3） ｜ Status：análise e correção concluídas ｜ Branch：`fix/wsl-status`

## Sintomas relatados pelo usuário

Ao conectar um projeto no WSL, o estado de execução da tarefa na barra lateral de tarefas e na área de chat permanecia inconsistente, e os dois sentidos ocorreram：

- Sintoma①：a lista de tarefas fica carregando（loading）, enquanto a tarefa na área de chat já terminou；
- Sintoma②：a lista de tarefas não fica carregando, enquanto a tarefa na área de chat ainda está em andamento.

Ambiente do incidente：ZCode 3.9.0（commit cb07e825、Windows 11、production）, workspace `remote:wsl:default:/home/dev`.
Material de evidência：bundle de logs do usuário `zcode-logs-20260821-202010-wsl-status`（com 4 dias de logs do desktop, logs da CLI do lado Windows e tasks-index.sqlite）.

## Conclusão

**probable（o mecanismo da causa raiz foi confirmado）**. A barra lateral de tarefas e a área de chat vêm de **duas cadeias de assinatura independentes** sobre o mesmo estado autoritativo da CLI
（topic sessions-index vs topic conversation）, e a bifurcação acontece nas camadas de portão de publicação／transporte／recuperação,
tornando-se uma inconsistência persistente graças a dois bugs de implementação que violam «invariantes já declarados»：

1. **Lado do consumo（T1）**：o `SessionsIndexStore` do renderer, ao entrar em `status="error"`, mantém a projeção antiga,
   os consumidores não verificam o status e o `error` é um estado terminal sem autocura — o antigo `phase=running`, sem prova viva, continua renderizando o spinner;
   depois que a assinatura morre, as quadros de running de novos turnos também nunca chegam.
2. **Lado autoritativo（T2）**：o gateway da CLI descarta silenciosamente as migrações de phase na janela sem assinantes por meio do portão `hasSubscribers()`,
   e, ao ressinar, quando encontra um publisher já existente, não reproduz a semente da projeção viva — depois disso, qualquer subscribe／resync
   obtém um snapshot cujo phase fica no valor antigo.

A área de chat não tem esses dois defeitos（o conversation store é reconstruído do zero a cada abertura de sessão; a hydration força um turn não fechado
a ser sintetizado como `TurnComplete(cancelled)`）, então as duas surfaces divergiram. O cenário WSL dispara a condição de entrada com alta frequência: no dia do incidente o WSL Agent CLI foi substituído 3 vezes（ao reabrir o workspace o usuário mata o processo na força）, a assinatura de sessions-index oscilou por 7 rodadas（19:33–19:36）e a ponte SSH do mesmo stack de transporte teve 1 ECONNRESET.

O único motivo de classificar como probable em vez de confirmed é que, na build de produção, todos os logs do renderer são no-op
（`packages/ui/src/logger.ts:38`）, então a sequência de estados dos dois stores no momento da captura não pode ser reproduzida.

## Invariantes violados（todos já declarados em código／spec）

- «O loading da lista de tarefas precisa ser explicitamente provado pelo runtime atual»
  （comentário em `packages/ui/src/lib/taskListItemPresentation.ts:28`; comentário do branch dormant em `packages/ui/src/v4/sessionsIndexStore.ts:585`）.
- «Restaurar por snapshot após desconexão／a assinatura a frio sobrescreve com a projeção viva atualmente registrada»
  （`docs/v4-refactor/14-sessions-index.md:15,54`）.
- «Quando o runtime da CLI reinicia, os listeners existentes recebem o sinal de restart e cada store ativo faz exatamente um full re-subscribe»
  （`docs/v4-refactor/04-sync-and-recovery.md:204,215-216`）.

## Cadeia causal e ordem dos eventos

```
触发：WSL 桥抖动 / 用户重开 WSL 工作区（CLI 换代）
   │
   ▼
T1（消费侧）：resync/recovery 在抖动窗口失败
   → failRecovery() 只置 status="error"，不清投影、不重试
     （sessionsIndexStore.ts:522-527；resync 失败同 :459-468；
      handleFrame 永不把 status 改回 live）
   → 旧 phase=running 无 live 证明却继续存在
   │
T2（权威侧）：无订阅者窗口内 TurnStarted/TurnComplete 被门禁丢弃
     （v4-gateway.ts:816），重订阅走 existing 分支不重放 live 种子
     （v4-gateway.ts:932-940）
   → 之后任何 snapshot 停留旧 phase
   │
   ▼
下游症状：useWorkspaceSessionsIndexItems 无条件消费 store.getSessions()
     （useWorkspaceSessionsIndexItems.ts:177-191，不查 status）
   → 陈旧 running → 转圈（症状①）；订阅已死则新 running 不可见（症状②）；
     聊天区经独立 conversation 订阅 + hydration 自愈显示真值 → 持续不一致
```

```
当前：
CLI(WSL)              renderer sessionsIndexStore           任务列表      聊天区
  │ TurnStarted ──▶     live, phase=running                  转圈 ●       流式中
  ✕ 桥抖动/换代: resync 失败 / recovery 超时
  │                     failRecovery → status=error
  │                     （保留旧 running，无重试）             转圈 ●(陈旧)
  │ TurnComplete ──▶ (订阅已死或门禁丢弃，帧不达)
  │                     error=终态，永不收敛                   转圈 ●(永久)  已结束 ←→ 不一致

修复后：
  ✕ 同样的失败
  │                     failRecovery → status=error + 清空投影  无转圈（不宣称无证明状态）
  │                     有界退避 fresh subscribe（forceSnapshot）
  │  ◀── subscribe ──   snapshot = 权威当前值（R-B 保证归约态新鲜）
  │                     status=live, phase=真值                与聊天区一致 ✓
```

## Cadeia de eventos nos logs do incidente（hora local UTC+8、2026-08-21）

```
17:35:22  连接 WSL(target=wsl:Ubuntu:dev) → WSL 内 remote host pid 1061
17:35:42  Agent CLI gen1 启动 (pid 1094)
18:05:48  [同传输栈 SSH 连接] read ECONNRESET（桥式连接确实会断，log:15098）
18:53:23  用户重开 WSL 工作区 → gen1 被杀 (log:25108) → 18:53:34 gen2 (pid 15160)
19:32:20  再次重开 → gen2 被杀，turn 未收口 (log:28225)
          → 持久化状态停留 running+activeTurnId（分叉温床）
19:32:33  gen3 启动 (pid 15402)
19:33:24  sess_5f6c01d1 readSession 快照 = sessionStatus:'running',
          activeTurnId:turn_60441ab9 残留实锤 (log:28667,28673,28677)
19:33-19:36  sessions-index 订阅抖动 7 轮（subscribe→数秒后 unsubscribe 循环）
19:48-19:53  app 整体重启
20:19:52  第 5 次连接 WSL (log:35050) → 20:20:02 remote host(818) + agent 再换代
20:19:58  用户导出日志（bundle 截止 20:20:10）
```

Script de sinais vermelhos（asserções somente leitura, CONFIRMED de forma consistente em duas execuções consecutivas）：
`A1(agent gen2 退出)=1  A2(gen3 启动)=1  A3(running+activeTurn 残留快照)=1  B(renderer 日志行)=0  C(远程桥断连)=1  D(WSL 手动重连)=5`

## Índice de evidências principais

| #   | Fato                                                                                   | Local                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | O spinner da lista só confia no phase em tempo real do sessions-index e não confia no status persistido | `packages/ui/src/v4/taskListRowActivity.ts:35`、`packages/ui/src/lib/taskListItemPresentation.ts:24` |
| 2   | O estado de error mantém a projeção antiga e não tem saída; apenas o branch dormant limpa corretamente | `packages/ui/src/v4/sessionsIndexStore.ts:522-527,459-468`（comparar com :585-590） |
| 3   | O consumidor não consulta o status e error fica de fora do hydrating                     | `packages/ui/src/v4/useWorkspaceSessionsIndexItems.ts:85-91,177-191`                                 |
| 4   | O store é um objeto de longa duração em nível de workspace; trocar de tab ou fechar o painel não o reconstrói, e o error travado não tem salvação por parte do usuário | `packages/ui/src/v4/sessionsIndexRegistry.ts:88-142` |
| 5   | Portão de sem assinantes na CLI + publisher existente não reproduz a semente             | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:816,932-960`                  |
| 6   | `flushIndex` é naturalmente no-op para assinaturas vazias e o deltaLog é limitado（seguro para remover o portão） | `v4-gateway.ts:845-850`、`sessions-index-publisher.ts:93-99` |
| 7   | sessions-index é uma projeção estreita a jusante da projeção de conversation（as duas surfaces têm a mesma origem） | `v4-gateway.ts:817-822` |
| 8   | A semente de cold start é incondicionalmente completedSuccess（não publica running）      | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts:1239-1250`                        |
| 9   | A hydration sintetiza o fechamento do turn não finalizado como cancelled（autocura da área de chat） | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts:786-788` |
| 10  | O lifecycle／restart remoto é repassado implicitamente por um RPC de dois saltos, sem relay explícito; o RepoWiki já tem antecedente de falha | `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts:173,300-307` |
| 11  | A troca do lado conversation passa por ReplaceableConversationTransport.replace(), e toda abertura de sessão é construída do zero | `packages/ui/src/v4/workspaceConnectionRegistry.ts:167-189` |
| 12  | Todos os logs do renderer são no-op na build de produção（o maior ponto cego desta investigação） | `packages/ui/src/logger.ts:38-41` |

## Causas candidatas já descartadas

- A CLI publica o running persistido como está no cold start → contra-prova：a semente a frio força `completedSuccess`（v4-bridge.ts:1239）.
- Resíduo de `status=running` no sqlite tasks-index causa diretamente o spinner → contra-prova：a UI explicitamente não confia no status persistido.
- As duas surfaces já são duas máquinas de estado do lado da CLI → contra-prova：sessions-index é uma projeção a jusante do snapshot de conversation.
- Diferença de debounce de 30–150ms nas quadros de conversation → é de escala subsegundo, não explica uma inconsistência persistente e capturável em screenshot.
- Interferência da cadeia de controle remoto do celular → a captura é do desktop, e os logs do web-remote bridge apontam todos para o workspace local test-00x.
- Eventos de lifecycle remoto não são repassados de forma alguma → contra-prova：o canal de attachment per-remote-session e o branch de descoberta tardia do ProxyChannel conseguem repassar（`packages/rpc/src/proxy-channel.ts:64-80`）, e o próprio Local Host consumiu o remote lifecycle（`zcodeAgentConnectionScope.ts:627-645`）. A confiabilidade não é coberta por e2e e fica como item posterior.

## Correção recomendada（mudança mínima e coerente, dois pontos complementares, ambos correções de causa raiz）

### R-A：`packages/ui/src/v4/sessionsIndexStore.ts` —— restaurar «loading precisa de prova viva + convergência final»

1. `failRecovery`, o branch de falha de resync e o branch de falha não transitória de `connect`：ao entrar em `error`, limpar a projeção de forma consistente com `dormant`
   （`this.state = EMPTY_SESSIONS_INDEX_STATE; this.cachedList = null`）.
2. `error` deixa de ser terminal: depois de entrar nele, disparar automaticamente um fresh
   `connect(transport, { forceSnapshot: true })` com backoff limitado（por exemplo, ciclo com teto de 5s／15s／60s）; ao esbarrar em um erro de runtime-unavailable, seguir pelo branch existente
   para `dormant`（evitando tempestade de reconexão; o dormant é acordado pelo lifecycle available）.

### R-B：`apps/zcode-cli/.../v4-gateway.ts` `publishCurrentSummaryToIndex` —— restaurar «fidelidade do estado reduzido»

- Remover `!indexPublisher.hasSubscribers()` da condição de early return（mantendo `!indexPublisher`）;
  o `flushIndex` é naturalmente no-op para um conjunto de assinantes vazio, e a semântica de quadros／contabilização de seq／schema permanece inalterada.
  A partir daí, qualquer snapshot de subscribe／resync reflete o phase autoritativo atual.

### R-C（defesa em profundidade, fortemente recomendado mas fora da correção deste sintoma）

- O `logger.ts` do renderer, na build de produção, deve pelo menos deixar `warn/error` passarem e serem persistidos via bridge — foi o maior ponto cego desta investigação
  e também é pré-requisito para verificar o efeito da correção e elevar probable para confirmed.

### Decisões de arquitetura necessárias（sem decisão própria, independentes desta correção）

- O repasse de eventos remotos de dois saltos não tem contrato explícito de relay（o RepoWiki já tem antecedente）：recomenda-se adicionar asserções e2e de lifecycle entre pontes.
- sessions-index não tem keepalive／quadro de verificação de marca d'água: depois que R-A e R-B forem aplicados, o valor incremental é limitado e pode ser adiado.
- O descarte duro de workspace por workspace-dispose deixa resíduo persistido de running+activeTurnId: a hydration da área de chat já fecha o turn e a semente a frio já é completedSuccess, então é uma melhoria de higiene e não a causa raiz deste sintoma.

## Prova de eliminação da causa raiz（gate de suficiência da correção）

1. Transições produtoras de causa eliminadas：T1 = «após a falha de recuperação, o store fica em um estado terminal sem autocura carregando o running antigo»
   （R-A a torna impossível de novo ocorrer:：sem prova, limpa; e sempre há retry）；T2 = «a migração de phase na janela sem assinantes está permanentemente ausente do estado reduzido»
   （R-B faz o estado reduzido seguir a projeção viva sem condição）.
2. O invariante volta a ser verdadeiro antes de qualquer execução de recuperação／fallback：R-A limpa no mesmo caminho síncrono em que entra em error（antes do retry）;
   R-B corrige no ponto de ingest do evento（antes de qualquer leitura por assinatura／resync）.
3. Continua valendo mesmo se as novas retentativas forem desligadas：apenas R-A já elimina «running obsoleto com spinner»; apenas R-B já faz com que qualquer snapshot seja o valor real da hora.
4. Não se transforma uma falha visível em corrupção silenciosa：`status=error` continua observável; a limpeza apenas revoga a «declaração de running sem prova»,
   e as linhas persistentes de tarefa continuam sendo exibidas pelo tasks-index, sem perder linhas.
5. Só a combinação dos dois é completa：corrigir apenas R-A pode fazer o retry obter um snapshot obsoleto（cenário de T2）; corrigir apenas R-B deixa o error terminal
   travado e o rendering do running antigo（cenário de T1）.

## Avaliação de risco

- Zero mudança em protocolo、schema、formato de persistência e contrato público de RPC; as duas mudanças são independentes entre si e podem ser revertidas separadamente.
- R-A apenas endurece o branch `error` e adiciona retry com backoff; os caminhos `live/connecting/dormant` não são tocados; uma falha de retry cai no branch dormant existente, sem tempestade.
- A única diferença de comportamento de R-B é que, sem assinantes, o estado reduzido avança normalmente: o custo de CPU é uma comparação do nível de summariesEqual（ModelStreaming já excluído）,
  a memória é limitada pelo teto de `maxDeltaLog`; o host syncer e ocadeia do celular se beneficiam igualmente.
- O limite entre continuous do desktop e replayable do celular não é tocado（não altera semântica de stream／snapshot／fila）.

## Plano de verificação（escrever o teste primeiro, depois mudar o código）

1. Teste de regressão 1（tem de falhar antes da correção）：`packages/ui/test/sessionsIndexStore.test.ts`
   —— store live com `phase=running` → injetar recovery fail-closed → afirmar que a projeção foi limpa e não há running;
   avançar o fake timer → afirmar que, após o sucesso do fresh subscribe automático, `status=live` e a projeção é o novo snapshot.
2. Teste de regressão 2（tem de falhar antes da correção）：`apps/zcode-cli/packages/bootstrap/tests/v4-gateway-sessions-index.test.ts`
   —— primeira assinatura → desassinar tudo → injetar TurnStarted+TurnComplete na janela sem assinantes → ressinar
   → afirmar que o phase do snapshot é o valor real atual e não o valor antigo de antes da janela.
3. Teste de invariantes：enumeração completa dos caminhos de entrada em error（failRecovery／falha de resync／falha não transitória de connect）não deixam
   sessions para trás; o ingest sem assinantes não emite quadros e o deltaLog não ultrapassa o limite.
4. Testes adjacentes：branch de autocura `notOwned`, despertar dormant→available e retry que esbarra em runtime-unavailable indo para dormant
   sem ciclo.
5. Portões：`pnpm typecheck`、`pnpm lint`、`pnpm test:unit:affected`。
6. Reprodução em runtime（tem de ficar verde após a correção）：conectar no WSL → enviar uma tarefa longa → reabrir o workspace durante a execução（reproduz a sequência de troca das 19:32）
   → afirmar que em até 30s o spinner da lista converge com a área de chat; depois que R-C for persistido, afirmar nos logs que o store converge pelo fresh subscribe
   e não pelo caminho de fallback.

## Riscos restantes e materiais posteriores

- O estado interno do cliente no momento da captura não pode ser reproduzido（sem logs do renderer）, então a classificação é probable; com R-C aplicado o ciclo fecha.
- Na próxima reprodução, pedir ao usuário que exporte também `~/.zcode/cli/log` de dentro do WSL（o bundle atual contém apenas logs da CLI do lado Windows）.
- A confiabilidade do repasse implícito de eventos remotos de dois saltos não é coberta por e2e e é acompanhada separadamente.

## Registro da implementação da correção

Esta verificação confirma que R-A／R-B são consistentes com a implementação atual e com o fenômeno de regressão, e as seguintes correções foram acrescentadas：

- O `SessionsIndexStore` limpa imediatamente a projeção de sessions-index quando a recovery ou uma assinatura não transitória falha, revogando o estado
  `running` sem prova viva; em seguida dispara um fresh subscribe com `forceSnapshot` e backoff limitado com teto de 5s／15s／60s. O runtime-unavailable continua indo para
  `dormant` e não inicia polling.
- `ConversationV4Gateway.publishCurrentSummaryToIndex` remove o early return de `hasSubscribers()`. Sem assinantes, o
  `SessionsIndexPublisher` ainda reduz e contabiliza, e o `flushIndex` é naturalmente no-op; com isso, o snapshot do próximo subscribe／resync
  reflete o phase atual dentro da janela.

Cobertura dos testes de regressão：

- `packages/ui/test/sessionsIndexStore.test.ts`：limpeza por recovery fail-closed e fresh subscribe, e backoff de 5s／15s para assinatura não transitária.
- `apps/zcode-cli/packages/bootstrap/tests/v4-gateway-sessions-index.test.ts`：após `TurnStarted` na janela sem assinantes, o snapshot do ressubscribe retorna `phase=running`.

R-C（deixar `warn/error` passarem no renderer de produção）e o e2e de lifecycle remoto continuam itens posteriores independentes e não foram alterados nesta rodada.

## Registro da revisão da correção（2026-08-21、commit revisado `41ef87616e`）

Conclusão：**a direção da correção está correta e a qualidade de implementação é alta, pode ser mantida; foi encontrada 1 omissão da mesma natureza, já completada na correção seguinte.**

### Verificado como correto

- **R-B**（`v4-gateway.ts` `publishCurrentSummaryToIndex`）：consistente com o plano, apenas remove
  o portão `hasSubscribers()` e mantém o early return `!indexPublisher`; o `flushIndex` é naturalmente no-op para assinaturas vazias e o
  deltaLog é limitado（o `record()` em `sessions-index-publisher.ts` trunca com shift por `maxDeltaLog`）, então a mudança é segura.
- **R-A**（`sessionsIndexStore.ts`）：implementação mais detalhada que o plano, com todos os pontos de corrida verificados um a um：
  - `failAndScheduleRecovery` limpa a projeção + coloca em error + tenta cancelar a assinatura antiga no besten Effort + retry em ciclo com teto de 5s／15s／60s;
    o callback de retry tem as três guardas `closed / referência de transport / generation`, e qualquer connect／replaceTransport／troca de geração externo invalida o timer antigo；
  - depois da limpeza, `subscriptionId = null`, de modo que o `handleFrame` naturalmente rejeita quadros atrasados de assinatura morta, sem estado intermediário de «error atraindo quadros»；
  - a cadeia de retry transporta `errorRecoveryRetryAttempt` de forma encadeada e só um connect externo reseta a contagem,
    e assim as duas séries de backoff（retry transitório como EBUSY） não se atrapalham；
  - o novo desvio para runtime-unavailable dentro das falhas de connect／resync segue unificado por `handleRuntimeUnavailable()`
    indo para dormant（sem girar à toa sobre um runtime já morto）, e de passagem corrigiu o resíduo implícito original «connect falhou e foi para dormant, mas não limpou a projeção»；
  - os caminhos existentes de `notOwned`, de despertar dormant→available e de backoff de restart não foram quebrados.

### Prova de não regressão（vermelho → verde）

- Verificação vermelha：no código do commit pai `dc810f6df8`, rodando apenas os novos testes —
  2 novos casos de `sessionsIndexStore.test.ts` falham e 1 novo caso de `v4-gateway-sessions-index.test.ts`
  falha（os testes novos realmente pegam o defeito original）.
- Verificação verde：com o código da correção, os dois arquivos ficam todos verdes（28 + 16 passando）.
- Portões：`pnpm typecheck` da raiz passou; `pnpm lint` com 0 erros（39 warnings, nenhum envolvendo os arquivos alterados nesta rodada）.
  O `tsc --noEmit`local de `apps/zcode-cli/packages/bootstrap` tem 3 erros de estoque／ambiente
  （`product-projection.ts:2457`、`workspace-model-catalog.ts:22-23`）, todos fora dos arquivos alterados nesta rodada,
  e devem ser reconferidos pelo CI.

### Omissão（já corrigida）

- O caminho de exclusão de sessão de `cleanupSessionRuntime` em `v4-gateway.ts`（na revisão, em :1927）ainda mantinha o portão equivalente：
  `if (indexPublisher?.hasSubscribers() && indexPublisher.removeSession(sessionId))`.
  Esse é outro ponto de escrita do invariante «fidelidade do estado reduzido»: uma sessão excluída na janela sem assinantes não executa `removeSession`,
  e sobra resíduo no estado reduzido → no snapshot do ressubscribe a tarefa excluída «renasce»（podendo ainda exibir spinner com o antigo phase=running）.
  O `hasSubscribers() &&` foi removido da mesma forma que em R-B, e foi acrescentado um teste de regressão de que, após o cleanup dentro da janela de
  desassinatura, o snapshot do ressubscribe não contém aquela session.
- O `hasConversationSubscribers` em :1898 do mesmo arquivo é o julgamento de coleta de residência do lado conversation e não tem relação com esta correção; foi excluído.

### Outras observações（não bloqueiam）

- R-C não foi implementado：o ciclo de observação «probable → confirmed» em produção ainda não foi estabelecido, e na reprodução continua impossível ver as transições de estado do store.
- O teste de dormant já existente cobre indiretamente, pela pré-configuração de um running obsoleto, a limpeza na primeira entrada em dormant; nenhuma mudança adicional de comportamento de produção foi acrescentada.

> Todo103：abaixo permanece a investigação histórica e as decisões do T3 de staging; as evidências desta rodada são registradas à parte em um livro-razão consolidado, e a validação histórica não é tratada como aprovação desta rodada.

## Segundo incidente（2026-09-04、ZCode 3.11.1）：Settings cobrindo o workspace remoto tomba a assinatura de sessions-index da barra lateral（T3）

### Sintomas e classificação

O mesmo usuário voltou a relatar na 3.11.1（commit 87a07145）que «a barra lateral de tarefas fica carregando e a área de chat já concluiu», desta vez apenas com o sintoma① e afetando
uma única tarefa. Classificado como **confirmed**：logs do desktop no Windows + logs da CLI do lado WSL + o caminho de código convergem nos três lados. R-A／R-B já foram aplicados,
mas eles cobrem apenas as duas classes de falha «com error» e «portão sem assinantes»; desta vez é o terceiro mecanismo **T3: a assinatura é silenciosamente substituída**, sem produzir
nenhum error ao longo do caminho, então a cadeia de retry com backoff do R-A nem chega a ser disparada.

### Cadeia causal

```
远程 workspace（remote:wsl:default:root:/root/src/plancov，remoteSessionId df0312a2…）激活态下打开 Settings tab
  → Root.resolveRootWorkspaceShellTarget 走 fallback：identity 保留，workspaceRemoteSessionId=undefined
    （packages/ui/src/root/rootWorkspaceShellTarget.ts，提交 a38a37f862 只补了 identity）
  → App.useWorkspaceTerminalTaskNotifications 的 scope 无 endpointKey
    → sessionsIndexRegistry 键 "__base__\0<identity>" ≠ 侧栏 useWorkspaceTaskLists 的 "<remoteSessionId>\0<identity>"
    → 新建第二个 SessionsIndexStore + transport，对同一 topic 再发 subscribeSessionsIndexV4
  → 两条订阅经同一 host-rpc facade / relay facade 到 CLI 时 connectionId 相同
    → SessionsIndexPublisher.subscribeReserved "每连接单订阅"：侧栏那条订阅被删除，无任何信号
  → 关闭 Settings → 通知 hook 的 store 退订 → 该 attachment 上该 topic 订阅归零
  → 侧栏 store 仍 status=live，永远收不到帧：冻结瞬间正在跑的任务永久转圈、时间停在打开设置页那一刻；
    之后新建的任务在 store 里不存在，行退回 tasks-index → 运行中不转圈、待输入无徽标
```

Âncoras nos logs do incidente（hora local UTC+8）：12:50:41 assinatura da barra lateral de plancov（583ms）；12:50:54 a tarefa EDGES continua rodando;
**12:51:03 abertura de Settings → segunda subscribe（11ms、ida e volta remota）**; 12:51:53 fechamento de Settings → unsubscribe remoto;
depois, quatro aberturas e fechamentos iguais às 12:56／13:39／14:04／14:32; 15:36:56 CLI `turn.completed` e o syncer remoto transmitindo o estado terminal
（o tasks-index já escreveu completed, e o usuário marcou como lido antes de abrir a task）; ≈16:21 a captura ainda mostra running na barra lateral com «3 horas»
（lastActivityAt congelado em ≈12:51). Os logs da CLI do WSL confirmam um único processo, uma única chave de workspace e nenhuma reinicialização de agent, o que descarta uma projeção da CLI parada de atualizar.

### Correção（root-cause repair, mudança mínima e coerente）

- `packages/ui/src/root/rootWorkspaceShellTarget.ts`：`resolveRootWorkspaceShellTarget` recebe um novo parâmetro `workspaceTabs`;
  quando Settings cobre a tela, ele recupera pela `workspaceKey` o workspace tab coberto e preenche de volta o `remoteSessionId` dele, deixando o alvo do shell
  completamente consistente com o estado de ativação do tab. Quando o tab não está conectado ou já foi fechado, mantém `undefined`（mesma semântica do estado de ativação）.
- `packages/ui/src/Root.tsx`：o ponto de chamada passa todos os workspace tabs da janela（aproveitando o memo existente, renomeado para `windowWorkspaceTabs`）.
- Registro, facade, publisher da CLI e regras de exibição da UI não foram alterados: o hook de notificações e a barra lateral obtêm a mesma chave de registro no modo Settings,
  e o `acquireSessionsIndex` segue o branch de `refCount++`, de modo que a segunda assinatura não nasce mais na origem.

### Prova de eliminação da causa raiz

1. Conversão eliminada：o alvo do shell emitia uma identidade incompleta quando Settings cobria a tela（identity presente, remoteSessionId ausente）.
2. O invariante vale antes de qualquer lógica de recuperação：o acquire já acerta a mesma entrada, e a instrução de substituição da CLI nunca é executada.
3. Não depende de fallback：mesmo que o retry do R-A, o heartbeat e as regras de cobertura da UI não existissem, o cenário original deixa de ocorrer.
4. Não introduz corrupção silenciosa：fechar Settings é apenas um decremento de refCount, e a assinatura da barra lateral continua viva.

### Testes

- `packages/ui/test/rootWorkspaceShellTarget.test.ts`：corrige o caso original（ele havia fixado `workspaceRemoteSessionId: undefined` como expectativa）e acrescenta quatro casos: correspondência por identity、tab não conectado、tab já fechado e tab local. Antes da correção, 2 vermelhos.
- `packages/ui/test/rootSettingsSessionsIndexSubscription.test.ts`：mock da semântica de substituição do CLI em conexão única; o scope da barra lateral +
  o scope de notificações resolvido pelo Root produzem apenas 1 subscribe; depois de fechar Settings, a barra lateral ainda recebe running→completedSuccess. Antes da correção, vermelho
  （a assinatura do segundo store era `six-2`, e `six-1` era substituída）.
- e2e `SSH-P0-TASK-03`（pending、`manual-review/pending/conversation-session-ssh-remote-settings-overlay-sidebar-status.test.ts`）：
  resposta do envio subsequente com atraso de 15s, abre e fecha a página de configurações durante a execução e afirma que a barra lateral primeiro fica carregando e depois converge; a verificação de contrato do fixture passou, aguardando uma execução real por SSH.

### Fora desta correção（não faz parte da correção deste sintoma e exige decisão separada）

- D1 observação（já implementada, commit independente）：a entrada de `acquireSessionsIndex` procura, pela identidade do objeto agentService, a qual sessão remota ele pertence
  （`findRemoteWorkspaceSessionIdForAgentService`）e, quando o `endpointKey` do scope（default `__base__`）é inconsistente com isso, persiste com `logger.lifecycle.warn` o
  `v4.sessions_index.scope_endpoint_mismatch`（com endpointKey／remoteSessionId／workspaceKey／workspacePath）, registrando apenas uma linha por scope. Apenas registra, não muda chave nem assinatura — nos logs de produção deste incidente não havia nenhuma
  rastro do renderer, e só era possível deduzir pela impressão digital do RPC（`system.listIntegratedTerminalShells` ±3s）; esse log expõe a inconsistência de chaves
  diretamente nos logs do usuário. Teste：`packages/ui/test/sessionsIndexRegistryEndpointMismatch.test.ts`.
- D2 decisão de design：o «uma única assinatura por conexão na CLI, substituição sem notificação»（10 §3.1）+ o facade de attachment com connectionId unificado fazem com que qualquer segunda assinatura
  que contorne o registro possa matar silenciosamente a primeira; a premissa de que o keepalive pode ser adiado (a falha se manifestaria como error) foi refutada.
  Candidatos：a CLI envia um fault `subscription.replaced` para a conexão da assinatura antiga quando substitui（podendo ser ligado diretamente ao error→fresh subscribe do R-A）,
  ou o facade notifica o owner antigo quando `remember()` expulsa uma owned entry.
- D3 mitigação（não recomendada）：fazer as linhas do tasks-index que foram atualizadas e já estão em estado terminal sobrescreverem a atividade de running obsoleta;
  isso esconderia o sintoma e iria na direção oposta de «loading deve ser provado pelo runtime».
- Descoberta incidental（aberta como ticket separado）：14:50:36–14:51:38, doze `zcode-agent.createSession FAIL`, com a chave do workspace local roteada para o serviço remoto do WSL.