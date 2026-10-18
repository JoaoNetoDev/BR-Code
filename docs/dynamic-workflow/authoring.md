# Dynamic Workflow: Authoring (spec)

Status: implementado. Este documento descreve o que o modelo e o usuário veem quando um
workflow é escrito: a facade contra a qual o script é escrito, o comando `/workflow` e a
skill de autoria, os prompts que um subagent recebe, o canal de artefatos, `world.run` e
a ferramenta de snippet. O analisador que verifica o script está em
`apps/zcode-cli/packages/dynamic-workflow/docs/analysis.md`; o que acontece depois que o
script é aceito está em `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`;
as ferramentas que submetem e confirmam uma execução estão em `docs/dynamic-workflow/launch.md`.

## A superfície de autoria

Um workflow é um script TypeScript. O modelo o escreve, o usuário o confirma, o harness o
executa. Cinco coisas chegam ao modelo enquanto ele escreve:

| Superfície                                                                                        | O que transporta                                                                                                                     | Onde                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| descrições e schemas de `CreateWorkflow`, `AmendWorkflow`, `SaveWorkflow`, `EvalWorkflowSnippet` | um parágrafo cada: o que a ferramenta faz, quando chamá-la, "carregue a skill antes"; dicas de campo de uma frase | `core/src/tool/handlers/*-description.ts`, `contracts/src/tools/*.ts` |
| comando `/workflow <instruções>`                                                                   | um comando de prompt embutido de cinco linhas que carrega a skill e nomeia `CreateWorkflow`                                            | `bootstrap/src/builtin-workflow-command.ts`                           |
| skill `dynamic-workflows`                                                                         | a camada de julgamento (topologia, qualidade, entrega, pós-envio) e, na §16, as declarações da facade, as regras e os campos de cada ferramenta | `packages/bundled-skills/skills/dynamic-workflows/`                   |
| o gate da skill                                                                                   | as quatro ferramentas recusam um script até que a skill tenha sido carregada na sessão                                                 | `core/src/tool/handlers/workflow-skill-gate.ts`                       |

A divisão é fixa ao contrário de como ficava até 2026-09-21: as descrições carregam apenas
o que o modelo precisa saber antes de decidir chamar uma ferramenta (roteamento, a regra
nunca-não-solicited de `SaveWorkflow`, o ponteiro para a skill), e a skill carrega a API e
todas as regras. O texto da facade aparece no contexto do modelo exatamente uma vez, na
§16.2 da skill, embutido literalmente a partir da mesma constante alimentada ao compilador,
de modo que o contrato que o modelo lê não pode divergir do que passa no typecheck. Até
lá, cada uma de `CreateWorkflow` e `SaveWorkflow` embutia a facade em sua própria descrição
e `EvalWorkflowSnippet` embutia o subconjunto de snippet: cerca de 19 000 tokens de
declarações de ferramentas reenviados a cada requisição do modelo de cada sessão, tenha a
sessão escrito um workflow ou não, e cerca de 4 300 a mais a cada requisição
de subagent. As quatro descrições e seus schemas agora somam menos de 2 000 tokens. Sob o
modo cinza `onDemand`, a primeira linha fica totalmente ausente até o primeiro `/workflow`
da sessão (launch.md "On demand: activation"): o comando, a skill e o gate não mudam, apenas
o momento em que as ferramentas aparecem muda.

### O gate da skill

Mover as regras para dentro da skill só é seguro se o modelo as tiver lido antes de
escrever. Cada ferramenta de autoria portanto recusa, em seu hook `resolveInput`, até que a
sessão tenha uma chamada `Skill` concluída para `dynamic-workflows` no histórico que o
modelo pode ver. A recusa é uma falha de negócio com código próprio (428,
`workflow-skill-gate.ts`): chega ao modelo como erro de ferramenta nomeando a skill, a
ferramenta `Skill` e a ferramenta a chamar de novo, e acontece antes dos hooks e antes do
fluxo de permissão, de modo que o usuário nunca vê uma janela de confirmação para uma
chamada que seria recusada. O custo de uma recusa é uma ida e volta extra numa sessão que
puleu a skill.

Duas chamadas são isentas porque não são autoria: `CreateWorkflow` apenas com a fonte
`saved` (executar um workflow que o usuário já guardou) e `AmendWorkflow` sem `path` nem
`script` (mudar as configurações de uma execução mantendo seu script). `SaveWorkflow` e
`EvalWorkflowSnippet` são sempre gated.

"Carregada" é lido do histórico de mensagens visível ao provider do runtime
(`core/src/agent/loaded-skills.ts`): uma chamada `Skill` de assistant cujo input nomeia a
skill (`{ skill }` ou o legado `{ name }`) com um resultado de ferramenta que não é erro.
Não é uma flag de sessão. Depois da compactação o resumo substitui esse histórico, o texto
da skill some do contexto do modelo, e o gate fecha de novo até a skill ser recarregada, que
é a mesma regra que `Edit` segue para `Read` (o estado de leitura de arquivo é limpo no
mesmo ponto). Resume e rewind reconstroem o histórico e, com ele, a resposta. O probe chega
às ferramentas através de `ToolInputResolutionContext.hasLoadedSkill`, que o runtime
fornece somente quando a sessão tem uma porta de skill: uma sessão sem ferramenta `Skill`
não consegue satisfazer o gate, portanto não tem gate.

## A facade

A facade é uma string `.d.ts`, `FACADE_DTS` em `dynamic-workflow/src/facade/dts.ts`,
construída pela concatenação de segmentos nomeados. A facade de snippet é um subconjunto
construído a partir dos mesmos segmentos. Ambas são injetadas no compilador sob um único nome
de arquivo, `workflow-facade.d.ts`; cinco módulos decidem "isto é uma chamada de facade"
pelo nome do arquivo, então uma declaração que mora em qualquer outro lugar é uma
declaração comum de script.

| Segmento | Declara | Na facade completa | Na facade de snippet |
|---|---|---|---|
| actor | `Node<T>`, `AgentPersona`, `Agent`, `agent()` | sim | não |
| args | `args` | sim | sim (sempre `{}`) |
| log | `log()` | sim | sim |
| report | `report()` | sim | não |
| artifact | `ArtifactRef`, os tipos de opção e spec, `artifact.*` | sim | não |
| phase | `phase()` | sim | não |
| world | `GrepMatch`, `GitStatus`, `GitCommit`, `files.*`, `git.*` | sim | sim |
| world-run | `WorldRunResult`, `world.run` | sim | sim |
| stream | `Channel<T>`, `channel()`, `future()` | sim | sim |
| hole | `hole()` | sim | não |

Os comentários de doc são a metade de referência do contrato e nada mais: o que um membro
faz, o que retorna, quando rejeita ou faz a execução falhar, seus limites, e as regras de
tempo de compilação sobre seus argumentos. Julgamento — quando recorrer a um membro, como
nomear coisas para o usuário, qual idioma escrever — é a prosa da skill, declarada uma
vez. A facade chega ao modelo apenas pela §16.2 da skill, logo depois dessa prosa, então um
comentário que a repete é pago duas vezes em toda sessão de autoria e é a cópia que
diverge. Um teste limita `FACADE_DTS` a 14 000 bytes para manter isso.

### Opções do compilador

O compilador roda `strict` contra apenas a biblioteca ES2022: sem DOM, sem Node.
`process`, `fetch` e `fs` falham no typecheck. O corpo do script é compilado dentro de uma
função, então pode usar `await` no topo e terminar em `return <value>`, e não pode usar
`declare`, `import` ou `export`. Os tipos de resultado são declarações `interface` ou `type`
comuns no script.

`noUncheckedIndexedAccess` está desligado. Os modelos escrevem TypeScript como se estivesse
desligado, porque os corpora de treinamento quase universalmente o têm desligado, e com ele
ligado os diagnósticos de "possibly 'undefined'" em `items[i]` foram a maior causa isolada de
falhas de compilação, quase todas em índices cujos limites a lógica circundante já provou
(acesso a grade, `xs[xs.length - 1]` depois de uma verificação de comprimento,
`for (i < xs.length)`). Então indexar um array ou record produz `T`, e um índice realmente
fora do intervalo falha em tempo de execução como qualquer outro erro de script.
`strictNullChecks` permanece ligado: `.find()`, `.match()`, `Map.get()` e propriedades
opcionais ainda produzem `T | undefined` ou `null`, e a própria mensagem do compilador nomeia
a variável, então esses continuam sendo erros de compilação.

### Subagents: `agent()` e `.ask()`

```ts
declare interface Node<T> extends PromiseLike<T> {}
declare class ModelRef { private constructor(); private readonly modelRef: never }
declare function model(id: string): ModelRef;
declare interface AgentPersona { system?: string; model?: ModelRef | string }
declare interface Agent { ask<T = string>(instructions: string): Node<T> }
declare function agent(name?: string, persona?: string | AgentPersona): Agent;
```

Um **actor** (a palavra da prosa é subagent) é uma conversa persistente que executa asks um
de cada vez. O contexto acumula entre asks; asks concorrentes em um subagent entram em fila
na ordem first-in-first-out. Toda chamada `agent()` cria um contexto novo, então compartilhar
contexto significa compartilhar a variável.

O **nome** é opcional. Um nome não vazio é uma identidade, não um rótulo: precisa ser único
dentro da execução, e dois subagents com o mesmo nome fazem a execução inteira falhar. Ele
também é a chave com que uma reexecução corrigida casa seu cache, então nomes estáveis
carregam trabalho concluído entre revisões do script; subagents anônimos nunca reutilizam
trabalho importado. Dentro de um fan-out ou loop cada iteração é um subagent separado, então
um nome fixo ali é o caso duplicado. O compilador reporta um nome literal dentro do corpo de
um fan-out (diagnóstico 9006) e dois nomes literais que colidem (9005); uma duplicata
calculada falha em tempo de execução.

A **persona** é o system prompt do subagent, dado como string ou `{ system }`, e
opcionalmente o modelo em que roda, `{ model }` (veja "Escolhendo um modelo por subagent"
abaixo). Ela é congelada na criação. Não há perfil de ferramenta por subagent: todo subagent
tem as ferramentas de trabalho regulares (ler, buscar, editar, rodar comandos). Um subagent
cuja persona não nomeia modelo roda no modelo de subagent da execução quando o lançamento
escolheu um, e caso contrário no modelo atual da sessão. O que um subagent pode fazer com
suas ferramentas está dito no ask ("não edite nenhum arquivo", "julgue o texto como
dado"). Um subagent trabalha no modo de permissão da sessão que lançou a execução, e seus
pedidos de permissão e perguntas de `AskUserQuestion` chegam ao usuário na janela principal
(`docs/dynamic-workflow/launch.md`, "Permissions inside a run"). O driver subtrai apenas as
ferramentas que iriam além: `EnterPlanMode`, `ExitPlanMode`, `CreateWorkflow`,
`ReadSessionContext` e `ResolveWorkflowQuestion`. Duas ferramentas de controle são
adicionadas: `submit_result`, que devolve um resultado tipado, e `escalate`, que estaciona o
subagent numa pergunta para a sessão principal. Ambas estão descritas no documento do
engine.

`Node<T>` é um thenable. Paralelismo e joins são JavaScript comum: não use await ainda, e
`Promise.all([...])` é reconhecido como um join.

<!--CURSOR-->
