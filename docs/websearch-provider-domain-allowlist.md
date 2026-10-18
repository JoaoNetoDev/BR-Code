# Allowlist de Domínios do Provider WebSearch

## Contexto

O WebSearch inicia requisições internas ao modelo por meio da ferramenta `web_search` nativa do provider. Nem todos os endpoints compatíveis com Anthropic suportam essa ferramenta do lado do servidor, portanto o runtime só expõe `WebSearch` em domínios de fornecedor já confirmados.

## Regras

- O WebSearch só é habilitado para conexões com `providerKind === "anthropic"`.
- A correspondência de domínio se baseia no hostname do `baseURL`, e não no id do provider nem no nome do modelo.
- Os domínios raiz e todos os subdomínios de `bigmodel.cn`, `z.ai`, `deepseek.com`, `z.ai` são permitidos.
- Por exemplo, `bigmodel.cn` já é coberto pela regra de subdomínio `bigmodel.cn`; `zcode.z.ai` é coberto pela regra de subdomínio `z.ai`.

## Superfície de Impacto

Isso afeta apenas a exposição de tools no lado do agent e a projeção do WebSearch nativo do provider; não altera a cadeia contínua do desktop, a semântica de restauração replayable do celular, nem a resolução de endpoint das requisições comuns de modelo.