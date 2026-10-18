# Eventos customizados de Plan Usage no ARMS

O desktop do ZCode complementa, via ARMS custom event, o painel de uso por requisição de todas as requisições de LLM.

## Definição do evento

| Campo    | Valor |                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| group    | `plan_usage`                                                                                                               |
| name     | `plan_request` / `plan_ttft`                                                                                               |
| value    | `plan_request` vale `1`; `plan_ttft` vale `ttft_ms`                                                                            |
| Momento de disparo | `plan_request` é reportado quando o estado real de rede entra no live fact feed; `plan_ttft` é reportado quando o tempo até o primeiro token do prompt local em foreground se torna calculável |

Esse evento não espera `message_completion` e não copia o payload completo de completion de `/event/report`.
`plan_request` não é vinculado a `send_btn`, mas acompanha os cinco estados reais
`model_request_started`, `model_request_completed`, `model_request_failed`, `model_retry_scheduled`,
`model_stream_stalled`, cobrindo assim as requisições reais de LLM em foreground e background. Initial, cold hydration,
gap recovery não geram eventos e não podem ser inferidos a partir de `apiRetry`, accepted ou queued da V4. O cliente não filtra
por whitelist de provider; quando o estado real não tem `provider_id`, usa `unknown` como reserva.

`plan_ttft` continua sendo o critério de experiência do renderer: do seed de envio do desktop deste renderer até o primeiro
conteúdo, pensamento ou progresso de ferramenta live recebido por este renderer. Não pode ser substituído pelo TTFT do
provider/runtime, e também não é reenviado depois de mudar para background.
O ciclo de vida completo e as fronteiras multi-cliente estão em [conversation-telemetry-v4.md](./conversation-telemetry-v4.md).

## Propriedades customizadas

| Propriedade        | Descrição |                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `provider_id`    | provider id resolvido no momento da requisição; providers embutidos mantêm IDs estáveis (por exemplo `builtin:zai` / `builtin:zai-coding-plan`), providers customizados escrevem sempre `custom` |
| `provider_scope` | `builtin` / `custom` / `unknown`, julgado em conjunto com `provider_id`                                                                              |
| `model_name`     | model id/name do evento de requisição de modelo; apenas IDs de modelos embutidos estáveis dentro da whitelist de telemetria são mantidos, o resto escreve `custom`                                              |
| `ask_mode`       | query source do evento de requisição de modelo                                                                                                            |
| `request_status` | exclusivo de `plan_request`; `started` / `completed` / `failed` / `retry_scheduled` / `stream_stalled`                                           |
| `request_id`     | id da requisição de modelo                                                                                                                              |
| `task_id`        | id de task do ZCode                                                                                                                            |
| `input_id`       | id da entrada do usuário                                                                                                                              |
| `query_id`       | query id                                                                                                                                 |
| `event_key`      | chave de deduplicação de eventos do protocolo                                                                                                                           |
| `attempt`        | attempt atual da requisição de modelo                                                                                                                     |
| `max_attempts`   | attempt máximo                                                                                                                             |
| `ttft_ms`        | exclusivo de `plan_ttft`, milissegundos de latência até o primeiro token                                                                                                    |

`provider_id` / `model_name` compartilham com o `provider_id` / `model_id` do `chat_error_banner` a mesma whitelist e a mesma
implementação de normalização de `@zcode/shared`: os ids e nomes de modelo de providers customizados são nomeados pelo usuário e,
reportados como estão, vazariam nomes privados e criariam alta cardinalidade, por isso são sempre normalizados para `custom`.
O casamento da whitelist e a saída usam ambos o ID normalizado em minúsculas.
A normalização afeta apenas os valores reportados e não altera a trava existente de não enviar evento quando `provider_id` está vazio,
nem altera o log local e a seleção de provider do negócio.

Providers embutidos têm dois conjuntos de IDs: o ID de runtime (como `account:zai-start-plan`) e a identidade de relatório legada
(`builtin:zai` / `builtin:zai-coding-plan` / `builtin:zai-start-plan` e os correspondentes da bigmodel). O supervisor da V4 já mapeia
o ID de runtime para a identidade de relatório legada ao projetar o detail de `/report`; `plan_ttft` e `perf_ui_*` reusam esse mesmo
detail, enquanto `plan_request` usa diretamente o ID de runtime do evento de protocolo. Por isso a implementação de normalização
precisa julgar ambos os conjuntos como embutidos e preservá-los como estão, sob pena de os usuários embutidos caírem inteiramente em
`custom`. `model_name` aceita valores compostos `<providerId>/<modelId>` ou codificados `custom:<providerId>:<modelName>`; na
normalização, o ID de modelo nu é extraído primeiro e só então consultado na whitelist.

A whitelist de modelos tem como fonte a lista oficial de modelos GLM do `@zcode/shared` (`OFFICIAL_GLM_MODEL_IDS`), acrescida dos
modelos embutidos históricos fora da lista oficial; modelos novos na lista oficial entram automaticamente na whitelist, e modelos
fora dela escrevem `custom`.

`provider_id=unknown` é o bucket de reserva já existente para "o evento de protocolo não trouxe provider" e não é fundido em
`custom`; nesse ramo, `model_name` é julgado pela whitelist do próprio ID do modelo, preservando o valor quando ele está na whitelist
embutida e escrevendo `custom` caso contrário.

A bridge do processo principal do ARMS preenche automaticamente `app_version`, `arms_env`, `device_mid`, `platform`, `renderer_id`, `metric_value`.

## Sugestões de consulta

- Volume de requisições: filtrar `group=plan_usage`, `event_name=plan_request` e agrupar por `provider_id` / `model_name`.
- Latência até o primeiro token: filtrar `group=plan_usage`, `event_name=plan_ttft` e observar a média e o P95 de `value` ou `ttft_ms`.
- Número de usuários distintos: com os mesmos filtros, observar os usuários distintos correlacionados do ARMS, ou deduplicar por `properties.device_mid` na consulta de logs.
- Não somar diretamente com o `message_completion` de `/event/report`; são caminhos diferentes, o primeiro é o painel de requisições do ARMS e o segundo é o detalhe de completion do negócio.