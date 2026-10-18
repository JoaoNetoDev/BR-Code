# Lista de exclusões e reaproveitamento (registro histórico de execução)

> **Status: trajetória em nível de arquivo da migração hard-cut do V4.** Os caminhos antigos, números de linhas e "a excluir" da tabela vêm do contexto de execução de 2026-07-05 a 2026-07-06; muitos arquivos já foram excluídos, re-homed ou reduzidos, e não servem para julgar as relações de dependência atuais.
> As entradas de código atuais e as fronteiras que ainda existem estão em [README.md](./README.md) e [06-ui.md](./06-ui.md).

O caminho de execução da época era: excluir da UI as cadeias que detinham/derivavam o estado de conversation, deixando os fatos a serem fornecidos pela projection da CLI, com troca direta e sem double-write. O texto abaixo preserva as bases da exclusão, as ondas e a contabilidade de fechamento, para explicar por que os módulos V4 existentes são divididos em camadas dessa forma.

Há um único critério:

> **Todo código que "detém ou deriva estado de conversation" é excluído (a responsabilidade vai para a projection da CLI); todo código puramente de apresentação que "recebe dados e os desenha" é mantido e passa a consumir rows.**

Documentos relacionados: [06-ui.md](./06-ui.md) (design do novo store / SessionPane), [09-protocol-schema.md](./09-protocol-schema.md) (novo schema de protocolo), [08-phasing.md](./08-phasing.md) (plano de fases original; esta lista segue o caminho de "excluir e reescrever", equivalente a antecipar as ações de exclusão das Fases 3/4, sem manter mais um período de double-write da cadeia antiga).

---

## Onda 1: gerenciamento de estado de chat da UI e cadeia de montagem de eventos (exclusão total)

Substituto: projection store somente leitura por session + `apply()` (ver 06-ui.md e 09 §delta), com código novo estimado em < 1000 linhas.

> **Estado de fechamento M5② (2026-07)**: os últimos restos desta onda foram limpos — `zcodeChatMessages.ts` (3.089) +
> `zcodeChatMessageHelpers.ts` (781) excluídos (os tipos TaskChatMessage/TaskChatToolCall foram re-homed para
> `lib/taskChatMessageTypes.ts`, consumidos só em modo type-only por componentes que continuam, como
> ToolCallBlocks/PermissionDialog/treemapping); o replay das mensagens de broadcast do bot passou a ser_assumido pela projection de conversation do v4; o TreemappingPane passou a ler
> snapshot rows. As três fatias do store zustand não foram excluídas por inteiro, mas já têm toda a superfície morta
> removida (taskSlice 1.752→906 / workspaceSlice 1.223→811 / types 860→480 / selectors 403→312);
> o restante é superfície viva **não relacionada ao conteúdo de sessão**, com motivo de bloqueio de migração e prazo de morte:
> - `activeTaskId` + histórico de navegação: o v4 não tem face nativa de active-session (na camada de pane só há
>   paneLayoutStore no split), prazo de morte = v4-ização do estado selecionado do shell;
> - lista otimista/não lidas da barra lateral (optimisticTaskListByTaskId/taskUnreadByTaskId/taskListCache/
>   taskListVersion/groupedDraftTask): o sessions-index não carrega pin/archive/unread/criação otimista,
>   e continua sendo alimentado pelo zcodeTaskService(sqlite) legado mais esta camada otimista deste store, prazo de morte =completar a face de membership;
> - taskRuntimeByTaskId + taskUiByTaskId de runtime (pending de permissão/pergunta): broadcast de bot e
>   cenários multi-dispositivo de remote shard ainda escrevem (useBotBroadcastEffects/remoteWorkspaceSessionRuntime/
>   useGlobalTaskList), prazo de morte = v4-ização por assinatura das faces de bot/remote;
> - face de configuração (configOptions/slashCommands/taskConfigOptionsByTaskId/estado de troca de modelo):
>   o topic workspace-config ainda não tem renderer hook, e o catálogo de modelos do V4ComposerToolbar continua lendo deste store
>   (o cabeçalho desse arquivo declara o prazo de morte = v4-ização da face de configuração).

### 1.1 zustand conversation store (aprox. 5.072 linhas)

| Arquivo | Linhas | Descrição |
| --- | --- | --- |
| `packages/ui/src/store/zcodeSessionStoreTaskSlice.ts` | 2.086 | slice de runtime de task/session |
| `packages/ui/src/store/zcodeSessionStoreWorkspaceSlice.ts` | 1.223 | bucketing de workspace + valor único de "task atual" |
| `packages/ui/src/store/zcodeSessionStoreTypes.ts` | 961 | os tipos acima |
| `packages/ui/src/store/zcodeSessionStoreSelectors.ts` | 471 | derivados computados varrendo arrays |
| `packages/ui/src/store/zcodeSessionStoreQueueSlice.ts` | 205 | fila local do renderer (a fila da nova arquitetura está na projection da CLI) |
| `packages/ui/src/store/zcodeSessionStoreNavigation.ts` | 77 | |
| `packages/ui/src/store/zcodeSessionStore.ts` | 49 | entrada |

### 1.2 Toda a cadeia que reduz eventos em linha do tempo de mensagens (lib, aprox. 4.680 linhas)

| Arquivo | Linhas | Descrição |
| --- | --- | --- |
| `packages/ui/src/lib/zcodeChatMessages.ts` | 3.089 | a raiz do problema: reducer de eventos no renderer |
| `packages/ui/src/lib/zcodeChatMessageHelpers.ts` | 776 | |
| `packages/ui/src/lib/zcodeChatMessageCleanup.ts` | 50 | |
| `packages/ui/src/lib/zcodeTimelineIdentity.ts` | 116 | derivação de pertencimento do placement no timeline |
| `packages/ui/src/lib/zcodeTimelineRuntime.ts` | 68 | |
| `packages/ui/src/lib/taskTimelineGroups.ts` | 131 | agrupamento de turns |
| `packages/ui/src/lib/zcodeTurnSteerQueue.ts` | 149 | |
| `packages/ui/src/lib/taskStreamChunkBatch.ts` | 45 | agrupamento no cliente (a nova arquitetura proíbe uma segunda camada de merge; o único ponto de merge está no flush da CLI) |
| `packages/ui/src/lib/taskStreamMirrorGap.ts` | 61 | compensação de lacunas do mirror (a única ação para lacuna passa a ser reassinar) |
| `packages/ui/src/lib/taskRestoreRuntime.ts` / `taskRuntimeDisplayStatus.ts` / `taskRuntimePendingCommands.ts` / `zcodeTaskRuntimeMonitor*.ts` / `zcodeSessionTaskControl.ts` / `zcodeTaskMetaMerge.ts` | cerca de 1.500 no total | derivação/merge/monitoramento de runtime, todos substituídos por `control`/`availability` da projection (excluir um a um após confirmar a ausência de referências não relacionadas a chat) |

### 1.3 Cadeia de hooks de eventos de stream (aprox. 6.970 linhas)

| Arquivo | Linhas |
| --- | --- |
| `packages/ui/src/hooks/useTaskStreamEvents.ts` | 747 |
| `packages/ui/src/hooks/taskStreamEventHandlers.ts` | 1.657 |
| `packages/ui/src/hooks/taskStreamEventSnapshotSync.ts` | 955 |
| `packages/ui/src/hooks/taskStreamEventTerminalHandlers.ts` | 583 |
| `packages/ui/src/hooks/taskStreamEventConfigUpdate.ts` | 246 |
| `packages/ui/src/hooks/taskStreamEventHelpers.ts` | 196 |
| `packages/ui/src/hooks/taskSnapshotRuntimeStateSync.ts` | 204 |
| `packages/ui/src/hooks/useTaskRestore.ts` | 2.382 |

### 1.4 Hooks de negócio de chat (aprox. 7.950 linhas, reescritos em versão fina no novo modelo de command/projection após a exclusão)

| Arquivo | Linhas | Destino |
| --- | --- | --- |
| `packages/ui/src/hooks/useZCodeChatSendPrompt.ts` | 2.185 | reescrito como command `sendText` + optimistic overlay (estimado <200 linhas) |
| `packages/ui/src/hooks/useChatComposer.ts` | 2.265 | o roteamento de input (startNow/enqueue/guide) passa a ler projection.inputRouting; a parte de interação do editor entra nos componentes de input mantidos |
| `packages/ui/src/hooks/useZCodeChat.ts` | 1.274 | ciclo de vida de assinatura reescrito como `subscribe(base)` |
| `packages/ui/src/hooks/useZCodeChatHistoryActions.ts` | 951 | fork/edit viram command, disponibilidade lida de row.actions |
| `packages/ui/src/hooks/useChatTaskControlActions.ts` | 589 | stop etc. viram command, disponibilidade lida de projection.control |
| `packages/ui/src/hooks/useChatViewEffects.ts` | 353 | |
| `packages/ui/src/hooks/zcodeChatShared.ts` | 213 | |
| `packages/ui/src/hooks/useWorkspaceActiveTaskState.ts` | 180 | o conceito de "task atual global" não existe na nova arquitetura (só existe vínculo por pane) |
| `packages/ui/src/hooks/chatActionHelpers.ts` | 122 | |

### 1.5 Camada de montagem do ChatView (aprox. 11.540 linhas, reescrita como SessionPane após a exclusão)

| Arquivo | Linhas | Descrição |
| --- | --- | --- |
| `packages/ui/src/ChatView.tsx` | 1.344 | premissa de instância única, reescrito como `SessionPane` |
| `packages/ui/src/ChatView/` (47 arquivos) | 10.198 | montagem de turns (`chatViewTurnRenderUnits.ts` 427, `chatViewMessageTurns.ts` 104), placement, restauração de scroll, diagnóstico de timeline etc. são tudo excluídos; peças puramente visuais (como `ChatScrollToBottomControl`, `FlipMetricValue`) podem ser movidas para o novo pane após avaliação |

### 1.6 Stores de navegação/cache de valor único (reescritos, não mantidos como estão)

| Arquivo | Linhas | Descrição |
| --- | --- | --- |
| `packages/ui/src/store/tabStore.ts` | 564 | o valor único `activeTabId` é um obstáculo direto para o split; reescrito em duas camadas, Layout/Focus |
| `packages/ui/src/store/taskQueryCacheStore.ts` | 568 | cache da lista de tasks, substituído pelo topic `sessions-index/<workspace>` (assinatura conflated do estado mais recente) |
| `packages/ui/src/store/remoteWorkspaceSessionStore.ts` / `remotePinnedTaskStore.ts` / `remoteTimelineTaskStore.ts` | 609 | caches paralelos do cenário remote, sem razão de existir após a convergência multi-dispositivo |

**Total da Onda 1: cerca de 36 mil linhas excluídas.**

---

## Onda 2: reescrita do `@zcode/protocol`

### 2.1 O protocolo em si

| Arquivo | Linhas | Disposição |
| --- | --- | --- |
| `packages/shared/src/zcode-protocol/index.ts` | 3.788 | excluir e reescrever. O novo protocolo = envelope de frame por topic + ConversationSnapshot/Row/Delta + command/query (ver 09, 10), e ele **guarda apenas tipos de schema + funções puras de coalesce; o runtime não entra neste pacote** |

### 2.2 Tipos derivados dentro do pacote shared (sombras do protocolo antigo, tratados junto com ele)

| Arquivo | Disposição |
| --- | --- |
| `packages/shared/src/task-realtime.ts` | excluir (a semântica de owner/mirror/deliveryKind desaparece por completo) |
| `packages/shared/src/zcode-task-types.ts` | excluir/fundir no novo schema (convergência conceitual task→session) |
| `packages/shared/src/zcode-session-visible-content.ts` | excluir (a derivação de "conteúdo visível" vai para a projection da CLI) |
| `packages/shared/src/zcode-session-task-status.ts` | excluir (a derivação de status vai para projection.control) |
| `packages/shared/src/zcode-agent-model-state.ts` | avaliar: se o estado de modelo entrar na zona A da projection, excluir |

### 2.3 Raio de explosão (consumidores que precisam mudar junto com a reescrita do protocolo)

- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` e as entradas/saídas de protocolo do lado da CLI: passam a produzir frames de ProductProjection + command inbox (ponto de implementação de 02 e 03).
- Tabelas de estado de seq por cliente como `protocolEventSequences` no lado da CLI: sobem/restruturam conforme o 01-topology.
- Testes relacionados: `packages/shared/test/zcodeProtocol.test.ts`, `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol*.test.ts` etc. são reescritos junto com o novo schema; os testes de ouro (mesma sequência de eventos × os dois perfis com estado final consistente) passam a ser o tronco de novos testes.

---

## Onda 3: camadas de transporte/adaptação que morrem junto com o protocolo

Essas não pertencem a "gerenciamento de estado de chat da UI", mas são consumidoras do protocolo antigo ou implementações paralelas; depois da reescrita do protocolo não conseguem sobreviver como estão e entram no mesmo plano de execução:

| Arquivo | Linhas | Disposição |
| --- | --- | --- |
| `packages/desktop/src/main/taskRealtimeBus.ts` (+ `packages/desktop/test/taskRealtimeBus.test.ts`) | 1.056 | excluir. A camada owner/lease/mirror inteira desaparece (01-topology), e todos os clientes assinam em paridade |
| `packages/client/src/webRemoteControlRelayProtocol.ts` | 217 | excluir. O sistema inteiro fica só com uma camada de confiabilidade em nível de frame em `@zcode/rpc` (05) |
| `packages/desktop/src/main/webRemoteControlManager.ts` | 1.321 | grande mudança: remover a dupla codificação base64 e a identidade volátil bridgeSessionId, degradando para encaminhamento de bytes + agendamento de host attachment |
| `packages/web/src/main.tsx` | 2.141 | grande mudança: as três cadeias web convergem para "conectar a um endpoint" (convergência de implantação do 01) |
| `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts` | 5.871 | excluir. A razão de existir da camada de adaptação task→session (a UI antiga fala a língua de task) desaparece junto com a UI antiga. **Atenção à ordem: ela precisa estar viva até a nova UI estar disponível**, e é a última a ser excluída da Onda 3 |
| Diretório de geração do protocolo antigo | — | artefatos de build obsoletos; basta limpar e reconstruir |

`@zcode/rpc` (`packages/rpc/src`, 3.119 linhas) **não é excluído** e recebe dois patches: expor sinais de congestionamento (`unacknowledgedBytes` + `onSaturated/onDrained`) e pôr limite no buffer de replay (ver 05).

---

## Contabilidade de fechamento do M5 (versão final ③-4, 2026-07-06)

O M5 ③-4 é a onda final de fechamento das Ondas 2/3: exclui pela raiz as palavras mortas do protocolo antigo comprovadas como **sem nenhum consumidor** pelo levantamento anterior (③-2/③-3) (lista de palavras/schema/implementações da CLI/clientes de services/tipos, tudo junto), e faz uma contabilidade completa de retenção da lista de palavras do protocolo antigo. Linha vermelha de execução: antes de excluir cada palavra, reverificar com `rg -w` em todo o repositório; havendo um consumidor vivo, não excluir e entrar na conta de retenção.

### Contabilidade completa da lista de palavras (56 palavras originais → 11 excluídas / 45 sobreviventes)

**Excluídas (11 palavras, lista + schema + implementações dos dois lados)**:

| Palavra | Superfície excluída | Observações |
| --- | --- | --- |
| `session/steer` | cadeia inteira (wire/op/agentService/sessionService/stub do facade steerPrompt/tipo ZCodeTurnSteerSendResult) | o steerPrompt do adapter já retornava unsupported |
| `session/rewind` | cadeia inteira + `rewindTurn` do adapter (zero chamada em todo o repositório) | o edit/retry do v4 envia direto o slash command nativo `/rewind conversation <messageId>` |
| `session/rewindCascade` | cadeia inteira | |
| `session/previewFileRewind` | cadeia inteira + UI `MessageFileRewindDialog` excluído por inteiro, props de undo de `MessageChangeSummaryPanel` reduzidas a `onToggleFiles` | o mecanismo de core de file-rewind do workspace é mantido (consumido pelo slash command `/rewind`) |
| `session/applyFileRewind` | cadeia inteira + `toggleTurnFiles` do adapter (zero chamada em todo o repositório) | |
| `prompt/enhance` | cluster inteiro: wire×4/ops/runPromptEnhanceJob/contexto de promptEnhanceJobs/tabela de pending do agentService/`methods/prompt-enhance.ts` do core | no renderer restam apenas textos i18n e a exibição de valores históricos de modelTrajectory (inofensivos, mantidos); a lista de bypass do transport fica reduzida a apenas `session/stop` |
| `prompt/enhance/start` | idem | |
| `prompt/enhance/cancel` | idem | |
| `prompt/enhance/result` | idem (notificação + roteamento no host) | |
| `plugins/marketplace/list` | cadeia inteira (wire/op/agentService/interface) | ③-3 descobriu consumo zero; os dados de mercado na página de settings passam pela face agregada `plugins/overview` |
| `session/fork` (cadeia do cliente) | agentService.forkSession/sessionService.forkSession/tipos de interface | **legacy op + schema + wire case retidos**: o forkAssistant do v4 já não chama esse op; ele usa um stable resolver + core copy só de conversation e apenas toma emprestada o registro de child record. A data de morte do `session/fork` legado continua sendo a Onda 2 |

**Superfície morta de escrita dos caminhos marcados como mortos em ③-2, excluída na mesma onda (não são palavras da lista, mas pertencem à mesma face do protocolo antigo)**:

- Seis pass-through mortos do `zcodeSessionService`: `sendPrompt`/`compactSession`/`goalSession`/`stopSession`/`cancelBackgroundTask`/`respondPermission` (revisão de chamadas de produção zerada; o caminho de escrita dos bots passa pelo facade zcodeTaskService → comando v4, e o renderer usa dispatchCommand).
- Quatro métodos de cliente mortos do `zcodeAgentService`: `respondPermission`/`respondUserInput` (convergem para resolveInteraction do v4; o registro de requisições reversas e a difusão dos eventos permission.request/userInput.request são mantidos), `stopSession`/`cancelBackgroundTask` (convergem para stop/cancelBackgroundWork do v4; o wire case fica para compatibilidade).
- Revisão de órfãos de controle da UI antiga: `zcodeSessionTaskControl`/`zcodeBackgroundTaskControl` sem nenhum resíduo em todo o repositório (③-2 já tinha excluído tudo; esta onda apenas re-verifica).

**45 palavras sobreviventes (conta de retenção: superfície de consumo + data de morte)**:

| Grupo de palavras | Superfície de consumo (faces vivas que bloqueiam a exclusão) | Data de morte |
| --- | --- | --- |
| `session/create·resume·list·read·messages·events·subscribe·close` (8) | ciclo de vida/caminho de leitura: zcodeSessionService (recuperação de histórico/drafts do desktop), caminho de leitura replayable do adapter, último ponto de consumo de `session/subscribe` = `onDynamicTaskEvent` do adapter (marcado em ③-2) | Onda 3 (caminho de leitura v4 replayable + aposentadoria do adapter) |
| `session/send` | ramo de fallback de anexos do adapter (a superfície de comandos de upload/registro de attachmentRef do sendText do v4 ainda não foi modelada) | Onda de comandos de anexos |
| `session/stop`, `session/cancelBackgroundTask` | **os métodos de cliente já foram excluídos**; resta apenas o wire case de compatência da CLI (a lista de bypass do transport referencia sessionStop) | Removidos juntos na onda de exclusão de palavras antigas (Onda 3) |
| `session/fork` | op+schema = face de execução do fork do v4 (gancho de transição) | Onda 2 (nativização do fork record) |
| `session/compact`, `session/goal` | facade replayable do adapter (os dois conjuntos de contadores CAS, stateRevision antigo e conversation revision do v4, não são intercambiáveis; avaliação em ③-2) | Onda do caminho de leitura v4 replayable |
| `session/setModel`, `session/setThoughtLevel`, `session/setMode` | facade replayable / zcodeSessionService (o switchModelConfig do v4 não tem resolução de credenciais de runtimeModel; sobraram valores auto no setMode) (marcado em ③-3) | Onda das faces de comandos de catálogo de modelo/runtimeModel do v4 |
| `session/updateRuntimeModelConfig` | caminho quente de headers de runtime do provider (verificação de segurança de headers no período da requisição / conexão direta de provider customizado) | idem |
| `workspace/*` 6 palavras + `workspace/generateText` (7) | os workspaceModelCatalogs da CLI são a fonte de fato do runtime de workspace; a face de execução LLM de generateText está na CLI (commit message/repoWiki) (avaliação em ③-3: os comandos do domínio workspace precisam de um envelope próprio) | Onda das faces de comandos/queries do workspace do v4 |
| `mcp/list`, `plugins/*` (13) | face de capacidades de plataforma: a UI de settings consome via um service fino de plataforma (descer em ③-3), sem relação com o domínio de conversation | Reavaliação na Onda 3 (v4-ização da face de plataforma como projeto separado) |
| `usage/stats`, `session/usage` | consumo já zerado (③-3 convergiu para v4 usage query); wire case mantido para compatibilidade | Removidos juntos na onda de exclusão de palavras antigas |
| `interaction/requestPermission·requestUserInput·requestProviderRuntimeHeaders` (3) | RPC reverso: face de corrida do interaction-broker da CLI (RPC reverso legado vs resolveInteraction do v4) + caminho quente de headers de provider | Onda 2 com a face de interação totalmente v4-izada (aposentadoria do caminho reverso do broker) |

### Conta de três colunas

**① Neto acumulado de exclusões dentro do M5 (soma aproximada dos commits de exclusão após o baseline `68bc8b702`)**:

| Cluster | Commit | Exclusão líquida (linhas) |
| --- | --- | --- |
| Primeiro passo do fechamento do store M5② (clusters mortos como ChatInputToolbar/PlanModeToolPanel) | `44a8e5e5f` | −12.013 |
| Superfície morta do zcodeSessionStore M5② + corpo do zcodeChatMessages | `ac1b30356` | −11.752 |
| Caminhos mortos de useZCodeConfig/useWorkspacePrepare M5② + re-home de tipos | `e0cee071c` | −2.592 |
| Aposentar a face de mensagens de broadcast do bot M5② | `0ac436b55` | −94 |
| Órfãos de controle do protocolo antigo da UI em ③-2 | `70e887aad` | −506 |
| Varredura de onDynamicSessionEvent em ③-2 | `2e5e716c0` | −298 |
| **Esta onda em ③-4 (7 commits: enhance −1.048 / steer −288 / família rewind −1.678 / fork do cliente −93 / marketplace-list −59 / pass-through morto −704 / fechamento de comentários +4)** | `dffa71e55`…`5514e5193` | **−3.866** |
| **Total** | | **≈ −31.100 (31 mil linhas)** |

(A mudança líquida do branch inteiro `68bc8b702..HEAD` é de cerca de −3.200: as exclusões são em boa parte compensadas pelos acréscimos das novas redes formais de UI/composer/e2e do M5④⑤.)

**② Faces do protocolo antigo restantes (arquivo + linhas + data de morte)**:

| Arquivo | Linhas | Data de morte |
| --- | --- | --- |
| `packages/shared/src/zcode-protocol/index.ts` | 2.450 | exclusão completa na Onda 3 (as 45 palavras da lista estão na tabela acima) |
| `packages/shared/src/zcode-protocol-legacy-types.ts` | 559 | Onda 3 (arquivo neutro de tipos estruturais, produto do re-home de ③b) |
| `packages/shared/src/zcode-task-types.ts` + `zcode-task-types-core.ts` | 230 + 1.107 | Onda 3 (convergência conceitual task→session) |
| `packages/shared/src/task-realtime.ts` + `task-realtime-core.ts` | 177 + 474 | Onda 3 (aposentadoria do mirror multi-dispositivo de stream) |
| `packages/services/src/zcode-agent/zcodeAgentService.ts` + `zcodeAgent.ts` | 3.375 + 464 | Onda 3 (caminho de leitura/ciclo de vida/configuração/plataforma) |
| `packages/services/src/zcode-session/zcodeSessionService.ts` + `zcodeSession.ts` | 512 + 240 | Onda 3 (fechamento de ciclo de vida/desktop-continuous) |
| `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts` + `session/zcodeTaskService.ts` | 5.592 + 734 | última exclusão da Onda 3 (hospedeiro do facade replayable + do caminho de escrita dos bots) |
| `apps/zcode-cli/.../zcode-protocol/server-operations.ts` + `server.ts` + `plugins.ts` | 3.808 + 455 + 402 | Onda 3 (exclusão completa da face wire; o segmento do op fork sai antes, na Onda 2) |
| `packages/desktop/src/main/taskRealtimeBus.ts` | 1.056 | Onda 3 (a camada owner/lease/mirror inteira desaparece) |
| `packages/client/src/webRemoteControlRelayProtocol.ts` | 217 | Onda 3 |
| `packages/desktop/src/main/webRemoteControlManager.ts` | 1.373 | grande mudança da Onda 3 (encaminhamento de bytes + agendamento de attachment) |
| `packages/web/src/main.tsx` | 2.177 | grande mudança da Onda 3 (convergência das cadeias web em um único endpoint) |
| **Total** | **≈ 25,4 mil linhas** | |

**③ Prerequisitos restantes para excluir os corpos (por onda)**:

- **Resíduo da Onda 2 (fechamento das faces de comandos do domínio de sessão/interação)**:
  1. o registro de child record é reescrito de forma nativa no v4 → excluir a face de transição de registro; em seguida excluir o op legado `server-operations.forkSession`, que já não tem chamadores v4, mais o schema de fork e o wire case;
  2. aposentar os demais ganchos de transição (ensureModelReady/afterLegacyStateMutation/closeSession/createSessionRecord/resumePersistedSession/plano de dados de resolveTurnUserPrompt);
  3. modelar a face de comandos de anexos (upload/registro de attachmentRef) → excluir o ramo de fallback de anexos do `session/send` do adapter;
  4. aposentar o RPC reverso do interaction-broker (resolveInteraction do v4 como caminho único) → excluir as 3 palavras `interaction/*` e a tabela de registro de pending do host.
- **Onda 3 (troca de ponta multi-dispositivo + exclusão completa da stack antiga)**:
  5. caminho de leitura v4 replayable (store v4 no celular) → excluir a face de sessão do adapter (facade read/subscribe/compact/goal) e as palavras `session/read·messages·events·subscribe`;
  6. face de comandos de catálogo de modelo/runtimeModel do v4 → excluir setModel/setThoughtLevel/setMode/updateRuntimeModelConfig;
  7. face de comandos/queries de workspace do v4 (design de envelope próprio) → excluir as 7 palavras de workspace;
  8. migração do hospedeiro da face de capacidades de plataforma (13 palavras plugins/mcp, projeto separado);
  9. depois de tudo isso zerado: remover os wire cases de compatibilidade usage/stop/cancelBackgroundTask → lista de palavras zerada → exclusão completa de `zcode-protocol/index.ts`/legacy-types/server-operations/server; convergência de taskRealtimeBus/relayProtocol/webRemoteControlManager/web main; `zcodeTaskServiceAdapter` é o último a ser excluído.

---

## Lista de reaproveitamento mantido (não excluir)

### Componentes puramente visuais (passam a consumir rows, sem mudar de estrutura)

| Diretório/arquivo | Escala | Transformação necessária |
| --- | --- | --- |
| `packages/ui/src/components/ai-elements/` | 59 arquivos / 15.397 linhas | retirar o pouco acoplamento ao store: `message.tsx` (3 pontos), `mermaid-block.tsx` (2 pontos), passando a receber por props |
| `packages/ui/src/ToolCallBlocks/` + `ToolCallBlocks.tsx` | 25 arquivos / 6.237 linhas | retirar `renderers/EditInlineDiffContent.tsx` (3 referências a store); a entrada vem da row de toolCall |
| `packages/ui/src/ChatMessage/` + `ChatMessage.tsx` | 3.228 linhas | retirar `AssistantMessage.tsx` (1 referência a store); props passam de turn units para row |
| `packages/ui/src/chatMessageParts.tsx` / `chatMessageHelpers.ts` | 234 linhas | manter |
| `packages/stream-animate/` | 1.779 linhas | manter, como ponto de chegada da renderização incremental de markdown em streaming (orçamento de performance do 06) |

### Editor de input e estado local de UI (mantidos, com ajuste semântico)

| Arquivo | Descrição |
| --- | --- |
| `LexicalChatInput.tsx`, `SlashCommandPlugin.tsx`, `mentions/`, `chat-input-toolbar/`, `ChatInputToolbar.tsx` | o editor em si é estado local de UI, mantido; a ação de envio vira command |
| `lib/chatComposerDraftStorage.ts` | mantido, drafts armazenados por sessionKey (tabela de posse de estado local do 06) |
| `lib/chatSessionScrollMemory.ts` | mantido, a posição de scroll passa a ser armazenada por paneId |
| `lib/chatAttachments.ts`, `ChatMediaAttachmentPreviewDialog.tsx` | mantidos |
| `PermissionDialog.tsx`, `ElicitationDialog.tsx` | aparência mantida; a fonte de dados passa a ser `projection.pendingInteractions` e a resposta vira o command `resolveInteraction` |
| `QueuedPromptList.tsx`, `TodoPanel.tsx`, `MessageChangeSummaryPanel.tsx` e outros painéis | aparência mantida, fonte de dados trocada por projection |

### Stores sem relação com conversation (não tocar)

`mcpStore*`, `pluginStore`/`pluginManagementStore*`, `skillStore`, `subagentsStore`, `commandsStore`, `hooksStore`, `whiteboardStore`, `alertDialogStore`, `confirmDialogStore`, `codeCommentPreviewStore`, `modelTrajectoryStore` estão todos fora do escopo desta vez.

---

## Disposição dos ativos de E2E e de teste (rede de documentos de conversation session)

A rede de documentos de conversation session existente tem duas camadas, e seus destinos sob o hard cut são completamente diferentes. **O critério: a camada semântica que descreve "como o produto deveria ser" é independente de implementação e sobrevive inteira, ganhando valor; a camada de verificação que descreve "como provar que ele realmente é assim" está presa ao DOM da UI antiga e é invalidada em massa e reconstruída.**

### Camada semântica: sobrevive e vira matéria-prima direta dos testes de ouro

| Documento | Disposição |
| --- | --- |
| `docs/conversation-session-case-catalog.md` (casos do caminho principal A–J) | **mantido, autoridade inalterada**. O catalog declara explicitamente "não se baseia na implementação de código atual", e o reducer da CLI do v4 precisa fazer todos esses casos valerem. Novo ganho: nos casos, muitos "combinação de estado → comportamento esperado" podem ser **descidos para o nível de golden tests do ProductProjection da CLI** (entrada de sequência pura de eventos, saída de asserções de projection, sem GUI); só os casos de interação/apresentação ficam na camada WDIO — essa é a primeira fonte de material do conjunto de golden tests do 02-projection |
| `docs/conversation-product-state-space.md`, `docs/conversation-protocol-declaration.md` | mantidos. São os documentos-fonte do product-protocol, a cadeia de rastreabilidade semântica do v4 |
| `docs/testing/conversation-session-decision-backlog.md` + `decision-answers*.md` | mantidos. As decisões das quatro fronteiras PB-* passam por esse processo de worksheet (concluídas antes da Fase 1) |
| `docs/testing/conversation-session-environment-fault-catalog.md` | **mantido e conectado às duas lacunas do v4**: ele é a matéria-prima do design-review G-12 (tabela de enumeração de reasonCode `fault.*` / `SessionErrorInfo.code`) e também a lista de injeção de falhas do dispositivo determinístico de caos de rede E-01. Ao definir as novas enumerações de erro do protocolo, use este material e não comece do zero |
| Matrizes cruzadas como `conversation-session-fork/tool/goal-*-cross-product-matrix.md` | manter a dimensão de casos (a enumeração de combinações e as conclusões de poda são semântica de produto); as colunas de evidência de cobertura são zeradas junto com a camada de verificação |

### Camada de verificação: invalidada junto com a UI antiga, reconstruída pela nova arquitetura

| Ativo | Disposição |
| --- | --- |
| `packages/desktop/test/e2e/conversation-session/` (41 specs) + `manual-review/pending/` (11) | depois que a UI antiga é excluída, todas as asserções de DOM/testid ficam inválidas. **Não excluir os arquivos; migrar todos de uma vez para o semântico de manual-review** (reaproveitando o mecanismo de degradação já existente de "automação + review humano"): no momento da exclusão da Onda 1, marcar também como pending os specs do diretório principal e, quando o novo UI estiver disponível na vertical, reescrever um a um conforme o catalog e devolver |
| `docs/conversation-session-ui-testid-contract.md` | **reeditado** para a nova UI do SessionPane: depois da pane-ização o protocolo de localização precisa ganhar a dimensão paneId (com a mesma session em dois panes, o testid deixa de ser globalmente único). Essa é um contrato que precisa ser definido já no esqueleto da nova UI e não pode ficar para a fase de testes |
| `docs/conversation-session-validation-matrix.md`, `docs/testing/conversation-session-e2e-coverage-matrix.md` e as várias matrices de cobertura específicas | a coluna de casos é mantida e **a coluna de evidência de cobertura é zerada e reconstruída** (as marcações de covered das specs antigas deixam de valer). Na reconstrução, registrar o tipo de evidência nas duas trilhas golden tests/WDIO |
| `docs/testing/conversation-session-docker-automation-plan.md`, `manual-e2e-ci.md`, `e2e-development-workflow.md` | a metodologia é mantida (replay fixo, isolamento por Docker e o processo de promoção por manual-review valem igualmente para a nova UI); os caminhos e as definições de portão são atualizados junto com o novo diretório de specs |

### Restrições de workflow (inalteradas)

O workflow existente de E2E relacionado a conversation continua valendo: **antes de escrever qualquer caso novo, complete primeiro o case catalog e a matriz de cobertura, faça a poda com base nos casos existentes e nos estados confirmados pelo usuário, e só escreva o código de teste depois de confirmar a semântica do produto**. Os novos golden tests do v4 (camada de reducer) passam pelo mesmo processo — eles apenas trocam a forma de prova de asserção de GUI para asserção de projection, e a origem semântica dos casos não muda.

## Ordem de execução e salvaguardas

> A versão autoritativa do ritmo de execução são os milestones M0–M5 de [08-phasing.md](./08-phasing.md) (os passos 1–6 desta seção correspondem a eles: passo 1≈M1, 2≈M2, 3–4≈M3, 5≈M4/M5). As ações de exclusão da Onda 1 acontecem no branch M3; as Ondas 2/3 acontecem no M5.

1. **Estabelecer primeiro o novo protocolo**: landing do novo schema de `@zcode/protocol` + funções puras de coalesce + testes de tipo conforme 09/10 (nesse momento novo e velho coexistem e o código antigo ainda não foi excluído).
2. **CLI produz a projection**: reducer de ProductProjection + command inbox + `subscribe(base)` (02/03/04), com todos os golden tests passando.
3. **Começar pelo esqueleto da nova UI**: SessionDataLayer + `apply()` + Timeline de pane único (scroll virtual) rodando primeiro uma fatia vertical completa de "assinatura → render → envio".
4. **Excluir a Onda 1**: depois que a nova fatia vertical estiver disponível, excluir em lote as cadeias antigas da UI (itens 1.1–1.6 desta lista) e, no mesmo lote, retirar as referências a store dos componentes mantidos.
5. **Excluir as Ondas 2/3**: excluir o corpo do protocolo antigo e os tipos derivados, convergir o transporte; `zcodeTaskServiceAdapter` é o último a ser excluído.
6. Depois de cada onda de exclusão, rodar `pnpm typecheck && pnpm lint`; o e2e de conversation segue a seção "Disposição dos ativos de E2E e de teste" — a semântica do case catalog não muda, as specs antigas são rebaixadas a manual-review com marcação explícita (sem pulo silencioso), e as novas evidências são reconstruídas nas duas trilhas golden tests/WDIO.

Aviso de risco: este caminho abandonou o período de double-write do 08-phasing, e entre a exclusão da Onda 1 e a disponibilidade da nova UI o chat do desktop fica indisponível, **então precisa ser concluído em um branch independente até a fatia vertical estar disponível e só então fazer o merge**; o controle remoto do celular e a web permanecem com a cadeia antiga intocada até a conclusão da Onda 3.