# Todo 76: Camadas do Builtin Provider Config e regras de Provider Site

> Status: concluído
>
> Data: 2026-09-04

## Objetivo

Reorganizar a semântica das regras de `zcode-builtin.json` sem alterar o mecanismo existente de overlay ordenado. Distinguir claramente base do modelo, API Schema, Provider Site (Base URL concreto), Provider Template e instância de Provider, evitando escrever configuração de site como regra de modelo genérica.

## Ordem fixa de overlay

```text
Model ID
    -> Model ID + API Schema
    -> Provider Site / Base URL
    -> templateId + modelId
    -> Built-in Provider Instance Model overlay
    -> Personal Provider Instance Model overlay
```

A ordem permanece inalterada. Camadas posteriores sobrescrevem apenas os campos que declaram explicitamente; não há posse automática de todos os campos por estar em uma camada mais posterior.

`Personal Provider Instance` é um conceito de produto que representa uma instância concreta de Provider criada pelo usuário; suas alterações de modelo continuam usando o mesmo `ModelConfigOverlay`, sem criar uma estrutura paralela de Personal Rule.

## Responsabilidade de cada camada

### Model ID

Fornece os fatos básicos do próprio modelo: janela de contexto, limite máximo de saída, modalidades de entrada básicas e valores básicos de reasoning. `maxOutputTokens.max` é um teto de capacidade, não um valor padrão de requisição.

### Model ID + API Schema

Fornece a linha de base em nível de protocolo: reasoning map, mapeamento de campos de comprimento de saída, codificação de JSON Schema, formato de tool call e serialização de mídia. A configuração aqui é uma baseline padrão e não pressupõe que todos os sites sejam idênticos.

### Provider Site / Base URL

Casa com o comportamento real do serviço por URL de site concreto. Pode sobrescrever a baseline de protocolo anterior, por exemplo o reasoning map, a capacidade de busca, PDF, JSON Schema, tool call ou campos adicionais de requisição de uma dada URL. Não é configuração de pertencimento de modelo nem de habilitação de template.

As regras em `zcode-builtin.json` que hoje escrevem a capacidade Anthropic de Z.ai/BigModel com `modelMatch: ".*"` + `apiMatch` + `baseURLMatch` devem ser reclasificadas e organizadas conforme a semântica de Provider Site.

### templateId + modelId

Representa o pertencimento de modelos de um template interno e a habilitação padrão, por exemplo `enabled`. Template não é um Provider executável e também não deve sobrescrever sem querer o comportamento de protocolo já confirmado para um Site concreto.
Dentro do escopo de manutenção atual, Template Model Rule usa apenas `enabled`; não há proibição adicional dos outros campos do `ModelConfigOverlay` de baixo nível, mas não se adiciona cobertura de capacidade em Template sem necessidade explícita.

### Built-in Provider Instance Model overlay

Representa a cobertura de modelo precisa fornecida pelo Builtin Config do ZCode para um `providerId + modelId` determinado.

### Personal Provider Instance Model overlay

Representa a cobertura de modelo precisa salva pelo usuário na Personal Config para um `providerId + modelId` determinado. As duas camadas reutilizam o mesmo tipo de Rule `provider-model` e o mesmo `ModelConfigOverlay`; a distinção é expressa apenas pela origem de configuração Builtin/Personal.

A Personal Config permite apenas a cobertura exata por `providerId + modelId`; não suporta, não lê nem grava nenhuma regra Personal global de `match`. O usuário pode alterar qualquer folha de Model Config, mas não pode criar uma nova camada de regra global via Personal Config.

## Princípio de escolha da API Schema em templates oficiais

Um mesmo fornecedor pode suportar simultaneamente várias API Schemas. Os templates oficiais priorizam de forma unificada o Anthropic Messages; só quando o fornecedor ou o modelo/Endpoint concreto não suporta Anthropic é que se escolhe outro Schema que a entrada efetivamente suporta e que tenha a verificação mais robusta. Essa decisão se baseia na evidência real de requisição do template, e não em rótulos promocionais como "OpenAI-compatible". Se modelos diferentes do mesmo site precisarem obrigatoriamente de Schemas diferentes, separe a identidade do template ou proponha primeiro um desenho explícito de configuração de API por modelo; não é permitido enfiar modelos de protocolos diferentes em um único `api.type` fixo.

## Escopo de manutenção e fronteira de completude

O escopo de manutenção é expresso apenas por uma tabela curta de inventário de entradas de Builtin Provider, sem recopiar o Provider Config completo no documento de design. A lista concreta está em
[`Builtin Provider 维护清单`](../../design-v2/builtin-provider-inventory.md). O formato da tabela é:

```text
供应商 | 类型 | templateId / providerId | Base URL | 产品维护模型
```

- Entradas de API comuns preenchem `templateId`; entradas de Account preenchem o `providerId` concreto.
- Os modelos na tabela são exatamente os modelos mantidos ativamente pelo produto; o `builtinModelIds` do Template é o fato correspondente na configuração, e não se mantém uma coluna duplicada de "a quais Templates o modelo pertence".
- Não se mantêm separadamente nomes de exibição de modelo, catálogo de Provider Site nem listas de modelos Legacy/Compatibility.
- Modelos históricos que não aparecem na tabela do catálogo de fornecedores não entram em Builtin Template e não passam por migração de compatibilidade.
- Estações de retransmissão pequenas e serviços de inferência auto-hospedados ainda podem usar a baseline genérica de Model/API, mas exigem que o usuário configure manualmente os modelos que o produto não mantém.

O conjunto de modelos da tabela de inventário de entradas é a entrada da verificação de completude: todo modelo da tabela precisa ter um Model baseline, baselines das três API Schemas e uma declaração explícita de `enabled` no Template/Account Provider correspondente. Não se exige manter o catálogo completo do fornecedor nem produzir uma matriz exaustiva Model × URL × Schema.

Essa tabela precisa ser mantida pelo documento de design, e não inferida de Rules que apareçam por acaso no código. Regras especiais de URL de Provider não formam uma "lista de Sites" separada: `providerSiteRules` só é escrito na configuração quando existe uma diferença real; sem regra, vale a baseline da camada anterior. Documentos de Research registram apenas evidências.

## Checklist de discussão campo a campo

Antes da implementação, confirmar item a item a baseline dos campos abaixo, se a sobrescrita pelo Site é permitida e a estratégia padrão:

| Campo | Baseline inicial | Site pode sobrescrever | Quando não confirmado |
| --- | --- | --- | --- |
| `contextWindow` | Model | Sim | Usar o valor conhecido do Model |
| `maxOutputTokens.max` | Model | Sim | Usar o teto conhecido |
| `reasoningLevel.values` | Model | Sim | Conservador, sem adicionar níveis |
| `reasoningLevel.map` | Model + API Schema | Sim | Sem mapeamento confiável fica indisponível |
| `maxOutputTokens.map` | API Schema | Sim | Sem mapeamento confiável fica indisponível |
| `support_pdf` | Model | Sim | Não declarar suporte |
| `supportsToolCall` | Model/API | Sim | Não pode desabilitar capacidade essencial do ZCode |
| `supportsJsonSchemaOutput` | Model/API | Sim | Não declarar suporte sem confirmação |
| Capacidade de busca/mensagens de sistema | Baseline de API | Sim | Não declarar suporte sem confirmação |

"Pode sobrescrever" indica capacidade de configuração, e não que todo site deva escrever uma sobrescrita; sem sobrescrita, continua valendo a baseline da camada anterior.

## Princípios das regras `match`

`match` é usado apenas para expressar "o mesmo objeto possui múltiplas grafias equivalentes", e não para inferir fornecedor, capacidade ou semântica de produto por regex complexas. O casamento por prefixo/sufixo é permitido somente nas camadas Model Rule (`modelRules`) e Model+API Rule (`modelApiRules`); Template Model e Provider Model devem usar o casamento exato por `templateId/providerId + modelId`, e Provider Site deve usar casamento por regra de URL, sem aplicar a lógica de wildcard de modelo.

IDs de modelo pertencem a um conjunto fechado e atualizado lentamente, portanto Model Rule admite por padrão o casamento por prefixo/sufixo, como `.*GLM-5\\.3.*`, para cobrir namespaces do fornecedor ou sufixos de versão confirmados. Regras de modelo podem se sobrepor, e o tratamento é uma simples ordem de escrita: regras de família de modelo genéricas primeiro, regras de modelo/variante específicas depois; por exemplo `.*GLM-5.*` antes de `.*GLM-5\\.3.*`, e este antes de `.*GLM-5\\.3-Flash.*`. Assim `GLM-5.3-Flash` herda a configuração genérica e depois as diferenças são cobertas pela regra mais específica. Não se introduz ordenação de runtime por "mais similar", nem se escrevem regras infinitamente amplas para Providers desconhecidos. Sufixos com semântica de produto distinta (como `-flash`, `-turbo`, `-thinking`, `:free`) continuam devendo ter regras específicas explícitas, e não podem ser engolidos como simples apelidos.

Por exemplo, variação de caixa ou de separadores de fato equivalente em um ID de modelo pode ser tratada por normalização ou casamento estreito; não se pode, só porque uma URL parece ser de determinado serviço, inferir automaticamente suas capacidades de modelo, busca ou JSON Schema.

## Limites do casamento de Base URL

A Base URL passa por parsing padrão do WHATWG URL antes da aplicação das regras. O comportamento de normalização atual é: esquema e Host tratados segundo a semântica de URL, com portas padrão e barra final sem gerar diferenças extras; Path, Query e Fragment não recebem suposições de negócio. Se Query/Fragment participam de uma regra concreta é definido pela regra explícita, e não se adiciona lógica de herança automática nem de reescrita de URL para endereços de proxy.

As regras de Provider Site devem permanecer simples, específicas e legíveis; um endereço de proxy não herda automaticamente a configuração do Site oficial por "parecer" com ele, a menos que acerte a mesma regra explícita ou exista outra configuração definida.

## Organização proposta para o Builtin Config

1. Manter o overlay ordenado atual, sem introduzir algoritmo de prioridade dinâmica.
2. Centralizar as regras casadas por `baseURLMatch` conforme a semântica de Provider Site e separá-las formalmente de `matchRules` em `providerSiteRules` independentes, evitando que regras de site continuem se disfarçando de Model Rule comum.
3. `templateModelRules` continua carregando o pertencimento de modelos do template e o `enabled`, sem ser expandido para uma segunda fonte de verdade de todas as capacidades.
4. O map genérico da API Schema serve apenas como baseline; quando um site concreto tem diferenças, a regra de Site cobre.
5. `providerModelRules` continua como a cobertura precisa de instância de Provider, com o Personal Overlay aplicado por último.
6. Não adivinhar capacidades por nome de modelo, URL ou API Schema em Runtime, Adapter ou UI.

## Fases de execução

1. **Escopo de manutenção em disco**: manter no documento de design uma tabela de inventário de entradas "fornecedor, tipo, ID, Base URL, modelos mantidos pelo produto", listando as três API Schemas; não criar lista de modelos Legacy/Compatibility nem um Site Catalog duplicado.
2. **Divisão de tipos**: separar formalmente `modelRules`, `modelApiRules`, `providerSiteRules`, `templateModelRules` e `providerModelRules`; cada camada passa a ter seu próprio tipo de Rule externa, reutilizando internamente `ModelConfigOverlay`; Builtin Provider Instance e Personal Provider Instance reutilizam o mesmo tipo `provider-model`.
3. **Migração do Builtin Config**: colocar as regras existentes nos grupos correspondentes conforme a ordem fixa, preservando a semântica de ordem de cada overlay.
4. **Verificação de completude**: validar o Model baseline, os baselines Model×Schema, as diferenças de Site e o `enabled` dos Templates da lista de manutenção; modelos de Provider fora da lista não entram em Builtin Template e não exigem matriz para Providers desconhecidos.
5. **Verificação de regressão**: adicionar testes unitários de Config Schema, ordem dos grupos e overlay; executar os testes existentes de Provider Config, Resolver, Registry e Settings/Selection, provando que este ajuste de formato não alterou o comportamento de consumo atual. Sem mudança de comportamento de UI, não criar uma nova suíte de E2E de negócio; reaproveitar os E2E de Provider já existentes para o smoke test final.

## Fora de escopo atualmente

- Não rediscutir a descontinuação já concluída do `default` de Option, a completude do Reasoning e a explicitação do orçamento de requisição.
- Não implementar neste Todo diretamente PDF, tool call ou JSON Schema; as alterações concretas dessas capacidades são responsabilidade do Todo 74, e este Todo fornece apenas as restrições de camada de configuração.
- Não mudar a abstração existente de que Provider Template não é um Provider executável.
- Não decidir neste Todo os valores de capacidade concretos de PDF, tool call ou JSON Schema; eles são executados pelo Todo 74, mas devem respeitar as restrições de camada e completude deste Todo.
- A configuração atual ainda não foi oficialmente lançada; as regras Personal globais de `match` são removidas direto do novo Schema, sem migração nem leitura de compatibilidade; modelos históricos de Providers não mantidos também não são migrados.

## Critérios de aceitação

- Todo Model principal mantido pelo documento tem um Model baseline.
- Todo Model principal mantido pelo documento tem um API baseline para as três API Schemas; quando a combinação não se aplica, não se exige forjar uma configuração.
- Todo Provider Site mantido pelo documento só recebe um override de Site quando existe uma diferença clara; sites pequenos ou desconhecidos seguem a baseline genérica.
- Todo membro de modelo de Template tem um `enabled` explícito.
- Toda Builtin Rule consegue dizer a que pertence: Model, API Schema, Provider Site, Template ou Provider Instance.
- Regras de URL expressam o comportamento de um site concreto e não se disfarçam mais de capacidade genérica de todos os Providers.
- O mesmo Effective Model Config usa o mesmo resultado de overlay em Settings, Model Selection, Runtime e Adapter.
- O comportamento atual de overlay ordenado permanece previsível, com testes unitários cobrindo conflitos de regras.
- Providers fora da lista de manutenção não precisam de nova Site Rule e conseguem usar as baselines de Model/API.

## Registro de implementação (2026-09-04)

- A saída serializada do Built-in Model Config e o `config/provider/zcode-builtin.json` real foram divididos em `modelRules`, `modelApiRules`, `providerSiteRules`, `templateModelRules` e `providerModelRules`; o Resolver ainda anexa grupo a grupo na ordem convencionada, sem introduzir prioridade dinâmica.
- Os três tipos de regras de casamento do Builtin ainda reutilizam internamente a mesma Rule `match` e o mesmo `ModelConfigOverlay`; o Personal não entra mais nesse pipeline genérico de match.
- `parseZCodeBuiltinModelConfigRules` lê os novos grupos e os mescla na ordem fixa; o antigo branch de leitura de `matchRules` foi mantido apenas para Fixtures de teste do período de desenvolvimento ainda não sincronizados, e a saída codificada não gera mais os campos antigos. O arquivo embutido oficial não usa mais os campos antigos.
- `toZCodeBuiltinJSON` classifica, conforme a presença dos campos, as regras sem condição de API/URL em `modelRules`, as com `apiMatch` em `modelApiRules` e as com `baseURLMatch` em `providerSiteRules`.
- Foram adicionados testes de ordem entre camadas e de integridade dos grupos do arquivo real, e os testes relacionados a Provider/Provider Node/Runtime passaram (54 testes antes; 30 testes de regressão nesta migração). `pnpm typecheck` passou e `pnpm lint` passou (0 erro).

Esta rodada não alterou os caminhos de consumo de Runtime, Adapter ou Model Selection; eles continuam consumindo o mesmo resultado de `ModelConfigRules.resolve`. As 134 Builtin Rules existentes foram classificadas mecanicamente conforme a semântica dos campos, e o conteúdo das regras e a ordem dentro de cada grupo permaneceram iguais. A Personal Config foi convergida à parte para apenas `provider-model` exato, sem match global; os ajustes de regras de capacidade de 74/79 continuam sendo fechados em seus respectivos Todos.