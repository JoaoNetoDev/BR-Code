# Conversation Session Decision Workflow Board

Objetivo: colocar cada case ainda não coberto em um único quadro de status, rastreando answer draft, decision worksheet, source coverage, roadmap e a próxima ação.

Comando de geração:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --workflow-board-md
```

## Estado atual

| Métrica | Valor atual |
| --- | ---: |
| Workflow cases | 89 |
| Cases draft-ready | 0 |
| Cases worksheet-ready | 0 |
| Cases que precisam de backfill na fonte | 0 |
| Roadmap prontos para escrever | 35 |
| Roadmap implementados | 18 |

## Contagem por Next Action

| Next action | Número de cases |
| --- | ---: |
| Preencher N01.1 | 1 |
| Preencher N02.1 | 1 |
| Preencher N03.1 | 1 |
| Preencher N04.1 | 1 |
| Completar | 53 |
| Preencher N06.1 | 1 |
| Preencher N07.1 | 1 |
| Preencher N08.1 | 1 |
| Preencher N09.1 | 1 |
| Preencher S01.1 | 1 |
| Preencher S02.1 | 1 |
| Preencher S03.1 | 1 |
| Preencher S04.1 | 1 |
| Preencher S05.1 | 1 |
| Preencher S06.1 | 1 |
| Preencher S07.1 | 1 |
| Preencher D01.1 | 1 |
| Preencher D02.1 | 1 |
| Preencher D03.1 | 1 |
| Preencher D04.1 | 1 |
| Preencher D05.1 | 1 |
| Preencher L01.1 | 1 |
| Preencher L02.1 | 1 |
| Preencher L03.1 | 1 |
| Preencher L04.1 | 1 |
| Preencher L05.1 | 1 |
| Preencher L06.1 | 1 |
| Preencher L07.1 | 1 |
| Preencher L08.1 | 1 |
| Preencher W01.1 | 1 |
| Preencher W02.1 | 1 |
| Preencher W03.1 | 1 |
| Preencher W04.1 | 1 |
| Preencher W05.1 | 1 |
| Preencher X01.1 | 1 |
| Preencher X02.1 | 1 |
| Preencher X03.1 | 1 |

## Board

| Case | Group | Answer draft | Worksheet | Source coverage | Roadmap | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| N01 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N01.1 |
| N02 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N02.1 |
| N03 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N03.1 |
| N04 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N04.1 |
| N05 | P0-2 Falhas de requisição de modelo/API | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| N06 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N06.1 |
| N07 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N07.1 |
| N08 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N08.1 |
| N09 | P0-2 Falhas de requisição de modelo/API | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher N09.1 |
| S01 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S01.1 |
| S02 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S02.1 |
| S03 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S03.1 |
| S04 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S04.1 |
| S05 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S05.1 |
| S06 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S06.1 |
| S07 | P0-3 Falhas de streaming SSE | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher S07.1 |
| D01 | P1-1 Falhas de sistema de arquivos/armazenamento | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher D01.1 |
| D02 | P1-1 Falhas de sistema de arquivos/armazenamento | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher D02.1 |
| D03 | P1-1 Falhas de sistema de arquivos/armazenamento | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher D03.1 |
| D04 | P1-1 Falhas de sistema de arquivos/armazenamento | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher D04.1 |
| D05 | P1-1 Falhas de sistema de arquivos/armazenamento | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher D05.1 |
| L01 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L01.1 |
| L02 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L02.1 |
| L03 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L03.1 |
| L04 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L04.1 |
| L05 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L05.1 |
| L06 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L06.1 |
| L07 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L07.1 |
| L08 | P1-2 Falhas de ciclo de vida do app/processo | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher L08.1 |
| W01 | P2-1 Mudanças externas em Workspace / Tool | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher W01.1 |
| W02 | P2-1 Mudanças externas em Workspace / Tool | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher W02.1 |
| W03 | P2-1 Mudanças externas em Workspace / Tool | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher W03.1 |
| W04 | P2-1 Mudanças externas em Workspace / Tool | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher W04.1 |
| W05 | P2-1 Mudanças externas em Workspace / Tool | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher W05.1 |
| X01 | P2-2 Isolamento de falhas entre Sessions | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher X01.1 |
| X02 | P2-2 Isolamento de falhas entre Sessions | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher X02.1 |
| X03 | P2-2 Isolamento de falhas entre Sessions | placeholder-only | blocked | decision-needed | blocked-by-product-decision | Preencher X03.1 |
| A08 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| A09 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| A10 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| A11 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| A12 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B06 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B07 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B08 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B09 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B13 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| B14 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| B16 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| C05 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| C08 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| C09 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| D06 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| D11 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| E06 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| E08 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| F01 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| F03 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| F07 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| F09 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| G11 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| G12 | Não agrupado | missing | not-in-decision-protocol | missing | ready-to-write | Completar |
| H08 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| H09 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| H12 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| H15 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| H16 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| I43 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I44 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I45 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I46 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I47 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I48 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I49 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I50 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I51 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I52 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I53 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I54 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I56 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I57 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I58 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I59 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I60 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I61 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I62 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I63 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
| I64 | Não agrupado | missing | not-in-decision-protocol | partial | implemented | Completar |
| I65 | Não agrupado | missing | not-in-decision-protocol | planned | ready-to-write | Completar |
