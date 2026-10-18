# Compartilhamento Estrutural de Conversation Row

## Contexto

Em 2026-09-29, ao fazer um stress test do renderer com HOME isolado e mock provider, descobriu-se que após o GC do foreground o JS heap ficava em torno de 200MB, dos quais 138MB eram strings grandes. Essas strings grandes tinham apenas 36 valores distintos, mas 730 cópias. Por exemplo, o mesmo `inputText` de ferramenta de 200KB estava armazenado 112 vezes, e o `input.content` derivado de seu parsing também era armazenado o mesmo número de vezes.

Dois fatores se somaram para causar o problema:

1. **Os snapshots históricos são retidos pela cadeia de closures.** `SessionPane` reutiliza a mesma instância ao alternar de task, e o ponto de montagem não tem `key={sessionId}`. Seu closure de `useCallback` compartilha o V8 Context de cada render, de modo que eles se encadeiam alternadamente e retêm o `state` — ou seja, o projection snapshot — de renders históricos. Medido: 220 escopos de render e 134 `state` retidos.
2. **Na substituição integral, os objetos de linha não compartilham nada.** Quando `ConversationProjectionStore` recebe um frame `snapshot`, ele substitui tudo pela "regra 1", e todos os objetos de linha vêm da nova desserialização. `row.upserted` também vira um objeto novo. Portanto cada snapshot histórico mantém seu próprio conjunto de strings grandes, e conteúdos idênticos não são compartilhados.

O ponto 1 determina quantos snapshots podem ser retidos; o ponto 2 determina o tamanho de cada snapshot. Esta solução trata o ponto 2: manter apenas uma cópia dos dados de conteúdo idêntico, de modo que um snapshot histórico retido só custe o overhead dos arrays e das cascas de linha.

## Design

```
host frame ──► ConversationProjectionStore.handleFrame
                 │
   snapshot 帧   │  rows.window 每一行 ──► rowPool.shareRow(topic, row)
   deltas 帧     │  row.upserted / row.appended 命中的行 ──► shareRow
                 │  row.delta 命中的行 ──► remember（只登记，不比较）
   rows/range    │  并入的更早行 ──► shareRow
                 ▼
          ConversationRowPool（SessionDataLayer 持有，生命周期长于 store）
            Map<topic␀rowId, WeakRef<row>> + FinalizationRegistry 清理
                 │
                 ├─ 池中旧行已被 GC 或不存在 → 登记新行，原样返回
                 └─ 旧行存活 → shareStructure(旧行, 新行)
                        深相等   → 直接返回旧行（引用不变）
                        部分相等 → 新壳 + 复用未变的子值（包括旧字符串引用）
```

- **O pool fica em `SessionDataLayer`, não dentro do store.** Depois que o keep-warm (30s por padrão) expira, o store é fechado e uma abertura fria cria um novo store. Mas nesse momento o snapshot antigo ainda pode estar retido pela cadeia de closures, então o pool precisa atravessar os stores para que as linhas novas da abertura fria reaproveitem as linhas antigas ainda vivas.
- **Apenas `WeakRef`.** O próprio pool não estende a vida de nenhuma linha. Depois que a linha é coletada pelo GC, o `FinalizationRegistry` remove a entrada correspondente; antes de remover, é preciso confirmar que a entrada ainda é o mesmo `WeakRef`, para não apagar por engano uma linha nova registrada depois.
- **A chave é `topic + rowId`.** Não há compartilhamento entre sessions diferentes. Depois de um rewind o rowId pode ser reutilizado e o conteúdo também pode ser diferente, mas o compartilhamento só acontece onde os valores são deep-equal, então a semântica é segura.
- **`shareStructure(prev, next)`:**
  - Recorre apenas em plain objects e arrays; para os demais tipos, retorna `next` diretamente.
  - Valores primitivos são comparados com `Object.is`. Strings com conteúdo igual mas referência diferente retornam a string de prev, permitindo que a cópia em next seja coletada pelo GC.
  - Nunca modifica `next`: `next` pode vir do reuso estrutural de apply.ts e estar referenciado por outros lugares.
- **Frames `snapshot`**: todas as linhas são compartilhadas. Se, após o compartilhamento, todas as linhas forem `===` com as linhas correspondentes do window atual e o comprimento for o mesmo, o próprio array do window é reaproveitado.
- **`row.delta` não é comparado.** As novas strings geradas por append em streaming já são novas; uma comparação profunda por frame só gastaria CPU. Aqui apenas registramos a nova linha no pool, aguardando o `row.upserted` final para compartilhar com ela.
- **Semântica inalterada.** O compartilhamento só reaproveita referências; os valores continuam deep-equal. A lógica de compartilhamento fica na camada de UI store e não altera o `applyConversationDelta` de `@zcode/shared`, porque o contrato de apply.ts é que o apply do cliente não acrescenta ramos semânticos.

## Superfície de impacto

- O `desktop-continuous` do desktop e o `web-remote-replayable` do celular usam o mesmo `ConversationProjectionStore`; a semântica de entrega não muda, apenas a identidade dos objetos fica mais estável.
- Linhas com igualdade por referência fazem os componentes de linha memoizados pularem o render. Isso é o esperado, pois os dados realmente não mudaram.
- A cadeia de closures em si (ponto 1) está fora do escopo desta vez; se for necessário um tratamento adicional, pode-se avaliar separadamente `key={sessionId}` ou dividir o SessionPane.

## Verificação

- Testes unitários: `packages/ui/test/conversationRowSharing.test.ts` (shareStructure e o pool), e os casos de store/camada em `packages/ui/test/v4SessionDataLayer.test.ts` (snapshot repetido, upsert, abertura fria após expiração do keep-warm, isolamento entre topics).
- Em runtime: stress test com HOME isolado, alternando de task 18 vezes, e depois contar as cópias de strings grandes via heap snapshot, comparando com a linha de base (144 cópias de state, 790 cópias / 150MB, heap 213MB).

## Resultados da verificação (2026-09-30)

Condições A/B: o mesmo conjunto de dados semente (HOME isolado, mock provider), cold start → enviar 2 rodadas de chamadas de ferramenta com arquivo grande → alternar 2 vezes em cada uma das 9 tasks → GC → heap snapshot.

| Métrica                                   | Antes da correção | Depois da correção    |
| ----------------------------------------- | ----------------- | --------------------- |
| JS heap após o GC                         | 93.3MB            | 68.1MB                |
| Cópias de strings grandes >=20KB (37 valores distintos) | 216 cópias / 39.3MB | 89 cópias / 14.9MB |
| Máximo de cópias de um mesmo inputText     | 32                | 10                    |
| Cópias de state retidas pela cadeia de closures | 37                | 37 (não tratado por esta solução) |

As cópias restantes vêm sobretudo da camada derivada da UI, como sliced strings usados na renderização e `assistantWorkRows`; não pertencem às linhas de projection e estão fora do escopo desta solução. Quanto mais cópias a cadeia de closures retiver, maior o ganho desta solução: em sessões longas o state pode alcançar centenas de cópias, e a memória é economizada na mesma proporção.
