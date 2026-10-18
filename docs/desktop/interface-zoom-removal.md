# Remoção do Zoom de Interface

## Contexto

O ZCode já ofereceu três níveis de zoom de interface: menor, normal e maior. Os pontos de entrada incluíam atalhos do menu View do desktop, a página de configurações e o menu de conta da barra lateral, com o zoom da janela atual persistido por meio de `localStorage` e do `webFrame` / `webContents` do Electron.

## Objetivos

- Remover a funcionalidade de zoom de interface visível ao usuário.
- Remover a lógica de restauração de `zcode-zoom-level` na inicialização, evitando que fatores históricos continuem afetando a primeira tela.
- Remover Actual Size / Zoom In / Zoom Out do menu View do desktop e seus atalhos correspondentes.
- Remover o ponto de entrada de zoom de interface na página de configurações da UI e no menu de conta da barra lateral.
- Remover as APIs em platform/preload/web fallback dedicadas ao zoom de interface.

## Não objetivos

- Não remover o comportamento de zoom/maximize/fullscreen dos botões verdes de janela do sistema macOS.
- Não remover o zoom com semântica própria em componentes como canvas de negócio, grafo, PDF, documentos ou animações.
- Não migrar nem limpar ativamente a chave `zcode-zoom-level` de `localStorage` histórico na máquina do usuário; depois que o código deixa de lê-la, ela deixa de ter efeito naturalmente.

## Superfície de Impacto

- Desktop: o menu do aplicativo não registra mais atalhos de zoom de interface, e o processo main não processa mais os comandos de desktop `resetZoom` / `zoomIn` / `zoomOut`.
- Web/celular: eram apenas fallbacks no-op, e a remoção não altera o caminho de controle remoto.
- Camada de UI: a página de configurações e o menu de conta da barra lateral não exibem mais o zoom de interface.

## Complemento posterior

- `docs/desktop/system-zoom-shortcuts.md` restaurou os atalhos de zoom controlados das páginas do sistema. Ele oferece apenas o zoom da janela atual com `Cmd/Ctrl + +/-/0`, limitado a 5 níveis acima e abaixo do tamanho padrão, sem restaurar as configurações de zoom de interface persistidas antigas nem os pontos de entrada na UI.