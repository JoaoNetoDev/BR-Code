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
**Bands and tracks.** `foldPhaseBands` (`timeline-bands.ts`) transforma `alongside` no
retrato. Ele trabalha apenas com índices de estações, sem ids, sem tinta e sem pixels, então
o mini trilho da barra lateral o compartilha (veja "The sidebar run line"). A relação é
simetrizada primeiro: só a fase posterior pode relatar a anterior, e na tela as duas são
iguais. Componentes conexos com dois ou mais membros dão os intervalos `[min, max]`;
intervalos sobrepostos se fundem, e todo índice dentro de um intervalo é membro, lacunas
fechadas por robustez (elas não ocorrem sem laços). Uma **banda** é um intervalo desses. Seus
membros são divididos em **trilhos** por coloração gulosa de intervalos na ordem declarada:
cada membro pega o trilho mais baixo em que nenhum membro lhe é paralelo, senão abre um
novo. O primeiro membro portanto sempre pega o trilho 0, a **linha principal**. Uma estação
fora de toda banda tem `track: 0`.

**Streams tiram linhas de dentro da banda.** Com `phaseStreams` (veja "The display
contract"), dois membros são paralelos *para a coloração* apenas quando nenhum alcança o
outro ao longo de arestas de stream: um estágio e todo estágio a jusante dele são uma linha
de trabalho, por mais concorrente que seja a execução, e pertencem a um trilho na ordem
declarada. Uma banda cujos membros caem todos em um trilho é **dissolvida**: não é banda,
suas estações ficam na linha principal sem fork, sem merge e sem gêmeos, e são unidas pelos
trilhos abaixo. Um pipeline de cinco estágios é portanto cinco estações em sequência. Uma
linha que nenhum stream alcança (um future lateral) ainda assim ganha um trilho próprio, e a
banda continua sendo uma banda ao redor dela. `foldPhaseBands` recebe os streams como um
terceiro argumento opcional; o mini trilho da barra lateral não passa nenhum, então suas
bandas são as bandas de `alongside` (veja "The sidebar run line").

O `pred` de uma banda é `from − 1` e seu `join` é `to + 1`, cada um só quando essa estação
fica fora de toda banda e uma aresta vai dela para um membro, ou de um membro para ela. Duas
bandas lado a lado não têm nenhuma; o que fica entre elas é um trilho simples.

**Trilhos.** Um trilho une duas estações que ficam lado a lado em um trilho. Há cinco
tipos:

1. duas estações adjacentes fora de toda banda com uma aresta entre elas, como antes; duas
   estações adjacentes sem aresta não têm trilho, e o trilho nunca mente;
2. dois membros consecutivos de um trilho, **incondicionalmente**: um trilho é uma linha, e a
   aresta entre dois de seus membros pode ter sido reduzida — em uma cadeia de sobreposição
   `A → C` representa `A → B → C` com B no outro trilho, e a linha se quebraria de outro modo;
3. `pred` → o primeiro membro de cada trilho, simples no trilho 0 e `fork` acima dele;
4. o último membro de cada trilho → `join`, simples no trilho 0 e `merge` acima dele;
5. `twin`, entre dois membros adjacentes por declaração de uma banda que estão em trilhos
   diferentes. Somente a saliência e a barra lateral leem um gêmeo; o cartão e a espinha
   nunca desenham um, e ele nunca marcha. Diz "estes dois são paralelos", não "o controle foi
   por aqui".
6. `stream`, para um stream de fase entre duas estações que ficam lado a lado em um trilho:
   duas estações adjacentes fora de toda banda (as de uma banda dissolvida, tipicamente), ou
   dois membros consecutivos de um trilho. Ele substitui o trilho simples do mesmo par. Diz
   "alimenta, enquanto os dois rodam", não "roda depois".

Um stream de fase que não é adjacente em um trilho vira um **arco** com `stream: true`: no ar
daquele trilho quando as duas pontas compartilham um trilho de banda, senão no ar de cima. Um
stream entre dois trilhos de uma banda não é desenhado; o fork e o merge já dizem que os dois
rodam juntos.

O `entry` de um trilho é a tinta do seu fork, ou, sem `pred`, forte se e somente se seu
primeiro membro foi visitado; seu `exit` é a tinta do seu merge, ou, sem `join`, forte se e
somente se seu último membro foi visitado. A espinha tinta as ramificações de suas linhas de
fork e merge a partir dessas duas.

**Arestas com bandas.** Uma banda é um nó só para uma aresta. Para uma aresta dobrada
`(f, t)`, com `B(x)` a banda de `x`:

- **mesma banda, mesmo trilho**: consecutivos no trilho → nada, a linha já diz isso; caso
  contrário um arco no ar daquele trilho.
- **mesma banda, trilhos diferentes**: uma aresta para frente é descartada, porque o fork já
  disse que o controle passou pelas duas; uma aresta de retorno se torna o auto-loop da banda,
  um arco reenraizado com `from = B.to`, `to = B.from`.
- **uma ponta numa banda**: absorvida como `pred` ou `join` quando a ponta de fora é adjacente
  à banda; caso contrário um arco reenraizado para a última estação da banda quando sai e
  para a primeira quando chega, no ar de cima.
- **duas bandas**: um arco da última estação da primeira banda para a primeira estação da
  segunda, ou um trilho simples entre elas quando as duas bandas ficam lado a lado.
- **ambas fora**: um trilho quando adjacentes, senão um arco, como antes.

Os arcos são deduplicados por ar e par de pontas depois do reenraizamento. O **ar** de um arco
é o trilho em cujo ar ele voa: um arco dentro de um trilho fica no ar daquele trilho, todo o
resto vai para o de cima, `R − 1` para `R` a maior contagem de trilhos de qualquer banda e no
mínimo 1. Sem bandas não há bandas para dobrar, toda estação tem `track: 0`, todo arco
`air: 0`, e os trilhos são os que a regra antiga produzia, trilho por trilho.

**Pistas de arco.** Arcos recebem alturas por coloração gulosa de intervalos
(`assignArcLanes`): ordenados por extensão, os mais curtos primeiro (a ordem do payload
desempata), cada arco pega a pista mais baixa em que nenhum arco já posicionado o intersecta
por índice de estação, interseção contada em intervalos fechados (dois arcos que
compartilham uma ponta fundiriam seus segmentos verticais). Arcos que não se tocam
compartilham uma altura; arcos aninhados se empilham, o interno baixo e o externo alto; só
arcos que se cruzam são empurrados para cima. As pistas são atribuídas **por ar**
(`assignAirLanes`): dois arcos que voam em ares diferentes nunca se empurram, por mais que se
cruzem em x. `arcLaneCount` é a pista mais alta mais um, perguntada por ar, e define quanto ar
o renderizador deixa acima da linha daquele trilho. As pistas mantêm em alturas separadas
dois arcos que compartilham uma estação; os slots terminais (veja "Rails and arcs" em
"Drawing the timeline") mantêm suas verticais separadas em x.

**Pílulas.** As pílulas de uma estação são os participantes daquela fase na visão de
participantes ao vivo (veja "Splitting cards by instance"), na ordem do payload, que é a
ordem de handoff com o de abertura primeiro. A trilha do agente principal (`main`) nunca faz
uma pílula: seus únicos passos são buracos abertos, e um buraco aberto é desenhado como sua
própria estação (veja "Holes on the timeline"), não como um subagente da fase que contém a
chamada `hole()`. O nome de uma pílula é o nome de runtime que o motor reportou para sua
instância vinculada quando há um, caso contrário o nome de exibição da trilha (veja "Names").
`avatarIndex` é atribuído pela primeira aparição de `lane@ordinal` em toda a linha do tempo,
então o mesmo subagente mantém seu rosto entre fases e os primeiros nove subagentes nunca
compartilham uma cor. Em uma execução ao vivo uma pílula de agente carrega `slot`, a
identidade que ela entrega ao ser clicada: o ordinal da instância quando há um, caso
contrário o ordinal que ela vai receber, `member.index + 1` para um cartão de membro e 1 para
um cartão único ou `many` (o motor numera ordinais por sítio em ordem). Uma pílula de
workspace carrega `workspace: { phaseId }` em vez disso. Uma pílula está `asking` quando
`run.pendingQuestions` nomeia sua instância.

**Registros de entrada da execução.** Uma estação é casada com `run.phases[]` por **nome**:
casamento exato primeiro, e quando o nome de exibição tem exatamente 128 caracteres (o
limite), um casamento por prefixo sobre o nome de runtime (`phaseNameMatches`,
`phase-name.ts`). A mesma regra decide se uma estação é `run.currentPhase`. Uma fase sem
nome (`unphased`, `workflow`) nunca casa.

**O que uma estação observa.** `observePhase` percorre `run.nodes` e mantém aqueles cujo site
id é um dos passos membros da estação (`step.source ?? step.id`, a mesma chave que a
sobreposição usa) e cuja fase de nascimento pertence a esta estação (veja "Narrowing by
phase"). Deles: `visited` (qualquer nó, ou um registro de entrada), `rounds` (o maior ordinal
de nó, ou o `rounds` do registro de entrada, o que for maior), e `fraction` = estabilizados /
observados, ausente quando nada foi observado.

**Status da estação.** Um **estágio** — uma estação com qualquer parceiro de `alongside` ou
qualquer stream, e pelo menos um passo membro — pega sua lâmpada de seus próprios nós e dos
estágios que o alimentam, nunca de `currentPhase` ou de seu registro de entrada. Todo future de
estágio roda seu marcador no instante em que começa, então "entrada" e "atual" não dizem nada
sobre ele: na execução disparadora os cinco marcadores rodaram em 108ms, um estágio ainda
esperando a leitura de seu canal leu `done`, e o último estágio (o `currentPhase`) pegou o
estado final da execução sem ter rodado um nó. A regra do estágio:

1. nenhum nó observado: `pending` enquanto a execução está `pending` ou `running`; depois que
   termina, `done` quando a execução `completed` e a estação foi entrada, senão `pending`;
2. caso contrário o valor da dobra, exceto que um estágio `done` permanece `running` enquanto
   a execução está viva e um estágio que o alimenta (uma fonte de stream) está **aberto**. Um
   estágio está aberto enquanto a execução está viva e ele está `running` ou `pending` pela
   dobra (nenhum nó conta como pendente), ou um estágio que o alimenta está aberto — um ponto
   fixo, então um ciclo de realimentação termina.

Uma estação que não é um estágio, ou um estágio sem passos membros (uma fase apenas
marcadora), mantém a regra sequencial. Os nós membros falam primeiro, depois o fluxo de
controle:

1. Se os passos membros dobram (veja "Folding statuses") para `running` ou `failed`, isso.
2. Senão, se a estação é `currentPhase` e a execução está `pending` ou `running`: `running`
   (o fluxo de controle está aqui entre o primeiro despacho e o próximo marcador).
3. Senão, se é `currentPhase` e a execução terminou: `done` para `completed`, `failed` caso
   contrário (a falha aconteceu nesta fase, tenha ela nós ou não; uma execução parada desenha
   como um nó que falhou).
4. Senão o valor da dobra, se ela tiver um.
5. Senão `done` se a estação foi entrada, `pending` caso contrário.

Sem execução toda estação é `undefined`, toda pílula `undefined`, todo trilho e arco `faint`,
sem rodadas, sem frações.

**Tinta.** Um trilho é `strong` quando suas duas estações foram visitadas, senão `faint`. Um
arco de retorno é `strong` quando sua origem foi visitada e seu alvo tem `rounds ≥ 2`; um arco
para frente quando as duas pontas foram visitadas. Um trilho de stream ou arco de stream é
`march` quando suas duas estações estão `running` (itens estão cruzando agora), senão
`strong` quando seu alvo foi visitado (algo cruzou), senão `faint`. Um arco de stream não é um
laço: ele nunca torna uma estação `onLoop`.

**March** é a tinta da aresta que o fluxo de controle tomou para dentro de uma estação em
execução, e é decidida uma vez por estação em execução em vez de uma vez para a linha do
tempo: dois trilhos de uma banda podem estar rodando ao mesmo tempo, e cada um quer seu
próprio caminho de entrada. Para uma estação em execução `r`:

1. um arco de retorno de reentrada que aterrissa em `r`, ou em `B(r).from` quando `r` está
   numa banda, com uma origem visitada e `rounds(r) ≥ 2`, marcha, e nada mais para dentro de
   `r` marcha;
2. senão todo trilho que não seja gêmeo para dentro de `r` a partir de uma origem visitada
   marcha, então um join ganha seu pedaço de linha principal e cada merge, e o primeiro
   membro de um ramo ganha seu fork;
3. senão um arco que aterrissa em `r` a partir de uma origem visitada.

Trilhos de stream e arcos de stream não participam: sua tinta foi decidida acima e diz se
itens estão cruzando, não por onde o controle veio.

`runningIndex` ainda é a estação em execução mais à direita; é o que a câmera segue, não o
que marcha. A projeção não tem timestamps, então esta é a resposta mais honesta disponível e
uma aproximação conhecida.

`pillActivity(graph, run, pill)` conta os passos de ask e os passos de world-read de uma
pílula e nomeia o passo que está rodando (senão o último estabilizado, senão o primeiro); o
painel mostra as contagens, não o label.

## Juntando instâncias de runtime

O analisador nunca aprende com uma execução. O motor reporta instâncias `{siteId, ordinal}`,
e a GUI decora o retrato estático por site id (analysis.md, "Joining runtime instances").

### Status do nó

`statusOfRunNode` mapeia a fase de ciclo de vida de um nó para o `StepRunStatus` de quatro
valores:

| Fase do nó | Status | Por quê |
|---|---|---|
| `executing`, `repairing`, `nudged` | `running` | há uma requisição ao modelo em andamento |
| `settled` com resultado `ok` (cacheado incluído) | `done` | |
| `settled` com resultado `failed` ou `cancelled` | `failed` | o diário os distingue; o retrato de quatro valores não |
| `queued`, `dispatched`, `waiting` | `pending` | nenhuma requisição chegou ao provedor ainda |

### Dobrando status

`aggregateRunStatuses` é a única dobra, aplicada a um multiconjunto de status de instância:

- um conjunto vazio dobra para `undefined`: **ausência não é um status**, e nenhuma dobra
  inventa um;
- qualquer `running` → `running`, deliberadamente à frente de `failed`: o leitor precisa mais
  saber se algo ainda está se movendo;
- alguns estabilizados e alguns na fila → `running`: começou, não terminou;
- todos na fila → `pending`;
- todos estabilizados → `failed` se algum falhou, senão `done`.

Todas as quatro regras são testes de "qualquer", então dobrar por sítio e depois por
participante dá o mesmo resultado que dobrar as instâncias diretamente.
`collapseStatuses(stepIds, table)` coleta as entradas que existem e as dobra; um passo sem
entrada não participa.

### A sobreposição

`workflowRunOverlay(run, graph)` (`components/workflow-graph/run-status.ts`) devolve uma
tabela **parcial** `statuses: Partial<Record<stepId, StepRunStatus>>`: um passo para o qual
nenhuma instância foi observada não tem entrada. "Nunca rodou" e "na fila" não podem
compartilhar um valor; quando compartilhavam, um ramo cujo outro braço nunca roda (um
receptor ternário, um `if` sem `else`, um `catch` pulado, uma cópia may-set não selecionada)
arrastava sua estação inteira para `pending` depois de ela ter terminado.

Cada passo se torna um alvo indexado pelo seu **site id**, `step.source ?? step.id`. Uma
cópia may-set (`ask#2~actor#1`) e uma cópia de fase (`ask#1~phase#3`) compartilham um sítio
com suas irmãs, então um nó encontrado por site id só é admitido a um alvo se satisfizer as
reclamações desse alvo:

- **trilha**: uma cópia com `source` admite apenas nós cujo `actorSiteId` é igual à sua
  trilha. Um nó sem `actorSiteId` é admitido a todas as cópias do sítio (iluminação
  exagerada, nunca um retrato escuro). Um passo sem `source` não faz nenhuma reivindicação de
  trilha: o cartão único desenhado para um receptor com mais de quatro candidatos pode rodar
  em qualquer um deles.
- **fase**: um passo com `phase` admite apenas nós cuja fase de nascimento pertence àquela
  fase, decidido pelo aglutinador de fases abaixo.

Um nó cujo site id não está no grafo é ignorado; a sobreposição nunca adiciona nem remove
nós. `animatedEdges` é true quando algum passo está rodando.

### Estreitando por fase

O motor carimba cada nó e cada ator com `phaseName`, o nome da fase corrente quando seu
ordinal foi criado (o instante em que `agent()` ou `.ask()` rodou, não o instante em que o
evento foi emitido). O nome é o único vocabulário que o motor e o analisador compartilham.
`phasesOf(name, graph, runHasVocabulary)` (`instance-phases.ts`) diz a quais fases de exibição
um carimbo pertence:

| Carimbo | A execução tem algum carimbo | Pertence a |
|---|---|---|
| presente | — | as fases cujo nome de exibição casa (`phaseNameMatches`) |
| ausente | sim | a fase sem nome (`unphased` ou `workflow`): o analisador coloca passos pré-marcador lá também |
| ausente | não | todas as fases (uma CLI mais antiga, uma execução mais antiga, um script sem marcadores) |

Sempre que a resposta seria vazia, ela é todas as fases: melhor um subagente mostrado duas
vezes que um subagente rodando escondido. `phaseBinder(graph, run)` cacheia essas respostas e,
quando o próprio grafo ainda não tem fases, responde "pertence" para tudo. O aglutinador é
compartilhado pela sobreposição, pela visão de participantes e pela observação de estações,
então os três nunca discordam. Sem ele um helper chamado de cinco fases que abre vinte
subagentes cada uma acendeu as cinco estações quando o primeiro lote rodou.

### Dividindo cartões por instância

`liveParticipantView(graph, run)` (`participant-model.ts`) é o único lugar onde um cartão
encontra suas instâncias. As instâncias de um cartão são os atores em sua trilha que deixaram
um nó nos **sítios deste cartão** com um carimbo na fase deste cartão, mais atores que não
deixaram nenhum nó nesses sítios ainda e cujo próprio carimbo de nascimento pertence a esta
fase, ordenados por ordinal. Em uma execução sem carimbos isso se reduz a "todo ator na
trilha", o comportamento mais antigo.| Cartão | Instâncias | Resultado |
|---|---|---|
| `many` (família de tamanho desconhecido) | 0 | o cartão fica, status pela dobra dos passos |
| `many` | ≥ 1 | um cartão por instância, id `${id}@${ordinal}`; handoffs copiados para cada um |
| único | 0 | o cartão fica |
| único | 1 | o cartão **vincula** a instância: id inalterado, nome de runtime exibido, status pela dobra dos passos |
| único | ≥ 2 | divide como `many`: a multiplicidade de runtime vence a estática |
| membro `[i]` (abertura em leque literal) | — | vincula a i-ésima instância por ordinal; nenhuma ainda → `pending`; instâncias além de `of` não recebem cartão |

O status de um cartão vinculado ou dividido é dobrado a partir dos nós daquela instância
nos sítios do cartão sozinho, e uma instância que ainda não tem nó ali é `pending`. Um
cartão de workspace não tem instâncias e nunca se move. Uma execução que terminou é
reproduzida a partir do diário, então uma sessão reaberta ainda mostra nomes de runtime.

### Nomes

Site ids são identidade; nomes são apresentação, e nenhum nome é jamais um site id. O nome
de exibição de uma trilha (`laneDisplayName`, `lane-name.ts`) é, em ordem: a palavra fixa
para uma trilha sintética ("Script" para `workspace`, um rótulo de "não resolvido" para
`unknown`); o literal do autor `agent("planner")` sem alteração (localizá-lo reescreveria o
autor); o padrão de nome renderizado como `head…tail` para um nome interpolado; senão
"Anonymous Subagent", numerado `… N` apenas quando duas ou mais trilhas de agentes
anônimos coexistem, em ordem de trilha, trilhas com padrão não contadas. O nome de exibição
de uma fase é seu `name`, senão a palavra localizada de `unphased` ou `workflow`. A
localização acontece em tempo de renderização, nunca no modelo memoizado: o usuário pode
trocar de idioma no meio da sessão. Uma pílula mostra o nome de runtime acima de todos
esses.

## Desenhando a linha do tempo

`WorkflowTimeline` (`components/workflow-timeline/WorkflowTimeline.tsx`) é DOM puro mais uma
camada SVG para os arcos. Não há biblioteca de canvas.

### Geometria

| Constante | Valor | Significado |
|---|---|---|
| `STATION_WIDTH` / `STATION_GAP` / `STATION_PITCH` | 168 / 24 / 192 | cinco estações cabem em uma coluna de 960px |
| `MARK_X` | 17 | centro da lâmpada a partir da borda esquerda da estação, sobre a coluna de rostos das pílulas |
| `RAIL_ROW` | 24 | altura da linha do trilho |
| `ARC_BASE` / `ARC_LANE` | 26 / 14 | pista de arco mais baixa acima do centro do trilho; espaçamento entre pistas |
| `TERMINAL_PITCH` | 10 | distância entre dois terminais de arco em uma lâmpada |
| `PILL_HEIGHT` / `PILL_GAP` | 32 / 6 | |
| `PILL_STAGGER_MS` | 30 | atraso entre pílulas pousando |
| `PLATFORM_ROW` | 24 | altura da linha de legendas; apenas uma linha do tempo com bandas tem uma |
| `CAPTION_X` | 12 | borda esquerda de uma legenda a partir da borda esquerda de sua estação |
| `TAIL` / `STUB` | 4 / 6 | a cauda da linha principal antes de uma banda sem `pred`, seu toco depois de uma sem `join` |

`ARC_BASE` precisa deixar espaço, depois do raio de canto de 8px, para uma descida longa o
bastante para conter a ponta de seta de 5.25px; em 16 o último segmento apontava para cima
por um pixel e a ponta de seta sumia.

**As linhas.** `timelineLayout(arcs, bands)` dispona o retrato de cima para baixo e é pura,
então `timelineHeight(model)` pode ser obtida sem renderizar: o cartão da execução anima seu
frame entre dois desses valores. Há `R` linhas de trilho, 1 sem bandas e de outro modo a
maior contagem de trilhos de qualquer banda, no mínimo 2. Para cada trilho, de cima para
baixo, o layout deixa o **ar** daquele trilho — 6px para a linha de cima quando esse ar não
tem pistas, 0 para as outras quando o delas não tem nenhuma, senão
`8 + 26 − 12 + 14 × (lanes − 1)` contado apenas sobre os arcos daquele ar — e então uma linha
de 24px com o trilho descendo pelo meio. A linha principal é portanto a linha de baixo.
Depois das linhas vem a linha da plataforma, 24px, apenas quando há uma banda; então 8px, a
coluna de pílulas mais alta, e 8px para a barra de rolagem. O trilho inteiro se desloca para
a direita por um **inset** de 12px quando uma banda começa na estação 0, para que o fork
tenha onde ficar de pé. Sem banda `R` é 1, não há linha de plataforma, e a aritmética é o
ar de arco antigo + 24 + 8 + pílulas + 8 ao pixel.

### A cabeça da estação

Uma cabeça de estação é uma pílula sem fundo: a lâmpada (10px) sobre a coluna de rostos, o
nome (`text-ui-caption`, medium) sobre a coluna de nomes, e então os metadados em
mono: `⟳ n` quando a estação está em um laço e tem rodadas, um `·`, e
`settled/observed` quando nós foram observados. O nome de uma estação pendente é sutil; os
outros são primeiro plano. O `title` da cabeça é o nome, mais "visited n times" em uma
estação de laço.

As lâmpadas usam um vocabulário só, `STATUS_DOT` (`run-status-presentation.ts`):

| Status | Lâmpada |
|---|---|
| `pending` | anel oco, borda `foreground-subtlest` de 1.5px |
| `running` | `warning` preenchido com um halo warning firme de 3px, pulsando (abaixo); o único brilho da página |
| `done` | `success` preenchido |
| `failed` | `destructive` preenchido com um anel destructive de 2px |

**A pulsação.** A lâmpada em execução é a única coisa na linha do tempo que se move num
relógio, e ela carrega toda a afirmação "há trabalho acontecendo aqui". `wf-lamp-running`
mantém o halo de 3px firme a 20% de warning e pulsa a cada 1.6s (`--wf-beat`, declarado ao
lado de `--wf-ease` em `.wf-motion`): a lâmpada bate para 1.12×, com o pico em 12% da
pulsação e de volta a 40%, e emite um anel, uma segunda camada de sombra nascida na borda do
halo a 35% de warning que se alarga até 8px além da lâmpada e desaparece até 70%, e então
descansa. O halo nunca sai, então a lâmpada está acesa entre as pulsações e o anel é a
própria luz da lâmpada e não um segundo brilho. A lâmpada da espinha e as lâmpadas dobradas
da saliência carregam a mesma classe e pulsam com ela.

`running` é `warning`, não `primary`: primary se inverte entre temas e lê como ênfase;
warning é a cor de atividade nos dois. As lâmpadas de nível de execução derivam da mesma
tabela: `RUN_STATUS_DOT` mapeia `completed → done`, `errored → failed`, e `pending` e
`stopped` para o anel oco (uma execução parada é recuperável, não quebrada). A palavra de
status ao lado de uma lâmpada de execução usa cores de texto correspondentes e, para
`stopped`, acrescenta o motivo: "by you", "by the agent", "model error", "process exited".
Uma execução cujo estado carrega `resumable: true` acrescenta uma terceira palavra depois
do motivo, "resumable" / 「可恢复」: o verbo no botão diz o que a ação faz, não o que
sobrevive a ela, então a linha de status carrega a consequência. É o bit de status da CLI,
entregue na execução, nunca derivado na UI a partir da palavra de status.

Quando o host passa `onSelectStation`, a cabeça é um `<button>` (hover: nome para primeiro
plano, halo da lâmpada na própria cor) e abre o painel da execução. Caso contrário é um
`<span>`, não um botão desabilitado: navegadores não despacham `click` em controles
desabilitados, e o cartão da execução depende do click borbulhando para seu toggle de cartão
inteiro.

### Trilhos e arcos

Um trilho é uma borda superior de 1px `foreground-subtlest` entre duas cabeças de estação, o
trilho `march` incluído: `wf-rail-march::after` assenta sobre essa borda um gradiente fixo de
1.5px, transparente na ponta distante e warning total a partir de 80% do caminho,
alcançando 4px além da extremidade do trilho para que a luz toque o halo. Arcos
(`WorkflowTimelineArcs.tsx`) são caminhos `M x_a, railY−7 V lane+8 Q … H … Q … V railY−9`:
para cima da lâmpada de origem, um quarto de volta de 8px para dentro da pista do arco,
atravessando, descendo, parando 9px acima do trilho para que a ponta de seta de 6 unidades
fique sobre a lâmpada de destino.

**Slots terminais.** Onde um arco encontra uma lâmpada há um **terminal**: sua decolagem na
origem, seu pouso no destino. Os terminais de uma estação ocupam slots `TERMINAL_PITCH`
(10px) afastados, centralizados na lâmpada (`arcTerminalOffsets`, `timeline-geometry.ts`),
então uma estação com um único terminal mantém o centro da lâmpada. Os slots vão da
esquerda para a direita: primeiro os terminais cujo arco tem a ponta distante à esquerda da
estação, depois os que a têm à direita; de cada lado o arco na pista mais baixa fica mais
externo, empates resolvidos pela ordem dos arcos. Decolagens e pousos são tratados igual. As
razões:

- A subida e a horizontal de um arco formam um L que se abre para sua ponta distante. Ls para
  a esquerda à esquerda e Ls para a direita à direita ficam de costas e nunca se encontram.
- De um lado, o arco na pista mais baixa vira mais para baixo. Ficar dentro poria sua
  horizontal atravessando a subida do arco mais alto ao lado; ficar fora, sua horizontal
  começa além dessa subida. Este é o argumento de intervalo fechado da regra de pistas
  virado noventa graus. Dois arcos com um terminal de lâmpada em uma estação voam em um
  ar e compartilham essa estação, então suas pistas sempre diferem.

Com as decolagens no centro da lâmpada e apenas os pousos espalhados, uma estação com um
arco de entrada e um de saída desenhava a subida de saída através da ponta de seta de
entrada: duas verticais fundidas em uma linha com a ponta de seta no meio dela (as estações
ramo A e ramo B do script de estresse testfield). Agora dois terminais ficam na borda da
lâmpada, e três ou mais passam além dela. Dois arcos cujas extensões se intercalam ainda se
 cruzam, como uma horizontal sobre uma vertical.

O traço é `--color-workflow-trace` para faint e `--color-workflow-trace-strong` para
strong; um arco `march` é desenhado strong com um caminho aceso por cima, o arco cortado
6px antes para que a luz pare na base da ponta de seta. Um arco novo se desenha da origem ao
destino em 420ms (`pathLength=1`, então a revelação é independente da geometria); mudanças
posteriores de tinta são transições de cor.

**A aresta march.** Nada se move ao longo da aresta para dentro de uma estação em execução.
A aresta march registra o passado — o controle tomou esta aresta — e a lâmpada registra o
presente — o trabalho está aqui — então o movimento pertence à lâmpada; qualquer coisa
viajando pela aresta lê como uma execução ainda a caminho entre duas fases, que é a única
coisa que ela não significa. Em vez disso a aresta recebe luz: a própria cor da lâmpada, mais
brilhante onde encontra a lâmpada e desbotando em direção a de onde o controle veio, como se
a lâmpada tivesse iluminado o caminho por onde entrou. Em um trilho essa luz é o gradiente
acima; em um arco, nas curvas de fork e merge de uma banda e nas curvas da espinha, ela é um
caminho `wf-lit` assentado sobre o caminho base (`MarchLight`,
`WorkflowMarchLight.tsx`): 1.5px, tampas redondas, traçado com um gradiente linear
`userSpaceOnUse` do primeiro ponto do caminho ao seu último, warning com opacidade zero no
primeiro ponto e warning total de 80% em diante. O gradiente corre ao longo de x, que é o
que esses caminhos fazem, exceto por duas curtas subidas.

### Trilhos de stream

Um trilho de stream (`kind: "stream"`) é o trilho comum, cortado no meio de sua extensão
visível por uma lacuna de 22px que segura três **chevrons** `›››`: 5px de espaçamento, cada
um 2.6 × 6.4, traço 1.35 com tampas e junções redondas, apontando ao longo do stream
(`WorkflowStreamChevrons.tsx`). Na linha da estação a extensão é a própria caixa flex do
trilho, a linha desenhada como um gradiente `::before` com a lacuna recortada
(`wf-rail-stream`), então os chevrons ficam sobre nada; a caixa tem pelo menos 42px de
largura, o que deixa cerca de 10px de linha de cada lado dos chevrons. No SVG da banda o
caminho do trilho são dois traços com a lacuna entre eles. Um arco de stream é desenhado como
um arco (com a ponta de seta incluída), sua horizontal cortada do mesmo jeito ao redor de um
grupo de chevrons em seu meio, apontando o caminho do arco.

Os chevrons carregam a tinta. `faint` (nada cruzou ainda) é `workflow-trace`, `strong`
(alguma coisa cruzou, nada cruzando agora) é `workflow-trace-strong`, e `march` (as duas
pontas rodando: itens estão cruzando) é `warning`, os três chevrons acendendo um após o outro
na direção do fluxo (`wf-stream-flow`: opacidade 0.3 → 1 → 0.3 em 1.2s, 0.15s de
espaçamento). O próprio trilho mantém a cor do trilho e nunca se move, e um stream nunca
recebe a luz march.

Movimento é permitido aqui e em nenhum outro lugar sobre uma aresta. Uma aresta march não
pode se mover porque movimento ao longo dela lê como "controle a caminho entre duas fases", o
que uma aresta march nunca significa; um stream que flui significa exatamente isso — itens
estão viajando de um estágio ao próximo agora — então seus chevrons se movem, e só eles. Por
que chevrons: os tocos da saliência, o segmento gêmeo da barra lateral e as linhas-guia já
usam linhas duplas e pontilhadas; um chevron é a única marca que diz direção sem ponta de
seta e lê em monocromático a 1px. Três, não uma fila ao longo de todo o trilho: o trilho
permanece um trilho e os chevrons permanecem um rótulo.

### Bandas no cartão

Sem banda nada acima muda. Com uma, os trilhos se movem para a camada SVG ao lado dos arcos,
porque um fork e um merge são curvas e uma borda não consegue desenhá-las.

A linha principal é a linha de baixo, diretamente acima da linha da plataforma, e trilhos de
ramo se empilham acima dela. As lâmpadas continuam sendo spans de DOM — as classes de status,
o halo e a pulsação vivem em CSS — posicionadas de forma absoluta na linha do próprio trilho,
na borda esquerda da estação + 17. As cabeças de estação se movem para a linha da plataforma
na borda esquerda da estação + `CAPTION_X`, com 156px de largura, mantendo seu nome, seus
metadados e sua semântica de `<button>`-ou-`<span>`. Uma fase de ramo ganha um **líder**
(união) ligando sua lâmpada à sua legenda: 1px, pontilhado 1 on 2 com tampas redondas, na
cor de trace, de 7px abaixo da lâmpada a 10px acima da linha central da linha da legenda. Uma
fase da linha principal não tem líder, sua legenda já fica sob sua lâmpada. Líderes e lâmpadas
dobram com sua estação.

Uma banda bifurca em `forkX`, 16px antes da borda esquerda de sua primeira estação, ou em 4px
quando a banda começa na estação 0. O trilho de ramo `t` deixa a linha principal 8px mais
cedo para cada trilho acima do primeiro, sobe até sua própria linha por dois quartos de
volta de 8px, e corre até 8px antes de sua primeira lâmpada. Uma banda faz merge em
`mergeX`, 10px antes da borda esquerda do join, ou 6px além do slot da última estação quando
não há join; o trilho de ramo `t` vira para baixo 8px mais cedo para cada trilho abaixo do
mais alto e aterrissa de volta na linha principal, o espelho do fork. Sem um `pred` a linha
principal cresce uma `TAIL` de 4px antes do ponto de bifurcação; sem um `join`, um `STUB` de
6px depois do ponto de merge. O modelo não tem trilho para as curvas de ramo de tal banda,
então elas são desenhadas a partir da tinta de `entry` e `exit` dos trilhos.

Um trilho dentro de um trilho é um segmento reto de lâmpada + 8 a lâmpada − 8 na linha
daquele trilho; um trilho de stream sobre um trilho é esse segmento com a lacuna de chevrons
nele. Os trilhos da linha principal passam pelos pontos de fork e de merge, então a linha
principal lê como uma linha reta; um trilho simples cujas duas pontas estão em bandas
diferentes é o pedaço dessa linha entre o ponto de merge da primeira banda e o ponto de fork
da segunda. Um trilho march é aceso ao longo do seu próprio caminho pelo mesmo componente
que os arcos usam.

Um arco cruza na altura de sua pista em seu ar, mas decola da linha de sua origem e pousa na
linha de seu destino. Uma origem dentro de uma banda decola do ponto de merge na linha
principal, 3px acima dele; um destino dentro de uma banda é pousado no ponto de fork na linha
principal, 4px acima dele. Uma estação decola 7px acima da linha de sua lâmpada e é pousada
9px acima dela. Um arco de nível de banda portanto passa pelas linhas de ramo em seu caminho
para cima e para baixo, nas colunas que essas linhas deixam vazias. Um arco que sai de uma
banda sobe ao longo da própria coluna de merge, então sua subida se sobrepõe à vertical de
merge do trilho mais alto; essa é a leitura pretendida, o laço saindo de onde as linhas se
encontraram. Os terminais de uma lâmpada ainda ocupam slots (veja "Rails and arcs"); os
pontos de fork e merge não ocupam nenhum, e os arcos reenraizados ali não contam para os
slots da estação cujo índice carregam. Um fork é um ponto e não uma linha de lâmpadas:
somente pousos o encontram e somente decolagens saem de um merge, então subidas que
compartilham uma dessas colunas nunca ficam sobre uma ponta de seta.

Um cartão recolhido mantém os trilhos e a linha da plataforma e descarta apenas as pílulas.

### A pílula

`WorkflowAgentPill` é a pílula de subagente, no cartão e no painel: 32px de altura,
`rounded-full`, `bg-surface`, o glifo da trilha, o nome, filhos opcionais (as contagens do
painel), e um **slot de cauda** de 14px. A marca de status mora na cauda: um anel girando
para `running` e um check para `done`, ambos em `foreground-subtle` neutro; uma cruz
destructive para `failed`; nada para `pending`. Quando a pílula pode ser aberta, um `↗`
divide a mesma célula da grade; no hover a marca escala para fora e a seta escala para
dentro, então uma marca de status e uma seta nunca disputam largura. O tamanho `row` (24px,
sem fundo em repouso, glifo 14px) é usado pelo rolo do painel.

Uma pílula é um `<button>` exatamente quando o host lhe deu um callback e ela tem um
identificador: uma pílula de agente com `slot` abre a aba de transcrição daquele subagente,
quer o subagente tenha começado ou não; uma pílula de workspace com `workspace` abre a
transcrição do script posicionada em sua estação. Caso contrário é um `<span>` inerte, sem
estado de hover. Hover em uma pílula que pode ser aberta: fundo um passo acima, um traço
interno de 1px na cor do rosto a 35%, o rosto ampliado, o nome em primeiro plano; ao
pressionar escala para 0.985; `focus-visible` acrescenta um anel de 2px. Uma pílula de
workspace não tem matiz e seu traço volta à cor da borda.

### O rosto do Tile

O avatar de um subagente é um SVG desenhado em código, `WorkflowAgentFace`: o quadrado
arredondado do ícone do app (um viewBox de 20×20, raio 7) sem o seu Z, com dois olhos. A
cor do corpo é identidade: nove cores fixas (`FACE_COLORS`): teal `#54B9A6`, âmbar
`#F19D38`, indigo `#6464EF`, violeta `#885CF5`, azul `#3C82F6`, laranja `#ED712E`, rosa
`#EB4699`, verde`#EA4045`) escolhidas por `avatarIndex`, ciclando a partir da décima; sem um índice o nome é
hasheado sobre a mesma paleta. Os olhos são brancos. O traço de hover da pílula usa o mesmo
`agentColor`. Um rosto nunca tem menos de 20px.

A expressão é estado (`faceState`):

| Status da pílula | Estado | Olhos em repouso | Movimento |
|---|---|---|---|
| `pending` / nenhum | esperando | três pontos | os pontos sobem da esquerda para a direita e assentam, então pausam 1.5–3s |
| `running` | varrendo | duas pílulas em pé | pisca 2–3 vezes, olha para o outro lado, pausa 1.5–3.5s; ocasionalmente um olhar focado ou confuso |
| `done` | satisfeito | arcos felizes | pula 2–3 vezes, uma piscada curta como pílulas, de volta aos arcos; pausa 6–10s |
| `failed` | triste | arcos caídos | flutua 1–2 vezes; cerca de 40% das vezes uma rajada de 3–5 sacudidas raivosas, e de volta |

O movimento roda nos temporizadores e atributos próprios do SVG (`data-motion`,
`--wf-face-x`), nunca por estado do React, e para quando a aba está oculta, quando o rosto
sai da viewport, ou quando `prefers-reduced-motion` está definido; a expressão em repouso
permanece, porque ela é informação.

### Passados seis participantes

Uma estação com mais de seis participantes (`ROSTER_THRESHOLD`) não os lista todos.
`stationRoster(pills, { pins })` (`roster-model.ts`) os divide em **fixados** e no
**resto**, e toda superfície usa a mesma divisão. Os fixados, cinco tanto no cartão quanto no
painel, são preenchidos nesta ordem e nunca ficam vazios: perguntando (tem uma pergunta
pendente), depois rodando, depois falho, depois a ordem dos participantes. Rodando não tem
limite próprio: dentro de um balde vale a ordem dos participantes, então um fixado rodando
só é devolvido quando aquele participante para de rodar, e os fixados portanto mudam um de
cada vez. Uma execução estabilizada não tem perguntando nem pílula rodando, então a mesma
ordem lê falho, depois ordem dos participantes, por si só. Quando um participante muda de
balde os fixados são repreenidos; essa é a única reordenação durante uma execução.

Os participantes de uma estação são suas pílulas, e em um limite as tabelas da execução já
não os contêm todos: um agente que o redutor recusou ou despejou ("Reduction") não tem
pílula, não tem rosto no baralho e não tem transcrição, e ainda assim pertence a esta
estação. O modelo da linha do tempo portanto carrega `station.unlisted` —
`{actors, settled, failed, nodesSettled}`, somados sobre os baldes `unlistedByPhase` cuja
fase de nascimento se liga a esta estação pelo mesmo join de `phaseBinder` que posiciona as
pílulas e conta os nós, então o balde unphased cai na estação que já recebe instâncias sem
carimbo. Os quatro números são o `actors`, o `actorsSettled`, o `actorsFailed` e o `settled`
de nós do balde, uma subchave ausente valendo zero. A lista os conta sem listá-los, por
`stationRosterOf(station, pins)`: o limiar é julgado sobre listados mais não listados,
então uma estação deixada com quatro pílulas e trezentos agentes não listados ainda é uma
lista; o total e a contagem "{n} more" somam `actors`. Só `settled` daqueles agentes são
sabidamente terminados, então a contagem e o medidor somam `settled − failed` a done e
`failed` a failed — que é também o que o `✕ n` vermelho atrás da linha conta — e os
`actors − settled` restantes a pending: um agente recusado no nascimento, ou despejado
enquanto ainda estava na fila, ainda não rodou, e a única coisa que o limite não pode fazer é
reportá-lo como done. Essa subtração não precisa de piso próprio, porque o balde é fixado
em `actorsFailed ≤ actorsSettled ≤ actors` na origem ("Reduction"); um agente cujo resultado
a fase não consegue atribuir — um ask cacheado cujo ator nunca foi listado — portanto conta
como pending aqui até ser listado de novo. O `settled/observed` da estação soma
`nodesSettled` aos seus dois números, sendo esse uma contagem de nós e não de agentes. Os
números de uma estação portanto ficam verdadeiros e nunca encolhem quando seus agentes
saem da tabela — apenas suas linhas encolhem.

No cartão a estação são as cinco pílulas fixadas e uma linha a mais (`WorkflowMoreRow`)
com a forma de uma sexta pílula: um baralho de até três rostos do resto em ordem de atenção
(falho, rodando, pending, done; suas expressões já mostram o status), o texto "{n} more",
um `✕ n` vermelho só quando há falhas escondidas atrás da linha, e um `↗` residente na
cauda. Clicá-la abre o painel da execução posicionado nesta estação. Uma estação portanto
nunca tem mais de seis pílulas de altura. A forma dessa mesma linha no painel está
descrita em "The spine".

### Excesso: a saliência

Quando a linha do tempo é mais larga que seu contêiner ela rola livremente; não há
encaixe nem quebra. Estações cuja lâmpada já rolou para fora se dobram numa **saliência**
naquela borda (`WorkflowLedge`, geometria em `timeline-ledge.ts`): as mesmas lâmpadas de
10px, 16px de distância, unidas por tocos de trilho de 6px na tinta do trilho que sai, no
máximo três lâmpadas e um `+n` para o resto (as lâmpadas mais próximas do conteúdo são
mantidas), e um toco de trilho curto da saliência até a primeira estação aberta, desenhado
só quando teria pelo menos 6px. Uma estação é dobrada quando sua lâmpada fica sob a
saliência mais um fade de 40px; a saliência alarga com sua contagem de lâmpadas, então o
conjunto de dobras é iterado até um ponto fixo. A cabeça da estação dobrada esvanece no
lugar (160ms), continua no layout, e não é clicável nem focável; suas pílulas não são
dobradas. O scroller carrega uma máscara de duas bandas: a banda do trilho esvanece sob
uma saliência (ou 40px da borda quando há overflow mas não há saliência), a banda das pílulas
esvanece somente na borda da viewport e somente de um lado que tenha conteúdo além dela.
Nada se dobra quando a viewport mede zero (o primeiro frame, jsdom), e sem overflow não há
saliência, máscara ou barra de rolagem.

A saliência fica de pé na linha da **linha principal**, e seus segmentos são procurados pelo
**par** de estações que unem e não por sua extremidade esquerda: dentro de uma banda uma
estação pode ser a extremidade esquerda de vários trilhos ao mesmo tempo. Um `twin` vira um
**toco gêmeo**, duas linhas de 1px a 2px de distância. A saliência achatou a banda, um fork e
um merge não cabem em 6px, e duas linhas paralelas são a única marca que sobrou ali que
ainda diz "ao mesmo tempo". O conjunto de dobras, a câmera e as larguras dos tocos contam
todos a partir do inset, então viajam com as lâmpadas. A banda do trilho do scroller desce
até o fundo da linha da plataforma, então a legenda de uma estação dobrada é limpa junto com
sua lâmpada.

Cada lâmpada de saliência é um botão com título "{phase} · {status}"; clicar centraliza aquela
estação. Com foco em uma cabeça de estação ou na saliência, `←`/`→` rolam uma estação. Uma
barra de rolagem de 2px corre ao longo da parte de baixo
(`WorkflowTimelineScrollbar`): o comprimento do polegar é viewport²/conteúdo, no mínimo 24px;
ela é invisível em repouso e mostrada no hover, durante a rolagem (800ms) ou durante o
arrasto, e engrossa para 4px sob o ponteiro; o polegar arrasta, a trilha pagina uma viewport
por clique. A barra de rolagem interrompe a propagação de seus cliques e pointer-downs,
porque o click sintético do navegador após um arrasto alcançaria de outro modo o cartão da
execução e o alternaria.

**Câmera.** Em uma execução a câmera centraliza a estação em execução sempre que ela muda;
em um rascunho ela coloca a estação mais nova na borda direita (`index × 192 + 168 −
clientWidth`). Um usuário que rolou não é combatido; a câmera reanexa apenas quando sua
estação de foco muda. Um `scrollTo` inicia um **voo** `{index, target, from}`; enquanto ele
dura a estação alvo é excluída das dobras, já que a viewport foi medida antes da rolagem
começar e reportaria a estação como fora de vista durante os ~300ms de rolagem suave. O
voo termina só por posição, nunca por temporizador: ao pousar (dentro de 1px) ou quando uma
amostra está mais longe do alvo que a anterior, o que significa que o usuário assumiu. O hook
de viewport toma o **elemento** scroller como dependência, não um objeto ref, porque o
primeiro frame do rascunho não renderiza nada e um efeito indexado por ref nunca anexaria
seus ouvintes.

### Movimento

Toda animação é declarada uma vez em `.wf-motion` e compartilhada por cartão, janela de
confirmação e painel. Apenas opacidade, transform e cor se movem; layout nunca se move.

| Classe | Quando | Efeito | Duração |
|---|---|---|---|
| `wf-arrive` | uma pílula ou tile monta | opacidade 0→1, y 4→0; escalonada 30ms por pílula (8ms, limitado a 400ms, no rolo do painel) | 200ms |
| `wf-mark` | uma marca de status muda de valor | escala .6→1 | 180ms |
| `wf-lamp` / `wf-ink` | uma lâmpada ou trilho muda de estado | transição de cor | 320ms |
| `wf-draw` | um arco aparece pela primeira vez | deslocamento de tracejado da origem ao destino | 420ms |
| `wf-lamp-running` | uma estação está rodando | a lâmpada bate para 1.12× e emite um anel | loop de 1.6s (`--wf-beat`) |
| `wf-rail-grow`, `wf-land`, `wf-caret` | a caneta revela uma estação de rascunho | o trilho cresce da esquerda (160ms), a lâmpada pousa (200ms), o cursor pisca quando ocioso | |
| `wf-unfold` | um corpo de cartão ou seção de fase abre | opacidade 0→1, y −3→0; fechar é imediato | 200ms |
| `wf-swap` | uma palavra de tipo ou de status muda de texto | palavra antiga sai, nova entra (com chave no texto) | 200ms |
| `wf-stream-flow` | um stream está fluindo (as duas pontas rodando) | seus três chevrons acendem em turnos, 0.15s de intervalo | loop de 1.2s |

`wf-rail-march`, `wf-lit` e `wf-spine-march` não estão na tabela: a aresta march é tinta,
não movimento, e a pulsação da lâmpada é o único loop que sobra no trilho.

Animações de entrada preenchem `backwards`, não `both`: um preenchimento `forwards`
deixaria um transform no elemento e bloquearia as transições de hover. Sob
`prefers-reduced-motion: reduce` toda duração é zero e todo loop para em um frame fixo (um
halo firme sem batida e sem anel, um cursor firme, os chevrons de um stream que flui firmes em
warning total); a aresta acesa é tinta e não muda. O hover ainda troca fundo, traço e seta
instantaneamente, então nada é comunicado apenas por movimento.

## Buracos na linha do tempo

Um buraco (`docs/dynamic-workflow/authoring.md`, "Holes") é desenhado como uma **estação**,
porque é um lugar no trilho onde o programa ainda não foi escrito, e cresce no lugar quando
é preenchido, porque um preenchimento é um splice neste script. É isso que o distingue de um
sub-workflow, que é uma chamada e aninha. Os quadros de referência estão em
`dwf-assets/experiments/dwf-typed-holes`, e os do frame em
`dwf-assets/experiments/dwf-hole-frames`.

**A estação do buraco.** Uma lâmpada de 10 px com borda `1.5px dashed foreground-subtlest`
e sem preenchimento; o nome do buraco em `text-ui-caption` medium, sutil até ser alcançado;
os trilhos que o tocam tracejados sob as regras de tinta usuais. O trilho de um buraco de
cauda corre 40 px além dele e esvanece: o fim do script não está escrito. A janela de
confirmação lista os buracos por nome em uma fileira de chips e diz que a execução vai pausar
ali; o detalhe conta 「2 个阶段 · 2 处留白」.

**O tipo nunca é mostrado.** O `T` de `hole<T>` é o contrato contra o qual o compilador
checka o preenchimento e que o agente principal lê da notificação; não é algo que o usuário
lê, então nenhuma superfície o imprime: não a estação, não os chips de confirmação, não a
cabeça, não as linhas de preenchimento ou de notificação, não o painel. (Foi um distintivo
mono depois do nome uma vez; um tipo real como `{ target: string; reason: string }` encheu a
cabeça da estação e espremeu o nome até nada.)

**Esperando.** O trilho para dentro do buraco marcha, a lâmpada tracejada assume a borda de
warning e o halo de warning de 3 px, **firme**, já que nada roda ali, e o meta diz 「等待补全」.
O cabeçalho cresce com 「{n} 处留白待补全」 com o ícone de caneta no slot do chip de
perguntas; ambos os chips podem aparecer. A estação e o chip abrem o painel da execução
posicionado no buraco. Nada é digitado na GUI: o agente principal preenche, e o usuário fala
com o agente principal.

**Preenchido com fases.** As fases do corpo ficam onde o buraco estava, como estações
ordinárias, e o que resta do buraco é sua **cabeça**, mantida em uma linha de 24 px acima do
trilho que existe apenas em linhas do tempo com um preenchimento: a caneta (12 px)
centralizada no x da primeira lâmpada inserida, o nome do buraco (`text-ui-caption`
medium, sutil, truncando em 300 px). Seu tooltip diz 「留白「{name}」· 由主代理补全 ·
{time}」; seu clique abre o painel no cabeçalho. Passar o mouse sobre a cabeça, ou focá-la
pelo teclado, desenha o **frame** do preenchimento: uma linha de 1 px na tinta própria do
trilho (`--color-workflow-trace`), raio 8, de 8 px à esquerda da primeira coluna inserida a
8 px à direita da última, do meio da linha da cabeça até 8 px abaixo da coluna mais alta do
preenchimento (4 px abaixo da linha do trilho, ou da linha da plataforma, quando as colunas
do preenchimento não têm pílulas, como quando o cartão está recolhido). A cabeça é sua
legenda: a linha se abre ao redor da linha da cabeça, com 4 px de folga de cada lado, por uma
máscara e não pintando um fundo, então o frame funciona em qualquer superfície sobre a qual a
linha do tempo se senta. O trilho entra no frame pela esquerda e sai pela direita. Nada mais
dispara o frame: não uma estação, não uma pílula, não a área do próprio frame, então cruzar
o cartão nunca pisca. A cabeça fica `foreground` enquanto seu frame aparece. Apenas um frame
é desenhado por vez, então o aninhamento nunca empilha: passar o mouse sobre uma cabeça
externa enquadra o preenchimento externo, o interno incluído; passar sobre uma cabeça interna
enquadra apenas o preenchimento interno. Um preenchimento aninhado que começa na primeira
coluna de seu preenchimento envolvente tem seu frame recuado 4 px à esquerda, à direita e
embaixo por cada preenchimento envolvente, então os dois contornos diferem, ainda que nunca
mostrados juntos. As cabeças compartilham a linha: uma cabeça aninhada cuja primeira coluna
é a primeira coluna de seu preenchimento envolvente é colocada depois do texto da cabeça
externa, na borda direita da cabeça externa + 12 px, já que duas canetas em uma lâmpada
leriam como uma.

**O traço.** O frame é desenhado como um traço só: um caminho SVG com `pathLength` 1 que
começa na borda de cima no x da caneta, corre no sentido horário ao redor do preenchimento e
retorna à caneta. Seu deslocamento de tracejado vai de 1 a 0 em 420 ms sobre `--wf-ease`,
então a linha aparece saindo da extremidade direita da cabeça e fecha na caneta. Sair da
cabeça esvanece a linha inteira em 160 ms; ela não é desfeita, já que sair não é um evento
que mereça movimento. Pelos dois segundos depois de um preenchimento entrar na execução, o
frame se desenha sozinho, não solicitado, em `--color-warning` a 1.5 px, com a cabeça na
mesma cor, e depois larga: a caneta circula o que acabou de escrever, uma vez. Sob
`prefers-reduced-motion` o frame aparece e desaparece inteiro.

**Preenchido sem fases.** A fase própria do buraco hospeda os asks do preenchimento
(`docs/analysis.md`, "Sites"), então nada sobe: a estação mantém o nome do buraco e ganha
uma pequena marca de caneta na superfície da tag depois dele, a lâmpada é a lâmpada comum
do status da estação, e os asks do preenchimento são suas pílulas. Um buraco de cauda
preenchido mantém seus 40 px que a forma aberta tinha. A marca de caneta é a cabeça deste
preenchimento: passar o mouse sobre ela, ou focar pelo teclado a cabeça de estação que a
carrega, enquadra a coluna única da estação, de 8 px de cada lado da coluna e 4 px acima da
linha do trilho até 8 px abaixo de suas pílulas. Sem legenda para segurar, o traço começa no
canto superior esquerdo. Dois segundos depois de o preenchimento entrar, este frame também se
desenha na tinta de warning.

**Crescimento.** As estações à direita deslizam pela largura inserida (um transform, 320 ms,
depois confirmado), a linha do trilho desce 24 px se esta é a primeira cabeça do cartão, as
novas cabeças pousam com `wf-land` e seus trilhos crescem com `wf-rail-grow`, e o frame se
desenha de novo ao redor delas: o movimento da própria caneta, já que um preenchimento é a
caneta escrevendo em um script em execução. A câmera segura o x da estação em espera para
que o olho veja a lâmpada cercada virar a caneta da cabeça. Sob `prefers-reduced-motion` a
nova linha simplesmente aparece.

**O painel.** Um buraco é uma seção com a lâmpada tracejada; esperando, ele abre sobre
quanto tempo, o prompt e o link da execução. Preenchido com fases, uma linha de cabeçalho de
24 px fica antes da primeira seção que o preenchimento escreveu, a caneta (14 px, sobre o
fundo, cobrindo o trilho) onde estaria uma lâmpada, e então o nome. Nada recua: as seções
do preenchimento mantêm a única coluna de texto da espinha, e o aninhamento é dito pelos
frames. Passar o mouse ou focar o cabeçalho desenha o mesmo frame que o cartão, em pé: a
mesma tinta, raio e traço, de x = 8 (à esquerda das lâmpadas) até 12 px antes da borda
direita da lista, do meio do cabeçalho até 4 px abaixo da última seção do preenchimento,
aberta ou recolhida, com o trilho passando por ela de cima para baixo como passa pelo frame
do cartão da esquerda para a direita. O traço começa no x do trilho na borda de cima; a
caneta e o nome do cabeçalho carregam o fundo, então eles são a legenda. O frame de um
preenchimento aninhado é recuado 4 px de cada lado por preenchimento envolvente. O frame
segue as seções conforme elas abrem e fecham. O cabeçalho fica `foreground` no hover, sem
superfície própria, e seu clique ainda abre ou fecha a primeira seção do preenchimento.
Preenchido sem fases, a seção mantém o nome e a marca de caneta, e a marca enquadra aquela
seção, 2 px dentro de seu topo e de sua base. O frame novo se desenha aqui também. Em um
telefone não há hover: a cabeça no cartão abre o painel, um toque em um cabeçalho alterna sua
seção, e nenhum frame é desenhado no toque.

**A barra lateral** desenha um buraco como uma lâmpada tracejada de 6 px, warning enquanto
espera, com a linha 「决定分组 · 等待补全」; depois do preenchimento seu mini trilho tem uma
lâmpada a mais e nada mais.

**A linha de preenchimento.** `FillWorkflowHole` é renderizada pelo renderizador da linha de
`CreateWorkflow` com o vocabulário de buracos, selecionado pelo nome da ferramenta:
「正在补全留白」 com brilho enquanto o corpo transmite, 「留白补全草稿 · 草稿 {n} · {k} 处待修 ·
未运行」 nos diagnósticos com o corpo de feedback do compilador, 「留白已补全 · {name} · {k}
个阶段 · {m} 个子代理 ↗」 quando entra. Sua linha de rascunho é o trilho pai com o
preenchimento no lugar: a cabeça sobre as estações do preenchimento em tinta total, e de cada
lado os vizinhos entre os quais elas ficam, fantasma a 40%. É a única coisa que um rascunho
de `CreateWorkflow` nunca mostra, o contexto, e o cartão cresce para a mesma figura. Um
preenchimento `path` não tem caneta, como uma submissão `path` não tem. A linha aprende o
**nome** do buraco (e o caminho e a linha de rascunho que o corpo de feedback do compilador
cita) do bloco `fill` do payload de exibição, que a ferramenta escreve a partir do buraco
resolvido em todo resultado, entrando ou recusado. Ela não consegue lê-los da entrada da
linha: a transcrição mantém a entrada do próprio modelo (`run_id`, `hole_id`, `script`), e o
bloco `hole` que o resolvedor adiciona para a regra de permissão nunca chega a uma linha (o
mesmo vale para o `predecessor` de `AmendWorkflow`). O primeiro teste de cadeia ao vivo
mostrou a consequência: linhas tituladas pelo site id do buraco, e linhas de cabeça tituladas
por site id uma vez que a execução deixou o estado ao vivo.

**O modelo.** Um buraco é uma fase nomeada pelo buraco, id seu site id (`hole#` e oito
dígitos hexadecimais, indexado pelo nome; `docs/analysis.md`, "Sites"), único por regra 9012,
então toda superfície o rotula só pelo nome. O id não diz nada sobre aninhamento, e nada deste
lado o interpreta além de sua forma. O payload de exibição do script efetivo carrega
`fill: <hole id>` nas fases e passos que um preenchimento escreveu e, na fase ou passo
próprio de um buraco, o buraco que o envolve; `buildWorkflowTimeline` lê o segundo em uma
tabela de pais (`holeParents` no modelo), que é o que permite a cabeça de um preenchimento
externo abranger as estações de um interno e a um quadro aninhado saber até onde recuar.
`holes` lista os que ainda estão abertos,e o payload da linha de preenchimento nomeia o buraco que preencheu em `fill` (`siteId`,
`name`, `draftPath?`, `line?`), que o join do cartão acumula como rótulos de cabeça ao longo
dos preenchimentos; a barra lateral, que desenha apenas de `phaseNames`, lê a tabela de índice
`holes` alinhada em `run-launched` e `hole-filled` para desenhá-los tracejados; o estado da
execução carrega `holes[]` (o documento do motor, "The run snapshot").
`buildWorkflowTimeline` deriva as cabeças das execuções `fill` das fases, então nenhuma
estação aprende um novo tipo. A fase própria de um buraco preenchido que nada reivindica
enquanto seu corpo tem estações próprias não é desenhada: a cabeça já a nomeia, e uma lâmpada
vazia diante do corpo não diria nada. Suas arestas de entrada são unidas às suas arestas de
saída para que o trilho não se quebre. Ela continua em `phaseNames`, então a barra lateral
nomeia cada passo de uma cadeia. A estação própria de um buraco preenchido, quando é
desenhada, pertence ao seu próprio preenchimento (seu `data-fill` é seu próprio id), não ao
preenchimento do buraco ao redor dela. O cartão e o painel pegam o payload de exibição mais
novo cujo run id é deles, que é o da linha de preenchimento após um preenchimento e o do
lançamento antes.

## A área de chat

### A linha da ferramenta

A linha da ferramenta `CreateWorkflow` (`ToolCallBlocks/renderers/create-workflow.tsx`) lê
suas entradas do `input` da linha (script, name, saved source) e seu grafo de
`display.causalityGraph` quando isso faz parse e tem pelo menos um passo. Seu formato segue
o status v4 da linha:

| Estado da linha | Palavra de tipo | Corpo |
|---|---|---|
| `inputStreaming` | "Writing workflow"; do rascunho 2 em diante "Revising workflow" / 「正在修改工作流」 | uma linha `ToolLayout` que não pode ser expandida, com a **linha de fase do rascunho** abaixo dela (não dentro: sem dobra) |
| `pendingApproval` | "Awaiting workflow confirmation" | uma linha `ToolLayout`, recolhida por padrão, expansível até o script (`CodeBlock`, máx 320px) e os diagnósticos; o brilho de execução permanece |
| erros de compilação | "Workflow draft" / 「工作流草稿」 | a linha de feedback do compilador (veja "Compiler feedback"): detalhe "draft {n}", uma lâmpada oca e "{n} to fix · not run", expansível até o script e o cartão de feedback |
| falhou sem display | "Workflow" | uma linha `ToolLayout` com a palavra de status da ferramenta, o erro em seu tooltip, expansível até o texto puro da saída |
| lançado, unido a uma execução | "Workflow" | `WorkflowToolSummary`: "Workflow · {n} agents ↗", uma linha, clique ou Enter/Space abre o painel da execução; texto puro quando o host não pode abri-lo |
| compilado, nunca lançado (recusado, ou um host sem execução) | "Workflow" | o cartão estático: cabeçalho com uma lâmpada oca "compiled", a linha do tempo estática, e uma dobra de script recolhida; estado aberto lembrado por tool id |

A linha da ferramenta `AmendWorkflow` é o mesmo renderizador com o vocabulário de ajuste,
escolhido pelo nome da ferramenta antes do despacho da família
(`lib/workflowToolNames.ts`, `isAmendWorkflowToolCall`), porque o fallback da família de
workflow é o cartão de criação. Ela lê `run_id` do input para sua linha de linhagem e
compartilha o tipo de exibição de `create_workflow`, então o grafo, a caneta do rascunho e o
cartão de feedback do compilador não precisam de uma segunda implementação.

Um ajuste que mantém o script do predecessor (`docs/dynamic-workflow/launch.md`, "Keeping
the predecessor's script") não tem nem `script` nem `path` no input da linha, porque a linha
mostra o que o modelo enviou e o script é preenchido só depois disso. Um ajuste por `path`
também não tem `script`, mas submete um script revisado, então não é lido como um. Assim que
o input termina de transmitir, a linha de linhagem passa a ler "Amends run {id} · script
unchanged" / 「调整 run {id} · 脚本不变」, o cartão não tem dobra de script nem caneta de
rascunho, e o aviso de "sem script" de uma criação vazia não aparece: o script ausente é o
ponto da chamada, não uma falha. Enquanto o input transmite nada é dito, já que um script
pode ainda estar a caminho. Um leitor decide isso para o cartão e para a janela
(`ToolCallBlocks/renderers/createWorkflowInput.ts`, `readWorkflowAmendScriptInherited`): o
`predecessor.script_inherited` do input resolvido, ou um input terminado com nem `script`
nem `path`.

| Estado da linha | Palavra de tipo | Corpo |
|---|---|---|
| `inputStreaming` | "Amending workflow" / 「正在调整工作流」; do rascunho 2 em diante "Revising amendment" / 「正在修改工作流调整」 | a linha de fase do rascunho abaixo da linha, como em uma criação |
| `pendingApproval` | "Awaiting amendment confirmation" / 「等待调整确认」 | como em uma criação |
| erros de compilação | "Amendment draft" / 「工作流调整草稿」 | a linha de feedback do compilador, como em uma criação |
| recusado (`run_not_found`, `missing_boundaries`, e os três do retune) | "Workflow amendment" / 「工作流调整」 | o texto da recusa |
| reajustou uma execução ao vivo no lugar | — | a linha de retune (abaixo) |
| lançado, unido a uma execução | "Workflow amended" / 「工作流已调整」 | `WorkflowToolSummary`: "Workflow amended · {n} agents ↗", abrindo o painel da execução **nova** |
| compilado, nunca lançado | "Workflow amendment" | o cartão estático |

**A linha de retune.** Um `AmendWorkflow` que apenas reajustou o paralelismo de uma execução
ao vivo (`docs/dynamic-workflow/launch.md`, "Changing only the parallelism of a live run") não
compilou nada e não iniciou nada, então nem o resumo nem o cartão estático servem: o cartão
anunciaria uma segunda execução de um script que nunca rodou de novo, e o cartão estático
leria "compiled · amends run X · script unchanged", três afirmações que nenhuma aconteceu. A
linha é em vez disso a **linha de configurações que a GUI deixa para trás**
(`WorkflowRetuneRow`, desenhando `WorkflowSettingsChangeRow`), palavra por palavra: o mesmo
ato não deve ler de duas maneiras porque um modelo e não um usuário o pediu. A única
diferença é que ela é um botão — a linha da ferramenta é onde o passo do modelo caiu, então
abre dali o painel do `input.run_id`.

Ela é reconhecida a partir de fatos que já cruzam o v4, nunca de um novo: o input da linha
tem `run_id` e `max_concurrency` e nenhum de `script`, `path`, `subagent_model` ou `name`
(`readWorkflowRetuneCall`), o status é sucesso, **não há payload de exibição**, e nenhuma
execução se une a esta linha por `toolCallId`. Um retune que perdeu a corrida e se tornou uma
amendment real falha nas duas últimas — ele tem um display e cunha uma execução — então o
ramo unido acima a pega primeiro.

O número que a linha diz é o do próprio modelo, antes do piso do agente, então o paralelismo
padrão da projeção da execução reajustada (`run.concurrencyCeiling`) decide a redação: igual
a ele, e para `null`, a linha diz 「上限恢复为默认」 ("limite de volta ao padrão"); qualquer
outro número, acima ou abaixo, é o número. Um padrão que a projeção não pode fornecer (a
execução foi despejada, ou uma CLI mais antiga nunca enviou um) deixa o número como digitado.
Nenhum `from` é desenhado: o input não conhece o limite anterior, e a redação lê apenas `to`.

Enquanto o input ainda está transmitindo, esse mesmo formato de input mantém a linha em
「正在调整工作流」 e nunca deixa que ela se torne 「正在校验工作流」: não há nada para
validar nesta rota, e a fase que ela nomearia dura algumas centenas de milissegundos. A linha
também não produz cartão de digest de fim de turno — ela nomeia uma execução que não iniciou
nem retomou, e o cartão dessa execução já está na transcrição onde foi lançada ("Joining
cards to runs").

No host v4 a linha unida é interceptada antes do renderizador e substituída pelo resumo,
porque o cartão da execução sob o turno já desenha a linha do tempo ao vivo; o cartão ao
vivo do próprio renderizador permanece apenas para hosts mais antigos. O join é por
`toolCallId`: o estado da execução carrega a chamada de ferramenta que a iniciou, e uma linha
cuja chamada de ferramenta tem uma execução recebe o callback de abertura. Linhas de
`ResumeWorkflowRun` se unem por run id e renderizam um cartão compacto de uma linha
("Workflow run resumed", run id, lâmpada e palavra, `settled/total steps`).

### Feedback do compilador

Um script que não compila não falhou. Nada rodou, e os diagnósticos voltaram para o modelo,
que revisa o script e o submete de novo (`docs/dynamic-workflow/launch.md`, "Failures that
never reach the window"). A linha diz isso com os slots que `ToolLayout` já tem (palavra de
tipo, nome, detalhe, status) e não adiciona nenhum elemento à transcrição. Nunca usa a cor
destrutiva: neste recurso essa cor pertence a uma execução que deu erro.

**Números de rascunho.** O host junta cada linha `CreateWorkflow` e `AmendWorkflow` da janela
da linha em uma posição de rascunho em uma única passagem em ordem de linha
(`packages/ui/src/v4/workflowDraftJoin.ts`, `buildWorkflowDraftByToolCallId`), e o contexto
da linha entrega a cada linha de ferramenta sua própria posição. As regras:

- Uma **linhagem** é a ferramenta, mais o `run_id` predecessor de um ajuste. Criações
  numeram entre criações; os ajustes de cada execução numeram a partir de 1 por conta própria.
- O **ordinal** é 1 mais o número de linhas que falharam na compilação (`display.ok ===
  false`) da mesma linhagem e do mesmo turno desde a última linha daquela linhagem que compilou
  (`display.ok === true`). Uma linha sem display (aindo transmitindo, aguardando confirmação,
  recusada, cancelada) nem conta nem reseta. Um novo turno começa em 1.
- Uma linha é **substituída** quando existe uma linha posterior da mesma linhagem na janela, no
  mesmo turno ou em um posterior.
- A janela é limitada, então um rascunho cujos predecessores saíram dela numera baixo. O
  número é apenas apresentação; nada mais o lê.

**Palavras.** O slot de detalhe lê "draft {n}" / 「第 {n} 稿」 em uma linha de feedback de
compilação sempre, e em uma linha em voo (escrevendo, validando, aguardando confirmação) do
rascunho 2 em diante. Um primeiro rascunho não é numerado enquanto é escrito, então uma
linha nunca prevê um segundo. O status da linha de feedback de compilação lê "{n} to fix ·
not run" / 「{n} 处待修正 · 未运行」 (`errorCount`), e seu tooltip abre com a frase de
feedback abaixo, seguida de uma linha `L{line}:C{col} message` por diagnóstico. O resumo
lançado, o cartão da execução e a janela de confirmação nunca carregam um número de rascunho.
Um host sem o join não mostra número nem lâmpada acesa.

**A lâmpada.** Um anel oco fica antes das palavras de status, a mesma forma de "compiled" e de
uma estação pendente, porque nada rodou. Ela é warning enquanto a linha é o rascunho mais
recente de sua linhagem: ou o laço está vivo, ou o modelo parou ali e a pergunta ainda está
aberta. Assim que existe uma linha mais nova ela fica neutra (`foreground-subtlest`), e isso
é a única coisa que muda em uma linha antiga. As palavras de status permanecem no cinza mais
sutil da linha.

**O cartão.** Expandir a linha mostra o script com números de linha, onde os números das
linhas sinalizadas são tingidos de warning, e abaixo dele o cartão de feedback
(`WorkflowDiagnosticsSection`, compartilhado com o cartão `EvalWorkflowSnippet`):

| Parte | Conteúdo |
|---|---|
| Moldura | `border-border` sobre `bg-panel`, `rounded-xl`; sem borda destrutiva |
| Cabeçalho | "Compiler feedback" / 「编译反馈」, e à direita "{n} notes" / 「{n} 条」 ("1 note") |
| Frase | "Typecheck did not pass, so nothing ran. The feedback went back to the model to revise and resubmit." / 「类型检查未通过，脚本未运行；反馈已交回模型，由它修改后重新提交。」 Para uma fonte salva a frase nomeia o arquivo em vez disso: "The saved workflow file did not pass typecheck, so nothing ran. The feedback went back to the model to fix the file or save a corrected version." / 「保存的工作流文件未通过类型检查，脚本未运行；反馈已交回模型，由它修改该文件或保存修正后的版本。」 |
| Uma linha por diagnóstico | o chip `L{line}:C{col}` em cinza sutil, a mensagem em primeiro plano, o rótulo de código no cinza mais sutil |
| Rótulo de código | `TS{code}` para TypeScript; "rule {code}" / 「规则 {code}」 para os códigos próprios do analisador 9001–9099 (`apps/zcode-cli/packages/dynamic-workflow/docs/analysis.md`, "Diagnostics"), que não são códigos TypeScript |
| Truncamento | "Some diagnostics were omitted." quando o payload é truncado, como antes |

### O rascunho e a caneta

Enquanto o modelo escreve, o analisador ainda não rodou e não há grafo. O cartão varre o
script parcial com um scanner de expressões regulares, não um parser (`draft-scan.ts`):
reconhece `phase("…")` e `agent("…")` com aspas simples, duplas ou invertidas, toma o texto
antes do primeiro `${` de um template, e constrói um modelo só com estações: trilhos tênues
entre estações consecutivas, sem pílulas, sem arcos, sem status, mais `draft.agents`, a
contagem de nomes de agentes distintos. Um segundo `phase("implement")` fechado é um retorno
àquela estação, não uma nova, então a contagem de estações do rascunho bate com a do
analisador e nenhuma estação desaparece na passagem de bastão. Um `phase("ver` não fechado
marca a última estação como `typing`, e texto posterior do mesmo marcador a renomeia em vez
de abrir outra. A prévia do input em transmissão deve portanto manter os campos `script` e
`name` do meio JSON escrito, o que ela faz.

A caneta (`useTypewriter`) transforma os saltos do scanner em escrita. Ela revela uma
estação por vez na ordem declarada; o nome de uma estação revelada é escrito a 24ms por
caractere (`PEN_MS`), e então a caneta descansa 120ms (`PEN_GAP_MS`) antes de revelar a
próxima. Uma estação que a caneta ainda não alcançou não está no trilho, mesmo que o scanner
a conheça. Um nome que cresce no meio da palavra continua sendo escrito; um nome cujo prefixo
mudou volta ao prefixo comum. O tempo é indexado por conteúdo, então um novo array com os
mesmos nomes não interrompe a caneta. O cursor segue a caneta e pisca uma vez que alcançou o
fluxo. A caneta só revela quando há uma próxima estação: um rascunho vazio (as linhas de
abertura do script antes do primeiro `phase(`) não faz nada, e sob movimento reduzido nomes
inteiros são derivados em tempo de renderização em vez de definidos em um efeito. Ambas as
regras existem porque a alternativa, um `setState` a cada quadro enquanto quadros de projeção
se acumulam como commits síncronos, excedeu o limite de atualizações aninhadas do React e
derrubou a área de chat. Quando o display do analisador chega o modelo de rascunho é
substituído inteiro: o cursor sai, as estações mantêm seus nomes, as pílulas pousam, os arcos
se desenham. Uma submissão por `path` ou `saved` não transmite script, então não tem
rascunho nem caneta: a linha vai direto para a validação, e as revisões do modelo de um
arquivo de script aparecem como linhas `Edit` comuns (`docs/dynamic-workflow/launch.md`,
"Script files").

### A janela de confirmação

`WorkflowPermissionBlock` desenha a superfície de decisão do pedido de confirmação (a janela
em si, seus controles Deny / Refine / Run e a opção de "sempre permitir" pertencem a
`docs/dynamic-workflow/launch.md`). Seu cabeçalho é "Run this workflow?", ou "Amend this
workflow?" para um pedido de `AmendWorkflow`, com o nome do workflow (ou "Workflow script")
e um detalhe, "{n} phases"; sem lâmpada, sem contagens de agentes ou passos. Então, para um
ajuste, uma linha de linhagem "Amends run" com o run id, "script unchanged" quando a chamada
manteve o script do predecessor e, quando o predecessor ainda está rodando, "still running,
will be stopped"; então as duas configurações de execução, primeiro o modelo e depois o
limite; e, para uma fonte salva, um badge "Saved workflow" com escopo, nome, caminho e
argumentos.

As duas configurações são frases cujos valores podem ser mudados antes de aprovar
(`docs/dynamic-workflow/launch.md`, "Adjusting the settings in the window"). Elas são
desenhadas sempre que o input traz `adjustable_settings`, tenha ou não a chamada definido os
campos, então um usuário que não muda nada ainda lê o que vai acontecer:

| Linha | Partes |
|---|---|
| Modelo | "Subagents run on" / 「子代理运行在」, depois o chip do modelo: a lista de modelos do compositor (`ModelConfigSelect`, os grupos do popover de Configure, com o modelo da sessão primeiro carregando o badge "session model" / 「会话模型」), seu gatilho desenhado como chip, `h-6 rounded-md bg-surface text-ui-sm`, borda transparente, chevron `size-3`, a borda e o fundo do input aparecendo no hover. Ao lado, o chip de nível de pensamento (`ThoughtLevelCycleControl` no mesmo estilo de chip), apenas quando o modelo escolhido tem níveis; escolher um modelo define seu nível padrão. Um modelo que o input nomeia mas a lista já não oferece mantém seu nome e recebe o badge "unavailable" / 「不可用」; Allow então espera por outra escolha, como faz o Apply do popover. Quando o bloco diz que o host não pode escolher um modelo, ou o workspace não lista modelos, a linha é a frase "Subagents stay on the session model · this agent has no model catalog" / 「子代理沿用会话模型 · 当前 agent 没有模型目录」, a menos que a chamada nomeie um modelo (um ajuste que herdou um): então é a linha simples "Subagents run on {model}", porque a janela não deve dizer o contrário do que vai rodar |
| Limite | "At most" / 「最多」, um stepper (`InputGroup` a `h-6`: menos, um número mono `w-[30px]`, mais) a partir de 1 sem fim superior, depois "subagents at once" / 「个子代理同时运行」, e depois em texto mais sutil "· default {n}" / 「· 默认 {n}」, que passa a "· = default" / 「· = 默认」 quando o valor é o padrão. Sem padrão conhecido e sem valor também começa vazio e a cauda lê "· no limit of its own" / 「· 不设上限」 |

Quando o input traz `model_bindings` (o script nomeia modelos para alguns de seus subagentes,
`docs/dynamic-workflow/authoring.md`, "Choosing a model per subagent"), a janela não os
desenha: essas escolhas são do modelo de autoria, no script que a janela mostra, e uma linha
por nome enterraria a única decisão que a janela pede. Só a abertura da linha do modelo
muda, para "By default, subagents run on" / 「子代理默认运行在」 (simples: "By default,
subagents run on {model}"; sem catálogo: "By default, subagents stay on the session
model"), porque ela não fala mais por todo subagente. As linhas do painel da execução nomeiam
o modelo próprio de cada subagente uma vez que ele roda.

Cada linha é `flex flex-wrap items-center gap-x-1.5 gap-y-1 min-h-6 text-ui-sm
text-foreground-subtle`, e as linhas ficam em um bloco `space-y-1`. Um valor intocado é
desenhado no peso comum do chip. Um valor mudado vai para `font-medium` e a linha ganha uma
cauda em texto mais sutil, "· was {value}" / 「· 原为 {value}」, com um botão de reset
fantasma `icon-xs` (lucide `Undo2`, tooltip "Back to the proposed value" / 「恢复原值」) que
devolve a linha. "was" nomeia com que a linha começou: o valor da chamada quando ela definiu
um, o padrão que a linha mostrava caso contrário. Nada mais muda de cor: peso basta em uma
linha tão curta. Assim que alguma linha mudou, as duas primeiras opções se redescrevem
(`docs/dynamic-workflow/launch.md`, "The options"). Enquanto a resposta está em voo todo
controle é desabilitado junto com as opções. O tooltip do chip carrega a string canônica e a
frase de que o agente principal fica no modelo da sessão, como faz o tooltip da linha
simples.

A lista de opções mantém seu modelo de teclado: setas e Tab percorrem as opções. As
configurações são controles focáveis comuns acima dela, e Shift+Tab na primeira opção sai da
lista para elas, então a ordem de leitura e a ordem de foco concordam. Teclas digitadas em um
controle ficam nele: os atalhos numéricos do diálogo pertencem aos botões de opção, não ao
diálogo.

Quando o input não traz bloco (um agente mais antigo), a janela desenha em vez disso as linhas
simples, apenas para os campos que a chamada definiu, em
`text-ui-xs text-foreground-subtlest`: "Subagents run on {model}" e "At most {n} subagents at
once". A linha do modelo diz o **rótulo resolvido**, não a string canônica que `resolveInput`
produziu: um nome de modelo, mais "· thinking {level}" / 「· 思考 {level}」 quando a escolha
carrega um nível de raciocínio. A string canônica mantém seu lugar no tooltip dessa linha,
sob uma frase dizendo que o agente principal fica no modelo da sessão. Uma função pura decide
as palavras para todas as três superfícies que nomeiam o modelo,
`describeWorkflowSubagentModel` (`components/workflow-timeline/subagent-model-label.ts`): uma
família de provedor embutida mostra apenas o id do modelo, um provedor customizado mostra
"{provider name}/{model id}", e um provedor que não pode ser resolvido volta ao id do modelo.
O id do provedor nunca é mostrado, porque para um plano de equipe ele é um UUID.

Abaixo das configurações e do badge salvo vem a linha do tempo estática, construída sem
execução, não recolhível, sem callbacks de pílula ou estação (nada existe para abrir ainda).
Depois o script em um `Collapsible`, aberto por padrão apenas quando não há grafo (um script
sem passos não tem outra coisa a mostrar), resetado quando o id do pedido muda. O bloco é o
único bloco de permissão permitido a conter uma dobra.

### O cartão da execução

`WorkflowRunDigest` (`components/workflow-timeline/WorkflowRunDigest.tsx`) é o cartão sob o
turno que iniciou ou tocou a execução. `resolveWorkflowTurnDigests` lê a unidade de turno
inteira e aplica uma regra: **toda fonte que nomeia uma execução que iniciou ou retomou gera
umcartão**, um por execução por turno (a primeira fonte vence). A única fonte que nomeia uma
execução sem ser tal evento é o turno de configurações no lugar, e é a única exceção: uma
execução que foi reajustada já tem seu cartão, então o turno é apenas uma linha (veja "The
settings turn" abaixo).

| Fonte | Une-se por | Nome |
|---|---|---|
| o turno de lançamento de um lançamento direto (`unit.workflowLaunch`, `docs/dynamic-workflow/launch.md`) | `runId` do metadata | o nome do metadata |
| o turno de configurações de uma mudança feita com Configure (o mesmo `unit.workflowLaunch`, com um bloco `amend`) que iniciou uma execução nova, que é o bloco que carrega `predecessorRunId` | `runId` do metadata | o nome do metadata |
| uma linha `CreateWorkflow` | seu tool call id (o `run.toolCallId` da projeção é a linha de origem) | o `name` do input |
| uma linha `ResumeWorkflowRun` | o `runId` do seu display | o nome de fallback |

Uma linha `CreateWorkflow` não nomeia execução por si só, então um script recusado ou que não
compila não tem cartão. O **grafo é uma propriedade da execução**, encontrado pelo tool call
id de origem da execução em uma única tabela que o host constrói a partir da janela de linhas
(`workflowRunCardJoin.buildWorkflowGraphByToolCallId`): o display de uma linha
`CreateWorkflow` ou o `workflowLaunch.display` de um turno de lançamento, o que o carregue.
Um cartão de retomada portanto desenha o mesmo trilho que a linha que iniciou a execução. Uma
fonte cuja execução **não está na projeção** (despejada além de oito execuções, ou um
restauro frio sem acerto no diário) ainda gera um cartão, o **cartão neutro** só de
cabeçalho: palavra de tipo "Workflow ended" / 「工作流已结束」, o nome, `⤢`, sem lâmpada,
trilho, detalhe, Stop ou Resume, `data-workflow-run-status="absent"`. O cartão é renderizado
assim que a fonte está presente, enquanto o turno principal ainda roda, depois do cartão de
conclusão e antes de outros cartões de fim de turno. Para um turno de lançamento o cartão é
toda a renderização do turno (sem bolha do usuário).

Um turno que renderiza **nenhuma bolha do usuário** — o turno de lançamento e o turno de
configurações, cuja linha do usuário é a frase canônica escrita para o modelo — também
descarta o padding superior do contêiner do turno, pela mesma regra e pelo mesmo motivo que a
linha de notificação (`docs/dynamic-workflow/transcript-and-notifications.md`, "The
notification row"): esse padding é o respiro acima de uma bolha, e sem bolha abaixo dele a
linha ou o cartão flutuaria uma altura de turno abaixo do turno anterior. Seu primeiro nó
portanto fica no gap de fluxo ordinário abaixo do turno anterior.

O cabeçalho é uma linha: o ícone, a **palavra de tipo** para o status da execução ("Workflow
started / running / completed / errored / stopped", com brilho enquanto roda; "Workflow
superseded" / 「工作流已被替代」 para uma execução parada por um ajuste), o nome, um **chip de
perguntas** tingido de warning "{n} questions" quando a execução tem perguntas pendentes
(clicá-lo abre o painel da execução), o detalhe "{n} phases · {m} agents working" enquanto a
execução está pending ou running e "{n} phases · {m} agents" depois (agents = o maior entre a
contagem de atores da execução e as trilhas de agentes do grafo), com o **nome do modelo de
subagente** acrescentado como último segmento quando a execução escolheu um
("{n} phases · {m} agents working · GLM-5.3-Flash") no mesmo texto esmaecido, sem chip e sem
prefixo, o nível de raciocínio e a string canônica no tooltip do detalhe; então o **botão de
ícone Configure** (sliders, `icon-md` ghost, tooltip "Configure workflow" / 「配置工作流」)
quando a execução pode ser configurada (`docs/dynamic-workflow/launch.md`, "Which runs can be
configured"), que abre o popover de configurações sob ele (veja "The settings popover");
então um de **Resume run** (quando o estado da execução diz `resumable`) ou um **botão de
ícone Stop run** (um quadrado preenchido, enquanto roda; pressionado ele se desabilita e seu
tooltip vira "Stopping…", resetado remontando no próximo status), então `⤢` "Open run
details". Configure ocupa o mesmo slot em todos os estados em que aparece, então nunca move
o `⤢`. O tooltip do Stop carrega uma segunda linha, "You can resume later; finished steps
are kept." / 「停止后可以随时恢复，已完成的步骤会保留。」, porque o verbo era lido como
"descartar" e uma execução parada é retomável; enquanto para, essa linha some (a decisão já
foi tomada). Stop chama o mesmo comando `cancelBackgroundWork {workId: runId}` que o painel;
não há um segundo caminho de parada nem confirmação, porque uma execução parada pode ser
retomada. Todo controle aparece apenas quando o host deu o callback.

**Quando o cabeçalho fica sem espaço.** O ícone, a palavra de tipo, o chip de perguntas,
Configure, Resume / Stop e `⤢` mantêm sua largura, e os dois textos cedem: primeiro o nome
(ele cresce com o que sobrar na linha, então é o primeiro a ficar curto), depois o **detalhe,
que trunca com reticências**. O detalhe é o que antes empurrava Configure e Stop para fora da
borda direita do cartão, porque ele nunca cedia e o nome do modelo de subagente pode torná-lo
muito mais longo que "3 phases · 2 agents working".

Tanto o agrupamento à direita quanto o detalhe dentro dele precisam de `min-width: 0`, e o do
agrupamento é a metade estrutural. O tamanho mínimo automático de um item flex é seu
min-content, e o `white-space: nowrap` do detalhe faz seu min-content ser a string *inteira* —
`overflow: hidden` não encolhe isso, e nem o `min-width: 0` do próprio detalhe, que apenas
libera o detalhe para ser encolhido por seu pai. Sem `min-width: 0` no agrupamento, o piso do
agrupamento é portanto "o detalhe inteiro mais os controles": ele não cede um único pixel e
os botões saem do cartão exatamente como antes. Medido baixando a largura de um cartão passo a
passo, os botões escapam a partir de 520 px de largura sem ele, e em nenhuma largura até
290 px com ele. Esse piso de 290 px é a parte fixa da linha — a palavra de tipo mais três botões
de ícone — e um chip de perguntas pendentes, sendo outro item fixo, o eleva para 380 px. Um
cartão mais estreito que seu piso ainda transborda, então uma execução que holds uma pergunta
pode transbordar em um celular; fechar esse caso significa deixar uma terceira coisa truncar, o
que é uma decisão de design e não um bug de layout.

**Linhagem no cartão.** O cartão não soletra a linhagem. Uma execução com `supersededBy` não
mostra botão de Resume (não é retomável) e sua palavra de tipo lê **"Workflow superseded" /
「工作流已被替代」**; a lâmpada continua o anel oco neutro de uma execução parada. Uma
execução com `resumedFrom` parece com qualquer outra. As duas frases que nomeiam a outra
ponta da cadeia, "Amends run {id}" e "Superseded by run {id}", vivem apenas no painel da
execução (veja "The run pane") e na janela de confirmação: no cartão elas eram ruído ao lado
das contagens. Os dois fatos ainda viajam no estado de execução v4 (`resumedFrom`,
`supersededBy`), alimentados pela projeção da CLI a partir dos payloads de progresso
`run-started` e `run-settled`, então o painel pode mostrá-los; uma execução fora da janela de
projeção não mostra nenhum dos dois.

O cartão vem expandido por padrão. Quando tem trilho, o cartão inteiro é um toggle: um clique
em espaço em branco, ou Enter/Space com foco, o recolhe para cabeçalho mais linha de fase
(pílulas removidas, estações, arcos e tinta mantidas como uma visão geral de progresso); cliques
em botões, links, controles de formulário e descendentes `[role=button]` pertencem a eles. A
linha do tempo é construída apenas quando tanto o grafo quanto o estado de execução ao vivo
existem, já que um grafo sem execução desenharia uma execução terminada como nunca iniciada.
Suas estações não são botões aqui (elas borbulham para o toggle), as pílulas abrem
transcrições, e a linha "{n} more" abre o painel da execução posicionado em sua estação
(`onOpenRun({ phaseId })`); `⤢` e o chip abrem a execução inteira. Abaixo da linha do tempo,
nos dois estados, uma faixa de artefatos mostra até três pílulas de artefato e `+N` (veja
`docs/dynamic-workflow/authoring.md` para artefatos); uma pílula abre seu artefato, um HTML
diretamente na aba do navegador. Uma execução `truncated` cuja tabela de nós lista menos
instâncias do que a execução tem (`nodes.length` abaixo da contagem real de passos; só
`truncated` não basta, as coleções pequenas também o definem) cresce uma linha sutil sob a
linha do tempo, "Details shown for {shown} of {total} steps" / 「仅展示 {shown}/{total} 步的
详情」, onde {shown} são as instâncias que a chave lista e {total} a contagem real de passos
da execução: as contagens acima dela já são as reais, e a linha diz que o detalhe por passo, e
não a execução, parou no limite. A linha pertence à linha do tempo: o cartão só de cabeçalho
abaixo não tem contagens que ela qualifique e não a carrega. Quando a execução está na
projeção mas o grafo não está na janela de linhas visível, o cartão é uma única linha de
cabeçalho, sem trilho, sem detalhe e sem toggle; quando a execução foi despejada da projeção
não há cartão.

**O turno de configurações.** Uma mudança feita com Configure é registrada como um turno
apenas de controle (`docs/dynamic-workflow/launch.md`, "The settings turn"). Como um turno de
lançamento ele não tem bolha do usuário e seu cartão é o cartão da execução nova; acima do
cartão uma linha diz o que mudou, no estilo de uma linha da linha da ferramenta: o ícone de
sliders, "Settings changed" / 「已调整设置」, depois um segmento por configuração mudada,
"subagents on {model}" / 「子代理改用 {model}」 ou "subagents back on the session model" /
「子代理改回会话模型」, "at most {n} at once" / 「最多 {n} 个同时运行」 ou "limit back to the
default" / 「上限恢复为默认」, e então o tempo do turno, separado por `·`, em cinza sutil.
O modelo é o rótulo resolvido (`describeWorkflowSubagentModel`). A linha é um registro, não
um controle. Ela é o primeiro nó do turno, então o turno não mantém padding superior acima
dela (veja "The run card" acima). O cartão da execução antiga fica onde está. Quando a mudança
a parou, o cartão vira "Workflow superseded" a partir apenas do estado da execução, o que
também leva embora seu Configure, Stop e Resume; uma execução que já tinha parado ou dado
erro mantém seu cartão como estava (`docs/dynamic-workflow/launch.md`, "The settings turn").
Um turno de configurações de uma execução sem nome não tem nome, e seu cartão mostra a palavra
de fallback como qualquer execução sem nome.

O turno de configurações de um **retune** é essa linha e nada mais: nenhum cartão abaixo
dela. Seu metadata não carrega `predecessorRunId` (`docs/dynamic-workflow/launch.md`, "The
settings turn"), que é o sinal — a execução que ele nomeia é aquela cujo cartão já está na
transcrição, viva e inalterada em identidade, e desenhar um segundo cartão para ela leria como
uma segunda execução. A linha carrega um segmento, "at most {n} at once" / 「最多 {n} 个同时
运行」 ou "limit back to the default" / 「上限恢复为默认」, já que paralelismo é a única
coisa que um retune muda, e nenhum cartão em lugar algum vira "Workflow superseded", porque
nada foi substituído.

### O popover de configurações

O botão Configure do cartão, o botão Configure do painel e o segmento de modelo do painel
abrem um popover (`components/workflow-timeline/WorkflowRunSettingsPopover.tsx`), ancorado
sob o controle que o abriu e alinhado à sua extremidade. Suas partes, de cima para baixo, em
um invólucro `w-72` (`PopoverContent`, `p-2.5`, 10 px entre as partes):

| Parte | O que é |
|---|---|
| Título | "Configure workflow" / 「配置工作流」, `text-ui-base font-medium` |
| Modelo de subagente | rótulo "Subagent model" / 「子代理模型」; a lista de modelos do compositor (`ModelConfigSelect`, os mesmos grupos que o seletor de subagentes da página de configurações lê), com **o modelo da sessão** como primeiro item carregando o badge "session model" / 「会话模型」; o gatilho mostra o modelo da execução, ou o modelo da sessão com o badge quando a execução não tem. Ao lado do gatilho, o controle de nível de pensamento que a página de configurações usa para subagentes (`SubagentReasoningField`), apenas quando o modelo escolhido tem níveis de raciocínio; escolher um modelo define seu nível padrão. Um modelo em que a execução está mas que a lista já não oferece é mostrado pelo seu nome com um badge "unavailable" / 「不可用」; Apply então espera por outra escolha. Quando o workspace não lista modelos o campo é a frase "This agent has no model catalog; subagents stay on the session model." / 「当前 agent 没有可选的模型目录，子代理沿用会话模型。」 |
| Concorrência máxima | rótulo "Max concurrency" / 「最大并发数」, a palavra que o chip de concorrência do painel da execução usa, então o chip e o controle que o define leem o mesmo (o menos e o mais carregam "Lower max concurrency" / 「降低最大并发数」 e "Raise max concurrency" / 「提高最大并发数」); um stepper (`InputGroup`: menos, um número mono `w-9`, mais) a partir de 1 sem fim superior, começando no limite próprio da execução ou no paralelismo padrão (`run.concurrencyCeiling`) quando ela não tem; à sua direita em texto sutil "default {n}" / 「默认 {n}」, que passa a "= default" / 「= = 默认」 quando o valor é o padrão. O valor no padrão significa nenhum limite próprio da execução. Um estado de execução sem padrão (um agente mais antigo) não dá dica |
| Frase | uma linha, `text-ui-sm` sutil, escolhida pelo que aplicar realmente fará, então não diz nada até que um campo difira da execução: com Apply desabilitado não há consequência a descrever, e um palpite feito antes da edição está errado para um dos dois campos (o stepper pode aplicar no lugar, o modelo nunca). A linha mantém sua altura de uma linha enquanto vazia, então a primeira edição não empurra o rodapé para baixo. Quando o stepper é o único campo que difere e a execução está **rodando**, aplicar reajusta aquela execução no lugar e a linha diz isso: "Applies to this run right away; no new run is started." / 「立即应用到当前运行，不会新起一次运行。」 Uma execução `pending` mantém sua própria frase mesmo para uma mudança só de stepper: seu motor pode ainda não existir, e nesse caso o agente recorre a um ajuste comum (`docs/dynamic-workflow/launch.md`, "Changing only the parallelism of a live run"), e uma promessa de "nenhuma execução nova" é uma que este estado não pode cumprir. Caso contrário a linha é a do estado da execução: running "Stops this run and starts a new one with these settings; finished steps are kept." / 「将停止当前运行，以新设置另起一次运行，已完成的步骤会保留。」; pending "Starts a new run with these settings; this one has not begun any step yet." / 「将以新设置另起一次运行，当前运行尚未开始任何步骤。」; stopped "Continues as a new run with these settings; finished steps are kept." / 「将以新设置另起一次运行接着跑，已完成的步骤会保留。」; errored "Retries as a new run with these settings; finished steps are kept." / 「将以新设置另起一次运行重试，已完成的步骤会保留。」. A linha segue os campos conforme são editados, então tocar o seletor de modelo depois de mover o stepper traz de volta a frase de reinício, e devolver os dois campos ao valor original a esvazia de novo |
| Rejeição | só depois de um Apply rejeitado: a linha do motivo de `docs/dynamic-workflow/launch.md` ("The command") no estilo de rejeição do painel, `text-ui-xs` warning, com a mensagem do ACK em um bloco mono limitado quando ela carrega uma. Limpa quando o usuário muda um campo |
| Rodapé | **Apply** / 「应用」, alinhado à direita, `h-7` primary; desabilitado enquanto nenhum campo diferir da execução; enquanto o comando está em voo mostra um spinner e "Applying…" / 「应用中…」 e os campos ficam desabilitados |

Abrir o popover inicia os dois campos a partir das configurações atuais da execução. Apply
envia `amendWorkflowRunSettings` com apenas os campos que diferem: o modelo como sua string
canônica `providerId/modelId[$level]`, `null` para o modelo da sessão; o limite como um
número, `null` para o padrão. Um nível de pensamento mudado sozinho conta como um modelo
mudado. Um ACK aceito fecha o popover; nada mais nele muda, porque a execução nova chega
pela projeção como qualquer outra. Escape e um clique fora fecham sem aplicar.

Depois de um Apply aceito, um painel da execução mostrando a execução antiga **segue o
workflow**: sua aba é substituída no lugar pela da execução nova, mantendo seu lugar na fita
de abas e seu nome, assim que a execução nova está na projeção. Um painel fechado ou
mostrando outra execução é deixado em paz. O cartão não precisa de nada: o cartão antigo vira
"Workflow superseded", e o cartão novo chega com o turno de configurações.

Um retune não move nada. O ACK nomeia a mesma execução sobre a qual o popover foi aberto,
então não há execução nova a seguir nem aba a substituir: um painel aberto continua
mostrando a execução que estava mostrando, que é a execução que mudou. O que o usuário vê é
o chip relendo seu limite, e o turno de configurações chegando com sua linha sobre o cartão
da mesma execução (`docs/dynamic-workflow/launch.md`, "Changing a run's settings from the
GUI"). O cliente não precisa de nenhuma flag para isso — um ACK cujo `runId` é o que ele
enviou, sem `supersededRunId`, é um retune.

## O painel da execução

A aba de painel lateral `workflow-run` é identificada por `(parentSessionId, runId)` e
carrega `toolCallId`, um `workflowName` congelado opcional e um `focusPhaseId` opcional.
Nunca é coletada como lixo: sobrevive à janela de projeção de oito execuções e se degrada,
nunca fecha. Abrindo-a de novo com um `phaseId` pousa naquela fase; um pedido sem um apaga o
pouso anterior, e `openedAt` é renovado cada vez, então reclicar uma estação pousa de novo.

O painel (`app-shell/WorkflowRunSidePane.tsx`) se inscreve na projeção da sessão pai,
encontra sua execução por id em `workflowRuns.runs`, e encontra seu grafo pelo tool call id da
aba na mesma tabela que o cartão da execução usa (`buildWorkflowGraphByToolCallId`): o display
da linha de ferramenta `CreateWorkflow` ou, para um workflow salvo lançado diretamente, o
display `workflowLaunch` do turno de lançamento. Um grafo sem passos conta como ausente. Uma
execução iniciada por Configure (tool call id `settings-…`) cujo turno de configurações ainda
não caiu, porque o agente principal está no meio de um turno, pega o grafo de seu predecessor
através de `resumedFrom`: por construção seu script é o do predecessor. Nenhuma outra
execução empresta um grafo, já que um script revisado desenha um diferente. De cima para baixo:

1. **Cabeçalho de status**, duas linhas e as linhas sob elas. A primeira linha traz o nome em
   mono (é um identificador) e os controles: **Configure** (um botão `sm` de contorno com o
   ícone de sliders e a palavra "Configure" / 「配置」) quando a execução pode ser configurada
   (`docs/dynamic-workflow/launch.md`, "Which runs can be configured"), um botão **Resume run**
   apenas quando `resumable`, e **Stop run**, sempre renderizado, desabilitado a menos que a
   execução esteja `running` ("Only a running workflow can be stopped."). Uma execução
   concluída acrescenta o verbo próprio do cartão de conclusão antes de Stop — **Save**
   「保存」, ou **Run again** 「再次运行」 uma vez que a execução tem um workflow salvo — com o
   mesmo popover e o mesmo lançador por trás (`transcript-and-notifications.md`, "Saving the
   run, and running it again"); o chip 「已保存」 fica na segunda linha, depois da palavra de
   status. A segunda linha traz a lâmpada e a palavra da execução com o motivo da parada
   ("Stopped · superseded" para uma execução que foi ajustada) e o **chip de concorrência**
   "Max concurrency {cap}" / 「最大并发数 {cap}」, mostrado enquanto a execução é mantida
   abaixo de seu próprio limite ou tem um limite próprio, **e** a execução pode ser
   configurada, com "cooling down until {time}" enquanto uma espera está pendente (veja
   `docs/dynamic-workflow/concurrency.md`, "What the user sees", para o porquê). O status se
   mudou para uma linha própria porque três botões ao lado dele apertavam a primeira linha.
   Sob as linhas, uma linha de linhagem quando a execução tem uma ("Amends run {id}", ou
   "Superseded by run {id}" como um link que abre o painel da sucessora). Stop carrega o mesmo
   quadrado preenchido do cartão e, enquanto está habilitado, a mesma segunda linha de tooltip,
   "You can resume later; finished steps are kept.": o verbo era lido como "descartar" e uma
   execução parada é retomável. Um Stop ou Resume que o agente rejeita desenha uma **dica de
   rejeição** de uma linha sob os botões, na cor de warning, redigida a partir do código de
   motivo do ACK ("This run is not running in this agent, so nothing was stopped.", "The
   stored script no longer compiles with this version of the workflow facade. Ask the agent
   to amend the workflow instead of resuming it.", e assim por diante; um código desconhecido
   volta a uma linha genérica que o nomeia), com a mensagem do ACK, quando ela carrega uma,
   em um bloco mono limitado abaixo (os diagnósticos de `compile_failed`). A dica é lembrada
   junto com o status da execução sob o qual foi levantada e desaparece assim que o status
   muda; nunca é um toast e nunca bloqueia os botões. Sob ela a linha de resumo: "Subagents
   {model}" / 「子代理 {model}」 primeiro, apenas quando a execução escolheu um modelo para
   seus subagentes (`docs/dynamic-workflow/launch.md`, `subagent_model`); quando a execução
   pode ser configurada este segmento também é um botão, sublinhado no hover, que abre o mesmo
   popover de configurações ancorado a ele; depois "{n} agents working" ou "{n} agents",
   "{done}/{total} steps", "{tokens} tokens", "round {r}" (ao vivo) ou "{r} rounds"
   (estabilizada) quando alguma estação de laço tem duas ou mais rodadas, "{n} artifacts"
   quando houver. O modelo pertence a esta linha e não a um chip na linha acima: a linha já é
   a meia dúzia de números da execução, e o modelo é sua primeira palavra. O nome é o rótulo
   resolvido; o nível de raciocínio e a string canônica estão no tooltip desse segmento. Sob
   a condição do cartão (uma execução `truncated` listando menos instâncias do que tem) o
   painel acrescenta a linha do cartão sob a linha, "Details shown for {shown} of {total}
   steps" / 「仅展示 {shown}/{total} 步的详情」, no mesmo texto sutil: a espinha abaixo lista
   as instâncias que a chave manteve, e os números da linha contam todas. Quando não há
   grafo a linha degrada para a antiga linha de uso, 「用量：N tokens · M 步」, e o segmento
   de modelo ainda a abre: o modelo é uma condição que o usuário pôs na execução, então se o
   grafo está na janela de linhas visível não tem relação com isso.
2. **Procedência**, apenas execuções lançadas diretamente (`workflowRunLaunchProvenance.ts`
   encontra o metadata do turno de lançamento por tool call id, cabeçalho primeiro):
   「由你从工作流中枢启动 · {time}」 com o badge de escopo, a descrição e uma tabela
   chave/valor dos argumentos. Uma execução iniciada por Configure tem o mesmo bloco com
   suas próprias palavras: "Settings changed by you · {time}" / 「由你调整设置 · {time}」, sem
   badge de escopo, e uma linha por configuração mudada, "Subagent model" / 「子代理模型」 e
   "Max concurrency" / 「最大并发数」, lendo "{from} → {to}" (a palavra do modelo da sessão ou o
   padrão para uma extremidade ausente). Execuções iniciadas por ferramenta não têm esse
   bloco; sua origem é a linha `CreateWorkflow` na transcrição. Uma execução cujo paralelismo
   foi reajustado mantém o bloco que tinha: o bloco diz como a execução começou, e um retune
   não a iniciou. A mudança aparece no chip de concorrência do cabeçalho e como a linha
   「并发上限 8 → 2」 no log de eventos (`docs/dynamic-workflow/concurrency.md`, "What the
   user sees").
3. **Painéis de resultado**, no máximo um: para uma execução fora da projeção, "No longer
   tracked live" com "This run is outside the most recent runs kept for live status. Its
   record is still complete."; para `completed`, "Result" com a dica de que o resultado foi
   para a conversa como resultado em segundo plano (uma prévia de resultado está no schema
   mas nunca é preenchida); para `errored` ou `stopped`, "Run errored" ou "Run stopped ·
   {reason}" e o texto de erro ou "No error detail was recorded.".
4. **A espinha**, ou, quando não há grafo, "The workflow graph is not in this conversation's
   visible history."5. **Artefatos**, apenas quando a execução tem algum: uma seção recolhível, aberta por
   padrão, com a contagem no cabeçalho. Com um primário (o artefato sinalizado, ou o único
   artefato): a linha do entregável (moldura 160 × 100, ou 136 × 85 quando a seção é mais
   estreita que 380 px, por container query), uma régua fina, e então o resto como o **índice**:
   uma linha por artefato, uma única coluna, sem teto (veja
   `transcript-and-notifications.md`, "The index"); o cabeçalho recolhido mantém o título do
   primário depois da contagem. Sem um primário, uma galeria de tiles de 130–180px de largura,
   um tamanho em que uma miniatura é legível (veja authoring.md e
   `transcript-and-notifications.md`, "Artifact tiles"). A lista é o primário primeiro, e então
   a ordem de publicação.

### A espinha

`WorkflowRunPhaseList` lê o mesmo modelo da linha do tempo verticalmente. Um trilho corre a
21px da borda esquerda; cada fase é uma seção cujo cabeçalho segura a lâmpada sobre o trilho.
Os trilhos são desenhados em duas metades, da lâmpada acima até a base de sua seção e do topo
da seção seguinte até sua lâmpada, então um trilho acompanha uma seção conforme ela abre e
fecha sem medição. A tinta segue o modelo, mas `faint` e `strong` renderizam de forma idêntica
aqui (1px, `foreground-subtlest`); só `march` é distinto, e aqui também ele é aceso e não se
move. Uma metade de trilho march tem 1.5px (esquerda 20.25px) e toma seu gradiente de
`data-rail-position`: a metade inferior da seção anterior esvanece de transparente a 70% de
warning, a metade superior da seção em execução vai de 70% a warning total até a lâmpada, e um
trilho march `full` é um 70% chapado. Arestas de retorno não são desenhadas na espinha; um
laço aparece como `⟳ n` no cabeçalho. A lâmpada em execução é a lâmpada do cartão,
`wf-lamp-running`, e pulsa com ela; a espinha não tem anel expansivo próprio.

Uma banda também cresce trilhos aqui, para o lado, dispostos como um grafo de commits: os
trilhos à esquerda, o texto à direita, nunca compartilhando uma coluna. O trilho t corre a
21 + pitch × t da borda esquerda, onde o pitch é 12px enquanto a banda mais larga tem no
máximo quatro trilhos de ramo e 8px além. A lâmpada fica em seu próprio trilho (esquerda
16 + pitch × t) e sozinha diz em que linha uma estação está. Todo o resto — o conteúdo de cada
cabeçalho de seção, cada corpo aberto, o bloco de perguntas órfãs — começa em uma única
**coluna de texto** compartilhada por toda a espinha, 39 + pitch × (T − 1), sendo T o maior
número de trilhos que qualquer banda tem; em qual trilho uma estação está não move mais seu
texto. Sem banda T = 1 e nada se move.

Um fork e um merge acontecem *entre* duas fases, então cada um ganha uma **linha de junta** de
16px própria entre duas seções, nunca uma fatia do cabeçalho de uma seção. Toda banda tem
ambos: a linha de fork fica logo antes da primeira seção da banda, a linha de merge logo
depois de sua última. Em uma linha de junta o trilho principal atravessa reto, na tinta do
trilho do trilho 0 que o cruza (um march ali é o 70% chapado). Uma banda sem `pred` tem uma
linha de fork **aberta**: seu trilho principal não chega de uma fase acima mas começa 4px
acima da linha com uma tampa redonda, o `TAIL` do cartão, então a banda lê como subindo de um
único ponto de raiz. Uma banda sem `join` tem uma linha de merge aberta, o espelho: as linhas
se encontram e o trilho principal para 4px abaixo da linha, o `STUB` do cartão. Os tocos vivem
na linha, não em uma seção, então nada pendura de um cabeçalho ou corre sob as pílulas de uma
fase. Todo ramo sai dela ao longo de um barramento compartilhado em y = 8: para baixo pelo
trilho principal, um quarto de volta de raio min(6, pitch / 2), atravessando até sua própria
coluna, um quarto de volta para baixo, e até a base da linha; com um trilho as duas curvas se
encontram como um S. A linha de merge é o espelho. Uma curva de ramo toma a tinta de `entry`
(fork) ou `exit` (merge) de seu trilho, e uma curva march é acesa ao longo de seu próprio
caminho pelo componente do cartão.

O trilho de uma linha corre da base da linha de fork até o topo da linha de merge. Os trilhos
mantêm suas metades por seção: o trilho próprio de uma estação tem uma metade superior onde a
linha chega (do membro anterior, ou da linha de fork) e uma metade inferior onde ela continua
(para o próximo membro, ou para a linha de merge); um trilho atravessa uma seção em que não
tem lâmpada em altura cheia, na tinta do trilho de que faz parte — o `entry` do trilho antes
de seu primeiro membro, seu `exit` depois do último. O trilho principal atravessando a seção
de uma estação de ramo é a mesma regra. Duas bandas lado a lado têm uma linha de merge aberta
seguida de uma linha de fork aberta, cujos tocos se encontram. Uma banda dissolvida (veja
"Bands and tracks") não tem linhas nenhuma: seus estágios são um trilho.

Um **trilho de stream** na espinha mantém suas duas metades, cada uma parando 7px antes da
fronteira de seção, e dois chevrons apontando para baixo ficam na lacuna, 5px de distância e
centrados na fronteira, nas três tintas do cartão (`march` acendendo em turnos). Chevron
faint e strong diferem aqui, ainda que trilhos faint e strong não difiram: os chevrons é onde
o estado do stream é lido. Um arco de stream não é desenhado na espinha, como qualquer outro
arco. Uma banda em que toda linha é uma única fase, sem nada antes ou depois dela, ainda é
desenhada inteira: uma raiz, uma linha por fase, um sumidouro. A espinha não desenha gêmeo: o
fork e o merge já dizem o que ele diria.

O cabeçalho de uma seção é um botão de 36px "Show phase {name}" / "Hide phase {name}":
lâmpada, nome (sutil quando pendente), e à direita, em mono: enquanto recolhido, um
**agrupamento de avatares** de até três rostos e `+n`, ou um **mini medidor** de 44px quando a
estação é uma lista (segmentos done · failed · running · pending sobre seus participantes,
listados e não listados, larguras proporcionais, pending como o trilho); então
`settled/observed`; então `⟳ n`; então um chevron. Toda fase em execução se abre sozinha quando
começa a rodar, não apenas a mais à direita, e nada que o usuário abriu é fechado. Um pouso
(`focusPhaseId`) abre a seção, abre sua porta de lista, rola o cabeçalho até o topo e o
destaca por 1.2s.

Aberta, uma seção lista suas pílulas como linhas de largura total: a mesma pílula, com
"{n} tasks · {n} reads" como filhos. Um subagente cuja persona nomeia um modelo acrescenta seu
rótulo resolvido (`describeWorkflowSubagentModel`) a esses filhos, "{n} tasks ·
GLM-5.3-Flash", e a string canônica ao tooltip da linha; um subagente no modelo da execução
não diz nada, já que a linha de resumo já o nomeia. Uma linha de agente abre a aba de
transcrição do subagente, tenha ele começado ou não; uma linha de workspace abre a transcrição
do script nesta fase. **Perguntas** pendentes renderizam sob a linha de quem perguntou,
recuadas mais 26px: ícone, nome de quem perguntou, pergunta, contexto, um rótulo de espera
("just now", "{n}m ago", …) marcando a cada 30s enquanto qualquer pergunta está pendente, e o
id da pergunta. Perguntas cujo autor não está em nenhuma linha se coletam em um bloco depois
da última seção com o título "Waiting on an answer", cada uma nomeando seu autor. O painel é
somente leitura; o agente principal responde.

Passados seis participantes a seção mostra as cinco linhas fixadas e então a **porta**: a mesma
linha "{n} more" com um chevron na cauda em vez de `↗`, `aria-expanded`, e, enquanto fechada,
uma contagem do resto (`✓ n · ◌ n · ✕ n · ○ n`, contagens zero omitidas). Aberta, a contagem
muda para cabeçalhos de grupo e o fundo da porta sobe. Atrás dela está o **rolo**
(`WorkflowRoll`): apenas os participantes não fixados, cada um uma vez, agrupados por status em
ordem de atenção (falha, rodando, pendente, feito; grupos vazios omitidos), duas colunas de
pílulas de tamanho `row` pousando com 8ms de diferença (limitado a 400ms). Um cabeçalho de
grupo é a contagem e a palavra com um fio de cabelo até a borda. Um autor de pergunta no rolo
carrega um `?` de warning; seu texto de pergunta não é repetido ali.

A porta e sua contagem contam também os agentes não listados desta estação, e o rolo não
pode: um agente que as tabelas não contêm não tem linha para pousar, e um cabeçalho de grupo
conta as linhas sob ele. Então uma estação com agentes não listados termina seu rolo com uma
linha sutil, "{n} more agents not listed", no tipo da aviso de truncamento; a linha não os
chama de terminados, porque o limite também mantém fora agentes que ainda vão rodar. A
diferença entre a contagem da porta e as linhas abaixo dela é então algo que o leitor é
informado, e não algo que ele tem de descobrir.

### Transcrições de subagentes

Uma pílula de agente abre a aba `workflow-actor-session`, identificada por `(runId, siteId,
ordinal)`, com `actorSessionId` opcional: uma pílula para um subagente que não começou abre a
mesma aba que seu eu iniciado abrirá, e reabrir mescla o id de sessão. O painel
(`WorkflowActorSessionSidePane`) adquire a projeção pai sincronamente durante a renderização
e se condiciona a `workflowActorStartState`: o ator é encontrado por `(siteId, ordinal)`;
**started** quando algum nó desse ator saiu de `queued` — um acerto de cache incluído, já que
ele nomeia seu ator ("Reduction"); **notStarted** quando o ator existe sem tal nó, ou é
desconhecido e a aba não tem id de sessão; **unknown** quando o ator não está na projeção mas a
aba tem um id de sessão (uma execução despejada ou reproduzida), caso em que a transcrição se
inscreve mesmo assim. Um painel iniciado se inscreve no `sessionId` do ator, que é a sessão
**que contém sua transcrição**, nem sempre a cunhada para esta execução: um subagente de uma
execução ajustada cujas respostas até agora vieram todas do predecessor não tem sessão
própria — o acerto de cache não criou nenhuma — então seu `sessionId` é a sessão do
predecessor de onde as respostas foram lidas, e ela se torna a sessão própria do subagente em
seu primeiro despacho ao vivo, que é semeada com esse mesmo prefixo. A sessão do predecessor
é mostrada inteira, então pode passar pelas perguntas que esta execução consumiu; o painel a
lê, nunca a escreve. Uma execução registrada antes de acertos de cache nomearem seu ator
mantém a falha antiga: o acerto não pode ser atribuído, então o painel diz não iniciado. Não
iniciado renderiza "Not started yet" ("This subagent has not been asked anything yet. The
transcript appears here as soon as its first step is dispatched.") e não monta painel de
sessão; o primeiro despacho o vira. O portão precisa decidir antes do primeiro quadro, porque
uma inscrição a uma sessão que ainda não existe falha para uma loja que a camada de dados
mantém aquecida por 30 segundos. Uma pílula de workspace abre em vez disso a transcrição do
script (`docs/dynamic-workflow/transcript-and-notifications.md`).

## O estado de execução que o painel desenha

Todo evento do motor se torna um evento de sessão, `dynamic_workflow_run_progress`, anexado à
sessão **pai** fora de qualquer turno, com payload `{runId, toolCallId?, sequence,
eventType, payload, truncated?, actorSessionId?, resumable?}`. A projeção v4 a reduz com
`reduceWorkflowRunsState` (`packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts`)
na chave de snapshot `workflowRuns`, que todo snapshot carrega inteira. No fio um evento
envia apenas o que mudou: uma op `workflowRun.updated` nomeando a execução, carregando os
campos de cabeçalho que mudaram, as chaves de cabeçalho que ficaram ausentes, os atores e nós
que a redução despejou, e as entradas inteiras dos atores e nós que mudaram — no máximo uma op
por execução alterada por evento, mais um `workflowRun.removed` para uma execução que a
projeção despejou (`docs/v4-refactor/10-protocol-spec.md`, §4.5). Um cliente que não negociou
essas ops continua recebendo a chave inteira em um patch `state.updated`, limitada aos limites
que seu schema conhece — a limitação mantém os participantes que ainda seguem, já que esses são
as linhas que as superfícies existem para mostrar. A chave carrega sua própria `revision` e não
bumpa a revisão da conversa (uma execução em voo de outro modo reprovaria todo comando
otimista). O diário para onde os eventos também vão está descrito em
`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`.

```ts
interface WorkflowRunsState { revision: number; runs: WorkflowRunState[] }   // ≤ 8 runs
interface WorkflowRunState {
  runId; toolCallId?; status: "pending" | "running" | "completed" | "errored" | "stopped";
  stopReason?: "user" | "model" | "provider" | "interrupted";   // stopped only
  usage: { spentTokens; nodesUsed; nodesUnlisted?; nodesUnlistedSettled? };
  error?; resumable?: true; resultPreview?;
  actors: { siteId; ordinal; name?; sessionId?; status: "waiting" | "running" | "completed"; phaseName?;
            model? }[];                                         // canonical, when its persona names a model
  nodes:  { siteId; ordinal; kind?; phase; outcome?; cached?; actorSiteId?; actorOrdinal?; phaseName?;
            instructionsHead?;                                  // the ask's assignment, first 240 chars
            turn?; toolCalls?; lastTool?: { name; target? } }[]; // how far into the ask it is, from node-progress
  reports?; pendingQuestions?; concurrency?; subagentModel?; artifacts?;
  phases?: { name; rounds }[]; currentPhase?; phaseNames?: string[];   // declared order, from run-launched
  phaseAlongside?: number[][];                                         // aligned with phaseNames, indexes into it
  unlistedByPhase?: { phaseName?; actors; actorsSettled?; actorsFailed?; settled }[];  // the bound's cost per phase
  truncated?: true; lastEventSequence: number;
}
```

| Limite (`WORKFLOW_RUNS_LIMITS`) | Valor |
|---|---|
| execuções mantidas | 8, a mais antiga despejada |
| atores, nós | 1024 cada; um grupo terminado, um nó solto estabilizado, ou (para um despacho) um grupo ocioso é despejado para acomodar um recém-chegado |
| entradas na chave | 6144 (nós + atores, somados sobre as execuções), execução terminal mais antiga despejada |
| baldes não listados por fase | 33 (um por fase mais o unphased) |
| relatórios / caracteres de prévia | 64 / 2048 |
| perguntas pendentes / caracteres de pergunta | 32 / 2048 |
| artefatos | 32 |
| fases / caracteres de nome de fase | 32 / 128 |
| caracteres de nome de ator | 128 |
| caracteres de modelo de subagente | 256 |
| caracteres de erro | 2048 |
| caracteres do início de instruções | 240 |
| caracteres de nome / alvo da última ferramenta | 64 / 120 |

Os últimos quatro campos de nó respondem "o que este subagente está fazendo agora, e está se
movendo", o que a fase sozinha não pode: um ask fica em `executing` por minutos seguidos.
`instructionsHead` é o início das instruções do próprio autor para aquele ask, cortado na
origem (o motor anexa seus epílogos depois, e eles não são a atribuição); `turn` conta turnos
de modelo resolvidos dentro do ask, `toolCalls` conta suas chamadas de ferramenta, e `lastTool`
nomeia a mais recente com um alvo curto (um caminho, uma cabeça de comando) e nunca seus
argumentos. Todos os quatro estão ausentes em um diário escrito antes de os campos existirem, e
um leitor deve mostrar essa ausência em vez de inventar um zero.

Toda coleção opcional está ausente quando vazia em vez de um array vazio — e é por isso que um
delta nomeia as chaves de cabeçalho que esvaziaram em vez de enviá-las como `[]` — e toda
adição a esta chave tem sido opcional: um campo obrigatório que uma CLI mais antiga não envia
reprovaria o patch inteiro.

### Redução

Um envelope sem id de execução ou sem tipo de evento é rejeitado. Uma execução desconhecida é
semead como `pending` com coleções vazias; `lastEventSequence` só ever sobe. Um evento que
não muda nada (estado byte a byte igual) devolve `null`, então um evento reproduzido não bumpa
a revisão.

| Evento | Efeito |
|---|---|
| `run-started` | status `running`, uso reiniciado, e `error`, `resultPreview`, `pendingQuestions`, `resumable`, `stopReason`, `unlistedByPhase` de uma vida anterior limpos. Uma execução que é `truncated` começa adicionalmente a vida com **`actors` e `nodes` vazios**: a nova vida reemite toda instância, e só uma tabela vazia deixa cada uma ser listada ou contada exatamente uma vez — manter uma tabela que já perdeu entradas contaria duas vezes um grupo despejado durante o prefixo reproduzido, uma vez como não listado e uma vez como recriado. Uma execução que nunca transbordou mantém suas tabelas, então a retomada comum ainda mostra seu histórico desde o primeiro evento. `subagentModel` é lido do payload, aparado, e mantido apenas quando não vazio e dentro do seu limite; um valor longo demais é descartado inteiro em vez de cortado, já que um id de modelo encurtado é um id falso. Um payload sem a chave volta ao valor já na execução, como `resumedFrom`: o segundo `run-started` de uma retomada, ou uma CLI mais antiga que não envia, não pode apagar o modelo de uma execução cujo modelo não mudou |
| `run-launched` | `phaseNames` = os nomes de fase declarados em ordem de script (cortados a 32 × 128); ausente quando o script não declarou nenhum. `phaseAlongside` viaja com ele e só com ele: cortado ao comprimento dos nomes aceitos, cada entrada filtrada para inteiros no intervalo e nunca seu próprio índice, deduplicada, descartada quando nada sobrevive. Os únicos campos que este evento toca; ele dispara uma vez por vida de execução, então uma retomada mantém a tabela |
| `actor-created` | upsert por `(siteId, ordinal)`: nome cortado a 128, `sessionId` do `actorSessionId` do envelope, `phaseName` de nascimento cortado a 128 (cortado, não elipsado: é uma chave de join), `model` do `model` do payload (a string canônica que o host resolveu o nome de modelo da persona; descartado inteiro além de 256, como `subagentModel`). O `sessionId` é então mantido apontando para a sessão que contém a transcrição do subagente pelos eventos de nó abaixo |
| `node-queued` … `node-settled` | upsert por `(siteId, ordinal)`, e em uma execução `truncated` uma nova chave só a partir de um evento de nascimento ou de um despacho que carrega os fatos de nascimento da instância, em um evento que eleve a marca d'água (veja abaixo); `kind` só em `queued` e em tal despacho, senão carregado adiante; ref de ator e `phaseName` carregados adiante quando ausentes; `outcome` e `cached` mantidos; o primeiro `dispatched` de uma instância conta um para `usage.nodesUsed`. `instructionsHead` chega em `queued` (cortado a 240) e em um despacho que o repete, e é carregado adiante pelos eventos posteriores; `turn`, `toolCalls` e `lastTool` são carregados adiante do mesmo jeito, exceto através dos dois eventos de **nascimento**, que os limpam. Os eventos de nascimento são `queued` e o `settled` cacheado que o acerto da reprodução emite sem um `queued`: uma instância reenfileirada é uma tentativa nova cujo contador de turnos reinicia em 1, e uma estabilização cacheada não executou nada, então herdar o "turno 9, 40 chamadas de ferramenta" da vida anterior desenharia exatamente o retrato que estas leituras existem para descartar. Um `settled` cacheado ainda herda `instructionsHead`, já que o cache de conclusão usa a entrada como chave e as instruções são portanto idênticas por construção; `queued` não, já que pode carregar instruções emendadas. O `settled` cacheado de um ask carrega seus fatos de nascimento — `kind`, ref de ator, `instructionsHead` — como o `queued` que ele substitui, então o nó é atribuído ao seu subagente mesmo quando a tabela nunca conteve a instância (uma execução ajustada sempre começa sem nenhuma). Os mesmos dois eventos movem o `sessionId` do ator listado: o `settled` cacheado de um ask o define para o `sourceSessionId` do payload quando presente e para o `actorSessionId` do envelope caso contrário, e o `node-dispatched` de um ask o define para o `actorSessionId` do envelope. O último tal evento vence, o que está certo porque os asks de um subagente estabilizam em ordem e a divergência de uma importação é monótona: acertos de importação vêm primeiro e nomeiam a sessão do predecessor, e do primeiro despacho ao vivo em diante a sessão própria do subagente contém tudo, o prefixo importado incluído. Um evento que traz nenhum dos dois ids não muda nada, então um diário escrito antes de acertos de cache nomearem seu ator mantém a sessão que `actor-created` deu. Um despacho que insere seu subagente na tabela (ativação, abaixo) constrói a entrada a partir dos fatos de nascimento repetidos, `model` do `actorModel` do payload incluído, então um subagente despejado e trazido de volta mantém seu rótulo de modelo. |
| `node-progress` | atualiza `turn`, `toolCalls` e `lastTool` no nó que já existe, e nada mais — nenhuma fase, nenhuma contagem de passos, nenhum status de ator (um turno se resolver não é uma transição de ciclo de vida). Um campo que o payload não carrega de forma legível mantém seu valor conhecido; uma instância que a tabela não contém (despejada no limite, ou progresso antes de seu `queued`) é ignorada, como qualquer outro evento de nó para uma instância desconhecida. O último escritor vence em vez de um máximo monótono, então um ask reenfileirado pode contar regressivamente |
| `report` | upsert por `(siteId, ordinal)` em `reports` com uma prévia serializada; não toca em nenhum nó, ator ou contagem |
| `artifact-published` | upsert por id de artefato (uma nova versão substitui seu cartão), carregando `primary` quando o registro o tem; `artifact-failed` é um no-op |
| `usage-updated` | `usage.spentTokens` = o total absoluto do evento. O reset em `run-started` é momentâneo para uma execução que já custou algo: o motor emite este evento com o total restaurado (retomada) ou herdado (ajuste) logo após `run-started`, antes de qualquer turno ao vivo (`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Usage accounting") |
| `escalation-raised` / `-resolved` | upsert ou remoção por `qid`; a chave desaparece quando vazia |
| `concurrency-changed` | o bloco `concurrency` (`docs/dynamic-workflow/concurrency.md`) |
| `run-caps-changed` | o limite próprio da execução dentro do mesmo bloco `concurrency`, pela regra que `run-started` usa: `limit` quando o novo `caps.maxConcurrency` difere do `concurrencyCeiling` do payload (o paralelismo padrão), limpo quando é igual a ele, e `concurrency` descartado quando o lado compartilhado também não tem nada a dizer; `concurrencyCeiling` atualizado quando legível; o teto compartilhado, a chave e a espera intactos (`docs/dynamic-workflow/concurrency.md`, "Retuning a live run") |
| `phase-entered` | upsert `phases` por nome com `rounds = max(rounds, ordinal)` (monótono, então um prefixo retomado é um no-op); `currentPhase` sempre definido, mesmo quando a tabela de fases está cheia |
| `run-settled` | status para `completed` / `errored` / `stopped`; `stopReason` só quando parado; `error` cortado a 2048; `resumable` só quando o payload diz; perguntas pendentes e espera limpas |
| qualquer outra coisa (`log`, `compaction`) | eleva apenas a marca d'água |

Em um limite a tabela abre espaço antes de recusar, porque o que um leitor precisa ver é o
trabalho que está acontecendo agora, e em um limite é exatamente isso que uma recusa descarta.
Um **grupo** é um ator junto com cada nó listado que o nomeia, e ele tem uma classe no momento
em que tem um nó, lida do que seu agente está fazendo **agora**: **live** quando algum desses
nós está em `dispatched`, `executing`, `waiting`, `repairing` ou `nudged`; senão **idle**
quando algum ainda está `queued` (o agente está esperando um slot — um ask estabilizado atrás
dele não muda isso); senão **finished**, todo nó listado estabilizado. Um ator listado sem
nenhum nó listado é nenhum dos três: é um ator **zero-node**, ou ainda não perguntado ou — em
um diário escrito antes de acertos de cache nomearem seu ator — um cujos únicos asks foram
acertos de cache, cujos assentamentos são soltos e não nomeiam ninguém. Um **nó solto** é um nó
listado sem ref de ator (um world-read, ou tal acerto de cache antigo). Um grupo ou um nó
solto é **failed** quando qualquer resultado de nó seu é `failed` ou `cancelled`. A prioridade
da tabela é live > idle > finished > zero-node, e só um evento que eleva a marca d'água
despuja — um reproduzido nunca o faz. Ler "idle" como *todos* os nós na fila deixaria um agente
em seu segundo ask sem classe nenhuma, e uma tabela cheia dessas recusa um despacho — o
próprio sintoma que esta regra existe para remover.

Um agente se torna importante quando é **despachado**, não quando é enfileirado, e essa é toda
a forma de um leque largo: uma fase emite todos os `actor-created` e então todos os
`node-queued` em seus primeiros segundos, então os primeiros 1024 preenchem ambas as tabelas
ainda na fila, nada está terminado, não há o que despejar, e o resto é recusado. O agendador
então despacha FIFO, então do 1025º agente em diante todo agente que roda é um dos recusados.
Uma tabela cheia portanto admite em três ocasiões:

- **Nascimento.** Um `actor-created` de um ator não listado toma o lugar de um grupo
  terminado, e um `node-queued` de uma instância não listada toma o lugar de um nó solto
  estabilizado quando há um e de um grupo terminado caso contrário. Um recém-chegado na fila
  nunca desloca um incumbente na fila ou vivo, e sem uma vítima terminada é recusado.- **Nascimento que não pode fazer uma pílula.** Em uma execução `truncated`, um
  `node-queued`, ou o `node-settled` cacheado de um ask, que nomeia um ator que a tabela não
  contém é recusado mesmo quando a tabela de nós tem espaço: um nó cujo ator não tem linha não
  desenha pílula (`participant-model.ts` filtra por `run.actors`), então listá-lo só queima
  um slot de que uma instância despachada vai precisar. Admitido, ele também ficaria preso:
  um nó que nomeia um ator não é solto, e um grupo é construído a partir de um ator listado,
  então tal nó nunca poderia ser despejado. Um nó solto não é afetado.
- **Ativação.** Um `node-dispatched` que repete os fatos de nascimento da instância — seu
  `kind` e ref de ator, o `actorName` e o `actorPhaseName` do ator, o `phaseName` e o
  `instructionsHead` do próprio nó, exatamente o que seu `node-queued` e `actor-created`
  carregaram — admite essa instância como um nó `dispatched` quando a tabela não a contém, e
  admite seu ator junto com ela, construído a partir desses fatos e do `actorSessionId` do
  envelope, quando o ator também não é contido. Espaço é aberto primeiro: um slot de ator toma
  um grupo inteiro, um terminado antes de um ocioso e um ator **zero-node** apenas quando
  não houver nenhum dos dois; um slot de nó sozinho toma primeiro os nós **próprios**
  estabilizados do recém-chegado, índice de tabela mais baixo primeiro, um de cada vez até
  que um slot se libere, e então um nó solto estabilizado, senão um grupo terminado, senão um
  grupo ocioso — nunca um ator zero-node, que libera uma linha de ator e nenhuma linha de nó.
  Um `node-dispatched` sem ref de ator — um diário antigo, ou o despacho de world-read que o
  motor emite sozinho logo após o seu próprio `node-queued` — se comporta como sempre.

Qualquer outra chave nova em uma tabela cheia é recusada como antes, com `truncated` definido
(nunca limpo); em particular o `node-settled` cacheado que é *nascido* estabilizado nunca
despuja, já que nunca executou e não tem nada a mostrar. Uma chave existente ainda atualiza:
congelar uma instância viva em `queued` enganaria mais do que omitir uma. A ejeção define
`truncated` também — as tabelas da execução já não contêm seus próprios fatos, que é o que
essa flag diz e o que `run-started` lê para decidir se a próxima vida começa vazia.

A vítima é uma função pura do estado reduzido, então uma reprodução a frio do mesmo diário
despuja as mesmas entradas. Entre grupos terminados e nós soltos estabilizados ela é uma
candidata não-falha antes de uma que falhou (uma falha é a única coisa estabilizada que um
leitor ainda quer encontrar), e então uma candidata da fase que atualmente lista mais deles (o
limite é gasto onde as entradas estão adensadas), e então o índice de tabela mais baixo. Entre
grupos ociosos ela é o índice de tabela **mais alto** em vez disso: sob FIFO o último agente
nascido é o último que vai rodar, então é o cuja linha é necessária por último. Atores
zero-node vão pelo mesmo caminho, índice mais alto primeiro, e apenas em uma **ativação** em
uma execução `truncated`: eles são últimos porque despejar um não custa nada que um leitor
possa ver — o agente não tem nó, não tem fração nem histórico na tabela, e seu próprio
próximo despacho o readmite com seus fatos (o `node-queued` no meio é recusado, o que não
muda nada que ele pudesse ter desenhado). Sem a classe uma execução larga retomada fica
presa: `run-started` esvazia as tabelas, o prefixo reproduzido recria cada agente, então uma
tabela de atores cheia de agentes cujo primeiro ask ainda não voltou — ou, em um diário
antigo, agentes cujos assentamentos por acerto de cache não nomeiam ninguém — não tem vítima em
classe alguma e todo despacho posterior é recusado — o sintoma original, uma vida depois. Um
grupo vivo nunca é vítima, e o **próprio** grupo do recém-chegado também não: um subagente em
seu quarto ask tem três estabilizados atrás dele, e um grupo que está recebendo trabalho não
está terminado — despejá-lo deixaria o novo nó na tabela apontando para um ator que não
está, que é um ask rodando sem pílula nenhuma. Seus próprios nós **estabilizados** são outra
questão, e uma ativação que precisa só de um slot de nó os gasta primeiro: o ator fica, então a
pílula fica, e um agente entrega seu próprio histórico antes de tomar a linha de outro agente.
Sem isso o peso morto de um agente pode recusar seu próprio próximo ask — a tabela cheia de
asks que ele já terminou, nenhum deles despejável porque são seus. Despejar um grupo tira o
ator e todos os seus nós das duas tabelas em uma única redução, por um filtro que deixa os
sobreviventes em ordem, e o recém-chegado é acrescentado. Quando não há vítima o recém-chegado
é recusado, exatamente como em um limite sem ejeção.

A ejeção é também a primeira coisa que faz uma tabela **encolher**, o que custa mais uma
regra, e essa regra se aplica **apenas a uma execução `truncated`**. Em tal execução uma chave
nova para uma tabela é admitida apenas pelo **nascimento** dessa instância — `actor-created`,
`node-queued`, ou o `node-settled` cacheado — ou pela ativação acima, e apenas em um evento
que eleve a marca d'água; qualquer outro evento para uma instância que a tabela não contém
não muda nada e é contado exatamente como uma recusa no limite, e `usage.nodesUsed` igualmente
conta um primeiro despacho apenas em um evento que eleva a marca d'água, já que uma instância
não listada não tem linha cuja fase pudesse absorver a repetição. Sem isso um slot liberado
pegaria de volta uma instância já contada como não listada — de um evento reproduzido, ou de
uma fase posterior de uma instância que a regra de ativação não cobre — e a execução a
listaria e a contaria ao mesmo tempo.

Abaixo do limite nada muda: qualquer evento ainda pode criar uma linha, com ou sem marca
d'água. O redutor aplica eventos sob a marca d'água (ele só se recusa a baixá-la), e a
materialização a alimenta com a reprodução de um diário e eventos ao vivo no mesmo redutor,
então uma execução que um evento ao vivo semeou antes de seu prefixo de diário ser reproduzido
tem esse prefixo inteiro sob a marca d'água. Apertar toda execução deixaria um cartão desses
vazio — uma regressão em toda execução comum, para fechar um buraco que só existe depois que
algo foi recusado ou despejado, que é exatamente o que `truncated` registra.

Um ator nunca deve sobreviver ao seu último nó listado: sem nó para derivar, ele estabiliza
em uma pílula `pending` que nada vai mover. Então quando um nó nascido-estabilizado é
recusado em uma tabela de nós cheia e seu ator está listado e não possui nenhum nó listado,
esse ator é removido junto com ele — um agente terminado que não pode trazer seu nó não é
listado de forma alguma.

O converso — um agente despejado entre dois de seus asks — é o que a ativação fecha. Um grupo
terminado é despejável mesmo quando o script vai perguntar de novo a esse agente mais tarde, e
um subagente mantido entre fases, ou perguntado uma vez por rodada de laço, é exatamente
isso; mas seu próximo despacho repete o nome, a sessão e a fase de nascimento do agente, então
o ator é reconstruído a partir do despacho e o ask roda com sua pílula. O que um agente perde
por ser despejado é seu histórico: os asks anteriores sumem da tabela e vivem apenas nas
contagens e no diário.

Uma instância que a tabela não contém ainda é contada, em dois contadores opcionais em
`usage`: `nodesUnlisted` é quantas instâncias a tabela de nós não está contendo,
`nodesUnlistedSettled` quantas delas já estabilizaram. Então todo total que uma superfície
mostra é o real da execução e só o detalhe por passo para no limite. Uma instância não listada
é **nascida** em um `node-queued`, ou no `node-settled` cacheado que uma reprodução emite sem
um `queued`: o primeiro eleva `nodesUnlisted`, o segundo eleva ambos. Qualquer outro
`node-settled` sem entrada na tabela eleva apenas `nodesUnlistedSettled`. Um nó despejado
eleva `nodesUnlisted`, e eleva `nodesUnlistedSettled` junto com ele apenas quando aquele nó
tinha estabilizado — um grupo ocioso sai com um nó `queued`, que não tinha. Uma instância que
a tabela recupera em sua ativação baixa `nodesUnlisted` de novo, nunca abaixo de zero: ela
está listada agora, e uma superfície que a listasse e a contasse mostraria um passo a mais.
Tudo isso conta apenas quando a sequência do envelope está acima do `lastEventSequence` da
execução, então um evento reproduzido continua sendo o no-op que já é, e tudo isso reinicia em
`run-started`: uma vida retomada reemite o prefixo inteiro do script, uma estabilização
cacheada para cada instância que está feita e um `queued` para cada uma que não está, e
contar esse prefixo uma segunda vez dobraria os totais da execução. Ausente quando zero.

O que o limite custou a cada fase é registrado em `unlistedByPhase`, um balde por fase de
**nascimento**, sendo o balde sem `phaseName` o unphased. `actors` é quantos agentes daquela
fase a tabela de atores **não** está contendo agora, aconteça o que acontecer com eles;
`actorsSettled` é quantos deles são sabidamente terminados e `actorsFailed` quantos falharam;
e `settled` é quantos nós estabilizados não listados carregam aquela fase. A fase de um grupo
é a de seu ator, e os movimentos são: um `actor-created` recusado eleva `actors`; um grupo
terminado despejado eleva `actors` e `actorsSettled` (e `actorsFailed` quando falhou); um
grupo ocioso despejado eleva apenas `actors`, já que seu agente ainda vai rodar; um ator
zero-node despejado eleva igualmente apenas `actors`, seu resultado sendo desconhecido para a
fase; a regra do órfão eleva ambos; e um ator admitido em sua ativação baixa `actors` em
`actorPhaseName`, nunca abaixo de zero. Um nó nascido-estabilizado recusado cujo ator **não**
está listado não acrescenta nada aos contadores de agente: aquele agente foi contado em
`actors` sob **sua própria** fase de nascimento, que pode não ser a do nó, e um agente com
dois asks cacheados de outro modo seria contado como estabilizado duas vezes. O `settled` de
nós conta os nós estabilizados despejados e as recusas de nascidos-estabilizados, que
carregam um `phaseName` próprio.

Cada balde é então fixado a `actorsFailed ≤ actorsSettled ≤ actors`, e esse limite é a lei
do balde e não um conserto: é o que deixa `actorsSettled` cair bem como subir. Ele precisa
cair, porque o grupo de um agente parece terminado entre dois de seus asks — uma ejeção o
carimba como estabilizado e seu próximo despacho o traz de volta — e o balde não pode dizer
**qual** agente retornou. Subtrair um de `actorsSettled` numa ativação seria portanto um palpite,
e em um leque largo um palpite muito errado: centenas dos agentes daquela fase foram recusados
no nascimento e nunca estabilizaram, então cada ativação drenaria uma contagem que nunca foi
deles. O limite erra apenas enquanto um balde está adensado — um agente terminado que
retorna deixa sua marca de estabilizado em algum outro agente não listado da mesma fase até
que o balde drene — e os números por fase ficam certos conforme os agentes são listados. Os
contadores de nível de execução são exatos o tempo todo.

Um balde cujos números são todos zero é descartado e a chave desaparece com o último balde. A
tabela contém um balde a mais que o limite de fases, e além dele a atribuição é descartada
enquanto os contadores de nível de execução permanecem certos: uma estação pode perder um
número, os totais da execução não podem mentir. Ausente quando vazio, e uma subchave zero
ausente. `workflowRunStepCounts` não muda — ele lê os contadores de nível de execução, que já
cobrem recusas e ejeções.

As entradas são orçadas também na chave inteira, e esse orçamento despeja execuções inteiras
em vez de entradas: quando uma redução deixa mais de `maxTotalEntries` nós mais atores somados
sobre todas as execuções, a **execução terminal mais antiga** é despejada — nunca a execução a
que o evento pertence, nunca uma viva — até que a soma esteja dentro do orçamento ou que nada
seja despejável. A regra é uma função pura do estado reduzido, então uma reprodução a frio do
mesmo diário na mesma ordem despeja as mesmas execuções, e uma chave no pior caso fica dentro
do limite de bytes do snapshot.

Depois de cada evento de ator ou nó os status dos atores são rederivados: uma execução que não
está mais viva torna todo ator `completed`; senão qualquer nó em `executing`, `repairing` ou
`nudged` o torna `running`; senão qualquer nó em `queued`, `dispatched` ou `waiting`, ou
nenhum nó, o torna `waiting`; senão `completed`.

`resumable` é decidido pela CLI, no payload de `run-settled`, pelo mesmo predicado que o
comando de retomada usa (`status === "stopped"`, qualquer que seja o motivo); a UI nunca o
deriva de status ou códigos de erro, já que dois predicados discordariam um dia e mostrariam
um botão cujo comando é recusado.

### Reprodução a frio

A projeção é apenas em memória. Quando a CLI materializa a frio uma sessão (`v4-bridge`
`loadPersistedEvents`, apenas acerto direto de registro), ela lista as oito execuções mais
recentes dessa sessão a partir do diário, da mais antiga primeiro para que ambas as ejeções — a
contagem de execuções e o orçamento de entradas — batam com a chegada ao vivo, pula execuções
já presentes nos eventos de memória da sessão ou vivas no registro do processo, e reproduz os
eventos armazenados de cada execução pela mesma função de cunhagem que o progresso ao vivo usa,
em eventos de sessão sintéticos colocados antes dos persistidos.
**Itens de relatório além do limite da projeção nunca são lidos.** Os eventos são lidos com
`reportItems: {limit: 64}` (`execution-engine.md`, "Reading the journal"): todo evento volta,
mas um evento `report` depois do 64º da execução mantém sua instância, tag e hora e perde seu
`item`, que o SQLite remove antes de a linha chegar à CLI. O estado reduzido é o mesmo que a
partir dos eventos completos, porque o redutor indexa entradas de relatório por instância e
recusa novas depois de conter 64, um `run-started` não as limpa, e cada instância de relatório
é emitida uma vez (um relatório reproduzido é pulado silenciosamente). Então os primeiros 64
eventos de relatório são exatamente as entradas cujas prévias o redutor constrói; para cada um
posterior ele lê só a instância — para definir `truncated` — e a tag, para contar os itens do
painel. Uma execução que reportou 65.536 itens é reconstruída a partir de uma leitura limitada
em vez de seu diário inteiro.
**A estabilização é cunhada a partir da linha.**
Para uma execução cuja linha é terminal, o `run-settled` armazenado final (quando há um) é
descartado e um `run-settled` em memória carregando o status da linha, o motivo da parada
(`user` quando ausente), a sucessora e a falha ocupa seu lugar na mesma sequência; quando os
eventos terminam antes de uma estabilização (o processo morreu, a reconciliação de órfãos
apenas reescreveu a linha) ele é acrescentado depois do último; um App que fecha sob uma
execução viva não deixa essa lacuna, porque seu motor escreve sua própria estabilização
`stopped(interrupted)` antes de o fechamento resolver (`execution-engine.md`, "Engine
ownership"). Nunca é escrito no diário. A linha é a autoridade de status e seu codec já fala o
vocabulário atual, ao passo que payloads de evento são armazenados verbatim: execuções
estabilizadas antes do redesenho do estado terminal carregam `run-settled {status: "cancelled"
| "failed"}`, palavras que o redutor não conhece, e reproduzir essas verbatim deixava toda
tal execução `running` depois de um reinício, com um botão de Stop que alcançava uma execução
que o agente não tinha. Uma estabilização no meio do fluxo (uma execução cancelada e retomada
em um processo) é história real e é deixada em paz; o `run-started` depois dela devolve a
execução para running como antes. Para uma execução estabilizada com as palavras atuais a
estabilização cunhada a partir da linha é byte a byte idêntica à armazenada (o evento de
estabilização do motor carrega exatamente os quatro campos da linha), então ao vivo e a frio
ainda rodam o mesmo redutor sobre os mesmos bytes, e toda superfície mostra o mesmo estado antes
e depois de um reinício. O redutor em si nunca deixa uma execução viva depois de um
`run-settled`: uma palavra de status fora de `completed`, `errored`, `stopped` estabiliza a
execução como `errored` com a mensagem do evento (ou uma nota nomeando a palavra). A TUI
alimenta os mesmos envelopes ao mesmo redutor (`docs/dynamic-workflow/launch.md`).

### Juntando cartões a execuções

`SessionPane` constrói duas tabelas a partir de `workflowRuns.runs` uma vez por snapshot
(`v4/workflowRunCardJoin.ts`): por `toolCallId` (execuções sem um não têm cartão clicável e são
puladas) e por `runId` (necessária porque `toolCallId` continua apontando para a linha
`CreateWorkflow` original ao longo de uma retomada). Um resumo carrega `runId`, `status`,
`stopReason`, `nodesSettled`, `nodesTotal`, `agents`, o estado de execução inteiro e
`resumable`. As contagens de passos são `settled / observed`: um workflow não tem total
estático, então o denominador é o número de instâncias agendadas e nunca se passa por
percentual. O par vem de um helper em `packages/shared/src/zcode-protocol-v4/`,
`workflowRunStepCounts(run)` — `nodes.length + usage.nodesUnlisted` observados, as entradas
estabilizadas mais `usage.nodesUnlistedSettled` estabilizadas — que o join do cartão, o resumo
da linha do tempo e o espelho da TUI todos leem, então uma execução além do limite de nós não
pode mostrar um total no cartão e outro no painel. Abrir uma execução sempre prefere o
`toolCallId` da projeção, então o painel pode encontrar a linha de origem.

## Outros lugares onde uma execução aparece

A **cápsula de status** lista execuções vivas (`pending` e `running`) em ordem de
lançamento. Cada linha diz qual workflow, até onde ele chegou e há quanto tempo, em duas
linhas de altura fixa (56 px):

- **Linha um:** o ícone de Workflow, o nome (uma linha, truncado; o nome de fallback "Workflow
  script" na cor sutil quando a execução não tem nome) e, à direita, o tempo decorrido
  (`text-ui-sm`, sutil, tabular). O tempo usa as unidades de duração sem o prefixo "Running
  for" e descarta os segundos depois de uma hora (`1h 2m`). Não há tempo para uma execução
  pendente ou sem um trabalho em segundo plano pareado.
- **Linha dois** é o vocabulário da linha de execução da barra lateral: o mesmo
  `WorkflowRunRail` (lâmpadas, segmentos de trace, segmentos gêmeos, a dobra ±2 com `+n`), e
  então as **palavras de fase**. As palavras de uma execução que roda são suas fases
  queimando unidas por ` ∥ ` quando mais de uma queima, senão sua fase atual, senão a palavra
  de status. Uma execução pendente mostra uma lâmpada oca e a palavra de status. Uma execução
  que não declarou fases mostra uma lâmpada rodando e `{done}/{total} steps`, o único lugar
  onde os passos ainda aparecem.
- Um trabalho de workflow sem execução na projeção (uma CLI mais antiga) ganha uma **linha
  degradada**: apenas a linha um (nome e tempo), para que a entrada de Stop nunca desapareça.
- **Stop** é o botão fantasma de hoje ("Stop", ícone de quadrado) assentado sobre o tempo. Ele
  aparece no hover ou no foco de teclado dentro da linha, e o tempo esvanece sob ele. Em um
  ponteiro grosseiro (sem hover), ele é sempre mostrado como um botão de ícone de 32 px em uma
  terceira coluna, e o tempo vai para o fim da linha dois. Stop está ausente quando o trabalho
  não pode ser cancelado. Seu nome acessível é o "Stop run" do cartão.
- A linha abre o painel da execução por um botão irmão transparente quando tem um tool call
  id. O nome acessível do botão carrega o nome, o status e as palavras de fase da execução,
  porque a palavra de status visível sumiu.

O cabeçalho da seção lê uma lâmpada rodando e `{n} running`, o mesmo esteja a seção aberta ou
recolhida (sem figura de mais longa duração). Expandir a ilha nunca mostra menos do que a
pílula mostrava: a seção **abre quando uma execução viva aparece** (a contagem viva vai de zero
para uma ou mais, inclusive ao entrar em uma sessão que tem uma) e recolhe quando a última
execução termina, e clicar numa pílula que mostra um workflow expande a ilha com a seção
aberta, mesmo que o leitor a tenha recolhido antes. Uma dobra manual vale até as execuções
terminarem ou a sessão mudar. Terminais e Agents continuam começando recolhidos: eles nunca
lideram a pílula. Apenas a lista de execuções rola, a três linhas e meia, para que a meia
linha mostre que há mais; a entrada terminada fica abaixo da área de rolagem.

A **pílula** da cápsula (o resumo recolhido) mostra a primeira execução viva, à frente de
qualquer outro resumo: o ícone de Workflow, o nome, uma lâmpada (rodando ou pendente), as
palavras de fase e `+n` para as outras execuções vivas. As palavras de fase mantêm sua largura
inteira até 45 % da pílula e só o nome é cortado (a fase nunca encolhe, e seu teto deixa o
nome com o resto; um piso fixo no nome preencheria um nome curto com um vão): um nome é
reconhecido pelo seu começo, uma fase cortada não diz nada. Uma execução degradada mostra só
seu nome, sem lâmpada. Um workflow vivo tem precedência sobre os resumos de to-do, objetivo e
git porque enquanto roda é o que a sessão está fazendo; a velha razão para classificar trabalho
rodando por último (repetia a contagem do badge do compositor) não se sustenta para um nome e
uma fase.Sob as linhas, "ended workflows · N" abre a aba **diretório de execuções** (`workflow-directory`,
uma por sessão, sem dados de execução): duas seções, "Running" e "Ended", lidas da query de
descoberta do diário com um limite de 64 ("Showing the {count} most recent runs only" quando
cheia), atualizada quando a contagem de execuções ou de estabilizadas da projeção muda, nunca
em progresso de nó; linhas sem tool call id são descartadas tanto da lista quanto da contagem
para que as duas concordem por construção. O **badge do compositor** conta workflows rodando
separadamente de terminais e subagentes; quando o único trabalho rodando na sessão é um
workflow com tool call id, clicar nele abre o painel dessa execução diretamente ("Open
workflow details") em vez de expandir a cápsula. Um workflow lançado diretamente do hub
desenha o mesmo **cartão de execução** no lugar da bolha do usuário, unido à mesma execução
(`docs/dynamic-workflow/launch.md`).

### A linha de execução da barra lateral

Uma sessão que possui uma execução de workflow viva ou não reconhecida cresce uma segunda
linha sob seu título em toda lista de tarefas: a barra lateral do desktop (linhas planas,
agrupadas, de linha do tempo, fixadas e arquivadas), a lista do controle web em tela larga e
a home de tarefas do celular. A linha é a execução num relance e nada mais: o glifo lucide
`Workflow` (12 px, `text-foreground-subtle`), um **mini trilho** de lâmpadas de 6 px no
vocabulário do cartão (`STATUS_DOT`: pending oco, running warning pulsante, done success,
failed destructive) unidas por segmentos de 6 × 1 px que viram de `--color-workflow-trace`
para `--color-workflow-trace-strong` assim que o controle passou por elas, e o nome da fase
atual em `text-ui-sm text-foreground-subtle`. Não há halo, nem luz march, nem chip de
perguntas (as escalações são respondidas pelo agente principal, nunca pelo usuário), nem
contagem de subagentes e nem seta; essas vivem no tooltip de hover, que lê `{name} ·
{status}` sobre `{phase} · {n agents working} · {elapsed}`. Uma execução terminada mostra uma
palavra neutra na mesma cor sutil, `Completed`, `Errored · {phase}` ou `Stopped · {reason}`;
só as lâmpadas carregam cor. Um trilho com mais de seis estações recolhe para a primeira
estação rodando ± 2 e uma cauda `+n`. Um script que não declarou fases desenha uma estação
implícita chamada "Workflow". A linha é um botão: clicá-la seleciona a sessão e abre o painel
da execução, o mesmo salto que o badge do compositor faz. A linha de 32 px passa a 52 px por
linha; uma sessão mostra no máximo duas linhas (execuções vivas primeiro em ordem de
lançamento, e então a estabilizada mais recente), o resto recolhe em uma palavra `+n`. O slot
inicial de 16 px (erro, não lido, spinner) fica intocado: a linha de execução é um segundo
canal, não uma quarta prioridade.

**Reconhecimento.** A linha de uma execução viva é sempre desenhada. A linha de uma execução
estabilizada permanece até que a sessão seja aberta: o renderizador mantém um conjunto
limitado e persistido de ids de execução reconhecidos (256, o mais antigo despejado;
localStorage no desktop, o celular mantém o seu), e abrir uma sessão reconhece toda execução
estabilizada que ela carrega naquele momento. Uma execução que estabiliza enquanto sua sessão
está ativa é reconhecida de imediato, então a linha recolhe sob os olhos do leitor em vez de
permanecer. Não há temporizador nem `settledAt`: o estado estabilizado/reconhecido é uma
função pura do quadro do índice de sessões e do conjunto de acks.

**Cabeçalho de projeto recolhido.** Quando um grupo de projeto está recolhido, o cabeçalho
mostra uma lâmpada rodando pulsante ao lado do ponto de não lido, com a contagem quando mais
de uma de suas sessões tem uma execução viva. Execuções estabilizadas não reconhecidas não
somam em um total.

**Dados.** A projeção de índice de sessões da CLI deriva um resumo `workflowActivity` por
sessão a partir das chaves `workflowRuns` e `backgroundWorks` do mesmo snapshot, então a
barra lateral nunca abre uma sessão nem se inscreve em progresso de execução:

```ts
workflowActivity?: {
  runs: {                       // ≤ 4: live runs in launch order, then the most recent settled
    runId; toolCallId?; name?;  // name = the workflow background work's title
    status: "pending" | "running" | "completed" | "errored" | "stopped"; stopReason?;
    startedAt?;                 // the background work's startedAt, for the tooltip's elapsed
    phases: { name?; status: "pending" | "running" | "done" | "failed";
              alongside?: number[] }[];     // ≤ 32, declared order; alongside indexes into this list
    currentPhase?; agentsWorking: number;   // actors with status running
  }[];
};
```

Os status de fase seguem as regras do cartão: primeiro o fluxo de controle, e então os nós
próprios da execução. Enquanto a execução está viva a fase atual é `running`, toda fase já
entrada é `done`, o resto `pending`; uma execução `completed` marca as fases entradas como
`done`; uma execução `errored` marca a fase atual como `failed`; uma execução `stopped` a
deixa `pending`. Sobre isso, uma fase queima `running` enquanto a execução está viva e algum
nó **nascido nela** está `executing`, `repairing` ou `nudged` — nascido nela significando que
o nome de fase de nascimento do nó casa com o da estação, exatamente ou pela regra de prefixo
de 128 caracteres, a mesma regra que o cartão usa. Nós apenas acrescentam `running`; nunca
reescrevem `done`, `failed` ou `pending`, então a palavra de falha fica com o fluxo de
controle. Sem eles duas fases paralelas nunca poderiam queimar ao mesmo tempo, porque o fluxo
de controle lembra só o último marcador enquanto os subagentes da primeira fase ainda
trabalham. Uma execução que não está viva não tem nada queimando, mesmo que um evento
`settled` nunca tenha chegado. A lista de estações é `run.phaseNames` quando o lançamento
trouxe uma (`run-launched`, abaixo), senão as fases entradas mais a atual em ordem de entrada;
sem nenhuma das duas a lista é vazia e a UI desenha a estação implícita.

`alongside` é o mesmo fato que o cartão lê, carregado por fase como índices para a lista
emitida. Ele é preenchido apenas no caminho da tabela declarada, porque o fallback de fases
entradas é um espaço de índices diferente, e é refiltrado depois do corte de 32 estações. A
linha o dobra em bandas com o `foldPhaseBands` do cartão, sobre a tabela de fases **inteira**
antes da janela ± 2, então uma banda que atravessa a borda da janela não é rasgada ao meio; a
marca viaja na estação, não no segmento. Um segmento entre duas fases adjacentes por
declaração de uma banda em trilhos diferentes é então um **segmento gêmeo**: duas linhas de
1px a 2px de distância, a mesma largura e a mesma regra de tinta de um segmento simples. A
linha não lê `phaseStreams` (eles não estão em `run-launched`), então os estágios de um
pipeline são uma banda aqui e desenham segmentos gêmeos, enquanto o cartão e a espinha
desenham uma linha só; ambos são verdade, o retrato da linha é apenas o mais grosso. A
âncora da janela é a **primeira** estação rodando e não a fase atual, o que mantém o fork de
uma banda rodando em vista. Quando mais de uma fase está rodando o tooltip lista todas elas,
unidas por " ∥ ", no lugar da fase atual.

O resumo está ausente quando a sessão não tem execução nenhuma, então uma CLI mais antiga não
muda nada. O mesmo bloco viaja na atividade de tarefas do controlador do host desktop, no
sidecar de índice de sessões (`TaskListRowActivity.workflowActivity`) e no alvo de tarefas do
controle web, e participa da verificação de igualdade do resumo, então uma virada de fase, uma
estabilização ou uma mudança na contagem de subagentes trabalhando nunca podem ser
confundidas. Ele não torna a lista mais silenciosa: todo evento de progresso de execução já
avança `lastActivityAt`, que a mesma verificação compara, e isso permanece verdade por
projeto (a ordenação de sessões a lê como o fato de atividade).

**Nomes de fase.** O estado de execução nunca soube a tabela de fases completa, apenas as
fases já entradas, então um trilho não podia mostrar o que vem adiante.
`DynamicWorkflowRunSubmitRequest` carrega `phaseNames?` (as `phases` nomeadas do grafo de
causalidade, ordem declarada, ≤ 32 × 128) e `phaseAlongside?` ao lado (`number[][]`,
alinhado por posição com `phaseNames` e indexando-o, ausente quando nenhuma fase tem
alguma). Ambos os submitters (a ferramenta `CreateWorkflow`, incluindo um ajuste, e o início
direto do hub) os preenchem a partir de um helper sobre uma única lista de fases nomeadas,
então as duas tabelas nunca podem discordar sobre o espaço de índices, e um submitter que não
tem `phaseNames` também não envia `phaseAlongside`. O motor registra ambos em `run-launched`
ao lado da âncora de input, então uma reprodução a frio os reconstrói de graça e uma
retomada por ajuste obtém as fases do novo script sob a âncora do predecessor. O redutor lê
`phaseAlongside` só depois de ter aceitado `phaseNames`: a tabela é cortada ao comprimento
dos nomes aceitos, cada entrada filtrada para inteiros no intervalo e nunca seu próprio
índice, deduplicada, e o campo inteiro descartado quando nada sobrevive — um payload não é
uma promessa. Não há migração; os campos viajam no evento como os nomes.

## Alternativas não adotadas

- **Ler uma chamada `future` como bloqueante, para a exibição.** Desenhar cada estágio como se
  seu future tivesse retornado antes do próximo começar dá a um pipeline sua linha única de
  forma barata, mas a ordem passa a ser a ordem do código, não a ordem dos dados: dois futures
  sem canal entre eles desenham como uma cadeia falsa `A → B → writer` — o retrato que o
  trabalho de fases paralelas removeu — e um trilho simples entre dois estágios afirma que o
  segundo rodou depois do primeiro. Arestas de stream dão a mesma linha para todo pipeline e
  deixam futures independentes em uma banda.
- **Manter a banda e juntar seus estágios com conectores diagonais de stream.** Honesto sobre
  concorrência, mas mantém todos os custos de uma banda de linhas de estação única: uma linha
  por estágio, quase toda ela linha vazia, os forks e merges amontoados nas bordas do cartão, a
  saliência dobrando trilhos de ramo, e os diagonais cruzando os líderes.
- **Mover traços em vez de chevrons em um trilho de stream.** Lê como movimento de longe, mas
  é a aparência que a aresta march aposentou, e em repouso um trilho tracejado é indistinguível
  dos líderes e do segmento gêmeo da barra lateral.
- **Editar as configurações no lugar na linha de resumo do painel** (o segmento de modelo um
  menu, o chip um stepper): cada mudança iniciaria sua própria execução, e a linha não tem
  espaço para a frase que diz isso. Um popover com um Apply faz de uma mudança das duas
  configurações uma única execução.
- **Distinguir a linha de retune por um novo campo de display.** Duas formas estavam
  disponíveis e ambas quebram clientes antigos. Adicionar uma chave `retune` ao display de
  `create_workflow`: seus três schemas são `.strict()` sobre um conjunto congelado de campos,
  então uma chave desconhecida não se degrada, ela descarta todo o resultado da ferramenta em
  um cliente anterior a ela. Um tipo de display próprio: `toolOutputSchema.display` é uma
  união discriminada, e um tipo desconhecido é uma falha de parse em um pacote de celular com
  versão fixada. (Ambos os perigos são limitados a partir de 2026-09-21 — o envelope descarta
  um display ilegível em vez de rejeitar o frame — mas só para clientes que carregam essa
  mudança. Contra um cliente lançado antes dela, ambas as formas ainda quebram, então a
  decisão se mantém até que a correção tenha sido lançada em toda parte que importa.) A linha
  é portanto reconhecida a partir de campos que já cruzam o v4 — a forma do input, o display
  ausente, o status de sucesso, o join de execução faltando — e o bloco estruturado `retuned`
  da ferramenta fica no processo (`docs/dynamic-workflow/launch.md`, "Changing only the
  parallelism of a live run").
- **Uma seção de configurações no painel**, com o botão do cartão fazendo deep link para
  ela: a mais descobrível, mas gasta cerca de 70 px de cabeçalho em toda execução e põe o
  cartão a dois passos da mudança.
- **Um quadro de nós e arestas** (React Flow): fases como módulos desdobráveis, cartões de
  subagente dentro de cada módulo aberto com setas de handoff entre eles, um inspetor ancorado
  listando instâncias e fatos, um diálogo de expandir, uma câmera que segue a frente da
  execução. Três superfícies deram uma figura três semânticas de clique e enterraram "onde a
  execução está agora" sob quatro níveis; um trilho com pílulas responde num relance.
- **Desenhar o grafo de handoff.** Dentro de uma fase o leitor quer saber quem participou,
  não quem seguiu quem; as pílulas são listadas em ordem de handoff e as setas não são
  desenhadas.
- **Setas tipadas por kind, pistas de certeza** (contornos tracejados, designadores `?`, uma
  faixa de legenda): cada uma custou mais leitura do que pagou; uma seta significa "roda
  depois" e nada mais.
- **Renomear trilhas e passos por uma chamada de modelo antes da janela de confirmação**
  (refinamento do grafo): retirado; os nomes são escritos uma vez, corretamente, quando o
  script é escrito.
- **Uma faixa de posto** no cabeçalho do cartão no lugar de estações roladas para fora, e uma
  **viewport com encaixe e setas**, e **envolver o trilho em várias linhas**: a saliência diz
  quais estações estão fora de vista; um trilho que quebra lê uma linha para a esquerda como
  uma aresta de retorno.
- **Ler `back` como direção de arco**: um marcador de reentrada é uma aresta para frente para
  o analisador e aponta para a esquerda na linha do tempo.
- **Ombros ou curvas para terminais de arco.** Manter os pousos no centro da lâmpada e mover
  cada decolagem 8px para o lado em que ela sai resolve um arco de entrada e um de saída, e
  funde de novo com duas decolagens do mesmo lado. Arcos de Bézier separam entrada e saída
  pelo ângulo, mas mudam o vocabulário ortogonal do cartão, pousam pontas de seta em todo
  ângulo, e ainda se encontram em um ponto sobre a lâmpada. Os slots terminais são a
  distribuição de pousos que o cartão já tinha, dada também às decolagens.
- **Um desvio para uma fase paralela** (a segunda fase em um curto trilho gêmeo ao lado da
  primeira) e **barras de extensão** (uma linha Gantt por fase, comprimento por duração): o
  desvio diz "ao lado" sem dizer onde o controle se reencontra, e barras precisam de um
  relógio que a projeção não tem. Um fork e um merge dizem as duas coisas, no vocabulário que
  a linha do tempo já fala. O desvio sobrevive apenas na saliência e na barra lateral, onde um
  fork não cabe em 6px.
- **Desenhar a aresta de "próximo" `A → B` dentro de uma banda**: o fork já diz que o
  controle passou pelas duas, e uma seta entre duas fases paralelas lê como "B roda depois de
  A", que é a única coisa que ela não significa.
- **Uma aresta `march` para toda a linha do tempo**: com dois trilhos rodando a aresta única
  tinha que escolher um vencedor, e o fork do perdedor apagava enquanto seus subagentes
  trabalhavam.
- **Traços marchantes e luz viajante para a aresta em execução.** Os traços vieram primeiro:
  traços warning de 4px deslizando ao longo do trilho march e do arco em um loop de 0.6s.
  Eram a tinta mais alta do cartão, em um relógio que nunca concordava com o da lâmpada, e o
  cartão já gasta um vocabulário tracejado no líder de uma fase de ramo (pontilhado 1 on 2) e
  em um arco se revelando (`wf-draw`). Uma conta da cor da lâmpada viajando pela aresta para
  dentro da lâmpada lia como a execução estar a caminho da fase anterior para esta, e ficava
  quieta entre as pulsações. Uma aresta warning sólida de 2px era a linha amarela como tal,
  mais alta que a lâmpada em um arco de retorno longo. Deixar a aresta acesa respirar com a
  pulsação devolveu movimento ao passado e piscou uma área grande em um join ou em um arco
  longo. Luz espalhando da lâmpada ao longo da aresta é viagem de novo, apontando para o
  outro lado.
- **Uma contagem, um medidor e uma grade de células no cartão** para leques largos: o cartão é
  um resumo; o painel lista todo mundo.
- **Avatares PNG ou de matiz hasheada**: nove imagens saturadas colapsavam para matiz a 16px e
  custavam um megabyte; letras colidem e derivam com a nomeação de modelo.
- **Desenhar o fim da execução** (um nó sumidouro, setas de saída): a última estação é o fim.
- **Uma pílula flutuante acima do compositor** para o workflow rodando: a cápsula de status já
  abriga a atividade viva.
- **Temporizadores como fallbacks** para o voo da câmera, a dobra ou a caneta: o estado é
  sincronizado por posição e conteúdo, nunca por um relógio.
- **Uma lâmpada em aposentadoria para `pending`** nos cartões: um cartão pendente é pixel a
  pixel idêntico a um estático.

## Perguntas em aberto

- `handoffs` e `exits` são limitados, validados e transportados, e nada na UI os lê desde que
  o quadro foi aposentado. Eles permanecem porque o contrato é barato e um leitor de handoffs
  (um inspetor, um tooltip) é plausível; se nenhum aparecer, devem sair.
- A aresta `march` é escolhida por regras, não por tempo; os nós não carregam timestamps. Se
  algum dia carregarem, a aresta deveria ser a da estação do nó estabilizado mais
  recentemente.
- Não há evento de "fase saiu", então `phase("A"); if (x) { phase("B"); … } ask2` acende A e
  B enquanto `ask2` roda. Os prompts desencorajam esse formato; um evento de saída custaria um
  `try/finally` na lowering.
- Uma estação reentrada de várias fases lê `rounds` a partir de ordinais de nós, que contam
  por sítio: a k-ésima estação tal mostra uma contagem de rodadas que é na verdade uma
  contagem de instâncias.
- A espinha desenha trilhos `faint` e `strong` de forma idêntica; só o cartão mostra a
  diferença.
- A contagem da lista do painel ordena done · running · failed · pending enquanto os segmentos
  do medidor correm done · failed · running · pending; o `aria-label` do mededor segue a
  contagem.
- Uma banda só é tão boa quanto seu `alongside`. Um await que o analisador não consegue
  resolver alarga a ordenação sobre tudo que está em voo — a direção licenciada, mas deixa o
  próximo marcador sem nada estacionado ao lado, então nenhuma banda é desenhada e a linha do
  tempo lê como uma linha reta. As lâmpadas ainda dizem a verdade, porque vêm dos nós: duas
  fases queimam ao mesmo tempo tendo ou não o retrato bifurcou. É o modo de falha que os
  arcos já têm, uma superaproximação que custa detalhe e não honestidade.
- Uma aresta para frente entre dois trilhos de uma banda não é desenhada. O fork diz que o
  controle passou pelas duas, mas um leitor que quiser saber qual membro alimenta qual não tem
  linha a seguir.
- Duas bandas lado a lado sem nenhuma estação entre elas desenham um trilho simples na linha
  principal do ponto de merge da primeira banda ao ponto de fork da segunda, e nenhuma das
  bandas tem `pred` ou `join`. A forma não ocorre hoje: uma lacuna entre duas bandas guarda
  pelo menos a fase que entrou na primeira.
- O halo de hover de uma lâmpada serve apenas à espinha. No cartão a lâmpada não está dentro
  do botão de sua cabeça em nenhum dos dois layouts, então passar o mouse sobre uma cabeça
  nunca faz halo na lâmpada; o halo próprio e a pulsação da lâmpada em execução não são
  afetados.
