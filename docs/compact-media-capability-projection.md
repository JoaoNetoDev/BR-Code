# Projeção de Capacidade de Mídia no Compact

## Problema

Uma requisição comum de modelo projeta as mensagens do histórico conforme a capacidade de entrada do modelo em
execução antes da chamada ao provider; quando `properties.input_format.support_image === false` ou
`support_pdf === false`, os blocos de mídia correspondentes são substituídos por um placeholder de texto explícito.
Embora a requisição de resumo Compact reusasse as projeções de provider-message como MCS / system-reminder, ela não
executava a projeção de capacidade de mídia, de modo que modelos somente texto falhavam com `invalid_model_request` ao
receber blocos de mídia do histórico.

## Semântica

```text
RuntimeMessageEntry do histórico
        |
        v
buildCompactSummaryRequestMessages
  - ordenação de attachment / reminder
  - projeção MCS ou <system-reminder>
  - prompt de compact e cache control
        |
        v
projeção de capacidade de mídia conforme o modelo em execução do compact
  - support_image === false -> image substituído pelo texto omitted padrão
  - support_pdf === false   -> PDF substituído pelo texto omitted padrão
  - true                    -> mídia preservada na primeira requisição
        |
        v
degradação media_too_large existente (somente nova tentativa após falha)
        |
        v
evento Compact ModelRequest e requisição ao provider
```

- Compact manual, automático e Reactive devem passar pelo mesmo limite de projeção.
- a capacidade deve ser obtida de `compactModel.properties` desta execução, sem recorrer ao modelo padrão da sessão nem
  a snapshots antigos do turn pai.
- o evento `ModelRequest` deve registrar as mensagens projetadas visíveis ao provider.
- a projeção de capacidade ocorre antes da primeira requisição; não é permitido depender de uma nova tentativa após a
  falha `invalid_model_request`.
- a semântica existente de nova tentativa por `media_too_large` permanece inalterada: quando a capacidade é `true`, a
  mídia é preservada na primeira chamada e o placeholder curto exclusivo do compact só é usado na nova tentativa, depois
  que o provider reporta explicitamente que a mídia é grande demais.
- o Compact continua usando seu próprio fallback de stream/non-stream, summary output cap, tool surface, cache-control e
  lógica de reescolha em prompt-too-long, sem passar inteiro pela função de requisição de modelo dos turns comuns.

## Aceitação

- com um modelo somente texto em Compact automático contendo imagens no histórico, não existe bloco `image` na
  requisição, há o texto padrão `Media omitted from provider request` e o Compact conclui normalmente.
- com `input_format.support_image: true`, a primeira requisição de Compact ainda preserva a imagem. Active Model
  Properties é um fato completo; não existe estado de runtime com "capacidade desconhecida".
- a projeção de capacidade de imagens e PDFs usa o helper genérico; os testes existentes de requisição em duas fases
  para `media_too_large` continuam passando.
