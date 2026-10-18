# Configurações de exibição do fluxo de mensagens

Dois toggles das configurações comuns controlam de forma independente o conteúdo exibido no fluxo de mensagens do detalhe da conversa:

- `messageStreamShowReasoning`: quando ligado, exibe todas as linhas de reasoning / thought; quando desligado, cada turno do assistant ainda exibe a primeira linha de reasoning e as seguintes ficam ocultas.
- `messageStreamShowTodos`: quando ligado, exibe os cards da ferramenta Todo; quando desligado, não exibe.

As quatro combinações de toggles precisam valer: a primeira linha de reasoning é sempre exibida; "显示思考过程" ("Mostrar processo de pensamento") controla apenas os raciocínios seguintes do mesmo turno, e "显示待办" ("Mostrar pendências") controla o Todo de forma independente. As mudanças de configuração chegam pelo snapshot de configurações compartilhado ao contexto de renderização de linhas do `SessionPane` do V4; o `rowId` da primeira linha de reasoning de cada turno é derivado pelo `ConversationTurnGroup` a partir da ordem total de linhas do turno, sem copiar estado de visibilidade local do renderer.

"显示思考过程" vem ligado por padrão para novos usuários. A versão que troca o valor padrão usa
`messageStreamShowReasoningMigrationInitialized` para executar uma migração única:

- Quando o `setting.json` antigo não tem a marca de migração, independentemente de o valor original de `messageStreamShowReasoning` ser
  `true`, `false` ou ausente, migra-se uniformemente para `true`, e a marca de migração junto com o resultado são persistidos atomicamente pela fila de escrita serial do serviço de configurações.
- Depois que a marca de migração existe, tanto `true` quanto `false` no disco são a escolha autoritativa do usuário; quando ele desliga de novo, leituras e upgrades posteriores não podem religar.
- Em novas instalações, a resolução é direta para `messageStreamShowReasoning=true` com a migração já concluída; a primeira escrita normal de configurações persiste os dois campos juntos.

```text
settings read
  |
  +-- migration marker missing --> force reasoning on --> persist marker
  |
  +-- migration marker present --> preserve stored true/false
```

Esses dois toggles apenas recortam a renderização da UI e não modificam a projection do CLI, o snapshot de sessão, os resultados de execução de ferramentas nem as mensagens persistidas. `ConversationStatusPanel` continua exibindo o resumo de progresso da sessão a partir de `plan` / `todoGroups`, sem sofrer influência de `messageStreamShowTodos`.

O `desktop-continuous` do desktop e o `web-remote-replayable` da Web no celular reutilizam as mesmas regras de renderização; os toggles não participam de decisões de transmissão, restauração, fila ou workspace identity.