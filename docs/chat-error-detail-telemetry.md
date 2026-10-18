# Telemetria de detalhe de erro do chat

Todo103 G13-C; origens `e690365f2e`, `a5f4687368`. Mantém o resumo do erro, o detail destinado à exibição, a classificação do erro e o comportamento de retry, acrescentando apenas o diagnóstico do erro subjacente.

```text
Projeção da cadeia de erros limitada do Core
   -> TurnErrorPayload
   -> ProductProjection / V4 lastError schema
   -> SessionPane / UI error normalization
   -> chat_error_banner
```

- `underlyingErrorMessage`: a message do frame não-wrapper mais profundo.
- `underlyingErrorDetail`: o detail / errorDetails / details do mesmo frame.
- Quando não há frame não-wrapper, usa-se o último frame; quando não há o conteúdo correspondente, o campo fica ausente. Reaproveita-se a proteção contra ciclos e o limite de tamanho da cadeia de erros original, sem percorrer arbitrariamente context / headers / responseBody.
- A UI apenas transporta campos estruturados e não reinferem a causa subjacente. A message subjacente pode, após inspeção, ser reportada como `error_detail_message`; mantêm-se os nomes de evento, a deduplicação e as dimensões de classificação já existentes.
- Diferença explícita em relação ao upstream: `docs/monitoring/conversation-telemetry-v4.md` proíbe enviar o detail completo, URLs, cabeçalhos de autenticação e respostas brutas. Por isso não se restaura o reporte direto do `error_detail_text` do upstream; truncar em 500 caracteres não equivale a sanitização. `underlyingErrorDetail` é mantido apenas no protocolo interno / na UI e não pode entrar diretamente na telemetria.
- O novo envio de message respeita o limite de tamanho e usa um aviso fixo de sanitização quando são identificados credenciais / cabeçalhos de autenticação, URLs ou respostas brutas em HTML; isso não afeta o detail usado para exibição local. Esta verificação textual de texto não é um detector completo de conteúdo sensível arbitrário, e o produtor do erro continua não devendo colocar prompt/conteúdo de tool completos na message.
- Os schemas Live e snapshot mantêm o campo; não se pode apenas ampliar o tipo e deixar o campo ser descartado pelas conversões intermediárias, nem alterar o roteamento desktop continuous / web replayable.

Aceitação: múltiplas camadas de cause do Core e o mesmo frame subjacente; ausência / wrapper / ciclos; ida e volta entre projeção e schema de runtime; caminho de encapsulamento da normalização da UI; conversão do Banner e payload final; textos sensíveis já identificados e mensagens subjacentes muito longas com restrição, e o detail subjacente nunca sendo reportado.