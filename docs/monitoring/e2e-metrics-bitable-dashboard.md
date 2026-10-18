# Dashboard de Métricas E2E no Bitable

## Contexto

`scripts/ci/push-e2e-metrics-to-bitable.mjs` grava o `summary.json` de E2E na tabela `e2e_runs` da tabela multidimensional (Bitable) do Feishu `E2E Test
Metrics`. O dashboard antigo usava `started_at` diretamente como eixo x; como
vários envios no mesmo dia se espalhavam pelo horário aleatório de envio, a tendência do overview ficava difícil de ler.

## Convenção de campos

O dashboard depende de dois campos de fórmula do Base, cujos valores são calculados imediatamente a partir dos
registros históricos, sem necessidade de escrita adicional pelo script de push:

- `started_day`: `TEXT([started_at], "YYYY-MM-DD")`
- `started_day_time`: `TEXT([started_at], "MM-DD hh:mm")`

Os registros de execução do Windows gravam adicionalmente `windows_version`. Esse campo lê preferencialmente
`Win32_OperatingSystem.Caption` da máquina de execução, preservando as informações reais de produto como Server /
Home / Pro / Enterprise / Education; a Edition não pode ser inferida apenas pelo build do kernel. Quando a descrição do
produto está indisponível, registra-se apenas o build do Windows original, sem inventar uma Edition como `Pro`.

Ao adicionar um gráfico de tendência, não use `started_at` diretamente como eixo x do overview. Use `started_day` no
overview e `started_day_time` nos dashboards por plataforma.

## Camadas do dashboard

Atualmente o Base mantém três dashboards:

- `E2E 测试质量看板`: dashboard de overview. O componente de tendência agrega por `started_day`; métricas de taxa de
  aprovação e de duração usam `AVERAGE`, métricas de contagem de falhas usam `SUM`.
- `E2E 测试质量看板 - macOS`: dashboard dedicado a macOS, filtrando uniformemente `platform = darwin`.
- `E2E 测试质量看板 - Windows`: dashboard dedicado a Windows, filtrando uniformemente `platform = win32`.

O dashboard de overview não mantém dados separados de macOS / Windows nem gráficos de comparação entre plataformas; os
dados por plataforma ficam apenas nos dashboards de plataforma.

Cada dashboard de plataforma inclui:

- cartões de métricas de resumo: número de execuções, taxa média de aprovação, contagem de falhas, falhas de
  Assertion, falhas de Timeout, falhas de Crash, falhas de Infra.
- gráficos de tendência: tendência da taxa de aprovação, P50/P95 de duração por Case, duração total por Suite,
  tendência da contagem de falhas.

Os dashboards por plataforma exibem cada momento de envio usando `started_day_time`.

## Cuidados de manutenção

- ao adicionar uma plataforma, prefira copiar a estrutura de componentes de um dashboard de plataforma existente e
  trocar apenas o valor de filtro `platform`.
- se o Base ou a tabela forem recriados, restaure primeiro os campos de fórmula acima e só então crie os componentes do
  dashboard.
- a interface de atualização de blocos de dashboard do Feishu tem limite de frequência; ao modificar componentes em
  lote, execute em série e deixe um pequeno intervalo entre as requisições.
- o token do Bitable e as requisições de escrita de registros têm, cada um, timeout de 30 segundos; uma requisição que
  falhar ou estourar o tempo deve retornar um código de saída diferente de zero, cabendo a quem chama decidir se isso
  bloqueia o CI atual.
