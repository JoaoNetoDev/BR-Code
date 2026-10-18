# System Zoom Shortcuts

## Contexto

O desktop havia removido as configurações de zoom de interface customizadas do ZCode para que os fatores de zoom históricos do `localStorage` continuassem afetando a primeira tela. Depois da remoção, o menu do aplicativo também deixou de conter o role de zoom de página nativo do Electron, o que impossibilitava que os atalhos de sistema mais usados, `Cmd/Ctrl + +/-/0`, redimensionassem o conteúdo da janela atual.

## Objetivos

- Restaurar os atalhos de zoom de página em nível de sistema no desktop.
- Usar comandos de desktop para receber `Cmd/Ctrl + 0/+/-` e limitar o nível de zoom de página da janela atual entre `-3` níveis de redução e `+5` níveis de ampliação.
- No macOS, ajustar sincronamente a posição vertical dos botões nativos vermelho/amarelo/verde no canto superior esquerdo após cada zoom e avisar o renderer para ajustar inversamente a área segura esquerda da camada superior flutuante; a largura dos três botões não muda com o zoom da página e a posição horizontal permanece temporariamente no valor inicial do sistema.
- Afetar apenas o zoom de página da janela atual do desktop, sem reintroduzir a página de configurações de UI, o item no menu de conta, o nível de zoom persistido nem uma API de plataforma dedicada.

## Fora de escopo

- Não restaurar a antiga preferência de zoom de interface em três níveis.
- Não ler nem gravar o `zcode-zoom-level` histórico.
- Não alterar a cadeia Web / controle remoto do celular; o celular continua usando a capacidade de zoom do próprio navegador e os limites de restauração replayable existentes.

## Implementação

- `packages/shared/src/desktopMenu.ts` ganha os textos de menu do desktop Actual Size, Zoom In e Zoom Out do menu View (View > Actual Size / Zoom In / Zoom Out).
- `packages/desktop/src/main/desktopApplicationMenu.ts` adiciona os accelerators `CmdOrCtrl+0`, `CmdOrCtrl+Plus` e `CmdOrCtrl+-` ao menu View e mantém um item oculto de fallback `CmdOrCtrl+=` para zoom in, a fim de compatibilizar diferentes layouts de teclado.
- Actual Size, Zoom In e Zoom Out do menu View têm seu estado de desabilitado definido conforme o nível de zoom da janela em foco: no tamanho padrão, Actual Size fica desabilitado; no máximo `+5`, Zoom In fica desabilitado; no mínimo `-3`, Zoom Out fica desabilitado. O item oculto de fallback `CmdOrCtrl+=` usa o mesmo estado de desabilitado de Zoom In.
- `packages/desktop/src/main/desktopCommandHandlers.ts` trata `ResetZoom`, `ZoomIn` e `ZoomOut` de forma unificada, lendo o `zoomFactor` atual e convertendo-o para o nível interno, chamando `webContents.setZoomFactor(1.1 ^ level)` e restringindo o nível de zoom ao intervalo `[-3, 5]`.
- O menu do aplicativo é atualizado após cada execução de um comando de zoom; o menu também é atualizado quando a janela principal recebe foco novamente, evitando que o menu do sistema mantenha estados de desabilitado antigos.
- `packages/desktop/src/main/desktopWindowButtonPosition.ts` reutiliza a posição inicial dos três botões do macOS `{ x: 24, y: 25 }`; o `x` horizontal permanece temporariamente em `24`, e o `y` vertical é calculado pelo deslocamento do zoom factor unificado `1.1 ^ level` multiplicado pelo ganho visual de acompanhamento de `1.5`, antes de aplicar `setWindowButtonPosition`; a camada superior flutuante recebe `leftPaddingPx` como `96 / zoomFactor`. O Windows não ajusta as coordenadas dos botões nativos, mas sincroniza `titleBarOverlay.height` como `48 * zoomFactor` para o nível de zoom atual, fazendo com que os botões minimizar/maximizar/fechar no canto superior direito continuem acompanhando o zoom; o renderer usa a geometria CSS `titlebar-area-*` do Window Controls Overlay como fonte de verdade da área segura direita e mantém `136 / zoomFactor` como fallback quando as variáveis de ambiente não estão disponíveis. A largura dos botões do caption desenhado manualmente é derivada da área segura real dividida pelos três botões nativos, evitando que diferenças de zoom ou de DPI façam o botão de dropdown entrar na área do botão minimizar. O Linux ainda não compensa a área dos botões nativos.
- `packages/desktop/src/main/desktopWindowChrome.ts` lê o `zoomFactor` atual imediatamente após a criação da janela e sincroniza a posição dos três botões do macOS; `packages/desktop/src/preload/index.ts` lê `webFrame.getZoomFactor()` de forma síncrona antes de o React assumir o root,ao mesmo tempo, armazena em cache a área segura da camada superior flutuante para o primeiro render de `RootStartupLoading` e, ao mesmo tempo, notifica o main via `WindowControlsOverlayReady` para redefinir cedo a posição dos três botões, evitando esperar a entrada na página do App para fazer o ajuste.
- `packages/desktop/test/desktopApplicationMenu.test.ts` verifica que o menu View encaminha os atalhos para os comandos de desktop controlados, e `packages/desktop/test/desktopCommandHandlers.test.ts` verifica os limites superior e inferior do zoom.