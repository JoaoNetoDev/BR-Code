# Descontinuação da Entrada de Rewind em Nível de Mensagem

## Estado Atual

A entrada de "rewind" em nível de mensagem no footer do cartão de mensagem foi descontinuada e não é mais exibida abaixo das mensagens do usuário ou do assistente. Não existe comando de conversation cascade rewind no V4.

Esta descontinuação afeta a entrada de cascade rewind em nível de mensagem de chat e não impacta a capacidade de "reverter / reaplicar" baseada no resumo de alterações de arquivos dentro do `MessageChangeSummaryPanel`. A entrada em nível de arquivo continua sendo usada para alternar o estado dos arquivos do workspace de um determinado assistant turn.

## Contexto

Essa entrada foi introduzida originalmente pelo seguinte commit:

| commit | autor | horário | título |
| --- | --- | --- | --- |
| `a9e3ace78` | — | `2026-06-24 18:20:03 +0800` | `feat(ui): support message-level rewind with preview confirmation` |

Depois disso, a mesma funcionalidade recebeu vários commits de correção, como `ab1a92254`, `daed7eb81`, `51889364a` e `fc764779b`. A decisão atual de semântica de produto é remover primeiro a entrada da UI, evitando que o usuário confunda "retroceder o histórico de mensagens + os arquivos" com a alternância de arquivos de um único turn no resumo de arquivos.

## Restrições

- O `ConversationRowView` do V4 não oferece conversation rewind action.
- O `session/rewind` / `session/rewindCascade` independente foi removido do protocolo e da cadeia de chamadas.
- A modificação de query no histórico usa `editUserQuery`; o retry usa `retryTurn`.
- O rollback do estado dos arquivos usa `applyFileRewind` e não trunca implicitamente o histórico do chat.

## Pontos de Verificação

- As actions de mensagem mantêm apenas as ações permitidas pela row projection atual, como copy, edit, retry e fork.
- O painel de resumo de alterações de arquivos ainda consegue disparar o reverter / reaplicar em nível de arquivo com a semântica original.
- O controle remoto do celular não ganha nenhuma entrada de rewind replayable.