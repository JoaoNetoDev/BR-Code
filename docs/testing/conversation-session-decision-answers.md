# Conversation Session Decision Answers

Objetivo: reunir as conclusões de cases já confirmadas pelo produto. O script de auditoria só reconhece linhas como
`- F09.1 = <conclusão explícita>`; respostas vazias são contabilizadas como pending placeholder e não são tratadas como
confirmadas.

Como usar:

1. Consultar [conversation-session-next-decision-answer-template.md](./conversation-session-next-decision-answer-template.md) para ver o próximo lote de questões que precisam de confirmação prioritária.
2. Neste arquivo, trocar o trecho após o `=` correspondente pela conclusão explícita de produto.
3. Executar `pnpm audit:conversation-session-coverage`.
4. Depois que a auditoria passar, reescrever as respostas na decision worksheet / catalog / coverage matrix correspondente.

## Regras de preenchimento

- Cada questão mantém a numeração fixa; não altere identificadores como `F09.1`.
- Enquanto não houver conclusão de produto, deixe vazio o trecho após o `=`.
- Se for decidido fazer podagem, mesmo assim escreva a conclusão claramente, por exemplo: `não coberto, motivo: ...`.
- A conclusão precisa ser conversível em asserções estáveis de UI / network / runtime / file.

## P0-1 Falhas Compact

Decidido e descontinuado (2026-07-05, encerramento das decisões de M0 da refatoração v4). As conclusões item a item de
`F09.1-4 / G11.1-4 / G12.1-4` estão arquivadas na seção "Arquivo de decisões" da
[compact decision worksheet](./conversation-session-compact-decision-worksheet.md); o catalog de origem, o fault catalog, a
coverage matrix e o roadmap já foram reescritos. Esta seção não mantém mais linhas `X.Y =` para que o script de
auditoria não contabilize questões de protocolo descontinuadas como unknown.

## P0-2 Falhas de requisição de modelo/API

N01:
- N01.1 =

N02:
- N02.1 =

N03:
- N03.1 =

N04:
- N04.1 =

N06:
- N06.1 =

N07:
- N07.1 =

N08:
- N08.1 =

N09:
- N09.1 =

## P0-3 Falhas de streaming SSE

S01:
- S01.1 =

S02:
- S02.1 =

S03:
- S03.1 =

S04:
- S04.1 =

S05:
- S05.1 =

S06:
- S06.1 =

S07:
- S07.1 =

## P1-1 Falhas de filesystem/storage

D01:
- D01.1 =

D02:
- D02.1 =

D03:
- D03.1 =

D04:
- D04.1 =

D05:
- D05.1 =

## P1-2 Falhas de lifecycle/processo do App

L01:
- L01.1 =

L02:
- L02.1 =

L03:
- L03.1 =

L04:
- L04.1 =

L05:
- L05.1 =

L06:
- L06.1 =

L07:
- L07.1 =

L08:
- L08.1 =

## P2-1 Mudanças externas em Workspace / Tool

W01:
- W01.1 =

W02:
- W02.1 =

W03:
- W03.1 =

W04:
- W04.1 =

W05:
- W05.1 =

## P2-2 Isolamento de falhas entre Sessions

X01:
- X01.1 =

X02:
- X02.1 =

X03:
- X03.1 =