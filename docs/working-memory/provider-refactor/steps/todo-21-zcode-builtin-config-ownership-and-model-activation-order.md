# 21 Configuração Built-in do ZCode, ativação/desativação e ordenação de modelos e fechamento da página de Settings

> Status: concluído (o Todo 23 posterior removeu o último Compatibility Config)
>
> Data: 2026-08-26
>
> Tarefas relacionadas: [`02`](./todo-02-ai-sdk-execution-registry-retirement.md),
> [`07`](./todo-07-account-connection-selection-and-access-context-cutover.md),
> [`17`](./todo-17-provider-registry-settings-authority-boundary-closure.md),
> [`18`](./todo-18-zcode-builtin-client-config-sync-and-lkg.md),
> [`22`](./todo-22-additional-builtin-providers-and-cloud-access.md)
>
> Designs relacionados: [`design.md`](../design/design.md),
> [`provider-and-model-configuration-overview.md`](../design/registry/provider-and-model-configuration-overview.md),
> [`configuration.md`](../design/registry/configuration.md),
> [`model-membership-and-enablement.md`](../design/registry/model-membership-and-enablement.md),
> [`settings.md`](../design/registry/settings.md),
> [`registry.md`](../design/registry/registry.md),
> [`request-compatibility-and-access-protocols.md`](../design/registry/request-compatibility-and-access-protocols.md)

## 0. Posicionamento da tarefa

Este Todo é responsável por organizar a Configuração ZCode Built-in de Provider e as Regras de Configuração
Built-in de Model existentes, e por fechar a página de Settings de Provider/Model em um mesmo conjunto
de fatos de domínio. O objetivo não é adicionar uma camada de compatibilidade sobre a implementação
antiga, mas fazer com que a Built-in Config seja a única fonte dos fatos estáticos de modelos e API,
com Settings editando apenas a Personal Config e o Registry consumindo apenas o resultado final
resolvido.

Este Todo é o Spec de implementação autoritativo desta rodada. Antes do desenvolvimento não é
exigido sincronizar mecanicamente tudo para a Design Tree e o Feature Graph; depois da implementação,
faz-se uma sincronização completa com base nos tipos finais, limites de serviço e pontos de entrada de
UI já entregues, atualizando explicitamente ou marcando como substituídos os documentos antigos
conflitantes. Essa sincronização é o portão de conclusão deste Todo e não pode ser adiada para tarefas
posteriores.

A implementação deve materializar fielmente o desenho de domínio e de produto já decidido, sem alterar
o desenho por mera conveniência de implementação local, reaproveitamento de componentes existentes ou
redução de mudanças no momento. Diante de ambiguidades comuns de implementação, conflitos locais de
correção ou novos fatos no modo alvo, escolha-se prioritariamente a opção mais próxima das decisões já
tomadas, de menor impacto e reversível, registrando a escolha e a evidência, para só então discutir se
o desenho precisa de ajuste depois que o objetivo for concluído; um tradeoff temporário não pode ser
promovido automaticamente a novo desenho. Só se bloqueia o objetivo quando envolver destruição
irreversível, exigir novas permissões externas, ou quando todas as opções candidatas violarem o objetivo
central.

Não entra neste Todo:

- Refatoração do serviço público de Client Config; o Todo 18 faz apenas a integração mínima do Release
  Built-in atual;
- OpenRouter, OpenCode Zen, Azure, Volcano Ark, AWS Bedrock; ver o Todo 22;
- Google Gemini e Vertex AI; não suportados no momento;
- Refatoração de erros estruturados do Off-Peak; nesta rodada apenas a atribuição de configuração é
  ajustada;
- Reconstrução do Catalog, Preset ou Adapter Registry antigos;
- Auditoria pesada de migração commit a commit, leaf a leaf.

### Resultado da implementação (2026-08-26)

- Os cinco Source Schema, o group de Provider, a Rule estruturada `provider-model`, o `enabled` de
  Model, o Builtin-wins e a ordem explícita de Provider/Model já entraram na cadeia oficial
  Config/Resolver/Facade/Repository; os campos persistidos Personal foram consolidados em
  `modelConfigRules`.
- O Built-in Release trocou atomicamente os Providers de conta `account:`, separou as Families Z.ai/
  BigModel dos Providers API comuns e desdobrou o Off-Peak em dois Family Providers ocultos; o Account
  Overlay decide as restrições de conexão, os membros disponíveis e o `enabled` do Provider
  correspondente.
- O Settings passou a consumir diretamente do Host o group, os candidatos de adição, a ordem completa,
  a origem dos membros e os resultados executable/selectable; o Provider ID é somente leitura, e a
  edição completa de Model é salva como uma Rule Personal exclusiva esparsa, com interações explícitas para
  valor herdado, valor sobrescrito e restauração da herança.
- A verificação de segurança de requisição da versão oficial e o execution protocol do Off-Peak
  passaram a pertencer ao Provider Access; a compatibilidade de runtime de reasoning/output-token/
  Provider-ID e a allowlist de IDs do Renderer foram removidas. O Todo 23 posterior removeu ainda o
  último Compatibility Config e a projeção de synthetic empty-thinking.
- A Design Tree, o Feature Graph e as marcações de superseded dos Todos históricos foram sincronizados
  com a implementação final.

Validação desta implementação: 255 testes direcionados do núcleo de Provider passaram; `typecheck`,
`lint` do repositório raiz, typecheck do E2E de Desktop, verificação de formatação dos arquivos
alterados e `git diff --check` passaram; 12.416 testes unitários da raiz passaram, e outros 2 falharam
por falta do comando externo `zip` no ambiente Linux atual, ambos em testes de empacotamento/instalação
de ZIP Windows do `zcode-server-cli`, sem relação com as mudanças de Provider. Requisições reais e o
E2E oficial seguem o Release Checklist final.

## 1. Configuração final de duplo caminho

```text
Provider Config 路径                         Model Config 路径
====================                       =================

ZCode Built-in Provider Config             ZCode Built-in Model Config Rules
              |                                         +
              v                                         |
Account Built-in Provider Config           Personal Model Config Rules
              |                                         |
              v                                         v
Personal Provider Config                   Effective Model Config Rules
              |                                         |
              v                                         |
Effective Provider Config                              |
├─ group / label / logo                                |
├─ enabled / visibility                                |
├─ api / access                                        |
├─ builtinModelIds / modelIds                          |
└─ modelOrder                                          |
              |                                         |
              +-------------------+---------------------+
                                  |
                                  v
                       Effective Model Config
                       ├─ enabled
                       ├─ properties
                       ├─ optionSpecs
                       ├─ reasoningMapping
                       └─ 已确认的窄请求编码事实
                                  |
                                  v
                    完整性与执行资格校验
                                  |
                                  v
                         Provider Registry
                                  |
                                  v
                       ModelFactory -> Model -> Adapter
```

O Provider Config decide a identidade do Provider, a forma de acesso, os membros e a ordem de exibição.
O Model Config decide se um modelo está habilitado, quais capacidades ele tem, quais opções são
permitidas e como as opções são codificadas. Uma Model Rule não pode criar membros, e o array de
membros do Provider também não pode declarar capacidades de modelo.

Overlay é um conjunto de semântica e mecanismo natural e reutilizável de composição de configuração,
responsável por herança, sobrescrita e limpeza do mesmo slot de configuração. Os domínios
Provider/Model o utilizam para implementar seu próprio espaço de configuração, composição de membros,
estado padrão e semântica de ciclo de vida. Overlay não é uma abstração onipotente capaz de suportar
naturalmente toda semântica de negócio; a estrutura deve primeiro obedecer ao modelo de domínio e só
então reutilizar o Overlay para a composição entre camadas.

## 2. Os cinco Source Schema

As cinco fontes de entrada têm Schemas estritos, mas, ao entrar no domínio, compartilham a linguagem de
Provider Config, Model Config e Overlay; não se criam cinco conjuntos de DTO de runtime.

| Fonte                              | Fatos graváveis                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZCode Built-in Provider Config     | group de Provider, identidade, exibição, template de API/Access, `builtinModelIds`, estado padrão do Provider e ordem declarada                      |
| Account Built-in Provider Config   | Restrições de Access/conexão dos Providers de conta, `enabled` do Provider, `builtinModelIds` quando o servidor realmente retorna                     |
| Personal Provider Config           | Novo Provider `standard-personal`, ou Overlay de API/Access/estado de um Provider existente; `modelIds/order`                                         |
| ZCode Built-in Model Config Rules  | Padrões completos de Model, especializações de modelo/API/Provider/Endpoint, ativação/desativação oficial padrão                                            |
| Personal Model Config Rules        | Coberturas exclusivas de um modelo pelo usuário, além das Match Rules gerais escritas manualmente pelo usuário                                             |

Restrições fortes:

- Um Personal Overlay não pode reescrever o `group` de um Provider já existente; uma declaração raiz
  Personal-only precisa ter `group=standard-personal`;
- O Personal Provider Config não pode escrever `builtinModelIds`;
- Account restringe apenas os Built-in Providers de conta; não lê nem modifica Providers Personal-only;
- Account não escreve Model Config e não fornece fatos estáticos de modelo como context, formato ou
  reasoning;
- O `modelIds` de um Personal Provider não pode conter IDs presentes no `builtinModelIds` efetivo
  atual; duplicatas escritas manualmente são resolvidas com Built-in-wins na leitura e removidas
  automaticamente do array Personal ao salvar o Provider em questão;
- O Source Schema é responsável pela estrutura e pela atribuição de campos; se o servidor autoriza ou
  não no fim continua sendo decidido pela requisição real.

Os limites-alvo das cinco fontes ficam fixados assim:

| Fonte                        | Obrigatório/Permitido                                                                                                                                                                                        | Explicitamente proibido                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ZCode Built-in Provider     | Cada declaração raiz precisa fornecer o group `standard-builtin`, `zai-family` ou `bigmodel-family`; permite label/logo, enabled, visibility, API, template de Access, `builtinModelIds` | `standard-personal`, `modelIds`, `modelOrder`, `providerOrder`                   |
| Account Built-in Provider   | Pode sobrescrever apenas Family Providers Built-in do ZCode já existentes; permite enabled, Access de conta estruturado, `builtinModelIds` quando a interface realmente retorna | group, campos de exibição, visibility, API, membros/ordem Personal, Model Config |
| Personal Provider           | No topo é permitido `providerOrder`; o Overlay de um Provider existente permite label, enabled, visibility, API, Access, `modelIds/modelOrder`; a raiz Personal-only precisa de `group=standard-personal` | `builtinModelIds`; reescrever o group de um Provider existente                   |
| ZCode Built-in Model Rules  | `provider-model` e `match`; permite Model Config completo, padrão oficial de enabled e fatos estreitos de compatibilidade Built-in-only confirmados por evidência  | Membros, ordem, Access e credenciais dinâmicas do Provider                      |
| Personal Model Rules        | `provider-model` e `match`; permite campos esparses de Model Config sobrescritíveis pelo usuário                                                                                                            | Membros/ordem do Provider, Access, protocolos de produto não liberados para override Personal ou Compatibility pendente |

A parsing estrutural e a validação semântica acontecem em duas etapas: o Parser de arquivo único
rejeita estritamente campos desconhecidos; as restrições que precisam saber «se aquele ID vem do
Built-in» são concluídas na validação de montagem da Source. Como o branch atual não foi publicado,
Rules intermediários de desenvolvimento sem `type` são rejeitados diretamente, sem dual-read nem
schema migration; uma configuração antiga realmente publicada só é convertida na fronteira privada do
Legacy importer.

## 3. Provider Config

```ts
interface ProviderConfig {
  group?: "standard-builtin" | "standard-personal" | "zai-family" | "bigmodel-family" | null;
  label?: string | null;
  enabled?: boolean | null;
  visibility?: "visible" | "hidden" | null;
  api?: ProviderApiConfig | null;
  access?: ProviderAccessConfig | null;
  builtinModelIds?: readonly string[] | null;
  modelIds?: readonly string[] | null;
  modelOrder?: readonly string[] | null;
}
```

O `enabled` de topo do Provider é o portão de execução: um Provider disabled não entra no Registry, no
fallback, no seletor nem na criação por ID exato. `visibility=hidden` apenas oculta Settings/Seleção
comum; um Provider oculto completo e enabled ainda pode ser usado por produtos internos via ID exato.
O Provider não persiste `selectable`.

O `group` é um fato simples e explícito de organização de produto dos Providers, e não substituto de
capacidade de execução, tipo de Access ou visibilidade:

```text
standard-builtin
└─ ZCode 提供模板、用户自行配置的普通 Provider
   └─ 参与“添加供应商”候选与普通 providerOrder

standard-personal
└─ 用户从零创建的 Personal-only Provider
   └─ 参与普通 providerOrder

zai-family / bigmodel-family
└─ 固定属于对应账号 Family 的产品 Provider
   ├─ 不参与普通 Provider 拖动
   └─ Settings UI 不提供 Provider 启用/停用操作
```

O Renderer não infere mais o agrupamento por allowlist de Provider ID, tipo de Access ou Endpoint. As
declarações raiz ZCode Built-in precisam fornecer explicitamente um group não Personal; um
Provider Personal-only é fixo em `standard-personal`; Account/Personal Overlay não têm autoridade para
mudar o agrupamento de um Provider existente. O Provider não persiste mais um boolean `builtin`
adicional; o `group` completo já expressa simultaneamente o Built-in comum, o Personal-only e as duas
Families de conta. `visibility` continua expressando de forma independente se é visível para o usuário
comum, e `enabled` continua expressando de forma independente se pode executar.

Um Provider Built-in externo comum tem `enabled=false` por padrão. Quando o usuário o seleciona em
«添加供应商», um Personal Overlay é criado imediatamente com `enabled=true`. Built-in significa apenas
que é mantido embutido pelo ZCode; não significa que usa conta ZCode, que já tem credenciais nem que é
utilizável por padrão.

Não se adota `enabledModelIds`. O Provider mantém apenas a composição e a ordem dos modelos; a
ativação e desativação de modelos é responsabilidade do Model Config.

## 4. Composição de modelos e Built-in-wins

```text
builtinModelIds
└─ ZCode/Account Built-in 拥有的成员

modelIds
└─ 用户拥有的 Personal 成员
```

O conjunto de membros é produzido apenas pelos dois. Quando Built-in e Personal têm o mesmo ID, mantém-
se apenas um membro Built-in; em um array único com duplicatas, mantém-se a primeira ocorrência. Na
leitura, itens duplicados posteriores são ignorados de forma determinística, sem fabricar DTO
conflitante nem bloquear um modelo Built-in. A UI normal proíbe criar duplicatas; ao salvar o Provider
em questão, duplicatas e membros inválidos são normalizados automaticamente.

Não é permitido excluir um Built-in Model, e a lista não exibe botão de exclusão. Um Personal Model
pode ser excluído ou ter seu ID alterado. O Provider ID não pode ser modificado em nenhuma hipótese; o
Provider Name/label pode ser alterado e é único de forma case-insensitive após o trim.

## 5. `enabled` do Model Config

```ts
interface ModelConfig {
  enabled?: boolean | null;
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
  reasoningMapping?: Readonly<Record<string, ReasoningParameters>> | null;
  requiresMfjsToolSchema?: boolean | null;
}
```

O modelo não tem mais `visibility` independente. A única semântica de `enabled` é o portão de execução
do modelo:

```text
Effective Provider enabled
AND Provider complete
AND 模型是 Effective Provider 成员
AND Effective Model Config enabled
AND Model Config complete
        |
        v
Executable Model（进入 Registry）
        |
        + Provider visibility=visible
        v
Selectable Model（进入普通选择器）
```

Um modelo disabled continua no Settings, preservando configuração e ordenação, mas não pode ser
testado, usado em fallback, criado por ID exato nem contornado por nenhuma tarefa interna. Models já
criados e imutáveis não são afetados por refresco de configuração; criações posteriores obedecem ao
novo estado.

Uma Rule Built-in geral precisa fornecer o padrão completo `enabled=true`. Um lançamento oficial pode
usar uma Rule Built-in mais específica e posterior para definir modelos antigos como `enabled=false`.
Personal Rules vêm sempre depois das Built-in Rules, permitindo que o usuário sobrescreva
explicitamente; «restaurar padrão» remove a folha Personal de `enabled` e volta a herdar do Built-in.

Ao adicionar normalmente um Personal Model, a composição, a ordem e a Rule exclusiva
`enabled=true` são salvas atomicamente. Assim, o modelo recém-adicionado pelo usuário expressa
imediatamente a intenção explícita de habilitação, enquanto membros escritos à mão, sem Rule exclusiva
gerada, continuam sendo resolvidos pelo fallback completo do Built-in.

## 6. Rules exclusivas de Provider/Model e Match Rules gerais

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

`provider-model` pode pertencer a uma Source Built-in ou Personal: o Built-in usa para declarar o fato
oficial de uma combinação exata de Provider/Model; o Personal usa para carregar a sobrescrita exata da
página de Settings sobre um Model Built-in ou Personal. Somente Rules exclusivas Personais seguem o
ciclo de vida do usuário:

- criada ou atualizada ao ligar/desligar o enabled e ao editar Properties/Options/Reasoning;
- movida atomicamente junto com a composição e a ordem ao renomear um Personal Model;
- excluída ao excluir um Personal Model;
- ao excluir o Personal Overlay de um Provider, são excluídas todas as Rules exclusivas daquele
  Provider;
- ao restaurar o último campo sobrescrito, a Rule vazia é removida.

`match` pode pertencer a uma Source Built-in ou Personal e vale para um conjunto de alvos. Exclusão,
renomeação e deduplicação de Provider/Model não reescrevem nem removem automaticamente nenhuma Match
Rule, e também não modificam Rules exclusivas Built-in. Rules exclusivas usam IDs estruturados e não
emprestam regex para expressar «exato», nem introduzem um boolean `exclusive` de significado ambíguo.

As Rules embutidas continuam usando matcher e podem escolher a condição mínima suficiente conforme as
diferenças reais de modelo, Provider, API ou baseURL normalizado.

## 7. Ordenação de Model e Provider

A ordenação base dos Models é fixa em três segmentos:

```text
未出现在 modelOrder 的 Built-in Model
                  +
modelOrder 中仍有效的全部成员
                  +
未出现在 modelOrder 的 Personal Model
```

Portanto, um Built-in Model publicado online e ainda não ordenado pelo usuário fica por padrão na
frente. Quando a UI normal adiciona um Personal Model, todos os membros válidos atuais são materializados
em `modelOrder`, de modo que «Personal não ordenado» cobre apenas entrada escrita à mão ou anômala.

A cada salvamento real de reordenação:

1. mantém-se os membros válidos atuais;
2. removem-se IDs stale e duplicados, mantendo a primeira ocorrência dos duplicados;
3. acrescentam-se todos os membros faltantes;
4. salva-se o `modelOrder` completo.

Modelos disabled continuam participando da ordenação do Settings; após o filtro da Seleção, os modelos
restantes mantêm sua ordem relativa.

Providers usam o `providerOrder` de topo do Personal e não dependem mais do truque da ordem de
inserção do Map. Ele segue o mesmo princípio de «Built-in não ordenado na frente, ordem explícita no
meio, Personal não ordenado atrás»; cada adição ou reordenação materializa a ordem completa atual dos
Providers comuns. As Families Z.ai/BigModel mantêm uma organização de produto fixa e não participam da
ordenação comum de Providers.

O alvo do shell de persistência Personal é:

```ts
interface PersonalProviderConfigFile {
  schemaVersion: 1;
  providerOrder?: readonly string[];
  providers: Record<string, PersonalProviderConfig>;
  modelConfigRules: readonly PersonalModelConfigRule[];
}
```

`providerOrder` é a semântica de conjunto da própria Source Personal e não participa de Overlay de
campos de Provider. A ordenação base dos ZCode Built-in Providers continua vindo da ordem de declaração
do Map de Providers do Release; Account não fornece ordem. Como o branch atual não foi publicado, o
campo de armazenamento `models` existente, de significado ambíguo, é simplesmente renomeado para
`modelConfigRules`, sem migration para o formato intermediário de desenvolvimento; o Legacy importer
emite o campo final.

## 8. Settings: adição, ativação e exclusão de Provider

A ordem fixa na navegação de Providers é: Family de conta Z.ai/BigModel primeiro; logo em seguida as
duas ações fixas «添加供应商» e «创建自定义供应商»; e depois delas a lista comum de Providers
`standard-builtin` e `standard-personal`. As duas ações não participam de `providerOrder` nem de
arrastar.

```text
添加供应商
└─ 候选 = visible + group=standard-builtin - Personal Provider Map keys
   └─ 点击后立即创建 Personal Overlay(enabled=true)并进入编辑

创建自定义供应商
└─ 先取得唯一且不可再修改的 providerId 与唯一 label
   └─ 立即创建 group=standard-personal、enabled=true 的 Personal-only Provider
      ├─ access.type=api
      ├─ 不预填 api.type、baseURL 或模型
      └─ 进入完整自定义编辑，不再需要第二次“创建”
```

O fato autoritativo de «já adicionado» é apenas se o Personal Provider Config Map contém aquele
providerId. Isso não tem relação com API Key, enabled, executable ou selectable. O enabled do Provider
é um interruptor independente na página de configuração: um Provider disabled continua na área já
configurada; somente a exclusão do Personal Overlay faz ele voltar aos candidatos de adição.

Na UI, a semântica de domínio de «excluir Provider» é sempre excluir o Personal Overlay:

```text
standard-builtin
└─ 删除 Personal Overlay + 该 Provider 的 Personal 专属 Rules
   └─ Effective Provider 回落到 Built-in，重新进入“添加供应商”候选

standard-personal
└─ 删除 Personal Overlay + 该 Provider 的 Personal 专属 Rules
   └─ 因不存在其他定义而自然消失

zai-family / bigmodel-family
└─ 删除 Personal Overlay + 该 Provider 的 Personal 专属 Rules
   └─ Effective Provider 回落到 Built-in/Account 状态，继续留在固定 Family 区域
```

O sistema nunca exclui a ZCode Built-in Config. Match Rules pessoais gerais não são removidas junto com
a exclusão do Provider. Families não entram nos candidatos comuns de «添加供应商» e a UI não oferece
interruptor de enabled do Provider para elas; os campos de baixo nível continuam disponíveis para a
montagem Built-in/Account, e estados especiais formados por edição manual da configuração não fazem
parte das garantias de produto da UI de Settings.

O contrato de Settings do Host precisa no mínimo fornecer os seguintes resultados autoritativos:

```text
ProviderSettingsView
├─ revision
├─ addableProviders[]
│  └─ visible + group=standard-builtin + 尚无 Personal Overlay
├─ providerOrder[]
└─ providers[]
   ├─ providerId / group / label
   ├─ effectiveBuiltinConfig / personalConfig / effectiveConfig
   ├─ enabled / issues / executable
   └─ models[]
      ├─ modelId / builtin
      ├─ effectiveBuiltinConfig / personalExactConfig / effectiveConfig
      └─ enabled / issues / executable / selectable
```

Não são mais retornados `isZCodeBuiltin`, `canReorder`, DTOs de conflito de membros nem a nomeação de
executable do Provider como selectable. O Renderer organiza a área já configurada conforme o `group`,
mas candidatos, ordem, origem dos membros e todos os estados derivados são produzidos pelo Host.

As Mutations do Host precisam cobrir as seguintes operações de domínio; os nomes de função podem
obedecer ao estilo do código, mas as semânticas não podem ser fundidas:

- `addBuiltinProvider(providerId)`: cria um Personal Overlay com `enabled=true` e materializa o
  `providerOrder` completo;
- `createPersonalProvider({ providerId, label })`: valida a identidade e cria imediatamente um Provider
  API vazio, materializando a ordem;
- `savePersonalProvider(providerId, sparseConfig)`: salva o Overlay de label/enabled/API/Access, sem
  modificar o ID;
- `deletePersonalProvider(providerId)`: remove o Personal Overlay e as Rules exclusivas pessoais
  daquele Provider;
- `reorderProviders(completeProviderOrder)`;
- `addPersonalModel`, `renamePersonalModel`, `deletePersonalModel`, `reorderModels`;
- `savePersonalModelConfig` e a restauração de padrão por folha;
- `previewPersonalModelRename`: move primeiro as Rules exclusivas e só então resolve o novo padrão
  Built-in;
- `testModel`: salva, atualiza e executa pelo Registry/ModelFactory oficial.

Todas as respostas de sucesso das Mutations precisam corresponder à mesma revision já persistada e
observada pelo Registry. Local e remoto usam o mesmo contrato de serviço, mas a instância de serviço
pertence ao Host do Environment de destino.

## 9. Settings: edição de Model

A lista de modelos usa linhas de informação compacta; o input de Model ID editável não é mais renderizado
na lista, e rótulos de origem Built-in/Personal ainda não são exibidos. A origem continua fornecida
explicitamente pelo Host DTO no campo `builtin`, usado para permissões de exclusão e operações de
domínio; o Renderer não usa allowlist de IDs nem inferência por Preset/Catalog.

A linha do modelo exibe diretamente o Model ID, o resumo compacto necessário, o estado enabled efetivo,
teste, o lápis de edição e a ação de exclusão. O lápis de edição continua exposto; a exclusão continua
exposta nas linhas de Personal Model, e o Built-in Model não mostra exclusão. O controle de
ativação/desativação mostra o estado efetivo atual, mas a lista não enfatiza se ele vem do padrão
Built-in ou de uma sobrescrita Personal.

Quando o Provider é editável, todos os membros Model Built-in/Personal efetivos podem ser ordenados; um
Built-in Model apenas não pode ser excluído e não pode herdar a restrição atual de «só Personal Model
pode ser arrastado». Os modelos ordenáveis usam a linha inteira como área de ativação de arrasto, sem
bloco de arrasto separado; controles dentro da linha, como editar, excluir, ativar/desativar e testar,
precisam ficar fora do alcance de ativação do arrasto. O limiar de movimento do ponteiro serve para
distinguir clique comum de arrasto; no toque é preciso evitar conflito com a rolagem da lista, e o
teclado precisa continuar oferecendo capacidade de ordenação equivalente. Clicar normalmente na linha do
modelo por enquanto não abre o editor e não gera operação de configuração; só o lápis de edição exposto
entra no editor de Model.

A página de edição de modelo permite editar o conjunto completo de campos do Model Config, mas a
persistência sempre forma uma Personal Rule esparsa, escrevendo só as folhas que o usuário alterou ou
 limpou explicitamente:

- `enabled`;
- context/max output;
- formato de input/output;
- tool call, structured output, native web search, MCS;
- option specs e reasoning mapping;
- campos de codificação de requisição cuja sobrescrita por Personal esteja confirmada;
- `requiresMfjsToolSchema` por último.

O editor de modelo precisa distinguir os seguintes fatos, sem supor que todo campo tem um padrão
Built-in:

```text
没有 Personal 叶子 + 上游存在值
└─ 继承该值

没有 Personal 叶子 + 上游不存在值
└─ 未设置；不能显示成“默认关闭”或虚构空值

存在 Personal 叶子
└─ 用户明确覆盖

Personal 显式 clear（字段允许时）
└─ 明确清除上游值
```

Os controles de campo seguem a semântica visual unificada abaixo:

| Estado                                | Visual e interação                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Upstream tem valor, Personal não sobrescreve | Mostra o resultado efetivo real, mas com texto, preenchimento ou traço de baixa ênfase; sem ação de restauração |
| Upstream não tem valor, Personal não sobrescreve | Mostra um traço neutro ou o placeholder «未设置»; não pode se passar por desligado nem por valor padrão vazio |
| Personal sobrescreve explicitamente    | Usa a ênfase normal do controle; oferece um ícone de desfazer de baixa interferência, exibido no Desktop em hover/focus e mantido descobível no toque |
| Personal com clear explícito           | Mostra um estado claro de não definido/limpo; não pode ser confundido com «sem folha Personal»              |
| Erro de validação                     | Usa o texto de erro padrão e a cor semântica, sem misturar com a força visual de herança/sobrescrita      |

Texto e número mostram como placeholder o valor herdável quando ele existe, sem copiá-lo para o
Personal; quando não há valor upstream, mostram «未设置». Limpar a entrada Personal restaura a
herança, e quando o campo realmente permite clear explícito é oferecida uma ação de limpeza estreita e
explícita. Enums continuam usando a linguagem de Select existente: quando recolhido mostram o resultado
efetivo; dentro do menu distinguem «herdar o valor existente», «manter não definido», «limpar
explicitamente» (quando permitido) e os valores de enum propriamente ditos, sem empilhar textos longos
como «默认(当前为 X)» no gatilho.

O `enabled` geral do Model usa um Switch compacto. Input/Output Format e os Boolean de capacidade como
tool call, structured output, native web search e MCS usam Toggle Chip / Selectable Tag coordenados com
os controles de Modality existentes: um Outline Button com um check e um rótulo curto, dispostos em
linhas que quebram, em vez de uma fileira de Switches. Herança ligada usa uma Tag selecionada de baixa
ênfase e ativação explícita usa a Tag selecionada com ênfase normal; herança desligada e desligamento
explícito usam, respectivamente, traço de baixa ênfase e traço normal; ausência de valor upstream usa um
traço neutro. O estado selecionado usa o check, não definido usa o traço, e a sobrescrita Personal tem
ainda um ponto de desfazer e um nome acessível, portanto não é possível distinguir os estados apenas
pela cor. Fatos bloqueados como Text continuam usando o ícone de cadeado existente e a semântica de
desabilitado. PDF/Audio ainda não são exibidos, mas edições não relacionadas precisam preservar o valor
Personal deles.

Option Specs e Reasoning Mapping são configuração avançada, usando vários editores de texto JSON
independentes, com realce de sintaxe ou pelo menos fonte monoespaçada e formatação automática; não se
desenvolve um editor de `optionSpecs` global, tabelas, Mapping linha a linha ou um Builder visual. A
primeira versão inclui pelo menos:

```text
Reasoning Level Option Spec JSON
└─ 直接覆盖 optionSpecs.reasoningLevel

Max Output Tokens Option Spec JSON
└─ 直接覆盖 optionSpecs.maxOutputTokens

Reasoning Mapping JSON
└─ 直接覆盖整个 reasoningMapping
```

Cada editor corresponde a um slot de configuração independente; como o editor fornece JSON, ele substitui
diretamente o valor upstream daquele slot, e um editor Personal vazio significa remover a sobrescrita do
slot e voltar a herdar. O shell `optionSpecs` no arquivo Personal pode conter apenas os subcampos
sobrescritos, mas dentro de um único editor não há Overlay de granularidade menor; `reasoningMapping`
também não pode implementar por baixo dos panos um merge por key na UI. O JSON efetivo de cada slot é
visto por meio de uma pré-visualização somente leitura, uma área colapsável ou abas, e não é permitido
copiar o JSON efetivo e salvá-lo como Personal. Antes de salvar, executa-se o parsing do JSON e a
validação de Schema estrita do slot correspondente, com erros localizados o máximo possível em linha,
coluna ou caminho de campo.

A página não pode colocar um botão de «restaurar padrão» chamativo ao lado de cada campo. A restauração
da herança é feita limpando a entrada, o item de herança/não definido do Select, o ponto de desfazer de
baixa interferência do Toggle Chip ou o conteúdo JSON Personal.

Todos os controles acima precisam reutilizar as dimensões, raios, foco, menus e tokens semânticos do
`DESIGN.md` e dos componentes existentes. É proibido usar valores hardcoded claros/escuros ou adivinhar o
tema apenas por opacidade; é preciso cobrir pelo menos Zai Light, Zai Dark, foco de teclado, hover,
desabilitado, erro e toque sem hover. A interface usa a hierarquia de fontes `text-ui-*`, Model ID e JSON
usam fonte monoespaçada e textos longos em chinês e inglês podem quebrar de forma razoável em tela
estreita.

A edição de Model continua usando um modal, sem migrar para um painel lateral direito ou uma página
secundária de Settings. O espaço atual de `max-w-xl` é insuficiente, e o Desktop amplia o modal em um
degrau, partindo da faixa de tamanho existente próxima de `max-w-2xl`, em vez de virar uma bancada
horizontal ou um modal quase em tela cheia. O crescimento de campos é comportado principalmente por
seções verticais; largura e altura do modal precisam permanecer proporcionais, com Header e Footer
fixos e apenas uma região central de rolagem, evitando múltiplas camadas de rolagem de página entre o
modal e os editores JSON. Telas estreitas e Mobile usam a largura e a altura disponíveis dentro das
margens seguras, sem alterar a semântica de campos, herança e salvamento. A implementação pode ajustar
ligeiramente a largura e a altura reais dentro das faixas de tamanho existentes, mas não pode manter o
tamanho antigo escondendo campos cuja abertura foi exigida.

O modal de edição de Model adota explicitamente o salvamento manual, uma exceção delimitada dentro da
mentalidade de salvamento automático da página de Settings. Ao abrir o modal, um Draft local é criado
com base no Host View e na revision atuais; alterar Model ID, Properties, Option Specs, Reasoning Mapping
e afins apenas atualiza o Draft, sem persistir campo a campo e sem disparar refresh do Registry. As
operações de domínio pontuais da lista — ativação/desativação, ordenação, exclusão — continuam sendo
salvas de forma imediata e atômica, sem serem misturadas ao Draft do modal.

```text
Host View @ R1
      |
      v
打开弹窗 -> Local Model Draft @ R1
                 |
                 +--> 编辑字段 --------> 只修改 Draft
                 |
                 +--> 取消 / X / Esc ---> 丢弃 Draft，不写配置
                 |
                 `--> 保存
                        |
                        +--> 完整校验失败 ----> 保留弹窗与 Draft，展示错误
                        |
                        `--> 一次原子 Host Mutation
                                  |
                                  v
                          Persist + Registry @ R2
                                  |
                                  v
                              关闭弹窗
```

O botão de salvar não pode ser disparado repetidamente quando o Draft é inválido ou está sendo
submetido. O salvamento precisa validar uma única vez e submeter a configuração Personal esparsa
expressa pelo Draft completo; a migração de membros, ordem e Rules exclusivas exigida pela alteração do
Model ID também faz parte da mesma Mutation atômica. O modal só pode ser fechado depois que o Host
confirmar que o resultado persistido foi observado pelo Registry; em caso de falha de salvamento, a
entrada do usuário é preservada e não pode regredir para salvamento automático campo a campo.

Ao alterar o Personal Model ID, é preciso mover primeiro, na semântica de pré-visualização, a Rule
exclusiva `provider-model` daquele modelo, depois resolver novamente as Built-in Rules com o novo ID,
API efetiva e Endpoint, e por fim sobrepor os valores Personais esparses originais. Assim, o padrão
herdado é atualizado e os valores explícitos do usuário permanecem iguais.

## 10. Escrita e organização da configuração Built-in

Os Providers são ordenados continuamente por origem de produto: API direta da Zhipu e
conta/assinatura/Off-Peak primeiro, e os Providers externos principais depois. Um Built-in Provider
externo comum tem por padrão `group=standard-builtin`, `enabled=false` e `visibility=visible`,
fornecendo protocolo, Endpoint, template de Access e membros recomendados; a Personal Config preenche
os materiais de acesso reais.

Z.ai e BigModel mantêm cada uma duas identidades de produto de API Key distintas:

```text
Family API Key Provider
├─ account:zai-api-key       -> group=zai-family
└─ account:bigmodel-api-key  -> group=bigmodel-family
   └─ 与账号套餐一起由固定 Family UI 管理

普通 API Provider
├─ zai-api           -> group=standard-builtin
└─ bigmodel-api      -> group=standard-builtin
   └─ 从“添加供应商”进入，用户独立填写 API Key
```

Mesmo quando Endpoint, API Schema e modelos recomendados são iguais, os dois grupos de Providers têm
providerId, Personal Overlay, enabled, API Key, composição de modelos e ordenação distintos. Eles não
podem compartilhar nem copiar credenciais silenciosamente. Fatos estáticos de modelo duplicados
continuam reutilizando o matcher das Model Rules; não é permitido adicionar checagem especial de ID
para esses quatro Providers no Runtime/Adapter.

O prefixo `builtin:` dos IDs de Provider de conta existentes é alterado de uma só vez para `account:`,
tornando a identidade física consistente com a semântica de produto:

```text
builtin:zai-*       -> account:zai-*
builtin:bigmodel-*  -> account:bigmodel-*
builtin:offpeak-idle-plan
                    -> account:zai-offpeak-idle-plan
                     + account:bigmodel-offpeak-idle-plan
```

Como o branch atual não foi publicado, não se mantêm alias de IDs antigos, dual-read nem migration de
persistência; testes, Family Spec, fixtures de ModelSelection e constantes exatas de Provider precisam
trocar atomicamente.

O Off-Peak deixa de usar um Provider compartilhado que acompanha dinamicamente a Family da conta em
tempo de execução e passa a ser desdobrado em dois Providers completos:

```text
account:zai-offpeak-idle-plan
├─ group=zai-family
├─ visibility=hidden
└─ access.executionProtocol=off-peak

account:bigmodel-offpeak-idle-plan
├─ group=bigmodel-family
├─ visibility=hidden
└─ access.executionProtocol=off-peak
```

O Account Built-in Overlay habilita apenas o Off-Peak Provider correspondente à conexão estruturada
Family/Coding Plan atual, deixando o outro explicitamente `enabled=false`. O ponto de entrada de criação
do Off-Peak obtém o Provider exato conforme a Family atual; não existe «Provider compartilhado trocando
de Family na hora da requisição». Tarefas já salvas continuam segurando o `ModelSelection` original:
quando o usuário troca de Family, o Provider da Family antiga fica disabled e a tarefa é mantida, mas
não agendável; ao voltar e a conexão voltar a ser válida, ela é restaurada. O sistema não pode migrar
silenciosamente tarefas já salvas para outra Family nem fabricar um ModelSelection substituto para elas.

As Model Rules permanecem um único array ordenado:

```text
完整保守兜底
      |
      v
模型家族 A
├─ 仅 model match 的公共事实
├─ model + API 特化
├─ provider + model 特化
└─ 必要的 Endpoint 特化
      |
      v
模型家族 B ...
```

As regras relacionadas à mesma família de modelos são colocadas em sequência. Runtime, Adapter e UI
não estabelecem um segundo fato por modelId, Provider ID ou URL concretos. A configuração do repositório
atual faz apenas uma revisão leve de correção: todos os membros Built-in precisam ser resolvidos em um
Model Config completo, checando se MCS, Native Web Search, formatos de mídia, Reasoning e MFJS já
foram cobertos pelas Rules; não se restaura uma tabela histórica estrita de correspondência.

## 11. Limites de Access e Adapter

Os seguintes fatos pertencem ao Provider Access:

```text
access.executionProtocol = "off-peak"
```

A admissão da verificação de segurança de requisição da versão oficial também pertence ao Provider
Access e é executada na fronteira final de transporte HTTP do Adapter (os campos e a implementação
concretos são mantidos apenas na versão oficial). Ela não entra em Model properties, não é decidida por
modelId e não substitui a autenticação por API Key.

Decisões de compatibilidade:

- o reasoning OpenAI-compatible depende do encoding canônico histórico e do SDK nativo, e a reprodução
  especial do ZCode é removida;
- o `omitMaxOutputTokens` do GitHub Copilot é removido;
- o Snowflake Cortex não é suportado no momento, e `maxOutputTokensRequestField` é removido;
- a verificação de segurança de requisição da versão oficial e o failure/execution protocol do Off-Peak
  saem do Model Config e vão para o Access; nesta rodada os erros de string do Off-Peak não são
  refatorados;
- `requiresMfjsToolSchema` permanece no Model Config; quando habilitado projeta o Tool JSON Schema e,
  se a projeção falhar, o erro é reportado diretamente;
- o DeepSeek Anthropic unifica a execução do replay canônico, sem fabricar synthetic empty thinking;
- o patch de assinatura text/tool do Z.ai que não entrou na baseline atual não é incorporado; se houver
  necessidade de suporte, é preciso obter antes evidência de resposta real e respeitar «reproduzir o
  que foi recebido».

## 12. Limite do Client Config

A ZCode Built-in Provider Config e as Built-in Model Config Rules são publicadas juntas como um Release
`zcodeBuiltin` atômico. O conteúdo do repositório/pacote de instalação é o fallback para antes do pull e
em caso de falha; cada Environment usa seu próprio Active/LKG e seu próprio Registry. O workspace
remoto tem sua configuração obtida, interpretada e devolvida pelo Remote Host, e o Renderer não passa a
configuração do Local Host como se fosse um fato remoto.

Este Todo exige apenas que os campos novos façam round-trip completo pelo caminho mínimo existente do
Todo 18, sem unificar de passagem todos os consumidores de `/client/configs`.

## 13. Ordem de implementação

1. Testes primeiro, estabelecendo os cinco Source Schema, o `group` de Provider, a união de Personal
   Rules e os testes de completude e ordenação de Provider/Model;
2. Ajustar os tipos de Config/Protocol/Repository, removendo o candidato `enabledModelIds` e a
   visibilidade de Model;
3. Implementar o ciclo de vida das Rules exclusivas `provider-model` e o isolamento das Rules gerais
   `match`;
4. Implementar o enabled de modelo, a ordem de Model/Provider em três segmentos, o Built-in-wins e a
   normalização no salvamento;
5. Organizar a ordem de Providers e Rules em `zcode-builtin.json`, trocar de uma só vez os IDs para
   `account:`, desdobrar os Family/API Providers comuns de Z.ai/BigModel e os dois Off-Peak Providers, e
   completar os padrões de enabled de modelo e as desativações oficiais;
6. Migrar a verificação de segurança de requisição da versão oficial e o execution protocol do Off-Peak
   para o Access, limpando as compatibilidades de Adapter cuja remoção já foi decidida;
7. Refatorar a Facade, as Mutations e a UI de Settings, unificando a fonte autoritativa de Local/Remote
   Host;
8. Remover a inferência de origem por Preset/Catalog, o truque antigo de ordenação, campos mortos,
   helpers mortos e testes obsoletos;
9. Sincronizar os fatos deste Todo, item a item da implementação final, para a Design Tree, o Feature
   Graph e os documentos antigos superseded;
10. Executar testes unitários, verificação de tipos, Lint, verificação de formatação e os E2E afetados,
    e submeter um Conventional Commit.

## 14. Plano de testes

### Config e Resolver

- matriz de permitido/proibido dos cinco Source Schema;
- o `group` do ZCode Built-in é obrigatório e não pode ser `standard-personal`; Personal-only é fixo em
  `standard-personal` e o Overlay não pode mudar o grupo;
- os quatro conjuntos Built-in comum, Personal-only, Z.ai Family e BigModel Family são completos e
  mutuamente exclusivos;
- os dois Off-Peak Providers são habilitados de forma mutuamente exclusiva pelo Account Overlay
  conforme a Family atual;
- o Personal não pode escrever `builtinModelIds` nem salvar `modelIds` duplicados de Built-in no fluxo
  normal;
- quando Built-in e Personal têm o mesmo ID, vale Built-in-wins e, em array único com duplicatas, mantém-
  se a primeira ocorrência;
- padrão Built-in do `enabled` de Model, especialização oficial, sobrescrita posterior do Personal,
  restauração de padrão e round-trip de JSON;
- ordem, exclusão, renomeação e limpeza de Rule vazia das Rules exclusivas `provider-model` e das
  Rules gerais `match`;
- a fórmula que forma executable/selectable a partir de enabled, completude e visibility do
  Provider/Model.

### Ordenação e ciclo de vida

- ordenação em três segmentos de Model/Provider;
- um novo Built-in cai automaticamente no segmento de Built-in não ordenado;
- a adição normal de Personal atualiza atomicamente a composição, a ordem e a Rule exclusiva
  `enabled=true`;
- o salvamento de reordenação completa members, remove stale e elimina duplicatas;
- rename/delete de Personal Model atualiza atomicamente composição, ordem e Rules exclusivas;
- a exclusão de Provider remove o Overlay e as Rules exclusivas, sem modificar as Match Rules gerais;
- membros disabled mantêm a posição no Settings e são excluídos de Selection/Registry.

### Settings e entre ambientes

- «já adicionado» depende apenas da pertença ao Personal Map; um Provider disabled não volta aos
  candidatos de adição e só a exclusão o traz de volta;
- tanto adicionar um Built-in quanto criar um Personal-only têm efeito imediato e escrevem
  `enabled=true`;
- os candidatos comuns vêm apenas de `group=standard-builtin`; as duas Families não dependem de filtro
  por allowlist de ID;
- as duas Families não participam da ordenação comum e a UI não oferece interruptor de enabled do
  Provider para elas; após a exclusão do Personal Overlay, continuam na área fixa de Family;
- a criação de Provider personalizado não adivinha API Schema, Endpoint ou modelos; após confirmar a
  identidade, cria imediatamente um Provider incompleto;
- Personal Config, credenciais, enabled e ordenação dos Family API Key Providers são isolados dos
  Z.ai/BigModel API Providers comuns;
- a troca dos IDs de Provider para `account:` é atômica em toda a cadeia e sem alias antigo;
- depois de trocar de Family, as tarefas de Off-Peak da Family antiga são mantidas, mas não agendáveis, e
  voltam ao funcionar ao retornar; o ModelSelection não pode ser migrado silenciosamente;
- Built-in Model não tem botão de exclusão, todos os Provider ID são somente leitura e o label é único;
- placeholder efetivo, sobrescrita explícita e restauração de padrão; campos ocultos são preservados sem
  perdas;
- os quatro estados de edição — upstream com padrão, upstream sem padrão, sobrescrita Personal e clear
  explícito — não se confundem entre si;
- o enabled de Model usa Switch e os Boolean de capacidade usam Toggle Chip/Selectable Tag no estilo
  existente; estado selecionado, não definido e sobrescrita Personal têm pistas além de cor;
- `optionSpecs.reasoningLevel`, `optionSpecs.maxOutputTokens` e `reasoningMapping` usam
  respectivamente editores de JSON Personal formatados e independentes com pré-visualização somente
  leitura do valor efetivo; cada editor substitui diretamente o seu próprio slot, sem Overlay interno nem
  merge por key dentro do editor;
- a edição de Model usa um modal um grau maior e proporcional, e não painel lateral direito nem página
  secundária; o Desktop não faz layout ultralargo, tem Header/Footer fixos, apenas a área central de
  rolagem e o Mobile usa a faixa segura do viewport;
- o modal de edição de Model usa Draft local e salvamento manual; a edição de campos não escreve
  configuração antecipadamente, cancelar/X/Esc não gera Mutation, o salvamento dispara apenas uma Mutation
  atômica e o modal só fecha depois que o resultado persistido é observado pelo Registry; em caso de
  falha, o Draft e o modal são preservados;
- a ativação/desativação, a ordenação e a exclusão na linha do Model continuam sendo operações
  imediatas e atômicas, sem se misturar ao Draft do modal;
- a linha compacta de Model não renderiza input de Model ID nem rótulo de origem, preservando as ações
  expostas de teste, edição, ativação/desativação e exclusão de Personal;
- clicar normalmente na linha do Model não abre o editor; a edição entra apenas pelo lápis; o arrasto da
  linha inteira não é disparado pelos botões internos, e há suporte a limiar de ponteiro, rolagem por
  toque e operação equivalente por teclado;
- as ações fixas de Provider, a lista de modelos e o editor completo de modelo cobrem layouts Zai
  Light/Zai Dark, Desktop e Mobile, e os idiomas chinês e inglês;
- ao alterar o Model ID, primeiro move a Rule exclusiva Personal e só então atualiza o Built-in Preview;
- workspace local usa o Local Host e workspace remoto usa o Remote Host; o Renderer não faz resolução
  de fallback local.

### Adapter e regressão

- a verificação de segurança de requisição da versão oficial e o Off-Peak são roteados pelo Access e os
  campos correspondentes desaparecem do Model Config;
- após remover Copilot/Snowflake/replay antigo do OpenAI, não há fallback de Runtime;
- MFJS habilitado, desabilitado e com falha de conversão;
- só decidir o destino dos campos do DeepSeek A/B depois que resultados de requisições reais formarem
  um fixture reproduzível;
- requisições comuns, Compact, Memory, Child Agent e Off-Peak usam apenas fatos de Active Model/Registry.

## 15. Definição de conclusão

- A Design Tree, a visão geral, o Feature Graph e a implementação estão alinhados, e
  `enabledModelIds`, a visibilidade de Model e DTOs conflitantes não aparecem mais como desenho alvo;
- O Provider gerencia apenas a composição e a ordenação, e o `enabled` do Model Config é o único portão
  de execução de modelo;
- A Rule Built-in geral fornece o padrão completo, e o lançamento oficial pode desativar por padrão
  modelos antigos por meio de uma Rule específica;
- Toda a edição de modelo individual da página de Settings cai em uma Rule exclusiva Personal
  estruturada; as Match Rules gerais não são adivinhadas por operações de ciclo de vida;
- As três semânticas «Provider já adicionado», «Provider enabled» e «exclusão de Provider» não são
  misturadas entre si;
- A configuração Built-in cobre os hardcodes atuais conhecidos de modelos/API estáticos, sem criar novos
  segundos fatos de Runtime;
- A atribuição de protocolos de produto do Access e da compatibilidade de requisição de Model está
  correta e não sobrou nenhum item cuja remoção foi decidida;
- `pnpm typecheck`, `pnpm lint`, os testes unitários relacionados, a verificação de formatação e os E2E
  afetados passam;
- O envio é feito com Conventional Commit.