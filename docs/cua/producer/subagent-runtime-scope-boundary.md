# Limite de escopo de runtime do subagent

O servidor MCP zcode-cua é compartilhado pelo runtime pai e filho em alguns
caminhos de lançamento. Portanto, o namespace de metadados de requisição
`com.zcode/request-context` carrega o valor confiável de `runtime_scope` vindo do
adaptador MCP do ZCode.

Quando o valor aninhado é exatamente `subagent`, o middleware de registro
retorna um resultado `isError` com o texto `Computer Use is not available in
subagent` e o valor estável `structuredContent.code`
`SUBAGENT_COMPUTER_USE_UNAVAILABLE` antes das verificações de kill-switch, do
trabalho de sessão, da E/O do Broker ou dos handlers de ferramenta. Isso se
aplica a todas as 30 ferramentas, incluindo as de ciclo de vida e de
clipboard. Metadados ausentes, malformados ou com `main` permanecem compatíveis
com clientes MCP standalone. Um `runtime_scope` de nível superior sem namespace
é ignorado.

Isto é apenas uma barreira de execução. O ZCode Core continua responsável por
remover o servidor CUA oficial verificado por autoridade e a Skill das
superfícies visíveis ao provider filho. Nenhum nome de ferramenta, schema,
anotação, grupo de permissões ou campo do protocolo MCP muda.
