# Estado de Resultado Vazio da Tarefa

## Contexto

Quando a Task já foi criada mas não há nenhuma mensagem visível, a interface antiga retornava a uma área de chat praticamente em branco. O usuário ainda via as cápsulas de modo da área de entrada, como `Plan`, e era fácil entender erroneamente que "o painel de plano tem estado, mas o conteúdo não foi renderizado".

## Especificação

- Um novo rascunho continua exibindo o estado vazio de boas-vindas original.
- Tasks históricas continuam exibindo loading nas fases `creating` / `restoring` / `submitting`.
- Quando a task está vinculada, as mensagens estão vazias, não há erro visível e não está em fase de restauração, a área de chat exibe um aviso leve de resultado vazio.
- O aviso de resultado vazio apenas informa que esta rodada não gerou conteúdo a exibir; ele não interpreta a cápsula de modo como conteúdo de plano.
- Os textos devem passar por i18n, o estilo deve usar os tokens semânticos do design system e ser compatível com desktop, Web, telas estreitas de celular e temas claro e escuro.