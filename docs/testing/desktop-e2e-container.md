# Desktop E2E Container Demo

Este demo roda o E2E WebdriverIO Electron do lado desktop em um container Linux. Por padrão, os cases só validam a cadeia básica headless do container: o Electron consegue iniciar a janela principal em um display virtual e criar o workspace padrão.

## Execução

```bash
pnpm run test:e2e:container
```

Por padrão, roda o conjunto leve de smoke do container:

- `packages/desktop/test/e2e/container-boot.test.ts`
- `packages/desktop/test/e2e/smoke.test.ts`
- `packages/desktop/test/e2e/e2ecase-regression.test.ts`
- `packages/desktop/test/e2e/upstream-provider.test.ts`
- `packages/desktop/test/e2e/task-list-archive-confirmation.test.ts`

O case do provider DeepSeek usa por padrão fixture replay e não acessa o upstream real; a key real só é exigida quando `E2E_PROVIDER_HTTP_MODE=capture` é definido explicitamente.
Dessa forma a cadeia do container deixa de ser apenas um demo de boot e passa a cobrir o conjunto E2E central do desktop atual.
Ao terminar, a execução gera o relatório de teste e os arquivos de amostragem de desempenho em `packages/desktop/.e2e-artifacts/<run-id>/`:

- `summary.md`: resumo legível por humanos, com os resultados dos cases, o resumo da amostragem de processos do Electron e o resumo de recursos do container
- `summary.json`: resumo legível por máquinas
- `test-results.ndjson`: resultado de cada case
- `perf/process-samples-*.ndjson`: amostragem de CPU e memória dos processos Electron main / renderer / GPU / utility
- `perf/container-samples.ndjson`: amostragem de CPU, memória, IO de rede e IO de bloco do Docker

Para ver o relatório HTML, inicie primeiro o Vite viewer:

```bash
pnpm dev:e2e-report
```

Depois abra o `files.viewerUrl` de `summary.md` ou `summary.json`.

O intervalo padrão de amostragem é de 3 segundos; o intervalo de amostragem do container pode ser ajustado com `PERF_SAMPLE_INTERVAL_SECONDS=5`. O intervalo de amostragem dos processos Electron é controlado por `ZCODE_E2E_PERF_SAMPLE_INTERVAL_MS`; se você quiser que as curvas do container e do Electron sejam amostradas no mesmo ritmo, rode assim:

```bash
ZCODE_E2E_PERF_SAMPLE_INTERVAL_MS=1000 \
PERF_SAMPLE_INTERVAL_SECONDS=1 \
pnpm run test:e2e:container
```

As métricas do Electron só podem ser coletadas depois que a sessão WDIO Electron estiver pronta, então um demo de boot curto pode ter apenas os pontos de início/fim; ao rodar cases de regressão mais longos, forma-se uma tendência contínua de CPU / memória.

## Cobrindo um spec

```bash
E2E_SPEC=./test/e2e/smoke.test.ts pnpm run test:e2e:container
```

## Conversation session suite

A conversation session usa um preset Docker verified independente. Os 38 cases formais V4 atuais ainda não obtiveram evidência Docker `replay-isolated` nesta rodada, então o conjunto verified está vazio; o comando abaixo indica explicitamente, com exit 2 e antes de acessar o Docker daemon, que é preciso fazer a admission de um único case primeiro:

```bash
pnpm run test:e2e:container:conversation
```

Também é possível especificar o preset diretamente:

```bash
E2E_SPEC_PRESET=conversation-session-verified pnpm run test:e2e:container
```

O preset verified só permite referenciar specs em `packages/desktop/test/e2e/conversation-session/` que já passaram pela admission do Docker com o código e os fixtures atuais; não referencia `manual-review/pending` nem herda os resultados históricos da legacy suite. As regras de admissão estão em
[conversation-session-docker-automation-plan.md](./conversation-session-docker-automation-plan.md).
Para um novo spec oficial, prove primeiro com replay Docker de spec único:

```bash
E2E_SPEC=./test/e2e/conversation-session/<case>.test.ts \
  pnpm run test:e2e:container
```

Depois de passar, registre com a ferramenta de admissão:

```bash
pnpm --filter @zcode/desktop e2e:docker:admit -- \
  --spec ./test/e2e/conversation-session/<case>.test.ts \
  --verified \
  --artifact packages/desktop/.e2e-artifacts/<run-id> \
  --apply
```

`smoke.test.ts` vai além e verifica se o renderer entra na interface principal interativa do workspace; se ele falhar, continue investigando como um problema comum de E2E do desktop, sem gravar o workaround no caminho padrão de negócio.

A primeira execução baixa o Chromedriver correspondente ao Electron e o armazena em cache em um volume Docker. A plataforma padrão é `linux/amd64` e o nome padrão do cache é `zcode-desktop-e2e-driver-cache-linux-amd64`; execuções seguintes reutilizam o cache. Para ajustar:

```bash
DOCKER_PLATFORM=linux/amd64 \
DRIVER_CACHE_VOLUME=my-zcode-e2e-driver-cache \
DRIVER_PREFETCH_TIMEOUT=600 \
pnpm run test:e2e:container
```

O script padrão executa um `docker build` a cada rodada, de modo que cases E2E novos ou modificados sejam copiados para a imagem; o Docker reutiliza o cache de camadas existente. Quando o conteúdo da imagem não mudou e você só quer rodar de novo o mesmo lote de cases, é possível pular o build:

```bash
SKIP_IMAGE_BUILD=1 \
pnpm run test:e2e:container
```

Se você adicionou cases, mudou um helper de teste, o código-fonte de negócio ou a configuração de dependências, não pule o build; caso contrário, o conteúdo executado no container ainda será o da imagem antiga.

Para fixar o diretório de relatório:

```bash
ZCODE_E2E_RUN_ID=my-regression-run \
E2E_ARTIFACT_DIR=/tmp/zcode-e2e-report \
pnpm run test:e2e:container
```

A regressão fixa do provider DeepSeek usa por padrão fixture replay e não precisa de key real:

```bash
E2E_SPEC=./test/e2e/upstream-provider.test.ts \
pnpm run test:e2e:container
```

Para coletar dados reais de streaming GLM highspeed, mude explicitamente para o modo capture e passe a key:

```bash
E2E_PROVIDER_HTTP_MODE=capture \
E2E_PROVIDER_PRESET=glmhighspeed \
GLM_HIGHSPEED_E2E_API_KEY=... \
E2E_SPEC=./test/e2e/upstream-provider.test.ts \
pnpm run test:e2e:container
```

## Limites técnicos

- A imagem é baseada em `node:24.14.0-bookworm`, com as dependências de GTK, X11, fontes, DBus e `xvfb` pré-instaladas, necessárias ao Electron/Chromium no Linux.
- O script de inicialização usa `linux/amd64` por padrão, mantendo o Electron, o Chromedriver do Chrome-for-Testing e o linker dinâmico do sistema na mesma arquitetura; no Apple Silicon, o Docker Desktop fica responsável pela emulação do container inteiro.
- `packages/desktop/wdio.conf.ts` só habilita os parâmetros de container quando `ZCODE_E2E_CONTAINER=1`, incluindo a repetição de Xvfb do WDIO e os parâmetros de teste do Chromium.
- O modo container fixa o cache do Chromedriver do WDIO em `/workspace/.cache/wdio-browser-drivers`, e o script de inicialização reutiliza o cache por meio de um volume Docker, evitando depender de download de rede a cada rodada de teste.
- Este demo não valida a semântica de recuperação `web-remote-replayable` do `/remote` no celular; a cadeia de controle remoto deve continuar usando a regressão web/mobile independente.