# Renderização de Texto em Streaming do Assistant (fatos atuais)

O corpo do Assistant vem da row V4 `assistantText`. O reducer da CLI produz row deltas, o `ConversationProjectionStore` os aplica e o `ConversationRowView` entrega o `row.text` completo atual ao `MessageResponse`/Streamdown para renderização.

Atualmente não existe o antigo batch de 50ms do `useTaskStreamEvents` nem uma fila de reveal palavra a palavra mantida pela própria UI. O ritmo é determinado pela chegada dos deltas autoritativos e pela renderização do React; o estado final deve ser idêntico, caractere a caractere, ao texto da row no snapshot.

```text
CLI text event -> ProductProjection row delta -> SessionDataLayer
  -> ConversationProjectionStore -> ConversationRowView -> MessageResponse
```

Ao otimizar a experiência de streaming, a UI não pode gerar uma segunda cópia do corpo nem reescrever o texto final com timer; o agrupamento em lotes deve preservar seq, rowId e a semântica de convergência snapshot/delta.