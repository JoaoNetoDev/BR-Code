# Plano de Implementação do Snapshot de Runtime Principal Ativo

> Status (2026-07-15): plano de implementação histórico da UI legacy. `isMainActive` ainda existe na camada de compatibilidade de task,
> mas o fluxo principal da conversa V4 usa a phase, os active works e a projeção rows/control do snapshot para determinar o trabalho em primeiro plano;
> abaixo, `useTaskRestore`, o handler do task-stream e o caminho antigo de E2E não são mais pontos de entrada da implementação atual.

> **Para agentes workers:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** convergir `isMainActive` de uma adivinhança temporária da UI local para uma projeção efêmera sincronizada com o runtime snapshot / live monitor, garantindo que, com main ocioso e background em execução, o fake loading inferior não seja exibido, mensagens comuns não entrem na fila, prompts enfileirados possam ser drenados normalmente e, ao restaurar / reconectar, não haja falso julgamento de que um main turn ainda está em execução.

**Arquitetura:** `mainActive` é um campo efêmero de `ZCodeSessionRuntimeSnapshot.runtime`, gerado a partir da projeção do active turn do agent runtime; a UI sincroniza para `TaskUiState.isMainActive` de forma unificada por meio de `applyTaskSnapshotEphemeralRuntimeState()` e do live stream / background monitor. Os fluxos de estado legados `runtime.status`, `activeInputId` e `activeTurnKind` permanecem inalterados; `isMainActive` é lido apenas por três tipos de ponto de consumo: exibição do loading principal, decisão de fila do envio comum e decisão de drenagem de prompt enfileirado.

**Stack Tecnológico:** TypeScript, Zod protocol schema, Zustand store, Vitest, E2E de conversation-session com WDIO, pnpm workspace.

## Restrições Globais

- Não fazer commit automático; após a implementação e a verificação passarem, manter as alterações no workspace aguardando confirmação do usuário.
- Não gravar `runtime.activeTurnId` em `activeInputId`; os dois têm semânticas diferentes.
- Não alterar o fluxo de estado principal existente `runtime.status` / `displayedStatus` / `activeInputId`.
- Não deixar que eventos exclusivamente de background definam `isMainActive` como `true`.
- A sincronização por snapshot deve respeitar a determinação existente de staleness / terminal freshness, para que um snapshot antigo não reverta `isMainActive` para um estado incorreto.
- Cada phase deve ter o teste unitário correspondente escrito e passando antes de avançar para a próxima phase.
- Ao final, é obrigatório rodar um E2E direcionado validando as três caminhos visíveis ao usuário: foreground, background-only e queue/drain.

---

## Escopo e Não-Objetivos

### Dentro do Escopo

- Adicionar `mainActive` na superfície de protocol/runtime snapshot.
- A camada de mapper/projection gera `mainActive` a partir do active turn do runtime.
- O restore / sync de snapshot na UI sincroniza `mainActive`.
- O background monitor / live stream event de foreground continuam mantendo `isMainActive`.
- Adicionar testes unitários e E2E direcionado.

### Fora do Escopo

- Não alterar o controle de background task, TaskStop, o registry de runtime de subagentes nem o comportamento de auto-background do Bash.
- Não ajustar o conteúdo visível ao provider.
- Não refatorar o sistema de status completo do ChatView.
- Não adicionar novos campos persistidos no banco; `mainActive` é um snapshot efêmero de runtime, não estado persistente do task-index.

---

## Arquivos Atuais e Responsabilidades

- `packages/shared/src/zcode-protocol/index.ts`
  - Define o Zod schema do session runtime snapshot.
  - Adiciona `runtime.mainActive?: boolean`.

- `packages/shared/src/zcode-task-types.ts`
  - Define a interface TypeScript do snapshot consumida pelo lado UI/service.
  - Adiciona `ZCodeSessionRuntimeSnapshot.mainActive?: boolean`.

- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`
  - Converte a projeção do agent runtime / active turn no snapshot do ZCode protocol.
  - Responsável por definir `mainActive: Boolean(input.activeTurn)`.

- `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`
  - Cobre a geração de `mainActive` pelo session mapper.

- `packages/ui/src/hooks/taskSnapshotRuntimeStateSync.ts`
  - Restauração unificada de estado efêmero de runtime pela UI.
  - Adiciona a sincronização de `runtime.mainActive` para `TaskUiState.isMainActive`.

- `packages/ui/src/hooks/taskStreamEventSnapshotSync.ts`
  - Ponto de alinhamento que busca o snapshot após um evento live.
  - Aplica `mainActive` apenas no caminho de snapshot aceito, sem contornar a determinação existente de staleness.

- `packages/ui/src/hooks/useTaskRestore.ts`
  - Lê o snapshot fresco ao trocar/restaurar task e chama `applyTaskSnapshotEphemeralRuntimeState()`.
  - Garante que o caminho de restore restaure `isMainActive` pelo novo campo.

- `packages/ui/src/store/zcodeSessionStoreTaskSlice.ts`
  - Já possui `setTaskMainActive()` e a lógica de limpeza em `setTaskRuntimeState(non-running)`.
  - Fazer apenas pequenos ajustes quando necessário, evitando criar caminhos de limpeza duplicados.

- `packages/ui/src/hooks/taskStreamEventHandlers.ts`
  - Handler de eventos de live stream em foreground.
  - Preserva a definição de `isMainActive=true` por eventos de atividade main; não deixa eventos de tool call de filho em background definirem true.

- `packages/ui/src/lib/zcodeTaskRuntimeMonitor.ts`
  - Monitor de eventos de task inactive/background.
  - Preserva a definição de true em task run started de task ativa / chunks main; o estado terminal limpa via runtime non-running.

- `packages/ui/test/chatStatus.test.ts`
  - Cobre a derivação de status de mainActivity.

- `packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`
  - Cobre se o envio comum entra na fila.

- `packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts`
  - Cobre a drenagem de prompt enfileirado.

- `packages/ui/test/taskSnapshotRuntimeStateSync.test.ts`
  - Modificar se já existir; criar caso contrário.
  - Cobre a sincronização de `mainActive` por snapshot.

- `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
  - E2E direcionado cobrindo loading em foreground, ausência de fake loading em background-only e envio direto de mensagem comum com background em execução.

---

## Phase 0: Auditoria de Baseline e Plano de Testes RED

**Propósito:** antes de alterar a implementação, confirmar a superfície de consumo e as lacunas existentes de `isMainActive`, e escrever os testes que necessariamente devem falhar nesta rodada.

**Arquivos:**
- Inspecionar: `packages/ui/src/store/zcodeSessionStoreTaskSlice.ts`
- Inspecionar: `packages/ui/src/hooks/taskSnapshotRuntimeStateSync.ts`
- Inspecionar: `packages/ui/src/hooks/taskStreamEventSnapshotSync.ts`
- Inspecionar: `packages/ui/src/hooks/useTaskRestore.ts`
- Inspecionar: `packages/ui/src/hooks/taskStreamEventHandlers.ts`
- Inspecionar: `packages/ui/src/lib/zcodeTaskRuntimeMonitor.ts`
- Inspecionar: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`
- Inspecionar: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

### Checklist

- [ ] Rodar a varredura de uso atual:

```bash
rg -n "isMainActive|setTaskMainActive|mainActive|activeTurnId|activeTurnKind" \
  packages/ui/src packages/ui/test packages/shared/src apps/zcode-cli/packages/bootstrap
```

Esperado:
- `isMainActive` aparece apenas no store, nos escritores explícitos de main-active, nos consumidores de envio/fila/drenagem/exibição e nos testes.
- Ainda não existe nenhum campo de protocol `mainActive`.

- [ ] Confirmar que os testes atuais ainda passam antes de começar:

```bash
pnpm exec vitest run \
  packages/ui/test/chatStatus.test.ts \
  packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS antes de este plano começar a alterar o comportamento do snapshot.

- [ ] Escrever as expectativas RED da Phase 1 e da Phase 2:
  - O snapshot de protocol gerado a partir de um active turn deve conter `runtime.mainActive === true`.
  - O snapshot de protocol gerado a partir de um runtime ocioso deve conter `runtime.mainActive === false`.
  - O sync de snapshot da UI deve definir `TaskUiState.isMainActive` a partir de `runtime.mainActive`.
  - Um runtime terminal aceito deve deixar `isMainActive === false`.

**Critérios de Saída da Phase 0**

- [ ] Os testes de baseline atuais passam.
- [ ] Nenhum código foi alterado, exceto, se desejado, notas locais neste plano.
- [ ] Avançar para a Phase 1 somente após confirmar os alvos de teste e os caminhos de arquivo.

---

## Phase 1: Adicionar `runtime.mainActive` à Superfície de Snapshot do Protocol

**Propósito:** fazer o próprio snapshot carregar o fato de o main estar ativo, evitando que a UI adivinhe temporariamente a partir de `activeTurnId`.

**Arquivos:**
- Modificar: `packages/shared/src/zcode-protocol/index.ts`
- Modificar: `packages/shared/src/zcode-task-types.ts`
- Modificar: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`
- Testar: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Interfaces Produzidas:**

```ts
// packages/shared/src/zcode-task-types.ts
export interface ZCodeSessionRuntimeSnapshot {
  mainActive?: boolean;
}
```

```ts
// packages/shared/src/zcode-protocol/index.ts
mainActive: z.boolean().optional()
```

**Notas de Implementação:**

- No session mapper, calcular:

```ts
const mainActive = Boolean(input.activeTurn);
```

- Incluir `mainActive` no objeto de runtime snapshot.
- Manter `activeTurnId` e `activeTurnKind` inalterados.
- Emitir `false` explícito para snapshots ociosos quando o mapper for dono do objeto de runtime. Manter o schema opcional para compatibilidade retroativa com snapshots mais antigos.

### Checklist

- [ ] Adicionar teste de protocol RED para snapshot de active turn.

Adicionar um teste próximo aos testes existentes de snapshot de active turn em:
`apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

Intenção do teste:

```ts
it("marks runtime mainActive while a session active turn exists", async () => {
  // Arrange fake app runtime with getActiveTurnInfo() returning a regular active turn.
  // Act buildSessionSnapshot(...).
  // Assert snapshot.runtime.mainActive === true.
  // Assert snapshot.runtime.activeTurnId is still the runtime turn id.
});
```

RED esperado antes da implementação:

```bash
pnpm --filter @zcode/zcode-cli-bootstrap test -- zcode-protocol.test.ts -t "marks runtime mainActive"
```

Se o script do pacote for diferente localmente, usar:

```bash
pnpm exec vitest run apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts -t "marks runtime mainActive"
```

Esperado: FAIL porque `runtime.mainActive` está ausente.

- [ ] Adicionar teste de protocol RED para snapshot ocioso.

Intenção do teste:

```ts
it("marks runtime mainActive false when no session active turn exists", async () => {
  // Arrange fake runtime getActiveTurnInfo() returns undefined.
  // Assert snapshot.runtime.mainActive === false.
  // Assert snapshot.runtime.activeTurnId is undefined.
});
```

- [ ] Implementar as mudanças de schema/tipo.

Alterar:
- `packages/shared/src/zcode-protocol/index.ts`
- `packages/shared/src/zcode-task-types.ts`

- [ ] Implementar a mudança no mapper.

Alterar:
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`

Adicionar `mainActive` ao objeto de runtime snapshot gerado a partir do estado de active turn.

- [ ] Rodar os testes da Phase 1.

```bash
pnpm exec vitest run apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts -t "mainActive"
pnpm typecheck
```

Esperado:
- Os novos testes de protocol passam.
- O typecheck passa.

**Critérios de Saída da Phase 1**

- [ ] O snapshot de runtime ativo tem `mainActive: true`.
- [ ] O snapshot de runtime ocioso tem `mainActive: false`.
- [ ] `activeTurnId` ainda não é usado como `activeInputId`.
- [ ] Os testes da Phase 1 e `pnpm typecheck` passam antes da Phase 2.

---

## Phase 2: Sincronizar `mainActive` de Snapshots Aceitos para o Store da UI

**Propósito:** fazer restore / reconnect usarem o `mainActive` presente no snapshot, e aplicá-lo apenas no caminho de snapshot aceito, evitando que um snapshot stale reverta o estado.

**Arquivos:**
- Modificar: `packages/ui/src/hooks/taskSnapshotRuntimeStateSync.ts`
- Modificar: `packages/ui/src/hooks/taskStreamEventSnapshotSync.ts`
- Testar: `packages/ui/test/taskSnapshotRuntimeStateSync.test.ts` ou criar se ausente
- Testar: `packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts`

**Interfaces Consumidas:**

```ts
runtime?: Pick<
  ZCodeSessionRuntimeSnapshot,
  | "activeTurnKind"
  | "mainActive"
  | "contextUsage"
  | "apiRetry"
  | "goalStats"
  | "goalVerifications"
  | "plan"
  | "todoGroups"
>
```

**Notas de Implementação:**

- `applyTaskSnapshotEphemeralRuntimeState()` deve aplicar `runtime.mainActive` somente quando o campo estiver presente:

```ts
if (runtime?.mainActive !== undefined) {
  store.setTaskMainActive(workspacePath, taskId, runtime.mainActive, workspaceIdentity);
}
```

- Não inferir `mainActive` a partir de `activeTurnId` na UI.
- Não gravar `activeTurnId` em `activeInputId`.
- `setTaskRuntimeState(non-running)` permanece como caminho de limpeza terminal e continua limpando `isMainActive=false`.
- Em `syncTaskSnapshotAfterEvent()`, manter a chamada a `applyTaskSnapshotEphemeralRuntimeState()` somente depois de as decisões existentes de freshness/staleness terem aceito o snapshot para o sync efêmero.
- Se algum teste revelar que snapshots terminais stale ainda aplicam campos efêmeros, ajustar o ponto de chamada passando um objeto de runtime filtrado para os ramos terminais stale, em vez de adicionar guardas ad hoc dentro do store.

### Checklist

- [ ] Adicionar teste RED: o snapshot de runtime restaura main active.

Criar ou atualizar:
`packages/ui/test/taskSnapshotRuntimeStateSync.test.ts`

Intenção do teste:

```ts
it("restores isMainActive from runtime.mainActive", () => {
  applyTaskSnapshotEphemeralRuntimeState({
    runtime: {
      mainActive: true,
      activeTurnKind: "regular",
    },
    workspacePath,
    taskId,
  });

  expect(getTaskUiState(workspaceState, taskId).isMainActive).toBe(true);
});
```

RED esperado:

```bash
pnpm exec vitest run packages/ui/test/taskSnapshotRuntimeStateSync.test.ts -t "restores isMainActive"
```

Esperado: FAIL antes da implementação.

- [ ] Adicionar teste RED: o snapshot de runtime pode limpar main active.

Intenção do teste:

```ts
it("clears isMainActive when accepted runtime.mainActive is false", () => {
  store.setTaskMainActive(workspacePath, taskId, true);
  applyTaskSnapshotEphemeralRuntimeState({
    runtime: { mainActive: false },
    workspacePath,
    taskId,
  });

  expect(getTaskUiState(workspaceState, taskId).isMainActive).toBe(false);
});
```

- [ ] Implementar o sync de `mainActive` em `applyTaskSnapshotEphemeralRuntimeState()`.

- [ ] Rodar os testes focados da Phase 2.

```bash
pnpm exec vitest run \
  packages/ui/test/taskSnapshotRuntimeStateSync.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS.

- [ ] Rodar os testes de regressão da política de envio/fila.

```bash
pnpm exec vitest run \
  packages/ui/test/chatStatus.test.ts \
  packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS.

**Critérios de Saída da Phase 2**

- [ ] O caminho de restore consegue definir `isMainActive=true` a partir do snapshot.
- [ ] Um snapshot aceito consegue limpar `isMainActive=false`.
- [ ] Nenhum código da UI infere `mainActive` a partir de `activeTurnId`.
- [ ] Os testes focados da UI passam antes da Phase 3.

---

## Phase 3: Alinhar Eventos Live e Atualizações do Background Monitor

**Propósito:** garantir que, após ir para background, o monitor mantenha `isMainActive` como atualiza os demais estados de runtime, e que eventos exclusivamente de background não contaminem o main active.

**Arquivos:**
- Modificar: `packages/ui/src/hooks/taskStreamEventHandlers.ts`
- Modificar: `packages/ui/src/lib/zcodeTaskRuntimeMonitor.ts`
- Testar: `packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts`
- Testar: `packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`

**Notas de Implementação:**

- Manter a definição de `isMainActive=true` para fatos do main turn:
  - `task_run_started`
  - `goal_iteration_started`
  - compactação de contexto em execução na timeline
  - `agent_message_chunk`
  - `agent_thought_chunk`
  - `task_run_started` do background monitor para task inativa
- Não definir `isMainActive=true` para fatos exclusivamente de background:
  - `background_bash_jobs_update`
  - `tool_call` / `tool_call_update` espelhados de subagente em background
  - atualizações de UI de controle em background
- Não duplicar a limpeza terminal; o terminal / non-running permanece centralizado em `setTaskRuntimeState(non-running)`.

### Checklist

- [ ] Auditar os escritores live.

```bash
rg -n "setTaskMainActive" packages/ui/src/hooks packages/ui/src/lib
```

Esperado:
- Os escritores correspondem aos caminhos de início/chunk do main turn ou à drenagem de prompt enfileirado / envio direto.
- Nenhum caminho de atualização exclusivamente de background grava `true`.

- [ ] Adicionar ou confirmar teste: streaming exclusivamente de background não enfileira prompt comum.

Alvo existente:
`packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`

Asserção esperada:

```ts
expect(
  shouldQueuePromptForMainActivity({
    currentStatus: "idle",
    runtimeState: { activeInputId: "background-run", status: "streaming" },
    isMainActive: false,
    stopRequested: false,
    queuedPromptCount: 0,
  }),
).toBe(false);
```

- [ ] Adicionar ou confirmar teste: streaming com main active ainda enfileira prompt comum.

Asserção esperada:

```ts
expect(
  shouldQueuePromptForMainActivity({
    currentStatus: "idle",
    runtimeState: { activeInputId: "main-run", status: "streaming" },
    isMainActive: true,
    stopRequested: false,
    queuedPromptCount: 0,
  }),
).toBe(true);
```

- [ ] Adicionar ou confirmar teste: a drenagem da fila prossegue quando apenas o background mantém o runtime em streaming.

Alvo existente:
`packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts`

Asserções esperadas:
- o status do runtime pode ser `streaming`
- activeInputId pode ser definido com um id de background
- `isMainActive` permanece false
- `triggerTaskQueuedPromptDrain(...)` chama `sendPrompt(...)`

- [ ] Rodar os testes focados da Phase 3.

```bash
pnpm exec vitest run \
  packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS.

**Critérios de Saída da Phase 3**

- [ ] Eventos live do main definem `isMainActive=true`.
- [ ] Eventos exclusivamente de background não definem `isMainActive=true`.
- [ ] A limpeza terminal não é duplicada.
- [ ] Os testes de política de fila e de drenagem passam antes da Phase 4.

---

## Phase 4: Cobertura de Regressão de Restore / Reconnect

**Propósito:** preencher a lacuna real desta rodada: manter `isMainActive` consistente com o runtime snapshot durante restore/reconnect.

**Arquivos:**
- Testar: `packages/ui/test/taskSnapshotRuntimeStateSync.test.ts`
- Testar: `packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`
- Teste opcional: `packages/ui/test/taskStreamEventSnapshotSync.test.ts`, se os helpers existentes facilitarem o isolamento do comportamento de snapshot stale

### Checklist

- [ ] Adicionar teste unitário: restaurar snapshot ativo faz o envio comum entrar na fila.

Estrutura do teste:

```ts
// 1. Apply snapshot ephemeral runtime { mainActive: true, activeTurnKind: "regular" }.
// 2. Set task runtime state to streaming.
// 3. Call shouldQueuePromptForMainActivity(... isMainActive from store ...).
// 4. Expect true.
```

- [ ] Adicionar teste unitário: restaurar snapshot concluído permite envio direto.

Estrutura do teste:

```ts
// 1. Set isMainActive true.
// 2. Apply accepted runtime { mainActive: false } or setTaskRuntimeState(..., "completed").
// 3. Call shouldQueuePromptForMainActivity(...).
// 4. Expect false when no queued prompt, stop, timeline, or goal active.
```

- [ ] Adicionar regressão de snapshot stale, se viável.

Intenção do teste:
- O store atual tem uma nova execução main ativa.
- Um snapshot terminal stale de uma execução mais antiga é processado.
- A guarda existente de staleness impede a aplicação do runtime terminal.
- `isMainActive` permanece true.

Se o harness de testes atual não conseguir chamar `syncTaskSnapshotAfterEvent()` de forma limpa sem uma configuração pesada, registrar isso como coberto pelos testes existentes de runtime stale e não introduzir um teste frágil e cheio de mocks.

- [ ] Rodar os testes da Phase 4.

```bash
pnpm exec vitest run \
  packages/ui/test/taskSnapshotRuntimeStateSync.test.ts \
  packages/ui/test/chatStatus.test.ts \
  packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS.

**Critérios de Saída da Phase 4**

- [ ] Snapshot ativo -> `isMainActive=true` -> envio comum entra na fila.
- [ ] Snapshot concluído / runtime terminal -> `isMainActive=false` -> envio comum pode ir direto.
- [ ] Snapshot stale não sobrescreve a semântica atual de main ativo.
- [ ] Os testes da Phase 4 passam antes do E2E.

---

## Phase 5: Validação E2E Direcionada

**Propósito:** validar que o comportamento visível ao usuário não regrediu, em especial que o background-only não causa mais fake loading e que o foreground mantém o loading original.

**Arquivos:**
- Modificar se necessário: `packages/desktop/test/e2e/conversation-session/conversation-session-background.test.ts`
- Modificar se necessário: `docs/conversation-session-case-catalog.md`
- Modificar se necessário: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modificar se necessário: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modificar se necessário: arquivos JSON de fixture de E2E em:
  - `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-background.json`
  - `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background.json`

### Checklist

- [ ] Confirmar ou adicionar E2E: atualização de tool call de subagente em background não mostra loading main.

Esperado:
- A linha de controle do Agent em background está visível.
- O store do renderer pode receber a atualização de tool call do filho.
- `chat-view` permanece ocioso para o main.
- Nenhum `chat-loading` inferior visível.

- [ ] Confirmar ou adicionar E2E: atualização de tool call de subagente em foreground ainda mostra loading main.

Esperado:
- A atualização de tool call do filho de um Agent em foreground mantém o main em streaming.
- O `chat-loading` inferior aparece.

- [ ] Confirmar ou adicionar E2E: execução em background não enfileira prompt comum do usuário.

Esperado:
- O main está ocioso.
- A task de background ainda está em execução.
- O usuário envia texto comum.
- O provider recebe a mensagem como uma nova requisição.
- `queueCount` permanece 0.

- [ ] Rodar somente o E2E direcionado.

```bash
# workdir: packages/desktop
./node_modules/.bin/wdio run wdio.conf.ts \
  --spec ./test/e2e/conversation-session/conversation-session-background.test.ts \
  --mochaOpts.grep "background subagent 的 child tool update|foreground subagent 的 child tool update|background task running 时用户普通消息应直接发送"
```

Esperado:
- O E2E direcionado passa.

**Critérios de Saída da Phase 5**

- [ ] O E2E direcionado passa.
- [ ] Documentos / matriz / fixtures de E2E permanecem consistentes se algum caso de E2E for adicionado ou renomeado.
- [ ] Nenhuma execução ampla de E2E é necessária, a menos que o E2E direcionado ou os testes unitários revelem risco de fixture compartilhado.

---

## Phase 6: Verificação Final e Revisão

**Propósito:** verificação completa antes do commit, mas sem commit automático.

### Checklist

- [ ] Rodar os testes unitários focados.

```bash
# workdir: apps/zcode-cli
./node_modules/.bin/vitest run \
  packages/bootstrap/tests/zcode-protocol.test.ts -t "mainActive|last projected turn"
pnpm exec vitest run \
  packages/ui/test/taskSnapshotRuntimeStateSync.test.ts \
  packages/ui/test/chatStatus.test.ts \
  packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts \
  packages/ui/test/zcodeTaskRuntimeMonitorQueueDrain.test.ts
```

Esperado: PASS.

- [ ] Rodar o typecheck.

```bash
pnpm typecheck
```

Esperado: exit 0.

- [ ] Rodar o lint.

```bash
pnpm lint
```

Esperado: exit 0. Avisos existentes são aceitáveis apenas se o lint sair com 0 e nenhum deles tiver sido introduzido por esta mudança.

- [ ] Rodar a verificação de whitespace.

```bash
git diff --check
```

Esperado: nenhuma saída.

- [ ] Rodar o E2E direcionado da Phase 5.

Esperado: PASS.

- [ ] Revisar os limites do diff.

```bash
git diff --stat
rg -n "mainActive|isMainActive|setTaskMainActive|activeTurnId|activeInputId" \
  packages/shared/src packages/ui/src packages/ui/test apps/zcode-cli/packages/bootstrap
```

Esperado:
- `mainActive` aparece no tipo/schema de protocol, no mapper, no sync de snapshot da UI, no store e nos testes.
- `activeTurnId` não é gravado em `activeInputId`.
- `isMainActive` é consumido apenas pelo loading main, pela decisão de fila do envio comum, pela drenagem de prompt enfileirado e pelos testes.

**Critérios de Saída da Phase 6**

- [ ] Os testes unitários passam.
- [ ] O typecheck passa.
- [ ] O lint sai com 0.
- [ ] `git diff --check` passa.
- [ ] O E2E direcionado passa.
- [ ] A resposta final reporta as evidências de verificação.
- [ ] Não fazer commit automático.

---

## Comportamento Final Esperado

- Main turn em execução em foreground:
  - `runtime.status` pode ser `streaming`
  - `TaskUiState.isMainActive === true`
  - o loading inferior está visível
  - o envio comum do usuário entra na fila
  - a drenagem de prompt enfileirado espera

- Task exclusivamente em background em execução com main ocioso:
  - `runtime.status` ainda pode ser `streaming`, porque o estado da task/controle de background está ativo
  - `TaskUiState.isMainActive === false`
  - o fake loading inferior fica oculto
  - o envio comum do usuário vai direto
  - a drenagem de prompt enfileirado pode prosseguir

- Restore/reconnect de main turn ativo:
  - o snapshot carrega `runtime.mainActive === true`
  - o restore da UI define `TaskUiState.isMainActive === true`
  - o loading inferior e o comportamento de fila correspondem a um main turn ativo antes de chegar o primeiro chunk live

- Restore/reconnect de task concluída:
  - o snapshot carrega `runtime.mainActive === false` ou o runtime terminal o limpa
  - o restore da UI deixa `TaskUiState.isMainActive === false`
  - nenhum fake loading
  - o envio comum do usuário pode iniciar um novo turn

---

## Checklist de Auto-Revisão

- [ ] O plano não introduz um novo campo durável no banco.
- [ ] O plano não renomeia nem reaproveita `activeInputId`.
- [ ] O plano não infere `mainActive` em ChatView/useZCodeChat a partir de `activeTurnId`.
- [ ] O plano mantém a limpeza terminal centralizada em `setTaskRuntimeState(non-running)`.
- [ ] O plano inclui testes unitários RED/GREEN antes de cada phase de implementação.
- [ ] O plano inclui E2E direcionado antes da conclusão final.
- [ ] O plano diz explicitamente para não fazer commit automático.