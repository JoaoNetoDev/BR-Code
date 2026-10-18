# 09 Aposentadoria da projeção legada de seleção de modelo do Off-Peak

> As execuções pendentes e a localização de falhas do E2E gráfico do Desktop para tarefas off-peak são consolidadas de forma unificada pela Todo 78; esta Todo não é mais agendada separadamente.

> Status: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../research/model-abstraction-unification-cleanup-audit.md`](../research/model-abstraction-unification-cleanup-audit.md)
>
> Roadmap geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)

## 1. Objetivo da tarefa

Remover do Off-Peak a cadeia de transição que projeta de volta o novo Provider Registry / Effective Model Config para o antigo `ModelProviderModelConfig`. Os candidatos de modelo do Off-Peak, o Reasoning Option Spec, a validação de submissão e a validação de despacho consomem uniformemente o mesmo fato de modelo do Registry; a execução real continua submetendo um `ModelSelection` padrão, e o Registry / ModelFactory comuns criam o Active Model.

Esta Todo apenas consolida o fato de seleção de modelo e a fronteira de validação, sem reprojetar o produto Off-Peak:

- o remoto `client/configs.offPeak.enable_offpeak_task` continua responsável apenas pela exposição da entrada;
- Account / Coding Plan continuam responsáveis por suporte de conta, admissão de Ticket e autenticação no momento da requisição;
- o Provider Built-in oculto `builtin:offpeak-idle-plan` continua responsável pelos membros de modelo e pelo Model Config completo;
- a Off-Peak Task continua tendo seus próprios rascunhos de formulário, registros de tarefa e estado de agendamento;
- o turno idle automático continua usando o `ModelSelection` padrão com escopo de execução, sem modificar a Session Selection.

```text
当前

Built-in Provider / Model Config
              |
              v
Effective Provider Resolution
              |
              v
buildOffPeakBuiltInModels()
              |
              +--> allowedModels: string[]
              `--> allowedModelConfigs: ModelProviderModelConfig[]
                            |
                            +--> UI 手工构造候选和 Reasoning 控件
                            `--> Host 从 allowedModels[0] 取默认模型

目标

完整 Provider Registry
              |
              | 固定 OFF_PEAK_PROVIDER_ID 精确读取
              v
Scoped ModelSelectionView
|- revision
`- builtin:offpeak-idle-plan
   `- models[]
      |- modelId
      `- Registry Model Config
         |- properties
         `- optionSpecs.reasoningLevel
              |
              +--> Off-Peak UI 草稿
              +--> 创建 / 编辑校验
              +--> Host 默认选择
              `--> 派发前校验 -> ModelSelection -> ModelFactory
```

## 2. Fronteiras de arquitetura confirmadas

### 2.1 Provider oculto não entra na View comum de seleção de modelo

O `ModelSelectionFacade.getView()` comum continua filtrando Providers com `visibility: "hidden"`. Essa é a fronteira correta da tela de seleção do usuário comum e não pode ser afrouxada por causa do Off-Peak.

O serviço de produto Off-Peak só pode ler com precisão o Provider alvo do Registry completo pelo `OFF_PEAK_PROVIDER_ID` fixo e usar a mesma lógica de projeção da Model Selection comum para gerar a View scoped. São proibidas as seguintes entradas:

- o seletor de modelos comum incluir Providers ocultos;
- o Renderer consultar um Provider oculto por qualquer ID de Provider;
- parâmetros genéricos de escape como `includeHidden`, `trusted`, `executionOnly`;
- DTO de Model Config completo exclusivo do Off-Peak.

O objetivo pode devolver o `ModelSelectionView` existente, contendo no máximo um Provider `builtin:offpeak-idle-plan`; também pode devolver diretamente o `ModelSelectionProviderView` existente na interface do serviço. Qualquer que seja o invólucro físico escolhido, a estrutura interna de Provider e Model precisa reutilizar os tipos formais de Selection View e o mesmo projector, sem copiar definições de campos.

### 2.2 Manter separados os quatro tipos de fato

| Fato                                              | Fonte autoritativa                                                             | Comportamento desta Todo                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Exposição da entrada Off-Peak                     | `client/configs.offPeak.enable_offpeak_task`                                     | Mantida; forma em conjunto com candidatos não vazios do Registry o gateamento da entrada de criação |
| Membros de modelo e Model Config                  | Registry completo resolvido de Built-in / Account / Personal                     | Fonte unificada de candidatos, Reasoning, modelo padrão e validação   |
| Suporte da conta, Ticket e autenticação de requisição | Account Access atual, API de availability/ticket do Off-Peak, Request Auth    | Não migrado para Model Config e não alterado                         |
| Rascunho de tarefa, seleção e estado de agendamento | Rascunho do Renderer, Off-Peak Task Service/Repo, Scheduler                      | Continua pertencendo ao próprio produto e não escreve Session Selection |

O `allowedModelIds` dinâmico do Account Provider não participa da lista de modelos off-peak. Os membros de modelo atuais do Off-Peak são membros de nível de produto do Provider Built-in oculto; o Coding Plan Account apenas decide a admissão da conta e a autenticação da requisição.

### 2.3 Remover a projeção reversa legada

Remover as seguintes pontes de fato de modelo:

- `OffPeakBuiltInModels.allowedModels`;
- `OffPeakBuiltInModels.allowedModelConfigs`;
- `OffPeakClientConfig.allowedModels`;
- `OffPeakClientConfig.allowedModelConfigs`;
- `buildOffPeakBuiltInModels()` e suas responsabilidades antigas de construção de DTO;
- `createOffPeakModelConfig()`;
- `createLegacyReasoningSpec()`;
- as dependências do Off-Peak em `ModelProviderModelConfig`, `ModelProviderModality` e `ModelProviderReasoningSpec`.

Não se pode manter alias deprecated, escrita dupla ou um "DTO de período de migração". A configuração de Provider Refactor do branch atual ainda não foi publicada como protocolo de compatibilidade independente, e esta Todo não projeta compatibilidade entre uma suposta versão nova e uma antiga.

### 2.4 Product View apenas compõe fatos e não reinterpreta fatos

O `OffPeakClientConfig` existente guarda ao mesmo tempo o switch remoto e o DTO de modelo legado, e o nome e as responsabilidades já não são precisos. O valor de retorno do serviço alvo deve ser consolidado em uma View de produto somente leitura, algo como `OffPeakClientView`:

```ts
interface OffPeakClientView {
  readonly enabled: boolean;
  readonly modelSelectionView: ModelSelectionView;
  readonly codingPlanActive?: boolean;
}
```

O critério alvo de `enabled` continua sendo:

```text
产品开关命中
AND scoped Registry 中至少存在一个可创建的模型候选
```

`modelSelectionView` é a projeção de escopo de produto da Registry View e não uma nova fonte de Config ou de fato de modelo. A nomenclatura física final pode ser ajustada na implementação conforme a organização atual de tipos de Service, mas não se pode redefinir campos de modelo.

## 3. UI, rascunho e persistência

### 3.1 A UI lê diretamente os candidatos padrão

`OffPeakEditView` gera candidatos de modelo achatados diretamente a partir do `ModelSelectionView` scoped:

- o ID do modelo vem de `provider.models[].modelId`;
- os níveis de Reasoning e o valor padrão vêm de `model.config.optionSpecs.reasoningLevel`;
- o controle de Reasoning reutiliza o helper existente de Registry Model Thought Option;
- não lê `reasoningMapping`; os parâmetros de requisição do Provider continuam sendo consumidos apenas em sentido direto pelo ModelFactory / Adapter;
- não copia Context, Input/Output Format, capacidade de Tool ou patch de Provider para o rascunho do Off-Peak.

Continua-se reutilizando o padrão de exibição achatada de `ModelConfigSelect`, sem trazer a entrada de gestão de Providers da conversa comum, o estado de Session ou a semântica de herança.

### 3.2 O rascunho usa a semântica padrão de Selection

O rascunho de modelo da página de criação/edição deve ser interpretado como uma seleção padrão:

```ts
{
  providerId: OFF_PEAK_PROVIDER_ID,
  modelId,
  options?: { reasoningLevel?: string }
}
```

Ao trocar de modelo, o valor atual de Reasoning precisa ser resolvido novamente pelo Option Spec do novo modelo; um modelo sem Reasoning Option Spec não exibe o controle e também não pode manter o nível do modelo anterior como valor submetido.

### 3.3 Não alterar por enquanto a forma do banco de dados de Task

`ZCodeOffPeakTask.model` e `thoughtLevel` são a fronteira de persistência/API de produto da Off-Peak Task, não o conjunto completo de fatos de modelo. Esta
Todo não exige modificar colunas SQLite nem a interface de tarefas do servidor:

```text
ModelSelection.modelId                 -> task.model
ModelSelection.options.reasoningLevel  -> task.thoughtLevel
```

Essa projeção só pode existir na fronteira de submissão/leitura da Off-Peak Task. Na execução é obrigatório construir em sentido direto um `ModelSelection` padrão e não inferir Model Properties, Reasoning Mapping ou API de Provider a partir dos campos da tarefa.

O novo formulário sempre submete um modelo explícito. Se registros históricos de tarefa ainda podem não ter `model` é tratado dentro do escopo de compatibilidade de produto do Off-Peak atual,
mas não se pode por isso fabricar um padrão ou um Model falso fora do Registry; na ausência, só é permitido pegar o primeiro item dos candidatos ordenados do Registry scoped atual.

### 3.4 Comportamento quando uma seleção salva deixa de valer

| Cenário                                                     | Comportamento                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| O modelo de uma tarefa de History/estado final saiu do Registry | Continua exibindo o fato de string salvo pela tarefa, sem adicioná-lo aos candidatos e sem modificar a tarefa |
| Ao editar uma tarefa queued/paused o modelo salvo ficou inválido | Mostra estado indisponível e impede salvar como está; o usuário precisa escolher um modelo válido atual |
| O nível de Reasoning salvo ficou inválido                     | Mostra estado indisponível; antes de salvar, escolher um nível válido ou limpar para a semântica padrão atual |
| O Registry é atualizado durante a criação                    | A fronteira de submissão revalida com o Registry atual e não confia no snapshot inicial da página |

É proibido substituir silenciosamente pelo primeiro item e sobrescrever a escolha original do usuário.

## 4. Validação e fail-closed

### 4.1 Validação de criação e edição

Atualmente a criação só valida título, Prompt, Workspace e modo de permissão, e a edição grava `model` / `thoughtLevel` como vieram. O objetivo é validar o `ModelSelection` padrão contra o Registry completo atual antes de realmente obter o Ticket ou escrever no Repo:

```text
Renderer Submission
        |
        v
Host / Service 构造 Off-Peak ModelSelection
        |
        v
完整 Registry 精确校验
        |
        +--> 无效：返回稳定的本地校验错误，不请求 Ticket、不写 Repo
        `--> 有效：继续创建或编辑
```

O estado desabilitado do Renderer é apenas feedback rápido; a validação do Host / Service é a fronteira de submissão e não se pode confiar apenas no snapshot da UI.

### 4.2 Revalidar antes do despacho

Como uma tarefa pode ficar muito tempo na fila, o Scheduler/Host precisa validar de novo contra o Registry atual antes do despacho:

- o Provider não existe;
- o Model não existe ou está desativado;
- o Reasoning Level não é mais suportado;
- o Provider scoped não tem candidatos criáveis no momento.

Todos esses são erros de configuração determinísticos e devem falhar de forma fechada antes de qualquer requisição de rede de modelo, sendo mapeados para Off-Peak permanent dispatch failure:
a tarefa vai para `failed`, parando com retry e sem buscar número novamente. Erros de rede, de ciclo de vida do Agent e outros que podem se curar sozinhos continuam com backoff transient.

Esta Todo não modifica a semântica de visibilidade hidden do `ModelSelectionFacade.validate()` do usuário comum; a validação interna do Off-Peak deve usar diretamente a validação de seleção precisa do Registry completo e não pode inferir pela View de candidatos do usuário comum.

## 5. Fronteira do Mock

### 5.1 Manter o Mock gateway do Off-Peak

`ZCODE_OFFPEAK_MOCK=1` e suas variáveis de cenário de Ticket/Availability/ciclo de vida continuam sendo usados para desenvolvimento local e E2E do Desktop:

- simular o switch de entrada remoto e o estado de exibição do plano;
- simular Ticket, queued/ready/active, expiração e verificação;
- simular availability, cota, 429 e Retry-After;
- simular credenciais de período de requisição e o Endpoint de API de modelo do Off-Peak.

Esta Todo não remove `offPeakMockGateway` nem espalha o Mock para Provider comum, Official MCP ou resolução de credenciais de produção.

### 5.2 Remover a variável de ambiente de lista de modelos

Remover `ZCODE_OFFPEAK_MOCK_ALLOWED_MODELS`. Ela vem do estágio do desenho antigo em que o `client/configs.allowed_models` remoto era a fonte de verdade da lista de modelos; o E2E real atual não depende dessa variável e mantê-la permitiria que o Mock fabricasse modelos inexistentes no Registry.

A cadeia de testes alvo é:

```text
ZCODE_OFFPEAK_MOCK
|- 模拟产品开关、Ticket 和模型服务
`- 不模拟模型 Registry

测试 ZCode Built-in Config
`- 声明 builtin:offpeak-idle-plan 的 Provider API 和模型成员
```

Quando o teste precisar de um modelo customizado, é obrigatório declarar o fato completo pelo ZCode Built-in Config / Built-in Model Rules de teste, sem injeção por string de variável de ambiente, Model Config temporário, Model falso ou Model de fallback.

Manter `ZCODE_OFFPEAK_MOCK_NO_PLAN` e as variáveis de cenário Ready/Active/Availability/Retry; elas simulam estado de produto ou de serviço e não disputam a posse do fato com o Registry de modelos.

## 6. Superfície de impacto e posse de estado

### 6.1 Resumo da Feature

| Campo             | Conteúdo                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Developer intent | Remover do Off-Peak a projeção reversa do novo Registry para o Model Config antigo                                        |
| Capability        | Off-Peak Model Selection / Off-Peak Model Execution                                                                       |
| Change layer      | option-source, draft-default, validation, commit-effect, persistence boundary                                            |
| Operating mode    | planning                                                                                                                 |
| Primary seeds     | `buildOffPeakBuiltInModels`, `getOffPeakClientConfig`, `OffPeakEditView`, `OffPeakTaskService`, `dispatchOffPeakRun`       |
| Fora do escopo    | máquina de estado do Ticket, Account Access, Request Auth, Telemetry, Queue/Recovery, migração de banco de dados             |

### 6.2 Matriz de Superfície de UI

| Cenário do usuário            | Entrada de UI                                              | Owner de exibição/rascunho | Origem de candidatos/padrão        | Validação/gating                                   | Submissão e destino                                            | Limite de modo                              |
| ----------------------------- | ---------------------------------------------------------- | --------------------------- | ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| Criar tarefa off-peak         | Automations / New Task entra em `OffPeakEditView`          | Rascunho local do Renderer  | View scoped do Registry; primeiro candidato como padrão de criação | switch remoto, suporte de plano, availability, Registry atual | `OffPeakTaskService.createTask` -> Ticket + Repo do Off-Peak | Desktop local; sem nova entrada de celular/remoto |
| Editar tarefa queued/paused  | Automations `OffPeakEditView`                              | Rascunho local do Renderer  | Seleção salva; Registry atual decide disponibilidade | guarda de estado + Registry atual              | `updateTask` -> Repo do Off-Peak                                | Não modifica Session Selection              |
| Ver tarefa final/em execução  | Cartão do Off-Peak / History                                | Fato de tarefa salvo        | Strings de model/thought salvas      | Somente leitura                                     | Sem submissão de modelo                                        | Mudança no Registry não reescreve histórico |

### 6.3 Owners de Estado e Commit Sinks

| Estado/fato                                    | Exibido ou cacheado          | Owner autoritativo                          | Commit sink / persistência            |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------- | -------------------------------------- |
| Exposição da entrada                           | Snapshot Zustand do Off-Peak | `client/configs` remoto                     | Não é persistido de forma independente |
| Candidatos de modelo, Properties, Option Specs | Selection View scoped       | Provider Registry                           | Não é persistido de forma independente |
| Suporte de plano e availability de Ticket      | Snapshot sanitizado do Renderer | Account Access / Off-Peak Server       | Cache de Service existente             |
| Rascunho de criação/edição                     | local state de `OffPeakEditView` | Rascunho do Renderer                 | Não é persistido antes da confirmação do usuário |
| model / thought selecionado                    | Projeção de UI da Task       | Off-Peak Task Service/Repo                  | `off_peak_tasks.model/thought_level`   |
| Model realmente executado                      | Turno automático atual       | Active Model criado pelo Registry / ModelFactory | Não escreve Session Selection     |

### 6.4 Relations graduais

| Nível           | Relação                                                  | Motivo                                                              |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| must-inspect   | Registry -> scoped Off-Peak Selection View               | Nova única fonte de candidatos e Reasoning                         |
| must-inspect   | Off-Peak create/update -> Registry validation             | Evita que uma seleção inválida obtenha Ticket ou entre no Repo     |
| must-inspect   | Scheduler/Host -> dispatch validation -> ModelFactory     | Invalidação após o enfileiramento exige fail-closed permanente     |
| should-inspect | `ModelConfigSelect` / Model Thought helper                | Implementação de exibição compartilhada, mas rascunho e submissão continuam do Off-Peak |
| conditional    | Mock Gateway / ZCode Built-in Config de E2E               | Só afeta desenvolvimento local e E2E e não entra no fato de modelo de produção |
| invariant-only | Account Access / Ticket / Request Auth                    | Continua responsável pela admissão e pelo material de acesso dinâmico e não decide membros de modelo |
| invariant-only | desktop continuous / mobile replayable                    | Não altera semântica de execução nem de recuperação e não adiciona Off-Peak no mobile |
| invariant-only | Session Selection / App Recent / Queue                    | A seleção idle só atua sobre o turno automático                     |

### 6.5 Graph Drift e Graph Delta subsequente

O Feature Graph atual já registra `off-peak-model-execution -> provider-registry/model-capabilities`, mas ainda não registra explicitamente
que os candidatos da UI de criação/edição vêm da Selection View scoped do Provider oculto fixo, nem a dupla validação de Registry na submissão e no despacho.

Ao implementar esta Todo, acrescentar as seguintes arestas semânticas confirmadas:

```text
surface.off-peak-creation
  --options-from--> scoped offpeak ModelSelectionView

service.off-peak-task
  --validates-with--> complete Provider Registry

service.off-peak-task
  --persists-selection-boundary-to--> off_peak_tasks model/thought_level

capability.off-peak-model-execution
  --revalidates-before-dispatch-with--> complete Provider Registry
```

O grafo funcional tem modificações concorrentes neste momento, e este plano não altera os arquivos do grafo ao ser gravado, evitando sobrescrever atualizações de grafo de trabalhos vizinhos.

## 7. Casos de uso e poda

### 7.1 Casos aceitos

| Case ID | Setup                                         | Action                         | Asserções                                                                 | Camada de evidência         |
| ------- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- | ---------------------------- |
| OPM-01  | Provider oculto do Off-Peak tem dois modelos criáveis | Abrir a página de criação      | A View comum não contém o Provider; a View scoped do Off-Peak contém com precisão os dois modelos | Provider + Service + UI unit |
| OPM-02  | O modelo tem Reasoning Option Spec           | Trocar modelo e nível           | A UI só lê values/default; a submissão usa semântica padrão de Selection   | Provider + UI unit           |
| OPM-03  | O modelo não tem Reasoning Option Spec       | Trocar de um modelo de raciocínio para ele | O controle de Reasoning fica oculto e o nível antigo não vaza na submissão | UI unit                      |
| OPM-04  | O modelo ou o nível já ficou inválido na submissão | Criar tarefa                   | Erro local estável; sem chamada a takeTicket; sem escrita no Repo         | Service unit                 |
| OPM-05  | A seleção salva de queued/paused ficou inválida | Editar e salvar                 | Mostra indisponível e impede salvar como está; não troca silenciosamente pelo primeiro item | UI + Service unit            |
| OPM-06  | O modelo do History saiu do Registry          | Ver histórico                   | Continua exibindo a string salva, sem adicioná-la aos candidatos nem reescrever o registro | UI unit                      |
| OPM-07  | Modelo/nível saiu do Registry após o enfileiramento | Despacho pelo Scheduler        | Recusado antes da rede; tarefa com permanent failed; não entra em retry transient | Host/Scheduler unit          |
| OPM-08  | Task sem modelo explícito e View scoped não vazia | Host resolve o padrão           | Pega só o primeiro item ordenado da View atual e não infere de Connection/Catalog/Model falso | Host unit                    |
| OPM-09  | `ZCODE_OFFPEAK_MOCK=1`                        | Rodar o E2E do Off-Peak         | O serviço de produto é movido pelo Mock; os candidatos de modelo vêm só do ZCode Built-in Config de teste | Services + Desktop E2E       |
| OPM-10  | O teste tenta usar um modelo desconhecido     | Construir Registry de teste / submeter | Sem entrada `ZCODE_OFFPEAK_MOCK_ALLOWED_MODELS`; falha explícita na falta de Config completo | Config + Service unit        |

### 7.2 Podas explícitas

| Combinação                                                 | Tratamento | Motivo                                                                   |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Criar ou editar Off-Peak em `/remote` no celular            | pruned    | O produto atual não suporta explicitamente e a limpeza de DTO não cria entradas novas |
| Off-Peak em Workspace remoto                                | pruned    | O Off-Peak atual é voltado apenas para Workspace local do Desktop       |
| Reescrever automaticamente tarefas salvas após atualização do Registry | pruned | O registro da tarefa guarda a escolha histórica e só é validado nas fronteiras de edição/despacho |
| Filtrar modelos idle por allowedModelIds do Account          | pruned    | O Account responde por admissão e autenticação e não possui os membros de modelo do produto off-peak |
| Injetar modelos arbitrários pelo Mock                       | pruned    | O fato de modelo precisa vir do ZCode Built-in Config / Registry de teste |
| Modificar Session Selection, App Recent ou a fila comum de busy | pruned | Invariantes existentes do turno idle com escopo de execução              |

Esta Todo se apoia principalmente em testes unitários de Provider/Services/UI/Host/Scheduler. O E2E de Desktop do Off-Peak existente só precisa validar a cadeia principal representativa de Mock + ZCode Built-in Config de teste, sem novos E2Es de Conversation em larga escala e sem alterar o catálogo de cases de conversation.

## 8. Ordem de implementação

### Step A: Spec e testes falhos

- atualizar a spec do Off-Peak com a View de candidatos, a dupla validação e a fronteira de fato de modelo do Mock;
- escrever primeiro os testes falhos para a View scoped de Provider oculto, o Reasoning da UI, a validação de create/update, a permanent failure de despacho e o ZCode Built-in Config de Mock;
- confirmar que a Todo 03 já publicou o tipo de Model Config completo do Registry Model; se a Todo 08 já removeu o estado de Reasoning independente, reutilizar diretamente o helper de Selection View dela.

### Step B: Unificar a projeção do Registry

- extrair na camada de Provider o projector de View de Provider/Model compartilhado entre a Model Selection comum e o Off-Peak scoped;
- o Facade comum continua filtrando hidden primeiro e depois chamando o projector;
- o serviço do Off-Peak lê com precisão pelo ID de Provider fixo e chama o mesmo projector;
- não adicionar um parâmetro genérico `includeHidden`.

### Step C: Contrato de Service e UI

- consolidar `OffPeakClientConfig` em uma View de produto carregando a Selection View padrão scoped;
- a UI constrói diretamente o seletor achatado com candidatos de modelo do Registry;
- o Reasoning reutiliza o helper formal de Model Thought Option;
- remover `allowedModels` / `allowedModelConfigs` e o helper de thought legado do Off-Peak.

### Step D: Validação de submissão e despacho

- create/update valida a Selection atual antes do Ticket/Repo;
- revalidar antes do despacho e mapear a invalidação determinística para permanent failure;
- o Host lê como modelo padrão o primeiro item ordenado da View scoped;
- não fabricar fallback a partir de Connection, Catalog, tipo de Provider ou hardcode de modelId.

### Step E: Mock e código legado zerados

- remover a resolução de produção, os testes e a documentação de `ZCODE_OFFPEAK_MOCK_ALLOWED_MODELS`;
- manter o Mock Gateway e as variáveis de cenário de produto/serviço;
- o E2E continua derivando o Provider de teste do ZCode Built-in Config formal, cobrindo só o Endpoint e os fatos de teste necessários;
- remover a construção de DTO legado, imports de tipo, helpers e fixtures de teste que ficaram sem chamadores.

### Step F: Verificação e commit

- rodar os testes unitários afetados de Provider, Coding Plan Subscription, Off-Peak Service, UI e Host/Scheduler;
- rodar o E2E representativo de Off-Peak do Desktop;
- rodar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`;
- atualizar as arestas semânticas confirmadas do Feature Graph;
- Conventional Commit independente.

## 9. Definição de conclusão

- O código de produção do Off-Peak não referencia mais `ModelProviderModelConfig`;
- não existe mais `allowedModelConfigs` nem `allowedModels` com uso como fato de modelo;
- não existem mais `createOffPeakModelConfig()`, `createLegacyReasoningSpec()` nem o helper de Reasoning legado do Off-Peak;
- o `ModelSelectionView` comum continua filtrando Providers ocultos;
- a View scoped do Off-Peak só resolve o `OFF_PEAK_PROVIDER_ID` fixo e reutiliza o projector de View formal;
- a UI, a validação de criação/edição, o modelo padrão e a validação de despacho leem a mesma revision/estrutura do Registry;
- não existe mais `ZCODE_OFFPEAK_MOCK_ALLOWED_MODELS`; os modelos de teste vêm só do ZCode Built-in Config / Registry de teste;
- não há Model falso, Model de fallback, Model Config temporário ou inferência de capacidade de modelo fora do Registry;
- uma seleção inválida não obtém Ticket nem escreve no Repo em criação/edição e falha de forma fechada permanente no despacho;
- a semântica do banco de dados de Task, do Ticket, do Account Access, do Request Auth, da Telemetry, do desktop continuous e do mobile replayable permanece inalterada.

Concluído, o Off-Peak tem apenas uma cadeia de abstração de modelo da exibição de candidatos à execução real:

```text
Built-in / Account / Personal Config
              |
              v
Complete Provider Registry
              |
              v
Scoped ModelSelectionView
              |
              v
ModelSelection
              |
              v
ModelFactory -> Active Model -> Request
```