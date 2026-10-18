# Restauração do resumo de Goal Todo e correção do piscar

Data de registro: 2026-06-10

## Contexto

Quando uma goal task histórica é restaurada e novas mensagens são enviadas, o painel de resumo pode exibir brevemente os 5 todos atuais como mais de 20 todos históricos. Os logs de campo mostram que, na restauração, os todos atuais do session store ainda são 5, mas na fase de merge do snapshot após o envio de uma nova mensagem aparece um assistant local em streaming com `goalIteration=none`, e o resumo comum de todos os `session` todoGroups achata todos os grupos em uma única lista.

## Fontes de estado

- `session_target` é o estado persistido autoritativo da goal.
- `todo` é o estado persistido autoritativo da lista de todos de curto prazo da sessão atual; `TodoWrite` substitui essa lista por inteiro.
- `todoGroups` não é um estado persistido independente, e sim projetado na leitura do snapshot a partir das mensagens históricas, do todo atual, do goal target atual e da verification timeline.

Portanto, a UI não pode tratar múltiplos `session` todoGroups como um resultado acumulado da "lista de todos atual".

## Design

O fallback comum de todos do painel de resumo exibe apenas o `session` todoGroup mais recente:

- Havendo um `plan` live/runtime, continua tendo prioridade o `plan`.
- Sem `plan`, escolhe-se o grupo mais recente com `source: "session"` entre os `todoGroups`.
- Não se faz mais o `flatMap` de todos os grupos de sessão, evitando que TodoWrite históricos se inflem em uma lista acumulada quando o goal target muda ou se perde temporariamente em um limite de restauração.

O preenchimento retroativo dos metadados do snapshot precisa suportar o desalinhamento de índices causado por mensagens de timeline UI-only:

- Quando a mensagem atual e a mensagem do snapshot têm o mesmo índice e o mesmo papel, o preenchimento continua pelo caminho original.
- Se a lista atual tiver mensagens UI-only como synthetic timeline, o alinhamento passa a ser feito pela ordem visível das mensagens que não são timeline.
- O preenchimento continua complementando apenas metadados de exibição e campos mais completos do snapshot, sem alterar a fronteira de transmissão de replayable/continuous.

## Fronteiras

- Não altera a estrutura das tabelas `todo` / `session_target`.
- Não adiciona campos de protocolo.
- Não persiste o resultado do agrupamento de goal iteration.
- O `desktop-continuous` do desktop continua mantendo o link principal de direct streaming.
- O `web-remote-replayable` no celular continua sendo restaurado pela semântica de snapshot/gap, sem contornar a fronteira replayable.