# Bots E2E Coverage Matrix

## Promoção de MN-01 / MN-03 (2026-10-08)

O usuário confirmou a promoção dos 4 casos Feishu/Lark × grupo/tópico, com entrada formal em
`bots/feishu-channel-mention.test.ts`. Reutiliza-se o contrato synthetic／fast-text do domínio de Bot
`fixtures/bots/feishu-channel-mention.json`, cobrindo menção nativa, correspondência por conteúdo,
múltiplos alvos, esclarecimento com zero envio, idempotência e o callback nativo de @ em grupo comum.
Sem requisições reais de modelo; o HTTP de plataforma é registrado e asseverado dentro do case; não
se promove um ambiente sintético a equivalente de um tenant real ou de validação em celular. O dry-run
genérico de promoção só suporta conversation-session, então a migração segue a convenção de diretório
formal de Bot existente e corrige o caminho do helper. O WDIO Desktop padrão é a entrada formal e
nenhum Docker admission foi adicionado.
Verificação: o replay isolado apenas-common `desktop-e2e-20261008-102803-871` e o replay padrão
`desktop-e2e-20261008-102907-909` deram 4 passing; sem toggle de manual-review.
O typecheck raiz, o typecheck de E2E, o lint（67 warnings existentes）、a verificação de arquitetura e a
verificação de formatação do diff passaram.
O primeiro skip-build não iniciou os testes porque o build de desenvolvimento comum não tinha o toggle
de teste; após reconstruir, os dois replays acima passaram.

## Correção do recebimento de eventos de robô (2026-10-08)

O callback de recebimento com sender_type=bot（normalizado internamente como app）; as APIs históricas
mantêm app. Um grupo comum precisa já estar habilitado e com @ nativo; tópicos já integrados continuam
processando todas as mensagens de bot realmente enviadas pela plataforma; eco próprio, eventos
duplicados, grupo não habilitado e tópico já abandonado são todos bloqueados.
Mensagens slash／de seleção de bot no chat principal e em tópicos contam apenas como mensagens e não
entram na distribuição de comandos.

- 205 testes unitários de Provider／serviço de grupo／mention gate passaram; os testes de arquivo falharam
  inicialmente no sandbox, e passaram após ser permitido o diretório temporário de teste já existente.
- `desktop-e2e-20261008-095311-834`: 2 regressões reais de CLI em tópico passaram; o evento nativo de bot
  acionou o encerramento da rodada antiga, a continuação e a resposta.
- `desktop-e2e-20261008-095707-065`: 4 regressões Feishu/Lark × grupo/tópico passaram; callback de bot em
  grupo comum, corpo de comando e deduplicação passaram.
  A primeira verificação de callback de grupo recém-adicionada falhou porque o substituto de teste omitia as
  respostas de identidade bot／v3／info; passou após o preenchimento.
- O typecheck raiz, o typecheck de E2E, o lint（67 warnings existentes）、os gates de arquitetura e o
  fixture checker de tópicos passaram.
- Plataforma e rede de modelo são substitutos; a permissão de eventos de bot em tenant real e a notificação
  ao vivo ainda precisam ser verificadas. A mensagem de habilitação de grupo já complementou a explicação da
  permissão include_bot.
- Não foram alterados o desktop continuous, o celular replayable, o isolamento de identidade de workspace
  remoto, o owner de entrega ou a fila de entrada; celular e Windows／Linux não foram testados.


## MN-03 resolvendo menções nativas por nome (2026-10-08)

A busca por conteúdo foi atualizada: um único candidato por conteúdo ou um único casamento de nome completo
envia direto, e todos os nomes não resolvidos são retornados juntos.
Nesta rodada 147 testes unitários passaram; os 4 casos Feishu/Lark × grupo／tópico de
`desktop-e2e-20261008-093912-272` passaram, validando apelido, múltiplos alvos com at nativo e múltiplos
itens com falha com zero envio. Typecheck raiz／CLI, typecheck de E2E, lint raiz e verificação de arquitetura
passaram; o lint completo da CLI foi bloqueado por um erro de max-lines em um arquivo de telemetry não
alterado, e o lint isolado dos arquivos da CLI alterados passou. A spec pending de Bot não é suportada pelo
fixture checker genérico e, na época, usava o fixture sintético de Bot existente com replay explícito, ainda
não promovida; agora foi promovida, ver o topo deste documento.
O nome completo em inglês e o separador para várias pessoas foram adicionados à dica da ferramenta; a
resolução de linguagem natural por modelo real e o tenant real ainda aguardam teste real.

- Implementado: a consulta mentionName do `ReplyToChannel`, envio com casamento único, candidatos homônimos e
  a escolha do usuário, zero envio quando não há resultado／a consulta falha, além da revalidação de autorização
  durante a consulta e do replay do recibo da requisição original.
- A API de membros do grupo não inclui robôs; o nome de um robô só casa menções nativas já salvas dentro da
  autorização válida da mesma tarefa e, sem identidade confiável, exige @ nativo. Não se garante enumerar todos
  os robôs do grupo.
- 4 arquivos de Provider／serviço com 130 testes e 2 arquivos da CLI com 11 testes passaram; cobre usuário／robô
  homônimos, falha de paginação completa, seleção preservada entre entradas／rejeitada entre credenciais, envio
  de nada parcial e idempotência do recibo após mudança de diretório.
- Host／CLI reais de MN-02: `desktop-e2e-20261008-091311-382` com 1 caso passando; o cliente continuando uma
  conversa sem origem passou consultando por nome um membro que antes não tinha nó nativo e enviou o at. Outro
  pending spec do mesmo lote não foi executado por falta da URL de teste no capture padrão; após replay
  explícito, os 4 casos MN-01／MN-03 Feishu/Lark × grupo／tópico de `desktop-e2e-20261008-091522-301` passaram.
- Typecheck raiz, desktop typecheck:e2e, fixture, lint raiz（67 warnings existentes）、verificação de arquitetura
  passaram; o typecheck completo da CLI passou nos 30 tarefas. O lint completo da CLI foi bloqueado por erros de
  max-lines existentes em arquivos não modificados, e os 2 arquivos-fonte da CLI desta rodada foram
  verificados isoladamente com as regras da CLI em 0 errors／0 warnings.
- Modelo e HTTP de plataforma são substitutos isolados; não foram verificadas permissões de tenant real, a
  seleção por linguagem natural de um modelo real, a UI em celular nem outros sistemas operacionais. Desktop
  continuous, celular replayable, owner de entrega e fila não foram alterados.

## Input material refactor (fronteira atual)

TP-01 now covers topic start-now admission and original-message presentation through the real Host/CLI. Setup: a controlled streaming run; action: submit a topic batch with two original messages, one root quote and a history attachment; assertions: no queued input, separate original senders/bodies, first-only quote/history and original-text preview at Desktop and narrow viewport sizes. The material is synthetic; native Feishu history collection and Bot-service stop coordination require separate service tests and manual acceptance. O registro de execuções subsequente do TP-01 está neste documento; os resultados antigos de queue／Steer servem apenas como histórico. O case atual submete após parada manual e ainda não prova a coordenação automática de parada do Bot; o novo TP-04 cobre isso especificamente.

## Topic collaboration (in progress)

| Case          | Status  | Evidence boundary                                                                                                                                                 |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOT-E2E-TP-01 | pending | `bots/manual-review/pending/feishu-topic-runtime.test.ts`; real Host/CLI and DOM, synthetic topic batch/materials; reuses group-runtime controlled-stream fixture |
| BOT-E2E-TP-02 | pending | partial native verification: ordinary/dedicated routing, incremental history, long-background summary; remaining native cases below                               |

Provider/service/Agent unit tests cover topic isolation, owner opt-in, message
boundaries, bounded summary and native API payloads. They do not establish real
Feishu/Lark tenant compatibility. Desktop narrow viewport is not a substitute for
mobile remote replayable validation.

Topic implementation verification (2026-09-07): 222 focused provider/service tests and
169 Agent runtime/archive/summary tests passed. Root and CLI core typechecks passed;
lint reports 43 existing warnings and zero errors. A separate 35-test remote routing
regression passed. The existing desktop continuous and mobile replayable boundaries
are unchanged; those unit tests do not establish real mobile operation.

TP-01 passed in the controlled macOS Host/CLI + Desktop DOM run
`desktop-e2e-20260907140113423-p6639-99c0f20745391c21`, including queued attachment
cancellation, narrow-screen delivery reconciliation and topic details. The existing
`feishu-group-runtime.test.ts` passed in the same run (two specs passed). Native topic
identity and saved delivery were seeded; the case stays pending manual review.

`pnpm verify:pre-push` passed on rerun. The initial broad run reported one
unrelated `SubagentsSection` optimistic-render assertion failure (9,800 tests
passed); its 36-test file passed in isolation, then the entire pre-push command
passed without concurrent E2E. No unrelated test or implementation was changed.
Changed-file formatting and `git diff --check` passed.

Live verification resumed on 2026-09-08 after the Mac was unlocked. The existing
`pnpm dev:desktop` process completed startup (Electron PID 17515, local Host 17711;
development log `/tmp/zcode-topic-dev.log`). Computer Use operated Ryan Bot in the
real `ZCode 群聊验证` group (`oc_da0fa1e9e7e9f852894c8d6aaca1c044`).

- `/history on` returned the native opt-in confirmation. An ordinary root message
  and an ordinary topic reply created no task before the first explicit bot mention.
- Topic A (`omt_19fae40ad30fdbe5`, root
  `om_x100b66c282f2dcacc4922dae1e667f0`) created task
  `sess_8c86bd38-5bb4-4f4d-8e4a-4f0521b92eef` on the first mention. The native
  result `om_x100b66c29c2ee0acdfa3a1a2b0a964c` appeared inside Topic A; persisted
  delivery status was `sent`.
- Topic B (`omt_19fae586a54e1b83`, root
  `om_x100b66c29a35b8b0c2ffcd23b5457a7`) created a separate task
  `sess_35dd54ab-a705-480d-839f-26e726c96837` and replied `TOPICBREADY` inside
  Topic B (`om_x100b66c296b92104c3434026e359f3e`). The default group task remained
  `sess_5ec4cfa2-10e5-46d9-947f-eb2fe9a3eb27`. Completion reactions were visible.
- The real history API rejected access with `need scope: im:message.group_msg`.
  Both topics displayed the explicit basic-mode warning. Topic A correctly did
  not claim knowledge of unread background. This proves the missing-permission
  behavior, **not** successful history retrieval or incremental ingestion.
- The permission was located in the application's live permission-management
  page as `获取群组中所有消息（敏感权限）`, under application identity. Enabling and
  publishing it was left to the user. A subsequent read-only probe with a fresh
  application token returned `code: 0` for Topic A's native thread history,
  including its root (position -1), ordinary discussion (position 0), request
  (position 1), and two application cards. This establishes permission and native
  API access.
- After disk space recovered to 12 GiB, Computer Use submitted request
  `om_x100b66c367d6ec70c122bdda2618103` in Topic A. The visible native reply was
  `Codename: APRICOT; agreed launch day: Friday.` Its accepted input snapshot
  contained exactly the root and ordinary Friday discussion, `hasGap: false`.
- A subsequent ordinary message changed the launch day to Monday
  (`om_x100b66c365b480a0c10ca8be0bba666`). Before the next mention, the topic still
  had two accepted inputs and no new bot reply. The next mention
  `om_x100b66c3604438b8c459784b98545d6` produced the native reply
  `Codename: APRICOT; latest confirmed launch day: Monday (changed from Friday).`
  Its persisted background contained **only** that new ordinary message; root,
  old discussion, prior requests and bot replies were not re-injected. Both
  successful requests completed in the original Topic A task, with checkpoints
  equal to their respective request message IDs.

The Desktop accessibility tree contained the new tasks, but its screenshot stayed
on an older view and read-only CDP reported a hidden renderer. This is not accepted
as real Desktop visual verification. Long-history limits, native attachment and
card-control scenarios, Lark, physical mobile remote control and
Windows/Linux remain unverified. TP-02 stays pending.

The 2026-09-08 evidence-update pre-push attempt stopped with `ENOSPC` while loading
`zcodeAgentService.v4.test.ts` (22 files / 339 tests passed before the failed suite;
no tests ran in that suite). Only about 159 MiB remained on the system volume.
This is an environment failure, not a passing gate or a confirmed implementation
regression. After disk space recovered to 12 GiB, the complete
`pnpm verify:pre-push` rerun passed (`/tmp/topic-evidence-prepush-retry.log`).

The real private group `ZCode 专用话题验证`
(`oc_6596fb27f96a81b6ee5c34cc09be6089`) was created through the native API with
`chat_mode: topic`, Ryan Bot and the bound user as its only participants. Computer
Use confirmed the native topic-group page and its create-topic entry.

Dedicated-topic execution was then verified through Computer Use on 2026-09-08:

- Publishing an owner mention `/enable` as a topic root enabled the parent group
  and returned the native enablement card inside that topic. The parent group's
  default task remained absent.
- A subsequent mention inside that topic returned `DEDICATEDREADY`, with a
  completion reaction. Native thread `omt_19fafc4ae38e9be0` (root
  `om_x100b66c306f1d4b8c4cdd16b32ac7e0`) bound to task
  `sess_895438b4-d7d0-4136-bc07-878ec258476d`; accepted input
  `om_x100b66c3057900a4dd82aa5adb6242a` completed and its saved delivery was
  `sent` (`om_x100b66c303bf28b4c102b2c7b21c42f`).
- A second topic with a mention directly in its root
  `om_x100b66c3189decbcc27d014d2d7c4fc` created distinct thread
  `omt_19fafdac200edb8b` and task `sess_f34a27da-c0dd-4e34-b200-ce4952cb9f70`.
  Computer Use opened that topic and observed `DEDICATEDSECOND` and a completion
  reaction under its own root. This establishes both root-mention and reply-mention
  routing in a real `chat_mode: topic` group, separate from ordinary-group tasks.

Dedicated-group history, attachment/card-control races, long history and remaining
cross-platform cases are still pending; the broader TP-02 case is not promoted.

Fonte: [Bots E2E Case Catalog](../bots-e2e-case-catalog.md)、[Bots](../bots.md) e [Bot Channel Runtime Split](../bot-channel-runtime-split.md)。

## Dimensões de estado

| 维度               | 等价类                                                  | 本轮处理                                                                                                               |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Provider           | Feishu、Lark、Telegram/Weixin                           | Feishu 代表共享卡片实现；Lark domain 另案；非卡片 provider 剪枝                                                        |
| Reply lifecycle    | create、running update、terminal update                 | BOT-E2E-SC-01 全部显式断言                                                                                             |
| Stream block       | message、tool start/update、terminal                    | BOT-E2E-SC-01 使用 controlled stream                                                                                   |
| Locale             | zh-CN、en-US                                            | SC-01 覆盖 zh-CN；en-US 由 provider/service unit contract 保留，后续可做 pairwise                                      |
| Delivery kind      | bot-channel-continuous、web-remote-replayable           | 只接受前者；后者按架构 invariant 剪枝                                                                                  |
| Runtime authority  | local host、attached remote host、competing local hosts | SC-01 覆盖 local；其余进入 RT 专项                                                                                     |
| Evidence           | service action、subscription、provider HTTP、card JSON  | SC-01 四层联合证明                                                                                                     |
| Automation origin  | Feishu、Weixin、普通 UI                                 | CR-01 正式 E2E 覆盖 Feishu；Weixin 由共享协议与 provider service integration test 覆盖；普通 UI 断言无 delivery target |
| Automation result  | complete、error、Bot unavailable                        | CR-01 覆盖终态回推和 best-effort 降级                                                                                  |
| Persistence        | create 后同进程、repository 重开                        | CR-01 必须证明重启后仍能读取原会话目标                                                                                 |
| Connection failure | unbound、bound                                          | CF-01 覆盖 bound 冲突态；unbound 已由组件测试覆盖并从 Desktop E2E 剪枝                                                 |

## Tabela de cobertura

| Case ID       | Priority | Status | Spec                                                                     | Timing             | Setup / Action / Assertion                                                                                                                |
| ------------- | -------- | ------ | ------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| BOT-E2E-SC-01 | P0       | formal | `packages/desktop/test/e2e/bots/feishu-streaming-card-lifecycle.test.ts` | controlled-stream  | Feishu callback 建 task；注入分阶段 stream；断言单卡、时间线、折叠、Typing 与 continuous 订阅                                             |
| BOT-E2E-AQ-01 | P1       | formal | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | controlled-stream  | pending elicitation；多选/自定义 callback；同一 message_id 原地更新并提交协议响应                                                         |
| BOT-E2E-IL-01 | P0       | formal | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | controlled-stream  | 阻塞前主卡封口；交互卡推进/终态保留；后续 Agent 输出另起流式卡                                                                            |
| BOT-E2E-RT-01 | P1       | formal | `packages/desktop/test/e2e/bots/bot-runtime-authority.test.ts`           | controlled-process | owner 持锁；contender 被拒绝；owner 释放后 takeover                                                                                       |
| BOT-E2E-RT-02 | P0       | formal | `packages/desktop/test/e2e/bots/bot-runtime-authority.test.ts`           | fast-process       | attached remote host；runtime 保持 idle；无 provider 网络请求                                                                             |
| BOT-E2E-PV-01 | P1       | formal | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | fast-text          | Feishu/Lark 相同 callback；断言各自 OpenAPI origin                                                                                        |
| BOT-E2E-RW-01 | P0       | formal | `packages/desktop/test/e2e/bots/bot-remote-disconnected.test.ts`         | controlled-stream  | remote workspace disconnected；普通消息被拒绝；不 reconnect、不解析远端 service、不本地执行                                               |
| BOT-E2E-CR-01 | P0       | formal | `packages/desktop/test/e2e/bots/bot-automation-result-delivery.test.ts`  | controlled-stream  | Feishu 创建 automation；重开 repo；先订阅后派发；complete/error 回推；失效 Bot 降级；Weixin provider 出站由 service integration test 覆盖 |
| BOT-E2E-CF-01 | P0       | formal | `packages/desktop/test/e2e/bots/feishu-runtime-error-ui.test.ts`         | controlled-process | 已绑定 Feishu 缺少 credential；启用 runtime；重开机器人弹窗并断言绑定保留、连接中断与错误详情                                             |

## Contrato de fixtures

BOT-E2E-SR87 está em `bots/manual-review/pending/bot-effective-selection.test.ts`; synthetic, fast-text. Valida que o menu／o primeiro despacho usam a mesma seleção válida e que ver o menu e enviar um envio inválido não muda a intenção original. O Todo99 acrescenta BOT-E2E-SR99: após a vinculação, resolver a próxima entrada ociosa a partir da seleção original da Session, sem reinterpretar a execução já fixada. Compartilham essa pending spec e não foram promovidos; conversation W99-E03／E06 validam separadamente em Pro o adaptador Bot→Task de produção→requisição real do Worker, o setter completo e a recuperação a frio. As evidências não cobrem rede IM real nem o ambiente combinado celular／SSH.

- `feishu-streaming-card-lifecycle.json` é o fixture de stream sintético local ao case.
- Os outros 5 cases usam metadata sintética local ao case com nomenclatura de mesmo significado em `fixtures/bots/`; todos os fixtures declaram `syntheticReason` e a classificação de timing.
- Classificado como `synthetic`, porque o replay de provider externo só pode fornecer SSE de modelo e não controla de forma estável a janela de observação passo a passo do consumo de task events pelo Bot; o fixture gera explicitamente ZCode stream events determinísticos.
- A API Feishu simulada precisa registrar as requisições em vez de apenas retornar sucesso, usando contagem de requisições, URL, method, reaction id e Card JSON como evidência.
- `bot-automation-result-delivery` registra requisições Feishu simuladas e usa um stream de task controlado para provar que o scheduler escuta antes do despacho do prompt; não é permitido substituir a barreira de evento por um sleep fixo. O `/sendmessage` do Weixin é coberto pelo watcher／provider service integration test compartilhado em `packages/services/test/botsService.messageFlow.test.ts`, e não é reportado como Desktop E2E.
- Os cases passaram por revisão manual e saíram de `manual-review/pending/`; o domínio de Bot hoje não tem preset Docker próprio, e o WDIO Desktop padrão é a entrada formal de execução.
- CF-01 usa metadata sintética local ao case; a credencial ausente é usada apenas para disparar deterministicamente um erro de runtime, e o `syntheticReason` precisa explicar que ela substitui uma injeção real de falha do Feishu; este case já passou por aceitação manual no Desktop.

## BOT-E2E-DT-01 criação automática de task após exclusão (ZCT-2096089929570893824)

- Status: pending; case `packages/desktop/test/e2e/bots/manual-review/pending/bot-deleted-task-recovery.test.ts`.
- Setup: o Feishu Bot vinculado aponta para a task antiga no tombstone de exclusão, preservando o estado de interação antigo; o provider simulado registra as requisições de notificação.
- Action: uma mensagem comum entra no callback do provider e depois o mesmo message id é reenviado.
- Assert: a task antiga não é restaurada; apenas uma task é criada e vinculada no mesmo workspace; a interação antiga é limpa; um único aviso explica exclusão, criação e não herança de contexto; a mensagem original é despachada apenas uma vez; o broadcast created do Desktop aponta para a nova task; a assinatura continua bot-channel-continuous.
- Fixture: metadata sintética local ao case; o estado de exclusão e o HTTP do provider vêm de fixtures determinísticos; o robô do usuário não é acessado.
- Unit boundary: identidade local/remota, não excluída mas invisível na lista (incluindo arquivada/fixada), falha de leitura do índice, falha de criação, falha de notificação e chinês/inglês. Apenas o comportamento de arquivamento permanece como estava.

Registro de verificacao (2026-09-07): o DT-01 passou no Desktop WDIO em macOS, e tambem passaram as regressoes em `feishu-provider-interactions`、`bot-remote-disconnected`、`feishu-streaming-card-lifecycle` . A evidencia do DT-01 cobre provider callback -> estado do Bot -> task service -> HTTP do provider e broadcast do Desktop, sem se passar por tenant real do Feishu nem por validacao de DOM do desktop. Host remoto real, Windows/Linux e a cadeia em celular ainda nao foram testados em aparelho; esta rodada usa apenas o task service existente e o roteamento por workspaceIdentity, sem alterar o protocolo continuous/replayable. O case permanece pending e nao se declara concluida a aceitacao manual nem a promocao em CI.

### BOT-E2E-DF-01 Feishu reply delivery failure and recovery

O Todo103 acrescenta a aceitação: a task substituta do DT-01 usa a seleção completa da Model Selection View atual e segue a criação／primeiro envio em V4, sem restaurar campos antigos; sem seleção disponível não pode criar nem enviar. CF-01 espera a projeção do status de conexão em background com o popover ainda aberto, sem depender de fechar e reabrir para atualizar, para validar o novo polling serial de estado visível.
O registro de 2026-09-07 abaixo é evidência histórica fixa de staging; o resultado da execução desta rodada é registrado no razão do Todo103.

- Status: pending. Spec: `packages/desktop/test/e2e/bots/manual-review/pending/feishu-delivery-error.test.ts`.
- Setup: bound private Feishu bot; synthetic HTTP business failure with code/msg/log_id.
- Action: private command reply fails, then a subsequent reply succeeds; group input is rejected.
- Assert: status exposes deliveryError without misreporting a WebSocket failure; error clears after successful delivery; private outbound uses open_id; group creates no task.
- Evidence: service/provider HTTP and status projection; UI rendering is separately unit-tested. No claim of live Feishu tenant reproduction, mobile device validation, or DOM end-to-end coverage.

DF-01 verification (2026-09-07): macOS Desktop WDIO passed (`desktop-e2e-20260907040958265-p60496-c535b8967f7e59a1`). HTTP 200/400 business failures, body/header log ID, update rejection, streaming circuit status, and localized error rendering are covered by 124 passing unit tests. Typecheck, Desktop E2E typecheck, and lint passed (43 warnings, 0 errors). Pending case is not promoted. Live Feishu, Windows/Linux, mobile devices, and delivery-failure DOM interaction remain unverified; existing connection-error DOM regression CF-01 passed in macOS Desktop WDIO.

## Group collaboration additions

| Case          | Status  | Required evidence                                                        |
| ------------- | ------- | ------------------------------------------------------------------------ |
| BOT-E2E-GR-01 | pending | group activation, owner checks, private/group state and canonical source |
| BOT-E2E-GR-02 | pending | real CLI FIFO and CAS cancellation; desktop/mobile projection            |
| BOT-E2E-GR-03 | pending | saved segmented results, uncertainty and authorization revalidation      |
| BOT-E2E-GR-04 | pending | actual task-pane DOM, localized source labels and saved-result retry     |

Cases remain pending manual review; automated execution evidence is recorded below, without promotion. Continuous Desktop, replayable mobile and independent Bot subscriptions keep their existing delivery boundaries.

2026-09-07 GR-01 provider/service evidence: macOS Desktop WDIO passed both Feishu and Lark cases in `desktop-e2e-20260907080816019-p64763-2c57d53b14b98617`. Pending spec `bots/manual-review/pending/feishu-group-collaboration.test.ts` uses synthetic provider HTTP and controlled task admission; it verifies group routing, independent tasks, owner-only activation/new, exact mention filtering, event deduplication, source metadata and post-admission reactions. Real CLI FIFO and renderer evidence remain separate required checks; no promotion or live tenant validation is claimed.

GR-02/04 runtime evidence will use the existing E2E-only `window.__testActions` bridge to submit a group message through the real Host BotsService into the real CLI, while Desktop renders its canonical queue. Synthetic bot configuration/group association is seeded only in the isolated E2E data directory; no live bot credentials or tenant messages are used. The bridge remains gated by `shouldExposeE2EStoreBridge` in production builds.

- GR-02/04 actual Host/CLI/DOM evidence: `feishu-group-runtime.test.ts`, run
  `desktop-e2e-20260907083412006-p20801-c4446c2fbacc5e8b`, 2026-09-07,
  1 passing. Controlled provider SSE fixture holds a real CLI turn while a group
  member submits through the actual Host service. Desktop renders the same queue
  and sender, deletes that queued input without stopping, and reconciles a saved
  uncertain result through the service. This is pending manual review; it is not
  real-tenant Feishu or mobile remote evidence.

- Final combined Desktop regression: `desktop-e2e-20260907085131276-p59423-2a071562b47f5926`,
  3 specs / 4 cases passed (Feishu, Lark, real Host/CLI group queue with file,
  and the existing disconnected remote Bot regression).
- Group task creation and permission persistence: `desktop-e2e-20260907090653408-p90137-073eb0ea483a754d`,
  1 case passed. The real Host/CLI/DOM scenario also sends `/new`, sets owner mode
  to `yolo`, and submits the first group request. The isolated CLI SQLite record
  has `permission.scope=session` and the selected mode; project permission
  defaults are unchanged. This supplements the queue/file/cancellation and saved
  result reconciliation checks above.
- Automated checks on 2026-09-07: 37 focused App test files / 462 tests and
  4 CLI protocol/projection/facade files / 198 tests passed; remote attachment,
  queue scope and continuous/replayable regression evidence is covered separately
  by 6 remote test files / 89 tests. Root `pnpm typecheck` passed.
- Full affected App run executed 880 files: 878 passed (9,677 tests), with 60
  failures in two SessionPane suites whose component mocks omitted the new group
  notice dependency. After isolating the notice consistently with their existing
  composer/model test scope, both files / all 60 tests passed on focused rerun.
  Group notice behavior remains covered by its own tests and the real Desktop E2E.
  Lint completed with 43 existing warnings and 0 errors; group permission isolation
  added 2 passing CLI core tests. `verify:pre-push` was invoked before commit but
  its affected-test selection skipped the uncommitted changes, so the full affected
  App run above was invoked directly against the changed files.
- Live Feishu/Lark tenant mentions, attachment reference visibility, callback
  operator identity, bot removal and lost speaking permission have **not** been
  exercised against a real group. Windows/Linux, real mobile browser/device and
  full cross-host restart behavior remain unverified. Synthetic fixtures and
  unit tests do not stand in for those checks.
- Broader CLI `session-persistence.test.ts` did not pass in this environment:
  its existing model adapter fixtures lack `setModelIoFullRetentionEnabled`;
  diagnostic isolation also exposed local plugin/hook dependencies and stale
  legacy queue/prompt event expectations. Those exploratory fixture edits were
  reverted, and this unrelated suite is not reported as passing. The new group
  session permission behavior is covered by the focused facade tests and the
  real Host/CLI SQLite E2E above.

Post-commit gate (2026-09-07): `pnpm verify:pre-push` passed against feature
commit `57d9b6c3b3`. The repository runner selected all 81 changed files, passed
the 19 changed unit-test files, and passed the affected-code test run for the
55 matching App files. Lint also passed (43 warnings, 0 errors). This supersedes
the earlier skipped pre-commit affected selection; the legacy CLI and live-tenant
validation limitations above remain unchanged.

- GR-02 regression (2026-09-07): after stopping the real CLI and emptying its queue,
  a stale Bot permission record must not block `/new`; verify draft creation and
  removal of the stale record before creating the next task. Unit coverage also
  distinguishes running, queued and interaction-blocked replies.

  Live reproduction: Desktop showed a stopped task with an empty queue while the
  same group retained an unhandled permission record in Bot persistence. After
  restarting normal `pnpm dev:desktop`, a real mention `/new` at 18:32 returned
  `Task: draft / State: draft`. Host logs confirmed CLI `reason=idle` and stale
  interaction cache cleanup. No live persistence was edited and no additional
  `/stop` was sent. This verifies the original Feishu failure independently of
  the isolated runtime E2E. Real remote/mobile regression remains unverified.

  Validation: typecheck, lint (43 existing warnings), 193 focused service tests,
  and verify:pre-push passed. Corrected GR-02/04 Desktop E2E passed in
  `desktop-e2e-20260907103208043-p85801-62fec90a245ce74d` (1 case). The first
  attempt had an invalid synthetic permission missing `response`; a subsequent
  build-reuse attempt exited before testing because dev startup removed `out`.
  Neither failed attempt is counted as passing evidence.

GR-04 action-bar revision: verify per-turn placement, no composer panel or repeated result body, popover reconciliation, queue coexistence, and hidden success/in-flight states. Runtime and real UI evidence to be recorded after verification.

GR-04 implementation notes (2026-09-07): removed `BotGroupTaskNotice` entirely.
Recovery is a popover trigger in the corresponding reply action bar. Persisted
`sourceCommandId` matches canonical input rows; runtime turn IDs are deliberately
not used as product turn IDs. In-flight projection stays pending while storage
retains unknown for crash recovery. No change to Desktop continuous, mobile
replayable, owner routing, or canonical queue admission.

Intermediate verification found and fixed maintenance-turn Hook action leakage.
Two existing SessionPane test harnesses now isolate the new delivery provider.
The first association E2E retry used an obsolete renderer activeInputId (null in
V4); the corrected test reads canonical input attribution from the isolated CLI
ledger. Another retry used unsupported WebDriver window/rect; it now uses the
repository Electron window-size helper. These retries are not passing evidence.

GR-04 final Desktop E2E: passed in
`desktop-e2e-20260907105839858-p78673-cee7e60c7f0472f5` (1 case).
It verifies the canonical CLI input association, recovery beside the matching
reply, no saved-body duplication or composer panel, narrow-window popover bounds,
reconciliation, and the action produced by a real Host/CLI result send rejection
in the isolated test provider. This is not a live Feishu API failure test.

Live normal dev verification at 19:03: restarted `pnpm dev:desktop`, used computer
use to send a harmless `DELIVERYACTIONOK` request in the existing group task, and
observed the same reply in the real Feishu test group (labelled Desktop). Desktop
showed no composer delivery panel or spurious unknown indicator. The new delivery
record has a canonical sourceCommandId, status sent and no error. No real Bot state
was edited. Real tenant failure/timeout, mobile remote, light theme and Windows/
Linux execution remain unverified; semantic tokens and shared UI paths are retained.

Typecheck, Desktop E2E typecheck, lint (43 existing warnings) and focused regression
suites passed. The broad affected test run passed after fixing Hook eligibility
and test providers; its pre-push staging step failed because the pre-commit HEAD
range still named the removed test file. Post-commit `pnpm verify:pre-push` passed against `4a5f7bdb2f`: 21 changed test files and the affected run for 58 App files completed successfully, including staging.

Group member display revision: directory lookup replaces
contact lookup for group actors. Controlled GR-02/04 covers the queue label and
identity popover; it does not establish live tenant API permission or name access.

Group member display evidence (2026-09-07): provider/service/source-label tests
passed (98 tests before removing the generic member word; the updated label's
5 tests passed afterward). Root typecheck passed. GR-02/04 passed with the real
Host/CLI in isolated run `desktop-e2e-20260907113243713-p4711-4f6d853c0d2015c0`,
including queue-name and full-ID popover assertions. Normal dev Desktop history
showed short identity labels and the working popover via CDP screenshot; no saved
source metadata was modified. Live directory lookup for configured app
`cli_a9786b1e21e5dbc2` still returned 99991672. The user's permission screenshot
was for a different app (`cli_a9647cf87cf95bef`), so live name resolution remains
unverified. Actual mobile remote, Windows and Linux UI runs remain unverified;
the change uses the shared source label and does not alter runtime delivery modes.

Final local gates for this revision: `pnpm typecheck`, `pnpm lint` (43 existing
warnings, no errors), and `pnpm verify:pre-push` passed. The latest wording omits
the generic member label and shows only the last six ID characters on fallback.

Normal `pnpm dev:desktop` was rebuilt and restarted after the change (main PID
53715, Host PID 53837). Native Computer Use verified the existing group task's
`Feishu / 飞书 · 5cce9a` labels, click-to-open full ID, and Escape dismissal.
The new Host RPC `bots.getGroupMemberNames` reached the actual Feishu API and
returned the same missing-scope error for `cli_a9786b1e21e5dbc2`; therefore the
remaining live-name verification is blocked by that application's permission,
not by a mocked UI or an unstarted service. The normal dev app remains running.

Follow-up live evidence (2026-09-07): the user replaced the configured bot with
Ryan Bot (`cli_a9647cf87cf95bef`) and enabled the same test group for that bot.
The previous bot's group authorization is disabled. The actual member API now
returns HTTP 200 / code 0, including the bound user's name. The normal dev Host
logs `bots.getGroupMemberNames OK`; native Computer Use and the user's screenshot
both show `飞书 · 莫汝舰` on the real incoming message. This resolves the earlier
application-permission blocker. The spacing follow-up adds an 8px gap between
attribution and the bubble; GR-02/04 measures the actual rendered gap.

Spacing regression passed in isolated Desktop run
`desktop-e2e-20260907114650611-p68251-40a284ddf131f45c`, including the rendered
8-12px gap assertion. Root typecheck and lint also passed.
The spacing follow-up also passed `pnpm verify:pre-push` before submission.

Reply-body attribution follow-up (2026-09-07): group replies no longer prepend
the sender name/open_id; the native reply target remains. Two service regressions
failed before the change and pass afterward. GR-02/04 now asserts the saved
stopped result is exactly `Task stopped.` with its original message reference.
The isolated Desktop run
`desktop-e2e-20260907115618260-p20788-6275e395b82d51f7` passed. Root typecheck,
lint, and 30 group service tests passed.

Native Computer Use verified the normal `pnpm dev:desktop` and real Ryan Bot
in ZCode 群聊验证: after a new draft, `@Ryan Bot Reply only REPLYBODYOK. Do not
use tools.` produced a native quoted reply whose body is exactly `REPLYBODYOK`.
The saved delivery is `sent` and retains the incoming message ID. Existing
messages remain unchanged. The first request after restarting the dev Host
encountered `proto.sessionNotFound` for the old task; this is a separate restart
recovery issue, not fixed or claimed covered by this formatting change. Windows,
Linux and real mobile remote control were not rerun for this service-only change.
The full `pnpm verify:pre-push` rerun passed. Its first run hit the unrelated
Supervisor client-timeout/rollback lifecycle test; that file passed all 19 tests
in isolation before the full rerun.

GR-05 reaction revision (2026-09-07): 94 focused provider/service/lifecycle tests
pass, including monotonic transitions, cancelled/failed/completed states,
Feishu/Lark operator isolation and compact queue-card payload. The prior
permanent-OK behavior fails the added service transition assertions. Desktop
GR-02/04 passed in `desktop-e2e-20260907121550738-p28948-c52d61fb6862ae03` with
the updated queue acknowledgement; it does not prove external reaction rendering.
Root typecheck and lint passed. The real bot can list message reactions (HTTP
200 / code 0) and reports its operator as the application's app ID.

GR-05 live macOS evidence: normal `pnpm dev:desktop` was restarted, then native
Computer Use sent `@Ryan Bot` a read-only `sleep 45` request and a second queued
request in ZCode 群聊验证. The first displayed OnIt; the second displayed
OneSecond and a single-row waiting/cancel card. Clicking Cancel succeeded,
replaced the card with its cancellation confirmation and removed the second
input's reaction. The first completed with `REACTIONDONE`; its only reaction
was CheckMark. Direct API readback returned code 0, `[CheckMark]` for the first
message and `[]` for the cancelled message; the saved result status is `sent`.
No old OK or in-progress reaction remained on those inputs. Failed/stop paths
have service regression coverage, not live failure-injection evidence. Lark
has provider HTTP coverage; real Lark, Windows/Linux and mobile were not rerun.
Root typecheck, lint and the full pre-push gate passed. An initial provider test
run exposed test-token cache contamination; the new fixture now uses its own
app ID and the focused suite passes all 94 tests.

GR-05 queue-card lifecycle correction (2026-09-07): the previous live test
cancelled the queued input and did not cover normal promotion/completion. Queue
cards now persist their message ID and latest input state; admission writes
preserve progress produced by earlier run events. Serialized updates catch up
late card creation and remove cancel controls after waiting. Provider tests
assert the returned card handle; service tests assert running/completed/failed
updates to that handle with no selection. Focused coverage is 99 tests, including
completion before admission returns and the persisted-target/cancel/stop/discard
cases. Root typecheck, lint and pre-push passed. Desktop GR-02/04 passed in
`desktop-e2e-20260907123427883-p5094-a2e438fea8ec6398`, including persisted stopped
status from the real CLI.

Live normal-dev verification used native Computer Use in ZCode 群聊验证 with
Ryan Bot: a `sleep 45` request (`QCARDFIRST`) followed by a queued `sleep 15`
request (`QCARDSECOND`). The second request was allowed to execute normally.
Its original card changed from waiting with Cancel to running without Cancel,
then completed without Cancel; both requests finished with CheckMark. Persisted
cardMessageId stayed identical through waiting/working/done, and cardStatus was
done after `QCARDSECOND` arrived. Old cards without a saved message ID are not
automatically migrated. Actual failure injection, real Lark, Windows/Linux and
mobile remote control were not rerun; no continuous/replayable stream or CLI
queue ownership changes are involved.

## Mention-only and explicit-reference correction (2026-09-08)

The real 10:42 Feishu callback reached the running Host but parsed to zero inputs.
Removing the bot mention left empty text, and the provider discarded it before
reference/topic handling. Text references were fetched for scope checks but not
retained. This was reproduced by four failing provider/service tests.

The correction preserves group mention-only inputs, keeps verified text/post/card
references separate from command parsing, prepares referenced images in the same
input, and guides empty requests without admission when no authorized background
is available. Topic history is prepared once before task creation, with the same
admission-time authorization check and accepted-input checkpoints as before.

122 provider/service tests passed, including quoted control text, post images,
card-visible text, absent history opt-in and history-read failure. Root typecheck
passed after correcting a nullable post body; lint retained 43 existing warnings
and no errors. TP-01 Desktop E2E passed in
`desktop-e2e-20260908025213758-p73535-03aa4b82e6f8baf6`: empty mention returns guidance
with zero queued inputs, and explicit quoted text enters the real CLI queue with
the existing input/attachment and can be cancelled without stopping the task.
The candidate remains pending; it uses the existing controlled provider fixture.

Normal `pnpm dev:desktop` restarted after the local macOS signing prompt was
resolved. Native Computer Use confirmed that a bare main-chat mention returns the
Chinese guidance and does not add an execution reaction. A quote-only mention was
parsed successfully, but exposed a cold-task admission failure:
`proto.sessionNotFound`, although the original task remained in the CLI database.
The adapter now obtains the existing background subscription snapshot before
attachment upload/admission, preserving the same task and workspace identity.
The added test checks recovery ordering, remoteSessionId propagation and refusal
to submit after recovery failure. All 212 tests across the three affected suites
passed; typecheck and lint passed (43 existing warnings, zero errors).
Desktop/mobile continuous/replayable transport and owner routing were not changed.

A subsequent native quote-only request was accepted into the original task after
cold start (`om_x100b66c39fb070acc34a8c8d2ab2180`), exposing the companion failure:
the startup continuous result subscription had exhausted retries before runtime
activation, so the completed result did not reach Feishu. Group stream setup now
waits for the same authoritative snapshot before subscribing, and rechecks the
subscription map after the await to avoid duplicate startup/input listeners.
The lifecycle test covers this ordering without resubmitting old inputs.

Final native verification used `pnpm dev:desktop` and Computer Use in the ordinary
Feishu test group. After restart, quote-only mention
`om_x100b66c3b24414b0c4fa84f7f9c3268` quoted the ordinary arithmetic question
“7 plus 5”. Feishu visibly returned `12` as a native reply and replaced the
working reaction with CheckMark. Persisted state confirms the original task
`sess_5ec4cfa2-10e5-46d9-947f-eb2fe9a3eb27`, accepted admission, progress `done`,
and delivery `sent` to that exact request
(provider message `om_x100b66c3b39e84b4df93b3dcb6d1bde`). No task reset or historical
input replay was used. The implicit request wording explicitly asks the model to
answer the quoted question or carry out its request; command parsing remains
separate on the server.

TP-01 passed again with the cold-subscription fix in
`desktop-e2e-20260908031650082-p95172-4bf16d8330951c84` (one case, one spec).
The final three unit suites passed 212 tests. A broad pre-push run had one unrelated
20 ms timing assertion fail in `v4SessionPaneModelSwitchRecovery.test.ts`, with
9,818 tests passing; its isolated rerun passed all 53 tests. The full `pnpm verify:pre-push` rerun passed before commit. Native Lark, mobile Web and other OS coverage remain
unverified for this correction; earlier platform coverage is not relabelled.

### Native long-background summary verification (2026-09-08)

Computer Use operated `pnpm dev:desktop` with Ryan Bot in the real dedicated topic
group `oc_6596fb27f96a81b6ee5c34cc09be6089`. The bound owner enabled topic history
with a native `/history on` mention, then created a fresh CEDAR topic
`omt_19fa0d1df1cfda52`. The root and ordinary discussion did not submit task inputs.

- The editor received 27,860 characters of synthetic discussion. A subsequent
  read-only native message API check returned exactly 19,999 text characters for
  message `om_x100b66cc11ee38b4c12a2ac6a7e4efc`, ending midway through record 159.
  Therefore this run covers the server-stored text only, not the entire pasted
  draft. The application archive matches that native API text length; the missing
  editor tail is not evidence of application history truncation.
- A separate ordinary reply `om_x100b66cc2e689908de2920d0b7445a2` confirmed Tuesday
  rather than the old Friday proposal and left the owner undecided. The next
  explicit mention `om_x100b66cc2a8d606cc02f7d5d40479cd` created independent task
  `sess_b3ed9e49-22a9-4b30-8de9-8e3fcc93ce03`. Its accepted background contained the
  two discussion records (19,999 and 50 characters); the root was an explicit quote.
- The actual Agent persisted a 795-character `bot_topic_context` record with an
  earlier-discussion summary and the recent confirmation verbatim. The summary
  labeled Friday as an unconfirmed proposal and retained its original message ID.
  This was a real configured model invocation, not a summary fixture.
- The native final reply correctly reported CEDAR, Tuesday, and owner not yet
  determined. Computer Use observed that reply in the source topic and the native
  completion checkmark. Input progress was `done`; saved delivery was `sent`, with
  provider message ID `om_x100b66cc289cecb0c4a6013736ee30a`.

The focused Agent background/archive tests also passed (11 tests, two files).
This run does not establish the 200-message cap, missing-history recovery,
summary-conflict tool lookup, topic attachment/card races, mobile `/remote`, Lark,
or Windows/Linux behavior. Those remain separate verification items.

### Topic card authority and attachment routing regression (2026-09-08)

Seven explicit service cases now use distinct task IDs for sibling topics. They
reject queue cards with another topic, chat, task, authorization generation or
actor, including old cards after parent disable/re-enable. Rejections assert zero
CLI cancellation calls and unchanged saved inputs for both topics. The valid
author-card control asserts exactly one cancellation targeting A's task and
original command, with B unchanged. The older generic fixture's constant task ID
is not used as evidence for these cross-task checks.

The six-file focused run passed 83 tests: group service authority, topic history,
Bot attachment upload, shared-host mobile attachment, window-host attachment
registry and remote prompt attachments. These are controlled service/transport
regressions, not a real phone, native attachment upload or native card race test.

### Native dedicated-topic file boundary (2026-09-08, incomplete)

Computer Use uploaded the synthetic 154-byte file
`zcode-topic-attachment-verification.txt` to CEDAR in the dedicated test group.
The native history API confirmed file message `om_x100b66ccd1ebe0a8c22a536e7f67b07`
in thread `omt_19fa0d1df1cfda52`, chat `oc_6596fb27f96a81b6ee5c34cc09be6089`.
No bot mention was sent with this file, and no file-analysis input was admitted.

The inspected native message UI had forward/recall/selection controls but no quote
reply. The forward dialog was closed without forwarding. Further UI verification
stopped after Computer Use reported that the user had changed the Feishu window.
This establishes native upload only, not attachment admission or Agent analysis.

Code inspection then confirmed a real implementation gap: historical files become
text placeholders in provider history and the topic archive tool cannot fetch their
resources. The remaining retrieval contract is now explicit in the feature spec;
do not mark historical attachment analysis complete based on explicit-parent tests.

### Historical resource Host boundary (2026-09-08)

Implemented and tested the Host service download boundary. The targeted run passed
154 tests across topic resource authorization/service, native provider and group service
suites. New checks cover task/input/archive/workspace scope, group/history/owner/version
revocation, native message identity, cancellation and post-download authorization changes.
The service integration case returns a transport-ready attachment after both authorization
and native metadata checks. No Agent-side tool or remote materialization is claimed yet.

A real read-only provider invocation downloaded the previously uploaded dedicated-topic
file `om_x100b66ccd1ebe0a8c22a536e7f67b07`: one resource, 154 bytes, SHA-256
`2cb888eaeb649a4bc9c91a4c9682280d11cec485fa7cd8f9b416c82f03df2d4d`, matching the
original synthetic file. This establishes native resource API permission/content fidelity;
the file has not yet been admitted as history by a subsequent mention, so it is not
evidence of the complete Agent on-demand retrieval flow.

Root typecheck and lint passed (43 existing warnings, zero errors). The first full
pre-push run had CUA shutdown timing and mobile-layout timeout failures plus a Vitest
worker heap exhaustion; both files passed in isolation (79 tests). The full
`VITEST_MAX_WORKERS=2 pnpm verify:pre-push` rerun then passed without changing those tests.

# 2026-09-08 regressão de @ nativo isolado e validade de token

- Com `pnpm dev:desktop` realmente em execução, o @ isolado no chat principal das 12:37 recebeu o evento nativo, mas o envio da mensagem complementar de requisitos falhou, e o Feishu retornou `99991663`. O código antes ignorava `expire` e fixava o cache em 90 minutos.
- Alterado para cachear conforme o tempo de vida restante da interface; a regressão periódica do provider Feishu／Lark falhou antes e passou depois, com 79 testes do provider passando. Desta vez a interface real retornou `expire=4187` segundos, menor que os 5400 segundos fixos da implementação antiga.
- Depois de reiniciar a versão de desenvolvimento, o Computer Use enviou um @ nativo isolado em `ZCode 群聊验证`, mensagem `om_x100b66cd6c1c20a4c026ae6aa5b7893`, com resposta nativa `om_x100b66cd6c2e3938c1c10da2d404a76`, e o cliente exibiu“请补充需求，或回复要处理的消息并 @我。”
- O ID de mensagem nativo foi conferido contra a entrada persistida do grupo atual: essa mensagem não tem registro de admission; nenhuma task foi criada ou enfileirada. A mensagem que falhou antes, `om_x100b66cd5f92d8acc322408850c60f9`, também não teve execução automaticamente reabastecida.
- Esta verificação real confirma que a entrega da mensagem deorientação se recuperou após o reinício; a travessia completa da validade é coberta por teste de relógio controlado, e não se esperou o token expirar naturalmente em um tenant real. Esta verificação não foi declarada como aprovação de leitura de anexos de histórico pelo Agent, de celular, de Lark ou de outros sistemas operacionais.

### 2026-09-08 13:18 verificação da consulta nativa ao anexo de histórico (não aprovada)

 executando `pnpm dev:desktop`, foi feita uma requisição de texto puro via @ nativo do Ryan Bot no tópico CEDAR do grupo dedicado real「ZCode 专用话题验证」. A mensagem `om_x100b66cde75330b0c3e499c124d58c0` foi recebida pela CLI e exibiu OnIt; o modelo escolheu a mensagem de arquivo de histórico correta `om_x100b66ccd1ebe0a8c22a536e7f67b07`, mas `ReadSessionContext(sessionId=current, strategy=topic, attachment=...)` foi rejeitada por um erro de validação de JSON Schema do executor (oneOf casando dois ramos ao mesmo tempo). O modelo depois consultou o diretório de sessões da máquina local, o que não pode servir como evidência de leitura bem-sucedida do anexo. Foi adicionado um teste de falha na fronteira do executor e a chamada passou a usar um único modo string; 12 testes de ferramenta passaram.

Outra mensagem de teste às 13:11 carregou acidentalmente uma imagem da área de transferência, acionando o `fault.attachment.connectionUntrusted` da admission de anexo real do Bot, e ela não foi recebida pela CLI. Às 13:17 a mensagem de teste foi removida na interface nativa e o estado de remoção foi confirmado. Esse ponto de entrada agora se conecta ao connection scope confiável já existente, e 91 testes do task adapter passaram; o upload real de rich text após a correção ainda precisa ser testado novamente.

Antes de continuar o envio de /stop o Mac bloqueou a tela e o Computer Use retornou que não consegue desbloquear automaticamente; o comando de parada ainda não confirmado como enviado não foi registrado como sucesso. O download do arquivo de histórico, a resposta final de campos e a atribuição final da reação ainda exigem desbloquear e reiniciar o novo código para reteste, e não podem ser substituídos por testes unitários nem pela verificação anterior de hash de download do Host.

Verificações locais: a ponte de recursos, a autorização de recursos, o upload de anexos e o task adapter somam 122 testes passando; o typecheck e o lint da raiz passaram (lint com 43 warnings). O pre-push completo desta rodada falhou no cenário de falha de refresh após salvar em `subagentsSection.test.ts`; a reexecução isolada desse cenário passou, e ainda não foi obtida uma nova rodada completa de pre-push bem-sucedida. A suíte completa de testes do Agent ainda tem falhas de CUA, de limite de linhas de arquivo e de caminhos externos de conformance; não se declara aprovação total. As alterações atuais ainda não foram commitadas, e o encaminhamento de Host remoto, o celular real e o Lark continuam pendentes de verificação／implementação.

### 2026-09-08 verificações posteriores de código e da cadeia remota controlada

- A consulta do texto original do tópico completou a prioridade dos campos canônicos; os dois testes de conflito e de canônico inválido falharam antes e, após a correção, 14 testes de ferramenta passaram.
- Um canal privado reverso de recursos foi conectado às conexões stdio existentes de SSH／WSL／Docker; os testes usam um transporte PassThrough controlado, e não uma conexão SSH real. Antes da alteração a requisição expirava em 30 segundos; depois, o RPC reverso teve sucesso na conexão original.
- A transferência em chunks cobre contagem de bytes, SHA-256, desativação de grupo, conexão de origem, remoteSessionId, cancelamento, timeout, rejeição por sobrecarga e chegada tardia de requisições antigas com o mesmo ID. Nenhuma fila de tasks ou runtime nova foi criada.
- Um processo CLI falso controlado reproduziu, após o pré-aquecimento, a omissão de remoteSessionId em requisição reversa; corrigido para que cada requisição de recurso use sempre o alvo atual daquela mesma CLI. Esse teste verifica o roteamento do Host e não representa uma chamada de ferramenta de Agente remoto bem-sucedida.
- A regressão mais recente de serviço／Host／stdio passou com 8 arquivos e 86 testes; o typecheck e o lint da raiz passaram（43 warnings）. A reexecução completa de `verify:pre-push` sobre o escopo de commit da versão anterior teve sucesso; esse script usa a faixa de baseline até HEAD, e os arquivos novos não commitados são cobertos pelos testes direcionados acima; a verificação de commit ainda precisa ser rodada novamente no commit final.
- O Computer Use confirmou novamente que o Mac está bloqueado. O handle de execução antigo de `pnpm dev:desktop` saiu（130）e os PIDs antigos de Electron／Host não existem mais; portanto os processos de teste com falha do código antigo não são mantidos. O novo handle de build de `pnpm dev:desktop` continua em execução, e a verificação nativa da nova versão ainda não foi registrada como aprovada.
- Pendente: leitura completa de arquivo de histórico local e resultado no tópico original com a nova versão, SSH／WSL／Docker reais, canal privado de consulta via WebSocket Server, cartão de permissão de celular／multimembros, Lark e verificação em outros sistemas. O escopo original de metas é mantido e esses testes de transporte controlados não substituem essas aceitações.

### BOT-E2E-TP-03 cartão de interação em tópico (pending)

- Case: `bots/manual-review/pending/feishu-topic-interactions.test.ts`, com metadata sintética local ao case.
- Setup: habilita o grupo e submete entradas de tópico, usando um task service controlado e HTTP Feishu/Lark que registra as requisições.
- Action: emite eventos de permissão e de pergunta e resposta comuns.
- Assert: o card faz POST apenas do reply à mensagem raiz original do tópico, com reply_in_thread; o callback preserva grupo, tópico, task e versão de autorização.
- Escopo: regressão determinística de serviço até o HTTP do provider; não representa validação de tenant real, modelo do Agent ou DOM do Desktop.
- O reteste nativo das 13:53 ainda não passou: o modelo continuou a consulta local após a falha anterior e não chamou a ferramenta de anexo; às 13:54 o cartão de aprovação apareceu no chat do proprietário do grupo. Depois de encerrar a janela de operação, a verificação foi entregue ao usuário. O cartão de interação nativo após a correção ainda não foi testado novamente.
- O encaminhamento WebSocket privado já foi conectado; a regressão controlada de uma conexão WebSocket local real e as verificações de peer／Host somaram 4 arquivos e 16 testes passando, sem se declarar que a cadeia de negócio de anexos remotos reais passou.

A regressão de serviço atual do TP-03: Provider e serviço de grupo somam 139 testes passando; os dois novos cenários Feishu／Lark passaram na entrada de execução de serviço do Vitest（2 testes）, sem executar WDIO e portanto não contados como aprovação de Desktop E2E.
O typecheck da raiz passou, com lint em 43 warnings／0 errors. O roteamento de cartão temporário para o tópico original e a correção dos campos de autorização de pergunta／resposta ainda não foram reiniciados no processo de desenvolvimento que o usuário está operando, e a aceitação nativa está pendente.

### 2026-09-08 13:57 chamada nativa de ferramenta dispara o fechamento do protocolo

Após o novo reteste manual do usuário, o registro real da task CEDAR passou a mostrar ReadSessionContext, com strategy=topic, sessionId=current e a mensagem de anexo `om_x100b66ccd1ebe0a8c22a536e7f67b07` corretos, mas o resultado foi `ZCode Protocol client connection closed`.
O Host registrou simultaneamente o fechamento do protocolo da CLI desse workspace e um SIGTERM（protocol-close）. A porta de anexo envia diretamente o trace do Core, incluindo sessionId／turnId／attributes que o protocolo estrito não aceita. O novo teste de quadro completo de protocolo falhou primeiro e, após reutilizar o `protocolTraceFromTraceContext` existente, 3 testes da porta de bootstrap passaram（incluindo leitura e cancelamento）。
Typecheck do bootstrap, typecheck／lint da raiz e o build da CLI passaram; lint com 43 warnings、0 errors.
Após o usuário confirmar que podia reiniciar, o handle de desenvolvimento antigo saiu com 130, e o Electron 3817／Host 4058 antigos não existiam mais; foi iniciado um novo `pnpm dev:desktop`. A leitura nativa corrigida, a devolução do conteúdo do arquivo e a reação final ainda precisam de novo teste e não são registradas como aprovadas.

14:06:46: o novo processo de desenvolvimento ficou pronto（Electron45600／Host45737, local services ready）; nos artefatos do build da CLI foi confirmado que a porta de anexo usa o trace de protocolo convertido. A regressão de ponte de anexo／grupo／serviço de Provider somou 167 testes, e a regressão existente de fluxo de mensagens somou 77 testes, ambos passando. A janela do Feishu foi operada pelo usuário, e a próxima chamada nativa de ferramenta e o resultado no tópico original aguardam confirmação.

### Standalone Core WebSocket resource routing regression

`coreHttp.test.ts` now exercises two real loopback WebSocket Desktop peers through
capability-authenticated `/ws/host`. Reverse requests reach only the matching
workspaceIdentity + remoteSessionId; closing one peer removes only that route. A normal
`/ws` connection does not attach a private resource peer. All 7 Core HTTP tests passed.
The first test-helper attempt lost the RPC initialization frame by awaiting `open` before
installing listeners; synchronously installing RPC in the `open` callback fixed the fixture.
No production transport change was needed. Resource responses remain synthetic, so this
is not live Feishu/Lark, remote Agent attachment, or mobile UI acceptance.

Regressão de corrida entre cancelamento／desconexão de anexo: chamando diretamente o abort listener real, reproduziu-se que o erro síncrono lançado por requestClient escapava do Promise.catch existente. Depois que a notificação de cancelamento passou a usar async try/catch, a porta de bootstrap somou 4 testes passando; a leitura original continua falhando por cancelamento ou desconexão, sem novo retry. O typecheck do bootstrap e da raiz e o lint passaram（43 warnings／0 errors）.
Esse fix adicional ainda não foi reiniciado no processo de desenvolvimento iniciado às 14:06; o fix de trace da leitura normal já está nesse processo.

Os testes unitários afetados na árvore de trabalho atual（incluindo fontes não commitadas e novas, e não apenas a comparação com HEAD）: 865 arquivos passaram, com 9721 testes passando e 4 pulados, log em `/tmp/topic-current-related.log`. Isso não inclui a suíte completa de testes do Agent em workspace independente nem representa a aceitação nativa do Feishu. TP-01／TP-03 começaram a rodar o WDIO; sua limpeza de build removeu o `out` compartilhado e fez com que o processo de desenvolvimento existente saísse, sendo necessário restaurar o processo de desenvolvimento após o fim desta rodada de testes, antes de continuar a verificação manual do usuário.

Esta rodada de WDIO foi concluída: o cenário de Host／CLI real, fila de anexos e DOM do Desktop do TP-01 passou com 1 teste; os 2 cenários de serviço de cartão de interação Feishu／Lark do TP-03 passaram, com 2 arquivos no total e saída 0.
Log `/tmp/topic-desktop-wdio-current.log`. Mesmo executado pelo WDIO, o TP-03 continua sendo um cenário de serviço substituto e não serve como evidência nativa de cartão ou de UI ponta a ponta; o TP-01 não cobre download real de arquivo do Feishu.

14:31:46: o processo de desenvolvimento foi restaurado, com Host33325 registrando `local services ready, all channels registered`, log `/tmp/zcode-topic-post-wdio-dev.log`. Este rebuild inclui o fix de cancelamento／desconexão;
a verificação pré-commit foi rodada separadamente em `/tmp/topic-post-wdio-prepush.log`, e o resultado da leitura nativa ainda aguarda novo teste do usuário.

Essa verificação pré-commit terminou com saída 1: o Vitest relacionado foi terminado por SIGSEGV e não emitiu um relatório completo de asserções, portanto não pode ser registrada como aprovada. A verificação foi executada novamente（`/tmp/topic-post-wdio-prepush-workers2.log`）; o "workers2" no nome do arquivo indica apenas a variável de ambiente passada na inicialização — a configuração de Vitest do repositório especifica explicitamente 4 threads — e não se pode afirmar com base nisso que a concorrência foi de fato reduzida. Não se modificou o escopo dos testes nem se contornou o hook de commit.

O relatório de crash do sistema `~/Library/Logs/DiagnosticReports/node-2026-09-08-143229.ips`
corresponde ao PID14259 do Vitest, com EXC_BAD_ACCESS e a pilha da faultingThread5 dentro de V8
ConcurrentBaselineCompiler／AssemblerBase::AddEmbeddedObject. Isso prova que o processo de verificação
crashou durante a fase de compilação em background; a causa ainda não pode ser confirmada e isso não
substitui o resultado dos testes incompletos.

A reexecução da verificação pré-commit terminou com saída 0, com as duas fases de changed-test e
related concluídas; o log completo é `/tmp/topic-post-wdio-prepush-workers2.log`. Esta aprovação não
apaga o registro de crash aforementioned nem amplia o escopo da aceitação nativa.

## Grupo vinculado fase 1 (aceitação manual pendente)

BOT-E2E-GR-01: configurações do robô → robô Feishu／Lark atual → abaixo do escopo de acesso ao workspace.
Validar com dois robôs, dois grupos e 0／vários tópicos já registrados: uma linha por grupo, contendo apenas nome do grupo, contagem de tópicos e interruptor;
sem task associada, sem expansão e sem entrada de detalhe. Trocar de robô, nome de grupo longo, temas claro e escuro, chinês e inglês são todos verificados.
Desktop e controle remoto do celular são validados separadamente（Desktop estreito não substitui o celular）; na tela estreita a lista de robôs fica em cima e as configurações embaixo.
Depois de desabilitar o grupo, as contagens de tasks／tópicos são preservadas e o outro grupo não muda; reabrir não reenvia, e após `/disable` no Feishu a interface sincroniza.
Enquanto salva, não é possível operar repetidamente; falha de desconexão mantém o estado original e mostra a entrada de atualização; com o robô desligado o interruptor de grupo é desabilitado.
Testes unitários cobrem isolamento agregado, tópicos duplicados, espera／falha／no-op do interruptor e falha de carregamento; não substituem a aceitação real ponta a ponta.
Por pedido do usuário não foi iniciado o dev naquele momento, e este item permanece pending; em 2026-09-23 foi adicionado o caminho de sucesso de salvamento no Desktop（ver o fim deste documento）, e o controle remoto do celular continua não verificado.
Commit de encerramento de 2026-09-17: lista／interação de grupo e serviço de grupo somam 91 testes unitários passando; testes unitários não são tratados como aceitação real de canal.

## BOT-UI-TP-PREPARATION: bolha de mensagem em estado de preparação

- Candidato：`packages/ui/test/browser/manual-review/pending/topic-preparation.test.mjs`，com fixture local ao case no mesmo diretório。
- Testes unitários：`packages/ui/test/v4BotTopicPreparation.test.ts`；cobre deduplicação por ID de mensagem original, ID de lote, corpo igual com IDs diferentes preservados, corpo em branco sem bolha, ícone de carregamento na linha de origem e tooltip de hover／focus.
- Navegador: largura desktop／celular × chinês／inglês × tema claro／escuro, com componentes e estilos reais; preparação, espera, remoção por falha e sobreposição na recepção; o corpo reaproveita o collapse／expand da mensagem oficial, e o loading fica ao lado do canal／nome.
- Desktop／celular reais／E2E do Feishu aguardam verificação, e o Chrome em tela estreita não conta como aceitação real de celular.

 Validação de componente desta rodada: os 8 grupos de navegador acima passaram e as capturas de tela dos temas claro e escuro foram inspecionadas manualmente; 42 testes unitários de preparação／expansão de mensagem original／edição de mensagem e 33 de regressão de timeline／marcas passaram; typecheck da raiz, `architecture:check --changed` passaram, lint com 0 error e 48 warnings. As capturas estão no diretório temporário do sistema `zcode-topic-preparation/`.

Correção posterior de 2026-09-17: a mensagem de preparação passou a entrar no fluxo de mensagens ConversationTurnGroup, compartilhando o componente de corpo completo, e estado／falha／retry ficam no mesmo DOM da bolha. Foram adicionados render-unit e regressões reais do componente turn-group, cobrindo ausência de rows da CLI, preservação do running live tail e substituição pela entrada oficial; 140 testes unitários relacionados passaram. Typecheck da raiz, lint（0 error, 48 warnings）、verificação de arquitetura passaram; os 8 grupos de navegador passaram. Feishu real e celular remoto continuam aguardando aceitação.

Ajuste da linha de origem em 2026-09-17: o texto de preparação não fica mais permanentemente visível e passa a ser「飞书/Lark · 姓名 + loading」, com o estado no tooltip de hover／focus; corpo vazio não cria bolha. 119 testes unitários relacionados e 8 grupos de navegador passaram; cobrem a resolução inicial de configuração do Lark, o isolamento de configuração tardia de tasks antigas, nome longo, tooltip e retry. Typecheck, lint (0 error, 48 warnings) e a verificacao de arquitetura passaram. Feishu real/celular remoto aguardam aceitacao.

Remoção da exibição de falha na preparação de material em 2026-09-17: a falha não é mais projetada como mensagem temporária; o erro vermelho, o botão de retry e a origem órfã foram removidos, e nenhum render unit em branco é produzido; registro／execução／resposta do Feishu não foram alterados. 75 testes unitários e 8 grupos de navegador cobrem falha inicial, preparação que vira falha e preservação das outras mensagens; Feishu real／celular remoto aguardam aceitação.

## Retorno contínuo em conversa privada

| Case          | 状态    | 用例                                                                                 | 证据边界                                                                                   |
| ------------- | ------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| BOT-E2E-PS-01 | pending | `packages/desktop/test/e2e/bots/manual-review/pending/bot-private-task-sync.test.ts` | controlled-stream，三渠道出站 HTTP、连续 desktop/mobile 来源轮次与停用；真实 IM/手机未验证 |

Suplemento de serviço: assinatura compartilhada por múltiplos alvos, deduplicação de tasks automáticos, atualização／leitura após reinício／retry explícito do token do WeChat e isolamento ao trocar de vínculo. Suplemento de UI: o botão de retry só é acionado explicitamente, fica desabilitado durante o envio, some no sucesso e exibe o erro. Nada disso substitui a aceitação manual de canal real.

## Native channel mention reply

BOT-E2E-MN-01: `bots/feishu-channel-mention.test.ts`，
servico/provider sinteticos validam o no de entrada atual, o at nativo no corpo, a sessao fixa, a idempotencia e a rejeicao de alvo desconhecido.
A vinculacao da mensagem pai da ferramenta CLI, o protocolo e a exibicao do no no cliente sao cobertos por testes unitarios separados; a validacao real no Feishu e feita pelo usuario.

Validacao de 2026-09-23: os 4 cenarios sinteticos Feishu/Lark x grupo/topico de MN-01 passaram no Desktop WDIO
（`desktop-e2e-20260923052447997-p75879-83688b39c0a71a8a`）, permanecendo pending na epoca; em 2026-10-08 foi promovido.
`channel-mention.test.mjs`  de `channel-mention.test.mjs` em 390/1200px x temas claro e escuro, 4 cenarios de componente reais, passaram;
O contrato da ferramenta CLI, a vinculacao da entrada de execucao atual, a persistencia de origem, o protocolo reverso e o isolamento de conexao Host/remoto tem testes unitarios proprios.
Isso nao constitui validacao de notificacao em tenant real, de resposta de outro robo ou de celular replayable em aparelho real.

## 2026-09-23 complemento da cobertura de ramos

Vale como referencia a tabela de aceitacao de ramos aceitos do case catalog. Os novos TP-04/TP-05/FN-01/MN-02 priorizam Host/CLI reais;
nos cases GR/MN/TP/PS existentes o comportamento ja definido foi estendido, e GR-UI-01 complementa com interacao real de componente.
As evidencias precisam ser marcadas separadamente como service synthetic, CLI real, DOM do Desktop, celular replayable e tenant ao vivo;
as evidencias desta rodada sao as abaixo, sem reaproveitar contagens de aprovacoes antigas. A correcao de recibo de sucesso duplicado nao foi reaberta.


| Case | 当前证据 | 结论 |
| --- | --- | --- |
| MN-02 / FN-01 | `conversation-session-bot-channel-worker.test.ts`：真实 CLI 工具、反向 RPC、两次原生提及、无来源桌面续聊；真实 text delta 丢帧，终态仍完整回传一次 | passed，formal |
| TP-04 / TP-05 | `conversation-session-bot-topic-worker.test.ts`：收到真实流后自动停止，完成停止后才提交下一条；真实 ReadSessionContext 结果、落盘文件字节及跨任务拒绝 | passed，formal |
| GR-02 正常晋升 / PS-01 | `conversation-session-bot-continuous-worker.test.ts`：群排队自然晋升并引用正确消息；真实 IM 首轮及 desktop service 续聊各回传一次 | passed，formal |
| GR-UI-01 | `feishu-bound-groups-ui.test.ts`：Desktop 实际点击、RPC 保存、话题计数和其他群/机器人不变 | passed，formal |
| TP-03 | 飞书/Lark × 是否明确提及共四场景：可信消息边界、真实 run 来源、引用当前提问、审批 @ 管理员、问答按提及决定 @ | passed，pending |
| GR-02/04 旧 Desktop runtime | v3 状态文件、职业引导和新 Provider 分组夹具已更新；队列展示、取消、来源详情与已收到操作执行至通过；群草稿 `/mode yolo` 失败 | failed，不算全 case 通过 |

O caminho real dos novos cases de worker e `packages/desktop/test/e2e/conversation-session/manual-review/pending/`;
os outros candidatos ficam em `packages/desktop/test/e2e/bots/manual-review/pending/`.
Os fixtures de provider locais ao case dos tres workers e os manifests canonicos passaram no fixture checker;
as hints do checker sobre markers de resultado nao indicam entrada nao correspondida: eles sao usados apenas em assercoes de saida e de conteudo de arquivo.

Evidencias de execucao:

- `desktop-e2e-20260923072023647-p32033-0a7006ae178b1ce2`： MN-02/FN-01, GR-02 promocao normal/PS-01 e GR-UI-01, 4 tests no total, passaram. A primeira versao da assercao de arquivo do TP-05 nesse lote falhou por tentar interpretar o texto da ferramenta como JSON completo e depois foi corrigida para o formato real de saida da ferramenta.
- `desktop-e2e-20260923072235577-p39368-fb67b05b6f0e5ef6`: TP-04/05, dois testes, passaram; MN-01 com quatro, PS-01 com tres canais e tres, runtime authority com dois, remote disconnected com um, automation result com um e provider interactions com tres, passaram. As falhas de GR runtime e do fixture antigo do TP-03 sao registradas separadamente e o lote nao e escrito como aprovado por inteiro.
- `pnpm typecheck`, `typecheck:e2e` do Desktop e `architecture:check --changed` passaram; 6 arquivos de teste unitario relacionados somaram 149 tests passando.
O `pnpm lint` da raiz falhou por max-lines em arquivos nao alterados nesta rodada:`packages/shared/src/zcode-protocol-v4/command.ts`  com 405 linhas;`packages/ui/src/v4/conversationTurnRenderUnits.ts`  com 401 linhas; o lint direcionado dos testes e helpers alterados nesta rodada ficou em 0 error/0 warning.

Questoes e limites em aberto:

1. O `/mode yolo` do GR runtime realmente retorna `Mode option not found.`, e depois disso a permissão da nova session é `{scope:"session",mode:"build"}`. `listDraftConfigOptions` retorna apenas reasoning, e mode.set não tem candidatos; ao comparar com `origin/staging`, a mesma implementação já existe na baseline. Mantém-se a asserção original de isolamento do yolo, sem modificar a implementação do produto nem baixar a expectativa; portanto o case continua falhando e as asserções seguintes não foram executadas.
2. Durante o debug de TP-05, a interface antiga `readSessionMessages` mostrou que a estrutura retornada pela CLI atual não bate com o schema antigo（messageId/sessionId contra id/sessionID 等）. A verificação final de arquivo lê o resultado real de tool completed do SQLite da CLI isolada, sem contornar o download de ReadSessionContext; esse problema da interface antiga de consulta não foi corrigido nesta manutenção de testes.
3. Celular replayable real, SSH, Windows／Linux, notificações de tenant Feishu／Lark reais e a resposta de outro robô não foram verificados. Testes Node Host／CLI bem-sucedidos não se passam por Electron UI, e janela estreita não se passa por celular.
4. Na verificação inicial todos os novos cases permaneceram pending; em seguida o usuário confirmou a promoção, e o estado final está na seção abaixo. Como as verificações necessárias ainda têm falhas, não há commit automático.


A configuracao isolada final do GR-UI-01 mantem a referencia de vinculo sem credencial, evitando disparar automaticamente o registro por QR code;
`desktop-e2e-20260923072504683-p46231-87bcca99bca1deb4` nesse item passou, e a captura de tela mostra os dois interruptores de grupo e as contagens 2/0 de topicos.
TP-03 atualizou o limite de historico atual, trocou a referencia pela mensagem raiz pela referencia a mensagem atual e adicionou o campo de entrada real `mentionedBot` e a origem de run/input;
O lembrete de administrador da aprovacao de permissao nao e limitado por esse campo; apenas a pergunta e resposta comum e. Nao se pode inferir o comportamento real do cliente a partir da falha de um fixture antigo sem esse campo.

Os quatro cenarios finais do TP-03 em `desktop-e2e-20260923073023766-p58398-07c97a81dceae606` passaram todos.
Somando sem duplicatas conforme a versao final: 6 tests novos nesta rodada mais 18 tests de regressao relacionada passaram, e um case completo do GR-02/04 continua falhando;
falhas intermediarias e replays repetidos nao contam como aprovacoes. Este e o registro de verificacao anterior a promocao; o estado final dos diretorios esta na secao abaixo e os limites nao verificados acima continuam valendo.

### 2026-09-23 confirmacao de promocao pelo usuario

Apos a confirmacao do usuario, quatro specs novas (seis testes) entraram no diretorio formal:

- `conversation-session/conversation-session-bot-channel-worker.test.ts`
- `conversation-session/conversation-session-bot-topic-worker.test.ts`
- `conversation-session/conversation-session-bot-continuous-worker.test.ts`
- `bots/feishu-bound-groups-ui.test.ts`

As três primeiras usam replay com common independente e fixture local ao case; o case de UI usa configuração isolada, sem requisições de modelo. O case com falha de `/mode yolo` já existente permanece pending. Não houve validação Docker nem admissão de CI nesta rodada, e isso não representa aceitação de tenant Feishu real, celular ou outros sistemas desktop.

Verificacao apos a promocao:

- Replay com fixture independente explicito:`desktop-e2e-20260923080004888-p15664-50144fe647413bfe`，4 spec / 6 tests passaram todos.
- Replay padrao:`desktop-e2e-20260923080201440-p21714-f35052aadb92370c` com 4 spec / 6 tests, todos passando. O servico de replay do Worker so carrega o common e o seu proprio fixture local ao case.
- Os tres fixture checks, o typecheck de E2E do Desktop, o typecheck raiz, a verificacao de arquitetura e a auditoria de cobertura passaram; o lint direcionado das specs/helpers novas ficou em 0 errors / 0 warnings. Os avisos de markers nao correspondidos do fixture check correspondem a assercoes de saida/conteudo de anexo e nao a requisicoes faltantes.
- A auditoria de promocao encontrou duas syntheticReason do manifest Highspeed inconsistentes com o fixture de provider; o texto explicativo foi sincronizado mecanicamente, sem alterar requisicoes nem semantica de teste.
- Na primeira promocao o lint raiz tinha dois erros de max-lines, resolvidos depois por `536dd65dce`, que separou o schema de configuracao dos tipos de renderizacao preservando o comportamento e a entrada de export existentes.
- `905e271182` completou o mock do servico de Bot do teste Highspeed e passou a esperar a coleta assincrona do servico stdio antes de limpar o diretorio temporario. O typecheck final, o lint (0 errors / 62 warnings), a verificacao de arquitetura e o pre-push completo passaram; o pre-push cobriu 76 arquivos de teste alterados e a regressao relacionada de 196 arquivos-fonte. Este resultado nao substitui o Desktop E2E ou a admissao Docker/CI ainda nao aprovados acima.

## 2026-10-08 remocao da entrada de detalhes do topico

A barra de acoes de resposta nao exibe mais botao nem popover de detalhes do topico; as evidencias antigas de exibicao de detalhes do TP-01 nao representam mais o contrato de UI atual. As regressoes de componente cobrem a ausencia de entrada para entrega bem-sucedida em task de topico e a manutencao do botao de recuperacao para entregas com falha/desconhecidas. As regressoes de componente e de turno de sessao somaram 119 testes passando; as 8 combinacoes no navegador real em larguras 390/1200 x chines/ingles x temas claro e escuro passaram, asseverando que a entrada de detalhes desapareceu e que a camada de recuperacao de falha ainda abre. O Desktop real e o E2E de relay em celular nao foram rodados novamente nesta rodada.

## TP-06 mensagens de outros robos

Reaproveita o cenario TP-04 de `conversation-session-bot-topic-worker.test.ts` e acrescenta assercoes de entrada de outros robos resolvida pelo Provider real e de filtragem das proprias mensagens. Os testes unitarios de Provider/servico cobrem os dois canais, os limites de nao integrado/ saida, o isolamento de comandos de controle, eventos duplicados e o historico de robos.

Validacao de 2026-10-08: 5 arquivos de teste unitario somaram 232 testes passando; 2 testes de E2E desktop passaram, com o registro de execucao em
`desktop-e2e-20261008-085523-181`. O Host/CLI real prova que a mensagem de outro robo, apos parar a execucao antiga,
entra na mesma task e responde com sucesso, e que callbacks duplicados e as proprias mensagens nao adicionam entradas; a consulta pela ferramenta de recursos historicos continua passando.
A verificacao de fixture, o typecheck raiz, o desktop typecheck:e2e, o lint e a verificacao de arquitetura passaram; o lint mantem
os warnings ja existentes. O HTTP de plataforma e o modelo sao substitutos isolados e nao substituem push real de Feishu/Lark, permissao de tenant,
a interface de controle remoto do celular nem verificacao em outros sistemas operacionais. Esta rodada nao modifica a cadeia desktop continuous / celular replayable.

## 2026-10-08 limite de respostas automaticas entre robos

- TP-04: uma task de topico em Host/CLI real recebe consecutivamente 5 mensagens de robo; enquanto a 5a ainda roda, a 6a nao dispara stop nem admission; apos a chegada de uma nova mensagem de pessoa real, o recebimento continua.
- MN-01: o callback nativo de bot em Feishu/Lark no chat principal aplica o limite de 5, nao conta duplicatas e retoma com mensagem de pessoa real.
- Testes unitarios de servico: limite de concorrencia, reenvio antigo de pessoa real nao retoma, isolamento entre chat principal e topico e preservacao do limite em um servico recriado apos serializar o schema v3.
- Limitacoes: o HTTP de plataforma usa fixtures sinteticos; isso nao prova permissao de push de robo em tenant real nem comportamento de celular remoto em aparelho real. O guard afeta apenas o inbound do Bot Host e nao altera o protocolo de recuperacao de estado de execucao do desktop continuous / mobile replayable.

Verificacao: `desktop-e2e-20261008-113805-939` com 6 passing nos dois specs formais; depois de reforcar as assercoes em tempo de execucao,
`desktop-e2e-20261008-114025-803` o topico em CLI real `desktop-e2e-20261008-114025-803` deu 2 passing; servico/Provider/armazenamento/mention somaram 216 testes unitarios passando.

## 2026-10-09 regressao de referencia e replay de entrega

O case formal MN-01 cobre o replay de envio ativo em Feishu/Lark x grupo/topico: a resposta da plataforma e controlada por uma barreira de Promise,
o replay nao pode retornar antes, os dois recibos finais sao consistentes e ha apenas um envio; a referencia de robo em grupo comum le a mensagem pai.
`desktop-e2e-20261009-022912-432`: 4 passing. Apos o primeiro build completo a criacao da sessao WebDriver expirou,
e a repeticao com o mesmo build teve sucesso; essa falha de inicializacao nao conta como aprovacao de case.
Servico/Provider/delivery somaram 138 testes unitarios passando, cobrindo a referencia pai de texto/anexo de bot/app, o filtragem da propria mensagem,
a espera de replay no envio ativo e no retry com limite de taxa e o nao reenvio de um unknown remanescente do reinicio. O HTTP de plataforma e um substituto sintetico,
e nao substitui notificacao em tenant real, celular remoto nem verificacao entre sistemas operacionais.

## 2026-10-09 identidade de multiplos robos e limite de atribuicao

- Extensao do TP-04: com a CLI real em execucao, uma mensagem nativa que so marca outro robo nao dispara stop/admission; a proxima entrada valida le esse contexto de fundo carregando a identidade do robo atual e, apos a recepacao bem-sucedida, limpa a marca de releitura.
- Testes unitarios de servico: nomes iguais com IDs diferentes nao disputam resposta; um servico recriado preserva o checkpoint de releitura; um novo fundo durante a releitura e guardado para a proxima rodada; saida vazia sem @ fica silenciosa e saida vazia com @ explicito mantem o aviso de conclusao.
- Testes unitarios da CLI: o contexto do modelo contem a propria identidade, se cada mensagem marca o proprio robo e o limite de responsabilidade; em uma task de outra pessoa sem @ e permitido nao chamar ferramenta e nao responder.

Verificacao: `desktop-e2e-20261009-072256-679` com 2 passing em TP-04/05; servico 112,
Provider 100 e contexto da CLI 5 testes passaram. Typecheck raiz, typecheck da CLI, desktop
typecheck:e2e, lint raiz, lint dos arquivos da CLI alterados e as verificacoes de arquitetura e de fixture passaram.
O lint completo da CLI foi bloqueado por erros de max-lines existentes nos arquivos debug/cli/telemetry, que nao foram alterados.
O HTTP de plataforma e o modelo usam fixtures sinteticos; isso nao prova que um modelo real sempre compreende corretamente a divisao sem @ e nao substitui tenant real,
celular remoto nem verificacao em outros sistemas operacionais. Esta rodada altera apenas a entrada do Bot e o contexto de entrada, sem modificar o protocolo de recuperacao de stream do desktop continuous /
mobile replayable; nenhuma admissao Docker/CI foi adicionada.

### Silencio ao parar em grupo (2026-10-09)

Os quatro casos de MN-01 em Feishu/Lark x chat principal/topico cobrem o `/stop` bem-sucedido nao retornando cartao de status e
o evento de conclusao por cancelamento nao entregar notificacao de parada. Testes unitarios do servico de grupo validam a atualizacao da reacao de parada e o destinatario original da resposta de erro.
O resultado de execucao desta rodada segue o registro de verificacao do MR, e a cobertura de canal sintetico nao representa validacao de tenant real.

### Candidatos de nome entre tasks (2026-10-09)

As quatro combinacoes de MN-01 em Feishu/Lark x chat principal/topico simulam a troca de task e a recuperacao a partir do estado persistido, e
na nova task, fornecer apenas o nome em texto puro ainda resolve mencoes nativas do historico sob a mesma autorizacao, enquanto usar diretamente o ref antigo rejeita o envio.
Testes unitarios cobrem ainda o isolamento dos nos de historico entre autorizacoes, grupos, apps, bots e providers diferentes.

### Regressao da revisao do MR (2026-10-09)

O case TP-04 existente em Host/CLI real ganha um lote de requisicao valida seguida de um so @ durante a barreira de parada, verificando que
as mensagens originais sao todas admitidas e que destinatarios nativos com o mesmo nome sao diferenciados pelo isCurrentBot da requisicao real ao modelo.
Os testes unitarios do Provider cobrem antes do checkpoint, apos a chamada, a remocao e a falha de expansao de um cartao obrigatorio dentro da janela.
O isolamento de plataforma/modelo sinteticos nao substitui um tenant real, e o desktop continuous/mobile replayable nao foi alterado.

Regressao de posicionamento da projecao de identidade: os testes unitarios da CLI cobrem corpos iguais, troca de posicao antes/depois do @ nativo, repeticao do mesmo alvo e lotes com varias mensagens;
o TP-04 verifica na requisicao real ao modelo a estrutura ordena