# Estado de fork de goal session

## Contexto

O fork de uma goal session não é uma cópia pura do transcript. Um goal em execução é expresso por quatro tipos de estado persistido:

- `session_target`: o alvo em si, seu status, orçamento e estatísticas acumuladas.
- a user message model-only `goal-continuation`: a entrada de limite que dá ao modelo a continuação da próxima rodada do goal.
- a assistant message: a saída visível de cada rodada do goal.
- a session entry `target_completion_verification`: o ciclo de vida do verifier, a iteração, a assistant âncora e o resultado da verificação.

Se o fork copiar apenas as mensagens e depois chamar `setTarget` de novo, o child recebe um novo `targetId` e uma timeline de verifier vazia. Depois que a UI filtra a continuation model-only, várias assistant passam a parecer a mesma iteração do goal e acabam sendo combinadas em uma única assistant pela projeção de histórico.

## Semântica

- O fork de uma goal session deve copiar o estado do goal anterior ao ponto de fork, em vez de recriar um goal vazio.
- A identidade do target do child precisa estar alinhada com os metadados de continuation/verifier copiados.
- Só são copiadas para o child as verifier entries cujo anchor assistant já entrou no transcript do child; verifier entries posteriores ao ponto de fork não podem entrar no child.
- O `anchorAssistantMessageId` da verifier entry copiada precisa ser reescrito para o message id do child.
- O estado de conclusão do goal do child é deduzido a partir do resultado do verifier copiado: só o verifier copiado mais recente com passed resulta em `complete`; caso contrário, o child não pode ser marcado como concluído apenas porque o parent terminou depois.
- O fork não copia a queue do parent nem inicia automaticamente um novo model turn.

## Restrições de implementação

- A cópia do estado de fork deve acontecer no caminho de fork do agent core, porque é onde existem simultaneamente o transcript cut e o parent-to-child message id map.
- A camada de bootstrap/protocol não pode sobrescrever o target do child com `setTarget` depois do fork do core; a semântica de `setTarget` é criar/substituir um alvo e não se ajusta a um branch de fork state.
- Campos de execução do goal ativo não podem ser copiados para o child, evitando que o child herde o `activeInputId` / timer em execução do parent.