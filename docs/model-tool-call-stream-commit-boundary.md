# Limite de commit em streaming de tool call do modelo

## Contexto

O provider do modelo retorna os argumentos da ferramenta divididos em múltiplos deltas. Um prefixo de argumentos ainda inacabado já pode ser JSON válido — por exemplo, recebe-se `{}` primeiro e depois campos continuam sendo acrescentados. Portanto, "dá para fazer `JSON.parse` agora" descreve apenas o estado sintático e não serve como base para considerar a tool call concluída ou executável.

As dependências travadas atualmente são `ai@6.0.193`, `@ai-sdk/anthropic@3.0.81`, `@ai-sdk/openai@3.0.65` e `@ai-sdk/openai-compatible@2.0.60`. No caminho comum de agent-tool alcançável hoje no ZCode, o adapter do provider faz enqueue de `tool-input-end` e do `tool-call` final, em sequência, no mesmo transform / flush local; os dois se tornam eventos locais adjacentes no full stream do AI SDK, sem nova leitura do stream de rede do provider entre eles.

O momento de conclusão continua sendo adaptado pelo AI SDK conforme o provider:

- Anthropic Messages: `content_block_stop`;
- OpenAI Responses: tool output item / arguments done;
- OpenAI-compatible Chat Completions: `flush()` do response stream.

## Especificação de comportamento

O ZCode não sintetiza mais chamadas executáveis a partir de deltas. Na requisição principal comum, a relação entre exibição em streaming, buffer de retry e entrada final de execução é a seguinte:

```text
Provider SSE
    │
    ▼
AI SDK
    ├─ tool-input-start / delta / end
    └─ final tool-call(input)
                    │
                    ▼
ZCode retry-safe buffer
    ├─ start / delta / end ───────────────→ apenas exibição, aguarda a chamada final
    │
    └─ final tool-call
            │
            ├─ normalização estrita da entrada final
            └─ flush único de start / delta / end / tool_call
                                          │
                                          ▼
                                    agendamento e execução pelo Core
```

- Não é permitido sintetizar `tool_input_end` ou `tool_call` só porque o `JSON.parse` dos argumentos acumulados funcionou pela primeira vez.
- `tool-input-start`, `tool-input-delta` e `tool-input-end` na requisição principal comum pertencem ao prelude retry-safe anterior à chamada final; o delta serve apenas para exibição e não como fonte dos argumentos finais de execução.
- Uma chamada que já teve `tool-input-start` mantém o end gate existente: sem `tool-input-end`, a chamada final não substitui o evento de término nem é publicada ou cacheada.
- Os argumentos de execução vêm apenas do `tool-call.input` final do AI SDK. Isso preserva argumentos iniciais do provider que aparecem só no input final e não nos deltas.
- Depois que o `tool-call` final chega, o Adapter faz uma normalização estrita e emite de uma só vez os eventos bufferizados até ali, mantendo o retry boundary existente.
- Em caso de falha de rede antes da chamada final, continua valendo o retry existente do Adapter: descarta-se o prefixo de exibição do attempt atual e não se adivinham argumentos a partir dos deltas.
- Uma `tool-call` atômica, sem start/delta, é tratada diretamente como chamada final.
- Chamadas finais duplicadas com o mesmo id são publicadas apenas uma vez.
- `tool-input-start.providerExecuted` serve somente como compatibilidade de metadados existente: quando a chamada final fornece o valor explicitamente, o final prevalece; quando a chamada final omite, o valor do start é preenchido de volta. Isso não adiciona semântica nova de commit, retry ou execução.
- As regras de normalização estrita e de recuperação de malformed/null estão em
  [Model Tool Call Validation](./model-tool-call-validation.md).

No SDK atual, end/call são eventos adjacentes gerados pela mesma conversão local; o ZCode consome esse par no mesmo attempt e continua usando as políticas existentes de retry do Adapter, de recovery do Core e de Compact.

## Timing entre múltiplos providers

```text
Anthropic content_block_stop ──────┐
OpenAI Responses item done ────────┼─→ AI SDK tool-input-end
OpenAI-compatible stream flush ────┘             │
                                                 └─→ final tool-call
                                                          │
                                                          ▼
                                              ZCode normaliza estritamente e publica
```

Anthropic e OpenAI Responses mantêm seus respectivos momentos de conclusão por chamada. O protocolo Chat Completions do OpenAI-compatible não tem um done padronizado por chamada, então o adapter atual encerra os argumentos de ferramenta que ainda estavam acumulando no flush do response stream.
O ZCode consome de forma unificada os eventos do AI SDK e não desenha mais capabilities de provider por conta própria nem verifica `finish_reason` / `[DONE]`.

O Compact continua sendo delimitado pelo raw provider boundary já existente para definir os limites de retry de SSE/fallback, sem aplicar a classificação de prelude da requisição principal comum; mas também não sintetiza chamadas a partir de deltas e executa apenas com o `tool-call.input` final. O comportamento de stream recovery do Core, o ownership de provider-executed e o cancelamento de requisição permanecem inalterados.

## Critérios de aceite

- Não gerar `tool_call` na primeira vez em que o prefixo de argumentos fica parseável.
- Quando ocorre erro de rede recuperável após `start/delta` e antes da chamada final, o Adapter pode iniciar o próximo attempt.
- Ao já estar em streaming input mas sem `tool-input-end`, não publicar `tool_call`.
- Quando `tool-input-end` vem imediatamente seguido da chamada final, publicar apenas uma vez na ordem `start/delta/end/tool_call`.
- Mesmo que o delta já seja um JSON parseável e contenha apenas parte dos campos, o input publicado deve vir integralmente do `tool-call.input` final, preservando o provider initial input que existe apenas na chamada final.
- Input malformed/null da chamada final não interrompe a requisição do modelo; o comportamento específico de recuperação é coberto pela especificação de validação.
- Chamada final atômica usa o mesmo caminho de normalização.
- Requisições comuns e Compact não sintetizam mais chamadas antecipadamente por "primeiro JSON parseável"; os demais comportamentos do Compact permanecem como estão.