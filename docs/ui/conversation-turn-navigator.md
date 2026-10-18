# Navegador de Turnos da Conversa

O navegador de queries da conversa V4 é o rail compacto de salto rápido à esquerda da linha do tempo do chat. Não é um minimap de rolagem mapeado pela altura real das mensagens, mas entradas em barras horizontais empilhadas uniformemente conforme a ordem das queries visíveis ao usuário. O catálogo deve cobrir todas as queries do usuário na branch válida atual: o primeiro frame continua usando um tail snapshot limitado, e em telas largas, quando existem rows anteriores, eles são completados pela paginação somente-leitura `rows/range` já existente, deriving o catálogo a partir da projection do renderer. Não cria uma segunda fonte de verdade da sessão, fila replayable, relay ou estado do main process.

```text
CLI full projection
  -> bounded v4 snapshot.rows tail
  -> navigator-visible renderer
       -> rows/range(200 rows/page) until firstRowId
       -> epoch/cursor validation
       -> one projection merge
  -> buildConversationTurnRenderUnits(full rows)
  -> ConversationTimeline virtualizer
       |-> message column
       |-> left compact query rail virtualizer
             one item: one UserInputRow(origin=realUser)
             hover/focus: that user query + owning turn assistant excerpt
             click: mount unitIndex -> align exact rowId
```

## Limites de mudança e registro de confirmações

| Decisão | Semântica de produto |
| --- | --- |
| Granularidade da navegação | Cada `UserInputRow(origin=realUser)` visível na timeline vira uma entrada independente; query comum e steer/guide aceito são equivalentes |
| Mesmo product turn | A query inicial, o guide 1 e o guide 2 podem compartilhar `turnId` / `unitIndex`, mas devem ter `rowId`s distintos, entradas de navegação e pontos de chegada distintos |
| Tooltip | O primeiro parágrafo mostra a query de usuário daquela entrada; o segundo usa o resumo do texto do assistant do product turn dono, com fallback de em execução/vazio; não concatena corpo de tool, reasoning, subagent ou marker |
| Limite da fila | Entradas ainda na fila pendente não têm row/âncora na timeline e não entram na navegação; só entram depois de consumidas e projetadas como real user row visível |
| Catálogo completo | Confirmação do usuário em 2026-07-24: o catálogo não pode cobrir apenas a janela tail atual; é preciso completar todas as rows da branch válida atual, até `window[0].rowId === firstRowId` |
| Virtualização | O catálogo completo monta apenas os botões dentro do viewport do rail e do overscan; `data-item-count` representa o total de queries, e o número de botões no DOM não é mais igual ao total do catálogo |
| Limite multiplataforma | desktop continuous e web remote replayable compartilham a query somente-leitura `rows/range` já existente; não se adiciona FIFO multiplataforma, campo de snapshot ou estado de recuperação; abaixo de `conversation < 864px` nenhuma requisição é feita, e em tela larga com tail de menos de duas queries há sondagem para trás |
| Acerto no Composer | O rail precisa continuar respondendo a hover/click quando estiver sobre a margem transparente à esquerda do composer sticky; a casca transparente do composer dock não pode capturar eventos, e o conteúdo real do composer permanece interativo |

## Escopo

- O navegador não mede via JavaScript a distância geométrica entre o pane e a coluna principal de entrada; a exibição e a reserva de espaço finais para pane largo/estreito, split e `/remote` em celular são responsabilidade das CSS container query. O renderer apenas observa se o container nomeado da conversa atingiu o mesmo limiar de carregamento de dados de `864px`, evitando que um rail invisível dispare uma busca de histórico completo de alto custo.
- Só é exibido quando existem 2 ou mais queries navegáveis e o container nomeado `conversation` atinge `864px` de largura; abaixo de `864px` é ocultado por CSS, sem adicionar estado de medição de largura em JavaScript.
- Cada barra horizontal representa uma `UserInputRow(origin=realUser)` visível; múltiplas queries de steer/guide dentro da mesma `ConversationTurnRenderUnit` viram entradas separadas.
- A unit `timelineOnly` apenas com markers (v1) não entra no minimap, evitando que limites de compact/fork/goal sejam lidos como um turno de conversa entre usuário e assistente.
- Quando o navegador atinge `864px` e o snapshot ainda tem rows anteriores, ele sonda em segundo plano a branch válida completa; só quando o histórico completo alcança 2 queries navegáveis o catálogo é mesclado e exibido de uma vez; com apenas uma, ele varre até o início mas não mantém sondagem permanente de rows. Durante a completude, o catálogo é marcado com `aria-busy=true`; em caso de sucesso deve exibir todas as queries, e em caso de falha mantém a janela atual aguardando um novo cursor ou uma nova chance explícita de retry, sem entrar em estado de erro de conversa.

## Limite de Dados

O Navegador continua consumindo apenas `buildConversationTurnRenderUnits(rows)`, mas o catálogo primeiro faz a mesma `ConversationProjectionStore` completar as rows pelo `rows/range` já existente:

- Cada linha de `visibleUserInputs` com `origin=realUser` fornece uma entrada de navegação e um resumo da questão.
- `assistantTextRows` segue a lógica antiga para fornecer o resumo da resposta do assistente do product turn dono; múltiplos query items do mesmo turn podem compartilhar esse resumo do assistente.
- `rowId` é a âncora DOM exata da query; `unitIndex` serve apenas para montar primeiro o turno virtual dono.
- `isRunning` apenas enfatiza a última query de real user da unit em execução.
- O corpo de tool, reasoning, subagent e compact marker não entra no resumo de hover.
- A busca completa usa paginação `rowsRangeMaxLimit`, pré-inserida de uma só vez após o sucesso de todas as requisições, evitando disparar um `buildConversationTurnRenderUnits` e uma reconstrução do virtualizer por página.
- Se durante a busca o `logEpoch` mudar ou o cursor da primeira linha for reescrito por snapshot/resync, todo o lote é descartado, ficando proibido ressuscitar rows de branches antigas.
- A sondagem do catálogo completo retorna o resultado discriminante `hydrated / not-enough-queries / retryable-failure / stale`; `hydrated` e `not-enough-queries` são registrados como estado terminal por `sessionId + logEpoch`, e um `loadOlder` comum que altera a primeira linha do renderer não pode disparar uma varredura repetida. Falhas temporárias são repetidas no máximo duas vezes com backoff de `250ms / 1000ms`; stale não grava marcador de conclusão e aguarda um novo snapshot/epoch para novo disparo.

```text
desktop-continuous stream
  -> tail projection
  -> rows/range full hydration
  -> navigator items

web-remote-replayable restore
  -> tail projection
  -> same rows/range full hydration when wide navigator is visible
  -> navigator items
```

As duas cadeias compartilham a mesma projection do CLI e a query somente-leitura. O navegador não persiste um catálogo independente, não enfia rows completas de volta no snapshot do wire e também não restaura nem concatena um histórico próprio do minimap.

## Interação

- Ao passar o mouse ou focar a barra horizontal por teclado, exibe-se o `HoverCard`: o primeiro parágrafo é a query de usuário daquela entrada, e o segundo são os primeiros parágrafos do texto do assistant do product turn dono; sem corpo em estado final, mostra o texto de em execução/vazio.
- Ao clicar, se a row já estiver montada, alinha direto pelo `rowId`; se não estiver montada, chama primeiro `virtualizer.scrollToIndex(unitIndex, { align: "start" })` e depois alinha com precisão pelo `rowId` em um frame de animação subsequente, sem recuar para a primeira query do mesmo turno.
- Se o usuário tiver `prefers-reduced-motion: reduce` ativo, o clique usa rolagem instant/auto; caso contrário, usa smooth.
- A real user row exibida perto do topo do viewport atual é deduzida como a query ativa. No estado padrão, a ativa é expressada apenas por cor/opacidade, sem alterar a largura ou altura da barra horizontal.
- A posição das barras horizontais não usa `getOffsetForIndex()` nem proporção real de rolagem; apenas a janela visível do virtualizer determina a ativa.
- Em hover/focus, a barra horizontal assume temporariamente o foco visual e apresenta um efeito de "picos de montanha": a barra central é a mais longa e brilhante, e as 1-2 barras vizinhas crescem apenas de forma decrescente por distância, sem gradiente de cor em degraus. Após mouseleave/blur os picos desaparecem e resta apenas a cor de scroll active.
- O rail usa rolagem virtual com altura de linha fixa, renderizando apenas itens visíveis e um pequeno overscan; quando a query ativa da timeline muda, o rail usa a API pública do virtualizer para rolar a entrada correspondente do catálogo para dentro do próprio viewport.
- Animar apenas transform, opacity, color ou height, e suportar `motion-reduce:transition-none`.

## Layout

- O rail é fixo no lado esquerdo dentro do viewport da timeline, usando um stack vertical compacto e equidistante; o espaçamento entre barras não varia com a altura das mensagens.
- O rail é ocultado com `visibility + opacity + translateX` quando `conversation < 864px`, e após atingir `864px` ele aparece com fade e desliza de volta ao lugar; a transição deve suportar `prefers-reduced-motion`. Quando oculto, as tabelas Markdown não podem continuar reservando o espaço à esquerda de `48px` do rail.
- A largura da área de interação completa do rail permanece em `48px`; o React não mede a distância geométrica entre a coluna principal de entrada e a timeline, nem decide a montagem do rail via `ResizeObserver`; o ResizeObserver apenas fornece a elegibilidade do contêiner para a busca do histórico completo e não participa do layout.
- O stack do rail é centralizado verticalmente dentro do container `ConversationTimeline` dono. Em split, cada pane usa a linha central do próprio container de timeline, sem posicionamento pela altura do app/window inteiro.
- As hit areas de botões adjacentes devem encostar continuamente, sem usar `gap` de CSS para deixar vácuo, evitando que o estado de hover se rompa quando o mouse desliza verticalmente por uma área em branco.
- A casca transparente de largura total do composer dock sticky usa `pointer-events:none` e restaura `pointer-events:auto` apenas na coluna de conteúdo real; mesmo que o rail se estenda na faixa vertical do composer, ele deve manter hover, focus e click.
- A expansão inline do painel de status à direita não altera a posição do rail colado à esquerda. O rail não participa do cálculo da largura da coluna de texto nem da altura das mensagens.
- Não usar raw color; barras horizontais e hover card usam tokens semânticos, como `bg-popover`, `text-popover-foreground`, `border-popover-border`, `foreground-subtle/subtlest`.

## Testes

A cobertura está registrada no grupo `TN` de `docs/conversation-session-case-catalog.md` e em `docs/testing/conversation-session-e2e-coverage-matrix.md`. Os testes unitários cobrem a derivação por query item, a dedução de active row para múltiplas queries no mesmo turno, a mesclagem única da paginação completa e os níveis visuais de "picos de montanha" apenas no hover; os E2E cobrem exibição em pane largo, ocultação e restauração ao estreitar a janela em pane estreito, hit area contínua colada à esquerda em modo compacto, acerto na área de sobreposição vertical do composer, tooltip de query + assistant, virtualização do catálogo e salto preciso ao clicar.

## Impact Brief e podas

| Campo | Conclusão |
| --- | --- |
| Camada de mudança | `presentation + recovery(read-only pagination)` |
| Superfície de UI | `ConversationTimeline -> ConversationTurnNavigator` |
| Dono de exibição | renderer `ConversationProjectionStore` e o virtualizer do React |
| Dono autoritativo | CLI `ProductProjection`; o catálogo não se torna nova fonte de verdade |
| commit/efeito | Nenhum comando de escrita; apenas chama o `v4/conversation/rowsRange` existente |
| Downstream obrigatório | ancoragem de prepend de scroll, conversation find, active query, acerto no composer sticky, gate de pane largo/estreito |
| Invariantes de isolamento | Não ampliar o snapshot do wire; não modificar queue/owner/lease; não misturar continuous/replayable; pane estreito sem requisições; a contagem parcial de queries do tail não vale como contagem da branch completa |

Conclusão de poda: sessões concluídas grandes representam o caso de catálogo completo e virtualização; em execução, apenas acrescentam guard de concorrência de epoch/cursor, sem produto cartesiano com model/provider, queue, goal, compact, theme ou locale. Desktop largo representa o pointer hit-test; Web comum e celular compartilham DOM/CSS, e a tela estreita do celular é podada pelo gate de elegibilidade de hydration. Remote verifica apenas a reutilização do `rows/range` existente e a fronteira de epoch, sem duplicar um conjunto próprio de estado de negócio do catálogo.