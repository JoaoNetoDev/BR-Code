# Chat Context Usage Refresh Action

## Escopo

A posição de ação à direita do header de cota restante do Coding Plan no painel de hover de contexto do composer é usada para entrar nos detalhes de uso.

## Comportamento

- Quando a atualização remota da cota está em andamento, a posição de ação oculta o botão "mais/detalhes" e exibe um ícone de loading.
- Quando a atualização termina o loading sem erros, a posição de ação exibe umcheckmark verde de sucesso por 1 segundo.
- Depois que o checkmark de sucesso desaparece automaticamente, o botão "mais/detalhes" é restaurado.
- Os detalhes da cota continuam podendo ser exibidos enquanto houver um snapshot em cache; esta alteração afeta apenas a posição de ação do header.
- Quando existe cota em cache e a atualização falha, a área de conteúdo não é ocupada: a barra de cota em cache é mantida e apenas um ícone de info na cor de warning é exibido ao lado de "mais", com um tooltip indicando o motivo da falha.
- Quando não há cota exibível, usa-se um info notice: ícone de informação à esquerda, texto do usuário ao centro e botão de ícone de atualizar à direita.
- A mensagem de falha não exibe o provider/raw error (por exemplo, código de timeout), evitando expor diretamente os detalhes da atualização em segundo plano no painel de hover.

## Notas de Implementação

- O estado é encapsulado em `CodingPlanUsageHeaderAction`, evitando continuar empilhando a lógica de feedback de conclusão da atualização no arquivo agregador do painel de contexto.
- A mensagem de erro com cache é carregada por `CodingPlanUsageHeaderAction`; o estado vazio sem cache/indisponível é encapsulado em `CodingPlanUsageNotice`.
- O access refresh `silent`, quando já existe um snapshot em cache, mantém `entitlement.loading=false`, evitando que o conteúdo em cache entre em flash como checking; portanto, o ícone de atualizar disparado pelo hover é passado por `ChatContextUsage` via `refreshing` após rastrear a promise de `onAccess`.