# Workspace File Tree E2E Coverage

## Casos aceitos

| Caso | Spec | Problema do usuário coberto | Asserções |
| --- | --- | --- | --- |
| `workspace-file-tree-refresh` | `packages/desktop/test/e2e/workspace-file-tree-refresh.test.ts` | 1. Após o ZCode renomear um arquivo, atualizar a árvore de arquivos ainda mostra o caminho antigo; 3. Ao clicar no botão de atualizar a árvore, os arquivos não são atualizados | Colapsa o subdiretório depois de carregar, renomeia o arquivo no sistema de arquivos real, clica em atualizar e expande novamente; a árvore mostra o novo caminho, o caminho antigo desaparece e o novo arquivo pode ser aberto em preview. |
| `workspace-file-tree-refresh` | `packages/desktop/test/e2e/workspace-file-tree-refresh.test.ts` | 2. Após adicionar um arquivo em um diretório expandido, a árvore de arquivos não é atualizada em tempo real, e é preciso reiniciar o ZCode | Adiciona um arquivo ao diretório atualmente expandido no sistema de arquivos real do workspace e, após a cadeia `fs.watch` disparar, o novo arquivo aparece automaticamente na árvore. |
| `workspace-file-tree-compact-hierarchy` | `packages/desktop/test/e2e/workspace-file-tree/workspace-file-tree-compact-hierarchy.test.ts` | Após a compactação de vários níveis de diretórios vazios, os diretórios descendentes e seu conteúdo não são recuados e os descendentes também não ficam fixos no topo | Constrói compact folders de dois níveis com arquivos reais do workspace; após expandir, afirma que cada nível de descendente acrescenta `12px`, que a linha-guia de profundidade está correta e que, após rolar, tanto o diretório pai quanto os descendentes entram como sticky folders sem folgas extras. |
| `workspace-file-tree-shared-search` | `packages/desktop/test/e2e/workspace-file-tree/workspace-file-tree-shared-search.test.ts` | Ao buscar arquivos Java / do workspace na árvore do lado esquerdo, os arquivos que o `@` conseguiria referenciar muitas vezes não são encontrados | Cria um arquivo-fonte profundo ainda não expandido; digitar o nome da classe ou o caminho relativo na árvore da esquerda encontra o arquivo; o estado de busca e o `@` usam os mesmos candidatos de `listWorkspaceFiles` e a mesma ordenação fuzzy; clicar no arquivo abre o `PreviewPane` e não insere nenhuma mention no Composer. |

## Decisões de cobertura

| Decisão | Status | Motivo |
| --- | --- | --- |
| Desktop local + vários trechos de compact folders + expandir + rolar para baixo | accepted | Cobre ao mesmo tempo a profundidade física, o offset de exibição, a rolagem virtual e a seleção do ancestral sticky, sendo a menor cadeia completa para esta regressão. |
| Diretórios comuns (sem compactação) | pruned | Os caminhos existentes de expansão da árvore e os helper/unit já cobrem a profundidade comum; isso não prova a regressão de offset da compactação. |
| Execução separada em Zai Light / Zai Dark | pruned | As linhas-guia e os recuos compartilham o mesmo DOM e os mesmos design tokens; este case afirma estrutura e geometria, sem capturas de tela por pixel de tema. |
| Execução repetida em Web / Web no celular | pruned | `WorkspaceFileTreeRowView` é uma implementação de renderização compartilhada; este case não envolve serviços de plataforma, remote delivery nem comportamento exclusivo de toque. |
| Workspace SSH / WSL / Docker | pruned | O defeito desta rodada está na profundidade exibida pelo renderer; a leitura remota de arquivos e o isolamento por `workspaceIdentity` estão fora da fronteira de comportamento deste case. |
| Matriz completa de filtros padrão | pruned | A filtragem de `.git`, `node_modules`, `.env`, descendentes de diretórios ocultos e artefatos de build é coberta por testes unitários do service e pelo E2E de filtro da busca de arquivos; o case de busca compartilhada da árvore só prova que ele reutiliza o mesmo índice e a mesma ordenação, sem duplicar as asserções de blacklist. |

## Fora de escopo

- Adicionar um arquivo em um diretório profundo nunca carregado continua seguindo a semântica de carregamento preguiçoso, sem exigir exibição automática.
- Diretórios já carregados mas colapsados não mantêm watcher de longo prazo; eles dependem do botão de atualizar para atualizar o cache, evitando que o número de watchers do OS cresça sem limite conforme o histórico de navegação.
- O comportamento de watcher de workspace remoto / Web remote não é provado pelos casos locais da árvore de arquivos do desktop.
- A varredura periódica de reserva após perda de eventos no `fs.watch` da camada do sistema operacional não faz parte da semântica desta rodada.
- O limite de watchers para muitos diretórios expandidos e o recuo de recursos serão avaliados separadamente.