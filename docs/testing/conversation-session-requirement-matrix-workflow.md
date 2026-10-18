# Workflow de Matriz de Requisitos de Sessão de Conversa

Este documento define a instância do ramo "esclarecimento de requisitos" no domínio de conversation session. O ponto de entrada genérico é a skill `.agents/skills/feature-boundary-planner`: o usuário descreve primeiro a feature nova ou a ser ajustada, o Agente encontra conceitos relacionados com base na documentação e no código existentes, enumera formalmente as combinações de estado e então faz o podamento passo a passo com o usuário, produzindo ao final o documento dos cases a cobrir.

## Objetivo

- Transformar "quero mudar uma feature" em um espaço de estados revisável, em vez de escrever E2E diretamente.
- Gerar combinações candidatas com base no protocolo existente, no case catalog, na coverage matrix e na terminologia de formal-proof.
- Documentar separadamente as combinações que o produto já confirmou, as que ainda precisam de confirmação, as podadas explicitamente e as deliberadamente não cobertas.
- Entregar apenas os cases `accepted` ao pipeline posterior de E2E manual-review / promotion.

## Entradas

O usuário só precisa descrever a mudança em linguagem natural, por exemplo:

```text
running 时 queue 里某条消息可以点立即发送
```

Se a descrição for insuficiente, o Agente faz primeiro apenas as perguntas mínimas necessárias, por exemplo: "isto é uma correção de comportamento existente ou uma nova entrada?"

## Descoberta de contexto

Priorize a documentação para achar a semântica de produto e depois leia o código para confirmar a implementação atual e as evidências observáveis:

1. Camada de protocolo: `docs/conversation-protocol-declaration.md`
2. case catalog: `docs/conversation-session-case-catalog.md`
3. Matriz de cobertura: `docs/testing/conversation-session-e2e-coverage-matrix.md`
4. Matrizes especiais relacionadas: fork, goal, fault, tool cross-product, network/SSE, recovery/isolation etc.
5. Implementação atual: UI surface, estado store/runtime, eventos de protocolo, fixture/helper

A saída é um concept map que registra de onde vem cada conceito, por que e como ele se relaciona com esta necessidade.

## Extração de dimensões

Só entram dimensões que alteram o resultado do produto ou as asserções. Dimensões comuns incluem:

| Tipo | Exemplos |
| --- | --- |
| Estado do produto | `session.phase`, `queue.length`, `queue.autoDrain`, `goal`, `compact.origin` |
| Evento de entrada | send text, `/goal`, `/compact`, stop, edit, fork, queue send-now |
| Objeto alvo | latest turn, old turn, assistant message, user query, queue item |
| Superfície de entrada | composer, turn actions, queue actions, toolbar, goal control |
| Forma de execução | text streaming, tool call, compact pending, goal verification |
| Configuração/ambiente | model/provider/thought, desktop continuous, web remote replayable, Docker replay |
| Camada de evidência | UI, runtime/store, protocol, network/SSE, files, logs |

Se uma dimensão for totalmente absorvida por um invariante, não faça o produto cartesiano completo, mas registre o motivo do podamento e um case representativo.

## Enumeração e podamento

A visão de enumeração segue a estrutura de formal-proof:

```text
state -> candidate -> guard -> effect -> case
```

Faça primeiro o produto cartesiano das dimensões relevantes e então pode por guard e invariantes. Cada combinação candidata precisa cair em um estado:

| Estado | Significado |
| --- | --- |
| `accepted` | A semântica de produto está clara, dá para escrever setup/action/assert |
| `undefined` | Pode acontecer de verdade, mas a semântica de produto não foi confirmada |
| `pruned` | Podado explicitamente por um guard ou invariante |
| `ignored` | Existe, mas não é coberto na versão atual; é preciso registrar o motivo de escopo |
| `bug-candidate` | A implementação atual parece violar um protocolo já confirmado |

O Agente leva ao usuário apenas lotes pequenos de perguntas por vez, para não despejar uma matriz enorme de uma só vez. As perguntas devem conter as respostas candidatas e a superfície de impacto; depois da resposta do usuário, o documento é reescrito.

## Produções de documentação

Um esclarecimento de requisitos produz ou atualiza no mínimo:

1. `docs/conversation-session-case-catalog.md`: novos/atualizados cases em linguagem natural.
2. `docs/testing/conversation-session-e2e-coverage-matrix.md`: marcar como `missing` ou `planned` os cases `accepted` ainda não implementados.
3. Se houver `undefined`: criar ou atualizar o decision worksheet/backlog, deixando claros a pergunta, as interpretações candidatas e o destino do registro.
4. Se forem dimensões especiais: sincronizar a matriz especial correspondente, em vez de colocar todas as combinações na matriz do caminho principal.

Um case `accepted` no documento precisa conter setup, action, assertion e pelo menos uma camada de evidência não-UI. Apenas passar por um estado em algum caminho não conta como cobertura.

## Entrega para E2E

Apenas cases `accepted` entram no fluxo de implementação de E2E:

1. Gerar a spec `manual-review/pending`.
2. Executar manual/capture e fazer a revisão humana.
3. Organizar os fixtures de provider/arquivo locais do case.
4. Após o promotion, entrar no replay formal e na Docker suite.

Esse fluxo posterior é de responsabilidade da skill `.agents/skills/e2e-case-lifecycle`. O ramo de esclarecimento de requisitos não gera E2E formal diretamente e não transforma `undefined` em asserção de teste.
