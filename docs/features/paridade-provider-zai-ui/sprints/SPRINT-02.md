# SPRINT-02 — Ecossistema entitlement/usage preferred-provider (RF-09/RF-10) e pontos de recomendação no v4

## Objetivo
Remover de toda a UI o ecossistema preferred-provider de entitlement/usage (SettingsPage, usage-stats, toolbar, sidebar, v4, banner de quota e stores), deixando a usage no caminho genérico `AppUsagePanel` → `useAppUsageStats` e o SessionPane sem recomendações/banner de quota.

## Depende de
nenhuma

## Onda
1 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/SettingsPage.tsx` — alterar (A3) — remover blocos `usageZai*`/`usageBigmodel*` (:408-437), os dois `useUsageEntitlement` com `preferredProviderId` (:438-463), passagens :512/:517, import de `CodingPlanUsagePanel` (:71); usage fica só com `AppUsagePanel` + estado neutro acessível
- `packages/ui/src/SettingsPage.tsx` — alterar (A3, pontos de upgrade dialog) — remover os imports e montagens de `CodingPlanUpgradeDialogProvider`/`CodingPlanUpgradeDialog` (:65, :605, :659-664) já nesta sprint (o componente só é deletado na SPRINT-06; deixar o import quebraria o typecheck da fronteira)
- `packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx` — remover (R16)
- `packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx` — remover (R17)
- `packages/ui/src/WorkspaceSidebarFooter.tsx` — alterar (A13) — remover montagem do usage summary; manter genérico
- `packages/ui/src/chat-input-toolbar/StartPlanContextBalance.tsx` — remover (R18, RF-07)
- `packages/ui/src/chat-input-toolbar/CodingPlanContextUsage.tsx` — remover (R19)
- `packages/ui/src/chat-input-toolbar/contextUsage.tsx` — alterar (A14) — remover referências ao card Coding Plan; breakdown genérico permanece
- `packages/ui/src/v4/useV4SessionQuotaBanner.ts` — remover (R20)
- `packages/ui/src/v4/ConversationQuotaBanner.tsx` — remover (R21)
- `packages/ui/src/v4/sessionQuotaBannerDismissalStore.ts` — remover (R22)
- `packages/ui/src/v4/startPlanQuotaReminderStore.ts` — remover (R23)
- `packages/ui/src/v4/SessionPane.tsx` — alterar (A15) — remover montagem do banner de quota, `usePlanIdentitySnapshot`, `resolveEntitledAccountProviderAccess` (:135, :3130) e pontos de recomendação (:1754, :2490, :2525) — TODOS os pontos deste arquivo nesta sprint
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx` — alterar (A16) — remover consumo do ecossistema preferred-provider/Coding Plan
- `packages/ui/src/hooks/usePlanIdentitySnapshot.ts` — remover (R32) — único consumidor externo: SessionPane
- `packages/ui/src/hooks/useUsageStats.ts` — alterar (A20) — só limpeza de imports mortos; `useAppUsageStats` (:191-206) intocado
- `packages/ui/src/settings/model-provider-section/Detail.tsx` — alterar (A7) — remover branches Coding Plan/Team Plan (:56, :99, :354-360) e import de `useCodingPlanEntryGate` (:1, :900)
- `packages/ui/test/v4SessionPaneModelSwitchRecovery.test.ts` — alterar (poda) — remover mock/asserções de `useStartPlanRecommendation`; manter recuperação de troca manual
- `packages/ui/test/chatContextUsageBreakdown.test.ts` — alterar (poda) — remover casos Coding Plan; manter breakdown genérico
- `packages/ui/test/chatContextUsageMobileInteraction.test.ts` — alterar (poda) — idem
- `packages/ui/test/v4SessionQuotaBannerState.test.ts` — remover
- `packages/ui/test/startPlanBucketQuota.test.ts` — remover
- `packages/ui/test/startPlanContextBalanceRefresh.test.ts` — remover
- `packages/ui/test/startPlanQuotaReminderStore.test.ts` — remover
- `packages/ui/test/planUsageArmsTelemetry.test.ts` — remover

## Passos de implementação
1. Remover em `SettingsPage.tsx` os probes/fingerprints e os dois `useUsageEntitlement` com preferred provider; estado neutro acessível para a aba usage sem provedor (RNF-02).
2. Deletar `CodingPlanUsagePanel`, `WorkspaceSidebarFooterUsageSummary` (+ ajuste do footer), `StartPlanContextBalance`, `CodingPlanContextUsage` (+ ajuste do `contextUsage.tsx`).
3. Deletar `useV4SessionQuotaBanner`, `ConversationQuotaBanner` e os dois stores de dismissal; `SessionPane` para de montá-los.
4. Em `SessionPane.tsx`, remover TODOS os pontos listados em A15 (quota banner, `usePlanIdentitySnapshot`, `resolveEntitledAccountProviderAccess`, recomendações) — o arquivo não é revisitado em outra sprint. Ajustar `V4ComposerToolbar` (A16).
5. Deletar `usePlanIdentitySnapshot` (R32); limpar imports mortos de `useUsageStats.ts` (A20) sem tocar `useAppUsageStats`; ajustar `Detail.tsx` (A7).
6. Grep de fechamento: nenhum leitor remanescente dos stores deletados (R-T5); `useStableAccountAccess` NÃO é deletado (consumidor sobrevivente `useUsageStats.ts`; fora de escopo `useCodingPlanQuotaResetUi`).

## Testes obrigatórios
- Podar `v4SessionPaneModelSwitchRecovery.test.ts`, `chatContextUsageBreakdown.test.ts`, `chatContextUsageMobileInteraction.test.ts` por caso (R-T4).
- Remover `v4SessionQuotaBannerState`, `startPlanBucketQuota`, `startPlanContextBalanceRefresh`, `startPlanQuotaReminderStore`, `planUsageArmsTelemetry`.
- `appUsagePanel.test.ts` (existente, intocado) deve continuar verde: caminho genérico de usage preservado.

## Critérios de aceitação
- [ ] CA-07 (RF-07): `StartPlanContextBalance.tsx` deletado e a toolbar do chat não monta card de saldo Start Plan (teste da toolbar atualizado confirma).
- [ ] CA-09 (RF-09): Grep por `preferredProviderId` em `packages/ui/src` retorna zero ocorrências apontando `zaiIndividualCodingPlan`/`bigmodelIndividualCodingPlan`/`zaiStartPlan`/`bigmodelStartPlan` nos arquivos desta sprint; `useV4SessionQuotaBanner.ts`, `ConversationQuotaBanner.tsx` e os dois stores não existem; `SessionPane` não monta banner de quota nem oferta recomendação. Nota: o grep GLOBAL sobre `packages/ui/src` só zera no fechamento (SPRINT-07 revalida junto com CA-17/CA-24), pois `MarketingTouchProvider` (S3) e `ModelProviderSection` (S5) ainda têm ocorrências na onda 1.
- [ ] CA-19 (RNF-01): Nenhum fetch de entitlement/produtos disparado no mount da settings (probes preferred-provider não existem; mock de rede no teste confirma ausência de chamadas).

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test:unit -- packages/ui/test/appUsagePanel.test.ts
pnpm test:unit -- packages/ui/test/v4SessionPaneModelSwitchRecovery.test.ts
pnpm test:unit -- packages/ui/test/chatContextUsageBreakdown.test.ts
pnpm test:unit -- packages/ui/test/chatContextUsageMobileInteraction.test.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
