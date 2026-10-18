# Merge de metadata de configuração de Model Provider

## Contexto

A fonte autoritativa de model provider no lado do App é o campo `provider` de
`~/.zcode/v2/config.json`. Esse arquivo pode vir de migração de versões antigas, sincronização
remota, edição manual do usuário ou gravação pela página de configurações. O metadata de modelo
que o usuário configurou explicitamente precisa ser preservado; o catálogo local serve apenas para
completar fatos ausentes.

## Design

`packages/services/src/model-provider/modelProviderServiceStorage.ts`, após ler
`~/.zcode/v2/config.json`, primeiro converte a configuração do provider para o
`ModelProviderConfig` interno e só então executa o merge de metadata do catálogo.

As regras de merge são unificadas como fill-only:

- Quando o usuário já configurou `model.limit.context`, o valor é preservado e o `contextWindow`
  do catálogo não pode sobrescrevê-lo.
- O App já normaliza o context antes do merge do catálogo: valores ausentes ou inválidos usam o
  padrão de 200K, o mesmo dos modelos novos, e o sufixo `[1m]` usa 1M; o catálogo não participa
  mais da sobrescrita nem do preenchimento de context.
- Quando o usuário já configurou `model.limit.output`, o valor é preservado e o `maxOutputTokens`
  do catálogo não pode sobrescrevê-lo.
- Quando o usuário não configurou a capacidade de saída, o catálogo pode complementar
  `maxOutputTokens`.
- `128K` e `200K` também podem ter sido configurados explicitamente pelo usuário; como o formato
  de armazenamento não registra a origem do valor, é proibido adivinhar com base apenas no número
  que ele é um fallback histórico e substituí-lo. Configurações de mesmo valor escritas
  automaticamente por versões antigas também são preservadas, evitando que a migração prejudique
  valores do usuário.
- Os demais metadados continuam seguindo as regras conservadoras existentes de preenchimento e
  migração.
- Depois que metadados ausentes são preenchidos, o fluxo de persistência existente de
  `writeProviderStoreFile` permanece inalterado.

A fonte de dados de preenchimento atual é
`models_catalog_china_llm_zcode_2026-06-03.json`, na raiz do repositório. O
`apps/zcode-cli/api.json` / models-dev snapshot não participa do catalog merge do App config.

## Prioridade de configuração

```text
context: config do provider do usuário > normalização de context do App (padrões [1m] / 200K)
output:  config do provider do usuário > maxOutputTokens do catálogo > fallback de runtime 32K
```

Essa prioridade também determina o orçamento de saída em nível de modelo usado nas requisições
normais; o fallback para 32K ocorre apenas quando o valor do modelo está completamente ausente. O
adapter não aplica mais um limite global independente de requisição, conforme a
[política de limite de tokens de saída das requisições de modelo](./model-request-output-tokens.md).

## Verificação

- Com `limit.output = 131072` no config e catalog 64000, o valor retornado pelo service e a
  configuração persistida mantêm 131072.
- Sem `limit.output` no config e catalog 64000, o service pode preencher e persistir 64000 pelo
  fluxo existente.
- Com `limit.context = 128000` ou `200000` no config e catalog 1000000, o valor retornado pelo
  service e a configuração persistida mantêm o valor do usuário.
- Sem `limit.context` no config e catalog 1000000, o service ainda persiste 200000 conforme as
  regras de normalização do App; modelos `[1m]` continuam persistindo 1000000.
- Modelos customizados que não estão no catálogo mantêm o valor original do usuário.
- O caminho de migração do antigo `model-providers.json` e a semântica de preenchimento dos campos
  não relacionados a output permanecem inalterados.