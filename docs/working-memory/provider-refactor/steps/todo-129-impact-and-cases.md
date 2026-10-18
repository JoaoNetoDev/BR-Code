# Limites de Implementação e Aceitação do Todo129

A comparação com a versão antiga é fixada em `790884b1ce`, e o ponto de partida deste ciclo é `b2e2b31ea3`.

## Definições antigas já verificadas

- Antigos modelSelectionGroups / providerFamilyRuntimeModel: a conexão Team usa a mesma identidade de modelo `builtin:*-coding-plan` do mesmo fornecedor, e a connection key não é usada como model_provider. Pessoal e equipe restauram o mesmo bucket de estatísticas antigo.
- O legacyPersonalProviderConfigImporter escreve os antigos `builtin:zai/bigmodel` como instâncias fixas `zai-api/bigmodel-api`; apenas esses dois IDs exatos são mapeados, sem agrupar instâncias com UUID por templateId.
- O antigo offPeakTelemetry fixa `offpeak-idle-plan`; as duas novas identidades ociosas restauram esse valor.
- Codificação de evento preservada: o envio usa codificação custom, enquanto as requisições reais normalmente são provider/model, e as de automação e ociosas são apenas model ID.

## Superfície de impacto

Usou-se feature-boundary-planner; o Codegraph estava indisponível, então foram usados os nós de telemetry / off-peak / purchase-funnel do grafo, busca por referências exatas e a comparação com o código antigo. A mudança altera a categorização de exibição, o acesso na home e a construção dos eventos, sem alterar a produção, a sincronização ou a persistência dos fatos.

```text
Registry Settings View → 套餐分类 → 首页闲时入口 / 购买漏斗
实际提交 / 请求事实   → 事件字段构造 → 旧统计 ID → 原有上报渠道
                          ↑
                纯映射，不查询或修改账号
```

O mapeamento puro é reutilizado na construção dos eventos e não fica em um transport global; os fatos continuam sendo IDs reais. O mapeamento de Step/Completion é a atribuição final (incluindo subtarefas e seed) e não altera ciclo de vida, usage ou deduplicação. Web platform no-op, desktop continuous e mobile replayable não são alterados. Os relatórios são capturados pela plataforma de testes e não enviados ao coletor de produção.

## Matriz de aceitação

| Grupo | Deve valer                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------ |
| Identidade | Simetria entre as duas empresas em pessoal/Team/Start/idle; valores antigos inalterados; UUID/desconhecidos sem adivinhação; barras, dois-pontos e percentuais de modelos inalterados |
| Eventos | send, step/completion de requisição, subtarefas, compactação, automação e idle com builder/carga útil de relatório reais conforme os valores antigos, demais campos inalterados |
| Planos | Team-only entitled=true pertence ao Coding Plan; false não conta; Start é independente; view vazia é unknown; o toggle não é cancelamento |
| Funil | BigModel Team como MaaS / bigmodel, Z.ai como Z_AI / z.ai; contexto congelado e o único reporte de upgrade inalterados |
| Home | Team-only pode entrar na criação; rollout desligado, dismiss e ausência explícita de Coding Plan continuam bloqueando; sem contornar a elegibilidade do formulário |

Não se testa cobrança real de compra, nem se alteram relatórios ou estatísticas históricas. A verificação real de batching do Electron é registrada separadamente no ledger; testes de componentes não se passam por verificação da máquina inteira.