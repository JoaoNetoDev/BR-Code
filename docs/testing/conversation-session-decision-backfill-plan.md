# Conversation Session Decision Backfill Plan

Objetivo: converter as conclusões de produto já preenchidas no rascunho de answers em uma lista de retornos (backfill). Aqui não se modifica automaticamente o catálogo/cobertura; apenas se listam os fatos a devolver no próximo passo.

Entrada de answers: `docs/testing/conversation-session-decision-answers.md`

Comando de geração:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --backfill-plan-md
```

## Estado Atual

| Métrica | Valor atual |
| --- | ---: |
| Answered questions | 0 |
| Pending placeholders | 36 |
| Missing question rows | 0 |
| Ready-to-backfill cases | 0 |
| Placeholder-only cases | 36 |
| Partial cases | 0 |
| Missing cases | 0 |

## Ready To Backfill

Nenhum case pronto para backfill ainda. Preencha todas as perguntas de um case em `conversation-session-decision-answers.md` primeiro.

## Incomplete Cases

| Case | Status | Answered | Pending placeholder | Missing | Próxima ação |
| --- | --- | ---: | ---: | ---: | --- |
| N01 | placeholder-only | 0/1 | 1 | 0 | Preencher N01.1 |
| N02 | placeholder-only | 0/1 | 1 | 0 | Preencher N02.1 |
| N03 | placeholder-only | 0/1 | 1 | 0 | Preencher N03.1 |
| N04 | placeholder-only | 0/1 | 1 | 0 | Preencher N04.1 |
| N06 | placeholder-only | 0/1 | 1 | 0 | Preencher N06.1 |
| N07 | placeholder-only | 0/1 | 1 | 0 | Preencher N07.1 |
| N08 | placeholder-only | 0/1 | 1 | 0 | Preencher N08.1 |
| N09 | placeholder-only | 0/1 | 1 | 0 | Preencher N09.1 |
| S01 | placeholder-only | 0/1 | 1 | 0 | Preencher S01.1 |
| S02 | placeholder-only | 0/1 | 1 | 0 | Preencher S02.1 |
| S03 | placeholder-only | 0/1 | 1 | 0 | Preencher S03.1 |
| S04 | placeholder-only | 0/1 | 1 | 0 | Preencher S04.1 |
| S05 | placeholder-only | 0/1 | 1 | 0 | Preencher S05.1 |
| S06 | placeholder-only | 0/1 | 1 | 0 | Preencher S06.1 |
| S07 | placeholder-only | 0/1 | 1 | 0 | Preencher S07.1 |
| D01 | placeholder-only | 0/1 | 1 | 0 | Preencher D01.1 |
| D02 | placeholder-only | 0/1 | 1 | 0 | Preencher D02.1 |
| D03 | placeholder-only | 0/1 | 1 | 0 | Preencher D03.1 |
| D04 | placeholder-only | 0/1 | 1 | 0 | Preencher D04.1 |
| D05 | placeholder-only | 0/1 | 1 | 0 | Preencher D05.1 |
| L01 | placeholder-only | 0/1 | 1 | 0 | Preencher L01.1 |
| L02 | placeholder-only | 0/1 | 1 | 0 | Preencher L02.1 |
| L03 | placeholder-only | 0/1 | 1 | 0 | Preencher L03.1 |
| L04 | placeholder-only | 0/1 | 1 | 0 | Preencher L04.1 |
| L05 | placeholder-only | 0/1 | 1 | 0 | Preencher L05.1 |
| L06 | placeholder-only | 0/1 | 1 | 0 | Preencher L06.1 |
| L07 | placeholder-only | 0/1 | 1 | 0 | Preencher L07.1 |
| L08 | placeholder-only | 0/1 | 1 | 0 | Preencher L08.1 |
| W01 | placeholder-only | 0/1 | 1 | 0 | Preencher W01.1 |
| W02 | placeholder-only | 0/1 | 1 | 0 | Preencher W02.1 |
| W03 | placeholder-only | 0/1 | 1 | 0 | Preencher W03.1 |
| W04 | placeholder-only | 0/1 | 1 | 0 | Preencher W04.1 |
| W05 | placeholder-only | 0/1 | 1 | 0 | Preencher W05.1 |
| X01 | placeholder-only | 0/1 | 1 | 0 | Preencher X01.1 |
| X02 | placeholder-only | 0/1 | 1 | 0 | Preencher X02.1 |
| X03 | placeholder-only | 0/1 | 1 | 0 | Preencher X03.1 |

## Missing Cases

nenhum