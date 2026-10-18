# Plano de Implementação do Timeline Authority

> Baseado em: [`15-timeline-resolver-design.md`](./15-timeline-resolver-design.md)（方案）、
> [`15-timeline-resolver-design-review.md`](./15-timeline-resolver-design-review.md)（revisão prévia F1–F10）、
> segunda rodada de revisão em nível de código (R1–R13, 2026-07-07).
> Ponto de partida: resolver彻底 o「desalinhamento de ordem de mensagens/timeline」 e o「as mensagens simplesmente não renderizam」
> que ainda restavam após a refatoração v4, maximizando a compatibilidade com os dados históricos existentes do usuário
> (`~/.zcode/cli/db/db.sqlite`: 2.989 sessions / 26.942 messages / 96.112 parts).

## Status de implementação (2026-07-08)

P0–P4 totalmente implementados e commitados (feature/v4-vertical-slice):

| Fase                                                                                 | Commit       | Status                |
| ------------------------------------------------------------------------------------ | ------------ | --------------------- |
| P0 止血（correção de drift no on-conflict + backfill/gatilho 0015）                  | `eef7ed7a9` | ✅                    |
| P1 归一 do lado de leitura (consumo de part goal/model, mesclagem de session_entry, head-skip, extensão de conservação) | `5d08dfbb5` | ✅                    |
| P2 权威 de ordem (drain com troca de turno, divisão de tempo trabalhado, identidade/posicionamento de GV, zeragem de linhas invisíveis, achatamento S2, caminho frio S11) | `d35fa2123` | ✅ |
| P3 账本 de session_input (0016, promote atômico, contabilidade de wake, rastreio de limpeza no resume) | `fb13f9940` | ✅ |
| P4 收尾（fork provenance/remap, 归一 dos três caminhos, barreira de fim de turno, resync de conservação, replay sombra） | `f57146467` | ✅ |
| P5 持久 session_event journal                                                       | —            | Congelado (§6-5, não nesta rodada) |

Aceitação do replay sombra (`apps/zcode-cli/scripts/shadow-replay.mjs`, total local em 2026-07-08):
3.014 sessões → 0 crashes de replay, 0 corpo de assistant perdido, 0 marcadores goalVerify perdidos;
21 flags de userInput eram todos falsos positivos heurísticos de mensagens detectadas por texto legacy
(reminder de goal-continuation / fork notice sem marcador estruturado), e o comportamento do classificador está correto.

Margem conhecida de P1: o critério de conservação ainda é o `>=` insensível à ordem (a equivalência em nível de nó sensível à ordem será elevada depois junto com o normalizer único do P2);
a lista de reescrita documental (§7) ainda não foi executada.

Adendo de decisão de 2026-07-10: embora o commit original do P1 tenha completado a recuperação a frio de goal/model,
`v4-bridge.loadPersistedEvents` continua sendo uma「síntese eventStore de memória XOR transcript」, o que não corresponde
à semântica de mesclagem de três fontes congelada nesta seção. O lado de leitura precisa convergir para um cold merge testável em unidade:

```text
message / part durable transcript  ----\
                                        +--> cold merge --> canonical SessionEvent stream
session_entry goal legacy source  -----/
in-memory eventStore ------------------/     只补 in-flight / ephemeral
```

- O corpo persistido de user/assistant/reasoning/tool/timeline tem message/part como autoridade;
  eventos de corpo em memória com o mesmo `assistantMessageId` / `partId` / `toolCallId` não podem mais ser projetados uma segunda vez.
- Turnos não terminais são a exceção: para preservar a cauda de streaming ainda não persistida, esse turno é preenchido inteiramente pelos
  eventos de memória, sem sintetizar ao mesmo tempo os parts já gravados pela metade desse turno.
- Estados sem forma persistente em transcript, como queue / permission / control / background, são complementados a partir do
  eventStore; fatos antigos não reconhecidos ou não alinháveis precisam ser preservados com diagnostics emitidos, nunca descartados em silêncio.
- Limites de memória goal / compact / fork que carregam `anchorMessageId` / `targetMessageId` precisam ser resolvidos exclusivamente por
  essa entidade persistente até o product turn sintetizado e inseridos no tail daquele turno; é proibido adivinhar por texto ou por tempo.
  Limites legados sem âncora ou com âncora irresolvível vão para depois do último hospedeiro conhecido e emitem diagnostic.
- `SessionInputPromoted` é um estado terminal conhecido da queue: ao calcular o conjunto de pendentes, o cold merge precisa retirar o
  `pendingInputId` correspondente, sem tratá-lo como evento desconhecido nem gerar alerta unclassified.
- `timeline/goal_verification` e session_entry continuam deduplicados por `targetId+goalIteration`;
  `timeline/model_change` precisa consumir explicitamente `fromModel/toModel`, e não pode depender apenas de a
  próxima mensagem de usuário reconstruir por acaso o snapshot de model.

Adendo de decisão de 2026-07-11 sobre o fechamento da projection: message, part, session metadata e goal são
autoridades persistentes; live e cold geram primeiro os fatos canônicos em unificação. `rowId` é rebaixado a display-only, e todas as rows acionáveis
são endereçadas por `entityId/productTurnId`. O edit unificado da latest real-user input (text/goal) passa por rewind; se já foi
coberto por um compact estável, faz um fork child atômico e navega. Edit de primary/continuation/verifier running passa primeiro
pela stop barrier, e compact ativo mantém um lock unificado de fork/edit/retry/send-now. O goal input do usuário precisa gerar
a canonical visible real-user row, compartilhar o target `editUserQuery` com o text query e preservar na reenvio o
intent `sendGoalCommand`; o lifecycle de `goalSet` em si não gera marker. Background model-only wake
sempre é um product turn independente; retry restaura o intent completo;
stable fork só é publicado depois que todas as referências child-local foram remapeadas atomicamente. Isso apenas completa o fechamento existente de P1/P2/P4
e não introduz novos ramos de produto de client-mode.

## 0. Decisão de causa raiz (por que a refatoração v4 não resolveu o problema original)

O v4 convergiu o estado para a projeção do CLI e deixou o UI renderizando sem pensar — esse passo está correto, e a camada de protocolo (enumerações delta fechadas,
apply, invariantes de convergência de profile, restauração por snapshot+afterSeq) já foi verificada como correta; este plano **não altera a forma do delta de protocolo**.

O que de fato não foi considerado são as quatro lacunas sistêmicas da camada de projeção, que correspondem uma a uma às falhas visíveis ao usuário:

| #   | Lacuna                                                                                              | Fato no código                                                                                                                                                                                                                                                     | Falha visível ao usuário                                  |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| G1  | Sem ordenação autoritativa: o marker é posicionado pela posição de chegada do append e o anchor no payload do evento é ignorado | `product-projection.ts:1391-1408`（goalVerify）、`:1225-1226`（comentário de compact「落在事件到达时的行尾」）；o schema `TimelineMarkerRow` não tem anchor（`rows.ts:224-231`）；`turnIdOf` recorre para `"turn-unknown"`（`:1621-1623`） | goal verify / compact / fork marker derivam para o turno errado |
| G2  | Sem identidade de entidade: rowId é autoincrementado em processo, a input do usuário não tem id estável e o goalVerify usa o verificationId volátil como identidade | `rowBase` `nextRowId++`（`product-projection.ts:1612-1619`）；`buildUserInputRow` sem messageId/sourceCommandId；`verificationId = spanId ?? traceId`（`target-completion-verification.ts:108`） | o mesmo verify gera dois markers; a conservação não consegue julgar; o fork/edit não consegue consultar de volta |
| G3  | Semântica oposta nos caminhos live/cold: drain/model-only wake cai no mesmo runtimeTurn no live e troca/junta turnos por real-user no cold | live：`turn-loop.ts:33-55` + `onTurnSteerDrained` com o mesmo turnId；cold：`transcript-hydration.ts:708-771`；o UI agrupa por turnId + latestAssistantText（`conversationTurnRenderUnits.ts:77-174`） | o assistant do turno anterior é dobrado em「已工作」（Caso A）；a estrutura muda após o refresh |
| G4  | Ciclo de vida da input não é durable: o log de eventos é só em memória, a queue é só em memória e o comando de wake é só em memória | `InMemorySessionEventStore`（`adapters/storage/index.ts:21-55`，`create-app.ts:342`）；`runtimeCommandQueue` como array em memória（`command-queue.ts:98-99`）；o resume descarta pending steer（`steering.ts:825-869`）；o drain entre stores não é atômico（`steering.ts:726-760`） | a queue desaparece sem entrar no transcript（Caso B）；o reinício perde a queue/perde o wake |

Dois fatos-chave corrigidos (que decidem que o custo do reparo é menor do que a estimativa do design 15):

1. **Os fatos persistentes de goal verify / model change já estão completos**: a verification grava um timeline part a cada vez
   (identidade `targetId_goalIteration`、`anchorMessageId/anchorTurnId`，`events.ts:217-291`) + session_entry;
   e o model change também tem um timeline part persistente（`timeline-persistence.ts:44-87`）. A perda acontece no **lado de leitura**:
   a hydration só consome `context_compaction`（`transcript-hydration.ts:165-198,641-643`）,
   e o critério de conservação não conta essas duas categorias（`:807-862`）。
2. **A recuperação a frio é uma escolha binária entre「log de eventos OU síntese completa」**（`v4-bridge.ts:320-338`）, e o log de eventos é em memória
   — um cold start verdadeiramente entre processos segue 100% pelo caminho de síntese com perdas.

## 1. Mapeamento falha → fase de reparo (tabela geral de aceitação)

| Falha visível ao usuário                                    | Causa raiz                                                                                                                                                                                                                                                                                                                                                                     | Fase de reparo                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A resposta do assistant inteira desaparece**（a dor original do usuário, não é dobra) | live: a projeção só recebe texto em streaming na phase=running, e a barreira「迟到终态不复活」 recusa silenciosamente o bloco inteiro（`product-projection.ts:527`）; cold: assistant/mensagens sintéticas antes da primeira mensagem real de usuário são puladas inteiras（`transcript-hydration.ts:708-711`，acontece quando o cabeçalho da sessão é um rewind notice/compact summary） | P1 + P2（conservação de assistant） |
| O assistant do turno anterior parece ter desaparecido (após o drain, o text inicial é dobrado em「已工作」) | G3 + a inferência por latestAssistantText do UI                                                                                                                                                                                                                                                                                                                                     | P2                           |
| A mensagem da queue desaparece e não entra no transcript           | G4（drain não atômico / a projeção assume estado em memória）                                                                                                                                                                                                                                                        | P3（durable）+ P2（a projeção assume） |
| O goal verify desaparece após a recuperação a frio               | G4 → o lado de leitura não consome                                                                                                                                                                                                                                                                                  | P1                           |
| Posição errada do goal verify / marker duplicado                | G1 + G2                                                                                                                                                                                                                                                                                                            | P2                           |
| Marcadores de compact / fork deslocados                        | G1; anchor de fork aproximado pelo fim da linha                                                                                                                                                                                                                                                                     | P2 + P4                      |
| Model change some na recuperação a frio / área de dobra fantasma | O lado de leitura não consome + rows invisíveis entram na window                                                                                                                                                                                                                                                     | P1 + P2                      |
| Pertencimento errado do background wake / aparece bolha de usuário | G3                                                                                                                                                                                                                                                                                                                 | P2                           |
| A ordem após refresh/reinício difere do live                  | G3 + hydration de escolha binária                                                                                                                                                                                                                                                                                   | P1 + P2                      |
| O status do marker não é atualizado (fica em running)          | upsert fora da janela é no-op silencioso（`apply.ts:64-65`）                                                                                                                                                                                                                                                          | P4                           |
| A queue/o wake pendente desaparece silenciosamente após reinício | G4                                                                                                                                                                                                                                                                                                                 | P3                           |

## 2. Solução geral (adoção e correções do design 15)

Adota-se o esquema em camadas do design 15, com três correções vindas da revisão:

```text
Persisted Facts（权威）：message / part / session metadata / goal（+ 内存事件日志仅作 live 加速）
        |
        v
Event Normalizer（唯一入口，P1 重心）
  live 事件与 cold 事实都归一为 typed semantic events
  三源合并 + 去重，废除 XOR 二选一
        |
        v
Semantic Ledger（P2）
  typed entities，entityId 全部由持久事实派生
        |
        v
Timeline Resolver（P2，弱化版）
  主序 = normalizedOrderKey 近乎全序（定义见下）
  + 有界 anchor 局部重挂（boundary 挂到目标 productTurn 尾，不做通用拓扑求解）
        |
        v
Materializer：兼容期继续输出 rows.window（带 entityId/productTurnId/visibility）
        |
        v
UI：按 resolver 结果渲染，删除 turnId+latestAssistantText 推断
```

**Definição de `normalizedOrderKey`** (hoje há quatro conjuntos de numeração incomparáveis: message.sequence é a ordem dentro da sessão,
part.sequence é a ordem dentro da message, session_entry não tem número e a ordem de event é independente — é preciso normalizar primeiro,
senão a implementação volta a adivinhar por timestamp/append):

```text
normalizedOrderKey = (
  branchEpoch,        # rewind/fork 换代，最外层
  hostMessageSeq,     # 事实所在或锚定的 message 的 session 内 sequence
  hostPartSeq,        # message 内 part sequence；message 级事实取 -1
  boundaryRank,       # 同宿主位置的 lane 序：trigger < assistantWork < turnTailBoundary
  lifecycleOrdinal,   # 同一实体生命周期内第 N 次状态变化
)
```

- Fatos cujo hospedeiro não é uma message (session_entry goal verify, eventos live) são primeiro resolvidos por anchor até a
  message hospedeira (`anchorMessageId` → seu messageSeq); se a resolução falhar → caem depois do último hospedeiro conhecido
  + diagnostics, sem adivinhar por timestamp.
- Saídas live in-flight ainda não persistidas são ordenadas depois de todos os fatos já persistidos e ordenadas internamente pela ordem de evento;
  depois que a persistência ocorre, o hostMessageSeq assume (entityId inalterado, apenas a troca da fonte autoritativa e sem salto de posição).

Três correções:

1. **O重心 vai do constraint graph para o normalizer** (decisão da revisão prévia): o esqueleto de ordenação é quase uma ordem total,
   e o difícil é normalizar cada fato em uma typed entity「com identidade estável, com anchor e com visibility».
2. **A saída do resolver não é persistida**: `productTurnId/orderKey/lane/placement` só podem ficar em cache (já decidido no design 15, mantido).
3. **Divisão durable/ephemeral**: streaming delta nunca entra na camada de fatos persistentes;
   se no futuro for criado um journal session_event persistente (P5, decisão independente), apenas eventos durables são aceitos.

## 3. Princípios de compatibilidade com dados históricos (restrição rígida em todas as fases)

1. **Linhas históricas somente leitura**: linhas históricas de message/part/session_entry nunca são reescritas; é proibido qualquer「re-save para corrigir」
   — antes de o on-conflict do P0 ser corrigido, re-salvar uma linha com NULL-sequence a derivaria para o fim da fila (`messages.ts:41-44`).
2. **Ordem determinística**: linhas históricas mantêm a ordem de leitura atual `sequence is null, sequence, time_created, rowid/id`,
   e um golden fixa que「várias hydrates da mesma session deem a mesma ordem» (incluindo o caso de NULL misturado e timestamps no mesmo milissegundo).
3. **Campos ausentes são derivados no momento da leitura**: dados antigos sem semantics/anchor são derivados pelo normalizer + placement de fallback explícito
   (posicionamento pela ordem dos fatos + marca de diagnostics), sem descarte silencioso e sem crash.
4. **Deduplicação de fonte dupla**: o goal verify é mesclado entre `session_entry` (corpo legacy, 1.402 linhas) e
   o part `timeline/goal_verification` (escrita nova) por `targetId+iteration`; as diferenças de produto das três
   caminhos de fork (com/sem timeline part) precisam ser todas recuperáveis.
5. **O backfill incremental de NULL sequence é feito apenas uma vez**: primeiro sela a fonte de escrita (P0) e então reexecuta de forma idempotente o backfill da função de janela 0014
   (apenas `where sequence is null`), deixando log de auditoria.
6. **Filhos de fork antigos**: referências embutidas em part que apontam para ids do pai (`clonePartForFork` sem remap,
   `steering.ts:60-65`) são rebaixadas no resolver a originRef/diagnostics e não participam do placement.
7. **A visibilidade não regride**: com o normalizer tendo semantics como autoridade, a visibilidade de mensagens antigas classificadas por detecção de texto
   (compact summary, goal continuation, task notification, rewind notice, fork notice) não pode mudar — é travada com um golden de classificação de todas as categorias.
8. **Compatibilidade de protocolo**: a forma de rows.window é mantida, e os clientes desktop/web não precisam de upgrade em lockstep.
9. **Aceitação por replay sombra**: fornecer um comando dev que passe todo o histórico local de session pela nova pipeline,
   emitindo a lista de falhas de conservação e o diff entre as projeções antiga e nova; o limiar de lançamento = lista de falhas de conservação revisada manualmente e sem descarte silencioso.

## 4. Plano por fases

### P0 止血: selar as fontes de dados ruins (sem mudar nenhuma semântica de comportamento)

Superfície de mudança:

- Corrige os dois ramos de on-conflict de `messages.ts`: re-salvar uma linha NULL não pode derivar para o fim da fila;
  o ramo de rebind entre sessions (import upsert) precisa ser explicitado ou proibido.
- Adiciona gatilho/restrição no DB: o sequence de message/part recém-escrito não pode ser NULL
  (o gatilho pode preencher `max+1` automaticamente para escritas de binários antigos, evitando que o desvio de versão continue produzindo NULL).
- Localiza a origem dos NULL: o principal suspeito das 1.690 linhas NULL ainda adicionadas após a migração é o **desvio de versão**
  (binários antigos escrevendo no mesmo DB), verificado por auditoria do gatilho, sem mais grep de código procurando caminhos laterais.
- Depois de selar, reexecuta o backfill de forma idempotente (princípio de compatibilidade 5).

Não faz: não mudar a projeção, não mudar a hydration, não mudar a UI.

Aceitação: golden `null-seq-determinism` (L1); novos NULL caem a zero depois que o gatilho sobe (auditoria do DB).

### P1 归一 do lado de leitura: Event Normalizer + mesclagem de três fontes (somente em tempo de leitura, a melhor compatibilidade histórica)

Objetivo: **a recuperação a frio não perde mais fatos**. Corrige «goal verify / model change desaparecem após o refresh» e «a recuperação de fork child perde fatos».

Superfície de mudança:

- Novo módulo Event Normalizer (bootstrap/zcode-protocol-v4), com uma única entrada de classificação para eventos live e fatos cold;
  `getConversationMessageProjectionPolicy` converge para um detalhe interno do normalizer:
  semantics tem prioridade e a detecção por texto só é habilitada para dados legacy sem semantics, contando diagnostics.
- `v4-bridge.loadPersistedEvents` muda de「log de eventos XOR síntese」 para **mesclagem de três fontes**,
  com regras de mesclagem em duas camadas:
  - **Prioridade autoritativa (fatos de corpo)**: message/part é a durable transcript authority —
    o corpo user/assistant text/reasoning/tool/timeline vem sempre de message/part;
    o log de eventos em memória só pode complementar dois tipos: ① estado de streaming in-flight ainda não persistido;
    ② estado ephemeral sem forma persistente (exibição de queue, interação de permission, fase de control).
    Quando as duas fontes têm o mesmo `assistantMessageId`/`partId`, a fonte persistente prevalece (a fonte de evento só serve quadros intermediários de streaming),
    eliminando a projeção dupla do mesmo trecho de corpo.
  - **Chave de dedupe de boundary**: compact=`operationId`、goal=`targetId+iteration`、
    fork=`parentSessionId+targetMessageId`、model=`anchorMessageId+from/to`；
    session_entry serve apenas como fonte legacy do goal verify e é mesclado com o timeline part entre as fontes.
- A hydration passa a consumir: parts `timelineType=goal_verification / model_change` e session_entry
  （`SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION`）.
- **Corrige o head-skip da hydration** (vetor do caminho frio de «a resposta do assistant inteira desaparece»,
  `transcript-hydration.ts:708-711` hoje faz skip direto). A forma do produto é fixa:
  se for possível resolver um parent/anchor recuperável (mensagem de input model-only correspondente, contexto de rewind/compact)
  → constrói um **preface productTurn** (trigger model-only, sem bolha visível, conteúdo de assistant visível);
  se não for possível resolver → **linha de diagnostics visível**. Os dois entram no golden live≡cold, e é proibido descartar em silêncio.
- Elevação do critério de conservação: o subconjunto de footprint de `eventsCoverTranscript` é substituído por
  **equivalência em nível de nó sensível à ordem e com contagem de goal/model** (depois elevada no P2 a golden em nível de nó).

Não faz: não mudar as regras de ordenação, não mudar a UI, não gravar nenhum campo novo no banco.

Aceitação (L1/L2): `GV-cold` / `MC-cold` / `GV-cold-session_entry` / `classifier-golden` /
golden de mesclagem de três fontes (qualquer subconjunto presente dá o mesmo estado terminal) / `assistant-head-skip`
(a resposta do assistant continua visível após a recuperação a frio de uma sessão cujo cabeçalho é um rewind notice / compact summary — o vetor do caminho frio de desaparecimento total).

### P2 权威 de ordem: identidade de entidade + divisão em productTurn + posicionamento por anchor (o núcleo do reparo de「desalinhamento」 e de「dobra engolindo mensagens」)

Objetivo: estrutura única live ≡ cold; A1/A2 visíveis; markers posicionados por anchor.

Superfície de mudança:

- **O CanonicalFact carrega simultaneamente visibilidade e endereçamento de comando**. O `SessionEvent` live e o
  message/part cold não podem montar payloads separados que «pareçam iguais»; antes de entrar no ProductProjection é preciso
  normalizar o mesmo conjunto de campos de entidade persistente: `entityId/productTurnId/runtimeTurnId/transcriptMessageId/
  visibility/origin/placement`. O `message.info.id` que a cold hydration já tem precisa entrar como
  `transcriptMessageId`, e é proibido reusar `hydrate-turn-N` para casar com o runtime anchor persistente.
- **row, command target e row.actions são materializados atomicamente**. O `rowId` pertence apenas à exibição/scroll virtual
  e não pode entrar no endereçamento de negócio do servidor. O mapeamento `entityId/productTurnId -> transcript message/turn boundary`
  é a projeção de comandos do ProductProjection, não um cache opcional; ao gerar ou atualizar uma row acionável,
  é preciso gerar na mesma redução o command target estável e
  `actions.canEdit/canRetry/canFork`. É preciso satisfazer:

  ```text
  row.actions.canEdit
    <=> resolveEditTarget(entityId, productTurnId) 成功
    <=> target 是最后一条 real user transcript message

  row.actions.canRetry
    <=> resolveRetryTarget(entityId, productTurnId) 成功
    <=> target 是全时间线最后一条稳定 assistant transcript message
  ```

  O UI só pode renderizar o row.actions emitido pelo CLI e não pode mais deduzir edit/retry/fork pela posição no array de rows, pela phase ou pela raw message.
  O command handler continua fazendo o guard final, mas não pode existir um estado de projeção parcial em que «a入口 fica visível e, na mesma
  revision, o target necessariamente falha ao ser resolvido».

- **A equivalência live/cold é elevada a equivalência de endereçabilidade**. O shadow replay/golden, além das rows visíveis, do corpo e dos markers,
  precisa comparar row a row o command target e as actions correspondentes a `entityId/transcriptMessageId`;
  cobrindo no mínimo falha antes da primeira letra do provider, tool-only, assistant vazio, edit da latest query após cold resume e o assistant completed comum. `0` mensagens perdidas já não equivale a fechamento completo da projeção.
- **Regras de derivação de entityId** (congeladas como contrato) — um item de queue e a mensagem de usuário promovida são **duas entidades**,
  e não podem compartilhar identidade:
  - `QueueItem.entityId = pendingInputId/inputId`（depois do ledger do P3 = session_input.id）；
  - `Promoted UserIntent.entityId = persisted user messageId`（os
    `injectedMessageIds` e `pendingInputIds` do evento de drain correspondem 1:1, e o runtime faz `persistUserPrompt`
    antes de emitir o evento de drain，`steering.ts:741-756`）；
  - os dois são relacionados por uma ref de causa: `UserIntent.cause = { pendingInputId, sourceCommandId }`;
  - a conservação de input é reescrita com base nisso: cada pendingInputId **ou** ainda está em QueueItem, **ou** existe
    um UserIntent promovido cuja causa aponta para ele, um dos dois;
  - assistant=assistantMessageId；compact=operationId；
    goalVerify=`targetId+iteration`（verificationId é apenas alias de attempt）；
    fork=`parentSessionId+targetMessageId`. É proibido usar `nextRowId++` como identidade e é proibido a ordenação lexicográfica do DB.
- **Regras de divisão em productTurn** (invariant de primeira classe, já decido em 2026-07-07/11, ver §7): dentro do mesmo runtimeTurnId,
  as fronteiras são delimitadas pela ordem dos fatos dos UserIntent de trigger (**queue drain / model-only continuation / background wake**);
  o background model-only wake cria incondicionalmente um productTurn independente e não gera row de trigger de usuário visível. **Steer (injeção no modo guide) não é fronteira** — ele é inline no turno atual e precisa das
  duas semânticas delivery=steer/queue (o ledger de session_input承载 isso naturalmente). O caminho live produz uma fronteira de productTurn no ponto de fronteira,
  e o caminho cold obtém a mesma estrutura pelo mesmo normalizer.
- **Ajuste伴奏 da granularidade do drain**: o runtime passa a drenar apenas um item da fila por vez, e cada item da fila corresponde 1:1 a
  um productTurn e a um trecho de resposta (decisão do §7).
- **Atribuição de tempo trabalhado**: o productTurn divide o tempo trabalhado por fronteira, e cada turno exibe a duração de trigger→próxima fronteira, cuja soma é igual ao tempo total (decisão do §7).
- **Conservação de assistant (vetor de recusa no live)**: a barreira「迟到终态不复活」（`product-projection.ts:527`）
  não pode descartar silenciosamente o texto em streaming — na recusa, registra diagnostics e dispara um resync a partir dos fatos persistentes para completar,
  garantindo que cada mensagem de assistant persistida corresponda a um segmento visível ou a uma linha de diagnostics.
- **Exibição de corpo em múltiplos segmentos**: todos os segmentos de assistant text dentro do mesmo productTurn ficam totalmente achatados e visíveis,
  e apenas a atividade de tool/reasoning/subagent é dobrada em「已工作」（decisão do §7, eliminando a sensação de a dobra engolir o corpo）。
- **Fatos de lifecycle que não geram marker row**（decisão do §7）: `retryNotice`、`goalSet` e o lado pai
  `forkCreated` não geram mais timeline marker row (hoje os três são linhas invisíveis que «entram na window e renderizam null»);
  o state fact `goalSet` pertence ao painel de goal, mas cada input de usuário `sendGoalCommand` que o dispara ainda precisa
  ser materializada como canonical visible real-user row, compartilhando o target `editUserQuery` com o text query;
  a relação de fork pertence à árvore de sessions e o retry não deixa rastro. O turno de wake de background não tem linha de trigger（S14）.
- **Forma de turno incompleto**（协议 PB-AUTO-COMP-STOP-G12 + S15）: resolver/UI precisam suportar
  o turno interrupted「只有 trigger（+ marcador compact cancelled opcional）、没有 assistant segment» —
  pendingAction de auto-compact interrompido por stop e steer já injetado interrompido por stop
  produzem essa forma, e ela não pode ser julgada como perda pela verificação de conservação nem engolida pelas regras de dobra.
- **Boundary de goal verify**: identidade `targetId+iteration`，**upsert-by-lifecycleKey**
  （started ou terminal podem criar a entidade primeiro, abolindo o descarte do «estado terminal sem started marker»
  e o perda silenciosa do `if (!goal) return []`); o placement passa por
  `anchorAssistantMessageId || anchorTurnId || fallback explícito`, abolindo o buraco negro de `"turn-unknown"`.
- **Assistant em múltiplos segmentos**: um productTurn com múltiplos segmentos é preservado por inteiro; o fork só é preso ao último segmento concluído do turno ao qual pertence;
  o retry só é preso à última row assistantText de toda a timeline (garantido pela saída do resolver, e o UI não infere mais por conta própria).
- **Fechamento da intenção de edit/retry**: o `editUserQuery` unificado só resolve o latest real-user
  canonical intent da branch ativa (text ou goal); quando não coberto por compact, faz rewind, e quando coberto por stable compact,
  faz fork child apenas de conversation de forma atômica e navega assim que a projeção estiver disponível. O goal input do usuário é uma real-user row comum,
  com action target estável `entityId/productTurnId` compartilhado; o reenvio precisa manter o intent `sendGoalCommand` e é proibido
  degradar para `sendText`. O retry restaura o kind text/goal, os attachments, o delivery/
  fallback e a causa de origem a partir da causa canônica, e é proibido reconstruir a partir do texto da row. O edit de primary/goal continuation/goal verifier running
  (incluindo o latest goal input) passa unicamente pela stop barrier primeiro; se a barreira falhar, não há rewind e não há início de novo
  text/goal, preservando o active work antigo, a input original e a branch. O compact ativo mantém um lock de operação unificado para fork/edit/retry/send-now.
- **Canal stateOnly**: modelChange e afins não renderizam marker e não entram em rows.window
  （ou o produto decide que são rows visíveis, uma chose entre as duas; é proibido a linha invisível que「entra na window e renderiza null»）；
  a saída do materializer tem validação rígida: stateOnly/hidden não entram em rows, e trigger hidden não afeta a contagem de turnos.
- **UI**: `conversationTurnRenderUnits` passa a consumir o resultado do resolver
  （rows com `entityId/productTurnId/visibility`）, removendo a inferência por turnId+latestAssistantText.
- A verificação de conservação é implementada por inteiro conforme os invariantes de conservação do design 15 e, em caso de falha, não envia um snapshot ruim e registra diagnostics.

Aceitação (L1/L2/L4): `QD-node`（A1∈T1、A2∈T2 visíveis，live≡cold）；`GV-identity` /
`GV-terminal-only` / `GV-late-anchor`；`BG-wake-cold`（turno model-only independente、sem bolha de usuário）；
golden em nível de nó live≡cold；`assistant-conservation-live`
（texto em streaming chegando numa phase diferente de running → sem descarte silencioso, diagnostics+resync — vetor live do desaparecimento total）；
`steer-inline`（S1：steer não troca o turno、um trecho de tempo trabalhado、o edit reverte o turno inteiro）；`drain-per-item`（S3）；
`worked-time-split`（S5）；text de múltiplos segmentos totalmente achatado + fork preso apenas ao último segmento（S2）；
retryNotice/goalSet/forkCreated não geram mais lifecycle marker row（S7/S9/S10，linhas invisíveis zeradas）；
a canonical real-user row do input `sendGoalCommand` do usuário precisa ser preservada.

### P3 写入端 durable: ledger de session_input + atomicidade do promoted (a raiz do reparo de «engolir mensagens»)

Objetivo: a existência da queue/do wake não depende mais de nenhuma memória de processo.

Superfície de mudança:

- Nova tabela `session_input`（migration 0015）:
  `id`（= **input/command id**，existente já na admission）、`session_id`、`kind`、
  `delivery`（steer/queue）、`payload_json`、`admitted_sequence`、`promoted_sequence`、
  `promoted_message_id`（**nullable**，gravado na mesma transação da persistência da mensagem de usuário no promoted）、
  `status`（admitted/promoted/**cancelled/discarded**——cancelled/discarded承载 a semântica de TurnSteerDiscarded e de
  stop-held）、`time_created/updated`.
  A migração de status precisa cobrir as decisões já existentes no protocolo: `discarded(session_resumed)`（§6-1, não preserva no reinício）、
  `discarded(user_cleared)`（o clearQueueAndSend de heldQueueInputRequiresChoice）、
  o submitting de steer interrompido por stop → volta a `admitted`（de volta à held queue），e o já drained interrompido por stop →
  `promoted`（a mensagem permanece no turno como interrupted，S15）. O ledger também oferece idempotência durable
  para commands de classe input（a tabela de idempotência do command-inbox é hoje um LRU em memória e perde validade ao reiniciar o processo）。
  Nota: o messageId da ZCode só é criado via `createMessageId()` no momento do drain, e não há message id pré-alocado na admission
  para ser reutilizado como input id; escolher uma chave estrangeira nullable é o que menos invade o fluxo de ids existente, e o ledger consegue expressar o estado「aceito mas não consumido».
- **Atomicidade do promoted**: o drain/promote ocorre na mesma transação da persistência da mensagem de usuário;
  o texto da row drenada vem do ledger e a projeção não depende mais da `queue.items` em memória
  （abolindo o `if (!item) continue` silencioso de `onTurnSteerDrained`）.
- Background wake: o comando `task-notification` entra no ledger (admitted) e é promovido após a execução do wake;
  após um crash, o wake pendente pode ser recuperado.
- **Semântica de crash/reinício (já decidida)**: após o reinício **não se preserva a queue**; o ledger registra os itens não consumidos como
  `discarded(session_resumed)` para deixar rastro, e não é permitido um desaparecimento silencioso sem ledger.
- message/part recém-escritos recebem incrementalmente os campos JSON `semantics/anchor/sourceCommandId/cause/visibility`
  （dados antigos ficam intactos e são derivados pelo normalizer do P1）.

Aceitação (L2/L4): replay da janela de crash — itens admitted e não promovidos voltam como
`discarded(session_resumed)` após a recuperação a frio e **não entram na queue**（consistente com a decisão 1 do §6）;
crash após o promoted → o transcript precisa ter a mensagem de usuário correspondente e sem duplicação（sem órfãos e sem escrita dupla）；
o comportamento da queue após reinício em L4（queue vazia + o ledger com rastros de discarded consultáveis）。

### P4 传输与 fork 收尾

Superfície de mudança:

- **Entrega de alterações tardias (já decidido, §7)**: o resolver do CLI não感知 a área visual do usuário e mantém apenas o timeline
  authority completo; uma alteração tardia com anchor fora da janela **não é renderizada imediatamente, não é append ao final e não é descartada** —
  o publisher registra dirty range / revision e o cliente, ao materializar o productTurn correspondente, devolve a estrutura mais recente.
  A mesma regra cobre o caso de «upsert cujo alvo não está na window já entregue»（hoje é no-op silencioso, `apply.ts:64-65`）.
- **Reparo do fork**（afeta apenas forks novos; dados antigos seguem o princípio de compatibilidade 6）:
  message/part recém copiados gravam a provenance `origin*`; os metadata da child session, message/part, o snapshot de goal,
  a provenance de fork e o anchor de projeção são gravados na mesma transação atômica. Todas as referências child-local
  de message/part/tool/timeline/compact/goal (incluindo anchorMessageId, compaction
  tail_start_id/summaryMessageId) são remapeadas pela mesma tabela de mapeamento; somente um originRef explícito pode continuar apontando para o pai.
  Se qualquer referência child-local não puder ser remapeada, todo o fork falha e o child não é publicado, sem degradar para um producto pela metade;
  os produtos persistentes dos três caminhos de fork são normalizados (`forkWorkspaceAtMessage` ganha timeline part)；
  **o lado pai não gera mais row forkCreated**（decisão do §7: a relação de fork só aparece na árvore de sessions,
  e o forkNotice no topo da child é mantido）— com isso, o problema original de「substituir a aproximação pelo fim da linha por um anchor preciso» desaparece;
  o fork tem validação forte na camada core: só é permitido o último segmento de assistant em estado concluído no fim de cada turno（decisão 3 do §7）。

  Os requisitos de atomicidade/remap do fork não mudam a política de workspace: o stable fork em execução é conversation-only
  e não faz rewind do workspace compartilhado; o edit coberto por compact passou a ser um branch cut append-only na session original
  e não reutiliza mais o bundle de fork; o comportamento de checkpoint existente do fork completed/idle não é ampliado nem reduzido.

Aceitação: upsert fora da janela em L2; golden `fork-remap`（verificação item a item das referências child-local e rollback em caso de falha）；
`resync-scope`; fork graph cut em L4（prevenção de regressão）。

### P5（item de decisão independente, não bloqueia P0–P4）：journal session_event persistente

Hoje não existe log de eventos persistente (R1). P0–P4 se baseiam inteiramente na realidade de「message/part/session metadata/goal como autoridade + log de eventos em memória como
aceleração live» e não dependem deste item. Se a decisão for construir:
- Forma da tabela `session_event(id, session_id, sequence, kind, data_json)` + allocator por session;
- É obrigatório fazer a divisão durable/ephemeral (streaming delta não entra no banco);
- Benefícios: ordem total dentro da session, o ledger pode degradar para eventos `command.*` e o replay do web remote fica sem síntese.
- Custos: amplificação de escrita, política de retenção e consistência de escrita dupla com o message/part existente.

## 5. Infraestrutura de teste e aceitação

- A lista de casos L1/L2/L4 de cada fase está nos itens de aceitação correspondentes (em correspondência 1:1 com a lista da revisão), e a semântica accepted é reescrita
  no case catalog e na coverage matrix.
- **Ferramenta de replay sombra** (entrega do P1, reutilizada por P2/P3/P4): comando dev que percorre as sessions históricas locais,
  hidrata pela nova pipeline e emite: a lista de falhas de conservação, a contagem de fallback por diagnostics e o diff estrutural em relação à projeção antiga.
  O limiar de lançamento de cada fase = replay total sem crash, sem descarte silencioso e com a lista de falhas revisada.
- As falhas de conservação expõem diagnóstico no ambiente de desenvolvimento e são registradas em log na camada de serviço (decisão 12 do design 15, mantida).

## 6. Resultado das decisões (2026-07-07, decisão do usuário, tudo consolidado)

1. **A queue não é preservada após o reinício**: o ledger registra `discarded(session_resumed)` como rastro (P3).
2. **Momento de visibilidade do modelChange**: trocar de modelo na caixa de input não entra na timeline; somente o turno que,
   depois da troca, for realmente enviado recebe o divisor「模型已切换」（consistente com a semântica atual R-17, congelado）。
3. **O fork só no fim de cada turno**: a UI não expõe o fork de segmentos intermediários de assistant; a camada core faz validação forte e só permite
   o último segmento de assistant em estado concluído no fim do turno（P2/P4）。
4. **Alteração tardia = dirty range / materialização preguiçosa**: o resolver não percebe a área visual e mantém apenas o
   timeline authority completo; uma alteração tardia com anchor fora da janela não é renderizada imediatamente, não é append ao final e não é descartada,
   e o publisher registra dirty range / revision, com o cliente materializando o productTurn correspondente na estrutura mais recente（P4）。
5. **Esta rodada de P0–P4 não cria um journal session_event persistente**: message/part/session_entry continuam sendo a
   durable authority e o log de eventos em memória só faz aceleração live; depois que normalizer/resolver/session_input
  estiverem corrigidos, se ainda for preciso unificar a proveniência de eventos, o session_event será avaliado como a proposta independente P5.

## 7. Tabela de decisões de ordem e semântica de negócio (2026-07-07, alinhada item a item com o usuário, fonte normativa dos goldens L1)

Correção do diagnóstico (confirmada pelo usuário): o主体 de «a resposta do turno anterior não aparece» é **a resposta do assistant inteira desaparecendo**
（a barreira de recusa no live + o head-skip no cold, ver a primeira linha da tabela do §1）, e a dobra é apenas um problema secundário de percepção. Ambos são corrigidos,
correspondendo respectivamente à conservação de assistant e ao achatamento do corpo em múltiplos segmentos.

| #   | Cenário                                                                    | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Superfície afetada                        |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| S1  | steer（injeção durante a execução no modo guide）                          | **Inline sem troca de turno, com segmento visual de trabalho independente（corrigido em 2026-07-19）**: a bolha fica inline no ponto de injeção e os segmentos de assistant antes e depois pertencem ao mesmo productTurn; cada guide aceito fecha um visual work segment anterior e abre um novo, cada um exibindo/colapsando seu próprio tempo trabalhado; continua havendo apenas uma entrada de fork (o segmento do fim do turno); editar uma mensagem de steer = reverter o turno inteiro e reexecutar. Precisa das duas semânticas delivery=steer/queue                                                                                                                                                                                                        | regras de divisão, campo delivery do ledger, turnHeader.workSegments |
| S2  | Corpo de assistant em múltiplos segmentos no mesmo turno (text→tool→text)   | **Prioridade para a ordem total das rows**: o renderer precisa renderizar pela ordem total das rows emitida pelo CLI, e o text inicial, tool/reasoning/subagent/compact do mesmo visual work segment não podem ser reagrupados e reordenados; um segment comum tem apenas um controle de dobra, e as fronteiras de guide abrem um novo segment/controle conforme S1. O último segmento de assistantText do fim do turno é externalizado como corpo final, o fork só é preso ao último segmento daquele turno e o retry só à última row de assistantText de toda a timeline; a cópia do segmento do fim do turno = a união de todos os segmentos de text do turno inteiro | unidades de renderização do UI            |
| S3  | Granularidade de consumo de várias mensagens da queue                        | **Um turno por mensagem**: o runtime passa a drenar apenas uma por vez, com fila:resposta:productTurn = 1:1:1                                                                                                                                                                                                                                                                                                                                                                                                                                            | turn-loop do runtime, conservação do ledger |
| S4  | goal verify × ordem da queue                                                | **Fila tem prioridade（janela limitada）**: os itens da queue já admitted antes do ponto de agendamento do verify (quando o turno anterior faz settle) são consumidos antes do verify; os itens admitted depois do ponto de agendamento entram na próxima janela (enfileirados depois deste verify/continuation), evitando que o verify sofra inanição indefinida por causa de adições contínuas. A continuation de notSatisfied é enfileirada depois da input do usuário desta janela. **Adendo (catálogo BG03, accepted）**: enquanto qualquer tarefa de background está running, o verifier adia o envio da requisição e só revalida após o goal loop pós-comando consumir a notificação de background — a ordem completa de agendamento = drenar a fila → esperar o consumo da notificação de background → verify → continuation      | agendamento do continuation loop         |
| S5  | 「已工作 xx 秒」após a divisão de turnos pelo drain                           | **Dividir por fronteira**： cada turno exibe trigger→próxima fronteira, e a soma = o tempo trabalhado total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | cálculo do turnHeader                     |
| S6  | Compact automático entre turnos（compressão por limiar disparada por nova input）| **Atribuir ao primeiro turno ativo seguinte**: a narrativa é「usuário envia → compressão → começa a trabalhar」（o compact dentro do turno mantém a decisão de atividade dentro do assistant work）                                                                                                                                                                                                                                                                                                                                                                                                                                             | posicionamento do compact                  |
| S7  | Timeline do pai após um fork                                               | **Não exibe forkCreated**: a relação de fork só aparece na árvore/lista de sessions; o forkNotice no topo da child é mantido                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a projeção não gera row; o problema rewind×fork desaparece |
| S8  | rewind/edit truncando um turno com ponto de fork                           | **Desaparece com o branch**: a timeline reflete apenas o branch atual; a child continua acessível pela lista de sessions                                                                                                                                                                                                                                                                                                                                                                                                                                                      | semântica de branchEpoch                   |
| S9  | Rastro de retry                                                              | **Sem rastro**: o turno antigo é substituído por inteiro; o retryNotice é removido da projeção (eliminando a linha invisível); para manter o branch antigo use fork                                                                                                                                                                                                                                                                                                                                                                                                         | a projeção não gera row                   |
| S10 | Boundary do goalSet                                                         | **Lifecycle stateOnly + user intent visível**: o fato `goalSet` em si não exibe marker de timeline e é SUPPORTED pelo painel de goal; cada `sendGoalCommand` do usuário ainda gera uma canonical visible real-user row, compartilhando o target `editUserQuery` com o text query, e o reenvio mantém o intent de goal                                                                                                                                                                                                                                      | camadas de stateOnly e user input          |
| S11 | Vários backgrounds concluídos (idle)                                        | **Um turno por notificação**: simétrico a S3, 1:1, em turnos model-only seriais (comportamento atual, congelado）                                                                                                                                                                                                                                                                                                                                                                                                                                                               | agendamento de wake                       |
| S12 | Decisão de ação durante o goal verifying (detalhado em 2026-07-08/11, atualizado em 2026-07-13) | **O goalVerifier deixa de ser um lock de operação independente**: mensagens (sendText//goal) e o `/compact` tipado entram na fila; fork é **permitido**（basta que o alvo seja histórico estável, alinhado ao catálogo H06）; sendQueuedNow é **permitido** = primeiro faz stop do verifier（conta como failed(cancelled)、o goal passa a paused）e depois drena（alinhado às 238 linhas do catálogo）; o edit da latest real-user input（text ou goal）é **permitido** = primeiro faz stop do verifier e depois faz rewind/fork pelo target unificado `editUserQuery` e reenvia com o kind de intent original; se a barreira falhar, preserva o work/input/branch antigo e não inicia um novo goal. O edit de uma real-user input que não é a latest continua recusado; o stop pode interromper o verifier. Apenas compact active/queued aciona `compactOperationLock`. | guard/disponibilidade                      |
| S13 | Troca de modelo antes de um turno de continuação model-only                  | **Mostrar o divisor normalmente**: sempre que um turno realmente usou um modelo diferente do anterior, o divisor é gravado, seja o gatilho o usuário ou a continuação de goal/o wake de BG                                                                                                                                                                                                                                                                                                                                                                                                   | posicionamento do modelChange              |
| S14 | Forma visível de trigger do turno de wake de background (2026-07-08, consolida o item pendente #1 do design 15) | **Sem linha de trigger**: o turno de wake mostra apenas o conteúdo do assistant e o seu próprio「已工作」; as informações da tarefa em background são SUPPORTED pelo drawer/área de status; a linha `turn:t2/input:background-result` no exemplo de rows do documento de protocolo precisa ser corrigida                                                                                                                                                                                                                                                                                        | contrato de rows                            |
| S15 | Usuário faz stop quando o steer já foi submetido mas ainda não foi confirmado o drain (2026-07-08) | **Diferenciado por já ter sido injetado**: se o runtime já confirmou o drained → a bolha do steer permanece na posição original dentro do turno (o turno é marcado como interrupted e, após o stop, pode suffer edit/retry, alinhado ao precedente G12); se ainda está em submitting → volta para a queue (held, autoDrain=false) e o ledger volta para admitted                                                                                                                                                                                                                                                                        | convergência do stop, migração de status do ledger |

### Lista de reescrita documental (documentos existentes a sincronizar depois que S1–S15 forem consolidados)

| Documento                                                     | Mudanças necessárias                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/conversation-product-protocol.md`                         | ① O invariant `goalVerifierActiveWorkOperationLock` e o stable guard são reescritos em dois pontos conforme S12 (mensagens e compact tipado entram na fila, fork permitido, sendQueuedNow=stop-barrier, edit da latest text/goal=stop-barrier); ② Na tabela de Fork, a linha `activeWork.kind=goalVerifier → reject` passa a allow; ③ O exemplo de rows de Projection Shape remove a linha `turn:t2/input:background-result`（S14, sem linha de trigger）; ④ Distingue o lifecycle `goalSet` que não gera marker da user goal input que precisa ser visível e editável; ⑤ `compactActiveWorkOperationLock` cobre apenas o compact duplicate active/queued |
| `docs/conversation-session-case-catalog.md`                     | Reescrever S1–S15（especialmente S1 steer inline、S3 um turno por mensagem、S4 janela limitada、S14/S15）, com H06 e a semântica das 238 linhas permanecendo como referência                                                                                                                                                                                                                                                                                          |
| `packages/formal-proof`                                         | Remover a semântica antiga do lock de goalVerifier e alinhar com S12                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/testing/conversation-session-e2e-coverage-matrix.md`      | Acrescentar entradas conforme os casos de aceitação de cada fase em §4/§5                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/v4-refactor/15-timeline-resolver-design.md`               | Pendente #1 → S14、#2 → §6-2、#3 → S12、#4 → §6-4，marcados como já decididos                                                                                                                                                                                                                                                                                                                                                                                                     |