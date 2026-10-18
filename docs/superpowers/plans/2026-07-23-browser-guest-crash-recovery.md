# Browser Guest Crash Recovery Implementation Plan

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Após a terminação anormal do guest Electron, as tabs de Browser e browser-use mantêm uma identidade de tab estável e a pertencimento à conversa, restaurando no lugar a URL válida mais recente e reconectando ao CDP.

**Arquitetura:** A troca normal de conversa continua preservando o `<webview>` original. `UnifiedBrowserView` escuta o evento guest `render-process-gone` e, somente para causas recuperáveis como killed/crashed/oom/memory-eviction, incrementa a geração do guest, fazendo com que `BrowserViewportSurface` substitua o nó inválido; a URL mais recente que não seja `about:blank` é mantida em memória isolada por workspaceKey do renderer e, após o `dom-ready` do novo guest, um novo webContentsId é reportado com o mesmo browserKey/tabId e a URL é restaurada. A limpeza dos listeners do guest antigo no main passa a ser best-effort, evitando que uma sessão já destruída impeça o attach do guest substituto; relay e o protocolo de sessão do ZCode não recebem novos estados.

**Stack tecnológico:** React 19, Electron `<webview>`, TypeScript, Vitest + Testing Library.

## Restrições globais

- A troca normal A → B → A não deve reconstruir, recarregar ou desmontar um `<webview>` ainda vivo.
- O fechamento explícito de tab/janela pelo usuário e a saída do processo ZCode não devem ser restaurados automaticamente.
- O `desktop-continuous` do desktop usa apenas as cadeias de attach existentes renderer/main; o `web-remote-replayable` do celular não adiciona snapshot nem runtime.
- A chave de isolamento de URL usa `workspaceIdentity?.trim() || workspacePath`; a URL real da tab é então agrupada pelo id de tab do side-pane estável.
- O log da UI usa unicamente `packages/ui/src/logger.ts`; saída anormal é um `warn` de lifecycle de baixa frequência; eventos comuns não geram novo tráfego de info em produção.
- Antes de modificar a UI, siga o `DESIGN.md` da raiz; esta correção não adiciona novos estilos visuais nem textos.
- Para cada comportamento de produção, escreva primeiro um teste que falhe e observe a falha esperada; ao final, execute `pnpm typecheck` e `pnpm lint`.

---

### Task 1: tipos de saída anormal do Electron webview e regressão de falha

**Arquivos:**
- Modify: `packages/ui/src/electron-webview.d.ts`
- Modify: `packages/ui/test/UnifiedBrowserView.test.ts`

**Interfaces:**
- Produces: `ElectronWebviewRenderProcessGoneEvent`, contendo `details.reason` e `details.exitCode`.
- Consumes: documentação local do Electron `docs/electron/docs/api/webview-tag.md` e `structures/render-process-gone-details.md`.

- [x] **Step 1: escrever o teste que falha para saída recuperável**

Em `UnifiedBrowserView.test.ts`, criar uma tab oculta já navegar até `https://example.com/restorable` e despachar no webview original o evento `render-process-gone` com `{ reason: "killed", exitCode: 1 }`; afirmar que o nó é substituído e que, após o `dom-ready` do novo nó, o attach ocorre com o mesmo browserKey, sessionId e o novo webContentsId, carregando a URL mais recente.

- [x] **Step 2: escrever o teste que falha para causa não recuperável**

Despachar `launch-failed`; afirmar que o nó não é substituído, evitando um loop infinito de recuperação.

- [x] **Step 3: rodar os testes e confirmar RED**

Run: `.\node_modules\.bin\vitest.CMD run packages/ui/test/UnifiedBrowserView.test.ts`

Expected: os novos casos FAIL, pois os tipos do Electron webview e o `UnifiedBrowserView` ainda não tratam `render-process-gone`.

### Task 2: substituição mínima do guest e restauração de URL

**Arquivos:**
- Modify: `packages/ui/src/browser-use/UnifiedBrowserView.tsx`
- Modify: `packages/ui/src/browser-use/BrowserViewportSurface.tsx`
- Modify: `packages/ui/src/embeddedBrowserHelpers.ts`

**Interfaces:**
- Produces: `isRecoverableBrowserGuestExitReason(reason: string): boolean`.
- Produces: parâmetro `webviewGeneration: number` de `BrowserViewportSurface`, usado como React key do `<webview>`.
- Consumes: `browserKey`, `initialUrl`, `onUrlChange` e `browserViewAttachGuest` já existentes em `UnifiedBrowserView`.

- [x] **Step 1: implementar o portão de causa de saída**

Permitir a recuperação apenas para `abnormal-exit`, `killed`, `crashed`, `oom`, `memory-eviction`;
`clean-exit`, `launch-failed` e `integrity-failure` não são reconstruídos automaticamente. Quando esse guest nunca chegou a exibir conteúdo com sucesso, o renderer
deve exibir um estado de falha com `reason/exitCode` e uma entrada de nova tentativa única disparada pelo usuário; não é permitido apenas gravar um campo
de erro sem consumidor de renderização, o que deixaria o usuário diante de uma tela cinza silenciosa. A nova tentativa manual pode incrementar a geração do guest e
restaurar a URL mais recente, mas não pode virar um laço automático de reconstrução em background. O estado de falha ainda permite editar a barra de endereço; ao
submeter uma nova URL válida, isso deve equivaler a uma reconstrução disparada pelo usuário: sair imediatamente do estado de falha, incrementar a geração do guest e,
após o `dom-ready` do novo guest, navegar para a URL recém-submetida, não apenas enfileirar a URL e permanecer no estado de falha. Uma URL inválida deve manter o
estado de falha e não deve disparar reconstrução.

Um `navigationRequest` externo também é uma intenção de navegação explícita e confiável: quando o guest já está no estado de falha acima, deve reconstruir o guest
da mesma forma que a navegação pela barra de endereço e consumir a URL de destino. O recibo da requisição não pode ser emitido após apenas gravar em
`pendingUrlRef`; é preciso esperar o novo guest assumir a URL enfileirada no `dom-ready` e o `loadURL` ter sucesso ou falhar explicitamente antes do recibo,
evitando que a camada superior limpre cedo uma intenção de navegação ainda não executada.

- [x] **Step 2: implementar a URL mais recente e a geração do guest**

Durante a navegação normal/sincronização de estado, registrar a URL mais recente que não seja `about:blank`. Em caso de saída recuperável, enfileirar essa URL em
`pendingUrlRef`, limpar o estado de deduplicação de attach/load do guest, incrementar a generation e preservar os metadados da tab.

- [x] **Step 3: fazer a surface substituir apenas o webview inválido**

Usar a generation como key do `<webview>`; props comuns, rerenders e trocas de conversa mantêm a generation inalterada.

- [x] **Step 4: reattach e navegação do novo guest**

Após o `dom-ready` do novo nó, continuar chamando o `browserViewAttachGuest({ key: browserKey, ... })` já existente e então consumir a URL pendente. Adicionar um
comentário em chinês registrando que a implementação antiga apenas preservava o DOM e não cobria a causa raiz do guest Chromium ter sido terminado.

- [x] **Step 5: rodar os testes e confirmar GREEN**

Run: `.\node_modules\.bin\vitest.CMD run packages/ui/test/UnifiedBrowserView.test.ts`

Expected: tudo passa e os ramos recuperável/não recuperável têm asserções.

### Task 3: URL do browser-use entra na memória isolada por workspace

**Arquivos:**
- Modify: `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`
- Modify: `packages/ui/test/UnifiedBrowserView.test.ts`

**Interfaces:**
- Consumes: `browserRestoreUrls: Record<sidePaneTabId, string>` e
  `onBrowserUrlChange(sidePaneTabId, url)`.
- Produces: wiring de `initialUrl` / `onUrlChange` do `UnifiedBrowserView` de browser-use.

- [x] **Step 1: adicionar asserções de retorno de URL do browser-use**

Quando o evento de navegação do componente atualizar a URL, afirmar que `onUrlChange` recebe uma URL não vazia; ao restaurar o novo guest, usar a mesma URL.

- [x] **Step 2: conectar a tab de browser-use**

Para `tab.type === "browser-use"`, usar `tab.id` para ler e escrever `browserRestoreUrls`, mantendo a mesma camada de isolamento do Browser humano e sem alterar
main/protocol.

- [x] **Step 3: rodar as regressões de UI relacionadas**

Run:
`.\node_modules\.bin\vitest.CMD run packages/ui/test/UnifiedBrowserView.test.ts packages/ui/test/workspaceSidePane.test.ts packages/ui/test/taskSidePaneMemory.test.ts`

Expected: os três arquivos passam.

### Task 3.5: corrida de bind do guest substituto no processo main

**Arquivos:**
- Modify: `packages/desktop/src/main/browserView/browserGuestManager.ts`
- Modify: `packages/desktop/test/browserGuestManager.test.ts`

- [x] **Step 1: localizar a interrupção do attach IPC com um log de crash real**

O primeiro smoke de `Page.crash` provou que a página e a URL foram restauradas, mas `tab.downloadCleanup` chamava `removeListener` em uma sessão já destruída e
lançava `Object has been destroyed`, fazendo o attach do CDP do novo guest falhar prematuramente.

- [x] **Step 2: escrever primeiro o teste que falha e só então degradar a limpeza dos listeners antigos**

O teste simula a limpeza da sessão antiga lançando erro e afirma que o guest substituto da mesma tab key ainda consegue fazer attach; a implementação usa `try/finally`
para garantir a liberação das referências de limpeza e seguir com o desbind/rebind.

- [x] **Step 3: repetir o crash real no Electron**

No segundo smoke, o guest 2 → 3 e a URL original foram restaurados; o main registrou a degradação da limpeza e continuou com `attachGuest ... cdp=true`, sem
mais erros de handler IPC.

### Task 4: evidências, matriz e gates do repositório

**Arquivos:**
- Modify: `docs/testing/browser-use-codex-parity-coverage-matrix.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Consumes: BCP-207/208, J07 e os resultados reais dos testes.

- [x] **Step 1: atualizar o status de cobertura**

Mudar de planned para caminho automatizado as partes já provadas por component/main unit e registrar os resultados reais de `Page.crash` no Electron e do smoke
A → B → A no mesmo workspace.

- [x] **Step 2: rodar os gates de tipo e lint**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm lint`

Expected: exit 0; os warnings já existentes no repositório são registrados separadamente.

- [x] **Step 3: verificar o diff e commitar**

Adicionar ao stage apenas os arquivos listados neste plano, excluindo os artefatos de reprodução do usuário em `packages/desktop/.codex-*`.

Run: `git diff --check`

Expected: exit 0.

Commit: `fix(ui): recover crashed browser guests`