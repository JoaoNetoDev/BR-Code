# Message Flow (fatos atuais)

## Cadeia principal

```text
ConversationComposer / SessionPane
  │ createSession | sendText | outro V4 command
  ▼
agentConversationTransport
  ▼
Host: sendConversationCommandV4
  ▼
zcode-cli correspondente ao workspaceKey
  ├─ command inbox decide
  ├─ core executa
  └─ ProductProjection atualiza
       │ snapshot / delta
       ▼
SessionDataLayer
  ▼
ConversationProjectionStore
  ▼
ConversationTimeline / Composer / StatusPanel
```

A UI não chama o antigo `sendPrompt()` para montar o estado da conversa, nem monta mensagens a partir de legacy task event. `IZCodeTaskService` ainda pode servir a lista, metadados ou a superfície de compatibilidade transitória, mas não é a fonte de verdade do corpo da conversa V4.

## Sequenciamento da entrada

```text
UI          Host             CLI inbox        Core/Projection
 | command   |                  |                    |
 |---------->| forward          |                    |
 |           |----------------->| validate/CAS       |
 |           |<-----------------| ACK                |
 |<----------|                  |                    |
 |           |                  |----execute-------->|
 |           |                  |<---events----------|
 |<========== snapshot/delta from conversation topic |
```

ACK e projection têm semânticas diferentes: o ACK responde “o comando foi aceito/rejeitado?”, e a projection responde “qual é o estado do produto agora?”. A UI precisa convergir para a projection.

## Entrega multiplataforma

- Desktop: `desktop-continuous`, assinando diretamente o live topic; após queda, recupera por seq.
- Controle remoto do celular: `web-remote-replayable`, assinando o mesmo Host/CLI por meio do shared-host attachment e preservando a recuperação por gap/snapshot.
- relay e Electron main fazem apenas autenticação, pareamento, heartbeat, repasse de frames e agendamento de attachments; não são donos do estado da conversa.

```text
mobile /remote
  -> relay
  -> Electron main
  -> existing Host attachment
  -> existing workspace CLI
```

## Roteamento de source SSH Remote

O workspace remoto SSH é roteado pelo registry dentro do Host único da janela; o Main apenas encaminha as requisições de controle de conexão e as portas, sem alterar a cadeia de fatos da conversa V4:

```text
remoteSessionId A -- attachment A --┐
                                    ├-> Window Host / RemoteConnectionRegistry
remoteSessionId B -- attachment B --┘
                                    -> uma SSH connection / zcode-server correspondente ao remoteHostKey
                                    -> CLI/runtime independentes correspondentes ao workspaceKey A/B
```

Cada attachment carrega seu próprio `attachmentId` e um `clientMode` confiável. Um reload do Renderer substitui apenas o attachment desktop correspondente; o `DetachServicePort` libera somente o RPC/assinatura de um workspace lógico, sem destruir o Host da janela nem uma SSH connection ainda em uso, e também não traz a semântica de recuperação replayable do celular para a cadeia desktop continuous.

## Entradas principais

| Camada               | Entrada atual                                                              |
| -------------------- | -------------------------------------------------------------------------- |
| UI pane              | `packages/ui/src/v4/SessionPane.tsx`                                       |
| UI transport         | `packages/ui/src/v4/agentConversationTransport.ts`                         |
| UI projection        | `packages/ui/src/v4/sessionDataLayer.ts`、`packages/ui/src/v4/conversationProjectionStore.ts` |
| Host service         | `packages/services/src/zcode-agent/zcodeAgentService.ts`                   |
| V4 schema            | `packages/shared/src/zcode-protocol-v4/`                                   |
| CLI gateway/reducer  | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/`                 |
| Desktop host         | `packages/desktop/src/host/index.ts`                                       |