# Todo 57：Execução Real dos Provider E2E e Fechamento da Regressão

> Status atual (2026-09-09): este Todo de verificação foi encerrado; os itens restantes são assumidos exclusivamente pelo [Todo102](todo-102-verification-debt-closeout.md) e não são mais escalonados separadamente. O status e as falhas abaixo são registros históricos; o encerramento não significa que as falhas originais foram resolvidas.

> Status: implementado; 45 Provider E2E de macOS passaram, apenas 1 caso real de SSH Remote Environment não foi executado por falta de credenciais
>
> Data: 2026-09-01
>
> Entradas: Provider E2E já migrados pelo Todo 52, semântica final de Provider Template do Todo 55, análise de regressão de 2026-08-31 e comportamento de Remote Environment Provisioning adicionado pelo Todo 56.

## 0. Objetivo

O Todo 52 já concluiu a migração do código de teste, dos fixtures e da semântica de produto vigente, mas a principal evidência na época era o typecheck de E2E, a validação de fixtures, testes unitários, lint e typecheck de todo o repositório — o que não equivale a dizer que as 37 E2E de Desktop afetadas passaram de fato por execução WDIO.

Neste Todo, com a semântica de produção do Todo 56 estável, o Desktop/Electron é realmente iniciado e os E2E relacionados a Provider são reproduzidos grupo por grupo, corrigidos e executados, até que seja possível apresentar evidência de execução em nível de caso.

```text
Todo 56 生产基线稳定
        |
        v
E2E 前置校验
        |
        v
单 Case WDIO 实跑
        |
        v
按共性根因批量修复
        |
        v
Provider 回归组实跑
        |
        v
容器/整组验证与报告
```

## 1. Critério de verificação

É preciso distinguir claramente:

| Evidência                           | O que prova                                            | Equivale a E2E aprovado |
| ------------------------------ | ----------------------------------------------------- | ----------------- |
| `typecheck:e2e`                | o TypeScript de E2E compila                                 | 否                |
| verificação de fixture / auditoria de cobertura | estrutura correta de Fixture, manifest e matriz de cobertura                   | 否                |
| testes unitários                       | comportamento局部 correto de helper/serviço                               | 否                |
| spec WDIO única                   | setup/action/assertion do caso realmente concluídos no Electron | sim, para esse caso       |
| spec Docker única                 | o caso passa no ambiente isolado padrão                            | sim, para esse ambiente        |
| preset Provider/Conversation   | os casos incluídos no suíte passam em lote                            | sim, para esse suíte        |

O relatório final não pode mais usar “as verificações relevantes passaram” no lugar de “o E2E foi executado e passou”. Execuções não realizadas, bloqueios de ambiente, falhas de produto e casos obsoletos devem ser listados separadamente.

## 2. Limites atuais de produto

- A família de Provider Z.ai / BigModel e a Connection Selection estruturada continuam mantidas; não se pode mais remover os E2E formais correspondentes;
- Os casos de compatibilidade legados `mode/selectedKey` não publicados continuam removidos, sem restaurar a migração de compatibilidade;
- O Todo 55 já é a linha de base de produção deste Todo: providers de terceiros comuns são criados a partir de um Template como instância Personal, e a API de pagamento da Z.ai/BigModel deixa de ser Family Connection Selection;
- O cenário de Account é conduzido por mocks formais de Account API/Credential, sem se passar por provider Personal de API key;
- O cenário de Personal Provider grava o overlay Personal formal;
- A Model Selection usa o `{ providerId, modelId, options }` completo;
- A atualização a quente de Personal Config permite uma diferença de tempo de polling de produção, com espera unificada de 2 segundos; só se aumenta para 3 segundos no mesmo helper quando houver evidência do CI de que ainda é insuficiente;
- Não se restauram o push de revisão do Registry já removido, o mode antigo de Provider, o mapa duplo de reasoning antigo nem hardcode de modelos específicos.

## 3. Infraestrutura de testes compartilhada

Continua-se usando o limite comum do Todo 52, sem criar um segundo fixture de Effective Registry:

- `seedPersonalProviderConfig(...)` / helper equivalente já existente: grava apenas Personal Provider/Overlay;
- mock formal de Coding Plan + Credential Store: prepara fatos upstream de conta, plano, quota, activity, opportunity etc.;
- helper atômico de Model Selection persistida: usado apenas em casos de cold start/restart;
- `waitForSelectableModel(...)`: espera o modelo ficar selecionável a partir da Selection View formal;
- `waitForProviderConfigPolling()`: trata apenas a tolerância de 2 segundos da atualização a quente de Personal Config;
- fixture de Selection mínima não vazia de Bot: só remove a pré-condição de execução do Bot, não substitui as asserções de cartão/terminal;
- fixture de Provider Family Selection: grava apenas a selection estruturada vigente, sem o mode/selectedKey antigo.

Quando o Todo 56 complementarmente adicionar helpers de Remote Provisioning E2E, eles precisam ser disparados pelo ciclo de vida real da conexão, sem chamar diretamente a Target Store para fingir o caminho do usuário.

## 4. Grupos de execução

### 4.1 Primeiro grupo: Smoke e infraestrutura

Escolher primeiro os casos mínimos e de maior valor diagnóstico, para provar que um MacBook Pro, no diretório de trabalho padrão, consegue iniciar o Electron de verdade, conectar um provider mock e completar as asserções:

1. um caso de criação e primeiro envio de Personal Provider;
2. um caso de Coding Plan Settings;
3. um caso de restauração de Model Selection em cold start;
4. um caso de Bot Selection/Card.

Se o Smoke não conseguir iniciar, corrigir primeiro o harness de E2E, os artefatos de build ou o ambiente de teste; não é permitido alterar por isso a semântica de produção de Provider.

### 4.2 Segundo grupo: as 37 regressões do Todo 52

Executar por(commonality), e não pela ordem dos arquivos:

1. 4 casos de Bot;
2. CTP/QR e Upgrade WebView;
3. atualização a quente de CW/OTB/Personal Provider;
4. Restart/Family Connection Selection;
5. Turbo/reasoning;
6. Subagent structured selection.

O Todo 55 ainda precisa completar e executar de fato os seguintes representantes de semântica final:

- múltiplas instâncias de Provider criadas a partir do mesmo Template, com o Personal Overlay e a identidade real de requisição sem contaminação mútua;
- a API de pagamento Z.ai/BigModel criada por um Template comum, sem entrar no Account Family Connection Selection;
- a Welcome API Key cria uma nova instância de Personal Provider a cada uso, sem reutilizar um Provider ID fixo;
- valores padrão do Template, alterações Personal e a restauração completa dos padrões usam a mesma linha de base do Resolver;
- `enabled` no topo do Provider, `standard-builtin` e o ponto de entrada de ressurreição do Built-in comum zeram na UI, no protocolo e na persistência.

Regras de tratamento por grupo:

- reproduzir primeiro com a spec original e salvar o log de falha completo / captura de tela;
- determinar se é bug de produção, drift de fixture, asserção obsoleta ou problema de ambiente;
- bug de produção: primeiro adicionar um teste que fixe a causa raiz e só então fazer a correção mínima no código de produção;
- drift de fixture: alterar apenas o setup, sem enfraquecer a action/assertion original;
- comportamento obsoleto: só remover ou reescrever o caso quando já existir uma decisão explícita, sincronizando catalog/matrix;
- se for preciso alterar a semântica de produto de Provider/Account/Selection, interromper a implementação e solicitar uma decisão.

### 4.3 Terceiro grupo: Remote Provisioning do Todo 56

Adicionar ou promover as provas mínimas mas completas do comportamento de Remote Environment:

- abrir um segundo Workspace no mesmo Environment não gera uma segunda sincronização inicial;
- depois de salvar um Personal Config local, um Model criado remotamente depois usa a nova configuração;
- mudanças em Configured Default/Account/Credential disparam a sincronização;
- limpar o Personal Config local ou remover uma credencial da allowlist propaga;
- salvamentos consecutivos durante a sincronização convergem para o snapshot mais recente;
- falha de Provisioning não bloqueia o Remote Workspace;
- não afeta o roteamento de `workspaceIdentity` do Workspace remoto nem o limite de replayable do celular.

Casos novos são escritos primeiro no case catalog/coverage matrix correspondente. Interações que exigem confirmação humana entram primeiro como `manual-review/pending` e não podem ser apresentadas como cobertura formal antes da confirmação.

## 5. Fluxo de execução real

### 5.1 Para cada caso

```bash
pnpm --filter @zcode/desktop typecheck:e2e

pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec './test/e2e/<path>/<case>.test.ts'
```

Casos de Conversation replay também precisam:

1. rodar `e2e:fixture:check`;
2. executar de fato com `common.json + fixture local do caso`, provando que não dependem do legacy shared fixture;
3. então rodar o replay padrão;
4. casos que precisam entrar no suíte de container fazem prova de admission Docker de caso único.

### 5.2 Regressão em lote

Em ordem crescente de risco:

1. testes unitários direcionados de Provider/Account/Selection/Provisioning;
2. `pnpm --filter @zcode/desktop typecheck:e2e`;
3. os quatro Smoke WDIO;
4. os seis grupos WDIO de Provider acima;
5. casos formais de Remote Provisioning;
6. `pnpm typecheck`;
7. `pnpm lint`;
8. `pnpm test:unit`;
9. `pnpm test:e2e:container:conversation` ou o preset correspondente que atualmente reúne os casos de Provider.

No MacBook Pro, construir e executar sempre a partir do diretório padrão do repositório, sem misturar artefatos de um build inacabado de worktree, de processos Electron antigos ou de outro clone. Logs temporários e artefatos usam os diretórios já existentes do framework de testes, sem criar um segundo conjunto permanente de configuração de ambiente.

## 6. Disciplina de correção

- E2E não escreve diretamente Effective Provider Config, Registry Snapshot nem marcadores de executável;
- não se mascaram corridas desconhecidas alongando sleeps arbitrários; o polling de Personal Config usa apenas o helper unificado de 2 segundos, elevado uniformemente para 3 segundos se necessário;
- não se transforma provider de conta em Personal API-key Provider;
- não se restaura migração antiga não publicada por causa dos testes;
- não se infere capacidade de runtime a partir de hardcode de `providerId`/`modelId`;
- não se enfraquecem as asserções de negócio originais de terminal, interaction card, roteamento de requisição, identidade de restauração, reasoning, quota etc.;
- ao corrigir bugs de produção, manter os comentários de causa raiz em chinês e o teste de regressão correspondente;
- após cada grupo, revisar o diff e confirmar que nenhuma linha de base de CI/workspace sem relação foi mexida por conveniência.

## 7. Registro dos resultados

Acrescentar a este Todo uma matriz de execução, registrando por caso no mínimo:

| Caso | Ambiente | Primeiro resultado | Classificação da causa raiz | Modificação | Comando final | Resultado final | artifact |
| ---- | ---- | -------- | -------- | ---- | -------- | -------- | -------- |

Os estados permitidos são:

- `passed`: passou de fato na execução WDIO/Docker;
- `failed-product`: comportamento de produção confirmado como errado;
- `failed-fixture`: drift de entrada/asserção de teste;
- `blocked-environment`: ambiente não sobe ou falta dependência;
- `not-run`: ainda não executado;
- `deleted-by-decision`: removido por uma decisão de produto já explícita.

## 8. Portão de conclusão

- Todos os Provider E2E mantidos pelo Todo 52 têm resultado WDIO real, e não apenas validação estática prévia;
- A sincronização em nível de Environment do Todo 56 tem pelo menos um E2E formal de ciclo de vida remoto; as demais combinações são cobertas por testes unitários/de integração;
- O comportamento formal de Family continua testado e a compatibilidade antiga mode/selectedKey permanece zerada;
- Todo bug de produção tem evidência de falha antes e sucesso depois;
- `typecheck:e2e`, o typecheck da raiz, o lint, a suíte unitária completa e o preset de container relacionado passam;
- Bloqueios de ambiente são registrados separadamente e uma execução não realizada nunca pode ser escrita como aprovada;
- Atualizar o case catalog, a coverage matrix, o status de implementação do Todo 52/56 e a matriz final de verificação;
- Por fim, submeter um Conventional Commit; se as correções de produção e a migração apenas de testes divergirem muito, o commit pode ser dividido por limites revisáveis, mas não é obrigatório criar abstrações extras só para permitir rollback.

## 9. Resultado da implementação em 2026-09-01

Este ciclo não manteve o fixture antigo de Provider Registry, e sim corrigiu as entradas reais e a cadeia real de execução:

- O Draft Model Selection agora é resolvido por “seleção recent válida → primeiro modelo do Account Provider atual → preferred do Host”; quando o Account Registry publica com atraso, a revisão da Selection View faz o Draft de pré-aquecimento sem intenção explícita de modelo se reidratar, evitando que um fato do DeepSeek que chegou cedo fique congelado para sempre;
- Os casos representativos de Provider Template usam duas instâncias de Template do DeepSeek, validando isolamento de identidade entre instâncias, Personal Model Rule esparsa, restauração de padrões e os campos reais de requisição do OpenAI Chat Completions;
- O fixture de OpenAI Chat Completions foi corrigido do antigo `max_tokens` para o `max_completion_tokens` produzido pelo Option Map formal; o fixture do Anthropic continua usando `max_tokens`;
- Casos de Coding Plan, Upgrade WebView, Subagent, restauração a frio, orçamento de saída, Restart, Turbo e Bot mantêm as asserções de negócio originais;
- Os três casos de migração de selected-key que já perderam seu objeto de produto continuam removidos conforme a decisão existente, sem restaurar a compatibilidade antiga de Family mode/selectedKey;
- SSH-P0-TASK-01 recebeu uma prova formal de Remote Environment: o primeiro Workspace gera um registro de estado de Provisioning e o segundo Workspace do mesmo SSH Environment não gera mais um segundo registro de sincronização inicial.

### 9.1 Evidência de execução real em macOS com Electron/WDIO

| Escopo                                    |  Resultado | Artifact / status                                                                                        |
| --------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------ |
| Bot automation / Feishu lifecycle       |   5/5 | `desktop-e2e-20260901-123836-685`                                                                      |
| Coding Plan Team / quota reset          | 18/18 | `desktop-e2e-20260901-134307-916`                                                                      |
| Upgrade WebView refresh                 |   2/2 | `desktop-e2e-20260901-140456-210`                                                                      |
| Built-in Subagent model selection       |   1/1 | `desktop-e2e-20260901-132851-878`                                                                      |
| Context Window cold resume              |   1/1 | `desktop-e2e-20260901-134040-202`                                                                      |
| Model output token budget               |   1/1 | `desktop-e2e-20260901-134123-921`                                                                      |
| Provider settings transition            |   3/3 | `desktop-e2e-20260901-134207-163`                                                                      |
| Provider restart recovery               |   4/4 | `desktop-e2e-20260901-133355-002`                                                                      |
| Turbo recovery                          |   3/3 | `desktop-e2e-20260901-133648-823`                                                                      |
| Turbo switch                            |   3/3 | `desktop-e2e-20260901-133743-135`                                                                      |
| Output-token preflight                  |   1/1 | `desktop-e2e-20260901-134931-393`                                                                      |
| Output-token preflight smoke            |   2/2 | `desktop-e2e-20260901-135009-362`                                                                      |
| Provider Template add/edit/restore/send |   1/1 | `desktop-e2e-20260901-140409-625`                                                                      |
| selected-key migration                  |     — | `deleted-by-decision`                                                                                  |
| SSH Remote Environment Provisioning     |     — | `blocked-environment`：o MacBook Pro não tinha `ZCODE_E2E_SSH_HOST/USERNAME/PASSWORD` configurados; a verificação estática não foi registrada como aprovação |

Todas as execuções acima foram feitas em um clone runtime limpo e separado no MacBook Pro, com o mesmo commit e a cadeia padrão `mise`/WDIO, sem reaproveitar artefatos antigos de Electron do workspace.

### 9.2 Portões do repositório

- Testes unitários direcionados de Provider/Provisioning/Selection: 8 arquivos, 64 casos aprovados;
- As 9 verificações de Conversation Fixture afetadas passaram todas;
- `pnpm --filter @zcode/desktop typecheck:e2e` passou;
- `pnpm typecheck` passou;
- `pnpm lint` passou, mantendo apenas os warnings já existentes no repositório;
- `pnpm test:unit`: 1501 Test Files e 12797 Tests aprovados, com 1 arquivo e 25 testes pulados conforme a configuração já existente;
- A verificação de formatação dos arquivos alterados e `git diff --check` passaram;
- O `pnpm fmt:check` de todo o repositório continua bloqueado pela sintaxe HTML já existente nos exemplos de documentação do Electron e por um problema de leitura em `apps/zcode-cli/tests/gb2312.js`;
- Na auditoria de cobertura de Conversation, o manifest/fixture de OTB deste ciclo voltou a ficar consistente; as falhas restantes são apenas a ordem/textos do ledger de Hooks Lifecycle, independente, e três documentos gerados já desatualizados;
- Nem a máquina local nem o MacBook Pro tinham CLI do Docker disponível, portanto o preset de container de Conversation foi registrado como `blocked-environment`, e não como aprovação.

### 9.3 Correção de rumo posterior no Todo 59

A regra “recent → primeiro item do Account Provider atual → preferred do Host” adicionada na implementação deste Todo registra apenas um fato histórico de execução e já foi substituída pelo Todo 59. A única regra atual é: um Recent válido tem prioridade; quando Recent está ausente ou inválido, usa-se diretamente o `preferredSelection` do Host alvo. O Renderer não entende mais a prioridade de modelo padrão do Account Provider, e as options de reasoning são resolvidas de forma unificada pelo Host e transportadas por completo.
