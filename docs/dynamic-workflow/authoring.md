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

### Escolhendo um modelo por subagent

Uma persona pode nomear o modelo em que seu subagent roda. O valor é um nome de modelo na
mesma sintaxe do campo `subagent_model` das ferramentas de lançamento (um id de modelo
simples, `providerId/modelId`, ambos com um `$reasoningLevel` opcional), escrito em uma de
duas formas:

```ts
// Uma escolha fixa: o nome, inline.
const judge = agent("评审员", { system: "…", model: "GLM-5.3-Flash" });

// Roteamento: declare os candidatos uma vez com model(), escolha um durante a execução.
const MODELS = {
  light: model("GLM-5.3-Flash"),
  strong: model("GLM-5.3$high"),
};
interface Route { tier: "light" | "strong" }
const route = await agent("分诊", { model: MODELS.light }).ask<Route>(`…${request}`);
const answer = await agent("答复者", { model: MODELS[route.tier] }).ask(request);
```

**Todo modelo que um script pode usar é conhecido antes de ele rodar.** A regra está no tipo
da propriedade `model`, e o compilador a verifica em cada ponto de `agent()` (diagnóstico
9010): precisa ser um `ModelRef`, um tipo de literal string, ou uma união de tipos literais
string. Então um literal inline, um `const` ligado a um literal, um ternário entre dois
literais, e qualquer coisa tipada `ModelRef` são aceitos; um `let`, um parâmetro, um template
com buracos, e um objeto de persona montado em uma variável (cujo `model` alarga para
`string`) são recusados, com uma mensagem dizendo para escrever o nome inline, adicionar
`as const` ou usar `model()`. `model()` por si só aceita apenas um literal string não vazio
(também 9010). `ModelRef` não pode ser produzido por nada além disso: é uma classe com
construtor privado e um membro privado, então nem `new` nem um literal de objeto produz um.

Os nomes que um script pode usar são portanto um conjunto fechado: os argumentos de suas
chamadas `model()` mais os membros de cada tipo literal em um ponto de `agent()`. Esse
conjunto é resolvido contra o catálogo de modelos do host quando a execução é lançada, antes
da janela de confirmação, exatamente como `subagent_model` é
(`docs/dynamic-workflow/launch.md`, "Models the script names"). Um nome que o catálogo não
resolve, ou que ele encontra sob vários providers sem o da sessão entre eles, é o
diagnóstico 9011 na linha que o nomeia, listando os ids que existem; nenhuma janela abre e
nada roda. 9011 é o único diagnóstico que precisa do host: o compilador sozinho não pode
saber quais modelos estão configurados, então `SaveWorkflow` não o verifica, e o mesmo
script pode lançar em uma máquina e falhar com 9011 em outra.

O router responde com uma chave tipada, e o código mapeia a chave para um `ModelRef`: o
juiz só pode escolher entre modelos que o script declarou, e nunca escreve um nome de
modelo. Um campo de união de literais na resposta (`model: "GLM-5.3" | "GLM-5.3-Flash"`)
também passa no 9010, e é seguro pela mesma razão (`submit_result` valida a resposta contra
o enum sintetizado a partir desse tipo), mas a skill ensina a tabela chave-para-`ModelRef`.

Em tempo de execução um `ModelRef` é sua string de nome: o lowering apaga
`model("x")` para `"x"`, e o engine registra o nome na persona. O host o mapeia pela tabela
que o lançamento resolveu. Um nome ausente dessa tabela, que só um cast pode produzir, faz
falhar o primeiro ask desse subagent com `DriverError`.

O modelo próprio de um subagent sobrepõe tudo; o `subagent_model` da execução vira o padrão
para os subagents que não nomeam nenhum (`execution-engine.md`, "Subagent sessions"). O
modelo não faz parte da identidade de cache de um subagent: um amend que muda só o modelo em
que um subagent nomeado roda mantém o trabalho concluído, e seu próximo ask vivo roda no
novo modelo, a mesma regra que o `subagent_model` de `AmendWorkflow` segue.

### Resultados tipados

`ask<T>` recebe uma interface que o script declara. O harness sintetiza um JSON schema a
partir do tipo, o subagent submete um valor conforme por `submit_result`, e o valor
validado é o que o script recebe. Sem argumento de tipo o ask devolve o texto final do
subagent. Um comentário JSDoc em uma propriedade se torna a descrição daquele campo no
schema, que é o texto que o subagent lê ao preenchê-lo; a skill chama isso de alavanca de
qualidade mais barata da superfície. O tipo precisa ser expressável como um JSON schema
(diagnóstico 9002). Como o schema chega ao subagent, e a declaração de ferramenta tipada que
um subagent mono-tipado recebe, estão no documento do engine.

### Lendo o mundo: `files.*` e `git.*`

Estas são observações journalizadas, somente leitura, executadas pelo harness. Uma execução
retomada reproduz o valor registrado em vez de reler o mundo. Caminhos de entrada e saída
são relativos ao workspace; o workspace é o mundo, então um workspace que é um subdiretório
de seu repositório não vê mudanças fora dele (`git.log` exceto, porque commits são objetos
de escopo de repositório). Todo limite recusa a chamada em vez de devolver uma visão parcial,
e a recusa é capturável, então um script que quiser um fallback mais grosso escreve um.

| Chamada | Retorna | Limite |
|---|---|---|
| `files.glob(pattern)` | caminhos relativos ao workspace, ordenados lexicograficamente | 2000 arquivos |
| `files.read(path)` | texto UTF-8 | limitado por tamanho |
| `files.grep(pattern, glob?)` | `{path, line, text}` por linha que casa, sintaxe de ripgrep | 2000 casamentos ou 256KB, o que vier primeiro |
| `git.changedFiles(base?)` | caminhos alterados; sem base, modificados contra HEAD mais não rastreados | |
| `git.diff(base?, path?)` | diff unificado contra a base (padrão HEAD) | 512KB |
| `git.status()` | `{branch?, clean, staged, unstaged, untracked}` | |
| `git.log(count?)` | `{hash, subject, author, date}` mais recente primeiro, padrão 20 | 100 commits |

`git.*` é somente leitura por construção: o harness monta uma lista de argumentos fixa para
um subcomando de allowlist e nunca uma string de shell. Uma base precisa nomear uma única
ref. Fora de um repositório git, ou sem binário `git`, toda chamada recusa, então o idioma é
`try`/`catch` com um fallback `files.glob`. Não há escrita: escrever no mundo é trabalho de
um subagent.

### Executando comandos: `world.run`

```ts
declare interface WorldRunResult { exitCode: number; stdout: string; stderr: string }
declare const world: {
  run(cmd: string, args?: string[], opts?: { timeoutMs?: number }): Promise<WorldRunResult>;
};
```

`world.run` é a primitiva de efeito journalizada: o harness executa o comando exatamente
uma vez por ponto de chamada e iteração, registra o resultado, e o reproduz na retomada.
Retomar é recuperação de crash, não reverificação; uma execução que precisa reconferir um
mundo alterado é uma nova execução.

O contrato difere de propósito do de `git.*`:

- **Uma saída diferente de zero é um valor.** Um processo que rodou até o fim resolve para
  seu `{exitCode, stdout, stderr}` qualquer que seja o código. Uma verificação que falha é o
  caso normal do laço de gate e não viaja por fluxo de controle de exceção.
- **A promise rejeita apenas quando o comando não pôde rodar como observação**: falha de
  spawn, ou timeout. O timeout padrão é de 300 segundos; `timeoutMs` o sobrescreve por
  chamada sem limite superior, porque suítes de teste reais levam mais tempo. Cancelar a
  execução continua sendo o controle de último recurso.
- **O nome do comando é um literal string em tempo de compilação** (diagnóstico 9003). Essa
  é toda a autorização: todo comando que um script pode rodar é legível do texto dele antes
  de o usuário aprovar, e o grafo de confirmação mostra cada chamada como um passo
  `run <cmd>`. O driver roda o comando que o script compilado lhe entregar; não há uma
  segunda lista em tempo de execução. Havia uma antes, montada a partir do script seed no
  lançamento, e um fill cujo corpo rodava um comando novo era recusado por ela, porque um
  fill compila o script efetivo mas o driver mantinha o conjunto do seed. Uma lista que
  precisa ser mantida em sincronia com o analisador à mão é uma segunda fonte de verdade
  para um fato que o analisador já resolveu.
- **argv fixo, nunca um shell.** Sem pipes, sem redirecionamento, sem expansão de variáveis,
  sem opção `cwd` ou `env`: o diretório de trabalho é o workspace e o ambiente é herdado.
  Componha com várias chamadas e código comum. Valores de execução vão para o array de
  argumentos, onde um valor derivado do resultado de um ask desenha uma aresta de dados no
  grafo. Um helper que precise de builtins do Node é embutido como
  `world.run("node", ["-e", code])`; a string de código vive dentro do script e dentro da
  chave do journal.
- **A saída é limitada a 256KB por stream.** Acima do limite a chamada rejeita com
  `WorldReadCapExceeded` e uma mensagem nomeando o próximo passo (silenciar a saída, ou
  escrever um arquivo e fazer `files.read` de um resumo). Nada é truncado.

A forma dos argumentos é verificada pelo driver e uma forma errada é um `DriverError`:
`cmd` precisa ser string, `args` um array de strings, `timeoutMs` um inteiro positivo. O
journal registra o nó com kind `world-run`, distinto de `world-read`, para que uma auditoria
distinga efeitos de leituras. Nos grafos ele é um passo na faixa do workspace como qualquer
leitura do mundo (veja `docs/analysis.md`, "Sites").

A orientação que o modelo recebe com a assinatura: o modelo gera, o código faz o gate. Uma
verificação fixa e verificável por máquina (build, verificador de prova, suíte de testes)
pertence ao `world.run` com o script ramificando sobre `exitCode`, não a um ask cuja alegação
de sucesso o subagent pode falsificar. Edição em aberto pertence a um subagent.

### Progresso: `log` e `report`

`log(message)` emite uma linha de progresso para a pessoa assistindo a execução. Não tem
ponto nem linha de journal.

`report(item, artifactId?)` publica um resultado intermediário enquanto a execução ainda
corre. Não devolve nada e não há nada para aguardar, mas ao contrário de `log` é
journalizado: uma execução retomada nunca mostra o mesmo item duas vezes, e os itens são
entregues com a notificação de conclusão mesmo quando a execução termina em falha. Esse é
seu propósito: uma execução que morre na sua décima segunda de quarenta tarefas só mantém
o trabalho de onze tarefas se o script reportou cada uma ao chegar. O item precisa ser
serializável em JSON. Dois limites derrubam a execução inteira em vez da chamada, porque um
retorno void não tem canal de rejeição: 65.536 itens por execução, 1 MiB por item
serializado, e 1 GiB de itens por execução. Um resultado maior que um item deve ser publicado
com `artifact.file` no lugar. O segundo argumento opcional marca o item para um artefato de
dashboard (veja "Artifacts").

### Streams: `channel` e `future`

```ts
declare interface Channel<T> extends AsyncIterable<T> {
  send(item: T): void;
  close(): void;
}
declare function channel<T>(name?: string): Channel<T>;
declare function future<T>(body: () => Promise<T>): Promise<T>;
```

Um **channel** é uma fila first-in-first-out ilimitada de itens tipados que um estágio de
um script preenche e outro drena. Uma **future** inicia agora um bloco assíncrono e devolve
sua promise para ser unida mais tarde; é a forma nomeada de uma função assíncrona invocada
imediatamente. Juntos dizem o que um callback por item aninhado não pode dizer: um estágio
servido por um pool limitado de consumidores, um produtor que continua descobrindo itens
enquanto consumidores já trabalham, estágios escritos como blocos top-down separados, e um
laço de feedback de um estágio posterior para um anterior.

Semântica, fixada de propósito:

- **`send` é síncrono e não devolve nada.** O buffer é ilimitado: asks são o único recurso
  escasso e o limite de concorrência da execução já os governa, então um buffer limitado
  adicionaria um segundo mecanismo de agendamento e uma segunda forma de deadlock sem
  ganho. Um send em um channel fechado lança `ChannelClosed`, capturável como qualquer erro
  de script.
- **`close` é explícito e idempotente.** Marca o fim do stream: todo receptor que ainda
  espera, e todo receptor posterior, vê o fim uma vez que os itens em buffer foram drenados.
  O fim de um channel depende apenas de seus produtores chamarem `close`, nunca do estado do
  resto da execução.
- **Receber é `for await`.** Cada item vai para exatamente um receptor, na ordem de envio;
  receptores esperando em um channel vazio são atendidos na ordem em que começaram a
  esperar. Não há broadcast, nem peek, nem `select` sobre vários channels nesta versão.
- **Ambos vivem dentro do sandbox.** Assim como `Promise.all`, são maquinaria comum de
  promise: nenhuma chamada ao host, nenhuma linha de journal, nenhum site id, nenhum evento
  de engine. Uma execução reproduzida reproduz toda entrega, porque o engine reproduz a
  ordem em que as promises do host assentaram (documento do engine, "Replaying the settle
  order") e tudo que um channel faz é uma consequência determinística dessa ordem.
- **`future(body)` inicia `body` na hora**, roda-o até o primeiro `await`, e devolve sua
  promise. Um corpo que lança sincronamente produz uma promise rejeitada. Não adia nada,
  então a ordem de emissão continua sendo a ordem do código-fonte, que é o que o analisador
  assume.

**Uma execução travada falha em vez de ficar pendurada.** O sandbox não tem timers nem I/O
próprio; a única coisa que pode acordar um script suspenso é uma resposta do host. Então
sempre que uma resposta foi entregue e suas continuações rodaram, e nenhuma requisição está
em voo enquanto o script não completou, nada pode rodar de novo. A célula então falha a
execução: `ChannelDeadlock` quando há receptores esperando em channels, nomeando cada
channel e quantos estão esperando, de modo que a mensagem diz qual produtor esqueceu de
fechar; `ScriptStalled` caso contrário, para uma promise que nunca pode resolver. Nenhum dos
dois é timeout: a verificação dispara no momento em que a execução comprovadamente não tem
mais nada a fazer.

Os idiomas que a skill ensina:

- **Um estágio é uma future.** O marcador de fase vem primeiro em seu corpo, os workers são
  um `Promise.all` sobre K laços de `for await` na entrada, e a saída fecha em um `finally`,
  de modo que um worker que falha ainda encerra o stream para o estágio a jusante. Todo
  estágio é iniciado, e então todos são unidos uma vez com `Promise.all`, sem nenhum `await`
  entre os dois: enquanto o script aguarda um estágio, uma falha em outro não tem ouvinte e
  aparece como rejeição não tratada em vez de falhar a execução com o erro dela.
- **Um channel onde o próximo estágio deve começar antes do anterior terminar; um join onde
  ele não pode.** Pesquisadores em verificadores é um channel. Fatos verificados indo para
  um único escritor é um array compartilhado e o join, porque o escritor precisa de todos os
  itens.
- **Um ciclo é contado.** Um channel de feedback não tem um produtor único que saiba quando
  acabou, então o script mantém uma contagem de itens de trabalho abertos, incrementa antes de
  terminar o item que produziu o novo, e fecha o channel de feedback quando a contagem chega
  a zero; um campo de profundidade em cada item limita o laço. O contador é o fragmento
  copiável da skill, não um tipo da facade: um `WaitGroup` moveria o `if` mas não o
  posicionamento dos incrementos e decrementos, que é a parte que pode dar errado.
- **Pools trocam localidade de cache por consistência.** Um pool de K contextos
  compartilhados distribui itens por tempo, então um amend que muda um item a montante
  desloca a atribuição e erra o cache do pool inteiro; um subagent novo, nomeado pelo item,
  erra apenas o item alterado. Ambas são legítimas; a skill diz quando usar cada uma.

Visão do analisador (`docs/analysis.md`): `channel()` e `future()` não geram ponto algum.
Um `send` é uma escrita em container e um `for await` sobre um channel lê o container, então
todo produtor de um item desenha uma aresta de dados para todo consumidor, que é o desenho
que o pipeline deve mostrar. O `for await` é uma barreira possível sobre os passos dos
produtores. O corpo de uma `future` é embutido na chamada como um strand iniciado, exatamente
como um callback `async` inline. A regra de posicionamento na facade vale como para qualquer
callable da facade: `channel`, `future`, `send` e `close` só podem ser chamados diretamente,
enquanto um valor de channel pode ser armazenado, passado a helpers ou re-tipado livremente,
porque não carrega ponto algum.

### Holes: `hole<T>()`

```ts
declare function hole<T>(name: string, prompt?: string): Promise<T>;
declare function hole<T>(name: string, body: () => Promise<T>): Promise<T>;
declare function hole<T>(name: string, prompt: string, body: () => Promise<T>): Promise<T>;
```

Um **hole** é uma lacuna tipada no script: um lugar onde o autor ainda não sabe o que o
programa deve fazer, porque depende do que um passo anterior encontra.
`await hole<Plan>("决定分组", `…${survey.slowest}…`)` estaciona aquele ramo do script quando o
controle chega até ele e entrega ao agente principal um pedido para escrever o código que
falta. O agente principal preenche com um corpo (`FillWorkflowHole`,
`docs/dynamic-workflow/launch.md`), o corpo roda no lugar do hole, e seu valor de retorno é o
valor do hole. Todo o resto da execução continua: uma future irmã, um fan-out já em voo, um
subagent no meio de um turno. Holes são como um workflow é rascunhado pedaço a pedaço: o
autor escreve o que sabe, deixa holes tipados pelo que o resto do script precisa, e as
decisões são tomadas com as descobertas da própria execução em mãos.

**Um hole é uma fase, e seu nome é sua identidade.** O nome obedece às regras de nome de
fase: um literal string não vazio de no máximo 128 caracteres, escrito para o usuário na
linguagem do usuário, já que ele rotula a estação, a notificação, o painel da execução e o
arquivo de fill. Precisa ser **único** entre os holes e os marcadores de fase do script,
incluindo fills aninhados (9012): dois marcadores com um nome são uma fase por projeto, mas
dois holes com um nome seriam duas lacunas com dois tipos e dois contextos, e uni-los estaria
errado. O site id é a chave de máquina que a ferramenta recebe, e é derivado do nome:
`hole#` e oito dígitos hex, o mesmo em qualquer profundidade de aninhamento
(`docs/analysis.md`, "Sites"). O nome é o que toda superfície mostra, e os dois são uma
bijeção. Quando o corpo é preenchido, a fase do hole reivindica os pontos do corpo até o
primeiro marcador `phase()` do corpo, e os marcadores do corpo são fases próprias que ficam
depois dele. Então um corpo sem marcadores é uma estação nomeada pelo hole, contendo os asks
do fill; um corpo que abre com um marcador deixa a fase do próprio hole sem membros, e a
fase continua na lista de fases da execução sob o nome do hole enquanto a linha do tempo
deixa a cabeça do fill representá-la.

O argumento de tipo é o contrato. `T` é o que o resto do script precisa do hole. Precisa ser
escrito explicitamente (diagnóstico 9012), e o corpo precisa devolver um `Promise<T>`, o que
o compilador verifica pela tipagem contextual comum da arrow function. Nada é validado em
tempo de execução: um fill é código compilado contra o script inteiro, não um valor chegando
por fio.

O **prompt** é a mensagem do autor ao agente principal, um template string avaliado no
ponto, então carrega os valores de que a decisão precisa: `survey.slowest`, uma contagem, uma
lista. É o único canal: o agente lê valores do prompt e do journal, e tipos do código. Tem
limite como o contexto de uma escalação, e é um sumidouro de taint, então o grafo de
confirmação desenha o que flui para dentro do hole.

Um hole preenchido é a mesma chamada com o corpo como último argumento:

```ts
const plan = await hole<Plan>("决定分组", `只跑一遍 ${survey.slowest} …`, async () => {
  phase("冒烟测试");
  const smoke = await agent("烟测员").ask<Smoke>(`只跑一遍 ${survey.slowest} 里的用例`);
  phase("分组");
  return await agent("分组员").ask<Plan>(`按模块分组，先排 ${smoke.failed.length} 个已失败用例`);
});
```

O corpo é um corpo de função assíncrona comum **no escopo léxico do hole**: ele lê todo
binding declarado antes do hole, pode atribuir `let`s externos, pode retornar cedo, pode
declarar fases, subagents e asks próprios, e pode deixar holes próprios. Ele roda cada vez
que o hole é alcançado: um hole dentro de um loop ou helper é preenchido uma vez e seu
corpo roda por iteração com os bindings daquela iteração, ao contrário de `escalate`, que é
respondido por chamada. Um hole dentro de um callback de fan-out (`xs.map(async x => …)`) é
um erro de compilação (9012): seu fill teria de ser escrito enquanto os elementos já estão
rodando; um corpo `for...of` é sequencial e pode conter um. O script que um fill produz, o
**script efetivo**, é TypeScript comum. É o que uma retomada reproduz, o que um amend
revisa e o que `SaveWorkflow` guarda, então um workflow salvo não tem hole algum que seu
autor não tenha deixado de propósito.

A forma de cauda `return await hole<Result>("评判", …)` deixa o fim do script aberto: o
resultado da execução é o que o fill devolve. É também como um workflow **cresce** quando
sua forma não pode ser planejada a partir do pedido: o script faz o que pode planejar e
termina em um hole de cauda; cada fill dá um passo e termina em um novo hole de cauda do
mesmo tipo, nomeado pelo próximo passo (os nomes são únicos no script efetivo, então
`第N步：…`); o último fill devolve. O script efetivo depois de k passos é k holes
preenchidos aninhados, e a linha do tempo mostra uma cabeça por passo. A skill ensina holes
como a postura padrão, não um fallback: um script é o que o autor tem certeza, e qualquer
fase cujos subagents, asks ou gates teriam de ser adivinhados é um hole (§1 e §2 dizem isso
onde a forma do script é decidida, §15 dá os idiomas). A regra que separa um hole de um ask
de subagent: um subagent devolve um valor que o script já sabe consumir, um hole devolve o
código que o script ainda não tem. Um fill que lança em tempo de execução rejeita a promise
do hole no ponto com esse erro; o script pode capturá-lo, e caso contrário a execução
termina com erro como qualquer erro de script, com o script efetivo no draft da execução para
`AmendWorkflow`.

As regras de compilação são 9012, em "Regras de tempo de compilação". A análise está em
`docs/analysis.md`, "Sites"; o lado do engine está no documento do engine, "Holes"; a linha
do tempo está em `docs/dynamic-workflow/presentation.md`, "Holes on the timeline".

### Fases

`phase("name")` é um marcador de apresentação. Não inicia nada e não devolve nada; agrupa
os passos seguintes na fase nomeada que o grafo de confirmação desenha como um nó. O nome
precisa ser um literal string não vazio e a chamada precisa ficar sozinha como statement
(diagnóstico 9004); o marcador reivindica o resto do bloco em que está, blocos aninhados e
chamadas de helper embutidas incluídos, e dois marcadores com o mesmo nome são uma fase. O
lowering reescreve para uma chamada ao host para que o engine possa anunciar a fase ao entrar
nela. As regras de análise estão em `docs/analysis.md`, "Phases".

O carimbo em tempo de execução é **léxico onde o script o fixa**. O passo de compilação
deriva, da mesma interpretação de que o grafo de confirmação é desenhado, a fase a que cada
ponto pertence; todo ponto que o analisador coloca em exatamente uma fase nomeada é
carimbado com essa fase quando é gerado, qualquer que seja o marcador que o engine tenha
passado por último. Só um ponto que o analisador não consegue colocar, um helper chamado de
duas fases, ou uma chamada antes do primeiro marcador, recorre à fase vigente no momento da
chamada. A regra existe para estágios concorrentes: duas futures que abrem cada uma com seu
próprio marcador rodam ao mesmo tempo, e um produtor que emite um segundo ask depois do seu
primeiro `await` de outro modo seria carimbado com o marcador do estágio que rodou por
último. Também mantém o painel da execução consistente com o grafo que o usuário aprovou,
que colocou aquele passo naquela fase. O lado do engine está no documento do engine,
"Identity: sites, ordinals, phases".

Fases são obrigatórias em todo script submetido, de cima a baixo, e cada fase deve conter ao
menos um ask ou um `world.run`. Lógica de script comum entre dois asks (ler `args`, moldar
um prompt, construir o retorno) roda num instante e não é um estágio; ela se dobra na fase
anterior ou posterior. Nem a configuração no topo nem o `return` na base recebem fase.

### Argumentos da execução: `args`

`args` é um saco somente leitura dos valores fornecidos quando a execução começou. Um
workflow salvo declara seus argumentos; o host valida os valores do chamador contra a
declaração e preenche defaults antes de a execução começar. Para um script inline e dentro
de um snippet é `{}`. Os valores são tipados `unknown` para que a superfície do compilador
nunca mude de um workflow para o outro; o script os estreita. Declarações e validação
estão em `docs/dynamic-workflow/launch.md`.

### O que a facade não tem

Não há `budget`: o harness não impõe orçamento de tokens nem limite de nós, e um script não
consegue ler nenhum dos dois. O uso de tokens é contabilizado por execução apenas como
superfície de observação (veja "Uso, não orçamento"). Não há perfil de ferramenta nem tier de
modelo na persona (veja "Alternativas não adotadas"); uma persona nomeia um modelo concreto
ou nenhum. Não há prompt de permissão interativo dentro de uma execução: a janela de
confirmação é o único lugar onde o usuário aprova o que o script pode fazer.

## Regras de tempo de compilação

O analisador acrescenta seus próprios diagnósticos aos do TypeScript. Cada um nomeia algo
que o script precisa corrigir antes do envio, porque não pode ser recuperado depois. A
tabela completa e o raciocínio estão em `docs/analysis.md`, "Diagnostics"; o resumo voltado
à autoria:

| Código | Regra |
|---|---|
| 9001 | Callables da facade aparecem apenas como alvo de uma chamada direta, e um valor carregando um membro que produz ponto nunca é convertido para um tipo que não o tenha. |
| 9002 | Um tipo `ask<T>` é expressável como um JSON schema. |
| 9003 | O comando de `world.run` é um literal string. |
| 9004 | O nome de `phase()` é um literal não vazio e a chamada é o seu próprio statement. |
| 9005 | Dois pontos de `agent()` não compartilham um nome literal. |
| 9006 | Um `agent("x")` dentro do corpo de um fan-out tem um nome fixo para todos os elementos. |
| 9007 | Um id de artefato é um literal não vazio de no máximo 64 caracteres de `[A-Za-z0-9_.-]`; um id pertence a um único tipo de artefato; uma tag de `report` é um literal que nomeia um preset que o script declara. |
| 9008 | Um artefato preset é declarado no nível de topo, não dentro de um loop, callback ou ramo condicional. O corpo de um hole preenchido não é um callback: ele roda onde o hole está, então um fill pode declarar um preset a menos que o próprio hole esteja em um loop, callback ou ramo. |
| 9009 | No máximo um id de artefato carrega um `primary: true` literal. |
| 9010 | O `model` de uma persona é um `ModelRef`, um literal string, ou uma união de literais string, e `model()` recebe um literal string não vazio. |
| 9011 | Todo nome de modelo que o script usa resolve no catálogo de modelos deste host (verificado no lançamento, não pelo compilador; veia "Escolhendo um modelo por subagent"). |
| 9012 | Um `hole<T>()` nomeia explicitamente seu argumento de tipo; seu nome é um literal não vazio de no máximo 128 caracteres, único entre os holes e marcadores de fase do script; a chamada é aguardada; fica fora de todo callback de fan-out (um corpo `for...of` serve: ele é sequencial); seu corpo, quando presente, é um literal de função inline que não referencia nenhum binding declarado depois do hole. |

9007, 9008 e 9009 vêm de `dynamic-workflow/src/analysis/artifacts.ts`. 9008 é separado
porque sua certeza difere: redeclarar um spec idêntico dentro de um loop seria um no-op
inofensivo em tempo de execução, então esta regra pode sinalizar um script que teria rodado.
O conserto é gratuito (mover a declaração para o topo), e a alternativa é uma declaração de
dashboard enterrada três callbacks adentro. Uma função helper nomeada que declara um preset e
é chamada uma vez não é sinalizada; arrow functions e expressões de função são tratadas como
callbacks, exceto o corpo de um hole preenchido. Esse corpo é emendado onde o hole está e roda
uma vez por alcance, como os statements ao redor, então a regra olha através dele direto para o
que cerca o hole; caso contrário nenhum fill poderia declarar um dashboard para o estágio que
escreve. 9009 tem o mesmo caráter: dois ids sinalizados em ramos mutuamente exclusivos
rodariam, mas o painel da execução e o cartão de conclusão lideram com exatamente um
entregável, e um script que não consegue dizer qual não está pronto. Só um `true` literal
conta; uma flag calculada fica para a verificação de tempo de execução.

A análise coleta o conjunto de comandos de `world.run` (`collectWorldRunCommands`,
deduplicado e ordenado) e `declaredArtifacts` (`[{id, kind}]`, deduplicado, ordenado por
id). Ambos são fixados no momento do envio porque seus valores são literais; é isso que
permite à janela de confirmação mostrar os comandos antes de qualquer coisa rodar, e o que
permite à ferramenta de snippet perguntar apenas quando um snippet roda um comando.
Nenhum dos dois conjuntos é levado para a execução: o driver não reconfere nada.

## O comando `/workflow` e a skill

Ambos são embutidos no CLI. Nenhum dos dois mora mais em um plugin: até 2026-09-21 eles
eram distribuídos pelo plugin oficial `zcode-guide`, e um usuário que desinstalasse ou
desabilitasse aquele plugin perdia o comando, a entrada no menu mais do composer e a skill
enquanto as dez ferramentas de workflow seguiam registradas (os relatórios "no workflow" de
2026-09-19). As ferramentas e seu material de ensino agora têm o mesmo tempo de vida.

| Ativo | Onde mora | Como é distribuído |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `/workflow` | `bootstrap/src/builtin-workflow-command.ts`, expandido por `builtin-prompt-command.ts` ao lado de `/init` | compilado no CLI |
| skill `dynamic-workflows` | `apps/zcode-cli/packages/bundled-skills/skills/dynamic-workflows/` | o **pacote de skills embutido**, abaixo |

O pacote de skills embutido (`bootstrap/src/app/bundled-skills.ts`) é uma raiz de skills com
`source: "bundled"` e `scope: "system"`, injetada ao lado das raízes de skills de plugin onde
quer que o CLI descubra skills (a porta de skills do runtime, `zcode skills list`, o catálogo
de skills do protocolo). Não é um plugin: está ausente da loja de plugins, não tem
chave liga/desliga, não pode ser desinstalado, e não é listado na página de skills das
Settings nem no seletor `$` de skills do composer (o `skills/referenceCatalog` do protocolo
filtra skills `bundled` para fora em vez de alargar seu enum `scope` fechado, que clientes
mais antigos validam estritamente). O modelo ainda a vê na listagem de skills da sessão e a
carrega com a ferramenta `Skill` exatamente como antes. Ela fica atrás de toda raiz de
usuário, projeto e plugin, então uma skill com o mesmo nome de qualquer uma dessas vence.

Como o pacote chega a cada runtime:

- Desenvolvimento e a desktop Electron resolvem `packages/bundled-skills` em disco ao lado da
  entrada do CLI, pela mesma caminhada de diretórios candidatos que plugins oficiais usam,
  e leem no lugar; nada é copiado.
  `packages/desktop/scripts/prepare-agent-node-bundle.mjs` o prepara ao lado de
  `resources/glm/zcode.cjs`; `scripts/prepare-prebuilds.mjs` o prepara para hosts remotos.
- Binários SEA embutem `skills/**` sob o prefixo de asset `zcode-bundled-skills/`
  (`cli/scripts/sea-bundled-skill-assets.mjs`) com um manifesto cujo hash cobre cada arquivo.
  Na inicialização o CLI extrai o pacote uma vez em
  `~/.zcode/cli/bundled-skills/<hash>/`; o nome do diretório é a identidade de conteúdo,
  então reinicializações são idempotentes e inicializações concorrentes têm exatamente uma
  vencedora. Um hash divergente recusa o pacote e recorre à extração completa mais recente.

Todo arquivo sob `skills/dynamic-workflows/` é um asset obrigatório: um stage, um build SEA
ou uma extração que perca um recusa o pacote inteiro e registra `Bundled skill pack
unavailable` (ou `seed degraded`) em vez de distribuir uma skill com um arquivo de
referência faltando.

### O comando

`/workflow <instruções>` é um comando de prompt, não uma skill: uma skill não pode receber
argumentos (o handler `Skill` os descarta), e um comando pode declarar
`skills: dynamic-workflows`, o que faz o harness carregar a skill antes do corpo rodar. O
comando é definido em código como um literal `CustomCommandContent` e expandido pelo mesmo
helper de contracts que os comandos de usuário usam, então o prompt que o modelo recebe é o
que o comando da era de plugin produzia: o preâmbulo `Required skills`, depois o corpo com
`$ARGUMENTS` interpolado. O corpo diz ao modelo para decidir primeiro a topologia de
subagents (quantos subagents, quais compartilham contexto, que resultado cada um devolve),
depois escrever o script e chamar `CreateWorkflow`. Ele nomeia `CreateWorkflow` explicitamente
e diz para não substituir pela ferramenta legada `Workflow` nem pela ferramenta `Agent`,
porque o recurso mais antigo de script-workflow ainda existe sob a mesma palavra.

`workflow` é um nome reservado de slash-command (tem uma entrada em
`packages/shared/src/zcode-slash-command-help.ts`, que é também de onde vêm a descrição e a
dica de input do catálogo). Um comando de usuário ou de plugin com o mesmo nome não é
anunciado e nunca é expandido, então nada pode sombrear o embutido ou contornar o gate
cinza por meio de um comando customizado com cara de igual.

Um workflow começa apenas com a palavra do usuário. As duas portas são este comando e um
pedido explícito em prosa ("use um workflow para…", "用工作流 …", qualquer formulação que
nomeie workflow como meio). O modelo nunca inicia um por iniciativa própria: a descrição de
`CreateWorkflow` diz que um pedido explícito torna a ferramenta obrigatória e que sem um
pedido o modelo delega com `Agent` ou faz o trabalho ele mesmo, qualquer que seja a forma
da tarefa; a descrição de `Agent` repete a primeira metade e nada mais no prompt convida ao
uso proativo. A dica de roteamento anterior, de que a orquestração multi-subagent
"pertence a CreateWorkflow" sem pedido, foi removida em 2026-09-16 pelo mesmo motivo, e a
tabela de roteamento da skill agora roteia apenas por pedido (abaixo). Isso mantém o
comportamento do modelo idêntico, tenha o gate cinza ligado ou desligado: a única coisa que
o gate muda é se a porta existe. Sob o modo `onDemand` a porta em prosa não existe até a
sessão ter sido ativada: `CreateWorkflow` não está registrada, então um pedido em prosa é
tratado como é sob `disabled`, com `Agent` ou pelo próprio modelo, e `/workflow` é a única
porta até lá. Depois da ativação as duas portas ficam abertas pelo resto da sessão (launch.md
"On demand: activation").

O comando aparece no menu `/` no app desktop e na TUI. No painel `/` do desktop ele fica
logo depois de `/goal` como uma das duas entradas "começar um trabalho" (a ordem de
`APP_PROTOCOL_VISIBLE_BUILTIN_SLASH_COMMAND_NAMES`), e o menu mais do composer oferece um item
Workflow abaixo de Goal que se expande para `/workflow` no início de um rascunho vazio. A
TUI o interpreta como um comando conhecido e submete o texto bruto, como `/init`. Em modo
headless, `-p "/workflow …"` é um comando conhecido que não é `/expert` nem `/goal`, então
segue pelo caminho de prompt simples e as linhas de espera de settle e progresso do workflow
se anexam como fazem para um prompt digitado. Na TUI e em execuções headless o comando só
existe quando o processo foi iniciado com `--workflow-mode onDemand` ou `alwaysOn`; sem a
flag o modo é `disabled`, a TUI esconde o comando e responde a ele com um aviso local, e o
headless sai com erro (launch.md "The standalone CLI: `--workflow-mode`"). Todos os três
front-ends o expandem em um lugar, o resolvedor de prompt embutido da facade de input, e
essa expansão é também onde uma sessão `onDemand` é ativada: o resolvedor pede ao runtime
para registrar as dez ferramentas antes de o turno ser executado, então o próprio turno que
trouxe o comando já vê `CreateWorkflow`.

### A skill

O `description` do frontmatter da skill traz seu gatilho para o começo, "writing, debugging,
or resubmitting a dynamic-workflow script for the CreateWorkflow tool", dentro dos primeiros
250 caracteres que a listagem da sessão mostra, e fica abaixo do teto de 1024 caracteres do
loader. A linha `when_to_use` diz que uma única delegação ou algumas consultas
independentes pertencem à ferramenta `Agent`: o gatilho é deliberadamente mais estreito que
"trabalho multiagente". A skill não é mostrada na página de skills das Settings nem no
seletor `$` do composer (veja acima), então não carrega entrada de localização de UI.

`SKILL.md` contém as regras de decisão, a tabela de antipadrões, o ciclo de vida pós-envio
e, como §16 "Tool reference", o contrato que as descrições das ferramentas não carregam mais:
as três fontes de `CreateWorkflow` e seus campos, as declarações da facade embutidas
literalmente entre `<!-- facade-dts:start -->` e `<!-- facade-dts:end -->`, as regras que o
compilador e o analisador impõem, e os campos e regras de `AmendWorkflow`, `SaveWorkflow` e
`EvalWorkflowSnippet`. Dois arquivos de referência são lidos sob demanda através de
`${ZCODE_SKILL_DIR}`: `patterns.md`, um catálogo de dezesseis formas de topologia como
fragmentos, cujo índice manda o leitor primeiro para as formas de pipeline (encadeamento
por item, streaming por channels, um laço de feedback com fechamento contado) e depois lista
o resto (fan-out sobre um glob, varredura de revisão de arquivos alterados, laço planner e
reviewer, painel de juízes, laço até aprovado, handoff por estágios, descoberta limitada,
salvamento por report, laço de verificador com gate, roteamento de modelos, e as três
formas de hole); e `examples.md`, sete scripts completos (um laço adversarial de
implementar-e-verificar, triagem de testes flaky com juiz e confirmador encadeados por
achado, uma migração de call-sites, um laço de prova com gate pelo verificador real, a
revisão de arquivos alterados que faz streaming: um revisor por arquivo, triagem por um
subagent compartilhado alimentado conforme as revisões chegam, um confirmador por achado
mantido, tudo dentro de um callback e uma fase, com a deduplicação entre arquivos como
único join; um pipeline de descoberta de fatos com um verificador novo por fato; e um guia
de repositório crescido por holes de cauda). O script de revisão morou em `SKILL.md` §11 até
2026-09-21 e saiu para fora para manter o arquivo abaixo do teto de 100 000 bytes da
ferramenta `Skill` quando a §16 chegou; a §11 agora aponta para ele. A skill repete a facade
exatamente uma vez, na §16.2, e em nenhum outro lugar.

A ferramenta `Skill` carrega esta skill com um teto de 200 000 bytes (`WORKFLOW_SKILL_MAX_BYTES`
em `core/src/tool/handlers/skill.ts`); toda outra skill mantém 100 000 (`MAX_SKILL_BYTES`).
O teto foi elevado em 2026-09-30, depois que o `SKILL.md` ficou no antigo por uma semana e
cada novo recurso teve de ser pago cortando orientação existente. O teto maior é chaveado no
nome pedido, `dynamic-workflows`, a mesma identidade que o gate da skill verifica, então uma
skill de usuário ou de projeto com esse nome, que sombreia a embutida, também o obtém. O
custo é contexto: a cerca de 4,15 bytes por token, uma skill cheia de 200 000 bytes tem
cerca de 48 000 tokens, mantidos pelo resto de toda sessão que escreve um workflow e
carregados de novo após cada compactação. O teto é um teto, não um alvo.

O que a skill ensina, seção por seção:

| Seção | A regra |
|---|---|
| A régua | Um workflow existe para produzir o entregável que um profissional sênior entregaria. Quando um atalho e o jeito do especialista divergem, pegue o jeito do especialista. A profundidade é medida pelo que está em jogo: corte o trabalho quando a tarefa é pequena, corte a checagem quando uma afirmação errada custa pouco ou um comando já decidiu. |
| Esta é a ferramenta certa | O roteamento é por pedido, não pela forma da tarefa. Quando o usuário nomeia workflow como meio, `CreateWorkflow` é obrigatório e o tamanho decide apenas quantos subagents; sem esse pedido a tarefa vai para `Agent` (uma delegação, ou consultas independentes em paralelo) ou é feita inline, por mais passos que tenha. Só depois que um workflow foi pedido a forma importa: resultados alimentando resultados, um laço com condição de parada, fluxo de controle sobre um resultado tipado é o que o script faz bem. |
| Topologia de subagents | Um subagent novo por item dá vereditos independentes e paralelos; um subagent compartilhado dá vereditos consistentes e serializa. Nomes são identidades únicas e a chave de cache do amend. Personas se apoiam no contrato do harness, então escreva o papel, não as regras. Em cada handoff, um item passa para o próximo estágio assim que fica pronto; o estágio espera por todos os seus itens só onde o próximo passo precisa de cada um. Reutilize os mesmos dois subagents entre rodadas do laço. Sem aninhamento. |
| Escolhendo modelos | Só quando o usuário pede modelos, ou quando o trabalho tem um tier leve óbvio (juízes de um turno, classificadores, routers) e o usuário pediu custo ou velocidade. Uma escolha fixa é o nome inline; roteamento declara uma tabela `model()` no topo e mapeia uma chave tipada do router para ela. Os nomes vêm de `ListModels`; cada um é verificado no lançamento. |
| Olhos frescos | Um contexto separado vê as lacunas que o autor preencheu. Peça falhas, não aprovação. Dê aos revisores a mesma evidência. Um entregável, um mecanismo: um plano ganha um revisor que lê o código, achados ganham um confirmador, prosa ganha um leitor; dois é o teto e exige um motivo. A leitura independente é para prosa que nada mais checou; um relatório cujos achados foram cada um confirmados já teve seus olhos. Não é um gate para submeter o script. |
| Resultados tipados | Tipa o ask quando o fluxo de controle ramifica sobre ele. JSDoc vira a descrição do campo. Mantenha os resultados estreitos; passe caminhos, não conteúdos de arquivo. |
| Trazendo o mundo | `files.glob` e `git.changedFiles` são fontes de fan-out. Limites recusam. `world.run` é o gate determinístico. Escolha o gate pelas checagens do próprio repositório, construa-o em dois tiers, e deixe o tier mais forte que o pedido implica decidir a saída, rodando ao menos uma vez antes do retorno final com o timeout de que precisa. |
| Teste as peças | A lógica fixa é verificada em `EvalWorkflowSnippet` antes do envio; o que passou cola literalmente. Rode a checagem decisiva uma vez lá para aprender sua forma de saída e sua duração. |
| Pipeline por padrão; join só onde o próximo passo precisa de todos os itens | Uma execução com mais de um estágio é um pipeline: todos osistage تعمل ao mesmo tempo, e cada item passa assim que está pronto. Estágios que mapeiam um a um são encadeados por item dentro de um fan-out, com um join no fim. Um pool de workers compartilhados, um produtor ainda encontrando itens, um laço de feedback, ou estágios escritos como blocos separados usam um `channel` entre os estágios e uma `future` por estágio. Um join é escrito só onde o próximo passo precisa de todos os itens (deduplicação, um ranking em uma escala, uma síntese) e carrega um comentário dizendo isso. O paralelismo vem de não aguardar ainda. Um subagent calibrado compartilhado é uma fila FIFO, não uma barreira, então é alimentado conforme os itens chegam. Uma rejeição dentro de `Promise.all` afunda o join; capture por item ou use `Promise.allSettled`. Os resultados fluem por variáveis comuns, interpolação e destructuring para que o analisador possa rastreá-los. |
| Fases nomeadas | Obrigatórias; um marcador na cabeça de cada estágio; toda fase contém um ask ou um run; nomes para o usuário. Nunca dentro de um callback de fan-out concorrente: o engine mantém uma fase vigente e carimba cada instância no nascimento, então callbacks que reentram em dois marcadores fora de ordem carimbariam os passos um do outro e contariam cada reentrada como uma rodada. Um pipeline por item é uma fase, nomeada pelo que ele faz com cada item. |
| Escreva para o usuário | Sete coisas são lidas pelo usuário: nomes de fase, nomes de hole, nomes de subagent, linhas de `log`, títulos e markdown de artefatos, os quatro campos de report, perguntas escaladas. Escreva cada uma nas palavras e na língua do usuário, nunca nas da máquina. Os idiomas de método na skill são para o autor, não palavras para traduzir literalmente. Achados são escritos por subagents, então os asks também carregam a língua do usuário. |
| Verifique na proporção do que uma afirmação errada custa | Confirme como fato os achados sobre os quais o usuário vai agir, e mantenha um achado que falha a confirmação rotulado `unconfirmed`. Três coisas parecem verificação e são desperdício: um confirmador sobre o que `world.run` já decidiu; um confirmador sobre saída criativa ou subjetiva, que leva no máximo uma leitura; a mesma suíte rodada pelo caçador, pelo confirmador e pelo gate, quando o gate a roda uma vez e os asks dizem isso. `verified` nomeia os comandos que decidiram o resultado; `notCovered` é para o que não pôde ser checado, nunca para uma checagem que existe e foi pulada. Reporte cada achado conforme chega. Devolva a forma do relatório. Publique o entregável. |
| Antipadrões | Uma linha por erro com o custo que ele produz, entre eles mecanismos de verificação empilhados, um confirmador sobre uma checagem já decidida, um estágio que espera o estágio inteiro anterior embora trate itens um a um, um join sem motivo declarado, e um run errado deixado terminar ou um run parado sem amend. |
| Depois que você envia | Diagnósticos significam que nada rodou, e eles nomeiam o arquivo em que o script foi salvo: edite esse arquivo e reenvie com `path`, nunca colando o script de novo. Não faça polling. Os três estados terminais e o que cada um pede do modelo. Corrija qualquer execução com `AmendWorkflow` editando o arquivo de script da execução (a notificação e `GetWorkflowRun` o nomeiam) e passando `path`; mantenha constantes ajustáveis fora do texto dos asks. Repare uma execução enquanto ela ainda corre com a mesma chamada: o amend a para e inicia a revisão, e quanto mais cedo acontece, menos se paga duas vezes. |
| Quando um subagent escala, ou um hole é alcançado | Responda uma pergunta que tem resposta com `ResolveWorkflowQuestion`; cancele e faça amend quando o script é o que está quebrado. Um hole é respondido em código: leia o draft no caminho que a notificação nomeia, escreva apenas os statements do corpo, ensaie a lógica fixa em `EvalWorkflowSnippet`, chame `FillWorkflowHole`, e em diagnósticos edite o arquivo de fill que ele nomeia e reenvie por `path` ("Holes"; `docs/dynamic-workflow/launch.md`). |

A tabela "Escreva para o usuário" emparelha um exemplo em inglês e um em chinês em cada
linha para que a regra se leia como um princípio e não como uma lista de proibições:

| Lido pelo usuário | Escreva | Não |
|---|---|---|
| Nome de fase | Check that the tests still pass / 确认测试仍然通过 | Gate: test verification / 执行测试验证任务 |
| Nome de subagent | Code reviewer / 代码评审员 | reviewer_2 / 节点3 |
| Nome de hole | Decide the split / 决定分组 | hole1 / 待定 |
| Nome de subagent | Independent reviewer / 独立评审员 | cold-reviewer / 冷眼评审 |
| Linha de `log` | Reviewing 12 changed files / 正在检查 12 个改动的文件 | Fan-out sized: n=12 / 扇出阶段初始化完成 |
| Título de artefato | Review report / 评审报告 | report-artifact-v1 / 产物输出 |

A forma do relatório que a skill entrega ao modelo para copiar, que compila como está:

```ts
interface Finding {
  where: string;                          // "src/a.ts:42"
  what: string;                           // one sentence
  evidence: string;                       // the lines read, or the command and its output
  status: "verified" | "unconfirmed";
  severity: "low" | "medium" | "high";
}
interface WorkflowReport {
  conclusion: string;                     // two or three sentences answering the request
  findings: Finding[];
  verified: string[];                     // what the run checked and how
  notCovered: string[];                   // what it did not look at, and why
}
```

A forma mora na skill, não na facade. A descrição de `CreateWorkflow` carrega uma regra
("devolva uma forma de relatório em vez de um array cru; a skill carrega a interface"), e a
notificação de conclusão diz ao agente principal para apresentar o resultado nessa ordem
(veja "O que o agente principal é avisado quando uma execução termina").

Três regras de amend-retomada que a skill carrega porque o runtime não consegue impô-las.
Primeira, interpolar um resultado a montante em um ask é seguro (reproduz byte a byte
idêntico), mas interpolar uma constante do script como um threshold retira o cache de todo
ask que a menciona no instante em que a constante é ajustada; botões de controle moram no
fluxo de controle, prompts carregam valores reproduzidos e o fato do ramo tomado. Segunda,
uma escalação é o momento mais barato de fazer amend de um workflow: o ask que escalou nunca
assentou, então está exatamente além do limite de cache. Terceira, um script visto como
errado é parado e corrigido de imediato, não deixado terminar: tudo o que o antecessor
terminou é reutilizado, qualquer que fosse a ordem em que os asks foram emitidos, até a
primeira escrita da revisão no workspace; uma parada antecipada só salva o que o antecessor
ainda não tinha começado.

### Mantendo a skill honesta

Um teste em `bootstrap/tests/dynamic-workflow-skill.test.ts` fixa o conteúdo:

- O comando embutido declara `skills: [dynamic-workflows]`, uma dica de argumento e um
  placeholder `$ARGUMENTS` explícito; ele expande pelo resolvedor embutido, e não quando
  `dynamicWorkflowEnabled` é `false`.
- A §16.2 embute `FACADE_DTS` literalmente, uma vez, entre seus marcadores, e o `SKILL.md`
  fica abaixo do teto de 200 000 bytes da ferramenta `Skill` para esta skill
  (`WORKFLOW_SKILL_MAX_BYTES`), que trunca a partir da cauda, onde a §16 fica.
- Fora desse bloco marcado, nenhum arquivo de conteúdo contém `declare `, `import` ou
  `export`.
- As frases que moravam nas descrições das ferramentas são fixadas na skill: as três
  fontes, os dois campos de run, as regras do compilador e do analisador, a mecânica das
  fases, a regra de nomenclatura, a regra de erro de provider, o `script_unchanged` de
  `AmendWorkflow` e o retune no lugar, a regra nunca-não-solicited de `SaveWorkflow`, os
  membros ausentes de `EvalWorkflowSnippet`.
- Todo membro `artifact.*`, `files.*`, `git.*` e `world.*` que a skill menciona existe em
  `FACADE_DTS`; nenhum `tools:`, `ToolProfile`, `"readonly"` ou tier de modelo (`"lite"`)
  aparece.
- O vocabulário da outra API de Workflow (`pipeline(`, `parallel(`, `budget`, `agentType`,
  `isolation:`, `effort:`, `schema:`) está ausente, e `phase(` aparece apenas na forma de
  marcador `phase("literal")`.
- Todo bloco de script marcado `<!-- compile -->` compila por `compileWorkflowScript` e
  analisa limpo por `analyzeWorkflowScript`, e existem pelo menos seis blocos assim. Blocos
  não marcados são fragmentos por contrato; `patterns.md` é inteiramente não marcado e diz
  isso.
- As frases que sustentam peso são fixadas positivamente: os parágrafos de adequação do
  gate, a regra verificar-antes-de-reportar e o rótulo `unconfirmed`, a seção de entrega de
  artefatos, o título "Escreva para o usuário" com suas linhas pareadas, e o roteamento que
  nomeia `CreateWorkflow` e nunca diz "a ferramenta de workflow".
- A lista de caminhos obrigatórios do pacote embutido e os arquivos de skill concordam nas
  duas direções, e o caminho desabilitado do gate cinza cai no `SKILL.md` real sob a raiz
  embutida resolvida enquanto uma raiz de skill de plugin ao lado fica intocada.

`bootstrap/tests/bundled-skills.test.ts` cobre o resolvedor do pacote em si: o pacote real
é encontrado no lugar, um pacote em stage faltando um arquivo é recusado com um aviso, um
pacote SEA é extraído uma vez por hash de conteúdo e reutilizado, e um asset SEA corrompido
recorre à extração completa anterior.

As descrições sempre ligadas carregam apenas o que um modelo precisa saber antes de decidir
chamar: o roteamento de `CreateWorkflow` (obrigatório em um pedido explícito, nunca fora
dele), suas três fontes e o laço editar-depois-`path`, o ponteiro para `AmendWorkflow`; o
roteamento de `AmendWorkflow` (consertar, estender, reparar uma execução em curso em uma
chamada só, mudar configurações sem script, retomar é outra ferramenta); a regra
nunca-não-solicited de `SaveWorkflow`; e, nas quatro, "carregue primeiro a skill
`dynamic-workflows`; a chamada é recusada até que ela tenha sido carregada". Um modelo que
nunca carrega a skill não consegue submeter um script, então as descrições não repetem mais
as regras de autoria. `core/tests/workflow-routing-hints.test.ts` fixa os sinais de
roteamento e um orçamento de tamanho por descrição; `core/tests/workflow-skill-gate.test.ts`
e `core/tests/loaded-skills.test.ts` fixam o gate e seu probe de histórico.

<!--CURSOR-->
