# Temporização de inicialização do RPC Channel e o problema "Unknown channel"

## Sintoma

No modo Remote, ao abrir a janela, ocorre o erro:

```
[DirectoryBrowser] 获取系统信息失败: Unknown channel: Channel name 'system'
timed out after 1000ms
```

## Transição de estado do ChannelClient

```
Uninitialized ──[收到 Initialize(200)]──→ Idle ──[发送请求]──→ Idle（保持）
```

- **Uninitialized**: ainda não recebeu o Initialize do servidor; todas as requisições são enfileutadas
  automaticamente (`whenInitialized()`) e não expiram
- **Idle**: já recebeu o Initialize; as requisições são enviadas imediatamente

## Fluxo completo de comunicação

### Modo Local (normal)

```
Main Process                    Host Utility Process              Renderer
───────────                     ─────────────────                 ────────
fork host process ──────────→
                                parentPort.on("message")
                                  new ChannelServer()
                                  ├── 立即发 Initialize ──────────→ 收到 Initialize
                                  ├── state → Idle                   ChannelClient: Uninitialized → Idle
                                  │
                                  createLocalServices()  (同步)
                                  exposeOnChannelServer()  (同步)
                                  注册 file/system/terminal/...
                                                                     DirectoryBrowser mounts
                                                                     useEffect → systemService.info()
                                                                     RPC 请求发出 ← ─ ─ ─ ─ ─ ─ ─ ─ ─
                                                                  ← ─ system channel 已注册，直接处理
                                                                     返回结果 ──────────────────────→
```

**Sem problema**: depois que o `Initialize` é enviado, `registerChannel` é executado sincronamente em
seguida. Quando o Renderer recebe o `Initialize` e envia a requisição, o channel já está registrado.

### Modo Remote (com bug)

```
Main Process                    Host Utility Process              Renderer
───────────                     ─────────────────                 ────────
fork host process ──────────→
                                parentPort.on("message")
                                  new ChannelServer()
                                  ├── 立即发 Initialize ──────────→ 收到 Initialize
                                  │                                 ChannelClient: Uninitialized → Idle
                                  │
                                  await setupRemoteConnection()     DirectoryBrowser mounts
                                    (SSH 建连，可能 2~5 秒)        useEffect → systemService.info()
                                  │                                 RPC 请求发出 ─ ─ ─ ─ ─ ─ ─ ─ ─ →
                                  │                                 system channel 不存在！
                                  │                                 进入 pendingRequests 队列
                                  │                                 设 1000ms 超时定时器
                                  │
                                  │                                 ─── 1000ms 后 ───
                                  │                                 超时！报错:
                                  │                                 "Unknown channel: 'system'"
                                  │
                                  ... SSH 还在连接中 ...
                                  │
                                  services.exposeOnChannelServer()
                                  registerChannel("system", ...)    ← 太晚了，请求已超时
```

**Causa raiz**: o `Initialize` é enviado já na construção do `ChannelServer`, e o renderer entende que o
servidor está pronto e envia a requisição imediatamente. Mas o SSH ainda não terminou de conectar, o channel
`system` ainda não foi registrado e o timeout de 1000ms dispara.

### Modo Remote após a correção

```
Main Process                    Host Utility Process              Renderer
───────────                     ─────────────────                 ────────
fork host process ──────────→
                                parentPort.on("message")
                                  new ChannelServer(deferInit=true)
                                  ├── 不发 Initialize
                                  │                                 ChannelClient: 保持 Uninitialized
                                  │
                                  await setupRemoteConnection()
                                    (SSH 建连，可能 2~5 秒)        DirectoryBrowser mounts
                                  │                                 useEffect → systemService.info()
                                  │                                 ChannelClient 还在 Uninitialized
                                  │                                 请求自动排队等 Initialize（不会超时）
                                  │
                                  services.exposeOnChannelServer()
                                  registerChannel("system", ...)
                                  server.ready() ─── 发 Initialize → 收到 Initialize
                                                                     ChannelClient: Uninitialized → Idle
                                                                     排队的请求立即发出 ─ ─ ─ ─ ─ → system channel 已注册，直接处理
                                                                  ← ─ 返回结果 ──────────────────→
```

## Solução

Adicionar a opção `deferInit` ao `ChannelServer`:

- **Modo Local**: envia o `Initialize` imediatamente na construção (comportamento inalterado)
- **Modo Remote**: não envia o `Initialize` na construção e chama `server.ready()` manualmente após a
  conclusão de todos os `registerChannel`

Arquivos envolvidos:
- `packages/rpc/src/channels.ts` — adicionar o parâmetro `deferInit` ao construtor de `ChannelServer` e o
  novo método `ready()`
- `packages/rpc/src/logging-middleware.ts` — `LoggingChannelServer` repassa `ready()`
- `packages/desktop/src/host/index.ts` — passar `deferInit=true` no modo remote e chamar `server.ready()`
  após o registro dos serviços