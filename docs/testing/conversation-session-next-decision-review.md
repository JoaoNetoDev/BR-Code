# Conversation Session Next Decision Review

Objetivo: expandir em ordem fixa os casos da área de sessão que ainda aguardam decisão de produto e, após a confirmação do
produto, reescrever o catalog, a coverage matrix e os E2E.

Comando de geração:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --review-next-md
```

## Situação atual

| Métrica | Valor atual |
| --- | ---: |
| Total de product cases | 221 |
| Já cobertos | 125 |
| Aguardando decisão de produto / automação | 36 |
| Total de questões de protocolo | 36 |
| Questões de protocolo unanswered | 36 |
| Cases Ready | 0 |
| Cases Blocked | 36 |
| Próximo lote de review | N01, N02, N03 |
| Escopo de saída atual | próximo lote de review: N01, N02, N03 |
| Cases na saída atual | 3 |

## Como usar

1. Revisar os cases na ordem deste arquivo.
2. Para cada `Question`, escrever uma conclusão de produto explícita.
3. Voltar à decision worksheet correspondente, trocar `产品结论` de `待确认` para uma conclusão explícita e mudar `Status` para `answered`.
4. Atualizar o catalog de origem / fault catalog / coverage matrix conforme `回写目标`.
5. Depois que a semântica de produto estiver clara, escrever os E2E correspondentes e, por fim, executar `pnpm audit:conversation-session-coverage`.

## Review Queue

### P0-2 Falhas de requisição de modelo/API

#### N01

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo da reescrita |
| --- | --- | --- | --- |
| N01.1 | Estado final após 401/403, guia de configuração, se a user message e a queue são preservadas | auth error、settings entry、queue snapshot | fault N01、fault coverage N01 |

#### N02

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo da reescrita |
| --- | --- | --- | --- |
| N02.1 | Se a ausência de provider/API Key é bloqueada antes do envio ou falha depois do envio, e se o draft é preservado | no network request、composer draft、settings entry | fault N02、fault coverage N02 |

#### N03

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo da reescrita |
| --- | --- | --- | --- |
| N03.1 | Estratégia de retry do 429, enfileiramento durante o retry, estado e queue após a falha final | retry count、toolbar retry、queue | fault N03、fault coverage N03 |