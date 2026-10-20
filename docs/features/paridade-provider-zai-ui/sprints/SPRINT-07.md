# SPRINT-07 — Limpeza final: i18n órfão, telemetria de migração, fixtures/E2E e auditoria RF-14

## Objetivo
Fechar a feature: limpar strings i18n órfãs nos dois locales, emitir o único evento de migração `zai_ui_parity_surface`, ajustar fixtures/E2E, deletar a lib condicional `accountProviderAccess` e auditar que nenhum caminho de UI chama OAuth/Coding Plan services.

## Depende de
SPRINT-01, SPRINT-02, SPRINT-03, SPRINT-04, SPRINT-05, SPRINT-06

## Onda
4 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/lib/appTelemetry.ts` — alterar (A22) — adicionar emissão do `zai_ui_parity_surface` (tipo `pv`, campo de desfecho; via `reportAppTelemetryEvent` existente; nota em chinês explicando expiração em 1 release)
- `packages/ui/src/i18n/locales/en-US.ts` — alterar (A23) — remover blocos :4-13 (`startPlan.recommendation.*`), :226-283 (`manualClaimPlan.*`), :982-995 (`login.oauth.*`), :3416-3426 e :3649-3653 (`codingPlan.start.*`, `firstPromo`, `paymentDialog.*`) + adjacentes órfãos e `connectionMode.startPlan*`/`startPlanBadge`/`codingPlanBadge`
- `packages/ui/src/i18n/locales/zh-CN.ts` — alterar (A24) — espelho de A23 (:4-11 verificado; demais por grep)
- `packages/ui/src/lib/accountProviderAccess.ts` — remover (R34 — **condicional**: só se `pnpm dep:refs` zerar após ajustes das SPRINT-02/05)
- `packages/ui/src/hooks/useStableAccountAccess.ts` — reavaliar (A21 — **não deletar nesta feature**: tem consumidor sobrevivente em `hooks/useUsageStats.ts:14,89,271`; rodar `pnpm dep:refs --list-exports` e registrar o resultado, sem mudança de código)
- `packages/ui/test/accountProviderAccess.test.ts` — remover (somente se R34 confirmar)
- `packages/ui/test/zaiUiParityTelemetry.test.ts` — criar (C1) — emissão do evento, campo de desfecho e ausência de outros eventos novos
- `packages/ui/test/browser/manual-review/pending/start-plan-bucket-reminder.fixture.tsx` + `.test.mjs` — alterar — remover ou converter em fixture de estado neutro
- `packages/ui/test/browser/manual-review/pending/start-plan-followup.fixture.tsx` + `.test.mjs` — alterar — idem
- Cenários E2E do desktop com OAuth na welcome screen (`packages/desktop/test/e2e`, se existirem) — alterar — substituir pelo fluxo API key

## Passos de implementação
1. Implementar o evento `zai_ui_parity_surface` em `appTelemetry.ts` (A22): emitido na welcome screen/settings com campo de desfecho (superfície visível + configuração API-key concluída na sessão); nota de código em chinês documentando expiração em 1 release (CA-22). Nenhum outro evento novo.
2. Rodar a checagem de chaves i18n não usadas do pacote; apagar em `en-US.ts` e `zh-CN.ts` (A23/A24) os blocos do inventário §2.6 da SPEC. Nenhuma chave nova é criada.
3. Decidir R34: rodar `pnpm dep:refs --list-exports packages/ui/src/lib/accountProviderAccess.ts`; se zerar, deletar a lib + `test/accountProviderAccess.test.ts`.
4. Converter/remover as fixtures `start-plan-bucket-reminder` e `start-plan-followup`; verificar `provider-settings-batch` e `provider-family-responsive` sem regressão (CA-23).
5. Auditoria RF-14 (CA-17): grep por `startOAuth` e `claimManualPlan` em `packages/ui/src` zerado; `hooks/useOAuth.ts` não existe; nenhum arquivo importa `oauthService.startOAuthWithPolling`.
6. Novo cenário E2E: configuração de Z.ai via API key a partir da welcome screen até usage (CA-16); remover/substituir cenários E2E de OAuth na welcome, se existirem.

## Testes obrigatórios
- Criar `zaiUiParityTelemetry.test.ts` (C1): evento único, campo de desfecho, eventos genéricos de API key preservados, `add_model_success` com `login_default: "1"` removido.
- Fixtures manual-review atualizadas e verdes; suíte unit completa (`pnpm test:unit`) verde no fechamento.

## Critérios de aceitação
- [ ] CA-16 (RF-13): E2E/fixture novo: configurar Z.ai via API key a partir da welcome screen até ver usage, com fluxo/cards/validação/ordenação idênticos a outro provedor por chave (sem logo em destaque, sem badge "Free", sem "Connect Z.ai").
- [ ] CA-17 (RF-14): Auditoria: grep por `startOAuth` e `claimManualPlan` em `packages/ui/src` zerado; `hooks/useOAuth.ts` não existe e nenhum arquivo importa `oauthService.startOAuthWithPolling`.
- [ ] CA-18 (RF-15): Checagem de chaves i18n não usadas zera o inventário do §2.6 em **ambos** os locales; `grep -c` confirma ausência de `manualClaimPlan.`, `startPlan.recommendation.`, `login.oauth.` nos dois arquivos.
- [ ] CA-20 (RNF-02): Estados vazios (aba usage sem provedor; slot da sidebar sem banner) têm texto acessível e nenhuma região aria-live vazia referenciada (inspeção + teste dos componentes sobreviventes).
- [ ] CA-21 (RNF-03): Único evento novo é `zai_ui_parity_surface`, emitido via `reportAppTelemetryEvent`, com campo de desfecho; `zaiUiParityTelemetry.test.ts` cobre emissão e desfecho; eventos genéricos de API key preservados; `add_model_success` com `login_default: "1"` removido.
- [ ] CA-22 (RNF-03): Nota de código (em chinês) no emissor documenta a expiração em 1 release e a remoção agendada.
- [ ] CA-23 (RNF-04): Telas alteradas seguem `DESIGN.md` e reutilizam os cards/fluxos genéricos existentes (revisão visual + fixture `provider-settings-batch` sem regressão).
- [ ] CA-24 (RNF-05): `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` e `pnpm knip` verdes no fechamento final; `pnpm knip` sem exports órfãos do conjunto removido.

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test:unit -- packages/ui/test/zaiUiParityTelemetry.test.ts
pnpm test:unit
pnpm test:unit:affected
pnpm architecture:check --changed
pnpm test:e2e
```
