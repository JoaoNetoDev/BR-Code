# Design da Entrada de Sincronização Remota via WSL

## Contexto

A sincronização remota de Skill, MCP e Plugin foi inicialmente desenhada para workspaces SSH, e tanto a entrada de UI quanto os textos usam nomenclatura de host SSH. Entretanto, o workspace WSL do desktop já passa pela cadeia unificada `RemoteTarget` / `InitRemoteWorkspace` / remote service collection, e `skillSyncService`, `mcpSyncService` e `pluginSyncService` vêm todos do host remoto WSL.

## Objetivos

- Workspaces SSH e WSL exibem o mesmo conjunto de entradas de sincronização remota.
- O destino da sincronização continua sendo o diretório de usuário do runtime remoto atual: `~/.zcode/skills`, `~/.zcode/cli/config.json`, `~/.zcode/plugins`.
- Workspaces locais não exibem a entrada de sincronização remota.
- O Docker não ganha entrada nesta rodada, para evitar ampliar para o cenário de contêiner os riscos de compatibilidade de instalação de plugins e de ambiente MCP.

## Design

Generalizar o `shouldShowSshRemoteSyncActions` da camada de UI para uma verificação de capability de sincronização remota, permitindo que `remoteTarget.kind` seja `ssh` ou `wsl`. O wiring dos services remotos não ganha novos ramos e continua reaproveitando os remote workspace services existentes.

O rótulo do alvo é exibido conforme o tipo de target:

- SSH: `user@host:port · /remote/workspace`
- WSL: `WSL · distro · user · /remote/workspace`

Os textos passam de "SSH host" para "remote target / alvo remoto", evitando que o cenário WSL exiba uma descrição errada. Os avisos de ambiente de MCP e Plugin continuam explicando que, após a sincronização, a execução ocorre no ambiente remoto; no WSL, se um comando MCP local ou uma dependência de plugin exigir capacidades exclusivas do Windows, a verificação de status expõe a indisponibilidade, sem filtragem silenciosa na camada da entrada de sincronização.

## Pré-verificação de Permissão de Escrita

Antes do início da sincronização, o remote sync service executa uma pré-verificação de escrita:

- Skills: verifica `~/.zcode/skills`
- MCP: verifica `~/.zcode/cli`
- Plugins: verifica `~/.zcode/plugins` e `~/.zcode/cli`

A pré-verificação apenas faz a criação de diretório equivalente a `mkdir -p`, grava um arquivo temporário `.zcode-sync-preflight-*` e o remove em seguida. Ela não faz `chmod` / `chown`, para não alterar o modelo de permissões existente dos usuários WSL/SSH. Se o diretório estiver ocupado por outro usuário, se o caminho de destino for um arquivo ou se o usuário remoto atual não tiver permissão de escrita, a UI exibe o erro e interrompe a sincronização antes de exportar os recursos locais.

A pré-verificação faz parte do ciclo de vida da sincronização. Após clicar em iniciar, é obrigatório entrar no estado ativo `preflighting` antes do primeiro await de RPC remoto, usando um in-flight guard em nível de ref para impedir cliques rápidos repetidos antes que o state do React seja submetido. Tanto `preflighting` quanto `syncing` proíbem fechar o diálogo; após uma falha na pré-verificação, a UI volta a `selection` e não prossegue com exportação, importação ou início da instalação de plugins.

O RPC remoto da pré-verificação precisa ter espera limitada no lado da UI, com padrão de 15 segundos. Após o timeout, a UI volta a `selection`, libera o in-flight guard e exibe um erro localizado; se o RPC subjacente retornar atrasado, ele não avança mais o fluxo desta sincronização. Como a camada de service atual não possui token de cancelamento, e a pré-verificação apenas grava e apaga repetidamente um arquivo de marker, esta versão garante primeiro que o fluxo principal da UI é recuperável, sem introduzir remote runtime adicional nem um novo canal de cancelamento.

## Limite do Controle Remoto Web

A entrada de sincronização é exibida apenas na surface `desktop-continuous` do desktop. O controle remoto Web mobile usa shared-host attachment, e `baseServices` representa o bridge host atual; quando o próprio bridge atual é um host de workspace remoto WSL/SSH, `local*SyncService` e `remote*SyncService` podem apontar para o mesmo host remoto, sem conseguir satisfazer o invariante de sincronização "source é o diretório de usuário local do desktop, destination é o diretório de usuário remoto atual".

Por isso, esta versão oculta nas surfaces `web-remote-replayable` as entradas de sincronização remota de Skills/MCP/Plugins, sem criar um runtime de Agente, host local ou nova sessão remota independente para o mobile. Se o produto exigir posteriormente suporte a sincronização no mobile, será necessário injetar explicitamente o source service local do desktop pelo host attachment já existente, mantendo o destination como o service do workspace remoto atual.

## Verificação

- Testes unitários do helper de UI cobrem SSH e WSL exibindo a entrada de sincronização, e local e Docker não exibindo.
- Testes unitários do helper de UI cobrem a superfície Web remote ocultando a entrada de sincronização, evitando sincronização remota para si mesmo.
- A página de diretório após conexão bem-sucedida cobre a exibição do dropdown de sincronização no WSL.
- O formato do destino da sincronização de Skill cobre o rótulo WSL.
- Testes unitários do service cobrem o sucesso da pré-verificação de escrita remota e a falha quando o caminho de destino não é gravável.
- Testes unitários do diálogo de sincronização cobrem a proteção de fechamento em `preflighting` e o in-flight guard.
- Testes unitários do helper de pré-verificação de sincronização cobrem a convergência por timeout, evitando que um RPC remoto permanentemente pending trave o diálogo.
- Executar `pnpm typecheck` e `pnpm lint`.