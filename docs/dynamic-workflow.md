# Dynamic Workflow (spec)

Status: implementado. Este documento é o ponto de entrada da feature: o que ela é, de
quais peças é feita, como um workflow percorre essas peças e quais palavras e princípios
todo componente compartilha. Sete documentos de componente, listados em "The pieces",
detalham cada parte; este apenas aponta para eles e repete o mínimo possível.

## O que é e por que existe

Um workflow dinâmico permite que o agente principal dirija muitos subagentes **escrevendo
um programa** em vez de uma conversa. O modelo escreve um script TypeScript comum contra
uma pequena fachada: `agent()` cria um subagente, `.ask<T>()` lhe entrega uma tarefa e
devolve um resultado tipado, `files.*`, `git.*` e `world.run` leem e sondam o workspace,
`report` transmite as descobertas, `artifact.*` publica entregáveis, `phase()` nomeia uma
etapa e `log` narra. Todo o resto é TypeScript puro: `await`, `Promise.all`, `for`, `while`,
`if`, `try/catch`, funções auxiliares, `.map`.

É o harness, e não o modelo, que fornece o rigor. Desse único script ele recupera:

| Recuperado | Como |
|---|---|
| tipos | o script é verificado pelo compilador TypeScript contra o `.d.ts` da fachada |
| schemas | cada `ask<T>` recebe um schema JSON sintetizado a partir de `T`; a resposta do subagente é validada contra ele |
| o grafo de dependências | uma análise estática lê o script uma vez e desenha quem alimenta quem, o que roda depois do quê e por onde o controle pode passar |
| identidade | cada chamada de fachada é um **site** com id estável; cada execução dele é uma **instance** |
| durabilidade | cada instância é registrada no journal; uma execução retoma rodando o mesmo script de novo, com o journal respondendo pelo que já aconteceu |

Dois tipos de tarefa ganham mais. O primeiro é trabalho largo e estruturado: "encontrar os
bugs em cada arquivo TypeScript" é um `files.glob` e um `.map` sobre ele, enquanto a
alternativa conversacional seria um glob, uma lista longa e um subagente lançado à mão por
arquivo. O segundo é um procedimento fixo do qual o modelo não pode se desviar: um
Programmer e um Prover alternam até uma prova ser aceita ou o limite de rodadas ser
atingido, e essa regra é código, não uma frase em um prompt.

```ts
const programmer = agent("Programmer", { system: "You are a Lean 4 engineer…" });
const prover = agent("Prover", { system: "You are a Lean 4 verification expert…" });

phase("Implement");
let impl = await programmer.ask<ImplUpdate>(`Implement compress / decompress in ${IMPL_PATH}.`);
phase("Verify");
let verdict = await prover.ask<Verdict>(`Prove or refute ${THEOREM}. Notes: ${impl.notes}`);

let round = 1;
while (!verdict.pass && round < MAX_ROUNDS) {
  round += 1;
  impl = await programmer.ask<ImplUpdate>(`Rejected: ${verdict.reason}. Fix ${IMPL_PATH}.`);
  verdict = await prover.ask<Verdict>(`The implementation changed (${impl.notes}). Re-verify.`);
}
return { proved: verdict.pass, rounds: round, verdict };
```

Os dois subagentes mantêm sua própria memória entre as rodadas porque o script mantém uma
referência a cada um; chamar `agent()` dentro do loop criaria um subagente novo a cada
rodada. O `while` é um loop que o analisador enxerga, que o usuário vê como uma seta de
volta no grafo de confirmação e que o journal reproduz.

A feature é independente da ferramenta `Workflow` mais antiga e de seus scripts
`.workflow.js`, que ainda existem sob a mesma palavra; a ferramenta voltada ao modelo aqui
é `CreateWorkflow`.

## The pieces

**Autoração.** A fachada é uma única string `.d.ts` com a qual o compilador é alimentado e
que as descrições de ferramenta embutem, de modo que o que o modelo lê e o que é
verificado não podem divergir. O comando `/workflow <instructions>` carrega a skill
`dynamic-workflows`, que carrega o julgamento: como escolher uma topologia, quando um
resultado merece um passo de verificação, o que fazer após submeter. Os prompts dizem a
cada subagente o que é um workflow, que seu ask tem uma resposta tipada a submeter e que
ele escreve para o usuário. O mesmo documento responde por `world.run`, pelo canal de
artifacts e por `EvalWorkflowSnippet`, uma ferramenta de rascunho que roda um fragmento de
script pelo compilador e sandbox reais, sem subagentes.

**Análise.** Antes de qualquer coisa rodar, o analisador compila o script, coleta seus
sites, executa as verificações de autoria e interpreta o script uma vez para produzir um
único **analysis core**. Desse núcleo ele projeta quatro grafos: o grafo de sites (o que
alimenta o quê), o grafo de causalidade (o que roda depois do quê, e por quê), o grafo de
fluxo de controle (por onde a execução pode passar) e o grafo de hand-off (quem entrega
trabalho a quem em cada fase). A imprecisão amplia um conjunto de arestas; apenas uma
regra — uma chamada de fachada precisa ser uma chamada direta — rejeita um script.

**Lançamento.** `CreateWorkflow` recebe um script inline ou um workflow salvo pelo nome,
compila-o e abre a janela de confirmação em todos os modos de permissão. A janela mostra o
nome, a linha do tempo de fases e o script recolhido, e oferece Allow, Always allow in this
session, Deny e Refine (negar com um feedback que o modelo lê). Workflows salvos são
arquivos `<name>.dwf.ts` em um diretório de projeto ou global, listados por
`ListSavedWorkflows`, escritos por `SaveWorkflow` e exibidos na página hub, onde 「运行」
(Run) inicia um em uma nova sessão, sem turno de modelo. `ListWorkflowRuns` e
`GetWorkflowRun` deixam o modelo olhar execuções; a CLI e a TUI têm seu próprio card e
`/dwf`.

**O motor.** O lowering transforma o script aceito em um corpo de função JavaScript cujas
chamadas de fachada carregam seus site ids. Um processo filho o executa em uma célula `vm`
e fala com o harness por um protocolo de fio; o harness chama o núcleo puro do motor, que
possui o estado e as decisões e não faz I/O além do journal. O driver atrás dele abre uma
sessão por subagente, despacha asks, registra cada instância como uma linha de journal e
cada evento como uma linha de journal, e encerra a execução como `completed`, `errored` ou
`stopped`. Resume reproduz; amend (`AmendWorkflow`) inicia uma nova execução semeada com os
resultados de uma predecessora, parando a predecessora primeiro se ela ainda estiver
rodando; `escalate` deixa um subagente fazer uma pergunta ao agente principal.

**Concorrência.** Uma execução tem um limite fixo de asks em voo, e toda requisição de
modelo no processo passa por um governador compartilhado que aprende o limite real do
provider a partir de suas recusas e se adapta. Erros transitórios do modelo são repetidos
dentro da execução sem limite; os determinísticos encerram a execução como
`stopped(provider)`.

**Apresentação.** A GUI nunca vê os grafos do analisador. Uma camada de delimitação os
condensa em um único payload de exibição, e uma função pura constrói uma linha do tempo
horizontal a partir dele: fases como estações, subagentes como pílulas, skips e loops como
arcos. A mesma linha do tempo é desenhada na fileira de ferramentas enquanto o modelo
escreve, na janela de confirmação, ao vivo sob o turno como card da execução e
verticalmente no painel de execuções como uma espinha.

**Transcrição e notificações.** O agente principal fica sabendo de uma execução por textos
`<task-notification>`; a GUI desenha o payload estruturado emitido com cada um. O resumo
de uma execução concluída termina em um card de conclusão: tiles de artifacts e quatro
números contados pelo motor. Uma aba lateral por execução reproduz os passos do próprio
script como cards de ferramenta, e cada transcrição de subagente termina em um epílogo do
motor, recolhido.

| Documento | Escopo |
|---|---|
| `docs/dynamic-workflow/authoring.md` | a fachada, `/workflow` e a skill, prompts de subagente, regras de tempo de compilação, artifacts, `world.run`, a ferramenta de snippet, contabilização de uso |
| `apps/zcode-cli/packages/dynamic-workflow/docs/analysis.md` | sites, diagnósticos, o interpretador, os quatro grafos, junção de instâncias de runtime |
| `docs/dynamic-workflow/launch.md` | `CreateWorkflow`, a janela de confirmação, workflows salvos e escopos, a página hub, lançamento direto, CLI/TUI, ferramentas de introspecção de execuções |
| `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md` | lowering, o sandbox, o núcleo do motor, ciclo de vida do ask, o journal, resume, amend, estados terminais, escalonamento, o leito de testes da matriz de falhas |
| `docs/dynamic-workflow/concurrency.md` | os dois limites, tickets de requisição, o controlador adaptativo, a política de erros de modelo, requisições do lado da ferramenta |
| `docs/dynamic-workflow/presentation.md` | o contrato de exibição, o modelo de linha do tempo, o overlay ao vivo, o card de execução e o painel de execuções |
| `docs/dynamic-workflow/transcript-and-notifications.md` | notificações, o card de conclusão, a transcrição do script, o dobra do epílogo |

## A vida de um workflow

1. **O usuário opta.** O modelo chama `CreateWorkflow` apenas quando o usuário pediu um
   workflow: por `/workflow <instructions>`, com as próprias palavras, ou nomeando um que
   já está salvo. O comando carrega a skill; o modelo decide a topologia e então escreve o
   script. `EvalWorkflowSnippet` pode experimentar antes um fragmento `files.*` ou
   `world.run`.
2. **Compilar e analisar.** A ferramenta compila o script e roda o analisador. Um script
   com diagnósticos nunca chega ao usuário: o modelo recebe linhas
   `L{linha}:C{coluna} {mensagem}` e resubmete. Um script limpo produz o payload de
   exibição.
3. **Confirmar.** A janela de confirmação aparece em todos os modos de permissão com a
   linha do tempo de fases e o script. Allow roda uma vez; Always allow para de perguntar
   por esta ferramenta nesta sessão; Deny recusa; Refine recusa com feedback. Uma emenda de
   uma execução iniciada nesta sessão pula a janela. 「运行」 na página hub é seu próprio
   consentimento.
4. **Executar.** A ferramenta devolve o id da execução de imediato; o agente principal segue
   com seu turno. O sandbox executa o script; cada `ask` se torna um turno de sessão de
   subagente, enfileirado FIFO em seu subagente e admitido sob o limite da execução e o
   teto compartilhado do governador; cada leitura de world roda no harness. Toda instância
   e todo evento é registrado no journal antes que alguém o veja. As lâmpadas e pílulas do
   card de execução acompanham os eventos; o painel de execuções mostra a mesma execução
   como uma espinha com as transcrições de subagente a um clique.
5. **Perguntas.** Um subagente bloqueado chama `escalate`; o agente principal recebe uma
   notificação de pergunta e responde com `ResolveWorkflowQuestion`. O subagente espera,
   sem timeout, até então.
6. **Encerrar.** O script retorna (`completed`), lança (`errored`), ou algo fora dele
   encerra a execução (`stopped`: o usuário, o agente principal, o provider ou um processo
   interrompido). As asks em voo são abortadas, as sessões de subagente são fechadas, e uma
   notificação carrega o resultado, os itens relatados e os artifacts publicados, inclusive
   para execuções que não concluíram.
7. **Depois.** O agente principal digere a notificação; uma execução concluída encerra
   aquela resposta com o card de conclusão. Uma execução parada retoma com
   `ResumeWorkflowRun` ou com o Resume do painel de execuções, sob o script byte a byte
   idêntico; um script revisado passa por `AmendWorkflow`, uma nova execução que importa o
   trabalho finalizado como cache e, quando a predecessora ainda está rodando, a para
   primeiro. Uma mudança apenas de configurações (concorrência, modelo de subagente, nome)
   passa pela mesma ferramenta, com o script de fora. Um workflow que vale a pena guardar é
   salvo com `SaveWorkflow` e aparece na página hub, onde o usuário o executa de novo sem o
   modelo.

## Vocabulário

A prosa usa estas palavras em todos os documentos de componente e na GUI. Identificadores
de código, campos de protocolo, nomes de evento e site ids mantêm suas grafias anteriores
onde a tabela diz isso.

| Palavra | Significado | Em código / UI em chinês |
|---|---|---|
| **workflow** | a coisa que o modelo escreve e o usuário aprova: um script e seu nome | 工作流 |
| **script** | o código-fonte TypeScript; também a faixa da linha do tempo para os passos que o script executa sozinho (`files.*`, `git.*`, `world.run`) | lane id `workspace`; pill 「脚本」, tab 「脚本步骤」 (Script steps) |
| **site** | uma chamada de fachada no script, a unidade de identidade: `ask#3`, `actor#1`, `world-read#2`, `report#1`, `artifact#1` | `siteId` |
| **instance** | uma execução de um site, `siteId@ordinal` | `{siteId, ordinal}`; um **node** do journal |
| **step** | um site de ask ou de world-read como os grafos o desenham | `Step` |
| **subagent** | a sessão por trás de um valor `agent()`; mantém sua transcrição entre asks e responde a eles um de cada vez | identificadores `actor*`, `actor#N`, `actor-created`; 子代理. O 子智能体 da ferramenta Agent genérica é outra coisa |
| **ask** | uma instância de `.ask()`: uma mensagem a um subagente e o resultado tipado com que ele encerra. Vocabulário apenas de script e motor; toda superfície de usuário chama isso de **task** (任务), para que **question** (问题) fique reservado a um escalonamento | `ask#N`; exibição "{n} tasks" / 「{n} 个任务」 |
| **run** | uma execução de um script sob um id de execução | `dwfrun-<uuid>`; substantivo 实例 (工作流实例, N 个实例), verbos permanecem 运行 (停止运行, 恢复运行) |
| **phase** | uma etapa nomeada que o script declara com `phase("…")`; uma estação na linha do tempo | 阶段 |
| **artifact** | na fachada e em toda superfície de usuário: o que o script publica para o usuário guardar (`artifact.file`, `.markdown`, ou um `chart`/`table`/`metrics`/`board` alimentado por itens `report` marcados). No máximo um é o **primary**, o entregável com que as superfícies abrem (`primary: true`; um artifact solto conta). apenas em identificadores do motor: a saída tipada de um site ou o valor de retorno do script | 产物; o primary nunca recebe rótulo na UI |
| **saved workflow** | um arquivo `<name>.dwf.ts`: um bloco de metadados `/* zcode-workflow */`, depois o script | 已保存的工作流 |
| **scope** | onde um workflow salvo vive: `project` (`<cwd>/.zcode/workflows/`) ou `global` (`~/.zcode/workflows/`); um workflow de projeto esconde um global com o mesmo nome | 「项目」 / 「全局」 |
| **world read** | uma chamada registrada no journal para dentro do workspace: `files.*`, `git.*`, `world.run` | `world-read#N` |
| **journal** | o registro durável de uma execução: run, subagentes, nodes, events | `dwf_run`, `dwf_actor`, `dwf_node`, `dwf_event` |
| **question** | a chamada `escalate` de um subagente aguardando o agente principal | `dwfq-…`; 询问主代理 |

## Princípios que valem entre componentes

**Recuperar o rigor em vez de exigi-lo.** O modelo escreve o programa mais natural que
consegue; tipos, schemas, arestas, identidade e durabilidade são derivados dele. Onde algo
não pode ser recuperado, um diagnóstico de tempo de compilação diz o que mudar; a fachada
nunca é estreitada para facilitar a análise.

**A imprecisão amplia e nunca rejeita.** Uma aresta que a análise não consegue provar exata
ainda é desenhada. A única regra dura é que uma chamada de fachada precisa ser uma chamada
direta, porque uma chamada alcançada através de um valor de função escapado não tem site e
portanto não tem identidade.

**O grafo estático é completo antes de qualquer node rodar.** Nada é aprendido da
execução; uma execução apenas decora o quadro, unido a ele pelo site id. A janela de
confirmação portanto mostra a forma inteira do que vai acontecer.

**O journal é a verdade.** Todo node e todo evento é escrito antes de ser exibido. Resume é
o mesmo script rodado de novo contra o journal; a transcrição, o card de conclusão e cada
notificação são construídos a partir de registros do motor, nunca do que o modelo disse
sobre eles.

**Semântica simples, sem retentativas ocultas de lógica.** `Node<T>` é um thenable, então
esperar é `await`, um join é `Promise.all`, e não aguardar é concorrência. Um ask que
falha rejeita sua promise e o script decide; um laço de retentativa é código e aparece no
grafo. Só transientes do provider são repetidos invisivelmente, e só dentro da execução.

**Os limites falham alto.** Uma world read acima do limite rejeita aquele node
(`WorldReadCapExceeded`); uma execução acima dos limites de report falha
(`ReportCapExceeded`). Nada é truncado, porque uma visão silenciosamente parcial de um
workspace espalhado é pior que uma falha que o script pode capturar.

**Cancelamento e confirmação são os controles.** O harness não impõe orçamento de tokens
nem teto de nodes, e o script não lê nenhum dos dois; o uso de tokens é contabilizado como
observação. O usuário aprova o script uma vez, na janela; não há prompt dentro de uma
execução.

**Um só estilo de seta.** Toda ordenação na tela é um tipo único de seta; a redução
tipada do analisador decide quais setas sobrevivem, e a renderização não carrega tipos.

**Escreva para o usuário.** Nomes de subagente, nomes de fase, linhas de `log`, reports e
artifacts são lidos pela pessoa, no idioma da sessão; o modelo é ensinado a nomear e escrever
de acordo.

## Alternativas não adotadas

- **Uma DSL de step ou loop** (`step()`, `task()`, cadeias `.then`, um auxiliar de
  fan-out): `await`, `Promise.all`, `for` e `.map` puro são reconhecidos estaticamente, então
  a DSL só adicionaria cerimônia.
- **Obter-ou-criar subagentes por nome**: dois ramos paralelos convergiriam silenciosamente
  para um contexto serializado, sem variável compartilhada que o mostrasse. Todo `agent()`
  é um subagente novo; compartilhar um subagente é compartilhar uma referência.
- **Um REPL persistente como venue**: um script de uso único submetido por uma chamada de
  ferramenta é o que pode ser verificado, desenhado, confirmado e reproduzido por inteiro.
- **Um orçamento de tokens e um teto de nodes**: nenhum chamador nunca definiu um
  orçamento, o teto cercava fan-outs grandes normais, e um script otimizando contra um limite
  é pior que uma pessoa cancelando.
- **Tier de modelo e perfil de ferramentas na persona**: todo subagente roda no modelo da
  sessão-pai com as ferramentas de trabalho regulares; o que ele pode fazer está dito no
  ask.
- **Tracing de runtime como fonte de dependências**: o grafo estático é completo antes da
  execução; um grafo que crescesse enquanto roda não poderia ser confirmado.
- **Reaproveitar a máquina legada `Workflow` / expert-workflow**: contratos novos e uma
  superfície de UI nova, para que nenhuma feature limite a outra.

## Perguntas em aberto

Cada documento de componente termina com as suas. Duas que atravessam tudo permanecem:

- Se uma execução interrompida por saída de processo deve retomar sozinha quando a sessão
  proprietária retorna, em vez de esperar pelo usuário ou pelo modelo.
- Orientação para valores grandes em prompts: quando um script deve interpolar
  `JSON.stringify(bigThing)` e quando deve entregar aos subagentes um caminho.