# 12 Convergência da fronteira de validação da seleção de modelo

> Status: concluído
>
> Data: 2026-08-25
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Designs relacionados: [`../design/registry/registry.md`](../design/registry/registry.md), [`../design/registry/model-creation.md`](../design/registry/model-creation.md)

## 0. Objetivo confirmado

A validação autoritativa da Model Selection acontece na fronteira em que a task realmente começa a executar e o `ModelFactory` se prepara para construir o Model. O Facade do usuário é responsável apenas por fornecer candidatos visíveis ao usuário e deixa de atuar também como validador de execução interna.

```text
用户候选

ModelSelectionFacade
|- getView()
`- onDidChange()
        |
        v
visible Provider / Model


执行事实

提交任务携带 ModelSelection
        |
        v
当前 Agent 进程 Provider Registry
        |
        v
validateSelection()
        |
        v
ModelFactory 构建 Model
```

Off-Peak usa a mesma semântica do Registry para validação antecipada na criação, na edição e antes do despacho: a validação na criação acontece antes de solicitar o Ticket, e a validação no despacho impede que a configuração fique inválida durante a fila; nenhuma dessas checagens substitui a validação final do ModelFactory. Visibility afeta apenas os candidatos do usuário, não é permissão e não gera conceitos novos como `trusted` ou `execution-only`.

## 1. Problema atual

1. `ModelSelectionFacade.getView()` filtra Provider/Model ocultos, mas `validate()` delega diretamente ao Registry completo; a mesma Facade expressa ao mesmo tempo a semântica de candidato para o usuário e a semântica de execução interna precisa;
2. A UI comum hoje consome apenas `getView()`/`onDidChange()`, e as chamadas de produção de `IModelSelectionService.validate()` são principalmente o despacho de Off-Peak no Desktop, o que na prática transformou isso num atalho interno usado por Provider oculto;
3. `ApiProviderModelRuntime.modelFactory` hoje apenas localiza Provider/Model com precisão e não chama, na entrada de construção, a validação de Selection options do Registry (reasoning level, max output tokens etc.);
4. A outra cadeia de criação/edição de Off-Peak já usa a validação precisa do Registry diretamente, então hoje existem duas entradas de validação no mesmo produto.

## 2. Princípios e pontos de mudança

### A. A Facade do usuário aposenta a validação de execução

- Remover `ModelSelectionFacade.validate()`;
- Remover `IModelSelectionService.validate()` e o adapter RPC, o stub Home-only, os mocks e os testes correspondentes;
- Remover de `ProviderRegistryFacadeSource` o `validateSelection()` exposto apenas para a Facade;
- Manter o `validateSelection()` de `ProviderRegistryService` / `ProviderRegistry` para uso do ModelFactory e de produtos internos;
- A Facade mantém apenas a View de candidatos do usuário e o evento de mudança;
- Não deixar o Renderer duplicar um conjunto autoritativo de validação de options a partir da View.

### B. O ModelFactory passa a ser a fronteira de validação final

- `ApiProviderModelRuntime.modelFactory` valida o `ModelSelection` de forma completa com o Registry do processo atual antes de ler e congelar os fatos de Provider/Model;
- Provider/Model inexistente, Reasoning Level não suportado e Max Output Tokens fora dos limites falham de forma fechada antes da criação do Model;
- Extrair do helper de selection do Registry o mapeamento compartilhado `ModelSelectionValidation -> ModelProtocolError`;
- `provider-not-found` mapeia para `ProviderNotFound`, `model-not-found` mapeia para `ModelNotFound` e erros de option mapeiam para `InvalidModelRequest`; o ModelFactory e a resolução de Selection existente não podem manter dois `switch` separados;
- Não reutilizar diretamente o helper de fallback que devolve `undefined` para `provider-not-found`; o ModelFactory precisa falhar explicitamente;
- Modelos ocultos, mas completos e enabled, continuam no Registry e podem ser criados normalmente por uma Selection interna precisa;
- Cada Model de execução raiz recém-criado passa pela mesma fronteira do ModelFactory; `Model.bind()` e o Automatic Compact que reutiliza o Model Active atual herdam fatos já validados e congelados, sem consultar o Registry de novo.

### C. Off-Peak mantém a checagem antecipada e estreita

- O Off-Peak do Desktop não chama mais o `IModelSelectionService.validate()` do usuário;
- Reutilizar a dependência de resolução completa do Registry já existente em `OffPeakTaskServiceDeps.resolveModelSelection`; se o Desktop Host precisar chamar, fornecer o método de validação de despacho privado do Host apenas no `OffPeakTaskService` concreto, sem entrar na interface RPC do Renderer;
- Não criar Registry Service, RPC ou um Validation Service genérico com estado próprio;
- Na etapa de criação, validar antes de `takeTicket()`; na etapa de edição, validar antes de persistir; na etapa de despacho, revalidar antes de iniciar o Agent turn;
- A falha da checagem antecipada no despacho continua formando `OffPeakModelUnavailableError` e permanent dispatch failure;
- Depois de aprovada a checagem antecipada, a validação final é executada novamente quando o Model de tempo ocioso é realmente construído, evitando que o Registry tenha mudado durante a espera do despacho.

### D. Não alterar o estado de seleção

- Não modificar Composer Draft, App Recent, Configured Default ou Session Selection;
- Não alterar a resolução de candidatos do Configured Default/fallback;
- Não alterar o protocolo nem a estrutura de persistência da Model Selection;
- Não alterar a ordenação, o agrupamento ou o filtro de ocultos da UI de candidatos;
- Não alterar a semântica de Desktop continuous, Mobile replayable, remote workspace, Queue ou recuperação.

## 3. Impact Brief

| Campo              | Conclusão                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Developer intent  | Remover a semântica de validação de execução interna da Facade do usuário e devolver a validação autoritativa à fronteira de construção do Model |
| Capability        | Model Selection, Provider Registry, ModelFactory, Off-Peak execution                                         |
| Change layer      | `validation`, `commit-effect`                                                                                |
| Operating mode    | planning / implementation-handoff                                                                              |
| Primary seeds     | `ModelSelectionFacade`, `IModelSelectionService`, `ApiProviderModelRuntime.modelFactory`, `dispatchOffPeakRun`  |
| Out of scope      | UI de candidatos, estado de seleção, persistência, Access/Auth, Runtime composition, Telemetry              |

### 3.1 Matriz de superfície de UI

| Cenário do usuário                   | Origem dos candidatos            | Ponto de envio                        | Validação final                                        | Mudança visível neste Todo |
| ------------------------------------ | -------------------------------- | ------------------------------------- | ------------------------------------------------------- | ------------------------- |
| Escolher modelo em conversa comum    | `ModelSelectionFacade.getView()` | Submission / Session                  | Agent Registry + ModelFactory                           | Nenhuma                    |
| Automation/Subagent/Repo Wiki        | Mesma View de candidatos, cada um com Draft próprio | Suas configurações/comandos de envio existentes | Na criação real do Model                 | Nenhuma                    |
| Modelo oculto de Off-Peak            | Configuração interna do produto/Selection precisa | Off-Peak dispatch                    | Checagem antecipada no Registry + validação final no ModelFactory | Nenhuma   |

### 3.2 Relações e owners

| Nível           | Relação                                  | Requisito                                                             |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| must-inspect    | Facade -> Services/RPC/mocks             | Remover `validate()` em toda a cadeia, sem implementação vazia        |
| must-inspect    | ModelFactory -> Registry                 | Executar a validação completa de Selection antes de construir, com mapeamento de erro compartilhado |
| must-inspect    | Off-Peak dispatch -> Registry            | Reutilizar o resolver existente e preservar a permanent failure        |
| should-inspect  | Client/Remote service proxy              | Após o estreitamento da interface, proxies, Bot e a montagem do remote workspace continuam válidos |
| should-inspect  | Configured Default/fallback              | A resolução antecipada existente não substitui a validação final e o comportamento não muda |
| invariant-only  | Toda UI de seleção de modelo             | Candidatos, Draft, commit sink e persistência inalterados              |
| invariant-only  | Desktop/Mobile/Remote                    | delivery, Queue, Recovery e identidade de workspace inalterados        |

O ambiente atual não tem uma interface de codegraph chamável. A superfície de impacto é evidenciada pelo Feature Graph, `dep:refs`, varredura precisa de chamadas e o código-fonte alvo; antes da implementação, reexecutar a descoberta de referências zeradas e dos testes afetados.

## 4. Casos aceitos e podas

| Case ID | Setup                                    | Action                        | Assertions                                           |
| ------- | ---------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| MSV-01  | Provider/Model visível                   | Envio normal e criação do Model | A validação do Registry passa e o Model é criado uma vez |
| MSV-02  | Provider ou Model desapareceu do Registry atual | Início da construção do Model | Retorna erro estável de Provider/Model antes da criação |
| MSV-03  | Option de Reasoning ou Max Output inválido | Início da construção do Model | Retorna `InvalidModelRequest` antes da criação, sem entrar no Adapter |
| MSV-04  | Provider de Off-Peak oculto, completo e enabled | Despacho e construção do Model | Checagem antecipada e validação final passam, e a View do usuário continua invisível |
| MSV-05  | Registry muda após a checagem antecipada de Off-Peak | Construção final do Model | O ModelFactory falha de forma fechada conforme o Registry mais recente |
| MSV-06  | UI de candidatos de modelo comum         | Ler e trocar candidatos      | View, estado de seleção e comportamento de envio inalterados, sem chamar o validate da Facade |
| MSV-07  | Model Active já criado e validado        | `bind()` ou Automatic Compact | Herda fatos congelados, sem reler o Registry atual    |

Podas: não expandir a superfície de UI × API de Provider, pois este Todo não altera candidatos nem a codificação do Adapter; não adicionar E2E em grande escala. Os testes unitários de fronteira do ModelFactory comum e do Off-Peak bastam para provar o comportamento central, e os E2E representativos de UI/Off-Peak já existentes servem apenas como regressão.

## 5. Implementação e aceitação

1. Atualizar primeiro no Design formal as responsabilidades de validação da Facade e do ModelFactory;
2. Escrever primeiro os testes de fail-closed de options do ModelFactory, de criação precisa de ocultos, de Model vinculado sem nova consulta ao Registry e de permanent failure do Off-Peak;
3. Extrair o mapeamento compartilhado Validation -> Protocol Error e completar a validação final do ModelFactory;
4. Fazer o despacho de Off-Peak reutilizar `OffPeakTaskServiceDeps.resolveModelSelection` e remover a chamada à Facade do usuário;
5. Remover `validate()` da Facade/Service, `ProviderRegistryFacadeSource.validateSelection()` e todas as implementações placeholder;
6. Usar `rg` e `dep:refs` para confirmar que as seguintes referências de produção zeraram:

```text
ModelSelectionFacade.validate
IModelSelectionService.validate
modelSelectionService.validate
ProviderRegistryFacadeSource.validateSelection
```

7. Executar os testes unitários afetados de Provider, Services, Bootstrap, Client, Server, Desktop e Web; cobrindo explicitamente `RemoteServiceAccess`, o proxy remoto do Bot, a service collection do remote workspace e o stub Home-only da Web, além de:

```text
pnpm typecheck
pnpm lint
pnpm fmt:check
```

8. Ao concluir, reescrever o status do Todo e o resultado da implementação no documento, e submeter com Conventional Commit.

## 6. Fora de escopo

- Não modificar visibility, enabled, membros ou Overlay de Provider/Model;
- Não interpretar hidden como permissão ou identidade confiável;
- Não alterar a persistência da Model Selection nem o ciclo de vida da Session;
- Não gravar a Selection de Off-Peak na Session Selection comum;
- Não tratar a composição do Provider Runtime;
- Não refatorar Access, Request Auth, Telemetry, Queue ou Recovery.

## 7. Resultado da implementação (2026-08-25)

- `ModelSelectionFacade` e o `IModelSelectionService` entre Hosts tiveram o `validate()` geral removido, e o stub Home-only da Web, os testes e o Facade Source zeraram em conjunto;
- `ApiProviderModelRuntime.modelFactory` valida a Selection de forma completa com o Registry do Agent atual antes da criação do Adapter, compartilhando o mapeamento único `ModelSelectionValidation -> ModelProtocolError` com o resolver de selection do Registry;
- Provider/Model ausente mapeia de forma estável para `ProviderNotFound` / `ModelNotFound`, e reasoning e max output inválidos mapeiam para `InvalidModelRequest` antes do Adapter;
- Provider/Model ocultos, completos e enabled continuam sendo criados normalmente pelo Registry preciso;
- O despacho de Off-Peak passou a usar a checagem estreita do `OffPeakTaskService.validateDispatchModelSelection()` concreto, com criação/edição ainda reutilizando o mesmo resolver e a validação final do ModelFactory inalterada;
- A varredura de zeragem não encontrou resíduo de `ModelSelectionFacade.validate`, `modelSelectionService.validate` ou `validateSelection` do Facade Source; os testes específicos de Provider, Services, Web e Bootstrap e o `pnpm typecheck` da raiz passaram.