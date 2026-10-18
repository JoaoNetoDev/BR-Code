# Limite de Aprovação do Plan Mode

## Contexto

`ExitPlanMode` do plan mode é o limite de revisão do plano: depois que o modelo submete um plano, é preciso esperar a aprovação explícita do usuário para sair de `plan` e seguir com a implementação.

## Semântica

- `EnterPlanMode` pode entrar no estado de plano somente leitura sem confirmação.
- `ExitPlanMode` sempre exige confirmação do usuário no modo `plan`, inclusive no cenário em que se entra em plan vindo de `yolo`.
- Só depois que o usuário aprova `ExitPlanMode` o runtime volta ao modo anterior à entrada em plan e passa a permitir edições subsequentes.
- Se o usuário rejeita `ExitPlanMode` sem preencher comentários de modificação, o turn atual deve terminar e a sessão deve permanecer no modo `plan`, aguardando o usuário continuar digitando os comentários de modificação.
- Quando o usuário preenche comentários de modificação na aprovação de `ExitPlanMode`, o runtime permanece no modo `plan` e persiste o feedback como uma `user` message real e comum; o resultado de ferramenta de `ExitPlanMode` retorna apenas uma explicação de ponte, informing ao modelo que o feedback do usuário virá na próxima mensagem de usuário. Assim, UI / resume / histórico visível ao provider tratam esse trecho como uma nova query do usuário, em vez de engoli-lo no resultado da ferramenta ou exibi-lo como mensagem de steer do turno.

## Exceção para ferramentas MCP

O plan mode, por padrão, só permite execução de ferramentas somente leitura e não destrutivas. As ferramentas MCP são capacidades expostas dinamicamente por servidores externos; algumas não declaram `readOnlyHint`, mas ainda precisam ser usadas na fase de planejamento para ler contexto externo, estado de dispositivos ou materiais remotos.

Por isso o plan mode usa um limite de permissão separado para as ferramentas MCP:

- A identidade MCP é reconhecida pela declaração de permissão da ferramenta, `permission.permission === "mcp"`, e não por inferir a partir do prefixo de nome `mcp__`.
- Regras de `deny` / `ask` de nível de projeto continuam tendo precedência e não podem ser contornadas pela exceção MCP.
- Ferramentas MCP com `destructiveHint: true` declarado explicitamente continuam sendo recusadas no plan mode.
- Ferramentas MCP que não são explicitamente destrutivas podem executar no plan mode, mesmo que a ferramenta não declare `readOnlyHint: true`.
- Essa exceção apenas dispensa o judgement de readonly do plan mode, e não altera o registro das ferramentas MCP, o schema visível ao modelo, o orçamento de output, timeout, cancelamento, logs ou o protocolo de exibição de permissões na UI.

## Implementação da interação

`ExitPlanMode` continua sendo uma ferramenta chamada pelo modelo, e o runtime continua criando o limite de aprovação por meio do permission broker. Para permitir que o usuário digite comentários de modificação direto na.dialog de aprovação, a implementação de broker de `ExitPlanMode` reaproveita o canal `interaction/requestUserInput` de `AskUserQuestion`, em vez de exibir um `interaction/requestPermission` comum.

- `approve` é mapeado para permission `allow`.
- Fechar a dialog é mapeado para permission `deny`, sem feedback, mantendo o comportamento antigo de encerrar o turn atual.
- A entrada customizada é mapeada para permission `deny + reason`, com `reasonSource: "plan_approval_feedback"`, usado para expressar “é necessário modificar o plano”; o runtime só pode depender dessa source explícita para interpretar como “o usuário pede modificação do plano”, e não pode tratar outros `deny + reason` de hook, project rule ou broker como feedback.
- Após receber `reasonSource: "plan_approval_feedback"`, o runtime primeiro injeta um tool result para `ExitPlanMode`, fechando o protocolo de tool-use do provider, e então escreve a entrada customizada no histórico real de mensagens de usuário pelo caminho de active-turn pending input com `source: "plan_approval_feedback"`. Essa ordem garante que o histórico visível ao provider seja `assistant tool_use` → `tool_result` → `user feedback`, e ao mesmo tempo reaproveita `persistUserPrompt`, para que o próximo resume veja esse feedback. A UI renderiza o active-turn steer de origem padrão como mensagem guided/steer; o feedback de aprovação de plano deve ser renderizado como uma bolha comum de usuário.
- `AskUserQuestion` comum não segue esta regra: sua resposta continua sendo o resultado da chamada de ferramenta, e apenas o feedback de aprovação de `ExitPlanMode` é promovido a uma nova mensagem de usuário.
- A camada de projeção mapeia a pending permission de `ExitPlanMode` para uma pending elicitation e filtra os eventos de realtime `permission.requested` correspondentes, evitando que a UI mostre ao mesmo tempo a dialog comum de permissão e a dialog com campo de entrada.

## Motivo da correção

Antes, rejeitar `ExitPlanMode` era encapsulado como uma falha comum de ferramenta e continuava sendo entregue ao modelo. Ao receber o resultado de falha, o modelo podia repensar por conta própria e submeter outra versão do plano no mesmo turno, fazendo o usuário ver um novo diálogo de confirmação antes mesmo de ter digitado os comentários de modificação. Agora o resultado de rejeição de `ExitPlanMode` sem feedback carrega turn control, e o runtime, após registrar a rejeição, interrompe imediatamente a rodada, evitando auto-loops na fase de revisão do plano.

Uma rejeição com feedback não pode interromper a rodada, mas também não pode esconder as palavras do usuário dentro do tool result. A razão é que esse conteúdo vem de entrada ativa do usuário e é semanticamente equivalente à próxima query; se fosse escrito apenas no tool result, a UI não mostraria a bolha do usuário e o resume da sessão não conseguiria restaurar a trajetória de revisão como uma mensagem de usuário real. Portanto, esse caminho precisa reaproveitar a cadeia de persistência de mensagens de usuário real.