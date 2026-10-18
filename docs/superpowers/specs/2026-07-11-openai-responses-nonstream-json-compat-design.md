# Compatibilidade mínima de JSON não-streaming do OpenAI Responses

> Atualização de 2026-07-15: o JSON normalizer e a fronteira de provider deste documento continuam válidos; o contrato "compact fixo não-streaming" foi
> substituído pelo
> [Compact Stream-first → Non-stream Fallback design](./2026-07-15-compact-stream-first-nonstream-fallback-design.md).
> O adaptador agora atende à leg de HTTP fallback após a falha do compact streaming. O contexto original do design é preservado abaixo,
> onde as descrições de non-stream fixo representam apenas a linha de base de implementação de 2026-07-11.

## Contexto e causa raiz

Alguns serviços de terceiros do OpenAI Responses retornam, em requisições de streaming, eventos SSE aceitos pelo AI SDK, mas omitem em respostas JSON não-streaming campos exigidos pela estrutura oficial do Responses:

- omitem `id` quando `output[].type === "message"`;
- omitem `annotations` quando `output[].content[].type === "output_text"`.

A sessão principal do ZCode usa requisições de streaming por padrão, enquanto o compact chama `modelAdapter.generateText()` de forma fixa. Portanto o mesmo provider/model pode concluir a sessão principal normalmente e, no compact, ter a resposta HTTP 200 rejeitada pelo AI SDK com `Invalid JSON response` ao entrar em `OpenAIResponsesLanguageModel.doGenerate()`.

O `@ai-sdk/openai` realmente em uso no workspace atual ainda exige esses dois campos no schema de Responses não-streaming.
Não é um problema de parâmetros de requisição, autenticação, rede ou prompt de compact, mas sim um corpo de resposta não-streaming de Responses de terceiros incompleto.

## Objetivo

Sem alterar o contrato não-streaming do compact, sem modificar o AI SDK e sem afetar outros protocolos, permitir que o JSON de Responses com campos faltantes já confirmado passe pela validação do AI SDK e retorne o texto.

## Limites da compatibilidade

Adicionar um adaptador independente de fetch de JSON do OpenAI Responses e combiná-lo somente no branch de factory `providerKind === "openai"` do adapter registry:

```ts
const providerFetch = createProviderBusinessErrorFetch(...);

createOpenAI({
  ...,
  fetch: createOpenAIResponsesJsonCompatFetch(providerFetch),
}).responses;
```

`createProviderBusinessErrorFetch()` continua responsável apenas pelo proxy de rede compartilhado e pela identificação de erros de negócio comuns a todos os providers.
A compatibilidade do corpo de resposta do Responses não deve entrar nesse fetch compartilhado nem nos factories de `anthropic`, `gateway` ou `openai-compatible`.

O contrato de tipo de provider do ZCode já mapeia `providerKind === "openai"` unicamente para `apiFormat === "openai-responses"`. O registry deve retornar explicitamente a factory `provider.responses` do AI SDK, para que a própria composição do factory seja o critério de protocolo; o adaptador não deve tentar adivinhar o protocolo novamente por URL de requisição, method, nome de modelo ou baseURL.

O adaptador processa apenas respostas retornadas por essa factory de Responses que satisfazem simultaneamente:

1. status HTTP 2xx;
2. a resposta não é `text/event-stream`;
3. o body é um JSON object parseável, e `output` é um array.

Se qualquer condição não for satisfeita, a `Response` original é retornada.

## Regras mínimas de normalização

Normalizar somente os dois campos ausentes confirmados por logs históricos e pela reprodução mínima atual no AI SDK:

1. para output item com `type === "message"` e `id === undefined`:
   - o ID só é preenchido quando o `response.id` de nível superior é uma string não vazia;
   - usa-se `randomUUID()` do Node `node:crypto` para preencher como `msg_<UUIDv4>`, evitando reaproveitar o namespace previsível de IDs já devolvidos pelo provider; sem nova dependência de UUID nem collision resolver.
2. para content item da message acima com `type === "output_text"` e `annotations === undefined`, preencher com `annotations: []`.

As entradas a seguir estão fora do escopo desta normalização e continuam delegadas à validação do AI SDK:

- problemas de schema além da ausência desses dois campos;
- output item que não seja message;
- content item que não seja output_text;
- message ID ausente quando o `response.id` de nível superior é inválido;
- JSON inválido, respostas de erro e SSE.

A `Response` só é reconstruída quando a normalização realmente ocorre. Ao reconstruir, preservam-se status, statusText e os demais headers, removendo o `content-length` e o `content-encoding` já invalidados. Uma resposta Responses legítima deve retornar a instância original de `Response`.

## Fora de escopo explicitamente

- Não mudar o compact para `streamText()`; seu contrato de requisição não-streaming é preservado.
- Não recorrer a streaming após uma falha não-streaming, evitando requisições duplicadas, cobrança duplicada e possíveis efeitos colaterais.
- Não modificar, forkar nem afrouxar o schema do AI SDK.
- Não preencher IDs em todos os output items, nem buscar compatibilidade com outros campos ausentes não observados.
- Não montar uma lista com base no nome do modelo, do provider ou do baseURL.
- Não inferir o protocolo Responses pelo pathname da URL ou pelo HTTP method.
- Não modificar Chat Completions, Anthropic, Gateway, reasoning policy ou o payload das requisições.
- Não adicionar campos de model-io, prompt-trajectory, telemetria ou eventos de protocolo.

## Contrato de erros e diagnóstico

Quando o adaptador não consegue fazer o parse ou não satisfaz as regras mínimas, ele deve retornar a resposta original, para que o AI SDK preserve o `AI_APICallError: Invalid JSON response` existente e os validation issues específicos. Não se pode engolir o erro, reescrevê-lo como texto vazio nem disparar retries extras.

## Escopo de verificação

### Testes unitários e de integração

- pure normalizer: com message `id` e output_text `annotations` ausentes, preenche somente esses dois campos, e o message ID segue o formato `msg_<UUIDv4>`;
- JSON Responses legítimo retorna a Response original, com body inalterado;
- output item desconhecido não é modificado;
- SSE e respostas não-2xx permanecem como estão;
- usando fake API key e um fake HTTP server local, passar de verdade por `AiSdkModelRegistry -> AiSdkModelAdapter.generateText -> @ai-sdk/openai doGenerate`, provando que o JSON histórico com campos ausentes finalmente retorna o texto do summary do compact;
- teste de integração do registry prova que `openai` escolhe explicitamente a factory de Responses e, usando como controle negativo o OpenAI-compatible Chat Completions mais próximo, prova que o response body dele não entra nesse adaptador; os branches mutuamente exclusivos de Anthropic e Gateway permanecem inalterados.

### E2E

Adicionar um cenário de fake Responses server local ao case:

1. a sessão principal com `stream: true` retorna SSE válido e tem sucesso;
2. `/compact` emite uma requisição não-streaming para `/responses`;
3. o JSON não-streaming do fake server omite deliberadamente message `id` e output_text `annotations`;
4. o compact publica o completed boundary e preserva o summary marker;
5. a captura de pacotes prova que a resposta original do provider realmente estava sem os campos e que nenhuma requisição ao endpoint de Chat Completions foi feita.

Os testes usam apenas fake API key e server local, sem depender de um provider real.

Esse cenário é evidência complementar de compatibilidade de provider para o estado de produto F08 de compact success manual existente; não adiciona um conversation product case independente, atalhos de automação ou regras de coverage audit, e não altera as estatísticas de product cases.

Ao estender o harness do compact, manter o contrato de artifacts existente: o `model` de nível superior do dry-run e o `model` de nível superior do resultado da suite continuam existindo. Ao executar isoladamente um cenário com model local do case, o `model` de nível superior pode usar o valor exato desse cenário; com múltiplos cases, mantém-se o model default original, e a exceção é expressa pelo campo `model` do case específico.
O parse do case registry deve ficar dentro do `try/finally` unificado da suite, garantindo que uma exceção no registry ainda entre no caminho de gravação de falha e na política existente de retenção do diretório de diagnóstico.

## Critérios de aceitação

- a reprodução mínima histórica do campo ausente no AI SDK atual passa de falha para sucesso;
- o compact continua enviando requisições Responses não-streaming;
- o comportamento SSE da sessão principal não muda;
- os bytes de requisição e resposta dos demais provider kinds e protocolos não mudam;
- não são produzidas requisições ou retries extras;
- os testes relevantes, `pnpm typecheck` e `pnpm lint` passam.