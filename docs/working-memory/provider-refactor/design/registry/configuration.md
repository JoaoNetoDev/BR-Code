# Configuração de Provider e Model

> Design vigente; a transição para Provider Template já está incluída neste documento.

A configuração de Provider é composta por três camadas: ZCode Built-in, Account Built-in e Personal. As três compartilham a mesma linguagem de Overlay em nível de campo.
Na montagem normal, a composição de membros segue o significado de cada campo: Account Built-in atualiza o conjunto Built-in e Personal atualiza o conjunto Personal. Cada uma das cinco origens de entrada valida a propriedade de seus campos por meio de um Schema de fronteira estrito antes de entrar nos tipos de Overlay do domínio comum; o Runtime não duplica cinco conjuntos de tipos de configuração.
ZCode Built-in e Personal fornecem Model Config Rules; Account Built-in não fornece capacidade estática de modelo.

A camada de design não cria o conceito de domínio "documento de configuração". Config Map, Rules e Effective Config são objetos de domínio; o invólucro JSON, o `schemaVersion`, o nome do arquivo, o cache e o formato de serialização pertencem à implementação de Source/Repository.

## Origens de configuração

| Origem                               | Proprietário               | Persistida | Conteúdo principal                                                     |
| ------------------------------------ | -------------------------- | ---------- | ---------------------------------------------------------------------- |
| ZCode Built-in Provider Config       | Publicação do produto ZCode | Sim        | definições de Account Provider e Provider Template                      |
| Account Built-in Provider Config     | Estado da conexão da conta atual | Não  | Account Access do Built-in account Provider e membros dinâmicos de modelo |
| Personal Provider Config             | Usuário                    | Sim        | Provider customizado, API Key e sobreposição final sobre Providers existentes |
| ZCode Built-in Model Config Rules    | Publicação do produto ZCode | Sim        | fatos estáticos de modelo, Options padrão e mapa raw por option        |
| Personal Model Config Rules          | Usuário                    | Sim        | sobreposição esparsa sobre Provider/Model específicos                  |

Catalog, Preset, Provider Family, o `builtinProviders/builtinModels` remoto e hardcodes de negócio não podem se tornar Registry Sources adicionais. Fatos de sistema ainda válidos migram para a ZCode Built-in Config/Rules; configuração explícita do usuário migra para Personal; fatos de conexão de conta vão para a Account Built-in Config.

### Organização do conteúdo do ZCode Built-in

O ZCode Built-in continua fisicamente usando um único JSON completo e atômico, sem ser dividido em vários arquivos-fonte por Provider, modelo ou camada de regras, e sem introduzir um pipeline extra de geração/montagem. A ordem de declaração do Provider Map e a ordem dos arrays de Model Config Rules fazem parte do conteúdo publicado; os tipos de Rule específicos, a ordem física de escrita, a especialização por Endpoint, as evidências e a especificação do catálogo de habilitação padrão estão em [`zcode-builtin-provider-config.md`](./zcode-builtin-provider-config.md). Essas especificações não adicionam prioridade de Rule nem reordenação dinâmica.

O Built-in Release é organizado pelas seguintes origens de produto:

```text
providers
├─ Z.ai / BigModel Individual、Team、Start Plan Account Provider
└─ Off-Peak 隐藏 Account Provider

providerTemplates
├─ Z.AI API / BigModel API
├─ Moonshot / MiniMax / DeepSeek
├─ Alibaba Model Studio CN / International / Xiaomi MiMo
└─ OpenAI / Anthropic / xAI
```

Off-Peak continua invisível na página de configurações comum e no seletor de modelos por meio de `visibility=hidden`. Serviços de API comuns são publicados apenas como Provider Template; um Template não é Provider, não entra no Registry e não tem `providerId` nem estado de execução. Depois que o usuário cria um Personal Provider a partir de um Template, o Template serve apenas como sua linha de base oficial de herança. Não há `enabled` no topo do Provider; a qualificação dinâmica de plano do Account Provider é escrita pelo Account Overlay em `access.entitled`, e o admission final de execução é decidido em conjunto pela qualificação, pela completude de configuração e pelo `enabled` do Model.

Essa ordem serve primeiro à legibilidade da configuração e a uma ordem de exibição padrão estável; se a página de configurações ganhará agrupamentos explícitos no futuro é design de interação separado e não pode alterar inversamente a identidade de Provider, a composição do Registry ou a resolução de Model Rules.

### ZCode Built-in Release e cache ativo

Bundled, Remote e o Active Cache do Environment usam o mesmo contrato de Release de duas camadas:

```ts
interface ZCodeBuiltinRelease {
  schemaVersion: 3;
  revision: number;
  config: {
    providers: Record<string, ProviderConfigObject>;
    providerTemplates: Record<
      string,
      {
        nameMap: Partial<Record<"zh-CN" | "en-US", string>>;
        config: ProviderConfigOverlayObject;
      }
    >;
    modelConfigRules: StructuredModelConfigRuleGroups;
  };
}
```

O Provider Template é um invólucro de domínio: `nameMap` é a metadata de seleção multilíngue do próprio Template, e `config` continua reutilizando o Provider Config Overlay formal. O Template não absorve Model Config Rules; estes continuam armazenados de forma centralizada, para manter visualmente evidente a ordem de aplicação das Rules de Match, Template, Provider e Personal. O nome do Template faz fallback na ordem Locale atual, `en-US`, `templateId`.

`config` contém atomicamente o Account Provider Map, o Provider Template Map e as Model Rules; `schemaVersion` e a `revision` monotônica pertencem ao invólucro de publicação da Source e não entram no Provider Overlay. O Remote é uma substituição completa e não pode ser misturado ao Bundled em nível de Provider e Rules. A mesma revision publicada precisa corresponder a um conteúdo único, e um rollback de conteúdo precisa publicar uma revision maior.

O Environment salva o Release ativo atual em `<config-root>/provider/zcode-builtin/<platform>/<appVersion>/<endpointKey>/active.json`; esse arquivo também cumpre o papel de LKG. O `endpointKey` é gerado deterministicamente a partir da Origin do control-plane do ZCode normalizada, e o Active e o `refresh-control.json` precisam estar no mesmo diretório de Endpoint. Na inicialização, o Bundled e o Active do Endpoint atual são parseados estritamente; escolhe-se o candidato compatível com a revision mais alta e materializa-se no Active. O Active é um cache/LKG descartável, não um pré-requisito de inicialização: quando o Active está ausente, corrompido, mais antigo, em conflito de conteúdo com o Bundled na mesma revision, ou quando o lock, a.listener, a leitura, a remoção ou a escrita do diretório Active falha, usa-se o Bundled confiável para completar o ready; quando for possível escrever, o Active é reconstruído a partir do Bundled. Só é permitido falhar a inicialização quando o próprio Bundled não passa pelo Release Schema e pelos Parsers de Provider/Rule existentes. O cliente não adiciona regras de integridade de negócio do publicador; se no futuro for necessária uma barreira de publicação, ela será uma tarefa nova baseada no processo real de publicação.

Active/LKG e revisions de Endpoints diferentes não são comparados entre si e não fazem fallback um para o outro. Ao mudar para um Endpoint sem Active, usa-se primeiro o Bundled para completar o ready e depois esse Endpoint é atualizado em background; ao voltar para o Endpoint antigo, o próprio LKG dele pode ser reutilizado. O cache antigo não particionado ainda não constitui compatibilidade oficial de publicação e não oferece dual-read.

O Personal Provider Config é uma configuração de usuário, e não um cache. Quando o arquivo está corrompido, com Schema não suportado ou quando uma migração única falha, o runtime precisa, se conseguir ler o texto original, preservar antes um backup de recuperação determinístico e então iniciar com um Personal Overlay vazio; se o backup ou a reescrita falhar, ele também pode degradar nesta rodada para um Overlay vazio apenas em memória, sem deixar o arquivo Personal derrubar o Bundled e o Account Provider. Salvamentos Personal posteriores continuam passando pela escrita atômica normal e devolvem o erro de persistência à própria operação, sem falsificar sucesso de salvamento. Processos diferentes observam o Personal Config por polling de content revision assíncrono; um salvamento no mesmo processo continua sendo publicado de imediato, e os demais processos alcançam o valor no máximo dentro de um ciclo de polling, sem depender de eventos de arquivo dependentes de plataforma.

O Model Selection Configured Default de um Environment é apenas uma preferência reconstruível. Ao confirmar corrupção de JSON, Schema ou versão, a remoção só ocorre dentro do escopo em que o lock do arquivo ainda é detido; uma falha temporária de lock, leitura ou do Legacy importer apenas ignora a preferência desta rodada e não apaga o arquivo. Em seguida, o fallback normal do Registry atual escolhe novamente; o Configured Default não pode bloquear a inicialização do Registry, da Model Selection View ou do Agent.

## Provider Overlay

```text
ZCode Built-in Provider Config
              |
              v
overlay Account Built-in Provider Config
              |
              v
Effective Built-in Provider Config
              |
              v
 overlay Personal Provider Config
              |
              v
      Effective Provider Config
```

```ts
effectiveBuiltinProviders = zcodeBuiltinProviders.overlay(accountBuiltinProviders);
effectiveProviders = effectiveBuiltinProviders.overlay(personalProviders);
```

A prioridade é `Personal > Account Built-in > ZCode Built-in`.

### Map ordenado

O ProviderConfigMap é um Map ordenado:

- Quando a camada posterior sobrescreve um providerId existente, a posição original é mantida;
- Quando a camada posterior adiciona um providerId, ele é acrescentado ao final na ordem da camada posterior;
- Por isso um Provider Personal-only fica depois dos Providers Built-in;
- Account Built-in não altera a ordem base dos Providers do ZCode Built-in.

Account Built-in escreve explicitamente `access.entitled` para cada Provider de conta: `true` quando há direito e `false` quando não há; em estado desconhecido, quando existe um Overlay bem-sucedido anterior ele é mantido e, quando não existe, usa-se `entitled=false` de forma fail-closed. O conjunto de modelos não vazio devolvido pela API do Start Plan sobrescreve por inteiro `builtinModelIds`; Individual/Team não escrevem esse campo e herdam do Built-in. Quando o Start Plan já foi confirmado como disponível mas nenhum modelo foi resolvido, só é possível manter o último Overlay bem-sucedido; na primeira vez, desabilita-se, sem recorrer a membros amplos do Built-in.

Exemplo:

```text
Built-in: [A, B, C]
Account Built-in: [A-account]
Personal: [Y, C-personal, X, A-personal]

Effective: [A-personal, B, C-personal, Y, X]
```

### Princípios de Overlay de itens de configuração

O Config Overlay usa três estados:

```text
undefined -> 本层不覆盖
具体值    -> 覆盖前层
null      -> 明确清除前层
```

A unidade básica do Overlay não é uma folha arbitrária de um objeto JavaScript, e sim um item de configuração que o produto expõe explicitamente ao usuário:

- Se um campo é apresentado ao usuário como um item de configuração completo, e o usuário pode ver o valor herdado completo e modificá-lo por inteiro, então assim que o Personal fornecer o campo explicitamente ele substitui por inteiro o valor da camada inferior; arrays, Maps e objetos não fazem merge implícito;
- Se um objeto aninhado expõe múltiplas folhas como itens de configuração independentes, o Overlay é feito por essas folhas separadamente. Por exemplo, `input_format.support_image` e `support_video` são dois interruptores independentes;
- `undefined` significa continuar herdando, um valor concreto significa substituição explícita e campos que permitem limpeza usam `null` para signify a limpeza explícita;
- A página de configurações exibir o valor herdado completo não equivale a produzir uma sobreposição Personal. O valor completo de substituição só é materializado quando o usuário realmente modifica aquele item de configuração; "restaurar padrão" remove o campo Personal e volta a herdar o valor mais recente de Built-in/Account Built-in;
- A UI expor ou não ativamente um item de configuração decide apenas a interação de produto, não a capacidade expressiva do Config Schema. Campos ocultos, somente leitura ou sem entrada de edição na página de configurações não se tornam por isso campos proibidos de escrita no Personal Schema; quando o usuário modifica a configuração manualmente, o processo continua passando pelo Overlay genérico, pela validação estrutural e pela validação de completude;
- Se os membros de um mesmo conjunto são possuídos por várias camadas e as adições, remoções e reordenações upstream coexistirem com a intenção do usuário, isso não pode ser modelado como um único campo de Overlay do conjunto inteiro. A estrutura de dados precisa ser dividida por posse, com ordem de combinação, conflito, mudança upstream e semântica de remoção definidas separadamente.

Portanto, `api.headers` e `reasoningLevel.values`, quando tratados como um item de configuração completo, continuam substituindo por inteiro; `type/values/max/map` dos Option Specs são folhas expostas separadamente e são overlayed por folha. A composição de modelos do Provider é dividida em dois campos porque Built-in e Personal possuem membros diferentes.

O Personal Config permanece sempre esparso, e a Effective View não pode ser expandida de volta e contaminar o Personal.

### `builtinModelIds` e `modelIds`

A composição de modelos de um Provider é dividida por posse:

```text
ZCode Built-in builtinModelIds
└─ ZCode 在线配置声明的成员

Account Built-in builtinModelIds（存在时）
└─ 当前账号接口返回的动态成员，整体替换 ZCode Built-in

Personal modelIds
└─ 用户自行添加、删除和排序的成员
```

O Effective Provider mantém ao mesmo tempo `builtinModelIds` e `modelIds`. Na montagem normal, Account Built-in mantém o primeiro e Personal Settings mantém o segundo; os dois não disputam mais um único `models[]`. Isso não é um sistema de permissão de campos por Source. O Resolver gera um Model Inventory com origem, e a ordem normal é Built-in primeiro e Personal depois.

Os dois campos continuam seguindo os três estados do Config Overlay: `undefined` não sobrescreve, `null` limpa explicitamente o conjunto desta origem e o array fornece membros e ordem. Ao gerar o Inventory, o Resolver normaliza para `[]` o conjunto que estiver ausente ou for `null` no final; um conjunto vazio é um fato legítimo de composição e não um erro de completude do Provider. IDs duplicados dentro de um único conjunto e o mesmo ID em ambos os conjuntos são isolados como problemas de membro no nível do Model, sem invalidar o Provider inteiro; Account/Resolver não podem deduplicar silenciosamente. O Model ID, depois de remover espaços das extremidades, é a identidade como string exata e sensível a maiúsculas/minúsculas.

Quando o mesmo ID aparece nos dois campos, adota-se Built-in-wins e forma-se apenas um membro Built-in; duplicatas dentro de um único conjunto mantêm a primeira ocorrência. O item posterior é ignorado de forma determinística na leitura, a escrita é proibida no Settings normal e ele é normalizado na próxima gravação do Provider relacionado. O sistema não cria DTO de conflito, identidade suspensa ou um segundo modelo com o mesmo nome. Um modelo Built-in entra na Selection quando cumpre enabled, completude e a visibility do Provider.

Os `builtinModelIds` retornados pela Account não são uma whitelist de autorização que o cliente não possa contornar. O Personal ainda pode adicionar outros IDs por `modelIds`, e o servidor faz a autorização final sobre a requisição real. A semântica completa de composição, conflito e habilitação está em [`model-membership-and-enablement.md`](./model-membership-and-enablement.md).

## Account Built-in Provider Config

A entrada do AccountProviderService precisa ser a ZCode Built-in Provider Config, e não o conjunto já sobreposto pelo Personal.
Ele só processa os Providers de conta declarados pelo Built-in:

- Define `access.entitled` apenas para o Built-in Provider Start, Individual ou Team correspondente à configuração de conexão estruturada atual;
- Pode sobrescrever `builtinModelIds` quando a API de direitos de fato retorna um conjunto de modelos;
- Não fornece context, max output, formato de entrada/saída, Reasoning nem outras capacidades estáticas de modelo;
- Não lê, restringe nem reescreve Personal-only Providers;
- Não sobrescreve `access` e não salva product, organization, project, identidade de conta, Token, Runtime Key, JWT ou Header de verificação de segurança de uso único.

O Account Built-in Provider Config é um Snapshot atômico produzido pela mesma resolução de conta e conexão. Quando todas as resoluções têm sucesso, ele é publicado por inteiro; quando qualquer dependência externa falha, a versão anterior bem-sucedida do Snapshot é mantida por inteiro, sem misturar várias gerações de resolução e sem implementar um last-known-good parcial por Family ou por Provider. A evolução do modelo de estado de conta e da topologia de planos não pode alterar esse limite de publicação atômica.

## ProviderConfig

Campos alvo:

```ts
interface ProviderConfigInput {
  templateId?: string | null;
  group?: "standard-personal" | "zai-family" | "bigmodel-family" | null;
  label?: string | null;
  logo?: { type: "builtin"; key: string } | null;
  visibility?: "visible" | "hidden" | null;
  access?: ProviderAccessConfig | null;
  api?: ProviderApiConfig | null;
  builtinModelIds?: readonly string[] | null;
  modelIds?: readonly string[] | null;
}
```

`logo` é a configuração de exibição do Provider final. O Template fornece um Logo padrão em seu `config` interno, o Account Provider fornece um Logo em sua própria Built-in Config e o Personal Overlay pode sobrescrevê-lo ou limpá-lo com `null`. A key `builtin` é uma string aberta: quando o cliente não reconhece uma key nova publicada no remote, ele apenas recorre ao ícone genérico, sem afetar o parsing da configuração, a completude ou a execução; um `type` desconhecido continua sendo rejeitado pelo Schema atual. Recursos empacotados podem fornecer arquivos light/dark para a mesma key por tema, mas o branch de tema não entra no Provider Config.

`group` é um fato de organização de produto do Concrete Provider, e não algo inferido temporariamente pelo Host, pelo Renderer ou por uma whitelist de Provider ID. A declaração raiz de Account Provider usa `zai-family` ou `bigmodel-family`; Personal Providers criados por Template e totalmente personalizados usam `standard-personal`. `templateId` referencia apenas a linha de base oficial do Template e não transforma o Template em Provider. No Effective Provider completo obtido pelo Resolver, no Registry Config e no DTO de Settings, `group` precisa estar completo. O Provider não guarda um boolean `builtin` separado nem um `enabled` de topo.

Este é o conjunto completo de campos comuns de domínio. O código normal do ZCode Built-in e do Account Built-in mantém `builtinModelIds`, o código normal do Personal mantém `modelIds` e o Effective Provider mantém os dois. As fronteiras de Source usam seus próprios Schemas estritos para rejeitar campos fora de escopo; depois de entrar no domínio, continua-se reutilizando o Provider Config/Overlay comum, sem criar cinco conjuntos de tipos de Runtime.

`visibility` tem `visible` como padrão e controla apenas o Facade de Settings/Selection do usuário. Se um Provider entra no Registry executável é decidido pela completude de configuração e pelos fatos de Access: um Provider hidden ainda pode ser executado de forma precisa por capacidades internas, e um Provider visible também pode aparecer apenas em Settings com problemas por falta de material de acesso.

### API

```ts
interface ProviderApiConfig {
  type?: "anthropic-messages" | "openai-chat-completions" | "openai-responses" | null;
  baseURL?: string | null;
  headers?: Readonly<Record<string, string>> | null;
}
```

`api.type` descreve o protocolo público; `baseURL` é a entrada estática de requisição desse Provider no Environment atual; `headers` são Headers estáticos. O Endpoint não pode ser inferido pelo Model ID nem colocado no snapshot de Provider de Runtime de um Turn comum.

### Access

```ts
type ProviderAccessConfig =
  | {
      type: "api-key";
      apiKey?: string | null;
      apiKeyManagementUrl?: string | null;
    }
  | {
      type: "zhipu-account";
      accountType: "zai" | "bigmodel";
      mode: "start-plan" | "individual-coding-plan" | "team-coding-plan" | "off-peak";
    };
```

`access.type` descreve a origem primária do material de acesso e é ortogonal a `api.type`. `zhipu-account.mode` é uma enumeração finita dos produtos de conta da Zhipu: o admission da verificação de segurança na versão oficial e o protocolo Off-Peak são ambos despachados pelo Mode. Instâncias criadas pelos Templates Z.AI API e BigModel API usam o Access `api-key` comum, não entram no V4 e não criam pseudo campos genéricos que todo Access poderia preencher. Materiais dinâmicos de verificação de segurança, o Off-Peak Ticket e o rollout remoto não são persistidos na Config. O limite completo de execução está em [`request-compatibility-and-access-protocols.md`](./request-compatibility-and-access-protocols.md).

#### api-key

A Config gerencia diretamente o material de acesso estático necessário para chamar a API do modelo; o campo formal atual é a API Key.
Quando o Effective Config não tem um `apiKey` não vazio, ele está incompleto; os Settings podem exibi-lo e corrigi-lo, mas o Provider não entra no Registry. Isso é ortogonal a `api.type`: `access.type` descreve a origem do material de acesso e `api.type` descreve o protocolo da linha.

#### zhipu-account

O ZCode Built-in Provider declara fixamente `accountType + mode`; Start, Individual e Team são Providers separados. O Account Connection Resolver usa esses campos, a Selection estruturada dos Settings, a conta atual e os direitos, projetando apenas `access.entitled` e os membros de modelo que a API do Start realmente retorna. Ao criar o Model, o `family + mode` declarado pelo Built-in é fixado.

A cada attempt de requisição, o Account Request Auth Service verifica a conexão compatível atual pelo `family + mode` estático, depois obtém o Team scope da Conexão atual e resolve materiais como JWT, Runtime Key, API Key ou o Header de verificação de segurança de uso único. A identidade da conta, product, organization, project e as credenciais dinâmicas não entram no Provider Config nem no Active Model.

O Personal usa semântica de substituição completa para o Access `api-key` comum; a Personal Source de Providers fixos `account:*` não permite escrever `access`. Se a conta atual tem uma conexão compatível é julgado pelo Request Auth em tempo de requisição, e o servidor faz a autorização final.

### Princípios de credenciais

O limite preciso é:

> O Provider Config é a entrada de montagem da chamada de API de modelo e pode, conforme o Access Type, guardar credenciais de acesso estáticas ou referências estáveis de credencial;
> ele não é um centro unificado de credenciais, não é responsável pelo ciclo de vida de todas as credenciais dinâmicas e não assume a decisão de autorização final do servidor.

## Visibility

```text
visible
├─ Provider Settings 可见
└─ Model Selection 可见（同时满足 enabled/完整性）

hidden
├─ Provider Settings 不可见
└─ Model Selection 不可见
```

Visibility é uma configuração de apresentação/origem de opções, não um portão de segurança. O Registry mantém por dentro os Providers hidden completos, e capacidades internas de produto podem criá-los por ID preciso. Hidden não isenta de Access, Endpoint, composição de modelos nem de completude do Model Config.

O `executionOnly` ainda não publicado carregava simultaneamente visibilidade, exclusão do Registry e isenção de completude; o M4 o remove diretamente, sem manter leitura de compatibilidade legada.

## Model Config Rules

As Effective Rules são combinadas de forma determinística na fronteira de domínio: Built-in preserva a ordem de publicação e o `provider-model` Personal preserva a ordem interna e é colocado ao final de forma unificada:

```ts
effectiveModelRules = ModelConfigRules.composeEffective(zcodeBuiltinModelRules, personalModelRules);
```

Built-in e Personal usam a mesma estrutura de Rule:

```ts
type ModelConfigRule =
  | {
      type: "provider-model";
      providerId: string;
      modelId: string;
      config: ModelConfig;
    }
  | {
      type: "match";
      providerMatch?: string;
      modelMatch: string;
      apiMatch?: string;
      baseURLMatch?: string;
      config: ModelConfig;
    };
```

O casamento é uma capacidade de configuração declarativa e não equivale a um caso especial de modelo concreto no código de negócio. As Rules são aplicadas em ordem; os campos casados depois sobrescrevem os de antes. As regras gerais do ZCode Built-in completam todos os fatos obrigatórios de todos os modelos, as regras específicas cobrem as diferenças e as regras precisas do Personal sobrescrevem por último.

A série GLM-5.3 contém atualmente `glm-5.3` e `glm-5.3-flash`. O Flash precisa entrar em todos os Providers Z.ai/BigModel: o API Provider segue o wire ID em minúsculas já existente, e os Providers de plano de conta e Off-Peak seguem o ID de exibição/linha `GLM-*` já existente. Ele herda o context, o limite de saída, o reasoning, as ferramentas e os demais fatos completos de modelo do GLM-5.3, sobrescrevendo apenas o formato de entrada para suportar Image e Video. Essa relação precisa ser expressa por Built-in Model Rules contínuas, e Runtime, Adapter e UI não podem criar novos casos especiais por Model ID.

O Model Config é a única configuração dona das capacidades do modelo, das Options e do mapeamento de parâmetros de requisição, mas isso não significa transformar esses fatos em algo que só possa ser casado "por modelId". Uma capacidade pode ser um fato público do próprio modelo, ou só valer sob uma combinação específica de Provider, API ou Endpoint; a Rule deve escolher a combinação mínima e suficiente de `modelMatch`, `providerMatch`, `apiMatch` e `baseURLMatch` conforme o escopo de suporte real.

`baseURLMatch` é uma dimensão de casamento opcional formalmente suportada pelo Schema, mas uma Rule Built-in não precisa usá-la só porque o campo existe. Quando uma identidade estável de Built-in Provider expressa a diferença com precisão, `providerMatch` tem prioridade; `baseURLMatch` só é usada quando ainda existe uma diferença real determinada pelo deploy do Endpoint sob a mesma identidade de Provider e o mesmo API type. Habilitar o casamento por URL para um fato precisa ser decidido caso a caso, e não pode existir uma lógica genérica que adivinha fornecedor, modelo ou Reasoning a partir da URL.

`providerMatch` / `modelMatch` / `baseURLMatch` são textos de expressão regular usados pelo Rule Resolver local, com casamento completo contra o Provider ID completo, o Model ID e o `api.baseURL` do Effective Provider, respectivamente. O `modelMatch` usa sempre casamento ASCII insensível a maiúsculas/minúsculas; isso afeta apenas o parsing da configuração e não reescreve o Model ID real enviado ao Provider. Se uma regra realmente precisar de casamento por contém, é preciso escrever explicitamente o `.*` antes e depois; o Resolver não expande automaticamente cada regra de modelo exato para contains, porque IDs curtos como `k3` e `glm-5` se sobrepõem a modelos mais específicos e, pela ordem do array, sobrescrevem fatos de capacidade de forma errada.

`providerMatch` e `apiMatch` mantêm a sensibilidade a maiúsculas/minúsculas. `baseURLMatch` também, mas o alvo do casamento não é a string bruta digitada pelo usuário: o Resolver primeiro normaliza scheme, hostname, porta padrão e barra final com um parser de URL padrão e só então casa contra o resultado normalizado; path e query preservam as maiúsculas/minúsculas originais. Quem escreve a Rule deve, portanto, escrever o pattern contra a URL normalizada, em vez de mascarar diferenças de caixa do Host por meio de um casamento que ignora maiúsculas/minúsculas na URL inteira.

O `provider-model` pode aparecer nas Sources Built-in ou Personal e declara com precisão uma combinação de Provider/Model. As Rules exclusivas de Built-in são gerenciadas pelo ZCode Built-in Release; as Rules exclusivas de Personal são gerenciadas pelos Settings. O `match` é responsável por cobrir um conjunto de modelos com uma Rule declarativa, e não é um matcher de configuração remota nem dispara um ramo específico de algum modelo no código de negócio. Quando a página de configurações grava um Provider/modelo único, ela cria apenas a `type="provider-model"` estruturada, sem codificar IDs como regex.

Somente as Rules exclusivas de Personal seguem o ciclo de vida do Personal: ao renomear um Personal Model as Rules se movem, ao excluir um Personal Model elas são excluídas; ao excluir o Personal Overlay de um Provider, todas as Rules exclusivas de Personal daquele Provider são excluídas. Nem as Rules exclusivas de Built-in nem as Built-in Match Rules são reescritas ou removidas automaticamente por essas operações. Restaurar o valor padrão de um campo remove apenas a folha correspondente das Rules exclusivas de Personal; quando uma Rule fica vazia, a Rule inteira é excluída.

A resolução precisa ler o Effective Provider:

```ts
effectiveModelRules.resolve({
  providerId: effectiveProviderId,
  modelId,
  apiType: effectiveProvider.api.type,
  baseURL: effectiveProvider.api.baseURL,
});
```

Renderer, Shared, protocolo e Adapter não adivinham por string helper quais capacidades ou qual intensidade de Reasoning um modelo suporta.

### Escrita e ordenação das Built-in Model Rules

As ZCode Built-in Rules continuam armazenadas no mesmo array, mas deixam de ser divididas em seções globais distantes do tipo "todos os fatos de modelo / todas as especializações de API / todas as especializações de Provider". Exceto pelo fallback completo e por regras de serviço realmente transversais a modelos, as regras de uma mesma família de modelos são arrumadas de forma contínua, para que o mantenedor veja em um único lugar a declaração completa daquele modelo. Como as Rules casadas depois sobrescrevem as casadas antes, a ordem de arrumação é ao mesmo tempo uma especificação de legibilidade e uma semântica de execução:

```text
Complete Fallback
        |
        v
GLM family
├─ family common
├─ model A
│  ├─ model common facts
│  ├─ model + API schema
│  ├─ provider + model
│  ├─ provider + model + API schema
│  └─ provider + model + API schema + Endpoint（确有需要时）
└─ model B ...
        |
        v
GPT -> Claude -> Grok -> Kimi -> MiniMax -> DeepSeek -> Qwen -> MiMo
        |
        v
Cross-model Provider / Service Rules（仅在无法归入单一模型家族时）
```

A ordem estável de leitura das famílias de modelos segue a ordem de produto de Provider citada acima: primeiro GLM e depois GPT, Claude, Grok, Kimi, MiniMax, DeepSeek, Qwen e MiMo; novas famílias de modelos são acrescentadas à posição de produto correspondente. A família GLM carrega ao mesmo tempo os fatos comuns dos modelos GLM usados pelo produto ZCode e dos modelos GLM públicos, mas diferenças de conta, Endpoint ou API Schema continuam expressas por regras mais estreitas.

Dentro de cada família, a escrita é contínua na seguinte hierarquia de cobertura:

| Ordem | Casamento típico                                                   | Responsabilidade principal                                              |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | `modelMatch` de escopo da família                                   | fatos confirmados como iguais e compartilhados por vários modelos da mesma família |
| 2     | `modelMatch` específico                                            | Properties inerentes ao modelo, formato de entrada/saída, contexto e Option Specs |
| 3     | `modelMatch + apiMatch`                                            | diferenças de Option Map, Replay e campos de requisição sob o Schema de API público do modelo |
| 4     | `providerMatch + modelMatch`                                       | diferenças quando um serviço realmente deploya aquele modelo          |
| 5     | `providerMatch + modelMatch + apiMatch`, adicionando `baseURLMatch` quando necessário | diferenças finais ainda causadas por API Schema ou Endpoint no mesmo serviço |

Quando um mesmo modelo tem vários Schemas de API, as especializações de API são arrumadas de forma contínua logo após os fatos comuns daquele modelo, usando uma ordem estável: `anthropic-messages`, `openai-chat-completions`, `openai-responses`. Combinações inexistentes não recebem regras vazias. Regras de Provider/Service limitadas a uma família continuam dentro dela; apenas regras que de fato cobrem várias famílias de modelos não relacionadas vão para a região Cross-model no fim do array.

É obrigatório:

- O fallback completo fica em primeiro, completa todos os campos obrigatórios e fornece apenas valores padrão conservadores; regras amplas de família vêm antes das regras de modelo específicas, e depois de uma regra específica não pode mais ser adicionada uma regra ampla que a sobrescreva;
- Apenas uma Rule é mantida para a mesma condição de casamento. Ao judgear duplicatas, `modelMatch` é tratado com sua semântica insensível a maiúsculas/minúsculas; conteúdos duplicados são mesclados no mesmo objeto de configuração, sem depender da ordem acidental de dois matchers equivalentes;
- Fatos gerais de modelo e Properties independentes de API vão nas regras de modelo específicas; diferenças de dialeto de requisição vão nas especializações de API adjacentes; especializações de Provider, Service ou Endpoint sobrescrevem apenas as folhas que diferem, sem copiar a configuração inteira do modelo;
- OpenAI-compatible apenas indica que a forma básica da requisição é semelhante, e não que campos de extensão de fornecedor como `enable_thinking`, `thinking` e `reasoningEffort` sejam iguais; esses parâmetros precisam ser restringidos à combinação mínima suportada pelos fatos do serviço oficial;
- A ordem do array JSON já expressa agrupamento e relação de cobertura, e por isso não se adicionam campos sem significado em runtime como `group`, `section` ou `name` apenas por razão de formatação, nem se divide o Built-in em vários arquivos ou se adiciona um pipeline de geração;
- Personal Rules são sempre anexadas por inteiro depois de todas as Built-in Rules e continuam tendo a prioridade final de sobreposição do usuário.

Reordenar as Built-in Rules existentes precisa ser tratado como mudança de comportamento: para as combinações de `providerId/modelId/api.type/baseURL` que existem de fato no Built-in, o Effective Model Config antes e depois da reordenação precisa ser comparado. Uma pura reordenação deve manter um resultado de parsing equivalente; mesclar Rules duplicadas pode eliminar sobreposições acidentais, mas qualquer mudança de valor de configuração precisa ser tratada como uma correção de fato independente e explícita. O que se exige aqui é a verificação de equivalência da reordenação atual, e não uma auditoria histórica commit a commit e folha a folha.

### Fontes de fato e fechamento da implementação antiga

Ao organizar o Built-in, verifique na seguinte ordem de prioridade de evidências:

```text
ZCode 产品/账号服务契约
        >
厂商 Models API 的实时成功响应
        >
厂商当前官方 API 与模型文档
        >
当前 AI SDK 官方契约 + 实际请求体
        >
可复现的服务请求
        >
旧配置、Catalog、Preset 和 hardcode
```

A implementação antiga serve apenas para descobrir fatos possivelmente esquecidos e não se torna automaticamente a resposta correta da nova configuração. Não é exigida uma tabela pesada de auditoria de migração commit a commit e folha a folha; mas cada item não obvio de Reasoning, interruptor de compatibilidade ou especialização de Provider precisa ser explicável por um contrato oficial, por um fato do serviço de produto ou por uma requisição reproduzível. Depois de confirmar que algo já foi assumido pela Built-in Config, o hardcode de negócio antigo precisa ser removido e não pode continuar como uma segunda fonte de fato de fallback.

O escopo de evidências da Models API segue os campos realmente presentes na resposta: o conjunto de IDs pode provar os membros visíveis para o material de acesso atual; apenas capability, context ou limite de saída explicitamente devolvidos pela interface podem provar o fato de modelo correspondente. Exemplos de resposta em documentação não são um catálogo em tempo real, e um serviço que aceita uma requisição ignorando o conteúdo também não prova capacidade. A Models API é usada para validação de publicação e relatório de diferenças, e não participa diretamente do Overlay de Runtime; os fatos estáticos formais continuam entrando no Resolver apenas pelas camadas Built-in, Account e Personal existentes.

### OpenAI Responses Reasoning

As opções gerais do OpenAI Responses continuam usando `Model.options.reasoningLevel`, e o nível concreto é mapeado pela `optionSpecs.reasoningLevel.map` da Model Rule correspondente para o corpo de requisição bruto `reasoning.effort`. O Built-in não pode copiar literalmente literais do OpenAI Chat ou de serviços OpenAI-compatible de terceiros para Responses: por exemplo, se o nível geral de produto `max` é mapeado para `xhigh` da OpenAI precisa ser declarado conforme o conjunto de efforts que o modelo específico suporta no momento.

Quando Providers OpenAI/Anthropic entram no Built-in, é preciso completar simultaneamente os Fatos independentes de API de seus modelos, o Option Map específico de API e os testes de contrato do corpo de requisição. Os testes devem observar o corpo final da requisição HTTP, e não apenas afirmar parâmetros internos do SDK. Para modelos de reasoning com Base URL customizada ou não reconhecidos pelo SDK, as diferenças de protocolo precisam entrar em uma Model Config Rule mais estreita, sem criar regras globais de adivinhação no Runtime.

## ModelConfig

```ts
interface ModelConfig {
  enabled?: boolean | null;
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
}
```

`modelId` vem do Model Inventory do Provider, consciente da origem, e do contexto de resolução; ele não é repetido no ModelConfig. `enabled` é um portão de execução, não pertence às API Properties e não expressa autorização do servidor nem relação de composição. O modelo não tem mais visibility independente; a visibilidade para o usuário é expressa de forma unificada pela visibility do Provider e pela Selection View de quais modelos são executáveis. Os demais campos do ModelConfig descrevem as Properties do modelo no contrato público, as Options escolhíveis pelo usuário e o mapeamento de cada Option para o corpo de requisição bruto da API alvo.

A Rule geral do Built-in precisa completar o valor padrão `enabled=true`; uma Rule Built-in específica pode declarar `enabled=false` para modelos descontinuados ou não recomendados. Uma Rule exclusiva de Personal pode sobrescrever essa folha depois; ao adicionar normalmente um Personal Model, escreve-se explicitamente `enabled=true`.

O Model Config não contém um contêiner genérico de Compatibility. O reasoning histórico mantém o fato canônico e é entregue à codificação padrão do Adapter; não se pode remover reasoning real por causa de um modelo específico, nem fabricar synthetic empty-thinking para tool-call. O reasoning OpenAI-compatible deixa de usar o modo independente `openai-reasoning-content`; o antigo `omitMaxOutputTokens` do GitHub Copilot e o `maxOutputTokensRequestField` da Snowflake são removidos. A verificação de segurança da versão oficial e o protocolo de execução Off-Peak são despachados pela enumeração finita de `zhipu-account.mode`, e não aparecem mais no Model Config nem como pseudo campo genérico de Access. O limite preciso está em [`request-compatibility-and-access-protocols.md`](./request-compatibility-and-access-protocols.md).

### Properties

```ts
interface ModelPropertiesConfig {
  contextWindow?: number | null;
  input_format?: {
    support_text?: boolean | null;
    support_image?: boolean | null;
    support_video?: boolean | null;
    support_audio?: boolean | null;
    support_pdf?: boolean | null;
  } | null;
  output_format?: {
    support_text?: boolean | null;
  } | null;
  supportsToolCall?: boolean | null;
  supportsJsonSchemaOutput?: boolean | null;
  supportsNativeWebSearch?: boolean | null;
  supportsMidConversationSystem?: boolean | null;
}
```

Uma Rule pode omitir ou sobrescrever folha a folha. O Effective Model Config precisa obter um `input_format` e um `output_format` completos; Runtime, Adapter, Compact, Memory, Subagent e UI leem os mesmos campos e não criam capability maps derivados. O contrato detalhado está em [`../model/input-output-format.md`](../model/input-output-format.md).

### Option Specs

Os Option Specs declaram a ordem dos candidatos, o limite rígido e o mapeamento de requisição dos itens configuráveis, por exemplo:

```ts
interface ModelOptionSpecsConfig {
  reasoningLevel?: {
    type?: "enum" | null;
    // 按推理强度从低到高；首项是最低公开档位。
    values?: readonly string[] | null;
    map?: string | null;
  } | null;
  maxOutputTokens?: {
    type?: "limit" | null;
    max?: number | null;
    map?: string | null;
  } | null;
}
```

O Core entende apenas o `reasoningLevel` e o `maxOutputTokens` genéricos e não entende campos de dialeto de fornecedor. `reasoningLevel.values` é uma lista ordenada do mais baixo ao mais alto. A seleção comum sem valor explícito pega o último item na fronteira de Selection do Host; chamadas auxiliares que usam explicitamente o nível mais baixo selecionam o primeiro item de forma explícita. Não é possível inferir pelo nome do nível se um Provider suporta desligar o Reasoning.

O `map` de cada Option usa CEL restrito para ler a variável final com o mesmo nome da Option à qual pertence: o Reasoning Map lê `reasoningLevel`, o Max Output Map lê `maxOutputTokens`, e ambos devolvem um JSON Merge Patch Object conforme a RFC 7396. O ModelFactory compila o Map ao criar o Active Model; o Adapter aplica o Patch sobre o Body JSON final já serializado pela AI SDK e só então entra na autenticação dinâmica e na assinatura. Campos wire concretos como `reasoning_effort`, `thinking.type` e `max_tokens` existem apenas no resultado do Map, não entram no Core e também não passam mais por um `reasoningMapping` independente nem por AI SDK Provider Options. O contrato completo está em [`../model/model-option-map.md`](../model/model-option-map.md).

Todo o código antigo que identifica a intensidade de Reasoning por modelo específico deve sair. As diferenças válidas entram nas ZCode Built-in Model Config Rules.

## Validação de completude

A validação de Schema verifica o formato dos campos e os campos desconhecidos; a entrada de criação do tipo completo do Registry verifica recursivamente o resultado final após o Overlay e expressa o resultado como `{ ok: true, config } | { ok: false, issues }`. O Resolver reutiliza esse mesmo resultado para gerar os diagnósticos dos Settings ou o Registry Value; candidatos que falham não entram no Registry e o resultado bem-sucedido, no tipo estático, já não contém campos opcionais obrigatórios das Rules esparsas. Não se pode filtrar por `issues.length === 0` e em seguida continuar fazendo asserções cruas sobre o mesmo tipo esparso de Config.

O `ProviderConfig` e o `ModelConfig` esparsos continuam servindo como entrada de Overlay; o Registry usa `RegistryProviderConfig` e `RegistryModelConfig` para expressar os fatos já validados. A entrada de criação completa apenas restringe o tipo estático do Effective Config e não adiciona uma Config Source persistente, um DTO de Runtime ou uma segunda autoridade de configuração.

```ts
interface RegistryProviderConfig extends ProviderConfig {
  readonly access: CompleteProviderAccessConfig;
  readonly api: CompleteProviderApiConfig;
}

interface RegistryModelConfig extends ModelConfig {
  readonly enabled: boolean;
  readonly properties: RegistryModelProperties;
  readonly optionSpecs: RegistryModelOptionSpecs;
}
```

Os tipos completos também precisam fornecer um contrato de serialização que devolve o tipo de objeto completo. Não se pode apenas restringir as propriedades com `extends ModelConfig` e continuar herdando um `toJSON()` que devolve um `ModelConfigObject` esparso, senão Selection/Protocol voltarão a ver Properties opcionais. A implementação pode deixar o tipo completo sobrescrever o tipo de retorno da serialização ou fornecer um único `toRegistryJSON()`; não se pode duplicar e manter outro DTO.

Completude mínima do Provider:

- `access.type` e os campos estáticos correspondentes;
- `api.type`;
- `api.baseURL`;
- Model Inventory válido e ordenado produzido pelo Resolver, com duplicatas normalizadas pelas regras Built-in-wins/primeira ocorrência.

Completude mínima do Model:

- `enabled` completo;
- Properties completas;
- formato de entrada/saída completo;
- Option Spec de max output completo (com max inteiro positivo e um map compilável que devolve um Object Patch);
- Option Spec de reasoningLevel completo; values não vazio, sem itens em branco e sem duplicatas, ordenado do mais baixo ao mais alto, e map compilável; o cliente não adivinha a semântica pelo nome;
- todos os inteiros positivos e valores de enumeração válidos.

Runtime, Adapter e Telemetry não podem varrer nomes como `disabled`, `off`, `nothink` ou `none` para adivinhar a semântica de um interruptor. O Map lê apenas o valor final da Option atual; não recebe outras Options, contexto, Provider, Model ou credenciais. A Settings Resolution permite manter estados disabled, incomplete e problemas de composição. O Registry publica modelos enabled e completos; nomes iguais entre conjuntos são publicados com a identidade Built-in, e duplicatas dentro de um único conjunto mantêm a primeira ocorrência. O Model não tem estado hidden. Os consumidores posteriores ao Registry não podem verificar novamente nem completar Properties, Option Specs e campos de execução do Provider.

No design final, um `zhipu-account` habilitado precisa ter `family + mode` completos; o Team scope não pertence à completude estática. Quando os materiais dinâmicos da conta estão ausentes, o Adapter precisa falhar antes da rede.

O Personal Config não precisa estar completo por si só e pode herdar do Built-in; o Settings Preview e o Registry verificam depois de completar o Overlay. Providers hidden usam a mesma regra de completude.

## Settings e salvamento esparso

Os Settings leem simultaneamente:

```text
Personal explicit value
Effective inherited value
validation issues
```

O valor real do campo de entrada expressa apenas o campo Personal explícito; o valor Effective Built-in pode servir de placeholder. Quando um conjunto ou objeto completo é exposto como um único item de configuração, a UI pode exibir seu valor herdado completo, mas só grava em Personal o valor completo modificado depois que o usuário realmente modificar. Se a entrada do usuário for exatamente igual ao valor padrão do Built-in, ela ainda é salva como Personal explícito; "restaurar padrão" é feito removendo o campo Personal.

A edição de formato de modelo mantém diretamente o `input_format/output_format` aninhado. Text fica travado, Image/Video são editáveis e PDF/Audio ficam ocultos mas preservados como estão; o salvamento gera uma Personal Rule esparsa folha a folha.

As interações de configuração e a reordenação estão em [`settings.md`](./settings.md).

## Source e armazenamento físico

Os Services de domínio consomem apenas Config Snapshots comuns e não têm ciência de arquivos, banco de dados ou serviços remotos:

```text
ZCode Built-in Config Source ─┐
Personal Config Repository ───┼─> ProviderConfigService
                              └─> ProviderRegistry

Account Built-in Config Source ───> ProviderRegistry
```

O arquivo publicado do Built-in é nomeado uniformemente `config/provider/zcode-builtin.json`. Desktop, CLI/TUI, testes e SEA injetam explicitamente o caminho de Source acessível ou um objeto comum, e `@zcode/provider` não lê arquivos. A cadeia de Provider Config não mantém compatibilidade com `official.json`, variáveis de ambiente antigas ou campos de protocolo antigos; o plano de transição atômica está em [`../../steps/todo-10-zcode-builtin-provider-config-naming-cutover.md`](../../steps/todo-10-zcode-builtin-provider-config-naming-cutover.md).

O Personal Config usa o `.zcode/v2/provider_config.json` do Environment atual, fisicamente isolado dos outros arquivos de configuração integrados. O Repository oferece leitura, notificação de mudanças e `update()` atômico; lock de arquivo, escrita atômica, retry e polling de content-revision pertencem à implementação do Repository.

## Migração da configuração antiga

O `config.json` antigo já publicado é importado uma única vez pelo Host/raiz de composição Standalone, dentro do lock do Repository, somente quando o novo arquivo de destino está ausente:

```text
legacy config + current Built-in baseline
                  |
                  v
     project explicitly represented facts
                  |
                  v
       sparse Personal Config + Built-in Rules
                  |
                  v
             validate -> atomic create
```

Um Custom Provider sem linha de base Built-in entra por inteiro em Personal; um Provider com linha de base guarda apenas as diferenças. Credenciais dinâmicas de conta, Runtime Snapshot, enriquecimento de Catalog e hardcodes antigos não participam da migração. O antigo Provider Store independente e a Coding Plan Key que ficavam nele deixam de ser lidos. Uma Model Property antiga que o arquivo não expresse explicitamente não vira um Override Personal, e sim é fornecida como padrão pela Rule geral do Built-in; o Importer não adiciona `COMPATIBILITY_*` e não adivinha valores por Catalog, modelId, tipo de Provider ou Endpoint. Em caso de falha de parsing ou de falha da validação completa após o Overlay, o arquivo original não é modificado.

O Legacy importer sem versão é uma instalação de transição para publicação. Depois que a janela de upgrade forçado terminar e a versão mínima suportada/a cadeia de upgrade já garantir que os usuários passaram por uma versão com importer, ou que o produto explicitamente aceitar que usuários de versões anteriores reconfiguem, o importer, os parsers antigos, as dependências de Catalog, as constantes exclusivas de migração e os testes são removidos. A migration de `schemaVersion` adjacente do Config formal é mantida e não faz parte dessa trilha de aposentadoria.

O Provider Config Schema do branch atual, ainda não publicado, é modificado diretamente para a estrutura final, sem estabelecer histórico de versões interno de `models[]`, sem adicionar migration de schema adjacente e sem fazer leitura dupla de formatos intermediários em desenvolvimento. Somente mudanças de formato após a publicação oficial é que recebem migration adjacente.

## Reordenação de Providers e modelos

A página de configurações permite arrastar apenas Personal-only Providers. Providers Built-in/Account Built-in mantêm a ordem do Built-in, e a sobreposição do Personal sobre eles não muda a posição. Arrastar modelos apenas reordena `modelIds`; `builtinModelIds` mantém a ordem gerenciada pelo ZCode/Account Built-in. Arrastar modelos não modifica a ordem de prioridade das Model Config Rules.

## Invariantes

- A camada de domínio não tem o conceito intermediário de "Config Document".
- O Provider Overlay é ZCode Built-in -> Account Built-in -> Personal.
- Account Built-in processa apenas os ZCode Built-in account Providers.
- As Model Rules são Built-in + Personal e atuam sobre o Effective Provider.
- Rules esparsas só existem antes do Overlay; o Registry publica apenas a Config estática e completa depois de um `requireComplete` bem-sucedido.
- Um único item de configuração exposto por completo substitui por inteiro; conjuntos com membros possuídos em várias camadas precisam dividir a estrutura de dados e definir a semântica de combinação.
- Se a UI abre edição e se o Schema permite expressar são coisas independentes; o Personal Schema não ganha regras de proibição de escrita por visibilidade de UI ou por origem do campo, e a configuração manual aceita apenas validação estrutural/de completude genérica e falhas em tempo de requisição.
- Na montagem normal, Built-in/Account Built-in mantém `builtinModelIds` e Personal mantém `modelIds`; isso não é um sistema de permissão de campos por Source, e nomes iguais continuam sendo um conflito explícito.
- Visibility controla apenas a View do usuário.
- Access e API type são ortogonais.
- A API Key pode ser salva no Personal Config; credenciais dinâmicas de conta e de nível de chamada não entram na Config.
- A Account Connection produz a conta atual, o produto e o Team scope; o Access `zhipu-account` fixa apenas o `family + mode` necessários à execução e a requisição verifica depois se a conexão atual é compatível.
- Providers hidden não ganham isenção de completude ou de autenticação.
- Capacidades de modelo e Reasoning vêm apenas de Model Config Rules, e não de hardcodes por modelo concreto.
- O Legacy importer migra apenas fatos antigos explícitos, não adivinha capacidades e é removido por inteiro quando a janela de compatibilidade do upgrade forçado terminar; a migration versionada normal é mantida.