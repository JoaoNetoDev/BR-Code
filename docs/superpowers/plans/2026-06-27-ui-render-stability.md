# Plano de implementação: estabilidade de renderização da UI

> Status (2026-07-15): implementado; este documento é mantido como plano de implementação histórico. A implementação atual segue `packages/ui/src/TaskList.tsx`,
> `packages/ui/src/TaskListItem.tsx` e `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`;
> os checkboxes abaixo são um template de plano e não representam o progresso atual; os antigos passos relacionados a `ChatMessage` também não representam a estrutura de renderização de sessões V4.

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** reduzir renderizações repetidas da UI de workspace em sessões grandes, sem alterar o comportamento de tasks, shell, menus ou composer.

**Architecture:** estabilizar as props nas fronteiras de componentes existentes e adiar o conteúdo pesado do menu de contexto por linha até o menu abrir. Manter o estado de negócio nos stores atuais; usar refs apenas para ler valores mais recentes dentro de callbacks de evento estáveis.

**Tech Stack:** React 19, TypeScript, Zustand, menus de contexto/tooltips do Radix, Vitest.

## Restrições globais

- Mudanças de UI devem seguir o `DESIGN.md`; nenhum redesenho visual faz parte deste trabalho.
- O fluxo continuous de tasks no desktop e o fluxo replayable de tasks no web remoto devem permanecer separados.
- O logging da UI, se adicionado, precisa usar `packages/ui/src/logger.ts`; este plano não exige novo logging.
- Os caminhos de import precisam permanecer absolutos.
- Executar `pnpm typecheck` e `pnpm lint` antes do commit.

---

### Task 1: Estabilidade das ações de linha do TaskList

**Files:**
- Modify: `packages/ui/src/TaskList.tsx`
- Test: `packages/ui/test/taskListRenderStability.test.ts`

**Interfaces:**
- Produz props estáveis para `MemoTaskItem`: `onArchiveTaskInline`, `onCancelArchiveConfirm`, `onTogglePinTask`, `onStartRenameTask`, `onArchiveTask`, `onMarkTaskAsUnread`.

- [ ] Adicionar um teste que falha, re-renderizando `TaskList` com entradas de estado local alteradas enquanto os dados das tasks não mudam, e então afirmar que as props de ação de linha inalteradas mantêm a identidade de referência.
- [ ] Executar o teste específico e verificar que ele falha porque as props de ação de linha atuais mudam.
- [ ] Refatorar os callbacks de `TaskList` para ler valores mutáveis mais recentes por refs onde necessário e manter as referências dos callbacks estáveis.
- [ ] Executar o teste específico e verificar que ele passa.

### Task 2: Atraso de menu e conteúdo de hover no TaskListItem

**Files:**
- Modify: `packages/ui/src/TaskListItem.tsx`
- Test: `packages/ui/test/taskListItemHoverActions.test.ts`

**Interfaces:**
- Mantém o comportamento atual de renderização apenas-when-open do `TaskListItemContextMenu`, coberto por um teste focado.
- Mantém `loadTaskPaths` e `loadProviderConfig` vinculados ao estado de abertura.
- Adia o conteúdo de tooltip/ação de arquivamento exclusivo de hover até a linha ter o mouse sobre ela ou já estar confirmando o arquivamento.

- [ ] Adicionar um teste comprovando que linhas de task fechadas não renderizam `TaskListItemContextMenu`.
- [ ] Adicionar um teste comprovando que abrir o menu de contexto da linha renderiza o conteúdo do menu uma única vez.
- [ ] Adicionar um teste que falhe comprovando que linhas ociosas não montam o tooltip/ação de arquivamento exclusivo de hover.
- [ ] Condicionar o conteúdo de ação exclusivo de hover ao estado de hover/confirmação de arquivamento, preservando o comportamento de trigger do `ContextMenu`.
- [ ] Executar os testes específicos e verificar que passam.

### Task 3: Props estáveis de reset/callback no shell do workspace

**Files:**
- Modify: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- Test: os testes existentes de estabilidade de renderização, ou um novo teste focado se a fronteira do componente puder ser isolada com baixo custo.

**Interfaces:**
- Estabiliza os arrays de `resetKeys` e as props de callback de renderização passadas às fronteiras e ao shell mobile.

- [ ] Memoizar os arrays de reset key pelos seus valores semânticos.
- [ ] Memoizar os callbacks de renderização que são passados como props.
- [ ] Executar os testes de UI afetados.

### Task 4: Props estáveis no composer e na barra de ferramentas do chat

**Files:**
- Inspect/modify: `packages/ui/src/ChatView.tsx`
- Inspect/modify: `packages/ui/src/ChatView/ChatViewComposer.tsx`
- Inspect/modify: `packages/ui/src/ChatView/ChatPromptEditor.tsx`
- Inspect/modify: controles relacionados da barra de ferramentas, caso sejam eles os donos das props instáveis.

**Interfaces:**
- Estabiliza `attachmentAction`, o controle de submit, `initialConfig` e os callbacks da barra de ferramentas equivalentes, onde eles cruzam fronteiras de componentes memoizados.

- [ ] Adicionar ou estender um teste focado de estabilidade de renderização, se um teste existente de composer conseguir isolar a fronteira.
- [ ] Memoizar os objetos de ação e callbacks equivalentes.
- [ ] Executar os testes de UI afetados.

### Task 5: Verificação final

**Files:**
- Todo o código e a documentação alterados.

- [ ] Executar os testes direcionados dos arquivos de UI alterados.
- [ ] Executar `pnpm typecheck`.
- [ ] Executar `pnpm lint`.
- [ ] Revisar o `git diff`.
- [ ] Commitar com uma mensagem de Conventional Commits.