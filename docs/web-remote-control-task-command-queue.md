# Fila de Entrada Autoritativa Cross-Platform do V4

## Conclusão

A semântica de fila dupla antiga ("fila renderer-local do desktop + fila de comandos runtime do host no celular") saiu do V4.
Todas as entradas busy/running já submetidas pelo desktop e pelo celular entram diretamente no mesmo `CommandInbox` do CLI/runtime, e a ordem FIFO segue a
ordem de admission serial do CLI. O owner/lease do host apenas faz roteamento e não possui mais uma segunda fila de input aceito.

```text
Desktop continuous command ─┐
                            ├─> owner route -> CLI serialized admission -> one FIFO
Mobile replayable command ──┘                                      |
                                                                    ├─ queue
                                                                    ├─ guided row
                                                                    ├─ transcript
                                                                    └─ rejected/failed/discarded
```

Invariante final: antes de a UI limpar um payload já submetido, a camada autoritativa já precisa ter registrado seu único destino; não pode existir "a UI limpou, mas o CLI
não tem queue/guided row/transcript/resultado terminal explícito".

## Limites de Conexão e Roteamento

- Desktop (incluindo janelas SSH/WSL/Docker) é marcado como confiável pelo host como `desktop-continuous`.
- `/remote` no celular / Web remote é marcado como confiável como `web-remote-replayable`.
- `clientMode` é injetado pelo attachment e não pode ser forjado por um UI command.
- O celular no V4 contorna a fila de comandos runtime do host de `IZCodeTaskService.enqueueTaskCommand`.
- remote workspace, bot/proxy ou fallback entre hosts continuam roteando o command para o CLI correto via owner/lease/stale-run.
- O link remoto percorre `workspaceIdentity` e `remoteSessionId`; a chave de identidade não pode usar apenas `workspacePath`.
- Cada janela do desktop tem apenas um Window Host e um `hostId` realtime; commands local/remote são roteados dentro do Host por
  `workspaceKey + taskId`, e `remoteSessionId` apenas seleciona a source dentro da janela, não substitui a workspace identity.

## ConversationInputIntent

Cada input admitido é autocontido e conserva todos os campos ao longo de queue/runtime/transcript:

- O `sourceCommandId` original e o `queueItemId` estável.
- `clientId`, kind, texto original, attachments.
- delivery requested/admitted e o motivo do fallback.
- Ordem de admission do CLI e posição na queue.
- Estado de steer e de dispatch.

QueueItem, drain/guided event, user row e message anchor usam o mesmo `sourceCommandId` original. promotion,
edit ou send-now não podem trocar para o id do command da operação.

Na persistência, tanto o message metadata quanto o session-input ledger gravam o `conversationInputIntent` completo; o message anchor
grava ainda o mesmo `sourceCommandId` para o índice de deduplicação. O antigo `metadata.inputIntent` é apenas leitura de compatibilidade, não o formato autoritativo de escrita.

Quando o guide não se aplica, há attachments, compact/verifier está busy ou há runtime steer reject, o intent completo volta para a
queue normal. empty, limite excedido ou runtime reject retornam `rejected/failed` explícito, e a UI mantém o texto e os attachments.

## Operações de Queue

`editQueueItem` atualiza no lugar, preservando o item ID, o command de origem, a posição original, os attachments, o client e a ordem de admission;
apenas os novos campos explicitamente submetidos pelo usuário mudam. reorder/delete também modificam a mesma queue autoritativa por CLI command.

`sendQueuedNow` não remove antes de enviar:

```text
reserve(item)
  -> stop barrier
  -> start/promote(item)
  -> remove(item) only after start succeeds

timeout/failure -> release reservation -> 原 item 原位、原字段保留
```

Cliques consecutivos no mesmo item ou concorrência entre plataformas têm apenas um reservation owner.
A reservation fica no CLI runtime compartilhado; `reserved/promoting` é projetado pelo fluxo de eventos para todos os subscribers desktop/mobile
e pausa o drain normal. A promoção lê o QueueItem completo, preservando o `sourceCommandId` e os attachments originais;
o remove com o mesmo reservationId só acontece após o start bem-sucedido. Esse remove usa o motivo `promoted`, apenas retira da queue e não marca
o durable ledger como cancelled; após o commit atômico da user message o `SessionInputPromoted` faz o unpin, e um crash antes do commit é
recuperado como explicit discarded.

## ACK, Consultas e Reconciliação da UI

A UI mantém um registry de pending commands de 24 horas: text/goal comuns salvam o payload reenviável; interações sensíveis salvam apenas o
digest. A aparição de QueueItem/guided projection prova que a camada autoritativa já recebeu, e o registro correspondente do registry é removido imediatamente; esse registry
não é uma segunda queue entre runtimes.

Quando o ACK é perdido ou na reconexão, chamar `commands/query`, no máximo 64 `{sessionId, commandId}` por vez. A ordem de consulta do CLI é fixa:

```text
memory LRU
  -> transcript/message anchor sourceCommandId
  -> timeline marker sourceCommandId
  -> fork child metadata sourceCommandId
  -> discarded input ledger
  -> unknown
```

Consulta e execução com a mesma key são single-flight; a consulta não pode retornar `unknown` na janela em que a execução já começou e o resultado ainda não foi escrito de volta, provocando efeitos colaterais duplicados.
sendText/sendGoal/createSession.firstInput salvam o `conversationInputIntent` completo e fazem pin antes do handler;
o evento de promotion invalida primeiro o antigo transcript query seed e só depois faz o unpin, portanto mesmo com um churn posterior de 512 ACKs o retorno à origem só pode
ver transcript ou explicit discarded, nunca degradar para unknown.

## Recuperação e Limites de Processo

A queue só garante confiabilidade dentro do processo CLI atual, cobrindo reconstrução da UI, queda de rede do celular e reconexão de attachments, mas não promete continuar a execução após
um restart do CLI. No restart do CLI, todo input admitido que ainda não entrou no transcript nem atingiu um estado terminal explícito é gravado no discarded ledger;
`commands/query` retorna o motivo de falha `fault.command.inputDiscardedOnRestart` e o `delivery` persistente.

Se a tarefa ainda não foi retomada, o primeiro `commands/query` também encerra o admitted ledger remanescente do processo CLI anterior como
discarded, portanto não ocorre a corrida "primeiro unknown, e só depois discarded na assinatura". Efeitos colaterais bem-sucedidos sem user message,
como timeline/child, gravam `v4/command_fact`, e a consulta após restart ainda devolve o ACK/resultado original.

`queue/guide` pertence ao runtime antigo, e o cliente faz a conciliação silenciosamente; apenas `startNow` que não entrou no transcript ou `unknown`
exibe a entrada "confirmar reenvio", nunca com replay automático. Uma queda comum de conexão do celular continua sendo recuperada pelo replayable snapshot do runtime atual para a queue autoritativa;
relay, desktop main e host não podem contornar esse limite de produto por meio de uma fila persistente privada.

### Navegação de diretório de projeto virtual em 2026-09

O home do celular reaproveita o ProjectSidebar e lê, pelo attachment base atual, o conjunto de linhas de projeto do Host; o
shell do celular possui apenas o estado de home/chat e o de retorno do navegador. `workspace-bridge-open.project` é uma
intenção estrita de projectId/hostId, encaminhada pelo main ao ProjectService do Host da janela para preparar o diretório de
execução. Ela permite criar ou reutilizar o escopo lógico do diretório em uma Source física já online, e não permite criar
implicitamente uma nova conexão física, um Host ou um Agent. A identidade de membro, a entrada de projeto e o objeto de
conexão física são verificados antes e depois da preparação; o main mantém apenas a promise RPC da navegação atual, e uma
nova tentativa com a mesma identidade de bridge não aloca o diretório novamente; cancelamento, fechamento da janela ou uma
navegação posterior invalidam um resultado tardio.

Depois que o Host devolve o `workspaceIdentity`, o `remoteSessionId` e o `cwd` confiáveis, a bridge replayable do celular é
estabelecida ao longo do attachment shared-host original. Projeto/provider/entrada inicial são passados apenas na handover do
Root da Web, e o main não guarda rascunho nem estado de negócio de task. O desktop direct continuous, a restauração por
snapshot/gap do celular, o owner/lease e a regra de fila única do CLI CommandInbox permanecem inalterados.
