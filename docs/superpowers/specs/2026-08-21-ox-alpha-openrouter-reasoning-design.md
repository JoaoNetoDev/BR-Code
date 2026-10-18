# Design de adaptação de reasoning OpenRouter para a série ox-alpha

> **Fechamento M3 em 2026-08-22:** este documento registra o contexto de design anterior à
> integração em staging. A implementação atual não consome mais
> `/client/configs.magic_name` nem constrói estratégias de reasoning por ID de modelo específico
> no código-fonte; o comportamento efetivo já foi escrito nas
> Regras de Configuração de Modelos Built-in do ZCode e é serializado pelo Adapter genérico. Em
> caso de conflito, prevalece
> `docs/working-memory/provider-refactor/steps/03-staging-integration.md`.

## Contexto

`ox-alpha`, `GLM-x-preview-f` e `x-preview-f-free` são IDs públicos do mesmo modelo multimodal
confidencial roteado pelo OpenRouter. O produto apenas expõe e persiste o ID que o usuário
realmente configurou, e não deve registrar o nome real do modelo subjacente em código-fonte,
configuração, logs ou documentação, nem reescrever requisições entre esses IDs públicos.

As configurações de modelo já oferecem janela de contexto, máximo de tokens de saída e
configuração de tipos de entrada/saída, portanto esta adaptação não adiciona valores padrão
exclusivos de context, output, modalidade, tool call ou structured output para esses IDs
públicos. Valores ausentes continuam usando as configurações existentes e o fallback genérico do
runtime; o tipo de entrada é declarado explicitamente pelo usuário ou por fatos remotos
autoritativos.

Atualmente, modelos desconhecidos caem para um toggle de thinking genérico
`enabled` / `disabled` tanto no transporte OpenAI-compatible quanto no Anthropic. Esses IDs na
verdade suporta três níveis, `low` / `high` / `max`, com padrão
`max`, e exigem reconstruir a capability de reasoning conforme o transporte real depois que a
identidade do modelo é detectada.

Outro ID público, não determinado previamente, é entregue dinamicamente por
`data.configs.magic_name` em `/api/v1/client/configs`. Esse campo hoje é uma string comum: em
testes ele entrega `GLM-Flash` e em produção entrega string vazia. O cliente não pode
hardcodar esses dois valores de ambiente, apenas consome os fatos do servidor.

## Semântica de produto confirmada

- O ID do modelo casa quando contém `ox-alpha` sem diferenciar maiúsculas/minúsculas; path de
  provider, prefixos e sufixos são permitidos.
- Cada letra de `GLM-x-preview-f` é insensível a maiúsculas/minúsculas; path de provider é
  permitido, mas o último segmento do path precisa ser exatamente `glm-x-preview-f`, sem
  prefixos ou sufixos extras.
- `x-preview-f-free` usa as mesmas fronteiras de casamento de `GLM-x-preview-f`: insensível a
  maiúsculas/minúsculas, permite path de provider, mas o último segmento do path precisa ser
  exatamente `x-preview-f-free`, sem prefixos ou sufixos extras.
- `magic_name` é tratado como expressão regular JavaScript: após trim, se vazio, não habilita
  nada; quando não vazio, é compilado com as flags `iu`. Uma expressão pode casar vários nomes
  com `|`; se a sintaxe for inválida, o matcher é ignorado e não bloqueia a sincronização do
  Provider.
- O usuário pode escolher `low`, `high`, `max`, com padrão `max`.
- OpenAI-compatible Chat Completions: mapeia para
  `openaiCompatible.reasoningEffort`, cujo wire final é `reasoning_effort`.
- Anthropic Messages: mapeia para `anthropic.thinking.type="adaptive"` e
  `anthropic.effort`, cujo wire final é `thinking.type="adaptive"` e
  `output_config.effort`.
- Anthropic não envia `thinking.budget_tokens` e não reutiliza o orçamento fixo da API oficial
  do GLM-5.3.
- OpenAI Responses atualmente não habilita mapeamento de reasoning exclusivo para esses IDs,
  evitando enviar por engano a option `openaiCompatible` de Chat Completions.
- O ID do modelo original não é reescrito na requisição final.
- Nenhuma política padrão exclusiva de context, max output, modalidade, tool call, structured
  output ou temperature é adicionada para esses IDs.

## Mapeamento de requisição

```text
modelId matches a built-in pattern
or carries reasoningProfile="ox-alpha" from magic_name matching
        |
        v
reasoning levels = low / high / max
default = max
        |
        +-- openai-compatible
        |      `-- openaiCompatible.reasoningEffort
        |                  `-- wire: reasoning_effort
        |
        `-- anthropic
               +-- anthropic.thinking.type = adaptive
               `-- anthropic.effort
                           `-- wire: output_config.effort
```

| Nível de UI | Wire OpenAI-compatible     | Wire Anthropic Messages                                    |
| ----------- | -------------------------- | --------------------------------------------------------- |
| `low`       | `reasoning_effort="low"`   | `thinking.type="adaptive"`, `output_config.effort="low"`  |
| `high`      | `reasoning_effort="high"`  | `thinking.type="adaptive"`, `output_config.effort="high"` |
| `max`       | `reasoning_effort="max"`   | `thinking.type="adaptive"`, `output_config.effort="max"`  |

## Limites de implementação

1. Shared usa `OX_ALPHA_REASONING_MODEL_ID_PATTERNS` para guardar as regras de regex embutidas, e
   `isOxAlphaReasoningModelId` decide via `some(test)` se alguma regra casa; o chamador pode
   passar regex remotos adicionais compilados a partir de `magic_name`, sem criar uma função de
   julgamento separada para cada ID público.
2. A política de reasoning oferece duas factories, OpenAI-compatible e Anthropic; apenas os
   níveis e o padrão são compartilhados, as options de provider ficam separadas por transporte.
3. A política de modelo padrão apenas completa a capability de reasoning e atua como
   sobrescrita final de reasoning depois das regras amplas de família de modelo; não carrega
   valores de capability como context/output/media.
4. O modelo configurado via CLI standalone reconhece todos os IDs públicos embutidos antes do
   toggle genérico de thinking.
5. Mesmo que um dynamic provider emitido pelo App não tenha metadata de reasoning, ou carregue
   `enabled` / `disabled` desatualizado, o workspace overlay ainda reconstrói os três níveis
   conforme a identidade unificada de reasoning.
6. As modalidades continuam sendo lidas de `ModelProviderModelConfig.modalities`; não entram no
   fallback de mídia sensível a provider do GLM.
7. O serviço model-provider constrói um matcher adicional a partir de
   `client/configs.data.configs.magic_name`; modelos remotos que casam são marcados com o perfil
   estável `reasoningProfile="ox-alpha"`. Esse perfil é persistido junto com a configuração do
   modelo e projetado ao Agent pelo protocolo existente do provider registry; o Agent ainda
   reconstrói as options de provider conforme o transporte real dentro do workspace dynamic
   overlay.
8. `magic_name` afeta apenas os modelos remotos entregues na mesma `client/configs`; não altera
   providers criados pelo usuário, não reescreve model ID e não adiciona requisição de rede
   independente, singleton global ou estado de regex mutável entre processos.
9. `reasoningProfile` é um fato autoritativo do modelo remoto: quando uma sincronização posterior
   deixa de casar com `magic_name`, o perfil persistido anteriormente precisa ser limpo, sem
   ser repovoado por configuração local antiga ou por uma versão anterior do `zcode`. Modelos
   locais já modificados pelo usuário continuam sob a proteção `modified` existente e não
   aceitam sobrescrita remota; não há migração, a próxima sincronização autoritativa conserta
   os dados antigos.
10. O código de runtime de produção não embute literalmente as strings dos IDs públicos
    confidenciais acima nem adiciona constantes de token semânticas correspondentes; os tokens de
    casamento embutidos são construídos em runtime com numeração neutra e códigos de caractere.
    Comentários em português podem explicar a qual família de modelo cada número corresponde,
    facilitando a manutenção. Essa restrição vale apenas para varredura textual ingênua de
    código-fonte estático/artefatos de build, e não altera `modelId` no protocolo, o
    `magic_name` remoto ou os valores reais enviados ao fornecedor.

## Fora de escopo

- Não usar `ox-alpha` como alias de GLM-5.3.
- Não incluir no catálogo público models.dev nem no catálogo de modelos da China.
- Não registrar automaticamente provider OpenRouter, API Key, entitlement ou modelo padrão.
- Não modificar os valores padrão de context/output/type da página de configurações.
- Não estender o protocolo de anexos de runtime para áudio/vídeo/PDF.
- Não alterar a semântica de seleção de modelo, session, task, desktop continuous ou web remote
  replayable.
- Não inferir parâmetros de reasoning não confirmados para OpenAI Responses.
- Não suportar que o servidor entregue o padrão embrulhado em `/pattern/flags` no corpo da
  string; `magic_name` representa apenas a origem do padrão, e o cliente usa sempre as flags `iu`.

## Testes

- shared matcher: uma lista de regex classificada por “qualquer casamento”; `ox-alpha` mantém
  semântica de maiúsculas/minúsculas, path de provider, prefixos e sufixos;
  `GLM-x-preview-f` e `x-preview-f-free` cobrem tudo em minúsculas, tudo em maiúsculas, caixa
  mista e path de provider, rejeitando IDs aproximados; regex remotos adicionais podem casar
  um ou vários nomes remotos.
- remote config: `magic_name="GLM-Flash|x-preview-f-free"` casa, sem diferenciar
  maiúsculas/minúsculas, com qualquer um dos modelos remotos; valor em branco, valor ausente e
  regex inválido não definem profile.
- persistence/protocol: `reasoningProfile` é preservado na gravação da sincronização pré-
  configurada, na leitura de volta e após a projeção pelo provider registry; quando o remoto
  depois retira o casamento, o valor de retorno e a configuração persistida limpam o profile
  antigo, preservando os modelos locais `modified`.
- default policy: gera apenas reasoning; não gera context, max output nem capability de
  image/PDF.
- reasoning factory: três níveis, padrão `max`, namespace correto das options de provider.
- wire OpenAI-compatible: cada um dos três níveis gera `reasoning_effort` no topo, sem gerar
  `thinking`.
- wire Anthropic: cada um dos três níveis gera `thinking.type=adaptive` e
  `output_config.effort`, sem gerar `thinking.budget_tokens` nem `reasoning_effort`.
- standalone config: tanto Anthropic quanto OpenAI-compatible reconstroem os três níveis.
- configured wire: a partir de um `GLM-x-preview-f` em caixa mista na config, sintetiza a
  capability e entra na requisição final do AI SDK, afirmando também que o model ID original
  foi preservado.
- workspace dynamic overlay: tanto a ausência de metadata quanto um toggle desatualizado
  reconstroem os três níveis, mantendo o modelo original e
  context/output/modalities inalterados.

## Resumo de impacto

### Resumo de funcionalidades

| Campo            | Valor                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Adicionar, para os IDs públicos embutidos e para os IDs remotos que casam com `client/configs.magic_name`, um mapeamento de níveis de reasoning específico por transporte, com casamento unificado por múltiplas regex |
| Capability       | Model capabilities / provider runtime config                                                                            |
| Camada de mudança     | option-source, validation, commit-effect                                                                                |
| Modo de operação   | planning / implementation                                                                                               |
| Seeds principais    | shared matcher, remote client configs, provider persistence/protocol, workspace catalog overlay                         |
| Fora de escopo     | padrões de context/output/media, seleção de modelo na UI, session/replay                                                |

### Matriz de superfícies de UI

| Cenário do usuário             | Entrada de UI                | Implementação compartilhada  | Dono de exibição/rascunho | Origem do padrão/herança | Validação/bloqueio            | Ação de commit                | Autoridade/persistência              | Limite de modo                      | Deve permanecer isolado de                     |
| ------------------------------ | --------------------------- | ---------------------------- | -------------------------- | ------------------------ | ------------------------------ | ----------------------------- | ------------------------------------- | ------------------------------------ | -------------------------------------------- |
| Escolher o nível de pensamento de um ID público na conversa | seletor compartilhado de modelo/pensamento | model capability reasoning levels | session model config | padrão do CLI overlay: `max` | o nível deve pertencer a low/high/max | switch de model/thought já existente | session runtime + provider config     | desktop/web reutilizam a cadeia já existente | commit de context/output/media e de outras surfaces |

### Relações entre funcionalidades

| Rank           | De                     | Aresta semântica             | Para                          | Condição         | Por que inspecionar                        | Evidência           |
| -------------- | ---------------------- | ---------------------------- | ----------------------------- | ---------------- | ----------------------------------------- | ------------------- |
| must-inspect   | shared model identity   | classifica                   | CLI config + workspace overlay | casa com qualquer ID público | as duas entradas precisam ser consistentes    | matcher tests       |
| must-inspect   | thought level           | projeta para                | provider request options      | low/high/max     | o namespace de transporte não pode ser misturado | wire tests          |
| should-inspect | default policy          | fornece reasoning ausente a  | standalone CLI catalog        | metadata ausente | não pode completar outras capabilities junto | adapter tests       |
| invariant-only | model settings metadata | deve permanecer isolado de  | shared reasoning matcher      | todos os transportes | config de context/output/type do usuário não é sobrescrito | negative assertions |
| invariant-only | provider registry       | não deve mutar              | session/replay semantics      | todos os clients | apenas estende metadata de modelo, sem alterar a máquina de estados de mensagens | diff review         |

### Donos de estado e sinks de commit

| Estado/fato              | Dono de rascunho/exibição | Dono autoritativo     | Comando/serviço de commit     | Persistência/cache     | Evidência                    |
| ------------------------ | ------------------------- | --------------------- | ----------------------------- | ---------------------- | ---------------------------- |
| candidatos de nível de reasoning | shared model UI       | CLI capability overlay | session model config já existente | runtime catalog      | adapter/bootstrap tests     |
| nível de thought atual   | composer/session           | session runtime        | thought switch já existente   | session settings       | existing model switch tests |
| context/output/types      | model settings draft       | provider registry      | model provider service        | config.json            | invariant-only              |
| `magic_name`              | remote client/configs      | model-provider service  | preset sync                   | config-version cache   | service tests               |
| reasoning profile         | none (fato oculto)        | remote model config    | provider registry             | config.json            | storage/protocol tests      |

### Invariantes que precisam ser preservados

| Invariante                                          | Superfícies/modos        | Prova necessária        | Evidência            |
| --------------------------------------------------- | ------------------------ | ----------------------- | -------------------- |
| apenas low/high/max, com padrão max                 | todos os seletores de modelo | igualdade de capability | unit/integration   |
| os dois transportes usam seus próprios namespaces   | request runtime          | corpo final do wire     | wire tests          |
| o model ID original não é reescrito                 | todas as requisições    | catalog key/request model | bootstrap/wire tests |
| não completa context/output/media                    | settings/CLI/runtime    | ausência de defaults    | default-policy test |
| `magic_name` vazio não casa com nenhum modelo        | production config       | nenhum reasoning profile | service tests      |
| retirar o casamento remoto limpa o reasoning profile antigo | provider refresh   | estado retornado + persistido | service tests  |
| modelos locais `modified` não são afetados pela retirada remota | provider refresh | branch local preservado | service tests |
| desktop continuous e mobile replayable inalterados   | todos os clients        | sem diff de protocolo/estado | diff review    |

### Evidência de codegraph

O ambiente atual não possui ferramenta de codegraph disponível, então usamos feature graph seeds e
fallback com `rg` de profundidade 2:

```text
OX_ALPHA_REASONING_MODEL_ID_PATTERNS.some(test)
  -> isOxAlphaReasoningModelId
  -> default-policy / config schema
  -> workspace-model-catalog
  -> runtime thought level providerOptions
  -> AI SDK request body

client/configs.data.configs.magic_name
  -> trim + RegExp(pattern, "iu")
  -> isOxAlphaReasoningModelId(modelId, [remotePattern])
  -> matched remote model.reasoningProfile = "ox-alpha"
  -> config.json -> provider registry protocol
  -> workspace-model-catalog -> existing transport mapping
```

### Delta do grafo

| Status    | Nó/aresta                                      | Razão semântica                                        | Evidência            | Ação            |
| --------- | ---------------------------------------------- | ------------------------------------------------------ | -------------------- | --------------- |
| confirmed | `capability.model-capabilities` docs/seeds | vários IDs públicos compartilham uma entrada de reasoning independente | user decision + spec | graph updated |

### Casos aceitos

| Case ID | Setup                                    | Ação                              | Asserções                                                            | Camadas de evidência                                        | Status E2E |
| ------- | ---------------------------------------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| OXA-001 | standalone OpenAI-compatible provider    | carregar `ox-alpha`                | os três níveis/padrão e o mapeamento de reasoning_effort corretos     | shared + adapter                                       | not-needed |
| OXA-002 | standalone Anthropic provider            | carregar `ox-alpha`                | adaptive + mapeamento de effort, sem budget                           | adapter + wire                                         | not-needed |
| OXA-003 | dynamic provider, metadata ausente/obsoleto | upsert registry                   | reconstrói os três níveis por transporte sem alterar outras capabilities | bootstrap integration                                  | not-needed |
| OXA-004 | standalone nos dois transportes          | carregar `GLM-x-preview-f` em qualquer caixa          | mapeamento de três níveis idêntico ao de `ox-alpha`, sem injetar outros defaults | shared + adapter                                       | not-needed |
| OXA-005 | dynamic provider / OpenAI Responses      | upsert `GLM-x-preview-f`          | os dois transportes reconstroem os três níveis; Responses explicitamente sem mapeamento exclusivo | bootstrap integration                                  | not-needed |
| OXA-006 | `magic_name="GLM-Flash"`                 | sincronizar modelo remoto em caixa mista que casa      | persiste e projeta `reasoningProfile="ox-alpha"`                     | service + shared                                       | not-needed |
| OXA-007 | `magic_name=""` / ausente                 | sincronizar qualquer modelo remoto | não gera profile nem altera o reasoning existente                    | service                                                | not-needed |
| OXA-008 | dynamic provider carregando profile ox-alpha | carregar como Anthropic/OpenAI-compatible | mapeamento low/high/max idêntico ao dos IDs públicos embutidos, ID original preservado | bootstrap integration                                | not-needed |
| OXA-009 | standalone nos dois transportes          | carregar `x-preview-f-free` em qualquer caixa | mapeamento idêntico ao dos IDs públicos existentes, rejeitando IDs aproximados | shared + adapter                              | not-needed |
| OXA-010 | `magic_name="foo                         | bar"`                               | sincronizar modelos remotos contendo qualquer um dos nomes            | ambos os nomes escritos no mesmo reasoning profile, regex inválido ignorado com segurança | service    | not-needed |
| OXA-011 | primeiro `magic_name` casa, configuração autoritativa posterior retira | sincronizar duas versões de config em sequência no mesmo home | o retorno e a gravação removem o profile de modelos remotos comuns; modelos locais `modified` permanecem | service                                    | not-needed |