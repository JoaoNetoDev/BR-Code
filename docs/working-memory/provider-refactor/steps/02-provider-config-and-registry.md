# M2: implementação de configuração de Provider e Registry

> Status: implementação, limpeza de descontinuação e verificação final de branches concluídas; aguardando lançamento
>
> Atualizado em: 2026-08-21

O design alvo está em [`../design/registry/registry.md`](../design/registry/registry.md). Este documento registra os objetivos de implementação e as fatias do M2. O principal caminho de produção de Providers comuns de longo prazo e a limpeza de descontinuação já foram concluídos; os resultados da limpeza, as fronteiras estreitas de compatibilidade preservadas e a verificação final estão em [`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md), e a avaliação da escala do novo código e das fronteiras de transição está em [`02-provider-config-and-registry-review.md`](./02-provider-config-and-registry-review.md). A revisão estática do Merge Request e as evidências das correções ficam em [`02-provider-config-and-registry-mr-review.md`](./02-provider-config-and-registry-mr-review.md); os itens bloqueadores de lançamento já foram todos fechados.

## Princípio de migração de maior prioridade

As três camadas de Provider Config — Official, Personal e Account — são a única fonte de verdade do Provider Registry. Todos os fatos estáticos expressos de forma duplicada nos ramos atuais de Catalog/Preset, no hardcode Builtin, no resolver de Provider Family, no Provider Config antigo do CLI e no Runtime Snapshot devem ser migrados para essas três camadas ou removidos.

```text
Fatos estáticos antigos ainda válidos
└─ movidos para Official / Personal Config

Julgamentos antigos de conta e plano ainda válidos
└─ convergidos para Account ProviderConfigMap

Lógica antiga de credenciais dinâmicas ainda válida
└─ convergida para o Service de autenticação em tempo de requisição

Ramos antigos que não é possível provar ainda necessários
└─ removidos
```

Durante a migração não se estabelece uma camada de compatibilidade de longo prazo do tipo "Snapshot antigo + Registry novo". É permitido fazer uma migração de formato única no limite de armazenamento físico, mas o caminho de execução pós-migração só pode ler a nova fonte única de verdade. Este princípio tem precedência sobre compatibilizar módulo a módulo segundo as antigas fronteiras de módulo; o M2 deve fazer o caminho de produção começar a consumir a Config oficial e a Access Source o quanto antes.

## Objetivos de implementação

O M2 unifica "como o Model é produzido a partir dos fatos de Provider do Environment atual". Antes do M2 começar, o Host Provider Service, o Worker Workspace Catalog, o CLI Config Parser e o Runtime Overlay interpretavam separadamente as informações estáticas de Provider, fazendo com que o modelo escolhido pelo Host e o modelo realmente executado pelo Worker precisassem ser mantidos coerentes por meio de um snapshot completo e um Overlay de compatibilidade.

O caminho alvo é:

```text
ProviderConfigService
├─ Official ProviderConfigMap
├─ Personal ProviderConfigMap
└─ Official / Personal ModelConfigRules ──┐
                                            ├─> agregação de entrada do Registry
AccountProviderService                      │
└─ Account ProviderConfigMap ───────────────┘
                             |
                             v
            ProviderRegistryService
                     ├─ Provider[] / { modelId, config: ModelConfig }[]
                     └─ createModel(selection)
                                  |
                                  v
                             ModelFactory
                                  |
                                  v
                                Model
```

Host, Core Worker, Prompt CLI e TUI reutilizam a mesma implementação de domínio de Config e Registry, cada um mantendo uma instância dentro do próprio processo.

## Preparo de design já concluído

Atualmente já está definido:

- A Config usa a semântica unificada de ConfigOverlay; a camada esparsa e o resultado final usam o mesmo tipo; as keys são ordenadas, e ao sobrescrever uma key existente a posição é preservada, enquanto novas keys são anexadas na ordem das camadas posteriores.
- ProviderConfig e ModelConfigRules têm ambos dois conjuntos ordenados de entradas: Official e Personal.
- A Account Source produz diretamente a terceira camada esparsa `ProviderConfigMap`, reutilizando o mesmo tipo de Overlay que Official e Personal. O `accessId` do Account Provider e o `models` atual são campos de Config específicos de kind; o Registry não valida/entitlement adicional da conta — a autenticação da requisição é definitivamente decidida pelo Account Service. O contexto da decisão está em [`02-provider-config-and-registry-human-in-the-loop.md`](./02-provider-config-and-registry-human-in-the-loop.md#1-account-access-reutiliza-provider-config-overlay).
- O Registry forma ProviderConfig e ModelConfig em duas rodadas.
- Externamente, Providers e modelos mantêm a ordem; internamente, os índices suportam consulta, validação de Selection e criação de Model.
- A página de configurações e a página de seleção de modelos usam suas respective Facades, sem duplicar lógica de parsing no Renderer.
- A página de configurações só arrasta Providers Personal-only e modelos dentro de Personal Providers; ao salvar, reordena o Personal Overlay conforme a ordem Efetiva, sem criar uma Preference de ordenação separada.
- Cada processo tem sua própria instância do Registry; com o Registry por processo habilitado, o Host Snapshot deixa de participar da associação, atributos, execução ou exibição de Providers comuns de longo prazo.
- Tarefas ociosas selecionam Providers Official Builtin a partir do Registry de nível de processo; em tempo de execução apenas complementam Request Auth e Ticket, sem criar uma fonte temporária de fatos estáticos de Provider.

O design concreto desce camada a camada a partir de [`../design/registry/registry.md`](../design/registry/registry.md).

## Fronteiras da primeira fatia de implementação

O primeiro lote de código do M2 estabeleceu um caminho de domínio que não depende de arquivos, rede, React, Electron, Services ou SDKs de Provider:

```text
Dados comuns de Object / RPC
          |
          v
Config Schema + ConfigOverlay
          |
          v
ProviderConfigResolver
├─ resultado completo de resolução e problemas para Settings
└─ visão válida de Provider publicável no Registry
          |
          v
ProviderRegistry em memória
├─ View ordenado
├─ índices de provider/model
├─ validação de ModelSelection
└─ notificação de mudanças
```

Essa fatia se apoia no novo pacote de domínio puro `@zcode/provider`. As fatias seguintes fizeram Host, Worker, Prompt CLI e TUI reutilizarem este código; o monitoramento de arquivos, a management config remota e as interfaces de conta continuam sendo de responsabilidade dos respectivos Source Services.

Esta seção registra apenas as fronteiras da primeira fatia de domínio na época; não representa o escopo final de entrega do M2. As fatias seguintes já conectaram Host, Worker, página de configurações, seleção de modelos e execução de modelos; o mapeamento de reasoning do Adapter mantém a semântica de execução original.

A superfície de impacto e os contratos de teste no início da primeira fatia estão em
[`02-provider-config-and-registry-impact.md`](./02-provider-config-and-registry-impact.md); é evidência histórica de implementação e não descreve o estado atual de conclusão.

## Fatias de implementação e resultados

```text
M2.1  pacote @zcode/provider                                      [concluído]
      + ConfigOverlay, ProviderConfig, ModelConfigRules e testes de resolução

M2.2  ProviderConfigResolver
      + resolução em duas rodadas, ordenação, Overlay de Provider Config de três
        camadas e portão de integridade
      + ProviderRegistry em memória sem IO, índices, validação de Selection e
        notificação de mudanças [concluído]
      + Selection valida Provider/Model, reasoningLevel e maxOutputTokens de
        forma unificada; Default Configurado e Facade reutilizam o mesmo conjunto
        de regras de Option [concluído]

M2.2b ProviderRegistryService
      + injeção de Config Sources de Official, Personal e Account
      + deduplicação de revision, guarda de geração para refresco concorrente e
        fronteira de falha last-known-good [concluído]

M2.3a Projeção pura de Provider Settings / Model Selection
      + Settings visualiza Personal / Effective / Issues
      + Selection projeta apenas modelos selecionáveis do Registry [concluído]

M2.3b ProviderConfigService e fronteira de persistência Personal
      + ProviderConfigService com Official Source e Personal Repository injetáveis
      + salvamento e reordenação de Personal Provider / Model [concluído]

M2.3c Config Source de produção Official / Personal                         [concluído]
      + na fase de desenvolvimento existiu um provider-config.json separado com
        schemaVersion e um Repository físico
        [concluído; a decisão final de caminho substituiu o nome de arquivo separado]
      + ModelConfigRules suporta apiFormatMatch e reasoningMapping sem estado
        [concluído]
      + OfficialProviderConfigSource somente leitura e injetável, de arquivo único
        [concluído]
      + primeiros lotes de fatos estáticos de API / Account Providers e modelos
        gravados em config/provider/official.json [concluído]
      + importação unidirecional de Personal Config esparso a partir do antigo
        config.json, com backup, migração e substituição atômica no caminho
        original [concluído]
      + o arquivo antigo participa da primeira importação apenas quando Personal
        Config ainda não existe; em execução, o antigo Provider Store não
        sincroniza mais a lista completa de volta para Personal Config; o Schema
        oficial detecta versão no mesmo caminho [concluído]
      + schemaVersion 4 do Provider Config e migração de versões adjacentes
        [histórico de desenvolvimento não publicado, concluído]
      + `access.type` expressa a forma de acesso e `api.type` expressa a API
        pública; Model Config usa `apiMatch + reasoningMapping` para expressar o
        comportamento da combinação modelo/API [concluído]
      + Personal Config usa o caminho existente `~/.zcode/v2/config.json`; antes da
        migração faz backup completo do arquivo original, não sobrescreve se o
        backup falhar e faz substituição atômica no mesmo caminho após sucesso
        [concluído]
      + o Schema completo final é o `schemaVersion: 1` do primeiro lançamento; os
        ramos de migração v1–v5 do período de desenvolvimento não publicado não
        entram na cadeia de compatibilidade de longo prazo [concluído]
      + OpenAI-compatible sempre solicita Usage e a Config não oferece mais
        interruptor de desligamento [concluído]
      + a adição de modelo na página de configurações passa a pré-visualizar
        Official / Personal ModelConfigRules pela Settings Facade; remoção das
        consultas de Catalog no Renderer, da entrada de adição de Catalog Provider
        desativada e da antiga API pública de Catalog [concluído]
      + a leitura e migração do antigo Provider Store não injetam mais metadata de
        Catalog por Model ID; remoção do antigo Catalog Loader, do JSON de
        repositório e dos recursos empacotados do Electron; fatos padrão de modelo
        passam a ser fornecidos apenas por ModelConfigRules [concluído]
      + a primeira migração do antigo Builtin Preset mantém apenas a API Key do
        usuário e as sobrescritas de modelo modificadas; label, endpoint, lista de
        modelos e estado de conta gerados pelo Preset não são mais cristalizados em
        Personal Config [concluído]
      + a página de configurações, a fábrica Shared, o antigo Store e a projeção
        de protocolo param de interpretar o sufixo de modelo `[1m]`; o padrão
        genérico de 200K e o contexto de 1M de `[1m]` passam a ser fornecidos por
        Official ModelConfigRules [concluído]
      + remoção das sugestões de Endpoint já desativadas na página de configurações
        e da interface de sondagem de modelos por Endpoint; Add Provider passa a
        editar apenas Provider Config explícito, sem introduzir outro conjunto de
        candidatos de config vindo de `client/configs` [concluído]
      + remoção da lista de Permitidos de modelos gratuitos do Start Plan e do
        Provider placeholder no Renderer e no antigo Store; a Official Config
        declara modelos estáticos e o Account Overlay decide os membros disponíveis
        para a conta atual; o fallback offline não fabrica mais Account Provider
        [concluído]
      + o teste de conectividade de modelo da página de configurações usa apenas o
        reasoningMapping do Model Config; remoção do hardcode antigo que completava
        thinking / effort pelo nome do modelo GLM [concluído]
      + migração dos fatos estáticos válidos existentes para a Config oficial; o
        Registry de produção não complementa mais fatos de Provider/Model a partir
        de Catalog, Preset ou do antigo Provider Store [concluído]
      + remoção dos antigos construtores de Preset sem consumidores, do pull de
        Config remota e da sincronização de estado estável do Store; o antigo Store
        mantém apenas a migração física única de Personal/Account, e as regras
        históricas de correção são implementações privadas do arquivo de migração
        [concluído]
      + remoção do `modelCatalog` duplicado do Workspace Snapshot, da projeção de
        agrupamento de Provider antigo e da conversão App Config→Protocol Provider
        sem chamadas de produção; o estado do modelo é expresso uniformemente por
        `settings.model` [concluído]
      + remoção da escrita de Workspace Provider/Model Overlay, do estado e dos
        listeners do App; mantém-se apenas o Turn Overlay de escopo de execução
        [concluído]

M2.3d Account Provider Config Source                             [concluído]
      + o login e o julgamento de plano existentes projetam um Account
        ProviderConfigMap esparso
      + Official, Personal e Account usam o mesmo Provider Config Overlay
        [concluído]
      + cada Access Entry carrega um accessId não sensível fixado na criação do
        Model [tipos de domínio, Source de migração Host/Worker e Official Account
        Config concluídos]
      + Properties, Option Specs e mapeamento de reasoning do Account Model passam
        a usar o novo Registry [concluído]
      + o Account Model fixa o accessId e o passa ao Host em cada tentativa de
        requisição [concluído]
      + o Host Request Auth Service resolve credenciais Start / Personal / Team pelo
        accessId fixo [concluído]
      + o Account Request Auth sai do Resolver interno do antigo ModelProviderService
        e passa a ser um contrato de serviço estreito, mantido no processo do Local
        Host; Agent e Off-Peak dependem apenas desse contrato; antes da decisão de
        roteamento entre Hosts não é exposto via RPC genérica [concluído]
      + o Local Host monta o Account Request Auth de forma independente no
        composition root; o antigo ModelProviderService não cria mais nem expõe o
        Resolver; a leitura única da Key do Personal Coding Plan pelo antigo Store
        converge para uma função de migração estreita e independente [concluído]
      + a validação de organização/projeto, a criação e a cópia do Secret da Key de
        tempo de requisição do Team Plan passam para um módulo Account Runtime
        independente; o novo Request Auth e a chamada de compatibilidade com o
        antigo Snapshot compartilham a implementação, e ela não é mais definida
        pelo antigo Provider Service [concluído]
      + o Account Model pode ser criado a partir do novo Registry sem o antigo
        Workspace Secret [concluído]
      + o julgamento de entitlement de Account sai do antigo
        ModelProviderConfig e é estreitado para providerId, entrada de
        autenticação e contexto de Account [concluído]
      + o AccountProviderService sem IO gerencia dependências de Config, barreira
        de prontidão, notificação de refresco e o AccountProviderConfigMap
        last-known-good [concluído]
      + o Host local dispara o refresco pela atualização da Setting de conexão de
        conta e por eventos explícitos de Account Facts, saindo do evento change
        total do antigo Provider Registry [concluído]
      + o Account Connection Result unifica a interpretação de available /
        unavailable / unknown, preserva resultados conhecidos por Provider e forma
        o Overlay de accessId/models [concluído]
      + os Services adaptam o domínio de conta atual, o modo de conexão de Family,
        a seleção Personal/Team e o resultado de entitlement Start/Coding,
        produzindo uniformemente o Account Connection Result [concluído]
      + o Start Plan extrai o conjunto remoto de modelos da mesma consulta de
        entitlement de billing/balance e, quando presente, o leva ao Account Config
        pela Connection Result [concluído]
      + o Host local usa o AccountProviderService e o Connection Resolver para
        produzir diretamente a terceira camada de Account Config; o antigo Snapshot
        completo do Registry deixa de participar da resolução de Providers de conta
        local [concluído]
      + a Personal Coding Plan Key migra por accessId para o Credential Service, e
        o Connection Resolver e o Request Auth passam a compartilhar a mesma
        entrada de leitura; a Provider Key antiga mantém apenas a migração única
        [concluído]
      + o logout OAuth remove a Personal Coding Plan Key do Account Credential
        Store e refresca a Account Source; sai da limpeza da Key derivada pelo
        antigo Provider Store [concluído]
      + a API pública antiga `refreshCodingPlanApiKey` / `clearCodingPlanApiKey` e
        a cadeia de reescrita do Store saem; a mutualidade Start/Coding, o Team
        Project e a semântica de erro temporário passam a ser protegidos por testes
        de Availability independentes [concluído]
      + a projeção de Account Secret de Host → Worker é removida [concluído]
      + remoção do bypass de Account Access/allowedModelIds, aplicando Overlay
        direto de accessId/models [concluído]
      + o Host sincroniza o Account ProviderConfigMap por um protocolo de nível de
        processo independente; o Worker deixa de extrair o Account Config de um
        snapshot completo em workspace/updateProviderRegistry [concluído]
      + o remote anexado ao desktop não estabelece roteamento de Auth entre Hosts;
        o Remote Environment usa sua própria Config, Credential, Account Source e
        Registry [alvo decidido; implementação em M2.8]
      + na cadeia de passagem de accessId existente, a semântica de identidade de
        conta é elevada: os accessId Personal, Start e Team identificam uma conexão
        de conta concreta; são estáveis ao renovar credenciais da mesma conta e
        mudam ao trocar de conta [concluído]
      + o Request Auth confere o accessId com a conta à qual as credenciais atuais
        pertencem e rejeita a combinação de identidade de Model antigo com
        credenciais de nova conta; para Team confere também conta, organization e
        project [concluído]
      + o Account Credential Store passa a usar accessId em nível de conta. A key
        estável em nível de provider atual ainda não foi publicada e essa key
        intermediária não é migrada; as Keys Personal/Team são obtidas
        diretamente pela nova identidade [concluído]
      + a Usage Source e o cache passam a usar uniformemente o accessId em nível
        de conta; a requisição Team preenche o accessId obrigatório e continua
        carregando o contexto organization/project, sem adicionar um
        accountCacheIdentity paralelo [concluído]

M2.4  Host Settings / Selection Facade usando o Registry único
      + ProviderRuntime monta Config, Account Source injetável, Registry e Facade
        [concluído]
      + ProviderRuntime suporta injeção explícita de um Config Runtime criado antes,
        para que a Account Source dependa do mesmo Config Service e exista uma
        ordem de montagem formal [concluído]
      + canal Host RPC e proxy do Client [concluído]
      + a Facade compartilha a barreira de prontidão do Runtime, eliminando a
        corrida de inicialização assíncrona do Host [concluído]
      + a seleção de API Provider comum do Composer principal passa a usar
        ModelSelectionView [concluído]
      + os candidatos de modelo do Account Provider e a conexão atual passam a ser
        expressos diretamente por ModelSelectionView; o Renderer exibe apenas os
        badges Start/Individual/Team com base no accessId fixo [concluído]
      + os fatos de exibição estática de API Provider da página de configurações
        passam a usar ProviderSettingsView [concluído]
      + o nome, o Endpoint, os atributos de modelo e os Option Specs do Account
        Provider na página de configurações passam a usar ProviderSettingsView; a
        projeção de configurações residente não carrega mais campos antigos de
        credencial ou estado de execução [concluído]
      + o teste de conectividade da página de configurações envia o rascunho atual
        não salvo pelo Provider Settings RPC; o Host usa o Settings View mais
        recente para identificar o Account Provider e obtém credenciais dinâmicas
        pela fronteira de autenticação em tempo de requisição, sem ler o antigo
        Provider Snapshot [concluído]
      + com o novo Settings Service já montado, o cold start espera o
        ProviderSettingsView e o refresco manual atualiza diretamente a Account
        Source e o Registry; não assina, lê nem atualiza o antigo Provider Snapshot
        [concluído]
      + a ordem de exibição de Providers e a escrita de arrasto Personal-only
        passam para o Personal Overlay [concluído]
      + a ordem da página vem apenas da Effective Provider View e não lê/grava
        mais a Preference antiga de display-order [concluído]
      + a ordem e a escrita de arrasto de modelos dentro de um Personal Provider
        passam para o Personal Overlay [concluído]
      + a remoção de Provider Personal-only passa para a primeira escrita do
        Personal Overlay [concluído]
      + a criação/edição de API Provider Personal-only passa para a primeira escrita
        do Personal Overlay [concluído]
      + o login por Welcome API Key escreve apenas um Personal Override esparso do
        Official API Provider [concluído]
      + o login por Welcome API Key em um novo Host confirma o Provider pelo
        Settings View e, após salvar, escolhe o modelo padrão pelo Selection View;
        não escreve mais o espelho antigo de Provider [concluído]
      + o Provider Settings Service se torna um serviço obrigatório para todos os
        Entry de produção; a leitura/escritura de API Key e a Management URL usam
        apenas o Settings View, sem voltar ao antigo ModelProviderService em caso
        de falha [concluído]
      + a restauração de Custom Model volta a priorizar o Registry Selection View
        [concluído]
      + o portão de inicialização de rascunho prioriza o Model Selection Service
        [concluído]
      + o portão de inicialização de rascunho do V4 remove o fallback do antigo
        Provider Registry Snapshot e usa apenas o Model Selection View como fato de
        modelos selecionáveis [concluído]
      + o julgamento de disponibilidade de Provider da última seleção/retorno atual
        do ZCode Agent passa a ler o Model Selection View e não lê mais o snapshot
        global do antigo ModelProviderConfig [concluído]
      + a Family Selection após login OAuth e na restauração de inicialização
        remove a leitura do antigo ModelProviderConfig que não participava do
        julgamento e usa apenas entitlement, Team Products e estado da seleção
        atual [concluído]
      + remoção do refresho do antigo Provider Snapshot pelo Settings Sync; hoje
        ainda não há importação de Provider, e qualquer importação futura deve
        gravar explicitamente no Personal Config [concluído]
      + a disponibilidade de Provider na inicialização e os portões de login do Root
        de produção leem apenas o Model Selection View; remoção do estado, das
        assinaturas e dos módulos de refresco do antigo Provider Snapshot no
        Renderer [concluído]
      + o login OAuth, a restauração de sessão e o logout, após convergir o estado
        de seleção de conta, atualizam uniformemente a Account Source e o Registry
        e não chamam mais o antigo refreshCodingPlanApiKey por Provider no Renderer
        [concluído]
      + o aviso de troca de modelo, a timeline e o telemetry de envio leem
        label/baseURL do Provider apenas do Model Selection View e não usam mais o
        fallback do antigo Provider snapshot [concluído]
      + o julgamento de preferência de modelo do Workspace consome diretamente o
        Model Selection View e remove o julgamento de opcionalidade sobre o antigo
        ModelProviderConfig Snapshot no ramo que não é do ZCode Agent [concluído]
      + o reload do Workspace remove o antigo arbitrador de configuração de Provider
        multi-Agent; o identificador histórico de provider é normalizado na fronteira
        para o único ZCode Agent atual, e o eco do modelo usa apenas o retorno de
        prepare, o App Recent e o Model Selection View, sem ler a antiga GLM
        Provider Config sob o workspace [concluído]
      + a restauração de custom provider do V4 remove o fallback do antigo
        ModelProviderConfig e escolhe o primeiro modelo apenas pelo Model Selection
        View [concluído]
      + os candidatos de Provider/Model do comando Bot `/model` no Host local
        passam a ler o Model Selection Service; o cache workspace
        runtime configOptions permanece independente; o Bot Service não aceita
        mais o antigo ModelProviderService como fonte de fatos candidatos
        [concluído]
      + o label de Provider customizado do Bot `/status` passa a ler o Model
        Selection Service do Environment pertence e não obtém mais fatos de
        exibição do antigo ModelProviderConfig [concluído]
      + a migração de inicialização do Bot usa o índice de Provider/Model do Model
        Selection View do Environment pertence e para o pré-aquecimento do cache de
        Config de Provider antigo e o fallback de menu persistente [concluído]
      + a migração única de inicialização do Provider Family Domain infere a atual
        única Family selecionável pelo Model Selection View e não refaz o
        julgamento de disponibilidade a partir do antigo Provider Config
        [concluído]
      + o logout do Root e o desvinculamento de plano na página de configurações leem
        o Model Selection View no momento da operação e usam apenas a optionalidade
        de API Provider para decidir manter o atual Family Domain [concluído]
      + as faixas de pensamento de modelo de Composer, Automation, Subagent e Repo
        Wiki passam a ler os ModelConfig Option Specs do Model Selection View; os
        Entry de produção não complementam mais fatos estáticos do Registry a
        partir de metadata antigo de Provider ou regras de nome GLM [concluído]
      + após a publicação do Model Selection View, o menu de modelos projeta apenas
        candidatos do Registry; Providers antigos filtrados pelo Registry não são
        mais adicionados por lacuna de ID, e a confirmação de View vazio também não
        faz fallback [concluído]
      + a página de configurações do Subagent remove a assinatura de
        useModelProviders e o parâmetro Legacy Provider sempre vazio; candidatos de
        modelo, estado de carregamento e Option Specs de reasoning sem Workspace
        usam apenas o Model Selection View de nível de processo [concluído]
      + as configurações de geração do Repo Wiki removem o parâmetro Legacy
        Provider sempre vazio; o menu de modelos projeta apenas o Model Selection
        View e o reasoning permanece desconhecido quando o View não foi publicado,
        sem completar fatos pelo nome do modelo [concluído]
      + o menu de modelos do Composer, a existência de Provider, o label e a
        elegibilidade de restauração de API Provider usam apenas o Model Selection
        View; quando o View não é publicado permanece vazio e não assina mais o
        antigo Provider Snapshot [concluído]
      + o valor padrão de reasoning do rascunho do Composer lê apenas o Model
        Selection View; quando o View não é publicado ou o modelo não tem Option
        Spec, permanece desconhecido e não usa mais metadata antigo de Provider
        nem regras de nome GLM [concluído]
      + o helper de reasoning unificado da UI remove o parser antigo de
        ModelProviderConfig e o hardcode de nomes GLM, e estreita a entrada pública
        ao Model Selection View já publicado [concluído]
      + após a publicação do Provider Settings View, a página de configurações
        projeta apenas os Providers do View; o snapshot antigo não completa campos
        de execução de Account nem adiciona Providers ausentes da nova fonte de
        fatos [concluído]
      + o Hook de entitlement do Coding Plan passa a usar o accessId do Account
        Overlay para julgar a conexão e construir a identidade de refresco; o
        Renderer não lê mais a API Key para julgar a disponibilidade do plano e a
        entrada de modelos desabilitados mantém o Account Access [concluído]
      + o Plan Identity Snapshot no envio de Session passa a usar o accessId do
        Account Overlay; a identidade do plano, o Entitlement Cache e o telemetry
        de envio não assinam mais o snapshot antigo de Provider nem leem a API Key
        [concluído]
      + a fonte de plano de Usage, o portão de consulta e a identidade de cache da
        página de configurações passam a usar o accessId do Account Overlay; o
        SettingsPage não assina mais a lista antiga de Providers para Usage e o
        painel de Usage consome apenas a fonte final [concluído]
      + o portão de conexão, a identidade de cache e a sondagem de Team Products do
        Usage na barra lateral passam a usar o Account Overlay; o parser público
        de saldo/status de upgrade recebe apenas providerId/label e não depende mais
        do ModelProviderConfig [concluído]
      + os candidatos de plano pessoal, o estado de carregamento e o portão de Team
        Products do Composer Context Usage passam a usar o Account Overlay; o menu
        de modelos também consome apenas o Model Selection View [concluído]
      + após a publicação do Model Selection View, a Automation projeta
        diretamente o menu do Registry e lê o label de Provider do Registry, sem
        refazer o filtro de entitlement com o Provider antigo nem sobrepor a
        exibição estática [concluído]
      + o formulário de edição de Automation remove a entrada de ModelProviderConfig;
        o label do modelo e os Option Specs de reasoning leem apenas o Model
        Selection View e não voltam ao metadata antigo quando o View não é publicado
        [concluído]
      + a página principal de Automation remove as assinaturas antigas de Provider e
        de Entitlement; o menu de modelos permanece vazio enquanto o Registry View
        não é publicado, e o telemetry de criação/execução lê os campos estáticos de
        Personal API pelo Provider Settings View [concluído]
      + a home de tarefas ociosas e o funil de compra julgam o atual Start/Coding Plan
        pelo accessId de Account do Provider Settings View e não deduzem mais isso
        pelo enabled antigo, systemDisabledReason ou Team ID [concluído]
      + o estado de conexão, a espera pela conclusão do login e a sincronização
        automática dos planos Coding/Start/Team na página de configurações passam a
        usar o accessId do Account Overlay; a UI de produção não mantém mais o
        ramo que lia a API Key antiga de Provider quando o Provider Settings Service
        não está montado [concluído]
      + após a compra global do Coding Plan, espera-se explicitamente o refresco da
        Account Source e do Registry; remoção da assinatura antiga de Hook de
        Provider, do refresco de Snapshot e do ramo refreshCodingPlanApiKey
        [concluído]
      + os pontos de entrada de refresco da inicialização do Root, da recuperação/
        login/logout OAuth e da migração de Provider Family, em um novo Host,
        atualizam diretamente Provider Settings / Account Source / Registry e não
        pré-aquecem mais o Snapshot antigo [concluído]
      + o Host local deve montar o Provider Runtime; Official / Personal / Account
        Source se tornam fatos de inicialização e não existe mais ramo de
        compatibilidade de pré-aquecimento do Preset antigo [concluído]
      + remoção da superfície pública de serviço, do registro RPC, do proxy do Host
        e do Sync de Preset antigo do antigo ModelProviderService; o Store físico
        antigo permanece apenas para leitura da migração única de Personal/Account
        e não forma mais um serviço de execução nem fonte de fatos de refresco
        [concluído]
      + o teste explícito de conectividade da página de configurações obtém os fatos
        estáticos de modelo do Registry do Host e as credenciais dinâmicas pela
        fronteira de autenticação em tempo de requisição; o rascunho de edição
        estática não salvo é enviado nesta mesma chamada de Settings RPC, e o
        Start Plan recebe do Renderer apenas o Header de verificação segura
        pontual gerado por esta interação. O Probe existente assume temporariamente
        apenas a sondagem de rede e não interpreta mais fatos de Provider nem
        identidade de Account [concluído]
      + o teste de conectividade de settings eleva a sondagem de rede única após
        autenticação a dependência estreita e não chama mais o antigo
        ModelProviderService nem contorna a lógica do Snapshot antigo via
        `requestAuthResolved` [concluído]
      + remoção do `testModelConnectivity` público do antigo ModelProviderService; a
        cobertura de conectividade migra para testes independentes de Probe, e o
        antigo Service e o Host remoto não mantêm mais essa entrada de compatibilidade
        [concluído]
      + remoção do `getProviderRegistrySnapshot`, do cache de snapshot e dos testes
        dedicados do antigo ModelProviderService; o Repo Wiki também usa
        diretamente o Model Selection View e o Model unificado [concluído]
      + limpeza dos mocks, inicializações e asserções da API de Snapshot removida
        nos testes de UI; a primeira migração de Personal Config lê diretamente o
        Store físico antigo e não passa mais pelo View do antigo
        ModelProviderService [concluído]
      + os demais consumidores de Selection e as leituras/escritas de configuração
        de Settings foram trocados [concluído]
      + a entrada de salvamento de Settings recebe a Config completa e estruturada de
        Provider/Model Efetiva; a Facade calcula o Personal Overlay esparso em
        relação à Official Config e o grava por uma única substituição atômica no
        Personal Config. O Renderer usa estado de formulário privado e não reutiliza
        mais os tipos do Store compartilhado antigo [concluído]
      + o estado de edição do Renderer carrega diretamente `ProviderConfigObject` e
        `ModelConfigObject`, guardando apenas `providerId/modelId` e o estado de
        projeção do Registry. Remoção dos campos endpoints, kind, modalities,
        ProviderOptionsPatch e timestamps que replicavam o Store antigo; o rascunho
        continua sendo mantido pelo Renderer e o salvamento continua chamando
        `saveEffectiveProvider()` para calcular o Personal Overlay esparso
        [concluído]

M2.5  Montagem formal do Registry do Worker e do ModelFactory para API Provider
      + M2.5a projeção de execução do novo Registry para o AI SDK e fronteira do
        ModelFactory [concluído]
      + M2.5b fronteira compartilhada de Node Config; o processo do Worker inicia e
        mantém o Registry [concluído]
      + M2.5c cada App monta o Model Runtime e passa as chamadas de produção de API
        Provider comum, trocando simultaneamente a entrada final de
        escrita/migração Personal e removendo as leituras de fatos antigos
        correspondentes [concluído]
              - a nova entrada de Settings escreve apenas no Personal Config;
                remoção da escrita no espelho do Store antigo e da sincronização
                de estado antigo Store → Personal Config [concluído]
              - os sub-Runtimes de Expert Workflow e Script Workflow reutilizam o
                ModelFactory do Registry de processo e não voltam mais para a cadeia
                de execução do antigo ModelAdapter / Catalog [concluído]
              - o context, output, capacidades de mídia e parâmetros de reasoning
                exigidos pela configuração de compatibilidade do Core são projetados
                uniformemente do Model Config do Registry para Providers já
                presentes no Registry; o antigo Catalog permanece apenas na primeira
                migração e na fronteira de entrada de execução temporária do Turn
                atual [concluído]
              - a inicialização ativa e o `setModel` respeitam a fronteira de migração
                em nível de Provider: quando o Registry já possui o Provider, um
                Model ausente gera erro direto e não é mais montado a partir do
                antigo Runtime Overlay; a restauração de Session ainda preserva a
                Selection histórica, e a leitura de estado também não usa o antigo
                Catalog para explicar um Model removido, até relatar explicitamente
                a indisponibilidade no momento da execução [concluído]
              - a Selection ativa de Registry no Bootstrap é validada pelo
                `validateSelection()` do Registry para as Options genéricas e não
                cria mais a seleção de execução apenas com base no índice
                Provider/Model [concluído]

M2.6  Prompt CLI / TUI passando a usar a implementação de domínio compartilhada
      de Provider                                        [concluído]
      + inicia um Registry de nível de processo quando os caminhos Official /
        Personal já foram injetados
      + o Prompt CLI toma emprestado e libera o Registry dentro de um único ciclo
        de vida do App
      + o TUI reutiliza o mesmo Registry entre /new e resume, liberando-o apenas ao
        fim do Entry
      + o Prompt CLI / TUI usa explicitamente registry-only ao criar o App; após a
        importação da configuração antiga, não monta mais o Workspace Legacy
        Compatibility Source [concluído]
      + montagem do CLI/TUI com a localização da Official Config empacotada e do
        caminho Personal [concluído]
      + importação única das diferenças explícitas de Provider do arquivo de
        usuário antigo do CLI [concluído]
      + o Standalone Selection View e a troca de modelo de Session passam a ler o
        Registry [concluído]
      + armazenamento versionado e independente do Environment Configured Default
        [concluído]
      + o Configured Default / Registry Fallback de uma nova Session sai do antigo
        Runtime Model Config [concluído]
      + uma Session existente prioriza a restauração da Session Selection
        [concluído]

M2.7  Modelos existentes de Account Provider e de execução de tarefas ociosas
      conectados ao ModelFactory unificado [concluído]
      + Account Providers e modelos de tarefas ociosas entram uniformemente no M1
        ModelFactory [concluído]
      + o editor de tarefas ociosas lê as faixas de reasoning apenas do
        `allowedModelConfigs` de escopo de execução e sai da completude Renderer
        por nome de modelo GLM [concluído]

M2.8  Saída do Snapshot completo do Registry Host -> Worker e da cadeia antiga de
      fatos de Provider [concluído]
      + o ModelFactory do Worker local sai do Workspace Compatibility Source; o
        Snapshot antigo deixa de participar da criação de Model no Worker
        [concluído]
      + o Local Host para de enviar o Snapshot completo nas entradas de Session,
        Workspace Read, Generate e V4; essas entradas apenasestablecem uma barreira
        de ordem de Account Config [concluído]
      + o alvo de runtime sync após o salvamento de configurações coleta apenas
        workspaces remotos já conectados e a tab local não dispara mais
        workspace/updateProviderRegistry [concluído]
      + a troca de custom model do Bot local envia apenas modelRef e não aplica mais
        Provider nem envia o Snapshot completo antigo do Registry; o remote
        anexado ao desktop mantém temporariamente a sincronização de compatibilidade
        [concluído]
      + o Repo Wiki consome diretamente o ModelSelectionView do Environment
        pertence; a projeção antiga ZCodeProviderRegistrySnapshot, o parser
        inverso e o readiness resolver foram removidos [concluído]
      + o julgamento de plano e a resolução de credenciais de despacho de tarefas
        ociosas saem da lista antiga de Providers e do Snapshot completo do Registry;
        o Account Overlay fornece accessId/baseURL fixos, e no momento da requisição
        o Account Request Auth Resolver obtém as credenciais dinâmicas atuais
        [concluído]
      + o portão de inicialização do Host local passa a ler o ModelSelectionView;
        Session create/resume/set/send comuns enviam apenas ModelSelection e não
        derivam mais runtimeModel do Snapshot antigo para sobrescrever o Registry do
        Worker; um runtimeModel explícito de escopo de execução continua servindo
        como entrada de uma execução [concluído]
      + ao receber provider.notInRegistry, a troca de modelo local do V4 mantém
        diretamente o resultado de recusa do Registry do Worker e não reenvia o
        Snapshot antigo nem carrega o runtimeModel do Host para tentar de novo; o
        remoto segue a mesma regra [concluído]
      + o pré-aquecimento de rascunho local e remoto do V4 carrega apenas o
        ModelSelection/Options inicial e o Host não resolve mais o runtimeModel
        [concluído]
      + antes da requisição do Start Plan, o Runtime Header lê os fatos estáticos
        apiFormat/baseURL do Provider Settings View; o julgamento de verificação
        segura da versão oficial não tem fallback para o antigo Provider Snapshot
        [concluído]
      + a obtenção de material de verificação segura da versão oficial e a
        preparação de Header de escopo de requisição removem a dependência do
        contrato do Registry Snapshot antigo; o material dinâmico, o Header de
        nível de requisição, os retries e os recibos continuam sendo responsabilidade
        da cadeia de autenticação original em tempo de execução [concluído]
      + remoção do Header global mutável antigo `setProviderRuntimeHeaders` e da
        entrada de compatibilidade da UI; o Header pontual entra apenas na
        requisição de modelo correspondente via request/response, e o Registry
        estático sempre remove Headers pontuais históricos [concluído]
      + o createSession V4 local e remoto de Services replayable/Bot envia apenas
        ModelSelection [concluído]
      + o switchModelConfig V4 local e remoto de Automation envia apenas
        ModelSelection/Options [concluído]
      + remoção do protocolo de hot sync `session/updateRuntimeModelConfig` do
        Host; a restauração a frio cria o Model pelo Registry do Worker, e as
        credenciais e Headers de nível de requisição são obtidos pelo Adapter no
        momento da requisição [concluído]
      + o Bot do Remote Workspace Host recebe o Remote Model Selection Service; o
        menu de modelos do Bot, a exibição de status e a migração do status antigo
        não leem mais os fatos de Provider do Desktop Local Host [concluído]
      + o ProviderRuntime do Remote Host se torna a única fonte de Model de longo
        prazo do Remote Worker; o remote anexado ao desktop não desativa mais seu
        próprio Registry [concluído]
      + a prontidão de modelo remoto, as configurações e as leituras de seleção leem
        o Remote Settings / Selection View e não leem mais os fatos de modelo do
        Desktop base Host [concluído]
      + remoção da injeção principal de workspace/updateProviderRegistry,
        runtimeModel, Account Config e Secret Snapshot de Desktop -> Remote
        [concluído]
      + o Remote Account Request Auth lê apenas o Remote Credential Store; não há
        relay de Auth pelo Renderer nem Auth Broker de Local Host -> Remote Host
        [concluído]
      + o preflight de modelo de Session, no modo de Registry de processo, usa
        apenas o `app.listModels()` apoiado no Registry para julgar associação e
        itens de fallback da seleção; sem Process Registry montado ainda existe o
        antigo Workspace Model Preferences, que guarda apenas interação e seleção
        persistente
      + a criação do Registry App, o Workspace State, a troca de modelo do V4 e o
        usage de restauração a fria saem do antigo Workspace Catalog Provider: não
        geram mais bootstrap config, não sincronizam overlay/limits, não misturam
        Provider View nem publicam o antigo providerRevision; os atributos do
        modelo atual vêm do Registry Model já fixado pelo App Runtime [concluído]
      + ao receber um `runtimeModel` antigo do Host, o processo com Registry não
        escreve mais o estado de Provider do Workspace; o modelo de longo prazo
        continua sendo resolvido pelo Registry e o modelo temporário de escopo de
        execução passa apenas pelo Turn Source independente [concluído]
      + `workspace/readState` converge para um protocolo de projeção pura e remove a
        entrada `runtimeModel` e a escrita de thought de Active Session; a
        preparação de rascunho e o Repo Wiki não mantêm mais a entrada
        `preferredRuntimeModel` [concluído]
      + `workspace/setDefaultModel` salva apenas ModelSelection; o protocolo, os
        Services e o Worker removem a entrada `runtimeModel` e não usam mais
        escrita de preferência do Workspace para complementar o Provider
        [concluído]
      + os comandos de create/switch do V4 removem o fallback de `runtimeModel`
        comum e o ModelSelection é validado apenas pelo Registry do Worker; o
        bypass de Repo Snapshot não lê mais o Workspace State para adivinhar o
        Provider [concluído]
      + os protocolos antigos de create/resume/send/compact/setModel/setThoughtLevel
        de Session removem o `runtimeModel` completo e a revision derivada; uma
        Session comum transmite apenas Selection e o Worker não armazena nem
        aplica mais o Host Runtime Snapshot [concluído]
      + o Provisioning Sync independente posterior grava Config/Credential local
        no Store remoto; ele não participa da construção do Registry nem da
        execução de requisições. Este passo mantém apenas a fronteira de integração
        e não implementa essa sincronização [tópico futuro]
      + posteriormente o App poderá operar configurações e login remotos pelo
        Remote Settings / OAuth Service [tópico futuro]
```

O Account Config dentro do mesmo Environment é primeiro separado do Workspace Snapshot em sincronização entre processos. O Host lê a Overlay atual de terceira camada a partir da sua própria Account Provider Source e envia objetos comuns via `provider/updateAccountConfig`; o Worker resolve isso como `ProviderConfigMap` na fronteira de domínio de Provider, substitui a Account Source de nível de processo e atualiza o Registry. Esse protocolo não carrega JWT, API Key, material de verificação segura pontual nem Header de requisição, e não está vinculado a um Workspace específico.

```text
Host Account Provider Source
        |
        | revision + Account ProviderConfigMap JSON
        v
provider/updateAccountConfig
        |
        v
Worker MutableAccountProviderConfigSource
        |
        v
ProviderRegistryService.refresh()
```

O Account Config foi inicialmente separado do Snapshot completo antigo e, em seguida, o M2.8 saiu do Workspace Snapshot conforme execução, exibição e origem remota. Atualmente, `provider/updateAccountConfig` é a fronteira estreita de sincronização que permanece.

`provider/updateAccountConfig` não é usado entre Environments. O Remote Host forma o Account Config a partir do próprio estado de conta e então o sincroniza com o Remote Worker que ele gerencia. O Desktop Local Host não envia essa Overlay ao Remote Host nem ao Remote Worker.

Tanto o Worker de produção local quanto o remoto possuem o Registry de três camadas Official, Personal e Account. O ModelFactory do caminho de produção comum consulta o Registry do próprio processo; o Entry de protocolo precisa montar o Process Registry e a inicialização falha diretamente quando faltam os caminhos de Official ou Personal Config, sem voltar ao Workspace Provider Catalog.

O Local Host usa o próprio `ModelSelectionView` para julgar que existe ao menos um modelo selecionável e desperta o Worker que aguarda a inicialização quando um Registry vazio fica disponível. Essa View não carrega credenciais de execução e não é usada para construir um `runtimeModel` comum.

Entradas locais como Session create/resume/set/send transmitem apenas `providerId/modelId/reasoningLevel`; o Worker cria o Model conforme o seu Registry mais recente. As camadas Official e Personal do Worker vêm dos seus próprios Config Sources, e a camada Account é sincronizada por um protocolo de processo independente. O `runtimeModel` de escopo de execução ainda mantido na implementação do M2 existe apenas para tarefas ociosas e é uma entrada de compatibilidade do período de migração; a decisão mais recente exige que ele seja depois estreitado para ModelSelection + Request Auth + Ticket, removendo dele a configuração estática de Provider e Model. Ele nunca expressa fatos de longo prazo de Workspace ou de outro Environment.

O remote anexado ao desktop não estabelece mais roteamento de autenticação dinâmica entre Hosts. As requisições do Remote Worker só chegam ao Remote Host, e o Remote Account Request Auth lê o Remote Credential Store. A futura sincronização contínua local→remoto pode atualizar a Remote Config e o Credential Store, mas mesmo após a sincronização o Registry é reconstruído pela Remote Source e o Remote Request Auth resolve as credenciais da requisição. Isso não restaura o Desktop Snapshot nem a autenticação de requisição entre Hosts.

```text
Local Host ModelSelectionView
        |
        +-- portão de inicialização / seleção de modelo
        |
        +-- Submission(ModelSelection)
                    |
                    v
             Local Core Worker
                    |
                    v
          Process Provider Registry
                    |
                    v
                  Model

runtimeModel de escopo de execução durante a migração
        |
        v
entrada de compatibilidade de tarefas ociosas
```

## Ordem de saída das origens em M2.8

Quando o M2.8 foi concluído, o Worker ainda mantinha os dois tipos de origem de Model abaixo. Este diagrama registra o estado de migração já entregue e não é o design final:

```text
Um Agent Loop cria um Model
        |
        v
Turn Execution Source
├─ existe apenas na execução atual
├─ atualmente usado para o runtimeModel de compatibilidade de tarefas ociosas
└─ quando casa, sobrescreve o modelo homônimo do Registry
        |
        | não casou
        v
Process Provider Registry
├─ Official ProviderConfigMap
├─ Personal ProviderConfigMap
├─ Account ProviderConfigMap
└─ única fonte de verdade de Providers comuns de longo prazo
```

O Turn Source e o Process Registry julgam cada um o target que possui. Mesmo que ambos contenham o mesmo `providerId/modelId`, nenhum pode afirmar que consegue criar o Model com base na associação da outra camada. O M2.8 já fez os principais caminhos de produção saírem do Workspace Compatibility Source; a limpeza de lançamento removeu em seguida seu fallback de Bootstrap e os tipos de protocolo antigos. O M4 posterior removerá a configuração estática de Provider do Turn Source: as tarefas ociosas passarão a escolher o Builtin Model pelo Process Registry, mantendo apenas Request Auth e Ticket de escopo de turn.

Os números das fatias servem ao planejamento atual e podem ser ajustados conforme as dependências do código. Ao ajustar, atualize primeiro este documento e não crie uma arquitetura paralela na implementação.

## Fronteiras de continuidade para as fases seguintes

Config, Registry, a montagem principal de produção e a descontinuação das fontes antigas de fatos já foram concluídos e são mantidos pelo portão de limpeza do M2. As fases seguintes continuam a partir da fronteira atual:

- M3 encapsula atômicamente a seleção de modelo e o Prompt como Submission e unifica Session, Draft, Recent e a semântica de troca dentro do Loop.
- M4 remove o Provider de escopo de execução genérico; as tarefas ociosas passam a usar o ModelSelection do Registry e carregam apenas o Request Auth e o Ticket do Turn atual.
- M6 continua a organizar a estrutura interna de identidade, entitlement, refresco de credenciais e autenticação em tempo de requisição do Account Provider.
- M7 implementa o Provisioning Sync e as operações de configuração remota do Remote Environment; o Registry remoto sempre lê as próprias fontes de fatos remotas.

A remoção do antigo Store Reader pressupõe que o suporte à migração única de Personal Config e Account Key seja descontinuado, e ele não participa mais de nenhum design de execução.

As evidências do estado atual estão em [`../research/m2-registry-aggregation-and-refresh.md`](../research/m2-registry-aggregation-and-refresh.md). As decisões autônomas tomadas durante a implementação e que excederam o plano original estão em [`02-provider-config-and-registry-implementation-log.md`](./02-provider-config-and-registry-implementation-log.md).

## Registro de implementação e destino das decisões

Este documento mantém o estado atual das fatias do M2. As decisões autônomas tomadas durante a implementação e que excederam o plano original são salvas em ordem cronológica em
[`02-provider-config-and-registry-implementation-log.md`](./02-provider-config-and-registry-implementation-log.md); as questões de arquitetura, produto e contrato público que exigem decisão humana ficam em
[`02-provider-config-and-registry-human-in-the-loop.md`](./02-provider-config-and-registry-human-in-the-loop.md). O registro histórico pode ser substituído por decisões ou implementações posteriores; os fatos atuais são os deste documento, do Design e do M2 Cleanup.

```text
Questões já respondidas pelo design
└─ implementar diretamente conforme o design

Detalhes de implementação que não alteram fronteiras
└─ decidir de forma autônoma e registrar

Questões que alteram a fronteira alvo
└─ voltar antes à discussão de design
```

## Condições de conclusão

- Official/Personal/Account ProviderConfigMap têm apenas uma lógica de Overlay, e Official/Personal ModelConfigRules têm apenas uma lógica de resolução.
- Catalog, Preset, Builtin hardcode, Family resolver e o antigo Runtime Snapshot deixam de ser fontes adicionais de fatos de Provider/Model.
- Host, Core Worker, Prompt CLI e TUI reutilizam a mesma implementação de domínio de Provider.
- O Registry mantém a Provider View ordenada atual, os índices de consulta e a validação de Selection.
- A Submission de um API Provider comum carrega apenas ModelSelection, e o Worker cria o Model usando o seu próprio Registry.
- As Facades de configuração e seleção usam o Registry, e o Renderer não interpreta a origem da configuração.
- A ordem dos Official Providers é estável, e o resultado de arrastar Providers Personal-only e seus modelos é expresso pela própria ordem do Personal Config.
- Uma atualização do Registry afeta apenas Models novos, e o Agent Loop atual permanece estável.
- Official/Personal Config Source publica invalidação apenas quando a revision de conteúdo muda; a autoescrita do processo Personal não é notificada duplicadamente pelo file watcher, e edições externas continuam valendo imediatamente.
- A lógica de compatibilidade do período de migração já saiu da autoridade de produção e os respingos de interfaces, tipos e fallbacks foram removidos conforme
  [`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md).

Só depois que todas as condições acima e os portões de descontinuação do M2 Cleanup forem atendidos o M2 é marcado como concluído. O M2 já estabeleceu a fronteira unificada de Provider/Model Config, accessId em nível de conta, fontes de fatos de Usage/Entitlement, verificação de conta na autenticação de requisição e isolamento de Credential. Ele não redefine as regras de entitlement do produto, não refaz o protocolo de refresh de Token, o comportamento da API de Usage nem o estado das tarefas ociosas; M4 e M6 tratarão, respectivamente, a semântica de execução de escopo de execução e um modelo de estado mais completo do Account Provider.