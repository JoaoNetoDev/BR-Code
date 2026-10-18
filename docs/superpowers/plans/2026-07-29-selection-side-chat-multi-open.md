# Plano de Implementação de Abertura Múltipla de Conversas Auxiliares

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Suportar múltiplas conversas auxiliares abertas a partir do mesmo sessão pai, e anexar ao final a citação por seleção de texto da linha do tempo principal na conversa auxiliar atualmente ativa; criar uma nova quando não houver nenhuma ativa.

**Arquitetura:** O `createSelectionSideSession` da CLI já permite criar múltiplos filhos; desta vez apenas o renderer é ajustado. A tab do Side Pane é identificada de forma única pela `childSessionId`; o runtime gerencia somente a deduplicação de concorrência de criações "explícitas" e o estado de bloqueio do filho; o destino atual é resolvido a partir do `activeTabId` do Side Pane e repassado ao `SessionPane` principal.

**Stack tecnológico:** React 19, TypeScript, Zustand/registry do renderer, Vitest, E2E Electron com WebdriverIO.

## Restrições globais

- Atualizar primeiro `docs/ui/conversation-selection-side-chat.md`, o catálogo de casos e a matriz de cobertura, e só então modificar o código.
- O isolamento de workspace usa uniformemente `workspaceIdentity?.trim() || workspacePath`; caminhos de arquivo e de comando continuam usando `workspacePath`.
- Electron desktop e Web desktop compartilham a semântica; o `/remote` do celular não ganha nova entrada nem altera a cadeia de recuperação replayable.
- Textos de UI internacionalizados; títulos de múltiplas tabs usam o texto existente "conversa auxiliar" mais um número de sequência estável.
- Ao fechar uma tab, outra ou todas, encerra-se somente o runtime filho correspondente.
- Antes de concluir, executar testes focados, auditoria de cobertura, `pnpm typecheck` e `pnpm lint`.

---

### Tarefa 1: Congelar a semântica de produto nas specs

**Arquivos:**
- Modificar: `docs/ui/conversation-selection-side-chat.md`
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Produz: definições de aceitação de SSC25 (abertura múltipla), SSC26 (roteamento para a ativa) e SSC27 (criar quando não há destino ativo).

- [ ] **Passo 1:** Trocar o vínculo único pai→filho por um registro de tabs pai→filhos.
- [ ] **Passo 2:** Registrar que a entrada fixa cria a cada vez, que a seleção de texto prioriza a tab auxiliar ativa e que, sem nenhuma ativa, cria-se uma nova.
- [ ] **Passo 3:** Atualizar a poda de E2E e o status de cobertura.

### Tarefa 2: Adicionar testes falhos de registry e de tabs

**Arquivos:**
- Modificar: `packages/ui/test/selectionSideChatRuntime.test.ts`
- Modificar: `packages/ui/test/workspaceSidePane.test.ts`

**Interfaces:**
- Consome: `buildSelectionSideChatKey(workspaceKey, parentSessionId)` como escopo do opener.
- Produz: contrato de criação concorrente de `createSelectionSideChatInstance()`, tab id único por filho, títulos com número de sequência e contrato do resolvedor de tab ativa.

- [ ] **Passo 1:** Adicionar teste falho que cria dois filhos a partir de duas criações explícitas do mesmo pai.
- [ ] **Passo 2:** Adicionar teste falho que verifica que chamadas concorrentes do mesmo gesto de criação só criam uma vez.
- [ ] **Passo 3:** Adicionar teste falho que verifica que dois filhos geram duas tabs, com títulos `辅助对话 1/2`.
- [ ] **Passo 4:** Adicionar teste falho que verifica que a tab ativa, quando for uma conversa auxiliar, retorna o destino; caso contrário, retorna null.
- [ ] **Passo 5:** Executar o Vitest focado e confirmar que as novas asserções falham na implementação antiga.

### Tarefa 3: Implementar o estado de múltiplas instâncias no renderer

**Arquivos:**
- Modificar: `packages/ui/src/lib/selectionSideChatRuntime.ts`
- Modificar: `packages/ui/src/lib/workspaceSidePane.ts`
- Modificar: `packages/ui/src/app-shell/SidePaneTabTrigger.tsx`
- Modificar: `packages/ui/src/app-shell/sidePaneTabPresentation.ts`

**Interfaces:**
- Produz: busca de bloqueio com escopo de filho; `title` da tab; `getActiveSelectionSideChatTab(state, workspaceKey, parentSessionId)`.
- Produz: tab id de seleção `selection-side-chat:<workspace>:<parent>:<child>`.

- [ ] **Passo 1:** Separar a criação pendente do estado de bloqueio do filho; cada gesto concluído do launcher explícito pode criar um novo filho.
- [ ] **Passo 2:** Incluir a `childSessionId` no tab id, sem sobrescrever a tab já existente do mesmo pai.
- [ ] **Passo 3:** Atribuir o menor número de sequência livre de título com base nos números já usados pelas tabs existentes do mesmo pai.
- [ ] **Passo 4:** Exibição e busca de tabs usam o título da instância.
- [ ] **Passo 5:** Rodar os testes focados até passarem.

### Tarefa 4: Rotear a seleção para a tab auxiliar ativa

**Arquivos:**
- Modificar: `packages/ui/src/v4/SessionPane.tsx`
- Modificar: `packages/ui/src/v4/V4WorkspaceChatArea.tsx`
- Modificar: `packages/ui/src/v4/WorkbenchPane.tsx`
- Modificar: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- Modificar: `packages/ui/src/hooks/useAppPanels.ts`
- Modificar: `packages/ui/src/app-shell/SelectionSideChatPane.tsx`

**Interfaces:**
- Consome: `childSessionId` da tab de seleção ativa.
- Produz: `activeSelectionSideChatSessionId?: string | null` chegando ao `SessionPane` principal em foco.
- Produz: modo de requisição do opener `"new"` para o launcher fixo e `"selection"` para o tooltip de seleção.

- [ ] **Passo 1:** Resolver, a partir de `sidePaneState.activeTabId`, a tab de seleção ativa da sessão pai atual.
- [ ] **Passo 2:** Repassar o id do filho pelo shell props até o `SessionPane` principal, sem gravar em estado global de negócio.
- [ ] **Passo 3:** A ação de seleção de texto valida a existência do filho ativo e então anexa a citação e ativa; se não existir ou em caso de sessionNotFound, cria um novo filho.
- [ ] **Passo 4:** O launcher fixo sempre dispara uma nova criação; durante o período pendente, gestos repetidos são ignorados.
- [ ] **Passo 5:** Ao fechar, limpar bloqueio/referência/runtime por `childSessionId`, sem afetar as tabs irmãs.

### Tarefa 5: Ampliar a cobertura E2E

**Arquivos:**
- Modificar: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-selection-side-chat.test.ts`

**Interfaces:**
- Produz: evidências de manual-review desktop-contínuo para SSC25/26/27.

- [ ] **Passo 1:** Criar duas tabs auxiliares em sequência pela entrada fixa e afirmar que as `childSessionId` são diferentes.
- [ ] **Passo 2:** Ativar a primeira tab, fazer uma seleção de texto na linha do tempo principal e afirmar que a citação entra apenas no primeiro composer.
- [ ] **Passo 3:** Ativar uma tab não auxiliar, fazer uma seleção de texto e afirmar que um terceiro filho auxiliar é criado.
- [ ] **Passo 4:** Fechar uma das tabs e afirmar que os rascunhos e as citações dos demais filhos são preservados.

### Tarefa 6: Verificar todos os limites

**Arquivos:**
- Apenas verificação.

- [ ] **Passo 1:** Executar o Vitest focado de runtime de seleção e do side pane de workspace.
- [ ] **Passo 2:** Executar os testes de seleção de conversa e dos componentes relacionados.
- [ ] **Passo 3:** Executar `pnpm audit:conversation-session-coverage`.
- [ ] **Passo 4:** Executar `pnpm typecheck`.
- [ ] **Passo 5:** Executar `pnpm lint`.
- [ ] **Passo 6:** Realizar as verificações interativas SSC25/26/27 no ambiente desktop de desenvolvimento; se o ambiente atual de Node/Electron impedir, registrar explicitamente os itens não verificados.