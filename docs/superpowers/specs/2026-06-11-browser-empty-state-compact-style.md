# Estilo Compacto do Empty State do Browser

## Contexto

O browser embutido exibe um estado vazio quando ainda não houve navegação. O estilo original usava um ícone grande e um tamanho de título grande, o que ficava pesado demais no workspace de alta densidade do painel à direita.

## Objetivo

- O logo do estado vazio do browser usa `size-16`, para não sobrepor a hierarquia da barra de endereço e do conteúdo do painel.
- O ícone usa `foreground` com `opacity-30` sobreposto, reduzindo o peso visual ao mesmo tempo que herda a cor primária do tema.
- Entre o ícone e o título, usar `mb-6`, mantendo o empty state compacto sem ficar apertado.
- O tamanho de fonte do título principal é `text-sm`, compatível com o nível de título do workspace.
- O texto explicativo secundário é fixo em `13px`, em conformidade com a regra de texto auxiliar do Design System.

## Escopo

- Ajustar o estilo visual do `BrowserEmptyState` em `packages/ui/src/EmbeddedBrowserPaneParts.tsx`.
- O momento de criação do webview da tab human em branco entra neste spec; isso não altera o resultado da navegação, o handshake do agent guest, o caminho de controle remoto nem o ciclo de vida persistente de um guest já criado.

## Limites de criação do guest na página vazia (complemento de 2026-08-17)

- Uma human browser tab criada pelo usuário e ainda sem navegação confirmada renderiza apenas o estado vazio e não cria `<webview>` com `src="about:blank"`. O Electron guest usa uma superfície de composição independente, e a criação sincronizada desenharia um primeiro frame branco antes que a máscara e os estilos ocultos do React sejam aplicados.
- O rascunho na barra de endereço não dispara a criação do guest; apenas confirmar com Enter, uma URL inicial ou uma requisição de navegação externa dispara a criação.
- O estado vazio human que ainda não pediu a criação do guest mostra diretamente o ícone Globe, sem interpretar `isReady=false` como carregando; o spinner só aparece quando a criação do guest já foi pedida e ele ainda não está ready.
- A URL anterior à criação do guest continua enfileirada via `pendingUrlRef` e, após o `dom-ready`, o novo guest assume o `loadURL`. Depois de criado, o guest permanece montado e não é reconstruído por mudanças de estado vazio ou de visibilidade.
- As tabs de agent/browser-use continuam precisando criar e reportar o guest antes da primeira navegação, caso contrário o main esperaria o attach e o primeiro browser command, formando uma espera circular. O residency restore também mantém a montagem imediata.

```text
human tab em branco -> estado vazio -> confirmar navegação -> criar guest -> dom-ready -> loadURL
tab agent/restore -> criar guest -> did-attach -> main assume/restaura
```

## Verificação

- Testes unitários cobrem a human tab em branco inicialmente sem webview, o rascunho sem webview e a criação e o consumo da navegação após o Enter.
- Testes unitários cobrem o estado vazio sem guest criado mostrando Globe em vez de spinner.
- Testes unitários cobrem a agent tab ainda reportando o guest antes da primeira navegação.
- O E2E oficial do Electron `browser-empty-state-deferred-guest.test.ts` cobre o ciclo de vida real da human tab: ao criar uma tab vazia, nem o DOM do renderer nem o `webContents` do main têm guest; digitar na barra de endereço sem pressionar Enter mantém o estado vazio; após o Enter, apenas um guest é criado, consumindo a URL de navegação pendente e exibindo a página.
- Executar `pnpm typecheck`.
- Executar `pnpm lint`.