# CLI Agent Trace

Este diretório define a cadeia de execução OpenTelemetry do Agent interno de `apps/zcode-cli`. A documentação é dividida em dois níveis: a especificação central define design, fronteiras e forma de integração estáveis; as referências temáticas expandem conceitos de baixo nível, campos completos e detalhes de runtime e operação.

## Estrutura da documentação

| Nível            | Documento                                                                        | Conteúdo                                                            |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Especificação central | [Especificação de Design e Desenvolvimento do CLI Agent Telemetry](./cli-agent-telemetry.md) | Modelo de dados, topologia da cadeia, princípios de design, integração, restrições de privacidade e consultas |
| Referência temática | [Conceitos de OpenTelemetry e escolhas do ZCode](./reference/otel-concepts.md)   | Resource, Context, SpanContext, Parent, Link, Event etc.             |
| Referência temática | [Dicionário de Span, Attribute, Event e Metric](./reference/schema-reference.md) | Campos completos, enums, semântica de ausência, projeções de compatibilidade, eventos e métricas |
| Referência temática | [Referência de Runtime, Privacidade, Performance e ARMS](./reference/runtime-and-operations.md) | Ciclo de vida do Runtime, propagação, mascaramento, capacidade, testes, consultas e Dashboard |

A especificação central e as referências temáticas descrevem em conjunto a implementação atual: princípios de design e integração de negócio seguem a especificação central; definições de campos, comportamento de runtime e métricas de plataforma seguem a referência temática correspondente; assinaturas de método e restrições de tipo seguem os TypeScript Contracts.

## Observação local adjacente, mas independente

- [Trace de ações do usuário do Desktop Renderer](./desktop-renderer-user-action-trace.md)
- [Usage Observability local do CLI](../../apps/zcode-cli/docs/design/v2/usage-observability.md)
- [Debug Observability local do CLI](../../apps/zcode-cli/docs/design/v2/debug-observability.md)

O Trace do Desktop Renderer registra apenas ações semânticas da UI do Desktop e não é propagado para o CLI; os documentos de Usage e Debug permanecem dentro do pacote do CLI e descrevem, respectivamente, a fonte de fatos local em SQLite e a infraestrutura de depuração local. Eles não pertencem ao CLI Agent ARMS Trace Schema e podem ser usados para reconciliação de traces e diagnóstico de falhas.

## Design histórico

Os documentos a seguir servem apenas para rastreabilidade e não podem ser a base para novos Span, Attribute, Event, Metric, consultas ou dashboards:

- [Design de observabilidade do Model API V1](./archive/model-api-observability-v1.md)
- [Design de observabilidade do Turn Trace V2](./archive/turn-trace-observability-v2.md)
- [Design da atualização V4 → V5](./archive/telemetry-v4-to-v5-upgrade-design.md)

## Regras de manutenção da documentação

1. Quando princípios gerais, interfaces de integração ou fronteiras do sistema mudarem, atualizar a especificação central.
2. Ao adicionar ou modificar Span, Attribute, Event, Metric, enums, aliases de compatibilidade, privacidade ou métricas, é obrigatório atualizar a referência temática correspondente; o dicionário completo de campos precisa ser mantido sincronizado com as mudanças de código.
3. Revisões pontuais e planos de migração concluídos vão para `archive/`, sem manter várias versões no diretório principal.
4. Código, testes, consultas ARMS e Dashboards não devem depender de documentos arquivados.