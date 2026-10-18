# Design do Botão de Voltar em "Meus Feedbacks"

## Contexto

O centro de feedback contém as views "Enviar feedback" e "Meus feedbacks". Atualmente, a página "Meus feedbacks" tem um botão "Novo feedback" no canto inferior direito, que permite voltar à página de envio, mas a área de header da página não tem um botão de voltar que corresponda à expectativa do usuário. Depois de entrar em "Meus feedbacks" a partir da página de envio, o usuário procura primeiro a entrada de retorno perto do título.

## Objetivo

- Adicionar um botão de voltar à esquerda do título no header da página "Meus feedbacks".
- O botão só é exibido quando o tab atual do centro de feedback for `tickets`.
- Ao clicar no botão de voltar, voltar ao tab `submit`, ou seja, a página "Enviar feedback".
- O retorno não fecha o diálogo nem limpa o estado de rascunho já existente na página de envio.
- Manter o comportamento atual do botão de fechar no canto superior direito e do botão "Novo feedback" no canto inferior direito.
- Suportar aria-label em chinês e inglês, compatível com desktop, Web e layout de tela pequena do Web no celular.

## Não objetivos

- Não refatorar o gerenciamento de estado dos tabs do centro de feedback.
- Não alterar o carregamento, a atualização, a cópia de ID, o destaque de seleção da lista de tickets ou o fluxo de envio.
- Não adicionar pilha de histórico de navegação das páginas de feedback; o botão de voltar representa sempre a volta de "Meus feedbacks" para "Enviar feedback".

## Design

`packages/ui/src/feedback/FeedbackCenter.tsx` continua sendo a camada de controle de tabs do Dialog do centro de feedback. Dentro do Header, a área do título é dividida em um grupo de título à esquerda e o botão de fechar à direita:

- Quando `tab === "tickets"`, renderizar um `Button variant="ghost" size="icon-md"` antes do texto do título.
- O ícone do botão usa o `ArrowLeft` do `lucide-react`, conforme o sistema de ícones existente.
- Clicar no botão executa `setTab("submit")`.
- O aria-label usa um novo texto:
  - `feedback.center.backToSubmit`: em chinês "返回提交反馈", em inglês "Back to submit feedback".
- O Header mantém `min-w-0` e o título continua com `truncate`, evitando sobreposição com o botão de fechar em textos longos em inglês ou em telas estreitas.

Visualmente, o botão é um icon button ghost de baixa ênfase, formando uma hierarquia clara com o botão de fechar existente: o retorno à esquerda apenas troca de página, o fechar à direita sai do diálogo.

## Testes

- Atualizar `packages/ui/test/feedbackCenter.test.ts`:
  - Ao abrir o tab tickets, a renderização estática contém o aria-label do botão de voltar, `feedback.center.ticketsTitle`, e mantém o botão de fechar.
  - No tab submit, o botão de voltar não é renderizado.
  - Confirmar pelo código-fonte ou por asserção de renderização que o botão de voltar dispara o caminho de troca `setTab("submit")`.
- Executar:
  - `pnpm exec vitest run packages/ui/test/feedbackCenter.test.ts`
  - `pnpm typecheck`
  - `pnpm lint`

## Riscos e compatibilidade

- A mudança toca apenas o header de UI, sem alterar a camada de serviço, a interface de tickets de feedback ou o estado do controle remoto.
- Em telas pequenas, título e botão ficam na mesma linha, dependendo de flex + `min-w-0` para permanecerem comprimíveis; o botão de fechar continua fixo à direita.
- Se o usuário voltar ao submit pelo botão "Novo feedback" no canto inferior direito, o comportamento permanece igual.