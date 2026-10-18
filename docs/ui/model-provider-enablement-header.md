# Cabeçalho de habilitação do Model Provider

Na página de detalhes do fornecedor de modelos, o estado de habilitação e as ações de ativar/desativar são exibidos na mesma linha de título.

- O indicador de estado aparece depois do nome do provider.
- O botão "Ativar / Desativar" vem logo em seguida ao indicador de estado, evitando se misturar com as ações secundárias à direita.
- A área de ações à direita mantém apenas operações que não sejam de ativação, como ver uso e excluir.

Implementação relacionada:

- `packages/ui/src/settings/model-provider-section/ProviderCardSections.tsx`
- `packages/ui/test/modelProviderEnablementHeader.test.ts`