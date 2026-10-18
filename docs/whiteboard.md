# Whiteboard

O pane compartilhado à direita ganha uma nova tab `Whiteboard`, usando o mesmo conjunto de side pane tabs de Browser, Review e Treemapping.

## Comportamento

- Novos quadros são isolados por workspace atual, e a workspace key usa `workspaceIdentity?.trim() || workspacePath`.
- O nome padrão é gerado no idioma atual, por exemplo `画板 1` / `Whiteboard 1`, sem duplicar dentro do mesmo workspace.
- O conteúdo do quadro é salvo como dados de traço, incluindo ferramenta, cor, espessura e pontos; fechar a tab não exclui o quadro.
- O painel `@` da caixa de entrada do chat exibe os quadros do workspace atual. Só quando o usuário seleciona um quadro os traços atuais são exportados como PNG e adicionados ao composer como o anexo `image` já existente.
- A barra de ferramentas do pane do quadro oferece o botão “Adicionar à conversa”, que, ao ser clicado, exporta o quadro atual como PNG e o adiciona à área de anexos da caixa de entrada do chat atual. O botão apenas dispara um evento dentro da UI; a exportação real, a validação do limite de anexos, o rascunho e a restauração de foco continuam sendo tratados uniformemente pelo composer.

## Limites

- O quadro é uma capacidade da camada de UI e não adiciona Agent runtime, relay, main process nem estado no servidor.
- O envio de imagens reutiliza o caminho existente `ZCodePromptAttachment.kind === "image"`; quando o Agent não suporta imagens, vale o tratamento de erro já existente.
- O controle remoto Web e o desktop usam a mesma cadeia de anexos do composer, sem alterar os limites do task stream de desktop continuous e web remote replayable.