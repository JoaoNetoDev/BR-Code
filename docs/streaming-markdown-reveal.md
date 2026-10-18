# Renderização de Markdown em Streaming (fatos atuais)

A V4 não implementa mais o reveal palavra a palavra baseado em `Intl.Segmenter`. O texto completo atual da linha do Assistant é entregue diretamente ao Streamdown/`MessageResponse`, e o efeito visual incremental do Markdown vem de atualizações consecutivas de projection.

- Fonte de verdade do corpo: `ConversationSnapshot.rows`.
- Entrada de atualização: conversation delta.
- Entrada de renderização: `packages/ui/src/v4/ConversationRowView.tsx`.
- Consistência final: o texto do terminal snapshot deve ser igual ao texto final renderizado.

Se a animação for reintroduzida no futuro, ela só poderá ser uma camada visual descartável, sem alterar copy, busca, restauração, medição de altura para virtual scrolling ou o conteúdo final das linhas.