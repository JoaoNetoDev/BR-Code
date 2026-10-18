# Integração de cota de uso do BigModel Coding Plan

Data: 2026-05-14

## Contexto

O「Plan usage」do ZCode precisa exibir o uso real atual do GLM Coding Plan do usuário, e não o
valor estimado da session local. A integração atual passou a consultar diretamente a interface de
quota do BigModel usando a API key de provider Z.AI / BigModel já configurada pelo usuário, sem
depender do token OAuth da Z.AI e sem alterar o fluxo de login e autenticação existente.

## Interface

```http
GET <host>/api/monitor/usage/quota/limit
authorization: <API key completa>
```

Atenção:

- O host doméstico pode usar `https://bigmodel.cn` ou `https://open.bigmodel.cn`.
- Hosts internacionais / Z.AI podem usar `https://api.z.ai`.
- O caminho, o método e a estrutura de retorno das interfaces doméstica e overseas são
  idênticos; a mesma key funciona nos dois hosts, e a principal diferença é que o texto de `msg`
  pode estar em idiomas diferentes.
- O header `authorization` recebe a API key completa diretamente, no formato `<id>.<secret>`.
- Não adicione o prefixo `Bearer`; com `Bearer` a autenticação dessa interface falha.
- Por padrão o ZCode lê primeiro a API key `builtin:zai` da configuração de provider de modelo
  atual, depois `builtin:bigmodel` e, por fim, tenta providers customizados cujo endpoint aponte
  para `bigmodel.cn` ou `api.z.ai`.
- Providers `builtin:zai` ou cujo endpoint aponte para `api.z.ai` requisitam por padrão
  `https://api.z.ai/api/monitor/usage/quota/limit`; os demais providers BigModel requisitam por
  padrão o domínio principal da API BigModel do ambiente atual, sendo
  `https://bigmodel.cn/api/monitor/usage/quota/limit` em produção e
  `https://bigmodel.cn/api/monitor/usage/quota/limit` com `ZCODE_ENV=test`.
- Em depuração local é possível sobrescrever com `ZCODE_BIGMODEL_USAGE_API_KEY` ou
  `BIGMODEL_USAGE_API_KEY`.
- O endereço da interface pode ser sobrescrito com `ZCODE_BIGMODEL_USAGE_QUOTA_URL` ou
  `BIGMODEL_USAGE_QUOTA_URL`.

## Parse da resposta

Exemplo de resposta bem-sucedida:

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "limits": [
      {
        "type": "TOKENS_LIMIT",
        "unit": 3,
        "number": 5,
        "percentage": 1,
        "nextResetTime": 1778753640304
      },
      {
        "type": "TIME_LIMIT",
        "unit": 5,
        "number": 1,
        "usage": 100,
        "currentValue": 0,
        "remaining": 100,
        "percentage": 0,
        "nextResetTime": 1781345721976,
        "usageDetails": [
          { "modelCode": "search-prime", "usage": 0 },
          { "modelCode": "web-reader", "usage": 0 },
          { "modelCode": "zread", "usage": 0 }
        ]
      }
    ],
    "level": "lite"
  },
  "success": true
}
```

Semântica dos campos:

| Campo | Descrição |
|---|---|
| `data.level` | Nível do pacote GLM Coding Plan, por exemplo `lite`, `pro`, `max` |
| `unit=3` | Dimensão de horas, `number` representa a quantidade de horas |
| `unit=5` | Dimensão mensal, `number` representa a quantidade de meses |
| `unit=6` | Dimensão semanal, `number` representa a quantidade de semanas |
| `TOKENS_LIMIT + unit=3 + number=5` | Pool de prompt de 5 horas |
| `TOKENS_LIMIT + unit=6 + number=1` | Pool de prompt de 1 semana; algumas contas não retornam este item e o frontend deve ocultar os itens ausentes |
| `TIME_LIMIT + unit=5 + number=1` | Pool mensal de cota de MCP / ferramentas |
| `TIME_LIMIT.remaining` | Cota restante de ferramentas |
| `TIME_LIMIT.percentage` | Proporção da cota de ferramentas já usada |
| `TIME_LIMIT.nextResetTime` | Próxima data de reset da cota de ferramentas, em milissegundos |
| `TIME_LIMIT.usageDetails` | Uso detalhado por item da cota de ferramentas, por exemplo busca na web, leitura de páginas e MCP de repositórios open source |

`nextResetTime` é um campo opcional. O frontend não pode usá-lo para decidir se um item de cota é
válido; quando o campo estiver ausente, apenas oculta-se a data de reset daquele item.

## Exibição do nível do pacote

O frontend usa exclusivamente o `level` retornado pela interface como o nível real atual do
pacote. A descrição dos pacotes serve para ajudar o usuário a entender e não substitui a origem do
valor retornado pela interface:

| Nível | Pool de prompt a cada 5 horas | Cota mensal de MCP / ferramentas | Prioridade de concorrência |
|---|---:|---:|---|
| Lite | cerca de 120 usos | 100 usos/mês | baixa |
| Pro | cerca de 600 usos | 1000 usos/mês | média |
| Max | cerca de 2400 usos | 4000 usos/mês | alta |

Esses valores podem ser ajustados conforme a estratégia da plataforma; a descrição mais recente
deve ser consultada na documentação oficial de uso da Z.AI / BigModel.

## Exibição no frontend

A cota restante do Coding Plan precisa usar o mesmo critério de exibição no Model Provider, na
barra lateral e no painel de context da caixa de entrada:

- Nível atual do pacote: vem de `data.level`
- Pool de 5 horas: vem do `percentage` e `nextResetTime` de
  `TOKENS_LIMIT + unit=3 + number=5`
- Pool semanal: vem do `percentage` e `nextResetTime` de
  `TOKENS_LIMIT + unit=6 + number=1`
- Chamadas de ferramentas: vem de `remaining / usage` e `nextResetTime` de
  `TIME_LIMIT + unit=5 + number=1`

O frontend exibe apenas os itens de quota retornados pela interface e reconhecíveis pelo
`type + unit + number` acima. Quando um item está ausente, ele deve ser ocultado; não se pode usar
o índice do array `limits` como fallback de exibição nem renderizar três cartões vazios fixos.
Assim o Model Provider, a barra lateral e o painel de context continuam exibindo a mesma
quantidade de itens para os mesmos dados de quota.

A página de configurações「使用统计」exibe:

- cota restante de ferramentas
- nível do pacote
- próxima data de reset
- proporção usada do pool de prompt de 5 horas
- descrição da cota de MCP / ferramentas
- uso detalhado por item de `usageDetails`
- estatísticas de uso das sessions locais

Quando as duas origens Z.AI e BigModel estão habilitadas e com API key configurada, a página de
configurações「使用统计」exibe um controle de troca de origem. Os cartões de benefício, o uso de
modelos, o uso de ferramentas e a ação de refresh seguem a origem atualmente selecionada, evitando que
com as duas configuradas apenas os dados do primeiro provider sejam exibidos implicitamente.

O「用量统计」do Coding Plan continua reutilizando a entrada e a estratégia de cache de
`getCodingPlanUsageSnapshot` / `useCodingPlanUsageStats`, mas a fonte de dados interna é alinhada
à página oficial de uso pessoal do BigModel:

| Área da página | Interface | Descrição |
|---|---|---|
| Cartão de cota restante | `/api/monitor/usage/quota/limit` | Usado apenas para as cotas de 5 horas, semanal e mensal de MCP. `percentage` representa a porcentagem usada; a visão `Usage remaining` do ZCode precisa invertê-la de forma unificada para porcentagem restante. |
| Atividade de tokens | `/api/monitor/credit-usage/activity` | Retorna a série de atividade de 365 dias e as estatísticas acumuladas. Usada no mapa de calor「Token 活动」e nos resumos de tokens acumulados, tokens de pico, tempo de uso acumulado e dias consecutivos. |
| Tendência de uso / detalhes de uso | `/api/monitor/credit-usage/usage-detail` | Retorna separadamente por `usageType=MODEL/MCP` as séries de créditos/tokens/chamadas de modelos e ferramentas, a taxa de acerto de cache, o total de créditos e a média diária de créditos. |
| Saúde do sistema | `/api/monitor/usage/model-performance-day` | Retorna a velocidade média de Decode no horário de pico de Max&Pro / Lite, usada no gráfico de linhas de saúde do sistema. |

As antigas `/api/monitor/usage/model-usage` e `/api/monitor/usage/tool-usage` não são mais a
principal fonte de dados da página de configurações do Coding Plan. No máximo podem servir como
fallback de compatibilidade quando o backend não retorna os novos dados de crédito, e não podem
continuar sobrescrevendo a atividade de tokens, a taxa de acerto de cache ou as estatísticas de
créditos.

O Coding Plan não segue a dimensão de análise `All / 30d / 7d` do topo da página de configurações.
Essa dimensão é usada apenas na visão de estatísticas de uso locais; o Coding Plan usa um escopo
próprio de「使用详情」:

| Escopo de 使用详情 | Intervalo de tempo da requisição | `granularity` retornado pelo service | `x_time` retornado pelo service |
|---|---|---|---|
| Dia atual | das 00:00:00 às 23:59:59 do dia | `hour` | de `00:00:00` a `23:00:00` |
| 7 dias | os últimos 7 dias naturais | `day` | datas `YYYY-MM-DD` consecutivas |
| 30 dias | os últimos 30 dias naturais | `day` | datas `YYYY-MM-DD` consecutivas |
| Datas personalizadas | o intervalo de dias naturais escolhido pelo usuário, no máximo 30 dias | `day` | datas `YYYY-MM-DD` consecutivas |

O service alinha as séries de modelos e ferramentas conforme o `x_time` retornado; quando o monitor
não devolve um determinado bucket de tempo, ele completa com 0, e os gráficos do frontend consomem
os dados apenas pelo index de `x_time`, sem deixar de inferir o eixo de tempo por conta própria.

O gráfico「使用详情」precisa ser dividido em dois níveis de tab, igual à página oficial de uso
pessoal do BigModel:

| Tab de primeiro nível | Tab de segundo nível | Critério do gráfico | Origem dos dados |
|---|---|---|---|
| 积分消耗 | 模型 | Consumo de créditos de modelos | `totalCreditsUsage` de `usageType=MODEL`; quando ausente, combina cached / uncached / output credits |
| 积分消耗 | 工具 | Consumo de créditos de ferramentas | `creditsUsage` de `usageType=MCP` |
| 用量消耗 | 模型 | Uso de tokens | `totalTokensUsage` de `usageType=MODEL`; quando ausente, combina cached / uncached / output tokens |
| 用量消耗 | 工具 | Número de chamadas | `mcpCallCount` / `usageCount` de `usageType=MCP` |

O formato do gráfico「使用详情」deve acompanhar a página oficial de uso pessoal do BigModel:

- usa gráfico de barras, e não de linhas.
- na dimensão de modelos, as barras são empilhadas em três segmentos: cached input / uncached
  input / output; o nome do modelo continua sendo um interruptor de legenda, e
  "cached / uncached / output" não são tratados como modelos independentes.
- a dimensão de ferramentas não tem divisão cached / uncached / output e renderiza barras
  diretamente por série de ferramenta.

A legenda acima do gráfico exibe:

-「消耗总量」é a soma das séries visíveis, e clicar nela restaura a exibição de todas as séries.
- cada item de modelo / ferramenta exibe o nome e a soma da métrica atual, e clicar oculta ou
  exibe aquela série.
- quando resta apenas uma série visível, não é possível ocultar a última série.
- quando não há dados no intervalo, exibe-se um estado vazio, sem renderizar gráfico vazio.

Os KPI de「使用详情」vêm do `summary` retornado pela interface correspondente ao tab de segundo
nível atual e exibem:

- taxa de acerto de cache
- total de créditos
- média diária de créditos
- se a interface retornar `trend`, a variação percentual é exibida ao lado do título do cartão

`credit-usage/activity` não é afetada pelo intervalo `当日 / 7日 / 30日` e sempre lê os últimos 365
dias naturais, com o frontend alternando sobre a mesma grade de 52 semanas:

| Tab de Token 活动 | Critério da célula | Texto de hover |
|---|---|---|
| Diário | tokens e rodadas de mensagem/chamada do dia | `{date}\n{tokens} tokens · {turns} 轮消息` |
| Semanal | total de uma coluna de 7 dias, com domingo na primeira linha | `{date} 当周\n{tokens} tokens · {turns} 轮消息` |
| Acumulado | valor acumulado até a semana, mantendo o destaque da coluna inteira no hover | `截至 {date} 当周累计\n{tokens} tokens · {turns} 轮消息` |

「系统健康度」usa um intervalo próprio e não segue「使用详情」:

| Intervalo de 系统健康度 | Intervalo de tempo da requisição | Exibição na página |
|---|---|---|
| Últimos 7 dias | os últimos 7 dias naturais | selecionado por padrão |
| Últimos 30 dias | os últimos 30 dias naturais | troca manual pelo usuário |

O gráfico de linhas de saúde do sistema exibe duas séries:

- `proMaxDecodeSpeed`: velocidade média de Decode no horário de pico de Max&Pro
- `liteDecodeSpeed`: velocidade média de Decode no horário de pico de Lite
- a unidade do eixo y é `tokens/s`
- o tooltip exibe, conforme a página oficial, o valor em `tokens/s` de cada série

Todos os limites de data são gerados conforme o `timeZone` passado pelo chamador. O Desktop local,
a Web e o controle remoto do celular leem tudo pela mesma entrada de injeção de dependência do
UsageStatsService, e o service não pode usar o fuso horário padrão do host no lugar do fuso da
requisição.

## Tratamento de erros

- Sem API key da Z.AI / BigModel configurada: exibe "未找到可查询 quota 的 API key" (nenhuma API key consultável de quota encontrada).
- A interface retorna "当前用户不存在 coding plan": exibe "暂无有效 Coding Plan" (nenhum Coding Plan válido no momento).
- Outros erros: exibe a mensagem de erro da interface e permite que o usuário faça a atualização
  manualmente.

## Limites de arquitetura

- A camada de UI obtém os dados apenas pelo hook `useUsageEntitlement`.
- A camada de serviço acessa a interface de quota do BigModel pelo
  `BigModelUsageQuotaProvider`.
- A origem da API key continua sendo o serviço existente de configuração de provider de modelo,
  sem alterar a lógica de login, logout, atualização ou autenticação do usuário via OAuth da Z.AI.
- O fluxo local do Desktop e o fluxo de workspace remoto passam o mesmo usage stats service por
  injeção de dependência, evitando que a UI acesse arquivos locais ou credenciais diretamente.