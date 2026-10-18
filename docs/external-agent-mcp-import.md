# Importação de Servidores MCP de Agentes Externos

## Contexto

A página de configurações já suporta importar skills, commands e plugins de Agentes externos. Servidores MCP não são recursos em forma de diretório, portanto não podem reutilizar a semântica de symlink/cópia; o alvo da importação é o `mcp.servers` do arquivo de configuração do ZCode.

A migração de MCP no fluxo de onboarding cuida apenas da migração de configurações MCP genéricas antigas. A importação manual na página de configurações precisa varrer separadamente os arquivos de configuração MCP do Agente externo e mesclar na configuração do ZCode os servers selecionados pelo usuário.

## Objetivo

- Oferecer uma entrada "Importar de Agente Externo" na página de configurações de servidores MCP.
- A interação do diálogo reaproveita o diálogo de importação externa existente: escopo de origem, refresh, lista de origem em dois níveis, seleção item a item, destino global/projeto e lista de resultados da importação.
- A importação de MCP não exibe a opção "symlink/cópia direta", porque apenas mescla objetos de configuração.
- Destinos da importação:
  - Global: `mcp.servers` de `~/.zcode/cli/config.json`
  - Projeto: `mcp.servers` de `<workspace>/.zcode/config.json`
- Em caso de server com o mesmo nome, a configuração existente do ZCode é mantida, o server externo é marcado como ignorado e nada é sobrescrito.
- Não varrer diretórios relacionados ao Gemini.

## Escopo de varredura

Fontes MCP externas suportadas na primeira leva:

| Agent | Global | Project | Format |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | `<workspace>/.claude/settings.json`, `<workspace>/.mcp.json` | `mcpServers` JSON |
| Codex CLI | `~/.codex/config.toml` | `<workspace>/.codex/config.toml` | `mcp_servers` / `mcpServers` TOML |
| OpenCode | `~/.config/opencode/opencode.json` | `<workspace>/.opencode/opencode.json` | `mcp` JSON |
| OpenClaw | `~/.openclaw/settings.json` | `<workspace>/settings.json` | `mcpServers` JSON |
| Qwen Code | `~/.qwen/settings.json` | `<workspace>/.qwen/settings.json` | `mcpServers` JSON |
| Qoder | `~/.qoder/settings.json` | `<workspace>/.qoder/settings.json` | `mcpServers` JSON |
| Qoder CN | `~/.qoder-cn/settings.json` | `<workspace>/.qoder/settings.json` | `mcpServers` JSON |
| Trae | `~/.trae/settings.json` | `<workspace>/.trae/settings.json` | `mcpServers` JSON |
| Kiro CLI | `~/.kiro/settings.json` | `<workspace>/.kiro/settings.json` | `mcpServers` JSON |
| Roo Code | `~/.roo/settings.json` | `<workspace>/.roo/settings.json` | `mcpServers` JSON |
| CodeBuddy | `~/.codebuddy/settings.json` | `<workspace>/.codebuddy/settings.json` | `mcpServers` JSON |
| `.agents` genérico | `~/.agents/mcp.json` | `<workspace>/.agents/mcp.json` | `mcpServers` JSON |

## Compatibilidade

- A leitura e escrita de JSON usam parsing estruturado, preservando os demais campos de nível superior do arquivo de destino.
- TOML é usado apenas como fonte externa; o destino de escrita é sempre o JSON do ZCode.
- O `command: string[]` do OpenCode é convertido no `command + args` compatível com ZCode/Claude.
- O destino de projeto é desabilitado quando não há workspace.