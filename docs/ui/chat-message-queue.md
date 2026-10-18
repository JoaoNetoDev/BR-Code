# Chat Message Queue (fatos atuais)

A única fonte de verdade da fila de chat é a runtime command queue da CLI de cada workspace, projetada para todos os clientes por meio de `ConversationSnapshot.queue`. O renderer não mantém uma accepted queue, e não existem duas ordens de produto concorrentes entre a queue do renderer desktop e a queue do host mobile.

## Cadeia de Estado

```text
desktop / mobile input
  -> V4 command admission
  -> inputRouting: startNow | enqueue | guide | choice
  -> CLI runtime queue
  -> ProductProjection.queue
  -> snapshot/delta
  -> queue UI
```

Quando em running, tanto `sendText` quanto `sendGoalCommand` comuns têm a entrada na fila decidida pela admission da CLI. Uma nova entrada sob uma held queue precisa trazer a escolha do usuário sobre o destino da fila existente, e a UI não pode adivinhar se deve limpar ou manter.

## Operações

| Ação do usuário | V4 command         | Resultado autoritativo          |
| --------------- | ------------------ | ------------------------------- |
| Excluir         | `deleteQueueItem`  | a projection remove o queue item |
| Desfazer edição | `deleteQueueItem`  | após a remoção da projection, somente o originador restaura o rascunho do composer |
| Enviar agora    | `sendQueuedNow`    | a CLI consome conforme stop barrier/regras de prioridade |
| Reordenar       | `reorderQueueItem` | a projection retorna a nova ordem |
| Continuação automática | `setAutoDrain` | o snapshot atualiza o estado de auto-drain |

A UI pode fornecer um feedback breve de pending/disabled ao clique, mas não pode alterar apenas o array local. Em refresh, troca de pane e com desktop e mobile online ao mesmo tempo, a referência é sempre o snapshot/delta.

O "editar" no UI first-party de desktop, Web e mobile não é reescrita no lugar dentro da queue; em vez disso, ele recolhe a intenção completa de entrada de volta para o composer que originou a operação:

```text
点击编辑(queueItem, baseRevision, sessionId, workspaceKey)
  -> composer 是否已有 text / attachment / web context / selection ref / uploading state
       ├─ 是: 不发 command，queue 与现有草稿均不变，提示先处理当前草稿
       └─ 否: 锁定目标 queue row 与 composer
              -> deleteQueueItem(baseRevision)
                   ├─ stale / noop / rejected / failed
                   │    -> 不恢复草稿，解锁并提示重试
                   └─ accepted / duplicate
                        -> 所有端接收权威 queue removal projection
                        -> 仅发起端、且仍是原 session + workspaceKey 时
                           恢复 kind + text + AttachmentRef[]
                        -> 用户修改后重发，产生新的 commandId / queueItemId
```

`workspaceKey = workspaceIdentity?.trim() || workspacePath`. A solicitação de desfazer é vinculada à session e ao
workspaceKey no momento do clique; trocar de task/workspace antes do ACK não pode escrever o payload antigo no novo composer. ACK repetido ou
restore request repetido precisam ser idempotentes. Quando o alvo já foi consumido ou foi excluído por outra ponta, `deleteQueueItem` retorna um `noop` distinguível, e não pode
restaurar a projection antiga como rascunho local.

Texto comum e goal podem ser desfeitos; o goal é restaurado como `/goal ...`. `compact` continua sem entrada de edição. Anexos são restaurados na ordem original da queue, com o
`AttachmentRef` completo, como chips prontos, marcados como referência pertencente à session; exclusão, acréscimo e reenvio direto não repetem upload/adopt, e a lógica de restart do runtime e de
limpeza também não pode interpretá-los como staged ref ainda não adotado.
Quando não há object URL local para uma imagem, são exibidos o nome do arquivo e o ícone de tipo, sem novo protocolo de download de thumbnails.

O rascunho restaurado pelo originador permanece renderer-local, sem ser gravado no conversation snapshot, no relay ou no processo principal; outros desktops
ou mobiles apenas consomem a remoção autoritativa da queue. O `editQueueItem` subjacente continua mantido como capacidade de compatibilidade do V4, mas o UI first-party não o chama mais.

Itens de fila `compact` mostram apenas o texto do comando `/compact`, sem ícone de comando de manutenção antes do texto. Eles continuam se distinguindo das mensagens comuns pelo botão "executar imediatamente" e pelo comportamento não editável.

`guide` é uma semântica de orientação do turn ativo, e não é oferecido como um queue item comum com edição, exclusão ou envio imediato. Stop apenas interrompe a execução atual; se a queue fica held ou segue em execução é algo que a projection da CLI expressa explicitamente. A pausa e a retomada do Goal, assim como o queue drain, também são decididas de forma unificada pelo reducer/handler da CLI.

## Entradas Atuais

- Schema: `packages/shared/src/zcode-protocol-v4/command.ts`, `snapshot.ts`
- CLI handlers: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts`
- UI: `packages/ui/src/v4/SessionPane.tsx`