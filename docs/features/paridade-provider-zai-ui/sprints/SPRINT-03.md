# SPRINT-03 — Marketing: remoção do claim de plano (RF-11) com handler silencioso

## Objetivo
Remover todos os caminhos de `claim_zcode_plan`/`claimManualPlan` da UI (banner, dialogs, manual-claim-plan, stub de claim, hook de entitlement e refresh pós-task), mantendo o mecanismo neutro (poller, banner de imagem, `open_url`) e ignorando toques legados com log `debug`.

## Depende de
nenhuma

## Onda
1 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/App.tsx` — alterar (A2) — remover `useMarketingTaskCompletionRefresh` (:68, :286)
- `packages/ui/src/components/marketing-touch/MarketingTouchProvider.tsx` — alterar (A17) — remover branch `claim_zcode_plan` (:250-295), `useRequestVerificationPrewarm` (:365-372), `useStartPlanEntitlement`; handler pós-remoção ignora claim com log `debug`. **A cadeia `openCodingPlanUpgrade`/`finishMarketingNavigation` PERMANECE** — `navigate → page:"upgrade"` é caminho neutro consumido por MTA-07/MTE-15
- `packages/ui/src/components/marketing-touch/marketingTouchController.ts` — alterar (A8) — remover ramais `claim_zcode_plan` (:209, :236); manter `open_url` e ações neutras
- `packages/ui/src/components/marketing-touch/useMarketingBannerVisible.ts` — alterar (A18) — predicado sem claim (atômico com A19)
- `packages/ui/src/sidebar-activity/SidebarBottomActivity.tsx` — alterar (A19) — slot exibe apenas fallback highspeed
- `packages/ui/src/components/marketing-touch/MarketingDialogs.tsx` — alterar (R24 reclassificado, decisão F-03-1): remove `MarketingFailureDialog` e o handler `claim_plan`; o `CloudContentDialog` neutro permanece (consumido por ~15 E2E)
- `packages/ui/src/components/marketing-touch/useMarketingTaskCompletionRefresh.ts` — remover (R25; revalidar com `pnpm dep:refs` antes)
- `packages/ui/src/components/manual-claim-plan/manualClaimFailureMessage.ts` — remover (R26)
- `packages/ui/src/components/manual-claim-plan/manualClaimPlanStartUsing.ts` — remover (R27)
- `packages/ui/src/request-security-edition/claim.ts` — remover (R28; `messages.ts` permanece)
- `packages/ui/src/hooks/useStartPlanEntitlement.ts` — remover (R30; único consumidor: `MarketingTouchProvider.tsx`)
- `packages/ui/test/marketingTouchProvider.test.ts` — alterar — substituir cenários de claim pelo handler silencioso (§3.3 da SPEC); manter poller/banner neutro/`open_url`
- `packages/ui/test/manualClaimPlanStartUsing.test.ts` — remover
- `packages/ui/test/marketingTaskCompletionRefresh.test.ts` — remover
- `packages/ui/test/startPlanEntitlementAccess.test.ts` — remover

## Passos de implementação
1. Em `MarketingTouchProvider.tsx`, remover o branch de execução de `claim_zcode_plan`, prewarm, `openCodingPlanUpgrade` e `MarketingDialogs`; incluir handler de ação não suportada: toque com `action.type === "claim_zcode_plan"` é ignorado silenciosamente com log `debug` (sem warn/error/UI) — Risco R3 do PRD.
2. Em `marketingTouchController.ts`, remover os ramais `claim_zcode_plan` (:209, :236) mantendo `open_url`; mudança atômica de `useMarketingBannerVisible` + `SidebarBottomActivity` (R-T3).
3. Alterar `MarketingDialogs.tsx` (só o diálogo neutro sobrevive); deletar `useMarketingTaskCompletionRefresh.ts` (antes confirmar consumidores só no fluxo de claim via `pnpm dep:refs`), diretório `manual-claim-plan/`, `request-security-edition/claim.ts` e `useStartPlanEntitlement.ts`; remover o efeito em `App.tsx:286` sem alterar o ciclo de task/session.
4. Atualizar `marketingTouchProvider.test.ts`: assert de que claim só gera log `debug`, sem warn/error, sem UI; `open_url` e banner de imagem continuam.

## Testes obrigatórios
- `marketingTouchProvider.test.ts`: handler silencioso de `claim_zcode_plan` (apenas log `debug`), `open_url` intacto, banner de imagem intacto, sem `MarketingDialogs`.
- Remover `manualClaimPlanStartUsing.test.ts`, `marketingTaskCompletionRefresh.test.ts`, `startPlanEntitlementAccess.test.ts`.

## Critérios de aceitação
- [ ] CA-11 (RF-11): Grep por `claim_zcode_plan` e `claimManualPlan` em `packages/ui/src` zerado; `manual-claim-plan/`, `claim.ts` e `MarketingFailureDialog.tsx` não existem (o `MarketingDialogs.tsx` neutro permanece — decisão F-03-1); `marketingTouchController.ts` sem ramais `claim_zcode_plan` (:209, :236); `marketingTouchProvider.test.ts` cobre o handler silencioso.
- [ ] CA-12 (RF-11): Toque com `claim_zcode_plan` não gera warn/error nem UI (assert: apenas log `debug`); `open_url` e banner de imagem funcionam; `SidebarBottomActivity` e `useMarketingBannerVisible` alterados atomicamente (fallback highspeed visível).

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test:unit -- packages/ui/test/marketingTouchProvider.test.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
