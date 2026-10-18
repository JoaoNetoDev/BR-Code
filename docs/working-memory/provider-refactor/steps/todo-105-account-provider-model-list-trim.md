# Todo 105: enxugar a lista de modelos pré-definidos dos Account Providers pessoal/equipe

> Status: implementação, verificação de configuração/Registry e revisão item a item concluídas. 2026-09-10. As evidências de implementação/teste, a revisão de fronteiras e as limitações do ambiente real estão em [a revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## Requisitos Confirmados

- A lista de modelos pré-definidos dos Account Providers pessoal e de equipe remove `GLM-5-Turbo` e `GLM-5.2`.
- O escopo cobre os Account Providers pessoal/equipe da BigModel e da Z.ai.

## Limites de Escopo

- Este item apenas ajusta os membros pré-definidos dos Providers acima, e não se expande para a remoção das regras de capacidade de modelos em geral.
- Não ajusta em conjunto as listas do Start Plan, do Off-Peak nem dos Providers de API Key comuns.
- Não limpa modelos adicionados pelo próprio usuário nem reescreve o Model Selection salvo em sessões, tarefas e outros históricos.

## A Executar

- [x] Localizar a origem das listas pré-definidas dos Providers acima e remover esses dois modelos.
- [x] Atualizar os testes das listas, verificando que os demais modelos pré-definidos e os Providers fora de escopo não são afetados.
- [x] Revisar o resultado nas páginas de configurações e na lista de seleção de modelos; o item só é fechado depois da conclusão da implementação e da verificação.

## Evidências de Implementação

- Apenas os quatro `builtinModelIds` pessoal/equipe foram alterados, sem remover nenhuma regra de capacidade/override de modelo nem modificar as listas de modelos do Start/Off-Peak.
- `account-model-membership.test.ts` verifica a enxugada dos pré-definidos para os quatro Providers e, ao mesmo tempo, confirma explicitamente que adicionar 5.2/Turbo manualmente em Personal ainda entra no Registry. Antes da correção, a asserção da lista falhava; depois da correção, passa. A integridade dos Builtin, com 14 casos, passa.
- A lista de manutenção de documentação foi sincronizada. Não houve escrita nem migração em histórico, tarefas ou configuração do usuário; configurações e seletor compartilham a lista resolvida, sem novo filtro na UI.