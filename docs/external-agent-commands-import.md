# Importação de Comandos de Agentes Externos

## Objetivo

A página de configurações, em "Comandos", oferece a importação com um clique a partir do diretório local de comandos de um Agente externo para o ZCode. A interação é mantida consistente com a importação de "Habilidades": apenas arquivos de comando são tratados, sem importar skills, servidores MCP ou plugins.

## Escopo das Origens

A entrada de importação varre automaticamente as seguintes origens locais:

- Claude Code: nível de usuário `~/.claude/commands` e nível de workspace `<workspace>/.claude/commands`
- Codex CLI: nível de usuário `~/.codex/commands` e nível de workspace `<workspace>/.codex/commands`
- OpenCode: nível de usuário `~/.config/opencode/commands` e nível de workspace `<workspace>/.opencode/commands`
- OpenClaw: nível de usuário `~/.openclaw/commands` e nível de workspace `<workspace>/commands`
- Augment: nível de usuário `~/.augment/commands` e nível de workspace `<workspace>/.augment/commands`
- Continue: nível de usuário `~/.continue/commands` e nível de workspace `<workspace>/.continue/commands`
- Goose: nível de usuário `~/.config/goose/commands` e nível de workspace `<workspace>/.goose/commands`
- Qwen Code: nível de usuário `~/.qwen/commands` e nível de workspace `<workspace>/.qwen/commands`
- Qoder: nível de usuário `~/.qoder/commands` e nível de workspace `<workspace>/.qoder/commands`
- Qoder CN: nível de usuário `~/.qoder-cn/commands` e nível de workspace `<workspace>/.qoder/commands`
- Windsurf: nível de usuário `~/.codeium/windsurf/commands` e nível de workspace `<workspace>/.windsurf/commands`
- Trae: nível de usuário `~/.trae/commands` e nível de workspace `<workspace>/.trae/commands`
- Kiro CLI: nível de usuário `~/.kiro/commands` e nível de workspace `<workspace>/.kiro/commands`
- Roo Code: nível de usuário `~/.roo/commands` e nível de workspace `<workspace>/.roo/commands`
- CodeBuddy: nível de usuário `~/.codebuddy/commands` e nível de workspace `<workspace>/.codebuddy/commands`

O Gemini não é suportado, e nem `.agents/commands` de nível de usuário ou de projeto é varrido, porque a lista de comandos já faz leitura direta do diretório de comandos `.agents`.

## Estratégia de Importação

- Apenas arquivos de comando `.md` são tratados; diretórios e arquivos ocultos são ignorados.
- O destino da importação é escolhido pelo usuário no menu suspenso do botão de importação:
  - `Global` grava em `~/.zcode/commands/`.
  - `Project` grava em `<workspace>/.zcode/commands/`.
- A hierarquia do arquivo de comando em relação à raiz de origem é preservada na importação; por exemplo, `review/code.md` continua sendo importado como `review/code.md`.
- O método de importação é o mesmo das habilidades:
  - `软链` (symlink): cria um link simbólico no caminho de destino apontando para o arquivo de comando de origem; é a opção padrão.
  - `直接复制` (cópia direta): copia o arquivo de comando para o caminho de destino.
- Se não houver workspace aberto, o destino `Project` fica indisponível.
- A importação é ignorada quando já existe um arquivo de destino com o mesmo nome, ou quando já existe nos comandos do ZCode um slash command com o mesmo nome; comandos existentes do ZCode não são sobrescritos.
- Ao abrir o diálogo ou após uma nova varredura, a seleção padrão permanece em `Global`, mas nenhuma das origens `Global` e `Project` é marcada por padrão: o usuário precisa escolher explicitamente.

## Comportamento da UI

- A página de configurações de "Comandos" exibe um botão de ícone de importação ao lado do botão de novo.
- A estrutura do diálogo, o Select de escopo, o botão de atualização, a árvore de origens em dois níveis, selecionar/desselecionar tudo, o botão dividido de destino de importação, o menu suspenso de método de importação e a lista final de resultados são mantidos consistentes com a importação de habilidades.
- O segundo nível exibe o nome do comando, derivado do caminho relativo do arquivo de comando convertido em slash command, como `/review/code`.
- A página de conclusão da importação exibe a lista dos comandos envolvidos; cada item mostra o ícone de status e o nome do comando, sem exibir o caminho do arquivo.

## Compatibilidade e Limites

- `settings-sync` ganha uma nova categoria `commands`, com uma tabela de origens de comandos mantida de forma independente, sem derivação da tabela de origens de `skills`; a varredura de recursos, a deduplicação e a importação também são independentes das de skills.
- Workspaces remotos usam apenas caminhos do sistema de arquivos acessíveis ao processo host atual; a semântica de isolamento de identidade continua passando `workspaceIdentity`, e a execução de caminhos continua usando `workspacePath`.
- O modo de cópia direta não referencia diretórios externos; o modo de symlink aponta continuamente para os arquivos de comando externos, sendo adequado para quem deseja acompanhar as mudanças nos comandos do agente externo.

## Verificação

- Cobertura para diretórios ausentes, diretórios vazios,ignorar nomes duplicados, importação de nível de usuário, importação de nível de workspace e os dois modos copy/symlink.
- Cobertura de UI para o botão de importação, a lista de origens no diálogo e a atualização após a conclusão da importação.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`.