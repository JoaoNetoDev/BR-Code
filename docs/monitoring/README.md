# Ponto de entrada da documentação de Monitoring

Este diretório reúne App/RUM, eventos de negócio de Conversation, monitoramento de recursos, instrumentação específica de produto e monitoramento de testes.
A cadeia de execução OpenTelemetry do CLI Agent foi separada em
[`docs/trace/`](../trace/README.md) e não é mais misturada com os demais documentos de monitoramento.

## App, Renderer e processos

- [Monitoramento de performance](./performance-monitoring.md)
- [Dicionário de eventos de telemetria de performance](./performance-telemetry-catalog.md)
- [Monitoramento ARMS do Electron](./arms-browser-monitoring.md)
- [Envio de crash de processo do Agent ao ARMS](./agent-process-crash-arms.md)
- [Instrumentação de CPU / memória de todos os processos](./process-resource-telemetry.md)
- [Dashboards e consultas de recursos de todos os processos](./dashboards/process-resource-dashboard.md)
- [Envio do ciclo de vida de processos MCP ao ARMS](./mcp-process-arms-telemetry.md)
- [Log local de diagnóstico de memória de processos](./memory-diagnostics-log.md)

## Conversation e eventos de negócio

- [Spec de compatibilidade da telemetria de conversas da V4](./conversation-telemetry-v4.md)
- [Monitoramento de qualidade de negócio](./business-monitoring.md)
- [Atribuição de modelo real e tokens do Agent Step](./agent-step-model-token-attribution.md)

## Específico de produto

- [Evento customizado de Plan Usage no ARMS](./plan-usage-arms-telemetry.md)
- [Telemetria de uso em cenários remotos V1](./remote-usage-telemetry-v1.md)
- [Evento customizado de conexão de workspace remoto no ARMS](./remote-usage-arms-telemetry.md)
- [Telemetria de Off-Peak Task V1](./off-peak-task-telemetry-v1.md)
- [Telemetria de primeira abertura de Session no ARMS](./session-open-telemetry.md)
- [Telemetria de mensagens de tarefa agendada / ociosa](./automation-message-telemetry.md)

## Qualidade de engenharia

- [Dashboard de métricas E2E no Bitable](./e2e-metrics-bitable-dashboard.md)

Os documentos deste diretório são responsáveis apenas pelo seu próprio canal de monitoramento ou funcionalidade de produto e não podem redefinir Span, Attribute, Event, Metric, privacidade ou critérios estatísticos do Trace do CLI Agent. Mudanças relacionadas são atualizadas de forma unificada em
[`docs/trace/cli-agent-telemetry.md`](../trace/cli-agent-telemetry.md).