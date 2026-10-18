# Integração do ícone de desktop do AppImage para Linux

## Contexto

A execução direta de um AppImage no Linux não grava arquivos `.desktop` de sistema nem o tema de ícones hicolor de forma tão estável quanto um pacote deb. Alguns ambientes de desktop não dependem apenas do `BrowserWindow.icon` do Electron na barra de tarefas/Dock: eles também combinam o `Icon` e o `StartupWMClass` do `.desktop` com as janelas em execução, de modo que a execução direta do AppImage pode exibir o ícone padrão.

## Objetivo

- Melhorar apenas a experiência de execução direta do AppImage no Linux, sem afetar deb, Windows, macOS, desenvolvimento local e o caminho de controle remoto.
- Atualizar o `zcode.desktop` de nível de usuário na inicialização, para que o retorno do protocolo `zcode://` continue apontando para o caminho atual do AppImage — a escrita em nível de usuário só ocorre quando não existe um arquivo regular `zcode.desktop` de sistema em `XDG_DATA_DIRS` (padrão `/usr/local/share:/usr/share`); quando existe uma entrada de sistema (rpm/deb já instalado), a escrita de usuário e a instalação do ícone são ignoradas para não sombrear a instalação do sistema. Nessa forma de instalação pelo sistema, ainda são limpas as entradas de usuário remanescentes marcadas com `Comment=ZCode Desktop App` (veja os detalhes em `docs/desktop/linux-appimage-deep-link.md`).
- Instalar na inicialização o PNG 512x512 incluído no pacote no tema de ícones hicolor de nível de usuário, aumentando a chance de `Icon=zcode` ser reconhecido pela barra de tarefas/Dock.

## Implementação

Na inicialização no estado empacotado para Linux, `registerDeepLinkProtocol` recebe o caminho do ícone 512x512 atualmente incluído no pacote. `registerLinuxDeepLinkProtocol` prioriza `XDG_DATA_HOME` ao resolver o diretório de dados do usuário e, caso não esteja definido, faz fallback para `~/.local/share`. A escrita só é feita quando a variável de ambiente `APPIMAGE` é detectada, o arquivo de origem do ícone existe e não há um arquivo regular `zcode.desktop` de sistema em `XDG_DATA_DIRS`:

```text
$XDG_DATA_HOME/icons/hicolor/512x512/apps/zcode.png
$XDG_DATA_HOME/applications/zcode.desktop
```

Após a escrita, a atualização é feita no formato best-effort:

```text
gtk-update-icon-cache -f -t $XDG_DATA_HOME/icons/hicolor
update-desktop-database $XDG_DATA_HOME/applications
xdg-mime default zcode.desktop x-scheme-handler/zcode
```

Se os comandos de atualização não existirem, falharem ou excederem o tempo limite, apenas registra-se um `warn`. Comandos externos devem ter um timeout curto; `gtk-update-icon-cache` deve ser pulado quando o ícone não mudou, e a inicialização do aplicativo não pode ser bloqueada de forma ilimitada.

O registro principal do deep link precisa acontecer antes da instalação do ícone. A instalação do ícone é uma integração de desktop opcional: falhas na criação de diretórios, leitura de arquivos, cópia ou atualização do cache só podem ser registradas como `warn` em modo degradado, sem bloquear a escrita do `.desktop` nem a associação de protocolo via `xdg-mime`.

## Limites

Essa capacidade não garante que todos os ambientes de desktop do Linux exibam o ícone na barra de tarefas em 100% dos casos. Wayland/X11, GNOME/KDE/outros Docks, o usuário executando o AppImage direto do terminal e as estratégias de cache de ícones influenciam o resultado da combinação. Quando for necessária uma integração de desktop estável, o pacote deb continua sendo o caminho recomendado.