# Importação de Plugins de Agentes Externos

## Objetivo

A página de configurações «Gerenciamento de plugins» oferece importação com um clique a partir do diretório local de plugins de um Agente externo para o ZCode. A interação é consistente com a importação de «habilidades» e «comandos», mas o diretório de negócio, as regras de varredura, a escrita do destino e a lógica de deduplicação são mantidos de forma independente.

## Escopo de origem

A entrada de importação verifica automaticamente as seguintes origens locais:

- Claude Code: nível de usuário `~/.claude/plugins` e nível de workspace `<workspace>/.claude/plugins`
- Codex CLI: nível de usuário `~/.codex/plugins` e nível de workspace `<workspace>/.codex/plugins`
- OpenCode: nível de usuário `~/.config/opencode/plugins` e nível de workspace `<workspace>/.opencode/plugins`
- OpenClaw: nível de usuário `~/.openclaw/plugins` e nível de workspace `<workspace>/plugins`
- Augment: nível de usuário `~/.augment/plugins` e nível de workspace `<workspace>/.augment/plugins`
- Continue: nível de usuário `~/.continue/plugins` e nível de workspace `<workspace>/.continue/plugins`
- Goose: nível de usuário `~/.config/goose/plugins` e nível de workspace `<workspace>/.goose/plugins`
- Qwen Code: nível de usuário `~/.qwen/plugins` e nível de workspace `<workspace>/.qwen/plugins`
- Qoder: nível de usuário `~/.qoder/plugins` e nível de workspace `<workspace>/.qoder/plugins`
- Qoder CN: nível de usuário `~/.qoder-cn/plugins` e nível de workspace `<workspace>/.qoder/plugins`
- Windsurf: nível de usuário `~/.codeium/windsurf/plugins` e nível de workspace `<workspace>/.windsurf/plugins`
- Trae: nível de usuário `~/.trae/plugins` e nível de workspace `<workspace>/.trae/plugins`
- Kiro CLI: nível de usuário `~/.kiro/plugins` e nível de workspace `<workspace>/.kiro/plugins`
- Roo Code: nível de usuário `~/.roo/plugins` e nível de workspace `<workspace>/.roo/plugins`
- CodeBuddy: nível de usuário `~/.codebuddy/plugins` e nível de workspace `<workspace>/.codebuddy/plugins`

O Gemini não é suportado, e `.agents/plugins` de nível de usuário ou de projeto não é varrido.

## Regras de identificação

- Um candidato a plugin é um diretório que contém um manifest.
- Prioridade do manifest:
  1. `.zcode-plugin/plugin.json`
  2. `.claude-plugin/plugin.json`
  3. `.codex-plugin/plugin.json`
- O manifest precisa ser um objeto JSON, com `name` sendo uma string não vazia; quando `version` não pode ser lido, ela não é exibida.
- A profundidade de varredura verifica apenas os diretórios de plugins em um nível abaixo da raiz de origem, sem varrer recursivamente os diretórios de recursos dentro do plugin.

## Estratégia de importação

- O destino da importação é escolhido pelo usuário no menu suspenso abaixo do botão de importação:
  - `Global` grava em `~/.zcode/plugins/<plugin-dir>/` e acrescenta esse caminho absoluto a `plugins.dirs` em `~/.zcode/cli/config.json`.
  - `Project` grava em `<workspace>/.zcode/plugins/<plugin-dir>/` e acrescenta esse caminho absoluto a `plugins.dirs` em `<workspace>/.zcode/config.json`.
- A forma de importação é a mesma de habilidades e comandos:
  - `Link simbólico`: cria um link simbólico no destino apontando para o diretório do plugin de origem; é a opção padrão.
  - `Cópia direta`: copia o diretório do plugin para o caminho de destino.
- Se nenhum workspace estiver aberto, o destino `Project` fica indisponível.
- Se já existir um diretório de destino com o mesmo nome, ou se o mesmo plugin id (`<manifest.name>@inline`) já existir na configuração de destino, a importação é pulada, sem sobrescrever o plugin existente.
- Ao abrir o diálogo ou após uma nova varredura, o destino padrão continua sendo `Global`, mas as origens `Global` e `Project` não vêm marcadas por padrão: o usuário precisa escolher explicitamente.

## Comportamento da UI

- A página de configurações «Gerenciamento de plugins» exibe um botão com ícone de importação ao lado do botão de atualizar.
- A estrutura do diálogo, o Select de escopo, o botão de atualizar, a árvore de origens em dois níveis, selecionar/desselecionar tudo, o botão dividido de destino de importação, o menu suspenso de forma de importação e a lista final de resultados são consistentes com a importação de habilidades e comandos.
- O segundo nível exibe o nome do plugin; se o manifest tiver `version`, um badge de versão aparece logo após o nome do plugin.
- A página de conclusão da importação exibe a lista dos plugins envolvidos; cada item mostra um ícone de status e o nome do plugin, sem exibir o caminho dos arquivos.

## Compatibilidade e limites

- `settings-sync` ganha a categoria `plugins`, com uma tabela de origens de plugins mantida de forma independente, sem ser derivada das tabelas de origens de `skills` ou `commands`; varredura de recursos, deduplicação e importação também são independentes.
- Workspaces remotos usam apenas caminhos do sistema de arquivos acessíveis ao processo host atual; a semântica de isolamento de identidade continua passando `workspaceIdentity`, enquanto a execução de caminhos continua usando `workspacePath`.
- O modo de cópia direta não referencia diretórios externos; o modo de link simbólico continua apontando para o diretório externo do plugin, o que atende usuários que жела acompanhar as mudanças nos plugins do Agente externo.
- O runtime do ZCode lê os plugins inline importados por meio de `plugins.dirs`; a funcionalidade de importação não escreve no cache do marketplace oficial.

## Verificação

- Cobrir diretório ausente, diretório vazio, pulo por nome duplicado, importação de nível de usuário, importação de nível de workspace e os dois modos copy/symlink.
- Cobrir os dois manifests: `.zcode-plugin/plugin.json` e `.claude-plugin/plugin.json`.
- A UI cobre o botão de importação, a lista de origens no diálogo e a atualização após a conclusão da importação.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`.