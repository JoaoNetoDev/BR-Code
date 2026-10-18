# Camadas do protocolo de comunicação do ZCode (fatos atuais)

> Este documento apresenta o modelo mais simples para entender a comunicação atual entre processos. É o modelo mental de três camadas da arquitetura do projeto, e não a exigência de que cada cadeia passe exatamente pela mesma pilha de protocolos.

## Guarde primeiro as três camadas

```text
Camada 3: conteúdo —— o que fazer
Camada 2: envelope —— como descrever, numerar e casar mensagens
Camada 1: canal —— por qual tubulação a mensagem é transportada
```

Uma analogia com o envio de encomenda:

```text
O item dentro da encomenda = conteúdo de negócio
A etiqueta e a embalagem = protocolo de mensagem
O caminhão, a estrada, o avião = canal de transporte
```

Na envio, empacota-se de cima para baixo, da camada 3; na recepção, desempacota-se de baixo para cima, da camada 1.

## Camada 1: Canal (Transport)

O canal só seResponsável por transportar bytes ou mensagens estruturadas e não entende negócios como chat, arquivos ou Git.

Os canais do projeto atual incluem:

- `MessagePort`: porta local entre o Renderer e o Window Host.
- `stdio`: entrada e saída padrão entre o Host e o `zcode-cli`, e entre o `zcode-server` e seus subprocessos de Agent.
- `WebSocket`: conexão com um `zcode-server` existente, ou com o Relay de controle remoto do celular.
- Electron IPC: chamadas de plataforma entre o Renderer e o Main.
- `postMessage` do UtilityProcess: mensagens de controle de processo entre o Main e o Window Host.

Esta camada responde: **“por qual tubulação a mensagem segue?”**

## Camada 2: Envelope (Message / Call Protocol)

Esta camada empacota o conteúdo em mensagens tratáveis e resolve:

- É uma requisição, uma resposta ou um evento?
- Qual é o número da requisição?
- Qual serviço e qual método são chamados?
- A resposta deve casar com qual requisição?
- Como os dados são serializados?

Existem hoje três formas principais:

### `@zcode/rpc`

Protocolo genérico de chamada de Service, com suporte a `call`, `response`, `listen` e notificações de evento. É usado principalmente para:

- Renderer ↔ Window Host;
- Window Host ↔ `zcode-server` remoto.

### Envelope JSON do ZCode Protocol

Casca JSON de requisição/resposta/notificação usada entre o Host e o `zcode-cli`, com estrutura típica assim (alguns campos de identidade foram omitidos para facilitar a leitura):

```json
{
  "id": 42,
  "method": "v4/command",
  "params": {
    "commandId": "cmd-123",
    "clientId": "desktop-client",
    "sessionId": "session-1",
    "type": "sendText",
    "payload": { "text": "你好" }
  }
}
```

Esses objetos JSON costumam trafegar em NDJSON (um JSON por linha) pelo stdio.

### Typed IPC / `postMessage`

As mensagens de controle do Main não passam pelo `@zcode/rpc` genérico, mas são enviadas diretamente como objetos estruturados com `type`, por exemplo:

```ts
{
  type: "attach-service-port",
  attachmentId: "...",
  clientMode: "desktop-continuous",
}
```

Aqui o próprio `type` já é a informação de roteamento da mensagem.

## Camada 3: Conteúdo (Significado de negócio)

Esta camada define o significado de negócio que a mensagem realmente expressa.

### Protocolo de conversa V4

O V4 responde pela sessão do Agent e pelos fatos de conversa, por exemplo:

- Comandos: `createSession`, `sendText`, `stop`, `compact`, `switchModelConfig`;
- ACK de comandos: aceito, rejeitado, expirado, duplicado etc.;
- Tópico de conversa: snapshot, delta, `seq`, `revision`;
- Assinatura, recuperação de desconexão, resync;
- Semântica de entrega `desktop-continuous` e `web-remote-replayable`.

A fonte final de fatos e o arbitro de comandos do V4 é o `zcode-cli` correspondente ao workspace, e não o Renderer, o Main ou o Relay.

### Service API

A Service API é a capacidade exposta pelo Host, por exemplo:

- `fileService.readFile`;
- `terminalService.create`;
- `gitService.status`;
- `zcodeAgentService.sendConversationCommandV4`;
- `zcodeAgentService.subscribeConversationV4`.

A Service API pode transportar V4, mas também capacidades não-V4 como arquivos, terminal e Git.

### Mensagens de controle do Host

O que passa entre Main e Host é controle de processo e de conexão, por exemplo:

- Inicialização do Host;
- `ConnectRemoteWorkspace`;
- `AttachServicePort` / `DetachServicePort`;
- Re-vinculação do attachment após um reload do Renderer.

Essas não são comandos de conversa do V4.

## Correspondência por cadeia

| Cadeia | Camada 3: conteúdo | Camada 2: envelope | Camada 1: canal |
| --- | --- | --- | --- |
| Renderer → Host | Service API, comandos/consultas/assinaturas V4 | `@zcode/rpc` | `MessagePort` |
| Renderer → Main | operações de plataforma | canal do Electron IPC | Electron IPC |
| Main → Host | mensagens de controle do Host | typed `{ type, ... }` | `postMessage` |
| Host → CLI local | V4, poucas operações legacy | ZCode Protocol JSON | stdio NDJSON |
| Host → `zcode-server` | Service API remota, com parâmetros podendo transportar V4 | `@zcode/rpc` | SSH stdio ou WebSocket |
| `zcode-server` → CLI remoto | V4, poucas operações legacy | ZCode Protocol JSON | stdio NDJSON |
| Celular → Relay → Main | chamadas de Service/V4 do controle remoto | envelope do relay + `rpc-frame` | WebSocket |

O controle remoto do celular também entra, via shared-host attachment, em um Window Host já existente; o Relay e o Main são responsáveis apenas por autenticação, pareamento, heartbeat, repasse de frames e agendamento de attachments, sem manter estado de negócio de conversation/task/stream.

## Caminho completo de um `sendText` remoto

```text
Camada 3：comando V4 sendText
        │
        ▼
Renderer
  Camada 2: chamada @zcode/rpc sendConversationCommandV4(...)
  Camada 1: MessagePort
        │
        ▼
Window Host
  Camada 2: chamada de Service @zcode/rpc remota
  Camada 1: SSH stdio / WebSocket
        │
        ▼
zcode-server
  Camada 2: ZCode Protocol JSON, method = "v4/command"
  Camada 1: stdio do subprocesso
        │
        ▼
zcode-cli remoto
  CommandInbox arbitra e executa o sendText
```

O mesmo comando V4 pode ser transportado por várias “chamadas”, mas “comando” e “chamada” não são o mesmo conceito:

```text
Comando V4 = intenção de negócio concreta, por exemplo sendText
Chamada V4 = chamada da Service API que leva esse comando ao próximo salto
```

Por isso, no lugar de “Host → zcode-server: chamada V4” em um diagrama, a formulação mais precisa é:

> **RPC de Service remoto, carregando um comando ou consulta V4 nos parâmetros.**

## Pontos de entrada relacionados

- [Visão geral da arquitetura de código](./zcode-code-architecture-overview.md)
- [Message Flow](./message-flow.md)
- [Implementação em camadas de `@zcode/rpc`](../../packages/rpc/src/index.ts)
- [Schema de comandos do V4](../../packages/shared/src/zcode-protocol-v4/command.ts)
- [Schema de transport do V4](../../packages/shared/src/zcode-protocol-v4/transport.ts)
- [Conexão RPC remota](../../packages/server/src/remote/connect.ts)
- [RPC server stdio do zcode-server](../../packages/server/src/stdio.ts)
- [Client ZCode Protocol do Agent](../../packages/services/src/zcode-agent/zcodeProtocolClient.ts)