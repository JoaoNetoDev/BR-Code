# Alternância de modo de rolagem da tabela Markdown

## Contexto

As tabelas Markdown agora usam uma barra de rolagem horizontal virtual que oculta a barra nativa e permitem que a área de rolagem da tabela TOMBE para a esquerda e se estenda para a direita até o limite disponível da raiz do chat. A rolagem aprimorada é adequada para tabelas muito largas, mas tabelas comuns que ocupam espaço horizontal extra por padrão alteram o ritmo de leitura.

## Objetivo

- A tabela calcula o espaço horizontal que pode tomar emprestado a partir da raiz de conteúdo de mensagem `data-markdown-table-layout-root` mais próxima; o seletor antigo `chat-view` permanece apenas como caminho de compatibilidade.
- Cada tabela Markdown tem um botão independente de modo de rolagem horizontal.
- O contêiner raiz da tabela define explicitamente `my-0`, sobrescrevendo as margens de bloco que o contexto de tipografia Markdown possa injetar.
- A rolagem aprimorada vem desativada por padrão, mas a barra de rolagem virtual é mantida.
- Quando a rolagem aprimorada está desligada, a largura do slot de rolagem é calculada pela largura de `data-markdown-table-frame`, sem tombar para a esquerda nem se estender para a direita.
- Quando a rolagem aprimorada está ligada, a lógica de extensão existente é reutilizada: a largura do slot de rolagem é `frameRect.width + rightDistance - rightInset`, com queda para a esquerda permitida e a largura máxima do conteúdo acrescida da largura tomada à esquerda.
- A regra de barra de rolagem fixa (sticky) para tabelas longas permanece inalterada: ela só fixa no fundo quando a altura da própria tabela ultrapassa 80% da área visível vertical, e continua desviando da área de entrada inferior/do painel.
- As linhas virtuais da V4 são posicionadas por `transform`, então o `position: sticky` nativo do navegador não funciona em relação ao timeline; a barra de rolagem de tabelas longas deve calcular a compensação vertical a partir da borda inferior visível do timeline e da altura real de `data-v4-composer-dock`, limitando essa compensação aos limites superior e inferior da tabela atual. O ChatView antigo mantém compatibilidade com `--chat-bottom-dock-height`.
- `data-markdown-table-virtual-scroll-sticky` é o contrato semântico estável do modo sticky; o E2E deve ler esse estado e, combinado com a posição geométrica após a rolagem, validar a fixação no fundo, sem usar `getComputedStyle().position`, porque a implementação da V4 usa deliberadamente `relative + translateY`.
- O contraste entre "tabela curta não fixa no fundo e tabela longa fixa" precisa ser executado em uma janela fixa e suficientemente alta, para evitar que a tabela curta também ultrapasse `80%` da altura visível por causa de uma janela de teste baixa e o caso valide na verdade a pré-condição errada; quando o tamanho alvo excede a área de trabalho do monitor atual, o E2E deve convergir para o limite da área de trabalho, sem esperar tamanhos de janela que o sistema operacional não aceitaria.
- Quando a barra de rolagem virtual volta a ficar visível por causa de um overflow horizontal, os listeners verticais do timeline e a observação geométrica precisam ser religados; não se pode depender apenas do estado do modo sticky.
- O composer dock da V4 pode crescer dinamicamente por causa da caixa de entrada, anexos ou painéis, então a compensação sticky deve observar diretamente o tamanho do dock e religar a observação quando o nó do dock for montado/substituído condicionalmente.
- O botão flutuante `data-v4-back-to-bottom-anchor`, que aparece quando o timeline está longe do fundo, também faz parte da área de desvio inferior; a compensação sticky precisa descontar a altura do botão e o espaçamento de `8px`, e a montagem/desmontagem do botão deve disparar o recálculo.
- Na mesma rodada de medição geométrica, a visibilidade da barra de rolagem virtual deve ser decidida apenas pela largura do slot de layout em ponto flutuante estável, e não pela largura do track do DOM após a montagem condicional.
- A mudança no estado de overflow horizontal só pode alternar a visibilidade e o estado de interação da barra de rolagem virtual; não pode montar/desmontar nós nem alterar a ocupação vertical, para não perturbar o `scrollHeight` / `scrollTop` do timeline da V4, o estado de acompanhamento do fundo nem a memória de rolagem da sessão.
- A máscara de esmaecimento do composer da V4 deve ficar na camada de máscara de mensagem com a largura total do timeline; a largura da coluna de texto, o centralismo e o deslocamento horizontal do painel ficam a cargo de `data-markdown-table-vimeline-virtual-history` e da live tail, cada um por si. A camada de máscara não pode reutilizar o `max-width` da coluna de texto, senão a parte que ultrapassa a coluna nos dois lados no modo aprimorado será recortada pela CSS mask.

## Interação

A barra de ferramentas ganha um botão de modo à direita do botão "Visualizar tabela":

- Só aparece quando a tabela transborda horizontalmente na largura comum do frame e o modo aprimorado pode fornecer largura visível extra ou espaço à esquerda para tomar emprestado.
- Quando desligado, o significado do botão é expandir a área de rolagem da tabela.
- Quando ligado, o significado do botão é recolher de volta para a área de rolagem comum da tabela.
- O modo afeta apenas a instância atual da tabela, não outras tabelas.
- Depois de ligado, o botão permanece visível para facilitar que o usuário recolha; após recolher, se o modo aprimorado não trouxer ganho no tamanho atual, o botão é ocultado.
- O nó da barra de rolagem horizontal virtual fica sempre montado e preserva uma ocupação vertical fixa; quando não há overflow horizontal, ele apenas fica invisível e não interativo, sem ser desmontado. Quando existe overflow horizontal, ele ainda só aparece ao passar o mouse sobre o `data-markdown-table-frame` atual, evitando ocupar a atenção visual durante a leitura normal.
- Ao clicar para expandir ou recolher, apenas a mudança da largura máxima do conteúdo de tabelas que não sofreram queda para a esquerda usa uma transição leve; assim que ocorre queda para a esquerda, tanto o deslocamento da camada de conteúdo quanto a largura máxima passam a valer imediatamente, evitando que a tabela deslize para a esquerda ou estique por compensação de largura. A largura do slot da barra de rolagem virtual continua usando uma transição leve; quando o sistema tem reduced motion ligado, a transição é cancelada.

## Cálculo

O viewport de rolagem do timeline da V4 precisa ser marcado com `data-markdown-table-layout-root="true"`. Essa marca expressa apenas o limite de layout horizontal até onde a tabela pode se estender e não carrega semântica de estado da sessão. A raiz fornece margens seguras responsivas por `--markdown-table-layout-left-inset` / `--markdown-table-layout-right-inset`; quando existe um mapa de turnos da conversa, a margem esquerda precisa cobrir pelo menos a largura ocupada de `48px` dele, e a margem direita permanece `16px` no desktop e `8px` no Web no celular. A tabela não pode confundir a coluna centralizada de conteúdo da mensagem com o limite de extensão.

Modo comum:

- `scrollbarWidth = frameRect.width`
- `viewportMaxWidth = frameRect.width`
- `maxViewportLeftOffset = 0`
- `viewportLeftOffset = 0`
- `virtualScrollLeft = realScrollLeft`
- `virtualScrollMax = tableWidth - scrollbarWidth`

Invariantes de precisão:

- `scrollbarWidth` preserva a precisão de subpixel de `getBoundingClientRect()` e o mesmo valor é usado tanto na largura CSS quanto no cálculo de `virtualScrollMax`.
- Mantém-se o limite de exibição existente `virtualScrollMax > 1px`; a correção não amplia nem reduz a semântica de produto do overflow horizontal.
- A largura real do track do DOM participa apenas do cálculo da proporção do thumb e da posição visual, e não pode decidir por sua conta se o próprio track está montado.

Modo aprimorado:

- `scrollbarWidth = frameRect.width + rightDistance - rightInset`
- `viewportMaxWidth = scrollbarWidth`
- `maxViewportLeftOffset = max(0, frameRect.left - rootRect.left - leftInset)`
- `viewportLeftOffset = min(virtualScrollLeft, maxViewportLeftOffset)`
- `virtualScrollLeft = viewportLeftOffset + realScrollLeft`
- `virtualScrollMax = tableWidth - scrollbarWidth`