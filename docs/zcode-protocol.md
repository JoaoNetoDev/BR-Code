# ZCode Protocol (fatos atuais)

O ZCode Protocol é o único protocolo de Agent entre o App, o Host Process e o `zcode-cli`. O caminho principal do chat hoje usa o conversation topic V4, a projection autoritativa e o command inbox; os schemas de session antigos que ainda permanecem em `packages/shared/src/zcode-protocol/index.ts` servem apenas às chamadas de compatibilidade que ainda não foram removidas, e não são pontos de entrada de funcionalidades novas.

## Restrições centrais

- A entidade do protocolo se chama uniformemente `session`; o `taskId` histórico da camada de produto equivale a `sessionId` no caminho principal do chat.
- A CLI é a fonte de verdade da conversation. Linhas de mensagem, fases de execução, fila, requisições de interação, configuração de modelo, usage, goal e capacidades de controle vêm todos do `ConversationSnapshot`.
- A UI possui apenas estado de exibição puramente local, como rascunho, rolagem, foco e expansão de painéis, e não pode manter uma segunda cópia autoritativa de mensagens ou de fila no renderer.
- O desktop usa `desktop-continuous` e o controle remoto do celular usa `web-remote-replayable`. Os dois profiles compartilham a mesma projection da CLI, mas as semânticas de recuperação não podem se espalhar uma para a outra.
- O `/remote` do celular apenas se conecta a um Host/CLI já existente e não cria um runtime de Agent independente.

## Topologia de transporte

```text
Renderer
  │ MessagePort RPC
  ▼
Host Process
  │ stdio NDJSON
  ▼
zcode-cli app-server
  ├─ command inbox
  ├─ ProductProjection reducer
  └─ conversation topic publisher
```

O stdio NDJSON delimita quadros apenas pelo byte LF `0x0a`; o formato de escrita do quadro é fixo em `JSON.stringify(message) + "\n"`. O reader pode tolerar CRLF no fim do quadro, mas não pode aplicar trim nem reescrever strings dentro do quadro.

## Caminho de leitura do V4

O cliente assina o topic `conversation/<sessionId>`. O ACK de subscribe não embute o snapshot em si; em seguida, o servidor entrega o snapshot initial/recovery ou deltas contínuos conforme a marca d'água (waterLevel), o logEpoch e o delivery profile daquela subscription:

```text
subscribe(topic, baseSeq, baseLogEpoch)
  ├─ base 可续接 ──> delta(fromSeq, toSeq]
  └─ base 失效   ──> snapshot + 后续 delta
```

`ConversationSnapshot` é a visão completa e recuperável, contendo:

- metadados da session e a phase;
- linhas de mensagem/ferramenta/marker em `rows.window`;
- `queue` e `inputRouting`;
- interações pendentes;
- configuração de model, mode, thought e follow-up;
- usage, goal, background work e control availability.

O cliente só pode aplicar deltas de forma contínua por seq. Quadros duplicados ou atrasados são descartados silenciosamente, e, ao aparecer um gap, ele reassina e converge por snapshot. O continuous do desktop não emenda as mensagens de recuperação de estado de execução do replayable do celular.

## Caminho de escrita do V4

Toda intenção do usuário é enviada por `v4/command`. O envelope contém um `commandId` estável, `clientId`, `sessionId`, `baseRevision` / `baseLogEpoch` opcionais, o tipo do comando e o payload. Comandos CAS exigem `baseRevision`, e comandos com alvo de row também exigem `baseLogEpoch`; uma retentativa precisa reutilizar o `commandId` original. A CLI usa o command inbox para decidir idempotência, epoch, CAS e product guard.

O conjunto completo de comandos atuais tem `packages/shared/src/zcode-protocol-v4/command.ts` como única fonte de verdade de tipos, com os principais agrupamentos abaixo:

| Grouping          | Comandos                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| Sessão/entrada     | `createSession`、`createSelectionSideSession`、`sendText`、`sendGoalCommand`、`renameSession`、`deleteSession` |
| Controle de geração      | `stop`、`compact`、`retryTurn`、`editUserQuery`、`forkAssistant`                        |
| Regressão de arquivo      | `applyFileRewind`                                                                       |
| Fila          | `sendQueuedNow`、`editQueueItem`、`reorderQueueItem`、`deleteQueueItem`、`setAutoDrain` |
| Configuração          | `switchModelConfig`、`switchCollaborationMode`、`setFollowupMode`                       |
| Goal/trabalho em background | `pauseGoal`、`resumeGoal`、`cancelBackgroundWork`                                       |
| Interações bloqueantes      | `resolveInteraction`、`snoozeInteractionAutoResolution`                                |

`session/steer`, `session/rewind` e o comando de rewind independente já foram removidos. A entrada do onboarding é decidida por `sendText` + `inputRouting`/follow-up mode; retentativa e edição usam `retryTurn` e `editUserQuery`, respectivamente; o desfazer de arquivos do workspace usa `applyFileRewind`, sem truncar implicitamente o histórico da sessão.

Os estados de ACK são `accepted | rejected | stale | duplicate | noop | failed`. O ACK indica apenas o resultado da decisão do command; o estado final da UI precisa vir da projection autoritativa com `sourceCommandId`.

## sessions-index e workspace-config

Além do conversation topic, o V4 oferece dois topics de nível de workspace com conflação:

- `sessions-index/<workspaceId>`: resumo de atividade da lista de sessões; estados de organização como pin/archive/group/unread continuam sendo lidos do tasks-index e unidos no cliente.
- `workspace-config/<workspaceId>`: configOptions de model/mode e o catálogo de slash commands; ele serve ao rascunho e ao catálogo da toolbar e não sobrescreve o `snapshot.config` de uma session já vinculada.

Cada um tem seu próprio seq/logEpoch/subscription recovery, sem compartilhar a marca d'água da conversation nem substituir a workspaceIdentity remota pelo workspacePath.

## Semântica de fila

A command queue do CLI runtime é a única fila autoritativa. Entradas comuns e `/goal` durante a execução são decididas na fronteira de admission da CLI conforme o `inputRouting`: executar imediatamente, enfileirar, guiar ou exigir que o usuário trate a held queue. Desktop e celular não mantêm cada um sua própria accepted queue.

A UI pode fazer uma exibição otimista breve, mas exclusão, edição, envio imediato, reordenação e auto-drain precisam enviar o comando V4 correspondente e esperar a convergência por snapshot/delta.

A entrada é escrita no lifecycle ledger `session_input` antes da execução; ele serve à atomicidade da promoção e à dedup entre reinícios, e não é uma fila persistente que retoma a execução automaticamente após um restart. Quando a CLI reinicia, as entradas admitidas que não foram promovidas são explicitamente convertidas em discarded, e o cliente só pode sugerir ao usuário que confirme o reenvio.

## Isolamento de processo e de workspace

Um App pode executar várias workspace windows; cada janela tem o seu próprio Local Host, e as conexões remotas são carregadas pelos Remote Hosts no escopo daquela janela. Todos os Hosts isolam o workspace por `workspaceKey = workspaceIdentity?.trim() || workspacePath`, e cada workspaceKey inicia no máximo um processo de CLI de chat:

```text
App
  └─ workspace window
      ├─ Local Host
      │  ├─ workspaceKey A ── zcode-cli A
      │  └─ workspaceKey B ── zcode-cli B
      └─ Remote Host(s)
          └─ remoteSessionId / attachment ── workspaceKey C ── zcode-cli C
```

`workspacePath` é usado apenas para o sistema de arquivos e o cwd dos comandos; identidade, cache, fila, vínculo de sessão e correlação entre processos precisam usar o workspaceKey. O workspace remoto precisa propagar `workspaceIdentity` e `remoteSessionId` de ponta a ponta.

## Configuração de Provider

O `modelProviderService` do Host é a fonte de configuração do provider registry; a CLI é a fonte de verdade do modelo atual da session e do estado de execução. O Host sincroniza o registry com revision para a CLI do workspace correspondente. A UI de chat constrói os modelos disponíveis com o app/workspace config catalog e lê a configuração atual pelo conversation snapshot; endpoint e API key não entram no snapshot nem são reenviados a cada entrada. O rascunho pode ler a última escolha global daquele workspace como seed de criação/prestepagem, mas ela não pode sobrescrever uma session existente.

Trocar a configuração em execução afeta, por padrão, a próxima rodada. Segredos não entram no snapshot; o workspace remoto também usa o mesmo provider-registry command e não depende do arquivo de configuração antigo.

## Evento de agendamento de ferramenta no caminho de compatibilidade

O caminho antigo `session/event` ainda recebe o `tool.updated(kind=scheduled)` emitido pela CLI.
Seu `assistantMessageId` opcional indica a mensagem de assistant à qual pertence e precisa passar pela validação estrita do App e ser preservado; eventos antigos sem esse campo continuam compatíveis. Quando o campo existe, precisa ser uma string não vazia, e outros campos desconhecidos continuam sendo rejeitados.
Tanto o payload de agendamento com `input` completo quanto com `inputOmitted/inputRef=model_stream` seguem este contrato.

A tarefa longa de 60 turnos no Feishu em 2026-09-07 expôs que o schema do lado consumidor omitia esse campo: a CLI enviava normalmente, mas o Host descartava o evento scheduled inteiro por causa de `Unrecognized key: assistantMessageId`.
Aqui apenas se completa um campo de compatibilidade já existente, sem adicionar capacidade nova ao chat e sem alterar a projection V4, o isolamento de workspace ou as fronteiras de entrega e recuperação do desktop-continuous e do web-remote-replayable.

A regressão precisa cobrir os dois deliveryKind, as duas formas de input, a compatibilidade com campo ausente e a rejeição de campos inválidos/desconhecidos.

## Regras de modificação

- Antes de modificar o protocolo, altere primeiro o schema, as funções puras e o spec em `packages/shared/src/zcode-protocol-v4/`.
- Uma mudança de protocolo precisa ser validada simultaneamente no reducer da CLI, no transport do Host, no continuous do desktop e no replayable do celular.
- É proibido duplicar estado de negócio de session/task/stream/queue/snapshot na UI, no relay ou no main do Electron.
- O antigo `packages/shared/src/zcode-protocol/index.ts` só pode reduzir a superfície de compatibilidade e não pode assumir capacidades novas do chat.