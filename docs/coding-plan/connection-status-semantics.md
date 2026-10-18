# Semântica do status de conexão do Coding Plan (regressão do "não conectado" no plano pessoal)

> Decisão posterior: este documento preserva o design e o histórico de revisão da branch original; "falha ao obter → refazer login" e as opções candidatas da §7.2 foram substituídas pelo [Provider Refactor Todo114](../working-memory/provider-refactor/steps/todo-114-account-status-sync-and-key-retry.md) (antigo Todo105 upstream). Hoje o protocolo de sincronização é completado conforme aquele Todo, a classificação unificada da falta de Key nos dois lados é aplicada e o retry de refresh é reutilizado.

> Status: spec (aguardando decisão / implementação)
> Data: 2026-09-10
> Relacionados: `docs/coding-plan/zai-bigmodel-team-plan-symmetry.md`, `packages/services/src/model-provider/codingPlanProviderAvailability.ts`, `packages/provider/src/account-provider-state.ts`, `packages/ui/src/settings/model-provider-section/providerFamilyConnectionVisibility.ts`

## 1. O problema

**Com login feito e o servidor respondendo explicitamente que "esta conta não tem assinatura do Coding Plan pessoal", o cartão do plano pessoal na página de settings exibe "não conectado + botão conectar"; deveria exibir "não contratado, habilitado após contratação + botão assinar".**

Evidência medida (2026-09-10, conta de produção `63821741092061425`):

- `GET https://bigmodel.cn/api/biz/subscription/list` → `{"code":200,"success":true,"data":[]}`
- `GET https://bigmodel.cn/api/monitor/usage/quota/limit` → `{"code":500,"msg":"当前用户不存在coding plan"}`
- `bigmodelUsageQuotaMapper.ts:98` `isNoPlanMessage()` casa `"不存在coding plan"` → `unavailableReason: "no_plan"`

A mesma conta no plano de equipe (`org-64faf` com quota `code:200`) e no Start Plan (billing/balance com plano ativo) estão normais, então o fenômeno se manifesta como "apenas o plano pessoal aparece desconectado".

## 2. Localização da regressão: comparação de comportamento antes e depois do rebase

Ponto de divisão: 2026-09-10 16:43 `pull origin staging` (`790884b1ce` → `fa70e89683`), trazendo `codex/provider-refactor-m2` (`90b2cf83ceb` 2026-08-20, `524f1ba2e5d` 2026-09-07). A base anterior ao rebase, `790884b1ce`, não contém esses dois commits.

### 2.1 Por que a implementação antiga estava correta

`git show 790884b1ce:.../providerFamilyConnectionVisibility.ts` (antigo `resolveCodingPlanEntitlementState`) usava esta ordem de decisão:

```
if (!hasCodingPlanProvider && loading)      → checking
if (!hasCodingPlanProvider)                 → disconnected      ← critério = se o provider local está configurado
if (zai && !apiKey)                         → disconnected
if (snapshot.unavailableReason === "no_plan") → notPurchased     ★ branch-chave
if (snapshot.unavailableReason === "not_configured") → disconnected
if (snapshot.unavailableReason === "unavailable")    → unavailable
if (currentSubscription / snapshot.quota)   → purchased
default                                     → notPurchased
```

O switch de query do antigo `useCodingPlanEntitlements.ts` olhava apenas para **se o provider local existe**:

```ts
bigmodelCodingPlanQueryEnabled =
  Boolean(bigmodelProviderFingerprint) || Boolean(bigmodelProvider && bigmodelTeamPlanContext);
```

Ou seja, "se este provider existe localmente (incluindo key derivada), consulta o snapshot de entitlement", independentemente de a conta ter ou não entitlement → o cartão pessoal recebe `no_plan` → **`notPurchased` ("não contratado, habilitado após contratação" + botão assinar)**.

**Conclusão: na implementação antiga, o cartão pessoal desta conta exibiria "não contratado"; a observação do usuário de que "antes do rebase estava bom" se sustenta.**

### 2.2 Por que a nova implementação passou a exibir "não conectado"

```
packages/services  validateSubscriptionListAvailability()
        → { kind:"unavailable", reason:"coding_plan_not_entitled" }   (o vocabulário de reason vive nesta camada)
        ▼
  accountProviderConnectionResolver.ts:189  connections.push({ status: availability.kind })   ✗ reason se perde
        ▼
packages/provider  account-provider-resolution.ts:63   states[id] = { availability, entitled }  ✗ sem reason
        ▼
packages/ui  resolveAccountProviderInspectionAccess()  accountProviderAccess.ts:48
        if (provider.accountState?.availability === "unavailable") return null;   ✗ não dispara mais a query de entitlement
        ▼
  resolveCodingPlanEntitlementState()
        const canInspect = accountEntitled || accountAvailability === "pending";
        if (!canInspect) → status:"disconnected"     ✗ curto-circuito, nunca chega a notPurchased
```

Comparação em runtime (mesmos logs):

| Horário | Código da instância | Consultas de entitlement no escopo personal |
|---|---|---|
| 15h | antes do rebase | 33 |
| 16h | código antigo até 16:43 | 17 |
| 17h | depois do rebase (instâncias 17:17 / 17:25) | **0** |

Ou seja, a nova implementação nem chega a buscar de novo o fato de que "o servidor disse que não há plano", convergindo direto para "não conectado" via o `entitled=false` do Account Overlay.

### 2.3 Conclusão líquida

- **A troca de conta** explica "por que este cartão agora não tem entitlement" (o plano pessoal está na conta de teste);
- **O provider-refactor trazido pelo rebase** explica "por que a falta de entitlement é desenhada como não conectado" — o caminho antigo `snapshot.no_plan → notPurchased` foi substituído pelo curto-circuito `canInspect` da nova arquitetura, e o `unavailableReason` se perde entre camadas.

## 3. Semântica alvo

Os branches existentes `accountAvailability === "pending"` e `accountEntitled === true` permanecem inalterados; apenas se recompõe a faixa "logado, mas o servidor afirma explicitamente que não há assinatura":

| accountEntitled | availability | Motivo | Estado do cartão | Texto | Botão principal |
|---|---|---|---|---|---|
| true | available | — | conforme o snapshot | valor atual | valor atual |
| false | pending | — | conforme o snapshot (visível antes de vigorar) | valor atual | valor atual |
| false | unavailable | sem entitlement explícito | **notPurchased** | não contratado, habilitado após contratação | **Assinar** |
| false | unavailable | credencial inválida | unavailable | falha ao obter | refazer login |
| false | unavailable | não logado / não conectado | disconnected | não conectado | Conectar {provider} |
| false | unknown / motivo ausente | — | disconnected (status atual, retrocompatível) | não conectado | Conectar {provider} |

**Limites (que precisam permanecer inalterados)**:

- **Start Plan não participa**: ele aparece como `disconnected` para exibir o cartão de resgate/pagamento (`StatusCards.tsx`, `disconnectedStartPlanPricingVisible`), e `notPurchased` em `buildVisibleFamilyConnectionItems` significa "sem entitlement explícito → ocultar a entrada" (já travado em `packages/ui/test/providerFamilyConnectionVisibility.test.ts`).
- **Team Plan não participa**: o cartão de equipe é montado por `buildTeamPlanItems` a partir do snapshot de entitlement de equipe, com textos próprios ("plano de equipe não atribuído" etc.), e não passa por este desvio.

## 4. Opções candidatas (aguardando decisão)

### Opção A: restaurar o sinal antigo (snapshot `no_plan`)

Relaxar o bloqueio de `resolveAccountProviderInspectionAccess` para `availability === "unavailable"`, permitindo que o provider pessoal ainda recupere o snapshot; `resolveCodingPlanEntitlementState`, quando `!canInspect`, cai para `notPurchased` se `snapshot.unavailableReason === "no_plan"`.

- Prós: comportamento idêntico ao anterior ao rebase, mudança concentrada na camada de UI, sem mexer no contrato entre pacotes.
- Contras: reintroduz uma query de entitlement para provider "indisponível" (a implementação antiga já fazia isso); o mesmo problema passa a ter duas autoridades (o `not_entitled` de availability e o `no_plan` de quota), podendo voltar a divergir.

### Opção B: propagar o motivo de availability (recomendado)

1. `packages/provider`: `AccountProviderState` / `AccountProviderConnectionResult(unavailable)` ganham o `unavailableReason` opcional (`not-authenticated` / `not-connected` / `credential-failed` / `not-entitled`); `unknown` mantém a regra do State anterior, coerente com `availability`; o motivo entra apenas no Account State e não é gravado no Provider Config.
2. `packages/services`: `accountProviderConnectionResolver` mapeia `CodingPlanUnavailableReason` para essa union.
3. `packages/ui`: `useModelProviderNavigation` propaga `accountState.unavailableReason` e desvia conforme a §3; vale apenas para provider **individual**; com o motivo ausente, mantém o comportamento atual (retrocompatível).

- Prós: autoridade única (o Account Overlay já calculou `not_entitled`), sem requisições extras, direção coerente com o provider-refactor.
- Contras: mudança de contrato em três pacotes, exigindo testes unitários / e2e complementares.

## 5. Requisitos de teste (executar "testes primeiro")

- Teste unitário `packages/ui/test/providerFamilyConnectionVisibility.test.ts`: os quatro branches de motivo; fallback para `disconnected` sem motivo; comportamento inalterado quando o Start Plan recebe "sem entitlement explícito" (prevenção de regressão).
- Teste unitário `packages/services/test/accountProviderConnectionResolver.test.ts`: mapeamento de motivo e propagação no State; `unknown` mantém o motivo anterior.
- e2e: ver a descrição de lacunas na seção 8.

## 6. Superfície de impacto e riscos

- A opção B é um campo opcional aditivo; os judgements de `available` / `entitled` e a disponibilidade de modelos não são afetados;
- O cartão pessoal passa de `disconnected` para `notPurchased`: a visibilidade da entrada não é afetada (a regra de ocultação vale só para o Start Plan), e o botão "assinar" (`buyAction`) já existe;
- É preciso confirmar que o `accountState` Host↔Renderer não sofre podagem de schema;
- Esta camada semântica é compartilhada entre desktop e controle remoto pelo celular, sem diferenças de `continuous` / `replayable`.

## 7. Fora de escopo (defeitos adjacentes, tratados à parte)

### 7.1 O Team quota engole o 500 de negócio como "não atribuído"

`validateTeamPlanQuotaAvailability`, com HTTP 200 + envelope `code:500, success:false`, segue para o estado definitivo `hasQuotaData=false → coding_plan_not_entitled` e escreve no cache de entrada de 24h (`codingPlanProviderAvailability.ts:381-392`). Deveria cair em `unknown` (sem cache). Nesta conta, o projeto `org-272fbf` registrou 11 ocorrências de `code:500` em 2026-09-10.

### 7.2 Assimetria no motivo de "falta de key derivada" entre Z.AI e BigModel (não alterado nesta decisão, aguardando confirmação de produto)

**Condição de disparo**: o login é da família zai (`providerFamilyDomain` resolve para zai) **e** a key derivada de nível de conta está vazia (sem plano levando à impossibilidade de derivar, ou a derivação falhou).

| Estado da conta | reason do BigModel | reason do Z.AI | Exibido após esta mudança |
|---|---|---|---|
| Não logado | `not_connected` (early return do resolver, `accountProviderConnectionResolver.ts:111-120`) | idem à esquerda (mesmo branch de early return) | "não conectado" nos dois lados, sem divergência |
| Logado + key derivada vazia | `not_connected` (constante no ponto de chamada) | `auth_failed` (`resolveMissingZaiApiKeyReason` considera assim já no user_info) | não conectado vs **falha ao obter**, divergência |
| Logado + com key + lista de assinaturas vazia | `not_entitled` | `not_entitled` | "não contratado" nos dois lados, este é o ponto corrigido |

**Causa raiz**: em `codingPlanProviderAvailability.ts:140-154`, zai recebe um julgamento dinâmico e bigmodel recebe uma constante; `resolveMissingZaiApiKeyReason` (mesmo arquivo, :657-662) também reporta "sem key derivada" como `auth_failed`, reutilizando a semântica de "credencial rejeitada pelo servidor".

**Correção (não executada)**:

- A: `return userInfo ? "coding_plan_not_connected" : "coding_plan_not_authenticated"` — alinhar em uma linha, deixando `auth_failed` só para o 401/403 real de `classifyAvailabilityError`;
- B: quando faltar a key, usar o OAuth access token para consultar `subscription/list`, incluindo esse estado no grupo "não contratado" (exige confirmação do backend sobre aceitar OAuth token nesse endpoint).

**Por que "não aparece quando deslogado" não serve como argumento para não mudar**: `shouldShowCodingPlanForProviderFamilyDomain` (`useModelProviderNavigation.ts:307-312`) retorna true para as duas famílias quando `providerFamilyDomain` está vazio (isto é, o cartão aparece dos dois lados), e só filtra por família depois que o domain está definido; e uma vez definido, o domain não é resetado no logout. Portanto, o público afetado pela divergência = usuários no domínio zai e no estado "logado + key derivada vazia".

**Decisão desta rodada**: não alterar (manter em zai o novo texto "falha ao obter" nesse estado); se mais tarde se achar que essa mudança de texto não deve existir, a convergência mínima é remover na UI o branch `credential-failed → unavailable`, fazendo-o voltar a `disconnected` (igual ao comportamento anterior a esta mudança); nesse caso o efeito líquido deste MR se resume a "sem assinatura → não contratado".

### 7.3 Outros itens a confirmar (vindos da review de 2026-09-10)

- Depois que o cartão pessoal vira `notPurchased`, `canDisconnectProvider` passa de false para true (`StatusCards.tsx:255/392/515`, `Detail.tsx:728`), e o estado "não contratado" expõe a entrada de desconexão; é preciso confirmação de produto sobre a necessidade disso.
- `unavailableReason` entra em `states`, e o `revision` em `packages/provider/src/sources.ts:61` é `hash([..., providers, states])`, de modo que uma mudança puramente de exibição também avança o revision do snapshot de Account e dispara um novo sync do registry; é preciso confirmar se isso é aceitável.
- `packages/provider/test/account-provider-resolution.test.ts` não cobre a nova lógica de projeção de State (propagação do reason / `unknown` mantendo o anterior / o nível superior sem reason não carregar indevidamente).

## 8. Estado da implementação e lacunas de e2e (2026-09-10)

**Implementado** (branch `fix/coding-plan-not-purchased-status`, base `origin/staging`):

- `packages/provider`: `AccountProviderState` / `AccountProviderConnectionResult` ganham `unavailableReason`, com `unknown` mantendo a rodada anterior;
- `packages/services`: `CodingPlanUnavailableReason` é exportado e mapeado como motivo do domínio de conta, publicado junto com o resultado de conexão;
- `packages/shared`: novo `isIndividualCodingPlanModelProviderId`;
- `packages/ui`: `resolveCodingPlanEntitlementState` desvia por `unavailable + not-entitled → notPurchased` e `credential-failed → unavailable`, valendo só para a versão individual;
- Testes unitários: UI ganhou 7 grupos de casos e services 2 grupos, 50 casos no total passando (incluindo a prevenção de regressão das semânticas existentes de Start/Team).

**Resultado da verificação**: `pnpm lint` com 0 error; `pnpm typecheck` com um **conjunto de erros idêntico ao da baseline anterior à mudança** (as 91 ocorrências são todas o problema pré-existente de declarações dist desatualizadas de pacotes embutidos na branch, sem relação com esta mudança).

**e2e não concluído (não pode ser reportado como verificado)**, porque a infraestrutura atual de Desktop E2e não consegue expressar o estado "logado + sem plano pessoal":

- O mock de upgrade consegue fornecer esses dados (`subscription/list` vazio + quota retornando `当前用户不存在coding plan`), mas nesse cenário a página de settings **não renderiza o seletor de forma de conexão da família** (medido: a nav tem apenas `preset:account:bigmodel-start-plan` e dois providers custom, com `model-provider-connection-mode-trigger` em contagem 0), o que impede navegar até o cartão do plano pessoal;
- O mock de team tem apenas os cenários `personalOnly` / `teamOnly` / `both`, todos com plano, sem conseguir expressar "sem plano";
- Os e2e existentes relacionados já quebraram pela mudança de ids do provider-refactor: `coding-plan-upgrade-personal-sold-out` (e os casos que usam o mesmo `preset:builtin:bigmodel`) falham localmente em `model-provider-nav-item-preset:builtin:bigmodel: missing`.

**Sugestão de aplicação**: adicionar o cenário `personalNone` ao mock de team (ou fazer o cenário do mock de upgrade renderizar o cartão raiz da família) e então acrescentar um caso na página de settings conforme o padrão `visible()` de `provider-family-responsive.test.ts` (a navegação tem cópias ocultas; é preciso operar o elemento visível); em paralelo, corrigir separadamente os test ids de e2e de coding-plan que quebraram.