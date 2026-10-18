# Checklist de Rollout e Aceitação ARMS do TTFT Local

Status: in-progress

[Contrato pai](ttft-stage-telemetry.md) · [Contrato de consultas e diagnóstico](local-ttft-queries.md) · [Template de dashboard](dashboards/local-ttft.json) · [Como ler uma Trace](local-ttft-trace-reading.md) · [Evidências de aceitação na plataforma](local-ttft-platform-evidence.json) · [Ticket 01](../issues/ttft-stage-telemetry/01-local-send-stage-observability.md) · [Ticket 02](../issues/ttft-stage-telemetry/02-queued-retry-and-failure-diagnostics.md)

Este documento cobre apenas as ações de deploy posteriores a "a telemetria já está implementada":
levar os dados ao ARMS de Pequim, concluir a aceitação na plataforma, abrir o rollout gradual,
verificar capacidade e custo. O contrato da telemetria em si está no contrato pai e o critério das
consultas está no contrato de consultas.

**2026-09-15: a fase 0 foi concluída.** As Traces e Metrics do novo service `zcode-local-ttft` já
podem ser consultadas no ARMS de Pequim, com quantis, correlação em cascata, labels e critério de
diagnóstico todos verificados; os dados medidos estão em
[local-ttft-platform-evidence.json](local-ttft-platform-evidence.json). As evidências OTLP locais
estão em [local-ttft-evidence.json](local-ttft-evidence.json) e
[local-ttft-diagnostics-evidence.json](local-ttft-diagnostics-evidence.json). As fases 1 a 3 ainda não
foram concluídas.

## Situação atual

| Portão     | Situação                                                                                                                                                                                            | Quem abre                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Endpoint de escrita | O ponto de integração foi verificado como gravável (o mesmo base recebe traces e metrics). O metrics reader do desktop main não é criado quando não há endpoint (`packages/desktop/src/main/localTtftExporter.ts:46`), e a versão empacotada depende de injeção em tempo de build, caminho não verificado | Fase 1                                                             |
| Chave de rollout | `rendererActionTrace.localTtftEnabled` tem default false (`packages/shared/src/rendererActionTrace.ts:21`)                                                                                            | Fase 2: distribuição pelo servidor via `/api/v1/client/configs`; em um único ambiente é possível forçar com variável de ambiente |
| Aceitação na plataforma | Concluída: consultas, cascata, labels e latência de ingestão verificadas; a inspeção visual da interface do console e retenção/custo não foram feitos                                                | Fase 3                                                             |

A chave de rollout é independente do `enabled` e do `sampleRatio` das Traces antigas de Renderer/Agent;
ligar apenas o TTFT não muda a amostragem nem a atribuição pai-filho das Traces antigas.

## Fase 0: conexão local com o ARMS real e aceitação na plataforma (concluída em 2026-09-15)

A aceitação na plataforma não depende de CI nem de distribuição de rollout; a conexão local de dev já
resolve os itens de plataforma dos Tickets 01/02.

- [x] Obter o par de valores de integração que o `zcode-cli-agent` já usa (variáveis de CI `ZCODE_PACKAGED_AGENT_OTEL_ENDPOINT` / `ZCODE_PACKAGED_AGENT_OTEL_HEADERS`). A chave de escrita não entra no dashboard nem na documentação deste repositório.
- [x] **Confirmar que esse endpoint é um base OTLP.** O base medido é `/apm/trace/opentelemetry`; `base + /v1/traces` e `base + /v1/metrics` retornam 200, enquanto o `/apm/metric/opentelemetry/v1/metrics` independente retorna 404. O receio original de "o base conter um segmento de trace e fazer metrics irem para uma URL inexistente" não se confirma, e a concatenação de `packages/desktop/src/main/localTtftExporter.ts:31` é utilizável.
- [x] Confirmar que o backend aceita signals de metrics no mesmo ponto de integração. **Conclusão: aceita**, portanto não é preciso adicionar um canal de injeção de endpoint de metrics separado no desktop main (a allowlist de injeção em `packages/desktop/src/main/desktopRuntimeEnv.ts:216` pode permanecer como está).
- [x] Produzir amostras controladas com execuções reais. Foram usados dois E2Es reais (`conversation-session-ttft-stages` rodado 2 vezes, 3/3 em cada; `conversation-session-ttft-diagnostics` 6/6), somando 12 envios; na forma de produção, apenas o endpoint base foi definido e `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` não foi definido separadamente. Das 85 remessas, todas retornaram 200, sem falhas.
- [x] Aceitação de Trace: `service.name = zcode-local-ttft` é consultável (antes era 0); `observation_id` sem hifens é de fato igual ao traceID; um envio tem 62 spans e a raiz de 701.70ms concilia com a união das seis fases principais de 701.69ms, confirmando `unattributed_ms=0`; `local_ttft.checkpoint`, `.start`, `.first_text` e a raiz pertencem à mesma Trace; `.started` registra duration igual a 0.
- [x] Conferir os nomes reais das séries de métricas: **sem sufixo de unidade**, valendo os nomes padrão `zcode_local_ttft_*` do contrato de consultas.
- [x] Rodar o P50/P95 total, o P95 por fase, o P95 das subfases de preparação e os `_count` correspondentes; o critério DELTA + `sum_over_time` se confirma. O número de amostras de fase é 18 = 3 envios × 6 fases, sem amplificação por attempt.
- [x] Diagnóstico (Ticket 02): `records` está completo por kind (start 16 / first_output 12 / first_text 12 / excluded 4 / checkpoint 442); `excluded` distingue cancelled / failed / guided; `attempt` distingue por role+outcome a falha com retry da primeira saída; `no_output.wait` registra cancelled e failed; `preparation` cobre context / hooks / persistence / mcp / tools / request_assembly / user_confirmation / retry_wait.
- [x] Os labels são de cardinalidade baixa e controlada (app_version, os, provider, model, quality, send_mode, visibility, stage, role, outcome, kind) e não foi encontrado ID de correlação vazando para labels de métricas.
- [x] Registrar a latência de visibilidade na ingestão: o polling começou no instante em que a segunda execução terminou e Trace e Metric foram encontrados já no primeiro polling (limite superior <5s). Esse é o limite superior de "visível ao término", e não a latência precisa item a item.
- [x] Escrever o resultado de volta nos itens de aceitação de plataforma dos Tickets 01 e 02, mantendo testes locais e aceitação de plataforma registrados separadamente.
- [ ] **Ainda não feito**: confirmar visualmente a renderização da cascata e a navegação na interface do console ARMS/Trace Explorer. Toda a aprovação desta rodada usou apenas a API de leitura para conferir a integridade dos dados; a confirmação de interface exige login no console.

Os detalhes de aceitação e todos os valores de retorno das consultas estão em
[local-ttft-platform-evidence.json](local-ttft-platform-evidence.json).

Efeito colateral: esta rodada escreveu no banco de telemetria de produção uma amostra controlada de 12
envios, que pode ser identificada e excluída por `provider="e2e-deepseek"` e
`model="deepseek-v4-flash"`; esses dois labels não aparecem em amostras reais de usuário.

## Fase 1: fazer a versão empacotada trazer a configuração de escrita

Requer permissão nas variáveis de CI (owner de release/CI).

- [ ] Confirmar que as variáveis de CI estão disponíveis na build alvo. `resolveBuildPackagedAgentTelemetryEnv` (`packages/desktop/tsup.config.ts:84`) exige endpoint e headers aparecendo em par, exige HTTPS em produção e faz a build falhar diretamente se faltar branch/tag de release. Com as variáveis em place, o desktop main obtém automaticamente a saída de metrics e **nenhuma configuração de build nova é necessária**.
- [ ] Gerar um pacote dev/preview e validar uma vez ao iniciar pelo Finder / menu Iniciar. O instalador não tem variáveis de ambiente de shell, e historicamente o Agent caiu silenciosamente no Noop por causa disso; o comentário está em `packages/desktop/src/main/desktopRuntimeEnv.ts:213`. Este é o único caminho de escrita não coberto pela fase 0, que passou pela injeção de env em runtime.
- [x] ~~Se a fase 0 discover que metrics precisam de um ponto de integração independente, fazer primeiro a mudança do canal de injeção e só então empacotar.~~ A fase 0 confirmou que o mesmo base recebe metrics, sem necessidade de mudanças.

## Fase 2: abrir o rollout gradual

- [ ] O servidor `GET /api/v1/client/configs` precisa retornar `data.configs.rendererActionTrace.localTtftEnabled = true` (parsing em `packages/desktop/src/main/rendererActionTraceRollout.ts:53`). A requisição carrega `app_version` e `platform`, permitindo segmentar por versão/plataforma.
- [ ] Começar por um público pequeno. Dentro do rollout a coleta é completa e limitada, sem amostragem ativa; expandir conforme o volume observado na fase 3.
- [ ] Para validação interna, forçar em uma única máquina com `ZCODE_LOCAL_TTFT_ENABLED=1` (`packages/desktop/src/main/rendererActionTraceIpc.ts:123`), sem mexer na configuração de produção.
- [ ] Confirmar que, com o rollout aberto, o critério de contagem das antigas completion de negócio, do RUM TTFT e do funil de envio não mudou.

## Fase 3: capacidade, custo e retenção

Portões antes de ampliar o rollout, todos precisam ser verificados no ARMS; estimativas do documento
não substituem a verificação.

- [ ] Volume de séries: 10 Histogram + 2 Counter, 15 buckets explícitos + `+Inf` + sum/count, com limite teórico de cerca de 46.592 séries por grupo de recursos. Verificar também o mapeamento de labels de recurso do backend e se ele gera séries em overflow.
- [ ] Cardinalidade abaixo do teto: teto de 256 por instrument e no máximo 16 grupos de provider/model (`packages/desktop/src/main/localTtftExporter.ts:71`). Bater no teto agrupa em `other`, o que equivale a perder poder de distinção.
- [ ] `zcode.local_ttft.dropped` igual a zero em produção; diferente de zero indica que a fila ou o limite de capacidade precisa de ajuste, distinguindo por reason fila cheia, capacidade de dedup, timeout de transporte e truncamento.
- [ ] Retenção atingiu o alvo: detalhe de 7 dias, agregados ≥30 dias, com uma estimativa real de custo. Este item está marcado no contrato pai como condição de deploy pendente de verificação.

## Fase 4: dashboards em produção

- [ ] Importar [dashboards/local-ttft.json](dashboards/local-ttft.json) e substituir as variáveis `total_metric` / `stage_metric` pelos nomes reais de métricas conferidos na fase 0.
- [ ] A visão de experiência padrão traz `quality="complete"` e `visibility="foreground"`; `missing`, `clock_invalid` e as séries de observation vão apenas para a visão de diagnóstico. Os labels da série de observação são o estado no momento da observação daquela fase e não representam a mensagem permanecendo em foreground até o fim; misturá-los poluiria a distribuição padrão.
- [ ] Cada gráfico de quantil acompanha um `_count` com o mesmo filtro e a mesma janela de tempo. Não somar P95 nem derivar a fase subtraindo o P95 do modelo do P95 total.

## Entrada de reprodução local

A verificação local da saída sem ARMS real segue a
[reprodução local do contrato de consultas](local-ttft-queries.md#本地复现): primeiro iniciar
`packages/desktop/scripts/ttft-otlp-receiver.mjs` (escutando apenas em localhost:14318) e então rodar
os dois cases candidatos `conversation-session-ttft-stages` /
`conversation-session-ttft-diagnostics`. Esse caminho só prova o contrato final de saída OTLP e não
constitui aceitação de plataforma.

## Fora deste checklist

- Coleta de TTFT do workspace remoto do desktop, do mobile e do remote control Web (Out of Scope do contrato pai).
- Itens reprovados de unit tests do CLI registrados no Ticket 01 (442 arquivos passaram / 76 falharam, sem atribuição item a item; os cenários stale do gateway afetado já falhavam no HEAD de início do trabalho). Isso não bloqueia a aceitação de plataforma, mas precisa ser tratado separadamente antes de afirmar a conclusão como um todo.
- Evidências de execução em máquina real no Windows / Linux e de E2E de remote control no mobile.