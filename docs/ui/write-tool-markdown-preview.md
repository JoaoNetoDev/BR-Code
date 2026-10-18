# Pré-visualização em Markdown da Write Tool

> **Estado atual**: a row de tool da V4 implementa essa pré-visualização por meio do componente de corpo unificado `ToolCallBlocks`.

Ao exibir a pré-visualização do conteúdo de um arquivo nos detalhes do cartão, as ferramentas do tipo `write` / `create` / `save` renderizam o corpo diretamente em Markdown quando a extensão do arquivo de destino é `.md`; os demais arquivos de texto continuam usando realce em bloco de código.

## Regras de Interação

- A pré-visualização em Markdown reutiliza a capacidade de renderização `MessageResponse` das mensagens do chat, com suporte a títulos, listas, blocos de código e links.
- Links relativos apontando para arquivos do workspace continuam abrindo pelo Code Viewer.
- A área de pré-visualização mantém uma altura máxima fixa e um container com rolagem, evitando que documentos longos estiquem o cartão da ferramenta.

## Pontos de Entrada da Implementação

- `InlineCodeContent` em `packages/ui/src/ToolCallBlocks/ToolCallBody.tsx`
- `inferCodeLanguage` em `packages/ui/src/lib/codeViewer.ts`