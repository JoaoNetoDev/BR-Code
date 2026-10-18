# Streaming Tool Input Backpressure

## Contexto

O ZCode Protocol já separou o fluxo de argumentos de ferramentas em `tool_input_start` / `tool_input_delta` / `tool_input_end`, que é a capacidade base do function call em streaming. O cenário de duas tarefas em campo em 2026-06-13 mostrou que a CPU do renderer não estava saturada por sobrecarga de computação do agent, mas porque a UI reparseava o `rawInput` acumulado em uma prévia completa a cada `tool_input_delta`, gravava isso no task message store e disparava um render do React.

O caso típico é uma entrada `Write` de cerca de 36KB quebrada em 785 deltas. Os deltas reais de rede não são grandes, mas a UI examina a cada delta uma string acumulada cada vez maior, formando um custo de parsing e renderização próximo de O(n²). As tarefas em segundo plano também gravam no store na mesma frequência, e com duas tarefas concorrentes o custo se soma no renderer principal.

## Objetivos

- Preservar o function call em streaming: a tarefa ativa ainda vê o cartão da ferramenta e a prévia dos argumentos o quanto antes.
- Tarefas não ativas deixam de materializar na árvore de mensagens a cada delta de argumentos de ferramenta.
- Entradas grandes de `Write` / `Edit` deixam de fazer parsing completo e gravação completa no store a cada delta.
- Ao voltar para uma tarefa em segundo plano que está rodando, continua-se usando o buffer de entrada da ferramenta já acumulado, sem perder a primeira metade dos argumentos.
- Eventos de estado da ferramenta deixam de escrever a mesma input no UI store repetidamente por causa de queued/started/closed/committed.
- Não alterar a fronteira de semântica de entrega de `desktop-continuous` no desktop e de `web-remote-replayable` no mobile.

## Design

### Active Live

A tarefa ativa continua consumindo o stream continuous completo, mas a prévia dos argumentos da ferramenta precisa de um orçamento:

- `tool_input_start` cria o cartão da ferramenta imediatamente.
- O primeiro `tool_input_delta` gera prévia imediata, para identificar rapidamente a forma da ferramenta (`Write` / `Edit` / `Bash` etc.).
- Os deltas seguintes de `Write` / `Edit` só geram prévia sob um orçamento de 1000ms de `SessionEvent.timestamp`, e o suffix acumulado no período é combinado em uma única atualização; o crescimento acumulado em bytes não pode contornar esse orçamento de tempo.
- As demais ferramentas seguem o orçamento existente de tempo/bytes, e a redução de frequência para as ferramentas de arquivo não diminui a velocidade de feedback de argumentos como comandos.
- `tool_input_end` serve apenas como atualização leve do status do cartão, sem analisar o raw input completo; quando o `tool_call` final carrega o input completo, ele é materializado uma única vez, evitando o parsing repetido de JSON grande entre end/call.
- O `raw` do evento de prévia guarda apenas `streamingRawInputLength`; o `streamingRawInput` completo não é gravado no message store.

### Background Summary

O monitor em segundo plano de tarefas não ativas usa o perfil de summary:

- `tool_input_start` pode criar um cartão leve de ferramenta, para que a tarefa em segundo plano continue parecendo avançar.
- `tool_input_delta` só entra no tombstone buffer do projection state, sem gravar no message store e sem disparar render do React.
- O tombstone buffer registra `rawInput`, `deltaCount`, a posição da prévia mais recente e o estado do input completo.
- `tool_input_end` continua repassando o status leve imediatamente; `tool_call` final, tool result, permission, elicitation e task terminal continuam sendo repassados imediatamente.
- Ao voltar para o active, a foreground subscription herda o background projection state, e o próximo delta/end/tool_call já pode materializar com o buffer acumulado completo.

### Tool Input Dedup

No fluxo de estado da ferramenta, o input de uma mesma tool call pode aparecer repetido em eventos como `tool_call_closed`, `scheduled`, `tool_queued`, `tool_started` e `tool_result_committed`. O projection da UI mantém um estado de materialização do tool input:

- Ao ver o input completo pela primeira vez, emite `tool_call` e faz cache.
- Eventos de estado posteriores com o mesmo input emitem apenas `tool_call_update`, sem carregar o input.
- No payload raw duplicado, o input completo é removido e restam apenas `inputOmitted: true` e `inputRef: "tool_call"`, para facilitar a depuração.

### Protocol Payload Backpressure

A fronteira do ZCode Protocol também precisa evitar repetição do payload completo:

- `model.streaming:tool_input_delta` consecutivos são combinados em pacotes de diff maiores na fronteira do protocol server; o primeiro delta faz flush imediato e os seguintes fazem flush conforme o orçamento de timestamp de evento existente ou um orçamento determinístico de bytes. Antes da chegada de qualquer evento de controle que não seja delta, também é preciso fazer flush. A projeção visível na UI de `Write` / `Edit` só reconverge para 1000ms em ProductProjection / na projection de compatibilidade e não pode ser contornada por um limiar de bytes do protocol.
- `model.streaming:text_delta` / `reasoning_delta` consecutivos também são combinados na mesma fronteira de protocolo. O primeiro delta faz flush imediato para preservar a sensação de «o modelo já começou a escrever», e os seguintes fazem flush conforme o orçamento de timestamp de evento e o orçamento determinístico de bytes, evitando acordar o renderer milhares de vezes quando o provider fatia o fluxo de raciocínio em pacotes de 1 a 5 caracteres, sem deixar o usuário sentir que o corpo do texto deixou de sair em streaming.
- `streaming_tool_ledger_updated` é o ledger de replay do runtime, usado apenas pelo agent reducer para restaurar o estado de execução, e não é mais mapeado como `session.updated` do app.
- Depois que `model.streaming:tool_call` já entregou o input completo, o `tool.updated:scheduled` do mesmo `toolCallId` não carrega mais o input.
- O tombstone de scheduled mantém `inputOmitted: true`, `inputRef: "model_stream"` e `inputByteLength`, para que os logs confirmem o comportamento de omissão.
- Se o scheduled aparecer antes do `tool_call`, ou se não houver um input completo comprovadamente entregue, o protocolo mantém o input original, para não quebrar a recuperação.

## Limites

- O projection/store do renderer, as projections de tarefa compatíveis dos services e o payload do ZCode Protocol participam todos da redução de frequência/deduplicação; o eventStore interno do runtime ainda mantém o ledger completo.
- O continuous do desktop continua assinando `deliveryKind: "desktop-continuous"`; o que muda é apenas que o projection determinístico reduz a frequência das atualizações de input visíveis na UI para `Write` / `Edit`.
- O coalescing do protocol mantém a semântica de diff: combina apenas o campo `delta` de `tool_input_delta` / `text_delta` / `reasoning_delta` adjacentes e nunca devolve o input full acumulado para dentro dos eventos de delta; o limite de lote é determinado apenas pelo primeiro pacote eager, pelo orçamento de timestamp de evento, pelo orçamento de bytes e pela ordem dos eventos. O orçamento de tempo precisa se basear em `SessionEvent.timestamp` e não em um timer live, para garantir a consistência da fronteira de recuperação `afterSeq` entre live e replay.
- A semântica de snapshot/gap recovery do web remote replayable não muda; se no futuro o background summary for descido para a camada de services, é preciso carregar explicitamente `clientMode` / `deliveryKind`.
- Requisições de permissão, requisições de entrada do usuário, conclusão/falha de tarefa e snapshot de stream gap não podem sofrer throttling.

## Aceitação

- Com duas tarefas concorrentes e uma entrada grande de Write, o pico de CPU do renderer é significativamente menor que antes da otimização, sem ficar em 100% por muito tempo.
- No profile CDP, `streaming-tool-input-preview.ts` deixa de ser o principal hotspot a cada delta.
- A tarefa ativa vê imediatamente o cartão de ferramenta de `Write` / `Edit` e o primeiro trecho dos argumentos; durante a execução, a prévia cara é materializada no máximo uma vez por segundo, e o fechamento exibe imediatamente o estado final preciso.
- `+N/-N` salta atomicamente para o valor real daquela amostragem em cada ponto, sem usar `requestAnimationFrame` linha a linha para alcançar o valor.
- Ao voltar para a tarefa em background, ela exibe o input completo da ferramenta.
- O snapshot final é consistente com o input/result do cartão de ferramenta da mensagem.
- `pnpm lint` e `pnpm typecheck` passam.