# Execução e herança de Model

Este documento especifica como, depois que uma Submission entra no Core, cada tipo de execução obtém, mantém ou troca o Model. O estado da Selection está em [`../interaction/interaction.md`](../interaction/interaction.md), e a criação e autenticação do Model em [`../registry/model-creation.md`](../registry/model-creation.md).

## Princípios gerais

1. Uma execução primeiro determina a ModelSelection e só então cria o Model a partir do Registry/ModelFactory.
2. Cada Agent Loop mantém seu próprio Active Model.
3. Depois de criado, o Active Model permanece imutável até o fim do Loop ou até o Guide trocar em uma fronteira explícita de Step.
4. O Automatic Compact usa o Active Model atual do Loop.
5. O Subagent cria seu próprio Model a partir da Selection final.
6. Um novo Loop principal de Background/Goal usa a Session Selection do momento da inicialização.
7. Execuções especiais apenas anexam Request Auth, Ticket, attribution ou override, sem carregar Config estático de Provider/Model.

## Classificação das execuções

| Execução                   | Origem da Selection                    | Ciclo de vida do Model  | Session Selection |
| ----------------------- | ------------------------------------- | ------------------- | ----------------- |
| start-now comum          | Submission atual                       | novo Agent Loop       | atualizada ao receber        |
| Queue drain comum        | Submission guardado no item da Queue   | novo Agent Loop       | atualizada ao iniciar o dequeue |
| Guide / «立即»           | Submission do Guide                    | Steps seguintes do Loop atual | atualizada ao receber o Guide |
| Automatic Compact        | Active Model do Loop atual             | Loop atual           | não atualizada       |
| Compact manual           | Submission do Compact                  | novo Loop             | regras comuns     |
| Subagent                 | override > Profile > Parent Selection  | ciclo de vida do Child | não atualiza a Session do pai |
| Background               | Selection definida na inicialização     | ciclo de vida do Background | não atualiza retroativamente |
| Goal continuation        | Session Selection no momento da continuação | novo Loop principal por rodada | não salva nada extra |
| Turn automático off-Peak | ModelSelection da Submission idle      | Loop automático atual | não atualizada       |

## Agent Loop comum

```text
Core Submission
      |
      v
Registry / ModelFactory
      |
      v
Agent Loop Active Model
├─ Model Step 1
├─ Tool Batch
├─ Model Step 2
└─ Automatic Compact
```

Trocas no Composer, mudanças comuns na configuração da Session ou refresh do Registry não alteram o Active Model atual. A nova configuração só é lida na próxima criação de Model.

## Guide / «立即»

O Guide é um evento de troca explícito dentro do Loop atual:

```text
Active Loop: Model A
        +
Guide Submission: Selection B
        |
        v
Registry cria Model B e completa o admission
        |
        v
Context recebe o Guide input
Session Selection A -> B
Active Model A -> B (no próximo Model Step)
```

Requisições já enviadas continuam usando A; os Steps seguintes e o próximo Automatic Compact usam B. A injeção no Context, a atualização da Session Selection e a troca do Active Model constituem um resultado de recepção atômico; se qualquer etapa falhar, o Guide inteiro passa para a Queue comum, e não é permitido submeter apenas uma parte.

## Compact

### Automatic Compact

O Automatic Compact é um comportamento interno do Loop atual:

```text
Current Active Model
├─ same Provider/Model Config
├─ same Model properties and limits
├─ same bound options
└─ same request-time access context
        |
        v
Automatic Compact request
```

Ele não lê o Composer nem a Session Selection e não estabelece outro conjunto de Provider/Capability DTO. Depois de uma troca por Guide, o próximo Automatic Compact usa o novo Active Model.

### Compact manual

O Compact manual é uma nova Submission/Loop e cria o Model a partir da própria Selection. Ele não herda o contexto de execução temporário de um Loop já encerrado.

## Subagent

A prioridade da Selection do Subagent é fixa:

```text
Core Server Submission override
        >
Subagent Profile Selection
        >
Parent Loop Active Selection
```

Depois de determinar a Selection, o Child cria seu próprio Model a partir do Registry:

```text
Final Child Selection
        |
        v
Registry / ModelFactory
        |
        v
Child-owned Active Model
```

Fresh/Fork definem a inicialização do Context e Foreground/Background definem o agendamento; nenhum dos dois altera as regras de herança de modelo. O override do Core Server é uma opção de execução comum e pode exigir que todos os Children derivados desta Submission usem uma Selection específica; não é um campo exclusivo de off-peak e não entra no input provider-visible da tool Agent.

O modelo e o reasoning explícitos de um Profile comum continuam sendo resolvidos conforme a semântica de configuração do Subagent. Quando o Profile não tem modelo, ele herda a Active Selection do pai; o Child não compartilha o mesmo objeto mutável de Model do pai.

## Goal

Cada retomada automática do Goal é um novo Agent Loop principal:

```text
Goal Loop 1 usa Selection A
        |
Submission comum do usuário usa Selection B
        |
Session Selection = B
        |
Goal Loop 2 inicia
        `-- usa Selection B
```

O Goal não salva uma Selection de continuation adicional. O novo Loop usa a Session Selection do momento da retomada e cria um novo Model pelo Registry.

## Background

O Background cria seu próprio Model na inicialização e o mantém durante o próprio ciclo de vida:

```text
Turn 1: Selection A, inicia Background A
Turn 2: Submission do usuário usa Selection B
Background A conclui
Turn 3: acorda o Agent principal, lê a Session Selection B
```

O próprio Background continua usando A; ao concluir, apenas dispara um novo Loop principal. O Model do Background não modifica retroativamente a Session Selection.

## Tarefas off-peak

Tarefas off-peak usam, conforme o Family da conta atual, um Built-in Provider invisível ao usuário mas completo:

```text
Z.ai      -> account:zai-offpeak-idle-plan
BigModel  -> account:bigmodel-offpeak-idle-plan
```

Os dois Providers têm Endpoint, Access e membros de modelo fixos próprios e não alternam entre si em tempo de execução:

```text
Host / Scheduler
├─ prompt / mode
├─ idle ModelSelection
├─ Request Auth
├─ Off-Peak Ticket / attribution
└─ optional Subagent override = idle Selection
             |
             v
       Core Submission
             |
             v
   Registry / ModelFactory
             |
             v
      Idle Active Model
```

Visibility, Access, Endpoint, models e Model Config do Provider vêm todos do Config/Rules normal. O Host fornece apenas o Request Auth dinâmico, o Ticket e a atribuição do despacho válido desta rodada, e não o Config completo de Provider/Model.

### Estado da Session

Tarefas off-peak não modificam e depois restauram a Session Selection do usuário:

```text
Session Selection = U

Idle Loop starts
├─ Session Selection = U
└─ Active Model = I

Idle Loop terminal
├─ Model I ends
└─ Session Selection = U

Next user Submission
└─ Registry cria Model a partir de U
```

Não existem `previousModel`, `setModel` temporário nem `finally` de restore.

### Busy e Queue

O despacho off-peak só é aceito quando a Session atual pode executar start-now. Diante de uma corrida busy, retorna um admission rejection tipado, e o Scheduler despacha novamente mais tarde; Request Auth/Ticket não entram na Queue comum, no Guide, na held queue nem em pending input replayable.

Uma Submission comum enviada pelo usuário durante a execução entra na Queue única da CLI. Depois que o Turn idle chega ao terminal, os itens da fila são executados com a Selection/regra comum guardada por eles próprios, sem herdar Access, Ticket ou attribution de idle.

### Automatic Compact

O Automatic Compact off-peak usa diretamente o Idle Active Model e o Request Auth/Ticket válido do momento, sem ler a Session Selection e sem receber snapshot do Turn Runtime Model.

### Foreground Subagent

O override comum de Subagent da Submission off-peak fixa os Foreground Children permitidos na idle Selection. Cada Child ainda cria seu próprio Model pelo Registry/ModelFactory e usa o contexto de Request Auth/Ticket da execução off-peak atual. Outros overrides de Provider/model nos Profiles Explore, general-purpose e custom são sobrepostos por esse override do Core desta rodada. Background Children são barrados pela Tool Policy em modo fail-closed antes de emitir qualquer requisição de modelo. Essa proibição pertence à política de agendamento off-peak e não é escrita no Provider Config nem no Registry.

### Permission / elicitation

Mantém-se D44:

```text
Idle Turn
└─ permission / elicitation requested
       ├─ 普通 Session 展示并收集响应
       ├─ Off-Peak task 保持 running
       └─ approve / deny / skip
              └─ 同一个 Turn 继续，仍使用 Idle Model
```

Não é adicionado um estado off-peak `awaiting_approval`, não há troca para o Provider do usuário após o approve e não se estabelece um handoff de Provider no meio do Turn.

### Ticket e retomada

Expiração, cancelamento, falha, sucesso do Ticket ou reinício do processo encerram o contexto de execução válido atual. O Scheduler preserva Task, Session e transcript, obtém um novo Ticket e envia uma nova Submission idle, criando um novo Idle Model. Ticket, fila, timebox de 3 horas, continuation e settle pertencem ao domínio de Off-Peak e não entram no Registry.

## Tarefas de modelo independentes

Title, Repo Wiki, Memory, WebFetch/WebSearch e outras tarefas de modelo pontuais devem receber explicitamente uma ModelSelection ou um Model, e não ler o Runtime Model global mutável. Elas escolhem conforme a própria semântica de produto:

- pertencem ao Loop atual: usam o Active Model atual;
- execução independente: criam seu próprio Model a partir de uma Selection explícita;
- despertar posterior do Loop principal: usam a Session Selection vigente naquele momento.

## Atribuição

Usage, Trace e erros de cada ModelRequest são atribuídos ao `providerId + modelId` efetivo. Compact, Subagent, Goal, Background, taskId de off-peak e request source são dimensões de execução adicionais e não substituem a identidade do Model. Requisições já enviadas não podem ser atribuídas a posteriori a um novo Active Model.

## Invariantes

- Um Loop tem um único Active Model em qualquer Model Step.
- Mudanças de Config/Composer não fazem hot patch no Active Model.
- O Guide troca atomicamente apenas em fronteiras de Step.
- O Automatic Compact usa o Active Model atual.
- Cada Subagent cria seu próprio Model.
- Goal/Background não modificam retroativamente a Session Selection.
- Tarefas off-peak não modificam e depois restauram a Session Selection.
- Após a resposta de permissão off-peak, o mesmo Turn continua usando o idle Model.
- Request Auth/Ticket dinâmicos não entram no Config, na Registry View, na Queue comum nem na persistência.
- Execuções especiais não criam um Provider temporário, um segundo Registry nem um segundo tipo de Model.