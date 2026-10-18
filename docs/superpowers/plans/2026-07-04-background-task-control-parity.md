# Plano de implementação do controle de background tasks

> Status: implementado e arquivado. Este arquivo registra o escopo final, os resultados por fase, os
> comandos de verificação e as capacidades deliberadamente adiadas para trabalho futuro.

## Objetivo

Oferecer controle de stop/cancel acionável pelo usuário para `local_bash` e `local_agent` que já
entraram em background, e implementar a tool `TaskStop` visível ao provider. A implementação precisa
reaproveitar o `RuntimeTaskRegistry`, a notificação de background, a fila de comandos do runtime, a
projeção de session e a cadeia `session/cancelBackgroundTask` já existentes, sem criar um segundo
background manager, poller, wake ou caminho de stop na UI.

## Arquitetura final

- há no Runtime um dispatcher de stop de background task com registry-first;
- a tool `TaskStop` e o cancel por UI/session compartilham o mesmo dispatcher;
- o stop de `local_bash` é despachado para `ExecutionPort.cancelBackgroundTask(taskId)`;
- o stop de `local_agent` é despachado para `SubagentPort.stopTask(taskId)`;
- semântica de `TaskStop.command`: `local_bash` usa o comando real, `local_agent` usa a `description`
  curta; o `prompt` completo do subagent não pode entrar no resultado do stop;
- o estado terminal continua passando por registry terminal update -> task notification -> runtime
  command queue;
- a UI mantém apenas o SummaryPanel como superfície de controle de background task;
- o `AgentToolCallBlock` é responsável apenas por exibir os detalhes do Agent em background e não
  duplica a lógica de requisição de stop;
- o ACK de stop via RPC indica apenas que o runtime recebeu a requisição de parada; o stop pendente na
  UI só é liberado quando o estado de controle da background task deixa de estar active.

## Âncoras de código

- contrato de `TaskStop`: `apps/zcode-cli/packages/contracts/src/tools/task-stop.ts`
- handler de `TaskStop` voltado ao model: `apps/zcode-cli/packages/core/src/tool/handlers/task-stop.ts`
- dispatch de stop de background no Runtime: `apps/zcode-cli/packages/core/src/runtime/methods/background.ts`
- protocolo de cancel por UI/session: `session/cancelBackgroundTask` em `packages/shared/src/zcode-protocol/index.ts`
- stop de task Bash: `apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-lifecycle.ts`
- stop de task Agent: `apps/zcode-cli/packages/core/src/subagent/runner.ts`

## Fases concluídas

### Fase 0 - Spec e guarda de baseline

- [x] Escopo fixado no controle de stop de `local_bash` / `local_agent` já em background, mais a
  `TaskStop` visível ao provider.
- [x] Controles foreground-to-background, `TaskOutput` e tipos de task não compartilhados ficaram fora
  desta rodada.
- [x] Âncoras de código e pontos de partida atuais do ZCode registrados.

### Fase 1 - Dispatcher de stop do Runtime

- [x] Adicionado dispatch de stop de background task no runtime com registry-first.
- [x] Preservado o comportamento idempotente de UI/session para tasks ausentes ou já terminais.
- [x] Adicionado comportamento estrito de tool para erros de validação de `TaskStop`.
- [x] O dispatcher permanece livre de novas filas, pollers, timers ou geração de notificação visível
  ao provider.

### Fase 2 - Handler de stop do subagent

- [x] Adicionado `SubagentPort.stopTask()` para `local_agent` em execução em background.
- [x] O stop do Agent em background usa o controller de ciclo de vida salvo e grava o estado terminal
  pelo mesmo caminho de conclusão de background.
- [x] O stop não usa a projeção da UI como fonte de verdade.
- [x] O comportamento existente de launch/run/start/backgroundTask/sendMessage continua pertencendo ao
  runtime de subagent.

### Fase 3 - Idempotência terminal e ordem de notificação

- [x] Stop e conclusão natural são terminal-idempotentes para Bash e Agent.
- [x] `notified` só é marcado depois que o enqueue da notificação tem sucesso.
- [x] A ordem terminal de background continua sendo registry terminal update -> enqueue notification ->
  event/projeção assíncrona.
- [x] O defer do goal continua lendo as background tasks em execução de `RuntimeTaskRegistry` em vez
  da projeção da UI.

### Fase 4 - Tool TaskStop visível ao provider

- [x] Adicionados o contrato e o handler de `TaskStop`.
- [x] A entrada aceita `task_id` e o alias obsoleto `shell_id`.
- [x] A validação retorna erros distintos para id ausente, task não encontrada e task não em execução.
- [x] O resultado é compatível com JSON e não expõe snapshots/projeções internas.
- [x] O campo `command` do resultado usa a `description` curta da runtime task para `local_agent`, e a
  mensagem de sucesso reutiliza o mesmo valor entre parênteses, sem expor o `prompt` completo.
- [x] Os aliases `KillShell` / `KillBash` são suportados via lookup no runtime, sem se tornarem tools
  visíveis ao provider.
- [x] Runtimes filhos padrão podem expor `TaskStop` para background tasks locais ao runtime; perfis
  customizados continuam usando o filtro existente de allow/disallow.

### Fase 5 - Protocolo e superfície de controle da UI

- [x] O nome de protocolo `session/cancelBackgroundTask` foi mantido para evitar churn de protocolo.
- [x] Adicionado um modelo de item de controle genérico de background task para Bash e Agent.
- [x] Removida a superfície duplicada de painel de background task de longa duração.
- [x] O SummaryPanel agora é a única superfície de controle de background task.
- [x] Tasks Bash e Agent compartilham o mesmo comportamento de botão de stop e a mesma chamada de
  protocolo.
- [x] O botão de stop fica desabilitado por task enquanto o stop está pendente.
- [x] O stop pendente só é limpo depois que a task deixa de estar active, e não imediatamente após o
  ACK do RPC de stop.
- [x] As chaves de cache de snapshot/replay preservam a semântica de `workspaceIdentity` /
  `workspacePath`.

### Fase 6 - Cobertura E2E

- [x] Catálogo de casos de conversation-session e matriz de cobertura atualizados para os casos de
  controle de background.
- [x] Cobertura E2E promovida para o stop de UI de Bash em background.
- [x] Cobertura E2E promovida para o stop de UI de Agent em background.
- [x] Cobertura E2E promovida para o caminho de `TaskStop` em Agent.
- [x] A regressão de exibição de conclusão natural do Agent em background está coberta pelo E2E de
  background promovido.
- [x] Casos E2E de stop/controle usam setup, ação e asserção explícitos.

### Fase 7 - Gate de regressão

- [x] Validação de replay E2E e testes focados de core, UI, shared e services executados durante a
  implementação.
- [x] `pnpm typecheck` executado.
- [x] `pnpm lint` executado.
- [x] `git diff --check` executado.
- [x] Mudanças visíveis ao provider revisadas e a forma XML da notificação de background mantida
  inalterada neste escopo.

## Registro de validação

Comandos executados durante a implementação e a limpeza:

```bash
pnpm exec oxfmt --check apps/zcode-cli/packages/core/src/tool/executor/impl.ts apps/zcode-cli/packages/core/tests/task-stop-tool.test.ts apps/zcode-cli/packages/core/tests/tool-contracts.test.ts packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts
pnpm --filter @zcode/core exec vitest run tests/task-stop-tool.test.ts tests/background-task-control.test.ts tests/tool-contracts.test.ts tests/subagent-explore.test.ts -t "TaskStop|background task control|orders shared provider-visible|runs through Agent"
pnpm exec vitest --run packages/ui/test/zcodeSessionProjection.test.ts packages/ui/test/agentToolCallBlock.test.ts -t "task notification|background Agent|single background task"
pnpm exec vitest --run packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts -t "task notification|background Agent"
pnpm exec vitest --run packages/shared/test/backgroundBashJobs.test.ts packages/ui/test/chatViewSummaryPanel.test.ts packages/ui/test/zcodeBackgroundTaskControl.test.ts -t "background Agent|background task|background Bash|running task"
pnpm exec vitest --run packages/shared/test/backgroundBashJobs.test.ts packages/ui/test/chatViewSummaryPanel.test.ts packages/ui/test/backgroundTaskSnapshotSync.test.ts packages/ui/test/zcodeBackgroundTaskControl.test.ts packages/ui/test/longRunningToolCalls.test.ts
pnpm exec vitest --run packages/ui/test/zcodeBackgroundTaskControl.test.ts packages/ui/test/chatViewSummaryPanel.test.ts
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-background.test.ts'
pnpm typecheck
pnpm lint
git diff --check
```

## Escopo deliberadamente adiado

Estas são capacidades adjacentes conhecidas, mas que foram deliberadamente não implementadas neste
plano:

- Adiado: comando foreground-to-background `background_tasks` de SDK/controle.
- Adiado: conversão foreground-to-background por Ctrl+B ou gatilho de teclado.
- Adiado: `TaskOutput` / recuperação de output.
- Adiado: convergência para um único arquivo de output nas notificações de Bash.
- Adiado: controles manuais para monitor/workflow, a menos que o escopo de produto seja ampliado.
- Adiado: promoção de E2E de replayable do mobile para esta superfície de controle específica; a
  implementação preserva as fronteiras de `workspaceIdentity` / `workspacePath`, mas a promoção de
  replayable do mobile continua sendo um item de validação separado.

## Auto-revisão final

- [x] Todo comportamento alterado rastreia até o escopo do spec acima ou o comportamento atual do
  ZCode.
- [x] Nenhum background manager genérico foi adicionado.
- [x] `local_bash` e `local_agent` param por um único dispatcher de runtime.
- [x] O ciclo de vida de stop é registry-first, e não projection-first.
- [x] Background tasks concluídas/paradas continuam acordando o main pela task notification.
- [x] Casos de corrida são cobertos por testes focados em vez de timers.
- [x] As mudanças de UI se limitam à superfície de controle de background task já existente.
- [x] Este plano não fez nenhum commit automático.