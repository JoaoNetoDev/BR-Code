# Contrato de repasse de erros de permissão do CUA

## Conclusão

O CUA não retorna mais nem traduz `CUA_PERMISSION_REQUIRED`. Falhas do Helper/Broker são
retornadas de forma unificada como erro comum de ferramenta MCP, e o modelo decide, com base na
mensagem de erro original e precisa, se chama o `request_access` somente leitura, pede ao usuário
a autorização ou adota outras ações de recuperação, como reativar o aplicativo ou observar
novamente.

## Motivo

`permission_denied` não equivale à ausência de TCC no macOS. Janela em primeiro plano que não
corresponde, política `prevent_activation` de um Host confiável, UIPI do Windows, XTest do Linux,
alvo inválido e falhas parciais de native capability podem usar esse código de erro. O producer não
consegue determinar de forma confiável o tipo de permissão apenas com um código de erro genérico; e
o consumer, ao exibir automaticamente uma caixa de permissão com base no texto do erro, transformaria
uma inferência pouco confiável em comportamento de produto.

## Contrato de runtime

```text
Erro do Helper/Broker
        |
        v
erro comum de ferramenta MCP + mensagem original + evidência de entrega
        |
        v
o modelo escolhe request_access / observar novamente / ativar / parar

request_access oficial bem-sucedido (somente macOS)
        |
        v
resultado textual somente leitura + metadados de permissão tipados e namespaced
        |
        v
o Host ZCode confiável pode perguntar ao usuário se deve abrir o onboarding
```

- Não existe ramo de tradução de permissões macOS no nível do producer.
- Não existe varredura do texto do erro no nível do consumer nem janela automática de permissão
  disparada por erro comum.
- `request_access` permanece somente leitura: apenas relata o sujeito de autorização atual, o estado da
  permissão e as capacidades, sem abrir ativamente caixas de sistema.
- O resultado de sucesso no macOS carrega, no MCP result
  `_meta["zcode.cua/request-access-status-v1"]`, um snapshot de permissões estrito e versionado,
  destinado ao Host confiável que já validou a autoridade official-CUA; o texto JSON visível ao
  modelo permanece inalterado. Em plataformas não macOS, com campos ausentes ou com enumerações
  inválidas, esse metadata não é emitido.
- `accessibility=denied|stale` e `screenRecording=denied` são ausência de permissão determinística;
  `unknown` não é suficiente para disparar o fluxo de permissões.
- O Host deve confirmar simultaneamente a autoridade official-CUA, o nome exato da ferramenta
  `request_access` e a entrega live desktop, e só então a UI relê o estado atualizado e pergunta ao
  usuário. O producer em si não abre as configurações do sistema.
- A página de configurações mantém o fluxo de permissões iniciado ativamente pelo usuário.
- `action_sent`, `request_delivery_state` e `retryable` continuam sendo fatos de segurança; ações
  não idempotentes com `possibly_sent` não devem ser repetidas automaticamente.
- `broker_unavailable` continua usando o contrato `CUA_NOT_READY` já existente, porque ele expressa
  a prontidão de transporte e o limite seguro de nova tentativa, e não uma classificação de
  permissão.
- macOS, Windows e Linux usam a mesma regra de repasse de erros, sem reescrever o significado do
  erro conforme `process.platform`.

## Regras de recuperação do modelo

- Quando o erro mencionar explicitamente Accessibility ou Screen Recording, é permitido chamar uma
  vez `request_access` para obter o estado. Se o resultado indicar ausência de permissão de forma
  explícita, informar ao usuário que a autorização é necessária e encerrar a rodada atual; não é
  permitido continuar o CUA, tentar novamente automaticamente nem prometer retomada automática após
  a autorização.
- Quando o erro for de foreground, focus policy, stale target ou capability, tratar conforme o caminho
  de recuperação indicado pelo erro original, sem inferir que se trata de problema de permissão do
  macOS.
- Em `possibly_sent`, observar novamente ou ler um estado de negócio independente antes de agir;
  é proibido repetir a ação na mesma forma.

## Verificação

- MCP stdio real: a mensagem original de `permission_denied` chega ao modelo e o resultado não
  contém `CUA_PERMISSION_REQUIRED`.
- `broker_unavailable`: continua retornando `CUA_NOT_READY`.
- `possibly_sent`: a evidência de entrega é preservada e o native dispatch não é repetido.
- consumer replay: a ToolCallRow de falha comum é exibida normalmente, live/cold restore são
  consistentes e não há janela automática de permissão.
- Metadata de `request_access`: no macOS, o estado legítimo sai conforme o schema e o texto
  permanece literalmente inalterado; em plataformas não macOS, com campos ausentes ou enumerações
  inválidas, não é emitido metadata confiável.
- O portão de modelo real usa uniformemente o modelo real especificado na configuração do eval
  provider; o sucesso final deve ser verificado pelo estado do aplicativo pertencente à fixture.
