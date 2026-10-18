# ZCode Endpoint DeviceMid Header

## Contexto

Quando a camada do App acessa o endpoint do ZCode (por padrão `https://zcode.z.ai`, ou o endpoint derivado do `ZCODE_BASE_URL` / `ZCODE_PRODUCTION_BASE_URL` atual), é preciso carregar de forma unificada um header de identificação de dispositivo, para facilitar o alinhamento, no backend, das requisições de OAuth, client configs, billing, snapshot etc. com a dimensão de dispositivo já existente em telemetry/ARMS.

## Design

- A identificação do dispositivo reaproveita o `deviceMid` já existente no estado de telemetry, ou seja, o campo `deviceMid` de `{appConfigDir}/telemetry-state.json`.
- `buildZCodeSourceHeadersFromContext()` é a regra compartilhada de montagem de source headers entre App/Agent;
  a camada de serviço do app, em `buildZCodeSourceHeaders()`, continua responsável por ler o `deviceMid` existente e então chamar essa regra compartilhada.
- Só é lido um `deviceMid` que já existe e pode ser emitido como HTTP header; quando a leitura falha ou o campo está ausente, nenhum novo device ID é gerado dentro dessa função, evitando alterar o ciclo de vida do device ID.
- Na regra geral, `X-Device-Mid` é "só vai se tiver valor", mas `/api/v1/zcode-plan/billing/balance` o trata como obrigatório no servidor (ausência retorna `400 code 3001 parameter error`). Portanto qualquer ambiente de execução que inicie uma consulta de benefícios do Start Plan precisa garantir que o `deviceMid` já esteja gravado em disco antes da primeira requisição, sem depender de "header opcional ausente ainda dá certo".
- A geração do device ID é responsabilidade do dono do ciclo de vida de cada ambiente de execução: o main do Desktop garante de forma síncrona antes da criação da janela; o `zcode-server` remoto (stdio entry de SSH/WSL/Docker) chama `ensureTelemetryDeviceMid()` de forma assíncrona após o handshake e antes da criação dos services; a CLI independente garante por conta própria na primeira requisição de modelo. Os três leem e escrevem o campo `deviceMid` do mesmo `telemetry-state.json` e usam o `telemetry-state.lock` de mesmo nome como mutex.
- O `NodeApiClient` continua responsável apenas por injetar os headers retornados por `buildZCodeSourceHeaders()` ao atingir o endpoint ZCode atual, preservando o header de mesmo nome passado explicitamente pelo chamador.
- O GET de configuração de provider endpoint routing do ZCode CLI lê o mesmo estado de telemetry de forma assíncrona por meio de um bootstrap source-header provider independente, e então chama a regra compartilhada de montagem; essa leitura não entra no transporte do modelo nem na saída HTTP comum de tool.

## Escopo de cobertura

Essa unificação cobre as requisições ao endpoint ZCode feitas pelos app services via `NodeApiClient`, incluindo OAuth token, client configs, release latest, Start Plan billing, feedback etc., além do GET de configuração de provider endpoint routing iniciado pelo próprio ZCode CLI. Outras requisições que contornam diretamente o `NodeApiClient` ainda precisam ser tratadas separadamente em cada saída.

## Identidade de dispositivo do server remoto

No workspace remoto (SSH/WSL/Docker) existem apenas `zcode-server` e o processo do Agent, sem main do Desktop. A partir da 3.12.0 os benefícios de conta como o Start Plan são consultados pelo próprio host remoto, mas `billing/balance` trata o `X-Device-Mid` como obrigatório no servidor; se na máquina remota nenhum processo tiver gravado o `telemetry-state.json`, a requisição ficará sem o header e será rejeitada como `parameter error`, e o Start Plan será considerado não contratado no workspace remoto.

```text
desktop                                   host remoto
main ──ensureDesktopDeviceMidSync──┐     entry-stdio ──ensureTelemetryDeviceMid──┐
                                   ├─> ~/.zcode/v2/telemetry-state.json.deviceMid <─┤
host ──buildZCodeSourceHeaders 读──┘     services ──buildZCodeSourceHeaders 读──────┤
                                          zcode-cli ──ensureCliDeviceMid──────────┘
```

- O server remoto chama `ensureRemoteServerDeviceMid()` em `packages/server/src/entry-stdio.ts` após o handshake e antes da criação dos services; internamente ele reaproveita o `ensureTelemetryDeviceMid()` de `@zcode/services/node`, usando o mesmo arquivo, campo e lock do reporte de telemetry e do uso da CLI, de modo que server e Agent na mesma máquina obtêm o mesmo `deviceMid`.
- O host remoto tem sua própria identidade de dispositivo, sem pegar emprestado nem receber o `deviceMid` do desktop; quando o mesmo remoto é conectado por vários desktops, a identidade permanece estável.
- Se a garantia falhar (exceção de sistema de arquivos ou de lock), apenas registra-se um warn e a inicialização continua; nesse caso as requisições omitem `X-Device-Mid` exatamente como antes da correção, sem forjar um device ID.