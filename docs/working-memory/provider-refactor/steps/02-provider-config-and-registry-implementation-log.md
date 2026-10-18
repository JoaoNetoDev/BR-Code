# Registro de Implementação do M2

> Status: linha do tempo histórica de implementação; evidências de auditoria são adicionadas continuamente
>
> Data de início: 2026-08-17
>
> Objetivo da implementação: [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md)

Este documento guarda, na ordem em que ocorreram, as decisões autônomas tomadas durante a implementação do M2 que extrapolaram o plano original, mas que não justificavam bloquear o desenvolvimento, além das evidências de auditoria. O corpo preserva o contexto no momento em que a decisão foi tomada; itens antigos podem ter sido superados por decisões ou implementações posteriores e não podem ser usados isoladamente como fonte da verdade atual.

O design objetivo atual está em [`../design/registry/registry.md`](../design/registry/registry.md), o estado atual da implementação em
[`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md), as decisões finais humanas em
[`02-provider-config-and-registry-human-in-the-loop.md`](./02-provider-config-and-registry-human-in-the-loop.md) e os itens de desativação restantes em
[`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md).

## 1. O Registry Service usa injeção de snapshots de Source

O Resolver de domínio puro já aceita valores de Config e de Account Access. A camada de composição em execução continua usando duas Sources estreitas:

```text
ProviderConfigSource ───────┐
                            ├─> ProviderRegistryService
AccountProviderAccessSource ┘       ├─ resolve
                                    └─ publish Registry View
```

As Sources ficam responsáveis por arquivos, RPC, interfaces remotas, cache e watchers; o Registry Service apenas lê snapshots imutáveis, escuta sinais de invalidação e publica a View em memória. Cada snapshot de Source carrega uma revision, de modo que as notificações ativas e as notificações de watcher causadas pelos mesmos fatos podem ser deduplicadas de forma natural.

## 2. A atualização concorrente usa guarda de geração

O Registry Service não usa debounce por tempo. Cada invalidação incrementa a geração da requisição; apenas um laço de atualização roda por vez. Quando uma nova invalidação ocorre durante a leitura, a geração antiga obtida na leitura atual não é publicada e o laço continua lendo a Source mais recente.

Isso resolve correção e trabalho duplicado, sem depender de adivinhar quantos milissegundos esperar para saber se a Source está estável.

## 3. A falha na atualização mantém provisoriamente o last-known-good

Config e Account Access determinam em conjunto uma View completa do Registry. Quando a leitura de qualquer Source, a análise do Schema ou a resolução falha, a implementação atual mantém a View bem-sucedida anterior, emite um evento de erro de atualização e aguarda a próxima invalidação ou uma atualização explícita para se recuperar.

Por enquanto não se publica uma View parcial que remova a Source com falha. Uma publicação parcial pode remover Account Providers em massa em caso de erro transitório de rede ou de arquivo e fazer com que a escolha de modelos e o novo Agent Loop observem fatos que não são de negócio. Na primeira inicialização, quando ainda não há View bem-sucedida, o Registry mantém uma View vazia e expõe o erro.

Esta é uma estratégia de implementação que pode ser decidida de forma assíncrona; se mais tarde for confirmado que alguma Source admite degradação independente, deve-se formar um snapshot de fallback explícito dentro daquela Source, em vez de deixar o Registry adivinhar como montar dados que falharam.

## 4. O Facade primeiro estabelece uma projeção somente leitura

Settings e Model Selection precisam de formatos de dados diferentes. Na primeira etapa, o Facade apenas projeta o mesmo snapshot do Registry Service em objetos comuns serializáveis: Settings enxerga simultaneamente a configuração Personal explícita, a configuração Effective e os problemas; Selection enxerga somente as opções publicadas pelo Registry.

O Facade ainda não possui drafts do Renderer nem escreve arquivos diretamente. Salvar, excluir e reordenar configurações Personals exigem considerar os limites de escrita concorrente do Config Service e serão implementados na fatia de integração do Host. Assim não se empurra armazenamento físico ou estado do Renderer de volta para o pacote de domínio puro só para antecipar a integração com a UI.

## 5. A concorrência da persistência Personal é fechada pelo Repository

`ProviderConfigService` não implementa bloqueio de arquivo, compare-and-swap de revision nem retentativas de rede. O Personal Repository oferece um `update(transform)` atômico que, dentro do limite de persistência que ele possui, lê o Snapshot Personal mais recente, aplica a transformação e salva. O Config Service fornece apenas as transformações de domínio e a agregação de Sources.

Essa interface permite que um Repository de arquivo local use uma fila de escrita no processo somada a bloqueio de arquivo, e também que um Repository remoto use número de versão no servidor; os dois não precisam de ramos diferentes dentro do Registry. Escritas bem-sucedidas são uniformemente acionadas pela notificação de mudança do Repository, que impulsiona a atualização do Config Service e do Registry, evitando que callbacks de escrita e watchers mantenham dois conjuntos de estado em memória.

## 6. Não integrar snapshots do Registry antigo

Foi confirmado que Official Config, Personal Config e Account Access são as únicas fontes da verdade, e que essa convergência deve ser concluída com alta prioridade. O M2 não implementa o adaptador `ZCodeProviderRegistrySnapshot -> ProviderConfigSnapshot`, nem deixa o novo Registry continuar consumindo o snapshot de execução que o antigo ModelProviderService já mistura.

Ao encontrar Catalog/Preset/hardcode existentes mais adiante, definições estáticas ainda válidas migram para Official Config; configurações do usuário migram para Personal Config; verificação de login e de plano converge para Account Access; API Key, JWT, Team Plan Runtime Key e Headers de verificação de segurança pontual permanecem na autenticação em tempo de requisição. Depois de concluídas as migrações correspondentes, o ramo antigo é excluído e não se mantém uma dupla fonte da verdade.

## 7. A página de Settings escapa caracteres de regex no Model Config exato

`providerMatch` e `modelMatch` de ModelConfigRules são regex de correspondência completa. Como a página de configurações salva IDs exatos de Provider/Model, o Config Service escapa caracteres de regex como `. * + ?` ao gravar regras exatas; a leitura e a exclusão de regras exatas usam a mesma conversão. Regras de Pattern configuradas manualmente permanecem como estão.

Caso contrário, o model ID `model.1` seria salvo como uma regra capaz de também casar `modelA1`, e uma única edição na página de configurações poderia mudar a Configuração Effective de outros modelos.

## 8. Personal Config usa um arquivo versionado independente

> Uma decisão humana posterior substituiu este item: Personal Config mantém o caminho original `config.json`, com backup antes da migração; o Schema completo final do M2 é publicado pela primeira vez com `schemaVersion: 1`. Veja [`Human in the Loop #10`](./02-provider-config-and-registry-human-in-the-loop.md#10-personal-config-保持原路径并以-schema-version-1-首次发布). O conteúdo abaixo preserva o contexto de auditoria da decisão autônoma tomada pelo agente na época.

A configuração Personal de Providers migrou de forma unidirecional do antigo `~/.zcode/v2/config.json` para `~/.zcode/v2/provider-config.json`. O novo arquivo pertence apenas ao domínio de Provider Config e usa um inteiro `schemaVersion` incremental, evitando que uma atualização de formato de Provider obrigue todo o Environment Config a compartilhar versão.

A migração primeiro escreve e valida atomicamente o novo arquivo e só então o torna a única autoridade; a limpeza do arquivo antigo pode ser feita depois, mas ele deixa de participar das leituras. Versões futuras migram nível a nível entre versões adjacentes; ao encontrar uma versão mais alta, o programa se recusa a sobrescrever, evitando que clientes antigos estraguem a nova configuração.

Esta é uma decisão de implementação sobre nomenclatura de armazenamento físico e pode ser ajustada de forma assíncrona; ter um documento versionado, migração unidirecional e o novo arquivo como única fonte da verdade são requisitos já confirmados.

Builtin/Preset do antigo config.json são Configuração Effective histórica e não podem ser copiados inteiros para Personal com base em `source`. O migrador primeiro carrega a Official Config atual e depois calcula uma diferenças esparsa campo a campo entre ProviderConfig e ModelConfig; Custom Providers são migrados inteiros por não terem baseline Official. Assim preserva-se o comportamento observável atual pelo usuário sem congelar atualizações futuras do Official com valores gerados pelo sistema antigo.

## 9. O Personal Repository usa bloqueio de arquivo para leitura-modificação-escrita inteiras

O `update(transform)` do Personal Repository realiza leitura, transformação e substituição atômica dentro de um mesmo bloqueio de arquivo entre processos. Bloquear apenas o último rename não evita que dois Hosts leiam valores antigos e se sobrescrevam mutuamente, portanto o bloqueio cobre toda a região crítica de read-modify-write.

Neste processo, tanto um salvamento bem-sucedido quanto o watcher de diretório emitem notificações de invalidação, sem adicionar debounce. O Snapshot de Source da camada superior usa revision de conteúdo para deduplicar; assim não se depende do timing de eventos do sistema de arquivos nem se usa uma janela de atraso para mascarar atualizações concorrentes.

O Repository já suporta injetar um Legacy Importer, mas atualmente não reutiliza diretamente o resultado de leitura do antigo `ModelProviderService`. A importação real precisa aguardar a disponibilidade da Official Config Source para computar as diferenças; até lá, quando o novo arquivo não existe, ele retorna apenas uma Personal Config vazia, sem congelar prematuramente a antiga Configuração Effective.

## 10. Integridade da API Key dos API Providers Official

O Official declara predefinições de API Providers ainda não conectados, mas o Registry só deve publicar Providers com os quais é possível criar um Model agora. O tipo de Provider já foi convergido para `ApiProviderConfig | AccountProviderConfig`, com o campo discriminador `kind`.

A configuração final de um API Provider sempre exige uma API Key não vazia; a Personal Config pode complementar a Key sobre uma predefinição Official. Nesta etapa não é adicionado um tipo de Provider sem autenticação; testes e fakes internos usam uma dummy key. As credenciais dinâmicas do Account Provider continuam gerenciadas pelo Account Access e pelo Service de autenticação em tempo de requisição. API Providers sem Key ainda entram no resultado de análise do Facade de configurações carregando problemas de validação, mas não entram no Registry de seleção de modelos nem de execução.

## 11. Critério da migração mecânica dos primeiros Model Configs Official

Os primeiros arquivos Official incluem API Providers comuns e expandem de uma vez, no novo Schema, os fatos estáticos dos modelos do antigo China LLM Catalog. Modelos duplicados mantêm apenas um conjunto de Properties e Option Specs comuns; as diferenças Anthropic/OpenAI-compatible do mesmo modelo viram regras `apiFormatMatch` posteriores. Os antigos patches `set/unset` são expandidos na migração em `ReasoningParameters` completos para cada nível, e o runtime deixa de depender do estado de patches.

Modelos do antigo Catalog sem `maxOutputTokens` declarado seguem o fallback atual de 32K do Adapter. Modelos com limite explícito continuam usando esse valor como teto e default do Model, preservando o comportamento atual do Runtime Model Factory. O arquivo atual carrega primeiro os fatos e aceita testes de contrato; a troca da cadeia de produção e a remoção do antigo Catalog/Preset pertencem a uma fatia posterior da mesma migração, e ainda não se declara concluída a troca para uma única fonte em runtime.

## 12. Campos de Provider Config definidos antes da importação Personal

Ao preparar a implementação da importação unidirecional do antigo `config.json`, primeiro foram definidos os fatos estáticos que o novo ProviderConfig precisa suportar, usados em comum pela página de configurações, pela página de seleção e pela execução.

Os campos comuns são `kind`, `label`, `logoUrl`, `apiFormat`、`baseURL`、`headers`、`models` e `enabled`. O API Provider guarda adicionalmente `apiKey` e `apiKeyManagementUrl`; o Account Provider não pressupõe, por enquanto, campos de identidade não pesquisados. A identidade do Provider é fornecida pelo `providerId` externo; `label` serve apenas para exibição e tem fallback padrão para providerId.

`apiFormat`、`baseURL` e Headers estáticos são válidos tanto para API quanto para Account. JWT dinâmico, Runtime Key e Headers de verificação de segurança pontual não entram no Config. O antigo `source`, IDs de rastreamento de Catalog, timestamps, marcações `modified/deleted` e motivos de desativação pelo sistema também não são migrados; a semântica alvo desses campos foi substituída respectivamente pela origem na camada de configuração, pelo array `models` e pelo Account Access. O antigo `providerMappings.claude` já é removido pela lógica de migração do Store v2 atual e também não entra no novo Config.

Provider Config Rules e inferência de Base URL não entraram no design. Official/Personal hoje fazem Overlay direto por providerId; se surgir no futuro uma necessidade de configuração entre Providers suficientemente clara, o sistema de regras poderá ser adicionado com base em casos reais.

## 13. O Legacy Personal Import migra apenas as diferenças do usuário


O resultado de leitura de Providers do antigo `config.json` já mistura Catalog, Builtin e fallbacks de migração. Por isso o importador recebe o Snapshot Official atual e a lista antiga de Providers, converte os valores Effective antigos, calcula diferenças campo a campo e grava apenas as diferenças na Personal Config.

Na camada de Provider migram campos de exibição, entrada de requisição, Headers estáticos, membros de modelo, estado de habilitação e API Key; o antigo source, timestamps, motivos de desativação pelo sistema e Provider Mapping não entram no novo formato. Para Providers já declarados pelo Official, apenas as diferenças são salvas; para Providers somente-Personal, a configuração completa de API é salva.

Na camada de modelo só são tratados os modelos com `modified: true` nos registros antigos e os novos modelos que não existem no conjunto Official de modelos. Properties, Option Specs e o mapeamento de reasoning convertidos são comparados com o Official ModelConfig, evitando que o usuário, ao alterar apenas o contextWindow, congele todo o modelo do Catalog. O antigo reasoning patch é expandido na fronteira de migração em um objeto de parâmetros sem estado correspondente ao kind de API atual; `unset` não tem significado adicional sobre um mapeamento construído a partir de um objeto vazio.

Providers antigos com `source: builtin` e sem baseline Official não são importados por enquanto. Esses itens podem carregar JWT ou Runtime Key, e migrá-los por engano como API Provider congelaria estado dinâmico de conta dentro do Personal. Depois que a definição Official do Account Provider for integrada, o mesmo importador migrará as sobrescritas estáticas permitidas conforme o `kind: account` do Official e ignorará a antiga API Key.

## 14. Official Config é publicado como recurso explícito de instalação

O pacote oficial do Desktop publica `config/provider/official.json` como um recurso independente em `resources/config/provider/official.json`. A Official Config não entra no `app.asar` nem depende do diretório de trabalho em runtime; depois, o Desktop Main resolve o caminho real e o injeta explicitamente no Local Host.

A publicação do recurso e a troca do Registry de produção são divididas em duas fatias verificáveis. Esta fatia apenas garante que o documento Official versionado no repositório de desenvolvimento chegue ao ambiente de runtime junto com o instalador, sem alterar a cadeia atual de leitura de Providers do Host. A próxima fatia completa a injeção de caminho, a composição das Sources e o gerenciamento de ciclo de vida; só então o Registry de produção passa a consumir esse arquivo.

## 15. O Config Runtime entra primeiro no Local Host, sem adiantar a troca de consumidores

O Desktop Main resolve o caminho absoluto da Official Config conforme o modo de desenvolvimento ou de instalação e o injeta explicitamente no Local Host via `InitLocal`. O Services monta, a partir desse caminho, a Official Source, o Personal Repository e o `ProviderConfigService`; o pacote de domínio compartilhado de Providers não depende de Electron, do diretório de instalação nem do diretório de trabalho atual.

O Config Runtime já suporta injetar a função antiga de leitura de Providers: na primeira leitura, quando o arquivo Personal não existe, o Repository usa o Legacy Importer e computa uma diferenças esparsa em relação ao Snapshot Official atual. Os Local Hosts de várias janelas podem iniciar simultaneamente; o bloqueio de leitura-modificação-escrita entre processos do Personal Repository garante que apenas um arquivo final seja gerado.

O Local Host de produção ainda não injeta essa função de leitura. A página de configurações atual ainda grava a configuração antiga; se o novo arquivo Personal fosse gerado antecipadamente, mudanças posteriores na configuração antiga não entrariam mais na migração única. Por isso a migração de produção precisa estar na mesma sequência de commits que a troca da entrada de escrita das configurações: primeiro bloquear a escrita antiga, concluir a última migração diferencial e só então fazer da nova Personal Config o único destino de escrita.

Esta fatia torna a nova Config a fonte da verdade de produção para leitura e atualização contínuas, mas ainda não troca a página de configurações, a seleção de modelos ou a execução do Worker para o novo Registry. A nova pilha de runtime é mantida pelo ciclo de vida do Local Host e liberada explicitamente; falhas na inicialização registram log de erro de produção, mantendo ao mesmo tempo a cadeia de Providers existente, para que problemas de configuração sejam detectados antes da troca dos consumidores.

## 16. O Settings Facade forma uma barreira de escrita serializável

Os métodos de escrita do Settings Facade recebem `ProviderConfigInput` e `ModelConfigObject` e usam a mesma análise de Schema do documento de configuração versionado, sem permitir que o Renderer construa Config Classes nem copie validações. Salvar, excluir e reordenar continuam sendo feitos por `ProviderConfigService` sobre o Personal Overlay.

Uma operação de escrita executa, em sequência, a mutação do Config Service, o `refresh()` do Registry e a projeção da Settings View. A atualização explícita atua apenas como barreira de commit; ela reutiliza as notificações de Source, a deduplicação por revision e a guarda de geração, sem criar um segundo estado em memória. Assim, quando a chamada RPC retorna, o chamador obtém a mesma Registry View correspondente ao resultado recém-persistido.

## 17. O Account Provider não recoloca credenciais dinâmicas no Registry

Após o levantamento de Start Plan, Personal Coding Plan e Team Plan, confirmou-se que o antigo Snapshot do Registry carregava simultaneamente definições estáticas, o escopo permitido do plano e as credenciais de requisição. A Account Source do M2 projeta apenas os Providers e modelos cuja publicação é permitida, além da identidade de acesso de conta não sensível que precisa ser fixada ao criar um Model; JWT, API Keys Personais/Team copiadas e Headers pontuais permanecem no Service de autenticação em tempo de requisição.

A identidade de acesso é um limite de estabilidade de execução necessário. Personal e Team hoje podem compartilhar o mesmo providerId; se o Model lesse a cada requisição apenas a conexão global atual por providerId, o usuário trocando de conexão no Loop faria um Model antigo trocar de credenciais silenciosamente. A interface de domínio chama isso de `accessId`: deve ser fornecida pela Account Source, é retida no registro de execução do Registry e não é projetada na Model Selection View. O ModelFactory futuro a fixa ao criar o Model, permitindo a renovação de Token dentro daquela identidade.

O Endpoint do Account Provider hoje também faz branching conforme `process.env`. Depois que a Official Config se tornar a única fonte estática de verdade, o Endpoint não será reescrito novamente no Registry ou na Factory; Produção, Teste e ambiente de desenvolvimento devem ser expressos por sua Official Config completa injetada respectivamente.

Os detalhes do estado atual e da fronteira de migração estão em [`../research/account-provider-facts-and-auth.md`](../research/account-provider-facts-and-auth.md). Se cada Family publica uma conexão atual ou várias conexões simultaneamente continua sendo uma decisão de nível de produto; o código atual não alterou esse comportamento antecipadamente.

## 18. O ProviderRuntime cuida apenas da composição no processo

`ProviderConfigRuntime` continua possuindo apenas o IO Official/Personal, a migração única e o Config Service. O novo `ProviderRuntime` compõe sobre ele a Account Source injetável, o Registry Service, o Settings Facade e o Selection Facade.

```text
ProviderConfigRuntime ───┐
                         ├─> ProviderRuntime
Account Access Source ───┘   ├─ Registry
                             ├─ Settings Facade
                             └─ Selection Facade
```

O Local Host passou a possuir e iniciar o `ProviderRuntime`, cujo ciclo de vida é liberado junto com o ServiceCollection. Como a Account Source ainda não está integrada, uma Source vazia é usada explicitamente: API Providers comuns podem formar um Registry de forma independente, e Account Providers não voltam ao novo Registry a partir do antigo Snapshot do Registry. Mais adiante, Host, Worker, Prompt CLI e TUI injetarão a mesma interface de Account Source que cada um consiga obter.

Os métodos de escrita do Settings Facade e os métodos de leitura do Selection Facade já usam o mesmo Registry através desse Runtime. Os consumidores atuais de RPC/UI ainda não foram trocados, evitando formar escrita dupla enquanto a entrada de escrita da antiga Personal Config ainda existir; a próxima fatia precisa colocar a migração final da configuração antiga e a troca da entrada de escrita das configurações na mesma sequência de commits.

## 19. Settings e Selection usam serviços RPC independentes

O Local Host já registrou os dois canais de serviço `provider-settings` e `model-selection`. O primeiro oferece salvar, excluir e reordenar Providers/Models Personals; o segundo oferece apenas a View selecionável e a validação de Selection. Ambos são criados pelo mesmo ProviderRuntime, e a camada RPC não reinterpreta a configuração.

O `IServiceAccessor` do Renderer atual ainda não ganhou esses dois serviços, e os consumidores do antigo `IModelProviderService` também não foram trocados. Essa ordem é intencional: primeiro estabelecer o contrato de back-end e validar a barreira de atualização e, depois, migrar a UI conforme o uso de cada chamada; não se pode converter a nova View de volta para `ModelProviderConfig[]` para manter uma compatibilidade apenas aparente.

A classificação dos métodos do serviço antigo e as restrições de troca estão em [`../research/legacy-model-provider-service-call-map.md`](../research/legacy-model-provider-service-call-map.md).

## 20. O proxy do Client é uma capacidade opcional durante a migração

`RemoteServiceAccess` já criou proxies independentes para `provider-settings` e `model-selection`. Durante a migração do M2, `IServiceAccessor` os declara opcionais: as entradas antigas Remote/Server que não injetaram a Official Config e, portanto, não têm ProviderRuntime, não são obrigadas a forjar um conjunto de implementações.

Essa opcionalidade existe apenas para servir a migração gradual entre entradas e não pode ser usada como feature detection em runtime. `RemoteServiceAccess` cria o Proxy do canal indicado incondicionalmente, e mesmo que o peer antigo não tenha registrado esse canal o campo não será `undefined`. A página de configurações atual só pode usar os novos serviços em um Local Host com ProviderRuntime comprovadamente montado; quando Host, Remote Server, Prompt CLI/TUI concluírem a montagem, a marca opcional deve ser removida, para que um canal ausente se torne um erro explícito de montagem. Se for necessária compatibilidade com Hosts remotos de versões diferentes, deve ser criada uma negociação explícita de capacidades.

## 21. Auditoria de campos e responsabilidades da página de configurações

A página de configurações hoje acumula edição de Config, conexão Account/Plan, apoio à conectividade e sincronização do Registry de Host para Worker. O novo `ProviderSettingsService` assume apenas a primeira; as demais capacidades migram conforme sua própria fronteira de domínio e não podem continuar sendo agregadas pelo antigo `ModelProviderConfig[]`.

Embora a estrutura antiga de endpoint ainda guarde `baseURL + paths`, a página de configurações atual já convergiu para um único `apiFormat`. Ao salvar, os múltiplos paths históricos são removidos e um caminho completo customizado continua salvo em `baseURL`. Por isso o novo Provider Config não ganha o campo paths; o ModelFactory adota o operation path padrão do protocolo conforme o `apiFormat`.

A superfície completa de chamadas, a atribuição de campos e a ordem de troca estão em [`../research/legacy-model-provider-service-call-map.md`](../research/legacy-model-provider-service-call-map.md).

## 22. O Draft Preview fica no Settings Facade

O formulário de configurações precisa enxergar ao mesmo tempo os valores Personal explícitos, os valores Effective herdados e os problemas de integridade. `ProviderSettingsService` ganhou dois métodos de preview, um para Provider e outro para Model: eles tratam um Draft ainda não salvo, mas que já passou pelo Schema de entrada, como uma última camada temporária de Personal Config, reutilizam o `ProviderConfigResolver` para computar a View completa e não gravam no Repository, não substituem o Registry e não emitem eventos de mudança.

Assim o Renderer pode usar valores Effective como placeholder e exibir os problemas de validação vindos da camada de domínio; o Renderer não precisa duplicar ConfigOverlay, campos obrigatórios ou a lógica de ModelConfigRules.

Preview não é um parser de formulário de strings cruas. URLs pela metade ou textos não inteiros durante a digitação são mantidos pelos controles do formulário; o Preview só é chamado depois que um `ProviderConfigInput` / `ModelConfigObject` válido é formado. Assim o domínio de Provider não precisa introduzir tipos de string de Draft de UI.

## 23. Propriedade de vídeo completada antes da integração do Model Factory

Ao preparar o Registry para criar o `Model` do M1, descobriu-se que o `supportsVideo` do design ainda não havia entrado no contrato real de Model. Essa lacuna já foi completada no contrato público do M1, na validação de requisição do Adapter e na projeção de mídia do Core; a antiga Factory tem como default não suportar, e o novo Registry fornecerá mais adiante um valor explícito a partir do Model Config completo.

Trata-se de uma complementação de contrato antes da integração, sem introduzir um novo conceito de configuração para o M2. O Registry Model Factory continua consumindo apenas a Config final de Provider e de Model.

## 24. O Registry existente do AI SDK é rebaixado a projeção de execução

O M2.5a adicionou o Model Runtime do API Provider. Ele gera, de forma unidirecional, o `AiSdkModelRegistryConfig` existente a partir da nova Registry View e cria o Model do M1 usando o mesmo ProviderConfig e ModelConfig dessa nova Registry.

O antigo `AiSdkModelRegistry`, nessa cadeia, responde apenas pela SDK Factory, pela rede, pelas validações de segurança de requisição e pela projeção interna necessária à execução das requisições; deixa de ler Catalog, Config da CLI e Snapshot do Host, e não participa da validação de Selection. Atualizações do Registry substituem a projeção de execução usada pelos Models criados depois; Models já criados mantêm o SDK Model resolvido anteriormente e não mudam com a atualização de configuração.

O Reasoning Mapping é colocado no namespace do Adapter existente conforme o `apiFormat` no momento da criação do Model: Anthropic Messages usa `anthropic`, OpenAI-compatible Chat usa `openaiCompatible` e OpenAI Responses mantém a entrada de parâmetros canônica existente. O desligamento de raciocínio e o orçamento de saída visível de fixed-thinking do Sidecar continuam reutilizando a semântica do Adapter do M1.

Apenas as fronteiras e os testes foram concluídos; a montagem de produção do Worker ainda não foi trocada. O Account Provider é explicitamente recusado nesse caminho de API Provider e será integrado mais adiante ao Service de autenticação em tempo de requisição; ele não volta ao antigo Snapshot do Registry.

## 25. A Node Config Source converge para o pacote companheiro compartilhado

O M2.5b precisa fazer Local Host, Core Worker, Prompt CLI e TUI lerem cada um a mesma Official/Personal Config do mesmo Environment. A implementação de arquivos Node atual está em `@zcode/services`: a Official Source depende da leitura de arquivos e do watcher do Node, e o Personal Repository ainda depende da resolução de caminhos e das ferramentas de arquivo atômico do Services. Se o Bootstrap reutilizasse diretamente esses elementos, teria de depender de todo o pacote Services, que contém muitas capacidades de Host; se duplicasse a implementação dentro do Bootstrap, o lock de arquivo, a migração, o watcher e o comportamento de revision passariam imediatamente a existir em duas versões.

Foi criado o pacote companheiro Node `@zcode/provider-node`. O pacote de domínio puro `@zcode/provider` continua contendo apenas Config, Resolver, Registry e Facade; o pacote companheiro contém a Official file Source, o Personal file Repository, o Config Runtime e o Registry Runtime de nível de processo, e depende de `@zcode/provider` e da capacidade de persistência de arquivos já existente em `@zcode/shared/node`. O conversor do antigo `ModelProviderConfig` para o Personal Overlay continua no Services e é injetado pela entrada de migração, de modo que o novo pacote companheiro não depende dos tipos de domínio antigos.

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

A localização física da Official Config continua sendo responsabilidade da Entry. O Desktop Main resolve o caminho do arquivo em modo de desenvolvimento ou de instalação; o Local Host entrega os caminhos de arquivo Official e Personal ao Worker que ele gerencia como um par de variáveis de ambiente do processo. O Worker usa `@zcode/provider-node` para ler e vigiar os dois arquivos por conta própria e não recebe dados de Registry serializados pelo Host.

A compilação comum e o SEA de CLI/TUI isolados ainda precisam carregar a mesma `config/provider/official.json`, e então entregar o arquivo ou o conteúdo já interpretado à mesma fronteira de Source. Não se pode substituir isso por uma constante TypeScript embutida, o que recriaria uma segunda fonte da verdade.

## 26. O Registry e o Adapter de execução usam ciclos de vida diferentes

Ao implementar a montagem do Worker, chegou-se a considerar reunir o Registry de processo e o `AiSdkModelAdapter` em um único `NodeApiProviderRuntime`. O Adapter existente contém dependências de IO de Model, estado e telemetria em nível de Session/App; promovê-lo a singleton de processo faria Sessions diferentes compartilharem estado de execução que não deveria ser compartilhado, e criá-lo por Session faria o watcher de arquivos ser iniciado repetidamente.

Por isso os dois ciclos de vida são separados:

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

O Registry é uma visão factual de nível de processo; o Adapter e o Model Runtime são a composição de execução de nível App/Session. O M2.5c posterior faz cada `createZCodeApp` pegar emprestado o Registry de processo para criar seu próprio Model Runtime e fazer o dispose de forma simétrica quando o App é liberado. O próprio Registry só é liberado quando o Worker sai.

## 27. O Worker Registry começa como shadow runtime

O M2.5b já faz o Desktop Local Host injetar no Worker os caminhos de Official/Personal Config; o Worker inicia um Registry de nível de processo e mantém a atualização automática. CLI/TUI Standalone sem caminhos injetados e as entradas antigas mantêm o comportamento original; injetar apenas um dos dois caminhos recusa explicitamente a inicialização, evitando misturar acidentalmente um conjunto parcial de fontes da verdade.

Este passo não substitui imediatamente a ModelFactory de produção. A página de configurações atual ainda escreve a configuração antiga, e a migração Legacy Personal final do Local Host ainda não foi trocada atomicamente pela nova entrada de escrita; nesse momento, deixar o Worker executar diretamente com o novo Registry poderia obter uma Personal Config vazia. O M2.5c precisa avançar as seguintes ações como uma única sequência de commits:

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

O shadow runtime apenas antecipa a validação da localização de arquivos, da propriedade de processo, do watcher e do ciclo de vida do Registry, sem formar um novo ramo de fato de negócio.

## 28. O App já suporta a projeção de execução exclusiva do Provider Runtime

`createZCodeApp` ganhou um Registry de processo injetável. Após a injeção, cada App cria seu próprio `ApiProviderModelRuntime`, toma emprestado o Registry de processo, possui seu próprio `AiSdkModelAdapter` e ModelFactory e libera as assinaturas quando o App fecha. Sem injeção, continua sendo usado o Runtime Model Factory original.

Atualmente o Workspace/Turn Model Overlay chamava `replaceRegistryConfig()` diretamente. O novo modo estabelece explicitamente que a propriedade de toda a projeção de execução do Adapter pertence ao Provider Model Runtime; o Overlay ainda pode manter o estado de Session do período de migração e os dados da projeção antiga, mas não sobrescreve mais o Adapter Registry. `createModelAdapter` também passa a aceitar diretamente um Registry de execução inicial vazio e gerenciado externamente, de modo que o novo modo não precisa construir uma vez os fatos de Provider a partir do antigo Runtime Model Config.

```text
legacy app
└─ Runtime Model Overlay -> Adapter execution registry

provider-registry app
├─ Runtime Model Overlay -> 仅维护旧交互兼容状态
└─ ApiProviderModelRuntime -> Adapter execution registry
```

A entrada de protocolo ainda não habilitou esta opção. O Turn Overlay hoje também carrega Providers de execution-scoped, como tarefas ociosas; se a opção fosse habilitada antecipadamente, a nova ModelFactory não encontraria o Provider temporário no Registry de processo. Antes de abrir o开关 de produção, é preciso fazer os Providers temporários criarem Models pela entrada execution-scoped do ModelFactory unificado, ou manter um ramo de execução temporária com fronteira bem definida.

## 29. A antiga entrada de escrita de configurações conclui o cutover da Personal Config por ponte unidirecional

A página de configurações ainda não migrou para o novo Settings Facade, mas o Worker já lê de forma independente a nova Personal Config. Para que essas duas fatias possam entrar em produção consecutivamente, o Local Host, depois de uma escrita bem-sucedida em `IModelProviderService.save/delete`, converte a lista estática atual de Providers do usuário em um Personal Overlay e substitui atomicamente a nova Personal Config. Em seguida o Registry é explicitamente atualizado, de modo que, quando a chamada antiga de configurações retorna, a nova fonte da verdade já está consistente com o que o Worker vai ler.

Esta ponte trata apenas de salvamentos e exclusões explicitamente disparados pelo usuário e não assina o antigo Snapshot do Registry. Por isso, renovação de conta, mudanças de plano, material de verificação de segurança pontual, Headers temporários e Runtime Keys copiadas não são persistidos. Quando o arquivo Personal ainda não existe, o Config Runtime continua executando o mesmo conversor para a migração inicial; depois que o arquivo existe, a lista estática completa de cada operação de escrita do usuário passa a ser a referência para regenerar a diferenças esparsa.

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

A ponte fica dentro da antiga fila de escrita. Quando uma nova escrita Personal falha, a chamada antiga de configurações falha em vez de devolver uma aparência de sucesso baseada apenas no arquivo antigo; salvar novamente converge usando a lista estática completa. Este desenho é uma fronteira temporária durante a troca da página de configurações, e a condição de saída é que todas as escritas de configuração de Provider/Model passem a usar o novo Settings Facade. Nesse momento os callbacks de exclusão e as dependências dos tipos Legacy são removidos, e a nova Personal Config permanece como única fonte da verdade de escrita.

## 30. O Provider execution-scoped é unificado pelo Model Runtime

O Provider Model Runtime ganhou um `ExecutionScopedModelSource`. O Registry de processo continua fornecendo os fatos de longo prazo de Provider/Model; essa Source fornece apenas o Provider temporário que o App está executando no momento, a projeção interna do Adapter e a capacidade de criação de Models. Os dois formam a configuração de execução do Adapter no mesmo Model Runtime, e as entradas execution-scoped têm prioridade em caso de conflito de providerId/modelId, mas não são gravadas no Registry de processo, na Settings View, na Selection View nem em disco.

O per-turn Runtime Model Overlay existente das tarefas ociosas já está encapsulado como esse tipo de Source. O Overlay Manager publica para fora apenas a configuração, o Catalog e os eventos de mudança do nível de turn; o Overlay de compatibilidade workspace/session não reaparece por essa via na nova cadeia de fatos de execução. O Provider temporário é adicionado no início do turn e o Model Runtime substitui atomicamente a projeção do Adapter combinada; no fim do turn a camada é removida e a projeção volta a ser puramente a do Registry. Um Model em execução já holds seu próprio SDK Model e não muda por causa da atualização da projeção.

```text
process Provider Registry ───────────────┐
                                         ├─> App Provider Model Runtime
turn ExecutionScopedModelSource ─────────┘   ├─ Adapter execution projection
                                             └─ ModelFactory

Settings / Selection View
└─ 只读取 process Provider Registry
```

Essa fronteira elimina o bloqueio de troca para produção de "habilitar o novo Registry faz o Provider temporário das tarefas ociosas desaparecer". Ela ainda reutiliza o formato de dados atual do Runtime Model e a Factory de compatibilidade; o M4 transformará a entrada de Provider temporário em entrada oficial de Config/ModelFactory, momento em que esta camada de conversão do formato antigo será removida, mas a semântica de ciclo de vida e prioridade do `ExecutionScopedModelSource` poderá ser preservada.

A validação de regressão também encontrou uma inconsistência de baseline já existente: a lógica de produção do GLM-5.3 fixa o nível padrão de reasoning em `max` conforme a identidade do modelo, mas a asserção antiga em `offpeak-turn-model-overlay` ainda espera o `high` de entrada. Esta fatia não modificou esse ramo de capacidade do modelo nem usa a migração de Providers para decidir sua semântica de produto; os demais testes de execution-scoped, Runtime, Overlay e ciclo de vida do App passaram.

## 31. O App de produção do Worker começa a usar o Registry de processo

O Protocol Worker passa a injetar o Provider Registry de nível de processo ao criar o App. O novo Model Runtime constrói Models e a projeção de execução do Adapter segundo três níveis de prioridade:

```text
turn execution-scoped Provider
              >
process Provider Registry
              >
workspace compatibility Provider
```

A camada de compatibilidade de workspace contém apenas o workspace Overlay atualmente enviado pelo Host e não lê a Config antiga do CLI. Ela só pode criar um Model quando o novo Registry está sem o providerId inteiro, e serve para manter os Plan Providers que ainda não foram integrados ao Account Access/Service de autenticação em tempo de requisição; quando o mesmo providerId já aparece no novo Registry, a configuração antiga, a API Key e as entradas de modelo não podem sobrescrever os novos fatos. A projeção interna de execução do Adapter é mesclada na direção oposta, de modo que o Registry sobrescreve a compatibilidade e o execution-scoped de turn sobrescreve o alvo desta execução.

Essa camada de compatibilidade tem uma condição de saída clara: quando o M2.7 integrar o Account Provider ao Registry e ao ModelFactory unificado, não existirá mais no workspace Overlay nenhum Provider ausente do novo Registry, e então o `fallbackSource` será removido. Ela não participa das Settings/Selection Views e não pode ser uma entrada de fato para novos Providers.

A inicialização do Worker e a primeira migração Personal do Host podem ocorrer de forma concorrente: quando o Registry inicial do Worker ainda não tem o API Provider do usuário, a compatibilidade de workspace mantém a sessão atual executável; assim que o arquivo Personal é gravado, o watcher atualiza o Registry de processo e os Models criados depois passam automaticamente para a nova fonte da verdade. Models já criados não são reescritos.

## 32. A superfície de consumo da seleção de modelos migra primeiro para o API Provider comum

O Renderer ganhou um snapshot próprio de `ModelSelectionView`. O Root primeiro assina `ModelSelectionService.onDidChange` e só depois lê a View inicial; a guarda de revision evita que uma leitura inicial atrasada sobrescreva eventos de atualização. O snapshot de memória da UI mantém a Registry View serializável e não a converte para o antigo `ModelProviderConfig[]`.

O menu de modelos do Composer principal passa a consumir diretamente essa View. No novo Registry, os Providers com `kind = api` são projetados em grupos de modelos conforme a ordem do Registry e filtrados pelo `apiFormat` suportado pelo Agent atual; entradas do snapshot antigo com o mesmo providerId são excluídas, de modo que o nome, o conjunto de modelos e a ordem dos API Providers comuns passam a ser definidos pelo novo Registry. O valor atualmente selecionado, o nome do trigger e a elegibilidade para restauração de configuração também passam a reconhecer os Registry Providers, evitando que um novo Provider só apareça no menu sem ser corretamente refletido de volta.

Account/Plan Providers continuam temporariamente sendo complementados pela projeção de seleção antiga. A razão é que o agrupamento por Family, a conexão pessoal/equipe e o estado de entitlement ainda não foram conectados ao `AccountProviderAccess`; tratar cedo o Account Config como um grupo de modelos comum perderia a semântica de interação existente. Essa fronteira de compatibilidade cobre apenas Account/Plan e será removida quando o M2.7 integrar o Account Provider ao Registry unificado.

Depois do Composer principal, os menus de modelos de Automations (incluindo o formulário compartilhado com OffPeak), Subagent e Repo Wiki também passam a usar a mesma View. O estado de tarefa, o Entitlement e a lógica de Family/Team Plan originais de cada funcionalidade permanecem inalterados; os API Providers comuns vêm da nova View e Account/Plan são complementados pela projeção antiga do período de migração. A leitura e escrita de Config da página deSettings migram separadamente para o `ProviderSettingsService` e não usam o snapshot de seleção de modelos para executar escritas.

Além da seleção de modelos, os campos estáticos de Provider lidos pelos elementos ao redor do chat seguem a mesma prioridade. O aviso de troca de modelo, o nome na timeline e o Provider Base URL na telemetria de envio são lidos preferencialmente do `ModelSelectionView`; somente Account/Plan Providers que o Registry ainda não publica recorreram à projeção antiga. Assim, mesmo que um API Provider comum exista simultaneamente nos dois objetos do período de migração, o snapshot antigo deixa de decidir exibição ou atribuição.

## 33. O Account Access começa com uma Source de migração sem dados sensíveis

Os fatos estáticos de Provider/Model dos Account Providers já entraram em `config/provider/official.json`. O arquivo único atual representa o ambiente de produção, portanto os quatro Plan Providers usam o Endpoint de produção; teste ou outros ambientes de produto expressarão isso mais adiante por meio da injeção de outra Official Config completa, e não é permitido que o Registry leia `process.env` para reescrever o Endpoint.

A lógica atual de conta, plano e Provider Family continua concentrada no antigo `ModelProviderService`. O M2 adiciona temporariamente a única Source de migração, que comprime o Registry Snapshot já filtrado por ele para:

```text
providerId + modelIds + accessId
```

As API Keys, JWTs, Headers, Endpoints e capacidades de modelo do Snapshot não entram no novo Account Access. O Team Plan usa a complete selected connection key como `accessId`; o Personal Coding Plan e o Start Plan usam IDs estáveis e não sensíveis. Assim o Registry pode fixar a identidade da conexão no momento da criação do Model e ao mesmo tempo continuar deixando as credenciais de requisição para o futuro Request Auth Service.

Os Account Models Official mantêm temporariamente as formas de caixa realmente usadas pela cadeia antiga, `GLM-5.2` e `GLM-5-Turbo`. Como ModelConfigRules é uma correspondência regex completa e sensível a caixa, desta vez foram escritas regras explícitas na Official Config para esses dois IDs, sem alterar globalmente a semântica de casamento das regras e sem normalizar silenciosamente o modelId das Sessions históricas. Depois que a Official Config remota entrar em produção, deve-se publicar diretamente o conjunto completo de modelos de Account; a Access Source se limita a filtrar o subconjunto atualmente disponível para a conta.

## 34. O Worker Registry recebe o escopo de acesso da conta, e as credenciais de execução ficam por enquanto na projeção de compatibilidade

O protocolo antigo de Host Registry ganhou um `accountAccessId` opcional. Ele representa apenas a identidade da conexão de conta atual e não contém Secrets. Ao construir o Snapshot antigo, o Host escreve esse campo conforme a conexão Personal/Team/Start Plan atual; ao receber `workspace/updateProviderRegistry`, o Worker primeiro comprime as entradas de conta em um `AccountProviderAccessSnapshot`, depois espera o Registry de processo concluir a atualização e, por fim, aplica a projeção de execução antiga do Workspace.

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

Essa ordem garante que, quando a criação da Session ocorre logo após a requisição de atualização, o Worker Registry já enxerga o Account Provider. As Properties, Option Specs, Options padrão e o reasoningMapping do Account Model vêm todos da Official Config; os campos de capacidade dos modelos de mesmo nome no Snapshot antigo não participam mais da criação de Models.

As credenciais de requisição ainda não concluíram a migração final. Como o Adapter atual resolve e segura o SDK Model correspondente no momento da criação do Model, um Model já criado do Coding Plan não troca de credenciais no lugar quando o Registry é atualizado depois; o Start Plan ainda usa, antes de cada requisição, o canal de refresh existente do Header de verificação de segurança pontual. A próxima fatia precisa criar o Request Auth Service com um `accountAccessId` fixo e então remover os Secrets de conta do Snapshot antigo do Workspace e o `fallbackSource`. Até lá, a projeção de execução antiga não deve ser descrita como nova fonte da verdade do Registry.

## 35. A identidade do Account Access é fixada dentro do Model e chega até a fronteira da requisição

Na criação de um Account Model, o `accountAccessId` atualmente publicado pelo Registry é gravado na configuração privada de execução do Model no Adapter. O chamador de negócio continua submeter apenas o `ModelRequest` genérico; ele não lê a conexão da conta nem transmite o Access ID. O Adapter anexa esse ID ao chamar o Runtime Header Port existente em cada tentativa real de rede, e o Worker o repassa ao Host por um protocolo estrito.

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

Este passo apenas estabelece a cadeia de identidade estável, sem alterar o comportamento existente de resolução e refresh da API Key, da Coding Plan Runtime Key ou do Header de verificação de segurança pontual do Start Plan. A próxima fatia pode obter no lado do Host as credenciais de requisição pelo `accessId`, sem precisar adivinhar com base na "conexão atual" mutável; um Model já criado continua solicitando o material de autenticação da conexão original mesmo que a conexão Personal/Team seja trocada.

## 36. O Adapter ganha material de autenticação de escopo de requisição

Uma pesquisa adicional confirmou que a Coding Plan API Key não corresponde a apenas um HTTP Header. O Adapter atual a usa para inicializar o Provider SDK e, em alguns Endpoints, participa da verificação de segurança de requisição da versão oficial. Por isso o Host não pode traduzir antecipadamente toda a autenticação dinâmica como um Authorization Header.

O contexto de chamada do Model ganhou um `ModelRequestAuth` interno, com `apiKey` e `headers` opcionais. O Request Auth Port pode devolvê-lo em cada tentativa física; o Adapter cria temporariamente o SDK Model para o attempt atual com base na configuração estática de execução do Provider no Registry compartilhado. Uma API Key temporária continua passando pelos caminhos existentes de SDK, roteamento de Endpoint e verificação de segurança da requisição, enquanto o Header sobrepõe os Headers estáticos do Provider. Nem o Registry compartilhado, nem o Model já vinculado, nem as requisições concorrentes são modificados.

Esse tipo não faz parte do `ModelRequest` genérico e também não entra na Provider Registry View. O Schema do protocolo suporta primeiro o resultado de autenticação de tempo de requisição como opcional; enquanto o Host não fornecer esse campo, o comportamento atual de atualização do Runtime Header permanece inalterado.

## 37. O Header de verificação de segurança pontual entra primeiro pelo recibo de auth de escopo de requisição

Ao responder às requisições existentes de Provider Runtime Headers, o Services coloca o Header de verificação de segurança pontual obtido pelo Renderer também em `requestAuth.headers` do protocolo. O novo Adapter do Worker o usa diretamente para o attempt atual. O antigo `session/updateRuntimeModelConfig` continua sendo executado temporariamente, para proteger Workers antigos, o remote anexado ao desktop e as origens de Model ainda não migradas; os dois caminhos usam o mesmo Header e, portanto, não alteram o resultado da requisição atual.

Este passo prova que o material de autenticação de tempo de requisição pode trafegar inteiramente por Renderer → Services → stdio → Worker → Adapter. Antes de sair da atualização antiga do runtimeModel, ainda é preciso fazer o Host Request Auth Service fornecer simultaneamente o JWT do Start Plan, a Key do Personal Coding Plan e a Key do Team Plan resolvida por org/project fixos; não se pode buscar um Secret apenas a partir da conexão selecionada atual no Snapshot antigo.

## 38. O Host estabelece a fronteira de resposta automática de Account Request Auth

O ZCode Agent Service pode injetar um Account Request Auth Resolver estreito. O Resolver obtém a API Key e o Header do attempt atual a partir do `providerId + modelId + accountAccessId` já fixado no Model. Personal Coding Plan e Team Plan passam a ser respondidos diretamente pelo Host, sem depender mais do Renderer ou do painel de sessão; o Start Plan ainda espera o Renderer produzir o Header de verificação de segurança pontual e então o combina com o JWT devolvido pelo Resolver em um único Request Auth Material.

O Runtime Auth Port do lado do Worker permanece disponível para todos os Models, mas o Adapter só o invoca quando existe um `accountAccessId` dentro do Model, de modo que um API Provider comum não ganha uma ida e volta extra ao Host. O que está concluído agora são as fronteiras de comunicação, roteamento e combinação; o próximo passo é injetar o resolvedor real de autenticação de Plan no Host de produção.

## 39. O Host deproduction integra o Account Provider Request Auth Service

O Services ganhou o `AccountProviderRequestAuthService` independente, que valida a pertencimento de `accountAccessId` e providerId e resolve separadamente as três identidades de execução:

- O Start Plan lê o zcode JWT do OAuth Token Set conforme o provider family.
- O Personal Coding Plan lê a cada vez a API Key mais recente daquele provider.
- O Team Plan resolve o product / organization / project fixados no accessId e então obtém a Key do projeto correspondente.

A implementação remota de ensure/copy da Team Key reutiliza temporariamente a lógica estável do antigo Model Provider Service, mas a entrada é agora construída isoladamente pelo Request Auth Service com o accessId fixo, sem ler a selected connection atual da UI. Os testes cobrem o timing de "o Loop mantém a Team A, a seleção atual já voltou para Personal e a requisição ainda obtém a Key da Team A". Quando a projeção antiga de Secrets do Registry for removida, a implementação remota da Team Key será extraída fisicamente do Service grande, sem afetar a fronteira externa já estabelecida nesta etapa.

## 40. O Account Provider sai da dependência de criação de Secrets do Workspace

A projeção de execução do AI SDK do Worker agora contém simultaneamente Providers de API e de Account. A projeção de Account contém apenas apiFormat, baseURL e Headers estáticos, e permite inicializar o SDK sem API Key; `createModel()` fixa o `accountAccessId` e cada tentativa real cria o SDK Model do attempt com o Request Auth Material.

Assim, a criação de um Account Model não depende mais de existir um Model de mesmo nome na workspace compatibility source. O Snapshot antigo ainda pode ser gerado pelo Host para outros consumidores ainda não migrados, mas a correção de autenticação do novo Account Model local já não depende do Secret dele.

## 41. O Account Registry enviado pelo Local Host éuariado sem Secrets

Quando o ZCode Agent Service tem ao mesmo tempo uma Provider Registry Source local e um Account Request Auth Resolver, ele remove, na fronteira Host → Worker, o `apiKey` e os Headers de tempo de requisição dos Account Providers, mantendo apenas a projeção estática de provider/model e o `accountAccessId`. A revision após a remoção de secrets é recalculada a partir desse conteúdo estático; a renovação de Token e de Team Key não faz mais o Worker acreditar que os fatos estáticos do Registry mudaram.

Essa troca por enquanto vale apenas para o novo Runtime local. SSH / WSL / Docker anexados ao desktop ainda não têm uma Provider Registry Source local e mantêm a compatibilidade do Snapshot antigo; eles removerão os Secrets depois de conectarem o mesmo Registry e a mesma fronteira de Request Auth no M2.8.

## 42. O Settings Facade migra primeiro os fatos de leitura estática

O Host inicia o Provider Runtime de forma assíncrona logo depois de montar o Service Collection. O novo Facade lia inicialmente direto do Snapshot do Registry, de modo que, se o Renderer chamasse `getView()` antes da primeira resolução da Source, recebia um erro de "ainda não iniciado" e voltava à projeção antiga. `ProviderRuntime` agora mantém um único start Promise; a visualização, o preview e a escrita de Settings, assim como a visualização e a validação de Selection, aguardam essa barreira de prontidão.

O Renderer ganhou um snapshot compartilhado de `ProviderSettingsView`, que também segue o timing de conexão "assinar primeiro, depois ler, com a revision impedindo valores atrasados". Os componentes atuais da página de configurações ainda consomem o tipo de exibição antigo `ModelProviderConfig`, então a fronteira de migração faz primeiro uma projeção unidirecional:

```text
ProviderSettingsView
├─ API Provider 静态字段与 Model Config ──> 设置页兼容展示对象
└─ Account Provider
   └─ 暂时复用旧对象的套餐、连接与产品交互状态
```

Label, Endpoint, API Key, conjunto de modelos, Properties, Option Specs e comportamento de reasoning de um API Provider já não são mais determinados pela lista antiga. A criação e a edição de API Providers somente-Personal já migraram para a primeira escrita na nova Config, conforme a seção 46; os formulários de Official/Account Provider ainda passam pela ponte da seção 29. Depois que o estado Personal/Effective do formulário for separado do estado de produto de Account, a projeção de compatibilidade e a ponte de escrita antiga serão removidas.

## 43. A ordenação de Providers volta ao Personal Overlay

A página de configurações não usa mais um `display-order` independente para determinar a ordem da View de Providers. A página obtém a ordem Effective diretamente do `ProviderSettingsView` e só renderiza a alça de arraste para Providers somente-Personal com `canReorder = true`. Official Providers e seus Personal Overrides mantêm a posição do Official.

Após o arraste, a página chama primeiro o Settings Facade para reordenar os Personal Provider Configs. A sequência de IDs recebida é a ordem Effective final atual; o Config Service extrai apenas as keys já existentes no Personal Overlay, de modo que um Official Override é normalizado pela ordem do Official para antes dos Providers somente-Personal. Esta seção mantinha inicialmente o espelho do antigo `saveDisplayOrder`; a seção 89 confirmou que o novo Host já não tem consumidores desse espelho e tornou a escrita nova e a antiga em caminhos mutuamente exclusivos.

## 44. A ordenação de Models Personais volta ao Provider Config

A página de configurações só mostra a alça de arraste de modelos para Providers somente-Personal com `canReorder = true`. O arraste usa a ordem atual de IDs de modelos para chamar `ProviderSettingsService.reorderPersonalModels()`; o Config Service reordena apenas o campo `models` daquele Personal Provider, e as propriedades do modelo continuam sendo sobrescritas separadamente pelas Model Config Rules.

O antigo `ModelProviderConfig.models` é salvo durante a migração com a mesma ordem, para uso dos consumidores que ainda não saíram da lista antiga. A construção do espelho volta a acrescentar à lista as lápides ou entradas ocultas que não participaram do arraste, evitando que uma reordenação de modelos visíveis apague acidentalmente o estado de compatibilidade. Quando a nova escrita Personal falha, a UI restaura a ordem original; quando a nova escrita tem sucesso, uma falha apenas no espelho antigo gera um aviso e não reverte a única fonte da verdade.

## 45. A exclusão de Provider somente-Personal passa a usar a nova fonte da verdade

Ao excluir na página de configurações um Provider somente-Personal com `canReorder = true`, a página chama primeiro o Settings Facade para excluir o Personal Config e só então exclui o espelho de compatibilidade da lista antiga de Providers. Quando a nova exclusão falha, o comportamento antigo é mantido e o erro é reportado à UI; quando a nova exclusão tem sucesso, uma falha apenas no espelho antigo gera um aviso e não pode recriar um Provider já removido da única fonte da verdade.

Official Providers e seus Personal Overrides não passam por esta entrada. Eles ainda precisam de uma troca no novo formulário de configurações que distinga explicitamente "excluir o Provider" de "limpar o Personal Override", para não misturar dois ações de produto.

## 46. O Provider somente-Personal passa primeiro a usar a escrita atômica de configuração

O antigo cartão de configurações salvava um `ModelProviderConfig` completo de uma vez, misturando campos de Provider, campos de modelo e valores gerados pelo Catalog antigo. O novo contrato de configuração expressa a camada Personal explícita e o resultado Effective; escrever o resultado do formulário antigo como Personal Overlay para um Official Provider congelaria valores herdados e também não distinguiria "o usuário digitou explicitamente um valor igual ao do Official" de "o usuário não sobrescreveu". Por isso esta fatia não faz o diferencial reverso de Effective para Personal em Official/Account Providers.

Um API Provider somente-Personal não tem baseline Official, e seu formulário completo pode ser convertido sem perdas em um Personal ProviderConfig completo mais o conjunto preciso de ModelConfigs daquele Provider. O Config Service oferece para essa interação um único update do Repository: atualiza o Provider e substitui por inteiro as regras de modelo precisas daquele Provider; os demais Providers, as regras de Pattern e as regras precisas de outros Providers permanecem inalterados. A RPC de configurações primeiro conclui essa escrita nova e depois grava o mesmo resultado no armazenamento antigo como espelho de compatibilidade. A escrita do espelho não dispara mais a substituição reversa do Personal Config pelo Legacy Importer.

Durante a migração permanece uma entrada de conversão de formulário Legacy com nome explícito, responsável por converter o antigo `ModelProviderConfig` em entrada do novo Facade. Ela aceita apenas o API Provider somente-Personal já confirmado pela Settings View. A condição de saída é o cartão de configurações passar a editar `personalConfig` diretamente, usando `effectiveConfig` para exibição herdada; nesse momento a entrada de conversão Legacy e o espelho no armazenamento antigo são removidos, sem levar tipos antigos para a API de domínio `@zcode/provider`.

## 47. O login por API Key do Welcome só modifica o Personal Override esparso

O formulário de API Key do Welcome atende apenas aos dois Official API Providers `builtin:zai` e `builtin:bigmodel`. Quando o usuário envia uma API Key, a nova entrada de escrita lê o `personalConfig` atual daquele Provider na Settings View, preserva os campos explícitos existentes e sobrescreve `kind = api`, `apiKey` e `enabled = true`. O Endpoint, a lista de modelos e as configurações de modelo fornecidos pelo Official continuam herdados e não são copiados do objeto Effective antigo para a Personal Config.

Depois de salvar, o Provider Store antigo ainda grava o mesmo resultado para os consumidores ainda não migrados, mas a sincronização reversa da Personal Config é desligada. A leitura da Key já salva também prioriza a Configuração Effective da Settings View; só recorre à lista antiga quando o novo serviço não está montado ou ainda não收录 esse Provider. O modo Provider Family, a seleção de modelos recentes do App e o estado de conclusão do Welcome continuam sendo gerenciados pelo estado de interação original, e esta fatia não altera essas semânticas de produto.

## 48. A restauração de Custom Model volta a usar a Selection View para判断 modelos selecionáveis

Ao restaurar uma seleção antiga de Custom Model que tinha apenas providerId e nenhum modelId, o SessionPane precisa escolher o primeiro modelo disponível daquele Provider. Depois que o Model Selection Snapshot está hidratado, esse candidato vem diretamente da Registry View; quando o Provider não existe ou não tem modelos, ele é considerado não selecionável no momento e não volta mais à lista antiga de Providers para trazer de volta à UI um modelo inválido. Apenas enquanto o Snapshot ainda não está hidratado a leitura de compatibilidade `getAllCached()` é mantida, evitando que o fluxo de restauração no início da partida falhe.

## 49. A exclusão de Provider somente-Personal também limpa a configuração precisa de modelos

O Provider Config e o Model Config preciso são duas partes persistentes do mesmo objeto de configuração. O Settings Facade decide o alvo da exclusão com base na camada Official: um Provider somente-Personal remove, em um único update do Repository, a linha do Provider e todos os ModelConfigs precisos daquele providerId; as regras de Pattern sob o mesmo providerId são preservadas. Quando o Personal Override de um Official Provider é limpo, os Model Overrides independentes não são removidos junto, e as duas ações do usuário continuam separáveis.

## 50. O portão de partida de drafts lê primeiro o Model Selection Service

O lançamento de drafts V4 só precisa saber se existe pelo menos um modelo selecionável no momento. Quando o novo Host já está montado com `ModelSelectionService`, a verificação de montagem, a assinatura de mudanças e a reverificação antes do envio leem a mesma Selection View; uma View vazia significa que o Registry confirmou que não há modelo vinculável. O antigo `ZCodeProviderRegistrySnapshot` só é usado como fallback quando o serviço está ausente durante a migração, continuando responsável pela compatibilidade com o Host antigo e com testes isolados. O admission de nível de processo do Host é mantido, responsável pela corrida de configuração que ocorre depois da reverificação da UI.

## 51. O Prompt CLI e a TUI entram primeiro com um Registry de processo injetável

`app-server` já inicia um `NodeProviderRegistryRuntime` no processo do Worker, mas o `--prompt` comum e a TUI ainda criam o App diretamente e, portanto, mesmo com a Entry fornecendo os caminhos de Official / Personal Config, não repassam o novo Registry ao Model Runtime.

Esta fatia reutiliza a mesma função de inicialização. O Prompt CLI inicia o Registry em um comando único, o empresta ao App e o libera depois que o App fecha. A TUI inicia uma única vez na primeira criação de App; `/new`, resume e fork apenas substituem o App e continuam emprestando o mesmo Registry, que só é liberado quando todo o Prompt Handler é encerrado. Assim cada processo TUI tem apenas um conjunto de watchers de Config.

Esta fatia não adivinha o local de instalação da CLI. A nova cadeia só é ativada quando a Entry já injetou os dois caminhos de Config; a montagem dos caminhos padrão da Official Config e da Personal Config que acompanham o pacote de CLI/TUI fica para a próxima fatia do M2.6. Essa fronteira é a entrada oficial de injeção de dependências, não um fallback de fatos antigos de Provider.

## 52. A CLI/TUI estabelece o caminho de execução padrão a partir do mesmo arquivo Official

> Esta seção e a próxima registram a implementação de caminho físico da época. A decisão posterior em [`Human in the Loop #10`](./02-provider-config-and-registry-human-in-the-loop.md#10-personal-config-保持原路径并以-schema-version-1-首次发布) já definiu que a Personal Config mantém o caminho original `config.json`, com backup antes da migração, e é publicada pela primeira vez com o Schema Version 1 final.

O bundle comum da CLI carrega o `config/provider/official.json` do repositório ao lado de `zcode.cjs`. A build SEA declara o mesmo arquivo físico como asset, lê o conteúdo do asset na inicialização e o materializa por SHA-256 em `.zcode/v2/runtime-assets/provider/`; o nome do arquivo contém o hash completo do conteúdo, de modo que uma nova versão não reescreve no lugar um arquivo Official que outros processos estão lendo. As duas formas de empacotamento terminam injetando apenas o caminho do arquivo em `@zcode/provider-node`.

A Personal Config aponta por padrão para `.zcode/v2/provider-config.json` sob a raiz de dados atual, usando o mesmo arquivo de Environment que o Desktop. `ZCODE_DATA_BASE_DIR` continua determinando a raiz de dados; os caminhos Official / Personal injetados explicitamente pelo Desktop Worker, pelos testes e pelas implantações remotas têm prioridade e não são sobrescritos pelos valores padrão da CLI. Comandos como Doctor, login e gestão de plugins, que não criam Core, não preparam o asset de Provider.

Esta fatia completa apenas a montagem física da fonte da verdade. O Model padrão do App Standalone, a lista `/model` e a Selection da Session ainda leem a Runtime Config antiga; Providers que o novo Registry ainda não收录 continuam sendo executados pela workspace compatibility source do M2.5. A próxima fatia precisa concluir a importação única das diferenças dos Personal Providers antigos da CLI e mudar a visualização e a seleção de modelos do Standalone para a Registry View; só então essa leitura antiga de fatos pode ser removida.

## 53. A migração do Standalone lê apenas as definições antigas de Providers do usuário

A Config antiga da CLI carrega vários domínios ao mesmo tempo: Provider, seleção de modelo atual, overrides de projeto, MCP, Hooks e outros. A migração de Personal Providers lê apenas o `provider` declarado explicitamente no arquivo de usuário antigo; `model` é Selection, e configuração de projeto, variáveis de ambiente e parâmetros de CLI são overrides de execução — nenhum deles pode ser固化ido como Environment Personal Config.

A entrada antiga do Desktop é o `ModelProviderConfig[]` histórico, e a entrada antiga do Standalone é o arquivo de configuração de usuário da CLI antiga (formato aninhado `provider` → `models`). Os dois são adapters para o `ProviderConfig + ModelConfig` atual e depois compartilham uma única projeção pura que calcula diferenças em relação ao Official. Assim, a interpretação do formato antigo fica em cada camada de montagem, enquanto as diferenças de campo do Personal Overlay, as regras precisas de modelo e a geração do documento versionado têm apenas uma implementação.

```text
Desktop legacy provider list ──> current Provider/Model ──┐
                                                          ├─> shared Personal diff ─> new file
Standalone user provider JSON ─> current Provider/Model ──┘
```

Somente o Prompt CLI e a TUI ativam explicitamente a importação Standalone. Workers de protocolo como `app-server` / `agent-server` continuam lendo apenas o Official, a Personal Config e o Account Access injetados pela Entry; eles não vasculham `~/.zcode/cli/config.json` da máquina. Quando o novo arquivo Personal já existe, o Repository não chama o importer e, portanto, sobras posteriores do arquivo de usuário antigo não sobrescrevem os novos fatos.

A implementação transformou o "cálculo de diferenças entre o Provider/Model atual já expandido e o Official" em uma projeção pura de `@zcode/provider`. A lista histórica do Desktop e o JSON de usuário do Standalone apenas adaptam os campos antigos; o cálculo de diferenças, as regras precisas de modelo e a geração do documento versionado usam a mesma implementação.

O adaptador Standalone atualmente migra nome do Provider, API Format, Base URL, API Key, Headers estáticos, ordem dos modelos, Properties, Option Specs e reasoning mapping. O formato antigo também permite `model.headers` e qualquer `model.options` fora do reasoning; a fronteira atual e oficial de Model/Request ainda não decidiu a atribuição desses campos de execução.

A migração é tudo ou nada: se qualquer Provider antigo contiver esses campos ainda não expressos, o importer desta vez retorna "não migrado", o Repository não cria o arquivo Personal e a compatibility source do M2.5 continua protegendo o comportamento de execução antigo. Assim, quando os campos forem completados em versões posteriores, ainda será possível tentar de novo, sem ser bloqueado para sempre por um arquivo vazio de migração parcial. Antes de a Selection View do Standalone sair da lista antiga de modelos, é preciso decidir se os campos fixos ainda válidos entram na Config ou se a capacidade antiga correspondente é removida com um diagnóstico de migração.

## 54. A seleção de modelo da Session passa a usar o Registry conforme o Provider

O Standalone Prompt CLI / TUI já possui um Registry de nível de processo, mas `ZCodeApp.listModels()`, `setModel()` e `setThoughtLevel()` ainda são interpretados pela Runtime Model Config e pelo Catalog antigos. Substituir apenas a lista de modelos produziria um estado intermediário inaceitável: o usuário veria os modelos do Registry e, ao trocar, seria rejeitado pela configuração antiga.

Desta vez esse conjunto de comportamentos é trocado como um todo:

```text
Registry 已拥有 Provider
├─ 候选模型来自 Registry View
├─ Properties / Option Specs 来自 ModelConfig
├─ reasoning 档位通过 ModelRef.variant 交给新 ModelFactory
└─ 显式切换只更新 Session 运行状态与 Session Selection

Registry 尚未拥有 Provider
└─ 整个 Provider 继续使用 M2.5 compatibility source
```

A mesclagem de compatibilidade é feita por Provider. As fontes antiga e nova nunca montam modelo a modelo o mesmo Provider entre si, portanto assim que o Registry assume um Provider, o Catalog antigo, o reasoning antigo e as capabilities antigas deixam de participar da cadeia de seleção desse Provider.

O caminho do Registry não grava mais a troca de `/model` no arquivo antigo de configuração de Providers da CLI. Essa ação expressa a seleção de modelo da Session atual; a escrita no arquivo antigo é mantida apenas no caminho de compatibilidade de Providers ainda não migrados. O Configured Default de uma nova Session da CLI/TUI ainda vem temporariamente da Runtime Model Config antiga e essa dependência de inicialização é removida quando for estabelecido um Selection padrão oficial.

## 55. `includeUsage` passa a fazer parte da Provider Config (coberto pela 74)

O `includeUsage:false` do Provider antigo da CLI faz com que requisições de streaming OpenAI-compatible não enviem `stream_options.include_usage`. Essa é uma semântica de execução estável da conexão do Provider, que não depende da Session nem de uma requisição específica; por isso entra na Official/Personal Provider Config e é projetada pelo Model Runtime para o Adapter existente.

O campo tem a mesma semântica de Config para Providers de API e de Account; hoje apenas o Adapter OpenAI-compatible o consome e os demais API Formats o ignoram. O Personal Importer antigo da CLI consegue migrar esse campo sem perdas.

O `headers` de nível de modelo e qualquer `options` ainda não entram nesta fatia. Eles alteram a fronteira Model/Request; o Importer continua recusando a migração de Providers que contenham esses campos de execução, e não produz um arquivo Personal parcialmente bem-sucedido.

## 57. Distinguir campos de execução antigos do Model de metadados sem consumidor

Os antigos `interleaved` e `reasoningContentField` são convertidos em `ModelCapability.reasoningContentField`, mas nenhum Model Request, conversão de mensagens históricas ou Adapter em produção lê esse campo. São metadados de Catalog de um ciclo inacabado e não devem continuar impedindo um Provider de entrar na nova fonte da verdade. Por isso o Standalone Importer ignora esses dois campos antigos.

Tanto `model.options.max_tokens` quanto o histórico `model.options.extra_body.max_tokens` expressam o limite de saída do modelo. O Importer os normaliza para `optionSpecs.maxOutputTokens` e não leva mais parâmetros brutos do Provider para a nova cadeia de execução. A prioridade mantém a lógica antiga: `limit.output > options.max_tokens > options.extra_body.max_tokens > maxOutputTokens > Catalog/Fallback`.

O restante de `model.options` e `model.headers` altera de fato a requisição e não pode ser descartado como metadado inválido. Esta auditoria mantém a recusa de importação; fatias posteriores precisam convergir esses campos para uma fronteira de Config tipada e de montagem do Adapter.

## 58. O Header estático de nível de modelo é encapsulado pelo ModelConfig (coberto pela 71)

A CLI antiga combinava Headers estáticos na ordem `Provider Header -> Provider options Header -> Model Header -> inline target Header`. O inline target já não faz parte da nova semântica de Config; as duas primeiras camadas foram convergidas para ProviderConfig.headers. O Model Header continua sendo uma configuração de execução válida e diferenciada por modelo dentro do mesmo Provider, e por isso converge para `ModelConfig.headers`.

A Registry View carrega o ModelConfig já resolvido. Ao criar o Model, o Worker entrega `headers` à fronteira de montagem de Model do Adapter; o Adapter o aplica por cima dos Headers atuais do Provider e reaplica o mesmo Model Header depois de cada renovação de Headers da autenticação de Account. Os tipos públicos de Model e ModelRequest não ganham um novo campo de Header.

`headers` é um campo de valor comum do ModelConfig: a regra que casa depois substitui por inteiro o dicionário de Headers da anterior. A projeção de diferenças Personal, o JSON Schema e o Standalone Importer usam o mesmo campo, sem criar uma segunda expressão em runtime.

## 59. Os parâmetros de requisição fixos do modelo convergem para a fronteira de montagem do Adapter (coberto pela 71)

O `model.options` da CLI antiga era combinado nas Provider Options quando o alvo do modelo era resolvido e campos como `reasoningSummary` realmente alteravam a requisição, portanto não podem ser descartados na migração. Ele também não pode voltar a ser uma entrada arbitrária de parâmetros no `ModelRequest` público, sob pena de contornar a fronteira de requisição genérica estabelecida no M1.

O ModelConfig ganhou `requestParameters: ProviderRequestParameters`, que guarda os parâmetros JSON Provider-native usados de forma fixa pelo modelo. Ao criar o Model, o Registry mescla recursivamente `requestParameters` com o `reasoningMapping` correspondente ao nível de reasoning atual, onde o segundo sobrescreve as folhas de mesmo nome; em seguida o resultado é envolvido uma vez conforme o `apiFormat` do Provider e entregue ao Adapter. Core, Model público e ModelRequest não têm ciência desses campos.

Entre regras de ModelConfig continua valendo a semântica de Overlay comum: o `requestParameters` de uma regra posterior substitui por inteiro o da anterior. A mesclagem recursiva é usada apenas dentro de um mesmo ModelConfig final, para combinar "parâmetros fixos do modelo + parâmetros de reasoning atual", correspondendo a um comportamento que já existia em runtime.

O Standalone Importer desembrulha o namespace histórico do API Format atual de `model.options` e grava em `requestParameters`. `max_tokens` e `extra_body.max_tokens` já foram normalizados para `optionSpecs.maxOutputTokens` e são removidos dos parâmetros originais durante a importação, evitando duplicação do campo de orçamento. Esta decisão completa os campos de execução antigos que o plano original não listava explicitamente, mantendo Official + Personal + Account Access como única fonte da verdade.

## 60. Não migrar campos do Schema antigo de Provider que não têm consumidor

O Schema antigo de `options` do Provider aceita `timeout`, `chunkTimeout` e campos desconhecidos extras, mas nem a resolução do alvo do modelo nem o Provider Registry os leem. O timeout HTTP efetivo vem de `network.timeout` independente e o timeout de ociosidade do stream vem de `modelStream.idleTimeoutMs`. Esses campos já não produzem comportamento de execução na cadeia antiga, então o Standalone Importer os ignora e não deixa mais a migração do Provider inteiro falhar por causa deles.

`apiKeyRequired: false` continua recusando a migração. O ProviderConfig atual só tem API Providers que exigem API Key e Account Providers com autenticação obtida em tempo de requisição; a equipe já decidiu explicitamente não criar, por enquanto, uma terceira forma oficial para endpoints de teste sem autenticação e auto-hospedados. O Importer mantém o tudo ou nada, de modo que essa configuração interna continue passando pelo caminho de compatibilidade e não gere uma nova Personal Config impossível de executar.

## 61. O formulário antigo de configurações preserva a configuração de execução privada do modelo ao salvar (coberto pela 71)

A página de configurações ainda projeta a nova ProviderSettingsView como o antigo formulário `ModelProviderConfig`. Esse tipo antigo não tem Header nem `requestParameters` de nível de modelo, portanto, depois que o usuário altera apenas o nome do Provider, a Base URL ou a API Key e salva, a reimportação inversa substituiria por inteiro o ModelConfig preciso e apagaria fatos de execução que a interface não consegue expressar.

Ao salvar um API Provider somente-Personal, a ponte de migração usa como base a configuração editável convertida do formulário antigo e, ao mesmo tempo, preserva `headers` e `requestParameters` dos modelos de mesmo nome presentes no Registry atual. Esses dois campos só são consumidos na fronteira de montagem do Adapter, e a página antiga de configurações não tem interação para editá-los ou limpá-los; manter o valor atual corresponde à semântica observável pelo usuário. Depois que o novo formulário de configurações passar a editar o ModelConfig diretamente, essa lógica de ponte é removida junto com a projeção antiga `ModelProviderConfig`.

## 56. Provider Config v2 e ponte de migração da página de configurações (coberto pela 74)

A versão do documento Provider Config sobe para 2 e passa a incluir a migração de versão adjacente de v1 para v2. Como `includeUsage` é um campo opcional, a migração preserva o conteúdo original da configuração e apenas atualiza a versão do documento; tanto a Official Source quanto o Personal Repository leem pela mesma entrada de migração, e versões futuras continuam subindo nível a nível entre versões adjacentes.

A página de configurações atual ainda projeta a `ProviderSettingsView` como um objeto de formulário antigo `ModelProviderConfig`. Se a ponte de migração não carregar o `includeUsage`, o usuário que editar outros campos e salvar apagaria esse novo fato da Personal Config. Por isso o tipo antigo, o Schema, a projeção de Settings e o Importer inverso carregam explicitamente esse campo durante a migração, garantindo que uma ida e volta pela página de configurações não perca configuração; depois que o novo formulário editar diretamente a Personal/Effective Config, esse conjunto de campos de ponte é removido junto com o tipo antigo.

## 62. O alias main dos modelos do Registry vem da seleção padrão oficial do Environment

`listRegistryBackedModels()` já obtém o conjunto de modelos do novo Registry, mas ainda copiava o alias da Runtime Model Config antiga por `providerId/modelId`. Assim a mesma Registry View produzia uma exibição diferente dependendo de se sobrou Config antiga da CLI no processo, contrariando a fonte única da verdade.

O alias dos Registry Providers passa a ser calculado pela `configuredDefaultModelSelection` oficial: o modelo que corresponde à seleção padrão do Environment recebe `main`, e os demais modelos do Registry não têm alias. Um Provider inteiro que ainda não foi migrado para o Registry mantém a lista antiga e seus aliases como são, até que a compatibility source correspondente seja removida. O `lite` não é mais copiado da configuração antiga; ele já não faz parte do novo estado de seleção de modelos.

## 63. Turn e Workspace Model Source têm targets explicitamente próprios

O Worker Model Runtime mantém hoje três categorias de fonte: o Process Registry de longo prazo, a Execution Source do Turn corrente e a Workspace Compatibility Source ainda pendente de remoção. A Workspace Source usava, no passado, "workspace ou turn, qualquer overlay que casasse" para decidir se possuía um Model, mas a configuração que ela lê é apenas a do workspace overlay. A Turn Source mascarava essa inconsistência por ter prioridade mais alta, mas quando consultada isoladamente a fonte podia alegar que criaria um Model temporário que ela não possui de fato.

Esta fatia estreita o判断 de target da Workspace Source para os membros do próprio workspace overlay e renomeia o nome ambíguo `fallbackSource` do Model Runtime para `workspaceCompatibilitySource`. A prioridade das fontes permanece: o Model temporário do Turn vem antes do Registry, e o modelo de compatibilidade do Workspace só é usado quando o Registry está sem o Provider inteiro. A escrita por protocolo, a troca em tarefas ociosas e o antigo workspace snapshot ainda não foram removidos; desta vez se estabelece apenas a fronteira precisa que o M2.8 poderá retirar item a item.

## 64. O Account Access reaproveita o Overlay de Provider Config

A primeira tentativa de convergência trocou o `AccountProviderAccessEntry[]` paralelo por `AccountProviderOverlay[]`, mas ainda introduzia `{ id, allowedModelIds }` e `Provider.accountAccess`, sem realmente reutilizar o Overlay de Config já existente. Após a revisão humana confirmou-se que a Account Source deve emitir diretamente uma terceira camada esparsa `ProviderConfigMap`, usando a mesma estrutura de dados e o mesmo algoritmo de Overlay do Official e do Personal.

`AccountProviderConfig` ganhou `accessId`, e a camada de Account fornece o `accessId` e os `models` atuais por Overlay comum de campos; `allowedModelIds` e a filtragem por interseção de modelos deixam de existir. Os membros finais do Registry usam `Provider` / `ProviderModel`, e o ModelFactory fixa a identidade de requisição a partir de `Provider.config.accessId`.

O Registry é responsável apenas pelo Overlay da Config final e pela validação de integridade; ele não verifica se o `accessId` é realmente utilizável. Mesmo que o arquivo Personal seja escrito manualmente com uma identidade inválida, o Account Request Auth Service em tempo de requisição não conseguirá obter JWT, API Key ou Header a partir dele; a autenticação dinâmica continua sendo a fronteira final das permissões da conta. A primeira migração projeta o `ProviderConfigMap` de Account a partir do Snapshot antigo, e a próxima fatia substitui essa origem por uma fronteira de sincronização independente.

## 65. O Account Config usa um protocolo de sincronização próprio de nível de processo

O Worker deixa de extrair o Account Config por diferenciação inversa do snapshot de execução completo de `workspace/updateProviderRegistry`. A Account Provider Source mantida pelo Host envia objetos comuns `revision + ProviderConfigMap` por `provider/updateAccountConfig`; o Worker os analisa com o Schema oficial de `@zcode/provider`, recusa mistura de API Providers, substitui a `MutableAccountProviderConfigSource` de nível de processo e atualiza o Registry.

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

Um Worker novo sincroniza o Account Config atual antes de aplicar o Workspace Registry Snapshot, criar uma Session ou iniciar qualquer outra execução de modelos. O Host registra a revision já aplicada por Worker Client; a mesma revision não é reenviada. Uma mudança na Account Source é empurrada diretamente para todos os Workers locais ativos, sem precisar reconstruir o Workspace Snapshot. O remote anexado ao desktop mantém por enquanto a fronteira antiga e migrará separadamente no M2.8.

O protocolo transporta apenas campos de Config estáticos dos Account Providers, como `accessId` e `models`. JWT, API Key e Headers dinâmicos continuam sendo resolvidos pelo Account Request Auth Service a cada requisição; não há reutilização de Secrets entre a sincronização de Config estática e a autenticação em tempo de requisição. Quando o Worker não está montado com o Registry de processo, esse protocolo falha explicitamente e não devolve um `unchanged` falso; esse é o comportamento fail-closed escolhido nesta rodada, para expor o mais cedo possível uma divergência de montagem entre Host e Worker.

## 66. A execução local sai primeiro da Workspace Compatibility Source

O Workspace Registry Snapshot completo carrega ao mesmo tempo a projeção do antigo Workspace State e a origem de compatibilidade do ModelFactory. Apagar o protocolo diretamente mudaria de uma vez as quatro responsabilidades de exibição, valores padrão, remoto e execução, por isso o M2.8 corta primeiro o caminho alternativo de execução, que é o de maior risco.

O Worker local já possui o Registry de processo com as três camadas Official, Personal e Account. Ao criar um Model comum de longo prazo, ele só pode consultar esse Registry; o Workspace Catalog Overlay ainda pode participar por um curto período da projeção do antigo Workspace State e da lista de modelos, mas deixa de ser compilado no Registry de execução do AI SDK. A Turn Execution Source continua com a prioridade mais alta e segue atendendo o Provider temporário execution-scoped.

O remote anexado ao desktop ainda não concluiu a migração da própria Config/Registry remota. A Entry de protocolo injeta `registry-only` para o local e `legacy-snapshot` para o remoto conforme uma runtime surface explícita; a condição de compatibilidade não fica dentro do ModelFactory. A CLI/TUI Standalone ainda mantém por padrão a origem de compatibilidade, protegendo os Providers internos que ainda não migraram para a Config oficial, e sai conforme o progresso da própria migração.

## 67. O Local Host deixa de enviar o Workspace Registry Snapshot completo

O Worker local já lê de forma independente a Official Config e a Personal Config e recebe a terceira camada, o Account Config, por `provider/updateAccountConfig`. As entradas Session create/resume/read, Workspace read/generate, Conversation cold subscribe e V4 createSession não chamam mais `workspace/updateProviderRegistry`; elas apenas aguardam a barreira de revision do Account Config.

As mudanças de Provider Registry do Host continuam atendendo a duas responsabilidades locais: o portão de partida quando não há modelo configurado e a resolução/hot update do Runtime Model durante a migração. O evento de mudança não copia mais o conjunto completo de Providers para os Workers ativos. A antiga fila de sincronização, a marca de água generatedAt e o cache de revision por workspace são removidos junto com os escritores locais.

O protocolo `workspace/updateProviderRegistry` e o método explícito do Host são mantidos. O remote anexado ao desktop, o Bot Remote Workspace Bridge e a sincronização da UI remota ainda dependem deles; essas chamadas guardam o Snapshot aplicado como fato de compatibilidade para o Runtime Model remoto e para a autenticação de requisição. Essa fronteira remota será removida separadamente quando o próprio Registry remoto estiver montado.

## 68. O portão de drafts V4 sai do fallback do Snapshot antigo de Provider

O portão preliminar dos drafts V4 no Renderer já consegue obter do `ModelSelectionService` a View de modelos selecionáveis publicada pelo Registry. Como o `IServiceAccessor` de produção sempre fornece esse serviço, continuar usando o antigo `IModelProviderService.getProviderRegistrySnapshot()` como fallback opcional apenas faria os stubs de teste manterem uma segunda fonte da verdade.

O portão agora assina e lê apenas a `ModelSelectionView`. Uma exceção na leitura continua significando "o portão não consegue confirmar" e é entregue ao portão de partida do Host como proteção contra corrida; apenas uma View vazia significa que não há de fato modelo selecionável. Esta fatia não altera a exibição de erros, a persistência de drafts nem o comportamento do Workspace remoto.

## 69. A decisão de eco de modelo do ZCode Agent passa a ler a Selection View

O ramo ZCode Agent de `resolveModelSelectionForConfigOptions()` precisa decidir se o Provider apontado pela resposta atual ou pelo App Recent ainda é selecionável. Antes ele fazia essa decisão pelo snapshot global `ModelProviderConfig[]` do Renderer, mantendo a mesma semântica de seleção dependente do antigo Provider Service.

Esse ramo agora lê apenas a `ModelSelectionView` já hidratada e constrói a partir dela o conjunto de consulta de IDs de Provider. Enquanto a View não está hidratada, a escolha pendente do usuário é preservada; quando a View confirma que o Provider não existe, a resposta do Agent não é mais sobrescrita por uma preferência obsoleta. O serviço de decisão do supplier que não é ZCode Agent permanece inalterado.

## 70. Os campos de exibição do Provider saem do fallback do Snapshot antigo

O Toast de troca de modelo, a timeline de troca de modelo e a telemetria de envio já assinavam a `ModelSelectionView`, mas continuavam assinando também o antigo `ModelProviderConfig[]` e, quando a nova View não encontrava o Provider, complementavam label e baseURL a partir do Snapshot antigo. Depois que o Account Config entrou como terceira camada de Overlay no Registry oficial, esse fallback mantinha duas fontes da verdade para a exibição e a atribuição do mesmo Provider.

`resolveProviderLabel()` e `resolveProviderBaseURL()` agora leem apenas a `ModelSelectionView`. Quando a View ainda não está hidratada ou o Provider não existe, o label cai de forma estável para o providerId e o baseURL retorna `undefined`; depois que a View é publicada, a assinatura do React re-renderiza a exibição. Os três chamadores não assinam nem leem instantaneamente o Snapshot antigo de Provider. Esta fatia converge apenas a origem dos campos de exibição, sem alterar entitlement de Plan, edição de configurações ou execução de modelos.

## 71. Remover Options arbitrários de Model e Header de nível de modelo

Após a revisão humana da CLI antiga, das capacidades de configuração do Desktop e dos casos de avaliação internos, as extensões introduzidas em 58, 59 e 61 para compatibilidade sem perdas foram rejeitadas. Options arbitrários de `model.options` e Headers de nível de modelo não formaram um contrato oficial de produto; mantê-los contornaria as fronteiras fortemente tipadas de ModelOptionSpecs, ModelOptions e reasoningMapping.

Por isso o ModelConfig passa a manter apenas Properties, Option Specs e reasoningMapping. Os Headers estáticos do Provider continuam expressos por `ProviderConfig.headers`, e os Headers dinâmicos de conta continuam sendo fornecidos pelo Account Request Auth Service a cada requisição. O Importer antigo da CLI só normaliza `options.max_tokens` e `options.extra_body.max_tokens` para o `maxOutputTokens` oficial e não migra mais outros Options arbitrários nem Headers de nível de modelo. A ponte de salvamento da página antiga de configurações também deixa de manter esses dois campos privados que a interface não consegue expressar.

O documento Provider Config sobe para schemaVersion 3. A migração adjacente v2 -> v3 remove `ModelConfig.headers` e `ModelConfig.requestParameters`, mantendo o restante da configuração de Provider e Model como está. O Schema atual recusa diretamente esses dois campos, impedindo que voltem à cadeia de execução por meio de arquivos escritos manualmente.

## 72. O Repo Wiki usa a mesma fronteira de fatos do Registry em processo separado

Quando o M2 foi rebaseado no staging mais recente, a nova lane de Agent independente do Repo Wiki entrou em conflito de código com "o Local Host deixa de enviar o Workspace Registry Snapshot completo". A lane independente resolve o problema de o chat watchdog recolher requisições longas de Wiki e pertence ao isolamento de runtime que precisa ser preservado; o mapa de sincronização de Registry completo exclusivo da lane, por outro lado, pertence à antiga cadeia de fatos que o M2 já retirou.

Depois da mesclagem, o Repo Wiki continua usando um Process Manager, um Client e um ciclo de vida com dispose explícito, separados. Assim como um Worker local comum, ele lê por conta própria a Official Config e a Personal Config; o Host apenas estabelece a barreira de revision do Account Config antes da geração. Os testes cobrem separadamente o isolamento de requisições das duas lanes e confirmam que nenhuma delas chama novamente `workspace/updateProviderRegistry`.

## 73. O Repo Wiki local passa a ler os fatos estáticos de modelos da ModelSelectionView

As requisições de modelo do Repo Wiki já entram no Worker Model unificado, mas o Host, antes da geração, ainda resolvia provider, modelo, saída máxima e nível de reasoning pelo antigo `IModelProviderService.getProviderRegistrySnapshot()`, mantendo uma segunda fonte da verdade na configuração前置 da execução local.

O Local Host agora lê preferencialmente a View publicada pelo Registry por meio do `ModelSelectionService`. O adaptador de migração projeta apenas os campos estáticos de que o parser de Wiki existente precisa, sem carregar API Key, Secret de Account ou parâmetros de requisição Provider-native; a requisição real carrega somente o ModelRef, e o Worker Registry cria o Model. Quando o novo Provider Runtime já está montado, a Source antiga não é mais lida.

O parser de Wiki existente mantém por enquanto a forma de entrada `ZCodeProviderRegistrySnapshot` para limitar a superfície de impacto desta fatia. Entradas antigas sem Provider Runtime montado ainda podem recorrer à Source antiga, e o remote anexado ao desktop continua lendo o espelho do workspace. Essas duas fronteiras de compatibilidade serão removidas quando as Entries correspondentes e o Registry remoto forem migrados, e não podem se espalhar como fonte oficial de fatos local.

## 74. OpenAI Compatible sempre solicita Usage em streaming

Usage faz parte do resultado da execução de um modelo. O Adapter OpenAI-compatible agora passa fixamente `includeUsage: true` ao SDK subjacente, e a Provider Config, o Model Target, a projeção de execução do Registry e a ponte de migração das configurações não oferecem mais uma opção para desligar isso.

O documento Provider Config sobe para schemaVersion 4. A migração adjacente v3 -> v4 remove o `includeUsage` remanescente nos Providers; os Personal Importers antigos do Desktop e do Standalone ignoram esse campo. A interpretação de configuração antiga da CLI ainda consegue ler arquivos históricos que contêm o campo, mas não o leva para a nova Config nem para a cadeia de execução de Models. Serviços de compatibilidade que não suportam `stream_options.include_usage` não estão no suporte oficial e não há um caminho alternativo que remova o campo e tente de novo.

## 75. A decisão de entitlement de Account sai do grande objeto antigo de Provider

A decisão de entitlement de Start Plan, Coding Plan e Team Plan recebia diretamente o antigo `ModelProviderConfig`. Esse tipo carrega endpoint, models, vestígios de Catalog e estado de configuração ao mesmo tempo, o que fazia a lógica de conta parecer dependente de todo o conjunto de fatos antigos do Provider e bloqueava a Account Source de produzir de forma independente a terceira camada `ProviderConfigMap`.

A entrada da decisão de entitlement foi estreitada para `providerId`, entrada de autenticação opcional, estado de habilitação e motivo de desativação pelo sistema; o contexto de conexão de conta continua sendo fornecido por um Context separado. O antigo `ModelProviderService` faz a adaptação uma única vez dentro de sua própria fronteira de compatibilidade, e o módulo de entitlement não lê mais modelos, endpoint ou configuração de Adapter. A exclusividade mútua entre Start/Coding, a validação do Team Plan, os motivos de desconexão e a semântica de conectividade da página de configurações permanecem iguais.

Esta fatia apenas organiza a entrada de domínio dos Account Providers. A renovação de entitlement, o cache e a produção direta do `ProviderConfigMap` de Account ainda serão extraídos do antigo `ModelProviderService` por fatias posteriores; aqui não foi adicionado um segundo conjunto de estado de Account.

## 76. O Provider Runtime passa a aceitar explicitamente o Config Runtime

O `ProviderRuntime` criava o `ProviderConfigRuntime` internamente no construtor. Isso fazia com que o Config Service só pudesse ser obtido depois de o Registry ser construído, e o真正的 Account Provider Service não conseguia depender do mesmo estado de Official/Personal Config, lendo arquivos por desvio ou continuando projetando ao contrário do Snapshot antigo do Registry.

Agora a raiz de composição cria primeiro o `ProviderConfigRuntime` e o entrega explicitamente ao `ProviderRuntime`. O `createProviderRuntime(options)` existente é mantido como entrada de conveniência para o Standalone; o Host usa `createProviderRuntimeFromConfigRuntime()` para expressar a ordem oficial de montagem. O `ProviderRuntime` assume o ciclo de vida da instância injetada, de modo que a barreira de prontidão dos Facades, o watcher de Config e a semântica de dispose permanecem iguais.

Esta fatia não mudou o conteúdo da Account Source, e a produção ainda usa temporariamente o adaptador do Snapshot antigo. Ela estabelece a dependência unidirecional necessária para criar diretamente o Account Provider Service: o Account Service pode ler o mesmo Config Service e então entregar a Account Config Source ao Registry.

## 77. O Account Provider Service é uma terceira camada de Config Source sem IO

`@zcode/provider` ganhou o `AccountProviderService`. Ele lê a mesma Config Source do Registry, faz primeiro o Overlay das Official e Personal Provider Configs e então entrega a View de Config atual ao Account Resolver injetado. O Resolver devolve apenas o `ProviderConfigMap` de Account; arquivos, rede, OAuth, planos e interfaces de equipe permanecem nas implementações periféricas.

O primeiro `read()` do Service é a barreira de prontidão. Mudanças na Config Source disparam um recálculo em segundo plano, e eventos de conta podem chamar `refresh()` explicitamente; resultados bem-sucedidos geram uma revision estável por conteúdo e o Registry só é notificado quando o Account Config realmente muda. Uma falha na atualização reporta erro e mantém o Snapshot last-known-good; a primeira falha de atualização falha diretamente, sem disfarçar uma exceção de rede como "não há Account Provider no momento".

Esta fatia estabelece o serviço de domínio e seus testes, mas ainda não trocou o Host de produção do `LegacyAccountProviderConfigSource`. A próxima fatia precisa implementar as consultas existentes de Start/Coding/Team como um Account Resolver e fazer o novo raiz de composição injetar o Service diretamente no Registry.

## 78. O Account Connection Result mantém um estado determinado por Provider

As interfaces remotas de Account nem sempre têm sucesso ao mesmo tempo: o `billing/balance` do Start Plan, o `subscription/list` do Personal Coding Plan e a interface de projetos do Team Plan podem retornar available, unavailable ou unknown independentemente. Tratar qualquer unknown como falha de toda a Source descarta resultados já determinados na mesma rodada; tratar unknown como unavailable, por outro lado, remove modelos ainda válidos por causa de uma oscilação de rede.

`@zcode/provider` agora oferece uma interpretação unificada de Connection Result. available gera o Overlay `accessId/models` e, quando não devolve um conjunto de modelos exclusivo, mantém a ordem de modelos da Config atual; unavailable remove explicitamente o Provider; unknown mantém o último Account Config bem-sucedido daquele Provider. Quando ainda não há valor anterior, itens unknown não são publicados por enquanto; quando todos os candidatos são unknown e não existe estado anterior, um erro explícito é lançado e tratado pela fronteira de primeira falha do AccountProviderService.

A interpretação gera resultados na ordem dos Account Providers da Config e recusa conexões duplicadas, Providers não configurados, API Providers, accessId vazio e conjuntos de modelos vazios. `createAccountProviderConfigResolver()` já conecta o Connection Resolver remoto à interface de Config Resolver do AccountProviderService; o próximo passo para o código de produção é apenas fornecer os Connection Results reais.

## 79. Os Services adaptam o estado de produto atual do Plan como Connection Result

Foi adicionado o `accountProviderConnectionResolver` como fronteira de transição entre os Services e o domínio puro de Provider. Ele lê o domínio de conta atual, o modo de conexão por API Key / OAuth da Family, a seleção Personal/Team e chama as validações de entitlement Start/Coding existentes do Z.ai / BigModel; para fora produz apenas `available / unavailable / unknown` ordenados por Provider.

Domínios de conta que não são o atual e o modo explícito de conexão por API Key são interpretados como `unavailable` determinado, sem consultar as interfaces de Plan. O Coding Plan usa a key completa como accessId quando há uma Team connection key válida selecionada, e um accessId Personal estável caso contrário; o Start Plan usa um accessId Start estável. Quando um Provider não recebe conclusão do remoto, o resultado permanece `unknown` e é entregue à regra de last-known-good por Provider da interpretação de domínio.

A origem da Personal Coding Plan Key no adaptador é uma porta de injeção estreita, e esta fatia não amarra o armazenamento antigo `ModelProviderConfig` ao novo domínio. Antes da troca da raiz de composição de produção, ainda é preciso convergir a propriedade física dessa Key para a fronteira de credenciais, preservando o comportamento autoritativo do conjunto de modelos remoto do Start Plan.

## 80. A entitlement e a associação de modelos do Start Plan compartilham a resposta de balance

O Start Plan tinha dois consumidores: a validação de entitlement lia apenas `plans`, e a construção do Preset lia separadamente `balances.capabilities` para gerar a lista de modelos. O novo Account Connection Result precisa expressar os dois ao mesmo tempo, caso contrário a troca da Source degradaria para o conjunto estático de modelos do arquivo Official.

`CodingPlanAvailabilityResult.available` agora carrega opcionalmente `models`. A availability do Start Plan valida o plano ativo e extrai os membros de modelo deduplicados na mesma resposta de `billing/balance`; o Connection Resolver dos Services repassa essa lista para a camada de domínio, de modo que o Account Config consiga sobrescrever os `models` do Official.

## 80. O Local Host sai primeiro do Snapshot antigo do Account Registry

O Account Access já foi convergido para uma terceira camada `ProviderConfigMap`, e por isso o Local Host de produção monta diretamente o `AccountProviderService + Account Connection Resolver`. O Resolver lê a mesma Official/Personal Config, o domínio de conta atual, o modo de Family, a conexão Personal/Team selecionada e as interfaces de entitlement existentes, e saída `available / unavailable / unknown`; o Service de domínio forma então o Account Config com `accessId/models`.

Por enquanto as mudanças de estado de conta reutilizam o change event do antigo ModelProviderService como sinal de invalidação, mas o evento serve apenas para disparar `AccountProviderService.refresh()`. O resultado da atualização não lê o antigo `ZCodeProviderRegistrySnapshot`, e portanto o Snapshot antigo deixa de ser a fonte da verdade dos Account Providers ou da associação de modelos no Local Host. O `desktop-attached-remote` mantém a Source de compatibilidade original e aguarda a fatia remota do M2.8.

A migração física da Personal Coding Plan API Key não foi incluída nesta fatia: o Connection Resolver e o Request Auth ainda podem lê-la do antigo Provider Store, mas apenas como entrada de credencial de compatibilidade. Depois que a próxima fatia mover essa Key para o Credential Service e remover a leitura antiga, as duas cadeias — de fatos estáticos de Account e de credenciais de requisição — estarão completamente livres do antigo Provider Store.

## 81. A Personal Coding Plan Key entra no Credential Service por accessId

A Key copiada do Personal Coding Plan é uma credencial de requisição, não uma Provider Config. O novo `AccountProviderCredentialStore` forma a chave de credencial usando o `accessId` já fixado no Model; a decisão de entitlement do Connection Resolver e o Request Auth de cada attempt leem do mesmo Store. Depois de uma atualização explícita do Coding Plan que obtém uma nova Key, o valor é gravado no Store, e logout / unlink a removem pela entrada de limpeza original.

Para compatibilidade com os usuários já instalados, o Store pode chamar uma vez um Provider Key Loader antigo injetado quando a nova chave está ausente. Depois de ler um valor antigo não vazio, ele primeiro grava no Credential Service e só então devolve o valor ao chamador; quando já existe um valor novo, o Store antigo não é acessado, e um valor antigo vazio não cria registro de credencial. Essa é uma migração unidirecional e não forma uma cadeia de prioridade `new > old` de longo prazo.

O antigo `ModelProviderService` ainda mantém durante a migração a Key sombra no arquivo de Providers para os consumidores antigos ainda não migrados; o novo Connection Resolver e o Request Auth já não a tratam como autoritativa. Remover esse campo sombra pertence à fatia posterior de "eliminar consumidores do antigo Provider Store", quando ele poderá ser removido junto com a escrita antiga.

## 82. A decisão de preferência de modelo do Workspace passa a usar a Model Selection View

O eco de configuração de workspace para Agentes que não são ZCode Agent era enviado pelo Renderer ao Host como o antigo `ModelProviderConfig[]`. O Resolver portanto reexaminava `enabled`, `apiKey`, endpoint e o array de modelos, formando um segundo conjunto de decisões de selecionabilidade fora do Registry.

Agora o Renderer usa, para todos os tipos de Agente, a `ModelSelectionView` de nível de processo como fato candidato. O Resolver consome diretamente a Provider View dela; o Registry já é responsável pelos filtros de integridade, credenciais, estado de habilitação e validade dos modelos, e o Resolver mantém apenas o seu trabalho: ler a configuração de workspace, comparar providerId com o baseURL normalizado, validar que o modelo pertence a esse Provider e produzir, conforme as regras originais, um resultado ghost ou já correspondido.

Esta migração não alterou o comportamento de draft, session, last-selected ou de submissão, nem a fronteira de entrega entre desktop continuous e web remote replayable. O mapa de impacto funcional já tinha a relação `model selection -> provider registry -> conversation/model surfaces`; esta fatia não criou um novo nó semântico de produto.

## 83. Os candidatos de `/model` do Bot local passam a usar o Model Selection Service

Dentro do Bot há dois tipos de dados de modelo com nomes parecidos, mas pertencimentos diferentes. Os candidatos de primeiro nível Provider/Model são a projeção Registry global do App, enquanto o `configOptions` de workspace é o valor atual e o catálogo de capacidades de um runtime de Agent. O primeiro precisa ser unificado; o segundo precisa continuar sendo cacheado de forma independente por `workspaceKey`.

O Local Host agora injeta no Bots Service o `ModelSelectionService` do mesmo processo. O `/model` lê preferencialmente desse serviço a ordem dos Providers, os labels e os modelos selecionáveis; uma lista vazia retornada com sucesso também é considerada um estado vazio autoritativo, e só uma leitura com falha recorre à última projeção em memória bem-sucedida. O Bot deixa de ler o Snapshot antigo completo do Registry nesse caminho local principal. O cache persistente de configOptions de workspace, o modelo atual e a cadeia de comandos de escrita no runtime não mudaram.

O remote anexado ao desktop ainda não está montado com a nova Source de Registry oficial e continua usando o ramo de compatibilidade do Snapshot antigo, aguardando a saída junto com a fronteira autoritativa de Provider remota no M2.8. Esse ramo de compatibilidade não participa da decisão de candidatos de modelo do Local Host.

## 84. O Provider label do `/status` do Bot local passa a usar o Model Selection Service

O texto de status do Bot, ao resolver `providerId/modelId` ou um valor de custom model, chamava novamente o antigo `ModelProviderService.getAll()` para consultar o nome do Provider. Isso fazia com que o `/model` já usasse o novo Registry e o `/status` exibido logo em seguida ainda pudesse mostrar um label vindo de outra Config antiga.

Com o Model Selection Service injetado pelo Local Host, o Bot agora obtém com a mesma Selection View tanto os candidatos do `/model` quanto os labels do `/status`. Uma View vazia lida com sucesso também é um resultado autoritativo; quando a leitura falha, usa-se a última projeção de Selection bem-sucedida daquele processo do Bot. Apenas o caminho de compatibilidade do remote anexado ao desktop, que ainda não está montado com o novo serviço, continua lendo a Provider Config antiga. Nada foi alterado nesta etapa na migração de estado antigo do Bot na inicialização, no configOptions de workspace ou na sincronização do Registry remoto.

## 85. A restauração de custom provider do V4 remove o fallback para a Config antiga

Ao restaurar, no cenário de erro de configOptions, um custom model value do V4 que contém apenas providerId, o código já escolhia o primeiro modelo daquele Provider a partir da Model Selection View em memória do Renderer; quando a View ainda não estava pronta ou não continha o Provider, o código antigo ainda chamava `ModelProviderService.getAllCached()` para consultar a Config antiga mais uma vez. Isso permitia que um "atualmente não selecionável" dado explicitamente pelo Registry fosse sobrescrito pelo Snapshot antigo.

A entrada de restauração agora aceita apenas o resultado de `resolveFirstSelectableModelId()`. Uma View não hidratada devolve `undefined` e um Provider inexistente devolve `null`; os dois interrompem a restauração e mantêm o aviso existente, sem voltar à Provider Config antiga para adivinhar um modelo. Nada mudou em restart de workspace, prepare, aviso de troca de modelo ou no timing de confirmação de preferência. Testes de fronteira de código fixam que o SessionPane não chama mais diretamente `modelProviderService.getAllCached()`.

## 86. A troca de modelo do Bot local deixa de enviar o Snapshot completo do Registry

Quando o Bot escolhe um custom model para uma tarefa ativa, a cadeia antiga chamava primeiro `applyToProvider()`, depois lia e enviava ao Agente o Snapshot completo do Registry e, por fim, chamava `setModel(modelRef)`. O Worker local oficial já tem um Registry de nível de processo e constrói Models a partir das mesmas Configs Official, Personal e Account que o Host; os dois primeiros passos fariam o antigo `ModelProviderConfig` participar de novo da decisão de execução local.

Quando o Local Host já está montado com o Model Selection Service, o Bot agora entrega `{ providerId, modelId }` diretamente ao Task Service, e o Worker consulta o próprio Registry mais recente na próxima criação de Model. O remote anexado ao desktop ainda não tem Config/Registry próprios e, portanto, quando a task traz `workspaceIdentity`, continua executando `applyToProvider + updateProviderRegistry`; entradas antigas sem o novo Selection Service também mantêm a cadeia de compatibilidade original. Testes direcionados fixam separadamente o comportamento local de "não enviar Snapshot" e o remoto de "continuar sincronizando".

## 87. A sincronização de Snapshot após salvar configurações só mantém targets remotos

Depois que a página de configurações salva um Provider, ela coletava todos os workspaces abertos e chamava `workspace/updateProviderRegistry` para atualizar o catálogo antigo em memória dos Agentes. Anteriormente a lista de targets incluía tanto abas locais quanto remotas, de modo que, mesmo com o Worker local já tendo atualizado o Registry de processo pelo watcher de arquivos, o Renderer ainda reenviava o Snapshot completo antigo e sobrescrevia os configOptions locais com a resposta.

O resolver de targets agora devolve apenas workspaces remotos que resolvem para um `remoteSessionId` e vincula a cada target o Remote Session Service correspondente. Abas locais são puladas diretamente; a seleção local de modelos é atualizada pela Model Selection View do Host e a execução pelo Registry do Worker. Desconexão remota, identidade diferente no mesmo caminho e as regras de deduplicação por session permanecem iguais. A interface correspondente removeu o parâmetro `baseZCodeSessionService`, que não tinha mais uso, e os testes fixam que abas locais não entram na lista de sincronização.

## 88. A decisão de leitura do login por API Key do Welcome passa para a nova View

Isso fazia com que a escrita da mesma submissão fosse autoritativa na nova Config, mas a entrada e o valor padrão continuassem influenciados pelo Snapshot antigo.

No novo Host, o formulário agora projeta o API Provider alvo a partir da Provider Settings View; depois de concluir a escrita Personal e o Registry refresh, obtém da Model Selection View o primeiro modelo selecionável daquele Provider e grava-o como seleção recente do App. Assim, a falta de API Key que torna o Provider não selecionável antes de salvar não afeta a entrada de configurações, e o valor padrão depois de salvar aponta apenas para um modelo atualmente selecionável no Registry. O antigo `ModelProviderConfig` continua sendo construído pela projeção de compatibilidade e gravado no serviço antigo, para os consumidores de conta/configurações ainda não migrados; as entradas antigas sem o Provider Settings Service montado mantêm o caminho de leitura original.

O mesmo recorte também aperta a fronteira de persistência da API Key: quando o Provider Settings Service já está montado, uma falha de leitura, um Provider alvo ausente ou um tipo que não seja API são reportados como erro direto ao chamador, sem leitura ou escrita silenciosa no serviço antigo. Apenas as entradas antigas sem o serviço montado usam o caminho antigo. Depois que a escrita na nova Personal Config tem sucesso, uma falha na escrita do espelho antigo ainda gera apenas um aviso de compatibilidade e não desfaz a escrita autoritativa.

Os testes de regressão também confirmaram uma semântica de compatibilidade existente: o balance pode devolver apenas o plano ativo, sem o detalhamento de modelos em balances. Isso continua sendo um available determinado, sem `models` no Connection Result, e a interpretação de domínio mantém os membros da Official/Personal Config. Interpretar a falta de detalhamento como ausência de entitlement faria regredir todos os testes existentes de recuperação do Start Plan, de conectividade e de cache de entrada, portanto isso não foi adotado.

## 89. A nova Settings View sai da leitura do display-order antigo

A ordem Effective dos Providers já é produzida pelo Overlay ordenado de Official e Personal, e `ProviderSettingsView.providers` é o fato de ordenação da página de configurações e da de seleção. Com o novo Settings Service montado, `useModelProviders` não chama mais o antigo `getDisplayOrder()` e também não deixa mais uma Preference independente interferir na ordenação Effective dos Providers. A escrita após o arraste chama somente o Settings Facade para reordenar o Personal Overlay e não grava mais o espelho antigo `saveDisplayOrder()`.

Entradas antigas sem o Provider Settings Service continuam usando o par antigo `getDisplayOrder()/saveDisplayOrder()` e, portanto, mantêm o comportamento de compatibilidade. As fontes da verdade do novo Host e das entradas antigas não se cruzam mais; quando o suporte às entradas antigas for removido, o Preference Store e os métodos do serviço antigo poderão ser apagados diretamente.

## 90. A migração de inicialização do Bot local sai do cache antigo de Provider Config

A migração do estado v2 do Bot só precisa verificar se um determinado `providerId/modelId` ainda existe e se o model ID pode ser mapeado de forma única para um novo Provider. Por isso o algoritmo de migração lia um `ModelProviderConfig[]` inteiro, fazendo com que o Bot local, mesmo já montado com o Model Selection Service, ainda chamasse o antigo `getAll()` na inicialização.

A entrada de migração agora é estreitada para `{ providerId, modelIds }`. O novo Host constrói esse índice a partir da Model Selection View, e somente as entradas antigas projetam a Provider Config antiga no mesmo formato. Ao mesmo tempo, um Bot com o Selection Service montado não agenda mais o pré-aquecimento do cache antigo de Provider Config; `/model`, `/status` e a migração de inicialização passam a usar a mesma verdade de modelos selecionáveis. O cache de configOptions de workspace e os caminhos de compatibilidade remotos e de entradas antigas mantêm a semântica original.

## 91. O watcher da Personal Config deduplica por versão de conteúdo

O Personal Repository salva a configuração com substituição atômica de arquivo. Uma única escrita dentro do processo pode gerar vários eventos `rename/change` no nível do sistema de arquivos, e a implementação antiga publicava primeiro `updated` e depois repetia a publicação de `file-changed` para cada evento de watcher. Isso fazia a mesma configuração disparar repetidamente a interpretação do Registry, e a Account Source ainda podia repetir consultas de entitlement.

O Repository agora registra a última content revision conhecida. Uma escrita explícita registra a nova revision antes de liberar o bloqueio de arquivo; ao receber um evento, o watcher relê e normaliza a configuração dentro do mesmo bloqueio de arquivo e só publica `file-changed` quando a revision realmente muda. Vários eventos de escrita atômica convergem assim de forma natural, e novo conteúdo vindo de edição externa continua sendo notificado imediatamente. Não foi introduzida nenhuma janela de tempo ou debounce; a semântica de notificação depende apenas de o conteúdo da configuração ter mudado.

## 92. A migração do Provider Family Domain passa a ler a Model Selection View

A migração única de `providerFamilyDomain` na inicialização precisa decidir, quando não há antigo OAuth active provider, se existe apenas uma Family Z.ai / BigModel selecionável. A implementação antiga lia `ModelProviderConfig[]` e refazia uma decisão de usabilidade com API Key, enabled e endpoint; isso fazia o resultado da migração divergir dos fatos de seleção do novo Registry.

A migração agora lê diretamente a Model Selection View. Os Providers da View já passaram pela resolução de Config, Account Access, integridade de modelos e selecionabilidade feita pelo Registry, e a migração apenas mapeia o `providerId` para a Family e, quando há uma única Family, grava a configuração histórica. Uma View vazia continua significando que os fatos de inicialização ainda não foram recuperados, e esta rodada não marca a migração como concluída; a prioridade original do OAuth active provider e o timing da escrita de configurações não mudaram.

## 93. O watcher da Official Config também publica mudanças por versão de conteúdo

A Official Config será publicada futuramente por um serviço de gerenciamento em um arquivo local, mas a Source do Node ainda enfrenta eventos de substituição de arquivo. A implementação antiga apenas encaminhava eventos de watcher por nome de arquivo: a republicação do mesmo conteúdo também atualizava o Registry, e uma substituição atômica que gerasse vários eventos ainda podia repetir leitura e interpretação.

A Official Source usa agora a mesma semântica externa do Personal Repository: a primeira leitura memoriza a content revision atual e os eventos de watcher seguintes leem serialmente o documento completo mais recente, publicando uma única vez `file-changed` apenas quando a revision muda. Gravações repetidas do mesmo documento Official não produzem notificação de invalidação; uma versão realmente nova ainda entra no Registry automaticamente pelo watcher. Esta convergência não altera a migração de versões, a ordem de sobreposição nem a fronteira de tratamento de erros do arquivo Official.

## 94. A decisão de preservar a Family no logout passa a ler a Model Selection View

O logout global do App e o desvinculamento de Plan na página de configurações precisam decidir, antes de sair do OAuth, se a Family atual ainda tem o modo de API Key para continuar em uso. A implementação antiga lia o `ModelProviderConfig[]` completo e verificava apenas a string de Key do API Provider embutido; assim, o fato de selecionabilidade de Account Providers e API Providers era mais uma vez interpretado pelo serviço antigo.

Agora as duas entradas leem a Model Selection View mais recente depois da confirmação do usuário. O `providerFamilyDomain` só é preservado quando o API Provider embutido da Family atual aparece na View com `kind: api`, e é limpo quando só há Account Providers como Coding/Start/Team. A leitura da Selection View fica dentro dos handlers de evento, sem adicionar nova assinatura de componente ou dependência de renderização. O timing de logout OAuth, de limpeza do WebView, de escrita de configurações e de relançamento do App permanece igual.

## 95. A Family Selection remove a leitura antiga de Provider Config que não participava da decisão

Após o login OAuth e na recuperação de inicialização, a Family Selection escolhe a conexão seguindo a prioridade já definida entre Personal Coding Plan, Team Plan, Start Plan e fallback OAuth. A entrada dos dois resolvers incluía antes o `ModelProviderConfig[]` completo, e por isso cada ponto de chamada executava um `getAllCached()`; o algoritmo real nunca lia esse parâmetro, e a Provider Config não influenciava a prioridade nem participava da geração do selectedKey.

Esta rodada removeu o parâmetro não utilizado e as duas leituras de Config antiga. A seleção após o login depende apenas do entitlement atual e dos Team Products; a recuperação de inicialização também lê as configurações atuais, para proteger um Team selectedKey ainda válido ou cuja invalidade não pôde ser confirmada. A prioridade de planos pessoal, de equipe e Start Plan, a renovação da Coding Plan Key e o timing de escrita de configurações permanecem iguais. Testes de fronteira fazem a leitura antiga falhar e confirmam que a recuperação de inicialização ainda completa, evitando que essa dependência auxiliar seja reintroduzida.

## 96. O item de Provider do Settings Sync sai da atualização pelo Snapshot antigo

A Category pública do Settings Sync ainda contém `providers`, e o Onboarding também constrói esse item de exibição; o Service atual não tem Provider Discovery nem carga de dados de Provider e, ao receber essa Category, retorna explicitamente `skipped`. A UI chamava o antigo `ModelProviderService.getAll()` depois desse resultado e sobrescrevia o Snapshot global de Providers, sem ter importado configuração alguma e ainda acionando a sincronização remota antiga de Providers e a publicação de fatos.

Esta rodada removeu a dependência de `useSettingsSync` em relação ao antigo ModelProviderService e ao Snapshot Store, e fixou o estado atual com testes em duas camadas: a Category de Provider do Service continua retornando explicitamente `skipped`, e o Hook de UI não pode tocar na antiga fonte da verdade de Provider por causa do item de placeholder. Quando for implementada uma verdadeira importação de Providers entre Agentes, será preciso definir uma carga explícita de Provider Config para os dados selecionados, gravá-la na Personal Config e deixar o Registry publicá-la normalmente, em vez de restaurar a atualização pelo Snapshot antigo.

## 97. O portão de Provider na inicialização do novo Host passa a usar a Model Selection View

O Root já conectava o Model Selection Service na inicialização do processo, mas o portão de disponibilidade de Provider continuava esperando a hidratação do Snapshot antigo de Model Provider e decidia de novo "se está disponível" a partir de API Key, endpoint, enabled e do array de modelos. Isso permitia que o Registry e o Snapshot antigo dessem conclusões diferentes e que, mesmo com o novo Registry pronto, a inicialização ainda fosse bloqueada pela sincronização remota antiga.

O portão de inicialização agora escolhe uma única fonte conforme a capacidade da Entry: o novo Host, que tem o Model Selection Service montado, lê apenas a Model Selection View; as entradas antigas sem esse serviço continuam usando o Legacy Snapshot. Como a própria Registry View contém apenas os Providers/Models atualmente selecionáveis, o portão só precisa verificar se existe pelo menos um modelo. Quando o Registry confirma uma View vazia, não há retorno ao Provider antigo; quando o Registry ainda não está hidratado, o Snapshot antigo já hidratado também não é usado para liberar a inicialização antecipadamente. O log passa a incluir `source: registry | legacy`,便于 confirmar a fronteira efetiva.

Se o carregamento da Model Selection View falhar no novo Host, o Selection Snapshot permanece não hidratado e o portão de inicialização não passa a ler o Snapshot antigo. Nesse caso, a aplicação continua no estado de espera de Provider na inicialização e registra um error; mais adiante pode ser adicionada uma interface de falha de carregamento do Registry voltada ao usuário, mas a antiga fonte da verdade não pode ser usada como caminho de recuperação.

O mesmo recorte também aperta o comportamento de atualização após o login por API Key. Quando o novo Host salva uma API Key, o Provider Settings Facade grava a Personal Config, atualiza o Registry e publica uma nova Selection View por assinatura; o formulário não chama mais o antigo `getAll()` por conta própria. Somente as entradas antigas sem o Provider Settings Service continuam atualizando ativamente o Legacy Snapshot. A escrita do espelho antigo de Provider é mantida por enquanto para os consumidores de compatibilidade ainda não migrados, mas deixa de participar da decisão de inicialização do novo Host.

## 98. Remover a sincronização reversa de estado estável do Provider Store antigo para a Personal Config

No início da migração, para trocar de write入口 o mais rápido possível, o antigo `ModelProviderService.save/delete()` podia reimportar toda a lista antiga de Providers na Personal Config por meio de `onUserProviderConfigChanged`. A nova entrada de Settings já está estável na ordem oposta: escreve primeiro a Personal Config pelo Provider Settings Facade e depois tenta atualizar o espelho no Store antigo. Manter o callback reverso faria o espelho de compatibilidade voltar a ser entrada da nova fonte da verdade, e uma modificação局部 dispararia a sobrescrita de toda a tabela.

Esta rodada removeu `onUserProviderConfigChanged`, a flag `syncPersonalConfig` e `ProviderRuntime.syncLegacyPersonalProviders()`. O salvamento e a exclusão do antigo `ModelProviderService` agora mantêm apenas o Store antigo; no novo Host, a Personal Config só é escrita pelo Provider Settings/Config Service. As entradas antigas sem o novo Settings Service mantêm o comportamento original do Store antigo, sem afetar o novo Registry.

A primeira migração continua existindo em `NodePersonalProviderConfigRepository`: `importLegacy` só é chamado quando o arquivo de Personal Config não existe, e, depois de gravar o documento versionado, os reinícios seguintes do processo leem diretamente esse arquivo. Um novo teste de reinício verifica explicitamente que, quando já existe Personal Config, o Store antigo de Providers não é lido novamente. Isso forma o seguinte timing unidirecional:

```text
首次启动且 Personal Config 不存在
旧 Provider Store -> importLegacy -> Personal Config

正常运行
Settings -> Personal Config -> Registry
        `-> 旧 Provider Store（兼容镜像，失败不回滚新事实）
```

## 99. O menu de modelos do Account Provider não decide mais a conexão em duplicidade

A Account Source já escolheu a conexão executável atual com base na conta, no entitlement e nas configurações de Family, e entregou o `accessId` fixo e o conjunto de modelos ao Registry. O menu de modelos, porém, ainda escolhia Start, Individual ou Team por meio dos dados antigos de Provider Family e por isso podia chegar a um resultado diferente do Registry.

O novo Host agora projeta diretamente o Registry Account Provider como grupo de modelos. A projeção antiga do mesmo Provider ID é excluída, e o `accessId` serve apenas para exibir a insígnia Start, Individual ou Team, sem participar da escolha de conexão. O antigo Family Builder atende apenas o caminho de compatibilidade das entradas antigas que ainda não entraram no Registry.

```text
Account settings + entitlement
              |
              v
Account Config -> Registry Account Provider -> Renderer model group
                                                `-> accessId 只生成徽标
```

## 100. A Settings View publica diretamente a conclusão de selecionabilidade do Provider

A projeção de migração da página de configurações precisa mapear o Account Provider de volta para o antigo `ModelProviderConfig`, mas `enabled` só indica a chave de configuração e não responde se o Provider já passou pela validação de integridade e entrou no Registry. Esta rodada adiciona `selectable` à `ProviderSettingsView`, produzido diretamente pela relação de membro do Registry no mesmo resultado do Resolver, evitando que o Renderer reimplemente a decisão de usabilidade.

O nome, o Endpoint, os Headers, as Properties de modelo e os Option Specs do Account Provider agora são todos projetados pela Settings View. O objeto antigo fornece temporariamente apenas o `apiKey` de runtime que Usage/Plan ainda lê e o motivo detalhado de desativação quando o Provider não é selecionável; os campos estáticos antigos e o estado antigo de enabled não sobrescrevem mais a conclusão do Registry. Official Account Providers sem objeto antigo também aparecem normalmente na projeção de configurações.

## 101. Os níveis de pensamento do modelo passam a ler os Option Specs do Registry

Composer, Automation, Subagent e Repo Wiki liam antes os níveis de pensamento do antigo `ModelProviderConfig.reasoning` e, quando o metadata estava ausente, ainda completavam um conjunto fixo de níveis com base no nome do modelo GLM-5.2. A Official Config já expressa o mesmo fato por `ModelConfig.optionSpecs.reasoningLevel`, e continuar lendo o campo antigo faz com que a seleção de modelos e o Model efetivamente usado tenham definições de nível diferentes.

O Renderer agora usa em comum `resolveModelThoughtOption()`: quando existe a `ModelSelectionView`, os Option Specs são lidos do Registry apenas por `providerId/modelId`; quando o modelo não está na View ou não tem `reasoningLevel`, nenhum nível de pensamento é retornado, sem completar valores a partir do metadata antigo ou do nome do modelo. Somente as entradas de compatibilidade sem a nova Selection View montada usam o parser antigo. Quando o Workspace já devolve o diretório de runtime, Subagent e Repo Wiki continuam priorizando a projeção de diretório daquele Workspace; o Registry é responsável pelo fallback sem diretório e pelos fatos estáticos de modelo no estado de draft.

Esta fatia converge apenas a leitura da UI sobre os Option Specs estáticos do modelo e não modifica como o Adapter converte o reasoning level em parâmetros de requisição do Provider. Tarefas ociosas carregam um Provider temporário execution-scoped que hoje não entra no Registry de nível de processo e portanto continua usando sua própria resolução de configuração de modelo temporário; isso será unificado na etapa de Provider execution-scoped.

## 102. O menu de modelos deixa de completar com o Snapshot antigo por lacuna de Provider

O agregador do menu de modelos projetava antes a `ModelSelectionView` e depois acrescentava ao final os itens do antigo `ModelProviderConfig[]` que não tinham um Registry Provider de mesmo nome. Essa compatibilidade por dedupe de ID de Provider contornava a decisão do Registry: Providers com configuração incompleta, desabilitados explicitamente ou indisponíveis por conta já excluídos pelo Registry voltavam a aparecer no menu de modelos só porque "não estavam na nova View".

A fronteira de agregação agora é uma troca no nível da Entry. Depois que o chamador entrega a `ModelSelectionView`, o menu projeta apenas essa View; `providers: []` significa que o Registry confirmou que não há candidatos e não dispara retorno à lista antiga. Somente as entradas de compatibilidade que ainda não obtiveram a View continuam usando o construtor de menu antigo completo. A mudança vale uniformemente para Composer, Automation, Subagent e Repo Wiki e não alterou os algoritmos de Family, Team Plan ou ordem de exibição das entradas antigas.

## 103. A página de configurações do Subagent deixa de assinar o Snapshot antigo de Provider

A página de configurações do Subagent já obtinha a `ModelSelectionView` de nível de processo, mas ainda chamava `useModelProviders()` sem condição e entregava Provider antigo, ordem de exibição antiga e Family Mode antigo ao construtor de menu híbrido. Depois que a seção 102 estreitou a fronteira de agregação, esses dados já não afetam o resultado quando a View está hidratada, mas o Hook antigo ainda dispara `getAllCached()` e um `getAll()` em segundo plano, fazendo com que abrir a página de configurações continuasse lendo e atualizando a segunda fonte da verdade.

A página agora chama diretamente `buildRegistryModelSelectGroups()`. Enquanto a View não é publicada, o controle de modelo permanece em loading e não exibe candidatos antecipadamente pela lista antiga; depois que a View é publicada, os candidatos de modelo, o agrupamento por Provider e os Option Specs de reasoning sem Workspace vêm da mesma revision. O diretório de runtime no escopo do Workspace continua responsável pela projeção de reasoning daquele Workspace, e o protocolo de salvamento e ativação do Subagent não mudou. Os testes de componente afirmam explicitamente que renderizar o seletor de modelo não chama o antigo `useModelProviders()`.

## 104. O Repo Wiki separa o fato de exibição da hidratação de execução do Workspace

O Repo Wiki já usa a `ModelSelectionView` para construir o menu de modelos e ler os Option Specs, mas o componente ainda chamava o antigo `ModelProviderService.getAllCached()` na montagem e assinava o change event antigo do Registry. Essa lista antiga servia como fallback do menu de modelos e do reasoning e, ao mesmo tempo, usava o `updatedAt` do Provider para reidratar o catálogo de modelos do workspace, mantendo o fato de exibição dependente de uma segunda fonte da verdade.

O componente agora usa apenas a `ModelSelectionView` para fornecer a lista de modelos, as Properties e os Option Specs, e usa a `revision` da View como versão de entrada da hidratação do catálogo. Enquanto a View não é publicada, nenhum candidato é recuperado antecipadamente da lista antiga; uma View vazia também significa que o Registry confirmou que não há modelo selecionável. O antigo `ModelProviderService` é mantido com uma fronteira estreita: `prepareRepoWikiThoughtCatalog()` ainda precisa de `getProviderRegistrySnapshot()` em workspace runtimes ainda não migrados, como o remote anexado ao desktop, para injetar o snapshot de execução pelo protocolo antigo. Essa dependência de compatibilidade não participa mais da exibição no Renderer nem da decisão de selecionabilidade de modelos, e será removida junto com a cadeia Host -> Worker Snapshot.

## 105. O判断 estático de Provider no Composer segue o Registry

O Composer ainda precisa do antigo `useModelProviders()` para o estado dinâmico de Usage, Entitlement e funil de compra do Coding Plan/Start Plan; isso não significa que a lista antiga de Providers possa continuar participando das decisões sobre fatos estáticos de modelos. A implementação anterior combinava o Provider antigo e a `ModelSelectionView` com `OR` e priorizava o label antigo. Assim, um Provider já filtrado pelo Registry ainda podia ser reconhecido como custom Provider recuperável e, após uma falha ao salvar a configuração, seguir pelo caminho antigo de recuperação.

Agora, assim que a `ModelSelectionView` é publicada, o Composer julga a existência do Provider e lê o label do Provider apenas a partir daquela revision, e usa `config.kind === "api"` para decidir a elegibilidade de recuperação custom. Uma View vazia do Registry recusa a recuperação de Providers remanescentes na lista antiga; as entradas de compatibilidade sem a View montada continuam usando o判断 antigo. O Hook antigo permanece por enquanto no componente, mas sua responsabilidade fica restrita ao estado de runtime de Plan/Usage ainda não migrado e deixa de ser uma fonte de verdade paralela para identidade de modelo e selecionabilidade.

## 106. O menu de Automations e o label de Provider consomem o Registry diretamente

O Automation já passa a `ModelSelectionView` ao construtor de menu público, mas antes de entrar no construtor ainda filtrava os candidatos com a lista antiga de Providers e com o Entitlement Snapshot; os triggers da página de edição também priorizavam o nome antigo do Provider. O construtor público acaba ignorando esses resultados intermediários, de modo que a saída costuma estar correta, mas o Renderer ainda executava um conjunto antigo de julgamentos sem autoridade de decisão.

`buildAutomationModelSelectGroups()` agora chama diretamente a projeção do Registry quando a View já foi publicada, sem ler o Provider antigo e sem chamar o callback antigo de filtro de Entitlement. A página de edição também passa a ler primeiro o `config.label` do Registry; apenas as entradas de compatibilidade sem a View montada leem o name antigo. O antigo `useModelProviders()` continua fornecendo ao tarefas ociosas os dados dinâmicos de Plan/Usage, funil de compra e telemetria atual ainda não migrados, e esses usos não foram disfarçados de configuração estática de modelos.

## 107. Os Runtimes filhos de Workflow herdam a ModelFactory do Registry de processo

Uma auditoria das chamadas de produção mostrou que o `AgentRuntime` principal já tem o `ApiProviderModelRuntime.modelFactory` montado, mas o Expert Workflow e o Script Workflow, ao criarem Runtimes filhos, apenas copiavam o antigo `modelAdapter` e a Runtime Config. Assim, um Turn comum no mesmo App usava o novo Registry, enquanto a execução filha de Workflow ainda podia ler o Catalog antigo, as Provider Options antigas e a configuração de conexão antiga.

As duas dependências de Runtime filho agora recebem explicitamente a mesma `modelFactory` criada pelo App principal. Ela é a entrada de execução de nível de processo e, a cada chamada, continua criando um Model independente conforme o Registry atual; o que é compartilhado é a fábrica e a infraestrutura de Adapter, não o objeto Model de algum Agent Loop. Entradas antigas sem `modelFactory` continuam usando o Adapter de compatibilidade original, com o comportamento inalterado.

Os testes partem de chamadas reais de subagentes a partir do Expert Workflow e do Script Workflow e afirmam que a requisição passa por `createModel()` do Adapter do Registry. Antes da correção, ambos os testes observavam zero chamadas, o que prova que não se trata de uma falsa cobertura apenas em nível de tipos estático. As regressões dos dois Workflows e o `typecheck` da raiz do repositório passaram; o `tsc --noEmit` isolado do pacote Bootstrap ainda encontra a inconsistência de tipos `SessionEntryInfo.touchSession` já existente em `origin/staging`, e esta fatia não alterou esse contrato.

## 108. Os metadados de runtime do Core seguem o Model Config do Registry

A nova Registry ModelFactory já é responsável pela chamada final de modelos, mas `create-app` ainda injeta no Core dois parsers antigos: `resolveRuntimeModelLimits`, que lê context/output do Catalog, e `resolveModelProviderOptions`, que lê parâmetros de reasoning do Runtime Overlay. Fronteiras de execução filha, como as de Subagent, chamavam esses parsers primeiro e portanto um mesmo modelo ainda podia ser explicado simultaneamente por fatos novos e antigos.

`resolveRegistryModelRuntimeMetadata()` agora projeta, a partir da mesma Provider/Model Config, o context window, o max output padrão, as capacidades de mídia e as Provider Options de reasoning normalizadas por API Format. Os dois parsers de compatibilidade do Core em `create-app` priorizam essa projeção. Somente quando o Registry não tem o Provider correspondente é que se volta ao Overlay antigo; quando o Registry já tem o Provider mas falta o Model, ele retorna diretamente ModelNotFound, respeitando a fronteira de migração em nível de Provider.

A projeção também valida o nível de reasoning e reaproveita os requisitos de campo completos do ModelFactory, evitando criar mais um Schema permissivo só para o Core. Os novos testes cobrem o mapeamento de parâmetros OpenAI-compatible, a fronteira de fallback em nível de Provider e níveis inválidos; as regressões de Registry Runtime, App Workflow e Subagent do Core passaram.

## 109. A seleção ativa de modelo é estreitada para uma fronteira de fato em nível de Provider

O menu de modelos já isolava Registry e Runtime Overlay antigo por nível de Provider, mas, ao chamar `setModel()` diretamente, o parser antigo ainda voltava ao Runtime Overlay quando o Registry já tinha o Provider mas não o Model alvo. Os chamadores de protocolo podiam, portanto, escolher um modelo antigo que não existe no menu, fazendo com que o conjunto de modelos de um mesmo Provider fosse montado por duas fontes de verdade.

A seleção ativa agora usa uma interpretação estrita de Registry-owned: `undefined` só é devolvido quando o Provider inteiro não está no Registry, permitindo entrar no caminho de compatibilidade de Providers ainda não migrados; quando o Provider existe e o Model falta, o retorno é direto `ModelNotFound`. O modelo inicial explícito de uma nova Session e a seleção padrão do Environment adotam a mesma fronteira.

A restauração de Session mantém outra semântica. A Selection persistida expressa a intenção histórica do usuário e, mesmo que o Provider ainda exista e o Model tenha sido removido da configuração, não pode trocar silenciosamente para o modelo padrão durante a restauração. Por isso a entrada de restauração continua usando uma busca tolerante e preserva a Selection original; quando o Model for realmente criado, a Registry ModelFactory reporta explicitamente a indisponibilidade. Um teste de integração cobriu simultaneamente os dois caminhos: a recusa de um modelo antigo na seleção ativa e a restauração da identidade de um modelo já removido.

## 110. A leitura de estado de um Model removido do Registry não recai no Catalog antigo

A restauração de Session permite manter um Model histórico que já foi removido do Registry, mas `getThoughtLevel()` e `listThoughtLevels()` tratavam "não resolvi um Model do Registry" como equivalente a "Provider ainda não migrado" e passavam a ler os níveis do Catalog antigo. Assim, enquanto o Catalog antigo ainda reconhecesse o modelo pelo nome, como `glm-5.2`, a Session restaurada voltava a exibir o padrão `max` e a lista antiga de níveis que o Registry já não publica.

A consulta do modelo atual agora distingue explicitamente dois estados: quando o Provider inteiro não está no Registry, ela continua atendendo a cadeia de compatibilidade de Providers antigos; quando o Provider já foi assumido pelo Registry mas o Model histórico foi removido, apenas o `ModelRef.variant` persistido é mantido, e nem o nível padrão nem os níveis opcionais são lidos do Catalog antigo. Quando o usuário tenta definir um novo nível para esse Model removido, a interpretação estrita de Registry-owned ainda devolve `ModelNotFound`. Os testes de regressão fixam essa fronteira usando um modelo GLM que o Catalog antigo reconhece, evitando que um modelo placeholder comum leve o teste a concluir erroneamente que o caso está coberto.

## 111. O Registry completa a validação de Options do ModelSelection

`ProviderRegistry.validateSelection()` apenas confirmava antes se o Provider e o Model existiam. Uma Selection com `reasoningLevel` inválido ou com `maxOutputTokens` fora do intervalo ainda retornava sucesso e só falhava na criação do Model ou no momento da requisição; o Configured Default mantinha, por sua vez, outro julgamento parcialmente diferente. Isso fazia a mesma Selection poder obter conclusões distintas no Facade, na inicialização e na fronteira de execução.

O Registry agora valida simultaneamente as duas Options que já entraram no contrato público: o nível de Reasoning precisa aparecer no Enum Spec do modelo, e o limite de saída precisa ser um inteiro positivo que não ultrapasse o `max` do Limit Spec. Quando o modelo não declara o Spec correspondente, submeter explicitamente aquela Option também é considerado não suportado. O retorno passou a incluir um código de erro estável, além do modelo relacionado, do valor submetido e da faixa permitida, para que o chamador possa exibir o problema; o Registry não altera o valor nem faz truncamento silencioso.

O 판단 de opcionalidade do Configured Default reutiliza a mesma função de validação de Option e não implementa mais um julgamento de faixa separado. Os testes de domínio cobrem combinações válidas, Reasoning inválido, Reasoning Spec ausente, saída fora do intervalo e valores de saída não positivos construídos diretamente.

O `ProviderRegistryModelSource` do Bootstrap também foi estreitado para exigir `validateSelection()`. A inicialização de uma nova Session e o `setModel` ativo leem esse resultado de validação antes de criar a Registry Selection: quando o Provider inteiro ainda não foi migrado, o caminho de compatibilidade de Providers antigos continua acessível; quando falta o Model, o retorno é `ModelNotFound`; quando a Option é inválida, o retorno é `InvalidModelRequest`. A restauração de Sessions históricas continua usando a busca tolerante e não reescreve a intenção do usuário persistida no passado só porque as Option Specs de hoje mudaram.

## 112. A atualização de Account sai da difusão completa antiga do Registry

O `AccountProviderService` do Local Host já recalcula a terceira camada de Account Config a partir da Config, das configurações de conta, do Credential Port e das interfaces de plano, mas o momento da atualização ainda assinava o antigo `onDidChangeProviderRegistry`. Essa difusão inclui ao mesmo tempo salvamento/exclusão de Providers comuns, runtime headers e atualização de planos, de modo que operações sem relação também voltavam a consultar entitlement de conta e a nova Account Source continuava dependente do Registry antigo em termos de ciclo de vida.

Esta rodada acrescenta duas notificações estreitas, usadas apenas dentro do processo do Host. `ObservableSettingService.onDidUpdate` publica os campos desta gravação depois que o serviço de configurações底层 grava com sucesso; a raiz de composição observa apenas domínio de conta, modo de Family, seleção de conexão Personal/Team e endpoint do ZCode. `ModelProviderServiceRuntime.onDidInvalidateAccountProviderFacts` publica apenas login pré-configurado, entrada de planos, Coding Plan Key e mudanças de disponibilidade. As duas chamam `AccountProviderService.refresh()`, e os erros de atualização continuam sendo registrados pelo evento de erro do Service, preservando o last-known-good.

A raiz de composição de produção deixa de assinar o change event antigo do Registry. Edições de Providers comuns e runtime headers continuam publicando eventos de compatibilidade do Registry antigo, mas não disparam atualização de Account. Novos testes fixam que a notificação de configurações precisa acontecer depois de uma gravação bem-sucedida, que operações de Providers comuns não publicam Account Facts e que o filtro, a atualização e a liberação das duas notificações estreitas funcionam. Editar manualmente o antigo `setting.json` continua sem watcher; esse arquivo é hoje entrada de migração do estado de conexão de conta, e o modelo oficial de estado de conta continuará a reunir sua persistência e sua fronteira de atualização entre processos.

## 113. O判断 de plano das tarefas ociosas passa a ler o Account Overlay

A página inicial das tarefas ociosas julgava antes, pelo antigo `ModelProviderConfig[]`, se o usuário possuía um Coding Plan. Ela precisava entender ao mesmo tempo `enabled`, `systemDisabledReason`, o ID do Provider de Personal Coding Plan e o ID dinâmico do Provider de Team Plan, ou seja, reimplementava no Renderer a interpretação de Account Access. Entradas remanescentes no Provider Store antigo também podiam fazer com que um plano já失效 continuasse sendo tratado como disponível.

Agora a página inicial e o funil de compra leem em comum a `ProviderSettingsView`. Um Account Provider representa de fato a conexão pertencente à conta atual somente quando a terceira camada de Account Overlay fornece um `accessId` não vazio; o Provider de Coding Plan tem prioridade sobre o Start Plan. A diferença entre Personal e Team já está codificada no `accessId` e não é mais julgada por outro conjunto de IDs dinâmicos de Provider. Quando o usuário define o Provider como `enabled: false`, o `accessId` continua existindo e, portanto, preserva-se a semântica de produto já existente de "desligar a entrada não equivale a cancelar a assinatura".

Enquanto a Settings View não é publicada, o estado é unknown. A página inicial mantém o comportamento de carregamento original e não interpreta unknown como ausência de plano durante a inicialização, nem dispara um aviso de upgrade; o bloqueio só acontece quando a View é publicada e não há access de Coding Plan. Novos testes cobrem a Start Plan, a representação unificada do Coding Plan pessoal/de equipe, o desabilitado pelo usuário, a ausência de access e o estado não hidratado. O antigo `hasAnyOffPeakCodingPlanProvider()` e a inferência por `systemDisabledReason` foram removidos junto com isso.

## 114. O despacho das tarefas ociosas sai do Snapshot completo antigo do Registry

O despacho das tarefas ociosas chamava `getProviderRegistrySnapshot()` e depois procurava no Snapshot antigo a API Key e o baseURL do Provider de Coding Plan selecionado. Dessa forma, a conexão estática de conta, as credenciais dinâmicas de requisição e a projeção completa antiga de Providers ficavam amarradas na mesma entrada; mesmo com o Account Overlay já sendo a fonte da verdade dos Providers de conta, o despacho continuava controlado pelo cache e pelos julgamentos de membro do Snapshot antigo.

Agora o despacho é dividido em duas entradas. A Provider Settings View / Registry Resolution fornecem o `accessId` atual e fixo do Account Provider e o baseURL; o `AccountRequestAuthResolver`, no momento do despacho efetivo, obtém a API Key atual a partir do mesmo `accessId`. O resultado da resolução precisa ser exatamente igual à selected connection key das Settings, e o Team Plan continua resolvendo as credenciais de organization/project pelo Request Auth Service unificado. Quando o usuário define o Provider como disabled, o Account Overlay ainda mantém o accessId e, assim, "desligar a entrada de modelos" não é confundido com "a conexão do plano desapareceu".

O JWT de login continua sendo lido pelo Credential Service, e a verificação de impressão digital antes e depois da seleção de conta e da Family permanece inalterada, impedindo que duas gerações de credenciais sejam combinadas durante uma troca de configurações.

No Local Host, a implementação de Account Request Auth é hoje mantida pelo runtime concreto de Model Provider. A implementação não a registrou como RPC Service, porque essa capacidade devolve uma API Key real e não deve ser exposta ao Renderer ou a clientes Remotos apenas para reuso interno do Host. O Host usa essa capacidade de runtime na raiz de composição local `createLocalServices`; quando a autenticação dinâmica virar um Service interno oficial, esse ponto de montagem poderá ser substituído sem afetar o contrato de dependências das tarefas ociosas.

`reason: "off-peak"` foi adicionado ao enum de usos do Request Auth, para facilitar auditorias futuras e atualizações por uso. O Resolver atual ainda exige `modelId`, e as tarefas ociosas usam por enquanto `OFF_PEAK_PROVIDER_ID` como identificador de operação; o Resolver não escolhe credenciais com base nesse valor. Se a entrada de autenticação dinâmica deve virar um contrato orientado a propósito fica para o design independente do serviço de autenticação, e esta fatia não amplia o escopo.

Os testes usam dois fixtures independentes — campos fixos do Account Provider e Resolver de Auth dinâmica — e não constroem mais o antigo `ZCodeProviderRegistrySnapshot`. Cobrem conexão pessoal/de equipe, rejeição entre contas, troca de seleção, JWT ausente e API Key dinâmica ausente; nem o módulo nem os testes referenciam mais a interface de leitura do Snapshot antigo.

## 115. A página de configurações do Subagent remove a falsa compatibilidade de Provider Legacy

A página de configurações do Subagent já havia parado de assinar o Snapshot antigo de Provider, mas a árvore de componentes continuava passando camada por camada um `ModelProviderConfig[]` sempre vazio. A interpretação de reasoning sem Workspace também entregava esse array vazio ao parser de compatibilidade; tipos e nomes continuavam, portanto, sugerindo que o metadata antigo de Provider era uma fonte válida, e qualquer modificação futura poderia reconectá-lo facilmente.

Esta rodada removeu a importação de `ModelProviderConfig` em `SubagentsSection`, bem como o parâmetro `modelProviders` entre o formulário, o controle de Subagent embutido e as linhas da lista. O estado de carregamento passou a se chamar `modelSelectionLoading`, deixando claro que ele indica se a Model Selection View de nível de processo já foi publicada. Sem Workspace, os Option Specs de reasoning são lidos diretamente dessa View; no modo Workspace, o runtime catalog continua sendo a autoridade do lado de execução, e a prioridade existente não mudou.

O parâmetro de Provider antigo do parser de compatibilidade passou a ser opcional, meant apenas para que as Entries ainda não migradas o passem explicitamente. O ponto de chamada do Subagent não passa mais o array vazio e também não restaura fatos antigos de Provider quando falta a View. Os testes passaram a usar a Registry Selection View para verificar os níveis de reasoning sem Workspace e cobrem o comportamento de continuar usando a last-known View durante a atualização da View.

## 116. As configurações de geração do Repo Wiki saem da projeção de Provider Legacy

Os componentes de produção do Repo Wiki tinham o mesmo resíduo transitório do Subagent: o menu de modelos, a hidratação do catálogo de workspace e a interpretação de reasoning ainda exigiam um `ModelProviderConfig[]`, mas os pontos de chamada passavam sempre um array vazio. O menu já era encurtado pela nova fonte da verdade quando a Registry View existia, e o array antigo só deixava ruído de tipo; quando a Registry View ainda não tinha sido publicada, o parser de compatibilidade ainda completava uma lista fixa de níveis de reasoning com base no nome `GLM-5.2`.

Agora os grupos de modelos do Repo Wiki usam diretamente `buildRegistryModelSelectGroups()`. A disponibilidade de Provider, o acesso de conta e a associação de modelos vêm todos da Model Selection View; quando a View é vazia, o menu permanece vazio e não reexecuta as decisões antigas de Family Mode ou de entitlement de Provider. O catálogo de workspace continua responsável pela hidratação do diretório de runtime e pela projeção de reasoning do workspace atual; essa cadeia do lado de execução não mudou.

Os helpers de reasoning e de hidratação do Repo Wiki removeram o parâmetro de Provider Legacy. Quando a Registry View está disponível, os níveis são lidos dos Option Specs do Model Config; quando a View não foi publicada, usa-se apenas o catálogo de workspace já obtido, sem inferir capacidades estáticas pelo nome do modelo. O Subagent recebeu a mesma proteção contra View ausente, evitando que, depois de "não passar o array antigo", o código ainda caísse implicitamente na regra do nome GLM.

Os fixtures de teste passaram a construir diretamente a `ModelSelectionView`, cobrindo a projeção do menu pelo Registry, o padrão de reasoning, a prioridade do catálogo de workspace, modelos comuns e a proibição de adivinhar capacidades pelo nome GLM quando o Registry não foi publicado. Ao todo, 57 testes direcionados passaram e o typecheck de todo o repositório passou; o lint mantém as 35 warnings já existentes, sem novos erros.

## 117. O formulário de edição de Automations sai dos fatos estáticos antigos de Provider

A camada de lista de Automations ainda mantém dados antigos de Provider por causa da telemetria de runtime e da compatibilidade histórica, mas o formulário de edição já obtinha a Model Selection View completa e o agrupamento de modelos do Registry. Ele ainda passava o antigo `ModelProviderConfig[]` como propriedade, usado apenas para o label do Provider e o fallback de reasoning, criando duas fontes de fatos estáticos dentro do mesmo formulário.

Esta rodada removeu `modelProviders` das propriedades públicas de `AutomationEditView`. O label de Provider do trigger de modelo vem somente da Model Selection View, e os Option Specs de reasoning também são lidos apenas da View. Quando a View não foi publicada, os itens de menu existentes ainda podem manter o texto do modelo, mas nenhuma capacidade de reasoning é inferida a partir do metadata antigo de Provider ou do nome do modelo. A pré-visualização de Workspace, o protocolo de salvamento, o estado de agendamento e a telemetria da camada de lista de Automation não mudaram.

`resolveAutomationModelTriggerLabel()` também removeu o parâmetro de label antigo de Provider, e os testes passaram a construir diretamente a Registry View. Os 26 testes direcionados do formulário de edição e da projeção de modelos passaram, assim como o typecheck de todo o repositório; o lint mantém as 35 warnings já existentes.

## 118. O reasoning de draft do Composer sai do metadata antigo de Provider

O estado de draft do Composer usa `resolveDraftModelThoughtOption()` para preparar o valor padrão de reasoning do modelo alvo enquanto a projeção de runtime ainda não foi obtida. Esse helper aceitava tanto o array antigo de Providers quanto a Model Selection View e, por isso, lia o metadata antigo de modelos quando a View não tinha sido publicada e aplicava níveis fixos a nomes de modelo que contêm `GLM-5.2`. O valor padrão de draft podia assim divergir do Model Config atual do Registry.

Esta rodada estreitou o helper para `providerId + modelId + ModelSelectionView`. Quando a View não foi publicada ou o modelo alvo não tem Reasoning Option Spec, ele retorna vazio e o Composer espera o runtime catalog ou a Registry View fornecerem o fato; quando a View existe, lê diretamente o enum e o padrão do ModelConfig correspondente. O texto do draft, a seleção de modelo, o thought explícito, o pré-aquecimento de Session e a prioridade da projeção de runtime permanecem iguais.

Os testes removeram o fixture antigo de `ModelProviderConfig` e cobrem diretamente os Option Specs de diferentes modelos do Registry, modelo ausente, GLM de mesmo nome sem Spec, nível padrão e a cadeia de restauração do Composer. Ao todo, 41 testes direcionados em dois grupos passaram, assim como o typecheck de todo o repositório; o lint mantém as 35 warnings já existentes.

## 119. Remover o parser antigo de Provider do reasoning da UI

Os quatro pontos de chamada de produção — Subagent, Repo Wiki, Automation e o draft do Composer — já passaram a ler os Option Specs de reasoning somente quando a Model Selection View existe. Em `modelThoughtOption.ts`, a interpretação antiga de `ModelProviderConfig.reasoning`, o casamento por `modelIdByKind` e o nome codificado GLM-5.2 não têm mais consumidores de produção.

Esta rodada removeu o parser antigo inteiro e estreitou a entrada de `resolveModelThoughtOption()` para uma `ModelSelectionView` não nula. Os chamadores precisam tratar antes o estado de View ainda não publicada, e o helper unificado passa a assumir apenas a projeção precisa de `providerId/modelId -> reasoning Option Spec`. Assim, o metadata antigo de Provider não pode mais ser reconectado por acidente por uma nova entrada de UI, nem uma segunda fonte da verdade é recriada por um helper compartilhado.

Os testes especializados removeram o fixture antigo de Provider e a expectativa de "fallback quando não há Registry", passando a cobrir a autoridade do Registry, modelos comuns, modelos ausentes e nomes obsoletos que não completam fatos. Ao todo, 101 testes relacionados em cinco grupos passaram, assim como o typecheck de todo o repositório; o lint mantém as 35 warnings já existentes.

## 120. A página de configurações deixa de acrescentar Providers exclusivos do Snapshot antigo

A página de configurações já obtinha pela `ProviderSettingsView` o Provider composto de Official, Personal e Account Access, mas a projeção de migração ainda acrescentava ao final os antigos `ModelProviderConfig` ausentes da View. Entradas remanescentes do Store antigo conseguiam assim voltar a entrar na página de configurações, no Usage e em parte das exibições de Plan, formando Providers fora da nova fonte da verdade.

Esta rodada removeu essa lógica de acréscimo. Depois que a Settings View é publicada, o conjunto e a ordem dos Providers são totalmente determinados pela View; o Snapshot antigo apenas complementa, para o mesmo `providerId` e apenas para Account Providers, a API Key ainda não migrada, o motivo de indisponibilidade e os timestamps históricos, e não pode mais contribuir com Providers ou membros de modelos. Entradas de compatibilidade sem o novo Settings Service continuam usando diretamente o Snapshot antigo, e o comportamento de inicialização delas não mudou.

Novos testes fixam que uma Settings View vazia precisa projetar vazio mesmo recebendo um Provider antigo, e foram reexecutados 29 testes relacionados de API, Account, ordenação e do Hook da página de configurações. O Server remoto ainda não está completamente montado com o Provider Runtime, e a guarda de compatibilidade do Root sem Service permanece; essa fronteira pertence ao M2.8 e não é escondida nesta fatia por um fallback de UI.

## 121. A consulta de entitlement do Coding Plan passa a usar a identidade do Account Access

`useCodingPlanEntitlements` lia antes a API Key do antigo `ModelProviderConfig`, usava a Key não vazia para decidir se disparava uma consulta de entitlement e usava o hash dessa Key como identidade de cache e de atualização automática. Isso fazia o Renderer tratar credenciais dinâmicas de requisição como fato de conexão de plano e obrigava o Composer, as Automations, as configurações de Provider e o pop-up de compra a continuarem passando o objeto antigo completo de Provider.

Esta rodada mudou a entrada do Hook para `ProviderSettingsView`. Os quatro pontos de chamada leem em comum o `accessId` não sensível a partir do Account Overlay: só existe accessId para disparar a consulta de entitlement do Provider correspondente, e a mudança de accessId na troca de conexão forma uma nova identidade de cache e de atualização; a API Key real, o JWT e a Team Project Key continuam sendo resolvidas pelo Usage Service no momento da requisição. Um Provider estaticamente presente mas cujo Account Access ainda não foi estabelecido não dispara consulta nem usa mais a Key antiga para completar o estado de conexão.

Durante a migração, descobriu-se que a Account Source de produção pulava a resolução da conexão quando `enabled: false`, o que conflita com a decisão já confirmada de que desligar a entrada de modelos não equivale a desconectar o plano. O Resolver de domínio e o Connection Resolver dos Services agora resolvem e guardam o accessId mesmo para Account Providers desabilitados; o Registry final continua excluindo os modelos conforme o `enabled: false` da Configuração Efetiva, enquanto Settings e Usage podem preservar a conexão da conta. Novos testes fixam simultaneamente as três camadas de semântica: Account Overlay, Registry selectable e consulta de entitlement.

A atualização da API Key sob o mesmo accessId não altera mais a impressão digital vista pelo Renderer. As operações de autenticação, compra e configuração já chamam explicitamente a atualização de entitlement; qualquer nova entrada de atualização de credenciaisadded futuramente também terá de notificar os consumidores pelo evento de estado correspondente ou por um refresh explícito, sem voltar a projetar secrets na UI para criar detecção de mudança. Esta fatia não alterou o protocolo de requisição do Usage Service.

## 122. A Plan Identity submetida pela Session passa a usar o Account Access

`usePlanIdentitySnapshot` capturava a identidade de plano atual quando o usuário enviava uma mensagem, para entregá-la à telemetria de mensagens e ao histórico da Session. Ele assinava sozinho o Snapshot antigo de `ModelProviderConfig` e usava novamente a impressão digital da API Key para decidir as consultas de Entitlement e a identidade de cache do Coding Plan / Start Plan. Depois de as entitlements da página de configurações passarem ao Account Overlay, isso ainda formava uma segunda cadeia antiga de fatos e fazia a renovação de credenciais da mesma conexão de plano ser confundida com uma troca de identidade.

Esta rodada acrescentou a projeção compartilhada `accountProviderAccess`. Ela aceita apenas a `ProviderSettingsView`, lê o `accessId` não sensível do Account Overlay por providerId e mantém a identidade de conexão mesmo quando o Provider é desabilitado pelo usuário. As entitlements da página de configurações e o snapshot de envio da Session passam a compartilhar essa única projeção, construindo separadamente a identidade de consulta, refresh e cache com `providerId + accessId`. A API Key dinâmica, o JWT e a Team Project Key continuam sendo resolvidos pelo Usage Service nas requisições reais e não entram na entrada de decisão do Renderer.

`usePlanIdentitySnapshot` não assina mais o Snapshot antigo de Provider nem chama o helper de fingerprint/cache baseado em API Key. O Provider Family continua determinando quais providerIds de Coding Plan e Start Plan devem ser consultados, e o fallback do Start Plan e a semântica final de `resolvePlanIdentitySnapshot()` permanecem iguais. Novos testes fixam que um API Provider não é confundido com Account Access e que desligar a entrada de modelos não apaga a identidade da conexão do plano; 43 testes existentes de entitlement e telemetria de mensagens passaram.

## 123. O Usage das configurações sai dos fatos antigos de credenciais de Provider

O Usage da página de configurações chamava `useModelProviders()`, usava o `enabled`, o motivo de indisponibilidade e a API Key do Provider antigo para decidir se o Coding Plan Z.ai / BigModel podia ser consultado e usava a impressão digital da API Key para montar o Entitlement Cache. Depois passava o array antigo completo de Providers para o painel de Usage, apenas para encontrar de novo o mesmo Provider e gerar a chave de cache. Configuração estática de Provider, conexão de plano e credenciais dinâmicas de requisição ficavam assim misturados em uma única cadeia de UI.

Agora a SettingsPage consome diretamente a `ProviderSettingsView`. O Entitlement e os Team Products correspondentes só são consultados quando o Account Overlay fornece um `accessId` não vazio, e a identidade de cache é uniformemente `providerId + accessId`. O source de plano pessoal guarda o accessId original, o providerId e o label de exibição, e o source de equipe continua guardando o contexto de organization/project. O painel de Usage recebe apenas o source atualmente selecionado e, com base nele, escolhe entre consulta pessoal e de equipe; ele não recebe mais `ModelProviderConfig[]` e não lê API Key, estado antigo de enabled ou motivo antigo de indisponibilidade.

Novos testes fixam que a source pessoal carrega apenas o accessId não sensível, e foram reexecutados 43 testes de source de Usage, Tab, Entitlement e de montagem da SettingsPage; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes.

## 124. O Usage da barra lateral e o estado público de saldo saem do ModelProviderConfig

O menu de avatar da barra lateral ainda lia o Provider antigo por `useModelProviders()`, usando `enabled`, o motivo de indisponibilidade e a API Key para montar o conjunto de "Coding Plans consultáveis" e então entregar o objeto completo ao Entitlement Cache, ao parser de estado de saldo e ao seletor de alvo de upgrade. Essa cadeia permanente usava os mesmos fatos antigos do Usage das configurações, mas com lógica de filtro e cache independente.

Agora a barra lateral assina a `ProviderSettingsView`. Z.ai / BigModel só entram como fontes disponíveis quando o Account Overlay fornece um accessId não vazio, e desligar a entrada de modelos pelo usuário não apaga a conexão. Tanto o gate de Entitlement pessoal quanto a identidade de cache de Enterprise Products usam `providerId + accessId`, e as credenciais dinâmicas continuam sendo resolvidas pelo Usage Service no momento da requisição. Quando o Account Access está ausente, a barra lateral não adivinha mais a conexão a partir do Provider estático ou de uma API Key remanescente.

O `CodingPlanUsageRemainingState` público e `resolveSidebarCodingPlanUpgradeProviderId()` também tiveram suas entradas estreitadas, trocando o `ModelProviderConfig[]` completo por um `CodingPlanUsageAvailableProvider[]` que contém apenas `providerId` e `label`. A exibição de saldo e de upgrade precisa apenas da identidade da fonte e do rótulo; API Key, Endpoint, conjunto de modelos e antigo estado de disponibilidade não conseguem mais atravessar essa interface. Os pontos de chamada do Composer no período de migração projetam explicitamente os candidatos já existentes para esse tipo estreito, e a semântica de execução não mudou.

Os testes passaram a fornecer diretamente um Account Provider desabilitado que ainda contém accessId, cobrindo detecção de cold start, janela compartilhada de freshness, entrada fechada e access ausente; 78 testes de saldo público, upgrade, plano pessoal/Team e Start Plan passaram, junto com o typecheck de todo o repositório, e o lint mantém as 35 warnings já existentes.

## 125. O Context Usage do Composer passa a usar o Account Access

O Composer V4 já assinava a `ProviderSettingsView` para o Hook de entitlement, mas o Context Usage ainda derivava os candidatos de plano pessoal, o estado de carregamento e o gate de Team Products do antigo `useModelProviders()`. Por isso a API Key do Provider antigo ou entradas remanescentes ainda podiam fazer o campo de entrada exibir a entrada de saldo do plano e fazer Settings, barra lateral e Composer adotarem decisões diferentes para a mesma conexão de conta.

Esta rodada unificou a fonte de Usage do Composer no Account Overlay. O Account Provider da conexão atual só gera candidato de plano pessoal e habilita a sondagem de Team Products quando fornece um `accessId` não vazio, e o rótulo do candidato vem diretamente da Configuração Efetiva do Provider. Enquanto a Settings View não é publicada, o Context Usage permanece em estado de carregamento. Depois que o Account Access desaparece, a entrada de hover com refresh do plano pessoal não é mantida, mesmo que o Provider antigo e o Entitlement Snapshot ainda existam.

`useModelProviders()` continua temporariamente a serviço da exibição antiga do menu de modelos e da lógica de compatibilidade, e esta fatia não misturou essa responsabilidade à migração de Usage. Os testes injetam explicitamente a `ProviderSettingsView` e fixam que, com "Provider antigo com Key e Entitlement com snapshot, mas sem Account Access", não há Coding Plan Usage. Os 26 testes relacionados e o typecheck de todo o repositório passaram; o lint mantém as 35 warnings já existentes.

## 126. As Automations saem do Snapshot antigo de Provider

O formulário de modelo das Automations já usava novos candidatos de modelo quando a Registry View existia, mas a página principal ainda assinava `useModelProviders()` e o Coding Plan Entitlement. Quando o Registry ainda não tinha sido publicado, ela voltava a usar o Provider antigo, as configurações de Family e o Entitlement para construir outro conjunto de menu de modelos; as telemetrias de criação, execução imediata e exclusão também continuavam recebendo o array antigo completo de Providers, apenas para identificar o hostname do Endpoint de um Personal API Provider.

Esta rodada convergiu os candidatos de modelo das Automations para uma única `ModelSelectionView`. Enquanto a View não é publicada, o resultado é uma lista vazia de candidatos à espera do Registry, sem executar o filtro antigo de entitlement. A ordem dos Providers, a disponibilidade de conta e o conjunto de modelos são decididos a montante pelo Registry. Com isso, as Automations removeram `useModelProviders()` e a assinatura do Hook de Entitlement que existia apenas para o menu antigo.

A telemetria passou a ler a `ProviderSettingsView` existente: apenas API Providers não Official extraem o hostname do baseURL da Configuração Efetiva, preservando a semântica de não enviar endereços de Official Providers. Os testes cobrem Registry vazia, modelos de Account já decididos pelo Registry, hostname de API pessoal e desidentificação de Official Provider; 31 arquivos de Automation e 185 testes passaram.

## 127. O menu de modelos do Composer remove o fallback antigo de Provider

O Composer V4 já passava a Registry View ao construtor de agrupamento de modelos. Quando a View existia, o construtor retornava direto a projeção do Registry e o Provider antigo, as configurações de Family, o Entitlement, a ordem de exibição e os parâmetros de Team Products não participavam do resultado; mas o Composer continuava assinando `useModelProviders()` de forma permanente e, enquanto a View não era publicada, reconstruía o menu de modelos com o Snapshot antigo, julgava a existência de Providers, completava labels e decidia a elegibilidade de recuperação de Custom Providers.

Agora o Composer chama diretamente `buildRegistryModelSelectGroups()`, removendo o Hook de Provider antigo, o filtro de Entitlement e o fallback de ordem de exibição. Enquanto a Registry View não é publicada, os candidatos de modelo ficam vazios; o modelo da Session atual ainda pode aparecer como placeholder a partir da projeção de runtime, mas o usuário não pode escolher modelos a partir da antiga fonte da verdade. O label de Provider, a elegibilidade de recuperação de Custom e a codificação do valor selecionado também leem apenas a Registry View. O Usage de planos e a source de Team do Composer continuam usando a cadeia de Account Access/Entitlement migrada nas rodadas anteriores.

Os testes publicam a Registry View explicitamente por padrão e ganharam uma regressão de "Provider antigo existe, mas o Registry não foi publicado e o menu não é construído"; um Registry vazio também não expõe nem submete Providers legacy-only. Três arquivos de teste de Composer, Coding Plan e entrada de upgrade, totalizando 221 testes, passaram.

## 128. O estado de conexão de planos da página de configurações passa a usar o Account Overlay

A Provider Settings View já usa o `accessId` do Account Overlay para expressar a conexão atual do Start Plan, do Personal Coding Plan e do Team Plan, mas a página de configurações ainda inferia do antigo `ModelProviderConfig.apiKey` o estado de login do cartão, a conclusão de login, o autosync e a entrada do Start Plan. Isso obrigava o Renderer a continuar segurando as credenciais de requisição dos Account Providers e permitia que uma Key antiga remanescente sobrescrevesse o novo fato de Account.

Esta rodada acrescentou a projeção não sensível `accountConnected` nos itens de navegação de planos. O novo Host passa explicitamente o conjunto de Providers cujo `accessId` já foi publicado na Provider Settings View, e a interpretação do estado de entitlement, a visibilidade do Start Plan, o Plan Card, a espera de conclusão de login, o primeiro sync e a repetição no mesmo item consomem essa conclusão. Quando o `ProviderSettingsService` existe mas a primeira View ainda não foi publicada, a página permanece em `checking`, sem tomar emprestada a Key antiga por um instante e sem mostrar desconexão antecipadamente.

Entradas antigas sem o novo Provider Settings Service montado preservam a semântica de compatibilidade por `apiKey`; assim que o Service existe, mesmo uma Key antiga não vazia não pode substituir um `accessId` ausente. A regressão inversa fixa simultaneamente que, com Key antiga vazia mas Account Access presente, tanto Z.ai quanto BigModel exibem o plano como conectado.

Dezoito arquivos de teste de Provider da página de configurações, totalizando 307 testes, passaram; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes. A execução completa de pre-push por convicão atual ficou para uma rodada posterior concentrada.

## 129. O refresh de compra atravessa até a Account Source

O pop-up global de compra do Coding Plan, ao terminar, chamava primeiro `refreshCodingPlanApiKey()` e depois usava `useModelProviders().refresh()` para recarregar o Snapshot antigo de Provider. A nova Account Source recebe os eventos de Account Facts, mas essa escuta é um fire-and-forget de segundo plano; quando `refreshCodingPlanApiKey()` retorna, o recálculo do Account Provider ainda pode estar em andamento. Chamar apenas o `refresh()` do Registry também não basta, porque `AccountProviderService.read()` devolve o valor atual quando já existe um Snapshot e não espera automaticamente um novo recálculo.

Esta rodada acrescentou um `refresh(reason)` explícito ao Provider Settings Facade/Service. O Provider Runtime o monta como uma cadeia de duas etapas aguardáveis: primeiro chama o `refresh()` da Account Source e depois o `refresh()` do Registry. As escritas comuns de Settings continuam executando apenas a atualização de Registry já existente, sem gerar requisições de rede de conta ou de entitlement extras por causa de uma edição de Personal API Provider.

Com isso, o `CodingPlanUpgradeDialog` removeu `useModelProviders()`. No novo Host, a compra concluída aguarda a atualização completa pelo Provider Settings Service; as entradas antigas sem esse Service chamam diretamente a função antiga de atualização do Snapshot compartilhado, sem montar uma assinatura de Hook de longo prazo por causa de uma única atualização. A ordem de atualização do entitlement de planos e dos Team Products permanece igual.

Quatro arquivos de teste do Provider Facade/Runtime e da UI de Coding Plan, totalizando 211 testes, passaram, e o typecheck de todo o repositório passou. A execução completa de pre-push por convicção atual ficou para uma rodada posterior concentrada.

## 130. Os Account Providers da página de configurações saem da projeção de secrets permanente

A página de configurações já usa o `accessId` do Account Overlay para expressar a conexão de planos, mas a projeção antiga ainda complementava a API Key, o motivo de indisponibilidade e os timestamps históricos a partir do `ModelProviderConfig` do mesmo Provider ID. Mesmo sem que esses campos participassem das principais decisões de exibição, a lista permanente de Providers do Renderer continuava segurando credenciais antigas de requisição e recalculava a projeção da nova Settings View sempre que o Snapshot antigo era atualizado.

Esta rodada transformou a função de migração em uma projeção unidirecional `ProviderSettingsView -> ModelProviderConfig[]`. Os API Providers continuam carregando a Personal API Key necessária à edição do usuário; a projeção dos Account Providers passa a não conter por definitivo a API Key antiga, e o conjunto de Providers, o protocolo, o Endpoint, os modelos, as Properties e os Option Specs vêm todos da Settings View. Providers exclusivos do Snapshot antigo, motivos de indisponibilidade e timestamps também deixaram de entrar nesse estado permanente.

O "testar conexão" da página de configurações ainda chama a Connectivity Probe antiga, que ainda não foi migrada. Para manter essa operação explícita, esta rodada chama `getAllCached()` uma única vez quando o usuário testa um Account Provider: obtém pelo mesmo ID a API Key de compatibilidade e o Header de runtime, e então os combina com a projeção atual em um objeto de requisição descartável. O protocolo, o Endpoint, os modelos e os Headers estáticos da Settings View atual têm prioridade, e o objeto antigo não pode sobrescrevê-los. Essa leitura de compatibilidade sob demanda poderá ser removida quando a Connectivity Probe for conectada ao Account Request Auth Service.

Novos testes fixam que a projeção permanente de Account não contém secrets e verificam que o teste explícito só pode complementar credenciais de runtime/Headers, sem trazer fatos estáticos antigos de volta. Quatro arquivos de teste de projeção de Provider, página de configurações, Coding Plan e ações de assinatura, totalizando 228 testes, passaram; o typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes. A execução completa de pre-push ficou para uma rodada posterior concentrada.

## 131. O cold start e o refresh da nova página de configurações saem do Snapshot antigo de Provider

Depois que os secrets de Account foram removidos da projeção, `useModelProviders()` continuava assinando o Snapshot antigo e disparando `getAll()` mesmo com o novo Settings Service montado, e devolvia o Provider antigo como lista temporária enquanto a primeira `ProviderSettingsView` não chegava. Isso mantinha uma leitura permanente inútil e mantinha uma breve dupla fonte da verdade no cold start do novo Host.

Esta rodada explicita o roteamento por capacidade do Service: quando o novo Settings Service existe, o Provider View devolve uma lista vazia antes da publicação e mantém o estado de carregamento; o Hook não assina mais o Snapshot antigo, não dispara o `getAll()` antigo e não lê o display-order antigo. Quando o usuário cloca em atualizar na página de configurações, o Hook chama diretamente `ProviderSettingsService.refresh()`, e a cadeia oficial atualiza a Account Source e depois o Registry. As entradas antigas sem o novo Service mantêm a assinatura do Snapshot, a hidratação de cache e o comportamento de atualização originais.

Salvamento, exclusão e reordenação de modelos ainda mantêm por enquanto o espelho no Store antigo e a sincronização de compatibilidade dos workspaces abertos, pois envolvem cadeias de execução Worker/Remote que não saíram completamente; esta fatia não os removeu junto com a migração da leitura. Novos testes fixam que, quando o Service existe mas a View ainda não foi publicada, não há retorno ao Provider antigo; quatro arquivos de teste de projeção, página de configurações, Coding Plan e ações de assinatura, totalizando 229 testes, passaram. O typecheck de todo o repositório passou e o lint mantém as 35 warnings já existentes; o pre-push completo foi adiado para uma rodada concentrada.

## 132. Adicionar modelo na página de configurações sai da consulta independente ao Catalog

Ao adicionar um modelo na página de configurações, a implementação antiga consultava um Catalog de China LLM separado com base no Model ID digitado pelo usuário e lia `maxOutputTokens` do primeiro modelo com o mesmo nome. Essa consulta ignora o Provider ID e o API Format: ela pode tanto casar um modelo de mesmo nome de outro Provider quanto fazer o Renderer manter uma fonte de valores padrão de modelo fora da Official / Personal Config.

Esta rodada acrescentou à `ProviderSettingsFacade` uma pré-visualização de configuração de modelo sem estado. Ela reutiliza as `ModelConfigRules` Official e Personal do Snapshot atual, resolve o `ModelConfig` Efetivo pelo Provider ID, Model ID e API Format reais, e devolve à página de configurações o resultado serializável junto com os problemas de integridade:

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

A pré-visualização não grava na Personal Config nem dispara reconstrução do Registry. O rascunho de um novo Provider já gera um `providerId` estável ao abrir o formulário e o reutiliza ao salvar, de modo que regras com `providerMatch` têm a mesma semântica antes e depois do salvamento. A página de configurações também removeu a entrada de adição de Provider do Catalog que já estava desativada, os componentes correspondentes e
`IModelProviderService.getCatalogProviders()` e a API pública correspondente. O antigo Catalog Loader continua temporariamente em uso pelo Provider Store antigo para complemento de metadata durante a migração; só depois que esse Store concluir a migração será possível afirmar que a fonte de fatos de Catalog em runtime foi removida por completo.

Seis arquivos de teste do Provider Facade, da página de configurações e do Service antigo, totalizando 371 testes, passaram; as builds TypeScript incrementais de Provider, Services e UI passaram. O lint de todo o repositório ficou com 0 error e as 35 warnings já existentes. A execução completa de pre-push por convicção atual ficou para uma rodada posterior concentrada.

## 133. O Provider Store antigo remove o enriquecimento por Catalog

A cadeia antiga de leitura de `config.json` / `model-providers.json` carregava o Catalog de modelos chineses da raiz do repositório, casava por Model ID para obter context, output, modalities e reasoning, e depois gravava o resultado complementado de volta na configuração do usuário. Nem o Provider ID nem o API Format participavam da busca; o mesmo Model ID recebia a mesma metadata em qualquer Provider. Isso não só criava uma segunda fonte da verdade fora da Official Config, como também persistia valores padrão do sistema como campos aparentemente configurados pelo usuário, perturbando a posterior importação de diferenças Personais.

Esta rodada restringiu as responsabilidades do Store antigo à interpretação do formato antigo e à normalização de campos:

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

O Store antigo não completa mais output ausente, não estende níveis de reasoning e não copia fatos de mídia de modelos. Valores escritos explicitamente no arquivo antigo continuam preservados; quando esta fatia foi concluída, a normalização do formato antigo de `[1m]` ainda existia temporariamente e foi migrada em seguida para a Official Config pelo item 135. Quando o Registry interpreta o mesmo modelo, ele ainda obtém todos os fatos padrão completos a partir das `ModelConfigRules` Official/Personal. Os testes fixam simultaneamente que o context de 1M, o output de 384K e os níveis de reasoning do DeepSeek V4 Pro continuam existindo na Official Config do repositório, evitando que a remoção da fonte antiga remova os fatos em si.

O Catalog Loader correspondente, os testes do Loader, o JSON do Catalog antigo com mais de 5.000 linhas e o item de empacotamento Electron `extraResources` foram removidos. O Shared ainda mantém os campos de proveniência do Catalog antigo e seu schema, para interpretação compatível de configurações históricas e de protocolo; eles não apontam mais para nenhuma Catalog Source de runtime e sairão junto com o DTO/Store antigo.

Cinco arquivos de teste de Provider Service, Official Source, importação Personal, Provider Runtime e recursos de desktop, totalizando 191 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa de pre-push ficou para uma rodada posterior concentrada.

## 134. Valores de sistema de Builtin Preset saem da primeira migração Personal

O antigo `ModelProviderService` gravava no Provider Store antigo tanto o fallback local de Builtin Preset quanto o resultado da sincronização remota. Esses objetos continham ao mesmo tempo a API Key do usuário, o label do sistema, o endpoint de runtime, a lista remota de modelos e o estado de disponibilidade da conta. Anteriormente, a primeira migração comparava todos eles com a Official Config; quando o fallback antigo continha apenas `GLM-5.2` e `GLM-5-Turbo` e a Official já continha a lista completa de modelos Z.ai, essa diferença podia ser gravada como `models` Personais e fazer o novo Registry perder por um longo período os modelos novos da Official.

Esta rodada restringiu a migração conforme a propriedade comprovável nos dados antigos:

```text
旧 Builtin API Provider
├─ API Key                         -> Personal
├─ modified=true 的模型配置       -> Personal ModelConfigRule
└─ label / endpoint / models 等    -> 不迁移，继续由 Official 决定

旧 Builtin Account Provider
├─ modified=true 的模型配置       -> Personal ModelConfigRule
└─ 静态字段 / 可用状态 / 凭据      -> 不迁移
```

Built-in Providers antigos desconhecidos continuam não entrando no Personal. Os Providers somente-Personal e os API Providers Official salvos no Store antigo com origem custom continuam usando a semântica original de migração completa/por diferenças e não são afetados por esta decisão. Os testes de regressão fixam que o fallback antigo de dois modelos Z.ai não pode sobrescrever o conjunto de modelos do Official, enquanto preserva os modelos `modified` adicionados explicitamente pelo usuário.

## 135. O sufixo de modelo e os padrões de novos modelos saem do hardcode da UI e do Shared

A página de configurações, a fábrica de modelos do Shared, a normalização do Store antigo e a projeção de protocolo reconheciam antes o sufixo `[1m]` em Model IDs e o
forçavam o context window para 1M. A adição de modelo na página de configurações inicializava 200K direto com uma constante do Shared. O mesmo fato existia em várias camadas e a configuração Personal explícita não conseguia sobrescrever a regra do sufixo.

Esta rodada escreveu as duas omissões nas Official `ModelConfigRules`: a primeira regra geral fornece context de 200K e as capacidades de entrada padrão; a regra `[1m]` seguinte sobrescreve o context para 1M. A adição de modelo na página de configurações obtém o resultado pela pré-visualização do Settings Facade, e as linhas de modelo, o pop-up de edição e a lógica de salvamento usam apenas os valores de configuração atuais. A fábrica do Shared, o Store antigo e a projeção de protocolo apenas normalizam ou transmitem metadata explícita e não infiram mais capacidades a partir do nome do modelo. Quando o Model ID muda, o formulário de adição limpa simultaneamente o preview de context e de output do modelo anterior e aguarda o resultado de Config do novo modelo, evitando que uma consulta breve ou com falha reutilize valores antigos.

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

Assim, `[1m]` expressa agora um padrão Official e não mais uma regra de código impossível de sobrescrever. O Model Config preciso do Personal fica depois das regras Official, de modo que um context explícito do usuário pode sobrescrevê-lo, e um context já escrito em arquivos antigos pode ser preservado como intenção Personal na primeira importação. Sete arquivos de teste relacionados, totalizando 261 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa de pre-push ficou para uma rodada posterior concentrada.

## 136. Remover as saídas desativadas de sugestão de Endpoint e de sondagem de modelos remotos

A página de configurações já edita `apiFormat`, `baseURL` e a lista de modelos explícitos pelo Provider Settings Facade e não lê mais o antigo `getEndpointSuggestions` nem o `getModelsByEndpoint`. O Hook antigo continuava expondo esses dois métodos sem consumidores, e por isso o Service e o OAuth Preset Repo mantinham uma cadeia auxiliar de configurações que acessa `client/configs`.

Esta rodada removeu o valor de retorno do Hook de UI, o contrato público do Service, as implementações de Service/Repo, o stub web, o componente morto e os testes que cobriam apenas essa saída. O teste explícito de conectividade é mantido, e o entitlement de Account e a migração de Presets antigos ainda podem acessar os serviços remotos conforme suas próprias responsabilidades.

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

Essa remoção evita que a lista remota de Providers volte a ser uma fonte candidata de fatos para a página de configurações e não altera a cadeia de compatibilidade de Workspace Snapshot ainda usada pelo remote anexado ao desktop. Três arquivos de teste de Services e da página de configurações, totalizando 343 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa de pre-push ficou para uma rodada posterior concentrada.

## 137. O conjunto de modelos do Start Plan sai do hardcode da UI e do Store antigo

O Shared mantinha dois modelos gratuitos em `ZAI_START_PLAN_FREE_MODELS`. A projeção antiga de Provider Snapshot do campo de entrada filtrava os modelos do Start Plan com essa constante, a página de configurações construía um Provider placeholder com ela e o Provider Store antigo, quando a sincronização remota falhava, gravava Z.ai e BigModel Start Plan na configuração antiga com base nela. Essas três lógicas sobrescrevem ou falsificam fatos oficiais: a Official Config já declara modelos estáticos e o Account Overlay dá os membros realmente disponíveis conforme o entitlement atual.

Esta rodada removeu a constante e seus três tipos de consumidor. A cadeia oficial de fatos é agora:

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

Enquanto a Registry View ainda não está hidratada, a projeção de compatibilidade apenas encaminha os modelos que já existem no Snapshot antigo de Provider a montante, sem decidir duas vezes com base no nome do modelo e na marca `modified`. O fallback de falha de rede do Store antigo ainda pode complementar API Key Providers e o ZAPI interno, mas não cria mais Account Providers a partir de constantes locais de modelos; sem fatos de Account obtidos, o Start Plan deve permanecer indisponível.

Novos testes de regressão provam primeiro que a implementação antiga filtrava os modelos a montante e falsificava o Start Plan, e só então concluem a modificação de produção. Quatro arquivos de teste de UI e Services, totalizando 340 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa
de pre-push por convicção atual foi adiada para uma rodada concentrada.

## 138. O Local Host deixa de sobrescrever o Registry do Worker com o Snapshot antigo

Ao investigar a cadeia local de criação de Session, descobriu-se que, embora Host e Core Worker já estejam montados com um Provider Registry de nível de processo, o Host ainda derivava `runtimeModel` do Snapshot antigo do `ModelProviderService` e o enviava ao Worker nas entradas create/resume/set/send. A CLI registrava essa entrada como uma execution-scoped Model Source; portanto, a execução de modelos comuns do mesmo Environment ainda era controlada pelo Snapshot antigo, e o Registry Official, Personal e Account mantido pelo próprio Worker não se tornava a autoridade de execução.

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

As entradas locais de Session agora enviam apenas `ModelSelection` e o nível de thought. O Worker consulta o próprio Registry de nível de processo na criação do Loop, e atualizações de Provider Config só afetam Models criados depois; o ciclo de vida dos Models jáoghados não muda. O `runtimeModel` execution-scoped trazido explicitamente pelo chamador é mantido, de modo que Providers temporários do período de migração, como os das tarefas ociosas, não foram removidos por esta mudança.

Durante a implementação também se descobriu que `createLocalServices()` criava a `AccountProviderConfigSource` oficial, mas o que era passado ao `ZCodeAgentService` continuava sendo apenas a Legacy Source usada pelo remote anexado ao desktop. Essa omissão faria com que a sincronização local de `provider/updateAccountConfig` nunca obtivesse o novo Account Overlay. Esta rodada conecta a Source oficial ao Agent Service; o remoto continua usando a Legacy Source quando não tem um Registry de mesma origem, sem ampliar a fronteira desta migração.

O antigo Fake Agent de testes ligava o pedido de runtime preferences depois de `workspace/updateProviderRegistry`, e a cold subscription do V4 ainda afirmava que o Host enviaria primeiro o Snapshot completo. Os dois testes foram alterados para a semântica de Registry de nível de processo: as runtime preferences são pedidas na fase de materialização de runtime da criação da session, e a cold subscription usa o Snapshot antigo apenas como portão de inicialização.

## 139. O pré-aquecimento do Repo Wiki local sai do Workspace Snapshot antigo

O menu de modelos e os Option Specs do Repo Wiki já vêm da `ModelSelectionView`, mas o pré-aquecimento de rascunhos de projetos ainda não ativados sincronizava incondicionalmente o Registry completo antigo e fazia o Host resolver o `runtimeModel` do mesmo modelo. O Worker local já tem o próprio Registry de processo como autoridade de execução, de modo que esses dois passos reintroduziam uma segunda fonte da verdade.

Esta rodada roteou por tipo de Workspace:

```text
本地 Repo Wiki 预热
└─ preferredModel / ModelSelection -> Worker Registry

desktop-attached remote 预热
├─ 同步旧 Workspace Registry Snapshot
├─ 解析兼容 runtimeModel
└─ 创建远端草稿 Session
```

O remoto entra na cadeia de compatibilidade por `workspaceIdentity` ou `remoteSessionId`; isso é compatível com a restrição existente de que o remoto precisa trazer `workspaceIdentity` e também cobre workspaces que, durante uma desconexão, ainda não têm `remoteSessionId`. O caminho local não chama mais `getProviderRegistrySnapshot()` nem `resolveRuntimeModelForV4()`. Novos testes fixam separadamente que o remoto continua sincronizando e que o local contorna por completo a cadeia antiga.

## 140. A rejeição de troca de modelo do V4 local sai da recuperação pelo Snapshot antigo

Ao receber `provider.notInRegistry`, o `switchModelConfig` do V4 fazia o Renderer reenviar incondicionalmente o Registry completo antigo, e o Host resolvia o runtimeModel e tentava de novo. Isso existia para a recuperação do catálogo in-process do remote anexado ao desktop; depois que o Worker local passou a usar o Registry de processo oficial, essa recuperação sobrescrevia a recusa explícita do Worker com uma segunda fonte da verdade.

Agora apenas o workspace remoto que traz `workspaceIdentity` ou `remoteSessionId` entra na recuperação de compatibilidade. O local devolve o primeiro resultado de recusa, sem chamar `getProviderRegistrySnapshot()`, `workspace/updateProviderRegistry` ou `resolveRuntimeModelForV4()`. O remoto ainda tenta no máximo uma vez e para o ciclo quando a segunda tentativa também falha. Os 44 testes do SessionPane cobrem a proibição de recuperação local, o reenvio remoto, a injeção de runtimeModel e a semântica contra loop.

## 141. O pré-aquecimento de drafts do V4 local sai da resolução de runtimeModel pelo Host

O pré-aquecimento de Session de drafts do V4 obtém primeiro a configuração de modelo inicial do Composer e depois chama o `resolveRuntimeModelForV4()` do Host. O Host local já não tem uma Execution Registry Source, de modo que essa chamada normalmente devolve vazio; o problema mais importante é que a interface continua expressando que "o Host pode construir um runtimeModel para a execução local", o que conflita com a autoridade do Registry do Worker.

Agora o resolver de runtimeModel do pré-aquecimento local devolve diretamente vazio, e o `createSession` carrega apenas o provider/model/thought inicial; o Worker cria o Model conforme o próprio Registry de processo. Workspaces remotos com `workspaceIdentity` ou `remoteSessionId` continuam sendo resolvidos pelo Host e carregando o runtimeModel de compatibilidade. Os testes capturam diretamente o resolver passado pelo SessionPane ao coordenador de pré-aquecimento e fixam, respectivamente, zero chamadas no local e
resolução remota normal com runtimeModel de compatibilidade; todos os 46 testes do SessionPane passaram.

## 142. O create replayable/Bot do V4 local sai do runtimeModel do Host

O task adapter dos Services ainda tem uma entrada independente de V4 `createSession`, usada por celular replayable e por Bot para criar tarefas. Antes, bastava receber um model para ele chamar o `resolveRuntimeModelForV4()` do Host, mesmo quando o alvo era um Worker local. Como o processo do Agente local já mantém o Registry oficial, essa entrada também trazia de volta ao Worker a configuração de compatibilidade do Host.

Agora o create do V4 local envia apenas provider/model/thought da config; somente o alvo desktop-attached remote com `workspaceIdentity` continua resolvendo e anexando o runtimeModel. Não foi usado `workspacePath` para判断 remoto, em conformidade com a restrição de que o isolamento de identidade remota precisa trazer `workspaceIdentity`. Os 90 testes do task adapter cobrem as zero chamadas locais e a injeção do runtimeModel de compatibilidade remoto.

## 143. A troca de modelo local das Automations sai do runtimeModel do Host

A entrada unificada de configuração das Automations envia o V4 `switchModelConfig`, mas antes o Host chamava `resolveRuntimeModelForV4()` independentemente de o alvo ser local ou remoto. O Worker local já consegue criar o Model a partir de provider/model/thought pelo Registry de processo, de modo que esse runtimeModel apenas reintroduzia a antiga projeção de execução.

Agora o comando local de Automation carrega apenas Selection e Options; o desktop-attached remote com `workspaceIdentity` continua anexando o runtimeModel de compatibilidade. O collaboration mode existente, a convergência de thought e a ordem dos comandos das Automations permanecem iguais. Os 91 testes do task adapter cobrem a zero resolução local e a injeção de runtimeModel remoto.

## 144. A fronteira de autenticação dinâmica do remote anexado ao desktop (decidido)

Ao continuar M2.8 retirando o antigo Snapshot de Secrets de Account do remoto, foi confirmada uma fronteira entre processos que não pode ser resolvida apenas removendo ramos de compatibilidade:

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

O server remoto é iniciado com o authority mode `desktop-attached-remote` e hoje não está montado com um Official/Personal Provider Config Runtime nem tem o Credential Store da conta do Desktop. Ao receber o pedido de autenticação do Worker, o `ZCodeAgentService` remoto só pode chamar o antigo `modelProviderService.accountRequestAuthResolver` do próprio processo remoto. Esse Resolver lê o diretório de usuário e o estado de conta remotos, que não representam o login do Environment do Desktop.

A ponte de UI existente também não corrige essa fronteira. O `V4WorkspaceProviderRuntimeHeadersBridge` envolve o Controller no `ServiceProvider` do Workspace alvo; a aba remota obtém assim simultaneamente o `zcodeAgentService` remoto, o `modelProviderService` remoto e o `codingPlanSubscriptionService` remoto. Ele consegue devolver a resposta ao Remote Host, mas não obtém naturalmente o Account Request Auth Material do Local Host do Desktop.

A configuração estática já tem um protocolo reutilizável e sem Secrets:

```text
Desktop Account ProviderConfigMap
        |
        | provider/updateAccountConfig
        v
Remote Worker Registry
```

O que realmente aguardava decisão era o roteamento dinâmico por requisição:

```text
方案 A：Renderer 临时中转

Remote Worker -> Remote Host -> Renderer
                              -> Local Host Auth Service
                              -> Remote Host -> Remote Worker

方案 B：Host 直接中转

Remote Worker -> Remote Host -> Local Host Auth Broker
                              -> Remote Host -> Remote Worker
```

O方案 A pode reutilizar o fato de que o Renderer já detém simultaneamente os services Local e Remote e é consistente com a posição da ponte atual de Header de verificação de segurança pontual; exige adicionar um serviço estreito de Account Request Auth no Local Host e permitir que o Auth Material pontual passe pela memória do Renderer. O方案 B tem responsabilidades de processo mais puras e o Renderer não toca no Auth Material, mas o Local Host e o Remote
Renderer não toca no Auth Material, mas hoje não existe um canal RPC direto entre o Local Host e o Remote Host, e seria preciso acrescentar um novo broker Host-to-Host na camada de gerenciamento da conexão remota, o que tem um impacto claramente maior.

### Decisão humana

Nenhuma das duas rotas entre Hosts entra na arquitetura alvo. O Desktop Local Environment e o Remote Environment têm, cada um, seus próprios Provider Config, Credential Store, Account Source e Registry; `desktop-attached` expressa apenas a relação de controle remoto.

A migração acontece em três passos:

1. O Remote ProviderRuntime torna-se primeiro a única fonte da verdade do Remote Worker, removendo a cadeia principal em que o Desktop envia o Registry completo, o runtimeModel, o Account Config e o Snapshot de Secrets.
2. A funcionalidade independente de sincronização, mantida por um colega, continua gravando a Config e as Credentials locais no Remote Store; a Remote Source reconstrói o Registry a partir das mudanças do Store, e as requisições continuam lendo apenas o Remote Account Request Auth.
3. Mais adiante o App pode chamar diretamente os Services remotos de Settings / OAuth, operando o login e a configuração de modelos do ambiente remoto.

O segundo passo é Provisioning, não injeção de Provider em runtime. Quando a sincronização é interrompida, o Remote Environment continua rodando com a última gravação local bem-sucedida, e o Desktop não participa de cada requisição de modelo. O Relay de Auth pelo Renderer e a proposta de Host-to-Host Auth Broker foram descartados.

## 145. O Account Request Auth é promovido a contrato de serviço independente

O transporte entre Hosts ainda não havia sido decidido, mas tanto o relay pelo Renderer quanto o Broker Host-to-Host precisam da mesma capacidade de autenticação em tempo de requisição. A implementação anterior tinha apenas `modelProviderService.accountRequestAuthResolver`, uma propriedade interna concreta de runtime, e um chamador que dependesse diretamente dela continuaria amarrando a autenticação dinâmica ao antigo Provider Service.

Esta rodada acrescentou o `IAccountRequestAuthService`, cuja interface mantém somente:

```text
resolve(providerId, modelId, accountAccessId, reason)
        |
        v
AccountRequestAuthMaterial
├─ apiKey
└─ headers
```

Os Local Services montam esse serviço usando o Resolver existente. A camada de serviço apenas delega: não lê Config, não cacheia credenciais, não recorre ao Provider antigo e não engole falhas de autenticação. O `ZCodeAgentService`, o Off-Peak Service do conjunto e o Desktop Host Off-Peak Runtime agora dependem desse contrato estreito; o antigo `ModelProviderService.accountRequestAuthResolver` é usado apenas na raiz de composição `createLocalServices()` para produzir a implementação de migração.

Durante a implementação chegou-se a tentar registrar esse serviço como um Service Channel padrão. A verificação de tipos de todo o repositório levou à montagem existente do Desktop Host e mostrou que ali já existe uma proibição explícita de expor a capacidade de resolver API Keys ao Renderer/cliente Remoto; continuar o registro escolheria o relay pelo Renderer antes de o transporte entre Hosts estar decidido. A implementação final retirou o Channel, o `IServiceAccessor` e o proxy de `RemoteServiceAccess`, mantendo o serviço privado ao processo do Local Host por uma tabela lateral `WeakMap<ServiceCollection, Service>`, igual à do `ProviderRuntime`. O Desktop Host consegue obter a mesma instância pela API de composição do node, mas `ServiceCollection.exposeOnChannelServer()` não a expõe.

Novos testes cobrem a delegação intacta do Resolver, a ausência de degradação em caso de falha e a obtenção da instância privada do Local Host; os testes de comportamento existentes de Agent/Off-Peak passaram a injetar diretamente o contrato de serviço. Cinco arquivos de teste direcionados, totalizando 80 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 146. O Account Request Auth sai da posse do Provider Service antigo

O item 145 estreitou primeiro a interface dos consumidores, mas o Local Host inicialmente ainda construía o novo serviço a partir de `modelProviderService.accountRequestAuthResolver`. Isso mantinha a nova interface em runtime sob a posse do Provider Service antigo e faria a mesma cadeia de autenticação migrar de novo quando o serviço antigo fosse removido.

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

A Personal Coding Plan Key comum é lida primeiro da nova `account-provider:<accessId>:api-key`; somente quando a nova chave não existe é que a leitura recorre ao Provider Store antigo por meio de uma closure e completa a migração única. O Start Plan continua lendo o Token Set atual do OAuth Credential Repo, e o algoritmo de Key do Team Plan em tempo de requisição permanece como era. O antigo `ModelProviderService` já removeu o campo Resolver e sua construção e não possui mais a capacidade de autenticação dinâmica.

A implementação concreta da Team Plan Key ainda compartilha, por enquanto, as funções puras de `modelProviderService.ts` com o Snapshot antigo do Registry. Mover essa lógica de execução dinâmica de conta para um módulo de Account Runtime independente é uma limpeza posterior de coesão de código e não afeta a fronteira de fonte da verdade e de ciclo de vida desta rodada.

Os testes verificam primeiro que o serviço estreito do Local Host consegue resolver a Key atual a partir do novo Credential Store depois que o Resolver antigo foi removido; os 4 arquivos relacionados
de teste, totalizando 145 testes, passaram. O typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 147. O logout OAuth limpa o novo Account Credential Store

A Personal Coding Plan Key já foi migrada de forma unidirecional do Provider Store antigo para o Account Credential Store gerenciado por `accessId`, mas o logout OAuth ainda chamava apenas o antigo `ModelProviderService.clearCodingPlanApiKey()`. Isso deixaria a nova fonte da verdade de autenticação de requisição com a Key antiga remanescente depois do logout; em um login posterior ou na recuperação do estado da conta, o Request Auth ainda poderia ler essa credencial obsoleta.

Agora o handler de logout depende de duas fronteiras explícitas de limpeza:

```text
OAuth logout
├─ 旧 Provider Store
│  └─ 清理 Start / Coding Plan 迁移期副本
└─ Account Credential Store
   └─ 删除 coding-plan:<providerId> Personal Key
```

O JWT do Start Plan é limpo junto com o OAuth Token Set e não é guardado em uma segunda cópia no Account Credential Store; a Key do Team Plan é resolvida em tempo de requisição e também não pertence a esta limpeza de credenciais persistentes. O Local Host, o Remote Connection Host e o Remote Workspace Host constroem todos o mesmo tipo de Account Credential Store usando o Credential Service que já detêm, evitando que o comportamento de logout entre Hosts diverga novamente.

Os testes acrescentam primeiro as asserções de remoção do novo Store e só então modificam a implementação. Três arquivos de teste direcionados, totalizando 10 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 148. A Team Plan Request Key sai do Provider Service antigo

O problema de coesão de código deixado pelo item 146 foi resolvido. A resolução da Key em tempo de requisição dos Team Plans BigModel e Z.ai agora fica em um módulo independente `accountProviderTeamPlanRequestKey`:

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

O novo Account Request Auth Service depende diretamente desse módulo. O Snapshot antigo do Registry também chama a mesma implementação antes de ser retirado, de modo que o período de migração não forma dois algoritmos de Team Plan Key. O módulo não lê Provider Config, não mantém Registry e não cacheia Keys; ele trata apenas a autenticação de conta em tempo de requisição. A rejeição de JWT ZCode obsoleto pelo BigModel, a recuperação de organização a partir de uma seleção antiga apenas por project e o comportamento do Header de domínio de negócio do Z.ai permanecem iguais.

Os testes estabelecem primeiro a fronteira do módulo independente, cobrindo separadamente o fluxo completo de obtenção de `apiKey.secret` a partir de organização/projeto no BigModel e no Z.ai, e só então a implementação é movida. Três arquivos de teste relacionados, totalizando 141 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 149. O Prompt CLI / TUI desliga a Workspace Legacy Model Source

O Prompt CLI e a TUI já iniciam um Registry de nível de processo e importam a Provider Config antiga da CLI para a Personal Config na primeira inicialização. Mas, ao criar o App, as duas Entries injetavam apenas `providerRegistry`, sem definir explicitamente `workspaceProviderCompatibilityMode: "registry-only"`. O padrão de migração de `createZCodeApp()` continuava, portanto, montando a Workspace Legacy Compatibility Source: quando o novo Registry estava sem um Provider inteiro, a execução Standalone ainda podia reler o antigo Runtime Model Overlay.

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

A Config antiga da CLI participa apenas da importação única quando a Personal Config ainda não existe; depois da importação, os fatos de execução vêm só do Registry. Os testes acrescentam primeiro asserções de modo à montagem do App do Prompt Headless e da TUI, confirmam que antes da correção as duas Entries saíam, e só então modificam a implementação; os testes das duas entradas passaram. Os resultados das verificações estáticas de todo o repositório são registrados junto com o commit desta rodada, e o pre-push completo foi adiado por convicção.

## 150. A migração de Usage / Entitlement exige uma decisão independente

`BigModelUsageQuotaProvider` ainda lê diretamente o antigo `ModelProviderConfig[]`. Não se trata de um simples consumo de Provider View estático: o mesmo serviço mistura três fatos diferentes em um único objeto.

```text
旧 ModelProviderConfig
├─ label / endpoint / provider family      静态展示与路由
├─ enabled / 当前连接                      账号选择状态
└─ apiKey                                  请求期鉴权
```

Ao mesmo tempo, a semântica de consulta de Usage não equivale exatamente ao Registry atual: com o Team Plan ativo, o usuário ainda pode consultar explicitamente o Personal Coding Plan, e um Provider já desconectado e atualmente não selecionável também pode precisar exibir uso histórico ou um estado claramente não configurado. Trocar diretamente por `ModelSelectionView` confundiria o "conjunto de modelos atualmente selecionáveis" com as "fontes de uso consultáveis", e mudar diretamente para Account Request Auth enfiaria requisições de monitoramento de plano que não são de modelo na interface de requisição de modelos.

Por isso essa migração exige decidir primeiro a fronteira de domínio do Usage. A direção mais clara é estabelecer uma Usage Source / fronteira de Authorization independente: a informação estática de Provider é lida da nova projeção de Config/Settings, a Personal Key é lida do Account Credential Store e a Team Key reutiliza o Team Plan Request Key Resolver já extraído; se é permitido consultar fontes que não são a conexão atual e fontes desconectadas precisa ser decidido explicitamente pela semântica de produto do Usage. Antes dessa decisão, não se pode substituir o comportamento existente por um filtro de opcionalidade do Registry, nem afirmar que o Provider Service antigo já pode ser removido.

## 151. O teste de conectividade sai do hardcode de Reasoning por nome de modelo

O "testar conexão" da página de configurações já consegue obter o Model Config final a partir da `ProviderSettingsView` e projetar o `reasoningMapping` dele nas Provider Options de que a requisição de conectibilidade atual precisa. Mas a Probe antiga ainda adivinhava o `effort` do Anthropic e o `thinking.budgetTokens` com base no nome de modelo `GLM` e nas档 `low / high / max` quando o mapeamento estava ausente. Isso tornava a Probe um segundo fato de mapeamento fora da Official / Personal Model Config.

Esta rodada estreitou para uma única cadeia de dados:

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

O Request Body Builder interno da Probe não recebe mais um `thoughtLevel` genérico para traduzir por conta própria; ele apenas projeta as Provider Options já resolvidas pelo Model Config. Quando o mapeamento existe, Anthropic, OpenAI-compatible e OpenAI Responses mantêm os campos de wire originais; quando o mapeamento está ausente, nenhum parâmetro de reasoning é preenchido com base no nome do modelo.

Os testes mudaram primeiro o caso antigo de fallback de GLM para "não configurado, não enviar", confirmando que falhavam antes da modificação; em seguida o fallback e a entrada de tradução de `thoughtLevel` do Helper foram removidos. Ao todo, 148 testes do Helper de conectividade e do Provider Service passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 152. O editor de tarefas ociosas sai do fallback de Reasoning por nome GLM

As tarefas ociosas são um Provider execution-scoped, e seus modelos disponíveis e fatos estáticos de modelo são resolvidos pelo Host a partir de `client/configs.offPeak.allowed_models` e `builtinModels` em `allowedModelConfigs`. O Renderer já consegue ler diretamente os níveis de reasoning, mas o helper antigo ainda completava localmente `max / high / nothink` com base no nome de modelo `GLM-5.2` quando o metadata do modelo estava ausente.

Esta rodada removeu esse fallback por nome no Renderer. O comportamento agora é:

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

A mudança não força as tarefas ociosas a se tornarem um Provider Registry permanente; ela apenas garante que o chamador do Provider execution-scoped não reconstrua um segundo conjunto de fatos de modelo. Os testes acrescentam primeiro o caso que falha, de que o GLM-5.2 também não mostra níveis quando `allowedModelConfigs` está ausente, e só então removem o hardcode. Ao todo, 38 testes direcionados de opções de UI, Off-Peak Client Config e Runtime Model passaram. O pre-push completo foi adiado por convicção.

## 153. A entrada de refresh de Provider do Root passa para o novo Runtime

O Root chama o mesmo callback de refresh de Provider na inicialização, na migração de Provider Family, na recuperação de sessão OAuth, depois de um login bem-sucedido e após o logout. A seleção de modelos e a página de configurações já migraram para o novo Service, mas essa entrada do Root ainda lia `IModelProviderService.getAllCached()` sem condição e atualizava o Snapshot antigo de Presets, fazendo com que o novo Host continuasse executando na inicialização e nas mudanças de conta a cadeia de rede de Catalog/Preset que já perdeu a autoridade de decisão.

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

`cachedOnly` é apenas uma opção do período de migração da atualização do Snapshot antigo. Com o novo Service presente, o Root usa a barreira de prontidão do Facade e espera o Registry publicar a View da geração atual, sem disparar mais o antigo `getAll*`. Um novo teste unitário confirma que, com o novo Service montado, nenhum dos dois métodos antigos de leitura é chamado; 45 testes relacionados de OAuth do Root, do portão de inicialização e do Snapshot antigo passaram. O pre-push completo foi adiado por convicção.

## 154. A inicialização do novo Runtime para de aquecer Presets antigos

Depois que a entrada de refresh do Root saiu do Snapshot antigo, `createLocalServices()` continuava chamando `refreshPresetProviders()` em segundo plano e sem condição. Portanto, mesmo com o novo Host já montado com Official / Personal / Account Source, a inicialização ainda requisitava os antigos `release/latest` e `client/configs` e modificava o Provider Store antigo. Isso gerava requisições de rede duplicadas e mantinha o Preset antigo rodando como fato paralelo fora do novo Registry.

Esta rodada restringiu a fronteira de inicialização a:

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

A Account Source é responsável por si mesma pela atualização de disponibilidade da conta; a autenticação de requisição continua sendo obtida por requisição pelo Account Request Auth Service, e esta rodada não alterou a lógica de login, de plano ou de credenciais dinâmicas. Um novo teste de integração dos Local Services confirma que, havendo caminho de Official Config, a inicialização não acessa as interfaces antigas de Preset, preservando ao mesmo tempo a asserção existente de que o remote anexado ao desktop não aquece Presets antigos e acrescentando cobertura positiva de que a antiga Local Entry ainda executa o aquecimento de compatibilidade. Ao todo, 12 testes direcionados de Provider Runtime, Config Runtime e Local Services passaram. O pre-push completo foi adiado por convicção.

## 155. O teste de conectibilidade da página de configurações precisa de uma nova fronteira de execução no Host (adiado)

A projeção permanente de Provider da página de configurações já saiu dos Secrets de Account, mas quando o usuário clica em "testar conexão" ela ainda lê sob demanda o antigo `ModelProviderService.getAllCached()` e entrega o Endpoint, a API Key, os Headers e o objeto antigo de Provider completos para a Connectivity Probe antiga do lado do Renderer. Essa cadeia mantém duas responsabilidades que já saíram dos caminhos principais: o Renderer monta requisições de modelo e o Snapshot antigo de Provider fornece credenciais de requisição de Account.

As dependências reais de um API Provider comum, do Coding Plan e do Start Plan não são exatamente iguais:

```text
普通 API Provider
Renderer: providerId + modelId
       |
       v
Host: Registry 静态事实 + Personal API Key -> Connectivity Request

Coding Plan
Renderer: providerId + modelId
       |

Host: Registry 静态事实 + Account Request Auth -> Connectivity Request

Start Plan
Renderer: 交互取得本次一次性安全校验 Header
       |
       | providerId + modelId + 一次性 Header
       v
Host: Registry 静态事实 + Account Request Auth JWT -> Connectivity Request
```

A verificação de segurança da versão oficial depende de uma interação no nível da página e não pode ser transferida diretamente para o Host; por outro lado, o JWT, as Personal/Team Keys, o Endpoint, os atributos de modelo, os Option Specs e o reasoningMapping não devem continuar sendo montados pelo Renderer ou pelo Snapshot antigo. A interface alvo deve receber apenas `providerId`, `modelId` e o Header opcional desta interação, cabendo ao Host completar o restante da resolução e da requisição. Ela não pode continuar recebendo a Provider Config completa, sob pena de o chamador ainda poder contornar o Registry e produzir outro fato de execução.

O que aguardava decisão era a atribuição de serviço dessa operação:

- Estender `IProviderSettingsService.testModelConnectivity()`: conectividade tem, hoje, um único consumidor na página de configurações, a interface fica concentrada, mas isso adiciona uma responsabilidade de execução de rede a um Settings Facade que cuida apenas de Config/View.
- Criar um novo `IProviderConnectivityService` estreito: Settings continua gerenciando apenas configuração, e Connectivity depende separadamente do Registry, do Account Request Auth e do Adapter de requisição; no futuro, CLI/TUI que precisam de sondagem explícita could reuse diretamente, mas isso adiciona um Service/RPC.

Seja qual for a escolha, `@zcode/provider` continua sem IO; a implementação de execução fica em Services/Host, e o Renderer continua responsável apenas por obter o material interativo de verificação de segurança do Start Plan.

A decisão humana foi manter o status quo por enquanto no M2. O teste de conectibilidade só roda quando o usuário clica explicitamente na página de configurações, o resultado não modifica Registry, Config nem a disponibilidade de modelos; a nova Settings View continua fornecendo protocolo, Endpoint e fatos estáticos de modelo, e o Snapshot antigo apenas complementa sob demanda as credenciais de compatibilidade necessárias para esse teste. Por isso ele não afeta o Agent Loop normal, o Registry do Worker, a seleção de modelos nem CLI/TUI, e pode ser rebaixado a um assunto independente antes da remoção final do antigo `ModelProviderService`. Nenhum Connectivity RPC é adicionado agora, e essa dívida técnica局部 não bloqueia a Remote Provider Authority nem o restante do fechamento do M2.

## 156. A verificação de segurança da versão oficial sai do Snapshot antigo de Provider

A verificação de segurança da versão oficial no momento da requisição do Start Plan lia o Endpoint antigo de Provider por `ModelProviderService.getAllCached()`. Essa verificação é um fato estático de Provider e não precisa de API Key, JWT ou Snapshot antigo do Registry.

Agora a leitura segue a capacidade da Entry para a única fonte estática: o novo Provider Runtime lê `apiFormat/baseURL` de `ProviderSettingsView.effectiveConfig`, e apenas as entradas antigas sem o Provider Settings Service continuam usando o julgamento de compatibilidade com o Legacy Provider Snapshot. Quando o Provider Settings Service existe, um Provider ausente falha diretamente (fail closed), sem retorno ao Snapshot antigo. A implementação concreta e os testes direcionados ficam a cargo da manutenção da verificação de versão oficial; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 157. A verificação de segurança da versão oficial remove a dependência fantasma de Registry

A obtenção do material de verificação de segurança da versão oficial e a preparação do Header antes do envio chegou a exigir que o chamador informasse um `getProviderRegistrySnapshot` que nunca era lido, fazendo o Renderer parecer ainda acoplado ao Registry completo antigo. Esta rodada removeu esse parâmetro de contrato não utilizado e manteve apenas a dependência das entradas estáticas de Provider; o comportamento da entrada de compatibilidade já desativada `setProviderRuntimeHeaders` não mudou. O typecheck de todo o repositório passou e o lint voltou a 0 error com as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 158. O accessId de Account passa a incluir o escopo da conta conectada

A Account Source gerava antes IDs fixos de tipo de conexão para o Personal Coding Plan e o Start Plan, como `coding-plan:<providerId>`. Ao trocar a conta conectada na mesma máquina, esse ID não mudava, de modo que o Usage Cache, o Credential Store, o Account Config e os Models já criados não conseguiam distinguir as duas contas.

Esta rodada acrescentFooter uma identidade de conta não sensível ao final do ID de conexão de Plan/Team existente:

```text
<plan-connection-id>:account:<encoded-account-profile-id>
```

A identidade da conta vem do `id` estável do OAuth Profile, sem JWT, API Key, Header dinâmico e sem usar hash de Secret. O ID permanece o mesmo quando o Token ou a Runtime Key da mesma conta são renovados e precisa mudar ao trocar de conta. O Team Plan também passa a ter escopo de conta, mantendo organização e projeto no ID base original.

Quando um Account Provider já foi julgado available pelo entitlement, mas a Account Source não consegue obter a identidade da conta, esta rodada escolhe fail closed: a atualização lança erro e o AccountProviderService existente mantém o last-known-good, em vez de gerar um ID sem escopo que pudesse ser reutilizado entre contas. O Request Auth continua aceitando os IDs antigos sem escopo durante a migração, protegendo Models já criados, a Source de compatibilidade remota antiga e Sessions persistidas; a nova Account Source gera apenas a forma com escopo de conta. O sufixo de conta é removido antes da resolução da Team Key, para que o campo de conta não seja confundido com organization/project pela Team Key antiga de dois segmentos.

Os testes cobrem primeiro a troca de conta, a renovação de credenciais da mesma conta, a ausência de identidade de conta e a Request Auth de Personal/Start/Team, e só então a implementação é modificada. Treze testes direcionados de Account Connection, Config Source e Request Auth passaram; a verificação TypeScript dos Services passou. O pre-push completo foi adiado por convicção.

## 159. O Request Auth recusa trocar silenciosamente um Model antigo para uma nova conta
