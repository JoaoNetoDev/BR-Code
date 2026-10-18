# Arquitetura de sessão V4: estado atual e navegação de documentação

Data de atualização: 2026-07-15

O caminho principal da conversation V4 já está implantado: a CLI mantém os canonical facts, a command inbox e a product projection; Host/relay encaminham conexão e topic; renderer/web assinam a projection, enviam commands e mantêm apenas estado local de UI.

Este diretório mistura dois tipos de documento:

- Especificações atuais: schema, recovery, fault, sessions-index ainda restringem o código em vigor;
- Trayectoria de implementação: phasing, review, deletion/parity registram a base das migrações, e os caminhos legacy, números de linhas e "a implementar" no corpo representam apenas o estado da época.

Para a semântica do produto, leia primeiro [Conversation Product Protocol](../conversation-product-protocol.md); para a visão geral do sistema, leia primeiro [ZCode Protocol](../zcode-protocol.md) e [Message Flow](../architecture/message-flow.md).

## Topologia atual

```text
Electron / Web / mobile remote
  |-- SessionPane + read-only projection stores
  |-- command(commandId, clientId, baseRevision, payload)
  `-- local draft / scroll / focus / optimistic overlay
          |
          | @zcode/rpc MessagePort / remote attachment
          v
Host connection scope
  |-- trusted clientMode / connectionId
  |-- owned topic subscription routing
  |-- runtime generation / stale subscription cleanup
  `-- no conversation reducer or second queue
          |
          | @zcode/shared/zcode-protocol-v4 over stdio
          v
ZCode CLI
  |-- transcript + session metadata + goal facts
  |-- V4 command inbox / durable input admission
  |-- ProductProjection + SessionsIndexProjection
  |-- topic publisher: snapshot / delta / seq / logEpoch
  `-- runtime config, queue, interaction and active/background work
```

O `/remote` do celular conecta-se, via shared-host attachment, ao Local/Remote Host já existente no desktop que hospeda o escopo de workspace alvo. O relay e o main do desktop apenas fazem autenticação, pareamento, heartbeat e repasse de frame/app payload; não possuem session, queue, snapshot nem projection.

## Invariantes atuais

- A UI de conversation renderiza por linhas de projection e não rederiva turn, timeline, endedness ou disponibilidade de ações a partir de um array plano de mensagens.
- Commands usam identidade idempotente por `commandId` e `baseRevision` opcional; ACK e projection subsequente têm papéis bem definidos.
- Cada attachment/subscription tem ownership, generation, seq e recovery próprios; frames de downlink são entregues apenas à porta proprietária.
- O desktop é continuous online delivery; o mobile remote é replayable recovery. Ambos compartilham os fatos da CLI, mas frames de recovery não podem se espalhar para o caminho principal online do desktop.
- Snapshot substitui atomicamente; delta precisa ser-contínuo; mudança de gap/epoch dispara resync e, durante a recuperação em andamento, frames online atrasados não podem sobrescrever.
- A session queue e o interaction pending state vivem na CLI; Host, relay e renderer não criam uma segunda fila de aceitação.
- Isolamento de identity/cache/topic usa `workspaceIdentity?.trim() || workspacePath`; a execução de caminho continua usando `workspacePath` e o link remoto ainda precisa carregar `remoteSessionId`.
- `tasks-index` possui o conjunto persistente de linhas de task e o estado organizacional pin/archive/group/unread; `sessions-index` possui apenas a atividade da lista e o resumo de detalhes em tempo real, e o cliente faz join em nível de campo usando a linha de task como tabela à esquerda.

## Entradas de código atuais

| Camada            | Entrada                                                                                                                                                    |
| ---               | ---                                                                                                                                ------------------------- |
| Schema V4         | `packages/shared/src/zcode-protocol-v4/`                                                                                                                    |
| Transport/store da UI | `packages/ui/src/v4/agentConversationTransport.ts`、`conversationProjectionStore.ts`、`sessionDataLayer.ts`                              |
| Pane/commands da UI  | `packages/ui/src/v4/SessionPane.tsx`、`ConversationComposer.tsx`                                                                                             |
| Rota Host/service | `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts`、`zcodeAgentService.ts`                                                                     |
| Gateway da CLI     | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                                                                                      |
| Projection da CLI  | `product-projection.ts`、`sessions-index-projection.ts`                                                                                                       |
| Commands da CLI    | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/`                                                                                           |

## Índice de documentação

| Documento                                       | Papel atual                                                            |
| ---                                             | ---                                                                     |
| [01-topology.md](./01-topology.md)             | Design de topologia e responsabilidades; ler junto da visão geral atual  |
| [02-projection.md](./02-projection.md)         | Design da projection e base das decisões                                |
| [03-commands.md](./03-commands.md)             | Especificação de command/ACK/inbox e itens em aberto                      |
| [04-sync-and-recovery.md](./04-sync-and-recovery.md) | Restrições de subscription de topic, seq, snapshot e recovery            |
| [05-transport-and-backpressure.md](./05-transport-and-backpressure.md) | Especificação de transport/wire/backpressure      |
| [06-ui.md](./06-ui.md)                         | Design da UI V4 e trajetória de implementação                            |
| [07-persistence.md](./07-persistence.md)       | Canonical facts, reconstrução de projection e migração                  |
| [08-phasing.md](./08-phasing.md)               | Fases históricas e trajetória de limpeza; não é a tabela de progresso atual |
| [09-protocol-schema.md](./09-protocol-schema.md) | Design inicial de schema; em conflito de campos, cede lugar ao código e ao 10 |
| [10-protocol-spec.md](./10-protocol-spec.md)   | Especificação principal da V4 em nível de campo                         |
| [11-deletion-plan.md](./11-deletion-plan.md)   | Lista histórica de execução de remoções                                 |
| [12-fault-catalog.md](./12-fault-catalog.md)   | Vocabulário de fault/reason code                                         |
| [13-golden-test-mapping.md](./13-golden-test-mapping.md) | Mapeamento de casos para evidências de reducer/protocol/WDIO   |
| [14-sessions-index.md](./14-sessions-index.md) | Especificação atual do sessions-index e entradas de implementação       |
| [design-review.md](./design-review.md)         | Auditoria de código pré-migração e trajetória de riscos                  |
| [review-meeting-brief.md](./review-meeting-brief.md) | Insumos históricos de revisão; não é um resumo do estado atual    |