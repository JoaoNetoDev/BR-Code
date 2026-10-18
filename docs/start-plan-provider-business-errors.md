# Erros de negócio do provider Start Plan

## Escopo

Os erros de negócio do provider Start Plan são expostos através do pipeline existente de erros
de negócio de provider. O adaptador preserva o código de negócio upstream em
`context.providerCode`, o runtime promove esse código para o resumo de erro da tarefa, e a UI
localiza a mensagem final a partir de
`packages/ui/src/lib/providerBusinessError.ts`.

Este documento registra o comportamento da UI para os códigos de negócio do Start Plan
atualmente em produção.

## Códigos de erro

| Código | Significado | Comportamento da UI |
| --- | --- | --- |
| `1005` | Cota do Start Plan esgotada | Para providers Start Plan, exibe o banner de upgrade de cota. Este é um estado de cota esgotada, não um estado de sistema ocupado, e permanece não-recuperável na camada do adaptador de modelo. O banner permanece visível como orientação, mas não bloqueia o envio; a próxima requisição pode reconsultar o estado do servidor e exibir o resultado mais recente. |
| `3007` | Verificação de segurança rejeitada | Exibe o banner de erro de chat normal. Builds oficiais podem primeiro aplicar sua própria recuperação limitada de verificação de segurança; o erro permanece visível quando essa recuperação não tem sucesso. |
| `3008` | Limite de requisições concorrentes atingido | Para providers Start Plan, exibe o banner de upgrade de sistema ocupado. No primeiro turno de uma nova sessão, não faz retry automático e exibe `当前系统繁忙，请稍后再试或升级账户。`. Depois que a sessão já concluiu pelo menos um turno visível do usuário, uma falha de admissão `main_turn` por sistema ocupado pode tentar novamente com um backoff curto e limitado. Se a consulta já está em execução e a recuperação de stream está ativa, permitir retries automáticos de recuperação. Quando a recuperação atinge seu número máximo de retries, exibir `当前系统繁忙，当前自动重试已达到最大次数，请稍后再试或升级账户。`. |
| `3009` | Limite de concorrência de requisições do modelo atual atingido | Igual a `3008`. |
| `3010` | Limite de concorrência de requisições do modelo atual atingido | Igual a `3008`. A verificação de conclusão da meta é uma exceção: depois que um turno visível do assistente já foi concluído, `target_completion_verification` pode tentar novamente códigos de sistema ocupado do Start Plan (`3008` / `3009` / `3010`) com um backoff curto e limitado antes de falhar de forma fechada. |

## Limite

Os banners de cota e de limite de concorrência do Start Plan não devem desabilitar o composer.
O banner é orientação e ponto de entrada para upgrade; a próxima requisição pode reconsultar o
estado do servidor. `3008` / `3009` / `3010` compartilham o mesmo texto de sistema ocupado.
`1005` mantém o texto de cota esgotada e não pode ser fundido à redação de sistema ocupado.

A verificação de conclusão da meta é executada depois que o usuário já viu a saída do assistente,
como `第 1 次迭代 · 目标未完成，任务继续`. Um código transitório de sistema ocupado do Start Plan
(`3008` / `3009` / `3010`) nesse ponto não deve interromper imediatamente o laço da meta. O
verificador faz retry apenas deste caso de sistema ocupado do Start Plan, com um orçamento de
retries fixo e pequeno.

Falhas de admissão do turno principal são diferentes da recuperação de stream: nenhum token ou
tool call chegou, portanto não há âncora de stream da qual recuperar. Uma vez que a sessão já
concluiu um turno visível, uma falha posterior de admissão `main_turn` por sistema ocupado do
Start Plan pode fechar o placeholder vazio do assistente e repetir a mesma requisição ao provider
com um backoff pequeno e limitado. Falhas normais de primeira admissão, geração de título e
providers que não são Start Plan mantêm o comportamento normal não-recuperável.

## Exceção de dynamic-workflow

Dentro de uma execução de dynamic-workflow (`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`)
a classificação da camada de adaptador acima não é a autoridade de retry. Requisições de subagent
e do lado de tool carregam um orçamento de retry ilimitado e consultam uma tabela de política
específica do workflow:

- `3008` / `3009` / `3010` são **tentados novamente dentro da execução** com o backoff normal e
  o Retry-After, e cada um alimenta o governador de concorrência de processo como sinal de
  throttling. Nunca derrubam um subagent e nunca exibem o banner de sistema ocupado.
- `1005` (cota esgotada) **interrompe a execução** como `stopped(provider)` com uma mensagem de
  cota; a execução é retomável assim que a cota do usuário permitir.
- `3007` (verificação de segurança rejeitada) interrompe a execução como um problema de
  autenticação (builds oficiais primeiro aplicam sua própria recuperação limitada).

O comportamento do turno principal no chat permanece inalterado.