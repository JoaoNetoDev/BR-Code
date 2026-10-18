# Dynamic Workflow: Apresentação (spec)

Status: implementado. Este documento descreve como um workflow é desenhado, antes e durante
uma execução: o payload de exibição que a ferramenta entrega à GUI, a linha do tempo
construída a partir dele, a sobreposição da execução ao vivo, e as superfícies que os
mostram. O analisador que produz os grafos é
`apps/zcode-cli/packages/dynamic-workflow/docs/analysis.md`; o motor que produz os eventos
de execução é `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`; o fluxo
de inicialização em torno da janela de confirmação é `docs/dynamic-workflow/launch.md`; o
cartão de conclusão, as notificações e a transcrição do script são
`docs/dynamic-workflow/transcript-and-notifications.md`.

## O que o usuário vê

Um workflow é desenhado como uma **linha do tempo** horizontal: um trilho, com as fases
do script como **estações** sobre ele, os subagentes de cada fase como **pílulas**
penduradas sob sua estação, e as arestas de fluxo de controle que pulam ou retornam como
**arcos** no ar acima do trilho. Fases cujos subagentes rodam ao mesmo tempo ficam em
**trilhos** paralelos entre um fork e um merge. A mesma linha do tempo aparece em três
lugares, e todos os três a constroem com uma função pura,
`buildWorkflowTimeline(graph, run)` (`packages/ui/src/components/workflow-timeline/timeline-model.ts`):

| Superfície | O que desenha | Dados da execução |
|---|---|---|
| As linhas das ferramentas `CreateWorkflow` e `AmendWorkflow` no chat | enquanto o modelo ainda escreve: apenas a linha da fase, escrita por uma caneta; depois um resumo de uma linha | nenhum |
| A janela de confirmação | a linha do tempo completa, estática, acima do script recolhido | nenhum |
| O cartão da execução sob o turno (`WorkflowRunDigest`) | a linha do tempo, ao vivo: lâmpadas, pílulas e tinta acompanham a execução | `workflowRuns` |
| O painel lateral da execução | o mesmo modelo lido verticalmente como uma **espinha**: uma seção por fase, pílulas como linhas, perguntas sob seu autor, artefatos embaixo | `workflowRuns` |

A linha do tempo muda de forma durante uma execução de exatamente um jeito: em um
**preenchimento**, quando o agente principal escreve o corpo de um buraco e um novo payload
de exibição para o script efetivo substitui o antigo ("Buracos na linha do tempo"). Entre
preenchimentos o conjunto e a ordem de estações, trilhos e arcos é fixo; uma execução só
muda lâmpadas, status das pílulas e tinta, e só pode adicionar pílulas (quando um cartão se
divide em cartões por instância). Não há imagem do fim da execução: a última estação é a
última fase, e nada marca "pode terminar aqui".

O status nunca é apenas cor. Toda lâmpada fica ao lado de uma palavra ou de um ícone com um
`aria-label`, e uma pílula `pending` é pixel a pixel idêntica a uma estática.

## O contrato de exibição

A GUI nunca vê os grafos do analisador. Uma camada de contenção em `packages/core`,
`boundCausalityGraph(causality, flow, handoff)`
(`apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts`), dobra o
grafo de causalidade, o grafo de fluxo de controle e o grafo de handoff em um único payload
de exibição, `causalityGraph` (o campo mantém seu nome histórico). O mesmo payload acompanha
o `display` do pedido de confirmação e a saída de ferramenta que é persistida na linha da
ferramenta, de modo que a janela de confirmação, a linha da ferramenta e o painel da
execução leem um contrato só. Três esquemas o espelham campo a campo:
`apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts`
(a autoridade), `packages/shared/src/zcode-protocol-v4/create-workflow-display.ts`, e o
protocolo v3; todos são `.strict()`.

```ts
interface CreateWorkflowCausalityGraph {
  steps: Step[];               // ≤ 64: ask / world-read sites; the join key for run status
  lanes: Lane[];               // ≤ 32: actors, plus `workspace` / `unknown`
  participants: Participant[]; // ≤ 64: one card per (phase, lane), in hand-off order
  handoffs: Handoff[];         // ≤ 256: {from, to, back?, types?} between participants
  phases?: Phase[];            // ≤ 32: {id, name?, line?, column?, alongside?}, first-reach order
  phaseEdges?: Edge[];         // ≤ 128: {from, to, back?} between phases
  phaseStreams?: Stream[];     // ≤ 128: {from, to} — phase `from` feeds phase `to` while both run
  exits?: string[];            // phases after which control flow can complete normally
  sink?: string[];             // steps whose artifacts reach the return
  holes?: Hole[];              // ≤ 32: {siteId, name, type, phase?, tail?}, the open holes in source order;
                               // a phase or step written by a fill carries `fill: <hole id>`;
                               // a hole's own phase carries the hole enclosing it
  truncated?: true;
}
interface Step { id; kind: "ask" | "world-read"; label; labelPattern?; line?; column?;
                 lane; lanes?; source?; phase?; repeat?: "stack" | "serial" }
interface Lane { id; name?; namePattern?: { head?; tail? }; line?; column? }
interface Participant { id; phase; lane; steps: string[]; member?: { index; of }; many?: true }
```

Os ids têm no máximo 64 caracteres, nomes e labels no máximo 128.

**Uma seta.** Uma aresta diz uma coisa, "roda depois", e carrega uma marca opcional: `back`
para a aresta de retorno de um laço. Os tipos de aresta do analisador, sua certeza e
exatidão, suas regiões e a região e certeza de um passo nunca entram no payload; a GUI não
desenha nenhum deles. As arestas de fase são o quociente do fluxo de controle (veja
analysis.md, "The control-flow graph"), então uma seta entre fases responde "para onde a
execução pode ir em seguida", não "qual fase precisa preceder qual". Os handoffs são o
grafo de causalidade quotientado por participante (analysis.md, "The hand-off graph").
Ambos são reduzidos antes de serem enviados.

**Ordem de contenção.** As coleções se referenciam umas às outras, então a camada as corta
em uma ordem fixa e mantém a integridade referencial acima da retenção: a UI nunca deve
receber um id que aponte para nada.

1. Passos: os primeiros 64 em ordem de código-fonte.
2. Trilhas de atores: apenas as trilhas que sobreviveram aos passos entram, em ordem do
   grafo, e então as primeiras 32. Um passo cuja própria trilha foi descartada vai embora;
   um passo com conjunto de possíveis trilhas apenas estreita.
3. Participantes: os `steps` de um cartão estreitam para os sobreviventes e um cartão que
   fica sem nenhum vai embora; então os primeiros 64 na ordem do analisador (o de
   abertura sobrevive, o da cauda não). Handoffs que tocam um cartão descartado vão com ele,
   e então os primeiros 256; cada handoff mantém no máximo 8 `types`. Os steps de um
   cartão descartado permanecem em `steps`, então o status da execução ainda faz join por
   eles; eles apenas não têm cartão.
4. `sink`: os passos sobreviventes entre o `fedBy` do analisador.
5. Fases: a tabela de fases do grafo de fluxo de controle, inteira, incluindo fases apenas
   marcadoras (uma posição de controle pela qual se passa precisa aparecer). Arestas de fase:
   descarte qualquer aresta que toque `entry` ou `abort`; uma aresta para o `sink` do fluxo
   vira uma entrada em `exits`; descarte auto-loops; dobre o resto por par ordenado, com
   `back` apenas quando toda aresta dobrada era um `loop`; então reduzir (abaixo). Se a
   tabela de fases exceder 32 ou a lista de arestas reduzida exceder 128, o **vocabulário
   inteiro** é descartado: `phases`, `phaseEdges`, `exits` e todo `Step.phase` vão juntos, e
   `truncated` é definido. Metade de um retrato de fases mentiria. Um participante cuja fase
   não está listada é recolocado em `unphased`; seu id não muda.
6. Streams de fase (abaixo): cortar em 128 depois das arestas de fase; mais de 128 descarta
   o vocabulário inteiro do mesmo jeito.

`phases`, `phaseEdges`, `phaseStreams`, `exits` e `Step.phase` são tudo-ou-nada: um script
sem marcador `phase()` não tem nenhum deles, e `exits` pode estar vazio dentro do grupo (um
script sem caminho de conclusão normal) mas nunca aparece fora dele. `phaseStreams` é omitido
dentro do grupo quando não há nenhum.

**Alongside.** Uma fase carrega `alongside`: as fases listadas cujas linhas ainda estavam
rodando quando esta fase foi entrada (analysis.md, "Strands and frames"), em ordem da
tabela de fases, no máximo 32 ids, omitido quando vazio. É um **fato de nó**, não uma
aresta. O controle não passou daquelas fases para esta; ambas estão simplesmente em voo.
Então ele nunca entra em `phaseEdges` e nunca passa pela redução, que o leria como "roda
depois" e cortaria uma aresta real em nome dele. A camada de contenção o copia da projeção
de fluxo de controle sob a mesma integridade referencial que as arestas recebem: uma
referência a uma fase não listada é descartada, o próprio id da fase é descartado, o resto
é deduplicado em ordem e cortado em 32. Ele acompanha o vocabulário tudo-ou-nada com
`phases`, `phaseEdges` e `exits`.

**Streams.** Um estágio escrito como um `future` que entrega itens ao próximo estágio por
um canal (authoring.md, "Streams") é concorrente com ele, então a visão de fluxo de controle
relaciona os dois apenas por `alongside` e não tem seta entre eles: um pipeline de cinco
estágios chegou como cinco linhas sem relação. A visão de **causalidade** sim vê o handoff:
um `send` é uma escrita em contêiner e o `for await` a lê de volta, então o quociente de
fases da causalidade carrega uma aresta `data` de produtor para consumidor. Um **stream de
fase** `{from, to}` é uma aresta dessas cujas duas pontas estão lado a lado (o `alongside`
de uma lista a outra): duas linhas vivas só podem trocar dados através de um contêiner
compartilhado, que é o que um stream é. Uma aresta `data` para uma fase que não está
alongside — a escrita depois de `await Promise.all([...stages])` — já é assunto da seta de
controle e não é um stream, e dois futures sem canal entre eles não têm aresta `data` e
continuam sendo duas linhas. A camada de contenção lê `causality.phaseEdges` para o tipo
`data`, descarta auto-loops, arestas que tocam uma fase não listada e pares que não estão
alongside, deduplica por par ordenado na ordem do analisador, e corta em 128. Um stream não
é um `phaseEdge` e nunca passa pela redução (o quociente da causalidade chega reduzido); uma
seta ainda significa apenas "roda depois". O analisador não vê um canal de realimentação (o
`send` posterior de um consumidor no canal de um produtor segue a leitura do produtor em
ordem de percurso), então todo stream que ele produz hoje aponta de uma linha mais inicial para uma
mais tardia; a UI desenha a direção que chegar.

**Redução não tipada.** As arestas de fase dobradas são alimentadas no `reduceOrdering` do
analisador, exportado exatamente para esse propósito: toda aresta para frente como um tipo,
toda aresta de retorno como um carregamento. Isso transforma a redução tipada em uma
redução não tipada, que é o que um único estilo de seta precisa: o conjunto desenhado é um
conjunto gerador irredundante da relação "roda depois", alcançabilidade inalterada, nenhuma
aresta para frente implicada por um caminho de comprimento dois ou mais, nenhuma aresta de
retorno implicada por frente → um salto de retorno → frente, arestas de retorno nunca
servindo como testemunhas.

Ela reduz a **condensação**, não o próprio grafo
(`create-workflow-graph-fold.ts`). Pegue os componentes fortemente conexos das arestas
para frente dobradas — as arestas de retorno são excluídas, porque dizem "próxima rodada", e
contá-las encolheria um corpo de laço inteiro a um ponto e deixaria suas arestas genuinamente
redundantes indeleáveis. Uma aresta cujas duas pontas compartilham um componente sobrevive
incondicionalmente; somente as arestas entre componentes são reduzidas, deduplicadas por par
de componente e tipo, e as sobreviventes são expandidas de volta sobre as arestas brutas. Uma
testemunha que passa por um nó que compartilha um ciclo com qualquer uma das pontas não
afirma nada sobre se o controle pode alcançar o alvo diretamente, então não pode apagar uma
aresta. Duas escolhas independentes que reutilizam o mesmo par de nomes de fase são o caso
que força a regra: o quociente carrega `left → right` e `right → left` como arestas de
ramo ordinárias, e reduzir o grafo bruto apaga `choose → left` na testemunha
`choose → right → left`, desenhando um retrato que diz que o ramo sempre vai para a direita e
que `left` é um desvio a partir de `right`. Fases intercaladas (`a; b; a`) são um componente
pela mesma razão e mantêm suas arestas para frente nos dois sentidos. Handoffs chegam já
reduzidos pelo analisador e aqui são apenas truncados.

**Texto.** Nomes, labels e afixos de padrão vêm de literais do script, então são cortados com
uma fatiagem segura para surrogates: um limite que cai depois de um surrogate alto descarta
o meio caractere. Um nome de ator ou de fase vazio se torna um `name` ausente (a UI localiza
o fallback); um label de ask vazio volta para o id do passo; um padrão cujos afixos foram
ambos cortados é omitido em vez de enviado como `{}`.

**Payloads antigos.** O esquema é estrito e não tem shim de compatibilidade. Um display
persistido que carregue campos que o esquema já não conhece falha em `safeParse`, e a
linha da ferramenta volta para texto puro, sem grafo. Esse fallback é agora o custo *inteiro*
de um campo desconhecido: desde 2026-09-21 o envelope v4 carrega todo payload de exibição
como `.optional().catch(undefined)`, então um payload que este lado não consegue ler é
descartado e o frame ainda é entregue (`docs/v4-refactor/10-protocol-spec.md` §4.4.5). Antes
disso, uma falha estrita de display rejeitava o frame inteiro e derrubava a inscrição junto —
duas vezes, por uma chave adicionada cada vez. Duas exceções são tratadas, ambas pela mesma
limpeza pré-parse em
`apps/zcode-cli/packages/contracts/src/tools/tool-result-metadata.ts` que os dois pontos de
entrada de parse compartilham. Displays persistidos enquanto existia o recurso de
refinamento de nome, hoje retirado, carregam `refinedName` em trilhas e fases e
`refinedLabel` em passos, e essas três chaves são removidas. Displays persistidos de
`get_workflow_run` carregam `providerStop` em seu `error`, escrito enquanto o cartão reusava
o esquema de erro da saída da ferramenta, e essa chave também é removida.

**Quem lê o quê.** `phases` e `phaseEdges` viram estações, trilhos e arcos, `alongside`
vira bandas, e `phaseStreams` viram trilhos de stream e tiram linhas de sua banda.
`participants` viram pílulas, na ordem do payload. `steps` e `lanes` são a chave de join e
o material de nomeação. `sink` decide se a fase implícita de um script sem marcadores conta
como uma saída. `handoffs` e `exits` são transportados e validados, mas nenhum componente os
lê hoje (veja "Open questions").

## O modelo da linha do tempo

`buildWorkflowTimeline(graph, run)` é uma função pura, sem React, sem DOM e sem relógio.
Sua saída:

```ts
interface WorkflowTimelineModel {
  stations: TimelineStation[];   // one per phase, declared order
  rails: TimelineRail[];         // two stations next to each other on one track
  arcs: TimelineArc[];           // every other edge
  bands: TimelineBand[];         // parallel phases, ascending by `from`; empty without `alongside`
  runningIndex?: number;         // the running station (rightmost if several)
  live: boolean;                 // a run took part
  draft?: { agents: number };    // only the pen's model has this
}
interface TimelineStation { id; naming: { id; name? }; pills; status?; visited; rounds; onLoop; track; fraction?; typing? }
interface TimelineRail  { from; to; ink; kind?: "fork" | "merge" | "twin" | "stream" } // absent kind = a plain rail on one track
interface TimelineArc   { from; to; lane; ink; air; stream? }                 // `air` = whose track's air it flies in
interface TimelineTrack { stations: number[]; entry: TimelineInk; exit: TimelineInk }
interface TimelineBand  { from; to; pred?; join?; tracks: TimelineTrack[] }   // inclusive range; tracks[0] = the main line
interface TimelinePill { key; lane: LaneRef; laneClass; runtimeName?; avatarIndex?; status?;
                         instance?: { siteId; ordinal; sessionId? }; slot?: { siteId; ordinal };
                         workspace?: { phaseId }; stepIds; asking? }
type TimelineInk = "faint" | "strong" | "march";
```

**Custo.** O modelo é linear na execução: uma passagem indexa os nós listados por
`(actorSiteId, actorOrdinal)` e cada cartão lê esse índice em vez de percorrer
`run.nodes` de novo, então uma construção custa O(atores + nós) e nunca o produto deles — no
limite de tabela de 1024 atores e 1024 nós o produto seria um milhão de comparações por
frame. O modelo também é construído **uma vez por par `(graph, run)`** e compartilhado por
toda superfície: o grafo e o estado da execução são objetos de protocolo imutáveis (uma
execução alterada chega como um objeto novo), então `buildWorkflowTimeline` memoiza pela
identidade deles e a segunda superfície de um frame — o cartão da execução e o painel da
execução desenham a mesma execução lado a lado — paga uma busca, não uma construção.

**A fase implícita.** Um script sem marcadores não tem vocabulário de fases. A UI lhe dá
uma fase, id `workflow` (localizado como "Workflow"), antes de qualquer outra coisa: todo
passo e cartão é recolocado nela, não há arestas de fase, e `exits` é `[workflow]` quando o
script retorna algo. `withImplicitPhase` devolve um grafo com um vocabulário inalterado
(referencialmente igual, então a memoização se mantém). O `unphased` do próprio analisador
(localizado como "Ungrouped") significa "antes do primeiro marcador" e é uma fase
diferente.

**Estações** são as `phases` do payload na ordem declarada, que é a ordem dos primeiros
marcadores `phase()`. Não há ranqueamento: duas fases irmãs que compartilham apenas um
predecessor ficam na ordem declarada, e a aresta entre elas vira um arco — ou, quando as duas
são paralelas, nada de todo, já que o fork disse isso.

**Trilhos e arcos.** Cada aresta de fase cujas duas pontas estão listadas e são distintas é
dobrada uma vez por par ordenado e se torna um trilho ou um arco; a classificação está
abaixo, primeiro os trilhos e depois o que uma banda faz com as arestas que a tocam. Um arco
é uma **aresta de retorno** quando seu alvo está à esquerda de sua origem; a marca `back` do
payload não é consultada, porque o analisador classifica uma reentrada (um segundo marcador
`phase("plan")`) como aresta para frente e na linha do tempo ela ainda aponta para a
esquerda. Uma estação é `onLoop` quando é a origem ou o alvo de uma aresta de retorno, e
todo membro de uma banda é `onLoop` quando um arco de retorno toca a banda; somente essas
estações mostram uma contagem de rodadas.