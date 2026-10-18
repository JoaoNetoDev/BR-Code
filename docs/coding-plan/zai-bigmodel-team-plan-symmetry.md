# Simetria de ponta a ponta entre zai e bigmodel no Team Plan

Data de atualização: 2026-08-05

> spec histórico de implementação. As descrições de `ModelProviderService`, Registry Snapshot e
> projeção de runtime-key na segunda metade deste documento já foram substituídas pelo Provider
> Refactor. Atualmente a execução Team/Individual é feita por Effective Provider Config,
> ModelFactory e Account Request Auth Service; credenciais dinâmicas não entram no Registry.
> Mantemos aqui a causa raiz antiga e a base da migração, sem serving de mapa de código atual.

## Contexto

A página de detalhes de configuração de Model Provider, no campo 「连接方式」 (modo de conexão),
suporta quatro opções: Start Plan / Individual Coding Plan / Team Plan / API Key.
Historicamente o Team Plan só foi realmente implementado na family `bigmodel`; o Team Plan da family
`zai` era um **meio-produto quebrado**: a camada de geração de key tinha meia infraestrutura, mas
identificação, matching, obtenção de dados, renderização de UI e restauração de login estavam todos
hardcoded para bigmodel ou bloqueados pela guarda `familySpec.id === "bigmodel"`, deixando a team key
de zai como código morto.

Este spec descreve a mudança que alinha zai e bigmodel em toda a cadeia do Team Plan.

## Termos

- `ProviderFamilyDomain = ModelProviderFamilyId = "zai" | "bigmodel"`
- Team Plan connection key (connection key): no formato
  `team-plan:<codingPlanProviderId>:<productId>:<orgId>:<projectId>`, usada em
  `modelProviderFamilySelectedKeys[family]` para identificar "atualmente selecionada a assinatura de
  um determinado time".
- Enterprise pricing / team products: a lista de pacotes retornada por
  `GET /subscription/enterprise/v2/pricing`, requisitada de forma independente por family.

## Situação atual: tabela de assimetria dos 5 elos

```text
环节                  bigmodel                          zai
──────────────────────────────────────────────────────────────────────
① service 路由       createCodingPlanSubscriptionService
                      └─ new BigModelCodingPlanSubscriptionProvider
                         enterprise 读方法 hardcode bigmodelCodingPlan   ❌ 无 zai 路由
                         + bigmodel host + bigmodel token                 所有调用直达 bigmodel provider

② request 类型       EnterpriseCodingPlanPricingRequest
                      └─ { authenticated?: boolean }                   ❌ 无 family 字段

③ 数据获取 hook      useEnterpriseCodingPlanProducts
                      ├─ getStaticTeamProducts 读 bigmodelCodingPlan    ❌ 无 family 参数
                      └─ getEnterprisePricing({ authenticated })          单实例只服务 bigmodel

④ connection key     plan-identity.ts
                      createBigModelTeamPlanConnectionKey               ⚠️ dispatcher 对 zai 走通用拼接
                      prefix = "team-plan:builtin:bigmodel-coding-plan:"   但 parse/matches 只认 bigmodel 前缀
                                                                       zai key 永远匹配失败（死代码）

⑤ UI 可见性          providerFamilyConnectionVisibility.ts
                      ├─ filterStartPlanItems:
                      │  hasTeamPlanEntitlement =
                      │    familySpec.id === "bigmodel" && ...           ❌ zai 永远 false
                      ├─ appendSubscribedTeamPlanItems:
                      │  codingPlanItem = items.find(bigmodelCodingPlan) ❌ 只从 bigmodel 派生
                      └─ buildEntitlementTeamPlanItems:
                         entitlements[bigmodelCodingPlan]                ❌ 只读 bigmodel entitlement

登录后选 key          resolveLatestModelProviderFamilyConnectionSelection
                      familySpec.id === "bigmodel" 守卫                  ❌ zai 有订阅也不识别

失效清理              ModelProviderSection 清理 useEffect（重复两份）
                      只读 selectedKeys.bigmodel                        ❌ zai 不清理
```

**Fatos-chave (verificados diretamente na fonte)**:

- O dispatcher `createTeamPlanConnectionKey`
  (`packages/ui/src/lib/modelProviderFamilyConnectionSelection.ts:29-45`) usa concatenação de string
  genérica para zai, produzindo `team-plan:builtin:zai-coding-plan:...` — é o único ponto
  semi-simétrico.
- Porém, a jusante `matchesBigModelTeamPlanConnectionKey` verifica estritamente o prefixo bigmodel,
  então a key de zai nunca casa (código morto).
- A guarda `familySpec.id === "bigmodel"` em `resolveLatestModelProviderFamilyConnectionSelection`
  faz com que zai não seja reconhecido como conexão team, mesmo tendo team products assinados.
- A team key de zai nunca foi realmente escrita em `modelProviderFamilySelectedKeys.zai` do usuário
  (bloqueada pelas guardas em vários pontos), **na prática não há team key de zai legada a migrar**.

## Objetivo: simetria nos 5 elos + key gerada por family

```text
环节① service:    按 request.family 路由 to separate ZaiCodingPlanSubscriptionProvider
环节② request:    EnterpriseCodingPlanPricingRequest 加 family?: ProviderFamilyDomain
环节③ hook:       useEnterpriseCodingPlanProducts 加 family 参数
环节④ key:        新增 family-aware create/parse/matches
                  zai 前缀 = "team-plan:builtin:zai-coding-plan:"
环节⑤ UI 可见性:  appendSubscribed/buildEntitlement/filterStartPlan 去掉 bigmodel hardcode
                  登录恢复/失效清理对 zai 开放
```

## Contrato de backend (confirmado pelo usuário)

- zai usa seu próprio domínio (teste `api.z.ai` / produção `api.z.ai`, isto é,
  `resolveZaiCodingPlanHost()`).
- Exceto pelos caminhos de "compra", os caminhos de pricing / projetos de time / consulta de
  assinatura / saldo reutilizam a estrutura de URL do bigmodel; apenas host, providerId e OAuth token
  diferem.
- Caminhos de compra: Stripe / PayPal já são zai-aware dentro do provider bigmodel
  (`assertZaiPaymentProvider` + prefixo `/api/pay` + token zai) e são reutilizados. Alipay
  `createSign`/`updateSign` lança explicitamente `CODING_PLAN_ZAI_OVERSEAS_PAYMENT_REQUIRED` para zai,
  permanecendo inalterado.

## Decisões técnicas-chave

### 1. Classe de provider zai independente (não reutiliza instância do provider bigmodel)

Os métodos de leitura enterprise do provider bigmodel (`getEnterprisePricing`,
`getEnterpriseBalance`, `getEnterprisePendingOrders`, `checkEnterpriseOrderStatus`,
`enrichEnterprisePricingTeamProjects`) têm hardcoded
`BUILTIN_MODEL_PROVIDER_IDS.bigmodelCodingPlan` como providerId + host bigmodel + token bigmodel,
não podendo ser reutilizados de forma parametrizada. Cria-se `ZaiCodingPlanSubscriptionProvider`:

- herda ou compõe `BigModelCodingPlanSubscriptionProvider`
- override dos métodos de leitura enterprise: host usa `resolveZaiCodingPlanHost()`, providerId usa
  `zaiCodingPlan`, token usa `loadZaiAuthorization`
- override de `enrichEnterprisePricingTeamProjects`: customerInfo passa pelo domínio zai + token
  zai; key de pré-aquecimento do team project usa providerId zai
- caminhos de compra (Stripe/PayPal) não são sobrescritos, reutilizam a classe pai (já zai-aware)

### 2. Connection key gerada por family (sem risco de migração)

Adiciona-se em `packages/shared/src/plan-identity.ts`:

- `createTeamPlanConnectionKeyByFamily(family, parts)`
- `parseTeamPlanConnectionKeyByFamily(family, key)`
- `matchesTeamPlanConnectionKeyByFamily(family, candidateKey, selectedKey)`

O branch bigmodel delega aos `*BigModelTeamPlanConnectionKey` existentes (mantém compatibilidade,
prefixo bigmodel inalterado). O branch zai usa o prefixo `team-plan:builtin:zai-coding-plan:`, com
estrutura / regras de compatibilidade legacy simétricas ao bigmodel.

**Sem migração legada**: a team key de zai nunca foi escrita no selectedKey do usuário, logo não há
migração. O prefixo bigmodel não muda.

### 3. Não alterar literais bigmodel

Os literais `team-plan:builtin:bigmodel-coding-plan:` em ~15 arquivos de código + ~10 de teste
permanecem intocados. O novo código zai usa uniformemente o novo helper family-aware, sem introduzir
novos literais.

## Ordem de implementação (TDD: spec → testes → implementação)

### Phase 1 — camada shared

- `packages/shared/src/plan-identity.ts`: adicionar 3 helpers family-aware
- `packages/shared/src/coding-plan-subscription.ts`: `EnterpriseCodingPlanPricingRequest` ganha
  `family?: ProviderFamilyDomain`
- `packages/shared/test/planIdentitySnapshot.test.ts`: adicionar casos da family zai
  (create/parse/matches/legacy/wildcard)

### Phase 2 — camada services

- Criar `packages/services/src/coding-plan-subscription/zaiCodingPlanSubscriptionProvider.ts`
- `packages/services/src/coding-plan-subscription/codingPlanSubscriptionService.ts`: rotear por
  `request.family` para as instâncias de provider bigmodel / zai (sem family mantém bigmodel,
  retrocompatível)
- `packages/services/test/`: adicionar testes unitários do provider zai (enterprise pricing usando
  host/token zai, roteamento do service)

### Phase 3 — camada UI

- `useEnterpriseCodingPlanProducts.ts`: adicionar parâmetro `family`; ler o static bucket da family
  correspondente; passar family ao service
- `providerFamilyConnectionVisibility.ts`: `appendSubscribedTeamPlanItems` /
  `buildEntitlementTeamPlanItems` / `filterStartPlanItems` iterando ou parametrizados por family
- `ModelProviderSection.tsx`: chamar o hook também para a family zai, obtendo
  `subscribedTeamProducts` de zai; useEffect de limpeza passa a ser family-aware
  (**mesclar as duas cópias duplicadas atuais**); `showPurchasedTeamPlanFallback` family-aware
- `modelProviderFamilyConnectionSelection.ts`: remover a guarda `familySpec.id === "bigmodel"`, para
  que zai também passe pela resolução de team key; matcher passa a usar a versão family-aware
- `oauthProviderFamilySelectionRefresh.ts` / `modelProviderFamilySelectedKeyMigration.ts`: abrir o
  reconhecimento de team para zai (`resolveCodingPlanProviderIdFromSelectedKey` reconhece o prefixo
  zai; `migrateBigModelTeamPlanSelectedKey` generalizado para family-aware)

### Phase 4 — alinhamento dos consumidores

14+ pontos de chamada `parse/matches/create` (model selection groups, usage sources, telemetry,
off-peak, composer, camada services) alterados um a um para family-aware. A maioria já está dentro do
dispatcher `createTeamPlanConnectionKey`; basta fazer os matchers/parse a jusante também usarem a
versão family-aware. Cada checkpoint literal `startsWith("team-plan:...")` é avaliado individualmente.

### Phase 5 — validação

- `pnpm typecheck` + `pnpm lint`
- Testes unitários: plan-identity zai, provider zai, visibilidade de UI, migração de selectedKey,
  restauração de login
- e2e: visibilidade do modo de conexão do zai team plan / restauração de login / limpeza de
  invalidez
- Chamada real ao enterprise pricing do domínio zai em ambiente de teste para validar o contrato de
  backend

## Registro de implementação (2026-08-05)

### Validação do contrato de backend

Requisição real em ambiente de teste a `https://api.z.ai/api/biz/customer/getCustomerInfo` (domínio
zai) com sucesso, retornando estrutura isomórfica à do bigmodel (incluindo `organizations[].projects[]`,
com `projectType=2` identificando projeto de programação de time). O token zai usa header `Bearer`
(diferente do token裸 do bigmodel).

Conclusão: a validação de availability do zai team plan (verificação de projeto de time via
customerInfo) pode reutilizar a estrutura de URL do bigmodel, cambiando apenas host →
`buildRuntimeZaiBusinessUrl`, token → `oauth:zai:access_token`, header →
`createZaiLoginAuthHeaders`.

### Validação de runtime do fluxo de injeção (dev:desktop:test)

A simetria dos 5 elos foi validada ponta a ponta em zai, com evidências dos logs do app + chamada
manual ao `api.z.ai` usando credenciais de `~/.zcode-dev`:

1. **Roteamento correto**: `getEnterprisePricing` tratado por `ZaiCodingPlanSubscriptionProvider`;
   logs de prewarm com `family: "builtin:zai-coding-plan"`; requisição caindo no domínio zai biz de
   teste `api.z.ai` (`TEST_ZAI_BUSINESS_BASE_URL`, e não no domínio do frontend zcode `zcode.z.ai`).
2. **customerInfo correto**: a conta de teste tem projeto de time `projectType: 2` sob
   `org-2B118...` / `proj_50399...`; `getCustomerInfo` retorna 200 com sucesso, com estrutura
   isomórfica à do bigmodel.
3. **Reuso do fluxo de injeção**: o prewarm já executou list + POST create `zcode-team-api-key` para
   zai:
   ```
   list:   { code: 200, apiKeyCount: 2, usableApiKeyCount: 0 }   ← 没有 name=zcode-team-api-key 的 key
   create: { code: 500, "You currently do not have a valid team subscription grant record,
                      unable to create API Key" }
   status: "missing"
   ```

**Causa raiz de não ver o team plan = falta de grant do backend para a conta de teste zai**
(sem relação com o código de simetria): não existe key com `name=zcode-team-api-key, keyType=2` sob
essa org/project, e o POST de criação é rejeitado pelo backend zai. `status: "missing"` →
`apiKeyStatus: "unavailable"` → a UI filtra o item de menu por `apiKeyStatus === "unavailable"`
(`modelSelectionGroups.ts` / `providerFamilyConnectionVisibility.ts`).

> Atenção: embora o backend zai tenha retornado uma key com `name="member-{userId}", keyType=2` sob
> esse projeto, o fluxo de injeção do cliente **não deve** afrouxar a validação de nome de
> `isUsableBigModelTeamPlanApiKey` para reconhecê-la — `zcode-team-api-key` é o contrato unificado de
> nomenclatura do fluxo de injeção do cliente zcode, e zai/bigmodel devem obedecê-lo. A correção é
> adicionar grant à conta de teste zai, para que o POST consiga criar `zcode-team-api-key`, e não
> fazer um caso especial por family no cliente.

### Lista real de arquivos alterados

**shared**

- `plan-identity.ts`: `TEAM_PLAN_CONNECTION_KEY_PREFIX_BY_FAMILY` + `create/parse/matches/resolveFamily`
  family-aware
- `coding-plan-subscription.ts`: `EnterpriseCodingPlanPricingRequest.family?`
- `off-peak-types.ts`: `OffPeakCodingPlanKind` ganha `zai-team`

**services**

- `coding-plan-subscription/`: novo `zaiCodingPlanSubscriptionProvider` (herda bigmodel, sobrescreve
  host/token/header/providerId); `codingPlanSubscriptionService` roteia por `request.family`
- `model-provider/codingPlanProviderAvailability.ts`:
  `validateSelectedTeamPlanAvailability(family, ...)` generalizada, zai também passa pela validação
  de customerInfo; `validateZaiCodingPlanPairAvailability` ganha validação de team project
- `session/offPeakRuntimeModel.ts`: removida a guarda `providerFamily === "bigmodel"`, zai team plan
  pode passar por off-peak

**UI lib**

- `modelProviderFamilyConnectionSelection.ts`: removida a guarda `familySpec.id === "bigmodel"`
  (latest + missing)
- `modelProviderFamilySelectedKeyMigration.ts`: `migrateBigModelTeamPlanSelectedKey` →
  family-aware `migrateTeamPlanSelectedKeyForDomain`; parâmetro `upgradeBigModelTeamPlan` →
  `upgradeTeamPlan`
- `oauthProviderFamilySelectionRefresh.ts`: `resolveCodingPlanProviderIdFromSelectedKey` reconhece o
  prefixo zai; `getEnterprisePricingProducts` busca pricing para zai;
  `hasCompleteTeamPlanConnectionKey` family-aware; ramo de proteção da restauração na inicialização
  aberto para zai
- `modelSelectionGroups.ts`: `buildTeamPlanConnectionOptions` remove a guarda `familyId !== "bigmodel"`
  (opções team de zai podem ser geradas); `createTeamPlanConnectionKey`/`matchesTeamPlanConnectionKey`/
  `isSelectedTeamPlanKnownUnavailable`/`resolveSelectedTeamPlanConnectionKey`/
  `isSelectedFamilyTeamPlanConnection` todos family-aware
- `codingPlanUsageSources.ts`: team usage source gera key + providerId por `product.family`;
  `matchesTeamPlanUsageSourceKey` family-aware
- `codingPlanEntitlementContext.ts`: novo `resolveTeamPlanEntitlementContext(family, ...)` + versão zai
- `codingPlanFunnelTelemetry.ts`: reconhecimento de team plan family-aware

**UI section**

- `ModelProviderSection.tsx`: mescla os dois useEffects duplicados de limpeza de team key inválida em
  um único effect family-aware; `showPurchasedTeamPlanFallback` family-aware;
  `isSelectedTeamPlanStillSubscribed` family-aware; chama `useEnterpriseCodingPlanProducts`
  separadamente para zai e mescla `subscribedTeamProducts`
- `providerFamilyConnectionVisibility.ts`: `buildEntitlementTeamPlanItems`/
  `buildSelectedTeamPlanFallbackItems` iteram as duas families; `resolveTeamPlanProjectKey`
  family-aware
- `useModelProviderNavigation.ts`: restauração de team key em `resolveRestoredSelection`
  family-aware; passagem de `selectedTeamPlanKey` também cobre zai
- `useCodingPlanEntitlements.ts`: consulta de zai team plan com
  organizationId/projectId/cacheKey (simétrico a bigmodel)
- `useEnterpriseCodingPlanProducts.ts`: parâmetro `family` (Phase 3)
- `enterpriseCodingPlanProducts.ts`: campo `family` (Phase 3)

**UI outros**

- `v4/composer/V4ComposerToolbar.tsx`: `resolveContextTeamUsageSourceFromEntitlementSnapshot`
  determina a family por `snapshot.provider.id`
- `store/offPeakTaskStore.ts`: `hasAnyOffPeakCodingPlanProvider` com reconhecimento de team
  family-aware

### Caminhos explicitamente mantidos como exclusivos de bigmodel

Os caminhos abaixo **não precisam** de simetria com zai, porque semanticamente já são exclusivos de
bigmodel, ou o zai tem um caminho equivalente próprio:

- `validateBigModelCodingPlanPairAvailability` em `codingPlanProviderAvailability.ts` — a função em
  si é separada por family; zai tem seu próprio `validateZaiCodingPlanPairAvailability`
- `resolveSelectedBigModelTeamContext` em `modelProviderService.ts:178` — lê
  `selectedKeys.bigmodel`, exclusivo do bucket bigmodel
- `zcodeAgentService.ts:1024` — a guarda `providerId !== bigmodelCodingPlan` retorna false
  diretamente, serve apenas à dica de membros de projeto do provider bigmodel

### Itens pendentes de avaliação

- ~~O branch `team` de `CurrentSidebarCodingPlanUsageSource.team` em
  `WorkspaceSidebarFooterUsageSummary` tem o tipo preso a `bigmodelCodingPlan`; exibir o resumo de uso
  de team zai exige alinhar tipo + chamadores (hoje zai no sidebar mostra só individual)~~ ✅ Corrigido
  (ver a seção 「消费方对称化遗漏」 abaixo)
- e2e: testes e2e de visibilidade do modo de conexão do zai team plan / restauração de login /
  limpeza de invalidez ainda pendentes

## Correção: Plan Card do zai travado em 「加载中」 (curto-circuito pela guarda bigmodel em appendSubscribedTeamPlanItems)

Data: 2026-08-06

### Sintoma

Após login OAuth zai bem-sucedido + team plan provider persistido + selectedKey já sendo team key,
o Plan Card Z.ai na página de configurações continuava mostrando 「加载中...」, sem conseguir entrar
nos detalhes do modo de conexão.

### Causa raiz (confirmada via captura do React fiber por CDP + state de runtime)

`appendSubscribedTeamPlanItems` (`providerFamilyConnectionVisibility.ts`) tem uma **guarda
pré-requisito hardcoded para bigmodel**:

```typescript
const bigmodelCodingPlanItem = items.find(
  (item) => item.presetId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelCodingPlan,
);
if (!bigmodelCodingPlanItem) {
  return items; // ← 短路！
}
```

Quando `providerFamilyDomain === "zai"` na página de configurações, `codingPlanItems`, após ser
filtrado por `shouldShowCodingPlanForProviderFamilyDomain`, **contém apenas a family zai** (zai-coding-plan

- zai-start-plan), sem `bigmodelCodingPlan`. A guarda retorna direto, e o item teamPlan de zai
  **nunca é gerado**.

Cadeia de efeitos a jusante:

- `connectionModeCodingPlanItems` não contém o item teamPlan
- `resolveSavedPlanConnectionItem(selectableNavigationItems, teamKey)` não acha correspondência → null
- `pickFamilyModeNavigationItem` cai no branch `if (mode === "oauth" && savedItemKey)` →
  savedItemKey não é startPlan key → **return null**
- `selectedNavItem = null`
- `Detail.tsx` L269 `if (!selectedNavItem) return <ModelProviderLoadingCard>` →
  **sempre loading**

### Correção

`appendSubscribedTeamPlanItems` remove a guarda pré-requisito de bigmodel; os três builders
(entitlement / fallback / product) resolvem cada codingPlanItem por family via
`resolveCodingPlanItemForFamily` (já alterado na Phase 3), pulando a family quando não existe. A
posição de inserção do fallback também passou a buscar a âncora pela family do primeiro item team
(antes o literal hardcoded `bigmodelCodingPlanItem.key`).

### Testes

`packages/ui/test/providerFamilyConnectionVisibility.test.ts` ganha 1 teste de regressão
「visão apenas-zai (sem item codingPlan bigmodel) ainda gera o item de conexão Z.ai Team Plan»,
cobrando o cenário com selectedTeamPlanKey presente + items contendo apenas zai. 13 testes
totalmente verdes.

### Validação em runtime

Captura do state do React fiber por CDP antes e depois da correção:

- Antes: `connectionModeCodingPlanItems` tinha apenas 1 item (zai-coding-plan), sem item teamPlan;
  `selectedNavItem = null`; Detail renderizava `<ModelProviderLoadingCard>`.
- Depois: com o HMR aplicado, o 「加载中」 desapareceu da página (`loadingCount: 0`) e o Plan Card
  renderizou normalmente.

## Correção: zai Team Plan não aparece no badge da sidebar / seletor de modelo do composer / página de estatísticas de uso (omissões de simetria nos consumidores)

Data: 2026-08-06

### Sintoma

Após login OAuth zai + team plan persistido + Plan Card da página de configurações mostrando
normalmente o pacote de time, as três áreas abaixo continuavam **sem exibir** nada relacionado ao
zai team plan:

1. **Badge no avatar da sidebar**: não mostra o identificador de time / a cota
2. **Seletor de modelo do composer**: não aparece o grupo de modelos team zai
3. **Página de estatísticas de uso**: não mostra a origem/cota zai team

### Causa raiz

As três áreas são diferenças de **consumidores** esquecidas na simetria zai da Phase 3. Na camada lib,
`modelSelectionGroups.ts` / `codingPlanEntitlementContext.ts` / `codingPlanUsageSources.ts` já estão
simétricos (geram dados team zai), mas os componentes de UI que consomem esses dados ainda usam a
escrita antiga de family única bigmodel, bloqueando os dados team zai:

```text
区域                        断裂点
─────────────────────────────────────────────────────────────────────
sidebar badge               WorkspaceSidebarFooterUsageSummary.tsx
  ├─ 只拉 bigmodel enterprise products（无 zai hook）
  ├─ resolveSidebarCurrentCodingPlanUsageSource 只传 bigmodel selectedKey
  ├─ teamEntitlement.enabled 硬绑 providerId === bigmodelCodingPlan
  ├─ teamEntitlement.preferredProviderId 硬编码 bigmodelCodingPlan
  ├─ profilePlanBadge.hasTeamPlanEntitlement 带 bigmodelFamilyAllowed 前置守卫
  └─ providerEntitlements team 分支硬判 bigmodelCodingPlan providerId

聊天框模型选择器             V4ComposerToolbar.tsx
  ├─ resolveV4ContextPlanConnection 只识别 bigmodel team-plan 前缀
  │  （zai team selectedKey 落到 personalCoding 判断后 return none）
  ├─ V4ContextPlanConnection.teamCoding 类型硬绑 family: "bigmodel"
  ├─ resolveContextCodingPlanUsageSource providerId 类型/守卫硬绑 bigmodel
  ├─ contextCodingPlanUsageTeamSource 读 entitlements[bigmodelCodingPlan]
  ├─ enterpriseProducts hook 不传 family（默认只拉 bigmodel pricing）
  └─ buildModelSelectGroups 第 8/9 参数传 [] 和 false（team 分组永远建不出）

使用统计页                  SettingsPage.tsx + CodingPlanUsagePanel.tsx
  ├─ SettingsPage 只拉 bigmodel enterprise products（无 zai hook）
  ├─ checkingUsageCodingPlanTab 只等 bigmodel loading
  ├─ CodingPlanUsagePanel.zaiEntitlement 不排除 team（team 被当个人查询）
  ├─ CodingPlanUsagePanel.teamEntitlement 硬绑 bigmodelCodingPlan providerId
  └─ CodingPlanUsagePanel.effectiveEntitlement zai providerId 一律走个人分支
```

### Estratégia de correção

Alinhar uniformemente ao padrão já validado de 「hook de duas families + mesclagem de
subscribedTeamProducts」 em `ModelProviderSection.tsx:486-522`:

**Camada lib primeiro** (`codingPlanUsageSources.ts`):

- `CurrentSidebarCodingPlanUsageSource.team.providerId` deixa de estar preso a `bigmodelCodingPlan` e
  passa a ser `SidebarUsageCodingPlanProviderId`
- `resolveSidebarCurrentCodingPlanUsageSource` ganha o parâmetro `zaiSelectedKey`; o branch zai
  verifica primeiro o prefixo team-plan e, se casar, retorna a team source
- `formatTeamUsageSourceLabel` pega o prefixo de marca por `product.family` (zai → `Z.ai - `,
  bigmodel → `BigModel - `)

**Consumidor 1 — badge da sidebar** (`WorkspaceSidebarFooterUsageSummary.tsx`):

- novo hook `zaiEnterpriseProducts`; `subscribedTeamProducts` mescla as duas families
- `currentUsageSource` recebe `zaiSelectedKey`
- `teamEntitlement` roteia por `currentUsageSource.audience === "team"`; `preferredProviderId` é
  obtido dinamicamente
- `profilePlanBadge` remove a guarda pré-requisito `bigmodelFamilyAllowed`; `teamEntitlementLoading`
  mescla o loading das duas families
- o branch team de `providerEntitlements` roteia por `audience === "team"` (compatível com
  zai/bigmodel)

**Consumidor 2 — seletor de modelo do composer** (`V4ComposerToolbar.tsx`):

- o tipo `V4ContextPlanConnection.teamCoding` abre `family: ProviderFamilyDomain` + providerId
  zai/bigmodel
- `resolveV4ContextPlanConnection` ganha um branch de reconhecimento de prefixo team-plan zai
- `resolveContextCodingPlanUsageSource` abre tipo/guarda de providerId, roteando pelo prefixo
  `team-plan:`
- `contextCodingPlanUsageTeamSource` pega o entitlement snapshot correspondente por
  `connection.providerId`
- o hook `enterpriseProducts` recebe `family: connection.family`
- novo cálculo de `showPurchasedTeamPlanFallback` (mostra se qualquer uma das duas families tiver
  team key, alinhado a `ModelProviderSection.tsx:549-558`)
- `buildModelSelectGroups` recebe `subscribedTeamProducts` + `showPurchasedTeamPlanFallback` (no lugar
  do `[]` / `false` anteriores)

**Consumidor 3 — página de estatísticas de uso** (`SettingsPage.tsx` + `CodingPlanUsagePanel.tsx`):

- `SettingsPage` ganha o hook `usageZaiEnterpriseProducts`; `usageSubscribedTeamProducts` mescla as
  duas families; `checkingUsageCodingPlanTab` mescla o loading das duas families
- `CodingPlanUsagePanel.zaiEntitlement` ganha a guarda `!effectiveSourceIsTeamPlan` (team source não
  é consultado como individual)
- `CodingPlanUsagePanel.teamEntitlement` roteia por `effectiveSourceIsTeamPlan`, com
  `preferredProviderId` dinâmico
- `CodingPlanUsagePanel.effectiveEntitlement` verifica team plan primeiro (se casar, vai para
  teamEntitlement), senão segue o branch individual por providerId

### Testes

`packages/ui/test/codingPlanUsagePanel.test.ts` ganha 5 testes de regressão de simetria zai:

- team product zai expandido em usage source com providerId zai + prefixo de marca `Z.ai - `
- `resolveSidebarCurrentCodingPlanUsageSource` resolve o selectedKey team zai em team source
- team key zai sem source correspondente retorna null (não faz fallback para individual)
- key zai individual coding-plan é resolvida como individual
- `matchesTeamPlanUsageSourceKey` casa corretamente sourceId/selectedKey de team zai

Todos os testes relacionados (codingPlanUsagePanel 17 + providerFamilyConnectionVisibility /
modelSelectionGroups / sidebarUsageCodingPlanProviderPreference / codingPlanEntitlements /
enterpriseCodingPlanProducts / v4ComposerToolbarRecovery / modelProviderCodingPlan /
modelProviderCodingPlanI18n / zcodeModelSelectionResolution /
modelProviderFamilyConnectionSelection / workspaceSidebarFooterWebRemoteControlTooltip)
totalizam **319 testes totalmente verdes**.

### Impacto em multi-dispositivo / controle remoto

Esta alteração afeta apenas a camada de renderer da UI (componentes React + libs que consomem dados
de entitlement / enterprise pricing), não envolve semântica de controle remoto como stream / snapshot /
queue / owner / replayable; as cadeias desktop continuous e celular replayable não são afetadas.

## Correção: zai Team Plan ainda não aparece no seletor de modelo do composer (branch zai de refreshCodingPlanApiKey não passa selectedKeys)

Data: 2026-08-06

### Sintoma

Após a correção da seção anterior 「消费方对称化遗漏」, o badge da sidebar e a página de estatísticas de
uso passaram a exibir o zai team plan, mas **o seletor de modelo do composer ainda não exibia os
modelos team zai** (`modelGroups` como array vazio).

### Causa raiz (confirmada via captura do React fiber por CDP + config.json)

O provider `builtin:zai-coding-plan` tem `enabled: false`, fazendo
`shouldIncludeModelProviderInSelection` → `isModelProviderEnabled(provider)` retornar false → o
provider é filtrado por `filterModelProvidersByEntitlement` → `buildModelSelectGroups` não obtém
`codingPlanProvider` → o grupo de modelos team não pode ser construído.

`enabled` é definido pela validação de availability (`applyCodingPlanAvailabilityToProvider`). A
validação de availability do zai `validateZaiCodingPlanPairAvailability` →
`validateSelectedTeamPlanAvailability("zai", context)` precisa de
`context.modelProviderFamilySelectedKeys` para resolver o selectedKey → consultar o team project →
retornar `available`.

Mas `refreshCodingPlanApiKey` (`modelProviderService.ts:1465`), ao chamar o branch zai, **não passa**
`modelProviderFamilySelectedKeys` (o branch bigmodel passa, o zai não):

```typescript
// 修复前：zai 分支只传 apiClient + credentialService
isZaiCodingPlanProviderId(providerId)
  ? await validateZaiCodingPlanPairAvailability(providers, {
      apiClient,
      credentialService,                    // ← 缺 modelProviderFamilySelectedKeys
    })
  : ...
    ? await validateBigModelCodingPlanPairAvailability(providers, {
        apiClient,
        credentialService,
        modelProviderFamilySelectedKeys: ...,  // ← bigmodel 传了
      })
```

Cadeia: `context.modelProviderFamilySelectedKeys` undefined → `resolveSelectedTeamContext` retorna
null → `validateSelectedTeamPlanAvailability` retorna `{ kind: "unknown" }` → fallback para
`subscription/list` individual → conta de time sem assinatura individual →
`{ kind: "unavailable", reason: "coding_plan_not_entitled" }` → `enabled: false`.

`resolveCodingPlanEntryStatus` (cache de entrada) tem o mesmo bug de omissão no branch zai.

### Correção

Os dois pontos de chamada em `modelProviderService.ts` passam a carregar
`loadProviderRegistryFamilySettings()` uma única vez, com `modelProviderFamilySelectedKeys`
compartilhado entre os branches zai/bigmodel:

- `refreshCodingPlanApiKey` (:1462-1482)
- `resolveCodingPlanEntryStatus` (:1300-1313)

### Testes

`packages/services/test/modelProviderService.test.ts` ganha o teste de regressão
「quando Z.ai tem Team Plan selecionado, atualizar o Coding Plan valida pelo team project e habilita
o provider (alinhado a BigModel)», cobrindo o cenário de team selectedKey zai + team project do
getCustomerInfo. Verificou-se que o teste falha antes da correção e passa depois.

## Correção: após selecionar zai Team Plan, enviar mensagem ainda usa Coding Plan individual (registry de runtime sem projeção de team apiKey)

Data: 2026-08-06

### Sintoma

Após selecionar o zai team plan, com o provider `enabled: true` e o composer permitindo escolher
modelos team, enviar uma mensagem dá erro
`[1113][Insufficient balance or no resource package. Please recharge.]`. Os logs mostram que a
requisição atingiu a **cota do zai coding plan individual**, e não a do projeto de time selecionado.

### Causa raiz

`buildZCodeProviderRegistrySnapshot` (`modelProviderService.ts`) — o snapshot de credenciais de
provider entregue ao agent runtime ao enviar mensagens — só tem a projeção de runtime key de team do
bigmodel (`resolveSelectedBigModelTeamPlanRuntimeApiKey`), **sem implementação equivalente para
zai**:

```text
buildZCodeProviderRegistrySnapshot
  ├─ bigmodelTeamRuntimeApiKey = resolveSelectedBigModelTeamPlanRuntimeApiKey(...)  ✅
  ├─ zaiTeamRuntimeApiKey     = （不存在）                                          ❌
  └─ filter.map(provider):
       bigmodel team 选中 → 覆盖 apiKey = team-ak.team-secret + enabled:true          ✅
       zai team 选中     → 不覆盖 → 仍是个人 coding plan 的空 apiKey / start plan JWT ❌
```

Ao mesmo tempo, em `filterResolvedProviderFamiliesForRegistry` apenas o bigmodel passa
`forceCodingPlan: true` para `pickResolvedFamilyProvider`. Quando zai tem team plan selecionado, o
coding provider (`enabled:false`, pois só é habilitado após a seleção de team) é descartado
antecipadamente por `pickResolvedFamilyProvider`; mesmo que a projeção de runtime key existisse, ela
não obteria o provider → o que é entregue é zai-start-plan / o provider zai individual → usa o saldo
do Coding Plan individual.

Cadeia: o registry entrega o JWT individual de start plan → o agent runtime autentica por ele → atinge
a cota da conta individual → `[1113]` saldo insuficiente.

### Correção (alinhada ao bigmodel em três pontos)

1. **`resolveSelectedZaiTeamContext`**: alinhado a `resolveSelectedBigModelTeamContext`, usa o
   `parseTeamPlanConnectionKeyByFamily("zai", selectedKey)` family-aware para extrair
   `organizationId` / `projectId`.
2. **`resolveSelectedZaiTeamPlanRuntimeApiKey`**: alinhado a
   `resolveSelectedBigModelTeamPlanRuntimeApiKey`, lê `oauth:${ZAI_PROVIDER_ID}:access_token` →
   valida que o JWT zcode não expirou → chama o `getCustomerInfo` no domínio de negócio zai
   (`resolveZaiBusinessBaseUrl` + `createZaiLoginAuthHeaders`) para validar org/projeto →
   `ensureBigModelTeamPlanProjectApiKey` + `copyBigModelTeamPlanProjectApiKeySecret`
   (os caminhos de API de negócio zai/bigmodel são isomórficos, só host/providerId/token diferem) →
   retorna `${apiKey}.${secretKey}`.
3. **Integração em `buildZCodeProviderRegistrySnapshot`**: novos cálculos de `zaiTeamRuntimeApiKey` +
   `selectedZaiTeamContext`; preservation do coding provider zai na fase de filter; na fase de map,
   quando team zai está selecionado, sobrescrever `apiKey` + `enabled: true`.
4. **`filterResolvedProviderFamiliesForRegistry`**: zai também passa
   `forceCodingPlan: Boolean(resolveSelectedZaiTeamContext(familySelectedKeys))`, simétrico ao
   bigmodel.

### Testes

`packages/services/test/modelProviderService.test.ts` ganha o teste de regressão
「quando Z.ai Team Plan está selecionado, o provider registry usa a API Key do projeto de time
(alinhado a BigModel)», cobrindo: team selectedKey zai + mocks de `getCustomerInfo` / `api_keys` /
`api_keys/copy` no domínio de negócio zai, assertando que o registry retorna
`apiKey: { source: "inline", value: "team-ak-zai.team-secret-zai" }`, que
`models[0].disabledReason` é undefined e que o header de authorization de todas as requisições de
negócio é o token zai original.

Validado via stash que o teste falha antes da correção e passa depois. typecheck (sem novos erros nos
arquivos alterados) + lint (0 errors) passaram.

### Impacto em multi-dispositivo / controle remoto

Esta correção afeta apenas a construção do snapshot de credenciais de provider entregue pelo host
process ao agent runtime (`modelProviderService`), não envolve semântica de controle remoto como stream /
snapshot / queue / owner / replayable. As cadeias desktop continuous e celular replayable leem os
providers pelo mesmo `getProviderRegistrySnapshot`; ambas se beneficiam da correção da projeção de
team apiKey do zai, sem alterar seus respectivos limites de entrega.

## Correção: após iniciar com Team Plan, as estatísticas de uso do pacote individual ficam sem credencial

Data: 2026-08-17

### Sintoma e causa raiz

A conta possui simultaneamente pacote individual e Team Plan; quando o App inicia com modo de conexão
Team Plan, 「使用统计」 ainda exibe a origem do pacote individual conforme os direitos da conta, mas a
consulta de uso individual lê apenas o `apiKey` do Coding Plan provider em cache. Na inicialização com
Team Plan esse provider pode não ter a key do pacote individual, e a primeira tentativa de correção,
chamar a atualização genérica de key, continuou incompleta: a resolução da key individual seguiu
"adivinhando" o projeto pelo "nome padrão, senão o primeiro projeto"; quando o projeto de Team Plan vem
primeiro, ela cai no projeto de time com `projectType=2`, onde criar a `zcode-api-key` individual é
rejeitado — após a atualização a key continua vazia e, no fim, lança
`bigmodel_coding_plan_api_key_required` / `zai_coding_plan_api_key_required`.

### Semântica

As estatísticas de uso são uma visão de múltiplas origens no nível da conta; as credenciais devem ser
resolvidas de forma independente conforme a origem clicada pelo usuário:

```text
个人来源（无 organizationId / projectId）
  -> provider apiKey 缺失时刷新该 family 的个人 Coding Plan apiKey
  -> customerInfo 中只从 projectType != 2 的项目解析个人 key
  -> 重新读取 provider 后查询个人用量

团队来源（有 organizationId / projectId）
  -> 继续复制对应组织 + 项目的 Team Plan API Key
  -> 禁止回退个人 provider apiKey
```

A recuperação da credencial individual reutiliza `IModelProviderService.refreshCodingPlanApiKey`, sem
duplicar lógica de OAuth ou troca de API Key dentro do usage provider. Se a atualização falhar, ou se
depois dela ainda não houver key, a semântica de erro original é preservada.

### Limite entre conexão de runtime e origem das estatísticas

As estatísticas de uso são uma visão de múltiplas origens; o pacote individual clicado pelo usuário
não é igual à conexão de runtime atual do modelo. Quando o Team Plan é a conexão atual, o Coding Plan
provider individual é marcado como `enabled=false`, mas ele continua sendo o container de credenciais da
origem individual das estatísticas. Portanto:

```text
明确点击个人统计来源
  -> 精确匹配 preferredProviderId
  -> 允许读取 enabled=false 的个人 provider API Key
  -> 不修改当前 Team Plan 运行连接

模型运行时选择 provider
  -> 继续要求 enabled=true
```

O relaxamento vale apenas para consultas de Coding Plan com origem explicitamente indicada e não pode
alterar a escolha de conexão atual do agent registry.

## Correção: página de estatísticas de uso do zai Team Plan reporta 「无法读取用量统计」 (múltiplos hardcodes bigmodel em bigmodelUsageQuotaProvider)

Data: 2026-08-06

### Sintoma

Com o zai team plan selecionado, provider habilitado, composer permitindo escolher modelos team e o
envio de mensagem indo pelo projeto de time, ao abrir a página 「使用统计」 o painel de Coding Plan
ainda erra: 「无法读取用量统计。请稍后重试，或检查网络和供应商配置。」
Os logs mostram o lançamento de `zai_coding_plan_api_key_required`.

### Causa raiz

`packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts` (provider de consulta de
uso de quota / monitor) tem 4 pontos que só reconhecem `bigmodelCodingPlan`, e o zai coding plan team
plan não entra:

```text
① shouldUseBigModelTeamContext(provider) — 只对 bigmodelCodingPlan 返回 true
   zai coding plan 即使带 org/project 也不进 team 分支
   → teamContext = null → 走个人分支用 provider.apiKey（zai coding plan team 模式下为空）
   → resolveAuthorization 返回 null → throw "zai_coding_plan_api_key_required"

② isProviderSelectableForQuota — 只为 bigmodel team 放宽「apiKey 为空」拦截
   zai team provider 的 apiKey 是运行时投影（不落盘到 provider config），被这里直接过滤掉

③ shouldAllowDisabledBigModelTeamProvider — 同样只认 bigmodel
   zai team 的 disabled provider 不被允许 → pickQuotaProvider 选不到

④ resolveBigModelTeamProjectApiKey — 硬编码 BIGMODEL_OAUTH_ACCESS_TOKEN_KEY + resolveBigModelApiOrigin
   zai team 即使进入此分支也读不到 token（key 名不对）
```

Cadeia: qualquer uma dessas interceptações → `pickQuotaProvider` retorna null, ou a autorização de
team retorna null → `getCodingPlanUsageSnapshot` lança → a UI exibe 「无法读取用量统计」.

### Correção (4 pontos tornados family-aware)

1. `BigModelTeamContext` → `TeamPlanContext`, com o novo campo `family: ProviderFamilyDomain`
2. `shouldUseBigModelTeamContext` + `resolveBigModelTeamContext` → fundidos em
   `resolveTeamPlanContextForProvider(provider, request)`: qualquer coding plan provider
   (`isCodingPlanModelProviderId`) com org/project resolve um team context com family
3. `resolveBigModelTeamProjectApiKey` → `resolveTeamPlanProjectApiKey`: escolhe a key do token OAuth
   por `teamContext.family` (`oauth:zai:access_token` vs `oauth:bigmodel:access_token`) + o domínio de
   negócio (`resolveZaiBusinessBaseUrl` vs `resolveBigModelApiOrigin`). A construção de header
   (`createBigModelBizHeaders`, com `bigmodel-organization`/`bigmodel-project`) já foi verificada como
   isomórfica entre zai/bigmodel e é reutilizada

> **Convenção de token key (crítico)**: a credential key OAuth usa o **OAuth provider id**
> (`ZAI_PROVIDER_ID = "zai"` / `BIGMODEL_PROVIDER_ID = "bigmodel"`), e não o
> **builtin provider id** (`BUILTIN_MODEL_PROVIDER_IDS.zai = "builtin:zai"`).
> A primeira versão da correção usou `BUILTIN_MODEL_PROVIDER_IDS.zai` para montar a key, gerando
> `oauth:builtin:zai:access_token`, enquanto a credential real é armazenada como
> `oauth:zai:access_token` (alinhado a `loadZaiAuthorization`), fazendo o token nunca ser carregado →
> `zai_coding_plan_api_key_required`. Corrigido para `ZAI_PROVIDER_ID`. 4. `shouldAllowDisabledBigModelTeamProvider` → `shouldAllowDisabledTeamProvider`:
> qualquer coding plan provider com org/project de team permite provider disabled 5. `isProviderSelectableForQuota`: quando há org/project de team,
> qualquer coding plan provider tem a interceptação de "apiKey vazio" relaxada (o matching exato por
> preferredProviderId fica por conta de `pickQuotaProvider`)

### Testes

`packages/services/test/usageStatsService.test.ts` ganha 2 testes de regressão de simetria zai:

- 「O uso do Z.ai Team Plan copia a API Key do projeto de time quando a apiKey do provider está vazia
  (alinhado a BigModel)」
- 「O uso do Z.ai Team Plan permite um Coding Plan provider autenticado, mas desabilitado (alinhado a
  BigModel)」

Cobertura: coding plan provider zai + token OAuth zai (`oauth:zai:access_token`, alinhado a
`loadZaiAuthorization`) + domínio de negócio zai (`api.z.ai`) + list/copy de api_keys do projeto de
time + monitor quota/model-usage/tool-usage. Validado via stash: antes da correção os dois testes
falhavam (token key incompatível causando `zai_coding_plan_api_key_required`), depois passam.
Todos os 12 testes do usageStatsService verdes.

typecheck (0 erros no pacote services) + lint (0 errors) passaram.

### Impacto em multi-dispositivo / controle remoto

Esta correção afeta apenas a consulta de estatísticas de uso do host process (`usageStatsService` →
monitor API), não envolve semântica de controle remoto como stream / snapshot / queue / owner /
replayable. As cadeias desktop continuous e celular replayable leem o uso pelo mesmo `usageStatsService`;
ambas se beneficiam da correção da consulta de uso team do zai.

## Correção: o uso de contexto ao lado da caixa de entrada não mostra a cota do zai Team Plan (teamEntitlement com bigmodelCodingPlan hardcoded em V4ComposerToolbar)

Data: 2026-08-06

### Sintoma

Após selecionar o zai team plan, a área 「上下文用量 / 套餐剩余额度」 à esquerda da caixa de entrada
não exibe a quota do zai team plan (fica em branco ou vazia).

### Causa raiz

Em `packages/ui/src/v4/composer/V4ComposerToolbar.tsx` (`V4ComposerModelControls`), o
`preferredProviderId` passado ao hook `teamEntitlement` está hardcoded como `bigmodelCodingPlan`:

```typescript
const teamEntitlement = useUsageEntitlement({
  ...
  preferredProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelCodingPlan, // ← 硬编码
  requirePreferredProvider: true,
  organizationId: contextCodingPlanUsageTeamSource?.organizationId,
  projectId: contextCodingPlanUsageTeamSource?.projectId,
});
```

Quando o zai team plan está selecionado, `contextCodingPlanUsageTeamSource.providerId` já é produzido
corretamente como `zaiCodingPlan` (tratado por family em
`resolveContextTeamUsageSourceFromEntitlementSnapshot` / `resolveV4ContextPlanConnection`), mas aqui
não é acompanhado — continua passando `bigmodelCodingPlan`.

Cadeia: `preferredProviderId=bigmodelCodingPlan` + org/project de team zai →
`pickQuotaProvider` no servidor faz matching exato por `provider.id === preferredProviderId`
(`requirePreferredProvider: true`) → o coding plan provider zai não casa com bigmodelCodingPlan →
retorna null → `resolveAuthorization` retorna null → `teamEntitlement.snapshot` fica vazio → a área de
uso de contexto ao lado da caixa de entrada não mostra a cota team zai.

### Correção

`preferredProviderId` passa a acompanhar `contextCodingPlanUsageTeamSource.providerId`:

```typescript
preferredProviderId:
  contextCodingPlanUsageTeamSource?.providerId ??
  BUILTIN_MODEL_PROVIDER_IDS.bigmodelCodingPlan,
```

`contextCodingPlanUsageTeamSource.providerId` já é produzido corretamente em
`resolveContextTeamUsageSourceFromEntitlementSnapshot` (busca reversa do coding plan provider id por
family) e em `resolveV4ContextPlanConnection` (o branch team zai produz `zaiCodingPlan`), podendo ser
reutilizado diretamente.

### Impacto em multi-dispositivo / controle remoto

Esta correção afeta apenas a camada de renderer da UI (parâmetros de consulta de entitlement do uso de
contexto ao lado da caixa de entrada), não envolve semântica de controle remoto como stream / snapshot /
queue / owner / replayable; as cadeias desktop e celular não são afetadas.

## Riscos

| Risco                                                                          | Mitigação                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Comportamento real das interfaces enterprise do backend zai desconhecido~~  | ✅ Verificado: `getCustomerInfo` no `api.z.ai` de teste com sucesso, estrutura isomórfica à do bigmodel; o fluxo de injeção (list + POST create `zcode-team-api-key`) já foi reutilizado em zai, visível nos logs de prewarm. A criação via POST na conta de teste foi rejeitada (grant faltando), o que é um problema do backend e não exige mudança de código |
| ~~useEffect de limpeza duplicado em ModelProviderSection (anomalia)~~           | ✅ Mesclado em um único effect family-aware                                                                                                                                                                                                |
| ~~Exclusão explícita `providerFamily !== "zai"` em `WorkspaceSidebarFooterUsageSummary`~~ | ✅ Corrigido: os três consumidores — badge da sidebar / seletor de modelo do composer / página de estatísticas de uso — foram todos simetrizados (ver a seção 「消费方对称化遗漏」 acima)                                                                                     |
| Checkpoints com literal de prefixo esquecidos                          | grep em todos os literais `team-plan:` avaliados um a um, com cobertura dos caminhos principais                                                                                                                                                                           |

## Correção: o zai coding plan provider não é persistido (simetrização do fallback de endpoint)

Data: 2026-08-05

### Sintoma

Após um login OAuth zai bem-sucedido, o Plan Card na página de configurações continuava exibindo
「未连接」. Lendo `config.json` diretamente, o provider `builtin:zai-coding-plan` não existe, enquanto
`builtin:bigmodel-coding-plan` existe normalmente.

### Causa raiz

A resolução de endpoint em `loadSinglePresetProvider`
(`packages/services/src/model-provider/repo/oauthPresetProviderRepo.ts`) é ** assimétrica**:

```text
oauthProvider === BIGMODEL_PROVIDER_ID
  ? buildBigModelCodingPlanAnthropicEndpoints(matchedProviders)  // ✅ 内部带兜底域名
  : collectSchemaEndpoints(matchedProviders)                     // ❌ 无兜底
```

- bigmodel: `buildBigModelCodingPlanAnthropicEndpoints` →
  `resolveBigModelCodingPlanAnthropicBaseUrl` tem o fallback hardcoded
  `https://open.bigmodel.cn/api/anthropic`, permitindo construir o endpoint mesmo sem baseUrl vindo do
  remote.
- zai: `collectSchemaEndpoints` dá `continue` direto quando `baseUrl` está vazio
  (`oauthPresetProviderRepoShared.ts`), retornando endpoint vazio →
  `getModelProviderEndpointKinds(endpoints).length === 0` → `loadSinglePresetProvider` retorna null →
  `builtin:zai-coding-plan` nunca é persistido.

A UI, em `resolveCodingPlanEntitlementState`, tem `hasCodingPlanProvider=false` → exibe 「未连接」.

### Correção (totalmente simétrica ao bigmodel)

Novo trio zai em
`packages/services/src/model-provider/repo/oauthPresetProviderRepoShared.ts`:

1. `resolveZaiCodingPlanAnthropicBaseUrl(env)` → `${resolveZaiBusinessBaseUrl(env)}/api/anthropic`
   (teste `api.z.ai` / produção `api.z.ai`, igual ao domínio em runtime do provider API Key
   builtin:zai)
2. `normalizeZaiCodingPlanAnthropicBaseUrlForEnv(baseUrl, env)`: baseUrl do remote tem prioridade,
   com fallback quando ausente ou inválido; acrescenta uma camada de validação de legalidade com
   `new URL()` (`normalizeModelProviderBaseUrlForKind` não intercepta texto puro)
3. `buildZaiCodingPlanAnthropicEndpoints(providers)`: anthropic baseUrl do remote tem prioridade, senão
   o fallback; paths usam `/v1/messages`

Mudança do branch de endpoint em
`packages/services/src/model-provider/repo/oauthPresetProviderRepo.ts`:

```typescript
const endpoints =
  oauthProvider === BIGMODEL_PROVIDER_ID
    ? buildBigModelCodingPlanAnthropicEndpoints(matchedProviders)
    : buildZaiCodingPlanAnthropicEndpoints(matchedProviders); // 从 collectSchemaEndpoints 换过来
```

(`oauthProvider` tem, nesta função, apenas os valores `BIGMODEL_PROVIDER_ID` / `ZAI_PROVIDER_ID`, e
ambos são coding plan provider.)

### Testes

`packages/services/test/oauthPresetProviderRepoSharedZai.test.ts` (7 testes verdes) cobre: prioridade
do baseUrl do remote, fallback quando falta baseUrl, retorno ao fallback em URL inválida, resolução de
ambiente e simetria com o bigmodel.

### Impacto em multi-dispositivo / controle remoto

Esta correção afeta apenas a camada de persistência de provider (escrita local em config.json), não
envolve semântica de controle remoto como stream / snapshot / queue / owner / replayable; as cadeias
desktop continuous e celular replayable não são afetadas.

## Equivalência de tipo de quota limit (CREDIT_LIMIT ↔ TOKENS_LIMIT)

### Sintoma

Após selecionar o zai Team Plan, o cartão de quota 「5 小时 / 每周」 na página de estatísticas de uso
fica em branco; o uso de contexto no composer e o popover Usage Remaining também não mostram cota. A
interface de monitor `getCodingPlanUsageSnapshot` retorna OK, mas a UI não casa nenhum limit.

### Causa raiz (confirmada por logs de runtime)

O limit `type` retornado por `/api/monitor/usage/quota/limit?type=2` do Team Plan no backend de negócio
zai é `CREDIT_LIMIT`, enquanto no backend de negócio bigmodel é `TOKENS_LIMIT`. A semântica de
`unit/number` é idêntica nos dois:

| Cartão         | Condição de consulta  | bigmodel retorna  | zai retorna               |
| ------------ | ------------------ | -------------- | ---------------------- |
| 5 小时       | `unit=3, number=5` | `TOKENS_LIMIT` | `CREDIT_LIMIT`         |
| 每周         | `unit=6`           | `TOKENS_LIMIT` | `CREDIT_LIMIT`         |
| 工具（每月） | `unit=5, number=1` | `TIME_LIMIT`   | （zai 测试账号未返回） |

Quatro consumidores (`CodingPlanUsagePanel` / `CodingPlanContextUsage` /
`CodingPlanUsageRemainingPanel` / `StatusCards`) tinham matching exato preso a
`TOKENS_LIMIT`/`TIME_LIMIT`; com zai retornando `CREDIT_LIMIT` todos davam miss → o cartão de quota não
é renderizado.

### Correção

Novo conjunto de types equivalentes e classificação em
`packages/ui/src/lib/codingPlanQuotaPresentation.ts`:

```typescript
const TOKEN_LIMIT_TYPES = new Set(["TOKENS_LIMIT", "CREDIT_LIMIT"]);
const TOOL_LIMIT_TYPES = new Set(["TIME_LIMIT"]);

export function isSameLimitCategory(limitType, queryType): boolean {
  if (limitType === queryType) return true;
  if (TOKEN_LIMIT_TYPES.has(queryType)) return TOKEN_LIMIT_TYPES.has(limitType);
  if (TOOL_LIMIT_TYPES.has(queryType)) return TOOL_LIMIT_TYPES.has(limitType);
  return false;
}
```

- `findCodingPlanQuotaLimit` passa a usar `isSameLimitCategory`; `unit/number` continua com matching
  exato. Cobre `CodingPlanUsagePanel` / `CodingPlanContextUsage` /
  `CodingPlanUsageRemainingPanel`.
- O `findUsageLimit` de escopo de arquivo em `StatusCards.tsx` também passa a usar o
  `isSameLimitCategory` exportado, mantendo consistência com o anterior (antes contava com o fallback
  `isDisplayableUsageLimit`; agora até os cartões exatos casam).

### Nota de design

O uso de `CREDIT_LIMIT` pelo backend zai é o comportamento atual em produção (api.z.ai / api.z.ai).
Sob a expectativa de produto de que "deveria ser igual ao bigmodel", `CREDIT_LIMIT` é considerado uma
nomenclatura histórica a ser alinhada no backend zai; com o matching equivalente nos consumidores, se
o backend zai migrar depois para `TOKENS_LIMIT` de forma unificada, a UI não precisará mudar.
A semântica de unit/number é um contrato estável; a diferença no enum de type é absorvida pelo
conjunto de equivalência.

### Testes

`packages/ui/test/codingPlanUsagePanel.test.ts` ganha 2 testes:

- `CREDIT_LIMIT` do zai casa por equivalência em consulta a `TOKENS_LIMIT` (5h / weekly), retornando
  null para itens ausentes
- O comportamento original de `TOKENS_LIMIT`/`TIME_LIMIT` do bigmodel permanece, e `CREDIT_LIMIT` não
  casa por engano com consulta de `TIME_LIMIT`

### Impacto em multi-dispositivo / controle remoto

Lógica de matching de limit puramente na camada de UI, sem envolver a semântica de stream / snapshot / queue /
owner / replayable.

## Documentos relacionados

- `docs/coding-plan-enterprise.md` — ciclo de compra do plano de programação corporate (situação atual
  do bigmodel)
- `docs/input-model-provider-team-plan-linkage.md` — cadeia modelo/Provider/Team Plan da caixa de
  entrada
- `docs/coding-plan-purchase-panel-flow.md` — fluxo do painel de compra
- `docs/model-provider-coding-plan-availability.md` — cálculo de disponibilidade do Coding Plan