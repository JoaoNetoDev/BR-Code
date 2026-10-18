# Rascunho de issue upstream: @modelcontextprotocol SDK — o classificador do probe trata um corpo de erro HTTP 200 malformado como falha fatal de rede, em vez de evidência legacy

> Status: rascunho (ainda não submetido ao modelcontextprotocol/typescript-sdk).
> Data: 2026-08-25.
> Pacote afetado: `@modelcontextprotocol/client` 2.0.0.
> Relacionado: `docs/mcp-dual-era-version-negotiation.md` (no lado do ZCode a semântica de negociação não muda; apenas a orientação de falha `protocol_negotiation_failed` e a chave de compatibilidade `protocolVersion: "legacy"`).

Abaixo está o rascunho do corpo da issue em inglês.

---

## Title: Version negotiation probe: HTTP 200 + malformed JSON-RPC error body hard-fails as network error, while the same body with a 4xx status is correctly classified as legacy evidence

### Description

**Package / version:** `@modelcontextprotocol/client` 2.0.0

**Summary.** Na negociação de versão dual-era (`auto`) sobre Streamable HTTP, um servidor que responde ao probe `server/discover` com **HTTP 200 e um corpo de erro JSON-RPC que falha em `JSONRPCMessageSchema`** faz o probe falhar de forma fatal com `SdkError(SdkErrorCode.EraNegotiationFailed)` pelo ramo de erro de rede. O **mesmo corpo entregue com um status 4xx** passa por `classifyHttpError` → `parseJsonRpcErrorBody` e é tratado corretamente como evidência legacy (fallback para `initialize` quando disponível). A classificação é assimétrica em relação à linha de status HTTP, embora o sinal significativo esteja no corpo.

**Real-world repro.** Pelo menos um servidor legacy widely deployed e fora de conformidade (Feishu Project MCP) responde a métodos desconhecidos — incluindo `server/discover` — com:

```http
POST /mcp HTTP/1.1
...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"invalid request"}}
```

`id: null` não passa em `JSONRPCMessageSchema` (uma resposta de erro JSON-RPC deve carregar um request id do tipo string/number). A falha de parsing do schema no nível de transporte é capturada por `normalizeReply`, que não tem um bucket melhor do que o ramo de erro de rede, então o resultado do probe vira uma falha fatal: `SdkError(EraNegotiationFailed, "Version negotiation probe failed: ...")`.

Este servidor claramente não é um servidor moderno: um envelope malformado jamais pode ser um *erro moderno reconhecido* (esses são bem formados segundo a spec). É um servidor legacy com uma resposta de erro fora de conformidade — exatamente a população para a qual o fallback dual-era existe. Com esse comportamento, o modo `auto` não consegue se conectar a ele de forma alguma; os usuários precisam saber fixar `protocolVersion: "legacy"` manualmente.

**Why the asymmetry is wrong.**

- 4xx + o mesmo corpo não parseável → `classifyHttpError` → `parseJsonRpcErrorBody` → a falha de parsing não é evidência moderna → fallback legacy (quando disponível).
- 200 + o mesmo corpo não parseável → erro de envio/parsing do transporte → ramo de erro de rede do `normalizeReply` → `EraNegotiationFailed` fatal, sem fallback.

A única diferença é o status code, e 200-com-lixo é evidência *mais forte* de "não é um servidor moderno" do que 404-com-lixo: um servidor moderno deve retornar uma resposta válida segundo o schema ou um erro moderno reconhecido para `server/discover`. Um corpo que nem sequer pode ser parseado como mensagem JSON-RPC não pode ser um erro moderno reconhecido.

**Suggested fix.** Dentro da janela do probe, classificar as falhas de parsing de schema do send/reply de `server/discover` separadamente das falhas reais de transporte: introduzir um resultado de probe distinto (por exemplo, `malformed-response`) e tratá-lo como evidência legacy quando houver fallback legacy disponível — espelhando o caminho de degradação já existente `classifyHttpError` → `parseJsonRpcErrorBody` para 4xx. Condições reais de rede (erros de conexão, timeouts, falhas de TLS, reset de conexão antes de qualquer byte) devem continuar fazendo o probe falhar como hoje; apenas "recebemos uma resposta HTTP cujo corpo não é uma mensagem JSON-RPC válida" muda de bucket.

Estamos dispositions a transformar isto em um PR com testes, se os mantenedores concordarem com a mudança de classificação.

### Steps to reproduce

1. Subir qualquer endpoint HTTP que responda a todo POST com `200` e o corpo acima.
2. Conectar com `Client` em modo de negociação `auto` (`StreamableHTTPClientTransport`).
3. Observar `client.connect()` rejeitar com `SdkError(SdkErrorCode.EraNegotiationFailed)` ("Version negotiation probe failed: ...") — nenhum fallback legacy é tentado.
4. Reexecutar com o mesmo handler retornando `404` (mesmo corpo). O probe agora classifica a resposta como evidência legacy e o cliente faz fallback para `initialize` (quando uma versão anterior a 2026-07-28 é suportada).