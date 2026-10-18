# Especificação atual do modelo de Command do V4

Data de atualização: 2026-08-25

Todas as operações de escrita de conversation entram no CLI por `v4/command`. O schema está em
`packages/shared/src/zcode-protocol-v4/command.ts`, o admission em
`apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts`, e os handlers de negócio em
`apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/`.

## Envelope e escritor único

```text
client command
  { commandId, clientId, sessionId, baseRevision?, baseLogEpoch?, type, payload, issuedAt }
       |
       v
CLI CommandInbox
  -> schema / epoch / revision / row target / product guard
  -> per-session FIFO admission
  -> native V4 handler
  -> ACK
  -> canonical fact + projection delta
       |
       `-> 所有订阅端按同一权威顺序收口
```

- `commandId` é gerado pelo cliente e permanece inalterado nos retries;
- `issuedAt` é usado apenas para telemetria e não pode participar da ordenação ou da decisão de conflitos;
- comandos CAS devem trazer `baseRevision`; comandos com row-targeting também devem trazer `baseLogEpoch`;
- o `sessionId` de `createSession` é `null`, e o ACK de sucesso retorna o session id real;
- o cliente é o proponente da intenção e o CLI é o único escritor. Comandos de clientes diferentes são serializados na ordem de admission real do CLI.

O conjunto completo de comandos é definido por `commandPayloadSchemas` e atualmente inclui criação/remoção/renomeação de sessão, input e goal, stop,
compact, fork/edit/retry/file rewind, operações de queue, resposta de interaction e snooze, troca de modelo/modo/followup,
pause/resume de goal e cancelamento de background work. A documentação não deve mais tratar as operações legadas `session/*` como entradas de escrita da UI do V4.

## Semântica do ACK

Os status de ACK são:

- `accepted`: o comando foi aceito pelo CLI atual;
- `rejected`: schema, guard ou alvo não permitem;
- `stale`: epoch/revision/row target já expirou;
- `duplicate`: o mesmo comando já tem resultado;
- `noop`: o comando é válido, mas o fato já está no estado alvo;
- `failed`: a execução do comando falhou.

O ACK não é um snapshot de projection e não substitui atualizações posteriores de topic. O estado de longo prazo da UI deve ser consolidado pela projection;
`sourceCommandId` é usado para alinhar rows/markers autoritativos com overlays locais. Comandos como fork, create session e interaction, que exigem navegação imediata ou exibição de resultado, podem retornar o resultado mínimo no `result` do ACK.

## Inbox em memória e fatos persistentes

O CommandInbox em si é uma estrutura em memória:

- in-flight e live input são sempre pinned;
- ACKs settled vão para um LRU limitado por session;
- o restart do CLI não recupera uma "tabela de command inbox pendente" nem reproduz comandos cegamente.

A idempotência entre restarts depende dos fatos persistentes já produzidos pelo comando, e não da persistência do inbox:

1. `sourceCommandId` da âncora da mensagem do transcript;
2. `sourceCommandId` da parte de timeline;
3. o command fact de child/fork;
4. os estados finais promoted/cancelled/discarded/failed do ledger `session_input`.

`v4/commands/query` consulta primeiro o pinned/LRU em memória e depois busca com precisão pelas fontes acima. Quando não encontra, retorna `unknown`, e o cliente exibe isso e deixa o usuário decidir se reenvia; é proibido reenviar silenciosamente comandos com efeito colateral como stop, fork e input.

`session_input` é o ledger do ciclo de vida do input, não uma fila de execução recuperável. `startNow`, `queue` e `guide` fazem admission durable antes da execução; a promotion e a persistência da user message são associadas atomicamente. Entradas que ainda estiverem em `admitted` após o restart do CLI são explicitamente convertidas em `discarded(session_resumed)`, evitando que o input evapore silenciosamente ou seja reexecutado automaticamente.

## Queue e interações bloqueantes

O input aceito em execução é transportado pela command queue do CLI runtime, e o renderer não cria mais uma segunda busy queue.
O queue item preserva `sourceCommandId`, anexos, client, ordem de admission e estado de dispatch; desktop e mobile
compartilham o fato, mas cada um continua respeitando as fronteiras de entrega continuous/replayable.

permission, elicitation e AskUserQuestion são projetados como `pendingInteractions`. O cliente responde por
`resolveInteraction`; o primeiro a chegar prevalece, e operações duplicadas ou tardias são consolidadas de forma idempotente. owner/lease continuam responsáveis pelo roteamento de comandos entre hosts, pelas respostas bloqueantes e pela proteção contra stale-run, e não podem ser removidos por causa da existência de attachments com shared-host.

### Prompt admission e agendamento de turn

O `CommandInbox` é responsável pelo FIFO de comandos de cada session, pela idempotência e pelo admission de `session_input`; ele não é responsável por julgar se o runtime pode iniciar um turn no momento. Essa decisão é tomada atomicamente apenas pela instância correspondente de `AgentRuntime`:

```text
Session A                         Session B
  CommandInbox -> Core admission    CommandInbox -> Core admission
       idle -> reservation/start         idle -> reservation/start
       busy -> existing Core FIFO        busy -> existing Core FIFO
```

- A mesma session tem no máximo um turn em foreground ao mesmo tempo. `activeTurn`, `activeTurnStartReservation`,
  `activeForegroundExecution`, o drain de comandos do runtime e os comandos de runtime já existentes pertencem à fronteira busy do Core; não se deve primeiro consultar esses estados pelo Bootstrap e depois decidir por conta própria entre start e queue.
- Sessions diferentes usam seus próprios estados de `AgentRuntime` e FIFOs de runtime, podendo executar em paralelo; um provider/rede travado em uma session não pode bloquear outra session.
- O admission do Core retorna um receipt `started`, `queued` ou `rejected`. `started` indica apenas que a reservation foi estabelecida e que o comando de prompt entrou na fila de execução daquele runtime; a execução do modelo, o evento `TurnStarted` e a atualização de projection continuam sendo concluídos de forma assíncrona pelo fluxo de eventos existente.
- `inputId/sourceCommandId` de `TurnStarted` são usados para correlacionar eventos posteriores, e `messageId` pode não aparecer no ACK inicial. O commit da projection não é a fronteira do ACK de prompt admission nem o fato de busy/idle da session.
- reservation, active turn e foreground execution são liberados uniformemente pelo `finally` do turn do Core. O controller do Bootstrap não pode ser usado para inferir que o Core está idle; Stop chama prioritariamente o `stopActiveForegroundExecution` do Core.
- O `desktop-continuous` do desktop continua consumindo o fluxo de eventos realtime do Core; o `web-remote-replayable` do celular continua recuperando a mesma fila do Core via snapshot/gap. Os dois têm apenas semânticas distintas de entrega/recuperação, não mantêm cada uma sua própria prompt queue nem empurram o estado da fila para o relay ou o renderer.

## Disciplina do Optimistic overlay

- o overlay existe apenas na UI local do lado que iniciou, e não entra no projection store;
- o overlay é sobrescrito pelo fato autoritativo apenas por `commandId`, e não é mesclado com rows autoritativos;
- o lado que iniciou também deve consumir seus próprios frames de assinatura;
- o ACK `accepted|duplicate` de `sendText` inicia uma única janela de confirmação de projeção: a janela é encerrada quando aparece o queue item do mesmo `sourceCommandId` ou a row `userInput` de real-user; o timeout da janela apenas reaproveita o resync same-sub da subscription owned atual, e é proibido fabricar mensagens, criar uma segunda fila ou reproduzir automaticamente o command;
- na desconexão o draft é preservado, mas uma fila de comandos offline não é aceita;
- a recuperação do transport não pode alterar a ordem de admission/queue dos comandos.