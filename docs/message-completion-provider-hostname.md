# provider_name em message_completion

## Contexto

Anteriormente, `message_completion` reportava apenas `model_provider`. Em cenários de provider customizado, esse campo costuma ser um provider id interno ou um uuid, o que não permite analisar diretamente pelo domínio real da requisição.

## Solução

- Manter `model_provider` para compatibilidade com a definição de métricas já existente no data warehouse.
- Adicionar `provider_name`, que hoje corresponde ao hostname do endpoint do provider; apenas o hostname é reportado, sem protocol, path, query, header ou API key.
- O snapshot inicial de envio extrai o hostname do `baseURL` do endpoint no provider registry atual.
- Em tempo de execução, ao receber `model_request_started`, se o evento trouxer `baseURL`, o snapshot de envio é sobrescrito com o hostname do `baseURL` da requisição real.
- `send_btn` e `message_completion` compartilham o mesmo extraDetail de prompt telemetry; o primeiro envio, a continuação de conversa e o envio pela fila carregam todos o mesmo snapshot inicial de `provider_name` no evento de envio.
- Quando a URL não pode ser resolvida, o campo fica vazio, evitando reportar um uuid interno ou o endpoint original como se fosse o hostname.

## Superfície de impacto

Essa alteração afeta apenas o extraDetail da telemetria da UI; o protocolo app-agent e a semântica do fluxo de tarefas não são modificados. O continuous do desktop e o web-remote replayable do celular reutilizam o mesmo estado de prompt telemetry, e `provider_name` é reportado como uma dimensão comum junto com o `message_completion` existente.