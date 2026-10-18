# Aviso de callback de sessão expirada no Bot

## Contexto

Um usuário de Bot pode clicar em botões de mensagens antigas ou continuar enviando mensagens em uma active task que já expirou. Nesse caso, a camada de protocolo do ZCode Agent retorna `Session not found: <id>` / `Session is not active: <id>` ao restaurar a task. A lógica antiga envolvia o erro subjacente em "falha ao processar o callback do bot", e o usuário não ficava sabendo o que fazer em seguida.

## Solução

- Quando a cadeia de tratamento do provider callback encontra erros de sessão ausente ou inativa, ela não devolve diretamente o session id subjacente ao usuário.
- O aviso exibido ao usuário deve informar que "a sessão da task atual expirou" e orientar a enviar `/new task` para criar uma nova task.
- Os logs mantêm o erro original, facilitando a investigação de inconsistências no task index, na identidade do workspace, na conexão remota ou no session store.
- Quando um prompt de mensagem comum é enviado em segundo plano e ocorre um erro do mesmo tipo, usa-se o mesmo aviso amigável, evitando que o erro vaze pelo caminho de segundo plano.

## Aceitação

- O `Session not found: <id>` presente no callback do Bot não aparece mais como texto visível ao usuário.
- A resposta visível ao usuário contém a orientação `/new task`.
- Nenhuma alteração no protocolo task/session, na identidade do workspace ou na semântica de remote continuous/replayable.