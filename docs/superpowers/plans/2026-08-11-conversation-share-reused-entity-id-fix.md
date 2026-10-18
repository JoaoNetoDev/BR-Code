# Plano de Implementação da Correção de Entity ID Reutilizado no Conversation Share

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Permitir que vários Rows da projeção pública de sessão reutilizem o mesmo `entityId` persistente, evitando que uma publicação seja julgada como sessão inválida pelo cliente antes da chamada a prepare.

**Arquitetura:** Manter inalterados o mapeador da projeção pública existente e a fronteira de fechamento de referências, corrigindo apenas a semântica das asserções: `rowId` e `toolCallId` são únicos, enquanto `entityId` é a identidade persistente de uma entidade que pode ser reutilizada entre Rows. O construtor continua mapeando deterministicamente o mesmo `entityId` local para o mesmo ID público, e valida o fechamento de referências de `triggerEntityId` por meio do conjunto de deduplicação.

**Stack técnico:** TypeScript, Vitest, pnpm, Oxlint

## Restrições Globais

- Escrever primeiro o teste de regressão que falha e só depois modificar o código de produção.
- Não modificar UI, RPC, HTTP API, schema de payload do backend nem realtime delivery.
- O motivo da correção precisa ficar em comentários em chinês no código de produção.
- Antes de concluir, é obrigatório executar `pnpm typecheck` e `pnpm lint`.

---

### Tarefa 1: Corrigir a validação da identidade pública de entidades

**Arquivos:**

- Modify: `packages/services/test/conversationSharePublicProjection.test.ts`
- Modify: `packages/services/src/conversation-share/conversationSharePublicProjection.ts`

**Interfaces:**

- Consumes: `buildConversationSharePublicProjection({ rows, selectedProductTurnIds })`
- Produces: permite que vários Rows públicos compartilhem o mesmo `entityId` com formato válido, e continua rejeitando `triggerEntityId` pendente

- [ ] **Passo 1: Escrever o teste de regressão que falha**

Na fixture existente, fazer `turnHeader` e `userInput` usarem a mesma identidade local de entidade e afirmar que, após a construção bem-sucedida, as duas linhas são mapeadas para o literal `share-entity-1`:

```ts
it("allows rows to share one persistent entity identity", () => {
  const rows = rowsWithCompletedSubagent();
  rows[1] = { ...rows[1]!, entityId: rows[0]!.entityId } as ConversationRow;

  const result = build(rows);

  expect(result.rows[0]?.entityId).toBe("share-entity-1");
  expect(result.rows[1]?.entityId).toBe("share-entity-1");
});
```

- [ ] **Passo 2: Executar o teste e verificar o estado RED**

Executar:

```bash
pnpm exec vitest run packages/services/test/conversationSharePublicProjection.test.ts
```

Esperado: FAIL com `Conversation public entity identities must be unique`, vindo de `assertConversationSharePublicProjection`.

- [ ] **Passo 3: Implementar a correção mínima de validação**

Mudar o conjunto de entidades do validador para `Set<string>`; depois de validar o formato, adicionar `entityId` ao conjunto e não chamar mais a asserção de unicidade de entidades. Manter a asserção de unicidade de `toolCallId` e validar cada `triggerEntityId` diretamente com o conjunto de entidades.

```ts
const entityIds = new Set<string>();

if (row.entityId) {
  if (!PUBLIC_ENTITY_ID.test(row.entityId)) {
    throwProjectionError("invalid_conversation", "Conversation public entity identity is invalid");
  }
  // entityId 是持久实体身份，一个实体可以投影成多个 Row；这里只收集引用闭包，不校验 Row 间唯一性。
  entityIds.add(row.entityId);
}
```

- [ ] **Passo 4: Verificar os testes focados e relacionados em GREEN**

Executar:

```bash
pnpm exec vitest run packages/services/test/conversationSharePublicProjection.test.ts packages/services/test/conversationShareService.test.ts packages/services/test/conversationShareHttpClient.test.ts packages/services/test/conversationShareIntegrity.test.ts packages/services/test/conversationShareComposition.test.ts packages/services/test/conversationShareMockApiClient.test.ts
```

Esperado: todos os arquivos de teste selecionados passam.

- [ ] **Passo 5: Executar as verificações obrigatórias do repositório**

Executar:

```bash
pnpm typecheck
pnpm lint
```

Esperado: os dois comandos saem com código 0; warnings de lint preexistentes podem permanecer inalterados.

- [ ] **Passo 6: Commitar a correção**

```bash
git add docs/superpowers/specs/2026-08-10-conversation-share-api-integration-design.md docs/superpowers/plans/2026-08-11-conversation-share-reused-entity-id-fix.md packages/services/test/conversationSharePublicProjection.test.ts packages/services/src/conversation-share/conversationSharePublicProjection.ts
git commit -m "fix(conversation-share): allow reused entity identities"
```