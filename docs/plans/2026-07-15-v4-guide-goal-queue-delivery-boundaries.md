# Plano de implementação dos limites de consumo de Guide e Goal Queue no V4

> Este plano congela primeiro a semântica de produto e o escopo de prova, e só então entra na implementação. Na fase de implementação é obrigatório seguir a lista de tarefas, complementar os testes primeiro e só depois alterar o código.

**Goal:** Restaurar a entrada de envio de «guia» do V4 e separar guide e queue comum em dois caminhos de consumo verificáveis mecanicamente: o guide só é injetado no turno atual depois que um batch completo de tool result registra o fato; a queue comum só é consumida automaticamente quando a session está ready e o goal atual não existe ou o target já está `complete`. Um verifier fail-open conta como aprovado, e uma terminação manual do verifier não conta como aprovação.

**Architecture:** CLI/runtime continua possuindo o único `CommandInbox` e os conversation product facts. O guide é a entrega inline do turno atual, e a queue comum é a promoção de turnos futuros; ambos compartilham a identidade de entrada e o admission FIFO, mas não compartilham o drain trigger. `continuous` do desktop e `replayable` do mobile só alteram a forma de entrega/restauração, e não o guard de consumo.

**Tech Stack:** TypeScript, protocolo V4 da ZCode, CLI core/runtime, bootstrap projection, React 19, Vitest, E2E WDIO controlled-stream.

## Feature Summary

| Field | Value |
| --- | --- |
| Change | Restaurar o envio de guide do V4; a queue comum passa a ser consumida só depois que a verificação do goal passa (incluindo fail-open) e a atualização do target é concluída |
| User-visible surfaces | A preferência «引导» nas Settings, o Composer do V4, a lista de prompts enfileirados, o painel de status do goal |
| Existing docs | `docs/chat/interaction-behavior.md`, protocolo/estado da conversation, catálogo de cases, matrizes de E2E, spec do protocolo V4 |
| Existing code owners | `packages/ui/src/v4`, steering/turn loop do runtime do CLI core, bootstrap V4 bridge, projection de contracts |
| Out of scope | FIFO global entre plataformas, relay/main possuindo a queue de negócio, replay automático após restart do CLI, ampliar a capacidade de guide para anexos, redesenhar Stop/envio imediato |

## Clarification Log

| Round | Question | User answer | Boundary fixed | Follow-up needed |
| --- | --- | --- | --- | --- |
| 1 | fail-open equivale a terminação manual do verifier; a queue comum precisa esperar o goal passar | fail-open é o fechamento como aprovado após uma exceção do próprio verifier; terminação manual não é aprovação; as demais semânticas recomendadas foram confirmadas | fail-open segue `passed=true`, cancel/abort seguem paused/cancelled | no |
| 2 | Como tratar guide sem tool, várias guides, Stop/paused/budget-limited e queue kinds misturadas | Todas as recomendações foram aceitas | guide sem tool volta para a queue; no máximo uma guide por batch; goal não complete bloqueia continuamente todos os queue kinds comuns | no |
| 3 | tool call paralelo, guide enviada antes da tool, fallback de eligibility, desktop/mobile compartilham o produto final | Todas as recomendações foram aceitas | esperar o batch completo de tools; a guide pode esperar mais cedo; manter a eligibility; as duas pontas compartilham os fatos do CLI | no |
| 4 | A guide precisa de restrição por modelo/provider | Não; esta é uma continuação model-step genérica do runtime | modelo/provider foram removidos da eligibility; a parte de provider de «manter a eligibility» anterior é coberta por esta decisão | no |

## Boundary Decisions

| Boundary | Decision | Includes | Excludes / prunes | Source |
| --- | --- | --- | --- | --- |
| Guide trigger | Só depois que todos os tool results irmãos de um model step foram submetidos, consome-se no máximo uma guide | tool única, tool paralela, tool result de sucesso/falha | completion somente de texto, conclusão antecipada de um único irmão | user + protocol |
| Guide no-tool fallback | O turno atual fecha quando não há batch de tools utilizável, e a intent original da guide é reenviada no lugar para a queue comum | preservar o texto original, anexos, client, IDs e ordem de admission | descartar, criar uma nova intent, ficar esperando guide para sempre após um estado terminal | user |
| Guide eligibility | Independente de modelo/provider; quando não se aplica, volta para a queue | qualquer modelo/provider, sem anexos, sem queue existente, turno em execução elegível e não parado | ampliar a capacidade de steer de anexo nesta rodada | current user decision + runtime architecture |
| Ordinary queue trigger | Só é promovida automaticamente depois de a session ficar ready; quando há target, é preciso também `target.status=complete` | text, goal command e compact compartilham o mesmo gate FIFO | drain direto na fronteira de tool result, marker de verificação com drain separado | user |
| Fail-open | Exceções de infraestrutura/saída/uso indevido de ferramenta do verifier retornam `passed=true`, e então o target é concluído, equivalendo a um pass explícito | registro de fail-open, target complete, drain normal da queue | branch de drain especial que contorne a atualização do target | user + code |
| Manual verifier stop | cancelled/aborted, target paused, queue preservada e `autoDrain=false` | a semântica existente de Stop e de pause independente | tratar como fail-open ou pass | user |
| Explicit send-now | Preserva a exceção explícita de preempção já existente | reservation, barreira de Stop, promoção do item selecionado | fica sujeito ao guard de goal do auto-drain comum | user + existing protocol |
| Transport | desktop/mobile convergem para os mesmos fatos do CLI | equivalência live/cold de desktop-continuous e web-remote-replayable | novo estado de negócio em relay/main, fila dupla | architecture docs |

## Domain Scope

| Domain | Include? | Why it can change behavior | Primary sources |
| --- | --- | --- | --- |
| conversation/session runtime | yes | a injeção de guide e a promoção da queue mudam a fronteira do turno | CLI core turn loop/steering |
| goal/target | yes | o gate da queue depende do status terminal do target | target verifier + bootstrap bridge |
| V4 command/projection | yes | o fallback de entrega e o estado da queue precisam ser live/cold consistentes | contracts + bootstrap projection |
| UI/composer | yes | o `mode=guide` atual do V4 desabilita o botão e o Enter | `ConversationComposer` / `SessionPane` |
| tool lifecycle | yes | a única fronteira de drain inline da guide é o batch completo de tools | runtime tool execution |
| remote/replay | yes, representative | prova que o mesmo fato do CLI não bifurca em continuous/replayable | architecture + bootstrap tests |
| relay/main process | no | apenas repassa e não possui estado de negócio de queue/goal/stream | remote architecture |
| workspace identity | no new behavior | esta funcionalidade isola por session e não cria workspace key | architecture constraints |
| model/provider eligibility | pruned invariant | o runtime acrescenta um histórico de usuário unificado na fronteira model-step e não depende do steer nativo do provider | current user decision + core runtime |

## High-Risk Cross-Products

| Cross-product | Candidate risk | Initial handling |
| --- | --- | --- |
| guide × single/parallel/failed tool result | injetar antes de o irmão terminar, ou um result de falha nunca disparar | enumerar três representantes: single, parallel, failed result |
| guide × text-only/Stop | guide ficar permanentemente pendente ou se perder | caso aceito de fallback para a queue |
| queue kind × goal target status | gate só para text, deixando goal/compact consumirem por excesso de poder | enumerar um FIFO misturado com um gate comum |
| verifier result × target update | corrida entre o marker de verificação e o target complete | três representantes: pass explícito, fail-open, cancel manual |
| guide × active goal phase | a guia parar o target por engano, ou o verifier ser tratado como turno steerável | output/continuation podem receber guide; verifier busy cai para a queue |
| delivery × client profile | desktop e celular produzindo estados finais de produto diferentes | não fazer o produto cartesiano completo para os casos de negócio; provar com equivalência de projeção live/cold |

## Concept Map

| Concept | Why it matters | Source |
| --- | --- | --- |
| `ConversationInputIntent` | identidade de entrada compartilhada por queue/guide; o fallback não pode trocar ID nem ordem | V4 protocol spec |
| `delivery.admitted` | decide entre guide inline e queue futura | V4 protocol spec |
| `CommandInbox` | única autoridade FIFO para input busy de desktop/mobile | protocol declaration |
| tool result batch | única fronteira de commit em que a guide pode entrar no turno atual | CLI runtime |
| session ready | primeira camada de guard da promoção da queue comum | conversation behavior |
| `target.status` | segunda camada de guard da promoção da queue de goal | target contracts |
| `autoDrain` | se a queue comum já está armada | queue projection |
| explicit send-now reservation | caminho explícito em que o usuário contorna a espera pelo consumo automático | protocol declaration |

## State Owners

| State / fact | Authority | Mirrors / caches | Evidence |
| --- | --- | --- | --- |
| queue/guide intent、admissionSeq | CLI CommandInbox/session input ledger | V4 QueueState, renderer projection | command ACK + live/cold snapshot |
| tool batch completion | CLI core runtime | tool rows/timeline | ordered runtime facts |
| target status | CLI target store | V4 goal projection, espelho de compatibilidade de task meta | target changed event + snapshot |
| session ready/active controller | CLI/bootstrap runtime | V4 control projection | controller lifecycle + snapshot |
| followup preference | app setting, sincronizado com o CLI config na session já aberta | V4 config projection | setting + command ACK |

## Delivery State And Event Order

guide e queue compartilham o admission, mas divergem imediatamente depois dele:

```text
sendText while running
  -> CLI admission: stable sourceCommandId + queueItemId + admissionSeq
  -> delivery decision
       |
       +-- guide eligible
       |     -> wait for next complete tool result batch
       |     -> commit every sibling ToolCallResult
       |     -> drain exactly one guide inline
       |     -> persist guided user fact
       |     -> next provider request of the same product turn
       |
       |     no usable tool batch before turn terminal
       |     -> reclassify the same intent to queue
       |
       +-- queue / guide ineligible
             -> ordinary queue
             -> wait for session ready
             -> target absent OR target.status=complete ?
                    no  -> keep FIFO unchanged
                    yes -> promote one head item by original kind
```

A ordem de commit da verificação do goal precisa avançar em uma única direção:

```text
explicit verifier pass ─┐
                        ├-> verification passed=true
verifier fail-open ─────┘        -> target.status=complete
                                      -> session ready
                                      -> ordinary queue may drain

manual verifier Stop/abort
  -> verification cancelled/failed
  -> target.status=paused
  -> queue retained, autoDrain=false
  -> no automatic drain
```

## Dimensions

| Dimension | Values / equivalence classes | Source | Include? | Reason |
| --- | --- | --- | --- | --- |
| delivery | queue、guide、guide→queue fallback | product setting/protocol | yes | mudança central |
| tool batch | none、single、parallel、failed-result | runtime | yes | fronteira da guide |
| guide count | one、2+ | user decision | yes | uma por batch, FIFO |
| goal status | none、active、paused、budget_limited、complete | target contracts | yes | gate da queue comum |
| verifier terminal | explicit pass、fail-open、fail/continue、manual cancel | verifier runtime | yes | distinção pass/cancel |
| queue kind | sendText、sendGoalCommand、compact、mixed | CommandInbox | yes | o gate não pode cobrir só texto |
| queue action | auto drain、resume、send-now | protocol | yes | send-now é uma exceção explícita |
| client profile | desktop-continuous、web-remote-replayable | remote architecture | representative | não replicar o produto cartesiano de negócio |
| provider/tool name | eligible provider；readonly representative tool | current eligibility/tool matrix | representative | não ampliar a superfície de suporte do produto |

## Candidate Combinations

| Candidate ID | State | Event | Target/surface | Expected guard/effect | Initial status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GDQ-01 | running + followupMode=guide + eligible | Composer submit/Enter | V4 UI/command | botão e Enter podem enviar; só é limpo após o accepted | bug-candidate | o composer do V4 atual trata guide como disabled |
| GDQ-02 | eligible guide waits + single tool | tool result committed | current turn | inline drain de uma guide após o result, e então a próxima requisição ao provider | accepted | representante central da ordem |
| GDQ-03 | eligible guide waits + parallel tools | last sibling result committed | current turn | todos os results irmãos registram o fato primeiro, e então no máximo uma guide | accepted | não fazer drain antecipado por tool individual |
| GDQ-04 | 2+ guide intents + repeated batches | each batch completes | CommandInbox/current turn | uma por batch, por admission FIFO | accepted | não limpar todas as guides de uma vez |
| GDQ-05 | guide admitted + text-only terminal | turn completes without tool | queue | a mesma intent faz fallback para a queue no lugar | accepted | preserva IDs/ordem |
| GDQ-06 | guide requested but ineligible | admission/runtime reject | queue | a mesma intent faz fallback para a queue com um motivo | accepted | provider/anexo/queue existente/Stop/compact/verifier |
| GDQ-07 | active goal output/continuation + eligible guide | guide submitted, tool batch completes | goal current turn | guide inline; não para/não pausa o target, não espera o verifier passar | accepted | a própria requisição do verifier não faz steer |
| GQD-01 | queue>0 + target active/paused/budget_limited | session becomes otherwise ready | queue | todos os kinds são preservados, sem iniciar provider/goal/compact | bug-candidate | o drain ready atual não tem gate de target |
| GQD-02 | queue>0 + explicit verifier pass | target becomes complete | queue | promovido automaticamente por FIFO depois do ready | accepted | o marker sozinho não basta |
| GQD-03 | queue>0 + verifier fail-open | target becomes complete | queue | mesmo estado final e mesmo drain do pass explícito | accepted | sem bypass especial |
| GQD-04 | queue>0 + manual verifier cancel | target becomes paused | queue | queue retida; sem drain automático | accepted | cancel não equivale a fail-open |
| GQD-05 | mixed text/goal/compact queue + active goal | target complete | queue | os três kinds compartilham o gate e depois mantêm a ordem e a semântica originais | accepted | compact não gera user row |
| GQD-06 | queue>0 + no target | session ready | queue | consumido pelas regras existentes de ready/autoDrain | accepted | sem regressão de goal |
| GQD-07 | noncomplete target + queued item | explicit send-now | selected item | reservation + barreira de Stop + promoção | accepted | exceção explícita, não auto-drain |
| GQD-08 | queue>0 + autoDrain=false + noncomplete target | user resumes queue | queue | apenas define autoDrain=true; continua esperando o target complete | accepted | «continuar» não é send-now explícito |

## Pruning Decisions

| Decision ID | Pruned combinations | Guard/invariant | Product reason | Representative coverage |
| --- | --- | --- | --- | --- |
| P-01 | cada nome concreto de tool × guide | guideAfterCompletedToolBatch | a fronteira de consumo depende só do terminal do batch, e não do negócio da ferramenta | readonly success + failed result + parallel batch |
| P-02 | desktop/mobile × todos os estados de negócio | trustedDeliveryBoundary | as duas pontas compartilham os fatos do CLI, e a dimensão de recuperação de transporte é independente | desktop E2E + bootstrap live/cold equivalence |
| P-03 | active/paused/budget_limited separados × cada queue kind | incompleteGoalBlocksQueueDrain | são o mesmo guard `status !== complete` | mixed FIFO + representantes unitários do status reducer |
| P-04 | cada exceção subjacente do fail-open | verifierFailOpenCompletesTarget | formato/rede/uso indevido de ferramenta compartilham o contrato `passed=true` | um fail-open E2E determinístico + casos unitários de contrato |
| P-05 | cada modelo/provider × guide | guideIsModelAgnostic | o runtime não reescreve a request in-flight; acrescenta uniformemente o histórico de usuário na fronteira model-step | regressão representativa de bootstrap não-GLM |
| P-06 | estado de queue em relay/main | cliOwnsConversationProjection | o estado de negócio não pode descer para relay/main | architecture/static review |
| P-07 | estender a guide para anexos | guideModeEligibilityGuard | esta rodada não amplia a capacidade de steer de anexo | attachment fallback case |

## Questions For User

| Question ID | Candidate(s) | Need to decide | Options | Impact |
| --- | --- | --- | --- | --- |
| Q-01 | GDQ-05 | sem tool, a guide é descartada, espera ou faz fallback | já decidido: fazer fallback para a queue comum | resolved |
| Q-02 | GDQ-03/04 | granularidade de consumo de guide paralela/múltipla | já decidido: depois do batch completo, uma por batch | resolved |
| Q-03 | GQD-03/04 | fail-open e cancel manual são equivalentes | já decidido: não são equivalentes; só o fail-open aprova | resolved |

## Accepted Cases

| Case ID | Setup | Action | Assertions | Evidence layers | E2E status |
| --- | --- | --- | --- | --- | --- |
| GDQ-01 | eligible running V4 session，setting=guide | button/Enter send | command accepted；composer clears after ACK；guide fact appears | UI + command | missing |
| GDQ-02 | provider step returns one readonly tool call，guide already admitted | commit tool result | `ToolCallResult < TurnSteerDrained < next provider request` | runtime + protocol + network | missing |
| GDQ-03 | provider step returns parallel tool calls | complete siblings in varied order | every sibling result precedes one drain；无 second guide drain | runtime + protocol | missing |
| GDQ-04 | two guide intents and two tool batches | complete both batches | exactly one per batch；source IDs and FIFO preserved | runtime + projection | missing |
| GDQ-05 | guide admitted，provider returns text-only terminal | finish turn | delivery changes to queue in place；later obeys ordinary queue gate | runtime + live/cold projection | missing |
| GDQ-06 | attachment/existing queue/verifier busy representative | submit guide preference | accepted as ordinary queue with fallback reason；payload preserved | command + projection | partial |
| GDQ-07 | active goal continuation uses tool | submit guide and complete batch | guided row in same turn；target remains active；no Stop | UI + runtime + network | missing |
| GQD-01 | active target + mixed FIFO queue | current active work settles without target completion | no queue promotion/provider request | runtime + projection + network | missing |
| GQD-02 | same setup | verifier explicitly passes | target complete precedes FIFO promotion | runtime + protocol + UI | missing |
| GQD-03 | same setup + deterministic verifier malformed result | trigger fail-open | passed=true；target complete；FIFO promotion | runtime + protocol + logs | missing |
| GQD-04 | verifier streaming + queue | user Stop | verifier cancelled；target paused；autoDrain=false；no promotion | UI + runtime + network | missing |
| GQD-05 | queue order text→goal→compact | target completes | each item starts by original kind and original order | protocol + timeline + network | missing |
| GQD-06 | no target + normal queue | session becomes ready | existing FIFO auto-drain unchanged | regression E2E | partial |
| GQD-07 | active target + queued item | click send-now | target/current work stops；selected item starts once；others retain order | UI + runtime | covered adjacent |
| GQD-08 | paused queue + paused/active target | click queue resume | autoDrain becomes true but no promotion；target complete 后才 drain | UI + runtime + projection | missing |

## Matrix Backfill

| File | Change |
| --- | --- |
| `docs/conversation-session-case-catalog.md` | Expandir H08/H12 e M06a-g, registrando fail-open/cancel, batch completo de tools, uma guide por batch, o composer do V4 e o fallback sem tool |
| `docs/testing/conversation-session-e2e-coverage-matrix.md` | Rebaixar o antigo guide «covered» para uma lacuna real e separar M06a-g; alinhar H08/H11/H12 aos novos guards |
| `docs/testing/conversation-session-goal-specific-coverage-matrix.md` | Acrescentar pass/fail-open/cancel e as lacunas de recuperação de UI em G1-10/G1-13/G1-14 |
| `docs/testing/conversation-session-tool-cross-product-matrix.md` | Acrescentar as classes de equivalência representativas de guide × tool-batch, sem explodir por todos os nomes de tool |
| `docs/conversation-protocol-declaration.md` | Novos invariantes de guide batch, fallback identity e incomplete goal queue gate |
| `docs/conversation-product-state-space.md` | Acrescentar as dimensões delivery/toolBatch/verifier terminal e as regras |

## Implementation Tasks

### Task 1: testes focados primeiro

**Files:**

- Modify: `packages/ui/test/*ConversationComposer*.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/*steer*.test.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/tests/v4-native-queue.test.ts`
- Modify: contracts/projection focused tests

- [ ] Adicionar testes de botão, Enter e limpeza após ACK no modo guide do V4, e confirmar que a implementação atual falha.
- [ ] Adicionar teste de ordem de eventos de uma guide depois de um batch completo de tools.
- [ ] Adicionar testes de várias guides com uma por batch, de fallback somente de texto e de a queue comum não dar drain na fronteira de tools.
- [ ] Adicionar testes de target ativo bloqueando text/goal/compact, de resume da queue apenas armando, de drain por pass/fail-open explícitos e de cancel sem drain.

### Task 2: restaurar o Composer de guide do V4

**Files:**

- Read first: `DESIGN.md`
- Modify: `packages/ui/src/v4/ConversationComposer.tsx`
- Verify: `packages/ui/src/v4/SessionPane.tsx`

- [ ] `inputRouting.mode=guide` mantém o composer/botão/Enter normais able to submit, sem adicionar um segundo conjunto de campos de entrada.
- [ ] Preservar os guards existentes de attachment readiness, Plan-mode, held queue choice e ACK-before-clear.
- [ ] Quando a guide não se aplica, o CLI devolve o fallback para a queue da mesma intent, e a UI não cria uma segunda fila por conta própria.
- [ ] Se houver logs novos na UI, usar uniformemente `packages/ui/src/logger.ts`.

### Task 3: separar o drain inline da guide do drain da queue comum

**Files:**

- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`
- Modify: tool execution/model-step runtime methods

- [ ] Remover do generic round-trip a capacidade de inline drain da queue comum.
- [ ] Verificar a guide no topo da fila depois que o batch completo de tool result for persistido/submetido, drenando no máximo uma.
- [ ] Garantir que o drain só aconteça depois que todos os irmãos paralelos terminarem; tool result de falha e de sucesso usam o mesmo terminal boundary.
- [ ] Uma guide ainda não drenada antes de text-only/Stop/terminal é reclassificada no lugar como queue comum.
- [ ] Logs de ordem de tool/steer de alta frequência usam apenas `debug`, e comentários em chinês explicam por que a implementação antiga consumia cedo demais.

### Task 4: adicionar o fato durável de fallback da guide

**Files:**

- Modify: contracts turn-steer events/reducer/schema
- Modify: core persistence adapters
- Modify: bootstrap live/cold projection

- [ ] Preferir um fato explícito de delivery-changed/fallback, sem sugerir a reentrega no lugar com um «queued event» repetido.
- [ ] O evento carrega `queueItemId/sourceCommandId/requested/admitted/reasonCode`, com validação estrita de schema.
- [ ] O reducer atualiza a intent no lugar, preservando admissionSeq, payload, attachments, clientId e a posição FIFO.
- [ ] live projection, cold hydration e session-input ledger convergem para o mesmo resultado.

### Task 5: condicionar a queue comum à conclusão do target

**Files:**

- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts`
- Reuse: target completion verification/fail-open contracts

- [ ] Consolidar o guard de auto-promotion comum em um helper testável unitariamente: head queued + autoDrain + no active controller + session ready + (`target=null` ou `target.status=complete`).
- [ ] Todas as `sendText/sendGoalCommand/compact` passam pelo mesmo helper, proibindo bypass por kind.
- [ ] Reavaliar tanto depois da atualização do target quanto da limpeza do controller, evitando que o drain fique sem ninguém para acordá-lo depois de um pass concluído.
- [ ] O fail-open não ganha drain especial; reaproveitar `passed=true -> target complete`.
- [ ] O cancel manual/Stop mantém target paused, queue retida e autoDrain=false.
- [ ] `sendQueuedNow` continua preservando a exceção explícita de reservation + barreira de Stop.

### Task 6: prova de runtime e E2E

- [ ] controlled-stream: com guide configurada nas Settings do V4, envio real por botão/Enter.
- [ ] controlled-stream: ordem de tool única e de batch de tools paralelas.
- [ ] goal queue: drain após fail→continue→pass explícito.
- [ ] goal queue: target complete/drain após fail-open determinístico.
- [ ] goal queue: paused/no drain após Stop manual do verifier.
- [ ] mixed FIFO: text/goal/compact executando na ordem original dos kinds após complete.
- [ ] O E2E formal do desktop prova a interação; os testes live/cold do bootstrap provam que o replayable do mobile não muda o estado final de negócio.
- [ ] Usar runtime debug log/provider capture para provar a ordem; usar CDP para provar que o estado disabled do Composer foi restaurado, evitando confiar apenas na leitura estática.

### Task 7: verificação obrigatória e commit

- [ ] Executar os testes focados de unidade/integração.
- [ ] Executar os E2E de conversation novos/afetados; itens de remote/mobile que não puderem rodar são listados como risco na descrição do commit.
- [ ] Executar `pnpm typecheck`.
- [ ] Executar `pnpm lint`.
- [ ] `git diff --check`, revisando que só entram os arquivos desta funcionalidade.
- [ ] Conventional Commit, por exemplo `feat(conversation): restore guide and gate goal queue drain`.

## E2E Handoff Notes

- Provider fixture: o SSE controlado precisa gerar de forma estável text-only, single tool, parallel tool, failed tool result, goal verifier explicit pass e malformed fail-open.
- File-system fixture: a tool readonly usa um arquivo temporário local do caso; não depende de internet real nem do diretório do usuário.
- Timing strategy: usar o ACK de command, os fatos de runtime e marcadores de requisição ao provider como barreira; não usar sleep fixo para adivinhar o terminal de tool/verify.
- Docker preset: se o provider fixture precisar de isolamento de replay, manter o Docker preset dos E2E de conversation; esta rodada não amplia a rede mobile real.
- Review risks: ordem de commit de tool results paralelos, corrida entre target complete e limpeza do active controller, projeção live/cold de guide→queue, e regressões da escolha de queue paused/send-now existentes.