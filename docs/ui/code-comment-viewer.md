# Code Comment Viewer

O painel de visualização de código permite adicionar comments locais em um intervalo de linhas, funcionando como
ponto de entrada interativo para a capacidade de contexto em conversas posteriores.

## Escopo de interação

- ao passar o mouse sobre a barra de números de linha, aparece o botão de adicionar comment.
- no desktop, ao passar o mouse ou focar o botão de adicionar comment, exibe-se à direita dele um tooltip leve
  indicando que é possível clicar ou arrastar; no celular não há dependência de hover, e o clique entra diretamente na
  entrada de comentário.
- clicar no botão adiciona um comment em uma única linha; pressionar e arrastar sobre outras linhas seleciona um
  intervalo contínuo de linhas.
- ao soltar o arraste, a caixa de entrada do comment abre abaixo da última linha do intervalo; o texto do comment pode
  ficar vazio e, ao enviar diretamente, apenas o intervalo de código é usado como contexto da sessão.
- após o envio, a pré-visualização do comment aparece abaixo da última linha do intervalo; excluir a pré-visualização
  não modifica o arquivo de origem.
- o comment enviado é exibido como um chip agregado no topo da caixa de entrada do chat, com o mesmo formato de um
  anexo comum.
- ao remover o chip do comment na caixa de entrada do chat, a pré-visualização local no code viewer é limpa em
  sincronia.
- é possível adicionar um comment a partir do code viewer de outro projeto à conversa atual; o anexo preserva a origem
  `workspacePath` / `workspaceIdentity` e o caminho completo do arquivo.
- ao fechar a tab do arquivo, ao reabrir o mesmo workspace + caminho de arquivo as pré-visualizações de comments ainda
  não enviadas/removidas são restauradas a partir do preview store dentro do renderer.

## Limites de implementação

- nesta fase são concluídas a interação dentro do code viewer, a pré-visualização local e a exibição dos anexos de
  comment no topo do composer e nas mensagens do usuário.
- o comment não é gravado no arquivo de origem.
- o comment preview só é mantido durante o ciclo de vida atual do renderer; após recarregar a janela ou reiniciar o
  aplicativo, não é restaurado.
- ao enviar o prompt, o contexto é montado reaproveitando as ferramentas de prompt estruturado em `codeCommentContext`;
  comments entre projetos usam a informação de workspace de origem para limpar a pré-visualização e não usam o filtro
  de workspace do composer atual para o evento de adição.
- o botão de adicionar comment continua usando a gutter utility embutida de `@pierre/diffs` com
  `onGutterUtilityClick`; o tooltip é melhorado apenas por `unsafeCSS` dentro do Shadow DOM e por `title` /
  `aria-label`, sem migrar para um `renderGutterUtility` customizado, para não quebrar a seleção de múltiplas linhas por
  arraste.

## Explicação de layout

As linhas normais de código usam a coluna de números de linha e a coluna de código do grid pai. A caixa de entrada /
pré-visualização do comment precisa permanecer fixa na área visível durante a rolagem horizontal, por isso usa um grid
interno com sticky; o início da coluna de conteúdo do grid interno é alinhado lendo a borda esquerda da célula real de
código no grid pai, evitando desalinhamento quando a quantidade de dígitos dos números de linha muda.
