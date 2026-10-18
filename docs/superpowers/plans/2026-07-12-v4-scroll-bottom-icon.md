# Plano de Implementação do Ícone de Rolagem até o Fim no V4

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** restaurar na timeline v4 o controle de rolagem até o fim no design apenas com ícone usado em `~/workspace/z-code-2`, preservando sua posição e seu nome acessível.

**Arquitetura:** manter `ConversationTimeline` como responsável pela visibilidade e pelo comportamento de clique. Adicionar um renderizador de botão em nível de módulo que usa a primitiva compartilhada `Button` e a `ArrowDownIcon`, e então reutilizá-lo tanto no posicionamento com composer-dock quanto no sem dock.

**Stack técnico:** React 19, TypeScript, Vitest, lucide-react, `Button` da UI compartilhada.

## Restrições globais

- Preservar a ancoragem existente da timeline, o estado de visibilidade e o handler de clique.
- Usar a tradução `chat.scrollToBottom` já existente para `aria-label` e `title`; não exibir texto de rótulo dentro do botão.
- Reutilizar classes semânticas de tema e a primitiva compartilhada `Button` no desktop e no Web móvel.
- Adicionar ao lado da correção um comentário em chinês explicando a causa do bug.

---

### Tarefa 1: Substituir o rótulo visível pelo controle com ícone de seta compartilhado

**Arquivos:**

- Modificar: `packages/ui/test/v4SessionPaneLayoutParity.test.ts`
- Modificar: `packages/ui/src/v4/ConversationTimeline.tsx`

**Interfaces:**

- Consome: o `handleBackToBottom` existente, o `TID_V4_TIMELINE_BOTTOM` e a tradução `chat.scrollToBottom`.
- Produz: um botão apenas com ícone, com o mesmo test id, comportamento de clique, posicionamento, rótulo acessível e title.

- [x] **Passo 1: Escrever o teste de regressão que falha**

Adicionar uma asserção de paridade em nível de fonte ao teste de layout existente:

```ts
expect(timelineSource).toContain('<ArrowDownIcon className="size-4" />');
expect(timelineSource).not.toMatch(/>\s*回到底部\s*</);
expect(timelineSource).toContain('id: "chat.scrollToBottom"');
```

- [x] **Passo 2: Executar o teste focado para verificar RED**

Executar: `pnpm exec vitest run packages/ui/test/v4SessionPaneLayoutParity.test.ts`

Esperado: FAIL porque `ConversationTimeline.tsx` ainda renderiza o texto visível `回到底部` e não renderiza `ArrowDownIcon`.

- [x] **Passo 3: Implementar o controle mínimo apenas com ícone**

Em `ConversationTimeline.tsx`, importar `ArrowDownIcon`, o `Button` compartilhado e `useZCodeIntl`. Definir um `ConversationBackToBottomButton` em nível de módulo que renderiza:

```tsx
<Button
  aria-label={label}
  title={label}
  type="button"
  size="icon"
  variant="outline"
  className={cn("rounded-full bg-card hover:bg-card-selected", className)}
  data-testid={TID_V4_TIMELINE_BOTTOM}
  onClick={onClick}
>
  <ArrowDownIcon className="size-4" />
</Button>
```

Usar `intl.formatMessage({ id: "chat.scrollToBottom" })` para `label` e reutilizar o componente nos dois branches de posicionamento existentes sem alterar suas semânticas de posicionamento.

- [x] **Passo 4: Executar o teste focado para verificar GREEN**

Executar: `pnpm exec vitest run packages/ui/test/v4SessionPaneLayoutParity.test.ts`

Esperado: PASS.

- [x] **Passo 5: Verificar o workspace e fazer commit**

Executar:

```bash
pnpm typecheck
pnpm lint
git diff --check
```

Esperado: todos os comandos saem com código 0.

Commit:

```bash
git add docs/superpowers/plans/2026-07-12-v4-scroll-bottom-icon.md packages/ui/test/v4SessionPaneLayoutParity.test.ts packages/ui/src/v4/ConversationTimeline.tsx
git commit -m "fix(ui): restore scroll-to-bottom arrow icon"
```