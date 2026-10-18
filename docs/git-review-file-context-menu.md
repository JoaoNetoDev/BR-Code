# Especificação do menu de contexto de arquivo do Git Review

## Contexto

As linhas de arquivo do painel de revisão do Git hoje só podem expandir o diff. Ao revisar um
arquivo, o próximo passo comum do usuário é localizar o arquivo real, copiar o caminho ou voltar
à árvore de arquivos à esquerda para ver onde ele fica no workspace. A árvore de arquivos já
oferece capacidades equivalentes; esta mudança conecta as mesmas operações de arquivo às linhas
de arquivo da revisão do Git.

## Comportamento do usuário

- Ao clicar com o botão direito em uma linha de arquivo da revisão do Git, exibe-se um menu de
  contexto.
- O menu contém: mostrar no gerenciador de arquivos do sistema, copiar caminho do arquivo, mostrar
  na árvore de arquivos.
- Clicar na própria linha do arquivo mantém o comportamento atual de expandir/recolher o diff.

## Limites de módulo

- `GitPaneChangeCard` é responsável apenas por exibir a linha do arquivo e o menu, sem acessar
  diretamente o Electron, `window.zcode` ou o estado da árvore de arquivos.
- `GitPane` é responsável por resolver `GitPaneFileChange` no alvo da ação de arquivo, incluindo
  caminho absoluto, caminho relativo ao workspace e estado deleted.
- As ações genéricas de arquivo são encapsuladas em um hook de UI que trata de forma unificada
  clipboard, gerenciador de arquivos do sistema, logs e toast.
- `WorkspaceShellLayout` recebe apenas a intent de "mostrar na árvore de arquivos" e reaproveita o
  `fileTreeOpenRequest` existente para abrir a árvore de arquivos à esquerda.
- As capacidades de plataforma continuam passando por `IPlatformService`; a camada de UI não
  chama o preload do desktop diretamente.
- A capacidade de "gerenciador de arquivos do sistema" é passada explicitamente pela camada
  superior como um bit de capacidade do desktop local, e o hook soma a ela a verificação de
  workspace remoto / estado deleted, evitando que o Web comum ou o Web mobile acionem
  inadvertidamente o caminho do gerenciador de arquivos local.

## Regras de caminho

- O caminho usado nas operações reais de arquivo é `change.path`; se não for absoluto, ele é
  concatenado com `workspacePath`.
- "Mostrar no gerenciador de arquivos do sistema" abre o diretório pai para alvos de arquivo e o
  próprio diretório para alvos de diretório; não passar o caminho do arquivo diretamente para a
  lógica de abertura padrão do sistema.
- O caminho exibido continua usando `change.workspaceRelativePath`.
- A semântica de isolamento de workspace segue `workspaceIdentity?.trim() || workspacePath`, sem
  tratar a identity como um caminho de arquivo real.

## Limites de plataforma

- Desktop local no macOS exibe "Abrir no Finder".
- Desktop local no Windows exibe "Abrir no Explorer".
- Desktop local no Linux exibe "Abrir no gerenciador de arquivos".
- Web comum, controle remoto Web mobile e workspace remoto desabilitam o item do gerenciador de
  arquivos do sistema, mantendo apenas copiar caminho e localização na árvore de arquivos; a
  desabilitação não pode depender apenas de `workspaceRemoteSessionId`, sendo também necessário
  exigir que o bit de capacidade do desktop local seja true.
- Arquivos deleted mantêm copiar caminho e localização na árvore de arquivos, mas têm o item do
  gerenciador de arquivos do sistema desabilitado, evitando tentar abrir um arquivo local que não
  existe mais.

## Verificação

- Desktop local: clicar com o botão direito na linha do arquivo permite copiar o caminho, mostrar
  no gerenciador de arquivos e navegar até a árvore de arquivos.
- Workspace remoto / controle remoto Web: o item do gerenciador de arquivos do sistema está
  desabilitado, e copiar caminho e localização na árvore de arquivos funcionam.
- Caminhos profundos: a árvore de arquivos deve expandir automaticamente o diretório pai e rolar
  até o arquivo alvo.
- Executar `pnpm typecheck` e `pnpm lint`.