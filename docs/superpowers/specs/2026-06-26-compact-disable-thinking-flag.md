# Controle de Thinking no Compact

## Contexto

O compact summary é uma requisição auxiliar de saída curta. O runtime decide, por meio de `ENABLE_COMPACT_SUMMARY_THINKING`, se repassa ao compact as providerOptions de reasoning/thinking da conversa principal. Essa flag controla apenas se o summary usa thinking; o fixed thinking da Anthropic e a saída visível continuam compartilhando o orçamento total da requisição do compact, e o adapter limita o thinking oversized dentro da requisição atual, sem modificar a configuração da conversa principal.

## Comportamento

- Quando `ENABLE_COMPACT_SUMMARY_THINKING` é `false`, a requisição de compact summary desabilita as providerOptions de thinking/reasoning herdadas.
- Quando `ENABLE_COMPACT_SUMMARY_THINKING` é `true` (padrão atual), o compact continua repassando as `modelProviderOptions` vigentes; o fixed thinking da Anthropic permanece sujeito ao orçamento total desta requisição.
- Requisições não compact — conversa comum, subagent, geração de título, etc. — não são afetadas por essa flag.

## Escopo

Aqui está sendo controlado apenas se a requisição de compact summary herda providerOptions de reasoning/thinking; não cabe a isso a restrição do orçamento total da requisição, nem a alteração do prompt do compact, da seleção de histórico, da exibição do compact divider na UI ou da configuração de reasoning das requisições comuns de modelo.