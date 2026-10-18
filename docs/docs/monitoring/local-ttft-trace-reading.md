# Como ler uma Trace de TTFT local

Status: ready

[Contrato pai](ttft-stage-telemetry.md) · [Contrato de consultas e diagnóstico](local-ttft-queries.md) · [Modelo de dashboard](dashboards/local-ttft.json) · [Checklist de rollout](local-ttft-rollout-checklist.md)

Para quem está abrindo o waterfall `zcode-local-ttft` pela primeira vez. A entrada de consulta e a definição das métricas estão no contrato de consultas; aqui só vamos ver como transformar uma Trace em conclusão.

## Três conhecimentos prévios obrigatórios

**1. `duration` está em nanossegundos.** O span raiz mostrando `701699951` significa **701,70 milissegundos**, não 701 milhões. Para ver o campo bruto, use sempre `duration / 1000000`.

**2. Uma mensagem é uma árvore inteira de spans, não um registro.** Um envio gera dezenas de spans que pertencem todos ao mesmo trace; `observation_id` sem os hifens é o trace ID.

**3. A conclusão está no campo `attributes` do span raiz.** Ele é um blob JSON, não uma coluna predefinida; escrever `select attributes.observation_id` no SQL dá erro Column cannot be resolved — use a busca de texto completo sobre esse valor para encontrar a linha.

## Padrão de nomenclatura dos spans

| Forma do nome do span                 | O que é                                          | Representa tempo?      |
| -------------------------------------- | ------------------------------------------------ | ---------------------- |
| `local_ttft`                           | Raiz: TTFT total de um envio, apenas 1 por mensagem | Sim                   |
| `local_ttft.<fase principal>`          | Uma das seis fases principais                     | Sim                   |
| `local_ttft.prepare.<subfase>`         | Detalhamento interno da preparação da requisição  | Sim                   |
| `local_ttft.attempt`                   | Uma requisição física ao modelo                   | Sim                   |
| `local_ttft.retry_wait`                | Espera entre duas attempts                        | Sim                   |
| `local_ttft.user_confirmation`         | Permanência do usuário no diálogo de reconfirmação da fila | Sim (mas não é tempo do sistema) |
| `local_ttft.checkpoint`                | Instantâneos de estado durante o processo, dezenas por mensagem | **Não**    |
| `local_ttft.start`                     | Marco de início no momento do envio               | **Não**               |
| `<qualquer>.started`                   | Registro de ponto em que a fase começou mas ainda não terminou | **Não**   |
| `local_ttft.first_text`                | Observação independente do primeiro texto         | Sim, mas não é o TTFT principal |
| `local_ttft.no_text`                   | Nenhum texto em toda a rodada                     | Não                   |

Antes de olhar o waterfall, filtre `checkpoint`, `start` e `.started`; o que sobrar são os intervalos de tempo. Um `.started` com `duration` igual a 0 não significa que a fase teve tempo zero, significa que ele nunca recebeu a fronteira de término.

## As seis fases principais

Na ordem real do tempo; a definição dos limites está no contrato de fases e tempos do [contrato pai](ttft-stage-telemetry.md#阶段与时间合同).

| Fase                   | O que acontece nesse intervalo                              | Crescer significa                              |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `renderer_prepare`     | A interface recebe o clique/Enter, passa pelo gate de envio e monta o comando | Latência de processamento local antes do envio |
| `command_admission`    | O comando chega à CLI e é aceito de forma autoritativa, incluindo a espera no admission gate | Latência de comunicação ou contenção no admission |
| `execution_wait`       | Aceitação concluída, aguardando a vez desta entrada ser executada | Há tarefas na fila antes                    |
| `request_prepare`      | Início da execução: hooks, carregamento de contexto, persistência, compactação, montagem da requisição | Expanda `prepare.*` para ver qual item é |
| `model_request`         | Do envio da requisição até a primeira saída válida da CLI para esta entrada | Conte os `attempt` para distinguir lentidão de retry |
| `output_return`         | Da primeira saída da CLI voltando à interface de origem através do Host | Gargalo no caminho de retorno              |

## Exemplo: uma amostra real

`observation_id = 820f1085-7bf1-4b04-9229-c2625b11da47` (amostra de aceitação de plataforma de 2026-09-15, 62 spans). **Esta é uma amostra de reprodução E2E, na qual as latências de comando e de primeiro texto foram injetadas de propósito nos testes e não representam desempenho em produção.**

```text
0        7.5                        303   310        383            669    701.7 ms
├────────┼──────────────────────────┼─────┼──────────┼──────────────┼──────┤
│renderer│   command_admission      │exec │ request  │ model_request│output│
│_prepare│        295.48            │_wait│ _prepare │    285.38    │_return
│  7.50  │                          │6.77 │  73.81   │              │32.75 │
└────────┴──────────────────────────┴─────┴──────────┴──────────────┴──────┘
   ↑                                                                    ↑
 cliquei em enviar                                             vi o primeiro output
```

Os seis segmentos somam 701.69ms, e a raiz marca 701.70ms — é exatamente o que `unattributed_ms=0` significa: **o tempo total é totalmente explicado, não há tempo perdido sem explicação**. Quando esse valor é diferente de 0, a diferença é a parte não atribuída; não a empurre para o modelo ou para a rede.

Dentro dos 73.81ms de `request_prepare`: `prepare.context` 10,48, `prepare.hooks` 5,86, `prepare.persistence` 3,21, `prepare.request_assembly` 3,82, `prepare.mcp` 0,14, `prepare.tools` 0,10. A soma das subfases ser menor que a fase principal é normal; a porção não detalhada não é preenchida com zero.

`local_ttft.attempt` 285,39 ≈ `model_request` 285,38: houve apenas uma requisição desta vez. Quando houver retry você verá múltiplos `attempt` mais `retry_wait`.

## TTFT principal e primeiro texto são coisas diferentes

Na mesma amostra, `local_ttft.first_text` = **8450,50ms**, mais de dez vezes a raiz. Não há contradição: o span raiz tem `first_output_kind = reasoning`; aos 0,7 segundo o usuário estava vendo o conteúdo de raciocínio, e a resposta textual de verdade só chegou em 8,45 segundos.

Olhar apenas para o TTFT total leva à conclusão de que a experiência está ótima;Só com `first_text` é que se descobre que o usuário esperou 8 segundos para ver a resposta. Os dois são estatizados separadamente, não se substituem.

## Checklist de atributos da raiz

| Atributo             | Valor nesta amostra        | Como usar                                                                                    |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `quality`            | `complete`                 | Só `complete` entra na distribuição completa de fases; `missing` indica calibração ausente/expirada, `clock_invalid` indica anomalia de relógio detectada |
| `visibility`         | `background_returned`      | A experiência padrão observa apenas `foreground`; nesta amostra o app foi para segundo plano e voltou |
| `send_mode`          | `idle`                     | Estatize agrupado por `idle`/`queued`/`guided`, sem misturar                                 |
| `first_output_kind`  | `reasoning`                | Se a primeira saída é texto, raciocínio ou chamada de ferramenta                              |
| `unattributed_ms`    | `0`                        | Tempo não atribuído; confronte com a **união** dos intervalos confiáveis, sem contar paralelo em duplicidade |
| `clock_error_ms`     | `5.02`                     | Erro de alinhamento entre processos, limiar de 10ms                                           |
| `truncated`          | `false`                    | Indica se foi truncado pelo limite de capacidade                                              |
| `missing_stages`     | vazio                      | Quais fases faltaram; ausência não significa que a fase levou tempo zero                      |

IDs de correlação (`command_id`/`input_id`/`query_id`, `turn_id`, `product_turn_id`, `logical_call_id`, `request_id`, `cli_instance_id`) servem apenas para encadear traces e não entram em rótulos de métrica. O `request_id` muda a cada retry e não pode ser usado como chave primária do envio inteiro.

## Localização por sintoma

Primeiro veja o tempo total da raiz e o `first_output_kind`, depois veja qual fase principal domina:

- `command_admission` grande → transporte do comando ou contenção na aceitação pela CLI, não lentidão do modelo
- `execution_wait` grande → fila de negócio; use `send_mode=queued` para julgar se é normal
- `request_prepare` grande → expanda `prepare.*`; o caso comum é hooks ou carregamento de contexto
- `model_request` grande → conte os `attempt`: uma requisição lenta, ou várias falhas acumuladas por retry
- `output_return` grande → caminho de retorno
- `user_confirmation` grande → o usuário ficou no diálogo de confirmação, não é tempo de processamento do sistema

## Não encerrado não é falha

Registros que só têm `local_ttft.start` e alguns `checkpoint`, sem span raiz, são **não encerrados**: podem ainda estar em execução ou podem ter perdido o estado final.

- Só registre `interrupted` quando houver evidência clara de saída ou interrupção; se após 5 minutos de observação e limpeza ainda não houver resultado, deixe como `unclosed`
- Se a janela da consulta não cobrir o primeiro envio, o conjunto de inícios e de términos fica inconsistente; isso é truncamento de janela, não timeout
- Não interprete a diferença de contagem entre `start` e os estados finais como taxa de timeout

## Leituras erradas comuns

- Tratar `checkpoint` ou `.started` como fases de tempo
- Tratar `first_text` como TTFT, ou o contrário: olhar só o TTFT e ignorar o primeiro texto
- Contar a quantidade de intervalos de `attempt` e `prepare.*` como o número de mensagens do usuário
- Somar o tempo de subfases paralelas como se fosse o tempo de relógio da fase principal
- Somar P95 de fases diferentes, ou derivar outras fases subtraindo o P95 total do P95 do modelo
- Misturar amostras `background` / `background_returned` / `quality != complete` nas estatísticas de experiência padrão
- Atribuir a diferença de `unattributed_ms` à rede ou ao modelo