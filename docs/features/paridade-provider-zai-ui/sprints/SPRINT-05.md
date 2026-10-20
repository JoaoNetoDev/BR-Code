# SPRINT-05 — Settings: cards de preço/saldo/promo, preview, hints de BigModel e OAuth de presets (RF-05–RF-08)

## Objetivo
Limpar a seção de provedores das settings de todo tratamento especial de Coding Plan/Start Plan e do login OAuth de presets, generalizando o hint de registro e deixando Z.ai/BigModel como cards comuns por API key.

## Depende de
nenhuma

## Onda
2 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/settings/ModelProviderSection.tsx` — alterar (A4) — remover import/chamada de `reportPresetSubscriptionSuccess` (:46, :637) e bloco de conclusão de assinatura (:625-650), import de `CodingPlanLoginOptions` (:46) e pontos de upgrade/preço/saldo — TODOS os pontos deste arquivo nesta sprint
- `packages/ui/src/settings/model-provider-section/oauthActions.ts` — remover (R2)
- `packages/ui/src/settings/model-provider-section/codingPlanPricingCards.ts` — remover (R3)
- `packages/ui/src/settings/model-provider-section/useCodingPlanProducts.ts` — remover (R4; confirmar helpers órfãos com `pnpm dep:refs` antes)
- `packages/ui/src/settings/model-provider-section/StartPlanBalanceCard.tsx` — remover (R5)
- `packages/ui/src/settings/model-provider-section/StartPlanCard.tsx` — remover (R6)
- `packages/ui/src/settings/model-provider-section/StartPlanQuotaStatusCard.tsx` — remover (R7)
- `packages/ui/src/settings/model-provider-section/useStartPlanPreview.ts` — remover (R8; consumidor único: StatusCards)
- `packages/ui/src/settings/model-provider-section/BigModelRegistrationHint.tsx` — remover (R12; hint generalizado no arquivo comum de cards, sem menção a BigModel — PRD Q5)
- `packages/ui/src/settings/model-provider-section/utils.tsx` — alterar (A5) — remover `resolveOAuthProviderIdByPreset` (:23) se `pnpm dep:refs` confirmar órfão
- `packages/ui/src/settings/model-provider-section/StatusCards.tsx` — alterar (A6) — remover branch Start Plan preview (:50, :333); card genérico permanece
- `packages/ui/test/codingPlanPricingCards.test.ts` — remover
- `packages/ui/test/startPlanStatusMeta.test.ts` — remover
- `packages/ui/test/modelProviderCodingPlan.test.ts` — alterar (poda) — remover só os casos Coding Plan; manter API key/família

## Passos de implementação
1. Em `ModelProviderSection.tsx`, remover o bloco de conclusão de assinatura e todos os pontos de upgrade/preço/saldo (A4) — o arquivo não é revisitado em outra sprint.
2. Deletar `oauthActions.ts` (R2) e, com `pnpm dep:refs`, confirmar órfão `resolveOAuthProviderIdByPreset` em `utils.tsx` antes de removê-lo (A5).
3. Deletar `codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`, os três cards Start Plan, `useStartPlanPreview.ts` e `BigModelRegistrationHint.tsx`; ajustar `StatusCards.tsx` para o card genérico.
4. Generalizar o hint de "obter API key" no arquivo comum de cards: qualquer preset por API key que declare URL de registro recebe o link neutro, sem tratamento especial de Z.ai/BigModel (RF-08/PRD Q5).

## Testes obrigatórios
- Remover `codingPlanPricingCards.test.ts` e `startPlanStatusMeta.test.ts`.
- Podar `modelProviderCodingPlan.test.ts` por caso: só os casos Coding Plan saem; casos de API key/família permanecem verdes.

## Critérios de aceitação
- [ ] CA-05 (RF-05): `oauthActions.ts` deletado; `ModelProviderSection.tsx` não chama `reportPresetSubscriptionSuccess`; grep por `startPresetSubscriptionLogin` zerado em `packages/ui`.
- [ ] CA-06 (RF-06): Os arquivos R3–R7 não existem; a seção de provedores não renderiza preço/promo/saldo do Coding Plan (a remoção das strings `settings.modelProvider.codingPlan.start.*`/`product.firstPromo` nos locales é fechada na SPRINT-07 sob CA-18).
- [ ] CA-08 (RF-08): `BigModelRegistrationHint.tsx` não existe; nenhum texto de UI menciona BigModel preferencialmente; hint de registro generalizado quando o preset o declara.

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm dep:refs --list-exports packages/ui/src/settings/model-provider-section/oauthActions.ts
pnpm test:unit -- packages/ui/test/modelProviderCodingPlan.test.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
