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
| ferramenta `AmendWorkflow` | o modelo | nenhuma quando a execução sendo revisada é da própria sessão; a janela de confirmação caso contrário (veja "Revisando as execuções desta sessão") | a sessão atual |
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
| um `modelId` solto configurado sob exatamente um provedor | aquela entrada |
| um `modelId` solto configurado sob vários provedores | o modelo da própria sessão quando ele é um deles; caso contrário, uma falha nomeando todos |

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
execuções desta sessão começam sem janela; a execução de outra sessão pergunta). Sua lista de
campos enuncia uma regra, omita um campo e a nova execução mantém o valor da predecessora, em
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
mesma ferramenta.