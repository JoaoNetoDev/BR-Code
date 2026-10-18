# Implementação Atual do Conversation Product Projection

Data de atualização: 2026-07-15

`ConversationProductProjection` é o modelo de leitura de sessões do CLI voltado para App/Web. A
semântica de produto tem
[conversation-product-protocol.md](../conversation-product-protocol.md) como referência, e o
wire schema tem `packages/shared/src/zcode-protocol-v4/` como referência; este documento explica
como o código atual gera e restaura essa projeção a partir dos fatos do runtime.

## Cadeia de autoridade

```text
runtime SessionEvent / persisted transcript
  -> event-normalizer.ts             统一 live/cold 的 canonical fact
  -> ProductProjection               归约 control/config/queue/rows 等产品态
  -> ConversationTopicPublisher      生成 snapshot/delta、seq、logEpoch
  -> Host connection scope           只做订阅 ownership 与 frame 转发
  -> ConversationProjectionStore     原子 apply，不重新解释业务事件
  -> SessionPane                     按 rows 与显式 availability 渲染
```

Pontos de entrada da implementação atual:

- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/event-normalizer.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`
- `packages/ui/src/v4/conversationProjectionStore.ts`
- `packages/ui/src/v4/sessionDataLayer.ts`

## Estado pertencente à projeção

A seção A do snapshot transporta explicitamente:

- `control`: phase, estado de stop, active works, erros recentes e API retry;
- `availability`: fork, compact, troca de modelo/modo, operações de queue, operações de goal;
- `inputRouting`: `startNow | enqueue | guide | reject | choice`;
- `meta`, `config`, `usage`;
- `queue`, `pendingInteractions`, `pendingCommands`, `backgroundWorks`;
- `goal`, `plan`;
- `rows` e informações de janela.

A UI não deve mais derivar esses campos a partir do array de mensagens, da última mensagem, do
estado de tool ou do runtime local de tasks. O renderer possui apenas draft, foco, scroll, layout
e o overlay otimista temporário associado por `commandId`.

## Os cinco deltas

O conjunto de deltas é fechado:

```text
row.appended { row }
row.upserted { row }
row.removed  { fromRowId }
row.delta    { rowId, path, append }
state.updated { patch }
```

`state.updated` substitui a chave por completo; mesclagem profunda é proibida; `row.removed`
trunca a partir do rowId especificado. Mudanças estruturais que não possam ser expressas de
forma inequívoca por essas cinco operações devem disparar snapshot/resync; não é permitido
adicionar um novo algoritmo de remendo no cliente.

Cada entrada do usuário, timeline marker ou fato de child-session deve preservar, sempre que
possível, o `sourceCommandId`. Ele é a âncora comum para deduplicação de comandos, para
`commands/query` após perda de ACK e para o fechamento do overlay otimista.

## Recuperação live e cold

O log de eventos do CLI é um log limitado dentro do processo, não um fato persistente entre
reinicializações. Em operação normal, o publisher avança a projeção incrementalmente a partir dos
eventos canônicos live; quando o CLI reinicia ou na primeira assinatura cold,
`transcript-hydration.ts` sintetiza eventos equivalentes a partir das message/part persistidas,
das timeline part, do session input ledger e do session metadata, e os devolve ao mesmo
normalizer/projection.

Portanto, a garantia atual é "os mesmos fatos persistidos restauram para o mesmo estado final de
produto", e não "qualquer revisão histórica pode ser reconstruída". Se o log live cobrir apenas
parte do transcript, o gateway escolherá, conforme a verificação por footprint, a hidratação/merge
completa; é proibido renderizar mensagens do banco de dados contornando a UI.

## Limites de assinatura e entrega

- desktop usa `desktop-continuous`: preserva `row.delta` de streaming online;
- mobile remote usa `web-remote-replayable`: depende de recuperação por snapshot/gap e pode
  filtrar deltas intermediários não reproduzíveis;
- o profile pode alterar quadros intermediários, mas não pode alterar o command, o estado final de
  uma row nem a projeção final;
- cada connection/subscription mantém independentemente ownership, seq, logEpoch e a geração da
  recuperação;
- Host, desktop main e relay não armazenam a projeção nem estabelecem um segundo reducer.

## Janela de sessões longas

O schema já define a semantics de rows window e de leitura de faixas de linhas antigas. O cliente
deve respeitar a janela fornecida pelo snapshot e não pode assumir que todo snapshot sempre contém
o histórico completo. Na UI atual, a interação completa de `loadOlder` para históricos muito
longos ainda é uma capacidade pendente; até que ela exista, trata-se de uma limitação explícita,
e não de um motivo para o cliente varrer mensagens legacy e completar a lacuna.