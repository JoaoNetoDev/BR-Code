# 16 Eliminação dos Resíduos de Abstração de Model Não Planejados

> Status: concluído
>
> Data: 2026-08-25
>
> Origem da revisão: reexame do diferencial das abstrações antigas após a conclusão do Provider Refactor
>
> Tarefas relacionadas: [`01`](./todo-01-core-model-adapter-boundary-cleanup.md)、
> [`08`](./todo-08-legacy-model-catalog-retirement.md)、
> [`13`](./todo-13-target-host-model-selection-authority.md)、
> [`14`](./todo-14-post-refactor-mechanical-zero.md)
>
> Designs relacionados: [`../design/model/contract.md`](../design/model/contract.md)、
> [`../design/model/model.md`](../design/model/model.md)、
> [`../design/registry/model-creation.md`](../design/registry/model-creation.md)、
> [`../design/registry/registry.md`](../design/registry/registry.md)、
> [`../design/registry/runtime.md`](../design/registry/runtime.md)、
> [`../design/interaction/interaction.md`](../design/interaction/interaction.md)、
> [`../design/interaction/selection-state.md`](../design/interaction/selection-state.md)

## 0. Posicionamento da tarefa

Este documento reúne apenas os resíduos de abstrações antigas de Model/Provider confirmados na revisão de código de 2026-08-25 e que ainda não estão explicitamente cobertos pelos Todos 11–15.
O Target Host planejado pelo Todo 13, o `ModelSelection` estruturado, o App temporário e a antiga cadeia de seleção por string, assim como o MCS, o `RuntimeModelFactoryInput`, o DTO de Legacy Provider Store e os arquivos mortos conhecidos planejados pelo Todo 14, não são replanejados aqui.

Este Todo não cria novas abstrações de domínio. Todas as mudanças são correções de lacunas em designs existentes ou a redução a zero de contratos públicos:

```text
Target Host / Submission
        |
        v
ModelSelection
        |
        v
Required ModelFactory
        |
        v
Active Model.properties/options
        |
        v
Adapter private execution

Legacy serialized config
        |
        v
Importer-private parser/types
        |
        v
Current Personal Provider / Model Config
```

## 1. Problemas confirmados e decisões

### 1.1 Remover a falsa Model Selection e o ModelFactory opcional do Core

Atualmente `AgentRuntimeDeps.modelFactory` ainda é opcional; o `AgentRuntime` fabrica `zcode-unconfigured/missing-model` quando `config.modelSelection` está ausente, e os Contracts ainda exportam publicamente o `DEFAULT_MODEL` de mesmo valor. Isso é inconsistente com o limite de produção já confirmado no Todo 01: todo Model de execução raiz deve vir de um ModelFactory oficial, e o Core não pode fabricar Model falso, Selection falsa ou Model de fallback.

Decisão:

- A construção de produção do `AgentRuntime` precisa obter um `RuntimeModelFactory`; no tipo, passa a ser obrigatório;
- O `AgentRuntimeConfig` de produção precisa obter um `ModelSelection` estruturado; a initial selection do Target Host planejado pelo Todo 13 é quem a fornece;
- Remover `zcode-unconfigured/missing-model`, `DEFAULT_MODEL` e a resolução, exibição e asserções de teste construídas ao redor deles;
- Remover do Runtime os ramos de execução tardia que só podem ser acionados quando o ModelFactory não está configurado;
- Testes de nível baixo injetam explicitamente um Fake ModelFactory ou um Unavailable ModelFactory e fornecem explicitamente a Selection de teste;
- Não criar novos tipos `stateOnly`, `unconfigured`, `default` ou Model sentinel;
- `Model.bind()` continua sendo um caminho legítimo para derivar um Model vinculado a partir de um Active Model existente; este item não o afeta.

Este item depende de o Todo 13 remover antes o App temporário/state-only Runtime de produção; se, na implementação, ainda for descoberto que a construção de produção não consegue obter a Selection do Target Host planejado, é preciso voltar ao Todo 13 e corrigir a origem, sem manter uma Selection falsa de fallback.

### 1.2 Remover o estado redundante `reasoning.enabled`

Atualmente o `ZCodeModelReasoningOptions` do Protocol tem simultaneamente `enabled` e `levels`, mas o Mapper de produção só cria esse objeto quando existe uma Reasoning Option Spec e sempre escreve `enabled: true`. A existência da capacidade de seleção de Reasoning já é expressada de forma completa pela existência do objeto/Option Spec; o booleano adicional não tem estado independente.

Decisão:

- Remover `enabled` de `zcodeModelReasoningOptionsSchema` e de `ZCodeModelReasoningOptions`;
- O Bootstrap Mapper, o Agent Model State, a UI Projection e os testes deixam de ler ou gerar esse campo;
- `reasoning === undefined` significa não haver opções de Reasoning; quando presente, usar seu `levels/defaultLevel`;
- Não substituir por levels vazios, enum desabilitado ou outro campo booleano;
- O Legacy importer pode manter a leitura do campo antigo publicado `reasoning.enabled`, mas apenas como entrada privada do importer, projetada imediatamente como a Regra atual de Personal Model Config;
- Não alterar `ModelSelection.options.reasoningLevel`, os valores padrão da Option Spec nem o `reasoningMapping` do Adapter.

### 1.3 Remover os DTOs antigos de Provider sem referência no ZCode Protocol

`packages/shared/src/zcode-protocol/index.ts` ainda expõe publicamente um conjunto de Schemas antigos de entrada/saída de Provider sem consumidores de produção, incluindo:

- `ZCodeModelProviderKind`;
- `ZCodeModelProviderSource`;
- `ZCodeModelProviderModel`;
- `ZCodeModelProviderConfig`;
- `ZCodeModelProviderInput`;
- os Secret Input/Ref, API Format e Schema usados apenas pelos DTOs acima;
- campos antigos como `models-dev`、`apiKeyRequired`、`providerOptions`、`modelsDevProviderId`.

Decisão:

- Primeiro reexame cada export com `pnpm dep:refs` para confirmar zero referência e então remover diretamente os Schemas, os tipos e os testes que servem apenas a eles;
- Não migrá-los para outro arquivo Shared, nem adicionar alias deprecated;
- Manter o `ZCodeAccountAccess` atualmente em uso e seu Schema independente; não removê-lo por proximidade do arquivo de origem;
- Se algum DTO antigo for usado apenas por fixture de teste, fazer o fixture usar o contrato atual de Provider Config;
- Se houver consumidor real do Legacy importer, mover apenas o formato serializado mínimo necessário para o módulo privado do importer, sem restaurar o protocolo público.

### 1.4 Recolher o Legacy CLI Model Config para a fronteira privada do importer

Os Contracts ainda expõem `ModelProviderKind`、`ModelTargetConfig` e `RuntimeModelConfig`. Eles descrevem o formato antigo do CLI, `main/lite/available`、`kind/baseURL/apiKey/apiKeyRequired/headers/providerOptions`, hoje servindo apenas ao importer de Personal Config do Legacy CLI, e não pertencem ao domínio oficial de Runtime ou Provider.

Decisão:

- Mover para o diretório privado do Legacy CLI importer o DTO serializado mínimo de que ele realmente precisa, o parser Zod e o helper de normalização;
- Os tipos privados não podem ser exportados pelos barrels de Contracts, Adapters, Bootstrap ou Services;
- Após ler os arquivos Legacy, converter imediatamente para as Regras atuais de Personal Provider Config / Personal Model Config;
- Runtime, Registry, ModelFactory, UI e a nova persistência não podem tocar os DTOs antigos;
- Manter a leitura compatível das configurações antigas do CLI já publicadas, sem encerrar a janela de compatibilidade neste Todo;
- Os testes do importer constroem diretamente o fixture JSON antigo, sem reexpor os tipos antigos por causa dos testes.

### 1.5 Remover o segundo canal de fatos do Model no Runtime

O Todo 14 já exigiu a remoção de campos inválidos como `contextWindow/properties/providerOptions` do `RuntimeModelFactoryInput`, mas o `AgentRuntimeConfig` atual ainda guarda e propaga `modelProviderOptions`, e caminhos de execução como o Compact ainda fazem fallback de `AgentRuntimeConfig.contextWindow/maxOutputTokens` para o Active Model. Se apenas os argumentos do Factory forem limpos, o canal antigo continuará existindo dentro do Runtime.

A atribuição de fatos existente já está suficientemente clara:

```text
Fatos estáticos de execução       -> Active Model.properties
Opções vinculadas de execução     -> Active Model.options
Intenção futura de seleção        -> ModelSelection
Exibição ociosa/padrão de展示       -> Target Host ModelSelectionView
```

Decisão:

- Remover `AgentRuntimeConfig.modelProviderOptions`, o repasse de mesmo nome em Title/Memory/Compact/Workflow/Subagent, os getters, os atualizadores e os testes que validam apenas esse canal;
- Requisições normais, Microcompact, Compact Completo/Reativo, Memory, Title, Goal e Child Agent, após obter o Model desta rodada, leem apenas `Model.properties.contextWindow` e `Model.options.maxOutputTokens`;
- Os caminhos de execução acima não podem usar `runtimeConfig ?? model` nem `model ?? runtimeConfig` como fallback; se a semântica exigir o Model de execução, mudar o Model para obrigatório no tipo e criá-lo na fronteira de chamada;
- Eventos de execução como `model.selected` projetam os fatos do Model a partir do Model realmente criado, não copiando do Runtime Config;
- A exibição de Model em estado ocioso e o default configurado são fornecidos pela View do Target Host do Todo 13, sem resolver o problema mantendo uma cópia no Runtime;
- Concluída a migração dos consumidores, se `AgentRuntimeConfig.contextWindow/maxOutputTokens` já não tiver semântica independente e não-execução, removê-lo diretamente;
- Se ainda for encontrado um consumidor real não-execução, é preciso provar sua origem autoritativa e seu ciclo de vida e convertê-lo em um DTO explícito e de escopo estreito; ele não pode continuar participando de requisições de Model, Compact ou criação de ModelFactory.

Isso não altera `ModelSelection.options.maxOutputTokens`: ele continua expressando a intenção explícita de escolha do usuário; o valor final preenchido pelo ModelFactory a partir das Option Specs existe apenas em Active Model.options.

### 1.6 Corrigir os documentos de design antigos ainda tratados como fatos atuais

Os documentos atuais têm dois tipos de problema: um deles ainda descreve Catalog, models.dev, inferência de Provider/modelId ou capability de mídia achatada; o outro, embora já tenha entrado no Provider Refactor Design, ainda escreve as relações antigas de Registry/Model como contrato atual.

O primeiro tipo inclui:

- `apps/zcode-cli/docs/design/v2/model/model-capability-resolution.md`;
- `docs/chat/manual-model-switch-resolution-chain.md`;
- `docs/model-request-output-tokens.md`;
- `docs/compact-media-capability-projection.md`;
- os antigos nós de Catalog/Modality em `apps/dev-docs/src/data/productCapabilityMap.ts`.

O segundo tipo inclui:

- `design/model/model.md` ainda usa `registry.createModel()` como entrada direta e faz o `Model` público expor `providerConfig/modelConfig`;
- `design/interaction/interaction.md`、`design/registry/registry.md` e `design/registry/runtime.md` ainda desenham `createModel(selection)` como um método do próprio índice do Provider Registry;
- essasformulações são inconsistentes com o contrato de `Model` atual e com os limites confirmados em `design/registry/model-creation.md`.

A única relação correta atualmente é:

```text
Provider Registry
├─ lookup
└─ validate
      |
      v
ModelFactory
      |
      v
Adapter private createModel
      |
      v
Active Model
├─ identity
├─ properties
├─ optionSpecs
├─ options
└─ generateText / streamText
```

O `RegistryProviderConfig/RegistryModelConfig` completo é a entrada privada de criação que o ModelFactory entrega ao Adapter, não um campo consultável do `Model` público. `Model.bind()` continua sendo uma entrada legítima para derivar um Model vinculado a partir de um Model existente.

Decisão:

- Os documentos que ainda servem de entrada do design atual são reescritos como Provider Config + Model Config Rules + Registry + ModelFactory + Active Model;
- Documentos puramente históricos são marcados claramente como historical/retired no título e na abertura, com link para o Design atual;
- Remover formulações normativas que fariam o leitor continuar implementando Catalog, fallback de models.dev, hardcode de modelId ou capability map;
- Não apagar do repositório inteiro planos históricos, registros de migração e evidências de arqueologia Git; o material histórico precisa apenas deixar claro que não pode servir de base para a implementação atual;
- Corrigir em conjunto o mapa de capacidades da documentação de desenvolvimento, evitando relistar arquivos já aposentados como owner atual.

### 1.7 Restringir projeções inválidas do Protocolo atual de Model Option

Além dos DTOs antigos de Provider, o `zcodeModelOptionSchema` atual ainda mantém um conjunto de campos que não formam semântica de produto válida:

- `providerSource` e `providerLogoUrl` não têm produtor nem consumidor em Renderer/Services;
- `supportsTools` e `supportsStructuredOutput` são gerados pelo Bootstrap de forma achatada a partir das Model Properties completas, mas o Renderer não os consome; eles formam ao mesmo tempo uma segunda projeção de capability fora de `Model.properties`;
- os campos de mesmo nome no antigo `zcodeModelProviderModelSchema` são removidos integralmente como os DTOs antigos de Provider do item 1.3, sem se misturarem ao `zcodeModelOptionSchema` atual como justificativa de compatibilidade.

Decisão:

- Remover `providerSource`、`providerLogoUrl`、`supportsTools` e `supportsStructuredOutput` do `zcodeModelOptionSchema/ZCodeModelOption` atual;
- Remover o DTO `ZCodeModelOption` duplicado dentro do Bootstrap e as projeções intermediárias; manter a única projeção direta necessária do Registry para o Protocolo atual e remover esses campos inválidos e seus testes exclusivos;
- Não mover `supportsTools/supportsStructuredOutput` para outro conjunto de DTOs de exibição; se houver um cenário real de UI no futuro, projetar primeiro a menor projeção possível com base no contrato atual de Model Properties;
- Manter o contrato de Protocolo de mesma estrutura para `properties.input_format/output_format`; este item não volta a campos de mídia achatados;
- `ref`、`label`、`providerLabel`, as opções de Reasoning e os fatos de exibição de context/output, que já têm consumidores reais, não são afetados;
- Antes da implementação, executar novamente uma varredura de referências de todo o repositório para confirmar que os campos não ganharam novos consumidores reais de trabalhos concorrentes.

### 1.8 Remover o hardcode de nome de exibição de Built-in Provider no Bootstrap

`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/model-mapper.ts` ainda mantém `BUILTIN_PROVIDER_LABELS`, com os nomes de exibição de Z.AI、BigModel、ZAPI etc. hardcoded por Provider ID. Essa é a segunda fonte estática de metadados de Provider fora da ZCode Built-in Provider Config.

Decisão:

```text
Registry Provider Config.label
              |
              v
Protocol providerLabel

label ausente -> providerId
```

- Remover `BUILTIN_PROVIDER_LABELS` e a lógica de busca do nome de exibição por Provider ID;
- O Mapper prioriza o label de Provider já fornecido pelo Registry e, quando ausente, faz fallback apenas para `providerId`;
- Não criar outro mapa de Built-in Provider label no Bootstrap, na UI ou no Protocol;
- Os ramos de produto de Coding Plan (produto, compra, uso, família de conta) continuam trabalhando com seus próprios IDs de Provider de negócio e não pertencem a este item;
- Este item apenas unifica a origem dos metadados de exibição, sem alterar Provider ID, ordem de candidatos, visibilidade, ativação/desativação, autenticação ou execução do Model.

## 2. Limites em relação aos Todos 13 e 14

```text
Todo 13
|- Target Host selection authority
|- structured ModelSelection persistence/protocol
|- temporary App removal
`- string selection business-chain retirement
        |
        v
Todo 16.1
`- Runtime constructor can require real Selection + ModelFactory

Todo 14
|- RuntimeModelFactoryInput mechanical narrowing
|- Full Compact MCS force
|- Legacy Provider Store DTO privatization
`- known dead files
        |
        v
Todo 16
|- Core fake sentinel removal
|- reasoning.enabled removal
|- zero-reference ZCode Protocol Provider DTO removal
|- current Model Option Protocol projection narrowing
|- Legacy CLI Model Config privatization
|- AgentRuntime secondary model-fact channel removal
|- Built-in Provider label hardcode removal
`- current Design/document correction
```

- Quando os Todos 13/14 já modificaram o mesmo arquivo, este Todo faz a verificação de zero referência sobre a implementação mais recente e não restaura código removido;
- O Todo 16 não duplica os testes, listas de mudança nem definições de conclusão dos Todos 13/14;
- O Todo 16.1 depende do Todo 13; os demais itens podem ser implementados de forma independente quando os conflitos de arquivo forem controláveis;
- O rascunho de composição/ciclo de vida do Provider Runtime do Todo 11 não pertence a este Todo;
- A validação em ambiente real e de lançamento do Todo 15 não pertence a este Todo.

## 3. Complemento do Differential de Impacto

### 3.1 Resumo da Funcionalidade

| Campo                  | Conclusão                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Intenção do desenvolvedor | Preencher as lacunas do Todo 16 em relação ao Design oficial, ao Protocolo atual de Model Option e à origem do label de Provider |
| Capacidade             | Model/Provider Config、Registry/ModelFactory、projeção de Protocol de candidatos de Model                    |
| Camada de mudança      | `presentation`、`option-source`; a parte de documentação é correção de contrato de arquitetura                |
| Modo de operação       | planning                                                                                                     |
| Sementes principais    | `design/model/model.md`、`zcode-protocol/index.ts`、`zcode-protocol/model-mapper.ts`                        |
| Fora de escopo         | Estado de candidatos de Model、default de Selection、submissão、execução、persistência de configuração、remote/continuous/replayable e Telemetria |

### 3.2 Matriz de Superfícies de UI

| Cenário do usuário     | Entrada de UI       | Implementação compartilhada | Owner de exibição        | Default/validação/submissão                     | Limite de modo             | Deve permanecer isolado              |
| ---------------------- | ------------------- | -------------------------- | ------------------------- | ----------------------------------------------- | -------------------------- | ------------------------------------ |
| Ver grupo de candidatos de Model | Controle de seleção de Model | `zcodeSessionProjection` | Target Host Protocol View | Este item apenas consolida campos e origem de label; sem submissão | Desktop/Web/Mobile isomórficos | Draft、Recent、Session Selection |
| Editar Provider        | Configurações de Provider | Provider Settings Facade | Effective Provider Config | Sem mudança em campos, salvamento ou teste de conexão | Local/Remote inalterado   | Personal Config e estado da conta     |

### 3.3 Comportamento Compartilhado e Divergente

| Ponto de atenção      | Regra compartilhada                                                        | Divergência preservada                                       |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Label do Provider     | Todos os candidatos de Model obtêm o nome de exibição do Registry Provider Config | As telas de produto/uso podem manter seu próprio texto comercial |
| Fatos do Model        | Fatos de execução são expressos apenas por Model Properties/Options completas | O Protocolo transmite apenas a menor projeção de exibição de que a UI atual precisa |
| Criação de Model      | Após lookup/validate do Registry, a criação é feita pelo ModelFactory      | `Model.bind()` continua legadamente derivada de um Model existente |
| Estado e persistência | Sem mudanças                                                                | Draft, commit sink e persistência existentes de cada produto continuam isolados |

### 3.4 Relacionamentos da Funcionalidade

| Nível            | De                             | Relação             | Para                          | Motivo                                                    |
| ---------------- | ------------------------------- | ------------------- | ----------------------------- | --------------------------------------------------------- |
| must-inspect     | Provider Registry/ModelFactory | creates-through     | Execução privada do Adapter   | Corrigir a documentação não pode unir novamente Registry e Factory |
| must-inspect     | Registry Provider Config       | projects-to         | `providerLabel` do Protocol   | Remover o desvio de nomes estáticos do Bootstrap           |
| must-inspect     | Active Model Properties        | projects-to         | Protocolo atual de Model Option | Remover a cópia achatada de capability não consumida      |
| invariant-only   | Produtos de seleção de Model   | must-not-mutate     | Draft/Session/registros de produto | Este item não altera a intenção de seleção nem a semântica de submissão |
| invariant-only   | Entrega local/remota           | must-remain-isolated | runtime continuous/replayable | Sem mudanças em requisições, filas, snapshots ou recuperação |

### 3.5 Owners de Estado e Destinos de Commit

| Fato                  | Owner autoritativo                | Commit/Persistência                | Limite após este item                              |
| --------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------- |
| Nome de exibição do Provider | Registry Provider Config | Built-in/Personal Provider Config | O Protocolo apenas projeta, sem hardcode por ID   |
| Capacidade de execução do Model | properties/options do Active Model | Model Config Rules | Não gera cópia achatada de Protocol não consumida |
| Seleção de Model do usuário | Draft/Submission/Session de cada produto | seus sinks existentes | Completamente inalterado                          |

### 3.6 Invariantes a Preservar

- Não alterar o conjunto de candidatos, a ordenação, o agrupamento de Provider, enabled/visibility nem o fallback;
- Não alterar o Schema de `ModelSelection`, a resolução de defaults nem a validação final do ModelFactory;
- Não expor o Provider/Model Config completo ao Model público ou ao Protocolo;
- Não alterar o comportamento de Desktop, Web, Mobile, Local, Remote, continuous ou replayable;
- Não tratar ramos de produto, conta, uso e autenticação como limpeza de configuração estática de label de Provider.

### 3.7 Evidências de Codegraph e Delta do Grafo

- O ambiente atual não possui uma ferramenta de codegraph que possa ser chamada; usam-se feature graph seed, `rg`、`dep:refs` e `knip` como substituto estático de profundidade 2;
- O caminho direto é Registry Provider/Model -> Bootstrap Model Mapper -> ZCode Protocol -> UI Session Projection;
- `supportsTools/supportsStructuredOutput` só são escritos na produção, sem leitura pelo Renderer;
- `providerSource/providerLogoUrl` não têm produtor nem consumidor na cadeia atual de Model Option;
- O feature graph já declara corretamente a relação autoritativa entre Model Properties e Provider Registry; nesta rodada não há novos nós de semântica de produto, e o graph delta é `none`; a remoção de seeds antigas/stale continua sendo tratada pela redução mecânica a zero de documentação dos Todos 14/16.

### 3.8 Questões em Aberto

Nenhuma. Os oito itens acima são apenas o fechamento mecânico de decisões existentes e não exigem nova decisão de produto.

## 4. Ordem de Implementação

### Etapa A: estabelecer testes de redução a zero e evidências de dependência

1. Escrever testes falhando para Required ModelFactory/Selection, ausência de `reasoning.enabled` e Compact apenas com Active Model;
2. Fixar com `pnpm dep:refs`、`rg` e `knip` a lista de consumidores dos DTOs de Protocol, dos campos atuais de Model Option, dos tipos Legacy CLI e dos sentinels;
3. Atualizar primeiro o Design oficial envolvido neste Todo, para fixar o contrato final antes de alterar o código;
4. Registrar os itens sobrepostos que os Todos 13/14 já removeram, sem restaurar fixtures.

### Etapa B: restringir o Core Runtime

1. Depois da cadeia de initial Selection do Todo 13, tornar ModelFactory e ModelSelection obrigatórios na construção de produção;
2. Remover a Selection sentinel, o `DEFAULT_MODEL` e os ramos de falha tardia;
3. Fazer os testes injetarem Factory/Selection explicitamente de forma unificada;
4. Remover todo o estado `modelProviderOptions` do Runtime;
5. Fazer os consumidores de execução lerem apenas o Active Model desta rodada, removendo o fallback do Runtime Config.

### Etapa C: restringir o Protocol e a projeção de Reasoning

1. Remover os DTOs de Provider antigos sem referência do Protocol;
2. Manter e cobrir com regressão o `ZCodeAccountAccess`;
3. Remover o campo `reasoning.enabled` do Schema, do Mapper, da UI e dos testes;
4. Remover os campos sem consumo do Model Option atual e a saída de capability achatada do Bootstrap;
5. Remover `BUILTIN_PROVIDER_LABELS` e confirmar `providerLabel = config label ?? providerId`;
6. Verificar que Desktop, Web/Remote e Agent têm uma análise estrita de Protocolo consistente.

### Etapa D: privatizar o Legacy CLI Config

1. Extrair o formato serializado antigo mínimo do importer;
2. Migrar parser, adapter, importer e fixtures dedicados;
3. Remover os tipos e pontos de entrada antigos dos barrels públicos de Contracts/Adapters;
4. Verificar que a configuração antiga ainda gera de forma unidirecional o Personal Config atual equivalente.

### Etapa E: documentação e verificação mecânica

1. Atualizar os documentos de estado atual ou marcá-los como históricos, e unificar Registry -> ModelFactory -> execução privada do Adapter -> Model;
2. Reexecutar a varredura de zero referência e de símbolos proibidos;
3. Executar os testes direcionados, `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`;
4. Atualizar o status do Todo e enviar um Conventional Commit independente.

## 5. Casos Aceitos

| Case ID | Cenário                                                     | Expectativa                                                                 |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| RZ-01   | Criação de AgentRuntime em produção                         | ModelFactory e ModelSelection estruturado devem ser fornecidos no tipo     |
| RZ-02   | Construção de teste de Runtime não executável                | Usar explicitamente o Unavailable ModelFactory; nenhum Model sentinel existe |
| RZ-03   | Model sem Reasoning Option Spec                             | `reasoning` ausente no Protocol/UI; não aparece `enabled=false`             |
| RZ-04   | Model com Reasoning Option Spec                             | Apenas levels/defaultLevel são transmitidos; não aparece `enabled=true` fixo |
| RZ-05   | Varredura de export do Protocol compartilhado                | DTOs antigos de ZCode Provider e seus campos exclusivos são zero            |
| RZ-06   | Leitura de configuração antiga do CLI já publicada           | O importer analisa de forma privada e gera o Personal Config atual          |
| RZ-07   | Requisição normal, Compact, Memory, Title, Child            | Fatos de context/output vêm apenas do Active Model desta rodada             |
| RZ-08   | Atualização do max output padrão do Model Config             | Afeta apenas Models criados depois; não reescreve Selection/snapshot antigo |
| RZ-09   | Execução de Model local e remota                            | Cada uma criada pelo ModelFactory do Environment alvo, sem fallback local   |
| RZ-10   | Leitura dos documentos atuais de design de Model             | Catalog、models.dev ou capability map deixam de ser autoridade atual        |
| RZ-11   | Leitura do Protocol atual de Model Option                    | Não contém campos sem consumo nem capability achatada de tools/structured  |
| RZ-12   | Built-in Provider com label                                 | O candidato exibe o label do Registry Config                               |
| RZ-13   | Label do Provider ausente                                   | O candidato faz fallback apenas para providerId, sem consultar a tabela de nomes estática do Bootstrap |
| RZ-14   | Leitura do Design de criação de Model                       | Os limites entre lookup/validate do Registry e criação por ModelFactory/Adapter ficam claros |

## 6. Definição de Conclusão

1. `AgentRuntimeDeps.modelFactory?`、`zcode-unconfigured/missing-model` e o `DEFAULT_MODEL` público são zero;
2. `ZCodeModelReasoningOptions.enabled` no Protocol/Projection atual é zero;
3. DTOs antigos de ZCode Provider sem referência e Schema/export públicos são zero;
4. `RuntimeModelConfig/ModelTargetConfig` do Legacy CLI nos Contracts/Adapters públicos são zero;
5. `AgentRuntimeConfig.modelProviderOptions` e sua cadeia de repasse são zero;
6. O fallback do Runtime para `contextWindow/maxOutputTokens` em caminhos de execução que já obtiveram o Active Model é zero;
7. A compatibilidade do Legacy CLI existe apenas na fronteira privada do importer; Config/Registry/Runtime oficiais não leem a estrutura antiga;
8. Os documentos de estado atual não afirmam mais que a inferência antiga de Catalog/Capability é a arquitetura oficial;
9. `providerSource/providerLogoUrl/supportsTools/supportsStructuredOutput` no Protocol atual de Model Option são zero;
10. `BUILTIN_PROVIDER_LABELS` no Bootstrap e qualquer tabela estática equivalente de Provider ID -> label são zero;
11. O Design oficial não faz mais o Model público expor o Provider/Model Config completo, nem descreve a criação de Model como um método de índice do Registry;
12. O escopo já planejado pelos Todos 13/14 não gerou uma segunda implementação neste Todo;
13. Os testes direcionados, a verificação de tipos, o lint e a verificação de formatação passam.

## 7. Fora de Escopo

- Não redesenhar ModelSelection、Provider Config、Model Config Rules ou Access;
- Não modificar a composição de Host/Agent Provider Runtime do Todo 11;
- Não encerrar a janela de leitura compatível do Legacy CLI/Provider Store já publicado;
- Não criar nova identidade de Model, DTO de capability, snapshot de Model do Runtime ou Model de fallback;
- Não modificar a semântica de Queue、Goal、agendamento Off-Peak、desktop continuous、mobile replayable ou recuperação remota;
- Não apagar por completo documentos históricos e evidências de arqueologia Git.

## 8. Registro de Implementação (2026-08-25)

- A construção de produção do Core já exige um `ModelSelection` e um `ModelFactory` reais; os testes injetam os fatos de teste por helper explícito, e o sentinel de produção, o `DEFAULT_MODEL` e o ramo de Factory ausente tardio foram removidos;
- A segunda cadeia de fatos `modelProviderOptions/contextWindow/maxOutputTokens` do Runtime e o repasse em Compact、Memory、Child、Workflow foram removidos; a execução lê uniformemente o Active Model desta rodada;
- O Protocol compartilhado já removeu os DTOs antigos de Provider sem referência, o `reasoning.enabled` e os campos achatados sem consumo do Model Option atual; o Bootstrap projeta o Protocolo atual diretamente a partir da View do Registry e obtém o label a partir do Provider Config;
- O Schema Zod mínimo e os tipos do JSON antigo de Provider/Model do CLI foram movidos para o módulo privado do importer no bootstrap; os tipos públicos, o parser e o barrel export de Contracts e Adapters foram removidos. Os testes do Adapter não tratam mais um importer de uso único como parser de Config oficial;
- O Design atual foi unificado em `Registry lookup/validate -> ModelFactory -> Adapter private create -> Active Model`; a documentação antiga de Model Catalog foi claramente marcada como aposentada, e o mapa de capabilities e a documentação de execução foram migrados para Model Config Rules / Active Model;
- A varredura de dependências confirmou que os DTOs Shared removidos não têm referências de produção; os testes direcionados de Protocol, Legacy importer, Adapter Config e Core Runtime e o typecheck de Contracts/Adapters/Core/Bootstrap passaram. O registro de verificação mecânica de todo o repositório está no commit correspondente a este Todo.