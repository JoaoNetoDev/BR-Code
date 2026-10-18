# Layout do Workspace

A interface principal do workspace atual usa uma estrutura em três partes:

- à esquerda, fixo, o `WorkspaceSidebar`
- à direita em cima, o `Header` do workspace
- à direita embaixo, a área de conteúdo principal

Restrições adicionais:

- A entrada de mostrar/ocultar a sidebar fica no shell mais externo de `packages/ui/src/App.tsx`, e não dentro do `WorkspaceSidebar`.
- Assim, quando a sidebar está oculta, o canto superior esquerdo ainda mantém a entrada de "reexpandir", sem esconder junto a operação de restauração.
- Essa entrada usa posicionamento absoluto sobreposto ao canto superior esquerdo do shell, com altura fixa `h-11` e largura seguindo o conteúdo do botão.
- No macOS é preciso reservar adicionalmente a área segura dos semáforo à esquerda, evitando sobreposição entre o botão e a área de controle da janela.
- No estado expandido mostra-se apenas `PanelLeftClose`; no estado recolhido mostram-se `PanelLeftOpen` e `MessageCirclePlus`, sendo que este último dispara diretamente a criação de nova task.
- A largura padrão e a largura mínima arrastável do `WorkspaceSidebar` são ambas `264px`, ou seja 256px de largura de conteúdo mais 8px de margem de segurança; o arraste, o Home do teclado e o `aria-valuemin` precisam compartilhar esse limite.
- A seção global Pinned só aparece quando há tasks fixadas ou quando elas estão sendo carregadas, usando `taskList.pinnedSection` como título independente acima da lista.
- O `WorkspaceSidebar` oferece uma entrada para a árvore de arquivos na área de ações à direita de cada linha de workspace, posicionada entre o menu de mais ações e a criação de nova task; ao clicar, a lista de tasks desliza inteira para a esquerda e a `WorkspaceFileTree` entra deslizando pelo lado direito. Os detalhes de implementação da árvore de arquivos estão em `docs/ui/workspace-file-tree.md`.

A área de conteúdo principal é dividida em duas camadas, uma em cima da outra:

- a camada superior usa layout de duas colunas: `Conversation` à esquerda e `Browser` à direita
- a camada inferior é o `Terminal`, ocupando a linha inteira

Princípios de layout:

- O `Header` pertence apenas à área do workspace à direita e não é mais misturado com o `WorkspaceSidebar` à esquerda
- Depois de aberto, o `Browser` ocupa a coluna independente à direita da camada superior e não disputa mais espaço inferior com o `Terminal`
- O `Terminal` fica isolado na linha inferior completa e suporta arraste vertical em relação à área de conteúdo superior
- O `PreviewPane` continua existindo como painel adicional do nível mais externo, evitando sobreposição de responsabilidades com o `Browser`