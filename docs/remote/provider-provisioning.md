# Provisioning de Provider Remoto

## Status

Especificação da implementação atual. Esta capacidade representa apenas um Provisioning de configuração Local Environment → Remote Environment, disparado pelo Desktop; ela não altera a fronteira de autoridade de Provider/Model do Workspace remoto nem restaura a sincronização histórica de snapshots `workspace/updateProviderRegistry`. A página de configuração de modelos do Desktop está sempre vinculada ao Local Environment e não oferece edição de configuração remota nem entrada de sincronização manual.

## Objetivo

Depois que a Remote Environment é posta no ar e que a configuração de modelos local, o modelo padrão, o estado da conta ou as credenciais cuja sincronização é permitida são salvos com sucesso, copiar automaticamente o snapshot completo mais recente do Local Environment para cada Remote Environment online. Esta capacidade v0 não oferece UI de gerenciamento de configuração remota; o Environment local é a autoridade de edição e o remoto guarda apenas uma imagem de execução descartável.

## Invariantes

- O `provider_config.json` oficial remoto, o `model-selection.json`, o `setting.json` e o Credential Store continuam sendo a fonte de verdade do Environment remoto.
- O Provisioning escreve apenas no Store oficial do Environment de destino; ao final, o próprio Environment de destino reconstrói Provider Config, Account Source e Registry.
- Não se injeta Registry completo, Runtime Model, snapshot de API Key ou Header dinâmico no Remote Worker.
- Não se usa o `provider/updateAccountConfig` entre Environments; esse protocolo continua pertencendo somente à sincronização no mesmo processo entre Host remoto e Worker remoto.
- O Provisioning não passa pelo relay e não persiste Secret no Desktop Main, no Renderer ou no estado de tarefas remotas.
- A remoção local de uma credencial da allowlist remove na sincronia seguinte a credencial de mesmo nome no remoto; credenciais fora da allowlist não são afetadas.
- Os fluxos de tarefa `continuous` do Desktop, `replayable` do Móvel e o roteamento existente de workspace identity permanecem inalterados.

## Gatilhos e Escopo

### Gatilho Automático

Executado apenas para remotos SSH, WSL, Docker e Server, e disparado por uma persistência bem-sucedida ou pelo ciclo de vida do Environment:

- um Remote Environment passa de zero conexões online para pelo menos uma;
- o Personal Provider Config é salvo com sucesso;
- o Configured Default é salvo ou limpo com sucesso;
- as configurações estreitas de conta permitidas pelo Provisioning Envelope são salvas com sucesso;
- uma credencial da allowlist é salva ou removida com sucesso.

Cada sincronização sobrescreve o espelho remoto correspondente com o snapshot completo local mais recente, sem verificar se o remoto já tem configuração e sem comparar se as duas pontas são iguais. Quando o Personal Config local está vazio, o valor vazio também é gravado; credenciais da allowlist usam semântica de replace. Na primeira sincronização por conexão, apenas `applied` / `already-applied` pode publicar Remote Workspace ready; quando o primeiro retorno é `failed`, `rollback_failed` ou `unsupported`, a requisição termina pelo canal oficial de falha de conexão. Uma falha de sincronização posterior em um Workspace já publicado não derruba a conexão: deixa apenas um warning estruturado sem Secret e aguarda o próximo gatilho real para reler o snapshot mais recente.

Quando o R3 Source Server reconecta e troca o `remoteSessionId` (`desktopRemoteSessions.ts handleReconnected`), o Desktop Main primeiro faz dispose do registro que estava ligado à session antiga e depois registra de novo a mesma Environment key com o novo `remoteSessionId`, o que equivale a esse Environment voltar a estar online: dispara um `environment-online` com o reenvio completo, compensando as mudanças de configuração local ocorridas durante o período offline. A reconexão não é uma barreira de publicação; uma falha apenas registra um warning estruturado e não derruba o Workspace já recuperado.

### Coordenação por Environment

Workspace não é a unidade de sincronização. Vários Workspaces e várias janelas do mesmo Remote Environment compartilham uma única lane de sincronização no Desktop Main:

```text
Workspace A ─┐
Workspace B ─┼─> Remote Environment key ─> single-flight lane ─> um Host online executa
Workspace C ─┘
```

O Main guarda apenas Environment key, Host registration, trigger, generation e informações de correlação da requisição; ele não lê nem encaminha configuração e Secret. O Window Host selecionado relê o Local Source mais recente no momento da execução e chama o Remote Target daquele Environment. Um novo gatilho ocorrido durante a sincronização apenas avança a generation; depois que a rodada atual termina, o snapshot mais recente é lido uma única vez para formar uma sincronização trailing, sem enfileirar por evento e sem usar atraso fixo.

### Fechamento da Conexão Física e Encerramento das Requisições de Sincronização

O `ServerRemoteConnection` do Window Host possui simultaneamente o ciclo de vida do transport, do `SocketProtocol` e do `ChannelClient`. Em uma desconexão explícita, socket close/error ou falha de handshake, é preciso liberar de forma idempotente o cliente RPC e o protocolo daquela conexão; as requisições em andamento e as que aguardam Initialize são rejeitadas com `ConnectionClosed`, e respostas tardias não podem completar requisições antigas. O evento de conexão fechada continua notificando as camadas superiores conforme o ciclo de vida de Source já existente.
O `connectOnce` detém a posse da conexão antes de escrevê-la na tabela de online; todas as saídas de falha, incluindo falha de gravação do registro de handshake e erro de parsing de versão, liberam uma única vez a conexão não publicada. Depois da publicação, a tabela de online assume a posse, e o fechamento tardio da conexão antiga não afeta a nova conexão.

```text
Provider apply ainda não retornou -> Source desconecta -> dispose do ChannelClient antigo
                                      -> Host retorna falha de sincronização -> a lane antiga fecha
Nova conexão de Source -> mesmo Environment lê a configuração mais recente -> sincronização com sucesso -> Renderer attachment ready
```

O arquivo de configuração remoto já atualizado não significa que todo o apply RPC tenha terminado; mesmo assim, o usuário desconectando nesse momento precisa satisfazer o contrato acima.
Não se pode pular a barreira da primeira sincronização, nem contornar a requisição pendurada com atraso de UI, limpeza da fila de sincronização ou retentativas extras. A conexão Duplex compartilhada entre o WebSocket Server e SSH/WSL/Docker segue a mesma regra; a queda do relay do celular e a recuperação do attachment replayable não representam o fim físico do Source e não disparam essa limpeza. Não se modifica workspace identity, roteamento de session, as semânticas desktop-continuous/web-remote-replayable nem o formato persistente, e não há migração de dados.

Cobertura de regressão: `serverRemoteConnectionLifecycle.test.ts` cobre com requisições de rede reais o RPC que não retornou no momento da desconexão, a sincronização do Environment na nova conexão, respostas tardias e a liberação duplicada; `r3-provisioning-gui` mantém as asserções de GUI de desconexão imediata após a exclusão, modificação offline, reconexão pelo cabeçalho de grupo, sincronização da configuração mais recente e continuação da conversa.

### Página de Configuração de Modelos do Desktop

Independentemente de o Workspace ativo ser local ou remoto, a página de configuração de modelos lê e grava a configuração local de Provider/Model pelo `IProviderSettingsService` do Local Environment. A página não lê Provider Settings remotos nem exibe botão de sincronização manual Local → Remote. A modificação da configuração remota só pode ser feita pela própria entrada de gerenciamento do Environment remoto; o Provisioning automático da primeira conexão continua seguindo as condições e a semântica de falha descritas acima.

O teste de conectividade de modelo da página também pertence ao Local Environment. Com o Workspace remoto ativo, o teste precisa escolher um workspace local como cwd do Agent; sem um workspace local disponível, devolve um resultado de indisponibilidade e não pode enviar `workspacePath`/`workspaceIdentity` remotos ao Local Host.

```text
SettingsPage
  └─ Model Provider section
       └─ ServiceProvider(localHostServices)
            └─ Local IProviderSettingsService

Active workspace (local / remote) ──determina apenas o contexto do workspace, não a fonte de dados de configuração de modelos
```

### Limites de Validação

A sincronização precisa rejeitar JSON corrompido, estrutura de Envelope desconhecida, formato incorreto de credencial da allowlist, falha de descriptografia de credencial e mudanças de fato durante a leitura da configuração; esses erros não podem ser mascarados pulando campos ou fazendo escrita parcial. Campos de runtime do Personal Provider (por exemplo `api.baseURL`) podem entrar temporariamente na Personal Layer como string (inclusive valores ainda incompletos), mas um Provider inválido precisa falhar de forma fechada na checagem de integridade do Registry e não pode bloquear a sincronização de outros Providers válidos do mesmo arquivo nem entrar em um Registry executável. Registros de Credential fora da allowlist não são fato de sincronização e, mesmo com valor corrompido, não devem bloquear a leitura das credenciais da allowlist; a entrada da allowlist em si precisa ser uma string e precisa ser descriptografável com o Source cipher.

A sincronização continua sendo a substituição atômica do Personal Layer completo, sem descartar silenciosamente nem sobrescrever parcialmente Providers; um Provider inválido permanece no Personal Config de destino e é apresentado por meio do problema de integridade de Provider Settings do Environment de destino. O Configured Default é a preferência inicial de uma nova sessão, e não uma condição de sucesso da cópia de configuração. A sincronização precisa preservá-lo como está; quando o Provider/Model não existe, o reasoning está ausente ou é inválido, o Host de destino usa o `resolveInitialModelSelection` existente para escolher a recomendação disponível do Registry. Sem modelo disponível, permanece sem recomendação, e não se fabrica um modelo executável. Não se pode reverter a configuração já gravada por completo para isso, nem limpar, sobrescrever o padrão persistido ou a escolha de sessões já existentes.

```text
Comportamento antigo: escrita completa → falha na validação da preferência padrão → rollback integral → recusa da conexão do workspace
Comportamento atual: escrita completa → refresh bem-sucedido → abertura do workspace → o Host resolve a preferência padrão ou a recomendação do Registry
Falha real de IO / refresh → rollback da transação original → recusa da primeira conexão
```

Este ajuste altera apenas o tratamento da preferência padrão pelo Provisioning; o Target ainda possui a transação e o Registry, e o Main ainda apenas agenda. Não se adiciona retry, liberação por timeout nem um segundo estado. O `desktop-continuous` do Desktop e o `web-remote-replayable` do celular continuam acessando o serviço pela attachment confiável do mesmo Host já pronto, e as fronteiras de stream, snapshot, queue, owner/lease e `workspaceIdentity` não mudam.

## Dados Sincronizados

### Configuração

Sincroniza o Personal Layer:

- `providers`;
- `modelConfigRules`;
- `providerOrder`;
- o Configured Default de `model-selection.json`.

Não copia o ZCode Built-in Provider/Model Release. O remoto continua usando o próprio Built-in Release; diferenças no conjunto de candidatos entre as duas pontas podem tornar a preferência padrão indisponível, e isso é tratado pela regra de recomendação do Host acima, e não como falha de cópia de configuração.

### Estado de Conexão de Conta

Sincroniza apenas os campos estreitos necessários à resolução da conta:

- `providerFamilyDomain`;
- `providerFamilyConnectionSelections`.

Não copia o `setting.json` inteiro, evitando sobrescrever proxy remoto, diretório de dados, locale, janela e configurações de tarefas do remoto.

### Credenciais

O escopo de sincronização é definido por uma allowlist versionada:

- `oauth:active_provider`;
- access token, refresh token e user info de `oauth:zai:*` e `oauth:bigmodel:*`;
- `zcodejwttoken`.

Após a migração de OAuth → Project Token, `account-provider:*:api-key` deixa de pertencer à allowlist de sincronização. O Source não descriptografa nem envia Keys antigas de conta; o Target não lê, sobrescreve nem remove Keys antigas/manuais já existentes. O novo Source sempre emite `schemaVersion=2`, expressando a semântica de substituir apenas a allowlist de OAuth; o novo Target aceita v1/v2, ignora as entradas antigas `account-provider` de v1 após a validação, e a contagem de resultados considera apenas as entradas OAuth realmente sincronizadas. A v2 não permite entradas de Key de conta.

Um Target antigo aceita apenas v1 e rejeita v2 antes da transação e de qualquer escrita em Store. O Host reporta a falha conforme a semântica de falha de sincronização existente, sem rebaixar o envelope para v1 e sem repassar Keys antigas; OAuth, Keys e configuração já existentes no remoto ficam intactos, e a sincronização só é possível depois de atualizar o Target. A versão do estado idempotente em disco não muda.

```text
Novo Source v2 → Target antigo v1 rejeita na validação → zero escrita, credenciais antigas preservadas
Novo Source v2 → Novo Target → substitui apenas a allowlist de OAuth
Source antigo v1 → Novo Target → ignora Key de conta histórica e preserva o valor já existente no destino
```

O Host de destino troca o Token usando o estado de login sincronizado e seu próprio cache de Key ID; Tokens de curto prazo e caches de ID não são transmitidos entre Environments. As Keys de Providers manuais explícitos continuam sendo sincronizadas junto com o Personal Config. Esta mudança não modifica a lane de sincronização existente, o rollback de transação nem as fronteiras desktop continuous/mobile replayable.

Não são exportadas senha/chave privada SSH, credenciais de Bot, tokens OAuth de MCP, Secrets de plugin ou outras Credential keys genéricas.

O cipher de credenciais local e remoto pode ser diferente, e é proibido copiar diretamente o texto cifrado de `credentials.json`. O lado Source descriptografa os valores da allowlist pelo Credential Service, e o lado destino criptografa novamente pelo próprio Credential Store ao gravar em disco. O Result e os logs registram apenas contagens, status e identificadores não secret, e nunca retornam nem imprimem valores de credencial.

## Transação e Rollback

O Provisioning Envelope contém:

- `schemaVersion`;
- `syncId`;
- revision de config/model/settings do source (usada apenas para a checagem de consistência da leitura do Source);
- o destino não faz julgamento de revision de conflito entre Environments;
- Personal Layer, Configured Default, configurações estreitas de conta e credenciais da allowlist.

O destino valida o Envelope inteiro primeiro e então grava nesta ordem:

1. configurações estreitas de conta;
2. credenciais (recriptografadas pelo destino);
3. `provider_config.json`;
4. `model-selection.json`.

Cada arquivo oficial usa a escrita atômica e o lock existentes. Dentro da transação, o destino mantém em área temporária o valor antigo/novo de cada domain; se qualquer etapa falhar, todos os domains já gravados são restaurados em sentido inverso conforme o registro. Uma falha de restauração precisa retornar `rollback_failed`, e é proibido reportar sucesso. Após o rollback, o Account Source/Registry da memória do destino é atualizado, fazendo os fatos restaurados valerem imediatamente, mas sem gerar um resultado de Provisioning bem-sucedido. Após o sucesso, o destino atualiza ativamente o Account Source/Registry e só então a cadeia existente de account overlay Host → Worker remoto sincroniza até o Agent Worker.

O Active Model em execução continua obedecendo à semântica de «congelado na criação»; o Provisioning afeta Models/Sessions criados depois e não reescreve silenciosamente requisições em execução.

## Fronteira de Processo

```text
Desktop Main: Environment Coordinator(apenas metadados de agendamento)
  └─ seleciona um Window Host online daquele Environment
       ↓
Window Host
  ├─ relê o Local Provider Provisioning Source
  └─ Remote Target RPC(SSH/WSL/Docker/Server)
       ↓
Remote zcode-server
  ├─ escrita e rollback do Target Store
  ├─ refresh do Remote ProviderRuntime
  └─ sync de Account Config do Remote Host → Worker
```

O Remote Target RPC não reutiliza a interface de escrita `IProviderSettingsService` do Renderer, evitando misturar «cópia entre Environments» e «edição local remota» num único caminho sem idempotência e sem rollback.

### Barreira de Refresh do Registry do Worker

Depois que o Provisioning grava o Personal Config do Environment de destino, um Agent Worker já existente pode continuar segurando o Registry em processo de antes da gravação. O Host remoto, antes de criar sessão, trocar modelo e executar uma entrada, precisa fazer o Worker alvo ler e atualizar o Registry a partir do próprio Config Store oficial, por meio da requisição interna `provider/refreshRegistry`; essa requisição não carrega Registry do Desktop, credenciais nem snapshot de configuração de modelos. O refresh e a checagem da Selection pendente precisam acontecer antes do ACK da entrada; quando o refresh falha ou a Selection está indisponível, a entrada é rejeitada e o rascunho do usuário é preservado, sem fazer ACK antes e deixar o turn de background falhar silenciosamente.
O `switchModelConfig` da V4 compartilha essa mesma barreira de refresh: o comando de troca de modelo só é enviado depois de o refresh ter sucesso.

```text
Host execution admission
  -> Worker provider/refreshRegistry
  -> Worker reads local Personal/Account Config and rebuilds Registry
  -> Selection validation
  -> ACK + turn execution
```

Essa barreira não reinicia o Worker, não muda a semântica de «congelado na criação» do Active Model em execução e não muda a fronteira de transmissão do `continuous` do Desktop com o `replayable` do Mobile.

## Compatibilidade e Semântica de Falha

- Result e o resultado de execução do Host recebem um `errorCode` opcional, aceitando apenas uma enumeração fixa: `source-read-failed` (leitura do snapshot local), `target-call-failed` (chamada remota lançou erro, incluindo validação/pré-leitura/RPC), `target-write-failed` (escrita no Target Store), `target-refresh-failed` (refresh de conta/Registry), `target-commit-failed` (escrita do registro idempotente), `target-apply-failed` (Target antigo só devolve estado de falha), `capability-unavailable`, `session-unavailable`, `host-execution-failed`. `rollback_failed` continua expressando a falha de rollback separadamente e não sobrescreve a etapa original da falha. O código de erro não inclui caminhos, credenciais nem texto livre do remoto.
- O novo Host usa `target-apply-failed` para códigos de erro ausentes ou desconhecidos do Target antigo; resultados antigos continuam legíveis. Isso não altera a versão do Envelope, o estado de sucesso nem a versão do arquivo idempotente, e não infere a falha de causa subjacente que não pode ser confirmada. A correção da preferência padrão exige publicar simultaneamente o bundle do server remoto; atualizando apenas o Host, o Target antigo continua executando a validação estrita original.
- Uma falha na primeira sincronização registra Environment, trigger, status, errorCode e duração antes do reject; o painel de conexão e o feedback recebem ao mesmo tempo uma linha de falha com código de erro seguro. Falhas posteriores em conexões existentes continuam sendo registradas apenas como warning. O `errorMessage` / `error` original não é copiado diretamente para o log do Main ou para o Renderer.

- Quando um remoto antigo da primeira conexão não suporta a capability de Provisioning, o retorno é `unsupported`, sem envio de Secret e sem publicar Remote Workspace ready.
- O `zcode-server` HTTP só expõe o target de Provisioning para Desktop Hosts confiáveis depois que `ZCODE_SERVER_AUTH_TOKEN` está configurado; sem autenticação configurada, ele permanece «não suportado», evitando expor a entrada de credenciais entre Environments a conexões anônimas.
- O Core do R3 Source Server (`packages/zcode-server-cli`, `serviceAuthorityMode: "standalone-server"`) **sempre** registra o target de Provisioning: o R3 ingress token (`<serverRoot>/run/ingress-token`, 0600) está quase sempre presente, e não existe o ramo «sem autenticação configurada, então não suportado» da linha anterior. O isolamento acontece na camada de `clientMode`: a conexão `desktop-continuous` de `/ws/host` (capability ticket + ingress token) recebe o `IProviderProvisioningTargetService` real; a conexão `web-remote-replayable` de `/ws` é sobrescrita em `exposeWebSocket` por um stub que lança erro («Provider Provisioning só é suportado por Desktop Host confiável»), e o allowlist de celular do Window Host também não inclui esse channel. O daemon antigo (sem target) não recebe Envelope na cadeia principal do R3: `ZCODE_MIN_COMPATIBLE_VERSION` tem como padrão a versão do produto, e o portão de compatibilidade do R3 já julga «precisa de upgrade» na fase de handshake e executa primeiro a atualização remota; só o Core atualizado entra no Provisioning de primeira conexão. O ZCode Built-in Provider Config usado pelo Core é materializado por define de build, com hash do conteúdo, em `~/.zcode/server/config/provider/zcode-builtin-<sha256>.json` (sem escrita no diretório de release imutável). A integração do lado R3 está em [r3-source-server-remote-architecture.md §8.3](../architecture/r3-source-server-remote-architecture.md).

  ```text
  zcode-server-cli Core（standalone-server，target permanente）
    ├─ /ws/host  desktop-continuous ──► IProviderProvisioningTargetService（implementação real）
    └─ /ws       web-remote-replayable ─► { apply: () => throw }（stub；o allowlist de celular do telefone também não inclui esse channel）
  ```

- Uma falha de sincronização automática depois que o Remote Workspace já está conectado registra apenas um warning estruturado, não derruba a conexão existente e não muda o feedback de sucesso de salvamento local; esta rodada não adiciona estado de erro de Environment, protocolo, Banner nem entrada na página de Settings. Essa é a semântica transitória antes da entrada em produção do gerenciamento independente de configuração remota.
- Quando uma desconexão de rede torna o resultado desconhecido, a retentativa usa o `syncId`; quando o destino recebe novamente qualquer `syncId` já concluído, ele devolve o resultado anterior e não reaplica o envelope antigo porque uma sincronização posterior sobrescreveu o registro idempotente.
- Quando o Environment está offline, uma intenção de sincronização pendente é mantida e, ao voltar a ficar online, o estado local mais recente é lido e executado; falhas comuns não entram em retentativa em laço e aguardam o próximo gatilho real.

## Inicialização de Conexão do Source Anexado ao Desktop e Canal Inverso de Recursos

Cada geração de conexão RPC física estabelecida pelo SourceServerConnectionManager via SSH / WSL / Docker, antes de publicar online e permitir o attachment de workspace lógico, primeiro envia o `dynamicWorkflowMode` atual do Desktop. A reconexão automática também lê o modo mais recente; quando a sincronização do modo não é suportada ou falha, apenas se registra um aviso, seguindo o comportamento de compatibilidade já existente com versões antigas. O `kind: "server"` independente mantém a própria autoridade de configuração e não recebe esse modo.

O canal RPC inverso de recursos de tópicos de grupo e de respostas de channel pertence à conexão física, e múltiplos workspaces lógicos do mesmo Source compartilham esse canal. Cada requisição passa antes pelo registry para verificar se `remoteSessionId + workspaceIdentity + workspacePath` ainda pertence ao attachment online atual, e depois confere que o serviço de Agent é a instância proxy daquela conexão física; não se pode usar a identidade do objeto lógico de ServiceCollection como identidade física, nem liberar apenas por caminho de workspace. Socket fechado, falha de conexão ou dispose da conexão física liberam o canal inverso e as leituras em andamento; o fechamento de uma tab lógica não fecha a conexão física compartilhada com outras tabs. Cada nova conexão física cria o seu próprio canal, e requisições da geração antiga não podem usar as permissões da nova geração.

```text
RPC físico estabelecido → registra canal inverso → envia o workflow mode do Desktop → Manager publica online
                         │                                  └→ múltiplos logical attachment
Fechamento/liberação física ─┴→ cancela as requisições de recursos da geração antiga; a reconexão refaz tudo a partir do RPC estabelecido
```

Essa costura gerencia apenas conexões físicas já autenticadas e o roteamento inverso; não adiciona runtime, fila de entradas aceitas nem estado de negócio. As fronteiras de desktop continuous e de mobile replayable via shared-host mantêm o clientMode de suas attachments confiáveis.

O roteamento interno de peer do Source Server usa a workspace identity canônica; antes de a RPC inversa retornar ao Desktop, a mesma resposta é convertida de volta para a stable identity pelo mesmo workspace identity mapper, e a resposta é mapeada de volta para a canônica. A checagem de permissões do registry do Desktop continua usando a stable identity; não se pode vazar a identity interna como identidade de outra attachment, nem baixar a checagem para comparar apenas o workspacePath para contornar a validação.

## Regressão de Preferência Padrão e Diagnóstico de Primeira Falha

- A regressão de Store real de `R3A-PRV-05` precisa verificar a substituição completa após a exclusão de um Provider, a preservação do padrão inválido e o retorno sem recomendação em um Registry vazio; `R3A-PRV-11` precisa verificar que o Provider inválido permanece na Personal Layer mas não é executável, que o padrão inválido é gravado como está e que o Host recomenda um modelo válido. Nenhuma das duas pode continuar afirmando «padrão indisponível implica rollback»; falhas reais de escrita, refresh e commit continuam sendo verificadas como rollback por `R3A-PRV-08`.
- Os testes focais cobrem reasoning ausente/inválido, Provider/Model ausente, Registry vazio, padrão válido, falhas de escrita/refresh/commit idempotente e de rollback, além do tratamento seguro de resultados antigos e códigos de erro desconhecidos.
- `SSH-P0-CONN-08` valida por Electron → SSH → Target remoto reais: quando a credencial de sincronização local está corrompida, tanto o erro quanto o log de conexão mostram `source-read-failed`; depois de restaurar a credencial, mesmo com um padrão inválido preservado, é possível entrar no diretório e no workspace remotos. O caso usa a fixture de inicialização sem conta já existente, evitando o popup de expiração de login por causa de um OAuth falso e sem relação.
- 2026-10-09: o E2E SSH de macOS Desktop → Ubuntu 22.04 aarch64 isolado passou, artifact `desktop-e2e-20261009032604472-p1453-8bb89553244ba5cc`. O caso permanece pending e não teve promoção manual. Windows/WSL, outros sistemas remotos e a UI no celular não foram testados em máquina real; como a entrada no local do usuário que reportou o problema não foi obtida, não se afirma ter reproduzido o incidente histórico de cada usuário. O rollback pode reverter este commit, e não há migração de formato persistente.
