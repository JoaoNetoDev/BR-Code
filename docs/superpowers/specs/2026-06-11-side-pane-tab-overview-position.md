# Side Pane Tab Overview Entry Position

## Contexto

A barra de tabs do side pane já possuía uma entrada de overview para buscar as abas abertas e as abas fechadas recentemente. A entrada ficava na área de ferramentas à direita da barra de tabs, com um ícone do tipo busca, e não tinha proximidade visual suficiente com a navegação de abas em si, nem com o botão "Nova aba".

## Objetivos

- Mover a entrada de tab overview para o lado esquerdo das abas do side pane, tornando-a uma entrada precedente da navegação de abas.
- Trocar o ícone da entrada para `ChevronsDownIcon`, expressando a semântica de "expandir/ver a lista de abas".
- Manter inalterados os comportamentos existentes de busca, troca, fechamento e restauração de abas fechadas recentemente.
- Quando houver overflow horizontal de tabs, exibir a máscara em gradiente apenas no lado que ainda pode continuar rolando, conforme a posição atual de rolagem.

## Não objetivos

- Não altera a estrutura de dados das abas do side pane.
- Não altera a posição nem as opções do menu de nova aba.
- Não altera a semântica de layout do side pane no mobile.

## Verificação

- A verificação de tipos do TypeScript passa.
- O lint passa.
- A entrada continua usando os textos de internacionalização existentes, como `sidePane.tabOverview` / `sidePane.searchTabs`.