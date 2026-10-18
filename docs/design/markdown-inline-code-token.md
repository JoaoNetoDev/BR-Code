# Token de Código Inline do Markdown

O código inline do Markdown usa um token de fundo independente, `--color-markdown-inline-code`.

## Restrições de design

- `--color-markdown-inline-code` mapeia para `--color-tag`, expressando uma etiqueta leve em formato de cápsula, sem elevar ao nível de card.
- O texto do código inline continua herdando o `--color-foreground` do corpo do Markdown, garantindo continuidade de leitura.
- Blocos de código não usam esse token e continuam sendo controlados pelo tema de código do CodeBlock / CodeViewer.
- `font-mono` usa uma pilha de fontes segura para CJK e multiplataforma: para caracteres latinos, prioriza a fonte monoespaçada do sistema; para chinês simplificado, no Windows faz fallback primeiro para `Microsoft YaHei UI` / `Microsoft YaHei`, no macOS para `PingFang SC` e no Linux para `Noto Sans CJK SC`. É proibido que o chinês caia diretamente na SimSun escolhida pelo `monospace` genérico.
- CodeViewer / DiffViewer devem reutilizar a mesma pilha de fontes via `--diffs-font-family: var(--font-mono)`, e não manter o fallback próprio do `@pierre/diffs`, que não contém fonte sem serifa CJK.

## Onde está implementado

- O token é definido em `packages/ui/src/styles.css`.
- A renderização de código inline do Markdown está em `packages/ui/src/components/ai-elements/message.tsx`.
- O mapeamento de fontes para bloco de código do Markdown, pré-visualização de arquivo e diff completo está em `packages/ui/src/components/ui/code-viewer.tsx` e `packages/ui/src/components/ui/diff-viewer.tsx`.