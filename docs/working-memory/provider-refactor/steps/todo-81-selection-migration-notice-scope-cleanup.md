# Todo 81：收口按场景分层的模型选择迁移提示

> 状态：已完成
>
> 日期：2026-09-04

## 背景

当模型或 Reasoning 选择失效时，不同功能的后续行为并不相同。当前普通 Composer 并不需要把历史选择迁移失败暴露给用户；已经结束的闲时任务也不会再次执行，继续显示“需要修复”只会制造异常感。而仍可能执行的闲时任务和定时任务则必须保留提示与保护，避免之后静默地使用错误的 Selection。

## 目标

```text
Composer comum
  Seleção inválida -> Deixar vazio, sem exibir o aviso de migração

Tarefa off-peak já encerrada
  Seleção inválida -> Não exibir repair-required, manter o estado final normal

Tarefa off-peak ainda não executada / pausada / que ainda pode continuar
  Seleção inválida -> Manter o aviso e bloquear agendamentos inválidos

Tarefa agendada
  Seleção inválida -> Manter o aviso e exigir uma nova seleção
```

## Escopo de implementação

- Concluir o fechamento real do Composer no Todo 81: deixar vazio quando o modelo for inválido, manter o modelo e limpar o Reasoning quando o Reasoning for inválido, sem exibir Toast, diálogo ou banner de falha de migração.
- Ajustar a exibição do estado inválido das tarefas off-peak: manter o aviso `modelSelectionIssue` apenas para tarefas que ainda podem ser executadas; tarefas históricas concluídas, com falha ou canceladas não exibem mais esse aviso.
- Manter a proteção de agendamento das tarefas off-peak ainda não executadas: não se pode executar silenciosamente um modelo inválido apenas porque o aviso foi ocultado.
- Manter o aviso de invalidez, a proteção de salvamento e a proteção de execução já existentes nas tarefas agendadas.
- Remover os ramos e testes redundantes que servem apenas ao Composer ou ao aviso de tarefas off-peak já encerradas; não remover os feedbacks de erro de operação normal de Wiki, Bot, Subagent, título, Goal e Git.
- Não modificar as regras de migração de identidade de Provider/Model, não introduzir outro conjunto de estado de seleção e não transformar o aviso explícito de seleção indisponível do Wiki na semântica do Composer.

## Aceitação

- Após a seleção de modelo ou Reasoning do Composer ficar inválida, nenhum aviso de correção da migração é exibido, e é possível enviar normalmente depois de selecionar novamente uma configuração válida.
- Tarefas off-peak concluídas, com falha ou canceladas são exibidas com seu estado final original, sem exibir o erro de correção da seleção de modelo.
- Tarefas off-peak ainda não executadas, pausadas ou que ainda podem continuar continuam exibindo o aviso de invalidez e não são agendadas.
- Tarefas agendadas continuam exibindo o aviso de invalidez, e só é possível continuar salvando ou executando depois de selecionar novamente um modelo válido.
- Os feedbacks reais de erro de execução de Wiki, Bot, Subagent, título, Goal e Git permanecem inalterados.
- Complementar ou atualizar os testes direcionados de Composer, tarefas off-peak e tarefas agendadas, e confirmar que nenhuma asserção foi afrouxada para mascarar uma seleção inválida.

## Relação com os Todos existentes

- Este Todo já incorporou o escopo do rascunho anterior do Composer, e não mantém mais um item pendente separado para o Composer.
- O Todo 70 é responsável pela leitura de dados antigos da Session, pela restauração com seleção vazia após a invalidação e por não bloquear a abertura do histórico; este Todo é responsável por esses resultados não exibirem mais o aviso de correção da migração no Composer.
- O Todo 72 é responsável pela migração das identidades antigas de Provider/Model e pela fronteira de segurança da seleção nas tarefas; este Todo é responsável pela diferença de aviso entre o estado final e o estado executável das tarefas off-peak, sem alterar as regras de migração.

## Registro de implementação (2026-09-04）

- Adicionado `shouldShowOffPeakModelSelectionIssue`: apenas as três classes de tarefas que ainda podem ser executadas — queued, paused e running — exibem “模型配置需要更新”.
- Tarefas em estado final como completed, failed e cancelled continuam preservando o registro original e o texto do estado final, mas não exibem mais o aviso repair-required, que poderia induzir o usuário ao erro.
- Os cartões da lista e a página de edição compartilham o mesmo julgamento, e a lógica de bloqueio de Selection inválida na camada de agendamento não foi alterada.
- Testes direcionados aprovados: 3 arquivos, 39 tests passed; em seguida `pnpm typecheck` e `pnpm lint` também passaram (0 error).