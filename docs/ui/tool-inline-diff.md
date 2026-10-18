# Tool Inline Diff

> **Estado atual**: a tool row do V4 é renderizada por `ToolCallBlocks`, e o diff inline no chat usa uma prévia leve com highlight;
> o Diff Viewer completo mantém a capacidade de renderizar o diff por completo.

## Contexto

Antes, as tools de modificação de arquivo na área do chat exibiam apenas parâmetros e saída bruta, obrigando o usuário a abrir o code viewer para ver o diff real.

Desta vez foi feita uma versão mínima:

- Trata apenas tools como `edit` / `patch`, que conseguem gerar uma prévia de patch
- Renderiza o unified diff inline dentro do card da tool
- Usa um unified diff leve com highlight assíncrono, evitando montar um Shadow DOM grande na thread principal do chat
- Mantém o botão "查看 Diff" ("Ver diff") como entrada de fallback

## Implementação atual

A entrada está em `packages/ui/src/ToolCallBlocks/renderers/edit.tsx` e
`packages/ui/src/ToolCallBlocks/renderers/EditInlineDiffContent.tsx`:

- Usa `getToolCallCodePreview()` para verificar se a tool atual consegue gerar uma prévia `patch`
- Para tools `edit` como `opencode`, prioriza o parsing do bloco `diff` padrão dentro de `raw.content`
- Uma tool call comum é renderizada primeiro como uma linha compacta e recolhida de "status + título da tool + resumo opcional", sem expandir o conteúdo bruto por padrão
- No estado em execução, usa o texto de status com shimmer; no estado encerrado, a seta de expansão só aparece à direita após hover / focus
- Quando há acerto em `patch`, o conteúdo expandido usa `HighlightedLightweightDiffPreview`; não são exibidos separadamente os parâmetros nem a saída JSON bruta
- O botão "查看 Diff" continua presente, mas só aparece depois que o usuário abre a tool call correspondente

## Fronteiras conhecidas

- Hoje são consumidos simultaneamente o file summary estruturado, a prévia de patch e dados legados de snapshot/provider; a inferência de compatibilidade continua pertencendo apenas à camada de exibição da UI
- Suporta apenas unified diff, não side-by-side
- Trata apenas as estruturas de patch / before-after que o `codeViewer` atual já reconhece
- O resumo da tool call hoje é derivado apenas das strings `input` / `command` / `path` / `prompt`, sem cobrir ainda mais campos específicos de tools

## Extensões futuras

- Completar os tipos estruturados de diff em `@zcode/shared`
- Centralizar o parsing do `toolContent` padrão do ZCode na camada de services
- Adicionar diff side-by-side e location follow-along