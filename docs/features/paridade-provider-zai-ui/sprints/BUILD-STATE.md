# BUILD-STATE — paridade-provider-zai-ui

## Execução

- **Modo**: sequencial na árvore principal (desvio declarado do padrão de worktrees).
  Motivo: (a) cada worktree exigiria um `pnpm install` completo (~1,5 h neste ambiente, Store em disco F: lento); (b) há dependência de typecheck entre sprints — S2 remove imports de `CodingPlanUpgradeDialog*` que só é deletado em S6 — então execução paralela no mesmo tree reprovaria a verificação de todas.
- **Commits**: nada é commitado (tudo fica para revisão de diff do usuário).

## Baseline (antes de qualquer código)

| Comando | Resultado |
| --- | --- |
| `node scripts/check-workspace-freshness.mjs` | baseline nova, main sincronizada com origin/main |
| `pnpm install` | concluído (`Done in 1m 37s`) |
| `pnpm typecheck` | **exit 0**, sem erros |
| `pnpm lint` | **exit 0** — 62 warnings, 0 erros (warnings pré-existentes) |
| `pnpm dep:refs --list-exports packages/ui/src/hooks/useOAuth.ts` | funciona (antes falhava com `MODULE_NOT_FOUND` por falta do install) |

## Incidente F-INC-01 — perda de trabalho não rastreado

**O que aconteceu:** o Validador da SPRINT-03 criou um worktree em `/tmp/brcode-head` e, dentro dele, symlinks de `node_modules` apontando para os diretórios reais do workspace. Ao remover o worktree com `git worktree remove --force`, o Git no Windows seguiu os symlinks e apagou o conteúdo real. Além disso, um `pnpm install` anterior executado com o diretório de trabalho do shell preso em `sprints/` criou árvores espelho (`sprints/apps`, `sprints/packages`, `sprints/node_modules`).

**Perdas reais:** as alterações das 3 sprints em arquivos rastreados (revertidas ao HEAD pelo `git checkout -- .`) e os arquivos novos não rastreados (`packages/ui/src/codingPlanUsageRemainingState.ts`, `packages/ui/test/welcomeScreenApiKeyOnly.test.ts`, `packages/ui/test/settingsUsageEntitlementFreeMount.test.ts`).

**Recuperação concluída:** `git checkout -- .` restaurou 1.396 arquivos deletados; as árvores espelho dentro de `docs/` foram removidas; `pnpm install` refeito; `pnpm typecheck` volta a sair com 0 erros. O que se perdeu foi apenas o código das sprints — PRD/TECH/SPEC/sprints/overview intactos.

**Protocolo vigente (obrigatório para todo agente desta feature):**
1. **Proibido** criar worktree, symlink, junction ou cópia parcial dentro do repositório. Nenhum agente de validação cria worktree para comparar com o HEAD.
2. Para comparar com o HEAD, usar `git show HEAD:<caminho>` ou `git stash` — nunca materializar árvores.
3. Todo comando começa com `cd /f/develop/brcode` (o cwd do shell é volátil).
4. **Backup obrigatório após cada sprint:** gravar o diff e os arquivos novos fora do repositório, em `/tmp/featbuild-paridade/sprint-NN.patch` (`git diff` + cópia dos arquivos não rastreados criados), para permitir reversão de qualquer incidente.

## Estado das sprints

| Sprint | Onda | Branch | Status | Rodadas de findings |
| --- | --- | --- | --- | --- |
| SPRINT-01 — Welcome 100% API key | 1 | — (árvore principal) | **ok** (reexecutada após F-INC-01) | 2 rodadas (F-01-1..8: 1 BLOQ, 3 IMPORT, 4 NOTA — todos resolvidos; 26 testes verdes, typecheck 0) |
| SPRINT-02 — Entitlement/usage preferred-provider | 1 | — (árvore principal) | **ok** (reexecutada após F-INC-01) | 2 rodadas + decisão de dono (F-02-1..18: 2 BLOQ, 9 IMPORT, 7 NOTA — todos resolvidos; typecheck 0, lint 58 vs 62 baseline) |
| SPRINT-03 — Marketing/claim | 1 | — (árvore principal) | **ok** (reexecutada após F-INC-01) | 2 rodadas (F-03-1..7: 1 BLOQ, 2 IMPORT, 4 NOTA — F-03-1 resolvido por emenda de docs; 52 testes verdes, lint 56 vs 62 baseline) |
| SPRINT-04 — Recomendações e badges | 2 | — (árvore principal) | **ok** | 2 rodadas (F-04-1 e F-04-5 fechados: teste de hideAccountBadges + 61 casos de v4SessionPaneModelSwitchRecovery recuperados; 49 testes verdes) |
| SPRINT-05 — Settings cards/hints | 2 | — | **não iniciada** — bloqueada por limite de uso do plano de tokens (2026-10-19) | — |
| SPRINT-06 — Upgrade/compra + condicionais | 3 | — | pendente | — |
| SPRINT-07 — i18n + telemetria + auditoria | 4 | — | pendente | — |

## Notas de ambiente

- Node local é v22.23.2; o `mise.toml` pede 24.14.0. `pnpm typecheck` e `pnpm lint` passam mesmo assim (com warning de engine). Se uma sprint falhar por motivo ligado à versão do Node, registrar como falha operacional e não como falha da sprint.
- O diretório de trabalho do shell pode estar preso em subdiretórios: sempre prefixar comandos com `cd /f/develop/brcode`.

## Decisões do dono tomadas durante a execução

- **F-01-2**: o estado inicial `"entry"` da welcome screen é a decisão final; SPEC e TECH foram emendados para dizer "tela de entrada de API key" em vez de "abre direto no modo API key". Os 8 E2E que clicam `TID_LOGIN_USE_API_KEY_BUTTON` seguem válidos.
- **F-03-1**: `MarketingDialogs.tsx` passa de "remover" (R24) para "alterar" — a premissa original do plano (o arquivo continha diálogos do claim) era falsa; após a remoção do branch, resta o `CloudContentDialog` neutro, consumido por ~15 E2E de entrega. SPEC, COBERTURA e SPRINT-03 emendados. A cadeia `openCodingPlanUpgrade`/`finishMarketingNavigation` permanece registrada como caminho neutro.
- **F-02-15**: a métrica de tempo economizado do highspeed não sai do produto. `regularTps` passa a ser resolvido por fontes neutras (`record.card.regularTps ?? userRow?.highspeed?.regularTps ?? observedTps`), com teste novo que prova a persistência de `setHighspeedMetrics`.
- **F-02-4/5**: a limpeza de órfãos do `knip` foi autorizada dentro da sprint, com `useStableAccountAccess` explicitamente preservado (tem consumidor vivo).

## Estado no encerramento da sessão (2026-10-19)

Sprints 1 a 4 concluídas e aprovadas; a 5 não foi iniciada porque o limite de uso do plano de tokens foi atingido. Nada está commitado — todo o trabalho das S1–S4 está no working tree para revisão de diff, e backups por sprint em `/tmp/featbuild-paridade/` (sprint-NN.patch + sprint-NN-novos/).

Backup consolidado para retomar: para restaurar qualquer sprint, `git apply /tmp/featbuild-paridade/sprint-01.patch` não é suficiente (cada patch é o diff acumulado até aquela sprint); o estado final da S4 está em `sprint-04.patch`.
