# Planejamento de correção de vazamento de memória: política de retenção do event store em memória da CLI

Estado: **implementado** (spec em `apps/zcode-cli/docs/design/v2/session-event-store-retention.md`; o usuário confirmou a evict com um turn de atraso. Este documento é mantido como registro do processo de decisão)

Relacionados: relatório de auditoria `docs/analysis/memory-leak-audit-2026-09-03.md`; capacidade de observabilidade `docs/monitoring/memory-diagnostics-log.md` (já implementada, o contador `eventRows` é a evidência de antes/depois deste item).

## I. Retomada dos riscos da auditoria e prioridade

| Prioridade | Processo | Risco                                                                                                                                      | Ritmo de crescimento                                             | Por que ficou aqui                                                                                                                             |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | agent CLI | `InMemorySessionEventStore` mantém permanentemente cada `ModelStreaming` (por token) e `ToolCallProgress`; o append ainda copia tudo com `[...events, e]`; ninguém chama `deleteSession` | **um registro por token**, crescendo só enquanto a session reside | Único ponto que cresce na frequência de token; todas as sessões longas e todos os usuários são atingidos; o legacy `session/subscribe` do desktop ainda prende a session sem reciclagem, e a soma dos dois é o "quanto mais usa, maior fica" |
| 2 | main | listener `will-download` preso ao defaultSession, pulando a limpeza ao fechar a janela                            | +N closures por janela fechada                                       | Correção de uma linha, MR independente                                                                                                       |
| 3 | main | `TaskRealtimeBus.streamBatches` não remove runs em estado não terminal e ainda reproduz para novas janelas | +1 por interrupção/desconexão (≤512KB)                             | Correção de poucas linhas, MR independente                                                                                                   |
| 4 | renderer | `tokensCache` do shiki sem evict; Edit em streaming gera um por chunk                                                                    | +N por saída da tool Edit                                          | Adicionar LRU, MR independente                                                                                                                |
| 5 | renderer | cache em memória de snapshot de task sem limite                                                                                       | +1 por task aberta                                                | Reaplicar o limite já existente na camada de persistência                                                                                    |
| 6 | host | assinatura bots per-task liberada só por estado terminal no stream                                                                     | +1 por desconexão/crash remoto                                     | Extrair `releaseTaskWatch`                                                                                                                    |
| 7 | agent CLI | publisher de sub-session de subagent sem mapeamento pai→filho                                                                        | +1 conjunto por subagent                                           | Exige mapeamento pai-filho                                                                                                                    |
| 8 | host/services | RPC desconectado não recicla pty / fs.watch; session close não limpa tabela de espelhos                          | por desconexão / por session                                       | Estrutural, exige fronteira unificada                                                                                                         |

Os itens 2 a 5 são pequenas mudanças e podem abrir um MR cada em paralelo a este; este documento planeja apenas o item 1.

## II. Objetivo da correção e contratos que precisam ser preservados

A correção muda **apenas a política de retenção**, não a interface, nem o local de distribuição de números de sequência, nem o objeto entregue ao live sink. Cada item abaixo é um fato lido no código; se algum não se confirmar, não se pode podar.

```text
                        AgentRuntime.appendEvent (core/src/runtime/methods/events.ts:101)
                                       │ eventStore.append → 补 sequenceNumber
                                       │ persistDurable → sqlite messages
                                       │ notifyEventSinks（live：V4 gateway / legacy sink）
                                       v
   ┌──────────────── InMemorySessionEventStore (adapters/src/storage/index.ts) ────────────────┐
   │ eventsBySession: Map<sessionId, SessionEvent[]>                                             │
   └──┬──────────────┬──────────────────┬──────────────────┬───────────────────┬────────────────┘
      │ getEvents    │ getEvents        │ getEvents         │ getEvents          │ getLatestSequenceNumber
      v              v                  v                   v                    v
 legacy 回放      V4 冷恢复          rewind/fork/         file-changes/       assistant-feedback /
 readProtocol-    v4-bridge:1506      checkpoint          subagent 子会话      v4-bridge:457
 SessionEvents    sourceEventSeq =    只 filter            只 filter            (+1 追加新事件)
 (server-ops:715) max(seq) ←风险     ModelComplete /      ToolCallResult /
 对 ModelStreaming                    RewindTriggered /    CheckpointCreated
 合批为 model.streaming               CheckpointCreated
```

| Contrato | Origem | Restrição sobre a correção |
| --- | --- | --- |
| Origem única de seq | comentário em `events.ts:79-82`; `v4-gateway.ts:2375+ normalizeRuntimeEventSequence` faz drain contínuo pelo raw seq | Eventos transitórios **ainda precisam passar pelo store para receber seq e serem entregues como são ao live sink**; não é permitido bypassar o store |
| Geração de evento novo com `getLatestSequenceNumber()+1` | `assistant-feedback-persistence.ts:53`, `v4-bridge.ts:457` | O número deve vir de um contador monotônico independente, e não do "último evento que ainda reside" |
| Cursor de recuperação a frio do V4 | `v4-bridge.ts:1506-1516` usa `max(events.sequenceNumber)` como `sourceEventSeq` | Depois da poda esse valor fica baixo demais → trocar por `getLatestSequenceNumber()` |
| Seq do protocolo legacy | `server-operations.ts:800 getProtocolEventSeq` obtém lastSeq reproduzindo todos os eventos | Ler diretamente o `lastSeq` do record (`server-types.ts:63` já tem) |
| Dependência da projeção V4 em eventos de streaming | `product-projection.ts:463` só consome `ModelStreaming` quando `isRunning()`; `cold-event-merge.ts:138` lista `ModelStreaming/ModelComplete` como TRANSCRIPT_DERIVED, e turns concluídos são ressintetizados a partir das mensagens persistidas por `transcript-hydration.ts:1480 synthesizeEventsFromMessages` | Eventos transitórios de um turn **em andamento** precisam ser mantidos; os de um turn **concluído e já persistido** são redundantes |
| `ModelComplete.content` carrega o texto completo | `contracts/src/events/session.events.ts:566` | O texto de um turn concluído não depende de deltas |
| reducer / rewind / fork / checkpoint | `contracts/src/events/event-reducer.ts` não tem handler de `ModelStreaming/ToolCallProgress`; cada consumidor só filtra tipos de baixa frequência | Não são afetados pela poda |
| `firstTokenAt` das estatísticas de usage | `usage-observability.ts:373` usa o array `events` por turno | Não é afetado |
| Mudança de comportamento do replay legacy | `readProtocolSessionEvents` perde o agrupamento de `model.streaming` de turns concluídos | Confirmar que o mapeamento de `ModelComplete` em `session-mapper.ts` carrega o texto completo (primeira coisa a fazer antes de implementar) |

## III. Solução por fases

### Fase 1: sem mudança semântica (pode subir sozinha)

- `append` passa a fazer `push` no lugar, removendo a cópia O(n); `getEvents` continua devolvendo cópia (os chamadores têm o hábito de `[...events]`, não vale o risco).
- `getLatestSequenceNumber` passa a usar um contador monotônico independente `latestSeqBySession`.
- Ao liberar o registro de session, chamar `eventStore.deleteSession(sessionId)`: quatro caminhos (`session/close`, falha de criação, desativação por idle, saída do processo) em (`bootstrap/src/zcode-protocol/server.ts` / `session-residency.ts`).
- O `sourceEventSeq` em `v4-bridge.ts:1506` e o `getProtocolEventSeq` em `server-operations.ts:800` passam a ler o contador / `lastSeq` (o comportamento é equivalente neste ponto; mudar antes abre caminho para a Fase 2).
- Aceitação: todos os testes existentes verdes; `eventRows` volta a zero depois que a session fecha.

### Fase 2: política de retenção por janela de turn (a correção de memória propriamente dita)

- Novo módulo puro `adapters/src/storage/session-event-retention.ts`:
  - `TRANSIENT_SESSION_EVENT_TYPES = {ModelStreaming, ToolCallProgress, StreamingToolLedgerUpdated, ModelNetworkStatus}` (fonte única, referenciada pelo store e pela documentação).
  - Máquina de estados: `onAppend(event) → { retain: boolean; evictTurnIds: string[] }`. Regras: eventos transitórios são agrupados por `turnId`; ao observar `TurnStarted(T+1)`, descartar `T` e os buckets anteriores que já têm `TurnComplete/TurnError` (**um turn de atraso**, para dar tempo à persistência em sqlite); quando `RewindTriggered` chega, nenhum bucket é descartado (a atribuição de turn durante rewind é complexa e fica a cargo de `deleteSession`).
  - Eventos não transitórios são retidos permanentemente (a quantidade é da mesma ordem da de mensagens e já tem uma fronteira de compactação).
- `InMemorySessionEventStore` aceita `retention?: SessionEventRetentionPolicy`, com janela de turn como padrão; o modo `unbounded` mantém o estado atual para rollback e teste de comparação.
- `getStats()` ganha `evictedEvents`, `retainedTransient`, gravados junto com o log de diagnóstico de memória como evidência do efeito em produção.
- Única mudança de comportamento observável: o legacy `session/events` / `session/subscribe afterSeq` deixa de reproduzir deltas de token de turns **concluídos**; o turn atual e o turn anterior recém-concluído ainda podem ser reproduzidos. Registrar isso na spec e em `docs/conversation-product-protocol.md`.

### Fase 3 (opcional)

Definir também um limite para eventos transitórios dentro de um único turno (para evitar um turno descontrolado); ao estourar, agrupar os deltas mais antigos em um só registro. Avaliar depois que a Fase 2 estiver no ar, olhando a distribuição de `retainedTransient`.

## IV. Como testar

### Unitários (escrever primeiro)

| Caso | Asserção |
| --- | --- |
| máquina de estados de retention | eventos transitórios são retidos enquanto o turno dono está em andamento; o bucket de `T` é descartado após `TurnStarted(T+1)`; o bucket de `T+1` é mantido enquanto `T+1` não termina; não transitórios nunca são descartados; rewind não dispara descarte |
| store: seq monotônico | após o descarte `getLatestSequenceNumber` não regride; o seq devolvido por `append` é estritamente crescente |
| store: caminhos de leitura | `getEvents/getEventsAfter` devolvem não transitórios ∪ transitórios dentro da janela, ordenados por seq; após `deleteSession`, `getStats` zera |
| store: desempenho | 10^5 appends lineares (para evitar voltar a O(n²)), usando o gating existente `ZCODE_PERF_REPRO=1` |
| teste de contrato do Port | `describeSessionEventStoreContract(factory)` roda os modos unbounded e turn-window, garantindo semântica de interface idêntica |

### Integração de bootstrap (existentes + novos)

- Obrigatórios, já existentes: `zcode-protocol.test.ts` (inclui 5 asserções de replay/seq de `model.streaming`), `v4-gateway*.test.ts`, `v4-cold-resume.test.ts`, `cold-event-merge.test.ts`, `transcript-hydration.test.ts`, `product-projection*.test.ts`, `session-resident-pool.test.ts`.
- Novos:
  1. com o turno em andamento, `session/subscribe afterSeq` ainda reproduz o delta do turno atual;
  2. após dois turnos consecutivos, o replay contém apenas mensagens e eventos de baixa frequência, com protocolSeq contínuo e sem buracos;
  3. na recuperação a frio, `sourceEventSeq` após o descarte é igual ao seq mais recente e o preenchimento de gap está correto;
  4. com raw seq chegando fora de ordem (N+1 antes de N), o drain continua correto após o descarte;
  5. rewind / fork / checkpoint após o descarte dão resultado byte a byte igual ao do modo unbounded (executar o mesmo script nos dois modos para comparar).
- Falhas de baseline conhecidas e não relacionadas: `v4-gateway.test.ts` "旧 revision retry" e `zcode-protocol.test.ts` "三类 v4 subscribe response"; confirmar o estado delas em uma baseline limpa antes da correção, para evitar falso julgamento.

### Regressão de memória (nova)

`bootstrap/tests/session-event-store-retention.perf.test.ts`: com gating `ZCODE_PERF_REPRO=1` e `--expose-gc`, rodar N turnos × M deltas e afirmar `getStats().events ≤ número de não transitórios + transitórios de 2 turnos`, com incremento de `heapUsed` limitado; o mesmo script roda em modo unbounded como saída de comparação.

### Manual / E2E

- No desktop, conectado à CLI local, rodar uma sessão longa em streaming por mais de 30 minutos e observar a curva de `eventRows` do `memory_sample` em `~/.zcode/cli/log`: antes da correção sobe linearmente com os tokens, depois cai entre turns.
- Assinar o V4 pane e o fluxo do bot legacy ao mesmo tempo, com queda de rede e reconexão passando pelo replay de `afterSeq`; fazer replay depois de rewind / fork / compact.
- Rodar `pnpm test:e2e:container:conversation` (o conjunto de verificação de conversation cobre a semântica de streaming / replay).

## V. Como garantir testabilidade das mudanças nos outros módulos

1. **Injeção de dependência no lugar da construção hardcoded**: `server-operations.ts:3493` e `:2883` chamam `createInMemorySessionEventStore()` diretamente. Adicionar `context.deps.createSessionEventStore?(sessionId)` (em `ZCodeProtocolAgentDependencies`, `server-types.ts`), com store de janela de turn como padrão; os testes podem injetar um store spy para afirmar chamadas de append / delete, ou injetar o store unbounded para comparação A/B. `create-app.ts:558` já tem o ponto `options.eventStore`; reaproveitar.
2. **Separação entre política e contêiner**: as regras de descarte são uma máquina de estados pura, sem IO, com branches exaustivamente cobertos por testes; o store apenas "chama a política e mantém o Map". Mudar as regras depois não toca no store nem em nenhum consumidor.
3. **Um único teste de contrato do Port**: colocar `describeSessionEventStoreContract` em `adapters/tests`, apagar o duplo manual existente `core/tests/test-event-store.ts` (que tem a mesma cópia O(n) da implementação de produção) e passar os 40 testes do core para o store real, eliminando os falsos verdes da classe "duplo divergindo do comportamento de produção".
4. **Constante de fonte única**: exportar `TRANSIENT_SESSION_EVENT_TYPES` de contracts e fazer store, spec e `readStreamingDeltaBatchableEvent` (`server-operations.ts:382`) referenciarem o mesmo conjunto; ao adicionar um novo tipo de evento muda-se só um lugar, e o teste afirma que o conjunto é igual ao conjunto ignorado pelo reducer.
5. **Consumidores apoiados no contrato de seq, e não no tamanho do array**: unificar as inferências do tipo `max(events.sequenceNumber)` para `getLatestSequenceNumber()` / `record.lastSeq`, e acrescentar a cada consumidor um caso de "ainda correto após o descarte"; assim qualquer mudança futura de política de retenção não quebra silenciosamente nenhum cursor.
6. **Asserção em runtime**: colocar `events / evictedEvents / retainedTransient` de `getStats()` no log de diagnóstico de memória, permitindo validar em produção se a política está em efeito; o teste de perf usa o mesmo `getStats()` para afirmar o limite superior.
7. **Reversível**: o modo de retenção é um parâmetro de construção; em caso de problema, voltar o padrão para `unbounded` já é o rollback, sem precisar reverter as mudanças nos consumidores.

## VI. Ordem de entrega

1. `docs`: converter este documento em spec em `apps/zcode-cli/docs/design/v2/session-event-store-retention.md`, atualizar em conjunto `docs/design/v2/session-idle-deactivation.md` (`deleteSession` ao liberar o record) e `docs/conversation-product-protocol.md` (mudança de comportamento do replay legacy).
2. `refactor(cli): in-place event append, seq counter, deleteSession on release` (Fase 1 + consumidores lendo o contador + seam de DI + teste de contrato + remoção do duplo de teste).
3. `feat(cli): turn-window retention for transient session events` (Fase 2 + novos casos de integração/perf + extensão de getStats).
4. MRs pequenos em paralelo: `will-download` / `streamBatches` no main, LRU de shiki / snapshot no renderer.

## VII. Pontos que precisam da sua decisão

- Se a evict com um turn de atraso é aceitável (custo: manter sempre na memória o delta de um turno concluído; benefício: não depender da temporização da persistência).
- O legacy `session/events` deixar de reproduzir o `model.streaming` de turnos concluídos tem algum lugar que dependa disso para renderizar texto histórico no desktop replayable / no lado dos bots (verificar antes de implementar o mapeamento de `ModelComplete` em `session-mapper.ts` e os consumidores em `packages/services/src/zcode-agent/zcodeAgentService.ts:5640`).