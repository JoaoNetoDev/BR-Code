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

## Refactor do material de entrada (fronteira atual)

O TP-01 agora cobre a admissão de início imediato do tópico e a apresentação de mensagens originais através do Host/CLI real. Setup: uma execução de streaming controlada; ação: enviar um lote de tópico com duas mensagens originais, uma citação da raiz e um anexo de histórico; asserções: nenhum input enfileirado, remetentes/corpos originais separados, citação/histórico apenas da primeira mensagem e pré-visualização do texto original nos tamanhos de Desktop e de viewport estreita. O material é sintético; a coleta nativa de histórico do Feishu e a coordenação de parada do serviço do Bot exigem testes de service separados e aceitação manual. O registro de execuções subsequente do TP-01 está neste documento; os resultados antigos de queue／Steer servem apenas como histórico. O case atual submete após parada manual e ainda não prova a coordenação automática de parada do Bot; o novo TP-04 cobre isso especificamente.

## Colaboração em tópico (em andamento)

| Case          | Status  | Limite da evidência                                                                                                                                                |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BOT-E2E-TP-01 | pending | `bots/manual-review/pending/feishu-topic-runtime.test.ts`; Host/CLI e DOM reais, lote/materiais de tópico sintéticos; reutiliza a fixture de controlled-stream do runtime de grupo |
| BOT-E2E-TP-02 | pending | verificação nativa parcial: roteamento comum/dedicado, histórico incremental, resumo de background longo; os demais cases nativos estão abaixo                            |

Os testes unitários de Provider/service/Agent cobrem isolamento de tópico, opt-in do
owner, limites de mensagem, resumo limitado e payloads de API nativos. Eles não
estabelecem compatibilidade real com tenant do Feishu/Lark. Viewport estreita do
Desktop não substitui a validação do mobile remote replayable.

Verificação da implementação de tópico (2026-09-07): 222 testes focados de
provider/service e 169 testes de runtime/archive/summary do Agent passaram. Os
typechecks da raiz e do core da CLI passaram; o lint reporta 43 warnings existentes
e zero erros. Uma regressão separada de roteamento remoto com 35 testes passou. As
fronteiras existentes de desktop continuous e mobile replayable permanecem
inalteradas; esses testes unitários não estabelecem operação real em celular.

O TP-01 passou na execução controlada de macOS com Host/CLI + DOM do Desktop
`desktop-e2e-20260907140113423-p6639-99c0f20745391c21`, incluindo cancelamento de
anexo enfileirado, reconciliação de entrega em tela estreita e detalhes do tópico. O
`feishu-group-runtime.test.ts` existente passou na mesma execução (duas specs
passaram). A identidade nativa do tópico e a entrega salva foram semeadas; o case
permanece pendente de revisão manual.

O `pnpm verify:pre-push` passou na reexecução. A primeira execução ampla reportou uma
falha de asserção de renderização otimista não relacionada em `SubagentsSection`
(9.800 testes passaram); seu arquivo de 36 testes passou isoladamente e, em seguida,
todo o comando de pre-push passou sem E2E concorrente. Nenhum teste ou implementação
não relacionado foi alterado. A formatação dos arquivos alterados e o
`git diff --check` passaram.

A verificação ao vivo foi retomada em 2026-09-08 depois que o Mac foi desbloqueado. O
processo `pnpm dev:desktop` existente concluiu a inicialização (PID do Electron
17515, Host local 17711; log de desenvolvimento `/tmp/zcode-topic-dev.log`). O
Computer Use operou o Ryan Bot no grupo real `ZCode 群聊验证`
(`oc_da0fa1e9e7e9f852894c8d6aaca1c044`).

- `/history on` retornou a confirmação nativa de opt-in. Uma mensagem comum na raiz
  e uma resposta comum no tópico não criaram nenhuma task antes da primeira menção
  explícita ao bot.
- O Tópico A (`omt_19fae40ad30fdbe5`, raiz
  `om_x100b66c282f2dcacc4922dae1e667f0`) criou a task
  `sess_8c86bd38-5bb4-4f4d-8e4a-4f0521b92eef` na primeira menção. O resultado nativo
  `om_x100b66c29c2ee0acdfa3a1a2b0a964c` apareceu dentro do Tópico A; o status de
  entrega persistido era `sent`.
- O Tópico B (`omt_19fae586a54e1b83`, raiz
  `om_x100b66c29a35b8b0c2ffcd23b5457a7`) criou uma task separada
  `sess_35dd54ab-a705-480d-839f-26e726c96837` e respondeu `TOPICBREADY` dentro do
  Tópico B (`om_x100b66c296b92104c3434026e359f3e`). A task padrão do grupo permaneceu
  `sess_5ec4cfa2-10e5-46d9-947f-eb2fe9a3eb27`. As reações de conclusão ficaram
  visíveis.
- A API real de histórico recusou o acesso com `need scope: im:message.group_msg`.
  Os dois tópicos exibiram o aviso explícito de modo básico. O Tópico A corretamente
  não alegou conhecimento de background não lido. Isso prova o comportamento de
  permissão ausente, **não** a recuperação bem-sucedida do histórico ou a ingestão
  incremental.
- A permissão foi localizada na página ao vivo de gerenciamento de permissões do
  aplicativo como `获取群组中所有消息（敏感权限）`, sob a identidade do aplicativo.
  Habilitá-la e publicá-la ficou a cargo do usuário. Uma sondagem posterior somente
  leitura, com um token de aplicativo novo, retornou `code: 0` para o histórico nativo
  do tópico A, incluindo sua raiz (position -1), a discussão comum (position 0), o
  pedido (position 1) e dois cards de aplicativo. Isso estabelece a permissão e o
  acesso à API nativa.
- Depois que o espaço em disco se recuperou para 12 GiB, o Computer Use enviou o
  pedido `om_x100b66c367d6ec70c122bdda2618103` no Tópico A. A resposta nativa visível
  foi `Codename: APRICOT; agreed launch day: Friday.` O snapshot de input aceito
  continha exatamente a raiz e a discussão comum sobre sexta-feira, com `hasGap: false`.
- Uma mensagem comum posterior mudou o dia de lançamento para segunda-feira
  (`om_x100b66c365b480a0c10ca8be0bba666`). Antes da próxima menção, o tópico ainda
  tinha dois inputs aceitos e nenhuma nova resposta do bot. A menção seguinte
  `om_x100b66c3604438b8c459784b98545d6` produziu a resposta nativa
  `Codename: APRICOT; latest confirmed launch day: Monday (changed from Friday).`
  O background persistido continha **somente** essa nova mensagem comum; a raiz, a
  discussão antiga, os pedidos anteriores e as respostas do bot não foram
  reinjetados. Os dois pedidos bem-sucedidos foram concluídos na task original do
  Tópico A, com checkpoints iguais aos respectivos IDs das mensagens de pedido.

A árvore de acessibilidade do Desktop continha as novas tasks, mas sua captura de
tela permaneceu em uma visão mais antiga e o CDP somente leitura reportou um renderer
oculto. Isso não é aceito como verificação visual real do Desktop. Limites de
histórico longo, anexo nativo, cenários de controle por card, Lark, controle remoto
físico em celular e Windows/Linux permanecem não verificados. O TP-02 continua
pendente.

A tentativa de pre-push de atualização de evidências de 2026-09-08 parou com `ENOSPC`
ao carregar `zcodeAgentService.v4.test.ts` (22 arquivos / 339 testes passaram antes da
suíte que falhou; nenhum teste rodou nessa suíte). Restavam apenas cerca de 159 MiB
no volume do sistema. Isso é uma falha de ambiente, não um gate aprovado nem uma
regressão de implementação confirmada. Depois que o espaço em disco se recuperou
para 12 GiB, a reexecução completa de `pnpm verify:pre-push` passou
(`/tmp/topic-evidence-prepush-retry.log`).

O grupo privado real `ZCode 专用话题验证` (`oc_6596fb27f96a81b6ee5c34cc09be6089`) foi
criado pela API nativa com `chat_mode: topic`, tendo Ryan Bot e o usuário vinculado
como seus únicos participantes. O Computer Use confirmou a página nativa de grupo de
tópico e sua entrada de criação de tópico.

A execução em tópico dedicado foi então verificada pelo Computer Use em 2026-09-08:

- Publicar uma menção de owner `/enable` como raiz de tópico habilitou o grupo pai e
  retornou o card nativo de habilitação dentro daquele tópico. A task padrão do grupo
  pai continuou ausente.
- Uma menção posterior dentro desse tópico retornou `DEDICATEDREADY`, com uma reação
  de conclusão. O thread nativo `omt_19fafc4ae38e9be0` (raiz
  `om_x100b66c306f1d4b8c4cdd16b32ac7e0`) ficou vinculado à task
  `sess_895438b4-d7d0-4136-bc07-878ec258476d`; o input aceito
  `om_x100b66c3057900a4dd82aa5adb6242a` foi concluído e sua entrega salva era `sent`
  (`om_x100b66c303bf28b4c102b2c7b21c42f`).
- Um segundo tópico, com uma menção diretamente em sua raiz
  `om_x100b66c3189decbcc27d014d2d7c4fc`, criou um thread distinto
  `omt_19fafdac200edb8b` e a task `sess_f34a27da-c0dd-4e34-b200-ce4952cb9f70`. O
  Computer Use abriu esse tópico e observou `DEDICATEDSECOND` e uma reação de
  conclusão sob sua própria raiz. Isso estabelece tanto o roteamento por menção na
  raiz quanto por menção em resposta, em um grupo real com `chat_mode: topic`,
  separados das tasks de grupo comum.

Dedicated-group history, attachment/card-control races, long history and remaining
cross-platform cases are still pending; the broader TP-02 case is not promoted.

Fonte: [Bots E2E Case Catalog](../bots-e2e-case-catalog.md)、[Bots](../bots.md) e [Bot Channel Runtime Split](../bot-channel-runtime-split.md)。

## Dimensões de estado

| Dimensão            | Classes de equivalência                                | Tratamento nesta rodada                                                                                                    |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Provider            | Feishu, Lark, Telegram/Weixin                            | Feishu representa a implementação de cards compartilhada; domínio de Lark é outro caso; providers sem card foram podados       |
| Ciclo de vida da resposta | create, running update, terminal update               | BOT-E2E-SC-01 afirma tudo explicitamente                                                                                  |
| Bloco de stream     | message, tool start/update, terminal                     | BOT-E2E-SC-01 usa controlled stream                                                                                       |
| Locale              | zh-CN, en-US                                              | SC-01 cobre zh-CN; en-US permanece coberto pelo contrato unitário de provider/service, podendo virar pairwise depois        |
| Tipo de entrega     | bot-channel-continuous, web-remote-replayable            | Só o primeiro é aceito; o segundo é podado pelo invariant de arquitetura                                                 |
| Autoridade de runtime | local host, attached remote host, competing local hosts | SC-01 cobre o local; os demais entram na frente dedicada de RT                                                             |
| Evidência           | service action, subscription, provider HTTP, card JSON  | SC-01 prova as quatro camadas em conjunto                                                                                  |
| Origem da automation | Feishu, Weixin, UI comum                                | CR-01 cobre Feishu no E2E formal; Weixin é coberto pelo protocolo compartilhado e pelo teste de integração do provider service; a UI comum afirma que não há delivery target |
| Resultado da automation | complete, error, Bot unavailable                      | CR-01 cobre o retrocesso de estado final e a degradação best-effort                                                        |
| Persistência        | create no mesmo processo, reabertura do repository      | CR-01 precisa provar que o alvo da sessão original continua legível após reinício                                         |
| Falha de conexão    | unbound, bound                                           | CF-01 cobre o estado de conflito de bound; unbound já é coberto por testes de componente e foi podado do Desktop E2E          |

## Tabela de cobertura

| Case ID       | Prioridade | Status  | Spec                                                                     | Timing             | Setup / Action / Assertion                                                                                                                |
| ------------- | ---------- | ------- | ------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| BOT-E2E-SC-01 | P0         | formal  | `packages/desktop/test/e2e/bots/feishu-streaming-card-lifecycle.test.ts` | controlled-stream  | Callback do Feishu cria a task; injeta stream por fases; afirma card único, linha do tempo, collapse, Typing e a assinatura continuous                        |
| BOT-E2E-AQ-01 | P1         | formal  | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | controlled-stream  | elicitation pendente; callback de múltipla escolha/personalizado; atualiza no lugar o mesmo message_id e envia a resposta do protocolo                      |
| BOT-E2E-IL-01 | P0         | formal  | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | controlled-stream  | Fecha o card principal antes de bloquear; avanço do card de interação/preservação do estado final; a saída seguinte do Agent abre um novo card de stream         |
| BOT-E2E-RT-01 | P1         | formal  | `packages/desktop/test/e2e/bots/bot-runtime-authority.test.ts`           | controlled-process | Owner mantém o lock; o contender é rejeitado; takeover após a liberação pelo owner                                                        |
| BOT-E2E-RT-02 | P0         | formal  | `packages/desktop/test/e2e/bots/bot-runtime-authority.test.ts`           | fast-process       | Remote host anexado; o runtime permanece idle; nenhuma requisição de rede ao provider                                                    |
| BOT-E2E-PV-01 | P1         | formal  | `packages/desktop/test/e2e/bots/feishu-provider-interactions.test.ts`    | fast-text          | Callback idêntico em Feishu/Lark; afirma a origem OpenAPI de cada um                                                                         |
| BOT-E2E-RW-01 | P0         | formal  | `packages/desktop/test/e2e/bots/bot-remote-disconnected.test.ts`         | controlled-stream  | Workspace remoto desconectado; mensagem comum rejeitada; sem reconnect, sem resolver o service remoto, sem execução local                           |
| BOT-E2E-CR-01 | P0         | formal  | `packages/desktop/test/e2e/bots/bot-automation-result-delivery.test.ts`  | controlled-stream  | Feishu cria a automation; reabre o repo; assina antes de despachar; retrocesso de complete/error; degradação com Bot inválido; o outbound do provider Weixin é coberto pelo teste de integração de service |
| BOT-E2E-CF-01 | P0         | formal  | `packages/desktop/test/e2e/bots/feishu-runtime-error-ui.test.ts`         | controlled-process | Feishu já vinculado sem credencial; habilita o runtime; reabre o popup do bot e afirma a preservação da vinculação, a conexão interrompida e o detalhe do erro            |

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

## Adições de colaboração em grupo

| Case          | Status  | Evidência necessária                                                        |
| ------------- | ------- | --------------------------------------------------------------------------- |
| BOT-E2E-GR-01 | pending | ativação de grupo, verificações de owner, estado privado/grupo e origem canônica |
| BOT-E2E-GR-02 | pending | FIFO real da CLI e cancelamento por CAS; projeção desktop/mobile            |
| BOT-E2E-GR-03 | pending | resultados segmentados salvos, incerteza e revalidação de autorização      |
| BOT-E2E-GR-04 | pending | DOM real do painel de task, rótulos de origem localizados e retry de resultado salvo |

Os cases permanecem pendentes de revisão manual; a evidência de execução automatizada está registrada abaixo, sem promoção. Continuous Desktop, celular replayable e as subscriptions Bot independentes mantêm suas fronteiras de entrega existentes.

2026-09-07 evidência de provider/serviço do GR-01: Desktop WDIO em macOS passou os cases de Feishu e Lark em `desktop-e2e-20260907080816019-p64763-2c57d53b14b98617`. A spec pendente `bots/manual-review/pending/feishu-group-collaboration.test.ts` usa HTTP de provider sintético e admissão de task controlada; ela verifica roteamento de grupo, tasks independentes, ativação/novo apenas por owner, filtragem exata de menções, deduplicação de eventos, metadata de origem e reações após a admissão. A evidência de FIFO real da CLI e de renderer permanece como verificação obrigatória separada; não se reivindica promoção nem validação em tenant ao vivo.

A evidência de runtime do GR-02/04 usará a ponte E2E-only existente `window.__testActions` para submeter uma mensagem de grupo pelo BotsService real do Host para a CLI real, enquanto o Desktop renderiza sua fila canônica. A configuração sintética de bot/associação de grupo é semeada apenas no diretório de dados E2E isolado; nenhuma credencial de bot ao vivo ou mensagem de tenant é usada. A ponte continua condicionada por `shouldExposeE2EStoreBridge` em builds de produção.

- Evidência real de Host/CLI/DOM do GR-02/04: `feishu-group-runtime.test.ts`, execução
  `desktop-e2e-20260907083412006-p20801-c4446c2fbacc5e8b`, 2026-09-07,
  1 passing. O fixture de SSE de provider controlado segura um turno real da CLI enquanto um
  membro do grupo submete pelo serviço real do Host. O Desktop renderiza a mesma fila
  e o mesmo remetente, exclui essa entrada enfileirada sem parar e reconcilia um resultado
  incerto salvo pelo serviço. Isso é pendente de revisão manual; não é evidência de Feishu
  em tenant real nem de remoto mobile.

- Regressão combinada final do Desktop: `desktop-e2e-20260907085131276-p59423-2a071562b47f5926`,
  3 specs / 4 cases passaram (Feishu, Lark, fila de grupo real de Host/CLI com arquivo
  e a regressão existente de Bot remoto desconectado).
- Criação de task de grupo e persistência de permissão: `desktop-e2e-20260907090653408-p90137-073eb0ea483a754d`,
  1 case passou. O cenário real de Host/CLI/DOM também envia `/new`, define o modo de owner
  como `yolo` e submete a primeira requisição de grupo. O registro SQLite isolado da CLI
  tem `permission.scope=session` e o modo selecionado; os padrões de permissão de projeto
  permanecem inalterados. Isso complementa as verificações de fila/arquivo/cancelamento e
  reconciliação de resultado salvo acima.
- Verificações automatizadas em 2026-09-07: 37 arquivos de teste focados do App / 462 testes e
  4 arquivos de protocolo/projeção/facade da CLI / 198 testes passaram; a evidência de regressão
  de anexo remoto, escopo de fila e continuous/replayable é coberta separadamente por
  6 arquivos de teste remotos / 89 testes. O `pnpm typecheck` da raiz passou.
- A execução completa do App afetado executou 880 arquivos: 878 passaram (9.677 testes), com 60
  falhas em duas suítes de SessionPane cujos mocks de componente omitiam a nova dependência de
  aviso de grupo. Depois de isolar o aviso de forma consistente com seu escopo existente de
  testes de composer/modelo, ambos os arquivos / todos os 60 testes passaram na reexecução focada.
  O comportamento do aviso de grupo continua coberto por seus próprios testes e pelo E2E real do Desktop.
  O lint terminou com 43 warnings existentes e 0 erros; o isolamento de permissão de grupo
  adicionou 2 testes de core da CLI passando. `verify:pre-push` foi invocado antes do commit, mas
  sua seleção de testes afetados ignorou as mudanças não commitadas, então a execução completa do
  App afetado acima foi invocada diretamente contra os arquivos alterados.
- Menções em tenant Feishu/Lark ao vivo, visibilidade de referência de anexo, identidade do operador
  do callback, remoção de bot e perda de permissão de fala **não** foram exercitadas contra um grupo
  real. Windows/Linux, navegador/dispositivo mobile real e comportamento completo de reinício
  entre hosts permanecem não verificados. Fixtures sintéticos e testes unitários não substituem
  essas verificações.
- A suíte mais ampla da CLI `session-persistence.test.ts` não passou neste ambiente:
  seus fixtures existentes de adaptador de modelo carecem de `setModelIoFullRetentionEnabled`;
  o isolamento diagnóstico também expôs dependências locais de plugin/hook e expectativas obsoletas
  de eventos legados de fila/prompt. Essas edições exploratórias de fixture foram revertidas,
  e essa suíte não relacionada não é reportada como passando. O novo comportamento de permissão de
  sessão de grupo é coberto pelos testes de facade focados e pelo E2E real de Host/CLI SQLite acima.

Gate pós-commit (2026-09-07): `pnpm verify:pre-push` passou contra o commit de feature
`57d9b6c3b3`. O runner do repositório selecionou todos os 81 arquivos alterados, passou
os 19 arquivos de teste unitário alterados e passou a execução de testes de código afetado
para os 55 arquivos do App correspondentes. O lint também passou (43 warnings, 0 erros). Isso
substitui a seleção afetada pré-commit ignorada anteriormente; as limitações de validação da CLI
legada e de tenant ao vivo acima permanecem inalteradas.

- Regressão do GR-02 (2026-09-07): depois de parar a CLI real e esvaziar sua fila,
  um registro de permissão de Bot obsoleto não deve bloquear `/new`; verificar a criação de
  rascunho e a remoção do registro obsoleto antes de criar a próxima task. A cobertura unitária
  também distingue respostas em execução, enfileiradas e bloqueadas por interação.

  Reprodução ao vivo: o Desktop mostrou uma task parada com fila vazia enquanto o mesmo
  grupo retinha um registro de permissão não tratado na persistência do Bot. Depois de
  reiniciar o `pnpm dev:desktop` normal, uma menção real `/new` às 18:32 retornou
  `Task: draft / State: draft`. Os logs do Host confirmaram `reason=idle` da CLI e a limpeza
  do cache de interação obsoleto. Nenhuma persistência ao vivo foi editada e nenhum `/stop`
  adicional foi enviado. Isso verifica a falha original do Feishu independentemente do
  E2E de runtime isolado. A regressão remota/mobile real permanece não verificada.

  Validação: typecheck, lint (43 warnings existentes), 193 testes de serviço focados e
  verify:pre-push passaram. O E2E de Desktop GR-02/04 corrigido passou em
  `desktop-e2e-20260907103208043-p85801-62fec90a245ce74d` (1 case). A primeira
  tentativa tinha uma permissão sintética inválida sem `response`; uma tentativa subsequente
  de reuso de build saiu antes de testar porque a inicialização de dev removeu `out`.
  Nenhuma das duas tentativas que falharam é contada como evidência de aprovação.

Revisão da barra de ações do GR-04: verificar posicionamento por turno, ausência de painel de composer ou de corpo de resultado repetido, reconciliação do popover, coexistência da fila e estados ocultos de sucesso/em andamento. Evidência de runtime e de UI real a ser registrada após a verificação.

Notas de implementação do GR-04 (2026-09-07): `BotGroupTaskNotice` foi removido por completo.
A recuperação é um gatilho de popover na barra de ações da resposta correspondente. O
`sourceCommandId` persistido corresponde às linhas de entrada canônicas; os IDs de turno de
runtime deliberadamente não são usados como IDs de turno do produto. A projeção em andamento
permanece pendente enquanto o armazenamento retém unknown para recuperação de crash. Nenhuma
mudança no Desktop continuous, no celular replayable, no roteamento por owner ou na admissão
canônica de fila.

A verificação intermediária encontrou e corrigiu um vazamento de ação de Hook em turno de manutenção.
Duas bancadas de teste existentes de SessionPane agora isolam o novo provider de entrega.
A primeira reexecução do E2E de associação usou um renderer activeInputId obsoleto (null no
V4); o teste corrigido lê a atribuição de entrada canônica do ledger da CLI isolada. Outra
reexecução usou window/rect de WebDriver não suportado; agora usa o helper de tamanho de janela
Electron do repositório. Essas reexecuções não são evidência de aprovação.

E2E final do Desktop do GR-04: passou em
`desktop-e2e-20260907105839858-p78673-cee7e60c7f0472f5` (1 case).
Ele verifica a associação canônica de entrada da CLI, a recuperação ao lado da resposta
correspondente, a ausência de duplicação de corpo salvo ou de painel de composer, os limites
do popover em janela estreita, a reconciliação e a ação produzida por uma rejeição real de envio
de resultado de Host/CLI no provider de teste isolado. Não é um teste de falha real na API do Feishu.

Verificação ao vivo em dev normal às 19:03: `pnpm dev:desktop` foi reiniciado, o computer use
enviou uma requisição inofensiva `DELIVERYACTIONOK` na task de grupo existente e a mesma resposta
foi observada no grupo de teste real do Feishu (rotulado Desktop). O Desktop não mostrou painel
de entrega do composer nem indicador unknown espúrio. O novo registro de entrega tem um
sourceCommandId canônico, status sent e nenhum erro. Nenhum estado real do Bot foi editado.
Falha/timeout em tenant real, remoto mobile, tema claro e execução em Windows/Linux permanecem
não verificados; tokens semânticos e caminhos de UI compartilhados são mantidos.

Typecheck, typecheck de E2E do Desktop, lint (43 warnings existentes) e suítes de regressão
focadas passaram. A execução ampla de testes afetados passou depois de corrigir a elegibilidade
de Hook e os providers de teste; sua etapa de staging de pre-push falhou porque o intervalo
pré-commit de HEAD ainda nomeava o arquivo de teste removido. O `pnpm verify:pre-push` pós-commit
passou contra `4a5f7bdb2f`: 21 arquivos de teste alterados e a execução afetada de 58 arquivos do
App foram concluídos com sucesso, incluindo o staging.

Revisão da exibição de membro de grupo: a consulta de diretório substitui a
consulta de contatos para atores de grupo. O GR-02/04 controlado cobre o rótulo da fila e o
popover de identidade; não estabelece permissão de API de tenant ao vivo nem acesso a nomes.

Evidência de exibição de membro de grupo (2026-09-07): os testes de provider/serviço/rótulo-de-origem
passaram (98 testes antes de remover a palavra genérica de membro; os 5 testes do rótulo atualizado
passaram depois). O typecheck da raiz passou. O GR-02/04 passou com Host/CLI real na execução
isolada `desktop-e2e-20260907113243713-p4711-4f6d853c0d2015c0`, incluindo asserções de nome de
fila e popover de ID completo. O histórico do Desktop em dev normal mostrou rótulos curtos de
identidade e o popover funcionando via captura de tela por CDP; nenhuma metadata de origem
salva foi modificada. A consulta de diretório ao vivo para o app configurado
`cli_a9786b1e21e5dbc2` ainda retornou 99991672. A captura de permissão do usuário era de outro app
(`cli_a9647cf87cf95bef`), então a resolução de nomes ao vivo permanece não verificada. Execuções
reais de UI em celular remoto, Windows e Linux permanecem não verificadas; a mudança usa o rótulo
de origem compartilhado e não altera os modos de entrega de runtime.

Gates locais finais desta revisão: `pnpm typecheck`, `pnpm lint` (43 warnings existentes,
sem erros) e `pnpm verify:pre-push` passaram. A redação mais recente omite o rótulo genérico de
membro e mostra apenas os seis últimos caracteres do ID no fallback.

O `pnpm dev:desktop` normal foi reconstruído e reiniciado após a mudança (PID principal
53715, PID do Host 53837). O Computer Use nativo verificou os rótulos `Feishu / 飞书 · 5cce9a`
da task de grupo existente, a abertura do ID completo por clique e o descarte por Escape.
O novo RPC de Host `bots.getGroupMemberNames` alcançou a API real do Feishu e retornou o mesmo
erro de escopo ausente para `cli_a9786b1e21e5dbc2`; portanto a verificação de nome ao vivo
restante está bloqueada pela permissão daquele aplicativo, e não por uma UI com mock ou por um
serviço não iniciado. O app de dev normal continua em execução.

Evidência ao vivo de acompanhamento (2026-09-07): o usuário substituiu o bot configurado pelo
Ryan Bot (`cli_a9647cf87cf95bef`) e habilitou o mesmo grupo de teste para esse bot.
A autorização de grupo do bot anterior está desabilitada. A API real de membros agora
retorna HTTP 200 / code 0, incluindo o nome do usuário vinculado. O Host de dev normal
registra `bots.getGroupMemberNames OK`; o Computer Use nativo e a captura de tela do usuário
mostram ambos `飞书 · 莫汝舰` na mensagem recebida real. Isso resolve o bloqueador anterior de
permissão do aplicativo. O acompanhamento de espaçamento adiciona um gap de 8px entre a
atribuição e o balão; o GR-02/04 mede o gap real renderizado.

A regressão de espaçamento passou na execução isolada do Desktop
`desktop-e2e-20260907114650611-p68251-40a284ddf131f45c`, incluindo a asserção de gap
renderizado de 8-12px. O typecheck da raiz e o lint também passaram.
O acompanhamento de espaçamento também passou `pnpm verify:pre-push` antes da submissão.

Acompanhamento de atribuição do corpo da resposta (2026-09-07): respostas de grupo não
prefixam mais o nome/open_id do remetente; o alvo nativo da resposta permanece. Duas regressões
de serviço falharam antes da mudança e passam depois. O GR-02/04 agora afirma que o resultado
salvo de parada é exatamente `Task stopped.` com sua referência de mensagem original.
A execução isolada do Desktop
`desktop-e2e-20260907115618260-p20788-6275e395b82d51f7` passou. Typecheck da raiz,
lint e 30 testes de serviço de grupo passaram.

O Computer Use nativo verificou o `pnpm dev:desktop` normal e o Ryan Bot real em
ZCode 群聊验证: após um novo rascunho, `@Ryan Bot Reply only REPLYBODYOK. Do not
use tools.` produziu uma resposta nativa citada cujo corpo é exatamente `REPLYBODYOK`.
A entrega salva é `sent` e retém o ID da mensagem recebida. As mensagens existentes
permanecem inalteradas. A primeira requisição após reiniciar o Host de dev encontrou
`proto.sessionNotFound` para a task antiga; esse é um problema separado de recuperação de
reinício, não corrigido nem reivindicado como coberto por esta mudança de formatação.
Windows, Linux e controle remoto mobile real não foram reexecutados para esta mudança
apenas de serviço. A reexecução completa de `pnpm verify:pre-push` passou. Sua primeira
execução encontrou o teste de ciclo de vida não relacionado de timeout/rollback de cliente
do Supervisor; aquele arquivo passou todos os 19 testes em isolamento antes da reexecução completa.

Revisão de reação do GR-05 (2026-09-07): 94 testes focados de provider/serviço/ciclo de vida
passam, incluindo transições monotônicas, estados cancelado/falhado/concluído, isolamento de
operador Feishu/Lark e payload compacto de card de fila. O comportamento anterior de OK
permanente falha as novas asserções de transição de serviço. O GR-02/04 do Desktop passou em
`desktop-e2e-20260907121550738-p28948-c52d61fb6862ae03` com o reconhecimento de fila
atualizado; isso não prova a renderização externa de reações. O typecheck da raiz e o lint
passaram. O bot real consegue listar reações de mensagem (HTTP 200 / code 0) e reporta seu
operador como o app ID da aplicação.

Evidência ao vivo do GR-05 em macOS: o `pnpm dev:desktop` normal foi reiniciado e então o
Computer Use nativo enviou a `@Ryan Bot` uma requisição somente leitura de `sleep 45` e uma
segunda requisição enfileirada em ZCode 群聊验证. A primeira exibiu OnIt; a segunda exibiu
OneSecond e um card de espera/cancelamento de linha única. Clicar em Cancel funcionou,
substituiu o card pela confirmação de cancelamento e removeu a reação da segunda
entrada. A primeira concluiu com `REACTIONDONE`; sua única reação
foi CheckMark. A releitura direta pela API retornou code 0, `[CheckMark]` para a primeira
mensagem e `[]` para a mensagem cancelada; o status do resultado salvo é `sent`.
Nenhuma reação antiga de OK ou em andamento permaneceu nessas entradas. Os caminhos de
falha/parada têm cobertura de regressão de serviço, não evidência de injeção de falha ao vivo.
Lark tem cobertura de HTTP de provider; Lark real, Windows/Linux e mobile não foram reexecutados.
Typecheck da raiz, lint e o gate completo de pre-push passaram. Uma execução inicial de teste
do provider expôs contaminação do cache de token de teste; o novo fixture agora usa seu
próprio app ID e a suíte focada passa todos os 94 testes.

Correção de ciclo de vida do card de fila do GR-05 (2026-09-07): o teste ao vivo anterior
cancelou a entrada enfileirada e não cobriu promoção/conclusão normais. Os cards de fila
agora persistem seu ID de mensagem e o estado mais recente da entrada; as escritas de admissão
preservam o progresso produzido por eventos de execução anteriores. Atualizações serializadas
acompanham a criação tardia do card e removem os controles de cancelamento após a espera.
Os testes de provider afirmam o handle de card retornado; os testes de serviço afirmam
atualizações de execução/conclusão/falha nesse handle sem seleção. A cobertura focada é de
99 testes, incluindo conclusão antes do retorno da admissão e os casos de alvo persistido/cancelamento/parada/descarte.
Typecheck da raiz, lint e pre-push passaram. O GR-02/04 do Desktop passou em
`desktop-e2e-20260907123427883-p5094-a2e438fea8ec6398`, incluindo status de parada persistido
da CLI real.

A verificação ao vivo em dev normal usou Computer Use nativo em ZCode 群聊验证 com o
Ryan Bot: uma requisição `sleep 45` (`QCARDFIRST`) seguida de uma requisição `sleep 15`
enfileirada (`QCARDSECOND`). A segunda requisição foi deixada executar normalmente.
Seu card original mudou de espera com Cancel para execução sem Cancel,
e então concluiu sem Cancel; ambas as requisições terminaram com CheckMark. O
cardMessageId persistido permaneceu idêntico durante espera/execução/conclusão, e cardStatus
estava done após a chegada de `QCARDSECOND`. Cards antigos sem ID de mensagem salvo não são
migrados automaticamente. Injeção de falha real, Lark real, Windows/Linux e controle remoto
mobile não foram reexecutados; nenhuma mudança de ownership de fila da CLI ou de stream
continuous/replayable está envolvida.

## Correção de menção isolada e referência explícita (2026-09-08)

O callback real do Feishu das 10:42 alcançou o Host em execução, mas foi
analisado como zero entradas. Remover a menção do robô deixou texto vazio, e o
provider o descartou antes do tratamento de referência/tópico. As referências de
texto eram obtidas para checagens de escopo, mas não eram retidas. Isso foi
reproduzido por quatro testes falhando de provider/serviço.

A correção preserva entradas de grupo apenas com menção, mantém referências
verificadas de texto/post/card separadas da análise de comandos, prepara imagens
referenciadas na mesma entrada e orienta requisições vazias sem admissão quando
não há background autorizado disponível. O histórico de tópico é preparado uma
vez antes da criação da task, com a mesma checagem de autorização no momento da
admissão e os mesmos checkpoints de entrada aceita de antes.

122 testes de provider/serviço passaram, incluindo texto de controle citado,
imagens de post, texto visível em card, opt-in de histórico ausente e falha de
leitura de histórico. O typecheck da raiz passou após corrigir um corpo de post
anulável; o lint manteve 43 warnings existentes e nenhum erro. O E2E de Desktop
TP-01 passou em
`desktop-e2e-20260908025213758-p73535-03aa4b82e6f8baf6`: menção vazia retorna orientação
com zero entradas enfileiradas, e texto citado explícito entra na fila real da CLI com
a entrada/anexo existente e pode ser cancelado sem parar a task.
O candidato permanece pendente; usa o fixture de provider controlado existente.

O `pnpm dev:desktop` normal foi reiniciado depois que o prompt de assinatura local do
macOS foi resolvido. O Computer Use nativo confirmou que uma menção simples no chat
principal retorna a orientação em chinês e não adiciona reação de execução. Uma menção
apenas com citação foi analisada com sucesso, mas expôs uma falha de admissão de task
fria: `proto.sessionNotFound`, embora a task original permanecesse no banco de dados da
CLI. O adaptador agora obtém o snapshot existente da subscription de background antes
do upload/admissão do anexo, preservando a mesma identidade de task e de workspace.
O teste adicionado verifica a ordem de recuperação, a propagação de remoteSessionId e a
recusa de submeter após falha de recuperação. Todos os 212 testes das três suítes
afetadas passaram; typecheck e lint passaram (43 warnings existentes, zero erros).
O transporte continuous/replayable de Desktop/mobile e o roteamento por owner não foram alterados.

Uma requisição nativa subsequente apenas com citação foi aceita na task original após
início frio (`om_x100b66c39fb070acc34a8c8d2ab2180`), expondo a falha acompanhante:
a subscription de resultado continuous de inicialização havia esgotado as retentativas
antes da ativação de runtime, então o resultado concluído não chegou ao Feishu. A
configuração do stream de grupo agora espera pelo mesmo snapshot autoritativo antes de
assinar e reconfere o mapa de subscriptions após o await para evitar listeners
duplicados de inicialização/entrada. O teste de ciclo de vida cobre essa ordem sem
re submeter entradas antigas.

A verificação nativa final usou `pnpm dev:desktop` e Computer Use no grupo de teste
comum do Feishu. Após o reinício, a menção apenas com citação
`om_x100b66c3b24414b0c4fa84f7f9c3268` citou a pergunta aritmética comum
“7 plus 5”. O Feishu retornou visivelmente `12` como resposta nativa e substituiu a
reação de execução por CheckMark. O estado persistido confirma a task original
`sess_5ec4cfa2-10e5-46d9-947f-eb2fe9a3eb27`, a admissão aceita, progresso `done`
e a entrega `sent` para aquela requisição exata
(mensagem de provider `om_x100b66c3b39e84b4df93b3dcb6d1bde`). Nenhum reset de task ou
replay de input histórico foi usado. A redação da requisição implícita pede
explicitamente ao modelo que responda à pergunta citada ou execute sua requisição; a
análise de comandos permanece separada no servidor.

O TP-01 passou novamente com a correção de subscription fria em
`desktop-e2e-20260908031650082-p95172-4bf16d8330951c84` (um case, uma spec).
As três suítes unitárias finais passaram 212 testes. Uma execução ampla de pre-push
teve uma asserção de tempo de 20 ms não relacionada falhando em
`v4SessionPaneModelSwitchRecovery.test.ts`, com 9.818 testes passando; sua reexecução
isolada passou todos os 53 testes. A reexecução completa de `pnpm verify:pre-push`
passou antes do commit. Lark nativo, Web mobile e cobertura de outros sistemas
operacionais permanecem não verificados para esta correção; a cobertura anterior de
plataforma não é reetiquetada.

### Verificação nativa do resumo de background longo (2026-09-08)

O Computer Use operou `pnpm dev:desktop` com o Ryan Bot no grupo real de tópico
dedicado `oc_6596fb27f96a81b6ee5c34cc09be6089`. O owner vinculado habilitou o
histórico de tópico com uma menção nativa `/history on` e então criou um novo tópico
CEDAR `omt_19fa0d1df1cfda52`. A raiz e a discussão comum não submeteram entradas de task.

- O editor recebeu 27.860 caracteres de discussão sintética. Uma verificação
  posterior somente leitura pela API nativa de mensagens retornou exatamente 19.999
  caracteres de texto para a mensagem `om_x100b66cc11ee38b4c12a2ac6a7e4efc`,
  terminando no meio do registro 159. Portanto esta execução cobre apenas o texto
  armazenado no servidor, não o rascunho colado inteiro. O arquivo da aplicação
  corresponde a esse comprimento de texto da API nativa; a cauda ausente do editor
  não é evidência de truncamento de histórico da aplicação.
- Uma resposta comum separada `om_x100b66cc2e689908de2920d0b7445a2` confirmou terça-feira
  em vez da antiga proposta de sexta-feira e deixou o owner indeciso. A menção
  explícita seguinte `om_x100b66cc2a8d606cc02f7d5d40479cd` criou a task independente
  `sess_b3ed9e49-22a9-4b30-8de9-8e3fcc93ce03`. Seu background aceito continha os dois
  registros de discussão (19.999 e 50 caracteres); a raiz era uma citação explícita.
- O Agent real persistiu um registro `bot_topic_context` de 795 caracteres com um
  resumo da discussão anterior e a confirmação recente na íntegra. O resumo
  identificou sexta-feira como proposta não confirmada e reteve seu ID de mensagem
  original. Esta foi uma invocação real do modelo configurado, não um fixture de resumo.
- A resposta nativa final reportou corretamente CEDAR, terça-feira e owner ainda não
  determinado. O Computer Use observou essa resposta no tópico de origem e o
  checkmark nativo de conclusão. O progresso da entrada era `done`; a entrega salva
  era `sent`, com ID de mensagem de provider `om_x100b66cc289cecb0c4a6013736ee30a`.

Os testes focados de background/arquivo do Agent também passaram (11 testes, dois arquivos).
Esta execução não estabelece o limite de 200 mensagens, a recuperação de histórico
ausente, a consulta de ferramenta de conflito de resumo, corridas de anexo/card de
tópico, `/remote` mobile, Lark ou o comportamento em Windows/Linux. Esses permanecem
como itens de verificação separados.

### Regressão de autoridade do card de tópico e roteamento de anexo (2026-09-08)

Sete cases explícitos de serviço agora usam IDs de task distintos para tópicos
irmãos. Eles rejeitam cards de fila com outro tópico, chat, task, geração de
autorização ou ator, incluindo cards antigos após desativação/reativação do pai.
As rejeições afirmam zero chamadas de cancelamento da CLI e entradas salvas
inalteradas para ambos os tópicos. O controle válido de card de autor afirma
exatamente um cancelamento visando a task de A e o comando original, com B
inalterado. O ID de task constante do fixture genérico mais antigo não é usado
como evidência para essas checagens entre tasks.

A execução focada de seis arquivos passou 83 testes: autoridade do serviço de grupo,
histórico de tópico, upload de anexo do Bot, anexo mobile de host compartilhado,
registro de anexo de window-host e anexos de prompt remoto. São regressões
controladas de serviço/transporte, não um teste de telefone real, de upload nativo
de anexo ou de corrida nativa de card.

### Fronteira nativa de arquivo de tópico dedicado (2026-09-08, incompleta)

O Computer Use enviou o arquivo sintético de 154 bytes
`zcode-topic-attachment-verification.txt` para CEDAR no grupo de teste dedicado.
A API nativa de histórico confirmou a mensagem de arquivo `om_x100b66ccd1ebe0a8c22a536e7f67b07`
no thread `omt_19fa0d1df1cfda52`, chat `oc_6596fb27f96a81b6ee5c34cc09be6089`.
Nenhuma menção de robô foi enviada com este arquivo, e nenhuma entrada de análise
de arquivo foi admitida.

A UI nativa de mensagem inspecionada tinha controles de encaminhar/recuperar/selecionar,
mas nenhuma resposta por citação. O diálogo de encaminhar foi fechado sem encaminhar.
A verificação adicional de UI parou depois que o Computer Use reportou que o usuário
tinha trocado a janela do Feishu. Isso estabelece apenas o upload nativo, não a
admissão de anexo nem a análise pelo Agent.

A inspeção de código então confirmou uma lacuna real de implementação: arquivos
históricos se tornam placeholders de texto no histórico do provider e a ferramenta de
arquivo de tópico não consegue buscar seus recursos. O contrato de recuperação restante
agora está explícito na spec do recurso; não marque a análise de anexos históricos como
completa com base em testes de pai explícito.

### Fronteira de Host de recurso histórico (2026-09-08)

A fronteira de download do serviço de Host foi implementada e testada. A execução
direcionada passou 154 testes entre as suítes de autorização/serviço de recurso de
tópico, provider nativo e serviço de grupo. As novas checagens cobrem escopo de
task/entrada/arquivo/workspace, revogação de grupo/histórico/owner/versão, identidade
de mensagem nativa, cancelamento e mudanças de autorização após o download. O case
de integração de serviço retorna um anexo pronto para transporte após as checagens
de autorização e de metadata nativa. Nenhuma ferramenta do lado do Agent ou
materialização remota é reivindicada ainda.

Uma invocação real somente leitura do provider baixou o arquivo de tópico dedicado
enviado anteriormente `om_x100b66ccd1ebe0a8c22a536e7f67b07`: um recurso, 154 bytes,
SHA-256 `2cb888eaeb649a4bc9c91a4c9682280d11cec485fa7cd8f9b416c82f03df2d4d`,
correspondente ao arquivo sintético original. Isso estabelece a permissão da API
nativa de recursos e a fidelidade do conteúdo; o arquivo ainda não foi admitido como
histórico por uma menção subsequente, então não é evidência do fluxo completo de
recuperação sob demanda pelo Agent.

O typecheck da raiz e o lint passaram (43 warnings existentes, zero erros). A primeira
execução completa de pre-push teve falhas de tempo de encerramento de CUA e de timeout
de layout mobile, além de esgotamento de heap de worker do Vitest; ambos os arquivos
passaram em isolamento (79 testes). A reexecução completa de
`VITEST_MAX_WORKERS=2 pnpm verify:pre-push` então passou sem alterar esses testes.

# 2026-09-08 regressão de @ nativo isolado e validade de token

- Com `pnpm dev:desktop` realmente em execução, o @ isolado no chat principal das 12:37 recebeu o evento nativo, mas o envio da mensagem complementar de requisitos falhou, e o Feishu retornou `99991663`. O código antes ignorava `expire` e fixava o cache em 90 minutos.
- Alterado para cachear conforme o tempo de vida restante da interface; a regressão periódica do provider Feishu／Lark falhou antes e passou depois, com 79 testes do provider passando. Desta vez a interface real retornou `expire=4187` segundos, menor que os 5400 segundos fixos da implementação antiga.
- Depois de reiniciar a versão de desenvolvimento, o Computer Use enviou um @ nativo isolado em `ZCode 群聊验证`, mensagem `om_x100b66cd6c1c20a4c026ae6aa5b7893`, com resposta nativa `om_x100b66cd6c2e3938c1c10da2d404a76`, e o cliente exibiu“请补充需求，或回复要处理的消息并 @我。”
- O ID de mensagem nativo foi conferido contra a entrada persistida do grupo atual: essa mensagem não tem registro de admission; nenhuma task foi criada ou enfileirada. A mensagem que falhou antes, `om_x100b66cd5f92d8acc322408850c60f9`, também não teve execução automaticamente reabastecida.
- Esta verificação real confirma que a entrega da mensagem deorientação se recuperou após o reinício; a travessia completa da validade é coberta por teste de relógio controlado, e não se esperou o token expirar naturalmente em um tenant real. Esta verificação não foi declarada como aprovação de leitura de anexos de histórico pelo Agent, de celular, de Lark ou de outros sistemas operacionais.

### 2026-09-08 13:18 verificação da consulta nativa ao anexo de histórico (não aprovada)

 Executando `pnpm dev:desktop`, foi feita uma requisição de texto puro via @ nativo do Ryan Bot no tópico CEDAR do grupo dedicado real「ZCode 专用话题验证」. A mensagem `om_x100b66cde75330b0c3e499c124d58c0` foi recebida pela CLI e exibiu OnIt; o modelo escolheu a mensagem de arquivo de histórico correta `om_x100b66ccd1ebe0a8c22a536e7f67b07`, mas `ReadSessionContext(sessionId=current, strategy=topic, attachment=...)` foi rejeitada por um erro de validação de JSON Schema do executor (oneOf casando dois ramos ao mesmo tempo). O modelo depois consultou o diretório de sessões da máquina local, o que não pode servir como evidência de leitura bem-sucedida do anexo. Foi adicionado um teste de falha na fronteira do executor e a chamada passou a usar um único modo string; 12 testes de ferramenta passaram.

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

### Regressão de roteamento de recursos WebSocket do Core standalone

`coreHttp.test.ts` agora exercita dois peers WebSocket Desktop reais de loopback
através do `/ws/host` autenticado por capability. As requisições reversas alcançam
apenas o workspaceIdentity + remoteSessionId correspondente; fechar um peer remove
apenas aquela rota. Uma conexão normal em `/ws` não anexa um peer de recurso privado.
Todos os 7 testes de Core HTTP passaram. A primeira tentativa do helper de teste
perdeu o frame de inicialização do RPC ao aguardar `open` antes de instalar os
listeners; instalar o RPC sincronamente no callback de `open` corrigiu o fixture.
Nenhuma mudança de transporte de produção foi necessária. As respostas de recurso
permanecem sintéticas, então isto não é aceitação de Feishu/Lark ao vivo, anexo de
Agent remoto ou UI mobile.

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

| Case          | Status   | Caso de uso                                                                          | Limite da evidência                                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| BOT-E2E-PS-01 | pending  | `packages/desktop/test/e2e/bots/manual-review/pending/bot-private-task-sync.test.ts` | controlled-stream, HTTP de saída em três canais, rodadas consecutivas de origem desktop/mobile e desativação; IM real/celular não verificados |

Suplemento de serviço: assinatura compartilhada por múltiplos alvos, deduplicação de tasks automáticos, atualização／leitura após reinício／retry explícito do token do WeChat e isolamento ao trocar de vínculo. Suplemento de UI: o botão de retry só é acionado explicitamente, fica desabilitado durante o envio, some no sucesso e exibe o erro. Nada disso substitui a aceitação manual de canal real.

## Resposta a menção nativa de canal

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


| Case | Evidência atual | Conclusão |
| --- | --- | --- |
| MN-02 / FN-01 | `conversation-session-bot-channel-worker.test.ts`: ferramenta real da CLI, RPC reverso, duas menções nativas, continuação de conversa no desktop sem origem; perda real de frames de text delta, mas o estado final ainda volta completo uma vez | passed, formal |
| TP-04 / TP-05 | `conversation-session-bot-topic-worker.test.ts`: para automaticamente após receber o stream real e só então envia o próximo; resultado real do ReadSessionContext, bytes do arquivo gravados em disco e rejeição entre tasks | passed, formal |
| GR-02 promoção normal / PS-01 | `conversation-session-bot-continuous-worker.test.ts`: a fila do grupo é promovida naturalmente e cita a mensagem correta; primeira rodada real do IM e continuação pelo service do desktop retornam uma vez cada | passed, formal |
| GR-UI-01 | `feishu-bound-groups-ui.test.ts`: clique real no Desktop, salvamento via RPC, contagem de tópicos e demais grupos/bots inalterados | passed, formal |
| TP-03 | Feishu/Lark × menção explícita ou não, quatro cenários: limite confiável de mensagem, origem real de run, citação da pergunta atual, aprovação com @ do administrador, e @ da pergunta/resposta comum decidido pela menção | passed, pending |
| GR-02/04 runtime antigo do Desktop | arquivo de estado v3, onboarding de occupation e fixtures do novo agrupamento de Provider atualizados; exibição da fila, cancelamento, detalhe da origem e operação recebida passaram; `/mode yolo` em rascunho de grupo falhou | failed, não conta como case inteiro aprovado |

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
2. Durante o debug de TP-05, a interface antiga `readSessionMessages` mostrou que a estrutura retornada pela CLI atual não bate com o schema antigo（messageId/sessionId contra id/sessionID, entre outros）. A verificação final de arquivo lê o resultado real de tool completed do SQLite da CLI isolada, sem contornar o download de ReadSessionContext; esse problema da interface antiga de consulta não foi corrigido nesta manutenção de testes.
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
o TP-04 verifica na requisicao real ao modelo a estrutura ordenada de text/mention e a associacao entre si e terceiros, sem expor o targetId.
