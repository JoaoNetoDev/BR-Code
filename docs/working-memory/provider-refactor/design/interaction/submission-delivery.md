# Recebimento e entrega de Submission

O CoreSubmission fixa a intenção completa de uma única entrada:

```ts
interface CoreSubmission {
  prompt: string;
  modelSelection: ModelSelection;
  attachments?: readonly SubmissionAttachment[];
  mode?: AgentMode;
}
```

Execuções especiais podem carregar um execution context adicional, mas isso não altera o princípio de recepção atômica de prompt, attachments, mode e de uma única ModelSelection. O Request Auth, o Ticket, as informações de atribuição e o override de Subagent de tarefas ociosas são definidos pelo design de execução; eles não formam um segundo conjunto de Selection, e o Submission também não carrega ProviderConfig ou ModelConfig completos.

## Start now

Quando o Core está ocioso, o Submission inicia diretamente um novo Agent Loop:

```text
Submission B accepted
        |
        +-- Session Selection = B
        +-- Registry cria Model B
        `-- inicia o Agent Loop B
```

Se o Model não puder ser criado, o Submission não atualiza apenas a Session Selection. As mudanças de estado correspondentes são submetidas somente depois de criação e início bem-sucedidos.

### start-now especial: tarefa ociosa

O Submission ocioso também carrega uma ModelSelection padrão, mas o execution context o marca como valendo somente para o Loop atual:

```text
Idle Submission accepted while Core is idle
        |
        +-- App Recent: inalterado
        +-- Session Selection: inalterado
        +-- Registry cria o Model ocioso
        +-- Request Auth é injetado durante a requisição
        `-- inicia o Agent Loop ocioso
```

Não se trata de um Provider temporário nem de um segundo ModelFactory. Quando o Core está ocupado, o Submission ocioso é simplesmente rejeitado e não entra na Queue comum; quando termina, também não há necessidade de "restaurar" a Session Selection, porque esse estado nunca foi reescrito antes da execução.

## Queue

### Todo151: fidelidade dos campos na submissão

O ciclo `TurnInputIntentMetadata -> QueueItem -> TurnInputIntentMetadata` da CLI precisa preservar a seleção de model, as permissões, os attachments / contexto compartilhado e a associação de origem. O QueueItem é uma projeção de protocolo que também é lida pelo caminho de execução elevada (elevated), portanto omitir campos não pode ser tratado como um problema puramente de exibição. A edição no lugar altera apenas o corpo; a reordenação não altera o conteúdo; a elevação automática / manual preserva o sourceCommandId original. Na compatibilidade com eventos antigos, é permitido manter os campos já existentes do mesmo item, mas não ler o Composer atual nem uma Session mutável para completar uma nova seleção.
O novo estado de Plan trafega pelo mesmo caminho, e false é diferente de ausente. Não é introduzida nenhuma fila de Host nem nova semântica de agendamento / replay.

Quando o Core está ocupado, o item da Queue guarda o Submission completo:

```text
Queued Submission
├─ prompt
├─ attachments
├─ mode
└─ ModelSelection
```

Na entrada na Queue, o App pode atualizar o App Recent; a Session Selection e o Active Model mantêm o valor de execução atual. Quando o item da Queue realmente sai da fila e inicia um novo Loop, aí sim a Session Selection é atualizada e o Model é criado.

A reordenação da Queue não altera nenhum conteúdo de Submission. Se no futuro for permitido editar o model de um item enfileirado, a operação precisa modificar diretamente a ModelSelection daquele Queue item e gerar um evento explícito e rastreável.

## Guide e "imediato"

O Guide é a semântica de Core para entrar "imediatamente" no Agent Loop atual:

```text
Active Loop
├─ Session Selection A
└─ Active Model A
          +
Guide Submission B
          |
          | cria o Model B e conclui o admission
          v
Active Loop
├─ Context recebe o Guide input
├─ Session Selection A -> B
└─ Active Model A -> B
```

A injeção no Context, a atualização da Session Selection e a troca do Active Model formam um único resultado de recepção. Se a criação do Model, a injeção no Context ou o admission falhar, nenhuma parte é submetida; o Submission completo vai para a Queue comum.

Requisições de model já emitidas continuam sendo concluídas pelo Model A, e o Usage é atribuído a A. A troca ocorre na fronteira de um Model Step; os Steps seguintes e o Compact automático subsequente usam o Model B.

O "imediato" pode vir do Composer atual ou de um Queue item já existente. Nos dois casos usa-se a Selection já salva no Submission de destino, sem ler a seleção atual do Composer no momento do clique.

## App Recent e Session Selection

```text
O App aceita o Submission
├─ start-now -> atualiza o App Recent
├─ queue     -> atualiza o App Recent
└─ Guide     -> atualiza o App Recent

O Core começa a executar o Submission
├─ start new Loop -> atualiza a Session Selection
└─ accept Guide   -> atualiza a Session Selection
```

Esses dois momentos resolvem problemas diferentes: o App Recent serve à próxima criação de App Session; a Session Selection serve à execução contínua da Session atual. Um Submission enfileirado mas ainda não executado não altera a Session Selection antecipadamente.

## Edit e Retry

Edit e Retry têm como origem um Submission existente:

```text
Source Submission
├─ prompt X
└─ ModelSelection A
        |
        ├─ Edit  -> prompt Y + ModelSelection A
        └─ Retry -> prompt X + ModelSelection A
```

A Selection da origem é herdada por padrão, tornando a operação independente do estado atual do Composer. Se o produto adicionar "repetir usando a seleção atual", esse comando deve fornecer explicitamente uma nova ModelSelection e gerar um novo Submission completo.

## Restrições de recepção

- A Selection do Submission é fixada no momento da submissão na Entry.
- start-now, Queue e Guide compartilham o mesmo tipo de Submission.
- A atualização do App Recent não significa que o Submission já começou a executar.
- A atualização da Session Selection precisa permanecer consistente com a recepção da execução.
- A troca do Active Model não modifica o Model antigo nem reatribui requisições já emitidas.
- Em caso de falha de entrega, o Submission completo é preservado, sem deixar resultados intermediários que atualizaram apenas parte do estado.
- O start-now especial ocioso não escreve no App Recent nem na Session Selection, e não entra na Queue comum.