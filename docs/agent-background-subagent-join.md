# Histórico do Background Agent Join

Este documento registra uma antiga solução temporária do período de 2026-06: reconvergir o background subagent para um comportamento de "esperar e dar join dentro do main turn atual".

Essa abordagem já foi descontinuada e não é mais um objetivo de implementação. O novo plano de execução está em:

- `apps/zcode-cli/docs/design/v2/tool/07-subagent-background-plan.md`

## Motivos da descontinuação

- O objetivo atual não é fazer o main turn aguardar a conclusão do background subagent para só então terminar, mas sim permitir que o main turn termine normalmente antes.
- Quando o background local_agent termina, o main agent deve ser automaticamente despertado por `<task-notification>` para continuar processando o resultado.
- A abordagem antiga excluía explicitamente o idle wake, o que é o oposto do objetivo atual.
- Insistir na abordagem antiga encobriria problemas reais de lifecycle como fake running / fake notified.

## Restrições atuais

- O sistema de `Agent` / subagent baseado em profile continua sendo reutilizado.
- Se a correção dentro do sistema existente exigir remendos espalhados ou a manutenção de múltiplas máquinas de estado, é permitido subir para uma refatoração completa; mas é obrigatório escrever antes o motivo do gatilho, os limites da alternativa e os testes de regressão.
- Não adicionar entradas de gerenciamento manual de background agent.
- Não fazer commit automático.