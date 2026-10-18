# Paridade de Layout do Chat v4

## Contexto

A área de sessão do v4 já recuperou a aparência do composer antigo, mas o layout pai da lista de mensagens e do composer ainda diverge do z-code-2. No z-code-2, a área de conversa coloca o conteúdo das mensagens e a área de entrada inferior no mesmo container de rolagem: a barra de rolagem pode ir até o fundo, incluindo a caixa de entrada, e a coluna principal das mensagens e o composer usam o mesmo conjunto de largura máxima.

Atualmente, o `ConversationTimeline` do v4 possui seu próprio container de rolagem, e o `ConversationComposer` é um nó irmão do `SessionPane`. Com isso, a barra de rolagem cobre apenas a timeline, e o composer não pertence ao mesmo contexto de rolagem; além disso, a renderização das rows não tem uma largura máxima unificada de conteúdo principal, de modo que em telas largas o texto e a saída das ferramentas divergem mais do que na versão antiga.

## Objetivos

- No estado de sessão, a área de mensagens e o composer do v4 usam o mesmo viewport de rolagem vertical.
- O composer permanece `sticky bottom-0` dentro desse viewport, de modo que, ao rolar até o fundo, a parte inferior da caixa de entrada também fica ao alcance.
- O espaço inferior do composer é responsabilidade do `padding-bottom` transparente da camada interna do dock; a camada de mensagens faz mask gradualmente até transparentes ao se aproximar do composer sticky, evitando que o conteúdo rolado atravesse diretamente esse espaço. No estado de sessão, `chat-composer-input-surface` permanece transparente e não desenha `background`; o cartão com context header no estado de rascunho continua usando `bg-surface`.
- O conteúdo das mensagens, o aviso de lista vazia, o botão de voltar ao fim e o composer reutilizam o layout unificado de coluna principal do `conversationLayout`: sessões vinculadas usam `w-full` quando `conversation < 864px`, `calc(100% - 96px)` com `max-w-4xl` quando `864px <= conversation < 1136px`, e `calc(100% - 384px)` com `max-w-6xl` a partir de `1136px`; o rascunho usa `max-w-2xl`. As rodadas de mensagem respondem ao container de conversa via `@max-md/conversation:px-4`, enquanto o dock do composer sempre usa `px-4 pb-4`.
- Preservar a rolagem virtual do v4, o cache de medição de altura das rows, o acompanhamento do fim e a semântica de `loadOlder`.
- Não alterar o layout centralizado do estado de rascunho nem a cadeia de dados de replayable por controle remoto / desktop continuous.

## Cadeia de Layout

```text
SessionPane
  ConversationHeader
  body region
    ConversationStatusPanel
    shared scroll viewport
      virtual timeline content
        centered row column: conversationLayout
        viewport-aligned bottom mask: virtual history + running live tail
      sticky bottom composer dock
        centered composer column: conversationLayout
  QueuePanel
  runtime/dialog controllers
```

## Restrições de Implementação

- `ConversationTimeline` continua sendo dono da lista virtual e da lógica de ancoragem de rolagem, mas ganha um slot `bottomDock`, que renderiza o composer no fim do scroll viewport da timeline.
- O espaço inferior do bottom dock pertence ao layout do próprio contêiner do dock, usando padding transparente responsivo, sem renderizar nós filhos de fundo existindo apenas para espaçamento. O padding precisa entrar na altura real do dock, garantindo que a barra de rolagem flutuante das tabelas Markdown continue desviando conforme a altura completa da área de entrada.
- O mask das mensagens envolve apenas o virtual history e o running live tail, e não atua sobre o composer, o botão de voltar ao fim ou o focus ring do pane. A posição do gradiente do mask é sincronizada com o scroll viewport e a altura real do dock, e não é posicionada pela altura total do conteúdo virtual; desktop e mobile usam uniformemente uma distância de gradiente de 40px. O mask é desligado quando a barra de rolagem chega ao fundo, e o gradiente só aparece ao sair do fundo, quando as mensagens podem passar por baixo do composer sticky.
- `SessionPane`, no estado de sessão, não renderiza mais o composer fora da timeline; o estado de rascunho continua renderizando o composer pelo contêiner centralizado.
- O ref de rolagem do `ConversationTimeline` continua sendo o único elemento de scroll, e `useVirtualizer.getScrollElement` permanece inalterado, evitando interferência de estado de rolagem entre múltiplos panes.
- O posicionamento absoluto externo das rows continua com `w-full`, e ganha internamente uma coluna de conteúdo centralizada, evitando mudar a forma de medição do virtualizer.
- `ConversationComposer`, no estado de sessão, remove o próprio padding horizontal, com a largura controlada pelo dock externo; o estado de rascunho e a semântica do cartão de context header permanecem inalterados.

## Aceitação

- Os testes de estrutura SSR conseguem ver o composer do estado de sessão renderizado dentro do scroll viewport da timeline, com a identificação de dock compartilhado.
- Os testes de estrutura SSR conseguem ver que a coluna de conteúdo das rows da timeline e o bottom dock usam o mesmo conjunto de classes de layout `conversationLayout`.
- `pnpm vitest run packages/ui/test/v4SessionPaneLayoutParity.test.ts` passa.
- `pnpm typecheck` e `pnpm lint` passam; se existirem falhas não relacionadas no ambiente, a descrição do commit deve listá-las.