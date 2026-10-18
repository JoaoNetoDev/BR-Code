# Usage Stats E2E Coverage Matrix

Esta matriz acompanha os contratos de comportamento do [Usage Stats E2E Case Catalog](../usage-stats-e2e-case-catalog.md).
`existing-partial` indica apenas que o spec existente cobre parte das asserções, e não que o case já está coberto.

## Evidência existente

| Spec | Já provado | Não provado |
| --- | --- | --- |
| `packages/desktop/test/e2e/coding-plan-team-usage.test.ts` | cold start do Team pricing, forma de conexão, crédito pessoal/Team, range, isolamento e recuperação de erros, freshness do acesso, visibilidade da entrada, viewport/theme | App Usage; UI do `/remote` no celular (podado conforme D1) |
| Testes focados de UI/services/CLI | mapper, datas, agregação de estatísticas, estado dos hooks, in-flight/backoff, exclusão mútua Coding/Start, isolamento de origem Z.AI e ramos de erro | não prova novamente a navegação real do Electron |

## Agrupamento de specs candidatos

| Abreviação do spec | Caminho candidato | Cases | Tempo | Status |
| --- | --- | --- | --- | --- |
| `UA` | `test/e2e/usage-stats/usage-stats-app-usage.test.ts` | US-AU-01..05 | fast-text | formal-green |
| `UP` | `coding-plan-team-usage.test.ts` existente mais extensão focada | US-CP-01..07,09; US-RF-01; US-SY-01..03; US-CM-01..02 | fast-text/fault HTTP | formal-green |
| `UI-focused` | testes existentes de hooks/componentes de UI | US-RF-02..05, US-SY-04, US-SP-01..04, isolamento Z.AI | testes determinísticos de estado | green |
| `remote-invariant` | testes existentes de shared-host/attachment do desktop | US-CM-03 | testes determinísticos de arquitetura | green |

## Status de cobertura de comportamento

| Área | Cases | Automação de UI | Evidência de runtime/service | Formal | Status de cobertura |
| --- | --- | --- | --- | --- | --- |
| App Usage | US-AU-01..05 | 2 testes / 5 case IDs green | testes focados + fixture SQLite | formal | covered |
| Uso de crédito pessoal | US-CP-01,03..05,09 | CTP-04B/05/07 green | testes focados de services/UI | spec existente | covered |
| Uso de Team | US-CP-02 | CTP-01..06 green | log de requisições mock + UI | spec existente | covered |
| Isolamento/recuperação de falhas | US-CP-06..08 | CTP-09 opcional + CTP-11 recuperação de falha fatal | testes focados de services/UI | spec existente | representative-covered |
| Renovação do acesso/in-flight/backoff | US-RF-01..05 | CTP-09/10/11 refresh、freshness e recuperação de falha | testes focados de hooks cobrem in-flight/backoff | misto | covered-by-pruning |
| Sincronização entre superfícies | US-SY-01..04 | CTP-03 sidebar→Usage、CTP-10 Context access | testes focados de hooks | spec existente | representative-covered |
| Exclusão mútua Coding/Start | US-SP-01..04 | sem matriz GUI duplicada conforme poda no estilo D3 | testes focados de hooks | focado | covered-by-pruning |
| Compatibilidade/invariantes | US-CM-01..03 | CTP-08 viewport estreito + dark theme green | shared-host/attachment 3 arquivos / 20 testes green | misto | representative-covered |

## Evidências de execução verificadas

| Run ID | Resultado | Escopo |
| --- | --- | --- |
| `usage-app-coverage-green-20260817` | 2/2 pass, artefatos de coverage de renderer/main/host/CLI completos | US-AU-01..05 |
| `usage-team-failures-rerun-20260817` | 9/9 pass | CTP-01..08, crédito pessoal/Team, range, tela estreita |
| `usage-combined-green-20260817` | 13/13 pass, `complete=true` nos quatro domínios | CTP-01..10 + US-AU-01..05 |
| `usage-team-fatal-recovery-20260817` | 12/12 pass | CTP-01..11, incluindo recuperação de falha fatal de quota |
| `usage-final-coverage-20260817` | 14/14 pass, renderer/main/host/CLI todos com `complete=true` | cobertura final combinada de App Usage + Coding Plan |
| `remote-shared-host-invariant-20260817` | 3 arquivos / 20 testes pass | D1: celular reaproveitando o Window Host, attachment confiável `web-remote-replayable` e isolamento de ciclo de vida |
| `usage-app-formal-20260817` | 1 spec formal / 2 testes pass | execução de US-AU-01..05 sem a flag de manual-review, provando a entrada oficial padrão após a promoção |

Cobertura de linhas nos arquivos-chave da especialidade final: `AppUsagePanel` 97,22%, `CodingPlanUsagePanel` 80,89%,
`UsageHeatmap` 96,70%, `UsageHeatmapCells` 100%, `UsageStatsErrorNotice` 80%,
`useUsageEntitlement` 91,05%, `useUsageStats` 58,53%, `CodingPlanContextUsage` 90,74%.
Não se reportou falsamente a cobertura de boot de aproximadamente 20% de todo o UI Renderer como cobertura da especialidade deste branch.

## Contrato de coleta de Coverage

1. Coletar os quatro domínios de execução renderer/main/host/CLI usando `ZCODE_E2E_COVERAGE=1`; não se deve reportar a cobertura como concluída quando qualquer domínio relevante estiver `incomplete`.
2. Ter como alvo as mudanças executáveis de `origin/staging...HEAD`; docs, tests, declarações de tipo e `.gitignore` não entram no denominador de changed-code.
3. Priorizar changed line/function/branch observáveis pelo usuário e de alto risco; registrar o motivo para ramos puramente defensivos que não podem ser atingidos de forma estável, sem criar operações GUI frágeis só por causa de números.
4. Reportar os quatro domínios de forma independente, sem somar os percentuais de renderer com os de host/CLI.
5. A cada rodada, manter o artifact run id, o pass/fail dos cases, a integridade dos quatro domínios e a lista de não-acertos dos arquivos de mudança relevantes.

## Confirmação de poda pelo usuário

Complemento das configurações do fornecedor: CTP-12 `packages/desktop/test/e2e/provider-family-responsive.test.ts` cobre o layout largo/estreito de nomes longos no aplicativo real, o tooltip do Start, a troca rápida e a persistência das configurações. Status: formal, o usuário confirmou a promoção em 2026-09-04; entrada oficial com 1 passed, evidência `packages/desktop/.e2e-artifacts/desktop-e2e-20260904060754282-p39563-0c1b2374a55285ca/summary.json`; funciona como cobertura oficial das configurações do fornecedor, sem estender a cobertura de negócio das estatísticas de uso e sem representar a validação do controle remoto do celular.

| Decision | Resposta proposta | Status |
| --- | --- | --- |
| D1 Se o Desktop tem cobertura completa e o `/remote` no celular valida apenas o invariante de shared-host | yes | answered 2026-08-17 |
| D2 BigModel pessoal/Team completo, Z.AI apenas com amostra representativa de isolamento de origem | yes | answered 2026-08-17 |
| D3 Combinações extremas de data/mapper mainly via testes focados, sem duplicar em E2E de GUI | yes | answered 2026-08-17 |
| D4 Uma amostra representativa para viewport/theme/locale, sem todas as combinações | yes | answered 2026-08-17 |

O usuário confirmou D1-D4; os casos de Coding Plan e App Usage já caíram em specs formais. App Usage
foi promovido em 2026-08-17 após revisão manual confirmada pelo usuário, continuando a usar o fixture SQLite isolado, sem depender de replay do provider.