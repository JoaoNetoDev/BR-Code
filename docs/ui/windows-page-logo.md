# Logo no canto superior esquerdo da página no Windows

## Escopo

- Adiciona o logo do aplicativo no canto superior esquerdo do `SettingsPage` do desktop Windows.
- Apenas acrescenta a identidade da marca: não cria nenhum comportamento de clique nem altera as interações existentes de voltar, abrir workspace, seções de configurações etc.

## Implementação

- A UI adiciona `packages/ui/src/WindowsTopLeftLogo.tsx`, reutilizando de forma unificada o recurso de logo usado por `App.tsx` nos temas claro e escuro.
- `SettingsPage` renderiza esse componente somente sob a condição `isWindowsDesktop`, preservando o `app-region:drag` no topo.