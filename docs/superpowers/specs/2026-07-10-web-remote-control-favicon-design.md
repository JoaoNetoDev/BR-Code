# Design do ícone de aba do navegador no Web Remote Control

## Contexto

Quando o celular abre a página do Web Remote Control pelo navegador, a aba exibe o ícone padrão do navegador. A causa raiz é que `packages/web/index.html` define apenas o título da página e não declara favicon; também não há favicon da marca ZCode em `packages/web/public`.

O `pnpm dev:web-remote-control` local tem ainda um problema adicional: em alguns cenários de dev, o Chrome não emite requisições de rede separadas para o favicon e depende apenas dos metadados de ícone já disponíveis no HTML de entrada. Oferecer apenas os recursos estáticos `/favicon.ico` ou `/remote/favicon.ico` não cobre esse caso.

## Objetivo

- A página do Web Remote Control exibe o ícone ZCode, consistente com o do App desktop, nas abas de navegadores desktop e móveis mais comuns.
- Reutilizar diretamente o ícone existente do App desktop, sem redesenhar o ativo de marca.
- Não alterar a cadeia continuous do desktop, a cadeia replayable do celular nem qualquer estado de negócio do controle remoto.

## Não objetivos

- Não adicionar manifesto PWA.
- Não adicionar Apple Touch Icon específico para "Adicionar à Tela de Início" nem ícone Android.
- Não modificar o título da página, a tela de abertura, o tema ou outra UI.

## Design

O ícone multi-tamanho do desktop `packages/desktop/build/icon.ico` é copiado literalmente como `packages/web/public/favicon.ico`, mantido para o caminho tradicional de favicon e para o artefato de build. Ao mesmo tempo, o pequeno ícone PNG do App existente é embutido no `<head>` de `packages/web/index.html`:

```html
<link rel="icon" type="image/png" href="data:image/png;base64,..." sizes="32x32" />
```

O ICO foi escolhido porque o arquivo existente já contém vários tamanhos e o navegador pode escolher a camada adequada conforme a densidade de exibição da aba; copiar para o diretório `public` do Web permite que o Vite sirva esse recurso estático tanto no dev quanto no build de produção. O uso de data URL no HTML de entrada cobre o cenário em que o Chrome em dev não emite requisição de rede do favicon, fazendo o navegador obter o ícone já ao analisar o HTML. O data URL vem de `public/logo/icons/32x32.png`, cujo `icon.ico` do conjunto de ícones é binariamente idêntico ao `packages/desktop/build/icon.ico` do desktop.

O script local `dev:web-remote-control` continua usando o root base do Vite, para preservar o comportamento existente da rota SPA `/remote`; caso contrário, o Vite interceptaria `/remote` como página de aviso de base URL.

## Verificação

- Adicionar asserções de regressão no `packages/web/test/webRemoteControlBootstrapShell.test.ts` existente, confirmando que o HTML de entrada embute o favicon data URL de `public/logo/icons/32x32.png`.
- Asserir que o favicon do Web é binariamente idêntico ao ICO do App desktop, evitando o uso acidental do ícone genérico de mesmo nome nos Material Icons.
- Nos testes de build scripts da raiz, asserir que `dev:web-remote-control` continua iniciando o Vite com root base, cobrindo o cenário local de link copiado.
- Executar os testes direcionados do Web, `pnpm typecheck` e `pnpm lint`.
- Executar um build do Web com base não raiz e confirmar que o HTML de saída mantém o favicon data URL independente de base e que o arquivo tradicional `favicon.ico` entra no artefato de build.

## Compatibilidade e riscos

A alteração envolve apenas recursos estáticos do Web e metadados de HTML, sem tocar em componentes React, serviços, protocolo, workspace identity ou fluxo de mensagens do controle remoto. O comportamento de negócio do desktop e do celular não muda. O navegador pode ter em cache o favicon antigo; na primeira validação após a publicação, pode-se usar uma janela anônima ou forçar a atualização para descartar o efeito do cache.