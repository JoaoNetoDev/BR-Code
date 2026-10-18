# Menu de Zoom da Sidebar

## Contexto

O desktop já suporta zoom de página pelo menu View e por `Cmd/Ctrl + +/-/0`, com níveis internos em `[-3, 5]`, onde o multiplicador de cada nível é `1.1 ^ level`. O menu de avatar da sidebar já removeu antes a preferência antiga `zcode-zoom-level` no localStorage; depois, o menu leve restaurado apenas reaproveitava os comandos de zoom do sistema da janela atual, o que fazia com que, após o usuário ajustar pelo menu ou atalho, o próximo reinício voltasse ao tamanho padrão.

## Objetivo

- Exibir no menu de avatar da sidebar do desktop o submenu `Interface zoom`, que ao ser expandido contém os três comandos `Zoom In`, `Zoom Out`, `Actual Size`.
- Os itens do menu executam os existentes `DesktopCommandIds.ZoomIn` / `ZoomOut` / `ResetZoom` e salvam o nível de zoom do desktop, após o sucesso, como `AppSettings.desktopZoomLevel`.
- Na criação da janela principal, ler o nível salvo no main process e aplicá-lo primeiro em `BrowserWindow.webContents`, para que a primeira tela, a posição dos semáforo-macOS e a área de controles da barra de título do Windows usem a mesma fonte de verdade do zoom.
- O estado desabilitado do menu fica consistente com o menu View: no nível máximo `+5` o `Zoom In` fica desabilitado, no mínimo `-3` o `Zoom Out` fica desabilitado, e no nível padrão o `Actual Size` fica desabilitado.
- O renderer lê e assina o nível de zoom do desktop atual pela capacidade de plataforma, garantindo que o estado do menu da sidebar também seja sincronizado quando o atalho ou o menu superior forem acionados.

## Fora de escopo

- Não altera a capacidade de zoom do próprio navegador em Web / celular.
- Não altera a cadeia de restauração replayable do controle remoto Web, nem adiciona estado de zoom à cadeia de controle remoto.
- Não restaura a preferência antiga da página de configurações Interface zoom nem a leitura/escrita de `zcode-zoom-level` no localStorage.
- Não espalha a semântica de restauração replayable do controle remoto Web no celular para a cadeia principal continuous do desktop; a preferência de zoom afeta somente o BrowserWindow do desktop.

## Implementação

- `packages/shared/src/platform.ts` define `DesktopZoomState` e a capacidade de leitura/assinatura do zoom do desktop em `IPlatformService`.
- `packages/shared/src/channels.ts` acrescenta os canais de plataforma `GetDesktopZoomLevel` e `DesktopZoomLevelChanged`.
- `packages/shared/src/protocol.ts` e `packages/shared/src/validationAppSettings.ts` acrescentam `desktopZoomLevel`, permitindo configuração antiga sem o campo e aceitando o nível persistido na faixa `[-3, 5]`.
- O main do desktop envia o nível mais recente para a janela correspondente após o sucesso dos comandos de zoom, grava em `setting.json` e continua atualizando o estado desabilitado do menu View nativo.
- O main do desktop lê `AppSettings.desktopZoomLevel` na inicialização e passa o valor para o fluxo de criação da janela via `initialDesktopZoomLevel`.
- O preload do desktop mantém em cache o nível mais recente e fornece `getDesktopZoomLevel` / `onDesktopZoomLevelChanged`.
- `WorkspaceSidebarFooter` exibe o submenu `Interface zoom` somente quando `isDesktop` e reaproveita os textos de comando já existentes do menu View; o menu de avatar recupera a ordem original de exibição das preferências: `Language`, `App theme`, `Interface zoom`.
- A ordem dos itens de zoom visíveis no menu View nativo do sistema do desktop é mantida consistente com o submenu da sidebar: `Zoom In`, `Zoom Out`, `Actual Size`.

## Verificação

- Testes unitários cobrindo a gravação de `desktopZoomLevel` após o sucesso dos comandos de zoom e a aplicação do zoom persistido antes da criação da janela.
- `pnpm typecheck`
- `pnpm lint`