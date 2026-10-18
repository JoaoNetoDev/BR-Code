# Resumo de Streaming Inline do Reasoning

## Contexto

O bloco de thought / reasoning do assistant já expressa "o modelo está pensando". Durante
o streaming ele permanece colapsado por padrão, e o gatilho exibe o conteúdo bruto do
streaming logo após `Thinking ·`; o resumo vem colado ao rótulo e sua largura cresce com o
conteúdo, usando no máximo o espaço restante da linha atual. O usuário ainda pode expandir
manualmente para ver o conteúdo completo.

## Regras

- Quando o bloco thought tem `isStreaming=true`, ele permanece colapsado por padrão; o texto
  `Thinking` do gatilho continua usando `animated-gradient-text`, mantendo o gradiente de
  texto leve, sem novos tokens de cor.
- No estado colapsado o formato é `Thinking · <conteúdo em streaming>`. Em runtime o rótulo
  em chinês usa "正在思考" e no estado concluído usa "思考"; em inglês mantém
  `Thinking` / `Thought`.
- O conteúdo em streaming deriva o snapshot do resumo por limites de linha, mas não converte
  quebras de linha em `<br>`: novos tokens na mesma linha são atualizados no lugar; quando
  aparece a próxima linha não vazia, a linha antiga sai para cima e a nova entra por baixo.
  A troca vertical reaproveita a fila e o ritmo do resumo de ferramentas (300ms de animação,
  500ms de permanência, no máximo o item atual mais dois itens pendentes); em caso de travamento
  da main thread ou reduced motion, converge-se direto para a linha mais recente.
- O viewport do resumo da linha atual acompanha de perto o ponto separador, sem usar `ml-auto`
  nem `text-right`. Enquanto o conteúdo não preenche, ele cresce naturalmente da esquerda
  para a direita; ao atingir a largura restante fora do rótulo e da seta, mantém uma única
  linha e rola para o fim a cada atualização de streaming da linha atual, de modo que o
  conteúdo antigo se desloque para a esquerda e o token mais recente fique sempre visível.
- Quando o resumo sofre overflow horizontal, o viewport usa simultaneamente uma máscara de
  16px nas laterais esquerda e direita; sem overflow, nenhuma máscara é aplicada, evitando
  que as bordas de conteúdos curtos fiquem esmaecidas. É preciso remedir o estado de overflow
  quando a largura do container ou do conteúdo muda.
- O texto do resumo em streaming usa a cor secundária `text-foreground-subtle`; ícone, ponto
  separador e seta continuam usando o `text-foreground-subtlest`, ainda mais fraco.
- Ao expandir um thought em execução, o cabeçalho passa para
  `icon + **Thought** + · + duration`, ocultando o resumo em streaming de linha única e sua
  máscara horizontal; a duration é contada a partir do início do pensamento e atualizada a
  cada segundo, e o thought completo continua sendo anexado em streaming abaixo.
- No estado concluído exibe-se `icon + **Thought** + · + duration`; os três nós de texto usam
  `gap-2`, com o "思考" em negrito e o ponto separador e o "持续了 N 秒" em peso normal.
- A duration em inglês é exibida diretamente como `N seconds`, sem adicionar `for` ou
  `took`; por exemplo `Thought · 2 seconds`.
- Quando tokens chegam na mesma linha, o nó de texto atual é atualizado diretamente; apenas
  limites de linha não vazios usam a rolagem vertical e a fila de resumo iguais às do Explore.
  Quando o reasoning termina, muda-se imediatamente para o resumo de conclusão existente
  `Thought · duration` e o conteúdo pendente é descartado.
- Após o usuário expandir, o thought completo continua sendo anexado em streaming e segue as
  regras existentes de quebra de linha, quebra por largura e ancoragem ao fundo; o
  `whitespace-nowrap` do estado colapsado não pode afetar o conteúdo expandido.
- O usuário ainda pode expandir manualmente um thought concluído para ver o conteúdo.
- O conteúdo de thought expandido só exibe a máscara de borda quando há rolagem vertical real:
  no topo mostra apenas o esmaecimento inferior; no meio, esmaecimento em cima e embaixo; na
  parte de baixo, apenas o esmaecimento superior.
- O conteúdo de thought expandido segue o fundo por padrão; depois que o usuário rola
  ativamente para cima e se afasta do fundo, a ancoragem é pausada, e é retomada quando ele
  volta ao fundo.
- Quando `open` é controlado, o estado externo passado é respeitado, ficando responsável
  apenas por sincronizar a duração e o atraso de descarregamento do conteúdo.

## Compatibilidade

Esta alteração afeta apenas a exibição de thought / reasoning na camada de UI, sem modificar
o ZCode Protocol, o snapshot de mensagens, nem a semântica de desktop continuous ou mobile
replayable. O Web mobile e o desktop consomem as mesmas message parts e compartilham o
padrão de colapsado por padrão e o resumo de streaming de linha única atualizado no lugar.