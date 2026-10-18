# Auditoria estática de vazamento de memória (2026-09-03)

Contexto: o usuário relatou crescimento contínuo de memória no desktop. Esta auditoria fez uma varredura estática somente leitura de todo o repositório, dividida em 6 trilhas por fronteira de processo (desktop main/host, services, UI store/hooks, componentes de UI, agent CLI, rpc/server/shared), totalizando cerca de 900 mil linhas de código-fonte (sem testes). Cada achado teve seu contexto lido para confirmar a ausência de caminho de limpeza; ocorrências de grep puro não foram incluídas; os itens marcados com ✔ foram reconfirmados pelo revisor principal no código-fonte.

A conclusão da auditoria apenas localiza riscos e não contém mudanças de código. Antes da correção é preciso confirmar as escolhas de design no nível da spec (ver «Questões de design que exigem decisão»).

## Perspectiva de processo: onde a memória cresce

```
 Renderer (cada janela)                Local Host (cada janela)             Agent CLI (cada workspace)
 ┌──────────────────────┐         ┌──────────────────────┐        ┌──────────────────────────┐
 │ shiki tokensCache    │         │ bots watchTaskStream │        │ InMemorySessionEventStore│
 │ cache de snapshot de │         │ pty / fs.watch       │        │   um evento por token    │
 │ task                 │         │ pendurados           │        │   cópia O(n) no append   │
 │ rows.window só       │         │ estado espelhado     │        │ publisher de subsessão  │
 │ cresce               │         │ por sessão           │        │ nunca é liberado         │
 │ buckets de workspaces│         │ handle de desconexão │        │ backgroundTasks/registry│
 │ nunca são removidos  │         │ remota não liberado  │        └──────────────────────────┘
 └──────────────────────┘         └──────────────────────┘
 Main (singleton)
 ┌────────────────────────────────────────────┐
 │ listener will-download pendurado na         │
 │ defaultSession, vaza a cada fechamento     │
 │ TaskRealtimeBus.streamBatches não-terminal  │
 │ nunca é removido                            │
 │ assinatura de cron em estado terminal /     │
 │ interval de heartbeat pode residir para     │
 │ sempre                                      │
 └────────────────────────────────────────────┘
```

## 1. Alto risco (cada item explica sozinho o "crescimento contínuo")

### CLI-H1 ✔ session de produção usa event store em memória, eventos por token permanecem para sempre, append copia tudo

- `apps/zcode-cli/packages/adapters/src/storage/index.ts:26-60`: `eventsBySession: Map<SessionId, SessionEvent[]>`, o `append` faz `set(id, [...events, storedEvent])`, cópia O(n); só `deleteSession` consegue apagar, e core/bootstrap não tem nenhum chamador.
- `bootstrap/src/zcode-protocol/server-operations.ts:3493`, `bootstrap/src/app/create-app.ts:558`: cada record de sessão de protocolo cria um `createInMemorySessionEventStore()`.
- `core/src/runtime/methods/model-streaming-event.ts:11-12` → `events.ts:101`: cada delta de `ModelStreaming` e cada `ToolCallProgress` entram no store; compact (`core/src/compact`, `core/src/context`) não referencia o eventStore e portanto não faz trimming.
- Crescimento: uma entrada por token / por tool progress, que só cresce enquanto a sessão reside; `[...events, x]` cria lixo efêmero O(n²) que agrava o GC; `rebuildProjection()` (`message-persistence.ts:509`) faz reduce completo desse array em vários pontos dentro do turno.
- Atenção: o comentário em `events.ts:79-82` explica que o live sink depende do `sequenceNumber` preenchido pelo eventStore como única fonte de ordem, então "eventos transitórios fora do store" exige também garantir a atribuição de seq — é uma mudança de design.

### CLI-H2 O publisher V4 da subsessão de subagent nunca é liberado

- `bootstrap/src/zcode-protocol/server-operations.ts:3225` roteia eventos de sessionId filho para `v4Gateway.ingestDetachedLiveSession` (`v4-gateway.ts:810-816`), criando para o id filho um `ConversationTopicPublisher` (projection completa + log de 2000 entradas), `rawSequenceStates`, `detachedLiveSessions` e o normalizador de telemetry.
- O único caminho de liberação `cleanupSessionRuntime(sessionId)` (`v4-gateway.ts:1988-2041`) tem todos os chamadores passando o id pai, e não existe mapeamento pai→filho.
- Crescimento: cada execução de subagent vaza um conjunto inteiro de publisher, que continua residindo até a saída do processo mesmo depois de a sessão pai fechar ou ser desativada. Viola a 5ª invariante de `docs/session-idle-deactivation.md`.

### UI-H1 ✔ cache de tokens do shiki sem limite, e a pré-visualização de Edit em streaming grava uma entrada por chunk

- `packages/ui/src/lib/shikiHighlighter.ts:59` `tokensCache`, escrito em `:173`, sem delete/clear/limite em todo o arquivo. A key contém `code.length + os 100 primeiros e últimos caracteres`.
- Cadeia de chamadas `ToolCallBlocks/renderers/edit.tsx` → `EditInlineDiffContent.tsx:77` → `highlighted-lightweight-diff-preview.tsx:66`; `fileSummaries.ts:234-238` monta o diff na hora a partir de `input.old_string/new_string`; na projeção em streaming das entradas de ferramenta cada chunk gera um patch novo com key nova, cada estado intermediário é tokenizado e cacheado para sempre. Um único item pode ter até 120 mil caracteres, `tokens` é um array bidimensional de ThemedToken, com volume várias vezes maior que o texto de origem.
- Duas trilhas de auditoria da UI apontaram independentemente o mesmo item.

### UI-H2 ✔ cache de snapshot de task em memória sem limite

- `packages/ui/src/hooks/useZCodeTaskService.ts:15-18`: `snapshotCacheByService: WeakMap<service, Map<key, {etag, snapshot}>>`, cuja key externa é um singleton de nível de app, ou seja, permanente; o value interno é um `ZCodeTaskSnapshot` completo (com messages). Só é removido em `:276` quando o snapshot vem vazio. A camada persistente no mesmo arquivo tem três limites (20 itens / 2MB / 256KB), a camada em memória não tem nenhum.
- Crescimento: +1 a cada task aberta, +1 a cada mudança de messageLimit/model/thoughtLevel na mesma task.

### MAIN-H1 ✔ listener `will-download` pendurado na defaultSession de nível de processo, vaza sempre ao fechar a janela

- `packages/desktop/src/main/browserView/browserGuestManager.ts:2931-2932`, `:3651`, `:3661`. O webview não define partition (não há `partition` no arquivo), logo `guest.session` é a `defaultSession`. Em `detachGuest` há `if (!guestDestroyed) tab.downloadCleanup?.()`; com o guest já destruído isso é pulado, e depois o `finally` define `downloadCleanup` como undefined, sem nova chance de limpeza.
- `index.ts:2388` `win.on("closed") → closeWindow()` sempre ocorre (quando a janela fecha o guest já foi destruído junto com o embedder). Cada janela fechada vaza N closures (N = número de tabs), e as closures seguram tab/owner/manager; acima de 10 isso dispara `MaxListenersExceededWarning`.
- Correção: em `setupDownloadTracking`, capturar primeiro `const guestSession = guest.session` e usar essa referência no `removeListener` do cleanup, chamando `detachGuest` incondicionalmente.

### MAIN-H2 ✔ `TaskRealtimeBus.streamBatches` nunca é removido para runs que terminam em estado não terminal

- `packages/desktop/src/main/taskRealtimeBus.ts:129`; o delete ocorre só em `:508` e `:532`, e ambos exigem `event.terminal`; `releaseLease` (`:353`)/`releaseLeasesForHost` (`:369`) apenas fazem `flushBatch`, sem remover; `unregisterHost` não toca nisso.
- No lado do host, `host/index.ts:1297-1310` libera o lease incondicionalmente no `finally`, de modo que interrupção/cancelamento/exceção em `sendPrompt`/desconexão remota não produzem evento terminal.
- Crescimento: cada run que termina em estado não terminal vaza um `PendingStreamBatch` (limite de replay de 60 batches / 512KB); `registerHost` / `updateHostWorkspaceKeys` (`:739`) percorre todos os batches residuais para reenviá-los ao novo host, e quanto mais janelas se abrem mais isso acumula.

### SVC-H1 ✔ o estado por task de `watchTaskStream` dos bots só é liberado por evento terminal dentro do stream

- `packages/services/src/bots/botsService.ts:762` `streamSubscriptions`, `:777` `runningTasks`, `:778` `liveStatusProgressByTaskId`, `:772-776` `typingTargets/typingIntervals`; o único ponto de liberação é `:4827-4877` (`task_complete`/`task_error`) e o dispose completo em `:7416`. `streamSubscriptions.delete` aparece em todo o arquivo apenas em `:4877`.
- Caminhos sem liberação: em `:5643-5661`, a falha do prompt só remove `runningTasks`; desconexão do workspace remoto ou reinício do host remoto faz o terminal nunca chegar; exclusão da task pela UI, crash do CLI; erro em `writeContext` em `:4833` pula o dispose.
- Objetos que vazam: a assinatura do stream + a closure inteira `handleStreamEvent` (com todos os `assistantParts`, o Map de `toolCalls`, `streamingCardBlocks`). O `setInterval` de typing do Telegram/WeChat em `:2727-2732` faz requisições de rede a cada 4s e nunca para.

### SRV-H1 `remoteConnections` do web server e RemoteConnection nunca são liberados

- `packages/server/src/http.ts:116, 336-355, 405-431`: `POST /api/connect-remote` sobe o subprocesso SSH/Docker/WSL e depois faz `set(id)`, sendo removido apenas quando `/ws/remote/:id` consome o id, sem TTL. Depois de consumido, `socket.onClose` (`:109-112`) nunca chama `connection.dispose()` (`remote/connect.ts:295`), e o subprocesso do server remoto, o ChannelClient de stdio e os listeners de stderr se acumulam a cada sessão remota web.

## 2. Risco médio

### Causa estrutural A: falta na camada de services de "recuperação por vínculo de conexão" ✔

`packages/rpc/src/ipc.ts:137-141` faz apenas `channelServer.dispose()` na desconexão; em services/desktop/server não há nenhum uso de `onDidRemoveConnection`. Todo recurso de nível de SO criado via RPC que não seja Event e armazenado por id em um registro fica pendurado após a desconexão anormal do cliente:

- `terminal/terminalService.ts:325, 393-401`: Map `terminals` + subprocesso shell do node-pty.
- `fileWatcher/fileWatcherService.ts:40, 108-115`: Map `watchers` + `FSWatcher` (escuta recursiva de `.git`) + timer de debounce.

### Causa estrutural B: falta na camada de services de limpeza na fronteira "sessão em estado terminal / close"

Vários conjuntos de estado espelhado por sessão/por task em `zcodeAgentService` / `zcodeTaskServiceAdapter` só são limpos na troca do workspace client ou no dispose completo; `closeSession`/`closeTask`/`deleteTask`/`session.removed` não tocam em nada disso:

- `zcode-agent/zcodeAgentService.ts:1385, 2119-2137` `sessionEventSequenceStates` (limite de 10 mil ids por entry, cerca de 1~2MB por sessão movimentada).
- `:1388-1389` `pendingPermissions`/`pendingUserInputs` são apenas escritos, nunca lidos (vazamento de código morto, uma entrada por requisição de permissão).
- `:1333, 1879-1888, 2107-2117` `sessionEmitters` só cresce, e `emitWorkspaceEvent` faz varredura linear de toda a tabela; no mesmo arquivo, `pluginOperationProgressEmitters` já se autolimita com `onDidRemoveLastListener`, e pode servir de modelo.
- `:1398-1399` `runtimeModelConfigBySessionKey`, `:1444` `sessionTraceIdBySessionKey` (cada `listSessions` despeja o histórico inteiro do workspace).
- `zcode-agent/zcodeTaskServiceAdapter.ts:263, 512-530, 553-575` host commands que falharam permanecem para sempre em `runtimeCommands` (incluindo content + anexos base64) e deixam a task permanentemente "ativa".
- `:269, 994-1010, 4344-4353` `toolProjectionMemoryByTaskKey` segura a entrada completa da ferramenta (Write/Edit do arquivo inteiro) e só faz forget quando o resultado da ferramenta chega; `clearToolProjectionMemory` (`:1008`) é código morto.
- `:259-272` `taskEmitters`/`globalTaskEmitters`/`overlays`/`taskTargets`/`apiRetryByTaskKey`/`backgroundTaskControlsByTaskKey`/`legacySnapshotTaskKeys` só são limpos por disposeAll.
- `:267-268, 595-598` o adapter não assina o lifecycle do runtime; após um crash do CLI `activePromptInputIds` fica para sempre, `drainRuntimeCommands` sempre retorna cedo e os comandos enfileirados continuam acumulando.

### Causa estrutural C: falta da mensagem "workspace local fechado" de main→host

- `host/windowHostControllerService.ts:278-329`, `host/index.ts:1178-1210, 1370-1390, 2693-2696`, `hostRemoteWorkspaceProxyState.ts:38-70`: `removeSource/disconnectSource` só atua no caso remote; a source de workspace local (três metas de task + assinatura de eventos + observer de sessions-index) e `taskMetaById` nunca são removidos.

### Demais itens de risco médio

| Local | Problema |
| --- | --- |
| `host/windowRemoteConnectionRegistry.ts:390-411` | após uma desconexão remota inesperada, `handleConnectionClosed` não chama `disposeEntry`, e o ServiceCollection/backend SSH inteiro fica retido até o usuário fechar a tab |
| `host/index.ts:791-840, 552-578`, `host/cronRunLifecycle.ts:40-58` | a assinatura de cron/off-peak em estado terminal só é liberada quando `inputId === traceId`; exclusão de sessão, crash do agent e prompt concorrente sobrescrevendo inputId nunca acertam; o run manual ainda adiciona um interval de heartbeat SQLite de 60s |
| `main/browserView/browserPlaywrightLocatorExecutor.ts:1114-1155` e afins | cada comando CDP cria um novo V8 context com `Page.createIsolatedWorld` e reinjeta todo o runtime do Playwright; em SPA sem navegação isso acumula continuamente (memória do renderer guest) |
| `main/browserView/electronBrowserWebmRecorder.ts:286` | cada gravação usa `session.fromPartition(nome aleatório)` e a partition do Electron não tem API de destruição |
| `main/cuaPermissionDragPanel.ts:128-183`, `desktopCuaPermissionIpc.ts:194-222` | um `show()` atrasado após `destroy()` recria BrowserWindow + interval de 150ms, e ninguém mais destrói |
| `main/appTelemetryRuntime.ts:34,85` | `rendererContexts` só cresce em `webContents.id`, sem remoção |
| `main/desktopHostProcess.ts:695-731` | no reload-respawn o callback de saída do host antigo se desregistra por key compartilhada e remove o host novo por engano (defeito de correção) |
| `bots/botRemoteWorkspaceBridge.ts:56, 208-244, 268-276` | `runtimeServicesByWorkspaceKey` não é invalidado nem na desconexão nem na reconexão, os pendentes nunca são resolvidos e o dispose faz clear sem resolver |
| `ui/v4/conversationProjectionStore.ts:696-704` + `shared/zcode-protocol-v4/apply.ts:78-83` | durante o live, `rows.window` só cresce, cada delta copia o array inteiro e faz O(N) findIndex; `loadAllOlder` (`:1018-1150`) em tela larga mescla o histórico inteiro na window |
| `ui/store/zcodeSessionStore.ts` + `tabStore.ts:346` | o bucket `workspaces[workspaceKey]` não tem nenhum caminho de remoção em todo o repositório; `remoteTimelineTaskStore`/`remotePinnedTaskStore` têm `clearWorkspace` mas sem chamadores |
| `ui/store/taskQueryCacheStore.ts:472`, `hooks/useWorkspaceTaskLists.ts:320-322` | a queryKey contém `limit::version`, e cada bump/expandir mais adiciona uma key sem remover a antiga |
| `ui/v4/windowControllerTaskListRegistry.ts:78, 218-228` | `queryCache` cacheia o resultado inteiro com key contendo o termo de busca, e cada tecla digitada na caixa de busca soma +1 |
| `ui/feedback/feedbackSubmissionJob.ts:115, 410` | jobs que falham nunca são removidos e seguram screenshot base64 ×2 |
| `ui/v4/telemetry/ConversationTelemetryAttachment.tsx:222-240` | efeito colateral de acquire dentro de `useMemo`; renderizações descartadas não têm release correspondente, o refCount fica sempre >0 e o supervisor não consegue liberar |
| `ui/terminal/sidePaneTerminalSessionRegistry.ts:58` | instâncias xterm permanentes sem limite; no estado detached a saída do PTY continua indo para o scrollback (comportamento por design, mas consome memória continuamente) |
| `rpc/src/channelServer.ts:224-248, 270-277` | `pendingRequests` (com argumentos) de channels não registrados não são removidos no timeout; quando o host remoto não registra channels como `cuaPermissionService`, cada chamada soma +1 |
| `rpc/src/channelClient.ts:151-178` + `proxy-channel.ts:131-132` | handlers de evento são registrados já na criação, e o Proxy cria um novo a cada acesso a `service.onXxx`; há ainda um defeito de correção em que "cancelar a assinatura e assinar de novo não recebe eventos" |
| `rpc/src/ipc.ts:119-145` | `IPCServer.disposables` só cresce por conexão e nunca diminui (atualmente sem chamadores em produção, latente) |
| `web/src/main.tsx:1865-1881, 2200-2232` + `client/src/websocket.ts:102-105` | na troca de bridge do lado Web o ChannelClient não tem handle de dispose, e o RPC in-flight nunca é resolvido; o problema equivalente no desktop já foi corrigido (comentário em `messageport.ts:19-24`), mas o web não foi sincronizado |
| `rpc/src/remote.ts:294-321` + `persistent-protocol.ts:151-162, 274-285` | a reconexão não fecha o socket antigo, pode haver várias cadeias de reconexão concorrentes e, após a falha, os dois intervals continuam rodando (atualmente sem chamadores em produção) |
| `shared/zcode-protocol-v4/wire-assembler.ts:146, 465-491` | o tombstone `settledByRoute` não tem limite e o chamador nunca faz `discard()` |
| `cli adapters/src/exec/node-execution-adapter-base.ts:32` | `backgroundTasks` nunca é removido, e cada entrada guarda o stdout completo (30K–150K caracteres) + AbortController |
| `cli core/src/runtime-task/registry.ts:97-137` | subagent/Workflow em estado terminal mantêm `output` + `prompt` completos; `removeRuntimeBackgroundTask` retorna undefined para `Agent`, então `local_agent` nunca é removido |
| `cli core/src/tool/executor/background-tasks.ts:311, 250-301` | um `setInterval` de 1s por tarefa em background e retentativas infinitas quando o emit falha; `ToolExecutorImpl` não tem dispose e pode prender o runtime inteiro no fechamento da sessão |
| `cli core/src/tool/executor/impl.ts:57` + `handlers/read.ts:366` e afins | `readFileState` guarda o texto inteiro, com key = path+offset+limit, limpo apenas no compact |
| `cli bootstrap/src/zcode-protocol-v4/persistent-command-index.ts:41,97` | `sessions` não é limpo no close/na desativação, e o LRU descrito no comentário não existe |
| `cli v4-gateway.ts:1955-1960` | `disposeSession` passa `clearCommandInbox: false`, deixando 512 buckets de ack por sessão fechada |
| `cli server-operations.ts:1861` + `session-residency.ts:79` | `legacyStreamSubscribed` nunca é limpo depois de definido (não há RPC de unsubscribe), e o desktop ainda usa esse caminho (`services/.../zcodeTaskServiceAdapter.ts:3306`); quando ele é atingido, o record inteiro nunca é desativado, o que, somado ao CLI-H1, se torna crescimento contínuo |

## 3. Baixo risco (resumo)

- main: o tombstone `closedTabIds` não tem limite; `closeWindow()` contorna `closeTab()` e deixa tabelas de downloads/scope para trás; `sessionRoutes` não é removido no fechamento da sessão; o `PendingConnect` de `desktopRemoteSessions` não tem timeout; `webRemoteControlManager.stopWindowRuntime` não remove `availableTasksByWindowId`; o emitter não assinado de `promptAttachmentTransferService` resida para sempre; requisições pendentes host→main não têm timeout; `hostLogRelay.rawLogs` é ilimitado antes do primeiro log estruturado; `fetchRemoteAppConfig` não tem timeout nem limite de tamanho; `applicationIcons` cacheia null permanentemente.
- services: o cleanup de `ZCodeAgentProcessManager.ownedProcesses` falha e mantém o registro para sempre; `attachmentFlowRoutes` não remove em commit/abort; o syncer não tem entrada de liberação do estado por workspace; `workspaceProviderRegistryByKey` só cresce; no feedback, `uploadOssForm` não tem listener de erro e a Promise nunca é resolvida; no feishu, `typingReactionIds` de módulo só é removido após DELETE bem-sucedido e `userDisplayNameCache` não expulsa; `bindCodes`/`recentRemoteReconnectAtByKey` não são aparados; `cuaOperationTurnTracker.lastSeqBySession` não é limpo no fechamento da sessão; `featureGates` acumula por apiKey.
- ui: os três Map refs de `useComposerAttachments` não têm limpeza no unmount (uploads em voo não são abortados); `conversationProjectionStore.close()` não limpa listeners/snapshot; `optimisticCommands` sem sendText não tem TTL; `useRemoteConnectionLogs` sem limite; a key de `workspaceHomePathCache`/`statusCache` contém id de reconexão; `ToolLayout.toolLayoutOpenState` é ilimitado; o blob/Abort da pré-visualização de PDF em `ConversationRowView` não tem limpeza no unmount.
- cli: o `sleep()` normal não remove o listener de abort no despertar; `seqBySourceEventKey`/`streamedToolCallIdsWithInput` dentro do record de protocolo são ilimitados; `RawSequenceState.seenEventIds/appliedEventIds` são ilimitados; em `waitForBackgroundTask` sobra uma continuação após o abort; o `requestClient` reproduz cerca de 360 pending keys por hora; os registros de falha de amostragem da telemetry MCP não são liberados; a closure de `node-repl` prende o primeiro context.
- rpc/shared: o filter de `getChannel` deixa listeners pendurados quando não há correspondência; `EventMultiplexer.disposables` não remove na desconexão; `CancellationTokenSource` só faz cancel, sem dispose.

## 4. Áreas confirmadas como limpas (cobertura)

- main: Map de nível de janela removidos uniformemente em `browser-window-created → closed`; listeners por host desaparecem com o UtilityProcess; claims do BroadcastHub têm TTL + limite; as demais tabelas do TaskRealtimeBus têm timeout/limite; amostras da família de telemetry têm limite; timers de autoUpdater/OAuth/CUA/webRemoteControl são pareados; os 36 `on*` do preload retornam todos função de cancelamento; em todo o escopo não há `setMaxListeners` nem `fs.watch`.
- services: pending de `zcodeStdioTransport`/`zcodeProtocolClient` é deletado em todos os caminhos; o cleanup da tabela principal de `zcodeAgentProcessManager` é completo; `zcodeAgentConnectionScope` tem limite duplo de 1024 quadros/32MiB; o coalescer é limitado; git/process/repo-snapshot/repo-wiki/telemetryCore/settings-sync/plugin-sync/model-provider fazem cleanup em finally; `node.ts` tem disposeAll cobrindo tudo.
- ui: `logger.ts` não faz buffer; texto em streaming é concatenação de string e não guarda array de chunks; `removeTaskState` remove por completo as 7 subtabelas; virtualização de timeline + cache de altura de linha LRU de 4000 entradas; todos os Observers fazem disconnect; createObjectURL tem revoke pareado, exceto na pré-visualização de PDF; cache do streamdown de 100 entradas; registro `v4` tem dispose após keep-warm; `pendingCommandRegistry` com TTL de 24h.
- cli: `SessionResidentPool` tem quatro caminhos de remoção completos (mas a condição eligible fica presa pelo legacy subscribe, ver a tabela de risco médio); providers em streaming não guardam chunks SSE, e abort listener/linked controller são limpos em finally; http tem `maxResponseBytes` + `reader.cancel`; telemetry tem `maxActiveCalls=1000`, fila OTLP 2000 e trace writers 5000; lease MCP por sessão fecha em 30s ao chegar a zero; saída do Bash em foreground é limitada e `activeExecutions` é limpo em finally; abort/watchdog do subagent runner têm dispose em todos os caminhos.
- rpc/server/shared: `ChannelClient`/`ChannelServer` têm quatro caminhos de remoção na tabela principal; os middlewares Logging/NetworkTelemetry são sem estado; `PersistentProtocol` tem limite duplo de replay de 8MiB/45s; `hostCapability` do server tem TTL; o dispose de `remote/connect.ts` é completo; o controle remoto web tem 6 timers pareados e `pairedWaiters` é removido em todos os caminhos; o bootstrap do renderer retorna cleanup em tudo.

## 5. Questões de design que exigem decisão (definir antes de corrigir)

1. **Responsabilidade do event store da CLI**: `ModelStreaming`/`ToolCallProgress` devem entrar no store? Se não entrarem, o `sequenceNumber` do live sink precisa ser atribuído por outro caminho (o comentário em `events.ts:79-82` deixa claro que o seq só pode vir do store). Alternativa: entrar no store e descartar os eventos transitórios em `ModelComplete`/`ToolCallResult`, além de mudar o append para push no lugar.
2. **`session/subscribe` legacy prendendo a residência**: é preciso adicionar uma RPC de unsubscribe legacy, ou limpar a flag quando a conexão do consumidor cair; caso contrário o `SessionResidentPool` é inútil para as sessions que o desktop já abriu.
3. **Mensagem de fechamento de workspace local main→host**: `HostMessageTypes` precisa de uma nova entrada que limpe de uma vez o source do controller, o `workspaceProxyState` e o `workspaceTaskTracker`, e a camada de services precisa ganhar as fronteiras `forgetSessionState(sessionKey)` / `forgetTaskState(taskKey)`.
4. **Recuperação de RPC por conexão**: os services devem assinar uniformemente `IPCServer.onDidRemoveConnection` para recuperar pty/fs.watch, ou recursos sem assinante devem ganhar um timeout de ociosidade.

## 6. Ordem sugerida de correção

1. Nível de uma linha, sempre vaza: MAIN-H1 (will-download), MAIN-H2 (streamBatches), UI-H1 (LRU do shiki), UI-H2 (LRU de snapshot).
2. `releaseTaskWatch` unificado nos bots + limite no interval de typing (SVC-H1).
3. CLI-H2: mapeamento pai→filho de publisher; CLI M5/M6 para que close/ativação realmente não deixe resíduo.
4. Decisões de design 1 e 2 (event store da CLI + legacy subscribe) — a principal causa raiz do "crescimento contínuo" em sessões longas.
5. Uma fronteira unificada para cada causa estrutural A/B/C.
6. Os demais itens de risco médio e baixo tratados por módulo, em conjunto.

## 7. Sugestões de verificação

- Antes da correção, capturar evidência de runtime: no renderer, comparar contagens de instâncias de `TokenizedCode`/`ZCodeTaskSnapshot` com heap snapshot do DevTools; em host/CLI, usar `process.memoryUsage()` com pontos periódicos + `--heapsnapshot-signal`, comparando os tamanhos de `SessionEvent`, `PendingStreamBatch` e `streamSubscriptions`.
- Script de reprodução: abrir/fechar janelas 20 vezes observando `defaultSession.listenerCount("will-download")` no processo main; rodar 30 turnos seguidos de saída em streaming em uma session e observar a curva de RSS do CLI; no cenário de bot, desconectar o workspace remoto e observar se as requisições de typing param.

## 8. Observação de logs em máquina real em 2026-09-04 (após o deploy dos logs de diagnóstico)

- **A política de retenção do event store foi verificada**: a quantidade eliminada no início do próximo turno da sessão pai corresponde exatamente ao número de eventos transitórios do turno anterior; subsessões de subagent com turno único são limpas pela salva de 2 minutos (7554 linhas → 254 linhas). O record da subsessão é reciclado pelo pool cerca de 3 a 7 minutos após a conclusão.
- **`v4.detachedLive` soma +1 a cada execução de subagent e não regride**: a auditoria CLI-H2 se confirma, aguardando correção.
- **O RSS do processo host sobe repetidamente a 1.5GB, com externalKb de 1.3GB, e recai depois de alguns minutos**: os pontos no tempo coincidem com o capture de repo snapshot (checkpoint). A causa é que `repoSnapshotFilter.ts` libera incondicionalmente arquivos dentro de `.git/` (contornando o limite de 1MB por arquivo e todas as regras de exclusão); como o `.git` deste repositório tem 1.2GB, **a cada envio de prompt e ao fim de cada turno** é empacotado, tem sha256 aplicado, é criptografado em AES e tenta subir um `.tar.gz.enc` de 1.3GB; neste workspace há `failureCount=9`, com 1.77GB (desde 27/8), 1.26GB e 0.66GB de artefatos não enviados acumulados em `~/.zcode/v2/checkpoints/*/pending`, e `~/.zcode/v2` totalizando 7.6GB. Isso é um problema de produto/spec (`repo-snapshot-sidecar.md` exige metadados Git completos), não um vazamento; é preciso decidir: excluir `.git/objects/pack` ou definir um limite total para `.git`, ou pular o capture quando o workspace ultrapassar o limite.
- **Loop mortal de expulsão mútua no relay de controle remoto**: duas instâncias do desktop conectadas ao relay com a mesma conta reconectam cerca de 22 vezes/minuto cada, sem backoff (a outra instância chegou a mais de 6000 vezes no dia). Isso corresponde ao item de reconexão sem backoff de `webRemoteControlTransport` da auditoria.
- **O renderer faz uma leva de 10 `listTaskList` a cada ~25s** (1189 vezes no total), correspondente ao item de invalidação de versão amplificada UI M6 da auditoria.
- **As 2565 entradas de `taskBus.sessionRoutes` do main** só aumentam (cerca de 250KB), correspondendo ao item L4 da auditoria.