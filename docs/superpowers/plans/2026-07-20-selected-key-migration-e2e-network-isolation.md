# SelectedKey Migration E2E Network Isolation Implementation Plan

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIO: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** fazer com que I32～I34 usem um fixture local de fake credentials sem OAuth active, evitando que o reload do App faça requisição à rede real do Z.AI.

**Architecture:** usar funções puras para escolher as credenciais conforme o spec do worker atual: a migração de selectedKey mantém apenas o fake `auth_token` legado, enquanto os demais specs continuam mesclando as credenciais OAuth restored padrão. O WDIO preserva a prioridade existente dos fixtures especiais de readiness/recovery.

**Tech Stack:** TypeScript, Vitest, WebdriverIO, E2E com Electron.

## Restrições Globais

- Preservar o reload real do App em I32～I34 e a migração do `setting.json` local.
- Não modificar a lógica de rede de OAuth/provider do produto.
- Não alterar o fixture OAuth padrão dos demais workers de E2E.
- Usar `rtk` nos comandos de shell e `apply_patch` nas edições.

---

### Task 1: Definir a seleção do credentials fixture com TDD

**Files:**

- Create: `packages/desktop/test/e2e/helpers/e2e-startup-credentials.ts`
- Create: `packages/desktop/test/e2eStartupCredentials.test.ts`

**Interfaces:**

- Consumes: `workerSpecsContain(specs: string[], marker: string): boolean`
- Produces: `createE2EStartupCredentialSeed(params): Record<string, string>`

- [ ] Adicionar teste unitário: o spec alvo precisa receber `{ auth_token: "fake-auth-token" }`, e o spec comum precisa manter os campos OAuth restored.
- [ ] Executar `rtk pnpm exec vitest run packages/desktop/test/e2eStartupCredentials.test.ts` e confirmar RED porque o helper ainda não existe.
- [ ] Implementar: ao casar com `conversation-session-model-provider-selected-key-migration.test.ts`, retornar apenas o legacy seed; caso contrário, retornar a mesclagem do legacy seed com o restored OAuth seed.
- [ ] Rodar novamente o focused test e confirmar que os 2 testes passam.

Assinatura da implementação:

```ts
export function createE2EStartupCredentialSeed(params: {
  specs?: string[];
  legacyAuthToken: string;
  restoredOAuthCredentials: Record<string, string>;
}): Record<string, string>;
```

### Task 2: Integrar no WDIO e validar o E2E real

**Files:**

- Modify: `packages/desktop/wdio.conf.ts`
- Verify: `packages/desktop/test/e2e/conversation-session/conversation-session-model-provider-selected-key-migration.test.ts`

**Interfaces:**

- Consumes: `createE2EStartupCredentialSeed`
- Produces: o `credentials.json` dos workers I32～I34 sem provider/access token/user info/JWT OAuth active

- [ ] Chamar a função pura no branch padrão de credenciais do WDIO; a prioridade do fixture `{}` de readiness e do fixture de corrupt recovery permanece inalterada.
- [ ] Executar o Vitest focado e `@zcode/desktop typecheck:e2e`.
- [ ] Executar o spec completo I32～I34, exigindo 3/3 aprovados.
- [ ] Procurar nos logs desse run por `model-provider.refreshCodingPlanApiKey`, `billing/balance` e `api/biz/customer/getCustomerInfo`, exigindo nenhuma ocorrência.
- [ ] Executar `rtk pnpm typecheck`, `rtk pnpm lint` e `rtk git diff --check`.
- [ ] Fazer commit de `fix(desktop-e2e): isolate selected-key migration from network`.