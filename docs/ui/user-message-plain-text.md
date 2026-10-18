# User Message Row (fatos atuais)

A user row da V4 é apresentada em texto simples/com anexos e oferece copy e edição inline real. A submissão da edição envia `editUserQuery { target: { rowId, entityId }, newText, attachments, workspaceMode }`, e o envelope também carrega `baseRevision/baseLogEpoch`, decididos pelo CLI conforme a autoridade de projeção `actions.canEdit`. O editor oferece sempre "Cancelar / ícone de reset do arquivo / Enviar": a ação do meio usa o ícone `FileClock`, com o mesmo tamanho do botão de envio e preservando a cor de outline, e as dicas de hover/focus indicam "Redefinir junto com o arquivo".
O estado desabilitado é tratado pelo hover trigger na camada externa do botão de ícone, que recebe os eventos de ponteiro e mostra o motivo concreto da desabilitação, enquanto o botão em si permanece disabled.
O envio comum usa `workspaceMode=preserve`; o reset combinado usa `workspaceMode=rewind`, e em caso de conflito a lista de arquivos é exibida, permitindo o rebaixamento para preserve. Cancelar a edição apenas restaura o estado local de edição.

O Retry não fica na user row; ele pertence à ação de turno do assistant e envia `retryTurn`.