# Origens dos diretórios de configurações

`command`, `mcp` e `hooks` agora são lidos conforme os diretórios convencionais do ZCode Agent. A página de configurações apenas indica se a configuração pertence a `workspace` ou a `user` e não exibe mais os nomes de diretório como origem de CLI/provider.

## Ordem de leitura

A ordem fixa de `command` e `mcp` é:

1. `<workspace>/.zcode/*`
2. `<workspace>/.agents/*` (fallback apenas quando o `.zcode` do workspace não tem entradas válidas)
3. `~/.zcode/*`
4. `~/.agents/*` (fallback apenas quando o `.zcode` do usuário não tem entradas válidas)

`command` e `mcp` não leem mais `.claude`. O workspace atual é o limite de configuração de nível de projeto; o serviço de configurações não percorre cada nível de diretório para cima.

`hooks` mantém a ordem de leitura compatível: `<workspace>/.zcode/*`, `<workspace>/.agents/*`, `<workspace>/.claude/*`, `~/.zcode/*`, `~/.agents/*`, `~/.claude/*`.

## Command

- workspace: prioriza `<workspace>/.zcode/commands`; sem comandos válidos, faz fallback para `<workspace>/.agents/commands`
- user: prioriza `~/.zcode/commands`; sem comandos válidos, faz fallback para `~/.agents/commands`
- a página de configurações exibe o caminho do diretório, não o caminho do arquivo de comando específico
- criar/editar grava apenas em `.zcode/commands`, escolhendo user ou workspace pelo seletor; `.agents` permanece como origem de fallback compatível, somente leitura
- desabilitar um comando não altera o arquivo markdown; é gravado uniformemente em `~/.zcode/cli/config.json`: `command[命令文件绝对路径].enable = false` (caminho absoluto do arquivo de comando); ao reabilitar, o override é removido

## MCP

A página de configurações de MCP e o runtime usam uniformemente a MCP source do ZCode Agent. A configuração MCP genérica antiga é migrada uma única vez para a configuração principal `.zcode` de nível user; depois disso a localização genérica não é mais lida.

- workspace `.zcode`: `mcp.servers` em `<workspace>/.zcode/config.json`
- workspace `.agents`: `mcpServers` em `<workspace>/.agents/mcp.json`, fallback apenas quando o `.zcode` do workspace não tem MCP server
- user `.zcode`: `mcp.servers` em `~/.zcode/cli/config.json`
- user `.agents`: `mcpServers` em `~/.agents/mcp.json`, fallback apenas quando o `.zcode` do usuário não tem MCP server
- criar/editar grava apenas na configuração principal `.zcode`, escolhendo user ou workspace pelo seletor; as origens de fallback compatíveis permanecem somente leitura
- desabilitar um MCP server grava de volta no próprio objeto de configuração MCP onde o server está: `mcp.servers[serverName].enable = false` ou `mcpServers[serverName].enable = false`; ao reabilitar, o campo `enable` é removido

## Hooks

- workspace `.zcode`: `hooks` em `<workspace>/.zcode/config.json`
- workspace `.agents`: `hooks` em `<workspace>/.agents/settings.json`
- workspace `.claude`: `hooks` em `<workspace>/.claude/settings.json`
- user `.zcode`: `hooks` em `~/.zcode/cli/config.json`
- user `.agents`: `hooks` em `~/.agents/settings.json`
- user `.claude`: `hooks` em `~/.claude/settings.json`
- criar/editar grava apenas em hooks de `.zcode`, escolhendo user ou workspace pelo seletor; hooks de origens compatíveis são exibidos somente para leitura
- o formulário preserva os campos JSON extras do process hook, evitando que a página de configurações perca campos de hooks ainda não modelados pela UI atual ao salvar
- desabilitar um hook é gravado uniformemente em `~/.zcode/cli/config.json`: `hooks[配置目录路径][hook 签名].enable = false` (caminho do diretório de configuração); a assinatura é composta por `event`, `matcher`, `command` e `args`, e ao reabilitar o override é removido