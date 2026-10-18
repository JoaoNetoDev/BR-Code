# Parsing Compatível e Diagnóstico da Configuração MCP

## Contexto

`~/.zcode/cli/config.json` pode vir de versões antigas, de uma importação de Agent externo ou ser escrito à mão pelo usuário. Existem dois campos MCP comuns em configurações históricas:

- Servidores stdio usam `environment` para representar variáveis de ambiente.
- Servidores HTTP remotos usam `type: "remote"`.

O schema de runtime atual aceita apenas `env` e `type: "http" | "sse" | "stdio"`. Se qualquer servidor MCP falhar na validação, a implementação antiga fazia o carregamento inteiro da configuração do usuário falhar, o que fazia perder configurações sem relação, como `plugins.enabledPlugins`, deixando a interface de gerenciamento de plugins em estado anormal.

## Objetivo

- Compatibilizar `environment -> env` na entrada da configuração.
- Compatibilizar `type: "remote" -> "http"` na entrada da configuração.
- Fazer o parsing tolerante dos MCP servers na granularidade do server: quando um server é inválido, pular apenas aquele server e registrar diagnostics.
- Manter a validação forte original para as demais configurações que não são MCP, sem passar silenciosamente estruturas de runtime desconhecidas para o sistema.

## Convenções de comportamento

- Um MCP server legacy válido é normalizado e entra em `RuntimeConfigPatch.mcp.servers`.
- Um único MCP server inválido não bloqueia o `config.json` inteiro.
- O MCP server pulado é registrado nos diagnostics de parsing da configuração, contendo o JSON path e o problema específico de schema.
- `createConfig()` escreve em log `warn` tanto a falha de carregamento do arquivo de configuração quanto os diagnostics de MCP servers pulados, para que o usuário possa exportar os logs e localizar problemas de migração.
- Erros de configuração de nível superior ainda deixam aquele arquivo de configuração com `loaded=false`, para evitar que configurações ilegais de provider/model/UI sejam aplicadas parcialmente.
- `type: "remote"` é normalizado para HTTP conforme a convenção de importação externa; se o endpoint alvo for na verdade SSE, é preciso escrever explicitamente `type: "sse"`.
- A documentação de diagnóstico e a skill diagnosing-mcp embutida precisam distinguir dois caminhos:
  - Quando a CLI lê a configuração diretamente, ela passa pela normalização da entrada da configuração, compatível com `environment -> env`, `http_headers -> headers`, `enable -> enabled` e `type: "remote" -> "http"`.
  - Quando o desktop envia MCP por Settings / session gerenciada pelo app, primeiro a UI lê o diretório do usuário e depois converte para `mcpServers` do ZCode Protocol. Esse caminho não deve levar o usuário a depender de campos legacy; na resolução de problemas, deve-se recomendar primeiro mudar para os campos canônicos: `env`, `headers`, `enabled`, `type: "http"`.
- Ao colar uma configuração MCP externa no editor JSON, é preciso avisar que `command` deve ser uma string: o formato de configuração do OpenCode, `command: ["npx", "-y", "server"]`, precisa ser dividido em `command: "npx"` e `args: ["-y", "server"]`; caso contrário, o formulário de configurações vai tratar `command` como string e provocar um erro em runtime.

## Verificação

- Testes de regressão cobrem o `environment` legacy, o `remote` legacy e o caso de um único server ruim não afetar `plugins.enabledPlugins`.
- A skill diagnosing-mcp cobre as diferenças de compatibilidade do caminho app-managed do desktop e o roteiro de autoatendimento para o usuário.
- `pnpm typecheck` e `pnpm lint` como verificação de fronteira.