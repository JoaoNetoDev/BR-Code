# Performance de Renderização de Conversas (fatos atuais)

O limite de renderização da V4 é `snapshot.rows.window`, e não o legado `messages[]`.

```text
rows.window
  -> buildConversationTurnRenderUnits
  -> ConversationTurnGroup
  -> virtualizer visible range
  -> ConversationRowView
```

- O `ConversationProjectionStore` atualiza row/window por delta; rows inalteradas devem manter referência estável.
- O `ConversationTimeline` usa `@tanstack/react-virtual`, medição dinâmica de altura e overscan, renderizando apenas os turnos visíveis.
- Variações de altura em rows de streaming são tratadas pelo回流 de medição; o follow-bottom é estado de UI e não é escrito na projection.
- As otimizações de performance não podem mesclar seq diferentes, descartar row actions, quebrar a consistência do terminal snapshot nem fazer o renderer manter um segundo array de mensagens.

Principais pontos de entrada: `packages/ui/src/v4/ConversationTimeline.tsx`, `ConversationRowView.tsx`, `ConversationProjectionStore.ts`.