# Notificações de Intervenção Humana

## Contexto

Quando uma tarefa do ZCode roda em segundo plano e entra em um estado bloqueante que exige intervenção do usuário,
este talvez não volte ativamente à janela para verificar. A notificação desktop precisa cobrir esses estados
bloqueantes, evitando que a tarefa fique parada por muito tempo esperando confirmação.

## Escopo

Eventos de intervenção humana que devem disparar notificação:

- `permission_request`: confirmação de permissão comum de ferramenta.
- `elicitation_request`: confirmações de entrada/escolha do usuário, incluindo confirmação de plano do
  `AskUserQuestion` e do `ExitPlanMode`, além das perguntas e respostas genéricas mapeadas pelo `interaction/requestUserInput`
  na camada de protocolo.

Eventos que não disparam notificação nesta rodada:

- `task_complete` / `task_error`: já existe uma notificação independente de conclusão/falha.
- `turn_steer_queued`, `runtime.pendingCommands`, queued prompt: representam entrada futura ou fila do host, e não uma
  tarefa aguardando confirmação do usuário no momento.
- `apiRetry` / retry de provider: estado de nova tentativa automática, sem necessidade de ação do usuário.
- `backgroundBashJobs`: estado de execução de comandos em segundo plano, que não indica tarefa bloqueada em entrada do
  usuário.
- `providerRuntimeHeaders.request`: a semântica atual do produto é renovar automaticamente o runtime header antes da
  requisição do modelo; se a interação na verificação de segurança da versão oficial precisa de notificação do sistema
  será decidido à parte.

## Limites da notificação

- quando o live stream recebe `permission_request` ou `elicitation_request`, o renderer envia uma notificação localizada
  via `IPlatformService.showTaskNotification`.
- clicar na notificação apenas ativa o workspace/task ao qual ela pertence, sem abrir nem enviar o diálogo diretamente.
- o dedupe da notificação usa `taskId + status + requestId`, de modo que a mesma requisição não gere mais de uma notificação;
  permission e elicitation usam `status` diferentes, facilitando a investigação e futuras estatísticas.
- os `pendingElicitations` restaurados de um snapshot `web-remote-replayable` apenas recuperam o estado de UI, sem
  reenviar ativamente notificações do sistema, evitando repetir a notificação de requisições antigas bloqueadas após a
  reconexão.
- o fluxo principal desktop `desktop-continuous` continua consumindo apenas live events, sem introduzir semântica de
  restauração replayable.

## Semântica do badge na lista de tarefas

O badge "aguardando confirmação" da lista de tarefas indica que a tarefa tem requisições de intervenção humana
bloqueantes, incluindo permission e elicitation. Esse badge não acende o ponto azul de não lido; não lido continua
significando apenas um estado final em segundo plano ou atualização de conteúdo ainda não visualizada.

## Pontos de verificação

- `permission_request` em primeiro plano / segundo plano continua enviando a notificação `permission_request`.
- `elicitation_request` em primeiro plano / segundo plano envia a notificação `elicitation_request`.
- AskUserQuestion e ExitPlanMode compartilham o mesmo caminho de notificação via `elicitation_request`.
- a visão normal e a visão agrupada da lista de tarefas exibem "aguardando confirmação" quando existe uma elicitation.
- a restauração de `pendingElicitations` a partir de um snapshot replayable não dispara notificações do sistema extras.
