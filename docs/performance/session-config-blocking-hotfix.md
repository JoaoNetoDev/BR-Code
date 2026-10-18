# 3.12.2 Isolamento da Espera de Configuração no Chat

Baseline: `origin/hotfix/3.12.2`, `5f7d77dac3`. Este registro descreve apenas esta correção; abaixo estão os resultados de campo de 2026-09-14 em macOS arm64.

## Resumo da Feature

| Item | Decisão |
| --- | --- |
| Intenção / capability | A criação do chat e a recuperação a frio não dependem de configurações remotas opcionais; ferramentas OffPeak são admitidas apenas na chamada real |
| Camada / mode | validation, recovery, valores padrão de runtime; implementation-handoff |
| Seeds principais | createZCodeAgentService、getModelContextBudgetStrategy、AgentRuntime、getAutoCompactThreshold |
| Não incluído | criação duplicada de draft, inicialização de MCP, a falha de rede de configuração em si, gray release de página, algoritmos de cota/cobrança |

## Matriz de Superfície de UI

| Cenário / UI | Estado local / comando | Owner compartilhado | Comportamento / limite |
| --- | --- | --- | --- |
| Draft frio / Composer | Renderer draft → V4 createSession | Host capability → CLI Runtime | Registra ferramentas localmente; config pendente não bloqueia o envio |
| Sessão existente / Composer | sendText | Mesmo CLI Runtime | Nenhuma nova leitura de orçamento; FIFO inalterado |
| Recuperação a frio pela barra lateral | subscribe → resumePersistedSession | workspace capability → createRecord | Preserva o canal de política de workspace original, recupera histórico e ferramentas |
| Criação de ferramenta em ocioso | approval → OffPeakCreate | Host handler → OffPeakTaskService | Valida gray release/plano/modelo na chamada, e só então obtém número e grava no banco |
| Consulta de ferramenta em ocioso | OffPeakList | Repositório local de tasks do Host | Isolamento por workspaceKey; nenhuma nova consulta remota |
| Celular / remote workspace | trusted attachment → preferences | Bridge shared-host/remote existente | Mesmo orçamento fixo; remote continua não registrando ferramentas em ocioso |
| Página em ocioso | store / form original | subscription + task service originais | Gray release de página e regras de admissão inalteradas |

## Comportamento Compartilhado e Divergente

Os dois resolvers do Host retornam diretamente a mesma constante de orçamento compartilhado; a CLI normaliza as entradas legadas nos limites de Runtime e de materialização do protocolo.
O registro de ferramentas apenas indica que a máquina pode atender à chamada; a admissão de criação indica se a conta consegue obter um número naquele momento. A visibilidade de página é independente e não é liberada junto com o registro.

## Relacionamentos / Owners / Invariantes

| Rank | Relação | owner / sink / prova |
| --- | --- | --- |
| must-inspect | Sincronização de workspace e criação legacy/V4 → registro de ferramentas | Capacidade local do Host; testes de política e SCB01/02 |
| must-inspect | OffPeakCreate → validação → createTask | Host handler; SCB03 quando createTask=0 na rejeição, caminhos já permitidos |
| must-inspect | Runtime budget → compact / cap de saída por passo / sub Agent | Preflight unificado do Core; SCB04 / OTB / teste unitário de subagent |
| invariant-only | clientMode confiável, workspaceIdentity, owner/FIFO | Authority original de attachment/CLI, sem criar fila ou Host |
| invariant-only | Cache de sucesso/refresh forçado/outros consumidores de client-config | Owner original do provider; nenhum cache, timer ou refresh em segundo plano adicionado |

Nenhuma persistência de banco/Settings é adicionada; o protocolo compatível ainda aceita legacy, e o novo Runtime não adota o algoritmo antigo.

## Codegraph / Graph Drift / Delta

O novo worktree não tem `.codegraph` e, por convenção, nenhum índice é criado; profundidade 2 do Host → configuração / CLI → Runtime → caminhos de compact e output cap foi verificada por busca precisa de funções/pontos de chamada. Não se afirma ter executado varredura de codegraph.
O grafo não tem a restrição de que a inicialização do chat não pode esperar por esses dois tipos de configuração; a invariante confirmada pelo usuário foi adicionada aos nós conversation-runtime e off-peak-model-execution. Os demais nós/arestas e a estrutura de persistência não mudam.

## Handoff de Planejamento

Confirmação final do usuário: ferramentas locais são sempre registradas, o gray release só é consultado na criação real; orçamento fixo em preflight-v1, cancelado o fallback remoto.
Os setup/action/assertion de SCB01–05 e a camada de evidência já foram escritos no case catalog e na coverage matrix.
Parâmetros de latência de rede não fazem cartesian product: a barreira pendente representa a pior espera; a rejeição de configuração é representada por teste unitário do Host; prune do hot upgrade de processos antigos.
Nenhum item de produto pendente. Os novos E2E continuam em manual-review/pending, não marcados como revisados manualmente nem como aprovados pelo Docker.

## Validação

### Cadeia de execução e temporização

```text
Enter -> Host 本地能力 + 固定预算 -> CLI 接纳 -> 页面绑定/用户消息 -> provider HTTP
               client/configs 始终 pending，不参与上述等待
OffPeakCreate -> 现有审批 -> Host 灰度/套餐/模型 -> createTask -> 取号/落库
```

O mesmo gateway de configuração isolado e o mesmo fixture foram usados; para o baseline o código-fonte de produção foi temporariamente restaurado, os testes foram reconstruídos e depois todas as correções foram restauradas.
Abaixo está uma amostra única (milissegundos), que não representa percentis de produção. Os pontos HTTP são o instante em que o proxy local do provider recebe a requisição, o ponto de admissão vem do log `v4 prompt admitted` da CLI; o binding de página e a visibilidade da mensagem do usuário são registrados por um DOM observer.

| Cenário | Admissão CLI | Binding de página | Mensagem do usuário visível | Requisição HTTP |
| --- | ---: | ---: | ---: | ---: |
| Draft frio no baseline | 39444 | 39486 | 40081 | 40091 |
| Draft frio corrigido | 591 | 613 | 1259 | 3373 |
| Continuação em sessão existente corrigida | 16 | 0 | 115 | 36 |
| Envio após recuperação a frio com restart corrigido | 45 | 0 | 113 | 1476 |

O binding de página 0 nas linhas de continuação/recuperação significa que a sessão já estava aberta antes do Enter. O baseline teve 8 requisições de configuração e 0 respostas, e falhou após o envio final porque a lista de ferramentas não tinha OffPeakCreate; corrigido, os três estágios tiveram 6/6/10 requisições e sempre 0 respostas.
As evidências brutas estão no workspace em `packages/desktop/.e2e-artifacts/scb-baseline/` e `scb-final/`, cada um com `timing-reviewed.json` preservando o session id associado e os timestamps originais, e runtime-logs preservando os logs de admissão.

Os novos casos exigem adicionalmente que de Enter até o HTTP seja menor que o timeout de configuração existente de 15 segundos; não podem passar com "esperar o timeout e ter sucesso no final".
A reexecução isolada de `scb-guard-isolated/` passou, com HTTP de cold/continuação/recuperação em 2743/87/2118 ms e configuração ainda sem resposta.

### Resultados da automação

- Serviço/Host direcionado 4 arquivos 91 casos, Core 6 arquivos 59 casos, protocolo de sessão 2 arquivos 90 casos aprovados.
- shared-host attachment, remote workspace bridge, connection scope 3 arquivos 38 casos aprovados.
- bridge de ferramentas em ocioso, integração com banco temporário real/gateway simulado, task service 3 arquivos 29 casos aprovados.
- E2E real com Electron no Desktop: os três specs de isolamento de espera de configuração, model-output-token-budget e model-output-token-preflight passaram; limiar de Compact de 94K, reserve de 21K, summary de 20K e o limite por requisição passaram pelo Runtime/HTTP reais.
- `pnpm typecheck` na raiz, `typecheck:e2e` do Desktop e typecheck do Core passaram; lint da raiz com 0 erros, e os lints isolados de Core/bootstrap/contracts com 0 erros; verificação de arquitetura com 0 novos problemas.
- `ZCODE_AFFECTED_TEST_BASE=origin/hotfix/3.12.2 pnpm verify:pre-push` passou: executou lint, arquitetura, testes unitários alterados e related tests com base na diferença real do baseline `5f7d77dac3` até o commit de implementação, e não num resultado de skip sob diferenças não commitadas. No final, apenas este registro e o formato do doc D49 foram complementados; código de produção e testes não mudaram mais.
- A verificação de metadata de fixture passou. Os novos cases permanecem em manual-review/pending, sem alegar revisão manual ou aprovação do Docker.

### Itens não aprovados e limites

- Testes de protocolo de Bootstrap 109/111 passaram; as duas falhas se reproduzem no baseline original: denylist de Cron remoto e o contrato array/objeto de providers do Account Config. Esses comportamentos não foram modificados junto.
- A auditoria global de coverage de conversa teve 9 erros consistentes com o baseline original: referências I74/I75, quatro itens de estatística e três documentos gerados desatualizados. O YAML do grafo é parseável e não tem ids duplicados; as quatro arestas pendentes são consistentes com o baseline original, e desta vez apenas foram acrescentadas as invariantes dos dois novos nós.
- O E2E adicional `conversation-session-offpeak-create` falhou em beforeSession porque o código de mock de configuração existente lê os providers já existentes em forma de array por objeto e reclamou da ausência de `account:zai-offpeak-idle-plan.api`; não entrou no corpo do teste e não é contado como aprovação. O caminho normal de obtenção de número/gravação é verificado pelos testes de integração do service.
- Um E2E adicional de configuração capturou `runtime is not running` no Host durante a troca de modelo e não commitou mensagem do usuário; os logs estão em `scb-final-guard/`. Esta vez não foi tratada a corrida de troca de modelo/draft duplicado; a reexecução isolada passou, e essa falha não é interpretada como espera de configuração nem a corrida é declarada corrigida pela reexecução.
- A cadeia do celular foi verificada desta vez até o protocolo e a camada de serviço do shared-host/remote bridge; não rodou GUI completo em celular real, SSH/WSL/Docker; Desktop Windows/Linux não foi executado. O código continuous/replayable, owner e identity não foi alterado.
- O wrapper de lint de nível superior da CLI não tem uma configuração turbo utilizável; os lints por pacote acima são os resultados reais de execução.
- A causa raiz de rede de configuração/inicialização de MCP não foi modificada; nenhum cache nem refresh em segundo plano foi adicionado; processos antigos em execução ainda usam o próprio algoritmo antes da atualização.