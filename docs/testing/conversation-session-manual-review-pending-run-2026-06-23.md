# Revisão Manual de Conversation Session - Execução Pendente - 2026-06-23

Este registro dá continuidade à revisão item a item da migração de
`packages/desktop/test/e2e/conversation-session/manual-review/pending/`:
primeiro executa-se o spec pendente e, somente os specs que passam o arquivo
inteiro e cujas asserções têm semântica adequada à aceitação padrão são movidos
de volta para `packages/desktop/test/e2e/conversation-session/`.

Este documento é o registro histórico das execuções de 2026-06-23 a 2026-06-24
e não indica que esses specs estejam atualmente em estado formal admitido. A
migração V4 posterior rebaixou novamente para `manual-review/pending` os specs
históricos de conversation, incluindo
`conversation-session-turn-steer-probe.test.ts`; o caminho físico atual e o
estado do formal gate devem ser consultados em
[conversation-session-e2e-coverage-matrix.md](./conversation-session-e2e-coverage-matrix.md).
Abaixo, "promovido a E2E de conversation padrão" descreve apenas as promoções e
reexecuções da época.

## Comandos de execução e artefatos

Execução individual:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-compact-auto.test.ts'
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260623-153459-510/summary.md`

Execução em lote, em sequência:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 ZCODE_E2E_SPEC='<remaining pending specs>' pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260623-154027-061/summary.md`
- Wrapper log: `tmp/manual-review-run-20260623154025/wdio.log`

Spec pendente encontrado após a execução complementar:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 ZCODE_E2E_SPEC='./test/e2e/conversation-session/manual-review/pending/conversation-session-running-send-now.test.ts' pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260623-160950-505/summary.md`

Spec pendente confirmado por reexecução após interferência manual:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-compact-interrupted.test.ts'
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260623-163701-534/summary.md`

Spec pendente confirmado por reexecução após remover o retry de auto compact:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-compact-auto.test.ts'
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-042921-602/summary.md`

Spec de edit promovido após adicionar a asserção do toast de compact em execução:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-edit.test.ts'
```

- Manual summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-064810-462/summary.md`
- Manual result: 2 passed. Confirmado que o cenário de `/compact` repetido durante
  `held queue + compacting` passa: `/compact` repetido exibe um toast informando
  que não é possível compactar em execução, não entra na fila, não gera nova
  requisição de compact e não é exibido como mensagem de usuário comum.
- Reexecução no caminho padrão:

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-edit.test.ts'
```

- Default summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-070956-672/summary.md`
- Default result: 2 passed. Removido de `manual-review/pending` e promovido a E2E
  de conversation padrão.
- Nota de captura: a janela de interrupção por stop de D10 depende de um fixture
  de replay de fluxo lento; uma captura real do DeepSeek pode já estar concluída
  quando o primeiro delta visível aparece, portanto não serve como stop gate
  estável. Na promoção foi adicionado um fixture padrão específico para o rerun de
  edit, e a resposta diferente `upstream-e2e-edit-rerun-ok` prova que o edit de
  fato dispara uma nova query.
- Reexecução no caminho padrão após a promoção da sonda de turn steer:

```bash
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-turn-steer-probe.test.ts'
```

- Summary: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-070258-617/summary.md`
- Result: 3 passed. Removido de `manual-review/pending` e promovido a E2E de
  conversation padrão. Esse spec cobre explicitamente o comportamento de interação
  `queue` para M01-M05; o modo `guide` continua coberto por
  `conversation-session-running-guide-steer.test.ts`.
- Teste unitário de runtime retry correspondente:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-compact.test.ts -t "retries auto compact up to three attempts before continuing the turn"
```

- Result: 1 passed

## Já migrados

Os specs abaixo passaram o arquivo inteiro e voltaram a passar após a reexecução
no caminho padrão; foram movidos para
`packages/desktop/test/e2e/conversation-session/` e o caminho foi reescrito na
matriz de cobertura.

| Spec                                                   | Resultado                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `conversation-session-compact-manual-queue.test.ts`    | pass                                                                 |
| `conversation-session-compact.test.ts`                 | pass                                                                 |
| `conversation-session-config-and-multisession.test.ts` | pass; em 2026-06-24, corrigido o falso negativo de sessão já concluída, a reexecução no caminho padrão passou |
| `conversation-session-first-send.test.ts`              | pass                                                                 |
| `conversation-session-goal-queue.test.ts`              | pass                                                                 |
| `conversation-session-queue-operations.test.ts`        | pass                                                                 |
| `conversation-session-running-guide-steer.test.ts`     | pass                                                                 |
| `conversation-session-stop-empty.test.ts`              | pass                                                                 |
| `conversation-session-stop-held-queue.test.ts`         | pass                                                                 |
| `conversation-session-turn-steer-probe.test.ts`        | pass; em 2026-06-24, após completar a precondição de queue e o fixture de tool final lento, a reexecução no caminho padrão passou |
| `conversation-session-edit.test.ts`                    | pass; em 2026-06-24, após adicionar o stop gate de fluxo lento de D10 e o fixture de rerun de edit, a reexecução no caminho padrão passou |

## Aprovados, mas não migrados

| Spec                                                       | Motivo                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `conversation-session-compact-auto.test.ts`                | Reexecução em 2026-06-24 passou. G01 foi reduzida ao caminho principal de primeiro compact bem-sucedido; a cobertura de retry G08-G10 passa a ser responsabilidad de `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`; a migração para o caminho padrão e a reexecução do gate padrão ainda não foram executadas. |
| `conversation-session-compact-timeline-projection.test.ts` | Passa no caminho pending, mas ao ser movido para o caminho padrão ambos os testes falham direto: o spec ainda exige `ZCODE_E2E_MANUAL_REVIEW=1`. É preciso remover a dependência exclusiva de manual review ou complementar o critério de replay padrão antes de migrar.                           |
| `conversation-session-compact-interrupted.test.ts`         | Reexecução em 2026-06-24 passou, confirmando que a falha anterior vinha de interferência manual; a migração para o caminho padrão e a reexecução do gate padrão ainda não foram executadas.                                                                                                    |
| `conversation-session-model-switch-auto-compact.test.ts`   | Passa no caminho pending, mas ao ser movido para o caminho padrão N06 não captura a requisição completa após a conclusão do auto compact. É preciso primeiro estabelecer o critério padrão de replay/captura antes de migrar.                                                            |
| `conversation-session-running-send-now.test.ts`            | Os 4 testes passam, mas o título e a asserção finais reproduzem explicitamente o bug atual: cliques rápidos consecutivos em envio imediato duplicam o envio e consomem um item de queue não clicado. Essa asserção não pode servir como semântica de aceitação padrão; é preciso antes reescrevê-la como asserção da semântica ideal de produto.          |

## Lista de falhas

| Spec                                                       | Ponto de falha                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation-session-fork.test.ts`                        | O cenário de fork com goal da sessão pai + held queue não encontrou a queue esperada; após o edit, o fork ainda copiou o texto do branch antigo.                                      |
| `conversation-session-goal-run-cases.test.ts`              | A quantidade de itens na MR-GOAL-07 não virou 3; o botão de envio imediato do goal enfileirado na MR-GOAL-11 não apareceu.                                                 |
| `conversation-session-goal-session-model.test.ts`          | A captura da requisição do modelo atual do goal enfileirado ficou fora do esperado; após a troca de sessão, o modelo DeepSeek não voltou para `deepseek-v4-flash`.                               |
| `conversation-session-goal.test.ts`                        | As asserções de `/goal` para completed/running/held queue esperavam kind `goal`, mas obtiveram `turn-steer`.                                           |
| `conversation-session-interrupted-actions.test.ts`         | O cenário interrupted não exibiu um botão de stop clicável.                                                                                       |
| `conversation-session-model-config.test.ts`                | A requisição inicial da sessão A capturou `deepseek-v4-pro/max`, incompatível com a seleção da barra de ferramentas.                                                               |
| `conversation-session-model-switch-compact.test.ts`        | Após trocar para a secundária, o modelo não mudou para `deepseek-v4-pro`.                                                                                |
| `conversation-session-model-switch-queue.test.ts`          | O cenário de troca de modelo antes do consumo da queue em execução esperava kind `text`, mas obteve `turn-steer`.                                                         |
| `conversation-session-model-switch-tool-edit-fork.test.ts` | A janela de ferramentas não encontrou a opção `deepseek-v4-pro`; as trocas de modelo posteriores a edit/fork e o clique de nova tarefa falharam.                                                |
| `conversation-session-prewarming-queue.test.ts`            | Continuar digitando durante o prewarming esperava kind `text`, mas obteve `turn-steer`.                                                                  |
| `conversation-session-running-actions.test.ts`             | O cenário de bloqueio de fork/edit durante execução não exibiu o texto de assistant esperado. Em 2026-06-24 a revisão manual posterior passou e ele foi migrado para o caminho de replay padrão.              |
| `conversation-session-running-queue.test.ts`               | Os cenários de entrada comum e `/goal` durante execução esperavam kind `text`, mas obtiveram `turn-steer`.                                                      |
| `conversation-session-tool-actions.test.ts`                | Nenhum bloco de tool call correspondente `toolu_e2e_read_action_guard` foi encontrado.                                                                   |