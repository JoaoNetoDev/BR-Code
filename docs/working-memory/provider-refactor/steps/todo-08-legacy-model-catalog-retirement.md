# 08 Aposentadoria do Legacy Model Catalog e da lógica de compatibilidade derivada

> Status: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../research/model-abstraction-unification-cleanup-audit.md`](../research/model-abstraction-unification-cleanup-audit.md)
>
> Roadmap geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)

## 1. Objetivo da tarefa

Eliminar completamente o antigo Model Catalog como segundo sistema de fatos de modelo, de configuração de reasoning e de estratégia de compatibilidade de requisições. Todo fato de modelo
ainda significativo entra nas ZCode Built-in / Personal Model Config Rules; entradas históricas só são convertidas em fronteiras de importer explícitas; a compatibilidade de requisições da API do
Provider é dirigida explicitamente pelo Effective Model Config, sem continuar sendo inferida a partir de um modelId específico.

Este Todo também fecha os três problemas derivados já confirmados durante a aposentadoria do Catalog antigo:

1. Remover o Legacy `modelCatalog.overrides`, que não tem consumidores reais de importer;
2. Remover o `ZCodeModelReasoningState` independente, com o Reasoning UI reutilizando os itens candidatos de seleção de modelo do Registry;
3. Substituir o tratamento especial de Tool Schema por modelId do Kimi K3 pelo campo de Model Config `requiresMfjsToolSchema`.

```text
Resíduo atual

Legacy modelCatalog.overrides --------> Catalog parser / capability merge
Catalog reasoning --------------------> providerOptionsByLevel -> Protocol/UI
modelId == kimi-k3 --------------------> Tool Schema $ref workaround

Objetivo

Built-in / Personal Model Config Rules
                 |
                 v
       Effective Model Config
       |- properties
       |- optionSpecs.reasoningLevel
       |- reasoningMapping
       `- requiresMfjsToolSchema
                 |
                 +--> Registry Selection View -> UI -> ModelSelection.options
                 `--> Montagem da requisição no Adapter -> API do Provider
```

## 2. Decisões centrais

### 2.1 O antigo Model Catalog pode se aposentar por completo

Os fatos normais de execução de Provider/Model vêm apenas de:

```text
ZCode Built-in Provider Config
        -> Account Provider Config
        -> Personal Provider Config
        -> Effective Provider Config

ZCode Built-in Model Config Rules
        + Personal Model Config Rules
        -> Effective Model Config Rules
```

O antigo `ModelCatalogConfig`, `ModelCapability`, `ModelCapabilityProvider`, `ModelCatalogService`,
`ModelCatalogSource`, o snapshot/source de models.dev embarcado e as policies de capability/default/reasoning do Catalog deixam de ser fonte de fatos em
tempo de execução, e nenhum DTO substituto de mesma forma é mantido por compatibilidade.

Fatos que se possa determinar como pertencentes ao modelo ou a uma combinação de integração entram nas Built-in Model Config Rules; Personal Rules continuam sobrescrevendo por baixo. Comportamentos de codificação de requisição que pertencem ao Adapter
são dirigidos por campos explícitos de Model Config ou por implementações de API formais. Não é permitido reinferir capacidades de modelo e parâmetros de requisição a partir do Catalog, do kind de Provider, do Endpoint ou
de um modelId específico.

### 2.2 Remover o Legacy `modelCatalog.overrides`

Tudo o que o antigo `modelCatalog.overrides` conseguia expressar de válido pode ser substituído pelas Personal Model Config Rules:

| Conteúdo legado                 | Destino atual                     |
| --------------------------- | ---------------------------- |
| context window              | `properties.contextWindow`   |
| input format                | `properties.input_format`    |
| Tool / Structured Output    | `properties`                 |
| níveis de reasoning e default      | `optionSpecs.reasoningLevel` |
| parâmetros de reasoning na requisição ao Provider | `reasoningMapping`           |
| diferenças de combinação Provider/Model/API | matcher de Model Config Rule    |

O importer Legacy oficial não consome o `runtimePatch.modelCatalog` devolvido pelo parser e, por isso, não ganha nenhuma migração nova para esse campo:

- Remover Schema, parser, merge/helper, projeção do Catalog e testes dedicados;
- A nova Config não aceita esse campo;
- Não é criado um importer de Personal Model Config;
- Os campos comuns já suportados explicitamente pelo importer em `provider.*.models.*` continuam migrando com o comportamento existente;
- Metadados de exibição como `name` e `family` não constituem motivo para manter o Catalog.

### 2.3 O Reasoning UI reutiliza os candidatos de seleção de modelo

`ZCodeModelReasoningState` não é um estado de execução, mas uma reembalagem, feita pelo protocolo antigo, de uma especificação de opções de modelo para o seletor. A cadeia alvo é fixa:

```text
Effective Model Config.optionSpecs.reasoningLevel
                         |
                         v
            Registry Model Selection View
                         |
                         +--> Composer
                         +--> Subagent
                         +--> Off-Peak
                         `--> Repo Wiki
                                  |
                                  v
              ModelSelection.options.reasoningLevel
```

As decisões são:

- Os candidatos de seleção de modelo fornecem diretamente `optionSpecs.reasoningLevel.values/default`;
- A existência do Option Spec já expressa se há seleção de reasoning; o `enabled` não é mais mantido;
- Remover o tipo `ZCodeModelReasoningState`, seu schema, builder e helper de mapeamento;
- Não criar fetch, Store, Context ou protocolo de sincronização dedicado a reasoning;
- `ModelSelection` guarda apenas o `options.reasoningLevel` que o usuário escolheu explicitamente, sem copiar o conjunto completo de níveis e defaults;
- `providerOptionsByLevel` não entra em Protocol/UI; os parâmetros de Provider ficam apenas no `reasoningMapping` do Effective Model Config, consumidos
  diretamente pelo ModelFactory/Adapter;
- Rótulos de UI e localização são a projeção de exibição da Selection View e não recriam fatos de modelo.

### 2.4 `requiresMfjsToolSchema` substitui o tratamento especial por modelId

É adicionado à raiz do Model Config um campo booleano com suporte a Overlay:

```ts
interface ModelConfigInput {
  properties?: ModelPropertiesConfigInput | null;
  optionSpecs?: ModelOptionSpecsConfigInput | null;
  reasoningMapping?: ReasoningMappingConfig | null;
  requiresMfjsToolSchema?: boolean | null;
}
```

Rules esparsas podem omitir ou sobrescrever esse campo; a Rule Built-in genérica fornece o default completo `false`, e as Rules de combinação exatas de Provider/Model/API que precisam do comportamento de compatibilidade atual sobrescrevem para `true`. No Model Config completo do Registry esse campo precisa ser boolean.

Ele não entra em `Model.properties` e não precisa entrar em Protocol/UI. O Todo 02 já definiu que o Adapter recebe diretamente o Model Config completo do
Registry ao criar o Model, de modo que o closure de execução consegue ler esse campo diretamente.

```text
requiresMfjsToolSchema = false
`- usa o Tool Contract.inputSchema como está

requiresMfjsToolSchema = true
`- copia e projeta o Tool Schema antes de enviar
   |- $ref local resolvível fora de #/$defs -> elevado para o $defs raiz
   |- projeção bem-sucedida -> envia a cópia projetada
   `- não resolvível / não reescrevível -> InvalidModelRequest, a requisição de rede não pode ser enviada
```

Nesta etapa o campo apenas habilita a projeção de `$ref` local para `$defs` raiz que já existe; isso não representa uma implementação nem uma validação do dialeto MFJS completo pelo ZCode.
Nesta rodada não se trata de outras regras MFJS como `oneOf`, `anyOf` e `pattern`, nem se constrói um sistema genérico de dialeto de Tool Schema.

O `ModelToolContract.inputSchema` original permanece sempre intocado e continua sendo a autoridade para validação e execução dos parâmetros da ferramenta. A projeção existe somente na
fronteira de montagem da requisição ao Provider no Adapter. Remover `isKimiK3ModelId()` e toda a lógica que acionava essa conversão por modelId específico do K3.

## 3. Escopo de remoção e alteração

### 3.1 Catalog e Config Legacy

- Remover o `ModelCatalogConfig` restante e o Catalog Service/Source/Capability Provider;
- Remover o snapshot de models.dev embarcado, o loader, os testes que só validam consulta/merge do Catalog e a configuração de empacotamento;
- Remover `default-policy`, `reasoning-policy` e o helper de capability do Catalog que ficaram sem chamadores;
- Remover o Config Schema, o parser, o merge e o runtime patch de `modelCatalog.overrides`;
- `runtime-thought-level` é removido se restar apenas o casamento reverso do Catalog; a Telemetry existente só pode ler Model options/mapeamentos explícitos e
  não é reconstruído um Catalog para preservar a observabilidade.

### 3.2 Protocol e UI

- O protocolo de candidatos de modelo passa a expressar diretamente o reasoning Option Spec;
- Remover `ZCodeModelReasoningState`, `buildProtocolReasoningState()` e a projeção antiga de reasoning do Provider;
- Remover o campo entre processos `providerOptionsByLevel`;
- Composer, Subagent, Off-Peak e Repo Wiki passam a ler uniformemente values/default dos candidatos atuais;
- Não mudar a atribuição de estado de rascunho, salvamento e submissão de cada entrada de produto.

### 3.3 Projeção de Tool Schema no Adapter

- `toAiSdkTools()` obtém `requiresMfjsToolSchema` do Model Config completo disponível na criação;
- Preservar e nomear com precisão a implementação existente de elevação de referências locais;
- Uma referência-alvo não resolvível não vaza mais como está para o Provider e, em vez disso, lança um `InvalidModelRequest` tipado antes da requisição;
- generate e stream compartilham a mesma projeção e o mesmo caminho de falha;
- O erro contém o nome da Tool e o `$ref` que falhou, e não pode conter Secret nem conteúdo de requisição sem relação;
- Remover de `default-policy.ts` o julgamento de Schema do Kimi K3 e sua lista de variantes de modelId.

## 4. Explicitamente fora do escopo deste Todo

- validator/projector MFJS completo ou arquitetura genérica de dialeto de Tool Schema;
- Aposentadoria completa do `ModelProviderModelConfig` do Off-Peak;
- `ModelRef` público, identidade de Result/Event e provenance histórico;
- Design geral de Telemetry, Status, Context e Observation;
- Account Request Auth e atualização de header de runtime;
- Auditoria de migração com correspondência folha a folha do Catalog antigo para a Config Built-in do ZCode;
- Semântica de seleção de modelo, Queue, recuperação ou realtime desktop/mobile.

## 5. Testes primeiro

### 5.1 Config e Registry

1. `requiresMfjsToolSchema` suporta omissão na Rule, `true`, `false`, `null` e sobrescrita posterior de Personal;
2. A Rule Built-in genérica fornece `false`, e a verificação de completude rejeita ausência/nulo no resultado final;
3. A combinação alvo de Provider/Model/API da Config Built-in do ZCode resolve para `true`, e as combinações não-alvo permanecem `false`;
4. O round-trip do JSON da Config preserva esse campo;
5. Registry/ModelFactory não preenchem nem sobrescrevem esse campo por modelId.

### 5.2 Catalog Legacy

1. O novo Schema não aceita `modelCatalog.overrides`;
2. O importer Legacy não lê, não migra e não preserva esse campo;
3. A regressão da migração dos campos já suportados em `provider.*.models.*` continua inalterada;
4. Inicialização normal, seleção de modelo e execução de requisições não constroem Catalog;
5. Após remover models.dev/Catalog, os fatos de modelo Official/Personal continuam resolvíveis.

### 5.3 Reasoning Selection View

1. Candidatos com Option Spec publicam values/default; sem Option Spec não há seleção de reasoning publicada;
2. Composer, Subagent, Off-Peak e Repo Wiki leem o mesmo fato candidato;
3. A submissão escreve apenas `ModelSelection.options.reasoningLevel`;
4. Não há `enabled` nem `providerOptionsByLevel` em Protocol/UI;
5. O Adapter ainda produz os parâmetros de requisição ao Provider conforme `reasoningMapping[level]`.

### 5.4 Projeção de Tool Schema

1. Com o campo `false`, o Schema permanece como está;
2. Com o campo `true`, referências `#/properties/...` resolvíveis são elevadas ao `$defs` raiz;
3. A mesma referência reutiliza o mesmo item de `$defs`, e os `$defs` existentes não são sobrescritos;
4. O Tool Contract original é profundamente igual e permanece não modificado;
5. Referências locais não resolvíveis lançam `InvalidModelRequest` antes da rede;
6. O erro contém o nome da Tool e o caminho da referência;
7. O comportamento de generate e stream é consistente;
8. O mesmo modelId não é convertido quando o campo é `false`, e não existe mais comportamento implícito por nome de modelo.

## 6. Ordem de implementação

### Step A: contrato de Config e testes

- Adicionar primeiro os testes de falha de Overlay de Model Config, completude, Rule Built-in do ZCode e round-trip JSON;
- Adicionar o campo `requiresMfjsToolSchema` ao Schema/Config/Registry;
- Declarar o valor na Rule Built-in genérica e nas Rules exatas alvo.

### Step B: Tool Schema dirigido explicitamente

- Adicionar primeiro os testes de Adapter de projeção bem-sucedida, com falha, com o objeto original intacto e com modelId sem efeito;
- Fazer o Adapter ler o campo do Model Config completo;
- Remover o tratamento especial por modelId do Kimi e as suposições antigas dos testes.

### Step C: aposentadoria do Catalog e do protocolo de Reasoning

- Remover a superfície de entrada Legacy `modelCatalog.overrides`;
- Remover os dados restantes do Catalog, Service/Source, policies e chamadores;
- Fazer a Selection View publicar diretamente o reasoning Option Spec;
- Migrar os consumidores de UI e remover o Reasoning State independente.

### Step D: verificação e commit

- Executar os testes unitários afetados de Provider Config, Registry, Bootstrap, Adapter, Protocol e UI;
- Executar `pnpm typecheck`, `pnpm lint` e `pnpm fmt:check`;
- Executar regressões representativas no wire de Tool e no protocolo de seleção de modelo;
- Conventional Commit independente.

## 7. Zeragem mecânica e definição de conclusão

- O código de produção normal não tem `ModelCatalogConfig`, `ModelCatalogService` nem `ModelCapabilityProvider`;
- Não há snapshot/source de models.dev embarcado nem o item de empacotamento de produção correspondente;
- O Config Schema/Runtime patch não tem `modelCatalog.overrides`;
- Protocol/UI não têm `ZCodeModelReasoningState`, `enabled` nem `providerOptionsByLevel`;
- O Adapter não tem `isKimiK3ModelId()` nem outro hardcode de modelId para Tool Schema;
- `requiresMfjsToolSchema` vem somente do Effective Model Config;
- A falha de projeção é fail-closed antes da requisição de rede e não pode apagar silenciosamente a Tool nem enviar como está uma referência sabidamente não conversível;
- Não é criado nenhum alias de Catalog, mapa de capability de runtime, Reasoning State ou Registry de compatibilidade de Tool Schema.

Depois de concluído, os fatos estáticos de Provider/Model existem apenas na cadeia atual Config/Registry/Model; o Reasoning UI consome apenas os fatos candidatos de seleção de
modelo; e a compatibilidade conhecida de Tool Schema do K3 é dirigida pelo Model Config explícito, sem depender mais do Catalog antigo ou de nomes de modelo específicos.