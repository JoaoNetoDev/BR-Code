# Abrir arquivos do workspace remoto com um aplicativo local

## Contexto

O `workspacePath` de um workspace remoto WSL representa um caminho Linux dentro do WSL, por exemplo `/home/user/repo`. Esse caminho precisa continuar sendo entregue ao host / agent / terminal remotos, e não pode ser reescrito como caminho UNC antecipadamente por causa dos aplicativos de desktop do Windows, sob pena de poluir a semântica de execução remota e a identidade do workspace.

Porém a entrada “Open in Editor” da barra de título do desktop roda no main process do Windows. Se `/home/user/repo` for passado diretamente para o VS Code ou o Explorador de Arquivos do lado Windows, o host o tratará como um caminho local, fazendo a abertura falhar ou abrir o lugar errado.

## Design

- Ao abrir VS Code / VS Code Insiders a partir de um workspace remoto WSL, o main process constrói a URI Remote-WSL do VS Code: para diretórios usa `--folder-uri`, para arquivos usa `--file-uri`.
- Ao abrir o Explorador de Arquivos do Windows a partir de um workspace remoto WSL, o main process converte temporariamente o caminho Linux em um caminho UNC candidato apenas na fronteira de plataforma: prioriza `\\wsl.localhost\<distro>\...` e, em caso de falha, faz fallback para `\\wsl$\<distro>\...`; para arquivos usa `/select,` para posicionar, e diretórios são abertos diretamente.
- Não há suporte para passar caminhos Linux do WSL diretamente a outros editores locais. A UI só exibe VS Code / VS Code Insiders / Explorador de Arquivos, evitando que aplicativos nativos como Cursor, JetBrains ou Terminal usem por engano caminhos Linux.
- Se o target WSL estiver sem distro, o main process resolve a distribuição padrão via `wsl.exe -l -v --all`; só quando a resolução falha é devolvido um erro explícito, sem fallback para passar o caminho Linux cru.
- Para arquivos remotos via SSH são exibidos apenas VS Code / VS Code Insiders, que suportam URI Remote-SSH; targets sem mapeamento de caminho local confiável, como Docker, não exibem editores nativos, evitando tratar um Linux path como caminho local.
- Links Markdown em conversas, Assistant Preview Card, resumo de alterações e pré-visualização de Diff devem carregar simultaneamente `workspacePath`, `workspaceIdentity` e `workspaceRemoteSessionId`. O casamento do target remoto usa identity/session para eliminar a ambiguidade entre remotos com o mesmo caminho; a exibição do caminho e a execução continuam usando `workspacePath`.
- Links Markdown só podem usar uma barra final explícita `/` como dica de exibição de diretório, e não podem deduzir o tipo de sistema de arquivos pela extensão. A ação “abrir com” deve primeiro executar um `stat` pelo serviço de arquivos do workspace scope atual, e então passar o `file/directory` real como `pathKind` para o main process; quando não for possível confirmar o tipo, o editor local não pode ser chamado. Diretórios usam `--folder-uri` ou abrem o Explorer diretamente; arquivos usam `--file-uri` ou o `/select,` do Explorer.
- As ações de gerenciador de arquivos na árvore de arquivos do workspace, nos arquivos alterados da área de revisão e nos menus de projeto/tarefa devem reutilizar o mesmo resultado de resolução do target remoto. Somente um casamento exato com um target WSL permite chamar o Windows Explorer; a área de revisão e os menus de projeto mantêm a semântica de “abrir diretório”, passando `pathKind: "directory"`. SSH e Docker não abrem a entrada do gerenciador de arquivos local.
- O fallback de editor gerado pelo filtro de capacidades remotas vale apenas para a interface atual e não pode sobrescrever a preferência global de editor do usuário; só é permitido persistir quando o usuário escolher explicitamente um editor.

## Superfície de impacto

- A conversão de caminhos por plataforma ocorre apenas no desktop: WSL usa URI Remote-WSL/UNC e SSH usa URI Remote-SSH; Web e mobile continuam sem iniciar aplicativos locais diretamente.
- O filtro de capacidades da UI e o workspace scope atravessam simultaneamente WSL, SSH, Docker e workspaces locais comuns. O Docker falha de forma fechada por não ter um mapeamento confiável de caminho do host.
- Workspaces locais comuns continuam abrindo por caminho local, sem exigir `workspaceIdentity`.
- As ações de gerenciador de arquivos no Windows nativo, macOS e Linux continuam passando pelas implementações de plataforma já existentes; o branch de WSL só vale quando a identidade remota é resolvida com precisão como WSL.
- Não altera a semântica de remote host, agent, terminal, controle remoto Web, task realtime ou workspace identity.