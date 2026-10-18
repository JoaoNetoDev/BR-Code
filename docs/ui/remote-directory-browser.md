# Navegador de diretórios remoto

A página de seleção de diretórios após uma conexão remota bem-sucedida reutiliza o `DirectoryBrowser`, navegando pelo sistema de arquivos remoto por meio do `systemService` e do `fileService` da sessão de workspace remoto atual.

## Caminho inicial

- Ao entrar pela primeira vez na página de seleção de diretórios, o `DirectoryBrowser` chama o `systemService.info()` do conjunto de serviços atual.
- O caminho inicial usa o `homedir` retornado. Para o usuário SSH `root`, normalmente é `/root`; para usuários comuns, normalmente é `/home/<user>`.
- O campo de entrada de caminho exibe e envia caminhos absolutos remotos, nunca caminhos da máquina local.

## Exibição de diretórios

- O conteúdo do diretório é lido sob demanda para o caminho atual por meio de `fileService.readdir({ path })`.
- A página de seleção de diretórios exibe apenas entradas com `type === "directory"`; arquivos não aparecem na lista.
- Symlinks de diretório são resolvidos pela camada de serviço conforme o tipo do alvo; quando o alvo do symlink é um diretório, retornam `type === "directory"`, e portanto precisam ser exibidos e podem ser acessados pela página.
- Symlinks de diretório alteram apenas o ícone da lista: quando `isSymbolicLink === true`, exibe-se o ícone de diretório de symlink, mas o comportamento de clique e seleção continua sendo o de diretório.
- `..` é a entrada de retorno ao nível superior oferecida pela UI, e não uma entrada real retornada por `readdir`.
- Quando não há diretórios exibíveis após o filtro, mostra-se "无子目录" ("Sem subdiretórios").

## Diretórios ocultos

- Por padrão se mantém o comportamento antigo: sem passar `includeHidden`, ocultando diretórios com ponto como `.ssh`, `.config`, `.cache`, para evitar excesso de ruído na visão inicial do home remoto.
- A área de entrada do diretório oferece o botão "显示隐藏目录" ("Mostrar diretórios ocultos").
- Depois que o usuário ativa a opção, o caminho atual é relido como `fileService.readdir({ path, includeHidden: true })`.
- Uma vez ativada, apenas os diretórios ocultos passam a ser exibidos; arquivos ocultos continuam sendo filtrados pela página de seleção, mesmo que sejam retornados pela camada de serviço.
- Depois que o usuário desativa, o caminho atual é relido pela regra padrão e os diretórios ocultos ficam invisíveis novamente.

## Escopo

- A funcionalidade altera apenas a exibição da UI do `DirectoryBrowser` e os parâmetros de `fileService.readdir`.
- Não altera nenhuma semântica de conexão remota, remote workspace session, workspace identity, task realtime stream, desktop continuous ou web remote replayable.