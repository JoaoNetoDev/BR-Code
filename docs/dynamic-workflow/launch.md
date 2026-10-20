# Dynamic Workflow: Superfícies de Início (spec)

Status: implementado. Este documento cobre todas as maneiras pelas quais um workflow é
iniciado, salvo, encontrado e inspecionado; `docs/dynamic-workflow/authoring.md` cobre como o
script é escrito, e `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md` cobre
o que acontece com a execução depois que ela começa.

## As maneiras pelas quais um workflow começa

Uma execução de workflow começa em um de seis lugares. Cada uma termina na mesma chamada
`port.submit` ou `port.amend` no serviço de execuções, e a partir daí as execuções são
indistinguíveis: mesmo journal, mesmas notificações, mesmo cancelamento e retomada, mesmo
painel de execução.

| Superfície | Quem inicia | Confirmação | Onde a execução aterrissa |
|---|---|---|---|
| ferramenta `CreateWorkflow`, `script` embutido | o modelo | a janela de confirmação | a sessão atual |
| ferramenta `CreateWorkflow`, origem `saved` | o modelo | a janela de confirmação, com um selo de origem salva | a sessão atual |
| ferramenta `AmendWorkflow` | o modelo | nenhuma quando a execução sendo revisada é da própria sessão e a revisão não traz nenhum provedor novo; a janela de confirmação caso contrário (veja "Revisando as execuções desta sessão") | a sessão atual |
| 「运行」 (Executar) na página do hub | o usuário | nenhuma: o clique é o consentimento | uma sessão nova e vazia no projeto do workflow |
| Configure no cartão da execução ou no painel da execução (uma nova execução do mesmo script sob novas configurações; uma mudança não inicia nada, veja abaixo) | o usuário | nenhuma: o clique em Apply é o consentimento | a sessão que é dona da execução |
| `/dwf resume`, o Resume do painel da execução, `ResumeWorkflowRun` | o usuário ou o modelo | nenhuma | a sessão que é dona da execução |

Dois clientes contornam a janela de propósito: a UI de terminal e execuções `-p` headless.
Veja "O bypass de aprovação".

Duas das seis não iniciam nada sob uma condição. Um Configure cuja única mudança é o
paralelismo, e um `AmendWorkflow` carregando nada além de `max_concurrency`, aplicados a uma
execução que ainda está viva, reajustam essa execução no lugar: mesmo id de execução, nenhuma
execução nova, nada é parado (veja "Alterando apenas o paralelismo de uma execução viva").
Qualquer outra combinação, e qualquer execução que não esteja mais viva, inicia uma execução
exatamente como a tabela diz.

O modelo fica sabendo das execuções por notificações de conclusão e de pergunta
(`docs/dynamic-workflow/transcript-and-notifications.md`) e por duas ferramentas somente de
leitura, `ListWorkflowRuns` e `GetWorkflowRun`.
Uma execução que chega a um buraco pede código ao modelo por meio de uma notificação de buraco
e `FillWorkflowHole` ("A ferramenta `FillWorkflowHole`"), o que não inicia nada: estende a
execução que perguntou.

## A ferramenta `CreateWorkflow`

### Quando o modelo pode chamá-la

Somente quando o usuário pediu um workflow: por meio de `/workflow`, ou em prosa que nomeie
workflow como o meio ("use um workflow para …", "用工作流 …"). Então a chamada é obrigatória,
por menor que seja a tarefa, e o tamanho decide apenas quantos subagentes o script recebe. Sem
um pedido desses o modelo não inicia um workflow, qualquer que seja a forma da tarefa;
trabalho de múltiplos passos ou múltiplos subagentes vai para a ferramenta `Agent` ou é feito
no lugar. A descrição da ferramenta enuncia as duas metades, a descrição do `Agent` repete a
primeira, e a tabela de roteamento da skill de autoria segue a mesma regra
(`docs/dynamic-workflow/authoring.md`, "The command").

Uma chamada que envia um script (`script` ou `path`) também é recusada até que a skill
`dynamic-workflows` tenha sido carregada na sessão; a descrição diz isso e nomeia a ferramenta
`Skill`. Executar um workflow salvo pelo nome é isento. O portão, sua sondagem e suas isenções
são especificados em `docs/dynamic-workflow/authoring.md`, "The skill gate".

### Entrada e saída

```ts
interface CreateWorkflowInput {
  name?: string;          // rótulo de exibição; por padrão o nome do workflow salvo
  script?: string;        // o script, embutido
  saved?: {               // ou: um workflow salvo, pelo nome
    name: string;
    args?: Record<string, unknown>;
    scope?: "project" | "global";   // apenas para desambiguação
    path?: string;                  // preenchido pela ferramenta, nunca pelo modelo
  };
  path?: string;          // ou: um arquivo de script em disco (veja "Arquivos de script")
  args?: Record<string, unknown>;  // valores para os argumentos declarados por um arquivo `path`; com `saved`, use `saved.args`
  max_concurrency?: number;  // no máximo este número de subagentes trabalha por vez, acima ou abaixo do padrão; omitido = o paralelismo padrão
  subagent_model?: string;   // os subagentes da execução trabalham neste modelo; omitido = o modelo da sessão
  adjustable_settings?: {    // preenchido pela ferramenta, nunca pelo modelo (veja "Ajustando as configurações na janela")
    subagent_model: boolean;       // este host consegue resolver uma escolha de modelo
    concurrency_ceiling?: number;  // o paralelismo padrão D, quando a porta de execução sabe dizer (o nome no fio precede o padrão)
  };
  model_bindings?: Record<string, string>;  // preenchido pela ferramenta: cada nome de modelo usado pelo script → canônico (veja "Os modelos que o script nomeia")
}
```

`max_concurrency` é o limite de concorrência da própria execução
(`docs/dynamic-workflow/concurrency.md`, "Two bounds on a run"). Não tem limite superior:
`resolveInput` apenas o arredonda para baixo até um número inteiro de pelo menos 1 antes da
janela, de modo que a janela, os hooks e o handler vejam o valor que estará em vigor, e a
resposta o nomeia: "At most N subagents run at once", com "(the default)" acrescentado quando
o valor é o próprio paralelismo padrão.

`subagent_model` aponta os subagentes da execução para um modelo diferente do da sessão. A
chamada pode trazer o nome que o usuário disse, um id de modelo solto, ou um
`providerId/modelId` completo, cada um opcionalmente carregando um `$reasoningLevel`;
`resolveInput` resolve isso contra o catálogo de modelos do host e o reescreve no
`providerId/modelId[$reasoningLevel]` canônico antes da janela, de modo que a janela, os hooks
e o handler novamente vejam o valor que estará em vigor. A resposta o nomeia: "Subagents run on
{model} (the main agent stays on the session model)". O parêntese é essencial. O agente principal
mantém o modelo da sessão, o que quer que este campo diga, e sem essa meia frase ele lê
"runs on X" como uma troca sua própria e relata ao usuário uma que nunca aconteceu.

O campo é escolha do usuário, nunca do agente principal. O agente o define apenas quando o
usuário pediu um modelo, passando o nome que ele usou, e nunca move os subagentes para um modelo
sob outro provedor por conta própria: outro provedor é outra conta, e um modelo mais barato
aparente ali não é motivo para agir, apenas motivo para perguntar. Quando o agente vê que um
modelo mais leve ou mais rápido em outro lugar serviria à execução, ele pergunta ao usuário antes
da chamada, nomeando o modelo, o provedor e o que economizaria, e toma a resposta como o pedido.
Quando o usuário de fato pediu um modelo que vive sob outro provedor, por essa pergunta ou por
conta própria, tudo bem; o agente então escreve o `providerId/modelId` completo, que é a única
forma que o resolvedor aceita para um modelo que o provedor da sessão não tem (veja a tabela
abaixo). A mesma regra amarra os modelos que um script nomeia para seus subagentes
(`docs/dynamic-workflow/authoring.md`, "Choosing a model per subagent"). A regra de permissão
cobre isso para o único caminho que não tem janela própria: um `AmendWorkflow` da execução desta
sessão que trouxesse um provedor que nem a sessão nem a execução usaram pergunta ao usuário como
qualquer outra revisão ("Revisando as execuções desta sessão").

Exatamente um entre `script`, `saved` e `path` deve ser dado, e `args` apenas com `path`. A
regra é imposta pelo `validateInput` da ferramenta sobre os argumentos do modelo, não pelo
schema: após a normalização (abaixo) a entrada legitimamente carrega `script` junto com `saved`
ou `path`, e um refinamento de schema rejeitaria essa forma no handler e depois de qualquer
reescrita por hook. Independentemente da origem, o script termina em um arquivo que o modelo
edita entre envios; veja "Arquivos de script".

Não há campo de predecessor. Revisar uma execução existente é trabalho de `AmendWorkflow`
(abaixo); a entrada é estrita, de modo que um `resume_from` solto é rejeitado como chave
desconhecida em vez de iniciar silenciosamente uma execução de preço cheio. As duas
ferramentas têm a mesma saída.

```ts
interface CreateWorkflowOutput {
  diagnostics: { code; line; column; message }[];
  ok: boolean;
  response: string;                 // o texto que o modelo lê
  causalityGraph?: ...;             // o payload de exibição delimitado
  status?: "backgrounded";          // apenas quando uma execução começou
  backgroundTaskId?: string;        // = o id da execução
}
```

Quando uma execução começa, a resposta informa ao modelo o id da execução, que o resultado
chegará como notificação, e que ele não deve esperar por ela nem consultá-la com `TaskOutput`.

### Da chamada à execução

O executor da ferramenta executa estes passos em ordem. A ordem é o que torna a janela de
confirmação confiável: tudo abaixo do passo 3 vê um e o mesmo script.

1. Validação de schema dos argumentos do modelo.
2. `validateInput`: exatamente uma origem.
3. `resolveInput`: a única leitura de disco. Para um script embutido esta é a função
   identidade. Para `saved` ele lê o arquivo, valida os argumentos contra a declaração, e
   reescreve a entrada para `{ name: input.name ?? savedName, script, saved: { name, args,
   path, scope } }`, onde `script` é o corpo salvo byte a byte e `scope` é o arquivo onde a
   busca acertou. Uma falha aqui (nome desconhecido, arquivo malformado, argumentos inválidos)
   retorna um erro estruturado ao modelo antes de qualquer hook ou diálogo. O mesmo passo
   arredonda `max_concurrency` para baixo até um número inteiro de pelo menos 1 (a porta o
   arredonda de novo no caminho para o motor) e lê o paralelismo padrão do membro opcional
   `defaultConcurrency` da porta de execução para a janela e para a resposta; sem porta, ou com
   uma porta que não a implementa, o padrão é simplesmente desconhecido. Ele também resolve
   `subagent_model` através da porta opcional de catálogo de modelos do contexto de execução,
   antes da leitura de disco, de modo que uma chamada que nomeia um modelo que este host não
   tem não custa nenhum trabalho de sistema de arquivos. Uma chamada embutida cujo limite está
   na faixa e cujo modelo já está escrito do jeito que o catálogo o escreve ganha uma chave e
   nada mais: quando há porta de execução o passo escreve o bloco `adjustable_settings` que a
   janela lê (veja "Ajustando as configurações na janela"), sobrescrevendo qualquer valor que o
   modelo tenha fornecido.
   Para `path` ele lê esse arquivo (relativo ao diretório de trabalho da sessão, ou absoluto),
   remove um bloco `/* zcode-workflow` quando o arquivo tem um, valida `args` contra a
   declaração do bloco (e rejeita `args` quando não há bloco), e reescreve a entrada para
   `{ name, script, path: <absoluto>, args? }`. Um arquivo ausente ou ilegível é uma falha
   estruturada que nomeia o caminho. Quando o arquivo (um arquivo `path`, ou um salvo) carrega
   um bloco de metadados, o mesmo passo registra `script_line_offset`, o número de linhas antes
   do corpo, para que diagnósticos possam ser reportados em linhas de arquivo. Veja "Arquivos
   de script". Por último, com o script em mãos, ele o compila (o memo de um slot torna as
   compilações seguintes gratuitas) e resolve cada nome de modelo usado pelo script em
   `model_bindings` (veja "Os modelos que o script nomeia").
4. Hooks `PreToolUse` e regras de permissão do projeto. Eles veem o script resolvido, então uma
   regra que varre scripts de workflow se aplica também a workflows salvos.
5. A checagem de permissão. `CreateWorkflow` declara `alwaysAsk`, então a checagem vai direto
   para o ramo always-ask (veja "Por que a janela sempre aparece").
6. `prepareApproval`: compila o script. Diagnósticos significam nenhuma janela (veja abaixo), e
   o mesmo vale para um nome de modelo que o script usa e que `model_bindings` não vincula. Uma
   compilação limpa produz o payload de exibição `create_workflow`, o grafo delimitado que a
   janela desenha, e o pedido é prohibido.
7. O usuário responde, ou um hook `PermissionRequest` responde primeiro. Uma resposta de
   allow pode carregar as configurações que o usuário mudou na janela; o executor as aplica à
   entrada através do `applyInputAdjustments` da ferramenta antes do handler rodar (veja
   "Ajustando as configurações na janela").
8. O handler compila mais uma vez (um memo de um slot torna isso gratuito). Para uma origem
   embutida ele primeiro escreve a cópia de trabalho no diretório de rascunhos ("Arquivos de
   script"); isso acontece antes do resultado da compilação ser lido, então um script que falha
   ao compilar também está em disco (a cópia de uma origem salva já foi escrita no passo 3).
   Depois chama `port.submit` com o script, `cwd`, `name`, `args`, `scriptPath` (o rascunho, a
   cópia salva, ou o próprio arquivo `path`), o id da sessão pai e o id da chamada de
   ferramenta, e retorna `backgrounded`, nomeando o arquivo. Quando o usuário ajustou as
   configurações, a resposta diz isso antes de qualquer outra coisa sobre elas.
9. O executor registra a execução no rastreador de tarefas em segundo plano.

A porta de catálogo lê a visão ao vivo do registro a cada chamada, nunca uma cópia tirada
quando a sessão foi montada, então um provedor que o usuário adicionou ou removeu no meio da
sessão fica visível para o próximo `CreateWorkflow`. Contra essa listagem, `subagent_model`
resolve por especificidade:

| O que o campo diz | Para o que resolve |
|---|---|
| `providerId/modelId` | aquela entrada |
| um `modelId` solto que o provedor da própria sessão tem | a entrada daquele provedor, o que quer que os outros provedores também tenham |
| um `modelId` solto que só os outros provedores têm | uma falha nomeando seus ids completos: um nome solto nunca cruza a fronteira do provedor, então mover os subagentes para outro provedor é sempre escrito como `providerId/modelId` |
| um `modelId` solto, quando o modelo da sessão não está no catálogo | a entrada quando exatamente um provedor a tem; caso contrário, uma falha nomeando todos (não há fronteira de provedor a preservar) |

A fronteira do provedor é a parte do resolvedor na regra acima: um id de modelo que por acaso
existe sob mais um provedor do que o usuário tem em mente (o mesmo modelo em uma chave pessoal e
em um plano de equipe, digamos) nunca é buscado em silêncio no outro, e a única forma que cruza
a fronteira é a que o agente escreve apenas quando o usuário pediu.

Ids de provedor e de modelo comparam sem distinção de maiúsculas, já que um registro não publica
nome de exibição distinto do id, e a string canônica é escrita na grafia do próprio catálogo,
para que ela cole de volta inalterada em uma chamada posterior. Um `$level` precisa ser um dos
níveis de raciocínio daquele modelo; sem ele o nível padrão do modelo se aplica, e um modelo sem
níveis não recebe nível nenhum. Uma entrada desabilitada nunca casa em silêncio: quando todas as
correspondências estão desabilitadas a chamada falha e nomeia os motivos, porque escolher em
torno dela entregaria ao usuário um modelo que ele não pediu, e escolhê-la falharia na primeira
pergunta de subagente.

### Os modelos que o script nomeia

Um script pode nomear modelos para seus subagentes (`docs/dynamic-workflow/authoring.md`,
"Choosing a model per subagent"). O compilador garante que o conjunto de nomes é fechado, e a
análise o entrega como `modelReferences`, uma entrada por ocorrência com sua linha e coluna. A
última parte de `resolveInput` resolve cada nome distinto com o mesmo resolvedor e a mesma
hierarquia de `subagent_model` e escreve os acertos na entrada:

```ts
model_bindings?: Record<string, string>;  // nome como escrito no script → canônico providerId/modelId[$level]
```

A chave é o nome exatamente como o script o escreve, porque essa string é o que chega ao host em
tempo de execução: o lowering apaga `model("x")` para `"x"`, e a persona a carrega
verbatim. Assim como `adjustable_settings`, o bloco é sempre sobrescrito, ausente quando o script
não nomeia modelo algum, e fora do schema voltado ao modelo.

Um nome que não resolve não é uma falha estruturada da chamada, como um `subagent_model`
irresolvível é; é uma falha no script, e segue o caminho de um erro de compilação. Ele não
recebe vínculo, `prepareApproval` vê um nome sem vínculo e não levanta nenhuma janela, e o
handler relata o diagnóstico 9011 na primeira ocorrência do nome, em linhas de arquivo, com o
diagnóstico e a lista de candidatos do próprio resolvedor, e depois a nota de sempre que nomeia o
arquivo a editar ("Falhas que nunca chegam à janela"). Um diagnóstico por nome distinto, não
por ocorrência: a lista de candidatos tem até quarenta linhas. Em um host sem catálogo de
modelos, todo nome falha com "This host cannot choose models; remove `model` from the
personas".

O handler entrega os vínculos à porta como `modelBindings` (seleções estruturadas); a porta os
registra uma vez, como strings canônicas, no evento `run-launched` ao lado de `subagentModel`, e
nunca infere um. Quando a sessão de um subagente é criada, o host procura o nome da persona
nessa tabela (`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Subagent
sessions"). Uma retomada lê a tabela de volta do evento, então os nomes mantêm os modelos com
os quais foram iniciados, qualquer que seja o catálogo nesse momento.

O corpo de um buraco pode nomear apenas modelos já presentes naquela tabela. O serviço de
preenchimento compara os nomes do script efetivo com a tabela da execução e relata um nome fora
dela como 9011 em sua primeira ocorrência, nas linhas do arquivo de preenchimento, listando os
nomes que a execução tem; nada é inserido e o buraco continua esperando. A tabela nunca é
estendida por um preenchimento: a janela de preenchimento não mostra linhas de modelo, então um
modelo adicionado ali rodaria sem que o usuário jamais o tivesse visto, e um segundo fato de
vínculo teria de ser lido de volta pela retomada, pelo replay e pela introspecção. Uma execução
que precisa de outro modelo é revisada com `AmendWorkflow`, cuja janela os lista.

A resposta acrescenta uma frase quando a tabela não está vazia, depois das configurações da
execução:
"Models named in the script: "{name}" = {canonical}; …". Como a frase das configurações, ela
nomeia o valor canônico, que o modelo pode colar em uma chamada posterior.

### Falhas que nunca chegam à janela

Um script que não compila nunca pergunta nada ao usuário, em qualquer modo de permissão. O
portão retorna `proceed`, o handler roda, e o modelo recebe os diagnósticos como linhas
`{path}:L{line}:C{column} {message}` em linhas de arquivo ("Diagnósticos em linhas de
arquivo"), mais uma nota de que nada foi executado e de que o arquivo nomeado é o que deve ser
editado e reenviado com `path`. Para uma origem salva a nota diz de qual workflow salvo o
rascunho foi copiado, para que o modelo saiba que a correção pertence a uma cópia e a
definição precisa de `SaveWorkflow` se for para mudar. Pedir a um usuário que aprove código que
não pode rodar interromperia o próprio ciclo de corrig-e-reenvia do modelo com uma decisão sem
efeito.

Um nome de modelo no script que o catálogo não consegue resolver é relatado do mesmo jeito,
como diagnóstico 9011 em sua linha (veja "Os modelos que o script nomeia").

Um `subagent_model` que o catálogo não consegue resolver também nunca chega à janela, mas como
uma falha da chamada e não como um diagnóstico, já que o campo é um argumento, não script. A
ferramenta retorna uma
falha estruturada carregando o diagnóstico e os ids que de fato existem, um por linha, o modelo
da própria sessão marcado como `[current]` para que o modelo veja que escolhê-lo equivale a
omitir o campo, limitado a quarenta linhas e fechado com "Pass one of these ids, or call
ListModels". Nenhuma janela aparece e nada começa. Um host sem catálogo de modelos recusa o
campo de plano ("This host cannot choose a subagent model; omit subagent_model") em vez de
repassar para baixo uma string que não pode conferir, o que só apareceria na primeira pergunta de
subagente da execução, muito depois de o usuário tê-lo aprovado.

Quando a sessão não tem porta de execução (um host sem execução de workflow), um script limpo é
relatado como compilado e não executado. A ferramenta nunca finge que uma execução começou.

## A ferramenta `AmendWorkflow`

Revisar é como uma execução obtém um script revisado: uma nova execução, com id próprio, que
importa o trabalho concluído da predecessora como cache
(`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Amend-resume"). É uma
ferramenta separada de `CreateWorkflow` porque é um ato diferente com uma exibição diferente: o
modelo não está iniciando algo, está mudando algo que o usuário já está acompanhando, e a
predecessora pode ainda estar rodando.

Uma revisão não precisa mexer no script. Todo campo da ferramenta segue uma regra: omita-o e a
nova execução mantém o valor da predecessora. Uma chamada que só muda o paralelismo, move os
subagentes para outro modelo ou renomeia a execução passa `run_id` e esse único campo, e a nova
execução roda o script registrado da predecessora sob as novas configurações. O trabalho
concluído da predecessora ainda é reproduzido a partir do cache, então só o que ela não havia
terminado roda ao vivo sob elas. A nova execução suplanta a antiga do mesmo jeito: uma
predecessora em execução é parada e suas perguntas inacabadas rodam de novo. Um subagente que
estava no meio de uma pergunta quando a parada chegou roda essa pergunta de novo com a troca
parcial que já havia produzido, então o trabalho dentro dela não é jogado fora — o documento do
motor ("How the engine consumes the cache") diz quando esse carregamento se aplica e quando não.

Uma combinação não é revisão nenhuma. Uma chamada carregando nada além de `max_concurrency`,
contra uma execução que ainda está viva, reajusta essa execução onde ela está e não inicia nada
(veja "Alterando apenas o paralelismo de uma execução viva"). Tudo abaixo deste parágrafo
descreve a revisão, que é o que toda outra chamada é.

O número de tokens da execução revisada, no seu cartão de conclusão, no painel da execução, em
`GetWorkflowRun` e no histórico de execuções, é o custo de toda a linhagem: começa no total da
predecessora e soma apenas os turnos ao vivo da revisão, então uma cadeia de revisas soma por
construção. A predecessora mantém seu próprio número
(`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Usage across the
lineage").

### Entrada e saída

```ts
interface AmendWorkflowInput {
  run_id: string;    // a execução a revisar: qualquer execução deste projeto, assentada ou ainda rodando
  script?: string;   // o script revisado inteiro, embutido
  path?: string;     // ou: o arquivo do script revisado, de modo geral o próprio arquivo de script da predecessora
                     // nenhum dos dois = manter o script da predecessora
  name?: string;     // rótulo de exibição; por padrão o nome da predecessora
  predecessor?: {    // preenchido pela ferramenta, nunca pelo modelo (veja abaixo)
    name?: string;
    status: "pending" | "running" | "completed" | "errored" | "stopped";
    stop_reason?: "user" | "model" | "provider" | "interrupted" | "superseded";
    owned_by_this_session: boolean;
    script_inherited?: true;  // a chamada não deu nenhuma origem; `script` agora contém o da predecessora
  };
  max_concurrency?: number | null;  // omitir = manter o limite da predecessora; null = removê-lo; um número = defini-lo
  subagent_model?: string | null;   // omitir = manter o modelo da predecessora; null = voltar ao modelo da sessão; uma string = defini-lo
  adjustable_settings?: { subagent_model: boolean; concurrency_ceiling?: number };  // preenchido pela ferramenta, como em CreateWorkflow
  model_bindings?: Record<string, string>;  // preenchido pela ferramenta, como em CreateWorkflow
}
```

No máximo um entre `script` e `path`, imposto por `validateInput`; ao contrário de
`CreateWorkflow`, não dar nenhum é legal e significa que o script da predecessora é mantido (veja
"Mantendo o script da predecessora"). Para revisar o script a forma usual é `path`: a
notificação de erro e `GetWorkflowRun` nomeiam o arquivo de script da predecessora, o modelo o
edita no lugar e devolve o mesmo caminho, então uma revisão custa um `Edit` em vez de uma segunda
cópia do script inteiro. Um script embutido ainda é aceito, inteiro, sem formato de patch, e
como em `CreateWorkflow` ele é escrito em um rascunho novo. Um workflow salvo cuja definição foi
corrigida é iniciado de novo com `CreateWorkflow` e `saved`. A saída é `CreateWorkflowOutput`,
então o rastreamento de tarefas em segundo plano do executor, o contrato `backgrounded` e o
payload de exibição são compartilhados, não copiados.

Um envio por `path` cujos bytes são iguais ao script registrado da predecessora é recusado,
`script_unchanged`, antes de qualquer janela e sem nada parado, a menos que a chamada também
defina `max_concurrency` ou `subagent_model`: uma execução com erro falharia do mesmo jeito, uma
concluída reproduziria inteira a partir do cache, e continuar uma parada é trabalho de
`ResumeWorkflowRun`. A falha nomeia o arquivo e diz para editá-lo primeiro, ou para passar as
configurações e omitir `path` quando só elas estão mudando. Só um `path` que o modelo passou é
comparado. A checagem existe para pegar um esquecimento de edição; colar um script não é esse
erro, e omitir as duas origens também não, já que isso diz com todas as letras que o script
permanece.

Os três estados de `max_concurrency` existem apenas até `resolveInput`, que os resolve em um
número simples ou em nada: a janela mostra o valor com que a nova execução vai começar, e a
porta de execução nunca vê `null`. O caminho do reajuste é a única exceção, e é de propósito:
`retuneConcurrency` aceita `number | null` e lê `null` como o paralelismo padrão, então a porta
responde com o limite que realmente aplicou em vez de a ferramenta adivinhar o número da
máquina duas vezes ("Alterando apenas o paralelismo de uma execução viva"). De qualquer jeito,
os dois caminhos concordam sobre o que a chamada pediu e diferem apenas no que fazem com isso. O
valor herdado é o `maxConcurrency` do snapshot da predecessora, que a porta só relata quando
difere do padrão, então uma predecessora que rodou no padrão não herda nada e uma que elevou
passa seu número adiante como está.

`subagent_model` tem os mesmos três estados com a mesma duração: `resolveInput` os transforma
em uma string canônica ou em nada, e a porta de execução nunca vê `null`. O valor herdado é o
`subagentModel` do snapshot da predecessora, e ele é resolvido de novo em vez de copiado, então
um modelo que foi removido ou desabilitado desde que a predecessora começou falha nesta
chamada em vez de na primeira pergunta de subagente da nova execução, onde leria como uma falha
de runtime. Essa falha diz que o modelo foi herdado e aponta para `subagent_model: null`; a
chamada não nomeou modelo algum, então o diagnóstico cru do resolvedor mandaria o modelo caçar
um argumento que ele nunca passou. Em um host sem catálogo de modelos as duas origens se
separam: uma string que o modelo passou é recusada exatamente como `CreateWorkflow` a recusa,
enquanto uma herdada passa intacta, porque já foi resolvida uma vez e falhar aqui quebraria uma
revisão que nunca mencionou um modelo.

Os nomes de modelo no script revisado ("Os modelos que o script nomeia") seguem a mesma regra
de omissão-herda, por nome. Um nome que a tabela `run-launched` da predecessora já vincula (o
`modelBindings` do snapshot) mantém esse vínculo, então uma revisão não move um nome para outro
modelo só porque o desempate do catálogo mudou desde o lançamento; sua string canônica é
resolvida de novo, como um `subagent_model` herdado, e um nome cujo modelo herdado sumiu é
diagnóstico 9011 dizendo que o vínculo foi herdado da predecessora. Um nome que a predecessora
não usou é resolvido do zero. Um reajuste não tem script e portanto não tem nomes.

### Mantendo o script da predecessora

Uma chamada que não dá nem `script` nem `path` mantém o script da predecessora. A omissão tem a
mesma duração que as omissões das duas configurações: `resolveInput` a resolve antes de
qualquer outra coisa ver a entrada. Ele lê o script registrado da predecessora através do
`getScript` da porta de execução (o `script_text` do journal, os mesmos bytes que uma retomada
reproduz), escreve-o em `script`, e define `predecessor.script_inherited`. Dali em diante a
entrada tem uma forma: hooks `PreToolUse` e regras do projeto casam com o script que vai rodar, a
janela de confirmação desenha sua linha do tempo e sua dobra de script a partir dele, e o
handler compila e envia exatamente como se o modelo o tivesse devolvido byte a byte. A flag
mora no bloco `predecessor`, que é sempre sobrescrito, então um modelo não pode alegar que a
definiu.

`getScript` é uma leitura própria e não um campo do snapshot da execução. O snapshot é
consultado pelo rastreador de tarefas em segundo plano, e o script é a maior string que a porta
tem. A checagem `script_unchanged` de uma revisão por `path` lê o mesmo membro, então há uma
única resposta para "o que esta execução está rodando".

Um script mantido ganha um arquivo como qualquer outro ("Arquivos de script"), e a regra é
sobre bytes, não sobre quem possui o caminho. Se a predecessora registrou um arquivo de script e
esse arquivo, lido agora, ainda contém exatamente o script mantido, `resolveInput` escreve o
caminho dele na entrada e a nova execução registra o mesmo arquivo: nada mudou, então continua
sendo o arquivo a editar para a próxima revisão, e uma sequência de cliques em Configure não
empilha rascunhos idênticos. Se a predecessora não registrou arquivo algum, ou o arquivo sumiu,
está ilegível ou foi editado desde então, a entrada não carrega `path` e o handler escreve o
script mantido em um rascunho novo, exatamente como para um script embutido. Um arquivo cujo
conteúdo não é o script que roda nunca é registrado na execução, já que os números de linha dos
diagnósticos e o "edite esse arquivo" apontariam para outro código. O arquivo editado em si é
deixado intacto. O Configure da GUI ("Alterando as configurações de uma execução pela GUI")
segue a mesma regra pelo mesmo código sempre que revisa; um Configure que apenas reajusta uma
execução viva não toca em script algum e não escreve rascunho nenhum.

Cada falha diz o que passar em vez. As duas primeiras vêm antes de qualquer hook ou janela, a
terceira em `prepareApproval`, ainda antes da janela:

| Caso | Resultado |
|---|---|
| o registro da predecessora não tem script (é anterior à persistência de scripts) | `workflow_amend_script_unavailable`: passe o script inteiro, como `script` ou como `path` |
| o host não tem porta de execução, ou sua porta não consegue ler scripts | `workflow_amend_script_unavailable`, com o mesmo próximo passo |
| o script herdado não compila mais contra a fachada atual | os diagnósticos, liderados por uma frase dizendo que o script era o da predecessora, herdado porque `script` e `path` foram omitidos; as linhas são ancoradas no arquivo e a nota nomeia o arquivo a editar e devolver como `path`, como para qualquer script com arquivo; nada é parado ou criado |

A frase inicial importa pelo mesmo motivo que a falha do modelo herdado acima: o modelo não
escreveu as linhas que falham nesta chamada, e sem ela leria os diagnósticos como um erro em um
argumento que nunca passou.

Uma chamada com nada além de `run_id` é permitida. Ela roda o script da predecessora de novo
sob as configurações da predecessora, com toda pergunta cacheável reproduzindo a partir da
importação. A descrição da ferramenta direciona uma execução parada para `ResumeWorkflowRun`, que
continua a mesma execução em vez de iniciar uma nova.

### Alterando apenas o paralelismo de uma execução viva

Uma chamada cujo único campo ao lado de `run_id` é `max_concurrency`, contra uma execução que o
agente ainda está rodando, não é uma revisão: reajusta essa execução onde ela está. A execução
mantém seu id, seus subagentes, suas transcrições e suas perguntas em voo; nada é parado, nada
é suplantado, nenhum cache é importado e nenhuma janela aparece. Como o novo limite prevalece
dentro do motor e do driver está em `docs/dynamic-workflow/concurrency.md`, "Retuning a live
run".

O caminho é tentado para os dois status vivos, `pending` e `running`, mas "viva" é a resposta do
agente, não a palavra de status: o serviço de execuções precisa manter a execução como uma
entrada viva com um controle ligado ao seu motor. Uma execução `running` sempre tem. Uma
`pending` cujo motor ainda não foi construído não tem, e sua chamada é respondida `not_live`
de imediato — nada fica em buffer até um motor aparecer — então ela segue o caminho de revisão
abaixo. É por isso que o popover de configurações promete a redação no lugar apenas para uma
execução em execução (`docs/dynamic-workflow/presentation.md`, "The settings popover").

O caminho é decidido em `resolveInput`, o único passo que conhece as duas metades da condição:
ele acabou de ler a predecessora para o bloco `predecessor`, então conhece o status da execução,
e acabou de resolver os três estados de `max_concurrency`, então conhece o valor. A condição é
"nada mais muda", não "só este campo foi digitado": `script`, `path`, `subagent_model` e `name`
levam a chamada ao caminho de revisão, quer o que carregarem. O handler então chama o
`retuneConcurrency` da porta de execução em vez de `port.amend`. Um host cuja porta não tem
`retuneConcurrency` não tem esse caminho de forma alguma, e toda chamada cai como a revisão que
ela teria sido antes de isso existir, com janela e tudo.

Aqui `max_concurrency` é o único lugar onde o tri-estado *não* é normalizado: a entrada
resolvida carrega o número ou `null`, e `null` viaja para a porta como ele mesmo. O
`unchanged` do próprio caminho também é levantado aqui, antes de qualquer hook, sempre que o
paralelismo padrão é legível — o valor pedido, arredondado para baixo, contra o limite já em
vigor. Onde o host não consegue nomear o padrão, `null` não pode ser transformado em número para
comparar, então essa rede deixa a chamada passar e a porta responde `unchanged` em vez disso.

| A chamada | O que acontece |
|---|---|
| apenas `max_concurrency`, execução mantida viva, valor diferente do limite em vigor | reajustada no lugar |
| apenas `max_concurrency`, execução mantida viva, mesmo valor | `unchanged`: uma falha estruturada que nomeia o limite já em vigor, levantada antes de qualquer hook ou janela; nada é escrito e nada é parado |
| apenas `max_concurrency`, execução não mantida viva (assentada, de outro processo, ou pendente sem motor ainda) | a revisão, sem mudança |
| qualquer outra coisa presente | a revisão, sem mudança |
| a execução assenta entre a checagem e a chamada | a porta responde `not_live`; o que vem depois depende de quem é dono da execução (abaixo) |

A terceira linha é alcançada de dois modos: `resolveInput` já vê um status que não é vivo, ou o
status diz vivo e a porta responde `not_live` mesmo assim. Os dois terminam no mesmo lugar,
então o resto desta seção fala de `not_live` sem distinguir.

Um reajuste não lê script algum. `getScript`, a herança de "Mantendo o script da predecessora" e
a compilação são todos pulados, porque nada novo roda: o mesmo motor continua executando o mesmo
script. Portanto duas recusas do caminho de revisão não podem alcançar esta chamada — uma
execução cujo registro é anterior à persistência de scripts
(`workflow_amend_script_unavailable`) e uma execução cujo script não compila mais contra a
fachada atual ainda são reajustáveis.

**Sem janela, para qualquer dono.** A janela existe para colocar um script diante do usuário
antes de ele rodar, e esta chamada não roda script algum: ela move um número, para cima ou para
baixo, em uma execução que já está executando código que alguém aprovou. "Revisando as execuções
desta sessão" governa apenas o caminho de revisão.

**Quando a porta diz `not_live`.** A mesma entrada agora descreve uma revisão — em geral porque
a execução assentou entre a checagem e a chamada, às vezes porque é uma execução `pending` sem
motor ainda. O handler relê a execução antes de decidir qualquer coisa, já que o bloco
`predecessor` em suas mãos ainda diz "running", e faz uma pergunta aos fatos frescos: aquela
revisia teria precisado de uma janela? A pergunta é o próprio predicado da regra da janela,
`isAmendWorkflowOwnedPredecessor` nos contratos, que o serviço de permissão também chama — uma
função só, para que "a execução própria desta sessão, não parada pelo usuário" nunca venha a
significar duas coisas:

| Situação | Resultado |
|---|---|
| o predicado vale: a execução própria desta sessão, não parada pelo usuário | o handler faz a revisão, lendo o script da predecessora e compilando-o naquele momento em vez de no passo 2, e relatando um script ausente ou que não compila como recusa própria da revisão. Nada é pulado: uma revisão da execução própria desta sessão também não abre janela |
| o predicado falha e a execução assentou | recusada, `workflow_run_settled`, nomeando a execução e dizendo para chamar de novo |
| o predicado falha e a execução ainda está `pending` ou `running`, então este agente simplesmente nunca a teve | recusada, `workflow_run_not_retunable`, com o mesmo conselho |
| a execução sumiu da porta por completo | `run_not_found`, com a redação do próprio `resolveInput`: nada foi parado ou criado, passe o id de uma execução existente ou inicie uma com `CreateWorkflow` |

As duas recusas existem por um motivo: um reajuste não mostra janela, então nada foi aprovado, e
essa aprovação de nada não pode ser esticada até uma nova execução de um script que este usuário
não leu. A segunda chamada segue o caminho de revisão desde o topo, com a janela que esse caminho
exige.

**O que volta.** A resposta nomeia uma execução, o limite agora em vigor, e que nada mais
aconteceu:

> Applied to the running run {id}; at most {n} subagents run at once. Run {id} keeps running
> under it: nothing was stopped and no new run was started.

com "at most 1 subagent runs at once" no singular, e "(the default)" acrescentado quando o valor
aplicado é o paralelismo padrão — a mesma distinção que a resposta de `CreateWorkflow` traça,
decidida a partir do `defaultConcurrency` que a porta responde em vez de um número que a
ferramenta teria de consultar duas vezes.

Essa frase é **o único fato que este caminho atravessa até o v4**. Não há payload de exibição
(nada foi compilado), e o `toolOutputSchema` do protocolo carrega `text`, `display` e
`truncated` e mais nada, então a linha da ferramenta no desktop é desenhada a partir desse texto
e da forma da entrada (`docs/dynamic-workflow/presentation.md`, "The tool row"). Mudar a
redação portanto é mudar a UI, e dois testes verbatim a fixam.

A saída também carrega um `retuned: { runId, maxConcurrency, previous, defaultConcurrency }`
estruturado — números absolutos, `maxConcurrency === defaultConcurrency` significando "esta
execução não tem limite próprio". É
um discriminador explícito e não algo que um leitor infere de "ok e nenhum `status`", o que esta
ferramenta também pode responder quando um host não tem porta de execução alguma. Isso não
atravessa o v4; serve ao CLI, à TUI, a consumidores no processo e aos testes de contrato. Nada é
posto em segundo plano: a execução já estava no rastreador de tarefas em segundo plano sob seu
próprio id e continua lá, então não há `status: "backgrounded"`, nem `backgroundTaskId`, nem
`causalityGraph`.

**As três recusas** são erros de ferramenta comuns — uma mensagem cujo primeiro token é o nome
do código, e um código de log numérico de `AMEND_WORKFLOW_ERROR_CODE` — e cada uma diz que nada
foi parado, criado ou mudado, e depois o que passar em vez:

| Código | Log | Diz |
|---|---|---|
| `workflow_retune_unchanged` | 27 | o limite já em vigor (ou que a execução não tem nenhum e roda no paralelismo padrão), e para passar um `max_concurrency` diferente, ou um script revisado se o que se queria era uma revisão |
| `workflow_run_settled` | 28 | a execução assentou antes de o novo limite poder prevalecer, e para chamar `AmendWorkflow` de novo para uma nova execução dela sob esse limite |
| `workflow_run_not_retunable` | 29 | a execução não está sendo executada por este agente, então seu paralelismo não pode ser mudado no lugar, com o mesmo próximo passo |

### Da chamada à execução

Um reajuste percorre os mesmos passos que uma revisão, com dois deles diferentes: o passo 5 não
compila nada, porque nenhum script novo vai rodar, e o passo 7 chama `retuneConcurrency` em vez
de `port.amend`. Tudo abaixo portanto descreve os dois, e nomeia o reajuste onde eles se separam.
O ciclo de vida é o de `CreateWorkflow` com duas diferenças: a leitura de disco resolve a
predecessora em vez de um arquivo salvo, e o handler pode ter de parar essa predecessora antes de
poder importar dela. Nada na execução é tocado antes de o script ter compilado e o portão ter
passado, então uma revisão negada ou que não compila deixa a predecessora rodando.

1. Validação de schema dos argumentos do modelo.
2. `resolveInput`: a única leitura antes do handler. Ele procura a execução através da porta de
   execução e reescreve a entrada com o bloco `predecessor`: seu nome, status, motivo de parada,
   e se sua sessão pai é esta sessão. Um id desconhecido é uma falha estruturada `run_not_found`
   aqui, antes de qualquer hook ou diálogo. O bloco é sempre sobrescrito, então um valor que o
   modelo forneça é inerte; o schema JSON voltado ao modelo não o lista. A mesma leitura resolve
   os três estados de `max_concurrency` contra o `maxConcurrency` do snapshot e o paralelismo
   padrão, e os três estados de `subagent_model` contra o `subagentModel` do snapshot e o
   catálogo de modelos. As duas resoluções juntas respondem "muda algo além do limite?", o que
   junto com o status decide o caminho (veja "Alterando apenas o paralelismo de uma execução
   viva"); um reajuste para aqui, carregando o limite resolvido e nenhum script. Caso contrário
   o mesmo passo resolve o script a partir de suas três origens. Um `path` é lido como
   `CreateWorkflow` o lê, e então comparado com o script da predecessora vindo do `getScript` da
   porta de execução, e `script_unchanged` é levantado quando os dois são idênticos byte a byte e
   a chamada não muda mais nada. Sem nenhuma origem o script registrado da predecessora é
   preenchido (veja "Mantendo o script da predecessora"). De qualquer jeito a entrada é
   reescrita para carregar `script`, e o `path` absoluto quando um arquivo o contém, mais o
   bloco `adjustable_settings` que `CreateWorkflow` escreve. Um reajuste não carrega bloco: não
   levanta pedido algum.
3. Hooks `PreToolUse` e regras de permissão do projeto veem a entrada resolvida.
4. A checagem de permissão. `AmendWorkflow` declara `alwaysAsk`; dentro do ramo always-ask a
   regra de propriedade pode permitir sem janela (veja "Revisando as execuções desta sessão").
5. `prepareApproval`: compila o script, passado ou herdado. Diagnósticos significam nenhuma
   janela e nenhuma parada; o modelo recebe as linhas `L{line}:C{column} {message}` exatamente
   como para `CreateWorkflow`. Um reajuste não compila nada e não levanta pedido: não há script
   na entrada, nenhum vai começar, e o portão retorna `proceed`.
6. O usuário responde, ou um hook `PermissionRequest` responde primeiro. Uma resposta de allow da
   janela pode carregar configurações ajustadas, aplicadas à entrada antes do handler exatamente
   como para `CreateWorkflow` (veja "Ajustando as configurações na janela").
7. O handler escreve um rascunho quando o script não tem arquivo (embutido, ou mantido de uma
   predecessora cujo arquivo já não o contém), e então chama `port.amend` com o script, o id da
   predecessora, `cwd`, `name` (com fallback para o da predecessora), `scriptPath`, o id da
   sessão pai e o id da chamada de ferramenta. A porta sempre recebe um script: herdar é
   trabalho da ferramenta, não do serviço de execuções. Um reajuste chama
   `retuneConcurrency({ runId, maxConcurrency })` em vez disso e termina aí; os passos 8 e 9 são
   da revisão.
8. O serviço de execuções (veja o documento do motor para a mecânica):
   1. lê a predecessora e faz a verificação prévia de seu journal para fronteiras de
      transcrição; uma execução cujas perguntas concluídas as não têm é recusada com
      `missing_boundaries` antes de qualquer coisa ser parada;
   2. cunha o novo id de execução;
   3. se a predecessora ainda estiver em voo, a cancela com o iniciador `superseded` e o novo id
      de execução, e aguarda sua promessa de assentamento (uma espera no processo sobre o estado
      terminal da própria execução, não um timeout); a predecessora assenta
      `stopped(superseded)` com `supersededBy` registrado;
   4. espera, por um intervalo delimitado, até que os turnos abortados da predecessora tenham
      terminado de escrever suas sessões; uma sessão que ainda está sendo escrita contribui com
      suas perguntas concluídas e com nenhuma das inacabadas;
   5. constrói o cache de importação a partir da predecessora agora assentada e envia a nova
      execução com `resumedFrom` definido.
9. O handler retorna `backgrounded`, dizendo ao modelo qual execução foi suplantada (quando
   alguma foi) e qual execução começou.

As recusas são falhas estruturadas cuja mensagem diz o que fazer em seguida e que nada foi
criado: `run_not_found` (também levantada no passo 2), `missing_boundaries`, e três levantadas
só no passo 2: `script_unchanged`, `workflow_script_file_unreadable` e
`workflow_amend_script_unavailable`. O caminho do reajuste acrescenta três próprias,
`workflow_retune_unchanged`, `workflow_run_settled` e `workflow_run_not_retunable`
("Alterando apenas o paralelismo de uma execução viva"), e todas as três deixam a execução
intocada como o resto. Não há
`not_amendable`: uma predecessora rodando é parada, não recusada, então a corrida entre uma
parada e a revisão que a segue não existe mais.

A resposta que o modelo lê nomeia as duas execuções: "Run A was stopped and superseded. The
revised script started as run B …", ou apenas a nova execução quando a predecessora já havia
assentado. Quando a chamada manteve o script ela diz "The script of run A started unchanged as
run B …" em vez disso, para que o modelo saiba que as configurações foram toda a mudança. Um
reajuste nomeia uma execução e nenhum sucessor ("Alterando apenas o paralelismo de uma execução
viva"), e é assim que o modelo distingue os dois desfechos sem que lhe digam qual caminho sua
chamada tomou. A notificação terminal da própria predecessora não é entregue (veja
`docs/dynamic-workflow/transcript-and-notifications.md`): o resultado da revisão é a conta que o
modelo dá daquela parada, e uma segunda mensagem dizendo "você parou a execução A, revise-a
agora" mandaria o modelo em círculos.

### O que o modelo é avisado

A descrição da ferramenta carrega o roteamento e nada mais: revise para corrigir uma execução
com erro, para estender uma concluída, para reparar uma execução que está visivelmente dando
errado enquanto roda, em uma chamada só, sem parada antes e sem esperar que ela termine, e para
mudar as configurações de uma execução sem tocar no script dela (nem `path` nem `script`);
retomar uma execução parada sem mudanças é `ResumeWorkflowRun`. Depois diz para carregar a skill
`dynamic-workflows` antes de revisar um script, e que uma chamada carregando `path` ou `script` é
recusada até que a skill tenha sido carregada enquanto uma chamada só de configurações não é.

Todo o resto que a descrição carregava é o §16.4 da skill, que o portão faz o modelo ler
primeiro: o cache (perguntas inalteradas de subagentes nomeados reproduzem a custo zero até a
primeira escrita da revisão no workspace; depois disso apenas perguntas que leram e não
executaram nada continuam reproduzindo), o fato de que um subagente nomeado cuja pergunta
inacabada a revisão não mudou retoma aquela pergunta de onde parou, e a regra de confirmação (as
execuções desta sessão começam sem janela a menos que a revisão traga um provedor novo; a execução
de outra sessão pergunta). Sua lista de campos enuncia uma regra, omita um campo e a nova
execução mantém o valor da predecessora, em
uma ordem fixa: primeiro o script (omita `path` e `script` para manter o da predecessora e mudar
apenas as configurações), depois `max_concurrency` (omitir mantém, `null` remove, um número muda,
e apenas quando o usuário pedir; uma chamada carregando nada além deste campo, em uma execução
que ainda está indo, reajusta essa execução no lugar em vez de iniciar uma nova), depois
`subagent_model` (omitir mantém, `null` devolve os subagentes ao modelo da sessão, um id de
modelo muda, `ListModels` lista os ids). Os três são enunciados juntos porque ler só um deles
convida a tomar a omissão de outro por uma remoção, e porque um modelo que acredita que o script
é obrigatório reemite milhares de tokens dele para mudar um número. Passar um script revisado é
uma origem e nunca as duas: `path` primeiro como o jeito usual (editar o arquivo de script da
execução no lugar, devolver o mesmo caminho, um arquivo inalterado é recusado com
`script_unchanged`), depois o `script` embutido para uma revisão escrita do zero, que é salva em
um rascunho para que a próxima revisão possa voltar a `path`. O §16.1 de `CreateWorkflow` diz o
mesmo pelo outro lado — quantos subagentes trabalham por vez é decisão do runtime, não do script,
e o campo nunca é reação a erros de provedor, ao qual o runtime já se adapta; os subagentes rodam
no modelo da sessão a menos que `subagent_model` diga o contrário, e o agente principal fica lá de
qualquer jeito. `GetWorkflowRun`, `ListWorkflowRuns` e as notificações de terminal apontam para a
mesma ferramenta.## A ferramenta `FillWorkflowHole`

Uma execução que chega a um buraco aberto
(`docs/dynamic-workflow/authoring.md`, "Holes") estaciona aquele galho e diz ao modelo, por uma
notificação de buraco, que há código a pagar.
`FillWorkflowHole` é como o modelo paga. Não inicia nada: a execução mantém seu id, seu journal
e seus subagentes, e cresce pelo corpo que o modelo escreveu.

### Entrada e saída

```ts
interface FillWorkflowHoleInput {
  run_id: string;    // a execução que está esperando
  hole_id: string;   // o id de site do buraco vindo da notificação, ex. `hole#21b40fca`
  script?: string;   // o corpo: os enunciados da função do buraco, embutidos
  path?: string;     // ou: um arquivo que contém esses enunciados — de modo geral o arquivo de preenchimento de uma tentativa recusada
  hole?: {           // preenchido pela ferramenta, nunca pelo modelo
    name: string;
    type: string;
    draft_path?: string;
    line?: number;
    owned_by_this_session: boolean;
  };
}
```

Exatamente um entre `script` e `path`. O corpo são **apenas os enunciados**: não a chamada
`hole(...)`, não a seta, não o script ao redor. A ferramenta os insere no script **registrado**
da execução (o script que a execução está executando, não o arquivo de rascunho em disco) como o
corpo do buraco, logo após o último argumento da chamada, e compila tudo
(`docs/analysis.md`, "Sites"; o documento do motor, "Holes"). Nada mais no script pode mudar por
meio desta ferramenta, e editar o rascunho em disco não muda nada que o preenchimento veja: uma
mudança no ponto da chamada ou em qualquer outro lugar é um `AmendWorkflow`. A saída é
`CreateWorkflowOutput` mais um bloco `fill` (`siteId`, `name`, `draftPath?`, `line?`, do buraco
resolvido, presente em todos os desfechos), então o payload de exibição do script efetivo viaja
na linha da ferramenta exatamente como no de um início, a linha pode se rotular pelo nome do
buraco sem o input do resolvedor (que nunca chega a uma linha), e o cartão da execução assume o
display mais recente para seu id de execução
(`docs/dynamic-workflow/presentation.md`, "Holes on the timeline").

| Recusa | Significado |
|---|---|
| `run_not_found` | nenhuma linha de execução |
| `hole_not_waiting` | a execução não está em voo, ou o buraco não é um daqueles em que ela espera (já preenchido, ainda não alcançado, id desconhecido); a mensagem diz qual, e para uma execução parada aponta para `ResumeWorkflowRun`, depois do qual o buraco pergunta de novo |
| `fill_unchanged` | um `path` cujos bytes são iguais à última tentativa recusada para este buraco: o esquecimento de edição, pego antes de qualquer janela |
| diagnósticos | o script efetivo não compila, ou o corpo nomeia um modelo para o qual a execução não tem vínculo (9011); veja "O arquivo de preenchimento" e "Os modelos que o script nomeia" |
| `fill_ids_unstable` | o script efetivo compilado renumerou um site existente: uma falha do host, nunca do modelo; o buraco continua esperando |

### O arquivo de preenchimento

Todo `script` embutido de preenchimento é escrito, byte a byte, em
`<cwd>/.zcode/workflow-drafts/<slug>.<hole-slug>.dwf.ts` antes do resultado da compilação ser
lido, exatamente como um script embutido é escrito em um rascunho. `<slug>` é o slug de rascunho
da execução e `<hole-slug>` o nome do buraco sob as mesmas regras de slug; `-2`, `-3`, … é
acrescentado enquanto o nome estiver tomado, então um reenvio embutido cunha um arquivo novo e
nunca sobrescreve um pelas costas do modelo. Um preenchimento por `path` edita no lugar e não
cunha nada. Nada apaga um arquivo de preenchimento.
Editar um não precisa de aprovação, já que ele fica sob o diretório de rascunhos ("Editar um
rascunho não precisa de aprovação").

Em diagnósticos, nada é inserido, nada é registrado no journal e o buraco continua esperando. A
resposta começa pelo arquivo de preenchimento: "The fill is saved at {path}. Edit that file in
place and resubmit with `path`; do not paste it inline again." Cada diagnóstico é lido como
`{path}:L{line}:C{column} {message}` ancorado **no arquivo em que ele cai**: um diagnóstico
dentro do intervalo inserido é relatado nas linhas do arquivo de preenchimento, e um fora dele
(um nome de subagente duplicado cujo outro site está no pai, 9005) nas linhas do rascunho com o
caminho do rascunho, porque é o código que ele aponta. Quando algum diagnóstico cai fora do
preenchimento, a resposta acrescenta que aquelas linhas estão no script registrado da execução, o
que o preenchimento não pode mudar e que editar o rascunho em disco também não muda, e que o
jeito de corrigi-las é `AmendWorkflow` com o script corrigido, depois do qual o buraco pergunta
de novo. O chat mostra a linha de feedback do compilador
(`docs/dynamic-workflow/presentation.md`, "Compiler feedback") abaixo da linha de preenchimento.

Um preenchimento que compila mas lança ao rodar não é mais assunto desta ferramenta: o corpo já
entrou no script efetivo, a promessa do buraco rejeita no site, e a execução termina com erro a
menos que o script capture. A notificação de erro nomeia o rascunho da execução, que agora
contém o script efetivo, para o `AmendWorkflow`.

### O rascunho depois de um preenchimento

O rascunho da execução é reescrito no lugar com o script efetivo, e o `scriptPath` da execução
continua sendo o mesmo arquivo. Esta é a única exceção a "um rascunho nunca é sobrescrito pelas
costas do modelo": o modelo pediu exatamente essa escrita, a notificação do próximo buraco aponta
para o mesmo arquivo, e o arquivo que o modelo lê para contexto é sempre o script que está
rodando. Uma execução cujo rascunho não pôde ser escrito ganha um agora, pela regra do embutido, e
o registra. O arquivo próprio de um preenchimento por `path` é deixado como está.

### Aprovação

Um preenchimento é uma revisão do script de uma execução viva sem nova execução, e é julgado
pela regra de revisão ("Revisando as execuções desta sessão"), lida a partir da sessão pai
registrada da execução: uma execução que esta sessão iniciou preenche sem janela; a execução de
outra sessão, ou uma que o usuário parou, traz a janela de confirmação, que desenha a linha do
rascunho do preenchimento (as novas estações entre suas vizinhas esmaecidas) acima do corpo
recolhido, lista os comandos `world.run` que o corpo adiciona, e oferece Allow / Always allow in
this session / Deny / Refine. O always-allow da sessão cobre preenchimentos como cobre revisas.
Regras de deny e ask do projeto casam com o script efetivo. Um corpo que não compila pula a
janela, como um script que não compila faz, e o mesmo vale para um corpo que nomeia um modelo
fora da tabela da execução.

### O que o modelo é avisado

A notificação de buraco (`docs/dynamic-workflow/transcript-and-notifications.md`, "What the
model reads") carrega a execução, o id de site, nome e tipo do buraco como escritos, o prompt
com seus valores interpolados, o caminho do rascunho e a linha do buraco nele, e os nomes das
fases antes e depois do buraco. A descrição da ferramenta diz: leia o rascunho para o contexto,
já que o corpo é compilado onde o buraco está e vê todo vínculo declarado antes dele; escreva
apenas os enunciados; retorne um valor do tipo do buraco, ou termine o corpo em um novo buraco de
cauda nomeado para o próximo passo quando a forma do workflow ainda não for conhecida (§15 da
skill, "Grow by tail holes"); ensaie lógica fixa em `EvalWorkflowSnippet` primeiro; e que um
buraco é preenchido uma vez, então um corpo sob um laço roda por iteração. A frase de retorno da
notificação diz o mesmo, então uma cadeia é uma leitura normal dela, não um truque. Em sucesso a
resposta diz que o preenchimento entrou na execução, nomeia as fases que ele adicionou, e nomeia o
rascunho como o arquivo a editar para qualquer `AmendWorkflow` posterior.

## A janela de confirmação

### Por que a janela sempre aparece

`CreateWorkflow` declara `permission.alwaysAsk: true`. O serviço de permissão checa essa flag
antes de qualquer ramo de modo, então `yolo`, `plan`, `build`, `edit` e `default` todos
perguntam. O raciocínio: um workflow é um grande bloco de execução e de chamadas de modelo que
custa dinheiro e tem efeitos reais, e para um workflow salvo o arquivo em disco pode mudar
entre duas execuções do mesmo nome, então "aprovou este nome antes" não significa "aprovou este
código".

Dentro do ramo always-ask a ordem é fixa:

| Checagem | Resultado |
|---|---|
| o modo é `auto` | deny (`mode.auto.unimplemented`) |
| a ferramenta está em `disallowedTools` | deny |
| uma regra de deny do projeto casa | deny |
| uma regra de allow da sessão casa | allow, sem evento, sem janela (`rule.session.allow`) |
| `AmendWorkflow` de uma execução que esta sessão iniciou, não parada pelo usuário, sem trazer um provedor novo | allow, sem evento, sem janela (`rule.session.workflowOwner`) |
| caso contrário | ask (`tool.alwaysAsk`) |

Regras de allow do projeto e `allowedTools` nunca são consultadas para uma ferramenta always-ask.
Um `allow` de hook `PreToolUse` não pode apagar o pedido; um `ask` de hook pode transformar
qualquer allow de sessão de volta em um ask. Um hook `PermissionRequest` ainda pode responder ao
pedido; ele corre contra o diálogo e a primeira resposta vence.

### O que a janela mostra

O cabeçalho do próprio diálogo diz "Permission required" / 「需要权限」. Abaixo dele o bloco do
workflow:

| Parte | Conteúdo |
|---|---|
| Título | "Run this workflow?" / 「运行此工作流？」 para `CreateWorkflow`, "Amend this workflow?" / 「调整此工作流？」 para `AmendWorkflow`, e então o nome do workflow e a contagem de fases ("N phases" / 「N 个阶段」). Nada mais no cabeçalho: um script que chegou à janela compilou. |
| Linha de linhagem | apenas `AmendWorkflow`: "Amends run" / 「调整 run」 mais o id da execução, "script unchanged" / 「脚本不变」 quando `predecessor.script_inherited` diz que a chamada manteve o script da predecessora, e "still running, will be stopped" / 「仍在运行，将被停止」 quando a predecessora está em voo. Com o script mantido, a linha do tempo e a dobra de script mostram o script da predecessora, que é o que vai rodar. |
| Configurações da execução | Duas linhas, "Subagents run on {model}" / 「子代理运行在 {model}」 e "At most {n} subagents at once" / 「最多 {n} 个子代理同时运行」, na ordem modelo depois limite. Quando a entrada carrega `adjustable_settings` as duas linhas são sempre desenhadas e o valor em cada uma é um controle que o usuário pode mudar antes de aprovar (veja "Ajustando as configurações na janela"): a linha do modelo mostra o modelo da sessão quando a chamada não definiu nenhum, a linha do limite mostra o paralelismo padrão quando a chamada não definiu nenhum. Quando a entrada não carrega bloco (um agente mais antigo), as linhas aparecem apenas para os campos que a chamada definiu, como texto simples, e nada é ajustável. De qualquer jeito o que está sendo aprovado é "rodar sob estas condições"; para uma revisão as linhas mostram os valores herdados também, porque `resolveInput` já os escreveu na entrada. O modelo é nomeado por seu **rótulo resolvido**, não pelo valor canônico que `resolveInput` produziu: "GLM-5.3-Flash · thinking High" / 「GLM-5.3-Flash · 思考 高」. A regra do rótulo (`describeWorkflowSubagentModel`, compartilhada com o cartão da execução e o painel da execução) é: uma família de provedor embutida mostra apenas o id do modelo, um provedor customizado mostra "{provider name}/{model id}", um provedor que a listagem de modelos da sessão não consegue resolver cai para o id do modelo, e o id do provedor nunca é mostrado, porque em um plano de equipe ele é um UUID. O valor canônico continua acessível em um tooltip, então o que será realmente usado ainda é legível. As linhas falam apenas dos subagentes: o agente principal mantém o modelo da sessão, o que quer que elas digam. Quando a entrada carrega `model_bindings` a janela não os lista: qual modelo cada subagente nomeado usa é escolha do modelo autor, escrita no script que a janela mostra, e listar cada vínculo com um controle transformaria uma decisão ("rode isto") em muitas. A linha do modelo então diz "By default, subagents run on {model}" / 「子代理默认运行在 {model}」, porque já não fala por todos os subagentes; o painel da execução nomeia o modelo próprio de cada subagente assim que a execução começa. |
| Selo de origem salva | "Saved workflow" / 「已保存的工作流」 · escopo, o nome salvo, seu caminho, e uma grade de argumentos rotulada 「实参」, quando a origem é `saved`. |
| Linha do tempo | a linha do tempo de fases construída a partir do grafo do payload de exibição (`docs/dynamic-workflow/presentation.md`). Ela é sempre aberta e não pode ser recolhida; nada nela é clicável. |
| Script | um bloco recolhível, fechado por padrão ("Show full script" / 「显示完整脚本」), um bloco de código TypeScript com números de linha dentro de uma área de rolagem com altura limitada. |
| Selo de origem | 「子智能体」 (subagent) ao lado do título quando o pedido foi espelhado de um subagente. |

Um script sem passos não tem grafo; então a linha do tempo é omitida e o script começa aberto,
porque o código é o único conteúdo. A janela não renderiza a string `reason` da ferramenta em
lugar nenhum: essa string é para logs.

Uma chamada só de concorrência em uma execução viva não levanta pedido nenhum, então nada
disso é desenhado para ela ("Alterando apenas o paralelismo de uma execução viva").

A janela lê o script e o nome da entrada da ferramenta, não do payload de exibição. É por isso
que um desktop antigo pareado com um CLI novo ainda mostra o script completo de um workflow
salvo: o canal de entrada não carrega schema, enquanto um novo campo de display seria invisível
para um cliente antigo.

### As opções

| # | Botão | Opção no fio | Efeito |
|---|---|---|---|
| 1 | "Allow" / 「允许」, descrito como 「仅允许这一次」, ou 「按调整后的设置运行一次」 / "Run once with the adjusted settings" assim que uma configuração foi mudada | `allow_once` | roda uma vez, sob as configurações ajustadas quando houver |
| 2 | "Always allow in this session" / 「本会话内始终允许」, descrito como 「本会话内运行工作流不再询问」, ou 「本次按调整后的设置运行；之后的工作流不再询问，各用各的设置」 / "This run with the adjusted settings; later runs are not asked and carry their own" assim que uma configuração foi mudada | `allowSession` | roda, sob as configurações ajustadas quando houver, e para de perguntar por esta ferramenta nesta sessão |
| 3 | "Deny" / 「拒绝」 | `deny` | negação padrão de permissão; o modelo é informado de que a execução não foi aprovada |
| 4 | a linha de feedback, placeholder "Describe how the workflow should change…" / 「描述这个工作流应该怎么改…」 | `workflowRefine` | Refine: deny mais feedback (abaixo) |

As teclas 1, 2 e 3 respondem imediatamente; 4 seleciona a linha de feedback. As setas e o Tab
movem entre os botões e a linha; Enter confirma a seleção, e Enter dentro da linha envia o
feedback. Escape apenas sai da linha. Deny nunca carrega o rascunho da linha: o rascunho pertence
ao Refine, e um deny simples é um deny simples.

### Ajustando as configurações na janela

A janela deixa o usuário mudar as duas condições às quais uma execução está presa, o modelo em
que seus subagentes rodam e quantos deles trabalham por vez, antes de aprová-la. Allow então
inicia a execução sob os valores do usuário desde sua primeira pergunta. O modelo não é
perguntado, e nenhuma segunda execução é iniciada: mudar as mesmas configurações do cartão da
execução depois do Allow pararia a execução recém-iniciada e iniciaria outra ("Alterando as
configurações de uma execução pela GUI").

**O que o agente oferece.** Quando há porta de execução, `resolveInput` escreve um bloco
`adjustable_settings` na entrada de toda chamada que pode chegar à janela:

```ts
adjustable_settings?: {
  subagent_model: boolean;       // este host consegue resolver uma escolha de modelo: tem um catálogo de modelos
  concurrency_ceiling?: number;  // o paralelismo padrão D; ausente quando a porta de execução não sabe dizer
}
```

O bloco é um fato resolvido do mesmo tipo que `predecessor` e `saved.path`: ele é sempre
sobrescrito, então um valor que o modelo forneça é inerte, e o schema JSON voltado ao modelo não
o lista. Ele viaja na entrada e não no display `create_workflow` de propósito. O conjunto de
campos do display está congelado: uma nova chave ali faz todo cliente que faz parse estrito do
display — o cartão do chat e a busca v3 legada entre eles — descartar o payload inteiro, o grafo
incluído. O canal de entrada não carrega schema em nenhuma versão. Um cliente que não conhece o
bloco o ignora e desenha as linhas simples; um agente que não o escreve recebe as linhas simples
de um cliente novo, então nenhum cliente nunca oferece uma mudança que o agente descartaria. Não
há bloco em um host sem porta de execução, onde nada vai rodar, e não há em um reajuste, que não
levanta pedido algum.

**Os controles.** Eles partem da entrada. O modelo parte de `subagent_model`, ou do modelo da
sessão quando a chamada não definiu nenhum. O limite parte de `max_concurrency`, ou do padrão
quando a chamada não definiu nenhum, ou vazio quando o padrão também é desconhecido. Ele não tem
fim superior. Quando `subagent_model` no bloco é false, a linha do modelo é uma frase em vez de
um controle ("Subagents stay on the session model · this agent has no model catalog", ou o
modelo da própria chamada quando ela definiu um) e só o limite é ajustável. Como os controles
parecem está em `docs/dynamic-workflow/presentation.md` ("The confirmation window").

**A resposta.** Allow e "Always allow in this session" carregam o que o usuário mudou no
`content` da resposta, e só o que mudou, nos próprios nomes de campo e no tri-estado da
ferramenta:

```ts
resolveInteraction.answer = {
  optionId,               // a opção de allow escolhida
  content?: {
    subagent_model?: string | null;   // canônico providerId/modelId[$level]; null = o modelo da sessão
    max_concurrency?: number | null;  // null = nenhum limite próprio da execução: o paralelismo padrão
  };
};
```

As regras são as do popover de Configure: um limite igual ao padrão é enviado como `null`, e uma
mudança apenas do nível de pensamento é uma mudança do modelo. Deny e Refine nunca carregam
`content`. As configurações pertencem à execução que Allow iniciaria, e uma negação não inicia
nada; a próxima janela do Refine chega com o que a chamada revisada do modelo carregar.

**No agente.** O broker lê `content` apenas em uma resposta de allow a `CreateWorkflow` ou
`AmendWorkflow`. Ele valida os dois campos contra seus schemas, descarta qualquer outra chave, e
entrega o resultado ao executor como o `inputAdjustments` do resultado do broker. O executor os
aplica depois da concessão de permissão e antes do handler, através do
`applyInputAdjustments` da ferramenta:

| Campo | Valor | Efeito na entrada |
|---|---|---|
| `subagent_model` | uma string | resolvida contra o catálogo de modelos exatamente como `resolveInput` resolve o campo; a string canônica que a janela envia acerta o primeiro nível. Uma falha falha a chamada do mesmo modo que um modelo irresolvível a falha em `resolveInput`, antes de qualquer coisa começar, e nomeia os candidatos |
| `subagent_model` | `null` | a chave é removida: o modelo da sessão |
| `max_concurrency` | um número | arredondado para baixo até um inteiro de pelo menos 1; sem limite superior |
| `max_concurrency` | `null` | a chave é removida: o paralelismo padrão |

Depois deste passo a entrada tem a forma que `resolveInput` produz, então o handler, a porta de
execução e o journal não precisam de nada novo: o modelo viaja no evento `run-launched` e o
limite em `dwf_run.caps`, como teriam caso o modelo os tivesse pedido. Uma ferramenta sem
`applyInputAdjustments` ignora ajustes, e um hook `PermissionRequest` que responde primeiro não
carrega nenhum.

**O que o modelo é avisado.** O bloco `tool_use` do modelo mantém os argumentos que enviou, então
o resultado precisa dizer o que realmente rodou. Logo depois do id da execução e da frase de
notificação, a resposta carrega:

> Before approving, the user adjusted the settings in the confirmation window: subagents run on
> {canonical} (the main agent stays on the session model); at most {n} subagents run at once
> (the default is {default}).

Apenas as metades mudadas aparecem. "subagents are back on the session model" e "the limit on
subagents at once is back to the default" representam os dois `null`, e o parêntese do padrão é
omitido quando o padrão é desconhecido. A frase ocupa o lugar da frase comum de configurações
para cada campo que ela nomeia; um campo que o usuário deixou quieto mantém sua frase comum. Sem
ela o modelo acredita que os valores que pediu estão em vigor e pode "corrigir" uma execução que
está fazendo o que o usuário pediu.

**A concessão de sessão.** "Always allow in this session" escreve sua regra por ferramenta como
antes, e as configurações viajam nesta única resposta. Chamadas posteriores na sessão rodam sem
janela e carregam as próprias configurações; a descrição da opção diz isso assim que um valor
tenha sido mudado. Um padrão memorizado pertence a uma configuração de subagente de todo o host,
não à concessão.

**Outros clientes.** A UI de terminal e execuções headless respondem sem janela, então não
carregam ajustes. Um desktop v3 legado vê o ask simples e responde sem `content`. O remoto do
telefone desenha a mesma janela que o desktop.

### Refine

Refine é uma negação que carrega as instruções do usuário ao modelo como uma mensagem de verdade,
para que o modelo revise e reenvie, o que abre uma nova janela. Nunca é consentimento.

1. A projeção v4 acrescenta uma opção `workflowRefine` (kind `custom` no fio) a todo ask de
   `CreateWorkflow` e `AmendWorkflow` e a nenhuma outra ferramenta. A UI a tira da lista de
   botões e a faz alvo da linha de feedback.
2. A resposta chega como `{ optionId: "workflowRefine", freeText }`. O broker mapeia um
   `freeText` não vazio para `{ decision: "deny", reason: freeText, reasonSource:
   "workflow_refine_feedback" }`. Texto vazio, ou o mesmo id de opção em outra ferramenta, é um
   deny simples.
3. O executor escreve o resultado da ferramenta como "The workflow run was not approved by the
   user." e anexa o feedback como uma entrada de usuário subsequente.
4. O runtime conduz o turno ativo com essa entrada como uma entrega `guide`, persistida como uma
   mensagem de usuário comum. O provedor vê `assistant tool_use → tool_result → user
   feedback`, nessa ordem.

Janelas sem uma opção de Refine (`SaveWorkflow`) mostram a linha de feedback genérica, cujo
texto se torna o motivo do deny.

### Always allow in this session

A opção 2 existe porque um usuário que leu e aprovou um script em uma sessão não deve ser
perguntado de novo para cada revisão dele. A concessão tem escopo de sessão e nunca é
persistida:

- A resposta da opção não carrega `permissionUpdates`. O broker sintetiza
  `sessionPermissionUpdates: [{ addRules, allow, rules: [{ toolName: "CreateWorkflow" }] }]`
  no lado da resposta; esse campo nunca atravessa o fio.
- O serviço de permissão funde isso em um conjunto de regras de sessão em memória. O armazenamento
  de permissões do projeto nunca é escrito.
- A regra é por ferramenta, não por script: todo `CreateWorkflow` posterior na sessão roda sem
  janela, sem evento de permissão. Uma janela de `AmendWorkflow` (a execução de outra sessão)
  oferece a mesma opção e escreve sua própria regra; as duas concessões são independentes.
- Uma instância de serviço de permissão é um app é uma sessão. Reiniciar o desktop, retomar a
  sessão a frio, ou `/new` começa de um conjunto de regras vazio e pergunta de novo.
- Subagentes de propósito geral e customizados compartilham o serviço de permissão do pai e
  herdam a concessão. O subagente Explore tem sua própria instância. Filhos de workflow não
  podem chamar `CreateWorkflow` de forma alguma (veja "Exceções registradas").

`SaveWorkflow` deliberadamente não tem tal opção (`askOptions.allowAlways: false`): salvar é
raro e o alvo e a decisão de sobrescrever de cada salvamento merecem uma olhada.

### Revisando as execuções desta sessão

Uma revisão de uma execução que esta sessão iniciou começa sem janela. A chave é a sessão pai
registrada da execução, não a presença de um id de execução: `ListWorkflowRuns` pode nomear
qualquer execução do projeto, inclusive as de outras sessões, então uma passagem em branco para
`AmendWorkflow` deixaria o modelo iniciar código novo arbitrário sem janela.

A regra é lida do journal, através do bloco `predecessor` que `resolveInput` preencheu:

| Predecessora | Resultado |
|---|---|
| `parent_session_id` é esta sessão, `stop_reason` não é `user`, e a revisão não traz um provedor novo | allow, `rule.session.workflowOwner`, em qualquer modo |
| `parent_session_id` é esta sessão mas a revisão traz um provedor novo | ask: outro provedor é outra conta, e só o usuário pode escolhê-la |
| `parent_session_id` é esta sessão mas o usuário a parou | ask: o usuário encerrou aquela execução de propósito, e uma revisão dela é uma nova decisão |
| a execução de outra sessão | ask |

Um "provedor novo" é `predecessor.introduces_providers`, que `resolveInput` calcula como seu
último passo, depois que os vínculos de modelo do script estão resolvidos. Ele lista, uma vez
cada e em ordem alfabética, os provedores dos modelos que a revisão vai usar (o `subagent_model`
resolvido e os valores de `model_bindings`) que não são nem o provedor do modelo da sessão nem um
provedor dos modelos sobre os quais a predecessora rodou (o `subagentModel` e o `modelBindings`
dela, de `run-launched`). A chave está presente apenas quando essa lista não é vazia. Um modelo que
a predecessora já usou foi aprovado na janela daquela própria execução, então mantê-lo, ou mover
para outro modelo sob o mesmo provedor, continua livre. O fato é calculado, nunca lido da
chamada: o schema voltado ao modelo não tem `predecessor`, então uma chamada que carrega um é
recusada antes de `resolveInput`, e um `providerId/modelId` completo escrito pelo modelo prova
apenas que o nome é inequívoco, não que o usuário o escolheu. Sem um catálogo de modelos não há
provedor de sessão para ler, então a comparação é só com a predecessora; um nome de modelo que a
chamada passa não pode ser resolvido de todo modo então, e um herdado é o próprio da predecessora.

Um início pelo hub é dono da sessão que criou, então revisá-lo a partir dessa sessão é livre. Uma
execução que foi ela mesma uma revisão é dona da sessão que revisou, então uma cadeia de revisões
continua livre. Como a regra é uma propriedade da execução e não do processo, ela sobrevive a
reinício e retomada a frio, o que a antiga tabela de linhagem em memória não fazia; não há nada
para semear e nada para revogar. Revisar uma predecessora rodando é coberto pela mesma regra: o
modelo já pode parar as execuções desta sessão com `TaskStop` sem janela, e o resultado da revisão
relata a parada.

Esta tabela é sobre revisões. Uma chamada que apenas reajusta o paralelismo de uma execução viva
nunca chega a ela, de qualquer sessão, porque não inicia nada sobre o que perguntar ("Alterando
apenas o paralelismo de uma execução viva").

Os portões do servidor (`run_not_found`, `missing_boundaries`) ainda rodam no envio; a regra
apenas remove a janela. Um `max_concurrency` diferente do da predecessora também não traz a
janela de volta, em nenhuma das direções: ele muda quantos dos subagentes do script aprovado
trabalham por vez, não o que o script faz nem o que qualquer subagente pode fazer, e uma elevação
ainda responde ao teto do governador em cada chave de provedor. Nem um `subagent_model` diferente
sob um provedor que a sessão ou a execução já usaram. Ele move os subagentes para outro modelo
que este host já tem configurado e não alarga nada sobre o que a execução pode fazer, então uma
revisão assim começa sem janela como qualquer outra revisão da execução desta sessão. Um modelo
sob um provedor que nenhum dos dois usou é a exceção na tabela acima: a janela volta, porque essa
escolha move o custo para outra conta. Uma revisão que omite `script` e `path` é
julgada do mesmo modo que uma que os passa: livre para a execução desta sessão, com janela para a
de outra, onde a linha de linhagem diz que o script está inalterado.

### Exceções registradas

Estes lugares não mostram a janela, de propósito:

| Lugar | Por quê |
|---|---|
| 「运行」 na página do hub | o usuário está olhando um workflow que salvou, preencheu seus argumentos e apertou Executar; o clique é o consentimento. O início passa por `startSavedWorkflowRun`, não pelo executor da ferramenta, então o portão da ferramenta fica intocado. |
| Apply no popover de Configure | o usuário está olhando a execução, escolheu suas novas configurações e leu o que aplicar faz; o clique é o consentimento. A mudança passa por `amendWorkflowRunSettings`, não pelo executor da ferramenta, e roda o script que o usuário já aprovou. |
| um reajuste do paralelismo de uma execução viva, de qualquer chamador | não inicia nada. Nenhum script é lido, compilado ou executado; um número se move, para cima ou para baixo, em uma execução que já está executando código aprovado ("Alterando apenas o paralelismo de uma execução viva"). |
| a UI de terminal e o `-p` headless | o usuário de terminal já está em um contexto de linha de comando; o atrito supera a proteção. O bypass mora no respondedor de permissão do cliente, não no core. |
| sessões filhas de workflow | um subagente não inicia, não revisa e não conduz execuções: esse é o trabalho do agente principal, e a janela perguntaria ao usuário sobre uma execução que ninguém na conversa propôs. `CreateWorkflow`, `AmendWorkflow`, `SaveWorkflow`, `ResumeWorkflowRun` e `ResolveWorkflowQuestion` são removidas do conjunto de ferramentas de um filho; o filho recebe um erro limpo de ferramenta não permitida. `ListSavedWorkflows`, `ListWorkflowRuns` e `GetWorkflowRun` continuam disponíveis. Os outros pedidos do subagente e suas perguntas não são isentos: eles chegam ao usuário ("Permissões dentro de uma execução"). |

### Outros clientes

| Cliente | O que ele vê |
|---|---|
| desktop, web, remoto do telefone (v4) | a janela como descrita |
| desktop v3 legado | um ask simples com apenas Allow once e Deny; o `display` e a política de opções são removidos porque os schemas antigos são estritos e descartariam o evento inteiro. O script continua na entrada. |
| bots / IM | um resumo em texto; a opção de sessão é classificada como um "sempre permitir" genérico |
| UI de terminal | nenhuma janela: auto-allow (abaixo) |
| headless | nenhuma janela: auto-allow (abaixo) |

## Permissões dentro de uma execução

Os subagentes de uma execução trabalham no modo de permissão da sessão que iniciou a execução:
Build, Edit, YOLO, Guarded ou Auto. Um subagente pergunta ao usuário sempre que o agente principal
perguntaria pela mesma chamada de ferramenta nesse modo: uma edição ou um comando em Build, um
comando perigoso em Guarded (`docs/dangerous-command-approval-v1-plan.md`), nada em YOLO. Plan
não é carregado para uma execução: uma execução sempre executa, então uma sessão em modo plan
repassa seu modo subjacente, e uma sessão antiga cujo modo ainda é o valor legado `plan` repassa
`build`.

**O modo é decidido uma vez, quando a execução é criada.** Toda maneira de uma execução começar
ou ser revisada (`CreateWorkflow`, `AmendWorkflow`, 「运行」 no hub, Apply no popover de Configure)
lê o modo da sessão que iniciou naquele momento e o registra como `subagentPermissionMode` no
evento de journal `run-launched` da execução
(`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, "Events"). A retomada lê o
valor de volta desse evento, então uma execução mantém seu modo através de um cancelamento e
retomada, de um reinício do desktop e de uma retomada a frio. Mudar o modo da sessão enquanto uma
execução está em voo não muda nada para ela, em nenhuma direção; uma revisão é uma nova execução
e toma o modo em vigor quando é feita. Uma execução sem modo registrado (registrada antes deste
campo existir, ou iniciada por um host que não relata o modo da sessão) e uma execução cujo valor
registrado não é um modo que esta versão conhece rodam ambas seus subagentes em YOLO, como todas
as execuções faziam antes. O valor não é mostrado em lugar nenhum e não faz parte de
`GetWorkflowRun`.

**Como o pedido de um subagente parece.** A sessão de um subagente não é uma sessão que o cliente
conhece, então seus pedidos de permissão saem sob o id da sessão pai, o mesmo roteamento que
subagentes comuns usam (`createChildClientPorts`). O diálogo é construído a partir da projeção ao
vivo da sessão pai, então os eventos `PermissionRequested`, `PermissionResolved` e
`PermissionDenied` do subagente também são espelhados na sessão pai (apenas notificação, nunca
armazenados duas vezes). Apenas esses eventos de interação são espelhados; a atividade de
ferramentas do subagente fica em sua própria transcrição e no cartão da execução. O pedido carrega
um `origin` de kind `subagent` com o id de sessão do subagente, e uma `description` da forma
`<name> (<siteId>@<ordinal>)`, sendo `<name>` o nome de persona do subagente, ou `subagent`
quando ele não tem um. O diálogo de permissão mostra o selo de origem com essa descrição:
"Subagent · reviewer (agent#2@1)" / 「子智能体 · reviewer (agent#2@1)」. O selo trunca uma
descrição longa e mantém o texto inteiro em seu tooltip.

O diálogo oferece o que o mesmo pedido de um subagente comum oferece. Acesso completo nunca é
oferecido no pedido de um subagente. Um comando perigoso em Guarded recebe o pedido de uso único
do Guarded, sem mudança: Allow once ou Deny, sem "sempre permitir", sem aprovação por hook, sem
regra armazenada, sem timeout. Para outros pedidos, um "sempre permitir" que escreve uma regra de
projeto cobre todos os subagentes posteriores de todas as execuções, já que cada chamada de
ferramenta relê as regras do projeto; um "sempre permitir" de escopo de sessão cobre apenas o
subagente que perguntou, porque cada subagente tem sua própria sessão. Vários subagentes podem
esperar ao mesmo tempo; cada um tem seu próprio pedido e o diálogo os trata um de cada vez. A
negação chega ao subagente como um resultado de ferramenta negado comum e o subagente continua. Um
subagente em espera mantém seu assento de concorrência, e uma espera por permissão não é uma
tentativa, então não conta para o aviso de travamento da execução. Parar a execução cancela seus
pedidos pendentes junto.

**Perguntas.** Um subagente tem `AskUserQuestion`, em qualquer modo. Sua pergunta percorre a mesma
rota que um pedido de permissão: sob o id da sessão pai, espelhada na sessão pai, com o mesmo selo
de origem, e segue as regras de pergunta do agente principal (incluindo o temporizador que fecha
uma pergunta sem resposta). As respostas voltam ao subagente como seu resultado de ferramenta.
`escalate` continua sendo o jeito de colocar uma pergunta ao agente principal; um subagente usa
`AskUserQuestion` apenas quando a decisão é do usuário. `EnterPlanMode` e `ExitPlanMode` continuam
removidos: um subagente nunca planeja para aprovação.

Execuções legadas de `/workflow` (os kinds expert e script da ferramenta `Workflow`) não são
workflows dinâmicos e mantêm filhos com YOLO forçado.

## Workflows salvos

Um workflow salvo é um arquivo. Não há índice, cache nem registro: a varredura do diretório é a
verdade, e toda operação lê o disco.

### O arquivo

```
/* zcode-workflow
description: Pre-release check for this repository: lint, tests, changelog
whenToUse: when the user asks to release / ship / do a pre-release check
args:
  target:
    type: string
    required: true
    description: package name or path to check
  skipTests:
    type: boolean
    default: false
*/

const reviewer = agent("Reviewer");
const found = await reviewer.ask<string>(`Check ${String(args.target)}`);
return found;
```

O arquivo é `<name>.dwf.ts`, TypeScript válido: um comentário de bloco `/* zcode-workflow`
carregando metadados YAML, fechado por uma linha contendo apenas `*/`, seguido do script byte a
byte. O comentário de bloco (e não uma cerca `---`) mantém os editores funcionando; YAML (e não
JSON) tolera edições manuais; `.dwf.ts` (e não `.ts`) deixa a varredura distinguir workflows de
código-fonte sem abri-los.

```ts
interface SavedWorkflowMeta {
  description: string;
  whenToUse?: string;
  args?: Record<string, { type: "string" | "number" | "boolean" | "json";
                          description?: string; required?: boolean; default?: unknown }>;
}
```

O schema de metadados é estrito, então uma chave com erro de digitação é um erro de parse
visível, não um campo descartado em silêncio. O nome é o nome do arquivo e não é repetido dentro;
renomear é `git mv`. O escopo é o diretório em que o arquivo fica e também não é armazenado.

Quatro falhas de parse têm nomes distintos, porque cada uma pede uma correção diferente:
`missing_frontmatter`, `unterminated_frontmatter`, `invalid_yaml`, `invalid_metadata`.

O corpo do script que segue o terminador é o que passa pela verificação de tipos, é executado, e
tem seu hash calculado para retomada. Os diagnósticos portanto contam linhas a partir do corpo,
não do topo do arquivo.

### Nomes e escopos

Um nome casa com `^[A-Za-z0-9_.-]+$`, tem no máximo 64 caracteres, e não é feito só de pontos.
Toda operação valida o nome antes de juntá-lo a um caminho; o padrão é a defesa contra
travessia de caminho.

| Escopo | Diretório | Visível de |
|---|---|---|
| `project` | `<cwd>/.zcode/workflows/` | deste projeto |
| `global` | `~/.zcode/workflows/` (o diretório home do processo do agente) | de todo projeto nesta máquina |

As buscas percorrem as raízes nessa ordem e o primeiro acerto vence: um workflow de projeto
esconde um global de mesmo nome. Uma busca ou listagem pode em vez disso ser direcionada a um
escopo; uma listagem direcionada não esconde nada, e é assim que o grupo global do hub mostra um
workflow global sombreado. Os arquivos `.workflow.js` da ferramenta legada `Workflow` dividem os
diretórios e são invisíveis à varredura.

### `SaveWorkflow`

```ts
interface SaveWorkflowInput {
  name: string;
  description: string;
  whenToUse?: string;
  args?: SavedWorkflowArgsDeclaration;
  script?: string;                      // apenas o corpo, sem bloco de metadados
  script_path?: string;                 // ou: o arquivo que contém o corpo (um rascunho, de modo geral)
  scope: "project" | "global";          // obrigatório, sem padrão
  run_id?: string;                      // proveniência: a execução de onde este workflow foi destilado
  // preenchido por resolveInput, nunca pelo modelo:
  path?: string;
  overwrite?: boolean;
  shadowing?: "hides_global" | "hidden_by_project";
}
```

`scope` é a decisão do modelo toda vez. A descrição do campo dá o critério: `project` quando o
script referencia arquivos, comandos, convenções ou layout deste repositório; `global` quando não
depende de nada no projeto.

`run_id` é proveniência, não origem: a execução de cujo trabalho esta definição saiu, quando o
usuário pediu para guardar um workflow que acabou de rodar. Não muda nada sobre o que é escrito —
o script ainda vem de `script` ou `script_path` — e é o único vínculo durável entre uma execução
e o workflow que um modelo destilou dela, e é isso que permite ao cartão de conclusão daquela
execução mostrar-se como salvo
(`docs/dynamic-workflow/transcript-and-notifications.md`, "Which workflow a run is saved
as"). O próprio salvamento da GUI não precisa dele: ela nomeia a execução na própria chamada.

A chamada segue o mesmo ciclo de vida de `CreateWorkflow`:

1. `validateInput`: o nome é válido, exatamente um entre `script` e `script_path` é dado (o campo
   não se chama `path` aqui só porque `path` já é o destino resolvido desta ferramenta), e um
   script embutido não começa ele mesmo com `/* zcode-workflow` (os metadados vão pelos campos;
   não há mesclagem esperta).
2. `resolveInput` lê um arquivo `script_path` e reescreve a entrada com seu corpo como `script`,
   descartando um bloco de metadados que o arquivo possa carregar (um rascunho copiado de um
   workflow salvo mantém um; os campos, e não o bloco, são o que o usuário aprova). Ele então
   calcula o caminho alvo, se um arquivo já existe lá (`overwrite`), e se o outro escopo tem um
   workflow de mesmo nome (`shadowing`). Esses são os fatos que a confirmação precisa mostrar, e
   viajam na entrada para que toda versão de cliente os veja.
3. `alwaysAsk`, e então `prepareApproval` compila o corpo com o mesmo verificador de
   `CreateWorkflow`. Diagnósticos significam nenhuma janela e nada escrito.
4. A janela: "Save this workflow to the project?" / 「把这个工作流保存到项目里？」, ou
   "Overwrite the existing saved workflow?" / 「覆盖已保存的同名工作流？」 com um selo de
   sobrescrita e uma linha de aviso; depois o nome, o caminho, `description` e `whenToUse`, uma
   tabela de argumentos (nome, tipo, obrigatório, padrão, descrição), e o script em um bloco
   recolhível fechado por padrão. Opções: Allow once e Deny, mais a linha de feedback genérica.
   Sem grafo, sem Refine, sem opção de sessão.

   A janela fica acima do compositor, e o modelo escreve a descrição, os argumentos e o
   script, então qualquer um deles pode ser longo. A janela tem no máximo o menor entre 72% da
   altura da viewport e 42rem, o mesmo teto da janela de pergunta no mesmo lugar. Ela tem
   exatamente uma área de rolagem vertical: tudo acima das opções. As opções, a linha de
   feedback e o Confirm ficam abaixo dela, atrás de um fio de cabelo, então a decisão está
   sempre na tela. A pergunta e o nome são o topo dessa área, não fixados acima dela: fixá-los
   deixava pouco espaço em uma viewport curta e exigia um segundo rolador como reserva.

   A fixação só vale em uma viewport de pelo menos 36rem de altura. A parte fixada sozinha pode
   chegar a cerca de 320px (as opções, uma caixa de feedback que cresce até 5 linhas, uma linha
   de erro e a linha do Confirm), mais que o teto em uma tela curta como um telefone deitado, onde
   a janela a cortaria e cortaria o Confirm junto. Abaixo de 36rem a janela inteira é a área de
   rolagem, e as opções rolam com o conteúdo; o teto, o fio de cabelo e cada revelação continuam
   os mesmos. De qualquer jeito há exatamente um rolador vertical.

   Nenhuma parte rola por conta própria. Um rolador dentro de outro manda um único gesto de roda
   para a caixa que estiver sob o ponteiro, e então o passa para o de fora. Partes longas são
   encurtadas por revelação, e cada revelação torna a área única mais longa:

   | Parte | Recolhida | Expandida por |
   |---|---|---|
   | `description`, `whenToUse` | as 4 primeiras linhas | 「展开」 / "Show more" sob o texto, mostrado só quando o texto está realmente cortado; 「收起」 / "Show less" o dobra de volta |
   | Argumentos | as 8 primeiras linhas | 「显示全部 N 个参数」 / "Show all N arguments" sob a tabela; 「收起参数」 / "Show fewer arguments" a dobra de volta |
   | Script | fechado | o alternador do script; ele abre embutido na altura toda (uma linha longa ainda rola de lado dentro do bloco de código) |

   O cabeçalho de coluna da tabela de argumentos gruda no topo da área de rolagem enquanto suas
   linhas passam por baixo, e nomes e padrões longos quebram em vez de alargar a tabela. Um novo
   pedido reinicia toda revelação como recolhida.

   Toda revelação é alcançável pelo teclado. A janela abre com o foco na primeira opção, e o Tab
   percorre as opções e a linha de feedback como em toda janela de permissão. Shift+Tab na
   primeira opção sai desse ciclo e cai no último controle da área de rolagem (o alternador do
   script); dali em diante Tab e Shift+Tab percorrem as revelações em ordem de leitura, e o Tab
   depois da última volta para a opção selecionada. O navegador rola a área até o controle com
   foco.
5. Allow escreve o arquivo (criando o diretório), substituindo qualquer um existente. A flag
   `overwritten` da saída é recalculada no momento da escrita, não copiada da entrada.

```ts
interface SaveWorkflowOutput {
  diagnostics; ok; response;
  name: string; scope: "project" | "global"; path: string;
  overwritten?: boolean;      // apenas quando um arquivo foi escrito
}
```

A descrição da ferramenta carrega uma regra dura para o modelo, porque tem de ser lida antes de
o modelo decidir se deve chamar sequer: nunca chamar `SaveWorkflow` por conta própria. Quando um
workflow parece reutilizável, sugira salvá-lo em uma frase e espere; chame a ferramenta apenas
depois que o usuário concordar, ou quando o usuário pediu diretamente. O formato do arquivo, as
declarações de argumentos (exatamente os valores que mudariam entre execuções), a regra de
sobrescrita e as regras de autoria são o §16.5 da skill `dynamic-workflows`, e a chamada é
recusada até que essa skill tenha sido carregada na sessão
(`docs/dynamic-workflow/authoring.md`, "The skill gate").

`SaveWorkflow` é uma escrita de escopo `workspace` e risco médio, como `Write` e `Edit`. O
cartão de chamada de ferramenta que permanece na transcrição mostra a linha de escopo
(「作用域：项目」 ou 「全局 · 对所有项目可见」) e, quando relevante, a frase de sombreamento:
「同名的全局工作流将被
这一份遮蔽」 ou 「本项目里已有同名工作流，在这里会遮蔽它」.

### `ListSavedWorkflows`

Sem entrada. Saída:

```ts
interface ListSavedWorkflowsOutput {
  workflows: { name; description; whenToUse?; args?; scope; path }[];
  invalid?: { path: string; reason: string }[];
}
```

Ele varre as duas raízes do diretório de trabalho da sessão (profundidade um, apenas `.dwf.ts`,
ordenado), aplica a regra do primeiro acerto, e nunca retorna corpos de script: uma listagem de
vinte workflows não pode despejar vinte scripts no contexto. Arquivos que não podem ser lidos ou
interpretados vão para `invalid` com seu caminho e motivo, para que o modelo possa nomear o
arquivo quebrado em vez de ele sumir. Um diretório ausente é uma lista vazia, não um erro.

A ferramenta é somente de leitura e não precisa de aprovação; os modos plan e build a permitem, e
filhos de workflow a mantêm. Sua descrição a separa de `ListWorkflowRuns`: esta lista definições
que você pode rodar, aquela lista execuções que aconteceram. O modelo é instruído a verificar
aqui antes de escrever um workflow do zero.

### Executar um workflow salvo

`CreateWorkflow { saved: { name, args?, scope? } }`:

- A busca segue a regra de escopo; `scope` a restringe a uma raiz. Um nome que não resolve em
  lugar nenhum produz um erro listando os nomes que existem, cada um marcado como `(project)` ou
  `(global)`, incluindo os globais sombreados, para que o modelo aprenda quando precisa de
  `scope: "global"`.
- Os argumentos são validados contra a declaração em uma única passagem que coleta todos os
  problemas: chaves desconhecidas (um workflow sem argumentos declarados recusa qualquer
  argumento), valores obrigatórios faltando, e incompatibilidades de tipo. `json` aceita qualquer
  coisa; `number` recusa `NaN` e infinitos. Os padrões são preenchidos e verificados quanto ao tipo
  pela mesma regra que os valores fornecidos, então uma declaração cujo padrão não casa com seu
  tipo falha no momento da chamada com uma mensagem clara.
- A entrada normalizada carrega o corpo verbatim, então a janela de confirmação, os hooks e o
  handler veem o mesmo script, e a janela parece exatamente como para um script embutido, mais o
  selo de origem salva e a grade de argumentos. O nome de exibição da execução é o nome salvo a
  menos que o modelo passe `name`.
- A bolsa de argumentos validada viaja com a execução: `submit` → config do motor → o
  `dwf_run.args_json` do journal → o sandbox, onde o script a lê como o global congelado `args`
  (`docs/dynamic-workflow/authoring.md`). O `args` de uma execução embutida é `{}`, nunca
  `undefined`. Uma execução retomada reproduz os argumentos armazenados e o limite de concorrência
  armazenado e não aceita novos; argumentos novos significam uma execução nova e uma janela nova.
- Nem o arquivo nem o diálogo de início do hub carrega um limite de concorrência ou um modelo de
  subagente. `max_concurrency` e `subagent_model` pertencem à chamada que inicia uma execução, não
  à definição: `SaveWorkflow` não armazena nenhum dos dois, então um workflow salvo roda no
  paralelismo padrão com seus subagentes no modelo da sessão a menos que a chamada
  `CreateWorkflow` que o iniciou dissesse o contrário, e uma execução iniciada com 「运行」 no hub
  toma o modelo da sessão que o hub criou para ela.

### Mudando o escopo de um workflow

As duas direções são operações diferentes, porque um workflow de projeto de modo geral referencia
seu repositório e um global por definição não referencia.

- **De global para projeto** é uma movimentação de arquivo: `workflows/move` (veja "Caminho dos
  dados") renomeia `~/.zcode/workflows/<name>.dwf.ts` para o diretório do projeto, com fallback
  para cópia e unlink entre dispositivos, byte a byte. Nunca sobrescreve; um alvo existente é
  recusado com `target_exists`. Sobrescrever é algo que só `SaveWorkflow` faz, pela sua janela.
- **De projeto para global** é a generalização do modelo ("Promover para global" no hub). Nada se
  move; o modelo lê o arquivo, extrai caminhos, comandos e convenções específicos do repositório
  para `args` ou para uma redação neutra, e salva uma nova cópia global através de
  `SaveWorkflow`, com a janela de sempre. O arquivo de origem fica intacto, então as duas cópias
  coexistem e a do projeto sombrea a global dentro daquele projeto até o usuário apagá-la.

## Arquivos de script

Todo script com que as ferramentas trabalham tem um lar em disco, e esse arquivo é o cabo que o
modelo edita entre envios. Texto embutido é apenas uma porta: no momento em que `CreateWorkflow`,
`AmendWorkflow` ou o hub recebe um script que não veio de um arquivo, eles escrevem um. Os
motivos são os três custos do reenvio embutido: um script de vinte mil tokens transmitido de
novo por causa de um ajuste de uma linha (e travado por alguns provedores), um script que a
compactação de contexto já descartou quando a execução dá erro, e uma ida e volta do compilador
que regenera o corpo inteiro em vez de editar uma linha.

### O diretório de rascunhos

`<cwd>/.zcode/workflow-drafts/`, irmão de `.zcode/workflows/` (as definições que o usuário
guarda) e `.zcode/workflow-runs/` (a entrada compilada de cada execução). Ele é criado no
primeiro uso com seu próprio `.gitignore` contendo `*`, escrito uma vez e nunca reescrito, então
rascunhos nunca aparecem no status git do projeto e o `.gitignore` do próprio projeto não é
tocado. Nada apaga um rascunho.

Um arquivo se chama `<slug>.dwf.ts`. O nome é o `name` da execução; sem ele, o primeiro literal
`phase("…")` do script (todo script precisa carregar marcadores de fase, escritos para o usuário
no idioma do usuário, então é o mais próximo de um nome); sem isso, `workflow`. A descrição de
`CreateWorkflow` pede ao modelo que sempre passe `name` para um script embutido, porque ele
rotula a execução em todo lugar e nomeia este arquivo. O slug mantém letras e dígitos Unicode mais
`_ . -` (um nome em chinês continua legível), transforma espaços em `-`, descarta todo o resto
(que é exatamente os separadores de caminho, os caracteres reservados do Windows e os
caracteres de controle), e é cortado em 64 pontos de código; `-2`, `-3`, … é acrescentado enquanto
o nome estiver tomado. O fallback próprio do rótulo da execução, a primeira linha do script, não
é usado de propósito: na prática essa linha é um banner de comentário. Todo envio embutido cunha
um arquivo novo, inclusive um que o modelo deveria ter feito por `path`: um rascunho nunca é
sobrescrito pelas costas do modelo.

| Origem | O que é escrito | Quando |
|---|---|---|
| `script` embutido | o script, byte a byte | no handler, antes do resultado da compilação ser lido, então um rascunho que falha ao compilar está em disco para edição; o handler roda para toda chamada embutida, já que um script que não compila pula a janela |
| `saved` (chamada de ferramenta ou início pelo hub) | o arquivo salvo, byte a byte, incluindo o bloco de metadados, para que `args` continuem validando no reenvio | em `resolveInput`, logo após a única leitura do arquivo salvo, então a cópia são os bytes recém-lidos e nenhuma segunda leitura pode divergir deles; o bloco `saved` normalizado registra o caminho da cópia como `draft`. A definição em si nunca é editada em nome de uma execução |
| `path` | nada; o arquivo já é a cópia de trabalho | — |

A escrita é de melhor esforço. Um diretório de projeto que não pode ser escrito (um checkout
somente leitura, `.zcode` sendo um arquivo comum) não falha a chamada: a ferramenta prossegue sem
arquivo, a resposta não carrega caminho, e a instrução antiga — corrigir o script e reenviar
embutido — é o que o modelo lê. Não há fallback para um diretório temporário, porque um rascunho
que o usuário não consegue achar no projeto não vale um caminho.

### Um rascunho embutido conta como escrito pelo modelo

`Edit` e `Write` recusam um arquivo que a sessão não leu (`FILE_NOT_READ`), porque o modelo não
pode mudar bytes que nunca viu. Um rascunho embutido é o único arquivo onde isso já está
resolvido: seus bytes são o argumento `script` da chamada que o produziu. Então o handler que
escreve um rascunho embutido o registra no estado de leitura da sessão exatamente como `Write`
registra o arquivo que escreveu (visão completa, o conteúdo, a hora de modificação e o tamanho do
arquivo), e o `Edit` que a resposta pede passa sem um `Read` de um script que o modelo acabou de
produzir. Sem isso o primeiro `Edit` depois de todo envio embutido falha, e a recuperação é um
`Read` completo do que podem ser vinte mil tokens, exatamente o custo que o arquivo existe para
evitar.

Contam apenas bytes que o modelo autorou naquela chamada:

| Rascunho | Registrado como escrito? |
|---|---|
| `script` embutido em `CreateWorkflow` / `AmendWorkflow` | sim |
| a cópia de um workflow `saved` | não; ela carrega um bloco de metadados e um corpo que o modelo talvez nunca tenha visto |
| o rascunho novo de uma revisão que manteve o script da predecessora | não; o script pode vir de outra sessão ou de antes de uma compactação |
| um início pelo hub, ou o Configure da GUI | não; nenhuma chamada de modelo o escreveu |

Todo o resto da guarda vale. Um rascunho editado por outra pessoa depois do envio tem uma hora de
modificação posterior, então o `Edit` é recusado como obsoleto e o modelo o lê primeiro. O
registro é persistido na parte da ferramenta como o de `Write`, então sobrevive a uma retomada de
sessão; a compactação de contexto o limpa junto com o resto do estado de leitura. É de melhor
esforço como o próprio rascunho: se o arquivo não puder ser inspecionado após a escrita, nada é
registrado e o primeiro `Edit` do modelo pede um `Read`, como antes.

### A origem `path`

`path` nomeia um arquivo de script, relativo ao diretório de trabalho da sessão ou absoluto.
Qualquer arquivo legível é aceito, exatamente como `Read` aceita. Um arquivo cuja primeira linha
não em branco é `/* zcode-workflow` é interpretado como um workflow salvo ("Workflows salvos"): o
bloco é removido, o corpo é o script, e o campo `args` de nível superior é validado contra a
declaração do bloco com as regras de `saved.args`. Qualquer outro arquivo é o script inteiro, e
`args` é recusado porque nada os declara. `resolveInput` lê o arquivo uma vez e reescreve a
entrada para `{ name, script, path: <absoluto>, args? }`; dali em diante hooks, janela e handler
veem os mesmos bytes que veriam para um script embutido, e uma edição no arquivo após a aprovação
não muda o que a execução executa.

O mesmo campo existe em `AmendWorkflow` (no lugar de `script`) e em `EvalWorkflowSnippet` (no
lugar de `code`, lido inteiro). Em `SaveWorkflow` ele é `script_path`, porque `path` já é o
destino resolvido daquela ferramenta; o corpo do arquivo é o que é salvo e um bloco de metadados
nele é descartado, já que os metadados vêm dos campos.

### Proveniência

Uma execução lembra o arquivo de que partiu. `scriptPath`, um caminho absoluto, viaja com os
pedidos de submit e de amend para o evento `run-launched` exatamente como `subagentModel` faz, e
é lido de volta para o snapshot e o detalhe da execução. Está ausente para uma execução cujo
rascunho não pôde ser escrito e para execuções mais antigas que este recurso. Uma execução
iniciada por `path` registra esse caminho; uma execução iniciada de um script embutido ou salvo
registra seu rascunho; uma execução revisada registra o arquivo de onde veio sua revisão. Uma
revisão que manteve o script da predecessora registra o arquivo dela quando ele ainda contém esse
script, e um rascunho novo caso contrário ("Mantendo o script da predecessora"); em nenhum caso
uma execução registra um arquivo contendo um script diferente.

Três superfícies voltadas ao modelo o leem, cada uma em palavras que tornam o próximo passo uma
edição:

- A resposta da ferramenta. Em diagnósticos: "The script is saved at {path}. Edit that file in
  place and resubmit with `path`; do not paste the script inline again." Em um início: "The
  script is saved at {path}; to revise it later, edit that file and pass `path` to
  AmendWorkflow."
- A notificação de terminal de uma execução com erro
  (`docs/dynamic-workflow/transcript-and-notifications.md`, "What the model reads").
- `GetWorkflowRun`, como o campo `scriptPath` e dentro do bloco `<amendable>`.

Um caminho é escrito relativo ao workspace quando o arquivo está sob o diretório de trabalho da
sessão, e absoluto caso contrário.

### Diagnósticos em linhas de arquivo

Quando o script tem um arquivo, cada diagnóstico é lido como
`{path}:L{line}:C{column} {message}` com `line` contado no arquivo, incluindo o bloco de
metadados, para que o número cole em um `Edit` contra esse arquivo. O payload de exibição continua
contando a partir do corpo do script, porque a transcrição mostra o corpo. Sem um arquivo (um
rascunho que a ferramenta não conseguiu escrever) a linha continua sendo
`L{line}:C{column} {message}` em linhas do corpo, como antes.

### Editar um rascunho não precisa de aprovação

Um `Edit` ou `Write` cujo alvo resolve sob `<cwd>/.zcode/workflow-drafts/` é permitido sem janela
(`PermissionService`, regra `tool.workflowDraft.preapproved`), no mesmo ponto da ordem de decisão
que as URLs pré-aprovadas de `WebFetch`: depois das regras de deny e ask do projeto, depois do
modo plan (que ainda bloqueia toda escrita), antes dos padrões de modo. O diretório é da máquina e
é ignorado, e rodar o script é controlado pela janela de confirmação independente do que o arquivo
diga. O executor da ferramenta passa o diretório de trabalho no contexto de permissão para esse
fim; um contexto sem ele não pré-aprova nada.

### O que o usuário vê

Nada de novo. A janela de confirmação, a linha da ferramenta, o cartão da execução e o painel da
execução não mostram o caminho: essas superfícies já são densas, e o caminho é o cabo do modelo,
não do usuário. Um envio por `path` não tem caneta de rascunho, já que nada é transmitido
(`docs/dynamic-workflow/presentation.md`, "The draft and the pen"); as edições do modelo aparecem
como linhas `Edit` comuns em um arquivo sob `.zcode/`.## A página do hub

O hub é onde um usuário vê, gerencia e roda workflows salvos sem uma conversa.

### Onde ele fica

A visão principal de automações tem duas abas de primeiro nível, e o título da página é o
seletor: 「自动化 / 工作流」 ("Automações / Workflows"), duas palavras do tamanho do título lado a
lado, a inativa em uma cor mais suave. As setas movem entre elas. A última escolha é guardada em
`sessionStorage` sob uma chave única de toda a aplicação, então voltar de uma página de detalhe ou
de uma conversa cai na mesma aba. Um pedido de navegação com `openAutomationTab: "workflow"`
seleciona a aba. A visão de automações, e com ela o hub, não é oferecida no shell web de
controle remoto.

Abaixo do título: um subtítulo
(「保存在已打开项目里的工作流，填好参数就能再跑一次。」), o cabeçalho de seção 「已保存的工作流」 com
a contagem total, e, à direita, um botão fantasma 「工作流设置」 (Workflow settings) seguido do
rótulo do modo atual na cor de texto terciária, e então um botão de atualizar 「刷新」 que faz cada
grupo recarregar além do seu cache. O botão de configurações abre Settings › 常规, onde mora a
linha do modo (veja "A escolha do usuário"), e está presente exatamente quando aquela linha está,
o que é sempre que o hub é mostrado, exceto por um snapshot de um Host mais antigo.

### Grupos

A lista é agrupada, e os grupos estão sempre montados para que cada um possa carregar e relatar
seu estado; um spinner cobre a página até o primeiro grupo ter carregado.

**O grupo global** vem primeiro, sempre, mesmo vazio. Seu cabeçalho: 「全局」 (Global), um selo
「对所有项目可见」 (visível de todo projeto), a contagem, e um botão 「通过对话创建」
(Criar no chat). Um grupo vazio mostra 「还没有全局工作流。适合放不依赖某个项目的
流程，例如深度调研。」 Um agente muito antigo para entender o parâmetro `scope` mostra 「当前
agent 不支持全局工作流。」; uma máquina sem agente local alcançável mostra 「无法连接本地
agent，全局工作流暂不可用。」 O botão de criar fica desabilitado com a dica 「打开一个本地项目
以运行」 quando nenhum projeto local está aberto.

**Um grupo de projeto por projeto aberto**, na ordem da barra lateral. Um projeto é uma aba de
workspace aberto que não é nem um workspace de conversa nem somente leitura; workspaces remotos
contam e são atendidos pelo próprio agente. O cabeçalho: o rótulo do projeto, um selo 「当前」
(current) no workspace ativo, a contagem, e 「通过对话创建」. Trocar o workspace ativo move o
selo; não reordena os grupos. Um grupo de projeto sem workflow válido e sem arquivo quebrado é
oculto.

Quando todo projeto aberto está vazio (o grupo global não conta), um cartão substitui os grupos:
「已打开的项目里还没有保存的工作流」, uma dica de que projetos não abertos não aparecem, e
「通过对话创建」 apontado para o projeto ativo. Sem nenhum projeto aberto a página diz
「打开一个项目以查看它的工作流。」

Um grupo com arquivos ilegíveis mostra uma faixa de aviso abaixo de sua grade: 「{count} 个文件无法
读取」 e uma linha monoespaçada por arquivo, `path — reason`. Um grupo de projeto que falhou ao
carregar mostra 「读取工作流失败：{error}」.

### Cartões

Um cartão é uma célula de altura fixa em uma grade de duas colunas:

| Parte | Conteúdo |
|---|---|
| Nome | uma linha truncada |
| Descrição | duas linhas com altura limitada |
| Última execução | 「尚未运行」 (nunca), ou 「已完成」 / 「出错」 / 「运行中」 / 「已停止」 com um tempo relativo, cada um com seu ícone e sua cor |
| Argumentos | até três chips monoespaçados de nomes de argumentos, e então `+N` |
| 「运行」 (Executar) | um botão de contorno; veja "Início direto a partir do hub" |
| menu ⋯ | 「查看详情」 (abrir), 「在对话里修订」 (revisar no chat), 「复制路径」 (copiar caminho), e então 「提升为全局」 para um workflow de projeto ou 「移到项目…」 para um global, um separador, e 「删除工作流」 em vermelho |

Clicar em qualquer outro lugar do cartão, ou Enter/Espaço, abre a página de detalhe. Cartões de
projetos remotos não têm item de escopo: uma cópia promovida aterrissaria no diretório home da
máquina remota, que o hub nunca lê.

"Última execução" é o journal de execução mais novo cujo `name` é igual ao nome do workflow. Uma
execução que o modelo iniciou sob outro `name` não pertence a nenhum workflow salvo.

### A página de detalhe

A página de detalhe substitui a lista. Seu breadcrumb é 自动化 › nome, e o crumb de seção volta
para a lista. O breadcrumb não tem nível de projeto: um projeto é um grupo na lista, não uma
página, então um crumb para ele não teria para onde levar. A página diz a qual projeto o workflow
pertence no seu cabeçalho, no lugar. Toda ação na página tem como alvo o projeto próprio do
workflow, nunca o ativo.

| Parte | Conteúdo |
|---|---|
| Cabeçalho | o nome, ao lado dele um pequeno rótulo contornado com o rótulo do projeto (「全局」 para um workflow global), a descrição, um botão primário 「运行」 e um menu ⋯ (revisar, copiar caminho, o item de escopo, apagar). O rótulo é texto simples, não um controle; um rótulo de projeto longo é cortado com reticências. |
| 「最近产物」 (artefatos mais recentes) | os chips de artefato da execução concluída mais recente que publicou algum, clicáveis para a sessão daquela execução |
| Abas | 「定义」 (definição) e 「运行历史」 (histórico de execuções, com a contagem); o caminho do arquivo com um botão de cópia à direita |
| Definição: 「基本信息」 | 「说明」 (descrição, obrigatório), 「使用时机」 (quando usar, com a ajuda 「给 ZCode 的路由提示：什么场景该选这个工作流。」), e uma tabela de 「参数」 (nome, tipo, obrigatório, padrão, descrição) com adicionar e remover. Erros de linha: 「参数需要名字」, 「参数名重复」, 「默认值与类型不符」. |
| Barra de salvar | aparece apenas quando o formulário difere do arquivo: 「放弃更改」 e 「保存元数据」. Salvar reescreve o bloco de metadados e deixa o script byte a byte (a nota diz isso: 「只改写文件顶部的元数据，脚本正文保持原样。」). |
| Definição: 「脚本」 | o script, somente leitura, com um botão de cópia e a nota 「脚本只读。要改脚本，在对话里让 ZCode 修订后另存一版。」 |
| Histórico de execuções | uma linha por execução deste nome: palavra de status, hora de início, uma coluna de projeto para workflows globais, `duration · tokens`, chips de argumento `key=value`, chips de artefato, e 「查看实例」 (abrir execução) |

「查看实例」 precisa do id de sessão pai da execução e do id de chamada de ferramenta, e para um
workflow global o projeto da execução precisa estar aberto; ele muda para essa sessão e abre o
painel da execução. A coluna de projeto mostra o rótulo do projeto aberto quando o `cwd` da
execução casa exatamente com um, e senão o nome base do diretório com o caminho completo como
tooltip, e essas linhas não podem ser abertas. Um chip de artefato, na faixa ou em uma linha do
histórico de execuções, faz a mesma troca de sessão e então abre o artefato ali, um HTML
diretamente na aba do navegador
(`docs/dynamic-workflow/authoring.md`, "How the user sees them").

Um workflow cujo arquivo desapareceu mostra 「这个工作流已不在项目里。」; outras falhas de leitura
mostram 「无法读取这个工作流：{reason}」.

### Apagando

Apagar pergunta primeiro: 「删除工作流「{name}」？」 / 「会从项目里删除 {path}。已有的运行记录会保
留。」 / 「删除」. Ele apaga apenas `<name>.dwf.ts` sob a raiz do escopo escolhido, depois de
validar o nome; os registros de execução ficam no journal. O grupo recarrega; uma página de
detalhe para esse nome volta para a lista.

### Criando e revisando no chat

「通过对话创建」 e 「在对话里修订」 iniciam uma tarefa nova no projeto do workflow com um
rascunho pré-preenchido, não com uma mensagem enviada; o usuário termina a frase:

| Ação | Rascunho (zh) |
|---|---|
| criar, projeto | 「帮我设计一个工作流，跑通后保存到本项目：」 |
| criar, global | 「帮我设计一个工作流，跑通后用 SaveWorkflow 保存为全局工作流（scope: "global"）：」 |
| revisar | 「请修订已保存的工作流「{name}」（{path}）：」, mais 「它是全局工作流，保存时保持 scope: "global"。」 para um global |

Para o grupo global, estes aterrissam no projeto local ativo, ou no primeiro projeto local.

### Promovendo para global

「提升为全局」 (cartões de projeto e páginas de detalhe, apenas projetos locais) cria uma sessão
nova naquele projeto cuja primeira mensagem de usuário é enviada imediatamente:

> Promote the saved project workflow "{name}" ({path}) to a global workflow. … 1. read the
> file and understand its structure; 2. find every reference to this repository (paths,
> commands, layout, conventions, branch names); 3. turn them into `args` declarations with
> descriptions and sensible defaults, or neutral wording, keeping the causal structure;
> 4. save with `SaveWorkflow` and `scope: "global"`, keeping or improving the name, without
> touching the original file; 5. summarize what was generalized. If the workflow is
> inherently bound to this project, explain why and stop.

A GUI então muda para a nova sessão. Apenas o nome e o caminho são enviados; o modelo lê o arquivo
ele mesmo. O salvamento ainda passa pela janela de `SaveWorkflow`, onde um workflow de projeto de
mesmo nome aparece como `hidden_by_project`. Uma criação de sessão recusada mostra 「提升失
败：{reason}」 e não deixa nada para trás.

### Movendo para um projeto

「移到项目…」 em um workflow global abre um pequeno diálogo intitulado 「移到项目」 com um seletor
de projeto (apenas projetos locais; sem nenhum aberto ele diz 「打开一个本地项目以移动」 e o
botão 「移动」 fica desabilitado). Enviar chama `workflows/move`. Sucesso mostra 「已移到
{project}」, fecha qualquer página de detalhe daquele nome e recarrega os dois grupos.
`target_exists` mostra 「目标位置已有同名工作流」; outras falhas mostram 「移动失败：{reason}」 e
mantêm o diálogo aberto.

### Caminho dos dados

O hub, e os controles de salvamento do cartão de conclusão, falam com o agente por meio de oito
métodos de protocolo de nível workspace, sem sessão.
Todos os schemas são estritos; `scope` tem como padrão `project`; para `global` o campo
`workspace` nomeia o runtime que faz o trabalho, cujo caminho não é lido.

| Método | Params | Resultado |
|---|---|---|
| `workflows/list` | `{ workspace, scope? }` | `{ workflows, invalid, dir }`; `dir` é o diretório varrido, retornado mesmo quando não existe, para que a GUI possa vigiá-lo |
| `workflows/get` | `{ workspace, name, scope? }` | `{ ok: true, name, path, scope, meta, script }` ou uma falha |
| `workflows/updateMeta` | `{ workspace, name, meta, scope? }` | `{ ok: true, path }`; relê o script e reescreve o arquivo com os novos metadados |
| `workflows/delete` | `{ workspace, name, scope? }` | `{ ok: true, path }` |
| `workflows/runs` | `{ workspace, name?, limit ≤ 50, scope? }` | `{ runs, truncated? }`; `project` filtra por `cwd`, `global` descarta o filtro e acrescenta `cwd` a cada linha; as linhas carregam `runId, name?, status, stopReason?, createdAt, updatedAt, spentTokens, parentSessionId?, toolCallId?, args?, cwd?, artifacts?` (no máximo 8) |
| `workflows/move` | `{ workspace, name }` | `{ ok: true, from, to }` ou `{ ok: false, reason: invalid_name \| not_found \| target_exists \| read_error \| write_error, path?, detail? }` |
| `workflows/save` | `{ workspace, runId, name, meta, scope?, overwrite? }` | `{ ok: true, name, scope, path, overwritten, shadowing? }` ou `{ ok: false, reason: invalid_name \| run_not_found \| script_missing \| target_exists \| compile_failed \| write_error, path?, detail? }` |
| `workflows/forRun` | `{ workspace, runId, candidates? }` | `{ entry?, match?: candidate \| script \| name, runArgs? }` |

As falhas de `get`, `updateMeta` e `delete` compartilham uma forma:
`{ ok: false, reason: "invalid_name" | "not_found" | "parse_error" | "read_error", detail? }`. Os
handlers usam o mesmo armazenamento e codec que as ferramentas do modelo; a GUI nunca faz parse
de um bloco de metadados ela mesma. `workflows/list` sempre passa um escopo direcionado, então o
grupo de projeto nunca vaza entradas globais e o grupo global nunca perde uma sombreada. Um
journal sem suporte a introspecção responde `workflows/runs` com uma página vazia.

**Salvando uma execução, pela GUI.** `workflows/save` é o caminho verbatim do cartão de conclusão
(`docs/dynamic-workflow/transcript-and-notifications.md`, "The popover"). Ele pega uma execução,
não um script: o script que escreve é o que aquela execução de fato executou, lido do registro do
journal (`scriptText`), então uma execução revisada salva o script que a assentou e uma
transcrição cujo input de ferramenta foi aparado salva os mesmos bytes que uma que não foi. O
handler valida o nome, recusa um alvo que existe a menos que `overwrite` diga que o usuário viu o
aviso, compila o corpo com o mesmo verificador que `SaveWorkflow` usa, e escreve pelo mesmo
armazenamento; `overwritten` é recalculado no momento da escrita e `shadowing` é computado como é
para a ferramenta. Uma execução que o journal não conhece é `run_not_found`; um registro de antes
de os scripts serem armazenados é `script_missing`; diagnósticos voltam como `compile_failed`
com uma mensagem delimitada e nada é escrito. A chamada carrega o workspace próprio da execução
para os dois escopos, porque o journal que ela lê mora ali.

`workflows/forRun` responde "qual workflow salvo é esta execução" para o mesmo cartão, na ordem
das três regras que aquela especificação dá, e retorna a entrada resolvida, a regra que casou, e
os argumentos armazenados da execução para o diálogo de início. Ambos são recusados por um agente
que os antecede com um método-não-encontrado, que é o que o cartão lê como "este agente não pode
salvar diretamente".

**Portador para chamadas globais.** Uma chamada global vinda da camada de serviços sem workspace
escolhe o primeiro runtime local ativo reutilizável, senão o runtime do workspace de gerenciamento
de plugins; nunca um remoto, então `~` é o diretório home desta máquina.

**Frescor.** Cada grupo de projeto vigia `<project>/.zcode/workflows` e o grupo global vigia o
`dir` que lhe disseram, não recursivamente, e recarrega 300 ms depois de uma mudança; um
salvamento vindo de uma conversa portanto aparece sozinho. Registros de execução não são
arquivos: o hub os relê ao carregar e ao atualizar, e não mostra progresso ao vivo; a conversa e a
ilha de tarefas fazem isso.

**Cache.** Um shard de armazenamento por grupo (`"global"` ou a chave do workspace) guarda
entradas, arquivos ruins, as 50 execuções mais recentes daquele escopo, `dir`, e estado de
carregamento e erro. `list` e `runs` são buscados em paralelo; uma chamada `runs` que falha é
registrada e tratada como vazia para que a lista ainda seja desenhada. Requisições em voo são
deduplicadas a menos que o chamador contorne o cache.

## Início direto a partir do hub

「运行」 inicia o workflow salvo em uma sessão nova, sem turno de modelo e sem janela de
confirmação. O modelo só fica sabendo da execução quando sua notificação de conclusão ou de
pergunta chega.

### O diálogo de início

Um workflow de projeto sem argumentos declarados começa imediatamente no clique; uma falha
aparece como um toast. Um workflow de projeto com argumentos, e todo workflow global (ele
precisa de um projeto alvo), abrem o diálogo:

| Parte | Conteúdo |
|---|---|
| Cabeçalho | um ícone de workflow, o nome em monoespaçado, um selo de escopo 「全局」 / 「项目」, e a descrição |
| 「运行于」 (Rodar em) | apenas workflows globais: um seletor sobre os projetos locais abertos, com padrão o ativo. Sem nenhum aberto o seletor é substituído por 「打开一个本地项目以运行」 e Executar fica desabilitado. |
| Argumentos | um campo por declaração: um switch para `boolean`, um textarea monoespaçado para `json`, uma entrada de número para `number`, uma entrada de texto caso contrário; um selo 「必填」 (obrigatório); a descrição. Erros abaixo do campo: 「必填」, 「需要一个数字」, 「不是合法的 JSON」. Campos opcionais em branco são omitidos; campos obrigatórios em branco sem padrão falham. |
| Nota | 「将立即在 {project} 的新会话中运行」 |
| Rodapé | 「取消」 e 「运行」, o último mostrando um spinner enquanto pendente |
| Área de erro | aparece quando o início é recusado: o texto do motivo, e então a mensagem do agente em um bloco monoespaçado (para `compile_failed`, os diagnósticos) |

O diálogo tem a altura do seu conteúdo, até o menor entre a altura da viewport menos uma margem
de 1rem de cada lado e 45rem. Uma declaração pode trazer qualquer número de argumentos, então o
diálogo é disposto em três zonas e só a do meio rola:

| Zona | Partes | Comportamento |
|---|---|---|
| Topo | Cabeçalho | fixo |
| Meio | 「运行于」 e os campos de argumento | rola por conta própria assim que o conteúdo passa do teto de altura. Com três linhas ou mais (「运行于」 conta como uma) ele não encolhe abaixo de 6rem; com menos, não encolhe de todo, já que o conteúdo dele já é mais curto que uma área de rolagem útil. |
| Baixo | Nota, área de erro, rodapé | fixo, então a consequência do clique, o resultado da última tentativa e os botões estão sempre na tela. O bloco da mensagem do agente rola dentro da área de erro depois de 10rem. |

Quando as zonas fixas sozinhas deixam menos que o mínimo da zona do meio (uma viewport muito
curta), o diálogo inteiro rola, então cada parte continua alcançável.

Um envio que falha na validação rola o primeiro campo que falhou para a vista e move o foco para
ele: com uma lista longa o campo e seu erro podem estar longe da parte visível da lista, e um
clique que não muda nada na tela parece um botão morto.

### O lançador

O lançador roda uma vez por vez:

1. Adquire uma concessão de conexão no agente do projeto alvo.
2. `createSession { workspaceId }`, sem primeira entrada e sem config: a sessão toma o modelo e o
   modo padrão do runtime. Se isso for recusado, relata um erro genérico; nenhuma sessão existe.
3. `startSavedWorkflow { name, scope, args? }` na nova sessão (`args` omitido quando vazio).
4. Aceito: navega para a nova sessão, onde o cartão da execução já está no topo.
   Recusado ou lançado: apaga a sessão vazia, mostra o erro no diálogo (ou como toast no caminho
   sem diálogo), e fica no hub. A transcrição portanto só contém execuções que realmente
   começaram.
5. Libera a concessão.

Recusas são mapeadas para texto pelo seu código de falha:
`fault.command.capabilityUnsupported` → 「当前
agent 不支持直接启动工作流」; `fault.command.savedWorkflowStartRejected.<reason>` →
「工作流名无效」 (`invalid_name`), 「找不到这个工作流」 (`not_found`), 「部分实参不合法」
(`invalid_args`), 「工作流脚本编译失败」 (`compile_failed`), 「会话忙，请重试」
(`session_busy`), 「工作流启动失败」 (`start_failed`); qualquer outra → 「工作流启动失败」.

### No agente

`startSavedWorkflow` é um comando de sessão v4 com payload `{ name, scope?, args? }` e um
resultado aceito `{ type: "startSavedWorkflow", runId, toolCallId }`. Não precisa de revisão base.
O app registra a capacidade apenas quando a porta de execução existe; caso contrário o cliente
recebe a falha de capacidade não suportada. O método de runtime `startSavedWorkflowRun` faz o
trabalho, nesta ordem:

| Passo | Em falha |
|---|---|
| A sessão tem um turno ativo ou na fila | `session_busy` |
| Resolve o workflow salvo (direcionado por `scope` quando dado) e valida os argumentos; este é o mesmo código que `CreateWorkflow` usa, não uma cópia | `invalid_name`, `not_found` (um arquivo malformado é relatado como `not_found` com uma mensagem que nomeia o arquivo), `invalid_args` |
| Compila; qualquer diagnóstico recusa | `compile_failed`, diagnósticos na mensagem, limitados a 2.000 caracteres |
| Resolve os nomes de modelo que o script usa ("Os modelos que o script nomeia") com o mesmo código que `CreateWorkflow` usa; um nome não resolvido é um diagnóstico 9011 e recusa como um | `compile_failed` |
| A porta de execução está presente | `start_failed` |
| Persiste a sessão com o nome do workflow como seu título. O registro de sessão do protocolo espelha o fato persistido do runtime no próximo evento de sessão, então a nova sessão deixa o estado de rascunho e entra em `session/list` e no índice de sessões (a barra lateral) sem um primeiro prompt | |
| Cunha `toolCallId = launch-<uuid>` e `port.submit({ scriptText, cwd, name, args, modelBindings?, parentSessionId, toolCallId, trace })` | `start_failed`; a sessão vazia persistida é o que a GUI apaga |
| Registra o turno de início (abaixo) e registra a execução no rastreador de tarefas em segundo plano com uma chamada de ferramenta `CreateWorkflow` sintética `{ id: toolCallId, name: "CreateWorkflow", input: { name, saved: { name, scope, args? } } }` | apenas registrado; a execução já está em voo e pode ser cancelada do painel |

Até a compilação inclusive nada é persistido. A chamada de ferramenta sintética é o que permite
que notificações, cancelamento, retomada e o painel da execução tratem uma execução iniciada
exatamente como uma iniciada por ferramenta; apenas o prefixo `launch-` e a origem do turno as
distingue.

### O turno de início

O início é registrado como um turno só de controle segurando uma mensagem visível ao usuário, de
role `user` (fonte sintética `workflow_launch`, semântica `real_user`) cujo texto é para o modelo:

> Started the saved workflow "{name}" ({scope}) from the workflows hub as run {runId}.
> Arguments: ```json …``` Progress and results arrive as background notifications; do not
> start it again.

O turno e a mensagem carregam os metadados de início, então a projeção ao vivo e a restauração a
frio produzem as mesmas linhas:

```ts
interface WorkflowLaunchMeta {
  runId; toolCallId; name; scope: "project" | "global"; path;
  args?: Record<string, unknown>;   // substituído por um placeholder acima de 4 KB
  description?: string;             // ≤ 500 caracteres
  display?: CreateWorkflowDisplay;  // o grafo compilado, a mesma forma que o da linha da ferramenta
  script?: string;                  // ≤ 256.000 caracteres
}
```

O `display` é construído pela mesma função que constrói o display da linha da ferramenta
`CreateWorkflow` e o da janela de confirmação, a partir das mesmas três projeções de análise
(sites e pistas, vocabulário de fases, cartões de subagentes e hand-offs). Não há uma segunda
montagem do grafo em lugar nenhum; o grafo de um início é byte a byte o que o caminho pela
ferramenta teria produzido.

Na transcrição o turno de início **é um cartão de execução**: o mesmo `WorkflowRunDigest` que uma
linha de `CreateWorkflow` recebe, com a linha do tempo, as pílulas de subagentes, o chip de
perguntas, Cancelar e `⤢` (`docs/dynamic-workflow/presentation.md`「The run card」). O turno não
tem balão de usuário: a linha de usuário do início é marcada `origin: "workflowLaunch"`, e um
turno cujo cabeçalho carrega os metadados de início não conta essa linha como uma entrada visível
(a frase canônica é para o modelo). Um turno cujos metadados estão faltando nas duas linhas (um
cliente mais antigo) degrada para a frase em um balão. Quando a execução não está mais na
projeção de oito execuções, o cartão é o cartão neutro só com cabeçalho, "Workflow ended" /
「工作流已结束」, nunca em branco.

Concluir o turno de início também tira uma sessão nova da fase `draft` da projeção (para
`completedSuccess`, ou `error` se o turno só de controle falhou). Um rascunho é por definição uma
sessão que nunca teve conteúdo persistido; uma sessão com um turno de início tem, e o armazém a
semeia com uma fase terminal depois de um reinício. Sem isso o índice de sessões ao vivo carregaria
um resumo `draft` que o sincronizador de índice de tarefas descarta, e a sessão apareceria na
barra lateral só depois de um reinício. Um turno só de controle em uma sessão que já saiu do
rascunho deixa sua fase intacta.

Os fatos de início que uma execução iniciada por ferramenta não tem são mostrados no **painel da
execução** como um bloco de proveniência sob o cabeçalho de status, apenas para execuções
iniciadas diretamente: 「由你从工作流中
枢启动 · {time}」 (iniciado por você a partir do hub de workflows) com o selo de escopo 「项目」 /
「全局」, a descrição quando presente, e uma tabela chave/valor dos argumentos.

O painel encontra o grafo pelo id da chamada de ferramenta de origem da execução; para um início
direto não há linha `CreateWorkflow`, então a mesma tabela de busca o tira do `display` dos
metadados de início (`docs/dynamic-workflow/presentation.md`).

## Alterando as configurações de uma execução pela GUI

O cartão da execução e o painel da execução carregam um botão **Configure**. Ele muda as duas
configurações que um usuário define em uma execução, o modelo em que seus subagentes rodam e
quantos deles trabalham por vez, sem um turno de modelo. Tem dois desfechos, e qual deles Apply
toma é decidido pelo que o usuário mudou:

| O que Apply carrega | Desfecho |
|---|---|
| apenas `maxConcurrency`, em uma execução que o agente mantém viva (sempre uma em execução; uma pendente só quando seu motor existir) | a execução é **reajustada no lugar**: mesmo id de execução, nenhuma execução nova, nada parado, o trabalho concluído e o trabalho em voo tudo preservado |
| qualquer outra coisa: uma mudança de modelo, qualquer uma das duas mudanças em uma execução que assentou, as duas ao mesmo tempo | uma **revisão que mantém o script**: o agente inicia uma nova execução do script registrado da execução sob as novas configurações, importa tudo o que a execução antiga terminou como cache, e suplanta a execução antiga, como uma chamada de `AmendWorkflow` que omite `script` e `path` faria |

O popover diz qual dos dois aplicar vai fazer antes de o usuário aplicar. O caminho é o mesmo que
a ferramenta segue para a mesma mudança, pelo mesmo método de porta, então um usuário e um modelo
pedindo a mesma coisa recebem a mesma coisa
(`docs/dynamic-workflow/concurrency.md`, "Retuning a live run"). Como o botão, o popover e a
transcrição ficam é descrito em `docs/dynamic-workflow/presentation.md` ("The settings
popover").

### Quais execuções podem ser configuradas

| Execução | Configure | Por quê |
|---|---|---|
| pendente ou rodando | sim | o caso principal: estrangular a execução, o que é aplicado no lugar, ou mover seus subagentes para outro modelo, o que é uma revisão |
| parada e retomável | sim | uma retomada com configurações alteradas; apenas Resume mantém a mesma execução |
| com erro | sim | uma nova tentativa sob outro modelo é o conserto usual |
| parada por uma revisão (suplantada) | não | sua sucessora é a execução viva e carrega o botão |
| concluída | não | toda pergunta reproduziria do cache, então nada rodaria sob as novas configurações |
| fora da projeção de execuções | não | o painel não tem configurações para mostrar |

O botão precisa de um callback de host, como Resume: uma sessão somente leitura e um host com o
release cinza desligado (veja "Release cinza: a chave de recurso `dynamicWorkflow`") não recebem
nenhum. Um agente sem o comando responde `fault.command.capabilityUnsupported`, que o popover
mostra como uma recusa.

### O comando

`amendWorkflowRunSettings` é um comando de sessão v4 enviado à sessão que é dona da execução. Não
carrega revisão base, como `cancelBackgroundWork` e `resumeWorkflowRun`.

```ts
interface AmendWorkflowRunSettingsPayload {
  workId: string;                    // ≡ runId, como em cancel e resume
  subagentModel?: string | null;     // omitir = manter; null = voltar ao modelo da sessão; "providerId/modelId[$level]" = definir
  maxConcurrency?: number | null;    // omitir = manter; null = voltar ao paralelismo padrão; n = definir (arredondado para baixo até pelo menos 1, sem limite superior)
}
// aceito: { type: "amendWorkflowRunSettings", runId, toolCallId, supersededRunId? }
// recusado: fault.command.workflowRunSettingsRejected.<reason>, com uma mensagem
```

Os dois campos seguem a regra da ferramenta, omitir significa manter, então o popover envia
apenas o que o usuário mudou. `runId` e `toolCallId` no resultado aceito nomeiam a nova execução;
`supersededRunId` está presente quando a execução antiga ainda estava em voo e foi parada.

Um resultado aceito significa o outro desfecho: um reajuste responde com o **mesmo** `runId` que o
payload carregava e sem `supersededRunId`, já que nada foi iniciado e nada foi parado. É assim
que o cliente distingue um reajuste de uma revisão sem um segundo campo para isso — uma resposta
que nomeia um id de execução que o chamador não enviou é uma execução nova.

| Motivo | Quando | Linha do popover |
|---|---|---|
| `not_found` | nenhuma execução com este id pertence a esta sessão | "This run is not in this conversation's records." |
| `not_configurable` | a execução concluiu, ou uma revisão já a substituiu | "This run can no longer be configured." |
| `unchanged` | depois da resolução, nenhuma configuração difere da própria execução | "These are the run's current settings." |
| `script_missing` | a execução não tem script armazenado, ou o host não consegue lê-lo | "This run has no stored script, so its settings cannot be changed here." Apenas a revisão lê um script, então uma execução viva sem script armazenado ainda pode ter seu paralelismo reajustado |
| `model_unavailable` | o modelo não pode ser resolvido contra o catálogo de modelos deste agente | "That model is not available on this agent now." |
| `compile_failed` | o script armazenado não compila mais contra a fachada atual | a redação da retomada: peça ao agente que revise o workflow; os diagnósticos abaixo dela |
| `missing_boundaries` | o journal da execução não tem as fronteiras de transcrição que o cache precisa | "This run's records are too old to carry its finished work over." |
| `start_failed` | a porta está ausente ou a revisão lançou | "The new run could not be started ({message})." |

Nada é parado ou criado antes de todas as checagens passarem. A execução antiga continua rodando
através de qualquer recusa.

### No agente

`amendWorkflowRunSettings` no app delega ao método de runtime de mesmo nome. Ele é o segundo
chamador tanto de `port.retuneConcurrency` quanto de `port.amend`, ao lado do handler da
ferramenta, e compartilha o código de resolução da ferramenta em vez de copiá-lo:

| Passo | Em falha |
|---|---|
| Ler a execução com `port.getTask`; ela deve existir e sua sessão pai deve ser esta sessão | `not_found` |
| Uma execução concluída, ou uma com `supersededBy`, é recusada | `not_configurable` |
| Resolver `subagentModel` com a regra de tri-estado da ferramenta contra o modelo do snapshot e o catálogo de modelos (`resolveAmendSubagentModelChoice`) | `model_unavailable` |
| Resolver `maxConcurrency` com a regra de tri-estado da ferramenta contra o limite do snapshot e o paralelismo padrão (`resolveAmendMaxConcurrency`); um valor igual ao padrão conta como nenhum limite | |
| Comparar com as configurações próprias da execução; se nada mudou, recusar | `unchanged` |
| **A bifurcação.** Só o limite mudou → `port.retuneConcurrency({ runId, maxConcurrency })`, o `null` do popover viajando como ele mesmo: em `ok` cunhar `toolCallId = settings-<uuid>`, enfileirar o turno de configurações a partir do `previous`, `maxConcurrency` e `defaultConcurrency` da resposta, e responder com o mesmo `runId` e sem `supersededRunId`, registrando nada novo no rastreador de tarefas em segundo plano; em `unchanged` recusar; em `not_live` (assentada, ou pendente sem motor ainda) seguir em diante por esta tabela | `unchanged` |
| Ler o script armazenado com `port.getScript` | `script_missing` |
| Compilar o script (`analyzeScript`) | `compile_failed` |
| Revincular os nomes de modelo do script a partir do `modelBindings` do snapshot ("Os modelos que o script nomeia"): o script é o próprio da execução, então cada nome que ele usa foi vinculado no lançamento e mantém esse vínculo, resolvido de novo contra o catálogo | `model_unavailable` |
| Cunhar `toolCallId = settings-<uuid>` e chamar `port.amend` com o script, o id da predecessora, `cwd`, as configurações resolvidas, os vínculos de modelo, as tabelas de fases do novo script, o id da sessão pai, o id da chamada de ferramenta e `inheritArgs: true` | `missing_boundaries`, `not_found`; um lançamento é `start_failed` |
| Registrar a nova execução no rastreador de tarefas em segundo plano com uma chamada de ferramenta `AmendWorkflow` sintética `{ id: toolCallId, name: "AmendWorkflow", input: { run_id, name } }` | apenas registrado |
| Enfileirar o turno de configurações (abaixo) e retornar o resultado aceito | apenas registrado |

A leitura do script foi movida para abaixo da bifurcação de propósito: um reajuste não roda
script algum, então uma execução cujo registro não tem um, ou cujo script não compila mais, ainda
é reajustável. A resolução do modelo fica acima dela, porque "mudou algo além do limite?" não pode
ser respondido até que os três estados do modelo tenham sido resolvidos em um valor a comparar.

`inheritArgs` dá à nova execução os argumentos com que sua predecessora foi iniciada
(`dwf_run.args_json`). O script é o próprio da predecessora, então os argumentos que ele lê ainda
se aplicam; um workflow salvo iniciado a partir do hub com argumentos de outro modo rodaria de
novo com um `args` vazio. O caminho da ferramenta não passa esse valor. Um reajuste não passa nada
semelhante: a execução mantém os argumentos com que vem rodando, porque é a mesma execução.

O modelo não é perguntado e nenhuma janela abre em nenhum dos ramos. A revisão de uma execução rodando
a para com o iniciador `superseded`, então sua própria notificação terminal não é entregue, como
em uma revisão por ferramenta; um reajuste não para nada, então não há notificação para suprimir.

### O turno de configurações

A mudança é registrada como um turno só de controle, a mesma forma que o turno de início do hub:
uma mensagem visível ao usuário, de role `user`, com fonte `workflow_launch`, cujo texto é para o
modelo, e os metadados de início no turno e na mensagem. Os metadados carregam um bloco `amend`
que diz o que mudou:

```ts
interface WorkflowLaunchMeta {
  runId; toolCallId;                 // a nova execução; em um reajuste, a execução que foi reajustada
  name?;                             // sempre em um início pelo hub; em um turno de configurações apenas quando a execução tem nome
  scope?; path?; args?; description?; // apenas inícios pelo hub
  display?: CreateWorkflowDisplay;   // o grafo compilado do script, como em um início
  amend?: {
    predecessorRunId?: string;                       // ausente em um reajuste: não há predecessora, a execução é a mesma
    subagentModel?: { from?: string; to?: string };  // presente quando o modelo mudou; fim ausente = o modelo da sessão
    maxConcurrency?: { from?: number; to?: number }; // presente quando o limite mudou; fim ausente = o paralelismo padrão
    ceiling?: number;                                // o paralelismo padrão D (o nome no fio o precede), para "默认 13 → 4"
  };
}
```

Um reajuste escreve o mesmo bloco com `predecessorRunId` de fora, e sua ausência é o que diz
"aplicado no lugar": `runId` é a execução que o usuário já estava olhando, `maxConcurrency` é o
movimento, e não há segunda execução para o leitor reconciliar. `display` está ausente também,
já que um reajuste não compila nada, e o turno desenha sua linha e nenhum cartão
(`docs/dynamic-workflow/presentation.md`, "The run card"): o cartão daquela execução já está na
transcrição onde foi iniciado, e um segundo para a mesma execução viva seria uma duplicata, não
um registro.

Tornar `predecessorRunId` opcional é um desvio de schema registrado, do mesmo escalão que `scope`
e `path` neste metadado: um consumidor velho o bastante para exigi-lo falha ao fazer parse do turno
de configurações e descarta aquela linha, enquanto todas as outras linhas e a própria execução não
são afetadas. A revisão continua o enviando, então só o turno no lugar fica exposto, e o que se
perde ali é o registro de uma mudança, não a mudança.

Um turno de configurações toma o nome da execução que ele muda. Uma execução sem nome dá um turno
de configurações sem nome, e o cartão, o painel e a notificação a mostram sob a mesma palavra de
fallback que qualquer execução sem nome; o agente nunca inventa um nome a partir do id de
execução. A chamada sintética de `AmendWorkflow` carrega `name` sob a mesma regra.

O texto da mensagem nomeia a execução antiga, o que mudou e a nova execução:

> Changed the settings of workflow run {A} ("{name}") from the GUI: its subagents now run on
> {model}; at most {n} of them run at once. The same script continues as run {B}, which supersedes
> run {A} and imports everything run {A} finished as cache. Progress and results arrive as
> background notifications; do not amend, resume or restart it.

Apenas as configurações mudadas aparecem; "its subagents are back on the session model" e "the
limit on subagents at once is removed" representam os dois `null`. Quando a execução {A} já havia
assentado, "supersedes" é lido como "takes over from". O modelo é nomeado por sua string canônica,
e o nome entre aspas fica de fora para uma execução sem nome.

O texto de um reajuste diz que a execução continuou, porque a frase acima mandaria o modelo caçar
uma execução {B} que não existe:

> Changed the settings of workflow run {A} ("{name}") from the GUI: at most {n} of its
> subagents run at once. Run {A} keeps running under the new limit; nothing was stopped and no
> new run was started. Progress and results arrive as background notifications; do not amend,
> resume or restart it.

"the limit on subagents at once is removed" representa o `null` aqui também, e a instrução de
fechamento é a mesma que todo turno de início carrega, pelo mesmo motivo: a execução está em
segundo plano e o modelo não deve consultá-la.

Uma revisão marca sua predecessora como suplantada só quando teve de pará-la. Uma execução parada
ou com erro que é configurada mantém seu próprio assentamento, então seu cartão ainda oferece
Resume e Configure ao lado do cartão da nova execução, exatamente como depois de uma chamada de
`AmendWorkflow` em uma execução assentada.

O turno não é emitido dentro do handler do comando. Ele é enfileirado na fila de comandos do
runtime como um comando `control-only-turn`, que roda o mesmo `emitControlOnlyUserTurn` que o
início usa. Quando a sessão está ociosa a fila o roda de imediato. Quando o agente principal está
no meio de um turno ele espera até esse turno terminar, porque uma mensagem de usuário não pode
entrar em um turno em andamento; a mudança em si já aconteceu, e o painel da execução mostra a
nova execução nesse meio-tempo. O comando tem a prioridade das notificações em segundo plano,
então aterrissa antes de qualquer notificação da nova execução. Como elas, carrega a geração do
ramo, e um rewind o descarta. A fila está em memória: um agente que sai antes de o turno rodar
perde o registro, mas não a execução.

## Entradas do compositor

O compositor oferece duas formas de entrada que são entradas de autoria, não botões de início:

- A seção 「添加」 (Adicionar) do menu mais lista 「工作流」 (Workflow) logo depois do item de
  anexo e 「目标」 (Goal). Escolhê-la insere o token do slash-command `/workflow` no rascunho
  vazio, exatamente como digitá-lo no painel `/` faria; nada é enviado. O item é oferecido apenas
  para um rascunho estritamente vazio e apenas quando o catálogo de slash-commands do CLI contém um
  comando chamado `workflow` (um comando embutido que o CLI retém enquanto o portão cinza está
  desligado, e o compositor não deve enviar texto que o CLI não expandirá).
- No painel `/` o catálogo fixa `workflow` imediatamente depois de `goal`, então os dois comandos
  de "começar um pedaço de trabalho" ficam juntos.

O que `/workflow` faz uma vez invocado é assunto da skill de autoria:
`docs/dynamic-workflow/authoring.md`.

O distintivo de trabalho em segundo plano do compositor é o outro controle em forma de workflow
ali. Ele conta o trabalho em segundo plano rodando; clicando nele abre o painel de segundo plano
ou, quando uma única execução de workflow é a única atividade rodando, os detalhes dessa
execução diretamente.

## O CLI e a TUI

O cliente de terminal tem uma superfície mínima: um cartão embutido por chamada de ferramenta
`CreateWorkflow` ou `AmendWorkflow`, um comando `/dwf`, e um auto-allow para a confirmação. Não há
grafo, nem painel, nem descida para as transcrições dos subagentes; o `GetWorkflowRun` do modelo
responde perguntas mais profundas.

### O cartão embutido

O cartão liga a chamada de ferramenta à sua execução por id de chamada e lê um espelho
`workflowRuns` que a TUI mantém com o mesmo redutor que a projeção do desktop usa
(`workflow-runs-reducer` de `@zcode/shared`), alimentado por eventos `dynamic_workflow_run_progress`
através de uma assinatura que sobrevive a turnos. Não há um segundo relógio: sem polling, sem
intervalo.

Recolhido, uma linha colorida:

```
Workflow <label> - <status> (<settled>/<observed> steps)  [+ to expand]
```

Expandido: uso de tokens, até seis subagentes com seus status, as dez últimas linhas de `log()`
(200 caracteres cada), uma prévia do resultado (200 caracteres), o erro, e um marcador de
truncamento. As seis linhas de subagente são primeiro as que rodam, depois as que esperam, depois
as concluídas, cada grupo na ordem de atores própria da execução, então o cartão de uma execução
larga ainda mostra o que está rodando agora em vez dos seis agentes que por acaso começaram
primeiro. `+` e `-` expandem e recolhem todos os cartões de uma vez; eles são consumidos apenas
quando o rascunho está vazio e existe ao menos um cartão, então colar um diff ainda digita
normalmente. `stopped` mostra seu motivo, `stopped (model error)`.

Na inicialização e depois de `/resume` a TUI reproduz os eventos do journal das execuções da
sessão no mesmo redutor (então um cartão mostra contagens reais de passos, não zeros), então busca
a lista de execuções da sessão para rótulos, e imprime uma linha de sistema por execução
retomável:

```
Workflow <label> was interrupted and can be resumed: /dwf resume <runId>
```

Nada retoma por conta própria. Eventos crus de sessões de subagentes nunca chegam à transcrição
principal: a TUI descarta qualquer evento cujo id de sessão não seja o da sessão principal antes
de aplicá-lo, senão o `turn_complete` de um subagente seria anexado como a resposta do agente
principal.

### `/dwf`

| Comando | Efeito |
|---|---|
| `/dwf`, `/dwf list` | as execuções desta sessão (até 20), uma por linha: `runId · label · status[/reason] · resumable · updated <time>`, mais um sufixo de falha |
| `/dwf cancel [runId]` | cancela a execução; sem um id, cancela a única execução em voo ou lista as candidatas quando há várias |
| `/dwf resume <runId>` | retoma pelo servidor, que sozinho decide a retomabilidade; recusas são mostradas com seu motivo (`not_found`, `not_resumable`, `already_running`, `script_missing`, `script_mismatch`, `compile_failed`, a última seguida dos diagnósticos delimitados) |

Um cliente sem a capacidade responde "Dynamic workflow runs are not available in this
client." A lista tem escopo de sessão; o histórico de todo o projeto é o `ListWorkflowRuns` do
modelo. Sob `--workflow-mode disabled` (o padrão do CLI) `list` e `cancel` continuam funcionando e
`resume` é recusado com o aviso de desabilitado, já que iniciaria um motor; veja "O CLI
autônomo: `--workflow-mode`".

### O bypass de aprovação

Na TUI o respondedor de permissão resolve qualquer ask de `CreateWorkflow` ou `AmendWorkflow` como
`allow` antes de um prompt de aprovação ser construído, então nenhum prompt é desenhado. No modo
headless um broker mínimo permite as mesmas duas ferramentas e delega toda outra ferramenta ao
broker de deny que o headless sempre usou (sem ele uma execução `-p` falharia de imediato com "No
permission client configured").

Isso contorna o portão, não as permissões: o core não muda, hooks `PermissionRequest` ainda
respondem primeiro, eventos de permissão ainda disparam, nenhum `permissionUpdates` é escrito, e
os subagentes da execução herdam o perfil de permissão da sessão (no modo `plan` eles continuam
somente leitura). Para outras ferramentas o prompt da TUI ainda oferece Allow once, Always allow
in this project e Deny; Escape nega.

### Execuções headless

Invocações headless `-p` / `--prompt` e `--target` tomam seu modo de `--workflow-mode`, a mesma
flag e o mesmo padrão `disabled` que a TUI (veja "O CLI autônomo: `--workflow-mode`"). `--resume`
e `--continue` usam a flag desta invocação, nunca um valor da sessão retomada. Listas explícitas
de ferramentas não permitidas ainda têm precedência quando o modo liga as ferramentas. Por
exemplo:

```sh
zcode --workflow-mode alwaysOn -p "/workflow review this change"
```

Uma execução `-p` que iniciou um workflow não sai quando o turno termina. Depois que a atividade
de workflow foi observada (um evento de progresso, ou um `BackgroundTaskStarted` de kind
`workflow`), o processo espera até o runtime relatar nenhuma tarefa em segundo plano rodando e
nenhum trabalho de turno ativo ou na fila, o que cobre o turno dirigido por notificações no qual
o modelo resume o resultado. A `response` é então o texto do último turno, e um array
`turnResponses` carrega o texto de cada turno em ordem quando houve mais de um. Uma execução sem
atividade de workflow se comporta exatamente como antes. Não há timeout nem flag de espera
separada; Ctrl-C sai, e a execução órfã é registrada como `stopped` (`interrupted`) e pode ser
retomada.

| Formato de saída | Progresso do workflow |
|---|---|
| `stream-json` | uma linha NDJSON por evento de progresso, `type: "workflow.run.progress"`, com o payload delimitado verbatim e sem `turnId` (estes são eventos fora de turno). O tipo de propósito não faz parte do enum de eventos do protocolo v3. |
| `text` (o padrão) | linhas `workflow <runId>: <transition>` no stderr: `started`, mudanças de fase de nó (limitadas a uma a cada 400 ms), `log: …`, e o assentamento com seu status e erro |
| `json` | nada; o contrato é exatamente um objeto |

### Builds de executável único

Um build de executável único não pode lançar `node --eval`, então o CLI tem um subcomando oculto
`__zcode-dwf-child <entry path>` despachado antes do parse de argumentos, e o sandbox é iniciado
reexecutando o próprio CLI com esse subcomando. O script filho é escrito em um arquivo de
entrada, `<cwd>/.zcode/workflow-runs/<runId>.mjs` (com um fallback para diretório temporário e um
`.gitignore`), e a linha de comando carrega apenas o caminho dele, então um script longo nunca
excede o limite de linha de comando do Windows. O sandbox em si é o do motor:
`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`.## Ferramentas de introspecção de execuções

Duas ferramentas somente de leitura deixam o modelo olhar execuções sob demanda, incluindo as
de outras sessões no mesmo projeto. Suas descrições afastam o modelo do polling: execuções que
esta sessão inicia assentam sozinhas e entregam uma notificação com a saída final; recorra a
estas quando o usuário perguntar como vai um workflow, para revisar execuções anteriores, ou quando
uma notificação foi truncada. Ambas não precisam de aprovação, são permitidas nos modos plan e
build, permanecem disponíveis para filhos de workflow, expiram em 10 s e nunca escrevem no
journal.

As duas compartilham uma falha quando a sessão não tem porta de execução ou o journal não tem as
consultas de introspecção: `workflow_introspection_unavailable`, uma lacuna de capacidade que nunca
é relatada como um projeto vazio.

### `ListWorkflowRuns`

```ts
interface ListWorkflowRunsInput { limit?: number; statuses?: LifecycleStatus[] }
// LifecycleStatus = "pending" | "running" | "completed" | "errored" | "stopped"

interface ListWorkflowRunsOutput {
  runs: {
    runId; label; labelSource: "name" | "script";
    status; stopReason?: "user" | "model" | "provider" | "interrupted" | "superseded";
    resumedFrom?: string; supersededBy?: string;
    ownedByThisSession: boolean; possiblyInterrupted?: true;
    createdAt; updatedAt;            // epoch ms
    spentTokens;
  }[];
  truncated?: true;
}
```

`limit` tem como padrão 20 e é limitado a 1–50 em vez de recusado. Não há entrada `cwd`: a
ferramenta sempre consulta o diretório de trabalho da sessão, casado literalmente com o `cwd`
registrado da execução. As linhas vêm do journal (mais recente atualizado primeiro) unida ao
registro em memória da sessão: uma execução cujo `submit` retornou mas cuja linha de journal ainda
não foi escrita aparece como `pending`; uma execução que o registro sabe que assentada mostra o
status do registro. `truncated` é decidido buscando uma linha a mais que o limite.

`ownedByThisSession` é verdadeiro quando a sessão pai da execução é esta ou a execução está no
registro desta sessão. `possiblyInterrupted` marca uma execução não terminal que não é desta
sessão: ela pode ser um resto de processo morto ou uma execução viva de uma sessão irmã. É uma
anotação, nunca uma reescrita de status; apenas a inicialização da sessão dona reconcilia órfãos.

O rótulo é `name` quando a execução tem um, senão a primeira linha não vazia do script aparada em
80 caracteres, senão o id da execução; a fonte diz qual. Ele é derivado no momento da leitura e
nunca reescrito de volta.

O texto do modelo é um `<run …/>` meio-XML por linha, com atributos `resumed-from` e
`superseded-by` quando a execução os tem. A descrição explica os três estados terminais, que uma
execução `stopped` continua com `ResumeWorkflowRun` a menos que tenha sido suplantada, e que
qualquer execução, terminada ou não, pode ser revisada com `AmendWorkflow`.

### `GetWorkflowRun`

Entrada `{ run_id }`. Saída: os mesmos campos de resumo que uma linha de lista, mais

```ts
summary: string;                            // um grupo de frases determinístico, ≤ 400 caracteres, montado a partir dos campos abaixo
generatedAt: number;                        // epoch ms em que o snapshot foi lido; toda idade relativa no texto do modelo é contra ele
usage: { spentTokens; nodesObserved; nodesRunning; nodesCompleted; nodesFailed };
maxConcurrency?: number;                    // o limite de concorrência próprio da execução, só quando difere do padrão
subagentModel?: string;                     // o modelo de subagente da execução, só quando a execução escolheu um
modelBindings?: Record<string, string>;     // os nomes de modelo que o script usa → canônico, só quando usa algum
actors: { siteId; ordinal; name? }[];
logTail: { sequence; message; at? }[];     // as últimas 20 entradas de log(), em ordem; `at` é a hora do journal do evento
result?: string;                            // apenas em concluídas; texto serializado
error?: { code; message; providerStop? };   // com erro, ou parada por provedor / interrompida
pendingQuestions?: { qid; actor; actorName?; question; context?; askedAt }[];
artifacts?: { id; kind; title?; version; contentType?; bytes?; sourcePath?; itemCount; primary?: true }[]; // o primário primeiro

phases?: {                                  // ausente quando o script não declarou nenhuma e nenhuma foi entrando
  name; state: "done" | "current" | "ahead" | "unfinished";
  rounds;                                   // vezes que entrou; 0 para "ahead"
  nodesSettled; nodesRunning;
  enteredAt?; exitedAt?;                    // epoch ms, dos tempos dos eventos de entrada de fase
}[];
subagents: {                                // sempre presente, possivelmente vazio
  siteId; ordinal; name?;
  state: "idle" | "executing" | "waiting" | "parked" | "done" | "failed" | "unfinished";
  phaseName?;                               // a fase da sua pergunta atual ou última
  currentAsk?: {                            // presente enquanto uma das linhas de pergunta dela roda
    siteId; ordinal; actorSeq?;
    instructionsHead?;                      // as instruções do autor, os primeiros 240 caracteres
    startedAt?;                             // epoch ms do node-dispatched da pergunta
    turn?; toolCalls?;
    lastTool?: { name; target?; at? };      // at = a hora do evento de progresso do nó
  };
  wait?: { cause: "slot" | "backoff"; reason?; retryAfterMs?; since? };
  parkedOn?;                                // o qid de uma pergunta pendente
  stepsSettled; stepsFailed; tokens;        // tokens = a soma das perguntas assentadas dele
  lastProgressAt?;                          // epoch ms em que foi visto se mover pela última vez
}[];
subagentsTruncated?: true;                  // o elenco foi limitado em 64 linhas

health: {
  lastProgressAt?;                          // de toda a execução, epoch ms
  stalledSince?;                            // o último run-stalled sem progresso depois dele
  concurrency?: { effective; cap; reason?; since? };  // só enquanto retida abaixo do limite próprio da execução
  consecutiveFailures;                      // assentamentos de pergunta falhados finais
  cachedSteps;                              // assentamentos que foram acertos de reprodução
  leftoverRunning?;                         // apenas execuções terminais: linhas ainda marcadas como rodando
  pendingQuestionsKnown: boolean;
};
```

`nodesObserved` conta linhas de nós journalizadas e nunca é apresentada como um total; um workflow
dinâmico não tem contagem estática de passos. `result` é o valor de retorno do script serializado
pela mesma função que a notificação de conclusão usa, então os dois nunca discordam; um resultado
`undefined` omite o campo. `pendingQuestions` e `artifacts` vazios são omitidos, não arrays vazios.
`maxConcurrency` segue a mesma regra pelo outro lado: está presente apenas quando o limite próprio
da execução difere do paralelismo padrão, então uma execução no padrão não diz nada, e é
exatamente o que um `AmendWorkflow` que omite `max_concurrency` herdaria. `subagentModel` não diz
nada pelo mesmo motivo pelo seu lado: uma execução cujos subagentes seguem o modelo da sessão não
tem o que relatar, e a string canônica está presente apenas quando a execução escolheu um, o que
de novo é exatamente o que um `AmendWorkflow` que omite `subagent_model` herdaria. Um id
desconhecido é `run_not_found`. A ferramenta nunca espera; `TaskOutput` é a ferramenta de espera
para execuções que esta sessão iniciou.

`phases`, `subagents` e `health` são o que transforma as contagens acima em um relatório de
situação: onde a execução está, o que cada subagente está fazendo agora, e se algo disso está se
movendo. Eles são derivados no momento da leitura a partir do journal — os eventos da execução
reproduzidos pelo mesmo redutor que o painel da execução usa, unidos às linhas de nós e de atores —
e nada aqui é reescrito de volta. As leituras são estreitas (`execution-engine.md`, "Reading the
journal"): os eventos voltam com itens de relatório após o 64º removidos, exatamente como na
reprodução a frio (`presentation.md`, "Cold replay"), as linhas de nós são as que não são de
relatório sem seus resultados, já que o elenco lê apenas kinds, status, estatísticas e coordenadas,
e as linhas de atores são lidas uma vez, sem personas.

Todo relógio nesses três campos é `dwf_event.time_created`, o momento em que o journal anexou o
evento, e nada mais. Um `node-dispatched` é quando uma pergunta começou, um `node-settled` é
quando ela terminou, um `node-progress` é a última vez que ela foi vista se movendo, e um
`phase-entered` abre a sua própria fase e fecha a anterior. Um journal escrito antes de os
eventos carregarem essa coluna dá um tempo ausente, nunca zero e nunca o `Date.now()` do leitor:
carimbar um histórico de uma semana com o momento em que foi lido é a única falha que este campo
existe para evitar. Linhas de nós contribuem apenas com status e, em uma pergunta assentada, com
sua contagem de tokens.

O `state` de um subagente responde uma pergunta e é lido em uma ordem. Enquanto a execução está
viva: `parked` quando uma pergunta sua espera resposta, senão `waiting` quando o último evento de
ciclo de vida da pergunta atual foi `node-waiting` (um slot ou um backoff, que `wait` nomeia),
senão `executing` quando uma das suas linhas de pergunta ainda roda, senão `failed` quando sua
última pergunta assentada falhou, senão `idle`. Uma vez que a execução é terminal as palavras
vivas somem: `unfinished` quando uma linha de pergunta ainda está marcada como rodando (o processo
morreu sob ela), senão `failed` quando sua última pergunta assentada falhou, senão `done`.
`currentAsk` está presente exatamente enquanto uma linha de pergunta sua roda, e carrega a
atribuição e as leituras de progresso dessa pergunta; cada uma delas está ausente em um journal
que antecede o campo em vez de ser apresentada como zero, porque zero chamadas de ferramenta é
ele próprio um fato.

Uma fase é `ahead` quando o script a declarou e o fluxo de controle não a alcançou, que é o único
estado com `rounds: 0`; `current` quando é a última fase entrances e a execução está viva;
`unfinished` quando a execução é terminal e a fase ainda tem perguntas em voo; `done` caso
contrário. A tabela é os nomes de fase declarados na ordem do script, seguidos de qualquer fase
que foi entrances sem ser declarada, e o campo inteiro só está ausente quando o script não
declarou nenhuma e nenhuma foi entrances. `enteredAt` é a entrada mais recente na fase e
`exitedAt` a entrada da próxima fase depois dela, então a fase atual não tem saída.

`health.pendingQuestionsKnown` é a metade honesta de `pendingQuestions`. Perguntas estacionadas
vivem na memória do processo que perguntou e em lugar nenhum mais, então uma sessão lendo uma
execução que ela não está rodando não consegue distinguir uma pergunta sem resposta de nenhuma
pergunta. É verdadeiro quando esta sessão mantém a execução em seu próprio registro de execuções
vivas, ou quando a execução é terminal — uma execução terminal não tem ninguém ouvindo por
definição — e falso caso contrário, e enquanto é falso `pendingQuestions` fica ausente e nenhum
subagente é relatado como `parked`. Uma execução cuja linha de journal nomeia esta sessão mas que
este processo não está rodando é um resto de reinício, e ela lê como desconhecida como qualquer
outra: as perguntas estacionadas morreram com o processo que as segurava.

`stalledSince` é a última observação de `run-stalled` sem progresso registrado depois dela.
Progresso significa uma pergunta que se moveu ou o próprio script que se moveu: um evento de nó,
uma entrada de fase, uma linha de `log`, um relatório ou um artefato. Um script que roda uma
sequência de leituras do mundo entre perguntas não emite nenhum evento de pergunta, então deixar o
próprio output de fora o reportaria como travado. Esperar por um slot ou um backoff também não é
progresso em nenhum sentido, já que essa espera é o travamento, e nem um `concurrency-changed` ou um
`run-stalled`, que são observações sobre não se mover.

`concurrency` está presente apenas quando o governador está mantendo a execução abaixo do seu
próprio limite, e diz o que está em voo contra esse limite, por quê, e desde quando. O limite é o
`max_concurrency` da execução quando ela definiu um, e o paralelismo padrão caso contrário; o motivo
e o tempo vêm do último `concurrency-changed`. O padrão não é de propósito o denominador, e o
limite próprio da execução já é relatado por si só como `maxConcurrency`: uma execução iniciada
com `max_concurrency: 3` em uma máquina de seis vias leria "3 de 6" a vida inteira e pareceria
estrangulada enquanto está fazendo exatamente o que lhe pediram.

O texto do modelo é um bloco por fato, em uma ordem fixa: `<summary>`, depois as etiquetas de
identidade e ciclo de vida — `<run_id>`, `<label>`, `<status>`, `<stop_reason>`, `<resumed_from>`,
`<max_concurrency>`, `<subagent_model>`, `<script_models>`, `<superseded_by>`, `<owned_by_this_session>`,
`<possibly_interrupted>`, `<created_at>`, `<updated_at>` — depois `<pending_questions>`,
`<health>`, `<phases>`, `<subagents>`, `<log_tail>`, `<usage>`, `<result>`, `<error>`,
`<artifacts>`, e por último os blocos de roteamento `<superseded>`, `<resumable>` e `<amendable>`.
`<max_concurrency>`, `<subagent_model>` e `<script_models>` ficam lado a lado e cada um está
presente apenas quando a execução definiu um; `<script_models>` contém uma linha
`"{name}" = {canonical}` por vínculo. Perguntas pendentes vêm antes da saúde, do elenco e da
cauda do log, com instruções para respondê-las através de `ResolveWorkflowQuestion`.

Um fato ausente é uma palavra ausente: nenhum bloco, linha ou campo é desenhado como `0` ou como
"desconhecido" no lugar de algo que o journal não conhece. Há exatamente duas exceções, e ambas
existem porque o silêncio ali seria lido como uma resposta: quando `health.pendingQuestionsKnown` é
falso o bloco `<pending_questions>` está presente e diz em uma frase que esta sessão não pode vê-las
e que retomar a execução pergunta de novo o que qualquer subagente ainda precisar, e uma execução
terminal com `health.leftoverRunning` ganha uma segunda linha em `<health>` dizendo que as linhas
abaixo marcadas como rodando são restos de um processo que saiu e não trabalho vivo.

Todo tempo no texto é escrito duas vezes: o instante em ISO 8601, e então sua idade relativa a
`generatedAt` entre parênteses, como `40s ago`, `5m 10s ago`, `2h 15m ago` ou `3d 2h ago`. Um
snapshot tem um relógio: `generatedAt` é lido uma vez por chamada, então duas idades na mesma
saída são sempre comparáveis. Uma entrada de `logTail` cujo evento antecede a coluna de tempo do
journal simplesmente não carrega prefixo de idade.

`<summary>` é montado pela ferramenta a partir dos campos estruturados, nunca por um modelo, então
o mesmo snapshot sempre produz a mesma frase: o status com o tempo decorrido ou encerrado, a
posição de fase (`in phase 2 of 4 (judge)` enquanto existem fases, `across 4 phases` uma vez que
estão todas atrás), as contagens de passos assentados e rodando com o detalhamento
executando/esperando/estacionado, a contagem de perguntas pendentes ou o fato de ela ser
desconhecida, a idade do último progresso, e, para uma execução concluída, o título da
entregável. Fica limitada a 400 caracteres descartando frases inteiras do final.

`<health>` é uma linha de leituras `key=value`, mais a nota de restos. `<phases>` é uma linha por
fase com seu índice, nome, estado, rounds, contagens assentadas e rodando e sua duração ou tempo
até agora. `<subagents>` é uma linha por subagente — nome quando tem um, endereço, estado,
fase, e então sobre o que esse estado é: o endereço e o índice de passo da pergunta atual, o tempo
nesse passo, as contagens de turnos e chamadas de ferramentas e a última ferramenta com sua idade
para um que está executando; a causa da espera e o atraso de nova tentativa para um que está
esperando; o id da pergunta e sua idade para um que está estacionado; a contagem de passos
assentados caso contrário — e seu total de tokens, seguido de uma linha indentada `task:` que
carrega o `instructionsHead` da pergunta quando o journal tem um. Um
`step N` impresso ao lado de um endereço de pergunta é a posição de base 1 dessa pergunta na
própria sequência de seu subagente, o `actorSeq` do journal mais um, então o modelo pode nomear a
pergunta pelo endereço ou pela posição. Uma
execução `stopped` ganha um bloco `<resumable>` cuja frase depende
do motivo (uma execução parada pelo usuário só é retomada quando o usuário pedir; uma parada por
provedor precisa ter sua causa corrigida primeiro). Toda execução ganha um bloco `<amendable>` que
nomeia `AmendWorkflow`, mais forte para uma execução com erro: corrija o script e mantenha o
trabalho concluído em vez de reescrever. Fora da forma de uma frase abaixo, ele também diz que uma
mudança apenas de configurações omite `script` e `path`, e, em uma execução que ainda está indo,
que uma chamada carregando apenas `max_concurrency` a reajusta onde está em vez de iniciar
qualquer coisa. Em uma execução que está `running` e não travada esse bloco é uma frase em vez
de um parágrafo: uma execução saudável não é uma decisão que o modelo precisa tomar agora, e o
argumento de roteamento vale o seu comprimento apenas onde algo de fato deu errado. Uma execução
suplantada ganha um bloco `<superseded>` em vez de `<resumable>`: ele nomeia a sucessora e diz
para ler ou revisar aquela execução, já que retomar uma execução suplantada refaria trabalho que
sua sucessora possui.

### Os cartões deles

Ambas as ferramentas carregam um payload de exibição estruturado (`list_workflow_runs`,
`get_workflow_run`) para que seus cartões na transcrição não sejam JSON cru. O cartão de lista
mostra uma contagem e uma linha por execução (ponto e palavra de status, rótulo, tempo, tokens),
marca as execuções desta sessão, avisa sobre `possiblyInterrupted` e anota o truncamento. A linha
de resumo do cartão de status é o rótulo com uma palavra de status e as contagens de passos;
expandido ele mostra o resultado primeiro para uma execução concluída, o erro primeiro para uma
que falhou, e então status, uso e logs não vazios. Esse `error` carrega apenas `code` e
`message`; `providerStop` pertence só à saída voltada ao modelo, já que o schema de exibição é
espelhado campo a campo em `packages/shared`. Sessões antigas sem payload caem para um texto
delimitado.

O cartão de status carrega o relatório de situação também: a mesma frase `summary` montada, a
tabela `phases`, um elenco `subagents` delimitado (nome, endereço, estado, fase, o
`instructionsHead` da pergunta atual, contagens de turnos e chamadas de ferramentas, a última
ferramenta, a causa da espera, tokens e os tempos) e `health`. O payload é um subconjunto
aparado da saída da ferramenta em vez de uma cópia dela: carrega o que um cartão desenha e nada
que ele não desenha, seus conjuntos de enum são fechados e idênticos aos da ferramenta, e seus
próprios limites — 32 fases, 64 subagentes, os limites de string do redutor — são aplicados no
canal de exibição, que não passa pelo orçamento de resultado. Um elenco ou uma tabela de fases
limitados por esses limites define a flag `truncated` do payload, a mesma que a cauda do log já
usa.

Cada um desses cinco campos é opcional no fio embora o produtor sempre os preencha. Um payload
persistido antes de o relatório de situação existir não carrega nenhum deles, e o schema de
exibição é estrito: exigi-los falharia o payload inteiro e esvaziaria aquele cartão em toda
sessão já em disco. O fallback de texto que esta especificação promete é para uma linha sem
payload nenhum, não para uma mais antiga, então um cartão lê qualquer um dos cinco que recebe e
desenha o resto a partir das contagens que sempre teve.

## O catálogo de modelos

`subagent_model` nomeia um modelo que este host tem configurado. `ListModels` é como o modelo lê
essa lista em vez de adivinhá-la: sem entrada, sem aprovação, permitida nos modos plan e build,
ainda disponível para filhos de workflow, como as outras listagens somente de leitura.

```ts
interface ListModelsOutput {
  current?: string;              // providerId/modelId do modelo da própria sessão
  models: {
    id: string;                  // providerId/modelId
    providerId; modelId; providerLabel?;
    reasoningLevels: string[];   // vazio quando o modelo não tem nenhum
    defaultReasoningLevel?; contextWindow?; disabledReason?;
  }[];
}
```

O `id` de cada linha cola verbatim em `subagent_model`, com `$<level>` acrescentado para tomar
um dos `reasoningLevels` daquela linha. O modelo da própria sessão é marcado como `[current]`,
para que o modelo veja que escolhê-lo equivale a omitir o campo; uma linha carregando um
`disabledReason` não pode ser usada e diz por quê, para ser resolvida com o usuário em vez de
contornada. O texto do modelo é uma linha por modelo dentro de `<models count="N">` em vez de um
bloco por entrada como `ListSavedWorkflows` escreve: linhas de catálogo são muitas e quase
idênticas, e a única coisa a fazer com uma é copiar seu id. Um host sem nada configurado responde
com uma frase dizendo isso e mandando o modelo omitir `subagent_model`, em vez de um contêiner
vazio, que lê como uma ferramenta que falhou em responder.

A descrição diz com todas as letras que a ferramenta não muda o modelo em que a sessão está
rodando: o modelo da sessão é escolha do usuário, e `subagent_model` move apenas os subagentes do
workflow. Sem isso, uma ferramenta que lista modelos é lida como a troca para um. Uma sessão sem
catálogo de modelos falha a chamada com `model_catalog_unavailable`, uma lacuna de capacidade que
nunca é relatada como uma configuração vazia, pelo mesmo motivo pelo qual
`workflow_introspection_unavailable` não é um projeto vazio: um usuário que possui uma dúzia de
modelos não pode ser informado de que não tem nenhum.

A ferramenta carrega um payload de exibição `list_models`, então sua linha na transcrição é um
cartão de catálogo em vez do texto voltado ao modelo. A linha de resumo é a palavra de tipo e uma
contagem; enquanto a chamada está em voo, a palavra de tipo sozinha. Expandido, os modelos são
agrupados sob o nome de seu provedor, uma linha por id de modelo, com a palavra "current" no
modelo da própria sessão e a janela de contexto à direita da linha; uma linha que não pode ser
usada carrega seu motivo no lugar de nada. Os níveis de pensamento de uma linha e seu id
canônico moram no tooltip da linha, que é o único lugar onde o id canônico aparece. Um host sem
nada configurado diz isso em uma frase e não tem o que expandir, e uma chamada que falha mostra a
palavra de status em vez de uma lista vazia, mantendo "esta sessão não pode ler o catálogo"
distinto de "este host não tem modelos". O id do provedor nunca é desenhado, a mesma regra que o
rótulo do modelo de subagente segue: em um plano de equipe ele é um UUID.

## Release cinza: a chave de recurso `dynamicWorkflow`

Status: implementado. O servidor decide, por cliente, qual modo um usuário recebe por padrão. A
chave é `data.configs.dynamicWorkflow.mode` na resposta de `/api/v1/client/configs`, com os
valores `"disabled" | "onDemand" | "alwaysOn"`. O usuário pode escolher qualquer um dos três modos
em Settings (veja "A escolha do usuário"), e uma escolha explícita sempre vence. O servidor só
define o padrão: o modo de um usuário que não escolheu.

### O que cada modo significa

A tabela descreve o modo *efetivo*: a escolha do usuário onde ela se aplica, caso contrário o modo
oferecido.

| Modo | Comportamento nesta versão |
|---|---|
| `disabled` | Nenhuma maneira de iniciar um workflow. As dez ferramentas de workflow não são registradas para o modelo, o comando `/workflow` está ausente do catálogo de slash (então a entrada do menu mais do compositor e a entrada do painel `/` desaparecem com ele), a skill `dynamic-workflows` não é oferecida, e a página de automações mostra apenas 「自动化」 sem aba 「工作流」. Execuções que já existem continuam sendo desenhadas em todos os lugares onde eram antes: cartões de transcrição, digests, cartões de conclusão, o painel da execução e seus artefatos, a linha de execução na barra lateral. Toda afordância de Resume é retida (a do painel da execução, a do rodapé do cartão de transcrição e a do digest) porque cada uma iniciaria um motor; elas compartilham um único ponto de fornecimento, o callback de retomada do contexto da conversa. |
| `onDemand` | Toda porta de `alwaysOn`, com a superfície de ferramentas voltada ao modelo adiada. O comando `/workflow` permanece no catálogo de slash (então a entrada do menu mais do compositor e a do painel `/` permanecem), a skill `dynamic-workflows` continua descobrível, a página de automações mantém sua aba 「工作流」 e toda afordância de Resume é oferecida; mas as dez ferramentas de workflow **não são registradas para o modelo, e as descrições de `Agent`/`Task` não carregam linha de CreateWorkflow, até que a sessão seja ativada** por seu primeiro `/workflow`, por um Resume ou Configure de uma de suas execuções, ou por retomar uma sessão cujos registros já contêm um workflow. Uma vez ativada uma sessão permanece ativada. Veja "Sob demanda: ativação". `enabled = mode !== "disabled"` (`isDynamicWorkflowModeEnabled` em `packages/shared/src/dynamic-workflow-feature.ts`) ainda responde a toda pergunta "o recurso é oferecido de todo modo"; apenas o portão de registro lê o modo em si. |
| `alwaysOn` | Tudo o que este documento descreve; as dez ferramentas são registradas desde a primeira requisição da sessão. |

A chave ausente, malformada, ou a requisição falhou: a oferta é `disabled`. Um servidor que para
de enviar a chave desligou o padrão; um snapshot "ligado" obsoleto nunca é carregado adiante para
além de uma resposta bem-sucedida que não a tem. A escolha explícita do usuário ainda se aplica
por cima (veja "A escolha do usuário"). A UI de terminal e execuções `-p` headless nunca consultam a
chave: o CLI autônomo não lê `/client/configs`. Seu modo vem da flag `--workflow-mode` e é
`disabled` quando a flag está ausente (veja "O CLI autônomo: `--workflow-mode`").

### Quem decide e quem consome

```
Host (packages/services)
  BigModelCodingPlanSubscriptionProvider.getDynamicWorkflowClientConfig()
    ← the cached /client/configs snapshot (1 h TTL, forceRefresh bypasses it)
    ← ZCODE_DYNAMIC_WORKFLOW_MODE (local override, see below)
    → the offer: { offeredMode, source }                     (latched once per Host process)
  settings.dynamicWorkflowMode (the user's choice, absent = follow the offer)
    ← local and standalone-server Hosts: their own settings file, read at each use
    ← desktop-attached remote Hosts: pushed by the desktop (see "The user's choice")
    → applyDynamicWorkflowUserMode(offer, choice): { mode, enabled, offeredMode, userMode?, source }
      │
      ├─► zcodeAgentService, at workspace client start and after every change of the choice:
      │      workspace/updateDynamicWorkflowPolicy { enabled, mode }   (CLI-wide fact)
      │   and on every session/create, session/resume, v4 createSession:
      │      dynamicWorkflowEnabled: true, dynamicWorkflowMode         (only when enabled)
      │
      └─► ICodingPlanSubscriptionService.getDynamicWorkflowClientConfig  (RPC to the renderer)
             → the automations page and the run pane read `enabled` (effective)
             → the Settings row reads `offeredMode` and `mode`

CLI (apps/zcode-cli, protocol server mode)
  appRuntimePreferences.dynamicWorkflowEnabled / .dynamicWorkflowMode  (default false / absent = fail-closed)
  createRecord: enabled = params.dynamicWorkflowEnabled === true || preferences flag
                mode    = params.dynamicWorkflowMode ?? preferences mode ?? (enabled ? "alwaysOn" : "disabled")
    → runtimeConfig.dynamicWorkflowEnabled, runtimeConfig.dynamicWorkflowToolsOnDemand (= mode is onDemand)
    → registerBuiltInTools({ includeDynamicWorkflow })   ten tools in or out; on demand: out until activation
    → disabled only: listProtocolSlashCommands drops the built-in `workflow`; the builtin prompt resolver does not expand `/workflow`
    → disabled only: the bundled `dynamic-workflows` SKILL.md is excluded from skill discovery
```

O Host é o único dono da decisão, e ele lê o servidor uma vez por processo de Host: o primeiro
início de cliente de workspace aguarda o snapshot e trava a oferta, e toda sincronização de
política posterior, criação e retomada de sessão nesse processo a reutiliza. A escolha do usuário
não é travada: ela é aplicada à oferta travada a cada uso. Uma virada do servidor portanto tem
efeito na próxima inicialização do app, a mesma regra que o release cinza do prompt de contexto do
desktop. O travamento é o que impede que uma criação de sessão espere por um timeout de rede
quando a máquina está offline; o custo é que um Host que começou offline oferece `disabled` até
reiniciar, então um usuário que nunca escolheu um modo tem o recurso desligado até então (uma
escolha explícita ainda se aplica, veja "A escolha do usuário"). O
cache de envelope de 1 h do próprio provedor e o `forceRefresh` servem ao refresh do
renderer, não ao portão do CLI. Hosts remotos por SSH, WSL e Docker avaliam a chave eles mesmos
através da própria requisição `/client/configs`, então uma máquina remota que não alcança o
servidor oferece `disabled`: o recurso fica desligado ali a menos que a escolha do usuário
(empurrada pelo desktop) ou a sobreposição (abaixo) o ligue. O CLI nunca lê
a chave nem a sobreposição; ele apenas consome o que o Host envia, do mesmo jeito que
`offPeakToolEnabled` funciona. CLIs antigos que não conhecem o método de política respondem
método-não-encontrado, que o Host registra e ignora, e seus schemas `z.object` descartam a flag de
sessão desconhecida, então o pareamento degrada para desabilitado. As sessões vivas de um
workspace mantêm a superfície de ferramentas com que começaram; a flag é lida na criação e na
retomada, nunca no meio da sessão, casando com a regra de off-peak. A ativação sob demanda é a
única mudança no meio da sessão, e ela apenas acrescenta: uma sessão nunca perde as dez
ferramentas enquanto vive.

Quando o portão está desligado, o texto voltado ao modelo de outras ferramentas também para de
apontar para as ferramentas ausentes: a descrição da ferramenta `Agent` perde sua linha "o
CreateWorkflow é obrigatório para pedidos de workflow", então o modelo não é mandado buscar uma
ferramenta que não pode ver.

As dez ferramentas: `CreateWorkflow`, `AmendWorkflow`, `SaveWorkflow`, `ListSavedWorkflows`,
`ListModels`, `EvalWorkflowSnippet`, `ListWorkflowRuns`, `GetWorkflowRun`, `ResumeWorkflowRun`,
`ResolveWorkflowQuestion`. `ListModels` está no conjunto porque seu único propósito é nomear o
`subagent_model` de uma execução (veja "O catálogo de modelos"); sem nada para criar, ela apenas
apontaria o modelo para uma ferramenta que ele não pode ver. A ferramenta legada `Workflow` e
`/expert` são um recurso diferente e ficam intocadas. Sessões de atores de workflow
(`workflow_child`) herdam a flag do pai, que é necessariamente ligada, já que um filho só existe
sob uma execução.

### Sob demanda: ativação

Status: especificado, implementação pendente. `onDemand` mantém toda porta de `alwaysOn` e adia
apenas o que o modelo vê. Uma sessão nascida sob ele registra suas ferramentas embutidas com as
dez ferramentas de workflow de fora e as descrições de `Agent`/`Task` sem sua linha de
CreateWorkflow, exatamente como `disabled` faz; ao contrário de `disabled`, o comando `/workflow`
permanece no catálogo de slash, o compositor mantém suas entradas de menu mais e de painel `/`, a
skill embutida continua descobrível e a página de automações mantém sua aba 「工作流」. As dez
declarações custam cerca de 4.850 tokens em toda requisição de sessão principal (authoring.md
"The authoring surface"); uma sessão que nunca pede um workflow nunca paga por elas. A skill
permanece listada porque o preâmbulo `skills:` do comando precisa ser carregável no momento em
que o comando roda, e uma listagem é uma linha em um lembrete de sistema, não um custo por
requisição.

**O estado.** Cada sessão tem um booleano, *activated*, pertencente ao runtime. Sob `alwaysOn` ele
é verdadeiro desde a construção. Sob `onDemand` ele começa falso e se torna verdadeiro no máximo
uma vez; nada o desfaz. O portão de registro que os dois pontos de chamada de
`registerBuiltInTools` compartilham (`resolveRuntimeDynamicWorkflowToolsIncluded`) lê
`enabled ∧ (¬onDemand ∨ activated)`, então o refresh do ramo não pode readicionar nem remover as
ferramentas por si só (DWG-03b continua valendo). A ativação é um método de runtime: ele
registra de novo o conjunto embutido com o portão aberto, invalida o cache de contrato de
ferramentas para que a próxima requisição do modelo carregue as dez ferramentas e as linhas
restauradas de `Agent`/`Task`, e persiste uma entrada de sessão `runtime/dynamic_workflow_activation`
ao lado de `runtime/execution_state`. A entrada é apenas um atalho para a varredura de histórico na
retomada (toda ativação deixa para trás uma mensagem `/workflow` ou uma chamada `CreateWorkflow`),
então uma falha de escrita da entrada é registrada como aviso e a ativação ainda tem sucesso. Uma
segunda chamada é um no-op. O runtime copia sua config na construção, então o portão é lido do
runtime, nunca do objeto de config que o app montou.

**O que ativa.**

| Gatilho | Onde | Por quê |
|---|---|---|
| `/workflow …` enviado nesta sessão | a fachada de entrada, quando o resolvedor de prompt embutido expande o comando, antes de `executeTurn` | o turno que pediu precisa já ver `CreateWorkflow`; o comando do usuário é o pedido |
| `resumeWorkflowRun` ou `amendWorkflowRunSettings` aceitos para uma execução desta sessão, ou um workflow salvo iniciado nesta sessão a partir do hub (`startSavedWorkflowRun`) | os métodos de runtime por trás desses comandos, depois que a execução é iniciada e antes de seu turno ser enfileirado | cada um inicia um motor cuja notificação de conclusão diz ao modelo para usar `GetWorkflowRun`; um modelo mandado nisso sem tal ferramenta ficaria travado |
| retomada de uma sessão cujos registros mostram um workflow | `resume.ts`, depois de as mensagens persistidas serem carregadas, antes do primeiro turno | a entrada de ativação está presente; ou, para sessões nascidas sob `alwaysOn` ou antes desta regra, uma mensagem de usuário persistida cujo texto é um comando `/workflow` (prompts de usuário persistem como `displayInput`, o comando cru), ou qualquer chamada de ferramenta persistida que nomeie uma das dez |

Nada mais ativa. Um pedido explícito em prosa ("use um workflow para …") não é um gatilho: antes
da ativação o modelo não tem `CreateWorkflow`, então faz o que faz sob `disabled`, delega com
`Agent` ou faz o trabalho ele mesmo. Sob `onDemand` o comando `/workflow` é a única porta até que
a primeira execução de workflow da sessão exista (authoring.md "The command"). O modelo não é
avisado do adiamento; não há ferramenta para apontá-lo.

**O que não desativa.** Compactação: o portão da skill fecha com a compactação porque pergunta o
que o modelo pode ver agora; a ativação pergunta se esta sessão já teve um workflow, e uma vez que
existe um o modelo precisa de `GetWorkflowRun`, `ResumeWorkflowRun` e das ferramentas que as
notificações da execução nomeiam pelo resto da sessão. Uma virada do servidor para `disabled` segue
a regra existente: tem efeito no próximo processo de Host, e uma sessão viva mantém a superfície
que tem. Rewind mantém a ativação também.

**Filhos.** Um filho subagente (`Agent`) herda a superfície do pai ao ser criado: a flag de
habilitação, a flag sob demanda e a ativação do pai naquele momento, então um filho criado antes
da ativação não tem ferramentas de workflow e um criado depois as tem. Um ator de workflow
(`workflow_child`) existe apenas sob uma execução e portanto está ativado; ele ainda perde as
ferramentas de autoria através de `WORKFLOW_CHILD_DISALLOWED_TOOLS`, como antes.

**Como o modo viaja.** O portão do Host para de ser dobrado em um booleano:
`resolveDynamicWorkflowGate` retorna o `mode` do snapshot, e `enabled` é derivado dele. Todo
canal que carrega `dynamicWorkflowEnabled: true` também carrega `dynamicWorkflowMode`
(`workspace/updateDynamicWorkflowPolicy`, `session/create`, `session/resume`, v4
`createSession`, `createSessionRecord`); o booleano continua sendo o fato de habilitação e continua
sendo a única coisa que CLIs antigos leem. O CLI mantém
`appRuntimePreferences.dynamicWorkflowMode` ao lado do booleano para os caminhos que não têm
params de Host (retomada a frio v4), e `createRecord` deriva os campos de runtime:
`dynamicWorkflowEnabled` como hoje, `dynamicWorkflowToolsOnDemand: true` apenas quando o modo
resolvido é `onDemand`. No core, um campo on-demand ausente significa registro eagerness, a mesma
polaridade do campo de habilitação: filhos de subagente e embedders no processo que não definem
nenhum dos dois mantêm a superfície completa, enquanto o CLI autônomo sempre escreve os dois
campos a partir de sua flag (DWG-04). Um Host mais antigo que esta regra envia só o booleano, o
que um CLI novo lê como `alwaysOn`. Um CLI mais antigo que esta regra emparelha o contrário: o
`createSession` v4 descarta a chave desconhecida; a criação e a retomada legadas são estritas, e o
retry de compatibilidade existente do Host omite o `dynamicWorkflowMode` rejeitado e envia só o
booleano, então aquele CLI se comporta como `alwaysOn`; o método de política também é estrito e não
tem retry, então sua sincronização é registrada e ignorada ali e o booleano por sessão carrega a
decisão em vez disso. De qualquer jeito o CLI antigo nunca vê um sinal parcial: o Host escreve o
modo apenas ao lado de `dynamicWorkflowEnabled: true`, nunca sozinho.

### A escolha do usuário

Status: implementado. Uma configuração de todo o app, `dynamicWorkflowMode` no arquivo de
configurações compartilhado, guarda a escolha do usuário. Ausente significa "seguir a oferta". Fora
disso guarda um dos três modos.

**Precedência.** A escolha do usuário sempre vence. O servidor (ou a sobreposição local) decide
apenas a *oferta*, `offeredMode`: o modo padrão, que é o modo efetivo enquanto o usuário não
escolheu. Uma oferta de `disabled` é um padrão como os outros, então um usuário pode ligar o
recurso onde o servidor não envia a chave, onde a requisição falhou, ou em uma máquina remota
que não alcança o servidor. Um Host sem um resolvedor para a oferta de todo (um que não liga o
recurso) permanece `disabled` qualquer que seja a escolha. O servidor portanto não tem um
interruptor remoto para um usuário que escolheu um modo; o recurso está geralmente disponível, e
a chave só move o padrão. O helper compartilhado `applyDynamicWorkflowUserMode(offer, choice)`
é o único lugar onde esta regra está escrita; o Host a chama, e o renderer só lê seu resultado.

Um snapshot sem um `offeredMode` legível (`readDynamicWorkflowOfferedMode` não devolve nada)
vem de um Host mais antigo (um bundle de UI mais novo, como o remoto do telefone, conectado a um
desktop mais antigo), que ignora a escolha, então nem a linha nem o botão de configurações do hub
aparece para ele.

**Limpa no padrão.** Escolher a opção igual ao modo oferecido apaga o valor armazenado (o patch
carrega a string vazia, que o normalizador de patch de configurações transforma em delete, já que
`undefined` não sobrevive ao salto do RPC). Uma instalação intocada portanto continua seguindo
viradas posteriores do servidor, por exemplo `onDemand` hoje e `alwaysOn` em uma versão futura.

**Onde é mostrada.** Settings › 常规, no cartão que contém 交互行为, logo abaixo de
提问自动继续: rótulo 「动态工作流」, descrição
「让模型用脚本编排大量子代理并行工作，处理复杂任务、交付专业结果。」, e um select de 260 px à
direita. A linha usa a coluna de controle larga (280 px, empilhada abaixo do rótulo em larguras de
telefone); a coluna padrão de 192 px encolheria o select. A lista abre abaixo do gatilho
(`position="popper"`) na largura do gatilho, e cada opção tem um ícone, um título e uma descrição
que quebra dentro da lista:

| Valor | Título | Descrição |
|---|---|---|
| `disabled` | 关闭 / Off | 禁用动态工作流。不能创建新的工作流，自动化页也不再显示「工作流」；对话历史中已有的工作流仍可正常查看。 |
| `onDemand` | 通过命令启用 / On command | 只有输入 /workflow 命令才会运行新的工作流。 |
| `alwaysOn` | 始终开启 / Always on | 除了 /workflow 命令，模型也会根据你的意图主动运行工作流。 |

A opção igual ao modo oferecido carrega uma etiqueta 「默认」 (Default); o gatilho mostra apenas o
título do modo efetivo. A linha é sempre desenhada assim que o snapshot de disponibilidade está
pronto, qualquer que seja a oferta: sob uma oferta de `disabled` o gatilho mostra 关闭 e a
etiqueta fica em 关闭. Ela não é desenhada enquanto o snapshot está carregando, quando a leitura
falhou, ou para um snapshot de um Host mais antigo (acima). A
linha não tem nota sobre temporização; sessões abertas mantendo suas ferramentas é a regra abaixo,
não algo que a linha explica.

**Quando tem efeito.** A mesma regra de uma virada do servidor: sessões criadas ou retomadas após
a mudança recebem a nova superfície de ferramentas, e sessões vivas mantêm a que têm. O fato de
todo o CLI muda de uma vez: o Host reenvia `workspace/updateDynamicWorkflowPolicy` para todo CLI
vivo, com `enabled: false` quando a escolha é `disabled`, então o catálogo de slash de rascunhos
preparados depois disso perde ou recupera `workflow` (e com ele a entrada de menu mais do
compositor). O snapshot de disponibilidade do renderer é recarregado depois de o Host ressincronizar,
então a palavra de título 「工作流」, as afordâncias de Resume e o hub seguem o novo modo efetivo.

**Como uma mudança viaja.** O arquivo de configurações é a única fonte da escolha. Uma escrita em
qualquer janela alcança o renderer de toda janela através do broadcast de configurações
compartilhadas; a raiz de cada janela então chama `zcodeAgentService.syncDynamicWorkflowUserMode` em
seu próprio Host e, uma vez que isso resolve, recarrega seu snapshot de disponibilidade.

- Um Host com suas próprias configurações (desktop local, web e servidor autônomo) lê a escolha
  de seu arquivo de configurações a cada uso, então uma sessão criada antes do sinal chegar ainda
  recebe a escolha atual; a chamada é apenas um sinal para ressincronizar. Ressincronizações rodam
  em uma corrente por workspace e cada passo lê a escolha quando roda, então uma sincronização de
  política lenta nunca pode chegar depois de uma mais nova.
- Um Host remoto conectado ao desktop (SSH, WSL, Docker) não tem acesso às configurações do
  desktop, então o desktop empurra o valor: uma vez quando constrói os serviços de workspace
  remotos (lido do arquivo de configurações), e de novo do `syncDynamicWorkflowUserMode` do Host
  local para toda conexão remota viva daquela janela. O primeiro push é emitido na conexão antes de
  qualquer requisição de workspace, e a conexão entrega requisições em ordem.
- Um servidor autônomo alcançado como alvo remoto mantém suas próprias configurações e não
  recebe push.
- O telefone se conecta ao Host do desktop e o segue; não tem controle próprio.
- O CLI autônomo mantém `--workflow-mode` e nunca lê a configuração.

**O link do hub.** A linha de cabeçalho de seção do hub carrega 「工作流设置」 e o rótulo do modo
atual (veja "A página do hub"). Ela é mostrada apenas enquanto o próprio hub é mostrado, ou seja,
enquanto o modo efetivo não é `disabled`. Sob `disabled` a página volta ao título simples
「自动化」 e nada aponta para a configuração; o caminho de volta é Settings › 常规, onde o
usuário a desligou. A linha está sempre presente. Um usuário que escolheu Off e um usuário cujo
padrão é Off veem a mesma página de automações.

### A sobreposição local

Uma variável de ambiente, `ZCODE_DYNAMIC_WORKFLOW_MODE`, lida pelo resolvedor do Host antes de
qualquer chamada de rede. Quando ela contém um dos três valores o resolvedor a retorna com
`source: "override"` e pula o fetch, então não há TTL nem corrida do primeiro Host. O Desktop
Main é o guardião: em `buildHostProcessEnv` ele sempre escreve ou apaga a chave antes de o Host
iniciar, nunca a repassa intacta, então o Host confia no que vê.

| Build | O que o Main escreve no env do Host | Efeito |
|---|---|---|
| dev sem pacote (`pnpm dev:desktop`) | o valor do shell do desenvolvedor, se for um dos três | qualquer modo, para teste manual |
| preview empacotado (`ZCODE_PRODUCT_FLAVOR === "preview"`, backend de produção) | o literal `alwaysOn` | usuários de preview sempre têm o recurso; a chave do servidor é ignorada |
| produção empacotada | nada; um valor herdado é removido | a sobreposição não pode funcionar |

Hosts remotos iniciados por SSH, WSL e Docker recebem o mesmo valor através de
`pickRemoteRuntimeEnv`, então os workspaces remotos de um build de preview correspondem aos seus
locais. Os Hosts Web e de servidor não têm Main e leem o ambiente do processo diretamente; ali a
variável é do operador, não de um usuário final. O CLI ignora a variável por completo.

### O CLI autônomo: `--workflow-mode`

A TUI e execuções headless (`-p`, `--target`) não têm Host, então seu modo vem de uma flag de
processo, `--workflow-mode disabled|onDemand|alwaysOn`, com os mesmos três significados que a chave
do servidor. **Quando a flag está ausente o modo é `disabled`**: workflows no CLI autônomo são
opt-in. O valor é lido com o normalizador do Host (`normalizeDynamicWorkflowMode`: a grafia exata,
espaços em volta ignorados); qualquer outra coisa falha na entrada do CLI com um erro que nomeia os
três valores, código de saída 1, antes de qualquer app ou sessão existir. Não há variável de
ambiente nem chave de config; `ZCODE_DYNAMIC_WORKFLOW_MODE` continua sendo só do Host.

**Onde a flag é aceita.** Com `-p`/`--prompt`, com `--target`, e para a TUI (sem comando, ou
`tui`). Em qualquer outro lugar é um erro com código de saída 1: em `app-server` e
`agent-server` porque o Host é dono da decisão ali e uma flag daria ao modo um segundo dono; nos
outros subcomandos (`login`, `plugins`, `skills`, `doctor`, …) porque eles não criam sessão para ela
que moldar.

**Como ela chega ao runtime.** A entrada do CLI resolve o modo uma vez por processo e escreve
explicitamente os dois campos de config de runtime em todo app que cria (o primeiro e os que estão
atrás de `/new`, `/resume` e fork): `dynamicWorkflowEnabled = mode !== "disabled"` e
`dynamicWorkflowToolsOnDemand = mode === "onDemand"`. Toda consequência depois disso é a que o
servidor de protocolo já tem. Sob `disabled` as dez ferramentas não são registradas, `Agent` e
`Task` não carregam linha de CreateWorkflow, a skill `dynamic-workflows` não é oferecida e o
resolvedor embutido não expande `/workflow`. Sob `onDemand` as regras de ativação acima valem como
escritas; o `/dwf resume` da TUI ativa do mesmo jeito que o Resume da GUI, porque ambos passam por
`trackResumedDynamicWorkflowRun`. A polaridade do core "ausente significa eagerness" fica intocada:
o CLI autônomo simplesmente nunca deixa os campos ausentes.

O modo pertence ao processo, não à sessão. Nada dele é persistido, e retomar uma sessão sob um
modo diferente troca sua superfície silenciosamente, a mesma regra de uma virada de servidor no
desktop (uma retomada `onDemand` ainda restaura a ativação a partir dos registros da sessão).
Execuções existentes continuam sendo desenhadas sob todos os modos: o cartão embutido, a
reprodução do journal na inicialização e depois de `/resume`, e a linha que nomeia uma execução
retomável.

O que o terminal mostra sob `disabled`:

| Superfície | Comportamento |
|---|---|
| paleta `/` e `/help` da TUI, `-p "/help"` headless | nenhuma entrada `/workflow` |
| `/workflow …` digitado mesmo assim na TUI | um aviso local de que workflows dinâmicos estão desabilitados e como reiniciar com eles; nada é enviado ao modelo |
| `/dwf`, `/dwf list`, `/dwf cancel` da TUI | inalterados: ver e parar uma execução não inicia nenhum motor |
| `/dwf resume <runId>` da TUI | recusado com o mesmo aviso antes de o servidor ser consultado; uma retomada iniciaria um motor |
| `-p "/workflow …"` headless | o aviso no stderr e código de saída 1, antes de qualquer app ser criado |

### Aceitação

O E2E do hub de workflows salvos (`automations-workflows-hub.test.ts`) exige que o gateway de
configs de cliente local do caso ofereça `alwaysOn` antes do Electron iniciar. Ele não pode
depender de um rollout vivo nem de uma sobreposição de modo local do desenvolvedor. O hub usa um
provedor de replay local sem conta OAuth semeada; a autenticação específica de conta pertence a
fixtures separados, não a este caso de gerenciamento de arquivos e início. Cada caso fecha um
diálogo de início deixado pelo caso anterior e sai da página de automações pela ação de nova
tarefa do projeto padrão antes de preparar a conversa. A limpeza adiada dos workers não reinicia
a página entre casos no mesmo spec. Ações e asserções do painel lateral de execuções miram a aba
ativa visível, porque abas inativas continuam montadas. Asserções de hover precisam estabelecer o
hover do ponteiro na linha da execução expandida antes de verificar a opacidade de Stop. As
asserções de concorrência leem o valor da entrada numérica, não o seu conteúdo de texto vazio, e
verificam o decremento antes de aplicá-lo. O mesmo gateway continua omitindo a chave para o caso
de release cinza desabilitado; habilitar a fixture do hub não pode mudar specs não relacionadas
nem o padrão de produto fail-closed.

| ID | Preparação → ação → asserção |
|---|---|
| DWG-01 | `resolveDynamicWorkflowClientConfig`: remoto `{mode:"alwaysOn"}` → enabled/remote; remoto ausente, `null`, ou `{mode:"bogus"}` → disabled/default; override de env definido → o override vence o remoto; `onDemand` → enabled com `mode` preservado como `onDemand` |
| DWG-02 | Host: sincronização de política enviada com `enabled:true` e `mode` apenas quando o snapshot está habilitado; método-não-encontrado do CLI é ignorado; create/resume/v4 createSession carregam `dynamicWorkflowEnabled:true` e `dynamicWorkflowMode` apenas quando habilitado e omitem ambos caso contrário |
| DWG-03 | Servidor de protocolo do CLI: sem flag → nenhuma das dez ferramentas registrada, `workflow` ausente do catálogo de slash, `/workflow` não expandido; flag ligada com modo ausente ou `alwaysOn` → todas as dez registradas desde a primeira requisição e o catálogo fixa `workflow` depois de `goal`; a ferramenta legada `Workflow` não é afetada em nenhum dos casos |
| DWG-03b | CLI: o conjunto de ferramentas embutidas é registrado de dois lugares, o início de sessão e o refresh do ramo de busca embutida (`refreshBranchAwareBuiltInTools`); ambos derivam o portão do mesmo helper, então uma sessão desabilitada continua sem as dez ferramentas depois do refresh. Regressão do primeiro teste de app real, em que o refresh as readicionava |
| DWG-03c | CLI: uma sessão de protocolo com o portão desligado (o que inclui a chave do servidor estar ausente) recebe uma descrição da ferramenta `Agent` sem referência a CreateWorkflow; uma sessão com o portão ligado, e um runtime onde o campo de config nunca é definido, mantêm a linha |
| DWG-04 | Core: um runtime cuja config não define nenhum dos dois campos (um filho subagente, um embedder no processo) registra todas as ferramentas; não definido significa ligado apenas no core. O CLI autônomo nunca depende disso: sem `--workflow-mode` a TUI e o headless escrevem `dynamicWorkflowEnabled: false`, e uma chave de servidor ausente sempre significa desligado |
| DWG-04b | Headless `-p` / `--prompt` / `--target`: `--resume` e `--continue` pegam o par do `--workflow-mode` desta invocação (ausente → disabled), nunca da sessão retomada; um `--disallowed-tools CreateWorkflow` explícito ainda remove a ferramenta sob `alwaysOn`; `app-server --stdio` / `agent-server --stdio` não recebem campo de workflow da entrada do CLI |
| DWG-05 | Desktop Main `buildHostProcessEnv`: dev + shell `disabled` → env do Host `disabled`; dev + shell lixo → chave ausente; preview empacotado + shell `disabled` → env do Host `alwaysOn`; produção empacotada + shell `alwaysOn` → chave ausente |
| DWG-06 | `pickRemoteRuntimeEnv` encaminha a chave quando definida |
| DWG-07 | UI, desabilitado: a página de automações mostra um título simples 「自动化」 e nenhuma aba de workflow; um pedido de navegação pela aba de workflow aterrissa em automações; o painel da execução, o cartão de transcrição e o digest de uma execução existente são desenhados mas não oferecem Resume. Habilitado: inalterado de antes |
| DWG-08 | E2E do desktop contra um `/client/configs` simulado: `disabled` → o menu mais não tem 「工作流」, o painel `/` não tem `workflow`, a página de automações não tem aba; `alwaysOn` e `onDemand` → as três presentes |
| DWG-09 | Servidor de protocolo do CLI, modo `onDemand`: a sessão começa sem nenhuma das dez ferramentas e uma descrição de `Agent` sem a linha de CreateWorkflow, enquanto `workflow` está no catálogo de slash e a skill `dynamic-workflows` é descobrível; enviar `/workflow …` ativa antes da primeira requisição de modelo do turno, que carrega as dez ferramentas e a linha de `Agent` restaurada; a entrada `runtime/dynamic_workflow_activation` é persistida; um refresh de ramo posterior mantém as dez; um segundo `/workflow` não muda nada; um pedido em prosa sem o comando deixa a superfície como estava |
| DWG-10 | Retomada pelo CLI, modo `onDemand`: uma sessão com a entrada de ativação tem as dez ferramentas antes do seu primeiro turno; uma sessão sem a entrada mas com uma mensagem de usuário `/workflow` persistida, ou uma chamada de ferramenta `CreateWorkflow` (qualquer uma das dez) persistida, é ativada na retomada e ganha a entrada; uma sessão sem nenhuma das duas continua adiada. Modo `alwaysOn`: ativada de qualquer forma |
| DWG-11 | v4 `resumeWorkflowRun` / `amendWorkflowRunSettings` aceitos em uma sessão `onDemand` não ativada, e um workflow salvo iniciado nela a partir do hub, a ativam antes de o turno seguinte ser enfileirado; um comando recusado não ativa nada |
| DWG-12 | Filhos: um filho `Agent` criado antes da ativação não tem ferramentas de workflow, um criado depois as tem; um `workflow_child` está sempre ativado e ainda perde as ferramentas de autoria através de sua lista de proibições |
| DWG-13 | Compatibilidade: um CLI que recebe `dynamicWorkflowEnabled:true` sem modo registra eager; um runtime sem nenhum dos dois campos (um filho, um embedder) registra eager; uma compactação após a ativação deixa as dez ferramentas registradas |
| DWG-14 | Flag do CLI autônomo: a TUI e `-p` sem `--workflow-mode` criam o app com `dynamicWorkflowEnabled:false, dynamicWorkflowToolsOnDemand:false`; `onDemand` → `true, true`; `alwaysOn` → `true, false`; todo app que a TUI cria (`/new`, `/resume`) carrega o mesmo par; `--workflow-mode bogus` → saída 1 nomeando os três valores, nenhum app criado |
| DWG-15 | Escopo da flag: `--workflow-mode` com `app-server`, `agent-server`, `login`, `skills` → saída 1 com o erro de escopo; com `-p`, `--target`, `tui` ou nenhum comando → aceita |
| DWG-16 | TUI sob `disabled`: as sugestões de `/` e `/help` não têm `workflow`; `/workflow x` responde o aviso de desabilitado sem chamar `submitPrompt`; `/dwf list` e `/dwf cancel` funcionam; `/dwf resume <id>` responde o aviso sem chamar `resumeWorkflowRun`. Sob `onDemand` e `alwaysOn`: `/workflow` é sugerido e enviado como antes |
| DWG-17 | Headless sob `disabled`: `-p "/workflow x"` → o aviso no stderr, saída 1, nenhum app criado; `-p "/help"` não lista `/workflow`. Com `--workflow-mode alwaysOn` o comando percorre o caminho de prompt simples e a espera de assentamento como antes |
| DWG-18 | `applyDynamicWorkflowUserMode`: oferta `onDemand` + escolha `alwaysOn` → mode `alwaysOn`, `offeredMode` `onDemand`, `userMode` `alwaysOn`; oferta `disabled` + escolha `alwaysOn` → mode `alwaysOn`, enabled, `offeredMode` `disabled`; nenhuma escolha → a oferta inalterada; um valor armazenado inválido é ignorado. `readDynamicWorkflowOfferedMode` devolve o modo oferecido, `disabled` incluído, e nada para um snapshot sem `offeredMode` legível |
| DWG-19 | Patch de configurações: `dynamicWorkflowMode: ""` apaga o valor armazenado; um modo é armazenado como está; um valor armazenado desconhecido não quebra a leitura do arquivo |
| DWG-20 | Host: com uma oferta travada `alwaysOn`, uma escolha armazenada `onDemand` faz a próxima criação de sessão carregar `dynamicWorkflowMode: "onDemand"` sem uma nova leitura do servidor; uma escolha `disabled` faz ela não carregar campo de workflow algum; com uma oferta travada `disabled`, ou uma leitura da oferta que lançou, uma escolha armazenada `alwaysOn` envia a política `enabled: true` e faz a criação de sessão carregar o modo; sem um resolvedor de oferta a escolha é ignorada; `syncDynamicWorkflowUserMode` reenvia a política para todo workspace vivo (`enabled: false` para `disabled`) apenas quando o modo efetivo mudou, na ordem das chamadas |
| DWG-21 | Host remoto conectado ao desktop: sem um resolvedor de configurações local ele aplica o último valor empurrado; o desktop empurra o valor de configurações quando constrói os serviços de workspace remotos e encaminha mudanças posteriores para conexões remotas vivas |
| DWG-22 | Linha de Settings da UI: ausente enquanto carrega, em falha, e para um snapshot sem `offeredMode` legível (um Host mais antigo), onde o botão de configurações do hub também está ausente; presente sob uma oferta `disabled`, mostrando 关闭 com a etiqueta; com uma oferta `disabled` e uma escolha `alwaysOn` o hub mostra seu botão de configurações; mostra o modo efetivo; a etiqueta 「默认」 fica no modo oferecido; escolher o modo oferecido escreve `""`, escolher outro escreve esse modo; o armazenamento recarrega depois de uma mudança |
| DWG-23 | E2E do desktop contra um `/client/configs` simulado enviando `alwaysOn`: a linha mostra 始终开启 com a etiqueta; escolher 关闭 remove a palavra de título 「工作流」 e, em um rascunho novo, a entrada de menu mais; escolher 始终开启 de novo limpa o valor armazenado. Oferta `disabled`: a linha mostra 关闭 com a etiqueta; escolher 始终开启 o armazena e traz de volta a aba 「工作流」 e, em um rascunho novo, a entrada de menu mais |

## Alternativas não adotadas

- **Mostrar o caminho do script na janela de confirmação ou na linha da ferramenta.** O caminho é
  o cabo do modelo; o usuário aprova o script e a linha do tempo, que ele já vê, e ambas as
  superfícies foram julgadas densas.
- **Cunhar a cópia de trabalho de uma execução só quando ela dá erro.** O pipeline de
  notificações ganharia uma escrita em disco, uma notificação restaurada a frio teria que cunhar
  de novo, e uma execução que concluiu mas precisa de mais um estágio não teria arquivo; escrever
  no envio é um arquivo pequeno por execução ao lado do arquivo de entrada que a execução já
  escreve.
- **Deixar uma revisão editar a definição salva no lugar.** Uma correção pontual se tornaria em
  silêncio a definição e pularia a janela de `SaveWorkflow`; a cópia de rascunho mantém os dois
  atos separados.
- **Um fallback de diretório temporário para rascunhos.** O arquivo de entrada tem um porque a
  execução não pode começar sem ele; um rascunho existe para ser encontrado e editado no projeto.
- **Uma ferramenta separada para executar workflows salvos.** Todo o portão (always-ask, a opção
  de Refine, a opção de sessão, o payload de grafo, a remoção do v3, o fallback de bot) é
  indexado nos nomes das ferramentas de início; uma terceira ferramenta reimplementaria tudo isso, e
  cada omissão seria um buraco silencioso na confirmação. `AmendWorkflow` existe apesar disso porque
  revisar é um ato diferente com um cartão diferente e uma parada própria; ele compartilha o portão
  por ser registrado como a segunda ferramenta de início, não por copiá-lo.
- **Manter `resume_from` em `CreateWorkflow`** ao lado de `AmendWorkflow`. Duas maneiras de dizer a
  mesma coisa manteriam vivo o antigo reparo de dois passos (`TaskStop`, depois criar) em prompts
  e transcrições, e o cartão não poderia distinguir um início de uma revisão.
- **Recusar revisar uma execução rodando** (o antigo `not_amendable`). Isso tornava reparar uma
  execução visivelmente errada um parar, um poll de `GetWorkflowRun` até a leitura do journal parar,
  e um reenvio; o serviço pode em vez disso aguardar o assentamento da própria execução.
- **Encerrar uma predecessora suplantada como `stopped(model)`.** Sua notificação diria ao modelo
  para revisar uma execução que acabou de ser revisada, e o cartão leria como uma parada comum.
- **Devolver o script armazenado no snapshot da execução** para que `resolveInput` pudesse
  herdá-lo de `getTask`. O snapshot é consultado pelo rastreador de tarefas em segundo plano; o
  script viajaria em toda consulta. `getScript` o lê uma vez, quando uma revisão o pede.
- **Uma ferramenta de configurações ao lado de `AmendWorkflow`** (um `UpdateWorkflowRun` para
  concorrência e modelo). Uma mudança de modelo ainda significa uma nova execução que suplanta a
  antiga, então a segunda ferramenta repetiria o portão, o cartão e a parada pelo mesmo ato; um
  `script` opcional diz isso com uma ferramenta só. O reajuste não reviveu a ideia: ele é alcançado
  pela mesma chamada, com o mesmo campo, e uma ferramenta própria faria o modelo escolher um
  caminho que o handler pode decidir a partir do estado próprio da execução.
- **Um diff contra o script da predecessora na janela de revisão.** A janela aparece apenas para a
  execução de outra sessão, onde o usuário também não viu o script antigo; o novo script e sua
  linha do tempo são o que estão aprovando.
- **Carregar o script salvo no payload de exibição** em vez da entrada normalizada. Clientes
  antigos não conseguem ler novos campos de exibição, e hooks e regras casam com a entrada; o canal
  de entrada faz a janela e a política verem o script em toda versão.
- **Impor "exatamente uma origem" no schema zod.** A entrada normalizada carrega as duas.
- **Um "sempre permitir" persistente (de nível projeto) para `CreateWorkflow`.** Ele fecharia o
  portão para sempre; a concessão de sessão o fecha por uma vida de processo.
- **Dispensa de confirmação para todo `AmendWorkflow`.** `run_id` é uma string que qualquer
  execução do projeto satisfaz, e um script revisado pode adicionar subagentes que usam
  ferramentas; a regra se liga a execuções que esta sessão iniciou.
- **Uma tabela de linhagem em memória de execuções aprovadas** (o desenho anterior). Ela se
  perdia em reinício e retomada a frio, precisava de semeadura em dois caminhos de início e de
  revogação no cancelamento; a sessão pai registrada da execução diz a mesma coisa e já é
  persistida.
- **Iniciar execuções do hub por uma mensagem de chat sintetizada** ("por favor execute o workflow
  salvo X"). Um turno de modelo acrescentaria latência, tokens e uma chance de desvio, e então uma
  segunda confirmação de uma decisão que o usuário já tinha tomado no hub.
- **Mudar o modelo de subagente de uma execução rodando, ou seu script, no lugar.** O modelo é
  congelado em sessões de subagentes que já existem, e o script é a identidade da execução: seu
  `script_hash` é o que uma retomada confere. Mover qualquer um dos dois no meio da execução daria
  à execução duas histórias, aquela com que foi enviada e aquela sob a qual rodou. Uma revisão
  mantém um registro por execução, e o cache a torna barata. O paralelismo é a exceção, e é uma
  porque não custa uma segunda história: o limite é um número que o agendador relê a cada
  despacho, e um reajuste escreve tanto a linha quanto um evento `run-caps-changed`, então o journal
  ainda diz sob o que a execução rodou e quando isso mudou
  (`docs/dynamic-workflow/concurrency.md`, "Retuning a live run").
- **Um botão de Configure que envia uma mensagem ao modelo** ("baixe a concorrência para 4"). Isso
  custa um turno de modelo, e o modelo pode reenviar o script inteiro; a GUI pode chamar a revisão
  ela mesma, assim como o botão Executar do hub inicia um lançamento ele mesmo.
- **Emitir o turno de configurações dentro de um turno ocupado.** Uma mensagem de usuário entre uma
  chamada de ferramenta do assistente e seu resultado quebra a gramática do provedor; a fila de
  comandos do runtime já segura trabalho até o turno terminar.
- **Iniciar execuções do hub em uma sessão existente.** Enfileirar um lançamento atrás de um turno
  ativo precisa de semântica de admissão que o turno só de controle não tem; todo lançamento ganha
  uma sessão nova.
- **`args` tipados por workflow.** Gerar um `.d.ts` por arquivo faria a superfície de compilação
  variar por arquivo; uma fachada compila todo workflow.
- **Uma ferramenta de modelo `DeleteWorkflow`.** Um workflow salvo é um arquivo no repositório; o
  git e o hub o apagam.
- **Injetar a lista de workflows salvos no system prompt.** Vinte workflows salvos não podem
  tornar todo turno mais caro; `ListSavedWorkflows` está sob demanda.
- **Armazenar metadados como `export const meta`** ou uma cerca `---`: a fachada proíbe
  `export`, e uma cerca torna a primeira linha um erro de sintaxe.
- **Mover um workflow de projeto para global como movimentação de arquivo.** Workflows de projeto
  referenciam seu repositório; a promoção é a generalização do modelo.
- **Um comando `/dwf status`.** `GetWorkflowRun` é a ferramenta do modelo; o usuário pergunta ao
  modelo.
- **Uma flag `--wait` ou timeout para execuções headless.** Cancelar e Ctrl-C são os controles.
- **Enviar um binário `node` separado em builds de executável único** (+50 MB por plataforma); o
  CLI reexecuta a si mesmo em vez disso.

## Perguntas em aberto

- Configurar uma execução que já tinha parado a deixa retomável ao lado da nova execução, então um
  usuário pode acabar com duas execuções da mesma linhagem. Marcar uma predecessora assentada
  como suplantada mudaria o contrato de revisão do motor também para a ferramenta; fica como está.
- Uma execução que o modelo iniciou sob seu próprio `name` não se prende a nenhum workflow salvo no
  hub; o journal não tem uma coluna separada de nome salvo.
- O grupo global busca as 50 execuções mais recentes entre todos os nomes e projetos e filtra por
  nome no cliente, então uma máquina movimentada pode passar fome no histórico de um workflow
  global.
- O bloco de confirmação de `SaveWorkflow` mostra o caminho alvo mas nenhuma linha explícita de
  escopo ou sombreamento; ambos aparecem apenas no cartão de chamada de ferramenta depois.
- O deep link `openWorkflow` para uma página de detalhe é aceito pelo hub mas nada no shell o
  envia.
- Os metadados de início carregam o script, mas nenhuma superfície o lê ainda; o painel da
  execução lê apenas o grafo. O turno de configurações não o carrega.
- Uma chamada de `AmendWorkflow` não carrega `args`, então revisar uma execução iniciada a partir
  de um workflow salvo com argumentos dá à revisão um `args` vazio. Uma revisão que mantém o
  script torna isso mais provável: o script herdado ainda lê os argumentos para os quais foi
  escrito. A mudança de configurações pela GUI passa `inheritArgs` e os mantém; a ferramenta
  poderia fazer o mesmo quando mantém o script.
- A confirmação de apagar diz 「会从项目里删除 {path}」 para workflows globais também.
- A TUI ainda oferece "Always allow in this project" em pedidos de `SaveWorkflow`; a regra que ela
  escreveria é inerte contra o portão always-ask.
- Nenhum host escreve `disabledReason` em uma entrada de catálogo, então o ramo de desabilitado do
  resolvedor e o marcador `[disabled: …]` descrevem um estado que nada produz ainda.