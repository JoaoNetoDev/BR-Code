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

## Identidade de seleção da linha de task

- O cmdk é o único detentor do estado de seleção do painel; tanto a `key` do React quanto o `value` do cmdk precisam usar uma identidade de linha estável.
- O `value` das tasks recentes usa `recent-task:${workspaceKey}:${taskId}`; os resultados de busca de tasks usam `task-result:${row.key}`, em que `row.key` já contém a identidade do workspace, o ID da task e o índice do fragmento quando há um fragmento de corpo.
- O título, o nome de exibição do workspace e o fragmento de busca servem apenas para exibição e para o casamento de busca existente, e não podem ser a identidade de seleção. O motivo é que tasks homônimas do mesmo workspace recebem o mesmo texto, e o cmdk, ao julgar a seleção pelo `value`, destacaria várias linhas ao mesmo tempo, afetando também o posicionamento por teclado.
- Depois do movimento do mouse ou da navegação por teclado, apenas a linha alvo pode estar com `aria-selected=true`; Enter e o clique continuam abrindo a task/fragmento de corpo correspondente pelo callback já existente da linha.
- Tasks locais usam o fallback de caminho, e tasks remotas usam `workspaceIdentity?.trim() || workspacePath`; workspaces remotos diferentes com o mesmo caminho, o mesmo título e até o mesmo ID de task não podem compartilhar o valor de seleção.
- Esta é uma correção de identidade de linha dentro da UI compartilhada, sem nova persistência ou migração, e sem mudar o desktop continuous, o celular replayable, nem as fronteiras de dados e eventos de task do Host/CLI.

```text
movimento do mouse / setas do teclado → cmdk guarda o único value da linha → só a linha alvo fica selecionada → callback de abertura de task já existente
```

### Casos de regressão

| ID | Pré-estado e operação | Asserção |
| --- | --- | --- |
| CC-SELECT-01 | As tasks recentes têm três tasks homônimas do mesmo workspace; hover, setas e Enter em sequência | Sempre apenas a linha alvo selecionada, abrindo a task alvo |
| CC-SELECT-02 | A busca retorna tasks diferentes com o mesmo título, mesmo nome de exibição de workspace e mesmo fragmento de corpo | Cada linha pode ser selecionada de forma independente; identity remota diferente e fragmentos diferentes da mesma task também são selecionáveis de forma independente |

Regressão de componente: `packages/ui/test/commandCenterSelection.test.ts`.
Candidato de interação do desktop: `packages/desktop/test/e2e/ui-shell/manual-review/pending/command-center-selection.test.ts`, verificando a lista real de índices e a interação de mouse/teclado do cmdk; sem enviar requisições de modelo.

## Detalhes Visuais

- Com a caixa de busca focada, usa-se apenas a borda e o fundo de focus da cápsula externa, e o elemento de input interno não exibe um outline retangular adicional; os temas claro e escuro e a tela estreita seguem iguais. Não se aplica mais outline forçado globalmente por diálogo, controle remoto ou navegação de configurações, e o command center não mantém a cobertura local com `!important` correspondente. `ui-shell/manual-review/pending/command-center-focus.test.ts` (CC-FOCUS-01) verifica de forma independente o outline interno igual a zero e a borda externa preservada, sem depender dos dados da lista de tasks.
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