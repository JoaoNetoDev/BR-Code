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

Os campos comuns são `kind`, `label`, `logoUrl`, `apiFormat`, `baseURL`, `headers`、`models` e `enabled`. O API Provider guarda adicionalmente `apiKey` e `apiKeyManagementUrl`; o Account Provider não pressupõe, por enquanto, campos de identidade não pesquisados. A identidade do Provider é fornecida pelo `providerId` externo; `label` serve apenas para exibição e tem fallback padrão para providerId.

`apiFormat`, `baseURL` e Headers estáticos são válidos tanto para API quanto para Account. JWT dinâmico, Runtime Key e Headers de verificação de segurança pontual não entram no Config. O antigo `source`, IDs de rastreamento de Catalog, timestamps, marcações `modified/deleted` e motivos de desativação pelo sistema também não são migrados; a semântica alvo desses campos foi substituída respectivamente pela origem na camada de configuração, pelo array `models` e pelo Account Access. O antigo `providerMappings.claude` já é removido pela lógica de migração do Store v2 atual e também não entra no novo Config.

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
   ├─ assina o Registry de processo
   ├─ AiSdkModelAdapter do App atual
   └─ ModelFactory

O Registry é uma visão factual de nível de processo; o Adapter e o Model Runtime são a composição de execução de nível App/Session. O M2.5c posterior faz cada `createZCodeApp` pegar emprestado o Registry de processo para criar seu próprio Model Runtime e fazer o dispose de forma simétrica quando o App é liberado. O próprio Registry só é liberado quando o Worker sai.

## 27. O Worker Registry começa como shadow runtime

O M2.5b já faz o Desktop Local Host injetar no Worker os caminhos de Official/Personal Config; o Worker inicia um Registry de nível de processo e mantém a atualização automática. CLI/TUI Standalone sem caminhos injetados e as entradas antigas mantêm o comportamento original; injetar apenas um dos dois caminhos recusa explicitamente a inicialização, evitando misturar acidentalmente um conjunto parcial de fontes da verdade.

Este passo não substitui imediatamente a ModelFactory de produção. A página de configurações atual ainda escreve a configuração antiga, e a migração Legacy Personal final do Local Host ainda não foi trocada atomicamente pela nova entrada de escrita; nesse momento, deixar o Worker executar diretamente com o novo Registry poderia obter uma Personal Config vazia. O M2.5c precisa avançar as seguintes ações como uma única sequência de commits:

```text
Bloquear a entrada antiga de escrita de Provider
        |
        v
Última migração para a Personal Config
        |
        v
Configurações e seleção passam a usar o novo Facade
        |
        v
Cada App cria Models usando o Worker Registry
        |
        v
Remover a leitura antiga de fatos de API Providers comuns
```

O shadow runtime apenas antecipa a validação da localização de arquivos, da propriedade de processo, do watcher e do ciclo de vida do Registry, sem formar um novo ramo de fato de negócio.

## 28. O App já suporta a projeção de execução exclusiva do Provider Runtime

`createZCodeApp` ganhou um Registry de processo injetável. Após a injeção, cada App cria seu próprio `ApiProviderModelRuntime`, toma emprestado o Registry de processo, possui seu próprio `AiSdkModelAdapter` e ModelFactory e libera as assinaturas quando o App fecha. Sem injeção, continua sendo usado o Runtime Model Factory original.

Atualmente o Workspace/Turn Model Overlay chamava `replaceRegistryConfig()` diretamente. O novo modo estabelece explicitamente que a propriedade de toda a projeção de execução do Adapter pertence ao Provider Model Runtime; o Overlay ainda pode manter o estado de Session do período de migração e os dados da projeção antiga, mas não sobrescreve mais o Adapter Registry. `createModelAdapter` também passa a aceitar diretamente um Registry de execução inicial vazio e gerenciado externamente, de modo que o novo modo não precisa construir uma vez os fatos de Provider a partir do antigo Runtime Model Config.

```text
legacy app
└─ Runtime Model Overlay -> Adapter execution registry

provider-registry app
├─ Runtime Model Overlay -> mantém apenas o estado de compatibilidade da interação antiga
└─ ApiProviderModelRuntime -> Adapter execution registry
```

A entrada de protocolo ainda não habilitou esta opção. O Turn Overlay hoje também carrega Providers de execution-scoped, como tarefas ociosas; se a opção fosse habilitada antecipadamente, a nova ModelFactory não encontraria o Provider temporário no Registry de processo. Antes de abrir a chave de produção, é preciso fazer os Providers temporários criarem Models pela entrada execution-scoped do ModelFactory unificado, ou manter um ramo de execução temporária com fronteira bem definida.

## 29. A antiga entrada de escrita de configurações conclui o cutover da Personal Config por ponte unidirecional

A página de configurações ainda não migrou para o novo Settings Facade, mas o Worker já lê de forma independente a nova Personal Config. Para que essas duas fatias possam entrar em produção consecutivamente, o Local Host, depois de uma escrita bem-sucedida em `IModelProviderService.save/delete`, converte a lista estática atual de Providers do usuário em um Personal Overlay e substitui atomicamente a nova Personal Config. Em seguida o Registry é explicitamente atualizado, de modo que, quando a chamada antiga de configurações retorna, a nova fonte da verdade já está consistente com o que o Worker vai ler.

Esta ponte trata apenas de salvamentos e exclusões explicitamente disparados pelo usuário e não assina o antigo Snapshot do Registry. Por isso, renovação de conta, mudanças de plano, material de verificação de segurança pontual, Headers temporários e Runtime Keys copiadas não são persistidos. Quando o arquivo Personal ainda não existe, o Config Runtime continua executando o mesmo conversor para a migração inicial; depois que o arquivo existe, a lista estática completa de cada operação de escrita do usuário passa a ser a referência para regenerar a diferenças esparsa.

```text
Antiga página de configurações save / delete
          |
          v
O Service antigo conclui a escrita de compatibilidade
          |
          v
Legacy Personal Importer
          |
          v
Substituição atômica da Personal Config
          |
          v
Atualizar o Registry do Local Host

Worker watcher
          |
          v
Atualizar o Registry do Worker
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
└─ lê apenas o process Provider Registry
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
Decisão de Account / Plan no Host
        |
        | providerId + modelIds + accountAccessId
        v
Worker Mutable Account Source
        |
        v
Worker Provider Registry
        |
        | fatos estáticos do Account Model
        v
ModelFactory

Snapshot antigo do Workspace
└─ por enquanto fornece ao Adapter apenas API Key / JWT / Runtime Header
```

Essa ordem garante que, quando a criação da Session ocorre logo após a requisição de atualização, o Worker Registry já enxerga o Account Provider. As Properties, Option Specs, Options padrão e o reasoningMapping do Account Model vêm todos da Official Config; os campos de capacidade dos modelos de mesmo nome no Snapshot antigo não participam mais da criação de Models.

As credenciais de requisição ainda não concluíram a migração final. Como o Adapter atual resolve e segura o SDK Model correspondente no momento da criação do Model, um Model já criado do Coding Plan não troca de credenciais no lugar quando o Registry é atualizado depois; o Start Plan ainda usa, antes de cada requisição, o canal de refresh existente do Header de verificação de segurança pontual. A próxima fatia precisa criar o Request Auth Service com um `accountAccessId` fixo e então remover os Secrets de conta do Snapshot antigo do Workspace e o `fallbackSource`. Até lá, a projeção de execução antiga não deve ser descrita como nova fonte da verdade do Registry.

## 35. A identidade do Account Access é fixada dentro do Model e chega até a fronteira da requisição

Na criação de um Account Model, o `accountAccessId` atualmente publicado pelo Registry é gravado na configuração privada de execução do Model no Adapter. O chamador de negócio continua a submeter apenas o `ModelRequest` genérico; ele não lê a conexão da conta nem transmite o Access ID. O Adapter anexa esse ID ao chamar o Runtime Header Port existente em cada tentativa real de rede, e o Worker o repassa ao Host por um protocolo estrito.

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
├─ campos estáticos do API Provider e Model Config ──> objeto de exibição compatível da página de configurações
└─ Account Provider
   └─ por enquanto reaproveita do objeto antigo o estado de plano, conexão e interação de produto
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

Depois de salvar, o Provider Store antigo ainda grava o mesmo resultado para os consumidores ainda não migrados, mas a sincronização reversa da Personal Config é desligada. A leitura da Key já salva também prioriza a Configuração Effective da Settings View; só recorre à lista antiga quando o novo serviço não está montado ou ainda não contém esse Provider. O modo Provider Family, a seleção de modelos recentes do App e o estado de conclusão do Welcome continuam sendo gerenciados pelo estado de interação original, e esta fatia não altera essas semânticas de produto.

## 48. A restauração de Custom Model volta a usar a Selection View para julgar quais modelos são selecionáveis

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

Esta fatia completa apenas a montagem física da fonte da verdade. O Model padrão do App Standalone, a lista `/model` e a Selection da Session ainda leem a Runtime Config antiga; Providers que o novo Registry ainda não contém continuam sendo executados pela workspace compatibility source do M2.5. A próxima fatia precisa concluir a importação única das diferenças dos Personal Providers antigos da CLI e mudar a visualização e a seleção de modelos do Standalone para a Registry View; só então essa leitura antiga de fatos pode ser removida.

## 53. A migração do Standalone lê apenas as definições antigas de Providers do usuário

A Config antiga da CLI carrega vários domínios ao mesmo tempo: Provider, seleção de modelo atual, overrides de projeto, MCP, Hooks e outros. A migração de Personal Providers lê apenas o `provider` declarado explicitamente no arquivo de usuário antigo; `model` é Selection, e configuração de projeto, variáveis de ambiente e parâmetros de CLI são overrides de execução — nenhum deles pode ser fixado como Environment Personal Config.

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
O Registry já possui o Provider
├─ os modelos candidatos vêm da Registry View
├─ Properties / Option Specs vêm do ModelConfig
├─ o nível de reasoning é entregue à nova ModelFactory via ModelRef.variant
└─ a troca explícita atualiza apenas o estado de execução da Session e a Session Selection

O Registry ainda não possui o Provider
└─ o Provider inteiro continua usando a M2.5 compatibility source
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

Esta fatia estreita o julgamento de target da Workspace Source para os membros do próprio workspace overlay e renomeia o nome ambíguo `fallbackSource` do Model Runtime para `workspaceCompatibilitySource`. A prioridade das fontes permanece: o Model temporário do Turn vem antes do Registry, e o modelo de compatibilidade do Workspace só é usado quando o Registry está sem o Provider inteiro. A escrita por protocolo, a troca em tarefas ociosas e o antigo workspace snapshot ainda não foram removidos; desta vez se estabelece apenas a fronteira precisa que o M2.8 poderá retirar item a item.

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

As requisições de modelo do Repo Wiki já entram no Worker Model unificado, mas o Host, antes da geração, ainda resolvia provider, modelo, saída máxima e nível de reasoning pelo antigo `IModelProviderService.getProviderRegistrySnapshot()`, mantendo uma segunda fonte da verdade na configuração que antecede a execução local.

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

O `ProviderRuntime` criava o `ProviderConfigRuntime` internamente no construtor. Isso fazia com que o Config Service só pudesse ser obtido depois de o Registry ser construído, e o verdadeiro Account Provider Service não conseguia depender do mesmo estado de Official/Personal Config, lendo arquivos por desvio ou continuando projetando ao contrário do Snapshot antigo do Registry.

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

O portão de inicialização agora escolhe uma única fonte conforme a capacidade da Entry: o novo Host, que tem o Model Selection Service montado, lê apenas a Model Selection View; as entradas antigas sem esse serviço continuam usando o Legacy Snapshot. Como a própria Registry View contém apenas os Providers/Models atualmente selecionáveis, o portão só precisa verificar se existe pelo menos um modelo. Quando o Registry confirma uma View vazia, não há retorno ao Provider antigo; quando o Registry ainda não está hidratado, o Snapshot antigo já hidratado também não é usado para liberar a inicialização antecipadamente. O log passa a incluir `source: registry | legacy`,o que facilita confirmar a fronteira efetiva.

Se o carregamento da Model Selection View falhar no novo Host, o Selection Snapshot permanece não hidratado e o portão de inicialização não passa a ler o Snapshot antigo. Nesse caso, a aplicação continua no estado de espera de Provider na inicialização e registra um error; mais adiante pode ser adicionada uma interface de falha de carregamento do Registry voltada ao usuário, mas a antiga fonte da verdade não pode ser usada como caminho de recuperação.

O mesmo recorte também aperta o comportamento de atualização após o login por API Key. Quando o novo Host salva uma API Key, o Provider Settings Facade grava a Personal Config, atualiza o Registry e publica uma nova Selection View por assinatura; o formulário não chama mais o antigo `getAll()` por conta própria. Somente as entradas antigas sem o Provider Settings Service continuam atualizando ativamente o Legacy Snapshot. A escrita do espelho antigo de Provider é mantida por enquanto para os consumidores de compatibilidade ainda não migrados, mas deixa de participar da decisão de inicialização do novo Host.

## 98. Remover a sincronização reversa de estado estável do Provider Store antigo para a Personal Config

No início da migração, para trocar a entrada de escrita o mais rápido possível, o antigo `ModelProviderService.save/delete()` podia reimportar toda a lista antiga de Providers na Personal Config por meio de `onUserProviderConfigChanged`. A nova entrada de Settings já está estável na ordem oposta: escreve primeiro a Personal Config pelo Provider Settings Facade e depois tenta atualizar o espelho no Store antigo. Manter o callback reverso faria o espelho de compatibilidade voltar a ser entrada da nova fonte da verdade, e uma modificação local dispararia a sobrescrita de toda a tabela.

Esta rodada removeu `onUserProviderConfigChanged`, a flag `syncPersonalConfig` e `ProviderRuntime.syncLegacyPersonalProviders()`. O salvamento e a exclusão do antigo `ModelProviderService` agora mantêm apenas o Store antigo; no novo Host, a Personal Config só é escrita pelo Provider Settings/Config Service. As entradas antigas sem o novo Settings Service mantêm o comportamento original do Store antigo, sem afetar o novo Registry.

A primeira migração continua existindo em `NodePersonalProviderConfigRepository`: `importLegacy` só é chamado quando o arquivo de Personal Config não existe, e, depois de gravar o documento versionado, os reinícios seguintes do processo leem diretamente esse arquivo. Um novo teste de reinício verifica explicitamente que, quando já existe Personal Config, o Store antigo de Providers não é lido novamente. Isso forma o seguinte timing unidirecional:

```text
Primeira inicialização e Personal Config inexistente
Provider Store antigo -> importLegacy -> Personal Config

Functionamento normal
Settings -> Personal Config -> Registry
        `-> Provider Store antigo (espelho de compatibilidade, falha não reverte os fatos novos)
```

## 99. O menu de modelos do Account Provider não decide mais a conexão em duplicidade

A Account Source já escolheu a conexão executável atual com base na conta, no entitlement e nas configurações de Family, e entregou o `accessId` fixo e o conjunto de modelos ao Registry. O menu de modelos, porém, ainda escolhia Start, Individual ou Team por meio dos dados antigos de Provider Family e por isso podia chegar a um resultado diferente do Registry.

O novo Host agora projeta diretamente o Registry Account Provider como grupo de modelos. A projeção antiga do mesmo Provider ID é excluída, e o `accessId` serve apenas para exibir a insígnia Start, Individual ou Team, sem participar da escolha de conexão. O antigo Family Builder atende apenas o caminho de compatibilidade das entradas antigas que ainda não entraram no Registry.

```text
Account settings + entitlement
              |
              v
Account Config -> Registry Account Provider -> Renderer model group
                                                `-> accessId gera apenas a insignia
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

## 105. O julgamento estático de Provider no Composer segue o Registry

O Composer ainda precisa do antigo `useModelProviders()` para o estado dinâmico de Usage, Entitlement e funil de compra do Coding Plan/Start Plan; isso não significa que a lista antiga de Providers possa continuar participando das decisões sobre fatos estáticos de modelos. A implementação anterior combinava o Provider antigo e a `ModelSelectionView` com `OR` e priorizava o label antigo. Assim, um Provider já filtrado pelo Registry ainda podia ser reconhecido como custom Provider recuperável e, após uma falha ao salvar a configuração, seguir pelo caminho antigo de recuperação.

Agora, assim que a `ModelSelectionView` é publicada, o Composer julga a existência do Provider e lê o label do Provider apenas a partir daquela revision, e usa `config.kind === "api"` para decidir a elegibilidade de recuperação custom. Uma View vazia do Registry recusa a recuperação de Providers remanescentes na lista antiga; as entradas de compatibilidade sem a View montada continuam usando o julgamento antigo. O Hook antigo permanece por enquanto no componente, mas sua responsabilidade fica restrita ao estado de runtime de Plan/Usage ainda não migrado e deixa de ser uma fonte de verdade paralela para identidade de modelo e selecionabilidade.

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

O julgamento de opcionalidade do Configured Default reutiliza a mesma função de validação de Option e não implementa mais um julgamento de faixa separado. Os testes de domínio cobrem combinações válidas, Reasoning inválido, Reasoning Spec ausente, saída fora do intervalo e valores de saída não positivos construídos diretamente.

O `ProviderRegistryModelSource` do Bootstrap também foi estreitado para exigir `validateSelection()`. A inicialização de uma nova Session e o `setModel` ativo leem esse resultado de validação antes de criar a Registry Selection: quando o Provider inteiro ainda não foi migrado, o caminho de compatibilidade de Providers antigos continua acessível; quando falta o Model, o retorno é `ModelNotFound`; quando a Option é inválida, o retorno é `InvalidModelRequest`. A restauração de Sessions históricas continua usando a busca tolerante e não reescreve a intenção do usuário persistida no passado só porque as Option Specs de hoje mudaram.

## 112. A atualização de Account sai da difusão completa antiga do Registry

O `AccountProviderService` do Local Host já recalcula a terceira camada de Account Config a partir da Config, das configurações de conta, do Credential Port e das interfaces de plano, mas o momento da atualização ainda assinava o antigo `onDidChangeProviderRegistry`. Essa difusão inclui ao mesmo tempo salvamento/exclusão de Providers comuns, runtime headers e atualização de planos, de modo que operações sem relação também voltavam a consultar entitlement de conta e a nova Account Source continuava dependente do Registry antigo em termos de ciclo de vida.

Esta rodada acrescenta duas notificações estreitas, usadas apenas dentro do processo do Host. `ObservableSettingService.onDidUpdate` publica os campos desta gravação depois que o serviço de configurações grava por baixo com sucesso; a raiz de composição observa apenas domínio de conta, modo de Family, seleção de conexão Personal/Team e endpoint do ZCode. `ModelProviderServiceRuntime.onDidInvalidateAccountProviderFacts` publica apenas login pré-configurado, entrada de planos, Coding Plan Key e mudanças de disponibilidade. As duas chamam `AccountProviderService.refresh()`, e os erros de atualização continuam sendo registrados pelo evento de erro do Service, preservando o last-known-good.

A raiz de composição de produção deixa de assinar o change event antigo do Registry. Edições de Providers comuns e runtime headers continuam publicando eventos de compatibilidade do Registry antigo, mas não disparam atualização de Account. Novos testes fixam que a notificação de configurações precisa acontecer depois de uma gravação bem-sucedida, que operações de Providers comuns não publicam Account Facts e que o filtro, a atualização e a liberação das duas notificações estreitas funcionam. Editar manualmente o antigo `setting.json` continua sem watcher; esse arquivo é hoje entrada de migração do estado de conexão de conta, e o modelo oficial de estado de conta continuará a reunir sua persistência e sua fronteira de atualização entre processos.

## 113. O julgamento de plano das tarefas ociosas passa a ler o Account Overlay

A página inicial das tarefas ociosas julgava antes, pelo antigo `ModelProviderConfig[]`, se o usuário possuía um Coding Plan. Ela precisava entender ao mesmo tempo `enabled`, `systemDisabledReason`, o ID do Provider de Personal Coding Plan e o ID dinâmico do Provider de Team Plan, ou seja, reimplementava no Renderer a interpretação de Account Access. Entradas remanescentes no Provider Store antigo também podiam fazer com que um plano já inválido continuasse sendo tratado como disponível.

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

O parâmetro de Provider antigo do parser de compatibilidade passou a ser opcional, existindo apenas para que as Entries ainda não migradas o passem explicitamente. O ponto de chamada do Subagent não passa mais o array vazio e também não restaura fatos antigos de Provider quando falta a View. Os testes passaram a usar a Registry Selection View para verificar os níveis de reasoning sem Workspace e cobrem o comportamento de continuar usando a last-known View durante a atualização da View.

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

A atualização da API Key sob o mesmo accessId não altera mais a impressão digital vista pelo Renderer. As operações de autenticação, compra e configuração já chamam explicitamente a atualização de entitlement; qualquer nova entrada de atualização de credenciais adicionada futuramente também terá de notificar os consumidores pelo evento de estado correspondente ou por um refresh explícito, sem voltar a projetar secrets na UI para criar detecção de mudança. Esta fatia não alterou o protocolo de requisição do Usage Service.

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
config.json / model-providers.json antigos
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
API Provider Builtin antigo
├─ API Key                         -> Personal
├─ configuração de modelo com modified=true       -> Personal ModelConfigRule
└─ label / endpoint / models etc.                -> não migrado, continua decidido pelo Official

Account Provider Builtin antigo
├─ configuração de modelo com modified=true       -> Personal ModelConfigRule
└─ campos estáticos / disponibilidade / credenciais -> não migrado
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
O Renderer e o lado de execução consomem o valor final
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
└─ operação independente acionada explicitamente pelo usuário
```

Essa remoção evita que a lista remota de Providers volte a ser uma fonte candidata de fatos para a página de configurações e não altera a cadeia de compatibilidade de Workspace Snapshot ainda usada pelo remote anexado ao desktop. Três arquivos de teste de Services e da página de configurações, totalizando 343 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa de pre-push ficou para uma rodada posterior concentrada.

## 137. O conjunto de modelos do Start Plan sai do hardcode da UI e do Store antigo

O Shared mantinha dois modelos gratuitos em `ZAI_START_PLAN_FREE_MODELS`. A projeção antiga de Provider Snapshot do campo de entrada filtrava os modelos do Start Plan com essa constante, a página de configurações construía um Provider placeholder com ela e o Provider Store antigo, quando a sincronização remota falhava, gravava Z.ai e BigModel Start Plan na configuração antiga com base nela. Essas três lógicas sobrescrevem ou falsificam fatos oficiais: a Official Config já declara modelos estáticos e o Account Overlay dá os membros realmente disponíveis conforme o entitlement atual.

Esta rodada removeu a constante e seus três tipos de consumidor. A cadeia oficial de fatos é agora:

```text
Official Provider / Model Config
              +
Account ProviderConfigMap atual
              |
              v
       Provider Registry View
              |
              v
        projeção de configurações e seleção de modelos
```

Enquanto a Registry View ainda não está hidratada, a projeção de compatibilidade apenas encaminha os modelos que já existem no Snapshot antigo de Provider a montante, sem decidir duas vezes com base no nome do modelo e na marca `modified`. O fallback de falha de rede do Store antigo ainda pode complementar API Key Providers e o ZAPI interno, mas não cria mais Account Providers a partir de constantes locais de modelos; sem fatos de Account obtidos, o Start Plan deve permanecer indisponível.

Novos testes de regressão provam primeiro que a implementação antiga filtrava os modelos a montante e falsificava o Start Plan, e só então concluem a modificação de produção. Quatro arquivos de teste de UI e Services, totalizando 340 testes, passaram; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. A execução completa
de pre-push por convicção atual foi adiada para uma rodada concentrada.

## 138. O Local Host deixa de sobrescrever o Registry do Worker com o Snapshot antigo

Ao investigar a cadeia local de criação de Session, descobriu-se que, embora Host e Core Worker já estejam montados com um Provider Registry de nível de processo, o Host ainda derivava `runtimeModel` do Snapshot antigo do `ModelProviderService` e o enviava ao Worker nas entradas create/resume/set/send. A CLI registrava essa entrada como uma execution-scoped Model Source; portanto, a execução de modelos comuns do mesmo Environment ainda era controlada pelo Snapshot antigo, e o Registry Official, Personal e Account mantido pelo próprio Worker não se tornava a autoridade de execução.

Esta rodada separou as duas responsabilidades do Host:

```text
ModelSelectionView
├─ julgar se a execução local de modelos está pronta
├─ acordar o Worker em espera quando a View vazia se tornar utilizável
└─ não gerar runtimeModel

Snapshot antigo do Provider Registry
├─ compatibilidade com o remote anexado ao desktop
├─ compatibilidade com chamadas antigas explícitas
└─ não participa da execução local que já montou o novo Provider Runtime
```

As entradas locais de Session agora enviam apenas `ModelSelection` e o nível de thought. O Worker consulta o próprio Registry de nível de processo na criação do Loop, e atualizações de Provider Config só afetam Models criados depois; o ciclo de vida dos Models já criados não muda. O `runtimeModel` execution-scoped trazido explicitamente pelo chamador é mantido, de modo que Providers temporários do período de migração, como os das tarefas ociosas, não foram removidos por esta mudança.

Durante a implementação também se descobriu que `createLocalServices()` criava a `AccountProviderConfigSource` oficial, mas o que era passado ao `ZCodeAgentService` continuava sendo apenas a Legacy Source usada pelo remote anexado ao desktop. Essa omissão faria com que a sincronização local de `provider/updateAccountConfig` nunca obtivesse o novo Account Overlay. Esta rodada conecta a Source oficial ao Agent Service; o remoto continua usando a Legacy Source quando não tem um Registry de mesma origem, sem ampliar a fronteira desta migração.

O antigo Fake Agent de testes ligava o pedido de runtime preferences depois de `workspace/updateProviderRegistry`, e a cold subscription do V4 ainda afirmava que o Host enviaria primeiro o Snapshot completo. Os dois testes foram alterados para a semântica de Registry de nível de processo: as runtime preferences são pedidas na fase de materialização de runtime da criação da session, e a cold subscription usa o Snapshot antigo apenas como portão de inicialização.

## 139. O pré-aquecimento do Repo Wiki local sai do Workspace Snapshot antigo

O menu de modelos e os Option Specs do Repo Wiki já vêm da `ModelSelectionView`, mas o pré-aquecimento de rascunhos de projetos ainda não ativados sincronizava incondicionalmente o Registry completo antigo e fazia o Host resolver o `runtimeModel` do mesmo modelo. O Worker local já tem o próprio Registry de processo como autoridade de execução, de modo que esses dois passos reintroduziam uma segunda fonte da verdade.

Esta rodada roteou por tipo de Workspace:

```text
Aquecimento do Repo Wiki local
└─ preferredModel / ModelSelection -> Worker Registry

Aquecimento do remote anexado ao desktop
├─ sincronizar o antigo Workspace Registry Snapshot
├─ resolver o runtimeModel de compatibilidade
└─ criar o rascunho de Session remoto
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

Agora o create do V4 local envia apenas provider/model/thought da config; somente o alvo desktop-attached remote com `workspaceIdentity` continua resolvendo e anexando o runtimeModel. Não foi usado `workspacePath` para julgar se o alvo é remoto, em conformidade com a restrição de que o isolamento de identidade remota precisa trazer `workspaceIdentity`. Os 90 testes do task adapter cobrem as zero chamadas locais e a injeção do runtimeModel de compatibilidade remoto.

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
Opção A: retransmissão temporária pelo Renderer

Remote Worker -> Remote Host -> Renderer
                              -> Local Host Auth Service
                              -> Remote Host -> Remote Worker

Opção B: retransmissão direta pelo Host

Remote Worker -> Remote Host -> Local Host Auth Broker
                              -> Remote Host -> Remote Worker
```

A opção A pode reutilizar o fato de que o Renderer já detém simultaneamente os services Local e Remote e é consistente com a posição da ponte atual de Header de verificação de segurança pontual; exige adicionar um serviço estreito de Account Request Auth no Local Host e permitir que o Auth Material pontual passe pela memória do Renderer. A opção B tem responsabilidades de processo mais puras e o Renderer não toca no Auth Material, mas o Local Host e o Remote
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
IAccountRequestAuthService (privado do Local Host)
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
├─ Provider Store antigo
│  └─ limpar as cópias de migração de Start / Coding Plan
└─ Account Credential Store
   └─ excluir a Personal Key coding-plan:<providerId>
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
├─ validar a organization / project selecionados
├─ localizar ou criar zcode-team-api-key
├─ copiar o Secret
└─ retornar a Key usada nesta requisição
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
        X não é mais montado
```

A Config antiga da CLI participa apenas da importação única quando a Personal Config ainda não existe; depois da importação, os fatos de execução vêm só do Registry. Os testes acrescentam primeiro asserções de modo à montagem do App do Prompt Headless e da TUI, confirmam que antes da correção as duas Entries saíam, e só então modificam a implementação; os testes das duas entradas passaram. Os resultados das verificações estáticas de todo o repositório são registrados junto com o commit desta rodada, e o pre-push completo foi adiado por convicção.

## 150. A migração de Usage / Entitlement exige uma decisão independente

`BigModelUsageQuotaProvider` ainda lê diretamente o antigo `ModelProviderConfig[]`. Não se trata de um simples consumo de Provider View estático: o mesmo serviço mistura três fatos diferentes em um único objeto.

```text
ModelProviderConfig antigo
├─ label / endpoint / provider family      exibição estática e roteamento
├─ enabled / conexão atual                 estado de seleção de conta
└─ apiKey                                  autenticação em tempo de requisição
```

Ao mesmo tempo, a semântica de consulta de Usage não equivale exatamente ao Registry atual: com o Team Plan ativo, o usuário ainda pode consultar explicitamente o Personal Coding Plan, e um Provider já desconectado e atualmente não selecionável também pode precisar exibir uso histórico ou um estado claramente não configurado. Trocar diretamente por `ModelSelectionView` confundiria o "conjunto de modelos atualmente selecionáveis" com as "fontes de uso consultáveis", e mudar diretamente para Account Request Auth enfiaria requisições de monitoramento de plano que não são de modelo na interface de requisição de modelos.

Por isso essa migração exige decidir primeiro a fronteira de domínio do Usage. A direção mais clara é estabelecer uma Usage Source / fronteira de Authorization independente: a informação estática de Provider é lida da nova projeção de Config/Settings, a Personal Key é lida do Account Credential Store e a Team Key reutiliza o Team Plan Request Key Resolver já extraído; se é permitido consultar fontes que não são a conexão atual e fontes desconectadas precisa ser decidido explicitamente pela semântica de produto do Usage. Antes dessa decisão, não se pode substituir o comportamento existente por um filtro de opcionalidade do Registry, nem afirmar que o Provider Service antigo já pode ser removido.

## 151. O teste de conectividade sai do hardcode de Reasoning por nome de modelo

O "testar conexão" da página de configurações já consegue obter o Model Config final a partir da `ProviderSettingsView` e projetar o `reasoningMapping` dele nas Provider Options de que a requisição de conectibilidade atual precisa. Mas a Probe antiga ainda adivinhava o `effort` do Anthropic e o `thinking.budgetTokens` com base no nome de modelo `GLM` e nos níveis `low / high / max` quando o mapeamento estava ausente. Isso tornava a Probe um segundo fato de mapeamento fora da Official / Personal Model Config.

Esta rodada estreitou para uma única cadeia de dados:

```text
Model Config default reasoning level
        |
        | localizar o reasoningMapping do mesmo nível
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
allowedModelConfigs contém o modelo alvo e o reasoning
        |
        v
exibir os níveis e o valor padrão declarados pela configuração remota

allowedModelConfigs não contém o modelo alvo nem o reasoning
        |
        v
não exibir as opções de reasoning
```

A mudança não força as tarefas ociosas a se tornarem um Provider Registry permanente; ela apenas garante que o chamador do Provider execution-scoped não reconstrua um segundo conjunto de fatos de modelo. Os testes acrescentam primeiro o caso que falha, de que o GLM-5.2 também não mostra níveis quando `allowedModelConfigs` está ausente, e só então removem o hardcode. Ao todo, 38 testes direcionados de opções de UI, Off-Peak Client Config e Runtime Model passaram. O pre-push completo foi adiado por convicção.

## 153. A entrada de refresh de Provider do Root passa para o novo Runtime

O Root chama o mesmo callback de refresh de Provider na inicialização, na migração de Provider Family, na recuperação de sessão OAuth, depois de um login bem-sucedido e após o logout. A seleção de modelos e a página de configurações já migraram para o novo Service, mas essa entrada do Root ainda lia `IModelProviderService.getAllCached()` sem condição e atualizava o Snapshot antigo de Presets, fazendo com que o novo Host continuasse executando na inicialização e nas mudanças de conta a cadeia de rede de Catalog/Preset que já perdeu a autoridade de decisão.

Agora o Root escolhe uma única fronteira de refresh conforme a capacidade da Entry:

```text
Host novo
Root refresh
    |
    v
ProviderSettingsService.refresh()
    |
    +-- Official / Personal Config Source
    +-- Account Provider Source
    `-- Provider Registry

Entry antiga
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
Provider Runtime já montado
    |
    +-- Official Config
    +-- Personal Config
    `-- Account Source
            |
            v
         Registry

Entry antiga sem Provider Runtime montado
    |
    v
Aquecimento de Legacy Preset
```

A Account Source é responsável por si mesma pela atualização de disponibilidade da conta; a autenticação de requisição continua sendo obtida por requisição pelo Account Request Auth Service, e esta rodada não alterou a lógica de login, de plano ou de credenciais dinâmicas. Um novo teste de integração dos Local Services confirma que, havendo caminho de Official Config, a inicialização não acessa as interfaces antigas de Preset, preservando ao mesmo tempo a asserção existente de que o remote anexado ao desktop não aquece Presets antigos e acrescentando cobertura positiva de que a antiga Local Entry ainda executa o aquecimento de compatibilidade. Ao todo, 12 testes direcionados de Provider Runtime, Config Runtime e Local Services passaram. O pre-push completo foi adiado por convicção.

## 155. O teste de conectibilidade da página de configurações precisa de uma nova fronteira de execução no Host (adiado)

A projeção permanente de Provider da página de configurações já saiu dos Secrets de Account, mas quando o usuário clica em "testar conexão" ela ainda lê sob demanda o antigo `ModelProviderService.getAllCached()` e entrega o Endpoint, a API Key, os Headers e o objeto antigo de Provider completos para a Connectivity Probe antiga do lado do Renderer. Essa cadeia mantém duas responsabilidades que já saíram dos caminhos principais: o Renderer monta requisições de modelo e o Snapshot antigo de Provider fornece credenciais de requisição de Account.

As dependências reais de um API Provider comum, do Coding Plan e do Start Plan não são exatamente iguais:

```text
API Provider comum
Renderer: providerId + modelId
       |
       v
Host: fatos estáticos do Registry + Personal API Key -> Connectivity Request

Coding Plan
Renderer: providerId + modelId
       |

Host: fatos estáticos do Registry + Account Request Auth -> Connectivity Request

Start Plan
Renderer: obtém interativamente o Header de verificação de segurança pontual
       |
       | providerId + modelId + Header pontual
       v
Host: fatos estáticos do Registry + Account Request Auth JWT -> Connectivity Request
```

A verificação de segurança da versão oficial depende de uma interação no nível da página e não pode ser transferida diretamente para o Host; por outro lado, o JWT, as Personal/Team Keys, o Endpoint, os atributos de modelo, os Option Specs e o reasoningMapping não devem continuar sendo montados pelo Renderer ou pelo Snapshot antigo. A interface alvo deve receber apenas `providerId`, `modelId` e o Header opcional desta interação, cabendo ao Host completar o restante da resolução e da requisição. Ela não pode continuar recebendo a Provider Config completa, sob pena de o chamador ainda poder contornar o Registry e produzir outro fato de execução.

O que aguardava decisão era a atribuição de serviço dessa operação:

- Estender `IProviderSettingsService.testModelConnectivity()`: conectividade tem, hoje, um único consumidor na página de configurações, a interface fica concentrada, mas isso adiciona uma responsabilidade de execução de rede a um Settings Facade que cuida apenas de Config/View.
- Criar um novo `IProviderConnectivityService` estreito: Settings continua gerenciando apenas configuração, e Connectivity depende separadamente do Registry, do Account Request Auth e do Adapter de requisição; no futuro, CLI/TUI que precisam de sondagem explícita poderiam reutilizar diretamente, mas isso adiciona um Service/RPC.

Seja qual for a escolha, `@zcode/provider` continua sem IO; a implementação de execução fica em Services/Host, e o Renderer continua responsável apenas por obter o material interativo de verificação de segurança do Start Plan.

A decisão humana foi manter o status quo por enquanto no M2. O teste de conectibilidade só roda quando o usuário clica explicitamente na página de configurações, o resultado não modifica Registry, Config nem a disponibilidade de modelos; a nova Settings View continua fornecendo protocolo, Endpoint e fatos estáticos de modelo, e o Snapshot antigo apenas complementa sob demanda as credenciais de compatibilidade necessárias para esse teste. Por isso ele não afeta o Agent Loop normal, o Registry do Worker, a seleção de modelos nem CLI/TUI, e pode ser rebaixado a um assunto independente antes da remoção final do antigo `ModelProviderService`. Nenhum Connectivity RPC é adicionado agora, e essa dívida técnica local não bloqueia a Remote Provider Authority nem o restante do fechamento do M2.

## 156. A verificação de segurança da versão oficial sai do Snapshot antigo de Provider

A verificação de segurança da versão oficial no momento da requisição do Start Plan lia o Endpoint antigo de Provider por `ModelProviderService.getAllCached()`. Essa verificação é um fato estático de Provider e não precisa de API Key, JWT ou Snapshot antigo do Registry.

Agora a leitura segue a capacidade da Entry para a única fonte estática: o novo Provider Runtime lê `apiFormat/baseURL` de `ProviderSettingsView.effectiveConfig`, e apenas as entradas antigas sem o Provider Settings Service continuam usando o julgamento de compatibilidade com o Legacy Provider Snapshot. Quando o Provider Settings Service existe, um Provider ausente falha diretamente (fail closed), sem retorno ao Snapshot antigo. A implementação concreta e os testes direcionados ficam a cargo da manutenção da verificação de versão oficial; o typecheck de todo o repositório passou e o lint ficou com 0 error e as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 157. A verificação de segurança da versão oficial remove a dependência fantasma de Registry

A obtenção do material de verificação de segurança da versão oficial e a preparação do Header antes do envio chegou a exigir que o chamador informasse um `getProviderRegistrySnapshot` que nunca era lido, fazendo o Renderer parecer ainda acoplado ao Registry completo antigo. Esta rodada removeu esse parâmetro de contrato não utilizado e manteve apenas a dependência das entradas estáticas de Provider; o comportamento da entrada de compatibilidade já desativada `setProviderRuntimeHeaders` não mudou. O typecheck de todo o repositório passou e o lint voltou a 0 error com as 35 warnings já existentes. O pre-push completo foi adiado por convicção.

## 158. O accessId de Account passa a incluir o escopo da conta conectada

A Account Source gerava antes IDs fixos de tipo de conexão para o Personal Coding Plan e o Start Plan, como `coding-plan:<providerId>`. Ao trocar a conta conectada na mesma máquina, esse ID não mudava, de modo que o Usage Cache, o Credential Store, o Account Config e os Models já criados não conseguiam distinguir as duas contas.

Esta rodada acrescentou uma identidade de conta não sensível ao final do ID de conexão de Plan/Team existente:

```text
<plan-connection-id>:account:<encoded-account-profile-id>
```

A identidade da conta vem do `id` estável do OAuth Profile, sem JWT, API Key, Header dinâmico e sem usar hash de Secret. O ID permanece o mesmo quando o Token ou a Runtime Key da mesma conta são renovados e precisa mudar ao trocar de conta. O Team Plan também passa a ter escopo de conta, mantendo organização e projeto no ID base original.

Quando um Account Provider já foi julgado available pelo entitlement, mas a Account Source não consegue obter a identidade da conta, esta rodada escolhe fail closed: a atualização lança erro e o AccountProviderService existente mantém o last-known-good, em vez de gerar um ID sem escopo que pudesse ser reutilizado entre contas. O Request Auth continua aceitando os IDs antigos sem escopo durante a migração, protegendo Models já criados, a Source de compatibilidade remota antiga e Sessions persistidas; a nova Account Source gera apenas a forma com escopo de conta. O sufixo de conta é removido antes da resolução da Team Key, para que o campo de conta não seja confundido com organization/project pela Team Key antiga de dois segmentos.

Os testes cobrem primeiro a troca de conta, a renovação de credenciais da mesma conta, a ausência de identidade de conta e a Request Auth de Personal/Start/Team, e só então a implementação é modificada. Treze testes direcionados de Account Connection, Config Source e Request Auth passaram; a verificação TypeScript dos Services passou. O pre-push completo foi adiado por convicção.

## 159. O Request Auth recusa trocar silenciosamente um Model antigo para uma nova conta

Depois da primeira implementação do accessId em nível de conta, a inspeção da autenticação dinâmica continuou e mostrou que as requisições de Start/Team ainda liam o Token OAuth atual diretamente pelo Provider Family. Se um Model criado pela conta A ainda não terminou e o usuário já fez login na conta B, o accessId com escopo do Model antigo continua sendo A, mas a requisição ainda poderia obter o Token de B.

O Account Request Auth agora resolve primeiro a identidade da conta no accessId e a compara com o ID estável atual do OAuth Profile; quando a identidade está ausente ou é inconsistente, devolve `AccountRequestCredentialUnavailableError` e não continua lendo API Key, JWT ou Team Key. A renovação de Token da mesma conta não muda o Profile ID e, por isso, as credenciais mais recentes ainda podem ser obtidas durante o ciclo de vida do Model. Os accessId antigos sem escopo de conta pulam essa verificação por enquanto e servem apenas a Models já criados durante a migração e à Source antiga; a nova Account Source já é garantida pela seção 158 como não geradora dessa forma.

Novos testes reproduzem primeiro "um Model da conta A lendo a Personal Key da conta B" e só então fixam o comportamento de recusa. Ao todo, 41 testes direcionados de Request Auth, Host Runtime Header, Workspace Header e OffPeak passaram; a verificação TypeScript dos Services passou. O pre-push completo foi adiado por convicção.

## 160. Usage / Entitlement usam o Account Access como autoridade de requisição

Embora Usage, Entitlement, Coding Plan Usage e o reset de planos já tenham uma fonte concreta escolhida pela UI, o Host ainda relia `ModelProviderService.getAllCached()`, procurava o Provider no antigo `ModelProviderConfig[]`, julgava se estava habilitado, lia a API Key e criava ou copiava a Key do projeto por conta própria no cenário de Team Plan. A mesma requisição tinha, assim, duas identidades de fonte: a conexão de conta escolhida pela UI e a conexão adivinhada novamente pela camada de Usage a partir do array antigo de Providers.

Esta rodada restringiu a fronteira de requisição a:

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
├─ validar que o accessId pertence à conta logada atual
├─ Personal Coding Plan -> Account Credential Store
├─ Team Plan            -> Team Key Resolver
└─ Start Plan           -> o ZCode JWT atual
        |
        v
Usage API
```

O `BigModelUsageQuotaProvider` removeu a dependência direta do antigo `IModelProviderService` e deixou de ser responsável por criar a Team API Key. A obtenção e o cache da Team Key permanecem unificados no Account Request Auth, e o Usage só consome o material de requisição correspondente a esta conexão. O reset de planos também valida primeiro a identidade de conta de `providerId + accessId` e só então lê o ZCode JWT da conta atual e o OAuth JWT do Provider Family correspondente.

O Shared Protocol passou a exigir `accessId` no Coding Plan Usage e no Reset; Entitlement e requisições de Usage genérica o mantêm opcional nas interfaces de compatibilidade, mas todas as chamadas de produção de Account Provider obtêm e passam esse campo a partir da `ProviderSettingsView`. O cache de requisições da UI, a mesclagem de requisições in-flight, o Reset Coordinator e o estado de autoplay também passaram a incluir o `accessId` em suas chaves, evitando que contas diferentes ou conexões Personais/Team do mesmo Provider compartilhem resultados.

A conclusão do login OAuth e a recuperação de inicialização são entradas independentes de requisição de entitlement. Elas atualizam primeiro a Provider Settings View, obtêm o `accessId` de Coding Plan e de Start Plan do Account Config mais recente e só então leem o Entitlement; assim, uma conta já conectada não é mais julgada como não configurada só porque o novo serviço recusa requisições sem identidade. O monitor usage de API Providers comuns não tem consumidor de produção hoje e mantém o ponto de injeção estreito `resolveApiAuthorization`, que depois será alimentado pela nova Configuração Efetiva de API Provider, sem restaurar a escolha pelo array antigo de Providers. Por dentro, o Account Credential Store ainda pode executar a importação única de Keys antigas; essa importação é a entrada de migração da saída da Config antiga e, depois de concluída, só a nova chave de credencial em nível de conta é lida.

Ao todo, 274 testes direcionados de Provider, Services e UI passaram, assim como as verificações TypeScript de Provider, Shared, Services e UI. O pre-push completo foi adiado por convicção.

## 161. O Environment remoto estabelece seu próprio Provider Runtime

Ao examinar a cadeia real de inicialização do remote anexado ao desktop, descobriu-se que, embora a nova Config/Registry já pudesse ser montada nos Services, o `zcode-server.cjs` remoto não carregava a Official Config. `createStdioServices()` não conseguia, portanto, criar um Provider Runtime, e a execução real continuava dependendo do Desktop Renderer empurrar o Registry local completo e o runtimeModel para o remoto.

Esta rodada primeiro completa a fonte de fatos do remoto. O Server remoto embute, na build, o único `config/provider/official.json` do repositório; na inicialização, o arquivo é materializado por hash de conteúdo como um arquivo de versão imutável e o caminho é entregue ao `createLocalServices()` remoto. A Personal Config continua lendo o diretório de usuário remoto, e a Account Source continua lendo a conta e o Credential Store remotos. Um arquivo de nova versão não sobrescreve o arquivo em uso por processos antigos, e a mesma versão é reutilizada diretamente.

A montagem do Remote Host foi então trocada pelo seu próprio Provider Runtime: o estado de prontidão de modelos, o Account Config e o catálogo de modelos do Repo Wiki passam a ler o Registry remoto, e o antigo `LegacyAccountProviderConfigSource` deixa de participar da raiz de composição remota. O conjunto de serviços de remote workspace do Desktop também encaminha diretamente o `ModelSelectionService` e o `ProviderSettingsService` remotos, de modo que a seleção de modelos e a Settings View passam a obedecer ao Environment alvo e não ao Provider local do Desktop.

No caminho quente de negócio, o SessionPane removeu o envio do Registry antes do envio e a lógica de recuperação que injetava o `runtimeModel` do Desktop após `provider.notInRegistry`; o pré-aquecimento do Repo Wiki também passou a submeter apenas `ModelSelection`. Quando um Provider é recusado pelo Environment alvo, o chamador mantém esse resultado de recusa e deixa a Config/Account Facts do próprio remoto corrigir, sem sobrescrever com outro conjunto de fatos.

Esta fatia ainda não removeu as entradas restantes de sincronização completa de Registry na recuperação de conexão, no salvamento de configurações antigas e nos caminhos de Bot; elas continuam listadas como objetivos de limpeza posteriores e não podem ser vistas como um novo contrato de compatibilidade. Ao todo, 71 testes direcionados de Server, Services, Desktop, Client e UI passaram, assim como as verificações TypeScript dos pacotes relacionados, e a build do bundle de arquivo único do remoto passou. O pre-push completo foi adiado por convicção.

## 162. O Desktop sai da injeção de Registry e Runtime Model remotos

Com o Remote Provider Runtime pronto, o Desktop ainda tinha quatro escritas legadas: sincronizar o Registry completo ao abrir ou reconectar um remote workspace; transmitir o Registry a todos os workspaces após salvar ou excluir configurações; sincronizar o Registry depois que o Bot obtém a runtime port remota; e resolver e enviar o `runtimeModel` no pré-aquecimento de drafts pelo Renderer. Elas faziam a mesma execução remota ficar controlada ao mesmo tempo pelos fatos remotos e pelo Snapshot do Desktop, e faziam uma modificação local de Provider alterar silenciosamente outro Environment.

Esta rodada removeu essas cadeias de produção. Ao abrir ou conectar um remote workspace e um Bot remoto, passa-se a ler o `ModelSelectionService.getView()` remoto e usá-lo como verificação de que o Remote Provider Facade já está pronto; se a verificação falha, nada é cacheado nem exposto como runtime meio inicializado. O salvamento de configurações escreve apenas a Personal Config, e o Registry é atualizado pela Config Source de cada Environment. O pré-aquecimento de drafts continua a submeter a Configuração inicial da Session, contendo apenas escolhas do usuário como provider, model e thought; o remoto cria o Model em sua própria etapa de tratamento de comandos, a partir do Registry atual.

O `/model` do Bot também submete apenas `modelRef` quando existe a nova Model Selection Facade. `updateProviderRegistry` é mantido apenas para entradas antigas que ainda não montaram a Facade, e a identidade remota não dispara mais esse ramo de compatibilidade. O protocolo antigo e o cache de Snapshot interno do Agent serão removidos em conjunto depois que todas as entradas antigas passarem a usar o Provider Runtime; esta rodada não amarra a remoção do protocolo à troca de autoridade remota em uma única mudança de alto risco.

Os módulos de sincronização de UI removidos incluíam o estado de revision/pending, a enumeração de targets de workspace e a transmissão de Registry do Desktop, eliminando três estados paralelos. O Remote Bot Runtime ganhou um proxy da Model Selection Facade, continuando a reutilizar o conjunto de serviços MessagePort já existente. Ao todo, 191 testes direcionados de Services e UI passaram e as verificações TypeScript dos dois pacotes passaram; o pre-push completo continua adiado por convicção.

## 163. O protocolo antigo de Registry para de receber escritas de produção, e a remoção do protocolo é separada da migração de fixtures

Depois que as chamadas de produção de Desktop, Remote UI e Bot saíram, o `workspace/updateProviderRegistry` já não tem mais chamadores com Provider Runtime. Ao tentar remover o protocolo, descobriu-se que muitos testes existentes da CLI — cold recovery, projeção V4, runtime header e limites de modelos — ainda o usam para montar fixtures antigas de catálogo de workspace; remover diretamente mudaria ao mesmo tempo a preparação desses testes, sem permitir saber se uma falha vem da saída do protocolo ou de uma mudança no comportamento testado.

Esta rodada preferiu encerrar primeiro o fluxo de fatos, sem remover a casca do protocolo no mesmo commit. O último ramo legacy de `/model` do Bot foi removido, e tanto local quanto remotamente apenas `modelRef` é submetido. O Repo Wiki também removeu a imagem do Registry de workspace e passa a ler apenas a Model Selection View do Environment atual; entradas antigas sem o novo Runtime montado ainda podem ler a própria legacy source, mas já não podem receber uma imagem de outro Environment.

O Core Worker gerenciado pelo Remote Host agora recebe o Account Config do Environment atual, assim como o Host local. O código anterior pulava a sincronização de Account Config apenas porque `workspaceIdentity` era SSH/WSL — uma condição remanescente da era de injeção pelo Desktop que impedia um Remote Host que já tem fatos de conta remota de entregar o próprio Account Overlay ao Worker. Esta rodada remove essa condição. Isso continua sendo uma sincronização de Config de Host para Worker dentro do mesmo Environment, e não uma injeção entre Environments do Desktop para o Remoto.

A remoção final do protocolo em si será feita na mesma rodada em que os fixtures de teste da CLI passarem a usar Official/Personal/Account Source. Nesse momento serão limpos em conjunto o Shared Schema, os métodos de Session/Agent Service, os handlers de CLI, a marca de água de revision de snapshot do catálogo de workspace e os testes correspondentes, evitando deixar um estado meio removido sem cobertura. Os 125 testes direcionados de Services relacionados e a verificação TypeScript de todo o repositório passaram; o lint permanece com 0 error e, após remover os imports obsoletos desta rodada, volta às 35 warnings já existentes.

## 164. O App remoto não pode recorrer ao Workspace Registry Snapshot

O processo remoto já estabeleceu sua própria Official Config, Personal Config, Account Config e Registry, mas a Entry de Protocol ainda escolhia explicitamente `legacy-snapshot` ao criar o Remote App. Isso continuava montando a origem de compatibilidade do antigo overlay de workspace e, mesmo com os escritores do Desktop removidos, deixava essa entrada permitir que chamadas legadas futuras trouxessem de volta um Snapshot entre Environments para a cadeia de execução.

Esta rodada restringiu a regra da raiz de composição de "Registry do processo pronto" a uma única função: independentemente de o processo atual atender um Desktop Workspace local ou um Remote Environment como SSH, WSL e Docker, a criação do App injeta o Registry do próprio processo e fixa `registry-only`. A expressão de runtime fica, portanto, unificada:

```text
Official + Personal + Account Config do Environment atual
                         |
                         v
                 Process Registry
                         |
                         v
                 App Model Runtime
```

Três arquivos de teste de Bootstrap, totalizando 13 testes, e as verificações de tipo passaram; o lint de todo o repositório permanece com 0 error e as 35 warnings já existentes.

## 165. A cold recovery usa o Registry do processo para decidir a prontidão de modelos

Depois que o Remote App passou a `registry-only`, a auditoria da cold recovery descobriu que a materialização de Session ainda decidia pela availability de modelos históricos apenas com o antigo `workspaceModelCatalogs`. Mesmo com o Remote Environment já tendo iniciado o Registry de processo a partir da sua própria Config, desde que o Desktop não enviasse o Snapshot antigo esse julgamento escolheria o deferred adapter e penduraria um `restoreWarning` na Session; depois disso, um envio do usuário poderia ser recusado indevidamente.

O Protocol Server agora registra explicitamente se o processo atual já estabeleceu um Provider Registry. O ramo de compatibilidade da cold recovery ficou:

```text
Process Registry já existente
└─ restaurar direto a partir do Registry do Environment atual

Sem Process Registry
├─ existe workspace compatibility target -> usar esse target
└─ o target não existe                   -> deferred adapter + restoreWarning
```

Esse fato booleano apenas descreve se a raiz de composição montou o novo Registry; ele não carrega dados de Provider nem cria uma nova fonte de fatos de modelos. O comportamento das entradas manuais antigas de Protocol permanece inalterado, e Desktop, Remote Worker, Prompt CLI e TUI não esperam mais um workspace Snapshot quando já têm um Registry montado. Novos testes de integração de cold recovery cobrem simultaneamente a restauração direta pelo novo Registry e a semântica de restoreWarning da entrada antiga; três arquivos de teste de Bootstrap, totalizando 40 testes, e as verificações de tipo passaram.

## 166. O Provider Config Schema é convergido para Access, API e Model API Adapter

Até aqui, o Provider Config espalhava `apiKey`, `accessId`, `apiFormat`, `baseURL`, Headers e o mapeamento de reasoning de modelos no mesmo nível, obrigando os chamadores a adivinhar por combinação de campos se estavam descrevendo identidade de acesso, protocolo de requisição ou comportamento de adaptação de modelo. Depois que os Account Providers entraram no Overlay, essa estrutura também fazia com que as três configurações — Official, Personal e Account — expressassem o mesmo fato de maneiras diferentes.

Esta rodada elevou o documento de configuração para o Schema v5 e agrupou os campos por sua função real:

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

Official, Personal e Account Access continuam usando o mesmo Overlay de `ProviderConfig`. A configuração só descreve os fatos que a fonte atual conhece; as credenciais dinâmicas de requisição continuam sendo obtidas pela cadeia de execução no momento da requisição e não entram nos fatos estáticos de modelo do Registry. O `ModelConfigRule` também convergiu `apiFormatMatch` para `apiMatch`, permitindo que os atributos comuns de um modelo e as regras de adaptação sob diferentes protocolos de API sejam cobertos em camadas.

Documentos antigos v4 são convertidos para v5 por uma entrada de migração única: os campos planos do Provider vão para `access` e `api`, e o `reasoningMapping` de nível de modelo vai para `apiAdapter`. O arquivo de configuração Official também passa ao novo formato, e os chamadores de produção não leem mais os campos antigos.

Ao implementar a projeção diferencial da configuração Personal, descobriu-se que, se `access`, `api` ou `apiAdapter` fossem salvos como um campo comum e único, uma simples alteração de API Key pelo usuário copiaria junto o endereço de gerenciamento do Official atual para o Personal, e atualizações posteriores desse endereço pelo Official deixariam de ter efeito. Por isso a projeção diferencial compara recursivamente os campos diretos desses Overlays aninhados e salva apenas os campos que o usuário realmente alterou. A importação da Personal Config antiga reutiliza esse mesmo caminho de projeção e não faz mais um cálculo diferencial de nível superior antecipado.

Ao todo, passaram os testes direcionados de Provider (72), Provider Node (10), Services (69), Bootstrap (39) e os relacionados de UI; a verificação TypeScript e o lint de todo o repositório passaram, com o lint mantendo as 35 warnings já existentes e 0 error. A suíte completa de UI ainda tem 2 falhas existentes de Composer Continuity Mock sem `modelSelectionService.onDidChange`, e a suíte completa de Bootstrap ainda inclui falhas de baseline existentes de ambiente e de Session Lifecycle. Esta fatia não modificou essas cadeias, e os testes direcionados já cobrem todos os chamadores de produção do Schema v5.

## 167. A Personal Config troca no lugar para o primeiro Schema oficial

O Provider Config ainda não tinha sido oficialmente publicado, e os v1 a v5 dos recortes anteriores eram apenas números intermediários do desenvolvimento. Manter essas etapas de migração congelaria uma história não lançada como um fardo de compatibilidade de longo prazo. Esta rodada define a estrutura final de `access`, `api` e `models.apiAdapter` como o primeiro `schemaVersion: 1` oficial, remove as migrações versionadas embutidas do período de desenvolvimento e deixa a migração v1 para v2 explícita para quando um v2 real for publicado.

A Personal Provider Config continua usando o `~/.zcode/v2/config.json` existente e não cria um segundo `provider-config.json`. Na primeira leitura de um arquivo antigo sem `schemaVersion`, a Entry injeta o conversor de formato antigo, grava primeiro no mesmo diretório um backup com conteúdo idêntico que não sobrescreve um arquivo já existente e depois grava atomicamente o novo documento v1:

```text
ler o config.json antigo
        |
        v
criar config.json.pre-provider-v1-<sha256>.bak

        |
        v
Entry converte o formato antigo -> Provider Config v1
        |
        v
substituição atômica do config.json
```

Se a criação do backup, a conversão do formato antigo ou a presença do conversor falhar, o arquivo original permanece inalterado e a parte que inicia recebe um erro explícito. O nome do backup contém o SHA-256 completo do conteúdo original; uma migração repetida do mesmo conteúdo pode reaproveitar o backup já existente, e conteúdos diferentes não sobrescrevem backups antigos. O Standalone CLI/TUI e o Host/Worker usam o mesmo caminho padrão, mas cada Entry continua responsável por injetar a forma de leitura do formato antigo que domina.

Na nova cadeia de configurações, salvar, excluir Provider, atualizar API Key e reordenar modelos escreve apenas a nova Personal Config e não espelha mais nada no antigo `ModelProviderService`. Chamadas de compatibilidade ainda não migradas, como a atualização de conta, ainda podem passar pelo Service antigo; por isso a camada de armazenamento antiga ganhou uma proteção de posse: ao descobrir que o arquivo alvo já é um Provider Config v1 oficial, ela recusa a escrita, impedindo que a estrutura antiga sobrescreva a nova fonte da verdade. Essa proteção serve apenas ao período de migração; depois que a cadeia de conta for conectada à Account Config Source, a implementação antiga do armazenamento de Providers será removida por inteiro.

Passaram os testes de Provider (69), Provider Node (12), direcionados de Services e UI (36), de Bootstrap (14) e de caminho de CLI (4); a verificação TypeScript de todo o repositório passou e o lint mantém as 35 warnings já existentes com 0 error. As suítes completas de Bootstrap e CLI disparadas por engano ainda expõem problemas existentes de MCP, Session, Telemetry, recursos de SEA e limpeza de testes, todos fora das cadeias modificadas nesta fatia.

## 168. A Account Source obtém diretamente as credenciais de Coding Plan em nível de conta

O novo Registry já expressa os Providers de conta pelo Overlay de Account Config, mas o login, a recuperação de inicialização, a conclusão da compra e o logout ainda chamavam o antigo `ModelProviderService.refreshCodingPlanApiKey()`. Além de escrever no Provider Store antigo, esse método escondia uma responsabilidade necessária: criar ou copiar a Personal Coding Plan API Key usando o Access Token OAuth atual na interface de negócio. Remover a chamada diretamente impediria que uma conta recém-conectada entrasse no Coding Plan Registry.

Esta rodada restringiu essa responsabilidade ao `AccountProviderCredentialService`. Ele lê e salva credenciais pelo `accessId` em nível de conta e, quando o cache está ausente, usa o Token OAuth atual para chamar a implementação existente de resolução de Key de negócio, mesclando requisições concorrentes da mesma conexão de conta:

```text
providerId + accountIdentity
        |
        v
scoped coding-plan accessId
        |
        +-- Credential Store encontra -> retorna
        |
        `-- não encontra -> OAuth Token -> interface de Key de negócio -> salva -> retorna
```

A Account Source obtém primeiro a identidade da conta atual antes de consultar o entitlement de Coding Plan e depois obtém a Key por essa identidade; assim, o Account Config publicado e o Credential Store em tempo de requisição usam o mesmo `accessId` com escopo. A autenticação de requisições de Model não relê mais o Provider Store antigo. O callback OAuth força explicitamente a atualização da Key da conta, enquanto a recuperação de inicialização comum continua reutilizando o cache, e várias atualizações de Provider dentro do mesmo callback OAuth compartilham a mesma Promise para não copiar a Key repetidamente para Start/Coding/selectedKey final.

Com o novo Provider Runtime, a recuperação de inicialização, o callback de login, as mudanças de autenticação na página de configurações e a conclusão da compra atualizam apenas a Account Source. O logout primeiro limpa as Keys antigas sem escopo de conta do período de migração e depois atualiza diretamente a Account Source; a Account Source publica um resultado indisponível depois que a identidade da conta desaparece. Os antigos `refreshCodingPlanApiKey` e `clearCodingPlanApiKey` ficam apenas para as entradas de compatibilidade sem o Provider Runtime montado. O novo Runtime também deixa de assinar os eventos de Account Facts do antigo `ModelProviderService`: as configurações de conta passam a ser dirigidas pela invalidação de Settings, e login, logout e compra passam a disparar suas próprias atualizações ativamente.

A implementação HTTP da Key de negócio remota reutiliza temporariamente o método sem estado de resolução de Key de `OAuthPresetProviderRepoProviderResolvers`; ele não lê Provider Config nem Registry antigos. Ao remover o Preset Repo antigo, esse método deve ser movido para o domínio de credenciais de conta, mantendo o contrato de Service atual. Doze arquivos de teste direcionados de Provider, Services e UI, totalizando 345 testes, passaram; a verificação TypeScript de todo o repositório passou e o lint mantém as 35 warnings já existentes com 0 error.

## 169. O Registry do processo recusa escritas antigas de Workspace Provider

O Worker de produção já estabelece o Registry na inicialização do processo a partir da Official Config, da Personal Config e da Account Config do seu Environment, mas o protocolo e os Host Services ainda mantêm `workspace/updateProviderRegistry`, `workspace/upsertModelProvider` e `workspace/removeModelProvider`. Esses métodos já não têm chamadores de produção e ainda permitem que um Snapshot antigo do Host ou uma escrita em nível de Workspace reestabeleça um segundo conjunto de fatos de Provider.

Esta rodada primeiro fecha essas três comandos antigos na fronteira de composição do Registry do processo: assim que o Worker tem um Registry de processo montado, o protocolo devolve uniformemente `Method not found`. Ao mesmo tempo, remove-se os três grupos de métodos, parâmetros e tipos de retorno expostos por `IZCodeAgentService` e `IZCodeSessionService`, de modo que Host, proxy de Remote Service e Renderer deixam de ter a interface estática para chamar o protocolo antigo de escrita. As Entries manuais de teste sem o novo Registry montado mantêm por enquanto os handlers antigos, para que a próxima etapa possa migrar os fixtures de teste para o novo Registry e então remover em conjunto o Schema do protocolo e sua implementação.

O teste de montagem stdio remoto também passou de "iniciar depois de o Desktop empurrar um Snapshot de Provider" para "iniciar depois de o Remote Environment construir uma Selection View a partir da sua própria Official Config". O teste passa assim a cobrir diretamente a primeira fonte de fatos remota já decidida: o Desktop apenas dispara operações remotas e não transmite configuração nem autenticação de Provider.

Novos testes de fronteira do protocolo cobrem que as três comandos antigos estão indisponíveis no modo Registry de produção; os 17 testes do Session Service, o teste de montagem stdio remoto e os testes direcionados de Bootstrap passaram, e a verificação TypeScript de todo o repositório passou. A remoção do Schema completo do protocolo, dos campos antigos de Workspace Provider e dos fixtures de teste correspondentes continua como a próxima fatia.

## 170. Remover o fallback em memória do Snapshot de Provider do Desktop no remoto

Depois que a fatia anterior removeu as entradas de escrita do Host, o `providerRegistryByWorkspaceKey` do `ZCodeAgentService` perdeu seu único ponto de escrita, mas os ramos de leitura na resolução de modelos, na prontidão de inicialização e no tratamento de Headers em tempo de requisição foram mantidos. Esses ramos nunca podem ser atingidos em runtime e continuam expressando a arquitetura obsoleta de que "o remoto pode recorrer a um Snapshot empurrado pelo Desktop".

Esta rodada removeu o Map, a lógica de limpeza de ciclo de vida e os três ramos de fallback. Alvos remotos como SSH/WSL e alvos locais seguem agora a mesma regra:

```text
Config e Account Access do Environment pertencente
                    |
                    v
             Provider Registry de processo
                    |
          +---------+---------+
          |                   |
          v                   v
   Resolução do Runtime Model       julgamento de prontidão de inicialização
```

A autenticação dinâmica de requisições continua sendo fornecida pelo Account Service em tempo de requisição e pela resposta interativa, e é devolvida como `requestAuth` desta requisição. Sem um Registry de processo, não se toma mais emprestado o cache de Session nem o Snapshot do Desktop para reconstruir um Provider; assim, os fatos estáticos de modelo e o material de autenticação em tempo de requisição permanecem separados e o remoto não volta a ter uma segunda fonte da verdade.

Os três testes de SSH que validavam o Registry empurrado passaram a validar o Registry do processo, e o teste de Header dinâmico sem cache de Runtime Model passou a validar que apenas o auth de escopo de requisição é devolvido, sem reescrever o Runtime Model da Session. Os três testes direcionados e a verificação TypeScript de todo o repositório passaram.

## 171. Completar a evidência da fronteira de Config de Environment entre Remote Host e Worker

Ao verificar melhor a montagem de produção remota, confirmou-se que o Remote Host injeta, a cada inicialização de Worker, os caminhos da própria Official Config e Personal Config remotas. O Worker então reconstrói o Registry a partir dessas duas Configs e da Account Source remota, e o Desktop não participa da transmissão de fatos de Provider nem de autenticação. Os dois comentários existentes ainda descreviam "o Desktop reenvia o Registry" e foram corrigidos para a arquitetura atual.

Um novo teste do Process Manager observa diretamente o ambiente do subprocesso e cobre os dois caminhos de Provider Config — Official e Personal — de fato entrando no Worker. Esse teste preenche a lacuna que existia entre "o Remote Host consegue construir o Registry" e "o Remote Worker realmente lê Config da mesma origem".

Ao tentar fechar imediatamente `workspace/upsertModelProvider` e `workspace/removeModelProvider` em todas as Entries, a suíte completa de protocolo expôs 28 testes antigos que dependem diretamente desse protocolo. A maior parte deles valida a síntese de hardcode de reasoning que será substituída pelas Official Model Config Rules, e poucos ainda validam a semântica de modelo padrão e profundidade de pensamento de Session. Esta rodada não forçou o fechamento apagando testes em bloco; o Registry de produção continua recusando as três escritas antigas na fronteira do protocolo. Mais adiante, a semântica valiosa de Session será migrada para os testes do Registry de processo e, junto com o hardcode antigo de reasoning, o Schema e os handlers, tudo será removido.

## 172. O modo Registry corta os fatos antigos de modelo da CLI e do Workspace

Depois que o Registry de processo foi montado, o `model`, o `modelCatalog` da Config antiga da CLI e o catálogo de Workspace ainda podiam entrar na execução de modelos por `bootstrapModelConfig`, pelo fallback de capability de runtime e pela Workspace compatibility source. Essas vias já não eram a entrada principal de montagem, mas ainda permitiam que um arquivo antigo ou um Snapshot antigo de Workspace sobrescrevesse atributos de modelo, Options e roteamento de Provider presentes no Registry.

Esta rodada restringiu a fronteira a:

```text
Runtime Config da CLI antiga
├─ domínios ainda não migrados como MCP / Hooks / Permission -> por enquanto continua em uso
└─ Provider / Model / Model Catalog         -> o modo Registry não entra mais na execução

Workspace Catalog
└─ o modo Registry não gera mais bootstrapModelConfig

Turn Temporary Provider
└─ continua injetado pelo execution-scoped Model Source
```

Foram removidos `workspaceProviderCompatibilityMode`, a Workspace compatibility source e sua lógica de mesclagem com o Registry. Um Provider ausente do Registry agora devolve diretamente `ProviderNotFound`, e somente o Provider temporário explicitamente trazido pelo Turn atual pode complementar o Registry dentro do escopo de execução. Prompt CLI, TUI e Protocol Worker passam a usar a mesma regra e não precisam mais escolher um modo de compatibilidade na Entry.

Também foi corrigido um vazamento de prioridade: mesmo quando um Registry de processo era informado, `bootstrapModelConfig` ainda podia ter prioridade sobre o Runtime inicializado pelo Registry. Agora o modo Registry ignora por completo essa configuração antiga de modelos, e context window, max output, capacidades de mídia de entrada e reasoning options vêm somente do Registry e do Overlay execution-scoped atual.

Seis arquivos de teste direcionados de Bootstrap, totalizando 208 testes, e os dois testes de ciclo de vida de Registry de processo do Prompt CLI/TUI passaram. As verificações TypeScript de Bootstrap e da CLI passaram; antes da verificação da CLI, os artefatos de Shared Types e de Bootstrap foram reconstruídos para evitar pseudo-falhas causadas por declarações antigas em `dist`. O lint de todo o repositório mantém as 35 warnings já existentes e 0 error.

## 173. O Workflow Child Runtime reutiliza o Adapter do Registry

Ao continuar auditando a leitura da Config antiga da CLI, descobriu-se que, embora o App principal já criasse ModelFactory e Adapter a partir do Registry de processo, os Child Runtimes do Expert Workflow e do Script Workflow ainda chamavam `createModelAdapter()` por conta própria. No modo Registry, esses Runtimes filhos não têm o antigo `RuntimeModelConfig`, e por isso `createModelAdapter()` lia por conta própria `~/.zcode/cli/config.json`, trazendo de volta ao processo os fatos antigos de Provider e Model que já saíram da cadeia principal.

Esta rodada fez com que os dois tipos de Workflow Child Runtime reutilizem diretamente o Adapter já montado pelo App principal:

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

Cada Child Loop ainda cria e mantém seu próprio Model execution-scoped por meio do ModelFactory; o Adapter compartilhado apenas reutiliza a infraestrutura de execução de protocolo de Provider e não faz Loops diferentes compartilharem uma seleção de modelo mutável. Depois de remover as entradas duplicadas de Model Catalog, Model Config, Endpoint Routing e Model Logger na montagem dos Workflows, o código de produção do Bootstrap tem apenas uma chamada a `createModelAdapter()`, no App principal.

Os testes de regressão observaram primeiro que um Expert Workflow criava 8 Adapters duplicados e, após a modificação, o ciclo de vida do App inteiro cria apenas 1. Os 12 testes do Provider Registry App Runtime e do Script Workflow e a verificação TypeScript do Bootstrap passaram.

## 174. Os testes de cold recovery saem do protocolo de escrita de Workspace Provider

Os testes de integração de `v4-cold-resume` chamavam `workspace/updateProviderRegistry` antes de cada recuperação. O que esses testes realmente validam é a cold recovery, a materialização de persistência, o uso, o thought, a identidade de workspace remota e a admissão de comandos após a recuperação; o RPC antigo servia apenas como fixture de teste que tornava temporariamente "disponível" o modelo escolhido por uma Session histórica.

Esta rodada mudou o fixture para uma fonte de fatos de nível de processo isomórfica à produção: os testes iniciam um `ProviderRegistry`, injetado pela App Factory do Server em cada App recuperado. O context window e os níveis de reasoning do modelo vêm diretamente do Registry. Exceto pelo teste de compatibilidade dedicado ao aviso de recuperação de versão antiga sem Registry de processo, não se escreve mais Provider no Workspace.

O teste original `provider-registry-context-window-sync` foi removido junto. Ele validava que uma atualização antiga do Registry de Workspace reescrevia imediatamente os limites de context/output de uma Session em execução, o que conflita com o ciclo de vida já confirmado: um Model já criado permanece inalterado durante sua execução contínua, e uma atualização do Registry afeta apenas Models criados depois. Esse ciclo de vida já é coberto pelo teste "após atualização do Registry, apenas a configuração de execução seguinte é substituída" em `provider-registry-model-runtime`.

Os 32 testes migrados de `v4-cold-resume` passaram. O próximo passo pode remover os testes históricos de `zcode-protocol.test` que validam a escrita antiga de Workspace Provider e a inferência de reasoning por nome de modelo, preservando as evidências de comportamento de produto.

## 175. Remover o Workspace Provider Writer do lado do Agent

Depois de concluída a migração da cold recovery, o lado do Agent ainda mantinha três handlers de protocolo capazes de reconstruir o catálogo de Workspace Provider:

```text
workspace/updateProviderRegistry
workspace/upsertModelProvider
workspace/removeModelProvider
```

Esses handlers mantinham um Map de Providers independente, secrets, revision, marca de água, diferenças de capacidade de modelo e hot update de session ativa. Mesmo com o modo Registry de produção já recusando as chamadas, testes ou Entries embutidas sem o Registry habilitado ainda podiam usá-los, de modo que a antiga fonte da verdade não havia realmente saído.

Esta rodada migrou primeiro os testes de App temporário de `workspace/generateText` que ainda tinham valor para o Registry de processo e corrigiu a montagem de produção: no modo Registry, o Registry/Adapter é injetado pela App Factory da Entry, sem criar adicionalmente um Workspace deferred Adapter que leria a Config antiga da CLI e sem sincronizar o catálogo de Workspace. Em seguida as três handlers e suas implementações de produção foram removidas. Qualquer Entry que chame os métodos antigos agora recebe uniformemente `Method not found` de JSON-RPC.

O principal teste de protocolo perdeu 37 casos históricos junto com o writer antigo. Eles cobriam o timing de Snapshot de Workspace, o hot change de session ativa e a síntese de parâmetros de reasoning por nome de Provider/Model; esses comportamentos foram substituídos pelo novo Config Resolver, pelo ciclo de vida do Registry e pelo mapping de reasoning do Model Config. O comportamento de produto — cold recovery de Session, seleção de modelos e liberação de App temporário — permanece coberto pelos testes da nova fonte da verdade.

Os 115 testes restantes de `zcode-protocol.test` passaram. O Schema e as constantes do protocolo Shared, assim como os testes históricos de envio do Host nos Services, ainda aguardam remoção sincronizada na próxima fatia; mantê-los por enquanto não reabre os handlers do Agent.

## 176. Remover o protocolo antigo de Provider Writer do Host para o Agent

Depois da remoção dos handlers do Agent, o Shared ainda exportava as constantes de método, o Schema de parâmetros e o Schema de resultado dos três writers antigos de Workspace, e o fake agent nos testes dos Services continuava devolvendo respostas de sucesso para esses métodos. Esse andaime mascararia regressões em que o código de produção volta a enviar os RPCs antigos.

Esta rodada removeu as declarações do protocolo de writer no Shared e as entradas de escrita dos Dev Docs, e limpou os casos de teste já inválidos de `service.updateProviderRegistry()` nos testes dos Services. O fake agent não aceita mais os writers antigos; as strings restantes servem apenas para afirmar que o Host não enviou esses métodos, e os testes de protocolo do Bootstrap afirmam explicitamente que os métodos antigos devolvem `Method not found`.

O `ZCodeProviderRegistrySnapshot` é mantido por enquanto. Ele ainda é a estrutura de dados de compatibilidade usada pela seleção de modelos do Host, pela autenticação de requisições e pela projeção de Runtime Model do período de migração e não tem mais a capacidade de escrever fatos de Provider no Workspace do Agent. Deve ser substituído item a item conforme as Config/Registry Views convergirem, e não ser removido de forma colateral nesta fatia.

Ao todo, passaram 184 testes do protocolo Shared, do Provider Registry dos Services, dos Runtime Headers, da Repo Wiki Lane, dos testes principais dos Services e dos testes V4; a verificação TypeScript de todo o repositório passou.

## 177. Completar o Registry de processo do HTTP Server e do Standalone Server Core

Depois de auditar todas as Entries de produção, descobriu-se que Desktop, stdio remoto, Prompt CLI e TUI já forneciam a Official Config, mas a Entry HTTP de `packages/server` e o Standalone Server Core de `zcode-server-cli` ainda chamavam `createLocalServices()` diretamente. Essas duas entradas não criavam um Provider Runtime e voltavam ao antigo `ModelProviderService`.

Esta rodada convergiu a capacidade de materialização por versão de conteúdo da Official Config para dentro de `@zcode/provider-node`: na build, o único `config/provider/official.json` é embutido no artefato do Server e, na inicialização, seu conteúdo é escrito por hash no diretório `config/provider` do runtime do Server; o caminho do arquivo de versão é então passado explicitamente aos Services. Conteúdo igual reutiliza o mesmo caminho, uma mudança de conteúdo gera um caminho novo e processos já iniciados continuam lendo a versão antiga sem modificação no lugar.

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

O HTTP Server, o stdio remoto e o Standalone Server Core passam a usar o mesmo mecanismo de materialização. Vinte testes direcionados de Provider Node, de materialização do Server e das duas configurações de build passaram. O login do CLI/TUI ainda grava a Config antiga de Providers da CLI; ele envolve a conexão de conta e a semântica de credenciais dinâmicas dos Account Providers e não foi reescrito por conveniência nesta fatia puramente de montagem de Entry.

## 178. Os Services não permitem mais criar a autoridade antiga de Provider sem Official Config

Depois que todas as Entries de produção foram conectadas à Official Config, o caminho opcional de `createLocalServices()` sobrou apenas para uso em testes. Esse parâmetro opcional ainda permitia que uma Entry nova compilasse sem montar um Provider Runtime e caísse em runtime no antigo `ModelProviderService`: aquecendo Presets antigos na inicialização, julgando a prontidão do Agent pelo Snapshot antigo do Registry e fazendo o Repo Wiki ler fatos antigos de Provider.

Esta rodada elevou `officialProviderConfigFilePath` a dependência obrigatória de `createLocalServices` e tornou obrigatório o campo de protocolo `init-local` do Desktop e o Schema de runtime. Qualquer Host/Server que esqueça a Official Config falha em tempo de compilação ou de admissão de protocolo, sem criar silenciosamente uma segunda fonte da verdade.

Com isso, os Services passaram a criar sempre Config, Account Source e Registry, removendo o aquecimento de Presets antigos na inicialização, a source de readiness do Registry antigo e o fallback de Registry do Repo Wiki. O `ModelProviderService` continua temporariamente responsável pela migração do formato antigo de configurações e por capacidades periféricas ainda não convergidas, mas não pode voltar a ser a autoridade de Provider do Agent por causa de uma Entry mal configurada. O Bot de produção também passa a injetar apenas o novo Model Selection Service, e o fallback de `ModelProviderService` mantido dentro dos Bots para testes legados independentes deixa de ser montado pelo Host.

Quatro arquivos de teste direcionados de entrada/protocolo/Services, totalizando 47 testes, passaram; a verificação TypeScript de todo o repositório passou.

## 179. O login Standalone passa a usar Account Config e autenticação em tempo de requisição

O login de Coding Plan do Prompt CLI e da TUI gravava antes a API Key, a definição de Provider e o modelo padrão juntos no antigo `~/.zcode/cli/config.json`. Isso fazia com que a Entry Standalone, mesmo já tendo iniciado o Registry de processo, recriasse uma antiga fonte da verdade de Provider depois do login.

Esta rodada restringiu o login Standalone a dois tipos de estado:

```text
Shared Credential Store
├─ Identidade da conta atual
└─ API Key correspondente ao accessId

Model Selection Config
└─ configuredDefault
```

Na inicialização do processo, a Standalone Account Source gera a terceira camada `ProviderConfigMap` a partir da identidade da conta e da API Key atualmente obtenível. Ela carrega apenas o `accessId`; os modelos do Provider, as Properties, os Option Specs e a configuração estática de API continuam vindo da Official Config, e nenhum segredo entra no Registry. Login, Coding Plan API Key manual e logout modificam o mesmo Credential Store, e os assinantes no mesmo processo atualizam a Account Source e o Registry depois da gravação.

As requisições de Model leem a API Key atual pouco antes de cada tentativa real, usando o `accessId` fixado no Model. A rotação da API Key, portanto, não modifica o Registry nem muda a identidade de um Model já criado; a requisição seguinte obtém diretamente o novo valor. Quando a identidade da conta é removida ou trocada, o accessId antigo
deixa de ser válido, e a Account Source simultaneamente remove o Provider correspondente do Registry usado para criar Models futuros.

O OAuth do Z.AI usa o ID de usuário do servidor como identidade da conta. O OAuth do BigModel e a API Key manual ainda não têm um Profile ID estável e, por enquanto, usam um resumo irreversível da API Key para formar a identidade estável necessária dentro do processo; quando o Account Service fornecer um ID de conta oficial, essa origem poderá ser substituída sem que o `accessId` e a fronteira de autenticação em tempo de requisição precisem mudar. Apenas o Z.AI / BigModel Personal Coding Plan foi conectado agora, sem usar isso para estender o Start Plan, o Team Plan ou as tarefas ociosas.

A Config antiga da CLI passa a servir apenas como entrada de importação única da Personal Config e do configured default. Assim que o novo arquivo é gerado, modificações posteriores nos campos antigos de Provider/Model não entram mais no Registry. `createZCodeApp` continua lendo domínios ainda não migrados do arquivo antigo, como MCP, Hooks e Permission, mas o modo Registry ignora explicitamente o `model` e o `modelCatalog` dele.

A notificação atual de mudança de Credential cobre múltiplas instâncias do Store dentro do mesmo processo; a inicialização de um novo processo lê o fato mais recente gravado em disco. Um processo Standalone que já roda há muito tempo ainda não escuta modificações do arquivo de Credential feitas por outros processos; isso pertence a uma fatia posterior de sincronização de Source e não pode ser contornado devolvendo a API Key para o Registry.

## 180. A entrada de configurações de produção para de tolerar a ausência do Provider Settings Service

Embora o `ProviderSettingsService` já tivesse sido montado pelas Entries Desktop, Remote, Server e Standalone, o contrato de UI ainda o declarava opcional. Por isso as configurações, a API Key do Welcome, a conclusão da compra e a cadeia de verificação de segurança mantinham ramos de "quando o serviço está ausente, ler ou escrever o antigo ModelProviderService", e uma nova Entry de produção ainda poderia voltar silenciosamente para a segunda fonte da verdade em caso de erro de montagem.

Esta rodada elevou o `ProviderSettingsService` a serviço obrigatório do `IServiceAccessor`. Entries puras da Web que não executam Providers, como a página inicial, fornecem explicitamente uma Settings View vazia, em vez de depender de `undefined` para expressar a ausência. A página de configurações, a página de login, a atualização após a compra e a atualização do Root passam a usar apenas as Facades de Settings/Selection, e a API Key Management URL passa a ser lida da Configuração Efetiva do Provider na Settings View.

O formulário antigo de configurações ainda pode existir como entrada do período de migração, mas ele existe apenas na camada de adaptação da fronteira do Renderer. A camada de adaptação combina o formulário atual com a `ProviderSettingsView` em uma Configuração estruturada e completa de Provider/Model Efetiva, e a Settings Facade calcula a partir daí um Personal Overlay esparso em relação à Official Config atual. Official Providers e Providers somente-Personal compartilham essa entrada e não copiam label, Endpoint ou lista completa de modelos do Official para a Personal Config.

A verificação de segurança da versão oficial do Start Plan mantém o material dinâmico, o Header request-scoped e o mecanismo de recibo já existentes; o fato estático `api.type/baseURL` usado pelo julgamento passa a ser lido obrigatoriamente da Settings View, com o fallback `getAllCached()` removido. A conclusão da compra também passa a atualizar apenas a Account Source e o Registry, sem chamar adicionalmente o antigo `refreshCodingPlanApiKey`.

Esse ajuste não refatorou a operação explícita de "testar conexão". A operação ainda lê credenciais de compatibilidade temporariamente quando o usuário clica e não pode sobrescrever os fatos estáticos de Provider/Model da Settings View; ela já está registrada no plano do M2 como um assunto posterior independente.

## 181. O Root remove o Snapshot antigo de Provider do Renderer

Depois que o `ProviderSettingsService` passou a ser um serviço de produção obrigatório, o Root ainda mantinha um snapshot independente `ModelProviderConfig[]` em memória. O portão de inicialização, o pop-up de login e a atualização OAuth observavam ao mesmo tempo a Selection View e o snapshot antigo, fazendo com que "Registry ainda não publicado" e "Provider antigo disponível" ainda pudessem dar duas respostas diferentes.

Esta rodada removeu o módulo `modelProviderSnapshot` do Renderer e o estado de assinatura do Root. A disponibilidade na inicialização e o portão de login agora reconhecem apenas a `ModelSelectionView`: `null` significa que o Registry ainda não foi publicado, e uma View vazia significa que o Registry confirmou que não há modelos selecionáveis; nenhum dos dois estados lê o array antigo de Providers.

A cadeia OAuth foi também convergida para uma única atualização do Provider Runtime: depois que o login da conta tem sucesso, a correção do `selectedKey` do Provider Family e a atualização do snapshot de App Settings são concluídas primeiro, e só então `ProviderSettingsService.refresh()` atualiza a Account Source, o Registry, a Settings View e a Selection View. O Renderer não chama mais `refreshCodingPlanApiKey()` separadamente para os Providers Coding/Start/Team e não mantém mais `cachedOnly`, request IDs ou barreiras de corrida do snapshot antigo.

A projeção do formulário Legacy usada pela página de configurações ainda existe, mas sua entrada vem apenas da `ProviderSettingsView`. A operação explícita de "testar conexão" mantém sua fronteira independente de leitura sob demanda de credenciais de compatibilidade; ela não voltou a ser estado permanente do Root nem fonte da verdade de seleção de modelos.

Nove arquivos de teste de inicialização do Root, portão de login, OAuth, projeção de configurações e fronteira de salvamento, totalizando 63 testes, passaram; a verificação TypeScript de todo o repositório passou e o lint ficou com 0 error e 35 warnings já existentes sem relação com esta fatia.

## 182. O Bot remove a antiga fonte de fatos candidatos de Provider

O `/model`, o `/status` e a migração de estado antigo do Bot já priorizavam a nova Model Selection View, mas o `BotsService` ainda tratava o Selection Service como dependência opcional e mantinha como fallback o antigo `ModelProviderService`, o Snapshot antigo do Registry, um cache de Provider em memória com TTL e um menu de Providers persistido. O Remote Workspace Host ainda injetava no Bot remoto o antigo Model Provider Service do Local Host do Desktop, de modo que um mesmo Remote Environment podia observar simultaneamente a Selection View remota e os fatos de Provider locais do Desktop.

Esta rodada elevou o Model Selection Service a dependência obrigatória do `BotsService` e removeu a cadeia do Provider Service antigo, do Snapshot do Registry e do cache de menu de Providers. O menu de modelos do Bot, o label de Provider e a migração de estado antigo consomem apenas a Selection View do Environment ao qual pertencem; uma leitura de View bem-sucedida que devolve lista vazia significa que de fato não há modelos selecionáveis, e uma falha de leitura só permite reutilizar a projeção em memória bem-sucedida mais recente da mesma Selection Source. O cache de `configOptions` do runtime de Workspace continua existente de forma independente, pois registra itens de configuração do Agente e não carrega fatos de Provider/Model.

Os Local Services injetam o Selection Service do Registry do processo local, e o Remote Workspace Host injeta o Selection Service fornecido pela conexão remota. O Bot remoto deixa, portanto, de ler a configuração de Providers do Local Host do Desktop. Os dois harnesses de E2E que constroem o Bot diretamente também passaram a fornecer explicitamente a Selection View, evitando que os testes continuem dependendo do fallback antigo implícito no código de produção.

Nove arquivos de teste direcionados de Bot e de Remote Workspace Host, totalizando 121 testes, passaram; a verificação TypeScript de todo o repositório passou.

## 183. O teste de conectibilidade da página de configurações sai do Snapshot antigo de Provider

O "testar modelo" da página de configurações tem uma semântica de produto fácil de deixar passar: ele testa o rascunho atualmente no editor, e o Endpoint, a API Key ou o nome do modelo ainda podem não estar salvos. Por isso não se pode simplificar o RPC para `providerId/modelId` e deixar o Host ler apenas o Registry, sob pena de a configuração vista pelo usuário e o objeto realmente testado divergirem.

Esta rodada acrescentou a operação de teste de conectividade ao Provider Settings Service. O Renderer entrega à Settings RPC o rascunho estático atual e o nome do modelo; o Host espera o Provider Runtime ficar pronto e procura na Settings View mais recente o Provider de mesmo ID. Um API Key Provider usa diretamente o rascunho atual. Um Account Provider ignora eventuais valores de autenticação remanescentes no rascunho, chama o serviço de autenticação em tempo de requisição pelo `accessId` da Configuração Efetiva e combina a API Key/Team Key atual nessa única sondagem. O Header de verificação de segurança pontual do Start Plan continua sendo gerado pela cadeia interativa existente e é submetido junto deste rascunho.

O `ModelProviderService.testModelConnectivity` existente continua temporariamente responsável pelo Probe de rede, pela verificação de entitlement do Start Plan e pela verificação de segurança da requisição; a nova fronteira `requestAuthResolved` informa explicitamente que as credenciais desta tentativa já foram resolvidas pelo novo Account Request Auth Service e proíbe que ele leia novamente o Snapshot antigo de Provider ou reescreva a identidade por configurações de Family. Esse reuso de compatibilidade não produz mais fatos de Provider e, quando o Probe independente for extraído, a entrada de mesmo nome no Service antigo poderá ser removida diretamente.

A leitura `getAllCached()` e o `resolveLegacyConnectivityProvider()` do Renderer foram removidos. Durante a implementação também foi discovered que um teste de conclusão de compra ainda afirmava a chamada do `refreshCodingPlanApiKey()` já aposentado; o teste foi alterado para fixar o comportamento atual: a conclusão da compra atualiza a Account Source e o Registry e não renova a antiga Provider API Key.

Sete arquivos de teste relacionados a Provider Runtime, autenticação em tempo de requisição, isolamento do Probe antigo, projeção de configurações, conclusão de compra e verificação de segurança da versão oficial, totalizando 198 testes, passaram; a verificação TypeScript de todo o repositório passou.

## 184. Remover a Source de migração do Snapshot antigo para o Account Config

Depois de uma nova auditoria da cadeia remota do M2.8, confirmou-se que o Remote Host já usa sua própria Official Config, Personal Config, Account Source e Registry, que o Remote Worker lê os caminhos de Config do mesmo Environment e que o Remote Host sincroniza a terceira camada de Account Overlay por `provider/updateAccountConfig`. Este último é uma sincronização de Config de Host para Worker dentro de um Environment, e não uma injeção do Desktop para o Remoto, e por isso foi mantido.

Os quatro itens remotos que ainda apareciam como pendentes no plano principal do M2 estão defasados em relação ao código e aos testes já concluídos nas seções 161 a 176; esta rodada os sincroniza como concluídos. O código de produção já não tem o writer `workspace/updateProviderRegistry` nem qualquer ponto de montagem para o `LegacyAccountProviderConfigSource`. Essa Source restava apenas como exportação pública e seus próprios testes unitários, mas ainda permitia que um chamador futuro reprojetasse o Snapshot completo antigo do Registry como um Account ProviderConfigMap.

Esta rodada removeu o `LegacyAccountProviderConfigSource` e seus testes. O antigo `ModelProviderService`, ao construir o Snapshot de compatibilidade que ainda não saiu completamente, precisa continuar convertendo o selected key de Family em `accessId`; essa função pura de conversão foi movida para um `legacyAccountAccessId.ts` independente e não fica mais misturada à Account Config Source. A verificação de referências dependentes confirmou que a Class removida não tem chamadores de produção; os novos testes da função pura e os 136 testes direcionados do antigo Model Provider Service passaram.

## 185. O Repo Wiki remove o fallback da Source de Registry antiga

O adaptador de Workspace Provider do Repo Wiki já injeta o `ModelSelectionService` do Environment ao qual pertence em todas as Entries de produção, e o antigo `providerRegistrySource` restava apenas como um ramo opcional sem chamadores de produção e com os testes correspondentes. Esse ramo permitia que uma Entry sem Provider Runtime continuasse tratando o Snapshot antigo como fato estático de modelo do Wiki, em conflito com a fronteira de autoridade já concluída no M2.8.

Esta rodada tornou `modelSelectionSource` uma dependência obrigatória e removeu a interface da Source antiga, o fallback e os fixtures de teste. O adaptador ainda projeta temporariamente a Selection View na forma de Snapshot que o interior do Repo Wiki ainda consome; isso é apenas uma adaptação estrutural do mesmo fato e não lê mais uma segunda fonte da verdade. Ao migrar os tipos internos do Repo Wiki, essa camada de forma histórica poderá ser removida.

## 186. Os testes do portão de inicialização começam a sair do Snapshot antigo do Registry

Ao auditar `ZCodeAgentService.providerRegistrySource`, confirmou-se que ele não tem mais montagem de produção, mas os testes ainda o mantinham respondendo por quatro responsabilidades: portão de inicialização, resolução de Runtime Model, hot update de Session e recuperação da verificação de segurança. Removê-lo diretamente faria mais de vinte testes de protocolo falharem com "Provider não está pronto" antes de realmente afirmarem qualquer coisa, impossibilitando distinguir uma regressão de semântica de produto de um fixture distorcido.

Esta rodada migrou primeiro os casos de portão de inicialização com fronteira clara. Os cenários de Provider indisponível, múltiplos Workspaces aguardando, Runtime somente leitura se tornando executável e inicialização do Account Request Auth passaram a usar `ModelSelectionReadinessSource`; os testes que precisam de mudanças dinâmicas de prontidão usam a change source da `ModelSelectionView`. Os testes de Runtime Model e de hot update continuam com a Source antiga, aguardando a próxima fatia, que os migrará por responsabilidade.

Um experimento de remoção também revelou que os testes de decisão concorrente do V4 usavam o número de chamadas do mesmo Source antigo como barreira de timing. Esse teste não foi reescrito à força e a alteração experimental de produção foi revertida; mais adiante deve-se fornecer um fixture oficial para a resolução de Runtime Model antes de remover a Source antiga. Os 34 testes migrados de Provider Registry e os testes isolados de portão de inicialização passaram.

## 187. O Helper de testes compartilhados do Agent separa Readiness de Runtime Model Source

Os fixtures compartilhados de `zcodeAgentService.test`, V4, Provider Runtime Header e Repo Wiki Lane injetavam apenas `providerRegistrySource`. O mesmo Snapshot antigo, portanto, decidia se o processo podia iniciar e fornecia também os dados de resolução de Runtime Model, e os testes tinham dificuldade de provar que a produção já é responsável pelo portão de inicialização via Selection View.

Esta rodada acrescentou explicitamente o `modelSelectionReadinessSource` a esses fixtures compartilhados. A Source antiga é mantida temporariamente apenas para o cache de Runtime Model, a recuperação de Header e a projeção de compatibilidade ainda em verificação. O caso de decisão concorrente de modelos do V4 contava antes com a leitura "portão de inicialização lê o Snapshot" no número de chamadas; após a separação, a primeira leitura do Registry antigo é a reconstrução do Runtime Model logo após o ACK do comando, e a barreira do teste foi ajustada à responsabilidade real.

Esta etapa não altera o código de produção. Ela continua reduzindo a superfície de migração de testes necessária para remover o fallback de readiness de `providerRegistrySource`; o trabalho restante está concentrado nos casos que constroem o antigo Runtime Model um a um em `zcodeAgentService.providerRegistry.test.ts`.

## 188. O portão de inicialização do Agent sai do Snapshot antigo do Registry

Os testes restantes de Provider Registry já distinguem explicitamente as duas entradas: o `ModelSelectionReadinessSource` responde apenas se existe algum modelo selecionável no processo atual, e o antigo `providerRegistrySource` fornece somente dados de compatibilidade para os casos de resolução de Runtime Model, recuperação de Header e hot update que ainda não foram migrados. Um novo caso de regressão prova primeiro que, injetando apenas um Snapshot antigo de Registry com um modelo, a implementação antiga ainda desbloqueia o Worker de forma incorreta.

Em seguida, o `ZCodeAgentService` de produção removeu a conversão de Registry para readiness, o disparo de início por Registry change e o desvio `startupRegistry`. O timing de inicialização fica fixado:

```text
ModelSelectionView
        |
        v
Host inicia o portão de entrada
        |
        v
Worker usa seu próprio Registry para resolver o Model novamente após iniciar
```

O Registry change event antigo ainda responde temporariamente pelo hot update de compatibilidade do Runtime Model de Sessions já existentes, mas já não consegue iniciar um Worker em espera. Trinta e cinco testes de Provider Registry e 92 testes de Agent Service, V4, Runtime Header e Repo Wiki Lane passaram.

## 189. O Host sai da reconstrução de Runtime Model e da hot sync

Ao continuar a auditoria, confirmou-se que o `ZCodeAgentService.providerRegistrySource` já não tem ponto de montagem de produção e que todo o comportamento restante é mantido por testes históricos. Ele ainda permite que o Host reconstrua `runtimeModel` a partir do Snapshot antigo do Registry, escute mudanças do Snapshot e atualize Sessions já existentes, além de deixar o recibo de autenticação dinâmica modificar por conveniência o Runtime da Session. Esses comportamentos fazem com que Host e Worker alvo interpretem cada um os fatos de Provider, em conflito com a ideia de que o Registry do Worker do Environment de origem é a autoridade de execução.

Esta rodada removeu a Source antiga, a construção de Runtime Model do lado do Host, a hot sync do Snapshot e as classificações de erro de Provider/Plan associadas. Sessões comuns, Workspaces, Bots V4 e requisições de Automations agora transmitem apenas `providerId/modelId/thought`, e Workers locais e remotos criam o Model pelo seu próprio Registry mais recente. A cadeia remota não recebe mais um `runtimeModel` local anexado pelo Desktop Host só por existir `workspaceIdentity`:

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

`resolveRuntimeModelForV4()` foi removido das APIs de Agent, Session e Task Adapter. Os pedidos de autenticação dinâmica continuam sendo respondidos pelo Host com a API Key/Header necessárias para esta requisição, mas sem atualizar o Runtime da Session. O `runtimeModel` execution-scoped fornecido explicitamente junto de um Submission ou comando V4 continua sendo repassado e é cacheado durante aquele trecho de execução; comandos de Selection comum limpam o cache temporário explícito anterior. Essa entrada temporária atende Providers de nível de execução, como os das tarefas ociosas, e não reintroduz o Registry do Host.

O código antigo mantinha um decision token para a reconstrução assíncrona do Runtime Model após o ACK. Com a etapa de reconstrução removida, a atualização do cache se resume a salvar ou limpar sincronamente o `runtimeModel` explícito, e esse pseudo-máquina de estados de concorrência foi removida junto. Os testes de regressão de Bot/Automation remotos passaram a afirmar explicitamente que a carga útil do protocolo contém apenas Selection e nenhum `runtimeModel` do Desktop; os 293 testes direcionados de Service e UI e a verificação TypeScript de todo o repositório passaram; o lint ficou com 0 error e 35 warnings já existentes sem relação com esta fatia.

## 190. Remover o protocolo de hot sync do Session Runtime Model

Depois que a reconstrução do Host Runtime Model foi removida, o `session/updateRuntimeModelConfig` ficou sem chamadores de produção. Ele ainda mantinha, no protocolo compartilhado e no Worker, um conjunto completo de handlers capaz de gravar qualquer `runtimeModel` em uma Session já existente e de mesclar Headers de nível de requisição no Workspace Model Overlay com `applyModelSelection=false`. Essas duas capacidades pertencem ao desenho antigo de hot sync do Host e de recuperação da verificação de segurança, e contornam o Registry do Worker e a fronteira de autenticação em tempo de requisição.

Esta rodada removeu o método de protocolo, os Schemas de parâmetro e resultado, a API do Service do Host, o dispatch e o handler do Worker. Na cold recovery, o ModelSelection histórico é resolvido pelo Registry do próprio Worker; quando o Registry atual não contém mais aquele modelo, a Session preserva a exibição histórica e reporta explicitamente a indisponibilidade, e o Host não pode mais "revivê-lo" temporariamente com uma configuração completa de Provider. Materiais de autenticação dinâmica, como API Key e o Header de verificação de segurança pontual, são resolvidos antes das requisições reais e entregues ao Adapter, sem serem gravados no Runtime da Session nem no catálogo estático de modelos.

A parte dos testes de protocolo antigos que afirmava que a cold recovery de um modelo indisponível recusa continuar o envio foi mantida; as asserções que dependiam de o Host corrigir o Runtime depois e de gravar o Header de verificação de segurança no Session Overlay foram removidas. Os 114 testes de protocolo do Bootstrap, os 12 testes de Provider Registry e a verificação TypeScript de todo o repositório passaram. Um comando de package test disparado por engano também executou a suíte completa do Bootstrap, que contém várias falhas existentes sem relação com esta fatia; depois disso, os arquivos afetados por esta mudança foram verificados com a entrada precisa do Vitest.

## 191. O eco de modelo do Workspace remove o arbitrador antigo de Provider Config

`resolveWorkspaceModelSelection` misturava a leitura do `config.json` GLM do workspace, a preferência de localStorage do Renderer e a lista antiga de Providers, decidindo por Provider ID, Base URL e nome do modelo se deveria exibir um ghost supplier. As chamadas de produção já foram unificadas no ZCode Agent e o ramo não-GLM está inacessível; ainda assim, o resolver lia a configuração GLM de forma fixa, seja qual fosse o Provider informado, Claude, Codex ou Gemini. Migrá-lo para o novo Model Selection Service reestabeleceria a configuração antiga de workspace como fonte da verdade de Provider.

Esta rodada removeu o resolver, o Parser, o Repo, o Helper, a API antiga do Service e os testes correspondentes de comportamento antigo. O reload do Workspace agora tem uma única cadeia de eco de modelo:

```text
prepare configOptions
        +
App Recent Model Selection
        +
Model Selection View do processo atual
        |
        v
Eco de modelo e supplier no Composer
```

A identificação de provider de Agente remanescente em sessões antigas é normalizada primeiro para o único `glm` atual e não dispara outra leitura de configuração. A Model Selection View é responsável por decidir se o Provider ainda é selecionável, a resposta de prepare expressa o modelo que o runtime atual já aceitou, e o App Recent só inicializa ou sobrescreve o Composer quando a prioridade existente permite. A Config antiga de Provider do workspace não participa mais dessa cadeia.

Novos testes de regressão cobrem a normalização da identificação antiga de provider, o eco do Provider atual, um Recent indisponível que não sobrescreve o resultado de prepare e a prioridade da resposta autoritativa após trocas de Start/Coding Plan. Doze testes direcionados de UI e de Provider Facade passaram, assim como a verificação TypeScript de todo o repositório.

## 192. Remover o Provider Runtime Header global

A cadeia oficial de Header pontual já obtém, antes de cada requisição de modelo, um Header único em `providerRuntimeHeaders.request/response`, e na recuperação apenas armazena temporariamente o novo Header para o workspace, a session e a próxima requisição correspondentes. O antigo `ModelProviderService` ainda expõe `setProviderRuntimeHeaders()`, que permite que a UI grave um Header pontual em um Map de nível de processo, invalide o Snapshot antigo do Registry e depois, por meio do Snapshot, projete o Header no modelo. Essa entrada não tem chamadores de produção, mas os testes ainda a descrevem como comportamento disponível.

Esse estado global destrói o escopo das credenciais pontuais:

```text
Cadeia antiga
Header único -> Map por Provider -> Registry Snapshot -> qualquer request posterior

Cadeia atual
Header único -> resposta do request especificado -> requisição do modelo correspondente
```

Esta rodada removeu a API do Service, o Map por Provider, os dois helpers de UI já desativados e seus testes. Headers de verificação de segurança da versão oficial que possam restar na configuração antiga de Provider continuam sendo removidos na projeção do Snapshot de compatibilidade, e a Authorization estática do Start Plan continua sendo obtida do Credential atual, sem ser mesclada com o Header pontual. A construção do Header de nível de requisição, a serialização de concorrência, o armazenamento temporário e a lógica de resposta permanecem inalteradas.

Ao todo, 161 testes direcionados de Provider Service, da máquina de estados de verificação de segurança da versão oficial e do helper de logs passaram. Mesmo que o Snapshot antigo do Registry ainda exista para poucos consumidores de compatibilidade, ele não pode mais carregar credenciais dinâmicas de requisição.

## 193. Corrigir o status do plano principal do M2.3c

Ao revisar o código atual, confirmou-se que os três itens marcados como "pendentes" no plano principal do M2.3c já foram concluídos pelas fatias de implementação anteriores:

- O Provider Config já usa `access.type`, `api.type` e o `apiAdapter` de nível de modelo, e as regras usam `apiMatch` para expressar o comportamento combinado de modelo/API.
- A Personal Config continua usando `~/.zcode/v2/config.json`. Na primeira leitura do formato antigo é criado primeiro um backup com hash de conteúdo e, depois, a única entrada de importação grava o documento oficial; a gravação usa substituição atômica e uma falha no backup ou na conversão não sobrescreve o arquivo original.
- O formato final usa `schemaVersion: 1` como primeira versão oficial, e os v1 a v5 da fase de desenvolvimento permanecem apenas no histórico, sem constituírem uma cadeia pública de migração de longo prazo.

Esta vez apenas o texto de status do plano principal foi sincronizado; nenhuma lógica de compatibilidade nova foi adicionada e o comportamento de migração dos arquivos existentes não mudou. O M2.3c ainda precisa concluir a auditoria de fechamento "mover todos os fatos estáticos válidos para Official / Personal Config e remover os ramos restantes de Catalog/Preset/hardcode"; essa auditoria é um item de trabalho diferente das trocas de Schema, caminho e versão acima.

## 194. Sair do evento global de mudança do Registry de Provider antigo

O antigo `IModelProviderService.onDidChangeProviderRegistry` não tem assinantes de produção. Ele existia para empurrar ativamente o Snapshot completo do Registry gerado pelo Service antigo para Host/Worker; o protocolo de sincronização de Runtime Model e as chamadas de produção correspondentes já foram removidos, e a nova Model Selection e a Provider Settings leem a Registry View por suas respectivas Facades.

Esta rodada mantém o cache de Snapshot dentro do Service antigo e continua fazendo com que salvar um Provider, atualizar o estado da conta e mudar o estado de planos invalidem esse cache; remove o evento externo, a lógica de construção assíncrona e envio do Snapshot e os dois testes que assinavam apenas o evento antigo. Assim a próxima leitura ainda obtém o Snapshot mais recente, mas uma mudança de Provider não reconstrói uma cadeia global de hot push de fatos. `getProviderRegistrySnapshot()` continua disponível para o caminho de compatibilidade de conectibilidade das configurações que ainda não migrou, e será removido depois que esse caminho passar a usar o novo Registry.

## 195. Remover a entrada antiga `applyToProvider`

`IModelProviderService.applyToProvider()` era usado para aplicar a seleção de modelo ao antigo Provider do Agente e carregava a validação de existência de ZAPI, Provider e Model. Hoje a execução local já leva a Selection pelo Submission e o Worker cria o Model pelo seu próprio Registry; não restam chamadas no código de produção do repositório, e a entrada antiga também não grava mais `~/.zcode/cli/config.json`.

Esta rodada removeu a interface, a implementação e os testes que cobriam apenas essa entrada de compatibilidade. O salvamento de Provider continua sendo responsabilidade do Settings Service, a validação de Selection continua a cargo do Model Selection Service/Registry e o teste de conectividade continua usando o `testModelConnectivity()` independente. A cadeia de compatibilidade do Snapshot antigo remoto já não tem chamadas de produção no código, e as explicações históricas relevantes são mantidas no mapa de chamadas para uso em auditorias de limpeza futuras.

## 196. Remover o arquivo antigo de Provider Display Order

Os antigos `IModelProviderService.getDisplayOrder()` e `saveDisplayOrder()` liam e gravavam um `model-provider-display-order.json` separado. A reordenação de Providers e de modelos na página de configurações atual já é feita diretamente pelo `ProviderSettingsService` modificando o Personal Config Overlay, e a ordem Efetiva é obtida pela resolução das camadas Official e Personal; o arquivo antigo de ordenação de exibição não participa mais da seleção de modelos nem da página de configurações.

Esta rodada removeu as interfaces antigas, as funções de leitura e gravação do Storage, o helper de caminho e os testes de falha de arquivo correspondentes. O `ModelProviderDisplayOrderState`, que ainda existe no Shared/UI, permanece apenas como forma de dados de compatibilidade da projeção da página de configurações e não significa que o arquivo antigo continue existindo.

## 197. Corrigir o status de identidade de conta do M2.3d

Ao revisar os quatro itens de identidade de conta do plano principal do M2.3d, confirmou-se que eles já foram concluídos em conjunto pela Account Source, pelo Request Auth, pelo Credential Store e pela cadeia de Usage atuais, e que o texto original do plano estava atrasado em relação à implementação:

- A Account Source usa `createAccountScopedAccessId()` para gerar a identidade com escopo de conta; ela permanece estável quando as credenciais da mesma conta são renovadas e gera um novo `accessId` quando a conta é trocada.
- O `AccountProviderRequestAuthService` valida antes da requisição a correspondência entre Provider e `accessId` e verifica a identidade atual da conta OAuth; a organization/project do Team é resolvida a partir do mesmo `accessId` e passada ao resolvedor de Team Key.
- A Personal Coding Plan API Key usa o `accessId` com escopo de conta como chave do Credential Store. A key antiga em nível de Provider é usada apenas na leitura do período de migração e não participa dos fatos das novas requisições.
- Usage, Entitlement, Team Products e as requisições de cache relacionadas carregam o `accessId` com escopo de conta, e as requisições de Team preservam ao mesmo tempo o contexto de organization/project, sem introduzir uma identidade de cache de conta paralela.

Esta rodada sincroniza apenas o status e as evidências de implementação, sem alterar a lógica de runtime. O que ainda precisa ser tratado separadamente é a leitura de compatibilidade do antigo `ModelProviderService` e a saída final das entradas remota e do período de migração; a identidade de conta em si não deve mais ser listada como item pendente.

## 198. Completar a projeção da capacidade de vídeo do Registry para o Adapter

O M1 já incluiu `supportsVideo` em `Model.properties`, e a camada de Model também rejeita, antes de a requisição entrar no executor, modelos que declaram não suportar vídeo. Mas o `inputMediaCapabilities` compilado pelo Registry para o AI SDK Adapter carregava apenas imagem e PDF; ao passar diretamente pela conversão de requisição do Adapter, a capacidade de vídeo não podia mais aproveitar a mesma Registry Model Config.

Esta rodada acrescentou `supportsVideo` à estrutura de capacidades de mídia do Adapter e passou a repassá-lo integralmente na conversão de mensagens do Registry Model Runtime, das requisições geradas e das requisições de streaming. A cobertura de Provider em nível de execução passou a usar o mesmo campo. Assim, a validação de propriedades na camada de Model e a projeção de mídia na camada de Adapter leem o mesmo fato de capacidade, sem mudar a semântica já existente de que um false explícito omite a mídia e uma ausência de declaração mantém a compatibilidade.

Doze testes do Registry Runtime do Bootstrap e 69 testes de runner/transform do Adapter passaram. Esta rodada não tocou nos caminhos de compatibilidade do Catalog antigo ou do Provider Service.

## 199. Reverificar as referências restantes ao Model Catalog antigo

Esta rodada reexaminou as referências de produção a `ModelCatalogService`, `modelCatalog.overrides`, ao snapshot empacotado de models.dev e ao antigo `model-providers.json`. O resultado precisa ser entendido em duas categorias.

Nos caminhos de produção em que `providerRegistry` já está montado, os dados críticos de seleção e execução de modelos são fornecidos pelo novo Registry:

```text
Provider Registry
├─ listModels -> ModelSelectionView
├─ model properties / option specs -> Registry Model
└─ createModel -> Provider Model Runtime
```

`create-app.ts` desliga `includeLegacyProviderModels` nessa condição, o `ApiProviderModelRuntime` fica responsável por executar os modelos e o ramo de Registry do Session Facade responde pela seleção de modelos e pelos níveis de reasoning. Portanto, o antigo `ModelCatalogService` não é mais a fonte da verdade dessas cadeias principais.

O código antigo do Catalog ainda tem as seguintes referências de compatibilidade:

- A montagem antiga de App/CLI que não injeta `providerRegistry` ainda constrói capacidades de modelo por `model-selection.ts`, `model-input-capabilities.ts` e `runtime-model-factory.ts`;
- As funções auxiliares de migração, eco e protocolo histórico do catálogo de workspace ainda precisam converter estruturas antigas em projeções de capacidade;
- A Runtime Config antiga ainda mantém a interpretação de `modelCatalog.overrides`, para sustentar as entradas de compatibilidade que ainda não migraram para o novo Registry;
- A leitura de `model-providers.json` do antigo `ModelProviderService` ainda serve como migração única da Personal Config e como fronteira de serviços legada.

Por isso esta rodada não remove esses módulos nem os reconecta à cadeia principal do Registry. A posição atual deles é a de "runtime de compatibilidade sem Registry montado e adaptador de migração única", e não a de outra fonte de verdade de Providers de produção paralela.

Antes da remoção é preciso provar separadamente duas coisas: que todas as Entries que ainda podem iniciar injetam o Registry, e que a migração de arquivos antigos, a recuperação histórica de workspace e os testes de compatibilidade já não precisam da estrutura antiga de Catalog. Nesse momento a remoção deve ser feita por ponto de chamada, item a item, e não pela remoção global com base no nome da classe `ModelCatalogService`.

## 200. Completar o atributo de vídeo nos caminhos de capacidade de compatibilidade

A rodada anterior já havia projetado `Model.properties.supportsVideo` do novo Registry para a estrutura de capacidades de mídia do Adapter; ao continuar verificando o caminho de compatibilidade sem Registry montado, descobriu-se que `model-input-capabilities.ts` ainda coletava apenas imagem e PDF. Assim, o `supportsVideo` de um mesmo modelo se perdia no caminho antigo de CLI/modelo temporário e a política final de entrada de vídeo do Core não recebia o resultado de configuração.

Esta rodada sincronizou quatro fronteiras:

- o `modalities.input` de models.dev converte `video` na capacidade do Catalog antigo;
- a mesclagem de Catalog Override preserva `supportsVideo`;
- a resolução de capacidade de compatibilidade em runtime repassa `supportsVideo` entre configuração explícita, Catalog e projeção padrão;
- a projeção antiga de seleção de modelos leva esse atributo até o `ZCodeModelOption`.

A mudança apenas completa um atributo de mídia já determinado, sem alterar a cadeia principal do Registry e sem ampliar as responsabilidades de fato do Catalog antigo. Novos casos de regressão cobrem o fato de vídeo de models.dev, o Override explícito de vídeo e a projeção de seleção de modelos.

## 201. Remover a entrada pública de atualização dos Presets antigos

`IModelProviderService.refreshPresetProviders()` não tem mais chamadores de produção. Os novos Host, Worker, Prompt CLI e TUI acionam a atualização do Registry por meio das Official, Personal e Account Source, respectivamente; manter esse método publicamente exposto permitiria que qualquer consumidor de RPC voltasse a disparar a sincronização antiga de Presets e a reescrever o Provider Store antigo.

Esta rodada removeu a interface e o método público do objeto retornado pelo Service. O `getAll()` antigo continua chamando internamente a função privada de atualização de mesmo nome, que atende apenas a migração única e as leituras de compatibilidade ainda não removidas; essa função interna não pode mais ser chamada ativamente por `IModelProviderService` ou por RPC. Isso estreita a superfície de produção da antiga fonte da verdade sem alterar a importação da Personal Config nem o comportamento de primeira leitura das entradas antigas.

## 202. O teste de conectibilidade das configurações sai do Provider Service antigo

A nova cadeia de configurações já obtinha os fatos estáticos de Provider pela Provider Settings View e resolvia as credenciais em tempo de requisição pelo `accessId` do Account Overlay; mas o último passo ainda chamava `IModelProviderService.testModelConnectivity()` e usava `requestAuthResolved: true` para impedir que o Service antigo relesse o Snapshot de Provider. Esse interruptor de compatibilidade mantinha o Snapshot antigo como dependência indireta da sondagem de rede.

Esta rodada definiu a sondagem única após a autenticação como um `ProviderSettingsConnectivityProbe` estreito. A camada de composição fica responsável pelas credenciais de Account e pelos Headers de requisição, enquanto o Probe recebe apenas o rascunho de configurações atual, o modelo e a API Key desta tentativa, tratando a validação de entitlement do Start Plan, a verificação de segurança da requisição e a sondagem real do endpoint. A montagem de produção cria o Probe diretamente, sem injetar o antigo `ModelProviderService` na cadeia de configurações e sem passar `requestAuthResolved`. O método de mesmo nome do Service antigo fica para os testes de compatibilidade ainda não removidos e para o canal antigo remoto; ele já não é dependência de produção da nova funcionalidade de configurações e o método antigo e o construtor completo do Snapshot poderão ser removidos independentemente mais adiante.

## 203. Remover a API antiga de teste de conectibilidade

Depois da seção anterior, `IModelProviderService.testModelConnectivity()` ficou sem chamadores de produção. Ele acumulava a leitura do Snapshot de Provider, a reescrita de credenciais de Account/Team, o julgamento de entitlement do Start Plan e a sondagem de rede; manter essa entrada pública permitiria que chamadores fora da cadeia de configurações continuassem dependendo da combinação de fatos do Provider Service antigo.

Esta rodada removeu a interface, a implementação e a entrada de compatibilidade do Host remoto. O comportamento de conectibilidade não foi removido: a sondagem de protocolo genérica, o reasoningMapping de nível de modelo, a disponibilidade do Start Plan e a verificação de segurança da requisição agora são cobertos pelo `ProviderSettingsConnectivityProbe` independente. Os novos testes do Probe verificam diretamente o comportamento com o apiFormat atual, com o reasoningMapping e quando as regras de nome de modelo não casam; as credenciais de requisição de Account/Team continuam cobertas pelos testes existentes de `accountProviderRequestAuthService` e `accountProviderTeamPlanRequestKey`.

Esta etapa estreitou as responsabilidades do Provider Service antigo sem alterar a semântica de produto do envio do rascunho pela página de configurações, da autenticação em tempo de requisição ou da sondagem de rede. A implementação do Snapshot antigo do Registry continua existente isoladamente; a próxima etapa continua auditando seus testes e referências de compatibilidade para decidir o escopo da remoção.

## 204. Remover o Snapshot antigo do Provider Registry

Depois de concluída a migração da conectibilidade das configurações, `getProviderRegistrySnapshot()` ficou sem consumidores de produção. As chamadas restantes existem apenas na interface do antigo `ModelProviderService`, no construtor de cache e em testes que validam especificamente esse Snapshot; Host, Worker, Selection, Settings e execução de Model já usam a nova cadeia Registry/Facade.

Esta rodada removeu do Service antigo a interface de Snapshot, o cache, a invalidação por geração e o construtor do Snapshot completo, e removeu os testes que validavam apenas a projeção do Snapshot antigo, a sobrescrita de credenciais de runtime antigas e a inicialização concorrente antiga. O tipo de protocolo `ZCodeProviderRegistrySnapshot` e a entrada de compatibilidade do Repo Wiki são mantidos por enquanto, porque ainda são formas de dados históricas independentes; eles não são mais gerados pelo `ModelProviderService` e não participam mais da criação atual de Model.

Após a remoção, restaram 100 testes do Model Provider Service, cobrindo a migração do Store antigo, a sincronização de predefinições, a disponibilidade de Account e o comportamento de escrita Personal. O arquivo de teste passa quando executado isoladamente; ao ser executado em paralelo com outros testes com atualização de entitlement em segundo plano, a limpeza temporária de diretório existente sofre uma corrida `ENOTEMPTY`, que deve ser tratada depois como problema de isolamento de testes, sem restaurar a camada de compatibilidade do Snapshot.

## 205. Limpar os resíduos de teste da API antiga de Snapshot

Depois da remoção de `getProviderRegistrySnapshot()`, o código de produção não tem mais chamadores dessa API; os testes de UI ainda a mantinham em vários mocks de serviço, e os testes de troca de modelo ainda guardavam asserções de configuração, reset e "não deve chamar" para ela. Esses resíduos fariam uma interface já retirada parecer ainda pertencer à fronteira atual dos serviços e mascarariam o conjunto mínimo de serviços de que os testes realmente dependem.

Depois que a API antiga de Snapshot foi limpa, as dependências de produção restantes se concentram em dois caminhos de migração/compatibilidade:

1. O `ProviderConfigRuntime` do Local Host, quando a Personal Config ainda não tem uma versão oficial, chama `modelProviderService.getAllCached()` para ler o Provider Store antigo, converte o resultado em uma Personal Config esparsa e completa o backup e a escrita atômica no mesmo caminho. Depois que a Config oficial existe, esse callback não é executado novamente.
2. O Host de compatibilidade local de `remoteWorkspaceServiceCollection` fornece
   um fallback para o Provider Store antigo a `AccountProviderCredentialStore.loadApiKey()`; o mesmo arquivo também usa o antigo `ModelProviderService` como entrada de limpeza do período de migração para o logout OAuth. Esse caminho atende as fronteiras locais de Usage/OAuth do Host de compatibilidade e não é a fonte da verdade para o Remote Worker criar Models; o Registry e o Request Auth do Remote Worker continuam lendo o Environment ao qual pertencem.

Portanto, esta rodada não remove essas duas entradas nem as reinterpreta como origens do Registry. Para removê-las é preciso confirmar antes, separadamente, que todas as Entries que podem iniciar já concluíram a migração da Personal Config e que a limpeza das credenciais antigas de conta do Host de compatibilidade não será mais dependente de consumidores internos. Caso a saída seja feita adiante, a limpeza de credenciais antigas do Host remoto de compatibilidade deve virar primeiro um serviço de migração independente, e só então os métodos correspondentes de `IModelProviderService` devem ser removidos, evitando misturar a migração única e o fato de Provider de longo prazo em uma única alteração.

## 207. O logout OAuth sai da limpeza do Provider Store antigo

Ao continuar examinando a superfície de chamadas acima, confirmou-se que a chamada de `ModelProviderService.clearCodingPlanApiKey()` no logout OAuth apenas reescrevia uma key derivada no Provider Store antigo no momento do logout. A nova autenticação de requisições lê o Credential Store com escopo de conta, e a Account Source é responsável por republicar a disponibilidade; a limpeza do Store antigo não afeta o Registry, o Model ou as credenciais de requisição atuais.

Agora o logout depende apenas de `AccountProviderCredentialStore.deleteApiKey()` e da atualização da Account Source, e as injeções de logout do `remoteWorkspaceServiceCollection` e do `remoteConnectionServiceCollection` para o Service antigo foram removidas, junto com os testes que validavam apenas a reescrita do Store antigo. A implementação de `clearCodingPlanApiKey()` do próprio `IModelProviderService` é mantida por enquanto, para chamadas internas antigas do período de migração e para uma limpeza posterior separada; ela já não é uma dependência de produção do logout OAuth.

## 208. Limpar os mocks de Coding Plan API que já saíram da UI

Os testes OAuth da página de configurações já validam o logout e a atualização da Account Source e não chamam mais o antigo `refreshCodingPlanApiKey` / `clearCodingPlanApiKey`. Esta rodada removeu esses mocks, resets e asserções de "não deve chamar", preservando as asserções reais de login, desvinculação, atualização e leitura de credenciais. Os nove testes de configurações passaram.

Os métodos antigos do Service e seus testes históricos específicos não foram removidos nesta rodada; eles ainda precisam ser reclassificados conforme o novo fluxo de Account Provider, para evitar que os testes de decisão de entitlement sejam removidos por engano.

## 209. Limpar os mocks antigos de Provider Store nos testes do V4

O mesmo lote de testes do V4 construía mocks vazios para `modelProviderService.getAllCached()`, mas esses casos já validam a restauração de modelos, o pré-aquecimento de drafts e o portão de erro por meio dos serviços de Selection/Settings e não leem de fato o Provider Store antigo. Esta rodada removeu esses mocks inválidos; os dez arquivos de teste afetados, totalizando 113 testes, passaram. As entradas de migração de produção não são afetadas.

## 210. Remover as APIs antigas de atualização e limpeza da Coding Plan Key

OAuth, a página de configurações e os Account Providers já concluem, respectivamente, a atualização de login, a publicação de disponibilidade e a autenticação em tempo de requisição por meio do Account Credential Store, da Account Source e do Request Auth. Os antigos `IModelProviderService.refreshCodingPlanApiKey()` e `clearCodingPlanApiKey()` não têm mais chamadores de produção; o comportamento que resta é reescrever credenciais dinâmicas e resultados de entitlement de volta no Provider Store antigo, e mantê-los deixaria os fatos de conta já separados convergirem novamente para a configuração estática antiga.

Esta rodada removeu os dois métodos públicos, a implementação do Service, as injeções de dependência antigas e 29 testes que afirmavam o resultado da reescrita do Store antigo. Antes da limpeza dos testes, as regras de produto ainda válidas foram migradas para `codingPlanProviderAvailability.test.ts`, cobrindo diretamente Z.ai Start/Coding não conectados, entitlements mutuamente exclusivos, a preservação do resultado do Start quando a consulta de Coding falha temporariamente e a preservação do estado de conexão anterior quando a validação do Team Project selecionado falha temporariamente. As regras de entitlement continuam sendo chamadas pelo novo Account Connection Resolver e não dependem mais dos efeitos colaterais de atualização do Service antigo. O Emitter de Account Facts antigo e os helpers de motivo de desconexão, que perderam consumidores junto com as duas entradas, foram removidos em conjunto, para que o Service antigo não continue sugerindo que publica fatos de conta.

A sincronização antiga de Presets e o cache de Entry Status dentro de `ModelProviderService.getAll()` são mantidos por enquanto; eles atendem a primeira importação da Personal Config e às leituras de compatibilidade ainda não retiradas e não oferecem mais entradas públicas de atualização ou limpeza. Seis arquivos de teste relacionados, totalizando 98 testes, passaram, e a build TypeScript completa passou.

## 211. A migração única da configuração antiga sai do ModelProviderService

Os dois consumidores reais do Service antigo precisavam apenas ler o armazenamento físico antigo, sem sincronização de Presets, Entry Status, filtro de Family ou qualquer projeção de runtime. A primeira importação da Personal Config do Local Host passou a chamar diretamente o antigo Store Reader, e a entrada de migração passou a conter apenas os valores de Provider do próprio arquivo antigo, sem passar por `getAllCached()` e sem misturar o estado de entrada de conta.

O lado local do Remote Workspace mantém uma migração única para a Personal Coding Plan Key histórica. Essa cadeia ganhou a função estreita `loadLegacyAccountProviderApiKey(providerId)`, que lê apenas a Key antiga do Provider especificado e a entrega ao Account Credential Store para gravar a credencial com escopo de conta. O Remote Workspace não constrói mais nem registra um `ModelProviderService` local antigo para isso, as fábricas correspondentes e os testes que validavam apenas o comportamento antigo de Preset/ZAPI saíram junto, e a seleção de modelos e as configurações continuam usando diretamente os serviços de Registry do Remote Environment alvo.

Novos testes de leitura estreita da Key antiga foram adicionados, com regressão do Account Credential Store, da montagem de serviços do Remote Workspace e da primeira migração da Provider Config. Três arquivos de teste, totalizando 13 testes, passaram, e a build TypeScript completa passou.

## 212. Remover a superfície de serviço público do ModelProviderService antigo

Depois de concluída a primeira importação da Personal Config e de isolada a migração da Key de Account antiga, o código de produção já não precisa mais das capacidades de configuração, Snapshot, sincronização de Presets, conectibilidade ou resolvers de runtime do antigo `IModelProviderService`. Manter essa camada de Accessor, RPC, proxy do Host e registro de serviços apenas continuaria fazendo com que uma fonte da verdade de Provider já retirada parecesse continuar fazendo parte da arquitetura atual.

Esta rodada removeu os tipos públicos do `IModelProviderService`, a implementação do Service, a sincronização de Presets, os Helpers do Service antigo, o canal RPC, a exposição por Accessor/Proxy e os registros de montagem do Local Host, do Remote Workspace e do Server; também removeu os testes que validavam apenas esses comportamentos antigos. Os mocks antigos de service nos testes de Web/Renderer/Host foram removidos em conjunto, e os testes passaram a validar as fronteiras atuais de Model Selection, Provider Settings e Account Request Auth. O arquivo físico `modelProviderServiceStorage` é mantido, com a responsabilidade estreitada para leitura de migração única e escrita de dados de compatibilidade; ele não participa mais da construção de fatos de Provider em runtime por meio de uma instância de serviço.

Esta etapa não alterou a lógica atual de seleção de modelos, salvamento de configurações ou autenticação em tempo de requisição; ela apenas removeu entradas públicas que já não tinham consumidores de produção. Os testes afetados passaram e a build TypeScript completa passou.

## 213. Estreitar a fronteira de escrita do Store antigo

Depois da remoção do `ModelProviderService` antigo, `modelProviderServiceStorage.writeProviders()` ficou sem chamadores de produção. A escrita no Store antigo fazia parte de um longo serviço de configuração de Providers; na arquitetura atual, a escrita de configuração em runtime é responsabilidade do Personal Config Repository e da Provider Settings Facade, e o Store antigo suporta apenas a entrada de migração e a gravação interna durante a migração.

Esta rodada removeu essa função pública de escrita e converteu o teste de escrita atômica existente em uma leitura-migração real disparada pelo antigo `model-providers.json`, continuando a validar o retry de rename do Windows, a limpeza do arquivo temporário e o fato de que o Provider Config oficial, depois de assumir o caminho original, não é sobrescrito pela migração antiga. O arquivo de armazenamento físico mantém suas funções internas de leitura e migração até que todas as entradas de migração de compatibilidade saiam.

## 214. O salvamento das Settings passa a usar a Configuração Efetiva estruturada

A página de configurações entregava antes o formulário antigo `ModelProviderConfig` diretamente ao Provider Runtime, e o Runtime chamava internamente o adaptador de migração única. Isso mantinha o tipo de formulário antigo como o protocolo de escrita do Settings Service e dava a Official Providers e a Providers somente-Personal duas entradas de salvamento distintas.

Esta rodada acrescentou `ProviderSettingsFacade.saveEffectiveProvider()`. Ele recebe o estado de edição estruturado e completo de Provider e Model, calcula um Personal Overlay esparso sobre a Official Config do Snapshot atual do Registry e substitui atomicamente, em uma única operação via `ProviderConfigService.replacePersonalConfig()`, o Provider e os ModelConfigs precisos correspondentes. O Renderer ainda pode usar temporariamente o formulário antigo, mas a lógica de conversão foi recolhida em `providerPersonalSave.ts`; o Provider Service não conhece mais o formulário antigo e não oferece mais `saveLegacyPersonalApiProvider()` nem `importLegacyProviderFormConfig()`.

Esta etapa não alterou o comportamento de produto da página de configurações: a ordenação após o salvamento, as propriedades de modelo, as regras de reasoning e os Overrides Official continuam sendo exibidos conforme a Effective View atual; a mudança está apenas na fronteira de escrita, e a Personal Config deixa de salvar campos padrão expandidos a partir da Official Config. A criação e a renomeação de Providers, a sobrescrita de Official Providers, a configuração precisa de modelos e a substituição atômica são cobertas pela mesma cadeia de Facade. Os testes relacionados de Provider, Services e Renderer passaram, o `pnpm typecheck` passou e o lint manteve 0 error.

## 215. Auditoria de fechamento das fontes da verdade de produção de M2.3c / M2.5c

Esta rodada fez uma auditoria da superfície de chamadas dos dois itens que ainda apareciam como "em implementação" no plano. O caminho de produção de um API Provider comum passa uniformemente pelo `ApiProviderModelRuntime` quando existe um `ProviderRegistry` de processo; `provider-registry-app-runtime.test.ts` já cobre a criação de Model pelo Registry, o erro direto para modelo ausente, a não entrada do antigo Workspace Overlay no Registry de execução e a reutilização do mesmo Registry de processo pelos Runtimes filhos de Workflow. `createRuntimeModelFactory` ainda aparece em `turn-execution-model-source.ts`, mas ele responde apenas pela fonte de modelos temporários no período de execução e pertence ao escopo posterior de Provider execution-scoped, não à leitura de fatos de um Provider comum de longo prazo.

Ao mesmo tempo, confirmou-se que os modelos e mapeamentos padrão restantes em `presetModelDefaults.ts`, no antigo `modelProviderServiceStorage` e no código auxiliar de Preset que ainda tem consumidores são usados apenas pela migração única Personal/Account ou por Entries internas de compatibilidade que ainda não montaram o novo Registry. Eles não participam da resolução de Provider/Model do novo Registry e não sobrescrevem os novos fatos de configuração Official/Personal/Account. Nenhum código foi removido aqui porque os compatibilizadores internos de CLI/TUI/avaliação ainda dependem dessas entradas; a remoção deve ser marcada para depois que os consumidores correspondentes migrarem, e a perda da entrada de migração deve ser verificada separadamente.

Portanto, tanto o M2.3c quanto o M2.5c podem ser marcados como concluídos. O objetivo de limpeza seguinte é retirar os consumidores de compatibilidade, e não continuar modificando a cadeia de resolução de produção do Registry.

## 216. Remover o OAuthPresetProviderRepo sem consumidores

A auditoria de referências em nível de símbolo confirmou que tanto `OAuthPresetProviderRepo` quanto `createOAuthPresetProviderRepo()` não têm consumidores estáticos, e que o repositório também não possui import dinâmico nem carregamento por string desse módulo. Esse Repo antigo lia simultaneamente o OAuth Token, buscava Providers remotos, montava modelos e mapeamentos de Preset, resolvia a Coding Plan Key e produzia o antigo `ModelProviderConfig`. Essas responsabilidades são hoje exercidas, respectivamente, pela Account Config Source, pela Account
 Credential Service, pelo Request Auth e pela Official Model Config.

Esta rodada removeu o Repo antigo inteiro, além dos Provider Meta, da lista de Providers e dos tipos dependentes que existiam apenas para ele; foram mantidos o Remote Client, o Provider Resolver, os tipos de Team Plan e os shared helpers que ainda são usados pela autenticação de requisições atuais. `presetModelDefaults.ts` e as partes do Store antigo que ainda têm consumidores continuam restritos à fronteira de migração única/compatibilidade e não foram removidos por engano nesta rodada.

Após a remoção, a verificação TypeScript dos Services passou, e os quatro arquivos de teste de Account Credential, Request Auth, Team Plan Key e Preset Shared, totalizando 21 testes, passaram. Esta fatia não altera o comportamento de produto dos Account Providers; ela apenas remove um segundo construtor que já havia perdido sua entrada.

## 217. O Provider Store antigo sai da sincronização de Preset em estado estável

A auditoria de referências em nível de símbolo confirmou que o antigo `modelProviderServiceStorage` expõe externamente apenas `readProviders()` com consumidores de produção. Esses consumidores leem, respectivamente, a entrada de migração única da Personal Config e a Key histórica de Account Provider; a coleta de modelos de Preset, a mesclagem de modelos remotos, o Upsert de Providers OAuth, a injeção de Fallback Providers e a fila de escrita pública já não têm chamadores. Essa lógica, se mantida, deixaria regras de montagem de Providers em estado estável e listas de modelos hardcoded dentro da fronteira de armazenamento de migração.

Esta rodada removeu a cauda de sincronização em estado estável sem consumidores do Store antigo, preservando a leitura de múltiplas versões do Schema antigo, a migração do arquivo físico, a leitura da Key de Account antiga e a normalização de campos históricos que ainda precisa acontecer durante a migração. Com a saída da sincronização antiga, a lista de modelos padrão, o filtro de modelos gerenciados e a construção de mapeamentos Claude foram removidos em conjunto; `presetModelDefaults.ts` mantém apenas a identificação de Provider e a correção de contexto do GLM-5.2 ainda usadas pela migração de arquivos antigos.

Esta etapa não alterou o comportamento atual do Registry, da página de configurações, da execução de modelos nem da autenticação de conta; ela apenas estreitou ainda mais o Store antigo a uma fronteira de migração única. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os três arquivos de teste de migração atômica do Store antigo, de importação da Personal Config e de migração da Account Key, totalizando 7 testes, passaram.

## 218. A Key de Account Request sai do Remote Client de Preset antigo

Depois da remoção do `OAuthPresetProviderRepo` antigo, a resolução da Key de conta ainda usava o Remote Client e o Provider Resolver que ele havia separado. A auditoria da superfície de chamadas confirmou que o código de produção usa apenas a requisição genérica à interface de negócio e `resolveProviderApiKey()`; `release/latest`, `client/configs`, a conversão de fatos remotos de Provider/Model, a construção do Preset ZAPI e a construção do Endpoint do Coding Plan não têm mais consumidores. Mantê-los formaria uma aparente fonte de fatos de Official Provider remoto ainda funcional, em conflito com a Official Config versionada atual.

Esta rodada estreitou as capacidades restantes e as renomeou conforme sua função atual, como `AccountProviderApiClient` e `AccountProviderApiKeyResolver`. O primeiro interpreta apenas o Envelope da interface de negócio, e o segundo apenas obtém ou copia a Coding Plan API Key com o Token da conta. O cache de Config Version, o carregamento de Client Config e a construção de Providers do Remote Client antigo foram removidos; os tipos remotos de Provider, o módulo de encaminhamento de configuração, as funções de conversão compartilhadas e os testes que existiam apenas para essas capacidades saíram junto. A correção da URL histórica do BigModel ainda usada pela migração do Store antigo continua dentro do arquivo de migração, e a seleção de projetos pessoal e o julgamento de códigos de status de negócio foram realocados respectivamente para o Account Key Resolver e o Account API Client.

Esta etapa não altera a semântica de Account Connection, Credential Store ou autenticação em tempo de requisição. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os seis arquivos de teste de Account Credential, Request Auth, Team Plan Key e migrações Personal/Account, totalizando 19 testes, passaram.

## 219. As constantes de modelos de Preset passam para a fronteira de migração de arquivos antigos

Depois da limpeza do Store em estado estável e da construção de Config remota, `presetModelDefaults.ts` ficou com apenas três consumidores, todos dentro da migração do arquivo antigo de Providers: reconhecer o Provider GLM histórico, reconhecer o Provider de Plano histórico com contexto fixo e corrigir o valor de contexto histórico do GLM-5.2. Essas regras já não constituem valores padrão atuais de Provider e não deveriam continuar existindo na forma de um módulo reutilizável.

Esta rodada removeu o arquivo e inlinou as três regras como funções privadas com semântica `legacy` dentro de `modelProviderServiceStorage`. O novo Registry, a Official Config, o Account Access e a execução de modelos não podem mais referenciar essas regras. A verificação TypeScript dos Services e o lint dos arquivos tocados passaram, e os três arquivos de teste de migração atômica do Store antigo, de importação da Personal Config e de migração da Account Key, totalizando 7 testes, passaram.

## 220. Auditar as fronteiras restantes de Client Config e Account Access / Off-Peak

Depois que a Config remota de Preset antiga saiu, o repositório ainda tem serviços de planos requisitando `client/configs` e lendo `builtinModels`. A auditoria da cadeia de chamadas confirmou que esses dados não constroem mais um Provider comum de longo prazo nem entram no Registry de nível de processo: o `billing/balance` do Start Plan apenas projeta os Model IDs que a conta atual pode usar como filtro `models` do Account Provider Overlay, e as Properties de modelo, os Option Specs e as regras de Adapter continuam vindo da Official / Personal Config.

`client/configs.configs.offPeak.allowed_models` e os `builtinModels` da mesma resposta são usados hoje apenas para construir os `allowedModelConfigs` temporários das tarefas ociosas. Isso é enviado com a requisição da tarefa como `turnRuntimeModel` e pertence à entrada de compatibilidade de um Provider execution-scoped, migrada depois para a cadeia unificada de Config temporária / ModelFactory pelo M4. Ele não deve ser gravado de volta no Registry de longo prazo nem ser tomado, no M2, como uma fonte de fato de Official Provider comum a ser removida.

Portanto, a fonte da verdade comum de longo prazo do M2 continua única: as três camadas de Config Official, Personal e Account Access. Os últimos metadados de modelos remotos têm apenas escopo de execução, e sua condição de saída é gerida pelo M4.

## 221. Implementar o Human in the Loop: reverter a camada de embrulho ModelConfig.apiAdapter

Os itens 11 e 12 do Human in the Loop já deixaram explícito que a camada de configuração não deve introduzir `ModelApiAdapterConfig` e que `reasoningMapping` pertence diretamente ao `ModelConfig`. O código e a Official Config ainda usavam `model.apiAdapter.reasoningMapping`, fazendo com que uma camada de embrulho cuja reversão já havia sido decidida continuasse sendo a forma de fato do Schema público, da projeção diferencial Personal, da projeção de Settings e do Registry Model Runtime.

Esta rodada restringiu a cadeia de configuração a:

```text
ModelConfig
├─ properties
├─ optionSpecs
└─ reasoningMapping
```

O Overlay, a validação de integridade, a interpretação do Schema, a projeção diferencial da Personal Config e o Registry Runtime agora leem `reasoningMapping` diretamente. Quando um modelo declara `optionSpecs.reasoningLevel`, o caminho de erro de integridade aponta também diretamente para `reasoningMapping.<level>`. As 44 regras da Official Config passaram do objeto de embrulho para o campo direto, e o antigo `preserveThinking` e o `reasoningContentField` não foram migrados para o novo formato.

A importação da Config antiga da CLI e do Desktop ainda preserva formalmente o `reasoningLevel` e o resultado do mapeamento, mas grava diretamente nos novos campos. A alteração não muda os parâmetros de Reasoning recebidos pelo Adapter e não muda a ordem das regras de `apiMatch`, a projeção de namespace do AI SDK ou os parâmetros de compatibilidade existentes de GLM/Anthropic; ela remove apenas um nível de configuração cuja reversão já havia sido decidida pela pessoa. Os testes direcionados de Provider, Bootstrap, Services e UI passaram, e o novo Provider Config não aceita mais `apiAdapter` como campo.

## 222. Auditoria de fechamento do Human in the Loop

Ao revisar a implementação atual item a item, confirmou-se que as decisões dos itens 1 a 13 do Human in the Loop que afetam os Providers comuns de longo prazo do M2 já foram implementadas: o Account Config reutiliza o Overlay de três camadas, o Registry mantém o last-known-good, Options arbitrários de Model, Headers de nível de modelo e interruptores de Usage saíram, o `accessId` em nível de conta, a autoridade de Provider remota, o desacoplamento de Usage, a estratificação `access/api`, a Config oficial v1 e o `reasoningMapping` direto já entraram na cadeia de produção.

O item 14 descreve o Builtin Provider das tarefas ociosas e o material de autenticação em nível de Turn. Ele pertence à refatoração de Provider execution-scoped do M4; o M2 atual garante apenas que a fonte temporária não entra no Registry de longo prazo e não desenha antecipadamente a capacidade de autenticação nessa rodada. O padrão `GLM-5.2` hardcoded após o login Standalone também pertence à estratégia de inicialização de Selection e será alterado depois, na fase de Interaction, para ser produzido a partir dos candidatos do Registry, sem continuar se espalhando como fato estático de Provider.

O código restante no Bootstrap que completa capacidades de Reasoning/mídia pelo nome do modelo atende apenas as Entries antigas ainda não migradas e o modelo temporário de Turn. Os Providers comuns pertencentes ao Registry de processo já leem o ModelConfig diretamente e não passam por essas regras de Catalog.

## 223. O Workspace Catalog sai do preflight de modelos do Registry

O preflight de Session usava simultaneamente `app.listModels()` e o antigo Workspace Catalog para decidir se um modelo estava disponível. Mesmo que o Registry de processo já tivesse publicado o modelo atual, ele ainda podia ser vetado e revertido enquanto existisse no Catalog antigo outro modelo disponível, e a ordem de reversão preferia o Catalog antigo em vez da ordem do Registry.

Agora, no modo Registry de processo, o `app.listModels()` apoiado no Registry é a única verdade de associação e de primeiro item, e o Workspace Catalog continua salvando apenas o estado de seleção padrão ou recente. As Entries antigas sem o Registry montado mantêm a filtragem original de Catalog, evitando expor um base model oculto da CLI como opção selecionável. Novos testes cobrem respectivamente que o modelo atual do Registry não é vetado pelo Catalog antigo e que, depois da remoção de um modelo, a reversão segue o primeiro item do Registry.

O mesmo arquivo de teste expôs uma regressão já existente do nível padrão do GLM-5.3 temporário de Turn: ao completar os níveis, a camada de compatibilidade trocava o `high` passado explicitamente pelo Host pelo `max` padrão do Catalog. Esta rodada mantém o nível padrão legítimo recebido e completa apenas o mapeamento do protocolo; isso não altera o Registry de longo prazo e não expande a refatoração de autenticação das tarefas ociosas.

## 224. O Registry de processo sai da projeção de Workspace Provider e da escrita de volta de Runtime

Esses caminhos alteram de fato atributos, membros visíveis ou resultados de troca de modelos de Providers comuns de longo prazo, violando diretamente a fonte única do M2; por isso não foram adiados como um todo sob a premissa de "remover o protocolo antigo depois". Esta rodada restringiu tudo de uma vez na fronteira `hasProcessProviderRegistry`: a sincronização antiga de Workspace Provider e a escrita de `runtimeModel` do Host viraram no-ops, a inicialização do App não gera mais o bootstrap antigo, a Workspace View exibe apenas o `app.listModels()` apoiado no Registry, o Provider alvo de uma troca é avaliado a partir dessa mesma View, o context window da cold recovery usa as propriedades de modelo já fixadas no Runtime do App atual e a revisão antiga de provider não se faz passar mais por revisão do Registry.

O Workspace Catalog continua guardando o estado de interação de default, last-used e mode, e continua servindo as Entries antigas que ainda não montaram o Registry de processo. O Provider temporário de um único turno ainda usa um Turn Overlay independente, e seu ciclo de vida completo e a reformulação da autenticação ficam para o M4. Os helpers antigos de Active Session Model Limits, sem chamadores de produção, são apenas um item de limpeza e não afetam a autoridade atual; a mesma auditoria confirmou que os helpers antigos de transmissão de Session Settings, também sem chamadores, já foram removidos, evitando continuar sugerindo que o catálogo de Workspace Provider ainda direciona ativamente a Session do Registry.

Novos casos de regressão cobrem o modelo do Registry não ser vetado pelo Catalog antigo, a reversão pelo primeiro item do Registry, o bloqueio de escrita do Overlay/Runtime antigo, o Provider alvo de troca avaliado a partir da Registry View, o context window vindo do Runtime atual e a Workspace View não misturar Provider/revisão antigos. Os testes reais de montagem de Protocolo também passaram a definir apenas a flag de Registry de processo, para impedir que os testes mascarem a lacuna de montagem de produção injetando diretamente App Options.

Ao verificar ainda mais o protocolo de produção, confirmou-se que o `runtimeModel` comum e o `turnRuntimeModel` das tarefas ociosas já têm uma fronteira clara: o primeiro é um snapshot de compatibilidade derivado pelo Host e o segundo entra por um Turn Overlay independente em uma execução única. Impedir a escrita do primeiro no Workspace Catalog no modo Registry de processo não corta as tarefas ociosas. Os campos antigos do protocolo ainda podem ser transmitidos e ainda podem submeter ModelSelection por enquanto, mas isso não pode ser usado para restaurar a autoridade do Snapshot do Host para Providers comuns.

## 225. O Workspace Read State sai da responsabilidade de escrita de modelos

Ao continuar auditando a entrada de protocolo do `runtimeModel`, descobriu-se que `workspace/readState`, apesar do nome de interface de leitura, ainda permitia que o chamador carregasse um `runtimeModel` completo. Se o Workspace já tivesse uma Session ativa, ele escreveria o thought level contido nela na Session e atualizaria `record.modelRuntime` antes de montar a projeção de retorno. Isso fazia com que a reposição de catálogo, a restauração de janela ou a preparação do Repo Wiki pudessem se tornar escritores ocultos do estado de modelo.

Esta rodada restringiu `workspace/readState` a uma projeção estritamente de leitura: o Schema do protocolo, os parâmetros dos Services e a implementação do Bootstrap removeram `runtimeModel`, e a Session ativa apenas lê o Runtime atual do App, sem que a consulta do Workspace a modifique. O `prepareWorkspaceWithZCodeSessionService` da UI também removeu o `preferredRuntimeModel`, e a Deferred Session submete apenas ModelSelection; o Repo Wiki usa a mesma entrada. As modificações de modelo ou de reasoning continuam sendo feitas por comandos explícitos de Session/Submission.

Os testes de regressão provam primeiro que a implementação antiga aceitava o campo e chamava `setThoughtLevel("max")`, e só então fixam que o novo protocolo recusa o campo antigo, que nenhuma escrita ocorre na Session ativa e que a requisição da Deferred Session não carrega mais o Snapshot do Host.

## 226. O Workspace Default Model guarda apenas Selection

Os chamadores de `workspace/setDefaultModel` já submetem apenas `ModelSelection`, mas o protocolo e os tipos dos Services ainda permitiam anexar um `runtimeModel` completo, e o Worker o mesclava ao Workspace Catalog antes de salvar o modelo padrão. Isso fazia com que a interface de escrita da "próxima seleção padrão de draft" ainda pudesse criar fatos de Provider de passagem, em conflito com a autoridade do Registry de processo.

Esta rodada removeu esse campo do protocolo compartilhado, dos parâmetros de Agent/Session Service e da implementação do Worker. Os Services não executam mais a verificação de consistência de dois campos entre `model` e `runtimeModel` e não registram nem encaminham snapshots derivados. O Workspace Default continua salvando providerId, modelId e o estado de interação independente de thought/mode; ao criar de fato o App do draft, o Registry do Environment alvo valida a Selection e cria o Model.

Os testes do protocolo compartilhado fixam primeiro que um `runtimeModel` antigo válido precisa ser rejeitado pelo Schema strict; as regressões relacionadas de Bootstrap, Services e UI confirmam que o comportamento de escrita do modelo padrão e de preparação de drafts permanece inalterado.

## 227. Comandos de modelo comum do V4 saem do Host Runtime Snapshot

Embora os chamadores de produção de `createSession` e `switchModelConfig` do V4 já submetam apenas Selection, o Schema compartilhado, o Command Handler e a Bridge ainda mantinham um fallback de `runtimeModel`: o Host podia entregar ao Worker um snapshot de execução completo do Provider, e a Bridge o instalava no antigo Workspace Catalog. Isso conflita com a autoridade do Registry do Environment alvo.

Esta rodada removeu o campo `runtimeModel` dos dois comandos e restringiu a capacidade da Bridge a `ensureProviderAvailable()`: ela valida apenas o providerId no Registry atual do Worker e não recebe nem instala snapshots de Provider. O `sendText.turnRuntimeModel` das tarefas ociosas permanece independente e continua expressando um Model execution-scoped.

Os testes de regressão também explicitaram que o desvio do Repo Snapshot chamava `workspace/readState` para adivinhar o Provider da rodada quando não havia `runtimeModel`, o que podia bloquear o envio lateral e consumir novamente o estado antigo de modelos do Workspace. Agora o desvio usa apenas a Selection transportada explicitamente pelo comando ou o Model temporário de Turn; quando faltam, os metadados de modelo podem ficar vazios, e a atribuição real das requisições continua sendo responsabilidade do Usage/Trace do Model.

## 228. O protocolo antigo de Session sai do Host Runtime Snapshot

Depois de fechar os comandos de modelo comum do V4, o protocolo antigo de Session ainda permitia que o Host carregasse um `runtimeModel` completo em create, resume, send, compact, setModel e setThoughtLevel. O Worker gravava esse snapshot no Workspace Catalog, atualizava o Runtime do App e mantinha um conjunto Host/Worker de CAS com `modelRuntimeRevision`. Mesmo sem os chamadores de produção enviando o campo, essa capacidade de protocolo ainda podia recriar uma segunda fonte da verdade de Provider.

As modificações explícitas de modelo e de reasoning continuam passando pelos comandos correspondentes, e o Worker valida e cria o Model pelo Registry do Environment ao qual pertence. Os caches derivados no Worker que existiam junto com o Snapshot do Host, a comparação de revisão, a atualização e os ramos de erro foram removidos em conjunto.

O `turnRuntimeModel` de `sendText` do V4 permanece inalterado. Ele é a entrada execution-scoped do Turn atual das tarefas ociosas, cria o Model por um Turn Overlay independente e não é gravado no Registry de longo prazo. O desvio antigo de Session do Repo Snapshot deixa de adivinhar metadados de modelo do Workspace quando não há um modelo de execução explícito; a atribuição real de modelos continua sendo responsabilidade do Usage e do Trace do Model em execução.

Ao todo, passaram os 285 testes direcionados do protocolo compartilhado, de Services/V4 e de Bootstrap, e as verificações TypeScript da raiz e do Bootstrap passaram. Os testes do comportamento antigo foram removidos, enquanto o Workspace State somente leitura e os testes de rejeição de campos antigos foram mantidos.

## 229. Reconectar as funcionalidades novas do staging à autoridade do Environment alvo

Depois que o `staging` remoto foi revertido e reconstruído pela equipe, o branch de Provider foi rebaseado por completo no novo grafo de commits. A nova base de código acrescentava a reconciliação do catálogo de modelos da página de configurações do Subagent: quando o formulário de configurações detectava que o Workspace alvo não tinha o modelo, a implementação antiga injetava primeiro o Registry do Host no Worker e só então lia o Workspace State. Isso restabelecia a segunda fonte da verdade que o M2 já havia removido.

Esta rodada preservou a detecção de ausência, a proteção contra requisições expiradas, a única tentativa de retry e a projeção do formulário de configurações, e apenas restringiu a cadeia de sincronização a:

```text
Registry do Worker do Environment alvo
        |
        | workspace/readState
        v
Projeção do formulário de configurações no Renderer
```

O Renderer não injeta mais o Registry do Host no Worker local nem no remoto. O Environment alvo mantém seu próprio Registry, e a página de configurações apenas relê o catálogo de modelos publicado pelo ambiente de execução alvo. Dois grupos de testes especializados cobrem a leitura direta, o descarte de resultados expirados, o retry em caso de falha e a troca de Remote Session, com nove testes passando.

No mesmo rebase, a nova base acrescentou testes de múltiplos planos e de buckets de cota do Start Plan. Esses testes ainda usavam diretamente o `ModelProviderService` já retirado para construir parâmetros, fazendo com que o Provider migrado não conseguisse obter o `accountAccessId` e a requisição degradasse para "não configurado" antes mesmo da autenticação. Esta rodada apenas conectou os novos casos à montagem existente de Account Request Auth de `createProviderForTest()`; a ordem dos múltiplos planos, o filtro de planos não ativos, o `planId` do bucket de cota e a lógica de produção para `expires_at` ausente mantiveram a semântica da nova base, sem restaurar a leitura de credenciais da Config antiga de Providers. Ao todo, 230 testes de Plan e configurações passaram.

O tratamento de conflitos seguiu o mesmo princípio: preservar as funcionalidades de produto e os contratos de dados da nova base, e reconectar ao Registry do Environment alvo e à autenticação em tempo de requisição toda implementação que dependia do Snapshot antigo do Host, da injeção antiga de Registry de Workspace ou do Provider Service antigo, sem trazer de volta para o novo branch os commits antigos de staging que a equipe havia revertido.

## 230. O Process Registry vira dependência obrigatória da Entry de protocolo

A auditoria final de aposentadoria confirmou que o Bootstrap ainda permitia a ausência do Registry de processo e completava Provider, Model, Properties e revision com o catálogo de Workspace Provider. Esse fallback deixava passar Harnesses que constroem diretamente o App do Bootstrap e, ao mesmo tempo, mascarava erros de montagem das Entries de produção.

Esta rodada tornou o Registry de processo uma dependência obrigatória da Entry de protocolo. A inicialização falha imediatamente quando faltam caminhos de Official ou Personal Config, e tanto as Entries de produção quanto os Harnesses de teste montam o Registry explicitamente. O desvio `hasProcessProviderRegistry` foi removido, `workspaceModelCatalogs` foi reduzido e renomeado para `workspaceModelPreferences` e passa a guardar apenas default, last-used, thought level, mode e revision. A associação de Providers, as propriedades de modelo, o context window e a ordem de reversão vêm uniformemente da Registry View.

O Host Runtime Snapshot das Sessions comuns já foi retirado; o `turnRuntimeModel` das tarefas ociosas continua como um Execution Overlay de execução única e não é gravado no Registry nem nas Workspace Preferences.

## 231. O limite de liberação do DTO do formulário de configurações

A avaliação de limpeza previa que a página de configurações deixaria completamente o antigo `ModelProviderConfig` dentro do M2. Ao verificar melhor, confirmou-se que esse tipo é hoje apenas um DTO de formulário interno do Renderer: a Settings View é projetada como um formulário editável e, ao salvar, é gerada a Config formal de Provider/Model. Ele não lê arquivos, não constrói Registry, não decide se um modelo é selecionável e não cria Models de execução.

Reescrever toda a interface de configurações ao mesmo tempo ampliaria a superfície de regressão de UI antes da liberação sem convergir ainda mais a fonte da verdade. Por isso esta rodada mantém essa camada de adaptação isolada e a registra explicitamente como ponto de remoção para uma futura refatoração da experiência de configurações. A importação do formato físico antigo também continua usando uma forma Legacy privada, e nenhuma das duas pode ser dependida pelo caminho de estado estável do Registry.

## 232. Verificação final do M2

Concluída a limpeza de aposentadoria, o `pnpm typecheck` e o `pnpm lint` da raiz passaram, com o lint em 0 error; os 10 arquivos de teste direcionados de Services/UI, totalizando 117 testes, passaram, os 6 arquivos de teste direcionados do Bootstrap, totalizando 219 testes, passaram, e a verificação typecheck independente do Bootstrap passou.

A suíte completa do Bootstrap expôs separadamente uma dívida de testes já existente: mocks de Session Persistence sem o novo método, importações entre domínios já existentes no Native Boundary e vários timeouts históricos. Esta rodada não embrulhou essas falhas como regressões de Provider nem afirmou que a suíte completa passa; esse limite de verificação é preservado na entrega.

## 233. Adaptar o MCP oficial e o Usage ao staging mais recente

O tratamento de conflitos preservou a semântica de produto das funcionalidades novas: o Header de identidade MCP, os cinco campos de identidade, a requisição de cota, a barra de cota MCP independente, o pop-up de redefinição unificado e a largura do painel de contexto dinâmico. A existência de Provider passou a ler a `ModelSelectionView` oficial, e a autenticação do Usage passou a usar o `AccountRequestAuthService` e o `accessId`, sem restaurar o Snapshot antigo nem o Provider Service antigo.

Após o rebase, o typecheck e o lint da raiz passaram; os 15 arquivos de teste direcionados de MCP, Usage, Provider, Repo Wiki, seleção de modelos e UI, totalizando 258 testes, passaram, e os 6 arquivos de teste de Registry/protocolo do Bootstrap, totalizando 219 testes, passaram. O Node 22 local atual é inferior ao Node 24 declarado pelo repositório, de modo que o pipeline padrão ainda precisa de uma verificação final no runtime oficial.

## 234. O Workspace Snapshot remove o catálogo de Providers duplicado

A auditoria final do protocolo descobriu que `workspace/readState` ainda devolvia um `modelCatalog` adicional, mesmo já retornando `settings.model`. Essa estrutura reprojeta Provider, propriedades de modelo e revision para o protocolo antigo; a UI não a consome mais e o único leitor de negócio é o primeiro despacho das tarefas ociosas, enquanto o `{ modelCatalog }` emitido pelo `state.updated` do Workspace nem sequer é reconhecido pelo parser de Settings existente nos Services.

Esta rodada removeu `ZCodeWorkspaceModelCatalogState`, o campo do Snapshot, o mapeamento do Bootstrap e a lógica de agrupamento de Providers. O despacho das tarefas ociosas passa a herdar diretamente o `settings.model.current` já resolvido pelo Environment alvo e a validá-lo em `settings.model.available`. A notificação de atualização do Workspace envia o mesmo Patch de Settings, e a semântica de revision de default, thought level e mode permanece inalterada.

A auditoria de referências confirmou simultaneamente que `convertModelProviderConfigToZCodeProviderInput()` não tem mais chamadores de produção e sobram apenas testes especializados de projeção de protocolo antigo, de modo que ele foi removido junto com sua lógica privada de endpoint, de capacidade de mídia e de conversão de Provider. A estrutura de migração de reasoning/capacidade ainda chamada de `modelCatalog` dentro do CLI Adapter continua sendo uma fronteira de compatibilidade do lado de execução e não foi confundida nesta rodada.

Ao todo, passaram as 299 regressões direcionadas de Shared, Services, Bootstrap e UI, e as verificações de TypeScript e lint da raiz passaram; o lint ficou com 0 error e as 36 warnings do baseline atual.

## 235. Remover a entrada de escrita do Workspace Provider Overlay do App

Depois da limpeza do protocolo e do Snapshot, a auditoria do Bootstrap continuou e descobriu que `ZCodeApp.setModelCatalogOverlay()` não tem mais chamadores de produção, mas o App ainda guardava um Overlay de Provider/Model em nível de Workspace e o misturava na lista de modelos, nas Properties e no antigo Registry do Adapter. Isso permitia que o Snapshot completo de Workspace, cujo protocolo já havia saído, voltasse a entrar pela API pública do App, em conflito com o princípio da fonte única do Registry de processo.

Esta rodada alterou primeiro os testes para exigir que o App não exponha mais essa entrada, confirmou que a implementação antiga falhava e, então, removeu a API de Workspace Overlay, o estado, os listeners e os fakes de teste. O `RuntimeModelOverlayManager` agora gerencia apenas o Turn Overlay; execuções únicas como as tarefas ociosas ainda podem injetar um Provider temporário, mas um Provider comum de longo prazo não consegue mais contornar o Registry por um Workspace Overlay.

Cinco testes do Overlay, um teste de entrada de escrita do Registry e 45 regressões de Session Facade, cold recovery e Overlay de tarefas ociosas passaram. As seis asserções do teste completo de Registry App passaram, mas sob Node 22 o processo de teste do MCP apresentou uma rejeição não tratada já existente de `ERA_NEGOTIATION_FAILED` ao encerrar, e o Vitest devolveu código diferente de zero por ruído de infraestrutura de teste; esse problema não tem relação com a remoção de Overlay desta rodada, e a validação completa continua sendo feita com o Node 24 exigido pelo repositório.

## 236. A remoção do Legacy no App Factory nu vira migração da base de testes

Depois da remoção do Workspace Overlay, a auditoria descobriu que `createZCodeApp()` ainda permitia não injetar o Process Registry e mantinha os desvios de Runtime Config antiga, Model Catalog e `includeLegacyProviderModels`. Depois de adicionar o teste de portão e fazer a fábrica recusar a ausência de Registry, os casos oficiais de Registry passaram como esperado, mas 56 casos das suítes de Session Persistence, MCP, Workspace Hook e Script Workflow do Bootstrap falharam.

As falhas não eram apenas a ausência de um parâmetro: alguns casos ainda validam a Config antiga de Providers da CLI e outros injetam a forma antiga de ModelPort sem o `createModel()` de que a nova ModelFactory precisa. Usar um Registry falso estático mudaria a semântica dos testes e mascararia lacunas reais de migração. Por isso esta rodada revertiu o portão ainda não submetido no App Factory e não levou uma migração mecânica pouco confiável para o branch de liberação.

O Prompt CLI, a TUI e a Entry de Protocol oficiais já iniciam e injetam o Process Registry, de modo que a cadeia de fatos de produção não é afetada. Um recorte independente posterior precisa primeiro migrar ou remover os testes especializados de Provider antigo, depois converter os demais Harnesses em fixtures reais de Registry Model e atualizar ao mesmo tempo os E2E de Compact/Memory e a ferramenta de Prompt Trajectory; concluído isso, o desvio Legacy do App nu pode ser removido.

## 237. Sincronização e verificação final do branch de liberação

O `staging` remoto avançou até `a9a3a40a53`, com a nova estratégia padrão de build da plataforma MR e correções de CI. Os sete commits do M2 foram rebaseados nessa base sem conflitos, sem restaurar implementações que a equipe já havia removido e sem alterar código de Provider.

Após o rebase, passaram 50 testes de Model Overlay, Session Facade, cold recovery do V4 e Turn Overlay de tarefas ociosas, além do teste de entrada de escrita de Workspace Overlay do Registry App. As verificações TypeScript da raiz, o TypeScript independente do Bootstrap e o lint passaram, com o lint em 0 error e as 36 warnings do baseline atual; `git diff --check` também passou. Todos os itens do Human in the Loop estão confirmados, concluídos ou explicitamente substituídos por decisões posteriores, e não resta nenhuma semântica pendente de confirmação.

## 238. Concluir a migração do App Factory nu e dos Harnesses internos

A auditoria final de liberação reexecutou a migração adiada no item 236. Primeiro fixou com um teste de portão que `createZCodeApp` sem Registry precisa falhar e, depois, passou os testes de Session Persistence, MCP, Workspace Hook e Script Workflow para Harnesses apoiados no Registry. O Harness usa Model Config completo e uma Model Factory executável, mantém as respostas de modelo injetadas originalmente pelos testes e não usa um Registry vazio para mascarar diferenças de execução.

Os E2E de Compact/Microcompact e de Memory, assim como a ferramenta de gravação de Prompt Trajectory, passaram a construir explicitamente um Registry de teste. O arquivo de Harness do Compact mantém apenas configurações não relacionadas a Providers, como Permission, Storage e Feature, e o Fixture de Provider passa a ser lido como entrada de teste separada; os campos antigos `provider` e `model` da CLI não carregam mais fatos de execução.

Em seguida, o lado de produção removeu `bootstrapModelConfig`, a Model Factory de Runtime Model sem Registry, a concatenação da lista antiga de modelos e o desvio `includeLegacyProviderModels`. O `RuntimeModelOverlayManager` foi igualmente reduzido a um contêiner puro de Provider temporário de Turn e não possui mais um segundo modo de operação que atualiza o Registry do Adapter pela Config antiga.

Durante o processo, duas tarefas de manutenção de testes foram tratadas de forma autônoma: os testes de Registry desligam explicitamente o MCP, que é irrelevante para os casos, evitando a rejeição de negociação no encerramento; e o Harness de Telemetry Lifecycle passou a receber caminhos vazios de Official/Personal Config e a completar os mocks mais recentes do MCP Pool. Essas mudanças apenas fazem os testes atenderem à montagem obrigatória das Entries oficiais e não alteram a semântica de produto. A revisão do Human in the Loop não acrescentou nenhum item pendente de decisão.

## 239. Remover a entrada de execução implícita da Config antiga da CLI

Depois que o App Factory nu foi fechado, a auditoria do lado de execução descobriu que `createModelAdapter()` ainda lia a Config antiga da CLI por conta própria quando o chamador não fornecia nenhuma entrada de modelo; o Prompt Trajectory e o Probe de WebSearch do BigModel também usavam o mesmo arquivo como fonte de modelo padrão. Eles contornavam a montagem oficial do Process Registry e permitiam que fatos antigos de Providers, já fora das Entries de produção, voltassem à cadeia de execução por ferramentas internas.

Esta rodada restringiu a fábrica de Model Adapter a dependências explícitas: o chamador precisa fornecer uma Registry Config ou um Runtime Model Config usado apenas para a execução atual. Os tipos TypeScript e um portão de runtime protegem essa restrição em conjunto. O Prompt Trajectory exige que o Fixture ou a linha de comando forneça explicitamente a identidade do modelo, o Endpoint e a origem das credenciais; o Probe de WebSearch passou a receber parâmetros explícitos e não lê mais o arquivo antigo do usuário. O antigo `updateModelSelectionInFileConfig()`, referenciado apenas por testes especializados, foi removido junto com os testes, de modo que a seleção de modelo não pode mais ser gravada de volta na Config antiga da CLI.

O Schema antigo, o Parser e a leitura do arquivo continuam disponíveis para a primeira importação da Personal Config e para as configurações de Harness ainda não migradas, como MCP, Hook e Permission. Eles podem interpretar o formato físico antigo, mas a execução de modelos em estado estável não consome seus campos de Provider, Model ou Model Catalog. Essa é uma separação explícita entre a fronteira de migração e a fronteira de fatos de execução, e não uma segunda cadeia de Provider.

Ao todo, passaram os 86 testes direcionados de Bootstrap, Adapters e Prompt Trajectory, e as verificações TypeScript independentes dos três pacotes passaram; o TypeScript e o lint da raiz passaram, com o lint em 0 error e as 36 warnings do baseline atual.

Após o commit, o `staging` remoto avançou mais sete commits. Os dez commits deste branch foram rebaseados sem conflito sobre `24ef10c138`; o `range-diff` confirmou que oito commits posteriores já existentes são equivalentes em patch, e que apenas o primeiro commit principal foi regerado por mudança de contexto adjacente no upstream. A remoção desta rodada de fontes antigas de fatos é mantida como o décimo commit novo. Após o rebase, os 86 testes direcionados, o TypeScript e o lint da raiz passaram novamente.

## 240. O RuntimeConfig genérico sai dos fatos antigos de modelo

Ao continuar a auditoria da cadeia de consumo da Config antiga da CLI, confirmou-se que o App Runtime oficial já obtém modelos apenas do Process Registry, da Selection da Session e do Turn Overlay explícito, mas que o `RuntimeConfig` genérico, o `ConfigPort` e os metadados de origem de Config ainda guardavam `model`, `modelCatalog` e `hasModel`. Esses campos já não têm consumidores de execução oficiais e ainda fariam com que o código seguinte acreditasse que o arquivo antigo da CLI ou `ZCODE_MODEL` continua sendo uma fonte de fatos de estado estável.

Esta rodada acrescentou primeiro um teste que falha, fixando que campos de modelo do arquivo antigo e de variáveis de ambiente não podem entrar em `createConfig().config`, e então removeu os campos de modelo do `RuntimeConfig` e do ConfigPort, as quatro chaves de Model Config e os metadados de origem `hasModel`. Os campos de compatibilidade no Schema antigo e no `RuntimeConfigPatch` são mantidos por enquanto e marcados como deprecated, servindo à migração única da Personal Config e do Configured Default; eles são descartados na fronteira do ConfigPort e não conseguem mais afetar o Agent Runtime.

A verificação TypeScript de todo o pacote da CLI expôs em seguida que os tipos de montagem do Prompt CLI e da TUI ainda tratavam o inicializador do Process Registry como dependência opcional, embora o `createZCodeApp` já exija um Registry. Por isso as Entries oficiais passaram a reportar diretamente um erro de montagem quando o inicializador está ausente e sempre a injetar o Registry no App; três bases de teste genéricas da CLI receberam um Registry Runtime mínimo, e os casos especializados de ciclo de vida continuam validando que o Prompt CLI pega emprestado e libera o Registry e que a TUI reutiliza o mesmo Registry de processo ao substituir o App. Esse ajuste não acrescentou nenhuma nova fonte de modelos e apenas convergiu os tipos e as bases de teste à restrição de produção já em vigor.

Esta fatia não alterou o Turn Overlay: Providers temporários execution-scoped, como os das tarefas ociosas, continuam criando Model por uma entrada explícita de Submission e pertencem à fronteira de migração do M4. Nenhum item novo de decisão do Human in the Loop foi criado.

Resultados da verificação: os 86 arquivos completos de Adapters, com 1327 testes, passaram e três foram ignorados; 41 testes de Runtime Config, Process Registry Runtime e Legacy Importer do Bootstrap passaram; 2 testes de ciclo de vida do Registry da CLI e 18 testes de CWD e formato de saída passaram; e a verificação TypeScript da raiz passou. O arquivo histórico completo de unidade da CLI continua sendo interrompido no ambiente Node 22 atual por um caso de Skill sem relação com Provider, que cancela em cascata os casos de limpeza assíncrona seguintes; por isso esta rodada registra apenas os casos relevantes que passaram de forma isolada e não reporta esse arquivo como totalmente aprovado. O lint da raiz também passou, mantendo 0 error e as 36 warnings de baseline; a verificação TypeScript independente da CLI passou e `git diff --check` passou.

## 241. Alinhamento com o staging mais recente e revisão pré-liberação
O `staging` remoto avançou seis commits até `cf009a3b19` durante o fechamento. Os doze commits do M2 foram rebaseados sem conflito, sem nenhuma escolha manual de conflito e sem restaurar código removido pelo upstream. Após o rebase, o TypeScript e o lint da raiz passaram, com o lint em 0 error e as 36 warnings de baseline; os 63 testes de fronteira do Runtime Config, os 41 testes de Registry e Legacy Importer do Bootstrap, os 2 testes de ciclo de vida do Registry da CLI e os 18 testes de CWD e formato de saída passaram.

Um comando de filtro de teste incorreto disparou as suítes completas de Adapters e do Bootstrap e expôs falhas já existentes de timeout de execução, de fronteira de protocolo cruzado do V4, de Session Resident Pool e de timing de Session Persistence. Em seguida, os casos relevantes desta rodada foram executados novamente com caminhos de arquivo explícitos e passaram; essa dívida de baseline completa não foi contornada nem reescrita pelo código de fechamento de Provider.

## 242. O Parser do arquivo antigo de modelos sai do Runtime Config genérico

O item 240 já havia feito o `RuntimeConfig` oficial e o ConfigPort saírem dos fatos de modelo, mas o `RuntimeConfigPatch` ainda mantinha `model` e `modelCatalog` deprecated, e o parser genérico de variáveis de ambiente e o Config Merger continuavam construindo e mesclando esses campos. Embora fossem descartados em uma fronteira posterior, eles ainda faziam `ZCODE_MODEL`, `ZCODE_BASE_URL` e o Schema do arquivo antigo parecerem entradas válidas de configuração comum de runtime.

Esta rodada alterou primeiro os testes, exigindo que as variáveis de ambiente antigas de modelo sejam ignoradas pela Config comum e que a semântica de compatibilidade de modelo do arquivo antigo continue totalmente coberta pelo parser de migração dedicado. Em seguida, os campos de modelo foram removidos do `RuntimeConfigPatch`, do Env Adapter, do Config Merger e da projeção comum de arquivos, e foi adicionado `parseLegacyCliModelConfig()` como entrada única da primeira migração da Personal Config e do Configured Default. As conversões de compatibilidade mais complexas de Provider, capacidade e reasoning foram mantidas, mas seus tipos e pontos de chamada ficam explicitamente limitados à migração da CLI antiga e não são mais expostos pela API de Config comum.

Os 62 testes direcionados de Config dos Adapters e os 9 testes de Legacy Importer do Bootstrap passaram; as verificações TypeScript independentes de Contracts, Adapters e Bootstrap passaram. O ajuste não alterou o resultado da migração única do arquivo antigo nem a semântica do Turn Overlay, da Selection atual da Session ou da execução pelo Adapter. O Human in the Loop não recebeu nenhum item novo a decidir.

## 243. Timing de atualização de Account e fechamento do teste de Connectivity

A revisão estática do MR descobriu que, se a rodada atual de atualização do `AccountProviderService` falhasse, ela sairia do loop mais cedo. Eventos de Config ou de conta que chegassem durante a falha continuariam em `pendingReasons`, mas, depois que o in-flight fosse liberado, não haveria quem os processasse, e o Registry poderia ficar com o Snapshot antigo de Account até que um terceiro evento aparecesse por acaso.

Esta rodada acrescentou primeiro um teste de timing que reproduz o problema: inicialização com sucesso, atualização A bloqueada, chegada do evento B e falha de A; a implementação antiga chamava o Resolver apenas duas vezes. Após a correção, o chamador original de A continua recebendo a falha, o Service publica `onDidRefreshError` e mantém o last-known-good; depois que o in-flight de A é liberado, uma nova rodada é iniciada automaticamente para B e, após o sucesso, o novo Snapshot é publicado. A associação de Providers, a política de falha e as regras de mesclagem de eventos não mudaram.

A mesma revisão estática também descobriu que os três testes especializados de Connectivity ainda chamavam o parâmetro antigo `endpoints/model/provider`. A página de configurações de produção já usa a interface oficial `baseURL/modelId/modelConfig/providerId`, de modo que os testes passaram a construir diretamente o Model Config atual, continuando a validar URL, Headers, reasoning mapping padrão e o comportamento sem mapping, sem modificar a Connectivity de produção.

Seis testes do Account Provider Service e três do Connectivity Probe passaram, e a verificação TypeScript independente do Provider passou. As duas coisas são fechamentos de implementação e de teste sob semântica já confirmada, sem novos itens de decisão do Human in the Loop.

## 244. Fechamento da projeção Personal e do salvamento atômico

A revisão estática do MR descobriu mais três desvios de implementação em relação às regras de Config Overlay já confirmadas.

Primeiro, ao salvar a Configuração Efetiva de um Account Provider na página de configurações, o `accessId` injetado dinamicamente pelo Account Overlay era projetado na Personal Config. Após a correção, quando Official e Access Efetivo são ambos `zhipu-account`, a projeção Personal ignora a identidade dinâmica da conta; a disponibilidade da conta continua vindo apenas da Account Provider Source.

Segundo, `reasoningMapping` é um campo de valor comum no Model Overlay e a camada posterior deve sobrescrevê-lo por inteiro, mas a função de projeção antiga continuava comparando diferenças dentro de cada nível. Após a correção, um Mapping inalterado não escreve campo algum no Personal, e um Mapping alterado salva o campo completo, com leitura e escrita usando a mesma semântica de Overlay.

Terceiro, o `ProviderSettingsFacade` calculava antes a Personal Config inteira a partir do snapshot antigo do Registry e só então entrava no bloqueio de arquivo do Repository para fazer uma substituição total. Um Provider sem relação escrito por outro processo entre o snapshot e a aquisição do bloqueio seria assim perdido. Agora o salvamento Efetivo é feito pelo `ProviderConfigService` dentro do `update()` do Repository: dentro do bloqueio ele lê a Personal Config mais recente, atualiza apenas o Provider alvo e suas regras precisas de modelo, e preserva as regras de Pattern e os demais Providers. A interface de substituição total continua servindo apenas à migração de configuração e à importação total explícita.

Os três pontos receberam testes que falham primeiro, e só então a implementação foi modificada. Dezoito testes de Provider Config Service, Facade e Personal Projection passaram. Eles aplicam os princípios já existentes de estratificação Official/Personal/Account, de sobrescrita total de campos comuns e de atualização atômica do Repository, sem acrescentar item novo de decisão do Human in the Loop.

## 245. Um novo Provider sai da pré-condição da Settings View

A página de configurações ainda usa o adaptador de migração do DTO de edição antigo. Ao editar um Provider existente, o adaptador precisa da Settings View atual para completar campos herdados que o formulário não expõe diretamente; mas um Provider novo ainda não entrou no Registry, de modo que a View atual naturalmente não tem o item correspondente. O Renderer lançava, portanto, um erro "ainda não apareceu na Settings View" antes mesmo de chamar o Config Service, impedindo que um Provider custom novo fosse salvo.

Esta rodada acrescentou primeiro um teste que falha e depois tornou a View uma entrada de herança opcional na fronteira de salvamento. Ao criar, usa-se diretamente o Provider e o Model Draft já construídos de forma completa no formulário de Add Provider; ao editar um Provider existente, continua-se reutilizando a Configuração Efetiva da View. O teste de conexão usa o mesmo construtor de Draft e, por isso, o formulário de criação também consegue disparar o teste de conexão antes de salvar. Essa correção não reescreve o DTO da página de configurações nem altera as regras de herança e de projeção Personal de Official Providers.

Quarenta e seis testes de salvamento de configurações, de Draft e de Provider Config passaram. A saída completa da página de configurações em relação ao DTO antigo continua como um recorte posterior de R1, e o bloqueio de liberação da criação de Provider não depende mais dessa migração de grande escopo.

## 246. O novo login OAuth força a atualização da Coding Plan Key em nível de conta

A Coding Plan Key em nível de conta é cacheada com um `accessId` que inclui a identidade da conta. O Resolver só pulava o cache quando o motivo da atualização continha `oauth-callback`, mas o Renderer, na cadeia real de login concluído, emitia `oauth-login-entitlement`. Ao deslogar e entrar novamente na mesma conta, a Account Source podia, portanto, reutilizar diretamente a Key antiga em vez de obter novas credenciais de requisição a partir do novo OAuth Token.

Esta rodada passou primeiro o teste da Config Source para o evento real do Renderer e reproduziu a falha, e então fez o Resolver reconhecer tanto o evento de login real quanto o evento histórico de callback. A atualização de entitlement após o login agora pula à força o cache de Key em nível de conta; depois que a Key é obtida com sucesso no remoto, ela sobrescreve a credencial de escopo da conta original, e, em caso de falha, não há retorno ao valor antigo.

Vinte testes de Account Config Source, Connection Resolver, Credential Service, Request Auth e OAuth Logout passaram. A remoção precisa da Key com escopo de conta no logout ainda exige que o OAuth Service transmita a identidade da conta antes de limpar a Session, e esta rodada não ampliou a interface de ciclo de vida do OAuth para resolver um problema de limpeza de dados; esse item restante continua registrado na revisão R6 do MR.

## 247. Remover o armazenamento de Providers dos Services antigo sem consumidores

O M2 continua auditando os Services pelo princípio de limpar imediatamente o que consegue reduzir o duplo trilho atual. O `knip` encontrou quatro arquivos completos sem uso: `codingPlanCache.ts`, `atomicFileRepo.ts`, `glmWorkspaceConfigRepo.ts` e `providerSettingsJson.ts`. O `dep:refs` sem escopo confirmou, item a item, que todas as exportações não têm referência estática nem reexportação, e uma varredura de strings em todo o repositório não encontrou import dinâmico, script ou consumidor de teste.

Esses arquivos guardavam, respectivamente, o estado antigo de entrada de planos, a leitura e escrita da configuração de Providers do GLM em workspace, rascunhos de arquivo atômicos não conectados ao Config Repository oficial e o parser do antigo JSONC de configurações de Providers. Eles já não participam do comportamento atual do produto e ainda mantêm a forma completa de código capaz de restabelecer uma fonte física antiga de fatos de Provider. Esta rodada acrescentou primeiro um portão estrutural que falha e então removeu os quatro arquivos.

Os quatro testes do portão estrutural e a verificação TypeScript da raiz passaram. A revisão do Human in the Loop continua com as 16 itens confirmados, sem nova semântica de produto ou contrato público que precise de decisão.

## 248. A autenticação de requisições sai da reinterpretação do Registry atual

A revisão estática R5 do MR descobriu que, depois de um Account Model já criado obter uma nova API Key/Header em cada tentativa de requisição, ele chamava novamente o `resolve()` completo do Registry do AI SDK atual. Se o Provider Config sofre uma hot update dentro do mesmo Agent Loop, essa atualização de autenticação acabaria trocando também a SDK Factory, o Endpoint, o protocolo, as Provider Options e os Headers estáticos do Model antigo, violando o contrato já estabelecido de que um Model mantém sua identidade e sua configuração estática de execução durante uma execução contínua.

Esta rodada acrescentou primeiro um teste de timing que falha: cria-se um Model com o Provider A, substitui-se o Registry a quente pelo Provider B de mesmo ID e então dispara a autenticação da requisição; a implementação antiga chamava de fato o B. Após a correção, o Adapter captura o snapshot de execução estático do Provider no momento da criação do Model por meio de `bindModel()`. A autenticação da requisição apenas combina a API Key/Header daquela tentativa nesse snapshot e cria, a partir dele, o SDK Model usado na tentativa; a hot update do Registry afeta apenas Models criados depois. Proxy, roteamento físico e verificação de segurança da requisição continuam sendo gerenciados dinamicamente pelas instalações de requisição do Adapter e não se tornam fatos estáticos do Registry.

Cinquenta e seis testes de Model e Registry dos Adapters e a verificação TypeScript independente dos Adapters passaram. Essa correção aplica o desenho de ciclo de vida de Model já existente e não acrescenta item novo de decisão do Human in the Loop.

## 249. O logout OAuth limpa com precisão a Coding Plan Key em nível de conta

O item 246 já garantiu a atualização forçada da Personal Coding Plan Key em nível de conta após um novo login, mas o logout explícito ainda notificava a limpeza dos Providers derivados só depois de esvaziar a Session OAuth. Nesse momento o Logout Handler só conseguia apagar a Key histórica sem escopo de conta e não conseguia construir o `coding-plan:<provider>:account:<identity>` atual, deixando a Key antiga da conta no Credential Store.

Esta rodada alterou primeiro o teste que falha, exigindo que o logout OAuth transporte o Profile ID anterior à limpeza na notificação e que o Logout Handler apague tanto a Key com escopo de conta quanto a Key histórica sem escopo. A implementação agora captura a identidade da conta dentro da mutação da Session, antes de limpar a sessão principal; logout explícito, unlink, invalidação por JWT expirado e logout-all passam essa identidade ao mesmo Handler. A recuperação por credenciais corrompidas, quando a identidade não pode ser lida de forma confiável, mantém o fail-safe original: limpar os fatos principais do OAuth, desconectar o Account Provider e apagar as Keys que puderem ser determinadas com certeza.

Setenta e oito testes do OAuth Service e do Logout Handler passaram. Essa correção completa o problema de limpeza restante da revisão R6 do MR, sem alterar a disponibilidade de conta, a atualização após novo login ou as regras de resolução em tempo de requisição do Team Plan, e sem acrescentar item novo de decisão do Human in the Loop.

## 250. Remover o Header órfão de override de modelo antigo
Depois de continuar executando o `knip`, o `dep:refs` sem escopo e a varredura de strings de todo o repositório, confirmou-se que `providers/codexModelOverride.ts` exporta apenas a constante `X-ZCode-Codex-Model-Override`, com zero referências, reexportações ou usos dinâmicos. A seleção de modelos atual, o Submission, o Registry, o Request Auth e as requisições do Adapter não leem esse Header; ele já não é um comportamento de compatibilidade, e sim a forma órfã de uma entrada antiga.

Esta rodada primeiro adicionou o arquivo ao portão estrutural Legacy do M2 e verificou a falha, e então removeu o arquivo. O portão estrutural agora cobre cinco arquivos aposentados e passa em todos eles. Nada foi alterado nos parâmetros de modelo do próprio Agent CLI externo nem no script de geração de Changelog, e nenhum item novo de decisão do Human in the Loop foi criado.

## 251. A verificação completa corrige fixtures de Registry aposentados e a inicialização do Server Core a partir do código-fonte

Na primeira execução completa de `verify:pre-push` antes da liberação, os testes da cadeia principal de Provider expuseram duas fronteiras de teste e de execução de código-fonte que passaram despercebidas na troca de interfaces do M2.

Os testes de roteamento do Official MCP ainda injetavam no `ZCodeAgentService` o `providerRegistrySource` já aposentado. Como o Service usa hoje a `ModelSelectionView` para decidir se o Provider e os modelos estão prontos, o fixture antigo não fornecia nenhum modelo executável e os nove testes terminavam logo no portão de inicialização. O fixture agora injeta o `modelSelectionReadinessSource` oficial e continua testando o comportamento original de autenticação MCP e de roteamento remoto.

A build oficial do Server Core embute a Official Provider Config via tsup, mas o teste de integração de runtime inicia o Core diretamente com `tsx`, sem a constante de compilação, e o Core saía antes de enviar o ready. O Core agora aceita um `ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE` explícito como entrada de execução a partir do código-fonte, desenvolvimento e teste; quando ele não é fornecido explicitamente, o bundle oficial continua materializando a Official Config que ele próprio embute. Os dois caminhos apontam para o mesmo tipo de documento Official versionado, sem retorno ao Provider Store antigo e sem criar uma segunda fonte da verdade.

Onze testes de Official MCP e de Server Runtime Integration passaram. Outros dois grupos de falhas no pre-push completo vieram de asserções de estilo de `ConversationDraftSuggestedPrompts` e de asserções de string de código-fonte em `appARMSBootstrap`; os Git blobs dos arquivos de implementação e de teste correspondentes são idênticos aos de `origin/staging`, confirmando que não foram introduzidos pelo M2. Seguindo a convenção desta etapa de executar o pre-push completo apenas uma vez, o fechamento é feito com o TypeScript da raiz, o lint e os testes direcionados de tudo o que foi alterado.

## 252. Remover a cadeia morta do Workspace Model Mirror no Renderer

Ao continuar auditando o Renderer com o Knip, descobriu-se que o arquivo inteiro `workspaceModelMirror.ts` não tinha mais consumidores. Ele mantinha uma fila assíncrona de espelhamento que chamava `setWorkspacePreferredModel` em série por Workspace Identity, um resíduo do momento em que o estado antigo de modelos de Workspace precisava ser perseguido ativamente pelo Renderer. Hoje a seleção de modelos do Composer e da Session já usa a cadeia de controle de Selection ciente de Session, e as referências estáticas, reexportações e referências por string em todo o repositório dos dois exports são zero.

Esta rodada acrescentou primeiro um portão estrutural M2 do Renderer que falha e então removeu o arquivo. O teste do portão e a verificação TypeScript independente da UI passaram. A revisão do Human in the Loop continua com os 16 itens todos confirmados; remover um espelho sem consumidores não introduziu nova decisão de estado, de timing ou de semântica de produto.

## 253. O Direct Seed do Desktop E2E converge para a Personal Config

Ao continuar auditando os fixtures de teste antes da liberação, descobriu-se que `custom-openai-provider-store` ainda escrevia o mesmo Replay Provider simultaneamente no antigo `model-providers.json`, na Config antiga da CLI e no `config.json` do App. O comentário do fixture ainda descrevia essa escrita tripla como necessária para garantir consistência entre UI e Agente, o que fazia com que os testes continuassem mascarando a fonte de fatos de duplo trilho removida pelo M2.

Esta rodada acrescentou primeiro um teste que falha, fixando a fronteira oficial do Direct Seed: escrever apenas a Personal Provider Config versionada, não criar o Provider Store antigo e não modificar conteúdos não relacionados a Providers da Config da CLI, como MCP. Em seguida, a implementação passou a reutilizar diretamente os tipos de Config, as Model Rules precisas e o formato de serialização de `@zcode/provider`. O antigo `ModelProviderConfig` que os chamadores de E2E ainda precisam é gerado apenas no valor de retorno da função e na leitura de diagnóstico, funcionando como uma View de teste que não é persistida.

`desktop-app.readModelProviders()` também passou a oferecer uma projeção que gera o antigo DTO de teste a partir da Personal Config oficial, permitindo que as asserções existentes de E2E migrem gradualmente sem obrigar o fixture a restaurar arquivos antigos. Os novos testes unitários e a verificação TypeScript do Desktop E2E passaram. O Human in the Loop continua com os 16 itens todos confirmados, e a alteração apenas aplica a decisão de fonte única já existente.

## 254. O Restart E2E sai do Provider antigo e da configuração de modelo de inicialização

A auditoria posterior descobriu que o Restart E2E ainda tinha um segundo helper de escrita tripla: o Replay Provider escrevia ao mesmo tempo o Provider Store antigo, a forma antiga de Provider do App e a Config de Providers da CLI, enquanto o modelo padrão de cold start do Turbo escrevia o Provider inteiro, inclusive parâmetros de reasoning de modelo, na Config de CLI do projeto. Esses fixtures faziam com que os casos de reinício continuassem dependendo de fontes de fatos antigas que já saíram da cadeia de produção.

Esta rodada acrescentou primeiro testes que falham para os dois comportamentos. O Replay Provider agora escreve apenas a Personal Config versionada, por meio de `ModelConfigRules.replaceExactForProvider()`, preservando as Pattern Rules existentes e os demais Providers. O modelo padrão de cold start é gravado em um `model-selection.json` versionado e independente, sem copiar mais configuração de Provider ou de reasoning. As capacidades de modelo e o reasoning mapping passam a ser fornecidos pelo Process Registry resolvido a partir de Official, Personal e Account.

O prewarm case que servia para remover artificialmente um Provider da Config da CLI foi atualizado junto. O caso I64 agora verifica que, depois que o Host e o Worker inicializam o Process Registry a partir da mesma Personal Config, a primeira Session de pre-aquecimento permanece com o GLM custom; ele não constrói mais a lacuna de revision de Snapshot do Host e de catálogo da CLI que já foi removida. O Conversation Catalog, a Coverage Matrix e a descrição dos E2E P0 foram atualizados em conjunto.

Três testes unitários de Desktop Provider Seed e a verificação TypeScript do Desktop E2E passaram. O Human in the Loop continua com os 16 itens todos confirmados, sem nova decisão de semântica de produto.

## 255. Remover o Active Model Limits antigo e a cadeia morta de reexportação de MCP do Bootstrap

A auditoria Knip e de referências por strings de todo o repositório encontrou dois arquivos inteiros do Bootstrap sem qualquer consumidor de produção, teste ou script. `active-session-model-limits.ts` guardava a implementação antiga que modificava no lugar a capacidade do Runtime de uma Session ativa após uma hot update do Registry e reenviava ModelSelected; esse comportamento já foi substituído pelo ciclo de vida de Model do M1/M2, em que uma atualização do Registry afeta apenas Models criados depois. `official-mcp-trusted-origins.ts` apenas reexportava a MCP Trust API do Shared sem alterações, e seus consumidores já dependem diretamente do Shared.

Esta rodada acrescentou primeiro um portão estrutural do Bootstrap que falha e então removeu os dois arquivos. O local de implementação da especificação de Official MCP passou a apontar para `packages/shared/src/official-mcp-auth.ts`, e o comentário histórico do adaptador de modelo padrão do Workspace foi atualizado para o fato atual: essa entrada guarda apenas o Workspace ModelSelection, e Provider e capacidades vêm do Registry de processo.

Os dois testes do portão estrutural do Bootstrap e a verificação TypeScript independente passaram. O Human in the Loop continua com os 16 itens todos confirmados; este item não acrescenta caminho de compatibilidade nem altera a semântica de execução.

## 256. O Team Plan E2E sai da escrita tripla antiga de Provider

A auditoria pré-liberação continuou e descobriu que o Team Plan Usage E2E escrevia a mesma Coding Plan Provider do BigModel simultaneamente na Config antiga da CLI, no campo antigo de Provider do `config.json` do App e no `model-providers.json`. Esse caso testa a troca entre conexões Personal/Team e a exibição de uso, e não a migração de configuração antiga; continuar com a escrita tripla mascara os problemas reais de montagem entre as três fontes de fatos Official, Personal e Account.

Esta rodada mudou a preparação do cenário para gravar apenas a Personal Config versionada. A camada Personal fornece ao caso o endpoint, os campos estáticos de modelo e a cobertura de enabled necessários, enquanto as respostas do serviço de conta do teste continuam fornecendo a identidade de conexão Personal/Team por meio do Account Overlay. Os dois são resolvidos segundo as camadas do Registry de produção, e o teste não monta mais por conta própria uma terceira Provider Store.

A verificação TypeScript do Desktop E2E e o lint dos arquivos alterados passaram. O Human in the Loop continua com os 16 itens todos confirmados; essa alteração apenas aplica a decisão de fonte única já existente e não muda o comportamento do Team Plan para o usuário.

## 257. O Reasoning E2E remove o fallback de leitura antiga de Provider

Os quatro E2E de revisão manual de Reasoning, ao resolver o endpoint de replay, contornavam a projeção de teste unificada e liam separadamente o antigo `model-providers.json` e a Config de Providers antiga da CLI. O Direct Seed e a gravação via Settings já foram convergidos para a Personal Config, e esses fallbacks não fornecem nenhum fato válido novo; eles apenas deixam os casos usarem arquivos antigos para continuar rodando quando a configuração oficial está ausente.

Esta rodada removeu as duas camadas de fallback. Os casos continuam priorizando variáveis de ambiente explícitas e o arquivo de runtime de replay; quando precisam ler a configuração de produto, usam uniformemente a projeção de Personal Config de `readModelProviders()`. O próprio helper mantém a compatibilidade com o Store antigo necessária ao diagnóstico da primeira migração, e os casos não duplicam mais a lógica de migração individualmente.

A verificação TypeScript do Desktop E2E e o lint dos quatro arquivos passaram. O Human in the Loop continua com os 16 itens todos confirmados, e a alteração não muda as asserções de requisição de Reasoning nem a interação de configurações.

## 258. A requisição de redefinição de cota passa a ter escopo de Account Access

A auditoria final de lint descobriu que os detalhes das configurações já resolviam o `accessId` do Plan Personal/Team atual a partir da Registry View e o passavam ao `CodingPlanStatusPanel`, mas o Panel não o repassava ao hook de redefinição de cota. O `sourceKey` consegue isolar o estado de exibição local, mas a requisição de serviço ainda precisa do `accessId` para localizar a conexão da conta. A omissão faria com que as requisições de redefinição Personal/Team do mesmo Provider perdessem o escopo oficial de Account Access.

Esta rodada apenas completou a passagem desse parâmetro, sem restaurar credenciais no Renderer nem API Keys de Provider. O spread de objeto sem efeito encontrado na mesma rodada no Model Selection Repository também foi eliminado. Ao todo, 205 testes direcionados de Coding Plan e Model Selection passaram, e o lint dos arquivos relacionados não gera mais warnings do M2. O Human in the Loop continua com os 16 itens todos confirmados.

## 259. Fechamento final estático e de verificação antes da liberação

A última rodada buscou novamente o `origin/staging` e o branch permanece 0 behind. A auditoria Knip de `@zcode/provider` e `@zcode/provider-node` não encontrou arquivos ou exportações sem uso, e as leituras restantes de `model-providers.json` no código de produção estão apenas na primeira importação da Personal Config e na migração única da Account Key, mantidas de propósito como uma fronteira de migração explícita, unidirecional e removível.

O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz ficou com 0 error e 35 warnings de baseline sem relação com o M2; os 205 testes direcionados de Coding Plan e Model Selection passaram, assim como a verificação TypeScript do Desktop E2E e o lint dos arquivos alterados. Os 16 itens do Human in the Loop estão todos confirmados, sem novos problemas pendentes de decisão.

## 260. O Runtime Model Overlay é estreitado para Turn Model Overlay

Ao continuar auditando o Bootstrap conforme a definição de conclusão do M2, descobriu-se que o Workspace/Session Provider Overlay já havia sido removido, mas o objeto interno ainda se chamava `RuntimeModelOverlayManager` e expunha simultaneamente os pares idênticos `getModelConfig/getTurnModelConfig` e `getModelCatalog/getTurnModelCatalog`. Essa forma de API ainda sugeria que modelos comuns de longo prazo poderiam obter fatos de um Runtime Overlay fora do Registry.

Esta rodada alterou primeiro os testes existentes para fixar a fronteira alvo e então restringiu o objeto a `TurnModelOverlayState`. Ele mantém apenas o `set/clear/hasModel/getModelConfig/getModelCatalog/onDidChange` necessários ao Turn atual, e o arquivo foi renomeado para `turn-model-overlay.ts`. O Session Facade e a Source execution-scoped continuam usando o mesmo estado temporário de modelo, e o protocolo e o comportamento de execução das tarefas ociosas não mudaram. O portão estrutural do M2 ganhou o caminho do arquivo antigo, impedindo que um Runtime Overlay genérico reapareça.

Dezesseis testes de Turn Overlay, Runtime Model Factory, Session Facade e portão estrutural do M2 passaram, e a verificação TypeScript independente do Bootstrap passou. Em seguida, o `pnpm typecheck` da raiz passou e o `pnpm lint` da raiz ficou com 0 error e as 33 warnings do baseline de staging atual. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas aplica a decisão já confirmada de que Providers comuns vêm apenas do Registry de processo e Providers temporários pertencem apenas ao Turn atual, sem acrescentar semântica de produto.

## 261. O formulário de configurações sai do tipo compartilhado antigo de Provider Store

A auditoria de refutação das condições de conclusão descobriu que os Provider Settings já leem e escrevem apenas a Settings Facade oficial, mas o estado do formulário no Renderer ainda usava diretamente o tipo de Store antigo compartilhado `ModelProviderConfig`, e o arquivo de projeção ainda se chamava `providerSettingsLegacyProjection`. Isso não constitui uma segunda fonte da verdade, mas continua fazendo com que os chamadores confundam a forma física antiga de armazenamento com o contrato de configuração atual.

Esta rodada acrescentou primeiro um portão estrutural, confirmando que ainda havia 22 arquivos de chamada do tipo antigo na UI de produção, e então criou os tipos privados do Renderer `ProviderSettingsFormProvider` e `ProviderSettingsFormModel`, migrando todos os chamadores de produção e os fixtures de teste relacionados. A projeção foi renomeada para `providerSettingsFormProjection`, deixando explícito que ela só converte entre a Settings View oficial e uma sessão de edição. O antigo `ModelProviderConfig` compartilhado agora pertence exclusivamente ao código de migração física única Personal/Account.

A verificação TypeScript independente da UI passou; doze arquivos de teste relacionados a projeção de configurações, salvamento, ordenação, visibilidade de planos, edição de modelos, reasoning de tarefas ociosas e verificação de segurança da versão oficial, totalizando 282 testes, passaram; e o Oxlint dos arquivos alterados ficou com 0 warning e 0 error. O item não altera a interação do formulário nem a semântica de salvamento e apenas estreita a posse dos tipos. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 262. O julgamento de usabilidade das configurações converge para o Registry

Depois que o formulário de configurações saiu do tipo antigo de Store, a auditoria continuou e descobriu que o Renderer ainda usava `isModelProviderUsableForAgentStartup()` do Shared para recalcular, a partir da API Key, do Endpoint e dos campos de modelo do formulário, se o Provider estava utilizável. Esse algoritmo já tem apenas dois chamadores na página de configurações e faz com que a correção de Provider Family após o salvamento, a compensação da sincronização de planos e o `selectable` do Registry possam dar duas respostas diferentes.

Esta rodada acrescentou primeiro um portão estrutural e testes de projeção, e então projetou o `selectable` publicado pelo Registry no formulário privado do Renderer. A interface de salvamento de Provider já devolvia a nova Settings View depois que a gravação e a atualização eram concluídas; a chamada de salvamento agora retorna essa View à camada de interação, de modo que os julgamentos seguintes usam diretamente o `selectable` mais recente e não dependem do snapshot React anterior ao salvamento. Os dois helpers antigos de julgamento de inicialização que já não tinham chamadores estáticos no Shared foram removidos em conjunto.

Os testes de fronteira do formulário de configurações, de projeção da Settings View, da Registry View de inicialização e do valor de retorno do salvamento passaram, e o `pnpm typecheck` da raiz passou. Os 16 itens do Human in the Loop continuam todos confirmados; este item aplica o desenho já existente de que o Registry decide a selecionabilidade dos modelos e não acrescenta decisão de semântica de produto.

## 263. Remover o filtro antigo de Provider Registry do Agent

O Shared ainda mantinha `shouldIncludeModelProviderInZCodeAgentRegistry()`, que decidia, com base no enabled, na API Key, nos Builtin IDs e nos casos especiais de plano do antigo Provider Store, se algo entraria no Agent Registry. Todos os chamadores de produção já saíram e restavam apenas os testes unitários antigos da própria função; mantê-la continuaria sugerindo que o Store antigo ainda pode estabelecer outra relação de associação de Registry.

Após a auditoria de referências estáticas confirmar zero chamadores de produção, esta rodada removeu a função e o teste histórico correspondente. A associação e o `selectable` atuais dos Providers são determinados apenas pela resolução Official, Personal e Account de `@zcode/provider` e pelo Process Registry. Os demais tipos antigos e helpers de conversão do Shared continuam servindo somente à migração física única e à compatibilidade do formulário do Renderer, sem restaurar nenhuma entrada de filtragem no lado da execução. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 264. A conexão de planos e a navegação das configurações removem o fallback do formulário antigo

Embora a página de configurações já obtenha o Account Access e o `selectable` do Registry pela Settings View, a interpretação do estado de planos ainda permitia que, na ausência de `accountProviderAccessIds`, houvesse retorno à API Key, ao Endpoint e à lista de modelos do formulário antigo; o ponto de estado da navegação de Providers também chamava helpers de campos antigos para reavaliar "está configurado". O `ModelProviderSection` de produção sempre passa explicitamente o conjunto de Account Access, de modo que esse ramo só tinha testes históricos e comentários de compatibilidade, mas ainda podia formar um segundo conjunto de respostas de conexão e de opcionalidade.

Esta rodada passou a definir explicitamente o Account Access ausente como "neste momento não há conexão de conta" e removeu o retorno à API Key/Endpoint e o helper de julgamento de configuração do formulário sem chamadores. A interpretação do estado dos planos Coding/Start/Team, os cartões de detalhe, o primeiro sync e o sync compensatório reconhecem apenas o `accessId` do Account Overlay, e a navegação de Providers só se ilumina com o `selectable` do Registry. Os fixtures de teste passaram a declarar explicitamente o Account Access e o estado de opcionalidade do Registry, sem mais sugerir conexão por uma API Key antiga.

Ao todo, 221 testes de Coding Plan, Provider Family, internacionalização da navegação e portão estrutural do formulário passaram. Os 16 itens do Human in the Loop continuam todos confirmados; este item aplica a fronteira de autoridade de conta e de Registry já confirmada e não acrescenta semântica de produto.

## 265. O Provider Store antigo converge para uma fronteira de migração somente leitura

A auditoria final de referências de produção confirmou que o antigo `modelProviderServiceStorage` só é chamado pela primeira importação da Personal Config e pela migração única da Account API Key, e que os dois chamadores desligam explicitamente a escrita de volta no Store antigo. O ramo interno de "ler e depois gravar no `config.json` antigo" que ainda existia no arquivo era mantido apenas por testes históricos de escrita atômica, fazendo com que o Store antigo parecesse ainda capaz de modificar os fatos oficiais de configuração.

Esta rodada renomeou o arquivo para `legacyModelProviderStoreReader` e o restringiu a um adaptador de leitura puro: ele continua reconhecendo as múltiplas versões dos formatos históricos `config.json` e `model-providers.json` e devolve o DTO antigo de Provider a montante, enquanto o resultado da migração é gravado somente pelo Personal Config Repository oficial e pelo Account Credential Store em suas respectivas novas fontes da verdade. O leitor antigo não grava mais arquivos, não restaura backups e não mantém dependências de escrita atômica. O item não altera o resultado da primeira migração de usuários já existentes e apenas remove uma capacidade de escrita inversa que nunca foi ativada em produção.

## 266. O Provider Seed global do WDIO sai das fontes antigas de fatos

Depois que o Store antigo foi restringido a somente leitura, a auditoria de refutação descobriu que o inicializador global do WDIO ainda escrevia o Provider comum de teste simultaneamente no antigo `model-providers.json` e na Config da CLI. Em runtime esses valores seriam assumidos pela primeira importação Personal, mas os E2E comuns acabavam sempre dependendo também do caminho de migração, e a Config da CLI continuava aparecendo como uma fonte de fatos paralela para o Provider do Worker.

Esta rodada acrescentou primeiro um portão estrutural e então passou os fixtures de DeepSeek, Output Budget, Repo Wiki, Context Window e filtro de Providers a gravar de forma unificada a Personal Config versionada. O modelo padrão do Environment é gravado em um Model Selection Config independente, e a Config da CLI mantém apenas o timeout de `modelStream`. A cópia do Builtin Provider do Coding Plan foi removida em conjunto, e o Provider de planos continua sendo construído pelo Official e pela Account Source. Os testes de unidade que verificam especificamente a importação da configuração antiga foram mantidos e não são misturados aos E2E comuns.

A verificação TypeScript do Desktop E2E passou; os quatro testes de portão estrutural e de Provider Seed passaram, e o lint dos arquivos alterados ficou com 0 warning e 0 error. O Human in the Loop continua com os 16 itens todos confirmados, sem nova decisão.

## 267. O diagnóstico do Desktop E2E sai do fallback de leitura antiga de Provider

Depois da migração do WDIO Seed, o `readModelProviders()` do Desktop E2E ainda lia o antigo `model-providers.json` quando a Personal Config oficial não existia, e ainda conseguia converter o `config.provider` de uma Config de CLI antiga em uma lista de Providers. Embora os E2E comuns já não gravem mais esses formatos, esse fallback de leitura podia mascarar fixtures errados e deixar os testes passarem acidentalmente sem estabelecer a fonte oficial da verdade.

Esta rodada acrescentou primeiro um teste inverso que fixa "quando só existe o Provider Store antigo, o resultado do diagnóstico é vazio" e então removeu o caminho de arquivo antigo, a conversão de Provider/Model da Config de CLI antiga e os helpers relacionados. O diagnóstico do E2E agora interpreta apenas a Personal Config versionada, e a leitura de formatos históricos permanece apenas no migrador único dos Services e nos testes de migração. Os caminhos de fixture da lista de casos correspondente também passaram a usar o `config.json` oficial.

Quatro testes de Desktop Provider Seed e de fronteira passaram, a verificação TypeScript do Desktop E2E passou e o Oxlint dos arquivos alterados ficou com 0 warning e 0 error. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas restringe a fonte de fatos dos testes e não acrescenta semântica de produto.

## 268. Os tipos de migração do Store antigo saem da saída do ZCode Protocol

A auditoria de referências em nível de símbolo confirmou que o Schema de migração `ModelProviderStoreFile` e a função de migração de array puro ainda eram reexportados por `packages/shared/src/zcode-protocol/index.ts`, mas não tinham consumidores de protocolo de produção. Eles descrevem o formato físico antigo de armazenamento e não pertencem ao contrato de comunicação entre App e Worker; manter essa saída continuaria representando uma migração de armazenamento única como uma capacidade de protocolo.

O leitor antigo do Store continua usando a função de migração diretamente a partir dos tipos de Provider do Shared, e os testes existentes de Schema e de migração passaram a testar diretamente o módulo ao qual pertencem; a capacidade de migração única Personal/Account não mudou.

## 269. O limite de conclusão do M2 é elevado a um portão estrutural entre pacotes

A auditoria final descobriu que os testes estruturais existentes de Services, UI e Bootstrap protegiam apenas alguns caminhos de arquivos já removidos e não conseguiam impedir que um DTO antigo, um Snapshot antigo ou uma entrada antiga de Store retornassem à produção sob um nome de arquivo diferente. Apenas afirmar "não há resíduos" com base em resultados de busca também não oferece uma restrição contínua para os commits seguintes.

Esta rodada acrescentou testes de varredura de código-fonte assíncrona entre pacotes, cobrindo os diretórios de produção de Services, UI, Desktop e Shared, além de Adapter, Bootstrap e Contracts do Worker. O portão permite explicitamente que `ModelProviderConfig` exista apenas nos DTOs históricos do Shared, na primeira importação Personal, na migração única da Account Key e em suas entradas de montagem, e permite que `model-providers.json` seja lido apenas pelo leitor antigo do Store. O Snapshot completo antigo do Registry, o protocolo completo de atualização de Snapshot, o Runtime Overlay genérico, a projeção antiga de Settings e o nome do Provider Service já aposentado devem permanecer em zero.

Na primeira execução do portão também foram encontrados o log Scope do leitor antigo e um comentário que ainda usavam o nome removido `ModelProviderService`; os dois foram corrigidos para uma formulação precisa de leitor de migração e de Registry aposentado. Os 16 itens do Human in the Loop continuam todos confirmados, sem nova decisão.

## 270. Os fixtures do Desktop E2E saem do DTO antigo do Provider Store

Depois de concluído o portão de fronteira de produção, ainda restavam dois resíduos nas instalações de teste: o seed comum de Provider do WDIO construía primeiro o antigo `ModelProviderConfig` e só então o convertia em Personal Config, e a leitura do Personal Config pelo E2E remontava por via inversa o mesmo DTO antigo para uso nas asserções. Eles não participam da execução em produção, mas faziam com que novos E2E continuassem dependendo da forma já aposentada do Store e também mascarassem problemas de campos de Config novos não expressos pelos fixtures.

Esta rodada passou a entrada do seed comum a descrever diretamente os tipos de teste de `ProviderConfig` e do `ModelConfig` preciso, removendo as conversões de endpoint, kind, source e model factory do DTO antigo. Os níveis de reasoning, os valores padrão e os mapeamentos passam agora diretamente para o `ModelConfig` oficial, enquanto antes essa parte da metadata se perdia na conversão do DTO antigo para a Config nova. O lado de leitura do E2E passou a usar um `E2EModelProviderSnapshot` explícito, que existe apenas para observação e asserção de teste e não se passa por configuração ou contrato de runtime.

O portão estrutural agora varre recursivamente todo o TypeScript do Desktop E2E e proíbe reintroduzir o antigo `ModelProviderConfig` de nível superior. A verificação TypeScript do Desktop E2E, os testes relacionados de seed e leitura e o Oxlint dos arquivos alterados passaram. Os 16 itens do Human in the Loop continuam todos confirmados; este item apenas limpa a infraestrutura de testes e restaura a expressão dos fixtures de reasoning, sem acrescentar semântica de produto.

## 271. Remover as saídas antigas de consulta e conversão de Provider sem consumidores

A refutação da fronteira continuou rastreando para fora os tipos antigos de Provider do Shared. A auditoria de referências em nível de símbolo descobriu que a UI de produção ainda se ligava indiretamente ao antigo `ModelProviderConfig` por `isModelProviderEnabled()`, e que o Shared ainda expunha funções sem consumidores de produção de consulta de model ID e label, de busca de modelo, de conversão reversa de Kind e de interpretação de formatos suportados. O Remote Model Facts também mantinha uma saída de julgamento de integridade sem nenhum chamador. Essas funções não têm responsabilidade de migração física nem pertencem à fronteira de Turn Runtime Model do M4.

Esta rodada primeiro ampliou o portão estrutural entre pacotes e então fez o formulário de configurações de Provider ler diretamente o próprio campo `enabled` e o E2E de Provider Readiness verificar diretamente `E2EModelProviderSnapshot.models`. Em seguida, os helpers do Shared citados e a saída sem consumidores do Remote Facts foram removidos, e a função de interpretação de modalities, usada apenas dentro do próprio arquivo, foi recolhida a uma implementação privada. Funções como `getModelProviderModelIds()`, que continuam sendo usadas pelo leitor Legacy da migração única, permanecem na fronteira de migração e não foram removidas em bloco por nome.

Dezessete testes do portão estrutural do M2 e da fronteira do formulário de UI passaram, e a verificação TypeScript do Desktop E2E e da raiz passou. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas, sem nova semântica de produto.

## 272. Testes que não são de migração saem do DTO antigo de Provider

Depois de a fronteira de produção ser restringida, os testes comuns de Usage, Repo Wiki, Bots e Provider Runtime ainda usavam o `ModelProviderConfig` completo para montar fixtures. O código realmente testado costuma ler apenas o Provider ID, a API Key e o estado de disponibilidade, ou projetar os campos de modelo em uma Registry View atual; o DTO antigo completo faz com que os testes continuem sugerindo que o Store antigo é o contrato de entrada dessas funcionalidades.

Esta rodada primeiro ampliou o portão de conclusão do M2, deixando claro que o DTO antigo só pode aparecer na migração única, em Schemas históricos e em testes de fronteira do formulário do Renderer. Em seguida, os testes de Usage passaram a usar fixtures mínimas de autenticação, os testes de Repo Wiki passaram a usar fixtures locais de entrada de Registry View e os testes de Provider Runtime passaram a usar a Provider Config oficial diretamente. Nos testes de cache do Bots v2 também foi encontrado um campo `providers` adicional já inválido: o Schema de cache de produção já não o lê, de modo que o campo e a construção antiga de Provider foram removidos, evitando que os testes continuassem validando dados vazios.

Ao todo, o portão de conclusão do M2 e os seis grupos de testes de comportamento citados, totalizando 135 testes, passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas; este item apenas limpa contratos de teste e não acrescenta semântica de produto.

## 273. O protocolo de Session e de autenticação de requisições sai do casulo vazio de Provider Revision

A auditoria de completude em nível de requisito descobriu que, depois que o Snapshot completo de Provider e o CAS de revision já tinham sido removidos, as Settings da Session ainda expunham `appliedProviderRevision`, mas todos os Snapshots de produção passavam `undefined` fixo; a resposta de Provider Runtime Headers também mantinha `providerRevision`, que o Host nunca devolvia e que o Standalone apenas preenchia com o `accessId` e escrevia em log de debug. Nenhum dos dois campos participa mais de atualização, controle de concorrência, autenticação ou criação de Model, e ambos continuavam representando nosql a revision de Registry já retirada como uma capacidade de protocolo.

Esta rodada primeiro incluiu o código-fonte do Core no portão estrutural entre pacotes do M2 e então removeu os campos de revision do Schema da Session, dos parâmetros do Mapper, do protocolo de autenticação dinâmica, do Invocation Context, da Port do Core e do callback do Adapter. A autenticação em tempo de requisição continua devolvendo `requestAuth`, e o retry da verificação de segurança da versão oficial, a conferência de identidade de conta e o refresh a cada attempt permanecem inalterados. As Settings comuns de Session continuam expressando apenas modelo, nível de thought, modo e permissões.

Ao todo, passaram 669 regressões direcionadas de Shared, Services, UI, Adapter, Bootstrap e Core. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores já confirmadas; este item aplica a fronteira de aposentadoria de Snapshot/revision já confirmada e não acrescenta semântica de produto.

## 274. O portão de conclusão cobre todas as Entries de produção e limpa termos enganosos

A auditoria em nível de requisito continuou conferindo que "Host, Worker, Prompt CLI e TUI reutilizam a mesma implementação de domínio de Provider". O portão estrutural entre pacotes já cobria Host, Worker e o protocolo compartilhado, mas não varria o próprio `@zcode/provider`, o `@zcode/provider-node`, o Prompt CLI e a TUI; se uma fronteira antiga retornasse por esses diretórios, os testes não falhariam.

Esta rodada incluiu os quatro diretórios no mesmo portão de código-fonte de produção e fixou em zero nomes já retirados, como Workspace Catalog, o protocolo completo de atualização de Snapshot, o Runtime Overlay antigo e o App Bootstrap antigo. A varredura ampliada não encontrou nenhum retorno do Prompt CLI ou da TUI às antigas fontes de fatos de Provider; ambos continuam se montando pelo Registry de nível de processo.

A varredura também descobriu que, depois que o estado de Workspace foi restringido a Model Preferences, as variáveis locais da implementação do protocolo e as mensagens de erro de revision

A varredura também descobriu que, depois que o estado de Workspace foi restringido a Model Preferences, as variáveis locais da implementação do protocolo e as mensagens de erro de revision ainda usavam `catalog`. Esta rodada unificou a terminologia para Preferences/Registry View, sem alterar a revision de Workspace, o modelo padrão, o nível de thought ou o comportamento de recuperação. O Bootstrap ainda tinha uma função órfã de migração de reasoning OpenAI-compatible sem nenhum chamador; ela foi removida e incluída no portão de helpers aposentados. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 275. A ordem de Providers da página de configurações sai do hardcode de Builtin

Ao continuar refutando a UI com base em "Official/Personal/Account é a única fonte da verdade de Providers", descobriu-se que a página de configurações já obtém a ordem Efetiva completa pela `ProviderSettingsView` e mesmo assim ainda mantinha uma tabela de ordenação por Builtin Provider ID em `modelProviderOrdering`. A ordem explícita da View normalmente a oculta, mas quando a View está ausente ou o chamador não passa uma ordem, essa tabela ainda altera a ordem de entrada, constituindo uma segunda fonte estática de fato efetiva fora da Official Config.

Esta rodada acrescentou primeiro um teste de comportamento que prova que, sem ordem explícita, a implementação antiga reordenava a entrada da Registry View, e então removeu a tabela de ordem de Builtin. A função de ordenação agora faz apenas uma coisa: quando há uma Provider Order View explícita, organiza por ela e mantém a ordem relativa dos itens não listados; sem ordem explícita, preserva integralmente a ordem de entrada. A Order View da página de configurações normal é projetada diretamente a partir da Provider View Efetiva ordenada.

O antigo `ModelProviderDisplayOrderState.updatedAt` dos Shared, que não participava de CAS, de persistência nem de chamadas de serviço, também saiu do DTO antigo de Provider do Shared. A UI usa um `ProviderOrderView` interno que contém apenas `providerIds`, o arraste continua chamando `reorderPersonalProviders()` e a ordem final continua sendo expressa pelo próprio Personal Overlay. As 76 regressões de UI e do portão do M2 passaram, e o typecheck da raiz passou. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores; este item aplica a decisão de ordenação já existente e não acrescenta semântica de produto.

## 276. Estreitar as exportações internas de Provider no Bootstrap e na CLI

A auditoria de símbolos confirmou que os arquivos de primeira importação Personal, de Registry Model Runtime, de Runtime Capability, de Standalone Account Runtime e da montagem antiga de Turn Runtime do Bootstrap expunham um conjunto de tipos, constantes e helpers sem chamadores fora do módulo. São apenas implementações internas dos arquivos, mas se manifestam na camada de código como pontos de extensão reutilizáveis, tornando mais fácil para código posterior contornar a entrada oficial do Registry de processo.

Esta rodada recolheu esses `export` internos e manteve apenas as APIs de Registry de inicialização, de criação de Model e de Selection que são de fato usadas entre módulos. A reexportação duplicada de `DEFAULT_MODEL`, que fica em `model-config.ts`, também foi removida, e a entrada de pacote oficial do Bootstrap continua exportando essa constante de compatibilidade diretamente a partir de Contracts. Após a revisão com o Knip, as exportações sem uso de Provider, Model e Registry no Bootstrap e na CLI chegaram a zero; seis grupos de testes de módulos relacionados, totalizando 61 testes, passaram, e os typechecks independentes do Bootstrap e da CLI passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 277. Remover o helper antigo de estado de Provider desabilitado e estreitar as saídas internas de Account

A auditoria de símbolos dos Services descobriu que `codingPlanProviderAvailability` ainda mantinha `isSystemDisabledCodingPlanProvider()` e `isUserDisabledCodingPlanProvider()`. As duas funções interpretavam a disponibilidade a partir de `enabled/systemDisabledReason` do DTO antigo de Provider e já não tinham chamadores; hoje a Account Source publica diretamente resultados available/unavailable/unknown e não precisa mais dessa camada antiga de inferência de estado.

Esta rodada primeiro usou o portão estrutural do M2 para provar que os dois helpers ainda existiam e então removeu a implementação, fixando que eles não podem voltar. Os tipos e helpers usados apenas dentro do próprio arquivo nos arquivos de Account Credential, Request Auth, Team Plan Key, Connectivity, Provider Runtime, Repo Wiki Selection e Off-Peak também recolhidos ao escopo interno; as interfaces oficiais de Service e Factory permanecem inalteradas. Após a revisão Knip dos Services, as saídas restantes relacionadas a Provider contêm apenas tipos públicos de outros domínios ou tipos ainda pendentes de organização independente. Dezessete grupos de testes de comportamento de Account/Provider e do portão do M2, totalizando 133 testes, passaram. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 278. Recolher as saídas públicas excedentes da implementação de caminhos dos Services

A auditoria de caminhos dos Services descobriu que `getWorkspaceKey()` e `getProviderWorkspaceZCodeConfigIsolationDir()` são usados apenas dentro de `paths.ts` para os caminhos de Session e para o isolamento de skills, plugins e estado de execução de Agentes externos, e mesmo assim ainda eram exportados como API pública. O termo Provider no nome da segunda refere-se ao Runtime de Agentes externos como Claude e Gemini, e não à fonte da verdade de Provider Config de modelos do M2; por isso seu comportamento foi mantido e apenas a exportação do módulo foi recolhida.

Quatorze testes de caminhos passaram; esta rodada não alterou o layout de caminhos, o comportamento de migração nem a semântica de produto de Provider, e não acrescentou nenhuma decisão do Human in the Loop.

## 279. Corrigir a nomenclatura remanescente no portão de cold start do Registry

Ao refutar as condições de conclusão, descobriu-se que os testes de Conversation do V4 ainda chamavam o portão de cold start de "legacy provider registry", e os comentários escreviam que o Host lia um "Snapshot antigo". Na verdade, tanto o fixture quanto o código de produção já leem a Registry View atual pelo `ModelSelectionReadinessSource`, e o Host usa essa View apenas para decidir se a execução de modelos é permitida, sem enviar o Registry completo.

Esta rodada corrigiu apenas nomes de teste e comentários. O comportamento de produção, o protocolo e as decisões não foram alterados.

## 280. Refutação pré-liberação conforme as condições de conclusão

A auditoria final deixou de fazer limpeza pontual de símbolos e passou a confrontar, item a item, as condições de conclusão do M2, varrendo em sentido inverso o DTO completo antigo de Provider, o protocolo de atualização de Registry de Workspace, o Runtime Overlay, o hardcode de ordem de Builtin e o App Bootstrap antigo. Os DTOs antigos restantes estão apenas na migração única Personal/Account, no formulário privado do Renderer e na entrada de tarefas ociosas do M4; no Host, no Worker, no Prompt CLI e na TUI comuns não foi encontrada nenhuma fonte antiga de fatos de Provider para a qual se possa recuar.

Vinte e um arquivos de teste, totalizando 181 testes, de Provider, Provider Node, portão estrutural do M2, autenticação de Account, cold start do Host, runtime do Worker, ordenação de UI e entrada de protocolo passaram. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz ficou com 0 error e as 33 warnings do baseline de staging atual. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores. Depois de buscar o remoto, o branch está baseado em `origin/staging` `6b4f6fc636f5` e está 0 behind em relação a essa base.

## 281. O estado de edição das configurações usa a Config oficial diretamente

A refutação pré-liberação confirmou que o antigo `ModelProviderConfig` compartilhado já saiu da UI de produção, mas que o formulário privado do Renderer ainda replicava o mesmo conjunto de campos `endpoints/defaultKind/kinds/modalities/ProviderOptionsPatch` e depois os traduzia para a Config oficial ao salvar. Essa dupla expressão faz com que a página de configurações continue entendendo a semântica do Provider Store já retirado e também perde, ao editar um modelo, configurações como o `reasoningMapping` que a interface não expõe.

Esta rodada restringiu o estado de edição da página de configurações a cópias mutáveis de `ProviderConfigObject` e `ModelConfigObject`, acrescentando apenas na camada externa o `providerId/modelId`, o estado de projeção do Registry e a marcação de origem Personal. Nome, API Key, tipo de API, Base URL, capacidade e ordem dos modelos modificam diretamente os campos da Config oficial, e o salvamento continua entregando a Configuração Efetiva completa à Facade, deixando o Repository calcular o Personal Overlay esparso dentro do bloqueio. A remoção de um modelo passa a ser expressa retirando o item da lista de modelos válidos, e o Renderer não cria mais lápides do antigo Store.

Como a página de configurações não tem controle de API kind em nível de modelo, a edição de modelo não infere nem grava mais `kinds/defaultKind`. O tipo de API do Provider continua sendo editado separadamente na Provider Config. O pop-up de metadados do modelo altera apenas Model ID, Context Window e Max Output Tokens e preserva as Properties, os Option Specs e o Reasoning Mapping completos do Model Config que não são exibidos.

Os `allowedModelConfigs` das tarefas ociosas continuam sendo a entrada do protocolo de Temporary Provider do M4 e mantêm sua forma dedicada atual; eles não voltaram ao formulário de Provider Settings e não foram disfarçados de Registry Model, e essa fronteira fica com a refatoração já prevista das tarefas ociosas.

Vinte e quatro arquivos de teste da página de configurações, totalizando 313 testes, passaram. Na suíte completa de UI, 777 arquivos e 5996 testes passaram; as 4 falhas restantes em 2 arquivos `v4ConversationDraftSuggestedPrompts` são asserções de tamanho de ícone e de corpo de fonte já existentes no staging atual e não envolvem as configurações de Provider. O typecheck da raiz passou e o lint da raiz ficou com 0 error. Este item aplica a fronteira de mesma origem da Config de Settings já confirmada e não acrescenta nenhuma decisão do Human in the Loop.

## 282. O tipo de API sai do caminho paralelo de configuração em nível de modelo

Ao continuar verificando a fronteira de Config oficial da página de configurações, descobriu-se que `ProviderModelApiFormatTags` ainda guardava um conjunto de API kind em nível de modelo, de Endpoint Path e de controle de seleção múltipla. A interface de produção só reaproveita desse arquivo os títulos de exibição dos tipos de API, e os demais componentes e funções de conversão não têm chamadores. Essa implementação faria com que mantenedores futuros acreditassem que cada modelo ainda pode escolher seu próprio protocolo de execução, em conflito com o desenho atual de que o tipo de API pertence à Provider Config.

Esta rodada primeiro acrescentou um portão estrutural e então removeu esse caminho paralelo de edição em nível de modelo. O formulário de conexão de Provider passou a usar diretamente `ProviderApiType`, e os títulos de tipo de API e os caminhos de protocolo fixos passaram a ficar na exibição de `ProviderApiFormatSelect`. A projeção de Registry View do Repo Wiki também passou a usar o mesmo tipo oficial, e a sondagem de conexão escolhe diretamente o protocolo de requisição e o namespace de options do AI SDK por `ProviderApiType`, sem voltar à conversão antiga de `ModelProviderKind`. Os dois helpers de migração de configurações sem chamadores também foram removidos.

O antigo `ModelProviderApiFormat` agora existe apenas no DTO histórico do Shared e no Legacy Reader da migração única. A interpretação da capacidade de entrada dos modelos de Turn antigos, anterior ao M4, também passou a usar o `ProviderApiType` oficial, mas sua inferência de capacidade de mídia e seu comportamento temporário de execução permanecem inalterados. A página de configurações, o Repo Wiki, a sondagem de conexão e a entrada de execução do Bootstrap não consomem mais o tipo antigo. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 283. A criação do Model Adapter sai da Runtime Model Config antiga

Ao continuar refutando a fronteira de compatibilidade do Bootstrap, descobriu-se que o Prompt Trajectory já criava o Provider Registry oficial e mesmo assim inicializava o `ModelAdapter` com o mesmo `RuntimeModelConfig` antigo. Depois que o App iniciava, o `ApiProviderModelRuntime` substituía imediatamente esse Registry do AI SDK pelo do processo, de modo que a configuração antiga só produzia uma pré-instalação sem valor de negócio e mantinha o `createModelAdapter()` público aparentemente capaz de contornar o Provider Registry na execução comum.

Esta rodada restringiu `createModelAdapter()` a receber apenas um `registryConfig` explícito. O App comum passa um contêiner de execução vazio gerenciado pelo Registry Runtime oficial, junto com a infraestrutura de processo, e o Prompt Trajectory também passa um contêiner vazio, deixando o Registry de Provider de teste que ele já monta publicar os modelos reais. A conversão antiga `RuntimeModelConfig -> AiSdkModelRegistryConfig` permanece apenas dentro do Turn Execution Source, servindo à entrada temporária execution-scoped das tarefas ociosas, e deixou de ser um ramo público de criação de Adapter.

Em conjunto, `createRuntimeAiSdkModelRegistryConfig()`, sem chamadores, foi removido e o portão de conclusão do M2 proíbe sua restauração. Os typechecks de Bootstrap, CLI e Prompt Trajectory passaram, assim como 45 regressões direcionadas do Bootstrap e 37 testes do portão do M2. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 284. Reclassificar os tipos antigos restantes conforme a origem dos fatos, antes da liberação

Depois de fechar a fábrica pública de Adapter, a auditoria continuou pelas condições de conclusão do M2 nos pontos de `RuntimeModelConfig`, `ModelCatalog`, Builtin Provider ID, Provider Family e Store-related. A conclusão da auditoria se divide em três categorias por responsabilidade:

- Nas configurações, seleção, montagem de Registry e criação de Model de Providers comuns de longo prazo não foi encontrado novo retorno a fatos antigos;
- As referências de execução ativas de `RuntimeModelConfig` e `ModelCatalog` estão concentradas em `TurnExecutionModelSource`, que serve apenas à entrada execution-scoped das tarefas ociosas e pertence à fronteira de saída já registrada no M4;
- As referências ativas de Builtin Provider ID e de Family cuidam do mapeamento de conta, planos, compra e autenticação de requisições, consomem o estado produzido pela Account Source e não complementam Properties estáticas de modelo ou Option Specs do Registry, sendo do escopo de organização interna do M6.

Os leitores únicos de Provider antigo da CLI, da Personal Config e da Account Key continuam rodando apenas quando os novos arquivos físicos não existem ou quando há migração de credenciais antigas, e o portão estrutural do M2 continua limitando seus proprietários de arquivo. Os 16 itens do Human in the Loop já têm conclusão de confirmação ou substituição posterior, e não foi encontrada nenhuma semântica de produto que precise de nova decisão.

## 285. Campos antigos de Provider saem do Schema comum de Config da CLI

Ao continuar auditando a Config antiga da CLI, descobriu-se que, embora o `RuntimeConfigPatch` genérico já tivesse removido os campos de modelo, o Schema comum de arquivos ainda declarava e validava explicitamente `provider`, `model`, `modelCatalog` e `small_model`. Assim, um campo antigo de Provider que já não participa da execução bastava, se tivesse formato inválido, para fazer toda a configuração oficial de runtime do mesmo arquivo — MCP, permissões, rede — falhar ao carregar.

Esta rodada moveu os quatro campos para `LegacyCliModelConfigFileSchema`. O `ZCodeConfigFileSchema` comum não os possui mais, e a interpretação da configuração de runtime trata os campos antigos remanescentes como extensões irrelevantes; o Personal Importer da migração única continua usando o Schema Legacy para validação estrita e recusando formatos antigos que não podem ser migrados. Esse ajuste não acrescenta uma fonte de fato de compatibilidade e, ao contrário, limita a leitura do formato antigo e seu impacto de falha à fronteira de migração.

Ao todo, passaram 63 regressões direcionadas de Config e de configuração de ambiente dos Adapters, e o typecheck dos Adapters passou. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 286. Fixar a fronteira restante da Runtime Model Config antiga

A última rodada de auditoria de tipos antes da liberação confirmou que as variáveis de ambiente antigas de modelo já não entram na Runtime Config comum: `ZCODE_MODEL` e `ZCODE_BASE_URL` não têm consumidores de runtime, e as leituras restantes de `ZCODE_API_KEY` servem apenas à importação única do Provider antigo da CLI. A execução normal de Provider continua tendo como única fonte da verdade o Registry de processo agregado a partir das Configs Official, Personal e Account.

As referências de produção restantes de `RuntimeModelConfig` se dividem em dois grupos: a interpretação do arquivo antigo da CLI nos Adapters e o Turn Overlay execution-scoped que o M4 ainda não refatorou. Para impedir que esse tipo se espalhe novamente para Sessions comuns, Settings, Selection, Registry ou ModelFactory, esta rodada acrescentou o conjunto de arquivos permitido ao portão estrutural entre pacotes do M2. O item apenas estreita a fronteira arquitetural, não altera a semântica de execução e não acrescenta nenhuma decisão do Human in the Loop.

Os 111 testes completos de Provider em 14 arquivos e o typecheck do pacote Provider passaram. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz ficou com 0 error e as 33 warnings do baseline de staging atual. Depois de atualizar o remoto, o branch está 0 behind em relação a `origin/staging` `6b4f6fc636f5` e a área de trabalho não tem arquivos não submetidos.

## 287. Unificar a prioridade de execução do Turn Overlay de mesmo nome

A auditoria de ramificação de runtime descobriu que, quando o Turn Overlay execution-scoped e o Registry de processo usam o mesmo `providerId/modelId`, o `ApiProviderModelRuntime` já prioriza a criação do Model do Overlay, mas a troca de modelo, a leitura e a modificação de reasoning do Session Facade ainda interpretavam primeiro o Registry. O resultado é que a requisição real usava o Model temporário enquanto os metadados de UI/Runtime vinham do Registry de longo prazo, violando a fronteira de que um mesmo trecho de execução só pode ter uma fonte da verdade de Model.

Esta rodada fez o `setModel` transitório e as consultas de metadados do modelo atual verificarem primeiro o Turn Overlay, consultando o Registry apenas quando o Overlay não possui o alvo. Ao limpar o Turn Overlay, a ordem também passou a ser remover primeiro a camada temporária e só então restaurar o modelo original a partir do Registry mais recente, evitando que, quando o modelo temporário tem o mesmo nome do original, a resolução volte a encontrar o Overlay que acabou de terminar. O Overlay continua não entrando nas configurações, nas listas de seleção nem na Selection persistida da Session.

Foram adicionados casos de regressão de Provider/Model de mesmo nome, cobrindo a troca transitória, a leitura de reasoning, a enumeração, a modificação e o retorno ao Registry após a limpeza da camada. Os oito testes do arquivo alvo passaram e o typecheck do Bootstrap passou. As 52 asserções dos V4 Commands em execução conjunta passaram, mas um teste de timeout já existente no staging produz uma rejeição assíncrona não tratada `V4PromptRejectedError`, fazendo com que o comando conjunto termine retornando 1; esta rodada não se expandiu para o timing da fila do V4. Os 16 itens do Human in the Loop continuam todos confirmados ou foram substituídos por decisões posteriores, sem nova semântica de produto.

## 288. Auditoria de fechamento do ciclo de vida de Model e das Facades

Na última revisão antes da liberação, a sequência de execução de Registry, criação de Model e projeção de frontend foi conferida novamente. Na criação do `Model`, `bindModel()` fixa os fatos estáticos de execução do Provider; atualizações do Registry afetam apenas Models criados depois, e a atualização de autenticação em tempo de requisição só pode acrescentar as credenciais e Headers daquela requisição. Falhas de leitura ou interpretação do Registry continuam preservando a View last-known-good, e uma atualização bem-sucedida posterior pode recuperá-la. As Facades de Settings e de Selection compartilham a barreira de prontidão do Runtime, e a UI assina antes de ler e descarta resultados atrasados por revision.

Esta rodada não encontrou nenhuma nova fonte de fatos de duplo trilho e não modificou o código de produção. O branch está 65 ahead e 0 behind em relação ao `origin/staging` mais recente. Ao todo, passaram 104 testes direcionados do portão estrutural do M2, de Registry, Facades, Adapter, Bootstrap, Services e UI; o `pnpm typecheck` da raiz passou e o `pnpm lint` da raiz ficou com 0 error e as 33 warnings de baseline do staging. As 16 decisões do Human in the Loop estão todas confirmadas ou substituídas por conclusões posteriores já confirmadas.

## 289. Auditoria de limpeza de migração, conjunto de remoções e atribuição de desvios

O fechamento da liberação continuou investigando três fronteiras que costumam passar despercebidas em uma migração grande.

A Personal Config e o antigo `~/.zcode/v2/config.json` compartilham o mesmo caminho físico. Quando o arquivo antigo não tem o `schemaVersion` de Provider Config, o Repository grava primeiro um backup determinístico por hash de conteúdo, depois chama o único Legacy Importer para gerar o documento v1 oficial e substitui atomicamente o caminho original; a versão oficial e as versões futuras não entram na cadeia antiga de importação. Uma falha no backup não sobrescreve o arquivo original, e inicializações repetidas não repetem a migração. Os testes de migração de Provider Node e dos Services continuam fixando esse comportamento.

Esta rodada também auditou, item a item, os 63 arquivos removidos em relação ao staging. O conjunto removido é formado pelo Store antigo de Providers, pelo Workspace Catalog, pelo Snapshot completo do Registry, pela projeção antiga de configurações e pelos testes especializados deles; os poucos arquivos cujo nome não contém Provider diretamente são camadas de encaminhamento que já não tinham chamadores, o portão de inicialização antigo ou registros temporários mal colocados na raiz do Provider Working Memory. Não foi encontrada nenhuma situação em que uma funcionalidade nova do staging foi removida e depois uma implementação antiga foi reintroduzida em nome do M2.

No Sidecar do Repo Snapshot, os valores `bigmodel / z.ai / others` escrevem apenas metadados de upload do snapshot lateral, usados para atribuição no servidor; eles não escolhem Provider nem Model, não complementam Properties ou Option Specs e não participam da criação de Model. Esse mapeamento de marca continua sendo um objeto de organização posterior do domínio Account/produto, mas não constitui uma fonte da verdade de execução de Provider do M2. Por isso nenhum novo campo de marca de Provider foi adicionado temporariamente ao M2.

As auditorias direcionadas de exportações Knip de Provider, Provider Node, Services e Bootstrap não encontraram saídas públicas sem uso relacionadas a Provider/Model. Ao todo, passaram 55 testes do portão estrutural do M2, da migração de Provider Node, da montagem de migração dos Services e da atribuição do Repo Snapshot. O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz ficou com 0 error e as 33 warnings do baseline de staging atual. Este item não modificou o código de produção e não acrescentou nenhuma decisão do Human in the Loop.

## 290. Fixar a fronteira remanescente de valores padrão hardcoded de modelo

A auditoria em nível de requisito continuou investigando `default-policy` e o antigo `ModelCatalogService`. Os valores padrão de capacidade dirigidos pelo nome do modelo continuam sendo usados pela importação da Config antiga da CLI, pelo Catalog/Turn Runtime antigos e pela projeção de compatibilidade de capacidades de anexos; o Provider, o Model e o ModelFactory do Process Registry oficial não leem essa regra, e Properties e Option Specs completos vêm apenas do resultado da agregação de Official, Personal e Account Config.

Esta rodada acrescentou o conjunto de arquivos permitido de `resolveModelCapabilityDefaults()`, `createDefaultModelCapability()` e `applyModelCapabilityDefaults()` ao portão estrutural entre pacotes do M2. A partir de agora, se esse hardcode de nome de modelo entrar na cadeia oficial de Registry, Model, Settings ou Selection, o teste falhará diretamente. As posições permitidas atuais continuam sendo uma única fronteira remanescente para a migração do Turn Overlay e dos arquivos antigos da CLI pelo M4, e não são descritas como uma segunda fonte da verdade do M2.

O `pnpm typecheck` da raiz passou; o `pnpm lint` da raiz ficou com 0 error e as 33 warnings do baseline de staging atual. O portão de affected-test no push executou novamente os testes estruturais do M2 e passou. O branch está baseado no `origin/staging` mais recente, 0 behind em relação à base, e a área de trabalho não tem conteúdo não submetido.

## 291. Reaplicar o M2 sobre o staging mais recente

O `provider-refistry-m2` foi primeiro rebaseado sobre o `origin/staging` `58cbc6065d` e depois reaplicado sobre o `3524b06c9f`, o mais recente no momento desta verificação. O tratamento de conflitos tomou como base o ciclo de vida de CUA, a página de configurações dinâmica e o comportamento de Team Plan do staging mais recente, preservando ao mesmo tempo o Process Registry do M2, o registro de Provider Services e a fronteira de saída do Registry antigo de Runtime; o `packages/ax-macos`, que o staging já havia removido, não foi restaurado.

A regressão posterior ao conflito descobriu que o fallback do Team Plan ainda chamava `parseTeamPlanConnectionKeyByFamily()`, mas o import correspondente foi perdido durante a reaplicação; esta rodada restaurou esse import. O lock file foi regenerado conforme as dependências mais recentes do workspace e passou no frozen install, evitando manter um resultado de conflito manual. A descrição da cobertura de testes também foi alterada para a semântica atual de Registry readiness do M2.

Os 27 testes de Runtime Config do Bootstrap passaram; os 131 testes do projeto raiz relacionados a conflitos passaram; o `pnpm typecheck` da raiz passou; e o `pnpm lint` da raiz ficou com 0 error e as 39 warnings do baseline do staging mais recente. Esta rodada não acrescentou nenhuma decisão de produto nem alterou o design de Provider já existente no Working Memory.
