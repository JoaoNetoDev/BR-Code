# 03 Consolidação dos membros de modelo do Provider, de liga/desliga, de visibilidade e da completude do Registry

> Status: concluído
>
> Nota histórica: o `builtinModelIds/modelIds` e a completude de Properties concluídos por este Todo continuam válidos; o
> `enabled/visibility` do Model, os conflitos de membros duplicados e a interação de configurações foram
> foram novamente decididos pelo
> [`Todo 21`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md).
>
> Data: 2026-08-24
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Design alvo: [`../design/registry/model-membership-and-enablement.md`](../design/registry/model-membership-and-enablement.md)、
> [`../design/registry/configuration.md`](../design/registry/configuration.md)、
> [`../design/model/input-output-format.md`](../design/model/input-output-format.md)

## 1. Objetivo

Esta tarefa consolida três grupos de problemas de mesma origem na nova implementação do Provider Refactor:

1. Expressar separadamente os membros de modelo gerenciados e os membros de modelo Personal com `builtinModelIds` e `modelIds`, evitando que a lista antiga salva no Personal
   oculte os modelos Built-in/Account adicionados depois;
2. Adicionar `enabled` e `visibility` ao Model Config, expressando respectivamente o gate de execução e a visibilidade da entrada do usuário;
3. Fechar a fronteira esparsa do Config quando o Resolver publica no Registry, para que Registry, Selection, ModelFactory e Runtime
   observem apenas fatos de modelo completos.

```text
ZCode Built-in Provider Config
              |
              v
 overlay Account Built-in Provider Config
              |
              v
Effective Built-in Provider Config          ZCode Built-in Model Config Rules
              |                                           +
              v                                  Personal Model Config Rules
 overlay Personal Provider Config                         |
              |                                           v
              v                              Effective Model Config Rules
    Effective Provider Config                            |
    ├─ builtinModelIds                                   |
    └─ modelIds                                          |
              |                                           |
              +---------------------+---------------------+
                                    |
                                    v
                     source-aware Model Inventory
                     ├─ executable candidate
                     ├─ disabled / incomplete / duplicate
                     └─ Built-in candidate + Personal id-conflict diagnostic
                                    |
                                    v
                 RegistryProviderConfig / RegistryModelConfig
                                    |
                  +-----------------+-----------------+
                  |                                   |
                  v                                   v
             Selection Facade                    ModelFactory
                                                      |
                                                      v
                                          Active Model.properties
```

Esta tarefa não adiciona DTO de compatibilidade, mapa de capability de runtime, Overlay de Renderer nem nova autoridade de configuração.

## 2. Decisões confirmadas

### 2.1 Campos de membro de modelo

O Provider Config usa dois campos:

```ts
interface ProviderConfig {
  builtinModelIds?: readonly string[] | null;
  modelIds?: readonly string[] | null;
}
```

A montagem normal segue o seguinte modelo mental:

| Origem da configuração                  | Campo normalmente mantido     | Semântica                                                    |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| ZCode Built-in Provider Config          | `builtinModelIds`             | Modelos Built-in declarados pela ZCode e sua ordem          |
| Account Built-in Provider Config        | `builtinModelIds`             | Substitui o conjunto de modelos Built-in quando a API da conta os oferece |
| Personal Provider Config                | `modelIds`                    | Modelos Personal que o usuário adiciona, remove, renomeia e reordena |

Isso é o significado dos campos e o princípio de manutenção de código, não um sistema de permissões. Esta tarefa não cria tipos de Provider Config específicos por Source, Schema rigoroso por Source,
lógica de rejeição de campos entre camadas nem verificação de permissão de origem no Config Service.

O Resolver mantém os dois conjuntos e gera o Inventory de membros na ordem Built-in primeiro, Personal depois. Um Provider somente-Personal
usa naturalmente um `builtinModelIds` vazio; a página de configurações altera apenas `modelIds` e não oferece interação para remover ou reordenar membros Built-in.

Os campos mantêm três estados no Config Overlay e são normalizados na fronteira do Inventory:

```text
undefined = 本层不覆盖
null      = 本层显式清空该来源集合
array     = 本层提供成员和顺序

最终缺失或 null -> Inventory 中的 []
```

Portanto um conjunto vazio é legítimo e não significa configuração de Provider incompleta; um Provider somente-Personal não precisa persistir um
`builtinModelIds: []` sem sentido. O Model ID é aparado (trim) na fronteira de escrita, valor vazio é inválido, e a identidade no Registry usa a string exata e sensível a maiúsculas/minúsculas.

O Schema de Provider Config do branch atual ainda não foi publicado, e não existe tarefa de compatibilidade v1 → v2 para o `models[]` interno:

- mudar diretamente para os campos finais o Schema de domínio atual, o `official.json`, a escrita Personal e os fixtures de teste;
- não adicionar uma schema migration adjacente, nem ler em dobro o `models[]` em desenvolvimento;
- o legacy importer pré-refatoração que já existe emite diretamente os campos finais; ele não constitui o histórico de versões do Provider Config atual.

### 2.2 Conflito de mesmo ID

Quando `builtinModelIds` e `modelIds` do mesmo Provider contêm o mesmo ID, forma-se um `id-conflict`:

- não se remove silenciosamente o conflito do Personal, mas a identidade de execução adota Built-in-wins;
- o Built-in X continua sendo resolvido e entra no Registry, em Selection/fallback e no ModelFactory;
- na resolução, excluí-se apenas a Rule exata do Personal X em conflito; outras Personal Rules genéricas continuam participando;
- as Provider Settings exibem o conflito, e o usuário o resolve renomeando ou removendo o modelo Personal;
- quando uma Selection já salva aponta para X, ela continua sendo resolvida como Built-in X.

O seletor de modelos comum não exibe um item especial de diagnóstico de conflito, não adiciona candidatos placeholder para Automation, Subagent ou Repo Wiki e não expande o
Selection Protocol para carregar informação de navegação para Settings.

IDs duplicados dentro de um único conjunto formam `duplicate-membership`: não se deduplica silenciosamente, os IDs duplicados são fundidos em um único item de diagnóstico de Settings,
e antes da correção o modelo não é resolvido, nem selecionado, nem executado; os outros modelos do mesmo Provider continuam funcionando. Duplicidade de membro e conflito entre conjuntos são problemas de nível Model,
e não podem entrar nos issues de completude genéricos do Provider e derrubar o Provider inteiro.

### 2.3 `enabled` e `visibility` do Model

O Model Config ganha campos esparsos de Overlay no nível superior:

```ts
interface ModelConfig {
  enabled?: boolean | null;
  visibility?: "visible" | "hidden" | null;
  // properties / optionSpecs / reasoningMapping
}
```

A Rule Built-in genérica fornece os valores padrão completos `enabled=true` e `visibility="visible"`, e a Personal Rule pode sobrescrever ou restaurar a
herança. Os dois campos Effective têm de ser completos.

`enabled=false` significa que o modelo foi desativado pelo usuário:

- as Settings ainda exibem o modelo e permitem editar e reativá-lo; não é possível testar durante a desativação;
- ele não entra em candidatos de seleção, seleção padrão nem fallback;
- não entra no índice executável do Registry, e a criação precisa via ModelFactory e as tarefas internas não podem contornar isso;
- um Active Model já criado não é encerrado no meio por causa de uma atualização de Config, e modelos criados depois respeitam o novo estado.

A `visibility` do Model é simétrica à visibility do Provider: filtra apenas a Settings/Selection Facade do usuário, e não impede que um modelo completo e enabled
entre no Registry ou seja criado internamente de forma precisa. Pertencimento, visibility de Provider/Model, enabled de Provider/Model,
completude e autorização de conta são fatos base distintos, que não podem ser deduzidos uns dos outros; `executable` / `selectable` são resultados derivados do Resolver.

### 2.4 Settings submete apenas o Overlay Personal esparso

A Settings View retorna a linha de base Effective, a configuração Personal explícita, o Inventory calculado pelo Resolver, e os conflitos e problemas de completude.
O Renderer mantém apenas o Personal Draft, sem copiar Overlay, combinação de membros ou algoritmo de conflito, e sem projetar de volta o Effective Config como
Personal Config.

Remova `saveEffectiveProvider()` / a projeção reversa Effective → Personal da cadeia normal de configurações; o Legacy importer pode
usar uma projeção de diferença única na sua própria fronteira de leitura, sem entrar no protocolo formal de salvamento.

O Renderer Draft de um candidato normal copia apenas o Personal Config esparso; o Effective Config é apenas uma linha de base de herança somente-leitura. Quando o usuário modifica um item de configuração pela primeira vez, aquele item é materializado, e «restaurar padrão» apaga o campo Personal. Candidatos em conflito não têm um Effective Draft comum, oferecendo apenas um resumo somente-leitura do candidato Built-in, a configuração Personal exata antiga e duas operações atômicas de resolução.

## 3. Fronteira de tipos completos do Registry

### 3.1 O esparso existe apenas na entrada de configuração

```text
稀疏 Model Config Rule
├─ undefined = 本 Rule 不覆盖
├─ null      = 本 Rule 显式清除
└─ value     = 本 Rule 提供值
             |
             v
       resolve + validateComplete
             |
       +-----+------------------+
       |                        |
       v                        v
Settings candidate       Registry publish
允许不完整并带 issues     只接收完整类型
```

Os seguintes campos precisam estar completos no Registry e abaixo dele:

- `enabled` do Model;
- `visibility` do Model;
- `contextWindow`;
- os booleanos Text/Image/Video/Audio/PDF de `input_format`;
- `output_format.support_text`;
- `supportsToolCall`, `supportsJsonSchemaOutput`, `supportsNativeWebSearch`,
  `supportsMidConversationSystem`;
- `optionSpecs.maxOutputTokens`;
- Reasoning Spec presente e não vazio, default presente em values e cada level público com Mapping; a ordem e a ausência de duplicatas são responsabilidade de quem publica a configuração.

O Reasoning Mapping pode manter mapeamentos de execução como `disabled`, `off`, `nothink`, `none` que não apareçam nos values públicos.

### 3.2 Tipos do Registry

Mantêm-se os `ProviderConfig` e `ModelConfig` esparsos atuais como tipos de Overlay. O que se adiciona é apenas o tipo de publicação do Registry:

```ts
interface RegistryProviderConfig extends ProviderConfig {
  readonly access: CompleteProviderAccessConfig;
  readonly api: CompleteProviderApiConfig;
}

interface RegistryModelConfig extends ModelConfig {
  readonly enabled: boolean;
  readonly visibility: "visible" | "hidden";
  readonly properties: RegistryModelProperties;
  readonly optionSpecs: RegistryModelOptionSpecs;
}
```

Eles não são uma nova Config Source, um Documento de persistência, uma camada de Overlay ou um DTO de runtime. Depois que `requireComplete` tem sucesso, é devolvido o mesmo
objeto Effective Config, apenas estreitando o tipo estático, sem copiar um novo conjunto de fatos de configuração e sem adicionar um deep freeze extra.

O tipo completo também precisa estreitar o valor de retorno da serialização. Não se pode deixar o `toJSON(): ModelConfigObject` esparso herdado vazar novamente Properties opcionais para Selection/Protocol; a implementação deve sobrescrever o tipo de retorno completo ou fornecer um único `toRegistryJSON()`, mas sem copiar uma segunda autoridade de configuração.

O Provider Registry publica Modelos com `enabled=true` e completos, incluindo modelos hidden e modelos Built-in com o mesmo nome do Personal; a Settings Resolution preserva disabled, incomplete, duplicate e Personal conflict suspenso. Os consumidores após o Registry
não podem mais observar Properties opcionais ou Option Specs.

A completude do Provider só estreita os fatos necessários à execução: ramo de Access válido, API Type e Endpoint não vazio. `label`, `logoUrl`,
`visibility`, Headers e outros campos opcionais válidos mantêm a semântica original; o conjunto de membros já é projetado como `Provider.models` no Registry, e os consumidores de execução não relêm os campos de membro para decidir a pertença.

O Todo 03 estabelece essa fronteira única de completude com base apenas no Schema de Access de Provider que já existia na largada. Quando o Todo 07 introduzir a Connection estruturada de Account, o reforço de `zhipu-account` acontece sobre o mesmo `CompleteProviderAccessConfig` / `requireComplete`; esta tarefa
não implementa a connection antecipadamente, nem declara que o Account Access já está definitivamente consolidado.

### 3.3 Settings candidate é um contrato de branch

```ts
type ProviderModelSettingsItem =
  | {
      kind: "candidate";
      modelId: ModelId;
      source: "builtin" | "personal";
      effectiveConfig: CompleteModelConfigObject;
      personalConfig?: ModelConfigObject;
      effectiveEnabled: boolean;
      effectiveVisibility: "visible" | "hidden";
      providerEnabled: boolean;
      providerVisibility: "visible" | "hidden";
      personalMembershipConflict?: {
        kind: "id-conflict";
        personalExactConfig?: ModelConfigObject;
      };
      issues: readonly ProviderConfigIssue[];
      executable: boolean;
      selectable: boolean;
    }
  | {
      kind: "membership-conflict";
      modelId: ModelId;
      sources: readonly ("builtin" | "personal")[];
      conflict: "duplicate-membership";
      personalExactConfig?: ModelConfigObject;
      issues: readonly ProviderConfigIssue[];
      executable: false;
      selectable: false;
    };
```

A colisão de nome entre conjuntos é um `personalMembershipConflict` sobre o candidato Built-in, e o Built-in ainda tem um Effective Config real;
a duplicidade dentro de um único conjunto usa o branch de conflito não-executável. Enabled/visibility/completude/identidade de membro de Provider e Model são fatos base,
e `executable` / `selectable` são resultados derivados; a UI pode derivar o rótulo principal, mas a camada de domínio não o achata em um único `status`.

### 3.4 Estados desconhecidos removidos do fluxo principal

Removidos do fluxo principal oficial:

```ts
properties?.input_format?.support_image ?? false;
properties?.input_format?.support_text ?? true;
input_format?: ModelInputFormat;
properties?: ModelProperties;
if (allPropertiesPresent) protocol.properties = properties;
```

Removidos junto:

- `requireCompleteProperties()`, `requireCompleteOptionSpecs()` do Bootstrap e a prova duplicada de campos obrigatórios do Provider;
- a omissão silenciosa de Properties completas em Selection/Protocol;
- o preenchimento de `true/false` em Settings a partir de Effective Property ausente;
- o mapa de capability de runtime, e os fallbacks que inferem capacidade por Catalog, tipo de Provider, Endpoint ou modelId.

O legacy importer único pode analisar qualquer JSON antigo, mas só pode migrar fatos que o arquivo antigo expressa explicitamente; capacidades não declaradas não são escritas como
Personal Override e continuam sendo completadas pela Built-in Rule. O Importer não pode usar constantes de capacidade exclusivas de migração nem adivinhar valores por nome de modelo, Provider ou
Endpoint.

## 4. Divisão de trabalho entre Todo 02/03

O Todo 03 é responsável pela completude factual do Registry de Provider de negócio:

- os campos finais de membro, o Inventory, os conflitos e `enabled` / `visibility` do Model;
- `RegistryProviderConfig` / `RegistryModelConfig`;
- o gate de publicação do Resolver;
- Settings, Selection, Protocol e ModelFactory consumindo visão completa ou de diagnóstico;
- remoção da prova duplicada de completude do Bootstrap para o Registry Config de negócio;
- corte da dependência do fluxo principal de Provider/Model em fallback de capacidade.

O Todo 02 é responsável pela aposentadoria física do Registry de execução antigo dentro do Adapter:

- mapa de Provider mutável e assinatura de revision;
- `replaceRegistryConfig()`;
- Provider padrão do Adapter Registry, fallback de Model ID cru e consulta reversa de Connection;
- tipos antigos privados do Adapter, recursos e ciclo de vida.

O Todo 03 pode deixar o antigo Adapter Registry existir temporariamente, mas ele só pode receber fatos completos já validados pelo Registry de negócio. O Todo 03
não transfere os campos do Registry antigo do Todo 02 para as novas abstrações de negócio.

## 5. Escopo de implementação

### Step A: Config e Inventory de membros

- Substituir o campo `models` atual diretamente por `builtinModelIds` / `modelIds`;
- Atualizar a montagem normal e a saída final do legacy importer para Official, Account e Personal;
- Adicionar `enabled` / `visibility` ao Model Config, com os padrões completados pela Built-in Rule genérica;
- O Resolver normaliza conjuntos ausentes/nulos para array vazio na fronteira do Inventory, combina os membros e detecta duplicatas dentro de um conjunto e conflitos de mesmo ID entre conjuntos;
  a projeção de Account não deduplica antecipadamente;
- Publicar a identidade Built-in para colisão entre conjuntos, excluindo a Rule exata do Personal em conflito; duplicatas dentro de um único conjunto não entram no Registry.

### Step B: Tipos completos e Registry

- Definir no pacote do Provider os tipos completos de Registry e a fronteira única `requireComplete`;
- A serialização JSON/Protocol dos tipos completos retorna tipos estáticos completos, sem reexpor o Config esparso;
- Preservar os diagnostics de Settings; o Registry aceita modelos Built-in/Personal completos e habilitados, bem como modelos hidden;
- Criação precisa pelo Registry/ModelFactory, Selection e fallback compartilham o mesmo gate de índice;
- Remover a prova duplicada, o fallback non-null e a omissão silenciosa do Bootstrap.

### Step C: Settings, Protocol e UI

- A Settings View anexa o conflito de colisão com Personal no candidato Built-in normal; a duplicidade dentro de um único conjunto usa o branch de conflito; retorna separadamente
  enabled, visibility, issues de Provider/Model e os gates derivados;
- Remover a entrada normal de salvamento Effective → Personal; a interface de salvamento submete diretamente o Overlay Personal esparso;
- `builtinModelIds` é somente-leitura na UI, e `modelIds` suporta adicionar, remover, renomear e reordenar;
- `renamePersonalModel()` decide a propriedade apenas com base no `modelIds` do Personal e move atomicamente a Rule exata; adicionar
  `deletePersonalModel()` removendo atomicamente o membro e sua Rule exata;
- O toggle de enabled salva a Rule exata do Personal, e «restaurar padrão» remove essa folha;
- A página de Provider mantém o estado de execução e os testes do Built-in, a edição de configuração fica somente-leitura durante o conflito e oferece a resolução do conflito Personal; o seletor
  continua oferecendo o Built-in normal e exclui disabled/hidden;
- O Connectivity Test usa o gate `executable` do modelo, e não pode apenas checar se o ID existe na lista de Settings;
- As Properties de input/output do Model Option normal do Protocol são obrigatórias;
- O Settings Draft é inicializado a partir das Properties Effective completas, e PDF/Audio ocultos são preservados como estão.

### Step D: limpeza do fluxo principal de runtime

- Properties obrigatórias em todo o caminho de Registry Model até ModelFactory;
- O Active Model mantém as Properties completas como são;
- Requisição normal, Compact, Memory, Subagent, ocioso e codificação do Adapter leem somente o Active Model;
- Remover a mesclagem de capacidade Catalog/runtime e o `?? true/false` do novo fluxo principal;
- Video continua sujeito tanto ao Model Property quanto à capacidade de codificação do Adapter; Audio não ganha por isso uma entrada de codificação não implementada;
- A aposentadoria física do antigo Registry do Adapter é feita pelo Todo 02, implementado em paralelo.

## 6. Testes primeiro

### 6.1 Config e Inventory

1. Depois que Built-in/Account atualiza `builtinModelIds`, o `modelIds` do Personal permanece inalterado;
2. Um Provider somente-Personal usa `modelIds`, e o conjunto Built-in vazio funciona normalmente;
3. Os dois conjuntos mantêm suas respectivas ordens, e o Inventory final fica com Built-in primeiro e Personal depois;
4. ID duplicado dentro de um único conjunto gera `duplicate-membership` não-executável; o mesmo ID nos dois conjuntos publica o Built-in e suspende o Personal;
5. O campo `models` atualmente não publicado não é lido em dobro pelo Schema oficial; o legacy importer emite diretamente os campos finais;
6. O round-trip do JSON de Config preserva conjuntos vazios, null e Rules esparsas; o Inventory normaliza para `[]` os conjuntos que estão finalmente ausentes ou nulos;
7. O Model ID é exato e sensível a maiúsculas/minúsculas após o trim; a lista de modelos da Account não é deduplicada silenciosamente.

Não se testa «uma certa Source que escreve o campo de outra deve dar erro», porque a pertença de membro é um princípio normal de manutenção de código, e não um sistema de permissões por Source.

### 6.2 Resolver, Registry, enabled e visibility

1. Em colisão de nome entre duas fontes, o Built-in X continua sendo resolvido, selecionado e criado, e a Rule exata do Personal em conflito não participa;
2. Um modelo com `enabled=false` permanece nas Settings, mas não entra em Selection, fallback nem criação precisa;
3. Após restaurar o padrão, a herança de `enabled` / `visibility` do Built-in volta; um modelo hidden pode ser criado internamente de forma precisa, mas não entra na Facade do usuário;
4. Um Model sem qualquer Property/Option obrigatória não entra no Registry;
5. Um Provider sem Access/API/Endpoint não entra no Registry;
6. O tipo público do Registry expressa estaticamente o Config completo; uma atualização de Config só afeta modelos criados depois;
7. O Reasoning Mapping cobre todos os levels públicos e permite manter mapeamentos disabled extras.

### 6.3 Settings, Protocol e Runtime

1. As Settings retornam os branches candidate/conflict e os fatos de gate ortogonais; a UI deriva ready, disabled, incomplete e conflict,
   e submete apenas o Overlay Personal esparso;
2. Built-in não exibe remoção/arrasto; em colisão de nome o Config do Built-in é somente-leitura mas testável, e o Personal em conflito pode ser renomeado ou removido atomicamente;
3. O conflito Personal é resolvido apenas nas Settings e não forma um candidato comum; uma Selection X existente continua apontando para o Built-in X;
4. O enabled é salvo automaticamente, com rollback em caso de falha e restauração de padrão; disabled/incomplete/duplicate desabilitam o teste, e em colisão de nome testa-se o Built-in X;
5. O candidato normal do Protocol sempre carrega Properties de input/output completas;
6. A UI não completa capacidade ausente com padrões padrão, e os campos ocultos de PDF/Audio são preservados após a edição;
7. Requisição normal, Compact, Memory, Subagent e modelo ocioso leem todos as Active Model Properties deste turno;
8. A permissão e a rejeição de Image/PDF/Video se mantêm consistentes, e Audio não dispara por engano uma codificação não implementada.

Desktop, Web e celular compartilham o mesmo serviço de Settings/Selection; esta tarefa não muda a capacidade de produto de sincronização de configuração de remote workspace,
nem muda continuous/replayable, fila, recuperação ou workspace identity.

## 7. Não objetivos

- O `unknown` e o last-known-good da availability de Account;
- Autenticação de conta, Request Auth e ciclo de vida de Credential;
- A Account Connection estruturada do Todo 07, e o reforço final de completude de `zhipu-account`;
- Telemetria, limpeza de ModelRef e ModelConnectionPort;
- Capacidade de produto de sincronização de configuração de remote workspace;
- `modelContextBudget.strategy`, fila e recuperação;
- Bloco de conteúdo de Audio, entrada de anexo ou implementação de codificação de Provider.

## 8. Condições de conclusão

Zeragem mecânica:

```text
正式 Provider Config 中 models[]                                      = 0
当前未发布 Provider Config 的 schema migration                         = 0
Source 专用 Provider Config 类型/跨层权限校验                           = 0
Effective/Registry Model 的 enabled optional                           = 0
Effective/Registry Model 的 visibility optional                        = 0
Registry/Selection/Protocol/Runtime 的格式能力 optional                 = 0
正式执行链 support_* 的 ?? true / ?? false                              = 0
Settings 从缺失 Effective Property 补默认值                             = 0
Registry 后重复 requireCompleteProperties                              = 0
Bootstrap 对 Registry Provider Config 重复 requiredString/字段校验       = 0
Renderer 计算 Overlay、成员冲突或 Effective -> Personal                  = 0
成员列表进入 Inventory 前静默 Set 去重                                  = 0
Settings 为暂停的 Personal 冲突伪造第二份 Effective Model Config         = 0
完整 Registry Config 序列化返回 optional Properties                     = 0
普通模型选择器冲突诊断候选                                              = 0
Legacy importer 为缺失能力补兼容常量或运行时推断                        = 0
```

Aceitação de comportamento:

- Modelos novos de Built-in/Account não são ocultados pela lista antiga de membros Personal;
- O usuário pode gerenciar modelos Personal e desativar um modelo Built-in pelo `enabled` do Model;
- Em colisão de mesmo ID o Built-in continua sendo executado, e a Rule exata do Personal em conflito fica suspensa e só é resolvida nas Settings;
- A duplicidade dentro de um único conjunto isola apenas o ID correspondente e não derruba o Provider;
- A visibility do Model é simétrica à do Provider, afetando apenas a Facade do usuário e sem mudar a elegibilidade de execução do Registry;
- O esparso existe apenas em Rule, Overlay Personal e draft/candidate de Settings;

## 9. Resultado da implementação

- Os membros de Provider foram trocados por `builtinModelIds` / `modelIds`, com Account restringindo apenas o conjunto Built-in e Personal mantendo apenas o conjunto do usuário;
- O Resolver implementou o Inventory source-aware: colisão de nome entre conjuntos preserva a identidade de execução Built-in e suspende a Rule exata do Personal,
  e a duplicidade dentro de um único conjunto isola apenas o modelo correspondente;
- `enabled` / `visibility` do Model, os tipos completos de Registry e o gate único de completude já estão em vigor; Model, Selection e protocolo após o Registry não aceitam mais fatos de formato opcionais;
- As Settings passaram a editar diretamente o Overlay Personal esparso. Membros Built-in não podem ser removidos nem reordenados; membros Personal em conflito só podem ser
  renomeados ou removidos atomicamente; o enabled do modelo pode sobrescrever e restaurar a herança;
- O Legacy importer só migra membros, formatos, limites e mapeamentos de reasoning declarados explicitamente no arquivo antigo, sem mais inferir capacidades por nome de modelo, tipo de Provider
  ou Endpoint;
- Uma atualização de Config só afeta modelos criados depois, e um modelo já criado continua segurando os fatos estáticos completos do momento da criação.
- Registry, Selection, ModelFactory e Runtime observam apenas fatos de modelo completos;
- Um modelo já criado não é alterado a quente por atualização de Config;
- O Todo 02, implementado em paralelo, removeu a abstração de Adapter Registry; o Todo 03 não copiou seus campos ou superfície de consulta para o Registry de negócio.

## 10. Verificação

Executar no mínimo:

```bash
pnpm test:unit:affected
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm knip
```

As mudanças de UI também exigem executar o Desktop E2E relacionado a Provider Settings/Model Selection e validar o layout responsivo do Web no celular. Usar
`pnpm dep:refs` e `rg` para reconferir se a capacidade opcional, o fallback de Catalog, o antigo `models[]` e a entrada Effective → Personal chegaram a zero. Se o `knip` completo contiver o ruído já existente do repositório, ainda é preciso registrar separadamente o resultado da auditoria dos símbolos relacionados a esta tarefa.