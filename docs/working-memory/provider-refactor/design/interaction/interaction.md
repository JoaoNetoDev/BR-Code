# Como a seleção de modelo entra em uma execução

A seleção de modelo na caixa de entrada expressa a intenção do usuário para o próximo envio. Depois que a mensagem é enviada, essa seleção é fixada junto com o Submission; quando o Submission começa a executar, o Session registra a Selection que será usada nas execuções seguintes, e o Agent Loop cria e mantém o Model que efetivamente faz as requisições.

```text
Composer Selection
        |
        | submit
        v
Submission ModelSelection
        |
        | start Agent Loop
        v
Session Selection
        |
        | ModelFactory（Registry lookup / validate）
        v
Active Model
```

Essa cadeia separa "o que eu quero usar da próxima vez" de "o que está em uso agora". O seletor de modelo sempre serve ao próximo envio; o modelo em execução é representado por um estado de execução independente.

## Caminho normal de uma mensagem

Suponha que o Session tenha usado o modelo A por último, que o usuário selecione o modelo B na caixa de entrada e envie a mensagem:

```text
Session Selection = A
Active Model = A

用户在 Composer 选择 B
        |
        v
提交 prompt + ModelSelection B
        |
        v
Core 接收完整 Submission
        |
        v
启动新的 Agent Loop
├─ Session Selection: A -> B
├─ Registry 根据 B 创建 Model B
└─ Active Model = B
        |
        v
本 Loop 的模型请求使用 Model B
```

Se o Provider Config ou o Registry mudar durante a execução do Loop, o Model já criado não é modificado. O Registry atual é relido na próxima criação de um Model, portanto as novas configurações valem a partir do próximo trecho de execução.

## Os três estados centrais

| Estado               | Significado expresso                                | Dono              | Ciclo de vida                                     |
| ------------------ | ---------------------------------------------------- | ----------------- | -------------------------------------------------- |
| Composer Selection | Qual modelo o próximo envio quer usar               | Composer da Entry | Editável antes do envio                            |
| Session Selection  | Qual modelo o Session mantém nas execuções seguintes | Session Store     | Atualizado quando o envio inicia a execução ou quando um Guide é recebido |
| Active Model       | Qual modelo o Loop em curso realmente chama         | Agent Loop        | Mantido dentro do Loop; um Guide pode trocar na fronteira de um Step |

O Draft é o portador persistente do estado do Composer. O App Recent do Workspace e o `preferredSelection` do Host servem apenas para fornecer a Selection inicial ao Composer e não participam das requisições do modelo atual; o `preferredSelection` já contém a resolução atômica que o Host faz do Default Configurado e da Fallback Policy.

```text
Draft / workspace Recent / Host preferred
                 |
                 | initialize
                 v
        Composer Selection
                 |
                 | submit
                 v
       Submission Selection
                 |
                 | accepted for execution
                 v
         Session Selection
                 |
                 | create
                 v
            Active Model
```

O escopo de persistência de cada estado e as regras de inicialização do App, do TUI e do Prompt CLI estão em [`selection-state.md`](./selection-state.md).

## A forma de recebimento determina o momento da atualização

O mesmo Submission pode iniciar imediatamente, entrar na Queue ou ser recebido como Guide no Loop atual. A Selection sempre pertence ao Submission; a forma de recebimento apenas muda quando ela passa a ser o estado do Session e de execução.

```text
CoreSubmission B
├─ start now
│  └─ 启动 Loop B，Session Selection 与 Active Model 更新为 B
│
├─ queue
│  └─ 完整保存 B；真正出队启动时再更新 Session 和 Model
│
└─ Guide / 立即
   └─ 当前 Loop 接收后，Session 更新为 B，后续 Model Step 使用 Model B
```

O diagrama acima descreve um Submission de usuário comum. Tarefas ociosas são um `start-now` especial: o Submission ainda carrega uma `ModelSelection` padrão, mas o contexto de execução deixa explícito que ela vale apenas para este Loop. O Core usa o mesmo Registry e o mesmo ModelFactory para criar o Model ocioso, não grava no App Recent, não altera a Session Selection e não entra na Queue comum; quando o Core está ocupado, a requisição é recusada diretamente.

Como exemplo, no App as mudanças de estado são as seguintes:

| Evento                                        | App Recent | Session Selection | Active Model                       |
| --------------------------------------------- | ---------- | ----------------- | ---------------------------------- |
| O Loop A está em execução e o usuário seleciona B no Composer | A          | A                 | A                                  |
| O Submission B é recebido e entra na Queue   | B          | A                 | A                                  |
| O B que estava na Queue começa a executar     | B          | B                 | B                                  |
| O Guide C é recebido pelo Loop atual          | C          | C                 | A requisição atual mantém o Model anterior; os Steps seguintes usam C |

O App Recent é atualizado quando o App confirma que o Submission foi recebido como start-now, queue ou Guide. A Session Selection é atualizada quando o Submission realmente inicia um Loop ou quando o Loop atual o recebe como Guide. O Prompt CLI e o TUI não leem nem escrevem no App Recent.

A sequência completa de Queue, Guide e envios derivados está em [`submission-delivery.md`](./submission-delivery.md).

## Seleção inicial do Composer

Ao criar ou restaurar um Composer, a Entry obtém o valor inicial a partir dos estados aos quais tem direito:

| Cenário                     | Ordem de inicialização                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| Nova Session no App         | Draft → App Recent do workspace ainda selecionável na View atual do Host → preferred do Host |
| Nova Session no TUI         | Draft → preferred do domínio                                                     |
| Restaurar Session no App / TUI | Draft → Session Selection                                                     |
| Nova Session no Prompt CLI  | argumento explícito de modelo → preferred do domínio                            |
| Restaurar Session no Prompt CLI | argumento explícito de modelo → Session Selection                          |

A inicialização acontece apenas ao criar ou restaurar um Composer. Enquanto o Composer está vivo, vale o estado em memória que está sendo editado; atualizações do Provider Registry podem marcar a seleção atual como indisponível, mas nunca substituem silenciosamente uma escolha que o usuário ainda não enviou.

## Queue e Guide

Um item da Queue guarda o Submission completo, incluindo a ModelSelection já determinada no momento. Reordenar a Queue não altera a Selection; clicar em "imediato" também usa a Selection do próprio item da Queue, sem ler o valor que está agora no Composer.

Guide e o "imediato" do produto adotam a mesma semântica do Core. Depois que o Guide é recebido, a injeção de Context, a atualização da Session Selection e a troca do Active Model formam uma mudança atômica. As requisições já emitidas são concluídas pelo Model antigo; a partir do próximo Model Step passa a ser usado o novo Model. Se a criação do novo Model ou a injeção falhar, o Submission completo é mantido como um item comum da Queue.

## Edit, Retry e exibição do estado de execução

Edit e Retry derivam de um Submission existente e, por padrão, herdam a ModelSelection do Submission de origem. Eles não leem a Selection atual do Composer; se no futuro o produto passar a oferecer "repetir com o modelo atual", a nova Selection precisará ser carregada explicitamente no novo Submission.

O seletor de modelo continua exibindo a Selection do próximo envio. O modelo em execução, o modelo de tarefas ociosas e o resultado da troca por Guide pertencem ao estado de execução e podem ser exibidos nos detalhes da execução ou em um banner específico, sem reescrever o seletor de modelo para simular o estado de execução.

## Restrições estáveis

- prompt, attachments, mode e ModelSelection são recebidos juntos como um Submission.
- Queue e Guide usam a Selection já fixada no Submission.
- O Session persiste apenas a ModelSelection, não o Model.
- Usage, Trace e a atribuição de erros leem o Model que efetivamente fez a requisição.
- Composer Selection, Session Selection e Active Model têm eventos de escrita independentes e não servem como projeção um do outro.
- Tarefas ociosas ainda carregam apenas uma ModelSelection padrão; Request Auth, Ticket, informações de atribuição e Subagent override pertencem ao contexto de execução, veja [`../execution/execution.md`](../execution/execution.md). Elas não formam um segundo conjunto de Execution Model, Selection ou configuração estática temporária de Provider.

## Subdocumentos

- [`selection-state.md`](./selection-state.md) explica a propriedade dos estados de Selection, seus suportes em memória e persistentes, e as regras de inicialização para diferentes Entry.
- [`submission-delivery.md`](./submission-delivery.md) explica o recebimento de CoreSubmission, start-now, Queue, Guide, Edit e Retry, e o momento da atualização de estado.