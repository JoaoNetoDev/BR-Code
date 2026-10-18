# Todo 52: Fechamento Unificado da Regressão E2E de Provider

> Estado atual (2026-09-09): este Todo de verificação foi encerrado; os itens restantes são responsiveness de forma única por [Todo102](todo-102-verification-debt-closeout.md), sem agendamento próprio. O status e as falhas abaixo são registro histórico; o encerramento não significa que as falhas originais tenham passado.

> Status: concluído
>
> Data: 2026-08-31
>
> Fonte das evidências: [`../research/e2e-regression-analysis-2026-08-31.md`](../research/e2e-regression-analysis-2026-08-31.md)

## 1. Objetivo

Os 37 E2E de Desktop quebrados pelo provider refactor não são 37 problemas de produto independentes. Este Todo trata de forma unificada o drift da infraestrutura de testes, os comportamentos de produto obsoletos e as poucas fronteiras aguardando decisão, sem novos consertos caso a caso.

Esta rodada chegou a se basear na hipótese de um futuro achatamento de Provider e removeu antecipadamente parte da cobertura de comportamento de Family que ainda pertence ao produto atual. A decisão posterior explicou explicitamente que Z.ai / BigModel Family, a Connection Selection estruturada e a troca de conexão dentro do Family continuam mantidas, portanto a fronteira final deste Todo foi corrigida para:

```text
comportamento atual de Family / Connection Selection
                └── restaurar a cobertura conforme a seleção estruturada atual

comportamento de compatibilidade não publicado de mode / selectedKey antigo
                └── continuar removido, sem restaurar compatibilidade

comportamento de conta, modelo, requisição e recuperação
                └── corrigir conforme a identidade de Provider independente
```

Restaurar os Cases de Family não adiciona camada de compatibilidade nem traduz o `mode/selectedKey` antigo para outra estrutura de transição. Todos os Cases usam diretamente o `providerFamilyConnectionSelections` vigente, os mocks oficiais de conta e o Resolver atual.

## 2. Causas Raiz Comuns Confirmadas

| Causa raiz                                              | Escopo de impacto                            | Direção de tratamento                                                                                              |
| ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cenários de Account disfarçados de Personal API-key Provider | CTP, QR, CPUW, Restart, Transition, Turbo   | Preparar apenas API de conta, Credential e fatos de produto, deixando o Resolver oficial gerar o Account Provider oficial |
| Testes ainda escrevendo o Family mode/selectedKey antigo | Migration                                    | Remover a compatibilidade do formato antigo, sem restaurar                                                       |
| Falta de cobertura da connection selection atual do Family | CTP, Restart, Transition, Off-Peak        | Usar o `providerFamilyConnectionSelections` estruturado para restaurar a prova do comportamento oficial           |
| CW/OTB/I08 aguardando logs de push do Workspace Registry já removidos | CW, OTB, I08                    | O cold start é provado por requisições reais; o hot update de Personal espera uniformemente 2 segundos          |
| Harness do Bot devolvendo Model Selection View vazio     | 4 E2E de Bot                                 | Compartilhar uma fixture mínima de Selection não vazia                                                          |
| E2E de Subagent ainda lendo/escrevendo os dois maps antigos | I20 e E2E de Settings adjacentes          | Remover o reader de compatibilidade e unificar a seleção estruturada atual                                       |
| Helper de Upgrade WebView tratando a origin da página visível como plano de controle do mock | CPUW-01/03         | Usar uma mock control URL explícita e observar o resultado oficial da atualização da conta                        |

## 3. Cadeia de Entrada E2E Oficial

```text
Entradas do cenário E2E
├─ Built-in Config (arquivos reais)
├─ Personal Provider Overlay (somente configuração do usuário)
├─ Account API / Credential Mock (fatos de conta e plano)
└─ Persisted Model Selection (somente cases de cold start)
                |
                v
        Resolver / Registry oficial
                |
                v
         Model Selection View
                |
                v
       operações de UI / requisição oficial de modelo
                |
                v
    asserções de requisição, recuperação, cartões e estado de produto
```

É proibido que o E2E construa diretamente Effective Provider, Registry Snapshot, Account Personal API Key ou estado executável exclusivo de teste.

## 4. Infraestrutura de testes comum

### 4.1 Fixture de Personal Provider

Esta rodada reutiliza e estreita o `seedPersonalProviderConfig(...)`, o `seedReplayProvider(...)` e o `createAndConfigurePersonalProvider(...)` existentes, cujas responsabilidades são:

- criar um Personal Provider;
- escrever um Personal Overlay para Built-in Providers comuns;
- salvar API Key, Endpoint, Schema, membros/ordem/regras de Personal models;
- reutilizar o Repositório/codec de Personal Config existente, sem duplicar o formato de arquivo.

Os Cases corrigidos oficialmente não os usam mais para falsificar Account Providers. Casos históricos ainda em manual-review pending e não promovidos não constituem cobertura oficial desta rodada; eles serão migrados separadamente quando o comportamento de produto correspondente for promovido ou o Family for achatado, e não podem servir de justificativa para restaurar compatibilidade antiga.

### 4.2 Fixture de cenário de Account

Esta rodada não criou um `seedAccountScenario(...)` agregador. O mock de Coding Plan já existente é o orquestrador de cenário de conta a montante, continua sendo fornecido por `coding-plan-mock-env.ts`, `wdio.conf.ts` e o Credential Store de testes, em vez de injeção de Account Config.

Responsabilidades:

- controlar os mocks existentes de conta, plano, quota, activity, reset opportunity etc.;
- escrever o Credential Store oficial de testes;
- fornecer os allowed models do Start Plan, o entitlement Individual/Team e as informações necessárias de organização/projeto;
- deixar o Account Resolver oficial gerar múltiplos Account Providers.

Ele não escreve Family Selection, não escreve Account Provider no Personal Config e não controla o Registry diretamente.

### 4.3 `seedPersistedModelSelection(...)`

Usado apenas em cases de cold start e recuperação após restart, salvando atomicamente:

```ts
{
  providerId,
  modelId,
  options: { reasoningLevel },
}
```

Retira o `seedLastSelectedModel()` / `seedLastSelectedThoughtLevel()` separados, evitando que os testes criem uma seleção rasgada.

### 4.4 `waitForSelectableModel(...)`

Espera, pela Selection View oficial, que `providerId/modelId` fique selecionável. Não consulta nem injeta estados intermediários do Registry e não substitui o fato executável por cartões de Settings.

### 4.5 `waitForProviderConfigPolling()`

Quando o Personal Config é consumido por um Agent já em execução, é admitida uma diferença de tempo:

```ts
const PROVIDER_CONFIG_POLLING_SETTLE_MS = 2_000;
```

- o polling de produção atual é de cerca de 1 segundo, e o E2E uniformemente deixa 2 segundos de folga de agendamento;
- se o CI comprovar empiricamente que 2 segundos ainda falham ocasionalmente, só aqui pode-se subir uniformemente para 3 segundos;
- usado apenas para hot update de Personal Config;
- não usado em cold start, refresh explícito de Account e fluxos que já possuem um sinal oficial de conclusão;
- o fim da espera não é condição de aprovação; a prova final continua vindo de requisições reais, seleção de modelo ou asserções de produto.

### 4.6 Fixture mínima de Selection do Bot

O harness de serviço do Bot e o harness independente de streaming-card compartilham uma única Model Selection View mínima, não vazia e válida. Ela serve apenas para levar o Bot à execução oficial de modelo, sem introduzir um ambiente completo de Account e sem alterar as asserções de cartão/terminal.

## 5. Remoção da Compatibilidade Não Publicada do Subagent

Em 25 de agosto, ao mesclar:

```text
builtInModelOverrides
builtInThoughtLevelOverrides
```

em:

```text
builtInModelSelectionOverrides
```

o reader antigo de `agents-state.json` foi mantido. Como esse formato nunca foi publicado, esta rodada não assume a migração de compatibilidade:

1. `readAgentStateFile()` lê apenas `builtInModelSelectionOverrides`;
2. `normalizeBuiltInSelectionOverrides()` remove os parâmetros legados de model/thought, encolhendo para o parser da estrutura atual quando necessário;
3. os testes unitários do reader legado são removidos;
4. I20, o E2E de Subagent de Settings e as fixtures de `wdio.conf.ts` escrevem e afirmam apenas a estrutura atual;
5. `rg` prova que os dois maps antigos zeraram no código oficial, nos testes unitários e no E2E.

O próprio I20 é mantido: ele continua provando que, depois que Settings salva a seleção, um child request de cold start usa a Selection completa de Provider/Model/Reasoning.

## 6. Matriz de Disposição dos Cases

### 6.1 Continuar removendo: 3 Cases de compatibilidade de formato antigo

Esses Cases só validam a migração de armazenamento do `mode/selectedKey` não publicado e não pertencem ao comportamento de produto atual do Family. Não é permitido restaurar a compatibilidade do formato antigo para recuperar o Family.

| Número original | Case       | Motivo da remoção                     |
| --------------: | ---------- | ------------------------------------- |
|              27 | I32/MP-M01 | Migração de mode/selectedKey antigo    |
|              28 | I33/MP-M02 | Migração de selectedKey do Team Plan   |
|              29 | I34/MP-M03 | Correção de selectedKey sem organization |

Pode-se remover o arquivo inteiro:

- `conversation-session-model-provider-selected-key-migration.test.ts`;
  a troca de configurações de Family, a recuperação da conexão atual e o rollback continuam sendo comportamento oficial de produto e precisam ser restaurados usando a seleção estruturada atual ou por cobertura equivalente.

### 6.2 Corrigir explicitamente: 24 Cases

| Número original | Grupo de Cases                          | Tratamento explícito                                                                                                                                                        |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-4            | Bot                                     | Usar a fixture mínima de Selection compartilhada, preservando as asserções originais de cartão, terminal e AskUserQuestion                                                 |
| 5-17           | CTP/QR                                  | Usar o cenário oficial de Account; restaurar o menu de conexão do Family, a troca pessoal/equipe e a recuperação de OAuth, preservando as asserções de activity, quota, Context, reset opportunity e lembrete do Composer |
| 20             | I20 Subagent                            | Remover a compatibilidade dos dois maps antigos, passar para seleção estruturada e preservar o child request de cold start                                                |
| 21             | CW01-CW04                               | Remover o parser de logs antigo do Registry; após a inicialização, provar por limites, Compact e requisições de recuperação a frio                                          |
| 22             | OTB                                     | Remover a comparação de logs de revision; após o hot update de Personal esperar uniformemente 2 segundos, preservando as asserções de orçamento/requisição                  |
| 23             | I08                                     | Remover a barreira antiga de revision; após o modelo aparecer esperar 2 segundos e afirmar a identidade do Provider do primeiro envio                                          |
| 24             | I26/MP-R02                              | Usar o Account Provider oficial e a seleção persistida atômica, preservando a recuperação de modelo não inicial                                                          |
| 25-26          | I27/MP-R03、I28/MP-R04                 | Usar a seleção estruturada de Family para restaurar a semântica atual de rollback de conexão                                                                              |
| 30-32          | I29/MP-S01、I30/MP-S02、I31/MP-S03     | Usar a seleção estruturada de Family para restaurar a troca de conexão, a preservação de rascunho e a reconciliação de Plan                                                    |
| 33-37          | Turbo                                   | Usar o Account Provider oficial e a seleção atômica, preservando reasoning de dois estados, a troca, o response atrasado e as asserções de requisição                             |

IDs de modelo podem aparecer nos testes como fatos reais de fixture de Built-in Config; o código de produção não pode restaurar branches por ID de modelo concreto.

### 6.3 Já corrigidos: 2 Cases de Upgrade WebView

CPUW-01/CPUW-03 são mantidos, e o comportamento visível ao usuário após a compra é fechado em:

```text
compra concluída
    |
    v
fechar o WebView + atualizar os dados da Account
    |
    +--> atualizar o Provider da conta atual
    +--> no cenário Z.ai, atualizar também os produtos do Team Plan
    `--> não ler mais nem afirmar o estado antigo da Personal API Key / enabled do Account Provider
```

Correções técnicas correspondentes:

- o mock control plane usa o `ZCODE_CODING_PLAN_UPGRADE_MOCK_BASE_URL` explícito;
- não buscar a API Key do Account Provider no Personal Config;
- não afirmar o `enabled` antigo, a seleção atual do Family nem a credential privada;
- usar a requisição de atualização como o resultado oficial do evento de conclusão do WebView; mudanças na seleção de modelo não são definidas pelo teste do popup de compra.

## 7. Ordem de Implementação

1. atualizar o catálogo de cases de E2E e a coverage matrix, removendo formalmente os 11 comportamentos obsoletos;
2. adicionar uma barreira unificada de polling de Personal Config e a fixture mínima de Selection do Bot;
3. remover o reader dos dois maps não publicados do Subagent e migrar os testes adjacentes de Settings, Runtime e CLI bootstrap;
4. corrigir os 4 Cases de Bot e os cenários mantidos de CTP/QR;
5. corrigir CW, OTB, I08, I26, Turbo Recovery e Turbo Switch;
6. corrigir os 2 Cases de Upgrade WebView;
7. recuperar o Case pendente de Off-Peak Team Plan, passando a usar a Family Selection estruturada atual;
8. limpar os resíduos de unit contract de mocks/fixtures de catálogo já removidos;
9. rodar os E2E de Desktop oficiais grupo a grupo em máquina real macOS e então rodar o typecheck da raiz, o lint, os unit e a auditoria de cobertura.

## 8. Testes e Aceitação

### 8.1 Limpeza mecânica

`rg` prova que o seguinte zerou no código oficial e nos E2E relacionados:

- `modelProviderFamilyModes`;
- `modelProviderFamilySelectedKeys`;
- as dependências de compatibilidade antigas de `modelProviderFamilyModes` / `modelProviderFamilySelectedKeys`; o `providerFamilyConnectionSelections` atual é estado oficial de produto e precisa ser mantido;
- `builtInModelOverrides`;
- `builtInThoughtLevelOverrides`;
- `seedReplayProvider(account:*)` nos Cases oficiais promovidos/corrigidos nesta rodada;
- `workspace_update_provider_registry.completed`;
- fixture de Personal API Key de Account Provider.

### 8.2 Aceitação de comportamento

- E2E de Account prepara apenas fatos de conta a montante, com o Resolver oficial gerando o Account Provider;
- o harness do Bot consegue entrar na execução real de modelo, com as asserções originais de ciclo de vida da interação restauradas;
- o Subagent persiste apenas a seleção estruturada completa;
- o hot update de Personal compartilha um único helper de settle de 2 segundos;
- o cold start e o refresh de Account não dependem de sleep fixo;
- os Cases mantidos precisam executar as asserções de negócio originais, e não apenas afirmar que a fixture foi preparada com sucesso;
- os Cases removidos saem também do catálogo, da coverage matrix, do preset do Docker e do manifesto de fixtures.

### 8.3 Comandos de verificação

- fixture check dos cases afetados;
- E2E de Desktop nativos e o replay local de case necessário;
- `pnpm audit:conversation-session-coverage` depois de remover/modificar Cases formais;
- `pnpm --filter @zcode/desktop typecheck:e2e`;
- `pnpm typecheck`;
- `pnpm lint`;
- verificação de formatação dos arquivos desta rodada e `git diff --check`.

## 9. Resultado Final

- o Todo 53 foi mesclado neste Todo e não existe um segundo plano de polling de Registry;
- 11 E2E com falha que perderam o objeto de produto foram removidos, além de mais 1 Case pendente de Off-Peak Team Plan da mesma natureza;
- 24 E2E válidos passaram a usar a cadeia de entrada oficial e recuperaram as asserções de negócio originais;
- 2 E2E de Upgrade foram fechados em «fechar o WebView + atualizar oficialmente os dados da conta»;
- os helpers de E2E não duplicaram Effective Provider/Registry Snapshot e não acrescentaram compatibilidade de Family Selection;
- o reader dos dois maps não publicados do Subagent e as entradas de teste correspondentes zeraram;
- os Cases de Turbo distinguem explicitamente a intenção do próximo envio no Composer da persistência do recent selection após o envio aceito;
- os resíduos de testes unitários de fixture/mock de catálogo removidos, expostos pela execução completa de unit, foram limpos em conjunto.

## 10. Evidências de Verificação

> 2026-09-01: o Todo 57 reexecutou em um MacBook Pro real os Cases de Provider mantidos por este Todo e corrigiu as derivas de Account Draft Selection, Provider Template Fixture e OpenAI `max_completion_tokens` expostas pelos Todo 55/56. Os artifacts de Case mais recentes e os blockers de ambiente valem o que está na seção 9 do Todo 57; os resultados de 2026-08-31 abaixo são preservados como o registro do primeiro fechamento.

E2E de Desktop nativos no macOS:

| Escopo                             |  Resultado | Artifact                          |
| ---------------------------------- | ---------: | --------------------------------- |
| Bot automation / Feishu lifecycle  |        5/5 | Execução em grupo aprovada        |
| Coding Plan Team / quota reset     |       15/15 | `desktop-e2e-20260831-171119-096` |
| Built-in Subagent model selection  |        1/1 | `desktop-e2e-20260831-173054-696` |
| Provider restart recovery          |        2/2 | `desktop-e2e-20260831-174125-075` |
| Turbo recovery                     |        3/3 | `desktop-e2e-20260831-175604-388` |
| Turbo switch                       |        3/3 | `desktop-e2e-20260831-180819-116` |
| Upgrade WebView refresh            |        2/2 | `desktop-e2e-20260831-180913-613` |
| Custom Provider add/send           |        1/1 | `desktop-e2e-20260831-152917-333` |

Verificação do repositório:

- `pnpm typecheck`: aprovado;
- `pnpm lint`: aprovado, apenas os warnings já existentes do repositório;
- `pnpm --filter @zcode/desktop typecheck:e2e`: aprovado;
- `oxfmt` nos arquivos modificados: aprovado; o `pnpm fmt:check` do repositório inteiro é bloqueado pela sintaxe HTML já existente em exemplos de documentação do Electron e por problema de leitura de `gb2312.js`;
- `pnpm audit:conversation-session-coverage`: os docs gerados, o manifesto e as fixtures desta rodada estão consistentes; continua bloqueado pelo problema independente de baseline de ordem/metadata do request ledger de `conversation-session-hooks-lifecycle`;
- `pnpm test:unit`: a primeira reexecução encontrou e limpou 8 resíduos de contract de mocks/fixture/catálogo antigos; no fim passaram 1492 Test Files e 12745 Tests, com 1 arquivo e 25 testes pulados conforme a configuração já existente do repositório.