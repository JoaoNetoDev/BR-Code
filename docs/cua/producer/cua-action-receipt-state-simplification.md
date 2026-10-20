# Simplificação do estado de comprovante de ação CUA

## Contrato

Ações mutáveis de elemento são operações de despacho único. Um elemento nativo
obsoleto deve retornar `action_sent=false` e pedir ao modelo que observe
novamente; a ferramenta não deve capturar uma árvore nova, encontrar um elemento
semelhante por impressão digital (fingerprint) e tentar a ação novamente.

Quando uma ação do broker é aceita ou passa a `possibly_sent`, a sessão consome
apenas o `pre_state_id` que forneceu o elemento alvo. Outros estados em cache do
mesmo app ou janela continuam utilizáveis. Não existe um bloqueio de escrita
`refresh_required` de escopo app/janela.

Um elemento nativo retornado por um hit-test de coordenadas fresco não tem
`pre_state_id`. Despachá-lo, portanto, não consome nenhum estado de
acessibilidade em cache; o escopo do app ainda é verificado de forma
independente antes do RPC da ação.

O ponteiro `strategy="auto"` tem escopo na chamada atual. Ele não lembra nem
infere um fallback futuro de evento a partir da qualidade da árvore AX. Um
fallback de AXPress semântico para clique por coordenada/evento só é permitido
quando o broker prova que a verificação de capacidade semântica não despachou
(`action_sent=false`).

## Correspondência somente leitura preservada

A correspondência por impressão digital continua disponível para consumidores
visuais de mesma captura, ou seja, o raster por app retornado por `get_app_state`
com `include_screenshot`. Esse caminho corresponde elementos dentro de um raster
já capturado e não emite uma segunda ação nativa mutável.

## Requisitos de regressão

- `accepted` e `possibly_sent` consomem apenas o `pre_state_id` referenciado.
- erros de ação com elemento obsoleto executam uma tentativa de ação nativa e
  zero retentativas de `capture_app`.
- estados de mesmo app/mesma janela com valores de `state_id` diferentes não
  são bloqueados por uma ação anterior.
- `strategy="auto"` mantém a estratégia solicitada, a menos que a resposta
  atual do broker prove um fallback de capacidade sem despacho.
