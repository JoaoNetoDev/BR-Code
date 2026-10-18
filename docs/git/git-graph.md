# Git Graph

Git Graph é a entrada, em modo somente leitura, do grafo de commits dentro do menu suspenso de operações Git, usada para ver os commits recentes do repositório atual, as pistas de branches, as arestas de merge e as refs.

## Limites de design

- A UI consome dados estruturados de forma paginada apenas por `IGitService.getCommitGraph({ workspacePath, maxCount, skip })`, sem chamar a CLI do Git diretamente.
- A camada services/repo usa `git log --all --topo-order --date-order` para ler commits, parents, refs, author e tempo.
- `layoutGitGraph(commits)` é uma função pura: recebe os commits já ordenados por topo/date e devolve as coordenadas das linhas, as lanes, o path das arestas e o estado de truncamento.
- O renderer SVG é responsável apenas por exibir nós, linhas, hover, selected e ref chips; um parent fora da janela é indicado por uma aresta tracejada, representando o truncamento.
- A UI usa os semantic tokens do `DESIGN.md`, evitando adicionar uma nova biblioteca gráfica e mantendo compatibilidade com os temas do desktop e da Web.

## Limitações atuais

- Por padrão são carregados 50 commits por página; após clicar em "carregar mais commits", a próxima página é lida via `skip`; a camada repo permite no máximo 200 itens por página.
- A entrada atual é uma view em modal; por enquanto não há rolagem infinita, busca, checkout nem integração com diff.
- Um repositório vazio devolve uma lista vazia e a UI exibe o estado vazio.