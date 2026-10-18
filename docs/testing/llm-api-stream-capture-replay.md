# LLM API Stream Capture Replay

## Contexto

Problemas de performance de streaming não podem ser reproduzidos apenas com o texto Markdown final. Na cadeia real, a quantidade de chunks SSE do provider, o intervalo entre chunks, a mesclagem de agent/protocol, o IPC do renderer, o batch de chunks da UI, a renderização de Markdown e as animações afetam a CPU.
Salvar apenas o response body completo e reproduzi-lo de uma só vez muda o ritmo de comunicação e não reproduz de forma estável a pressão no renderer.

## Objetivos

- O e2e capture continua acessando o provider real por meio de um proxy MITM local.
- O capture artifact, além de manter as prévias de requisição/resposta, registra a linha do tempo dos chunks de resposta.
- O replay server suporta escrever a resposta de forma streaming conforme a linha do tempo dos chunks, preservando o atraso do primeiro chunk e os intervalos dos chunks seguintes.
- O comportamento de replay fixo e padrão do e2e do provider DeepSeek permanece inalterado; a amostragem de performance pode sobrescrever o prompt e o replay fixture por variáveis de ambiente.

## Fora de escopo

- Não gravar nem reproduzir IPC do renderer, ZCode Protocol events ou mutações da store da UI.
- Não gravar API keys reais nem headers de autenticação no artifact.
- Não garantir parsing semântico genérico entre providers; nesta etapa a fidelidade se limita ao ritmo das respostas HTTP/SSE na camada de rede do e2e.

## Extensão do Artifact

`E2ENetworkCaptureRecord` ganha novos campos opcionais:

- `responseChunkTimeline`: lista de chunks do response body.
- `responseChunkTimelineTruncated`: definido como `true` quando a linha do tempo de chunks atinge o limite local de tamanho.

Cada chunk contém:

- `offsetMs`: deslocamento em milissegundos desde a entrada da requisição no capture proxy até a chegada do chunk ao proxy.
- `byteLength`: tamanho em bytes do chunk original.
- `base64`: bytes do chunk gravados no artifact.

`responseTextPreview` continua sendo usado para inspeção manual e para o parsing de usage existente; o replay de performance prioriza o uso de
`responseChunkTimeline`.

## Semântica de replay

Quando o `response.chunks` do replay fixture existe:

- O replay server não escreve `content-length`, deixando o Node enviar a resposta em streaming como chunked response.
- O primeiro chunk é escrito após esperar o seu `offsetMs`.
- Os chunks seguintes são escritos após esperar a diferença entre `offsetMs` adjacentes.
- `response.body` continua sendo mantido como o texto completo da resposta, usado em relatórios e em asserções antigas.

Fixtures antigos sem `response.chunks` continuam retornando `response.body` de uma só vez.

## Uso

Coletar uma resposta real do GLM highspeed:

```bash
E2E_PROVIDER_HTTP_MODE=capture \
E2E_PROVIDER_PRESET=glmhighspeed \
GLM_HIGHSPEED_E2E_API_KEY=... \
E2E_PROVIDER_PROMPT='输出一篇很长的 Markdown，末尾包含 PERF_TRACE_DONE' \
E2E_PROVIDER_EXPECT_REPLY_TEXT=PERF_TRACE_DONE \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

O preset `glmhighspeed` usa o endpoint compatível com Anthropic
`https://open.bigmodel.cn/api/anthropic` e o modelo `glm-5.1-highspeed`. No modo capture, quando nenhum preset de provider é especificado explicitamente, o padrão continua sendo o DeepSeek v4 flash; a troca para o GLM highspeed só ocorre ao definir explicitamente
`E2E_PROVIDER_PRESET=glmhighspeed` / `LLM_E2E_PROVIDER_PRESET=glmhighspeed`.
O preset GLM highspeed não força por padrão um nível de raciocínio; para sobrescrever, defina explicitamente
`E2E_PROVIDER_THOUGHT_LEVEL`.

O capture artifact é gravado por padrão em:

```text
packages/desktop/.e2e-home/.zcode/e2e-network-capture/upstream-provider.json
```

Para depois reproduzir um fixture customizado ou derivado de um capture:

```bash
E2E_PROVIDER_PRESET=glmhighspeed \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=/absolute/path/to/replay-fixture-or-capture.json \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

## Riscos e limites

- O timing dos chunks de resposta é uma observação da camada de rede e não representa o tempo de geração de tokens dentro do provider.
- O capture artifact pode conter um corpo de resposta grande; ele fica apenas no diretório local de artifacts do e2e e não é commitado.
- Se a resposta exceder o limite da linha do tempo de chunks, o artifact é marcado como truncated; esse tipo de registro não pode ser usado para um replay streaming completo.