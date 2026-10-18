# Catálogo de Casos E2E de Usage Stats

## Objetivo

Este catálogo define os contratos de Desktop E2E das comportamentos novos ou modificados na branch `fix/usage-remaining-refresh`. O escopo cobre App Usage, Coding Plan pessoal／empresa, atualização de acesso, sincronização entre entradas (Context／Footer／Provider Settings) e a recuperação de erros que pode ser observada de forma estável pelas cadeias reais de renderer, host e CLI.

Este documento só conta como cobertura o cenário que tem setup, action e assertion independentes. Mapeamentos puros, matemática de datas e limpeza de dados de gráficos continuam tendo como principal evidência o focused test; o relatório de E2E coverage serve apenas para encontrar lacunas de execução e não substitui as asserções de comportamento.

## Dimensões de status e poda sugerida

| Dimensão               | Valores                                                          | Decisão sugerida                                               | Motivo                                                       |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Domínio de dados      | App Usage / Coding Plan quota / activity / credit / health      | Incluir tudo                                                    | A branch altera UI, service e agregação de CLI ao mesmo tempo |
| Origem do plano       | Z.AI pessoal / BigModel pessoal / BigModel Team                 | Cobrir BigModel pessoal e Team por completo; Z.AI como amostra representativa de isolamento de origem | Evita o produto cartesiano de marcas sobre o mapper compartilhado |
| Entrada               | Usage / Context / Footer / Provider Settings                    | Incluir tudo                                                    | Access freshness e snapshot compartilhados são o contrato central desta branch |
| Resultado             | success / empty / business error / network error / recovery     | Incluir todos os caminhos de alto valor                         | Atinge classificação de erros, limpeza de cache e force refresh |
| range                 | today / 7d / 30d / all                                          | Ao menos um caso por semântica; sem multiplicar por origem       | O range muda requisição e exibição, mas é ortogonal à marca  |
| client                | desktop-continuous / web-remote-replayable                       | Desktop completo; no celular manter só os invariantes de shared-host | Usage não entra no estado replayable de task                  |
| viewport/theme/locale | desktop / narrow; light / dark; zh / en                          | Uma amostra representativa por eixo, sem todas as combinações   | A compatibilidade de exibição precisa de evidência, mas é ortogonal à origem dos dados |
| timing                | fast / in-flight / freshness / retry                            | Incluir tudo                                                    | Concorrência e política de refresh são caminhos de alto risco desta branch |

O usuário confirmou D1-D4 e, desde 2026-08-17, essa poda é o limite de planejamento aceito. O estado histórico `proposed` da tabela abaixo foi elevado uniformemente para `accepted`; somente o case implementado e aprovado por asserções independentes pode ser marcado como `covered`.

## App Usage

| Case                     | Setup                                                            | Action                            | Assertions                                                                         | Status       |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| US-AU-01 empty           | Nenhum usage fact em um HOME isolado                              | Abrir Settings > Usage > App Usage | Resumo total, Token Activity, tendências e distribuição por modelos mostram um estado vazio determinado, sem requisição de plano remoto | formal-green |
| US-AU-02 mixed history   | Seed de várias sessions: usage novo, fallback antigo de caracteres, entre dias e multi-modelo | Abrir App Usage                    | Totais de tokens, sessions, active days, maior session e dias consecutivos corretos; dados antigos não se perdem nem se duplicam | formal-green |
| US-AU-03 range isolation | Seed de dados com mais de 30 dias                                  | Alternar 7d / 30d                 | Resumo total e activity de 52 semanas inalterados; tendência e distribuição por modelos mostram apenas o range atual | formal-green |
| US-AU-04 activity modes  | Seed com datas esparsas, atravessando meses e semanas zeradas     | Alternar diário／semanal／acumulado e passar o mouse           | Início em domingo, 52 semanas, rótulos de mês, destaque de coluna, tooltip de duas linhas e monotonicidade do acumulado corretos | formal-green |
| US-AU-05 chart extremes  | Seed com mais de 7 modelos, modelos desconhecidos e tokens extremos | Verificar tendência e pizza de modelos | Preenchimento com zero nas datas vazias, eixos das extremidades sem corte, modelos Top e agregação de "outros modelos" corretos | formal-green |

## Dados e origens do Coding Plan

| Case                                | Setup                                                                  | Action                        | Assertions                                                                                                                                                                                                                        | Status                 |
| ----------------------------------- | ---------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| US-CP-01 personal credit            | Plano pessoal BigModel, quota + credit activity/detail/performance com sucesso | Abrir Coding Plan pessoal     | remaining em porcentagem, KPIs, stacked model bars, tool usage e health vêm todos das interfaces correspondentes; o corpo de Peak tokens não concatena datas e o hover no ícone de informação mostra a data do pico; o hover em Token Activity exibe os tokens reais do remoto e a contagem de ferramenta `mcpCalls`, sem mostrar turnos ausentes como `0 轮消息` | covered                |
| US-CP-02 team scope                 | Team pricing com organização／projeto, todas as interfaces de usage com sucesso | Abrir a tab Team                | A requisição carrega organization/project e a UI não mistura origens pessoais                                                                                                                                                                                  | covered                |
| US-CP-03 source switching           | Seed simultâneo de origem pessoal e das duas origens de equipe          | Alternar as tabs em sequência    | quota/model/tool independentes por tab; as requisições pessoais não carregam header de equipe                                                                                                                                                                      | covered                |
| US-CP-04 range switching            | Os três ranges retornam markers diferentes                             | Alternar today/7d/30d           | A data da requisição é consistente com o range da UI; o range antigo faz apenas uma transição local e não entra no cache compartilhado do novo scope                                                                                                                                                          | covered                |
| US-CP-05 legacy fallback            | Interface de credit indisponível, legacy monitor com sucesso           | Abrir Coding Plan               | Exibe a tendência legacy, oculta os KPIs de credit que só existem na versão nova e não recai para App Usage                                                                                                                                                                        | focused-test           |
| US-CP-06 optional failures          | quota com sucesso; activity/detail/performance falhando individualmente | Abrir a página por cenário      | Apenas a região opcional correspondente é limpa; as demais são preservadas                                                                                                                                                                                                  | covered-representative |
| US-CP-07 fatal failures             | Três cenários: falha de rede no quota, falha de negócio com HTTP 200 e token inválido | Abrir a página e tentar novamente | Página em erro global; erro de negócio não se disfarça de estado vazio nem de credential generic; os dados aparecem após a recuperação                                                                                                                                                             | covered-representative |
| US-CP-08 team availability recovery | Falha de rede／negócio inicial no quota de Team, seguida de sucesso      | Reabrir / forçar refresh        | A falha não grava cache de sucesso de 24h; após a recuperação, provider／tab ficam sincronizados e disponíveis                                                                                                                                                                               | proposed               |
| US-CP-09 reset presentation         | Limites de 5h, week e MCP com e sem reset time                        | Verificar Usage e Provider Card  | Todos os limites de usage stats mostram dia+mês+hora; o Provider Card mantém o formato compacto existente; valores ausentes ficam ocultos; a ordem das três cores está correta                                                                                                                                         | covered-representative |

## Atualização de acesso e sincronização entre entradas

| Case                             | Setup                                       | Action                                                                        | Assertions                                                       | Status   |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| US-RF-01 freshness               | quota server contável, snapshot já obtido com sucesso | Acessar Footer, Context, Usage e Provider Card em sequência dentro de 60 s e depois avançar o tempo | Uma requisição na primeira vez; sem repetição dentro da janela; nova requisição após o vencimento | proposed |
| US-RF-02 in-flight success       | A primeira requisição do mesmo scope permanece pending | Montar as duas entradas ao mesmo tempo e concluir a requisição                 | A camada de baixo faz apenas uma requisição e as duas entradas recebem o mesmo snapshot | proposed |
| US-RF-03 in-flight failure       | A primeira requisição do mesmo scope permanece pending e depois falha | Montar as duas entradas ao mesmo tempo                                       | A camada de baixo faz apenas uma requisição, as duas entradas recebem o erro e o cache pending é limpo | proposed |
| US-RF-04 force triggers          | cache `none/unavailable`                    | Disparar refresh manual, mudança de token／fingerprint e compra bem-sucedida   | Todos contornam a freshness e sondam novamente                    | proposed |
| US-RF-05 retry backoff           | O server falha várias vezes e depois tem sucesso | Acessar em 30/60/120/300 s                                                    | A sequência de backoff está correta e zera após o sucesso; a access freshness não mascara a janela de recuperação | proposed |
| US-SY-01 cold footer             | Autenticado e provider configurado, sem abrir as configurações | Iniciar o workspace                                                            | O Footer sonda ativamente e mostra a cota, sem depender do aquecimento de outras entradas | proposed |
| US-SY-02 context feedback        | Há cache e as requisições de acesso falham／tem sucesso em sequência | Passar o mouse sobre o Context                                                 | loading→勾 de sucesso em 1 s→detalhes; na falha, o cache é preservado e um warning tooltip é mostrado | proposed |
| US-SY-03 context empty recovery  | Sem cache e a primeira requisição falha      | Passar o mouse e clicar em tentar novamente                                   | Mostra notice e botão de retry; após o sucesso, substitui pela barra de cota | proposed |
| US-SY-04 mounted synchronization | Footer, Context e Usage montados ao mesmo tempo | Forçar refresh em qualquer uma das entradas                                    | As demais entradas exibem o novo snapshot do mesmo scope sem precisar se remontar | proposed |

## Exclusão mútua entre Coding Plan e Start Plan

| Case                               | Setup                                               | Action               | Assertions                                     | Status |
| ---------------------------------- | --------------------------------------------------- | -------------------- | ---------------------------------------------- | ------ |
| US-SP-01 coding preferred          | Coding Plan com quota e Start Plan existente ao mesmo tempo | Abrir Context／Footer | Consulta e exibe apenas o Coding Plan, sem mostrar o Start Plan |
| US-SP-02 explicit no-plan fallback | Coding Plan com `no_plan` explícito e Start Plan disponível | Abrir o Context       | Permite consultar e exibir o Start Plan          |
| US-SP-03 no transient fallback     | Coding Plan em pending／network／token／unavailable | Abrir o Context       | Nenhum estado transitório rebaixa para o Start Plan |
| US-SP-04 start access              | Apenas Start Plan, balance server contável           | Primeiro／repetido hover | Primeira requisição; reuso dentro de 60 s; refresh silencioso com cache, sem piscar vazio |

## Compatibilidade e invariantes de arquitetura

| Case                      | Setup                                          | Action                                | Assertions                                                          | Status   |
| ------------------------- | ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | -------- |
| US-CM-01 narrow viewport  | viewport estreito do renderer + dados densos   | Operar nas tabs de Usage, gráficos e tooltips | Nenhum controle essencial fica inacessível; activity pode rolar; tooltip não ultrapassa os limites | accepted |
| US-CM-02 theme/locale     | Amostras representativas de Zai Light／escuro e de zh／en | Abrir as quatro entradas em sequência  | semantic color legível, textos sem truncamento essencial e erros sem vazar conteúdo bruto do provider | accepted |
| US-CM-03 remote invariant | workspace remoto shared-host com Usage disponível | Abrir Usage e atualizar                 | Usa o service injetado; não cria runtime próprio nem grava snapshot replayable de task | accepted |

## O que fica explicitamente fora da enumeração por GUI E2E

- Cada combinação de campos null／NaN／negativo／fora de ordem do mapper, coberta pelos focused tests de services.
- Cada fronteira de data, fuso horário e semana natural, coberta pelos focused tests de CLI／query e de UI.
- O produto cartesiano completo de marcas × range × theme × locale × viewport.
- Ramos defensivos que não são alcançáveis de forma estável pela UI e não têm resultado observável pelo usuário.