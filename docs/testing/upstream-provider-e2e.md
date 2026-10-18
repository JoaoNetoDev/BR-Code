# E2E de Provedor Upstream

`packages/desktop/test/e2e/upstream-provider.test.ts` é o caso de regressão fixo do E2E de provedor upstream.
O endereço do provedor, a API key e o nome do modelo são todos controlados por variáveis de ambiente; o repositório não fixa nenhum provedor.

Ele grava o provedor E2E pela página de configurações do desktop, adiciona o modelo principal, volta ao workspace, seleciona esse modelo e envia a requisição. O modo padrão não acessa a rede real: ele sobe um fixture replay server local, que reproduz como conteúdo HTTP respostas reais já coletadas, garantindo que o caso fixo possa ser reproduzido de forma estável.

## Variáveis de ambiente

| Variável | Função | Quando não definida |
| --- | --- | --- |
| `E2E_PROVIDER_BASE_URL` | Endereço do provedor upstream | Erro no modo capture; desnecessária no replay |
| `E2E_PROVIDER_API_KEY` | API key do upstream | Erro no modo capture; no replay usa sempre `e2e-fixture-key` |
| `E2E_PROVIDER_MODEL` | Nome do modelo principal | Modelo gravado no fixture de replay |
| `E2E_PROVIDER_SECONDARY_MODEL` | Nome do segundo modelo (troca de modelo, provedor de reserva etc.) | Modelo gravado no fixture de replay |
| `E2E_PROVIDER_PRESET` | `env` (padrão, as quatro variáveis acima) / `glmhighspeed` / `bigmodel53` / `stagingmodel` | `env` |

- Os modelos gravados são definidos uma única vez em `packages/desktop/test/e2e/helpers/upstream-recorded-models.ts`. As regras de modelos embutidos do produto casam nível de pensamento e forma da requisição pelo ID do modelo, e o fixture é coletado conforme o modelo gravado; trocar o modelo padrão exige regravar o fixture.
- `E2E_PROVIDER_RUNTIME_BASE_URL` é o endereço efetivo que o WDIO escreve para cada processo de teste (no replay, aponta para o replay server local); não defina manualmente.
- Casos da página de configurações como “novo template de provedor” validam os templates embutidos do produto (incluindo DeepSeek) e não pertencem à configuração do provedor E2E.

## Replay fixo padrão

Basta executar o spec especificado diretamente:

```bash
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

Comportamento do modo replay padrão:

- O WDIO inicia o replay server local e aponta o endereço do provedor E2E para esse server.
- A API key é forçada para `e2e-fixture-key`, sem ler nem vazar a key real local.
- A resposta fixa vem de `packages/desktop/test/e2e/fixtures/upstream/provider-basic.json`.
- O WDIO pré-configura o modelo principal e o segundo modelo em um HOME isolado; os novos casos de isolamento de estado de sessão reutilizam este mesmo fixture, evitando tomar a página de configurações de provider (“adicionar modelo”) como pré-condição dos testes da área de sessão.
- O artefato de captura das requisições é gravado em `packages/desktop/.e2e-home/.zcode/e2e-network-capture/upstream-provider.json`, com o header de autenticação e os campos de token anonimizados.
- O caso valida simultaneamente a UI, o body da requisição, os campos de profundidade de pensamento e se o consumo de context equivale ao usage da resposta real presente no fixture.

Este caso é a regressão do “coletar uma vez, replay fixo”: o conteúdo do fixture vem de requisições reais ao upstream, mas na execução padrão não depende mais de saldo de conta, limitação do upstream nem disponibilidade em tempo real do modelo.

## Coletando dados reais

Para atualizar o fixture, mude explicitamente para o modo capture e informe endereço, key e modelo do upstream por variáveis de ambiente. Ao atualizar um fixture existente, o modelo precisa ser igual ao modelo gravado:

```bash
E2E_PROVIDER_HTTP_MODE=capture \
E2E_PROVIDER_BASE_URL=https://<provider-host>/anthropic \
E2E_PROVIDER_API_KEY=... \
E2E_PROVIDER_MODEL=<model-id> \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

O modo capture sobe, na própria máquina, um proxy de captura MITM transparente:

- O endpoint do provider continua sendo o endereço real; para amostras de performance, o preset `glmhighspeed` é o recomendado por padrão.
- O proxy apenas encaminha e captura, não sintetiza respostas de modelo.
- A CA é gerada somente em `packages/desktop/.e2e-home/.zcode/e2e-network-capture/ca` e não é escrita no repositório de certificados do sistema.
- O WDIO injeta `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` na árvore de processos e2e.
- O artefato de captura é gravado em `packages/desktop/.e2e-home/.zcode/e2e-network-capture/upstream-provider.json`.
- O artefato registra adicionalmente `responseChunkTimeline`, guardando o tempo relativo e os bytes de cada response chunk; isso é usado depois para reproduzir no ritmo real do SSE.

Após a coleta, organize a resposta anonimizada em um fixture de caso único. O caso fixo não depende diretamente da resposta online mais recente; regressões dinâmicas de rede precisam de nomenclatura própria e execução explícita.

## Coletando amostras de performance de streaming longo

O replay padrão continua usando o fixture gravado no repositório, garantindo que a regressão fixa de provider não acesse a rede real. Para gravar amostras de performance de Markdown longo em streaming, especifique explicitamente
`E2E_PROVIDER_PRESET=glmhighspeed`. Esse preset usa
`https://open.bigmodel.cn/api/anthropic` e o modelo `glm-5.1-highspeed`.
O preset GLM highspeed não seleciona nível de pensamento por padrão nem faz asserção sobre o campo thinking; a reprodução do fixture gravado e o preset `env` selecionam e verificam `high` por padrão.

```bash
E2E_PROVIDER_HTTP_MODE=capture \
E2E_PROVIDER_PRESET=glmhighspeed \
GLM_HIGHSPEED_E2E_API_KEY=... \
E2E_PROVIDER_PROMPT='输出一篇很长的 Markdown，包含多级标题、列表和代码块，末尾写 PERF_TRACE_DONE' \
E2E_PROVIDER_EXPECT_REPLY_TEXT=PERF_TRACE_DONE \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

Para depois reproduzir um fixture customizado ou o artefato de capture:

```bash
E2E_PROVIDER_PRESET=glmhighspeed \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=/absolute/path/to/upstream-provider.json \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/upstream-provider.test.ts
```

Quando o fixture de replay traz `response.chunks`, ou quando se usa diretamente um artefato de capture com `responseChunkTimeline`, o
replay server local escreve a resposta em streaming respeitando o offset original de cada chunk, em vez de devolver o body completo de uma só vez.

## Configuração local

Apenas o modo capture e o smoke test com provider real precisam de endereço e key verdadeiros; o repositório não fornece valores padrão.
O WDIO lê, em ordem, `packages/desktop/.env.e2e.local` e o `.env.e2e.local` da raiz; valores passados explicitamente no shell têm prioridade.
O `.env.e2e.local.example` da raiz lista apenas nomes de variáveis, deixando os valores vazios, e não é lido como fallback. O recomendado é escrever no arquivo local ignorado:

```bash
cp .env.e2e.local.example .env.e2e.local
```

Depois preencha endereço, key e modelo no `.env.e2e.local`. A gravação do GLM highspeed lê primeiro
`GLM_HIGHSPEED_E2E_API_KEY`, e também aceita `BIGMODEL_API_KEY` / `ZHIPUAI_API_KEY`.

`*.local` indica configuração privada da própria máquina, adequada para uma API key pessoal de longo prazo, e já está ignorado pelo `.gitignore`; não grave keys reais no `.env.e2e`, que é versionável.