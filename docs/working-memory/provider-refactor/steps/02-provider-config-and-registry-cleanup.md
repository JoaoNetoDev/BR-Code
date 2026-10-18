# Encerramento da M2

> Estado: implementação e verificação final da branch concluídas, pode entrar na revisão de lançamento
>
> Última revisão: 2026-08-21

Esta rodada de limpeza concluiu o último objetivo da M2: configuração, exibição, seleção e execução dos Providers comuns de longo prazo voltaram a uma única cadeia de verdade.

```text
Official Provider Config
        +
Personal Provider Config
        +
Account Provider Config
        |
        v
Process Provider Registry
        |
        v
Model
```

O módulo de migração física ainda consegue ler os arquivos antigos; tarefas off-peak ainda podem fornecer entrada de execução única via `turnRuntimeModel`; ambos ficam dentro de limites explícitos e não participam da verdade estável do Provider comum de longo prazo.

O `RuntimeConfigPatch` genérico também deixou os campos do modelo antigo. No arquivo CLI antigo, `provider`, `model` e `modelCatalog` só são lidos pela projeção de migração explicitamente nomeada; configuração de arquivo comum, configuração por variáveis de ambiente e o Config Merger não geram mais, mesclam nem expõem fatos de modelo. Portanto o antigo `ZCODE_MODEL` / `ZCODE_BASE_URL` não forma mais um caminho oculto de configuração de execução.

O Schema de configuração de execução do arquivo CLI comum também não declara mais `provider`, `model`, `modelCatalog` ou `small_model`. Mesmo que esses campos restem ou estejam malformados, eles não fazem a configuração formal do mesmo arquivo — MCP, permissões, rede etc. — falhar no carregamento inteiro; apenas o Legacy Schema usado pelo Personal Importer one-shot os lê e valida estritamente.

## Limpanças concluídas

### Repo Wiki

O Repo Wiki consome diretamente `ModelSelectionView` e emite requisições por meio do `Model` unificado. A projeção intermediária `ZCodeProviderRegistrySnapshot`, o resolvedor reverso, o antigo resolvedor de readiness e seus testes já foram removidos.

### Conectividade das configurações e validação de segurança

O teste de conectividade recebe rascunhos formais de Provider/Model Config. A cadeia de validação de segurança lê o formato de API e o endereço na Provider Settings View formal. Os dois caminhos não reinterpretam mais a antiga estrutura endpoint/defaultKind.

### Seleção de modelo e código auxiliar

Helpers antigos, módulos wrapper, reexports e testes dedicados que já não têm consumidores de produção no menu de modelos, na seleção de Bot, no Workspace Prepare, na exibição de planos e na ordenação de modelos foram removidos; os arquivos ainda em uso mantêm apenas a metade necessária ao novo Registry/View.

### Rascunhos legados de armazenamento de Provider em Services

A auditoria de referências de todo o repositório removeu mais cinco arquivos antigos sem consumidores: o cache de arquivo de estado da entrada de planos, o repositório de configuração de Provider do GLM workspace, o rascunho de arquivo atômico não conectado ao Repositório formal e o parser JSONC antigo de Provider settings. Eles carregavam, respectivamente, a disponibilidade antiga de planos, a configuração de Provider do Workspace e outra forma física de ler Config; mantê-los faria o código parecer que ainda é possível contornar Official, Personal e Account Source para estabelecer fatos de Provider.

Também foi removida a constante de Header de override de modelo antigo que não era lida por nenhuma entrada. Restou apenas um arquivo órfão, sem injeção de requisição, protocolo ou consumidor de configuração; mantê-lo sugeriria que ainda existe outra entrada de override de modelo.

Services agora tem testes estruturais que fixam a saída desses arquivos. Esse gate não proíbe novos utilitários genéricos de IO, mas os nomes e responsabilidades antigos não podem ser restaurados sem uma nova decisão de arquitetura.

### Process Registry

A Entry de produção agora precisa iniciar com sucesso o Registry de nível de processo. A ausência dos caminhos de Official ou Personal Config expõe diretamente um erro de montagem, em vez de criar silenciosamente um segundo conjunto de fatos de Provider.

```text
Protocol Entry
    |
    | required
    v
Process Provider Registry
    |
    +-- create / resume / switch
    +-- workspace model view
    +-- context window
    +-- model fallback
    +-- execution
```

O fork `hasProcessProviderRegistry` e o fallback de Workspace Provider Catalog saíram. O Harness de testes também monta o Registry explicitamente, portanto os testes não continuam mascarando dependências de produção ausentes.

### Estado de modelo do Workspace

O antigo `workspaceModelCatalogs` foi encolhido e renomeado para `workspaceModelPreferences`. Ele guarda apenas a interação e a seleção persistida:

```text
Workspace Model Preferences
├─ defaultMode
├─ defaultModel
├─ defaultThoughtLevel
├─ lastUsedModel
└─ revision
```

A lista de Providers, as Properties de modelo, os Option Specs, as credenciais e a revision do Provider são fornecidos pelo Registry do processo. O estado do Workspace não assume mais a responsabilidade de Provider Catalog.

A fila `workspaceModelMirror` remanescente no Renderer também foi removida. Ela espelhava de forma assíncrona a seleção de modelo de volta para a antiga entrada `setWorkspacePreferredModel`, mas todos os consumidores já migraram para a cadeia de controle de Selection ciente de Session; manter uma fila sem chamadores sugeriria que o Workspace ainda tem outro fato de modelo a ser reconciliado.

O fechamento final também removeu `workspace/readState.modelCatalog`, `ZCodeWorkspaceModelCatalogState`, as projeções de Provider no lado Worker e a conversão App Config→Protocol Provider que já não tem chamadores de produção. A lista de modelos e a seleção atual voltam unificadas de `settings.model`; o `state.updated` do Workspace também envia o mesmo shape de Settings, e o Patch antigo `{ modelCatalog }` não existe mais. O primeiro despacho off-peak herda diretamente `settings.model.current` e valida a seleção com o mesmo `settings.model.available`.

As entradas de escrita de Workspace Overlay remanescentes dentro do App também foram removidas. `setModelCatalogOverlay`, o estado e os listeners de Workspace Overlay não têm chamadores de produção, mas ainda conseguiam misturar um snapshot completo de Provider/Model na lista de modelos e no Adapter Registry antigo; mantê-los permitiria que um antigo Host Snapshot voltasse a ser uma segunda fonte de verdade. O `setTurnModelCatalogOverlay` de turno único continua, pois serve apenas ao modelo temporário de execution-scoped e é limpo ao final.

### Execução comum e execução temporária

Os comandos comuns de Session carregam apenas `ModelSelection`; o Worker usa o Registry do Environment pertencente para criar o Model. O `runtimeModel` derivado do Host, o antigo CAS de revision e a escrita de volta de Workspace Provider saíram.

`createModelAdapter()` também só aceita um contêiner explícito de Registry do AI SDK, sem expor mais o branch de criação de Registry de execução comum a partir do antigo `RuntimeModelConfig`. O Provider Runtime formal gerencia esse contêiner após o início do App; a conversão do Runtime Config antigo é usada apenas internamente pelo Turn Execution Source.

O `turnRuntimeModel` das tarefas off-peak é mantido temporariamente. Ele forma apenas um Overlay temporário de Model do Turn atual, não escreve no Registry e não modifica as Workspace Preferences; seu desenho formal de Provider e de autenticação no período da requisição pertence à M4.

### Model e autenticação de requisição

Na criação do Model, a configuração de execução estática do Provider é fixada. A atualização de API Key ou de Headers da conta cobre apenas o material dinâmico de autenticação do attempt de requisição atual, sem fazer o Model já criado voltar ao Adapter Registry atual para re-resolver o Provider completo:

```text
Model 创建
└─ 固定 Provider 静态执行配置

请求 attempt
├─ 读取最新动态鉴权材料
└─ 在固定配置上覆盖 API Key / Header
```

Portanto a atualização a quente do Registry só afeta Models criados depois; o Loop atual não troca silenciosamente Endpoint, API Format, Provider Factory, Provider Options ou Headers estáticos ao reenviar uma requisição ou ao atualizar Headers em uma validação de segurança one-shot. O roteamento físico, o proxy e a validação de segurança da requisição continuam sendo gerenciados pelas instalações de requisição do Adapter e não são escritos no Model como fatos estáticos do Provider.

A cadeia morta no Bootstrap que modificava in-place a capacidade da Session ativa após a atualização a quente do Registry e depois reemitia ModelSelected foi removida. A Session ativa mantém seu próprio Model; novas Properties e Option Specs só entram em Models criados depois.

O logout da conta captura a identidade da conta antes da limpeza da sessão OAuth principal e remove a Personal Coding Plan Key do escopo correspondente; durante a janela de compatibilidade, a Key antiga sem escopo também é removida. Um novo login força a obtenção e a sobrescrita da Key com o novo OAuth Token. O desaparecimento do Account Provider no Registry, a invalidação da autenticação de requisição e a limpeza de credenciais derivadas seguem, portanto, o mesmo ciclo de vida da conta.

## Limites de formulário da página de configurações

A página de configurações mantém um estado privado de sessão de edição no Renderer. Seus campos de configuração usam diretamente os tipos formais de Config:

```text
ProviderSettingsView
        |
        v
ProviderSettingsFormProvider
├─ config: ProviderConfigObject
└─ models[].config: ModelConfigObject
        |
        | saveEffectiveProvider()
        v
Personal Config Overlay
```

Essa camada de projeção é responsável apenas pela edição e pelo salvamento do formulário:

- não lê arquivos de Provider;
- não constrói o Registry;
- não decide se um modelo é selecionável;
- não cria Models;
- não se torna fonte de verdade de execução.

Quando a página de configurações precisa saber se um Provider é selecionável, ela usa diretamente o `selectable` publicado pelo Registry na Settings View. A operação de salvamento devolve a nova Settings View já atualizada após a escrita, de modo que as correções de Provider Family e a compensação de sincronização de Plan após o salvamento também usam a mesma conclusão mais recente do Registry; o Renderer não replica mais um algoritmo de disponibilidade inicial com base em API Key, Endpoint e campos de modelo.

O estado de conexão do plano lê apenas o `accessId` publicado pelo Account Overlay. A antiga API Key, o Endpoint e a lista de modelos do formulário de Provider não reclassificam Coding/Start/Team Plan como conectado quando falta o Account Access; os pontos de estado de navegação usam diretamente o Registry `selectable`. A página de configurações não mantém mais o modo implícito de "reverter para o formulário antigo quando o novo Service não está montado".

A sessão de edição não replica mais os campos antigos de endpoints, kind, modalities, ProviderOptionsPatch e timestamps do Store. O Renderer apenas acrescenta `providerId/modelId`, o estado de projeção do Registry e a marcação de origem Personal sobre o Config formal; campos de Model Config não exibidos são mantidos junto com o estado de edição. O antigo `ModelProviderConfig` permanece apenas na leitura da migração física one-shot.

A experiência de configuração pode continuar ajustando controles no futuro, mas sem alterar o Config formal, o Registry ou os fatos de execução.

Os tipos de API também pertencem somente ao Provider Config. A página de configurações usa `ProviderApiType` para editar a conexão do Provider; não há mais API kind por modelo, Endpoint Path nem bypass de escolha de múltiplos protocolos. O Repo Wiki e a sondagem de conectividade também consomem esse tipo formal diretamente, sem reverter o Config atual para o kind antigo do Provider Store.

O Direct Seed do Desktop E2E e as fixtures globais de Provider do WDIO também saíram do Store físico antigo e do CLI Provider Config. Os casos de DeepSeek, Output Budget, Repo Wiki, Context Window e filtro de Provider escrevem apenas Config Personal versionado; o modelo padrão do Environment é gravado em `model-selection.json` separado. O CLI Config mantém apenas settings de harness não relacionados a Provider, como o timeout de `modelStream`, sem copiar Provider, Model ou Selection padrão. As fixtures de Coding Plan também não gravam mais cópias de Builtin Provider, continuando a ser construídas por Official e Account Source.

O Restart E2E usa o mesmo limite: o Replay Provider escreve apenas Config Personal, e o modelo padrão de cold start do Environment escreve apenas Model Selection Config versionado. Os testes não copiam mais Provider nem parâmetros de reasoning por Project/CLI Config, nem fabricam manualmente a antiga corrida em que o Host Snapshot era inconsistente com o Worker CLI Catalog.

O Team Plan Usage E2E também escreve apenas Config Personal; a identidade Personal/Team da conta é fornecida pelo Account Source do cenário, e o teste forma Providers utilizáveis por meio da ordem formal de Overlay, sem escrever o antigo CLI Provider Config ou o antigo Provider Store.

A descoberta de endpoint de replay dos E2E de revisão manual de Reasoning também saiu dos fallbacks privados por caso para o Store/CLI Config antigos. Eles usam informações explícitas de replay runtime ou a projeção de teste unificada de Personal Config; o formato físico antigo permanece apenas no limite centralizado de migração.

O escopo de Account Access da página de detalhes das configurações até o serviço de reset de cota também foi fechado: o Renderer apenas repassa o `accessId` não sensível da Registry View e não relê a API Key; as requisições Personal/Team do mesmo Provider continuam com a autenticação dinâmica resolvida pelo servidor conforme a identidade da conexão.

O `RuntimeModelOverlayManager` genérico dentro do Bootstrap também saiu. O único objeto Overlay mantido chama-se explicitamente `TurnModelOverlayState` e carrega apenas o modelo temporário execution-scoped do Turn atual; já não oferece APIs duplicadas que sugerissem camadas de Workspace, Session ou Provider de Runtime comum.

## Limites Legacy explicitamente preservados

O código de compatibilidade abaixo ainda tem uma responsabilidade única e removível:

- primeira importação de Personal Config: ler o arquivo físico antigo quando o novo Personal Config ainda não existe;
- migração one-shot de Account Key: mover a antiga Personal Coding Plan Key para o Account Credential Store;
- estado de sessão de edição do Renderer: carregar diretamente o Config formal e isolar o rascunho do estado de execução do Registry;
- `turnRuntimeModel`: entrada execution-scoped de tarefas off-peak antes da M4.

Eles não são invocados inversamente pelos caminhos estáveis do Registry.

O limite de conclusão da M2 é protegido mecanicamente por testes estruturais entre pacotes. No código-fonte de produção, o antigo `ModelProviderConfig` só pode aparecer na definição histórica de DTO do Shared, na primeira importação Personal, na migração one-shot de Account Key e em suas entradas de montagem; o antigo `model-providers.json` só pode ser lido pelo `legacyModelProviderStoreReader`. O Snapshot completo antigo de Registry, o `workspace/updateProviderRegistry`, o Runtime Overlay genérico e os antigos nomes de projeção de configurações devem permanecer zerados no código-fonte de produção. Novos pontos de compatibilidade exigem atualizar este documento e declarar uma condição explícita de saída; não se pode contornar o limite trocando o nome dos arquivos.

Os caminhos antigos de montagem de modelo dos testes com `createZCodeApp()` nu e das ferramentas internas já saíram. O Prompt CLI, o TUI e a Protocol Entry formais usam a mesma dependência obrigatória de Registry. Testes de Bootstrap Session Persistence, MCP, Hook e Workflow construizam um Model realmente executável por meio de um Harness apoiado em Registry; Compact/Memory E2E e as ferramentas de Prompt Trajectory também criam explicitamente seus próprios Registry de teste. `ZCodeAppOptions.providerRegistry` passou a ser obrigatório, expondo imediatamente o erro de montagem quando ausente. O antigo `bootstrapModelConfig`, o `includeLegacyProviderModels` e o fork de App Factory sem Registry foram removidos.

Uma auditoria adicional também removeu o branch antigo de Runtime Model Config do Adapter Factory: `createModelAdapter()` precisa receber explicitamente um contêiner de Registry do AI SDK gerenciado pelo chamador. O Prompt Trajectory e o WebSearch Probe passaram a fornecer explicitamente o modelo de execução; a entrada de escrita de seleção de modelo do CLI Config antigo foi removida. O Config Parser antigo só é mantido na primeira importação Personal e em settings de harness não relacionados a Provider, e não pode fornecer fatos para a execução estável de modelos. O Runtime Model Config execution-scoped do Turn só é convertido dentro do `TurnExecutionModelSource` e não entra mais no Adapter Factory público.

O `RuntimeConfig` genérico e o `ConfigPort` em seguida removeram `model`, `modelCatalog` e as Config Keys correspondentes. A análise de compatibilidade do arquivo antigo e de `ZCODE_MODEL` ainda é mantida como entrada de migração com marca de depreciação, mas o Config Factory não projeta mais esses campos para a configuração de execução; a metadados de origem `hasModel` também foi removido. A inicialização formal do App só pode obter modelos do Process Registry e das Seleções explícitas de Session/Submission.

## Verificação

Concluído nesta rodada:

- `pnpm typecheck` na raiz;
- `pnpm lint` na raiz, 0 erros;
- testes direcionados de Services/UI e das novas funcionalidades MCP/Usage após o rebase: 15 arquivos, 258 aprovadas;
- testes direcionados de Bootstrap: 6 arquivos, 219 aprovadas;
- typecheck isolado do Bootstrap aprovado;
- `git diff --check` aprovado.

Após o fechamento final do Workspace Snapshot, foi executada mais uma rodada de verificação direcionada de Shared, Services, Bootstrap e UI, com 299 aprovadas; o typecheck e o lint da raiz passaram novamente, com o lint permanecendo em 0 erros.

A execução completa dos testes de Bootstrap também expôs dívidas preexistentes sem relação com esta rodada: mocks de Session Persistence sem o novo método, Native Boundary já com importações entre domínios e alguns timeouts históricos. Elas não constituem falhas de regressão direcionada desta rodada nem podem ser reportadas como passagem completa; a verificação de lançamento deve continuar mantendo essa ressalva. A verificação atual usa Node 22, enquanto o repositório declara Node 24; o pipeline oficial ainda precisa reconfirmar no runtime padrão.

A branch final foi rebaseada no `cf009a3b19` de `staging`. A regressão de Bootstrap após a remoção do Workspace Overlay teve 61 aprovações; o TypeScript da raiz, o TypeScript isolado do Bootstrap e o lint passaram novamente, com lint em 0 erros e 36 warnings de baseline. A revisão Human in the Loop não teve nenhuma decisão pendente. A branch está 0 behind em relação ao `staging` mais recente.

Após o fechamento do App Factory nu, a regressão direcionada de Bootstrap Registry, Runtime Config, Session, MCP, Hook, Workflow, Telemetry e Overlay teve 12 arquivos, 160 aprovações; os testes específicos de ZCode Protocol tiveram 109 aprovações. O typecheck da raiz, o typecheck isolado do Bootstrap, o typecheck do Prompt Trajectory e o lint da raiz passaram, com o lint ainda em 0 erros e 36 warnings de baseline. O dry-run do Compact E2E e os testes de evidência de Memory passaram; o Node 22 atual não consegue carregar diretamente o build de Bootstrap que referencia o código-fonte `@zcode/shared` da raiz no `staging` mais recente, então a fake suite de Compact fica para reconfirmação no Node 24 declarado pelo repositório / runtime de CI.

Na execução completa do Bootstrap, as falhas de Runtime Config e do Telemetry Harness relacionadas a esta rodada já foram corrigidas; as falhas restantes estão nos casos preexistentes de `v4-native-boundary`, timing do oversize V4 Gateway e Session Resident Pool. Esta rodada não alterou essas semânticas independentes ao concluir o Provider.

A última rodada de limpeza antes do lançamento também concluiu a migração dos limites de Seed/leitura de Provider do Desktop E2E, a auditoria de Knip de Provider e Provider Node, e a conclusão do escopo de reset de cota do Account Access. O `pnpm typecheck` da raiz passou novamente; o `pnpm lint` da raiz permanece em 0 erros e 35 warnings de baseline sem relação com a M2; os testes direcionados de Coding Plan e Model Selection tiveram 205 aprovações, e o TypeScript do Desktop E2E e o Lint dos arquivos alterados passaram. As 16 decisões do Human in the Loop foram todas confirmadas, e a branch continua 0 behind em relação ao `origin/staging` mais recente.

Após o estreitamento do Turn Overlay, o `pnpm typecheck` e o `pnpm lint` da raiz foram executados novamente: TypeScript passou, Lint com 0 erros e 33 warnings de baseline do `staging` atual; 16 testes de Turn Overlay, Runtime Model Factory, Session Facade e gate estrutural da M2 passaram, e o typecheck isolado do Bootstrap passou. A branch continua 0 behind em relação ao `origin/staging` mais recente, e tanto o Working Memory quanto o workspace de código estão sem conteúdo não commitado.

O diagnóstico de Provider do Desktop E2E também saiu do fallback de leitura do Store antigo e do CLI Config antigo. O E2E comum usa apenas Personal Config versionado; o formato físico histórico só é lido pelo migrador one-shot e pelos seus testes dedicados, e não pode mais ajudar cenários comuns a passar indevidamente.

A verificação final da branch passou novamente o `pnpm typecheck` e o `pnpm lint` da raiz; o Lint ficou em 0 erros e 33 warnings de baseline do `staging` atual. Provider, Provider Node e o gate estrutural da M2 tiveram 19 arquivos e 96 testes aprovados; Shared Protocol e o limite de migração física antigo tiveram 3 arquivos e 53 testes aprovados. O Schema do Store antigo e as funções de migração também saíram dos reexports do ZCode Protocol, permanecendo apenas nos tipos de migração de Provider do Shared e no Reader one-shot de Services. A branch está 0 behind em relação ao `origin/staging`.

O Provider Store antigo finalmente convergiu para um adaptador apenas de leitura e foi renomeado para `legacyModelProviderStoreReader`. As únicas chamadas de produção restantes são a primeira importação Personal e a migração one-shot de Account Key; o caminho antigo não grava mais em `config.json`, não restaura backup e não mantém mais o código de serialização reversa e escrita atômica do formato antigo. Três grupos de testes de migração, totalizando 7 testes, passaram, e o typecheck e o lint da raiz passaram novamente; o lint está em 0 erros e 33 warnings de baseline do staging atual.

A auditoria final de infraestrutura de E2E mudou o seed WDIO comum para gravar diretamente o Personal Config formal e substituiu o DTO de nível superior do Store antigo pelo resultado de observação explícito `E2EModelProviderSnapshot`. O gate estrutural do Desktop E2E varre recursivamente todo o código-fonte de teste, impedindo que as fixtures reintroduzam `ModelProviderConfig`. Provider, Provider Node, limites de migração de Services e limites de Desktop Config tiveram 24 arquivos e 114 testes aprovados; o `pnpm typecheck` da raiz passou, o `pnpm lint` da raiz ficou em 0 erros e 33 warnings de baseline do `staging` atual, e os arquivos alterados ficaram com 0 warnings. A branch atual está 0 behind em relação a `origin/staging`.

As fixtures de teste não relacionadas à migração também saíram do DTO de Provider de nível superior antigo, e o gate estrutural da M2 passou a restringir simultaneamente o código-fonte de produção e o de teste. A regressão direcionada de Usage, Repo Wiki, Bots e Provider Runtime teve 6 arquivos e 135 aprovações; a suíte completa de Provider e a de Provider Node tiveram, respectivamente, 14 arquivos/89 testes e 2 arquivos/13 testes aprovados. O `pnpm typecheck` e o `pnpm lint` da raiz passaram novamente, com Lint em 0 erros e 33 warnings de baseline do `staging` atual. A auditoria final de contra-prova confirmou que os DTOs de nível superior restantes pertencem apenas à migração física one-shot, e que o DTO de modelo antigo serve somente à entrada execution-scoped off-peak antes da M4. A branch está baseada em `6b4f6fc636f5` de `origin/staging`, 0 behind em relação a essa base.

A auditoria de requisitos removeu em seguida os campos de revision de Provider já sem efeito nas Settings de Session e nos callbacks de autenticação de requisição. Depois que o CAS de Snapshot completo saiu, esses campos não têm escrita de produção nem consumidor de comportamento; agora o protocolo compartilhado, o Mapper de Session do Bootstrap, o Core Invocation Context e o Adapter Request Auth mantêm apenas o material de autenticação de requisição efetivamente vigente. O código-fonte do Core também passou a integrar o gate estrutural entre pacotes da M2, impedindo que nomes antigos de revision reapareçam a partir de camadas mais internas.

A auditoria final de Entry também passou a cobrir `@zcode/provider`, `@zcode/provider-node`, o Prompt CLI e o TUI no mesmo gate estrutural. A varredura estendida confirmou que essas entradas não têm fallback de Snapshot de Provider antigo, Workspace Catalog ou Runtime Overlay. A terminologia de implementação do estado interativo do Workspace foi unificada como Model Preferences; uma função de migração de reasoning legada com zero chamadores também foi removida. O gate da M2, o Runtime Model Metadata e a regressão direcionada do ZCode Protocol tiveram 151 aprovações, e o typecheck isolado do Bootstrap e o typecheck da raiz passaram.

A última codificação de Builtin Provider ID na ordenação da página de configurações também foi removida. A ordem inicial e final dos Providers vem apenas da Effective View ordenada; o arrastar do usuário continua gravando no Personal Overlay. O casulo `updatedAt` do antigo Display Order Preference e o DTO do Shared saíram, e a UI mantém apenas o `ProviderOrderView` projetado pela View atual.

Os tipos e funções auxiliares de migração/Registry de Provider usados apenas internamente pelos arquivos em Bootstrap e no Prompt CLI não são mais exportados. As entradas formais entre módulos permanecem inalteradas; após a revisão de Knip, nesses dois pacotes as exportações sem chamadores relacionadas a Provider, Model e Registry são zero.

Os dois helpers com zero chamadores em Services que inferiam a origem da desativação do Coding Plan pelo antigo `enabled/systemDisabledReason` foram removidos, e as implementações internas de arquivo de módulos como Account/Request Auth/Connectivity deixaram de ser exportadas como pontos de extensão públicos. O Account Source agora forma o Account Overlay apenas com resultados available/unavailable/unknown.

No módulo de caminhos de Services, o helper de workspace key interno e o helper de diretório isolado para configuração de Agent externo também deixaram de ser exportados; o comportamento de caminhos de skills, plugins e estado de execução do Agent externo permanece inalterado.

A contra-prova final antes do lançamento verificou item a item as condições de conclusão da M2. 21 arquivos de teste críticos e 181 testes, além do typecheck da raiz, passaram; o lint da raiz ficou em 0 erros e 33 warnings de baseline do staging atual. A branch está 0 behind em relação a `origin/staging` e não trouxe de volta nenhum commit histórico já removido antes do rollback do staging.

Após o fechamento do Adapter Factory público e dos DTOs do formulário de configurações, a suíte completa de Provider teve 14 arquivos e 110 testes, a de Provider Node 2 arquivos e 13 testes, a regressão direcionada de Services Registry/Config/Request Auth 4 arquivos e 19 testes, e a regressão direcionada de Bootstrap Registry Runtime 4 arquivos e 45 testes; o gate estrutural entre pacotes da M2 teve 37 aprovações. O typecheck da raiz passou, e o lint da raiz ficou em 0 erros e 33 warnings de baseline do staging. A branch está 0 behind em relação a `6b4f6fc636` de `origin/staging`.

## Conclusão

A Entry formal e o Harness interno da M2 já têm uma única fonte de verdade e uma montagem obrigatória de Registry. A sessão de edição do Renderer carrega diretamente os tipos formais de Config; a importação Legacy one-shot e o Overlay de tarefas off-peak ficam em limites explícitos e não participam do Registry de produção comum. O DTO antigo do Store compartilhado saiu da UI de produção. Os itens de saída conhecidos após o lançamento da M2 são apenas a migração física one-shot, a semântica de tarefas execution-scoped da M4 e a organização interna de conta e plano da M6.

A auditoria final de tipos antes do lançamento também fixou os locais permitidos do antigo `RuntimeModelConfig`: ele só pode atender à importação one-shot do arquivo CLI antigo e ao Turn Overlay execution-scoped ainda não refatorado pela M4. Os testes estruturais entre pacotes enumeram esses arquivos, e uma Session comum, Registry, Settings, Selection ou ModelFactory que volte a referenciar esse tipo falha diretamente. O antigo `ZCODE_MODEL`, `ZCODE_BASE_URL` e `ZCODE_API_KEY` também não entram no Runtime Config comum; a leitura restante de `ZCODE_API_KEY` pertence apenas à importação one-shot do CLI Provider antigo.

Quando o Turn Overlay execution-scoped e o Registry do processo apresentam o mesmo `providerId/modelId`, o Overlay deste Turn tem prioridade de execução. O ModelFactory, os metadados de modelo do Session Facade e a troca de modelo transiente devem respeitar conjuntamente essa ordem; o Registry continua responsável pelos modelos comuns de longo prazo, e o Overlay não entra nas configurações, na lista de seleção nem na persistência.