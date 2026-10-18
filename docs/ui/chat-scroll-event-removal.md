# Chat Scroll Events (fatos atuais)

A proposta antiga de "remover onScroll/ResizeObserver" foi substituída pela timeline virtual da V4. Atualmente, `ConversationTimeline` usa:

- `onScroll` para determinar a posição do usuário e o follow-bottom;
- `ResizeObserver`/medição dinâmica de altura para manter a altura das rows em streaming;
- o virtualizer para controlar a renderização dos turnos visíveis;
- o botão de rolar até o fim para ajudar o usuário a retomar o acompanhamento automático.

Esses eventos mantêm apenas o estado de visualização da UI e não podem afetar o seq/projection da conversa.