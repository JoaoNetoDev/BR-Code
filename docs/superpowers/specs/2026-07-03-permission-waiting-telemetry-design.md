# Design de Telemetry de Espera por Permissão

## Resumo da Mudança

Restaurar a medição do tempo de espera por permissão em `message_completion.waiting_ms` e adicionar um `waiting_ms` de mesmo critério ao `agent_step` existente. A espera por permissão pertence ao `tool_call` que disparou a autorização; não se cria um novo step `permission_wait`, e não se alteram as semânticas de `agent_step_cnt` e `loop_index`.

## Critério das Métricas

### `message_completion`

- `duration_ms = max(finishedAt - sendTime, 0)`.
- `duration_ms` é o tempo de parede da mensagem inteira, incluindo modelo, ferramentas e a espera do usuário por autorização.
- `waiting_ms` é o valor acumulado de todos os intervalos de espera por permissão deste turno.
- Quando há vários `tool_call` precisando de autorização no mesmo turno, somar segmento a segmento:

```text
message_completion.waiting_ms = Σ permissionWaitDuration
```

### `agent_step`

- Manter os três tipos de step existentes: `reasoning`, `tool_call` e `generation`.
- Todos os steps reportam `waiting_ms`; os que não são `tool_call` têm o valor fixo `"0"`.
- `tool_call.duration_ms` mantém sendo o tempo de parede do início da ferramenta até seu encerramento, incluindo a espera por permissão.
- `tool_call.waiting_ms` acumula apenas a espera por permissão pertencente à chamada de ferramenta atual:

```text
tool_call.waiting_ms = Σ max(permissionWaitEndAt - permissionRequestedAt, 0)
```

- Não subtrair `waiting_ms` de `duration_ms`. Quando for necessário o tempo puro de execução, o consumidor calcula:

```text
execution_ms = max(duration_ms - waiting_ms, 0)
```

## Modelo de Estado

`messageTelemetry` continua sendo o único dono do estado do ciclo de vida da telemetry de UI.

- O prompt ativo guarda os intervalos de espera por permissão indexados por `requestId`.
- Cada intervalo contém no mínimo `requestedAt` e o `toolCallId` ao qual pertence.
- O step `tool_call` ativo guarda seu próprio `waitingMs` acumulado.
- Intervalos já encerrados mas sem o tool step correspondente são mantidos temporariamente, por `toolCallId`, com `waitingMs` e `earliestRequestedAt`, aguardando o preenchimento pelos eventos de ferramenta posteriores.
- O prompt guarda o `waitingMs` acumulado do turno inteiro, usado no `message_completion`.

O `toolCallId` é lido primeiro do payload bruto de permission; quando não for possível, usa-se o `requestId` atual do protocolo como fallback de correspondência. Quando não é possível casar com uma ferramenta ativa, a espera ainda é contada em `message_completion`, mas não é atribuída erroneamente a outro tool step.

## Tratamento de Eventos

### Requisição de Permissão

Ao receber `permission_request`:

1. Registrar somente se o prompt atual já estiver ativo.
2. Ser idempotente por `requestId`; stream/replay repetido não reseta `requestedAt`.
3. Registrar o `toolCallId` correspondente, para a atribuição do step.

### Resposta de Permissão

As duas entradas abaixo permitem encerrar o intervalo e dependem de deduplicação idempotente por `requestId`:

- o cliente atual submete com sucesso a resposta de permissão;
- o stream recebe `permission_response`, incluindo a resposta concluída por outro cliente.

Após o encerramento, somar a duração do intervalo ao prompt. Se o `tool_call` correspondente já existir, somar também ao step; se o tool step ainda não tiver aparecido, gravar a atribuição pendente agregada por `toolCallId` e em seguida remover o intervalo aberto daquele `requestId`. Assim preserva-se a idempotência no nível do request sem perder a atribuição à ferramenta por causa de respostas fora de ordem.

### Encerramento de Ferramenta ou Tarefa

- Quando o `tool_call` correspondente encerra, encerrar primeiro os intervalos de espera ainda abertos e pertencentes a essa ferramenta, usando o horário de encerramento da ferramenta.
- Quando um `tool_call_update` de estado terminal vem sem o `tool_call` anterior, o step de fallback deve absorver a atribuição de espera já encerrada e ainda aberta daquela ferramenta; seu `startedAt` não pode ser posterior à requisição de permissão mais antiga, e deve-se garantir `duration_ms >= waiting_ms`.
- Ao chegar em um estado terminal de mensagem como `task_complete`, `task_error` ou parada do usuário, encerrar todos os intervalos de espera ainda abertos com o horário de encerramento da mensagem.
- Portanto, quando o usuário interrompe a tarefa sem autorizar, `permission_request → finishedAt` continua sendo contado em `tool_call.waiting_ms` e em `message_completion.waiting_ms`.

## Fronteiras Multicliente e de Eventos Duplicados

- O `desktop-continuous` do desktop e o `web-remote-replayable` do celular usam o mesmo critério de agregação da telemetry, sem alterar seus respectivos protocolos de recuperação de mensagem.
- No replay replayable e quando listeners de foreground/background veem o mesmo request ou response mais de uma vez, não se deve resetar o ponto de partida nem acumular em duplicidade.
- Depois que o celular conclui a autorização, o `permission_response` recebido pelo observer do desktop consegue encerrar normalmente.
- Esta mudança não modifica as responsabilidades de negócio do relay, do main, do host ou do ZCode protocol.

## Validação e Testes

Os testes unitários devem cobrir:

| Caso | Cenário | Asserção |
| --- | --- | --- |
| PW01 | uma ferramenta solicita e conclui uma autorização | `waiting_ms` do tool e do completion iguais; os `duration_ms` dos dois níveis incluem a espera |
| PW02 | váriastools esperam autorização no mesmo turno de mensagem | completion igual à soma dos `waiting_ms` de cada tool |
| PW03 | a mesma ferramenta solicita autorização várias vezes seguidas | tool e completion acumulam todos os intervalos |
| PW04 | usuário para/a tarefa termina sem resposta de permissão | intervalos abertos são contados até o horário de encerramento |
| PW05 | entrega duplicada de request/response | o ponto de partida não é resetado e a espera não é acumulada em duplicidade |
| PW06 | outro cliente responde à permissão | a resposta no stream consegue encerrar a espera |
| PW07 | permission não casa com nenhuma ferramenta ativa | completion contabiliza a espera e nenhum tool step é contaminado |
| PW08 | step reasoning/generation | `waiting_ms="0"` |
| PW09 | permission request → response → terminal tool update, sem o tool call anterior | o tool step de fallback preenche a espera já encerrada, com `duration_ms >= waiting_ms` |
| PW10 | permission request → terminal tool update, sem o tool call anterior | a espera aberta é encerrada no terminal e atribuída ao tool step de fallback, com `duration_ms >= waiting_ms` |

Asserções de regressão de `duration_ms`:

- `message_completion.duration_ms` é sempre igual a `max(finishedAt - sendTime, 0)`;
- `agent_step.duration_ms` é sempre igual a `max(stepFinishedAt - stepStartedAt, 0)`;
- adicionar `waiting_ms` não altera nenhuma dessas duas fórmulas.

Após a implementação, executar os testes unitários relevantes, bem como os obrigatórios do repositório:

```bash
pnpm typecheck
pnpm lint
```

## Não Objetivos

- Não criar um agent step `permission_wait`.
- Não alterar `agent_step_cnt`, `loop_index` nem os tipos de step existentes.
- Não incluir neste `waiting_ms` as esperas de elicitation / AskUserQuestion.
- Não modificar a estrutura de armazenamento de telemetry do servidor nem os cálculos de dashboards externos.
