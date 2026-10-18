# Plano de implementação: Electron Service Context Reload e correção de I55

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** corrigir 6 timeouts de preflight de ContextId no service do Electron, as condições de corrida reais de restart em I38/I39/I42 e o problema de I55 não estabelecer explicitamente o estado anterior `high`.

**Architecture:** manter o contrato existente de launcher/capability do `wdio-electron-service@9.2.1` e, com o wrapper de service E2E do projeto, incluir o probe do main process na condição de conclusão de `before`; quando o service antigo engole a primeira falha de ContextId, reconectar o bridge apenas uma vez. O reload do App real usa `overwriteCommand` para inserir a barreira de saída do PID antigo entre o delete interno do `reloadSession` do WebdriverIO e a criação da nova session; o `onReload` do wrapper reinicializa o CDP bridge e o vínculo da janela. I55 seleciona explicitamente `high` por um comando real de toolbar/V4 antes de criar a Session A e então verifica a herança por B e o isolamento A/B.

**Tech Stack:** WebdriverIO 9, `wdio-electron-service` 9.2.1, Electron 41, Mocha, Vitest, TypeScript.

## Restrições globais

- Não adicionar sleep fixo; a inicialização saudável permite apenas um readiness probe.
- Retry do bridge no máximo uma vez; a segunda falha precisa propagar como falha de infraestrutura.
- Após o delete interno de `reloadSession()` e antes de criar a nova session, é obrigatório esperar o PID principal antigo do Electron encerrar, e depois é obrigatório reconstruir o service via `onReload`; é proibido repetir `deleteSession()` na camada externa.
- O `high` de I55 só pode ser estabelecido por uma ação real de configuração do usuário, nunca falsificado com seed de localStorage após o mount do renderer.
- Manter em comentários em português a causa do bug e a justificativa da correção.
- Executar unit tests focados, verificação de fixture, E2E alvo, typecheck do desktop E2E, typecheck completo e lint.
- Commit final com Conventional Commit.

---

### Task 1: Travar o contrato de readiness e reload do service do Electron

**Files:**

- Create: `packages/desktop/test/e2e/helpers/e2e-electron-service.ts`
- Create: `packages/desktop/test/e2e/helpers/e2e-electron-service-lifecycle.ts`
- Create: `packages/desktop/test/e2eElectronServiceLifecycle.test.ts`
- Modify: `packages/desktop/wdio.conf.ts`

- [x] Escrever primeiro o teste que falha: a inicialização saudável chama o probe apenas uma vez; a primeira falha de probe faz reset/reconnect; a segunda falha propaga; o módulo do service exporta simultaneamente o launcher oficial e o worker customizado.
- [x] Configurar o WDIO para carregar o service module local, consciente de reload, preservando a capacidade original do launcher `wdio-electron-service` e a configuração de rootDir.
- [x] O wrapper conclui o probe do bridge do main process antes do preflight da root, distinguindo no erro service readiness de renderer readiness.

### Task 2: Adicionar barreira de saída do processo antigo e reconexão do service para o reload do App real

**Files:**

- Create: `packages/desktop/test/e2e/helpers/e2e-electron-reload.ts`
- Create: `packages/desktop/test/e2eElectronReload.test.ts`
- Modify: `packages/desktop/test/e2e/helpers/model-provider-restart.ts`

- [x] Escrever primeiro o teste que falha: o pedido de quit retorna o PID principal antigo; esperar a saída do processo vivo; o timeout precisa reportar o PID; o reload só é chamado depois da saída concluída.
- [x] `restartIntoWorkspace()` salva as preferências e então chama o helper de reload seguro; o helper encapsula o delete interno do WDIO, espera o PID antigo e só então cria a nova session, restaurando em seguida o localStorage e recarregando o renderer.
- [x] Corrigir o diagnóstico de `waitForSelectedModel()` para ler o `zcode-last-agent-config` atômico, removendo a saída enganosa das keys separadas antigas.

### Task 3: Corrigir I55 conforme a semântica confirmada

**Files:**

- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-thought-level-session-isolation.test.ts`
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modify: `docs/testing/conversation-session-e2e-human-readable-cases.md`

- [x] Após `prepareV4ConversationE2E()` e antes do primeiro envio em A, alternar de verdade o thought do DeepSeek para `high` e aguardar a projection V4.
- [x] O primeiro envio em A, a herança por B, o envio contínuo A→max e B/A mantêm as asserções de captura de rede.
- [x] Não modificar o nível padrão do provider nem o seed compartilhado de localStorage para acomodar o caso.

### Task 4: Verificação e commit

- [x] Executar unit tests focados de lifecycle/reload do Electron, window target e seed de preferências.
- [x] Rodar a verificação de fixture para I55 e para switch/recovery do Turbo.
- [x] Executar separadamente os E2E de I55 e de I38/I39/I42; após a correção de I55, 3 execuções consecutivas aprovadas, e reload real de I38/I39/I42 com 3/3 aprovados.
- [x] Executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint`.
- [x] Verificar que não sobraram processos residuais de Electron/host/agent/Chromedriver e revisar o diff final.
- [x] Fazer stage apenas dos arquivos desta tarefa e criar o commit com Conventional Commit.