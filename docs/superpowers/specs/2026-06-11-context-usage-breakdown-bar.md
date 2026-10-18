# Barra de Breakdown de Uso de Contexto

## Contexto

O popover de context usage hoje exibe apenas o total used / size e a taxa de acerto de cache. O
Agent já consegue contabilizar os caracteres de contexto por origem nos logs de depuração de
`context_usage_snapshot`, mas a cadeia de UI não recebe esses dados de origem, e o usuário não
consegue ver de forma clara após cada requisição do que é composto principalmente o contexto.

## Objetivo

- Reutilizar no popover de context usage a barra de progresso de contexto usado do header,
  dividindo a parte usada por origem.
- As proporções são calculadas a partir de `chars` de cada origem, exibindo apenas porcentagens,
  sem números de caracteres ou de tokens.
- As origens cobrem pelo menos: Messages, System prompt, Other, Skills, Tool prompt, System
  tools, MCP tools; Other corresponde ao `meta_user_context` interno do agent, evitando expor na
  UI o conceito de "meta user", de difícil compreensão.
- Os campos devem ser opcionais. Agents antigos, snapshots antigos ou requisições sem breakdown
  continuam exibindo apenas o total atual e a taxa de acerto de cache.
- O desktop `desktop-continuous` e o mobile `web-remote-replayable` apenas repassam o mesmo usage
  payload, sem alterar a semântica de snapshot, stream, queue, owner ou recuperação.

## Fluxo de dados

1. O runtime do Agent gera o context usage snapshot antes da requisição ao modelo principal,
   com base nas options reais da requisição.
2. Do `categories` do snapshot, extrai `{ source, chars }`, filtrando valores inválidos ou 0, e
   coloca o resultado como `contextUsageBreakdown` no payload de `ModelComplete`.
3. A camada de compatibilidade App/service mapeia `contextUsageBreakdown` para
   `usage_update.breakdown` do task stream antigo.
4. A UI store, o snapshot de runtime e a projeção de replay preservam esse campo opcional.
5. `ChatContextUsage` usa `breakdown[].chars / sum(chars)` para calcular a largura dos segmentos e
   a porcentagem da legenda, e atribui cores em ordem decrescente de proporção: quanto maior a
   proporção, mais escura a cor.
6. Se um snapshot de estado terminal ou de recuperação trouxer apenas `used/size/cache` sem
   breakdown e `used/size` for consistente com o usage live atual, a UI deve preservar o
   `usage_update.breakdown` live, evitando que o alinhamento do snapshot após o task_complete
   apague a barra de proporções.

## Regras de UI

- A parte usada do used progress no header é dividida diretamente em segmentos por origem, sem
  desenhar uma segunda barra de proporções no body.
- Os segmentos usam tokens da escala de azuis específica do context breakdown, próximos dos
  segmentos de azul de baixa saturação da UI de referência, sem reutilizar a paleta arco-íris do
  usage chart global; as cores são atribuídas conforme a ordenação atual, e a maior proporção usa
  a cor mais escura.
- A legenda usa layout de linha compacta, suportando chinês e inglês e larguras estreitas do Web
  mobile, sem exibir as quantidades brutas de char/token.
- Sem breakdown ou com total de caracteres igual a 0, a barra de progresso do header regride para
  um used fill de cor única, sem afetar o botão de compactação nem a taxa de acerto de cache.
- A taxa de acerto de cache mantém a lógica de exibição atual.

## Fora de escopo

- Não modificar a origem nem o cálculo de tokens do used / size da context window.
- Não expor à UI todo o detalhe de ferramentas/skills dos logs de depuração.
- Não introduzir semântica de ordenação para a busy queue do desktop ou para a queue replayable
  do mobile.