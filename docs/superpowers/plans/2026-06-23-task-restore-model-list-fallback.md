# Plano de implementação: fallback da lista de modelos no restore de task

> Status (2026-07-15): após a implementação da antiga solução de UI, ela foi substituída pela migração para V4; este documento é mantido como registro histórico de implementação.
> O posicionamento automático atual de modelos indisponíveis é responsabilidade de `packages/ui/src/v4/composer/modelAutoPosition.ts`, que reutiliza
> a função pura viva de `packages/ui/src/chat-input-toolbar/modelSelection.ts`; o antigo caminho de hook/toolbar abaixo não é mais a cadeia atual.

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** restaurar modelos históricos indisponíveis de tasks auto-selecionando o primeiro modelo da lista de modelos visível.

**Architecture:** manter a resolução de modelo local da task em `zcodeTaskResumeModel.ts`; manter o fallback da lista de modelos visível nos helpers de seleção de modelo da barra de ferramentas. Remover do restore o fallback de primeiro modelo do snapshot do provider, para que a única troca automática use a mesma lista de modelos da qual os usuários podem selecionar.

**Tech Stack:** React, Zustand, TypeScript, Vitest, pnpm.

## Restrições globais

- Não alterar o comportamento da troca manual de modelo.
- Manter o fallback restrito a modelos históricos de task confirmados como indisponíveis e a seleções customizadas indisponíveis na barra de ferramentas.
- Preservar as fronteiras de restore continuous do desktop e replayable do web remoto.
- Adicionar ou atualizar os testes antes das mudanças no código de produção.

---

### Task 1: Travar o comportamento de fallback da lista de modelos visível

**Files:**
- Modify: `packages/ui/test/chatInputToolbarModelGroups.test.ts`
- Modify: `packages/ui/src/chat-input-toolbar/modelSelection.ts`
- Modify: `packages/ui/src/ChatInputToolbar.tsx`

**Interfaces:**
- Consumes: `resolveUnavailableModelListFallback(params)`
- Produces: o fallback da task ativa pode retornar `modelSelectGroups[0].items[0].value`

- [x] **Step 1: Escrever o teste que falha**

Adicionar testes afirmando que, na task ativa, o modelo atual indisponível faz fallback para o primeiro item da lista de modelos visível.

- [x] **Step 2: Executar o teste para verificar que falha**

Executar: `pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts`
Esperado: FAIL porque o código atual retorna `null` quando há `taskId`.

- [x] **Step 3: Escrever a implementação mínima**

Substituir o helper de fallback apenas-custom pelo fallback da lista de modelos visível e parar de passar `taskId` a partir de `ChatInputToolbar`.

- [x] **Step 4: Executar o teste para verificar que passa**

Executar: `pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts`
Esperado: PASS.

### Task 2: Parar o fallback de restore para o primeiro modelo do snapshot do provider

**Files:**
- Modify: `packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`
- Modify: `packages/ui/src/lib/zcodeTaskResumeModel.ts`
- Modify: `packages/ui/src/hooks/useTaskRestore.ts`

**Interfaces:**
- Consumes: `resolveAvailableResumeModelForExistingTask(params)`
- Produces: resolução de modelo de task indisponível sem fallback do snapshot do provider

- [x] **Step 1: Escrever o teste que falha**

Atualizar o teste de restore para que um snapshot de provider disponível ainda retorne o modelo original indisponível com `fallbackApplied: false`.

- [x] **Step 2: Executar o teste para verificar que falha**

Executar: `pnpm vitest run packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`
Esperado: FAIL porque o código atual retorna o fallback do snapshot do provider.

- [x] **Step 3: Escrever a implementação mínima**

Remover o helper de fallback do snapshot do provider e manter apenas a detecção de disponibilidade e `unavailableModel`.

- [x] **Step 4: Executar o teste para verificar que passa**

Executar: `pnpm vitest run packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts`
Esperado: PASS.

### Task 3: Verificação final

**Files:**
- Verificar todos os arquivos alterados pelas Tasks 1-2.

- [x] **Step 1: Executar os testes direcionados**

Executar: `pnpm vitest run packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts packages/ui/test/chatInputToolbarModelGroups.test.ts packages/ui/test/useTaskRestoreRuntimeSnapshot.test.ts`
Esperado: PASS.

- [x] **Step 2: Executar as verificações obrigatórias**

Executar: `pnpm typecheck`
Esperado: exit 0.

Executar: `pnpm lint`
Esperado: exit 0; os warnings existentes podem permanecer.

- [ ] **Step 3: Commitar**

Executar:
```bash
git add docs/superpowers/specs/2026-06-23-task-restore-model-list-fallback-design.md docs/superpowers/plans/2026-06-23-task-restore-model-list-fallback.md packages/ui/src/ChatInputToolbar.tsx packages/ui/src/chat-input-toolbar/modelSelection.ts packages/ui/src/hooks/useTaskRestore.ts packages/ui/src/lib/zcodeTaskResumeModel.ts packages/ui/test/chatInputToolbarModelGroups.test.ts packages/ui/test/useZCodeChatSendPromptQueuePolicy.test.ts
git commit -m "fix: use visible model list for task restore fallback"
```