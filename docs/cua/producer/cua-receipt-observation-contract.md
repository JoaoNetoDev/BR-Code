# Contrato de comprovante de ação e de observação CUA

Esta spec substitui o contrato anterior de execução por delta/no_change e de
estado pós-ação visível ao model para a camada de ferramentas CUA em TypeScript.

## Contrato

Ferramentas mutantes retornam um comprovante de ação por padrão. O
`return_state` padrão é `none` para ações de ponteiro, de teclado/texto e
semânticas.

```json
{
  "action_receipt": {
    "schema_version": "zcode-cua-action-receipt-v1",
    "action_sent": true,
    "dispatch_status": "accepted",
    "retry_action": false
  }
}
```

`dispatch_status` é `accepted`, `possibly_sent` ou `not_sent`. `possibly_sent`
significa que a requisição pode já ter alcançado o despacho nativo, então o
chamador não deve reproduzir automaticamente ações não idempotentes. Um elemento
obsoleto que o Helper prova que não foi despachado retorna um comprovante de erro
com `action_sent=false`, `dispatch_status="not_sent"` e sem cura automática.

Quando `return_state="none"`, a ferramenta retorna a nota de ação mais o
comprovante e não executa nenhuma chamada `capture_app`.

Quando `return_state="compact"` ou `return_state="full"`, a ferramenta executa
exatamente uma chamada `capture_app` pós-ação com:

```json
{
  "include_screenshot": false,
  "force_full": true
}
```

O resultado continua sendo uma observação CUA completa. `compact` e `full` só
controlam quanto desse estado completo é formatado para o model.

Se a observação pós-ação opcional falhar, o comprovante é preservado e o estado é
reportado como indisponível. A ferramenta não deve reproduzir a ação.

O bloco de conteúdo do comprovante precede a árvore de acessibilidade sempre que
uma observação explícita é retornada. Essa ordenação faz parte do contrato de
segurança: um host que limita ou trunca uma árvore longa deve reter
`dispatch_status` e `retry_action=false`.

A leitura de volta do alvo deve verificar o efeito pretendido da ação exata do
controle. `AXSelected` é uma pós-condição válida para selecionar uma linha ou
alternar um controle que carrega seleção, mas não é um sinal genérico de sucesso
de `AXPress`. Em particular, um botão com menu pode expor `AXSelected=false` antes
e depois de abrir o seu menu. Esse valor inalterado não pode produzir
`target_verification_status="mismatched"`; a visibilidade do menu precisa da sua
própria pós-condição observável, caso contrário o comprovante permanece aceito sem
uma alegação de verificação do alvo.

## Fronteira de versão entre Producer e Helper

Versões misturadas de producer/Helper não são suportadas. Instalar um novo
producer precisa instalar ou substituir o Helper embutido daquele mesmo build. O
launcher do plugin fixa seu server spec padrão na versão do plugin, e a
inicialização do Helper em produção verifica o build id embutido antes do reuso. Um
Helper obsoleto é substituído na instalação/inicialização; a classificação de ação
em runtime não carrega ramos de compatibilidade para formatos de wire de Helpers
mais antigos.

## get_app_state

`get_app_state` é sempre o estado completo visível ao model. A camada de
ferramentas sempre envia `force_full=true` para `capture_app`.

Respostas `delta` e `no_change` internas do broker não são expostas como estado
executável para o model. Elas não devem publicar um `state_id` reutilizado, um
patch parcial ou uma dica de `repeat_observation`.

Uma árvore de acessibilidade completa vazia é uma observação válida. A camada de
ferramentas não executa uma nova tentativa de warmup para árvore vazia.

## Fora de escopo

Este contrato não altera a entrega exata de raster, a adjacência
imagem/image_ref, a proveniência de display completo, as checagens de dono do
WindowServer, o comportamento de overlay, a validação de topologia, as guardas de
despacho nativo ou a segurança de entrega de `possibly_sent`.

## Evidência de release

Os lanes finais de canvas e de mutação de elemento com o model no loop devem usar
o modelo de gate de model real designado na configuração do eval provider. Ambos
os lanes exigem pós-condições pertencentes à fixture e devem rejeitar despacho
nativo duplicado; um retorno MCP bem-sucedido por si só não é evidência de
release.
