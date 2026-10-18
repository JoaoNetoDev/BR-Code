# @zcode/rpc

Framework de abstração de comunicação IPC no estilo VS Code. Independente de transporte, com tipagem segura, suportando RPC bidirecional e conexões remotas.

## Visão geral da arquitetura

O framework é dividido em 7 camadas, construídas de baixo para cima:

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 6: Remote                                             │
│  RemoteAuthorityResolver → SocketFactory → PersistentProtocol│
│  → IPCClient → channel.call()                                │
├──────────────────────────────────────────────────────────────┤
│  Layer 5: ProxyChannel                                       │
│  fromService(service) ↔ toService(channel)                   │
├──────────────────────────────────────────────────────────────┤
│  Layer 4: IPCServer (1:N) / IPCClient (1:1 双向)             │
│  连接管理、路由、多播                                          │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: ChannelServer / ChannelClient                      │
│  基于 Channel 的 RPC (call / listen)                          │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: IMessagePassingProtocol                            │
│  send(buffer) / onMessage: Event<buffer>                     │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: Serialization (VQL + 类型标签)                      │
│  serialize() / deserialize()                                  │
├──────────────────────────────────────────────────────────────┤
│  Layer 0: Foundation                                         │
│  Event / Emitter / Disposable / VSBuffer / CancellationToken │
└──────────────────────────────────────────────────────────────┘
```

**Insight principal**: cada camada depende apenas da camada abaixo. A Layer 3+ não se importa com o transporte subjacente — Electron IPC, MessagePort, WebSocket e TCP podem usar o mesmo código RPC.

## Estrutura de arquivos

```
packages/rpc/src/
├── index.ts            # 统一导出
├── foundation.ts       # Layer 0: Event, Emitter, Disposable
├── buffer.ts           # VSBuffer 跨平台二进制抽象
├── serialization.ts    # Layer 1: 二进制序列化
├── protocol.ts         # Layer 2: 消息传递协议
├── channels.ts         # Layer 3: Channel RPC
├── ipc.ts              # Layer 4: 多连接管理
├── proxy-channel.ts    # Layer 5: 服务自动代理
└── remote.ts           # Layer 6: 远程连接基础设施
```

---

## Layer 0: Foundation

### Disposable — ciclo de vida de recursos

```typescript
import { IDisposable, toDisposable, DisposableStore } from "@zcode/rpc";

// 包装清理函数
const d = toDisposable(() => socket.close());

// 批量管理
const store = new DisposableStore();
store.add(subscription1);
store.add(subscription2);
store.dispose(); // 一次性清理全部
```

### Event / Emitter — sistema de eventos

`Event<T>` é uma assinatura de função: `(listener: (e: T) => void) => IDisposable`. A assinatura retorna um disposable, usado para cancelar a inscrição.

```typescript
import { Emitter, Event } from "@zcode/rpc";

class FileWatcher {
  private _onDidChange = new Emitter<string>();
  readonly onDidChange: Event<string> = this._onDidChange.event;

  detectChange(path: string) {
    this._onDidChange.fire(path);
  }
}

// 使用
const watcher = new FileWatcher();
const sub = watcher.onDidChange((path) => console.log("changed:", path));
sub.dispose(); // 取消订阅
```

O Emitter suporta hooks de inicialização preguiçosa, que são o núcleo da eficiência de rede de todo o framework:

```typescript
const emitter = new Emitter<Data>({
  onWillAddFirstListener: () => {
    /* 第一个订阅者来了，开始拉取数据 */
  },
  onDidRemoveLastListener: () => {
    /* 最后一个订阅者走了，停止拉取 */
  },
});
```

**Métodos utilitários de Event**:

| Método                     | Uso                        |
| -------------------------- | -------------------------- |
| `Event.once(event)`        | Dispara uma vez, cancela automaticamente |
| `Event.toPromise(event)`   | Converte evento em Promise |
| `Event.filter(event, fn)`  | Filtra eventos             |
| `Event.map(event, fn)`     | Transforma o valor do evento |

### CancellationToken — cancelamento assíncrono

```typescript
import { CancellationTokenSource } from "@zcode/rpc";

const cts = new CancellationTokenSource();
doWork(cts.token);
cts.cancel(); // 通知取消
cts.dispose(); // 释放资源
```

---

## Layer 1: Serialization

Serialização binária, com o formato `[1 byte de tag de tipo] [comprimento codificado em VQL] [dados]`.

Tipos suportados: Undefined, String (UTF-8), Buffer, VSBuffer, Array (recursivo), Object (fallback JSON), Int (codificação VQL).

Codificação VQL (Variable-Length Quantity): inteiros pequenos ocupam apenas 1 byte (contra 4 bytes do JSON), o que economiza bastante espaço.

```typescript
import { BufferWriter, BufferReader, serialize, deserialize } from "@zcode/rpc";

const writer = new BufferWriter();
serialize(writer, { name: "test", count: 42, data: [1, 2, 3] });
const buffer = writer.buffer;

const reader = new BufferReader(buffer);
const value = deserialize(reader); // { name: 'test', count: 42, data: [1, 2, 3] }
```

---

## Layer 2: Protocol

### IMessagePassingProtocol — abstração de transporte

Esta é a fronteira de abstração chave de todo o framework. Qualquer transporte que implemente esta interface passa a ter acesso a todas as capacidades das camadas superiores:

```typescript
interface IMessagePassingProtocol {
  send(buffer: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}
```

### Implementações de protocolo embutidas

| Implementação          | Cenário                   | Características                                       |
| ---------------------- | ------------------------- | ----------------------------------------------------- |
| `SocketProtocol`       | TCP / Socket cru          | Cabeçalho de frame de 13 bytes, trata coalescência/fragmentação de pacotes TCP |
| `PersistentProtocol`   | Cenários que exigem transporte confiável | ACK de confirmação + replay de mensagens não confirmadas + heartbeat (5s) + reconexão |
| `MessagePortProtocol`  | Web Worker / Electron IPC | Não precisa de framing (MessagePort preserva naturalmente os limites de mensagem) |
| `createQueuePair()`    | Testes / comunicação intraprocesso | Retorna dois protocols interconectados em memória     |

### createQueuePair — grande aliado para testes

```typescript
import { createQueuePair } from "@zcode/rpc";

const [clientProtocol, serverProtocol] = createQueuePair();
// clientProtocol.send() 的数据会出现在 serverProtocol.onMessage 中，反之亦然
```

---

## Layer 3: Channel RPC

### Conceitos centrais

**IChannel** (visão do cliente):

```typescript
interface IChannel {
  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
  listen<T>(event: string, arg?: any): Event<T>;
}
```

**IServerChannel** (visão do servidor):

```typescript
interface IServerChannel<TContext = string> {
  call<T>(
    ctx: TContext,
    command: string,
    arg?: any,
    cancellationToken?: CancellationToken,
  ): Promise<T>;
  listen<T>(ctx: TContext, event: string, arg?: any): Event<T>;
}
```

A única diferença é o parâmetro `ctx` — que identifica de qual cliente veio a requisição.

### ChannelServer + ChannelClient

```typescript
import { ChannelServer, ChannelClient, createQueuePair } from "@zcode/rpc";

const [cp, sp] = createQueuePair();

// 服务端
const server = new ChannelServer(sp, "server-ctx");
server.registerChannel("calc", myCalculatorChannel);

// 客户端
const client = new ChannelClient(cp);
const calc = client.getChannel("calc");
const result = await calc.call<number>("add", [1, 2]); // 调用方法
calc.listen<string>("onDidLog")((msg) => console.log(msg)); // 订阅事件
```

### Protocolo de mensagens

```
客户端 → 服务端:
  Promise(100)       调用方法
  PromiseCancel(101) 取消调用
  EventListen(102)   订阅事件
  EventDispose(103)  取消订阅

服务端 → 客户端:
  Initialize(200)      握手完成
  PromiseSuccess(201)  调用成功
  PromiseError(202)    调用失败 (Error)
  PromiseErrorObj(203) 调用失败 (非 Error)
  EventFire(204)       事件触发
```

---

## Layer 4: IPCServer / IPCClient

### IPCServer — um para muitos

Um server gerencia múltiplas conexões de clientes. Suporta RPC reverso (o server chama o client).

```typescript
import { IPCServer, IPCClient, StaticRouter, createQueuePair } from "@zcode/rpc";

// server 监听连接事件
const server = new IPCServer(onDidClientConnect);

// 注册全局服务（所有 client 都能访问）
server.registerChannel("config", configChannel);

// 反向 RPC：server 调用特定 client
const windowChannel = server.getChannel(
  "windowInfo",
  new StaticRouter((ctx) => ctx === "window-1"),
);
const title = await windowChannel.call<string>("getTitle");

// 多播：聚合所有 client 的事件
const allEvents = server.getChannel("notifications", () => true).listen("onNotification");
```

### IPCClient — um para um, bidirecional

É ao mesmo tempo client e server, adequado para comunicação peer-to-peer:

```typescript
const ipcClient = new IPCClient(protocol, "my-client-id");

// 作为 client 调用远程
const remote = ipcClient.getChannel("service");

// 作为 server 注册本地服务
ipcClient.registerChannel("localService", myChannel);
```

---

## Layer 5: ProxyChannel ⭐

**Este é o grande diferencial do framework** — expor e consumir serviços sem nenhuma linha de boilerplate.

### O problema

Sem ProxyChannel, cada serviço exige um switch-case escrito à mão:

```typescript
// 😩 每个服务都要写一遍
class FileServiceChannel implements IServerChannel {
  call(ctx, command, arg) {
    switch (command) {
      case "readFile":
        return this.service.readFile(arg[0]);
      case "writeFile":
        return this.service.writeFile(arg[0], arg[1]);
      // ... 每个方法都要手动映射
    }
  }
}
```

### A solução

```typescript
import { ProxyChannel } from "@zcode/rpc";

// ✅ 服务端：一行暴露
const channel = ProxyChannel.fromService(fileService);
server.registerChannel("fs", channel);

// ✅ 客户端：一行消费
const fs = ProxyChannel.toService<IFileService>(client.getChannel("fs"));
await fs.readFile("/path"); // 就像调用本地方法
fs.onDidChangeFile((e) => console.log(e)); // 事件订阅也是透明的
```

### Convenção de nomes

O ProxyChannel distingue automaticamente métodos e eventos por convenção de nomes:

| Padrão de nome        | Tipo                             | Exemplo                        |
| --------------------- | -------------------------------- | ------------------------------ |
| `onXxx` (on + maiúscula) | Evento estático                | `onDidChange`, `onError`      |
| `onDynamicXxx`        | Evento dinâmico (método que retorna Event) | `onDynamicDidChangeFile(uri)` |
| Outros                | Método RPC                       | `readFile`, `writeFile`        |

### Buffer de eventos

`fromService` faz buffer de eventos automaticamente — eventos disparados antes do primeiro assinante não são perdidos; no momento da assinatura o buffer é esvaziado primeiro.

---

## Layer 6: Remote

Infraestrutura completa de conexão remota, com suporte a SSH, WSL, Docker e cenários semelhantes.

### Componentes centrais

**RemoteAuthorityResolverService** — resolve a authority remota:

```typescript
// authority 格式: "type+identifier"，如 "ssh+myserver", "wsl+Ubuntu"
const resolver = new RemoteAuthorityResolverService();
resolver.register("ssh", sshResolver);

const result = await resolver.resolve("ssh+myserver");
// → { authority, connectTo: WebSocketRemoteConnection | ManagedRemoteConnection }
```

**RemoteSocketFactoryService** — cria a conexão:

```typescript
const factory = new RemoteSocketFactoryService();
factory.register(RemoteConnectionType.WebSocket, webSocketFactory);

const socket = await factory.connect(connectTo, path, query);
```

**createURITransformer** — transformação de esquemas de URI:

```
客户端 → 服务端:
  vscode-remote://ssh+myserver/home/user/file.txt → file:///home/user/file.txt

服务端 → 客户端:
  file:///home/user/file.txt → vscode-remote://ssh+myserver/home/user/file.txt
```

### RemoteAgentConnection

Gerenciamento completo do ciclo de vida: resolve a authority → cria o socket → encapsula o PersistentProtocol → retorna o IPCClient. Suporta reconexão automática após queda (backoff exponencial: 0, 5, 5, 10, 10, 10, 10, 10, 30 segundos).

```typescript
const connection = new RemoteAgentConnection("ssh+myserver", resolver, socketFactory);
const ipcClient = await connection.connect();

// 透明使用远程服务
const remoteFS = ProxyChannel.toService<IFileService>(ipcClient.getChannel("filesystem"));
await remoteFS.readFile("/remote/path");

// 监听连接状态
connection.onDidStateChange((state) => {
  // 'connected' | 'reconnecting' | 'disconnected'
});
```

---

## Padrões típicos de uso

### Padrão mais simples: RPC direto

```typescript
const [cp, sp] = createQueuePair();
const server = new ChannelServer(sp, "ctx");
const client = new ChannelClient(cp);

server.registerChannel("myService", ProxyChannel.fromService(myService));

const remote = ProxyChannel.toService<IMyService>(client.getChannel("myService"));
await remote.doSomething();
```

### Processo principal do Electron ↔ processo de renderização

```typescript
// 主进程
const protocol = new MessagePortProtocol(electronPort);
const server = new ChannelServer(protocol, "main");
server.registerChannel("app", ProxyChannel.fromService(appService));

// 渲染进程
const protocol = new MessagePortProtocol(electronPort);
const client = new ChannelClient(protocol);
const app = ProxyChannel.toService<IAppService>(client.getChannel("app"));
```

### Gerenciamento de múltiplas janelas

> Nota sobre a capacidade RPC geral: cada workspace window do ZCode possui seu próprio Window Host exclusivo. MessagePorts de escopo base e de escopo remoto se conectam a esse Host; os pools SSH/WSL e as conexões dedicadas Docker/Server são recursos internos do Host e não correspondem a processos Host adicionais. channel/context devem manter o isolamento de janela, remoteSessionId, attachment e workspaceKey.

```typescript
const server = new IPCServer(onDidWindowConnect);
server.registerChannel("config", ProxyChannel.fromService(configService));

// 向特定窗口发送命令
const targetWindow = server.getChannel("window", (ctx) => ctx === "window-2");
await targetWindow.call("focus");

// 聚合所有窗口的事件
const allCloses = server.getChannel("window", () => true).listen("onDidClose");
```

---

## Princípios de design

1. **Independência de transporte** — `IMessagePassingProtocol` é a única fronteira de abstração; um novo transporte só precisa implementar essa interface
2. **Assinatura preguiçosa** — eventos só geram tráfego de rede quando há assinantes (movido pelos hooks do Emitter)
3. **Tudo é Disposable** — cada componente implementa `IDisposable`, eliminando vazamentos de recursos
4. **Propagação de erros** — exceções são serializadas e reconstruídas automaticamente, preservando o stack trace
5. **Proxy sem boilerplate** — o ProxyChannel usa convenção de nomes + ES6 Proxy para eliminar mapeamentos manuais
6. **Transporte confiável** — o PersistentProtocol oferece ACK + replay de mensagens + heartbeat + reconexão

## Executando os exemplos

```bash
pnpm --filter @zcode/rpc demo:basic    # 基础 RPC
pnpm --filter @zcode/rpc demo:proxy    # ProxyChannel
pnpm --filter @zcode/rpc demo:remote   # 远程连接
```