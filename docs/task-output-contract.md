# Contrato da ferramenta TaskOutput

## Escopo

- Esta especificação cobre apenas a `TaskOutput` visível ao provider, seus aliases de compatibilidade, a leitura de estado de execução, a projeção de saída e a deduplicação da notificação de conclusão.
- Não adiciona `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, runtime de `remote_agent` nem a infraestrutura de ToolSearch/deferred-loading.

## Contrato visível ao provider

O provider recebe apenas uma tool canônica:

```text
TaskOutput
```

Os nomes abaixo existem somente como aliases de chamada local e não entram novamente nas tools do provider:

```text
AgentOutputTool
BashOutputTool
AgentOutput
BashOutput
```

A descrição visível ao provider deve ser literalmente igual a:

```text
DEPRECATED: Background tasks return their output file path in the tool result, and you receive a <task-notification> with the same path when the task completes.
- For bash tasks: prefer using the Read tool on that output file path — it contains stdout/stderr.
- For local_agent tasks: use the Agent tool result directly. Do NOT Read the .output file — it is a symlink to the full subagent conversation transcript (JSONL) and will overflow your context window.
- For remote_agent tasks: prefer using the Read tool on the output file path — it contains the streamed remote session output (same as bash).

- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions
```

O schema de entrada é um objeto strict:

| Campo | Schema do provider | Runtime |
| --- | --- | --- |
| `task_id` | string obrigatório, `The task ID to get output from` | String vazia gera `Task ID is required` |
| `block` | boolean obrigatório, default `true`, `Whether to wait for completion` | O default ainda é aplicado quando omitido; há compatibilidade adicional com as strings `"true"` / `"false"` |
| `timeout` | number obrigatório, default `30000`, min `0`, max `600000`, `Max wait time in ms` | O default ainda é aplicado quando omitido; unidade em milissegundos |

O `input_schema.required` do provider é fixo em
`["task_id", "block", "timeout"]`. Nele, `block` e `timeout` mantêm também o default do runtime;
a restrição required governa o wire input gerado pelo modelo, enquanto o default continua compatibilizando aliases locais, chamadas históricas e chamadas manuais.

A ferramenta é somente leitura, segura para uso concorrente e não requer aprovação. Ela não declara deferred-loading (`shouldDefer`), já que o ZCode atualmente não implementa o mecanismo de descoberta do ToolSearch.

Os erros de entrada voltados ao provider são divididos em duas camadas:

- Campo `task_id` ausente ou com tipo errado: usa a validação de schema inicial genérica, retornando
  `<tool_use_error>InputValidationError: ...</tool_use_error>` e marcando `is_error:true`.
- `task_id` é uma string vazia: retorna
  `<tool_use_error>Task ID is required</tool_use_error>` e marca `is_error:true`.
- `task_id` não vazio, mas inexistente no registry: retorna
  `<tool_use_error>No task found with ID: <task_id></tool_use_error>` e marca
  `is_error:true`.

Os dois últimos casos são retornados pelo `validateInput` da `TaskOutput` depois da validação de schema inicial e antes do `PreToolUse`, como `{ result:false, errorCode:1|2, message }`. Em caso de falha, `PreToolUse`, a verificação de permissões, o handler e o `PostToolUseFailure` não são executados. O executor não reconhece o nome específico da tool; ele apenas monta uniformemente o resultado de falha e encerra o evento da tool. O `modelContent` voltado ao provider usa `<tool_use_error>`, enquanto a UI, os logs e o erro estruturado continuam preservando a message original sem a tag.

O handler continua reverificando o registry antes da leitura real, cobrindo a corrida em que a tarefa é removida após a validação ou em que um hook modifica a entrada; essa verificação defensiva não altera o caminho normal de leitura e espera.

## Estado e notificações

O `RuntimeTaskRegistry` é a única fonte de existência e estado das tarefas:

```text
running / pending + block=false -> not_ready + atual task
running / pending + block=true  -> polling a cada 100ms
                                   terminal -> success + atual task
                                   timeout  -> timeout + task mais recente
                                   removed  -> timeout + task:null
terminal                         -> success + atual task
```

- Task não encontrada na primeira busca: `No task found with ID: <task_id>`.
- `block=true` emite um `ToolCallProgress` padrão antes de começar a espera. O ZCode reaproveita o schema de progress existente e não adiciona campos de Protocol exclusivos de TaskOutput; essa projeção interna não afeta o result visível ao provider.
- `timeout=0` não dorme e retorna diretamente o snapshot atual.
- O abort lança AbortError.
- `notified:true` é gravado de forma atômica somente depois de a projeção de saída do estado final ter sucesso; falha de projeção ou abort não pode consumir a claim de notificação.
- Antes de enfileirar a notificação de conclusão, a mesma verificação e escrita de `notified` é feita, garantindo que a corrida entre TaskOutput e a conclusão produza no máximo um `<task-notification>`.

## Fontes de saída

- `local_bash`: semanticamente, prioriza o stdout e o stderr da task shell ativa, concatenados com um único `\n`; quando indisponível, lê o arquivo de saída da tarefa; `exitCode` vem do resultado de execução.
  - O stdout/stderr das novas tasks Bash é escrito diretamente no mesmo canonical output file,
    com flags, soft limit e ciclo de vida descritos em `docs/bash-background-parity.md`. Em execução, a TaskOutput continua lendo a partir do offset 0 no máximo 30000 bytes, sem adicionar aviso de omissão no início e sem novas variáveis de ambiente de override; quando o arquivo está indisponível,
    recorre ao texto inline do resultado de execução ou à cauda do progress. Quando o estado final ou o snapshot da task ativa não estão disponíveis, usa a leitura genérica do arquivo de saída da task, lendo no máximo os últimos 8 MiB.
  - O exit do shell root já liquida a execução, sem esperar os descendentes fecharem o handle de saída. O estado final do registry não promete um arquivo estável,
    e os descendentes podem continuar escrevendo; uma nova consulta pode ler conteúdo tardio, mas sem reativar a tarefa nem reenviar a notificação de conclusão.
    Depois que o cabeçalho estoura o orçamento, consultas repetidas em execução podem manter o mesmo conteúdo; o progresso mais recente vem da leitura de cauda limitada do Bash.
  - Texto de framework error, timeout/cancel ainda pode existir no stderr estruturado. A TaskOutput o adiciona ao final do canonical command output; como o canonical file não contém esse texto, o arquivo não pode ser descrito como saída completa e unificada nesse momento.
  - Snapshots históricos de split-path ainda podem ser lidos como stdout seguido de stderr, mas quando dois arquivos diferentes compõem o resultado, não se cria um artefato unificado nem se faz nenhum caminho de fluxo único passar por `Full output`. Textos muito grandes ficam a cargo do limite de persistência de 100000 caracteres da própria TaskOutput.
- `local_agent`: no estado final, prioriza os blocos de conteúdo do resultado do Agent, concatenados com um único `\n`; caso contrário, lê o arquivo de saída da tarefa. A ausência do arquivo de saída não afeta a existência nem o estado da tarefa.
- Outros tipos de task do ZCode já registrados: lê o arquivo de saída genérico registrado no registry.
- Quando a leitura do arquivo de saída falha ou ele não existe, retorna string vazia.
- O arquivo de saída genérico e o de estado final são lidos no máximo nos últimos 8 MiB; ao omitir o início, é adicionado
  `[NKB of earlier output omitted]\n`. O Bash em execução usa a regra independente de leitura do início do arquivo descrita acima.

`TASK_MAX_OUTPUT_LENGTH` tem padrão `32000` caracteres e máximo de `160000` caracteres; é analisado com `parseInt` decimal, portanto strings com um prefixo numérico válido têm efeito conforme esse número; valores vazios, não analisáveis ou não positivos usam o padrão. A saída acima do limite precisa virar:

```text
[Truncated. Full output: <task-output-path>]

<tail preservado>
```

Quando o limite efetivo não for menor que o comprimento do prefixo, o total de caracteres do prefixo mais a cauda é igual ao limite efetivo. Quando o limite efetivo for menor que o comprimento do prefixo, o comportamento original de slice com limites negativos é preservado, sem correção adicional.

## Result visível ao provider

O resultado comum é texto puro. Cada bloco é separado por duas quebras de linha e não há XML escaping:

```text
<retrieval_status>success|not_ready|timeout</retrieval_status>

<task_id>...</task_id>

<task_type>...</task_type>

<status>...</status>

<exit_code>...</exit_code>

<output>
...
</output>

<error>...</error>
```

- Quando `task` é `null`, apenas o `retrieval_status` é emitido.
- `exit_code` só é emitido quando o valor não é `null` / `undefined`.
- Quando `output.trim()` fica vazio, a tag output inteira é omitida; o corpo usa `trimEnd()`.
- `error` só é emitido quando for truthy.
- É proibido emitir `description`, `prompt`, `result`, `output_file`, `truncated` ou um wrapper JSON.

Quando o texto completo mapeado excede 100000 caracteres, o texto completo é salvo como `text/plain` (o artefato local usa `.txt`) e um envelope `<persisted-output>` é devolvido ao provider; quando a persistência falha, o texto original é preservado. O `resultBudget` genérico do ZCode não pode reescrever novamente o texto da TaskOutput.

## Projeção de exibição na UI

O card exclusivo da UI usa metadata de tool concluída separado, sem fazer parse nem reescrever o texto visível ao provider descrito acima:

- `task_id` é lido direto do input da tool.
- O Core gera o display `task_output` a partir do resultado do handler, mantendo apenas `retrievalStatus`, um `taskStatus` opcional de no máximo 64 caracteres, um `output` opcional de no máximo 2000 caracteres e `truncated` opcional.
- O output passa por `trimEnd()` e mantém os primeiros 2000 caracteres; output em branco não entra no display, e a parte de output já lida enquanto a execução está em andamento pode ser exibida.
- O display não inclui task type, description, error, prompt, result, output path nem XML do provider; esses campos também não entram no corpo do resumo do card nem no conteúdo expandido. O motivo de uma falha real de execução da tool entra apenas pelo `context.errorText` formado por `ToolCallRow.error` no estado de falha genérico do `ToolLayout`, permitindo hover/copy pelo usuário, e não é gravado de volta no display `task_output`.
- O display chega à UI compartilhada pelos metadata de concluída existentes e pelo `ToolCallRow.display` do V4; quando um registro antigo não tem display,
  apenas o task id e o ciclo de vida genérico da tool são exibidos, sem fallback de XML/JSON e sem migração de persistência.

Essa projeção é usada apenas pelo componente de renderização compartilhado pelo desktop, pela Web comum e pelo controle remoto do celular, e não altera o handler da TaskOutput, a máquina de estados, os adapters do provider nem a semântica de entrega de desktop continuous / web remote replayable.

## Aceitação

- O provider tool name, a descrição e o input schema são exatamente iguais ao golden acima.
- As duas cadeias de provider adapter passam o texto do resultado da TaskOutput sem alteração.
- Um Agent em execução, mesmo sem arquivo de saída ainda, retorna `not_ready` e `running`.
- As duas ordens de corrida entre a leitura de estado final da TaskOutput e a notificação de conclusão produzem apenas uma notificação.
- Valores padrão, máximo, inválido, com prefixo numérico e menor que o prefixo de truncamento de `TASK_MAX_OUTPUT_LENGTH`, a leitura de cauda de 8 MiB e a persistência de texto de 100000 caracteres têm teste focado.
- O teste focado de Bash precisa cobrir o canonical output file, a leitura fixa de 30000 bytes do início do arquivo durante a execução,
  a projeção de processo ainda rodando após timeout, o fallback inline/tail, o framework stderr, a compatibilidade com split-path histórico e o caminho real de `Full output` correspondente ao canonical file.