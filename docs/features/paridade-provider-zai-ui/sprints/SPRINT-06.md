# SPRINT-06 — Superfícies de upgrade/compra do Coding Plan e libs condicionais (RF-12b)

## Objetivo
Remover todas as superfícies de upgrade/compra do Coding Plan (diálogo, purchase auth, produtos enterprise, CTA de entrada), deixando os consumidores em estado neutro sem CTA, e deletar as libs/hooks do ecossistema que zerarem de consumidores (condicionais R31/R33/R35).

## Depende de
SPRINT-02 (SettingsPage/Detail/V4ComposerToolbar ajustados), SPRINT-03 (MarketingTouchProvider sem `openCodingPlanUpgrade`), SPRINT-04 (deleção de R31 exige `useStartPlanRecommendation` já removido), SPRINT-05 (ModelProviderSection/StatusCards ajustados)

## Onda
3 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/settings/CodingPlanUpgradeDialog.tsx` — remover (R13)
- `packages/ui/src/settings/CodingPlanUpgradeDialogProvider.tsx` — remover (R14)
- `packages/ui/src/settings/CodingPlanEntryButton.tsx` — remover (R15)
- `packages/ui/src/settings/model-provider-section/codingPlanPurchaseAuth.ts` — remover (R9)
- `packages/ui/src/settings/model-provider-section/enterpriseCodingPlanProducts.ts` — remover (R10)
- `packages/ui/src/settings/model-provider-section/useEnterpriseCodingPlanProducts.ts` — remover (R11)
- `packages/ui/src/settings/AutomationsSection.tsx` — alterar (A9) — remover upgrade dialog (:100, :534, :855-864) → estado neutro sem CTA
- `packages/ui/src/WorkspaceSidebar.tsx` — alterar (A12) — remover uso do upgrade dialog (:137) → sem CTA
- `packages/ui/src/lib/startPlanEntitlementOptions.ts` — remover (R31; consumidores `usePlanIdentitySnapshot`, `useStartPlanEntitlement`, `useStartPlanRecommendation`, `useV4SessionQuotaBanner` já removidos; `useCodingPlanEntitlements` removido nesta sprint)
- `packages/ui/src/settings/model-provider-section/useCodingPlanEntitlements.ts` — remover (R35; consumidores `useCodingPlanEntryPlanList`, `CodingPlanUpgradeDialog`, `ModelProviderSection`, `V4ComposerToolbar` removidos/ajustados) — deletar junto `hooks/useCodingPlanEntryPlanList.ts` quando `pnpm dep:refs` zerar
- `packages/ui/src/hooks/useUsageEntitlement.ts` — remover (R33 — **condicional**: só após todos os consumidores zerarem, §4.1 da SPEC)
- `packages/ui/test/codingPlanEntitlements.test.ts` — remover
- `packages/ui/test/codingPlanFunnelTelemetry.test.ts` — remover
- `packages/ui/test/codingPlanOwnedEntryPlans.test.ts` — remover
- `packages/ui/test/codingPlanEmbeddedWebview.test.ts` — remover
- `packages/ui/test/codingPlanUpgradeDialogProvider.test.ts` — remover
- `packages/ui/test/codingPlanEntryButton.test.ts` — remover
- `packages/ui/test/settingsModelProviderUpgradeIntent.test.ts` — remover
- `packages/ui/test/useCodingPlanEntryPlanList.test.ts` — remover

## Passos de implementação
1. Ajustar `AutomationsSection.tsx` (:100, :534, :855-864) e `WorkspaceSidebar.tsx` (:137): pontos de entrada viram estado neutro, sem CTA de upgrade.
2. Deletar `CodingPlanUpgradeDialog(.Provider)` e `CodingPlanEntryButton`; confirmar via grep que nenhum consumidor restante importa (`SettingsPage`, `WorkspaceSidebar`, `MarketingTouchProvider`, `Detail.tsx` já ajustados nas sprints 02/03/05).
3. Deletar `codingPlanPurchaseAuth.ts`, `enterpriseCodingPlanProducts.ts` e `useEnterpriseCodingPlanProducts.ts` (confirmar helpers órfãos com `pnpm dep:refs`).
4. Deletar `useCodingPlanEntitlements.ts` (+ `useCodingPlanEntryPlanList.ts` se zerar), `startPlanEntitlementOptions.ts` e, por último e condicionalmente, `useUsageEntitlement.ts` (R33) — somente após `pnpm dep:refs` zerar consumidores; `knip` fecha.
5. `useStableAccountAccess` NÃO é deletado (consumidor sobrevivente `hooks/useUsageStats.ts`; fora de escopo `useCodingPlanQuotaResetUi`).

## Testes obrigatórios
- Remover: `codingPlanEntitlements`, `codingPlanFunnelTelemetry`, `codingPlanOwnedEntryPlans`, `codingPlanEmbeddedWebview`, `codingPlanUpgradeDialogProvider`, `codingPlanEntryButton`, `settingsModelProviderUpgradeIntent`, `useCodingPlanEntryPlanList`.
- Suíte mista (`providerFamily*.test.ts` etc.): remover só casos do conjunto removido, se houver.

## Critérios de aceitação
- [ ] CA-10 (RF-10): `AppUsagePanel`/`useAppUsageStats` funcionam sem preferred provider (estado neutro entregue na SPRINT-02 segue válido); `useUsageEntitlement` (R33) e dependentes deletados conforme §4.1, com `pnpm knip` fechando sem exports órfãos.
- [ ] CA-15 (RF-12b): `CodingPlanUpgradeDialog(.Provider)`, `useStartPlanPreview` (deletado na SPRINT-05), `codingPlanPurchaseAuth`, `enterpriseCodingPlanProducts(.ts/hook)` e `CodingPlanEntryButton` deletados; consumidores (`SettingsPage`, `WorkspaceSidebar`, `MarketingTouchProvider`, `AutomationsSection`, `Detail.tsx`) em estado neutro sem CTA de upgrade.

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm dep:refs --list-exports packages/ui/src/hooks/useUsageEntitlement.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
