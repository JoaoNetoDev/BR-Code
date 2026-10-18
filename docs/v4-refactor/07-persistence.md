# Especificação Atual de Persistência e Recuperação Cold do V4

Data de atualização: 2026-07-15

O princípio de persistência do V4 é: transcript, timeline anchor, session metadata e o
ciclo de vida da entrada são fatos de longo prazo; projection, topic event log, subscription,
CommandInbox LRU e active runtime work são estado reconstruível ou estado dentro do processo.

## Fatos em SQLite

O session store do CLI fica em `~/.zcode/cli/db/db.sqlite`. O ponto de entrada das migrações
é `apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts`, atualmente na
migração `0018`:

| Migração | Efeito atual |
| --- | --- |
| `0014_message_part_sequence` | Estabelece uma ordem estável para message/part |
| `0015_message_part_sequence_backfill_and_guard` | Corrige sequences vazias e garante as escritas seguintes com trigger |
| `0016_session_input_ledger` | Adiciona o ledger durável do ciclo de vida das entradas |
| `0017_session_input_start_now_delivery` | Inclui `startNow` no ledger de admissão de entradas |
| `0018_session_input_failed_status` | Distingue o estado terminal de falha de inicialização do runtime após o aceite |

message/part continua evoluindo de forma aditiva, com colunas de índice mais JSON data. Quando
um anchor opcional está ausente, o lado de leitura tolera a ausência por compatibilidade; apenas
estruturas que precisam de consulta, unicidade ou restrição transacional recebem novas colunas por
migração append-only.

## Transcript e timeline anchor

`MessageProjectionAnchor` atualmente pode guardar:

- `turnId`, `productTurnId`;
- `origin`;
- `sourceCommandId`;
- message ids ordenados e de fronteira do fork stable, além da fronteira de goal.

As timeline parts guardam markers visíveis como compact, goal verification, fork, model change, e
podem trazer `sourceCommandId`. Novas gravações devem preservar esses anchors sempre que possível;
quando um dado histórico estiver sem o campo, um resolver único faz o downgrade da interpretação,
e é proibido que várias UIs/helpers escrevam cada um sua própria heurística.

Quando o fork stable copia os fatos da conversation, ele deve reescrever as referências locais do
filho. Um anchor local que aponta para uma mensagem do pai que não foi copiada deve ser limpo,
mantendo a referência original apenas como provenance; não se deve permitir que a restauração do
filho releia o estado atual do pai e se passe pelo estado do momento do fork.

## Ledger do ciclo de vida das entradas

`session_input` registra:

```text
admitted
  |-- promoted  -> associado atomicamente à user message do transcript
  |-- cancelled -> o usuário deletou ou cancelou
  |-- discarded -> motivos explícitos como restart / limpeza de queue
  `-- failed    -> aceito, mas o runtime não conseguiu iniciar
```

A entrega é `startNow | guide | queue`. O id fica alinhado com o `sourceCommandId`, e o payload
preserva o `ConversationInputIntent` completo, incluindo anexos, lado de envio e informações de
dispatch.

Essa tabela resolve o problema de "após o ACK, uma queda antes de a mensagem ser persistida faz a
entrada desaparecer sem deixar rastro", mas não significa que o CLI execute automaticamente as
entradas antigas depois de um restart. No resume, registros `admitted` remanescentes passam a
`discarded(session_resumed)`; o `commands/query` pode devolver um fato de falha explícito, e então
o usuário decide se reenvia.

## Fatos de idempotência de comandos

Não é criada uma tabela CommandInbox persistente. Além do LRU já resolvido, `commands/query`
reconstrói o resultado a partir das seguintes fontes persistentes:

1. transcript anchor;
2. timeline part;
3. child/session entry command fact;
4. estado terminal do input ledger.

A consulta precisa acertar exatamente por `(sessionId, commandId)`. O `createSession` global
recupera a session real pelo fato de input/child correspondente ao command id, e não pode se
basear apenas em title, workspace path ou na criação mais recente para adivinhar.

## Cold hydration

A assinatura cold do V4 respeita:

```text
persisted message/part + timeline + session input + session metadata
  -> transcript-hydration / cold-event-merge
  -> canonical SessionEvent
  -> ProductProjection
  -> snapshot + novo logEpoch
```

A recuperação cobre fatos visíveis como text, reasoning, tool, subagent, compact, goal,
model/config e o estado terminal de queue/input. Tools históricas em `pending/running` ou active
work não podem fingir, após um restart do CLI, que continuam em execução; o hydration precisa
fechá-las em um estado terminal somente leitura. A ordem autoritativa dos compact markers
continua priorizando a nova timeline part, e o legacy compaction boundary serve apenas para o
runtime history e não deve renderizar de novo a barra visível.

O event log é usado apenas para o resume limitado dentro do processo atual do CLI. Uma mudança de
logEpoch indica que o base antigo ficou inválido, e o cliente deve aceitar o novo snapshot; não é
possível entregar messages do banco de dados diretamente ao renderer contornando a projection,
nem tratar seq/revision antigos como um cursor estável entre processos.

## Limites entre draft e estado de execução

- Uma session que é apenas um draft pode aparecer no sessions-index, mas, sem transcript, não é
  restaurada como fato de sessão de longo prazo;
- active runtime work, pending network request e subscription não são persistidos;
- o input visível da queue tem um ledger durável, mas um restart não restaura a execução
  automaticamente;
- desktop continuous e mobile replayable compartilham os fatos persistidos acima, e os frames de
  recuperação continuam sendo gerados conforme cada delivery profile.