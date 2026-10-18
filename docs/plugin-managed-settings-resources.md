# Agrupamento na página de configurações dos recursos registrados por plugin

Na página de configurações do ZCode, Skills, Commands e MCP Servers exibem separadamente os recursos de configuração locais dos recursos registrados por plugin.

A descrição e os metadados auxiliares dos itens de plugin usam uniformemente `text-ui-sm text-foreground-subtle`, mantendo consistência com os demais itens das listas de configurações.

## Regras de agrupamento

- Recursos locais: vindos do diretório de configuração do workspace ou do usuário, por exemplo `.zcode/skills`, `.zcode/commands` e a configuração de MCP do usuário/workspace.
- Recursos de plugin: vindos dos `skills`, `commands` e `mcpServers` declarados nos manifests de plugins habilitados.
- Os recursos de plugin são exibidos somente para leitura na página de configurações correspondente, com o aviso "registrado pelo plugin; para alterar, acesse o plugin correspondente".
- Itens do array `skills` do manifest seguem a especificação da Claude: a forma de diretório aponta para "o próprio diretório da skill" (com `SKILL.md` direto no item), e a
  forma de string aponta para o "diretório do conjunto de skills"; ambas as formas podem ser descobertas (regras de varredura compartilhadas na seção sobre a semântica do campo skills em
  `docs/claude-marketplace-triplet-plugin-compat.md`). Quando a varredura de um caminho declarado encontra 0 skills, a área "Aviso" da página de detalhes do plugin exibe o
  diagnóstico `plugin_skill_root_empty`, sem mais ser silencioso.

## Fontes de dados

- Skills: as skills com `scope: "plugin"` retornadas por `skillsService.list()`.
- Commands: os commands com `source: "plugin"` retornados por `commandsService.list()`.
- MCP Servers: a página de configurações gera a lista comum de MCP de plugin somente leitura a partir de `mcpServerNames` nos dados gerenciados de plugin; a configuração MCP completa continua sendo injetada pelo agent runtime na inicialização a partir do plugin outcome.
- Plugins oficiais também podem associar MCP embutidos no host pelo campo de protocolo `hostMcpServerNames`. Esse campo é usado apenas para atribuição na página de configurações e exibição de live status; não é configuração de manifest de plugin e não participa do prefixo de MCP de plugin nem do merge de runtime. O `node_repl` do Browser usa essa fronteira: a atribuição nas configurações é do Browser, mas o nome real de runtime continua sendo o `node_repl` reservado do host.
- A lista de MCP de plugin precisa ser associada ao snapshot de live status retornado por `mcp/list` pelo nome injetado no runtime `plugin:<pluginName>:<serverName>`. Se o snapshot tiver uma URL de autorização OAuth pendente, a página de configurações exibe o botão "Abrir autorização" na linha de MCP de plugin somente leitura e, ao clicar, abre essa URL pelo `openExternal` da plataforma.
- Depois que a autorização OAuth do MCP de plugin é concluída, a página de configurações não pode depender apenas de a URL de autorização pendente ainda existir para parar de atualizar. Pode haver um estado intermediário, sem `authorizationUrl`, entre a conclusão do callback de autorização e o MCP reconectar; a página precisa manter uma curta janela de follow-up e atualizar imediatamente quando o usuário volta do navegador para o app, evitando que o estado da linha fique preso ao anterior à autorização.
- A linha de MCP de plugin precisa exibir explicitamente os estados `connecting`, `connected`, `disconnected` e `error` do live snapshot; "integrado ao plugin" só é usado para plugins habilitados que ainda não têm snapshot de runtime e não pode sobrescrever o estado real de execução.
- A linha de MCP de plugin precisa preservar a operabilidade do botão de autorização em janelas estreitas e no Web do celular; nomes longos de marketplace podem ser truncados, sem comprimir a coluna principal de informação nem causar overflow horizontal.

## Limites de manutenção

Os recursos locais continuam sendo editados, removidos ou alternados na página de gerenciamento correspondente. O conteúdo, a raiz de comandos, a configuração de MCP servers e a entrada de liga/desliga dos recursos de plugin pertencem ao próprio plugin e devem ser mantidos pela página de configurações de Plugins ou pelos arquivos-fonte do plugin.

O botão de autorização OAuth do MCP de plugin apenas abre a entrada de autorização exposta pelo runtime atual; não é permitido editar a configuração de MCP de plugin, o client secret ou o token do OAuth na página de configurações.