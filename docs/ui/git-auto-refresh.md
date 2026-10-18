# Refresh automático do Git

## Contexto

Tanto a entrada de operações Git no topo quanto o seletor de branch do Git na parte inferior dependem do `GitRepositorySummary` lido por `useGitRepository`. A implementação histórica só reabria o estado na troca de workspace, na abertura do Git pane, no refresh manual do usuário e após a conclusão de uma operação Git; se o usuário alterasse arquivos em um editor externo ou trocasse de branch, a UI ficaria presa ao estado antigo.

## Implementação

`useGitAutoRefresh` registra `fileWatcherService.watch()` com base na plataforma do workspace Host e em `gitSummary.autoRefreshWatchPaths`, quando o workspace atual está visível e o Git está disponível. O Git service só devolve os caminhos de metadados de gitdir/common-dir resolvidos pelo próprio Git, evitando usar o caminho de conteúdo do workspace como fonte de verdade de escuta recursiva compartilhada entre plataformas; isso também torna a solução compatível com subdiretórios de monorepo e linked worktree.

- Workspace macOS / Windows: mantém o watcher recursivo do caminho de conteúdo do workspace e complementa com os caminhos de metadados do Git.
- Workspace Linux (incluindo Linux local, SSH, WSL, Docker): escuta apenas os caminhos de metadados do Git, sem escuta recursiva de todo o workspace. O `fs.watch` recursivo no Linux precisa percorrer subdiretórios e bloqueia o workspace Host em montagens lentas ou diretórios grandes gerados, atrasando o RPC de task/session.
- Quando a plataforma do workspace Host ainda não foi retornada, ou quando um server summary antigo ainda carrega o caminho de conteúdo do workspace: tratar com a estratégia conservadora do Linux, sem registrar o watcher recursivo do workspace; a cadeia de refresh manual e de refresh após operações Git permanece inalterada.

Depois que o evento chega, o hook aplica um debounce de 1 minuto e então dispara o `onRefreshGit()` já existente, reutilizando a cadeia de refresh original do `gitRefreshVersion`.

Esta cadeia cobre:

- Após criação, alteração ou exclusão de arquivos por um editor externo no macOS / Windows, a entrada de operações Git no topo reavalia o estado dirty.
- Após troca de branch, commit e stage/unstage por comandos externos, em todas as plataformas, o nome da branch na parte inferior e as entradas de push/commit são atualizados em sincronia.
- Edição externa da working tree em um workspace Linux não dispara um refresh dirty imediato vindo do watcher do workspace; o usuário pode fazer o refresh manual, e a cadeia de refresh já existente após operações ZCode/Git permanece inalterada.
- Workspaces remotos continuam registrando o watcher por meio dos services com escopo de workspace; os fatos de plataforma de WSL/SSH/Docker vêm do `systemService.info()` do Host remoto e não podem usar a decisão de plataforma do desktop. Em caso de queda de conexão remota ou de plataforma sem suporte a watch, a falha na escuta é apenas registrada como warn, preservando as cadeias de refresh manual e pós-operação.

## Trade-offs

Aqui não foi usado polling com intervalo fixo. O polling geraria custo contínuo de Git CLI/RPC em repositórios grandes e workspaces remotos; a atualização por evento só refresca quando o sistema de arquivos realmente muda, o que se ajusta melhor ao modelo de workspace compartilhado entre o desktop e o controle remoto Web.

## Degradação de status em repositórios grandes

A saída detalhada de `git status --untracked-files=all` pode ultrapassar o orçamento de saída do comando Git quando diretórios de cache ou artefatos gerados contêm dezenas de milhares de arquivos não rastreados. Nesse caso não é possível simplesmente aumentar o orçamento: depois de retornar o status detalhado, as linhas de estatística dos arquivos não rastreados ainda são lidas uma a uma, o que amplifica um único refresh de UI em dezenas de milhares de leituras concorrentes de arquivo.

Depois de detectar pela primeira vez que o status detalhado excedeu o limite, o Git repo precisa fazer uma degradação de capacidade em tempo de execução para o `repoRoot` atual:

- Reexecutar `git status --untracked-files=normal`, colapsando diretórios não rastreados em registros de nível de diretório, garantindo que branch, tracked change, estado dirty e a entrada acionável de não rastreados ainda sejam retornados.
- Nos refreshes seguintes dentro da mesma instância de repo, usar diretamente o modo colapsado, sem disparar de novo um comando detalhado que inevitavelmente excederia o limite.
- A degradação é chaveada pelo `repoRoot` com semântica de caminho real, sem usar `workspaceIdentity`; os processos de Git service de servidores remotos diferentes já são isolados naturalmente.
- Repositórios em escala normal continuam usando `--untracked-files=all`, preservando a semântica de exibição arquivo a arquivo.
- A primeira degradação registra um `warn`; os refreshes seguintes não repetem o mesmo alerta. Se o modo colapsado ainda exceder o limite, tratar como uma falha real, sem fazer parsing da saída do Git truncada.