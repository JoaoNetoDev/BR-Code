# API de Quota Restante do Coding Plan

Data: 2026-06-29

## Finalidade

O campo `Quota remaining` do painel de uso serve para exibir a cota restante do Coding Plan, incluindo a cota de 5 horas, a cota Weekly e a cota de MCP.

## API

```http
GET /api/monitor/usage/quota/limit
```

## Autenticação

A autenticação usa API Key.

```http
authorization: <API Key>
```

Atenção:

- O header `authorization` recebe a API Key completa diretamente.
- Não se concatena o prefixo `Bearer`.
- O painel de uso lê o provider de Coding Plan atualmente selecionado, e não a API Key do provider de modelo comum.

## Regras de correspondência dos cartões de cota

Os cartões de cota são determinados pelos campos `type`, `unit` e `number` do array `limits[]` devolvido pela interface de quota.

| Cartão do painel | Condição de correspondência |
|---|---|
| Cota de 5 horas | `type === "TOKENS_LIMIT"` e `unit === 3` e `number === 5` |
| Cota Weekly | `type === "TOKENS_LIMIT"` e `unit === 6` |
| Cota de MCP | `type === "TIME_LIMIT"` e `unit === 5` e `number === 1` |

## Exibição de porcentagem

O campo `percentage` devolvido pela interface é tratado como "porcentagem já usada".

Ao exibir a porcentagem restante, o frontend usa:

```ts
remainingPercentage = 100 - percentage;
```