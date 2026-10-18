# Aviso de abertura de workspace UNC do WSL

## Contexto

Usuários do Windows podem abrir diretamente, pelo seletor de diretórios do sistema, caminhos UNC do WSL como `\\wsl.localhost\Ubuntu\home\...` ou `\\wsl$\Ubuntu\home\...`. Esses caminhos podem ser acessados pelas APIs de arquivo do Windows, mas, se abertos como workspace local, o Agent / Bash / terminal rodarão no ambiente do host Windows, e não no ambiente Linux do WSL.

Isso causa os seguintes problemas:

- Os comandos precisam entrar no WSL repetidamente de forma indireta via PowerShell / Git Bash / `wsl.exe`, o que facilmente gera problemas de aspas e escape de caminhos.
- Ferramentas como `git`, `node`, `npm`, `live-server` resolvem o PATH do Windows, e não o PATH Linux dentro do WSL.
- A sintaxe de variáveis de ambiente do PowerShell é diferente da do Bash, e o usuário acaba usando `$FOO` / `FOO=bar command` por engano no shell do Windows.

## Design

Quando o caminho local escolhido pelo usuário corresponde ao prefixo UNC do WSL, o ZCode não troca automaticamente para o workspace WSL remoto. A troca automática altera o ambiente de execução dos comandos, as chaves de isolamento de configuração e o ciclo de vida da sessão remota, o que caracteriza uma decisão que exige confirmação do usuário.

O comportamento correto é avisar o usuário:

1. Recomendar que o workspace seja aberto por "远程连接 -> WSL" ("Conexão remota -> WSL"), para que os comandos sejam executados no ambiente Linux do WSL.
2. Após a confirmação do usuário, apenas invocar o diálogo de conexão remota com o WSL pré-selecionado, sem conectar automaticamente e sem converter o caminho.
3. Se o usuário cancelar ou fechar o aviso, continuar abrindo pelo caminho UNC original como workspace local.

## Superfície de impacto

- Afeta apenas a entrada de abertura local de workspace do desktop.
- Não altera os workspaces remotos WSL existentes, nem as cadeias SSH, Docker ou de controle remoto Web.
- Não altera a possibilidade de abrir caminhos `\\wsl.localhost`; o usuário ainda pode optar por continuar abrindo pelo caminho.

## Pontos de verificação

- `\\wsl.localhost\Ubuntu\home\user\repo` e `\\wsl$\Ubuntu\home\user\repo` disparam o aviso.
- Caminhos comuns do Windows e caminhos UNC de compartilhamento de rede não disparam o aviso.
- Após escolher a ação recomendada, o diálogo de conexão remota é aberto com o WSL pré-selecionado.
- Após escolher continuar pelo caminho, o fluxo original de abertura de workspace local continua sendo chamado.