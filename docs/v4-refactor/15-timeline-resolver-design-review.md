# Timeline Resolver Design — Revisão de Arquitetura/Lógica

> Estado: **registro histórico de pré-revisão**. As conclusões da revisão foram consolidadas e implementadas em
> [16-timeline-authority-plan.md](./16-timeline-authority-plan.md); os caminhos e achados abaixo descrevem a linha de base no momento da revisão.

> Objeto da revisão: [`15-timeline-resolver-design.md`](./15-timeline-resolver-design.md)
> Natureza da revisão: apenas revisão de arquitetura/lógica, sem alterar código nem o documento revisado.
> Método da revisão: leitura completa do documento de design + do código de projeção/hydration/persistência + do case catalog + da coverage matrix, com verificação em nível de código dos julgamentos experimentais críticos.

## Conclusão primeiro

A direção está certa: elevar a CLI de "row append reducer" para "timeline authority" é o caminho correto.

Mas **o documento de design apostou a autoridade na camada de constraint graph / resolver, quando a camada de menor autoridade — e que mais facilmente continuará engolindo mensagens — é a que está a montante, a de «normalização semântica + identidade de entidade»**. Hoje essa camada tem duas implementações distintas nos caminhos live e cold, a cobertura de âncoras de persistência é de ~2%, e o documento de design só lhe dá uma lista de campos, sem algoritmo de normalização nem regras de derivação de identidade.

Abaixo, 10 findings ordenados por severidade; ao final, os invariants que precisam ser congelados, o veredito sobre o modelo mental e os complementos de E2E.

## Uma julgamento do documento revisado que precisa ser corrigido primeiro

**O fork que copia o transcript não contorna a escrita de sequence.** `copySessionMessagesForFork` (`apps/zcode-cli/packages/core/src/runtime/methods/workspace-checkpoints.ts:51-93`) passa por `persistMessage/persistPart` → `sessionStore.saveMessage/savePart` (`.../methods/message-persistence.ts:331-364`), e saveMessage/savePart sempre aloca sequence (`apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/messages.ts:32-35,73-77`). Portanto a suposição do documento de que «caminhos de fork/copy contornam o saveMessage unificado» não se sustenta para o caminho principal de fork atual (ver F5).

---

## Findings (ordenados por severidade)

### F1 —【Blocker, atinge Q1】A hydration de recuperação fria é um «mapper inverso incompleto»: os fatos de goal verify / model change / session_entry são descartados inteiros a cada recuperação fria

**Problema.** `synthesizeEventsFromMessages` só sintetiza inversamente text / reasoning / tool / timeline **apenas de compact** / subtask (`transcript-hydration.ts:627-651`; `synthesizeCompactPart` retorna true somente para `context_compaction`, `165-198`). Uma timeline part com `timelineType = goal_verification / model_change` cai no `synthesizeCompactPart` retornando false e **não é consumida por nenhum ramo**; `session_fork` é tratada separadamente pela mensagem de nível `isForkTimelineMessage`. Mais crítico: nos dados reais, goal verify existe principalmente em **`session_entry` (1.402 linhas, corpo `target_completion_verification`)**, enquanto a hydration lê `messages()` (message+part), sem tocar em session_entry.

**Por que isso engole mensagens / causa drift de marker / torna dados antigos irrecuperáveis.** Consequência direta: **a cada recuperação por refresh do desktop, cada replay web remoto, os markers de goal verify e de model change desaparecem** (eles só existem no fluxo de eventos live, o caminho frio não os reconstrói). Não é um caso de borda, é uma regressão geral para todas as sessões com goal / troca de modelo. E o critério de conservação de `eventsCoverTranscript` (`transcriptFootprint`, `807-862`) conta apenas compact/subagent/fork, **não verifica goalVerify/modelChange**, e é uma cobertura de subconjunto com `>=` (`footprintCovered`, `907-917`), então julga como «coberto» um snapshot sem goal verify — a checagem de conservação é cega para essas duas classes de marker.

**Correção sugerida.** Isso confirma exatamente o item 7 da seção «Campos de persistência e relações com o banco» do design. Mas o documento precisa listar explicitamente **session_entry e as timeline parts de goal_verification/model_change como fontes de entrada do Event Normalizer**, e adicionar nos goldens L1/L2 «transcript com goal verify + model change na recuperação fria ≡ snapshot live». Antes de o resolver entrar em vigor, essa é a causa raiz de perda de markers mais certa e mais prevalente na stack atual.

### F2 —【Blocker, atinge Q1/Q6】queue drain e background wake caem no «turn de runtime atual» no live, mas no cold são segmentados como real-user — as duas rotas se comportam ao contrário, exatamente o mecanismo do «assistant anterior sendo engolido»; e o design não tem o algoritmo de «como dividir productTurn dentro do mesmo runtimeTurn»

**Problema.** Verificação no lado do runtime: `drainPendingInput` (`.../methods/steering.ts:712-751`) emite `TurnSteerDrained`, que é chamado **dentro do active turn loop** em `.../methods/turn-loop.ts:39`; a entrada drenada é alimentada como `drainedSteerForNextRequest` na próxima requisição do provider do mesmo turno — **o drain não produz um novo TurnStarted**. No lado da projeção, `onTurnSteerDrained` (`product-projection.ts:879-903`) acrescenta a row de userInput drenada em `turnIdOf(event)`=**turnId atual**, sem criar novo turnHeader nem novo productTurn. Já a recuperação fria, via `isRealUserTurnStarter`, inicia um novo turno para cada user real (`transcript-hydration.ts:708,714-728`). Assim:

- **live**: Q1/A1/Q2(drained)/A2 ficam todos sob um único turnId T1 → se a UI pegar latestAssistantText por turnId, A1 é dobrado no history (Caso A do design);
- **cold**: Q2 é real user starter → inicia hydrate-turn-2, e A2 pertence a T2 → estrutura inconsistente com o live.

O background wake funciona pelo mesmo motivo: um user só de modelo não é real-user-starter (`isRealUserTurnStarter`→false), então a recuperação fria vai fundir o A2 que processa `<task-notification>` ao turno anterior T1; no live, porém, pode ser criado um turno model-only. **As duas rotas dão estruturas de turno diferentes para os mesmos fatos** — essa é a origem estrutural de «desalinhamento/engolimento de mensagens».

**Por que o design ainda não resolveu de fato.** O design §«Queue Drain»/«Background Bash» sustenta que drain/wake devem abrir um novo `productTurnId`, direção correta. Mas **o design apenas declara a causa edge e a turn edge, sem dar a regra de «quando vários productTurn compartilham um mesmo runtimeTurnId, a qual productTurn pertence cada AssistantSegment do fluxo linear de eventos»**. A2 e A1 têm o mesmo turnId, o mesmo runtime turn; com base em que o resolver atribui A2 a T2? O único critério utilizável é `eventSeq`: os assistant segments dentro do mesmo runtimeTurn posteriores ao eventSeq do UserIntent de drain/wake pertencem ao novo productTurn. Essa regra é o núcleo do Caso A, mas está ausente do documento.

**Correção sugerida.** Escrever essa regra de divisão como invariant de primeira classe: *dentro do mesmo runtimeTurnId, o limite do productTurn é traçado pelo eventSeq do UserIntent de gatilho (drain / model-only continuation / background wake); todos os AssistantSegment / WorkActivity entre esse limite e o próximo pertencem a esse productTurn*. E exigir que live e cold passem apenas por essa regra (isto é, o live também deve produzir o limite de productTurn no drain, e não apenas acrescentar uma row de userInput).

### F3 —【Critical, atinge Q5/Q2】A identidade da entidade não pode ser derivada dos fatos persistidos: rowId é um contador volátil, e UserIntent (especialmente drained/model-only) não tem messageId → o invariant de conservação de entrada não tem como fazer keying

**Problema.** O `rowId = this.nextRowId++` de `rowBase` (`product-projection.ts:1612-1619`) é autoincremental dentro do processo e é reordenado do zero na recuperação fria, portanto **rowId não é uma identidade de negócio estável**. E `messageIdByRowId` só é escrito nas linhas de assistant (`openTextRow`, `597-599`); `buildUserInputRow` (user/drained/model-only) **nunca registra messageId**.

**Por que isso torna a conservação inaplicável / os dados antigos irrecuperáveis.** O primeiro item de «Invariantes de conservação» do design («cada visible inputId deve estar em exatamente um entre QueueItem ou UserIntent») depende de keying por um `inputId` estável — mas hoje nenhum UserIntent tem id estável disponível (rowId é volátil, messageId falta, `sourceCommandId` só existe em queue item, `onTurnSteerQueued:859`). A reversão `rowIdForMessageId` de fork/edit (`303-309`) por isso só funciona para assistant, e as linhas de user «sem messageId por enquanto» são simplesmente descartadas em `onRewindTriggered` (`287-289`). Resultado: a conservação de entrada, a contagem de fork targets e o veredito binário «o texto drenado vai para o history ou fica na queue» **faltam uma identidade de entidade que possa ser usada como chave**.

**Correção sugerida.** O design precisa dar a derivação determinística de `entityId` para **cada classe de entidade**. Prioridade: o entityId do UserIntent deve ser derivado do **user message id persistido** (o runtime já tem `messageID` em `persistUserPrompt`, `message-persistence.ts:44`); drained/queue usam `sourceCommandId`; assistant usa assistantMessageId; compact usa operationId; goal verify usa `targetId+iteration`; fork usa `parentSessionId+targetMessageId`. Entidades sem id estável não podem carregar decisões de conservação. Sem essa regra bem fixada, as checagens de conservação de F1/F2 ficam sem fundamento.

### F4 —【Critical, atinge Q6 goal verify】A verificação de goal atual usa verificationId como identidade, sem targetId e sem anchor — exatamente o antipadrão que o design proíbe explicitamente

**Problema.** `onTargetVerification` usa `goalVerifyMarkerRowIdByVerificationId.set(payload.verificationId, …)` (`product-projection.ts:1398,1430`) como identidade; o payload do marker carrega apenas `iteration + outcome` (`1396`), **sem targetId e sem qualquer anchor** — o marker é simplesmente anexado ao fim da linha de `turnIdOf(event)` (`1393-1397`).

**Por que isso desalinha.** (a) Um retry na mesma iteração traz um **novo verificationId** → gera um **segundo marker** (design §«Goal Verify»: `verificationId` só pode ser alias); (b) sem anchor → quando o evento chega atrasado ou o turnId do trace difere do turnId do assistant verificado, o marker cai no fim do turno errado (Caso C do design); (c) a iteração de um novo target reinicia em 1, então apenas a iteração colide entre targets. O documento de armazenamento §«Regras de atualização» já define a identidade como `targetId + goalIteration`, e o contrato também tem `targetId/goalIteration/anchorMessageId` em `GoalVerificationTimelinePart` — **o design está certo; o reducer atual está atrás do contrato**.

**Correção sugerida.** No resolver, a identidade de goal verify deve ser `targetId + goalIteration`, com `verificationId` rebaixado a alias de uma tentativa; o placement deve passar obrigatoriamente por `anchor = anchorAssistantMessageId || anchorTurnId || explicit fallback` (design §«Goal Verify»). E escrever isso como conservação: *para o mesmo targetId+iteration existe apenas uma entidade de fronteira*.

### F5 —【Major, atinge Q4】sequence NULL não vem dos caminhos principais de runtime/fork (verificado), e sim de um desvio ainda não localizado; além disso, a semântica on-conflict faz a linha NULL «salvar de novo a Derivá-la para o fim da fila»

**Problema e verificação.** Foram verificadas as duas escritas principais: a persistência do runtime e a cópia de fork passam **ambas** por saveMessage/savePart, que sempre aloca sequence não nulo via `coalesce(max(sequence),-1)+1` (`messages.ts:32-35,73-77`), e no on-conflict `coalesce(existing.sequence, excluded.sequence)` preserva o valor antigo. Portanto o juízo do documento de que «NULL é bagagem de dados antigos + suspeita de desvio em fork/copy» **não se sustenta nessa parte do caminho principal de fork**. Mas a observação do documento de 1.690 messages com NULL / 331 sessions / ainda crescendo após a migração é um sinal real → existe **outro caminho de escrita não localizado** (SQL cru / importação / script de correção / ferramenta de migração) que contorna o saveMessage.

**Risco oculto (vale fixar separadamente).** No ramo on-conflict, `sequence = coalesce(existing.sequence, excluded.sequence)` (`messages.ts:41-44` / `84-88`): se uma **linha existente com sequence NULL** for salva de novo pelo saveMessage (o assistant faz um segundo save ao completar), `existing.sequence` é nulo → toma-se `excluded.sequence` = `max+1` da sessão = **fim da fila**. Ou seja, qualquer linha histórica com sequence NULL, assim que for salva novamente, é movida para o fim da timeline → desalinhamento. Este é um vetor concreto de movimentação de dados.

**Correção sugerida.** (1) Primeiro auditar e fechar os desvios conforme o item 2 das «Sugestões de migração» do design, e adicionar um invariant no banco (NOT NULL / trigger) para impedir novos NULL; (2) o resolver deve **sempre preservar um desempate determinístico** na leitura (a ordem de leitura atual `sequence is null, sequence, time_created, rowid`, `messages.ts:117`, está correta, mas é preciso garantir que a promessa de design «múltiplas hydrates da mesma sessão produzem a mesma ordem» também valha com NULLs misturados — isso deve ser fixado por golden); (3) corrigir o on-conflict para que «salvar de novo uma linha NULL» não altere a posição relativa.

### F6 —【Major, atinge Q8 «parece sofisticado mas falha na implementação»】constraint graph + ordenação topológica global é overengineering para um problema quase totally ordered; a granularidade de snapshot.resync conflita com o windowing; o placement da fallback row não é definido

**Problema.** O esqueleto do problema de ordenação é **quase totalmente ordenado**: `(branchEpoch, eventSeq)` já dá a grande maioria da ordem, e o que realmente exige «correção fora da cauda» é apenas um punhado de fronteiras (goal verify atrasado, fork notice). O design §«Ordenação autoritativa», porém, sustenta «deterministic topological placement» para cinco classes de arestas. **O risco da ordenação topológica genérica**: assim que uma aresta falta ou forma um ciclo (late event + retry + fork copy criam ciclos implícitos com facilidade), a falha é silenciosa, e o determinismo de «usar entityOrdinal na mesma posição» depende de que cada entidade receba um ordinal estável — o que volta ao problema de identidade de F3.

Em segundo lugar, o design §«Delta e Resync» diz «orderKey de uma entity visível cai no meio de uma janela já enviada → snapshot resync», mas `rows.window` é **janelado** (26.942 messages / 96.112 parts não podem ficar todos residentes). O documento não define: o resync é da sessão inteira ou só da janela? Como colocar quando a âncora cai **fora da janela carregada**? Goal verify atrasado é muito comum → um resync total frequente causaria um flicker perceptível em sessões longas.

Terceiro, a diagnostics fallback row da recomendação 7 de migração é boa, mas **não define o orderKey / a atribuição de productTurn da fallback row** — linhas «não agrupáveis」 ainda precisam de uma posição para serem renderizadas; o fallback apenas empurra o problema de placement para frente.

**Correção sugerida.** (1) Expressar a ordenação como «ordem total primária por `(branchEpoch, eventSeq)` + um conjunto **limitado de re-parenting local de âncoras**», em vez de uma resolução por grafo genérico; a âncora só influencia «em qual productTail esta fronteira se pendura», não a topologia global. (2) Definir o resync como um **resync com escopo na subárvore do productTurn**, e explicitar o comportamento «âncora fora da janela → ampliar a janela ou adiar a colocação». (3) Para a fallback row, definir explicitamente: colocação no fim conhecido da timeline + marcador de diagnóstico visível + contagem como falha de conservação; nunca silenciosa.

### F7 —【Major, atinge Q2】A divisão em quatro camadas não basta: branchEpoch (identidade de ramo), delivery/snapshot revision e visibility/semantics foram enfiados em outras camadas

**Problema.** `eventSeq / runtimeTurnId / productTurnId / visualPlacement` cobrem «ordem de chegada / pertencimento ao runtime / turno lógico / posição visual», mas:

- **branchEpoch** (truncamento por rewind, em qual história linear se está após um fork) só aparece dentro de `TimelineOrderKey`, sem ter sido elevado a uma «camada de ordenação» de primeira classe. Um rewind reescreve a história (`onRewindTriggered:275-301` marca `row.removed` em bloco desde a primeira linha do turno), então o mesmo productTurnOrdinal tem semântica diferente antes e depois do rewind → o branch tem de ser a camada mais externa da chave primária de ordenação.
- **delivery/snapshot revision** está misturado com a ordem da timeline. `visualPlacement` carrega ao mesmo tempo lane, anchor e order; e «qual versão o cliente já recebeu» (revision/epoch, `attachRevision:181-192` já tem revision) é a dimensão de delivery, ortogonal à ordenação visual, e deve ser listada à parte.
- **visibility/semantics** é uma dimensão de normalização independente (visible / modelOnly / stateOnly), hoje implícita na lane. A lane é «em qualpista colocar»; visibility é «colocar ou não dentro de rows.window» — as duas são ortogonais (ver F8).

**Correção sugerida.** Expandir explicitamente o modelo de ordenação para: `branchEpoch` (mais externo) → `productTurnOrdinal` → `laneRank` → `entityOrdinal` → `lifecycleOrdinal`, e escrever `visibility` e `deliveryRevision` como duas dimensões independentes, ortogonais à «ordenação», no contrato de snapshot.

### F8 —【Moderate, atinge Q6 modelChange + pureza de rows.window】A implementação não tempista stateOnly: todo marker é uma row em rows.window; e modelChange nem aparece na recuperação fria

**Problema.** `onTurnStarted` dá append direto de modelChange em rows.window (`product-projection.ts:388-403`); na projeção, compact/goal/fork/model são todos rows de `timelineMarker`, **sem nenhum canal stateOnly**. O design §«Model Change» e §«Conservação·Renderização» exigem «se modelChange não for visível no transcript, deve ser stateOnly e não entrar em rows.window» — mas a estrutura atual não consegue expressar stateOnly. Além disso, a recuperação fria não sintetiza ModelSelected nem timeline part de model_change (F1), e o marker de modelChange é derivado no live da comparação entre `lastTurnModel` e `config` (`381-410`) → **model change nunca aparece na recuperação fria**: nem há evento de mudança de config, nem síntese inversa da timeline.

**Por que isso desalinha.** Entidades hidden/modelOnly/stateOnly, uma vez que entram na window como row, poluem a rolagem virtual, o agrupamento de turnos e o colapso de history (o design §«Lane e Placement» aponta isso explicitamente). Hoje o model-only só é tratado caso a caso em «pular a visible userInput row» (`416-421`), sem nenhuma garantia estrutural.

**Correção sugerida.** Introduzir uma classificação `stateOnly` de verdade, e transformar «stateOnly/hidden não podem entrar em rows.window» e «gatilho hidden/modelOnly não pode afetar a contagem de turnos visíveis do usuário» em uma validação dura na saída do materializer. A timeline part de modelChange também precisa entrar na síntese inversa da recuperação fria (absorvido em F1).

### F9 —【Moderate, atinge Q3 julgamento de persistência】O julgamento das três camadas de armazenamento é em geral correto, mas session_entry é a verdadeira fonte autoritativa de goal verify e precisa ser incorporado ao normalizer e deduplicado contra as novas timeline parts

**Problema/positivo.** O documento sobre o posicionamento dos três bancos (CLI `db.sqlite` = autoridade do transcript; app `zcode.db` = metadados/notificações; `tasks-index.sqlite` = listagem/busca, não é fonte de ordem) está coerente com o documento de armazenamento e o julgamento se sustenta. Mas o próprio documento lista `session_entry` (1.402 linhas, corpo `target_completion_verification`) como o fato de goal verify, e as seções §「Caminho de leitura」/sugestões de migração dão muito pouco peso à leitura de session_entry; a hydration não a lê de forma alguma (F1). Nos dados reais há apenas 10 registros com `timelineType=goal_verification`, enquanto session_entry é o corpo → **hoje goal verify vive essencialmente em session_entry**.

**Correção sugerida.** Listar explicitamente session_entry como fonte de entrada de primeira classe do Event Normalizer; a chave de deduplicação de goal verify = `targetId+iteration`, com merge entre `session_entry` (legado) e `timeline/goal_verification` (novo). O lado de fork já tem `copyGoalVerificationEntriesForFork` reescrevendo o anchor para o child message id (`session-fork.ts:282-354`), o que mostra que a semântica de anchor de session_entry já está em uso e o resolver não pode ignorá-la.

### F10 —【Moderate, atinge Q7】desktop continuous e web replayable só podem «compartilhar o resolver» depois da unificação feita em F1/F2/F3; hoje o critério de «equivalência» é de subconjunto e não ordenado, o que não prova convergência

**Problema.** O objetivo 6 do design sustenta que os dois perfis compartilham o snapshot autoritativo e que delivery só afeta quadros intermediários. Arquiteturalmente, live (`applyEvent`) e cold (`synthesize→applyEvent`) de fato reutilizam o mesmo `ProductProjection`, o que está certo. Mas o «compartilhamento» hoje é nominal: os mecanismos de classificação divergem (live usa `TurnStarted.inputVisibility`/payload dos eventos; cold usa `getConversationMessageProjectionPolicy` + `isRealUserTurnStarter`), e a equivalência só é garantida pelo footprint `>=` de subconjunto de `eventsCoverTranscript`, insensível à ordem e cego para goal/model (`907-941`). Portanto ele passa em «cobertura», mas não bloqueia as divergências estruturais de F1/F2.

**Correção sugerida.** (1) O Event Normalizer se torna o **único** ponto de entrada de classificação; live e cold primeiro normalizam para o mesmo evento semântico tipado e só então entram no ledger; (2) elevar o critério de equivalência de subconjunto de footprint para **equivalência golden em nível de nó** (estrutura de productTurn, ordem dos segments por turno, boundary anchor, visibilidade — tudo tem que bater); diferenças de perfil de delivery só podem aparecer na «quantidade de quadros intermediários», nunca no snapshot final.

---

## O que está na direção certa & os invariants que precisam ser congelados

Direção aprovada: fatos brutos → **normalização semântica** → ledger semântico → constraints (sugerido enfraquecer para re-hang local de âncoras) → snapshot resolvido → UI. Para que isso realmente «não adivinhe / não complete / não engula», os invariants abaixo precisam ser congelados antes da implementação (✅= já no design, falta implementar; ➕= falta no design):

1. ✅→implementar **conservação de entrada**: cada visible inputId está em exatamente um entre QueueItem ou UserIntent — **desde que F3 forneça um entityId estável para UserIntent**.
2. ➕ **regra de divisão de productTurn**: dentro do mesmo runtimeTurnId, o limite do productTurn é traçado pelo eventSeq do UserIntent de gatilho, e o assistant segment posterior ao limite pertence ao novo productTurn (F2).
3. ✅→implementar **identidade única de goal verify**: `targetId+iteration` é único, verificationId é apenas alias, e deve haver anchor (F4/F9).
4. ➕ **ortogonalidade entre visibility e lane**: stateOnly/hidden estruturalmente não pode entrar em rows.window; validação dura na saída do materializer (F8).
5. ➕ **equivalência live≡cold em nível de nó**: os dois perfis passam pelo mesmo normalizer e goldens em nível de nó são iguais, e não um subconjunto de footprint (F1/F10).
6. ➕ **identidade derivável da persistência**: todos os entityId são derivados de messageId/partId/operationId/targetId+iteration/sourceCommandId; é proibido depender de nextRowId++ ou da ordenação lexicográfica do banco (F3/F7).
7. ✅→implementar **sem descarte silencioso**: toda message/part visível que não possa ser agrupada tem que entrar na diagnostics fallback e contar como falha de conservação (F6).
8. ➕ **hierarquia da chave primária de ordenação**: `branchEpoch` é a camada mais externa; rewind/fork trocam de epoch e não se misturam com productTurnOrdinal (F7).

---

## Veredito sobre o modelo mental: qual camada é a de menor autoridade e a que mais provavelmente continuará engolindo mensagens

**A de menor autoridade é a camada de «normalização semântica + atribuição de identidade de entidade»**, e não o constraint graph:

- **Ela tem hoje duas implementações** (payload de evento live vs projection policy do cold), e o caminho frio está incompleto (F1: goal/model perdidos por inteiro, session_entry não lida), então os mesmos fatos persistidos passam por dois caminhos e resultam em entidades tipadas diferentes — por mais\refinado que seja o ledger/graph/resolver a jusante, a semântica que entra já divergiu.
- **A cobertura de âncoras de persistência de que ela depende é baixíssima**: `semantics` 569/26.942, `anchor` 432/26.942, timeline de goal_verification com apenas 10 registros. A normalização quer determinar stablemente visible/modelOnly e quer achar um anchor para cada fronteira, mas os campos subjacentes ainda não existem.
- **A identidade de entidade não está fixada** (F3), o que impede o keying dos invariants de conservação e torna o determinismo do resolver impossível de discutir.

O constraint graph, ao contrário, é a camada que menos deveria ser mexida primeiro (F6): o esqueleto da ordenação é quase totalmente ordenado, e oa verdadeira dificuldade está **a montante, em normalizar cada fato numa entidade tipada com identidade estável, anchor e visibility**. A ordem de implementação deve ser: primeiro tornar o normalizer o único ponto de entrada + completar a síntese inversa de session_entry/goal/model + fixar o entityId + incluir as escritas dos 4 campos semânticos; **só então** tratar o placement do resolver.

---

## Itens a acrescentar em E2E / coverage matrix (atinge Q9)

Situação atual: A09/E06/E08/F07/H08 ausentes, E10 falhando, G01–G04 parciais. O item específico do resolver ainda precisa de novos casos (primeiro os goldens L1/L2, depois escolher L4 representativos):

**Goldens L1/L2 (reducer/materializer, em `LC`/novas abreviações):**
- **QD-node**: queue drain em duas rodadas → golden de divisão de productTurn: A1 pertence a T1, A2 pertence a T2 e ambos visíveis; afirmar que **a estrutura de productTurn de live≡cold é consistente** (F2/F10).
- **GV-identity**: retry do verificador com o mesmo targetId e mesma iteração (dois verificationId) → fronteira única (F4); reset de iteração entre targets não colide.
- **GV-late-anchor**: `TargetCompletionVerification` chegando atrasado, depois do start da próxima rodada → volta ao tail do turno original pelo anchor (Caso C; hoje `P03` só cobre «marker chegando antes do assistant final»).
- **MC-cold**: transcript com model_change, após recuperação fria o marker ainda está lá (F1/F8).
- **GV-cold / session_entry**: com goal verify presente em session_entry, a recuperação fria consegue reconstruir (F1/F9).
- **extensão da conservação de coverage**: o footprint de `eventsCoverTranscript` ganha goalVerifyCount / modelChangeCount e passa a ser **equivalência sensível à ordem** (F1, `807-941`).

**L4 representativos:**
- **BG-wake-turn**: background completion → o wake model-only cria um productTurn independente, A2 pertence a ele e não há bolha de user (hoje `BG05` só verifica «sem bolha de notification»).
- **multi-segment**: uma rodada com A1.1 + tool + A1.2 → um ProductTurn com dois AssistantSegment preservados, e fork/retry penduram apenas no último segmento (hoje `E10` falhando, `FM` cobre fork, mas falta asserção de nó).
- **modelChange stateOnly**: se o produto reduzir modelChange a stateOnly, afirmar que ela não entra em rows.window nem afeta turn count / rolagem virtual (F8).
- **fork/null-sequence**: fork child com sequence NULL ou com caminho de re-save, recuperação fria com ordem estável e sem derivação para o fim da fila (F5).
- **resync-scope**: comportamento do resync com escopo quando a âncora cai no meio da janela já enviada ou fora dela (F6).

---

## Anexo: âncoras de código/documento lidas na revisão

| Camada | Caminho |
| --- | --- |
| Documento de design | `docs/v4-refactor/15-timeline-resolver-design.md` |
| Reducer de projeção | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` |
| Síntese inversa de recuperação fria | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` |
| Repositório de message/part | `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/messages.ts` |
| Migração 0014 | `apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts` |
| Runtime de drain/turn | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`、`turn-loop.ts`、`turn.ts` |
| Cópia de fork | `apps/zcode-cli/packages/core/src/runtime/methods/workspace-checkpoints.ts`、`session-fork.ts`、`message-persistence.ts` |
| Contrato de armazenamento | `docs/chat/conversation-transcript-storage.md` |
| Case catalog | `docs/conversation-session-case-catalog.md` |
| Coverage matrix | `docs/testing/conversation-session-e2e-coverage-matrix.md` |