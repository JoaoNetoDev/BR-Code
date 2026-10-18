# Plano de Implementação de Intake de Runtime Commands no Active Loop

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** o `<task-notification>` de conclusão de tarefa em background continua entrando na runtime command queue, mas o active query loop, antes do limite legítimo de iniciar a próxima requisição ao modelo, deve consumir o quanto antes os runtime commands pendentes conforme a prioridade do command; se o runtime já estiver ocioso, mantém-se o comportamento existente de idle wake / next command.

**Arquitetura:** oferecer no runtime command queue a capacidade de candidatos por prioridade, para que `runRegularTurnLoop()` verifique, antes de cada projeção de requisição ao provider, os runtime commands pendentes cujo "priority rank não é maior que `next`", isto é, commands `now` / `next` com prioridade pelo menos `next`. Antes de entrar no active loop, o conjunto de candidatos ainda precisa passar por uma allowlist explícita; nesta etapa só `task-notification` pode convergir no active loop, e `prompt` comum / target continuation continuam no outer runtime command queue. O caminho idle continua sendo acionado pelo command `task-notification` chamar `executeTurnCommand()`; a supressão cleanup-only do nested Bash após o terminal do subagent child runtime é compartilhada entre active-loop e lado de consumo idle, usando a mesma decisão.

**Stack técnico:** TypeScript, Vitest, zcode runtime command queue, `MessageHistoryImpl`, runtime task notification, fixtures E2E de conversation-session.

## Status de execução

- [x] Phase 0 baseline / aceitação revisados.
- [x] Phase 1 API de prioridade da queue implementada como `getByMaxPriority("next")` + `removeById()` explícito, com cobertura unitária.
- [x] Phase 2 helper de intake de runtime command do active-loop implementado; task-notification persiste como synthetic input model-only; comandos prompt continuam enfileirados para a outer runtime command queue.
- [x] Phase 3 conectado a `runRegularTurnLoop()` apenas para os roundtrips de active-loop posteriores à primeira requisição (`modelStepCount > 0`), preservando o fallback de command idle.
- [x] Phase 4 fallback de idle wake verificado por testes focados.
- [x] Phase 5 interação com goal coberta por testes de runtime focados existentes e atualizados.
- [x] Phase 6 cleanup de nested Bash de subagent/background em background e fronteiras de active child runtime cobertos por testes de runtime focados.
- [x] Phase 7 regressão de compactação/visibilidade coberta por `runtime-compact.test.ts`.
- [x] Phase 8 documentos de cobertura atualizados e auditoria de cobertura aprovada.
- [x] Phase 9 testes focados, `pnpm typecheck` na raiz, `pnpm lint` na raiz, `tsc` direto de core/adapters/bootstrap e `git diff --check` executados.
- [ ] O `pnpm typecheck` de pacote do `apps/zcode-cli` / `turbo run typecheck` do Phase 9 está bloqueado pela resolução atual de dependências do workspace: `@zcode/shared@workspace:*` é referenciado por `packages/adapters`, mas o workspace só contém `@zcode/shared-types`.
- [x] Gates de formalização E2E do Phase 9 executados com os scripts de pacote corretos: `pnpm --filter @zcode/desktop typecheck:e2e` e `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-background.test.ts`.

## Restrições globais

- Tomar como referência apenas a implementação do repositório atual, sem consultar outros branches.
- Não reescrever a arquitetura de subagent/background; apenas corrigir a estratégia de convergência do runtime command da outer command queue para o active query loop.
- Não interromper uma requisição ao provider em andamento e não inserir execução de ferramenta no meio; só é possível consumir antes da próxima requisição legítima ao modelo.
- O command do active-loop primeiro obtém candidatos pelo limite superior de priority rank: `now = 0`, `next = 1`, `later = 2`, tomando `rank <= rank(next)`, cuja semântica é "prioridade pelo menos next"; em seguida é obrigatório passar pela allowlist explícita. Nesta etapa a allowlist só libera `task-notification`; outros command modes permanecem na outer runtime command queue, sem engolir silenciosamente e sem alterar o ciclo de vida do promise.
- O conteúdo visível ao provider continua usando o texto `<task-notification>` já existente; a superfície de output-file único do Bash, o artifact de output-file de Workflow e os controles manuais de background estão fora do escopo deste plano.
- O nested Bash concluído depois de o subagent child runtime já estar terminal/sealed continua fazendo apenas cleanup de terminal record/artifact/event, sem ressuscitar o model turn do child e sem reescrever o output do Agent pai.
- Não commitar automaticamente; após cada phase concluída apenas reportar o resultado da verificação, e só commitar quando o usuário pedir explicitamente.
- Antes de começar cada phase é obrigatório reler este plan e o `git diff` atual, confirmando que as premissas não foram alteradas por mudanças posteriores.

---

## Mapa de arquivos

- Modify: `apps/zcode-cli/packages/core/src/runtime/command-queue.ts`
  - Adiciona uma API de drain controlada no nível da queue, para retirar commands cujo priority rank não é maior que `"next"`, mantendo a ordem de prioridade existente.
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
  - Expõe o método interno de drain de runtime command do active-loop.
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
  - Inclui o novo método interno no tipo `AgentRuntimeInternal`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
  - Anexa o novo método ao prototype do runtime.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`
  - Reaproveita o `persistBackgroundTaskNotificationCommand()` existente e adiciona o helper de intake de runtime command do active-loop.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`
  - Chama o drain de runtime command do active-loop antes da próxima projeção de requisição ao provider.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts`
  - O caminho de command `task-notification` idle mantém a semântica existente; reaproveita o helper extraído quando necessário, evitando divergência na lógica de persistência.
- Modify/Test: `apps/zcode-cli/packages/core/tests/runtime-command-queue.test.ts`
  - Cobre o limite superior de prioridade da API de drain da queue, a semântica de remoção e o comportamento FIFO.
- Modify/Test: `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`
  - Atualiza a asserção antiga de "a notification só vira um next turn independente depois de um prompt ativo"; adiciona asserções de convergência no active-loop.
- Modify/Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
  - Cobre a convergência da notificação de background Bash/Agent do main runtime depois do resultado da ferramenta e antes da próxima requisição ao provider.
- Modify/Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
  - Cobre que a convergência no active-loop, antes ou depois da projeção de compactação, não quebra o histórico sintético model-only.
- Modify: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
  - Atualiza o status de cobertura do active-loop de background notification.
- Modify: `docs/conversation-session-case-catalog.md`
  - Se a descrição semântica do caso BG existente mencionar "next turn only", passa a "active-loop intake or idle wake fallback".
- Optional Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
  - Se o replay de fixture puder observar a convergência do active-loop de forma estável, adiciona o caso; caso contrário, atualiza apenas os documentos de manual-review/coverage, sem forçar um E2E flaky novo.

---

## Phase 0: Congelar baseline e aceitação

**Propósito:** fixar a deviation atual, o comportamento alvo e o critério de aceitação desta rodada antes de mexer no código, evitando continuar fazendo patch sobre patch.

**Checklist:**

- [ ] Reler este plan.
- [ ] Executar `git diff --stat` e confirmar que o worktree atual ainda contém apenas mudanças de background/subagent/BG06, sem mudanças de UI não relacionadas ou de remote-control misturadas.
- [ ] Confirmar a semântica alvo da queue:
  - a command queue suporta `prompt` / `task-notification` e `now < next < later`;
  - a conclusão de background Agent faz enqueue de `mode: "task-notification", priority: "next"`;
  - a conclusão de Bash faz enqueue de `mode: "task-notification", priority: "next"`.
- [ ] Revisar aa deviation atual do zcode:
  - `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts`: `task-notification` como outer command chama `executeTurnCommand(command.text)`.
  - `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`: antes da próxima requisição ao provider só faz drain de steer e da notificação antiga de subagent, sem drain das task-notification da runtime command queue.
- [ ] Registrar o critério de aceitação:
  - Active loop em execução e que vai entrar na próxima requisição ao provider: a task notification pendente precisa entrar nessa requisição.
  - Active loop já encerrado ou runtime idle: a task notification pendente precisa ser executada pelo caminho existente de idle command wake.
  - Conclusão de nested Bash após o subagent child sealed: a notification precisa ser suprimida e não deve disparar um model turn do child.

**Critérios de aprovação:**

- [ ] Nenhuma modificação de código.
- [ ] É possível explicar "aa deviation atual" e "o comportamento alvo" com a semântica alvo da queue acima e as posições no código atual.

---

## Phase 1: Adicionar API de drain no nível da queue

**Propósito:** permitir que o active loop consulte candidatos pendentes com prioridade pelo menos `next` na runtime command queue. O modelo de rank é `now = 0`, `next = 1`, `later = 2`, então a condição é escrita como `rank <= rank(next)`. A camada da queue responsável apenas pela ordenação por prioridade e não se importa com o command mode; o consumo real é feito pelo runtime intake com `removeById()` explícito por id.

**Interfaces:**

- Export de tipo a adicionar:

```ts
export interface RuntimeCommandQueue {
  getByMaxPriority(maxPriority: RuntimeCommandPriority): readonly RuntimeCommand[];
}
```

- Regra de seleção:
  - retorna apenas `RUNTIME_COMMAND_PRIORITY_ORDER[command.priority] <= RUNTIME_COMMAND_PRIORITY_ORDER[maxPriority]`;
  - o `<=` aqui compara rank, e não "prioridade mais baixa" em linguagem natural; quanto menor o rank, maior a prioridade;
  - cada seleção continua reaproveitando a ordenação de prioridade existente; dentro da mesma prioridade se mantém a ordem original de entrada na fila;
  - os commands retornados não são removidos da queue; o chamador só os remove com `removeById()` depois de confirmar o consumo.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Escrever primeiro o teste que falha em `apps/zcode-cli/packages/core/tests/runtime-command-queue.test.ts`:
  - `getByMaxPriority("next")` retorna todos os commands `now` e `next`.
  - Não retorna commands `later`.
  - FIFO dentro da mesma prioridade.
  - Após ler os candidatos, a queue ainda pode ser consumida normalmente por `dequeue()`.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-command-queue.test.ts --run
```

Esperado: os novos testes falham, e o erro deve apontar que `getByMaxPriority` não está implementado ou que o comportamento não bate.

- [ ] Modificar `apps/zcode-cli/packages/core/src/runtime/command-queue.ts` e implementar `getByMaxPriority()`.
- [ ] Executar novamente:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-command-queue.test.ts --run
```

Esperado: PASS.

**Critérios de aprovação:**

- [ ] Os testes unitários da API de queue passam.
- [ ] O comportamento existente de `dequeue()` / `peek()` / `snapshot()` não mudou.
- [ ] A API de queue não filtra por command mode; o comportamento específico de mode só é tratado no runtime intake processor.

---

## Phase 2: Extrair o helper de intake de runtime commands do active-loop

**Propósito:** reaproveitar a persistência existente para transformar os runtime commands pendentes que o active loop selecionou por prioridade + allowlist nas entries que devem entrar no runtime history antes da próxima requisição ao provider. Nesta etapa só é implementado o adapter de `task-notification`; prompt comum / target continuation não entram no intake do active-loop.

**Interfaces:**

- Adicionar método interno:

```ts
drainPendingRuntimeCommandsForActiveLoop(traceContext: TraceContext): Promise<{
  drained: number;
  messageIds: MessageId[];
  consumedCommandIds: RuntimeCommandId[];
}>;
```

- Comportamento:
  - obtém os commands candidatos a partir de `runtimeCommandQueue.getByMaxPriority("next")`.
  - Para commands com `mode === "task-notification"`, chama `persistBackgroundTaskNotificationCommand()`, mantendo o synthetic input model-only.
  - Para commands com `mode === "prompt"`, não faz consumo no active-loop e mantém na queue, aguardando o drain da outer runtime command queue.
  - Para `mode === "target-continuation"` / `mode === "target-continuation-loop"` é obrigatório manter a semântica de execução em queue original, sem converter em history entry dentro do active loop.
  - Não chama `executeTurnCommand()` e não cria novo turn.
  - Não dispara `runPostCommandActiveTargetLoop()`; após a rodada do active-loop, continua seguindo a lógica existente de post-turn de prompt/target.
  - Se não houver commands, retorna `{ drained: 0, messageIds: [], consumedCommandIds: [] }`.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Escrever primeiro o teste que falha em `apps/zcode-cli/packages/core/tests/subagent-background.test.ts` ou em um teste de runtime mais adequado:
  - enfileirar duas task-notification.
  - Chamar o helper interno.
  - Assertar que `sessionStore.savedMessages` tem duas entradas com `source === "background_task"` e `visibility === "model-only"`.
  - Assertar que `messageHistory.toRuntimeEntries()` contém dois `<task-notification>`.
  - Assertar que o modelAdapter não foi chamado.
  - Enfileirar um command `prompt` e chamar o helper interno; assertar que o command continua na queue e que o promise não foi resolvido.
- [ ] Executar o teste focado e confirmar a falha:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/subagent-background.test.ts --run
```

- [ ] Modificar:
  - `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`
  - `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
  - `apps/zcode-cli/packages/core/src/runtime/internal.ts`
  - `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
- [ ] Executar novamente o teste focado.

**Critérios de aprovação:**

- [ ] O helper de runtime command do active-loop só faz intake/persistência de commands e não inicia um turn extra.
- [ ] Nenhuma requisição extra ao modelo foi iniciada.
- [ ] Nenhum command mode diferente de `task-notification` foi engolido silenciosamente e todos continuam na outer runtime command queue.
- [ ] O caminho de command idle ainda pode reaproveitar `persistBackgroundTaskNotificationCommand()`.

---

## Phase 3: Conectar o intake do active-loop antes da projeção ao provider

**Propósito:** conectar o helper no limite legítimo de `runRegularTurnLoop()`: depois do drain de steer e antes da projeção de compactação/provider. Assim, uma conclusão de background que chegar a tempo do próximo roundtrip entra nesta requisição ao modelo.

**Posicionamento:**

Em `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`:

```ts
await this.drainPendingSubagentNotifications(state.turnTraceContext);
const drainedRuntimeCommands =
  await this.drainPendingRuntimeCommandsForActiveLoop(state.turnTraceContext);
if (drainedRuntimeCommands.drained > 0) {
  state.repeatedToolCallSignature = undefined;
  state.repeatedToolCallStreakCount = 0;
}
```

O posicionamento exato precisa permanecer antes de:

```ts
const providerProjection = buildRuntimeProviderRequestMessages(this, {
  entries: this.messageHistory.toRuntimeEntries(),
  applyCacheControl: true,
});
```

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Escrever o teste que falha em `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`: o background Bash faz enqueue da notification depois de um tool step executar e antes da próxima requisição ao provider.
  - A primeira requisição ao modelo retorna um foreground tool call e o tool result dispara o enqueue da background notification.
  - As `messages` da segunda requisição ao modelo precisam conter simultaneamente o tool result e o `<task-notification>`.
  - Assertar que não existe uma terceira requisição ao modelo "só de notification".
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-tool-loop.test.ts --run -t "background notification"
```

Esperado: o novo teste falha primeiro,sehavior: a notification só aparecendo como uma requisição independente depois que o command prompt atual é concluído.

- [ ] Modificar `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts` e conectar o helper.
- [ ] Atualizar os testes antigos:
  - o "queues task-notification commands behind an active prompt command" em `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`, se só afirmar que a requisição em andamento não é interrompida durante um prompt ativo, deve ser mantido; se afirmar que depois de o prompt concluído sempre há um notification turn independente, deve ser trocado por cobertura separada de convergência no active-loop ou fallback idle.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/subagent-background.test.ts packages/core/tests/runtime-tool-loop.test.ts --run
```

**Critérios de aprovação:**

- [ ] A notification não interrompe a requisição ao provider em andamento.
- [ ] Se o active loop continuar para a próxima requisição ao provider, a notification aparece nessa próxima requisição.
- [ ] Se o active loop não continuar, o fallback de idle wake é preservado.
- [ ] O command prompt não foi engolido silenciosamente pelo processador do active-loop; se nesta etapa o prompt for consumido, precisa haver cobertura de teste de resolve/visibility; se não for consumido, precisa continuar sendo executado com a semântica de queue do next-turn.

---

## Phase 4: Preservar o fallback de idle wake

**Propósito:** garantir que a background notification com o runtime idle ainda acorde o main agent pelo caminho atual da command queue; esse caminho é a base docadeia principal de background subagent/bash.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Preservar e, se necessário, atualizar os testes de idle wake em `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`:
  - `runs each idle background notification as a model-only task-notification command`
  - `wakes idle runtime synchronously when a background notification is enqueued`
- [ ] Adicionar ou atualizar testes deixando explícito que o helper de runtime command do active-loop não engole a notification idle:
  - runtime idle.
  - enfileirar notification.
  - `enqueueRuntimeCommand()` dispara o drain.
  - A última mensagem da requisição ao modelo contém `<task-notification>`.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/subagent-background.test.ts --run
```

**Critérios de aprovação:**

- [ ] A notification idle ainda inicia um model-only synthetic notification turn.
- [ ] `persistBackgroundTaskNotificationCommand()` ainda grava apenas a session message model-only, sem vazar para o conteúdo visível ao usuário.
- [ ] A lógica de goal continuation pós-notification em `runtime-command-queue.ts` continua servindo apenas ao command de notification idle e não afeta o intake do active-loop.

---

## Phase 5: Regressão da interação com goal

**Propósito:** proteger a conclusão existente de goal + background: a verificação de goal precisa esperar o settle do background em execução, e o verifier/continuation só acontece depois que a notification foi consumida.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Atualizar ou adicionar casos de goal em `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`:
  - Depois de o active-loop convergir a notification, o goal loop de post-turn do mesmo command prompt continua verificando o active target.
  - Se `RuntimeTaskRegistry` ainda tiver uma background task em execução, o verifier adia.
  - Com múltiplas notifications, quando a primeira converge e a segunda usa o fallback idle, o goal loop não adelanta o command enfileirado.
  - Com `targetCompletionVerification.enabled === false`, a notification não inicia incondicionalmente a active target continuation.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-tool-loop.test.ts --run -t "target"
```

- [ ] Depois executar a suíte focado completa de runtime tool-loop:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-tool-loop.test.ts --run
```

**Critérios de aprovação:**

- [ ] A verificação de goal não ocorre antes do consumo da notification.
- [ ] Uma background task em execução continua adiando o verifier.
- [ ] Um prompt enfileirado continua tendo prioridade sobre as iterações seguintes do goal loop pós-notification.
- [ ] O problema antigo de "pause/travamento depois do goal steer" não foi restaurado.

---

## Phase 6: Semântica de subagent e nested background Bash

**Propósito:** alinhar a semântica de BG06 com o novo intake do active-loop: quando o child runtime está ativo ele pode consumir a nested Bash notification; depois que o child runtime está sealed, só há cleanup e nada é ressuscitado.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Atualizar os testes unitários de BG06 em `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts` ou `subagent-background.test.ts`:
  - a conclusão do Bash em background dentro do subagent child runtime acontece antes da próxima requisição ao provider do child loop.
  - A segunda requisição ao provider do child contém o `<task-notification>` do nested Bash.
  - O resultado do Agent pai não é reescrito por causa do resultado posterior do nested Bash.
- [ ] Preservar os testes de cleanup-only após o seal:
  - o `executeTurn()` do child já retornou e foi selado.
  - a conclusão do nested Bash só atualiza task terminal/event/artifact.
  - não enfileira command de task-notification do child.
  - não dispara requisição ao modelo do child.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-tool-loop.test.ts packages/core/tests/subagent-background.test.ts --run -t "background"
```

**Critérios de aprovação:**

- [ ] A convergência no active-loop do child runtime só acontece nos limites legítimos em que o child ainda está ativo.
- [ ] A supressão de notification após o child selado é preservada.
- [ ] A queue do main runtime não é poluída pelo nested Bash do child.
- [ ] O output do Agent pai não recebe o resultado da conclusão do nested Bash.

---

## Phase 7: Regressão de compactação, projeção de prompt e visibilidade

**Propósito:** garantir que, depois de o intake de runtime command do active-loop inserir uma synthetic user entry, não sejam reintroduzidos trajectory não incremental, deriva de âncora de cache ou vazamento visível na UI.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Atualizar `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`:
  - quando um mid-turn compact é disparado após o drain de runtime command do active-loop, o `<task-notification>` continua no histórico visível ao provider.
  - a compactação não transforma a notification model-only em uma real user message.
  - o cache-control continua sendo projetado de forma unificada por `buildRuntimeProviderRequestMessages()`.
- [ ] Executar:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-compact.test.ts --run -t "task-notification"
```

- [ ] Se houver testes de helper de conversão de trajetória, acrescentar uma fixture ou verificação de snapshot "append-only após a convergência da notification no active-loop".

**Critérios de aprovação:**

- [ ] A posição da notification no body da requisição ao provider é estável e append-only.
- [ ] O conteúdo visível da sessão não mostra o `<task-notification>` model-only.
- [ ] O problema de snapshot não incremental já corrigido antes não foi restaurado.

---

## Phase 8: Cobertura E2E e documentação

**Propósito:** refletir a mudança de semântica na cobertura de background de conversation-session, evitando que a documentação continue descrevendo o comportamento antigo de "next turn only".

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Atualizar `docs/testing/conversation-session-background-e2e-coverage-matrix.md`:
  - adicionar ou atualizar uma linha de cobertura para o intake do active-loop.
  - deixar explícito que o fallback de idle wake continua coberto.
  - deixar explícito que o cleanup-only de nested Bash terminal do BG06 continua sendo semântica de fronteira.
- [ ] Atualizar o item de resumo correspondente em `docs/testing/conversation-session-e2e-coverage-matrix.md`.
- [ ] Atualizar a descrição dos casos de background em `docs/conversation-session-case-catalog.md`.
- [ ] Se for adicionado um caso E2E, atualizar:
  - `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
  - `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-background.json`
  - `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json`
- [ ] Executar o gate de cobertura/documentação:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
pnpm typecheck:e2e
```

- [ ] Se for adicionada fixture, executar:

```bash
pnpm e2e:fixture:check -- --case conversation-session-background
```

**Critérios de aprovação:**

- [ ] A coverage matrix está consistente com o código de teste.
- [ ] O case catalog não descreve mais a background notification como acontecendo apenas no next turn.
- [ ] A validação de estrutura do JSON de E2E fixture/deepseek replay passa.

---

## Phase 9: Verificação final

**Propósito:** fazer uma regressão completa antes do commit, garantindo que a convergência no active-loop não quebrou as cadeias principais existentes de background/subagent/bash/workflow.

**Checklist:**

- [ ] Reler este plan e o `git diff` atual.
- [ ] Executar os testes focados de core:

```bash
pnpm --dir apps/zcode-cli exec vitest \
  packages/core/tests/runtime-command-queue.test.ts \
  packages/core/tests/subagent-background.test.ts \
  packages/core/tests/runtime-tool-loop.test.ts \
  packages/core/tests/runtime-compact.test.ts \
  --run
```

- [ ] Executar os testes focados de Bash/background:

```bash
pnpm --dir apps/zcode-cli exec vitest \
  packages/adapters/src/exec/index.test.ts \
  packages/core/tests/bash-run-conformance.test.ts \
  --run -t "background|auto-background|task-notification"
```

- [ ] Executar o teste focado de workflow detach:

```bash
pnpm --dir apps/zcode-cli exec vitest packages/bootstrap/tests/script-workflow.test.ts --run -t "background"
```

- [ ] Executar os gates do repositório:

```bash
pnpm typecheck
pnpm lint
git diff --check
node scripts/audit-conversation-session-case-coverage.mjs --check --json
```

- [ ] Revisar o `git diff` manualmente:
  - confirmar que não houve palavra-chave de produto externo nova.
  - confirmar que não houve timer/poller de fallback excessivo novo.
  - confirmar que o intake de command do active-loop é priority-first; todos os command modes que são drenados têm adapter explícito, preservação ou estratégia de devolução, e nada foi engolido silenciosamente.
  - confirmar que não mudou a divergência já estabelecida e não coberta pelo output-file único do Bash.
  - confirmar que não houve commit automático.

**Critérios de aprovação:**

- [ ] Todos os testes focados passam.
- [ ] `pnpm typecheck` passa.
- [ ] `pnpm lint` passa ou tem apenas warnings já existentes e sem relação com esta tarefa.
- [ ] `git diff --check` passa.
- [ ] A auditoria de cobertura passa.
- [ ] O resumo final de comportamento distingue claramente:
  - intake do active-loop
  - fallback de idle wake
  - cleanup-only de subagent child sealed

---

## Estado final esperado

- A conclusão de background continua sendo gravada unicamente como `task-notification` na runtime command queue.
- Quando o active loop retira commands da runtime command queue, ele primeiro obtém candidatos por `rank <= rank(next)`, isto é, `now` / `next`, e depois filtra por uma allowlist explícita; nesta etapa só `task-notification` é liberado.
- Se o runtime main ou o subagent child estiver em active loop e estiver prestes a enviar a próxima requisição ao provider, ele consome primeiro os pending commands com prioridade legítima e permitidos pela allowlist; entre eles, a background `task-notification` entra como synthetic input model-only para que o modelo veja o resultado no roundtrip legítimo mais recente.
- Quando o runtime está idle, a notification ainda acorda o próximo turn como command de task-notification sintético model-only.
- O goal verifier continua esperando o settle da background task em execução; a verificação/continuation de post-turn só entra depois que a notification foi consumida.
- O nested background Bash depois do terminal do subagent child runtime não ressuscita o child, não polui a queue do main e não reescreve o output do Agent pai.
- A cadeia principal atual background subagent/bash/workflow registry -> notification -> wake não é reescrita; apenas a lacuna de convergência com o active-query é preenchida.