# Instruções de reutilização do Prompt Editor

> **Estado atual**: `ChatPromptEditor` é reutilizado em conjunto pelo composer principal da V4 e pelo estado de edição de mensagens de usuário da V4.

`ChatPromptEditor` é o editor compartilhado leve da caixa de entrada do chat, responsável por hospedar `LexicalChatInput`, os botões de envio/cancelamento, a entrada rápida opcional e o workspace file drop. Tanto a área de entrada principal quanto o estado de edição de mensagens de usuário reaproveitam o núcleo de entrada por meio dele.

O `packages/ui/src/v4/ConversationComposer.tsx` principal mantém as capacidades de nível de sessão, como toolbar, prompt enhance, seleção de anexos e interrupção da geração; `ChatPromptEditor` trata apenas das capacidades de edição comuns. A edição de mensagem de usuário, feita em `packages/ui/src/v4/ConversationRowView.tsx`, usa o mesmo editor inline para substituir o balão original, mostrando apenas a edição do texto original, cancelar, enviar, a exibição de anexos somente leitura e a inserção por arrastar do file mention.

A lógica de arrastar da árvore de arquivos do workspace para anexar mentions está centralizada em `workspaceFileComposer`, evitando que o composer principal e o composer de edição concatenem markdown separadamente e garantindo a consistência semântica da mention `@file`.