# Registro de Implementação M2

> Status: linha do tempo histórica da implementação; evidências de auditoria acrescentadas continuamente
>
> Data de início: 2026-08-17
>
> Objetivo da implementação: [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md)

Este documento guarda, na ordem em que ocorreram, as decisões autônomas e as evidências de auditoria da implementação M2 que foram além do plano original, mas que não justificavam bloquear o desenvolvimento. O corpo preserva o contexto no momento da decisão; entradas iniciais podem já ter sido substituídas por decisões ou implementações posteriores e não podem servir isoladamente como fonte da verdade atual.

O design alvo atual está em [`../design/registry/registry.md`](../design/registry/registry.md), o status de implementação atual está em
[`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md), as decisões finais humanas estão em
[`02-provider-config-and-registry-human-in-the-loop.md`](./02-provider-config-and-registry-human-in-the-loop.md) e os itens de descontinuação restantes estão em
[`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md).

## 1. Registry Service usa injeção de snapshots de Source

O Resolver de domínio puro já aceita valores de Config e de Account Access. A camada de montagem de runtime continua usando dois Sources estreitos:

```text
ProviderConfigSource ───────┐
                            ├─> ProviderRegistryService
AccountProviderAccessSource ┘       ├─ resolve
                                    └─ publish Registry View
```

Os Sources ficam responsáveis por arquivos, RPC, interfaces remotas, cache e watcher; o Registry Service apenas lê snapshots imutáveis, escuta sinais de invalidação e publica a View em memória. Cada snapshot de Source carrega uma revision, o que permite que notificações ativas e notificações de watcher causadas pelos mesmos fatos sejam deduplicadas de forma natural.

## 2. Refresh concorrente usa guarda de geração

O Registry Service não usa debounce por tempo. Cada invalidação incrementa uma geração de requisição; apenas um loop de refresh roda por vez. Quando uma nova invalidação ocorre durante a leitura, a geração antiga obtida pela leitura corrente não é publicada e o loop continua lendo o Source mais recente.

Isso resolve corretude e trabalho duplicado sem depender de "esperar quantos milissegundos" para adivinhar se o Source está estável.

## 3. Falha de refresh mantém provisoriamente o last-known-good

Config e Account Access determinam em conjunto uma View completa do Registry. Quando a leitura de qualquer Source, o parsing do Schema ou o Resolver falha, a implementação atual mantém a View bem-sucedida anterior, emite um evento de erro de refresh e aguarda a próxima invalidação ou um refresh explícito para se recuperar.

Por enquanto não é publicada uma View parcial que remova o Source que falhou. Publicação parcial pode remover em massa Account Providers em falhas transitórias de rede ou de arquivo e fazer com que a seleção de modelos e o novo Agent Loop observem um fato não pertencente ao domínio. Na primeira inicialização, quando ainda não há View bem-sucedida, o Registry mantém uma View vazia e expõe o erro.

Essa é uma estratégia de implementação sujeita a decisão assíncrona; se mais tarde for confirmado que determinado Source admite degradação independente, deve-se formar um snapshot de fallback explícito dentro daquele Source, em vez de deixar o Registry adivinhar como montar dados com falha.

## 4. Facade começa estabelecendo projeções somente de leitura

Settings e Model Selection precisam de formatos de dados diferentes. Na primeira etapa a Facade apenas projeta o mesmo snapshot do Registry Service em objetos comuns serializáveis: Settings enxerga ao mesmo tempo a configuração Personal explícita, a configuração Effective e os problemas; Selection enxerga apenas as opções já publicadas pelo Registry.

A Facade ainda não possui drafts do Renderer nem escreve arquivos diretamente. Salvar, excluir e reordenar o Personal precisa combinar com as fronteiras de escrita concorrente do Config Service e será implementado na fatia de integração do Host. Assim não se enfia armazenamento físico ou estado do Renderer de volta no pacote de domínio puro só para antecipar a UI.

## 5. A concorrência de persistência do Personal é centralizada no Repository

`ProviderConfigService` não implementa trava de arquivo, compare-and-swap de revision nem retry de rede. O Personal Repository oferece um `update(transform)` atômico, que lê o Snapshot Personal mais recente dentro da fronteira de persistência que ele possui, aplica a transformação e salva. O Config Service fornece apenas as transformações de domínio e a agregação dos Sources.

Essa interface permite que o Repository de arquivo local use fila de escrita intra-processo mais trava de arquivo, e também que um Repository remoto use número de versão do servidor; os dois não precisam criar ramos diferentes dentro do Registry. Toda escrita bem-sucedida dispara, uniformemente pela notificação de mudança do Repository, o refresh do Config Service e do Registry, evitando que o callback de escrita e o watcher mantenham dois conjuntos separados de estado em memória.

## 6. Não integrar o Snapshot antigo do Registry

Está confirmado que Official Config, Personal Config e Account Access são as únicas fontes da verdade, e que essa convergência deve ser concluída com alta prioridade. M2 não implementa o adaptador `ZCodeProviderRegistrySnapshot -> ProviderConfigSnapshot` e também não deixa o novo Registry continuar consumindo o snapshot de execução que o antigo ModelProviderService já misturou por completo.

Ao encontrar Catálogos/Presets/hardcodes existentes no futuro, as definições estáticas ainda válidas migram para o Official Config; as configurações do usuário migram para o Personal Config; login e verificação de plano convergem para Account Access; API Key, JWT, Team Plan Runtime Key e o Header de verificação de segurança de uso único permanecem na autenticação em tempo de requisição. Depois de concluídas as respectivas migrações, o ramo antigo é removido, sem manter duas fontes da verdade.

## 7. Model Config exato da página de configurações escapa caracteres de regex

`providerMatch` e `modelMatch` de ModelConfigRules são regexes de correspondência completa. A página de configurações salva IDs exatos de Provider/Model, portanto o Config Service escapa caracteres de regex como `. * + ?` ao gravar regras exatas; a leitura e a exclusão de regras exatas usam a mesma conversão. Regras de Pattern configuradas manualmente permanecem como estão.

Caso contrário o model ID `model.1` seria salvo como uma regra capaz de casar também com `modelA1`, e uma única edição na página de configurações poderia alterar o Effective Config de outros modelos.

## 8. Personal Config usa arquivo versionado próprio

> Uma decisão humana posterior substituiu este item: o Personal Config mantém o caminho original `config.json`, com backup antes da migração; o Schema final completo do M2 é publicado pela primeira vez com `schemaVersion: 1`. Ver [`Human in the Loop #10`](./02-provider-config-and-registry-human-in-the-loop.md#10-personal-config-保持原路径并以-schema-version-1-首次发布). O conteúdo abaixo preserva o contexto de auditoria da decisão autônoma do agente na ocasião.

A configuração Personal de Provider migra de forma unidirecional do antigo `~/.zcode/v2/config.json` para `~/.zcode/v2/provider-config.json`. O novo arquivo pertence apenas ao domínio de Provider Config e usa um inteiro `schemaVersion` incremental, evitando que uma atualização de formato de Provider obrigue o Environment Config inteiro a compartilhar versão.

A migração grava e valida atomicamente o novo arquivo primeiro e só então o torna a única autoridade; a limpeza do arquivo antigo pode ser feita depois, mas ele deixa de participar das leituras. Versões futuras migram de grau em grau entre versões adjacentes; ao encontrar uma versão superior, o programa recusa sobrescrever, evitando que clientes antigos estraguem a configuração nova.

Esta é uma decisão de implementação sobre nomenclatura de armazenamento físico e pode ser ajustada de forma assíncrona; documento versionado, migração unidirecional e o novo arquivo como única fonte da verdade são requisitos confirmados.

Os Builtin/Preset do antigo config.json são um Effective Config histórico e não podem ser copiados inteiros para o Personal por `source`. O migrador carrega primeiro o Official Config atual e depois calcula diferenças esparsas campo a campo sobre ProviderConfig e ModelConfig; Custom Providers, por não terem baseline Official, são migrados por inteiro. Assim preserva-se o comportamento observável atual pelo usuário sem congelar atualizações futuras do Official com valores gerados pelo sistema antigo.

## 9. Personal Repository usa trava de arquivo para todo o ciclo read-modify-write

`update(transform)` do Personal Repository completa leitura, transformação e substituição atômica dentro de uma única trava de arquivo entre processos. Travar apenas o último rename não evita que dois Hosts leiam o mesmo valor antigo e se sobrescrevam mutuamente; portanto a trava cobre toda a região crítica de read-modify-write.

Salvamento bem-sucedido neste processo e o watcher de diretório emitem notificações de invalidação, sem adicionar debounce. O Snapshot de Source de nível superior usa revision de conteúdo para deduplicar; assim não se depende do timing de eventos do sistema de arquivos nem se mascara uma atualização concorrente com uma janela de atraso.

O Repository já suporta a injeção de um Legacy Importer, mas hoje não reutiliza diretamente o resultado de leitura do antigo `ModelProviderService`. A importação real precisa aguardar o Official Config Source estar disponível para calcular as diferenças; até lá, quando o novo arquivo não existe, ele retorna apenas um Personal Config vazio, sem congelar antecipadamente o antigo Effective Config.

## 10. Integridade da API Key do Official API Provider

O Official declara predefinições de API Providers ainda não conectados, enquanto o Registry só deve publicar Providers com os quais é possível criar um Model agora. O tipo de Provider já convergiu para `ApiProviderConfig | AccountProviderConfig`, com o campo discriminador `kind`.

A configuração final de um API Provider sempre exige uma API Key não vazia; o Personal Config pode acrescentar uma Key sobre a predefinição Official. Nesta fase não é adicionado um terceiro tipo de Provider sem autenticação, e testes e fakes internos usam uma dummy key. As credenciais dinâmicas dos Account Providers continuam geridas pelo Account Access e pelo Service de autenticação em tempo de requisição. API Providers sem Key continuam entrando no resultado de parsing da Facade de Settings carregando o problema de validação, mas não entram no Registry de seleção de modelos e de execução.

## 11. Critério de migração mecânica dos primeiros Model Configs Official

O primeiro arquivo Official hospeda os API Providers comuns e expande de uma vez, na forma do novo Schema, os fatos estáticos de modelos do antigo China LLM Catalog. Modelos duplicados mantêm apenas um conjunto de Properties e Option Specs comuns; as diferenças Anthropic/OpenAI-compatible do mesmo modelo são quebradas em regras `apiFormatMatch` posteriores. Os antigos Patches `set/unset` são expandidos na migração em `ReasoningParameters` completos para cada nível, e o runtime deixa de depender do estado de Patch.

Modelos do antigo Catalog que não declaram `maxOutputTokens` seguem o fallback de 32K do Adapter atual. Modelos com limite explícito continuam usando esse valor como teto e valor padrão do Model, preservando o comportamento atual do Runtime Model Factory. O arquivo atual primeiro carrega os fatos e aceita testes de contrato; a troca da cadeia de produção e a remoção do Catalog/Preset antigos pertencem a uma fatia posterior da mesma migração, e ainda não se declara concluída a troca para uma única fonte de runtime.

## 12. Definir os campos de Provider Config antes da importação Personal

Ao preparar a implementação da importação unidirecional do antigo `config.json`, define-se primeiro quais fatos estáticos o novo ProviderConfig precisa carregar para uso comum entre a página de configurações, a página de seleção e a execução.

Os campos comuns são `kind`, `label`, `logoUrl`, `apiFormat`, `baseURL`, `headers`, `models` e `enabled`. API Providers guardam adicionalmente `apiKey` e `apiKeyManagementUrl`; Account Providers não pressupõem ainda campos de identidade que não foram pesquisados. A identidade do Provider vem do `providerId` externo; `label` serve apenas para exibição e tem como padrão o fallback para providerId.

`apiFormat`, `baseURL` e Headers estáticos valem tanto para API quanto para Account. JWT dinâmico, Runtime Key e o Header de verificação de segurança de uso único não entram no Config. O antigo `source`, IDs de rastreamento de Catalog, timestamps, marcações `modified/deleted` e motivos de desativação pelo sistema também não migram; a semântica de destino desses campos foi substituída, respectivamente, pela origem em nível de configuração, pelo array `models` e pelo Account Access. O antigo `providerMappings.claude` já é removido pela lógica de migração do Store v2 atual e igualmente não entra no novo Config.

Regras de Provider Config e inferência de Base URL não entraram no design. Official/Personal fazem hoje Overlay direto por providerId; se surgir no futuro uma necessidade de configuração entre Providers suficientemente clara, o sistema de regras poderá ser acrescentado com base em casos reais.

## 13. Legacy Personal Import migra apenas as diferenças do usuário

O resultado de leitura de Provider do antigo `config.json` já mistura Catalog, Builtin e fallbacks de migração. Por isso o importador recebe o Snapshot Official atual e a lista antiga de Providers, converte os valores Effective antigos, calcula diferenças campo a campo e grava apenas as diferenças no Personal Config.

No nível de Provider migram campos de exibição, ponto de entrada de requisição, Headers estáticos, associação de modelos, estado de habilitação e API Key; source antigo, timestamps, motivos de desativação pelo sistema e Provider Mapping não entram no novo formato. Para Providers já declarados pelo Official grava-se apenas a diferença; Providers Personal-only guardam a configuração de API completa.

No nível de modelo só são tratados modelos com `modified: true` nos registros antigos e modelos novos ausentes no conjunto Official. Properties, Option Specs e reasoning mapping convertidos são então diferenciados contra o Official ModelConfig, evitando que o usuário, ao alterar apenas o contextWindow, congele todo o modelo do Catalog. O antigo reasoning patch é expandido na fronteira de migração em um objeto de parâmetros sem estado correspondente ao API kind atual; `unset` não tem significado adicional para um mapa construído a partir de um objeto vazio.

Providers antigos com `source: builtin` e sem baseline Official não são importados por enquanto. Esses itens podem carregar JWT ou Runtime Key, e migrá-los por engano como API Provider fixaria estado dinâmico de conta dentro do Personal. Depois que a definição Official dos Account Providers for integrada, o mesmo importador migrará as sobrescritas estáticas permitidas conforme o `kind: account` do Official e ignorará a antiga API Key.

## 14. Official Config é publicado como recurso explícito de instalação

O pacote final do Desktop publica `config/provider/official.json` como recurso independente em `resources/config/provider/official.json`. O Official Config não entra no `app.asar` nem depende do diretório de trabalho do runtime; depois, o Desktop Main resolve o caminho real e o injeta explicitamente no Local Host.

A publicação do recurso e a troca para o Registry de produção são divididas em duas fatias verificáveis. Esta fatia apenas garante que o documento Official versionado no repositório de desenvolvimento chegue ao ambiente de execução junto com o instalador, sem alterar a cadeia atual de leitura de Provider do Host. Só depois que a próxima fatia concluir a injeção de caminho, a montagem dos Sources e o gerenciamento de ciclo de vida o Registry de produção passará a consumir esse arquivo.

## 15. Config Runtime é integrado primeiro ao Local Host, sem antecipar a troca de consumidores

O Desktop Main resolve o caminho absoluto do Official Config conforme o modo de desenvolvimento ou instalado e o injeta explicitamente no Local Host via `InitLocal`. O Services monta, a partir desse caminho, o Official Source, o Personal Repository e o `ProviderConfigService`; o pacote de domínio de Provider compartilhado não depende de Electron, do diretório de instalação nem do diretório de trabalho atual.

O Config Runtime já suporta injetar uma função de leitura de Provider antiga: na primeira leitura, ao descobrir que o arquivo Personal não existe, o Repository usa o Legacy Importer e calcula diferenças esparsas contra o Snapshot Official atual. Os Local Hosts de múltiplas janelas podem iniciar simultaneamente, e a trava de read-modify-write entre processos do Personal Repository garante que apenas um arquivo final seja gerado.

O Local Host de produção ainda não injeta essa função de leitura. A página de configurações atual continua escrevendo a configuração antiga; se o novo arquivo Personal fosse gerado desde já, mudanças posteriores na configuração antiga não entrariam mais na migração de uso único. Por isso a migração de produção precisa acontecer na mesma sequência de commits que a troca da entrada de escrita das configurações: primeiro bloquear a escrita antiga, concluir a última migração diferencial e só então fazer do novo Personal Config o único destino de escrita.

Esta fatia torna o novo Config a fonte da verdade de produção para leitura e atualização contínuas, mas ainda não troca a página de configurações, a seleção de modelos ou a execução do Worker para o novo Registry. A nova pilha de runtime é mantida e liberada explicitamente pelo ciclo de vida do Local Host; falhas de inicialização registram log de erro de produção e preservam a cadeia de Provider existente, para que problemas de configuração possam ser detectados antes da troca de consumidores.

## 16. Settings Facade forma uma barreira de escrita serializável

Os métodos de escrita da Settings Facade recebem `ProviderConfigInput` e `ModelConfigObject` e usam o mesmo Schema de parsing do documento de configuração versionado, não permitindo que o Renderer construa Classes de Config ou duplique validações. Salvar, excluir e reordenar continuam sendo feitos por `ProviderConfigService` modificando o Personal Overlay.

Uma operação de escrita executa sequencialmente a mutação do Config Service, o `refresh()` do Registry e a projeção da Settings View. O refresh explícito serve apenas como barreira de commit; ele reaproveita as notificações de Source, a deduplicação por revision e a guarda de geração, sem criar um segundo estado em memória. Quando a chamada RPC retorna, o chamador obtém assim a mesma Registry View correspondente ao resultado recém persistido.

## 17. Account Provider não reintroduz credenciais dinâmicas no Registry

Após o levantamento de Start Plan, Personal Coding Plan e Team Plan, confirmou-se que o antigo Snapshot do Registry carregava simultaneamente definições estáticas, escopo permitido pelo plano e credenciais de requisição. O Account Source de M2 projeta apenas os Providers e modelos cuja publicação é permitida, além da identidade de acesso de conta não sensível que precisa ser fixada ao criar um Model; JWT, API Keys Personal/Team copiadas e Headers de uso único permanecem no Service de autenticação em tempo de requisição.

A identidade de acesso é uma fronteira necessária de estabilidade de execução. Personal e Team atualmente podem compartilhar o mesmo providerId; se o Model lesse a cada requisição apenas a conexão global atual pelo providerId, o usuário trocando de conexão no Loop faria o Model antigo trocar de credencial silenciosamente. A interface de domínio dá a isso o nome de `accessId`: o Account Source deve fornecê-lo, o registro de execução do Registry o preserva e a Model Selection View não o projeta. O ModelFactory subsequente o fixa ao criar o Model, ao mesmo tempo que permite a renovação de Token dentro dessa identidade.

O Endpoint dos Account Providers ainda hoje ramifica conforme `process.env`. Depois que o Official Config se tornar a única fonte estática da verdade, o Registry ou o Factory não reescrevem mais o Endpoint; Production, Test e ambientes de desenvolvimento devem ser expressos pelo Official Config completo que cada um injeta.

O panorama detalhado e as fronteiras de migração estão em [`../research/account-provider-facts-and-auth.md`](../research/account-provider-facts-and-auth.md). Publicar uma conexão atual por Family ou várias conexões ao mesmo tempo continua sendo uma decisão de produto; o código atual não altera esse comportamento antecipadamente.

## 18. ProviderRuntime é responsável apenas pela montagem dentro do processo

`ProviderConfigRuntime` continua possuindo apenas o IO de Official/Personal, a migração de uso único e o Config Service. O novo `ProviderRuntime` monta sobre ele o Account Source injetável, o Registry Service, a Settings Facade e a Selection Facade.

```text
ProviderConfigRuntime ───┐
                         ├─> ProviderRuntime
Account Access Source ───┘   ├─ Registry
                             ├─ Settings Facade
                             └─ Selection Facade
```

O Local Host passou a manter e iniciar o `ProviderRuntime`, cujo ciclo de vida é liberado junto com o ServiceCollection. Como o Account Source ainda não foi integrado, é usada explicitamente uma Source vazia: API Providers comuns podem formar o Registry de forma independente e Account Providers não entram no novo Registry por fallback do antigo Snapshot. Futuros Host, Worker, Prompt CLI e TUI injetarão a mesma interface de Account Source que cada um consiga obter.

Os métodos de escrita da Settings Facade e os métodos de leitura da Selection Facade já usam o mesmo Registry através desse Runtime. Os consumidores RPC/UI existentes ainda não foram trocados, para evitar formar escrita dupla enquanto a entrada antiga de escrita do Personal Config ainda existir; a próxima fatia precisa colocar a migração final da configuração antiga e a troca da entrada de escrita das configurações na mesma sequência de commits.

## 19. Settings e Selection usam serviços RPC independentes

O Local Host já registrou os dois canais de serviço `provider-settings` e `model-selection`. O primeiro oferece salvar, excluir e reordenar Personal Provider/Model; o segundo oferece apenas a View selecionável e a validação de Selection. Ambos são criados pelo mesmo ProviderRuntime e a camada RPC não reinterpreta a configuração.

O `IServiceAccessor` do Renderer atual ainda não ganhou esses dois serviços, e os consumidores antigos de `IModelProviderService` também não foram trocados. Essa ordem é intencional: primeiro estabelecer o contrato do backend e validar a barreira de refresh, e só então migrar a UI conforme o uso de cada chamada; não se deve converter a nova View de volta para o antigo `ModelProviderConfig[]` só para manter compatibilidade aparente.

A classificação dos métodos do serviço antigo e as restrições de troca estão em [`../research/legacy-model-provider-service-call-map.md`](../research/legacy-model-provider-service-call-map.md).

## 20. Proxies do Client são capacidade opcional durante a migração

`RemoteServiceAccess` já criou proxies independentes para `provider-settings` e `model-selection`. `IServiceAccessor` os declara como opcionais no período de migração M2: o novo Local Host já registrou os canais, e as antigas entradas Remote/Server que ainda não injetaram Official Config e portanto não têm ProviderRuntime não são obrigadas a forjar uma implementação.

Essa opcionalidade serve apenas à migração gradual entre entradas e não pode ser usada como feature detection em runtime. `RemoteServiceAccess` cria o Proxy do canal indicado incondicionalmente, e mesmo que o peer antigo não tenha registrado o canal o campo não será `undefined`. A página de configurações atual só pode usar os novos serviços em um Local Host com ProviderRuntime comprovadamente montado; quando Host, Remote Server, Prompt CLI/TUI concluírem a montagem, a marca opcional deve ser removida, para que um canal ausente vire um erro de montagem explícito. Se for necessária compatibilidade com versões diferentes de Host remoto, deve-se criar uma negociação explícita de capacidades.

## 21. Auditoria dos campos e responsabilidades da página de configurações

A página de configurações hoje acumula edição de Config, conexão de Account/Plan, apoio à conectividade e sincronização do Registry Host→Worker. O novo `ProviderSettingsService` assume apenas a primeira; as demais capacidades migram conforme suas próprias fronteiras de domínio e não podem continuar sendo agregadas pelo antigo `ModelProviderConfig[]`.

Embora a estrutura antiga de endpoint ainda preserve `baseURL + paths`, a página de configurações atual já convergiu para um único `apiFormat`. Ao salvar, os múltiplos paths históricos são removidos e o caminho completo customizado continua sendo salvo em `baseURL`. Por isso o novo Provider Config não ganha o campo paths; o ModelFactory adota o operation path padrão do protocolo conforme o `apiFormat`.

A superfície completa de chamadas, a atribuição de campos e a ordem de troca estão em [`../research/legacy-model-provider-service-call-map.md`](../research/legacy-model-provider-service-call-map.md).

## 22. Draft Preview fica na Settings Facade

O formulário de configurações precisa ver ao mesmo tempo os valores Personal explícitos, os valores Effective herdados e os problemas de integridade. `ProviderSettingsService` ganhou dois métodos de preview, um para Provider e outro para Model: eles tratam um Draft não salvo que já passou pelo Schema de entrada como uma última camada temporária de Personal Config, reutilizam `ProviderConfigResolver` para computar a View completa e não gravam no Repository, não substituem o Registry nem emitem eventos de mudança.

Assim o Renderer pode usar valores Effective como placeholder e exibir problemas de validação da camada de domínio, sem precisar duplicar ConfigOverlay, campos obrigatórios ou a lógica de ModelConfigRules.

Preview não é um parser de formulário baseado em strings cruas. URLs pela metade, textos não inteiros e afins que o usuário está digitando são mantidos pelos controles do formulário; o Preview só é chamado depois que um `ProviderConfigInput` / `ModelConfigObject` válido é formado. Assim o domínio de Provider não precisa introduzir tipos de string de Draft de UI.

## 23. Propriedade de vídeo completada antes da integração do Model Factory

Ao preparar para que o Registry crie o `Model` do M1, constatou-se que o `supportsVideo` do design ainda não tinha entrado no contrato real do Model. Essa lacuna já foi preenchida no contrato público do M1, na validação de requisição do Adapter e na projeção de mídia do Core; a Factory antiga assume ausência de suporte, e o novo Registry passa a fornecer um valor explícito a partir do Model Config completo.

Trata-se de completar o contrato antes da integração, sem introduzir um novo conceito de configuração para o M2. O Registry Model Factory continua consumindo apenas o Provider e o Model Config finais.

## 24. Registry do AI SDK existente é rebaixado a projeção de execução

M2.5a adicionou o API Provider Model Runtime. Ele gera de forma unidirecional o `AiSdkModelRegistryConfig` existente a partir da nova Registry View e cria o Model do M1 usando o mesmo ProviderConfig e ModelConfig dessa nova Registry.

O antigo `AiSdkModelRegistry` passa a ocupar, nessa cadeia, apenas as projeções internas necessárias à SDK Factory, à rede, à verificação de segurança de requisição e à execução de requisições; deixa de ler Catalog, CLI Config e Snapshot do Host e deixa de participar da validação de Selection. Uma atualização do Registry substitui a projeção de execução usada pelos Models criados depois; um Model já criado mantém o SDK Model resolvido anteriormente e não muda com as atualizações de configuração.

O Reasoning Mapping entra no namespace do Adapter existente no momento da criação do Model, conforme o `apiFormat`: Anthropic Messages usa `anthropic`, OpenAI-compatible Chat usa `openaiCompatible` e OpenAI Responses mantém a entrada canônica de parâmetros já existente. O desligamento de raciocínio do Sidecar e o orçamento de saída visível do fixed-thinking continuam reutilizando a semântica do Adapter do M1.

Até agora só foram concluídos as fronteiras e os testes; a montagem de produção do Worker ainda não foi trocada. Account Providers são explicitamente recusados nessa criação por caminho de API Provider e serão integrados depois ao Service de autenticação em tempo de requisição; eles não caem de volta no Snapshot antigo do Registry.

## 25. Node Config Source converge para um pacote companheiro compartilhado

M2.5b precisa fazer Local Host, Core Worker, Prompt CLI e TUI lerem cada um o Official/Personal Config do mesmo Environment. A implementação atual de arquivos Node está em `@zcode/services`: o Official Source depende da leitura de arquivos e do watcher do Node, e o Personal Repository ainda depende da resolução de caminhos e das utilidades de arquivo atômico do Services. Se o Bootstrap reutilizasse diretamente essas peças, teria de depender do pacote Services inteiro, que traz muita capacidade de Host; se copiasse uma implementação no Bootstrap, trava de arquivo, migração, watcher e comportamento de revision imediatamente passariam a existir em duas versões.

Foi criado o pacote companheiro Node `@zcode/provider-node`. O pacote de domínio puro `@zcode/provider` continua contendo apenas Config, Resolver, Registry e Facade; o pacote companheiro contém o Official file Source, o Personal file Repository, o Config Runtime e o Registry Runtime de nível de processo, e depende de `@zcode/provider` e da capacidade de persistência de arquivos já existente em `@zcode/shared/node`. O conversor do antigo `ModelProviderConfig` para o Personal Overlay continua no Services e é injetado pela entrada de migração, de modo que o novo pacote companheiro não depende dos tipos de domínio antigos.

```text
@zcode/provider              @zcode/provider-node
├─ Config / Overlay          ├─ Official file source
├─ Resolver / Registry       ├─ Personal file repository
└─ Facade                    ├─ Node config runtime
                             └─ Process registry runtime
          ^                              ^
          |                              |
          +--------- Host / Worker / CLI / TUI
```

A localização física do Official Config continua sendo responsabilidade da Entry. O Desktop Main resolve o caminho do arquivo conforme o modo de desenvolvimento ou instalado; o Local Host entrega ao Worker que administra os caminhos de Official e Personal como um par de variáveis de ambiente de processo. O Worker usa o `@zcode/provider-node` para ler e vigiar os dois arquivos por conta própria e não recebe dados de Registry serializados pelo Host.

Os builds comuns e o SEA da CLI/TUI standalone ainda precisam carregar o mesmo `config/provider/official.json`, entregando o arquivo ou o conteúdo já resolvido à mesma fronteira de Source. Não se pode substituir isso por uma constante TypeScript embutida, sob pena de recriar uma segunda fonte da verdade.

## 26. Registry e Adapter de execução usam ciclos de vida diferentes

Ao implementar a montagem do Worker chegou-se a considerar combinar o Registry de processo com o `AiSdkModelAdapter` em um único `NodeApiProviderRuntime`. O Adapter existente contém Model IO, estado e dependências de telemetria em nível de Session/App; promovê-lo a singleton de processo faria Sessions distintos compartilharem estado de execução que não deveria ser compartilhado, e criá-lo por Session reiniciaria o watcher de arquivos várias vezes.

Por isso os dois ciclos de vida foram separados:

```text
Worker process
└─ NodeProviderRegistryRuntime
   ├─ Config Source / watcher
   └─ ProviderRegistryService

each ZCode App / Session runtime
└─ ApiProviderModelRuntime
   ├─ 订阅进程 Registry
   ├─ 当前 App 的 AiSdkModelAdapter
   └─ ModelFactory
```

O Registry é a visão da verdade em nível de processo; o Adapter e o Model Runtime são a montagem de execução em nível de App/Session. O M2.5c subsequente faz cada `createZCodeApp` emprestar o Registry de processo para criar seu próprio Model Runtime, com dispose simétrico quando o App é liberado. O próprio Registry só é liberado quando o Worker sai.

## 27. Registry do Worker começa como shadow runtime

M2.5b já faz o Desktop Local Host injetar no Worker os caminhos de Official/Personal Config, e o Worker inicia um Registry de nível de processo mantendo refresh automático. A CLI/TUI standalone e as entradas antigas sem caminhos injetados mantêm o comportamento original; injetar apenas um dos dois caminhos recusa explicitamente a inicialização, evitando misturar acidentalmente um conjunto parcial de fatos.

Este passo não substituiu imediatamente o ModelFactory de produção. A página de configurações atual ainda escreve a configuração antiga e a migração Legacy Personal final do Local Host ainda não foi trocada atomicamente pela nova entrada de escrita; nesse momento, fazer o Worker executar diretamente pelo novo Registry poderia resultar em um Personal Config vazio. M2.5c precisa avançar as seguintes ações como uma única sequência de commits:

```text
锁定旧 Provider 写入口
        |
        v
最后一次迁移到 Personal Config
        |
        v
设置与选择改用新 Facade
        |
        v
每个 App 使用 Worker Registry 创建 Model
        |
        v
删除普通 API Provider 的旧事实读取
```

O shadow runtime apenas valida antecipadamente a localização dos arquivos, a propriedade do processo, o watcher e o ciclo de vida do Registry, sem criar um novo ramo de fatos de negócio.

## 28. App já suporta projeção de execução exclusiva do Provider Runtime

`createZCodeApp` ganhou um Registry de processo injetável. Quando injetado, cada App cria seu próprio `ApiProviderModelRuntime`, toma emprestado o Registry de processo, possui seu próprio `AiSdkModelAdapter` e ModelFactory e libera a assinatura ao fechar. Sem injeção, continua sendo usado o Runtime Model Factory original.

O Workspace/Turn Model Overlay atual chamava diretamente `replaceRegistryConfig()`. O novo modo atribui explicitamente a propriedade da projeção de execução do Adapter ao Provider Model Runtime; o Overlay ainda pode manter o estado de Session do período de migração e os dados da projeção antiga, mas não sobrescreve mais o Registry do Adapter. `createModelAdapter` também passa a aceitar diretamente um Registry de execução inicial vazio e gerenciado externamente, de modo que o novo modo não precisa construir uma vez os fatos de Provider usando antes o Runtime Model Config antigo.

```text
legacy app
└─ Runtime Model Overlay -> Adapter execution registry

provider-registry app
├─ Runtime Model Overlay -> 仅维护旧交互兼容状态
└─ ApiProviderModelRuntime -> Adapter execution registry
```

A entrada do protocolo ainda não habilita esta opção. O Turn Overlay hoje também hospeda Providers execution-scoped como as tarefas ociosas; se a opção fosse habilitada cedo, o novo ModelFactory não encontraria Providers temporários no Registry de processo. Antes de abrir o interruptor de produção, é preciso fazer os Providers temporários criarem Models pela entrada execution-scoped do ModelFactory unificado, ou manter um ramo de execução temporária com fronteiras bem definidas.

## 29. Entrada de escrita antiga das configurações conclui o cutover do Personal Config por ponte unidirecional

A página de configurações ainda não migrou para a nova Settings Facade, mas o Worker já lê independentemente o novo Personal Config. Para que essas duas fatias possam subir consecutivamente, o Local Host, após uma escrita bem-sucedida em `IModelProviderService.save/delete`, converte a lista estática atual de Providers do usuário em um Personal Overlay e substitui atomicamente o novo Personal Config. O Registry é então explicitamente atualizado, de modo que, quando a chamada antiga de configurações retorna, a nova fonte da verdade e o que o Worker vai ler já estão consistentes.

Essa ponte trata apenas de salvamentos e exclusões explicitamente disparados pelo usuário e não assina o Snapshot antigo do Registry. Atualizações de conta, mudanças de plano, materiais de verificação de segurança de uso único, Headers temporários e Runtime Keys copiadas não são assim gravadas em disco. Quando o arquivo Personal ainda não existe pela primeira vez, o Config Runtime executa o mesmo conversor para a migração inicial; depois que o arquivo existe, a lista estática completa de cada escrita do usuário é a referência para regenerar as diferenças esparsas.

```text
旧设置页面 save / delete
          |
          v
旧 Service 完成兼容写入
          |
          v
Legacy Personal Importer
          |
          v
原子替换 Personal Config
          |
          v
刷新 Local Host Registry

Worker watcher
          |
          v
刷新 Worker Registry
```

A ponte fica dentro da fila de escrita antiga. Quando a nova escrita Personal falha, a chamada antiga de configurações falha em vez de devolver uma aparência de sucesso que só envolve o arquivo antigo; salvar de novo converge usando a lista estática completa. Esse desenho é uma fronteira temporária durante a troca da página de configurações, e sua condição de saída é que todas as escritas de configuração de Provider/Model passem a usar a nova Settings Facade. Nesse momento o callback e a dependência dos tipos Legacy são removidos, e o novo Personal Config permanece como única fonte da verdade de escrita.

## 30. execution-scoped Provider é unificado pelo Model Runtime

O Provider Model Runtime ganhou um `ExecutionScopedModelSource`. O Registry de processo continua fornecendo os fatos de Provider/Model de longo prazo; essa Source fornece apenas os Providers temporários que o App atual está executando, as projeções internas do Adapter e a capacidade de criação de Models. Os dois formam a configuração de execução do Adapter dentro do mesmo Model Runtime, com os itens execution-scoped tendo prioridade em caso de conflito de providerId/modelId, mas sem gravações no Registry de processo, na Settings View, na Selection View ou em disco.

O per-turn Runtime Model Overlay das tarefas ociosas já está encapsulado como uma Source desse tipo. O Overlay Manager publica para fora apenas a configuração, o Catalog e os eventos de mudança do nível de turn; o Overlay de compatibilidade workspace/session não volta por isso à nova cadeia de fatos de execução. No início do Turn o Provider temporário é adicionado e o Model Runtime substitui atomicamente a projeção do Adapter já mesclada; no fim do Turn essa camada é removida e a projeção volta a ser puramente a do Registry. O Model em execução já possui seu próprio SDK Model e não muda por causa da atualização da projeção.

```text
process Provider Registry ───────────────┐
                                         ├─> App Provider Model Runtime
turn ExecutionScopedModelSource ─────────┘   ├─ Adapter execution projection
                                             └─ ModelFactory

Settings / Selection View
└─ 只读取 process Provider Registry
```

Essa fronteira elimina o bloqueio de troca para produção que seria "habilitar o novo Registry faz os Providers temporários das tarefas ociosas desaparecerem". Ela ainda reutiliza o formato de dados do Runtime Model atual e a Factory de compatibilidade; o M4 mais adiante transforma a entrada de Providers temporários em entradas formais de Config/ModelFactory, momento em que esta camada de conversão de formato antigo é removida, mas o ciclo de vida e a semântica de prioridade de `ExecutionScopedModelSource` podem ser mantidos.

A regressão também revelou uma inconsistência de baseline já existente: a lógica de produção do GLM-5.3 fixa o nível padrão de reasoning em `max` conforme a identidade do modelo, enquanto a asserção antiga em `offpeak-turn-model-overlay` ainda espera `high` na entrada. Esta fatia não modificou esse ramo de capacidade do modelo e não usa a migração de Provider para decidir sua semântica de produto; os demais testes de execution-scoped, Runtime, Overlay e ciclo de vida do App passaram.

## 31. App de produção do Worker começa a usar o Registry de processo

O Protocol Worker passou a injetar o Provider Registry de nível de processo ao criar o App. O novo Model Runtime constrói Models e a projeção de execução do Adapter com três níveis de prioridade:

```text
turn execution-scoped Provider
              >
process Provider Registry
              >
workspace compatibility Provider
```

A camada de compatibilidade workspace contém apenas o workspace Overlay atualmente enviado pelo Host e não lê o CLI Config antigo. Ela só permite criar Model quando o novo Registry não tem o providerId inteiro, e existe para manter os Plan Providers que ainda não foram integrados ao Account Access e ao Service de autenticação em tempo de requisição; quando o mesmo providerId já aparece no novo Registry, a configuração antiga, a API Key e as entradas de modelo não podem sobrescrever o fato novo. A projeção de execução interna do Adapter é mesclada na direção oposta, de modo que o Registry cobre a compatibilidade e o execution-scoped do turn cobre o alvo de execução corrente.

Essa camada de compatibilidade tem uma condição de saída explícita: depois que o M2.7 integrar o Account Provider ao Registry e ao ModelFactory unificado, não existirá mais no workspace Overlay nenhum Provider ausente do novo Registry, e então `fallbackSource` será removido. Ela não participa das Settings/Selection Views e também não pode se tornar a entrada de fatos para novos Providers.

A inicialização do Worker e a primeira migração Personal do Host podem ocorrer de forma concorrente: quando o Registry inicial do Worker está temporariamente sem os API Providers do usuário, a compatibilidade workspace mantém a sessão atual executável; depois que o arquivo Personal é gravado, o watcher atualiza o Registry de processo e os Models criados em seguida mudam automaticamente para a nova fonte da verdade. Models já criados não são reescritos.

## 32. Superfície de consumo da seleção de modelos migra primeiro os API Providers comuns

O Renderer ganhou um snapshot próprio `ModelSelectionView`. O Root primeiro assina `ModelSelectionService.onDidChange` e só depois lê a View inicial; a guarda de revision impede que a leitura inicial atrasada sobrescreva eventos de atualização. O snapshot em memória da UI mantém a Registry View serializável, sem converter para o antigo `ModelProviderConfig[]`.

O menu de modelos do Composer principal passou a consumir diretamente essa View. Providers com `kind = api` na nova Registry são projetados em grupos de modelos conforme a ordem do Registry e filtrados pelos `apiFormat` suportados pelo Agent atual; entradas do snapshot antigo com o mesmo providerId são excluídas, portanto nome, conjunto de modelos e ordem dos API Providers comuns passam a ser definidos pela nova Registry. O valor atualmente selecionado, o nome do trigger e a elegibilidade para restauração de configuração também passam a reconhecer Registry Providers, evitando que um novo Provider só apareça no menu sem conseguir ecoar corretamente.

Account/Plan Providers continuam temporariamente completados pela projeção antiga de seleção. O motivo é que seu agrupamento por Family, as conexões pessoal/equipe e o estado de entitlements ainda não foram integrados ao `AccountProviderAccess`; tratar o Account Config como um grupo de modelos comum mais cedo perderia a semântica de interação existente. Essa fronteira de compatibilidade cobre apenas Account/Plan e será removida depois que o M2.7 integrar o Account Provider ao Registry unificado.

Depois do Composer principal, os menus de modelos de Automations (incluindo o formulário compartilhado do OffPeak), Subagent e Repo Wiki também passaram a usar a mesma View. A lógica existente de cada funcionalidade — estado de tarefa, Entitlement e planos Family/Team — permanece inalterada; os API Providers vêm da nova View e Account/Plan são completados pela projeção antiga do período de migração. A leitura e escrita de Config da página de configurações continua migrando separadamente para o `ProviderSettingsService` e não usa o snapshot de seleção de modelos para executar escritas.

Além da seleção de modelos, os campos estáticos de exibição de Provider lidos pelo entorno do chat seguem a mesma prioridade. Os avisos de troca de modelo, os nomes da linha do tempo e o Base URL do Provider na telemetria de envio são lidos preferencialmente do `ModelSelectionView`; só Account/Plan Providers que o Registry ainda não publicou caem para a projeção antiga. Assim, mesmo que um API Provider comum exista ao mesmo tempo nos dois objetos do período de migração, o snapshot antigo deixa de decidir exibição ou atribuição.

## 33. Account Access começa com uma Source de migração sem segredos

Os fatos estáticos de Provider/Model dos Account Providers já entraram em `config/provider/official.json`. Como o arquivo único representa hoje o ambiente de produção, os quatro Plan Providers usam o Endpoint de produção; ambientes de teste ou outros produtos serão expressos depois injetando outro Official Config completo, e não se permite que o Registry leia `process.env` para reescrever o Endpoint.

A lógica existente de conta, plano e Provider Family continua concentrada no antigo `ModelProviderService`. M2 adiciona temporariamente a única Source de migração, comprimindo o Snapshot de Registry que ela já filtrou para:

```text
providerId + modelIds + accessId
```

API Key, JWT, Headers, Endpoint e capacidades de modelo do Snapshot não entram no novo Account Access. Team Plan usa a selected connection key completa como `accessId`; Personal Coding Plan e Start Plan usam IDs estáveis não sensíveis. Assim o Registry consegue fixar a identidade da conexão no momento da criação do Model, enquanto as credenciais de requisição permanecem no Request Auth Service subsequente.

Os Official Account Models mantêm temporariamente as formas de capitalização realmente usadas pela cadeia antiga, `GLM-5.2` e `GLM-5-Turbo`. Como ModelConfigRules é correspondência completa de regex sensível a maiúsculas/minúsculas, desta vez foram escritas regras explícitas para esses dois IDs no Official Config, sem alterar globalmente a semântica de casamento das regras e sem normalizar silenciosamente o modelId de Sessions históricos. Depois que o Official Config remoto for publicado, ele deve distribuir diretamente o conjunto completo de modelos de Account; o Access Source fica responsável apenas por filtrar o subconjunto atualmente disponível para a conta.

## 34. Registry do Worker recebe o escopo de acesso da conta; credenciais de execução ficam na projeção de compatibilidade

O protocolo antigo do Registry do Host ganhou um `accountAccessId` opcional. Ele representa apenas a identidade da conexão de conta atual e não contém Segredos. Ao construir o Snapshot antigo, o Host escreve esse campo conforme a conexão Personal/Team/Start Plan atual; ao receber `workspace/updateProviderRegistry`, o Worker primeiro comprime as entradas de conta em `AccountProviderAccessSnapshot`, depois espera o Registry de processo terminar o refresh e, por fim, aplica a projeção de execução antiga do Workspace.

```text
Host Account / Plan 判断
        |
        | providerId + modelIds + accountAccessId
        v
Worker Mutable Account Source
        |
        v
Worker Provider Registry
        |
        | Account Model 静态事实
        v
ModelFactory

旧 Workspace Snapshot
└─ 暂时只为 Adapter 提供 API Key / JWT / Runtime Header
```

Essa ordem garante que, quando a criação de uma Session ocorre logo após a requisição de atualização, o Registry do Worker já enxerga o Account Provider. Properties, Option Specs, Options padrão e reasoningMapping do Account Model vêm todos do Official Config; os campos de capacidade dos modelos de mesmo nome no Snapshot antigo deixam de participar da criação do Model.

A migração final das credenciais de requisição ainda não foi concluída. O Adapter atual resolve e retém o SDK Model correspondente no momento da criação do Model, portanto um Model de Coding Plan já criado não troca de credencial no lugar quando o Registry é atualizado depois; o Start Plan continua usando, antes de cada requisição, o canal existente de renovação do Header de verificação de segurança de uso único. A próxima fatia precisa criar o Request Auth Service com o `accountAccessId` fixo e então remover os Segredos de conta e o `fallbackSource` do Snapshot antigo do Workspace. Até lá, a projeção de execução antiga não deve ser descrita como nova fonte da verdade do Registry.

## 35. Identidade de Account Access é fixada dentro do Model e levada até a fronteira de requisição

Na criação do Account Model, o `accountAccessId` atualmente publicado pelo Registry é gravado na configuração de execução privada do Model do Adapter. O chamador de negócio continua submeterendo apenas o `ModelRequest` genérico; ele não lê a conexão da conta nem transmite o Access ID. O Adapter anexa esse ID ao chamar o Runtime Header Port existente em cada tentativa de rede real, e o Worker o repassa ao Host por um protocolo estrito.

```text
Registry Account Provider(accessId = A)
        |
        | create Model
        v
Model private execution config(accessId = A)
        |
        | each network attempt
        v
Worker Runtime Header Port
        |
        | providerId + modelId + accessId A
        v
Host request-auth boundary
```

Este passo apenas estabelece a cadeia de identidade estável, sem mudar a resolução nem a renovação dos Headers de verificação de segurança de uso único existentes e das API Key e Coding Plan Runtime Key atuais. A próxima fatia pode obter as credenciais de requisição no Host pelo `accessId`, sem precisar adivinhar a partir de uma "conexão atual" variável; um Model já criado continua solicitando materiais de autenticação da conexão original mesmo atravessando uma troca entre conexões Personal/Team.

## 36. Adapter ganha material de autenticação com escopo de requisição

Pesquisas adicionais confirmaram que a API Key do Coding Plan não corresponde a um único HTTP Header. O Adapter atual a usa para inicializar o SDK do Provider e, em alguns Endpoints, participa da verificação de segurança de requisição da versão oficial. Portanto o Host não pode traduzir antecipadamente toda a autenticação dinâmica para um único Authorization Header.

O contexto de chamada do Model ganhou um `ModelRequestAuth` interno, com `apiKey` e `headers` opcionais. O Request Auth Port pode devolvê-lo a cada tentativa física; o Adapter cria temporariamente o SDK Model para a tentativa corrente com base na configuração de execução estática do Provider no Registry compartilhado. A API Key temporária continua passando pelo SDK existente, pelo roteamento de Endpoint e pelo caminho de verificação de segurança de requisição, enquanto os Headers sobrescrevem os Headers estáticos do Provider depois deles. O Registry compartilhado, o Model já vinculado e as requisições concorrentes não são modificados.

Esse tipo não pertence ao `ModelRequest` genérico e também não entra na Provider Registry View. O Schema do protocolo já suporta um resultado de autenticação em tempo de requisição opcional; enquanto o Host não fornecer esse campo, o comportamento atual de atualização do Runtime Header permanece inalterado.

## 37. Header de verificação de segurança de uso único entra primeiro pelo recibo de request-scoped auth

Quando os Services respondem às requisições existentes de Runtime Headers de Provider, colocam ao mesmo tempo o Header de verificação de segurança de uso único obtido pelo Renderer em `requestAuth.headers` do protocolo. O novo Adapter do Worker o usa diretamente na tentativa corrente. O antigo `session/updateRuntimeModelConfig` continua sendo executado temporariamente, para proteger Workers antigos, o desktop-attached remote e origens de Model ainda não migradas; os dois caminhos usam o mesmo Header e portanto não alteram o resultado da requisição atual.

Este passo provou que o material de autenticação em tempo de requisição pode trafegar integralmente por Renderer → Services → stdio → Worker → Adapter. Antes de desativar a antiga atualização de runtimeModel, ainda é preciso fazer o Request Auth Service do Host fornecer simultaneamente o JWT do Start Plan, a Key do Personal Coding Plan e a Key do Team Plan resolvida por org/project fixos; não se pode buscar Segredos no Snapshot antigo apenas com base na conexão atualmente selecionada.

## 38. O Host estabelece a fronteira de resposta automática do Account Request Auth

O ZCode Agent Service pode injetar um Account Request Auth Resolver estreito. O Resolver obtém a API Key e os Headers da tentativa atual conforme o `providerId + modelId + accountAccessId` já fixados no Model. Personal Coding Plan e Team Plan são respondidos pelo Host diretamente, sem depender mais do Renderer ou do session pane; o Start Plan continua aguardando o Renderer produzir o Header de verificação de segurança de uso único e então o combina com o JWT devolvido pelo Resolver em um único Request Auth Material.

O Runtime Auth Port do lado do Worker permanece disponível para todos os Models, mas o Adapter só o chama quando existe um `accountAccessId` dentro do Model e, por isso, um API Provider comum não causa uma ida e volta extra ao Host. O que está concluído agora é a fronteira de comunicação, de roteamento e de combinação; o próximo passo é injetar no Host de produção o resolvedor de autenticação real dos planos.
## 39. O Host de produção integra o Account Provider Request Auth Service

Os Services ganharam um `AccountProviderRequestAuthService` independente, que valida a titularidade de `accountAccessId` em relação ao providerId e resolve separadamente as três identidades de execução:

- Start Plan lê o JWT zcode do OAuth Token Set conforme a família do provider.
- Personal Coding Plan lê a API Key mais recente daquele provider a cada vez.
- Team Plan resolve o product / organization / project fixados no accessId e então obtém a Key do projeto correspondente.

A implementação remota de ensure/copy da Team Key reaproveita temporariamente a lógica estável do antigo Model Provider Service, mas a entrada é construída isoladamente pelo Request Auth Service com o accessId fixo, sem ler mais a selected connection atual da UI. Os testes cobrem o sequenciamento em que "o Loop tem Team A, a seleção atual já voltou para Personal e a requisição ainda obtém a Team A Key". Quando a projeção antiga de Secrets do Registry for removida, a implementação remota da Team Key será extraída fisicamente do Service grande, sem afetar a fronteira externa estabelecida nesta rodada.

## 40. Account Provider sai da dependência de Secrets do Workspace

A projeção de execução do AI SDK do Worker agora contém API e Account Providers ao mesmo tempo. A projeção de Account contém apenas apiFormat, baseURL e Headers estáticos e permite inicializar o SDK sem API Key; `createModel()` fixa o `accountAccessId` e cada tentativa real cria o SDK Model daquela tentativa com o Request Auth Material.

Com isso um Account Model não depende mais de existir um Model de mesmo nome no workspace compatibility source para ser criado. O Snapshot antigo ainda pode ser gerado pelo Host para outros consumidores ainda não migrados, mas a correção de autenticação do novo Account Model local não depende mais dos Secrets dele.

## 41. Remoção de segredos do Account Registry enviado pelo Host local

Quando o ZCode Agent Service possui ao mesmo tempo o Provider Registry Source local e o Account Request Auth Resolver, ele remove o `apiKey` e os Headers de tempo de requisição dos Account Providers na fronteira Host → Worker, mantendo apenas a projeção estática de provider/model e o `accountAccessId`. A revision pós-remoção é recalculada a partir desse conteúdo estático; renovações de Token e de Team Key não fazem mais o Worker acreditar que os fatos estáticos do Registry mudaram.

Essa troca vale por enquanto apenas para o novo Runtime local. SSH / WSL / Docker anexados ao desktop ainda não têm Provider Registry Source local e mantêm a compatibilidade do Snapshot antigo; eles removem os Secrets depois que o M2.8 integrar o mesmo Registry e a mesma fronteira de Request Auth.

## 42. Settings Facade migra primeiro os fatos de leitura estática

O Host inicia o Provider Runtime de forma assíncrona depois de montar o Service Collection de modo síncrono. A nova Facade lia inicialmente o Snapshot do Registry diretamente, de modo que, se o Renderer chamasse `getView()` antes da primeira resolução de Source, receberia um erro de "ainda não iniciado" e cairia na projeção antiga. `ProviderRuntime` agora mantém um único start Promise; a visualização, a pré-visualização e a escrita de Settings, assim como a visualização e a validação de Selection, esperam essa barreira de prontidão.

O Renderer ganhou um snapshot compartilhado `ProviderSettingsView`, seguindo o mesmo sequenciamento de conexão de "assinar primeiro, ler depois, revision bloqueia valores atrasados". Os componentes atuais da página de configurações ainda consomem o tipo de exibição antigo `ModelProviderConfig`, então a fronteira de migração faz primeiro uma projeção unidirecional:

```text
ProviderSettingsView
├─ API Provider 静态字段与 Model Config ──> 设置页兼容展示对象
└─ Account Provider
   └─ 暂时复用旧对象的套餐、连接与产品交互状态
```

O label, o Endpoint, a API Key, o conjunto de modelos, as Properties, os Option Specs e a apresentação de reasoning dos API Providers já não são mais decididos pela lista antiga. A criação e a edição de API Providers Personal-only já migraram para a primeira escrita no novo Config conforme a seção 46; os formulários de Official/Account Provider ainda passam pela ponte da seção 29. Depois que o formulário separar o estado Personal/Effective do estado de produto de Account, a projeção de compatibilidade e a ponte de escrita antiga serão removidas.

## 43. A ordem de Provider volta ao Personal Overlay

A página de configurações não usa mais um `display-order` independente para determinar a ordem da nova Provider View. A página pega a ordem efetiva diretamente do `ProviderSettingsView` e renderiza o handle de arraste apenas para Providers Personal-only com `canReorder = true`. Official Providers e seus Personal Overrides mantêm a posição do Official.

Após o arraste, a Settings Facade é chamada primeiro para reordenar o Personal Provider Config. A sequência de IDs recebida é a ordem efetiva final atual; o Config Service extrai apenas as keys já existentes no Personal Overlay, de modo que um Official Override é normalizado, pela ordem do Official, para antes dos Personal-only Providers. Esta seção inicialmente mantinha o espelho do antigo `saveDisplayOrder`; depois que a seção 99 confirmou que o novo Host não tem mais consumidores desse espelho, as escritas nova e antiga passaram a ser caminhos mutuamente exclusivos.

## 44. A ordem de Personal Model volta ao Provider Config

A página de configurações só exibe o handle de arraste de modelos para Personal-only Providers com `canReorder = true`. O arraste chama `ProviderSettingsService.reorderPersonalModels()` usando a ordem atual de IDs de modelo; o Config Service reordena apenas o campo `models` daquele Personal Provider, e as propriedades do modelo continuam sendo cobertas separadamente pelas Model Config Rules.

O antigo `ModelProviderConfig.models` grava em seguida a mesma ordem durante o período de migração, para uso dos consumidores que ainda não saíram da lista antiga. A construção do espelho acrescenta de volta à lista entradas tombstone ou ocultas que não participaram do arraste, evitando que uma reordenação visível de modelos apague acidentalmente o estado de compatibilidade. Quando a nova escrita Personal falha, a UI restaura a ordem original; depois que a nova escrita tem sucesso, uma falha apenas no espelho antigo gera um aviso e não desfaz a fonte da verdade única.

## 45. A exclusão de Personal-only Provider migra para a nova fonte da verdade

Ao excluir na página de configurações um Personal-only Provider com `canReorder = true`, a Settings Facade é chamada primeiro para excluir o Personal Config e só então o espelho de compatibilidade é removido da lista antiga de Providers. Quando a nova exclusão falha, o comportamento antigo é preservado e o erro é reportado à UI; quando a nova exclusão tem sucesso, uma falha apenas no espelho antigo gera um aviso e não pode recriar um Provider já removido da fonte da verdade única.

Official Providers e seus Personal Overrides não passam por esta entrada. Eles só podem migrar depois que o novo formulário de configurações distinguir explicitamente "excluir o Provider" de "limpar o Personal Override", para evitar confundir duas ações de produto.

## 46. Personal-only Provider migra primeiro para escrita atômica de configuração

O cartão antigo de configurações salvava um `ModelProviderConfig` completo de uma vez, misturando campos de Provider, campos de modelo e valores gerados pelo Catalog antigo. O novo contrato de configurações expressa a camada Personal explícita e o resultado Effective; escrever diretamente o resultado do formulário antigo como Personal Overlay para um Official Provider congelaria os valores herdados e também não permitiria distinguir "o usuário digitou explicitamente um valor igual ao do Official" de "o usuário não sobrescreveu". Por isso esta fatia não faz a diferença inversa de Effective para Personal em Official/Account Providers.

Um API Provider Personal-only não tem base Official, e seu formulário completo pode ser convertido sem perdas em um Personal ProviderConfig completo mais o conjunto de ModelConfigs exatos daquele Provider. O Config Service oferece um único Repository update para esta interação: atualizar o Provider e substituir por inteiro as regras de modelo exatas daquele Provider; outros Providers, as regras de Pattern e as regras exatas de outros Providers permanecem inalterados. O RPC de configurações conclui primeiro essa nova escrita e depois grava o mesmo resultado no armazenamento antigo como espelho de compatibilidade. A escrita do espelho não dispara mais o Legacy Importer substituindo o Personal Config no sentido inverso.

Durante a migração permanece uma entrada de conversão de formulário Legacy com nome explícito, responsável por converter o antigo `ModelProviderConfig` em entrada da nova Facade. Ela só aceita Personal-only API Providers já confirmados pela Settings View. A condição de saída é o cartão de configurações passar a editar `personalConfig` diretamente e usar `effectiveConfig` para a exibição herdada; nesse momento a entrada de conversão Legacy e o espelho do armazenamento antigo são removidos, sem levar os tipos antigos para a API de domínio `@zcode/provider`.

## 47. O login por API Key do Welcome só modifica o Personal Override esparso

O formulário de API Key do Welcome atende apenas os dois Official API Providers `builtin:zai` e `builtin:bigmodel`. Quando o usuário submete uma API Key, a nova entrada de escrita lê o `personalConfig` atual daquele Provider na Settings View, preserva os campos explícitos já existentes e sobrescreve `kind = api`, `apiKey` e `enabled = true`. O Endpoint, a lista de modelos e as configurações de modelo fornecidos pelo Official continuam herdados e não são copiados do objeto Effective antigo para o Personal Config.

Depois de salvar, o Provider Store antigo ainda grava o mesmo resultado para os consumidores ainda não migrados, mas a sincronização inversa do Personal Config é desligada. A leitura da Key já salva também usa preferencialmente o Effective Config da Settings View; a lista antiga só é usada como fallback quando o novo serviço não está montado ou ainda não contém o Provider. O modo de Provider Family, a seleção de modelo do App Recent e o estado de conclusão do Welcome continuam sendo geridos pelo estado de interação original e esta fatia não altera essas semânticas de produto.

## 48. A restauração de Custom Model usa a Selection View para decidir os modelos selecionáveis

Ao restaurar uma seleção antiga de Custom Model que tem apenas providerId e nenhum modelId, o SessionPane precisa escolher o primeiro modelo disponível daquele Provider. Depois que o Model Selection Snapshot está hidratado, esse candidato vem diretamente da Registry View; quando o Provider não existe ou não tem modelos, considera-se atualmente não selecionável e não se recorre mais à lista antiga de Providers para trazer de volta um modelo inválido para a UI. A leitura de compatibilidade `getAllCached()` só é mantida enquanto o Snapshot ainda não está hidratado, para que o fluxo de restauração no início da inicialização não falhe.

## 49. A exclusão de Personal-only Provider também limpa o Model Config exato

O Provider Config e o Model Config exato são duas partes persistentes do mesmo objeto de configuração. A Settings Facade decide o alvo da exclusão a partir da camada Official: um Personal-only Provider remove, no mesmo Repository update, a linha do Provider e todos os Model Configs exatos daquele providerId; as regras de Pattern do mesmo providerId são preservadas. Quando o Personal Override de um Official Provider é limpo, o Model Override independente não é removido junto, e as duas ações do usuário continuam separáveis.

## 50. O portão de entrada do rascunho prefere ler o Model Selection Service

O primeiro envio de um rascunho V4 só precisa saber se existe pelo menos um modelo selecionável. Quando o novo Host já está montado com `ModelSelectionService`, a verificação de montagem, a assinatura de mudanças e a reverificação antes do envio leem a mesma Selection View; uma View vazia significa que o Registry confirmou que não há modelo vinculável. O antigo `ZCodeProviderRegistrySnapshot` só é usado como fallback quando o serviço falta durante a migração e continua cobrindo a compatibilidade com o Host antigo e com os testes independentes. O admission de nível de processo do Host permanece, responsável pela corrida de configuração que ocorre depois da reverificação da UI.

## 51. Prompt CLI e TUI integram primeiro o Registry de processo injetável

O `app-server` já inicia uma instância de `NodeProviderRegistryRuntime` no processo do Worker, mas o `--prompt` comum e a TUI ainda criam o App diretamente e, portanto, não entregam o novo Registry ao Model Runtime mesmo quando a Entry já forneceu os caminhos de Official / Personal Config.

Esta fatia reutiliza a mesma função de inicialização. O Prompt CLI inicia o Registry durante um comando, o empresta ao App e o libera depois que o App fecha. A TUI inicia uma única vez na primeira criação de App; `/new`, resume e fork apenas substituem o App e continuam emprestando o mesmo Registry, que só é liberado quando todo o Prompt Handler é encerrado. Assim cada processo TUI tem apenas um conjunto de Config watchers.

Esta fatia não adivinha o local de instalação da CLI. A nova cadeia só é habilitada quando a Entry já injetou os dois caminhos de Config; a montagem dos caminhos padrão do Official Config e do Personal Config empacotados com a CLI/TUI fica para a próxima fatia do M2.6. Essa fronteira é uma entrada formal de injeção de dependências, não um retorno às fatos antigos de Provider.

## 52. CLI/TUI estabelece o caminho de execução padrão a partir do mesmo arquivo Official

> Esta seção e a próxima registram a implementação de caminho físico da época. A decisão posterior em [`Human in the Loop #10`](./02-provider-config-and-registry-human-in-the-loop.md#10-personal-config-保持原路径并以-schema-version-1-首次发布) já definiu que o Personal Config mantém o caminho original `config.json`, com backup antes da migração, e é publicado pela primeira vez com o Schema Version 1 final.

O bundle comum da CLI carrega o `config/provider/official.json` do repositório ao lado do `zcode.cjs`. A build SEA declara o mesmo arquivo físico como asset, lê o conteúdo do asset na inicialização e o materializa por SHA-256 em `.zcode/v2/runtime-assets/provider/`; o nome do arquivo contém o hash integral do conteúdo, de modo que uma nova versão não reescreve no lugar um arquivo Official que está sendo lido por outro processo. As duas formas de empacotamento terminam injetando apenas o caminho do arquivo em `@zcode/provider-node`.

Por padrão o Personal Config aponta para `.zcode/v2/provider-config.json` sob a raiz de dados atual, usando o mesmo arquivo de Environment que o Desktop. `ZCODE_DATA_BASE_DIR` continua determinando a raiz de dados; os caminhos Official / Personal explicitamente injetados pelo Worker do Desktop, pelos testes e pelas implantações remotas têm prioridade e não são sobrescritos pelos valores padrão da CLI. Comandos que não criam o Core, como Doctor, login e gestão de plugins, não preparam asset de Provider.

Esta fatia apenas conclui a montagem física da fonte da verdade. O Model padrão do App Standalone, a lista `/model` e a Selection de Session ainda leem o Runtime Config antigo; os Providers que o novo Registry ainda não contém continuam sendo executados pelo workspace compatibility source do M2.5. A próxima fatia precisa concluir a importação diferencial única dos Personal Providers da CLI antiga e mudar a visualização e a seleção de modelos do Standalone para a Registry View; só depois disso essa leitura antiga de fatos pode ser removida.
## 53. A migração Standalone lê apenas as definições antigas de Provider do usuário

O CLI Config antigo carrega simultaneamente vários domínios: Provider, seleção atual de modelo, overrides de projeto, MCP, Hooks e assim por diante. A migração de Personal Provider lê apenas o `provider` declarado explicitamente no arquivo antigo do usuário; `model` é Selection, e configuração de projeto, variáveis de ambiente e parâmetros de CLI são overrides de execução — nenhum deles pode ser fixado como Environment Personal Config.

A entrada antiga do Desktop é o `ModelProviderConfig[]` histórico, e a entrada antiga do Standalone é o arquivo de configuração de usuário da CLI antiga (formato aninhado `provider` → `models`). Os dois são primeiro adaptados separadamente ao `ProviderConfig + ModelConfig` atual e depois passam por uma projeção pura compartilhada que calcula as diferenças em relação ao Official. Assim o parsing do formato antigo permanece em cada camada de montagem, enquanto a diferença de campos do Personal Overlay, as regras de modelo exatas e a geração do documento versionado têm uma única implementação.

```text
Desktop legacy provider list ──> current Provider/Model ──┐
                                                          ├─> shared Personal diff ─> new file
Standalone user provider JSON ─> current Provider/Model ──┘
```

Apenas Prompt CLI e TUI habilitam explicitamente a importação Standalone. Workers de protocolo como `app-server` / `agent-server` continuam lendo somente o Official, o Personal e o Account Access injetados pela Entry; eles não vasculham o `~/.zcode/cli/config.json` da máquina. Quando o novo arquivo Personal já existe, o Repository não chama o importer e, portanto, sobras posteriores do arquivo de usuário antigo não sobrescrevem o fato novo.

A implementação desce o cálculo de diferenças entre "Provider/Model atual já expandido e o Official" para uma projeção pura de `@zcode/provider`. A lista histórica do Desktop e o JSON de usuário do Standalone ficam cada um responsável apenas por adaptar os campos antigos, e o cálculo de diferenças, as regras de modelo exatas e a geração do documento versionado compartilham a mesma implementação.

O adaptador Standalone atualmente migra nome do Provider, API Format, Base URL, API Key, Headers estáticos, ordem dos modelos, Properties, Option Specs e reasoning mapping. O formato antigo também permite `model.headers` e qualquer `model.options` fora do reasoning; a fronteira formal Model/Request atual ainda não decidiu o destino desses campos de execução.

A migração é de tudo ou nada: se qualquer Provider antigo contiver esses campos não expressos, o importer desta rodada retorna "não migrado", o Repository não cria o arquivo Personal e o compatibility source do M2.5 continua protegendo o comportamento de execução antigo. Assim, depois que uma versão futura preencher os campos, a tentativa pode ser refeita e não fica permanentemente bloqueada por um arquivo vazio de migração parcial. Antes de a Standalone Selection View sair da lista antiga de modelos, é preciso decidir se os campos fixos ainda válidos entram no Config ou se a capacidade antiga correspondente é removida de forma explícita com um diagnóstico de migração.

## 54. A seleção de modelo de Session migra por Provider para o Registry

O Standalone Prompt CLI / TUI já tem um Registry de nível de processo, mas `ZCodeApp.listModels()`, `setModel()` e `setThoughtLevel()` continuam sendo interpretados pelo Runtime Model Config antigo e pelo Catalog. Trocar apenas a lista de modelos produziria um estado intermediário inaceitável: o usuário veria os modelos do Registry e, ao trocar, seria rejeitado pela configuração antiga.

Desta vez o conjunto inteiro de comportamentos é trocado de uma só vez:

```text
Registry 已拥有 Provider
├─ 候选模型来自 Registry View
├─ Properties / Option Specs 来自 ModelConfig
├─ reasoning 档位通过 ModelRef.variant 交给新 ModelFactory
└─ 显式切换只更新 Session 运行状态与 Session Selection

Registry 尚未拥有 Provider
└─ 整个 Provider 继续使用 M2.5 compatibility source
```

A mesclagem de compatibilidade é feita por Provider. As fontes antiga e nova não são entrelaçadas modelo a modelo para o mesmo Provider, portanto assim que o Registry assume um Provider, o Catalog antigo, o reasoning antigo e as capabilities antigas deixam de participar da cadeia de seleção desse Provider.

O caminho do Registry não grava mais a troca de `/model` de volta no arquivo de configuração de Provider da CLI antiga. Essa ação expressa a seleção de modelo da Session atual; a escrita no arquivo antigo fica apenas no caminho de compatibilidade de Providers ainda não migrados. O Configured Default de uma nova Session da CLI/TUI ainda vem temporariamente do Runtime Model Config antigo e essa dependência de inicialização só é removida depois que a Selection padrão formal for estabelecida.

## 55. `includeUsage` entra no Provider Config (coberto pela 74)

O `includeUsage:false` de um Provider da CLI antiga fazia as requisições de streaming OpenAI-compatible não enviarem `stream_options.include_usage`. Essa é uma semântica de execução estável da conexão do Provider, sem dependência de Session ou de requisição individual, portanto entra no Official/Personal Provider Config e é projetado pelo Model Runtime no Adapter existente.

O campo tem a mesma semântica de Config para API e Account Providers; hoje apenas o Adapter OpenAI-compatible o consome e os outros API Formats o ignoram. O Personal Importer antigo da CLI consegue migrar esse campo sem perdas.

O `headers` de nível de modelo e qualquer `options` ainda não entram nesta fatia. Eles alterariam a fronteira Model/Request; o Importer continua rejeitando a migração por inteiro de Providers que contenham esses campos de execução, sem produzir um arquivo Personal parcialmente bem-sucedido.

## 57. Distinguir campos antigos de execução do Model de metadados sem consumidor

Os antigos `interleaved` e `reasoningContentField` seriam convertidos em `ModelCapability.reasoningContentField`, mas nenhum Model Request, conversão de mensagens históricas ou Adapter no código de produção lê esse campo. São metadados de Catalog cujo ciclo nunca foi concluído e não devem continuar impedindo que um Provider entre na nova fonte da verdade. O Standalone Importer portanto ignora esses dois campos antigos.

Tanto `model.options.max_tokens` quanto o histórico `model.options.extra_body.max_tokens` expressam o limite de saída do modelo. O Importer os normaliza como `optionSpecs.maxOutputTokens` e não leva mais parâmetros brutos do Provider para a nova cadeia de execução. A prioridade mantém a lógica antiga: `limit.output > options.max_tokens > options.extra_body.max_tokens > maxOutputTokens > Catalog/Fallback`.

Todo o restante de `model.options` e `model.headers` altera a requisição real e não pode ser descartado como metadado inválido. Esta auditoria mantém por enquanto a recusa de importação; fatias seguintes precisam convergir esses campos para dentro de um Config tipado e da fronteira de montagem do Adapter.

## 58. O Header estático de nível de modelo é encapsulado pelo ModelConfig (coberto pela 71)

A CLI antiga combinava Headers estáticos na ordem `Provider Header -> Provider options Header -> Model Header -> inline target Header`. O inline target já não pertence à semântica do novo Config; as duas primeiras camadas já convergiram para ProviderConfig.headers. O Model Header continua sendo uma configuração de execução válida diferenciada por modelo sob o mesmo Provider e, por isso, converge para `ModelConfig.headers`.

A Registry View carrega o ModelConfig já resolvido. Ao criar o Model, o Worker entrega o `headers` à fronteira de montagem de Model do Adapter; o Adapter o aplica sobre os Headers do Provider atual e reaplica o mesmo Model Header depois de cada renovação de Header feita pela autenticação de Account. Os tipos públicos Model e ModelRequest não ganham novos campos de Header.

`headers` é um campo de valor comum do ModelConfig: a próxima regra que casa substitui por inteiro o dicionário de Headers da anterior. A projeção de diferenças do Personal, o JSON Schema e o Standalone Importer usam o mesmo campo, sem criar uma segunda expressão de runtime.

## 59. Os parâmetros de requisição fixos do modelo convergem para a fronteira de montagem do Adapter (coberto pela 71)

O `model.options` da CLI antiga era combinado nas Provider Options durante a resolução do alvo de modelo, e campos como `reasoningSummary` alteravam de fato a requisição, portanto não podem ser descartados na migração. Ele também não pode voltar a ser uma entrada arbitrária de parâmetros no `ModelRequest` público, sob pena de burlar a fronteira de requisição genérica já estabelecida no M1.

O ModelConfig ganha `requestParameters: ProviderRequestParameters`, que guarda os parâmetros JSON nativos do Provider usados de forma fixa pelo modelo. Ao criar o Model, o Registry primeiro combina recursivamente `requestParameters` com o `reasoningMapping` do nível de reasoning atual, sendo que o segundo sobrescreve as folhas de mesmo nome; em seguida o resultado é envolvido uma vez conforme o `apiFormat` do Provider e entregue ao Adapter. Core, o Model público e o ModelRequest não têm ciência desses campos.

Entre regras de ModelConfig continua valendo a semântica de Overlay comum: os `requestParameters` da regra seguinte substituem por inteiro os da anterior. A combinação recursiva só é usada dentro de um mesmo ModelConfig final, para "parâmetros fixos do modelo + parâmetros de reasoning atuais", correspondendo a um comportamento que já existia no runtime antigo.

O Standalone Importer desfaz o namespace histórico do API Format atual nos antigos `model.options` e grava o resultado em `requestParameters`. `max_tokens` e `extra_body.max_tokens` já foram normalizados como `optionSpecs.maxOutputTokens` e são removidos dos parâmetros originais durante a importação, evitando duplicar o campo de orçamento. Essa decisão completa os antigos campos de execução que o plano original não listava explicitamente, mantendo ao mesmo tempo Official + Personal + Account Access como única fonte da verdade.

## 60. Não migrar campos do Schema antigo de Provider que não têm consumidor

O Schema `options` do Provider antigo aceita `timeout`, `chunkTimeout` e campos desconhecidos adicionais, mas nem a resolução do alvo de modelo nem o Provider Registry os leem. O timeout real de HTTP vem do `network.timeout` independente e o timeout de streaming ocioso vem do `modelStream.idleTimeoutMs`. Esses campos já não produzem comportamento de execução na cadeia antiga, portanto o Standalone Importer os ignora e não deixa mais o Provider inteiro falhar na migração.

`apiKeyRequired: false` continua rejeitando a migração. O ProviderConfig desta rodada tem apenas o API Provider, que exige API Key, e o Account Provider, que obtém a autenticação em tempo de requisição; a equipe decidiu explicitamente não criar por enquanto uma terceira forma oficial para endpoints de teste sem autenticação e auto-hospedados. O Importer permanece tudo ou nada, de modo que essa configuração interna continua pelo caminho de compatibilidade e não gera um novo Personal Config que não pode ser executado.

## 61. O formulário antigo de configurações preserva a configuração de execução privada do modelo ao salvar (coberto pela 71)

A página de configurações ainda projeta a nova ProviderSettingsView como o formulário antigo `ModelProviderConfig`. Esse tipo antigo não tem Header de nível de modelo nem `requestParameters`, portanto, se o usuário alterar apenas o nome do Provider, o Base URL ou a API Key e salvar, a importação inversa direta substituiria por inteiro o ModelConfig exato e apagaria fatos de execução que a interface não consegue expressar.

Ao salvar um API Provider Personal-only, a ponte de migração toma como referência a configuração editável convertida do formulário antigo e, ao mesmo tempo, preserva `headers` e `requestParameters` do modelo de mesmo nome no Registry atual. Esses dois campos só são consumidos na fronteira de montagem do Adapter e a página de configurações antiga não tem interação para editá-los ou limpá-los; preservá-los está de acordo com a semântica observável pelo usuário. Depois que o novo formulário de configurações editar o ModelConfig diretamente, essa lógica de ponte é removida junto com a projeção antiga `ModelProviderConfig`.

## 56. Provider Config v2 e a ponte de migração das configurações (coberto pela 74)

A versão do documento do Provider Config sobe para 2 e passa a embutir a migração adjacente de v1 para v2. `includeUsage` é um campo opcional, de modo que a migração preserva o conteúdo original da configuração e atualiza apenas a versão do documento; tanto a Official Source quanto o Personal Repository leem pela mesma entrada de migração, e versões futuras continuam sendo atualizadas grau a grau entre versões adjacentes.

A página de configurações atual ainda projeta a `ProviderSettingsView` em um objeto de formulário antigo `ModelProviderConfig`. Se a ponte de migração não carregar `includeUsage`, o usuário que editar outros campos e salvar apagaria esse fato novo do Personal Config. Por isso os tipos antigos, o Schema, a projeção de Settings e o Importer inverso carregam explicitamente esse campo durante o período de migração, garantindo que uma ida e volta pela página de configurações não perca configuração; depois que o novo formulário editar o Personal/Effective Config diretamente, esse conjunto de campos de ponte sai junto com os tipos antigos.
## 62. O alias main dos modelos do Registry vem da seleção padrão formal do Environment

`listRegistryBackedModels()` já obtém o conjunto de modelos do novo Registry, mas continuava copiando o alias por `providerId/modelId` do Runtime Model Config antigo. Assim a mesma Registry View produzia uma exibição diferente conforme sobrasse ou não configuração antiga da CLI no processo, o que contraria a fonte da verdade única.

O alias dos Registry Providers passa a ser calculado pelo `configuredDefaultModelSelection` formal: o modelo que corresponde à seleção padrão do Environment recebe `main`, e os demais modelos do Registry não têm alias. Um Provider inteiro que ainda não foi migrado para o Registry mantém a lista antiga e seus aliases como eram até que o compatibility source correspondente saia. O `lite` não é mais copiado da configuração antiga; ele já não faz parte do novo estado de seleção de modelos.

## 63. Turn Model Source e Workspace Model Source têm cada um seu target explícito

O Worker Model Runtime mantém hoje três classes de fonte: o Process Registry de longo prazo, o Turn Execution Source do turno corrente e o Workspace Compatibility Source, que ainda será descontinuado. O Workspace Source usava antes a condição "qualquer overlay, de workspace ou de turn, casou" para decidir se possuía um Model, mas a configuração que ele lia continha apenas o overlay de workspace. O Turn Source, por ter prioridade maior, mascarava essa inconsistência, mas quando consultado isoladamente a fonte podia afirmar que criaria um Model temporário que ela não possuía.

Esta fatia estreita o julgamento de target do Workspace Source para os membros do próprio overlay de workspace e renomeia o nome ambíguo `fallbackSource` no Model Runtime para `workspaceCompatibilitySource`. A prioridade das fontes permanece: o Model temporário do Turn vem antes do Registry, e o Model de compatibilidade de Workspace só é usado quando o Registry não tem o Provider inteiro. A escrita por protocolo, a troca em tarefas ociosas e o antigo workspace snapshot ainda não foram removidos; esta rodada apenas estabelece a fronteira precisa que o M2.8 poderá descontinuar item a item.

## 64. Account Access reaproveita o Overlay do Provider Config

A primeira tentativa de convergir mudou o caminho lateral `AccountProviderAccessEntry[]` para `AccountProviderOverlay[]`, mas ainda introduziu `{ id, allowedModelIds }` e `Provider.accountAccess`, sem reaproveitar de fato o Overlay de Config já existente. Depois da revisão humana ficou confirmado: o Account Source deve produzir diretamente a terceira camada esparsa `ProviderConfigMap`, usando exatamente a mesma estrutura de dados e o mesmo algoritmo de Overlay do Official e do Personal.

`AccountProviderConfig` ganha `accessId`, e a camada de Account fornece o `accessId` e `models` correntes por Overlay comum de campos; `allowedModelIds` e a filtragem por interseção de modelos deixam de existir. Os membros finais do Registry usam `Provider` / `ProviderModel`, e o ModelFactory fixa a identidade da requisição a partir de `Provider.config.accessId`.

O Registry responde apenas pelo Overlay do Config final e pela validação de integridade, e não verifica se o `accessId` é realmente utilizável. Mesmo que uma identidade inválida seja escrita à mão no arquivo Personal, o Account Request Auth Service em tempo de requisição não conseguirá obter JWT, API Key ou Header a partir dela; a autenticação dinâmica continua sendo a fronteira final das permissões da conta. A primeira migração projeta o `ProviderConfigMap` de Account a partir do Snapshot antigo, e a fronteira de sincronização independente substitui essa origem na próxima fatia.

## 65. Account Config usa um protocolo de sincronização de processo independente

O Worker não extrai mais o Account Config em sentido inverso a partir do snapshot completo de execução de `workspace/updateProviderRegistry`. O Account Provider Source mantido pelo Host envia objetos comuns `revision + ProviderConfigMap` por `provider/updateAccountConfig`; o Worker faz o parsing com o Schema formal de `@zcode/provider`, recusa a mistura de API Providers, substitui o `MutableAccountProviderConfigSource` de nível de processo e atualiza o Registry.

```text
Host Account Provider Source
        |
        | provider/updateAccountConfig
        v
Worker MutableAccountProviderConfigSource
        |
        v
ProviderRegistryService.refresh()
```

O novo Worker sincroniza primeiro o Account Config corrente, antes de aplicar o Workspace Registry Snapshot, criar uma Session ou iniciar qualquer outra execução de modelo. O Host registra a revision já aplicada por Worker Client e não reenvia a mesma revision. Mudanças no Account Source são empurradas diretamente para todos os Workers locais ativos, sem precisar reconstruir o Workspace Snapshot. O desktop-attached remote mantém por enquanto a fronteira antiga e migra em separado junto com o M2.8.

O protocolo transporta apenas campos de Config estáticos do Account Provider, como `accessId` e `models`. JWT, API Key e Headers dinâmicos continuam sendo resolvidos pelo Account Request Auth Service a cada requisição; não há reutilização de Segredos entre a sincronização do Config estático e a autenticação em tempo de requisição. Quando o Worker não está montado com o Registry de processo, esse protocolo falha explicitamente e não devolve um `unchanged` forjado; esse é o comportamento fail-closed escolhido nesta rodada para expor o quanto antes uma montagem inconsistente entre Host e Worker.

## 66. A execução local sai primeiro do Workspace Compatibility Source

O Snapshot completo do Workspace Registry cumpre ao mesmo tempo a função de projeção do Workspace State antigo e de origem de compatibilidade do ModelFactory. Remover o protocolo diretamente mudaria de uma vez as quatro responsabilidades de exibição, valor padrão, remoto e execução, e por isso o M2.8 corta primeiro o desvio de execução, que é o de maior risco.

O Worker local já tem as três camadas de Registry de processo: Official, Personal e Account. Ao criar um Model comum de longo prazo ele só pode consultar esse Registry; o Workspace Catalog Overlay ainda pode participar por um tempo da projeção do Workspace State antigo e da lista de modelos, mas não é mais compilado no Registry de execução do AI SDK. O Turn Execution Source mantém a prioridade máxima e continua atendendo os Providers temporários execution-scoped.

O desktop-attached remote ainda não concluiu a migração do próprio Config/Registry remoto. A Entry do protocolo injeta `registry-only` para o local e `legacy-snapshot` para o remoto conforme a superfície de runtime explicitada; a condição de compatibilidade não é colocada dentro do ModelFactory. A Standalone CLI/TUI continua com a origem de compatibilidade por padrão, protegendo os Providers internos que ainda não migraram para o Config formal, e sai conforme o progresso da sua própria migração.

## 67. O Local Host para de enviar o Snapshot completo do Workspace Registry

O Worker local já lê o Official e o Personal Config de forma independente e recebe a terceira camada, o Account Config, por `provider/updateAccountConfig`. As entradas de Session create/resume/read, Workspace read/generate, Conversation cold subscribe e V4 createSession não chamam mais `workspace/updateProviderRegistry`; elas apenas aguardam a barreira de revision do Account Config.

As mudanças do Provider Registry no Host ainda atendem a duas responsabilidades locais: o portão de entrada da inicialização quando nenhum modelo está configurado e a resolução/atualização a quente do Runtime Model durante a migração. O evento de mudança não copia mais o conjunto completo de Providers para o Worker ativo. A fila de sincronização antiga, o marco `generatedAt` e o cache de revision por workspace são removidos junto com o escritor local.

O protocolo `workspace/updateProviderRegistry` e o método explícito do Host são mantidos. O desktop-attached remote, a Bot Remote Workspace Bridge e a sincronização de UI remota ainda dependem deles; essas chamadas guardam o Snapshot já aplicado como fato de compatibilidade para o Runtime Model remoto e para a autenticação de requisição. Essa fronteira remota será removida em separado quando o próprio Registry remoto estiver montado.

## 68. O portão de entrada do rascunho V4 sai do fallback do Snapshot antigo de Provider

O portão de entrada no Renderer do rascunho V4 já consegue obter do `ModelSelectionService` a View de modelos selecionáveis publicada pelo Registry. Como o `IServiceAccessor` de produção sempre fornece esse serviço, continuar tratando o antigo `IModelProviderService.getProviderRegistrySnapshot()` como fallback opcional apenas faz os stubs de teste manterem uma segunda fonte da verdade.

O portão de entrada agora assina e lê apenas a `ModelSelectionView`. Uma exceção na leitura continua significando "o portão não conseguiu confirmar" e continua sendo tratada pelo portão de entrada do Host como proteção contra corrida; apenas uma View vazia significa que realmente não há modelo selecionável. Esta fatia não altera a exibição de erro, a persistência do rascunho nem o comportamento do Workspace remoto.

## 69. A decisão de reflexo de modelo do ZCode Agent passa a ler a Selection View

O ramo do ZCode Agent em `resolveModelSelectionForConfigOptions()` precisa saber se o Provider apontado pela resposta atual ou pelo App Recent ainda é selecionável. Ele fazia esse julgamento pelo snapshot global `ModelProviderConfig[]` do Renderer, o que mantinha a mesma semântica de seleção dependente do serviço antigo de Provider.

Esse ramo agora lê apenas a `ModelSelectionView` já hidratada e monta a partir dela o conjunto de consulta de IDs de Provider. Quando a View ainda não está hidratada, a escolha pendente do usuário é preservada; quando a View confirma que o Provider não existe, a preferência obsoleta não sobrescreve mais a resposta do Agent. O serviço de decisão por supplier dos Agents que não são ZCode Agent permanece inalterado.

## 70. Os campos de exibição de Provider saem do fallback do Snapshot antigo

O Toast de troca de modelo, a linha do tempo de troca de modelo e a telemetria de envio já assinavam a `ModelSelectionView`, mas ainda assinavam em paralelo o antigo `ModelProviderConfig[]` e complementavam label e baseURL a partir do Snapshot antigo quando a nova View não encontrava nada. Depois que o Account Config entrou no Registry formal como terceira camada de Overlay, esse fallback mantinha duas fontes da verdade para a exibição e a atribuição do mesmo Provider.

`resolveProviderLabel()` e `resolveProviderBaseURL()` agora leem apenas a `ModelSelectionView`. Quando a View ainda não está hidratada ou o Provider não existe, o label recua de forma estável para o providerId e o baseURL retorna `undefined`; depois que a View é publicada, a assinatura no React re-renderiza a exibição. Os três chamadores não assinam mais nem leem instantaneamente o Snapshot antigo de Provider. Esta fatia apenas converge a origem dos campos de exibição e não altera entitlements de plano, edição de configurações nem execução de modelos.
## 71. Remover Options arbitrários de Model e Header de nível de modelo

Depois da revisão humana da CLI antiga, das capacidades de configuração do Desktop e dos casos de avaliação internos, as extensões introduzidas nas seções 58, 59 e 61 para compatibilidade sem perdas foram rejeitadas. Options arbitrários em `model.options` e Headers de nível de modelo nunca formaram um contrato formal de produto; mantê-los burlaria as fronteiras fortemente tipadas de ModelOptionSpecs, ModelOptions e reasoningMapping.

O ModelConfig passa a manter apenas Properties, Option Specs e reasoningMapping. O Header estático do Provider continua sendo expresso por `ProviderConfig.headers`; o Header dinâmico da conta continua sendo fornecido pelo Account Request Auth Service a cada requisição. O Importer da CLI antiga só normaliza `options.max_tokens` e `options.extra_body.max_tokens` como o `maxOutputTokens` formal e não migra mais outros Options arbitrários nem Headers de nível de modelo. A ponte de salvamento da página de configurações antiga também deixa de manter os dois campos privados que a interface não consegue expressar.

O documento do Provider Config sobe para schemaVersion 3. A migração adjacente de v2 -> v3 remove `ModelConfig.headers` e `ModelConfig.requestParameters`, mantendo as demais configurações de Provider e de Model como estavam. O Schema atual recusa diretamente esses dois campos, impedindo que eles voltem para a cadeia de execução por meio de arquivos escritos à mão.

## 72. O Repo Wiki em processo separado usa a mesma fronteira de fatos do Registry

Quando o M2 foi rebaseado no staging mais recente, a nova Agent lane independente do Repo Wiki entrou em conflito de código com "o Host local para de enviar o Snapshot completo do Workspace Registry". A lane independente resolve o problema de o chat watchdog recolher requisições longas de Wiki e pertence ao isolamento de runtime que precisa ser mantido; o mapa de sincronização de Registry completo dedicado à lane, por outro lado, pertence à cadeia antiga de fatos que o M2 já descontinuou.

Depois da mesclagem, o Repo Wiki continua usando um Process Manager independente, seu próprio Client e um ciclo de vida com dispose explícito. Assim como um Worker local comum, ele lê por conta própria o Official e o Personal Config; o Host apenas estabelece a barreira de revision do Account Config antes da geração. Os testes cobrem separadamente o isolamento de requisições das duas lanes e confirmam que nenhuma delas chama novamente `workspace/updateProviderRegistry`.

## 73. Os fatos estáticos de modelo do Repo Wiki local passam a ler a ModelSelectionView

As requisições de modelo do Repo Wiki já entram no Worker Model unificado, mas o Host ainda resolvia o provider, o modelo, a saída máxima e o nível de reasoning pelo antigo `IModelProviderService.getProviderRegistrySnapshot()` antes da geração, o que mantinha uma segunda fonte da verdade na configuração anterior à execução local.

O Host local agora lê preferencialmente do `ModelSelectionService` a View publicada pelo Registry. O adaptador de migração projeta apenas os campos estáticos de que o resolvedor de Wiki atual precisa, sem carregar API Key, Secret de Account nem parâmetros de requisição nativos do Provider; a requisição real continua carregando apenas o ModelRef, e o Model é criado pelo Registry do Worker. Quando o novo Provider Runtime já está montado, a Source antiga não é mais lida.

O resolvedor de Wiki atual mantém temporariamente o formato de entrada `ZCodeProviderRegistrySnapshot`, para limitar a superfície de impacto desta fatia. A Entry antiga sem Provider Runtime montado ainda pode recorrer à Source antiga; o desktop-attached remote continua lendo o espelho de workspace. Essas duas fronteiras de compatibilidade serão removidas na migração da Entry correspondente e do Registry remoto e não podem se espalhar como fonte da verdade formal local.

## 74. OpenAI Compatible sempre solicita Usage em streaming

Usage faz parte do resultado da execução do modelo. O Adapter OpenAI-compatible agora passa fixamente `includeUsage: true` ao SDK subjacente, e o Provider Config, o Model Target, a projeção de execução do Registry e a ponte de migração das configurações não oferecem mais nenhuma chave para desligar isso.

O documento do Provider Config sobe para schemaVersion 4. A migração adjacente de v3 -> v4 remove o `includeUsage` remanescente nos Providers; tanto o Personal Importer antigo do Desktop quanto o do Standalone ignoram esse campo. O parsing da configuração antiga da CLI ainda consegue ler arquivos históricos que contenham esse campo, mas não o leva para o novo Config nem para a cadeia de execução do Model. Serviços compatíveis que não suportam `stream_options.include_usage` estão fora do suporte formal, e não há caminho alternativo que remova o campo e tente de novo.

## 75. A decisão de entitlement de Account sai do grande objeto de Provider antigo

A verificação de entitlement de Start Plan, Coding Plan e Team Plan recebia antes diretamente o antigo `ModelProviderConfig`. Esse tipo carrega simultaneamente endpoint, models, vestígios de Catalog e estado de configuração, o que faz a lógica de conta parecer dependente de todo o conjunto antigo de fatos de Provider e impede que o Account Source produza de forma independente a terceira camada `ProviderConfigMap`.

A entrada da verificação de entitlement foi estreitada para `providerId`, entrada de autenticação opcional, estado de habilitação e motivo de desativação pelo sistema; o contexto de conexão da conta continua sendo fornecido por um Context separado. O antigo `ModelProviderService` faz uma única adaptação na sua própria fronteira de compatibilidade, e o módulo de entitlement não lê mais modelos, endpoint nem configuração do Adapter. A exclusividade mútua por pares de Start/Coding, a validação do Team Plan, os motivos de desconexão e a semântica de conectividade da página de configurações permanecem inalterados.

Esta fatia apenas organiza a entrada de domínio do Account Provider. A atualização de entitlement, o cache e a produção direta do `ProviderConfigMap` de Account continuam sendo extraídos do antigo `ModelProviderService` pelas fatias seguintes; aqui não foi adicionado um segundo estado de Account.

## 76. Provider Runtime aceita explicitamente o Config Runtime

O `ProviderRuntime` criava antes o `ProviderConfigRuntime` dentro do próprio construtor. Isso só permitia ao Config Service ser obtido depois que o Registry era construído, impedia que o verdadeiro Account Provider Service dependesse do mesmo estado de configuração Official/Personal e o obrigava a ler arquivos por caminho lateral ou a continuar projetando em sentido inverso a partir do Snapshot antigo do Registry.

Agora a raiz de composição cria primeiro o `ProviderConfigRuntime` e depois o entrega explicitamente ao `ProviderRuntime`. O `createProviderRuntime(options)` existente é mantido como entrada de conveniência para o Standalone; o Host usa `createProviderRuntimeFromConfigRuntime()` para expressar a ordem de montagem formal. O `ProviderRuntime` assume o ciclo de vida da instância injetada, e por isso a barreira de prontidão das Facades, o Config watcher e a semântica de dispose permanecem inalterados.

Esta fatia não mudou o conteúdo do Account Source, e a produção continua usando temporariamente o adaptador de Snapshot antigo. Ela estabelece a dependência unidirecional necessária para criar diretamente o Account Provider Service na próxima etapa: o Account Service pode ler o mesmo Config Service e depois entregar o Account Config Source ao Registry.

## 77. Account Provider Service como terceira camada de Config Source sem IO

`@zcode/provider` ganhou o `AccountProviderService`. Ele lê o mesmo Config Source do Registry, faz o Overlay do Official com o Personal Provider Config e depois entrega a View de Config corrente ao Account Resolver injetado. O Resolver devolve somente o `ProviderConfigMap` de Account; arquivos, rede, OAuth, planos e interfaces de equipe ficam todos nas implementações externas.

O primeiro `read()` do Service é a barreira de prontidão. Mudanças no Config Source disparam um recálculo em segundo plano e eventos de conta podem chamar `refresh()` explicitamente; um resultado bem-sucedido gera uma revision estável por conteúdo, e o Registry só é notificado quando o Account Config realmente muda. Uma falha de atualização reporta o erro e mantém o Snapshot last-known-good; uma falha na primeira atualização falha diretamente, sem disfarçar uma exceção de rede como "atualmente não há Account Provider".

Esta fatia estabelece o serviço de domínio e seus testes, mas ainda não trocou o Host de produção para fora do `LegacyAccountProviderConfigSource`. A próxima fatia precisa implementar as consultas existentes de Start/Coding/Team como um Account Resolver e fazer a nova raiz de composição injetar o Service diretamente no Registry.

## 78. Account Connection Result preserva um estado determinado por Provider

As interfaces remotas de Account nem sempre têm sucesso ao mesmo tempo: o `billing/balance` do Start Plan, o `subscription/list` do Personal Coding Plan e a interface de projetos do Team Plan podem retornar available, unavailable ou unknown individualmente. Tratar qualquer unknown como falha de toda a Source descarta resultados já determinados na mesma rodada; tratar unknown como unavailable remove, por instabilidade de rede, modelos que continuam válidos.

`@zcode/provider` agora oferece uma resolução unificada de Connection Result. available gera um Overlay `accessId/models`, e quando não há um conjunto de modelos dedicado no retorno ele mantém a ordem de modelos do Config corrente; unavailable remove explicitamente o Provider; unknown mantém o último Account Config bem-sucedido daquele Provider. Sem valor anterior na primeira vez, itens unknown não são publicados; quando todos os candidatos são unknown e não há estado anterior, um erro explícito é lançado e tratado pela fronteira de primeira falha do AccountProviderService.

A resolução gera resultados na ordem dos Account Providers do Config e recusa conexões duplicadas, Providers não configurados, API Providers, accessId vazio e conjuntos de modelos vazios. `createAccountProviderConfigResolver()` já conecta o Connection Resolver remoto à interface de Config Resolver do AccountProviderService; o próximo passo do código de produção é apenas fornecer os resultados de conexão reais.

## 79. Services adaptam o estado atual de produto de Plan a Connection Result

Foi adicionado `accountProviderConnectionResolver` como fronteira de transição entre os Services e o domínio puro de Provider. Ele lê o domínio de conta atual, o modo de conexão por API Key / OAuth da Family, a seleção Personal/Team e chama as verificações de entitlement de Start/Coding já existentes da Z.ai / BigModel; para fora ele produz apenas `available / unavailable / unknown` ordenados por Provider.

Domínios de conta diferentes do atual e o modo de conexão explícito por API Key são interpretados como `unavailable` determinado e não consultam mais as interfaces de Plan. O Coding Plan usa a key completa de conexão de equipe selecionada como accessId quando há uma válida selecionada e, caso contrário, um accessId Personal estável; o Start Plan usa um Start accessId estável. Quando um Provider não recebe conclusão do remoto, ele permanece `unknown` e é tratado depois pela regra de last-known-good por Provider da resolução de domínio.

A origem da Personal Coding Plan Key no adaptador é uma porta de injeção estreita, e esta fatia não amarra o armazenamento antigo `ModelProviderConfig` ao novo domínio. Antes da troca da raiz de composição de produção, ainda é preciso convergir a propriedade física dessa Key para a fronteira de credenciais e preservar o comportamento do conjunto de modelos autoritativo do Start Plan no remoto.

## 80. Entitlement e associação de modelos do Start Plan usam a mesma resposta de balance

O Start Plan tinha dois consumidores: a verificação de entitlement lia apenas `plans`, e a construção de Presets lia separadamente `balances.capabilities` para gerar a lista de modelos. O novo Account Connection Result precisa expressar os dois ao mesmo tempo, caso contrário a troca de Source degenera no conjunto estático de modelos do arquivo Official.

`CodingPlanAvailabilityResult.available` agora carrega `models` opcionalmente. A disponibilidade do Start Plan valida o plano ativo e extrai a associação de modelos deduplicada na mesma resposta `billing/balance`; o Connection Resolver dos Services repassa essa lista para a camada de domínio, de modo que o Account Config possa sobrescrever os `models` do Official.
## 80. O Host local sai primeiro do Snapshot antigo do Account Registry

Como o Account Access já convergiu para a terceira camada `ProviderConfigMap`, o Host local de produção monta diretamente `AccountProviderService + Account Connection Resolver`. O Resolver lê o mesmo Config Official/Personal, o domínio de conta atual, o modo da Family, a conexão Personal/Team selecionada e as interfaces de entitlement existentes, e produz `available / unavailable / unknown`; o Service de domínio então forma o Account Config com `accessId/models`.

Por enquanto as mudanças de estado de conta reutilizam o change event do antigo ModelProviderService como sinal de invalidação, mas o evento serve apenas para disparar `AccountProviderService.refresh()`. O resultado da atualização não lê o antigo `ZCodeProviderRegistrySnapshot`, de modo que o Snapshot antigo deixa de ser a fonte da verdade dos Account Providers ou da associação de modelos do Host local. O `desktop-attached-remote` mantém a Source de compatibilidade original e aguarda a fatia remota do M2.8.

A migração física da Personal Coding Plan API Key não foi embutida nesta fatia: o Connection Resolver e o Request Auth ainda podem lê-la do Provider Store antigo, mas apenas como entrada de credencial de compatibilidade. Só depois que a próxima fatia migrar essa Key para o Credential Service e remover a leitura antiga as duas cadeias — fatos estáticos de Account e credenciais de requisição — ficarão completamente livres do Provider Store antigo.

## 81. A Personal Coding Plan Key entra no Credential Service por accessId

A Key copiada do Personal Coding Plan é uma credencial de requisição, não pertence ao Provider Config. O novo `AccountProviderCredentialStore` forma a chave da credencial a partir do `accessId` já fixado no Model; tanto a verificação de entitlement do Connection Resolver quanto cada tentativa do Request Auth leem do mesmo Store. Quando uma atualização explícita do Coding Plan obtém uma nova Key, ela é gravada no Store, e logout / unlink a removem pela entrada de limpeza original.

Para compatibilidade com os usuários já instalados, o Store pode chamar uma vez um Provider Key Loader antigo injetado quando a nova chave está ausente. Depois de ler um valor antigo não vazio, ele grava primeiro no Credential Service e só então devolve ao chamador; quando já existe um valor novo, o Store antigo não é acessado, e um valor antigo vazio não cria registro de credencial. Essa é uma migração unidirecional que não forma uma cadeia de prioridade de longo prazo do tipo `new > old`.

O antigo `ModelProviderService` continua mantendo, durante a migração, uma Key sombra no arquivo de Provider para uso dos consumidores antigos ainda não migrados; o novo Connection Resolver e o Request Auth já não a tratam como autoritativa. Remover esse campo sombra pertence à fatia seguinte de "eliminar consumidores do Provider Store antigo", quando ele poderá ser removido junto com a escrita antiga.

## 82. A decisão de preferência de modelo do Workspace passa a usar a Model Selection View

O eco da configuração de workspace para Agents que não são ZCode Agent era feito pelo Renderer, que passava o antigo `ModelProviderConfig[]` ao Host. O Resolver acabava reexaminando `enabled`, `apiKey`, endpoint e o array de modelos, formando um segundo conjunto de julgamento de selecionabilidade fora do Registry.

Agora o Renderer usa a `ModelSelectionView` de nível de processo como fato de candidatos para todos os tipos de Agent. O Resolver consome diretamente a Provider View correspondente; como o Registry já é responsável por integridade, credenciais, estado de habilitação e filtro de validade de modelos, o Resolver mantém apenas o que lhe é próprio: ler a configuração de workspace, comparar o providerId com o baseURL normalizado, validar que o modelo pertence a esse Provider e produzir, conforme as regras originais, um resultado ghost ou já correspondido.

Essa migração não mudou o comportamento de draft, session, last-selected ou submissão, nem a fronteira de entrega entre desktop continuous e web remote replayable. O mapa de impacto funcional já tinha a relação `model selection -> provider registry -> conversation/model surfaces`, e esta fatia não gerou nenhum novo nó de semântica de produto.

## 83. Os candidatos de `/model` do Bot local passam a usar o Model Selection Service

Há dentro do Bot dois tipos de dados de modelo com nomes parecidos mas com propriedades diferentes. Os candidatos primários de Provider/Model são a projeção do Registry global do App; os `configOptions` de workspace são o valor atual e o catálogo de capacidades de um determinado runtime de Agent. Os primeiros precisam de unificação; os segundos devem continuar em cache separado por `workspaceKey`.

O Host local agora injeta o `ModelSelectionService` do mesmo processo no Bots Service. O `/model` lê preferencialmente desse serviço a ordem dos Providers, os labels e os modelos selecionáveis; uma lista vazia retornada com sucesso também é tratada como estado vazio autoritativo, e a projeção em memória da última leitura bem-sucedida só é usada quando a leitura falha. O Bot não lê mais o Snapshot completo antigo do Registry nesse caminho local principal. O cache persistente de configOptions do workspace, o modelo atual e a cadeia de comandos que escreve no runtime permanecem inalterados.

O desktop-attached remote ainda não está montado com a nova Source formal de Registry e, por isso, continua usando o ramo de compatibilidade do Snapshot antigo, aguardando a saída conjunta com a fronteira autoritativa de Provider remota no M2.8. Esse ramo de compatibilidade não participa da decisão de candidatos de modelo do Host local.

## 84. O label de Provider do `/status` do Bot local passa a usar o Model Selection Service

O texto de status do Bot chamava novamente o antigo `ModelProviderService.getAll()` para consultar o nome do Provider depois de resolver `providerId/modelId` ou o valor de custom model. Isso fazia o `/model` já usar o novo Registry enquanto o `/status` exibido logo depois ainda pudesse mostrar um label vindo de outra Config antiga.

Depois que o Host local injeta o Model Selection Service, o Bot obtém os candidatos do `/model` e o label do `/status` a partir da mesma Selection View. Uma View vazia lida com sucesso também é um resultado autoritativo; quando a leitura falha, vale a última projeção de Selection bem-sucedida daquele processo do Bot. Apenas o caminho de compatibilidade do desktop-attached remote, que ainda não está montado com o novo serviço, continua lendo o Provider Config antigo. Esta rodada não alterou a migração de estado antigo no início do Bot, os configOptions de workspace nem a sincronização do Registry remoto.

## 85. A restauração de custom provider no V4 remove o fallback da Config antiga

Quando o V4 restaura, no cenário de erro de configOptions, um valor de custom model que contém apenas providerId, ele já escolhe o primeiro modelo daquele Provider a partir da Model Selection View em memória no Renderer; quando a View ainda não está pronta ou não contém esse Provider, o código antigo ainda chamava `ModelProviderService.getAllCached()` para consultar a Config antiga mais uma vez. Isso permitia que o "atualmente não selecionável" dado explicitamente pelo Registry fosse sobrescrito em sentido inverso pelo Snapshot antigo.

A entrada de restauração agora aceita apenas o resultado de `resolveFirstSelectableModelId()`. Uma View não hidratada retorna `undefined` e um Provider inexistente retorna `null`; nos dois casos a restauração é interrompida e o aviso existente é preservado, sem voltar à Config antiga de Provider para adivinhar o modelo. O restart e o prepare de workspace, os avisos de troca de modelo e a temporização da confirmação de preferência permanecem inalterados. Um teste de fronteira de código fixou que o SessionPane não chama mais diretamente `modelProviderService.getAllCached()`.

## 86. A troca de modelo do Bot local para de enviar o Snapshot completo do Registry

Quando o Bot escolhe um custom model para uma tarefa ativa, a cadeia antiga primeiro executa `applyToProvider()`, depois lê e envia ao Agent o Snapshot completo do Registry e, por fim, chama `setModel(modelRef)`. O Worker local formal já mantém um Registry de nível de processo e constrói o Model a partir do mesmo Official, Personal e Account Config que o Host usa; as duas primeiras passos fariam o `ModelProviderConfig` antigo participar de novo da decisão de execução local.

Quando o Host local está montado com o Model Selection Service, o Bot agora entrega `{ providerId, modelId }` diretamente ao Task Service. O Worker consulta o próprio Registry mais recente na próxima criação de Model. O desktop-attached remote ainda não tem Config/Registry próprio remoto e, por isso, continua executando `applyToProvider + updateProviderRegistry` quando a task tem `workspaceIdentity`; a Entry antiga sem o novo Selection Service montado também mantém a cadeia de compatibilidade original. Testes direcionados fixam separadamente o comportamento local de "não enviar Snapshot" e o remoto de "continuar sincronizando".

## 87. A sincronização de Snapshot após salvar configurações mantém apenas o target remoto

Depois de salvar um Provider na página de configurações, ela coletava todos os workspaces abertos e chamava `workspace/updateProviderRegistry` para atualizar o catálogo em memória do Agent antigo. A lista de targets incluía antes tabs locais e remotos ao mesmo tempo, de modo que, mesmo com o Worker local já tendo atualizado o Registry de processo pelo watcher de arquivos, o Renderer ainda enviava o Snapshot completo antigo uma vez e sobrescrevia os configOptions locais com a resposta.

O resolvedor de targets agora devolve apenas os workspaces remotos que conseguem ser resolvidos até um `remoteSessionId` e vincula a cada target o Remote Session Service correspondente. Tabs locais são puladas diretamente; a seleção de modelo local é atualizada pela Model Selection View do Host e a execução pelo Registry do Worker. As regras de desconexão remota, de identidade distinta no mesmo caminho e de deduplicação por sessão permanecem inalteradas. A interface correspondente removeu o parâmetro `baseZCodeSessionService`, que já não tinha uso, e os testes fixam que tabs locais não entram na lista de sincronização.

## 88. A decisão de leitura do login por API Key do Welcome passa para a nova View

O formulário de API Key do Welcome já grava primeiro o Personal Config e depois espelha o Provider antigo, mas antes de salvar ainda chamava o antigo `getAll()` para decidir se o Provider alvo existe e, depois de salvar, também decidia a seleção padrão pelo array de modelos antigo. Isso fazia a escrita de uma mesma submissão ter o novo Config como autoridade, enquanto a entrada e o valor padrão continuavam influenciados pelo Snapshot antigo.

No novo Host, o formulário agora projeta o API Provider alvo a partir da Provider Settings View; depois de concluir a escrita Personal e o refresh do Registry, ele obtém da Model Selection View o primeiro modelo selecionável daquele Provider e grava nas seleções recentes do App. Assim, a falta de API Key que impede a seleção antes de salvar não afeta a entrada de configuração, e o valor padrão depois de salvar só aponta para um modelo atualmente selecionável pelo Registry. O antigo `ModelProviderConfig` continua sendo construído pela projeção de compatibilidade e gravado no serviço antigo para os consumidores de conta e de configurações ainda não migrados; a Entry antiga sem o Provider Settings Service montado mantém o caminho de leitura original.

A mesma fatia estreita ainda mais a fronteira de persistência da API Key: quando o Provider Settings Service já está montado, uma leitura que falha, um Provider alvo ausente ou um tipo que não seja API reportam erro diretamente ao chamador, sem ler ou gravar silenciosamente no serviço antigo. Apenas a Entry antiga sem o próprio serviço montado usa o caminho antigo. Depois que a nova escrita do Personal Config tem sucesso, uma falha apenas na escrita do espelho antigo continua gerando apenas um aviso de compatibilidade e não desfaz a escrita autoritativa em sentido inverso.

Os testes de regressão também confirmaram uma semântica de compatibilidade já existente: o balance pode retornar apenas o plano ativo e, por enquanto, sem o detalhamento de modelos em balances. Isso continua sendo um available determinado, o Connection Result não carrega `models` e a resolução de domínio mantém a associação presente no Official/Personal Config. Interpretar a falta de detalhamento como ausência de entitlement provocaria regressão em todos os testes existentes de restauração do Start Plan, de conectividade e de cache de entrada, e por isso essa interpretação não foi adotada.

## 89. A nova Settings View sai da leitura antiga de display-order

A ordem efetiva dos Providers já é produzida pelo Overlay ordenado de Official e Personal, e `ProviderSettingsView.providers` é o fato de ordem da página de configurações e da tela de seleção. Quando o novo Settings Service está montado, `useModelProviders` não chama mais o antigo `getDisplayOrder()` e também não deixa mais uma Preference independente intervir na ordenação efetiva de Providers. A escrita por arraste também chama apenas a Settings Facade para reordenar o Personal Overlay e não grava mais o espelho do antigo `saveDisplayOrder()`.

A Entry antiga, que não tem o Provider Settings Service, continua usando em par o antigo `getDisplayOrder()/saveDisplayOrder()` e portanto mantém o comportamento de compatibilidade original. As fontes da verdade do novo Host e da Entry antiga não se cruzam mais; quando o suporte à Entry antiga for descontinuado, o Preference Store e os métodos antigos do serviço podem ser removidos diretamente.

## 90. A migração de início do Bot local sai do cache antigo de Provider Config

A migração do estado do Bot para a v2 só precisa saber se um determinado `providerId/modelId` ainda existe e se o ID do modelo pode ser mapeado de forma única para o novo Provider. Por isso o algoritmo de migração lia antes o `ModelProviderConfig[]` inteiro, fazendo com que o Bot local ainda chamasse o antigo `getAll()` na inicialização mesmo já estando montado com o Model Selection Service.

A entrada da migração está agora estreitada para `{ providerId, modelIds }`. O novo Host constrói esse índice a partir da Model Selection View, e só a Entry antiga projeta o Provider Config antigo no mesmo formato. Ao mesmo tempo, o Bot que já está montado com o Selection Service não agenda mais o pré-aquecimento do cache antigo de Provider Config; `/model`, `/status` e a migração de inicialização passam a usar o mesmo fato de modelos selecionáveis. O cache de `configOptions` do workspace e os caminhos de compatibilidade remotos e da Entry antiga mantêm a semântica original.

## 91. O watcher do Personal Config deduplica por versão de conteúdo

O Personal Repository grava a configuração com substituição atômica de arquivo. Uma única escrita no processo pode gerar vários eventos `rename/change` na camada do sistema de arquivos, e a implementação antiga publicava primeiro `updated` e depois publicava `file-changed` repetidamente, uma vez para cada evento de watcher. Isso fazia a mesma configuração dispararparsing do Registry várias vezes e ainda podia fazer o Account Source repetir consultas de entitlement.

O Repository agora registra a última content revision conhecida. Uma escrita explícita registra a nova revision antes de liberar a trava de arquivo; ao receber um evento, o watcher relê e normaliza a configuração sob a mesma trava de arquivo e só publica `file-changed` quando a revision realmente muda. Vários eventos de escrita atômica convergem assim de forma natural, e um novo conteúdo vindo de edição externa continua sendo notificado imediatamente. Nenhuma janela de tempo ou debounce foi introduzida: a semântica da notificação depende apenas de o conteúdo da configuração ter ou não mudado.

## 92. A migração do Provider Family Domain passa a ler a Model Selection View

A migração única de `providerFamilyDomain` no início da execução precisa decidir, quando não há um antigo OAuth active provider, se existe apenas uma Family Z.ai / BigModel selecionável. A implementação antiga lia o `ModelProviderConfig[]` e refazia um julgamento de disponibilidade com API Key, enabled e endpoint; isso fazia o resultado da migração divergir dos fatos de seleção do novo Registry.

A migração agora lê diretamente a Model Selection View. Os Providers da View já tiveram Config, Account Access, integridade de modelos e selecionabilidade resolvidos pelo Registry, e a migração só precisa mapear o `providerId` para a Family e gravar a configuração histórica quando há uma Family única. Uma View vazia continua significando que o fato de inicialização ainda não foi recuperado e a migração não é marcada como concluída nesta rodada; a prioridade original do OAuth active provider e a temporização da escrita de configurações não mudaram.

## 93. O watcher do Official Config também publica mudanças por versão de conteúdo

No futuro o Official Config será publicado por um serviço de gerenciamento em um arquivo local, mas a Node Source ainda recebe eventos de substituição de arquivo. A implementação antiga apenas encaminhava os eventos de watcher pelo nome do arquivo: republicar o mesmo conteúdo também atualizava o Registry, e uma substituição atômica que gerasse vários eventos podia provocar leituras e parsings repetidos.

O Official Source agora usa a mesma semântica externa do Personal Repository: a primeira leitura memoriza a content revision corrente, os eventos de watcher seguintes leem serialmente o documento completo mais recente e publicam `file-changed` uma única vez, somente quando a revision muda. Gravações repetidas do mesmo documento Official não produzem notificação de invalidação; uma versão realmente nova ainda entra no Registry automaticamente pelo watcher. Essa convergência não altera a migração de versão do arquivo Official, a ordem de sobreposição nem a fronteira de tratamento de erro.

## 94. O julgamento de 유지 da Family no logout passa a ler a Model Selection View

O logout global do App e o desvinculamento de plano na página de configurações precisam decidir, antes de sair do OAuth, se a Family atual ainda tem um modo de API Key que possa continuar em uso. A implementação antiga lia o `ModelProviderConfig[]` completo e verificava apenas a string da Key do API Provider embutido; a selecionabilidade de Account Providers e API Providers voltava a ser interpretada pelo serviço antigo.

Agora as duas entradas de operação leem a Model Selection View mais recente depois da confirmação do usuário. O `providerFamilyDomain` só é mantido se o API Provider embutido correspondente à Family atual aparecer na View com `kind: api`; quando houver apenas Account Providers como Coding/Start/Team, o Domain é limpo. A leitura da Selection View fica dentro da função de tratamento do evento e não acrescenta assinatura de componente nem dependência de renderização. A temporização do logout OAuth, da limpeza da WebView, da escrita de configurações e do relançamento do App permanece inalterada.
## 95. Family Selection remove a leitura antiga de Provider Config que não participava da decisão

Após o login OAuth e na restauração da inicialização, o Family Selection escolhe a conexão conforme a prioridade já estabelecida entre Coding Plan pessoal, Team Plan, Start Plan e fallback OAuth. A entrada dos dois resolvedores continha antes o `ModelProviderConfig[]` completo, e por isso cada entrada de chamada executava um `getAllCached()`; o algoritmo real nunca lia esse parâmetro, de modo que o Provider Config nem influencia a prioridade nem participa da geração do selectedKey.

Esta rodada removeu o parâmetro não utilizado e as duas leituras antigas de Config. A seleção após o login depende apenas do entitlement atual e dos Team Products; a restauração da inicialização também lê as configurações atuais, para proteger o Team selectedKey que ainda é válido ou cuja invalidez não pode ser confirmada temporariamente. A prioridade entre pessoal, equipe e Start Plan, a renovação da Coding Plan Key e a temporização da escrita de configurações permanecem inalteradas. O teste de fronteira configura a leitura antiga para falhar e confirma que a restauração da inicialização ainda concludes, evitando que essa dependência lateral seja reintroduzida depois.

## 96. O item de Provider do Settings Sync sai do refresh do Snapshot antigo

A Category pública do Settings Sync ainda contém `providers`, e o Onboarding também constrói essa exibição de marcador de posição; o Service atual não tem Provider Discovery nem carga de dados de Provider e, ao receber essa Category, retorna explicitamente `skipped`. A UI chamava antes o antigo `ModelProviderService.getAll()` depois desse resultado e sobrescrevia o Snapshot global de Providers: na prática nenhum dado era importado, mas era disparada uma sincronização remota antiga de Provider e uma publicação de fatos.

Esta rodada removeu a dependência de `useSettingsSync` em relação ao antigo ModelProviderService e ao Snapshot Store, e fixou o estado atual com dois níveis de teste: a Category de Provider do Service continua retornando explicitamente `skipped`; o Hook de UI não pode tocar na fonte da verdade antiga de Provider por causa do item de marcador. Quando for implementada uma importação real de Provider entre Agents, será preciso definir uma carga explícita de Provider Config para os dados de seleção, gravar no Personal Config e deixar o Registry publicá-la normalmente, em vez de restaurar o refresh do Snapshot antigo.

## 97. O portão de entrada de Provider do novo Host usa a Model Selection View

O Root já conecta o Model Selection Service no início do processo, mas o portão de disponibilidade de Provider ainda esperava a hidratação do Snapshot antigo de Model Provider e julgava "disponibilidade" novamente com base em API Key, endpoint, enabled e array de modelos. Isso permitia que o Registry e o Snapshot antigo dessem conclusões diferentes e ainda bloqueava a inicialização pela sincronização remota antiga mesmo com o novo Registry já pronto.

O portão de inicialização agora escolhe uma única origem conforme a capacidade da Entry: o novo Host, montado com o Model Selection Service, lê apenas a Model Selection View; a Entry antiga, sem esse serviço, continua usando o Legacy Snapshot. Como a própria Registry View contém somente os Providers/Models atualmente selecionáveis, o portão decide apenas se existe pelo menos um modelo. Quando o Registry confirma uma View vazia, não há retorno aos Providers antigos; quando o Registry ainda não foi hidratado, o Snapshot antigo já hidratado também não é usado para liberar o caminho mais cedo. O log ganha `source: registry | legacy`, facilitando confirmar a fronteira efetiva.

Se a Model Selection View do novo Host falhar ao carregar, o Selection Snapshot permanece não hidratado e o portão de inicialização não passa a ler o Snapshot antigo. Nesse caso o aplicativo continua no estado de espera de Provider na inicialização e registra um error; mais adiante pode ser adicionada uma interface de falha de carga do Registry voltada ao usuário, mas a fonte da verdade antiga não pode servir como caminho de recuperação.

A mesma fatia estreita o comportamento de refresh após o login por API Key. Quando o novo Host salva uma API Key, a Provider Settings Facade grava o Personal Config, atualiza o Registry e publica a nova Selection View por assinatura; o formulário não chama mais o antigo `getAll()` em separado. Apenas a Entry antiga sem o Provider Settings Service ainda atualiza ativamente o Legacy Snapshot. A escrita do espelho antigo de Provider é mantida por enquanto para os consumidores de compatibilidade ainda não migrados, mas deixa de participar da decisão de inicialização do novo Host.

## 98. Remover a sincronização inversa de estado estável do Provider Store antigo para o Personal Config

No início da migração, para trocar a entrada de escrita o mais rápido possível, o antigo `ModelProviderService.save/delete()` podia reimportar toda a lista antiga de Providers para o Personal Config por `onUserProviderConfigChanged`. A nova entrada de Settings já adoptou a ordem oposta de forma estável: primeiro grava o Personal Config pela Provider Settings Facade e depois atualiza o espelho antigo do Store da melhor forma possível. Manter o callback inverso faria o espelho de compatibilidade voltar a ser entrada da nova fonte da verdade, e uma modificação local passaria a sobrescrever a tabela inteira.

Esta rodada removeu `onUserProviderConfigChanged`, a opção `syncPersonalConfig` e `ProviderRuntime.syncLegacyPersonalProviders()`. O salvamento e a exclusão do antigo `ModelProviderService` mantêm agora apenas o Store antigo; no novo Host o Personal Config só é escrito pelo Provider Settings/Config Service. A Entry antiga sem o novo Settings Service montado preserva o comportamento original do Store antigo, sem afetar o novo Registry.

A migração inicial continua existindo em `NodePersonalProviderConfigRepository`: o `importLegacy` injetado só é chamado quando o arquivo Personal Config não existe; depois de gravar o documento versionado, os reinícios seguintes do processo leem esse arquivo diretamente. Um novo teste de reinício verifica explicitamente que, quando já existe Personal Config, o Provider Store antigo não é lido novamente. Isso estabelece a temporização unidirecional:

```text
首次启动且 Personal Config 不存在
旧 Provider Store -> importLegacy -> Personal Config

正常运行
Settings -> Personal Config -> Registry
        `-> 旧 Provider Store（兼容镜像，失败不回滚新事实）
```

## 99. O menu de modelos de Account Provider deixa de decidir a conexão novamente

O Account Source já escolhe a conexão executável atual com base na conta, no entitlement e na configuração da Family, e entrega ao Registry o `accessId` fixo junto com o conjunto de modelos. O menu de modelos, porém, ainda voltava a escolher Start, Individual ou Team pelos dados antigos de Provider Family e por isso podia chegar a um resultado diferente do Registry.

O novo Host agora projeta direto os Account Providers do Registry em grupos de modelos. As projeções antigas do mesmo Provider ID são excluídas, e o `accessId` é usado apenas para exibir o emblema de Start, Individual ou Team, sem participar mais da escolha da conexão. O Family Builder antigo serve apenas ao caminho de compatibilidade das Entries antigas que ainda não entraram no Registry.

```text
Account settings + entitlement
              |
              v
Account Config -> Registry Account Provider -> Renderer model group
                                                `-> accessId 只生成徽标
```

## 100. Settings View publica diretamente a conclusão de selecionabilidade do Provider

A projeção de migração da página de configurações precisa mapear o Account Provider de volta para o antigo `ModelProviderConfig`, mas `enabled` só expressa a chave de configuração e não responde se o Provider já passou na validação de integridade e entrou no Registry. Esta rodada adiciona `selectable` ao `ProviderSettingsView`, produzido diretamente pela relação de membresia do Registry no mesmo resultado do Resolver, evitando que o Renderer reimplemente o julgamento de disponibilidade.

O nome, o Endpoint, os Headers, as Properties de modelo e os Option Specs dos Account Providers agora vêm todos da projeção da Settings View. O objeto antigo fornece por enquanto apenas a `apiKey` de execução que Usage/Plan ainda está lendo e o motivo detalhado de desativação quando o Provider não é selecionável; os campos estáticos antigos e o estado antigo de enabled não sobrescrevem mais a conclusão do Registry. Official Account Providers sem objeto antigo também aparecem normalmente na projeção de configurações.

## 101. Os níveis de pensamento do modelo passam a ler os Option Specs do Registry

Composer, Automation, Subagent e Repo Wiki liam antes os níveis de pensamento do antigo `ModelProviderConfig.reasoning` e, quando o metadata faltava, ainda completavam um conjunto fixo de níveis com base no nome do modelo GLM-5.2. Como o Official Config já expressa o mesmo fato em `ModelConfig.optionSpecs.reasoningLevel`, continuar lendo o campo antigo faria a seleção de modelo e o uso real do Model usarem definições de níveis diferentes.

O Renderer agora compartilha `resolveModelThoughtOption()`: quando existe `ModelSelectionView`, os Option Specs são lidos do Registry somente por `providerId/modelId`; quando o modelo não está na View ou não tem `reasoningLevel`, a função retorna o nível sem pensamento e não completa mais valores a partir de metadata antigo ou do nome do modelo. Somente a Entry de compatibilidade sem a nova Selection View montada continua usando o resolvedor antigo. Quando o Workspace já devolve o diretório de execução, Subagent e Repo Wiki continuam preferindo a projeção de catálogo daquele Workspace; o Registry responde pelo seu fallback sem diretório e pelos fatos estáticos de modelo no estado de rascunho.

Esta fatia apenas converge a leitura de Option Specs estáticos do modelo pela UI e não altera a forma como o Adapter converte o reasoning level em parâmetros de requisição do Provider. Tarefas ociosas carregam um Provider temporário execution-scoped, que hoje não entra no Registry de nível de processo e portanto ainda usa seu próprio parser de configuração de modelo temporário; isso será unificado na fase de Providers execution-scoped.

## 102. O menu de modelos deixa de completar o Snapshot antigo por lacuna de Provider

O agregador do menu de modelos projetava antes `ModelSelectionView` e depois acrescentava ao final os itens do antigo `ModelProviderConfig[]` que não tinham um Registry Provider de mesmo nome. Essa compatibilidade por deduplicação de Provider ID contorna a decisão do Registry: um Provider com configuração incompleta, desabilitado explicitamente ou indisponível para a conta já foi excluído pelo Registry, mas voltaria a aparecer no menu de modelos só porque "não está na nova View".

A fronteira de agregação passa agora a ser alternada no nível da Entry. Depois que o chamador entrega uma `ModelSelectionView`, o menu projeta apenas essa View; `providers: []` significa que o Registry confirmou que não há candidatos e não dispara retorno à lista antiga. Apenas a Entry de compatibilidade que ainda não obteve a View continua usando o construtor completo de menu antigo. A mudança vale uniformemente para Composer, Automation, Subagent e Repo Wiki e não alterou os algoritmos de Family, Team Plan ou ordem de exibição da Entry antiga.

## 103. A página de configurações de Subagent para de assinar o Snapshot antigo de Provider

A página de configurações de Subagent já obtém a `ModelSelectionView` de nível de processo, mas ainda chamava `useModelProviders()` incondicionalmente e entregava o Provider antigo, a ordem de exibição antiga e o Family Mode antigo ao construtor de menu misto. Depois que a seção 102 estreitou a fronteira de agregação, esses dados já não afetam o resultado quando a View está hidratada, mas o Hook antigo continuava disparando `getAllCached()` e um `getAll()` em segundo plano, fazendo com que abrir a página de configurações continuasse lendo e atualizando uma segunda fonte da verdade.

Essa página agora chama diretamente `buildRegistryModelSelectGroups()`. Enquanto a View não é publicada, o controle de modelo permanece em loading e não exibe candidatos antecipadamente pela lista antiga; depois que a View é publicada, os candidatos de modelo, o agrupamento de Providers e os Option Specs de reasoning sem Workspace vêm todos da mesma revision. O catálogo de execução no escopo de Workspace continua responsável pela projeção de reasoning daquele Workspace, e o protocolo de salvamento e habilitação de Subagent não mudou. O teste de componente afirma explicitamente que renderizar o seletor de modelo não chama o antigo `useModelProviders()`.

## 104. Repo Wiki separa os fatos de exibição da hidratação de execução do Workspace

O Repo Wiki já usa `ModelSelectionView` para construir o menu de modelos e ler os Option Specs, mas o componente ainda chamava `ModelProviderService.getAllCached()` na montagem e assinava o change event antigo do Registry. Essa lista antiga servia por um lado como retorno para o menu de modelos e o reasoning e, por outro, usava o `updatedAt` do Provider para disparar a reidratação do catálogo de modelos do workspace, de modo que os fatos de exibição continuavam dependendo de uma segunda fonte da verdade.

O componente agora usa apenas `ModelSelectionView` para fornecer a lista de modelos, as Properties e os Option Specs, e usa a `revision` da View como versão de entrada da hidratação do catálogo. Enquanto a View não é publicada, os candidatos não são restaurados antecipadamente pela lista antiga; uma View vazia expressa da mesma forma que o Registry confirmou que não há modelo selecionável. O antigo `ModelProviderService` permanece com uma fronteira estreita: `prepareRepoWikiThoughtCatalog()`, em workspace runtimes ainda não migrados como o desktop-attached remote, ainda precisa de `getProviderRegistrySnapshot()` para injetar o snapshot de execução pelo protocolo antigo. Essa dependência de compatibilidade não participa mais das decisões de exibição do Renderer nem da selecionabilidade de modelos e será removida junto com a cadeia Host -> Worker Snapshot.

## 105. O julgamento estático de Provider do Composer segue o Registry

O Composer ainda precisa do antigo `useModelProviders()` para fornecer o estado dinâmico de Usage, Entitlement e funil de compra do Coding Plan/Start Plan; isso não significa que a lista antiga de Providers possa continuar participando da decisão sobre fatos estáticos de modelo. A implementação antiga combinava o Provider antigo com a `ModelSelectionView` usando `OR` e preferia ler o label antigo. Assim, um Provider já filtrado pelo Registry ainda podia ser reconhecido como custom Provider recuperável e, após uma falha ao salvar a configuração, cair no caminho antigo de recuperação.

Agora, desde que a `ModelSelectionView` esteja publicada, o Composer decide a existência do Provider, lê o label e avalia a elegibilidade de recuperação custom com `config.kind === "api"` apenas a partir daquela revision. Uma Registry View vazia recusa a recuperação de Providers remanescentes na lista antiga; a Entry de compatibilidade sem View montada continua usando o julgamento antigo. O Hook antigo permanece por enquanto no componente, mas sua responsabilidade é estreitada para o estado de execução de Plan/Usage ainda não migrado e ele deixa de ser uma fonte de verdade paralela para a identidade e a selecionabilidade do modelo.

## 106. O menu de Automation e o label de Provider consomem o Registry diretamente

O Automation já passava a `ModelSelectionView` para o construtor de menu comum, mas antes de entrar no construtor ainda filtrava os candidatos uma vez pela lista antiga de Providers e pelo Snapshot de Entitlement; os triggers da página de edição também preferiam mostrar o nome antigo do Provider. O construtor comum acaba ignorando esses resultados intermediários, de modo que a saída costuma estar correta, mas o Renderer ainda executava um conjunto antigo de julgamentos sem autoridade de decisão.

`buildAutomationModelSelectGroups()` agora chama diretamente a projeção do Registry quando a View está publicada, sem ler o Provider antigo e sem chamar o callback de filtro antigo de Entitlement. A página de edição também passa a ler preferencialmente o `config.label` do Registry; somente a Entry de compatibilidade sem View montada lê o name antigo. O antigo `useModelProviders()` continua fornecendo os dados dinâmicos ainda não migrados de Plan/Usage para tarefas ociosas, para o funil de compra e para a telemetria atual, e esses usos não foram disfarçados de configuração estática de modelo.

## 107. Os runtimes filhos de Workflow herdam o ModelFactory do Registry de processo

A auditoria das chamadas de produção descobriu que o `AgentRuntime` principal já está montado com `ApiProviderModelRuntime.modelFactory`, mas o Expert Workflow e o Script Workflow, ao criarem runtimes filhos, só copiavam o antigo `modelAdapter` e o Runtime Config. Assim, um Turn comum no mesmo App usava o novo Registry enquanto a execução filha de Workflow ainda podia ler o Catalog antigo, as Provider Options antigas e a configuração antiga de conexão.

Os dois tipos de dependência de runtime filho agora recebem explicitamente o mesmo `modelFactory` criado pelo App principal. Ele é a entrada de execução de nível de processo e continua criando um Model independente a cada chamada, conforme o Registry corrente; o que é compartilhado é a fábrica e a infraestrutura de Adapter, não o objeto Model de um Agent Loop. A Entry antiga, que não tem `modelFactory`, continua usando o Adapter de compatibilidade original e o comportamento permanece inalterado.

Os testes disparam chamadas reais de subagentes a partir do Expert Workflow e do Script Workflow e afirmam que a requisição passa por `createModel()` do Adapter do Registry. Antes da correção, ambos os testes observavam zero chamadas, o que prova que não se trata de uma cobertura falsa apenas no nível de tipos. As regressões dos dois Workflows e o `typecheck` da raiz do repositório passaram; ao executar `tsc --noEmit` separadamente no pacote Bootstrap ainda é atingida uma inconsistência de tipo preexistente em `SessionEntryInfo.touchSession` vinda de `origin/staging`, e esta fatia não alterou esse contrato.

## 108. Os metadados de execução do Core seguem o Model Config do Registry

O novo Registry ModelFactory já responde pela chamada final do modelo, mas o `create-app` ainda injetava no Core dois resolvedores antigos: `resolveRuntimeModelLimits`, que lia context/output do Catalog, e `resolveModelProviderOptions`, que lia parâmetros de reasoning do Runtime Overlay. Fronteiras de execução filha como a de Subagent chamavam esses resolvedores primeiro, de modo que um mesmo modelo ainda podia ser interpretado por dois conjuntos de fatos, o antigo e o novo.

`resolveRegistryModelRuntimeMetadata()` agora projeta, a partir do mesmo Provider/Model Config, a context window, o max output padrão, as capacidades de mídia e as Provider Options de reasoning normalizadas por API Format. Os dois resolvedores de compatibilidade do Core em `create-app` usam preferencialmente essa projeção. Só quando o Registry não tem completamente o Provider correspondente é que há retorno ao Overlay antigo; quando o Registry já tem o Provider mas falta o Model, ele retorna diretamente `ModelNotFound`, continuando a respeitar a fronteira de migração em nível de Provider.

Essa projeção também valida os níveis de reasoning e reaproveita os requisitos de campos completos do ModelFactory, evitando criar mais um Schema permissivo para o Core. Os novos testes cobrem o mapeamento de parâmetros OpenAI-compatible, a fronteira de retorno em nível de Provider e os níveis ilegais; as regressões de Registry Runtime, App Workflow e Core Subagent passaram.

## 109. A seleção ativa de modelo é estreitada para a fronteira de fato em nível de Provider

O menu de modelos já isolava Registry e Runtime Overlay antigo por nível de Provider, mas, ao chamar `setModel()` diretamente, o resolvedor antigo ainda retornava ao Runtime Overlay quando o Registry já possuía o Provider mas não o Model alvo. Um chamador de protocolo podia, portanto, escolher um modelo antigo que não existe no menu e fazer com que o conjunto de modelos de um mesmo Provider fosse montado com dois conjuntos de fatos, o antigo e o novo.

A seleção ativa usa agora uma resolução estrita Registry-owned: `undefined` só é devolvido quando o Provider inteiro não está no Registry, o que permite entrar no caminho de compatência de Providers ainda não migrados; quando o Provider existe e o Model está ausente, `ModelNotFound` é devolvido diretamente. O modelo inicial explícito de uma nova Session e a seleção padrão do Environment adotam a mesma fronteira.

A restauração de Session mantém outra semântica. Uma Selection persistida expressa a intenção histórica do usuário e, mesmo que o Provider ainda exista e o Model tenha sido removido da configuração, não pode ser trocada silenciosamente por um modelo padrão durante a restauração. Por isso a entrada de restauração continua usando a busca tolerante e preserva a Selection original; quando o Model é realmente criado mais adiante, o Registry ModelFactory reporta explicitamente a indisponibilidade. O teste de integração cobre as duas rotas: a seleção ativa recusando um modelo antigo e a restauração de um Model removido.

## 110. A leitura de estado de um Model removido do Registry não volta ao Catalog antigo

A restauração de Session permite manter um Model histórico que já foi removido do Registry, mas `getThoughtLevel()` e `listThoughtLevels()` antes tratavam "não resolveu um Model do Registry" como sinônimo de "o Provider ainda não foi migrado" e passavam a ler os níveis do Catalog antigo. Enquanto o Catalog antigo ainda reconhecesse o modelo pelo nome, como `glm-5.2`, uma Session restaurada voltaria a exibir o `max` padrão que o Registry não publica mais e a lista antiga de níveis.

A consulta do modelo atual agora distingue explicitamente dois estados: quando o Provider inteiro não está no Registry, ela continua atendendo a cadeia de compatência de Providers antigos; quando o Provider já foi assumido pelo Registry mas o Model histórico foi removido, apenas o `ModelRef.variant` persistido é preservado e nem o nível padrão nem os níveis opcionais são mais lidos do Catalog antigo. Quando o usuário tenta definir um novo nível para esse Model removido, a resolução estrita Registry-owned ainda devolve `ModelNotFound`. O teste de regressão usa um modelo GLM reconhecível pelo Catalog antigo para fixar essa fronteira e evitar que um modelo comum de placeholder faça o teste passar por engano.

## 111. O Registry completa a validação de Option do ModelSelection

`ProviderRegistry.validateSelection()` antes apenas confirmava se o Provider e o Model existiam. Uma Selection com `reasoningLevel` ilegal ou `maxOutputTokens` fora do limite ainda retornava sucesso e só falhava na criação do Model ou na etapa de requisição; o Configured Default mantinha um segundo julgamento, não idêntico. Com isso, uma mesma Selection podia receber conclusões diferentes na Facade, na inicialização e na fronteira de execução.

O Registry agora valida as duas Options que já entraram no contrato público: o nível de Reasoning precisa aparecer no Enum Spec do modelo; o limite de saída precisa ser um inteiro positivo e não pode ultrapassar o `max` do Limit Spec. Quando o modelo não declara o Spec correspondente, submeter explicitamente essa Option também é considerado não suportado. O valor de retorno ganha códigos de erro estáveis junto com o modelo relacionado, o valor submetido e a faixa permitida, para que o chamador possa exibir o problema; o Registry não altera o valor nem faz truncamento silencioso.

O julgamento de opcionalidade do Configured Default reaproveita a mesma função de validação de Option e não implementa mais um julgamento de faixa separado. Os testes de domínio cobrem combinações válidas, Reasoning ilegal, Reasoning Spec ausente, saída fora do limite e valores de saída não positivos construídos diretamente.

O `ProviderRegistryModelSource` do Bootstrap também é estreitado para exigir `validateSelection()`. A inicialização de uma nova Session e o `setModel` ativo leem esse resultado de validação antes de criar a Selection do Registry: quando o Provider inteiro ainda não foi migrado, é possível entrar na cadeia de compatência do Provider antigo; quando o Model está ausente, `ModelNotFound` é devolvido; quando a Option é inválida, `InvalidModelRequest` é devolvido. A restauração de Session histórica continua usando a consulta tolerante e não reescreve a intenção persistida do usuário porque os Option Specs de hoje mudaram.
## 112. A atualização de Account sai da difusão completa do Registry antigo

O `AccountProviderService` do Host local já recalcula a terceira camada do Account Config a partir do Config, das configurações de conta, da Credential Port e das interfaces de plano, mas o momento da atualização ainda assinava o antigo `onDidChangeProviderRegistry`. Esse broadcast inclui ao mesmo tempo salvamento/exclusão de Providers comuns, runtime headers e atualização de planos, o que fazia operações sem relação voltarem a consultar o entitlement da conta e mantinha a nova Account Source dependente, no ciclo de vida, do Registry antigo.

Esta rodada adiciona duas notificações estreitas usadas apenas dentro do processo do Host. `ObservableSettingService.onDidUpdate` publica os campos desta gravação depois que o serviço de configurações de baixo nível grava com sucesso; a raiz de composição observa apenas o domínio da conta, o modo da Family, a seleção de conexão Personal/Team e o endpoint do ZCode. `ModelProviderServiceRuntime.onDidInvalidateAccountProviderFacts` publica apenas as predefinições de login, a entrada de planos, a Coding Plan Key e as mudanças de disponibilidade. Ambas chamam `AccountProviderService.refresh()`, e os erros de atualização continuam sendo registrados pelo evento de erro do Service, que preserva o last-known-good.

A raiz de composição de produção não assina mais o change event antigo do Registry. A edição de Providers comuns e os runtime headers continuam publicando o evento de compatibilidade antigo, mas não disparam a atualização de Account. Os novos testes fixam que a notificação de configurações precisa ocorrer depois de uma gravação bem-sucedida, que operações de Providers comuns não publicam Account Facts e que os dois eventos estreitos têm filtragem, atualização e liberação corretas. Editar manualmente o antigo `setting.json` ainda não tem watcher; esse arquivo é hoje entrada de migração do estado de conexão de conta, e o modelo formal de estado de conta continuará convergindo sua persistência e sua fronteira de atualização entre processos.

## 113. O julgamento de plano das tarefas ociosas passa a ler o Account Overlay

A página inicial das tarefas ociosas julgava antes, pelo antigo `ModelProviderConfig[]`, se o usuário tinha um Coding Plan. Ela precisava entender ao mesmo tempo `enabled`, `systemDisabledReason`, o Provider ID do Coding Plan pessoal e o Provider ID dinâmico do Team Plan — ou seja, na prática mais uma implementação da resolução de Account Access dentro do Renderer. Sobras no Provider Store antigo também podiam fazer um plano já inválido continuar sendo tratado como disponível.

Agora a página inicial e o funil de compra leem em conjunto `ProviderSettingsView`. Um Account Provider representa de fato a conta ter a conexão correspondente apenas quando a terceira camada do Account Overlay fornece um `accessId` não vazio; o Coding Plan Provider tem prioridade sobre o Start Plan. A diferença entre Personal e Team já está codificada no `accessId` e não é mais julgada por um outro conjunto de IDs dinâmicos de Provider. Quando o usuário define um Provider como `enabled: false`, o `accessId` continua existindo, e por isso se preserva a semântica de produto já existente de que desligar a entrada não equivale a cancelar a assinatura.

Enquanto a Settings View não está publicada, o estado é unknown. A página inicial mantém o comportamento de carregamento original e não interpreta o unknown como ausência de plano durante a inicialização, disparando um aviso de upgrade indevido; o bloqueio só acontece quando a View está publicada e não há access de Coding Plan. Os novos testes cobrem Start Plan, a representação unificada do Coding Plan pessoal e de equipe, desabilitação pelo usuário, ausência de access e estado não hidratado. Com isso, o antigo `hasAnyOffPeakCodingPlanProvider()` e a inferência baseada em `systemDisabledReason` foram removidos.

## 114. O despacho das tarefas ociosas sai do Snapshot completo antigo do Registry

O despacho das tarefas ociosas chamava `getProviderRegistrySnapshot()` e procurava no Snapshot antigo a API Key e o baseURL do Coding Plan Provider selecionado. Assim, a conexão estática da conta, as credenciais dinâmicas de requisição e a projeção completa antiga de Providers ficavam amarradas na mesma entrada; mesmo com o Account Overlay já sendo a fonte da verdade dos Providers de conta, o despacho continuava controlado pelo cache e pelo julgamento de associação do Snapshot antigo.

Agora o despacho é dividido em duas entradas. A Provider Settings View / Registry Resolution fornece o `accessId` atualmente fixo do Account Provider e o baseURL; o `AccountRequestAuthResolver`, no momento do despacho, obtém a API Key atual com base no mesmo `accessId`. O resultado da resolução precisa ser idêntico à selected connection key das configurações, e o Team Plan continua sendo resolvido pelo Request Auth Service unificado, que resolve as credenciais de organization/project correspondentes. Quando o usuário define o Provider como disabled, o Account Overlay ainda mantém o accessId, de modo que "desligar a entrada de modelos" não é interpretado como "a conexão do plano desapareceu".

A ausência de credenciais dinâmicas passa a ser expressa explicitamente por `AccountRequestCredentialUnavailableError` e mapeada para o `connection_unavailable` já existente das tarefas ociosas; o despacho não continua mais só porque sobrou uma key no Snapshot antigo. O JWT de login continua sendo lido pelo Credential Service, e a verificação de impressão digital antes/depois da Family e da seleção de conta permanece inalterada, impedindo que duas gerações de credenciais sejam misturadas durante uma troca de configuração.

A implementação de Account Request Auth dentro do Local Host é mantida pelo runtime de Model Provider concreto. Ela não foi registrada como RPC Service porque essa capacidade devolve uma API Key real e não deve ser exposta ao Renderer ou a clientes remotos apenas para reuso interno do Host. O Host usa essa capacidade de execução na raiz de composição local `createLocalServices`; quando a autenticação dinâmica se tornar um Service interno formal, esse ponto de montagem pode ser substituído sem afetar o contrato de dependências das tarefas ociosas.

`reason: "off-peak"` foi adicionado ao enum de usos do Request Auth para facilitar auditorias futuras e atualizações por uso. O Resolver atual ainda exige `modelId`, e as tarefas ociosas usam `OFF_PEAK_PROVIDER_ID` como identificador operacional; o Resolver não escolhe credenciais com base nesse valor. Se a entrada de autenticação dinâmica deve evoluir para um contrato orientado por propósito fica para o desenho independente do serviço de autenticação; esta fatia não amplia o escopo.

Os testes usam dois fixtures independentes, os campos fixos do Account Provider e o Auth Resolver dinâmico, e não constroem mais o antigo `ZCodeProviderRegistrySnapshot`. Eles cobrem conexão pessoal e de equipe, rejeição entre contas, troca de seleção, JWT ausente e API Key dinâmica ausente; nem o módulo nem os testes referenciam mais a interface antiga de leitura de Snapshot.

## 115. A página de configurações de Subagent remove a falsa compatibilidade de Provider Legacy

A página de configurações de Subagent já tinha parado de assinar o Snapshot antigo de Provider, mas a árvore de componentes ainda propagava camada por camada um `ModelProviderConfig[]` sempre vazio. A resolução de reasoning sem Workspace também entregava esse array vazio ao parser de compatibilidade; por isso os tipos e os nomes continuavam sugerindo que o metadata antigo de Provider era uma fonte válida, e qualquer modificação futura poderia reconectá-lo facilmente.

Esta rodada removeu a importação de `ModelProviderConfig` em `SubagentsSection`, bem como o parâmetro `modelProviders` entre o formulário, o controle de Subagent embutido e as linhas da lista. O estado de carregamento passa a se chamar `modelSelectionLoading`, deixando explícito que ele indica se a Model Selection View de nível de processo já foi publicada. Sem Workspace, os Option Specs de reasoning são lidos diretamente dessa View; no modo Workspace, o runtime catalog continua sendo a autoridade do lado da execução, com a prioridade original inalterada.

O parâmetro antigo de Provider do parser de compatibilidade passou a ser opcional e serve apenas para que Entries ainda não migradas o passem explicitamente. O ponto de chamada do Subagent não passa mais o array vazio e também não restaura fatos antigos de Provider quando a View está ausente. Os testes passaram a usar a Registry Selection View para verificar os níveis de reasoning sem Workspace e a cobrir o comportamento de continuar usando a last-known View enquanto a View é atualizada.

## 116. As configurações de geração do Repo Wiki saem da projeção Legacy de Provider

Os componentes de produção do Repo Wiki tinham o mesmo resíduo de transição do Subagent: o menu de modelos, a hidratação do catálogo de workspace e a resolução de reasoning ainda exigiam um `ModelProviderConfig[]` como entrada, enquanto os pontos de chamada reais passavam sempre um array vazio. O menu já era curto-circuitado pela nova fonte da verdade quando a Registry View existia, de modo que o array antigo só restava como ruído de tipo; quando a Registry View ainda não era publicada, o parser de compatibilidade ainda completava uma lista fixa de níveis de reasoning com base no nome `GLM-5.2`.

Agora os grupos de modelos do Repo Wiki usam diretamente `buildRegistryModelSelectGroups()`. A disponibilidade do Provider, o acesso da conta e a associação de modelos vêm todos da Model Selection View; quando a View está vazia, o menu permanece vazio e não volta a executar o julgamento antigo de Family Mode ou de entitlement de Provider. O catálogo de workspace continua responsável pela hidratação do diretório de execução e pela projeção de reasoning do workspace atual, e essa cadeia do lado da execução não mudou.

O helper de reasoning e o helper de hidratação do Repo Wiki removem o parâmetro Legacy de Provider. Com a Registry View disponível, os níveis são lidos dos Option Specs do Model Config; sem a View publicada, usa-se apenas o catálogo de workspace já obtido, sem mais inferir capacidades estáticas pelo nome do modelo. O Subagent recebeu a mesma proteção contra View ausente, evitando que, depois de "não passar o array antigo", a resolução caia implicitamente na regra de nome GLM.

Os fixtures de teste passaram a construir `ModelSelectionView` diretamente e cobrem a projeção do menu pelo Registry, o valor padrão de reasoning, a prioridade do catálogo de workspace, modelos comuns e a proibição de adivinhar capacidades pelo nome GLM quando o Registry não foi publicado. Os 57 testes direcionados passaram e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes e não ganhou erros novos.

## 117. O formulário de edição de Automation sai dos fatos estáticos antigos de Provider

A camada de lista de Automation ainda mantém dados antigos de Provider por causa da telemetria de execução e da compatibilidade histórica, mas o formulário de edição já obtém a Model Selection View completa e os grupos de modelo do Registry. Mesmo assim, ele continuava passando o antigo `ModelProviderConfig[]` como propriedade, usando-o apenas para o label do Provider e o fallback de reasoning, o que criava dois conjuntos de fatos estáticos dentro do mesmo formulário.

Esta rodada remove `modelProviders` das propriedades públicas de `AutomationEditView`. O label de Provider do trigger de modelo vem somente da Model Selection View, e os Option Specs de reasoning também são lidos somente da View. Enquanto a View não é publicada, os itens de menu existentes ainda podem manter o texto do modelo, mas nenhuma capacidade de reasoning é inferida a partir do metadata antigo de Provider ou do nome do modelo. A pré-visualização de Workspace do Automation, o protocolo de salvamento, o estado de agendamento e a telemetria da camada de lista não mudaram.

`resolveAutomationModelTriggerLabel()` também remove o parâmetro antigo de label de Provider, e os testes passaram a construir a Registry View diretamente. Os 26 testes direcionados do formulário de edição e da projeção de modelos passaram, e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes.

## 118. O reasoning do rascunho do Composer sai do metadata antigo de Provider

O rascunho do Composer usa `resolveDraftModelThoughtOption()` para preparar o valor padrão de reasoning de um modelo alvo que ainda não tem projeção de runtime. Esse helper aceitava tanto o array antigo de Providers quanto a Model Selection View e, por isso, lia o metadata antigo de modelo quando a View não estava publicada e aplicava níveis fixos com base em nomes que contêm `GLM-5.2`. Com isso, o valor padrão do rascunho ainda podia divergir do Model Config atual do Registry.

Esta rodada estreitou o helper para `providerId + modelId + ModelSelectionView`. Quando a View não está publicada ou o modelo alvo não tem Reasoning Option Spec, ele retorna vazio e o Composer espera o runtime catalog ou a Registry View fornecerem o fato; quando a View existe, lê diretamente a enumeração e o valor padrão do Model Config correspondente. O texto do rascunho, a seleção de modelo, o thought explícito, o pré-aquecimento de Session e a prioridade da projeção de runtime permanecem inalterados.

Os testes removeram o fixture antigo de `ModelProviderConfig` e cobrem diretamente os Option Specs de diferentes modelos do Registry, modelo ausente, GLM de mesmo nome sem Spec, o nível padrão e a cadeia de restauração do Composer. Os 41 testes direcionados dos dois grupos passaram e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes.

## 119. Remover o parser antigo de Provider do reasoning da UI

Os quatro pontos de chamada de produção — Subagent, Repo Wiki, Automation e rascunho do Composer — já passaram a ler os Option Specs de reasoning somente quando existe Model Selection View. A resolução do antigo `ModelProviderConfig.reasoning` em `modelThoughtOption.ts`, o casamento por `modelIdByKind` e o código fixo do nome GLM-5.2 não têm mais consumidores de produção.

Esta rodada removeu o parser antigo inteiro e estreitou a entrada de `resolveModelThoughtOption()` para uma `ModelSelectionView` não vazia. O chamador precisa tratar antes o estado de View ainda não publicada, e o helper unificado fica responsável apenas pela projeção precisa `providerId/modelId -> reasoning Option Spec`. Assim o metadata antigo de Provider não pode mais ser reconectado acidentalmente por uma nova entrada de UI, nem uma segunda fonte da verdade é recriada por um helper compartilhado.

Os testes especializados removeram o fixture antigo de Provider e a expectativa de "fallback sem Registry", passando a cobrir a autoridade do Registry, modelos comuns, modelos ausentes e a garantia de que nomes obsoletos não completam fatos. Os 101 testes dos cinco grupos relacionados passaram e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes.
## 120. A página de configurações deixa de acrescentar Providers exclusivos do Snapshot antigo

A página de configurações já obtinha por `ProviderSettingsView` os Providers resultantes da composição de Official, Personal e Account Access, mas a projeção de migração ainda acrescentava ao final os `ModelProviderConfig` antigos que não existissem na View. Sobras do Store antigo podiam, portanto, voltar a entrar na página de configurações, no Usage e em parte da exibição de planos, criando Providers fora da nova fonte da verdade.

Esta rodada removeu essa lógica de acréscimo. Depois que a Settings View é publicada, o conjunto e a ordem dos Providers são inteiramente determinados pela View; o Snapshot antigo só complementa, para o mesmo `providerId` de um Account Provider, a API Key ainda não migrada, o motivo de indisponibilidade e os timestamps históricos, e não pode mais contribuir com Providers nem com associação de modelos. A Entry de compatibilidade sem o novo Settings Service continua usando diretamente o Snapshot antigo, e o comportamento de inicialização delas não foi alterado.

Os novos testes fixam que uma Settings View vazia precisa projetar vazio mesmo recebendo um Provider antigo, e 29 testes relacionados de API, Account, ordenação e Hooks da página de configurações passaram em regressão. O Server remoto ainda não montou completamente o Provider Runtime, e a guarda de compatibilidade do Root sem Service continua presente; essa fronteira pertence ao M2.8 e não é escondida nesta fatia por um fallback de UI.

## 121. A consulta de entitlement do Coding Plan passa a usar a identidade de Account Access

`useCodingPlanEntitlements` lia antes a API Key do antigo `ModelProviderConfig`, usava uma Key não vazia para decidir se disparava uma consulta de entitlement e usava o hash da Key como identidade de cache e de autoatualização. Isso fazia o Renderer tratar credenciais dinâmicas de requisição como fato de conexão de plano e obrigava Composer, Automation, configurações de Provider e o diálogo de compra a continuarem passando o objeto antigo completo de Provider.

Esta rodada mudou a entrada do Hook para `ProviderSettingsView`. Os quatro pontos de chamada leem em conjunto o `accessId` não sensível do Account Overlay: a consulta de entitlement do Provider correspondente só é disparada quando existe accessId, e a troca de conexão, mudando o accessId, forma uma nova identidade de cache e de atualização; a API Key real, o JWT e a Team Project Key continuam sendo resolvidas pelo Usage Service no momento da requisição. Um Provider estaticamente presente cujo Account Access ainda não foi estabelecido não dispara consulta e também não usa mais a Key antiga para completar o estado de conexão.

Durante a migração descobriu-se que a Account Source de produção pulava a resolução de conexão quando `enabled: false`, o que conflita com a decisão já confirmada de que desligar a entrada de modelos não equivale a desconectar o plano. O Resolver de domínio e o Connection Resolver dos Services agora resolvem e guardam o accessId mesmo para Account Providers desabilitados; o Registry final continua excluindo os modelos conforme o `enabled: false` do Effective Config, enquanto Settings e Usage podem preservar a conexão da conta. Os novos testes fixam simultaneamente as três camadas de semântica: Account Overlay, Registry selectable e consulta de entitlement.

A renovação da API Key sob o mesmo accessId não altera mais a impressão digital do Renderer. As operações de autenticação, compra e configurações já chamam explicitamente a atualização de entitlement; qualquer nova entrada de renovação de credenciais também precisa notificar os consumidores por meio do evento de estado correspondente ou de um refresh explícito, sem voltar a projetar secrets na UI para fabricar detecção de mudança. Esta fatia não alterou o protocolo de requisição do Usage Service.

## 122. A Plan Identity enviada pela Session passa a usar Account Access

`usePlanIdentitySnapshot` captura a identidade de plano atual quando o usuário envia uma mensagem e a entrega à telemetria de mensagens e ao histórico da Session. Ele assinava sozinho o Snapshot antigo de `ModelProviderConfig` e usava de novo a impressão digital da API Key para decidir as consultas de entitlement e a identidade de cache de Coding Plan / Start Plan. Depois que o entitlement da página de configurações migrou para o Account Overlay, isso ainda formava uma segunda cadeia antiga de fatos e fazia a renovação de credenciais dentro da mesma conexão de plano parecer uma troca de identidade.

Esta rodada adiciona a projeção compartilhada `accountProviderAccess`. Ela aceita apenas `ProviderSettingsView` e lê por providerId o `accessId` não sensível do Account Overlay; quando o Provider é desabilitado pelo usuário, a identidade de conexão é preservada. O entitlement da página de configurações e o snapshot do envio da Session compartilham essa única projeção e constroem, respectivamente, a identidade de consulta/atualização e a de cache com `providerId + accessId`. A API Key dinâmica, o JWT e a Team Project Key continuam sendo resolvidas pelo Usage Service nas requisições reais e não entram na entrada de julgamento do Renderer.

`usePlanIdentitySnapshot` não assina mais o Snapshot antigo de Provider e não chama mais os helpers de impressão digital e de cache baseados em API Key. A Provider Family continua determinando quais providerIds de Coding Plan e Start Plan devem ser consultados, e o fallback do Start Plan e a semântica final de `resolvePlanIdentitySnapshot()` permanecem inalterados. Os novos testes fixam que um API Provider não é confundido com Account Access e que desligar a entrada de modelos não apaga a identidade de conexão do plano; 43 testes existentes de entitlement e telemetria de mensagens passaram em regressão.

## 123. O Usage da página de configurações sai dos fatos antigos de credencial de Provider

O Usage da página de configurações chamava `useModelProviders()`, usava o `enabled` do Provider antigo, o motivo de indisponibilidade e a API Key para decidir se o Coding Plan da Z.ai / BigModel podia ser consultado e usava a impressão digital da API Key para construir o Entitlement Cache. Em seguida passava o array completo de Providers antigos ao painel de Usage apenas para encontrar o mesmo Provider e gerar a chave de cache. Configuração estática do Provider, conexão de plano e credenciais dinâmicas de requisição ficavam assim misturadas em uma única cadeia de UI.

Agora a SettingsPage consome diretamente `ProviderSettingsView`. O Entitlement e os Team Products correspondentes só são consultados quando o Account Overlay fornece um `accessId` não vazio, e a identidade de cache é uniformemente `providerId + accessId`. O source de plano pessoal guarda o accessId original, o providerId e o label de exibição, enquanto o source de equipe continua guardando o contexto de organization/project. O painel de Usage recebe apenas o source atualmente selecionado e, com base nele, escolhe a consulta pessoal ou de equipe; ele não recebe mais `ModelProviderConfig[]` e não lê API Key, estado antigo de enabled nem motivo antigo de indisponibilidade.

A SettingsPage removeu por completo a assinatura de `useModelProviders()` feita para o Usage. Quando o usuário desabilita um Account Provider, o accessId continua presente e a entrada de Usage permanece utilizável; quando o Account Access desaparece, os sources de plano pessoal deixam de ser gerados mesmo que o antigo Entitlement State ainda não tenha sido limpo. Os novos testes fixam que o source pessoal carrega apenas o accessId não sensível, e 43 testes de source de Usage, Tab, Entitlement e montagem da SettingsPage passaram em regressão; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes.

## 124. O Usage da barra lateral e o estado público de saldo saem do ModelProviderConfig

O menu do avatar na barra lateral ainda lia os Providers antigos por `useModelProviders()`, usava `enabled`, o motivo de indisponibilidade e a API Key para gerar o conjunto de "Coding Plans que podem ser consultados" e então entregava o objeto completo ao Entitlement Cache, ao resolvedor de estado de saldo e ao seletor de alvo de upgrade. Essa cadeia permanente usava os mesmos fatos antigos da página de configurações de Usage, mas com uma lógica de filtragem e de cache independente.

Agora a barra lateral assina `ProviderSettingsView`. Z.ai / BigModel só entram nas fontes disponíveis quando o Account Overlay fornece um accessId não vazio, e o usuário desabilitar a entrada de modelos não apaga a conexão. O entitlement pessoal e o gating e a identidade de cache dos Enterprise Products usam `providerId + accessId`, e as credenciais dinâmicas continuam sendo resolvidas pelo Usage Service em tempo de requisição. Quando o Account Access está ausente, a barra lateral não adivinha mais a conexão com base no Provider estático ou em uma API Key remanescente.

O `CodingPlanUsageRemainingState` público e `resolveSidebarCodingPlanUpgradeProviderId()` também têm suas entradas estreitadas: o `ModelProviderConfig[]` completo dá lugar a um `CodingPlanUsageAvailableProvider[]` que contém apenas `providerId` e `label`. A exibição de saldo e de upgrade precisa apenas da identidade da fonte e do rótulo; API Key, Endpoint, conjunto de modelos e antigo estado de disponibilidade não conseguem mais atravessar essa interface. Os pontos de chamada do Composer durante a migração projetam explicitamente os candidatos existentes para esse tipo estreito, e a semântica de execução não mudou.

Os testes passaram a fornecer diretamente um Account Provider desabilitado que ainda contém accessId, cobrindo a sondagem de início a frio, a janela compartilhada de freshness, o fechamento da entrada e a ausência de access; 78 testes de saldo público, upgrade, pessoal/Team e Start Plan passaram. O typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes.

## 125. O Context Usage do Composer passa a usar Account Access

O Composer do V4 já assinava `ProviderSettingsView` para uso do Hook de entitlement, mas os candidatos de plano pessoal, o estado de carregamento e o gating de Team Products do Context Usage ainda eram derivados do antigo `useModelProviders()`. A API Key do Provider antigo ou sobras dele podiam, portanto, ainda fazer a caixa de entrada exibir a entrada de saldo do plano e fazer Settings, barra lateral e Composer adotarem julgamentos diferentes para a mesma conexão de conta.

Esta rodada unifica a fonte de Usage do Composer no Account Overlay. O Account Provider da conexão atual só gera candidatos de plano pessoal e habilita a sondagem de Team Products quando fornece um `accessId` não vazio, e o rótulo do candidato vem diretamente do Effective Provider Config. Enquanto a Settings View não está publicada, o Context Usage permanece em estado de carregamento. Depois que o Account Access desaparece, a entrada de atualização por hover do plano pessoal não é preservada mesmo que os Providers antigos e o Snapshot de Entitlement ainda existam.

`useModelProviders()` continua temporariamente a serviço da exibição antiga e da lógica de compatibilidade do menu de modelos, e esta fatia não mistura essa responsabilidade na migração do Usage. Os testes injetam `ProviderSettingsView` explicitamente e fixam que não há Coding Plan Usage quando "o Provider antigo tem Key e o Entitlement tem snapshot, mas não há Account Access". Os 26 testes relacionados passaram e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes.

## 126. Automation sai do Snapshot antigo de Provider

O formulário de modelos do Automation já usava novos candidatos de modelo quando a Registry View existia, mas a página principal ainda assinava `useModelProviders()` e o Entitlement do Coding Plan. Quando o Registry ainda não era publicado, ela voltava a usar o Provider antigo, as configurações de Family e o Entitlement para construir outro menu de modelos; as telemetrias de criação, execução imediata e exclusão também continuavam recebendo o array completo de Providers antigos, apenas para identificar o hostname do Endpoint de um Personal API Provider.

Esta rodada converge os candidatos de modelo do Automation em uma única `ModelSelectionView`. Enquanto a View não é publicada, candidatos vazios são devolvidos e se espera o Registry, sem executar mais o filtro antigo de entitlement. A ordem dos Providers, a disponibilidade de conta e o conjunto de modelos são todos decididos a montante pelo Registry. Com isso, o Automation removeu `useModelProviders()` e a assinatura do Hook de Entitlement que existia apenas para o menu antigo.

A telemetria passa a ler o `ProviderSettingsView` existente: apenas um API Provider não Oficial tem o hostname extraído do baseURL do Effective Config, preservando a semântica original de não enviar o endereço de um Provider Oficial. Os testes cobrem Registry vazio, modelos de Account já decididos pelo Registry, hostname de Personal API e anonimização de Provider Oficial; 185 testes em 31 arquivos relacionados a Automation passaram.

## 127. O menu de modelos do Composer remove o fallback antigo de Provider

O Composer do V4 já passava a Registry View ao construtor de grupos de modelo. Quando a View existe, o construtor devolve diretamente a projeção do Registry e o Provider antigo, as configurações de Family, o Entitlement, a ordem de exibição e os parâmetros de Team Products não participam do resultado; ainda assim, o Composer mantinha uma assinatura permanente de `useModelProviders()` e, quando a View não era publicada, reconstruía o menu de modelos com o Snapshot antigo, julgava a existência de Providers, completava labels e decidia a elegibilidade de recuperação de Custom Provider.

Esta rodada faz o Composer chamar diretamente `buildRegistryModelSelectGroups()` e remove o Hook antigo de Provider, o filtro de Entitlement e o fallback de ordem de exibição. Enquanto a Registry View não é publicada, os candidatos de modelo ficam vazios; o modelo da Session atual ainda pode ser exibido como marcador a partir da projeção de execução, mas o usuário não pode escolher um modelo a partir da fonte antiga. O label de Provider, a elegibilidade de recuperação de Custom e a codificação do valor selecionado também lêem apenas a Registry View. O Usage de planos e os sources de equipe do Composer continuam usando a cadeia de Account Access/Entitlement migrada nas rodadas anteriores.

Os testes passam a publicar a Registry View explicitamente por padrão e ganharam a regressão de "quando o Provider antigo existe mas o Registry não foi publicado, o menu não é construído"; um Registry vazio também deixa de expor ou enviar um Provider existente apenas na fonte legada. 221 testes em 3 arquivos relacionados a Composer, Coding Plan e entrada de upgrade passaram.

## 128. O estado de conexão de planos da página de configurações usa o Account Overlay

A Provider Settings View já usa o `accessId` do Account Overlay para expressar a conexão atual de Start Plan, Personal Coding Plan e Team Plan, mas a página de configurações ainda inferia o estado de login do cartão, a conclusão do login, a sincronização automática e a entrada do Start Plan pelo antigo `ModelProviderConfig.apiKey`. Isso obrigava o Renderer a continuar segurando credenciais de requisição de um Account Provider e deixava uma Key antiga remanescente sobrescrever o fato novo de Account.

Esta rodada acrescenta a projeção não sensível `accountConnected` nos itens de navegação de planos. O novo Host passa explicitamente o conjunto de Providers cujo `accessId` já foi publicado na Provider Settings View; a resolução do estado de entitlement, a visibilidade do Start Plan, o Plan Card, a espera de conclusão do login, a primeira sincronização e a repetição no mesmo item consomem essa conclusão. Quando o `ProviderSettingsService` existe mas a primeira View ainda não foi publicada, a página permanece em `checking`, sem emprestar brevemente a Key antiga e sem mostrar desconexão antecipadamente.

A Entry antiga sem o novo Provider Settings Service montado mantém a semântica de compatibilidade do `apiKey`; assim que o Service existe, mesmo uma Key antiga não vazia não substitui um `accessId` ausente. A regressão inversa também fica fixa: quando a Key antiga está vazia mas o Account Access existe, tanto Z.ai quanto BigModel exibem normalmente o plano conectado.

Os 307 testes em 18 arquivos de teste relacionados a Provider na página de configurações passaram; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 129. A atualização após a compra atravessa até a Account Source

O diálogo global de compra do Coding Plan, ao terminar, chamava primeiro `refreshCodingPlanApiKey()` e depois `useModelProviders().refresh()` para recarregar o Snapshot antigo de Providers. A nova Account Source recebe de fato o evento de Account Facts, mas essa escuta é um disparo de fundo sem retorno; quando `refreshCodingPlanApiKey()` retorna, o recálculo do Account Provider pode ainda estar em andamento. Chamar apenas o `refresh()` do Registry também não basta, porque `AccountProviderService.read()` devolve o valor atual quando já existe um Snapshot e não espera automaticamente um novo recálculo.

Esta rodada acrescenta um `refresh(reason)` explícito à Facade/Service de Provider Settings. O Provider Runtime o monta como uma cadeia de duas etapas esperáveis: primeiro o `refresh()` da Account Source e depois o `refresh()` do Registry. As escritas comuns de Settings continuam executando apenas a atualização de Registry já existente e não disparam requisições de rede de conta ou de entitlement por causa de uma edição de um Personal API Provider.

O `CodingPlanUpgradeDialog` remove, portanto, `useModelProviders()`. No novo Host, a compra concluída espera a atualização atravessada do Provider Settings Service; a Entry antiga sem esse Service montado chama diretamente a função antiga de atualização do Snapshot compartilhado, sem montar uma assinatura permanente de Hook por causa de uma única atualização. A ordem de atualização de entitlement de planos e de Team Products permanece inalterada.

Os 211 testes em 4 arquivos relacionados à Facade/Runtime de Provider e à UI de Coding Plan passaram, e o typecheck de todo o repositório passou. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.
## 130. O Account Provider da página de configurações sai da projeção permanente de Secrets

A página de configurações já usa o `accessId` do Account Overlay para expressar a conexão de planos, mas a projeção antiga ainda completava API Key, motivo de indisponibilidade e timestamps históricos a partir do `ModelProviderConfig` pelo mesmo Provider ID. Mesmo sem participarem dos principais julgamentos de exibição, esses campos mantinham credenciais antigas de requisição na lista de Providers permanente do Renderer e faziam a projeção da nova Settings View ser recalculada sempre que o Snapshot antigo era atualizado.

Esta rodada transformou a função de migração em uma projeção unidirecional `ProviderSettingsView -> ModelProviderConfig[]`. API Providers continuam carregando a Personal API Key necessária à edição do usuário; a projeção de um Account Provider é fixada sem a API Key antiga, e o conjunto de Providers, o protocolo, o Endpoint, os modelos, as Properties e os Option Specs vêm todos da Settings View. Providers exclusivos do Snapshot antigo, motivos de indisponibilidade e timestamps também deixam de entrar nesse estado permanente.

O "testar conexão" da página de configurações continua chamando a antiga Connectivity Probe, que ainda não foi migrada. Para preservar essa operação explícita, esta rodada chama `getAllCached()` uma única vez, e apenas quando o usuário testa um Account Provider: obtém a API Key de compatibilidade e o Header de execução pelo mesmo ID e então os combina com a projeção atual em um objeto de requisição de uso único. O protocolo, o Endpoint, os modelos e os Headers estáticos da Settings View atual têm prioridade, e o objeto antigo não pode sobrescrevê-los de volta. Depois que a Connectivity Probe for integrada ao Account Request Auth Service, essa leitura de compatência sob demanda poderá ser removida.

Os novos testes fixam que a projeção permanente de Account não contém secrets e verificam que o teste explícito só pode complementar credenciais de execução e Headers, sem trazer de volta fatos estáticos antigos. Os 228 testes em 4 arquivos de teste relacionados a projeção de Provider, página de configurações, Coding Plan e ações de assinatura passaram; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 131. O cold start e a atualização da nova página de configurações saem do Snapshot antigo de Provider

Depois que os secrets de Account saíram da projeção, `useModelProviders()` continuava assinando o Snapshot antigo e disparando `getAll()` mesmo quando o novo Settings Service já estava montado, e devolvia os Providers antigos como lista temporária enquanto a primeira `ProviderSettingsView` não chegava. Isso não só mantinha uma leitura permanente inválida, como também deixava o cold start do novo Host com uma breve fonte da verdade dupla.

Agora a divisão é explícita conforme a capacidade do Service: quando o novo Settings Service existe, a Provider View devolve lista vazia e mantém o estado de carregamento antes de ser publicada; o Hook não assina mais o Snapshot antigo e não dispara o `getAll()` antigo nem lê o display-order antigo. Quando o usuário clica em atualizar na página de configurações, ele chama diretamente `ProviderSettingsService.refresh()`, e a cadeia formal atualiza a Account Source e depois o Registry. A Entry antiga sem o novo Service montado mantém a assinatura do snapshot, a hidratação do cache e o comportamento de atualização originais.

Salvamento, exclusão e reordenação de modelos ainda mantêm por enquanto o espelho do Store antigo e a sincronização de compatibilidade dos Workspaces abertos, porque envolvem cadeias de execução Worker/Remote que ainda não saíram por completo, e esta fatia não os removeu junto com a migração de leitura. Os novos testes fixam que "o Service existe mas a View não foi publicada" não pode recorrer aos Providers antigos; os 229 testes em 4 arquivos relacionados a projeção, página de configurações, Coding Plan e ações de assinatura passaram. O typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes; o pre-push completo fica para uma execução concentrada posterior.

## 132. A adição de modelo na página de configurações sai da consulta independente ao Catalog

Ao adicionar um modelo na página de configurações, a implementação antiga consultava um Catalog independente do China LLM com base no Model ID digitado e lia `maxOutputTokens` do primeiro modelo com o mesmo nome. Essa consulta ignora o Provider ID e o API Format: ela pode casar com o modelo de mesmo nome de outro Provider e obriga o Renderer a manter uma fonte de valores padrão de modelo fora do Official / Personal Config.

Esta rodada acrescenta uma pré-visualização de configuração de modelo sem estado ao `ProviderSettingsFacade`. Ela reutiliza as `ModelConfigRules` de Official e Personal do Snapshot atual, resolve o `ModelConfig` Effective com o Provider ID, o Model ID e o API Format reais e devolve o resultado serializável junto com os problemas de integridade para a página de configurações:

```text
providerId + modelId + apiFormat
                |
                v
      ProviderSettingsFacade
                |
                v
Official + Personal ModelConfigRules
                |
                v
   Effective ModelConfig preview
                |
                v
     maxOutputTokens.default
```

A pré-visualização não grava no Personal Config nem dispara reconstrução do Registry. O rascunho de um novo Provider gera um `providerId` estável assim que o formulário é aberto e o reutiliza ao salvar, de modo que regras com `providerMatch` têm a mesma semântica antes e depois do salvamento.

A página de configurações removeu simultaneamente a entrada desativada de adição de Provider por Catalog, os componentes correspondentes e a API pública `IModelProviderService.getCatalogProviders()`. O antigo Catalog Loader continua sendo usado temporariamente pelo Provider Store antigo para complementar metadata durante a migração; somente depois que esse Store concluir a migração será possível afirmar que a fonte de fatos de Catalog em runtime foi removida por completo.

Os 371 testes em 6 arquivos de regressão de Facade de Provider, página de configurações e Service antigo passaram; as builds TypeScript incrementais de Provider, Services e UI passaram. O lint de todo o repositório está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 133. O Provider Store antigo remove o enriquecimento por Catalog

A cadeia de leitura do antigo `config.json` / `model-providers.json` carregava o Catalog de modelos chinês da raiz do repositório, casava context, output, modalities e reasoning por Model ID e gravava o resultado de volta na configuração do usuário. O Provider ID e o API Format não participavam da busca; o mesmo Model ID em qualquer Provider recebia a mesma metadata. Isso não só cria uma segunda fonte da verdade fora do Official Config, como também persiste padrões do sistema como se fossem campos escritos pelo usuário, atrapalhando a posterior importação diferencial do Personal.

Esta rodada estreitou as responsabilidades do Store antigo ao parsing do formato antigo e à normalização de campos:

```text
旧 config.json / model-providers.json
                |
                v
      legacy schema migration
                |
                v
   normalize existing values only
                |
                v
       compatibility projection

Official + Personal + Account Config
                |
                v
        Provider Registry
                |
                v
Properties / Option Specs / reasoning mapping
```

O Store antigo não completa mais outputs ausentes, não estende níveis de reasoning e não copia fatos de mídia de modelos. Valores escritos explicitamente no arquivo antigo continuam preservados; ao final desta fatia, a normalização do formato antigo de `[1m]` ainda existe temporariamente e em seguida é movida para o Official Config pela seção 135. Quando o Registry resolve o mesmo modelo, ele continua obtendo os fatos padrão completos pelas `ModelConfigRules` de Official/Personal. Os testes fixam simultaneamente que o context de 1M, o output de 384K e os níveis de reasoning do DeepSeek V4 Pro continuam existindo no Official Config do repositório, para que a remoção da fonte antiga não apague o fato em si.

O Catalog Loader correspondente, os testes do Loader, o JSON do Catalog antigo com mais de 5.000 linhas e o item de empacotamento `extraResources` do Electron foram removidos. O Shared ainda mantém o campo de provenance do Catalog antigo e o schema, para compatibilidade de parsing com configurações históricas e protocolos; eles não apontam mais para nenhuma Catalog Source de runtime e saem junto com os antigos DTO/Store.

Os 191 testes em 5 arquivos relacionados a Provider Service, Official Source, importação Personal, Provider Runtime e recursos do desktop passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 134. Valores de sistema do Builtin Preset saem da primeira migração Personal

O antigo `ModelProviderService` gravava no Provider Store antigo os fallbacks locais e os resultados de sincronização remota do Builtin Preset. Esses objetos contêm ao mesmo tempo a API Key do usuário, o label do sistema, o endpoint de execução, a lista remota de modelos e o estado de disponibilidade da conta. Antes, a primeira migração os diferenciava por inteiro contra o Official Config; quando o fallback antigo tinha apenas `GLM-5.2` e `GLM-5-Turbo` enquanto o Official já continha a lista completa de modelos da Z.ai, essa diferença era gravada por engano como `models` do Personal e fazia o novo Registry perder por muito tempo os modelos novos do Official.

Esta rodada estreitou a migração conforme a propriedade que os dados antigos conseguem provar:

```text
旧 Builtin API Provider
├─ API Key                         -> Personal
├─ modified=true 的模型配置       -> Personal ModelConfigRule
└─ label / endpoint / models 等    -> 不迁移，继续由 Official 决定

旧 Builtin Account Provider
├─ modified=true 的模型配置       -> Personal ModelConfigRule
└─ 静态字段 / 可用状态 / 凭据      -> 不迁移
```

Built-in Providers antigos e desconhecidos continuam não entrando no Personal. Personal-only Providers e API Providers Oficiais salvos no Store antigo com origem custom continuam usando a semântica original de migração completa/diferencial e não são afetados por essa decisão. Os testes de regressão fixam que o fallback antigo de dois modelos da Z.ai não pode sobrescrever o conjunto de modelos do Official, ao mesmo tempo que preservam os modelos modificados que o usuário adicionou explicitamente.

## 135. O sufixo de modelo e os padrões de modelos novos saem do hardcode da UI e do Shared

A página de configurações, a fábrica de modelos do Shared, a normalização do Store antigo e a projeção de protocolo reconheciam antes o sufixo `[1m]` no Model ID e forçavam a context window para 1M. A adição de modelo na página de configurações ainda inicializava 200K diretamente com uma constante do Shared. O mesmo fato existia em várias camadas, e a configuração Personal explícita não conseguia sobrepor a regra do sufixo.

Esta rodada move as duas padrões para as `ModelConfigRules` do Official: a primeira regra geral fornece 200K de context e as capacidades de entrada padrão; a regra `[1m]` seguinte sobrescreve o context para 1M. A adição de modelo na página de configurações obtém o resultado pela pré-visualização da Settings Facade; a linha do modelo, o diálogo de edição e a lógica de salvamento usam somente o valor de configuração atual. A fábrica do Shared, o Store antigo e a projeção de protocolo apenas normalizam ou repassam metadata explícita e não inferem mais capacidades a partir do nome do modelo. Quando o Model ID muda, o formulário de adição limpa simultaneamente as pré-visualizações de context e output do modelo anterior e espera o resultado do Config do novo modelo, evitando que uma consulta breve ou com falha reutilize valores antigos.

```text
Official ModelConfigRules
├─ model=.*        -> contextWindow = 200K
└─ model=.*[1m]    -> contextWindow = 1M
             |
             v
Settings Preview / Registry ModelConfig
             |
             v
Renderer 与执行侧消费最终值
```

Portanto, `[1m]` expressa agora um padrão do Official e não uma regra de código não sobrescrevível. O Model Config exato do Personal fica depois das regras do Official, de modo que um context explícito do usuário pode sobrescrevê-lo; um context já escrito em um arquivo antigo também é preservado como intenção do Personal na primeira importação. Os 261 testes em 7 arquivos relacionados passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 136. Remover a sugestão desativada de Endpoint e a saída de sondagem de modelos remotos

A página de configurações já edita, pelo Provider Settings Facade, o `apiFormat`, o `baseURL` e a lista de modelos explícitos, e não lê mais o antigo `getEndpointSuggestions` nem o `getModelsByEndpoint`. O Hook antigo ainda expõe esses dois métodos sem consumidor, e por isso o Service e o OAuth Preset Repo continuavam mantendo uma via auxiliar de configurações que acessa `client/configs`.

Esta rodada removeu o valor de retorno do Hook de UI, o contrato público do Service, as implementações de Service/Repo, o stub web, os componentes mortos e os testes que cobriam apenas essa saída. O teste explícito de conectividade é preservado; o entitlement de Account e a migração do Preset antigo ainda podem acessar serviços remotos conforme suas próprias responsabilidades.

```text
Add Provider
     |
     v
Provider Settings Facade
├─ apiFormat
├─ baseURL
└─ explicit models

testModelConnectivity
└─ 用户显式触发的独立操作
```

Essa remoção evita que a lista remota de Providers volte a ser uma fonte de fatos candidata da página de configurações e não altera a cadeia de compatibilidade do Workspace Snapshot ainda usada pelo desktop-attached remote. Os 343 testes em 3 arquivos relacionados a Services e à página de configurações passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 137. O conjunto de modelos do Start Plan sai do hardcode da UI e do Store antigo

O Shared mantinha dois modelos gratuitos em `ZAI_START_PLAN_FREE_MODELS`. A projeção antiga do Snapshot de Provider da caixa de entrada filtrava os modelos do Start Plan por essa constante, e a página de configurações ainda a usava para montar um Provider de marcador; o Provider Store antigo também escrevia Start Plans da Z.ai e da BigModel na configuração antiga com base nela quando a sincronização remota falhava. Essas três lógicas sobrescrevem ou forjam fatos formais: o Official Config já declara modelos estáticos e o Account Overlay fornece a associação realmente disponível conforme o entitlement atual.

Esta rodada removeu a constante e seus três tipos de consumidor. A cadeia de fatos formais agora é:

```text
Official Provider / Model Config
              +
当前 Account ProviderConfigMap
              |
              v
       Provider Registry View
              |
              v
       设置与模型选择投影
```

Enquanto a Registry View ainda não está hidratada, a projeção de compatibilidade apenas repassa os modelos que já existem no Snapshot antigo do upstream e não volta a decidir por nome de modelo e marca `modified`. O fallback de falha de rede do Store antigo ainda pode complementar API Key Providers e o ZAPI interno, mas não cria mais Account Provider com base em constantes locais de modelo; sem fatos de Account obtidos, o Start Plan deve permanecer indisponível.

Os novos testes de regressão primeiro provam que a implementação antiga filtrava os modelos do upstream e forjava o Start Plan, e só então concluem a mudança de produção. Os 340 testes em 4 arquivos relacionados a UI e Services passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção atual.

## 138. O Host local para de sobrescrever o Registry do Worker com o Snapshot antigo

Ao investigar a cadeia local de criação de Session, viu-se que, embora o Host e o Core Worker já estejam montados com o Registry de Provider de nível de processo, o Host ainda derivava `runtimeModel` do Snapshot do antigo `ModelProviderService` e o enviava ao Worker nas entradas de create/resume/set/send. A CLI registrava essa entrada como execution-scoped Model Source; portanto a execução de modelos comuns do mesmo Environment ainda acabava sendo controlada pelo Snapshot antigo, e o Registry de Official, Personal e Account mantido pelo próprio Worker não se tornava a autoridade de execução.

Esta rodada separou as duas responsabilidades do Host:

```text
ModelSelectionView
├─ 判断本地模型执行是否就绪
├─ 空 View 变为可用时唤醒等待中的 Worker
└─ 不产生 runtimeModel

旧 Provider Registry Snapshot
├─ desktop-attached remote 兼容
├─ 显式旧调用兼容
└─ 不参与已装配新 Provider Runtime 的本地执行
```

As entradas locais de Session agora enviam apenas `ModelSelection` e o thought level. O Worker consulta o próprio Registry de nível de processo ao criar o Loop, e atualizações do Provider Config só afetam os Models criados depois; o ciclo de vida de um Model já mantido não muda. O `runtimeModel` execution-scoped explicitamente carregado pelo chamador é preservado, de modo que Providers temporários do período de migração, como os das tarefas ociosas, não foram removidos por esta mudança.

Durante a implementação também se descobriu que `createLocalServices()` criava a `AccountProviderConfigSource` formal, mas o que era entregue ao `ZCodeAgentService` continuava sendo apenas o Legacy Source usado pelo desktop-attached remote. Essa omissão faria a sincronização local `provider/updateAccountConfig` nunca obter o novo Account Overlay. Esta rodada conecta a Source formal ao Agent Service; quando o remoto não tem um Registry da mesma origem, ele continua usando o Legacy Source, sem ampliar a fronteira desta migração.

Os fakes de Agent dos testes antigos amarravam a requisição de runtime preferences logo depois de `workspace/updateProviderRegistry`, e a cold subscription do V4 ainda afirmava que o Host enviava primeiro o Snapshot completo. Os dois testes foram alterados para a semântica do Registry de nível de processo: as runtime preferences são solicitadas na fase de materialização de runtime da criação de session, e a cold subscription usa o Snapshot antigo apenas como portão de entrada da inicialização.

## 139. O pré-aquecimento do Repo Wiki local sai do Workspace Snapshot antigo

O menu de modelos e os Option Specs do Repo Wiki já vêm da `ModelSelectionView`, mas o pré-aquecimento de rascunhos de projetos não ativados ainda sincronizava incondicionalmente o Registry completo antigo e o Host resolvia o `runtimeModel` do mesmo modelo. Como o Worker local já tem o próprio Registry de processo como autoridade de execução, esses dois passos reintroduziam uma segunda fonte da verdade.

Esta rodada faz a divisão conforme o tipo de Workspace:

```text
本地 Repo Wiki 预热
└─ preferredModel / ModelSelection -> Worker Registry

desktop-attached remote 预热
├─ 同步旧 Workspace Registry Snapshot
├─ 解析兼容 runtimeModel
└─ 创建远端草稿 Session
```

O remoto entra na cadeia de compatibilidade por `workspaceIdentity` ou `remoteSessionId`; isso é coerente com a restrição existente de que o remoto precisa carregar `workspaceIdentity` e também cobre workspaces que estão temporariamente sem `remoteSessionId` durante uma desconexão. O caminho local não chama mais `getProviderRegistrySnapshot()` nem `resolveRuntimeModelForV4()`. Os novos testes fixam separadamente que o remoto continua sincronizando e que o local contorna completamente a cadeia antiga.
## 140. A troca de modelo local do V4 recusa a restauração pelo Snapshot antigo

Ao receber `provider.notInRegistry`, o `switchModelConfig` do V4 fazia o Renderer reenviar incondicionalmente o Registry completo antigo, e então o Host resolvia o runtimeModel e tentava de novo. Isso existia originalmente para a recuperação do catálogo em processo do desktop-attached remote; depois que o Worker local passou a usar o Registry de processo formal, essa recuperação sobrescrevia a recusa explícita do Worker com uma segunda fonte da verdade.

Agora apenas workspaces remotos com `workspaceIdentity` ou `remoteSessionId` entram na recuperação de compatibilidade. O local devolve o primeiro resultado de recusa e não chama o antigo `getProviderRegistrySnapshot()`, nem `workspace/updateProviderRegistry`, nem `resolveRuntimeModelForV4()`. O remoto ainda tenta no máximo uma vez e interrompe o ciclo quando a segunda tentativa também falha. Os 44 testes do SessionPane cobrem a proibição de recuperação no local, o reenvio no remoto, a injeção de runtimeModel e a semântica de prevenção de loop.

## 141. O pré-aquecimento de rascunho local do V4 sai da resolução de runtimeModel do Host

O pré-aquecimento de Session de rascunho do V4 obtém primeiro a configuração inicial de modelo do Composer e então chama `resolveRuntimeModelForV4()` do Host. O Host local já não mantém a Execution Registry Source, de modo que essa chamada normalmente devolve vazio; o problema mais importante, porém, é que essa interface continua expressando "o Host pode construir um runtimeModel para a execução local", o que conflita com a autoridade do Registry do Worker.

Agora o resolvedor de runtimeModel do pré-aquecimento local devolve vazio diretamente, e o `createSession` carrega apenas o provider/model/thought inicial; o Worker cria o Model pelo seu próprio Registry de processo. Workspaces remotos com `workspaceIdentity` ou `remoteSessionId` continuam sendo resolvidos pelo Host e carregando um runtimeModel de compatibilidade. Os testes capturam diretamente o resolvedor que o SessionPane passa ao coordenador de pré-aquecimento e fixam, respectivamente, zero chamadas no local e a resolução normal no remoto; todos os 46 testes do SessionPane passaram.

## 142. O create replayable/Bot local do V4 sai do runtimeModel do Host

O task adapter dos Services ainda tem uma entrada independente de `createSession` do V4, usada pelo replayable de celular e pelo Bot para criar tarefas. Antes, ele chamava `resolveRuntimeModelForV4()` do Host sempre que recebia um model, mesmo quando o alvo era um Worker local. Como o processo de Agent local já mantém o Registry formal, essa entrada também trazia a configuração de compatibilidade do Host de volta para o Worker.

Agora o create local do V4 envia apenas o provider/model/thought da config; apenas alvos desktop-attached remote com `workspaceIdentity` continuam resolvendo e anexando runtimeModel. Aqui não se usa `workspacePath` para decidir se algo é remoto, coerente com a restrição de que o isolamento de identidade remoto exige `workspaceIdentity`. Os 90 testes do task adapter cobrem as zero chamadas locais e a injeção de runtimeModel de compatidação remota.

## 143. A troca de modelo local do Automation sai do runtimeModel do Host

A entrada de configuração unificada do Automation envia o `switchModelConfig` do V4, mas antes o Host executava `resolveRuntimeModelForV4()` tanto para alvos locais quanto remotos. O Worker local já consegue criar o Model a partir de provider/model/thought pelo Registry de processo, e esse runtimeModel apenas reintroduzia a projeção de execução antiga.

Agora os comandos locais do Automation carregam apenas Selection e Options; o desktop-attached remote com `workspaceIdentity` continua anexando o runtimeModel de compatibilidade. O collaboration mode, a convergência de thought e a ordem dos comandos existentes no Automation permanecem inalterados. Os 91 testes do task adapter cobrem a zero resolução local e a injeção de runtimeModel remota.

## 144. A fronteira de autenticação dinâmica do desktop-attached remote (já decidida)

Ao continuar descontinuando o Snapshot antigo de Secrets de Account do remoto no M2.8, confirmou-se uma fronteira entre processos que não pode ser resolvida apenas removendo ramos de compatibilidade:

```text
Desktop Local Host
└─ Credential Store
   └─ Account Request Auth Resolver

Renderer
├─ Local Host services
└─ Remote Host services

Remote Host
└─ Remote Core Worker
   └─ interaction/requestProviderRuntimeHeaders
```

O server remoto inicia com o authority mode `desktop-attached-remote` e hoje não está montado com um Provider Config Runtime Official/Personal nem com um Credential Store da conta do Desktop. Ao receber a requisição de autenticação do Worker, o `ZCodeAgentService` remoto só pode chamar o próprio `modelProviderService.accountRequestAuthResolver` antigo do processo remoto. Esse Resolver lê o diretório do usuário remoto e o estado da conta remota, e não pode representar o estado de login do Environment do Desktop.

A UI bridge existente também não corrige essa fronteira. `V4WorkspaceProviderRuntimeHeadersBridge` envolve o Controller no `ServiceProvider` do Workspace alvo; a tab remota obtém assim simultaneamente o `zcodeAgentService` remoto, o `modelProviderService` remoto e o `codingPlanSubscriptionService` remoto. Ela consegue devolver a resposta ao Remote Host, mas não obtém de forma natural o Account Request Auth Material do Desktop Local Host.

A configuração estática já tem um protocolo sem Secrets reutilizável:

```text
Desktop Account ProviderConfigMap
        |
        | provider/updateAccountConfig
        v
Remote Worker Registry
```

O que realmente aguardava decisão era o roteamento dinâmico de cada requisição:

```text
方案 A：Renderer 临时中转

Remote Worker -> Remote Host -> Renderer
                              -> Local Host Auth Service
                              -> Remote Host -> Remote Worker

方案 B：Host 直接中转

Remote Worker -> Remote Host -> Local Host Auth Broker
                              -> Remote Host -> Remote Worker
```

A opção A reaproveita o fato de que o Renderer já possui simultaneamente os serviços Local e Remote, e é coerente com a posição atual da bridge do Header de verificação de segurança de uso único; exige adicionar um Service estreito de Account Request Auth no Local Host e permitir que o Auth Material de uso único passe pela memória do Renderer. A opção B tem responsabilidades de processo mais puras e o Renderer não toca no Auth Material, mas hoje não há canal RPC direto entre Local Host e Remote Host, de modo que seria preciso adicionar um novo broker Host-to-Host na camada de gerenciamento de conexão remota, com impacto claramente maior.

### Decisão humana

Nenhum dos dois roteamentos entre Hosts entra na arquitetura alvo. O Desktop Local Environment e o Remote Environment têm cada um seus próprios Provider Config, Credential Store, Account Source e Registry; `desktop-attached` expressa apenas a relação de controle remoto.

A migração acontece em três passos:

1. O Remote ProviderRuntime passa a ser a única fonte da verdade do Remote Worker, removendo o caminho principal em que o Desktop envia o Registry completo, o runtimeModel, o Account Config e o Snapshot de Secrets.
2. Uma funcionalidade de sincronização independente, de responsabilidade de outra pessoa, continua gravando o Config e as Credenciais locais no Remote Store; a Remote Source reconstrói o Registry a partir das mudanças no Store, e as requisições continuam lendo apenas o Remote Account Request Auth.
3. Mais adiante o App pode chamar diretamente os Services de Settings / OAuth remotos, operando remotamente o login e a configuração de modelos do ambiente remoto.

O segundo passo é Provisioning, não injeção de Provider em runtime. Se a sincronização for interrompida, o Remote Environment continua rodando com os fatos locais da última gravação bem-sucedida; o Desktop não participa de cada requisição de modelo. O relay de Auth pelo Renderer e a proposta de Host-to-Host Auth Broker foram descartados.

## 145. O Account Request Auth é promovido a contrato de serviço independente

O transporte entre Hosts ainda não foi decidido, mas tanto o relay pelo Renderer quanto o broker Host-to-Host precisam da mesma capacidade de autenticação em tempo de requisição. A implementação anterior tinha apenas `modelProviderService.accountRequestAuthResolver`, uma propriedade interna de um runtime concreto; um chamador que dependesse diretamente dela continuaria amarrando a autenticação dinâmica ao serviço antigo de Provider.

Esta rodada acrescenta `IAccountRequestAuthService`, cuja interface mantém apenas:

```text
resolve(providerId, modelId, accountAccessId, reason)
        |
        v
AccountRequestAuthMaterial
├─ apiKey
└─ headers
```

Os Local Services montam esse serviço usando o Resolver existente. A camada de serviço apenas delega: não lê Config, não armazena credenciais em cache, não recorre ao Provider antigo e não engole falhas de autenticação. `ZCodeAgentService`, o Off-Peak Service do conjunto e o Desktop Host Off-Peak Runtime dependem agora desse contrato estreito; o antigo `ModelProviderService.accountRequestAuthResolver` serve apenas, dentro da raiz de composição `createLocalServices()`, para produzir a implementação de migração.

Durante a implementação tentou-se registrar esse serviço como um Service Channel padrão. O typecheck de todo o repositório alcançou a montagem existente do Desktop Host e revelou que ali já é explicitamente proibido expor a capacidade de resolução de API Key ao Renderer/cliente remoto; continuar o registro escolheria o relay pelo Renderer antes de a estratégia entre Hosts ser decidida. A implementação final retirou o Channel, o `IServiceAccessor` e o proxy do `RemoteServiceAccess`, mantendo o serviço privado ao processo do Local Host pela mesma tabela lateral `WeakMap<ServiceCollection, Service>` usada pelo `ProviderRuntime`. O Desktop Host consegue obter a mesma instância pela API de composição do node, mas `ServiceCollection.exposeOnChannelServer()` não a expõe.

Os novos testes cobrem a delegação sem alteração pelo Resolver, a ausência de degradação em caso de falha e a obtenibilidade da instância privada do Local Host; os testes de comportamento existentes de Agent/Off-Peak passaram a injetar diretamente o contrato de serviço. Os 80 testes em 5 arquivos de teste direcionados passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 146. O Account Request Auth sai da propriedade do Provider Service antigo

O item 145 estreitou primeiro a interface dos consumidores, mas o Local Host inicialmente ainda construía o novo serviço a partir de `modelProviderService.accountRequestAuthResolver`. Isso deixava a nova interface possuída em runtime pelo serviço antigo de Provider e faria a mesma cadeia de autenticação migrar de novo quando o serviço antigo fosse removido.

Esta rodada moveu a montagem para `createLocalServices()`:

```text
Credential Service / OAuth Credential Repo
Account Provider Credential Store
Team Plan Request Key Resolver
        |
        v
AccountProviderRequestAuthService
        |
        v
IAccountRequestAuthService（Local Host 私有）
```

A Personal Coding Plan Key comum é lida primeiro da nova `account-provider:<accessId>:api-key`; somente quando a nova chave não existe é que ela é relida do Provider Store antigo por uma closure e a migração de uso único é concluída. O Start Plan continua lendo o Token Set atual do OAuth Credential Repo, e o algoritmo de Key do Team Plan em tempo de requisição permanece o mesmo. O antigo `ModelProviderService` já removeu o campo Resolver e sua construção e não possui mais a capacidade de autenticação dinâmica.

A implementação concreta da Team Plan Key ainda compartilha, por enquanto, as funções puras do arquivo `modelProviderService.ts` com o Snapshot antigo do Registry. Mover essa lógica de execução de conta dinâmica para um módulo de Account Runtime independente é uma limpeza de coesão interna de código posterior e não afeta as fronteiras de fonte da verdade e de ciclo de vida desta rodada.

Os testes verificam primeiro que o serviço estreito do Local Host consegue resolver a Key atual pelo novo Credential Store depois que o Resolver antigo foi removido; os 145 testes em 4 arquivos relacionados passaram. O typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 147. O logout OAuth limpa o novo Account Credential Store

A Personal Coding Plan Key já migrou de forma unidirecional do Provider Store antigo para o Account Credential Store gerenciado por `accessId`, mas o logout OAuth continuava chamando apenas o antigo `ModelProviderService.clearCodingPlanApiKey()`. Isso deixaria na nova fonte da verdade de autenticação de requisição, após o logout, uma Key antiga; em um login posterior ou numa recuperação de estado de conta, o Request Auth ainda poderia ler essa credencial obsoleta.

Agora o handler de logout depende de duas fronteiras explícitas de limpeza:

```text
OAuth logout
├─ 旧 Provider Store
│  └─ 清理 Start / Coding Plan 迁移期副本
└─ Account Credential Store
   └─ 删除 coding-plan:<providerId> Personal Key
```

O JWT do Start Plan é limpo junto com o OAuth Token Set e não é mantido em uma cópia separada no Account Credential Store; a Key do Team Plan é resolvida em tempo de requisição e também não faz parte desta limpeza de credenciais persistidas. O Local Host, o Remote Connection Host e o Remote Workspace Host construzem todos o mesmo tipo de Account Credential Store usando o Credential Service que cada um já possui, evitando que o comportamento de logout diverge novamente entre Hosts.

Os testes acrescentam primeiro a asserção de remoção no novo Store e só então a implementação é modificada. Os 10 testes em 3 arquivos de teste direcionados passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 148. A Team Plan Request Key sai do Provider Service antigo

O problema de coesão interna de código deixado pelo item 146 foi resolvido. A resolução da Key em tempo de requisição dos Team Plans BigModel e Z.ai agora fica no módulo independente `accountProviderTeamPlanRequestKey`:

```text
accessId + OAuth Credential Port + ApiClient
        |
        v
Team Plan Request Key Resolver
├─ 校验选中的 organization / project
├─ 查找或创建 zcode-team-api-key
├─ 复制 Secret
└─ 返回本次请求使用的 Key
```

O novo Account Request Auth Service depende diretamente desse módulo. O Snapshot antigo do Registry também chama a mesma implementação antes de sair, de modo que o período de migração não forma dois algoritmos de Team Plan Key. O módulo não lê Provider Config, não mantém Registry e não armazena Keys em cache; ele trata apenas a autenticação de conta em tempo de requisição. A rejeição do BigModel a JWTs do ZCode desatualizados, a recuperação da organização a partir de uma seleção antiga só por project e o comportamento de Header de domínio de negócio da Z.ai permanecem iguais.

Os testes estabelecem primeiro a fronteira do módulo independente, cobrindo separadamente o fluxo completo de obtenção do `apiKey.secret` por organização/projeto no BigModel e na Z.ai, e só então a implementação é movida. Os 141 testes em 3 arquivos relacionados passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 149. O Prompt CLI / TUI desliga o Workspace Legacy Model Source

O Prompt CLI e a TUI já iniciam o Registry de nível de processo e importam o CLI Provider Config antigo para o Personal Config na primeira inicialização. Porém, ao criar o App, as duas Entries injetavam apenas `providerRegistry`, sem definir explicitamente `workspaceProviderCompatibilityMode: "registry-only"`. O padrão de migração de `createZCodeApp()` continuava, portanto, montando o Workspace Legacy Compatibility Source: quando o novo Registry não tinha um Provider inteiro, a execução Standalone ainda podia reler o Runtime Model Overlay antigo.

Agora as duas Entries escolhem explicitamente registry-only quando o Registry existe:

```text
Official + Personal Config
        |
        v
Process Provider Registry
        |
        v
Prompt CLI / TUI App ModelFactory

Workspace Legacy Compatibility Source
        X 不再装配
```

O CLI Config antigo participa apenas da importação única quando o Personal Config ainda não existe; depois da importação, os fatos de execução vêm só do Registry. Os testes acrescentam primeiro uma asserção de modo à montagem do App do Prompt headless e da TUI, confirmam que antes da correção as duas Entries saíam, e só então a implementação é modificada; os testes das duas entradas passaram. Os resultados das verificações estáticas de todo o repositório são registrados junto com o commit desta rodada, e o pre-push completo fica para uma execução concentrada posterior, conforme a convenção.
## 150. A migração de Usage / Entitlement precisa de uma decisão independente

`BigModelUsageQuotaProvider` ainda lê diretamente o antigo `ModelProviderConfig[]`. Não se trata de um simples consumo de Provider View estática: o mesmo serviço mistura três fatos diferentes dentro de um único objeto.

```text
旧 ModelProviderConfig
├─ label / endpoint / provider family      静态展示与路由
├─ enabled / 当前连接                      账号选择状态
└─ apiKey                                  请求期鉴权
```

Ao mesmo tempo, a semântica de consulta do Usage não equivale ao Registry atual: quando um Team Plan está ativo, o usuário ainda pode consultar explicitamente o Personal Coding Plan; Providers já desconectados e atualmente não selecionáveis também podem precisar exibir uso histórico ou um estado explícito de não configurado. Substituir diretamente por `ModelSelectionView` confundiria "o conjunto atual de modelos selecionáveis" com "fontes de uso consultáveis", e mudar diretamente para Account Request Auth empurraria requisições de monitoramento de planos que não são de modelo para dentro da interface de requisição de modelos.

Por isso essa migração exige antes uma decisão sobre a fronteira de domínio do Usage. O caminho mais claro é estabelecer uma Usage Source / fronteira de Autorização independente: as informações estáticas de Provider são lidas da nova projeção de Config/Settings, a Personal Key é lida do Account Credential Store e a Team Key reaproveita o Team Plan Request Key Resolver já extraído; se é permitido consultar fontes que não são a conexão atual e fontes desconectadas passa a ser definido pela semântica de produto do Usage. Antes dessa decisão, não se pode substituir o comportamento atual filtrando pela selecionabilidade do Registry, nem afirmar que o Provider Service antigo já pode ser removido.

## 151. O teste de conectividade sai do hardcode de reasoning por nome de modelo

O "testar conexão" da página de configurações já obtém o Model Config final a partir de `ProviderSettingsView` e projeta o seu `reasoningMapping` nas Provider Options de que a requisição de conectibilidade atual precisa. A Probe antiga, porém, ainda chutava o `effort` do Anthropic e o `thinking.budgetTokens` a partir do nome do modelo `GLM` e dos níveis `low / high / max` quando o mapa estava ausente. Isso tornava a Probe um segundo fato de mapeamento fora do Official / Personal Model Config.

Esta rodada estreitou tudo para uma única cadeia de dados:

```text
Model Config default reasoning level
        |
        | 查找同档 reasoningMapping
        v
Provider Options
        |
        v
Connectivity wire request
```

O Request Body Builder interno da Probe deixa de receber um `thoughtLevel` genérico e traduzi-lo por conta própria; ele projeta somente as Provider Options já resolvidas pelo Model Config. Quando o mapa existe, Anthropic / OpenAI-compatible / OpenAI Responses mantêm os campos de wire originais; quando o mapa está ausente, nenhum parâmetro de reasoning é preenchido com base no nome do modelo.

Os testes primeiro transformam o caso antigo de fallback de GLM em "não configurado, não envia", confirmando a falha antes da mudança; em seguida o fallback e a entrada de tradução de `thoughtLevel` do Helper são removidos. Os 148 testes do Helper de conectividade e do Provider Service passaram; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 152. O editor de tarefas ociosas sai do fallback de reasoning por nome GLM

As tarefas ociosas são um Provider execution-scoped, e seus modelos disponíveis e fatos estáticos de modelo são resolvidos pelo Host a partir de `client/configs.offPeak.allowed_models` e `builtinModels` em `allowedModelConfigs`. O Renderer já consegue ler diretamente os níveis de reasoning, mas o helper antigo ainda completava localmente `max / high / nothink` com base no nome de modelo `GLM-5.2` quando o metadata do modelo estava ausente.

Esta rodada remove esse fallback por nome no Renderer. O comportamento agora é:

```text
allowedModelConfigs 包含目标模型与 reasoning
        |
        v
展示远程配置声明的档位和缺省值

allowedModelConfigs 没有目标模型或 reasoning
        |
        v
不展示 reasoning 选项
```

A mudança não força as tarefas ociosas a se tornarem um Provider do Registry do Registry do Registry; ela garante apenas que o chamador de um Provider execution-scoped não reconstrua um segundo conjunto de fatos de modelo. Os testes acrescentam primeiro um caso de falha de "mesmo sem `allowedModelConfigs`, GLM-5.2 não exibe níveis" e só depois removem o hardcode. Os 38 testes direcionados de opções de UI, Off-Peak Client Config e Runtime Model passaram. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 153. A entrada de refresh de Provider do Root passa para o novo Runtime

O Root chama o mesmo callback de refresh de Provider na inicialização, na migração de Provider Family, na restauração de sessão OAuth, após o login bem-sucedido e após o logout. A seleção de modelos e a página de configurações já migraram para o novo Service, mas essa entrada do Root ainda lia incondicionalmente `IModelProviderService.getAllCached()` e atualizava o Snapshot antigo de Preset, mantendo no novo Host, durante a inicialização e nas mudanças de conta, a cadeia de rede de Catalog / Preset que já foi descontinuada por decisão.

Agora o Root escolhe uma única fronteira de refresh conforme a capacidade da Entry:

```text
新 Host
Root refresh
    |
    v
ProviderSettingsService.refresh()
    |
    +-- Official / Personal Config Source
    +-- Account Provider Source
    `-- Provider Registry

旧 Entry
Root refresh
    |
    v
Legacy ModelProvider Snapshot
```

`cachedOnly` é apenas uma opção de refresh do Snapshot antigo durante a migração. Quando o novo Service existe, o Root usa a barreira de prontidão da Facade e espera o Registry publicar a View da geração atual, sem disparar mais o `getAll*` antigo. Um novo teste unitário confirma que, com o novo Service montado, nenhum dos dois métodos antigos de leitura é chamado; os 45 testes relacionados de OAuth do Root, portão de entrada da inicialização e Snapshot antigo passaram. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 154. A inicialização do novo Runtime para de aquecer o Preset antigo

Depois que a entrada de refresh do Root saiu do Snapshot antigo, `createLocalServices()` continuava chamando `refreshPresetProviders()` em segundo plano de forma incondicional. Portanto, mesmo com o novo Host já montado com Official / Personal / Account Source, a inicialização ainda requisitava o antigo `release/latest` e `client/configs` e modificava o Provider Store antigo. Isso criava requisições de rede duplicadas e mantinha o Preset antigo rodando como fato paralelo fora do novo Registry.

Esta rodada convergiu a fronteira de inicialização para:

```text
已装配 Provider Runtime
    |
    +-- Official Config
    +-- Personal Config
    `-- Account Source
            |
            v
         Registry

未装配 Provider Runtime 的旧 Entry
    |
    v
Legacy Preset 预热
```

A Account Source é responsável pela atualização da disponibilidade da conta; a autenticação de requisições continua sendo obtida pelo Account Request Auth Service a cada requisição, e esta rodada não alterou a lógica de login, de planos ou de credenciais dinâmicas. Um novo teste de integração dos Local Services confirma que, havendo caminho de Official Config, a inicialização não acessa a interface antiga de Preset, preservando ao mesmo tempo a asserção existente de que o desktop-attached remote não aquece o Preset antigo e acrescentando uma cobertura positiva de que a Entry local antiga ainda executa o pré-aquecimento de compatibilidade. Os 12 testes direcionados de Provider Runtime, Config Runtime e Local Services passaram. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 155. O teste de conectividade da página de configurações precisa de uma nova fronteira de execução no Host (adiado)

A projeção permanente de Provider da página de configurações já saiu do Account Secret, mas quando o usuário clica em "testar conexão" a página ainda lê sob demanda o antigo `ModelProviderService.getAllCached()` e entrega Endpoint, API Key, Header e o objeto antigo de Provider completos para a Connectivity Probe antiga, do lado do Renderer. Essa cadeia mantém duas responsabilidades que já saíram dos caminhos principais: o Renderer monta a requisição de modelo e o Snapshot antigo de Provider fornece credenciais de requisição de Account.

As dependências reais de API Provider comum, Coding Plan e Start Plan não são inteiramente iguais:

```text
普通 API Provider
Renderer: providerId + modelId
       |
       v
Host: Registry 静态事实 + Personal API Key -> Connectivity Request

Coding Plan
Renderer: providerId + modelId
       |
       v
Host: Registry 静态事实 + Account Request Auth -> Connectivity Request

Start Plan
Renderer: 交互取得本次一次性安全校验 Header
       |
       | providerId + modelId + 一次性 Header
       v
Host: Registry 静态事实 + Account Request Auth JWT -> Connectivity Request
```

A verificação de segurança da versão oficial depende de interação no nível da página e não pode ser movida diretamente para o Host; por outro lado, JWT, Personal/Team Key, Endpoint, atributos de modelo, Option Specs e reasoningMapping não devem continuar sendo montados pelo Renderer ou pelo Snapshot antigo. A interface de destino deve, portanto, receber apenas `providerId`, `modelId` e o Header opcional desta interação, deixando o Host responsável por todo o restante da resolução e da requisição. Ela não pode continuar recebendo o Provider Config completo, sob pena de o chamador ainda poder contornar o Registry e produzir outro fato de execução.

O que aguardava decisão era a atribuição de serviço dessa operação:

- Estender `IProviderSettingsService.testModelConnectivity()`: conectividade é hoje o único consumidor da página de configurações, o que concentra a interface, mas adiciona uma responsabilidade de execução de rede a uma Settings Facade que deveria cuidar apenas de Config/View.
- Criar um `IProviderConnectivityService` estreito e novo: Settings continua gerenciando apenas configuração, e o Connectivity depende separadamente do Registry, do Account Request Auth e do Adapter de requisição; no futuro o CLI/TUI poderá reutilizá-lo diretamente para uma sondagem explícita, mas isso adiciona um novo Service/RPC.

Independentemente da escolha, `@zcode/provider` continua sem IO; a implementação de execução fica em Services/Host, e o Renderer fica responsável apenas pela obtenção interativa do material de segurança da versão oficial no Start Plan.

A decisão humana é manter o status quo por enquanto no M2. O teste de conectibilidade roda apenas quando o usuário clica explicitamente na página de configurações, e o resultado não modifica o Registry, o Config nem o estado de disponibilidade de modelos; a nova Settings View continua fornecendo protocolo, Endpoint e fatos estáticos de modelo, e o Snapshot antigo apenas complementa sob demanda as credenciais de compatibilidade necessárias para esse teste. Por isso isso não afeta o Agent Loop normal, o Registry do Worker, a seleção de modelos nem o CLI/TUI, e pode ser rebaixado a um tópico independente antes da remoção final do `ModelProviderService` antigo. Nenhum RPC de Connectivity é adicionado agora, e essa dívida técnica local não bloqueia a Remote Provider Authority nem o restante do fechamento do M2.

## 156. A verificação de segurança da versão oficial sai do Snapshot antigo de Provider

O julgamento de segurança da versão oficial no Start Plan, em tempo de requisição, lia antes o Endpoint do Provider antigo via `ModelProviderService.getAllCached()`. Esse julgamento é um fato estático de Provider e não precisa de API Key, JWT ou do Snapshot antigo do Registry.

Agora ele lê uma única origem estática conforme a capacidade da Entry: o novo Provider Runtime lê o `apiFormat/baseURL` do `ProviderSettingsView.effectiveConfig`; somente a Entry antiga sem o Provider Settings Service continua pelo julgamento de compatibilidade com o Legacy Provider Snapshot. Quando o Provider Settings Service existe, um Provider ausente falha diretamente em modo fail-closed, sem recorrer ao Snapshot antigo. A implementação concreta e os testes direcionados ficam a cargo da manutenção da versão oficial; o typecheck de todo o repositório passou e o lint está com 0 error e as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 157. A verificação de segurança da versão oficial remove a dependência fantasma do Registry

A obtenção de material e a preparação de Headers antes do envio na verificação de segurança da versão oficial exigiam que o chamador informasse um `getProviderRegistrySnapshot` que nunca era lido, fazendo o Renderer parecer ainda acoplado ao Registry completo antigo. Esta rodada remove esse parâmetro de contrato não utilizado e mantém apenas a dependência das entradas estáticas de Provider; a entrada de compatibilidade `setProviderRuntimeHeaders`, já descontinuada, teve seu comportamento inalterado. O typecheck de todo o repositório passou e o lint voltou a 0 error com as 35 warnings já existentes. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 158. O accessId de Account passa a ter o escopo da conta conectada

A Account Source gerava antes IDs fixos de tipo de conexão para o Personal Coding Plan e o Start Plan, como `coding-plan:<providerId>`. Depois que a mesma máquina troca de conta conectada, esse ID não muda, e o Usage Cache, o Credential Store, o Account Config e os Models já criados não conseguem distinguir as duas contas.

Esta rodada acrescenta a identidade de conta não sensível depois do ID de conexão de Plan/Team original:

```text
<plan-connection-id>:account:<encoded-account-profile-id>
```

A identidade da conta vem do `id` estável do OAuth Profile, não contém JWT, API Key nem Header dinâmico e também não usa hash de Secret. Quando a mesma conta renova Token ou Runtime Key, o ID permanece o mesmo; ao trocar de conta, o ID precisa mudar. O Team Plan também passa a ter escopo de conta, e as conexões de organização e projeto continuam dentro do ID base original.

Quando um Account Provider já foi julgado como available pelo entitlement, mas a Account Source não consegue obter a identidade da conta, esta rodada opta por fail-closed: a atualização lança um erro e o AccountProviderService existente preserva o last-known-good, em vez de gerar um ID sem escopo que poderia ser reutilizado entre contas. O Request Auth continua aceitando, durante a migração, os IDs antigos sem escopo, para proteger os Models já criados, a Source remota de compatibilidade antiga e as Sessions persistidas; a nova Account Source só gera a forma com escopo de conta. Antes de resolver a Team Key, o sufixo de conta é removido, evitando que Team Keys antigas de dois segmentos identifiquem por engano os campos de conta como organization/project.

Os testes cobrem primeiro a troca de conta, a renovação de credenciais da mesma conta, a ausência de identidade de conta e a Request Auth de Personal/Start/Team, e só então a implementação é modificada. Os 13 testes direcionados de Account Connection, Config Source e Request Auth passaram; a verificação TypeScript dos Services passou. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 159. O Request Auth recusa trocar silenciosamente um Model antigo para uma nova conta

Depois da primeira implementação do `accessId` em nível de conta, a inspeção da autenticação dinâmica continuou e revelou que as requisições de Start/Team ainda liam o Token OAuth atual diretamente pela Provider Family. Se um Model criado pela conta A ainda não terminou e o usuário já está autenticado na conta B, o accessId com escopo do Model antigo continua sendo A, mas a requisição ainda poderia obter o Token de B.

O Account Request Auth agora resolve primeiro a identidade da conta presente no accessId e a compara com o ID estável atual do OAuth Profile; quando a identidade está ausente ou é diferente, ele devolve `AccountRequestCredentialUnavailableError` e não continua lendo API Key, JWT ou Team Key. A renovação de Token da mesma conta não altera o ID do Profile e, por isso, as credenciais mais recentes ainda podem ser obtidas dentro do ciclo de vida do Model. Os accessIds antigos sem escopo de conta pulam essa verificação por enquanto e servem apenas a Models já criados e a Sources antigas do período de migração; a nova Account Source já garante, pela seção 158, que essa forma não será mais gerada.

Os novos testes reproduzem primeiro "o Model da conta A lê a Personal Key da conta B" e depois fixam o comportamento de recusa. Os 41 testes direcionados de Request Auth, Host Runtime Header, Workspace Header e OffPeak passaram; a verificação TypeScript dos Services passou. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.
## 160. Usage / Entitlement usa Account Access como autoridade da requisição

Embora Usage, Entitlement, Coding Plan Usage e a redefinição de planos já tenham uma fonte concreta escolhida pela UI, o Host ainda relia `ModelProviderService.getAllCached()`, procurava o Provider no antigo `ModelProviderConfig[]`, verificava se estava habilitado, lia a API Key e, no cenário de Team Plan, criava ou copiava a Key do projeto por conta própria. Existiam assim duas identidades de origem para a mesma requisição: a conexão de conta escolhida pela UI e a conexão que a camada de Usage voltava a adivinhar a partir do array antigo de Providers.

Esta rodada convergiu a fronteira de requisição para:

```text
Provider Settings / Usage Source
├─ providerId
├─ accessId
├─ organizationId?
└─ projectId?
        |
        v
Usage / Entitlement / Reset Request
        |
        v
Account Request Auth
├─ 校验 accessId 属于当前登录账号
├─ Personal Coding Plan -> Account Credential Store
├─ Team Plan            -> Team Key Resolver
└─ Start Plan           -> 当前 ZCode JWT
        |
        v
Usage API
```

`BigModelUsageQuotaProvider` removeu a dependência direta do antigo `IModelProviderService` e deixou de ser responsável por criar a Team API Key. A obtenção e o cache da Team Key ficam unificados no Account Request Auth; o Usage consome apenas o material de requisição correspondente a esta conexão. A redefinição de planos também valida primeiro a identidade de conta de `providerId + accessId` e só então lê o ZCode JWT da conta atual e o OAuth JWT da Provider Family correspondente.

O Protocolo Shared acrescenta o `accessId` obrigatório ao Coding Plan Usage e ao Reset; as requisições de Entitlement e de Usage genérico o mantêm opcional na interface de compatibilidade, mas todas as chamadas de produção de Account Provider o obtêm da `ProviderSettingsView` e o repassam. O cache de requisições da UI, a combinação de requisições in-flight, o Reset Coordinator e o estado de reprodução automática também incluem o `accessId` em sua chave, evitando que contas diferentes ou conexões Personal/Team do mesmo Provider compartilhem resultados.

A conclusão do login OAuth e a restauração da inicialização são entradas independentes de requisição de entitlement. Elas agora atualizam primeiro a Provider Settings View, obtêm o `accessId` de Coding Plan e Start Plan a partir do Account Config mais recente e só então leem o Entitlement; não interpreta mais uma conta já autenticada como não configurada só porque o novo serviço recusa requisições sem identidade.

O monitor usage de API Providers comuns não tem hoje consumidor de produção, e o ponto de injeção estreito `resolveApiAuthorization` é mantido para que a autorização venha depois do novo Effective API Provider Config, sem restaurar a seleção pelo array antigo de Providers. O Account Credential Store ainda pode executar a importação única de Key antiga por dentro; essa importação é a entrada de migração da saída da Config antiga e, depois de bem-sucedida, apenas as novas chaves de credencial em nível de conta são lidas.

Os 274 testes direcionados de Provider, Services e UI passaram; as verificações TypeScript de Provider, Shared, Services e UI passaram. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 161. O Environment remoto estabelece seu próprio Provider Runtime

Ao examinar a cadeia de inicialização real do desktop-attached remote, viu-se que, embora o novo Config/Registry já pudesse ser montado nos Services, o `zcode-server.cjs` remoto não carregava o Official Config. Por isso `createStdioServices()` não conseguia criar um Provider Runtime, e a execução real ainda dependia do Desktop Renderer empurrar para o remoto o Registry completo local e o `runtimeModel`.

Esta rodada completa primeiro a fonte de verdade do remoto. O build do Server remoto embute o `config/provider/official.json` único do repositório; na inicialização o arquivo é materializado por hash de conteúdo como um arquivo de versão imutável e o caminho é entregue ao `createLocalServices()` remoto. O Personal Config continua lendo o diretório do usuário remoto e a Account Source continua lendo a conta e o Credential Store remotos. Um arquivo de versão nova não sobrescreve o arquivo em uso por processos antigos, e a mesma versão é reutilizada diretamente.

A montagem do Host remoto migrou em seguida para o seu próprio Provider Runtime: o estado de prontidão de modelos, o Account Config e o catálogo de modelos do Repo Wiki passam a ler o Registry remoto, e o antigo `LegacyAccountProviderConfigSource` deixa de participar da raiz de composição remota. O conjunto de serviços de remote workspace do Desktop também passa a encaminhar diretamente o `ModelSelectionService` e o `ProviderSettingsService` remotos, de modo que a seleção de modelos e a view de configurações começam a obedecer ao Environment alvo, e não ao Provider local do Desktop.

Nos caminhos quentes de negócio, o SessionPane removeu a lógica de recuperação que empurrava o Registry antes do envio e injetava o `runtimeModel` do Desktop após `provider.notInRegistry`; o pré-aquecimento do Repo Wiki também passa a submeter apenas `ModelSelection`. Quando o Provider é recusado pelo Environment alvo, o chamador preserva essa recusa e deixa a correção para os Config/Account Facts remotos, sem sobrescrever com outro conjunto de fatos.

Esta fatia ainda não removeu as entradas completas de sincronização de Registry restantes na recuperação de conexão, no salvamento antigo das configurações e no caminho do Bot; elas continuam listadas como alvos de limpeza posteriores e não podem ser vistas como um novo contrato de compatibilidade. Os 71 testes direcionados de Server, Services, Desktop, Client e UI passaram, a verificação TypeScript dos pacotes relacionados passou e o build do bundle de arquivo único do remoto passou. O pre-push completo fica para uma execução concentrada posterior, conforme a convenção.

## 162. O Desktop sai da injeção de Registry e Runtime Model remotos

Com o Provider Runtime remoto pronto, o Desktop ainda tinha quatro escritas legadas: sincronizar o Registry completo ao abrir ou reconectar um remote workspace; transmitir o Registry a todos os workspaces depois de salvar ou excluir nas configurações; sincronizar o Registry depois que o Bot obtém a porta remota de runtime; e fazer o Renderer resolver e enviar o `runtimeModel` no pré-aquecimento de rascunhos. Elas faziam a mesma execução remota ficar controlada ao mesmo tempo pelos fatos remotos e pelo Snapshot do Desktop, e faziam uma modificação local de Provider alterar silenciosamente outro Environment.

Esta rodada removeu essas cadeias de produção. Ao conectar um remote workspace e um Bot remoto, o código passa a ler o `ModelSelectionService.getView()` remoto e usá-lo como verificação de que a Facade remota de Providers já está pronta; uma verificação falha significa não armazenar nem expor um runtime meio inicializado. O salvamento das configurações escreve somente o Personal Config, e o Registry é atualizado pelo Config Source de cada Environment. O pré-aquecimento de rascunhos continua submetendo a Config inicial da Session, que contém apenas escolhas do usuário como provider, model e thought; o remoto cria o Model a partir do Registry atual na sua própria etapa de tratamento de comando.

O `/model` do Bot também passa a submeter apenas `modelRef` quando existe a nova Facade de Model Selection. `updateProviderRegistry` é mantido apenas para as Entries antigas que ainda não montaram a Facade, e a identidade remota deixa de disparar esse ramo de compatibilidade. O protocolo antigo e o cache de Snapshot interno do Agent serão removidos em conjunto depois que todas as Entries antigas usarem o Provider Runtime, e esta rodada não amarra a remoção do protocolo à troca da autoridade remota em uma única mudança de alto risco.

O módulo de sincronização de UI removido continha estado de revision/pending, a enumeração de targets de workspace e a transmissão do Registry do Desktop, e com ele três conjuntos de estado paralelo saíram de cena. O Remote Bot Runtime ganhou um proxy da Facade de Model Selection e continua reutilizando o conjunto de serviços MessagePort existente. Os 191 testes direcionados de Services e UI passaram, a verificação TypeScript dos dois pacotes passou e o pre-push completo continua adiado conforme a convenção.

## 163. O protocolo antigo de Registry para de receber escrita de produção; a remoção do protocolo e a migração de fixtures ficam separadas

Depois que as chamadas de produção de Desktop, Remote UI e Bot saíram, `workspace/updateProviderRegistry` já não tem chamador com Provider Runtime. Ao tentar remover o protocolo, ficou claro que muitos testes existentes — a recuperação a frio da CLI, a projection do V4, os runtime headers e os limites de modelos — ainda o usavam para montar fixtures antigas do catálogo de workspace; removê-lo diretamente mudaria ao mesmo tempo a preparação desses testes, sem permitir distinguir se a falha vem da saída do protocolo ou da mudança do comportamento testado.

Esta rodada optou por cortar primeiro o fluxo de fatos, sem remover a casca do protocolo no mesmo commit. O último ramo legacy de `/model` do Bot foi removido; tanto local quanto remotamente apenas `modelRef` é submetido. O Repo Wiki também removeu o espelho do Registry de workspace e lê apenas a Model Selection View do Environment atual; uma Entry antiga sem o novo Runtime montado ainda pode ler sua própria legacy source, mas não pode mais receber um espelho de outro Environment.

O Core Worker gerenciado pelo Host remoto agora recebe o Account Config do Environment atual, assim como o Host local. Antes, o código pulava a sincronização de Account Config apenas com base em `workspaceIdentity` ser SSH/WSL — uma condição herdada da época da injeção pelo Desktop que impedia que um Remote Host, que já tem fatos de conta próprios, entregasse o próprio Account Overlay ao Worker. Esta rodada remove essa condição. Ela continua sendo uma sincronização de Config de Host para Worker dentro do mesmo Environment, e não uma injeção entre Environments do Desktop para o remoto.

A remoção final do protocolo em si será feita junto com a migração dos fixtures de teste da CLI para Official/Personal/Account Source. Nesse momento, o Shared Schema, os métodos de Session/Agent Service, os handlers da CLI, a marca de revision de snapshot do catálogo de workspace e os testes correspondentes serão limpos em conjunto, evitando deixar um estado de meia remoção sem cobertura. Os 125 testes direcionados de Services relacionados e a verificação TypeScript de todo o repositório passaram; o lint permanece com 0 error e voltou às 35 warnings já existentes depois da remoção dos imports descontinuados nesta rodada.

## 164. O App remoto fica proibido de recorrer ao Workspace Registry Snapshot

O processo remoto já estabeleceu seus próprios Config Official, Personal e Account e seu Registry, mas a Entry do protocolo ainda escolhia explicitamente `legacy-snapshot` ao criar o App remoto. Isso continuava montando a fonte de compatibilidade do overlay antigo de workspace e, mesmo com o escritor do Desktop já removido, mantinha a entrada capaz de trazer de volta ao ciclo de execução um Snapshot entre Environments.

Esta rodada convergiu a regra da raiz de composição "o Registry de processo já está pronto" em uma única função: seja o processo servindo um Workspace local do Desktop ou um Environment remoto como SSH, WSL ou Docker, a criação do App injeta o Registry do próprio processo e fixa o uso de `registry-only`. A expressão de runtime fica, portanto, unificada:

```text
当前 Environment 的 Official + Personal + Account Config
                         |
                         v
                 Process Registry
                         |
                         v
                 App Model Runtime
```

Os Providers temporários do Turn continuam sendo injetados pela execution-scoped source, não pertencem ao workspace snapshot e não são afetados por essa remoção. As Entries manuais antigas sem Registry de processo montado mantêm o comportamento original; o tipo `legacy-snapshot` e os fixtures de teste são mantidos por enquanto, aguardando a saída conjunta do protocolo antigo e do fixture de catálogo de workspace. Depois que o staging passou a tratar a capacidade de mídia de compatibilidade como opcional, a verificação de integridade do Registry também estreitou os tipos de retorno internos, garantindo que a projeção de execução continue obtendo valores booleanos definidos para imagem, PDF e vídeo. Os 13 testes em 3 arquivos relacionados ao Bootstrap e a verificação de tipos passaram; o lint de todo o repositório permanece com 0 error e 35 warnings já existentes.

## 165. A recuperação a frio usa o Registry de processo para julgar a prontidão de modelos

Depois que o App remoto passou a usar `registry-only`, a auditoria da recuperação a frio descobriu que a materialização de Session ainda decidia a disponibilidade de modelos históricos apenas pelo antigo `workspaceModelCatalogs`. Mesmo com o Environment remoto já tendo iniciado o Registry de processo a partir do próprio Config, desde que o Desktop não tivesse enviado o Snapshot antigo, essa decisão escolheria um adapter deferred e anexaria um `restoreWarning` à Session; depois disso, o envio do usuário poderia ser recusado indevidamente.

O Protocol Server agora registra explicitamente se o processo atual já estabeleceu um Provider Registry. O ramo de compatibilidade da recuperação a frio ficou:

```text
已有 Process Registry
└─ 直接由当前 Environment Registry 恢复

没有 Process Registry
├─ workspace compatibility target 存在 -> 使用该 target
└─ target 不存在                         -> deferred adapter + restoreWarning
```

Esse fato booleano apenas descreve se a raiz de composição já montou o novo Registry; ele não transporta dados de Provider e não cria uma nova fonte da verdade de modelos. O comportamento das Entries manuais antigas do Protocolo permanece inalterado; Desktop, Remote Worker, Prompt CLI e TUI, ao montarem o Registry, não esperam mais o workspace snapshot. Um novo teste de integração de recuperação a frio cobre simultaneamente a restauração direta pelo novo Registry e a semântica de restoreWarning da Entry antiga; os 40 testes em 3 arquivos relacionados ao Bootstrap e a verificação de tipos passaram.

## 166. O Provider Config Schema converge para Access, API e Model API Adapter

Até aqui o Provider Config espalhava `apiKey`, `accessId`, `apiFormat`, `baseURL`, Headers e o mapeamento de raciocínio do modelo na mesma camada, obrigando o chamador a adivinhar por combinação de campos se aquilo descrevia identidade de acesso, protocolo de requisição ou comportamento de adaptação do modelo. Depois que o Account Provider entrou no Overlay, essa estrutura ainda permitia que as três configurações — Official, Personal e Account — expressassem o mesmo fato de maneiras diferentes.

Esta rodada atualiza o documento de configuração para o Schema v5 e agrupa os campos conforme sua responsabilidade real:

```text
Provider Config
├─ access
│  ├─ api-key
│  └─ zhipu-account
├─ api
│  ├─ type
│  ├─ baseURL
│  └─ headers
└─ models
   └─ Model Config
      └─ apiAdapter
         ├─ reasoningMapping
         ├─ preserveThinking
         └─ reasoningContentField
```

Official, Personal e Account Access continuam usando a mesma Overlay de `ProviderConfig`. A configuração descreve apenas os fatos que a origem atual domina; credenciais dinâmicas de requisição continuam sendo obtidas pela cadeia de execução no momento da requisição e não entram nos fatos estáticos de modelo do Registry. O `ModelConfigRule` também converge `apiFormatMatch` para `apiMatch`, permitindo que os atributos comuns de um modelo e as regras de adaptação sob diferentes protocolos de API se sobreponham em camadas.

Os documentos antigos em v4 são convertidos para v5 por uma única entrada de migração: os campos planos do Provider vão para `access` e `api`, e o `reasoningMapping` de nível de modelo vai para `apiAdapter`. O arquivo de configuração Official também passa a usar o novo formato, e os chamadores de produção não leem mais os campos antigos.

Ao implementar a projeção diferencial da configuração Personal, descobriu-se que, se `access`, `api` ou `apiAdapter` fossem salvos como um único campo comum, modificar apenas a API Key copiaria também para o Personal o endereço de gerenciamento atual do Official; depois disso, uma atualização do Official nesse endereço deixaria de ter efeito. Por isso a projeção diferencial compara recursivamente os campos diretos desses Overlays aninhados e salva apenas os campos que o usuário realmente alterou. A importação do Personal Config antigo também reutiliza esse caminho de projeção e não faz mais um cálculo diferencial de nível superior antes.

Os testes direcionados de Provider (72), Provider Node (10), Services (69), Bootstrap (39) e UI passaram; a verificação TypeScript e o lint de todo o repositório passaram, com o lint em 35 warnings já existentes e 0 error. A suíte completa de UI ainda tem 2 falhas existentes de Composer Continuity Mock sem `modelSelectionService.onDidChange`; a suíte completa do Bootstrap ainda inclui falhas de baseline existentes de ambiente e Session Lifecycle. Esta fatia não modificou essas cadeias, e os testes direcionados já cobrem todos os chamadores de produção do Schema v5.

## 167. O Personal Config passa para o primeiro Schema formal, no lugar

O Provider Config ainda não tinha sido formalmente publicado, e os v1-v5 dos últimos cortes eram apenas numerações intermediárias do desenvolvimento. Manter essas etapas de migração congelaria um histórico nunca lançado como um fardo de compatibilidade de longo prazo. Esta rodada define a estrutura final de `access`, `api` e `models.apiAdapter` como o primeiro `schemaVersion: 1` formal e remove as migrações de versão embutidas do período de desenvolvimento; quando um v2 real for publicado, será acrescentada uma migração explícita de v1 para v2.

O Personal Provider Config continua usando o `~/.zcode/v2/config.json` existente e não cria um segundo `provider-config.json`. Na primeira leitura de um arquivo antigo sem `schemaVersion`, a Entry injeta o conversor do formato antigo, grava primeiro no mesmo diretório um backup de conteúdo idêntico que não sobrescreve um arquivo já existente e só então grava atomicamente o novo documento v1:

```text
读取旧 config.json
        |
        v
创建 config.json.pre-provider-v1-<sha256>.bak
        |
        v
Entry 转换旧格式 -> Provider Config v1
        |
        v
原子替换 config.json
```

Se a criação do backup, a conversão do formato antigo ou a presença do conversor falhar, o arquivo original permanece inalterado e a parte que inicia recebe um erro explícito. O nome do backup contém o SHA-256 completo do conteúdo original; a migração repetida do mesmo conteúdo pode reaproveitar o backup existente e conteúdos diferentes não sobrescrevem o backup antigo. A CLI/TUI Standalone e o Host/Worker usam o mesmo caminho padrão, mas cada Entry continua responsável por injetar sua própria forma de ler o formato antigo.

Ao salvar, excluir um Provider, atualizar a API Key e reordenar modelos, a nova cadeia de configurações escreve somente o novo Personal Config e não espelha mais nada no `ModelProviderService` antigo. Chamadas de compatibilidade ainda não migradas, como a atualização de conta, ainda podem passar pelo serviço antigo e por isso a camada de armazenamento antiga ganha uma proteção de posse: ao descobrir que o arquivo de destino já é um Provider Config v1 formal, ela recusa a escrita e impede que uma estrutura antiga sobrescreva a nova fonte da verdade. Essa proteção serve apenas ao período de migração; depois que a cadeia de conta for integrada à Account Config Source, a implementação antiga de armazenamento de Providers é removida por completo.

Os testes de Provider (69), Provider Node (12), Services e UI direcionados (36), Bootstrap (14) e de caminho da CLI (4) passaram; a verificação TypeScript de todo o repositório passou e o lint mantém as 35 warnings já existentes com 0 error. As suítes completas de Bootstrap/CLI disparadas por engano ainda expõem problemas existentes de MCP, Session, Telemetry, recursos SEA e limpeza de testes, e nenhum deles está na cadeia modificada por esta fatia.

## 168. A Account Source obtém diretamente as credenciais de Coding Plan em nível de conta

O novo Registry já usa a Overlay de Account Config para expressar os Providers de conta, mas o login, a restauração da inicialização, a conclusão da compra e o logout ainda chamavam o antigo `ModelProviderService.refreshCodingPlanApiKey()`. Além de gravar no Provider Store antigo, esse método escondia uma responsabilidade necessária: usar o Access Token OAuth atual para criar ou copiar a Personal Coding Plan API Key na interface de negócio. Remover a chamada diretamente faria com que uma conta recém-autenticada não conseguisse entrar no Registry de Coding Plan.

Esta rodada convergiu essa responsabilidade no `AccountProviderCredentialService`. Ele lê e salva credenciais pelo `accessId` de nível de conta; quando o cache está ausente, usa o Token OAuth atual para chamar a implementação existente de resolução de Key de negócio e combina requisições concorrentes da mesma conexão de conta:

```text
providerId + accountIdentity
        |
        v
scoped coding-plan accessId
        |
        +-- Credential Store 命中 -> 返回
        |
        `-- 未命中 -> OAuth Token -> 业务 Key 接口 -> 保存 -> 返回
```

A Account Source obtém primeiro a identidade da conta atual antes de consultar o entitlement do Coding Plan e só então obtém a Key por essa identidade; o Account Config publicado e o Credential Store de tempo de requisição usam, portanto, o mesmo `accessId` com escopo. A autenticação de requisições de Model não relê mais o Provider Store antigo. O callback OAuth força explicitamente a atualização da Key da conta, enquanto a restauração normal da inicialização continua reaproveitando o cache; várias atualizações de Provider dentro do mesmo callback OAuth compartilham a mesma Promise, evitando copiar a Key de novo para Start/Coding e para o selectedKey final.

Sob o novo Provider Runtime, a restauração da inicialização, o callback de login, as mudanças de autenticação na página de configurações e a conclusão da compra atualizam apenas a Account Source. O logout primeiro limpa as Keys antigas sem escopo de conta do período de migração e depois atualiza diretamente a Account Source; a Account Source publica um resultado indisponível depois que a identidade da conta desaparece. Os antigos `refreshCodingPlanApiKey` e `clearCodingPlanApiKey` ficam apenas para as Entries de compatibilidade sem o Provider Runtime montado. O novo Runtime também para de assinar os eventos de Account Facts do antigo `ModelProviderService`: as configurações de conta são dirigidas pela invalidação de Settings, e o login, o logout e a compra são atualizados ativamente pelos respectivos fluxos de negócio.

A implementação HTTP da Key de negócio remota reaproveita por enquanto o método de resolução de Key sem estado de `OAuthPresetProviderRepoProviderResolvers`; ele não lê o Provider Config antigo nem o Registry. Ao remover o Preset Repo antigo, esse método deve ser movido para o domínio de credenciais de conta, mantendo o contrato atual do Service inalterado. Os 345 testes em 12 arquivos de teste direcionados de Provider, Services e UI passaram; a verificação TypeScript de todo o repositório passou e o lint mantém as 35 warnings já existentes com 0 error.

## 169. O Registry de processo recusa escritas antigas de Workspace Provider

O Worker de produção já constrói o Registry no início do processo a partir do Official, Personal e Account Config do Environment ao qual pertence, mas o protocolo e os Host Services ainda mantêm `workspace/updateProviderRegistry`, `workspace/upsertModelProvider` e `workspace/removeModelProvider`. Esses métodos já não têm chamadores de produção e ainda permitem que um Snapshot antigo do Host ou uma escrita em nível de workspace reestabeleçam um segundo conjunto de fatos de Provider.

Esta rodada fecha primeiro essas três comandos antigos na fronteira de composição do Registry de processo: assim que o Worker tem um Registry de processo montado, o protocolo devolve uniformemente `Method not found`. Os três grupos de métodos, parâmetros e tipos de retorno expostos por `IZCodeAgentService` e `IZCodeSessionService` são removidos, de modo que o Host, o proxy de Services remoto e o Renderer deixam de ter a interface estática para chamar o antigo protocolo de escrita. As Entries manuais de teste sem o novo Registry montado mantêm por enquanto os handlers antigos, para que a remoção completa do Schema e da implementação do protocolo seja feita na sequência, depois que os fixtures de teste forem migrados para o novo Registry.

O teste de montagem stdio remoto também mudou de "iniciar depois que o Desktop empurra um Snapshot de Provider" para "iniciar depois que o Environment remoto constrói a Selection View a partir do próprio Official Config". O teste passa a cobrir diretamente a primeira fonte de verdade remota já decidida: o Desktop apenas dispara a operação remota e não transmite configuração de Provider nem credenciais.

Os novos testes de fronteira do protocolo cobrem a indisponibilidade desses três comandos antigos no modo de Registry de produção; os 17 testes do Session Service, o teste de montagem stdio remoto e os testes direcionados do Bootstrap passaram, e a verificação TypeScript de todo o repositório passou. A remoção completa do Schema do protocolo, dos campos antigos de Workspace Provider e dos fixtures de teste correspondentes continua avançando como a próxima fatia.
## 170. Remover o fallback em memória do Snapshot de Provider do Desktop no remoto

Depois que o slice anterior removeu as entradas de escrita do Host, o `providerRegistryByWorkspaceKey` no `ZCodeAgentService` já havia perdido seu único ponto de escrita, mas a resolução de modelos, a prontidão de inicialização e o tratamento de Headers em tempo de requisição ainda mantinham ramos de leitura. Esses ramos nunca podem ser atingidos em runtime e ao mesmo tempo continuam expressando a arquitetura obsoleta de "o remoto pode recorrer ao Snapshot empurrado pelo Desktop".

Esta rodada removeu o Map, a lógica de limpeza de ciclo de vida e os três ramos de fallback. Alvos remotos como SSH/WSL e alvos locais seguem agora a mesma regra:

```text
所属 Environment 的 Config 与 Account Access
                    |
                    v
             进程 Provider Registry
                    |
          +---------+---------+
          |                   |
          v                   v
   Runtime Model 解析       启动就绪判断
```

A autenticação dinâmica de requisições continua sendo fornecida pelo Account Service de tempo de requisição e pela resposta interativa, e é devolvida como o `requestAuth` desta requisição. Sem um Registry de processo, os Providers não são mais reconstruídos a partir do cache de Session nem do Snapshot do Desktop; isso mantém separados os "fatos estáticos de modelo" do "material de autenticação de tempo de requisição" e evita que uma segunda fonte da verdade reapareça no remoto.

As três antigas pruebas SSH que verificavam o Registry empurrado passaram a verificar o Registry de processo, e o teste de Header dinâmico sem cache de Runtime Model passou a verificar que apenas o auth com escopo de requisição é devolvido, sem reescrever o Runtime Model da Session. As três pruebas direcionadas e a verificação TypeScript de todo o repositório passaram.

## 171. Completar a evidência da fronteira de Config de Environment entre Remote Host e Worker

Ao verificar mais a fundo a montagem de produção remota, confirmou-se que o Remote Host injeta os próprios caminhos remotos de Official Config e Personal Config toda vez que inicia um Worker. O Worker reconstrói então o Registry a partir dessas duas Config e da Account Source remota; o Desktop não participa da transmissão de fatos de Provider nem de autenticação. Os dois comentários que ainda descreviam "o Desktop reenvia o Registry" foram corrigidas para a arquitetura atual.

Um novo teste do Process Manager observa diretamente o ambiente do subprocesso e cobre os dois caminhos de Provider Config — Official e Personal — realmente entrando no Worker. Esse teste preenche a lacuna que existia entre "o Remote Host consegue construir o Registry" e "o Remote Worker realmente lê a Config da mesma origem".

Ao tentar desativar imediatamente `workspace/upsertModelProvider` e `workspace/removeModelProvider` em todas as Entries, a suíte completa de protocolo expôs 28 testes antigos que dependem diretamente desse protocolo. A maior parte verifica a síntese de hardcode de reasoning que será substituída pelas Official Model Config Rules, e alguns ainda verificam a semântica de modelo padrão e de nível de raciocínio da Session. Esta rodada não forçou o fechamento apagando testes em massa; o Registry de produção continua recusando as três escritas antigas na fronteira do protocolo. Primeiro os valores de semântica de Session serão migrados para testes do Registry de processo e, em seguida, o protocolo, os hardcodes antigos de reasoning, o Schema e os handlers serão removidos em conjunto.

## 172. O modo Registry corta os fatos antigos de modelo da CLI e do Workspace

Depois que o Registry de processo foi montado, o `model`, o `modelCatalog` e o Workspace Catalog do CLI Config antigo ainda podiam entrar na execução de modelos por `bootstrapModelConfig`, pelo fallback de capability de runtime e pela workspace compatibility source. Esses caminhos já não são a entrada principal de montagem, mas ainda permitem que um arquivo antigo ou um Snapshot antigo de Workspace sobrescreva atributos de modelo, Options e roteamento de Provider presentes no Registry.

Esta rodada convergiu a fronteira para:

```text
旧 CLI Runtime Config
├─ MCP / Hooks / Permission 等尚未迁移领域 -> 暂时继续使用
└─ Provider / Model / Model Catalog         -> Registry 模式不再进入执行

Workspace Catalog
└─ Registry 模式不再生成 bootstrapModelConfig

Turn Temporary Provider
└─ 继续通过 execution-scoped Model Source 注入
```

`workspaceProviderCompatibilityMode`, a workspace compatibility source e sua lógica de mesclagem com o Registry foram removidos. Um Provider que não existe no Registry agora devolve diretamente `ProviderNotFound`; somente um Provider temporário explicitamente carregado pelo Turn atual pode complementar o Registry dentro do escopo da execução. Prompt CLI, TUI e Protocol Worker usam todos a mesma regra e não precisam mais que a Entry escolha um modo de compatibilidade.

Ao mesmo tempo foi corrigido um vazamento de prioridade: antes, mesmo recebendo um Registry de processo, o `bootstrapModelConfig` ainda podia ter prioridade sobre o runtime inicializado pelo Registry. Agora o modo Registry ignora completamente essa configuração antiga de modelos, e context window, max output, capacidades de mídia de entrada e reasoning options vêm apenas do Registry e do Overlay execution-scoped atual.

Os 208 testes em 6 arquivos de teste direcionados do Bootstrap e os 2 testes de ciclo de vida do Registry de processo do Prompt CLI/TUI passaram. As verificações TypeScript do Bootstrap e da CLI passaram; antes da verificação da CLI, os Shared Types e os artefatos do Bootstrap são reconstruídos para evitar falsas falhas causadas por declarações antigas em `dist`. O lint de todo o repositório mantém as 35 warnings já existentes, com 0 error.

## 173. O Child Runtime de Workflow reutiliza o Adapter do Registry

Ao continuar auditando a leitura do CLI Config antigo, descobriu-se que o App principal já cria o ModelFactory e o Adapter a partir do Registry de processo, mas os Child Runtimes do Expert Workflow e do Script Workflow ainda chamavam `createModelAdapter()` por conta própria. No modo Registry, esses runtimes filhos não têm o antigo `RuntimeModelConfig`, de modo que `createModelAdapter()` acabava lendo `~/.zcode/cli/config.json` e trazia de volta para o processo os fatos antigos de Provider e Model que já haviam saído do caminho principal.

Agora os dois tipos de Child Runtime de Workflow reutilizam diretamente o Adapter já montado pelo App principal:

```text
Process Registry
      |
      v
App ModelFactory + Adapter
      |
      +-- Main Agent
      +-- Expert Workflow Child
      `-- Script Workflow Child
```

Cada Child Loop ainda cria e mantém seu próprio Model execution-scoped pelo ModelFactory; o Adapter compartilhado reaproveita apenas a infraestrutura de execução do protocolo de Provider e não faz Loops diferentes compartilharem uma seleção de modelos mutável. Depois que as entradas duplicadas de Model Catalog, Model Config, Endpoint Routing e Model Logger foram removidas da montagem de Workflow, o código de produção do Bootstrap tem apenas uma chamada de `createModelAdapter()`, no App principal.

Os testes de regressão observaram primeiro que um Expert Workflow criava 8 Adapters duplicados; após a mudança, todo o ciclo de vida do App cria apenas 1. Os 12 testes de Provider Registry App Runtime e Script Workflow e a verificação TypeScript do Bootstrap passaram.

## 174. Os testes de recuperação a frio saem do protocolo de escrita de Workspace Provider

Os testes de integração de `v4-cold-resume` chamavam `workspace/updateProviderRegistry` antes de cada recuperação. O que esses testes realmente verificam é a recuperação a frio, a materialização do persistido, o usage, o thought, a identidade de workspace remoto e a admissão de comandos após a recuperação; o RPC antigo servia apenas como um fixture de teste que tornava temporariamente "disponível" o modelo escolhido pela Session histórica.

Esta rodada transformou o fixture em uma fonte de fatos de nível de processo isomórfica à produção: o teste inicia um `ProviderRegistry`, injetado pelo App Factory do Server em cada App recuperado. A context window e os níveis de reasoning do modelo vêm diretamente do Registry. Exceto pelo teste de compatibilidade mantido de propósito, que cobre o aviso de restauração da versão antiga sem Registry de processo, nenhum Provider é mais escrito no Workspace.

O teste `provider-registry-context-window-sync` foi removido junto. Ele verificava que uma atualização antiga do Workspace Registry reescrevia imediatamente os limites de context/output de uma Session em execução; isso conflita com o ciclo de vida já confirmado: um Model já criado permanece inalterado durante sua execução contínua, e uma atualização do Registry afeta apenas os Models criados depois. Esse ciclo de vida já é coberto pelo teste "Registry só substitui a configuração de execução subsequente" em `provider-registry-model-runtime`.

Os 32 testes migrados de `v4-cold-resume` passaram todos. O próximo passo pode remover, preservando a evidência de comportamento de produto, os testes históricos de `zcode-protocol.test` que verificavam a escrita antiga de Workspace Provider e a inferência de reasoning por nome de modelo.

## 175. Remover o Workspace Provider Writer do lado do Agent

Depois da migração da recuperação a frio, o lado do Agent ainda mantinha três handlers de protocolo capazes de reconstruir o catálogo de Workspace Providers:

```text
workspace/updateProviderRegistry
workspace/upsertModelProvider
workspace/removeModelProvider
```

Esses handlers mantêm um Map de Providers separado, secrets, revisions, marcas de água, diferenças de capacidade de modelos e atualização a quente de sessions ativas. Mesmo que o modo Registry de produção já recuse as chamadas, testes ou Entries embutidas sem o Registry habilitado ainda podem usá-los, de modo que a fonte da verdade antiga não saiu de fato.

Esta rodada migrou primeiro o teste de App temporário de `workspace/generateText`, que ainda tinha valor, para o Registry de processo, e corrigiu a montagem de produção: no modo Registry, a Entry injeta o Registry/Adapter pelo seu App Factory, sem criar um Workspace deferred Adapter adicional que leria o CLI Config antigo e sem sincronizar o Workspace Catalog. Em seguida as três handlers e suas implementações de produção foram removidas. Qualquer Entry que chame os métodos antigos agora recebe uniformemente `Method not found` em JSON-RPC.

Com a remoção do writer antigo, 37 casos históricos saíram do teste principal do protocolo. Eles cobravam temporização de Workspace Snapshot, alteração a quente de session ativa e síntese de parâmetros de reasoning por nome de Provider/Model; esses comportamentos foram substituídos pelo novo Config Resolver, pelo ciclo de vida do Registry e pelo reasoning mapping do Model Config. Recuperação a frio de Session, seleção de modelos e liberação de App temporário continuam preservados nos testes da nova fonte da verdade.

Os 115 testes restantes de `zcode-protocol.test` passaram todos. O Schema/constantes do protocolo Shared e os testes históricos de push do Host nos Services ainda aguardam remoção sincronizada na próxima fatia; mantê-los por enquanto não reabre os handlers do Agent.

## 176. Remover o protocolo antigo de Provider Writer de Host para Agent

Depois da remoção dos handlers do Agent, o Shared ainda exportava as constantes de método, o Schema de parâmetros e o Schema de resultado das três escritas antigas de Workspace writer, e os fakes de agent nos testes dos Services continuavam devolvendo respostas de sucesso para elas. Esse andaime mascararia uma regressão em que o código de produção volta a enviar os RPCs antigos.

Esta rodada removeu as declarações do protocolo writer no Shared e as entradas de escrita no Dev Docs, e limpou os casos `service.updateProviderRegistry()` já sem efeito nos testes dos Services. O fake agent não aceita mais o writer antigo; as strings restantes servem apenas para afirmar que o Host não enviou esses métodos, e os testes de protocolo do Bootstrap afirmam explicitamente que os métodos antigos devolvem `Method not found`.

`ZCodeProviderRegistrySnapshot` é mantido por enquanto. Ele ainda é a estrutura de dados de compatibilidade usada pela seleção de modelos do Host, pela autenticação de requisições e pela projeção de Runtime Model durante a migração, e já não tem a capacidade de escrever fatos de Provider no Workspace do Agent. Ele deve ser substituído item a item conforme as Views de Config/Registry convergirem, e não ser removido por conta própria nesta fatia.

Os 184 testes do protocolo Shared, Provider Registry dos Services, Runtime Headers, Repo Wiki Lane, suíte principal dos Services e testes do V4 passaram; a verificação TypeScript de todo o repositório passou.

## 177. Completar o Registry de processo do HTTP Server e do Standalone Server Core

Após auditar todas as Entries de produção, descobriu-se que Desktop, Remote stdio, Prompt CLI e TUI já forneciam Official Config, mas a Entry HTTP de `packages/server` e o Standalone Server Core de `zcode-server-cli` ainda chamavam `createLocalServices()` diretamente. Essas duas entradas, portanto, não criavam um Provider Runtime e caíam no antigo `ModelProviderService`.

Esta rodada convergiu a capacidade de materializar a versão de conteúdo do Official Config em `@zcode/provider-node`: no build, o `config/provider/official.json` único é embutido no artefato do Server; na inicialização, ele é gravado por hash de conteúdo no diretório `config/provider` do runtime do Server ao qual pertence, e o caminho do arquivo de versão é passado explicitamente aos Services. Conteúdo igual reaproveita o mesmo caminho; conteúdo diferente gera um caminho novo, e um processo já iniciado continua lendo a versão antiga sem ser modificado no lugar.

```text
Official Config Source File
            |
            v
      Server Build Artifact
            |
            v
immutable revision file in runtime root
            |
            v
createLocalServices({ officialProviderConfigFilePath })
            |
            v
Official + Personal + Account Provider Runtime
```

O HTTP Server, o Remote stdio e o Standalone Server Core usam agora o mesmo mecanismo de materialização. Os 20 testes direcionados de Provider Node, materialização do Server e das duas configurações de build passaram. O login da CLI/TUI ainda grava o CLI Provider Config antigo; ele envolve a conexão de conta e a semântica de credenciais dinâmicas de um Account Provider e não foi reescrito por conveniência nesta fatia puramente de montagem de Entry.

## 178. Os Services não permitem mais criar uma autoridade antiga de Provider sem Official Config

Depois que todas as Entries de produção passaram a fornecer o Official Config, o único uso restante do caminho opcional de `createLocalServices()` são os testes. Esse parâmetro opcional ainda permitia que uma Entry nova compilasse sem o Provider Runtime montado e caísse em runtime no antigo `ModelProviderService`: aquecendo o Preset antigo na inicialização, julgando a prontidão do Agent pelo Snapshot antigo do Registry e fazendo o Repo Wiki ler fatos antigos de Provider.

Esta rodada tornou `officialProviderConfigFilePath` uma dependência obrigatória de `createLocalServices` e passou o campo de protocolo `init-local` do Desktop e o Schema de runtime para obrigatório. Qualquer Host/Server que deixe de passar o Official Config falha em tempo de compilação ou de admissão do protocolo, sem criar silenciosamente uma segunda fonte da verdade.

Os Services passaram a criar Config, Account Source e Registry de forma fixa, removendo o pré-aquecimento do Preset antigo, a source de readiness do Registry antigo e o fallback de Registry do Repo Wiki. O `ModelProviderService` continua temporariamente responsável pela migração do formato antigo de configurações e por capacidades periféricas ainda não convergidas, mas não pode mais se tornar a autoridade de Provider do Agent por falta de configuração na Entry. O Bot de produção também passa a injetar apenas o novo Model Selection Service; o fallback de `ModelProviderService` mantido internamente no Bots para testes legados independentes não é mais montado pelo Host.

Os 47 testes em 4 arquivos direcionados de Entry/protocolo/Services passaram; a verificação TypeScript de todo o repositório passou.

## 179. O login Standalone passa a usar Account Config e autenticação de tempo de requisição

O login de Coding Plan do Prompt CLI e da TUI gravava antes a API Key, a definição de Provider e o modelo padrão juntos no antigo `~/.zcode/cli/config.json`. Isso fazia a Entry Standalone voltar a fabricar uma fonte da verdade antiga de Providers mesmo depois de já ter iniciado o Registry de processo.

Esta rodada convergiu o login Standalone para dois tipos de estado:

```text
Shared Credential Store
├─ 当前账号身份
└─ accessId 对应的 API Key

Model Selection Config
└─ configuredDefault
```

Na inicialização do processo, a Standalone Account Source gera a terceira camada `ProviderConfigMap` a partir da identidade da conta e da API Key atualmente obtenível. Ela carrega apenas o `accessId`; os modelos do Provider, as Properties, os Option Specs e a configuração estática de API continuam vindo do Official Config, e nenhum segredo entra no Registry. Login, Coding Plan API Key manual e logout modificam o mesmo Credential Store, e os assinantes no mesmo processo atualizam a Account Source e o Registry depois que a gravação é concluída.

Cada requisição de Model usa o `accessId` fixado no Model para ler a API Key atual imediatamente antes de cada tentativa real. A rotação da API Key portanto não modifica o Registry nem muda a identidade de um Model já criado; a requisição seguinte obtém o novo valor diretamente. Quando a identidade da conta é removida ou trocada, o accessId antigo fica inválido e a Account Source remove simultaneamente o Provider correspondente do Registry usado para criar Models futuros.

O OAuth da Z.AI usa o ID de usuário do servidor como identidade da conta. O OAuth da BigModel e a API Key manual não têm hoje um Profile ID estável e usam provisoriamente um resumo irreversível da API Key para formar a identidade estável necessária dentro do processo; quando o Account Service fornecer um ID de conta formal, essa origem pode ser substituída sem que o `accessId` e a fronteira de autenticação de tempo de requisição mudem. Apenas o Personal Coding Plan da Z.AI / BigModel é integrado agora, sem estender isso ao Start Plan, ao Team Plan ou às tarefas ociosas.

O CLI Config antigo passa a ser apenas entrada da importação única para o Personal Config e para o configured default. Depois que o novo arquivo é gerado, alterações posteriores nos campos antigos de Provider/Model não entram mais no Registry. `createZCodeApp` continua lendo do arquivo antigo domínios ainda não migrados como MCP, Hooks e Permission, mas o modo Registry ignora explicitamente o `model` e o `modelCatalog` dele.

A notificação atual de mudanças de Credential cobre múltiplas instâncias de Store dentro do mesmo processo; um novo processo lê o fato mais recente gravado em disco. Um processo Standalone que já roda há muito tempo ainda não escuta modificações do arquivo de Credential feitas por outros processos; isso pertence a uma fatia posterior de sincronização de Source e não pode ser contornado colocando a API Key de volta no Registry.
## 180. A entrada de configurações de produção para de tolerar a ausência do Provider Settings Service

Embora `ProviderSettingsService` já fosse montado pelas Entries Desktop, Remote, Server e Standalone, o contrato de UI ainda o declarava opcional. Por isso as cadeias de configurações, de API Key do Welcome, de conclusão de compra e de verificação de segurança mantinham ramos de "quando o serviço está ausente, ler ou escrever no ModelProviderService antigo", e uma nova Entry de produção ainda podia voltar silenciosamente à segunda fonte da verdade em caso de erro de montagem.

Esta rodada tornou `ProviderSettingsService` um serviço obrigatório do `IServiceAccessor`. Entries que não executam Providers, como a página inicial puramente Web, passam a fornecer explicitamente uma Settings View vazia, em vez de depender de `undefined` para expressar falta de capacidade. A página de configurações, a página de login, a atualização após a compra e a atualização do Root passam somente pelas Facades de Settings/Selection; o API Key Management URL também passa a ser lido do Effective Provider Config da Settings View.

O formulário antigo de configurações ainda pode servir como entrada do período de migração, mas ele existe apenas na camada de adaptação do Renderer. Essa camada combina o formulário atual com a `ProviderSettingsView` em um Provider/Model Config Effective completo e estruturado, e a Settings Facade calcula em seguida o Personal Overlay esparso em relação ao Official Config atual. Official Providers e Personal-only Providers compartilham essa entrada, e o label, o Endpoint ou a lista completa de modelos do Official nunca são copiados para o Personal Config.

A verificação de segurança da versão oficial do Start Plan mantém o material dinâmico, o Header com escopo de requisição e o mecanismo de recibo existentes; os fatos estáticos `api.type/baseURL` usados pelo julgamento passam a ser lidos obrigatoriamente da Settings View, removendo o fallback de `getAllCached()`. Após a compra concluída, apenas a Account Source e o Registry são atualizados, sem chamada adicional ao antigo `refreshCodingPlanApiKey`.

Esta alteração não refaz a operação explícita de "testar conexão". Ela continua lendo credenciais de compatibilidade temporariamente quando o usuário clica e não pode sobrescrever os fatos estáticos de Provider/Model da Settings View; ela já está registrada no plano do M2 como tópico independente posterior.

## 181. O Root remove o Snapshot antigo de Provider do Renderer

Depois que `ProviderSettingsService` se tornou um serviço obrigatório de produção, o Root ainda mantinha um snapshot de `ModelProviderConfig[]` em memória independente. O portão de entrada da inicialização, o diálogo de login e a atualização OAuth observavam simultaneamente a Selection View e o Snapshot antigo, de modo que "o Registry ainda não foi publicado" e "o Provider antigo está disponível" ainda podiam produzir duas respostas diferentes.

Esta rodada removeu o módulo `modelProviderSnapshot` do Renderer e o estado de assinatura do Root. A disponibilidade na inicialização e o portão de login reconhecem agora apenas a `ModelSelectionView`: `null` significa que o Registry ainda não foi publicado e uma View vazia significa que o Registry confirmou que não há modelos selecionáveis; nenhum dos dois estados lê o array antigo de Providers.

A cadeia OAuth também foi convergida para uma única atualização do Provider Runtime: depois que o login da conta é bem-sucedido, a correção de `selectedKey` da Provider Family e a atualização do snapshot de App Settings são concluídas primeiro, e só então `ProviderSettingsService.refresh()` é chamado para atualizar a Account Source, o Registry, a Settings View e a Selection View. O Renderer não chama mais `refreshCodingPlanApiKey()` separadamente para os Providers de Coding/Start/Team, nem mantém `cachedOnly`, IDs de requisição ou barreiras de corrida do Snapshot antigo.

A projeção do formulário Legacy usada pela página de configurações ainda existe, mas sua entrada vem apenas da `ProviderSettingsView`. O "testar conexão" explícito mantém a fronteira independente de leitura sob demanda de credenciais de compatibilidade; ele não voltou a ser estado permanente do Root nem fonte da verdade de seleção de modelos.

Os 63 testes em 9 arquivos relacionados à inicialização do Root, portão de login, OAuth, projeção de configurações e fronteira de salvamento passaram; a verificação TypeScript de todo o repositório passou e o lint está com 0 error, mantendo as 35 warnings já existentes sem relação com esta fatia.

## 182. O Bot remove a fonte da verdade antiga de candidatos de Provider

O `/model`, o `/status` e a migração de estado antigo do Bot usavam antes a nova Model Selection View com prioridade, mas o `BotsService` ainda tratava o Selection Service como dependência opcional e mantinha como fallback o antigo `ModelProviderService`, o Snapshot antigo do Registry, um cache de Providers em memória com TTL e um menu de Providers persistente. O Remote Workspace Host também injetava no Bot remoto o antigo Model Provider Service do Desktop Local Host, de modo que um mesmo Remote Environment podia observar simultaneamente a Selection View remota e os fatos de Provider locais do Desktop.

Esta rodada tornou o Model Selection Service uma dependência obrigatória do `BotsService` e removeu o Provider Service antigo, o Snapshot do Registry e a cadeia de cache do menu de Providers. O menu de modelos do Bot, o label de Provider e a migração de estado antigo consomem apenas a Selection View do Environment ao qual pertencem; quando a View devolve com sucesso uma lista vazia, isso expressa que realmente não há modelos selecionáveis, e quando a leitura falha só é permitido recorrer à projeção em memória da última leitura bem-sucedida da mesma Selection Source. O cache de `configOptions` do workspace runtime continua existindo de forma independente: ele registra opções de configuração do Agent e não carrega fatos de Provider/Model.

Os Local Services injetam o Selection Service do Registry local do processo; o Remote Workspace Host injeta o Selection Service fornecido pela conexão remota. O Bot remoto portanto deixa de ler a configuração de Providers do Desktop Local Host. Os dois harnesses de E2E que construíam o Bot diretamente também passaram a fornecer explicitamente uma Selection View, evitando que os testes continuem dependendo dos fallbacks antigos implícitos no código de produção.

Os 121 testes em 9 arquivos direcionados de Bot e Remote Workspace Host passaram; a verificação TypeScript de todo o repositório passou.

## 183. O teste de conectividade da página de configurações sai do Snapshot antigo de Provider

O "testar modelo" da página de configurações tem uma semântica de produto fácil de passar despercebida: ele testa o rascunho que está no editor no momento, e o Endpoint, a API Key ou o nome do modelo ainda podem não ter sido salvos. Por isso o RPC não pode ser reduzido a `providerId/modelId` deixando o Host ler apenas o Registry, sob pena de a configuração vista pelo usuário e o objeto realmente testado divergirem.

Esta rodada acrescentou a operação de teste de conectividade ao Provider Settings Service. O Renderer entrega o rascunho estático atual e o nome do modelo ao RPC de Settings; o Host espera o Provider Runtime ficar pronto e procura o Provider de mesmo ID na Settings View mais recente. Provedores de API Key usam diretamente o rascunho atual. Account Providers ignoram possíveis valores de autenticação remanescentes no rascunho, chamam o serviço de autenticação de tempo de requisição pelo `accessId` do Effective Config e mesclam a API Key/Team Key atual nessa sondagem específica. O Header de verificação de segurança de uso único do Start Plan continua sendo gerado pela cadeia interativa existente e é submetido junto com este rascunho.

O existente `ModelProviderService.testModelConnectivity` continua temporariamente responsável pelo Probe de rede, pela verificação de entitlement do Start Plan e pela verificação de segurança da requisição; a nova fronteira `requestAuthResolved` informa explicitamente que as credenciais desta requisição já foram resolvidas pelo novo Account Request Auth Service e proíbe que ele volte a ler o Snapshot antigo de Provider ou reescreva a identidade pelas configurações de Family. Esse reuso de compatibilidade não produz mais fatos de Provider e, quando o Probe independente for extraído, a entrada de mesmo nome no serviço antigo poderá ser removida diretamente.

A leitura de `getAllCached()` do Renderer e `resolveLegacyConnectivityProvider()` foram removidas. Durante a implementação também se descobriu um teste de conclusão de compra que ainda afirmava a chamada do `refreshCodingPlanApiKey()` já aposentado; o teste passou a fixar o comportamento atual: a conclusão da compra atualiza a Account Source e o Registry sem voltar a atualizar a antiga API Key de Provider.

Os 198 testes em 7 arquivos relacionados a Provider Runtime, autenticação de tempo de requisição, isolamento do Probe antigo, projeção de configurações, conclusão de compra e verificação de segurança da versão oficial passaram; a verificação TypeScript de todo o repositório passou.

## 184. Remover a Source de migração do Snapshot antigo para o Account Config

Após uma nova auditoria da cadeia remota do M2.8, confirmou-se que o Remote Host já usa seus próprios Official, Personal, Account Source e Registry, que o Remote Worker lê os caminhos de Config do mesmo Environment e que o Remote Host sincroniza a terceira camada, o Account Overlay, por `provider/updateAccountConfig`. Este último é uma sincronização de Config de Host para Worker dentro de um Environment, e não uma injeção do Desktop para o Remoto, portanto é mantido.

Os quatro itens remotos do plano principal do M2 ainda marcados como pendentes estavam com o status do plano atrasado em relação ao código e aos testes já concluídos nas seções 161–176; esta rodada os sincroniza como concluídos. O código de produção já não tem writer de `workspace/updateProviderRegistry` nem ponto de montagem para `LegacyAccountProviderConfigSource`. Essa Source restava apenas como exportação pública e como teste unitário próprio, e ainda permitia que um chamador futuro reprojetasse o Snapshot antigo completo do Registry como um Account ProviderConfigMap.

Esta rodada removeu `LegacyAccountProviderConfigSource` e seus testes. O antigo `ModelProviderService` ainda precisa converter o selected key de Family em `accessId` ao construir o Snapshot de compatibilidade que não saiu completamente; essa função pura de conversão foi movida para um módulo independente, `legacyAccountAccessId.ts`, e não fica mais misturada com a Account Config Source. A verificação de referências dependentes confirmou que a Class removida não tem chamadores de produção; os novos testes da função pura e os 136 testes direcionados do antigo Model Provider Service passaram.

## 185. O Repo Wiki remove o fallback da Source antiga de Registry

O adaptador de Workspace Provider do Repo Wiki já recebia o `ModelSelectionService` do Environment ao qual pertence em todas as Entries de produção, e o antigo `providerRegistrySource` restava apenas como um ramo opcional sem chamador de produção e como teste correspondente. Esse ramo permitia que uma Entry sem Provider Runtime montado continuasse tratando o Snapshot antigo como fato estático de modelo do Wiki, em conflito com a fronteira de autoridade já concluída no M2.8.

Esta rodada tornou `modelSelectionSource` uma dependência obrigatória e removeu a interface antiga de Source, o fallback e os fixtures de teste. O adaptador ainda projeta temporariamente a Selection View na forma de Snapshot que o Repo Wiki interno ainda consome; isso é apenas uma adaptação estrutural do mesmo fato e não lê mais uma segunda fonte da verdade. Essa forma histórica de dados pode continuar sendo removida conforme os tipos internos do Repo Wiki forem migrados.

## 186. Os testes do portão de inicialização começam a sair do Snapshot antigo de Registry

Ao auditar `ZCodeAgentService.providerRegistrySource`, confirmou-se que ele já não tem montagem de produção, mas os testes ainda o faziam responder por quatro responsabilidades: portão de entrada da inicialização, resolução de Runtime Model, atualização a quente da Session e recuperação da verificação de segurança. Removê-lo diretamente faria mais de vinte testes de protocolo falharem com "Provider não está pronto" antes de realmente afirmarem algo, sem permitir distinguir regressão de semântica de produto de distorção de fixture.

Esta rodada migrou primeiro os casos de portão de inicialização com fronteira clara. Os cenários de Provider indisponível, múltiplos Workspaces em espera, Runtime somente leitura virando executável e inicialização do Account Request Auth passaram a usar `ModelSelectionReadinessSource`; os testes que exigem mudanças dinâmicas de prontidão usam a change source da `ModelSelectionView`. Os testes de Runtime Model e de atualização a quente continuam com a Source antiga e aguardam a migração por responsabilidade na próxima fatia.

Um experimento de remoção também revelou que os testes de decisão concorrente do V4 usavam o número de chamadas da mesma Source antiga como barreira de temporização. O teste não foi reescrito à força e a mudança de produção experimental foi revertida; primeiro é preciso oferecer um fixture formal para a resolução de Runtime Model e só então remover a Source antiga. Os 34 testes migrados de Provider Registry e os testes independentes de portão de inicialização passaram.

## 187. O Helper compartilhado de teste do Agent separa Readiness de Runtime Model Source

Os fixtures compartilhados de `zcodeAgentService.test`, V4, Provider Runtime Header e Repo Wiki Lane injetavam apenas `providerRegistrySource`. O mesmo Snapshot antigo decidia assim se o processo podia iniciar e fornecia ao mesmo tempo os dados de resolução de Runtime Model, o que tornava difícil provar que a produção já deixa o portão de inicialização sob a responsabilidade da Selection View.

Esta rodada acrescenta explicitamente `modelSelectionReadinessSource` a esses fixtures compartilhados. A Source antiga é mantida por enquanto apenas para o cache de Runtime Model, a recuperação de Headers e a projeção de compatibilidade ainda em verificação. Os casos de decisão concorrente de modelos do V4 contavam antes a leitura "portão de entrada lê o Snapshot" no número de chamadas; após a separação, a primeira leitura antiga do Registry já é a reconstrução do Runtime Model após o ACK do comando, e a barreira do teste foi ajustada à responsabilidade real.

Este passo não altera o código de produção. Ele continua reduzindo a superfície de migração de testes necessária para remover o fallback de readiness do `providerRegistrySource`; o trabalho restante está concentrado nos casos que construzem um Runtime Model antigo em `zcodeAgentService.providerRegistry.test.ts`.

## 188. O portão de inicialização do Agent sai do Snapshot antigo de Registry

Os testes restantes de Provider Registry já distinguem explicitamente as duas entradas: `ModelSelectionReadinessSource` responde apenas se existe algum modelo selecionável no processo atual, e o antigo `providerRegistrySource` fornece dados de compatibilidade apenas para os casos de resolução de Runtime Model, recuperação de Headers e atualização a quente que ainda não foram migrados. Um novo caso de regressão prova primeiro que, injetando apenas um Snapshot antigo de Registry com modelos, a implementação antiga desbloqueava o Worker indevidamente.

O `ZCodeAgentService` de produção removeu em seguida a conversão de Registry para readiness, o disparo de inicialização por Registry change e o desvio de `startupRegistry`. A temporização de inicialização fica agora fixa:

```text
ModelSelectionView
        |
        v
Host 启动门禁
        |
        v
Worker 启动后使用自己的 Registry 再次解析 Model
```

O Registry change event antigo ainda responde temporariamente pela atualização a quente de compatibilidade do Runtime Model de Sessions já existentes, mas já não consegue iniciar um Worker em espera. Os 35 testes de Provider Registry e os 92 testes de Agent Service, V4, Runtime Header e Repo Wiki Lane passaram.

## 189. O Host sai da reconstrução de Runtime Model e da sincronização a quente

Ao continuar a auditoria, confirmou-se que `ZCodeAgentService.providerRegistrySource` já não tem ponto de montagem de produção e que todo o comportamento restante é mantido apenas por testes históricos. Ele ainda permite que o Host reconstrua `runtimeModel` a partir do Snapshot antigo do Registry, escute mudanças de Snapshot e atualize Sessions já existentes, além de deixar o recibo de autenticação dinâmica modificar parcialmente o Runtime da Session. Esses comportamentos fariam o Host e o Worker alvo interpretarem cada um os fatos de Provider e conflariam com "o Registry do Worker do Environment ao qual pertence é a autoridade de execução".

Esta rodada removeu a Source antiga, a construção de Runtime Model do lado do Host, a sincronização a quente de Snapshot e as classificações de erro de Provider/Plan relacionadas. Requisições comuns de Session, Workspace, Bot do V4 e de Automation agora passam apenas `providerId/modelId/thought`; Workers locais e remotos criam o Model pelo seu próprio Registry mais recente. A cadeia remota não recebe mais do Desktop Host um `runtimeModel` local apenas por existir um `workspaceIdentity`:

```text
Host / Remote Controller
        |
        | ModelSelection
        v
Target Worker Registry
        |
        v
      Model
```

`resolveRuntimeModelForV4()` foi removido das APIs de Agent, Session e Task Adapter. A requisição de autenticação dinâmica continua sendo respondida pelo Host com a API Key/Header de que esta requisição precisa, mas não atualiza mais o Runtime da Session. O `runtimeModel` execution-scoped fornecido explicitamente junto de um Submission ou comando do V4 continua sendo repassado e fica em cache durante aquele trecho de execução; um comando de Selection comum limpa o cache temporário explícito anterior. Essa entrada temporária serve a Providers de nível de execução como o das tarefas ociosas e não reintroduz o Registry do Host.

O código antigo mantinha um decision token para a "reconstrução assíncrona do Runtime Model após o ACK". Com a etapa de reconstrução removida, a atualização de cache se resume a salvar ou limpar sincronamente o `runtimeModel` explícito, e por isso esse pseudo-máquina de estados de concorrência é removida junto. Os testes de regressão de Bot/Automation remoto passaram a afirmar explicitamente que a carga útil do protocolo contém apenas Selection e não o `runtimeModel` do Desktop; os 293 testes direcionados de Service e UI passaram, a verificação TypeScript de todo o repositório passou e o lint está com 0 error, mantendo as 35 warnings já existentes sem relação com esta fatia.
## 190. Remover o protocolo de sincronização a quente do Session Runtime Model

Depois que a reconstrução de Runtime Model do Host foi removida, `session/updateRuntimeModelConfig` ficou sem chamadores de produção. Ele ainda mantinha no protocolo compartilhado e no Worker um handler completo, capaz de gravar um `runtimeModel` arbitrário em uma Session já existente e de mesclar Headers de nível de requisição no Workspace Model Overlay com `applyModelSelection=false`. Essas duas capacidades pertencem ao desenho antigo de sincronização a quente do Host e de recuperação da verificação de segurança, e contornam o Registry do Worker e a fronteira de autenticação de tempo de requisição.

Esta rodada removeu o método do protocolo, os Schemas de parâmetro e resultado, a API do Host Service, o dispatch do Worker e o handler. Na recuperação a frio, o ModelSelection histórico é resolvido pelo Registry do próprio Worker; quando o Registry atual não contém mais o modelo, a Session mantém a exibição histórica e reporta explicitamente a indisponibilidade, e o Host não pode mais "reanimar" temporariamente o modelo com uma configuração completa de Provider. Materiais de autenticação dinâmica como API Key e o Header de verificação de segurança de uso único são resolvidos antes da requisição real e entregues ao Adapter, sem serem gravados no Runtime da Session nem no catálogo estático de modelos.

No teste original do protocolo, a parte de "a recuperação a frio recusa continuar o envio quando o modelo está indisponível" é preservada; as asserções que dependiam de o Host corrigir o Runtime depois e de gravar o Header de segurança no Session Overlay foram removidas. Os 114 testes de protocolo do Bootstrap, os 12 testes de Provider Registry e a verificação TypeScript de todo o repositório passaram. Um comando de package test disparado por engano executou também a suíte completa do Bootstrap, que contém várias falhas existentes sem relação com esta fatia; em seguida os arquivos afetados foram verificados com uma entrada Vitest precisa.

## 191. O eco de modelo do Workspace remove o antigo arbitrador de Provider Config

`resolveWorkspaceModelSelection` misturava antes a leitura do `config.json` de GLM do workspace, as preferências em localStorage do Renderer e a lista antiga de Providers e, com base no Provider ID, no Base URL e no nome do modelo, decidia se exibia um ghost supplier. As chamadas de produção já foram unificadas no ZCode Agent e o ramo não-GLM está inalcançável; ainda assim o resolver lia a configuração de GLM de forma fixa, seja qual fosse o Agent recebido — Claude, Codex ou Gemini. Migrá-lo para o novo Model Selection Service reestabeleceria a configuração antiga do workspace como fonte da verdade de Providers.

Esta rodada removeu o resolver, o Parser, o Repo, o Helper, a API antiga do Service e os testes do comportamento antigo. O reload do workspace agora tem uma única cadeia de eco de modelo:

```text
prepare configOptions
        +
App Recent Model Selection
        +
当前进程 Model Selection View
        |
        v
Composer 模型与 supplier 回显
```

O identificador de provider de Agent remanescente de sessões antigas é antes normalizado para o único `glm` atual, sem disparar outra leitura de configuração. O Model Selection View decide se o provider continua selecionável; a resposta de prepare expressa o modelo que o runtime atual já aceitou; e o App Recent apenas inicializa ou sobrescreve o Composer quando a prioridade existente permite. O Provider Config antigo do workspace não participa mais dessa cadeia.

Os novos testes de regressão cobrem a normalização do identificador de provider antigo, o eco do Provider atual, um Recent indisponível que não sobrescreve o resultado de prepare e a prioridade da resposta autoritativa após trocas de Start/Coding Plan. Os 12 testes direcionados de UI e Facade de Provider passaram, e a verificação TypeScript de todo o repositório passou.

## 192. Remover o Runtime Header global de Provider

A cadeia formal de Header de uso único já obtém um Header descartável por meio de `providerRuntimeHeaders.request/response` antes de cada requisição de modelo, e na recuperação apenas armazena temporariamente o novo Header para o workspace, a session e a próxima requisição correspondentes. O antigo `ModelProviderService` ainda expõe `setProviderRuntimeHeaders()`, que permite à UI gravar um Header descartável em um Map de nível de processo, invalidar o Snapshot antigo do Registry e deixar o Snapshot projetar o Header para o modelo. Essa entrada não tem chamador de produção, mas os testes ainda a descrevem como comportamento disponível.

Esse estado global destrói o escopo das credenciais descartáveis:

```text
旧链路
一次性 Header -> Provider 级 Map -> Registry Snapshot -> 任意后续请求

当前链路
一次性 Header -> 指定 request response -> 对应模型请求
```

Esta rodada removeu a API do Service, o Map por Provider, os dois helpers de UI descontinuados e seus testes. O Header de verificação de segurança da versão oficial que possa restar na configuração antiga continua sendo removido na projeção do Snapshot de compatibilidade; o Authorization estático do Start Plan continua vindo da Credential atual e não é mesclado com o Header descartável. A construção de Headers de nível de requisição, a serialização de concorrência, o armazenamento temporário e a lógica de resposta permanecem inalterados.

Os 161 testes direcionados de Provider Service, máquina de estado de verificação de segurança da versão oficial e Helper de logs passaram. Mesmo que o Snapshot antigo do Registry ainda exista por causa de poucos consumidores de compatibilidade, ele não pode mais carregar credenciais dinâmicas de requisição.

## 193. Corrigir o status do plano principal do M2.3c

A revisão do código atual confirmou que os três itens antes marcados como "pendentes" no plano principal do M2.3c já foram concluídos pelas fatias de implementação anteriores:

- O Provider Config já usa `access.type`, `api.type` e o `apiAdapter` de nível de modelo, e as regras usam `apiMatch` para expressar o comportamento combinado de modelo/API.
- O Personal Config continua usando `~/.zcode/v2/config.json`. Na primeira leitura do formato antigo, é criado primeiro um backup com hash do conteúdo e, em seguida, uma única entrada de importação grava o documento formal de volta; a gravação usa substituição atômica, e uma falha no backup ou na conversão não sobrescreve o arquivo original.
- O formato final tem `schemaVersion: 1` como primeira versão formal; os v1–v5 da fase de desenvolvimento permanecem apenas no registro histórico e não constituem uma cadeia de migração pública de longo prazo.

Esta rodada sincronizou apenas o texto de status do plano principal, sem adicionar lógica de compatibilidade e sem alterar o comportamento de migração dos arquivos existentes. O M2.3c ainda precisa concluir a auditoria de fechamento de "mover todos os fatos estáticos válidos para Official / Personal Config e remover os Catalog/Preset/hardcode restantes"; essa auditoria é um item de trabalho distinto das trocas de Schema, caminho e versão acima.

## 194. Sair do evento global de mudança do Provider Registry antigo

O antigo `IModelProviderService.onDidChangeProviderRegistry` não tem assinantes de produção. Ele existia para empurrar ativamente o Snapshot completo do Registry gerado pelo serviço antigo para o Host/Worker; o protocolo de sincronização de Runtime Model e suas chamadas de produção já foram removidos, e o novo Model Selection e o Provider Settings leem a Registry View por suas respectivas Facades.

Esta rodada mantém o cache de Snapshot dentro do serviço antigo e continua fazendo com que salvar um Provider, atualizar o estado da conta e mudar o estado de um plano invalidem esse cache; ela remove o evento externo, a lógica de construir e empurrar o Snapshot de forma assíncrona e as duas assinaturas de teste que cobriam apenas o evento antigo. Assim a próxima leitura ainda devolve o Snapshot mais recente, mas uma mudança de Provider não recria uma cadeia global de push a quente de fatos. `getProviderRegistrySnapshot()` continua disponível para o caminho de compatibilidade de conectividade das configurações que ainda não migrou, e é removido depois que esse caminho passar a usar o novo Registry.

## 195. Remover a antiga entrada `applyToProvider`

`IModelProviderService.applyToProvider()` era usado para aplicar a seleção de modelo ao antigo Provider do Agent e também fazia as validações de existência de ZAPI, Provider e Model. Hoje a execução local já leva a Selection pelo Submission e o Worker cria o Model pelo seu próprio Registry; não restam chamadas no código de produção do repositório, e a entrada antiga não grava mais em `~/.zcode/cli/config.json`.

Esta rodada removeu a interface, a implementação e os testes que cobriam apenas essa entrada de compatibilidade. O salvamento de Provider continua sendo responsabilidade do Settings Service, a validação de Selection continua sendo responsabilidade do Model Selection Service/Registry e o teste de conectividade continua usando o `testModelConnectivity()` independente. A cadeia de compatibilidade do Snapshot remoto antigo já não tem chamadas de produção no código, e a explicação histórica correspondente permanece no mapa de chamadas para uso em auditorias de limpeza futuras.

## 196. Remover o arquivo antigo de Provider Display Order

O antigo `IModelProviderService.getDisplayOrder()` e `saveDisplayOrder()` liam e gravavam um `model-provider-display-order.json` independente. A reordenação de Providers e de modelos na página de configurações atual já é feita diretamente pelo `ProviderSettingsService` modificando o Personal Config Overlay; a ordem efetiva vem da resolução das duas camadas Official e Personal, e o arquivo antigo de ordenação não participa mais da seleção de modelos nem da página de configurações.

Esta rodada removeu as interfaces antigas, as funções de leitura e escrita do Storage, o helper de caminho e os testes correspondentes de falha de arquivo. O `ModelProviderDisplayOrderState` que permanece no Shared/UI existe apenas como forma de dados de compatibilidade da projeção da página de configurações e não representa a continuação da existência do arquivo antigo.

## 197. Corrigir o status de identidade de conta do M2.3d

A revisão dos quatro itens de identidade de conta do plano principal do M2.3d confirmou que eles já foram concluídos em conjunto pela Account Source, pelo Request Auth, pelo Credential Store e pela cadeia de Usage atuais, e que o texto do plano original estava atrasado em relação à implementação:

- A Account Source usa `createAccountScopedAccessId()` para gerar uma identidade com escopo de conta; ela permanece estável quando as credenciais da mesma conta são renovadas e gera um novo `accessId` quando a conta muda.
- `AccountProviderRequestAuthService` valida antes da requisição a correspondência entre Provider e `accessId`, bem como a identidade OAuth da conta atual; organization/project do Team são resolvidos do mesmo `accessId` e repassados ao resolvedor de Team Key.
- A Personal Coding Plan API Key usa o `accessId` com escopo de conta como chave do Credential Store. A key antiga em nível de Provider é lida apenas durante a migração e não participa dos fatos das novas requisições.
- Usage, Entitlement, Team Products e as requisições de cache relacionadas carregam o `accessId` com escopo de conta, e as requisições de Team preservam ao mesmo tempo o contexto de organization/project, sem introduzir uma identidade de cache de conta paralela.

Esta rodada sincronizou apenas o status de implementação e as evidências, sem alterar a lógica de execução. O que ainda precisa ser tratado separadamente é a saída final das leituras de compatibilidade do antigo `ModelProviderService` e das entradas remota e de migração; a identidade de conta em si não deve mais ser listada como item pendente.

## 198. Completar a projeção da capacidade de vídeo do Registry para o Adapter

O M1 já incluiu `supportsVideo` em `Model.properties`, e a camada de Model rejeita, antes da requisição entrar no executor, modelos que declaram explicitamente não suportar vídeo. Mas o `inputMediaCapabilities` compilado pelo Registry para o AI SDK Adapter carregava apenas imagem e PDF; quando a conversão de requisição do Adapter era usada diretamente, a capacidade de vídeo não podia reaproveitar a mesma Config de Model do Registry.

Esta rodada acrescentou `supportsVideo` à estrutura de capacidades de mídia do Adapter e passou o campo de forma completa pela conversão de mensagens do Registry Model Runtime, das requisições geradas e das requisições em streaming. A cobertura de Provider em nível de execução passou a usar o mesmo campo. Assim a validação de atributos da camada de Model e a projeção de mídia da camada de Adapter leem o mesmo fato de capacidade; a semântica já existente de "omitir a mídia apenas quando explicitamente false e manter a compatibilidade quando não declarada" não mudou.

Os 12 testes do Registry Runtime do Bootstrap e os 69 testes de runner/transform do Adapter passaram. Esta rodada não tocou nos caminhos de compatibilidade do Catalog antigo ou do Provider Service.

## 199. Revisar as referências restantes ao Model Catalog antigo

Esta rodada reexaminou as referências de produção de `ModelCatalogService`, `modelCatalog.overrides`, do snapshot empacotado de models.dev e do antigo `model-providers.json`. O resultado precisa ser entendido em duas categorias.

No caminho de produção em que `providerRegistry` já está montado, os dados críticos de seleção e execução de modelos já são fornecidos pelo novo Registry:

```text
Provider Registry
├─ listModels -> ModelSelectionView
├─ model properties / option specs -> Registry Model
└─ createModel -> Provider Model Runtime
```

Nessa condição, `create-app.ts` desliga `includeLegacyProviderModels`, o `ApiProviderModelRuntime` executa os modelos e o ramo de Registry do Session Facade cuida da seleção de modelos e dos níveis de reasoning. Portanto o antigo `ModelCatalogService` não é mais a fonte da verdade dessas cadeias principais.

O código antigo de Catalog ainda tem as seguintes referências de compatibilidade:

- montagens antigas de App/CLI sem `providerRegistry` injetado ainda constroem capacidades de modelo por `model-selection.ts`, `model-input-capabilities.ts` e `runtime-model-factory.ts`;
- as funções auxiliares de migração, eco e protocolo histórico do catálogo de workspace ainda precisam converter estruturas antigas em projeções de capacidade;
- o Runtime Config antigo ainda mantém o parsing de `modelCatalog.overrides` para sustentar entradas de compatibilidade que ainda não migraram para o novo Registry;
- a leitura de `model-providers.json` pelo antigo `ModelProviderService` ainda serve como migração única do Personal Config e como fronteira de serviço residual.

Por isso esta rodada não remove esses módulos nem os reconecta à cadeia principal do Registry. O posicionamento atual deles é o de "runtime de compatibilidade sem montagem de Registry e adaptador de migração única", e não o de outra fonte da verdade de Providers de produção paralela.

Antes de removê-los é preciso provar separadamente duas coisas: que todas as Entries que ainda podem iniciar injetam o Registry; e que a migração de arquivos antigos, a recuperação histórica do workspace e os testes de compatibilidade já não precisam da estrutura antiga de Catalog. Nesse momento a remoção deve ser feita por ponto de chamada, e não removendo tudo em bloco com base no nome da classe `ModelCatalogService`.
## 200. Completar o atributo de vídeo no caminho de capacidade de compatibilidade

A rodada anterior já projetou `Model.properties.supportsVideo` do novo Registry na estrutura de capacidades de mídia do Adapter; esta rodada continuou examinando os caminhos de compatibilidade sem Registry montado e descobriu que `model-input-capabilities.ts` ainda coletava apenas imagem e PDF. Assim, o `supportsVideo` do mesmo modelo se perdia no caminho antigo de CLI/modelos temporários de execução, e a política de entrada de vídeo do Core não recebia o resultado da configuração.

Esta rodada sincronizou quatro fronteiras:

- o `modalities.input` de models.dev converte `video` para a capacidade do Catalog antigo;
- a mesclagem de Catalog Overrides preserva `supportsVideo`;
- a resolução de capacidade de compatibilidade em runtime repassa `supportsVideo` entre a configuração explícita, o Catalog e a projeção padrão;
- a projeção antiga de seleção de modelos leva esse atributo até o `ZCodeModelOption`.

A mudança completa apenas um atributo de mídia já decidido, não altera a cadeia principal do Registry e não amplia as responsabilidades de fatos do Catalog antigo. As novas regressões cobrem o fato de vídeo de models.dev, o Override explícito de vídeo e a projeção da seleção de modelos.

## 201. Remover a entrada pública de refresh do Preset antigo

`IModelProviderService.refreshPresetProviders()` já não tem chamadores de produção. O novo Host, o Worker, o Prompt CLI e a TUI atualizam o Registry por meio respectivamente pelas Account Sources Official, Personal e Account; manter esse método público permitiria que qualquer consumidor de RPC voltasse a disparar a sincronização antiga de Preset e a reescrever o Provider Store antigo.

Esta rodada removeu o método da interface e do objeto de retorno do Service. O `getAll()` antigo do Service continua chamando internamente a função privada de refresh de mesmo nome, que serve apenas à migração única e às leituras de compatibilidade que ainda não foram removidas; essa função interna não pode mais ser chamada ativamente por `IModelProviderService` nem por RPC. Isso estreita a superfície de produção da fonte da verdade antiga sem alterar a importação do Personal Config nem a leitura inicial das Entries antigas.

## 202. O teste de conectividade das configurações sai do Provider Service antigo

A nova cadeia de configurações já obtinha os fatos estáticos de Provider da Provider Settings View e resolvia as credenciais em tempo de requisição pelo `accessId` do Account Overlay; o último passo, porém, ainda chamava `IModelProviderService.testModelConnectivity()` e usava `requestAuthResolved: true` para impedir que o serviço antigo voltasse a ler o Snapshot de Provider. Esse interruptor de compatibilidade mantinha o Snapshot antigo como dependência indireta da sondagem de rede.

Esta rodada definiu a sondagem única pós-autenticação como um `ProviderSettingsConnectivityProbe` estreito. A camada de composição fica responsável pelas credenciais de Account e pelos Headers de requisição, e o Probe recebe apenas o rascunho de configurações atual, o modelo e a API Key desta requisição, tratando a verificação de entitlement do Start Plan, a verificação de segurança da requisição e a sondagem real do endpoint. A montagem de produção cria o Probe diretamente, sem injetar o antigo `ModelProviderService` na cadeia de configurações e sem passar `requestAuthResolved`. O método de mesmo nome do serviço antigo é mantido por enquanto para os testes de compatibilidade ainda não removidos e para o canal antigo remoto; ele já não é dependência de produção da nova functionality de configurações e o método antigo junto com o construtor completo de Snapshot podem ser removidos depois de forma independente.

## 203. Remover a API antiga de teste de conectividade

Depois que a seção anterior foi concluída, `IModelProviderService.testModelConnectivity()` ficou sem chamadores de produção. Ele acumulava a leitura do Snapshot de Provider, a reescrita de credenciais de Account/Team, o julgamento de entitlement do Start Plan e a sondagem de rede; manter essa entrada pública permitiria que chamadores fora da cadeia de configurações continuassem dependendo da combinação de fatos do serviço antigo de Provider.

Esta rodada removeu a interface, a implementação e a entrada de compatibilidade do Host remoto. O comportamento de conectividade não foi removido: a sondagem de protocolo genérica, o `reasoningMapping` de nível de modelo, a disponibilidade do Start Plan e a verificação de segurança da requisição agora são cobertos pelo `ProviderSettingsConnectivityProbe` independente. Os novos testes do Probe verificam diretamente o comportamento do `apiFormat` atual, do `reasoningMapping` e quando o nome do modelo não casa com nenhuma regra; as credenciais de requisição de Account/Team continuam cobertas pelos testes já existentes de `accountProviderRequestAuthService` e `accountProviderTeamPlanRequestKey`.

Este passo estreitou as responsabilidades do Provider Service antigo sem alterar a semântica de produto de envio do rascunho das configurações, da autenticação de tempo de requisição ou da sondagem de rede. A implementação do Snapshot antigo do Registry ainda existe separadamente, e o próximo passo continua sendo auditar seus testes e referências de compatibilidade antes de decidir o escopo da remoção.

## 204. Remover o Snapshot antigo do Provider Registry

Depois que a migração da conectividade das configurações foi concluída, `getProviderRegistrySnapshot()` ficou sem consumidores de produção. As únicas chamadas restantes estão na interface do antigo `ModelProviderService`, no construtor do cache e nos testes que verificam especificamente esse Snapshot; Host, Worker, Selection, Settings e execução de Model já usam a nova cadeia de Registry/Facade.

Esta rodada removeu do serviço antigo a interface de Snapshot, o cache, a invalidação por geração e o construtor de Snapshot completo, e removeu os testes que verificavam apenas a projeção do Snapshot antigo, a sobrescrita de credenciais de runtime antigas e a inicialização concorrente antiga. O tipo de protocolo `ZCodeProviderRegistrySnapshot` e a entrada de compatibilidade do Repo Wiki são mantidos por enquanto, porque ainda são formas de dados históricas independentes; eles não são mais gerados pelo `ModelProviderService` e não participam mais da criação atual de Model.

Após a remoção, restaram 100 testes do Model Provider Service, cobrindo a migração do Store antigo, a sincronização de predefinições, a disponibilidade de Account e o comportamento de escrita Personal. O arquivo de teste passa quando executado isoladamente; ao ser executado em paralelo com outros testes com atualização de entitlement em segundo plano, a limpeza temporária de diretório existente sofre uma corrida `ENOTEMPTY`, que deve ser tratada depois como problema de isolamento de testes, sem restaurar a camada de compatibilidade do Snapshot.

## 205. Limpar os resíduos de teste da API antiga de Snapshot

Depois da remoção de `getProviderRegistrySnapshot()`, o código de produção não tem mais chamadores dessa API; os testes de UI ainda a mantinham em vários mocks de serviço, e os testes de troca de modelo ainda guardavam asserções de configuração, reset e "não deve chamar" para ela. Esses resíduos fariam uma interface já retirada parecer ainda pertencer à fronteira atual dos serviços e mascarariam o conjunto mínimo de serviços de que os testes realmente dependem.

Esta rodada removeu somente os campos de mock antigos dos testes de UI, as inicializações inválidas e as asserções, sem alterar o comportamento de interação coberto pelos testes. Os 9 arquivos de teste afetados, com 104 testes no total, passaram. `getProviderRegistrySnapshot` agora existe apenas na semântica de documentação histórica ou em protocolos de compatibilidade independentes, e não aparece mais na interface do serviço de produção nem nos mocks de teste.

`readLegacyProviders` e `getAllCached()` não foram removidos nesta rodada: eles ainda suportam a importação unidirecional da configuração antiga na primeira leitura do Personal Config. A condição de saída dessa entrada é confirmar que todas as Entries suportadas concluíram a migração, e não simplesmente apagar o serviço antigo pelo nome.

## 206. Auditar as entradas de produção restantes do Provider Service antigo

Após a limpeza da API antiga de Snapshot, as dependências de produção restantes se concentram em dois caminhos de migração/compatibilidade:

1. O `ProviderConfigRuntime` do Local Host, quando o Personal Config ainda não tem uma versão oficial, chama `modelProviderService.getAllCached()` para ler o Provider Store antigo, converte o resultado em um Personal Config esparso e completa o backup e a escrita atômica no mesmo caminho. Depois que a Config oficial existe, esse callback não é executado novamente.
2. O Host de compatibilidade local de `remoteWorkspaceServiceCollection` fornece um fallback para o Provider Store antigo a `AccountProviderCredentialStore.loadApiKey()`; o mesmo arquivo também usa o antigo `ModelProviderService` como entrada de limpeza do período de migração para o logout OAuth. Esse caminho atende as fronteiras locais de Usage/OAuth do Host de compatibilidade e não é a fonte da verdade para o Remote Worker criar Models; o Registry e o Request Auth do Remote Worker continuam lendo o Environment ao qual pertencem.

Portanto, esta rodada não remove essas duas entradas nem as reinterpreta como origens do Registry. Para removê-las é preciso confirmar antes, separadamente, que todas as Entries que podem iniciar já concluíram a migração do Personal Config e que a limpeza das credenciais antigas de conta do Host de compatibilidade não será mais dependente de consumidores internos. Caso a saída seja feita adiante, a limpeza de credenciais antigas do Host remoto de compatibilidade deve virar primeiro um serviço de migração independente, e só então os métodos correspondentes de `IModelProviderService` devem ser removidos, evitando misturar a migração única e o fato de Provider de longo prazo em uma única alteração.

## 207. O logout OAuth sai da limpeza do Provider Store antigo

Ao continuar examinando a superfície de chamadas acima, confirmou-se que a chamada de `ModelProviderService.clearCodingPlanApiKey()` no logout OAuth apenas reescrevia uma key derivada no Provider Store antigo no momento do logout. A nova autenticação de requisições lê o Credential Store com escopo de conta, e a Account Source é responsável por republicar a disponibilidade; a limpeza do Store antigo não afeta o Registry, o Model ou as credenciais de requisição atuais.

Agora o logout depende apenas de `AccountProviderCredentialStore.deleteApiKey()` e da atualização da Account Source, e as injeções de logout do `remoteWorkspaceServiceCollection` e do `remoteConnectionServiceCollection` para o serviço antigo foram removidas, junto com os testes que verificavam apenas a reescrita do Store antigo. A implementação de `clearCodingPlanApiKey()` do próprio `IModelProviderService` é mantida por enquanto, para chamadas internas antigas do período de migração e para uma limpeza posterior separada; ela já não é dependência de produção do logout OAuth.

## 208. Limpar o mock de Coding Plan API já aposentado na UI

Os testes de OAuth da página de configurações já verificavam o logout e a atualização da Account Source sem chamar mais os antigos `refreshCodingPlanApiKey` / `clearCodingPlanApiKey`. Esta rodada remove esses mocks, resets e asserções de "não deve chamar", preservando as asserções reais de login, desvinculação, atualização e leitura de credenciais. Os 9 testes de configurações passaram todos.

Os métodos antigos do Service e seus testes históricos específicos não são removidos nesta rodada; eles ainda precisam ser reclassificados conforme o novo fluxo de Account Provider, para que os testes de entitlement não sejam removidos por engano junto com eles.

## 209. Limpar o mock antigo de Provider Store nos testes do V4

O mesmo lote de testes do V4 construía mocks vazios para `modelProviderService.getAllCached()`, mas esses casos já validavam a restauração de modelos, o pré-aquecimento de rascunhos e o portão de erro por meio dos serviços de Selection/Settings, sem ler de fato o Provider Store antigo. Esta rodada remove esses mocks inválidos; os 113 testes em 10 arquivos de teste afetados passaram. A entrada de migração de produção não é afetada.
## 210. Remover as APIs antigas de refresh e limpeza da Coding Plan Key

OAuth, a página de configurações e o Account Provider já concluem, respectivamente por meio do Account Credential Store, da Account Source e do Request Auth, a atualização de login, a publicação de disponibilidade e a autenticação de tempo de requisição. Os antigos `IModelProviderService.refreshCodingPlanApiKey()` e `clearCodingPlanApiKey()` ficaram sem chamadores de produção; o comportamento que resta neles é gravar credenciais dinâmicas e resultados de entitlement de volta no Provider Store antigo, e mantê-los faria os fatos de conta já separados convergirem de volta para a configuração estática antiga.

Esta rodada removeu os dois métodos públicos, a implementação no Service, as injeções de dependência antigas e os 29 testes que afirmavam o resultado da reescrita do Store antigo. Antes da limpeza dos testes, as regras de produto ainda válidas foram migradas para `codingPlanProviderAvailability.test.ts`, cobrindo diretamente Start/Coding da Z.ai não autenticado, entitlements mutuamente exclusivos, a preservação do resultado de Start quando a consulta de Coding falha temporariamente e a preservação do estado de conexão anterior quando a verificação temporária do Team Project selecionado falha. As regras de entitlement continuam sendo chamadas pelo novo Account Connection Resolver e não dependem mais dos efeitos colaterais de refresh do serviço antigo. O antigo Account Facts Emitter e o helper de motivo de desconexão, que perderam consumidores junto com as duas entradas de chamada, também foram removidos para parar de sugerir que o serviço antigo publica fatos de conta.

A sincronização antiga de Preset e o cache de Entry Status dentro de `ModelProviderService.getAll()` são mantidos por enquanto; eles atendem à primeira importação do Personal Config e às leituras de compatibilidade que ainda não saíram, e não oferecem mais nenhuma entrada de refresh ou limpeza. Os 98 testes em 6 arquivos relacionados passaram, e o build TypeScript completo passou.

## 211. A migração única da configuração antiga sai do ModelProviderService

Os dois consumidores reais do serviço antigo precisavam apenas ler o armazenamento físico antigo, e não de sincronização de Preset, Entry Status, filtro de Family ou qualquer projeção de estado de runtime. A primeira importação do Personal Config do Local Host passou a chamar diretamente o leitor do Store antigo; a entrada de migração contém assim apenas os valores de Provider do próprio arquivo antigo, sem passar por `getAllCached()` e misturar o estado de entrada da conta.

O lado local do Remote Workspace mantém uma migração única para a Personal Coding Plan Key histórica. Essa cadeia ganhou a função estreita `loadLegacyAccountProviderApiKey(providerId)`, que lê apenas a Key antiga do Provider especificado e a entrega ao Account Credential Store para gravar a credencial com escopo de conta. O Remote Workspace não constrói mais nem registra um ModelProviderService local antigo por causa disso, e as fábricas relacionadas e os testes que verificavam apenas o comportamento antigo de Preset/ZAPI saíram junto; a seleção de modelos e as configurações continuam usando diretamente os serviços de Registry do Remote Environment alvo.

Foram adicionados testes da leitura estreita da Key antiga, com regressão do Account Credential Store, da montagem de serviços do Remote Workspace e da primeira migração do Provider Config. Os 13 testes em 3 arquivos passaram, e o build TypeScript completo passou.

## 212. Remover a superfície pública do ModelProviderService antigo

Depois que a primeira importação do Personal Config e o isolamento da migração da Key antiga de Account foram concluídos, o código de produção já não precisa mais das capacidades de configuração, Snapshot, sincronização de Preset, conectividade ou Resolver de runtime do antigo `IModelProviderService`. Manter essa camada de Accessor, RPC, proxy do Host e registro de serviços só faria uma origem de fatos de Provider já descontinuada continuar parecendo parte da arquitetura atual.

Esta rodada removeu os tipos públicos de `IModelProviderService`, a implementação do Service, a sincronização de Preset, os Helpers antigos do Service, o canal RPC, as exposições de Accessor/Proxy e os registros de montagem do Local Host, do Remote Workspace e do Server; os testes que verificavam apenas esses comportamentos antigos de serviço também foram removidos. Os mocks do serviço antigo nos testes de Web/Renderer/Host foram removidos junto, e os testes passaram a verificar as fronteiras atuais de Model Selection, Provider Settings e Account Request Auth. O arquivo físico `modelProviderServiceStorage` é mantido, com as responsabilidades estreitadas para leitura de migração única e escrita de dados de compatibilidade; ele não participa mais da construção de fatos de Provider de runtime por meio de uma instância de serviço.

Este passo não alterou a lógica atual de seleção de modelos, salvamento de configurações ou autenticação de tempo de requisição; ele remove apenas entradas públicas que já não têm consumidores de produção. Os testes afetados passaram e o build TypeScript completo passou.

## 213. Estreitar a fronteira de escrita do Store antigo

Depois da remoção do antigo `ModelProviderService`, `modelProviderServiceStorage.writeProviders()` ficou sem chamadores de produção. A escrita no Store antigo fazia parte de um serviço de configuração de Provider de longo prazo; na arquitetura atual, a escrita de configuração de runtime é responsabilidade do Personal Config Repository e da Provider Settings Facade, e o Store antigo apenas carrega a entrada de migração e a gravação interna durante a migração.

Esta rodada removeu essa função pública de escrita e transformou o teste existente de escrita atômica em um teste que dispara a migração real de leitura única a partir do `model-providers.json` antigo, continuando a verificar o retry de rename do Windows, a limpeza de arquivos temporários e o fato de que o Provider Config formal que assume o caminho original não é sobrescrito pela migração antiga. O armazenamento físico mantém as funções internas de leitura e de migração até que todas as entradas de migração de compatibilidade saiam.

## 214. O salvamento das Settings passa a usar um Effective Config estruturado

A página de configurações entregava antes o formulário antigo `ModelProviderConfig` diretamente ao Provider Runtime, e o Runtime chamava internamente o adaptador de migração única. Isso mantinha o tipo de formulário antigo como protocolo de escrita do Settings Service e dava a Official Providers e Personal-only Providers dois caminhos de salvamento distintos.

Esta rodada acrescenta `ProviderSettingsFacade.saveEffectiveProvider()`. Ele recebe o estado de edição completo e estruturado de Provider e Model, calcula um Personal Overlay esparso sobre o Official Config do Snapshot atual do Registry e, em seguida, substitui atomicamente o Provider e o Model Config exato de uma só vez por `ProviderConfigService.replacePersonalConfig()`. O Renderer pode continuar usando temporariamente o formulário antigo, mas a lógica de conversão é reunida em `providerPersonalSave.ts`: o Provider Service não conhece mais o formulário antigo e não fornece mais `saveLegacyPersonalApiProvider()` nem `importLegacyProviderFormConfig()`.

Este passo não alterou o comportamento de produto da página de configurações: a ordenação após o salvamento, os atributos de modelo, as regras de reasoning e os Official Overrides continuam sendo exibidos pela View Effective atual; a mudança está apenas na fronteira de escrita, e o Personal Config não guarda mais campos padrão expandidos a partir do Official Config. A adição e a renomeação de Provider, a sobrescrita de Official Provider, a configuração exata de modelos e a substituição atômica são todas cobertas pela mesma cadeia de Facade. Os testes relacionados de Provider, Services e Renderer passaram, `pnpm typecheck` passou e o lint permanece com 0 error.

## 215. Auditoria de fechamento das fontes da verdade de produção de M2.3c / M2.5c

Esta rodada auditou a superfície de chamadas dos dois itens do plano que ainda estavam marcados como "em implementação". O caminho de produção dos API Providers comuns passa uniformemente por `ApiProviderModelRuntime` quando existe um `ProviderRegistry` de processo; `provider-registry-app-runtime.test.ts` já cobre a criação de Model pelo Registry, o erro direto para modelo ausente, a não entrada do Workspace Overlay antigo no Registry de execução e a reutilização do mesmo Registry de processo pelos Child Runtimes de Workflow. `createRuntimeModelFactory` ainda aparece em `turn-execution-model-source.ts`, mas ele é responsável apenas pela origem de modelos temporários do período de execução, o que pertence ao escopo de Providers execution-scoped posterior e não à leitura de fatos de Providers comuns de longo prazo.

Ao mesmo tempo confirmou-se que os modelos padrão e mapeamentos remanescentes em `presetModelDefaults.ts`, no antigo `modelProviderServiceStorage` e no código auxiliar de Preset que ainda tem consumidores são usados apenas pela migração única Personal/Account ou por Entries internas de compatibilidade que ainda não montaram o novo Registry. Eles não participam da resolução de Provider/Model do novo Registry nem sobrescrevem os novos fatos de configuração de Official / Personal / Account. Nenhum código é removido aqui, porque as CLI/TUI/avaliações internas atuais ainda dependem dessas entradas de compatibilidade; a remoção deve ser marcada para depois que os consumidores correspondentes concluírem a migração e validada separadamente para que a entrada de migração não perca dados.

Portanto, M2.3c e M2.5c podem ser marcados como concluídos. O alvo de limpeza seguinte é retirar os consumidores de compatibilidade, e não continuar modificando a cadeia de resolução de produção do Registry.

## 216. Remover o OAuthPresetProviderRepo sem consumidores

A auditoria de referências no nível de símbolos confirmou que `OAuthPresetProviderRepo` e `createOAuthPresetProviderRepo()` não têm consumidores estáticos, e que o repositório também não faz importação dinâmica nem carregamento do módulo por string. Esse Repo antigo lia ao mesmo tempo o Token OAuth, buscava Providers remotos, montava modelos e mapeamentos de Preset, resolvia a Coding Plan Key e produzia o antigo `ModelProviderConfig`. Essas responsabilidades são agora assumidas, respectivamente, pela Account Config Source, pelo Account Credential Service, pelo Request Auth e pelo Official Model Config.

Esta rodada removeu o Repo antigo inteiro, bem como o Provider Meta, a lista de Providers e os tipos dependentes que existiam apenas para ele; o Remote Client, o Provider Resolver, os tipos de Team Plan e os shared helpers ainda usados pela autenticação de requisição atual foram mantidos. As partes de `presetModelDefaults.ts` e do Store antigo que ainda têm consumidores permanecem restritas à fronteira de migração única e de compatibilidade e não foram removidas por engano nesta rodada.

Após a remoção, a verificação TypeScript dos Services passou e os 21 testes em 4 arquivos de teste de Account Credential, Request Auth, Team Plan Key e Preset Shared passaram. Esta fatia não altera o comportamento de produto do Account Provider e remove apenas um segundo construtor que já havia perdido a entrada.

## 217. O Store antigo de Providers sai da sincronização estável de Preset

A auditoria de referências no nível de símbolos confirmou que, no antigo `modelProviderServiceStorage`, apenas `readProviders()` ainda tem consumidores de produção. Eles leem, respectivamente, a entrada da migração única do Personal Config e a Key histórica de Account Provider; a coleta de modelos de Preset, a mesclagem de modelos remotos, o Upsert de Providers OAuth, a injeção de Fallback Providers e a fila de escrita pública já não têm chamadores. Essa lógica, se mantida, deixaria regras de montagem de Provider já descontinuadas e listas de modelos hardcoded dentro da fronteira de armazenamento de migração.

Esta rodada removeu a cauda de sincronização estável sem consumidores do Store antigo, mantendo a leitura de múltiplas versões do Schema antigo, a migração do arquivo físico, a leitura da Key antiga de Account e a normalização de campos históricos que ainda precisa acontecer durante a migração. A lista de modelos padrão, o filtro de modelos gerenciados e a construção do mapeamento Claude, que perderam consumidores junto com a lógica antiga de sincronização, também foram removidos; `presetModelDefaults.ts` mantém apenas a detecção de Provider e a correção de contexto do GLM-5.2 ainda usadas pela migração do arquivo antigo.

Este passo não altera o comportamento atual do Registry, da página de configurações, da execução de modelos ou da autenticação de conta; ele apenas estreita ainda mais o Store antigo até a fronteira de migração única. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os 7 testes em 3 arquivos de migração atômica do Store antigo, importação do Personal Config e migração de Account Key passaram.

## 218. A Key de requisição de Account sai do Remote Client antigo de Preset

Depois da remoção do antigo `OAuthPresetProviderRepo`, a resolução da Key de conta ainda usava o Remote Client e o Provider Resolver extraídos dele. A auditoria da superfície de chamadas confirmou que o código de produção usa apenas a requisição da interface de negócio genérica e `resolveProviderApiKey()`; `release/latest`, `client/configs`, a conversão de fatos remotos de Provider/Model, a construção de Preset ZAPI e a construção do Endpoint de Coding Plan já não têm consumidores. Mantê-los formaria uma aparente fonte da verdade remota de Official Providers ainda funcional, em conflito com o Official Config versionado atual.

Esta rodada estreitou as capacidades restantes e as renomeou conforme sua função atual, para `AccountProviderApiClient` e `AccountProviderApiKeyResolver`. O primeiro interpreta apenas o Envelope da interface de negócio, e o segundo obtém ou copia a Coding Plan API Key com base no Token da conta. O cache de Config Version, o fetching de Client Config e a construção de Providers do Remote Client antigo foram todos removidos; os tipos remotos de Provider, os módulos de encaminhamento de configuração, as funções de conversão compartilhadas e os testes que existiam apenas para essas capacidades saíram junto. A correção da URL histórica da BigModel usada pela migração do Store antigo continua dentro do arquivo de migração; a seleção de projeto pessoal e o julgamento de códigos de estado de negócio foram realocados, respectivamente, para o Account Key Resolver e o Account API Client.

Este passo não altera a semântica de Account Connection, Credential Store ou autenticação de tempo de requisição. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os 19 testes em 6 arquivos de Account Credential, Request Auth, Team Plan Key e migrações Personal/Account passaram.

## 219. Constantes de modelo de Preset voltam para a fronteira de migração do arquivo antigo

Depois da limpeza do Store estável e da construção de Remote Config, `presetModelDefaults.ts` ficou com apenas três consumidores, todos dentro da migração do arquivo antigo de Providers: reconhecer o Provider histórico de GLM, reconhecer o Provider histórico de plano com contexto fixo e corrigir o valor histórico de contexto do GLM-5.2. Essas regras não constituem mais valores padrão atuais de Provider e também não devem continuar existindo na forma de um módulo reutilizável.

Esta rodada removeu esse arquivo e inlineou as três regras como funções privadas com semântica `legacy` dentro de `modelProviderServiceStorage`. O novo Registry, o Official Config, o Account Access e a execução de modelos não conseguem mais referenciar essas regras. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os 7 testes em 3 arquivos de migração atômica do Store antigo, importação do Personal Config e migração de Account Key passaram.
## 220. Auditoria da Configuração restante de Client Config e da fronteira Account Access / Off-Peak

Depois que o Remote Config antigo de Preset saiu, o repositório ainda tem requisições de serviço de planos a `client/configs` e a leitura de `builtinModels`. A auditoria da cadeia de chamadas confirma que esses dados não constroem mais um Provider comum de longo prazo nem entram no Registry de nível de processo: o `billing/balance` do Start Plan apenas projeta os IDs de Model permitidos para a conta atual como o filtro `models` do Account Provider Overlay; Properties, Option Specs e regras de Adapter dos modelos continuam vindo do Official / Personal Config.

`client/configs.configs.offPeak.allowed_models` e os `builtinModels` da mesma resposta são usados hoje apenas para construir o `allowedModelConfigs` temporário das tarefas ociosas. Ele acompanha o `turnRuntimeModel` enviado com a tarefa, pertence à entrada de compatibilidade de um Provider execution-scoped e será movido pelo M4 para a cadeia unificada de Config temporário de Provider / ModelFactory. Ele não deve ser gravado de volta no Registry de longo prazo nem ser removido por engano no M2 como se fosse uma fonte de fato de Official Providers comum.

Portanto, a fonte da verdade de longo prazo do M2 continua única: as três camadas de Config Official, Personal e Account Access. Os metadados de modelo remotos restantes têm apenas escopo de execução, e sua condição de saída é gerenciada pelo M4.

## 221. Concretizar o Human in the Loop: retirar a camada de wrapper do ModelConfig.apiAdapter

Os itens 11 e 12 do Human in the Loop já deixaram explícito que a camada de configuração não introduz mais `ModelApiAdapterConfig` e que `reasoningMapping` pertence diretamente ao `ModelConfig`. O código e o Official Config ainda usavam `model.apiAdapter.reasoningMapping`, o que mantinha como forma de fato uma camada de wrapper já revertida por decisão, presente no Schema público, na projeção diferencial do Personal, na projeção de Settings e no Registry Model Runtime.

Esta rodada convergiu a cadeia de configuração para:

```text
ModelConfig
├─ properties
├─ optionSpecs
└─ reasoningMapping
```

O Overlay, a validação de integridade, o parsing do Schema, a projeção diferencial do Personal Config e o Registry Runtime agora leem `reasoningMapping` diretamente. Quando um modelo declara `optionSpecs.reasoningLevel`, o caminho de erro de integridade aponta também diretamente para `reasoningMapping.<level>`. As 44 regras do Official Config passaram do objeto de wrapper para campos diretos; o `preserveThinking` e o `reasoningContentField` antigos não foram migrados para o novo formato.

As importações da CLI antiga e da configuração antiga do Desktop continuam preservando o `reasoningLevel` formal e o resultado do mapeamento, mas gravam diretamente nos campos novos. A mudança não alterou os parâmetros de raciocínio recebidos pelo Adapter, nem a ordem das regras de `apiMatch`, nem a projeção de namespace do AI SDK, nem os parâmetros de compatibilidade existentes de GLM/Anthropic; ela remove apenas um nível de configuração que já havia sido revertido por decisão humana. Os testes direcionados de Provider, Bootstrap, Services e UI passaram, e `apiAdapter` não é mais aceito como novo campo de Provider Config.

## 222. Auditoria de fechamento do Human in the Loop

A revisão item a item da implementação atual confirmou que as decisões dos itens 1 a 13 do Human in the Loop que afetam o Provider comum de longo prazo do M2 já foram implementadas: o Account Config reaproveita o Overlay de três camadas, o Registry preserva o last-known-good, Model Options arbitrários, Headers de nível de modelo e a chave de Usage saíram, e o `accessId` em nível de conta, a autoridade remota de Provider, o desacoplamento de Usage, o camadas `access/api`, a Config formal v1 e o `reasoningMapping` direto já entraram na cadeia de produção.

O item 14 descreve o Builtin Provider das tarefas ociosas e o material de autenticação em nível de Turn. Isso pertence ao refactor de Providers execution-scoped do M4; o M2 atual apenas garante que a origem temporária não entra no Registry de longo prazo e não antecipa o desenho da capacidade de autenticação nesta rodada. O padrão hardcoded `GLM-5.2` após o login Standalone também pertence à estratégia de inicialização de Selection e depois será mudado pela fase de Interaction para produzir candidatos a partir do Registry, sem continuar se espalhando como fato estático de Provider.

O código restante no Bootstrap que completa capacidades de Reasoning e mídia por nome de modelo atende apenas às Entries antigas ainda não migradas e aos modelos temporários de Turn. Os Providers comuns que o Registry de processo possui já leem o ModelConfig diretamente e não passam por essas regras de Catalog.

## 223. O Workspace Catalog sai do preflight de modelos do Registry

O preflight de Session usava antes `app.listModels()` e o Workspace Catalog antigo para decidir se o modelo estava disponível. Mesmo com o Registry de processo já tendo publicado o modelo atual, desde que existisse outro modelo disponível no Catalog antigo o modelo atual ainda seria recusado e haveria fallback; e a ordem do fallback priorizava o Catalog antigo em vez da ordem do Registry.

Agora, no modo de Registry de processo, o `app.listModels()` apoiado no Registry é a única verdade de associação e de primeiro item, e o Workspace Catalog continua guardando apenas o estado de seleção default e recente. A Entry antiga sem Registry montado mantém a filtragem por Catalog original, evitando expor um base model oculto da CLI como opção. Os novos testes cobrem, respectivamente, o modelo atual do Registry não ser recusado pelo Catalog antigo e o fallback para o primeiro item do Registry depois que um modelo é removido.

O mesmo arquivo de teste expôs uma regressão já existente no nível default de GLM-5.3 temporário de Turn: ao completar os níveis, a camada de compatibilidade trocava o `high` passado explicitamente pelo Host pelo `max` padrão do Catalog. Esta rodada preserva o nível default legítimo recebido e completa apenas o mapeamento de protocolo; isso não altera o Registry de longo prazo nem inicia o refactor de autenticação das tarefas ociosas.

## 224. O Registry de processo sai da projeção de Workspace Provider e da escrita de volta do Runtime

Ao continuar a auditoria da cadeia de chamadas do Workspace Catalog, foram encontradas quatro novas refluxões de fatos antigos além do preflight de associação:

- `syncAppWorkspaceModelCatalog()` grava o Overlay do Catalog antigo e as capacidades de modelo de volta no App do Registry;
- `createWorkspaceZCodeApp()` verifica apenas o `providerRegistry` passado diretamente e não enxerga o Registry de processo injetado pelo wrapper da Entry, podendo ainda gerar o antigo `bootstrapModelConfig`;
- o Workspace State mescla a Registry View do App com os Providers do Catalog antigo e publica um `providerRevision` antigo;
- o usage de recuperação a frio do V4 lê a context window do Catalog antigo, e a troca entre Providers também usa o Catalog antigo para julgar a associação.

Esses caminhos alteram de fato atributos, membros visíveis ou resultados de troca de modelo dos Providers comuns de longo prazo e violam diretamente a fonte da verdade única do M2, portanto não foram adiados como um todo sob a desculpa de "o protocolo antigo será removido depois". Esta rodada convergiu tudo na fronteira `hasProcessProviderRegistry`: a sincronização antiga de Workspace Provider e a escrita de `runtimeModel` pelo Host tornam-se no-ops; a inicialização do App não gera mais o bootstrap antigo; a Workspace View mostra apenas o `app.listModels()` apoiado no Registry; o Provider alvo da troca é julgado pela mesma View; a context window da recuperação a frio usa os atributos de modelo já fixados no Runtime do App atual; e o providerRevision antigo não se faz passar por revision do Registry.

O Workspace Catalog ainda mantém o estado de interação de default, last-used e mode, e continua servindo as Entries antigas que ainda não montaram o Registry de processo. O Provider temporário de um único Turn ainda usa o Turn Overlay separado, e seu ciclo de vida completo e a reformulação da autenticação ficam para o M4. O helper antigo de Active Session Model Limits, sem chamadores de produção, é apenas um item de limpeza e não afeta a autoridade atual; na mesma auditoria, o helper antigo de broadcast de Session Settings, também sem chamadores, foi removido diretamente para parar de sugerir que o Workspace Provider Catalog ainda conduz ativamente a Session do Registry.

As novas regressões cobrem o modelo do Registry não ser recusado pelo Catalog antigo, o fallback para o primeiro item do Registry, o bloqueio da escrita do Overlay/Runtime antigo, o Provider alvo da troca ser julgado pela Registry View, a context window vir do Runtime atual e a Workspace View não misturar Provider/revision antigos. O teste de montagem real do Protocolo também passou a definir apenas o sinalizador de Registry de processo, para que o teste não mascare a lacuna de montagem de produção injetando Opções do App diretamente.

A verificação adicional dos protocolos de produção confirmou que o `runtimeModel` comum e o `turnRuntimeModel` das tarefas ociosas já têm uma fronteira clara: o primeiro é o Snapshot de compatibilidade antigo derivado pelo Host, e o segundo entra em uma execução única por meio de um Turn Overlay independente. Impedir que o primeiro seja gravado no Workspace Catalog no modo Registry de processo não trunca as tarefas ociosas. O campo antigo do protocolo ainda pode ser transmitido e submeter ModelSelection, mas não pode servir para restaurar a autoridade de Host Snapshot de Providers comuns.

## 225. O Workspace Read State sai da responsabilidade de escrita de modelos

Ao continuar auditando a entrada de protocolo de `runtimeModel`, descobriu-se que `workspace/readState`, embora tenha nome de interface de leitura, ainda permite que o chamador carregue um `runtimeModel` completo. Se o Workspace já tem uma Active Session, ele grava o thought level contido nela na Session antes de construir a projeção de retorno e atualiza `record.modelRuntime`. Isso fazia da reposição de catálogo, da restauração de janela e da preparação do Repo Wiki possíveis escritores ocultos do estado de modelo.

Esta rodada convergiu `workspace/readState` para uma projeção estritamente de leitura: o Schema do protocolo, os parâmetros dos Services e a implementação do Bootstrap removem `runtimeModel`; a Active Session apenas lê o Runtime do App atual e não é mais modificada pela consulta do Workspace. O `prepareWorkspaceWithZCodeSessionService` da UI também remove o `preferredRuntimeModel`, e a Session adiada submete apenas ModelSelection; o Repo Wiki usa a mesma entrada. Alterações de modelo ou de reasoning continuam sendo feitas por comandos explícitos de Session/Submission.

Os testes de regressão provam primeiro que a implementação antiga aceitaria o campo e chamaria `setThoughtLevel("max")`, e depois fixam que o novo protocolo rejeita o campo antigo, que não ocorre escrita na Active Session e que o pedido de Session adiada não carrega mais o Host Snapshot.

## 226. O Workspace Default Model passa a guardar apenas Selection

Os chamadores de `workspace/setDefaultModel` já submetem apenas `ModelSelection`, mas o protocolo e os tipos dos Services ainda permitem anexar um `runtimeModel` completo, e o Worker o incorporava ao Workspace Catalog antes de salvar o modelo padrão. Isso fazia a escrita da "próxima seleção default do rascunho" ainda poder criar fatos de Provider de passagem, em conflito com a autoridade do Registry de processo.

Esta rodada removeu esse campo do protocolo compartilhado, dos parâmetros do Agent/Session Service e da implementação do Worker. Os Services não executam mais a verificação de consistência entre os campos `model` e `runtimeModel`, nem registram ou encaminham o Snapshot derivado. O Workspace Default continua guardando providerId, modelId e o estado de interação de thought/mode independente; ao criar de fato o App do rascunho, o Registry do Environment alvo valida a Selection e cria o Model.

Os testes do protocolo compartilhado fixam primeiro que um `runtimeModel` antigo válido precisa ser rejeitado pelo Schema estrito; as regressões de Bootstrap, Services e UI confirmam que o comportamento de escrita do modelo padrão e de preparação de rascunho permanece inalterado.

## 227. Os comandos de modelo comum do V4 saem do Host Runtime Snapshot

Embora os chamadores de produção de `createSession` e `switchModelConfig` do V4 já submetam apenas Selection, o Schema compartilhado, o Command Handler e a Bridge ainda mantinham um fallback de `runtimeModel`: o Host podia entregar ao Worker um Snapshot completo de execução de Providers, e a Bridge o instalava no Workspace Catalog antigo. Isso conflita com a autoridade do Registry do Environment alvo.

Esta rodada removeu o campo `runtimeModel` dos dois comandos e estreitou a capacidade da Bridge para `ensureProviderAvailable()`: ela valida o providerId apenas no Registry atual do Worker e não recebe nem instala Snapshot de Provider. O `sendText.turnRuntimeModel` das tarefas ociosas permanece independente e continua expressando um Model execution-scoped.

Os testes de regressão também revelaram que o desvio de Repo Snapshot, na ausência de `runtimeModel`, chamava `workspace/readState` para adivinhar o Provider do turno — o que podia bloquear o upload lateral e ainda consumir o estado antigo de modelos do Workspace. Agora o desvio usa apenas a Selection explicitamente carregada pelo comando ou o Model temporário do Turn; quando faltam, é permitido que os metadados do modelo fiquem vazios, e a atribuição real da requisição continua sendo responsabilidade do Usage/Trace do Model.

## 228. O protocolo antigo de Session sai do Host Runtime Snapshot

Depois de convergir os comandos de modelo comum do V4, o protocolo antigo de Session ainda permitia que o Host carregasse um `runtimeModel` completo em create, resume, send, compact, setModel e setThoughtLevel. O Worker gravava esse Snapshot no Workspace Catalog, atualizava o Runtime do App e mantinha um conjunto Host/Worker de CAS com `modelRuntimeRevision`. Mesmo sem chamadores de produção, a capacidade do protocolo ainda podia recriar uma segunda fonte da verdade de Providers.

Esta rodada removeu `runtimeModel`, `expectedModelRuntimeRevision` e `modelRuntimeRevision` da Session comum, do protocolo compartilhado, dos tipos públicos dos Services e da implementação do Bootstrap. A criação e a restauração de Session recebem apenas ModelSelection persistida ou explícita; alterações explícitas de modelo e de reasoning continuam passando pelos comandos correspondentes, e o Worker usa o Registry do Environment ao qual pertence para validar e criar o Model. O cache derivado do Worker, a comparação de revisions, a atualização e os ramos de erro que existiam junto com o Host Snapshot foram removidos junto.

O `turnRuntimeModel` do `sendText` do V4 permanece inalterado. Ele é a entrada execution-scoped do Turn atual das tarefas ociosas, cria o Model por meio de um Turn Overlay independente e não é gravado no Registry de longo prazo. O desvio antigo de Session do Repo Snapshot não adivinha mais metadados de modelo do Workspace quando não há um modelo de execução explícito; a atribuição real do modelo continua sendo responsabilidade do Usage e do Trace do Model em execução.

Os 285 testes direcionados do protocolo compartilhado, de Services/V4 e do Bootstrap passaram; as verificações TypeScript da raiz e do Bootstrap passaram. Os testes de comportamento antigo foram removidos, e os testes de Workspace State somente leitura e de rejeição de campo antigo foram preservados.

## 229. Reconectar as novas funcionalidades de staging pela autoridade do Environment alvo

Depois que o `staging` remoto foi revertido e recriado pela equipe, o branch de Provider foi todo rebaseado sobre o novo grafo de commits. A nova linha de base acrescenta a capacidade de reconciliação do catálogo de modelos da página de configurações de Subagent: quando o formulário de configurações encontra que o Workspace alvo não tem o modelo, a implementação antiga injetava primeiro o Registry do Host no Worker e só então lia o Workspace State. Isso recriava a segunda fonte da verdade que o M2 já havia removido.

Esta rodada preserva a detecção de ausência, a proteção contra respostas expiradas, uma única nova tentativa e a projeção do formulário de configurações, e apenas converge a cadeia de sincronização para:

```text
目标 Environment Worker Registry
        |
        | workspace/readState
        v
Renderer 设置表单投影
```

O Renderer não injeta mais o Host Registry no Worker local ou remoto. O Environment alvo mantém seu próprio Registry, e a página de configurações apenas relê o catálogo de modelos publicado pelo ambiente de execução alvo. Os dois conjuntos de testes especializados, que cobrem leitura direta, descarte de resultado expirado, nova tentativa em caso de falha e troca de Remote Session, somam 9 testes e passaram.

No mesmo rebase, a nova linha de base acrescentou testes de múltiplos planos e de baldes de cota do Start Plan. Esses testes ainda usam diretamente o `ModelProviderService` já descontinuado para construir parâmetros, fazendo com que o Provider migrado não consiga obter `accountAccessId` e a requisição degrade para "não configurado" antes mesmo da autenticação. Esta rodada apenas conecta os novos casos à montagem existente de Account Request Auth de `createProviderForTest()`; a ordem dos múltiplos planos, o filtro de planos não ativos, o `planId` do balde de cota e a lógica de produção para `expires_at` ausente mantêm a semântica da nova linha de base, sem restaurar a leitura de credenciais do Provider Config antigo. Os 230 testes de Plan e de configurações passaram.

O tratamento de conflitos segue o mesmo princípio: preservar as funcionalidades de produto e os contratos de dados da nova linha de base; toda implementação que dependia do Host Snapshot antigo, da injeção do Workspace Registry antigo ou do Provider Service antigo passa a se conectar ao Registry do Environment alvo e à autenticação de tempo de requisição, sem trazer de volta para o novo branch os commits do staging antigo que a equipe havia revertido.
## 230. O Process Registry vira dependência obrigatória da Entry de protocolo

A auditoria final de descontinuação confirmou que o Bootstrap ainda permitia ficar sem Registry de processo e completar Provider, Model, Properties e revision por meio do Workspace Provider Catalog. Esse fallback mantinha passando Harnesses que construíam o App do Bootstrap diretamente e mascarava erros de montagem das Entries de produção.

Esta rodada tornou o Registry de processo uma dependência obrigatória da Entry de protocolo. Sem os caminhos de Official ou Personal Config, a inicialização falha diretamente; as Entries de produção e os Harnesses de teste montam explicitamente o Registry. A bifurcação `hasProcessProviderRegistry` foi removida, `workspaceModelCatalogs` foi reduzido e renomeado para `workspaceModelPreferences` e passa a guardar apenas default, last-used, thought level, mode e revision. Associação de Providers, atributos de modelo, context window e ordem de fallback passam a vir uniformemente da Registry View.

O Host Runtime Snapshot das Sessions comuns já saiu; o `turnRuntimeModel` das tarefas ociosas continua como um Execution Overlay de execução única e não é gravado no Registry nem nas Workspace Preferences.

## 231. Limite de release do DTO do formulário de configurações

A avaliação de limpeza planejava original fazer a página de configurações abandonar por completo o antigo `ModelProviderConfig` dentro do M2. Uma verificação mais detalhada mostrou que esse tipo é hoje apenas um DTO de formulário interno do Renderer: a Settings View é projetada em um formulário editável e, ao salvar, o Provider/Model Config formal é gerado. Ele não lê arquivos, não constrói Registry, não decide se um modelo é selecionável e não cria Models de execução.

Reescrever todo o formulário de configurações ao mesmo tempo ampliaria a superfície de regressão de UI antes do release sem convergir mais a fonte da verdade. Por isso esta rodada mantém essa camada de adaptação isolada e a registra explicitamente como ponto de remoção do futuro refactor da experiência de configurações. A importação do formato físico antigo também continua usando uma forma Legacy privada; nenhuma das duas pode ser dependida pelo caminho de estado estável do Registry.

## 232. Verificação final do M2

Depois de concluída a limpeza de descontinuação, `pnpm typecheck` e `pnpm lint` da raiz passaram, com o lint em 0 error; os testes direcionados de Services/UI, 117 em 10 arquivos, passaram, os testes direcionados de Bootstrap, 219 em 6 arquivos, passaram, e o typecheck isolado do Bootstrap passou.

A suíte completa do Bootstrap expôs separadamente uma dívida de testes já existente: mocks de Session Persistence sem os métodos novos, imports entre domínios já existentes no Native Boundary e alguns timeouts históricos. Esta rodada não empacotou essas falhas como regressão de Provider nem afirmou que a suíte completa passou; essa fronteira de verificação é preservada na entrega.

## 233. Adaptação do MCP oficial e do Usage no Staging mais recente

No rebase final de release, o `staging` acrescentou os Headers de identidade do MCP oficial do Server, a exibição de cota de MCP e o diálogo unificado de reset de cota. A implementação original julgava a existência do Coding Plan Provider por meio do `ModelProviderService.getProviderRegistrySnapshot()`, que o M2 já havia removido, e injetava diretamente o Provider Config antigo no Usage Provider nos testes.

O tratamento de conflito preserva a semântica de produto das novas funcionalidades: o Header de identidade do MCP, os cinco campos de identidade, a requisição de cota, a barra de cota de MCP separada, o diálogo unificado de reset e a largura dinâmica do painel de contexto foram mantidos. A existência do Provider passa a ser lida da `ModelSelectionView` formal, e a autenticação do Usage passa a usar `AccountRequestAuthService` com `accessId`, sem restaurar o Snapshot antigo nem o Provider Service antigo.

Após o rebase, o typecheck e o lint da raiz passaram; os testes direcionados de MCP, Usage, Provider, Repo Wiki, seleção de modelos e UI, 258 em 15 arquivos, passaram, e os testes de Registry/protocolo do Bootstrap, 219 em 6 arquivos, passaram. O Node 22 local atual é inferior ao Node 24 declarado pelo repositório, e a pipeline padrão ainda precisa de uma verificação final no runtime formal.

## 234. O Workspace Snapshot remove o catálogo de Providers duplicado

A auditoria final de protocolo descobriu que `workspace/readState` já devolvia `settings.model` e mesmo assim retornava uma `modelCatalog` adicional. Essa estrutura reprojeta Provider, atributos de modelo e revision no protocolo antigo; a UI não a consome mais, e o único leitor de negócio é o primeiro despacho de tarefas ociosas, enquanto o `{ modelCatalog }` enviado pelo `state.updated` do Workspace também não é reconhecido pelo parser de Settings existente dos Services.

Esta rodada removeu `ZCodeWorkspaceModelCatalogState`, o campo do Snapshot, o mapeamento do Bootstrap e a lógica de agrupamento de Providers. O despacho ocioso passa a herdar diretamente o `settings.model.current` já resolvido pelo Environment alvo e a validá-lo em `settings.model.available` como ainda disponível. A notificação de atualização do Workspace envia o mesmo Patch de Settings, e a semântica de revision de default, thought level e mode permanece inalterada.

A auditoria de referências confirma ao mesmo tempo que `convertModelProviderConfigToZCodeProviderInput()` já não tem chamadores de produção, restando apenas testes especializados de projeção de protocolo antigo; ele foi removido junto com seus helpers privados de endpoint, capacidade de mídia e conversão de Provider. A estrutura de migração de reasoning/capacidade que ainda se chama `modelCatalog` dentro do CLI Adapter é uma fronteira de compatibilidade do lado da execução e não foi tratada em conjunto nesta rodada.

As regressões direcionadas de Shared, Services, Bootstrap e UI, 299 no total, passaram, e as verificações TypeScript e de lint da raiz passaram; o lint está com 0 error e 36 warnings da linha de base atual.

## 235. Remover a entrada de escrita de Workspace Provider Overlay do App

Depois da limpeza do protocolo e do Snapshot, a auditoria do Bootstrap descobriu que `ZCodeApp.setModelCatalogOverlay()` já não tem chamadores de produção, mas o App ainda guardava um Overlay de Provider/Model em nível de Workspace e o misturava à lista de modelos, às Properties e ao Registry antigo do Adapter. Isso permitia que um Snapshot completo de Workspace, já descontinuado no protocolo, voltasse a entrar pela API pública do App, em conflito com o princípio da fonte da verdade única do Registry de processo.

Esta rodada primeiro mudou os testes para exigir que o App não exponha mais essa entrada e confirmou que a implementação antiga falhava; em seguida a API de Overlay do Workspace, o estado, os listeners e as fakes de teste foram removidos. O `RuntimeModelOverlayManager` agora gerencia apenas o Turn Overlay; tarefas ociosas e outras execuções únicas ainda podem injetar um Provider temporário, mas Providers comuns de longo prazo não conseguem mais contornar o Registry por um Overlay de Workspace.

Os 5 testes especializados de Overlay, o teste de entrada de escrita do Registry e as 45 regressões de Session Facade, recuperação a frio e Overlay ocioso passaram. As 6 asserções do teste completo do Registry App passaram, mas sob Node 22 apareceu a rejeição não tratada já existente `ERA_NEGOTIATION_FAILED` no encerramento do processo de teste de MCP, fazendo o Vitest retornar um código diferente de zero por ruído de infraestrutura de teste; esse problema não tem relação com a remoção do Overlay desta rodada, e a verificação completa continua sendo feita com o Node 24 exigido pelo repositório.

## 236. A remoção do Legacy do App Factory nu vira migração da base de testes

Depois da remoção do Overlay de Workspace, a auditoria continuou e descobriu que `createZCodeApp()` ainda permitia não injetar o Process Registry e mantinha o Runtime Config antigo, o Model Catalog e a bifurcação `includeLegacyProviderModels`. Depois que um teste de portão foi adicionado e a entrada da fábrica passou a recusar a ausência de Registry, os casos formais de Registry passaram como esperado, mas 56 casos das suítes de Session Persistence, MCP, Workspace Hook e Script Workflow do Bootstrap falharam.

As falhas não eram simplesmente a falta de um parâmetro: alguns casos ainda validam o CLI Provider Config antigo, e outros injetam a forma antiga de ModelPort sem o `createModel()` que o novo ModelFactory exige. Usar uma Registry falsa estática mudaria a semântica dos testes e mascararia lacunas reais de migração. Por isso esta rodada reverteu o portão do App Factory que ainda não havia sido commitado, sem levar uma migração mecânica não confiável para o branch de release.

O Prompt CLI, a TUI e a Entry de Protocolo formais já iniciam e injetam o Process Registry antes, de modo que a cadeia de fatos de produção não é afetada. Uma fatia independente posterior precisa migrar ou remover primeiro os testes especializados de Providers antigos, depois converter os demais Harnesses para um fixture real de Registry Model e, ao mesmo tempo, atualizar as ferramentas de Compact/Memory E2E e de Prompt Trajectory; concluído isso, a bifurcação Legacy do App nu é removida.

## 237. Sincronização e verificação final do branch de release

O `staging` remoto avançou para `a9a3a40a53`, acrescentando a política de build padrão da plataforma de MR e correções de CI. Os 7 commits do M2 foram rebaseados sem conflito sobre essa base, sem restaurar implementações que a equipe já havia removido e sem alterar o código de Provider.

Após o rebase, 50 testes de Model Overlay, Session Facade, recuperação a frio do V4 e Turn Overlay ocioso passaram, e o teste de entrada de escrita de Workspace Overlay do Registry App passou. O TypeScript da raiz, o TypeScript isolado do Bootstrap e o lint passaram, com o lint em 0 error e 36 warnings da linha de base atual; `git diff --check` passou. Todos os itens do Human in the Loop estão confirmados, concluídos ou explicitamente substituídos por decisões posteriores, e não há nova semântica pendente de confirmação.

## 238. Concluir a migração do App Factory nu e dos Harnesses internos

A auditoria final de release reexecutou a migração adiada no item 236. Um teste de portão fixou primeiro que `createZCodeApp` sem Registry precisa falhar, e então Session Persistence, MCP, Workspace Hook, Script Workflow e outros testes passaram a usar Harnesses apoiados no Registry. O Harness usa um Model Config completo e um Model Factory executável, mantém as respostas de modelo injetadas pelos testes originais e não usa uma Registry vazia para mascarar diferenças de execução.

Compact/Microcompact, Memory E2E e a ferramenta de gravação de Prompt Trajectory passaram a construir explicitamente um Registry de teste. O arquivo do Harness de Compact mantém apenas configurações não relacionadas a Providers, como Permission, Storage e Feature, e o fixture de Provider é lido à parte como entrada de teste; os campos `provider` / `model` antigos da CLI deixam de carregar fatos de execução.

No lado da produção foram removidos em seguida `bootstrapModelConfig`, o Runtime Model Factory sem Registry, a concatenação da lista antiga de modelos e a bifurcação `includeLegacyProviderModels`. O `RuntimeModelOverlayManager` foi estreitado para um contêiner puro de Provider temporário de Turn e não possui mais um segundo modo de operação que atualiza o Registry do Adapter a partir do Config antigo.

Durante o processo, duas tarefas de manutenção de testes foram tratadas de forma autônoma: os testes de Registry desligam explicitamente o MCP, que não tem relação com o caso, evitando a rejeição de negociação no encerramento; e o Harness de Telemetry Lifecycle passou a receber caminhos vazios de Official/Personal Config e a completar o mock mais recente do MCP Pool. Essas mudanças apenas fazem os testes satisfazerem a montagem obrigatória da Entry formal e não alteram a semântica de produto. A revisão do Human in the Loop não acrescentou itens pendentes de decisão.

## 239. Remover as entradas de execução implícitas do CLI Config antigo

Depois do fechamento do App Factory nu, a auditoria do lado da execução descobriu que `createModelAdapter()`, quando o chamador não fornece nenhuma entrada de modelo, ainda lê por conta própria o CLI Config antigo; o Prompt Trajectory e o BigModel WebSearch Probe também usavam o mesmo arquivo como origem padrão de modelos. Eles contornavam a montagem formal do Process Registry e deixavam fatos de Provider antigos, já fora das Entries de produção, reentrarem na cadeia de execução por ferramentas internas.

Esta rodada tornou a fábrica de Model Adapter uma dependência explícita: o chamador deve fornecer a Config do Registry ou um Runtime Model Config válido apenas para a execução corrente. Os tipos TypeScript e um portão de runtime protegem essa restrição em conjunto. O Prompt Trajectory exige que o fixture ou a linha de comando forneça explicitamente a identidade do modelo, o Endpoint e a origem das credenciais; o WebSearch Probe passou a receber parâmetros explícitos e não lê mais o arquivo antigo do usuário. O antigo `updateModelSelectionInFileConfig()` só era referenciado por um teste especializado e foi removido junto com o teste, de modo que a seleção de modelos não pode mais ser gravada de volta no CLI Config antigo.

O Schema, o Parser e a leitura do Config antigo continuam disponíveis para a primeira importação do Personal Config e para configurações de Harness ainda não migradas, como MCP, Hook e Permission. Eles podem interpretar o formato físico antigo, mas a execução de modelos em estado estável não consome seus campos de Provider, Model ou Model Catalog. Essa é uma separação explícita entre a fronteira de migração e a fronteira de fatos de execução, e não uma segunda cadeia de Providers.

Os 86 testes direcionados de Bootstrap, Adapters e Prompt Trajectory passaram, e as verificações TypeScript isoladas dos três pacotes passaram; o TypeScript e o lint da raiz passaram, com o lint em 0 error e 36 warnings da linha de base atual.

Após o commit, o `staging` remoto avançou mais 7 commits. Os 10 commits deste branch foram rebaseados sem conflito sobre `24ef10c138`; o `range-diff` confirma que 8 commits posteriores já existentes são equivalentes em patch, que o primeiro commit substantivo foi apenas regerado por mudanças de contexto adjacente do upstream e que a remoção de fontes da verdade antigas desta rodada permanece como o 10º commit novo. Após o rebase, os 86 testes direcionados acima, o TypeScript e o lint da raiz passaram novamente.
## 240. O RuntimeConfig genérico sai dos fatos antigos de modelo

Ao continuar auditando a cadeia de consumo do CLI Config antigo, confirmou-se que o App Runtime formal já obtém modelos apenas do Process Registry, da Selection da Session e do Turn Overlay explícito, mas o `RuntimeConfig` genérico, o `ConfigPort` e os metadados de origem do Config ainda guardavam `model`, `modelCatalog` e `hasModel`. Esses campos já não têm consumidores formais de execução e fariam o código posterior acreditar que o arquivo antigo da CLI ou `ZCODE_MODEL` ainda são fontes da verdade de estado estável.

Esta rodada adicionou primeiro testes de falha que fixam que os campos de modelo do arquivo antigo e das variáveis de ambiente não podem entrar em `createConfig().config`, e então removeu os campos de modelo do `RuntimeConfig` e do ConfigPort, as quatro chaves de Model Config e os metadados de origem `hasModel`. Os campos de compatibilidade no Schema antigo e no `RuntimeConfigPatch` são mantidos por enquanto e marcados como deprecated, a serviço da migração única do Personal Config e do Configured Default; eles são descartados na fronteira do ConfigPort e já não conseguem afetar o Agent Runtime.

A verificação TypeScript do pacote completo da CLI revelou em seguida que os tipos de montagem do Prompt CLI e da TUI ainda tratavam o inicializador do Process Registry como dependência opcional, embora `createZCodeApp` já exija um Registry. As Entries formais passaram a relatar diretamente um erro de montagem quando o inicializador está ausente e a injetar sempre o Registry no App; as três bases de teste genéricas da CLI receberam um Registry Runtime mínimo, e os casos especializados de ciclo de vida continuam verificando que o Prompt CLI empresta e depois libera o Registry e que a TUI reutiliza o mesmo Registry de processo ao substituir o App entre Apps. O ajuste não acrescenta nenhuma nova origem de modelos e apenas converge os tipos e as bases de teste a uma restrição de produção já em vigor.

Esta fatia não altera o Turn Overlay: tarefas ociosas e outros Providers temporários execution-scoped continuam criando Models por meio da entrada explícita do Submission e permanecem na fronteira de migração do M4. Nenhum item novo do Human in the Loop foi acrescentado.

Resultados de verificação: os 1327 testes da suíte completa de Adapters, em 86 arquivos, passaram com 3 ignorados; os 41 testes de Bootstrap Runtime Config, Process Registry Runtime e Legacy Importer passaram; os 2 testes de ciclo de vida do Registry da CLI e os 18 testes de CWD e formato de saída passaram; a verificação TypeScript da raiz passou. O arquivo histórico completo de testes unitários da CLI continua sendo interrompido no ambiente Node 22 atual por um caso de Skill sem relação com Provider, que cancela em cascata os casos de limpeza assíncrona seguintes, e por isso esta rodada registra apenas os casos relevantes já isolados como aprovados, sem reportar esse arquivo como totalmente aprovado. O lint da raiz também passou, mantendo 0 error e 36 warnings de linha de base; a verificação TypeScript isolada da CLI passou e `git diff --check` passou.

## 241. Alinhamento com o staging mais recente e verificação pré-release

O `staging` remoto avançou 6 commits até `cf009a3b19` durante o fechamento. Os 12 commits do M2 foram todos rebaseados sem conflito, sem nenhuma escolha manual de conflito e sem restaurar código que o upstream já havia removido. Após o rebase, o TypeScript e o lint da raiz passaram, com o lint mantendo 0 error e 36 warnings de linha de base; os 63 testes de fronteira do Runtime Config, os 41 de Bootstrap Registry e Legacy Importer, os 2 de ciclo de vida do Registry da CLI e os 18 de CWD e formato de saída passaram.

Um comando de filtro de testes digitado errado disparou as suítes completas de Adapters e Bootstrap, expondo falhas de timeout de execução, de fronteira de protocolo do V4, de Session Resident Pool e de temporização do Session Persistence já existentes. Em seguida os casos relevantes desta rodada foram executados novamente com caminhos de arquivo explícitos e passaram todos; essa dívida de linha de base da suíte completa não foi resolvida por código de fechamento de Provider nem reescrita.

## 242. O parsing do arquivo antigo de modelos sai do Runtime Config genérico

O item 240 já fez o `RuntimeConfig` e o ConfigPort formais saírem dos fatos de modelo, mas o `RuntimeConfigPatch` ainda mantinha `model` / `modelCatalog` deprecated, e o parser genérico de variáveis de ambiente e o Config Merger continuavam construindo e mesclando esses campos. Embora fossem descartados depois na fronteira, eles ainda faziam `ZCODE_MODEL`, `ZCODE_BASE_URL` e o Schema do arquivo antigo parecerem entradas válidas de configuração comum de runtime.

Esta rodada mudou primeiro os testes para exigir que as variáveis de ambiente antigas de modelo sejam ignoradas pela Config genérica e que a semântica de compatibilidade de modelo do arquivo antigo continue coberta integralmente pelo parser de migração dedicado. Em seguida os campos de modelo foram removidos do `RuntimeConfigPatch`, do Env Adapter, do Config Merger e da projeção genérica de arquivos, e `parseLegacyCliModelConfig()` foi adicionado como única entrada da migração inicial do Personal Config e do Configured Default. As conversões de compatibilidade complexas de Provider, capacidade e reasoning foram preservadas, mas seus tipos e pontos de chamada ficam explicitamente limitados à migração da CLI antiga e não são mais expostos pela API de Config genérica.

Os 62 testes direcionados de Config de Adapters e os 9 de Bootstrap Legacy Importer passaram; as verificações TypeScript isoladas de Contracts, Adapters e Bootstrap passaram. A alteração não mudou o resultado da migração única do arquivo antigo, nem o Turn Overlay, a Selection da Session atual ou a semântica de execução do Adapter. O Human in the Loop não ganhou itens pendentes de decisão.

## 243. Temporização da atualização de Account e fechamento dos testes de Connectivity

A revisão estática da MR descobriu que, se o ciclo atual de atualização do `AccountProviderService` falha, o loop sai mais cedo. Config ou eventos de conta que chegam durante a falha continuam em `pendingReasons`, mas depois que o in-flight é liberado não há mais ninguém para tratá-los, e o Registry pode ficar com o Snapshot antigo de Account até que um terceiro evento apareça por acaso.

Esta rodada adicionou primeiro um teste de temporização que reproduz o caso: inicialização bem-sucedida, atualização A bloqueada, evento B chegando e A falhando; a implementação antiga chamava o Resolver apenas duas vezes. Depois da correção, o chamador original de A continua recebendo a falha, o Service publica `onDidRefreshError` e preserva o last-known-good, e a liberação do in-flight de A inicia automaticamente o próximo ciclo para B, publicando um novo Snapshot após o sucesso. Associação de Providers, estratégia de falha e regras de mesclagem de eventos não mudaram.

A mesma revisão estática descobriu que os três testes especializados de Connectivity ainda chamavam os antigos parâmetros `endpoints/model/provider`. A página de configurações de produção já usa a interface formal `baseURL/modelId/modelConfig/providerId`, e por isso os testes passaram a construir diretamente o Model Config atual, continuando a verificar URL, Header, mapeamento de reasoning padrão e o comportamento sem mapeamento, sem modificar a Connectivity de produção.

Os 6 testes do Account Provider Service e os 3 do Connectivity Probe passaram; a verificação TypeScript isolada de Provider passou. As duas são apenas fechamentos de implementação e de teste sob semântica já confirmada e não acrescentaram itens do Human in the Loop.

## 244. Projeção Personal e fechamento do salvamento atômico

A revisão estática da MR continuou e encontrou três desvios de implementação em relação às regras de Config Overlay já confirmadas.

Primeiro, ao salvar na página de configurações o Effective Config de um Account Provider, o `accessId` injetado dinamicamente pelo Account Overlay era projetado para o Personal Config. Depois da correção, quando Official e Effective Access são ambos `zhipu-account`, a projeção Personal ignora a identidade dinâmica da conta; a disponibilidade da conta continua vindo apenas do Account Provider Source.

Segundo, `reasoningMapping` é um campo de valor comum no Overlay de Model e a camada posterior deve substituir a anterior por inteiro, mas a função antiga de projeção ainda calculava diferenças dentro de cada nível. Depois da correção, um Mapping sem alteração não grava campo algum no Personal e, quando há alteração, o campo completo é salvo, com leitura e escrita usando a mesma semântica de Overlay.

Terceiro, o `ProviderSettingsFacade` calculava antes o Personal Config inteiro a partir de um Snapshot antigo do Registry e só então entrava no Repository para fazer uma substituição total dentro do lock de arquivo. Um Provider sem relação escrito por outro processo depois do Snapshot e antes do lock seria perdido. Agora o salvamento do Effective é feito pelo `ProviderConfigService` dentro do `update()` do Repository: o Personal Config mais recente é lido sob o lock, apenas o Provider alvo e suas regras exatas de modelo são atualizados, e as regras de Pattern e os demais Providers são preservados. A interface de substituição total continua servindo apenas à migração de configuração e à importação total explícita.

Os três itens receberam testes de falha antes da alteração da implementação. Os 18 testes de Provider Config Service, Facade e Personal Projection passaram. Eles aplicam os princípios já existentes de camadas Official/Personal/Account, de substituição total por campo comum e de atualização atômica do Repository, e não acrescentaram itens do Human in the Loop.

## 245. A criação de Provider deixa de depender da Settings View

A página de configurações ainda usa o adaptador de migração do DTO antigo de edição. Ao editar um Provider existente, o adaptador precisa da Settings View atual para completar os campos herdados que o formulário não expõe diretamente; mas um Provider novo ainda não entrou no Registry, de modo que a View atual naturalmente não tem o item correspondente. O Renderer acabava lançando "ainda não apareceu na Settings View" antes de chamar o Config Service, impedindo salvar um custom Provider novo.

Esta rodada adicionou primeiro um teste de falha e depois tornou a View uma entrada opcional de herança na fronteira de salvamento. Na criação, o Provider e o Model Draft já construídos de forma completa pelo formulário Add Provider são usados diretamente; na edição de um Provider existente, o Effective Config da View continua sendo reutilizado. O teste de conexão usa o mesmo construtor de Draft, de modo que o formulário de criação também consegue disparar um teste de conexão antes de salvar. A correção não reescreve o DTO da página de configurações nem altera as regras de herança e de projeção Personal de Official Providers.

Os 46 testes relacionados a salvamento de configurações, Draft e Provider Config passaram. A saída completa da página de configurações do DTO antigo permanece como fatia posterior de R1, e o bloqueio de release da criação de Provider novo não depende mais dessa migração ampla.

## 246. O re-login OAuth força a atualização da Coding Plan Key em nível de conta

A Coding Plan Key em nível de conta é armazenada em cache com um `accessId` que contém a identidade da conta. O Resolver só pulava o cache quando o motivo da atualização continha `oauth-callback`, mas o Renderer, na cadeia real de conclusão de login, emite `oauth-login-entitlement`. Ao entrar novamente depois de sair da mesma conta, a Account Source podia, portanto, reutilizar diretamente a Key antiga em vez de obter as credenciais de requisição a partir do novo Token OAuth.

Esta rodada passou primeiro o teste da Config Source para os eventos reais do Renderer e reproduziu a falha, e então fez o Resolver reconhecer tanto o evento real de login quanto o evento histórico de callback. A atualização de entitlement após o login agora pula à força o cache de Key em nível de conta; depois de obter a Key do remoto com sucesso, ela substitui a credencial de escopo da conta original, e em caso de falha não há retorno ao valor antigo.

Os 20 testes de Account Config Source, Connection Resolver, Credential Service, Request Auth e OAuth Logout passaram. A remoção precisa da Key de escopo da conta no logout ainda exige que o OAuth Service passe a identidade da conta antes de limpar a Session, e esta rodada não ampliou a interface de ciclo de vida do OAuth para resolver um problema de limpeza de dados; esse item restante continua registrado na revisão de MR R6.

## 247. Remover o armazenamento antigo de Providers dos Services sem consumidores

O M2 continuou auditando os Services pelo princípio de limpar imediatamente o que reduz o dual rail atual. O `knip` encontrou quatro arquivos completos sem uso: `codingPlanCache.ts`, `atomicFileRepo.ts`, `glmWorkspaceConfigRepo.ts` e `providerSettingsJson.ts`. Um `dep:refs` sem escopo confirmou item a item que todas as exportações não têm referência estática nem reexportação, e uma varredura de strings em todo o repositório também não encontrou importações dinâmicas, scripts ou consumidores de teste.

Esses arquivos guardam, respectivamente, o estado antigo de entrada de planos, a leitura e escrita da configuração de Providers do workspace GLM, rascunhos de arquivo atômico que não foram conectados a um Repository de Config formal e o parsing do JSONC antigo de Provider settings. Eles já não participam do comportamento atual do produto e ainda mantêm a forma completa de código capaz de recriar uma fonte da verdade física antiga de Providers. Esta rodada adicionou primeiro um portão estrutural de falha e então removeu os quatro arquivos.

Os 4 testes do portão estrutural e a verificação TypeScript da raiz passaram. A revisão do Human in the Loop continua com 16 itens todos confirmados, sem nenhuma nova semântica de produto ou contrato público que exija decisão humana.

## 248. A autenticação de requisição sai do reparsing do Registry atual

A revisão estática da MR, item R5, descobriu que, depois de um Account Model já criado obter uma nova API Key/Header em cada tentativa de requisição, ele chamava novamente o `resolve()` completo do Registry atual do AI SDK. Se o Provider Config fosse atualizado a quente dentro do mesmo Agent Loop, essa atualização de autenticação trocaria simultaneamente a SDK Factory, o Endpoint, o protocolo, as Provider Options e os Headers estáticos do Model antigo, violando o contrato já estabelecido de que o Model mantém sua identidade e sua configuração estática de execução durante uma execução contínua.

Esta rodada adicionou primeiro um teste de temporização que falha: criar um Model usando o Provider A, substituir o Registry a quente pelo Provider B de mesmo ID e então disparar a autenticação da requisição; a implementação antiga chamava de fato B. Depois da correção, o Adapter captura o snapshot de execução estático do Provider no momento da criação do Model por meio de `bindModel()`. A autenticação da requisição apenas mescla a API Key/Header daquela tentativa nesse snapshot e cria o SDK Model usado pela tentativa a partir dele; atualizações a quente do Registry afetam apenas os Models criados depois. Proxy, roteamento físico e verificação de segurança da requisição continuam sendo gerenciados dinamicamente pelas instalações de requisição do Adapter e não se tornam fatos estáticos do Registry.

Os 56 testes de Model e Registry de Adapters e a verificação TypeScript isolada de Adapters passaram. A correção aplica o desenho de ciclo de vida de Model já existente e não acrescentou itens do Human in the Loop.

## 249. O logout OAuth limpa com precisão a Coding Plan Key em nível de conta

O item 246 já garantiu a atualização forçada da Personal Coding Plan Key em nível de conta após um novo login, mas o logout explícito ainda notificava a limpeza dos Providers derivados somente depois de a Session OAuth ter sido esvaziada. Nesse momento, o Logout Handler só conseguia apagar a Key histórica sem escopo de conta e não conseguia construir o `coding-plan:<provider>:account:<identity>` atual, deixando a Key da conta antiga no Credential Store.

Esta rodada mudou primeiro o teste de falha para exigir que o logout OAuth carregue o Profile ID anterior à limpeza na notificação e para exigir que o Logout Handler apague tanto a Key com escopo de conta quanto a Key histórica sem escopo. A implementação agora captura a identidade da conta dentro da mutação da Session e antes da limpeza da sessão principal; o logout explícito, o unlink, a invalidação por JWT expirado e o logout-all passam essa identidade ao mesmo Handler. Quando a recuperação por credenciais corrompidas não consegue ler a identidade de forma confiável, o fail-safe original é mantido: limpar o fato principal do OAuth,leva os Account Providers a indisponíveis e apagar as Keys antigas que puderem ser determinadas com segurança.

Os 78 testes do OAuth Service e do Logout Handler passaram. A correção completa o restante do problema de limpeza do item R6 da revisão de MR, sem alterar as regras de disponibilidade de conta, de atualização após novo login ou de resolução de Team Plan em tempo de requisição, e sem acrescentar itens do Human in the Loop.
## 250. Remover o Header órfão de override de modelo antigo

Ao continuar executando `knip`, o `dep:refs` sem escopo e a varredura de strings de todo o repositório, confirmou-se que `providers/codexModelOverride.ts` exporta apenas a constante `X-ZCode-Codex-Model-Override`, com zero referências, reexportações ou usos dinâmicos. A seleção de modelo atual, o Submission, o Registry, o Request Auth e as requisições do Adapter não leem esse Header; ele já não é um comportamento de compatibilidade, e sim a forma órfã de uma entrada antiga.

Esta rodada primeiro adicionou o arquivo ao portão estrutural Legacy do M2 e confirmou a falha, e então removeu o arquivo. O portão estrutural agora cobre 5 arquivos aposentados e passa em todos eles. Nenhuma alteração foi feita no parâmetro de modelo da própria CLI externa do Agent nem no script de geração de Changelog, e nenhum item do Human in the Loop foi acrescentado.

## 251. A verificação completa corrige o fixture de Registry aposentado e a inicialização do Server Core por código-fonte

Na primeira execução completa de `verify:pre-push` antes do release, os testes da cadeia principal de Provider revelaram dois pontos de fronteira de teste e de execução de código que ficaram para trás com a troca de interfaces do M2.

Os testes de roteamento do MCP oficial ainda injetavam no `ZCodeAgentService` o já aposentado `providerRegistrySource`. Como o Service atualmente usa a `ModelSelectionView` para decidir se o Provider e os modelos estão prontos, o fixture antigo não fornecia nenhum modelo executável e os 9 testes terminavam cedo no portão de inicialização. O fixture passou a injetar o `modelSelectionReadinessSource` formal, continuando a testar o comportamento original de autenticação do MCP e de roteamento remoto.

O build formal do Server Core embute o Official Provider Config por meio do tsup; o teste de integração em runtime, porém, inicia o código-fonte diretamente com `tsx`, sem a constante de compilação, e o Core saía antes de enviar o ready. O Core agora aceita um `ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE` explícito como entrada de execução por código-fonte, de desenvolvimento e de teste; quando não é fornecido explicitamente, o bundle formal continua materializando o Official Config que ele próprio embute. Os dois caminhos apontam para o mesmo tipo de documento Official versionado, sem recorrer ao Provider Store antigo e sem criar uma segunda fonte da verdade.

Os 11 testes de MCP oficial e de integração do Server Runtime passaram. Outras duas falhas do pre-push completo vieram das asserções de estilo de `ConversationDraftSuggestedPrompts` e das asserções de string de código-fonte de `appARMSBootstrap`; os Git blobs dos arquivos de implementação e de teste correspondentes são idênticos aos de `origin/staging`, o que confirma que não foram introduzidas pelo M2. Seguindo a convenção desta fase de rodar o pre-push completo apenas uma vez, o fechamento é feito com o TypeScript da raiz, o Lint e todos os testes direcionados dos arquivos alterados.

## 252. Remover a cadeia morta do Workspace Model Mirror no Renderer

Ao continuar auditando o Renderer com Knip, descobriu-se que o arquivo inteiro `workspaceModelMirror.ts` já não tem consumidores. Ele mantinha uma fila assíncrona de espelhamento que chamava `setWorkspacePreferredModel` em sequência por Workspace Identity, uma camada auxiliar deixada pelo momento em que o estado de modelo antigo do Workspace precisava ser nivelado ativamente pelo Renderer. A seleção de modelos atual do Composer e da Session já usa a cadeia de controle de Selection ciente de Session, e as duas funções exportadas têm zero referências estáticas, reexportações e referências por string em todo o repositório.

Esta rodada adicionou primeiro um portão estrutural M2 do Renderer que falha, e então removeu o arquivo. O teste do portão e a verificação TypeScript isolada da UI passaram. A revisão do Human in the Loop continua com os 16 itens todos confirmados; remover um espelho sem consumidores não introduziu nenhuma nova decisão de estado, temporização ou semântica de produto.

## 253. O Direct Seed do Desktop E2E converge para o Personal Config

Ao continuar auditando fixtures de teste antes do release, descobriu-se que `custom-openai-provider-store` ainda escrevia o mesmo Replay Provider simultaneamente no antigo `model-providers.json`, no CLI Config antigo e no `config.json` do App. O comentário do próprio fixture ainda descrevia essa escrita tripla como necessária para garantir consistência entre UI e Agent, o que faria os testes continuarem mascarando a fonte da verdade de dois trilhos que o M2 já havia removido.

Esta rodada adicionou primeiro testes de falha que fixam a fronteira formal do Direct Seed: escrever somente o Personal Provider Config versionado; não criar o Provider Store antigo; não modificar conteúdo não relacionado a Providers do CLI Config, como MCP. A implementação passou a reutilizar diretamente os tipos de Config, as Model Rules exatas e o formato de serialização de `@zcode/provider`. O `ModelProviderConfig` antigo de que os chamadores de E2E ainda precisam é gerado apenas no valor de retorno da função e nas leituras de diagnóstico, ou seja, é uma View de teste e não é mais persistido.

`desktop-app.readModelProviders()` também ganhou uma projeção que gera o DTO de teste antigo a partir do Personal Config formal, permitindo que as asserções de E2E existentes migrem gradualmente sem obrigar o fixture a restaurar os arquivos antigos. Os novos testes unitários e a verificação TypeScript do Desktop E2E passaram. O Human in the Loop continua com os 16 itens todos confirmados; a mudança apenas aplica a decisão já existente de fonte da verdade única.

## 254. O Restart E2E sai dos antigos modelos de Provider e de modelo inicial

A auditoria posterior descobriu que o Restart E2E ainda tinha um segundo helper de escrita tripla: o Replay Provider escrevia simultaneamente o Provider Store antigo, a forma antiga de Provider do App e o CLI Provider Config; e o modelo padrão de inicialização a frio do Turbo escrevia o Provider inteiro e os parâmetros de reasoning do modelo no Project CLI Config. Esses fixtures fariam os casos de reinício continuarem dependendo de fontes da verdade antigas que já saíram da cadeia de produção.

Esta rodada adicionou primeiro testes de falha para as duas comportamentos. O Replay Provider agora escreve o Personal Config versionado apenas por `ModelConfigRules.replaceExactForProvider()`, preservando as Pattern Rules existentes e os demais Providers. O modelo padrão de inicialização a frio é gravado em um `model-selection.json` versionado separado, sem copiar Provider nem configuração de reasoning. As capacidades de modelo e o mapeamento de reasoning são fornecidos pelo Process Registry resolvido a partir de Official, Personal e Account.

O caso de prewarm que antes removia artificialmente um Provider do CLI Config foi atualizado junto. Agora ele verifica que, depois que o Host e o Worker inicializam o Process Registry a partir do mesmo Personal Config, o primeiro Session de prewarm mantém o custom GLM; ele não constrói mais a lacuna de Host Snapshot ou de revision de CLI Catalog que já foi removida. O Conversation Catalog, a Coverage Matrix e a documentação de P0 E2E foram atualizados junto.

Os 3 testes unitários de Desktop Provider Seed e a verificação TypeScript do Desktop E2E passaram. O Human in the Loop continua com os 16 itens todos confirmados e nenhuma nova decisão de semântica de produto.

## 255. Remover do Bootstrap os Links mortos de Active Model Limits antigo e de reexportação do MCP

A auditoria de Knip e de referências por strings de todo o repositório descobriu dois arquivos inteiros do Bootstrap sem qualquer consumidor de produção, de teste ou de script. `active-session-model-limits.ts` guardava a implementação antiga que modificava no lugar a capacidade de Runtime de uma Active Session após uma atualização a quente do Registry e reenviava ModelSelected; esse comportamento foi substituído pelo ciclo de vida de Model do M1/M2, em que uma atualização do Registry afeta apenas os Models criados depois. `official-mcp-trusted-origins.ts` apenas reexportava as APIs de MCP Trust do Shared na íntegra, e os consumidores já dependem diretamente do Shared.

Esta rodada adicionou primeiro um portão estrutural do Bootstrap que falha e então removeu os dois arquivos. O local de implementação da especificação do Official MCP passou a apontar para `packages/shared/src/official-mcp-auth.ts`. O comentário histórico do adaptador de modelo padrão do Workspace também foi atualizado para o fato atual: essa entrada guarda apenas o Workspace ModelSelection, e Provider e capacidades vêm do Registry de processo.

Os 2 testes do portão estrutural do Bootstrap e a verificação TypeScript isolada passaram. O Human in the Loop continua com os 16 itens todos confirmados; este item não acrescentou caminhos de compatibilidade nem mudou a semântica de execução.

## 256. O Team Plan E2E sai da escrita tripla antiga de Provider

A auditoria pré-release continuou e descobriu que o Team Plan Usage E2E escrevia o mesmo BigModel Coding Plan Provider simultaneamente no CLI Config antigo, nos campos antigos de Provider do `config.json` do App e no `model-providers.json`. Esse caso testa a troca entre conexões Personal/Team e a exibição de uso, e não a migração de configuração antiga; continuar fazendo as três escritas mascararia problemas reais de montagem entre as três camadas de fatos — Official, Personal e Account.

Esta rodada mudou a preparação do cenário para gravar somente o Personal Config versionado. A camada Personal fornece o endpoint, os campos estáticos de modelo e a sobrescrita de enabled de que o caso precisa, e as respostas do serviço de conta no teste continuam fornecendo a identidade de conexão Personal/Team pelo Account Overlay. Os dois são resolvidos conforme as camadas do Registry de produção, e o teste não monta mais por conta própria uma terceira Provider Store.

A verificação TypeScript do Desktop E2E e o Lint dos arquivos alterados passaram. O Human in the Loop continua com os 16 itens todos confirmados; essa mudança apenas aplica a decisão já existente de fonte da verdade única e não altera o comportamento do Team Plan para o usuário.

## 257. O Reasoning E2E remove o fallback de leitura antiga de Provider

As quatro E2E de revisão manual de Reasoning, ao resolver o endpoint de replay, contornavam a projeção de teste unificada e liam separadamente o antigo `model-providers.json` e o CLI Provider Config antigo. O Direct Seed e a gravação via Settings já foram convergidos para o Personal Config, de modo que esses fallbacks não fornecem nenhum fato válido novo e só fariam os casos rodarem usando arquivos antigos quando a configuração formal estivesse ausente.

Esta rodada removeu as duas camadas de fallback. Os casos continuam preferindo as variáveis de ambiente explícitas e o arquivo de replay de runtime; quando precisam ler da configuração de produto, usam uniformemente a projeção do Personal Config de `readModelProviders()`. O próprio helper mantém a compatibilidade com o Store antigo necessária ao diagnóstico da migração inicial, e os casos não copiam mais lógica de migração por conta própria.

A verificação TypeScript do Desktop E2E e o Lint dos quatro arquivos passaram. O Human in the Loop continua com os 16 itens todos confirmados; a mudança não altera as asserções de requisição de Reasoning nem as interações de configurações.

## 258. A requisição de reset de cota passa a carregar o escopo de Account Access

A auditoria final de Lint descobriu que os detalhes das configurações já resolvem o `accessId` atual do Personal/Team Plan a partir da Registry View e o repassam para o `CodingPlanStatusPanel`, mas o Panel não o entrega ao hook de reset de cota. O `sourceKey` pode isolar o estado de exibição local, mas a requisição de serviço ainda precisa do `accessId` para localizar a conexão da conta. A omissão faria as requisições de reset Personal/Team do mesmo Provider perderem o escopo formal de Account Access.

Esta rodada apenas completou a passagem desse parâmetro, sem restaurar credenciais de Renderer nem API Key de Provider. Um spread de objeto sem sentido encontrado no mesmo turno no Model Selection Repository também foi eliminado. Os 205 testes direcionados de Coding Plan e de Model Selection passaram, e o Lint dos arquivos relacionados não produz mais warnings do M2. O Human in the Loop continua com os 16 itens todos confirmados.

## 259. Fechamento estático e de verificação final antes do release

A última rodada buscou novamente `origin/staging`, e o branch permanece 0 behind. A auditoria de Knip de `@zcode/provider` e `@zcode/provider-node` não encontrou arquivos ou exportações sem uso; as leituras restantes do `model-providers.json` antigo no código de produção estão apenas na primeira importação do Personal Config e na migração única da Account Key, e são mantidas como uma fronteira de migração explícita, unidirecional e removível.

O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está com 0 error e 35 warnings de linha de base sem relação com o M2; os 205 testes direcionados de Coding Plan e de Model Selection passaram, e o TypeScript do Desktop E2E e o Lint dos arquivos alterados passaram. Os 16 itens do Human in the Loop estão todos confirmados, sem novos problemas pendentes de decisão.
## 260. O Runtime Model Overlay é estreitado para Turn Model Overlay

Ao continuar auditando o Bootstrap pela definição de conclusão do M2, descobriu-se que o Workspace/Session Provider Overlay já havia sido removido, mas o objeto interno ainda se chamava `RuntimeModelOverlayManager` e expunha simultaneamente dois conjuntos de métodos idênticos, `getModelConfig/getTurnModelConfig` e `getModelCatalog/getTurnModelCatalog`. Essa forma de API continuava sugerindo que um modelo comum de longo prazo poderia obter fatos de um Runtime Overlay fora do Registry.

Esta rodada alterou primeiro os testes existentes para fixar a fronteira-alvo e então estreitou o objeto para `TurnModelOverlayState`. Ele mantém apenas o `set/clear/hasModel/getModelConfig/getModelCatalog/onDidChange` de que o Turn atual precisa, e o arquivo foi renomeado para `turn-model-overlay.ts`. O Session Facade e a execution-scoped Source continuam usando o mesmo estado temporário de modelo, e o protocolo e o comportamento de execução das tarefas ociosas não mudaram. O portão estrutural do M2 ganhou o caminho do arquivo antigo para impedir que um Runtime Overlay genérico reapareça.

Os 16 testes de Turn Overlay, Runtime Model Factory, Session Facade e portão estrutural do M2 passaram, e a verificação TypeScript isolada do Bootstrap passou. Em seguida `pnpm typecheck` da raiz passou e `pnpm lint` da raiz ficou em 0 error e 33 warnings da linha de base atual do staging. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas aplica a decisão já existente de que "Providers comuns vêm apenas do Registry de processo e Providers temporários pertencem apenas ao Turn atual", sem acrescentar semântica de produto.

## 261. O formulário de configurações sai do tipo compartilhado do Provider Store antigo

A auditoria de contração das condições de conclusão descobriu que os Provider Settings já leem e escrevem apenas a Settings Facade formal, mas o estado do formulário no Renderer ainda usava diretamente o tipo do Store antigo compartilhado `ModelProviderConfig`, e o arquivo de projeção ainda se chamava `providerSettingsLegacyProjection`. Isso não constitui uma segunda fonte da verdade, mas faz os chamadores continuarem confundindo a forma do armazenamento físico antigo com o contrato de configuração atual.

Esta rodada adicionou primeiro um portão estrutural que confirma que a UI de produção ainda tem 22 arquivos chamadores do tipo antigo, e então introduziu o `ProviderSettingsFormProvider` / `ProviderSettingsFormModel` privado do Renderer, migrando todos os chamadores de produção e os fixtures de teste relacionados. A projeção foi renomeada para `providerSettingsFormProjection`, expressando com clareza que ela só converte entre a Settings View formal e uma sessão de edição. O `ModelProviderConfig` antigo compartilhado agora pertence apenas ao código de migração física única Personal/Account.

A verificação TypeScript isolada da UI passou; os 282 testes em 12 arquivos relacionados a projeção de configurações, salvamento, ordenação, visibilidade de planos, edição de modelos, reasoning ocioso e verificação de segurança da versão oficial passaram; o Oxlint dos arquivos alterados ficou em 0 warning e 0 error. Este item não altera a interação do formulário nem a semântica de salvamento e apenas estreita a posse do tipo. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 262. O julgamento de disponibilidade da página de configurações converge para o Registry

Depois que o formulário de configurações saiu do tipo do Store antigo, a auditoria continuou e descobriu que o Renderer ainda usava `isModelProviderUsableForAgentStartup()` do Shared para recalcular se um Provider está disponível a partir da API Key, do Endpoint e dos campos de modelo do formulário. Esse algoritmo já tem apenas dois chamadores na página de configurações e faz com que a correção de Provider Family após o salvamento, a compensação da sincronização de planos e o `selectable` do Registry produzam duas respostas diferentes.

Esta rodada adicionou primeiro o portão estrutural e os testes de projeção, e então projetou o `selectable` publicado pelo Registry no formulário privado do Renderer. A interface de salvamento de Provider já devolvia a nova Settings View depois que a gravação e a atualização eram concluídas; a chamada de salvamento agora passa essa View para a camada de interação, e os julgamentos seguintes usam diretamente o `selectable` mais recente, sem depender do snapshot React anterior ao salvamento. Os dois helpers antigos de decisão de inicialização do Shared, que já não têm chamadores estáticos, foram removidos.

Os testes de fronteira do formulário de configurações, de projeção da Settings View, de Registry View de inicialização e de valor de retorno do salvamento passaram, e `pnpm typecheck` da raiz passou. Os 16 itens do Human in the Loop continuam todos confirmados; este item aplica o desenho já existente de que "o Registry decide a selecionabilidade de modelos", sem nova decisão de semântica de produto.

## 263. Remover o filtro antigo de Providers do Agent Registry

O Shared ainda mantém `shouldIncludeModelProviderInZCodeAgentRegistry()`, que decide, pelo `enabled`, pela API Key, pelo ID Builtin e pelos casos especiais de plano do Store antigo, se um Provider entra no Agent Registry. Todos os chamadores de produção já saíram e restam apenas os testes unitários antigos da própria função; mantê-la continuaria sugerindo que o Store antigo ainda pode estabelecer outra relação de associação do Registry.

Após a auditoria de referências estáticas confirmar zero chamadores de produção, esta rodada removeu a função e os testes históricos correspondentes. A associação atual de Providers e o `selectable` são decididos somente pela resolução Official, Personal e Account do `@zcode/provider` e pelo Process Registry. Os demais tipos antigos e helpers de conversão do Shared continuam servindo apenas à migração física única e à compatibilidade do formulário do Renderer, sem restaurar nenhuma entrada de filtragem do lado da execução. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 264. Conexão de planos e navegação de configurações saem do fallback do formulário antigo

Embora a página de configurações já obtenha Account Access e o `selectable` do Registry pela Settings View, a resolução de estado de planos ainda permitia recorrer, quando `accountProviderAccessIds` estava ausente, à API Key, ao Endpoint e à lista de modelos do formulário antigo; e o ponto de estado de navegação de Providers ainda chamava um helper de campo antigo para julgar de novo o que está "configurado". O `ModelProviderSection` de produção sempre passou explicitamente o conjunto de Account Access, de modo que esse ramo só existe em testes históricos e comentários de compatibilidade, e ainda assim consegue formar um segundo conjunto de respostas de conexão e de selecionabilidade.

Esta rodada define explicitamente a ausência de Account Access como "atualmente não há conexão de conta", e remove o fallback de API Key/Endpoint e o helper de julgamento de configuração do formulário que não tinha chamadores. A resolução de estado de Coding/Start/Team Plan, os cartões de detalhe, a primeira sincronização e a sincronização compensatória reconhecem apenas o `accessId` do Account Overlay, e a navegação de Provider só acende com o `selectable` do Registry. Os fixtures de teste passaram a declarar explicitamente o Account Access e o estado selecionável do Registry, sem mais sugerir conexão por uma API Key antiga.

Os 221 testes de Coding Plan, Provider Family, internacionalização de navegação e portão estrutural de formulário passaram. Os 16 itens do Human in the Loop continuam todos confirmados; este item aplica a fronteira de autoridade de conta e de Registry já confirmada, sem nova semântica de produto.

## 265. O Store antigo de Providers converge para uma fronteira de migração somente leitura

A auditoria final de referências de produção confirmou que o antigo `modelProviderServiceStorage` só é chamado pela primeira importação do Personal Config e pela migração única da Account API Key, e que ambos os chamadores desligam explicitamente a escrita de volta para o Store antigo. O ramo interno "ler e depois escrever no `config.json` antigo" que ainda existe no arquivo é mantido apenas por um teste histórico de escrita atômica, o que faz o Store antigo parecer ainda capaz de modificar os fatos formais de configuração.

Esta rodada renomeou o arquivo para `legacyModelProviderStoreReader` e o converteu em um adaptador de leitura puro: ele continua reconhecendo múltiplos formatos do `config.json` e do `model-providers.json` históricos e devolvendo o DTO antigo de Provider para cima; o resultado da migração passa a ser gravado somente pelo Personal Config Repository formal e pelo Account Credential Store em suas respectivas novas fontes da verdade. O leitor antigo não grava mais arquivos, não restaura backups e não mantém dependências de escrita atômica. Este item não altera o resultado da migração inicial de usuários já existentes e apenas remove uma capacidade de escrita inversa nunca ativada em produção.

## 266. O Provider Seed global do WDIO sai da fonte da verdade antiga

Depois que o Store antigo convergiu para leitura somente, a auditoria de contração descobriu que o inicializador global do WDIO ainda escrevia o Provider comum de teste simultaneamente no antigo `model-providers.json` e no CLI Config. Em tempo de execução esses valores seriam assumidos pela primeira importação do Personal, mas a E2E comum acabava sempre dependendo do caminho de migração, e o CLI Config continuava se comportando como uma fonte da verdade paralela de Providers do Worker.

Esta rodada adicionou primeiro o portão estrutural e então passou a escrever o Personal Config versionado de forma unificada nos fixtures de DeepSeek, Output Budget, Repo Wiki, Context Window e filtro de Providers. O modelo padrão do Environment é gravado em um Model Selection Config separado, e o CLI Config mantém apenas o timeout de `modelStream`. A cópia do Builtin Provider do Coding Plan foi removida ao mesmo tempo, e os Providers de planos continuam sendo construídos pelo Official e pela Account Source. Os testes unitários que verificam especificamente a importação da configuração antiga foram mantidos e não são misturados com a E2E comum.

A verificação TypeScript do Desktop E2E passou; os 4 testes de portão estrutural e de Provider Seed passaram, e o Lint dos arquivos alterados ficou em 0 warning e 0 error. O Human in the Loop continua com os 16 itens todos confirmados, sem nova decisão.

## 267. O diagnóstico do Desktop E2E sai do fallback de leitura antiga de Providers

Depois da migração do Seed do WDIO, o `readModelProviders()` do Desktop E2E ainda lia o antigo `model-providers.json` quando o Personal Config formal não existia, e ainda conseguia converter o `config.provider` de uma configuração antiga da CLI em uma lista de Providers. Embora a E2E comum já não escreva esses formatos, esse fallback de leitura ainda pode mascarar fixtures errados e deixar os testes passarem sem nenhuma fonte da verdade formal estabelecida.

Esta rodada adicionou primeiro um teste inverso que fixa que "com apenas o Provider Store antigo presente, o resultado do diagnóstico é vazio", e então removeu o caminho do arquivo antigo, as conversões de Provider/Model da configuração antiga da CLI e os helpers relacionados. O diagnóstico da E2E agora analisa apenas o Personal Config versionado, e a leitura de formatos históricos fica restrita ao migrador único dos Services e aos testes de migração. Os caminhos de fixture da lista de casos correspondente também passaram a usar o `config.json` formal.

Os 4 testes de Desktop Provider Seed e de fronteira passaram, a verificação TypeScript do Desktop E2E passou e o Oxlint dos arquivos alterados ficou em 0 warning e 0 error. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas estreita a fonte da verdade dos testes, sem nova semântica de produto.

## 268. Os tipos de migração do Store antigo saem da saída do ZCode Protocol

A auditoria de referências no nível de símbolos confirmou que o Schema de migração `ModelProviderStoreFile` e a função de migração de array cru continuavam sendo reexportados por `packages/shared/src/zcode-protocol/index.ts`, sem consumidores de protocolo em produção. Eles descrevem o formato físico antigo e não pertencem ao contrato de comunicação entre App e Worker; manter essa saída continuaria representando uma migração de armazenamento única como se fosse uma capacidade de protocolo.

Esta rodada removeu a importação e a reexportação do Protocol. O leitor antigo do Store continua usando as funções de migração diretamente dos tipos de Provider do Shared, e os testes existentes de Schema e de migração passaram a testar diretamente o módulo a que pertencem; a capacidade de migração única Personal/Account não mudou.

## 269. O limite de conclusão do M2 é elevado a um portão estrutural entre pacotes

A auditoria final descobriu que os testes estruturais existentes de Services, UI e Bootstrap protegem apenas alguns caminhos de arquivos já removidos e não conseguem impedir que DTOs antigos, Snapshots antigos ou entradas antigas de Store voltem à produção com outro nome de arquivo. Nem afirmar "não há resíduo" com base em resultados de busca oferece uma restrição contínua para os commits seguintes.

Esta rodada acrescenta testes de varredura de código-fonte assíncronos entre pacotes, cobrindo os diretórios de produção de Services, UI, Desktop, Shared e, no Worker, os diretórios de Adapter, Bootstrap e Contracts. O portão permite explicitamente que `ModelProviderConfig` exista apenas nos DTOs históricos do Shared, na primeira importação Personal, na migração única da Account Key e em suas entradas de montagem; e que `model-providers.json` só seja lido pelo leitor antigo do Store. O Snapshot completo antigo do Registry, o protocolo de atualização completa de Snapshot, o Runtime Overlay genérico, a projeção antiga de Settings e os nomes de Provider Service já aposentados devem permanecer em zero.

A primeira execução do portão também descobriu que o escopo de log do leitor antigo e um comentário ainda usavam o nome removido `ModelProviderService`; os dois foram alterados para uma formulação exata de leitor de migração e de Registry já aposentado. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 270. Os fixtures do Desktop E2E saiam do DTO do Store antigo

Depois do portão de fronteira de produção, a infraestrutura de testes ainda tinha dois resquícios: o seed comum do WDIO construía primeiro o `ModelProviderConfig` antigo e depois o convertia para o Personal Config; e a leitura do Personal Config pela E2E remontava o mesmo DTO antigo para as asserções. Eles não participam da execução em produção, mas mantêm as novas E2E dependentes da forma do Store já aposentada e podem mascarar problemas de campos de Config novos que o fixture não expressa.

Esta rodada mudou a entrada do seed comum para descrever diretamente os tipos de teste de `ProviderConfig` e de `ModelConfig` exatos, e removeu as conversões de endpoint, kind, source e model factory do DTO antigo. Os níveis de reasoning, valores padrão e mapeamentos agora entram diretamente no `ModelConfig` formal; antes, essa parte da metadata se perdia na conversão do DTO antigo para o Config novo. O lado de leitura da E2E passou a usar um `E2EModelProviderSnapshot` explícito, queassume apenas observação e asserção de teste e não se passar por contrato de configuração ou de runtime.

O portão estrutural agora varre recursivamente todo o TypeScript do Desktop E2E e proíbe reintroduzir o `ModelProviderConfig` antigo de nível superior. A verificação TypeScript do Desktop E2E, os testes de seed e de leitura relacionados e o Oxlint dos arquivos alterados passaram. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas limpa a infraestrutura de testes e restaura a expressão dos fixtures de reasoning, sem nova semântica de produto.

## 271. Remover as saídas antigas de consulta e conversão de Providers sem consumidores

A contração da fronteira de conclusão continuou rastreando os tipos antigos de Provider do Shared para fora. A auditoria de referências no nível de símbolos descobriu que a UI de produção ainda se ligava indiretamente ao `ModelProviderConfig` antigo por `isModelProviderEnabled()`, e que o Shared ainda expunha funções de consulta de ID/Label de modelo, de busca de modelo, de conversão reversa de kind e de parsing de formato suportado, todas sem consumidores de produção. Nos Remote Model Facts também havia uma saída de verificação de integridade sem nenhum chamador. Essas funções não têm responsabilidade de migração física nem pertencem à fronteira de Turn Runtime Model do M4.

Esta rodada estendeu primeiro o portão estrutural entre pacotes, e então fez o formulário de configurações de Provider ler diretamente seu próprio campo `enabled` e a E2E de Provider Readiness verificar diretamente `E2EModelProviderSnapshot.models`. Em seguida os helpers do Shared e a saída sem consumidores dos Remote Facts foram removidos, e a função de parsing de modalities usada apenas dentro do próprio arquivo voltou a ser uma implementação privada. Funções como `getModelProviderModelIds()`, ainda usadas pelo Legacy Reader de migração única, continuam na fronteira de migração e não foram removidas em bloco pelo nome.

Os 17 testes do portão estrutural do M2 e da fronteira de formulário da UI passaram, e as verificações TypeScript do Desktop E2E e da raiz passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas, sem nova semântica de produto.

## 272. Testes que não são de migração saem do DTO antigo de Provider

Depois que a fronteira de produção convergiu, os testes comuns de Usage, Repo Wiki, Bots e Provider Runtime ainda usavam o `ModelProviderConfig` completo para organizar fixtures. O código efetivamente testado normalmente lê apenas o Provider ID, a API Key e o estado de disponibilidade, ou projeta os campos de modelo em uma Registry View atual; o DTO antigo completo faz os testes continuarem sugerindo que o Store antigo é o contrato de entrada dessas funcionalidades.

Esta rodada estendeu primeiro o portão de conclusão do M2, deixando explícito que o DTO antigo só pode aparecer em migração única, Schema histórico e testes de fronteira do formulário do Renderer. Em seguida os testes de Usage passaram a usar fixtures mínimas de autenticação, os testes de Repo Wiki passaram a usar fixtures locais de entrada de Registry View e os testes de Provider Runtime passaram a usar diretamente o Provider Config formal. Nos testes de cache do Bots v2 também foi encontrado um campo adicional `providers` já inválido: o Schema de cache de produção há muito tempo não o lê, e esta rodada removeu o campo e sua construção antiga de Provider, evitando que os testes continuem verificando dados vazios.

Os 135 testes do portão de conclusão do M2 e dos seis grupos de comportamento acima passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas; este item apenas limpa os contratos de teste, sem nova semântica de produto.

## 273. O protocolo de Session e de Request Auth sai da casca vazia de Provider Revision

A auditoria de conclusão em nível de requisito descobriu que, depois que o Snapshot completo de Provider e o CAS de revision foram removidos, o Session Settings ainda expunha `appliedProviderRevision`, mas todos os Snapshots de produção passam fixamente `undefined`; e a resposta de Provider Runtime Headers também mantinha `providerRevision`, que o Host nunca devolve e que o Standalone apenas preenche com o `accessId` e escreve no log de debug. Nenhum desses campos participa mais de atualização, controle de concorrência, autenticação ou criação de Model, e ambos continuam representando uma revision de Registry já descontinuada como capacidade de protocolo.

Esta rodada primeiro incorporou o código-fonte do Core ao portão estrutural entre pacotes do M2, e então removeu os campos de revision do Schema de Session, dos parâmetros do Mapper, do protocolo de autenticação dinâmica, do Invocation Context, da Port do Core e do callback do Adapter. A autenticação de tempo de requisição continua devolvendo `requestAuth`, e o retry de verificação de segurança da versão oficial, a conferência de identidade de conta e a atualização a cada tentativa permanecem inalterados. O Session Settings comum continua expressando apenas modelo, nível de raciocínio, modo e permissões.

As regressões direcionadas de Shared, Services, UI, Adapter, Bootstrap e Core, 669 no total, passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas; este item aplica a fronteira de aposentadoria de Snapshot/revision já confirmada e não acrescenta semântica de produto.

## 274. O portão de conclusão cobre todas as Entries de produção e limpa termos enganosos

A auditoria em nível de requisito continuou conferindo que "Host, Worker, Prompt CLI e TUI reutilizam a mesma implementação de domínio de Provider". O portão entre pacotes já cobria Host, Worker e o protocolo compartilhado, mas não varria o próprio `@zcode/provider`, o `@zcode/provider-node`, o Prompt CLI e a TUI; se uma fronteira antiga voltasse por esses diretórios, o teste não falharia.

Esta rodada adicionou os quatro diretórios ao mesmo portão de código-fonte de produção, e fixou em zero os nomes já aposentados de Workspace Catalog, do protocolo de atualização completa de Snapshot, do Runtime Overlay antigo e do App Bootstrap antigo. A varredura ampliada não encontrou retorno do Prompt CLI/TUI a fontes da verdade antigas; ambos continuam sendo montados pelo Registry de nível de processo.

A varredura também descobriu que, depois que o estado do Workspace foi reduzido a Model Preferences, as variáveis locais da implementação do protocolo e as mensagens de erro de revision ainda usavam `catalog`. Esta rodada uniformizou a terminologia para Preferences/Registry View, sem alterar a revision do Workspace, o modelo padrão, o nível de raciocínio nem o comportamento de recuperação. O Bootstrap ainda tinha uma função órfã de migração de reasoning OpenAI-compatible sem nenhum chamador; ela foi removida e incluída no portão de helpers aposentados. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 275. A ordem de Providers da página de configurações sai do hardcode Builtin

Ao continuar refutando a UI pela premissa de que "Official/Personal/Account é a única fonte da verdade de Providers", descobriu-se que a página de configurações já obtém a ordem Effective completa da `ProviderSettingsView`, mas ainda mantém uma tabela de ordenação de IDs de Builtin Providers em `modelProviderOrdering`. A ordem explícita da View normalmente a oculta, mas quando a View está ausente ou o chamador não passa uma ordem, essa tabela ainda altera a ordem de entrada, constituindo uma segunda fonte estática da verdade fora do Official Config que pode entrar em vigor.

Esta rodada adicionou primeiro um teste de comportamento que prova que, sem ordem explícita, a implementação antiga reordena a entrada da Registry View; em seguida a tabela de ordem Builtin foi removida. A função de ordenação agora faz uma única coisa: quando há uma Provider Order View explícita, os itens são arranjados por ela preservando a ordem relativa dos que não estão listados; sem ordem explícita, a ordem de entrada é preservada por completo. A Order View da página de configurações normal é projetada diretamente da Provider View efetiva e ordenada.

O antigo `ModelProviderDisplayOrderState.updatedAt`, que não participava de CAS, persistência nem chamadas de serviço, saiu também do DTO antigo de Provider do Shared. A UI usa um `ProviderOrderView` interno contendo apenas `providerIds`, e o arraste continua chamando `reorderPersonalProviders()`, com a ordem final expressa pelo próprio Personal Overlay. As 76 regressões de UI e de portão do M2 passaram, e o typecheck da raiz passou. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores; este item aplica a decisão de ordenação já existente e não acrescenta semântica de produto.

## 276. Estreitar as exportações internas de Provider em Bootstrap e CLI

A auditoria de referências no nível de símbolos confirmou que os arquivos de primeira importação Personal, Registry Model Runtime, Runtime Capability, Standalone Account Runtime e montagem do Turn Runtime antigo do Bootstrap expõem um conjunto de tipos, constantes e helpers sem chamadores fora do módulo. Eles são apenas implementação interna do arquivo e, no nível de código-fonte, se comportam como pontos de extensão reutilizáveis, o que torna mais fácil para código posterior contornar a entrada formal do Registry de processo.

Esta rodada retirou esses `export` internos, preservando as APIs de inicialização do Registry, de criação de Model e de Selection que são de fato usadas entre módulos. A reexportação duplicada de `DEFAULT_MODEL`, que fica em `model-config.ts`, também foi removida; a entrada do pacote formal do Bootstrap continua exportando essa constante de compatibilidade diretamente a partir de Contracts. Após a revisão com o Knip, as exportações sem uso de Provider, Model e Registry em Bootstrap/CLI são zero; os 61 testes dos seis módulos relacionados passaram, e os typechecks isolados de Bootstrap e da CLI passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 277. Remover o helper antigo de estado de desativação de Provider e estreitar as saídas internas de Account

A auditoria de símbolos dos Services descobriu que `codingPlanProviderAvailability` ainda mantém `isSystemDisabledCodingPlanProvider()` e `isUserDisabledCodingPlanProvider()`. As duas funções interpretam a disponibilidade conforme o `enabled/systemDisabledReason` do DTO antigo de Provider e já não têm chamadores; a Account Source atual publica diretamente resultados available/unavailable/unknown e não precisa mais dessa camada antiga de inferência de estado.

Esta rodada primeiro usou o portão estrutural do M2 para provar que os dois helpers ainda existiam, e então removeu a implementação e fixou que ela não pode voltar. Os tipos e helpers usados apenas dentro do próprio arquivo nos arquivos de Account Credential, Request Auth, Team Plan Key, Connectivity, Provider Runtime, Repo Wiki Selection e Off-Peak também tiveram seus exports retirados; as interfaces formais de Service/Factory permanecem inalteradas. Após a revisão com o Knip nos Services, as saídas restantes relacionadas a Provider contêm apenas tipos públicos de outros domínios ou que aguardam organização independente. Os 133 testes dos 17 grupos de comportamento de Account/Provider e do portão do M2 passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 278. Retirar as saídas públicas excedentes das implementações de caminho dos Services

A auditoria de caminhos dos Services descobriu que `getWorkspaceKey()` e `getProviderWorkspaceZCodeConfigIsolationDir()` são usados apenas dentro de `paths.ts` para o caminho de Session e para o isolamento de skills, plugins e estado de runtime de Agents externos, mas ainda são exportados como API pública. O termo Provider no nome da segunda representa o Claude, o Gemini e outros Agent Runtimes externos, e não a fonte da verdade de Provider Config de modelos do M2; por isso seu comportamento foi mantido e apenas a exportação do módulo foi retirada.

Os 14 testes de caminho passaram; esta rodada não modificou o layout de caminhos, o comportamento de migração nem a semântica de produto de Provider, e não acrescentou nenhuma decisão do Human in the Loop.

## 279. Corrigir a nomenclatura remanescente no portão de inicialização a frio do Registry

Ao fazer a contração das condições de conclusão, descobriu-se que os testes de Conversation do V4 ainda chamavam o portão de inicialização a frio de "legacy provider registry", e que os comentários diziam que o Host lia o "Snapshot antigo". Na realidade, tanto o fixture quanto o código de produção já leem a Registry View atual por `ModelSelectionReadinessSource`; o Host usa essa View apenas para decidir se a execução de modelos é permitida e não envia um Registry completo.

Esta rodada corrigiu apenas os nomes e os comentários dos testes. O comportamento de produção, o protocolo e as decisões não foram alterados.
## 280. Contração pré-release por condição de conclusão

A auditoria final deixou de limpar símbolo a símbolo e passou a comparar item a item as condições de conclusão do M2, varrendo em sentido inverso o DTO completo antigo de Provider, o protocolo de atualização do Workspace Registry, o Runtime Overlay, o hardcode de ordem Builtin e o App Bootstrap antigo. Os DTOs antigos restantes estão apenas na migração única Personal/Account, no formulário privado do Renderer e na entrada de tarefas ociosas do M4; no Host, Worker, Prompt CLI e TUI comuns não foi encontrada nenhuma fonte da verdade antiga para a qual voltar.

Os 181 testes em 21 arquivos de Provider, Provider Node, portão estrutural do M2, autenticação de Account, inicialização a frio do Host, Worker Runtime, ordenação de UI e entrada de protocolo passaram. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está com 0 error e 33 warnings da linha de base atual do staging. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores. Após buscar o remoto, o branch está sobre `origin/staging` `6b4f6fc636f5`, 0 behind em relação a essa base.

## 281. O estado de edição da página de configurações usa diretamente o Config formal

A contração pré-release confirmou que o `ModelProviderConfig` antigo compartilhado já saiu da UI de produção, mas que o formulário privado do Renderer ainda replicava o mesmo conjunto de campos `endpoints/defaultKind/kinds/modalities/ProviderOptionsPatch` e depois os traduzia para o Config formal ao salvar. Essa dupla expressão faz a página de configurações continuar entendendo a semântica do Provider Store já descontinuado e também faz com que campos não expostos pela interface, como o `reasoningMapping`, sejam perdidos na edição de um modelo.

Esta rodada convergiu o estado de edição da página de configurações para cópias mutáveis de `ProviderConfigObject` e `ModelConfigObject`, acrescentando apenas `providerId/modelId`, o estado de projeção do Registry e a marcação de origem Personal por fora. Nome, API Key, tipo de API, Base URL, capacidade e ordem de modelos modificam diretamente os campos do Config formal; o salvamento continua entregando o Effective Config completo à Facade, e o Repository calcula o Personal Overlay esparso dentro do lock. A remoção de um modelo passa a ser expressa como a retirada do item da lista de modelos válidos, e o Renderer não cria mais túmulos do Store antigo.

Como a página de configurações não tem um controle de API kind por modelo, a edição de modelo não infere nem grava mais `kinds/defaultKind`. O tipo de API do Provider continua sendo editado separadamente no Provider Config. O diálogo de metadados de modelo modifica apenas Model ID, Context Window e Max Output Tokens e preserva as Properties, os Option Specs e o Reasoning Mapping do Model Config completo que não são exibidos.

O `allowedModelConfigs` das tarefas ociosas continua sendo a entrada do protocolo de Temporary Provider do M4 e mantém sua forma dedicada atual; ele não voltou para o formulário de Provider Settings e não foi disfarçado de Registry Model. Essa fronteira fica para o refactor já previsto das tarefas ociosas.

Os 313 testes em 24 arquivos relacionados à página de configurações passaram. Na suíte completa de UI, 5996 testes em 777 arquivos passaram; as 4 falhas restantes em 2 arquivos de `v4ConversationDraftSuggestedPrompts` são asserções de tamanho de ícone e de corpo de fonte que já existem no staging atual e não envolvem as configurações de Provider. O typecheck da raiz passou e o lint da raiz está em 0 error. Este item aplica a fronteira já confirmada de mesma origem do Settings Config e não acrescenta nenhuma decisão do Human in the Loop.

## 282. O tipo de API sai do desvio de configurações por modelo

Ao continuar examinando a fronteira de Config formal da página de configurações, descobriu-se que `ProviderModelApiFormatTags` ainda guarda um conjunto de API kind por modelo, Endpoint Path e controles de múltipla escolha em nível de modelo. A interface de produção reutiliza desse arquivo apenas o título de exibição do tipo de API; todos os outros componentes e funções de conversão estão sem chamadores. Essa implementação faria mantenedores futuros acreditarem que cada modelo ainda pode escolher seu próprio protocolo de execução, em conflito com o desenho atual de que o tipo de API pertence ao Provider Config.

Esta rodada adicionou primeiro o portão estrutural e então removeu esse desvio de edição por modelo. O formulário de conexão do Provider passa a usar diretamente o `ProviderApiType`, e o título do tipo de API e o caminho de protocolo fixo ficam para exibição em `ProviderApiFormatSelect`. A projeção da Registry View do Repo Wiki também passou a usar o mesmo tipo formal, e a sonda de conexão escolhe o protocolo de requisição e o namespace de options do AI SDK diretamente pelo `ProviderApiType`, sem voltar pela conversão do `ModelProviderKind` antigo. Dois helpers de migração de configurações sem chamadores foram removidos ao mesmo tempo.

O `ModelProviderApiFormat` antigo agora só resta no DTO histórico do Shared e no Legacy Reader de migração única. A parsing de capacidade de entrada do Turn Model antigo anterior ao M4 também passou a usar o `ProviderApiType` formal, mas sua inferência de capacidade de mídia e seu comportamento temporário de execução permanecem inalterados. A página de configurações, o Repo Wiki, a sonda de conexão e as entradas de execução do Bootstrap não consomem mais o tipo antigo. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 283. A criação do Model Adapter sai do Runtime Model Config antigo

Ao continuar refutando a fronteira de compatibilidade do Bootstrap, descobriu-se que o Prompt Trajectory já criava o Provider Registry formal e mesmo assim inicializava o `ModelAdapter` com o mesmo `RuntimeModelConfig` antigo. Depois que o App iniciava, o `ApiProviderModelRuntime` substituía imediatamente esse Registry do AI SDK pelo Registry de processo, de modo que a configuração antiga só produzia uma pré-instalação sem valor de negócio e mantinha o `createModelAdapter()` público se comportando como se a execução normal pudesse contornar o Provider Registry.

Esta rodada estreitou `createModelAdapter()` para receber apenas o `registryConfig` explícito. O App normal recebe um contêiner de execução vazio, gerenciado pelo Registry Runtime formal, junto com a infraestrutura de processo; o Prompt Trajectory também passa um contêiner vazio, e é o Provider Registry de teste que ele já monta a publicar os modelos reais. A conversão antiga `RuntimeModelConfig -> AiSdkModelRegistryConfig` fica apenas dentro do Turn Execution Source anterior ao M4, servindo à entrada temporária execution-scoped e deixando de ser um ramo público de criação de Adapter.

A função `createRuntimeAiSdkModelRegistryConfig()`, que também não tinha chamadores, foi removida, e o portão de conclusão do M2 proíbe sua restauração. Os typechecks de Bootstrap, CLI e Prompt Trajectory passaram, as 45 regressões direcionadas do Bootstrap e as 37 do portão do M2 passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 284. Reclassificar os tipos antigos remanescentes por origem de fato antes do release

Depois que a Adapter Factory pública foi fechada, a auditoria continuou classificando `RuntimeModelConfig`, `ModelCatalog`, Builtin Provider ID, Provider Family e referências relacionadas ao Store antigo segundo as condições de conclusão do M2. A conclusão da auditoria se divide em três categorias:

- nas configurações, seleção, montagem do Registry e criação de Model de Providers comuns de longo prazo não foi encontrado nenhum novo retorno a fatos antigos;
- as referências de execução ativas de `RuntimeModelConfig` e `ModelCatalog` estão concentradas em `TurnExecutionModelSource`, servindo apenas à entrada execution-scoped das tarefas ociosas, que é a fronteira de saída já registrada pelo M4;
- as referências ativas de Builtin Provider ID e de Family respondem pelo mapeamento de conta, planos, compra e autenticação de requisição e consomem o estado produzido pela Account Source, sem complementar ao Registry com Properties ou Option Specs estáticos de modelo, o que pertence ao escopo de organização interna do M6.

Os Readers antigos de CLI Provider, Personal Config e Account Key de uso único continuam rodando apenas quando o novo arquivo físico não existe ou quando há migração de credenciais antigas, e o portão estrutural do M2 continua restringindo os donos desses arquivos. Os 16 itens do Human in the Loop já têm conclusão confirmada ou posterior que os substitui, e não foi encontrada nenhuma semântica de produto que exija nova decisão.

## 285. Campos antigos de Provider saem do Schema comum da CLI Config

Ao continuar auditando o CLI Config antigo, descobriu-se que, embora o `RuntimeConfigPatch` genérico já tivesse removido os campos de modelo, o Schema comum do arquivo ainda declarava e validava explicitamente `provider`, `model`, `modelCatalog` e `small_model`. Portanto, um campo antigo de Provider que já não participa da execução bastava para estar com formato errado e fazer toda a configuração formal de runtime do mesmo arquivo — MCP, permissões, rede — falhar ao ser carregada.

Esta rodada moveu esses quatro campos para `LegacyCliModelConfigFileSchema`. O `ZCodeConfigFileSchema` comum não os possui mais, e o parsing da configuração de runtime trata os campos antigos remanescentes como extensões irrelevantes; o Personal Importer de uso único continua usando o Schema Legacy para validação estrita e recusando formatos antigos impossíveis de migrar. Esse ajuste não acrescenta nenhuma fonte da verdade de compatibilidade e apenas restringe a leitura do formato antigo e a influência de suas falhas à fronteira de migração.

As 63 regressões direcionadas de Config e de configuração de ambiente de Adapters passaram, e o typecheck de Adapters passou. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 286. Fixar a fronteira remanescente do Runtime Model Config antigo

A última rodada de auditoria de tipos antes do release confirmou que as variáveis de ambiente antigas de modelo já não entram na Runtime Config comum: `ZCODE_MODEL` e `ZCODE_BASE_URL` não têm consumidores de runtime, e a leitura restante de `ZCODE_API_KEY` atende apenas à importação única do CLI Provider antigo. A execução normal de Providers continua tendo como única fonte da verdade o Registry de processo agregado de Official, Personal e Account Config.

As referências de produção restantes de `RuntimeModelConfig` se dividem em dois grupos: o parsing do arquivo antigo da CLI em Adapters e o Turn Overlay execution-scoped que o M4 ainda não refatorou. Para impedir que esse tipo se espalhe novamente para Sessions comuns, Settings, Selection, Registry ou ModelFactory, esta rodada adicionou o conjunto de arquivos permitidos ao portão estrutural entre pacotes do M2. Este item apenas estreita a fronteira arquitetural, não muda a semântica de execução e não acrescenta nenhuma decisão do Human in the Loop.

Os 111 testes de Provider em 14 arquivos completos e o typecheck do pacote Provider passaram. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está com 0 error e 33 warnings da linha de base atual do staging. Após atualizar o remoto, o branch está 0 behind em relação a `origin/staging` `6b4f6fc636f5`, e a árvore de trabalho não tem arquivos sem commit.

## 287. Unificar a prioridade de execução do Turn Overlay de mesmo nome

A auditoria do branch de runtime descobriu que, quando o Turn Overlay execution-scoped e o Registry de processo usam o mesmo `providerId/modelId`, o `ApiProviderModelRuntime` já prioriza criar o Model do Overlay, mas a troca de modelo, a leitura e a modificação de reasoning no Session Facade ainda priorizam interpretar o Registry. O resultado é que a requisição real usa o Model temporário enquanto os metadados de UI/Runtime vêm do Registry de longo prazo, violando a fronteira de que um mesmo trecho de execução só pode ter uma fonte da verdade de Model.

Esta rodada faz o `setModel` transitório e as consultas de metadados do modelo atual verificarem primeiro o Turn Overlay; só quando o Overlay não possui o alvo é que o Registry é consultado. Ao limpar o Turn Overlay, a camada temporária é removida primeiro e só então o modelo original é restaurado a partir do Registry mais recente, evitando que um modelo temporário de mesmo nome do original seja resolvido novamente para o Overlay que acabou de terminar. O Overlay continua fora das configurações, das listas de seleção e da Selection persistida da Session.

Os novos casos de regressão de Provider/Model de mesmo nome cobrem a troca transitória, a leitura de reasoning, a enumeração, a modificação e o retorno ao Registry após a limpeza da camada. As 8 asserções do arquivo de teste alvo passaram e o typecheck do Bootstrap passou. As 52 asserções de V4 Commands executadas em conjunto passaram, mas o teste de timeout já existente no staging ainda produz uma rejeição não tratada `V4PromptRejectedError` assíncrona, fazendo o comando combinado retornar 1 ao final; esta rodada não se expandiu para a temporização de filas do V4. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 288. Concluir a auditoria de ciclo de vida de Model e de fechamento das Facades

A última revisão pré-release de execução reexaminou, em ordem de temporização, a atualização do Registry, a criação de Model e a projeção no frontend. No momento da criação, o `Model` fixa os fatos estáticos de execução do Provider por `bindModel()`; uma atualização do Registry afeta apenas os Models criados depois, e a atualização da autenticação em tempo de requisição só pode complementar as credenciais e os Headers atuais. Falhas de leitura ou de resolução do Registry continuam preservando a View last-known-good, e uma atualização bem-sucedida posterior consegue se recuperar. As Facades de Settings e de Selection compartilham a barreira de prontidão do Runtime, e a UI assina antes de ler e descarta resultados atrasados por revision.

Esta rodada não encontrou nenhuma nova fonte da verdade de dois trilhos e não modificou o código de produção. O branch está 65 ahead e 0 behind em relação ao `origin/staging` mais recente. Os 104 testes direcionados de portão estrutural do M2, Registry, Facade, Adapter, Bootstrap, Services e UI passaram; o `pnpm typecheck` da raiz passou e o `pnpm lint` da raiz está em 0 error e 33 warnings da linha de base do staging. As 16 decisões do Human in the Loop estão todas confirmadas ou foram substituídas por conclusões posteriores já confirmadas.

## 289. Concluir a auditoria limpa de migração, conjunto de remoções e atribuição lateral

O fechamento do release continuou refazendo as três fronteiras mais fáceis de passar por alto em uma migração ampla.

O Personal Config divide o caminho físico com o antigo `~/.zcode/v2/config.json`. Quando o arquivo antigo não tem o `schemaVersion` de Provider Config, o Repository grava primeiro um backup determinístico por hash de conteúdo, chama o único Legacy Importer para gerar o documento v1 formal e substitui atomicamente o caminho original; a versão formal e versões futuras não entram na cadeia antiga de importação. Uma falha no backup não sobrescreve o arquivo original, e inicializações repetidas não repetem a migração. Os testes de migração de Provider Node e dos Services continuam fixando esse conjunto de comportamentos.

Esta rodada também auditou item a item os 63 arquivos removidos em relação ao staging. O conjunto removido é composto pelo Store antigo de Providers, pelo Workspace Catalog, pelo Snapshot completo do Registry, pela projeção antiga de Settings e pelos testes especializados deles; poucos arquivos cujo nome não contém diretamente Provider são camadas de encaminhamento sem chamadores, portões de inicialização antigos ou registros temporários mal colocados na raiz do Provider Working Memory. Não foi encontrado nenhum caso em que, após a remoção de funcionalidades novas do staging, uma implementação antiga tenha sido trazida de volta em nome do M2.

O `bigmodel / z.ai / others` do Repo Snapshot Sidecar escreve apenas metadados de upload do snapshot lateral, usados para atribuição no servidor; ele não seleciona Provider nem Model, não complementa Properties ou Option Specs e não participa da criação de Model. Esse mapeamento de marca continua sendo um objeto de organização posterior do domínio Account/produto, mas não constitui uma fonte da verdade de execução de Provider do M2. Por isso nenhum novo campo de marca de Provider foi adicionado temporariamente no M2.

As auditorias direcionadas de exportações por Knip de Provider, Provider Node, Services e Bootstrap não encontraram nenhuma saída pública sem uso relacionada a Provider/Model. Os 55 testes de portão estrutural do M2, de migração de Provider Node, de montagem de migração dos Services e de atribuição do Repo Snapshot passaram. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está em 0 error e 33 warnings da linha de base atual do staging. Este item não modificou o código de produção e não acrescentou nenhuma decisão do Human in the Loop.

## 290. Fixar a fronteira remanescente de padrões por hardcode de modelo

A auditoria em nível de requisito continuou rastreando o `default-policy` e o antigo `ModelCatalogService`. Os padrões de capacidade dirigidos por nome de modelo continuam em uso pela importação da configuração antiga da CLI, pelo Catalog/Turn Runtime antigo e pela projeção de compatibilidade de capacidades de anexos; o Process Registry formal, em seus Providers, Models e ModelFactory, não lê esse conjunto de regras, e Properties e Option Specs completos vêm apenas do agregado de Official, Personal e Account Config.

Esta rodada adicionou ao portão estrutural entre pacotes do M2 o conjunto de arquivos permitidos de `resolveModelCapabilityDefaults()`, `createDefaultModelCapability()` e `applyModelCapabilityDefaults()`. A partir de agora, se esse hardcode por nome de modelo entrar na cadeia formal de Registry, Model, Settings ou Selection, o teste falhará diretamente. As posições permitidas atuais continuam sendo a única fronteira remanescente para migrar o Turn Overlay e o arquivo antigo da CLI, e não são descritas como uma segunda fonte da verdade do M2.

A documentação também limpou três formulações do período de migração que foram substituídas por implementações posteriores: todas as Entries de produção já montam o Selection Service obrigatoriamente, o fallback do Remote Snapshot já saiu da produção e a página de configurações já usa diretamente o Config/View formal. No Human in the Loop, o registro que permitia projetar o Account Snapshot no início também foi marcado explicitamente como substituído pelo M2.8. Os 39 testes do portão estrutural do M2 passaram, sem nenhuma nova decisão de produto. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está em 0 error e 33 warnings da linha de base atual do staging. O portão de affected-test do push executou novamente os testes estruturais do M2 e passou. O branch está sobre o `origin/staging` mais recente, 0 behind em relação à base, e a árvore de trabalho não tem conteúdo sem commit.

## 291. Reaplicar o M2 sobre o staging mais recente

O `provider-refactor-m2` foi primeiro rebaseado em `origin/staging` `58cbc6065d` e depois replayado sobre o `3524b06c9f` mais recente, o mais recente no momento desta verificação. O tratamento de conflitos usou como linha de base o ciclo de vida CUA, a página de configurações dinâmica e o comportamento de Team Plan do staging mais recente, preservando ao mesmo tempo o Process Registry do M2, o registro de Provider Services e a fronteira de saída do Runtime Registry antigo; o `packages/ax-macos`, já removido pelo staging, não foi restaurado.

A regressão posterior ao conflito descobriu que o fallback do Team Plan ainda chamava `parseTeamPlanConnectionKeyByFamily()`, mas o import foi perdido durante o replay; esta rodada restaurou esse import. O arquivo de lock foi regenerado conforme as dependências do workspace mais recente e passou no frozen install, evitando manter um resultado de conflito manual. A descrição de cobertura de testes foi alterada para a semântica atual de readiness do Registry do M2.

Os 27 testes de Bootstrap Runtime Config passaram; os 131 testes relacionados a conflitos do projeto raiz passaram; o `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz está em 0 error e 39 warnings da linha de base do staging mais recente. Esta rodada não acrescentou nenhuma decisão de produto e não alterou o desenho de Provider já existente no Working Memory.