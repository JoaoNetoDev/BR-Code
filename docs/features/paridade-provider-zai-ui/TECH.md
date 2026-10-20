# TECH — Paridade de provedor na UI: remoção do tratamento preferencial de Z.ai / BigModel (GLM)

- **Status:** Rascunho para revisão técnica
- **Data:** 2026-10-18
- **PRD de referência:** `docs/features/paridade-provider-zai-ui/PRD.md`
- **Fronteira:** exclusivamente `packages/ui`. Nenhuma mudança em `packages/shared`, `packages/services`, `packages/desktop`, `packages/server`, `apps/zcode-cli`.

> **Nota de verificação:** `pnpm dep:refs` está indisponível no ambiente atual (falha de módulo `minimatch` em `node_modules/@ts-morph`). Todas as condicionais de referências que o PRD marcou para resolver com `dep:refs` foram resolvidas nesta análise por `grep` sobre `packages/ui/src` e `packages/ui/test`, com os resultados citados abaixo. Antes de deletar arquivos na implementação, revalidar com `pnpm dep:refs --list-exports <arquivo>` em ambiente íntegro.

---

## 1. Visão geral e abordagem

A mudança é destrutiva-aditiva na UI: remove-se o ecossistema preferencial de Z.ai/BigModel (OAuth de login, preferred-provider de entitlement/usage, oferta de Coding Plan, marketing de claim) e mantém-se intacto o caminho de provedor por API key. Não há reescrita de caminhos genéricos que não existem (PRD RF-10): as superfícies Coding Plan são removidas, não generalizadas.

Princípios de execução:

- **Remoção em conjuntos coesos** (componente + hook + strings + telemetria + testes), um conjunto por commit, na ordem das fases do PRD.
- **Fonte única de verdade mantida:** a lista de provedores e o caminho de API key em `settings/model-provider-section/` não mudam de forma; Z.ai/BigModel passam a fluir por eles sem ramificações.
- **Nada de stubs permanentes:** arquivos órfãos são deletados, não esvaziados.

## 2. Arquitetura afetada (módulos e fronteiras)

| Camada/pasta | Papel na mudança | Arquivos-chave (verificados) |
|---|---|---|
| `packages/ui/src` (raiz) | Welcome screen sem OAuth; App.tsx perde hook de refresh de marketing | `WelcomeScreen.tsx`, `App.tsx:68,286`, `SettingsPage.tsx:408-463` |
| `components/marketing-touch/` | Claim de plano e dialogs removidos; mecanismo neutro (poller/banner/`open_url`) permanece | `MarketingTouchProvider.tsx:250-295,365-372`, `MarketingDialogs.tsx`, `useMarketingBannerVisible.ts`, `useMarketingTaskCompletionRefresh.ts` |
| `components/manual-claim-plan/` | Deletado | `manualClaimFailureMessage.ts`, `manualClaimPlanStartUsing.ts` |
| `request-security-edition/` | `claim.ts` já é stub (`prepareRequestVerificationClaim` retorna `{}`; arquivo de 11 linhas, verificado) — deletar junto | `claim.ts` |
| `sidebar-activity/` | Predicado de visibilidade compartilhado alterado em conjunto | `SidebarBottomActivity.tsx:1,19-20` |
| `settings/` + `settings/model-provider-section/` | Login OAuth, cards de preço/saldo/promo, preview, purchase auth, produtos enterprise removidos | `oauthActions.ts`, `ModelProviderSection.tsx:46,637`, `codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`, `StartPlanBalanceCard.tsx`, `StartPlanCard.tsx`, `StartPlanQuotaStatusCard.tsx`, `CodingPlanUpgradeDialog.tsx`, `useStartPlanPreview.ts`, `codingPlanPurchaseAuth.ts`, `enterpriseCodingPlanProducts.ts`, `useEnterpriseCodingPlanProducts.ts`, `BigModelRegistrationHint.tsx`, `StatusCards.tsx:50,333` |
| `settings/usage-stats/` | Painel Coding Plan removido; AppUsagePanel permanece | `CodingPlanUsagePanel.tsx:134,152,169-171`, `AppUsagePanel.tsx:37-38` |
| `chat-input-toolbar/` | Cards de saldo/usage Coding Plan removidos | `StartPlanContextBalance.tsx`, `CodingPlanContextUsage.tsx:215`, `contextUsage.tsx` |
| `hooks/` | Hooks do ecossistema removidos | `useStartPlanRecommendation.ts`, `useStartPlanEntitlement.ts`, `useUsageEntitlement.ts` (consumidores removidos; hook em si avaliar na Fase 1 — ver §4) |
| `v4/` | Banner de quota, recomendações e pontos de usage removidos | `useV4SessionQuotaBanner.ts:31-35,186-188`, `ConversationQuotaBanner.tsx`, `SessionPane.tsx:1754,2490,2525`, `composer/V4ComposerToolbar.tsx` |
| `i18n/locales/` | Blocos órfãos removidos | `en-US.ts:4-13,226-283,3418-3424,3651`, `zh-CN.ts:4-11` |
| `WorkspaceSidebar*` | Resumo de usage e CTA de upgrade ajustados | `WorkspaceSidebarFooterUsageSummary.tsx`, `WorkspaceSidebarFooter.tsx`, `WorkspaceSidebar.tsx` |

**Intocados (confirmados):** `packages/shared/src/oauth.ts` (só leitura do tipo em :56-59), `packages/shared/src/official-glm-model-id.ts`, `packages/services/src/oauth/*`, `packages/services/src/coding-plan-subscription/*`, `apps/zcode-cli/packages/cli/src/login-command.ts`, desktop main/host.

## 3. Plano de mudanças por subsistema

### 3.1 Welcome screen (RF-01–RF-04)

- Em `WelcomeScreen.tsx`: remover o modo `providers` do painel de login — `visibleProviders`/`resolveVisibleLoginProviders` (:542-548), `getProviderPriority` (:528-540), `getLoginOAuthButtonMessageId`/`getLoginOAuthRegionTagMessageId` (:491-511), `LoginOAuthRegionTag` (:513-526), `startTrackedLogin`, `resolveLoginRetryProvider` (:550-560), os ramos `status === "waiting"` (:374-398) e `status === "error"` (:400-451), o render de botões (:319-356) e os testids `TID_OAUTH_*`.
- Sobrevive: o branch `loginMode === "apiKey"` com `LoginApiKeyForm` (:360-372) e o botão "use API key" (:344-354). A welcome screen abre numa tela de entrada de API key (sem seleção de canal nem OAuth); o clique no botão abre o formulário.
- Invariante: nenhum caminho restante pode referenciar `ZAI_PROVIDER_ID`/`BIGMODEL_PROVIDER_ID` de `@/...` constants (imports em :11,:16 saem).

### 3.2 Settings — provedores (RF-05–RF-08, RF-12b)

- `ModelProviderSection.tsx`: remover o import e a chamada de `reportPresetSubscriptionSuccess` (:46, :637) e o bloco de conclusão de assinatura que a cerca (:625-650); `startPresetSubscriptionLogin` **não tem nenhum consumidor** em `packages/ui/src` (verificado por grep — só a definição em `oauthActions.ts:10`). Depois disso, `oauthActions.ts` é deletado e `resolveOAuthProviderIdByPreset` (`model-provider-section/utils.tsx:23`) vira órfã a confirmar com `dep:refs`.
- Remoção de arquivos: `codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`, `StartPlanBalanceCard.tsx`, `StartPlanCard.tsx`, `StartPlanQuotaStatusCard.tsx`, `CodingPlanUpgradeDialog.tsx` (+ `CodingPlanUpgradeDialogProvider`), `useStartPlanPreview.ts`, `codingPlanPurchaseAuth.ts`, `enterpriseCodingPlanProducts.ts`, `useEnterpriseCodingPlanProducts.ts`, `BigModelRegistrationHint.tsx`.
- `StatusCards.tsx` (:50, :333) perde o branch Start Plan preview; card genérico de provider permanece.
- Consumidores de upgrade a ajustar (grep verificado): `SettingsPage.tsx`, `WorkspaceSidebar.tsx`, `MarketingTouchProvider.tsx`, `CodingPlanEntryButton.tsx`, `AutomationsSection.tsx` — cada ponto vira estado neutro, sem CTA de upgrade.

### 3.3 Entitlement / usage (RF-09–RF-10)

- `SettingsPage.tsx:408-463`: remover `usageZai*`/`usageBigmodel*` (providers, access, fingerprints :408-437), os dois blocos `useUsageEntitlement` com `preferredProviderId` (:438-454 e o paralelo bigmodel em :463) e as passagens adiante (:512, :517).
- `CodingPlanUsagePanel.tsx` é removido inteiro (as superfícies dependentes não são reescritas — RF-10).
- `WorkspaceSidebarFooterUsageSummary.tsx`, `chat-input-toolbar/CodingPlanContextUsage.tsx` (:215), `v4/composer/V4ComposerToolbar.tsx` e `v4/SessionPane.tsx`: remover os pontos de consumo; `contextUsage.tsx` e `WorkspaceSidebarFooter.tsx` mantêm o que for genérico de provedor API-key.
- `v4/useV4SessionQuotaBanner.ts` + `ConversationQuotaBanner.tsx`: removidos (comparações hardcoded :31-35; `preferredProviderId: upgradeProviderId` :186-188); `SessionPane.tsx` para de montá-los.
- Caminho que permanece: `AppUsagePanel.tsx:37-38` → `useAppUsageStats` (`hooks/useUsageStats.ts:191-206`) → `usageStatsService`, sem preferred provider.

### 3.4 Marketing / ofertas (RF-11, RF-12, RF-12a)

- `MarketingTouchProvider.tsx`: remover o branch de execução de `claim_zcode_plan` (:250-295), o `useRequestVerificationPrewarm` (:365-372) e `openCodingPlanUpgrade` das dependências (:318); manter poller, banner de imagem e `open_url` (PRD Q4). **Handler pós-remoção:** qualquer toque com `action.type === "claim_zcode_plan"` é **ignorado silenciosamente com log `debug`** (sem warn/error, sem UI), atendendo o Risco R3 do PRD; coberto em observabilidade no §7.
- Deletar: `components/manual-claim-plan/` (2 arquivos), `MarketingDialogs.tsx`, `request-security-edition/claim.ts` (stub: `prepareRequestVerificationClaim` em :4-11 retorna `{}`), `useStartPlanRecommendation.ts`, `useStartPlanEntitlement.ts`, `useMarketingTaskCompletionRefresh.ts` (consumidores: `App.tsx:68,286` e `MarketingTouchProvider.tsx` — só fluxo de claim; revalidar com `dep:refs`).
- `SidebarBottomActivity.tsx` (:19-20) e `useMarketingBannerVisible.ts`: ajustar em conjunto — com o claim fora, o slot da sidebar exibe apenas o fallback highspeed.
- Recomendações: remover pontos de uso em `SubagentsSection.tsx` (:2,:609,:674,:817,:1008), `AutomationEditView.tsx` (import :2; chamada real :1770) e `SessionPane.tsx` (:1754,:2490,:2525). **A troca manual de modelo permanece.**
- Badges de connection mode (`connectionMode.startPlan`/`startPlanBadge`/`codingPlanBadge`): remover as passagens em `AutomationEditView.tsx:1494-1505` e `SubagentsSection.tsx:1320-1321` (RF-12a).

## 4. Grafo de dependências e limpeza

Resultados das condicionais do PRD (resolvidas por grep; revalidar com `pnpm dep:refs`):

| Símbolo/arquivo | Consumidores encontrados | Decisão |
|---|---|---|
| `startPresetSubscriptionLogin` | nenhum (só definição) | deletar com `oauthActions.ts` |
| `reportPresetSubscriptionSuccess` | `ModelProviderSection.tsx:46,637` | deletar chamada + arquivo |
| `resolveOAuthProviderIdByPreset` (`utils.tsx:23`) | só `oauthActions.ts` | deletar se `dep:refs` confirmar |
| `useStartPlanEntitlement` | só `MarketingTouchProvider.tsx` | deletar na Fase 2 |
| `useMarketingTaskCompletionRefresh` | `App.tsx:68,286`, `MarketingTouchProvider.tsx`, 2 testes | deletar na Fase 2 |
| `useStartPlanPreview` | `StatusCards.tsx:50,333` | deletar na Fase 2 |
| `useUsageEntitlement` / `useUsageEntitlementWithService` | consumidores: `SettingsPage.tsx`, `CodingPlanUsagePanel.tsx`, `useV4SessionQuotaBanner.ts` (removidos), `useCodingPlanEntitlements.ts:85,99` (preferredProviderId em :89; arquivo removido — consumidores: `useCodingPlanEntryPlanList.ts`, `CodingPlanUpgradeDialog.tsx`, `ModelProviderSection.tsx`, `V4ComposerToolbar.tsx`, todos no conjunto removido/ajustado), `Detail.tsx:56,99,354` (arquivo **ajustado**: remover branches Coding Plan/Team Plan incl. :354-360, manter o resto), `usePlanIdentitySnapshot.ts:12,40,67` (hook do ecossistema Coding Plan; único consumidor externo: `v4/SessionPane.tsx` — **remover o hook junto**) e `lib/startPlanEntitlementOptions.ts` (consumidores: `usePlanIdentitySnapshot`, `useStartPlanEntitlement`, `useStartPlanRecommendation`, `useCodingPlanEntitlements`, `useV4SessionQuotaBanner` — **todos removidos, deletar a lib**) | deletar o hook **somente após** os consumidores acima zerarem; `knip` fecha |
| `resolveEntitledAccountProviderAccess` (`lib/accountProviderAccess.ts`) | `SettingsPage.tsx` (removido), `ModelProviderSection.tsx:29,628` e `v4/SessionPane.tsx:135,3130` (arquivos **ajustados, não removidos**) | ajustar os pontos de chamada (:628 deixa de existir com o bloco de assinatura; :3130 reavaliado no ajuste do SessionPane); deletar a lib só se `dep:refs` zerar |
| `useStableAccountAccess` | consumidores reais (grep confirmado): `SettingsPage.tsx`, `WorkspaceSidebarFooterUsageSummary.tsx`, `V4ComposerToolbar.tsx` (removidos), `hooks/useUsageStats.ts:14,89,271` (arquivo **sobrevive** — caminho API-key do AppUsagePanel; o hook permanece), `hooks/useCodingPlanQuotaResetUi.ts:13,377` (**fora de escopo**: ecossistema quota-reset do Coding Plan declarado fora desta feature) | **não deletar**; reavaliar com `dep:refs` após as remoções; `knip` fecha |

Regra de fechamento: após cada fase, `pnpm knip` não pode apontar exports órfãos do conjunto; `pnpm architecture:check --changed` deve passar (nenhuma nova aresta cruzando domínios — só remoção).

## 5. Estado e donos de estado

- Nenhum estado novo é criado. Donos existentes preservados: `providerSettingsService` segue dono das credenciais/providers; `usageStatsService` dono das estatísticas; stores de dismissal (`sessionQuotaBannerDismissalStore`, `startPlanQuotaReminderStore`) são **deletados junto** com o banner v4.
- Remoção de estado não substitui por fallback: campos que só alimentavam Coding Plan (fingerprints de entitlement em `SettingsPage.tsx:422-437`) somem com seus consumidores, sem manter projeções mortas.
- `App.tsx:286` (`useMarketingTaskCompletionRefresh`) é chamada de efeito com callback de refresh — a remoção não altera o ciclo de task/session, apenas deixa de notificar o marketing.

## 6. i18n

Inventário de remoção (chaves confirmadas nos arquivos):

| Bloco | en-US.ts | zh-CN.ts | RF |
|---|---|---|---|
| `startPlan.recommendation.*` | :4-13 | :4-11 | RF-12 |
| `manualClaimPlan.*` (banner, claim, dismiss, share) | :226-283 | bloco espelho a localizar por grep | RF-11 |
| `settings.modelProvider.connectionMode.startPlan*` / `codingPlanBadge` | referenciado em `AutomationEditView.tsx:1494-1505` | espelho | RF-12a |
| `settings.modelProvider.codingPlan.start.*` / `product.firstPromo` / `paymentDialog.*` / `product.*` | :3418-3424, :3645-3652 e adjacentes | espelho | RF-12b, RF-06 |
| `login.oauth.button` (+ `.zai`/`.bigmodel`), `login.oauth.regionTag.*`, `login.oauth.*` de estados | referenciado em `WelcomeScreen.tsx:302,314,336-339,377-395,432,448` | espelho | RF-01 |

Processo: remover código primeiro, rodar a checagem de chaves não usadas do pacote de i18n, então apagar blocos em todos os locales. Nenhuma chave nova é criada (estados vazios reutilizam chaves genéricas existentes).

## 7. Telemetria

- Removidos junto com seus emissores: `add_model_success` com `login_default: "1"` (`oauthActions.ts:38-55`) e eventos de funil de Coding Plan atrelados aos componentes removidos (ex.: `codingPlanFunnelTelemetry` — teste afetado, ver §8).
- **Handler de ação desconhecida/claim pós-remoção:** `claim_zcode_plan` é ignorado silenciosamente com log `debug` no `MarketingTouchProvider` (R3 do PRD) — sem `warn`/`error` para não gerar ruído com toques legados do backend.
- Mantidos: eventos genéricos de provider por API key.
- Único evento novo: `zai_ui_parity_surface` (RNF-03 do PRD) — emitido na welcome screen/settings, campo de desfecho (superfície visível + configuração API-key concluída na sessão). Implementação via `reportAppTelemetryEvent` existente (`lib/appTelemetry.ts`); vive 1 release, remoção agendada na Fase 3 da release seguinte.

## 8. Testes

**Unit (remover/substituir):**
- OAuth welcome/fluxo: `rootOAuthCallbackHandling.test.ts` (cenários de login UI), testes que mockam `useStartPlanRecommendation` — `startPlanRecommendation.test.ts`, `startPlanRecommendationFreshness.test.ts`, `useStartPlanRecommendation.test.ts`, `v4SessionPaneModelSwitchRecovery.test.ts` e, em `packages/ui/test/highspeed/` (listagem real verificada: `GlobalNoticeSurface`, `HighspeedShareNoticeCard`, `globalNoticeStore`, `highspeedSavedTime`, `highspeedSend`, `highspeedShare`, `highspeedShareBlockers`, `highspeedTurnStore`, `highspeedVisibilityRefresh`, `sessionPaneHighspeedActivation`, `useHighspeedComposerEntrance` — todos `.test.ts`), os dois que mockam o hook: `highspeed/sessionPaneHighspeedActivation.test.ts` e `highspeed/highspeedVisibilityRefresh.test.ts`. **Decisão:** nesses dois, remover apenas os casos que exercitam a recomendação (mock e asserções de `recommendStartPlan`), preservando integralmente os cenários de highspeed.
- Coding Plan/marketing: `codingPlanPricingCards.test.ts`, `codingPlanEntitlements.test.ts`, `codingPlanFunnelTelemetry.test.ts`, `codingPlanOwnedEntryPlans.test.ts`, `codingPlanEmbeddedWebview.test.ts`, `codingPlanUpgradeDialogProvider.test.ts`, `codingPlanEntryButton.test.ts`, `manualClaimPlanStartUsing.test.ts`, `marketingTaskCompletionRefresh.test.ts`, `marketingTouchProvider.test.ts`, `modelProviderCodingPlan.test.ts`, `settingsModelProviderUpgradeIntent.test.ts`, `planUsageArmsTelemetry.test.ts`, `subagentsSection.test.ts` (casos de oferta).
- Usage: `chatContextUsageBreakdown.test.ts`, `chatContextUsageMobileInteraction.test.ts` (casos Coding Plan), `useCodingPlanEntryPlanList.test.ts`, `v4SessionQuotaBannerState.test.ts`. Start Plan: são **7** os `startPlan*.test.ts` reais em `packages/ui/test/` — `startPlanBucketQuota`, `startPlanContextBalanceRefresh`, `startPlanEntitlementAccess`, `startPlanQuotaReminderStore`, `startPlanRecommendation`, `startPlanRecommendationFreshness`, `startPlanStatusMeta` — mais `useStartPlanRecommendation.test.ts` à parte; remover/substituir conforme o símbolo que cada um cobre.
- Alguns arquivos têm mistura de cenários (ex.: `modelProviderCodingPlan.test.ts`, `providerFamily*.test.ts`): remover só os casos do conjunto removido e manter os de API key/família.

**E2E/browser:** atualizar fixtures de `packages/ui/test/browser/manual-review/pending/` que exibem Start Plan (`start-plan-bucket-reminder.fixture.tsx`, `start-plan-followup.fixture.tsx`) e cenários E2E de welcome screen com OAuth (se existirem no suite do desktop) para o fluxo API-key. Novo cenário E2E: configuração de Z.ai via API key a partir da welcome screen até usage.

**Entrypoint de testes:** `packages/ui` **não tem script de teste próprio** (verificado no `packages/ui/package.json` — só devDeps de testing-library). Os testes rodam pela raiz com vitest: `pnpm test:unit` (`package.json` raiz, :35: `vitest run --exclude "packages/desktop/test/e2e/**/*.test.ts"`), variante afetada `pnpm test:unit:affected` (:36, usada pelo `verify:pre-push` :38); E2E desktop via `pnpm test:e2e` (:28). Registrar `pnpm test:unit`/`:affected` no checklist.

## 9. Riscos técnicos e mitigação

- **R-T1 — Dependência oculta de entitlement:** `useUsageEntitlement`/`useStableAccountAccess` podem ter consumidores fora do conjunto mapeado (ex.: `lib/codingPlanUsageSources.ts`, `lib/modelSelectionGroups.ts`, `root/accountConnectionLossSuggestion.ts`, `root/oauthProviderFamilySelectionRefresh.ts` apareceram no grep). Mitigação: varredura por símbolo na Fase 1 antes de deletar o hook; deletar só o que zerar no `dep:refs`. `useStableAccountAccess` tem consumidor sobrevivente (`hooks/useUsageStats.ts:14,89,271`) — **não deletar**. O ecossistema quota-reset do Coding Plan (`codingPlanQuotaReset*`, hook/coordinator + ~8 testes) está **fora de escopo** desta feature e consome `useStableAccountAccess` (`hooks/useCodingPlanQuotaResetUi.ts:13,377`).
- **R-T2 — Import circulares ao remover:** `utils.tsx` (`resolveOAuthProviderIdByPreset`) e `providerFamilyConnectionVisibility.ts` cruzam presets e famílias de provider; remoções podem expor imports mortos que o lint não pega. Mitigação: `pnpm knip` + `pnpm architecture:check --changed` por fase.
- **R-T3 — Drift do predicado de banner:** `useMarketingBannerVisible` é compartilhado entre `MarketingTouchProvider` e `SidebarBottomActivity`; alterar só um lado recria o drift já documentado no código (:373). Mitigação: mudança única e atômica (§3.4).
- **R-T4 — Testes mistos:** deletar arquivos inteiros de teste que contenham casos de API-key reduziria cobertura de paridade. Mitigação: poda por caso, não por arquivo, nos listados no §8.
- **R-T5 — Estado local residual:** stores de dismissal/reminder do banner v4 persistidos podem ser lidos por código remanescente. Mitigação: grep pelos stores no fechamento da Fase 2.

## 10. Plano de implementação (ordem e commits)

1. **Fase 1 (paridade núcleo):** (a) welcome screen RF-01–RF-04 + i18n `login.oauth.*`; (b) settings RF-05 + deleção de `oauthActions.ts`; (c) RF-09/RF-10 ecossistema preferred-provider + `useV4SessionQuotaBanner`/banner v4; (d) RF-13 smoke de API key. Commits separados por letra; gates: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, `pnpm knip`.
2. **Fase 2 (ofertas):** (a) RF-11 marketing/claim (com `SidebarBottomActivity`); (b) RF-12/12a recomendações + badges; (c) RF-12b upgrade/compra; (d) RF-06–RF-08 cards/hints.
3. **Fase 3 (limpeza):** RF-14 (auditoria: zero chamadas UI a `startOAuth`/`claimManualPlan`), RF-15 (i18n final), evento de migração + ajuste de fixtures/E2E.

## 11. Rastreabilidade RF/RNF → seção

| Requisito (PRD) | Seções no TECH |
|---|---|
| RF-01–RF-04 (welcome sem OAuth, sem prioridade) | §3.1, §6, §8, §10.1 |
| RF-05 (oauthActions/settings login) | §3.2, §4, §10.1 |
| RF-06–RF-08 (cards preço/saldo/promo, hints) | §3.2, §6, §10.2d |
| RF-09 (preferred-provider UI inteira + banner v4) | §3.3, §10.1c |
| RF-10 (usage API-key via AppUsagePanel; sem caminho genérico) | §3.3, §9 (R-T1) |
| RF-11 (marketing/claim) | §3.4, §4, §6, §10.2a |
| RF-12 (recomendações + subagente) | §3.4, §6, §8, §10.2b |
| RF-12a (badges connection mode) | §3.4, §6, §10.2b |
| RF-12b (upgrade/compra) | §3.2, §6, §10.2c |
| RF-13 (paridade API key) | §3.1–3.3, §8 (E2E), §10.1d |
| RF-14 (nenhuma chamada OAuth/Coding Plan da UI) | §4, §10.3 |
| RF-15 (i18n órfão) | §6, §10.3 |
| RNF-01 (perf) | §3.3 (menos fetch no mount) |
| RNF-02 (acessibilidade) | §3.1, §3.3 (estados neutros) |
| RNF-03 (telemetria de migração) | §7 |
| RNF-04/RNF-05 (design/build) | §4, §10 (gates por fase) |

**Checklist final de verificação:** `pnpm typecheck` · `pnpm lint` · `pnpm architecture:check --changed` · `pnpm knip` · grep M1 do PRD zerado · testes de `packages/ui` do §8 verdes.
