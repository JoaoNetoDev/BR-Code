# Distintivo de ícone da versão Dev

## Contexto

Ao rodar a versão de desenvolvimento (`pnpm dev:desktop`) e a versão oficial do ZCode simultaneamente na máquina
local, os dois ícones do Dock são idênticos, impossibilitando diferenciá-los.

## Solução

Quando o app não está empacotado (`!app.isPackaged`), o processo principal sobrepõe ao ícone do aplicativo uma fita
diagonal azul com "DEV" em branco no canto superior esquerdo, durante a etapa de inicialização:

- renderização: `renderDevBadgeIcon()` em `packages/desktop/src/main/devIconBadge.ts`
  - lê `build/icon.png` (no Windows, `icon_windows.png`)
  - compõe com `sharp` diretamente: `buildDevRibbonSvg(size)` gera um SVG de fita "DEV" branca sobre fundo azul,
    girada em -45°, com parâmetros geométricos escalados proporcionalmente ao tamanho do ícone
  - a espessura da fita usa 19,9% do tamanho do ícone e o texto usa 15,2%, cerca de 20% maiores no total em
    relação à versão anterior
  - o centro de rotação fica a 24% do tamanho do ícone; ao ampliar, a fita também se desloca para baixo e para a
    direita, preservando uma área preta mais visível da imagem original no canto superior esquerdo
  - a fita é primeiro composta com `composite` sobre a imagem original e depois recortada usando a própria imagem
    original como máscara `dest-in`, de modo que a fita siga o contorno arredondado do ícone sem transbordar para os
    cantos transparentes
  - o PNG resultante é convertido em `nativeImage`, todo o processo em memória, sem gravação em disco
  - qualquer falha em uma etapa gera um log de warning e retorna `null`, com fallback para o ícone original, sem
    afetar a inicialização
  - a implementação inicial usava um `BrowserWindow` offscreen oculto + renderização em canvas (dependia do ciclo de
    vida da janela/polling/timeout, mais lento e frágil); como o desktop já depende de `sharp` diretamente, a
    composição apenas de imagem ficou mais simples e confiável
- pontos de aplicação (`packages/desktop/src/main/index.ts`):
  - Dock do macOS: `applyAppIcon(devBadgeIcon ?? iconPath)` (`applyAppIcon` já aceita um `NativeImage` diretamente)
  - ícone da janela em Windows/Linux: a janela principal é criada por
    `createWindowInstance()` → `createWindow()` → `createBrowserWindow()`, e o parâmetro `iconPath` foi estendido para
    `string | NativeImage`; em dev passa-se `devBadgeIcon ?? iconPath`, de modo que a barra de tarefas / barra de
    título exiba o distintivo DEV; a janela de status de atualização também usa a imagem com distintivo
- a versão empacotada não passa por essa lógica; o ícone permanece inalterado.

## Testes

- `packages/desktop/test/devIconBadge.test.ts`: contrato do SVG da fita (rotação diagonal, fundo azul, escala
  proporcional, posicionamento no canto superior esquerdo); caminho de sucesso de `renderDevBadgeIcon`, falha de
  leitura e fallback com imagem vazia
- `packages/desktop/test/desktopWindowChrome.test.ts`: `applyAppIcon` usando diretamente o `NativeImage` passado;
  `createBrowserWindow` repassando o ícone `NativeImage` para `BrowserWindow.icon` (rede de proteção contra regressão
  do distintivo da janela principal em Windows/Linux)
