# Temas Zai

## Objetivo

Adicionar os dois temas de marca `zai-light` e `zai-dark`, que passam a assumir o Light Theme / Dark Theme visível ao usuário.
As variáveis CSS padrão `light` / `dark` são mantidas como fallback de baixo nível, mas o menu de temas não expõe mais as entradas nativas light / dark.

## Implementação

- O enum `Theme` mantém `light` / `dark` como valores de compatibilidade para preferências antigas; na persistência e na aplicação eles são normalizados para `zai-light` / `zai-dark`.
- `resolveTheme()` classifica `zai-light` no ramo light e `zai-dark` no ramo dark, continuando a reaproveitar os limites de modo claro/escuro da barra de título, da prévia de código e do controle remoto no celular.
- `system` aplica `zai-light` ou `zai-dark` conforme a preferência de modo claro/escuro do sistema, evitando o fallback para o tema CSS padrão.
- `.theme-zai-light` / `.theme-zai-dark` em `styles.css` mapeiam os tokens semânticos da Zai para as variáveis semânticas `--color-*` já existentes no projeto; a camada de componentes não depende diretamente das escalas primitivas de cor.
- O desktop, o bootstrap da primeira tela do Web, a página de monitoramento de processos e o menu de temas do controle remoto no celular usam a entrada de temas Zai, evitando fallback no primeiro frame ou entrada não selecionável.

## Mapeamento de tokens

- `bg/page` -> `--color-background`
- `bg/bg` -> `--color-card`、`--color-popover`、`--color-input`、`--color-input-focused`
- `bg/surface` -> `--color-panel`
- `bg/overlay` -> `--color-background-win-alt`, e deriva `--color-background-alt` com 60% de transparência
- `text/primary` -> `--color-foreground`
- `text/secondary` -> `--color-foreground-subtle`
- `text/tertiary` -> `--color-foreground-subtlest`
- `border/default` -> `--color-border`
- `interactive/bg/primary/default` -> `--color-brand`、`--color-primary`
- `border/strong` -> `--color-input-border-focused`
- `accent/blue/default` -> variáveis auxiliares de destaque azul

A cor de primeiro plano da raiz da aplicação do Zai dark usa `#ffffff`, conforme a classe de referência do shell atual, em vez de continuar usando o `#f8f8f8` próximo do branco nos tokens exportados.