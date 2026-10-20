# SPRINT-04 — Recomendações de plano e badges de connection mode (RF-12/RF-12a)

## Objetivo
Remover a oferta proativa de Start Plan (inclusive a de troca de modelo de subagente) e os badges promocionais de connection mode, preservando a troca manual de modelo.

## Depende de
SPRINT-02 (SessionPane sem pontos de recomendação) e SPRINT-03 (`useStartPlanEntitlement` deletado)

## Onda
2 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/settings/SubagentsSection.tsx` — alterar (A10) — remover `useStartPlanRecommendation` (:2, :609, :674, :817, :1008) e badges (:1320-1321); troca manual permanece
- `packages/ui/src/settings/AutomationEditView.tsx` — alterar (A11) — remover hook (import :2, chamada :1770) e badges de connection mode (:1494-1505)
- `packages/ui/src/hooks/useStartPlanRecommendation.ts` — remover (R29) — consumidores (SubagentsSection, AutomationEditView, SessionPane) já ajustados
- `packages/ui/test/startPlanRecommendation.test.ts` — remover
- `packages/ui/test/startPlanRecommendationFreshness.test.ts` — remover
- `packages/ui/test/useStartPlanRecommendation.test.ts` — remover
- `packages/ui/test/subagentsSection.test.ts` — alterar (poda) — remover só os casos de oferta; manter troca manual
- `packages/ui/test/highspeed/sessionPaneHighspeedActivation.test.ts` — alterar (poda) — remover casos da recomendação; highspeed integralmente preservado
- `packages/ui/test/highspeed/highspeedVisibilityRefresh.test.ts` — alterar (poda) — idem

## Passos de implementação
1. Em `SubagentsSection.tsx`, remover import/usos do hook e as passagens de badge (:1320-1321).
2. Em `AutomationEditView.tsx`, remover import/chamada do hook (:2, :1770) e as passagens `connectionMode.startPlan`/`startPlanBadge`/`codingPlanBadge` (:1494-1505).
3. Confirmar com `pnpm dep:refs --list-exports packages/ui/src/hooks/useStartPlanRecommendation.ts` que não sobra consumidor e deletar o hook (R29).
4. Podar por caso (R-T4): `subagentsSection.test.ts` (casos de oferta fora), testes highspeed (só mock/asserções de `recommendStartPlan`; cenários highspeed preservados integralmente).

## Testes obrigatórios
- Remover `startPlanRecommendation.test.ts`, `startPlanRecommendationFreshness.test.ts`, `useStartPlanRecommendation.test.ts` (cobrem só o conjunto removido).
- Podar `subagentsSection.test.ts` e os dois testes highspeed por caso, não por arquivo.
- Teste de troca manual de modelo de subagente verde.

## Critérios de aceitação
- [ ] CA-13 (RF-12): `useStartPlanRecommendation`/`useStartPlanEntitlement` deletados; `SubagentsSection`, `AutomationEditView` e `SessionPane` sem oferta proativa; a troca manual de modelo de subagente continua operando (teste de troca manual verde).
- [ ] CA-14 (RF-12a): Badges `connectionMode.startPlan`/`startPlanBadge`/`codingPlanBadge` ausentes do código (a limpeza dos locales correspondente é fechada na SPRINT-07 sob CA-18); as telas de automação/subagente não exibem badge promocional.

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test:unit -- packages/ui/test/subagentsSection.test.ts
pnpm test:unit -- packages/ui/test/highspeed/sessionPaneHighspeedActivation.test.ts
pnpm test:unit -- packages/ui/test/highspeed/highspeedVisibilityRefresh.test.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
