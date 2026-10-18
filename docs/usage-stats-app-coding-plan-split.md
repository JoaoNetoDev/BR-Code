# Divisão entre App Usage e Coding Plan nas Estatísticas de Uso

## Objetivo

A seção "Uso" da página de configurações é dividida em dois caminhos independentes:

- App Usage: lê apenas o histórico local de sessões e mostra a atividade de uso dentro do produto.
- Coding Plan: lê apenas o provider de Coding Plan selecionado e mostra a cota do plano e o uso do monitor.

O Coding Plan não faz fallback para App Usage, sessão local, API Key comum da Z.AI/BigModel ou key de variável de ambiente.

## Layout Superior

```text
Uso              [ App Usage | Coding Plan | Projeto A | Projeto B ]
App Usage:  [ resumo all-time ] [ 30d / 7d ]
Coding Plan:                         [ hoje / 7d / 30d ]
```

- A tab principal expõe as fontes de estatísticas em nível de conta: `App Usage`, o Coding Plan pessoal e cada projeto de Team Plan assinado.
- A tab Coding Plan não acompanha mais o modo de conexão do workspace atual; a seleção atual entre API Key, Start Plan ou Team Plan não oculta as fontes de uso pessoal / de equipe que a conta já possui.
- A visão geral completa do App Usage fica fixa acima do controle de intervalo de tempo.
- O Coding Plan mantém o intervalo `today` / `7d` / `30d` e não usa a métrica de visão geral completa do App Usage.

## App Usage

```text
[ Total de Tokens ] [ Pico de Tokens ] [ Maior duração de conversa ] [ Dias consecutivos atuais ] [ Maior sequência de dias ]

Os valores compactos de Token no resumo em métricas de texto precisam manter um espaço entre o número e a unidade (por exemplo `370 milhões`), consistente com o espaçamento das unidades de duração e de dias; outros cenários de Token com exibição compacta não são afetados por esta regra.
  // Lê sempre os dados completos dentro do intervalo de retenção do usage DB atual, sem influência das trocas de intervalo de tempo abaixo.

[ Token Activity / Calendar Grid ]                  [ Daily / Weekly / Cumulative ]
  // independent range control, reads range=all, first row is Sunday, bottom row shows month labels.
  // Daily: one cell is one day. Weekly: one column is that week's total. Cumulative: one column is total through that week.

[ Intervalo de tempo: 7d / 30d ]

[ Gráfico de tendência diária de tokens ]

[ Gráfico de pizza de uso por modelo ]
  donut chart                                model name + tokens + percent
```

- A área de plotagem do gráfico de tendência mantém uma margem segura de 24px à esquerda e à direita, garantindo que as datas inicial e final apareçam completas tanto no desktop quanto na Web móvel, sem recorte pela borda do SVG; as tabs de intervalo abaixo usam estilo pill, com dimensões alinhadas às task tabs.
- A linha de visão geral completa fica acima do controle de intervalo e usa o snapshot do App Usage com `range=all`; ela exibe apenas métricas agregadas e não altera a janela de gráfico de 7d/30d abaixo.
- A linha de visão geral completa não usa borda externa; o container usa `rounded-xl`. Na disposição horizontal do desktop, as métricas são separadas por linhas verticais independentes `w-px h-7`, sem usar classes de border para divisão.
- A atividade de tokens fica abaixo da visão geral completa e usa um alternador de intervalo independente `Diário / Semanal / Acumulado`; ela lê os dados de heatmap com `range=all` e não é afetada pelo intervalo de gráfico `Últimos 7 dias / Últimos 30 dias` abaixo.
- A grade de atividade de tokens exibe sempre as últimas 52 semanas naturais, alinhada uniformemente por semana natural, com a primeira linha sendo domingo; 52 colunas dividem o container igualmente e não há rolagem horizontal, e os meses são exibidos na parte inferior. O modo `Semanal` preenche colunas inteiras de baixo para cima com o total da semana, e o modo `Acumulado` preenche colunas inteiras de baixo para cima com o total acumulado de tokens até aquela semana; nesses dois modos, ao passar o mouse sobre qualquer célula, a coluna inteira é destacada e o tooltip fica ancorado ao container da coluna inteira. O tooltip usa uma estrutura de duas linhas: a primeira exibe a data/o intervalo da semana e a segunda o número de tokens e o número de turnos de mensagem.
- `Maior duração de conversa` soma `duration_ms` dos turns concluídos dentro da mesma sessão e toma o máximo, evitando confundir a duração de um único turno com a duração de toda a conversa.

Fonte de dados: agregação do repositório local de sessões.

## Coding Plan

```text
[ Z.AI | BigModel ]   // exibido apenas quando ambas as contas de Coding Plan estão disponíveis

[ Cota restante de 5 horas ]   [ Cota restante semanal ]        [ Chamadas de ferramenta ]
  remaining percent      remaining percent     remaining percent
  remaining progress     remaining progress    remaining progress
  hora de reset (exibida de forma unificada apenas na página de configurações de Uso, por exemplo "16 de setembro, 23:00"; não exibida quando nextResetTime estiver ausente)

O cartão de status de Coding Plan em Model Providers, na página de configurações, também exibe o mesmo conjunto de cotas restantes. As três barras de progresso devem reutilizar, na ordem, a paleta do gráfico de uso:

- Cota de 5 horas: `--color-usage-chart-1`
- Cota semanal: `--color-usage-chart-2`
- Chamadas de ferramenta (mensal): `--color-usage-chart-3`
- Cota diária do ZCode MCP: `--color-usage-chart-5` (amarelo quente da paleta de gráficos)

O cartão de saldo do Start Plan mantém o verde de estado de sucesso e não acompanha a paleta multicolor de cotas do Coding Plan.

Uso de modelos
[ Total de tokens consumidos ] [ Top Model 1 ] [ Top Model 2 ] [ Top Model 3 ... ]
[ Gráfico de uso de modelos multilinha ]

Uso de ferramentas
[ Busca na web MCP ] [ Leitura de páginas MCP ] [ Repositórios open source MCP ... ]
[ Gráfico de uso de ferramentas multilinha ]
```

Fontes de dados:

- quota: cartão de cota do plano. `percentage` é a proporção já utilizada retornada pelo servidor; o frontend deve invertê-la para exibir o percentual de cota restante.
- `/api/monitor/usage/model-usage`: tendência e resumo de uso por modelo.
- `/api/monitor/usage/tool-usage`: tendência e resumo de uso por ferramenta.

Usar apenas os novos campos do monitor: `x_time`, `granularity`, `modelDataList`, `modelSummaryList`, `toolDataList`, `toolSummaryList`.

## Regras de Provider / Source

Um provider de Coding Plan disponível deve atender a:

- provider id igual a `zaiCodingPlan` ou `bigmodelCodingPlan`.
- provider habilitado.
- apiKey do provider não vazio.

- A origem do Coding Plan pessoal vem do entitlement ativo, e o rótulo da tab é `Coding Plan` por padrão; se existirem múltiplas origens pessoais ao mesmo tempo, elas podem ser distinguidas pelo nome do provider.
- A origem do Team Plan vem de projetos de pacotes corporativos assinados, e o rótulo da tab usa apenas o nome da organização; quando o nome da organização estiver ausente, não se usa o nome do projeto, o ID de organização/projeto, o nome do produto nem `Team Plan` como fallback.
- Requisições de Team Plan devem enviar `organizationId` / `projectId`; requisições de Coding Plan pessoal não enviam contexto de equipe.