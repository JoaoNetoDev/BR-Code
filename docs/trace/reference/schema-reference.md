# Dicionário de Span, Attribute, Event e Metric

> Este documento define os Span, Attribute, Event e Metric do Telemetry Schema Version 6. Os princípios de design e exemplos de uso estão em
> [CLI Agent Telemetry 设计与开发规范](../cli-agent-telemetry.md).

Este arquivo precisa ser mantido manualmente. O TypeScript consegue restringir os parâmetros dos Setters, mas não substitui a explicação do significado dos campos, da semântica de ausência, da privacidade, da cardinalidade, dos usos de consulta e das relações de herança. Ao adicionar ou modificar qualquer Span, Attribute, Event, Metric ou alias de compatibilidade, este arquivo deve ser atualizado junto.

## 1. Convenções de nomenclatura e tipos

### 1.1 Span Name

O Span Name é estável e de baixa cardinalidade:

```text
agent_turn
agent_step
tool_execution
command_execution
context_compaction
detached_operation
model_call
model_attempt
```

Não se cria um `span_type` separado. Valores dinâmicos como índice, modelo, Provider e Tool Name entram apenas como Attribute.

### 1.2 Canonical Attribute

```text
zcode.<span_name>.<property>
zcode.execution.<property>
zcode.telemetry.<property>
zcode.runtime.<property>
zcode.device.<property>
```

Span Attribute usa o Span Name com underscore, por exemplo `zcode.model_attempt.requested_model`. O nome de Metric usa domínios separados por ponto, no estilo OTel, por exemplo `zcode.model.attempt.duration`. Os dois têm usos diferentes e não devem ser trocados mecanicamente.

Convenções:

- Attribute de tempo termina explicitamente em `_ms`, em milissegundos;
- a OTel Unit de Duration Metric é `s`;
- Count/Index são inteiros;
- Token é inteiro não negativo;
- valores booleanos só são escritos quando o fato for explícito;
- ausência significa "não observado/não aplicável" e não pode ser interpretada como false ou 0;
- Stable Enum usa minúsculas em snake_case;
- Model/Finish Reason/Error Code original do Provider não são manualmente colapsados, mas sofrem restrição de tamanho e de caracteres.

### 1.3 Fase de origem do campo

Os campos não precisam de um Schema Registry em runtime. Eles são escritos conforme a fase em que o fato chega:

| Fase     | Origem típica             | Campos típicos                                       |
| -------- | ------------------------- | ---------------------------------------------------- |
| Start    | já definidos ao criar o Span | operation、tool_name、requested_model            |
| Progress | primeira definição no ciclo de vida | first_content、permission_decision、HTTP status |
| Terminal | definidos na encerramento | outcome、failure_stage、exit_code、finish_reason |
| Resource | definidos na criação do Runtime | version、build、runtime surface              |

Os métodos Writer são a entrada dos campos; as Keys explícitas dentro do Runtime são o mapeamento de saída.

## 2. Campos de Resource

### 2.1 Trace Resource

| Campo                             | Tipo    | Significado e origem                                                  |
| --------------------------------- | ------- | --------------------------------------------------------------------- |
| `service.name`                    | string  | Padrão `zcode-cli-agent`, pode ser sobrescrito por configuração OTEL controlada |
| `service.version`                 | string? | Versão realmente embutida no bundle do CLI, injetada no build a partir de `apps/zcode-cli/package.json` |
| `service.instance.id`             | string  | ID de instância aleatório por processo do CLI                         |
| `deployment.environment.name`     | string? | Ambiente do produto                                                    |
| `process.runtime.name`            | string  | `nodejs`                                                              |
| `process.runtime.version`         | string  | Versão do Node                                                        |
| `os.type`                         | string  | `process.platform` do Node                                            |
| `host.arch`                       | string  | Arquitetura de CPU normalizada                                        |
| `zcode.telemetry.schema_owner`    | string  | Fixo em `cli`                                                         |
| `zcode.telemetry.schema_version`  | integer | Atualmente `5`                                                        |
| `zcode.product.version`           | string? | Versão de build do Desktop/produto                                    |
| `zcode.build.commit_id`           | string? | Commit de build confiável                                             |
| `zcode.runtime.surface`           | enum    | `standalone_cli` / `desktop_local_host` / `remote_workspace_host`     |
| `zcode.runtime.distribution`      | enum    | `source` / `development_bundle` / `packaged` / `unknown`              |
| `zcode.device.installation_id`    | string? | Pseudônimo aleatório de instalação persistido, não um ID de hardware  |

### 2.2 Metric Resource

Metric mantém os campos de serviço, versão, ambiente, Runtime, plataforma e build, mas omite:

```text
service.instance.id
zcode.device.installation_id
```

A razão é que eles entram na identidade da Metric Series, fazendo cada instalação e cada processo gerar uma série temporal própria. O Metric Exporter usa DELTA Temporality, adequado a uma grande quantidade de produtores CLI de vida curta.

## 3. Query Projection（projeção de correlação de execução）

Os campos a seguir vêm do `AgentTelemetryExecutionContext` imutável e são projetados apenas nos Span-chave que realmente precisam de busca independente. Eles não são herança de Span nem substituem Parent/Link.

| Campo                                  | Tipo    | Significado                                          | Principais locais de ocorrência                     |
| -------------------------------------- | ------- | ---------------------------------------------------- | --------------------------------------------------- |
| `zcode.execution.session_id`           | string? | Session atual                                       | Turn、Detached、Call、Attempt                        |
| `zcode.execution.parent_session_id`    | string? | Session pai do Child                                | idem                                                  |
| `zcode.execution.turn_id`              | string? | Turn atual                                           | todos os Span-chave com Turn Context                 |
| `zcode.execution.parent_turn_id`       | string? | Turn pai do Child                                   | Turn、Detached、Call、Attempt                        |
| `zcode.execution.query_id`             | string? | Query ID no nível da requisição                      | Turn、Detached、Call、Attempt                        |
| `zcode.execution.actor_kind`           | enum?   | `main` / `subagent` / `workflow_child`              | Turn、Tool、Detached、Call、Attempt                  |
| `zcode.execution.agent_name`           | string? | Nome controlado do Agent                            | Turn                                                  |
| `zcode.execution.identity_state`       | enum?   | `authenticated` / `anonymous` / `unknown`           | Turn                                                  |
| `zcode.execution.user_subject_id`      | string? | ID controlado do sujeito usuário                    | Turn                                                  |
| `zcode.execution.launch_surface`       | enum?   | `desktop` / `standalone_cli` / `web_remote` / `automation` / `bot` | Span com Execution Context        |
| `zcode.execution.tool_call_id`         | string? | ID de correlação de Tool Call                       | Tool、Command、Call/Attempt dentro da ferramenta     |
| `zcode.execution.logical_call_id`      | string? | ID da chamada de modelo lógica                      | Call、Attempt                                         |
| `zcode.execution.model_operation`      | enum?   | Snapshot da Call Operation pai do Attempt           | Attempt                                               |
| `zcode.execution.model_role`           | string? | Snapshot do Model Role da Call pai do Attempt       | Attempt                                               |

`user_subject_id` atualmente não é um campo com hash; o chamador só pode injetar o ID de sujeito confirmado pela fronteira de identidade do produto. ID de instalação e ID de sujeito usuário são proibidos como Metric Label.

## 4. Herança dos campos de ciclo de vida

Cada Span de negócio herda o mesmo conjunto de semânticas de ciclo de vida usando seu próprio prefixo. Por exemplo, `model_attempt` produz:

```text
zcode.model_attempt.outcome
zcode.model_attempt.failure_stage
zcode.model_attempt.error_category
zcode.model_attempt.error_type
zcode.model_attempt.error_code
zcode.model_attempt.error_message
zcode.model_attempt.cancel_reason
zcode.model_attempt.abandon_reason
```

| Property         | Tipo    | Condição de escrita  | Significado                                          |
| ---------------- | ------- | -------------------- | ---------------------------------------------------- |
| `outcome`        | enum    | todos os Span em estado terminal | Estado terminal do negócio                |
| `failure_stage`  | enum    | `failed`             | Fase de falha dentro deste Span                      |
| `error_category` | enum    | `failed`             | Categoria de erro de baixa cardinalidade              |
| `error_type`     | string? | primeira reivindicação do erro de origem | Nome/tipo do Error, caracteres controlados |
| `error_code`     | string? | primeira reivindicação do erro de origem | Código de erro do SDK/runtime, com caracteres de controle removidos e truncado |
| `error_message`  | string? | primeira reivindicação do erro de origem | Mensagem do erro de origem, anonimizada, com no máximo 2048 caracteres |
| `cancel_reason`  | enum?   | `cancelled`          | Motivo do cancelamento                               |
| `abandon_reason` | enum?   | `abandoned`          | Motivo de encerramento anormal                        |

O mesmo Error pode subir em bolha por Attempt → Call → Step → Turn. O objeto de erro e sua cadeia de `cause` são reivindicados pela primeira vez pelo Span mais próximo da origem; o Span pai ainda registra seu próprio `outcome/failure_stage/error_category`, mas não copia o corpo do erro.

### 4.1 Enums públicos

```text
error_category =
  configuration | authentication | permission | rate_limit | timeout |
  network | provider | parse | cancelled | internal | unknown

cancel_reason =
  user | abort_signal | timeout | shutdown | superseded | unknown

abandon_reason =
  missing_terminal | session_shutdown | process_shutdown
```

## 5. `agent_turn`

Parent: o Turn principal é Root; um Child Agent em foreground pode ser Tool Child; um Child Agent em background é um novo Root + Link.

| Campos exclusivos                    | Tipo    | Significado                                                   |
| ------------------------------------ | ------- | ------------------------------------------------------------- |
| `zcode.agent_turn.turn_number`      | integer | Número do Turn dentro da Session                              |
| `zcode.agent_turn.input_source`     | enum?   | `user` ou Synthetic Message Source controlado                 |
| `zcode.agent_turn.result_type`      | enum?   | `assistant_message` / `tool_request` / `no_output` / `other`  |

```text
outcome       = completed | failed | cancelled | abandoned
failure_stage = setup | agent_loop | finalize | unhandled
```

No Start são projetados Session/Turn/Query completos, Actor, Agent, Identity e Launch Surface.

## 6. `agent_step`

Parent: `agent_turn`.

| Campos exclusivos                      | Tipo    | Significado                                    |
| -------------------------------------- | ------- | ---------------------------------------------- |
| `zcode.agent_step.step_id`             | string  | ID da mensagem/execução correspondente ao Step  |
| `zcode.agent_step.step_index`          | integer | Número do Step dentro do Turn, começando em 0  |
| `zcode.agent_step.terminal_reason`     | enum?   | Motivo do encerramento normal                  |

```text
terminal_reason =
  model_completed | tool_requested | turn_completed | compaction_requested

outcome       = completed | discarded | failed | cancelled | abandoned
failure_stage = prepare | model | tool | commit | unhandled
```

## 7. `tool_execution`

Parent: normalmente `agent_step`; chamadas de modelo e comandos internos da ferramenta são Children dele.

| Campos exclusivos                                  | Tipo     | Significado                                                          |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `zcode.tool_execution.tool_name`                   | string   | Nome controlado no Tool Registry                                     |
| `zcode.tool_execution.permission_decision`         | enum?    | `granted` / `denied` / `not_required`                                |
| `zcode.tool_execution.permission_denial_reason`    | enum?    | `user_denied` / `policy_denied` / `unavailable` / `unknown`          |
| `zcode.tool_execution.output_bytes`                | number?  | Tamanho do resultado da Tool após serialização, sem o corpo          |
| `zcode.tool_execution.output_truncated`            | boolean? | Se a saída foi truncada; omitido quando desconhecido                  |

```text
outcome = completed | denied | failed | cancelled | abandoned

failure_stage =
  lookup | validation | permission | pre_hook | handler |
  post_hook | serialize | unhandled
```

Events:

- `permission_requested`：no máximo um por Tool；
- `permission_decided { decision }`：escrito apenas quando houve requisição e foi necessário uma decisão final.

## 8. `command_execution`

Parent: `tool_execution`. Criado apenas quando um processo do SO é realmente iniciado; não se aplica a Tools comuns como Read/Write.

| Campos exclusivos                            | Tipo     | Significado                                                    |
| -------------------------------------------- | -------- | -------------------------------------------------------------- |
| `zcode.command_execution.safe_name`          | string   | Família de comandos da Allowlist, por exemplo `git.status`, não o comando bruto |
| `zcode.command_execution.category`           | enum     | Categoria do comando                                           |
| `zcode.command_execution.command_count`      | integer  | Quantidade de comandos no Pipeline                             |
| `zcode.command_execution.shell_kind`         | enum?    | `bash` / `zsh` / `sh` / `powershell` / `cmd` / `other`        |
| `zcode.command_execution.sandboxed`          | boolean  | Se a execução ocorreu em Sandbox                               |
| `zcode.command_execution.first_output_ms`    | number?  | Tempo até a primeira saída, em milissegundos                   |
| `zcode.command_execution.exit_code`          | integer? | Código de saída do processo do SO; omitido quando não houve     |
| `zcode.command_execution.signal`             | string?  | Identificador controlado do Signal de término                  |
| `zcode.command_execution.output_bytes`       | number?  | Quantidade de bytes de saída, sem o corpo                      |
| `zcode.command_execution.timed_out`          | boolean? | Se houve timeout explícito                                     |

```text
category = shell | git | package_manager | build | test | file | network | other
outcome = completed | failed | cancelled | backgrounded | abandoned
failure_stage = prepare | spawn | execute | timeout | collect_output | unhandled
```

Events:

- `first_output`：no máximo um；
- `termination_requested { reason }`，com reason sendo `cancelled/timeout/shutdown`。

O comando completo, os argumentos, scripts, caminhos, cwd e variáveis de ambiente são proibidos no reporte.

## 9. `context_compaction`

Parent: o Turn atual; normalmente pertence ao mesmo Turn do Step que o disparou, mas não é um "campo de recuperação de erro" do Step. As requisições de modelo internas são Child Call/Attempt.

| Campos exclusivos                                                | Tipo     | Significado                                             |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `zcode.context_compaction.trigger`                              | enum     | `CompactTrigger` em Contracts                           |
| `zcode.context_compaction.phase`                                | enum     | `CompactPhase` em Contracts                             |
| `zcode.context_compaction.model_mode`                           | enum     | `streaming` / `non_streaming`                           |
| `zcode.context_compaction.outer_attempt`                        | integer? | Número da tentativa de recuperação externa              |
| `zcode.context_compaction.max_attempts`                         | integer? | Máximo de tentativas externas                            |
| `zcode.context_compaction.triggering_step_index`                | integer? | Número do Step que disparou a compactação                |
| `zcode.context_compaction.recovered_from_logical_call_id`       | string?  | Call ID de origem da recuperação                         |
| `zcode.context_compaction.input_tokens`                         | number?  | Token de contexto provider-visible atual quando a compactação é disparada por Auto/Reactive |
| `zcode.context_compaction.output_tokens`                        | number?  | Token de saída da compactação                            |
| `zcode.context_compaction.policy_context_window_tokens`         | number?  | Janela de contexto de política usada pelo modelo nesta execução Auto/Reactive |
| `zcode.context_compaction.threshold_tokens`                     | number?  | Limiar de disparo usado nesta decisão do Auto Compact; pode ser omitido para outros tipos de disparo |
| `zcode.context_compaction.token_source`                         | enum?    | `estimate` / `provider_usage`; indica a origem de `input_tokens` |

```text
outcome = completed | discarded | failed | cancelled | abandoned
failure_stage = prepare | model | parse | commit | fallback | unhandled
```

Event: `fallback_selected { reason }`，com reason sendo um enum controlado.

Auto Compact reutiliza diretamente a decisão de política existente. Reactive Compact reutiliza a mensagem provider-visible do caminho de overflow: prioriza o último Provider Usage combinado com a estimativa das mensagens após o snapshot e, na ausência dele, usa a estimativa local; não escreve `threshold_tokens`. A janela do Reactive é obtida, nesta ordem, do modelo em execução do turn atual, da configuração do Runtime e do valor padrão de Compact. Manual, Partial e SessionMemory omitem esses três campos de contexto. Esses campos são reportados apenas como Span attributes, não como Metric labels.

## 10. `detached_operation`

Usado para operações que ainda precisam de resultado e tempo próprios fora do Turn. Em foreground pode ser Child; Queued/Background usam Root + Link.

| Campos exclusivos                             | Tipo     | Significado                                                          |
| --------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `zcode.detached_operation.operation`          | enum     | Tipo de operação da seção 10.1                                       |
| `zcode.detached_operation.execution_kind`     | enum     | `foreground` / `queued` / `background`                                |
| `zcode.detached_operation.trigger`            | enum     | `user` / `turn` / `tool` / `scheduler` / `recovery` / `other`         |
| `zcode.detached_operation.target_kind`        | enum?    | `session` / `goal` / `workspace` / `project_memory` / `other`        |
| `zcode.detached_operation.goal_iteration`     | integer? | Número da iteração do Goal                                           |
| `zcode.detached_operation.chunk_index`        | integer? | Número do Chunk                                                      |
| `zcode.detached_operation.chunk_count`        | integer? | Total de Chunks                                                      |
| `zcode.detached_operation.result_type`        | enum?    | `text` / `boolean` / `metadata` / `other`                            |

```text
outcome = completed | failed | cancelled | abandoned
failure_stage = schedule | execute | commit | unhandled
```

### 10.1 Catálogo de Operation

| Operation                         | Significado                        | Categoria de entrada |
| --------------------------------- | ---------------------------------- | -------------------- |
| `goal_completion_verification`    | Verificação de conclusão de Goal   | system-sidecar        |
| `goal_title_generation`           | Geração de título de Goal          | system-sidecar        |
| `project_memory_extract`          | Extração de Project Memory        | system-sidecar        |
| `project_memory_dream`            | Dream/organização de Project Memory | system-sidecar       |
| `project_memory_recall`           | Recall de Project Memory           | system-sidecar        |
| `read_session_context_extract`    | Etapa de extração do Session Context | tool                |
| `read_session_context_synthesize` | Etapa de síntese do Session Context | tool                |
| `session_title_generation`        | Geração de título de Session       | system-sidecar        |
| `tool_internal_model_call`        | Trabalho de modelo dentro da Tool não listado separadamente | tool/system |
| `web_fetch_processing`            | Processamento de conteúdo do Web Fetch | tool                |
| `web_search`                      | Requisição de modelo do Web Search | tool                  |
| `workspace_git_commit_message`    | Geração de Git Commit Message      | system-sidecar        |
| `workspace_generate_text`         | Geração de texto genérica do Workspace | system-sidecar   |

`agent_step` e `context_compaction` também pertencem a `AgentTelemetryOperation`, mas têm Span pai próprio e não são operation de Detached Start.

A "categoria de entrada" serve apenas para compreender a Operation; não é `zcode.execution.actor_kind`. Este último descreve somente o Agent Runtime que executa a operação: `main/subagent/workflow_child`.

## 11. `model_call`

Parent: `agent_step`, `context_compaction`, `tool_execution` ou `detached_operation`. Uma Call lógica contém um ou mais Attempt físicos.

| Campos exclusivos                                           | Tipo     | Significado                                                          |
| ------------------------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `zcode.model_call.operation`                                 | enum     | Uso de negócio da chamada de modelo                                   |
| `zcode.model_call.streaming`                                 | boolean  | Se a chamada lógica pediu modo streaming                               |
| `zcode.model_call.model_role`                                | string?  | Papel controlado do modelo, como modelo principal ou rápido           |
| `zcode.model_call.requested_provider_id`                     | string   | ID de configuração de Provider já resolvido                            |
| `zcode.model_call.requested_model`                           | string   | Model solicitado pelo usuário/chamador                                |
| `zcode.model_call.call_cause`                                | enum     | `initial` / `continuation` / `fallback_replacement` / `recovery`      |
| `zcode.model_call.previous_logical_call_id`                  | string?  | ID lógico anterior para chamadas não initial                          |
| `zcode.model_call.reasoning_capability`                      | enum     | `supported` / `unsupported` / `unknown`                               |
| `zcode.model_call.reasoning_requested_state`                 | enum     | `enabled` / `disabled` / `provider_default` / `unknown`               |
| `zcode.model_call.reasoning_requested_control`               | enum     | Forma de controle, ver abaixo                                         |
| `zcode.model_call.reasoning_requested_level`                 | string?  | Valor original do effort/level solicitado                             |
| `zcode.model_call.reasoning_requested_budget_tokens`         | integer? | Orçamento de pensamento solicitado                                    |

```text
reasoning control =
  fixed_level | fixed_budget | adaptive | toggle | provider_default | unknown

outcome = completed | failed | cancelled | abandoned
failure_stage = resolve_target | attempts | fallback | aggregate | unhandled
```

Reasoning é um conceito normalizado entre Providers; o nome upstream pode ser Thinking ou Reasoning, e ambos são mapeados na camada Adapter para Capability, State, Control e Level/Budget. Modelos desconhecidos ou customizados não podem ser inferidos como disabled.

## 12. `model_attempt`

Parent: `model_call`. SpanKind: `CLIENT`. Um Attempt corresponde a uma requisição real à API do Provider.

### 12.1 Requisição e correlação

| Campo                                     | Tipo    | Significado                                                          |
| ----------------------------------------- | ------- | -------------------------------------------------------------------- |
| `zcode.model_attempt.request_id`          | string  | ID da requisição física do ZCode                                      |
| `zcode.model_attempt.attempt_number`      | integer | Número do Attempt começando em 1                                     |
| `zcode.model_attempt.max_attempts`        | integer | Máximo de tentativas da política atual                                |
| `zcode.model_attempt.attempt_cause`       | enum    | `initial` / `retry` / `fallback`                                     |
| `zcode.model_attempt.previous_request_id` | string? | ID da requisição anterior em Retry/Fallback                          |
| `zcode.model_attempt.retry_delay_ms`      | number? | Tempo de espera antes deste Attempt                                  |
| `zcode.model_attempt.transport`           | enum    | Transport real do Adapter, como `sse` / `json`                        |
| `zcode.model_attempt.api_operation`       | enum    | `messages` / `chat_completions` / `responses` / `generate_content` / `unknown` |

### 12.2 Provider, Endpoint e Model

| Campo                                    | Tipo    | Significado                                     |
| ---------------------------------------- | ------- | ----------------------------------------------- |
| `zcode.model_attempt.provider_id`         | string  | ID da configuração/rota do usuário              |
| `zcode.model_attempt.provider_kind`       | enum    | Tipo de protocolo/fabricante, como `anthropic`, `openai` |
| `zcode.model_attempt.provider_origin`     | string? | `scheme://host[:port]` sanitizado               |
| `zcode.model_attempt.provider_route`      | string? | Path sanitizado, sem Query/Fragment             |
| `zcode.model_attempt.requested_model`     | string  | Model realmente solicitado neste Attempt        |
| `zcode.model_attempt.response_model`      | string? | Model devolvido na resposta do Provider         |
| `zcode.model_attempt.provider_request_id` | string? | ID de requisição devolvido pelo Provider         |

`provider_id` e `provider_kind` são diferentes: o mesmo protocolo compatível com OpenAI pode ter várias instâncias de configuração do usuário; o Origin descreve o local real do serviço acessado. A ausência de Origin significa que o Adapter não forneceu o dado ou que a Base URL não pôde ser resolvida com segurança, e não significa "Provider padrão".

### 12.3 Reasoning

O Attempt repete o Reasoning solicitado pela Call para permitir a consulta independente da requisição física de Provider/Model; e adiciona os valores Effective após a confirmação da resposta:

```text
zcode.model_attempt.reasoning_capability
zcode.model_attempt.reasoning_requested_state
zcode.model_attempt.reasoning_requested_control
zcode.model_attempt.reasoning_requested_level
zcode.model_attempt.reasoning_requested_budget_tokens
zcode.model_attempt.reasoning_effective_state
zcode.model_attempt.reasoning_effective_control
zcode.model_attempt.reasoning_effective_level
zcode.model_attempt.reasoning_effective_budget_tokens
```

Requested representa a intenção que entrou no Provider Adapter; Effective representa o fato finalmente adotado pelo Adapter/Provider. Quando o fato Effective está ausente, o campo é omitido e nunca adivinhado a partir do Requested.

### 12.4 Usage, streaming e resposta

| Campo                                                      | Tipo     | Significado                                                                       |
| ---------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `zcode.model_attempt.input_tokens`                          | number?  | Token de entrada do Provider Usage                                                 |
| `zcode.model_attempt.output_tokens`                         | number?  | Token de saída do Provider Usage                                                   |
| `zcode.model_attempt.reasoning_tokens`                      | number?  | Token de Reasoning do Provider Usage                                               |
| `zcode.model_attempt.cache_read_tokens`                     | number?  | Cache Read Token reportado pelo Provider                                           |
| `zcode.model_attempt.cache_write_tokens`                    | number?  | Cache Write Token reportado pelo Provider                                          |
| `zcode.model_attempt.finish_reason`                         | string?  | Motivo de término original e limitado do Provider                                  |
| `zcode.model_attempt.stream_output_committed`               | boolean | Se, no estado terminal, a saída em streaming já foi entregue ao consumidor de negócio; atualmente o Status Sink normaliza para false quando falta o valor de eventos antigos |
| `zcode.model_attempt.time_to_first_provider_event_ms`       | number?  | Tempo até o primeiro Provider Event                                                |
| `zcode.model_attempt.time_to_first_content_ms`              | number?  | Tempo até o primeiro conteúdo válido                                               |
| `zcode.model_attempt.time_to_first_text_ms`                 | number?  | Tempo até o primeiro trecho de texto                                              |

O Setter de Token recebe valores acumulados, enquanto internamente o Metric registra apenas incrementos monótonos; valores de fallback menores que os já registrados são ignorados, evitando contagem duplicada. "Houve cache hit" não cria um resumo booleano: o fato bruto é expresso pelo Provider retornando `cache_read_tokens > 0`; quando não há Usage, o campo permanece ausente.

### 12.5 HTTP e Error

| Campo                                         | Tipo     | Significado                                                       |
| --------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `zcode.model_attempt.http_status_code`        | integer? | Status HTTP do Provider, por exemplo 429/500; atualmente fornecido pelo Status Event de falha |
| `zcode.model_attempt.provider_error_code`     | string?  | Código de erro original na resposta do Provider                   |
| `zcode.model_attempt.provider_error_message`  | string?  | Mensagem de erro original da resposta do Provider, anonimizada e truncada |
| `zcode.model_attempt.retry_after_ms`          | number?  | Espera de retry indicada pelo Provider                            |

`error_code/error_message` do ciclo de vida representam o Error que encerrou este Span (atualmente o Adapter normalmente passa o Error bruto de Transport/SDK; só quando o objeto Error está ausente eles são construídos a partir do fato do Status); `provider_error_*` representa o fato de erro estruturado da resposta do Provider. Os dois podem existir simultaneamente, não devem se sobrescrever nem ser padronizados por template de error code.

```text
outcome = completed | failed | cancelled | abandoned
failure_stage = configuration | connect | response | stream | parse | validation | unhandled
```

Events:

- `first_provider_event`：no máximo um；
- `first_content`：no máximo um；
- `first_text`：no máximo um；
- `stream_stalled { idle_ms }`：escrito a cada pausa nítida detectada; o Metric mantém apenas Count e Max;
- `fallback_selected { reason }` do `model_call` pai registra a decisão lógica de Fallback.

## 13. Compatibility Adapter

Os campos Canônicos são sempre escritos primeiro; os campos de compatibilidade são projetados por um Adapter independente, a partir dos mesmos fatos já higienizados. Quando um padrão externo sofre deriva semântica, altera-se apenas o Adapter e os testes, nunca a API de escrita de negócio.

| Fato Canônico               | Campo de compatibilidade                | Conversão                   |
| --------------------------- | --------------------------------------- | --------------------------- |
| Execução de Tool            | `gen_ai.operation.name=execute_tool`    | Valor fixo                  |
| Tool Call ID                | `gen_ai.tool.call.id`                   | exato                       |
| Tool Name                   | `gen_ai.tool.name`                      | exato                       |
| Command Exit Code           | `process.exit.code`                     | exato                       |
| Command Signal              | `process.signal.name`                   | exato                       |
| Provider Kind               | `gen_ai.provider.name`                  | exato                       |
| Requested Model             | `gen_ai.request.model`                  | exato                       |
| Response Model              | `gen_ai.response.model`                 | exato                       |
| Finish Reason               | `gen_ai.response.finish_reasons`        | string → array de elemento único |
| Input Token                 | `gen_ai.usage.input_tokens`             | exato                       |
| Output Token                | `gen_ai.usage.output_tokens`            | exato                       |
| HTTP Status                 | `http.response.status_code`             | exato                       |
| Provider Origin Host        | `server.address`                        | hostname extraído do Origin higienizado |
| Provider Origin Port        | `server.port`                           | porta explícita ou porta padrão do protocolo |
| Lifecycle Error Type        | `error.type`                            | exato, escrito na primeira reivindicação do Error |
| Lifecycle Error Message     | `error.message`                         | exato, já anonimizado       |

Os campos de compatibilidade não constituem um segundo Schema interno. As consultas internas preferem `zcode.*`.

## 14. Catálogo de Event

| Span                 | Event                   | Attribute  | Deduplicação/Limite                        |
| -------------------- | ----------------------- | ---------- | ------------------------------------------ |
| `tool_execution`     | `permission_requested`  | —          | primeira vez, apenas uma                   |
| `tool_execution`     | `permission_decided`    | `decision` | uma decisão                                |
| `command_execution`  | `first_output`          | —          | primeira vez, apenas uma                   |
| `command_execution`  | `termination_requested` | `reason`   | a cada requisição explícita; protegido pelo limite de Event por Span |
| `context_compaction` | `fallback_selected`     | `reason`   | a cada decisão explícita                   |
| `model_call`         | `fallback_selected`     | `reason`   | a cada decisão explícita                   |
| `model_attempt`      | `first_provider_event`  | —          | primeira vez, apenas uma                   |
| `model_attempt`      | `first_content`         | —          | primeira vez, apenas uma                   |
| `model_attempt`      | `first_text`            | —          | primeira vez, apenas uma                   |
| `model_attempt`      | `stream_stalled`        | `idle_ms`  | não por Chunk; protegido pelo limite de Event |

## 15. Catálogo de Metric

Todas as Histogram de Duration/TTF têm Unit em segundos; os Attributes `_ms` correspondentes no Trace estão em milissegundos.

| Instrument                                         | Tipo      | Significado                                  | Labels permitidos                                                                              |
| -------------------------------------------------- | --------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `zcode.agent.turn.duration`                        | Histogram | Duração/volume do Turn em estado terminal    | outcome、error_category、actor_kind、input_source、launch_surface                              |
| `zcode.agent.step.duration`                        | Histogram | Duração/volume do Step em estado terminal    | outcome、error_category、actor_kind、terminal_reason                                           |
| `zcode.tool.execution.duration`                    | Histogram | Duração/volume da Tool em estado terminal    | outcome、error_category、tool_name                                                             |
| `zcode.command.execution.duration`                 | Histogram | Duração/volume do Command em estado terminal | outcome、error_category、command_category、command_safe_name                                   |
| `zcode.context.compaction.duration`                | Histogram | Duração/volume da Compaction em estado terminal | outcome、error_category、trigger、model_mode                                               |
| `zcode.detached.operation.duration`                | Histogram | Duração/volume do Detached em estado terminal| outcome、error_category、operation、execution_kind                                             |
| `zcode.model.call.duration`                        | Histogram | Duração/volume da Call lógica em estado terminal | outcome、error_category、model_operation、model_role、call_cause                           |
| `zcode.model.attempt.duration`                     | Histogram | Duração/volume do Attempt do Provider em estado terminal | outcome、error_category、provider_kind、model、transport、model_operation、model_role |
| `zcode.model.call.attempts`                        | Histogram | Quantidade de Attempts por Call               | Labels de Call acima + retry_state                                                             |
| `zcode.model.attempt.tokens`                       | Counter   | Incremento de Token do Provider               | provider_kind、model、transport、model_operation、model_role、token_type                     |
| `zcode.model.attempt.time_to_first_provider_event` | Histogram | TTF Provider Event                            | Labels de Attempt                                                                             |
| `zcode.model.attempt.time_to_first_content`        | Histogram | TTFC                                          | Labels de Attempt                                                                             |
| `zcode.model.attempt.time_to_first_text`           | Histogram | TTFT                                          | Labels de Attempt                                                                             |
| `zcode.model.attempt.stream_stall.count`           | Counter   | Quantidade de pausas no streaming             | Labels de Attempt                                                                             |
| `zcode.model.attempt.stream_max_idle`              | Histogram | Maior pausa por Attempt                       | Labels de Attempt                                                                             |
| `zcode.command.execution.time_to_first_output`     | Histogram | Primeira saída do Command                     | Labels de Command                                                                             |
| `zcode.telemetry.creation_drop.count`              | Counter   | Descartes por proteção de capacidade antes da criação pelo Writer | span_name、drop_reason                                       |
| `zcode.telemetry.abandoned.count`                  | Counter   | Span com encerramento anormal                 | span_name、abandon_reason                                                                    |

```text
token_type = input | output | reasoning | cache_read | cache_write
retry_state = not_needed | recovered | not_recovered
drop_reason = process_capacity | unknown
```

É proibido usar como Metric Label:

```text
usuário, instalação, Session, Turn, Query, Tool Call, Logical Call, Request ID
Provider ID, Endpoint Origin/Route, Provider Request ID
Error/Provider Error Message
```

Model ID é a exceção controlada permitida, mantendo o valor original e protegida pelo limite de cardinalidade de 250 Series por View.

### 15.1 Histogram Bucket

As Views explícitas atuais usam os seguintes limites em segundos:

| Padrão de Instrument                                                                                      | Boundaries                                                                              |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `zcode.agent.turn.duration`                                                                             | `0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600`                                               |
| `zcode.model.*.duration`                                                                                | `0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120`                                              |
| `zcode.agent.step.duration` / `zcode.context.compaction.duration` / `zcode.detached.operation.duration` | `0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600` |
| `zcode.tool.execution.duration`                                                                         | `0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300`                                |
| `zcode.command.execution.duration`                                                                      | `0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300, 600`                                         |
| `zcode.*.time_to_first_*`                                                                               | `0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120`                                              |
| `zcode.model.call.attempts`                                                                             | `1, 2, 3, 4, 5, 8, 13`                                                                  |

O limite de cardinalidade de Series para todas as Views explícitas é 250. As Histogram que não correspondem a essas Views usam a Aggregation padrão atual do OTel SDK; se novos SLO forem adicionados a elas, é preciso definir explicitamente os Bucket e atualizar esta tabela.

## 16. Dicionário de ID

| ID                    | Escopo            | Produtor              | Uso                                     |
| --------------------- | ----------------- | --------------------- | --------------------------------------- |
| `traceId`             | Trace             | OTel SDK              | cadeia de execução inteira              |
| `spanId`              | Span              | OTel SDK              | nó individual                           |
| `service.instance.id` | Processo          | Telemetry Bootstrap   | diagnóstico de processo único           |
| `installation_id`     | Instalação do produto | Telemetry State    | correlação de pseudônimo entre versões  |
| `user_subject_id`     | Sujeito logado    | Host/Auth             | correlação controlada de usuário        |
| `session_id`          | Session           | Core                  | correlação de sessão                     |
| `turn_id`             | Turn              | Core                  | correlação de uma rodada de execução    |
| `query_id`            | Requisição        | Core                  | correlação de requisição                |
| `tool_call_id`        | Tool Call         | Model/Core            | correlação do ciclo de vida da Tool     |
| `logical_call_id`     | Chamada de modelo lógica | Model Telemetry  | agregação de Retry/Fallback             |
| `request_id`          | Attempt físico    | Model Adapter         | uma requisição ao Provider              |
| `provider_request_id` | Requisição ao Provider | Provider         | reconciliação com o suporte do Provider |

IDs registram apenas valores controlados, curtos e com restrição de caracteres; não se pode codificar Prompt, URL ou caminho como ID.