# Telemetria de criação de Session

## Definição (critério de medição)

`session_create` é contabilizado, via `/api/v1/event/report`, para as sessões formais efetivamente criadas pelo usuário (rascunho ou automação) e cuja primeira mensagem foi aceita.
Clicar em Group / Project apenas determina a origem; a origem para digitação direta no estado vazio padrão é `session`.
O `createSession` de pré-aquecimento, cliques repetidos em novo, rascunhos não enviados, abertura de histórico, turnos posteriores, fork, subagent e
automação que reaproveita uma sessão existente não são contabilizados. O relatório ocorre depois que a primeira entrada comum ou um comando Goal válido é aceito; falhas não são reportadas.
A automação só é contabilizada quando cria de fato uma Session e o primeiro sendPrompt é aceito, sem esperar por message_completion.

```text
Group / Project / estado vazio padrão de Session
    -> origem do rascunho (congelada antes do primeiro envio)
    -> session de pré-aquecimento ou fallback createSession
    -> primeira entrada accepted
    -> session_create (deduplicado por workspace identity + session)

Desktop IPlatformService -> IPC -> TelemetryCore -> /event/report
Mobile  IPlatformService -> payload do relay pareado -> Desktop Main -> TelemetryCore
Automation Host: criação + primeiro envio accepted -> mensagem de telemetria estrita -> Desktop Main -> TelemetryCore
```

O evento fixa `element_name=session_create`, `event_region=app`, `event_type=result`;
o `talk_id` de nível superior é o ID da session criada, `message_id` é obrigatório e corresponde ao command ID da primeira entrada aceita,
o mesmo valor de message_completion.message_id daquele turno. Os campos comuns de user/device/version/marketing seguem o TelemetryCore.

| Campo event_extra_detail | Valor |
| --- | --- |
| create_source | `group` / `project` / `session` / `automation_idle` / `automation_scheduled` |
| client_kind | `desktop` / `mobile` / `web`; mobile indica a entrada de controle remoto Web, sem adivinhar o dispositivo pelo UA |
| workspace_kind | `local` / `remote` |
| remote_kind | `ssh` / `wsl` / `docker` / `server` / string vazia |

O tipo de workspace reaproveita a telemetria de conversation: é remote se identity ou remoteSessionId for diferente de vazio;
remote_kind é extraído por `parseRemoteWorkspaceIdentity`, e uma identity desconhecida é mantida como remote.
O isolamento de identidade usa `workspaceIdentity?.trim() || workspacePath`, sem reportar caminho, texto original da identity ou endereço remoto.

O Project da barra lateral hoje é um agrupamento de workspace, sem um ID de projeto persistido independente. A tabela de sessions do CLI
tem `project_id`, mas `projectIdFromDirectory` apenas coloca o diretório em minúsculas, substitui símbolos e trunca em
80 caracteres; não é um ID opaco, não distingue hosts remotos com o mesmo caminho e pode colidir. O ACK de criação do V4 não o expõe.
O Tab ID é identidade de UI e o projectId do Coding Plan é o projeto de cobrança, portanto também não servem para este campo.
Esta entrega não adiciona nem fabrica um project_id; estatísticas em nível de projeto exigem antes um contrato de identidade estável entre plataformas e isolado por remoto.

## Contrato de automação e idempotência (complemento de 2026-09-15)

- create_source foi estendido com `automation_idle` / `automation_scheduled`. Em tempo ocioso, apenas `init`
  é contabilizado; `bound-first-run` / `resume` não são. Em agendado, apenas o ramo sem `targetTaskId` que de fato chama
  createTask é contabilizado. Tarefas agendadas criadas via prompt e vinculadas à session original não contam mensagens adicionais.
- A atribuição do disparo de automação é determinada pela função de dispatch do Host atual; após o sendPrompt ser aceito, o evento é encaminhado de forma estrita
  de Host → Main. O Main apenas valida/encaminha, não mantém estado de Session; a UI não complementa o relatório a partir de assinaturas.
- O client_kind da automação é desktop (host de execução), sem inferir em qual dispositivo a configuração da tarefa foi originalmente criada.
  O contexto do Host usa timezone/locale do ambiente de execução, screenResolution fica vazio e não se fabrica tamanho de tela.
- O TelemetryCore gera, para session_create, um event_id no formato UUIDv8 a partir dos 128 primeiros bits do SHA-256 de `[namespace de versão, user_id, talk_id]`. O próprio Session ID já é um UUID global; origem/dispositivo não participam da chave,
  portanto o mesmo usuário e a mesma Session mantêm o mesmo ID entre relatórios, retentativas e reconstruções do Core. Outros eventos continuam usando UUID aleatório.
- O event_id é usado pelo servidor para consumo idempotente; este repositório não contém a implementação de deduplicação do receptor de produção e não reivindica exactly-once ponta a ponta.
  Falhas de rede seguem o retry limitado já existente, sem introduzir fila persistente de envio. O relatório ocorre assim que algo é accepted, sem depender do evento de conclusão;
  o message_id usa a identidade do comando da primeira entrada, disponível já no momento do accepted, e não o ID da row do Assistant.
- Não alteram-se agendamento, owner/lease, CLI admission, nem os limites de restauração desktop continuous / mobile replayable.
- Testes: as funções reais de dispatch cobrem idle init/binding/continue-run, criação por cron/vínculo à session original, rejeição/espera do primeiro envio;
  schema/mensagem de forwarding do Host, retry do event_id e estabilidade com múltiplas instâncias; E2E desktop validando o event_id final.

## Limites

A única fonte de verdade do message_id é o comando de entrada: na UI, o primeiro envio comum/de pré-aquecimento/Goal usa o accepted ACK.commandId;
createSession(firstInput) usa o ACK.commandId daquele comando de criação; quando o primeiro envio ocorre depois de um createSession vazio,
usa-se o commandId do sendText/Goal, sem reutilizar por engano o comando de criação vazio. O reenvio após confirmação de restauração pelo usuário usa o commandId do novo ACK.
A automação usa o traceId do sendPrompt efetivo (runId para cron, task.traceId para idle init).
O schema estrito de forwarding do celular e do Host exige messageId não vazio; não é criado outro conjunto de IDs nem feita busca reversa a partir da mensagem de conclusão.
O event_id continua idempotente apenas por usuário e Session, sem incluir message_id na chave de idempotência do evento de criação.

```text
command ID da primeira entrada -> accepted ACK -> session_create.message_id
          \-> fato posterior de conclusão -> message_completion.message_id (mesmo valor)
```

O rascunho do usuário é reportado pela UI que o iniciou, e a criação por automação é reportada pelo Host que despachou; o Desktop não complementa o relatório a partir do fluxo de assinaturas do celular/desktop.
O celular apenas repassa o schema estrito deste evento, sem habilitar outros eventos de conversation originalmente exclusivos do desktop.
O Main não guarda session, queue, owner nem estado de negócio de deduplicação; usa as conexões pareadas e o TelemetryCore já existentes.
command, snapshot e comportamento de restauração de Desktop continuous e Mobile replayable permanecem inalterados,
com workspaceIdentity/remoteSessionId continuando repassados pelo attachment original.

A deduplicação mantém no Renderer as últimas 4096 combinações workspace/session, cobrindo callbacks de criação duplicados/múltiplos panes;
não reivindica exactly-once em caso de crash ou de perda de ACK por desconexão.
A telemetria é um caminho lateral: não bloqueia navegação nem envio, e não converte falha de reporte em falha de criação.

## Verificação

- Testes unitários: três origens; local/SSH/WSL/Docker/server/identity desconhecida; mobile+SSH;
  callbacks duplicados da mesma session contados uma única vez, isolamento por identity remota distinta no mesmo caminho; sem project_id/vazamento de caminho.
- Testes unitários: definição/reposicionamento da origem do rascunho; schema do celular rejeitando outros eventos/campos extras; forwarding do host.
- E2E pendente: pré-aquecimento com zero eventos, primeiro envio com um único evento contendo talk_id, envios seguintes e reabertura de histórico sem novo evento;
  origem Group/Project validada pela entrada real de criação na UI.
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @zcode/desktop typecheck:e2e`.

### Registro de verificação de 2026-09-15

- Electron no macOS com replay do modelo local do case aprovado: para as três entradas Project / Group / primeiro envio direto após refresh, o corpo final da requisição `/event/report`, zero relatórios no pré-aquecimento e ausência de duplicação em envios seguintes e reabertura de histórico.
  Run: `desktop-e2e-20260915062832206-p33122-e75382b73612e1b7`.
- Typecheck de todo o repositório, typecheck de E2E, lint (0 errors) e verificação de arquitetura aprovados.
- 8 arquivos de testes unitários relacionados, 173 casos aprovados, incluindo Goal accepted/rejected e isolamento de falha de reporte.
- O strict schema do celular e o forwarding do Desktop Main são cobertos por testes unitários; celular em aparelho real, SSH/WSL/Docker em aparelho real e UI Windows/Linux ainda não foram homologados, portanto não contam como E2E multiplataforma aprovada.
- A auditoria de cobertura de conversation de todo o repositório não passou: a linha de base já tinha erros de referência D19/I74/I75, números de estatísticas
  e três documentos gerados desatualizados; nesta entrega os metadados de fixture pendente foi 0 rejected.
- E2E permanece pendente, sem review/promoção manual.

### Verificação complementar de automação e event_id

- 11 arquivos de testes unitários relacionados, 137 casos aprovados; typecheck de todo o repositório, typecheck de E2E, lint
  (43 warnings existentes, 0 error) e architecture:check (0 violation) aprovados.
- E2E de criação pelas três entradas e do event_id final UUIDv8 aprovado:
  caso de criação do `desktop-e2e-20260915070847887-p40115-4254803e37acd6f0`.
- E2E de execução imediata de tarefa agendada criada pela UI e da cadeia completa Host → Main → `/event/report` aprovado:
  `desktop-e2e-20260915071458180-p44110-b9e884f38651cbd9`, com asserções sobre origem automation_scheduled,
  talk_id e event_id estável; as verificações de fixture dos dois casos passaram.
- idle init/binding/continue-run, acréscimo por cron targetTaskId e falha/espera do primeiro envio verificados por testes de isolamento das funções de dispatch de produção; não foram contabilizados como E2E de idle/remoto/celular em aparelho real. A deduplicação de event_id no receptor de produção não foi verificada.
- O typecheck de todo o repositório emite artefatos compilados do Host e não pode rodar em paralelo com o empacotamento/execução do Electron; o E2E final de automação desta entrega foi reconstruído e executado após a conclusão do typecheck. O mock de conta é isolado explicitamente e o formulário seleciona explicitamente o modelo de replay do case.

### Verificação complementar de message_id

- 8 arquivos de testes unitários relacionados, 110 casos aprovados, cobrindo comum/pré-aquecimento/Goal, envio após criação vazia, reenvio em confirmação de restauração,
  ID do primeiro envio em idle/agendado, schema obrigatório e forwarding em celular/Host; o event_id não muda com o message_id.
- E2E das três entradas aprovado: `desktop-e2e-20260915072807214-p50394-fa16c0175fef4bc5`.
  Confirmou-se turno a turno que o message_id dos eventos de criação e de conclusão é igual; a asserção de associação do Group foi concluída antes do refresh,
  evitando interpretar como divergência de ID um reporte assíncrono ainda incompleto durante o refresh.
- E2E de tarefa agendada aprovado: caso automation-run-title-stable do `desktop-e2e-20260915072551534-p48619-f5fdee3f954ae066`, com o message_id final dos dois eventos HTTP igual ao runId.
- Typecheck de todo o repositório, typecheck de E2E, lint (43 warnings, 0 errors) e verificação de arquitetura aprovados.
  As duas verificações de fixture passaram. O status de verificação em aparelho real de celular e remoto segue o da seção anterior, sem alegar nova cobertura em aparelho real.