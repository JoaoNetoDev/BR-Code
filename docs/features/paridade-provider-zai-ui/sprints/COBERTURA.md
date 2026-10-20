# COBERTURA — item da SPEC → sprint

Cada item da SPEC §5 pertence a EXATAMENTE UMA sprint. Ondas: 1 = S1,S2,S3 · 2 = S4,S5 · 3 = S6 · 4 = S7.

## Remoções de produção (R2–R36)

| Item | Sprint | Observação |
|---|---|---|
| R2 `oauthActions.ts` | S5 | |
| R3 `codingPlanPricingCards.ts` | S5 | |
| R4 `useCodingPlanProducts.ts` | S5 | |
| R5 `StartPlanBalanceCard.tsx` | S5 | |
| R6 `StartPlanCard.tsx` | S5 | |
| R7 `StartPlanQuotaStatusCard.tsx` | S5 | |
| R8 `useStartPlanPreview.ts` | S5 | consumidor StatusCards na mesma sprint |
| R9 `codingPlanPurchaseAuth.ts` | S6 | |
| R10 `enterpriseCodingPlanProducts.ts` | S6 | |
| R11 `useEnterpriseCodingPlanProducts.ts` | S6 | |
| R12 `BigModelRegistrationHint.tsx` | S5 | |
| R13 `CodingPlanUpgradeDialog.tsx` | S6 | |
| R14 `CodingPlanUpgradeDialogProvider.tsx` | S6 | |
| R15 `CodingPlanEntryButton.tsx` | S6 | |
| R16 `CodingPlanUsagePanel.tsx` | S2 | |
| R17 `WorkspaceSidebarFooterUsageSummary.tsx` | S2 | |
| R18 `StartPlanContextBalance.tsx` | S2 | |
| R19 `CodingPlanContextUsage.tsx` | S2 | |
| R20 `useV4SessionQuotaBanner.ts` | S2 | |
| R21 `ConversationQuotaBanner.tsx` | S2 | |
| R22 `sessionQuotaBannerDismissalStore.ts` | S2 | |
| R23 `startPlanQuotaReminderStore.ts` | S2 | |
| R24 `MarketingDialogs.tsx` | S3 | reclassificado: alterar (só o diálogo neutro sobrevive — decisão F-03-1) |
| R25 `useMarketingTaskCompletionRefresh.ts` | S3 | |
| R26 `manualClaimFailureMessage.ts` | S3 | |
| R27 `manualClaimPlanStartUsing.ts` | S3 | |
| R28 `request-security-edition/claim.ts` | S3 | |
| R29 `useStartPlanRecommendation.ts` | S4 | |
| R30 `useStartPlanEntitlement.ts` | S3 | |
| R31 `startPlanEntitlementOptions.ts` | S6 | último consumidor (R35) zerado na S6 |
| R32 `usePlanIdentitySnapshot.ts` | S2 | |
| R33 `useUsageEntitlement.ts` | S6 | **condicional** (§4.1) |
| R34 `accountProviderAccess.ts` | S7 | **condicional** (dep:refs) |
| R35 `useCodingPlanEntitlements.ts` | S6 | |
| R36 `hooks/useOAuth.ts` | S1 | |

## Alterações de produção (A1–A24)

| Item | Sprint | Observação |
|---|---|---|
| A1 `WelcomeScreen.tsx` | S1 | |
| A2 `App.tsx` | S3 | |
| A3 `SettingsPage.tsx` | S2 | |
| A4 `ModelProviderSection.tsx` | S5 | todos os pontos (RF-05/06/12b) numa única sprint |
| A5 `utils.tsx` | S5 | |
| A6 `StatusCards.tsx` | S5 | |
| A7 `Detail.tsx` | S2 | |
| A8 `marketingTouchController.ts` | S3 | |
| A9 `AutomationsSection.tsx` | S6 | |
| A10 `SubagentsSection.tsx` | S4 | |
| A11 `AutomationEditView.tsx` | S4 | |
| A12 `WorkspaceSidebar.tsx` | S6 | |
| A13 `WorkspaceSidebarFooter.tsx` | S2 | |
| A14 `contextUsage.tsx` | S2 | |
| A15 `SessionPane.tsx` | S2 | todos os pontos (RF-09+RF-12) numa única sprint |
| A16 `V4ComposerToolbar.tsx` | S2 | |
| A17 `MarketingTouchProvider.tsx` | S3 | |
| A18 `useMarketingBannerVisible.ts` | S3 | |
| A19 `SidebarBottomActivity.tsx` | S3 | |
| A20 `useUsageStats.ts` | S2 | |
| A21 `useStableAccountAccess.ts` | S7 | reavaliação com dep:refs (não deletar) |
| A22 `appTelemetry.ts` | S7 | |
| A23 `en-US.ts` | S7 | |
| A24 `zh-CN.ts` | S7 | |

## Testes a remover (22)

| Teste | Sprint |
|---|---|
| `codingPlanPricingCards.test.ts` | S5 |
| `codingPlanEntitlements.test.ts` | S6 |
| `codingPlanFunnelTelemetry.test.ts` | S6 |
| `codingPlanOwnedEntryPlans.test.ts` | S6 |
| `codingPlanEmbeddedWebview.test.ts` | S6 |
| `codingPlanUpgradeDialogProvider.test.ts` | S6 |
| `codingPlanEntryButton.test.ts` | S6 |
| `manualClaimPlanStartUsing.test.ts` | S3 |
| `marketingTaskCompletionRefresh.test.ts` | S3 |
| `settingsModelProviderUpgradeIntent.test.ts` | S6 |
| `planUsageArmsTelemetry.test.ts` | S2 |
| `useCodingPlanEntryPlanList.test.ts` | S6 |
| `v4SessionQuotaBannerState.test.ts` | S2 |
| `startPlanBucketQuota.test.ts` | S2 |
| `startPlanContextBalanceRefresh.test.ts` | S2 |
| `startPlanEntitlementAccess.test.ts` | S3 |
| `startPlanQuotaReminderStore.test.ts` | S2 |
| `startPlanStatusMeta.test.ts` | S5 |
| `accountProviderAccess.test.ts` | S7 (condicional) |
| `startPlanRecommendation.test.ts` | S4 |
| `startPlanRecommendationFreshness.test.ts` | S4 |
| `useStartPlanRecommendation.test.ts` | S4 |

## Testes a podar (9+)

| Teste | Sprint |
|---|---|
| `rootOAuthCallbackHandling.test.ts` | S1 |
| `v4SessionPaneModelSwitchRecovery.test.ts` | S2 (SessionPane ajustado na S2) |
| `highspeed/sessionPaneHighspeedActivation.test.ts` | S4 |
| `highspeed/highspeedVisibilityRefresh.test.ts` | S4 |
| `marketingTouchProvider.test.ts` | S3 |
| `modelProviderCodingPlan.test.ts` | S5 |
| `subagentsSection.test.ts` | S4 |
| `chatContextUsageBreakdown.test.ts` | S2 |
| `chatContextUsageMobileInteraction.test.ts` | S2 |

## Testes a criar (2)

| Teste | Sprint |
|---|---|
| C1 `zaiUiParityTelemetry.test.ts` | S7 |
| C2 `welcomeScreenApiKeyOnly.test.ts` | S1 |

## Fixtures/E2E (4)

| Item | Sprint |
|---|---|
| `start-plan-bucket-reminder.fixture.tsx` + `.test.mjs` | S7 |
| `start-plan-followup.fixture.tsx` + `.test.mjs` | S7 |
| E2E desktop OAuth welcome (se existir) — substituir por API key | S7 |
| Novo E2E: Z.ai via API key da welcome até usage (CA-16) | S7 |

## Critérios de aceite (CA-01..CA-24) — cada um em exatamente uma sprint

| CA | Sprint |
|---|---|
| CA-01, CA-02, CA-03, CA-04 | S1 |
| CA-07, CA-09, CA-19 | S2 |
| CA-11, CA-12 | S3 |
| CA-13, CA-14 | S4 |
| CA-05, CA-06, CA-08 | S5 |
| CA-10, CA-15 | S6 |
| CA-16, CA-17, CA-18, CA-20, CA-21, CA-22, CA-23, CA-24 | S7 |

Nota: CA-03/CA-06/CA-14 mencionam locales; a verificação de código é feita na sprint dona, e a limpeza/verificação dos blocos de locale em ambos os arquivos é fechada una vez na S7 sob CA-18 (A23/A24 são arquivos únicos, logo não podem ser divididos entre sprints da mesma onda).
