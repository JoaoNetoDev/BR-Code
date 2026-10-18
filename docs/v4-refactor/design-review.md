# Review do Design da Refatoração V4: Verificação Cruzada Contra o Código Existente e os Bugfixes Históricos

- Status: **registro de auditoria pré-migração de 2026-07-04**. As referências a "código existente", caminhos, contagens de linhas e itens pendentes de decisão abaixo descrevem a linha de base antes do hard cut da V4; a implementação atual segue as especificações e o código navegados pelo [README.md](./README.md) deste diretório.
- Data: 2026-07-04
- Entradas: todos os 10 documentos de docs/v4-refactor/ + o texto integral de conversation-product-protocol.md
- Método: primeiro uma revisão puramente de design; depois uma varredura completa de leitura de cinco domínios de código (camada de montagem do renderer / eventos de stream e sincronização de snapshot / store e entrada web / transporte e controle remoto / lado da fonte de verdade da CLI, cerca de 20 mil linhas no total), agrupando os bugfixes/workarounds históricos dos comentários em **60 classes de casos**, e julgando, classe a classe, o novo design em "elimina estruturalmente / precisa de regra fixada / não coberto pelo design / voltará de salto com outra roupa". Todos os casos anexam a localização no código e o texto original do comentário (ver apêndice).

## 1. Resumo das Conclusões

**A direção é fortemente endossada pelo código.** Das 60 classes de casos, cerca de 40 são eliminadas estruturalmente pelo novo design; e o código antigo já gerou espontaneamente meio V4 por conta própria — os fluxos owner/observer foram obrigados a voltar a se fundir em um único fluxo com seq (taskRealtimeBus.ts:685), a camada bridge foi forçada pela realidade a ter três campos manuais de "geração" (bridgeSessionId/bridgeGeneration/recoveryId), e a fronteira de protocolo da CLI foi obrigada a fazer batching determinístico para que o replay fosse reproduzível (server-operations.ts:3277). Todas essas são evidências de que "a realidade está consertando remendos na direção do design".

**Três itens de trabalho principais:**

1. **Fundação distorcida (o mais importante)**: a tabela de fundações do README, "camada de confiabilidade rpc madura: ACK, heartbeat, replay em caso de desconexão", não se sustenta. `PersistentProtocol` é código de biblioteca portado junto com a arquitetura do VS Code, com **zero implantações em produção em todo o repositório** (o caminho real usa o `SocketProtocol` / `MessagePortProtocol`, sem ACK/replay), e ainda por cima faltam deduplicação no lado receptor, reattach de reconexão no servidor, e nunca se envia ACK ativamente. A natureza da Phase 2 é "produzir pela primeira vez uma camada confiável não verificada", não "aplicar dois pequenos remendos". → §2, R-02. Há outra distorção de mesmo nível: **o log de eventos hoje é puramente em memória, sem persistência em disco** (M8); "o CLI reconstrói por replay dos eventos no SQLite ao reiniciar" não se sustenta, e é preciso tomar uma decisão sobre a forma persistente conforme §9.2.
2. **Lacunas de schema**: sessionConfig (valores atuais de provider/model/thought/followupMode), usage/contextWindow, backgroundWorks[], plan/todo, timestamps e tempo de trabalho — um conjunto de estado exigido pela UI não tem destino em 09 — e as duas varreduras encontraram a mesma lacuna de forma independente; os patches existentes correspondentes seriam carregados como estão para a nova arquitetura. → §4
3. **Lista de regras de protocolo a fixar**: geração de assinatura (epoch), tratamento em três ramos de quadros duplicados, determinismo de seq/rowId/revision, atomicidade de snapshot etc., cerca de 18 itens; sem fixá-los, as classes de bugs que esta iteração pretende eliminar voltarão de salto com outra roupa. → §3

**Posição final sobre persistência (§9, convergida após decisão do autor):** no lado do CLI, o SQLite fica com **zero tabelas novas, zero migrações**. A fila de queries do usuário não é persistida; por consequência, o inbox de command/continuation também é um balcão de recebimento em memória, e a idempotência na janela de crash fica a cargo de "o efeito carrega seu próprio `sourceCommandId`"; a única alteração de armazenamento é o campo de âncora JSON aditivo de message/part. A filosofia da camada persistente em uma frase: **o único estado imperdível = transcript + âncoras; todo o resto (log de eventos, projeções, filas, inbox) é estado suave reconstruível** — perfeitamente alinhada ao princípio de recuperação por autossimilaridade do 01.

**Registro de decisões:**

| Estado | Item |
| --- | --- |
| Decidido | a queue (fila de queries do usuário) não é persistida → as duas tabelas de inbox não são criadas, a coluna `queue_auto_drain` não é necessária, C-03 é dissolvido (o CLI nunca faz replay ao reiniciar; comandos em trânsito são reconciliados pelo cliente via `commands/query` e cabe ao usuário decidir o reenvio); as formulações de "Inbox em disco" em 03 e "replay de eventos do SQLite" em 01/02/04 precisam ser reescritas conforme §9.3/M8 |
| Decidido (2026-07-05) | ① Forma persistente do log de eventos = **Opção B** (log em memória limitado + logEpoch, zero tabelas); ② prevenção de duplicidade na janela de crash de fork/createSession = **child session registra `source_command_id`**; ③ C-01 permissão de ação em múltiplos clientes = **paridade total** (fechamento idempotente); ④ C-04 = **manter o draft** (derruba 10-P2, `createSession.firstInput` passa a opcional, o draft permanece só em memória); ⑤ 10-P3 rewind = **remover o comando independente** (entrada de UI de editUserQuery); ⑥ caminho de execução = **hard cut** (abandona o período de escrita dupla, ver 08/11) |
| Pendente de decisão | os demais pontos de confirmação de §5 (C-02 pending TTL, C-06 escopo de contenção de danos da Phase 2, C-07 lista de mudanças de comportamento, C-08 library-ização de stream-animate); G-12 fault catalog; G-13 superfície de autenticação; os quatro limites PB-* |

**Ordem de ação sugerida:** **antes de começar a Phase 0** — reescrever os documentos de design conforme §2.2 (M1–M8) e §7; concluir a fixação das 18 regras de §3 e o capítulo de schema ausente de §4; decidir §9.2 e a prevenção de duplicidade no fork. **Durante a implementação** — transformar agolden test/aparato de caos em aceitação de primeira classe (a primeira produção da camada rpc precisa desse护航).

## 2. Resultado da Verificação do Diagnóstico Atual

### 2.1 Confirmado (amostragem com acertos)

Os quatro pontos de ancoragem do renderer batem com a descrição (zcodeChatMessages.ts:549/:904/:1457/:2431); todos os números de escala estão corretos (3089 / 1056 / 2141 / 5871 linhas); `afterSeq`+`includeSnapshot` (zcode-protocol:2109), `expectedRevision` (:2270), `reduce()` (event-reducer.ts:517), `buildTraceTree` (model.ts:241), channelClient.ts:173 sem batching, dupla codificação base64 (webRemoteControlManager.ts:781), `Pause=7` é de fato um espaço reservado não implementado (`ReplayRequest=6`/`Resume=8` também só existem no enum), a dependência `@tanstack/react-virtual` e implementações de referência como GitPane, o fallback `content-visibility` (ChatConversationContent.tsx:9), o código do protocolo antigo já foi removido.

### 2.2 Distorcido / precisa de reescrita (ordenado por impacto)

| # | Texto original do design | Realidade | Impacto |
| --- | --- | --- | --- |
| M1 | Tabela de fundações do README "camada de confiabilidade rpc madura"; 05 "o socket do desktop usa PersistentProtocol" | PersistentProtocol com zero implantação em produção; sem deduplicação no receptor (protocol.ts:411 não tem ramo de descarte `id <= incomingAckId`, então mensagens duplicadas de replay sobem como estão); sem handshake no servidor para "reatar um novo socket à instância de protocolo antiga"; ACK só é aproveitado pelo KeepAlive de 5s; na prática a morte detectada leva 20–40s (timer de 20s consultando timeout de 20s). O estado atual é "0,5 camada de confiabilidade" (apenas o conjunto relayProtocol), não "duas e meia camadas pela metade" | Reestimar esforço e risco da Phase 2, ver R-02 |
| M2 | README causa-raiz 2 "cada delta é um quadro EventFire independente", "o batching atual só economiza renderização" | A fronteira de protocolo do CLI já tem batching com orçamento de bytes determinístico (server-operations.ts:447, :3277 "não se pode usar live setTimeout, senão o replay não reproduz as fronteiras"); o batching do cliente ainda carrega a responsabilidade de "forçar flush antes da chegada de um evento de controle para preservar a ordem" (useTaskStreamEvents.ts:471) | Trocar a formulação da causa-raiz por "granularidade de batching pequena, cada evento de protocolo ainda vira um quadro independente, relay faz base64 duas vezes"; a linha de base de orçamento de frequência do 05 deve vir da contagem real de quadros; e é preciso decidir o destino do batching do CLI (R-14) |
| M3 | 03 "queue é puramente em memória (agent-runtime.ts:159 `pendingInputSequence`)" | `pendingInputSequence` é apenas um contador de id; o que realmente é volátil são **dois pontos**: a fila steer do lado do CLI `activeTurn.pendingInputs` (puramente em memória) + a deferred queue do lado da UI (memória do renderer, perdida no refresh) | O autor já decidiu que a queue não é persistida (§9.3): a forma da correção = unificar a posse das duas filas na memória do CLI; a atribuição na seção "Inbox em disco" do 03 e a formulação sobre `pendingInputSequence` devem ser reescritas conforme §9.3; descartar a queue local da UI continua válido |
| M4 | Tabela de fundações do README "o protocolo já é um fluxo de eventos incrementais monótono por seq" | O esqueleto existe, mas o seq do protocolo é uma **numeração preguiçosa em memória** por `(session record, deliveryKind)` (server-operations.ts:201-255, :634): após reiniciar o afterSeq não faz sentido, cada deliveryKind tem seu próprio espaço de seq, e cada assinatura reexamina toda a história | A V4 precisa elevar seq a atributo de log persistente; isso é trabalho novo, não fundação pronta (R-04) |
| M5 | 02 "todos os fatos da CLI correspondentes a cada dimensão do ProductContext já existem" | Exceção na dimensão queue: o fato da deferred queue hoje está do lado da UI | A incorporação da queue no CLI é pré-requisito do 02; deixar explícito no sequenciamento por fases |
| M6 | 05 "cinco ou seis entradas de reconexão"; 01 "três enlaces web" | Há cerca de 10 entradas de reconexão na prática; o web é na verdade 3+1 formas (incluindo o modo home-only stub, com cerca de 20 serviços stub manuais) | O diagnóstico está certo, a escala subestimada; depois que o modo stub desaparecer é preciso definir a forma de degradação de UI quando o host está inacessível (G-11) |
| M7 | 08 "o protocolo antigo deixou cerca de 200 artefatos dist" | Medido: 324 | Sem impacto substancial |
| M8 | Fundação do README "reduce(events) reconstrói a projeção, recuperação a quente e a frio consistentes"; 02 "ao retomar a sessão, reconstrói a partir dos eventos persistidos, sem um segundo caminho de recuperação"; 01 "CLI reinicia → reconstrói a projeção por replay dos eventos do SQLite" | **O log de eventos não é persistido em disco**: a única implementação de `SessionEventStorePort` em todo o repositório é `InMemorySessionEventStore` (adapters/storage/index.ts:21), e é justamente ela a montagem de produção (create-app.ts:340 `options.eventStore ?? createInMemorySessionEventStore()`); após reiniciar, `eventStore.getEvents()` fica vazio, e a recuperação a frio real depende do transcript (resume.ts:144, com log vazio segue pelo caminho de messages) | A semântica de `subscribe(afterSeq)` da V4 atravessando reinício do CLI exige uma decisão sobre a forma persistente, ver §9.2; as formulações de 01/02/04 precisam ser reescritas |

## 3. Regras de Design que Precisam Ser Fixadas (Classe R: sem fixar, surgem bugs)

**R-01 Geração de assinatura + três ramos para quadros duplicados + disciplina de ressubscrição.** (primeira rodada A1, quatro varreduras confirmam de forma independente)
TopicFrame não tem nenhum campo que diferencie quadros de assinaturas novas das antigas; o apply da §4 de 09 tem apenas dois ramos, e cada quadro antigo atrasado dispara uma ressubscrição → tempestade. A arquitetura antiga já foi forçada pela realidade a ter geração manual: `bridgeSessionId` + `bridgeGeneration` + `recoveryId` (manager:888 descarta quadros entre gerações por generation), single-flight por requisição (transport:839 "várias requisições colidindo na mesma janela suspect devem compartilhar uma única recuperação"), bug residual de cursor de runId no mirror (taskStreamEventHandlers.ts:705 "o seq=1 de um novo run é descartado como mensagem antiga e o celular perde a requisição de permissão"). Fixar quatro itens:
1. a resposta do subscribe aloca um epoch, os quadros carregam o epoch e o cliente descarta quadros de epoch antigo;
2. apply em três ramos: quadros atrasados/duplicados com `toSeq <= store.seq` são **descartados silenciosamente**; só `fromSeq === store.seq` faz apply; só `fromSeq > store.seq` faz ressubscrição;
3. ressubscrição single-flight (não repetir enquanto em andamento);
4. no servidor, ressubscrição do mesmo (client, topic) = substituir a assinatura antiga e limpar seu flush buffer.

**R-02 Lista de correlações da camada rpc (correspondente a M1).** O trabalho de rpc da Phase 2 tem pelo menos cinco itens: deduplicação por msgId no receptor; registro de sessões de protocolo no servidor + handshake de token de reconexão (caso contrário replaceSocket tem só metade do lado do cliente); cadência explícita de envio de ACK; granularidade da detecção de morte corrigida; além do sinal de congestionamento e do buffer de replay com limite, já listados no design. A primeira produção precisa vir acompanhada de uma regressão de caos E-01, e "deduplicação do lado par" não é uma capacidade que se possa assumir existente antes da implementação.

**R-03 O snapshot deve ser gerado atomicamente a partir da projeção em memória.** (P2-2, o maior ponto de disent-upo desta varredura)
Hoje o snapshot é gerado a partir do estado persistido e não acompanha o fluxo em memória: zcodeSessionEventOrder.ts:93 "o eventSeq de um snapshot em execução só pode indicar que o estado de controle chegou até aqui, não que o corpo do streaming já foi escrito no snapshot"; o cliente cresceu em cima disso com polling de [0,50,100,200]ms para alcançar, compensação de snapshot pela metade e um patch de recuperação para cada um dos sete campos ephemeral (o arquivo todo taskSnapshotRuntimeStateSync.ts). O "snapshot = projeção completa no instante W" da V4 precisa ser implementado como **extração atômica do estado do reducer em memória** (incluindo o texto pela metade das rows até W e todos os campos da área A), e `snapshot(W) + replay(W, now] ≡ replay completo` deve ser o primeiro caso do golden test da Phase 1 — senão os cenários de walkthrough da §7 do 09 não se sustentam, e a "substituição integral" amplifica o bug atual de "engolir o primeiro trecho do corpo" para "engolir qualquer trecho".

**R-04 Determinismo dos três identificadores seq / rowId / revision.** (primeira rodada A5, a varredura do CLI confirma fortemente)
- seq: elevado a atributo do log de eventos persistente, estável entre reinícios, independente de deliveryKind (as diferenças de perfil são registradas por faixa, não por renumeração); o replay ganha o índice `getEventsAfter` (hoje é O(história inteira) reexaminando tudo).
- rowId: precisa ser uma função pura determinista do event log (inalterada após reconstrução por replay), incluindo as fallback rows do 07 — senão "id em tempo real diferente do id na recuperação" (zcodeChatMessages.ts:2793) volta de salto como rowId, e todo o targetRowId/pRanges já persistidos no cliente ficam sem valor.
- revision: derivado pelo reducer a partir dos eventos (sugestão: revision = eventSeq, ou uma tabela de progressão explícita), abolindo os mais de 15 incrementos manuais de `stateRevision++` existentes hoje (server-operations.ts:1207 etc.); o problema de revision puramente em memória zerar no reinício também desaparece.

**R-05 Proibir bypass de eventos live-only.** (P5-2)
Hoje o espelho de subagent é um fluxo bypass com `sequenceNumber=0` que não entra no event log pai, e o seq só pode ser inventado temporariamente. Fixar: todo fato que produz row/delta precisa entrar primeiro no event log. Caso contrário o `summaryText` de subagent row do 09 e a contabilidade de `(fromSeq,toSeq]` não passam de conversa vazia.

**R-06 `rows/range` muda para paginação por cursor rowId + regra de merge.** (primeira rodada A2)
O índice é reutilizado após truncamento de sufixo + novo append, e mesclar por índice com um fluxo de assinatura atrasado produz duplicatas/desalinhamentos instantâneos. Mudar para `beforeRowId + count`; o merge do cliente usa rowId como chave de ordenação; um patch que acerta um rowId não carregado = no-op; a relação entre `atSeq` e `store.seq` precisa ser escrita (rowId monótono + delta de truncate fechando em definitivo; pode-se não fazer gating por seq, mas é preciso escrever a argumentação).

**R-07 Completar as âncoras de fechamento do optimistic.** (primeira rodada A4, duas varreduras confirmam fortemente)
- `QueueItem` deve carregar `sourceCommandId`: durante execução o resultado autoritativo do sendText é a atualização da queue e não a row; hoje falta a âncora e isso gera uma deduplicação difusa numa janela de 15 segundos (taskStreamEventHandlers.ts:148, por heurística de "conteúdo + anexos + diferença de tempo ≤15s + prefixo de id");
- a row `timelineMarker` também carrega `sourceCommandId`: comandos como compact, que não produzem userInput row, hoje são reconciliados por uma **tolerância de relógio de 1 segundo** (zcodeChatMessages.ts:2740);
- o `text` da userInput row autoritativa deve ser o texto original do usuário: hoje o corpo espelhado de /goal devolve o objetivo já gravado no banco, o que apaga o `/goal` do balão (handlers:165);
- o estado otimista de cinza/aguardando confirmação de `resolveInteraction` entra na disciplina de overlay do 03: a idempotência garante apenas correção; com RTT de segundos, sem feedback otimista o usuário clica repetidamente.

**R-08 Separar connectionId de clientId.** (primeira rodada A3)
O clientId hoje é persistido em localStorage (main.tsx:851, com fallback para fingerprint de private mode do iOS), e duas abas com o mesmo clientId abrem duas conexões. O roteamento de conexão usa um connectionId por conexão; a idempotência e a atribuição usam clientId.

**R-09 Completar o enum de ACK com `noop` (ou `rejected+code=alreadyResolved` com o resultado já existente).** (primeira rodada A6)
Quem chega atrasado em "ambas as pontas dão stop" e "ambas as pontas respondem à permissão" tem **commandId diferente** e, por definição, não é `duplicate`; a tabela de conflitos do 03 e o "quem chega atrasado recebe duplicate" da §5 do 09 precisam reescrever o mapeamento.

**R-10 Unificar a estratégia de truncamento do estado terminal do tool output em todas as faixas.** (primeira rodada A7)
O golden test de convergência do 05 exige "consistência byte a byte no estado terminal", mas o 05 e a §14 do 09 dão duas faixas de estado terminal — continuous 256KB e replayable head+tail 32KB; testado ao pé da letra, isso fica vermelho. Fixar: na conclusão, o truncamento de `row.upserted` é o mesmo em todas as faixas, e `outputStreamCapBytes` age apenas sobre os deltas durante o streaming.

**R-11 Prioridade apenas entre topics; dentro de um topic, serialização estrita por seq.** (primeira rodada A8)
Se "mensagem de controle > sessionControl > rows" do 01 for lido como Quadros da área A able to passar os quadros de rows dentro do mesmo topic de conversation, a continuidade das faixas se fragmenta. Se sessionControl significa o topic sessions-index, renomear para eliminar a ambiguidade.

**R-12 Limite de bytes por quadro e regra de divisão ao exceder.** (P4-5)
Existe histórico de "um único batch de mirror grande demais → várias cópias em RPC/base64/JSON → heap do host saturado" (taskRealtimeBus.ts:497, e depois :622 foi forçado a fazer fatiamento de ops de texto grandes). O envelope de quadros da §1 do 09 precisa declarar max frame bytes e a semântica de divisão, senão o mesmo tipo de OOM reaparece na nova camada de canal.

**R-13 A saúde da conexão é estado local de UI do cliente, proibido misturar em sessionControl.** (P4-8)
Hoje o estado de conexão / estado de pareamento / estado de sessão se misturam em uma única máquina de estados se poluindo ("o relay ocasionalmente reporta o heartbeat ACK de uma sessão já pareada como waiting → os dois lados se contradizem", transport:365). A exibição de reconnecting/degraded é local do cliente; fatos de sessão vêm apenas da projeção.

**R-14 Decidir o destino da camada de batching stdio da CLI.** (P5-11, correspondente a M2)
O 05 especifica que o único ponto de merge é a camada de canal do host①, mas a porta stdio CLI→host já tem uma camada de batching determinístico. Escolher um dos dois e escrever no 05: remover (ponto de merge estritamente único) ou manter (declarada como camada de redução de ruído stdio transparente para a contabilidade por faixas). Aproveitar para escrever no 05 o benefício positivo: a contabilidade por faixas elimina de vez a restrição de "os limites de quadro precisam ser reproduzíveis", e a janela de batching passa a poder usar relógio de parede (hoje o orçamento de bytes determinístico é forçado justamente porque não há contabilidade por faixas).

**R-15 Migrar três grupos de semântica para a lista de responsabilidades do reducer da CLI + golden tests.** (P1-5/P1-8/P5-3/P5-7)
Essas regras **apenas mudam de endereço, não desaparecem**, e são as que mais Easily se perdem na migração:
1. fechamento de estado terminal atrasado (chegada de task_complete/conclusão de ferramenta/estado terminal do verifier após stop; o conjunto inteiro de `lateTerminalEventsAfterStopDoNotRevive`);
2. reordenação de saídas do provider (helpers:228: o provider às vezes entrega tool_use antes e só depois completa o fim da frase do mesmo turno, e a UI mostra "gula / Toolcall / jogo da cobra"; helpers:431 pacotes thought/tool atrasados);
3. guard de entrada e projeção com a mesma origem e a mesma transação (hoje o fato busy está espalhado em dois níveis e quatro lugares + o contrato implícito de "liberar o lock antes de transmitir", server-operations.ts:1909).
Além disso: a deduplicação do conteúdo de replay do provider após compact (hoje renderUnits:389 faz na UI um conjunto de diferença de toolId + recorte de texto com startsWith) também precisa ser convergida pelo reducer, e rows não podem exibir atividade duplicada.

**R-16 O componente de workspace da sessionKey precisa ser uma chave workspaceIdentity, não um path cru.** (P3-7)
Existe precedente explícito: "janelas SSH/WSL/Docker diferentes do mesmo caminho leem a task config, a fila e o estado de erro um do outro" (zcodeSessionStoreSelectors.ts:203/:241). O `sessionKey = workspace + sessionId` do 06 e o `Map<workspaceKey, Connection>` da segunda fase de split de tela são ambos controlados por chave de identidade.

**R-17 A semântica de staging do marker de troca de modelo é definida pela CLI.** (P3-5)
A semântica de produto é "depois de trocar de modelo, o marker fica pendente até o próximo turno começar, e só então vai para a timeline", mas hoje é uma lista de bypass na UI + um patch de montagem por turnIndex. Escrever na definição de marker da §3 do 09 como implementado pela CLI, senão a implementação revive o branch na UI.

**R-18 Transformar a âncora de rolagem em rowId + repopular o conteúdo após a substituição do snapshot (promovido de sugestão a obrigatório).** (primeira rodada C2)
Hoje a memória de rolagem guarda `scrollTop` em pixels (chatSessionScrollMemory.ts), o que necessariamente falha sob scroll virtual + altura de linha dinâmica. O cliente guarda o rowId da âncora; depois da substituição integral do snapshot, repopula a faixa visível com `rows/range` a partir da âncora; se a âncora não existir, cola no tail. Escrever em 04/06.

## 4. Lacunas Não Cobertas pelo Design (Classe G: precisam de capítulo/campos adicionais)

**G-01 A área A não tem uma seção de sessionConfig (a prioridade mais alta entre as novas descobertas desta rodada, convergem duas varreduras independentes).**
O **valor atual** de provider/model/thought/followupMode é estado que a UI precisa exibir, e os comandos `switchModelConfig`/`setFollowupMode` existem, mas o snapshot do 09 não cobre isso. O tamanho do conjunto de patches que isso exige hoje é surpreendente: o workspaceSlice é quase um arquivo inteiro de correções de corrida de múltiplas origens de config (:61 thought momentaneamente vazio, :720 requestId impedindo que um retorno antigo sobrescreva a nova escolha, :1105 cadeia de exceções em que o estado de execução ignora config update), o guard de casamento de eco a partir de taskStreamEventHandlers.ts:1413, e mais de 15 stale guards de modelo em useTaskRestore.ts. Sem uma seção de config (substituída integralmente em ordem de revision), essas corridas se repetem intactas na nova UI.

**G-02 Semântica de restauração de snapshot de usage / contextWindow / tokenUsage.**
Patches atuais: "usage_update chegando repetidamente → React acorda sem sentido e perde quadros" (taskSlice:537), "a atualização da janela não pode recriar o objeto usage, senão sobrescreve o used positivo com 0" (:586), a contabilidade duplicada entre pontas depende de uma tabela circular de 128 eventKeys (Types:180). A §13 do 09 diz apenas "manter como está" para usage/*, mas as evidências indicam que também precisa ser topicizado (conflated do estado mais recente) ou entrar na área A.

**G-03 backgroundWorks[] e cancelBackgroundWork.**
O snapshot tem apenas o booleano `hasBackgroundWork`; a gaveta de fundo precisa do estado de cada item e de uma entrada de cancelamento (hoje inferido a partir de tool startedAt do chat, o que já gerou falsos报警; depois passou a ser reportado explicitamente pelo runtime, handlers:1645). product-protocol tem `backgroundWorks[]`; o 09 precisa dar o destino e o comando.

**G-04 Destino de projeção de plan/todo, resumo goalStats/goalVerifications e aviso de apiRetry.**
taskSnapshotRuntimeStateSync.ts escreveu um patch de recuperação para cada uma dessas sete classes de campos de bypass (plan "antes só ficava na memória do componente ChatView, e sair da tela o perdia" handlers:1200; apiRetry sem restauração deixa o usuário "esperando à toa"). Se não entrarem na projeção (área A ou topic separado), os patches de recuperação serão reescritos em outro lugar.

**G-05 Timestamps, tempo de trabalho autoritativo, metadados por turno, resumo de arquivos por turno.** (primeira rodada B2, três evidências convergem)
O schema 09 não tem timestamp de wall-clock; a semântica de "já trabalhou N segundos" está hoje toda calculada no cliente e cheia de patches: o tempo de espera por permissão é contado por engano (zcodeChatMessages.ts:636), o tempo precisa ser congelado antes de entrar no verifier (:1020), a duração com escolha entre três fontes não permite regredir e ficar menor (:1962). Além disso, perTurnSummaries/perTurnFileChanges (resumo de alterações de arquivo por turno) hoje é publicado em quadros separados, o que provoca saltos grandes de altura (taskSlice:1535). É preciso: RowBase.createdAt (relógio do servidor), intervalo de tempo de trabalho autoritativo emitido pela CLI (deixando explícito quais esperas não entram), turnsMeta ou uma marker row de cabeçalho de turno (contendo a atribuição ao grupo colapsado — o bloco "já trabalhou" do auto compact se anexa ao assistant anterior, e a adjacência de turnId do 09 não consegue expressar isso), e resumo por turno aplicado atomicamente no mesmo quadro das rows.

**G-06 mailbox / mensagens do tipo session-message não têm destino em rows.** (P1-8)
Hoje isso depende de parsear atributos XML com regex + farejar prefixos de texto (o ACK de agent de fundo depende da compatibilidade por **string de texto de três gerações**, zcodeChatMessages.ts:219-252). O enum userInput.origin do 09 não tem lugar para mailbox, então na migração será forçado continuar farejando texto.

**G-07 Lacunas no conjunto completo de comandos.** (primeira rodada B1, ampliado)
`retry` (RowActions.canRetry tem o campo mas não o comando), `resumeGoal` (stopPausesActiveGoalTarget exige resume explícito), a forma de recuperação/drenagem da autoDrain e da held queue, a relação entre rewind-to-checkpoint e editUserQuery, o canal de upload de anexos (como os bytes de um AttachmentRef sobem em web/controle remoto), o domínio de atribuição de exclusão/renomeação de sessão + **limpeza em cascata da exclusão** (hoje: excluir não limpa sincronamente o balde localStorage de rascunho do composer, e ele fica residual, taskSlice:1924; excluir a task que está sendo visualizada deixa o activeTaskId pendurado, :2001 — a V4 precisa definir que o pane volta ao estado vazio quando outro lado exclui, mais o GC do estado local por sessionKey).

**G-08 Classificação de falhas terminais e "quando desistir de reconectar".** (P3-8)
Vários caminhos de recuperação hoje declaram各自 um estado terminal, causando "duas páginas de erro contraditórias" (main.tsx:1316). O backoff com teto de 30s da §12 do 09, ao pé da letra, é retry infinito; é preciso classificar invalidação de auth / expulsão / acima do limiar, com a apresentação de UI e a condição de desistência correspondentes.

**G-09 Viabilidade da reformulação do relay hub (pré-confirmação).**
O 01 exige que "relay permaneça como tubo mudo", mas o relay externo atual é um **protocolo com estado**: register/auth_challenge/pair/KICKED, comportamento da camada de borda fragmentado por query.mid (transport:205), e o recolhimento por ociosidade precisa de desvio de tráfego (:377). Se o relay for um serviço externo imutável, o "remover pair_status, PersistentProtocol ponta a ponta" do 05 precisa de um design de transição que coexista com o relay atual; e o ciclo de vida do pareamento também precisa ficar explícito.

**G-10 Semântica de processo para crash de host/owner.**
O 01 reduz owner a "qual processo iniciou o CLI", mas não escreve: quando o host crasha, o subprocesso do CLI morre junto; quem é responsável por reiniciá-lo; como um turno em execução é fechado (hoje existe um fluxo de broadcast de invalidação `stream_mirror_owner_lost`, taskRealtimeBus.ts:195). Além disso, `session/send` hoje é "ACK imediatamente ao receber a entrada, persistUserPrompt em segundo plano dentro do turno" (server-operations.ts:1662) — conforme a decisão da §9.3: `accepted` não promete sobrevivência entre processos, o cliente encerra seu pending pela row autoritativa (sourceCommandId), e a janela de crash é coberta por `commands/query = unknown` → o usuário decide o reenvio.

**G-11 Forma de degradação de UI quando o host está inacessível.** O modo home-only stub (cerca de 20 serviços stub manuais, main.tsx:923) foi removido; é preciso definir o que um workspace remoto desconectado passa a apresentar no novo cliente.

**G-12 fault catalog.** Os **enums de nível de protocolo** que o product-protocol deixa "definidos pelo fault catalog" em vários pontos (o conjunto de codes de `lastError`, o mapeamento de erros do provider para `phase=error`, a classificação de recuperabilidade) ainda não existem e são um pré-requisito rígido do reducer da Phase 1. Errata (2026-07-05): a matéria-prima não parte do zero — [`docs/testing/conversation-session-environment-fault-catalog.md`](../testing/conversation-session-environment-fault-catalog.md) já enumera falhas de ambiente como 429/503/queda de rede/disco cheio/processo encerrado e o design de verificação; o que falta é organizá-lo na tabela de enums de protocolo `fault.*` reasonCode / `SessionErrorInfo.code`; o mesmo documento também é a fonte da lista de injeção de falhas do aparato de caos E-01.

**G-13 Superfície de segurança.** Nos 10 documentos há apenas uma ocorrência da palavra "auth" no 01. Autenticação de conexão, confidencialidade do enlace relay (TLS no relay ou ponta a ponta), falsificação de clientId, e a granularidade de autorização para responder permissões remotamente (08 já lista como problema de produto). Mesmo que a conclusão seja "manter o status quo", isso precisa ser escrito.

**G-14 Graduação de timeouts.** A §11 do 09 usa 10s para query de forma uniforme; hoje já existe um contraexemplo "a primeira conexão Docker/SSH pode passar de 10 segundos" (main.tsx:1609). Operações de deploy de workspace precisam de uma faixa de timeout independente.

## 5. Pontos de Confirmação que Precisam de Decisão (Classe C)

| # | Questão | Posição sugerida |
| --- | --- | --- |
| C-01 | Permissão de ação em múltiplos clientes: qualquer cliente pode dar stop / responder à permissão? (já listado em 08) | Sim, com fechamento idempotente; combinado com a explicação de granularidade de autorização do G-13 |
| C-02 | A tabela de idempotência retém 7d, mas o pending no localStorage do cliente não tem TTL: um comando expirado será reenviado às cegas como mensagem fantasma | Dar TTL ao pending do cliente (por exemplo 24h); após o prazo, passar a decisão do usuário "não entregue, reenviar?" |
| C-03 | ~~semântica de replay de inbox no reinício~~ Dissolvido (decisão da §9.3: inbox em memória, nunca replay; comandos em trânsito são reconciliados pelo cliente e cabe ao usuário decidir o reenvio) | — |
| C-04 | Ambiguidade de "draft": phase=draft no servidor (createSession sem firstInput) vs pane null no cliente | Sugerir que createSession sempre leve firstInput e remover o valor de enum draft do servidor |
| C-05 | `base={revision, seq}` no 04 vs `base={seq}` no 09 | Unificar como {seq} (revision fica redundante depois de ligada ao seq por R-04) |
| C-06 | Escopo de contenção de danos da Phase 2 para a UI antiga: os eventos antigos não têm declaração das cinco peças; o benefício do batching se concretiza; somado a M1, qual é o trabalho real da Phase 2 | Declarar explicitamente que a Phase 2 só promete convergência em nível de quadro (entrada única de reconexão/detecção de morte/replay/binário), com batching indo para a Phase 3; ou declarar explicitamente o custo de escrever uma declaração coalesce única para os eventos antigos |
| C-07 | Falta a **lista de mudanças de comportamento** de atual→alvo: por exemplo, hoje fork-while-running é proibido de forma absoluta (server-operations.ts:2042) vs o alvo permite fork de histórico estável; steer convergindo para o roteamento de sendText | O 08 deve ganhar uma "tabela de mudanças semânticas", para evitar que durante o rollout gradual isso seja reportado como regressão |
| C-08 | O 06 referencia `packages/stream-animate` como destino do markdown em streaming, mas esse pacote tem forma de app de demonstração (App.tsx/main.tsx/server) | Confirmar que pode ser destilado em biblioteca, ou referenciar o caminho da implementação interna |

## 6. Performance e Experiência (Classe P)

- **P-01 O verdadeiro campo de batalha de perda de quadros: altura de linha dinâmica em row streaming + follow-bottom.** O 06 assumiu a análise incremental de markdown, mas `@tanstack/react-virtual` tem measure/remeasure + ancoragem de rolagem como ponto quente equivalente para "streaming row que cresce a cada 30ms". Sugere-se um spike antes da Phase 3, com aceitação adicionais de "o crescimento em streaming não dispara remeasure da coluna inteira e o follow-bottom não oscila".
- **P-02 Merge da tempestade de snapshots.** Quando vários clientes degradam ao mesmo tempo, a camada de canal pode permitir o merge de resync concorrente do mesmo topic (cache de estado suave do snapshot mais recente, TTL de segundos); unificar com a posição do 01 "o host não faz cache" conforme D-04.
- **P-03 Confirmação do compressão por segmento.** (corrigindo C4 da primeira rodada) o trecho desktop↔relay já negociou permessage-deflate (transport:210; o lado do navegador só consegue confirmar passivamente as extensions); é preciso confirmar que o trecho celular↔relay e cada trecho da nova cadeia da V4 também têm efeito, remedir o benefício após a binaryização e, ao reescrever, **não perder esta otimização existente**.
- **P-04 A posição do overlay segue o inputRouting.** Quando o cliente já sabe `inputRouting=enqueue`, desenhar a exibição otimista direto no painel da queue evita que a mensagem "pule" do fim da timeline para a queue no fechamento.
- **P-05 Conflation é mecanismo contra perda de quadros, não só economia de banda.** Hoje há um caso direto de "usage_update com o mesmo valor chegando repetidamente → React acorda sem sentido → perda de quadros" (taskSlice:537); ao落地 a conflation da área A, preservar a semântica de "não下发 quando o valor não mudou".

## 7. Lista de Revisões de Consistência de Documentos (Classe D)

- D-01 02 vs 09: operações de delta "três tipos/{rowId} de remoção de linha única" vs "cinco tipos/fromRowId com truncamento"; usar o 09 como autoridade para reescrever o 02.
- D-02 O `ConversationProductProjection` do product-protocol (turns/activeWorks/backgroundWorks/generatedAt/projectionVersion, envelope de command com clientMode) e o `ConversationSnapshot` do 09 precisam de uma tabela de mapeamento ou de reescrita com estreitamento; `stopTargetKind` está sem `turnSteer` dos dois lados; e o eventSeq/stateRevision/activeTurnKind/pendingRequestIds que o snapshot.runtime do protocolo atual já carrega (index.ts:1510) precisam entrar na lista de manter/remover do 09.
- D-03 A expressão de projeção do estado intermediário de turn-steer (submitting/queued) não está definida — hoje ele é um estado visível no painel de queue (máquina de estados turn_steer_queued/status, handlers:297), e o QueueItem precisa ser capaz de expressá-lo.
- D-04 01 "a camada de conexão proíbe cachear mensagens" vs product-protocol "o host pode fazer cache do latest projection": unificar em "a camada de canal pode manter cache de snapshot de estado suave, mas não pode manter estado que o downstream não tem".
- D-05 Lista de atribuição de tipos indefinidos referenciados pelo 09: QueueItem, GoalState, SessionErrorInfo, SessionActionAvailability, AttachmentRef, TimelineMarkerPayload, PermissionRequest/UserInputRequest.
- D-06 Revisar a tabela de fundações do README, a formulação da causa-raiz 2, a descrição de queue do 03, o status atual do PersistentProtocol e a seção "remover camadas de confiabilidade paralelas" do 05, a ordem de dependência de queue do 02, e a contagem de formas web do 01 conforme §2.2 M1–M7.

## 8. Construção de Apoio (Classe E)

- **E-01 Aparato determinístico de caos de rede promovido a aceitação de primeira classe** (por causa de M1 subir de "fortemente recomendado" para "obrigatório"): injeção em nível de quadro de atraso/perda/reordenação/duplicação/morte no meio (seed reproduzível), com asserção de invariantes — nenhuma row duplicada, todo overlay fecha, convergência de estado terminal, número de ressubscrições limitado, `snapshot(W)+replay ≡ full replay`. A aceitação da Phase 2 "controle remoto pelo celular funciona após desconexão/refresh" passa a ser sustentada por ele no lugar do critério humano.
- **E-02 Métricas de observabilidade do novo pipeline**: razão de compressão do coalesce, taxa de quadros de flush, nível de buffer/ocorrências de overflow por assinatura, contagem e motivos de resync de snapshot, distribuição de latência de ACK, contagem e classificação de reconexão (ligado ao RUM).
- **E-03 Lista de casos de golden test (derivada diretamente dos casos desta rodada)**:
  1. atomicidade de snapshot: em execução, tomar o snapshot em qualquer W + continuar o stream ≡ replay completo (R-03);
  2. estado terminal atrasado não revive: estados terminais de assistant/tool/verifier que chegam após stop (todos os cenários de P1-5/P5-7);
  3. reordenação de saídas do provider: tool_use antes do fim do texto, pacotes thought atrasados (casos helpers:228/431);
  4. convergência de perfil: as duas faixas de estado terminal idênticas para a mesma sequência de eventos (depende de R-10);
  5. eventos filtrados obrigatoriamente fechados por eventos não filtráveis (05 já lista; acrescentar o cenário de subagent summaryText);
  6. quadros duplicados/atrasados descartados silenciosamente, ressubscrição substitui a assinatura antiga (R-01);
  7. guard e projeção com a mesma origem: não existe nenhuma janela de "broadcast antes da liberação de estado" (P5-3);
  8. enumeração completa de formal-proof ↔ actionAvailability consistente (02 já lista, manter).

## 9. Impacto em Persistência e Estrutura de Tabelas (conferido contra o schema real: migrations 0001–0014)

Conclusão primeiro: após revisar conforme a decisão do autor da §9.3 (queue não persistida), **as mudanças estruturais de SQL convergem para zero migrações** — restam apenas os campos de âncora JSON aditivos de message/part. O princípio "JSON aditivo primeiro" do 07 é totalmente compatível com o schema atual (message/part = colunas de índice + `data` JSON blob; 0014 já tem a coluna `sequence` e três índices acompañantes). O grande item real não é DDL, mas uma decisão semântica que o 07 não cobre: **a forma persistente do log de eventos** (§9.2).

### 9.1 Base factual (DDL conferido)

- Tabelas existentes: `session` / `message` / `part` / `todo` / `session_entry` / `permission` / `input_history` / local_setting (0002) / série workflow (0007-0008) / série usage (0010).
- `message.sequence` / `part.sequence` + índices como `message(session_id, sequence, …)` já foram criados por 0014 — a base de ordenação estável para a reconstrução a frio de rows está de pé.
- `message.time_created` / `part.time_created` existem — o timestamp de wall-clock exigido pelo G-05 tem fonte na camada persistente; o que falta é entrar no schema de projeção.
- Artefatos de ferramentas já têm armazenamento em arquivo `NodeToolArtifactStore` (armazenamento em arquivos sob rootDir) — o `truncated.ref` da §6 do 09 + `toolOutput/get(ref, byteRange)` já tem destino concreto, sem nenhuma tabela SQL nova.
- A tabela `todo` já é persistente — a causa-raiz de plan/todo do G-04 é "guardado só na memória do componente / fora da projeção", não falta de tabela.

### 9.2 Ponto de decisão: a forma persistente do log de eventos (M8, a maior lacuna não coberta pelo 07)

Hoje o log de eventos é puramente em memória (ver M8), enquanto 01/04/README assumem que ele está no SQLite. Duas opções:

| | Opção A: log de eventos em disco | Opção B: log em memória limitado + logEpoch (recomendada) |
| --- | --- | --- |
| Como fazer | Nova tabela `session_event(session_id, seq, type, data, time_created)`, PK `(session_id, seq)`; escrita em transação em lote de milhares de deltas por turno; tarefa de recorte da janela de retenção | O log de eventos continua como buffer circular em memória (N entradas por sessão); escopo do seq = `(session, logEpoch)`, com logEpoch atualizado a cada início do processo do CLI; o base de `subscribe(base)` carrega logEpoch, e a divergência → snapshot direto |
| Retomada de afterSeq entre reinícios do CLI | Suportada | Não suportada — depois do reinício todos os clientes passam por um snapshot |
| Custo | Amplificação de escrita evidente (todos os deltas de streaming entram no SQLite); tarefa de recorte; indexação de `getEventsAfter` | Um snapshot a mais no reinício do CLI (que ia acontecer de qualquer forma: um turno em execução morre com o processo, e o cliente precisa realinhar); reescrita das formulações de 01/02/04 |
| Requisito sobre o transcript | As âncoras podem ser incompletas (o evento serve de fallback) | **As âncoras do transcript precisam ser completas**: a projeção precisa ser reconstruível de forma determinística apenas a partir do transcript; o golden test `reduce(transcript) ≡ reduce(events)` sobe de recomendação para aceitação de persistência |

Razão para recomendar B: o único ganho que A compra é "poupar um snapshot após o reinício do CLI" — um evento de baixa frequência + um snapshot que já é barato (uma tela no fim), e o pagamento é a amplificação de milhares de linhas por turno e uma nova superfície operacional de recorte; e B força a completude das âncoras do transcript, que já é um requisito rígido para exibição correta de sessões históricas. Note que o logEpoch de B e o epoch de assinatura de R-01 são dois níveis (geração de processo vs geração de assinatura): podem ser codificados em conjunto, mas a semântica precisa ser escrita separadamente.

### 9.3 Lista de mudanças em nível de tabela (revisada conforme a decisão do autor: queue não persistida)

> Registro de decisão (2026-07-04): a fila de queries do usuário (deferred sendText/sendGoalCommand) **não é persistida** — ela só vive na memória do CLI e é perdida quando o processo do CLI morre. As consequências em cascata são as seguintes; **a seção "Inbox em disco" do 03 e a lista de novas tabelas do 07 precisam ser reescritas conforme isso** (o texto atual do 03 atribui "a mensagem foi enviada mas não aparece" à não persistência da queue; a atribuição deve ser corrigida para "a posse da queue está na memória do renderer").

**Consequência: as duas tabelas de inbox também não são criadas, e as mudanças de persistência convergem para zero migrações.**

| Objeto | Mudança | Forma |
| --- | --- | --- |
| `message.data` (JSON) | + `turnId` (07 já lista), `origin` como enum unificado com a posição mailbox (07 já lista + G-06), **`sourceCommandId` (07 esqueceu, âncora de fechamento do R-07 + base da idempotência na janela de crash, precisa ser persistido)**, marcação de estado terminal (interrupted/failed, caso não seja derivável das parts), campos separados para o texto original do usuário e o resultado do parsing de comandos como `/goal` (R-07) | Sem migração, JSON aditivo |
| `part.data` (JSON) | + âncora de intervalo de tempo de trabalho autoritativo (início/fim excluindo a espera por permissão, G-05), metadados de truncamento de saída (`truncated: {totalBytes, ref}`, com ref apontando para o artifact store existente) | Sem migração, JSON aditivo |
| ~~`command_inbox`~~ | **Não criar tabela**. inbox = balcão de recebimento em memória do CLI (ponto de serialização + tabela de idempotência + cache de resultados + fonte de pendingCommands), com ciclo de vida do processo | — |
| ~~`continuation_inbox`~~ | **Não criar tabela**. O bash/subagent em segundo plano não sobrevive a reinícios do CLI; as notificações de resultado não entregues seguem a mesma régua da queue: perdidas com o processo (efeitos colaterais como alterações de arquivo já são persistidos). Se no futuro o trabalho em segundo plano precisar se recuperar entre reinícios, o tema volta à pauta | — |
| ~~`session.queue_auto_drain`~~ | Desnecessário. Com a queue em memória, os estados held/autoDrain ficam em memória junto | — |
| `session_event` | Só é necessária na Opção A da §9.2; na Opção B (recomendada) também fica em zero tabelas | Ver a decisão da §9.2 |
| Coluna independente `message.turn_id` | Manter "por enquanto não" (07 já lista como opcional) | Não por enquanto |
| `todo` / `usage` / `input_history` / índices 0014 | Sem alterações | — |

A semânticasatélite das decisões (precisa ser fixada junto, senão o que se perde é correção, e não apenas persistência):

1. **O本质 da correção de "a mensagem foi enviada mas não aparece" é a subida de posse, não a persistência**: a queue sai da memória do renderer para a memória do CLI + eco autoritativo (state.updated), e então todos os cenários de refresh/desconexão/múltiplas pontas ficam corretos; a persistência só afeta a janela de "o processo do CLI morreu" — e lá o turno em execução morre junto, a percepção do usuário já é de sessão interrompida, e a queue morrer com ela é uma semântica de produto coerente.
2. **A idempotência na janela de crash passa a ser responsabilidade de "o efeito carrega o commandId"**: a ordem de busca do `commands/query` = tabela de idempotência em memória → transcript por `sourceCommandId`. Comandos com efeito persistido (sendText startNow, editUserQuery, marker de compact) são anti-duplicação por natureza; comandos sem efeito (stop, resolveInteraction) são inofensivos ao reenvio. A única fresta é a criação duplicada em fork/createSession: **decidido (2026-07-05), o child session registra `source_command_id`** (uma coluna ou metadata, mudança aditiva sem migração).
3. **O ACK `accepted` não promete sobrevivência entre processos**: o fechamento final do pending do cliente depende da chegada dos dados autoritativos (a row / o `sourceCommandId` do QueueItem) — que é exatamente o princípio original do 02, "o fechamento do overlay não depende do ACK"; após o reinício do CLI, a consulta de comandos em trânsito devolve `unknown` → conforme C-02, apresentar "não entregue, reenviar?". Com isso C-03 (quais comandos fazem replay no reinício) se dissolve: **nenhum**.
4. **pendingInteractions não é persistido** (sem mudança): é um fato em memória derivado do turno em execução, e o sumiço do popup quando o turno morre é a semântica correta.

Resultado líquido: no lado do CLI, o SQLite fica com **zero tabelas novas e zero migrações**, e a única alteração é o campo de âncora JSON aditivo de message/part — perfeitamente alinhada ao "persistir o mínimo possível" do 07 e à recuperação por autossimilaridade do 01 (o único estado imperdível = transcript). Note que o `QueueItem.sourceCommandId` do R-07 não é afetado: é um campo de protocolo/memória, não de armazenamento.

### 9.4 Persistência do lado do cliente (não SQLite, mas faz parte desta lista)

- localStorage: `clientId` (após a divisão do R-08, serve apenas como identidade do remetente), draft (por sessionKey), lista de commandId em trânsito + TTL (C-02), âncora de rolagem rowId (R-18, substituindo o scrollTop em pixels atual), layout de pane (06).
- IndexedDB: cache de snapshot atômico `(projection, revision, seq[, logEpoch])`, otimização posterior (04 já lista; na Opção B é obrigatório levar logEpoch para julgar se o base do cache é utilizável).
- Dados antigos: mensagens históricas sem turnId possível de preencher ficam vazias, e as fallback rows são geradas em runtime pela camada de compatibilidade, sem gravação de volta no banco (07 já lista); se hoje "não lido" é registrado por seq, na Opção B passa a ser por `time_updated`.

## Apêndice: Tabela geral dos casos das cinco regiões (60 classes)

> Significado da decisão: **elim** = eliminada estruturalmente (com a base do design); **fix** = direção certa mas precisa fixar regras conforme §3; **falta** = não coberto pelo design (ver §4); **volta** = voltará de salto com outra roupa. As evidências são posições representativas; o texto original dos comentários está em cada arquivo.

### A. Camada de montagem do renderer (P1)

| # | Classe de patologia | Evidência | Decisão |
| --- | --- | --- | --- |
| P1-1 | heurísticas de merge de dupla fonte stream/snapshot (scoring de riqueza, cobertura por janela deslizante, comparação de prefixo) | zcodeChatMessages.ts:904,:1887,:2088,:2144 | elim (substituição integral do 04) + premissa R-03 |
| P1-2 | erro de fatiamento do container de streaming, colagem de cauda antiga (palpite em três níveis de turnId/inputId/traceId) | :549,:1481,:1068 | elim (máquina de estados da §3 do 09 + rowId novo por turno) |
| P1-3 | desalinhamento/duplicação/drift de âncora na timeline (casamento por tolerância de relógio de 1 segundo, 4 chaves de identidade se reconhecendo) | :1115,:2740,:2793; zcodeTimelineIdentity.ts | elim (marker = row comum) + fix R-04(rowId) |
| P1-4 | optimistic sendo mesclado em vez de sobrescrito (preenchimento de operationId, linha local assumindo o controle) | :787,:816 | elim (disciplina do 03) + fix R-07(âncora de marker) |
| P1-5 | estado terminal atrasado e ordem do fluxo de conteúdo (task_complete antes de pacotes atrasados, prévia de Write após stop sendo colada de volta) | helpers:431,:595; :2403,:1280 | elim (lado do cliente) + fix R-15(fechamento no reducer) |
| P1-6 | UI adivinhando agrupamento de turno (`turnIndex ?? Math.floor(index/2)`) | :1439; chatViewMessageTurns.ts:27 | elim (turnId persistido no 07) |
| P1-7 | flags de controle inferidas por arranjo do array de mensagens (backfill de canFork etc., identificação de execução contínua de goal) | zcodeTimelineRuntime.ts:49; renderUnits:27 | elim (02 sessionControl/actions) |
| P1-8 | farejamento de texto semântico do provider (casamento de texto de três gerações, regex de stopReason, regex de XML de mailbox) | :219-252,:62,:378,:1236 | elim parcial + falta G-06(mailbox) |
| P1-9 | o nível de água do snapshot não é um nível de água consistente | zcodeSessionEventOrder.ts:93 | fix R-03 |
| P1-10 | máquina de compensação de desordem do cliente (detecção de gap/cache pending/tabela de dedup de 10 mil entradas) | zcodeSessionEventOrderFields.ts全文 | elim (regra 2 do 04) + premissa R-01 |
| P1-11 | cálculo local de tempo de trabalho/duração e escolha entre duas fontes (espera por permissão contada por engano, congelamento antes do verifier, sem regredir e ficar menor) | :636,:1020,:1962; helpers:701 | falta G-05 |
| P1-12 | heurísticas de atribuição/pontes de colapso do compact + dedup do conteúdo de replay (diferença de toolId + recorte com startsWith) | renderUnits:48,:389 | a) fix R-15; b) falta G-05(grupo colapsado) |

### B. Aplicação de eventos de stream e sincronização de snapshot (P2)

| # | Classe de patologia | Evidência | Decisão |
| --- | --- | --- | --- |
| P2-1 | zoológico de estratégias de merge de snapshot (cinco estratégias: replace/terminal_reconcile/backfill/preserve/drop) | snapshotSync:615-668; useTaskRestore:1558 | elim (regra 1 do 04, a evidência positiva mais forte da V4) |
| P2-2 | snapshot em execução não atômico (polling para alcançar o nível de água, snapshot parcial, sete campos com recuperação individual) | eventOrder:93; useTaskStreamEvents:540; snapshotSync:78,:539; runtimeStateSync全文 | fix R-03 |
| P2-3 | corrida de atribuição de estado terminal atrasado (quatro booleanos shouldTreat*, estado terminal sem inputId) | terminalHandlers:180; snapshotSync:576-611,:852 | elim (eventos turn.* desaparecem, phase vem da projeção) |
| P2-4 | máquina de compensação de lacunas de seq no cliente (timer de recuperação de 250ms, dedup de prefixo/sufixo por trimChunkOverlap, cursor unverifiedFromSeq) | useTaskStreamEvents:56,:530; handlers:247,:769 | elim + premissa R-01 |
| P2-5 | bifurcação de comportamento por deliveryKind no cliente (bifurcação na recuperação de gap, consumo exclusivo de replayable, isFilteredNonOwnerBatch) | :104,:530; snapshotSync:774; handlers:716 | elim (tabela de parâmetros do 05 + contabilidade por faixas) |
| P2-6 | eventos de interação bloqueante perdidos/sobrescritos/não sincronizados entre pontas | :641; handlers:1216,:1240 | elim (pendingInteractions da §5 do 09) |
| P2-7 | inferência de flags por array (palpite de isChatTaskRunning, caso especial de execute pendente residual de SSH) | useChatViewDisplayFlags全文; chatStatus:42 | elim; o shimmer pode ser derivado de phase + última linha |
| P2-8 | orquestração de drain/held/steer da queue no cliente (drain disparado localmente após estado terminal, stopRequested reescrevendo held localmente) | terminalHandlers:346-407; handlers:297 | elim + D-03(expressão do estado intermediário de steer) |
| P2-9 | dedup difuso de mensagem de usuário otimista na janela de 15s, texto original de /goal sobrescrito pelo objective | handlers:148-178,:165 | elim + fix R-07 |
| P2-10 | corrida de eco de modelo/config (guard de casamento de eco, preserve de três camadas de thought, mais de 15 stale guards) | handlers:1413-1497; useTaskStreamEvents:117; useTaskRestore em vários pontos | falta G-01 (a descoberta mais importante desta região) |
| P2-11 | perda de dados na janela entre assinatura e ciclo de vida do componente (liberar antes de assinar, plan guardado só na memória do componente) | :682,:392; handlers:1200 | elim (o cliente deixa de ser reducer) |
| P2-12 | grupo de patches de recuperação de campos de projeção em bypass (plan/todo/goalStats/apiRetry/contextUsage/bash de fundo) | runtimeStateSync:139-203; handlers:1645 | falta G-02/03/04 |

### C. Store e entrada web (P3)

| # | Classe de patologia | Evidência | Decisão |
| --- | --- | --- | --- |
| P3-1 | reconciliação de dupla fonte de verdade (escrita dupla do verifier, comparação entre relógio do cliente e hora do servidor, não lido em dupla fonte) | taskSlice:840,:1884; workspaceSlice:1142 | elim + falta G-01/02 (campos precisam entrar na projeção) |
| P3-2 | tabelas de idempotência manuais para entrega duplicada (despertar sem sentido por usage repetido, tabela circular de eventKey, dedup de objetos por requestId) | taskSlice:537,:1016,:114; Types:180 | elim (dedup por msgId + contabilidade por faixas + conflation) |
| P3-3 | erro de decisão por identificador de estado de execução residual (inputId residual, activeTurnKind não limpo, rota de stop apagada) | taskSlice:437-448,:1826 | elim (substituição integral de control) |
| P3-4 | interação pendente de slot único sobrescrita, CPU alta na limpeza por dois caminhos | taskSlice:1142,:1205,:1228 | elim + fix R-07(cinza otimista) |
| P3-5 | staging de marker de troca de modelo em bypass + montagem por turnIndex | taskSlice:1406,:1434 | fix R-17 |
| P3-6 | publicação em quadros separados causando saltos grandes de altura (messages/summary/fileChanges em três escritas) | taskSlice:1535 | elim + falta G-05(destino do resumo por turno) |
| P3-7 | cruzamento de identidade de workspace (fallback de path lendo config/fila/estado de erro um do outro) | selectors:203,:241 | fix R-16 |
| P3-8 | estados terminais conflitantes entre caminhos de recuperação (unknown→invalid-mobile, duas páginas de erro, DEVICE_OFFLINE correndo na frente) | main.tsx:1316; transport:463,:585 | elim + falta G-08(classificação terminal) |
| P3-9 | remount de toda a árvore ao trocar de bridge (key=bridgeSessionId, flash "carregando" ao voltar ao primeiro plano) | main.tsx:1703,:1388,:1407 | elim (identidade da assinatura persistente) |
| P3-10 | buraco negro de envio em conexão meio-aberta (descarte silencioso, retry de reconstrução unidirecional) | transport:504,:899; main.tsx:1563 | elim (troca de管 de detecção de morte e replay no 05) |
| P3-11 | tempestade em cascata de reconexão (10 entradas, single-flight manual, 4 comparações de geração) | transport:839,:416; main.tsx:1439 等 | elim + premissa R-01 |
| P3-12 | identidade do cliente como singleton de localStorage (mesmo id em múltiplas abas, fallback de private mode) | main.tsx:851,:863,:178 | fix R-08 |

### D. Transporte e controle remoto (P4)

| # | Classe de patologia | Evidência | Decisão |
| --- | --- | --- | --- |
| P4-1 | seq-gap→degraded→recuperação total da bridge (quadros não idempotentes, medo de fazer replay) | manager:899; relayProtocol:194,:141 | elim + premissa R-02 (a dedup do receptor existe de verdade) |
| P4-2 | buffer per-client na camada intermediária + TTL/overflow/degraded complementar | manager:367,:451,:495; relayProtocol:169 | elim (não fazer fila per-client) |
| P4-3 | bifurcação de dupla fonte de evento owner/observer (já forçada a se fundir de volta) | taskRealtimeBus:685 | elim (clientes com paridade total; o endossamento mais forte da direção) |
| P4-4 | corrida de lease/roteamento de comandos do owner (NO_ACTIVE_TASK_OWNER, broadcast owner_lost) | bus:838-889,:195 | elim + falta G-10(tomada de possession no crash) |
| P4-5 | OOM com quadros grandes (batch de espelho com várias cópias saturando o heap, fatiamento forçado por seq) | bus:497,:516,:622,:718 | elim + fix R-12(limite de quadros) |
| P4-6 | múltiplos heartbeats/detecção de morte/cascata de reconexão (5-6 entradas de transport + grace de 3s) | transport:288,:374,:425,:407,:436; manager:336 | elim + falta G-09(viabilidade do relay) |
| P4-7 | falso vivo em conexão meio-aberta/em suspension (kernel não dispara close, waiting_terminal travado) | transport:359,:475 | elim (detecção de morte por ACK na camada de aplicação, argumentação e casos batem) |
| P4-8 | estado de transporte mapeado em estado de UI com contradição (estado suspect staleWaiting, debounce mantendo active) | transport:365; manager:1000,:578,:1293 | elim + fix R-13 |
| P4-9 | PersistentProtocol sem dedup no receptor/sem attach no servidor/sem ACK ativo | protocol.ts:411-425; remote.ts:302 | **volta** (sem a correção a tempestade de A1不会出现) → R-02 |
| P4-10 | PersistentProtocol com zero implantação em produção | server/stdio.ts:53、http.ts:66、websocket.ts:97、host/index.ts:572 | correção de distorção M1 |
| P4-11 | entrega duplicada por múltiplos caminhos com fallback de eventId no fim (tabela circular de mil entradas, flush forçado entre canais para preservar ordem) | bus:1039,:444; transport:253 | elim + fix R-01(três ramos) |
| P4-12 | dupla codificação base64/fatiamento manual (blocos de 0x8000 para evitar estouro de pilha) | manager:781; relayProtocol:30-47 | elim (quadros binários) + P-03(preservar deflate) |

### E. Lado da fonte de verdade da CLI (P5)

| # | Classe de patologia | Evidência | Decisão |
| --- | --- | --- | --- |
| P5-1 | seq de protocolo numerado preguiçosamente em memória por (record,deliveryKind), assinatura reexaminando toda a história | server-operations.ts:201-255,:634,:1567 | elim + fix R-04(persistência de seq) |
| P5-2 | evento live-only não entra no event log (espelho de subagent com seq=0) | :637 | falta → fix R-05 |
| P5-3 | fatos mutuamente exclusivos espalhados em dois níveis e quatro lugares + corrida de ordem liberação/broadcast | :2747,:1810,:2215,:1909,:2184 | elim + fix R-15(guard de mesma origem) |
| P5-4 | adivinhando limites de turno varrendo o array (usuário sintético quebrando a contagem de turnos, só o último turno pode fazer fork) | :3127-3130 | elim + fix R-04(determinismo do rowId de fallback) |
| P5-5 | hoje fork em execução é proibido de forma absoluta vs o alvo permite histórico estável | :2042 | mudança de comportamento → lista C-07 |
| P5-6 | escopo de herança do fork recuperado por patches item a item (modelo sobrescrito pelo default, timeline do goal quebrado) | :2072,:2121 | elim (tabelamento de herança testável em golden test) |
| P5-7 | corrida de fechamento entre stop e estado terminal atrasado (verifier sem abort reteve active goal, cancelled sem evento terminal complementar) | :2310; event-reducer.ts:302,:435 | elim + fix R-15(entra no golden test) |
| P5-8 | revision incrementada à mão em pontos espalhados, puramente em memória, -32009 não estruturado | :1207 等 15+ 处; server-types.ts:152 | fix R-04(revision derivada) |
| P5-9 | dupla fila para entradas subsequentes em execução, volátil em dois pontos (steer puramente em memória + deferred queue da UI) | agent-runtime.ts:158; :1602-1617 | elim + correção M3 + 08 complementando a migração |
| P5-10 | imposto de dedup por dupla expressão de streaming (scheduled repetindo grandes parâmetros, máquina de estados de dedup entre eventos) | :504 | elim (row.delta única + lista fechada de permissões) |
| P5-11 | a fronteira de protocolo do CLI já tem uma camada de batching determinístico | :447,:3277-3279 | fix R-14(decisão de manter/remover) |
| P5-12 | subscribe como RPC único, sem identidade de fluxo de assinatura, sem janela de retenção | :1561-1584 | elim + premissa R-01; com G-15 indexado |

（G-15: quando a janela de retenção de eventos passar de "infinita" para finita, o caminho de replay precisa do índice `getEventsAfter`, evitando O(história inteira) reexaminando tudo.）