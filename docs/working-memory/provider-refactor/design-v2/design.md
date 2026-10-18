# Design Principal do Refactor de Provider

> Status: design vigente
> Este documento descreve apenas a arquitetura final e os invariantes, sem repetir o processo de migração. As fontes históricas e as decisões sobre contradições estão em
> [`evidence-and-contradictions.md`](./evidence-and-contradictions.md).

## 1. Objetivo

O único propósito do sistema de configuração de Provider é montar, de forma estável, a escolha e a configuração do usuário sobre uma API de modelo em uma chamada de modelo executável.

Ele precisa responder:

- Quais Providers existem e quais modelos cada Provider tem;
- Que API Schema, Endpoint e forma de acesso o Provider usa;
- Que capacidades estáticas o modelo tem, quais opções aceita e como as opções lógicas mapeiam para parâmetros de protocolo;
- Como a conta atual e a configuração do usuário afetam o Provider final;
- Qual Provider, Model e Options cada submissão usa ao final;
- Qual fonte de verdade prevalece durante atualizações de configuração, refresh de conta e concorrência de execução.

Ele não é um centro unificado de credenciais nem a autoridade final de autorização. Um Provider do tipo API Key pode guardar a API Key diretamente; um Provider Config do tipo conta
apenas descreve o tipo de acesso estático, e materiais dinâmicos como Token de sessão, Team Project Key, Start Plan JWT e Ticket de período ocioso são obtidos pela conta e pelos serviços de execução.
O servidor do modelo continua tomando a decisão final de autenticação e autorização para cada requisição.

## 2. Princípios centrais

### 2.1 Uma fonte de verdade de configuração, dois caminhos de resolução

A configuração de Provider e a de Model resolvem problemas diferentes e convergem na mesma identidade de modelo:

```text
Provider Config 路径                              Model Config 路径
====================                              =================

Provider Templates + Account Providers            ZCode Built-in Model Config Rules
                |                                                  |
                v                                                  +
      Account Provider Config                      Personal Model Config Rules
                |                                                  |
                v                                                  v
      Personal Provider Config                     Effective Model Config Rules
                |                                                  |
                v                                                  |
      Effective Provider Config                                 |
                |                                                  |
                +-----------------------+--------------------------+
                                        |
                                        | providerId / modelId /
                                        | api.type / baseUrl
                                        v
                              Effective Model Config
                                        |
                                        v
                         完整性、启用状态和执行资格判断
                              |                       |
                              v                       v
                    Provider Settings View      Provider Registry
                                                        |
                                                        v
                                                 ModelFactory
                                                        |
                                                        v
                                                不可变 Active Model
                                                        |
                                                        v
                                                    Adapter
```

O caminho de Provider determina "quais Providers existem ao final, quais são os modelos membros e como a API é acessada". O caminho de Model Rules determina "quais capacidades, opções e mapeamentos de protocolo o modelo tem".
Não se deve duplicar os fatos de capacidade de modelo para a página de configurações, tarefas ociosas, teste de conexão ou algum Adapter específico.

### 2.2 Overlay é intenção esparsa, Effective é resultado de resolução

A ordem de precedência do Provider é fixa:

```ts
effectiveProviders = resolveProviderTemplates(
  zcodeBuiltinProviderTemplates,
  zcodeBuiltinAccountProviders.overlay(accountProviders),
  personalProviders,
);
```

- ZCode Built-in fornece a linha de base estática de Provider Template comum e de Account Provider;
- Account apenas projeta as restrições dinâmicas decorrentes da conexão da conta e do plano contratado;
- Personal tem efeito por último, expressando a configuração explícita do usuário;
- `undefined` significa que esta camada não sobrescreve, `null` significa que esta camada limpa explicitamente, e um valor concreto significa sobrescrita explícita;
- O próprio Overlay pode ser incompleto; apenas o Effective Config que entra no Registry precisa ser completo.

Todas as Model Rules são Overlays ordenados. A ordem efetiva do Builtin é:

```text
modelRules
    -> modelApiRules
    -> providerSiteRules
    -> templateModelRules
    -> builtinProviderModelRules
    -> Personal providerModelRules / manualProviderModelRules
```

Nelas, `providerSiteRules` casa o comportamento do site pela Base URL concreta, e `templateModelRules` casa os membros do template e o `enabled` padrão por
`templateId + modelId`; não são o mesmo tipo de casamento de identidade.
A Config pessoal só permite sobrescrita exata para `providerId + modelId` concretos, sem oferecer, ler ou gravar Personal Match Rules globais.
Todas as regras continuam sendo escritas em ordem de array, sem introduzir algoritmo de prioridade dinâmica.

### Princípios de manutenção de configuração de Match (decisão de 2026-09-10)

- O Match Built-in se baseia em configurações principais e capacidades oficiais, com prioridade para o oficial; não se reduz a capacidade padrão de modelos conhecidos para suportar implementações de terceiros desatualizadas ou incompletas.
- Capacidades suportadas por modelos conhecidos sob o API Schema correspondente devem ser escritas nas regras de modelo／modelo API, mantendo o casamento por prefixo e sufixo. Não se deve desligar por padrão apenas por acessar via proxy de terceiros; quando o proxy não suportar, o usuário desliga pela Config pessoal do modelo concreto.
- Prioridade para o oficial não significa que todos os modelos de uma mesma marca suportem algo: os limites explícitos de suporte por modelo e por API Schema devem ser preservados, sem conceder a capacidade de um modelo a todos os outros por uma regex ampla de marca.
- Comportamento específico de site vai para `providerSiteRules`, mantido como "uma Base URL concreta, uma regra"; domínios ou endpoints diferentes não são unidos por alternância de regex. A mesma URL pode declarar várias capacidades já confirmadas em uma única regra; regras que precisem ser divididas por condições diferentes de modelo／API continuam separadas.
- Formas normalizadas equivalentes da mesma URL (por exemplo, barra final) podem ser tratadas na mesma regra, mas isso não autoriza ampliar para todos os caminhos do site ou para subdomínios arbitrários.
- As capacidades continuam formando as propriedades finais do Model via Overlay/Resolver unificado; não se restaura no Runtime um caminho alternativo que adivinhe capacidades por nome de modelo ou por domínio. Ao migrar comportamento antigo, verifique cada capacidade separadamente; não confunda remover uma verificação antiga com cancelar a capacidade original.

### 2.3 Lista de manutenção de Builtin Provider

O escopo de manutenção do Builtin é expresso por uma tabela curta de inventário de entradas, sem repetir aqui a Provider Config completa; veja
[`Lista de Manutenção de Builtin Provider`](./builtin-provider-inventory.md):

```text
供应商 | 类型 | templateId / providerId | Base URL | 产品维护模型
```

- Entradas de API comum preenchem `templateId`; entradas de Account preenchem o `providerId` concreto.
- Os modelos na tabela são os modelos mantidos ativamente pelo produto; os `builtinModelIds` do Template são o fato correspondente na configuração.
- Não se mantém adicionalmente nome de exibição de modelo, campos duplicados do Template dono do modelo ou um Provider Site Catalog.
- Modelos históricos do diretório de fornecedores que não aparecem na tabela não entram em Builtin Template nem recebem migração de compatibilidade.
- Regras especiais de URL existem apenas na configuração como `providerSiteRules`; não constituem outra lista de fornecedores.

### Princípio de escolha do API Schema

Um mesmo fornecedor pode oferecer vários API Schemas ao mesmo tempo. Templates oficiais priorizam uniformemente Anthropic Messages; só quando o fornecedor ou o modelo／Endpoint concreto não suporta Anthropic é que se escolhe outro Schema que a entrada realmente suporta e que tenha a verificação mais sólida. Essa decisão se baseia na evidência real de requisição do template, não em rótulos de marketing como "OpenAI-compatible". Se na mesma origem diferentes modelos precisarem usar Schemas diferentes, separe a identidade do template ou proponha primeiro um desenho explícito de configuração de API por modelo; não se pode enfiar modelos de protocolos diferentes em um `api.type` fixo. O Schema definido pelo template ainda pode ser sobrescrito por configurações mais específicas, na ordem de overlay estabelecida.

### Princípio de lista de modelos de Provider agregador

A lista de modelos de um serviço agregador pode tomar como referência a lista de manutenção do fornecedor upstream: modelos que o upstream já mantém, desde que a aggregating site realmente os ofereça, devem entrar na entrada agregada.
Por exemplo, o model ID atual do OpenRouter pode ser `openai/gpt-5.6-sol`, enquanto o model ID upstream é `gpt-5.6-sol`; isso é apenas a correspondência atual de nomeação e catálogo desse agregador, não significa que todos os agregadores precisem de prefixo nem exige que o Runtime remova o prefixo antes de resolver. A entrada agregada continua mantendo sua própria configuração de Model／API／Site, porque o mesmo modelo, ao passar por um site agregador, pode ter protocolo, capacidades e mapeamento de parâmetros diferentes.

### 2.3 Sparse e Complete devem ficar separados

A fronteira de escrita recebe Config esparsa; a fronteira de execução recebe apenas tipos com completude comprovada. O tipo completo é um estreitamento de tipo da mesma Config,
não outro conjunto de DTO nem um segundo Registry.

Os campos de Model têm como única fonte o schema de dados completo de `@zcode/shared/model-config`; o schema esparso deriva da mesma lista de campos
a semântica de default／override por null. A construção de entrada, a saída JSON e o tipo completo do Registry usam inferência a partir do schema; as classes de comportamento mantêm apenas congelamento, overlay
e serialização. A checagem de completude reaproveita esse schema, sem reescrever à mão uma segunda lista de verificação de campos／domínios. O schema de dados puro não referencia classes de comportamento,
evitando dependência circular entre codec e classe. Provider／API／Access também fornecem um contrato de dados único via `config/provider-data-schema.ts`;
os tipos ModelProperties／OptionSpecs da CLI e a projeção de campos de mídia do protocolo também derivam do Model schema compartilhado,
sem depender inversamente da implementação de comportamento do Provider. A camada compartilhada depende apenas do compilador de expressões puras, sem estado ou IO.
A completude do Provider só reforça itens já obrigatórios para execução, não exige que todos os campos de exibição／membro sejam obrigatórios, e a permissão de escrita por origem deriva do mesmo schema.
A fronteira de Personal para endpoints incompletos é preservada; um endereço inválido apenas bloqueia a admissão daquele Provider no Registry. As regras são derivadas por origem por `rule-data-schema.ts`; arquivos de dados não carregam o identificador de camada em memória `type` e a camada da regra não é re-adivinhada pela presença de campos.

```text
Sparse Config / Rules
        |
        v
      Resolver
        |
        +--> Resolved candidates + issues  -> Settings
        |
        `--> Complete executable configs   -> Registry
```

Providers／Models incompletos, desabilitados ou temporariamente não executáveis podem ser salvos e exibidos na página de configurações; eles não podem entrar no Registry executável.

### 2.4 Identidade, capacidade, estado e exibição são ortogonais

- `providerId + modelId` é a identidade do modelo; o mesmo `modelId` pode existir em Providers diferentes.
- O Provider de nível superior não tem `enabled`; Personal definido significa pertencer às Settings, e Account Provider pertence fixamente à Family correspondente.
- Completude expressa se há os fatos necessários para construir o objeto de execução.
- `executable` é determinado em conjunto pelo direito de acesso da Account Access (tipo de conta), completude do Provider, habilitação do Model e completude do Model.
- `selectable` depende de `executable` e ainda é afetado pelo `visibility` do Provider.
- `visibility` é a projeção de exibição do Provider, não permissão, autenticação nem isenção de completude.
- Model não tem `visibility` independente; se um Model aparece na seleção comum é decidido por sua elegibilidade de execução e pela visibilidade do Provider.

### 2.5 O Model criado é o fato de execução

O Registry é o catálogo para criar Models, não um estado mutável relido continuamente durante uma execução. O ModelFactory obtém do Registry atual do Environment de destino a Provider／Model Config completa e cria um Model imutável. Atualizações posteriores de Config ou Registry afetam apenas Models criados depois,
sem alterar silenciosamente requisições, Compact, Memory ou subagentes já em execução.

## 3. Contratos de configuração

### 3.1 Provider Config

Os campos formais de Provider Config são:

```ts
interface ProviderConfig {
  group?: "standard-personal" | "zai-family" | "bigmodel-family" | null;
  logo?: { type: "builtin"; key: string } | null;
  access?: ProviderAccessConfig | null;
  api?: {
    type?: "anthropic-messages" | "openai-chat-completions" | "openai-responses" | null;
    baseUrl?: string | null;
    headers?: Readonly<Record<string, string>> | null;
  } | null;
  builtinModelIds?: readonly string[] | null;
  personalModelIds?: readonly string[] | null;
  modelOrder?: readonly string[] | null;
  visibility?: "visible" | "hidden" | null;
}
```

Significado dos campos:

| Campo              | Significado                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `group`            | Agrupamento Personal ou Account Family; não é Access Mode                                    |
| `logo`             | Key do recurso de exibição; key desconhecido cai no ícone genérico                          |
| `access`           | Forma estática de obtenção dos materiais de acesso necessários à chamada                    |
| `api`              | API Schema final, Base URL e Headers estáticos                                              |
| `builtinModelIds`  | Membros de modelo pertencentes à camada ZCode ou Account                                     |
| `personalModelIds` | Membros de modelo pertencentes à camada Personal                                             |
| `modelOrder`       | Intenção de ordem total expressa pelo usuário sobre o conjunto final de membros               |
| `visibility`       | Se o Provider entra nas projeções comuns de configuração／seleção; não afeta buscas internas precisas no Registry |

Os conjuntos de membros preservam a origem: membros Built-in primeiro, membros Personal depois; duplicatas dentro de um mesmo conjunto mantêm apenas a primeira; quando Personal e Built-in têm o mesmo nome, mantém-se a identidade Built-in e descarta-se o item Personal duplicado. `modelOrder` apenas ordena membros existentes, não cria modelos.

A regra de nível externo da instância é `{ providerId, templateId?, providerName?, config }`; o template é
`{ templateId, templateNameMap, config }`. Identidade, relação de herança e nome não são folhas da Config.
Na criação do template, o nome da instância é gerado por idioma atual → en-US → templateId, com deduplicação dentro do lock do arquivo Personal.
Depois disso, alterar apenas campos de conexão não grava o nome herdado; apenas uma renomeação explícita grava o `providerName` externo, e mudança de idioma não altera nomes já salvos.

### 3.2 Provider Access

O tipo de união formal de Access tem apenas duas variantes:

```ts
type ProviderAccessConfig =
  | {
      type: "api-key";
      apiKey?: string | null;
      apiKeyManagementUrl?: string | null;
    }
  | {
      type: "zhipu-account";
      accountType?: "zai" | "bigmodel" | null;
      mode?: "start-plan" | "individual-coding-plan" | "team-coding-plan" | "off-peak" | null;
      entitled?: boolean | null;
    };
```

`group`, `accountType` e `mode` não se repetem:

- `group` é o agrupamento estático de produto do Provider;
- `accountType` é a identidade de acesso dentro do sistema de contas da Zhipu;
- `mode` é o modo de acesso do Provider para aquela conta.

`entitled` é o único fato de configuração que indica se a conta atual tem qualificação de produto para aquele Account Provider fixo. Não existe `enabled` no nível superior do Provider.
A Config `zhipu-account` não guarda ID de conexão de conta, ID de produto, escopo de organização／projeto, Token ou protocolo de validação de segurança da requisição. O protocolo de execução da conta ainda pode ter campos como
`planKind` e `productId`, mas eles pertencem à conta, ao plano ou ao contexto da requisição, e não ao Schema de Provider Config.

### 3.3 Model Config

```ts
interface ModelConfig {
  enabled?: boolean | null;
  properties?: {
    requiresMfjsToolSchema?: boolean | null;
    contextWindow?: number | null;
    inputFormat?: {
      supportsText?: boolean | null;
      supportsImage?: boolean | null;
      supportsVideo?: boolean | null;
      supportsAudio?: boolean | null;
      supportsPdf?: boolean | null;
    } | null;
    outputFormat?: {
      supportsText?: boolean | null;
    } | null;
    supportsToolCall?: boolean | null;
    supportsJsonSchemaOutput?: boolean | null;
    supportsNativeWebSearch?: boolean | null;
    supportsMidConversationSystem?: boolean | null;
  } | null;
  optionSpecs?: {
    reasoningLevel?: EnumOptionSpec | null;
    maxOutputTokens?: LimitOptionSpec | null;
  } | null;
}
```

Esses campos usam o mesmo nome e a mesma estrutura aninhada desde a Config, o Registry e o protocolo entre processos até o Active Model. O Runtime não deriva
`supportsImages`, capability map ou outro DTO de mídia.

A Effective Model Config deve completar:

- `enabled`; MFJS é `properties.requiresMfjsToolSchema`, sem duplicação no nível superior de ModelConfig;
- `properties` completas e todas as folhas de input／output format;
- o Option Spec de `maxOutputTokens` e seu `map` completo;
- o Option Spec de `reasoningLevel` e seus `values` ordenados não vazios e o `map` completo; modelos sem suporte a raciocínio usam
  `values: ["disabled"]` e um Patch vazio `map: "{}"`.

Os campos de `reasoningLevel` são apenas `values`／`map`, e de `maxOutputTokens` apenas `max`／`map`; o nome do membro já determina a forma da opção,
e não se persiste mais o `type: "enum"/"limit"` duplicado. Isso não afeta o discriminator do tipo de união de Provider API／Access.

O comportamento de raciocínio de um modelo concreto só pode ser expresso por Model Config Rules; o Runtime de produção não embute intensidade de pensamento, patch de requisição
ou estratégia de replay por model ID concreto. O `map(value)` em CEL restrito de cada Option Spec gera diretamente o JSON Merge Patch do Request Body bruto final;
o Adapter aplica o mesmo mapeamento apenas depois de o AI SDK gerar o Body base e antes da validação de segurança da requisição, sendo responsável pela codificação de protocolo e pelos limites de sua capacidade real de codificação.

### 3.4 Model Config Rule

O conjunto ao qual a regra pertence expressa explicitamente a camada; os registros dentro do arquivo não repetem `type`:

| Conjunto                              | Identidade de casamento                              | Conteúdo                                  |
| ------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| modelRules                            | modelMatch                                           | ModelConfig esparsa                       |
| modelApiRules                         | modelMatch + apiTypeMatch                            | ModelConfig esparsa                       |
| providerSiteRules                     | modelMatch + baseUrlMatch, apiTypeMatch opcional     | ModelConfig esparsa                       |
| templateModelRules                    | templateId + modelId                                 | ModelConfig esparsa                       |
| builtinProviderModelRules             | providerId + modelId                                 | ModelConfig esparsa                       |
| Personal providerModelRules           | providerId + modelId                                 | sobrescrita exata da configuração inteligente |
| Personal manualProviderModelRules     | providerId + modelId                                 | configuração manual completa; só `enabled` admite herança／null |

Os schemas estritos dos três Match rejeitam condições entre camadas e `providerMatch`. As regex casam a string inteira, nomes de modelo ignoram maiúsculas／minúsculas, URLs usam valores normalizados; a ordem dos arrays de cada conjunto é preservada.
A mesma identidade não pode estar ao mesmo tempo nos conjuntos inteligente／manual. A configuração manual não herda outros parâmetros e mantém apenas a semântica independente de ativar／desativar de `enabled`; ao salvar, todas as folhas aninhadas obrigatórias e expressões são validadas em conjunto.

## 4. Resolução, projeção de Settings e Registry

### 4.1 O Resolver é o único ponto de convergência

O Resolver é responsável por:

1. permitir que o Account Overlay atue apenas sobre Providers ZCode Built-in;
2. calcular o Effective Provider de `Built-in -> Account -> Personal`;
3. combinar as Effective Model Rules;
4. resolver os membros finais de modelo, sua origem e sua ordem;
5. resolver a Effective Model Config para cada `providerId/modelId/api.type/api.baseUrl`;
6. calcular separadamente issues, enabled, entitled, executable e selectable;
7. produzir simultaneamente os candidatos de Settings e o conjunto executável do Registry.

Renderer, UI de uso, cartão de plano, ModelFactory e Adapter não podem reimplementar esse Overlay ou a derivação de membros.

### 4.2 Settings View e Registry são duas projeções da mesma resolução

```text
                    ProviderConfigResolution
                      /                 \
                     /                   \
       resolvedProviders                 registryProviders
       完整 + 不完整候选                  仅完整可执行项
              |                                  |
              v                                  v
    Provider Settings Facade               Provider Registry
```

A Settings View precisa preservar:

- o Effective Provider;
- a linha de base Built-in após efeito da Account;
- o Personal Provider Overlay;
- para cada modelo, o Effective, o Effective Built-in e a sobrescrita exata Personal;
- problemas de completude e estado de execução.

Assim a página de configurações pode editar ou corrigir configurações que ainda não entraram no Registry. O Registry mantém apenas Providers habilitados, completos e com pelo menos um modelo executável,
e dentro deles apenas os modelos executáveis.

### 4.3 Account Provider Config

A Account Provider Config é um Overlay formal de Provider, mas apenas projeta o efeito dos fatos upstream da conta sobre os Account Providers Built-in:

```text
账号登录、Family 选择、套餐选择、权益接口
                    |
                    v
       Account Connection Resolver
       ├─ providerId
       ├─ entitled / not-entitled / unknown
       `─ 服务端明确返回的账号模型集合
                    |
                    v
         Account Provider Config
       └─ access
          ├─ type / accountType / mode（继承 Built-in）
          ├─ entitled
          `─ builtinModelIds（若服务端返回）
```

Regras específicas:

- O Account Provider é declarado fixamente pelo Built-in e entra na Family correspondente;
- quando a conta atual tem explicitamente o produto, grava `access.entitled=true`; quando explicitamente não tem, grava `false`;
- Individual／Team herdam por padrão os membros de modelo Built-in;
- os modelos do Start Plan variam por conta; em caso de sucesso, usa-se o conjunto de modelos retornado pela interface para restringir `builtinModelIds`;
- quando o Start Plan não tem um conjunto de modelos confiável, mantém-se o último Account Overlay utilizável; na primeira vez sem fatos utilizáveis, adota-se fail-closed;
- um `unknown` por falha temporária de consulta mantém o último Account Overlay, evitando oscilação; na primeira vez sem fato histórico, adota-se fail-closed;
- credenciais dinâmicas não são gravadas na Account Provider Config.

O `unavailableReason` opcional do Account State é transmitido com o mesmo snapshot, e o protocolo estrito entre Host e CLI reutiliza o schema de reasons compartilhado.
Para planos pessoais, se o servidor explicitamente disser que não há direito, exibe-se como não contratado; se o usuário estiver autenticado mas a obtenção da Key falhar, exibe-se falha de obtenção e reutiliza-se a atualização manual para tentar de novo, sem inferir invalidação de OAuth nem forçar novo login só pela ausência da Key.
Z.ai e BigModel usam a mesma classificação. O reason pertence apenas ao fato de execução e não é gravado na Provider Config;
a decisão específica e a verificação estão em [Todo114](../steps/todo-114-account-status-sync-and-key-retry.md)（antigo Todo105 upstream）.

O revision de Account e o de Built-in devem estar pareados. Quando o Built-in é atualizado mas a Account ainda está baseada na revisão antiga, o Registry continua servindo o snapshot completo anterior,
aguardando o recálculo da Account Source para publicar atomicamente; não se pode publicar o estado intermediário "Built-in novo + Account antiga".

### 4.4 A página de configurações não entende o Account Overlay

A página de configurações consome diretamente o Effective Provider／Model final da Provider Settings View; ela não lê, reproduz nem infere o Account Overlay.
Plano, cota, erro de conexão e status de compra são projeções de produto independentes, que só controlam o cartão de status e as ações correspondentes, e não decidem se a seção de configuração do Effective Provider,
a lista de modelos ou a entrada de edição de modelo existem.

Individual／Team Coding Plan pode ocultar Endpoint e API Schema na UI de produto, mas esses campos continuam existindo por completo no Effective
Provider Config e são consumidos pelo Registry, pelo ModelFactory e pelo Runtime. Ocultar é uma decisão de exibição, não um DTO de Account sem campos.

Esse fechamento da página foi concluído pela Todo 32: os detalhes de Team／Individual resolvem com precisão por `providerId` a partir da Provider Settings View; o cartão de status do plano
não controla mais a existência da seção de configuração do Provider nem da lista de modelos; e a página não remove campos do Effective Provider Config ao ocultar Endpoint／API Schema.

### 4.5 Start como Provider independente (Todo154)

Em 2026-09-16 o usuário tomou decisões camada por camada: o Start reutiliza o login atual do App, sem conexão separada, e fica disponível simultaneamente com o plano pessoal／de equipe atual; não se inicia a coexistência completa de Todo101 entre pessoal／multiteam.

- Mantêm-se os dois Start Provider ID, com nome de exibição unificado; cada um mantém o logo de Z.ai／BigModel. Filtrados pela marca atual, são exibidos de forma independente no grupo "智谱" existente, reutilizando os detalhes e removendo apenas conectar／desconectar. Sem Provider virtual, fusão de ID ou mapeamento de identidade de exibição.
- Mantém-se `current`, interpretado como o contexto de acesso da conta atual. O Start não depende de uma seleção paga; pessoal／equipe continuam dependendo da seleção paga atual. É permitido que o Start e um plano pago estejam ambos com `current=true`; direito, completude de modelo, habilitação e credenciais da requisição são validados de forma independente. A Start connectionKey não inclui a seleção paga.
- O Start resolve pelo Provider ID／modelId／options salvos e sai do mapeamento de única conexão paga atual; pessoal／equipe mantêm o mapeamento original. Quando o Start expira ou é de outra marca, o Provider não é substituído automaticamente.
- As requisições do Start reutilizam diretamente o `zcodeJwtToken` do login atual da marca correspondente, dispensando a condição de que `selection.kind` seja igual a Start; a autenticação original é preservada, sem copiar token, sem nova verificação de corrida ao trocar de conta e sem mecanismo de interrupção.
- Não se migram dados de modelo, não se cria snapshot de conexão de upgrade, versão de migração extra ou conversão de toda a base. O antigo `kind:start-plan` permanece legível, mas não controla a execução do Start; não se escreve mais esse valor para habilitar o Start. A primeira inicialização paga mantém a ordem original, e valores antigos não podem ser tratados como estado vazio de novo usuário causing escolha indevida de plano.
- Ao submeter／criar, se o plano atual for pago, o mesmo modelo tiver cota explicitamente disponível no Start e as opções de raciocínio forem compatíveis, exibe-se o aviso "切换套餐／不了" e "不再提示". A troca altera apenas a seleção de modelo da entrada atual e então continua a submissão／gravação original, sem mudar a conexão paga global; cota desconhecida não bloqueia a submissão original.
- A recomendação cobre novas submissões de conversa, criação／edição de modelo em tarefas agendadas, nova geração manual de Wiki e o salvamento imediato de modelos explícitos em Subagentes customizados, Subagentes embutidos／de plugin. Herança／default não mudam. Bot, execução imediata, disparo／execução em background, ocioso, execução de fila já submetida, retry da requisição original e a tela de falha de Wiki não avisam; salvar e executar avisa apenas uma vez, na etapa de salvamento.
- "Não avisar de novo" é uma preferência persistente unificada do App／Host atual, válida entre entradas e reinícios, obedecida pelo celular do mesmo Host, sem adicionar sincronização de conta entre dispositivos; ela desliga apenas a recomendação, não define plano padrão, não muda o modelo de outras entradas, e na próxima vez a execução segue a escolha salva em cada entrada, sem mascarar erros reais de cota／credencial.
- O Start mantém a faixa de cota existente e o feedback de indisponibilidade; a notificação global de falha de conexão observa apenas pessoal／equipe, mantém a sugestão entre planos pagos e remove a ação de trocar escrevendo uma conexão de Start.

Session／rascunho comuns já têm escrita de volta na submissão; Automation／configuração de Subagente explícita de longo prazo não têm necessariamente escrita de volta. Não migrar é uma escolha de novo comportamento já confirmada e não significa que o resultado válido de toda configuração antiga permaneça idêntico; as evidências específicas e a inferência de migração completa que foi revertida estão em [C25](./evidence-and-contradictions.md#c25-start-独立-provider-与现行单连接语义).

O objetivo desta seção foi implementado conforme a autorização de 2026-09-16. A semântica completa dos botões, a matriz de entradas, a atribuição de estado e as evidências de verificação são mantidas por [Todo154](../steps/todo-154-start-plan-independent-provider.md). O Start é resolvido com precisão como ordinary na fachada node compartilhada; a recomendação reutiliza UsageEntitlement e SettingService, e o campo de preferência é `startPlanRecommendationDismissed`. Built-in → Account → Personal, o Registry do Environment de destino, continuous／replayable e o owner da submissão original permanecem.

## 5. Seleção, criação e execução

### 5.1 Model Selection é intenção esparsa do usuário

Model Selection guarda apenas:

```ts
interface ModelSelection {
  providerId: string;
  modelId: string;
  options?: {
    reasoningLevel?: string;
  };
}
```

Ela não copia Endpoint, API Schema, capacidades, credenciais, snapshot de Provider ou Effective Config. Na submissão, deve ser validada contra o Registry atual do Environment de destino;
um workspace remoto não pode prever no Registry local e depois enviar o fato de execução local para lá.

### 5.2 O ModelFactory fixa os fatos completos de execução

```text
ModelSelection
      |
      v
目标 Environment Provider Registry
      |
      v
ModelFactory
├─ Provider API / Endpoint / Access
├─ Model properties / optionSpecs
├─ 默认与用户 options
├─ optionSpecs.*.map -> 最终原始 Request Body
`─ 本次请求依赖
      |
      v
不可变 Model
```

- Providers do tipo API Key usam a Key salva na Config;
- Providers de conta Zhipu obtêm as credenciais dinâmicas atuais no momento da requisição, pelo serviço de acesso da conta;
- Off-Peak continua usando um Provider ID fixo para expressar a identidade de produto precisa, e `zhipu-account + mode=off-peak` para expressar a forma de acesso;
- quando falta material de acesso dinâmico, a falha é explícita antes da requisição de rede;
- Retry pode renovar os materiais dinâmicos da mesma forma de acesso, mas não pode mudar o Provider, o Model ou a identidade da configuração estática.

### 5.3 Todos os ramos de execução usam o mesmo Model

Requisição normal, Compact, Memory, subagente e Off-Peak devem usar o Model／ModelFactory formais:

- Compact usa o Active Model deste turno, sem voltar ao Model default da Session;
- trabalhos assíncronos como Memory preservam o Model que os criou ou um fato de execução imutável de estrutura equivalente;
- subagentes herdam por padrão o ModelFactory do pai; com seleção explícita, criam seu próprio Model pelo mesmo Registry;
- Off-Peak cria o Model com precisão a partir de um ModelSelection padrão e um Provider oculto fixo, sem modificar a Selection da Session comum;
- o gating de mídia lê `Model.properties.inputFormat`, respeitando ao mesmo tempo a capacidade real de codificação do Adapter.

Não existem ModelRef, ModelConnectionPort, Registry de execução do AI SDK, Legacy Model Catalog, capability map do Runtime nem
um segundo Registry estabelecido para execuções especiais.

## 6. Propriedade de estado e fronteira de submissão

A seleção de modelo precisa distinguir quatro estados:

```text
Composer Draft Selection
        |
        | 提交时原子冻结
        v
Submission Selection
        |
        v
Session Current Selection
        |
        | 创建本次执行
        v
Active Model
```

- Composer Draft é um rascunho não submetido;
- Submission Selection é a seleção precisa aceita por esta submissão do usuário;
- Session Current Selection é o default posterior;
- Active Model é o fato de execução já criado e congelado.

Fila, etapas de Guide, restauração e troca de modelo não podem fundir essas quatro camadas. Execuções auxiliares como Off-Peak também não podem alterar o Session Current Selection.

Quando o Guide carrega uma seleção, ele ainda resolve e cria o Model pela Factory existente, garantindo que atualizações de configuração sejam usadas nas requisições seguintes.
A reconstruction de prefixo de troca de modelo compara apenas o Provider, o modelo e o nível de raciocínio entre o Loop atual e o novo Model de execução; recriação de objeto ou mudança de limite de saída não equivale a troca de modelo. O evento de seleção da Session ainda compara a Session antes e depois da submissão e não substitui a comparação de Loop.
Este turno não altera o congelamento de estilo de saída de uma troca real de modelo, nem a admission／atribuição do Guide ou o transporte multi-dispositivo.

## 7. Environment, refresh e persistência

### 7.1 O Environment de execução tem seus próprios fatos

Cada Environment que realmente executa o modelo possui seu próprio:

- ZCode Built-in Config Source;
- Personal Config Repository;
- Account Provider Source;
- Resolver, Registry e ModelFactory.

Local, SSH, WSL, Docker ou Server são lidos pelo respectivo Host／Worker a partir da configuração deste Environment. O Host não envia snapshot de Registry ao Worker,
nem torna o Renderer a autoridade de configuração. Provisionamento remoto, edição remota e sincronização de login são capacidades de produto independentes e não fazem parte do refactor central de Provider.

### 7.2 Atualizações de Config devem ser atômicas e autotratáveis

- O Repository usa casca de versão, escrita atômica, lock de arquivo e revision; isso é implementação de armazenamento, não um Config Document no domínio de Provider.
- O watcher de Source apenas notifica "os fatos podem ter mudado"; o Registry Service relê a Config completa e o snapshot de Account e então resolve e publica de uma vez.
- Durante o refresh, continua-se servindo o Registry completo anterior; falhas não publicam um resultado parcial e eventos posteriores devem conseguir se recuperar e tentar de novo.
- A publicação remota de Built-in usa duas camadas: casca de metadados de versão／refresh + conteúdo puro de Provider／Model Config.
- O cache ativo de Built-in é isolado por ZCode Endpoint, evitando que diferentes Environments reutilizem configs erradas.
- Depois que a gravação em Settings termina, a entrada de execução precisa observar o novo Registry do Environment correspondente; o teste de conexão deve criar o modelo pelo Host Registry／ModelFactory formais, sem montar temporariamente outro Model no Renderer.

### 7.3 Nomes de Config e casca física

Os nomes de domínio são fixos:

- ZCode Built-in Provider Config;
- Account Provider Config;
- Personal Provider Config;
- Effective Provider Config;
- ZCode Built-in Model Config Rules;
- Personal Model Config Rules;
- Effective Model Config Rules;
- Effective Model Config.

Não se usa `Official Config` como apelido atual, nem se constrói `Document` como estado intermediário de domínio. `schemaVersion`, `revision`, hora de refresh remoto e migração de arquivos pertencem apenas à casca de publicação ou do Repository.

O arquivo Builtin final é `{ schemaVersion: 1, revision, config }`: dentro de config,
`providerConfigRules` contém `templateRules/providerRules`, e `modelConfigRules` contém os cinco conjuntos Builtin acima.
O arquivo Personal é `{ schemaVersion: 1, config }`: dentro de config, `providerConfigRules.providerRules`,
`modelConfigRules.providerModelRules/manualProviderModelRules` são obrigatórios (podem estar vazios), e há também `providerOrder/defaultModelSelection` opcionais.
O adaptador de seleção default reutiliza o mesmo Personal Repository, sem arquivo, lock ou watcher separados. Atualização de campos comuns preserva membros não modificados;
a distribuição completa substitui a config inteira, e a ausência da seleção default significa limpá-la. Falha na distribuição reverte o arquivo inteiro por CAS, sem sobrescrever conteúdo novo reescrito pelo usuário durante a operação.

Os arquivos mantidos pelo programa no diretório de configuração do Environment são uniformemente:

```text
runtime/provider/
  <platform>/<appVersion>/<endpoint-key>/
    zcode-builtin.json
    zcode-builtin-refresh.json
  provisioning.json
  bundled/zcode-builtin.json
```

A cópia embutida tem caminho fixo; conteúdo idêntico é reutilizado e conteúdo alterado é substituído atomicamente; download／refresh continuam isolados nas três dimensões. A atualização pressupõe a saída do processo antigo e não mantém cópias históricas de hash.
A revision Builtin em runtime inclui o escopo de caminhos canonizados ativos e o número de sequência da publicação, e é一致 entre Host e Worker que lê aquele caminho;
Endpoints diferentes com o mesmo número de sequência não são mais deduplicados indevidamente pelo Registry. O número de sequência em disco continua monotônico, e a mesma origem com o mesmo número de sequência deve ter o mesmo conteúdo.
O schemaVersion dos registros de refresh, do estado de distribuição e do envelope de distribuição também é 1; o Bot mantém o version3 atual e não entra no reset.

## 8. Escrita em Settings e fronteira de interação

- A página de configurações lê a Provider Settings View via Facade／Hooks e não acessa o Repository diretamente.
- A edição do Draft pertence ao Renderer; o salvamento é executado atomicamente pelo Provider Config Service do Host.
- Campos estáticos de um Provider Built-in podem ser exibidos como somente leitura; o Personal Overlay grava apenas o que o usuário mudou explicitamente.
- Renomear, criar, excluir e ordenar Providers／Models são operações de domínio explícitas; um salvamento comum não carrega semântica de criação ou ressurreição.
- Escritas no mesmo Provider são serializadas; Model Draft usa revision para impedir que um salvamento tardio sobrescreva uma edição mais nova.
- O teste de conexão salva primeiro o Draft atual, aguarda a atualização do Registry formal e então faz uma sondagem real de protocolo pelo ModelFactory; como uma requisição auxiliar de baixo custo ele usa `reasoningLevel.values[0]` e explicitamente
  `min(5000, optionSpecs.maxOutputTokens.max)`.
- O feedback de salvamento, de conexão bem-sucedida ou com falha pertence à faixa inferior da coluna de detalhes do Provider atual; um novo estado da mesma operação substitui o estado antigo e não pode ser empurrado para fora da janela atual pela lista longa de modelos. A interação visual concreta não altera a autoridade da Config ou do Registry.

## 9. Limites de compatibilidade e de remoção

As únicas compatibilidades permitidas são fronteiras explícitas e pontuais:

- o importador antigo de Personal Config pode ler campos históricos já publicados e projetá-los imediatamente como o novo Personal Overlay;
- protocolos históricos de conta, produto e Usage podem continuar usando seus próprios `planKind/productId`, mas não podem voltar a entrar na Provider Config;
- o interior de um Adapter pode usar helpers locais do protocolo, mas não pode reexpor tipos antigos de capability como fonte de fatos de Model.

Está proibido reaparecer na Config, Registry, Model e Runtime formais:

- a via dupla de `Official Config`;
- os objetos de domínio `ProviderConfigDocument` / `ModelSelectionConfigDocument`;
- Access `request-auth` / `execution-provided`;
- `accessId`, `planKind` estático, `challenge`, `requestSigning`, `executionProtocol`;
- `executionOnly` ou interruptores de escape de "execução confiável";
- `visibility` de Model;
- `adapterCompatibility`, `reasoningReplay` e hardcode de Runtime por modelo concreto;
- `modalities`, `supportsImages/Pdf/Video` achatados ou um segundo conjunto de DTOs de capability;
- `ModelRef`, `ModelConnectionPort`, Legacy Catalog／Preset e um segundo Registry de execução.

## 10. Invariantes centrais

1. Os fatos estáticos de Provider têm apenas três fontes: ZCode Built-in, Account Overlay e Personal Overlay.
2. Os fatos estáticos de Model têm apenas ZCode Built-in Rules e Personal Rules; Personal vem depois, e o Personal exato vem por último.
3. A Effective Model Config precisa ser resolvida no contexto de API do Effective Provider.
4. Settings e Registry vêm da mesma resolução do Resolver; Settings não infere config incompleta a partir do Registry.
5. O Registry contém apenas itens completos e executáveis, mas um Provider hidden ainda pode ser executado com precisão internamente.
6. O Account Overlay só restringe Account Providers Built-in; o conjunto de modelos do Start Plan pode variar por conta.
7. Credenciais dinâmicas de conta não entram na Config; a Config de API Key pode conter a API Key; a autorização final é do servidor.
8. O ModelFactory só consome a config completa do Registry atual; o Active Model congela após a criação.
9. A identidade de Provider／Model é sempre `providerId/modelId` e não se pode rotear apenas por modelId.
10. UI de produto, cartão de plano, Usage e erros de conexão não podem ser fonte de fatos de configuração de Provider／Model.
11. Não se estabelece um segundo conjunto de fatos de modelo para Off-Peak, teste de conexão, Compact, Memory, subagente ou execução remota.
12. Se o código atual divergir do design já decidido, isso deve ser visto como drift de implementação, e não como novo design implícito.

## 11. Trabalhos inconclusos que não alteram o design

### Fronteira de start／leitura de Provider (Todo128)

`ProviderRuntime`, `NodeProviderConfigRuntime`, `NodeProviderRegistryRuntime`,
`ProviderRegistryService` e a camada de repasse de Config dos Services unificam `start(): Promise<void>`.
Ele apenas aguarda a primeira prontidão e mantém a deduplicação／retry de falha／liberação existentes; não retorna um snapshot de inicialização para cache de longo prazo.
O código de negócio lê explicitamente `configService.read()` ou `registryService.getSnapshot()`, e o refresh explícito continua passando por
`refresh()`. O estado atual significa o estado concluído mais recente e não espera implicitamente por requisições de conta futuras. A elegibilidade e o despacho em período ocioso seguem a mesma
resolução de credenciais apoiada pelo Registry, sem novo owner de estado.

### Outros pendentes

- Todo 15: registro de escopo de verificação de publicações históricas, obsoleto e que deixa de ser um Todo independente;
- Todo 19: discussão histórica de gate de release do Built-in, obsoleta e que deixa de ser um Todo independente;
- Todo 22: adicionar Built-in Provider e Access de plataformas de nuvem, ainda em rascunho;
- Todo 11 / 11A: rascunho de limpeza de composição do Runtime e questão de liberação, que não podem mudar este design antes de uma decisão;
- integração final com o `origin/staging` mais recente e verificação real no produto.

Esses itens podem complementar a verificação, as projeções de produto ou a limpeza de implementação, mas, se quiserem alterar as camadas de configuração, o Access Schema, a autoridade do Registry ou o ciclo de vida do Model descritas aqui, é preciso antes formar uma nova decisão explícita e atualizar este documento.
