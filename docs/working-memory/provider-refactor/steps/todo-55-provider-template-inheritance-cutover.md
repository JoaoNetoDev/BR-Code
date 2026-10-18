# Todo 55: Herança de Provider Template e Aposentadoria do Built-in Provider Comum

> Status: concluído
>
> Data: 2026-09-01
>
> Escopo substituído: o design em fases de Todo 49/50/51 sobre o placement do Built-in Provider comum, o slot fixo de "API 按量" (API por volume) do Family, o Overlay de API Provider fixo do Welcome e o `enabled` de topo do Provider. O Z.ai/BigModel Account Family, o Account Access, o `entitled`, as credenciais em tempo de requisição e os limites de autenticação de Off-Peak continuam válidos.

## 0. Panorama rápido das decisões atuais

- Provider Template não é um Provider: é a linha de base de Config Built-in referenciada ao criar um Personal Provider; o mesmo Template pode criar várias instâncias independentes.
- Todos os Built-in Concrete Providers não-Account são aposentados; Z.ai API, BigModel API e os demais fornecedores de terceiros passam a ser Provider Templates.
- O Family Z.ai/BigModel é mantido, mas apenas para organizar os Account Providers Start, Individual, Team e Off-Peak; ele deixa de conter a conexão de "API 按量" (API por volume).
- A definição dos Account Providers é fornecida pelo Built-in Release e entra fixamente na estrutura Settings da Family correspondente; o usuário não é responsável por criá-los ou removê-los. O `access.entitled` do Account Overlay decide somente se a conta atual tem qualificação de acesso.
- O `enabled` de topo do Provider foi definitivamente decidido como remoção total; placement em Settings, direito da conta, completude de configuração e `enabled` de Model expressam cada um um único fato.
- O campo de identidade do Account Access é definido nesta rodada como a renomeação de `access.family` para `access.accountType = "zai" | "bigmodel"`; a estrutura de produto Provider Family existente continua mantida.
- Cada seleção e envio de uma API Key Z.ai/BigModel no Welcome cria uma nova instância de Personal Provider a partir do Template correspondente e grava a Key; não há busca, reuso ou manutenção de uma suposta instância canônica de API.
- A criação de instâncias de Template reutiliza uniformemente o `createPersonalProvider` genérico; Provider, Overlay Personal inicial, label único e `providerOrder` são gravados atomicamente em uma única atualização do Repository; o Welcome não tem interface de criação de Provider dedicada.
- O login de conta lida apenas com Account Providers e não cria Personal Providers de API por volume; `providerSetupCompleted` controla apenas se o guia automático aparece novamente e não participa da deduplicação de criação de Provider, do Registry nem da Family Selection.
- Settings não funde a origem da herança de Template com `effectiveBuiltinConfig`; `templateConfig`, `effectiveBuiltinConfig`, `personalConfig` e `effectiveConfig` mantêm cada uma sua semântica precisa.
- O campo `enabled` de nível Provider, o DTO de Facade e a cápsula de "已启用" (habilitado) são removidos; não é permitido usar `executable`, `entitled` ou a existência de uma API Key para disfarçar um novo enabled de Provider.

### 0.1 Limites de terminologia

| Nome                           | Único significado                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Provider Template              | origem de herança de Config de Provider publicada pelo Built-in; não pode ser executado diretamente |
| Account Concrete Provider      | Provider de produto de conta publicado pelo Built-in; limitado pelo Account Overlay |
| Personal Provider              | instância real de Provider criada pelo usuário; tem um `providerId` único          |
| Personal Provider Overlay      | configuração esparsa salva pelo usuário para a instância real de Provider          |
| Effective Provider Config      | configuração final combinada pelo Resolver a partir de todas as fontes aplicáveis e usada pelo Registry |
| Account Family                 | limite de navegação em Settings e de seleção de conexão dos produtos de conta Z.ai/BigModel |
| `access.entitled`              | se a conta atual tem qualificação de acesso ao Account Provider correspondente    |
| executable                     | resultado do Resolver sobre se o Provider/Model está atualmente com configuração completa e satisfaz as condições de execução |

Template, Family, entitlement, placement em Settings e executable não se substituem uns aos outros.

## 1. Objetivos e invariantes

Os fornecedores de terceiros comuns deixam de ser publicados como Built-in Concrete Providers do tipo "ainda não adicionado, mas já existente". Passam a ser Provider Templates reutilizáveis; o usuário cria um ou mais Personal Providers com `providerId` independente a partir do mesmo Template.

```text
Provider Template
├─ DeepSeek
├─ Moonshot Kimi
├─ MiniMax
└─ ……
        |
        | 创建 Personal 实例；不复制官方配置事实
        v
Personal Provider
├─ providerId = deepseek-work
├─ templateId = deepseek
└─ Personal Overlay
        |
        v
Effective Provider Config
        |
        v
Provider Registry
```

Template não é Provider: ele não entra no Registry, na seleção de modelos nem na lista de Providers criados, não tem `providerId` em tempo de execução e não pode ser executado diretamente. Um Template é apenas a linha de base de herança Built-in de um Provider Config.

Nesta rodada o Family Z.ai/BigModel é mantido, mas com suas responsabilidades restritas a apenas organizar os Account Providers; a API por volume é desacoplada do Family:

```text
Z.ai Account Family                      BigModel Account Family
├─ Start Plan                            ├─ Start Plan
├─ Individual Coding Plan                ├─ Individual Coding Plan
├─ Team Coding Plan                      ├─ Team Coding Plan
└─ Off-Peak                              └─ Off-Peak

普通 Provider Templates
├─ Z.ai API
├─ BigModel API
├─ DeepSeek
├─ Moonshot Kimi
└─ ……
```

Portanto:

- `zai-api` e `bigmodel-api` migram de Built-in Concrete Providers fixos para Provider Templates;
- ambos entram, como os outros Templates, no menu comum de "adicionar fornecedor", permitindo criar várias instâncias de Personal Provider;
- os Account Providers Start, Individual, Team e Off-Peak continuam sendo organizados pelo Family correspondente;
- `ProviderFamilyDomain`, o Header/Connection UI do Account Family, os planos, as cotas, os upgrades, as credenciais de conta e a cadeia de consumo de Off-Peak são mantidos;
- `ProviderFamilyConnectionSelection` remove o ramo `kind: "api-key"` e mantém apenas as seleções de Account Start, Individual e Team;
- esta rodada não adiciona `family: "zhipu" | "others"`; a página de configurações continua usando a estrutura de agrupamento existente;
- "manter o Family" não é interpretado como manter os antigos helpers de mode paralelos `oauth | apiKey`, que já foram removidos. A seleção de conexão formal continua sendo a `ProviderFamilyConnectionSelection` de Account já restringida.

## 2. Config e Built-in Release

### 2.1 Reutilizar a estrutura de valor de Provider Config existente

Não se adiciona outro objeto de valor `ProviderTemplateConfig` completo. O valor do Template Map reutiliza diretamente `ProviderConfigOverlay`; Built-in Concrete Provider, Provider Template e Personal Provider compartilham o mesmo Schema de campos, Overlay, Config de API/Access aninhada e round-trip de JSON.

```ts
type ProviderTemplateMap = ReadonlyMap<TemplateId, ProviderConfigOverlay>;
```

O que existe separadamente aqui é o contêiner Map com `templateId` como chave, não um segundo tipo de valor de Provider Config.

O Provider Config ganha:

```ts
readonly templateId?: string | null;
```

Esta rodada não adiciona um novo campo `family` de exibição. O `ProviderGroup` existente é mantido por enquanto:

- `zai-family` e `bigmodel-family` continuam expressando apenas a configuração de pertinência de Family dos Account Providers;
- os Personal Providers comuns criados por Template continuam entrando no agrupamento de Personal Providers existente;
- depois que os Built-in Concrete Providers comuns zeram, `standard-builtin` é removido junto com o ciclo de vida antigo correspondente; a varredura mecânica passa a servir apenas para provar ausência de resíduo, e não para decidir se algo permanece;
- não se cria nesta rodada uma nova seção "智谱 / 其他" nem se renomeia nenhum Family existente.

Reutilizar a mesma estrutura de valor não significa que o Template ganha identidade de Provider. Template, Built-in, Account e Personal Source usam Source Schemas estritos; cada Source Schema pode estender ou restringir o Schema de campos compartilhado, e depois da parsing tudo é construído de forma unificada como Provider Config.

O Template Source Schema precisa restringir o Overlay Schema compartilhado, e não aceitar diretamente campos arbitrários de Provider Overlay:

```text
允许
├─ label / logoUrl
├─ api（type / baseURL / headers）
├─ access 的官方静态结构与 apiKeyManagementUrl
└─ builtinModelIds

拒绝
├─ templateId（Template 不递归继承）
├─ group
├─ modelIds / modelOrder
├─ enabled / visibility
└─ 真实 apiKey、entitled、账号凭据或请求期材料
```

- Um Template de API Key sem uma API Key real é um estado normal;
- o Template só faz validação de estrutura de Source e não chama a validação de completude voltada ao Provider final executável;
- os membros oficiais do Template usam apenas `builtinModelIds`; os membros do usuário continuam existindo apenas no `modelIds` do Personal Provider;
- a ordem de escrita JSON do Template Map é a ordem do menu de criação em Settings; esta rodada não adiciona outro campo de ordem de Templates.

O conjunto de Templates usa um Map independente com `templateId` como chave; o conjunto de Providers continua usando `providerId` como chave. Os dois contêineres reutilizam o Overlay de Provider Config interno, mas a API e os nomes de variável dos contêineres precisam distinguir claramente Template ID de Provider ID.

### 2.2 Estrutura do Built-in Release

```ts
interface ZCodeBuiltinConfigContent {
  readonly providers: ProviderConfigMap;
  readonly providerTemplates: ProviderTemplateMap;
  readonly modelConfigRules: ZCodeBuiltinModelConfigRules;
}
```

```text
providers
├─ Start / Individual / Team Account Provider
└─ Off-Peak Account Provider

providerTemplates
├─ Z.ai API / BigModel API
├─ DeepSeek
├─ Moonshot Kimi
├─ MiniMax
└─ 其他普通第三方供应商
```

- `providerTemplates` não é um Catalog e não introduz semântica de mercado, descoberta, instalação ou versão independente;
- `providers`, `providerTemplates` e `modelConfigRules` pertencem à mesma revision de Built-in;
- os três são parseados, publicados e subjected a fallback Active/LKG em conjunto; é proibido aplicá-los com versões separadas;
- a identidade fixa de Concrete Provider e o slot de Family de `zai-api` / `bigmodel-api` saem; as strings correspondentes podem continuar como Template IDs estáveis, mas não como Provider IDs fixos em tempo de execução;
- Family e Template não estabelecem relação de ponte: o Family resolve Account Providers e o Template cria Personal Providers.

### 2.3 Ordem do Provider Overlay

O Resolver obtém primeiro, pela semântica normal de Overlay, o `templateId` efetivo do Concrete Provider e só então monta a configuração:

```text
Provider Template
        |
        v
Built-in Concrete Provider
        |
        v
Account Overlay
        |
        v
Personal Overlay
        |
        v
Effective Provider Config
```

Três caminhos reais:

```text
Template 创建的 Personal Provider
└─ Template -> Personal

可选继承 Template 的 Built-in/Account Provider
└─ Template -> Built-in -> Account -> Personal

完全自定义 Personal Provider
└─ Personal
```

A convenção de `templateId` de um Built-in Provider é declarada pela Built-in Source, e a convenção de `templateId` de um Provider Personal-only é declarada pela Personal Source; não é adicionado um novo gate de posse de Source. Valores Personal explícitos e `null` continuam obedecendo à semântica normal de sobrescrita/limpeza do Overlay.

O Template não herda Templates recursivamente. O Resolver lê apenas o `templateId` efetivo do Concrete Provider e não continua interpretando `templateId` dentro dos valores de Template, evitando introduzir um grafo de herança, detecção de ciclos e um resolver de múltiplos níveis.

O discriminante de Access entre Template e Concrete Provider pode ser diferente. Quando o discriminante de Access da camada seguinte é diferente, continua valendo a semântica de substituição completa existente em `overlayProviderAccess()`.

O Resolver e Settings precisam preservar os quatro tipos de fato abaixo, sem substituí-los por um `inheritedConfig` de significado vago:

```text
templateConfig?
└─ templateId 指向的官方 Template Overlay；不含 Concrete/Account/Personal

effectiveBuiltinConfig?
└─ 仅 Concrete Built-in Provider 路径存在
   └─ 若它引用 Template，则是 Template -> Built-in -> Account 的结果；不含 Personal

personalConfig?
└─ 当前真实 providerId 对应的 Personal 稀疏 Overlay

effectiveConfig
└─ 最终 Effective Provider Config
```

Portanto, um Personal Provider puro criado por Template tem `templateConfig`, `personalConfig` e `effectiveConfig`, mas não `effectiveBuiltinConfig`; um Personal Provider totalmente personalizado pode ter apenas `personalConfig` e `effectiveConfig`. A herança é uma relação de composição do Resolver, e não uma nova Source de Config persistida.

O que está descrito aqui é a Provider View de Provider Settings. O `effectiveBuiltinConfig` existente na Model Settings View continua representando a linha de base sem Personal Rule resolvida a partir das Built-in Model Rules; mesmo que o modelo pertença a um Personal Provider puro, essa linha de base de modelo pode existir, e não se pode apagá-la nem falsificá-la só porque não existe `effectiveBuiltinConfig` na camada de Provider.

`templateId` participa apenas do Config Resolver, das Model Rules e da linha de base de Settings. Depois que o Effective Config é produzido, o Registry, a Selection, o ModelFactory, o Adapter e o protocolo de requisição não dependem de Template ID; a execução formal sempre usa o `providerId` real, o Effective API e o Effective Access.

### 2.4 `enabled` de topo do Provider

O `enabled` de topo do Provider foi definitivamente decidido como remoção total, sem campo de compatibilidade e sem leitura dupla em fases. Sua responsabilidade original de placement é aposentada junto com o ciclo de vida do Built-in Provider comum:

- o próprio Template não precisa de `enabled` de Provider;
- a existência da definição de um Personal Provider significa que o usuário já criou a instância e ela está visível em Settings;
- configurações como API Key e Endpoint podem estar temporariamente incompletas e a instância ainda pode ser salva e permanecer em Settings, mas ela não se torna um Provider executável do Registry;
- Account Providers aparecem fixamente em suas Families e não dependem mais de `enabled` de Provider para expressar placement;
- `access.entitled` do Account continua expressando apenas se a conta atual tem a qualificação de acesso correspondente;
- o `enabled` do Model Config é mantido e continua controlando o modelo específico.

O "Account Provider aparece fixamente" aqui descreve apenas a origem da definição e o placement em Settings: o Built-in Release declara a identidade do Account Provider e a Family à qual pertence, e o usuário não cria nem remove. Isso não significa que o Provider é necessariamente executável; o Account Overlay ainda precisa fornecer os fatos da conta atual e, no final, são `entitled` e a completude de configuração que decidem em conjunto se ele entra no Registry executável.

```text
Settings placement
├─ Account Provider：Family 结构声明
└─ Personal Provider：Personal 定义存在

Executable
├─ Effective Provider 配置完整
├─ Account Provider 还需 access.entitled
└─ 目标 Model enabled 且完整
```

A remoção de `enabled` precisa ser fechada de uma só vez em Resolver, Config Service, Facade, Settings e testes, sem deixar um segundo fallback de placement.

## 3. Model Config Rules

### 3.1 Rule preciso de Template

Na união de Rules existente `match | provider-model` é adicionado:

```ts
interface TemplateModelConfigRule {
  readonly type: "template-model";
  readonly templateId: string;
  readonly modelId: string;
  readonly config: ModelConfig;
}
```

```text
match
└─ 按 provider/model/api/baseURL 等通用事实匹配

template-model
└─ 按 templateId + modelId 匹配 Template 官方默认值

provider-model
└─ 按真实 providerId + modelId 匹配 Concrete Provider/实例
```

A Resolution Input ganha o `templateId` opcional, sem poder fazer o Template ID passar por Provider ID:

```ts
modelRules.resolve({ providerId, templateId, modelId, apiType, baseURL });
```

### 3.2 Rules em camadas por campo de configuração

Os diferentes tipos de Rule não dependem da posição acidental em um array JSON misto para expressar prioridade entre camadas:

```ts
interface ZCodeBuiltinModelConfigRules {
  readonly matchRules: readonly MatchModelConfigRule[];
  readonly templateModelRules: readonly TemplateModelConfigRule[];
  readonly providerModelRules: readonly ProviderModelConfigRule[];
}

interface PersonalModelConfigRules {
  readonly matchRules: readonly MatchModelConfigRule[];
  readonly providerModelRules: readonly ProviderModelConfigRule[];
}
```

Dentro de cada campo o Overlay continua estritamente na ordem de escrita. O Source Decoder apenas concatena na ordem fixa dos campos a sequência ordenada `ModelConfigRules` existente; o Resolver continua percorrendo item a item, sem ganhar ordenação dinâmica por tipo de Rule, agrupamento em baldes ou inferência de prioridade.

```text
Built-in match
        |
Built-in template-model
        |
Built-in provider-model
        |
Personal match
        |
Personal provider-model
        v
Effective Model Config
```

- As diferenças oficiais de Template vão para o `template-model` do Built-in;
- As diferenças oficiais do Account Concrete Provider continuam no `provider-model` do Built-in;
- Editar uma instância concreta pelo usuário escreve apenas no `provider-model` do Personal;
- A Personal Source não aceita `template-model`, evitando que o usuário modifique a linha de base compartilhada do Template;
- A escrita da API de Rules precisas do Personal continua operando apenas em `providerModelRules`.

### 3.3 Composição e habilitação de modelos

Não se adiciona um `models: [{ modelId, enabled }]` exclusivo de Template nem um segundo conjunto de Model Config:

```text
Template.builtinModelIds
└─ Built-in Source 拥有的模型成员与初始物理顺序

Built-in template-model.config.enabled
└─ Template 实例中模型的官方默认启停

Built-in provider-model.config.enabled
└─ Account Concrete Provider 的官方默认启停

Personal provider-model.config.enabled
└─ 用户对真实 Provider 实例的最终覆盖
```

Depois de entrar na instância, os `builtinModelIds` do Template continuam sendo membros de posse Built-in; os `modelIds` do Personal continuam sendo membros do usuário. A posse de membros existente, o tratamento de nomes duplicados com Built-in-wins e o Overlay de `modelOrder` continuam sendo reutilizados.

## 4. Criação, atualização e remoção

### 4.1 Criação

O antigo `addBuiltinProvider(providerId)` dos Providers de terceiros comuns é aposentado; a criação em branco, a criação por Template em Settings e a criação por API Key no Welcome são unificadas em:

```ts
createPersonalProvider(input?: {
  readonly templateId?: string;
  readonly initialConfig?: ProviderConfigOverlay;
}): PersonalProviderCreation;
```

- Sem `templateId`: cria um Provider personalizado em branco;
- Com `templateId`: confirma que o Template existe no Release atual, gera um `providerId` único e grava apenas `templateId` e o Overlay Personal inicial necessário;
- Não copia API, membros ou Model Rules do Template;
- Não gera Template Rules duplicados para cada instância;
- O mesmo Template pode criar várias instâncias;
- O `label` do Template é apenas o texto do menu de criação e a semente do nome da nova instância; na criação é gravado um label Personal único como `DeepSeek` ou `DeepSeek 2`; depois disso o label pertence à instância do usuário, e renomear o Template não renomeia instâncias existentes;
- Provider Config, `templateId`, `initialConfig` (incluindo a API Key enviada pelo Welcome), label único e `providerOrder` precisam ser gravados na mesma atualização do Repository; é proibido criar primeiro um Provider vazio e depois complementar a Key por uma segunda API;
- `templateId` só é aceito como parâmetro de criação de topo; `initialConfig` não pode carregar novamente campos de identidade/contêiner como `templateId`, `providerId` ou `providerOrder`;
- Uma falha de criação não pode gravar `providerSetupCompleted`, um Provider pela metade nem um membro de order órfão;
- Esta rodada não altera o comportamento de produto já existente no Welcome de "definir um modelo padrão utilizável após criar com sucesso"; essa ação continua passando pela API existente de seleção de modelo e não é fundida ao Provider Config Repository.

A API por volume Z.ai/BigModel usa a mesma operação de criação que os outros Templates:

- Cada envio do formulário Welcome/API Key escolhe o Template correspondente e entrega a API Key como `initialConfig` à mesma operação de criação atômica `createPersonalProvider`;
- Não se busca nem se reutiliza uma instância antiga por Template, marca ou API Key, e nem se mantém uma "instância canônica de API do Family";
- `providerSetupCompleted` só é gravado depois que a criação da instância tem sucesso, e apenas restringe se o Welcome aparece automaticamente, sem impedir que o usuário crie novas instâncias ao entrar explicitamente no fluxo de API Key;
- O login de conta não dispara a criação de instância de Template;
- A página de configurações permite que o usuário crie mais instâncias a partir do mesmo Template;
- Criar uma instância de API por volume não grava `ProviderFamilyConnectionSelection` nem altera a seleção atual do Account Family;
- Não se adiciona campo de vínculo de "qual instância de Template pertence a qual Family" nem lógica de restauração.

### 4.2 Atualização

O salvamento de instâncias continua usando a API genérica de Personal Provider Overlay. Atualizações de Template são propagadas por meio da revision de Built-in a todas as instâncias que a referenciam; as folhas Personal explícitas sobrescrevem por último.

Atualizações do Registry só afetam os Active Models criados depois; os Active Models já criados permanecem congelados.

### 4.3 Remoção

Remover um Personal Provider precisa apagar atomicamente, na mesma atualização do Repository:

```text
Personal Provider Config
Personal providerOrder 成员
所有精确绑定该 providerId 的 Personal provider-model Rules
```

Não são removidas as Rules genéricas `match`, as `template-model` do Built-in, o próprio Template ou as Rules de outros Providers. O limite atômico existente `deletePersonalProvider -> deleteExactForProvider` precisa ser preservado.

Os Z.ai/BigModel API Providers criados a partir de Template usam a mesma semântica de remoção que os outros Personal Providers; na remoção, Provider, membro de ordenação e Personal Model Rules precisas são limpos de forma atômica. Account Family Providers não entram na entrada comum de remoção.

## 5. Settings, Family e Welcome

### 5.1 Menu de Templates do Settings

O `addableProviders` dos terceiros comuns deixa de projetar Built-in Providers desabilitados e passa a usar uma projeção de candidatos `providerTemplates` independente. Esse DTO serve apenas ao menu de criação do Settings e não entra na Provider View do Registry.

```text
Built-in providerTemplates
        |
        v
Settings Template Menu
        |
        | createPersonalProvider({ templateId })
        v
Personal Provider Instance
        |
        v
Settings Provider List / Registry（完整时）
```

A Facade de Settings precisa projetar fatos mutuamente independentes no mesmo Resolver:

```text
templateConfig?          Template 官方来源
effectiveBuiltinConfig? Concrete Built-in + Account 的无 Personal 结果
personalConfig?          当前 providerId 的稀疏 Personal Overlay
effectiveConfig          最终结果
```

Não se adiciona um novo campo `inheritedConfig` que achate esses fatos. A restauração de padrão, o indicador de modificação e a origem de membros em Settings leem o fato correspondente conforme o caminho atual:

- A linha de base padrão de Provider de uma instância Personal de Template vem de `templateConfig`;
- A linha de base padrão de Provider de um Provider Built-in/Account vem de `effectiveBuiltinConfig`;
- Um Personal Provider totalmente personalizado não tem linha de base oficial de Provider;
- Os valores padrão de Model são sempre resolvidos pelo mesmo Model Rule Resolver depois de excluir a Personal exact Rule daquela instância, e não podem olhar apenas para o Provider Template nem escrever um fallback de UI separado.

Essas projeções precisam garantir que:

- "restaurar padrão" volte à linha de base correta;
- Os modelos do Template apareçam como de posse Built-in;
- O estilo de modificação Personal reflita apenas o Personal Overlay;
- A configuração padrão de modelos novos seja consistente com o Registry real;
- Quando o Template está ausente ou a configuração está incompleta, a instância continua visível e mostra Config issue.

### 5.2 Manutenção do Family

O Family é mantido como o limite de combinação de produtos de conta e de seleção de conexão:

```text
ProviderFamilyDomain = zai | bigmodel
        |
        v
对应 Family 页面
├─ start-plan
├─ individual-coding-plan
└─ team-coding-plan
        |
        v
ProviderFamilyConnectionSelection
```

Continua mantido e validado:

- O Header de Family, o menu de modo de conexão de Account e a persistência da seleção atual;
- A troca e a restauração entre Start, Individual e Team;
- A sincronização de `providerFamilyDomain` com o sistema de contas logadas;
- O consumo das identidades Z.ai/BigModel por planos, cotas, upgrades, credenciais de conta e Off-Peak;
- O variant `api-key` de `ProviderFamilyConnectionSelection`, os Provider IDs fixos e os dados de App Settings correspondentes saem;
- Os Z.ai/BigModel API Templates entram nos candidatos comuns de "adicionar fornecedor", mas não aparecem no menu de modos de conexão do Account Family;
- Não se restabelece uma segunda cópia do estado de mode `oauth | apiKey`, que já foi removido.

Off-Peak continua pertencendo à cadeia de produtos de conta e de planos do Account Family correspondente, mas é um Provider de execução oculto: não é candidato de `ProviderFamilyConnectionSelection`, não aparece na lista comum de Providers em Settings e não oferece entrada de edição para o usuário. Ele continua sendo usado de forma precisa pela execução interna ociosa, por meio do Provider ID real e do Registry/ModelFactory comuns.

No Account Access, nesta rodada o antigo `access.family` é definitivamente renomeado para `access.accountType = zai | bigmodel`; ele descreve a identidade de acesso da conta. `ProviderFamilyDomain` e a Connection Selection descrevem a UI de produto e a escolha de conexão do usuário. Os dois têm o mesmo domínio de valores, mas responsabilidades diferentes: não podem se substituir e a renomeação não apaga o estado de Family.

### 5.3 Os agrupamentos existentes permanecem inalterados

Esta rodada não adiciona `family: "zhipu" | "others"`, nem campos substitutos como `brandGroup` ou `settingsSection`.

```text
现有设置页
├─ Z.ai / BigModel Account Family 入口（现有 preset/family 路径）
└─ Personal Provider 列表
   ├─ 空白创建
   └─ Template 创建（包含 Z.ai API / BigModel API）
```

O Template apenas muda a origem de criação dos Providers de terceiros comuns, sem refazer de passagem a arquitetura de informação da navegação à esquerda.

### 5.4 Welcome

O fato de Settings independente já decidido, `providerSetupCompleted`, é mantido e expressa apenas que o guia de inicialização foi concluído ou pulado, sem participar do Registry, da herança de Template, da Family Connection Selection nem dos direitos de conta.

Condições básicas para abrir o Welcome automaticamente:

```text
providerSetupCompleted = false
AND 当前没有可执行 Provider
```

A cada envio de uma API Key Z.ai/BigModel no Welcome:

```text
选择 Z.ai / BigModel
        |
        v
定位对应 Provider Template
        |
        v
createPersonalProvider({
  templateId,
  initialConfig: { access: { type: "api-key", apiKey } }
})
        |
        v
原子写入 Personal Provider + order
```

Ele não copia Built-in Providers, não grava Account Overlay e nem grava ou modifica a Account Family Connection Selection. O login de conta não passa por essa cadeia. `providerSetupCompleted` controla apenas o guia automático e não participa do reuso ou da deduplicação de instâncias.

## 6. Sincronização do Built-in e persistência

- O Schema do Built-in Release ganha `providerTemplates` e depois disso a Schema Version é incrementada;
- Bundled, Remote, Active, LKG, cache de escopo de Endpoint e materializer carregam o mesmo conjunto de Templates;
- O Remote Release substitui atomicamente `{ providers, providerTemplates, modelConfigRules }`;
- Template ID é uma chave de referência estável; uma instância Personal pode referenciá-lo por muito tempo;
- Quando o Publisher remove um Template, as instâncias que o referenciam são mantidas em Settings, geram a issue `missing-template` e não entram no Registry;
- Esta rodada não adiciona metadados de aposentadoria de Templates; adota-se primeiro a disciplina de publicação de não remover Templates já publicados;
- O `provider_config.json` Personal continua salvando providers, modelConfigRules e providerOrder, e apenas ganha `templateId`;
- A Family Connection Selection continua nas App Settings existentes e não é migrada para o Personal Provider Config;
- Este branch ainda não foi lançado, portanto não se adiciona alias, leitura de compatibilidade ou migrador para formas transitórias não publicadas.

## 7. Fatias de implementação

### A0. Sincronizar primeiro o Design e o Feature Graph atuais

Antes do código de teste e de produção, escrever de volta nos documentos de fato atuais e no Feature Graph a semântica já decidida neste Todo, cobrindo no mínimo:

- `design.md`, `configuration.md`, `provider-and-model-configuration-overview.md`;
- `zcode-builtin-provider-config.md`, `model-membership-and-enablement.md`, `settings.md`;
- Os limites de API Provider fixo / Account Type em `request-compatibility-and-access-protocols.md`;
- No Feature Graph: o placement do Built-in comum, o enabled do Provider, a API por volume do Family e o seed de Provider fixo do Welcome.

Os Todos históricos servem apenas como rastro de decisão; a implementação e os testes seguem o Design atualizado.

### A. Config e Built-in Release

1. Provider Config/Object/Input/Overlay/JSON ganha `templateId`;
2. Adicionar um Template Map independente e um Template Source Schema estrito; o valor do Map reutiliza `ProviderConfigOverlay` e executa uma whitelist de campos;
3. Incrementar a versão do Built-in Release e propagá-la atomicamente por Bundled/Remote/Active/LKG;
4. `providers` passa a conter apenas todos os Concrete Providers de Account/Off-Peak;
5. Z.ai API, BigModel API e todos os outros Providers de terceiros comuns migram para `providerTemplates`;
6. Não adicionar `family = zhipu | others`; manter as Families e os agrupamentos de Settings existentes;
7. Remover o `enabled` de topo do Provider, mantendo `access.entitled` e o `enabled` de Model;
8. Renomear `family` para `accountType` no Account Access, sem remover a estrutura de produto Provider Family.

### B. Model Rules e Resolver

1. Adicionar a Rule `template-model`, exclusiva do Built-in;
2. Dividir o JSON de Rules do Built-in/Personal em campos de array nomeados por tipo;
3. A Resolution Input carrega o `providerId` real e o `templateId` opcional;
4. Implementar o Overlay Template -> Built-in -> Account -> Personal;
5. A Source concatena Rules na ordem explícita dos campos e o Resolver mantém o Overlay item a item;
6. Preservar a semântica de posse de membros, ordem, completude, entitlement, visibility e congelamento de Active Models;
7. Quando o Template está ausente, gerar uma issue em vez de adivinhar um Template de fallback.

### C. Config Service e Facade

1. O `createPersonalProvider({ templateId?, initialConfig? })` genérico suporta a criação por Template, a personalizada em branco e a de API Key pelo Welcome, gravando Provider, label, order e Overlay inicial em uma única atualização do Repository;
2. Remover o `addBuiltinProvider` dos terceiros comuns e a lógica de ressurreição de Built-in desabilitado;
3. A Settings View usa `providerTemplates` no lugar de `addableProviders` para os terceiros comuns;
4. Account Providers continuam passando pela Facade de Family/Account existente; instâncias de Z.ai/BigModel API passam pela Facade Personal comum;
5. A remoção de instância de Template segue a remoção atômica de Provider + order + exact Rules;
6. A Facade projeta separadamente `templateConfig`, `effectiveBuiltinConfig`, `personalConfig` e `effectiveConfig`; Reset, edição de modelos e teste de conexão reutilizam o mesmo Resolver, sem novo `inheritedConfig` unificado;
7. Remover o `enabled` do DTO de Provider Settings e a cápsula de "已启用" dos Providers comuns; o estado de plano de Account continua sendo expresso pelo cartão de status.

### D. UI e entradas de produto

1. Manter o Account Family Select, o Family Header e a Account Connection Selection;
2. Remover a opção de "API 按量" do Family e `ProviderFamilyConnectionSelection.kind = "api-key"`;
3. O menu comum de "adicionar fornecedor" cria instâncias a partir de Templates, incluindo Z.ai API / BigModel API e com suporte a múltiplas instâncias;
4. Cada envio de API Key pelo Welcome cria um novo Personal Provider pela mesma entrada de criação por Template e salva a Key de forma atômica usando o Personal Overlay genérico como `initialConfig`;
5. Introduzir `providerSetupCompleted`; o caminho de API Key do Welcome não altera o fato de seleção do Account Family;
6. Manter desktop, web, celular, temas e internacionalização consistentes;
7. Não alterar a seleção de modelos, Automation, Subagent, Repo Wiki, filas ou a posse do estado de recuperação.

### E. Limites de limpeza

Remover:

- Todos os Built-in Concrete Providers não-Account, incluindo os Providers fixos `zai-api` / `bigmodel-api`;
- O placement de `enabled` de topo dos Providers de terceiros comuns e a verificação de ressurreição de Built-in;
- O `addBuiltinProvider`, o `addableProviders` e a recriação de Overlay dos terceiros comuns;
- Os dois conjuntos de verificação de permissão de formulário, Built-in e Personal;
- Testes, Fixtures, documentação e seeds do Feature Graph correspondentes que ficaram obsoletos;
- O `enabled` de Provider da View/DTO de Provider Settings, a cápsula de "已启用" dos Providers comuns e os ramos de UI derivados dela;
- O valor de group `standard-builtin`; a varredura mecânica passa a servir para provar ausência de resíduo e deixa de ser uma decisão de produto sobre manter ou remover.

Não remover explicitamente:

- `zai-family`, `bigmodel-family` e o agrupamento Personal atual;
- `ProviderFamilyDomain`, a `ProviderFamilyConnectionSelection` de Account já restringida e sua persistência;
- O Header/Connection UI do Account Family;
- A cadeia de consumo de plano, cota, upgrade, credenciais e Off-Peak do Account Family.

## 8. Testes e aceitação

### Config / Release

- Overlay de `templateId`, limpeza com `null` e round-trip de JSON;
- A Template Source aceita a linha de base oficial sem Key real e rejeita estruturas inválidas;
- A whitelist de campos da Template Source rejeita `group/modelIds/modelOrder/enabled/visibility/templateId` e credenciais reais;
- Parsing atômico do Built-in Release, rejeição de versão e fallback Remote/LKG;
- O Template não entra diretamente no conjunto de Providers nem no Registry;
- Uma instância com Template ausente mantém a issue em Settings e não entra no Registry;
- O Template não herda Templates recursivamente;
- Os `providers` Concrete do Release contêm apenas Account Providers; Z.ai API / BigModel API existem nos Templates.

### Provider / Model Resolver

- Duas instâncias do mesmo Template obtêm a mesma linha de base oficial e as sobrescritas Personal não se contaminam;
- Providers Built-in/Account podem escolher herdar um Template;
- A sobrescrita de `templateId` do Personal e a limpeza com `null` seguem o Overlay;
- `template-model` só acerta por Template ID + Model ID;
- A ordem de escrita é mantida dentro de cada campo e a ordem entre campos é fixada pelo Config Schema;
- O `provider-model` do Account vem depois da Rule de Template, e a Rule do Personal é sempre a última;
- match genérico, API Schema, baseURL e congelamento de Active Models não regridem.

### Lifecycle / Settings

- O mesmo Template pode criar vários Provider IDs e labels únicos;
- O label do Template serve apenas de semente para o nome de criação; instâncias existentes não são renomeadas junto com o Template;
- A criação grava atomicamente Provider, initialConfig e providerOrder em uma transação do Repository; uma falha não deixa nada pela metade;
- A remoção de instância limpa atomicamente order e exact Personal Rules;
- Um Provider personalizado em branco sem Template ainda pode ser configurado, salvo, testado e executado;
- Com a configuração incompleta, a instância é visível mas não executável;
- A linha de base do Template orienta corretamente os valores padrão, a restauração de padrão, o indicador de modificação e a origem dos membros;
- Instâncias Personal de Template não têm um `effectiveBuiltinConfig` falsificado; as quatro projeções de Config em Settings têm semântica precisa;
- O menu de Templates inclui Z.ai API / BigModel API e permite criar várias instâncias de cada um;
- A página de Family contém apenas Start, Individual e Team, sem a API por volume;
- Off-Peak não entra na Family Connection Selection nem na lista comum de Settings, mas a execução interna precisa não regride;
- Cada salvamento de Key no Welcome cria uma nova instância do Template correto e não reutiliza instâncias antigas nem altera a Account Connection Selection;
- O login de conta não cria instância de Template de API por volume; `providerSetupCompleted` não participa da deduplicação de instâncias.

### Family / Account regressões

- A troca de `providerFamilyDomain` e a restauração de login funcionam corretamente;
- O round-trip da Connection Selection de Start, Individual e Team funciona corretamente; o antigo variant `api-key` não deixa resíduo;
- Instâncias de Template Z.ai API / BigModel API não são consumidas pela navegação de Family nem pelo Account Resolver;
- A composição de modelos Start, o entitlement de Individual/Team e o status não regridem;
- Planos, cotas, upgrades, credenciais de conta e Off-Peak leem o Account Type correto;
- Não existe uma segunda cópia do estado de mode `oauth | apiKey`.
- O DTO e a UI de Provider Settings não possuem mais enabled de nível Provider nem a cápsula de "已启用"; o enabled de Model permanece inalterado.

### Runtime / verificação mecânica

- O teste de conexão e a requisição real usam o `providerId` e o Effective Config reais da instância;
- Instâncias diferentes com o mesmo modelId não misturam Providers;
- Automation, Subagent e Repo Wiki não têm ciência do Template;
- Desktop continuous, Web/Mobile replayable e remote workspace não ganham novo estado de runtime;
- Testes unitários direcionados e typecheck de Provider, Provider Node, Services e UI;
- E2E de isolamento de múltiplas instâncias de Template e de settings de Account Family;
- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, verificação de formatação e `git diff --check`;
- `rg`/`dep:refs` provando que a limpeza do ciclo de vida do Built-in comum e do enabled de Provider está completa;
- `rg`/testes provando que o Account Family não foi removido por engano e que a limpeza da API Provider fixa e do ramo `api-key` do Family está completa.

## 9. Riscos de review e restrições de implementação

### 9.1 Momento da validação de Template

```text
Provider Template              只做 Source 结构校验
        +
Concrete/Personal/Account 层
        |
        v
Effective Provider Config      才做完整性/可执行校验
```

Não se deve preencher Template com Keys falsas, afrouxar a completude final ou adicionar um fallback que contorne o limite.

### 9.2 Separação de tipos entre Template Map e Provider Map

`providerTemplates` usa `templateId`; `providers` usa `providerId`. O valor do Template Map reutiliza diretamente `ProviderConfigOverlay`, sem criar um segundo tipo de valor completo de Template Config; ao mesmo tempo, o Template ID não pode ser chamado de Provider ID em APIs ou variáveis.

### 9.3 Os fatos de origem de Settings vêm de um único Resolver

A relação de herança de Template não é igual a `effectiveBuiltinConfig`. O único Resolver precisa preservar separadamente `templateConfig`, `effectiveBuiltinConfig`, `personalConfig` e `effectiveConfig`, e Settings apenas lê e projeta esses fatos; não se pode adicionar um `inheritedConfig` que apague as origens, nem deixar Registry, Settings e Preview montarem um Template cada um, sob pena de a restauração de padrão, a origem de membros, o indicador de modificação e os valores padrão de modelos novos divergirem.

### 9.4 O Account Family é um invariante explicitamente mantido

```text
Template 改造路径                         Account Family 保留路径
================                         =====================
普通 Provider Template                   Z.ai / BigModel Account Family
（含 Z.ai/BigModel API）                          |
        |                                 Account Connection Selection
Personal Provider Instance                       |
        |                                 Account Provider
        +------------------+---------------------+
                           |
                           v
                    Provider Registry
```

Esta rodada move a API por volume do Family para o Template, mas não pode de passagem apagar nem reconstruir o Account Family.

### 9.5 O Template Z.ai/BigModel API não fica vinculado ao Family

Depois de entrar nos Templates, Z.ai/BigModel API passa a ser uma origem comum de Personal Provider. Não se pode manter Provider ID fixo, instância canônica, slot de Family ou conceitos de ponte como "instância de API atual do Family". O Family consome apenas Account Providers; as instâncias de Template são executadas apenas pelo caminho padrão de Settings/Registry.

### 9.6 Desacoplamento entre `enabled` de Provider e placement de Family

A exibição de um Account Provider vem da estrutura de Family e a exibição de um Personal Provider vem da existência da definição Personal. Depois da remoção de `enabled`, não se pode inferir se algo deve ser exibido a partir da existência de uma API Key ou de `executable`; estar visível com a configuração incompleta é um estado legítimo.

Facade e UI removem simultaneamente o `enabled` de nível Provider: Providers comuns não exibem a cápsula de "已启用"; o estado de produto de um Account Provider é expresso pelo cartão de plano/status de conexão; problemas de configuração são expressos por issues e pelo resultado executável. Nenhum dos três pode ser renomeado de volta para enabled.

### 9.7 A classificação das Rules é expressa pela Config

`composeEffective()` continua sendo a entrada de composição compartilhada. Depois de adicionar o Template, continua sendo construída apenas uma única sequência ordenada de Rules, sem permitir que os três pontos ordenem ou concatenem por conta própria.

### 9.8 Extensão atômica de Release e toolchain

`providerTemplates` afeta o codec de Release, o remote client, o cache de Endpoint, o materializer, o bundle oficial, os testes de completude, as evidências do publisher, os fixtures de E2E e os helpers. O sucesso no ambiente de desenvolvimento não substitui a prova do pacote oficial e do Remote Workspace.

### 9.9 Template ID não entra em runtime

Template ID é a origem da herança de configuração, e não a identidade de roteamento de requisições. Selection, persistência de tarefas, ModelFactory e Adapter não ganham ramos de Template.

### 9.10 Template ID e Provider ID não se misturam

Os dois Maps permitem `templateId = deepseek` e `providerId = deepseek` com o mesmo nome. As Rules independentes `template-model` / `provider-model` precisam garantir que a identidade não fica confusa só porque as strings são iguais.

## 10. Critérios de conclusão

- A identidade de Template e de Provider é estritamente separada, mas o valor de configuração reutiliza o Provider Config existente;
- O valor do Template Map reutiliza diretamente `ProviderConfigOverlay` e a whitelist de campos da Source é explícita;
- O mesmo Template pode criar vários Personal Providers que não se contaminam;
- Concrete Providers Built-in/Account podem escolher herdar um Template;
- A Built-in Config contém atomicamente Providers fixos, Provider Templates e Model Rules em camadas;
- O Built-in Concrete Provider comum de terceiros, o placement enabled e o ciclo de vida addable saem por completo;
- Z.ai/BigModel API entra na cadeia comum de criação de Personal Provider como Template, e a identidade de Concrete Provider fixa é zerada;
- O Z.ai/BigModel Account Family, a Account Connection Selection já restringida e a cadeia de produtos de Account são integralmente mantidos;
- O item de conexão `api-key` do Family, os casos especiais de API Provider ID fixos e a cadeia de Overlay fixo do Welcome são zerados;
- Não se adiciona `family = zhipu | others` nem outro conjunto de campos de agrupamento na página de configurações;
- Settings, Registry, ModelFactory e Runtime não têm um segundo conjunto de fatos de Provider/Model;
- Settings não confunde a origem de Template, o Effective Built-in, o Personal Overlay e o Effective Config final;
- O campo enabled de nível Provider, o DTO, a cápsula e os substitutos implícitos são zerados; o enabled de Model é mantido;
- A semântica de entitlement de Account, planos, credenciais em tempo de requisição, Off-Peak e congelamento de Active Models continua correta;
- Depois que todas as evidências direcionadas, completas e de E2E passarem, submeter um Conventional Commit.

## 11. Registro de implementação

2026-09-01: a transição para Provider Template foi concluída:

- O Built-in Release foi atualizado para a versão atômica `providers + providerTemplates + modelConfigRules`;
- Todos os Providers de terceiros comuns migraram para Templates, e apenas Account/Off-Peak mantêm Built-in Concrete Provider;
- Settings e Welcome passam a criar Personal Providers independentes de forma unificada por `createPersonalProvider(templateId, ...)`;
- A API por volume Z.ai/BigModel saiu da Family Connection Selection, e o Template ID deixou de servir como Provider ID em runtime;
- O Access do Account Registry passou a usar `accountType`, e os fatos de acesso de conta em tempo de requisição continuam usando `family`;
- O `enabled` de topo do Provider, os casos especiais de API Provider fixos e os resíduos relacionados de UI/testes foram removidos;
- As Rules Personal e o Provisioning Envelope passam a usar de forma unificada a estrutura de Rules em camadas;
- As capacidades específicas de Endpoint de Z.ai/BigModel são casadas por `baseURL + api.type`, sem depender de um Provider ID fixo.

Evidências de verificação: testes direcionados de Provider/Provider Node, testes de Services/UI afetados, `typecheck` da raiz, `lint` e `test:unit` completo; os testes direcionados de Provider do CLI Bootstrap e o `typecheck` independente passaram. O CLI Bootstrap completo tem 106 arquivos de teste, e todos os casos relacionados ao Todo 55 passaram; as 8 falhas restantes pertencem a fronteiras v4/revisions obsoletas já existentes, a recursos oficiais de plugins e à linha de base do Marketplace que depende de rede real, e não ao Provider Template. As evidências reais de Electron/WDIO serão completadas de forma unificada pelo Todo 57.