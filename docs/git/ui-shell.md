# Estado atual do desenvolvimento da UI de Git

Data de atualização: 2026-07-07

## Objetivo atual

A etapa atual já conectou o fluxo principal de "ler as alterações reais do repositório" do painel de Git e repôs os pontos de entrada leves de escrita no topo. O objetivo atual é permitir que o usuário, sem sair do workspace atual, continue navegando pelas alterações e também consiga finalizar o commit ou o push pela entrada do topo.

## Cadeia de geração da mensagem de commit por modelo

- O diálogo "Commit" do topo adota um painel de ações compacto e leve com overlay padrão: no topo são exibidos o branch atual e a estatística `+/-` do escopo selecionado nesta rodada, no meio fica a área de entrada da mensagem de commit e embaixo a lista de ações de commit.
- A entrada de branch atual no topo do diálogo reaproveita o `GitBranchSwitcher`; ao clicar, apenas a lista de branches locais trocáveis é expandida; após uma troca bem-sucedida o escopo de commits do branch atual é lido novamente, evitando continuar exibindo o snapshot de staged / unstaged do branch antigo.
- A estatística `+/-` no topo do diálogo reaproveita primeiro o summary de modificações de arquivos da conversa atual, evitando que, quando a conversa atual alterou apenas poucos arquivos, a contagem seja inflada por outras alterações não commitadas do workspace; sem o summary da conversa, ela só recorre às estatísticas do Git do escopo de commit atual.
- A área de entrada da mensagem de commit aceita preenchimento manual e também permite gerar primeiro clicando em um ícone; se o usuário clicar diretamente em `提交` / `提交并推送` com a mensagem vazia, a UI gera primeiro uma mensagem de Conventional Commit e só então executa a ação.
- O painel de commit inclui por padrão as alterações não preparadas (unstaged); o usuário pode desativar `包含未暂存的更改`, e nesse caso o commit, as estatísticas e a mensagem gerada consideram apenas as alterações já preparadas.
- A geração da mensagem de commit leva na requisição o contexto textual recente de usuário / assistant da sessão atual, para que o modelo compreenda a intenção das modificações desta rodada; o contexto é aparado por número de mensagens e por número de caracteres, e o resultado gerado não pode escrever explicitamente metanarrativa como "conforme a conversa" ou "conforme pedido do usuário".
- A geração da mensagem de commit reaproveita a seleção de modelo atual do workspace atual; o serviço de Git é responsável apenas por ler o status/diff do Git, construir um prompt restrito e validar a saída de Conventional Commit.
- A cadeia de chamada de modelo é unificada em `Git service -> IZCodeAgentService -> ZCode Protocol workspace/generateText -> AgentRuntime -> modelAdapter.generateText`.
- A UI não busca mais materiais de autenticação de tempo de requisição de Start Plan / zcode-plan para a geração da mensagem de commit, nem passa scoped runtime headers ao serviço de Git.
- Os runtime headers de tempo de requisição do Start Plan são atualizados automaticamente pelo AgentRuntime através de `providerRuntimeHeaders.request` antes de cada requisição real em `modelAdapter.generateText`; esse mecanismo é o mesmo das requisições de modelo independentes, como conversa comum e prompt enhance.
- O serviço de Git não se conecta mais diretamente a endpoints HTTP compatíveis com OpenAI / Anthropic nem faz parsing de provider response / SSE; depois que a camada de protocolo retorna texto puro, o serviço de Git faz a limpeza da saída e a convergência de erros.

## UI já concluída

### 1. Entrada do topo

- A barra de ferramentas superior do `WorkspaceHeader` já está conectada à entrada de Git
- Quando o workspace atual consegue detectar a contagem de linhas `+/-`, o topo exibe um botão em cápsula unificado com "ícone de Git + estatística +/-"
- Essa estatística é exibida mesmo com o painel de Git fechado, evitando que o usuário precise abrir o Git para saber que existem alterações
- Clicar nessa entrada abre ou fecha o painel de Git do lado direito

### 2. Painel de Git do lado direito

- O Git reaproveita o painel compartilhado existente do lado direito, no mesmo slot que browser / code-viewer
- O topo do painel mantém o título e o botão de fechar
- A área principal foi reduzida para um modo de leitura de coluna única mais leve, evitando acumular muitas áreas de ação desde o início

### 3. Entrada de ações de Git no topo

- Na barra de ferramentas superior do `WorkspaceHeader`, à esquerda do botão de alternância do terminal, foi adicionada uma entrada em cápsula "Commit ou Push"
- O botão principal executa primeiro `提交` conforme o estado atual do Git; se não houver alterações não commitadas mas existirem commits para push, executa `推送`
- A entrada não oferece mais um menu de três pontos / dropdown, evitando dividir commit e push em dois caminhos paralelos
- `提交` abre um diálogo de commit independente, que por padrão prepara e commita todas as alterações não commitadas no escopo do workspace atual
- O diálogo de commit oferece adicionalmente `提交并推送`; após um commit bem-sucedido, faz push do branch atual reaproveitando o mesmo serviço de Git
- `推送` abre um diálogo de push independente, que executa um `git push` real; se o branch atual ainda não tiver upstream, `--set-upstream` é adicionado automaticamente no primeiro push

### 4. Troca de origem

- Suporta 4 origens:
  - `未暂存`
  - `已暂存`
  - `全部分支更改`
  - `上一轮更改`
- A origem selecionada no momento é gerenciada em nível elevado pelo `App`, garantindo que a estatística da entrada do topo e o conteúdo do painel de Git sempre venham da mesma origem

### 5. Lista de arquivos e diff

- Os itens da lista exibem o caminho completo relativo ao workspace
- Os itens de arquivo suportam expandir / recolher
- Após expandir, o diff inline é exibido diretamente, sem repetir o caminho e a estatística `+/-`
- Itens diferentes de `未暂存` exibem um badge de status por seção, por exemplo `未跟踪`, `冲突`, `已暂存`
- O diff usa o componente existente `PatchDiff` e reaproveita a configuração de tema da pré-visualização de código

### 6. Árvore de arquivos na barra lateral

- Ao clicar em "显示文件树", uma barra lateral de diretórios é expandida à direita do painel de Git
- A largura da barra lateral pode ser ajustada por arraste, e a largura do último arraste é preservada
- O topo da barra lateral oferece uma caixa de busca "筛选文件...", filtrando imediatamente pelo caminho relativo dos arquivos da árvore de diretórios atual
- A barra lateral exibe diretórios e nós de arquivo; durante o filtro são mantidos os diretórios ancestrais dos arquivos encontrados, facilitando continuar a localização por hierarquia
- Após selecionar um diretório, a lista de arquivos da área principal é filtrada
- Após selecionar um nó de arquivo, a área principal é reduzida a esse único arquivo; clicar novamente no diretório ou arquivo selecionado retorna à lista completa
- A árvore de arquivos suporta recolher / expandir diretórios

### 7. Rodapé da área de entrada da conversa

- A caixa de entrada da conversa agora mantém apenas os controles relacionados a edição (área de entrada, anexos, botões enviar / parar)
- O agent atual, o modelo atual, as configurações de mode e a estatística de contexto em tokens foram removidos do invólucro da caixa de entrada e unificados no rodapé abaixo da caixa de entrada
- A entrada de troca de branch do Git compartilha esse mesmo rodapé com esses controles de estado e é fixada na extremidade direita, reduzindo o congestionamento horizontal dentro da caixa de entrada
- O ícone do agent atual segue prioritariamente o "task provider que está sendo visualizado no momento", evitando que, ao trocar para uma task histórica ou task fork, a exibição fique inconsistente com a sessão real

## Origens de dados atuais

### Dados reais do Git

As seguintes origens já estão conectadas ao `IGitService` real:

- `未暂存`
- `已暂存`
- `全部分支更改`

Forma de integração:

- `useGitRepository` lê de forma unificada `refresh / getChanges / getBranchComparison` através de `services.gitService`
- O `App` busca apenas uma vez o snapshot real do repositório, e header e painel de Git reaproveitam o mesmo estado, evitando execuções duplicadas de comandos Git
- O diff de arquivo único passou a ser chamado sob demanda pelo `getDiff` dentro do painel de Git, evitando que a estatística da entrada do topo também dispare a leitura do diff completo

### Dados semireais

- `上一轮更改` reaproveita prioritariamente o snapshot de arquivos por turno e o resumo da task atual no task store do ZCode
- Essa é a origem de dados mais próxima da saída real do agent dentro da UI atual

## Limites atuais de interação

A versão atual ainda não é uma bancada completa de Source Control, mas o topo já expõe um conjunto leve de ações de escrita:

- `commit` no front-end já conectado
- `push` no front-end já conectado
- `create branch` no front-end já conectado

Ações de escrita ainda não expostas:

- Sem `stage / unstage / discard` no front-end
- Sem área de commit em lote nem de operações em lote

Capacidades somente de leitura já conectadas:

- `git status` real
- Comparação real de branches
- Diff real de arquivo único
- Leitura real de `user.name / user.email` (a UI atual ainda não exibe)

`packages/ui/src/hooks/useGitActions.ts` continua sendo um ponto de extensão reservado; essa camada de abstração de ações pode ser reaproveitada quando o service for conectado.

## Arquivos-chave de implementação

- `packages/ui/src/App.tsx`
- `packages/ui/src/v4/ConversationComposer.tsx`
- `packages/ui/src/GitBranchSwitcher.tsx`
- `packages/ui/src/GitActionMenu.tsx`
- `packages/ui/src/WorkspaceHeader.tsx`
- `packages/ui/src/GitPane.tsx`
- `packages/ui/src/git-action-menu/display.ts`
- `packages/ui/src/hooks/useGitRepository.ts`
- `packages/ui/src/lib/workspaceSidePane.ts`
- `packages/services/src/git/gitService.ts`
- `packages/services/src/git/repo/gitCliRepo.ts`

## Estado atual de verificação

- `pnpm typecheck`: o repositório atual não passa completamente; existem erros pré-existentes de shared import / tipagem de MCP, não introduzidos pelas mudanças de Git UI desta rodada
- `pnpm lint`: o `oxlint` em nível de repositório ainda tem warnings pré-existentes; os arquivos alterados nesta rodada passaram individualmente pelo `oxlint`
- `pnpm exec vitest run packages/services/test/gitService.test.ts packages/ui/test/gitActionMenuDisplay.test.ts packages/ui/test/gitBranchSwitcherDisplay.test.ts`: passou

## Sugestões para as próximas etapas

1. Decidir se o painel de Git deve restaurar `stage / unstage / discard` e a área de operações em lote
2. Complementar o menu de commit / push do topo com mais estados vazios, estados de falha e avisos de permissão
3. Continuar refinando a interação para cenários como Git vazio, repositório inexistente e Git indisponível