# Arquitetura em Camadas Inicial do ZCode (histórico)

Este documento registra o contexto de camadas de quando o projeto partiu de uma UI compartilhada + Channel RPC + service interface. Ele não descreve mais a quantidade atual de Hosts, a topologia remota, as Root props ou o fluxo de dados de conversation; para os fatos atuais, leia o [Z Code 代码架构总览](./zcode-code-architecture-overview.md).

## Princípios de design ainda válidos

- Desktop, Web e mobile remote reutilizam `packages/ui`, e as diferenças de plataforma são tratadas por injeção de dependência.
- A UI depende de interfaces de service/protocol e não chama diretamente Repo, implementações Node ou o main do Electron.
- `packages/rpc` fornece apenas channel, transport, proxy, eventos e middleware de log, sem semântica de negócio.
- `packages/services` define as interfaces de negócio do Host e as implementações Node; `packages/client` fica responsável por criar os service proxies.
- `packages/desktop` / `packages/web` cuidam da composição de plataforma e não podem vazar objetos de plataforma de volta para a UI compartilhada.
- Um novo service deve continuar registrando descriptor, implementação, accessor e client proxy, mantendo import de tipo browser-safe.

## Premissas iniciais que já não valem

A documentação inicial descrevia o sistema como "um único server com três entradas: HTTP/WebSocket/stdio" e deixava que o renderer montasse por conta própria o estado de chat a partir de task/session events. Essas premissas foram substituídas pelas seguintes implementações:

```text
旧：Renderer reducer -> task state -> UI
新：ZCode CLI ProductProjection -> V4 topic -> read-only UI store

旧：一个抽象 server 承载所有部署形态
新：每个窗口的 Host/service graph + workspace-scoped CLI + remote attachment
```

Também perderam a validade:

- `Root` montava capacidades de plataforma diretamente via props `credentialStore` / `onConnectRemote`;
- a UI usava `window.zcode` ou singletons concretos de service;
- credentials podiam ser expostas ao renderer diretamente via platform bridge;
- task list, conversation rows, queue e disponibilidade de stop/fork eram de responsabilidade exclusiva do renderer store;
- um workspace remoto podia ser identificado apenas por `workspacePath`.

## Direção atual das dependências

```text
packages/shared  <- schema / platform contracts
packages/rpc     <- transport / channel mechanics
packages/services<- Host service interfaces + Node implementations
packages/client  <- typed service proxies
packages/ui      <- hooks + V4 projection consumers
desktop/web      <- platform composition
apps/zcode-cli   <- Agent runtime + V4 authority
```

Código entre domínios só pode depender dos Types/contratos públicos um do outro. Novos protocolos de conversation alteram primeiro `packages/shared/src/zcode-protocol-v4/`, e só então sincronizam o CLI, o Host transport e os consumidores de todas as pontas.

## Entradas atuais

- [代码架构总览](./zcode-code-architecture-overview.md)
- [Message Flow](./message-flow.md)
- [RPC 架构](./rpc.md)
- [ZCode Protocol](../zcode-protocol.md)