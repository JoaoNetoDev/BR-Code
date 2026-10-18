# Toast de troca de modelo

## Contrato de exibição

- Após a troca de modelo em uma sessão já existente, exibe-se o Toast padrão, centralizado no topo.
- Texto em chinês: `已从 {fromModel} 切换至 {toModel}`.
- Texto em inglês: `Switched from {fromModel} to {toModel}`.
- `fromModel` e `toModel` seguem as regras existentes de formatação dos rótulos de fornecedor/modelo.
- O Toast apenas informa o resultado da troca, sem acrescentar explicações sobre impacto de performance; as regras de supressão já existentes, como a de reselecionar o mesmo modelo no rascunho, permanecem inalteradas.