# 14 Zeração Mecânica Final do Provider Refactor

> Status: concluído
>
> Data: 2026-08-25
>
> Tarefas relacionadas: [`04`](./todo-04-core-model-connection-port-retirement.md)、
> [`08`](./todo-08-legacy-model-catalog-retirement.md)、
> [`12`](./todo-12-model-selection-validation-boundary-cutover.md)、
> [`13`](./todo-13-target-host-model-selection-authority.md)
>
> Designs relacionados: [`../design/model/contract.md`](../design/model/contract.md)、
> [`../design/registry/model-creation.md`](../design/registry/model-creation.md)、
> [`../design/execution/execution.md`](../design/execution/execution.md)

## 0. Objetivo da tarefa

Remover os resíduos mecânicos que o design concluído do Provider Refactor deixou na implementação atual e corrigir um Bug claro que viola a fórmula MCS já existente.
Este Todo não cria abstrações novas nem rediscute semântica de produto já confirmada.

```text
Model Config / Registry
        |
        v
Minimal RuntimeModelFactoryInput
        |
        v
Active Model
        |
        +--> Provider message projection
        |      `- force || Model property
        |
        `--> Compact / Memory / Title / Child execution

Released legacy provider storage
        |
        v
Importer-private parser/types
        |
        v
Current Provider Config

Unused compatibility files
        `--> delete
```

Ao final: o Core não passa mais parâmetros inválidos antigos de Config/Capability ao ModelFactory; Full Compact e os demais caminhos de requisição usam a mesma
decisão de MCS; os DTOs antigos de Provider só existem na fronteira privada do Legacy importer; arquivos remanescentes de refactor confirmados sem chamadores são zerados.

## 1. Problemas confirmados e decisões

### 1.1 Full Compact ignora `force MCS`

O design existente já fixou:

```ts
useMidConversationSystem =
  runtime.config.midConversationSystem?.mode === "force" ||
  activeModel.properties.supportsMidConversationSystem;
```

A projeção comum de mensagens de Provider e o Microcompact já usam essa fórmula, mas o Full/Active Compact atualmente lê apenas
`compactModel.properties.supportsMidConversationSystem`. Quando a property do modelo é `false` e o parâmetro de execução é `force`,
a seleção, a estimativa de tokens, as entradas preservadas e a requisição final de compactação do Full Compact usam a forma errada de histórico de mensagens.

Comportamento alvo:

- Full/Active Compact, após obter o `compactModel` desta execução, usa a mesma fórmula das requisições comuns e do Microcompact;
- esse valor booleano é passado uniformemente à seleção de compactação, à estimativa de tokens, à requisição de resumo e ao segmento preservado;
- `force` sobrescreve apenas esta execução, não modifica Model properties e não entra no Model Config;
- o Automatic Compact continua usando o Loop Active Model atual; o Compact manual continua criando um Model conforme sua própria semântica de Submission/Loop;
- não se reintroduz inferência de Provider kind, Endpoint, baseURL ou modelId.

Isto é um Bugfix de contrato existente e não requer nova decisão de produto.

### 1.2 Enrijecer `RuntimeModelFactoryInput`

A interface atual ainda expõe quatro campos antigos que já não são consumidos pelo ModelFactory de produção:

| Campo                      | Fato atual                                          | Decisão |
| -------------------------- | --------------------------------------------------- | ------- |
| `contextWindow`            | as properties do Model no Registry já fornecem o fato completo | remover |
| `properties`               | o chamador não pode sobrescrever os fatos completos de Model do Registry | remover |
| `midConversationSystemMode` | o override de MCS é avaliado na projeção de mensagens de Provider | remover |
| `providerOptions`          | os parâmetros de Provider vêm do reasoningMapping do Model Config | remover |
| `selection`                | entrada de seleção do ModelFactory                   | manter  |
| `visibleMaxOutputTokens`   | ainda participa do cálculo do orçamento de saída visível em fixed-thinking | manter |
| `reasoningMode`            | ainda expressa a intenção de execução de desabilitar reasoning em chamadas auxiliares | manter |
| `requestDependencies`      | ainda vincula dependências desta execução como request-auth | manter |

Este Todo remove apenas os campos comprovadamente inválidos, sem redesenhar por conta própria os três últimos parâmetros de execução válidos. Todos os pontos de chamada do Core removem o repasse correspondente; não se mantém alias deprecated, campo opcional ou parâmetro sem consumidor apenas por compatibilidade.

`RuntimeModelFactoryInput` continua expressando apenas "as entradas necessárias para criar o Model desta execução a partir do Registry" e não pode se tornar outra cópia de Sparse Model
Config, Capability snapshot ou canal de provider options.

### 1.3 DTOs de Legacy Provider saem do contrato público Shared

As referências de produção de `ModelProviderConfig`, `ModelProviderModelConfig`, `ModelProviderModelEntry` e seus helpers de criação/verificação já estão concentradas em:

- `legacyModelProviderStoreReader.ts`;
- `legacyPersonalProviderConfigImporter.ts`;
- a fronteira de injeção de um Legacy reader único do `ProviderConfigRuntime`.

Esses tipos descrevem o Provider store antigo já publicado, não o domínio de Provider atual. A fronteira alvo fica fixada como:

```text
@zcode/shared public contracts
        `- 不再导出 Legacy Provider store DTO/helper

packages/services/src/model-provider/legacy-*
        |- 私有 Legacy serialized types
        |- 私有 normalize/parser/helper
        `- 单向转换为 ProviderConfigLayerUpdate
```

Regras de implementação:

- primeiro listar os chamadores reais de cada export de `model-provider-types.ts` com `pnpm dep:refs` sem scope;
- mover para o módulo privado apenas os tipos e helpers mínimos de que o Legacy reader/importer realmente precisa; esse módulo não é exportado pelo barrel de Services;
- o Shared remove os tipos e helpers antigos de Provider Catalog/store que já não têm consumidor de protocolo, UI, Service ou Runtime atual;
- o comportamento de leitura compatível do Legacy importer é mantido temporariamente, até que a janela de compatibilidade já publicada termine em outro momento; este Todo apenas privatiza e não remove cedo a capacidade de migração de dados do usuário;
- os testes do importer constroem fixtures serialized antigas diretamente; testes de UI e E2E não podem continuar usando o construtor Legacy do Shared para gerar configuração atual;
- se algum export do Shared ainda tiver consumidor real atual, interromper a remoção e definir explicitamente a propriedade, sem duplicar um tipo equivalente para contornar a verificação.

### 1.4 Remover arquivos remanescentes de refactor confirmados sem chamadores

O `knip` atual e a varredura em nível de símbolo já confirmaram que pelo menos os arquivos abaixo não têm chamadores de produção ou de teste:

- `packages/ui/src/lib/zcodeDraftThoughtLevelSync.ts`: helper antigo de sincronização de Model/Thought por string da Draft Session;
- `packages/ui/src/lib/modelInputPresentation.ts`: helper antigo de apresentação que ainda depende do Legacy `ModelProviderModality`;
- `packages/ui/src/settings/OffPeakToolbarSelect.tsx`: seletor exclusivo de período ocioso não usado após o Todo 09.

Na implementação, rodar primeiro `knip`, `rg` e `dep:refs` novamente:

- se as referências ainda forem zero, apagar o arquivo e os testes/exports que existem apenas para ele;
- se o Todo 13 já tiver apagado algum deles antes, este Todo apenas verifica a zeragem e não restaura o arquivo;
- se surgir um novo chamador real, primeiro julgar se o chamador voltou a depender da abstração antiga, em vez de manter mecanicamente algo só porque "alguém usa agora";
- não expandir para este Todo outros ruídos preexistentes do `knip` do repositório inteiro.

## 2. Fora do escopo deste Todo

- Node Config, Host/Agent composition root e único dispose owner do Todo 11;
- migração de validação do Selection Facade/ModelFactory do Todo 12; se o mesmo arquivo do ModelFactory for alterado, coordenar pela ordem de dependências;
- Host alvo, Environment ID, persistência estruturada de produto e exclusão de App temporário do Todo 13;
- Dynamic Request Auth, Runtime Header Refresh, verificação de segurança de versão oficial ou ciclo de vida de credenciais de conta;
- refactors de Telemetry, Status, Context e Observation;
- codificação de Provider Adapter, Reasoning Mapping, MFJS Tool Schema ou novas capacidades de modelo;
- semântica de estado de Queue, Goal, Background, agendamento Off-Peak, desktop continuous, mobile replayable ou remote workspace;
- encerrar a janela de compatibilidade do Legacy importer.

## 3. Impact Brief

### 3.1 Feature Summary

| Campo             | Conclusão                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Developer intent | zerar mecanicamente as abstrações confirmadas de Model/Registry nas fronteiras de tipo, execução e migração |
| Capability       | Model capabilities, ModelFactory, Compact, Legacy Provider import                                              |
| Change layer     | `commit-effect`、`validation`、`persistence boundary`                                                          |
| Operating mode   | implementation-handoff                                                                                         |
| Primary seeds    | `compactActiveConversation`、`RuntimeModelFactoryInput`、`ModelProviderConfig`、os três arquivos de helper UI sem uso |
| Out of scope     | Runtime composition, semântica de produto de Selection, Auth, Telemetry, Queue/Recovery                          |

### 3.2 UI Surface Matrix

| Cenário do usuário     | Entrada de UI        | Owner de estado           | Mudança deste Todo                | Deve permanecer isolado               |
| ---------------------- | -------------------- | ------------------------- | --------------------------------- | -------------------------------------- |
| Requisição de conversa comum | Composer/Session     | Loop Active Model atual   | sem mudança de UI; a fórmula de MCS mantém o comportamento existente | Draft/Selection inalterado             |
| Full/Auto Compact      | Conversation         | Compact + Active Model atual | `force` igual à requisição comum   | semântica de Queue/Timeline/recuperação inalterada |
| Configurações de Provider | Settings           | Provider Config atual     | deixa de depender do Legacy Shared DTO | formulário atual e estrutura de salvamento inalterados |
| Migração de configuração antiga após o start | sem UI direta | Legacy importer           | importação privada unidirecional   | configuração antiga publicada continua legível |
| Edição Off-Peak        | Automation Settings  | rascunho de produto Off-Peak | remove apenas componentes antigos sem chamadores | Selection View com escopo atual inalterado |

### 3.3 Shared And Divergent Behavior

| Ponto de interesse    | Regra compartilhada                      | Diferença a preservar                                  |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------ |
| MCS                   | todas as projeções de requisição usam `force \|\| property` | Full e Micro Compact mantêm seus respectivos algoritmos de compactação |
| Criação de Model      | fatos estáticos vêm apenas do Registry   | execuções auxiliares podem continuar passando parâmetros de execução válidos |
| Legacy persistence    | leitura apenas na fronteira do importer, convertida de forma unidirecional | não altera o Repositório de Config atual |
| UI                   | deixa de referenciar o Legacy Provider DTO | Drafts de produto, commit sinks e controles de cada produto permanecem independentes |

### 3.4 Feature Relationships

| Nível           | De                         | Relação                 | Para                          | Motivo                             |
| -------------- | -------------------------- | ----------------------- | ----------------------------- | ---------------------------------- |
| must-inspect   | Active Model + runtime force | projects-mcs-through | Full Compact                  | onde está o Bug atual              |
| must-inspect   | chamadas de helper do Core | creates-through         | Runtime ModelFactory          | todos os chamadores dos parâmetros inválidos removidos |
| must-inspect   | Legacy store                | imports-through         | Personal Provider Config      | manter compatibilidade de dados publicados |
| should-inspect | barrels/testes do Shared   | exposes/depend-on       | Legacy Provider DTO           | impedir que o contrato antigo continue se espalhando |
| invariant-only | UI de Conversation/Off-Peak | must-not-change        | semântica de Draft/commit     | este Todo não muda estado de produto |
| invariant-only | entrega local/remota       | must-remain-isolated    | runtime continuous/replayable | sem mudança de protocolo ou recuperação |

### 3.5 State Owners And Commit Sinks

| Fato                         | Owner autoritativo                       | Fronteira após este Todo                       |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------- |
| suporte estático a MCS       | Active Model.properties                  | inalterado                                     |
| `force` de MCS                | config de execução do Agent Runtime atual | consumido na projeção de requisição/Compact, não entra no Factory |
| Config estático de Model     | Registry do processo atual               | o chamador não pode sobrescrever via Factory input |
| provider serialized legado   | fronteira privada do Legacy reader/importer | projetado imediatamente como Layer Update atual |
| Provider Config atual        | Service/Repository de Provider Config     | não depende do Legacy Shared DTO              |

### 3.6 Graph Drift Candidates

- o Feature Graph ainda não declara que o Full Compact precisa compartilhar a fórmula de MCS force com as requisições comuns; este Todo adiciona essa invariante e o code seed;
- o nó Provider Registry ainda mantém os code seeds já aposentados `ModelConnectionPort`, `ModelRef` e `AiSdkModelRegistry`. Ao implementar este
  Todo ou na auditoria final do grafo, eles devem ser substituídos pelos seeds atuais de Registry/ModelFactory;
- o code seed de capacidades de modelo do Graph ainda inclui o `modelInputPresentation.ts` confirmado como não usado; deve ser removido após a exclusão.

## 4. Ordem de implementação

### Step A: primeiro os testes que falham e a precisão do Spec

1. nos testes de Compact do Core, adicionar casos de falha de Full/Auto Compact para `property=false + mode=force`;
2. afirmar que a seleção, a estimativa de tokens, o histórico preservado e a requisição final ao Provider usam o mesmo fato booleano de MCS;
3. atualizar o spec atual de MCS/Compact, explicando que a correção cobre o Full Compact;
4. estabelecer testes estruturais para a fronteira privada do Legacy importer, provando primeiro que os exports do Shared e as dependências de UI/E2E precisam sair.

### Step B: corrigir o Full Compact

1. em `compactActiveConversationImpl()`, calcular a fórmula unificada após obter o `compactModel`;
2. reutilizar o mesmo booleano para todas as projeções dentro do Compact, sem repetir a inferência em helpers a jusante;
3. manter a implementação atual das requisições comuns e do Microcompact;
4. remover o repasse de `midConversationSystemMode` ao ModelFactory.

### Step C: enrijecer o contrato do Runtime ModelFactory

1. remover os quatro campos inválidos de `RuntimeModelFactoryInput`;
2. remover o repasse inválido nos pontos de chamada de Turn, Compact, Memory, Title e Verifier;
3. manter e testar regressão de `visibleMaxOutputTokens`, `reasoningMode` e `requestDependencies`;
4. coordenar com o Todo 12 as alterações no mesmo arquivo de `ApiProviderModelRuntime`, garantindo que a validação final venha antes da criação do Model;
5. adicionar uma verificação estática de zeragem que proíba passar novamente Sparse properties/providerOptions ao Factory.

### Step D: privatizar o contrato de Legacy Provider

1. usar `dep:refs --list-exports` e varredura símbolo a símbolo para determinar o conjunto mínimo;
2. criar no diretório Legacy de Services os DTO/parser/helper serialized não exportados;
3. migrar o Legacy reader, o importer, a injeção de runtime e os testes especializados;
4. remover do Shared os exports, helpers e testes correspondentes que só validam tipos públicos antigos;
5. fazer os fixtures de UI/E2E usarem fixtures de Config atuais e, quando for realmente preciso validar a migração, escrever o JSON antigo direto;
6. manter o resultado da conversão de dados antigos para o Config atual exatamente igual.

### Step E: remover código morto e a aceitação mecânica

1. revisar e apagar os arquivos confirmados sem uso;
2. limpar barrels, mocks, fixtures, comentários e seeds obsoletos do Feature Graph;
3. rodar os comandos de zeragem, os testes especializados e os gates obrigatórios do repositório;
4. atualizar o status do Todo e o roadmap e então submeter um Conventional Commit independente.

## 5. Accepted Cases

| Case ID | Setup                                     | Action                    | Assertions                                     |
| ------- | ----------------------------------------- | ------------------------- | ---------------------------------------------- |
| MZ-01   | Model MCS=false, runtime mode=force       | Full Compact              | toda a cadeia seleciona, estima e requisita pela forma MCS |
| MZ-02   | Model MCS=false, runtime mode=auto        | Full Compact              | mantém a forma legada de lembrete ao usuário    |
| MZ-03   | Model MCS=true, runtime mode=auto         | Full Compact              | requisita pela forma MCS                        |
| MZ-04   | Automatic Compact com Active Model A       | Registry atualiza para B e dispara | continua usando A e o force do runtime atual     |
| MZ-05   | cada ponto de chamada do ModelFactory no Core | Typecheck/teste unitário | não passa mais os quatro campos inválidos      |
| MZ-06   | fixed-thinking / execução auxiliar / request-auth | cria e chama o Model     | comportamento dos três parâmetros de execução válidos inalterado |
| MZ-07   | fixture de Legacy Provider store já publicado | inicia o importer         | resultado da conversão igual ao pré-migração e sem DTO antigo no Shared |
| MZ-08   | Provider/Model Config atual                | start normal e leitura de configurações | não entra em parser/tipo Legacy                |
| MZ-09   | três arquivos candidatos mortos            | knip + dep:refs + remoção | sem resíduo de produção, teste, barrel ou entrada dinâmica |

Este Todo não adiciona novas combinações de estado de conversa nem exige alteração da máquina de estados do Formal Proof; MZ-01 a MZ-04 são provados por testes unitários/de integração do Core. Como não há novo comportamento de UI, não se adiciona E2E de Desktop; apenas se rodam as regressões existentes de Provider/Compact afetadas.

## 6. Zeragem mecânica e verificação

### 6.1 Deve chegar a zero

```text
RuntimeModelFactoryInput.contextWindow             = 0
RuntimeModelFactoryInput.properties                = 0
RuntimeModelFactoryInput.midConversationSystemMode = 0
RuntimeModelFactoryInput.providerOptions            = 0

Core createRuntimeModel() 调用中的上述字段          = 0
Shared 当前公共出口中的 Legacy Provider store DTO  = 0
UI 当前实现对 ModelProviderModality 的依赖          = 0
zcodeDraftThoughtLevelSync.ts                       = deleted
modelInputPresentation.ts                           = deleted
OffPeakToolbarSelect.tsx                            = deleted
```

Strings como `ModelProviderConfig` podem continuar existindo em nomes de tipos privados do importer; o alvo da zeragem é o contrato público Shared/de negócio atual,
e não proibir que o Legacy parser modele o JSON já publicado.

### 6.2 Deve ser executado

- testes unitários de MCS, Full Compact, Microcompact e ciclo de vida de Model do Core;
- testes unitários do Bootstrap de Model runtime do Provider Registry e de request-auth;
- testes unitários do Legacy reader/importer de Services;
- testes afetados de fixtures de Provider do Shared, da UI e do Desktop;
- revalidação sem scope de `pnpm dep:refs` para cada export do Shared a ser removido;
- `pnpm knip`, exigindo apenas que os arquivos/exports alvo deste Todo não apareçam mais, sem disfarçar resultados preexistentes do repositório inteiro como regressão deste Todo;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm fmt:check`;
- `pnpm test:unit:affected`.

## 7. Definição de conclusão

1. Full/Auto Compact, Microcompact e requisição comum de Provider usam a mesma fórmula de MCS force;
2. `force` não modifica Model properties nem entra no Model Config ou no ModelFactory;
3. o Runtime ModelFactory recebe apenas campos que ainda têm semântica de consumo real;
4. o Core não pode sobrescrever via Factory input o context, as properties ou as provider options do Registry;
5. os tipos e helpers do Legacy Provider store deixam de ser contrato público de Shared, Protocol, UI, Runtime ou testes;
6. a configuração de Legacy Provider já publicada ainda migra de forma unidirecional para o Config atual;
7. os três arquivos confirmados sem uso e suas referências estão todos zerados;
8. Todo 11–13, Dynamic Auth, Telemetry, Queue/Recovery e semântica de Remote não foram modificados por efeito colateral;
9. os testes especializados e os gates obrigatórios passam, e o resultado é submetido como Conventional Commit.

## 8. Resultado da implementação

- Full/Auto Compact calcula apenas uma vez, após obter o `compactModel` desta rodada,
  `mode === "force" || model.properties.supportsMidConversationSystem`; seleção, estimativa, summary request e
  histórico preservado compartilham esse fato booleano; novo teste de regressão para `property=false + force`;
- `RuntimeModelFactoryInput` mantém apenas `selection`, `visibleMaxOutputTokens`, `reasoningMode` e
  `requestDependencies`. Todos os pontos de chamada do Core removeram o repasse de `contextWindow`, `properties`,
  `midConversationSystemMode` e `providerOptions`; o Factory de teste também passa a simular os fatos do Registry a partir do próprio Model;
- os DTOs, parser e helpers do Provider Store antigo publicado foram movidos para o
  `legacyModelProviderSerialized.ts` privado de Services; os exports públicos do Shared e os testes de tipos públicos antigos foram removidos; o Legacy reader/importer mantém a
  capacidade de migração unidirecional;
- `zcodeDraftThoughtLevelSync.ts`, `modelInputPresentation.ts`, `OffPeakToolbarSelect.tsx` e, junto com o Todo 13, os antigos helpers de preferência de modelo, Snapshot e Runtime Catalog comprovadamente
  sem chamadores foram removidos;
- no Feature Graph, `ModelConnectionPort`, `ModelRef`, `AiSdkModelRegistry` e o seed de capacidade antigo foram substituídos pelas entradas atuais de
  Registry/ModelFactory/Active Model;
- `dep:refs` prova que os DTOs Legacy têm apenas consumidores privados do importer; `knip` não reporta mais os arquivos alvo deste Todo, e a baseline de
  unused preexistente do restante do repositório não entra no escopo de expansão deste Todo.

Os resultados dos testes especializados de Core, Bootstrap, Services, Shared, UI e Desktop, do TypeScript e dos gates do repositório ficam registrados no commit deste Todo.
