# Renderização do CodeViewer com `@pierre/diffs`

`packages/ui/src/components/ui/code-viewer.tsx` foi reimplementado de acordo com o modelo de arquivo de código do `@pierre/diffs`:

- Usa `FileContents` para representar o arquivo em pré-visualização: `name`, `contents`, `lang`, `cacheKey`
- Renderiza com o componente `File` de `@pierre/diffs/react`
- Mantém apenas os parâmetros relacionados à pré-visualização de código: linguagem, interruptor de realce, números de linha, quebra de linha, tema e tamanho da fonte

A antiga implementação manual de Shiki/grid foi removida; atualmente o CodeViewer é suportado diretamente pelo componente `File` de `@pierre/diffs/react`, que cuida das linhas de código, dos números de linha e da renderização de annotations.

Blocos de código em Markdown usam o CodeViewer para exibição de código somente leitura; não há suporte a comentários.