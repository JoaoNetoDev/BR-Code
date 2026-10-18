# Navegação de Volta das Subpáginas de Configurações

## Contrato

- As subpáginas das Configurações usam uniformemente o `SettingsBackButton`, com tamanho fixo `size="lg"` (32px de altura) e um `ArrowLeft` de 16px à esquerda.
- O componente usa fixamente `variant="ghost"`; as páginas de negócio não podem sobrescrever `size` ou `variant`, nem adicionar cores, espaçamentos ou estilos de hover exclusivos do botão de volta.
- Cobre as subpáginas de Memory, plugins, comandos, hooks, subagentes e MCP.
- Os textos são fornecidos pelos recursos de internacionalização de cada módulo de negócio: em chinês, unificados como "返回"; em inglês, como "Back". O componente não concatena nomes de negócio como projeto, memória ou comando.
- O "voltar ao workspace" do nível superior, a paginação de listas e a navegação de passos internos dos formulários não pertencem à navegação de volta das subpáginas.
- O "passo anterior" dos fluxos de automação, tarefas ociosas e compra de modelos, e o "voltar" do plano de upgrade de modelo não estão no escopo desta vez e mantêm suas implementações próprias.