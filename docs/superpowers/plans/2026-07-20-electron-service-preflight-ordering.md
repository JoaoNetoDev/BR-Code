# Electron Service Preflight Ordering Implementation Plan

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este
> plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** eliminar a corrida de ContextId/janela causada pela concorrência entre o preflight de projeto do
Desktop E2E e a inicialização do `wdio-electron-service` na mesma fase.

**Arquitetura:** `config.before` apenas salva os worker specs e não executa nenhum comando de browser;
`mochaOpts.rootHooks.beforeAll` executa o preflight do renderer bridge depois que o WDIO aguarda todos os hooks
`before` de service/config. É preciso usar um root hook realmente gerenciado pelo Mocha, e não o `beforeSuite`
de config do WDIO, que engole exceções comuns; uma rejeição do preflight deve abortar o corpo do teste e gerar
um failure count diferente de zero, ao mesmo tempo em que é proibido chamar `reloadSession()` dentro do mesmo
hook.

**Stack:** WebdriverIO 9, `wdio-electron-service` 9, Mocha, Vitest, TypeScript.

## Restrições Globais

- Não adicionar sleep fixo nem polling de pseudo-conclusão baseado em um único campo `browser.electron`.
- O `beforeAll` root do Mocha precisa reutilizar `currentE2EWorkerSpecs`, preservando a atribuição do spec nos
  erros.
- É proibido usar o `beforeSuite` de config do WDIO como barreira de falha; suas exceções comuns não chegam ao
  Mocha.
- Uma falha de preflight não pode criar uma segunda sessão Electron dentro do worker hook.
- A causa do bug e a justificativa da correção usam comentários em português, e o lifecycle `before-suite` é
  documentado separadamente.
- Preservar as alterações não commitadas do usuário para I55; este commit contém apenas os arquivos listados
  neste plano.
- É obrigatório executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint`.

---

### Task 1: serializar o Electron service e o preflight do renderer

**Arquivos:**

- Modify: `docs/testing/desktop-e2e-runtime-performance.md`
- Modify: `packages/desktop/wdio.conf.ts`
- Modify: `packages/desktop/test/e2eWindowTargetBinding.test.ts`
- Create: `packages/desktop/test/e2eRendererBridgeRootHook.test.ts`
- Create: `packages/desktop/test/e2e/helpers/e2e-renderer-bridge-root-hook.ts`
- Modify: `packages/desktop/test/e2e/helpers/e2e-worker-isolation.ts`
- Modify: `packages/desktop/test/e2eWorkerIsolation.test.ts`
- Modify: `packages/desktop/test/e2e/reporting/e2e-reporting-types.ts`

**Interfaces:**

- Consumes: o lifecycle de `before(capabilities, specs)` do WDIO e o `beforeAll` root do Mocha.
- Produces: `before` apenas define `currentE2EWorkerSpecs`; `mochaOpts.rootHooks.beforeAll` chama
  `runE2ERendererBridgePreflight(currentE2EWorkerSpecs)`; a falha é contada pelo Mocha como root-hook failure e
  o corpo do teste não é executado.

- [ ] **Step 1: escrever primeiro o teste de contrato de configuração que falha**

Em `e2eWindowTargetBinding.test.ts`, ler `wdio.conf.ts` e afirmar que `before` não chama o preflight, que a
configuração não declara o `beforeSuite` do WDIO, que `mochaOpts.rootHooks` chama o preflight e registra
`before-suite`, e afirmar também que o trecho da função `runE2ERendererBridgePreflight` não contém
`browser.reloadSession()`. Em `e2eRendererBridgeRootHook.test.ts`, validar com um runner Mocha real que a
rejeição do preflight gera um failure e que o corpo do teste não é executado, e que no caminho saudável a ordem é
preflight e depois corpo do teste.

- [ ] **Step 2: rodar os testes e confirmar a falha pela implementação antiga**

Run: `pnpm vitest run packages/desktop/test/e2eWindowTargetBinding.test.ts`

Expected: FAIL, com erro apontando para o `async beforeSuite` ainda declarado, para a ausência de `rootHooks` ou
para a função de preflight ainda contendo `browser.reloadSession()`.

- [ ] **Step 3: implementar a correção mínima**

Implementar a seguinte estrutura de lifecycle em `wdio.conf.ts`:

```ts
async before(_capabilities, specs) {
  currentE2EWorkerSpecs = specs;
},
mochaOpts: {
  rootHooks: createE2ERendererBridgeRootHooks(async () => {
    await measureE2ELifecyclePhase("before-suite", { specs: currentE2EWorkerSpecs }, async () => {
      await runE2ERendererBridgePreflight(currentE2EWorkerSpecs);
    });
  }),
},
```

`createE2ERendererBridgeRootHooks` apenas registra o callback como um `beforeAll` real do Mocha.
`runE2ERendererBridgePreflight` executa uma única vez `waitForE2ERendererBridgePreflight()`; em caso de sucesso
retorna, e em caso de falha chama diretamente `createE2ERendererBridgePreflightError(..., false)`. Remover o
import, a implementação e o teste unitário não utilizados de `shouldRebuildE2ESessionAfterPreflightFailure`, e
adicionar `"before-suite"` a `E2ELifecyclePhase`.

- [ ] **Step 4: rodar os testes unitários direcionados e confirmar que passam**

Run: `pnpm vitest run packages/desktop/test/e2eWindowTargetBinding.test.ts packages/desktop/test/e2eRendererBridgeRootHook.test.ts packages/desktop/test/e2eWorkerIsolation.test.ts packages/desktop/test/e2eReportingLifecycle.test.ts`

Expected: PASS, 0 failures.

- [ ] **Step 5: executar as verificações obrigatórias**

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Run: `pnpm typecheck`

Run: `pnpm lint`

Expected: os três comandos terminam com exit 0; warnings existentes e novos failures são reportados
separadamente.

- [ ] **Step 6: revisar e commitar**

Adicionar ao stage somente os sete arquivos de implementação/teste desta tarefa e os dois documentos, revisar o
staged diff e commitar:

```text
fix(desktop-e2e): serialize renderer preflight startup
```