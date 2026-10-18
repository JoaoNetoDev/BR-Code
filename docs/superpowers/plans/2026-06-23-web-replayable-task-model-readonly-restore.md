# Plano de Implementação de Readonly Restore do Modelo de Task Replayable Web

> Status (2026-07-15): registro de compatibilidade do legacy replayable já implementado. `resumeModelPolicy`
> ainda é mantido pelo task compatibility adapter, mas a autoridade de restore da conversa atual é a
> projection/snapshot do V4; os antigos caminhos de integração da UI como `useTaskRestore` e
> `useTaskStreamEvents` abaixo foram removidos e não podem servir de entrada para funcionalidades novas.

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Permitir que o mobile `web-remote-replayable` abra tasks históricas cujo modelo exato está indisponível sem quebrar o `desktop-continuous` do desktop.

**Arquitetura:** Adicionar uma política explícita de resume por snapshot que apenas o caminho de restore replayable do mobile usa. A UI solicita um snapshot sem backfill de modelo do índice de tasks quando o modelo histórico é conhecido como indisponível, enquanto o snapshot do provider ainda não foi hidratado, ou quando a meta da task atual ainda não chegou ao estado da UI; então, para essa abertura somente leitura, ela pula o `resumeTask` de acompanhamento.

**Stack técnico:** TypeScript, hooks React, Vitest, adaptador do serviço de tasks do ZCode.

---

### Tarefa 1: Adicionar testes vermelhos

**Arquivos:**
- Modificar: `packages/ui/test/useTaskRestoreRuntimeSnapshot.test.ts`
- Modificar: `packages/ui/test/useTaskStreamEventsSnapshotReader.test.ts`
- Modificar: `packages/ui/test/taskStreamEventSnapshotSync.test.ts`
- Modificar: `packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

- [x] Adicionar um teste de UI afirmando que `buildReplayableTaskRestoreSnapshotParams` pode emitir `resumeModelPolicy: "ui-resolved-only"`.
- [x] Adicionar um teste de UI afirmando que o restore replayable do mobile usa modo somente leitura enquanto o snapshot do provider não está hidratado, mesmo sem uma dica local de modelo histórico, e que o restore do desktop não usa.
- [x] Adicionar um teste de UI afirmando que o restore replayable do mobile usa modo somente leitura quando a meta da task ainda não chegou ao estado da UI, e que o restore do desktop não usa.
- [x] Adicionar um teste de UI afirmando que o leitor de snapshot de stream replayable web solicita `resumeModelPolicy: "ui-resolved-only"`.
- [x] Adicionar um teste de UI afirmando que o sync de snapshot replayable web genérico solicita `resumeModelPolicy: "ui-resolved-only"`.
- [x] Adicionar um teste do adaptador de serviço afirmando que um snapshot replayable com `resumeModelPolicy: "ui-resolved-only"` chama `agent.resumeSession` sem modelo mesmo quando a meta do índice de tasks tem um modelo.
- [x] Adicionar um teste do adaptador de serviço afirmando que o snapshot replayable padrão ainda passa o modelo do índice de tasks para `agent.resumeSession`.
- [x] Executar os testes focados e verificar que falham antes da implementação.

### Tarefa 2: Implementar a política exclusiva do mobile

**Arquivos:**
- Modificar: `packages/services/src/session/zcodeTaskService.ts`
- Modificar: `packages/ui/src/hooks/useZCodeTaskService.ts`
- Modificar: `packages/ui/src/hooks/useTaskRestore.ts`
- Modificar: `packages/ui/src/hooks/useTaskStreamEvents.ts`
- Modificar: `packages/ui/src/hooks/taskStreamEventSnapshotSync.ts`
- Modificar: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`

- [x] Adicionar `resumeModelPolicy?: "task-index" | "ui-resolved-only"` aos params do snapshot.
- [x] Incluir a política na chave de dedupe/cache do snapshot da UI.
- [x] Em `zcodeTaskServiceAdapter.getTaskSnapshot`, pular as dicas de resume do índice de tasks somente quando `clientMode` for `web-remote-replayable` e a política for `ui-resolved-only`.
- [x] Em `useTaskRestore`, definir a política somente quando o caminho replayable do mobile detectar um modelo histórico indisponível sem modelo de fallback resolvido, quando o snapshot do provider ainda não foi hidratado, ou quando a meta da task ainda não chegou ao estado da UI.
- [x] No mesmo ramo, pular `resumeTask` e usar `snapshot.meta` como meta restaurada somente leitura.
- [x] No sync de snapshot replayable web pós-abertura, passar `resumeModelPolicy: "ui-resolved-only"` para que o alinhamento de event/gap/terminal do snapshot não possa reintroduzir o modelo indisponível do índice de tasks após a troca de modelo.

### Tarefa 3: Verificar

**Arquivos:**
- Teste: `packages/ui/test/useTaskRestoreRuntimeSnapshot.test.ts`
- Teste: `packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

- [x] Executar os testes focados até ficarem verdes.
- [x] Executar `pnpm typecheck`.
- [x] Executar `pnpm lint`.
- [x] Fazer commit com uma mensagem de Conventional Commits.