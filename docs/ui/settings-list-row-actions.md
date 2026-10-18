# Botões de ação dos itens da lista de configurações

## Especificação de interação

- As ações apenas com ícone à direita de cada item da lista de configurações usam uniformemente `Button variant="ghost" size="icon-md"` (28px).
- Botões de ícone do mesmo grupo, como editar e excluir, usam `gap-1` (4px).
- Controles independentes, como Switch e autorização, usam `gap-2` (8px) em relação ao grupo de botões de ícone.
- Quando há apenas uma ação, não se cria espaçamento extra de preenchimento; a seta de navegação no fim da linha de Memory não é um botão de ação e não recebe o tamanho de botão.

## Cobertura atual

- Edição e exclusão dos itens das listas de comandos, hooks, subagentes e MCP.
- Menu "mais" dos itens da loja de plugins.