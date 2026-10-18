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

## O que um subagent é avisado

### O system prompt

Um subagent de workflow não recebe a identidade do agente interativo. O construtor de
contexto pega um terceiro caminho quando a config do runtime traz `workflowActor`
(mutuamente exclusivo com um system prompt customizado; ambos presentes é um erro de
wiring). O prefixo do CLI ("You are ZCode, an interactive coding agent") é pulado, e a
seção de identidade é substituída por uma seção **Workflow Actor Identity**, que é a
primeira linha do system prompt:

1. Uma frase de abertura: "You are a subagent inside a dynamic workflow run, named
   "<name>". A script created you and hands you work one ask at a time; the script, not a
   person, consumes what you return. There is no user in this conversation to talk to."
   A cláusula do nome aparece apenas quando o subagent tem nome.
2. A persona do autor, se houver. Ela fica depois da frase de abertura para que o papel
   seja proeminente, e depois dela para que a abertura não possa ser sobreposta.
3. O aviso de segurança e o bloco `# Harness`, reutilizados literalmente da identidade
   interativa.
4. O contrato de workflow, `# Working inside a workflow`:
   - Você tem as ferramentas de trabalho regulares (ler, buscar, editar, rodar comandos)
     mais `submit_result` e `escalate`. Não há ferramenta que pergunte algo a uma pessoa.
   - Cada ask diz o que fazer. Quando o ask carrega um schema de resultado, termine
     chamando `submit_result` com um valor conforme; caso contrário sua mensagem final é o
     resultado.
   - Fundamente toda afirmação em algo que você leu ou rodou nesta sessão, ou no material que
     o ask lhe deu, e diga qual. Cite código como `path:line`. Uma verificação só conta como
     aprovada se você a executou aqui; se não pôde rodá-la, reporte-a como não rodada. Rode
     a verificação que o ask nomeia em vez de um substituto mais rápido, e diga exatamente
     qual comando você rodou.
   - Reporte resultados com fidelidade. Se parte da tarefa for impossível, fora de escopo,
     ou contradita pelo que você encontrou, diga isso no resultado em vez de preencher um
     campo com um palpite plausível. Nunca finja um resultado aprovado para satisfazer uma
     instrução.
   - Quando algo fora do seu alcance bloquear você (um gate que não pode passar,
     instruções que se contradizem, um fato que só o dono da execução sabe), chame
     `escalate`. Perguntas escritas em prosa não chegam a ninguém.
   - Não escreva arquivos de report ou sumário por iniciativa própria; os achados vão no
     resultado. Quando o ask nomeia um caminho de saída, escreva exatamente ali e devolva
     esse caminho no resultado; o script o publica para o usuário.

O contexto desktop, a seção de comportamento dinâmico e a orientação de sessão são pulados
(eles tratam de uma conversa com um usuário; a única regra que vale manter, "report outcomes
faithfully", foi movida para o contrato). Memória, skills, instruções do usuário e
instruções do projeto seguem como em qualquer sessão. O runtime do child remove qualquer
system prompt herdado da sessão pai, então um pai com prompt customizado não pode vazá-lo.

O cache de amend-retomada casa subagents pela persona de nível de script, não pelo system
prompt composto, então mudanças no texto do contrato nunca invalidam trabalho importado. O
`model` da persona fica fora dessa comparação (veja "Escolhendo um modelo por subagent").

### Cada ask

A mensagem que um subagent recebe para um ask é as instruções do script, depois um epílogo de
qualidade, e então, para um ask tipado, um epílogo de schema. O hash de input do journal
cobre apenas as instruções, então a redação do epílogo pode mudar sem invalidar o cache de
uma execução retomada, e a GUI dobra o epílogo num disclosure colapsado usando o índice de
limite que o driver repassa (`docs/dynamic-workflow/transcript-and-notifications.md`).

O epílogo de qualidade, depois de uma regra e do título "Standard for this result":

- Todo achado cita o que você leu ou rodou: caminho e linha para código; o comando exato e
  sua saída para uma verificação; a parte do ask para material que o próprio ask lhe deu.
- Uma verificação só conta como aprovada se você a rodou durante este ask. Caso contrário
  reporte-a como não rodada.
- Rode a verificação que o ask nomeia, na escala que ele nomeia. Um substituto mais estreito
  ou mais rápido (um arquivo de teste no lugar da suíte, um build no lugar dos testes) é
  reportado como o que é, nunca como a verificação do ask; diga o comando exato que você
  rodou.
- Qualquer coisa que você não pôde fazer, verificar ou encontrar é dito como tal, nunca
  preenchido com um palpite plausível.
- Quando as propriedades de topo do schema incluem `evidence`: ponha a citação de cada
  achado em seu campo `evidence`. Quando incluem `confidence`: califique com honestidade;
  um valor baixo com um motivo vale mais que um palpite confiante.
- Se algo fora do seu alcance bloquear você, chame `escalate` em vez de inventar um valor.

O epílogo de schema para um subagent de perfil genérico renderiza o JSON schema e diz para
chamar `submit_result` com um valor conforme; para um subagent mono-tipado, cujo schema já
está na declaração da ferramenta, uma frase diz para chamar a ferramenta quando terminar. O
empurrãozinho enviado quando um turno termina sem submissão não carrega epílogo. Perfis,
empurrões e rodadas de reparo estão no documento do engine.

## O que o agente principal é avisado quando uma execução termina

A notificação de conclusão é XML (`<task-notification>` com status, result, error, seções
`<reports>` e `<artifacts>`) seguido de prosa que diz ao agente principal como apresentar o
desfecho. A prosa é acrescentada apenas para execuções de workflow dinâmico; a notificação
da ferramenta legada `Workflow` não muda. Ela vem por último para que o truncamento por
comprimento total da notificação remova orientação antes dos artefatos e artefatos antes dos
reports.

Para uma execução concluída: apresente o desfecho como um entregável, nesta ordem: a
conclusão; cada achado com sua evidência (caminho e linha, ou o comando e a saída que
mostraram isso); quais achados foram confirmados por uma verificação determinística ou por
um subagent independente e quais são apenas julgados; o que a execução não cobriu. Itens
reportados são achados individuais e mantêm sua evidência. Quando o preview é parcial, diga
isso e leia o resto com `GetWorkflowRun`. Não reformule o grafo de fases nem o script.

Para uma execução que não completou, a orientação depende de como ela terminou: apresente
primeiro o que ela salvou (os itens reportados), depois a falha e o que ela significa para o
pedido, depois o próximo passo. Uma execução que o usuário parou é uma decisão, não um
acidente: não a retome nem a reconstrua a não ser que peçam. Uma execução que o modelo parou
para corrigir o script é corrigida agora com `AmendWorkflow`; caso contrário ela só é
retomada se o usuário quiser. Uma execução parada por um processo encerrado ou por um erro do
lado do provider nomeia `ResumeWorkflowRun` ou a causa a resolver primeiro; um script que
deu erro nomeia o arquivo de script da execução e aponta para `AmendWorkflow` com `path`
depois de editá-lo (`docs/dynamic-workflow/launch.md`, "Script files"). Uma execução que o
modelo corrigiu não recebe notificação própria. Os estados terminais em si estão no
documento do engine.

Quando a execução publicou artefatos, mais uma frase: os artefatos listados acima já estão
diante do usuário como cartões; refira-se a eles pelo título e não cole seus conteúdos. A
ferramenta `GetWorkflowRun` diz o mesmo de sua seção `artifacts`.

## Artefatos: o que o usuário guarda

A palavra tem dois significados neste codebase. No engine, `artifact` é o valor de saída
tipado de um ponto ou o retorno de topo do script, a coisa que o modelo lê
(`RunSettlement.artifact`, `serializeWorkflowArtifact`). Na facade e em toda superfície de
usuário, um **artefato** (「产物」 na UI em chinês) é o que o script publica para o usuário
abrir: um arquivo, um documento markdown, ou um dashboard alimentado por itens `report`
marcados. Esta seção é sobre o segundo. Identificadores do engine mantêm o primeiro
significado; novos comentários ao lado de ambos dizem qual eles significam.

Só o script publica. Subagents não têm ferramenta de artefato; um arquivo que um subagent
escreve não existe para o usuário até o script publicá-lo. A fronteira de confiança não
muda: o usuário aprova um script, e o script decide o que é entregue.

### Duas famílias

```ts
declare interface ArtifactRef { id: string; version: number }
declare interface ArtifactOptions { title?: string; description?: string; primary?: boolean }
declare interface ArtifactFileOptions extends ArtifactOptions { contentType?: string }
declare const artifact: {
  file(id: string, path: string, opts?: ArtifactFileOptions): Promise<ArtifactRef>;
  markdown(id: string, content: string, opts?: ArtifactOptions): Promise<ArtifactRef>;
  chart(id: string, spec: ChartSpec): void;
  table(id: string, spec: TableSpec): void;
  metrics(id: string, spec: MetricsSpec): void;
  board(id: string, spec: BoardSpec): void;
};
```

| Família | Membros | Natureza | Canal de falha |
|---|---|---|---|
| conteúdo | `file`, `markdown` | um efeito: assíncrono, passa pelo driver, copia bytes para o store, resolve para um `ArtifactRef` | rejeita de forma capturável; o nó é registrado como falho |
| preset | `chart`, `table`, `metrics`, `board` | uma declaração: síncrona, não devolve nada, nunca toca um arquivo; diz como itens marcados com seu id são desenhados | derruba a execução inteira; um retorno void não tem canal de rejeição |

A assimetria é o projeto. Uma publicação de conteúdo pode falhar por razões sobre as quais o
script pode agir (o arquivo está faltando, o subagent o escreveu em outro lugar), então
`try { await artifact.file("book", "out/book.pdf") } catch { …peça a um subagent que o
escreva… }` é o idioma pretendido. Um preset é declarado uma vez no topo e alimentado por
`report(item, "<id>")`.

Todo membro é um ponto (`artifact#N`), registrado em `dynamic-workflow/src/facade/registry.ts`
numa tabela separada do registro de world-read, porque as duas famílias rebaixam para
chamadas de host diferentes (`publishArtifact` e `declareArtifact`) e nenhuma é uma leitura.
Os pontos não desenham arestas de grafo: um entregável não é um passo pelo qual alguém
espere. Seus argumentos não são sumidouros de taint.

### Ids, tags e versões

Um id é um literal string de tempo de compilação, não vazio, de no máximo 64 caracteres de
`[A-Za-z0-9_.-]`, porque ele é carregado literalmente pela coluna do journal, pelo call id
do store, pelas consultas do protocolo e pela chave de aba do painel lateral. Dentro de uma
execução um id pertence a exatamente um tipo de membro; usá-lo com outro é um diagnóstico de
compilação quando ambos os usos estão visíveis e um `ArtifactKindMismatch` em tempo de
execução caso contrário. Publicar de novo um id de conteúdo gera a próxima versão, contada a
partir de 1, e mantém as antigas; um preset tem uma versão.

Uma tag de `report` é um literal de tempo de compilação que nomeia um preset declarado em
algum lugar do script. A declaração pode aparecer mais tarde no texto, mas precisa ter
executado até o momento em que o report marcado roda, ou a execução falha com
`ArtifactUndeclared`. Uma tag que nomeia um artefato de conteúdo é um diagnóstico: um
arquivo contém conteúdo, não um fluxo de itens. Um report marcado ainda conta contra os
limites de report e ainda vai para os resultados da execução; a tag adiciona o dashboard,
não substitui nada.

**O primário.** `primary: true` marca o entregável da execução, o artefato que o usuário
deve abrir primeiro. No máximo um id por execução o carrega. A flag é uma propriedade do id,
não de uma versão: uma vez que um id é primário, toda versão posterior dele também é, tenha ou
não a publicação repetido a opção, então um report publicado como rascunho e de novo como
final não perde seu lugar. Marcar um segundo id diferente é `ArtifactPrimaryConflict`: uma
rejeição capturável registrada como nó falho para `file` e `markdown`, uma falha de execução
para um preset, os mesmos canais de `ArtifactKindMismatch`. Quando ambos os literais estão
visíveis o compilador diz isso primeiro (9009). Duas publicações que passam na admissão antes
de qualquer uma assentar são reconferidas no assentamento, e a perdedora pega o caminho de
falha, então o journal nunca contém dois primários concluídos. Uma publicação primária que
falha não promove nada em seu lugar. Presets podem ser primários: um board de benchmark pode
ser o que o usuário pediu. Redeclarar um preset com a flag adicionada ou removida muda seu
spec canônico e é `ArtifactRedeclared`.

Limites, em `dynamic-workflow/src/facade/artifact-caps.ts`:

| Limite | Valor |
|---|---|
| ids por execução | 32 |
| versões por id | 16 |
| bytes de `artifact.file` | 20 MiB |
| bytes de `artifact.markdown` | 256 KB |
| título | 120 caracteres |
| descrição | 500 caracteres |
| spec de preset, JSON canônico | 8 KB |

### Publicando conteúdo

`artifact.file(id, path, opts)` recebe um caminho relativo ao workspace resolvido pelo mesmo
resolvedor que `files.read` usa, e depois verificado de novo após resolver links simbólicos,
para que um link para fora do workspace não possa transformar um arquivo privado num cartão.
Os bytes são lidos com uma sondagem de limite mais um e copiados para o store de
tool-artifacts do CLI no momento da publicação, sob a sessão pai da execução, com retenção
de projeto (para que o hub possa mostrá-los entre sessões) e um call id de
`<runId>:<siteId>@<ordinal>`. Edições ou eliminações posteriores no workspace não mudam
nenhuma versão. O caminho do workspace é mantido no registro apenas como proveniência.

O tipo de conteúdo vem da extensão (`pdf html htm md markdown txt csv json png jpg
jpeg gif webp svg xlsx pptx docx`), ou de `opts.contentType`, que precisa ser um tipo MIME
sem parâmetros porque o viewer despacha pela string exata. Qualquer outra coisa é
`application/octet-stream`, que a UI mostra como um cartão de metadados em vez de renderizar.
Não há sniffing de conteúdo. `artifact.markdown` é sempre `text/markdown`.

`opts.title` e `opts.description` são verificados quanto a tipo e comprimento e rejeitados
acima do limite em vez de truncados: um título cortado no meio de uma frase parece um cartão
normal sem nada dizendo que foi cortado. `opts.primary` precisa ser booleano; o engine o lê
antes do despacho (o driver repassa chaves de opção desconhecidas sem tocar) e carimba a flag
no registro que guarda, então o `primary` do registro é o veredito do engine, não o argumento
do chamador.

O que pode rejeitar uma publicação de conteúdo, tudo capturável e tudo registrado como nó
falho:

| Código | Levantado por | Quando |
|---|---|---|
| `ArtifactSourceMissing` | driver | o caminho não existe ou não é um arquivo regular |
| `ArtifactPathOutsideWorkspace` | driver | o caminho resolvido sai do workspace |
| `ArtifactTooLarge` | driver | acima do limite de arquivo, markdown, título ou descrição |
| `ArtifactStoreUnavailable` | driver ou engine | o host não tem store de artefatos, escrita binária, ou escopo de sessão |
| `ArtifactVersionCapExceeded` | engine | o id já tem 16 versões |
| `ArtifactKindMismatch` | engine | o id foi publicado sob outro tipo |
| `ArtifactCapExceeded` | engine | um 33º id |
| `ArtifactPrimaryConflict` | engine | `primary: true` em um id enquanto outro id já é primário |
| `DriverError` | qualquer um | um argumento malformado (incluindo um `primary` não booleano), ou a própria escrita no store falhou |

Um store ausente é uma falha nomeada que o script vê, nunca um fallback silencioso para
escrever no workspace ou publicar um artefato vazio.

### Declarando um dashboard

```ts
declare interface ArtifactField { field: string; label?: string; unit?: string }
declare interface ChartSpec extends ArtifactOptions {
  type?: "line" | "bar" | "scatter";   // default "line"
  x: ArtifactField;
  y: ArtifactField | ArtifactField[];   // several = several series
  scale?: "linear" | "log";
  baseline?: ArtifactField;             // a horizontal rule from the first item that has it
}
declare interface TableSpec extends ArtifactOptions { columns: ArtifactField[]; key?: string }
declare interface MetricsSpec extends ArtifactOptions { metrics: ArtifactField[] }
declare interface BoardSpec extends ArtifactOptions {
  key: string; status: string; columns: string[]; cardTitle?: string; detail?: ArtifactField[];
}
```

Um field é um caminho com pontos para dentro de um item reportado (`"timing.after"`). Um
chart desenha um ponto por item marcado. Uma table desenha uma linha por item, ou substitui
a linha com a mesma `key` quando uma é definida. Uma linha de metrics mostra, por tile, o
item mais recente que tem o field. Um board coloca cada item como um cartão na coluna que seu
`status` nomeia, movendo o cartão quando um item posterior tem a mesma `key`; um status que
não está em `columns` cai numa coluna final "other". `cardTitle` nomeia o field usado como
título do cartão, distinto do `title` do próprio board.

O engine valida a forma do spec antes de escrever qualquer coisa (um spec malformado
quebraria todo leitor que depois o carregasse do journal) e falha a execução com
`ArtifactSpecInvalid`, cuja mensagem diz o que está errado. Declarar um id de novo com um
spec idêntico é um no-op; com um spec diferente é `ArtifactRedeclared`. Um preset declarado
sob um id já usado por outro tipo é `ArtifactKindMismatch`; um 33º id é `ArtifactCapExceeded`;
`primary: true` enquanto outro id é primário é `ArtifactPrimaryConflict`. Todos os cinco
derrubam a execução.

Um dashboard não guarda dados próprios. Todo ponto, linha, tile e cartão é uma linha de
journal de kind `report` cujo `artifact_id` corresponde, e toda superfície (o painel lateral,
a aba em tamanho inteiro, um cold reload) dobra as mesmas linhas pela mesma função pura na
mesma imagem. Um dashboard lê apenas os fields que seu spec nomeia, então o renderer pede ao
CLI apenas esses fields e nunca itens inteiros: um item pode ter até 1 MiB, e um chart precisa
de um número dele (documento do engine, "Reading the journal").

### Linhas de journal e eventos

Cada publicação ou declaração é uma linha de journal de kind `artifact`, chaveada por ponto
e ordinal, com o id numa coluna `artifact_id`. O resultado da linha é um
`ArtifactVersionRecord`:

```ts
interface ArtifactVersionRecord {
  id: string;
  kind: "file" | "markdown" | "chart" | "table" | "metrics" | "board";
  version: number;
  title?: string; description?: string;
  contentType?: string; bytes?: number; uri?: string;   // content only
  sourcePath?: string;                                   // file only
  spec?: unknown;                                        // preset only
  publishedAt?: number;
  primary?: true;                                        // stamped by the engine; sticky per id
}
```

`primary` viaja dentro do resultado da linha, então não exigiu migração; na retomada o
engine reconstrói qual id é primário só a partir das linhas concluídas.

Bytes nunca entram no journal; `uri` aponta para dentro do store. Uma publicação bem-sucedida
e uma declaração emitem `artifact-published` com o registro; uma publicação de conteúdo que
falha emite `artifact-failed` com o id, o membro e o erro estruturado. Nenhuma família emite
eventos de ciclo de vida de nó (queued, dispatched, settled): um ponto de artefato não está
em grafo algum, e um evento de assentamento nele apareceria como um nó inexplicado no painel
da execução. Um acerto reproduzido não emite nada. O número da versão é derivado da
contagem de linhas concluídas para o id, então sobrevive à retomada, e somente linhas
concluídas reivindicam um id, então uma publicação falha não gasta uma das 32. Uma linha
falha reproduz como a mesma rejeição. Uma linha de report marcado carrega a tag em
`artifact_id` e seu evento carrega `artifactId`; a tag não faz parte do hash de input do
report.

O lado do engine (ordenação, porta do journal, consultas de protocolo, retenção do store)
está no documento do engine.

### Como o usuário os vê

Em resumo, porque a renderização pertence a `docs/dynamic-workflow/presentation.md` e
`docs/dynamic-workflow/transcript-and-notifications.md`:

- **O cartão de conclusão** lidera com o primário como uma **linha**: o quadro de preview no
  tamanho de um tile ao lado do título, da descrição e de uma linha `kind · size`; os outros
  artefatos seguem como um **índice**, uma linha cada (ícone de tipo, título, tamanho ou
  contagem), no máximo seis, o resto dobrado numa linha "N more" que abre o painel da
  execução. Uma execução com exatamente um artefato recebe a linha sem a flag. Sem primário
  o cartão mostra só o índice: nenhum artefato mereceu um preview.
- **O painel da execução** tem uma seção de artefatos abaixo do grafo, presente apenas
  quando a execução publicou algo, renderizada também para execuções falhadas e paradas. Com
  um primário é a mesma linha, e o resto como um índice de uma coluna sem limite; sem um
  primário, cada artefato é um tile com um preview (o dashboard ao vivo, uma miniatura do
  documento, as primeiras linhas de um CSV, uma imagem, um glifo de PDF) e uma legenda, em
  uma grade que se adapta à largura do painel. O cabeçalho da seção colapsada mantém o
  título do primário ao lado da contagem.
- **Uma aba em tamanho inteiro** (`workflow-artifact`) abre a partir de um tile, um chip ou
  uma linha do hub. Seu cabeçalho mostra o título, o tipo e um stepper de versões; seu corpo
  despacha pelo tipo de conteúdo: markdown, PDF, imagens, texto e código, os formatos de
  escritório pelos viewers existentes, presets em tamanho inteiro. HTML ganha um cartão de
  metadados cuja ação é "abrir no navegador", a superfície de fallback para a regra abaixo;
  tipos desconhecidos ganham um cartão de metadados com "mostrar no workspace".
- **"Abrir como arquivo"** fica no cabeçalho da aba de todo artefato de conteúdo (`file` e
  `markdown`; presets não têm bytes). É um botão dividido: a ação principal abre a versão
  na tela no app padrão do sistema, o chevron lista os apps instalados (a mesma lista e
  escolha lembrada dos outros menus "abrir com", gerenciadores de arquivos primeiro), e
  depois as ações de localização: "mostrar no workspace" quando o artefato tem uma origem no
  workspace que a aba alcança, e "copiar caminho". O cabeçalho portanto carrega um controle
  de arquivo, não dois; onde o botão dividido está ausente, "mostrar no workspace" fica
  sozinho no cabeçalho. O arquivo é uma **cópia que o desktop escreve** a partir dos bytes
  que a aba já leu, em
  `~/.zcode/tmp/workflow-artifacts/<runId>-<digest>/<artifactId>-<digest>/v<N>/<name>`; o
  nome é o nome base de `sourcePath` para `file` (sua extensão escolhe o app) e
  `<artifactId>.md` para `markdown`. Cada `<digest>` é os 8 primeiros dígitos hex do SHA-256
  do id que o precede, como o CLI o enviou. Isso mantém em dois diretórios dois ids que o
  engine distingue quando só a parte legível os fundiria: sistemas de arquivos que ignoram
  caixa (os padrões de macOS e Windows) fundem `Report` e `report`, e a sanitização que
  descarta um ponto inicial funde `.notes` e `notes`. Não é o arquivo do store, por três
  razões: o store mora com o CLI, que para um workspace SSH, WSL ou Docker é outra máquina;
  um editor escrevendo no arquivo do store mudaria uma versão publicada sob seu registro de
  journal; e o protocolo teria de entregar caminhos do host ao renderer. Uma cópia é escrita
  só quando seu caminho está vazio. Os bytes de uma versão nunca mudam, então uma cópia
  existente ou é os mesmos bytes ou são as edições do próprio usuário, e ambos são mantidos;
  abrir de novo abre o mesmo arquivo. A ação existe onde o shell pode escrever essa cópia
  (o desktop, workspaces locais e remotos igualmente) e está ausente no shell de
  remote-control do celular e nos shells web. As cópias ficam sob `tmp`, que a página de
  armazenamento das Settings lista junto das outras saídas de ferramentas e que o usuário
  pode limpar; uma cópia limpa é escrita de novo na próxima abertura.
- **Um artefato HTML abre diretamente na aba do navegador embutido**, de toda superfície que
  abre um artefato, sem passar pela aba em tamanho inteiro. Três coisas precisam valer: o
  workspace é local (sem workspace identity, sem sessão remota), o shell tem o navegador
  embutido (desktop, não o shell web de remote-control do celular), e o artefato tem um
  caminho de origem no workspace. HTML aqui significa um `contentType` exatamente
  `text/html`, o mesmo teste que decide se a aba desenha seu cartão HTML, então as duas
  nunca discordam sobre o que é uma página; um sumário sem tipo de conteúdo não é HTML e
  abre a aba. A URL é a URL `file://` da cópia do workspace, o caminho do workspace junto com
  o caminho de origem relativo do registro, o arquivo original da versão mais recente,
  exatamente o que "abrir no navegador" abriu a partir da aba. Clicar no mesmo artefato de
  novo foca a aba do navegador já naquela URL naquele workspace e a recarrega, então uma
  versão republicada mostra conteúdo novo em vez de abrir uma segunda aba. A ressalva que o
  cartão da aba declara vale aqui também: aquele arquivo são os bytes atuais do workspace,
  não os bytes fixados para uma versão, e por isso só a versão mais recente é alcançável
  assim.
- **A decisão de roteamento mora em um lugar**, o handler de abertura do painel do app
  (`useAppPanels.handleOpenWorkflowArtifact`). Uma superfície passa o que seu próprio sumário
  sabe, o `contentType`, e o `sourcePath` onde tem a visão de journal combinada; o handler
  pergunta ao journal de artefatos da execução (`workflowRunArtifacts`) por um caminho de
  origem que não lhe foi dado. Quando essa consulta falha (um CLI antigo sem ela, um erro
  transitório) ou o registro não tem caminho de origem, o clique abre a aba em tamanho
  inteiro. Nenhum clique é morto.
- **A linha da notificação de conclusão** termina em até três pills pequenos de artefato
  mais um overflow "+N", cada um abrindo seu artefato pela mesma regra.
- **O hub de workflows** mostra os mesmos pills nas linhas do histórico de execuções e uma
  faixa de "latest artifacts" na página de detalhe de um workflow salvo, tirada da sua
  execução concluída mais recente.

Toda lista é ordenada **primário primeiro, depois ordem de publicação**. A ordem é fixada
onde as listas são construídas, na projeção do journal (`artifactsOf`) e no manifesto da
notificação, antes de qualquer limite ser aplicado, então o primário nunca é o artefato que
um limite corta. Nenhuma superfície rotula o primário; a forma da linha diz.

Onde um clique em um artefato HTML cai, de qualquer uma dessas superfícies:

| O clique | Onde cai |
|---|---|
| workspace local, um shell com navegador, um caminho de origem em mãos ou no journal | a aba do navegador, na URL `file://` do arquivo do workspace |
| o mesmo artefato clicado de novo | essa mesma aba do navegador, focada e recarregada, nunca uma segunda aba |
| um workspace remoto ou uma sessão remota | a aba em tamanho inteiro, cujo cartão HTML mostra a nota de local-only |
| o shell de remote-control do celular | a aba em tamanho inteiro; esse shell não tem navegador |
| a consulta ao journal falha, ou o registro não tem caminho de origem | a aba em tamanho inteiro |
| o sumário não traz `contentType` (um CLI antigo que não emitia nenhum) | a aba em tamanho inteiro |

No lado do modelo, a seção `<artifacts count shown>` da notificação de conclusão lista uma
linha por artefato, `- {id} ({kind}, primary, v{version}, {contentType}, {bytes} bytes):
{title}` (`primary` aparece apenas no primário; presets mostram `{n} items` em vez de
bytes), no máximo oito linhas depois da seção `<reports>`; `GetWorkflowRun` lista até 32 do
mesmo jeito. Nenhum dá ao modelo uma URI: o modelo não pode ler o store, e o conteúdo é
alcançado por `GetWorkflowRun` ou por um subagent lendo o caminho do workspace.

### A orientação

A seção "Deliver artifacts" da skill carrega dois hábitos; o comentário de facade em
`artifact` declara apenas as regras de id, as duas famílias e os limites. Toda execução
publica seu entregável: uma coisa que o usuário pediu (uma página, um PDF, um site) é
escrita por um subagent no workspace e publicada com `file`; uma resposta (achados, uma
revisão) é publicada como markdown, a forma longa dos fatos que o retorno resume, uma vez no
fim, pulada apenas quando a resposta inteira tem uma linha. Um dashboard é para a pessoa
assistindo a execução: declare um quando há estado que vale assistir no meio da execução,
nenhum quando a execução termina antes de alguém olhar. Dois testes mantêm o conjunto
pequeno: o usuário o abriria por conta própria, e ele repete outro artefato. Uma execução
que publica mais de um artefato marca seu entregável `primary: true`, então o cartão e o
painel da execução lideram com ele em vez de com o que foi publicado primeiro. O `return`
permanece o resultado voltado ao modelo e os artefatos o entregável voltado ao usuário; o
mesmo conteúdo nunca vai nos dois.

## EvalWorkflowSnippet

`EvalWorkflowSnippet` é o banco de provas da autoria. Ele compila e roda um pequeno snippet
TypeScript sincronamente contra o mesmo compilador, lowering, sandbox e caminho de execução
de world-read que uma execução real usa, e devolve o resultado na chamada da ferramenta.
Existe porque testar lógica fixa (um parser, um padrão de glob, um predicado de gate) em Node
comum tem a fidelidade errada: `files.glob` devolve caminhos ordenados relativos ao
workspace, limites recusam, `GrepMatch` tem uma forma, e as opções do compilador são as da
execução. Um snippet que passa cola literalmente num workflow.

| Entrada | Significado |
|---|---|
| `code` | o snippet, escrito contra a facade de snippet |
| `path` | ou: um arquivo com o snippet, lido inteiro (relativo ao diretório de trabalho ou absoluto); exatamente um entre `code` e `path` |
| `timeoutMs` | tempo de parede para o snippet inteiro; padrão 60 000, aceito entre 1 000 e 600 000 |

A facade de snippet é os segmentos args, log, world e world-run. `agent()`, `report()`,
`artifact.*` e `phase()` estão ausentes, então um snippet que use um deles falha a compilação
com um diagnóstico comum de "cannot find name"; asks não podem ser ensaiados, só as peças.
A descrição da ferramenta diz para que serve e aponta para a skill; o subconjunto da facade e
as regras de snippet são a §16.6 da skill, e a chamada é recusada até que a skill tenha sido
carregada na sessão (veja "O gate da skill"). O pipeline é o de produção: um programa
TypeScript alimenta diagnósticos, a tabela de pontos e o lowering; comandos de `world.run`
são coletados e um comando não literal é o mesmo diagnóstico 9003; o código rebaixado roda no
harness de sandbox com um journal em memória, um run id aleatório, o `executeWorldRead` de
produção (sistema de arquivos real, git real, limites de produção) e um driver cujos métodos
de ask lançam, como defesa contra um erro de wiring que nunca os alcançaria.

Nada persiste: sem linhas de journal, sem tarefa em background, sem entrada na lista de
execuções. O resultado é `{ok, diagnostics, logs, response, durationMs}`. Com diagnósticos,
`ok` é falso, nada rodou, e a resposta diz isso. Em sucesso a resposta carrega o valor
devolvido serializado do jeito que uma notificação de conclusão serializa um resultado, e as
linhas de `log()` em ordem (no máximo 100, cada uma com no máximo 2 048 caracteres, truncamento
marcado). Um valor devolvido acima de 256KB é uma falha (`ArtifactTooLarge`) com uma mensagem
para devolver um sumário. Um erro de script, uma rejeição de limite, um timeout que matou o
sandbox, ou um cancelamento voltam todos como `ok: false` com o código e a mensagem
estruturados.

A permissão é comum, como em `Bash`: modos, regras e "sempre permitir" se aplicam. O hook de
aprovação da ferramenta compila o snippet e pede confirmação apenas quando ele contém comandos
de `world.run`; um snippet somente leitura, e um snippet que não compila, prosseguem em
silêncio. O usuário lê os comandos do código do snippet, o que a regra de literal torna
possível. A ferramenta é marcada como não somente leitura, com escopo de efeito colateral no
workspace.

O cartão da ferramenta no chat: enquanto roda, "Running workflow snippet · N s" com o código
expansível; quando termina, "Workflow snippet · N ms" com o valor de retorno expansível; em
falha, o sumário genérico de falha com o erro expandido, ou o cartão de feedback do compilador
(`docs/dynamic-workflow/presentation.md`, "Compiler feedback") quando o snippet não compilou.
Logs vazios, valores de retorno vazios e palavras de status nunca são repetidos.

## Uso, não orçamento

Não há construto de orçamento. O harness não impõe orçamento de tokens nem limite de nós, a
facade não tem global `budget`, e nenhum código de erro derruba uma execução por uso. As
razões: nenhum chamador de produção nunca definiu um orçamento de tokens, então a verificação
era inalcançável; o limite de nós era uma cerca que um fan-out grande normal esbarrava; e o
controle de custo pertence ao harness e à pessoa, não a código de script otimizando contra um
limite. Cancelamento e a confirmação da execução são os controles.

O uso ainda é contabilizado, como superfície de observação. O driver reporta o uso de tokens
de cada turno, o engine o soma em `spentTokens` da execução, escreve no journal no mesmo
passo em que emite `usage-updated { spentTokens }`, e os dois são sempre iguais. O snapshot de
execução do protocolo carrega `usage { spentTokens, nodesUsed }`, com `nodesUsed` contado a
partir do primeiro dispatch de cada nó. O painel da execução mostra uma linha, 「用量：N
tokens · M 步」 ("Usage: N tokens · M steps"); o cartão da TUI mostra os tokens;
`GetWorkflowRun` reporta `usage` com contagens de token e de nó e sem campos de limite. Como
nada para um laço por causa do script, um laço de descoberta se limita com uma constante de
rodadas no script.

O número é o custo da linhagem da execução. Uma execução corrigida (`AmendWorkflow`,
`docs/dynamic-workflow/launch.md`) começa sua contagem no total do antecessor em vez de zero,
e uma cadeia de amends soma por construção porque o número de cada antecessor já é cumulativo;
um acerto de cache não adiciona nada, já que seu custo está dentro do total herdado. Uma
execução retomada continua sua própria contagem. Nos dois casos o engine reemite o total
carregado logo depois de `run-started`, então um cartão nunca mostra zero para uma execução que
já custou algo. O antecessor mantém seu próprio número; é o sucessor que reporta o todo
(`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Usage across the
lineage").

## Alternativas não adotadas

- **Uma facade `budget`, um orçamento de tokens e um limite de nós.** Nunca definidos em
  produção, mais um global de facade com lowering e casos especiais do analisador, e a
  camada errada para controle de custo.
- **Um perfil de ferramenta (`"none"`, `"readonly"`) ou um tier de modelo (`"lite"`) na
  persona.** O tier não tinha fonte de modelo leve no host e resolvia para o modelo
  principal. Escolher um modelo mudou para a execução, como o campo `subagent_model` das
  ferramentas de lançamento (`docs/dynamic-workflow/launch.md`), onde é uma decisão que o
  usuário pode ver e aprovar. Um modelo por subagent voltou quando o host ganhou um catálogo
  de modelos, como um nome de modelo concreto em vez de um tier ("Escolhendo um modelo por
  subagent"): o catálogo é a fonte do host que o tier não tinha, e resolver cada nome antes
  da janela mantém a escolha visível e aprovável. Tiers nomeados (`"fast"`, `"strong"`)
  ainda não são oferecidos; precisariam de um mapeamento que o host não tem, que foi o que
  aposentou `"lite"`. Os perfis impunham uma frase ("não pode editar nem rodar") que todo
  outro subagent do produto carrega como texto de ask, prosa de custo na facade,
  ramificação de contrato e seções da skill, e o perfil sem ferramentas produzia escalações
  de placeholder vindas de subagents a quem se mandava ler o que não podiam. Um script que ainda
  escreve `tools:` recebe o erro de propriedade excedente do próprio TypeScript, e um que
  escreve `model: "lite"` recebe 9011 (não existe esse modelo); não há shim de compatibilidade
  nem dica customizada.
- **Uma seção de system prompt para orientação de workflow.** Os sinais de roteamento moram
  nas descrições das ferramentas e na skill; o prompt sempre ligado não ganha menção a
  workflow.
- **A skill repetindo a facade, ou arquivos de exemplo `.ts`.** Uma segunda cópia diverge, e
  um arquivo `.ts` convida à imitação de `import`/`export`.
- **Uma heurística de compilação para quais blocos de skill estão completos.** O marcador
  `<!-- compile -->` é explícito; uma heurística acabaria passando um erro real como
  fragmento.
- **`alwaysAsk` na ferramenta de snippet.** Essa postura pertence a `CreateWorkflow`, cujo
  envio é determinante e caro; um snippet é barato e efêmero.
- **Uma string de shell, uma opção `cwd` ou `env`, ou um comando calculado em
  `world.run`.** A janela de confirmação só pode mostrar um conjunto fixo de comandos.
- **Saída diferente de zero como exceção.** Uma verificação que falha é o caminho normal do
  laço de gate.
- **Lógica de gate em um arquivo de verificação externo.** Um arquivo no workspace está no
  domínio gravável dos subagents; lógica dentro do script submetido não está.
- **Truncar saída acima do limite em qualquer lugar.** Uma visão parcial silenciosa é
  exatamente a falha que os limites existem para evitar.
- **Subagents publicando artefatos diretamente.** O usuário aprovou o script, não o subagent.
- **Dashboards HTML escritos pelo modelo, ou um iframe inline para artefatos HTML.** O
  renderer não tem sandbox para hospedar HTML com script, e o sandbox que o produto já tem
  é o `<webview>` da aba do navegador, que é onde um artefato HTML abre no lugar; os presets
  cobrem os casos de número observado e status observado.
- **Um filtro `where` em `report` ou um terceiro argumento.** Uma tag, um stream.
- **Sniffing de conteúdo para tipos de artefato.** Um segundo juiz discorda do primeiro.
- **Uma tabela de artefatos separada.** Versões são linhas de journal; uma segunda tabela é
  uma segunda verdade.
- **Reusar `node-settled` para uma publicação falha.** O ponto não está em grafo algum, então o
  painel da execução mostraria um nó inexplicado.
- **Colocar a tag do report no hash de input do report.** Todo report sem tag em um journal
  existente passaria a casar errado na retomada sem ganho algum.
- **`WorkflowReport` na facade.** Reconhecer a forma significa síntese de schema e
  reconhecimento pelo engine; a interface copiável da skill compra a forma sem a maquinaria.

- **Um canal limitado, ou um `send` assíncrono.** O backpressure tem um recurso escasso para
  proteger e o limite de concorrência já o protege; um buffer cheio seria mais uma coisa em
  que um script pode dar deadlock.
- **Encerrar um canal por quiescência** (um receptor completa quando nada na execução
  poderia enviar). Determinístico e livre de `close`, mas o fim de um canal passaria a
  depender do estado da execução inteira em vez de seus produtores, e um estágio nunca
  poderia observar a própria conclusão. A quiescência é mantida como o detector de travamento,
  que é a mesma condição lida como erro.
- **Um helper `pool` ou `stage` na facade.** O helper existia para ter o protocolo de
  fechamento; um `finally` no corpo de uma future tem o mesmo dono, e uma cadeia fluente
  `.pipe()` não consegue carregar um marcador de fase por estágio.
- **Uma forma com escopo `phase(name, body)`.** Uma chamada a menos que um marcador dentro de
  uma future, mas dá a `phase` duas formas e perturba a regra de statement autônomo.
- **Um ponto `channel` e um nó de relé nos grafos.** Os tipos de nó do grafo são um
  vocabulário fechado que os clientes validam estritamente; a visão de container dá as
  arestas certas hoje, e um nó pode ser adicionado quando alguma imagem precisar dele.
- **Canais de broadcast.** Um estágio que precisa alimentar dois consumidores envia para dois
  canais; cada item ter um receptor é o que faz um pool ser um pool.

## Perguntas em aberto

- Colapsar `AgentPersona` para uma string de system prompt crua; a forma de objeto agora tem
  um campo.
- Um modelo de subagent padrão do host escolhido pelo usuário. O `subagent_model` por
  execução nas ferramentas de lançamento cobre escolher um para uma execução; não existe uma
  configuração que se aplique a toda execução.
- `WorkflowReport` como um tipo da facade com renderização nativa de conclusão e achados.
- Listar `declaredArtifacts` na janela de confirmação da execução; o produto de compilação os
  carrega, o schema de exibição de permissões ainda não.
- Uma ação "salvar no workspace" que escreve os bytes de uma versão num caminho escolhido pelo
  usuário. "Abrir como arquivo" cobre abrir uma versão em outro app, incluindo os tipos sem
  renderer; colocar uma cópia no workspace (para commitar ou continuar editando lá) não é
  coberto.
- Exclusão em cascata dos bytes do store quando uma execução é apagada; a retenção hoje é a
  política de projeto do store.
- Se os limites de report são suficientes para uma execução cheia de dashboards, ou se
  reports marcados precisam de sua própria cota.
- Um `select` sobre vários channels, e um `receive()` que produz um item fora de um laço.
- Desenhar um canal como um nó de relé quando o vocabulário do grafo puder crescer.
