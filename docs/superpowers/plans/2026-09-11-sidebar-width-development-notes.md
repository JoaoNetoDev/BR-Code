# Registro da correção do tremor do "mostrar mais" na barra lateral

Spec correspondente: `docs/superpowers/specs/2026-09-11-project-sidebar-width-stability.md`.

## Fatos divergentes do esperado

- Ao restaurar as partições antigas foi adicionado `grid gap-3`, sem no entanto restringir a largura mínima da coluna implícita. O layout de blocos comuns do código antigo não tinha esse comportamento. Por isso a cópia em rolagem do TaskTitleOverflowText passa a influenciar a largura da coluna pai, formando um retorno de layout do tipo "overflow → adiciona cópia → alarga → sem overflow → remove cópia".
- No renderer real da máquina local, no controle com 0 movimentos de mouse, a largura do contêiner permaneceu em 586px, mas a largura do botão alternou entre 637.695px e 1237.492px, e a quantidade de cópias do título variou entre 0/2. Ao aplicar temporariamente a restrição de coluna única o botão estabilizou em 570px; ao restaurar o estado original o problema voltou a ocorrer. Aqui não há mudança no conjunto de linhas de tarefas nem no banco de dados.
- A regressão de UI original cobria projeto vazio e poucas tarefas, sem usar títulos longos para disparar o Grid intrinsic sizing; desta vez foi adicionada uma regressão real de Electron com paginação, com HOME isolado e 25+25 títulos longos e curtos. O índice sintético de tarefas serve apenas ao layout, não cria histórico real da CLI nem dispara requisições ao provider.
- Com o DevTools aberto durante a execução, o agent-browser passava `--cdp` a cada vez e selecionava um novo target do DevTools; os resultados seguintes da barra lateral vazia ficaram inválidos. Depois de fixar a page do CDP pelo título ZCode e pela URL localhost, a comparação foi refeita, sem confundir a troca de target com desinstalação do produto.

## Verificação

Antes da correção, o E2E pendente falhou na asserção de largura da partição: overflow de 686.015625px (tolerância de 1px). A implementação apenas adiciona `grid-cols-1` e um comentário em chinês explicando o motivo, sem alterar a medição do título, o estado de paginação ou a camada de dados.

Após a correção, com nova build e execução, `desktop-e2e-20260911045425289-p13513-f9e2908aae9f6465` passou. Foram quatro grupos (dois temas × partição normal/240px), com 146 amostras por grupo, sem overflow horizontal, sem salto de largura do botão para 0 e com erro de centralização máximo de 0.00390625px; ambas as partições paginaram de 20→25 com sucesso. Passaram 12 testes unitários relacionados, root typecheck, typecheck:e2e, fixture check e lint (48 warnings já existentes / 0 error); architecture baseline/new/violations todos em 0. O celular usa o mesmo CSS de contêiner; nesta rodada só foi validado o layout de contêiner estreito, sem alegar cobertura do fluxo ponta a ponta do relay no celular.

O código tem 151 linhas adicionadas e 1 removida no E2E, net +150 linhas; a mudança de produção se resume à restrição de coluna única e ao comentário de motivo. Não foram alterados o owner dos dados de projeto/tarefa, a cadeia de sincronização nem o banco de dados.
