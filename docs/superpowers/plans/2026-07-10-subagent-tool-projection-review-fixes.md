# Plano de Correções de Child Tool Projection do Subagent Pós-Commit

## Objetivo

Sem alterar os limites de comportamento existentes de background subagent, desktop continuous e web remote replayable, corrigir os problemas de projeção de child tool encontrados na revisão pós-commit de `0771f6312`:

- um running snapshot não pode rebaixar de volta para running uma live terminal tool;
- os metadados completos de identity/input da tool não podem ser limpos junto com o parser cache do parent turn;
- ao alternar de task na assinatura do foreground, não se pode reutilizar a projection memory da task anterior;
- o BG21 precisa provar de forma determinística que a child tool conclui enquanto a session está oculta;
- limpar o ramo de compatibilidade missing-updateConfirmed sem chamadores.

Este plano trata apenas do fechamento acima; não estende o protocolo de persistência de restart/resume e não altera o ciclo de vida do background runtime.

## Fase 1: Merge monotônico do Running Snapshot

- [x] Adicionar em `zcodeChatMessages.test.ts` o teste de falha "live terminal + stale running snapshot".
- [x] Confirmar que o teste falha antes da implementação.
- [x] Mudar o merge de status da tool para merge de estado monotônico e reaproveitar o merge unificado de display identity.
- [x] Executar `zcodeChatMessages.test.ts` e confirmar que os testes novos e os existentes passam.

Critério de aprovação: uma child tool já terminal não é ressuscitada por um running snapshot; um snapshot terminal ainda consegue encerrar um running live.

## Fase 2: Ciclo de vida dos Metadados de Projection

- [x] Cobrar nos testes de projection da UI o cenário scheduled -> parent turn completed -> terminal result.
- [x] Cobrar nos testes de projection da UI o cenário scheduled -> started/progress ainda carregando input/description.
- [x] Cobrar o mesmo cenário entre parent turns nos testes de projection replayable dos services.
- [x] Confirmar que os testes novos falham antes da implementação.
- [x] Separar o estado do parser JSON de streaming da metadata de tool completa com escopo de task.
- [x] Fazer UI e services reaproveitarem um shared metadata helper; todos os ramos de update passam a carregar uniformemente o remembered input.
- [x] Executar os testes focados de UI/services.

Critério de aprovação: o fim de um parent turn limpa apenas o parser state e não perde name/input de child tools em background; a restauração em desktop continuous e replayable se mantém consistente.

## Fase 3: Isolamento de Estado por Task

- [x] Adicionar um teste de que trocar da task A para a task B não herda projection memory.
- [x] Confirmar que o teste falha antes da implementação.
- [x] Na inicialização da assinatura do foreground, adotar explicitamente o hidden projection state da task alvo, ou criar um state totalmente novo.
- [x] Executar os testes focados de hooks/projection relevantes.

Critério de aprovação: tool ids repetidos não herdam name/input entre tasks; ao voltar para uma task de background ainda em execução, ela retoma seu próprio hidden state.

## Fase 4: Limpeza de Código Morto

- [x] Confirmar por verificação de referências que `patch-existing-only` não tem chamadores.
- [x] Remover o union member e o ramo não utilizados.
- [x] Remover os campos mortos do streaming parser remanescentes da migração do complete input.
- [x] Executar os testes focados de message merge.

Critério de aprovação: comportamento inalterado, e o padrão missing tool update passa a manter apenas a semântica realmente usada.

## Fase 5: E2E determinístico do BG21

- [x] Tornar o child Bash do BG21 controlado por sentinel/barrier.
- [x] Alternar de session depois que a child tool já está running; confirmar que o sentinel só é liberado após a session estar oculta.
- [x] Ao voltar, afirmar que a tool continua sob o Agent original, está terminal, com identity/input/output íntegros e sem card órfão duplicado.
- [x] Atualizar as descrições do case catalog, do coverage matrix e do fixture manifest.
- [x] Executar a checagem de fixtures, a auditoria de cobertura e BG21/BG22.

Critério de aprovação: o teste deixa de depender de sleep fixo para adivinhar o timing e passa a cobrir de verdade tanto o terminal update durante a ocultação quanto o caminho de voltar ainda running.

## Fase 6: Verificação Pré-commit

- [x] Executar todos os testes unitários relevantes.
- [x] Executar `pnpm typecheck`.
- [x] Executar `pnpm lint`.
- [x] Executar o typecheck do E2E de desktop.
- [x] Executar BG21/BG22 e o E2E focado de background.
- [x] Revisar o diff, os dependentes e a fronteira desktop/replayable.
- [x] Confirmar que as alterações do worktree não foram commitadas automaticamente.

## Fase 7: Fechamento de Corridas Pós-revisão

- [x] Adicionar um teste de regressão que força a entrada no caminho de replace do running snapshot, provando que um snapshot de streaming antigo não sobrescreve um input/raw live mais novo.
- [x] Fazer backfill e running replace compartilharem o mesmo conjunto de regras de escolha de tool input/raw do snapshot.
- [x] Limpar, de forma síncrona, o streaming parser, o complete input e a memória de tool name ao final do terminal tool result/error.
- [x] Executar 6 arquivos de testes focados de projection/runtime, com 319 testes passando.
- [x] Executar `pnpm typecheck`, `pnpm lint` e o typecheck do E2E de desktop.
- [x] Executar BG21, BG22 e o E2E de session-switch do ExitPlanMode.

Critério de aprovação: com snapshot e streaming live concorrentes, input/raw não regride; um snapshot finalizado ainda consegue completar uma pré-visualização vazia; uma child tool terminal não deixa resíduo de parser state.

## Fase 8: Refatoração de equivalência da Projection e encerramento da promoção de E2E

- [x] Executar os testes focados antes da refatoração e confirmar as linhas de base de ExitPlanMode, running snapshot e projection UI/services.
- [x] Consolidar a inicialização padrão da tool projection memory numa shared factory, preservando a fronteira de compatibilidade do lazy ensure para partial state.
- [x] Consolidar o persist do complete input e a liberação do raw buffer de streaming num shared lifecycle helper.
- [x] Remover a resolução duplicada de raw-kind na escolha de input/raw do snapshot, e fazer o merge comum e o running replace compartilharem o helper de escolha monotônica de status.
- [x] Executar os testes focados e confirmar que o comportamento é idêntico antes e depois da refatoração pura.
- [x] Rever novamente as cadeias de dependência de UI, services, hidden monitor, ExitPlanMode e background control.
- [x] Confirmar que BG21/BG22 estão no caminho oficial de E2E, sem skip/only, e sincronizar catalog, matrix e fixture contract.
- [x] Executar checagem de fixtures, auditoria de cobertura, BG21/BG22, E2E de ExitPlanMode, typecheck, lint e checagem de diff.
- [x] Após a verificação, commitar segundo Conventional Commits, sem push automático.

Critério de aprovação: após o fechamento da lógica duplicada em três lugares, o comportamento de provider/runtime/UI permanece inalterado; o ExitPlanMode ainda consegue completar os parâmetros a partir de um snapshot finalizado; a recuperação e o estado terminal da child tool de background e do control no canto superior direito continuam passando; o E2E oficial e todos os gates do repositório passam.
