# 13 Autoridade de Seleção de Modelo no Host Alvo e Aposentadoria da Cadeia de Preparo Antiga

> Status: concluído
>
> Data: 2026-08-25
>
> Pré-requisito: [`todo-12-model-selection-validation-boundary-cutover.md`](./todo-12-model-selection-validation-boundary-cutover.md)
>
> Designs relacionados: [`../design/interaction/selection-state.md`](../design/interaction/selection-state.md),
> [`../design/environment/environment.md`](../design/environment/environment.md),
> [`../design/registry/registry.md`](../design/registry/registry.md)

## 0. Objetivo da tarefa

Os candidatos de modelo apresentados ao usuário, as Model Option Specs, o Default Configurado e a seleção inicial de novas Sessions passam a vir, de forma unificada, do **Host do Environment alvo**: um Workspace local usa o Local Host e um Workspace remoto usa o Remote Host. O Renderer deixa de derivar retroativamente os fatos de seleção de modelo do Environment alvo a partir do Snapshot global do Base Host, de um App Agent temporário, do Catalog do Session Runtime ou de `configOptions`.

A cadeia formal fica fixa em:

```text
                         Target Workspace
                                |
                  +-------------+-------------+
                  |                           |
             Local Workspace            Remote Workspace
                  |                           |
                  v                           v
       Local Host ModelSelection    Remote Host ModelSelection
                  |                           |
                  +-------------+-------------+
                                |
                                v
                     Entry Draft / App Recent
                                |
                                v
                Sparse Structured ModelSelection
                                |
                                v
                  Target Worker Registry
                                |
                                v
                         Active Model
```

O Host é responsável pelos fatos de seleção e entrega, na mesma View, o `preferredSelection` já resolvido com Default/Fallback configurados; o Renderer apenas sobrepõe Composer/Draft e o workspace App Recent. Worker Registry / ModelFactory continuam responsáveis pela validação final de execução e pela criação do Model. O Host não é um segundo Registry de execução, e o Renderer não ganha permissão de construir ou adivinhar Models por obter a Host View.

## 1. Decisões confirmadas

### 1.1 A leitura da seleção de modelo vem do Host alvo

- Os candidatos de modelo de um Workspace local são lidos do `IModelSelectionService` do Local Host;
- Os candidatos de modelo de Workspaces SSH, WSL, Docker e Server são lidos do `IModelSelectionService` do Remote Host correspondente;
- Em `remote-waiting`, desconexão ou Host alvo indisponível, o estado permanece loading/unavailable e nunca há fallback para Base/Local Host;
- O Remote Host retorna sua própria Provider/Model View, e o Desktop não injeta no remote um Snapshot local do Registry;
- Na execução, o Worker ainda revalida a Selection usando o Registry/ModelFactory do Environment ao qual pertence; o resultado da seleção do Host não pode contornar o fail-closed final.

### 1.2 Workspace Key e App Recent

O escopo de isolamento do App Recent fica fixado como:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
App Recent scope = App x workspaceKey
```

- Esta rodada não adiciona `environmentId` nem cria um novo repositório de identidade de Host;
- Workspaces remotos precisam atravessar o `workspaceIdentity` existente, e Workspaces locais podem recorrer a `workspacePath`;
- `remoteSessionId` continua sendo usado para roteamento de conexão/sessão remota, mas não substitui a Workspace identity estável;
- Workspaces remotos com o mesmo `workspacePath` mas `workspaceIdentity` diferentes não podem compartilhar Recent;
- `workspacePath` continua cobrindo apenas arquivos, comandos, Git e exibição de caminhos.

O App Recent guarda uma `ModelSelection` estruturada e esparsa, e só é atualizado quando o App aceita um Submission normal do usuário. Navegação de menu, clique em modelo, Goal com rodadas automáticas, Background, Off-Peak e Subagent não escrevem no App Recent.

### 1.3 A Host View retorna candidatos e Selection preferida de forma atômica

- O Default Configurado continua pertencendo ao Workspace alvo;
- O Renderer Desktop/Web não lê diretamente `.zcode/v2/model-selection.json`;
- O Host alvo lê o Default Configurado do próprio Workspace e resolve atomicamente a Selection preferida com a View visível ao usuário atual;
- Prompt CLI e TUI não precisam iniciar Host/RPC, mas precisam reutilizar o mesmo preferred resolver do domínio de provider e o mesmo repositório de Workspace;
- O Fallback usa apenas modelos visible, enabled e selectable na View atual do Host; Providers/Models ocultos não participam;
- O Fallback inicializa apenas o Draft/Session desta vez e não sobrescreve o Default Configurado persistente.

O Host não adiciona um RPC independente `resolveInitialSelection()`; ele retorna candidatos, Option Specs e `preferredSelection` na mesma `ModelSelectionView`. O `preferredSelection` já tem a resolução do Default Configurado e do Fallback do Host feita; o Renderer apenas sobrepõe o próprio Composer/Draft e o workspace App Recent:

```text
App 新 Session

已有 Composer / Draft
  > 当前 View 中仍可选的 workspace App Recent
  > Host preferredSelection

Prompt CLI / TUI 新 Session

显式 Draft / 参数
  > domain preferredSelection
```

Retomar uma Session existente não lê o Default Configurado e continua tendo a Session Selection persistente como referência.

### 1.4 Seleção formal e persistência passam a usar uma `ModelSelection` esparsa e estruturada de forma unificada

Os seguintes estados, protocolos e persistências formais deixam de montar a seleção com a string `model` e um `thoughtLevel` separado:

- Composer Draft, App Recent e Session Selection;
- registro de Automation;
- settings de geração do Repo Wiki;
- preferência/config de modelo do Bot;
- seleção de tarefa Off-Peak;
- override de modelo de Subagent Custom, Workspace e Built-in;
- outras configurações de produto que criarão Models no futuro.

A estrutura alvo é única:

```ts
interface ModelSelection {
  providerId: ProviderId;
  modelId: ModelId;
  options?: {
    reasoningLevel?: string;
    maxOutputTokens?: number;
  };
}
```

- `ModelSelection.options` guarda apenas as options especificadas explicitamente pelo usuário ou chamador; quando não há especificação explícita, os valores padrão do Option Spec não são copiados;
- `options` e cada folha podem faltar; `options: {}` é normalizado para campos ausentes; a Selection formal não salva `null` de option;
- APIs de patch/update podem usar `null` para expressar "remover a sobrescrita explícita"; o repositório precisa remover a folha correspondente em vez de persistir `null`;
- Quando o usuário seleciona explicitamente uma option exatamente igual ao valor padrão atual, isso ainda é um pin explícito e precisa ser salvo; somente "usar o padrão" remove a folha;
- `inherit` é expresso pela ausência do campo externo ou por uma união de produto explícita, e não como uma pseudo string de modelo;
- O picker pode usar string key/value internamente ao componente, mas a fronteira `onSelect` converte imediatamente de volta para `ModelSelection`;
- Argumentos de CLI e importers Legacy já publicados podem fazer parse de strings; o Domain, RPC, Registry, Runtime e as novas escritas formais não salvam mais seleções em string;
- `modelSelectionSchema` é o único Schema estrito do objeto estruturado. UI, Services, Provider Node e Bootstrap não duplicam parsers;
- Se um formato persistente já publicado precisar de compatibilidade, a conversão é unidirecional e fica apenas na fronteira do repository/importer correspondente; formatos não publicados dentro do branch não mantêm leitura dupla, escrita dupla nem um suposto "compat v1/v2".

O ModelFactory é a fronteira de resolução de valores padrão:

```text
产品 Draft / Config / Record
        |
        | modelSelection?：产品是否固定模型
        v
ModelSelection
|- providerId + modelId
`- options：只含显式覆盖
        |
        | + 当前 Model Config Option Spec 默认值
        v
Target Worker ModelFactory
        |
        v
Active Model.options：完整、不可变的执行事实
```

Os valores padrão resolvidos não podem ser reescrita no Composer, na Session, no App Recent ou no record do produto. Mudanças nos valores padrão da Config afetam apenas os Models novos criados depois a partir da Selection esparsa, e não alteram a quente um Active Model existente. Se uma auditoria histórica precisar provar qual option foi realmente usada, ela deve salvar os fatos de Active Model/execução, em vez de reinterpretar Selection antiga com os valores padrão novos.

### 1.5 A configuração de Subagents pertence a cada Environment; nesta rodada a UI gerencia apenas a local

Cada Environment possui e persiste sua própria configuração de Subagents de forma independente:

```text
Local Environment
|- Local user Subagent config
|- Local workspace Subagent config
`- Local built-in overrides

Remote Environment
|- Remote user Subagent config
|- Remote workspace Subagent config
`- Remote built-in overrides
```

O limite da UI de Settings nesta rodada fica fixado como:

- A configuração do Local Environment é gerenciada apenas pelo `ISubagentsService` do Local Host;
- Modelos candidatos e Option Specs são lidos apenas da Model Selection View do Local Host;
- Workspaces remotos não são listados como escopo de edição de configuração de Subagent;
- Ao ativar um Workspace remoto, o usuário não pode achar que está editando Subagents remotos; a entrada precisa manter o sentido explícito de "configuração local", ou mostrar que o gerenciamento remoto ainda não é suportado no contexto remoto;
- Subagent Markdown/state local não é gravado no Remote Environment através do Desktop;
- Na execução, o Remote Agent continua lendo a configuração de Subagents que já existe no Remote Environment e usa o Registry/ModelFactory remotos para validar e criar o child Model;
- Navegação, edição, sincronização e tratamento de conflitos de configuração remota de Subagents são uma capacidade de produto separada e posterior, e não são projetadas neste Todo.

### 1.6 Relação com os limites de validação do Todo 12

Este Todo não restaura o `IModelSelectionService.validate()` genérico:

```text
Host 用户选择面
|- getView()
`- onDidChange()
        |
        `- 同一 View 返回 visible/selectable candidates、Option Specs 与 preferredSelection

执行面
ModelSelection
    |
    v
Target Worker Registry
    |
    v
ModelFactory 最终完整校验
```

- Conversation envia a Selection estruturada ao Worker, e a falha final é reportada pelo ModelFactory;
- O Renderer pode exibir unavailable com base na Host View, mas não copia um conjunto autoritativo de validadores de option;
- Automation, Repo Wiki, Bot, Off-Peak e Subagent fazem as verificações antecipadas estreitas necessárias na fronteira de save/dispatch de cada Service de produto no Host, evitando salvar configurações obviamente inválidas ou desperdiçar recursos do produto;
- As verificações antecipadas de produto não entram no Facade público do usuário nem substituem a validação final do Worker;
- O Off-Peak oculto continua usando o Registry/scoped View interno do Host e não entra na View comum do usuário.

### 1.7 Relação com documentos de fase já existentes

Este Todo registra novas decisões confirmadas depois; os escopos de fase em documentos antigos não podem impedir o fechamento deste Todo:

- O "não alterar por enquanto a forma do banco de dados de Task" do Todo 09 restringe apenas o escopo de implementação do próprio Todo 09. Este Todo confirmou que a persistência formal de produto usa de forma unificada a `ModelSelection` estruturada, de modo que o repository/API de Off-Peak é migrado junto neste Todo e não mantém mais por muito tempo a projeção `model + thoughtLevel`;
- A descrição em `docs/subagents-built-in-model-overrides.md` de reconciliar candidatos de modelo e reasoning pelo Runtime Catalog de `workspace/readState` é um fato da implementação antiga. Na implementação deste Todo é preciso mudar para: Settings lê a Local Host View e a execução do Subagent remoto lê o Registry do próprio Remote Environment;
- O limite de validação final do Todo 12 continua válido. Este Todo apenas acrescenta o roteamento para o Host alvo e a resolução de preferred na Host View, sem restaurar o `IModelSelectionService.validate()` genérico.

Essas relações de sobreposição afetam apenas a origem da seleção de modelo, a forma de persistência e o limite de validação; elas não modificam de passagem a semântica de Ticket/agendamento do Todo 09 nem projetam o gerenciamento remoto de configuração de Subagents.

## 2. Problemas atuais

### 2.1 A View global do Base Host contamina a seleção remota

O Root conecta hoje uma única vez o `modelSelectionService`, e conversas comuns, Automation, Subagent e Repo Wiki leem o mesmo Snapshot pelo `useModelSelectionView()` global. O gate de readiness do `SessionPane` ainda está explicitamente amarrado a `baseWorkspaceServices.modelSelectionService`.

Isso produz:

```text
Desktop Base Host Registry
        |
        v
Remote Workspace picker
        |
        v
Remote Worker Registry / execution
```

Quando as duas pontas têm configurações diferentes, podem ser exibidos modelos inexistentes, omitidos modelos remotos, ou a requisição só ser rejeitada pelo Remote Worker no momento do envio.

### 2.2 App temporário é usado como projetor de modelo sem Session

`workspace/readState` cria um `ZCodeApp` temporário completo quando não há Session ativa, injeta Adapters falsos apenas de estado e então gera `model + thought + configOptions` por `mapSessionSettings()`. A primeira mensagem da conversa é apenas a entrada mais comum; a mesma cadeia é usada também pelo preview de Automation, Repo Wiki, reconciliação de Subagent, Bot, modelo de usuário do Off-Peak e sidecar de Git Commit.

A Host View já contém Model Config e Option Specs, e não deveria mais iniciar App/Session de Agent para consultar fatos estáticos de modelo.

### 2.3 Valores padrão têm owners duplicados

Existem hoje simultaneamente:

- preferências globais de modelo e thought no `localStorage` do Renderer;
- `workspaceModelPreferences.defaultModel/lastUsedModel/defaultThoughtLevel` no Agent Server;
- Default Configurado no `model-selection.json` do Environment `.zcode/v2`;
- projeção do modelo atual do App active/temporário.

Esses estados simulam, respectivamente, App Recent, Default Configurado e Session Selection, o que impede provar mecanicamente a prioridade de inicialização, o isolamento remoto e a semântica de recuperação.

### 2.4 A seleção em string e o Schema duplicado continuam se espalhando

`provider/model$reasoning` não consegue fazer round-trip de `maxOutputTokens`, e existem format/parse/Schema duplicados na UI, nos Services, no Provider Node, nos Contracts e no Bootstrap. Mesmo que hoje o envio comum já use Selection estruturada, configurações de produto, prévias e mutations de compatibilidade ainda desmontam a Selection completa e depois a reestimam.

### 2.5 Effective Option é reescrito como Selection explícita

O ModelFactory atual já consegue usar os valores padrão do Model Config quando a Selection não fornece uma option, mas algumas cadeias de recuperação e troca primeiro resolvem a Effective Option e depois escrevem o resultado de volta na Selection. Por exemplo, o restore de Session materializa o `maxOutputTokens` ausente dentro da Selection, fazendo "seguir o padrão" virar silenciosamente "fixar o valor antigo".

```text
错误

Sparse Selection
    |
    | + Model Config Default
    v
Effective Option
    |
    `--------------------> 反写 Selection

正确

Sparse Selection --------------------------> 原样保持
    |
    | + Model Config Default
    v
Active Model.options ----------------------> 本次执行完整事实
```

O mesmo risco precisa ser verificado em Session restore, Model switch, dispatch de Automation/Off-Peak, Compact/Memory/Subagent, argumentos de CLI, round-trip de RPC e persistência de Draft. A UI exibir o valor padrão atual não equivale a uma seleção explícita do usuário; apenas ações reais de edição produzem um override de option.

### 2.6 O mesmo tipo não equivale ao mesmo owner de produto

Unificar `ModelSelection` unifica apenas "como referenciar um Model futuro"; não permite transformar os estados de cada produto em um Selection Store compartilhado:

| Estado de produto   | Significado de `modelSelection` ausente                          | Momento de resolução / owner                     |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------ |
| Composer / Draft   | obtém valor inicial pela prioridade de inicialização            | Renderer Draft                                   |
| Session            | pode faltar antes da primeira execução de nova Session; após executar, precisa salvar a Selection aceita | Session Store/Core             |
| Automation         | no formulário de criação resolve o preferred do Host alvo e fixa uma Selection concreta | registro/service de Automation   |
| Repo Wiki          | quando não especificado usa o preferido do Workspace alvo       | fronteira de envio de cada generation            |
| Bot                | quando não especificado usa as regras padrão de produto do Workspace correspondente ao contexto do Bot | config/task submission do Bot |
| Subagent override  | herda o Parent Active Model e não consulta o default do Workspace | fronteira de execução parent/child               |
| Off-Peak           | forma sua própria Selection precisa de provider/model na criação da tarefa | registro/dispatcher do Off-Peak   |

A ausência completa de `modelSelection` e a ausência de `modelSelection.options` são dois estados diferentes: o primeiro significa que o produto não fixou um modelo, e o segundo significa que a identidade do modelo está fixada mas as options seguem os valores padrão do Model Config. A implementação não pode confundir os dois com uma mesma string vazia, um pseudo ID `inherit` ou um helper de fallback global.

A UI de Automation não mantém estados virtuais de "seguir o Workspace" ou "modelo padrão". O formulário de criação, os registros antigos sem Selection e a troca de Workspace alvo inicializam provider/model concreto usando o `preferredSelection` do Host alvo e resolvem o reasoning concreto a partir das Option Specs do modelo alvo; ao salvar, sempre grava uma `modelSelection` completa. Mudanças posteriores no preferred do Workspace não afetam a Automation já salva.

## 3. Impact Brief

### 3.1 Resumo do Recurso

| Campo             | Conclusão                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | a seleção de modelo lê o Host alvo, unifica a intenção esparsa e estruturada, e remove os candidatos globais do Base Host, o catálogo do App temporário e o desvio da seleção em string |
| Capability       | Model Selection, Provider Registry, Environment, Conversation, Automation, Repo Wiki, Bot, Off-Peak, Subagent        |
| Camada de mudança | `option-source`, `draft-default`, `validation`, `persistence`, `recovery`                                           |
| Modo de operação | planning / implementation-handoff                                                                                   |
| Seeds principais | `IModelSelectionService`, `useModelSelectionView`, `workspace/readState`, `ModelConfigSelect`                        |
| Fora de escopo   | Provider Provisioning, Access/Auth, codificação de requisição de modelo, máquina de estados de Queue/Goal, gerenciamento remoto de configuração de Subagents |

### 3.2 Matriz de Superfície de UI

| Cenário do usuário            | Origem de candidatos/padrão            | Owner do draft           | Sink do commit                   | Autoridade final                      | Resultado deste Todo                       |
| ----------------------------- | -------------------------------------- | ------------------------ | -------------------------------- | ------------------------------------- | ------------------------------------------ |
| Conversation local            | Local Host View/preferred              | Composer Draft          | Submission command               | Local Worker Registry/ModelFactory     | remoção do catálogo do App temporário       |
| Conversation remoto           | Remote Host View/preferred             | Composer Draft          | Remote Submission command        | Remote Worker Registry/ModelFactory    | proibido fallback local                    |
| Automation                    | Host alvo do Workspace escolhido       | Automation form         | Automation Service/record         | ModelFactory do Environment de execução | persistência estruturada; cancelar não muda a Conversation |
| Repo Wiki                     | Host alvo do projeto atual             | generation settings     | Repo Wiki Service                | ModelFactory do Environment alvo       | remoção do preview de Session diferido     |
| Bot                           | Host alvo do contexto do Bot           | Bot command draft       | Bot config/Task submission       | ModelFactory do Environment alvo       | remoção da projeção de modelo do workspace state |
| Off-Peak                      | Local Host scoped hidden View          | Off-Peak form           | Off-Peak Service/record          | Local Worker ModelFactory              | mantém o limite de produto local; persistência estruturada |
| Subagent Settings             | Local Host View                        | Subagent form           | Local `ISubagentsService`        | Config do Local Environment            | não gerencia Remote config                 |
| Execução remota de Subagent   | sem UI nesta rodada                    | Remote profile/config   | Agent tool                       | Remote Worker ModelFactory             | lê a configuração própria do remote         |
| Git Commit sidecar            | seleção inicial/explícita do Host alvo | requisição única        | text generation service          | ModelFactory do Environment alvo       | deixa de ler o App temporário               |

### 3.3 Owners de Estado e Sinks de Commit

| Estado/fato               | Owner autoritativo                        | Espelho/cache                                      | Evento de escrita                                  |
| ------------------------- | ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Model Selection View      | Provider Registry Facade do Host alvo      | Snapshot de UI em cache por instância de serviço de Host | Mudança de revision do Registry              |
| Composer Draft            | Entry/Renderer                            | Persistência de Draft                              | Edição do usuário                                   |
| App Recent                | App x workspaceKey                        | memória/persistência local do Renderer             | App aceita um Submission normal                    |
| Configured Default        | repositório do Workspace alvo              | Host View resolve preferredSelection              | escrita de configuração independente              |
| Session Selection         | Session Store/Core                        | projeção de UI                                     | Submission inicia o Loop / Guide aceita            |
| Active Model              | Agent Loop                                | sem persistência                                   | criação pelo ModelFactory                          |
| Seleção de produto        | Service/Repo de cada produto              | draft de cada formulário                           | salvamento do usuário ou criação pelo produto      |
| Subagent Config           | repositório de Subagents de cada Environment | Settings nesta rodada vêem apenas o Local        | salvamento pela UI local ou escrita pelo próprio Environment |

### 3.4 Relações entre Features

| Nível           | Relação                                                  | Requisito                                                    |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| must-inspect   | Workspace target -> resolução de serviço do Host        | roteamento preciso local/remote e sem fallback em desconexão |
| must-inspect   | Host View -> Conversation/Automation/Repo Wiki/Bot      | candidatos e Option Specs deixam de ler o App temporário      |
| must-inspect   | App Recent -> workspaceKey                               | isolamento por identity remota, sem mistura por path ou sessão |
| must-inspect   | Persistência de produto -> ModelSelection Schema         | novas escritas guardam apenas options explícitas, sem concatenação de strings |
| must-inspect   | Selection -> defaults do ModelFactory                    | valores padrão entram apenas no Active Model e não são reescritos na Selection |
| must-inspect   | Subagent UI -> Local Host                                | a UI não lê nem sobrescreve a config do Remote Environment   |
| must-inspect   | Submission -> Worker ModelFactory                        | a seleção do Host não substitui a validação final           |
| should-inspect | Configured Default -> resolver do Host                   | default inválido entra em fallback sem sobrescrever o arquivo |
| invariant-only | Queue/Guide/Edit/Retry                                   | mantém a Selection estruturada atual e a ordem de admission |
| invariant-only | desktop continuous/mobile replayable                     | sem novo owner de runtime, queue ou recuperação             |
| invariant-only | Provider Provisioning                                    | sem sincronização de config/credenciais via roteamento de seleção |

### 3.5 Graph Drift

O Feature Graph atual ainda conecta algumas arestas de candidatos de modelo ao antigo `useModelProviders`/metadata global do app e descreve o reasoning de Subagents de Workspace como Runtime Catalog de `workspace/readState`. A semântica confirmada deste Todo é: candidatos comuns de produto vêm do Host alvo e Subagent Settings vêm apenas do Local Host. Na implementação, atualize esses code seeds e as condições antigas, sem disfrazar símbolos ainda não implementados como fatos do código atual.

## 4. Contrato alvo do Host

### 4.1 View do usuário

`ModelSelectionView` oferece no mínimo:

```ts
interface ModelSelectionView {
  revision: number;
  providers: readonly ModelSelectionProviderView[];
  preferredSelection?: ModelSelection;
}
```

A Model Config completa na Model View já contém `properties` e `optionSpecs`. A UI lê esses fatos diretamente para exibir os formatos de entrada e as opções de reasoning e max output, sem criar Session para obter o mesmo fato. O `preferredSelection` precisa pertencer a uma View visible, enabled e selectable da mesma revision; em uma View vazia, ele pode faltar.

### 4.2 Resolução da seleção inicial

O Host Service não ganha um segundo RPC de resolução:

```ts
interface IModelSelectionService {
  readonly onDidChange: Event<ModelSelectionView>;
  getView(): Promise<ModelSelectionView>;
}
```

O Host resolve atomicamente o Default Configurado e o fallback ao construir a View, obtendo o `preferredSelection`. O workspace App Recent que o Entry mantém por conta própria não é enviado ao Host: o Renderer apenas verifica se ele ainda pertence à View atual; se for válido, tem prioridade, e se for inválido ou inexistente, adota-se `view.preferredSelection`. Esse casamento de candidatos serve apenas à exibição inicial, não resolve uma Selection de execução precisa e oculta, nem se torna um validator substituto do ModelFactory.

### 4.3 Hook de UI em escopo de target

A entrada de UI alvo resolve uniformemente o Service pelo target do workspace:

```text
workspacePath + workspaceIdentity + remoteSessionId + remoteTarget
        |
        v
useWorkspaceServicesResolution
        |
        +-- local-ready  -> Local Host IModelSelectionService
        +-- remote-ready -> Remote Host IModelSelectionService
        `-- remote-waiting/disconnected -> unavailable（不回退）
```

Snapshot/cache são isolados por instância de serviço de target e por `workspaceKey`. Na troca de target, a assinatura antiga é cancelada e Views atrasadas são descartadas; Hosts diferentes não podem sobrescrever um ao outro mesmo que o número de revision seja o mesmo.

## 5. Escopo de remoção e modificação

### 5.1 UI e Services

- Remover o singleton do Root `modelSelectionSnapshot` e o `useRootModelSelectionSnapshot`;
- Mudar o `useModelSelectionView()` sem target para uma leitura em escopo de target;
- O gate de readiness do `SessionPane` usa o Host alvo do pane atual, e não `baseWorkspaceServices`;
- O value interno do `ModelConfigSelect` é separado da `ModelSelection` de negócio, e o chamador não repete o decode;
- O Automation troca atomicamente a Host View ao trocar de Workspace no formulário, e resultados atrasados não podem escrever no novo target;
- O Repo Wiki usa a Host View do projeto atual; remover o preview diferido de reasoning de uma Session de draft;
- O Bot usa o Host alvo do contexto do Bot; quando falta conexão remota, é fail-closed;
- O sidecar de Git Command recebe a seleção do Host alvo inicial/explícita e não lê a projeção de App do workspace;
- O Subagent Settings injeta de forma fixa o Local Host Model Selection/Subagents Service e remove o escopo remoto.

### 5.2 Agent Protocol e App temporário

- `workspace/readState` deixa de retornar ou assumir Model Selection/Model Option Specs;
- Remover `workspaceModelPreferences.defaultModel/lastUsedModel/defaultThoughtLevel`;
- Remover `workspace/setDefaultModel`, `workspace/setDefaultThoughtLevel` e seus RPCs, adapters, mocks e testes;
- Manter as necessidades não relacionadas a modelo, como mode/slash commands, mas lendo-as por sua própria interface mínima;
- Remover `createWorkspaceStateOnlyModelAdapter()` e o caminho que cria um `ZCodeApp` temporário apenas para ler estado, depois que não houver outros consumidores;
- A projeção ativa de Session continua reportando a Selection real desta Session e deixa de atuar como catálogo de defaults do Workspace.

### 5.3 Persistência estruturada

- O App Recent usa `workspaceKey -> ModelSelection`;
- Shared types, strict schema, RPC e repository de Automation, Repo Wiki, Bot, Off-Peak e Subagent usam `ModelSelection`;
- O repository formal guarda apenas options explícitas; `options` vazio e folhas vazias depois da remoção precisam ser normalizados;
- Remover qualquer helper de recuperação, preview ou salvamento que reescreva na Selection os valores padrão resolvidos pelo ModelFactory/Option Spec;
- O frontmatter do Markdown de Custom Subagent e o estado de override Built-in usam um único campo de Selection estruturada, removendo o par de maps model/thought;
- O armazenamento antigo já publicado é convertido apenas na fronteira de leitura do repository/importer, e a escrita produz somente a estrutura nova;
- `formatModelSelection()` mantém apenas as variantes explícitas necessárias nas fronteiras CLI/picker/legacy; um barrel de negócio não pode continuar inducindo round-trip em código normal;
- Remover `modelSelectionSchema`, `parseModelSelectionValue` duplicados e parsers locais da camada de negócio.

### 5.4 Preservado explicitamente

- A cadeia principal de execução de Provider Registry, ModelFactory, Active Model e Adapter;
- O intent estruturado atual de Session Submission, Queue, Guide, Edit e Retry;
- A View com escopo e as verificações antecipadas estreitas antes do dispatch do hidden Off-Peak Provider;
- Os momentos de escrita distintos de App Recent, Configured Default, Session Selection e Active Model;
- A Entry in-process de Prompt CLI/TUI, sem obrigá-la a iniciar Host RPC.

## 6. Ordem de implementação

### Step A: sincronizar primeiro o Design formal, o Feature Graph e os testes de falha

1. Atualizar `selection-state.md`, `environment.md`, `interaction.md` e as specs relacionadas de Subagent/Automation/Repo Wiki;
2. Executar o Todo 12 ou coordenar-se com ele de forma atômica, garantindo primeiro que nenhum Facade `validate()` genérico seja reintroduzido;
3. Atualizar no Feature Graph as relações de Host alvo, workspaceKey, gerenciamento de Subagent local-only e persistência de produto;
4. Escrever primeiro os testes de falha de preferred da Host View, roteamento de target remoto, isolamento de App Recent, option esparsa e repository estruturado.

### Step B: Selection preferida na Host View

1. Injetar o repositório de Default Configurado no Host Model Selection Service;
2. Retornar atomicamente candidatos, Option Specs e `preferredSelection` na `ModelSelectionView` da mesma revision;
3. O Renderer lê o App Recent por `workspaceKey` e, após casá-lo na View atual, decide se cobre o preferred do Host;
4. Prompt CLI/TUI reutilizam o mesmo pure domain preferred resolver;
5. Validar hidden/disabled, options inválidas, View vazia e mudanças de revision do Registry;
6. Provar mecanicamente que não foi adicionado `environmentId` nem um RPC independente `resolveInitialSelection()`.

### Step C: infraestrutura de View em escopo de target

1. Implementar o hook/store que assina pelos Services alvo;
2. Conectar ao Local Host em caso local e ao Remote Host em caso remoto;
3. Limpar o Snapshot antigo ao trocar de Environment e descartar eventos atrasados por connection generation;
4. remote-waiting/disconnected sem fallback;
5. Remover o Snapshot global do Root.

### Step D: Conversation e App Recent

1. Composer, Toolbar e gate de readiness passam para o Host alvo;
2. A inicialização do Draft usa o Recent com escopo de workspace e o `preferredSelection` da Host View;
3. Após o App aceitar um Submission normal, gravar a Selection estruturada e esparsa;
4. Quando uma atualização do Registry invalida o Draft, preservá-lo e exibir unavailable;
5. Validar que a primeira mensagem e as seguintes usam a mesma combinação de Host/Worker alvo.

### Step E: semântica de option esparsa da Selection

1. Escrever primeiro, para Schema/repository, os testes de folha ausente, options parciais, normalização de objeto vazio e remoção por patch `null`;
2. Provar que o ModelFactory usa o valor padrão atual do Model Config para cada folha ausente e congela as options completas no Active Model;
3. Remover de Session restore e Model switch a lógica que reescreve a Effective Option na Selection;
4. A UI separa "mostrar o valor padrão" de "valor selecionado explicitamente": escolher "padrão" remove a folha, e uma escolha explícita igual ao padrão continua sendo salva;
5. Não herdar cegamente as options do modelo de origem ao trocar provider/model; o novo modelo recebe apenas os valores que o usuário confirmou explicitamente para ele e que passaram pelas Option Specs;
6. Quando o histórico de execução precisar da option real, ler/salvar os fatos do Active Model em vez de materializar valores padrão na Selection.

### Step F: Automation, Repo Wiki, Bot, Off-Peak e sidecar

1. Trocar a Host View conforme o target de cada um;
2. Ler as options de reasoning/output direto da Model Config da View;
3. Remover o preview de Session diferido de Automation/Repo Wiki;
4. Migrar os Services/Repos de produto para Selection estruturada;
5. O formulário de Automation resolve o preferred do Host alvo em uma Selection concreta; sem preferred, fica explicitamente não submissível, sem introduzir `inherit`, string vazia ou pseudo ID de "modelo padrão";
6. Manter inalterados os owners de Draft, cancelamento, salvamento, agendamento e execução de cada produto.

### Step G: limite de configuração local de Subagent

1. Settings injeta apenas o Local Host Model Selection e o Subagents Service;
2. Excluir o Workspace remoto da lista de escopos e acrescentar a exibição de configuração local / remoto ainda não suportado;
3. Persistir de forma estruturada as configurações local user/workspace/built-in;
4. O runtime remoto continua lendo a configuração que já existe no remote, sem nova sincronização pelo Desktop;
5. Remover a reconciliação de catalog de Subagent via `workspace/readState`.

### Step H: zerar a cadeia de preparo antiga e as strings

1. Remover os defaults de model/thought do workspace e os RPCs relacionados;
2. Tirar mode e slash commands de `workspace/readState` para uma interface mínima não relacionada a modelo;
3. Remover o App temporário / Adapter state-only;
4. Remover a dependência de catálogo de Model/Thought em `configOptions`;
5. Remover Schema/parser/format helper duplicados;
6. Confirmar com `rg`, `dep:refs`, Knip e TypeScript que não há resíduo em produção.

### Step I: validação, reescrita e commit

1. Executar os testes unitários afetados de Provider, Services, Shared, UI, Bootstrap, Desktop e Web;
2. Executar E2E representativos de local/remoto, mesmo path com workspaceIdentity diferente, reconexão, primeiro envio/envios seguintes e formulários de produto;
3. Executar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e `pnpm knip`;
4. Reescrever neste Todo o status, o resultado da implementação, a lista de remoções e os riscos não cobertos;
5. Submeter com um Conventional Commit.

## 7. Casos aceitos e podas

| Case ID | Setup                                                              | Ação                          | Asserções                                                                    |
| ------- | ------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------- |
| HMS-01  | Workspace local, Local Host com o modelo A                          | abrir novo Draft              | candidatos e Selection inicial vêm do Local Host                            |
| HMS-02  | Remote Host só tem o modelo B, Local Host só tem A                 | abrir Draft remoto            | só B é exibido; A não é exibido nem usado como fallback                      |
| HMS-03  | Remote Host em waiting/disconnected                                | abrir menu de modelos/enviar  | loading/unavailable; o Local Host não é chamado                             |
| HMS-04  | dois Workspaces remotos com o mesmo path e workspaceIdentity diferentes | aceitar Submissions respectivamente | App Recent isolado por workspaceKey                                    |
| HMS-05  | App Recent inválido na View do Host alvo e preferred válido         | criar novo Draft               | adota o preferred do Host, sem sobrescrever Recent/Default                    |
| HMS-06  | Recent inválido e Host View sem preferred                            | criar novo Draft               | permanece unavailable; o Renderer não escolhe o primeiro item sozinho         |
| HMS-07  | Registry remove o modelo atual depois da criação do Draft           | continuar editando             | mantém a Selection original e exibe unavailable, sem trocar de item em silêncio |
| HMS-08  | Session Selection existente fica inválida                           | retomar/próxima execução      | mantém a intenção da Session; o ModelFactory falha explicitamente e não lê Default |
| HMS-09  | Queue/Guide/Edit/Retry carregam algumas options explícitas          | admission/execução            | a Selection não perde folhas explícitas nem preenche folhas ausentes        |
| HMS-10  | Automation alterna entre projeto local e remoto                     | trocar target, escolher modelo, cancelar/salvar | a View troca com o Host; cancelar não muda a Conversation; salvar Selection estruturada |
| HMS-11  | Repo Wiki escolhe um modelo com reasoning                           | abrir/gerar                   | Option Specs vêm do Host alvo; nenhuma Session de preview é criada          |
| HMS-12  | Settings abre Subagent no contexto de um Workspace remoto          | ver/editar entrada             | expressa apenas configuração local ou remoto não suportado; não lê nem grava Remote config |
| HMS-13  | Remote Agent já tem sua própria Subagent config                     | disparar child                | lê a Remote config e o Remote ModelFactory cria o Model                      |
| HMS-14  | armazenamento de produto antigo contém model + thought              | ler do repository e salvar     | converte unilateralmente para ModelSelection; a nova escrita não separa mais campos |
| HMS-15  | Desktop continuous e Mobile replayable controlam a mesma tarefa remota | selecionar e enviar          | usa o mesmo Remote Host; não altera owner de queue/snapshot/replay           |
| HMS-16  | Selection fixa só provider/model e o Model Config tem option padrão | criar Model                    | o Active Model recebe os defaults completos; a Selection segue sem options  |
| HMS-17  | o usuário seleciona explicitamente um reasoning igual ao default atual | salvar e recarregar          | a folha explícita é mantida; mudanças futuras de default não alteram esse pin |
| HMS-18  | patch remove a última option explícita                              | salvar e recarregar           | não persiste `null` nem `options: {}`                                       |
| HMS-19  | Session restore encontra maxOutputTokens ausente                     | retomar e criar Model          | o default entra apenas no Active Model e não é reescrito na Session Selection |
| HMS-20  | troca do modelo A para o modelo B com Option Specs diferentes       | selecionar B                  | não herda a option de A; salva apenas a escolha explícita para B             |
| HMS-21  | novo formulário de Automation com preferredSelection no Host alvo   | salvar sem escolher modelo     | salva provider/model/reasoning concretos; o botão fica submissível           |
| HMS-22  | Automation já salvou um modelSelection concreto                     | mudar o preferred do Host e despachar | continua usando a Selection salva, sem derivar do preferred do Workspace |

Podas explícitas:

- Não expandir as combinações de tipos de API de Provider; este Todo não muda a codificação do Adapter;
- Não implementar CRUD, sincronização ou tratamento de conflitos de Remote Subagent Settings;
- Não fundir a hidden View do Off-Peak na View comum;
- Não mudar Queue, Goal, Compact, Background, permissões ou a máquina de estados de recuperação;
- Não iniciar processos de Host extras para Prompt CLI/TUI;
- Não estabelecer uma matriz de compatibilidade de versões para formatos ainda não publicados dentro do branch.

## 8. Plano de testes

### 8.1 Unit / Service

- fallback de workspaceKey e isolamento de mesmo path com identity remota diferente;
- prioridade preferred/default/fallback/unavailable dentro da mesma Host View e consistência de revision;
- visible/hidden, enabled/disabled, options inválidas e mudanças de revision;
- roteamento de target services local/remote/remote-waiting;
- assinatura antiga atrasada, mesma revision entre Hosts e troca rápida de target;
- round-trip estruturado do App Recent e workspaceKey;
- options parciais da Selection, normalização de objeto vazio, remoção por patch `null` e pin explícito de valor padrão;
- resolução de option ausente pelo ModelFactory, congelamento do Active Model e restore/switch sem reescrever a Selection;
- round-trip estruturado dos repositories de Automation/Repo Wiki/Bot/Off-Peak/Subagent;
- inicialização por preferred da Automation, salvamento de Selection concreta, exibição e consistência no dispatch;
- conversão somente de leitura do legacy importer e ausência de seleção em string nas novas escritas;
- escopo Local-only do Subagent Settings.

### 8.2 Integration / E2E

- candidatos diferentes e primeira requisição real entre Local Host A e Remote Host B;
- manutenção de workspaceIdentity, Recent, View e Selection após reconexão remota;
- Workspaces com workspaceKeys diferentes não compartilhando Recent;
- primeira mensagem e mensagens seguintes de uma Session existente ambas criando Model pelo Worker alvo;
- Automation, Repo Wiki, Bot e Git Commit usando o Environment alvo da requisição;
- CRUD local de Subagent isolado da configuração própria do runtime remoto;
- caminhos representativos de Desktop continuous e Web/Mobile replayable.

### 8.3 Portões mecânicos

Após a implementação, os conceitos de produção abaixo precisam zerar ou restar apenas como limites de compatibilidade explícitos:

```text
modelSelectionSnapshot
useRootModelSelectionSnapshot
GLOBAL_AGENT_MODEL_STORAGE_SCOPE
workspaceModelPreferences.defaultModel
workspaceModelPreferences.lastUsedModel
workspaceModelPreferences.defaultThoughtLevel
workspace/setDefaultModel
workspace/setDefaultThoughtLevel
createWorkspaceStateOnlyModelAdapter
previewAutomationThoughtLevelOption
prepareRepoWikiThoughtCatalog
useSubagentWorkspaceCatalogReconciliation
```

`formatModelSelection`, `parseModelSelection` e `model` + `thoughtLevel` não podem simplesmente ser zerados globalmente por nome; argumentos de CLI, importers históricos e campos de negócio não relacionados a modelo podem existir legitimamente. É preciso confirmar consumidor por consumidor se ele expressa uma seleção de Model futuro, e só a seleção formal deve ser migrada à força.

## 9. Definição de conclusão

1. Todos os candidatos de modelo comuns e as Option Specs vêm do Host alvo;
2. A UI, os valores padrão e as entradas de produto de um Remote Workspace deixam de ler o Registry do Local/Base Host;
3. O App Recent é isolado por `workspaceKey` e guarda Selection estruturada esparsa, sem adicionar `environmentId`;
4. O Default Configurado e o fallback são resolvidos pelo Host alvo e devolvem `preferredSelection` na mesma View, sem um segundo RPC de resolução; Prompt CLI/TUI reutilizam a mesma resolução de domínio puro;
5. A seleção formal de Conversation, Automation, Repo Wiki, Bot, Off-Peak e Subagent usa `ModelSelection` estruturada e persiste apenas options explícitas;
6. A configuração de Subagents é persistida de forma independente por Environment, e nesta rodada o Settings gerencia apenas o Local Environment;
7. `workspace/readState`, o App temporário e `configOptions` deixam de servir como catálogo de modelos, fonte de capacidade de modelo ou de defaults de modelo;
8. O limite de validação final do ModelFactory do Todo 12 continua valendo, sem restaurar um validator genérico no Facade do usuário;
9. não há fallback local nem mistura de identidade nos caches local/remoto, de reconexão e entre workspaceKeys;
10. Desktop continuous, Mobile replayable, Queue, Goal, recuperação de Session e Provider Provisioning permanecem inalterados;
11. Design, Feature Graph, testes, log de implementação e auditoria de remoções já foram reescritos;
12. `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e os testes relevantes passam, e o Conventional Commit foi concluído.

## 10. Não objetivos

- Não implementar Provisioning remoto de Provider/credenciais;
- Não implementar UI, sincronização ou merge de conflitos de configuração remota de Subagent;
- Não mudar Account Access, Request Auth ou a autorização final do servidor;
- Não mudar a codificação de requisição do Adapter, Retry, Stream Recovery ou Telemetry;
- Não mudar a semântica de Model Properties, composição de Provider nem enabled/visibility;
- Não gravar Host View, workspaceKey ou remoteSessionId na Session Selection;
- Não criar um novo Model Catalog, DTO de capability de runtime, Execution Registry ou ModelIdentity.

## 11. Resultado da implementação

Este Todo foi concluído conforme as decisões finais, e o complemento de duas fases Select/Submission do documento de decisões também foi absorvido pela implementação:

- `ModelSelectionView` é fornecida pelo Local/Remote Host alvo com candidatos, Option Specs e `preferredSelection`; um remote unavailable não faz fallback para o Local Host;
- Conversation resolve a Host View alvo apenas uma vez no `SessionPane`, e Composer, exibição de linhas e envio compartilham esse fato; o App Recent guarda a Selection esparsa por `workspaceKey` e só é atualizado depois que um Submission normal do usuário é aceito;
- A apresentação de Workspace mantém apenas mode e slash commands, removendo a preparação temporária de modelo de Session/App, a reconciliação de Runtime Catalog e a segunda derivação de defaults do lado do Renderer;
- A configuração formal, o protocolo e os repositories de Automation, Repo Wiki, Bot, Off-Peak e Subagent migraram para `ModelSelection` estruturada. Strings antigas são lidas apenas de forma unilateral nos importers dos respectivos formatos persistentes já publicados;
- O registro de Automation continua sendo um Select que pode não ter modelo; cada row de `automation_runs` fixa atomicamente a Selection do Submission no primeiro dispatch, e uma nova tentativa de agendamento apenas lê esse valor de volta, sem ler de novo o preferred do Host;
- O Subagent Settings conecta apenas ao Local Host; um Child Submission sem override herda o Parent Active Model, e um override explícito cria e congela seu próprio Model pelo Worker ModelFactory;
- `modelSelectionSchema` é definido apenas em Shared; Provider Node, Contracts, Protocol e schemas de produto o reutilizam;
- Editar o mesmo modelo preserva folhas de option já salvas explicitamente mesmo sem serem exibidas; trocar de modelo reconstrói a Selection sem herdar as options antigas;
- O limite do Todo 12 permanece: o Facade do usuário não assume validação de execução genérica, e o Target Worker Registry/ModelFactory continua fail-closed no final.

As entradas de produção antigas removidas incluem o Snapshot global do Root, as preferências de modelo do Workspace, o Global Seed de Draft, o Runtime Thought Catalog do Repo Wiki, a reconciliação de Workspace Catalog do Subagent e os helpers, testes e exports correspondentes. O Feature Graph e o Design formal foram sincronizados para o Host alvo, o workspaceKey, a Selection esparsa e o owner Select/Submission.

As evidências de validação incluem os testes de Host alvo, App Recent, retry de Automation, repositories de produto, herança e override explícito de Subagent em Provider/Services/UI/Desktop, bem como os testes de parsing estruturado e execução de CLI Contracts/Bootstrap/Core; o resultado final dos portões está registrado no commit deste Todo.