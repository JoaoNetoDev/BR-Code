# Telemetria do funil de envio do composer (ARMS: send_input_focus / send_click / send_result)

**Status**: **implementado**, mergeado junto com o MR !2000 — os três eventos e a métrica de latência ponta a ponta do `send_result` foram entregues no mesmo MR (novo arquivo `sendFunnelArmsTelemetry.ts`; os branches `awaitRender` de `awaitSendRender()` / `notifyUserInputRendered()` e `resolveSendAckSettlement()` do supervisor; o effect de sinal de renderização do `SessionPane`; testes unitários na seção «aguardando renderização» de `v4ComposerSendFunnelTelemetry.test.ts`). A métrica de latência mudou de «ACK accepted» para «mensagem do usuário apresentada no histórico da conversa»; validada em máquina real no desktop, ponta a ponta em torno de 230 ms (dos quais 55 ~ 100 ms no trecho do ACK); **ainda não publicada**, os percentis em produção serão revisados após o lançamento.
**A observar**: duas semanas após o lançamento, revisar por percentis do ARMS duas coisas. Primeiro, calibrar o limiar de `render_timeout` de 30 s da §5.4 — o p50 em máquina real é de apenas 230 ms, 30 s provavelmente é largo demais, mas é preciso evidência de cauda longa em produção para estreitar. Segundo, verificar se a participação de `send_cost_ms − ack_cost_ms` (o trecho de retorno da projeção + renderização) em dispositivos de baixo desempenho é consistente com a máquina real; se esse trecho inflar de forma significativa, o foco da otimização é a renderização, não a rede.
**Lacunas conhecidas**: o caminho de slash commands do composer ainda não está integrado — `dispatchSlashCommand()` não recebe `telemetrySeed`, então `/compact` e `/goal` em sessões existentes, assim como as rejeições locais e síncronas de `emptyGoal` / `unsupportedGoal`, apenas reportam `send_click` sem liquidar `send_result`. Ao calcular a taxa de sucesso por `send_click_id`, o ARMS vai contar esse subconjunto no denominador como abandono; é preciso removê-lo separadamente; a correção será tratada à parte.
**Canal de reporte**: **apenas o Aliyun ARMS RUM custom events** (`platform.reportArmsCustomEvent`). Não passa pelo `/event/report` próprio.
**Lado efetivo**: **somente o desktop Electron** (`isDesktop`). Web / controle remoto pelo celular não instalam o reporter, não reportam.
**Escopo**: apenas a camada de UI (`packages/ui`). Não altera Host/Runtime, não altera a semântica existente de `send_btn`.

## 1. Objetivo

Completar o funil do trecho entre o usuário «ver a caixa de entrada» e «a mensagem realmente sair», respondendo a três perguntas:

1. Dentre quem clicou na caixa de entrada, quantos realmente apertaram enviar? (perda entre intenção de entrada e intenção de envio)
2. Dentre quem apertou enviar, quantos realmente enviaram com sucesso? Qual é a distribuição das causas de falha? (taxa de sucesso do canal de envio)
3. **Quanto tempo leva do clique em enviar até a própria mensagem aparecer no histórico da conversa?** (latência de envio perceptível pelo usuário, sem fila nem inferência do modelo)

## 2. Situação atual e lacunas

Cadeia atual (tudo já existe, sem necessidade de mudanças):

```
Clique na caixa de entrada focus ─► recordComposerFocus()      só grava inputStartTime na memória, não reporta
Digita o primeiro caractere ─► recordComposerTextChange()  só grava inputFirstCharTime na memória, não reporta
Clique em enviar/Enter      ─► submit()  congela sendTime      sem evento
                     │
                     └─► sendCommand(envelope) aguarda ACK
                           accepted  ─► acceptPromptSeed() ─► reporta send_btn（/event/report）
                           demais ACKs / exceção ─► completamente silencioso
```

Três lacunas:

- «Clicar na caixa de entrada» e «clicar em enviar» só deixam timestamps em memória, servindo como os três campos `input_start_time` / `input_first_char_time` / `input_send_time» que accompaniment o `send_btn` no reporte. **Sem clique em enviar não há `send_btn`, o funil tem apenas o numerador e nenhum denominador.**
- ACK com `rejected` / `stale` / `failed`, bem como exceções lançadas por `sendCommand` (transport-error, provider_not_ready), são completamente silenciosos: apenas escrevem no buffer de debug local e limitado de `recordV4CommandAck`, invisíveis do lado do reporte.
- Não há campo para a latência do canal de envio. `message_completion.duration_ms` é «do envio até o fim da rodada», `time_to_first_token` é «do envio até o primeiro token»; ambos incluem fila e inferência do modelo, não permitindo medir o canal de envio em si.

**A mensagem do usuário não tem renderização otimista.** `conversationProjectionStore.markCommandPending()` apenas escreve o comando em `optimisticCommands`, campo que **não tem nenhum consumidor de UI** em todo o repositório (`reconcileOptimistic` só o usa para limpeza). O balão do usuário só é desenhado quando a projeção do servidor retorna e `snapshot.rows.window` passa a conter `row.kind === "userInput" && row.sourceCommandId === commandId`. Portanto «ACK accepted» é muito anterior a «mensagem visível», e entre os dois ainda há um push de projeção e uma renderização do React.

## 3. Decisões de design

### 3.1 Canal: reportar apenas ao ARMS

| Ponto de decisão | Conclusão | Justificativa |
| --- | --- | --- |
| Qual canal usar | **somente ARMS**, sem double report para `/event/report` | O mais central dos três indicadores desta rodada é a **distribuição de latência**; o `value` dos custom events do ARMS é numérico, o que suporta nativamente avg/p50/p95/p99 e drill-down por `app_version` / `platform`, enquanto o `event_extra_detail` do `/event/report` é todo string, exigindo uma camada extra de parsing no data warehouse para calcular percentis |
| Lado efetivo | apenas desktop Electron | O `reportArmsCustomEvent` em `packages/web/src/main.tsx` é uma implementação vazia, o Web já não receberia; seguimos o gating existente de `setUiPerfArmsReporter(isDesktop ? platform : null)`, com semântica explícita |
| Relação com o `send_btn` existente | Semântica, campos, momento e canal do `send_btn` **permanecem inalterados** | O data warehouse já trata `send_btn` como seed pareado de `message_completion`; os dois canais são independentes, esta mudança tem impacto zero em `/event/report` |

**Por que o double report foi descartado**: a mesma ação deixaria um registro em cada um dos dois canais, e a métrica derivaria com o tempo (uma mudou e a outra esquecida); além disso o lado `/event/report` já cobre o caminho de sucesso com `send_btn`, e a contagem duplicada poluiria os painéis existentes.

### 3.2 Semântica dos eventos

| Ponto de decisão | Conclusão | Justificativa |
| --- | --- | --- |
| Qual momento significa «envio bem-sucedido» | **Quando a mensagem do usuário aparece pela primeira vez no histórico da conversa** (primeira vez que `snapshot.rows.window` contém uma row com `kind === "userInput"` e `sourceCommandId === commandId`) | Mede o «minha mensagem saiu» perceptível pelo usuário; ACK accepted só significa que o Host aceitou o comando, e nesse instante nada aparece na tela |
| Manter em separado o trecho do ACK | Sim, abrir `ack_cost_ms` | Quando a latência ponta a ponta piora, é preciso distinguir de relance se o problema é «subida lenta» ou «retorno + renderização lento»; a subtração dá a segunda metade |
| ACK já accepted mas a row não retorna | Fallback com timeout de 30 s, reportando `status=fail` / `reason_code=render_timeout` | Não liquidar deixaria um `send_click` pendente poluindo o denominador da taxa de sucesso; 30 s é muito acima do tempo normal de retorno, cair aqui significa que algo realmente deu errado |
| Falhas devem reportar? | Sim, compartilhando `send_result` com o sucesso, distinguindo por `status` + `reason_code` | A taxa de sucesso é o indicador central deste rastreamento; reportar só o sucesso equivale a ter apenas o numerador |

**«ACK accepted é sucesso» foi refutado.** Nessa métrica, a medição real em máquina dá apenas 66 ~ 142 ms: mede o ida-e-volta do comando subindo até o Host aceitar, que não é a mesma coisa que o instante em que o usuário vê a própria mensagem — veja a §2 «A mensagem do usuário não tem renderização otimista». A métrica antiga é mantida como `ack_cost_ms` e deixa de ser o sinal de liquidação de `send_result`.

**Nome**: o evento de resultado se chama `send_result` e não `send_success`. Na convenção já existente do projeto, `xxx_success` é um evento que reporta **apenas sucesso**; eventos de resultado com sucesso/falha usam `xxx_result`; o ARMS é um namespace totalmente novo, sem conflito de nome com `send_btn`, então basta seguir a convenção.

## 4. Cadeia alvo

```
Clique na caixa de entrada（focus real do usuário）
   └─► ARMS send_input_focus                    ← novo
Digita o conteúdo…
Clique em enviar / Enter（passa pelo gate de envio, congela sendTime + send_click_id）
   └─► ARMS send_click                          ← novo
        │
        ├─ gate secundário de pré-upload de anexo falha ─────────► send_result status=fail  reason_code=attachment_not_ready
        ├─ guard de produto do onSendText rejeita ─────────────► send_result status=fail  reason_code=blocked
        ├─ confirmação secundária da fila（ACK `reasonCode=guard.heldQueueConfirmationStale`）── não liquida, aguarda o usuário confirmar e reusa o mesmo seed
        │
        └─► dispatchCommand → sendCommand(envelope)
              ├─ ACK accepted / duplicate ─► send_btn（/event/report existente, sem mudança）
              │      └► grava ack_cost_ms, registra «aguardando renderização»（com timeout de 30 s）, **não liquida aqui**
              │            ├─ retorno da projeção com row userInput（sourceCommandId casa）
              │            │     └► ARMS send_result status=success  value=send_cost_ms（ponta a ponta）  ← novo
              │            └─ não chegou em 30 s ────► send_result status=fail  reason_code=render_timeout
              ├─ ACK rejected / stale / failed / noop ─► send_result status=fail（liquidação imediata）
              └─ throw ────────► send_result status=fail  reason_code=transport_error | provider_not_ready
```
Saída do reporte:

```
supervisor ─► sendFunnelArmsTelemetry.emit()
   └─► platform.reportArmsCustomEvent(payload)
        └─► IPC PlatformChannels.ReportArmsCustomEvent
             └─► buildFinalArmsCustomEventPayload()   injeta app_version / arms_env / device_mid / platform / renderer_id
                  └─► RUM SDK sendCustom()
```

## 5. Definição dos eventos

Os três eventos pertencem ao group do ARMS **`send_funnel`**. O payload do ARMS tem o formato `{ name, group, value, properties }`:

- `value` é **numérico** e é o indicador principal do evento no lado ARMS;
- os valores de `properties` aceitam `string | number | boolean`; o processo principal `buildFinalArmsCustomEventPayload` aplica `String()` de forma unificada antes de persistir;
- **properties com valor `undefined` não são enviadas** (em vez de gravar `""`), aparecendo no ARMS como atributo ausente.

### 5.1 `send_input_focus` — clique na caixa de entrada

| Campo | Valor |
| --- | --- |
| `name` | `send_input_focus` |
| `group` | `send_funnel` |
| `value` | `1`（evento de contagem） |

`properties`:

| Chave | Tipo | Significado |
| --- | --- | --- |
| `focus_time` | number | relógio do renderer no momento do focus（milissegundos） |
| `composer_scope` | string | `session`（sessão existente）/ `draft`（novo rascunho） |
| `talk_id` | string? | `sessionId` atual; no estado de rascunho não é enviado por omissão |

**Reporta apenas focus real do usuário, nunca focus programático.** O autofoco do `ConversationComposer` (nova tarefa, troca de sessão, devolução do cursor após montar, retorno de foco após remoção de bloco de contexto) passa uniformemente por `flushPendingFocus` chamando `inputApiRef.current.focus()`, o que dispara o mesmo evento DOM de focus; na implementação, uma flag é marcada nesse ponto, e `handleEditorFocus` consome a flag e pula o reporte. A gravação de timestamp de `recordComposerFocus()` **não é afetada**: os dois tipos de focus continuam sendo registrados, e a métrica `input_start_time` do `send_btn` não muda.

Não há deduplicação por janela de tempo: um focus real, um evento, correspondendo literalmente a «clicar na caixa de entrada». Se for preciso deduplicar por sessão, a agregação por `talk_id` é feita do lado ARMS.

### 5.2 `send_click` — clique em enviar

| Campo | Valor |
| --- | --- |
| `name` | `send_click` |
| `group` | `send_funnel` |
| `value` | `1`（evento de contagem） |

`properties`: os campos de modelo/modo/plano congelados no seed (mesma origem do `send_btn`, ou seja, o produto de `buildV4ConversationPromptTelemetryExtraDetail`), mais:

| Chave | Tipo | Significado |
| --- | --- | --- |
| `send_click_id` | string | ID de correlação（uuid）deste envio, pareado com o `send_result` |
| `input_send_time` | number | `sendTime` congelado, mesmo valor do campo de mesmo nome do `send_btn` |
| `send_trigger` | string | `button`（clique no botão de envio）/ `shortcut`（Enter para enviar） |
| `composer_scope` | string | `session` / `draft` |
| `talk_id` | string? | `sessionId` atual; no estado de rascunho não é enviado por omissão |

**Momento do reporte**: dentro de `submit()`, no instante em que o gate de envio é aprovado, `pendingRef` é marcado e `telemetrySeed` é congelado. Chamadas barradas pelo gate (rascunho vazio, `pendingRef` já ocupado, anexo não pronto) não reportam — nesse momento o botão de envio já está disabled e não configura um envio válido.

**Reuso de seed não reporta de novo**: a confirmação secundária da fila (`clearQueueAndSend` / `keepQueueAndSend`) entra novamente em `submit()` com o `existingTelemetrySeed` do primeiro clique; nesse caso não há novo reporte, garantindo estritamente 1:1 com o `send_result`.

O valor de `send_trigger` é implementado por uma flag marcada no `onClick` do botão de envio — o botão é `type="submit"` e compartilha o `onSubmit` do `LexicalChatInput` com o Enter, e a ordem dos eventos DOM garante que o click vem antes do submit; a flag é zerada imediatamente após ser lida em cada `submit()`, e o valor padrão é `shortcut`.

### 5.3 `send_result` — resultado do envio (sucesso e falha)

| Campo | Valor |
| --- | --- |
| `name` | `send_result` |
| `group` | `send_funnel` |
| `value` | **`send_cost_ms`**: do clique em enviar até a liquidação deste envio, a latência **ponta a ponta** = instante da liquidação − `sendTime`, preenchida também nas falhas |

Colocar a latência em `value` em vez de `properties` é o motivo central da escolha do canal ARMS nesta rodada: do lado ARMS é possível calcular avg / p50 / p95 / p99 diretamente sobre esse evento, com corte pelas properties abaixo.

`properties`: os mesmos campos de seed do `send_click`, mais:

| Chave | Tipo | Significado |
| --- | --- | --- |
| `send_click_id` | string | ID de correlação pareado com o `send_click` |
| `status` | string | `success` / `fail` |
| `reason_code` | string? | omitido em caso de sucesso; em caso de falha ver a tabela abaixo |
| `ack_status` | string? | status original do ACK（`accepted` / `duplicate` / `rejected` / `stale` / `failed` / `noop`）; omitido quando não houve ACK |
| `send_cost_ms` | number | mesmo valor de `value`, redundante para permitir a leitura direta na dimensão de property |
| `ack_cost_ms` | number? | do clique em enviar até o recebimento do ACK = instante do ACK − `sendTime`; omitido nos caminhos de falha sem ACK |
| `send_queue_confirmed` | boolean | `true` indica que houve, no meio do caminho, o diálogo de confirmação secundária da fila |
| `talk_id` | string? | `sessionId` conhecido no momento da liquidação; omitido quando o primeiro envio ainda não foi promovido |
| `message_id` | string? | `commandId` correspondente ao ACK; omitido nos caminhos de falha que não chegaram ao dispatch |

**Relação entre `send_cost_ms` e `ack_cost_ms`**: `send_cost_ms − ack_cost_ms` é o trecho «retorno da projeção + renderização pelo React». Quando a latência ponta a ponta piora, primeiro veja em que lado essa diferença cai, para não confundir um problema de renderização com um problema de rede.

Valores de `reason_code`:

| Valor | Ponto de disparo |
| --- | --- |
| `attachment_not_ready` | `attachmentsApi.prepareForSend()` retorna `null`, o gate secundário de pré-upload de anexo falha |
| `blocked` | `onSendText` retorna `"blocked"`, rejeição pelo guard de produto |
| `rejected` / `stale` / `failed` | os status correspondentes do ACK |
| `render_timeout` | ACK já `accepted` / `duplicate`, mas em 30 s a projeção nunca devolveu a row `userInput` correspondente |
| `transport_error` | `sendCommand` lançou exceção (diferente de provider não pronto) |
| `provider_not_ready` | `sendCommand` lançou exceção de provider não pronto |
| `composer_error` | demais exceções capturadas por `submit()` |

`attachment_not_ready` não contradiz «anexo não pronto não reporta `send_click`» da 5.2: o primeiro é o caso em que, no clique, `hasUnreadyAttachments` já era verdadeiro e o botão estava disabled, sem nunca entrar no corpo de `submit()`; o segundo é o caso em que, no clique, o anexo parecia pronto e o `send_click` já foi reportado, e só então `prepareForSend()` falhou. Este último, se não for liquidado, deixa um `send_click` pendente poluindo o denominador da taxa de sucesso.

**Enquadramento de `noop`**: `CommandAck.status` tem também um `noop` (comando julgado pelo Host como desnecessário). Ele não ganha um `reason_code` próprio e é registrado uniformemente como `failed` — do ponto de vista do usuário, «a mensagem foi enviada ou não», a resposta é que não; o valor original é preservado em `ack_status=noop`, e quando for preciso distinguir, use drill-down por esse campo.

**ACK que não liquida**: `ack.reasonCode === "guard.heldQueueConfirmationStale"` é o sinal da confirmação secundária da fila, com a semântica de «aguardar a decisão do usuário e reenviar reutilizando o mesmo seed», e não um estado terminal. Nesse caso é **proibido** chamar `settleSendResult()`, e é **proibido** registrar a espera de renderização — uma vez liquidado, o first-wins consumiria o resultado real de sucesso/falha posterior. Essa verificação tem precedência sobre `ack.status` (o status desse ACK em si não é `accepted`).

O mapeamento entre `ConversationSendFailureReason` e o ACK é centralizado em uma única função pura `resolveSendAckSettlement()` (exportada por `conversationTelemetrySupervisor.ts`); `dispatchCommand` só chama, sem escrever ramos próprios. **A semântica de retorno desta função foi ajustada nesta rodada**: `accepted` / `duplicate` não retornam mais um estado terminal, e sim `{ kind: "awaitRender" }`, com o chamador registrando a espera de renderização; os demais ACKs continuam retornando `{ kind: "settle", status: "fail", … }` e liquidam imediatamente.

### 5.4 Mecanismo de espera pela renderização

Quando o ACK é `accepted` / `duplicate`, o supervisor registra um registro de espera de renderização com chave `commandId`, contendo o seed, `ackCostMs` e um timer de 30 s:

| Gatilho | Ação |
| --- | --- |
| `snapshot.rows.window` passa a conter `kind === "userInput" && sourceCommandId === commandId` | liquida `status=success`, `send_cost_ms` = instante da renderização − `sendTime` |
| o timer de 30 s vence primeiro | liquida `status=fail` / `reason_code=render_timeout`, `send_cost_ms` = 30000 |
| `dispose()` | limpa todos os timers, sem reporte de compensação |

Os dois caminhos são **first-wins**: depois que qualquer um liquida, o registro é cancelado imediatamente e há `clearTimeout`; a deduplicação já existente em `settledSendClickIds` serve como uma camada extra de proteção, garantindo que um `send_click` só tenha um `send_result`.

O sinal de renderização é produzido pelo `SessionPane` na fase de commit da atualização da projeção (`useEffect` dependente de `snapshot`): percorre todas as rows `userInput` de `snapshot.rows.window` e entrega o `sourceCommandId` de cada uma ao supervisor; internamente o supervisor filtra pela tabela de esperas (`Map.get` O(1)), ignorando commandIds não registrados, de modo que backfill de mensagens históricas e recarga de sessão nunca disparam falsamente.

**Não é possível tomar apenas a última `userInput`.** Depois que a mensagem do usuário retorna, linhas de resultado em background (`origin=backgroundResult`) podem ser inseridas em seguida no fim da janela; olhar apenas a cauda perderia a própria mensagem do usuário e classificaria um envio normal como `render_timeout`. O custo da varredura completa da janela é da mesma ordem do `hasPluginReferenceUserRows()` já existente no mesmo arquivo, e roda apenas uma vez dentro do effect.

**Por que usar `useEffect` e não o callback de assinatura do store**: o `useEffect` roda depois do commit no DOM, quando o balão do usuário já está de fato pintado na tela; o callback de assinatura do store apenas indica que os dados chegaram, e o React ainda não renderizou. A métrica é «apresentado no histórico da conversa», então é preciso o momento após o commit.

**Métrica de latência**: `send_cost_ms` é calculado a partir do **primeiro** clique em enviar. Se surgir um diálogo de confirmação secundária da fila no meio do caminho, esse tempo de permanência do usuário é contado, por isso marcamos com `send_queue_confirmed=true`; a análise de latência puramente de canal deve excluir esse subconjunto (filtrando por essa property no lado ARMS).

**Deduplicação**: first-wins por `send_click_id`, um `send_click` corresponde a um único `send_result`. Um ACK `duplicate` entra na espera de renderização assim como o `accepted` — o comando realmente existe do lado do Host e, do ponto de vista do usuário, ele ainda deve ver sua mensagem; assim que a row chegar, registramos `status=success`.

**Amostras pendentes**: hoje há duas origens. Primeira, quando o usuário cancela o diálogo de confirmação secundária da fila, aquele `send_click` nunca terá um `send_result` pareado — é um abandono real do usuário, identificado do lado ARMS por ausência de pareamento, sem reporte de compensação. Segunda, o caminho de slash commands ainda não está integrado (ver «Lacunas conhecidas» no topo), uma lacuna de implementação e não comportamento do usuário, que precisa ser excluída ao calcular a taxa de sucesso; assim que esse caminho receber o `telemetrySeed`, este item deixa de existir.

## 6. Cenários que não reportam

Os cenários a seguir **não devem** gerar estes três eventos, em coerência com o princípio já existente de «não fabricar ações do usuário»:

- Não-desktop (Web, controle remoto pelo celular): o reporter não é instalado, todo o grupo fica em silêncio.
- Tarefas automáticas em background (Off-Peak, automation): não passam pelo composer, o seed não tem `sendClickId`, e a liquidação pula direto.
- Promoção de fila (mensagem enfileirada ativada como a rodada atual): não é um novo clique do usuário.
- Autofoco programático: ver 5.1.

## 7. Falhas não podem ferir o fluxo principal

O ARMS é um caminho de observabilidade, isomorfo ao `uiPerfArmsTelemetry` já existente: `emit()` envolve exceções síncronas em `try/catch` e anexa `.catch()` à Promise retornada, e numa falha faz apenas `logger.warn`, **nunca bloqueando o fluxo principal de envio**. Quando o reporter não está instalado (Web / não inicializado), retorna direto, sem enfileirar nem fazer cache.

Os três eventos são fire-and-forget síncronos e não passam pela fila serial `enqueueReport` — aquela fila é a garantia de ordem do canal `/event/report`, e o ARMS não tem essa necessidade (coerente com eventos ARMS já existentes como `reportUiFirstToken`).

## 8. Pontos de implementação

| Arquivo | Mudança |
| --- | --- |
| `packages/ui/src/lib/sendFunnelArmsTelemetry.ts` | **Novo**. Exporta as constantes `SEND_FUNNEL_ARMS_GROUP` e dos três nomes de evento, `setSendFunnelArmsReporter()` / `clearSendFunnelArmsReporterForTest()`, `reportSendFunnelInputFocus()` / `reportSendFunnelSendClick()` / `reportSendFunnelSendResult()`. Estrutura copiada de `uiPerfArmsTelemetry.ts`. `SendFunnelReasonCode` ganha `render_timeout`, e `reportSendFunnelSendResult()` ganha o `ackCostMs` opcional → property `ack_cost_ms` |
| `packages/ui/src/Root.tsx` | dentro do `useEffect` existente, adiciona `setSendFunnelArmsReporter(isDesktop ? platform : null)`, com cleanup em `null` (ao lado de `setUiPerfArmsReporter`) |
| `packages/ui/src/v4/telemetry/conversationTelemetrySupervisor.ts` | `recordComposerFocusClick()` / `recordSendClick()` / `settleSendResult()` passam a chamar os helpers ARMS acima, **sem mais `enqueueReport`**; `resolveSendAckSettlement()` passa a retornar dois estados, `await-render` / `settle`; novos `awaitSendRender()` (registra a espera de renderização + arma o timer de 30 s) e `notifyUserInputRendered(commandId)` (porta de entrada do sinal de renderização); `dispose()` limpa todos os timers de espera de renderização |
| `packages/ui/src/v4/ConversationComposer.tsx` | A integração permanece igual (as assinaturas de método não mudaram) |
| `packages/ui/src/v4/SessionPane.tsx` | Os ramos de ACK passam a divergir pelo novo retorno de `resolveSendAckSettlement()`: `awaitRender` chama `awaitSendRender()`, `settle` chama `settleSendResult()`; novo `useEffect` dependente de `snapshot`, percorrendo todas as rows `userInput` de `snapshot.rows.window` e entregando o `sourceCommandId` a `notifyUserInputRendered()` |

A geração de `send_click_id` reaproveita `globalThis.crypto?.randomUUID?.()` com implementação de fallback (igual a `codingPlanFunnelTelemetry.createPurchaseFunnelId`).

## 9. Requisitos de teste

Conforme o AGENTS.md, escreva os testes antes da implementação.

- `packages/ui/test/v4ComposerSendFunnelTelemetry.test.ts`: o objeto de asserção é o **payload ARMS** (`name` / `group` / `value` / `properties`), cobrindo — reporte de focus real / `recordComposerFocus` mantendo zero reporte, pareamento de `send_click_id` entre `send_click` e `send_result`, os dois valores de `send_trigger`, as nove classes de `reason_code` de falha, deduplicação `send_click_id` first-wins, `value` sendo `send_cost_ms` e a métrica com confirmação de fila, tarefas em background não reportando, silêncio quando o reporter não está instalado, silêncio após dispose, além do mapeamento de ACKs de `resolveSendAckSettlement()` (incluindo o enquadramento de `noop` e a confirmação secundária da fila não liquidando).
- **Especial da espera por renderização** (principal salvaguarda da nova métrica desta rodada):
  - Após ACK `accepted`, **não** reportar `send_result` imediatamente;
  - só reportar após receber o sinal de renderização correspondente, e então `value` / `send_cost_ms` iguais à latência **ponta a ponta** (instante da renderização − `sendTime`), com `ack_cost_ms` igual ao trecho do ACK;
  - `duplicate` e `accepted` seguem o mesmo caminho de espera;
  - sem resultado em 30 s → `status=fail` / `reason_code=render_timeout` / `send_cost_ms=30000`;
  - first-wins entre o sinal de renderização e o timeout: quem chegar primeiro liquida, quem chegar depois fica em silêncio (testar nos dois sentidos);
  - um sinal de renderização de `commandId` não registrado não dispara nenhum reporte (backfill de mensagens históricas / recarga de sessão);
  - o ACK de confirmação secundária da fila não liquida nem registra a espera de renderização;
  - após `dispose()`, os timers não disparam mais reportes (avançar um relógio falso até 30 s e asseverar zero reportes).
- **Zero poluição em `/event/report`**: é obrigatório asseverar que estas três ações **não chamam** `platform.reportTelemetryEvent` em hipótese alguma, e que o momento e os campos do `send_btn` existente permanecem inalterados — é a salvaguarda de regressão para as duas restrições «não mexer no `send_btn`» e «ir apenas pelo ARMS».

**Não entra no parity differential legacy↔V4**: o `minimumReportInventory` de `conversationTelemetryParityScenarioDefinitions.ts` tem nome de «mínimo», mas na prática é um `toEqual` de correspondência exata em `conversation-session-telemetry-parity-all-cases.test.ts`, e a mesma expectativa precisa restringir simultaneamente as duas variantes de bridge, legacy e V4. Estes três eventos são produzidos apenas pelo `ConversationTelemetrySupervisor` do V4; o driver de replay legacy não tem supervisor, então não tem como produzir os eventos correspondentes — colocá-los na tabela de expectativas faria a variante legacy falhar necessariamente. A responsabilidade do parity é provar que as saídas finais das duas versões são equivalentes; eventos novos exclusivos do V4 estão fora dessa responsabilidade e ficam cobertos pelos testes unitários acima. A tabela restringe a saída `/event/report`, e estes três eventos não passam por esse canal, estando naturalmente fora do seu alcance.

Isso não constitui um ponto cego de rastreamento: em todo o repositório há apenas um único ponto de entrada de envio, `packages/ui/src/v4/ConversationComposer.tsx`; helpers como o `queuePromptTelemetry` legacy hoje só são referenciados pelo supervisor do V4 e por esse driver de replay, não existindo nenhum caminho real de envio sem instrumentação.