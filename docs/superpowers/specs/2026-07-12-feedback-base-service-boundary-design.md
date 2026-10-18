# Design da fronteira do serviço de feedback no cenário de desconexão SSH

## Contexto

O Centro de Feedback é uma capacidade de nível de aplicativo desktop. Criar ticket, ler informações do dispositivo, enviar capturas de tela e empacotar logs de diagnóstico são feitos pelo `feedbackService` fornecido pelo host process local do desktop, sem depender do sistema de arquivos do workspace atual, do runtime do Agent ou da conexão SSH.

Atualmente o `FeedbackHost` lê o `feedbackService` dos `services` de escopo de workspace. Quando o workspace SSH está normalmente conectado, o renderer mescla os base services com os remote services e o `feedbackService` acaba vindo ainda dos base services locais; mas quando a sessão remota ainda não está vinculada ou já foi desconectada, o resolvedor de serviços do workspace retorna um proxy de desconexão. A primeira chamada `getDeviceSnapshot()` do envio de feedback acaba lançando `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` direto no renderer, e a requisição nem chega à API de feedback.

## Objetivo

- O Centro de Feedback sempre usa explicitamente o `feedbackService` base registrado na inicialização do desktop.
- É possível enviar feedback com SSH normalmente conectado, conectando e desconectado.
- O comportamento de feedback existente para workspace local e SSH normalmente conectado permanece inalterado.
- Não altera o roteamento por workspace dos serviços de arquivos remotos, terminal, Git, Agent, task e session.
- Não altera a semântica de `desktop-continuous` no desktop, `web-remote-replayable` no celular, snapshot, queue ou owner/lease.
- O controle remoto Web continua usando o fallback de feedback unsupported existente; esta alteração não adiciona capacidade de feedback para Web.

## Não objetivos

- Não modificar as regras de proteção do proxy de desconexão `ZCODE_REMOTE_WORKSPACE_DISCONNECTED`.
- Não fazer com que serviços de escopo de workspace voltem genericamente aos services locais após a desconexão.
- Não ajustar o formulário de feedback, a captura de tela, o arquivamento de logs, o upload de anexos ou o protocolo da API de feedback.
- Não tratar do reconexão automática do SSH nem de problemas de ciclo de vida da sessão remota.

## Solução

`Root` já detém o `IServiceAccessor` base injetado na inicialização do renderer do desktop. Ele repassa o `feedbackService` contido nele como dependência independente para a UI de workspace, que por fim o entrega ao `FeedbackHost`.

`App` continua recebendo `services` de escopo de workspace, usados pelas capacidades de workspace como arquivos, tasks e terminal; o Centro de Feedback deixa de ler o `feedbackService` desse objeto. Isso torna explícita a fronteira de dependências:

- as capacidades de workspace dependem de `workspaceScopedServices`;
- a capacidade de feedback de nível de aplicativo depende de `baseFeedbackService`.

O ponto de montagem do Centro de Feedback, o store, o ciclo de vida do diálogo e a forma de ler o contexto da task/model atual permanecem inalterados, evitando ampliar as mudanças de comportamento da UI.

## Fluxo de dados

1. O renderer do desktop recebe a porta do service do host local e cria os base services.
2. `Root` recebe os base services e repassa `baseServices.feedbackService` para baixo como prop independente.
3. A tab SSH continua resolvendo os services de escopo de workspace conforme o estado da conexão: services mesclados quando conectado e proxy de desconexão quando não conectado.
4. `FeedbackHost`, independentemente do estado atual do workspace, chama o base feedback service recebido no passo 2.
5. O snapshot do dispositivo, a criação do ticket, o upload da captura de tela e o arquivamento dos logs continuam sendo concluídos no host local.

## Tratamento de erros

- A desconexão do SSH deixa de ser uma fonte de erro no envio de feedback.
- Erros reais da API de feedback, do upload de anexos ou do arquivamento de logs locais continuam sendo exibidos pelo fluxo existente, sem adicionar supressão de erros nem retry.
- As demais chamadas de serviço de um workspace remoto continuam recebendo `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` do proxy de desconexão, evitando que caminhos remotos sejam roteados por engano para a máquina local.

## Compatibilidade

- Workspace local do desktop: a instância passada é a mesma que o base feedback service já usado de fato hoje.
- SSH do desktop conectado: a instância de feedback nos services mesclados atuais já vem dos base services, portanto o objeto chamado não muda após a alteração.
- SSH do desktop conectando/desconectado: o proxy de desconexão passa a ser o base feedback service; essa é a única mudança de comportamento esperada nesta alteração.
- Controle remoto Web no celular: continua usando o unsupported feedback service injetado na entrada, sem novos estados de negócio remoto e sem contornar a fronteira de restauração replayable.
- macOS, Windows e Linux: apenas a escolha da dependência é ajustada, sem introduzir ramificações por plataforma.

## Design dos testes

Novos testes de regressão verificam que a escolha do serviço de feedback não depende dos services de escopo de workspace:

| Cenário | workspace services | feedback service | Esperado |
| --- | --- | --- | --- |
| Workspace local | base services | base feedback | comportamento inalterado |
| SSH conectado | merged remote services | base feedback | comportamento inalterado |
| Sessão SSH ainda não vinculada | disconnected proxy | base feedback | envio possível, sem lançar erro de desconexão |
| SSH desconectado | disconnected proxy | base feedback | envio possível, sem lançar erro de desconexão |

Os testes devem afirmar diretamente que `FeedbackHost` recebe o base feedback service explícito e evitar depender apenas da expansão do objeto preservar o campo por coincidência. Os testes existentes de envio de feedback continuam cobrindo `getDeviceSnapshot`, criação de ticket, anexos e fluxo de logs.

## Verificação

- Executar os novos testes de UI relacionados.
- Executar `pnpm typecheck`.
- Executar `pnpm lint`.
- Verificar que a fronteira de services local e SSH do desktop não sofreu diff adicional.