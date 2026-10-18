# Conversation Session Decision Answer Template

Objetivo: um template preenchível para confirmação do produto. Ao responder, mantenha a numeração de `Case` e `Question`; eu reescrevo worksheet, catalog e coverage matrix conforme a numeração e depois passo para o E2E.

Comando de geração:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --answer-template-md
```

## Estado atual

| Métrica | Valor atual |
| --- | ---: |
| Total de product case | 221 |
| Já cobertos | 125 |
| Aguardando decisão do produto / automação | 36 |
| Escopo atual do template | Próximo lote de review: N01, N02, N03 |
| Cases no template atual | 3 |

## Regras de preenchimento

1. Cada `Question` precisa de uma conclusão clara de produto; não escreva mais `待确认` ("a confirmar").
2. Se a escolha for uma opção diferente das respostas candidatas, escreva em `补充` ("complemento").
3. A conclusão precisa ser conversível em asserções estáveis de UI / rede / runtime / arquivo.
4. Se alguma pergunta for podada, explique claramente o motivo de "não é necessário cobrir".

## Answer Template

### N01

- worksheet: `networkSse`

#### N01.1

- O que precisa ser confirmado: estado final após 401/403, entrada de configurações, se user message e queue são preservados
- Respostas candidatas / palavras-chave de verificação: auth error, settings entry, queue snapshot
- Alvo da reescrita: fault N01, fault coverage N01
- Conclusão do produto:
- Complemento:

### N02

- worksheet: `networkSse`

#### N02.1

- O que precisa ser confirmado: provider/API Key ausente é bloqueado antes do envio ou falha após o envio, se o draft é preservado
- Respostas candidatas / palavras-chave de verificação: no network request, composer draft, settings entry
- Alvo da reescrita: fault N02, fault coverage N02
- Conclusão do produto:
- Complemento:

### N03

- worksheet: `networkSse`

#### N03.1

- O que precisa ser confirmado: estratégia de retry do 429, enfileiramento durante o retry, estado e queue após a falha final
- Respostas candidatas / palavras-chave de verificação: retry count, toolbar retry, queue
- Alvo da reescrita: fault N03, fault coverage N03
- Conclusão do produto:
- Complemento:

## Formato enxuto para responder diretamente

```text
N01:
- N01.1 = 

N02:
- N02.1 = 

N03:
- N03.1 = 

```