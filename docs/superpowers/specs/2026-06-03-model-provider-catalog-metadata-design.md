# Design de catálogo e metadata de model providers

## Contexto

A cadeia atual de fornecedores de modelos já está dividida em duas camadas de fonte de verdade:

- O `modelProviderService` do Host gerencia a configuração de providers do lado do app, a API Key, o endpoint, a importação de catálogo e a persistência em disco.
- O ZCode Agent server recebe o snapshot do provider registry gerado pelo Host e mantém o diretório de modelos em runtime, o modelo atual e o nível de reasoning/thought.

A página de configurações já suporta importar providers de `models.dev`, providers customizados, editar a lista de ids de modelos e os campos básicos do provider. Na rota do ZCode Agent, a caixa de conversa prioriza `settings.model.available/current` retornados pelo agent, e o provider registry do Host é sincronizado por calor com o agent via `workspace/updateProviderRegistry`.

Agora o catálogo de LLM da China em fase de desenvolvimento, a ordenação de providers por arrastar e soltar e o metadata de runtime por modelo entram no design oficial. Este design descreve apenas o contrato e as fronteiras de implementação entre os registries de app/host/agent, sem alterar as regras de ownership da链路 de controle remoto.

## Objetivos

- Incorporar `models_catalog_china_llm_zcode_2026-06-03.json` como fonte de catálogo temporária da fase de desenvolvimento, reserving um ponto de migração claro para um download posterior via CDN.
- Fazer o modelo de dados do catálogo seguir o JSON schema `zcode.model-providers.v1`: preservar `kind`, `endpoints.baseURL + paths`, `model.kinds`, `modalities` e o patch de reasoning, sem se passar por `models.dev`.
- Suportar ordenação de providers por arrastar e soltar, com o resultado persistido e aplicado pela UI tanto à navegação de providers da página de configurações quanto à ordem dos grupos de providers da caixa de conversa.
- Convergir os campos de modelo individual do antigo `string[] + metadata map` para um array de objetos de modelo, evitando escrita dupla de campos antigos e novos por muito tempo.
- Fazer as capacidades de modelo após a importação do catálogo entrarem em `ModelProviderConfig` e, em seguida, serem projetadas por `convertModelProviderConfigToZCodeProviderInput` em `ZCodeModelProviderInput.models[*]` do ZCode Protocol.
- Manter inalterada a semântica de sincronização do provider registry entre desktop, workspace remoto local, attachment shared-host do `/remote` pelo celular.

## Não objetivos

- Não implementar nesta etapa serviço de CDN, verificação de assinatura, atualização incremental nem estratégia de cache offline.
- Não fazer a ordenação por arrastar e soltar mudar o agrupamento de origem do provider; arrastar só muda a ordem relativa de exibição e não altera `source`, a identidade predefinida nem a identidade oficial por OAuth.
- Não expandir a edição de modelo individual para gestão completa de preço, limitação de taxa, região, cobrança e fallback de múltiplos endpoints.
- Não deixar a UI carregar metadata de provider/model no momento de `session/send`; em runtime continua se usando apenas o workspace model catalog já aplicado pelo agent server.
- A v1 não oferece um editor de JSON de patch de reasoning arbitrário. O patch de reasoning vem primeiro do catálogo ou da lógica de migração, evitando que o usuário escreva na UI parâmetros com formato correto mas inutilizáveis em runtime.

## Restrições atuais

- `models_catalog_china_llm_zcode_2026-06-03.json` segue o schema `zcode.model-providers.v1`. Sua key `endpoints.paths` é o `kind` de runtime: `anthropic`, `openai`, `openai-compatible`; o JSON público não pode conter o nome interno do AI SDK `openaiCompatible`.
- `endpoints.baseURL + endpoints.paths[kind]` descreve o endereço de requisição daquele kind. Como o protocolo atual de app/agent tem apenas um effective provider kind/baseURL, a importação e a projeção precisam escolher explicitamente o effective kind, sem descartar cedo os outros kinds no catalog model unificado.
- `model.kinds` representa os formatos de interface suportados pelo modelo individual e precisa existir em `endpoints.paths` do provider. `modalities` é a fonte das capacidades de entrada/saída do modelo; booleanos da UI como `supportsImages` devem ser derivados dela.
- `reasoning.levels[level][kind]` é um patch de parâmetros de requisição, não providerOptions finais, e não inclui label, rank ou enabled de UI. A camada de conversão precisa mapear o namespace público `openai-compatible` do JSON público para o `openaiCompatible` interno do AI SDK.
- O `ModelProviderConfig.models` atual é um `string[]`, mas, se esta etapa mudar oficialmente para um array de objetos de modelo, é obrigatório fornecer uma migração automática única do `model-providers.json` antigo, senão os providers de quem atualiza serão perdidos ou não poderão ser lidos por incompatibilidade de schema.
- O `sortModelProvidersForDisplay` atual reordena por buckets de providers embutidos, então a ordem de um array comum não representa a ordenação do usuário.
- O ZCode Protocol já tem `ZCodeModelReasoningState`:
  - `enabled`
  - `levels: { value, label, description? }[]`
  - `defaultLevel?`
  - `providerOptionsByLevel?`

## Design da Catalog Source

### Camada de sources

Cria-se uma abstração de catalog source do lado do app, sem passar o catálogo de LLM da China pelo schema original de `models.dev`.

```ts
type ModelProviderCatalogSourceId =
  | "models-dev"
  | "china-llm-zcode-dev";

interface ModelProviderCatalogSource {
  id: ModelProviderCatalogSourceId;
  label: string;
  load(): Promise<ModelProviderCatalogFile>;
}
```

`models-dev` continua obtendo dados de `https://models.dev/api.json`, mas, após o parsing, também é convertido no catalog file unificado do app. `china-llm-zcode-dev`, na fase de desenvolvimento, lê `models_catalog_china_llm_zcode_2026-06-03.json` na raiz do repositório.

`catalogSourceId` indica apenas "de qual catálogo importar" e não pode ser confundido com o agrupamento de origem de produto do provider. O `source` do provider continua expressando apenas semântica de produto como `builtin`, `models-dev`, `custom`, `workspace`; se for necessário adicionar uma nova origem de produto no futuro, é preciso estender formalmente o shared schema, o source schema do protocol e a lógica de agrupamento da UI.

### Catalog model unificado

O catalog model unificado interno segue diretamente o JSON schema público, evitando perder campos na etapa de source adapter:

```ts
type ModelProviderKind = "anthropic" | "openai" | "openai-compatible";
type Modality = "text" | "image" | "video" | "audio" | "pdf";

interface ModelProviderCatalogFile {
  schemaVersion: "zcode.model-providers.v1";
  providers: ModelProviderCatalogProvider[];
}

interface ModelProviderCatalogProvider {
  id: string;
  name: string;
  endpoints: {
    baseURL: string;
    paths: Partial<Record<ModelProviderKind, string>>;
  };
  defaultKind?: ModelProviderKind;
  models: ModelProviderCatalogModel[];
}

interface ModelProviderCatalogModel {
  id: string;
  name?: string;
  kinds: ModelProviderKind[];
  defaultKind?: ModelProviderKind;
  modelIdByKind?: Partial<Record<ModelProviderKind, string>>;
  modalities: {
    input: Modality[];
    output: Modality[];
  };
  contextWindow: number;
  maxOutputTokens?: number;
  reasoning?: ModelProviderReasoningSpec;
}

interface ModelProviderReasoningSpec {
  defaultLevel?: string;
  levels: Record<string, Partial<Record<ModelProviderKind, ProviderOptionsPatch>>>;
}

interface ProviderOptionsPatch {
  set?: Array<{ path: string[]; value: unknown }>;
  unset?: Array<{ path: string[] }>;
}
```

O adapter de `models.dev` converte os campos antigos para esse modelo:

- o `api` do provider entra em um endpoint de um effective kind;
- `attachment` / `modalities.input` viram `modalities`, sem gerar um campo persistido `supportsImages`;
- capacidades booleanas exclusivas do `models.dev`, como `tool_call` e `structured_output`, servem apenas como metadata opcional de runtime na importação; se o schema unificado atual não tem campo que as carregue, não devem ser enfiadas em campos sem relação;
- com apenas `supportsReasoning: true` e sem detalhe de level/patch, não se geram reasoning levels falsos; esses modelos aparecem na UI como "possivelmente compatível com reasoning", sem declarar thought levels selecionáveis ao agent.

### Arquivo local temporário e ponto de migração para CDN

Na fase de desenvolvimento a source `china-llm-zcode-dev` lê um arquivo JSON local. O loader dessa source precisa definir de forma centralizada o futuro ponto de migração para a URL de CDN e registrar em documentação:

- etapa atual: ler o arquivo de catálogo local, facilitando o desenvolvimento rápido e a revisão;
- etapa CDN: a mesma source id passa a baixar o JSON via `ApiClient`, mantendo o fallback local de desenvolvimento;
- trocar para CDN não altera o catalog model unificado, o schema de persistência da configuração de providers nem a projeção para o agent registry.

## Design da configuração de Provider

### Nova estrutura persistida

Não se adiciona mais um map `modelMetadata` nem se mantém por muito tempo a escrita dupla `modelDisplayNames` / `modelSupportedFormats`. A nova estrutura persistida coloca o id do modelo e o metadata no mesmo objeto:

```ts
interface ModelProviderStoreFile {
  schemaVersion: "zcode.model-providers.v2";
  providers: ModelProviderConfig[];
}

interface ModelProviderConfig {
  id: string;
  name: string;
  enabled?: boolean;
  systemDisabledReason?: ModelProviderSystemDisabledReason;
  source?: ModelProviderSource;
  catalogSourceId?: ModelProviderCatalogSourceId;
  catalogProviderId?: string;
  apiKey: string;
  apiKeyRequired?: boolean;
  apiKeyUrl?: string;
  headers?: Record<string, string>;
  logoUrl?: string;
  endpoints: {
    baseURL: string;
    paths: Partial<Record<ModelProviderKind, string>>;
  };
  defaultKind?: ModelProviderKind;
  models: ModelProviderModelConfig[];
  providerMappings?: ProviderModelMappings;
  createdAt: number;
  updatedAt: number;
}

interface ModelProviderModelConfig extends ModelProviderCatalogModel {
  disabledReason?: string;
}
```

A razão é que o fato central do novo catálogo já é o objeto de modelo. Continuar com `models: string[]` e completar o metadata com vários maps obrigaria a manter vários índices sincronizados em renomeação, exclusão, ordenação, importação e projeção, o que é complexo e gera facilmente metadata órfã.

### Migração automática de dados antigos

É necessária a lógica de migração automática do `model-providers.json` antigo. Aqui "migração" não é compatibilidade de longa duração com campos antigos, e sim uma conversão única para a nova estrutura ao ler o arquivo antigo, com escrita atômica de volta em v2 após a conversão bem-sucedida.

Lógica de leitura:

1. Se o arquivo é `{ schemaVersion: "zcode.model-providers.v2", providers: [...] }`, lê pelo novo schema.
2. Se o arquivo é o array simples antigo, faz parsing pelo `modelProviderListSchema` antigo e então converte para v2.
3. Se o parsing falhar, não sobrescreve o arquivo original; registra um warn e degrada para lista vazia ou o fallback seguro já existente.
4. Antes de escrever de volta o v2, guarda um backup, por exemplo `model-providers.v1.backup.json`. Falha ao gerar o backup não deve bloquear a leitura, mas precisa ser registrada como warn.

Regras de conversão de provider antigo para v2:

- `models: string[]` vira `models: ModelProviderModelConfig[]`, com cada modelo contendo pelo menos `id`, `name`, `kinds`, `modalities` e um `contextWindow` conservador;
- `modelDisplayNames[modelId]` vira o `name` do modelo;
- `modelSupportedFormats[modelId]` vira `kinds` do modelo:
  - `anthropic` -> `anthropic`
  - `openai` -> `openai-compatible`
  - `responses` -> `openai`
  - `gemini` hoje não tem `ModelProviderKind` correspondente, então nada é escrito em `kinds` durante a migração; se um modelo ficar só com `gemini`, o provider é preservado, mas o modelo é desabilitado ou marcado com `disabledReason`, evitando gerar silenciosamente uma configuração de runtime inutilizável;
- o `apiFormat` antigo determina o `defaultKind` do provider:
  - `anthropic-messages` -> `anthropic`
  - `openai-chat-completions` -> `openai-compatible`
  - `openai-responses` -> `openai`
- `endpoints.anthropic` / `endpoints.openai` antigos são URLs históricas adapter-ready e não podem ser quebrados de forma confiável em `baseURL + path`. Na migração, o endpoint legado selecionado é colocado como está em `endpoints.baseURL`, o `paths[kind]` correspondente recebe string vazia, e a semântica é fixada por comentário ou teste: path vazio significa que o baseURL legado já contém o caminho de que o adapter precisa;
- `providerMappings`, `enabled`, `systemDisabledReason`, `apiKey`, `headers`, `createdAt` e `updatedAt` são preservados como estão.

Sem esse trecho de migração, o novo schema depois da atualização trataria o array antigo como arquivo inválido, e os providers, API Keys, listas de modelos e estados de开关 já existentes do usuário teriam risco de ser perdidos.

## Design da ordenação de Providers

### Propriedade do estado

A ordem de exibição dos providers é uma preferência de UI/configurações e não afeta o comportamento de requisição do agent. Ela não entra em `ZCodeModelProviderInput` e não dispara uma revisão do provider registry por causa de uma simples mudança de ordenação.

A persistência da ordenação é independente da config de runtime dos providers:

```ts
interface ModelProviderDisplayOrderState {
  providerIds: string[];
  updatedAt: number;
}
```

Recomenda-se que `modelProviderService` ofereça métodos separados para ler e salvar esse estado, com um arquivo em disco independente de `model-providers.json`. Assim, arrastar para ordenar não dispara `onDidChangeProviderRegistry` por engano e não faz o agent remoto reconstruir o catálogo de providers por causa da ordem de exibição.

### Regras de ordenação

A função de ordenação de exibição recebe a lista de providers e a ordenação opcional do usuário:

1. Providers que já estão em `providerIds` são exibidos nessa ordem.
2. Providers novos que não aparecem em `providerIds` vão, pelo fallback de bucket atual, para o fim do grupo correspondente.
3. Os ids de providers removidos são limpos ao salvar a próxima ordenação.
4. O agrupamento de origem dos providers continua sendo determinado pelas regras existentes; arrastar não muda a identidade do grupo.

Os pontos de aplicação da ordenação precisam ser claramente divididos em dois:

- navegação da página de configurações: aplicar o display order dentro de cada grupo arrastável;
- seletor de modelos da caixa de conversa: primeiro construir os grupos de providers a partir de `settings.model.available` retornado pelo agent e depois reordenar os grupos pelo display order local; a ordem dos modelos dentro do grupo continua sendo a ordem do agent/catalogo. Assim, o display order não precisa entrar no registry e ainda afeta a exibição na caixa de conversa.

`buildProviderRegistrySnapshot` pode continuar ordenando os providers por regras estáveis para garantir que a revision seja reproduzível. Editar apenas o display order não chama `convertModelProviderConfigToZCodeProviderInput` nem altera a revision do provider registry.

### Interação de arrastar e soltar

Usa o `@dnd-kit` já presente no projeto:

- os itens de navegação de provider à esquerda mostram um handle de arraste `GripVertical`;
- apenas nós de provider reais podem ser arrastados; `添加供应商`, nós de loading e títulos de grupo não podem;
- grupos predefinidos, grupos customizados e o grupo oficial mantêm as fronteiras de grupo. Arrastar entre grupos não muda o source do provider e a v1 não suporta mover entre grupos;
- ao fim do arraste, atualiza a ordem local de forma otimista e salva; se o salvamento falhar, restaura a ordem anterior e registra um warn pelo logger da UI;
- a acessibilidade por teclado segue os attributes/listeners padrão do sortable do `@dnd-kit`, e o botão de arraste tem aria-label e tooltip internacionalizados.

## Design de Reasoning

### Fronteira de dados

O reasoning na persistência e no catálogo mantém apenas fatos de runtime:

- `defaultLevel`
- `levels[level][kind].set`
- `levels[level][kind].unset`

Não são persistidos label, description, rank ou `enabled` de UI. O label exibido na UI é derivado por i18n a partir do id do level, por exemplo `off`, `enabled`, `high`, `max`; um level desconhecido exibe o value original.

### Projeção para o ZCode Protocol

Ao construir cada `models[*]` em `convertModelProviderConfigToZCodeProviderInput`:

1. Escolher o effective kind: `model.defaultKind ?? provider.defaultKind`.
2. Validar que o effective kind existe em `model.kinds` e em `provider.endpoints.paths`. Se não for satisfeito, desabilitar o modelo ou pulá-lo e registrar um warn.
3. Escolher o nome de runtime do modelo: `model.modelIdByKind?.[effectiveKind] ?? model.id`.
4. Derivar `supportsImages` a partir de `modalities.input`; `supportsTools` e `supportsJsonSchemaOutput`, se precisarem de suporte, devem ser adicionados como campos de schema próprios e não adivinhados a partir de campos sem relação.
5. Passar adiante `contextWindow` e `maxOutputTokens`.
6. Se `reasoning.levels` existir, para cada level pegar o patch do effective kind atual e convertê-lo em `providerOptionsByLevel[level]`:
   - `set` escreve no objeto aninhado conforme o path;
   - `unset` remove o path correspondente ao gerar os provider options, ou usa um sentinel unificado removido antes da aplicação final em runtime;
   - o mapeamento de namespace é `anthropic -> anthropic`, `openai -> openai`, `openai-compatible -> openaiCompatible`.
7. Ao gerar `ZCodeModelReasoningState.levels`, preencher apenas `{ value, label }`, com o label gerado por i18n/mapeamento local.
8. `defaultLevel` só é passado adiante se existir nos levels; caso contrário, usa-se o primeiro level.

Se o modelo não tiver patch de reasoning, não se gera level apenas com label nem se declaram thought levels selecionáveis.

### Edição na página de configurações

A v1 oferece apenas edições de baixo risco:

- Provider: nome, API Key, baseURL, paths de kind, kind padrão;
- Model: id do modelo, nome de exibição, kinds suportados, kind padrão, modalities, context window, max output tokens;
- Reasoning: ver os levels já existentes no catálogo e permitir habilitar/desabilitar levels existentes; após remover o level padrão atual, escolher como padrão o primeiro level restante conforme as regras de normalização.

A v1 não oferece "adicionar qualquer reasoning level" nem "edição avançada de parâmetros JSON". A razão é que o patch de reasoning são parâmetros de requisição de runtime, não configuração de exibição; sem documentação do provider e sem testes de apoio, a UI facilmente salvaria um level selecionável pelo agent mas inutilizável na requisição. Se for preciso suportar patches customizados no futuro, isso deve virar uma função avançada à parte, reutilizando o patch editor do schema do catálogo e o teste de conectividade.

## Projeção para o Agent Registry

`convertModelProviderConfigToZCodeProviderInput` precisa projetar a provider config v2 para o ZCode Protocol atual:

- o `kind` do provider usa o effective kind;
- o `baseURL` do provider usa o runtime baseURL resolvido conforme o effective kind. O path vazio gerado pela migração legada significa que o `baseURL` já é a antiga URL adapter-ready;
- `models[*].modelId` usa o nome de modelo consciente de kind;
- `models[*].label` usa o `name` do modelo;
- `models[*].contextWindow`, `maxOutputTokens` e `supportsImages` são passados adiante/derivados do objeto de modelo;
- `models[*].reasoning` usa o `ZCodeModelReasoningState` convertido a partir do patch;
- `models[*].providerOptions.supportedFormats` deixa de ser a principal fonte de verdade; se o agent atual ainda depender dele para filtrar formatos, ele pode ser gerado temporariamente na projeção a partir de `model.kinds`, convergindo depois para a semântica de kind.

Alterar metadata de runtime de provider/model dispara uma revisão do registry snapshot, afetando o próximo turno. Alterar apenas o display order não dispara revisão do registry snapshot.

## Fronteiras de controle remoto e multi-plataforma

- O `/remote` do celular continua se conectando, via shared-host attachment, a um host já existente na janela do desktop e não cria um runtime de provider independente;
- o metadata de provider continua sendo enviado pelo snapshot do provider registry do Host local para o agent server do workspace remoto;
- `workspaceIdentity` continua sendo usada para o isolamento de identidade do sync do provider registry de workspaces remotos; se o novo display order for uma preferência global do app, ele não usa partição por workspace identity;
- a semântica dos eventos de sessão do desktop continuous e do mobile web-remote replayable não muda. A atualização do provider registry continua passando por workspace state update e não espalha a semântica de snapshot replayable para o链路 principal do desktop continuous.

## Logs

- Logs de interação como falha ao salvar o arraste da UI ou falha na normalização de reasoning level usam `packages/ui/src/logger.ts`.
- Logs da camada de serviço como carregamento de catálogo, falha de parsing, falha de download no CDN e sucesso/falha da migração de config de providers antigos usam `createServiceLogger("ModelProviderService")` ou um service logger equivalente. Caminhos de alta frequência não registram info.
- Mudanças na revision do provider registry só são registradas quando há mudança de metadata/comportamento de provider; salvar o display order não é registrado como atualização de registry.

## Testes e aceitação

- Os testes de shared schema cobrem:
  - o parsing do catalog file `zcode.model-providers.v1`;
  - o parsing do provider store `zcode.model-providers.v2`;
  - a migração automática do array simples antigo `model-providers.json` para v2;
  - a validação de `set` / `unset` do patch de reasoning e o mapeamento de namespace;
  - `convertModelProviderConfigToZCodeProviderInput` passando adiante context, output, capacidades derivadas de modalities e reasoning.
- Os testes de serviço cobrem:
  - o adapter de `models.dev` continua usável e produz o catalog model unificado;
  - o adapter `china-llm-zcode-dev` consegue fazer parsing do catálogo local;
  - após a migração da config antiga de provider, API Key, enabled, providerMappings, nomes de exibição de modelos e formatos de modelos não se perdem;
  - salvar o display order não dispara o evento de provider registry changed.
- Os testes de UI cobrem:
  - a ordem persiste após arrastar os providers na navegação da página de configurações;
  - após importar do catálogo por `添加供应商`, os objetos de modelo entram corretamente no rascunho;
  - os reasoning levels de um modelo individual podem ser habilitados/desabilitados; após remover o level padrão, a regra de normalização é aplicada;
  - ao editar apenas o display order, a ordem dos grupos de providers muda na página de configurações e na caixa de conversa, mas a revision do registry snapshot do agent não muda.
- A verificação manual cobre:
  - workspace local desktop: importar um provider do catálogo, definir a API Key e ver o metadata dos modelos na caixa de conversa;
  - workspace remoto: após o sync do snapshot do provider registry, o agent remoto enxerga as mesmas capacidades de modelo;
  - `/remote` pelo celular: após reconectar, a lista de modelos vem do agent state do host já attached, sem criar um runtime de provider independente.

## Ordem de implementação

1. Estender os tipos e schemas compartilhados, adicionando o catalog schema, o provider store v2 schema e a função de migração de dados antigos.
2. Abstrair a catalog source e fazer tanto `models.dev` quanto o catálogo local de LLM da China serem convertidos para o catalog model unificado.
3. Alterar a lógica de importação de providers para que o catalog model seja escrito no array de objetos v2 `ModelProviderConfig.models`.
4. Alterar a projeção para o agent registry para suportar effective kind, derivação por modalities e conversão de patch de reasoning.
5. Adicionar as interfaces de serviço de leitura/salvamento de display order e o hook de UI.
6. Reformular a ordenação da navegação de providers e a interação de arrastar e soltar.
7. Reformular a ordenação dos grupos de providers na caixa de conversa, aplicando o display order no lado da UI.
8. Reformular a UI de edição de modelo individual, com foco nos campos do objeto de modelo e em habilitar/desabilitar reasoning levels existentes.
9. Completar os testes e rodar `pnpm typecheck` e `pnpm lint`.

## Próximos passos

A transformação do catálogo de LLM da China em CDN é um item claramente seguinte: na fase de desenvolvimento usa-se o `models_catalog_china_llm_zcode_2026-06-03.json` local e, depois que o processo de revisão e publicação do catálogo estabilizar, o loader `china-llm-zcode-dev` passa a baixar via CDN, mantendo o fallback local para depuração em desenvolvimento. Essa troca não pode alterar o schema de persistência dos providers nem a projeção para o ZCode Protocol.