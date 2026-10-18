# Capacidade de Navegador Embutido na Web

## Contexto

Atualmente a aba "Navegador" do side pane à direita depende do `webview` do Electron, adequada ao desktop. O app Web e
o controle remoto mobile rodam em um ambiente de navegador comum, e esta versão não suporta a aba de navegador
embutido nem deve exibir a entrada que a criaria.

O projeto já tem um limite semelhante: ao abrir um workspace na Web, `preferDirectoryBrowser` leva a uma UI de
seleção de diretório implementada pelo próprio projeto; no desktop continua sendo usado o seletor de diretórios do
sistema via `platform.selectDirectory()`. A capacidade de navegador também deve usar um limite de capacidade de
plataforma semelhante, em vez de verificações dispersas em um único botão.

## Objetivos

- O Electron desktop continua exibindo e suportando a aba "Navegador" à direita.
- O app Web / o controle remoto mobile não exibem a entrada da aba "Navegador".
- O centro de comandos não registra comandos de navegador como `toggle-preview` e `add-browser-tab`.
- O callback de criação de browser tab profundo não cria side pane browser tab em shells que não suportam navegador
  embutido.
- Cliques comuns em links externos continuam podendo abrir em nova aba do navegador Web, o que não equivale à
  funcionalidade de navegador embutido do ZCode.

## Cadeia de estado

```text
Root platform props
  |
  |-- Desktop: supportsEmbeddedBrowser = true
  |       |
  |       |-- QuickPick registers browser commands
  |       |-- Side pane launcher/menu shows Browser
  |       |-- useAppPanels creates browser side pane tabs
  |
  `-- Web / mobile: supportsEmbeddedBrowser = false
          |
          |-- QuickPick omits browser commands
          |-- Side pane launcher/menu omits Browser
          |-- useAppPanels ignores browser tab creation requests
          `-- URL opening falls back to browser window.open
```

## Superfície afetada

- `packages/ui/src/root/types.ts`: props de Root/App ganham o interruptor de capacidade de navegador embutido.
- `packages/ui/src/App.tsx`: passa a capacidade ao quick pick, ao hook de painéis e ao layout do shell.
- `packages/ui/src/hooks/useAppPanels.ts`: bloqueia a criação do browser side pane quando não suportado.
- `packages/ui/src/quickpick/quickPickCommands.ts`: registra comandos conforme a capacidade.
- `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`: renderiza os itens de menu open-tab e de adicionar aba conforme a
  capacidade.
- `packages/web/src/main.tsx`: a entrada raiz da Web declara explicitamente `supportsEmbeddedBrowser={false}`.

## Verificação

- testes unitários cobrem que o quick pick não exibe comandos de browser quando o navegador embutido não é suportado.
- testes unitários cobrem que o launcher open-tab do side pane não retorna a entrada de browser quando o navegador
  embutido não é suportado.
- executar `pnpm typecheck`.
- executar `pnpm lint`.
