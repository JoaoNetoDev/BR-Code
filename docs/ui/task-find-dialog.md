# Diálogo de busca de tasks

> **Estado atual**: este documento descreve os limites atuais da busca de conversas da V4 e da busca de alterações de arquivo do Git.

`Cmd/Ctrl+F` abre o diálogo de busca de tasks. Ele é separado de `Cmd/Ctrl+P`, que continua abrindo o seletor rápido de arquivos.

## Escopos

- Conversa: busca o texto visível na conversa da task atual. Todas as ocorrências são destacadas, a ocorrência ativa usa um destaque mais forte, e abrir ou alterar a query rola até a primeira ocorrência.
- Alterações de arquivo: abre o painel lateral de alterações do Git/arquivos, se necessário, busca no conteúdo do diff da fonte de alterações atual, expande o arquivo que contém a ocorrência ativa e destaca as ocorrências visíveis nesse diff. Este escopo não altera o estado de destaque da conversa.

## Navegação

Os botões de cima e de baixo, `ArrowUp`, `ArrowDown` e `Enter` percorrem as ocorrências do escopo atual com retorno ao início. `Shift+Enter` vai para trás.

## Mensagens em streaming

A mensagem em execução/prewarm atual entra na busca da conversa assim que seu texto é renderizado.
Os deltas de streaming podem estender as ocorrências da mensagem atual, mas não reordenam ocorrências existentes, não reiniciam a ocorrência ativa nem rolam a timeline automaticamente. A navegação explícita (botões, setas, Enter ou Shift+Enter) pode rolar a ocorrência selecionada até a área visível. Quando a mensagem atinge uma fase terminal, o índice estável completo é reconstruído e a ocorrência ativa é realinhada por sua identidade de linha, sempre que possível.

## Limites de estado

O diálogo é dono da query e do escopo. `App` é dono do estado de query/índice/contagem de conversa e de alterações de arquivo; o V4 `useConversationTimelineFind` indexa as unidades de renderização da projeção e destaca a timeline virtualizada, enquanto `GitPane` trata as ocorrências de alterações de arquivo a partir dos diffs carregados e pré-carrega os diffs ausentes. O diálogo não acopla os dois renderizadores.