# Especificação atual do topic sessions-index

Data de atualização: 2026-07-22

`sessions-index/<workspaceId>` é a fonte de dados de atividade de sessão e de detalhe em tempo real para a barra lateral e a lista de tasks. O conjunto persistente de linhas de task é determinado por `tasks-index.sqlite`; a ausência de summary significa apenas que o detalhe em tempo real ainda não está disponível e não pode ser usada para apagar a linha da esquerda. O schema está em `packages/shared/src/zcode-protocol-v4/sessions-index.ts`; a projection/publisher do CLI e a store/transport da UI já estão no caminho principal.

## Posicionamento

- Autoridade do CLI, somente leitura pelo cliente: a lista não varre mais conversation rows para deduzir o estado da sessão; essa autoridade cobre apenas a atividade da session e os campos de detalhe, não a existência da linha persistente de task.
- Dimensão de workspace: `workspaceId = workspaceIdentity?.trim() || workspacePath`.
- Estado mais recente conflado: atualizações consecutivas da mesma session mantêm apenas o último resumo; após desconexão, a recuperação é por snapshot, sem tratá-lo como log de eventos completo.
- Ortogonal ao topic conversation: o index fornece os resumos da lista, e `conversation/<sessionId>` fornece as rows completas, config, control e actions.

## Schema

`SessionSummary` contém hoje a identidade da sessão, workspaceId, phase, título e title source, sessão pai, tempos de criação/atividade, resumo de usage e contagens leves de permission/user-input. Ele não pode carregar o payload completo de interaction, conversation rows nem o estado organizacional do tasks-index.

Os quadros seguem o conjunto de cinco do topic V4:

- subscribe / unsubscribe;
- snapshot;
- delta (`session.upserted` / `session.removed`);
- seq/logEpoch;
- resync.

Limites de schema:

- **sessions-index contém apenas estado de sessão puro**, **sem pin/archive/groups**: o estado organizacional (as anotações do usuário na lista) passa pelo CRUD slim do lado do host em tasks-index.sqlite (as três faces pin/archive/groups), com **join no cliente** na camada de estado da barra lateral — pertence ao M5 ②, não entra neste topic e não quebra o congelamento do schema.
- **Não lido não entra no schema**: não lido é estado organizacional do tasks-index, consultado em paralelo a `unreadAt` e pin/archive e unido no cliente; `lastActivityAt` responde apenas pela ordenação de atividade, e é proibido alterá-lo por leitura/escrita de não lido.
- **Identidade de tarefa agendada não entra no schema**: `cronAutomationId` é metadado persistente do tasks-index, continuando autoritativo em `tasks.meta_json` / `cron_automation_id`. Todas as listas derivadas de sessions-index devem preencher esse campo no join de membership do cliente por `taskId`, para que as linhas de workspace, grouped, timeline e pinned/archived julguem o clock icon de forma uniforme; é proibido depender apenas de `SessionSummary` e é proibido quebrar por causa disso o schema já congelado de sessions-index.
- **Interações bloqueantes entram apenas no resumo leve**: a barra lateral precisa sincronizar a attention de permission/userInput, mas não assina conversation rows completas. O summary carrega apenas um kind/count opcional; o payload completo de interaction pendente continua pertencendo apenas ao snapshot de conversation.
- **archived não entra em sessions-index**: as linhas arquivadas e a atribuição de partição vêm do tasks-index, e o cliente faz join do detalhe de session disponível.

As draft prewarm session são filtradas por `isDraftSession` no gateway e não entram na barra lateral; quando a primeira entrada promove a sessão a uma sessão formal, o fan-out de eventos é que a adiciona ao index.

## Lado de escrita do CLI

```text
session runtime/product projection event
  -> SessionsIndexProjection.deriveSessionSummary
  -> SessionsIndexPublisher upsert/remove
  -> conflation + seq/logEpoch
  -> owner subscription wire frame
```

### Ritmo do fan-out de eventos

Por padrão, há um fan-out por evento de sessão: assim que o resumo muda, ele é enviado imediatamente aos assinantes da lista. Fluxos de eventos de alta frequência precisam ser reduzidos primeiro, senão os assinantes da lista recalculam as linhas de task na frequência dos eventos:

- `ModelStreaming` (incrementos de streaming do corpo) não dispara recálculo da lista; a prévia é atualizada no fechamento do turno ou em outro evento;
- `DynamicWorkflowRunProgress` (progresso da execução do workflow, que pode chegar a centenas por segundo em uma execução) é limitado por janela leading + trailing: o primeiro item após o silêncio é publicado imediatamente e os progressos seguintes dentro da janela de `WORKFLOW_PROGRESS_INDEX_FANOUT_MS` (250ms) são agrupados em uma publicação no fim da janela. Com isso, a taxa de atualização da linha de execução na barra lateral (`workflowActivity`) não ultrapassa 4Hz e o estado terminal da execução ainda chega dentro de uma janela;
- os demais eventos mantêm publicação imediata. Qualquer publicação imediata ocorrida dentro da janela satisfaz o trailing pendente e o cancela, sem reenviar quadros.

O throttling altera apenas o ritmo dos quadros: a semântica de `record.updatedAt` / `lastActivityAt` e a ordem dos deltas não mudam. O timer da janela é mantido por sessão; a limpeza de sessão e o dispose do gateway precisam limpá-lo, e ele não pode impedir o encerramento do processo.

Uma assinatura fria constrói primeiro resumos leves a partir do session store persistente e depois os sobrepõe com a live projection das sessões atualmente registradas. Na leitura de workspace remoto, a identity completa precisa ser resolvida para o caminho real de execução do diretório, com filtro preciso pelo `workspace_id` completo:

- sessões locais continuam usando path + `workspace_id is null`;
- sessões remotas gravam o `workspaceIdentity` completo;
- dados antigos com `workspace_id is null` não podem ser reivindicados automaticamente como alguma identity remota só por terem o mesmo caminho;
- identities SSH/WSL/Docker diferentes para o mesmo caminho não podem aparecer umas para as outras no index.

### 3.3.6 Compatibilidade de upgrade de sessões históricas SSH/WSL

Ao criar uma sessão remota em 3.3.6, o session store do CLI ainda não persistia `workspace_id`, mas o `tasks-index.sqlite` do host remoto já isolava tasks pela `workspaceIdentity` completa. Por isso, na primeira assinatura de `sessions-index` SSH ou WSL em 3.4+, o host pode enviar ao CLI, junto com o subscribe, os `taskId` já validados do task index da identity atual como uma allowlist limitada. O CLI só pode fazer uma migração de atribuição única para sessões que ao mesmo tempo satisfazem:

- `session.id` está na allowlist fornecida pelo host;
- `session.directory` é exatamente igual ao caminho real resolvido pela identity;
- `session.workspace_id is null`;
- o topic atual é uma identity de workspace remoto válida.

A migração precisa gravar atomicamente o `workspaceIdentity` completo atual e só então construir o snapshot pelas condições normais de identity estrita.
Sessões que já têm outra identity estão proibidas de serem sobrescritas; assinatura de caminho local está proibida de consumir essa allowlist; uma allowlist vazia está proibida de degenerar em reivindicação por caminho. A allowlist é lida pelo host a partir do tasks-index por `workspaceKey` exato, considerando apenas GLM tasks não deletados, e é limitada ao teto de cold seed único do sessions-index, evitando leitura cruzada entre authorities SSH do mesmo caminho ou ampliação ilimitada dos quadros de protocolo. Se a leitura do tasks-index falhar, é preciso descartar a migração de dados antigos e continuar com a assinatura estrita por identity; a lógica de compatibilidade não pode bloquear a lista de sessões atual.

A oportunidade de migração não pode ficar presa à primeira construção do publisher de `sessions-index`. O cold seed e a migração para o mesmo `workspaceId` precisam ser serializados; qualquer assinatura posterior que carregue uma allowlist não vazia precisa reexecutar o claim idempotente e, após o claim, reler o store com identity estrita. Mesmo com `claimedCount = 0` neste ciclo, a releitura precisa acontecer, porque a execução anterior pode ter霎成功 com o claim e falhado antes de ler ou mesclar o resumo. Depois de uma leitura bem-sucedida, os resumos antes ausentes precisam ser mesclados no publisher existente e empurrados como um delta `session.upserted` normal para os assinantes atuais; falha de migração ou de leitura só pode fazer esta assinatura seguir com o snapshot estrito atual, sem deixar uma marca de "já migrado", e assinaturas posteriores com allowlist ainda podem tentar de novo. A releitura apenas complementa no index os resumos do store que faltavam no publisher; resumos live ou de seed antigo que já existem continuam atualizados pela projeção de eventos existente e não podem ser rebaixados por sobrescrita do estado padrão do armazenamento frio.

```text
同 workspace 订阅 A（无 allowlist） -> 严格读取/初始化 publisher
                                      |
                                      v（串行边界）
同 workspace 订阅 B（有 allowlist） -> 幂等 claim -> 严格重读 -> merge + delta
```

O workspace local não consome a allowlist nem entra no ramo de migração acima, mantendo a semântica existente de consulta e de ciclo de vida do publisher com `workspace_id is null + directory`.

O 3.4.2 chegou a resolver incorretamente a identity WSL com usuário explícito (`remote:wsl:<distro>:<user>:<path>`) como caminho de execução, fazendo com que o `directory/path` de algumas sessões persistentes fosse gravado como a própria identity, ou como `<workspacePath>/<workspaceIdentity>`. Antes de materializar o runtime na recuperação fria, é preciso corrigir essas formas históricas determinísticas e reversíveis:

- quando `workspace_id` já existe, aceita-se apenas uma remote identity válida e as duas formas de contaminação acima são还原adas ao `workspacePath` resolvido a partir da identity; caminhos normais e subdiretórios legítimos não são reescritos; dados que contêm identity mas não pertencem a nenhuma forma conhecida falham de forma fechada;
- quando `workspace_id is null`, somente a identity válida do workspace de recuperação atual pode obter prova completa a partir das formas de contaminação acima; a correção precisa gravar atomicamente `workspace_id + directory + path`; se a gravação não for atingida, é preciso reler e só continuar quando uma requisição concorrente já tenha gravado a mesma identity e o `directory/path` real, caso contrário falhar de forma fechada como corrupção recuperável de sessão, sem materializar o runtime;
- a correção de caminho em sessões que já têm identity precisa usar uma CAS estreita que atualize apenas `directory/path` e o `time_updated` monotônico, proibindo reutilizar o `updateSession` genérico, que gravaria de volta fatos concorrentes como title, summary, permission, revert e archive; quando a CAS não acerta, reler e decidir de novo; uma anomalia temporária de escrita em disco pode continuar esta recuperação com o mesmo resultado determinístico em memória e preservar a chance de nova tentativa;
- a correção não pode depender do client mode nem alterar a fronteira de recuperação de mensagens do desktop `continuous` e do mobile `replayable`.

```text
host task allowlist + clean path + null identity -> atomic claim -> strict sessions-index read
known polluted path + proven remote identity     -> path repair -> runtime materialize -> resume
unknown/mismatched shape                         -X-> no claim / fail-closed
```

A resolução de remote identity precisa falhar de forma fechada: qualquer workspace id que comece com `remote:` mas não siga o parser unificado não pode regredir para caminho local. Assim corrige-se a causa raiz de persistência errada do 3.4.2, em vez de adicionar um fallback no botão de envio.

Pontos de entrada da implementação:

- `packages/services/src/zcode-agent/zcodeAgentService.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/sessions.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-publisher.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-publisher-registry.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-gateway.ts`

## Lado de leitura da UI

`agentSessionsIndexTransport` passa os quadros V4 do service para a `SessionsIndexStore`. A store aplica o snapshot atomicamente e exige deltas contínuos; gap, mudança de generation do runtime ou fault de assembly na wire disparam recovery, e uma recuperação falha de forma fechada.

A assinatura da lista de tasks usa a runtime policy `existing-only`. A aquisição de scope apenas registra a relação de observação; enquanto o Agent do workspace ainda não está rodando, a store entra em `dormant`, não provoca spawn, não conta como hydration e não trata o `running` de um summary live anterior como activity atual.
As linhas persistentes continuam sendo exibidas pelo tasks-index. Depois de prewarm explícito de draft, abertura de session, envio de comando ou outra entrada real de execução publicar runtime available, a store dormant faz fresh subscribe; o estado dormant do Host task-index syncer precisa, no primeiro available, instalar de forma idempotente os frame listeners de sessions-index/workspace-config de nível de workspace antes de iniciar o subscribe, garantindo que o initial frame chegando na mesma leitura stdio depois do resolve da Promise de ACK e antes de o await continuation/ownership da assinatura assumir não seja perdido.
As trocas posteriores de generation do runtime reutilizam o mesmo conjunto de listeners e apenas ressuscrevem;
depois de runtime unavailable a assinatura e o retry são revogados e volta-se a dormant.

```text
restored inactive workspace -> tasks-index row + dormant observer -X-> Agent spawn
explicit runtime operation  -> runtime available -> install listener -> fresh subscribe -> live detail
runtime unavailable         -> clear live ownership/retry -> dormant -X-> implicit restart
```

`start-if-needed` fica reservado apenas para entradas com intenção explícita de execução do usuário/sistema; a lista de tasks, os consumidores grouped/timeline/pinned/archived e o Host task-index syncer não podem usá-lo. Tanto o ciclo de vida do runtime quanto as assinaturas são isolados por `workspaceIdentity?.trim() || workspacePath`.

A lista de prewarm de cold start local do Main é outra intenção explícita de sistema: ao restaurar múltiplos workspaces locais, seleciona-se apenas o workspace ativado da última vez (teto de 1) e ele é entregue ao mesmo Host junto com o primeiro `InitLocal`. O Host reutiliza para esse target o caminho completo já existente de `initializeWorkspace`; `recentProjects` e os demais workspaces restaurados permanecem dormant. Falha de prewarm não é compensada por outro workspace, um reload do renderer apenas reanexa o Host existente e o shared-host/anexo remoto do mobile não consome nem estende esta lista local.

Vários consumidores do mesmo endpoint + workspaceKey compartilham store/assinatura por `sessionsIndexRegistry`, com contagem de referências. A agregação de múltiplos endpoints coordena o scope de forma incremental com `workspaceSessionsIndexSubscriptionSet`:

```text
已有 local-A + remote-A
  -> 新增 remote-B：保留 A 的 store/subscription，只 acquire B
  -> 删除 remote-B：只 release B
  -> service generation 换代：只替换受影响 scope
```

Essa regra evita que a hidratação de um novo endpoint remoto derrube uma lista já pronta. Um pane remoto precisa usar o service do próprio endpoint e não pode consultar no `__base__` local a sessão do mesmo caminho.

Pontos de entrada da implementação:

- `packages/ui/src/v4/agentSessionsIndexTransport.ts`
- `packages/ui/src/v4/sessionsIndexStore.ts`
- `packages/ui/src/v4/sessionsIndexRegistry.ts`
- `packages/ui/src/v4/useSessionsIndex.ts`
- `packages/ui/src/v4/useWorkspaceSessionsIndexItems.ts`
- `packages/ui/src/v4/workspaceSessionsIndexSubscriptionSet.ts`

## Join com o tasks-index

O tasks-index fornece a linha base persistente de task e o seguinte estado organizacional, e o sessions-index sobrescreve apenas os campos em tempo real das entradas que casam por `workspaceKey + taskId(sessionId)`:

- pinned / archived / group membership;
- unreadAt;
- texto de busca ou slim metadata necessários às consultas de lista compatíveis.

A projeção do cliente usa a linha do task-index como tabela à esquerda: quando há match do summary, completa phase, lastActivityAt, trabalho em background, interaction pendente e o título da session; quando o summary está ausente, mantém a linha persistente e proíbe derivar spinner de um `status=running` histórico.
Tasks recém-criadas ainda não persistidas aparecem apenas de forma temporária pelo overlay optimistic/live que já existe no renderer.

Mutações de estado organizacional não alteram o sessions-index, e por isso `taskListMembershipVersion.ts` dispara explicitamente um novo carregamento de membership; não se pode esperar por uma delta de index que não existe.
A criação de task também muda o conjunto de linhas diretas do tasks-index: o Host emite `task_created` depois que a linha da task e a ordem inicial de grouped são confirmadas, e o renderer precisa usar esse evento para trocar as leituras de task-row/membership. Não basta atualizar a atividade da sessão, senão a Promise antiga de membership continua segurando a linha para fora de Project/Timeline/Grouped mesmo depois de ela já estar persistida.

## Recuperação e fronteiras multi-dispositivo

- A recuperação desktop online continuous e a mobile replayable podem consumir a mesma autoridade de index, mas cada anexo tem ownership de assinatura e estado de recuperação independentes.
- relay/main não faz cache do index nem transmite o estado saturated/resync de um cliente para os outros.
- O snapshot é a substituição total do workspace atual; quadros de generation antiga precisam ser descartados.
- O seq do index serve apenas à continuidade da assinatura e não representa um histórico de negócio reproduzível para sempre.

## Limites de teste

Evidence deve ser fornecida, no mínimo, pelas seguintes camadas:

- shared: summary de session / snapshot / delta / schema de topic e codec da wire;
- CLI: derivação da projection, conflation do publisher, cold seed, filtro de draft, remote identity;
- UI: snapshot/delta/gap, reúso de referência de store, ciclo de vida incremental de múltiplos endpoints, join da lista;
- WDIO: criação, abertura, renomeação, visibilidade da lista após arquivar/deletar e ausência de cruzamento no scope remoto.
- ciclo de vida de processo: ao restaurar múltiplos workspaces locais em uma única janela, apenas 1 prewarm explícito de runtime é permitido, o workspace active escolhido na inicialização; expandir qualquer visão de task-list não pode aumentar o número de Agents; workspaces fora da lista só podem iniciar por entrada explícita de abertura/envio/task de background, e um observador passivo não pode reerguer o runtime depois de runtime unavailable.

Só os testes existentes na matriz de cobertura contam como cobertura automática; listas históricas do M5 ou nomes de arquivo sugeridos não substituem evidência de teste.