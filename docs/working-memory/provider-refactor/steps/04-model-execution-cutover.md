# Fechamento da Cadeia de Execução de Modelos do M4

> Status: concluído; os portões estáticos, de unidade e de E2E de rede do OP10 Desktop passaram
>
> Data: 2026-08-24
>
> Design alvo: [`../design/design.md`](../design/design.md)

## 1. Objetivo da Fase

O M4 conecta execuções especiais como tarefas de horário ocioso e Subagent à cadeia padrão de chamada de modelo já estabelecida:

```text
ModelSelection
      |
      v
Provider Registry
      |
      v
ModelFactory
      |
      v
Model
      |
      v
ModelRequest -> Adapter -> Provider API
```

O M4 não cria um segundo Model, um segundo Registry nem um Provider temporário genérico. Ao final da fase, conversas comuns, tarefas ociosas, Compact e Subagent usam o mesmo Effective Provider Config, Effective Model Config, ModelFactory, Adapter e as mesmas semânticas de Usage e Trace.

O principal objeto de migração do M4 é a cadeia `turnRuntimeModel` que existia nas tarefas ociosas. Antes do M4, o Host montava um snapshot completo de Runtime Provider a cada dispatch, a CLI o injetava no Runtime Overlay, trocava temporariamente o model da Session e restaurava no fim do Turn. O M4 removeu fisicamente essa cadeia de compatibilidade.

## 2. Base de Configuração Confirmada

### 2.1 Provider Config

O Provider Config é fixado com o seguinte Overlay, nesta ordem:

```text
ZCode Built-in Provider Config
              |
              v
     Account Provider Config
              |
              v
    Personal Provider Config
              |
              v
    Effective Provider Config
```

```ts
const effectiveProviders = zcodeBuiltinProviders
  .overlay(accountProviders)
  .overlay(personalProviders);
```

Account apenas completa ou restringe os Providers de conta dentro do ZCode Built-in; não lê Providers personalizados do Personal.
O Personal tem efeito por último e expressa a configuração final do usuário sobre a encapsulação das chamadas de API de modelo.

### 2.2 Model Config Rules

As Model Config Rules são concatenação de arrays, com o Personal depois:

```ts
const effectiveModelRules = new ModelConfigRules([
  ...zcodeBuiltinModelRules.rules(),
  ...personalModelRules.rules(),
]);
```

As Rules atuam sobre o Effective Provider Config:

```ts
for (const [providerId, provider] of effectiveProviders) {
  for (const modelId of provider.models ?? []) {
    effectiveModelRules.resolve(providerId, modelId, provider.api?.type);
  }
}
```

O Provider Config responde "quais Providers existem, quais modelos cada Provider tem, qual API e qual forma de acesso são usados";
as Model Config Rules respondem "quais capacidades, opções e mapeamentos de parâmetros de requisição o modelo tem". Os dois caminhos formam juntos um Model completo.

## 3. Visibilidade do Provider

O M4 substitui `executionOnly` por uma visibilidade de usuário genérica:

```ts
type ProviderVisibility = "visible" | "hidden";
```

O padrão é `visible`.

```text
visibility = visible
├─ 出现在 Provider Settings
└─ 出现在 Model Selection 候选

visibility = hidden
├─ 不出现在 Provider Settings
└─ 不出现在 Model Selection 候选
```

`visibility` controla apenas a exibição voltada ao usuário e a lista de candidatos; não expressa autorização, permissão de chamada, origem de execução nem completude de Config.
Um Provider hidden ainda participa da resolução comum de Provider/Model, ainda entra no Registry interno e usa o mesmo ModelFactory.
Quando uma capacidade interna de produto conhece o `providerId + modelId` exatos, ela pode criá-lo, sem precisar de um "Provider confiável" ou de outra interface de criação.

`executionOnly` é um campo intermediário ainda não publicado; o M4 o remove diretamente, sem importer nem leitura de compatibilidade de longo prazo.

## 4. Access e Fronteira de Credenciais

O Provider Config é a entrada de montagem das chamadas de API de modelo. Ele pode guardar credenciais estáticas ou referências de credenciais estáveis, mas não é um centro unificado de credenciais, não gerencia o ciclo de vida de todas as credenciais dinâmicas e não assume a decisão final de autorização do servidor.

Os tipos de Access após o M4 incluem pelo menos:

| Access type     | O que o Config guarda                        | Comportamento na requisição                            |
| --------------- | ------------------------------------------- | ------------------------------------------------------ |
| `api-key`       | `apiKey` estático                           | O Adapter usa a Key do Config                           |
| `zhipu-account` | `accessId` estável e não sensível           | O Account Request Auth Service resolve a credencial dinâmica atual |
| `request-auth`  | Nenhuma credencial concreta; apenas declara que a autenticação precisa estar disponível no momento da requisição | O ModelRequest consome o Request Auth fornecido pelo chamador |

`request-auth` é um tipo de Access comum, sem vínculo com `visibility`, tarefas ociosas ou suposta "execução confiável". Qualquer Provider pode adotar essa forma de acesso. O contexto de execução monta a Request Auth Source do escopo corrente em `ModelRequestDependencies` ao criar o Model; o `ModelRequest` público não ganha campos de credencial. Suas regras de completude são:

```text
Config / Registry 完整性
├─ access.type = request-auth
├─ api.type 完整
├─ api.baseURL 完整
├─ models[] 完整
└─ Effective Model Config 完整

ModelRequest 执行
├─ 本轮 Source 能解析 Request Auth -> 合并动态 Header，发送请求
└─ 未装配 Source / 无法解析 -> 网络请求前返回类型化鉴权缺失错误
```

Um Provider hidden não recebe mais nenhuma isenção de validação de `access` ou `baseURL`.

## 5. Built-in Provider de Horário Ocioso

`builtin:offpeak-idle-plan` é um ZCode Built-in Provider comum, apenas invisível para o usuário e usando autenticação no momento da requisição:

```json
{
  "label": "Idle plan",
  "visibility": "hidden",
  "access": {
    "type": "request-auth"
  },
  "api": {
    "type": "anthropic-messages",
    "baseURL": "https://zcode.z.ai/api/v1/off-peak/anthropic"
  },
  "models": ["GLM-5.2", "GLM-5-Turbo"]
}
```

O Endpoint de produção é um fato estático do Built-in Provider Config. Testes e mocks reescrevem a configuração de teste inteira injetando uma Built-in Config Source de teste; o Endpoint não volta para o payload de um Turn isolado.

O context, o max output, os formatos de entrada e saída, os reasoning levels e o reasoning mapping dos modelos vêm das ZCode Built-in Model Config Rules. O Host não infere mais nada por modelId, família de Provider ou `builtinModels` remoto.

`enable_offpeak_task` pode continuar como o produto de gradual rollout das tarefas ociosas. O `allowed_models` remoto deixa de ser fonte de verdade para Provider.models, capacidades de modelo ou Registry; o servidor ainda pode aplicar sua própria admissão final na fronteira do ticket ou da requisição de modelo.

## 6. Submission Ociosa

Uma tarefa ociosa é uma Core Submission comum com um contexto de execução:

```text
Host / Scheduler
├─ prompt / attachments / mode
├─ idle ModelSelection
├─ execution-scoped Request Auth
├─ Off-Peak Ticket
└─ optional Subagent Model override
             |
             v
       Core Submission
             |
             v
   Registry / ModelFactory
             |
             v
       Loop Active Model
```

A Submission sempre tem uma única `ModelSelection`. Request Auth, Ticket, atribuição de Off-Peak e override de Subagent são contextos adicionais da execução especial; não geram uma segunda vinculação de modelo, Selection ou Config completo de Provider/Model.

A forma final dos campos do protocolo reutiliza, na implementação, o schema estrito e o Request Auth Port já existentes, mas precisa satisfazer:

- não transportar fatos estáticos de Provider/Model;
- não gravar na Session Selection;
- não entrar no Personal Config, no Registry View nem na persistência da Session;
- não entrar na busy queue comum do usuário, no Guide nem na held queue;
- não gravar Secret nem Ticket em texto claro em logs, Telemetry ou conversation event.

## 7. Session Selection e Active Model

Tarefas ociosas nunca modificam nem restauram a Session Selection do usuário:

```text
Session Selection = 用户模型 U

闲时任务开始
├─ Session Selection 仍为 U
└─ Idle Loop Active Model = I

闲时任务结束
├─ Model I 生命周期结束
└─ Session Selection 仍为 U

下一条普通用户 Submission
└─ 根据 Session Selection U 创建新 Model
```

Portanto o M4 remove a máquina de estados completa "salvar previous model -> setModel temporário -> finally restore". O Active Model é o único fato de execução de modelo do Loop corrente; a Session Selection expressa apenas qual modelo a execução principal comum subsequente daquela Session vai usar.

O dispatch ocioso só é aceito quando a Session pode iniciar imediatamente. Diante de uma corrida com busy, o Core devolve uma rejection de admissão tipada e o Scheduler despacha de novo mais tarde; o Request Auth/Ticket ocioso não entra no CommandInbox/FIFO comum.

A entrada suplementar do usuário durante a execução continua entrando na fila comum existente. Depois que o Turn ocioso termina, os itens da fila executam com base na própria Submission comum e na Session Selection do usuário salvas, sem herdar Provider ocioso, Request Auth, Ticket ou atribuição.

## 8. Compact, Subagent, Goal e Background

### 8.1 Compact

O Compact automático pertence ao Loop atual e usa diretamente o Active Model atual, incluindo o mesmo Provider, Model Config, Options e contexto de autenticação do momento da requisição. Ele não lê a Session Selection e não recebe snapshot de `TurnExecutionModel`.

O Compact manual é uma nova Submission comum e continua criando o Model a partir do ModelSelection daquela Submission.

### 8.2 Subagent

A prioridade do Subagent Selection permanece:

```text
Core Server Submission override
        >
Subagent Profile Selection
        >
Parent Loop Active Selection
```

Definida a Selection, cada Child cria seu próprio Model pelo mesmo Registry/ModelFactory. Parent e Child não compartilham o mesmo objeto mutável de Model.

A tarefa ociosa usa o override genérico do Core Server para fixar os Foreground Children permitidos na idle Selection do turno e repassa o contexto de Request Auth/Ticket do turno para as requisições de modelo dos Children. Assim, Explore, general-purpose e custom Foreground Children usam o mesmo Provider, modelo e material de acesso dinâmico do idle, sem ler outro Provider do Profile. Background Children são bloqueados em fail-closed pela Tool Policy antes de emitir requisições de modelo.

### 8.3 Goal e Background

Uma tarefa Background comum obtém seu próprio Model ao iniciar e o mantém durante seu próprio ciclo de vida. Ao terminar, o novo Loop principal que ela acorda usa a Session Selection vigente. Cada rodada automática de continuação do Goal também é um novo Loop principal e usa a Session Selection do momento da continuação; nenhuma das duas grava seu modelo de volta na Session Selection.

## 9. Permission / elicitation

Tarefas ociosas mantêm o D44: permission/elicitation usa a interação bloqueante comum da Session, o mesmo Turn automático continua após a resposta do usuário e ainda usa o idle Active Model.

```text
Idle Turn
└─ permission / elicitation requested
       ├─ 普通 Session 展示并收集响应
       ├─ Off-Peak task 保持 running
       └─ approve / deny / skip
              └─ 同一个 Turn 继续，仍使用 Idle Model
```

O M4 não adiciona um estado ocioso `awaiting_approval`, não troca para o Provider do usuário após a aprovação e não estabelece handoff de Provider no meio do Turn.
Somente depois que o Turn automático atual termina, as Submissions comuns subsequentes usam a Session Selection do usuário.

## 10. Expiração, Cancelamento e Redispatch de Ticket

Ticket, enfileiramento de tarefas, retomada e settle pertencem ao Off-Peak Scheduler/Repo e não entram no Provider Config nem no Registry:

```text
Idle Model Request
      |
      v
Ticket 过期 / 当前派发失效
      |
      v
当前自动 Turn 结束
      |
      v
Scheduler 保留 Task、Session 与 transcript
      |
      v
重新取得 Ticket 并派发新的 Core Submission
      |
      v
Registry / ModelFactory 创建新的 Idle Model
```

Após sucesso, falha, cancelamento, preempção, expiração de Ticket ou reinício do processo, o Request Auth antigo não pode entrar no próximo redispatch.
A obtenção de ticket, o reordenamento, a time box de 3 horas e a continuation continuam usando a implementação atual do domínio Off-Peak.

## 11. Registry e Facade

Após o M4 existe apenas um Registry completo:

```text
Effective Provider / Model Config
             |
             v
       Provider Registry
       ├─ visible Provider
       └─ hidden Provider
             |
             +--> Settings Facade：只投影 visible
             +--> Selection Facade：只投影 visible
             `--> 内部精确 lookup / create：visible、hidden 共用
```

A filtragem por Visibility pertence ao Facade e não altera os membros do Registry nem o ModelFactory. Não existe interface especial de criação de Model, Execution Registry, Provider Source com escopo de execução nem injeção de Registry temporário.

## 12. Adapter e Atribuição

Um Model `request-auth` obtém, antes de cada requisição real, o material de autenticação dinâmico a partir da Request Auth Source do escopo do turno, e o combina com os Headers estáticos do Provider Config. Sem o material, ele falha antes da requisição de rede; o Retry só pode continuar usando ou renovando o material dentro do contexto de execução válido atual.

Usage, Trace e erros precisam ser atribuídos ao Model real:

```text
providerId = builtin:offpeak-idle-plan
modelId    = 本轮实际 idle model
```

`offPeakTaskId`, o ID do Ticket e o run type são dimensões de tarefa/execução; não substituem a identidade do Model e não podem atribuir um item da fila do usuário ao Provider ocioso.

## 13. Posse do Estado

| Estado ou fato                          | Owner autoritativo                                          | Ciclo de vida        | Não pode ser escrito em                            |
| --------------------------------------- | ---------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Fatos estáticos de Provider            | Effective Provider Config                                    | Revisão de Config    | Snapshot estático no payload do Turn               |
| Fatos estáticos de Model               | Effective Model Config                                       | Revisão de Config    | Hardcode do Host, caso especial por modelId        |
| Modelo principal futuro do usuário      | Session Selection                                            | Session              | Contexto de execução ocioso                        |
| Modelo em execução atual               | Loop Active Model                                            | Loop                 | Preferência persistida da Session                 |
| Identidade de conexão da conta         | `accessId` do Account Provider Config                        | Conexão da conta     | API Key/JWT/Header                                 |
| Credencial dinâmica da conta            | Account Request Auth Service                                 | Tentativa de requisição | Provider Config                                 |
| Credencial dinâmica e Ticket ociosos    | Off-Peak Scheduler / Request Auth context                    | Dispatch válido      | Config, Registry View, snapshot de Session, logs  |
| Estados de Queue, Ticket, tarefa e retomada | CLI CommandInbox / Off-Peak Scheduler / Off-Peak Repo | Ciclo de vida do próprio domínio | Registry                     |

## 14. UI Surface Matrix

| Cenário                          | Origem de candidatos/configuração               | Visibilidade e validação                          | Owner de submissão/execução     | Isolamento obrigatório                          |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------- | ----------------------------------------------- |
| Provider Settings               | Settings Facade                                | Mostra apenas `visibility=visible`              | Personal Config Repository      | Provider hidden, Session Selection             |
| Conversation Model Picker       | Selection Facade                               | Mostra apenas modelos completos, enabled e visíveis | Composer/Submission          | Provider hidden, Active Model                  |
| Página de criação Off-Peak      | Projeção de produto do Built-in idle Provider    | Rollout de produto; não é fonte de verdade do Registry | Off-Peak Service/Scheduler  | Personal Config, seletor de modelos comum       |
| Turn automático Off-Peak        | idle ModelSelection exata                       | Admissão start-now do Core                        | CLI Loop Active Model           | Session Selection, Queue comum                  |
| Configurações de Subagent       | Candidatos do Registry visível / Profile        | Salva o Profile sem alterar a Session atual      | Subagent Config/Markdown        | Override ocioso de turno único                   |
| Foreground Child Off-Peak       | Override ocioso corrente                        | Background recusado pela Tool Policy              | Child Runtime / ModelFactory    | Outros Providers do Profile, estado da Session  |

## 15. Invariantes que Precisam Ser Mantidos

- O Overlay de Provider é sempre Built-in -> Account -> Personal.
- As Model Rules são sempre Built-in + Personal e atuam sobre o Effective Provider.
- `visibility` só afeta a View do usuário; não altera completude, Access nem ModelFactory.
- Todos os Providers precisam ter seus próprios Access, API, Endpoint, models e Model Config completos.
- `request-auth` sem credencial no momento da requisição precisa falhar antes da rede.
- Tarefas ociosas nunca modificam nem restauram a Session Selection.
- O Compact automático usa o Loop Active Model atual.
- Cada Subagent cria seu próprio Model; Foreground Child ocioso usa o override genérico.
- Após approve/deny de permission, o mesmo Turn ocioso continua usando o idle Model.
- Entrada busy do usuário entra na Queue única da CLI e, após o fim do Turn ocioso, usa sua própria Submission comum.
- A refatoração de Provider não muda a semântica de desktop continuous, web remote replayable nem workspace identity.

## 16. Estruturas Antigas de Produção a Remover

Na conclusão do M4, auditar os seguintes usos ociosos com `dep:refs`, `rg` e `knip`:

- `ProviderConfig.executionOnly`;
- `sendText.turnRuntimeModel`;
- o `ZCodeModelRuntimeConfig` completo para uso ocioso;
- `buildOffPeakTurnRuntimeModel`;
- `TurnExecutionModel`;
- `ExecutionScopedModelSource` / `createTurnExecutionModelSource`;
- o Turn Runtime Model Overlay;
- projeções e substituições temporárias do Provider Registry;
- `applyTurnRuntimeModel` / `clearTurnRuntimeModel`;
- `previousModel`, o `setModel` temporário e o restore no `finally`;
- as leituras de snapshots antigos de Turn por Compact/Subagent;
- a montagem duplicada de Endpoint, properties, reasoning e limites de modelo pelo Host.

Se algum tipo público antigo ainda tiver consumidores não ociosos, primeiro provar a semântica de cada consumidor e migrá-la; não é permitido apagar em lote apenas pelo nome do tipo.

## 17. Ordem de Implementação

### M4.1: Config, Visibility e Access

1. Escrever primeiro os testes falhando.
2. Migrar `executionOnly` para `visibility`, com o Facade responsável pela filtragem de visible/hidden.
3. Adicionar o Access `request-auth` e sua validação de completude.
4. Completar Access, Endpoint, models e Built-in Model Rules de `builtin:offpeak-idle-plan`.
5. O Registry registra hidden Providers completos, sem projetá-los nas Views comuns de Settings/Selection.

### M4.2: Criação Padrão de Model e Autenticação de Requisição

1. Chamadas internas ociosas usam o lookup/ModelFactory do Registry existente pela Selection exata.
2. Model/Adapter suportam Request Auth em nível de chamada.
3. Ausência de Request Auth devolve um erro tipado; o material dinâmico não entra no Config nem no Registry.
4. generate/stream, Retry, Usage e Trace usam a mesma fronteira de Adapter.

### M4.3: Trocar o Dispatch Ocioso de Produção

1. O Host deixa de construir `turnRuntimeModel`.
2. A Core Submission carrega a Selection padrão e um contexto de execução mínimo.
3. A admissão da CLI cria diretamente o Idle Active Model, sem `setModel` temporário.
4. Compact automático, Foreground Subagent e continuation de permission usam o Active Model/Selection oficial.
5. Expiração de Ticket, cancelamento, falha e sucesso encerram o contexto de execução atual seguindo a máquina de estados Off-Peak existente.

### M4.4: Remover o Caminho Duplo

1. Remover o Runtime Overlay, o snapshot de Turn, a injeção temporária de Registry e a máquina de estados de restore.
2. Remover a montagem duplicada dos fatos estáticos de Provider/Model pelo Host.
3. Usar auditoria de referências para confirmar que nenhum consumidor de produção lê fatos do Runtime Model antigo.
4. Atualizar o Design, o Feature Graph, as specs de Off-Peak/Subagent e a matriz de testes.

## 18. Casos de Aceitação

| Caso   | Setup                                    | Ação                          | Asserções                                                              | Camada de evidência   |
| ------ | ---------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- | --------------------- |
| M4-01  | hidden idle Provider com Config completo | Ler Settings/Selection/Registry | As duas Views de usuário não contêm o idle; o Registry faz lookup preciso | domain unit           |
| M4-02  | `request-auth` Provider sem credencial de chamada | generate/stream               | Retorna ausência de autenticação tipada antes da rede; nenhuma requisição emitida | adapter unit      |
| M4-03  | Selection do usuário da Session ociosa=U | Despachar idle Selection=I    | Active Model=I; Session Selection continua U                           | protocol/runtime      |
| M4-04  | Turn ocioso em running                   | Usuário envia prompt comum    | A entrada entra na Queue única; após o terminal usa U                   | protocol/network      |
| M4-05  | Turn ocioso dispara Compact automático   | Requisição de Compact        | A requisição usa I, o Endpoint idle e o Request Auth atual              | runtime/network       |
| M4-06  | Profiles configuram outros modelos       | Turn pai ocioso inicia vários Foreground Child | Cada Child cria seu Model, mas todos usam o override idle; Background não faz requisição | runtime/network |
| M4-07  | Turn ocioso pede permission              | approve / deny                | A task Off-Peak continua running; o mesmo Turn ainda acerta o Endpoint idle | protocol/network  |
| M4-08  | Ticket atual invalida                    | Scheduler retoma o ticket e faz resume | Novo dispatch, novo Model, novo material dinâmico; Session/transcript continuam | service/runtime  |
| M4-09  | Turn ocioso termina                      | Usuário continua a conversa comum | Usa U; sem vazamento de Header idle, Ticket ou atribuição            | network/telemetry     |

Não se faz o produto cartesiano completo de tema, idioma, sistema operacional, família de Provider, tipo de workspace e delivery kind. O comportamento Core/Adapter compartilhado do M4 é provado por focused tests; o desktop continuous usa o E2E representativo de Off-Peak existente, e o mobile replayable apenas verifica que os campos de protocolo não entraram no estado de recuperação, sem nova capacidade de produto ocioso no celular.

## 19. Portões de Conclusão

O M4 só está concluído quando todas estas condições forem satisfeitas:

1. Os fatos estáticos de Provider/Model ociosos só entram na execução pelo Effective Config/Rules.
2. Hidden é apenas visibilidade de usuário e não contorna mais a completude de Config nem o Access.
3. O Model ocioso é criado pelo Registry/ModelFactory padrão.
4. O Request Auth/Ticket ocioso não entra no Config, no Registry View nem na persistência da Session.
5. Tarefas ociosas não modificam nem restauram a Session Selection.
6. Compact, Subagent e permission mantêm as semânticas de herança especificadas neste documento.
7. `turnRuntimeModel`, o Runtime Overlay, o snapshot de Turn e a cadeia de restore saem fisicamente da produção.
8. Usage, Trace e erros são atribuídos ao Model real.
9. Os testes unitários relacionados, `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e os E2E afetados passam.

## 20. Exclusões Explícitas

- Provisioning remoto, configurações remotas, login remoto e o produto de sincronização de configuração entre Environments;
- refatoração de identidade, benefícios e topologia de planos de Account Provider;
- distribuição de Built-in Config pelo Management Service;
- `modelContextBudget.strategy`;
- redesenho da UI de Off-Peak;
- mudanças na semântica de produto de Queue, snapshot, reconnect e continuous/replayable;
- blocos de conteúdo de áudio, entradas de anexo ou codificação de Provider.

## 21. Impact Brief

### 21.1 Feature Summary

| Campo              | Valor                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Remover o caminho duplo do Runtime Model ocioso e fazer execuções especiais reutilizarem a cadeia oficial de Provider/Model |
| Capacidade         | Provider Registry, execução de Model, Off-Peak, Subagent                                  |
| Camada de mudança  | option-source, validation, commit-effect, persistence, recovery invariant                 |
| Modo de operação   | implementation                                                                            |
| Seeds principais   | `ProviderConfigResolver`、`buildOffPeakRequestAuth`、`sessionFlowHandlers`、`agentHandler`  |
| Fora de escopo     | Remote Provisioning, refatoração de produto de Account, semântica comum de Queue/recuperação, gradual rollout de parâmetros do Agent |

### 21.2 Shared And Divergent Behavior

| Aspecto          | Compartilhado entre superfícies                              | Deliberadamente diferente                                        | Por que importa                          |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Origem de opção  | Todos os Models vêm do mesmo Registry/ModelFactory            | hidden Providers não entram no Facade do usuário                  | Evita um segundo Registry de execução    |
| Validação        | Todos os Providers passam por validação de completude e Adapter | `request-auth` exige credencial em nível de chamada               | Visibilidade não pode ser isenção de autorização |
| Efeito de commit | Todos os Loops têm um Active Model                            | start-now ocioso não grava Session Selection                    | Remove a máquina de estados set/restore  |
| Execução de Child| Cada Child cria seu próprio Model                             | Foreground Child ocioso é forçado ao override idle; background é recusado | Impede que credenciais e Provider vazem |
| Persistência     | Config guarda fatos estáticos; Session guarda a Selection comum | Ticket/Auth pertencem a um único dispatch                        | Secret e modelo ocioso não entram no estado de recuperação |

### 21.3 Feature Relationships

| Rank           | De                          | Aresta semântica                     | Para                    | Por que inspecionar                              | Evidência                                    |
| -------------- | --------------------------- | ------------------------------------ | ----------------------- | ----------------------------------------------- | -------------------------------------------- |
| must-inspect   | Off-Peak scheduler          | despacha Selection + contexto        | CLI admission           | O Host atual monta um Runtime Model completo; o M4 remove | `offPeakRuntimeModel.ts`、`session-flow.ts` |
| must-inspect   | hidden Built-in Provider    | cria através de                      | Registry/ModelFactory   | A visibilidade pertence só ao Facade             | Registry Design §§3、11                       |
| must-inspect   | idle Active Model           | herdado por                          | Automatic Compact       | O Compact não pode voltar para Session Selection  | Execution Design §8.1                         |
| must-inspect   | contexto de execução ocioso | sobrescreve                          | Foreground Child        | O Child cria seu Model mas compartilha a fronteira de acesso do turno | OP10、Execution Design §8.2           |
| must-inspect   | resposta de permission      | continua                             | mesmo Turn ocioso       | D44 proíbe handoff de Provider                   | OP03、Execution Design §9                     |
| should-inspect | Request Auth                | valida antes de                     | Adapter network I/O     | Credencial ausente precisa falhar fechada        | Model Creation Design                         |
| invariant-only | M4                          | não pode mutar                       | entrega desktop/mobile  | Não muda continuous/replayable                  | AGENTS、Feature Graph                         |
| invariant-only | M4                          | não pode ser dono de                 | Remote Provisioning     | Sincronização de configuração remota é produto independente | Environment Design                  |

### 21.4 Code Evidence And Graph Drift

O conjunto atual de ferramentas não tem um codegraph invocável, então esta rodada substitui a verificação pela verificação das seeds já declaradas no grafo funcional, referências precisas com `rg` e uma cadeia de chamada manual de profundidade 2; os portões de conclusão usam `dep:refs`, `knip` e os testes afetados para complementar a prova de remoção em nível de símbolo.

| Seed                      | Caminho-chave                                                       | Profundidade | Interpretação                                  |
| ------------------------- | ------------------------------------------------------------------ | ----------- | ---------------------------------------------- |
| `buildOffPeakRequestAuth` | Desktop Host → `sendText.modelExecution` → Model dependencies     | 2           | Fornece apenas o material de autenticação dinâmico do dispatch corrente |
| `sessionFlowHandlers`     | admission → Core Submission → Active Model                        | 2           | Uma Selection de execução isolada não muda a Session |
| `agentHandler`            | override → Child runtime → child ModelFactory                      | 2           | Ponto de convergência entre override comum e override idle |
| `ProviderConfigResolver`  | Built-in → Account → Personal → Registry                           | 2           | Única fonte dos fatos estáticos do M4           |

| Candidato                                                  | Evidência em código vivo                     | Ação no grafo                                                        |
| ---------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| O code seed antigo do Feature Graph apontava para o caminho duplo removido | O M4 removeu o Builder e o Source antigos | Passou a usar live seeds de Request Auth, dispatch, Submission e Registry Model Runtime |
| O invariante do Provider Registry escrevia a autorização final como model service | O Config só monta material de acesso; o resultado final é decidido pelo servidor | Passou a ser decidido pelo servidor                 |
| OP03 ainda registrava troca para o Provider do usuário após a aprovação | É o contrário da spec de Off-Peak D44 e da adjudicação do usuário | O case catalog e a coverage matrix foram sincronizados |

Questões não resolvidas que mudariam o escopo do M4: nenhuma. Os nomes físicos dos campos de protocolo, a enumeração de erros tipada e as assinaturas de método do Request Auth Port são detalhes de implementação; precisam obedecer aos invariantes deste documento e não constituem uma nova adjudicação de produto.

## 22. Planning Handoff

### 22.1 Decisões de Fronteira

| Fronteira            | Decisão                                       | Inclui                              | Exclui / podas                                     | Origem             |
| ------------------- | --------------------------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------ |
| Visibilidade do Provider | Visibilidade genérica `visible/hidden`   | Filtragem nos Facades de Settings/Selection | Permissão, confiança, isenção de completude | adjudicação do usuário |
| Access               | Autenticação dinâmica em nível de requisição `request-auth` | Validação de ausência antes da rede, ciclo de vida do Retry | Persistência de Secret, sincronização de Account | adjudicação do usuário + Design |
| Selection ociosa     | Uma ModelSelection padrão                    | Mesmo Registry/Factory/Model        | Segunda vinculação de modelo, Selection ou Registry | adjudicação do usuário |
| Estado da Session    | O idle não grava nem restaura                | Session Selection comum preservada  | setModel temporário/restore no finally             | adjudicação do usuário |
| Permission           | O mesmo Turn ocioso continua                 | approve/deny/skip                   | Handoff de Provider, estado awaiting dedicado      | D44                |
| Child                | Override idle em Foreground, recusa em Background | Cada Child cria seu próprio Model | Compartilhar Model do pai, fuga pelo Profile | OP10               |

### 22.2 Dimensões e Poda

| Dimensão                                        | Classes incluídas                | Motivo da poda                                                |
| ----------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| visibility                                      | visible / hidden                 | Validar apenas a diferença entre Facade e Registry, sem expandir tema/idioma |
| request auth                                    | presente / ausente / expirada    | Muda se a requisição é enviada                                 |
| admission                                       | idle / corrida com busy          | Busy é recusado direto, sem expandir o arranjo da Queue comum |
| child                                           | foreground / background          | Muda a autoridade do modelo e o ciclo de vida das credenciais  |
| permission                                      | approve / deny / skip            | Os três precisam manter o mesmo Turn ocioso                    |
| delivery                                        | desktop continuous / web replayable | Apenas prova de isolamento; sem nova capacidade ociosa no celular |
| família de Provider, tipo de workspace, SO, tema, locale | Não expandido         | Não muda a semântica Core/Adapter compartilhada                |

Os casos aceitos ficam fixados de M4-01 a M4-09; OP03, OP10 do case catalog e a coverage matrix foram sincronizados. O handoff de E2E continua reutilizando o mock gateway de Off-Peak: OPA prova que após o permission ainda se acerta o endpoint idle, OPS prova a herança do Foreground Child e a recusa do background, e OPB prova que a entrada comum do usuário e a conversa após o estado terminal não herdam Provider/Auth/atribuição ociosos. Os demais comportamentos de Config, Registry, Request Auth e Adapter são provados por focused unit/runtime/network tests.

## 23. Resultado da Implementação

### 23.1 Fronteira Final de Comando

Os campos relacionados a modelo enviados pelo Host foram fechados em uma Selection padrão e um contexto de execução estreito:

```text
sendText
├─ modelSelection
│  ├─ providerId
│  ├─ modelId
│  └─ options
└─ modelExecution
   ├─ selectionScope = execution
   ├─ requestAuth
   │  ├─ apiKey?
   │  └─ headers?
   └─ subagents
      ├─ foregroundModel = submission
      └─ background = deny
```

O protocolo estrito recusa Endpoint, Provider Config, Model Config ou properties dentro de `modelExecution`.
`modelExecution` só permite admissão start-now de Session idle; não entra em busy Queue, Guide nem held Queue.

### 23.2 Cadeia de Execução Padrão

```text
Host idle ModelSelection + Request Auth
                    |
                    v
             Core Submission
                    |
                    v
       Provider Registry / ModelFactory
                    |
                    v
             Loop Active Model
              /           \
             v             v
   Automatic Compact   Foreground Child
                         |
                         v
                  Child ModelFactory
```

A Submission com escopo de execução não faz a pré-verificação de modelo da Session e não lê nem corrige warning de restore da Session; ela é validada pela sua própria Selection exata no Registry/ModelFactory padrão. A Submission comum continua com a pré-verificação de modelo da Session original.

### 23.3 Caminho Duplo Removido

As seguintes estruturas de produção e seus testes dedicados foram removidos:

- o snapshot de turno único `turnRuntimeModel` e `ZCodeModelRuntimeConfig`;
- `TurnExecutionModel`;
- `ExecutionScopedModelSource`;
- `runtime-model-factory.ts`;
- `turn-model-overlay.ts` e `turn-execution-model-source.ts`;
- as interfaces de apply, clear e set/restore do Session Facade / V4 Bridge;
- as leituras de snapshot antigo e a montagem de fatos estáticos de modelo por Compact, Subagent e Host.

### 23.4 Mock e Fronteira de Credenciais

O Desktop E2E com `ZCODE_OFFPEAK_MOCK=1` deriva um Official Config de teste a partir do `official.json` oficial, reescrevendo apenas `builtin:offpeak-idle-plan.api.baseURL` para apontar para o mock gateway dentro do processo, e então injeta Host e Worker pelo caminho de Official Config Source. O Endpoint de mock continua pertencendo à Config de teste e não volta para o payload de um Turn isolado.

O ledger de comandos persiste apenas input intent comum, anexos e Selection; o `requestAuth` não entra no input ledger, em conversation event, em snapshot de Session nem em sidecar do repo. O log de produção registra apenas ciclo de vida do comando, IDs e tamanhos; não registra material de autenticação.

### 23.5 Resultados da Verificação

Em 2026-08-24 foram concluídas as seguintes verificações:

- `pnpm typecheck` passou; os builds de Desktop Host, de tipos de E2E e de CLI Contracts/Core/Bootstrap passaram;
- `pnpm lint` passou; o repositório mantém 39 warnings preexistentes sem relação com o M4 e 0 novos erros;
- focused tests do M4: no repositório raiz 5 files / 135 tests e na CLI 7 files / 109 tests, todos passando; antes, Compact com 7 files / 168 tests e Registry/Adapter com 2 files / 19 tests também passaram;
- `test:unit:affected` foi promovido automaticamente à suíte completa de unitários porque a baseline de staging contém arquivos já removidos: 1445 passed de 1454 files, 12.298 tests passed. A única falha relacionada ao M4 era o guarda do M2 ainda permitir o Overlay antigo; após o estreitamento do guarda ela passou numa reexecução isolada. As outras 30 são falhas de baseline do ambiente Linux atual, como ausência de `zip`, notarização macOS e fixtures nativos de CUA incompatíveis;
- o `fmt:check` de todo o repositório continua bloqueado por HTML vendored de Electron e por fixtures GB2312 preexistentes; o `oxfmt --check` dos 65 arquivos alterados nesta rodada passou, e `git diff --check` passou;
- `dep:refs` confirmou as referências vivas de `buildOffPeakRequestAuth`, `ApiProviderModelRuntime` e `applySubmissionExecutionState`; a busca por símbolos de produção do caminho duplo antigo deu zero. O `knip` de todo o repositório e a verificação de integridade do Feature Graph ainda têm drift preexistente fora desta rodada; o nó do M4 em si é totalmente resolvível.
- A reverificação final de fechamento cobriu Adapter, Core lifecycle, Bootstrap, Provider Selection, Services e Desktop Bundle, num total de 10 files / 189 tests; `typecheck:e2e`, a verificação de fixtures do OP10 e a checagem de formatação dos arquivos alterados passaram.

O E2E representativo do OP10 no Desktop foi executado de fato e passou em um ambiente gráfico Xvfb isolado (1 spec / 1 test, 26,5 segundos; artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260824-074156-374`). Esse caso prova, por meio conjunto do mock gateway ocioso e de um proxy de rede com replay do DeepSeek, que o turno pai e o Foreground Child usam a mesma idle Selection e a mesma autenticação de requisição, que o background Child é recusado, que após a conclusão da tarefa ociosa o Prompt comum da mesma Session volta ao Model DeepSeek configurado pelo usuário, e que as requisições reais chegam ao proxy de rede.

Durante a aceitação foram encontrados e corrigidos mais três limites de integração:

- o Protocol Agent lê, assim como a CLI/TUI, a Config de Model Selection de nível Environment; um default configurado explicitamente pode referenciar um Provider hidden, e apenas o fallback do usuário sem escolha explícita pula candidatos hidden;
- o bundle de main/host/scheduler do Desktop faz inline de `@zcode/provider` e `@zcode/provider-node`, evitando que o worker do Electron, em ambiente de execução limpo, resolva arquivos `.js` inexistentes a partir de exports de código-fonte TypeScript;
- o Adapter só consome a Port de runtime-header de conta do Host quando o Active Model está vinculado a `accountAccessId`; um Model api-key comum usa direto o material de acesso estático do Provider Config, e um Model `request-auth` usa a request auth source congelada na criação.

Comando de reprodução:

```text
ZCODE_E2E_CONTAINER=1 \
ZCODE_E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/\
conversation-session-offpeak-subagent-model-inheritance.test.ts \
pnpm --filter @zcode/desktop test:e2e:serial
```