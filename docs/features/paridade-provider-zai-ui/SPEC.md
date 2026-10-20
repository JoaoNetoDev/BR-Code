# SPEC — Paridade de provedor na UI: remoção do tratamento preferencial de Z.ai / BigModel (GLM)

- **Status:** Rascunho para aprovação
- **Data:** 2026-10-18
- **PRD de referência:** `docs/features/paridade-provider-zai-ui/PRD.md`
- **TECH de referência:** `docs/features/paridade-provider-zai-ui/TECH.md`
- **Fronteira:** exclusivamente `packages/ui`. Nenhuma mudança em `packages/shared`, `packages/services`, `packages/desktop`, `packages/server` ou `apps/zcode-cli`.

> **Nota de verificação:** todos os caminhos, assinaturas e números de linha citados abaixo foram relidos nos arquivos reais em `packages/ui` na data desta spec. Divergências em relação ao TECH foram corrigidas (ex.: `CodingPlanUpgradeDialog.tsx` e `CodingPlanUpgradeDialogProvider.tsx` ficam em `packages/ui/src/settings/`, não em `model-provider-section/`; `ModelProviderSection.tsx` fica em `packages/ui/src/settings/`; `Detail.tsx` fica em `packages/ui/src/settings/model-provider-section/`; `useCodingPlanEntitlements.ts` fica em `packages/ui/src/settings/model-provider-section/`).

---

## 1. Resumo e escopo

### 1.1 Resumo

A UI trata Z.ai (`zai`) e BigModel (`bigmodel`) como provedores preferenciais: botões OAuth dedicados na welcome screen com ordenação fixa (zai=0, bigmodel=1), login OAuth a partir das settings, cards de preço/promoção/saldo do Coding Plan, banners e toques de marketing com claim de plano (`claim_zcode_plan`), recomendações proativas de Start Plan (inclusive troca de modelo de subagente) e resolução de entitlement/usage com `preferredProviderId` apontando para esses provedores.

Esta spec define a **remoção completa** desse tratamento preferencial e de todas as ofertas, mantendo Z.ai/BigModel configuráveis via API key como qualquer outro provedor. A mudança é **destrutiva-aditiva**: superfícies que dependem do ecossistema Coding Plan/preferred-provider são **removidas, não reescritas** (PRD RF-10); o caminho genérico de usage por API key (`AppUsagePanel` → `useAppUsageStats` → `usageStatsService`) permanece intacto.

### 1.2 Em escopo

- Welcome screen: remoção integral do modo de login OAuth (RF-01–RF-04).
- Settings: remoção de login OAuth para presets, cards de preço/saldo/promo, preview, purchase auth, produtos enterprise, hints de BigModel (RF-05–RF-08, RF-12b).
- Entitlement/usage: remoção do ecossistema preferred-provider em toda a UI (RF-09–RF-10).
- Marketing: remoção dos caminhos de claim de plano, recomendações de plano, badges de connection mode e superfícies de upgrade/compra (RF-11, RF-12, RF-12a, RF-12b).
- i18n: limpeza de strings órfãs em `en-US.ts` e `zh-CN.ts` (RF-15).
- Telemetria: remoção de emissores que só os componentes removidos disparavam; um único evento de migração `zai_ui_parity_surface` por 1 release (RNF-03).

### 1.3 Fora de escopo (confirmado intacto)

- `packages/shared/src/oauth.ts` (somente leitura do tipo `OAuthProviderId` em :56-59) e todo o protocolo compartilhado, incl. `official-glm-model-id.ts`.
- `packages/services/src/oauth/*` e `packages/services/src/coding-plan-subscription/*`.
- `apps/zcode-cli/packages/cli/src/login-command.ts` (`zcode login`, default "zai").
- Desktop main/host e servidor web.
- Ecossistema quota-reset do Coding Plan (`hooks/useCodingPlanQuotaResetUi.ts` e arquivos `codingPlanQuotaReset*` + seus ~8 testes) — **fora de escopo**, e é consumidor sobrevivente de `useStableAccountAccess` (ver §4.3).
- Backend de marketing: as ofertas podem continuar sendo entregues; a UI apenas não as renderiza nem aciona.

### 1.4 Faseamento (do PRD §7, mantido)

- **Fase 1 — núcleo de paridade:** RF-01–RF-04, RF-09–RF-10, RF-13.
- **Fase 2 — remoção de ofertas:** RF-11, RF-12, RF-12a, RF-12b, RF-05–RF-08.
- **Fase 3 — limpeza:** RF-14, RF-15, telemetria de migração, fixtures/E2E.

Gates por fase: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, `pnpm knip` e testes do §7 verdes.

---

## 2. Desenho detalhado por componente (assinaturas verificadas)

### 2.1 Welcome screen — `packages/ui/src/WelcomeScreen.tsx`

Assinaturas e símbolos atuais confirmados no arquivo:

- `export type LoginCompleteReason = "oauth" | "apiKey" | "skip"` (:34)
- `export function WelcomeScreen({ onComplete }: WelcomeScreenProps)` (:36)
- `export function shouldCompleteProviderLoginAttempt(params: {...})` (:60) — **permanece** (também cobre o fluxo API key)
- `export function shouldCompleteLoginFromExistingUser(params: {...})` (:67) — **permanece** se consumido pelo fluxo API key; confirmar com grep/`dep:refs`
- `export function LoginPanel({ active, onComplete }: LoginPanelProps)` (:74) — **permanece**, com `loginMode` (:95) deixando de ter o estado `"providers"` e inicializando em `"entry"`, uma tela de entrada que só oferece a API key (decisão do dono: o botão de entrada sobrevive porque é a única porta de entrada e é exercitado pelos E2E)
- `const startTrackedLogin = useCallback(...)` (:114) — **remover**
- `function getLoginOAuthButtonMessageId(providerId: string): string` (:491) — **remover**
- `function getLoginOAuthRegionTagMessageId(providerId: string): string | null` (:502) — **remover**
- `function LoginOAuthRegionTag({ providerId }: { providerId: string })` (:513) — **remover**
- `function getProviderPriority(provider: OAuthProviderMeta): number` (:528) — **remover**
- `export function resolveVisibleLoginProviders(providers: OAuthProviderMeta[]): OAuthProviderMeta[]` (:542) — **remover**
- `export function resolveLoginRetryProvider({...})` (:550) — **remover**
- Testids `TID_OAUTH_CANCEL`, `TID_OAUTH_ERROR`, `TID_OAUTH_LOGIN_BUTTON` (imports :13-15) e ramos `status === "waiting"` (:374-398) / `status === "error"` (:400-451) — **remover**
- Imports de `ZAI_PROVIDER_ID`/`BIGMODEL_PROVIDER_ID` (:11, :16) — **remover** com o resto
- `packages/ui/src/hooks/useOAuth.ts`: `export function useOAuth()` (:25; chama `oauthService.startOAuthWithPolling(provider)` em :83) — **deletar**; único consumidor é `WelcomeScreen.tsx` (grep verificado)

Sobrevive: o branch `loginMode === "apiKey"` com `LoginApiKeyForm` (:360-372) e o botão "use API key" (:344-354). A welcome screen abre numa tela de entrada de API key — sem seleção de canal, sem OAuth e sem fetch de providers —, e o clique no botão abre o formulário.

### 2.2 Settings — OAuth de presets — `packages/ui/src/settings/model-provider-section/oauthActions.ts`

Assinaturas atuais:

- `export async function startPresetSubscriptionLogin(params: {...})` (:10)
- `export async function reportPresetSubscriptionSuccess(params: {...})` (:38), que emite `add_model_success` com `login_default: "1"` (:38-55)

Consumo real (grep verificado): `reportPresetSubscriptionSuccess` é importado apenas por `settings/ModelProviderSection.tsx` (:46, chamada em :637); `startPresetSubscriptionLogin` **não tem consumidor** em `packages/ui/src`. **Arquivo deletado inteiro**, junto com o bloco de conclusão de assinatura de `ModelProviderSection.tsx` (:625-650) e com `resolveOAuthProviderIdByPreset` em `settings/model-provider-section/utils.tsx:23` (único consumidor era `oauthActions.ts`; confirmar com `pnpm dep:refs` antes de deletar).

### 2.3 Settings — cards/preço/saldo/promo de Coding Plan

- `settings/model-provider-section/codingPlanPricingCards.ts`: `export type CodingPlanLoginOptions` (:8), `export function resolveCodingPlanUpgradeProductsProviderId(...)` (:12) — **deletar**; com ele, o import em `settings/ModelProviderSection.tsx:46` sai.
- `settings/model-provider-section/useCodingPlanProducts.ts`: `export const ZAI_START_FREE_PRODUCT_ID` (:35), `export function useCodingPlanProducts(...)` (:59), helpers `loadCodingPlanProductsForTest` (:174), `loadCodingPlanStaticProductsSnapshotForTest` (:223), `resolveCodingPlanProductsFailureSnapshot` (:238), `clearCodingPlanProductsCacheForTest` (:245), `isZaiStartFreeProductId` (:367), `loadCodingPlanStaticProductListForTest` (:417), `normalizeErrorMessage` (:547), `isCodingPlanOAuthRequiredError` (:562), `isCodingPlanSystemBusyError` (:571) — **deletar** (antes confirmar por `dep:refs` que nenhum helper é consumido fora do conjunto).
- `settings/model-provider-section/StartPlanBalanceCard.tsx`, `StartPlanCard.tsx`, `StartPlanQuotaStatusCard.tsx` — **deletar**.
- `settings/model-provider-section/useStartPlanPreview.ts`: `export function useStartPlanPreview(options?: { enabled?: boolean })` (:17) + helpers de cache de teste (:83, :88) — **deletar**; `settings/model-provider-section/StatusCards.tsx` (:50, :333) perde o branch Start Plan preview e mantém o card genérico.
- `settings/model-provider-section/codingPlanPurchaseAuth.ts`: `export type CodingPlanPurchaseAuthStatus` (:11), `isCodingPlanPurchaseAuthPending` (:18), `readCodingPlanPurchaseTokenState` (:22), `normalizeCodingPlanProviderId` (:46), `isCodingPlanProviderId` (:55), `resolveCodingPlanOAuthProviderId` (:61) — **deletar** (verificar se nenhum helper sobrevivente usa; `dep:refs` fecha).
- `settings/model-provider-section/enterpriseCodingPlanProducts.ts` + `useEnterpriseCodingPlanProducts.ts` (catálogo e hook de produtos enterprise) — **deletar**.
- `settings/CodingPlanUpgradeDialog.tsx` e `settings/CodingPlanUpgradeDialogProvider.tsx` (exporta `useCodingPlanUpgradeDialog`/`useOptionalCodingPlanUpgradeDialog`) — **deletar**; consumidores ajustados: `SettingsPage.tsx` (:65, :605, :659-664), `WorkspaceSidebar.tsx` (:137), `components/marketing-touch/MarketingTouchProvider.tsx` (:10, :66, :175, :318), `settings/CodingPlanEntryButton.tsx` (:4, :7 — botão-CTA, deletado junto), `settings/AutomationsSection.tsx` (:100, :534, :855-864).
- `settings/model-provider-section/BigModelRegistrationHint.tsx` — **remover o componente específico de BigModel** (RF-08); generalizar hint de "obter API key" para qualquer preset por API key que o declare (PRD Q5), sem menção preferencial.

### 2.4 Entitlement / usage — ecossistema preferred-provider

- `packages/ui/src/SettingsPage.tsx`: blocos `usageZai*`/`usageBigmodel*` (:408-437 — providers, `resolveEntitledAccountProviderAccess`, fingerprints individuais e de team), os dois `useUsageEntitlement({...})` com `preferredProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan` (:438-454) e `...bigmodelIndividualCodingPlan` (:455-463+), ambos com `requirePreferredProvider: true`/`allowDisabledPreferredProvider: true`, e as passagens adiante em :512/:517 — **remover**.
- `packages/ui/src/hooks/useUsageEntitlement.ts`: `USAGE_ENTITLEMENT_REFRESH_TIMEOUT_MS` (:45), `UsageEntitlementRefreshOptions` (:47), `withUsageEntitlementTimeout<T>` (:117), `UseUsageEntitlementOptions` (:135), `useUsageEntitlement(options?)` (:148), `useUsageEntitlementWithService(...)` (:153) — **deletar somente após** consumidores zerarem (ver §4.1).
- `packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx` (usado por `SettingsPage.tsx:71`; `preferredProviderId` zai em :134, bigmodel em :152, bloco :169-171) — **deletar inteiro**.
- `packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx` — **deletar** (superfície dependente de `useStableAccountAccess` + entitlement Coding Plan; RF-10: remove-se, não se reescreve). `WorkspaceSidebarFooter.tsx` perde o ponto de montagem e mantém o que for genérico.
- `packages/ui/src/chat-input-toolbar/CodingPlanContextUsage.tsx` (uso de `useCodingPlanQuotaResetUi` com `preferredProviderId` em :215) — **deletar**; `contextUsage.tsx` mantém o breakdown genérico de API key.
- `packages/ui/src/chat-input-toolbar/StartPlanContextBalance.tsx` — **deletar** (card de saldo Start Plan na toolbar do chat, RF-07).
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx` e `packages/ui/src/v4/SessionPane.tsx` — remover os pontos de consumo do ecossistema (usage Coding Plan, plano, montagem do banner de quota; SessionPane :1754/:2490/:2525 para recomendações e :135/:3130 para `resolveEntitledAccountProviderAccess`).
- `packages/ui/src/v4/useV4SessionQuotaBanner.ts`: `export function useV4SessionQuotaBanner(params: {...})` (:46), `isGlmQuotaBannerProviderId` comparando contra `zaiIndividualCodingPlan`/`zaiStartPlan`/`bigmodelIndividualCodingPlan`/`bigmodelStartPlan` (:31-35 verificados) e `useUsageEntitlementWithService` com `preferredProviderId: upgradeProviderId` + `requirePreferredProvider: true` (:186-188 verificados) — **deletar**, junto com `v4/ConversationQuotaBanner.tsx` (que ele alimenta) e os stores de dismissal `v4/sessionQuotaBannerDismissalStore.ts` e `v4/startPlanQuotaReminderStore.ts` (consumidores: apenas `useV4SessionQuotaBanner.ts`, confirmado por grep).
- **Caminho que permanece intocado:** `settings/usage-stats/AppUsagePanel.tsx` (:37-38) → `useAppUsageStats` (`hooks/useUsageStats.ts:191-206`) → `usageStatsService`, sem preferred provider. `hooks/useUsageStats.ts` **sobrevive** (usa `useStableAccountAccess` em :14, :89, :271) — no máximo ajustes cirúrgicos de imports mortos.
- `hooks/usePlanIdentitySnapshot.ts` (`export function usePlanIdentitySnapshot(...)` :20; consumidor externo único: `v4/SessionPane.tsx`, refs :12/:40/:67) — **deletar junto** com o conjunto.
- `lib/startPlanEntitlementOptions.ts` (`export function buildStartPlanEntitlementOptions(...)` :8; consumidores: `usePlanIdentitySnapshot`, `useStartPlanEntitlement`, `useStartPlanRecommendation`, `useCodingPlanEntitlements`, `useV4SessionQuotaBanner` — todos removidos) — **deletar**.
- `lib/accountProviderAccess.ts`: `EntitledAccountProviderAccess` (:4), `resolveEntitledAccountProviderAccess` (:10), `resolveEntitledAccountProviderAccessFingerprint` (:31), `resolveAccountProviderInspectionAccess` (:43) — **deletar somente se**, após os ajustes de `SettingsPage.tsx`, `ModelProviderSection.tsx` (:29, :628, bloco :625-650) e `SessionPane.tsx` (:135, :3130), o `dep:refs` zerar (há teste dedicado `test/accountProviderAccess.test.ts` a remover junto).

### 2.5 Marketing / ofertas

- `components/marketing-touch/MarketingTouchProvider.tsx`: remover o branch de execução da ação `claim_zcode_plan` (:250-295, incluindo `prepareRequestVerificationClaim` e `services.codingPlanSubscriptionService.claimManualPlan`), o `useRequestVerificationPrewarm` no `ConnectedBanner` (:365-372) e `openCodingPlanUpgrade` das dependências (:318) e do handler de clique (:175). **Manter**: poller, banner de imagem e ação neutra `open_url` (PRD Q4). **Handler pós-remoção:** toque com `action.type === "claim_zcode_plan"` é **ignorado silenciosamente com log `debug`** (sem warn/error, sem UI), atendendo o Risco R3 do PRD.
- `components/marketing-touch/MarketingDialogs.tsx`: **alterar, não deletar** (decisão do dono, F-03-1): a premissa original do R24 ("diálogos de dismiss/sucesso/falha do claim") é factualmente falsa — após remover o branch de claim, o arquivo contém apenas o `CloudContentDialog` neutro, consumido por ~15 E2E de entrega de marketing. Remove-se dele o `MarketingFailureDialog` e o handler `claim_plan`; o diálogo neutro permanece. O CA-11 passa a exigir a ausência dos diálogos de claim, não a ausência do arquivo.
- `components/marketing-touch/useMarketingTaskCompletionRefresh.ts`: `export const MarketingRefreshContext` (:10), `export function useMarketingTaskCompletionRefresh({...})` (:13) — **deletar**; consumidores: `App.tsx` (:68, :286) e `MarketingTouchProvider.tsx`, só fluxo de claim (revalidar com `dep:refs` antes de deletar).
- `components/manual-claim-plan/manualClaimFailureMessage.ts` (`resolveManualClaimFailureMessageId` :2) e `manualClaimPlanStartUsing.ts` (`ManualClaimPlanStartUsingTarget` :3, `ManualClaimPlanStartUsingTargetResult` :10, `resolveManualClaimPlanStartUsingTarget` :21) — **deletar o diretório**.
- `request-security-edition/claim.ts` — **deletar** (stub confirmado: `useRequestVerificationPrewarm` não-op e `prepareRequestVerificationClaim` retorna `{}`; ~11 linhas). `request-security-edition/messages.ts` **permanece** (importado pelos locales).
- `components/marketing-touch/marketingTouchController.ts`: remover os ramais `claim_zcode_plan` — a checagem de `errorAction === "claim_zcode_plan"` que trava `showPending()` (:209) e o branch de terminalidade em `run` (:236, junto com `open_url`, que permanece) — mantendo `open_url` e as demais ações neutras. Com o handler de execução fora do provider (A17), um toque `claim_zcode_plan` cai no caminho de ação não suportada (log `debug` silencioso, §3.3).
- `components/marketing-touch/useMarketingBannerVisible.ts`: `export function useMarketingBannerVisible(): boolean` (:12) — **alterar** para refletir a ausência do claim (banner só existe para imagens/`open_url`); **mudança atômica em conjunto** com `sidebar-activity/SidebarBottomActivity.tsx` (:1, :19-20, consumidor do predicado e de `MarketingBanner`) — com o claim fora, o slot da sidebar exibe apenas o fallback highspeed (`GlobalNoticeSurface`).
- Recomendações de plano: `hooks/useStartPlanRecommendation.ts` — `export function useStartPlanRecommendation(view: ModelSelectionView | null | undefined, surface?: "subagent")` (:19) — **deletar**; pontos de uso: `settings/SubagentsSection.tsx` (:2, :609, :674, :817, :1008), `settings/AutomationEditView.tsx` (import :2, chamada :1770), `v4/SessionPane.tsx` (:1754, :2490, :2525). **A troca manual de modelo permanece.**
- `hooks/useStartPlanEntitlement.ts` — `export function useStartPlanEntitlement(providerId: string, service: IUsageStatsService | undefined, refreshOnAccess = false)` (:7) — **deletar** (único consumidor: `MarketingTouchProvider.tsx`).
- Badges de connection mode (RF-12a): remover as passagens em `AutomationEditView.tsx:1494-1505` e `SubagentsSection.tsx:1320-1321` (`connectionMode.startPlan`/`startPlanBadge`/`codingPlanBadge`).

### 2.6 i18n — `packages/ui/src/i18n/locales/en-US.ts` e `zh-CN.ts`

Únicos locales do pacote (verificado: `i18n/locales/` contém só `en-US.ts` e `zh-CN.ts`). Blocos a remover (chaves confirmadas):

| Bloco | en-US.ts | zh-CN.ts | RF |
|---|---|---|---|
| `startPlan.recommendation.*` (7 chaves) | :4-13 | :4-11 | RF-12 |
| `manualClaimPlan.*` (banner, claim, dismiss, share; última chave `manualClaimPlan.claim.share.twitterTextLabel`) | :226-283 | espelho (localizar por grep `manualClaimPlan.`) | RF-11 |
| `login.oauth.*` (`activeProviderHint`, `loadingProviders`, `noProviders`, `button`, `button.zai`, `button.bigmodel`, `regionTag.zai`, `regionTag.bigmodel`, `waiting`, `loginFailure`, `cancel`, `retry`) | :982-995 | espelho | RF-01–RF-03 |
| `settings.modelProvider.connectionMode.startPlan*` / `startPlanBadge` / `codingPlanBadge` | referenciados em `AutomationEditView.tsx:1494-1505` / `SubagentsSection.tsx:1320-1321` | espelho | RF-12a |
| `settings.modelProvider.codingPlan.start.*` (`loginEnable`, `loginTrial` "Connect Z.ai", `enabled`, `freeBadge`, `freeEquityTitle`, `freeEquityDetails`), `paymentDialog.*`, `product.firstPromo` e adjacentes de upgrade/compra | :3416-3426 e :3649-3653 + adjacentes | espelho | RF-06, RF-12b |

Processo: remover código primeiro, rodar a checagem de chaves não usadas do pacote de i18n, então apagar os blocos em **ambos** os locales. Nenhuma chave nova é criada; estados vazios reutilizam chaves genéricas existentes.

### 2.7 Telemetria — `packages/ui/src/lib/appTelemetry.ts`

- **Removidos junto com os emissores:** `add_model_success` com `login_default: "1"` (`oauthActions.ts:38-55`) e eventos de funil de Coding Plan atrelados aos componentes removidos (ex.: cobertos por `test/codingPlanFunnelTelemetry.test.ts`, `test/planUsageArmsTelemetry.test.ts`).
- **Mantidos:** eventos genéricos de configuração de provider por API key.
- **Handler pós-remoção:** `claim_zcode_plan` ignorado com log `debug` no `MarketingTouchProvider` (§2.5).
- **Único evento novo:** `zai_ui_parity_surface` (tipo `pv`), emitido via `reportAppTelemetryEvent` existente em `lib/appTelemetry.ts`, com campo de desfecho (superfície visível + configuração de provider via API key concluída na mesma sessão). Vive exatamente 1 release; remoção agendada na Fase 3 da release seguinte (nota de código em chinês explicando a expiração).

---

## 3. Fluxos

### 3.1 Fluxo principal — usuário novo configura provedor (C1/C2)

1. Usuário abre o app → welcome screen renderiza `LoginPanel` em `loginMode === "entry"`, mostrando apenas o botão de API key (sem estado `"providers"`, sem fetch de providers OAuth, sem `getProviderPriority`); o clique abre `loginMode === "apiKey"`.
2. Usuário clica no fluxo de API key → `LoginApiKeyForm` (:360-372) abre.
3. Usuário escolhe Z.ai (ou BigModel, ou qualquer provedor) na lista — mesma lista, mesmos cards, mesma validação e mesma ordenação de qualquer provedor por chave (RF-13).
4. Se o preset declarar URL de registro, o hint generalizado (ex-`BigModelRegistrationHint`) oferece o link neutro "obter API key" (Q5).
5. Usuário salva a chave → `providerSettingsService` (dono das credenciais) persiste → evento genérico de provider configurado é emitido (mantido) → `WelcomeScreen` completa via `shouldCompleteProviderLoginAttempt` com razão `"apiKey"`.
6. Telemetria de migração: `zai_ui_parity_surface` registra superfície visível + desfecho "configuração concluída na sessão" (RNF-03).

### 3.2 Fluxo de usage pós-configuração (C3)

1. Usuário abre a aba usage nas settings.
2. `SettingsPage` **não** mais monta os probes `usageZai*`/`usageBigmodel*` nem chama `useUsageEntitlement` com preferred provider — zero fetch fantasma no mount (RNF-01).
3. A usage exibida é a do `AppUsagePanel` (caminho API-key genérico, `useAppUsageStats` → `usageStatsService`).
4. Sem nenhum provedor configurado: estado neutro/vazio com texto acessível (RNF-02, R5 do PRD).

### 3.3 Fluxo de erro — toque de marketing `claim_zcode_plan` chegando pós-remoção (R3)

1. Backend (intocado) entrega um toque com `action.type === "claim_zcode_plan"`.
2. O poller do `MarketingTouchProvider` recebe e o controller avalia a ação.
3. **Não existe mais handler** para `claim_zcode_plan`: a ação cai no caminho de ação não suportada, que é **ignorada silenciosamente com log `debug`** (sem `warn`, sem `error`, sem toast, sem diálogo, sem região aria-live órfã).
4. O toque não renderiza banner nem diálogo; `useMarketingBannerVisible` retorna `false` para esse toque e o slot da sidebar (`SidebarBottomActivity`) exibe o fallback highspeed.
5. Ações neutras (`open_url`) e banners de imagem continuam funcionando normalmente (Q4).

### 3.4 Fluxo de erro — provider `account:zai-*` configurado sem OAuth UI (C2/C4)

1. Usuário tem `account:zai-*`/bigmodel configurado via API key (ou chega de preferência legada, ver §4.2).
2. Welcome screen e settings **não** oferecem botão OAuth para esses providers — não existem mais ramificações por provider id em `WelcomeScreen.tsx` nem `resolveOAuthProviderIdByPreset` nas settings.
3. Nenhum caminho de UI invoca `startOAuth`/serviços de Coding Plan para o provider (RF-14); a settings mostra o provider como card comum por API key, com status de conexão via caminho genérico existente.
4. Usuário que quiser OAuth usa `zcode login` no CLI (fora da UI, permanece funcional) — a UI não oferece o caminho, mas não o impede.

### 3.5 Fluxo de erro — falha de claim em voo durante upgrade (transição)

1. Usuário tinha diálogo/banner de claim aberto na versão anterior; após a atualização, os diálogos de claim (`manual-claim-plan/`, `claim.ts`, o `MarketingFailureDialog` e o handler `claim_plan`) não existem; o diálogo neutro de marketing continua disponível.
2. Qualquer estado persistido de dismissal/reminder (`sessionQuotaBannerDismissalStore`, `startPlanQuotaReminderStore`) é deletado junto com seus leitores; grep de fechamento da Fase 2 confirma que nenhum código remanescente lê esses stores (R-T5).

---

## 4. Casos de borda

### 4.1 Concorrência e ordem de deleção (grafo de dependências)

- `useUsageEntitlement`/`useUsageEntitlementWithService` só podem ser deletados **depois** de zerarem consumidores: `SettingsPage.tsx`, `CodingPlanUsagePanel.tsx`, `useV4SessionQuotaBanner.ts`, `packages/ui/src/settings/model-provider-section/useCodingPlanEntitlements.ts` (`resolveCodingPlanProviderFingerprintAutoRefresh` :20, `useCodingPlanAccessRefresh` :153, `useCodingPlanEntitlements` :170; consumidores: `packages/ui/src/hooks/useCodingPlanEntryPlanList.ts`, `CodingPlanUpgradeDialog.tsx`, `ModelProviderSection.tsx`, `V4ComposerToolbar.tsx` — todos no conjunto removido/ajustado), `settings/model-provider-section/Detail.tsx` (:56, :99, :354-360 — arquivo **ajustado**, remove só os branches Coding Plan/Team Plan e mantém o resto) e `lib/startPlanEntitlementOptions.ts` (deletado).
- `resolveEntitledAccountProviderAccess*` (`lib/accountProviderAccess.ts`): só deletar se `pnpm dep:refs --list-exports` zerar após os ajustes de `ModelProviderSection.tsx` e `SessionPane.tsx`; há teste dedicado (`test/accountProviderAccess.test.ts`) que acompanha a decisão.
- `useStableAccountAccess`: **não deletar** — consumidor sobrevivente `hooks/useUsageStats.ts` (:14, :89, :271) e consumidor fora de escopo `hooks/useCodingPlanQuotaResetUi.ts` (:13, :377). Reavaliar com `dep:refs` após as remoções; `pnpm knip` fecha.
- Regra de fechamento por fase: `pnpm knip` sem exports órfãos do conjunto; `pnpm architecture:check --changed` verde (só remoção, nenhuma aresta nova cruzando domínios).

### 4.2 Dados legados

- **Preferências persistidas apontando para providers builtin `account:zai-*`/bigmodel:** a UI não filtra nem reescreve preferências; o provider aparece como card comum por API key. Superfícies que liam esses ids para montar UI preferencial (fingerprints de entitlement em `SettingsPage.tsx:408-437`, `isGlmQuotaBannerProviderId` em `useV4SessionQuotaBanner.ts:31-35`) somem com seus consumidores, sem projeções mortas nem fallback.
- **Flags de marketing pendentes / dismissal stores persistidos:** stores do banner v4 são deletados com o banner; nenhum leitor remanescente (grep de fechamento). Flags de dismiss de claim deixam de ser lidas; toques legados do backend caem no handler silencioso do §3.3.
- **Testes mockando `useStartPlanRecommendation`** em cenários que sobrevivem (`highspeed/sessionPaneHighspeedActivation.test.ts`, `highspeed/highspeedVisibilityRefresh.test.ts`, `v4SessionPaneModelSwitchRecovery.test.ts`): podar por **caso** (mock e asserções de `recommendStartPlan`), preservando integralmente os cenários de highspeed e de recuperação de troca de modelo (R-T4).

### 4.3 Limites e entradas inválidas

- Toque de marketing com `action.type` desconhecido ou `claim_zcode_plan`: ignorado com log `debug` (§3.3). Sem acumulação de branches de fallback.
- Provider id inexistente/inválido em preferência legada: tratado pelo caminho genérico já existente de providers por chave (nenhum caso especial novo é criado).
- Welcome screen sem provedores OAuth para carregar: estado `"loadingProviders"`/`noProviders` deixa de existir; não há mais fetch.
- Aba usage sem provedor: estado neutro acessível (RNF-02); sem região aria-live vazia referenciada após remoção dos banners.

---

## 5. Mudanças arquivo a arquivo

### 5.1 Arquivos a CRIAR

| # | Caminho | O que é |
|---|---|---|
| C1 | `packages/ui/test/zaiUiParityTelemetry.test.ts` | Teste do evento `zai_ui_parity_surface`: emissão na welcome/settings, campo de desfecho, e nada além dele |
| C2 | `packages/ui/test/welcomeScreenApiKeyOnly.test.ts` | Teste de que a welcome screen abre em modo API key, sem símbolos OAuth (substitui os cenários OAuth de `rootOAuthCallbackHandling.test.ts`) |

Nenhum arquivo de produção novo é criado — a mudança é de remoção; o evento de migração usa `reportAppTelemetryEvent` existente em `lib/appTelemetry.ts`.

### 5.2 Arquivos a REMOVER (produção) — 35 (R2–R36, sendo 2 condicionais)

| # | Caminho | Motivo (RF) |
|---|---|---|
| R2 | `packages/ui/src/settings/model-provider-section/oauthActions.ts` | RF-05 (`startPresetSubscriptionLogin` sem consumidor; `reportPresetSubscriptionSuccess` só em `ModelProviderSection.tsx`) |
| R3 | `packages/ui/src/settings/model-provider-section/codingPlanPricingCards.ts` | RF-06/RF-12b |
| R4 | `packages/ui/src/settings/model-provider-section/useCodingPlanProducts.ts` | RF-06 |
| R5 | `packages/ui/src/settings/model-provider-section/StartPlanBalanceCard.tsx` | RF-06 |
| R6 | `packages/ui/src/settings/model-provider-section/StartPlanCard.tsx` | RF-06 |
| R7 | `packages/ui/src/settings/model-provider-section/StartPlanQuotaStatusCard.tsx` | RF-06 |
| R8 | `packages/ui/src/settings/model-provider-section/useStartPlanPreview.ts` | RF-12b (consumidor único: `StatusCards.tsx:50,333`) |
| R9 | `packages/ui/src/settings/model-provider-section/codingPlanPurchaseAuth.ts` | RF-12b |
| R10 | `packages/ui/src/settings/model-provider-section/enterpriseCodingPlanProducts.ts` | RF-12b |
| R11 | `packages/ui/src/settings/model-provider-section/useEnterpriseCodingPlanProducts.ts` | RF-12b |
| R12 | `packages/ui/src/settings/model-provider-section/BigModelRegistrationHint.tsx` | RF-08 (hint generalizado no arquivo comum de cards, sem menção a BigModel) |
| R13 | `packages/ui/src/settings/CodingPlanUpgradeDialog.tsx` | RF-12b |
| R14 | `packages/ui/src/settings/CodingPlanUpgradeDialogProvider.tsx` | RF-12b |
| R15 | `packages/ui/src/settings/CodingPlanEntryButton.tsx` | RF-12b (CTA de entrada do upgrade) |
| R16 | `packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx` | RF-09/RF-10 |
| R17 | `packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx` | RF-09/RF-10 |
| R18 | `packages/ui/src/chat-input-toolbar/StartPlanContextBalance.tsx` | RF-07 |
| R19 | `packages/ui/src/chat-input-toolbar/CodingPlanContextUsage.tsx` | RF-09/RF-10 |
| R20 | `packages/ui/src/v4/useV4SessionQuotaBanner.ts` | RF-09 |
| R21 | `packages/ui/src/v4/ConversationQuotaBanner.tsx` | RF-09 |
| R22 | `packages/ui/src/v4/sessionQuotaBannerDismissalStore.ts` | RF-09 (store do banner; único leitor: R20) |
| R23 | `packages/ui/src/v4/startPlanQuotaReminderStore.ts` | RF-09 (idem) |
| R24 | `packages/ui/src/components/marketing-touch/MarketingDialogs.tsx` | RF-11 — **reclassificado: alterar** (só o `CloudContentDialog` neutro sobrevive; ver decisão F-03-1) |
| R25 | `packages/ui/src/components/marketing-touch/useMarketingTaskCompletionRefresh.ts` | RF-11 (consumidores só no fluxo de claim; revalidar com `dep:refs`) |
| R26 | `packages/ui/src/components/manual-claim-plan/manualClaimFailureMessage.ts` | RF-11 |
| R27 | `packages/ui/src/components/manual-claim-plan/manualClaimPlanStartUsing.ts` | RF-11 |
| R28 | `packages/ui/src/request-security-edition/claim.ts` | RF-11 (stub confirmado) |
| R29 | `packages/ui/src/hooks/useStartPlanRecommendation.ts` | RF-12 |
| R30 | `packages/ui/src/hooks/useStartPlanEntitlement.ts` | RF-12 |
| R31 | `packages/ui/src/lib/startPlanEntitlementOptions.ts` | RF-09/RF-12 (todos os consumidores no conjunto removido) |
| R32 | `packages/ui/src/hooks/usePlanIdentitySnapshot.ts` | RF-09 (único consumidor externo: `SessionPane.tsx`) |
| R33 | `packages/ui/src/hooks/useUsageEntitlement.ts` | RF-09 — **condicional**: deletar somente após consumidores zerarem (§4.1) |
| R34 | `packages/ui/src/lib/accountProviderAccess.ts` | RF-09 — **condicional**: só se `dep:refs` zerar após ajustes (§4.1) |
| R35 | `packages/ui/src/settings/model-provider-section/useCodingPlanEntitlements.ts` | RF-09 (ecossistema Coding Plan; consumidores todos no conjunto removido/ajustado — ver §4.1) |
| R36 | `packages/ui/src/hooks/useOAuth.ts` | RF-01 (`export function useOAuth()` :25; chama `oauthService.startOAuthWithPolling` em :83; único consumidor: `WelcomeScreen.tsx`) |

*(Contagem de remoções de produção: 35 itens R2–R36, sendo 2 condicionais — R33 e R34.)*

### 5.3 Arquivos a ALTERAR (produção) — 24

| # | Caminho | O que muda |
|---|---|---|
| A1 | `packages/ui/src/WelcomeScreen.tsx` | RF-01–RF-04: remover modo `providers`, `startTrackedLogin` (:114), helpers `getLoginOAuth*` (:491-511), `LoginOAuthRegionTag` (:513), `getProviderPriority` (:528), `resolveVisibleLoginProviders` (:542), `resolveLoginRetryProvider` (:550), ramos waiting/error, testids `TID_OAUTH_*`, imports zai/bigmodel (:11,:16); `loginMode` inicia em `"entry"` (só API key; o clique abre o formulário) |
| A2 | `packages/ui/src/App.tsx` | RF-11: remover `useMarketingTaskCompletionRefresh` (:68, :286) |
| A3 | `packages/ui/src/SettingsPage.tsx` | RF-09: remover blocos `usageZai*`/`usageBigmodel*` (:408-463+), passagens :512/:517, imports de `CodingPlanUsagePanel` (:71) e do upgrade dialog (:65, :605, :659-664); usage fica só com `AppUsagePanel` + estado neutro acessível |
| A4 | `packages/ui/src/settings/ModelProviderSection.tsx` | RF-05/RF-06/RF-12b: remover import/chamada de `reportPresetSubscriptionSuccess` (:46, :637) e bloco de conclusão de assinatura (:625-650), import de `CodingPlanLoginOptions` (:46), pontos de upgrade/preço/saldo |
| A5 | `packages/ui/src/settings/model-provider-section/utils.tsx` | RF-05: remover `resolveOAuthProviderIdByPreset` (:23) se `dep:refs` confirmar órfão |
| A6 | `packages/ui/src/settings/model-provider-section/StatusCards.tsx` | RF-12b: remover branch Start Plan preview (:50, :333); card genérico permanece |
| A7 | `packages/ui/src/settings/model-provider-section/Detail.tsx` | RF-09/RF-12b: remover branches Coding Plan/Team Plan (:56, :99, :354-360) e o import/chamada de `useCodingPlanEntryGate` de `CodingPlanEntryButton.js` (:1, :900 — arquivo removido, R15); restante permanece |
| A8 | `packages/ui/src/components/marketing-touch/marketingTouchController.ts` | RF-11: remover ramais `claim_zcode_plan` (filtro de `errorAction` em :209 e branch de terminalidade em :236, mantendo `open_url` e demais ações); toques de claim passam a cair no caminho de ação não suportada (log `debug`) |
| A9 | `packages/ui/src/settings/AutomationsSection.tsx` | RF-12b: remover upgrade dialog (:100, :534, :855-864) → estado neutro sem CTA |
| A10 | `packages/ui/src/settings/SubagentsSection.tsx` | RF-12/RF-12a: remover `useStartPlanRecommendation` (:2, :609, :674, :817, :1008) e badges (:1320-1321); troca manual permanece |
| A11 | `packages/ui/src/settings/AutomationEditView.tsx` | RF-12/RF-12a: remover hook (import :2, chamada :1770) e badges de connection mode (:1494-1505) |
| A12 | `packages/ui/src/WorkspaceSidebar.tsx` | RF-12b: remover uso do upgrade dialog (:137) → sem CTA |
| A13 | `packages/ui/src/WorkspaceSidebarFooter.tsx` | RF-09: remover montagem de `WorkspaceSidebarFooterUsageSummary`; manter genérico |
| A14 | `packages/ui/src/chat-input-toolbar/contextUsage.tsx` | RF-09/RF-10: remover referências ao card Coding Plan; manter breakdown genérico |
| A15 | `packages/ui/src/v4/SessionPane.tsx` | RF-09/RF-12: remover recomendações (:1754, :2490, :2525), montagem do banner de quota, `resolveEntitledAccountProviderAccess` (:135, :3130) e `usePlanIdentitySnapshot` |
| A16 | `packages/ui/src/v4/composer/V4ComposerToolbar.tsx` | RF-09: remover consumo do ecossistema preferred-provider/Coding Plan |
| A17 | `packages/ui/src/components/marketing-touch/MarketingTouchProvider.tsx` | RF-11/RF-12b: remover branch `claim_zcode_plan` (:250-295), prewarm (:365-372), `openCodingPlanUpgrade` (:10, :66, :175, :318), `useStartPlanEntitlement`/refresh de claim; handler pós-remoção loga `debug` e ignora. `MarketingDialogs` fica só com o diálogo neutro (R24 reclassificado) |
| A18 | `packages/ui/src/components/marketing-touch/useMarketingBannerVisible.ts` | RF-11: predicado sem claim (mudança atômica com A19) |
| A19 | `packages/ui/src/sidebar-activity/SidebarBottomActivity.tsx` | RF-11: slot exibe apenas fallback highspeed quando não há banner neutro |
| A20 | `packages/ui/src/hooks/useUsageStats.ts` | RF-10: apenas limpeza de imports mortos do conjunto; caminho `useAppUsageStats` (:191-206) intocado |
| A21 | `packages/ui/src/hooks/useStableAccountAccess.ts` | RF-09: sem mudança de comportamento; reavaliar órfãos com `dep:refs` (não deletar — consumidor sobrevivente) |
| A22 | `packages/ui/src/lib/appTelemetry.ts` | RNF-03: adicionar emissão do `zai_ui_parity_surface` (1 release) |
| A23 | `packages/ui/src/i18n/locales/en-US.ts` | RF-15: remover blocos :4-13, :226-283, :982-995, :3416-3426, :3649-3653 + adjacentes órfãos |
| A24 | `packages/ui/src/i18n/locales/zh-CN.ts` | RF-15: espelho de A23 (:4-11 verificado; demais por grep) |

### 5.4 Testes a REMOVER — 22

`packages/ui/test/`: `codingPlanPricingCards.test.ts`, `codingPlanEntitlements.test.ts`, `codingPlanFunnelTelemetry.test.ts`, `codingPlanOwnedEntryPlans.test.ts`, `codingPlanEmbeddedWebview.test.ts`, `codingPlanUpgradeDialogProvider.test.ts`, `codingPlanEntryButton.test.ts`, `manualClaimPlanStartUsing.test.ts`, `marketingTaskCompletionRefresh.test.ts`, `settingsModelProviderUpgradeIntent.test.ts`, `planUsageArmsTelemetry.test.ts`, `useCodingPlanEntryPlanList.test.ts`, `v4SessionQuotaBannerState.test.ts`, `startPlanBucketQuota.test.ts`, `startPlanContextBalanceRefresh.test.ts`, `startPlanEntitlementAccess.test.ts`, `startPlanQuotaReminderStore.test.ts`, `startPlanStatusMeta.test.ts`, `accountProviderAccess.test.ts` (somente se R34 confirmar), `startPlanRecommendation.test.ts` + `startPlanRecommendationFreshness.test.ts` + `useStartPlanRecommendation.test.ts` (remover inteiro ou podar conforme conteúdo — os três cobrem só o conjunto removido).

### 5.5 Testes a ALTERAR (poda por caso, não por arquivo) — 9+

- `packages/ui/test/rootOAuthCallbackHandling.test.ts` — remover cenários de login OAuth da UI; manter o que for de handling de callback fora da welcome (se houver).
- `packages/ui/test/v4SessionPaneModelSwitchRecovery.test.ts` — remover mock/asserções de `useStartPlanRecommendation`; manter recuperação de troca manual.
- `packages/ui/test/highspeed/sessionPaneHighspeedActivation.test.ts` e `highspeed/highspeedVisibilityRefresh.test.ts` — remover só os casos da recomendação; highspeed integralmente preservado.
- `packages/ui/test/marketingTouchProvider.test.ts` — substituir cenários de claim pelo handler silencioso (§3.3); manter poller/banner neutro/`open_url`.
- `packages/ui/test/modelProviderCodingPlan.test.ts`, `subagentsSection.test.ts`, `chatContextUsageBreakdown.test.ts`, `chatContextUsageMobileInteraction.test.ts` e demais com mistura (ex.: `providerFamily*.test.ts`) — remover só os casos Coding Plan/claim; manter API key/família.

### 5.6 Fixtures/E2E a ALTERAR — 4

- `packages/ui/test/browser/manual-review/pending/start-plan-bucket-reminder.fixture.tsx` + `.test.mjs` — remover ou converter em fixture de estado neutro.
- `packages/ui/test/browser/manual-review/pending/start-plan-followup.fixture.tsx` + `.test.mjs` — idem.
- Cenários E2E do desktop com OAuth na welcome screen (se existirem no suite `packages/desktop/test/e2e`) — substituir pelo fluxo API key (verificação na Fase 3).

---

## 6. Critérios de aceite

Mapeamento RF/RNF → CA: RF-01→CA-01/02 · RF-02→CA-02 · RF-03→CA-03 · RF-04→CA-04 · RF-05→CA-05 · RF-06→CA-06 · RF-07→CA-07 · RF-08→CA-08 · RF-09→CA-09 · RF-10→CA-10 · RF-11→CA-11/12 · RF-12→CA-13 · RF-12a→CA-14 · RF-12b→CA-15 · RF-13→CA-16 · RF-14→CA-17 · RF-15→CA-18 · RNF-01→CA-19 · RNF-02→CA-20 · RNF-03→CA-21/22 · RNF-04→CA-23 · RNF-05→CA-24.

- **CA-01 (RF-01):** A welcome screen não renderiza nenhum botão OAuth nem estado waiting/error/retry; abre numa tela de entrada de API key com um único botão, cujo clique abre o formulário de chave. Verificação: `welcomeScreenApiKeyOnly.test.ts` + inspeção do componente.
- **CA-02 (RF-01, RF-02):** Os símbolos `startTrackedLogin`, `resolveVisibleLoginProviders`, `getProviderPriority`, `resolveLoginRetryProvider`, `getLoginOAuthButtonMessageId`, `LoginOAuthRegionTag` não existem mais em `packages/ui` (grep zerado) e nenhum peso fixo zai=0/bigmodel=1 sobrevive.
- **CA-03 (RF-03):** Nenhuma referência a `login.oauth.regionTag.*` ou a tags de região exclusivas de Z.ai/BigModel permanece em código ou locales.
- **CA-04 (RF-04):** Nenhum caminho de retry restante referencia `providers[0]` ou símbolo do fluxo OAuth removido (leitura do `WelcomeScreen.tsx` final + grep).
- **CA-05 (RF-05):** `oauthActions.ts` deletado; `ModelProviderSection.tsx` não chama `reportPresetSubscriptionSuccess`; grep por `startPresetSubscriptionLogin` zerado em `packages/ui`.
- **CA-06 (RF-06):** Os arquivos R3–R7 não existem; as strings `settings.modelProvider.codingPlan.start.*` e `product.firstPromo` não existem em nenhum locale; a seção de provedores não renderiza preço/promo/saldo do Coding Plan.
- **CA-07 (RF-07):** `StartPlanContextBalance.tsx` deletado e a toolbar do chat não monta card de saldo Start Plan (teste da toolbar atualizado confirma).
- **CA-08 (RF-08):** `BigModelRegistrationHint.tsx` não existe; nenhum texto de UI menciona BigModel preferencialmente; hint de registro generalizado quando o preset o declara.
- **CA-09 (RF-09):** Grep por `preferredProviderId` em `packages/ui/src` retorna zero ocorrências apontando `zaiIndividualCodingPlan`/`bigmodelIndividualCodingPlan`/`zaiStartPlan`/`bigmodelStartPlan`; `useV4SessionQuotaBanner.ts`, `ConversationQuotaBanner.tsx` e os dois stores de dismissal não existem; `SessionPane` não monta banner de quota.
- **CA-10 (RF-10):** `AppUsagePanel`/`useAppUsageStats` funcionam sem preferred provider; com nenhum provedor configurado, a aba usage exibe estado neutro acessível; `useUsageEntitlement` (R33) e dependentes deletados conforme §4.1, com `knip` fechando.
- **CA-11 (RF-11):** Grep por `claim_zcode_plan` e `claimManualPlan` em `packages/ui/src` zerado; `manual-claim-plan/`, `claim.ts`, `MarketingFailureDialog.tsx` e o handler `claim_plan` não existem (o `MarketingDialogs.tsx` neutro permanece — decisão F-03-1); `marketingTouchController.ts` não contém mais ramais `claim_zcode_plan` (:209, :236); `MarketingTouchProvider.test.ts` cobre o handler silencioso.
- **CA-12 (RF-11):** Toque com `claim_zcode_plan` recebido em runtime não gera warn/error nem UI (assert no teste: apenas log `debug`); `open_url` e banner de imagem continuam funcionando; `SidebarBottomActivity` e `useMarketingBannerVisible` alterados atomicamente (fallback highspeed visível).
- **CA-13 (RF-12):** `useStartPlanRecommendation`/`useStartPlanEntitlement` deletados; `SubagentsSection`, `AutomationEditView` e `SessionPane` sem oferta proativa; a troca manual de modelo de subagente continua operando (teste de troca manual verde).
- **CA-14 (RF-12a):** Badges `connectionMode.startPlan`/`startPlanBadge`/`codingPlanBadge` ausentes do código e dos locales; as telas de automação/subagente não exibem badge promocional.
- **CA-15 (RF-12b):** `CodingPlanUpgradeDialog(.Provider)`, `useStartPlanPreview`, `codingPlanPurchaseAuth`, `enterpriseCodingPlanProducts(.ts/hook)` e `CodingPlanEntryButton` deletados; consumidores (`SettingsPage`, `WorkspaceSidebar`, `MarketingTouchProvider`, `AutomationsSection`, `model-provider-section/Detail.tsx` — que perde `useCodingPlanEntryGate`) em estado neutro sem CTA de upgrade.
- **CA-16 (RF-13):** E2E/fixture novo: configurar Z.ai via API key a partir da welcome screen até ver usage, com fluxo/cards/validação/ordenação idênticos a outro provedor por chave (sem logo em destaque, sem badge "Free", sem "Connect Z.ai").
- **CA-17 (RF-14):** Auditoria da Fase 3: grep por `startOAuth` e `claimManualPlan` em `packages/ui/src` zerado (nenhum caminho de UI invoca OAuth/Coding Plan services para zai/bigmodel); `hooks/useOAuth.ts` não existe e nenhum arquivo importa `oauthService.startOAuthWithPolling`.
- **CA-18 (RF-15):** Checagem de chaves i18n não usadas zera o inventário do §2.6 em **ambos** os locales; `grep -c` confirma ausência de `manualClaimPlan.`, `startPlan.recommendation.`, `login.oauth.` nos dois arquivos.
- **CA-19 (RNF-01):** Nenhum fetch de entitlement/produtos disparado no mount da welcome/settings (`useCodingPlanProducts` e probes preferred-provider não existem); medição simples de mount mostra ausência dessas chamadas (mock de rede no teste).
- **CA-20 (RNF-02):** Estados vazios (aba usage sem provedor; slot da sidebar sem banner) têm texto acessível e nenhuma região aria-live vazia referenciada (inspeção + teste de acessibilidade dos componentes sobreviventes).
- **CA-21 (RNF-03):** Único evento novo é `zai_ui_parity_surface`, emitido via `reportAppTelemetryEvent`, com campo de desfecho; `zaiUiParityTelemetry.test.ts` cobre emissão e desfecho; eventos genéricos de API key preservados; `add_model_success` com `login_default: "1"` removido.
- **CA-22 (RNF-03):** Nota de código (em chinês) no emissor documenta a expiração em 1 release e a remoção agendada.
- **CA-23 (RNF-04):** Telas alteradas seguem `DESIGN.md` e reutilizam os cards/fluxos genéricos existentes (revisão visual + fixture `provider-settings-batch` sem regressão).
- **CA-24 (RNF-05):** `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` e `pnpm knip` verdes no fechamento de cada fase; `pnpm knip` sem exports órfãos do conjunto removido.

---

## 7. Plano de testes

**Entrypoints reais (verificados):** `packages/ui` **não tem script de teste próprio** (`packages/ui/package.json` só tem `lint`/`lint:fix`). Os testes rodam pela raiz: `pnpm test:unit` (`vitest run --exclude "packages/desktop/test/e2e/**/*.test.ts"`, `package.json` raiz :35), variante `pnpm test:unit:affected` (:36, usada pelo `verify:pre-push` :38). E2E desktop: `pnpm test:e2e` (:28). Fixtures manuais: `packages/ui/test/browser/manual-review/pending/` (`.fixture.tsx` + `.test.mjs`).

### 7.1 Unidade / componentes

| Suíte | Cobre |
|---|---|
| `welcomeScreenApiKeyOnly.test.ts` (novo, C2) | CA-01–CA-04: welcome 100% API key, sem símbolos OAuth/prioridade |
| `zaiUiParityTelemetry.test.ts` (novo, C1) | CA-21: evento `zai_ui_parity_surface`, campo de desfecho, ausência de outros eventos novos |
| `marketingTouchProvider.test.ts` (alterado) | CA-11/CA-12: handler silencioso de `claim_zcode_plan` (só log `debug`), `open_url` e banner neutro intactos, sem `MarketingDialogs` |
| `modelProviderCodingPlan.test.ts`, `subagentsSection.test.ts` (podados) | CA-06/CA-13/CA-14: ausência de cards/offer/badges; presença da troca manual |
| `chatContextUsageBreakdown.test.ts`, `chatContextUsageMobileInteraction.test.ts` (podados) | CA-07/CA-10: breakdown genérico sem card Coding Plan |
| `highspeed/sessionPaneHighspeedActivation.test.ts`, `highspeed/highspeedVisibilityRefresh.test.ts` (podados) | highspeed integralmente preservado, sem recomendação |
| `v4SessionPaneModelSwitchRecovery.test.ts` (podado) | recuperação de troca manual de modelo sem recomendação |
| `appUsagePanel.test.ts` (existente, intocado) | CA-10: caminho genérico de usage |
| Remoções (§5.4) | Garantem que nenhum teste do conjunto removido sobreviva quebrando a suíte |

### 7.2 Fixtures (manual-review)

- `start-plan-bucket-reminder` e `start-plan-followup` convertidos/removidos (CA-09/CA-15).
- `provider-settings-batch` e `provider-family-responsive` sem regressão (CA-16/CA-23).

### 7.3 E2E

- Novo cenário: configuração de Z.ai via API key a partir da welcome screen até usage (CA-16), incluindo sessão com provider já configurado exibindo usage pelo `AppUsagePanel` (CA-10).
- Remoção/substituição de cenários E2E de OAuth na welcome screen, se existirem no suite desktop (verificação na Fase 3).

### 7.4 Gates

Por fase: `pnpm typecheck` · `pnpm lint` · `pnpm architecture:check --changed` · `pnpm knip` · `pnpm test:unit` (no fechamento final) e `pnpm test:unit:affected` (por commit) · grep M1 do PRD zerado.
