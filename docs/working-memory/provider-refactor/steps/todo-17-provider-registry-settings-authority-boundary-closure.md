# 17 Fechamento da Fronteira de Autoridade entre Provider Registry e Settings

> Status: concluído
>
> Nota histórica: a autoridade de Host/Repository e as fronteiras de salvamento granularidade fina estabelecidas por este Todo continuam válidas; a criação, remoção, origem, habilitação, membros duplicados e interações de ordenação de Provider/Model foram re-adjudicadas por
> [`Todo 21`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md).
>
> Data: 2026-08-25
>
> Origem: revisão limpa da nova implementação de Provider e as adjudicações manuais concluídas item a item em seguida
>
> Tarefas relacionadas: [`03`](./todo-03-provider-model-ownership-and-property-totality.md)、
> [`12`](./todo-12-model-selection-validation-boundary-cutover.md)、
> [`13`](./todo-13-target-host-model-selection-authority.md)、
> [`14`](./todo-14-post-refactor-mechanical-zero.md)、
> [`16`](./todo-16-unplanned-model-abstraction-residue-cleanup.md)
>
> Designs relacionados: [`configuration.md`](../design/registry/configuration.md)、
> [`settings.md`](../design/registry/settings.md)、
> [`registry.md`](../design/registry/registry.md)、
> [`model-membership-and-enablement.md`](../design/registry/model-membership-and-enablement.md)、
> [`model-creation.md`](../design/registry/model-creation.md)

## 0. Objetivo da Tarefa

Este Todo não adiciona capacidade de produto de Provider; ele faz o código já implementado voltar a obedecer ao design existente, removendo o cálculo duplicado, a escrita de pacote inteiro, a cópia manual de campos e as decisões antecipadas formadas no código novo.

Ao final, existe apenas uma cadeia de autoridade de configuração:

```text
Provider Config 路径
====================

ZCode Built-in Provider Config（在线配置）
                    +
Account Built-in Provider Config（只约束 Built-in）
                    |
                    v
Effective Built-in Provider Config
                    +
Personal Provider Config
                    |
                    v
Effective Provider Config


Model Config 路径
=================

ZCode Built-in Model Config Rules
                    |
                    | 对当前 Effective Provider 中的 providerId/modelId/api.type 解析
                    v
Effective Built-in Model Config
                    +
Personal Model Config Rules（数组后置）
                    |
                    v
Effective Model Config
```

Os dois resultados passam por uma única verificação de completude antes de entrar no Registry:

```text
Effective Provider / Model Config
                 |
                 v
       Registry 完整类型创建入口
            /             \
           /               \
    不完整：issues       完整：Registry Value
           |                   |
           v                   v
       Settings 展示       ModelFactory / 执行
```

O leitor de Settings na Settings lê a hierarquia já calculada pelo Resolver e edita somente o Personal; o Registry consome apenas resultados completos; ao executar de fato um `ModelSelection`, o ModelFactory alvo faz a decisão final.

## 1. O que fica explicitamente fora

- Não projetar nem implementar CRUD de Remote Settings, Provisioning remoto, login remoto, sincronização de configuração e E2E remoto.
- Não alterar o roteamento de serviços de Workspace/Environment existente; este Todo apenas organiza o interior de um Provider Service já montado.
- Não executar a refatoração da raiz de composição de processos do Todo 11, nem tratar problemas de ciclo de vida além do Todo 11A.
- Não alterar a semântica de produto de M4, Access, resolução de plano de conta, Reasoning Mapping, persistência de seleção de modelo ou fila de tarefas.
- Não adicionar legacy importer, migration pontual ou janela de compatibilidade. Este branch ainda não foi publicado; os formatos internos antigos incorretos são removidos diretamente.
- Não deixar o Provider Config Service varrer ou reescrever Session, Composer, Workspace Recent, Automation ou Turn histórico.
- Não criar um Registry temporário, um Provider Config temporário ou um segundo conjunto de Overlay/algoritmo de completude para Settings.

## 2. Design Fixado

### 2.1 O Resolver é o único calculador dos resultados em três camadas

O Resolver deve produzir simultaneamente os resultados necessários para Settings e para o Registry:

```text
Config Sources
      |
      v
Resolver
├─ Effective Built-in Provider Config
├─ Effective Provider Config
├─ Effective Built-in Model Config
├─ Effective Model Config
├─ 冲突、成员、enabled、visibility 与完整性 issues
└─ 可以进入 Registry 的完整 Provider/Model
      |
      +-----------------------+
      |                       |
      v                       v
Settings Facade          Registry Builder
只组织并序列化            只发布完整可执行项
```

A Settings Facade não reexecuta o Overlay. O Registry também não pode gerar dados de Settings em sentido inverso, porque o Registry já descartou itens disabled, incomplete, membros duplicados e conflitos Personal pausados.

As Built-in Model Rules devem agir sobre o `Effective Provider Config` final. Portanto, um Provider Personal-only e um Personal Model adicionado pelo usuário, desde que casem com uma Built-in Rule, também recebem primeiro a configuração padrão de modelo Built-in, e só então as Personal Rules são sobrepostas.

`Effective Built-in Model Config` é apenas "o resultado da resolução das Built-in Rules para o modelo atual"; não substitui `ZCode Built-in Model Config Rules` como fonte de verdade da configuração online.

### 2.2 A Settings View retorna a hierarquia; o Renderer edita apenas o Personal

Os itens de configuração de Provider retornam:

```ts
interface ProviderSettingsProvider {
  readonly effectiveBuiltinConfig?: ProviderConfigObject;
  readonly personalConfig?: ProviderConfigObject;
  readonly effectiveConfig: ProviderConfigObject;
}
```

Um Provider Personal-only não tem `effectiveBuiltinConfig`. `effectiveConfig` é a prévia autoritativa do servidor, usada apenas para exibir valores herdados, estado final e problemas; não é copiada para um Draft Personal.

Os itens de configuração de Model retornam:

```ts
interface ProviderSettingsModel {
  readonly effectiveBuiltinConfig: ModelConfigObject;
  readonly personalExactConfig?: ModelConfigObject;
  readonly effectiveConfig: ModelConfigObject;
}
```

Aqui o nome precisa ser `personalExactConfig`. As Personal Model Config Rules ainda permitem regras de correspondência em lote; a página de configurações de um único modelo edita apenas a Rule exata pertencente àquele `providerId/modelId` e não pode disfrazar o resultado de todas as Personal Rules como uma configuração editável.

Ao restaurar o valor padrão de um campo:

```text
删除 personalExactConfig 中对应叶子
              |
              v
精确 Rule 为空时删除该 Rule
              |
              v
Resolver 重新运行 Built-in + 全部 Personal Rules
              |
              v
返回新的 effectiveConfig
```

O valor que aparece após a restauração pode vir de outra Personal Rule em lote e não tem garantia de voltar diretamente ao valor Built-in.

### 2.3 Provider e Model são salvos separadamente

O conjunto exibido pela página de configurações nunca pode servir como um snapshot completo do Personal Repository. A escrita oficial é feita pela unidade de configuração que o usuário acabou de operar:

| Ação do usuário                                                          | Escrita de domínio                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Modificar API, Access, Endpoint, Provider enabled do Provider              | `savePersonalProvider(providerId, config)`                        |
| Modificar Model enabled, Properties, Options, Reasoning Mapping             | `savePersonalModelConfig(providerId, modelId, config)`            |
| Restaurar um campo de Model                                                | Salvar o Config exato após remover a folha; quando o Config fica vazio, apagar a Rule exata |
| Adicionar um Personal Model                                                | Adição atômica em `provider.modelIds` + salvar o Config exato inicial do Model |
| Remover um Personal Model                                                  | Remoção atômica do membro de `modelIds` e da Rule exata que ele possui |
| Renomear um Personal Model                                                 | Movimentação atômica do membro de `modelIds` e da Rule exata que ele possui |
| Reordenar Personal Models                                                  | Apenas reordenar `provider.modelIds`                              |

O botão de Model enabled na página de Provider continua escrevendo o Model Config; a página em que o controle aparece não muda a posse da configuração.

É obrigatório remover do caminho normal de salvamento:

```ts
savePersonalProvider(providerId, providerConfig, allVisibleExactModels);
replaceExactForProvider(providerId, visibleEntries);
```

Ao remover um Provider Personal-only é possível apagar em lote suas Rules exatas, mas a interface precisa expressar a semântica de remoção, por exemplo `deleteExactRulesForProvider(providerId)`; não se pode manter uma operação de "substituição do pacote inteiro" que possa ser usada por engano em um salvamento comum.

### 2.4 As escritas do mesmo Provider mantêm a ordem das operações do usuário

O Renderer pode continuar usando um Draft local, mas as escritas assíncronas do mesmo Provider precisam ser submetidas na ordem em que aconteceram. Entre Providers diferentes é possível paralelizar.

```text
同一 Provider 的操作
修改字段 -> 修改模型 -> 重命名 -> 测试
    |          |          |         |
    +----------+----------+---------+
                       |
                       v
                 逐个完成后再执行下一个
```

Requisitos mínimos de comportamento:

- Uma resposta tardia de um salvamento anterior não pode sobrescrever uma entrada local mais nova nem aparecer como o sucesso mais recente.
- O rename espera os salvamentos em voo do ID antigo terminarem e então troca para o novo ID usado pelas operações seguintes; o ID antigo deixa de aceitar escritas.
- O delete é uma operação terminal; depois de iniciar a remoção, um salvamento tardio não pode recriar o Provider.
- O teste de conectividade espera as operações de salvamento pendentes do Provider e do Model relacionados terminarem antes de testar a configuração salva.
- Trocar o nó de configurações pode manter o rascunho local ou continuar concluindo salvamentos já submetidos, mas não deixa a resposta do nó antigo sobrescrever o novo nó.
- Quando chega uma atualização externa, campos não editados podem seguir a nova View; campos em edição mantêm a entrada local.
- Após sucesso do salvamento, confirmar com a nova View retornada; em caso de falha, manter a entrada do usuário e o estado de erro.

Isso é apenas ordenação de escritas dentro da UI/Service; não acrescenta revision persistida, CAS, protocolo transacional nem novos objetos de domínio.

### 2.5 Os tipos completos do Registry têm uma única entrada de criação validada

`RegistryProviderConfig` e `RegistryModelConfig` expressam que o Effective Config já está completo; não são outra fonte de verdade de configuração.

Asserções nuas atuais:

```ts
config as RegistryProviderConfig;
config as RegistryModelConfig;
config.toJSON() as RegistryModelConfigObject;
```

Elas precisam ser fechadas em uma única entrada de criação em runtime. A API pode adotar `from()`, `parse()` ou forma equivalente, mas precisa expressar o resultado como:

```ts
type RegistryConfigResult<T> =
  | { readonly ok: true; readonly config: T }
  | { readonly ok: false; readonly issues: readonly ConfigValidationIssue[] };
```

As restrições são:

- A entrada de criação verifica recursivamente os campos obrigatórios do Registry; a única prova interna de tipo necessária não pode vazar para quem chama.
- O Resolver usa esse único resultado para gerar ao mesmo tempo as issues de Settings e o value do Registry.
- A completude responde apenas "os campos obrigatórios estão todos presentes"; enabled, visibility, conflitos de membros e se está registrado continuam sendo decididos pelo Resolver.
- A saída de serialização do tipo completo retorna a estrutura estática completa, sem reexpor campos optional.
- Abaixo do Registry não se chama mais `requireComplete...`, não se lê mais `unknown` e não se preenche mais valores padrão para capacidades obrigatórias.
- Remover dos outros pontos do código de produção os `as RegistryProviderConfig`, `as RegistryModelConfig` e asserções equivalentes.

### 2.6 Primeiro concluir o salvamento granular, depois aplicar a projeção de Visibility

`visibility` afeta apenas as entradas do usuário, não a capacidade precisa de execução interna do Registry:

```text
完整 Registry
├─ hidden Provider / Model 仍可由内部能力精确创建
├─ Settings View 过滤普通 hidden 项
└─ Model Selection 过滤 hidden 项
```

É preciso primeiro remover a escrita de pacote inteiro das Model Rules e só então ocultar itens de Settings; caso contrário, configurações invisíveis seriam apagadas por engano por salvamentos da UI.

Quando há conflito de Model ID entre Built-in e Personal, as Settings ainda precisam retornar o diagnóstico mínimo necessário para resolver o conflito Personal; itens hidden comuns não voltam por isso às listas de configurações ou de seleção de modelo. Os designs existentes de `builtinModelIds`, `modelIds`, Built-in-wins, Model enabled e visibility permanecem inalterados.

### 2.7 O rename de Provider é um movimento puro de identidade

`renamePersonalProvider(oldId, newId)` faz apenas:

```text
Personal ProviderConfigMap key
oldId -> newId
       +
属于该 Provider 的精确 Model Rules
oldId/* -> newId/*
```

O objeto Provider Config é preservado como está, incluindo `label`, `visibility`, `enabled`, `access`, `api`, `builtinModelIds` e `modelIds`. Remover `withoutProviderLabel()` e toda lógica equivalente que reconstrói o Config enumerando campos manualmente.

O nó de navegação atual da página de configurações acompanha o novo ID, garantindo que o usuário continue no mesmo objeto em edição. O Provider Config Service não reesve Composer, Session Selection, Workspace Recent, Automation nem Turn histórico; se as referências antigas ainda são válidas continua sendo tratado pela validação de Selection ao efetivamente submeter a tarefa e construir o Model.

Como este branch ainda não foi publicado, o rename não assume limpeza de formato histórico e não adiciona importer nem migration.

### 2.8 Connectivity testa apenas um Model oficial

A cadeia de teste é:

```text
用户点击测试
      |
      v
等待当前 Provider/Model 的待保存操作
      |
      v
提交 providerId + modelId
      |
      v
目标 Agent 使用当前 Registry 的 ModelFactory 精确创建 Model
      |
      +--> 创建失败：返回错误
      |
      `--> 创建成功：通过正式 Adapter 发出最小真实请求
```

A UI pode usar o campo `executable` da View de Settings atual para controlar o estado do botão, mas o Renderer e o Host Service não simulam mais a admissão final por meio de "Provider selecionável + Model aparecendo na lista de configurações". Seleções que contornam a UI, são invalidadas por concorrência ou forjadas são rejeitadas pelo ModelFactory alvo.

O teste não monta Endpoint, Header, parâmetros de Reasoning nem corpo de requisição, e não cria um Probe Adapter separado; API Key, Request Auth, acesso de conta e codificação do Adapter continuam passando pela cadeia oficial de requisição de Model.

Uma operação testa apenas um Model, e o valor de retorno de Settings passa a ser um resultado único:

```ts
type ModelConnectivityResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly error: {
        readonly kind: "auth" | "model_not_found" | "rate_limit" | "network" | "server" | "unknown";
        readonly message: string;
        readonly httpStatus?: number;
      };
    };
```

Remover o `results[]` de elemento único, `EndpointConnectivityResult`, a inferência de `endpointType` e a agregação na UI. O teste não altera Composer Draft, Session Selection, Workspace Recent nem Model Ativo.

### 2.9 Remover a Preview API sem uso em produção

Resultado da verificação de referências:

- `previewPersonalProvider()` só tem encaminhamento no Service e testes, sem chamada de UI em produção; remover.
- `previewPersonalModelConfig()` só tem encaminhamento no Service e testes, sem chamada de UI em produção; remover.
- `previewModelConfig(providerId, modelId, apiType)` é usado pela página de criação de Personal Model para resolver valores padrão de Built-in/Personal Rules; manter.

A prévia autoritativa pós-salvamento vem uniformemente da Settings View; não se mantém mais uma interface de simulação servidor de página inteira para um Overlay Personal não salvo.

## 3. Desvios da Implementação Atual

| Desvio                        | Implementação atual                                        | Alvo                                                                     |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Completude do Registry        | `as Registry...` crua depois da validação do Resolver       | Entrada única de criação validada que retorna tipo completo ou issues    |
| Hierarquia de Settings        | Retorna principalmente Personal + Effective                | Resolver/Facade retorna Effective Built-in + Personal + Effective       |
| Nome das configurações de Model | Até a Rule exata de modelo único se chama `personalConfig` | Passa a se chamar explicitamente `personalExactConfig`                   |
| Salvamento de Provider        | Carrega todos os Model Config da página                     | Salva apenas o Provider Config                                            |
| Salvamento de Model           | A pequena página de Model volta para o salvamento de pacote inteiro do Provider | Salva diretamente aquele Config exato de Model                   |
| Ordem de salvamento           | Várias requisições assíncronas podem concluir intercaladas | Escritas do mesmo Provider seguem a ordem das ações do usuário           |
| Visibility                    | O salvamento de pacote inteiro ainda depende do conjunto atual da UI | Primeiro salvamento granular, depois filtragem segura dos itens invisíveis |
| Rename de Provider            | `withoutProviderLabel()` reconstrói o objeto e perde `visibility` | Move o Config e as Rules exatas como estão                                |
| Portão de Connectivity        | UI e Host repetem o julgamento baseado na lista de Settings | O ModelFactory alvo faz o julgamento final                                |
| Resultado de Connectivity     | Array de Endpoint de elemento único                         | Um único resultado de sucesso/falha                                        |
| Preview                       | Duas interfaces de simulação sem chamada em produção       | Remover, mantendo apenas a resolução de Rules para criação de Model       |

## 4. Impact Brief

### 4.1 Função e Escopo

| Campo                    | Conteúdo                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Remover a autoridade duplicada e a nova cola entre Provider Settings e a cadeia principal do Registry                                                 |
| Capacidade                | Provider Config, Model Config, Settings, Registry, Connectivity                                                                                            |
| Camada de mudança         | option-source, validation, commit-effect, persistence                                                                                                   |
| Modo de operação         | planning                                                                                                                                                  |
| Principais pontos de entrada de código | `ProviderConfigResolver`、`ProviderSettingsFacade`、`ProviderConfigService`、`ModelProviderSection`、`InlineEditableProviderCard`、Connectivity Service、ModelFactory alvo |
| Fora de escopo            | Remote Settings/Provisioning, M4, Todo 11, semântica de produto Access/Reasoning, ciclo de vida de tarefas e seleção de modelo                          |

### 4.2 UI Surface Matrix

| Cenário do usuário            | Entrada de UI           | Exibição e Draft                           | Padrão/Herdado                       | Validação                                | Submissão                     | Ponto de autoridade                      | Isolamento obrigatório            |
| ----------------------------- | ----------------------- | ------------------------------------------ | ------------------------------------ | ---------------------------------------- | ----------------------------- | ---------------------------------------- | ---------------------------------- |
| Editar Provider               | Detalhe do Provider     | Personal Provider Draft; exibe a View de três camadas | Effective Built-in + Effective | Config issues                            | `savePersonalProvider`        | Personal Provider Repository           | Model Rules, Selection              |
| Ligar/desligar Model          | Lista de models do Provider | Draft exato de modelo único; exibe Effective | Built-in Rules + Personal Rules  | Model issues                             | `savePersonalModelConfig`     | Personal Model Rules                   | Rules de outros models              |
| Editar Model                  | Pequena página de Model  | Draft exato de modelo único                | Built-in Rules + Personal Rules     | Model issues                             | upsert/delete da Rule exata   | Personal Model Rules                   | Outros campos do Provider           |
| Criar/renomear/remover Model  | Lista de models e página pequena | Operações de membros Personal      | Conjunto de membros atual           | ID/conflito                              | Operações atômicas de domínio | `modelIds` + owned exact Rule          | Membros Built-in                    |
| Renomear Provider             | Edição do nome do Provider | Draft do providerId atual                | ID atual                             | Não vazio/nome duplicado                 | rename atômico                 | Provider Map + owned exact Rules       | Session/Recent/Automation           |
| Testar Model                  | Botão de teste na linha do Model | Sem Draft de longo prazo independente | Configuração já salva           | Gate de exibição na UI; validação final no ModelFactory | `testModelConnectivity`       | Nenhuma persistência nova; requisição oficial | Todos os estados de Selection |

Desktop, Web e Mobile reutilizam o mesmo contrato de UI/Service. Este Todo não adiciona comportamento de edição remota de configuração nem toma o roteamento remoto existente como alvo de aceitação.

### 4.3 Compartilhado e Divergente

| Preocupação  | Fato compartilhado                                    | Diferença intencional                                                              |
| ------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Overlay      | Tudo calculado pelo Resolver                         | Settings mantém candidatos que falharam; o Registry mantém apenas itens completos executáveis |
| Draft        | Ambos expressam apenas a intenção Personal            | Provider Draft, Draft de Model único e operações atômicas de membro são submetidos separadamente |
| Visibility   | Vem de Provider/Model Config                         | O Registry interno mantém hidden; as entradas do usuário filtram                   |
| Execution    | No final tudo passa pelo Registry/ModelFactory        | O Connectivity envia uma requisição de teste mínima e fixa                       |
| Persistence  | O Personal Repository é o único ponto de chegada da configuração do usuário | Connectivity não salva estado de execução nem configuração exclusiva de teste |

### 4.4 Relações, Owners e Evidências

| Rank            | De                          | Relação          | Para                  | Por que precisa ser visto         | Evidência atual                                                    |
| --------------- | --------------------------- | ---------------- | --------------------- | --------------------------------- | ------------------------------------------------------------------ |
| must-inspect    | Built-in + Account Built-in | overlay          | Effective Built-in    | Settings precisa de uma baseline real somente leitura | `packages/provider/src/resolver.ts`               |
| must-inspect    | Effective Built-in + Personal | overlay/resolve | Effective Config      | A UI não pode replicar o algoritmo | `packages/provider/src/facades.ts`                |
| must-inspect    | Effective Config            | completeness     | Registry Config       | Remover asserções de tipo cruas     | `packages/provider/src/resolver.ts`               |
| must-inspect    | Draft de Provider/Model     | commit           | Personal Repository   | Remover escrita de Rule em pacote inteiro | `providerPersonalSave.ts`、`config-service.ts`    |
| must-inspect    | Pequena página de Model     | commit           | Rule exata de Model   | Hoje erra ao voltar para o salvamento do Provider | `InlineEditableProviderCard.tsx`                  |
| must-inspect    | Connectivity Selection      | validate         | ModelFactory alvo     | Remover julgamento duplicado no Host | `providerFacadeServices.ts`、`workspace-model-runtime.ts` |
| should-inspect  | Visibility                  | filter           | Settings/Selection   | Dados invisíveis não podem ser apagados por engano | `facades.ts`、projeção de seleção de modelo      |
| invariant-only | Config refresh              | must-not-mutate  | Model Ativo já criado | Atualizações só afetam Models criados depois | design de runtime do Registry                     |
| invariant-only | Settings/Connectivity       | must-not-mutate  | Estado de Model Selection | Testes e edições não trocam de modelo | design de Settings                               |

A posse do estado fica fixada assim: o Renderer é dono apenas das entradas ainda não submetidas; o Personal Repository é dono da configuração do usuário; o Resolver é dono do cálculo em três camadas e dos diagnósticos; o Registry é dono do índice executável atual; o ModelFactory é dono do resultado final de construção de uma Selection concreta.

### 4.5 Feature Graph e Questões em Aberto

O Feature Graph já declara as semânticas de Built-in -> Account Built-in -> Personal, da fronteira de tipo completo, da filtragem por Visibility e da validação final pelo ModelFactory. Este Todo apenas corrige desvios de implementação e não adiciona nós semânticos. O code seed só é atualizado quando símbolos forem movidos durante a implementação; neste momento o Feature Graph está sendo modificado por outros trabalhos e este Todo não o sobrescreve.

Questões em aberto que mudariam o escopo: nenhuma. Todos os limites acima já foram confirmados manualmente.

## 5. Ordem de Implementação

Cada slice começa com um teste falhando e só depois modifica a implementação. Não comprimir todas as mudanças em um único commit.

### Slice A: primeiro revisar a Spec de longo prazo e os contratos de teste

1. Atualizar `configuration.md`, `registry.md`, `settings.md`, `runtime.md` e `model-membership-and-enablement.md`, escrevendo os limites confirmados neste Todo.
2. Remover do design as formulações incorretas de que Remote Settings faz parte desta tarefa, de que o rename reescreve a Model Selection atual, de que o legacy importer assume a limpeza e de que Settings usa um Draft em pacote inteiro de Provider+Model.
3. Para cada slice seguinte, adicionar primeiro o teste falhando correspondente; se um teste existente cristalizar um comportamento errado, alterá-lo antes para o contrato alvo.

### Slice B: tipo completo do Registry e saída do Resolver

1. Adicionar testes para criação completa de Provider/Model, issues recursivas de campo ausente e serialização completa.
2. Implementar a única entrada de criação validada para os tipos completos do Registry.
3. O Resolver usa esse mesmo resultado único para produzir issues ou Registry value e elimina as asserções cruas de tipo completo.
4. O Resolver preserva explicitamente o Effective Built-in Provider/Model Config.
5. Verificar que Provider/Model Personal-only ainda consegue casar com Built-in Model Rules.
6. Remover, abaixo do Registry, as adaptações de capacidade optional/`unknown` e as verificações de completude duplicadas.

### Slice C: View de Settings em três camadas

1. A Provider View retorna `effectiveBuiltinConfig`, `personalConfig` e `effectiveConfig`.
2. A Model View retorna `effectiveBuiltinConfig`, `personalExactConfig` e `effectiveConfig`.
3. Após restaurar uma folha exata, o Recalculo é feito pelo Resolver, sem derivar Personal a partir do Effective.
4. O Renderer copia apenas Personal ou Personal Exact para o Draft; remover o helper de escrita dupla que modifica Effective e Personal ao mesmo tempo.
5. Preservar a influência das Personal Rules em lote sobre o Effective final e cobrir o resultado após a restauração exata.

### Slice D: separar o salvamento de Provider e Model

1. `savePersonalProvider()` remove o parâmetro `exactModels` e atualiza apenas o Provider Config.
2. A pequena página de Model e as operações de Model enabled na lista de Provider passam a usar `savePersonalModelConfig()`.
3. Ao restaurar um campo de Model, remover apenas aquela folha do Config exato; o Rule só é removido quando o Config fica vazio.
4. Estabelecer uma operação atômica de membro + Rule inicial para criação de Personal Model; remoção, renomeação e reordenação continuam usando operações de domínio explícitas.
5. Remover `replaceExactForProvider()` do caminho normal; a limpeza em lote necessária na remoção de Provider vira uma semântica de remoção privada.
6. Remover `persistModelProvider()` e a cola de formulários em pacote inteiro que percorre todos os models.

### Slice E: ordem de salvamento e Visibility

1. As operações de Provider/Model/membro do mesmo Provider concluem na ordem do usuário; Providers diferentes não bloqueiam uns aos outros.
2. Cobrir rename após salvamento, delete após salvamento, teste que espera o salvamento, troca de página e respostas tardias.
3. A atualização externa de View só atualiza campos não editados e não sobrescreve o Draft em digitação.
4. Só depois de concluído o salvamento granular, Settings/Selection filtram Provider/Model hidden comuns.
5. Preservar o diagnóstico mínimo usado para resolver conflitos Personal quando um Built-in hidden tem o mesmo nome de um Personal.

### Slice F: rename de Provider

1. Adicionar primeiro testes de preservação cobrindo `visibility`, `label`, Access, API e campos de membro.
2. Remover `withoutProviderLabel()`.
3. O rename move o Provider Config e as owned exact Model Rules como estão, preservando a ordem.
4. A navegação da página de configurações acompanha o novo ID; nenhuma Selection, Recent, Automation ou dado histórico é reescrito.
5. Remover planos e testes de importer/migration relacionados ao rename.

### Slice G: fechamento de Connectivity

1. A operação de teste espera os salvamentos de Provider/Model já submetidos e não salva mais em pacote inteiro todos os Model Config.
2. Remover os helpers de UI e o julgamento de admissão do Registry no Host Service baseados na lista de Settings.
3. Usar a cadeia de execução de Workspace existente para entregar a `ModelSelection` exata ao Agente alvo; não adicionar capacidade de configuração remota.
4. O Agente alvo faz a validação final com o Registry/ModelFactory atual e envia a requisição pelo Model/Adapter oficial.
5. O resultado de Settings passa a ser um único tipo union de sucesso/falha; remover `results[]`, `endpointType` e a agregação na UI.
6. Verificar que o teste não modifica Composer, Session, Recent, Model Ativo nem a configuração do Registry.

### Slice H: remover interfaces novas e cola sem uso

1. Remover `previewPersonalProvider()`, `previewPersonalModelConfig()` e seus encaminhamentos, tipos e testes exclusivos.
2. Manter `previewModelConfig()`, usado pela página de criação de Model.
3. Usar `pnpm dep:refs` e busca textual precisa para reconfirmar que o preview antigo, o salvamento em pacote inteiro, as asserções cruas de tipo completo, `withoutProviderLabel()` e os tipos de Endpoint connectivity não têm mais referências em produção.
4. Atualizar o log de implementação; o Feature Graph só é atualizado quando um symbol/code seed real mudar.

## 6. Casos de Aceitação

| Case ID | Setup                                                            | Ação                        | Asserções                                                              | Camada de evidência       |
| ------- | ---------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- | ------------------------- |
| PRS-01  | Effective Provider/Model completo                              | Criar Registry Config        | Retorna tipo estático completo; serialização completa                  | Provider unit + typecheck |
| PRS-02  | Falta folha de Endpoint ou de formato de Model                   | Criar Registry Config        | Retorna issues precisas; não entra no Registry                          | Provider unit             |
| PRS-03  | Built-in + Account Built-in + Personal no mesmo Provider       | Obter Settings View          | Retorna Effective Built-in, Personal esparso e Effective final          | Resolver/Facade unit      |
| PRS-04  | Provider/Model Personal-only casa com Built-in Rule             | Obter Settings View          | Provider sem camada Built-in; Model recebe o padrão da Built-in Rule     | Resolver/Facade unit      |
| PRS-05  | Provider tem as Rules exatas dos models A e B                   | Salvar apenas A             | Condições de correspondência, conteúdo e semântica de ordem de B ficam intactos | Config Service unit   |
| PRS-06  | Existe uma Personal exact Rule que a UI atual não exibe         | Editar um campo do Provider  | A Rule invisível é preservada                                            | Service + UI unit         |
| PRS-07  | Provider/Model hidden comum                                     | Obter Settings/Selection; criação interna precisa | Não é exibido nas entradas do usuário; a criação interna tem sucesso | Facade + Registry unit    |
| PRS-08  | Built-in hidden conflita com Personal do mesmo ID               | Obter Settings               | Retorna apenas o diagnóstico que resolve o conflito; o Built-in continua executável internamente | Resolver/Facade unit      |
| PRS-09  | Personal Provider com todos os campos opcionais                 | Renomear o Provider          | Todos os campos e a ordem do Config são preservados; as owned exact Rules migram | Config Service unit  |
| PRS-10  | Edições rápidas e sucessivas no mesmo Provider                   | Submeter duas operações em sequência | O estado final segue a ordem das ações do usuário; respostas antigas não sobrescrevem nova entrada | UI/Service unit |
| PRS-11  | Model disabled/incomplete                                        | Clicar na UI ou chamar o teste contornando a UI | A UI desabilita normalmente; contornando, o ModelFactory alvo rejeita | UI + Agent unit           |
| PRS-12  | Model executável após salvamento                                 | Testar conexão               | O Model/Adapter oficial completa a requisição; retorna resultado único; o estado de Selection não muda | Service/Core integration |
| PRS-13  | Atualização do Registry após o salvamento e antes da requisição invalida o Model | Testar conexão      | O ModelFactory alvo rejeita conforme o Registry atual, sem confiar na View antiga do Host | Agent integration         |
| PRS-15  | Personal Rule em lote + Rule exata de modelo único               | Restaurar uma folha exata    | O valor final é recalculado por todas as Rules e pode voltar a um valor Personal em lote | Resolver/Facade unit  |
| PRS-16  | Usuário editando, com atualização externa da View               | Receber nova View            | Campos dirty são preservados; campos não editados são atualizados      | UI unit                   |
| PRS-17  | Salvamento ainda não terminou                                   | Renomear o Provider          | Conclui primeiro o salvamento do ID antigo e então migra a identidade; o ID antigo não é recriado | UI/Service unit |
| PRS-18  | Salvamento ainda não terminou                                   | Remover o Provider           | Salvamentos tardios não ressuscitam o Provider após a remoção           | UI/Service unit           |
| PRS-19  | Provider/Model com operações de salvamento pendentes            | Clicar em testar             | Espera o salvamento e então testa o Model oficial mais recente          | UI/Service integration    |
| PRS-20  | A entrada de criação de Model casa com Rules existentes          | Solicitar `previewModelConfig` | Retorna o valor padrão resolvido das Rules; não gera persistência     | Facade/UI unit            |

PRS-05 compara a identidade, a ordem, as condições de correspondência e o conteúdo de configuração das Rules após a resolução, sem exigir igualdade de bytes crus como indentação do arquivo de configuração.

## 7. Podas e Invariantes

| Decision | Escopo podado                                        | Motivo                                                      | Validação representativa                          |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| PD-01    | Produto cartesiano de todas as APIs/Access de Provider | Este Todo não muda a semântica de produto de Access ou Adapter | API Key e os auths de conta/Request Auth existentes mantêm regressão |
| PD-02    | phase de conversa, queue, goal                        | Settings não é dono do estado de tarefas                   | Connectivity afirma que Selection/Model Ativo não mudam |
| PD-03    | Remote Settings/Provisioning/login/sincronização     | Já está definido como capacidade de produto independente   | Não acrescenta PRS nem E2E remoto                   |
| PD-04    | legacy importer/migration                            | O branch ainda não foi publicado, sem compatibilidade com formatos errados | Basta atualizar os fixtures/schema atuais |
| PD-05    | Outros escopos de Todo 11, M4, Todo 13              | Não pertencem ao fechamento desta nova cola                | Reutilizar apenas as fronteiras oficiais já existentes |

O que precisa ser mantido:

- A ordem do Provider Overlay é ZCode Built-in -> Account Built-in -> Personal.
- O Account Built-in apenas restringe o Provider Built-in do ZCode; o Personal sempre sobrepõe por último.
- As Model Rules são ZCode Built-in Rules + Personal Rules, e atuam sobre o Effective Provider.
- Personal Config e Personal exact Rule são sempre esparsos e não podem ser expandidos de volta a partir do Effective.
- A posse, os conflitos, a ordem e o design de enabled de `builtinModelIds` e `modelIds` não mudam.
- Atualizações de Config só afetam Models criados depois; um Model Ativo já criado não sofre hot modification.
- hidden é visibilidade de produto, não é autorização, fronteira de segurança nem isenção de capacidade de execução.
- Connectivity não altera nenhuma seleção de modelo do usuário nem salva estado de Runtime exclusivo de teste.
- A UI de Settings não chama o Repository diretamente e não resolve Config Rules por conta própria.

## 8. Verificação e Definição de Conclusão

### 8.1 Ordem dos Testes

1. Para cada slice, adicionar primeiro os testes unitários falhando de Provider/Services/UI/Agent e só então modificar o código de produção.
2. O Provider unit cobre Overlay, tipo completo, serialização, conflitos, Visibility, rename e mutação de Rule exata.
3. O Services unit cobre a View de três camadas, a ordem de salvamento e a projeção de erros de Connectivity.
4. O UI unit/component cobre o salvamento separado de Provider/Model, a pequena página de Model, enable, restauração, Draft dirty e o botão de teste.
5. A integração Agent/Core cobre a validação final do ModelFactory e a requisição pelo Adapter oficial.
6. Reutilizar o E2E de Provider Settings já existente para cobrir o caminho principal do usuário; não criar casos novos para Remote Settings.
7. Executar ao final `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e os testes afetados.

### 8.2 Condições de Conclusão

1. O Resolver é o único calculador de Effective Built-in, Personal, Effective e dos diagnósticos.
2. A Settings View retorna fatos explícitos em três camadas e o Renderer edita apenas Personal/Personal Exact.
3. Os tipos completos do Registry só podem ser obtidos pela entrada validada única; não há `require`, `unknown` nem asserções cruas de tipo completo no fluxo abaixo.
4. O salvamento de Provider e Model está completamente separado; nenhuma operação comum substitui em pacote inteiro as Rules de outros Models.
5. As operações assíncronas do mesmo Provider mantêm a ordem do usuário, e o comportamento de rename/delete/test e de respostas tardias tem testes.
6. A filtragem por Visibility não perde configurações ocultas, e o diagnóstico de conflitos e a execução interna precisa permanecem corretos.
7. O rename de Provider não reconstrói o Config, não faz limpeza de compatibilidade e não reescreve Selection entre domínios.
8. O Connectivity tem validação final pelo ModelFactory alvo, retorna resultado único e não mantém cola de agregação de Endpoint.
9. As duas APIs de Personal Preview sem chamadas em produção e seus encaminhamentos foram removidas; o preview de Rules para criação de Model foi mantido.
10. O Design de longo prazo, o log de implementação e os code seeds necessários estão consistentes com o código final.
11. Todos os casos de aceitação e verificações obrigatórias passam.
12. A implementação é submetida por slice em Conventional Commits, sem misturar Todo 11, M4 ou a capacidade de produto de configuração remota.

## 9. Registro de Implementação (2026-08-25)

- O Resolver agora calcula de forma única as três camadas Effective Built-in, Personal e Effective, e usa a entrada única de criação de tipo completo para gerar ao mesmo tempo as issues e o Registry Value; a serialização completa não passa mais pela asserção do `toJSON()` esparso.
- A Settings View passou a retornar explicitamente `effectiveBuiltinConfig/personalConfig/effectiveConfig` de Provider e `effectiveBuiltinConfig/personalExactConfig/effectiveConfig` de Model; itens hidden comuns são filtrados depois que as escritas granulares finas estão concluídas.
- O salvamento de Provider e Model foi completamente separado. A criação de Personal Model grava atomicamente o membro e a Rule exata inicial; remoção, renomeação, reordenação e restauração de padrão usam operações de domínio explícitas; o caminho normal da UI não percorre mais todos os models visíveis nem substitui o conjunto de Rules.
- As escritas do mesmo Provider são serializadas pela Facade. As fronteiras de identidade de sucesso e falha de rename/delete, a rejeição do ID antigo e a mesclagem de View externa com campos dirty têm testes; o teste de conexão espera essa fila e então submete a Selection exata ao Environment alvo.
- O rename de Provider move o Config e as owned exact Rules como estão, sem modificar outros estados de domínio como Selection.
- O Connectivity usa a cadeia oficial de Agent ModelFactory/Adapter e retorna resultado único; o julgamento de admissão duplicado do Host, a agregação de Endpoint, a inferência de `endpointType` e as duas APIs de Personal Preview sem uso em produção foram removidos.
- `pnpm knip` ainda relata a grande quantidade preexistente de unused/unlisted do repositório; nesta rodada `dep:refs` e busca textual precisa confirmaram novamente que os símbolos removidos e as entradas de salvamento em pacote inteiro não têm resíduo de referência em produção.