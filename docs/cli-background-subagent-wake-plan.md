# Plano de Correção do Background Subagent do zcode-cli

## Objetivo

Este plano se baseia somente no worktree atual, sem referência a outros branches. O objetivo não é reimplementar o subagent, mas corrigir o problema de despertar na conclusão do background subagent com base no `Agent` / profile loader / child runtime / `RuntimeTaskRegistry` existentes, e completar o mecanismo central de conversão automática de foreground subagent para background após timeout.

Comportamento esperado:

- Após `Agent(run_in_background=true)` retornar `async_launched`, o main agent pode finish/idle normalmente.
- Quando o background subagent conclui, o runtime pai dispara automaticamente um turn model-only, injetando `<task-notification>` como synthetic user input de `background_task` na provider request, para que o main agent continue tratando do resultado.
- Se a conclusão acontecer com o turno pai ainda active, continua-se reutilizando o drain pre-request do turno active, sem injeção duplicada.
- O foreground subagent passa automaticamente para background após o limiar de 120000ms quando a configuração está ligada; por padrão permanece desligado e só é habilitado pela chave de configuração.

## Não Objetivos

Estas capacidades já existem hoje ou não pertencem a esta rodada de correção e não entram no P0:

- Reimplementar a tool `Agent` ou o alias `Task` compatível com Claude Code.
- Reimplementar o profile loader, o carregamento de Markdown de `.zcode/agents` de usuário/projeto e o carregamento de agents de plugin.
- Tornar `Explore` o agent padrão. Hoje, ao omitir `subagent_type`, o padrão é `general-purpose`; `Explore` é apenas um built-in especializado.
- Reimplementar os built-in profiles `general-purpose` / `Explore`, a criação do child runtime, a escrita de artifacts, o `SendMessage`.
- teammate, swarm, workflow, worktree isolation, `TaskCreate` / `TaskList` / `TaskUpdate` voltados ao modelo.
- Recuperar background subagents em execução após restart de processo, ou persistir uma outbox de notifications não consumidas; nesta rodada o queued command continua sendo estado de runtime em processo, e não uma outbox durável.

A considerar em P1:

- Entradas de UI ou SDK como control request `background_tasks` / Ctrl+B.
- Superfície de compatibilidade de `TaskStop` / `TaskOutput`.

## Snapshot Atual da Implementação

### Agent e profile

- Em `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`, `parsed.subagent_type ?? AgentType.GeneralPurpose`; ao ser omitido, o padrão é `general-purpose`.
- Em `apps/zcode-cli/packages/core/src/subagent/profile.ts`, `DEFAULT_SUBAGENT_TYPE = GENERAL_PURPOSE_AGENT_TYPE`; `normalizeAgentProfiles()` registra primeiro o built-in `general-purpose`, depois o built-in `Explore` e por fim sobrescreve com os profiles de usuário/projeto/plugin.
- `apps/zcode-cli/packages/bootstrap/src/subagents.ts` já carrega `~/.zcode/agents` de nível de usuário, `.zcode/agents` de nível de projeto e `agents/*.md` de plugin, preservando os nomes reservados `general-purpose` / `Explore`.
- `apps/zcode-cli/packages/contracts/src/tools/agent.ts` já tem `run_in_background`, e a saída contém os dois estados `completed` e `async_launched`.

### Subagent runner

- O `createExploreSubagentPort` em `apps/zcode-cli/packages/core/src/subagent/runner.ts` ainda tem um nome um pouco antigo, mas na prática é uma port baseada em profile.
- `launch()` decide entre `start()` e `run()` com base em `runInBackground` ou no profile `background`.
- `start()` já consegue iniciar direto em background: registra a task `local_agent`, retorna `async_launched` e, quando o child runtime assíncrono termina, chama `finalizeBackgroundCompletion()` / `finalizeBackgroundFailure()`.
- `run()` já consegue passar de foreground para background: depois de registrar a task com `isBackgrounded=false`, faz race entre `runAgentToCompletion()` e `RuntimeTaskRegistry.waitForBackgroundRequest(agentId)`; ao receber um background request, retorna imediatamente `async_launched`, e a mesma promise de completion do child continua sendo concluída em background.
- `RuntimeTaskRegistry.requestBackground(id)` já consegue marcar uma task não terminal como `isBackgrounded=true` e resolver os waiters.
- O que falta hoje é o timer que dispara `requestBackground()` automaticamente e a limpeza de lifecycle.

### Notificação do runtime pai

- Em `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`, `pendingBackgroundTaskNotifications` é um array em memória privado do `AgentRuntime`.
- Em `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`, `enqueueParentNotification` apenas faz `push({ queuedAt, text, traceContext })`.
- O drain em `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts` grava a notification em `messageHistory.addUser(...)` e a persiste com `source: "background_task"`.
- `executeTurn()` e `runRegularTurnLoop()` chamam o drain antes de um turno/requisição já existente, de modo que «a próxima entrada explícita do usuário» ou «a próxima model request de um turno active» conseguem ver `<task-notification>`.
- Se o turno pai já Finishou/entrou em idle, hoje não há queue subscriber / wake scheduler, e portanto a conclusão fica apenas no array em memória, sem gerar automaticamente a próxima model request do pai.
- `ExecuteTurnOptions` já suporta `inputVisibility: "model-only"` e `inputSource: "background_task"`, podendo servir de base mínima para a implementação do idle wake.

### Cobertura de testes atual

- `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts` já cobre o `general-purpose` padrão, o background launch e o drain da conclusão em um «turn explícito posterior».
- Os testes de background existentes chamam manualmente `runtime.executeTurn("continue")` depois que a subtarefa conclui, de modo que não cobrem o «wake automático após o turno pai ficar idle».
- A continuação de Bash/goal já tem testes de model-only turn, e suas asserções podem ser reutilizadas para verificar `inputVisibility` / `inputSource`.

## Gaps e Causa Raiz

Gaps de P0:

- **Falta de idle wake**: hoje a queue só é drenada dentro de um turno/requisição já existente; não há mecanismo de reentrada de queued command depois que o main pai fica idle.
- **Queue muito crua**: `pendingBackgroundTaskNotifications` é um array, sem idempotência, claim, batch, nem estado e logs de wake scheduled / skipped / drained.
- **Falta do timer de auto-background**: o `requestBackground()` interno e a corrida de foreground já existem, mas não há timer de 120000ms controlado por chave de configuração, nem a fronteira de cancelamento do timer em completion/failure/cancel.
- **Os testes não fixam a forma**: os testes atuais só verificam que a notification é consumida em um «turn explícito posterior», sem verificar que a conclusão em background dispara automaticamente uma model request do pai.
- **As estatísticas de usage precisam preservar o valor real**: o runner atual já agrega `tool_uses` a partir dos events do child, mas é preciso adicionar cobertura de teste para impedir que o `tool_uses` no metadata/notification de background volte a 0.

Forma de falha de referência:

- Em `sess_bc1e9c8a-80a0-4bda-a927-6fde7ec6dc4c`, o turno pai já tinha finish, a sub-session concluiu normalmente depois e escreveu o output, mas a sessão pai não teve nova model request nem synthetic notice de `background_task`. Isso corresponde à causa raiz «completion entrou na queue e ninguém acordou».

## Solução

### 1. Queue interna de notifications de background do runtime

Encapsular `pendingBackgroundTaskNotifications: PendingBackgroundTaskNotification[]` em uma API de queue interna do runtime. O P0 não introduz outbox em SQLite; continua sendo estado em processo.

O design da queue já é reservado desde o início para múltiplas sources de runtime task: nesta rodada a prioridade é fazer o background subagent `local_agent` funcionar, e somente na última fase `local_bash` e `monitor_mcp` são conectados ao mesmo desenho de queue/wake. Ou seja, a API e os campos de idempotência não devem ser escritos pensando apenas em subagent, mas a implementação e a aceitação dos primeiros phases não podem ser atrasadas por Bash/monitor.

Forma de dados sugerida:

```ts
interface PendingBackgroundTaskNotification {
  id: string;
  taskId?: string;
  toolUseId?: string;
  source: "local_agent" | "local_bash" | "monitor_mcp";
  text: string;
  traceContext: TraceContext;
  queuedAt: Date;
}
```

API sugerida:

```ts
enqueueBackgroundTaskNotification(notification): "queued" | "duplicate";
drainBackgroundTaskNotificationsForActiveTurn(traceContext): PendingBackgroundTaskNotification[];
claimBackgroundTaskNotificationsForIdleWake(): PendingBackgroundTaskNotification[];
hasPendingBackgroundTaskNotifications(): boolean;
scheduleBackgroundTaskNotificationWake(reason): void;
```

Restrições-chave:

- Usar `taskId + toolUseId + terminal status` ou o `id` da notification para idempotência, evitando enfileiramento duplicado pelos caminhos de completion/failure.
- O drain de turno active e o idle wake consomem da mesma queue; o idle wake precisa fazer claim antes de iniciar o turn model-only, evitando nova injeção pelo drain de pre-turn.
- O drain de runtime command externo forma de forma síncrona um snapshot da queue sempre que estiver disponível; se o próximo command executável for `task-notification`, um único claim do snapshot inclui todos os `task-notification` de mesma prioridade, unidos por linhas em branco em um batch input na ordem de queuedAt/admission.
- O batch não cruza prioridades nem absorve notifications enfileiradas depois do retorno do claim; não se adiciona microtask, debounce ou outra janela de espera. Resultados tardios ficam para o próximo **drain válido de notification**: se o outer batch atual produzir uma tool continuation, ela pode ser fundida pelo drain active-loop existente na próxima provider request do mesmo turno; se a request atual for diretamente terminal, é o próximo outer drain que faz o claim.
- O batch cobre apenas o mode `task-notification`; `prompt`, `target-continuation` e `subagent-message` mantêm suas próprias semânticas de consumo. Se a fila de mesma prioridade começar com uma notification, é possível atravessar outros modes coletando itens do mesmo mode; se outro mode for selecionado primeiro, esse command é executado primeiro.
- O lote inteiro persiste uma única synthetic user message `background_task` / `model-only`; cada input de ledger de notification é liquidado de forma independente e todos apontam para a mesma message, evitando que a cold hydration reconstrua um lote de resultados em vários turnos vazios.
- Não se adiciona metadata/schema exclusivo de batch. Se cada membro do batch tiver `originMeta` estruturado, continua-se reutilizando o `BackgroundResultOriginMeta` comum: `backgroundSource/workId` assume o membro com admission mais antigo como âncora de rastreamento de exibição, e `title` é composto na ordem de admission; exibem-se no máximo os três primeiros titles e os demais são agrupados como `· +N`. A synthetic message persistida e o turno live precisam reutilizar o mesmo objeto composto. Se algum membro estiver sem metadata estruturado, nada é interpretado retroativamente a partir do texto de `<task-notification>` e o lote inteiro mantém o caminho de compatibilidade sem `originMeta`.
- Se, depois do claim, o runtime for encontrado como active novamente, o lote precisa voltar ao início da fila ou o claim é abandonado e reagendado; nenhuma notification pode ser perdida.
- Uma vez claimed, o command de notification é agendado como at-most-once: falha terminal de provider/model ou stop não reenfileira o command automaticamente, evitando despertares duplicados. Ao mesmo tempo, o batch inteiro de synthetic input model-only precisa ser persistido antes da query; portanto, falha/stop apenas encerra este turno assistant/model, e o conteúdo da notification continua no transcript, sendo carregado por uma entrada válida posterior. O retry de attempt limitado dentro do provider adapter pertence à mesma query e não equivale a um reenvio do command.

### 2. Scheduler de idle wake

Adicionar dentro do `AgentRuntime` um scheduler leve, em vez de criar um novo protocolo de app stdio.

Pontos de disparo:

- Depois que `enqueueBackgroundTaskNotification()` enfileira com sucesso, chamar `scheduleBackgroundTaskNotificationWake("enqueue")`.
- Depois que `finishActiveTurn()` limpa o active turn, se a queue ainda tiver pendentes, chamar `scheduleBackgroundTaskNotificationWake("turn_finished")`. Isso cobre a corrida em que «a notification chegou com o turno pai ainda active, mas a última model request já havia terminado».

Lógica de execução:

1. No instante em que o scheduler/drain fica realmente executável, fazer claim síncrono de todas as notifications qualificadas naquele momento, sem esperar resultados do mesmo tick e sem debounce.
2. Se `activeTurn` existir, registrar debug/info e sair; aguardar o active drain ou `finishActiveTurn()` para reagendar.
3. Se não houver pendentes, não fazer nada.
4. Fazer claim do batch pendente.
5. Chamar `executeTurn(batchText, undefined, { inputVisibility: "model-only", inputSource: "background_task", displayInput: "Background task completed", inputId: "background-task:<first-id>", traceContext })`.
6. O conteúdo de usuário mais recente, visível ao provider nesse turno, é exatamente `<task-notification>`; o snapshot voltado à UI não deve criar uma nova bolha de usuário real.

Atenção:

- Não inserir texto real de usuário como “continue” / “please continue”.
- Não passar por `recordExternalUserPrompt`, evitando registrar a conclusão de background como entrada de usuário.
- O turno de wake continua usando o caminho existente de model request / tool loop / persistência / eventos, para que o main agent possa continuar chamando ferramentas ou respondendo ao usuário.

### 3. Mudança no enqueue de completion

`finalizeBackgroundCompletion()` / `finalizeBackgroundFailure()` continuam responsáveis por:

- gravar `metadata.json` / `output.txt` / `task.output` / transcript artifact;
- atualizar o estado terminal do `RuntimeTaskRegistry`, `notified: true` e usage;
- emitir eventos como `SubagentStopped` / `BackgroundTaskCompleted`.

Mas, na entrega da notification, passa-se a chamar a API de queue:

- `source: "local_agent"`.
- `id` usando o id da task/agent mais o status terminal, garantindo idempotência.
- `taskId` usando `agentId` / backgroundTaskId.
- `toolUseId` usando o id da tool call do pai.
- `text` continuando gerado por `formatTaskNotification()`, mantendo o `<task-notification>` com aparência de mensagem de usuário.

### 4. Timer de auto-background do foreground subagent

Adicionar o timer no caminho `run()` de foreground existente, sem reiniciar o child e sem alterar o caminho direto de `start()` em background.

Configuração sugerida:

- `AgentRuntimeConfig.subagents.autoBackgroundMs?: number`.
- Padrão `0` ou `undefined`, ou seja, desligado.
- Mapeado pela configuração do bootstrap: quando a chave está ligada, define `120000`; se depois houver uma product beta flag, ela se conecta ao mesmo campo.
- Os testes podem passar diretamente um limiar curto.

Lifecycle:

- Depois que o `run()` de foreground registra a task, se `autoBackgroundMs > 0`, iniciar o timer.
- Na expiração, o timer apenas chama `registry.requestBackground(lifecycle.agentId)`.
- Limpar o timer em completion, failure, abort e após o background manual.
- Depois que o timer dispara, a corrida de foreground segue o ramo existente de `waitForBackgroundRequest()`, retorna `async_launched`, e a promise de completion do child continua finalizando em background.

### 5. Logs e superfície de diagnóstico

Os logs usam o runtime/core logger:

- `info`: notification enqueued, idle wake iniciado/concluído, auto-background disparado. São eventos de lifecycle de baixa frequência.
- `debug`: wake ignorado por active/sem pendentes, duplicata ignorada, tamanho do batch e outros detalhes de diagnóstico.
- `warn`: falha ao iniciar o wake turn, necessidade de requeue após claim, timer disparado mas a task não existe ou já está terminal.

Não registrar cada streaming chunk / tool delta como info.

## Passos de Implementação

1. **Refatorar a fronteira da queue**
   - extrair o id/source/task metadata de `PendingBackgroundTaskNotification`;
   - convergir `pendingBackgroundTaskNotifications.push/splice` para a API de queue;
   - manter inicialmente inalterado o comportamento de drain do turno active, provando com teste que o turno explícito posterior ainda enxerga a notification.

2. **Adicionar o idle wake**
   - agendar o wake após o enqueue e após `finishActiveTurn()`;
   - fazer o wake entrar no loop existente via `executeTurn(..., { inputVisibility: "model-only", inputSource: "background_task" })`;
   - adicionar proteção contra corridas: não acordar com active, no-op quando o pending foi drenado pelo active drain e permitir requeue quando houver conflito de active após o claim.

3. **Adicionar o auto-background**
   - criar o campo de configuração `subagents.autoBackgroundMs`;
   - registrar/limpar o timer no `run()` de foreground;
   - o timer chama apenas `RuntimeTaskRegistry.requestBackground()`, reutilizando a corrida existente de foreground para background.

4. **Proteger o usage contra regressão**
   - garantir que o `totalToolUseCount`, o event payload, o metadata e o `<usage><tool_uses>` da conclusão em background venham da agregação real dos events do child runtime;
   - adicionar teste unitário para «child com múltiplos tool results tem usage diferente de zero na notification de background».

5. **Adicionar testes**
   - idle wake: iniciar `Agent(run_in_background=true)`, depois que o turno pai finish, liberar o child e afirmar que aparece automaticamente a 3ª/4ª model request do pai contendo `<task-notification>`;
   - active drain: a conclusão ocorre dentro de um turno active; afirmar que a próxima request do mesmo turno consome a notification e que o idle scheduler é no-op;
   - no duplicate: o mesmo completion enfileirado repetidamente é injetado apenas uma vez;
   - model-only persistence: a message persistida tem `source === "background_task"` e `visibility === "model-only"`, e a UI não exibe uma bolha de usuário real;
   - auto-background: fake timer / limiar curto fazem o Agent de foreground retornar `async_launched`, e a conclusão do child dispara o notification wake;
   - desligado por padrão: sem `autoBackgroundMs` configurado, o Agent de foreground não vai para background automaticamente.

6. **Fase final: unificar as outras runtime tasks de background**
   - o objetivo é, depois que o caminho de background do subagent estiver estável, incluir `local_bash` / `monitor_mcp` no mesmo mecanismo de queue/wake;
   - `local_bash` já tem a base de enqueue de completion via `BackgroundTaskTracker`; nesta fase ele passa a reutilizar o novo claim / idle wake / queue idempotente, sem pressa de mudar o XML shape visível ao provider;
   - `monitor_mcp` precisa ter confirmados a origem atual da runtime task e a entrada de completion antes de ser conectado ao mesmo source metadata;
   - a restrição de design dessa fase é: a API de queue, o source metadata, a dedupe key e o wake scheduler devem suportar `local_agent` / `local_bash` / `monitor_mcp` desde o início, mas a ordem de implementação continua tendo `local_agent` como prioridade;
   - a convergência completa do XML shape visível ao provider para Bash/monitor é avaliada como uma subseção posterior dessa fase, sem bloquear a aceitação do background do subagent.

## Critérios de Aceitação

- O turno pai de `Agent(run_in_background=true)` pode finish com sucesso primeiro; depois que a subtarefa conclui, sem nova entrada do usuário, o runtime pai inicia automaticamente uma continuation request model-only.
- A request visível ao provider do wake automático contém um `<task-notification>` com role de usuário, sem wrapper de `<system-reminder>` e sem texto real de usuário extra.
- O session store mostra o synthetic notice com `source: "background_task"`, e a projeção voltada à UI não o renderiza como mensagem enviada pelo usuário.
- O foreground subagent só passa para background por timeout quando a configuração está ligada; o comportamento padrão não muda.
- O tool result retornado após o auto-background continua sendo `async_launched`, e a conclusão segue o mesmo caminho de completion notification/wake.
- `general-purpose` continua sendo o agent padrão, e `Explore` não vira o padrão.
- `pnpm lint` e `pnpm typecheck` passam; havendo falhas já existentes do ambiente, é preciso registrar na descrição do commit os arquivos e a razão exatos da falha.

## Riscos

- **Risco de reentrada**: o turno de wake não pode iniciar enquanto um turno active não tiver terminado, sob pena de quebrar a máquina de estados de turnos. O controle precisa ser feito com a dupla guarda de `activeTurn` e `finishActiveTurn()`.
- **Risco de injeção duplicada**: depois que o active drain e o idle wake passam a compartilhar a queue, claim/drain precisa ter semântica atômica.
- **Risco de poluição de entrada do usuário**: o wake de background não pode passar pelo caminho de persistência de prompt comum de usuário nem gerar uma bolha de usuário real.
- **Risco de fronteira de retry/perda**: só são permitidos retries limitados de attempt do provider dentro da mesma query; failure/stop terminal não reenfileira um command já claimed, mas precisa preservar o batch input persistido antes da query e verificar que as requisições seguintes nem perdem conteúdo nem injetam duplicata.
- **Risco de mobile/remoto**: esta rodada mexe apenas no runtime interno do zcode-cli; se depois o idle wake de app/service for conectado à cadeia, é preciso abrir uma spec separada descrevendo a fronteira entre desktop continuous e web-remote replayable.