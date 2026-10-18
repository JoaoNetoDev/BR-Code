# Reformulação do Uso do App: migração da fonte de dados para o banco de dados do zcode agent

Data: 2026-06-02
Branch: feat/new-agent

## Contexto e objetivo

O painel "Uso do App" (App Usage) tem hoje todos os seus dados vindo de **arquivos JSON locais de sessão**
(`~/.zcode/sessions/*.json`), agregados pelo `usageStatsAggregator.ts` do processo do host, que **estima** tokens
por "número de caracteres / 3" e depois os agrega em três blocos: resumo, mapa de calor e tendência, com filtros de
tempo de Todos / 7d / 30d.

O zcode agent passou a ter um banco de dados de observabilidade (migração `0010_usage_observability`), em que três
tabelas registram dados de uso **reais**:

- `model_usage` — tokens reais (input / output / reasoning / cache leitura e escrita), provider/model,
  query_source, status, latência (duration, TTFT), retries, erros
- `turn_usage` — agregado por turno do usuário, com contagem de chamadas de ferramenta/erros, tokens e latência
- `tool_usage` — cada chamada de ferramenta: nome da ferramenta, status de aprovação, somente leitura/destrutiva, tempo decorrido, bytes de saída, erro
- retenção de 30 dias (`USAGE_RETENTION_DAYS = 30`, remoção automática ao expirar)

**Objetivo**: substituir **integralmente** a fonte de dados do painel de Uso do App pelas estatísticas do banco do
agent, removendo o pipeline de estimativa por caracteres e usando os novos dados para acrescentar o detalhamento
real de tokens, estatísticas de uso de ferramentas e indicadores de confiabilidade.

## Decisões-chave (já confirmadas com o usuário)

1. **Conflito de retenção → interface adaptada a 30 dias**: o filtro de tempo muda de `Todos / 7d / 30d` para `7d / 30d`
   (removendo "Todos"); o mapa de calor encurta de 52 semanas para 30 dias. A retenção do banco não é alterada.
2. **Escopo de novas métricas**: detalhamento real de tokens + estatísticas de uso de ferramentas + métricas de qualidade/confiabilidade.
   **Não** fazer quebra por `query_source` (conversa principal/compactação/subagente/workflow).
3. **Formato do mapa de calor → grade de calendário de 30 dias** (cerca de 5 colunas, estilo GitHub), cada célula = total real de tokens do dia.
4. **Caminho de leitura → ZCode Protocol**: novo método de protocolo, com agregação em SQL do lado do agent devolvendo o resultado.

## Arquitetura e fluxo de dados

O processo do host **não mantém diretamente** o SQLite do agent; o agent é um subprocesso separado e o host só pode
pedir dados pelo ZCode Protocol (stdio JSON-RPC, como no `session/list` e `session/messages` já existentes).
A agregação fica do **lado do agent (SQL)**, em vez de trazer as linhas brutas para o host e calcular lá — economiza
transporte por stdio e já vem com a janela de 30 dias.

```
旧:  useAppUsageStats → usageStatsService.getAppUsageSnapshot()
        → readPersistedSessionFiles(~/.zcode/sessions/*.json)      [删]
        → buildUsageStatsSnapshot()  字符数/3 估算                 [删]

新:  useAppUsageStats → usageStatsService.getAppUsageSnapshot()
        → zcodeProtocolClient.request("usage/stats", {range,timeZone})   [新协议方法]
        → [agent 子进程] handler → SessionStore 新增 read 方法
        → SQL GROUP BY 聚合 model_usage / turn_usage / tool_usage        [真实数据]
        → 回传 AppUsageSnapshot
```

**Alternativa (não adotada)**: o processo do host abrir o mesmo arquivo `default.db` diretamente em modo somente
leitura. Motivo da rejeição: acesso concorrente ao mesmo DB pelo agent, schema duplicado e acoplado, e violação do
acordo de que "código novo passa pelo ZCode Protocol".

## Mudanças nas métricas

### Resumo (Summary)

Oito cards fixos. O mapeamento é:

| Card antigo | Tratamento | Card novo | Fonte dos dados |
|---|---|---|---|
| Uso de tokens (estimativa caracteres/3) | troca por real | **Tokens reais** (total, subtítulo com input/output/cache) | `model_usage.computed_total_tokens` etc. |
| Número de mensagens | removido, substituído | **Turnos de conversa** | número de linhas de `turn_usage` |
| Número de sessões | mantido | Número de sessões | `session_id` distinto |
| Dias ativos | mantido | Dias ativos | `day(started_at)` distinto |
| Atual/maior sequência | fundidos | **Dias ativos consecutivos** (em 30 dias) | `day(started_at)` |
| Horário de pico | removido (vai para o mapa de calor) | **Taxa de acerto de cache** | `cache_read / (input + cache_creation + cache_read)` |
| Modelo mais usado | mantido | Modelo mais usado (por tokens reais) | `model_usage` GROUP BY model |
| — | novo | **Chamadas de ferramenta** (total + taxa de erro) | `tool_usage` |
| — | novo | **Confiabilidade** (taxa de erro do modelo / TTFT médio) | `model_usage.status`, `time_to_first_token_ms` |

> Das 9 candidatas, ficam 8. Corte padrão: manter "Dias ativos consecutivos" e "Confiabilidade", já que
> "Chamadas de ferramenta" está bem expandida no 4º bloco; pode-se omitir uma no resumo para controlar em 8 cards;
> a implementação pode ajustar levemente, sem afetar a arquitetura.

### Mapa de calor (Heatmap)

- **Remove**: calendário de 52 semanas e o `activityScore` baseado em número de caracteres.
- **Troca**: grade de calendário de 30 dias (cerca de 5 colunas), em que a intensidade da cor de cada célula = `computed_total_tokens` do dia;
  o tooltip mostra tokens / turnos / número de chamadas de ferramenta.

### Tendência (Trend)

- **Mantém** a estrutura (barras diárias empilhadas por modelo), com os dados trocados por tokens reais (`computed_total_tokens`).
- O filtro de tempo perde "Todos" e passa a `7d / 30d`; o bucket é simplificado (7d por dia, 30d por dia).

### Novo 4º bloco: Uso de ferramentas (Tool Usage)

- Vem de `tool_usage`, ranking das principais ferramentas: número de chamadas, taxa de erro, tempo médio.
- Barras horizontais + uma tabela pequena.

## Arquivos envolvidos

### Lado do agent (leitura + agregação)

- `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`
  — `UsageStorePort` ganha métodos de agregação somente leitura (hoje só tem métodos de escrita) e os tipos de resultado.
- `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts`
  — novas consultas SQL de agregação (GROUP BY day / model / tool, com filtro de 30 dias + range).
- `apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts`
  — faz proxy dos novos métodos de leitura.
- `packages/shared/src/zcode-protocol/index.ts`
  — novo método de protocolo `usage/stats` + schemas zod de entrada/resultado, registrados em `zcodeProtocolMethods`.
- handler do lado do agent server (na mesma posição de `session/list`) — trata `usage/stats`.

### Lado dos serviços do host (troca da fonte de dados)

- `packages/services/src/usage-stats/usageStatsService.ts`
  — `getAppUsageSnapshot()` passa a usar `zcodeProtocolClient` / `zcodeAgentService`.
- **Remover**: `usageStatsAggregator.ts`, `repo/sessionUsageRepo.ts`, `usageStatsSeries.ts`,
  as constantes de estimativa por caracteres (`ESTIMATED_TOKEN_CHAR_DIVISOR`, `estimateTokensFromCharacterCount` etc.).
- `packages/shared/src/usage-stats.ts`
  — atualizar os tipos: remover campos de caracteres/estimativa e adicionar detalhamento de tokens / acerto de cache / ferramentas / confiabilidade.

### Lado da UI

- `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`
  — novo conjunto de cards de resumo; as tabs de range perdem "Todos" (`UsageStatsRange` passa a ser `"7d" | "30d"`).
- `packages/ui/src/settings/usage-stats/usageStatsUiParts.tsx`
  — mapa de calor passa para 30 dias; novo componente do bloco de uso de ferramentas.
- `packages/ui/src/settings/usage-stats/AppUsageDailyModelBarChart.tsx`
  — tokens reais.
- adições/remoções de i18n keys (por exemplo, remover `settings.usage.range.all`).

### Sem alterações

- o tab inteiro de Coding Plan e a linha da BigModel monitor API permanecem como estão.

## Testes

- **Agregação SQL do agent**: inserir linhas conhecidas de `model_usage` / `turn_usage` / `tool_usage` em SQLite em memória e
  afirmar o resultado da agregação (a partir dos testes existentes em `repositories/usage.ts`).
- **Camada de protocolo**: validação de ida e volta dos schemas de entrada/resultado de `usage/stats`.
- **Serviços do host**: mock do cliente de protocolo e assert de que o mapeamento de campos de `getAppUsageSnapshot` está correto.
- **UI**: renderização do snapshot (cards de resumo / mapa de calor de 30 dias / tendência / tabela de ferramentas).

## Riscos e cuidados

- a retenção de 30 dias significa que o painel nunca enxerga dados mais antigos; o texto da UI deve deixar explícito "últimos 30 dias".
- os tokens reais não são comparáveis com a antiga estimativa por caracteres, então os números históricos vão apresentar um "salto" após a migração, o que é esperado.
- a semântica de "turno" de `turn_usage` é diferente do antigo "número de mensagens", então os textos precisam ser ajustados.
- quando o agent não está em execução ou o DB está vazio, o painel precisa de um estado vazio e de um estado de erro (reaproveitando `UsageStatsErrorNotice`).