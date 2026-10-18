# Plano de Implementação do Re-focus do Chat Find

> **Status: já implementado pela cadeia de busca do V4; este documento é preservado como plano histórico de implementação.** O comportamento atual está em
> [Task Find Dialog](../../ui/task-find-dialog.md), e o ponto de entrada atual do código é
> `packages/ui/src/v4/useConversationTimelineFind.ts` e `packages/ui/src/quickpick/TaskFindDialog.tsx`;
> o caminho `ChatView` / `useConversationFindHighlights` descrito abaixo foi removido.

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** permitir que a navegação repetida com anterior/próximo/Enter/Shift+Enter recentralize uma única ocorrência de busca tanto no conteúdo da conversa quanto nos diffs de alteração de arquivo.

**Arquitetura:** manter consulta e índice ativo como estado de seleção e adicionar ids de requisição de navegação monotônicos crescentes e independentes para os escopos de conversa e de alteração de arquivo. Eventos de navegação explícita incrementam o id apropriado; `useConversationFindHighlights` inclui o id em seu efeito e na chave de deduplicação de rolagem, enquanto o GitPane também reexecuta o posicionamento de linhas virtuais para uma requisição repetida de alteração de arquivo.

**Stack técnico:** React 19, TypeScript, Vitest, E2E com Electron/WebdriverIO.

## Restrições globais

- Atualizar antes do código a spec existente de chat-find e o catálogo/matriz de conversas.
- Preservar as fronteiras de desktop `desktop-continuous` e móvel `web-remote-replayable`; os ids de navegação permanecem locais do renderer.
- Suportar os escopos de conversa e de alteração de arquivo de forma independente.
- Suportar anterior, próximo, Enter e Shift+Enter com a mesma semântica de navegação repetida.
- Preservar a deduplicação de rolagem por mutação de DOM já existente.
- Usar imports absolutos `@/` e comentários sobre a causa dos bugs em chinês.
- Executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint` antes de concluir.

---

### Task 1: Testes de regressão de navegação e realce focados

**Arquivos:**
- Testar: `packages/ui/test/conversationFindSearch.test.ts`

**Interfaces:**
- Consome: helpers de direção/requisição de navegação e helper de chave de rolagem do realce.
- Produz: prova falhada de que a navegação repetida precisa criar uma requisição de rolagem distinta mesmo quando o índice permanece em `0`.

- [x] **Etapa 1: Escrever o teste falho de navegação**

Verificar que anterior, próximo, Enter e Shift+Enter resolvem para as direções compartilhadas e que uma única ocorrência faz wrap para o índice `0` nas duas direções, ainda produzindo uma requisição de navegação.

- [x] **Etapa 2: Escrever o teste falho de deduplicação do realce**

Verificar que a chave de rolagem do realce muda quando apenas `navigationRequestId` muda. O ambiente Vitest do repositório não inclui jsdom, então esse teste puro mantém o RED focado no comportamento ausente em vez de falhar por ambiente de teste indisponível.

- [x] **Etapa 3: Executar os testes e verificar RED**

Executar:

```bash
pnpm exec vitest run packages/ui/test/conversationFindSearch.test.ts
```

Esperado: FAIL porque `TaskFindDialog` não tem callbacks de navegação explícitos e o hook de realce não tem id de requisição de navegação.

### Task 2: Estado de requisição de navegação local do renderer

**Arquivos:**
- Modificar: `packages/ui/src/App.tsx`
- Modificar: `packages/ui/src/quickpick/TaskFindDialog.tsx`
- Modificar: `packages/ui/src/ChatView/useConversationFindHighlights.ts`
- Modificar: `packages/ui/src/ChatView/ChatViewConversation.tsx`
- Modificar: `packages/ui/src/ChatView.tsx`
- Modificar: `packages/ui/src/ChatView/types.ts`
- Modificar: `packages/ui/src/GitPane.tsx`
- Modificar: `packages/ui/src/app-shell/types.ts`
- Modificar: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
- Modificar: `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`

**Interfaces:**
- Produz: `conversationFindNavigationRequestId: number`, `fileChangeFindNavigationRequestId: number`.
- Produz: `onConversationFindNavigate(query: string, activeIndex: number)` e `onFileChangeFindNavigate(query: string, activeIndex: number)`.
- Consome: `navigationRequestId?: number` em `useConversationFindHighlights`.

- [x] **Etapa 1: Adicionar callbacks explícitos de navegação no diálogo**

Manter `on*FindChange` para sincronização de consulta/escopo. Passar apenas `moveSelection()` pelos novos callbacks `on*FindNavigate`, para que botões e teclado compartilhem um único caminho de evento.

- [x] **Etapa 2: Adicionar ids de requisição independentes no App**

Usar atualizações funcionais:

```ts
setConversationFindNavigationRequestId((requestId) => requestId + 1);
setFileChangeFindNavigationRequestId((requestId) => requestId + 1);
```

Cada handler de navegação também atualiza consulta/índice. Não é necessário resetar os ids, pois são contadores monotônicos transitórios com escopo no App montado.

- [x] **Etapa 3: Passar os ids de requisição pelas superfícies de chat e Git**

Passar o id de conversa por `WorkspaceShellLayout -> ChatView -> ChatViewConversation -> useConversationFindHighlights`. Passar o id de arquivo por `WorkspaceShellLayout -> AnimatedSidePanePanel -> GitPane -> useConversationFindHighlights` e incluí-lo nas dependências do efeito de posicionamento das linhas virtuais do Git.

- [x] **Etapa 4: Incluir o id de requisição na deduplicação do realce**

Usar:

```ts
const scrollKey = `${normalizedQuery}:${resolvedActiveIndex}:${ranges.length}:${navigationRequestId}`;
```

e adicionar `navigationRequestId` à lista de dependências do efeito. Manter as chamadas dirigidas por mutação deduplicadas dentro de um mesmo id de requisição.

- [x] **Etapa 5: Executar os testes direcionados e verificar GREEN**

Executar o comando Vitest da Task 1. Esperado: todos os testes passam.

### Task 3: Caso de regressão Electron pendente

**Arquivos:**
- Criar: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts`

**Interfaces:**
- Consome: ponte `window.__zcodeSessionStoreE2E` exclusiva do WDIO.
- Produz: evidência `CFR` pendente de manual review para o item de catálogo `CF01`; nenhuma requisição ao provider.

- [x] **Etapa 1: Escrever a reprodução E2E**

Usar a ponte de store Zustand exclusiva do WDIO para criar uma tarefa concluída com uma longa mensagem do assistant contendo `E2E_CHAT_FIND_REFOCUS_NEEDLE`. Abrir Cmd/Ctrl+F, buscar o marcador, rolar para longe e então verificar que próximo, anterior, Enter e Shift+Enter cada um devolvem o mesmo marcador ao centro da viewport enquanto o contador permanece em `1/1`.

- [x] **Etapa 2: Executar o caso**

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts'
```

Esperado: PASS após a Task 2. A spec permanece pendente até a revisão humana; não promovê-la automaticamente.

### Task 4: Verificação completa e commit da implementação

**Arquivos:**
- Revisar todos os arquivos modificados acima.

- [x] **Etapa 1: Executar a verificação direcionada e a obrigatória**

```bash
pnpm exec vitest run packages/ui/test/conversationFindSearch.test.ts
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
git diff --check
```

- [x] **Etapa 2: Revisar o diff e o estado do repositório**

Confirmar que nenhum arquivo rastreado não relacionado nem o diretório não rastreado preexistente `.agents/skills/zcode-rum-crash-triage/` estejam no índice.

- [x] **Etapa 3: Commitar a implementação**

```bash
git add packages/ui/src packages/ui/test/conversationFindSearch.test.ts packages/ui/test/chatViewConversation.test.ts packages/ui/test/gitPaneVirtualList.test.ts packages/ui/test/linuxDesktopTitlebarOverlay.test.ts packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts docs/superpowers/plans/2026-07-10-chat-find-refocus.md
git commit -m "fix(ui): refocus repeated chat find navigation"
```

### Task 5: Revisar o estado de navegação de acompanhamento e as guardas de teclado

**Arquivos:**
- Criar: `packages/ui/src/quickpick/taskFindNavigationState.ts`
- Criar: `packages/ui/test/taskFindNavigationState.test.ts`
- Modificar: `packages/ui/src/App.tsx`
- Modificar: `packages/ui/src/quickpick/conversationFindSearch.ts`
- Modificar: `packages/ui/src/quickpick/TaskFindDialog.tsx`
- Modificar: `packages/ui/test/conversationFindSearch.test.ts`
- Modificar: `packages/ui/test/taskFindDialogNavigation.test.ts`

**Interfaces:**
- Produz: `TaskFindNavigationState` com `query`, `activeIndex` e `navigationRequestId`.
- Produz: `changeTaskFindSelection(state, query, activeIndex)` que preserva o id da requisição.
- Produz: `navigateTaskFindSelection(state, query, activeIndex)` que incrementa o id da requisição mesmo quando o índice não muda.
- Renomeia: `createConversationFindNavigationRequest` para `resolveConversationFindNavigationSelection`, porque o helper do diálogo não cria a identidade completa da requisição.

- [x] **Etapa 1: Escrever os testes falhos de transição de estado e de diálogo**

Verificar que duas navegações consecutivas com o mesmo índice produzem os ids de requisição `1` e `2`, que mudanças comuns de consulta/índice preservam o id atual, que ArrowUp/ArrowDown entram no callback de navegação real do diálogo e que toda entrada de navegação por teclado é ignorada quando `total === 0`.

- [x] **Etapa 2: Executar os testes e verificar RED**

```bash
pnpm exec vitest run packages/ui/test/taskFindNavigationState.test.ts packages/ui/test/taskFindDialogNavigation.test.ts
```

Esperado: FAIL porque o helper de transição pertencente ao App não existe, as setas não são cobertas pelo helper de componente e a navegação por teclado com zero ocorrências ainda invoca `on*FindNavigate`.

- [x] **Etapa 3: Implementar a transição mínima de estado e a guarda de zero ocorrências**

Usar dois objetos `TaskFindNavigationState` independentes no `App`. Manter as contagens de ocorrências separadas. Passar a mudança comum por `changeTaskFindSelection`, a navegação explícita por `navigateTaskFindSelection`, e fazer `TaskFindDialog.moveSelection` retornar antes de criar uma requisição quando `activeFindState.total === 0`.

- [x] **Etapa 4: Executar os testes e verificar GREEN**

Executar o comando Vitest da Task 5. Esperado: todos os testes passam.

### Task 6: Confirmação de CF01 e evidência pendente de manual review de CF02

**Arquivos:**
- Modificar: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Mantém: o caso pendente `CFR` sem provider e a injeção de conversa por `window.__zcodeSessionStoreE2E`.
- Adiciona: um arquivo de workspace Git local do caso com um marcador de alteração de arquivo e linhas suficientes para provar o comportamento de rolar para longe/centralizar de novo.
- Produz: evidência de manual review para os dois itens de catálogo aceitos, CF01 e CF02, sem promoção nem admissão de fixture de replay.

- [x] **Etapa 1: Estender o E2E pendente com CF02**

Inicializar o Git em `DEFAULT_WORKSPACE`, commitar um arquivo de texto puro de baseline vazio e então adicionar 1.300 linhas com um `E2E_FILE_CHANGE_FIND_REFOCUS_NEEDLE` perto do início, para que o GitPane use seu fallback de texto puro em light-DOM mantendo uma região de rolagem longa. Mudar o diálogo de busca aberto para o escopo de alteração de arquivo, aguardar `1/1`, rolar o diff expandido para longe e verificar que anterior/próximo/Enter/Shift+Enter cada um recentraliza o mesmo marcador.

- [x] **Etapa 2: Atualizar a matriz de cobertura com honestidade**

Manter o status de CF01/CF02 como `planned`, registrar que o CFR agora fornece evidência pendente de manual review para os dois escopos, e continuar afirmando que não existe fixture de replay formal, admissão em Docker nem promoção em CI.

- [x] **Etapa 3: Executar o caso pendente**

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts'
```

Esperado: os cenários de conversa e de alteração de arquivo passam. Manter a spec em `manual-review/pending/` até que uma pessoa aprove explicitamente a promoção.

- [x] **Etapa 4: Executar os portões finais e commitar**

```bash
pnpm exec vitest run packages/ui/test/conversationFindSearch.test.ts packages/ui/test/taskFindNavigationState.test.ts packages/ui/test/taskFindDialogNavigation.test.ts packages/ui/test/chatViewConversation.test.ts packages/ui/test/gitPaneVirtualList.test.ts packages/ui/test/linuxDesktopTitlebarOverlay.test.ts
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
git diff --check
git add docs/superpowers/plans/2026-07-10-chat-find-refocus.md docs/testing/conversation-session-e2e-coverage-matrix.md packages/ui/src/App.tsx packages/ui/src/quickpick/conversationFindSearch.ts packages/ui/src/quickpick/taskFindNavigationState.ts packages/ui/src/quickpick/TaskFindDialog.tsx packages/ui/test/conversationFindSearch.test.ts packages/ui/test/taskFindNavigationState.test.ts packages/ui/test/taskFindDialogNavigation.test.ts packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts
git commit -m "fix(ui): align chat find navigation edge cases"
```

### Task 7: Manter o chat find móvel fora da superfície inerte

**Arquivos:**
- Modificar: `packages/ui/test/webRemoteControlMobileShell.test.ts`
- Modificar: `packages/ui/test/workspaceShellRemoteMobileLayout.test.ts`
- Modificar: `packages/ui/src/WebRemoteControlMobileShell.tsx`
- Modificar: `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`

**Interfaces:**
- Adiciona: `chatOverlay?: ReactNode` a `WebRemoteControlMobileShell`.
- Mantém: `chatContent` dentro da superfície de chat móvel existente com `inert` / `aria-hidden`.
- Renderiza: `chatOverlay` como uma camada irmã com `data-mobile-chat-overlay="true"`, `z-40` e eventos de ponteiro restaurados para o conteúdo filho.

- [x] **Etapa 1: Escrever os testes falhos de DOM móvel e de integração do WorkspaceShell**

Em `webRemoteControlMobileShell.test.ts`, passar uma subárvore real de input/button como `chatOverlay` enquanto `isSidePaneOpen=true`. Verificar que o marcador está presente dentro de `data-mobile-chat-overlay`, ausente do conteúdo serializado de `<main inert>` e renderizado depois do main inerte. Em `workspaceShellRemoteMobileLayout.test.ts`, ensinar apenas o test double a renderizar a prop `chatOverlay`, abrir `taskFindDialogProps` e verificar que o placeholder de busca é fornecido por essa prop em vez de `chatContent`.

- [x] **Etapa 2: Executar os dois testes e verificar RED**

```bash
pnpm exec vitest run packages/ui/test/webRemoteControlMobileShell.test.ts packages/ui/test/workspaceShellRemoteMobileLayout.test.ts
```

Esperado: FAIL porque `WebRemoteControlMobileShell` não tem slot de `chatOverlay` e `WorkspaceShellLayout` ainda coloca `renderChatFindDialog()` dentro do `chatContent` móvel.

- [x] **Etapa 3: Implementar a fronteira de overlay móvel**

Adicionar a prop opcional e renderizá-la dentro do wrapper de conteúdo móvel, depois do overlay do painel lateral:

```tsx
{chatOverlay ? (
  <div
    className="pointer-events-none absolute inset-0 z-40"
    data-mobile-chat-overlay="true"
  >
    <div className="pointer-events-auto">{chatOverlay}</div>
  </div>
) : null}
```

No ramo móvel dedicado de `WorkspaceShellLayout`, remover `renderChatFindDialog()` de `chatContent` e passar `chatOverlay={renderChatFindDialog()}` para `WebRemoteControlMobileShell`. Não alterar o ponto de renderização do painel de conversa do desktop nem enfraquecer o `inert` móvel.

- [x] **Etapa 4: Executar os dois testes e verificar GREEN**

Executar o comando Vitest da Task 7. Esperado: os dois arquivos passam.

### Task 8: Respeitar eventos Escape já tratados

**Arquivos:**
- Modificar: `packages/ui/test/taskFindDialogNavigation.test.ts`
- Modificar: `packages/ui/src/quickpick/TaskFindDialog.tsx`

**Interfaces:**
- Mantém: Escape não tratado fecha o find do posicionamento de chat.
- Adiciona: `event.defaultPrevented === true` impede que o listener da janela feche o find.

- [x] **Etapa 1: Escrever os testes falhos de prioridade do Escape**

Estender o alvo mínimo de evento de janela em `taskFindDialogNavigation.test.ts` para que os testes despachem o handler real de `keydown` instalado pelo efeito. Verificar que um Escape pré-cancelado deixa `onOpenChange` intacto, enquanto um Escape não tratado chama `onOpenChange(false)` e passa a ter default prevenido.

- [x] **Etapa 2: Executar o teste do diálogo e verificar RED**

```bash
pnpm exec vitest run packages/ui/test/taskFindDialogNavigation.test.ts
```

Esperado: o teste de Escape pré-cancelado falha porque o listener atual da janela fecha o find sem verificar `defaultPrevented`.

- [x] **Etapa 3: Adicionar a guarda mínima de Escape**

```ts
if (event.defaultPrevented || event.key !== "Escape") {
  return;
}
```

Manter as chamadas existentes de `preventDefault()` e `onOpenChange(false)` para um Escape não tratado.

- [x] **Etapa 4: Executar o teste do diálogo e verificar GREEN**

Executar o comando Vitest da Task 8. Esperado: todos os casos de navegação de diálogo e de Escape passam.

### Task 9: Notas de cobertura, portões de regressão e entrega

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Revisar: todos os arquivos das Tasks 7-8.

**Interfaces:**
- Registra: a cobertura de DOM móvel prova que o overlay está fora da superfície inerte.
- Preserva: `CFR` em `manual-review/pending`; sem promoção, fixture de replay, admissão em Docker ou alegação de CI.

- [x] **Etapa 1: Atualizar o escopo do catálogo e da matriz**

Afirmar que o Web móvel reutiliza o mesmo comportamento de navegação mas precisa de uma asserção distinta de composição de DOM, porque seu painel lateral é um overlay com uma superfície de chat inerte. Registrar a cobertura de componente/integração com honestidade e manter CF01/CF02 como `planned`.

- [x] **Etapa 2: Executar a verificação direcionada e a obrigatória**

```bash
pnpm exec vitest run packages/ui/test/webRemoteControlMobileShell.test.ts packages/ui/test/workspaceShellRemoteMobileLayout.test.ts packages/ui/test/taskFindDialogNavigation.test.ts packages/ui/test/taskFindNavigationState.test.ts packages/ui/test/conversationFindSearch.test.ts packages/ui/test/chatViewConversation.test.ts packages/ui/test/gitPaneVirtualList.test.ts
ZCODE_GIT_BINARY=/usr/bin/git ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-chat-find-refocus.test.ts'
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
git diff --check
```

Esperado: todos os testes direcionados e o caso desktop pendente passam; o lint reporta zero erros. O caso desktop pendente continua sendo evidência de rolagem no desktop, não uma alegação de E2E móvel replayable.

- [x] **Etapa 3: Commitar e enviar o acompanhamento da revisão**

```bash
git add packages/ui/src/WebRemoteControlMobileShell.tsx packages/ui/src/app-shell/WorkspaceShellLayout.tsx packages/ui/src/quickpick/TaskFindDialog.tsx packages/ui/test/webRemoteControlMobileShell.test.ts packages/ui/test/workspaceShellRemoteMobileLayout.test.ts packages/ui/test/taskFindDialogNavigation.test.ts docs/conversation-session-case-catalog.md docs/testing/conversation-session-e2e-coverage-matrix.md docs/superpowers/plans/2026-07-10-chat-find-refocus.md
git commit -m "fix(ui): keep mobile task find interactive"
git push
```