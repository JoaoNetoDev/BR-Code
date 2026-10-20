# Cobertura e ondas

## Ondas

| Onda | Sprints | Paralelismo |
|---|---|---|
| 1 | SPRINT-01 | — |
| 2 | SPRINT-02, SPRINT-03 | paralelas — nenhum arquivo em comum |
| 3 | SPRINT-04, SPRINT-05 | paralelas — nenhum arquivo em comum |
| 4 | SPRINT-06 | isolada — precisa de baseline capturada antes da feature |

## Dependências

```
SPRINT-01 ──> SPRINT-02 ─────────────┐
                                   ├──> SPRINT-05 ──> SPRINT-06
SPRINT-03 ──> SPRINT-04              │
            └──> SPRINT-05 ──────────┘
```

Não há dependência circular. SPRINT-03 não depende de SPRINT-01 nem de SPRINT-02, e por isso pode correr já na Onda 2. A SPRINT-05 depende de SPRINT-04 apenas pelo **critério de auditoria** do repositório (o caso E2E novo precisa estar registrado e a Onda 3 precisa fechar), não por arquivos — por isso 04 e 05 continuam paralelas na Onda 3 e apenas a 06 é serial.

**SPRINT-06 é a única sprint em Onda própria:** a métrica M4 compara com uma baseline que só existe **antes** da mudança. Executá-la junto das demais tornaria a comparação impossível.

## Cobertura total da SPEC

Os 33 itens da SPEC §5 têm destino. Nenhum item fica sem sprint.

| # | Item da SPEC §5 | Sprint |
|---|---|---|
| 1 | `agent-catalog-plugin/package.json` | 01 |
| 2 | `agent-catalog-plugin/.zcode-plugin/plugin.json` | 01 |
| 3 | `agents/code-reviewer.md` | 01 |
| 4 | `agents/repo-researcher.md` | 01 |
| 5 | `agents/test-triager.md` | 01 |
| 6 | `agents/long-form-summarizer.md` | 01 |
| 7 | `official-plugin-definitions.ts` | 01 |
| 8 | `sea-official-plugin-assets.mjs` | 01 |
| 9 | `prepare-agent-node-bundle.mjs` | 01 |
| 10 | `prepare-prebuilds.mjs` | 01 |
| 11 | `zcodeAgentOfficialPluginAssets.ts` | 01 |
| 12 | `subagent-runtime-config.ts` | 03 |
| 13 | `agent-listing-metadata.ts` | 02 |
| 14 | `subagent/listing.ts` | 02 |
| 15 | `subagent/profile.ts` | 02 |
| 16 | `bootstrap/src/subagents.ts` | 03 |
| 17 | `bootstrap/src/app/create-app.ts` | 03 |
| 18 | `services/subagents/subagentRuntimeConfig.ts` (verificar) | 03 |
| 19 | `SubagentsSection.tsx` | 04 |
| 20 | `i18n/locales/en-US.ts`, `zh-CN.ts` | 04 |
| 21 | `packages/ui/test/subagentsSectionI18n.test.ts` | 04 |
| 22 | `bootstrap/tests/plugins.test.ts` | 01 |
| 23 | `bootstrap/tests/helpers/subagents.ts` | 03 |
| 24 | `bootstrap/tests/plugin-agent-disable.test.ts` | 03 |
| 25 | `core/tests/agent-listing.test.ts` | 02 |
| 26 | `core/tests/agent-listing-runtime.test.ts` | 02 |
| 27 | `core/tests/subagent-profile.test.ts` | 02 |
| 28 | `core/tests/subagent-catalog-integration.test.ts` | 02 |
| 29 | `adapters/tests/agent-listing-wire.test.ts` | 02 |
| 30 | `bootstrap/tests/subagents.test.ts` | 03 |
| 31 | `e2e/conversation-session/conversation-session-subagent-catalog.test.ts` | 05 (T-11), 06 (T-12) |
| 32 | `packages/ui/test/subagentsSectionCatalog.test.ts` | 04 |
| 33 | `docs/conversation-session-case-catalog.md` | 05 |
| 34 | `docs/testing/conversation-session-e2e-coverage-matrix.md` | 05 |

*Os itens 32–34 foram acrescentados pela validação adversarial das sprints: o arquivo de teste de UI que faltava nesta tabela, e os dois documentos de registro exigidos pela auditoria de cobertura de casos E2E do repositório (`pnpm audit:conversation-session-coverage`). O item 31 é tocado por duas sprints de ondas diferentes — T-11 na Onda 3 e T-12 na Onda 4 — o que é permitido, porque Onda 3 e Onda 4 são seriais.*

## Não-sobreposição dentro de cada onda

| Onda | Verificação |
|---|---|
| 2 | SPRINT-02 toca `core/src/{agent,subagent}`, `core/tests`, `adapters/tests`. SPRINT-03 toca `packages/shared`, `bootstrap/src`, `bootstrap/tests`, `packages/services`. **Disjuntos.** |
| 3 | SPRINT-04 toca `packages/ui` e `packages/ui/test`. SPRINT-05 toca `packages/desktop/test/e2e` e `docs/`. **Disjuntos.** |

## Cobertura de testes

| Teste | Sprint |
|---|---|
| T-01, T-02 | 02 |
| T-03, T-04, T-05, T-06, T-15 | 02 |
| T-07, T-13, T-14 | 03 |
| T-08, T-16 | 04 |
| T-09, T-10 | 01 |
| T-11 | 05 |
| T-12 | 06 |

Todos os 16 testes da SPEC §7 têm sprint.

## Cobertura de critérios de aceitação

| CA | Sprint |
|---|---|
| CA-01 | 05 |
| CA-02, CA-03 | 02 |
| CA-04, CA-05 | 01 |
| CA-06, CA-07, CA-08 | 02 |
| CA-09, CA-10 | 02 |
| CA-11 | 03 |
| CA-12 | 03 (caminho do runtime) e 04 (toggle e reload) |
| CA-13, CA-18 | 04 |
| CA-14, CA-15, CA-16, CA-17, CA-22 | 02 |
| CA-21 | 05 (afirmado dentro de T-11) |
| CA-19 | 03 |
| CA-20 | todas (gate de build) |

Todos os 22 critérios têm destino. CA-12 é verificado em duas sprints porque tem duas metades distintas: a chave consultada pelo runtime (03) e o toggle que a grava e a interface que a exibe (04).

## Métricas

| Métrica | Sprint | Observação |
|---|---|---|
| M1 | **fora do Release 1** | exige instrumentação de produção (PRD §6) |
| M2 | **fora do Release 1** | depende da degradação (Release 2, PRD §6 e TECH §12) |
| M3 | 02 | medida em T-06, sobre o payload de fio |
| M4 | 06 | T-12 é o próprio entregável; a sprint é isolada porque a baseline precisa ser capturada antes da mudança |