# Análise de regressão E2E do Refactor de Provider (2026-08-31)

## 1. Resumo das conclusões

No diretório padrão do repositório em um MacBook Pro, no commit `21c38683e1` do branch atual, os 37 Cases da lista de problemas foram reproduzidos de forma estável:

- não há flaky;
- não há falha de Electron, WebDriver, build ou de ambiente de máquina;
- as 37 falhas de superfície podem ser agrupadas em 7 classes de causa raiz comuns;
- as evidências atuais não provam que os 37 comportamentos de produto realmente regrediram. A grande maioria dos Cases foi bloqueada por fixtures E2E obsoletas, campos de persistência antigos já removidos ou uma forma incorreta de injeção de Account Config antes mesmo de alcançar o comportamento de negócio que realmente precisam provar;
- esses testes não podem simplesmente ser removidos. Exceto por 3 Cases que verificam explicitamente a “migração de formato antigo nunca lançado”, os demais objetivos de negócio ainda têm valor e precisam ser migrados para o contrato atual de Provider/Account/Registry e reexecutados, para só então determinar se ainda existe algum Bug real de produto.

A cadeia de fatos oficial atual é:

```text
ZCode Built-in Provider Config
              |
              v
Account Overlay
├─ access.entitled
├─ 当前账号 Provider 可用性
└─ Start Plan 动态模型成员（如有）
              |
              v
Personal Overlay
├─ 用户 API Key / 自定义 Provider
├─ 用户模型成员
└─ Personal Model Config Rules
              |
              v
Effective Provider / Model Config
              |
              v
Process-owned Provider Registry
              |
              v
Model Selection / Active Model
```

A cadeia antiga, ainda usada repetidamente nos testes que falham, é:

```text
legacy family mode / selectedKey
              +
把 Account Provider 当 Personal API-Key Provider 写盘
              +
等待 workspace_update_provider_registry.completed
              |
              v
旧测试认为 Provider 已可用
```

Essa cadeia antiga não existe mais, e por isso surgiram muitas falhas em cascata do tipo “a página não tem Coding Plan”, “houve fallback para DeepSeek” e “a revision do Registry não foi aplicada”.

## 2. Baseline de reprodução e artefatos

### 2.1 Baseline

- Workspace Samantha: worktree independente
- Repositório padrão do MacBook Pro: `/Users/dev/Desktop/projects/Z.AI/z-code`
- Commit nos dois lados: `21c38683e1 test(ui): remove stale built-in model label assertion`
- O MacBook Pro usou o resultado de bootstrap/build padrão já existente; na execução foram definidos `ZCODE_E2E_SKIP_BUILD=1` e `ZCODE_E2E_SKIP_AGENT_BUILD=1`, sem modificar configuração de sistema.

### 2.2 Quatro rodadas nativas de Desktop E2E

| Rodada | Escopo                                                          | Resultado                                  | Artefato                      |
| ------ | --------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| A      | 4 Cases de alvo de Bot + 1 Case de controle do mesmo spec      | 1 pass / 4 fail                           | `desktop-e2e-20260831-093430-761` |
| B      | Coding Plan, Quota Reset, Upgrade Webview                      | 1 pass / 19 fail; as 15 da lista falharam todas | `desktop-e2e-20260831-093509-202` |
| C      | I20, CW, OTB, I08                                              | 0 pass / 4 fail                           | `desktop-e2e-20260831-095111-677` |
| D      | Restart, Selected-key migration, Settings transition, Turbo   | 1 pass / 15 fail; as 14 da lista falharam todas | `desktop-e2e-20260831-095400-329` |

Diretório raiz dos artefatos:

```text
/Users/dev/Desktop/projects/Z.AI/z-code/packages/desktop/.e2e-artifacts/
```

Os quatro relatórios mostram `0 flaky` e `0 infra failure`.

## 3. Sete classes de causa raiz comuns

### R1. O Harness sintético do Bot não fornece a preferred selection do Host de destino

Atualmente o primeiro envio do Bot precisa fixar o modelo do Host de destino na fronteira de Submission: sem seleção explícita, ele lê `ModelSelectionView.preferredSelection`, e se não conseguir resolver rejeita a criação da task. A fronteira de produção está em `packages/services/src/bots/botsService.ts`.

Mas os dois Harnesses E2E de Bot ainda devolvem uma View vazia:

```ts
getView: async () => ({ revision: 0, providers: [] });
```

Localizações:

- `packages/desktop/test/e2e/bots/helpers/bots-service-harness.ts`
- `packages/desktop/test/e2e/bots/feishu-streaming-card-lifecycle.test.ts`

Por isso o processamento da mensagem lança “Bot não consegue resolver o modelo de Submission a partir do Host de destino” antes de criar a Task e estabelecer a assinatura. Naturalmente, os eventos terminais, os cards de AskUserQuestion e o ciclo de vida do streaming card posteriores nem existem.

Julgamento: o Harness de teste está desatualizado; não se trata de quatro regressões independentes de produto no Bot.

Tratamento correto: o Harness injeta um `ModelSelectionView` mínimo mas real (com Provider, Model e preferred selection) e continua verificando o comportamento original do Bot; não se pode restaurar o fallback antigo nem contornar o Model Selection oficial.

### R2. O E2E de Coding Plan ainda trata o antigo family mode / selectedKey como autoridade

O preparo de cenário de `coding-plan-team-usage.test.ts` ainda grava:

```ts
modelProviderFamilyModes;
modelProviderFamilySelectedKeys;
```

Os únicos campos oficiais atuais são:

```ts
providerFamilyConnectionSelections;
```

cuja união estruturada está definida em `packages/shared/src/provider-family-connection-selection.ts`. Os campos antigos e sua migração foram removidos explicitamente no commit `8c55290f1f refactor(provider): finish model abstraction cleanup`; a razão é que ainda não tinham sido publicados e por isso não carregam migração de compatibilidade.

A análise estrita das App Settings descarta os campos antigos. O teste em seguida ainda afirma o Team Plan identity com os campos antigos, o que produz:

- o modo de conexão não tem Coding Plan pessoal / de Team;
- a página de Usage não tem a tab Coding Plan;
- o trigger de context usage e o lembrete de quota não aparecem;
- após a recuperação do OAuth, “selectedKey foi sobrescrito”;
- I29/I30 na verdade já gravaram a nova selection estruturada, mas o teste ainda afirma o antigo `mode=oauth`, reportando falha indevidamente.

Julgamento: são falhas em cascata causadas pelo mesmo conjunto de fixtures de configurações antigas.

Tratamento correto: tanto a entrada de cenário quanto as afirmações usam apenas `providerFamilyConnectionSelections`; o Team Plan afirma diretamente o `productId/organizationId/projectId` completo e não gera nem verifica mais a selectedKey em string.

### R3. O E2E trata o Account Provider como um Personal API-Key Provider

A fronteira de responsabilidade atual do Account Provider é:

```text
Built-in：声明 Provider 静态身份、API、模型成员
Account Overlay：声明 access.entitled、账号动态成员/访问事实
Personal Overlay：不拥有 Account access，也不能用 enabled 伪装 entitlement
```

O Resolver só considera o Provider executável quando `access.type !== zhipu-account` ou `access.entitled === true`.

Os testes que falham ainda usam a forma antiga de injeção:

- `coding-plan-team-usage.test.ts` grava Personal `apiKey`, `enabled`, Endpoint e modelos para `account:bigmodel-individual-coding-plan`;
- os helpers de Restart/Turbo usam `seedReplayProvider()` para gravar um Personal Provider em `account:*`, sem estabelecer entitlement de Account Overlay;
- o teste de Upgrade Webview lê o Personal Config por `readModelProvider()` e espera ver `apiKey` e `enabled` em um Account Provider.

O resultado é um de dois:

1. o Account Provider não é executável por `entitled !== true` e a Selection recai legitimamente para DeepSeek;
2. o teste está lendo a Personal Source e, naturalmente, não vê a Key dinâmica nem o entitlement que pertencem à cadeia Account/de credenciais.

Julgamento: são fixtures erradas e pontos de observação errados depois que o teste atravessou a estratificação de configurações; não devem ser corrigidos afrouxando o Schema de produção.

Tratamento correto:

- os Cases de Account fornecem `entitled=true` e os membros de modelo correspondentes na fronteira da Account Source/mock da API de conta;
- credenciais de OAuth/negócio continuam vindo da fixture de credenciais;
- o Personal Config mantém apenas o Personal Model Overlay realmente permitido;
- ao testar a disponibilidade do Provider, o teste lê a Effective Settings/Selection View ou o resultado oficial da requisição, em vez de ler o arquivo Personal para adivinhar o estado de Account.

### R4. I20 já grava a nova estrutura agents-state, mas o E2E ainda lê os campos antigos

Atualmente o Subagent Service ainda pode ler como entrada de compatibilidade:

```text
builtInModelOverrides
builtInThoughtLevelOverrides
```

mas ao salvar grava uniformemente:

```text
builtInModelSelectionOverrides[agentName] = {
  providerId,
  modelId,
  options: { reasoningLevel }
}
```

Após escolher `high`, o I20 continua fazendo polling do `builtInThoughtLevelOverrides.Explore` no JSON original e por isso reporta “não foi gravado”. Isso não prova que a gravação falhou; prova apenas que, depois da gravação, o arquivo não mantém mais a estrutura antiga de dois maps.

Julgamento: a afirmação de observação está obsoleta. Esse Case ainda nem executou até a afirmação central realmente sobre a child request de cold start.

Tratamento correto: o E2E lê e afirma `builtInModelSelectionOverrides`; se for preciso verificar a compatibilidade de entrada de arquivo antigo, deve haver um teste unitário separado de importer/reader, sem exigir que um E2E normal continue gravando o formato antigo.

### R5. CW / OTB / I08 esperam um log de push de Registry do workspace que já foi removido

Os três testes tratam o log abaixo como barreira de readiness:

```text
zcode_protocol.workspace_update_provider_registry.completed
```

O código de produção atual já não tem esse evento, e no repositório restam apenas esses três E2E procurando por ele. Depois do refactor de Provider, o Registry é um runtime process-owned e o evento de inicialização é:

```text
zcode_protocol.provider_registry.ready
```

As atualizações do Personal Config também passaram a ser tratadas pela Runtime/Registry source oficial, sem mais enviar um snapshot de Registry para cada workspace.

Por isso os três testes dão timeout na polling do log antigo e ainda nem verificam context window, output token budget ou a primeira requisição com o novo Provider.

Julgamento: a barreira de sincronização do teste está obsoleta; isso não significa que a atualização do Registry realmente não foi aplicada.

Tratamento correto: remover o helper de parsing de log do push de Registry do workspace e usar como condição observável de conclusão o Registry ready/Selection View oficial atual ou a captura da requisição final. Não se pode restaurar, por causa do E2E, o protocolo de Registry de workspace que já foi removido.

### R6. I32-I34 verificavam especificamente uma migração não publicada cuja remoção já foi decidida

O título e a implementação desses três Cases exigem que a inicialização corrija:

```text
modelProviderFamilyModes + modelProviderFamilySelectedKeys
                         -> 新 selectedKey
```

Mas o design atual não tem mais um “novo selectedKey”; o alvo é o `providerFamilyConnectionSelections` estruturado. E a migração antiga já foi removida pela decisão de “não publicado, sem leitura de compatibilidade”.

Julgamento: o objetivo desses 3 Cases ficou inválido e o código de produção não deve ser corrigido para fazê-los passar de novo.

Tratamento correto: remover esses três Cases de migração antiga. Se ainda for necessária cobertura de restauração na inicialização, substituí-los por “após o round-trip de um selection JSON estruturado, a identity permanece inalterada”, sem testar a correção de strings antigas.

### R7. A suposição do mock de Webview do CPUW-03 também está obsoleta

`triggerCodingPlanWebviewPurchaseComplete()` lê primeiro a origem visível do Webview e depois usa essa origem como se fosse o mock server local de upgrade para “marcar a compra como concluída”. A URL real do Webview atual é o Endpoint oficial do ZCode:

```text
https://zcode.z.ai/coding-plan...
```

Ela não é um mock server local e, por isso, o CPUW-03 falha antes mesmo de disparar o bridge. Esse Case também continua lendo o `enabled` do Personal Provider depois da compra, o que é a mesma questão de R3.

Julgamento: o ponto de falha atual é a fiação do mock E2E de Webview e a afirmação de estado de Account desatualizadas; ainda não se prova que o bridge de conclusão de compra ou a lógica de refresh falham.

Tratamento correto: o endereço do plano de controle do mock precisa vir do mock de upgrade iniciado pelo WDIO, e não ser deduzido da origem visível do Webview; as páginas/navegação do Webview podem continuar usando fixtures de Endpoint confiáveis do ZCode. Depois da compra, o resultado do refresh é observado pelas Settings oficiais de Provider/entitlement de Account.

## 4. Conclusões item a item das 37 entradas

|   # | Case                            | Ponto real de falha mais precoce                         | Causa   | Julgamento e próximo passo                                          |
| --: | ------------------------------- | ------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
|   1 | BOT-E2E-CR-01                   | terminal event é false                                   | R1      | Rodar de novo a entrega terminal depois de completar o Harness com preferred selection |
|   2 | BOT-E2E-AQ-01                   | o card de AskUserQuestion não existe                     | R1      | A Task ainda não foi criada; rodar de novo a agregação de cards depois de completar o Harness |
|   3 | BOT-E2E-IL-01                   | o card de completed interaction não existe               | R1      | A Task ainda não foi criada; rodar de novo o sealing depois de completar o Harness |
|   4 | Feishu streaming card lifecycle | callback/stream/typing/terminal não foram agrupados no card | R1      | O mesmo Harness standalone está vazio; rodar de novo depois de adicionar o modelo |
|   5 | CTP-02                          | falha na afirmação das opções de modo de conexão         | R2 + R3 | Reconstruir a fixture com selection estruturada + entitlement de Account |
|   6 | CTP-04B                         | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou as afirmações de activity/detail/performance      |
|   7 | CTP-05                          | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou a exibição das combinações pessoal/equipe         |
|   8 | CTP-06                          | o selectedKey antigo não foi preservado                   | R2      | Mudar a afirmação para identity estruturada de Team; não restaurar selectedKey |
|   9 | CTP-09                          | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou o isolamento de falha de activity                 |
|  10 | CTP-10                          | o trigger de context usage não existe                    | R2 + R3 | Não há source de Coding Plan utilizável; reconstruir e só então verificar freshness |
|  11 | CTP-11                          | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou quota fatal/recovery                              |
|  12 | QR-E2E-01                       | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou a relação de autoridade opportunity/status         |
|  13 | QR-E2E-02                       | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou a exibição de oportunidades de múltiplos tipos    |
|  14 | QR-E2E-09                       | o lembrete inicial não existe                            | R2 + R3 | A source não se estabeleceu; reconstruir e só então verificar persistente/hover |
|  15 | QR-E2E-10                       | o lembrete urgente não existe                            | R2 + R3 | A source não se estabeleceu; reconstruir e só então verificar a fronteira de três minutos |
|  16 | QR-E2E-04                       | o trigger de context usage não existe                    | R2 + R3 | Ainda não alcançou o ciclo de vida de HoverCard/Dialog                |
|  17 | QR-E2E-03                       | não é possível entrar na tab Coding Plan                 | R2 + R3 | Ainda não alcançou a condição de conclusão `used_at`                  |
|  18 | CPUW-01                         | apiKey de Account ausente no Personal reader             | R3      | Rodar de novo depois de mudar para o ponto de observação oficial de credenciais/refresh de Account |
|  19 | CPUW-03                         | falha ao chamar o mock local na origem Webview oficial   | R7 + R3 | Corrigir a fiação do plano de controle do mock e remover a afirmação de Personal enabled |
|  20 | I20                             | o `builtInThoughtLevelOverrides` antigo não aparece mais  | R4      | Ler a selection estruturada; só então verificar a child request de cold start |
|  21 | CW01-CW04                       | o log de workspace registry removido nunca chega         | R5      | Trocar pela barreira oficial de readiness/request e rodar de novo limits/compact |
|  22 | OTB01-OTB03/06-07               | o log de workspace registry removido nunca chega         | R5      | Trocar a barreira e rodar de novo request/compact/runtime budget      |
|  23 | I08                             | o log de workspace registry removido nunca chega         | R5      | Trocar a barreira e rodar de novo a adição nas configurações, a seleção e o primeiro envio |
|  24 | I26/MP-R02                      | o modelo de Account não é executável e há fallback para DeepSeek | R3      | Validar a recuperação para um modelo não-padrão depois de semear entitlement na Account Source |
|  25 | I27/MP-R03                      | o modelo antigo não é executável e volta à preferredSelection do Host de destino | R3      | Semear o entitlement atual do Coding Plan e validar a seleção válida atual do Host |
|  26 | I28/MP-R04                      | a seleção Recent está indisponível e volta à preferredSelection do Host de destino | R3      | Semear o entitlement da conexão atual e validar a seleção válida atual do Host |
|  27 | I32/MP-M01                      | o selectedKey antigo não é mais migrado                   | R6      | Remover; se necessário, substituir por round-trip de structured api-key selection |
|  28 | I33/MP-M02                      | o selectedKey antigo de Team não é mais migrado           | R6      | Remover; substituir por round-trip de structured Team identity         |
|  29 | I34/MP-M03                      | a key antiga incompleta não é mais reparada              | R6      | Remover; o comportamento do Schema estrito diante de identity incompleta vira teste unitário |
|  30 | I29/MP-S01                      | a nova selection já foi gravada, mas a afirmação antiga `mode=oauth` falhou | R2      | Afirmar a structured selection e então continuar verificando o draft de DeepSeek |
|  31 | I30/MP-S02                      | a nova selection já foi gravada, mas a afirmação antiga `mode=oauth` falhou | R2      | O mesmo; não é evidência de falha da transition em si                  |
|  32 | I31/MP-S03                      | o Account Plan de destino não é executável e continua DeepSeek | R3      | Semear o entitlement e rodar de novo reconciliation/highspeed           |
|  33 | I35/MP-T01                      | os modelos do Individual Plan/Turbo não estão no conjunto selecionável | R3      | Só aparecem modelos de Team Account; corrigir a fixture de Account e rodar de novo |
|  34 | I36/MP-T02                      | os modelos do Individual Plan/Turbo não estão no conjunto selecionável | R3      | Ainda não enviou a primeira requisição de Plan                        |
|  35 | I38/MP-T04                      | o selecionado real foi o Team GLM-5.3, e não o Individual Turbo da fixture | R3      | A identity/entitlement de Account é inconsistente; a resposta tardia ainda não foi verificada |
|  36 | I39/MP-T05                      | o modelo Individual Turbo não está no conjunto selecionável | R3      | A troca atômica e o last-selected ainda não foram verificados           |
|  37 | I42/MP-T06                      | o Individual GLM-5.2 não está no conjunto selecionável de destino | R3      | O descarte de thought ainda não foi verificado                         |

## 5. Ordem sugerida de correção

### Fase 1: corrigir primeiro os fatos básicos de teste, sem tocar na semântica de produção

1. O Harness de Bot passa a fornecer o `ModelSelectionView` oficial.
2. Estabelecer uma fixture E2E de Account unificada: publicar `access.entitled` e modelos dinâmicos pela Account Source/mock da API de conta; é proibido gravar Account access no Personal Config.
3. Migrar todos os cenários de Coding Plan para `providerFamilyConnectionSelections`.
4. Fazer o E2E de Subagent ler `builtInModelSelectionOverrides`.
5. Remover os três Cases de migração de selectedKey antigos, ou convertê-los em round-trip estruturado.
6. Remover a dependência dos três E2E em `workspace_update_provider_registry.completed` e usar os pontos de observação oficiais atuais.
7. Corrigir o plano de controle do mock de Upgrade Webview e o ponto de observação de estado.

### Fase 2: rerodar por grupo, para só então arbitrar Bugs de produto

```text
基础 fixture 修正
       |
       v
Case 到达原始业务断言了吗？
       |
       +-- 否 --> 继续修测试基础设施
       |
       `-- 是
            |
            +-- 通过 --> 记录为测试迁移
            |
            `-- 失败 --> 固定为真实产品回归，再最小修生产代码
```

Prioridade de rerodada:

1. os 4 de Bot (menor mudança e retorno mais rápido);
2. CW / OTB / I08 (trocando apenas a barreira de readiness);
3. Restart / Settings Transition / Turbo (compartilham a fixture de Account);
4. Coding Plan / Quota Reset (compartilham structured selection + fixture de Account);
5. Upgrade Webview;
6. a child request completa de cold start do I20.

## 6. O que não foi feito nesta rodada

- Nenhum código de produção foi modificado;
- Nenhuma configuração legada, snapshot de Registry de workspace ou Account access Personal foi restaurada para fazer os testes passarem;
- Nenhum caso que falhou foi marcado como skip/pending;
- Não se afirma que o comportamento de negócio subjacente já passou. Este relatório apenas arbitra “o ponto de falha mais precoce atual e sua causa raiz”, e as afirmações originais ainda precisam ser completamente rerodadas depois da migração dos testes.