# Estado Inicial do Command Center (Cmd+K)

## Objetivo

O Command Center aberto por `Cmd/Ctrl+K` precisa atender simultaneamente às entradas rápidas de workspace e à
entrada de contexto da task atual. Na abertura padrão, exibe-se prioritariamente as alterações recentes da task
atual, as tasks recentes e os comandos agrupados semanticamente; depois que um termo de busca é digitado, a
busca mista existente de commands / tasks / files continua sendo reutilizada.

## Conteúdo Padrão

Com busca vazia e escopo `All`, a exibição segue esta ordem:

1. `Recent changes`
   - A origem dos dados são as assistant messages já carregadas da task ativa atual.
   - Mantém a mesma origem que o `summary changes` de cada turno da área de chat: os resumos de alterações de
     arquivo são extraídos das estruturas `raw` / `input` / `output` / `display` das tool calls do assistant.
   - Não lê os campos `summary_*` do sqlite, não lê `ZCodeTaskMeta.changeSummary` e também não usa
     `perTurnFileChangesByTaskId` / `perTurnSummariesByTaskId` como fallback.
   - Mostra apenas os arquivos modificados recentemente pela task atual; não pode usar as alterações
     unstaged/staged do Git de todo o workspace.
   - Exibe no máximo 3 itens por padrão.
   - Cada linha mostra o ícone do arquivo, o caminho relativo ao workspace e `+added -removed`.
   - O grupo é ocultado quando a task atual não tem resumo de alterações.

2. `Recent tasks`
   - A origem dos dados é a lista de tasks já carregada do workspace atual.
   - Exibe no máximo 3 tarefas atualizadas recentemente.
   - Clicar troca para a tarefa correspondente.

3. Grupos de comandos
   - O antigo `Quick actions` único foi dividido em `Suggested`, `Chat`, `Navigation`, `Panels`, `Configure` e
     `App`.
   - O modelo de grupos permanece estável; grupos sem comando padrão nesta rodada não exibem título vazio, mas
     não podem ser removidos do registry / i18n / ordem de seções.
   - `Suggested` exibe apenas `New task`, `Open workspace`, `Settings`.
   - `Chat` e `Navigation` ainda não têm itens de comando padrão; as ações futuras de conversa e navegação
     continuam voltando para a categoria correspondente.
   - `Panels` exibe `Toggle sidebar`, `Toggle terminal`, `Toggle preview`, `Add terminal tab`,
     `Add browser tab`, `Add review tab`.
   - `Configure` exibe `Settings`, `Switch theme to light/dark`, `Skills`, `MCP Servers`.
   - `App` exibe `Feedback`, `Community`, `Product docs`, `Connect/Disconnect`.

## Tabs de Escopo

Abaixo da caixa de busca, os tabs de escopo são sempre exibidos: `All`, `Actions`, `Tasks`, `Files`. Os tabs são
filtros de escopo, não apenas atalhos de prefixo de busca; portanto, mesmo sem texto digitado, trocar de tab
precisa exibir o conteúdo padrão do escopo correspondente.

- `All`
  - Com busca vazia, exibe a homepage padrão completa: `Recent changes`, `Recent tasks` e os grupos de comandos,
    sendo que os grupos de contexto exibem no máximo 3 itens de pré-visualização.
  - Com termo de busca, busca actions, tasks e files de forma mista; tarefas e arquivos seguem o ritmo de
    pré-visualização da homepage.
- `Actions`
  - Com busca vazia, exibe apenas os grupos de comandos: `Suggested`, `Chat`, `Navigation`, `Panels`,
    `Configure`, `App`.
  - Com termo de busca, busca apenas actions.
- `Tasks`
  - Com busca vazia, exibe apenas as tarefas recentes, sem herdar o limite de 3 itens de pré-visualização da
    homepage de `All`.
  - Com termo de busca, busca apenas tasks e mostra diretamente a lista de resultados de tarefas, sem o limite
    de 3 itens de `All`.
- `Files`
  - Com busca vazia, exibe apenas os arquivos modificados pela task ativa atual, ou seja, `Recent changes`, sem
    o limite de 3 itens de pré-visualização da homepage de `All`.
  - Com termo de busca, busca apenas workspace files e mostra diretamente a lista de resultados de arquivos, sem
    o limite de 3 itens de `All`.
  - Os workspace files e as sugestões de arquivo `@` do Composer reutilizam o mesmo índice `listWorkspaceFiles` do
    lado do Host e o
    [filtro padrão](../superpowers/specs/2026-08-07-workspace-file-search-default-filter-design.md); a UI não
    mantém uma blacklist separada, e esta fase não oferece entrada de configuração de regras customizadas.

Visualmente, a caixa de busca e os tabs de escopo pertencem ao mesmo header block; o header block usa padding
horizontal compacto de 8px, sem divisória no meio, e só usa um divisor fraco abaixo dos tabs, antes de entrar na
lista de resultados. O corpo da caixa de busca usa um shell de input em cápsula com borda, seguindo os tokens de
fundo, borda, hover e focus de input. Os tabs usam botões em cápsula de tamanho pequeno, mantendo o visual
compacto e com rolagem horizontal, para evitar que textos longos no mobile comprimam a caixa de busca.

## Estado de Busca

Depois que um termo é digitado, a semântica de busca existente do Command Center é preservada:

- Sem prefixo, busca commands, tasks e files simultaneamente.
- `>` limita a commands.
- `#` limita a tasks.
- `@` limita a files.
- Os resultados continuam agrupados por comando, tarefa e arquivo, e o histórico de busca é preservado.

## Detalhes Visuais

- Os itens de lista do Command Center e do QuickPick usam `rounded-xl`, tornando mais suaves os estados de seleção
  por teclado e de hover.
- O `CommandItem` subjacente mantém o padrão `rounded-lg`; o Cmd+K/QuickPick sobrescreve para um raio maior por
  meio de uma classe de item compartilhada, sem afetar as outras listas de comandos.
- Os ícones de comando priorizam a reutilização do ícone Lucide da entrada correspondente existente; a mesma
  ação não pode usar ícones semanticamente diferentes no Header, na Sidebar, no Side pane e no Cmd+K.

## Boundaries de Compatibilidade

- A UI deve ser compatível com desktop e Web.
- O atalho principal continua seguindo a regra da plataforma: no macOS, Command; no Windows/Linux, Ctrl.
- As tarefas recentes de workspaces locais e remotos continuam passando pela boundary existente do serviço de
  task list, e a UI não lê diretamente o JSON de sessão.
- `workspaceIdentity?.trim() || workspacePath` continua sendo a key de isolamento de tarefas e histórico.