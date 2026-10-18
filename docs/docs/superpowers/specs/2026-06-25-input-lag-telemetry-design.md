# Design de instrumentação (埋点) de travamento na caixa de entrada (perf_ui_input_lag)

Data: 2026-06-25
Status: projetado, aguardando implementação

## Contexto e objetivos

A caixa de entrada de chat é um editor de texto rico Lexical (`packages/ui/src/LexicalChatInput.tsx`),
e não um textarea comum. Os usuários relatam uma sensação de travamento ao digitar em textos longos ou
em digitação contínua.

O `uiPerfArmsTelemetry.ts` existente já cobre a performance do **lado de saída** (primeiro token, conclusão
da mensagem, agent step, pausa de streaming `perf_ui_stream_stall`), mas não tem observação de travamento do
**lado de entrada**. Este design adiciona uma nova categoria de instrumentação (埋点), reportando ao ARMS a latência de
processamento de entrada para validar a causa raiz com dados de produção e quantificar a sensação.

Não objetivos: não fazer uma latência ponta a ponta de "tecla até paint" (não introduzir pareamento
keydown↔rAF); não fazer distribuição agregada por sessão (a primeira versão capta apenas travamentos acima
do limiar).

## Cadeia em que o travamento ocorre (hipótese de causa raiz)

Cada tecla digitada dispara:

```
editor 内容变化
  → Lexical update
  → TextContentPlugin 的 registerUpdateListener 回调
      → getEditorMarkdown(editorState)   // $getRoot().getTextContent() 全量序列化,O(n)
      → getEditorMarkdown(prevEditorState) // 再来一次全量序列化
      → nextText !== previousText 比较
      → onChange(nextText)                // 同步触发父组件 setState → React 重渲染
```

O ponto quente são as duas serializações completas mais o rerender síncrono provocados por `onChange`.
Quanto mais longo o texto, mais lento `getTextContent()` fica — esta é a primeira hipótese de causa raiz,
validada pela dimensão `text_length`.

## Design

### 1. Evento e critério de medição

- Novo evento `perf_ui_input_lag`, mantendo o agrupamento existente `UI_PERF_ARMS_GROUP = "ui_perf"`.
- Adicionado ao `packages/ui/src/lib/uiPerfArmsTelemetry.ts` existente, **sem criar arquivo novo**,
  com a mesma origem e o mesmo grupo de `perf_ui_stream_stall`.
- Ponto de medição: o update listener do `TextContentPlugin` em `LexicalChatInput.tsx`.
  Usar `performance.now()` para envolver o processamento síncrono `getEditorMarkdown + onChange`,
  obtendo o **tempo de processamento de uma única entrada lagMs**.
- Critério: medir apenas o tempo síncrono dentro do listener, **sem ir até o paint do navegador**.
  Isso é consistente com o critério Ingênuo de `perf_ui_stream_stall`, que mede o "intervalo real",
  sem introduzir a complexidade de pareamento por rAF.

### 2. Condições de disparo, limiares e tratamento de exceções

- **Reportar somente acima do limiar**.
- `INPUT_LAG_REPORT_THRESHOLD_MS = 500`: ponto de partida conservador, capturando apenas os travamentos
  mais graves, com volume de eventos muito pequeno; exportado como constante, para poder ser apertado
  depois conforme a distribuição de produção
  (consistente com a forma de `STREAM_STALL_REPORT_THRESHOLD_MS`).
- `INPUT_LAG_SANITY_MAX_MS = 5000`: acima desse valor, provavelmente é debugging por breakpoint, aba
  suspensa ou saída do sono do dispositivo; descartar para não poluir a distribuição (mesma ideia de
  `LAUNCH_TO_INPUT_SANITY_MAX_MS`).
- **Falha não bloqueia**: reutilizar o `emit()` existente; uma falha de report apenas gera `logger.warn` e
  nunca afeta o fluxo principal de entrada.

**Exclusões (não contam como travamento de digitação):**

1. **Durante a composição de IME**: durante a composição de IME (输入法) de chinês/japonês, o update é frequente e
   naturalmente caro, o que causaria falso positivo; excluir.
   - Detalhe de implementação: o update listener em si não traz `isComposing`, é preciso descobrir a partir
     do estado de composição da root do editor (ou do `isComposing` do elemento root) se o Lexical expõe
     isso, **a confirmar ao escrever o plano**.
2. **Reescrita programática**: `replaceEditorText` / `setText` / inserção de mention / preenchimento de
   volta pela navegação do histórico — esses `editor.update` que não são digitação do usuário alteram
   muitos nós de uma vez e são caros, mas não são travamento de digitação; excluir.
   - Implementação: marcar essas chamadas de `editor.update` com uma **tag** de update do Lexical;
     o listener lê `tags: Set<string>` e pula ao haver acerto. **A nomenclatura da tag e os pontos de
     aplicação são definidos ao escrever o plano**.

### 3. Campos do evento (payload)

Reutiliza o `ArmsCustomEventPayload` existente (`name` / `group` / `value` / `properties`):

| Campo | Valor | Uso |
|-------|-------|-----|
| `name` | `"perf_ui_input_lag"` | nome do evento |
| `group` | `"ui_perf"` | mantém o agrupamento existente |
| `value` | `Math.round(lagMs)` | métrica principal, o painel faz distribuição/p95 |
| `properties.lag_ms` | igual ao value | critério espelhado do `stall_ms` de stream_stall, para facilitar o filtro por dimensão |
| `properties.text_length` | comprimento atual do texto do editor | atribuição-chave: validar "quanto mais longo o texto, mais travamento" |
| `properties.task_id` | taskId atual (vazio no estado de rascunho) | correlacionar a sessão, consistente com os demais eventos ui_perf |

Não incluído (YAGNI): conteúdo do texto (privacidade + volume), model (o lado de entrada não tem relação
com o modelo), quantidade de mentions (a primeira versão olha primeiro text_length; adiciona se precisar).

### 4. Integração e testes

**Integração (simétrica a stream_stall):**

- `uiPerfArmsTelemetry.ts` ganha a nova exportação `recordInputLag(params: { lagMs; textLength; taskId? })`,
  internamente usando o `emit()` existente. Sem novo reporter, reutilizando o `armsReporter`
  já existente (`Root.tsx` já faz `setUiPerfArmsReporter`, **sem necessidade de mudar o Root**).
- `TextContentPlugin` em `LexicalChatInput.tsx`: `performance.now()` envolvendo
  `getEditorMarkdown + onChange`, calculando `lagMs`; ler `tags` para pular reescritas programáticas e
  pular o estado de composição de IME; chamar `recordInputLag` quando `lagMs > 500 && lagMs <= 5000`,
  com `text_length` vindo de `nextText.length`.

**Testes (majoritariamente funções puras, no mesmo estilo de `chatErrorArmsTelemetry.test.ts`):**

1. A decisão é extraída para a função pura `shouldReportInputLag({ lagMs, isProgrammatic, isComposing })`,
   com teste unitário cobrindo: abaixo do limiar não reporta, acima do limiar reporta, acima do sentinela não
   reporta, pulo programático, pulo de IME.
2. `recordInputLag`: silencioso sem reporter, campos de payload corretos com reporter, e quando o reporter
   lança erro apenas faz warn sem propagar.
3. Não escrever E2E pesado na camada de componente: o comportamento de update do Lexical em jsdom é
   instável, e a lógica de decisão já está coberta pela função pura.

**Arquivos alterados:**

- `packages/ui/src/lib/uiPerfArmsTelemetry.ts`: constantes + `recordInputLag` + `shouldReportInputLag`.
- `packages/ui/src/LexicalChatInput.tsx`: integração no `TextContentPlugin` + tag nos updates programáticos.
- `packages/ui/test/uiPerfArmsTelemetry*.test.ts`: casos de teste acrescentados/novos.

## Registro de decisões-chave

- Escopo de cobertura: não limitado a um único fenômeno; a instrumentação (埋点) cobre o que é mensurável, e a primeira versão foca na latência de processamento de keystroke.
- Estratégia de reporte: reportar somente travamentos acima do limiar (volume mínimo de eventos; comentários no código citam a preocupação de que reportar item a item aumentaria demais o volume).
- Mecanismo de medição: temporização com `performance.now` dentro do update listener (o mais próximo do custo real de processamento, com a menor mudança).
- Limiar: 500ms (especificado pelo usuário, ponto de partida conservador).
- Reescrita programática: excluída (olha apenas a sensação de digitação pura, o critério mais limpo).