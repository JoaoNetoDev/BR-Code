# Design de manutenção da Config de Provider embutida do ZCode

> Status: design válido atualmente
>
> Este documento estabelece a forma de manutenção de longo prazo de `config/provider/zcode-builtin.json`. O contrato dos campos, o Overlay e a semântica completa do Registry estão em [`configuration.md`](./configuration.md) e [`provider-and-model-configuration-overview.md`](./provider-and-model-configuration-overview.md), respectivamente.

O arquivo-fonte de produção continua sendo `zcode-builtin.json`; o ambiente de testes usa `zcode-builtin.test.json` no mesmo diretório. Ambos seguem a mesma norma de manutenção e são empacotados conforme `ZCODE_ENV`; o contrato de seleção e cache está em [empacotamento para os dois ambientes](../../../../builtin-provider-config-build-environments.md).

## 1. Objetivo e limites

O ZCode Built-in Release publica atomicamente dois tipos de conteúdo:

```text
ZCode Built-in Release
├─ Account Provider Config Map
├─ Provider Template Map
│  └─ Template 元数据壳 + Provider Config Overlay
└─ Model Config Rules
```

O Account Provider Config Map declara as identidades e configurações de chamada dos providers de conta mantidos pelo ZCode. O Provider Template Map fornece uma linha de base de criação para providers de API comuns; cada Template guarda um `nameMap` multilíngue e um Provider Config Overlay reutilizável em uma casca de domínio, e não entra no Registry. As Model Config Rules declaram os fatos dos modelos, as capacidades de requisição de API/Endpoint, os Option Specs, o per-option raw-body map e os fatos de produto Provider/Model.

Este documento é uma norma de escrita para quem publica e um modelo mental de revisão; ele não acrescenta:

- campos de Rule `priority`, `specificity` ou de ordenação;
- reordenação de Rules em Runtime ou um segundo Resolver;
- branches de código de negócio escritos por modelId, Provider ID ou URL;
- campos de evidence, provenance ou confidence dentro da configuração;
- novas fontes de verdade sobre membros Provider/Model, direitos de Account ou intenção Personal.

A manutenção de fatos de capacidade também precisa distinguir "não foi possível consultar" de "não é suportado explicitamente":

- quando um modelo novo não tem evidência confiável, a linha de base genérica continua fornecendo valores padrão conservadores;
- quando a capacidade de um modelo já publicado desce de `true` para `false`, é necessária uma negativa explícita da documentação oficial atual, um resultado de requisição reproduzível contra o Endpoint alvo, ou uma decisão explícita do publicador do serviço;
- ausência em resultados de busca, não registro em relatórios de pesquisa e menções ausentes em documentos antigos não servem isoladamente como evidência para rebaixar uma capacidade;
- quando o mesmo modelo existe em múltiplos Endpoints/formatos de produto, a conclusão só pode ser escrita no nível de Model, API ou Endpoint realmente coberto pela evidência; não se pode extrapolar de uma página de produto para todas as rotas.

Essa regra assimétrica é intencional: um modelo desconhecido com valores padrão conservadores evita liberar o que não deve; já uma capacidade declarada e em uso não pode ser desligada silenciosamente por causa de uma atualização de documentação que a omitiu.

## 2. Os dois tipos de Rule

O sistema tem apenas dois tipos de Model Config Rule:

```ts
type ModelConfigRule =
  | {
      type: "match";
      providerMatch?: string;
      modelMatch: string;
      apiMatch?: string;
      baseURLMatch?: string;
      config: ModelConfig;
    }
  | {
      type: "provider-model";
      providerId: string;
      modelId: string;
      config: ModelConfig;
    };
```

Terminologia unificada:

| Rule type        | Termo                      | Significado                                     |
| ---------------- | ------------------------- | ---------------------------------------- |
| `match`          | Match Rule                | Acerta um conjunto de contextos de resolução usando um matcher            |
| `provider-model` | Provider-Model Exact Rule | Acerta com precisão uma combinação `providerId + modelId` |

Tanto Built-in quanto Personal podem conter esses dois tipos. `Built-in` e `Personal` indicam apenas o dono da Source e não criam um terceiro tipo de Rule. As Built-in Exact Rules são mantidas pelo Release; as Personal Exact Rules acompanham o ciclo de vida de modelos da página de configurações.

## 3. Ordem física de escrita das Built-in Rules

As Built-in Rules são aplicadas na ordem do array, e os itens definidos depois sobrescrevem os anteriores. Os níveis abaixo são apenas a ordem de escrita do arquivo publicado e o modelo mental de revisão; o código não calcula prioridade a partir deles:

```text
1. Complete Baseline Match Rule
   └─ modelMatch=.*
   └─ 为未知 Personal Model 提供完整、保守的默认配置
            |
            v
2. Model Match Rule
   └─ modelMatch
   └─ 与 API Schema 和 Endpoint 无关的模型事实
            |
            v
3. Model + API Match Rule
   └─ modelMatch + apiMatch
   └─ 该公开协议下的请求能力、Option Spec 和参数映射
            |
            v
4. Model + API + Endpoint Match Rule
   └─ modelMatch + apiMatch + baseURLMatch
   └─ 指定官方或兼容 Endpoint 的已证实差异
            |
            v
5. Provider-scoped Match Rule
   └─ providerMatch + modelMatch
   └─ 适用于该 Provider 全部当前/未来成员的服务能力
            |
            v
6. Provider-Model Exact Rule
   └─ providerId + modelId
   └─ 默认 enabled 和无法由 Endpoint 表达的窄产品事实
```

Os níveis 2 a 4 ficam consecutivos para uma mesma família de modelos, evitando manter fatos do mesmo modelo em regiões diferentes do arquivo. Fatos de serviço Provider-scoped válidos entre modelos ficam depois dos fatos de cada modelo e antes das Exact Rules. O nível 1 aparece apenas uma vez.

Os `values` do Reasoning Option Spec precisam ser escritos do menor para o maior nível de raciocínio; o primeiro item é o nível público mínimo usado pelas chamadas auxiliares e o último é o nível público máximo usado como seleção padrão comum. Quando o modelo não oferece desligamento, não é permitido forjar um `off` ou `nothink` só para uniformizar nomes.

O Resolver continua percorrendo o array Built-in como está. As Effective Rules continuam sendo compostas pelas fronteiras de domínio existentes:

```text
Built-in Rules（保持物理顺序）
              +
Personal provider-model Rules（保持内部顺序）
              +
Personal Provider-Model Exact Rules（保持内部顺序）
```

Não é permitido modificar `ModelConfigRules.composeEffective()` nem adicionar ordenação dinâmica por specificity para implementar a norma de autoria acima.

## 4. Fatos sob responsabilidade de cada nível

### 4.1 Complete Baseline

A linha de base genérica garante que qualquer Personal Model válido obtenha um Model Config completo. Os valores padrão precisam ser conservadores:

- apenas o formato Text, explicitamente genérico, é habilitado em entrada e saída;
- mídia, ferramentas, saída com JSON Schema, busca nativa e MCS não comprovados são `false`;
- são fornecidos context completo, max output e outras folhas obrigatórias;
- `enabled=true`, para que modelos criados pelo usuário e explicitamente adicionados como membros Personal sejam utilizáveis.

A linha de base genérica não pode se passar pela capacidade real de um modelo específico.

### 4.2 Model Match

A Model Match Rule expressa apenas fatos que não mudam com o API Schema ou o Endpoint, por exemplo:

- context window e o limite rígido de saída máxima do modelo;
- fatos de entrada Text/Image/Video/Audio/PDF;
- fatos de saída Text;
- capacidades de Tool em nível de modelo que todos os Schemas alvo conseguem expressar de forma confiável.

O casamento por nome de modelo faz comparação ASCII sem distinção de caixa sobre o Model ID completo, mas não reescreve o Model ID nas requisições reais.

### 4.3 Model + API Match

Este nível expressa diferenças de protocolo público, por exemplo:

- o conjunto completo de valores de reasoning level, do menor para o maior;
- `optionSpecs.reasoningLevel.map` e `optionSpecs.maxOutputTokens.map`;
- se `responseJsonSchema` pode ser codificado por aquele Schema;
- se Tool, MCS e o parâmetro de max output são executáveis nesse Schema;
- fatos estreitos que realmente pertencem à codificação da requisição, como `requiresMfjsToolSchema`.

"Cobrir os três Schemas" significa que cada modelo mantido tem um resultado de resolução explícito e auditável para os três Schemas; não significa que o Endpoint oficial do fabricante precise suportar os três Schemas, nem que os fatos completos do modelo devam ser copiados três vezes. Sem protocolo oficial, usa-se um resultado conservador; Endpoints compatíveis de terceiros podem ser promovidos pelo nível seguinte.

### 4.4 Model + API + Endpoint Match

A especialização por Endpoint usa preferencialmente:

```text
modelMatch + apiMatch + baseURLMatch
```

Ela expressa diferenças do mesmo modelo e Schema em uma linha de serviço real. `baseURLMatch` faz correspondência por regex completa sobre a URL normalizada: Host em caixa, porta padrão e barra final já foram normalizados; Path, Query e Fragment ainda têm semântica.

Fatos adequados a este nível incluem:

- os JSON Schema, MCS ou parâmetros de reasoning que um Endpoint oficial compatível realmente suporta;
- a busca Web nativa que só aquele Endpoint oferece;
- limites verificados do mesmo Schema público em implementações de servidor diferentes.

Ela não é responsável por membros de Provider, direitos de Account, habilitação padrão nem material de acesso. Quando um Personal Provider aponta para o mesmo Endpoint, deve obter naturalmente os mesmos fatos de Endpoint.

### 4.5 Provider-scoped Match Rule

Quando a cadeia de serviço de um Provider oferece a mesma capacidade a todos os seus membros de modelo atuais e futuros, e essa capacidade não pode ser expressa independentemente pela API Schema ou pelo Endpoint, usa-se:

```text
providerMatch + modelMatch
```

Continua sendo uma Match Rule comum e não cria um novo tipo de Rule. Por exemplo, Start Plan, Individual Coding Plan e Team Coding Plan usam um modelo visual antes da API do modelo para converter Image/Video em texto, portanto todos os membros de modelo desses Plan Providers podem declarar:

```ts
properties.input_format.support_image = true;
properties.input_format.support_video = true;
```

Aqui "multimodal" significa apenas entrada visual Image/Video confirmada e não infere Audio nem PDF. A Rule precisa casar exatamente com o Plan Provider e não pode acertar um provider de API comum criado pelos Templates `zai-api` / `bigmodel-api`; estes continuam usando as capacidades nativas da API do modelo. O sistema não possui um "Account API Provider" do tipo `zhipu-account/mode=api-key`.

Provider-scoped Rules só devem ser usadas para fatos de serviço que valem de fato para todos os membros. Diferenças que valem para um único modelo continuam em Model/API/Endpoint ou Exact Rule e não podem se espalhar usando `modelMatch=.*`.

### 4.6 Provider-Model Exact Rule

Cada membro de `builtinModelIds` precisa ter exatamente uma Exact Rule declarando explicitamente o `enabled` padrão, para evitar que um novo membro entre acidentalmente nos candidatos do usuário por causa do `enabled=true` da linha de base genérica. Fora dessa matriz de enabled, os demais campos da Exact Rule devem ser poucos e ter como responsabilidade principal:

- o `enabled` padrão daquele modelo sob um Provider Built-in específico;
- fatos de catálogo de produto do Provider que não podem ser expressos com precisão por `model + api + baseURL`.

Não se pode, por conveniência de escrita, copiar para várias Exact Rules fatos que poderiam ser reaproveitados por um Endpoint Match.

## 5. Campo de saída com JSON Schema

O nome do campo alvo é fixo:

```ts
properties.supportsJsonSchemaOutput: boolean;
```

Ele indica apenas que o Effective Model atual consegue aceitar o `ModelRequest.responseJsonSchema` fornecido pelo aplicativo e que o Adapter/Schema alvo o codifica como uma restrição de saída em JSON Schema. Não significa JSON comum, JSON Object Mode nem prompt pedindo retorno em JSON.

A evidência de que apenas `response_format={type:"json_object"}` funciona é insuficiente: nesse caso o campo precisa permanecer `false`. Só pode ser `true` quando o Schema/Endpoint alvo aceita JSON Schema. O texto de UI usa "saída estruturada em JSON Schema".

O `supportsJsonSchemaOutput` da implementação atual é um nome antigo aguardando migração; na migração, Config, Registry, Model, Runtime, Adapter, Protocol, Settings e os testes precisam ser renomeados de uma só vez, sem manter campo duplo nem alias em Runtime.

## 6. Evidência e inferência conservadora

Cada fato não óbvio é classificado em uma de três categorias nos materiais de revisão do release, mas a classificação não é escrita no Config de runtime:

| Categoria     | Significado                                                       | Escopo configurável                               |
| -------- | ---------------------------------------------------------- | ---------------------------------------- |
| Confirmação oficial | A documentação atual do modelo/API do fabricante declara explicitamente                              | Model, Schema ou Endpoint correspondente           |
| Confirmação de produto | Um serviço de produto do ZCode, uma API de conta ou um contrato interno oficial declara explicitamente             | Fato de produto do Built-in Provider correspondente          |
| Inferência de protocolo | Resultado genérico e conservador para serviços compatíveis de terceiros, ainda sem prova em Endpoint oficial | Capacidades incertas como `false`, permitindo override Personal |

### 6.1 A Models API é evidência de release, não uma nova camada de configuração em runtime

Alguns fabricantes oferecem interfaces de descoberta de modelos ao lado do Endpoint de inferência:

```text
Base URL + API Schema + 当前访问材料
                    |
                    v
         Provider Models API
                    |
                    +--> 当前访问材料可见的 Model ID
                    `--> 可选的 context / output / capability 元数据
```

O objeto consultado aqui não é uma Base URL isolada da conta, mas `Endpoint + API Schema + 当前访问材料`. O mesmo Endpoint pode devolver membros diferentes conforme a conta, a região, o plano ou a API Key. O caminho e a autenticação da Models API são determinados conjuntamente pelo protocolo e pelo fabricante; não se deve concatenar mecanicamente `/models` a qualquer `baseURL`.

Quem publica usa os resultados dentro dos seguintes limites:

- um Model ID em uma resposta ao vivo bem-sucedida é evidência forte dos membros visíveis para aquele material de acesso; respostas de exemplo na documentação só provam o formato da resposta e não substituem o catálogo ao vivo;
- campos como context, max output, capacidades de entrada, thinking ou structured output explicitamente devolvidos na resposta podem se tornar evidência oficial das Model/API/Endpoint Rules correspondentes;
- a resposta Models básica do formato OpenAI-compatible costuma conter apenas ID, owner e timestamps; não é possível inferir mídia, reasoning ou Option Specs a partir dela;
- a Models API da Anthropic hoje pode retornar capability e limites de token mais ricos, mas Endpoints Anthropic-compatible de terceiros podem implementar apenas um subconjunto;
- o conjunto de modelos específico de conta ou plano continua pertencendo ao Account Overlay; a Models API genérica não cobre as interfaces de direitos de produto.

A Models API só entra na verificação de release, no relatório de diferenças ou no fluxo de importação iniciado pelo usuário. Ela não sobrescreve diretamente as Configs Built-in, Account ou Personal durante a inicialização do aplicativo ou requisições comuns, não forma uma quarta camada de Config e não deixa uma falha de rede transitória alterar o Registry.

O site oficial escrever "Structured Output", "Search" ou "Tools" é insuficiente para se espalhar entre Schemas e Endpoints. Quando falta documentação oficial, pode-se preencher regrasConservadoras para os três Schemas, mas não se pode habilitar capacidades de alto risco com base apenas na mesma família, em nome semelhante ou em termos de marketing.

A evidência de capacidade também precisa distinguir "o serviço aceita a entrada" de "o modelo consome a entrada". Uma requisição que carrega campos desconhecidos, imagens ou outros conteúdos sem erro pode estar apenas sendo tolerada ou ignorada pelo servidor, e isso não permite marcar a capacidade correspondente como `true`. Uma capacidade de mídia exige, no mínimo, uma declaração oficial explícita, um contrato de serviço de produto do ZCode ou um teste em nível de protocolo que prove que o conteúdo realmente participa da resposta do modelo.

Modelos que o site oficial não lista mas que serviços compatíveis de terceiros podem oferecer podem ter Model Rules completas e conservadoras; só depois que a documentação oficial, a Models API ao vivo ou um fato de produto confirmam que o modelo pode ser chamado pelo Endpoint e API Schema alvo ele pode entrar como membro habilitado por padrão do Built-in Provider oficial correspondente. Assim se dá um padrão ao Personal Provider sem disfarçar inferências de compatibilidade como promessa oficial de produto.

## 7. Membros de modelo, habilitação padrão e ordem inicial

O `builtinModelIds` de cada Built-in Provider contém o catálogo de produto completo reservado à configuração do usuário. A habilitação padrão é expressa pelas Exact Rules daquele Provider.

O arquivo publicado também segue:

```text
builtinModelIds
├─ enabled=true 的当前主力或独特模型
└─ enabled=false 的旧型号、重复别名或被替代模型
```

Isso é apenas a ordem inicial dos membros Built-in. O sistema não adiciona ordenação dinâmica enabled-first nem reescreve o `modelOrder` Personal. Quando o Account Overlay devolve um subconjunto de modelos, a projeção segue essa ordem Built-in; depois que o usuário produz um `modelOrder` completo, o algoritmo de ordem de membros existente volta a ser o responsável.

A revisão de habilitação padrão precisa responder pelo menos:

1. ele é o modelo principal atual?
2. ele oferece velocidade, preço, visão, contexto ultralongo ou capacidade de Coding que outros modelos habilitados não têm?
3. ele é apenas um alias de outro modelo?
4. ele já foi descontinuado, desativado ou substituído explicitamente?
5. o Endpoint Built-in atual realmente oferece aquele Model ID.

## 8. Checklist de release

A cada manutenção do Built-in Release, valide no mínimo:

- o Provider Map e as Rules continuam sendo um release atômico;
- cada membro de `builtinModelIds` resolve um Model Config completo;
- cada modelo mantido tem um resultado de resolução explícito nos três API Schemas;
- diferenças de Endpoint usam preferencialmente `baseURLMatch` e as Exact Rules mantêm a fronteira dos fatos de produto;
- Provider-scoped Match Rules expressam apenas capacidades de serviço válidas para todos os membros atuais/futuros;
- a ordem física das Built-in Rules segue os níveis deste documento, sem depender de prioridade dinâmica;
- o `enabled` das Exact Rules é consistente com a ordem inicial dos membros do mesmo Provider;
- modelos retired/alias mantidos ficam disabled por padrão;
- Personal Exact Rules ainda podem sobrescrever depois;
- Runtime, Adapter e UI não reinferem fatos por modelId/Provider ID específicos;
- capacidades não óbvias têm evidência oficial, de produto ou de Endpoint reproduzível.

O checklist de release pode usar IDs de modelo para verificar fatos de configuração; o código de negócio de produção não pode fazer branch com base neles.