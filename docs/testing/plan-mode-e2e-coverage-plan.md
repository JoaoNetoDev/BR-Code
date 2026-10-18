# Plano de cobertura E2E do Plan Mode

## Escopo

A superfície de aceitação ponta a ponta do plan mode é a cadeia de ações do usuário na sessão local `desktop-continuous` do desktop e o request body visível ao provider; a estrutura interna de implementação não é alvo de aceitação. Atualmente, o E2E usa uma synthetic DeepSeek replay fixture para fixar as chamadas de ferramenta do modelo, evitando misturar a questão de o modelo real escolher ou não ferramenta nas asserções de semântica de produto.

## Cobertura existente

- `conversation-session-tool-cross-product.test.ts` já cobre o `EnterPlanMode` bem-sucedido gerando bloco de ferramenta, e a fronteira de exibição comum de ferramenta com falha rápida do `ExitPlanMode` fora do plan mode.
- `conversation-session-plan-approval-feedback-user-message.test.ts` cobre o caso em que o `ExitPlanMode` é rejeitado por custom feedback digitado pelo usuário e esse feedback entra como uma user message real na próxima requisição ao provider.
- `conversation-session-plan-file-compact-continuity.test.ts` cobre o caso em que, após a aprovação do `ExitPlanMode`, o texto do plan é gravado em `.zcode/plans` e, após um `/compact` manual, retorna ao contexto visível ao provider via `plan_file_reference`.

## Cobertura adicionada

`conversation-session-plan-mode-capabilities.test.ts` completa duas fronteiras de capacidade do plan mode:

1. Quando o `ExitPlanMode` é rejeitado pelo usuário sem feedback, o turno atual deve parar, e não deve ser enviada uma requisição ao provider com o tool_result de `ExitPlanMode`; a entrada normal posterior do usuário continua em plan mode e leva, no contexto visível ao provider, o lembrete de plan mode ativo.
2. Quando, no plan mode, a mesma resposta do assistant chama primeiro uma ferramenta de escrita e depois uma ferramenta somente leitura, a ferramenta de escrita deve ser rejeitada por `mode.plan.nonReadOnly` e não deve ir para disco; a ferramenta somente leitura subsequente ainda deve ser executada e devolver o tool_result real ao modelo.

## Fora de escopo

- A restauração de snapshot/gap do `web-remote-replayable` no celular não é inferida deste conjunto.
- O agente de aprovação que dispara `ExitPlanMode` internamente nos subagents não é inferido deste conjunto; entra na composição posterior de subagent human-in-the-loop delegate.
- Se a falha ao salvar o plan file bloqueia a saída do plan mode já é coberto por testes unitários do core; o E2E cobre apenas a continuidade normal de arquivo após a aprovação do usuário.