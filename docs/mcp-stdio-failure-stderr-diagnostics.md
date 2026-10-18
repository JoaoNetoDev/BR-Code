# Diagnóstico de stderr em falhas de MCP STDIO

## Contexto

Usuários relatam que, em `ZCT-2071437415552278528`, dois MySQL MCP server falharam com `MCP error -32000: Connection closed`. Esse erro apenas indica que o subprocesso MCP stdio fechou o pipe; não é possível determinar se a causa foi o `npx`, a validação de parâmetros do server, variáveis de ambiente, rede ou um crash do próprio server.

O adapter existente já escuta o stderr do stdio, mas o stderr é gravado apenas em log de debug. A exportação padrão de logs de produção não inclui debug, de modo que o ticket não contém o erro original antes da saída do subprocesso MCP.

## Objetivos

- Preservar o conteúdo de cauda recente do stderr dos subprocessos MCP stdio.
- Quando `mcp.server.failed` ocorrer, imprimir o stderr recente como campo de contexto em nível warn.
- O stderr deve ter tamanho limitado, para que um stderr de alta frequência não inunde os logs de produção.
- O stderr deve passar por mascaramento, para não gravar credenciais como token, password e authorization nos logs.
- Em caso de conexão bem-sucedida, não imprimir stderr adicional em nível warn, mantendo os logs de operação limpos.

## Convenções de comportamento

- Cada tentativa de conexão de um MCP server stdio mantém seu próprio buffer de stderr em memória.
- O buffer guarda apenas um comprimento fixo de cauda, usado para localizar o último erro antes da falha de inicialização.
- O `mcp.stdio.stderr` em nível debug continua emitindo um único chunk, mas também usando o texto já mascarado.
- O `mcp.server.failed` em nível warn só inclui o campo `stderr` quando o buffer não está vazio.
- Não registrar valores de env do stdio; o env continua sendo passado somente pelos argumentos de inicialização do subprocesso.

## Verificação

- Teste unitário cobrindo que, quando a conexão stdio do MCP falha, o log warn inclui o stderr recente.
- Teste unitário cobrindo que campos sensíveis no stderr são substituídos por `[Redacted]`.
- `pnpm typecheck` e `pnpm lint` como verificação de limites.