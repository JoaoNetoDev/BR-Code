# Máscara de Rolagem da Sidebar do Workspace

## Objetivo

Quando a lista de workspaces da sidebar do workspace apresenta barra de rolagem vertical, aplicar um `mask-image` de esmaecimento no topo e na base do próprio container de rolagem da lista, indicando que ainda há conteúdo acima e abaixo para continuar rolando.

## Comportamento atual

- A máscara só aparece quando a altura do conteúdo da lista de workspaces ultrapassa a área visível.
- Quando ainda há conteúdo no topo da lista para rolar para cima, a máscara superior é exibida; ela desaparece automaticamente ao voltar ao topo.
- Quando ainda há conteúdo na base da lista para continuar rolando para baixo, a máscara inferior é exibida; ela desaparece automaticamente ao rolar até a base.
- A máscara age apenas sobre a área de rolagem da lista de workspaces, sem afetar o footer de conta/configurações na base.

## Local da implementação

- Container de rolagem da lista e máscara: `packages/ui/src/WorkspaceSidebar.tsx`

## Notas de implementação

- Usa `scrollTop / clientHeight / scrollHeight` do container de rolagem para determinar se ainda é possível rolar para cima ou para baixo.
- O `mask-image` correspondente à direção só é mantido no container de rolagem enquanto ainda houver conteúdo rolável naquela direção; ao alcançar a borda, a máscara daquela direção é removida.
- Observa simultaneamente as mudanças de tamanho do container de rolagem e do container de conteúdo, garantindo que o estado da máscara seja sincronizado após expandir um workspace, alterar a quantidade de tasks ou redimensionar a janela.