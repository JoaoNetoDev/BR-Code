# Retry Turn (fatos atuais)

A entrada de retry está nas ações do turno do assistente, enviando a V4
`retryTurn { target: { rowId, entityId } }`, com o envelope carregando simultaneamente `baseRevision/baseLogEpoch`.
O resolver unificado da CLI é responsável por resolver a intenção canônica da entrada, arbitrar o CAS e gerar o novo turno autoritativo; a UI não executa a antiga combinação de rewind + resend.

A própria linha do usuário oferece edit/copy. A edição usa `editUserQuery`, que é um comando diferente do retry e tem semântica de produto diferente.