# Callback de Deep Link do AppImage no Linux

## Contexto

Os pacotes de instalação `.deb` / `.rpm` do Linux registram o protocolo `zcode://` por meio de uma entrada desktop de nível de sistema, e o callback de login volta de forma estável ao app instalado. O AppImage executado diretamente não tem um ponto de entrada fixo de instalação, então o ZCode grava, na inicialização, o `~/.local/share/applications/zcode.desktop` de nível de usuário, para que o `zcode://...` após o login no navegador possa ser entregue ao AppImage atual (desde que não exista uma entrada de sistema com o mesmo ID, veja "Coexistência com a instalação do sistema" abaixo).

Em um ambiente Ubuntu 24.04 + NVIDIA, o usuário verificou que: ao iniciar o AppImage manualmente com argumentos como `--no-sandbox`, `--disable-gpu` e `--use-gl=swiftshader`, a janela e a página de login abrem normalmente; mas depois que o callback do navegador dispara o `.desktop Exec`, o sistema inicia o AppImage novamente pelo caminho cru, sem esses argumentos, e o processo quebra na fase de inicialização do sandbox/GPU do Electron, deixando o app sempre em "aguardando o callback do navegador".

## Esquema

- usar a variável de ambiente `APPIMAGE` como executável do handler de protocolo somente no cenário AppImage; pressuposto: não existe entrada de sistema com o mesmo ID (quando existe, a escrita em nível de usuário é ignorada, veja "Coexistência com a instalação do sistema").
- no cenário AppImage, manter no `process.argv` atual um pequeno conjunto de flags de inicialização seguras que afetam o sucesso da inicialização do Electron/Chromium e gravá-las no `.desktop Exec`.
- `.deb`, modo de desenvolvimento e instalação por binário comum continuam gravando o executável cru, sem copiar o argv atual.
- não persistir a URL de deep link, caminho de workspace, porta de depuração, diretório de dados do usuário nem outros parâmetros pontuais ou sensíveis.

Flags atualmente permitidas para persistência:

- `--no-sandbox`
- `--disable-gpu`
- `--disable-software-rasterizer`
- `--use-gl=...`
- `--use-angle=...`
- `--disable-features=...`
- `--enable-features=...`

## Coexistência com a instalação do sistema (rpm/deb)

A entrada desktop de nível de usuário sempre tem precedência sobre a entrada de sistema com o mesmo ID na resolução XDG (`~/.local/share/applications` antes de `/usr/share/applications`). Historicamente, o `zcode.desktop` de nível de usuário escrito por um AppImage antigo continuava sombreando `/usr/share/applications/zcode.desktop` depois que o usuário migrava para rpm/deb, fazendo com que atalhos e callbacks `zcode://` continuassem apontando para o AppImage antigo (enquanto o arquivo existisse) ou falhassem diretamente (depois que o arquivo fosse removido). Por isso, a lógica de registro funciona com a seguinte prioridade:

1. Na inicialização, o `zcode.desktop` de nível do sistema é detectado conforme `XDG_DATA_DIRS` (padrão `/usr/local/share:/usr/share`); **precisa ser um arquivo comum** para ser considerado uma entrada de sistema válida.
2. **Quando existe entrada de nível de sistema**: o AppImage em execução não grava mais a entrada de usuário de mesmo nome nem o ícone de usuário, evitando sombrear novamente a instalação do sistema; formas de instalação de sistema como rpm/deb, quando executadas, limpam as entradas de usuário remanescentes escritas por este app. A identificação de titularidade depende da linha de marcação `Comment=ZCode Desktop App` — somente entradas com essa marcação são removidas, e um `zcode.desktop` personalizado escrito pelo usuário (sem marcação, com leitura falha ou sem titularidade confirmável) é sempre preservado.
3. **Quando não existe entrada de nível de sistema**: o comportamento original de registro de usuário do AppImage permanece inalterado.

Falhas de limpeza e de leitura apenas registram um `warn` degradado e não bloqueiam o registro de protocolo por `update-desktop-database` / `xdg-mime`.

## Limites

Esta alteração corrige apenas a perda de argumentos no segundo início do callback de protocolo do AppImage, sem alterar o roteamento de state do OAuth, o encaminhamento de instância única nem a semântica de registro de protocolo do `.deb`. Se o ambiente do usuário ainda precisar de `chrome-sandbox` SUID ou `libfuse2`, a documentação de instalação precisa tratar disso separadamente.