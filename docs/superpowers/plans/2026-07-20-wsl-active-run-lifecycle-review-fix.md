# WSL Active Run Lifecycle Review Fix Implementation Plan

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** corrigir o WSL Host Pool de escopo de janela que tratava o ACK de `sendPrompt` como fim de execução, e fazer com que a liberação do workspace recicle sincronamente no lado do Host os metadados de task e a assinatura de eventos dinâmicos.

**Arquitetura:** `IZCodeTaskService` expõe um evento dinâmico de task-ready dirigido por `ZCodeTaskIndexSyncer.onSessionReadyEvent`; o Host usa workspace/task como única fonte de verdade de active-run, encerrando a contagem no ready ou em falha de inicialização, e o total do Host é agregado por esse tracker. Após o runtime de workspace liberar com sucesso, o Host remove sincronamente o task meta, o listener de ready e a assinatura de eventos dinâmicos daquele workspace, podendo restabelecê-los em um novo attach.

**Tech Stack:** TypeScript, Vitest, Electron UtilityProcess, `@zcode/rpc` dynamic event, ZCode task index syncer.

## Restrições globais

- atualizar e respeitar primeiro os limites de autoridade de Active Run de `docs/superpowers/specs/2026-07-20-window-scoped-wsl-host-pooling-design.md`.
- a identidade de workspace usa uniformemente `resolveWorkspaceKey({ workspaceIdentity, workspacePath })`; a execução de arquivos continua usando `workspacePath`.
- o desktop continua usando `desktop-continuous`; esta rodada não muda a semântica de snapshot/gap/queue do `web-remote-replayable` do celular.
- os comentários sobre a causa da correção e sobre a temporização-chave são escritos em chinês.
- antes de concluir, é obrigatório executar `pnpm typecheck`, `pnpm lint` e os testes unitários afetados.

---

### Task 1: expor o evento autoritativo de task ready

**Files:**
- Modify: `packages/services/src/session/zcodeTaskService.ts`
- Modify: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Test: `packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

**Interfaces:**
- Consumes: `ZCodeTaskIndexSyncer.onSessionReadyEvent`, cujo reason é `prompt_completed | prompt_failed`.
- Produces: `ZCodeTaskReadyOutcome` e `IZCodeTaskService.onDynamicTaskReady(taskId): Event<ZCodeTaskReadyOutcome>`.

- [x] **Step 1: escrever o teste que falha**

  No teste do adapter, assinar `service.onDynamicTaskReady(taskId)` e injetar separadamente eventos ready de `prompt_completed`, `prompt_failed` e de outras tasks, afirmando que só chegam os dois eventos da task alvo.

- [x] **Step 2: verificar que o teste falha primeiro**

  Run: `pnpm vitest run packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

  Expected: FAIL, indicando que `onDynamicTaskReady` não existe.

- [x] **Step 3: implementar a interface mínima e o mapeamento no adapter**

  ```ts
  export interface ZCodeTaskReadyOutcome {
    taskId: string;
    reason: "prompt_completed" | "prompt_failed";
  }

  onDynamicTaskReady(taskId: string): Event<ZCodeTaskReadyOutcome> {
    return Event.filter(
      Event.map(taskIndexSyncer.onSessionReadyEvent, (event) => ({
        taskId: event.target.taskId,
        reason: event.reason,
      })),
      (event) => event.taskId === taskId,
    );
  }
  ```

- [x] **Step 4: verificar que o teste de serviço passa**

  Run: `pnpm vitest run packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

  Expected: PASS.

### Task 2: usar o ready para dirigir o único tracker de active-run

**Files:**
- Modify: `packages/desktop/src/host/hostWorkspaceTaskTracker.ts`
- Modify: `packages/desktop/src/host/index.ts`
- Test: `packages/desktop/test/hostWorkspaceTaskTracker.test.ts`

**Interfaces:**
- Consumes: `onDynamicTaskReady(taskId)` e o `workspacePath/workspaceIdentity` do task meta.
- Produces: `begin(taskId, context)`, `finish(taskId, context)`, `getRunningTaskCount(context)`, `getTotalRunningTaskCount()`, `clearWorkspace(context)`; begin repetido para o mesmo workspace/task é idempotente.

- [x] **Step 1: escrever os testes que falham de ACK-before-ready, begin repetido, agregação entre workspaces e clear**

  O teste faz begin sem chamar finish (simulando apenas o recebimento do ACK) e afirma que o workspace continua em 1; depois simula o ready e verifica que cai para 0. Em seguida afirma que begin repetido da mesma task não incrementa, que o total dos dois workspaces está correto e que clear remove apenas o workspace alvo.

- [x] **Step 2: verificar que os testes do tracker falham primeiro**

  Run: `pnpm vitest run packages/desktop/test/hostWorkspaceTaskTracker.test.ts`

  Expected: FAIL, indicando que a nova assinatura ou a API de agregação não existe.

- [x] **Step 3: implementar o tracker keyed por task e integrá-lo ao Host**

  Antes do `sendPrompt`, criar o listener de ready e fazer begin; o ACK não encerra a contagem, e só o ready ou um reject do `sendPrompt` faz finish. Remover o `runningPromptCount` independente; `AgentRunningTaskCountChanged` passa a ser derivado de `tracker.getTotalRunningTaskCount()`.

  ```text
  sendPrompt start -> subscribe ready -> begin(workspace, task) -> remote ACK
                                  |                         |
                                  |                         +-- 保持 active
                                  +-> prompt_completed/failed -> finish -> Main 可释放 workspace
  ```

- [x] **Step 4: verificar que os testes do tracker e a verificação de tipos do Host passam**

  Run: `pnpm vitest run packages/desktop/test/hostWorkspaceTaskTracker.test.ts`

  Expected: PASS.

### Task 3: limpeza do estado do Host proxy no release do workspace

**Files:**
- Create: `packages/desktop/src/host/hostRemoteWorkspaceProxyState.ts`
- Modify: `packages/desktop/src/host/index.ts`
- Test: `packages/desktop/test/hostRemoteWorkspaceProxyState.test.ts`

**Interfaces:**
- Consumes: o resultado de sucesso de `releaseWorkspacePreparation(context)` e `resolveWorkspaceKey(context)`.
- Produces: um mapa de disposables de assinatura keyed por workspace, e o comportamento de limpeza após o release de task meta, ready subscription, entrada do tracker e assinatura dinâmica do workspace.

- [x] **Step 1: escrever os testes que falham de release e re-attach**

  Extrair um registry de workspace proxy-state testável isoladamente; registrar task meta, assinatura de workspace e listener ready ativo, fazer release e afirmar que as três referências foram limpas, e que uma nova assinatura do mesmo workspace em seguida tem sucesso.

- [x] **Step 2: verificar que os testes falham primeiro**

  Run: `pnpm vitest run packages/desktop/test/hostRemoteWorkspaceProxyState.test.ts`

  Expected: FAIL, indicando que a API registry/clear não existe.

- [x] **Step 3: implementar a limpeza no release**

  Limpar apenas após o sucesso do `releaseWorkspacePreparation` subjacente; o container de assinaturas muda de `Set` para `Map<workspaceKey, Disposable>`, e a limpeza chama `dispose()` antes de remover a entrada, evitando acumular listeners ao longo do ciclo de vida de um Host compartilhado.

- [x] **Step 4: rodar a verificação completa**

  Run:

  ```powershell
  pnpm vitest run packages/desktop/test/hostWorkspaceTaskTracker.test.ts packages/desktop/test/hostRemoteWorkspaceProxyState.test.ts packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts
  pnpm typecheck
  pnpm lint
  ```

  Expected: todos com exit code 0.

- [x] **Step 5: commitar**

  ```powershell
  git add docs/superpowers/plans/2026-07-20-wsl-active-run-lifecycle-review-fix.md packages/services/src/session/zcodeTaskService.ts packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts packages/desktop/src/host/hostWorkspaceTaskTracker.ts packages/desktop/src/host/hostRemoteWorkspaceProxyState.ts packages/desktop/src/host/index.ts packages/desktop/test/hostWorkspaceTaskTracker.test.ts packages/desktop/test/hostRemoteWorkspaceProxyState.test.ts
  git commit -m "fix(remote): track WSL active runs until ready"
  ```