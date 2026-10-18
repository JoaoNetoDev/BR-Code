# V4 cold resume: ativação de runtime e desaclopamento do snapshot legacy

> Estado: aceito em 2026-07-24; em 2026-08-13 foram acrescentados os contratos de materialização única e de nível de água READY único.
> Escopo: primeira subscrição fria de conversation do V4; não remove o protocolo legacy `session/resume` nem migra a subscrição realtime do Bot.

## 1. Problema

Antes da mudança, após o cold start da CLI, ao abrir a sessão persistente pela primeira vez, a subscrição do V4 reutilizava indiretamente o legacy `resumeSession`:

```text
v4/conversation/subscribe
  -> legacy cold-resume adapter
  -> legacy resumeSession
       ├─ 创建 record / runtime
       ├─ 恢复 workspace、模型、thought、mode、restoreWarning
       ├─ app.resume() 与事件接线
       └─ 构建完整 ZCodeSessionStateSnapshot  ──> 返回值被 V4 丢弃
  -> V4 durable transcript hydration
  -> getSessionUsageSeed
       └─ legacy readSession/full snapshot   ──> 只读取 runtime.contextUsage
  -> V4 initial snapshot
```

Aqui se misturavam duas responsabilidades:

1. **ativação de runtime**: da qual os comandos subsequentes e o config seed do V4 dependem;
2. **materialização da camada de apresentação legacy**: que existe apenas para servir a resposta antiga de `session/resume`.

O V4 já gera o seu próprio snapshot autoritativo a partir de durable transcript, session entry, memory event e `ProductProjection`. Continuar construindo o snapshot legacy não aumenta a capacidade de recuperação e apenas faz o tempo consumido crescer repetidamente com a escala de messages/parts históricos.

## 2. Fronteira de objetivo

```text
                         ┌─ legacy session/resume
persisted session        │    -> activateSessionForResume
        │                │    -> build legacy snapshot -> legacy caller
        v                │
activateSessionForResume ┤
  ├─ persisted metadata  │
  ├─ workspace identity  └─ V4 cold subscribe
  ├─ record + event sink      -> activateSessionForResume
  ├─ model/thought/mode       -> V4 durable hydration
  ├─ restoreWarning           -> narrow context-usage seed
  └─ app.resume()             -> V4 initial snapshot
```

`activateSessionForResume` é uma primitiva de ciclo de vida independente de profile:

- quando o record já existe, não repete `app.resume()` nem a ligação de eventos; um `runtimeModel` explícito ainda é atualizado conforme a semântica antiga;
- quando o record não existe, preserva integralmente todo o comportamento original de `resumeSession` antes de `snapshot(...)`;
- erros como store sem session, modelo indisponível ou falha no resume do runtime são iguais aos do caminho antigo;
- não faz ramificação por `desktop-continuous` / `web-remote-replayable`. Ambos se separam apenas no profile de entrega do publisher do V4, depois da ativação concluída.

O legacy `resumeSession` continua como camada de compatibilidade:

```text
resumeSession = activateSessionForResume + snapshot
```

Portanto, a semântica dos chamadores antigos de protocolo, das leituras de estado legacy do Bot ainda não migrado e dos testes não muda; desta vez apenas fazemos com que a subscrição fria do V4 chame a primitiva activation-only.

## 3. Funcionalidade que não pode ser perdida

| Invariante                      | Restrição                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| runtimeReadyBeforeHydration     | os config/usage seed do V4 e a publicação do primeiro frame só são lidos depois de `app.resume()` concluir   |
| historicalConfigPreserved       | model, thought e mode históricos continuam sendo restaurados com prioridade da selection durable local da sessão |
| restoreWarningPreserved         | quando o modelo histórico está indisponível, ainda se pode ler o histórico, mas o `sendText` seguinte é recusado pelo mesmo gate de restore warning |
| workspaceIdentityPreserved      | a recuperação remota continua usando o `workspaceID` persistido; a identity key não degrada para `workspacePath` |
| eventWiringPreserved            | o event sink, a persistência e a ligação de MCP/runtime estabelecidos por `createRecord` não mudam           |
| timestampsAndParentPreserved    | `createdAt`, `updatedAt` e `parentSessionId` continuam sendo preenchidos a partir da sessão persistente    |
| v4HistoryAuthorityUnchanged     | rows, reasoning, tool, plan, goal, queue e interaction continuam sendo restaurados pela materialização durable do V4 + memory tail |
| deliveryBoundaryUnchanged       | o desktop mantém continuous; mobile/Web remote mantém a restauração replayable por gap/snapshot           |
| restartDiscardUnchanged         | input do runtime anterior que não chegou a estado terminal continua sendo discarded pelo delivery ledger; não pode ser reproduzido automaticamente só por ter removido o snapshot legacy |
| legacyResumeResponseUnchanged   | `session/resume` continua devolvendo um snapshot legacy completo e equivalente em schema                   |
| v4ColdReadySingleOwner          | o gateway do V4 usa apenas um único promise cold READY para encadear ativação e hydration                   |
| hydrationBoundaryUnchanged      | `hydratePublisher` continua responsável apenas pela hydration da projeção e não assume as pré-condições de ativação de runtime existentes em cada entrada |
| registryIsNotV4Readiness         | `context.sessions` apenas registra o record; query/command não podem ser liberados com base nisso antes de a operação fria do V4 concluir |

Pending permission/elicitation e a queue atual do runtime não são fatos duráveis que um processo antigo possa ressuscitar sem condição. Não os adicionamos, removemos nem reescrevemos; a memory event tail do V4 do novo runtime continua sendo a autoridade online.

## 4. Projeção estreita de usage

A cold recovery do V4 não pode chamar `readSession` de novo só para obter `runtime.contextUsage`. A projeção estreita precisa reutilizar o mesmo critério de cálculo atualmente usado pelo snapshot legacy:

```text
runtime projection contextUsed/contextWindow
  + active-branch persisted context usage/cache
  + latest matching main-turn ModelComplete breakdown
  -> ZCodeSessionContextUsage
  -> SessionUsageSeed
```

Os seguintes detalhes precisam ser preservados:

- o `contextUsed` do runtime tem prioridade quando é diferente de zero; caso contrário há recorrência para os assistant tokens mais recentes do active branch ou para a compact boundary, conforme o critério descrito em `docs/context-window-usage-state.md`;
- o resumo de cache conta apenas assistant messages não-summary do active branch; a compact boundary seed não ressuscita o cache anterior à compactação;
- o breakdown aceita somente o `ModelComplete` mais recente que seja de main-turn e tenha `used/contextWindow` alinhados ao meter;
- used/window não positivos retornam `null`, preservando a semântica de “ainda sem nenhuma ida e volta de modelo”;
- não lê/mapeia legacy messages, settings, todos, goal, slash commands ou model availability.

### 4.1 Materialização única da cold recovery

Na primeira subscrição fria do V4 de uma sessão grande, settings, resume do runtime, durable hydration, manifesto de subagent e usage seed usam o mesmo conjunto de messages/parts persistidos. O caminho normal permite apenas uma leitura completa, no ponto de partida da ativação, e os consumidores seguintes reutilizam esse array pela pilha de chamadas corrente da cold recovery:

```text
activateSessionForResume
  messages() ──> M0
       ├─ derive runtime settings(M0)
       └─ app.resume({ persistedMessages: M0 })
              |
              ├─ 未修改持久 message/part ───────────────> M0
              └─ 修补中断 compact timeline ─> messages() ─> M1
                                                        |
                                                        v
gateway readyFlights[sessionId](M0 | M1)
  ├─ durable transcript
  ├─ parent subagent manifest
  └─ late usage seed
```

As restrições são as seguintes:

- a materialização existe apenas no promise cold-resume atual e na pilha de hydration imediatamente seguinte; não pode ser pendurada no session record, não pode estabelecer um cache de longo prazo `sessionId -> messages` e não adiciona TTL, broadcast de invalidação nem schema de banco;
- o runtime continua obtendo primeiro a sessão persistente e depois consumindo as messages injetadas; apenas a cold activation do V4 escolhe explicitamente reutilizar esta materialização, enquanto o core comum e o legacy `session/resume` não injetam messages e continuam lendo pelo próprio runtime, preservando a semântica original de cada entrada;
- se o resume do runtime convergir e gravar de volta no store uma timeline compact em `started/retrying`, a ativação precisa refrescar as messages uma vez antes de entregar ao V4. Somente esse caminho de reparo permite duas leituras completas; o caminho normal precisa ser estritamente uma;
- a durable hydration continua lendo o session metadata, target, session entries e memory events mais recentes; reutilizar as messages não pode congelar a água de rewind/target/event;
- o usage seed continua sendo lido depois que a hydration completa o live buffer, a partir do session/events/projection de runtime mais recentes, usando as messages materializadas apenas como entrada, preservando a ordem já existente de “um novo `ModelComplete` fica acima da semente fria”;
- o manifesto de subagent reutiliza apenas as messages do parent; cada child session continua lendo seus próprios fatos persistentes, e não se pode deixar a materialização do parent se espalhar em um cache entre sessões;
- subscrições concorrentes desktop continuous / web remote replayable compartilham o mesmo promise READY e a mesma materialização, mas a semântica de delivery profile, gap/resync e de estado terminal do primeiro frame não muda.
- o gateway mantém apenas uma entrada `readyFlights` por sessão fria, encadeando
  `activate runtime -> hydrate projection`. O registro da entrada precisa acontecer antes do início da ativação;
  uma entrada fria concorrente que já tenha visto essa entrada precisa esperar o mesmo estado terminal. O `ColdSessionResumeCoordinator` que já existia antes da mudança continua responsável apenas pelo single-flight de ativação de runtime e pela classificação de erros, e não é a água READY de command/query.
- `hydratePublisher` mantém sua responsabilidade original de projection-only e seu hydration singleflight independente; não pode, dentro dele, decidir a ativação com base em `sessionExists`, publisher destacado ou opção do chamador. Cada entrada continua preservando explicitamente suas pré-condições originais: a leitura de conversation comum é decidida por `hasLiveConversation`, e o read de file rewind/attachment por `host.sessionExists`. Só entra em `readyFlights` quando a cold activation é de fato necessária.
- command/query só leem o promise READY que já existia no início da chamada; se ele existir, esperam e depois entram uma única vez no fluxo existente de query/admission do CommandInbox. A re-verificação sob lock já existente dentro desse fluxo permanece inalterada; não se pode adicionar fora do READY um “consultar uma vez, esperar e consultar de novo”, nem fazer cada query envolver `.finally()`. Como o registro do READY é anterior à ativação, a janela de recuperação não cria um índice de commands antigo, e o owner do READY não invalida mais esse índice.
- command/query órfãos não ativam automaticamente sessions históricos. O legacy `session/resume` e o `attachment/begin` mantêm suas entradas originais, não são incorporados a esta coordenação READY e nenhum singleflight entre entradas é adicionado.
- `fault.command.queryUnavailable` indica somente falha de leitura de fatos persistentes de transcript/timeline/child/discarded.
  Exceções de activation/hydration preservam o erro de ciclo de vida original e não podem ser disfarçadas de falha de command query.
- Uma falha do READY segue os erros e a semântica de limpeza já existentes de activation/hydration; o gateway libera apenas a entrada deste map,
  evitando reutilizar permanentemente um promise já rejeitado, mas sem alterar o ciclo de vida existente de `context.sessions`. Somente quando a falha ocorre antes da entrada do record no registro as requisições seguintes reentram na cold activation; não há promessa de rollback ou retry automático após a entrada do record, e nenhuma transação compensatória nem cache de falha é adicionado.

### 4.2 Owner READY único

```text
gateway readyFlights[sessionId]
  absent
    -> READYING(activate runtime -> hydrate projection)
    -> absent + READY publisher

hydratePublisher(sessionId, persistedMessages?)
  -> 只复用 hydrationInFlight
  -> 不负责 runtime activation

incoming query / command
  const ready = readyFlights.get(sessionId)
  if (ready) await ready
  enter the existing CommandInbox flow once
```

As fronteiras de estado são as seguintes:

- `context.sessions` continua responsável apenas pela ligação de eventos; a base de espera de query/command do V4 é somente o promise READY do gateway;
- somente um cold READY que parte de uma sessão persistente nunca registrada bloqueia query/command; a primeira hydration de projeção de uma sessão live existente mantém a semântica original de agendamento de commands, e a espera não é ampliada por esta correção de M0;
- leituras dependentes de host continuam garantindo, em sua própria entrada, que o record foi restaurado, sem codificar pré-condições mais fortes no `hydratePublisher` compartilhado;
- o singleflight de ativação que já existia antes da mudança mantém sua responsabilidade original; o CommandInbox não mantém nem deriva promise de readiness;
- o owner do READY libera a entrada do map após sucesso ou falha; isso prova apenas que um promise com falha não fica permanentemente em cache e não equivale a dizer que toda a ativação pode ser reexecutada em qualquer ponto de falha;
- o resident pool continua cobrindo eviction close de forma independente, e o `session/close` explícito mantém a semântica existente de exclusão de produto;
- desktop continuous e web remote replayable continuam escolhendo o delivery profile somente depois de a projeção estar ready.

## 5. Matriz de verificação podada

Não se enumeram todos os clientes × todos os estados de sessão. A ativação acontece antes da separação do delivery profile e, por invariante, escolhem-se amostras representativas:

| Amostra representativa                    | Foco da verificação                                                                              | Camada de evidência           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| histórico local completed + desktop continuous | rows/tool/reasoning históricos, continuação, idempotência e ausência de materialização de snapshot legacy | integração de bootstrap       |
| histórico remoto completed                | workspace identity, provider registry e continuação                                            | integração V4 cold-resume existente |
| model/thought/mode históricos             | prioridade da configuração local da sessão e do thought hint                                    | I63 / integração de bootstrap existente |
| modelo indisponível                      | fronteira de leitura/escrita do restoreWarning                                                 | integração de bootstrap existente |
| child completed                           | cold hydration do child e navegação somente leitura                                             | evidência existente SAT09     |
| mobile replayable                         | equivalente ao primeiro estado terminal completo do desktop; semântica de gap/resync inalterada   | evidência de protocolo existente PV4-06/25 |
| legacy `session/resume`                   | snapshot completo e context usage preservados                                                   | teste unitário do protocolo legacy |
| PERF03 de sessão grande                   | a ativação não constrói snapshot legacy; a cold subscription normal lê por completo as messages do parent apenas uma vez; registra a tendência | fixture de performance        |
| subscribe/query/command V4 concorrentes    | compartilham um único promise READY; zero queries e zero admissions antes do READY              | unidade/integração de bootstrap |
| falha do READY                            | command/query não entra no inbox e preserva o lifecycle error original; falha antes da entrada do record libera a entrada READY | unidade do gateway            |

## 6. Não objetivos e próximos passos

Esta rodada não trata os seguintes over-fetch adjacentes, para não ampliar a superfície de regressão:

- o `createSession` / fork registration do V4 construindo um snapshot legacy para obter poucos campos;
- o legacy continuous subscribe do Bot, o envio de anexos e a consulta de estado;
- remover o legacy `session/resume`, o `readSession` ou o schema de snapshot;
- modificar a hydration em lote do publisher, fragmentos de wire, a janela de rows ou a renderização React.

Esses caminhos devem ser migrados por chamador e manter sua própria matriz funcional, e não podem ser removidos junto com esta otimização de cold-resume.

## 7. Medições reais de 2026-07-24

Ambiente: Apple Silicon, `app-server` local em produção, um novo processo de CLI por amostra; mesmo workspace,
mesma sessão e mesma subscrita `desktop-continuous`. O grupo de controle foi compilado de forma independente a partir de um worktree detached no HEAD anterior à mudança
`e3efe9006ad7489b83d1efca917b3c0df32add69`, evitando comparar com um pacote instalado antigo ou com
código-fonte diferente. Após o aquecimento do cache de arquivos, cada execução foi feita três vezes.

fixture `sess_perf_large_20260724034221_af2e36b8`:

- 2.000 messages / 6.671 parts (cerca de 1.000 turns)
- 2.000 tool parts, 334 reasoning, 200 patch, 60 todos
- os dois grupos tiveram initial V4 physical frame de 143.690 bytes

| Implementação                                                          | Três execuções de cold process → initial frame |    Mediana |
| ---------------------------------------------------------------------- | --------------------------------------------- | --------: |
| Antes: a ativação do V4 constrói o snapshot legacy e o usage chama `readSession` de novo | 3352,1 / 3169,5 / 3070,2 ms | 3169,5 ms |
| Depois: activation-only + projeção estreita de usage                    | 2704,8 / 2701,5 / 2607,6 ms                   | 2701,5 ms |

A mediana na mesma máquina caiu **468,0 ms (14,8%)**. Anteriormente, o log de um único legacy `readSession` desse fixture ficava em
281–288 ms; a diferença ponta a ponta após a remoção dos dois full snapshots é coerente com essa ordem de grandeza. Este número serve
apenas como evidência de regressão nesta máquina e não constitui uma SLA entre máquinas.

Depois que o bundle final de produção foi reconstruído, executou-se mais três vezes usando o Agent ready como ponto de partida:

| Fronteira                                  | Três durações                |    Mediana |
| ------------------------------------------ | --------------------------- | --------: |
| subscribe após ready → initial frame       | 2040,1 / 1998,0 / 1936,5 ms | 1998,0 ms |

A notification NDJSON `v4/conversation/frame` completa (incluindo a quebra de linha) teve 143.691 bytes em todas elas, com stderr vazio. Os
aproximadamente 2,7 segundos antes medidos de process → initial frame ainda incluíam cerca de 0,69 segundo de inicialização/ready do processo e, por isso, as duas métricas são coerentes:
não se pode atribuir todo o tempo de espera à ativação de runtime ou ao snapshot legacy.

A sondagem de estágios do mesmo fixture em uma única execução mostra: leitura/decodificação das messages persistidas cerca de 56,8 ms, synth do transcript cerca de
49,9 ms, hydrate do `ProductProjection` cerca de 679,9 ms e nova leitura estreita de usage da atual lendo as messages do active-branch cerca de
60,0 ms. A sondagem vem de uma execução de diagnóstico e não é somada forçadamente item a item da tabela acima; ela representa apenas esse fixture de 2.000 messages
e não pode ser extrapolada para shapes de ticket com mais de 10.000 messages.

Em 2026-08-12, após recontar com o fixture de PERF03-E com 10.622 messages / 35.811 parts, a cold subscription normal de produção
materializa por completo as messages do parent 5 vezes; a mediana da leitura única é 385,1 ms e o custo direto das 4 leituras repetidas tem limite superior de cerca de
1540,6 ms. Depois de implementar a reutilização de escopo de operação da seção 4.1, a mediana de subscribe em processo novo → initial frame
caiu de 3991,9 ms para 2681,6 ms, uma redução de 1310,3 ms (32,8%). Ambos os grupos mantêm o frame de 158038 bytes,
29950 rows, janela de 60 rows, `toSeq=74164` e 0 running subagents. A medição completa e o ambiente estão em
[`v4-conversation-cold-hydration.md`](../performance/v4-conversation-cold-hydration.md#perf03-h-单次冷恢复物化2026-08-12).