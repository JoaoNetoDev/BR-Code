# Leitura do estado do workspace do bot e corrida com o reinício do Agent

## Problema

Ao processar uma troca de workspace ou ler a configuração do workspace, o bot lê o estado de modelo e modo através de `workspace/readState` do ZCode Protocol. Depois que a chamada já obteve o workspace client, se esse workspace reiniciar exatamente por causa de uma atualização de configuração, troca de modelo ou mudança no ciclo de vida do processo, o transporte stdio do client antigo é fechado antes do envio da requisição, e o usuário recebe como resposta final
`ZCode agent stdio transport is closed`.

## Semântica

- `workspace/readState` é uma requisição somente leitura; em caso de corrida com o fechamento do transporte, é possível obter novamente o workspace client atual e tentar uma vez mais.
- A nova tentativa deve obter novamente o client do Environment atual e aguardar o readiness do Provider Registry desse Environment antes de executar `workspace/readState`; não é permitido reenviar o Registry ou as credenciais a partir do Desktop.
- Só é repetida a tentativa em erros explicitamente indicando que o transporte está fechado; a regra não se estende a requisições não idempotentes, como criação de sessão ou envio de prompt.
- No máximo uma nova tentativa; se o host já tiver sido encerrado por completo ou o novo Agent continuar indisponível, o erro real da segunda requisição continua sendo lançado.