# Todo152: restaurar permissões após aprovação do plano e sincronizar o campo de entrada (hotfix)

Estado: foi substituído pelo Todo151 e não é executado isoladamente. Em 2026-09-15 o usuário passou a separar diretamente a permissão do Plan; o problema residual de UI após a aprovação foi incorporado ao [Todo151](./todo-151-independent-plan-state-draft.md). Abaixo permanece a solução histórica de 2026-09-14, que não representa a decisão atual; em especial, não se deve mais reconstruir a cadeia de restauração de `prePlanMode` conforme este item.

## Correções necessárias

1. Depois que o ExitPlanMode for realmente aprovado e sair com sucesso, o campo de entrada não deve mais reter o Plan desta rodada, e deve exibir a permissão restaurada pelo lado de execução; a próxima mensagem comum não pode entrar novamente no Plan por causa do rascunho antigo.
2. Restaurar a permissão de antes de entrar no Plan: sessões existentes seguem a permissão explícita que a sessão tinha antes da entrada; sessões novas seguem a permissão determinada antes de entrar no Plan na criação de tarefa comum, incluindo a escolha explícita do usuário. Não é permitido cair sempre em `build` sem distinguir a origem, nem elevar sempre para `yolo`.
3. Os dois lados restauram a mesma permissão-alvo; não é permitido que a UI mostre que houve restauração enquanto o Runtime ainda executa em outro modo. A aprovação continua o Turn atual e não cria uma nova Submission do usuário; rejeição/feedback não sai do Plan.

```text
permissão anterior da sessão existente / permissão da inicialização de nova tarefa ou da escolha explícita
                       ↓ salvar o alvo de retorno desta rodada
                    submeter o Plan
                       ↓ aprovado com sucesso e sair
          Runtime restaura o alvo → o Composer sincroniza a saída deste Plan
```

## Fatos de código verificados e restrições de implementação

- `core/src/runtime/session-mode-port.ts` usa o `prePlanMode` em memória, com fallback para `build` quando ausente; `methods/config.ts` já memoriza o valor anterior na troca de modo comum, mas quando a configuração inicial já é Plan, a restauração a frio nem sempre tem esse valor anterior.
- `ui/src/v4/composer/useDraftConfigControl.ts` inicializa o rascunho apenas uma vez pela Session e depois não acompanha a saída, o que faz o lado de execução já ter saído enquanto o rascunho continua como Plan.
- `newTaskDraft.ts` usa `recent.mode ?? build` na criação comum; `composerRecent.ts` também grava Plan em recent depois que a Submission é aceita. Portanto o alvo de retorno precisa ser preservado antes de entrar/submeter o Plan; não pode ser lido no momento da aprovação a partir do recent já sobrescrito pelo Plan, nem se pode tratar o `build` padrão do novo Runtime como a intenção original do usuário.
- Não usar “ter sessionId” como critério de sessão existente: a pré-criação antes do primeiro envio não equivale a ter histórico de permissão explícita.
- Preferir reutilizar o mecanismo de alvo de retorno já existente; a informação mínima que precisar atravessar a entrada ou a persistência é detalhada na implementação. Quando o registro antigo realmente não tiver o fato de permissão, seguir `build` de forma conservadora, sem adivinhar acesso total.
- Sincronizar apenas esta saída real; não limpar corpo, modelo ou anexos, não usar um snapshot genérico para sobrescrever continuamente o rascunho do usuário, e não sobrescrever a nova permissão/novo Plan escolhido explicitamente pelo usuário depois. Eventos duplicados ou em replay não podem consumir de novo o efeito da saída.
- Não separar o mode, não alterar o system prompt, não ajustar a exclusividade Plan/Goal nem as regras de permissão de ferramentas; desktop local e mobile shared-host usam o resultado autoritativo da saída, sem fila nova nem transmissão de permissões padrão entre plataformas.

## Aceitação

- Sessões existentes entram no Plan a partir de build / edit / yolo e, após a aprovação, Runtime, campo de entrada e as Submissions comuns seguintes são restaurados de forma consistente; não é preciso uma mensagem extra para sair.
- Sessões novas entram no Plan a partir da permissão mais recente ou da escolha explícita do usuário; mesmo uma primeira execução já como Plan não perde o alvo de retorno; um recent já sobrescrito pelo Plan não pode afetar o alvo de retorno desta rodada.
- Rejeição e feedback de modificação continuam mantendo o Plan; quando o usuário atualiza o próximo rascunho antes ou depois da aprovação, ele não é sobrescrito pelo evento de saída antigo; corpo e seleção de modelo permanecem como estavam.
- Remontagem, restauração a frio, eventos duplicados e reconexão do mobile conferem o resultado da restauração; a ausência do fato histórico não trava nem eleva a permissão.
- Antes da implementação, adicionar testes unitários e E2E de interação; depois, review, checagem de tipos/lint/arquitetura e registro de ambientes não verificados. Atualmente isto é apenas um documento e não representa a aprovação dos critérios acima.