# Formato de Entrada e Saída do Model

## Status

- Este documento é a especificação factual de destino do formato de entrada e saída do Model dentro
  do Provider Refactor.
- Camadas de mudança: `option-source + validation + persistence + commit-effect`.
- Este documento cobre o array `modalities` do design anterior, os campos achatados
  `supportsImages` / `supportsPdf` / `supportsVideo` e a projeção independente de capability de
  mídia do Runtime.

## Única Estrutura Factual

Config, Registry, Model, Runtime e o protocolo entre processos compartilham os mesmos nomes de
campo e a mesma estrutura de aninhamento:

```ts
interface ModelInputFormat {
  support_text: boolean;
  support_image: boolean;
  support_video: boolean;
  support_audio: boolean;
  support_pdf: boolean;
}

interface ModelOutputFormat {
  support_text: boolean;
}

interface ModelProperties {
  input_format: ModelInputFormat;
  output_format: ModelOutputFormat;
  // 其他既有 Model Properties 保持原有职责。
}
```

Esses nomes em snake_case são os nomes reais do Schema; não são convertidos para camelCase no Runtime
nem projetados em outro conjunto de campos `supports*`.

## Regra de Config e Overlay

As ZCode Built-in Model Config Rules e as Personal Model Config Rules usam a mesma estrutura. Uma
regra pode declarar apenas os campos folha que precisa sobrescrever; os campos aninhados são
sobrepostos folha a folha, e as regras Personal são anexadas depois das regras Built-in:

```text
ZCode Built-in Model Config Rules ─┐
                                    ├─ resolve against Effective Provider Config
Personal Model Config Rules ────────┘
                                              |
                                              v
                                  Effective Model Config
```

Semântica de três estados para os campos folha de uma regra:

```text
undefined -> esta camada não tem opinião
false     -> esta camada desativa explicitamente
true      -> esta camada ativa explicitamente
null      -> limpeza explícita; se ainda estiver ausente ao final, a validação de completude falha
```

As regras Built-in genéricas são responsáveis por fornecer os fatos padrão completos, e as regras de
modelo específicas guardam apenas as diferenças. O Effective Model Config deve formar um
`input_format` e um `output_format` completos; o Registry não aceita Models com campos folha
ausentes.

### Limite entre Regra Esparsa e Fato Completo de Execução

O `undefined/null` de uma regra expressa apenas uma instrução de overlay e não constitui um terceiro
valor para uma Model Property:

```text
Sparse Built-in / Personal Rule
          |
          | resolve + validateComplete
          v
Effective Model Config
          |
          v
Registry / Protocol / Active Model / Runtime / Adapter
└─ support_* só pode ser true ou false
```

Depois que a validação de completude passa, não é mais permitido propagar `properties?`,
`input_format?`, `support_*` opcional ou "capability desconhecida" para o downstream. Campo ausente é
erro de Config, e Registry, Protocol Mapper, Settings Draft, Runtime ou Adapter não podem completá-lo
com `?? true` / `?? false`. O tipo de Model publicado pelo Registry deve expressar estaticamente essa
completude, para que o downstream não precise repetir `requireCompleteProperties()` nem o branch de
compatibilidade "só envia Properties quando todos os campos estiverem presentes".

Isso não afeta o `unknown` de availability da Account, o `unknown` de TypeScript usado em valores
JSON abertos, nem cancela a sobrescrita esparsa das Personal Rules. O importer legacy de uso único só
pode converter em Personal Rule os fatos de formato explicitamente declarados no arquivo antigo;
campos não declarados no arquivo antigo não recebem Override e continuam herdando a regra Built-in
genérica. O Importer não pode adicionar defaults específicos da migração, nem adivinhar capabilities
por Catalog, modelId, tipo de Provider ou Endpoint; se após o Overlay ainda estiver incompleto, a
migração falha.

`validateComplete()` é responsável por produzir diagnósticos de completude para o Settings Preview;
antes de publicar, o Registry ainda deve passar pela fronteira de estreitamento de tipo
`requireComplete`. O resultado bem-sucedido tem Properties completas no tipo estático, e candidatos
com falha permanecem apenas em Settings/diagnostics, sem entrar no Registry. O nome da função pode
ser definido pela implementação, mas ela não pode continuar representando o resultado validado pelo
mesmo tipo esparso `ModelConfig`.

Não se adiciona `modalitiesConfigured`. O `modalities.input/output` de configurações publicadas pela
versão antiga só pode ser convertido pelo importer legacy de uso único; o formato intermediário
achatado `supportsImages` / `supportsPdf` / `supportsVideo` não publicado não é aceito como entrada
de compatibilidade do novo Provider Config.

## Model e Runtime

```text
Effective Model Config
        |
        v
ModelFactory
        |
        v
Active Model.properties
        |
        +--> Verificação de entrada do Core / projeção de mídia
        +--> Compact / Memory / Child Agent
        +--> Verificação de requisição e codificação de protocolo do Adapter
```

O ModelFactory fixa as Properties completas do Effective Model Config em um Active Model imutável.
Requisições normais, Compact, Memory, Agents filhos e turnos ociosos leem
`properties.input_format` do Active Model desta rodada, sem reinferir a partir da configuração padrão
da Sessão, do Catalog ou do modelId.

Quando um caminho assíncrono precisa congelar os fatos da rodada, é preferível manter o Active Model;
quando não for possível manter o objeto de execução, guarda-se um snapshot imutável de `properties`
com a mesma estrutura. O snapshot apenas congela o ciclo de vida e não cria novos campos de domínio.

Os seguintes conceitos de período de migração não pertencem à arquitetura de destino:

- `ModelInputMediaCapabilities`;
- `modelInputMediaCapabilities` do Runtime Config;
- Campos achatados de capability de mídia do Turn;
- Map `inputMediaCapabilities` guardado no AI SDK Registry por `providerId/modelId`;
- Helpers de Runtime que completam o formato de entrada a partir do Catalog, do tipo de Provider, da
  URL ou de um modelId específico.

A capacidade de implementação de protocolo do Adapter continua sendo uma restrição independente. Por
exemplo, `support_video` indica que o modelo aceita Video, mas não significa que qualquer Adapter já
consiga codificar Video; uma requisição real deve satisfazer simultaneamente a Model Property e o
limite de implementação do Adapter de destino.

## Limites de Formato

| Formato       | Config / Model / Runtime | Página de configurações | Comportamento nesta rodada                                  |
| ------------- | ------------------------ | ----------------------- | ---------------------------------------------------------- |
| Text input    | suportado                | exibição fixa, não desativável | participa da verificação da requisição                |
| Image input   | suportado                | alternável              | participa das verificações e codificações de mídia existentes |
| Video input   | suportado                | alternável              | participa das verificações de mídia existentes; ainda sujeito ao limite de codificação do Adapter |
| Audio input   | suportado                | não exibido             | nesta rodada não há nova projeção de bloco de conteúdo, entrada de anexo nem codificação de Provider |
| PDF input     | suportado                | alternável              | participa das verificações e codificações de mídia existentes |
| Text output   | suportado                | exibição fixa, não desativável | é hoje o único formato de saída                       |

Nesta rodada não são adicionados campos de saída de Image, Video, Audio ou PDF.

## Página de Configurações e Protocolo

O rascunho da página de configurações mantém `input_format` / `output_format` diretamente. Os
controles visíveis alteram apenas Text, Image, Video e PDF; ao salvar qualquer outro campo ou ao
alternar um formato visível, o Audio oculto deve ser preservado exatamente como está. O resultado do
salvamento forma uma Personal Model Config Rule esparsa, e campos ocultos não tocados não devem ser
gravados como valores de override.

O Draft é inicializado a partir das Properties Efetivas completas retornadas pelo Service. A página
de configurações não pode, por causa de campo ausente, preencher por conta própria Text=`true` ou
outro formato=`false`; uma Config incompleta deve ser exibida como um problema de validação
autoritativo.

A transmissão entre processos de informações de Model usa as mesmas Properties aninhadas, e não
transmite mais os campos achatados `supportsImages` / `supportsPdf` / `supportsVideo`. Uma Model
Option comum e selecionável deve carregar Properties completas; diagnósticos de não selecionabilidade,
como conflitos, usam um branch de status explícito e não podem usar `properties = undefined` para
sugerir capability desconhecida. A serialização é comportamento de transporte e não constitui um
segundo fato de capabilities.

O marcador Vision existente é apenas uma projeção de exibição de uma Model Property e não participa
da admissão do Registry, de decisões do Runtime, da seleção de modelos ou da autoridade de
persistência. Provider Settings é a única entrada de edição de formato; a barra de ferramentas do
chat, automações, Subagent e Repo Wiki continuam lendo apenas os fatos do modelo.

## Limites de Cliente e Estado

- As páginas de configurações de Desktop, Web e celular usam o mesmo contrato de Service.
- Esta rodada não altera a relação de autoridade de Provider Config entre Environment local e remoto.
- Esta rodada não altera desktop continuous, mobile replayable, filas de tarefas, owner / lease nem
  a semântica de recuperação.
- Atualizações de Config afetam apenas Models criados posteriormente; um Active Model já criado
  permanece imutável.

## Tabela de Impacto

| Nível          | Relação                                       | Motivo                                                          |
| -------------- | --------------------------------------------- | --------------------------------------------------------------- |
| must-inspect   | Provider Config / Model Rules -> Registry    | nova entrada autoritativa de Schema e de validação de completude |
| must-inspect   | Registry -> ModelFactory -> Active Model     | as Properties devem ser fixadas tal como estão e não reinferidas |
| must-inspect   | Active Model -> Core / Adapter               | consumidor de execução após remover a cópia de capability do Runtime |
| must-inspect   | Provider Settings -> Personal Model Rules    | modificação de campos visíveis e preservação de campos ocultos  |
| should-inspect | Model option protocol / remote runtime       | a mesma estrutura aninhada é usada entre processos              |
| invariant-only | Queue / replay / workspace identity          | esta rodada não pode alterar o estado existente nem a semântica de recuperação |

## Casos de Aceitação

1. A regra Built-in completa e a regra Personal esparsa são mescladas folha a folha, e a Personal
   sobrescreve apenas os formatos explicitamente declarados.
2. Quando falta qualquer folha de formato obrigatória no Effective Model, a validação de completude do
   Registry falha.
3. O Model criado pelo Registry mantém as Effective Properties tal como estão; atualizações de
   configuração não modificam Models já criados.
4. Requisições normais, Compact, Memory, Agents filhos e modelos ociosos leem as Model Properties
   desta rodada e não herdam fatos de mídia de outro modelo.
5. A permissão e a recusa de Image, PDF e Video são consistentes no caminho generate/stream; Video
   não pode contornar as limitações de codificação do Adapter.
6. O campo Audio pode sofrer overlay, ser salvo, transmitido e lido, mas não gera requisições de
   Audio não implementadas.
7. A página de configurações exibe Text/Image/Video/PDF input e Text output; após a edição, o Audio
   oculto permanece inalterado.
8. O `modalities` legacy só é convertido pelo importer quando o arquivo antigo o fornece
   explicitamente; o Schema oficial de Config rejeita os campos achatados antigos, e o importer não
   adivinha defaults para fatos ausentes.
9. O protocolo local e o remoto carregam as mesmas Properties; o comportamento de desktop continuous
   e mobile replayable não muda.
10. Após o Effective Config, todo `support_*` é boolean obrigatório; não existe capability opcional
    nem fallback `?? true/false` em UI, Protocol, Runtime e Adapter.