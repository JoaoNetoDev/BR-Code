# Consultas e aceitação de TTFT local

Status: in-progress

[Contrato pai](ttft-stage-telemetry.md) · [Template de dashboard Grafana](dashboards/local-ttft.json) · [Como ler uma Trace](local-ttft-trace-reading.md) · [Checklist de rollout](local-ttft-rollout-checklist.md)

A validação dos dados OTLP locais e a aceitação na plataforma ARMS são registradas separadamente. O projeto ARMS de Pequim permite consultar Traces e Metrics customizadas existentes de zcode-cli-agent / zcode-desktop-renderer. Em 2026-09-15 foi concluída a aceitação na plataforma do novo service `zcode-local-ttft`: ingestão de Trace e Metric, consulta de quantis, correlação em cascata e critérios de diagnóstico foram todos verificados, conforme as [evidências de aceitação na plataforma](local-ttft-platform-evidence.json). Ainda não concluído: confirmação visual da cascata na interface do console, caminho de escrita com injeção de compilação na versão empacotada, retenção de 7 dias de Trace / 30 dias de Metric e o custo real.

## Integração

Reutiliza `OTEL_EXPORTER_OTLP_ENDPOINT` e os endpoints/headers de cada signal; não coloque chaves de escrita nos dashboards. O rollout gradual é controlado pelo booleano `rendererActionTrace.localTtftEnabled` das client configs existentes, com padrão false; enabled/sampleRatio de Traces antigas não determina a nova amostragem de TTFT. Para diagnóstico local da aplicação é possível definir `ZCODE_LOCAL_TTFT_ENABLED=1`; isso não altera a amostragem das Traces antigas de Renderer/Agent.

Metrics dedicadas: `zcode.local_ttft.duration`, `zcode.local_ttft.stage.duration`, `zcode.local_ttft.first_text.duration`, todas Histograms em milissegundos, com OTLP usando temporality DELTA. Os rótulos principais da amostra são provider, model, quality, app_version e os; a Histogram de stage acrescenta ainda o stage fixo. Cada exporter mantém no máximo 16 combinações provider/model, e o restante vai para other; o limite superior de cardinalidade agregada é 256 por instrument. Correlações de alta cardinalidade entram apenas na Trace. O dashboard de experiência padrão seleciona quality=complete; missing/clock_invalid podem ser consultados separadamente e não devem ser misturados à distribuição completa de estágios. Semântica de quality: clock_invalid indica apenas que foi detectada anomalia de relógio (intervalo negativo, pausa por suspensão, deriva do wall clock fora do limite); calibração ausente ou expirada causa apenas estágios entre processos faltantes, registrados como missing, e os estágios no mesmo processo e o TTFT total continuam confiáveis.

Os indicadores de negócio nativos do ARMS e os Histograms OTel dedicados têm critérios distintos de armazenamento/agregação, então não se pode reaproveitar a fórmula de consulta do Gauge nativo. [Documentação de métricas do ARMS](https://www.alibabacloud.com/help/en/arms/application-monitoring/developer-reference/application-monitoring-metrics)

## Modelos PromQL

Após importar o dashboard, verifique primeiro na fonte de dados Prometheus alvo o mapeamento real de nomes OTel → Prometheus. O mapeamento de Metrics OTel do tenant de Pequim não acrescenta sufixo de unidade (por exemplo, `zcode.agent.step.duration` com unit=s mapeia para `zcode_agent_step_duration`), então o modelo usa por padrão `zcode_local_ttft_duration`. Em 2026-09-15 isso foi conferido com amostras reais novas: as novas métricas também não levam sufixo de unidade, e o nome padrão vale; ao trocar de tenant ou de Collector, altere os nomes reais via `total_metric`/`stage_metric`.

```promql
histogram_quantile(0.50, sum by (le) (
  sum_over_time(zcode_local_ttft_duration_bucket{quality="complete"}[5m])
))
histogram_quantile(0.95, sum by (le, stage) (
  sum_over_time(zcode_local_ttft_stage_duration_bucket{quality="complete"}[5m])
))
sum by (stage) (
  sum_over_time(zcode_local_ttft_stage_duration_count{quality="complete"}[1h])
)
```

Este exporter emite Histogram DELTA. O armazenamento de séries temporais customizado do ARMS atual conserva os valores de intervalo de cada envio, e já se observou a mesma série count existente indo de 2 → 1 → 1; o dashboard usa `sum_over_time` para acumular amostras de intervalo. Não trate esses valores de intervalo como Counter acumulado e aplique rate/increase. Se integrar outro Collector que converta para Counter acumulado, será preciso usar rate/increase e refazer a aceitação.

O ponto de entrada SQL do SLS consegue executar o mesmo PromQL:

```sql
* | select promql_query('histogram_quantile(0.95, sum by (le,stage) (sum_over_time(zcode_local_ttft_stage_duration_bucket{quality="complete"}[5m])))') from metrics limit 20
```

Já foi verificado que esse ponto de entrada SQL+PromQL consulta o `zcode_agent_step_duration_bucket` existente; isso não equivale a dizer que o novo TTFT já foi ingerido. [Sintaxe de consulta de séries temporais do SLS](https://help.aliyun.com/en/sls/time-metric-data-query-and-analysis-syntax)

O P95 total muda o 0.50 da primeira consulta para 0.95; o P50 de estágios muda o 0.50 da segunda para 0.50. Cada gráfico de quantil vem acompanhado do count no mesmo intervalo. Quantis de Histogram são interpolação dentro do bucket, e o erro depende da largura dos buckets vizinhos, portanto não podem ser tratados como quantis exatos das amostras brutas; nunca some P95s nem subtraia P95s de Histograms diferentes. [Prometheus histogram_quantile](https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile)

Fronteiras de bucket (ms): 1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000, e +Inf. Intervalos inválidos são omitidos e marcados com o marcador de qualidade, sem preencher zero. `zcode.local_ttft.records` observa start, first_output, first_text, no_text e excluded; `zcode.local_ttft.dropped` distingue capacidade do Renderer, Main queue_full, invalid, oversized e trace_export.

## Cascata de mensagem única

Unidades de campo, nomenclatura de spans e a leitura item a item estão em [Como ler uma Trace](local-ttft-trace-reading.md).

O service.name da Trace é `zcode-local-ttft`. Filtrar com precisão por `observation_id` isola um envio; o valor sem hifens é o próprio trace ID. O start/end da `local_ttft` raiz usa o mesmo relógio monotônico do Renderer. Os seis child spans preservam os intervalos originais, e a latência de ACK não se mistura nas fases principais. `command_id`/`input_id`/`query_id`, runtime `turn_id`, `product_turn_id`, `logical_call_id` e `request_id` servem apenas para correlação de Trace; `cli_instance_id` distingue processos. `local_ttft.start`, `local_ttft.first_text` e `local_ttft.no_text` são checkpoints independentes da mesma Trace e não acrescentam amostras de TTFT principal.

A calibração de relógio usa o RPC de command query já existente para retornar o tempo epoch monotônico de envio/recepção do CLI e, junto com o intervalo de ida e volta do Renderer, produz offset/erro. Erro máximo permitido de 10 ms, validade de 60 segundos; o envio não espera pela calibração, e Calibration ausente ou expirada é marcada explicitamente. Além da atualização junto do handshake de transporte, o Renderer também volta a sondar ao receber um checkpoint do CLI ou um frame de conteúdo real com a calibração expirada, garantindo que filas ou envios lentos tenham calibração válida antes da primeira saída; a mesma sondagem em voo não é iniciada de novo. Estágios válidos entre processos são reconciliados por intervalo, e estágios faltantes não são fingidos como executados. Requisições ao modelo mantêm apenas a borda geral, sem adivinhar rede interna do serviço, filas ou divisão da inferência.

## Reprodução local

Execute primeiro `node packages/desktop/scripts/ttft-otlp-receiver.mjs`; o receptor escuta apenas localhost:14318 e retém no máximo 512 lotes. Em seguida execute:

```sh
ZCODE_E2E_MANUAL_REVIEW=1 ZCODE_LOCAL_TTFT_ENABLED=1 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318 \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-ttft-stages.json \
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-ttft-stages.test.ts'
```

Este caso candidato opera o Composer real e faz asserções sobre a última Trace/Metric protobuf recebida. O segundo cenário injeta 250ms de latência de comando e 7s de latência de ACK na única seam pública de transport; o fixture de modelo tem 250ms até o primeiro pensamento e 8s até o primeiro corpo, e verifica que a raiz chega antes do ACK/terminal e que a atribuição das latências conhecidas está correta. A fault seam só tem efeito no build de E2E e não gera fatos falsificados.

## Posicionamento atual na plataforma

- region: `cn-beijing`
- project: `arms-project-placeholder`
- Trace: `logstore-tracing`
- Metric: `metricstore-apm-metrics-custom`
- Em 2026-09-15 a aceitação na plataforma foi concluída: a Trace e a Metric do novo service `zcode-local-ttft` já foram ingeridas e são consultáveis, os nomes das métricas não têm sufixo de unidade (vale o nome padrão deste documento), o critério DELTA + `sum_over_time` se confirma, `observation_id` sem hifens é igual ao traceID e a união das seis fases de um envio bate com a duração da raiz. Ver [evidências de aceitação na plataforma](local-ttft-platform-evidence.json) e [checklist de rollout](local-ttft-rollout-checklist.md) para o medido e os passos restantes. A cascata na interface do console, a retenção e o custo ainda não foram verificados.
- [Evidências reais de saída local](local-ttft-evidence.json) guardam 3 envios, 6 estágios e as contagens/estimativas por bucket dos 8 Histograms, com o erro medido.

## Ticket 02: fila, preparação, retry e casos não fechados

[Implementação e aceitação](../issues/ttft-stage-telemetry/02-queued-retry-and-failure-diagnostics.md). Reutiliza o mesmo `observation_id` e a mesma saída OTLP; `command_id/input_id` apontam para o input aceito original, e edição de fila/send-now não troca para comando de operação. O retry do diálogo de confirmação apenas troca a vinculação do comando já rejeitado, preservando o relógio da primeira submissão e o ID de observação. O guia imediato é classificado como `guided` e não registra um TTFT de sucesso separado.

### Unidade estatística

| Metric                                              | O que uma amostra representa                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `zcode.local_ttft.duration`                         | uma primeira saída bem-sucedida, incluindo fila e espera de confirmação do usuário |
| `zcode.local_ttft.execution.duration`               | do início da execução até a primeira saída real; só é produzido quando o alinhamento entre processos é confiável |
| `zcode.local_ttft.system.duration`                  | TTFT total da mesma mensagem menos a espera de confirmação já identificada, não derivado por subtração de quantis |
| `zcode.local_ttft.stage.duration`                   | um estágio principal de uma entrada bem-sucedida; após confirmação de qualidade completa, cada estágio é registrado apenas uma vez |
| `zcode.local_ttft.preparation.duration`             | um intervalo de espera de preparação/confirmação/retry antes da primeira saída de uma entrada bem-sucedida; execuções repetidas são contadas separadamente |
| `zcode.local_ttft.stage.observation.duration`       | um estágio principal concluído, sem esperar o fechamento da raiz; inclui entradas finalmente sem saída |
| `zcode.local_ttft.preparation.observation.duration` | um intervalo de espera de preparação/confirmação/retry concluído, sem esperar o fechamento da raiz |
| `zcode.local_ttft.attempt.duration`                 | um attempt físico antes da primeira saída, até falha, conclusão ou primeira saída; role distingue response/preparation |
| `zcode.local_ttft.no_output.wait`                   | tempo de espera explicitamente failed/cancelled/rejected/interrupted antes da primeira saída |
| `zcode.local_ttft.records`                          | um registro de ciclo de vida deduplicado; para o total de entradas veja kind=start, e não some todos os kinds como se fossem mensagens |

`send_mode=idle|queued|guided`; `visibility=foreground|background|background_returned`. A experiência padrão deve somar `visibility="foreground",quality="complete"`; fundo, retorno ao primeiro plano, relógio não confiável e estágios faltantes vão para as visões de diagnóstico. **Os rótulos da série observation são o estado no momento da observação daquele estágio**, não indicam que a mensagem permaneceu em primeiro plano até o fim e não substituem a distribuição da experiência padrão. O TTFT principal é amostrado na primeira saída, sem reescrever nem duplicar a amostra total por estágios que chegam tarde; estágios preenchidos depois podem entrar na distribuição completa de estágios, e os checkpoints da Trace mostram a qualidade atualizada.

Cada gráfico de quantil exibe também o `_count` com o mesmo filtro/janela. Os intervalos de preparação e os attempts do modelo são unidades observacionais de intervalo, então sua quantidade não pode ser tratada como número de entradas do usuário, e a duração de intervalos paralelos não pode ser somada como tempo de parede de um estágio principal. Atualmente ainda se usa `sum_over_time` conforme o critério de série temporal DELTA verificado no tenant do ticket 01.

```promql
# Primeiro plano contínuo: compara P95 total e número de amostras por idle/queued
histogram_quantile(0.95, sum by (le,send_mode) (sum_over_time(zcode_local_ttft_duration_bucket{quality="complete",visibility="foreground"}[5m])))
sum by (send_mode) (sum_over_time(zcode_local_ttft_duration_count{quality="complete",visibility="foreground"}[5m]))
# P95 dos subestágios de preparação e contagem de intervalos
histogram_quantile(0.95, sum by (le,stage) (sum_over_time(zcode_local_ttft_preparation_duration_bucket{quality="complete",visibility="foreground"}[5m])))
sum by (stage) (sum_over_time(zcode_local_ttft_preparation_duration_count{quality="complete",visibility="foreground"}[5m]))
# Resultado e contagem dos attempts; apenas response, sem misturar compact
sum by (outcome) (sum_over_time(zcode_local_ttft_attempt_duration_count{role="response"}[1h]))
# Quantidade de falha/cancelamento/rejeição/interrupção explícitos antes da primeira saída e proporção sobre todas as entradas observadas
sum by (outcome) (sum_over_time(zcode_local_ttft_records{kind="excluded",outcome=~"failed|cancelled|rejected|interrupted"}[1h]))
sum by (outcome) (sum_over_time(zcode_local_ttft_records{kind="excluded",outcome=~"failed|cancelled|rejected|interrupted"}[1h])) / scalar(sum(sum_over_time(zcode_local_ttft_records{kind="start"}[1h])))
```

O denominador inclui entradas não fechadas, e o truncamento da janela causa inconsistência entre os conjuntos de início e fim; a proporção exata de resultados do mesmo lote de mensagens deve ser calculada após correlacionar pelo observation_id da Trace. Não interprete a diferença de janela entre `start` e `terminal` como taxa de timeout.

### Cascata e casos não fechados

- `local_ttft.start` é emitido na submissão; `local_ttft.checkpoint` é exportado quando os fatos mudam e pode ser consultado mesmo sem a raiz encerrada. `local_ttft.<estágio principal>`, `local_ttft.prepare.<subestágio>`, `local_ttft.attempt`, `local_ttft.retry_wait` e `local_ttft.user_confirmation` usam identidades de Span estáveis, e cada intervalo concluído é exportado apenas uma vez.
- `.started` é o registro pontual de início do estágio, com `detail_outcome=unclosed`, e não um estágio bem-sucedido de duração zero. Ausência de fim preserva o intervalo aberto; uma Trace que só enviou start/parte dos estágios pode ainda estar em execução ou pode já ter perdido o estado terminal.
- `unattributed_ms` é reconciliado pela **união** de todos os intervalos confiáveis conhecidos dentro da borda da primeira saída; paralelismo é contado apenas uma vez, estágios faltantes não são preenchidos com zero e a diferença não é atribuída à rede ou ao modelo. `missing_stages`, `truncated`, `clock_source` e `clock_error_ms` ajudam a distinguir ausência, truncamento e alinhamento não confiável.
- Sem resultado explícito, a limpeza de observação de 5 minutos deixa apenas `unclosed`; runtime indisponível/saída explicitamente registrada deixa `interrupted`. Um encerramento forçado não promete perda zero e não fabrica terminal/estágio. Erros ou saídas após a primeira saída não invertem o TTFT principal.
- Para consultar casos não fechados é preciso correlacionar start com first_output/resultado excluded na Trace por observation_id; a ausência da raiz não permite classificar como failed/timeout apenas pela janela de consulta. Retenção insuficiente ou janela de consulta que não cobre a primeira submissão exigem marcar o truncamento de janela separadamente.

### Relógio, recursos e compatibilidade

O relógio total do clique no Renderer e os estágios do CLI são relógios monotônicos próprios; o alinhamento continua RTT/2 ≤10ms e validade de calibração de 60 segundos, com recalibração após expiração disparada por checkpoint/frame de conteúdo. Diferença acumulada entre monotônico e wall clock acima de 100ms, ou pausa acima de 5 segundos detectada na amostragem, marca o resultado como não confiável; estágios no mesmo processo que já tiverem sido concluídos de forma confiável e exportados continuam consultáveis isoladamente. O estado do Renderer é coletado por focus/blur/visibility reais da janela, com no máximo 32 mudanças, e a coleta também acontece em segundo plano. Quando a plataforma não consegue distinguir com precisão sono de pausa de depuração, apenas se marca a anomalia de tempo, sem adivinhar o motivo.

No máximo 64 subintervalos detalhados e 6 estágios principais por mensagem; no máximo 128 observações em voo cada no Renderer/CLI, e o CLI ainda mantém 128 fatos de concluídos para distribuição de frames; buffer do Renderer de 128 registros em lotes de 32; fila do Main de 32 lotes, cada um com 256KiB, e timeout de rede de 3 segundos. A saída deduplica o grupo inteiro pela identidade da observação: no máximo 1024 observações, 512 identidades de fato por observação, e retransmissões fora da janela de 5 minutos são descartadas explicitamente, sem evictar chave por chave e regenerar a amostra principal. `dropped` distingue fila cheia, capacidade de janela/deduplicação, timeout de transporte e truncamento. Dentro do rollout gradual não se depende da antiga amostragem de 10%; as perdas de recurso acima ainda podem causar perda de dados, então não se pode afirmar perda zero.

No máximo 16 grupos controlados de provider/model por exporter, e o resto vai para other; limite de 256 combinações agregadas por Histogram/Counter. Com 10 Histograms e 2 Counters, usando 15 buckets explícitos, +Inf, sum/count, o limite teórico estimado é de cerca de 46.592 séries por grupo de recursos; é preciso ainda verificar o mapeamento de rótulos de recursos no backend e as séries de overflow. IDs de correlação, requestId, workspace, caminhos e usuário não entram nos rótulos das métricas, e a cardinalidade real das amostras está nas evidências de execução. Antes de ampliar o rollout gradual ainda é necessário verificar no ARMS a capacidade, o custo e a retenção de 7 dias para detalhes/30 dias para agregados.

A notificação detalhada só é exposta no attachment local desktop-continuous; remote identity, remoteSessionId e web-remote-replayable não têm TTFT local. Campos novos não alteram comandos e conteúdos de negócio sem contexto de ttft, e CLI/Renderer usam o mesmo schema estrito de telemetria da versão empacotada; eventos de negócio antigos, RUM e o FIFO de inputs aceitos permanecem inalterados.

### Reverificação

Troque o spec e o fixture local do caso nos comandos acima por `conversation-session-ttft-diagnostics`; o mesmo `ttft-otlp-receiver.mjs` é reutilizado. O candidato inclui um Hook real de user-config (300ms), replay de HTTP 503 para sucesso, HTTP 400, fila/confirmação/guia e minimização/restauração reais da janela. O arquivo de desempenho desse run fica em `ttft-diagnostics-performance.json` e representa apenas observações durante o teste, não uma conclusão de custo A/B com o rollout desligado ou ligado. O teste de processo controlado no macOS usa SIGSTOP/SIGCONT/SIGKILL reais; no Windows os testes de sinal são pulados e exigem evidência de plataforma complementar.

Aceitação na plataforma em 2026-09-15: `conversation-session-ttft-stages` (2 execuções, 3/3 cada) e `conversation-session-ttft-diagnostics` (6/6), totalizando 12 envios, tiveram as amostras ingeridas no ARMS de Pequim e todas consultáveis. `records` está completo por kind, `excluded` distingue cancelled/failed/guided, `attempt` distingue falha com retry de primeira saída por role+outcome, `no_output.wait` e os 8 subestágios de `preparation` têm amostras, e o filtro de experiência padrão (`quality="complete",visibility="foreground"`) retorna 4 idle e 1 queued. Detalhes e agregados já são consultáveis no fim do run (limite superior <5s). Todos os valores de retorno estão em [evidências de aceitação na plataforma](local-ttft-platform-evidence.json). A cascata na interface do console e a configuração de retenção e custo ainda não foram verificadas.