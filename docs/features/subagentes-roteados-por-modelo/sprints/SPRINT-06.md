# SPRINT-06 — E2E: medição de tempo de spawn (M4)

## Objetivo
Medir o tempo de spawn de um sub-agente do catálogo e verificar que a feature não introduziu regressão acima de 5% contra a baseline.

## Depende de
SPRINT-01, SPRINT-02, SPRINT-03 e SPRINT-05 (reaproveita o fixture e o caso construídos lá).

## Onda
4

## Arquivos previstos
- `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-catalog.test.ts` — alterar — acrescenta T-12

## Passos de implementação

1. **Capturar a baseline primeiro, sobre o estado anterior à feature.** Esta é a razão de a medição ser uma sprint separada: a baseline **só existe antes da mudança**. Abrir um worktree no commit de base da feature (`git worktree add`), rodar o caso E2E de despacho de sub-agente **já existente** (`conversation-session-subagent-prompt-assembly.test.ts`) e registrar o tempo de spawn.
   - Se a feature já estiver integrada na branch principal no momento de executar esta sprint, a baseline deve ser capturada em worktree sobre o merge-base com `main`. **Não** capturar baseline depois da mudança: a métrica perde sentido e a sprint deve ser bloqueada até existir um ponto de comparação.
2. **Medir com a feature**, no mesmo hardware, mesmo número de execuções e mesma máquina states (mesma carga, sem E2E concorrente).
3. **Comparar** e falhar o teste se a regressão ultrapassar 5%.

## Testes obrigatórios
- T-12 — E2E: tempo de spawn medido contra baseline, com limite de 5% de regressão

## Critérios de aceitação
- [ ] CA-17 (parcial): regressão de tempo de spawn ≤ 5% contra a baseline medida
- [ ] CA-20: os três gates de typecheck/lint passam

## Comandos de verificação
```bash
pnpm typecheck
pnpm --filter zcode-cli typecheck
pnpm lint
pnpm test:e2e
```

## Notas de risco
- **M4 é uma métrica brittle.** Tempo de spawn depende de cache, carga de máquina e conectividade com o provedor. Registrar no relatório o número de execuções, a máquina e a variância observada; uma única execução não sustenta decisão.
- **Sem baseline, esta sprint não produz resultado** — não registrar "sem regressão" por ausência de comparação. Reportar honestamente como não medido.
- **M1 e M3 não entram aqui:** M1 exige instrumentação de produção (fora do Release 1) e M3 é medida em T-06, na SPRINT-02. **M2** depende da degradação e é fora de escopo do Release 1.