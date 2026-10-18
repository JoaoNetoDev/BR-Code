# Botões de Ação do Cabeçalho das Configurações

## Contexto

As subpáginas de configurações de skills, comandos, servidores MCP e afins colocam ações de alto uso à direita do texto de descrição. Para reduzir as variações visuais entre as diferentes páginas de configurações, esses botões de ferramentas no cabeçalho precisam ser unificados em botões de ícone compactos.

## Especificações de interação

- As operações somente de ícone no canto superior direito da lista — adicionar, importar, abrir diretório, sincronizar, atualizar e gerenciar — usam `Button variant="ghost" size="icon-md"` (28px).
- O botão exibe apenas o ícone semântico; o texto é apresentado por `ControlHintTooltip`.
- O botão precisa manter o mesmo texto como `aria-label`, garantindo que a semântica de acessibilidade e de internacionalização não se perca.
- O tamanho do ícone usa `size-3.5`, mantendo consistência com os botões de novo, importar e atualizar da página de skills.
- Botões de ação adjacentes no mesmo cabeçalho de lista usam uniformemente `gap-2` (8px).

## Cobertura atual

- Skills: nova skill, importar skill, atualizar a lista de skills.
- Memórias: atualizar a lista de memórias do projeto.
- Comandos: novo comando, abrir o diretório de comandos do usuário, atualizar a lista de comandos.
- Configurações de modelo: atualizar a lista de fornecedores de modelo.
- Servidores MCP: novo servidor MCP.
- Plugins, hooks e subagentes: as operações somente de ícone no canto superior direito das listas correspondentes.