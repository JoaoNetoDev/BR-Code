# Synthetic Timeline Dividers

## Contexto

Na área de chat existem várias categorias de timeline divider que não são corpo de mensagem: compactação de contexto, session fork, troca de modelo e verificação de goal. Essas mensagens servem para explicar mudanças de estado da sessão e não pertencem ao corpo do assistant. O novo modelo de visualização de turn está em [conversation-turn-view-model.md](./conversation-turn-view-model.md) e a especificação de armazenamento persistente em [conversation-transcript-storage.md](./conversation-transcript-storage.md).

## Restrições de comportamento

- O timeline divider precisa ser classificado primeiro como worklog ou boundary, e só então gerar a ChatView render row.
- O compact é worklog do assistant turn: um auto compact completed pode ser anexado ao history prefix de um assistant posterior e ser colapsado por "已工作 xxx"; compact running / retrying precisa continuar visível.
- goal verification e session fork são boundary: não podem ser anexados ao history prefix / suffix do assistant anterior ou posterior.
- No início da compactação de contexto, após o envio de `/compact` o divisor `context_compaction` started é inserido localmente de imediato e o usuário deve ver na hora o estado "上下文正在压缩"; ao terminar, o mesmo divisor é atualizado para completed.
- O divisor optimistic compact local e o divisor de agent lifecycle devem ser mesclados em uma única mensagem de UI. O agent lifecycle pode não ter `inputId`; nesse caso usa-se o fallback de correspondência "último divisor local running compact + operationId não local".
- O timeline running de `context_compaction` e `goal_verification` já é feedback de progresso dedicado e, por isso, o ChatLoading do rodapé durante o trabalho ativo deve ficar oculto. `session_fork` e `model_change` são apenas divisores informativos e não sustentam por si mesmos o estado running do turno principal.
- Compact running / retrying e goal verification são limites da saída do assistant e não pertencem ao tempo de trabalho do assistant anterior ou posterior; antes de entrar em um divisor desse tipo, todo assistant comum que ainda esteja em streaming precisa ser congelado. Um auto compact completed é renderizado como worklog prefix de um assistant posterior e deixa de ser congelado isoladamente como limite de topo. `session_fork` e `model_change` não congelam o tempo do assistant.
- `session_fork` e `goal_verification` vêm do synthetic timeline do agent / snapshot e precisam ser restaurados junto com o snapshot.
- O `model_change` legado é a timeline de UI local do renderer e serve para marcar onde a troca de modelo aconteceu; após o transcript v2, um model change novo deve ser gravado no lado do agent como `part.type="timeline"`. Ele ainda não injeta contexto no agent nem é persistido como agent message.

## Identidade estável

- `ZCodePersistedMessage.id` guarda o `messageId` original do lado do protocolo. Na restauração do snapshot esse id tem prioridade, evitando que mensagens ao vivo e mensagens restauradas usem ids diferentes.
- Quando um snapshot antigo não tem `id`, a UI gera um fallback id a partir da semântica de timeline:
  - `context_compaction`: `operationId`
  - `goal_verification`: `targetId + goalIteration`; `verificationId` representa apenas uma tentativa do verifier
  - `session_fork`: `parentSessionId + targetMessageId + targetCheckpointId`
- No alinhamento de snapshots terminais, a deduplicação de timeline verifica simultaneamente o id e a identidade semântica. Assim, dados antigos, a restauração replayable e o snapshot de estado final do desktop continuous não inserem o mesmo divisor duas vezes nem o movem para a posição errada.

## Limites entre plataformas

Esta especificação ajusta apenas a projeção das mensagens, a deduplicação na restauração e a renderização da ChatView, sem alterar a cadeia realtime das tasks:

- O desktop continua usando `desktop-continuous` direct realtime.
- O controle remoto do celular continua usando snapshot / recuperação por gap do `web-remote-replayable`.
- relay e main process não recebem novo estado de negócio de task/session.