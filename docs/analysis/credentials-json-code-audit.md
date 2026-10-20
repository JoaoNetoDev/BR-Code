> **Todo103 / G09: preservado como auditoria histórica, não como contrato de refatoração atual.** Este documento vem do commit de staging
> `846b31c21b`; abaixo, "atual" significa `baffd62dcf`. Os links de código / números de linha também correspondem apenas a essa base;
> para verificar arquivos antigos use `git show baffd62dcf:<caminho relativo do repositório>` e não trate um arquivo homônimo do branch atual
> como a prova original. Os caminhos antigos de model-provider / preset / family foram substituídos pelas fronteiras atuais de Account,
> Provider Runtime e Model Selection; não restaure interfaces antigas com base neste documento. A correção do 401 do G09 está em
> [contrato atual](../oauth/jwt-401-auto-logout.md), incluindo a revisão de credenciais na fila e a limpeza de accountIdentity.
> Os problemas aqui listados (CLI, MCP, criptografia, transações entre processos) não viram tarefas de correção automaticamente por causa da consolidação.
> O estado transitório de conexão única e as decisões adiadas do Todo101 permanecem inalteradas. O conteúdo original da auditoria e os registros de verificação
> são preservados como estão e não contam como aprovação de validação no código atual do Todo103.

# credentials.json — levantamento de credenciais e ciclo de vida

Data da auditoria: 2026-09-08. Base de código: `baffd62dcf7e5762b24bee9d0003128793101a11` (`origin/staging`).

Este documento registra os fatos de código dessa base para uso em verificações e correções posteriores; não significa que os problemas aqui descritos já tenham sido corrigidos. Todos os exemplos e verificações de execução usam credenciais sintéticas e não contêm tokens reais, dados de usuário ou dados locais descriptografados. Os links de código-fonte partem de `docs/analysis/` e os números de linha correspondem à base acima.

Ordem de leitura: armazenamento e fronteira de permissões → campos OAuth e seus consumidores → ciclo de vida de CLI/MCP → Bot/remoto/relay → [Conclusões da auditoria e registros de verificação](#conclusoes-da-auditoria-e-registros-de-verificacao).

## Escopo e regras já alinhadas

Os logins ZAI e BigModel no App são mutuamente exclusivos: ao concluir o login é preciso limpar as credenciais de login da plataforma antiga, mantendo apenas o estado de login da plataforma atual e o novo JWT. `zcodejwttoken` é um campo compartilhado pela sessão atual do App, e não uma credencial mantida separadamente por plataforma.

A partir disso, apagar o JWT antigo em si não é o problema. Os pontos de verificação são se a limpeza do login antigo está completa, se a nova credencial veio do mesmo login e se sobra algum active provider ou credencial de login após o logout. O fluxo de cancelamento também não pode ser "corrigido" como "restaurar o JWT antigo" sem confirmação.

```text
Sessão da plataforma atual
    |
    +-- Novo login concluído --> limpar credenciais de login antigas --> nova sessão da plataforma atual
    |
    +-- Logout --------------------> sem active provider / credenciais de login no App

Outros domínios de credencial: autorização MCP / Bot / conexão remota / autenticação de dispositivo relay
    `-- cada um tem seus próprios fluxos de atualização, invalidação e remoção; o logout atual do App não limpa o arquivo inteiro
```

A regra de plataforma única se aplica à identidade de login do App. Credenciais de MCP, Bot, SSH e relay também ficam no mesmo arquivo, mas o código atual não as inclui no escopo de remoção total da troca de login do App. Se é preciso adicionar uma estratégia de limpeza vinculada à conta, isso é outra decisão de design.

## Implementação de armazenamento e fronteira de acesso

### Local do arquivo

| Entrada | Regra de caminho | Base de código |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Desktop / serviço Node | `{dataBaseDir}/.zcode/v2/credentials.json` | [credentialService.ts](../../packages/services/src/credential/credentialService.ts#L27) |
| dataBaseDir do serviço | valor definido por `setDataBaseDir()` > `ZCODE_DATA_BASE_DIR` lido na inicialização do módulo > `HOME` > `os.homedir()`; os três primeiros removeem espaços nas pontas | [paths.ts](../../packages/services/src/paths.ts#L57) |
| armazenamento compartilhado CLI / MCP | `filePath` explícito tem prioridade; senão `{baseDir ?? env.ZCODE_DATA_BASE_DIR ?? os.homedir()}/.zcode/v2/credentials.json`; suporta `~`, `~/` e absolutização | [shared-credentials.ts](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L257) |

Portanto, a premissa de "arquivo compartilhado" depende de que os dois lados resolvam o mesmo diretório de dados. O CLI não chama `setDataBaseDir()` do App e o tratamento de caminhos em branco não é idêntico; não se pode inferir que todos os processos usam o mesmo arquivo só pelo nome.

### Acessantes e a verdadeira localização de persistência

```text
Desktop renderer
    `-- hook / RPC --> ICredentialService (Host) --------+
Desktop main relay / telemetry service ------------------+--> arquivo de credenciais local
CLI login / MCP --> SharedZCodeCredentialStore -----------+
                         (compartilhado quando resolve para o mesmo caminho)

Workspace SSH / WSL / Docker
    `-- serviço local de OAuth / credenciais ----------------> arquivo de credenciais local

Server remoto
    `-- connectionServices.credentialService RPC -----------> arquivo de credenciais do Server

OAuth do próprio navegador
    `-- BrowserOAuthCredentialRepo --------------------------> localStorage
        pending login (nonce/provedor/endereço de callback)--> localStorage
```

- `ICredentialService` expõe `load/save/delete`; a UI usa hooks como `useCredentials()`. A camada de armazenamento genérica não entende provider OAuth, conta ou workspace, apenas aceita chave/valor. [interface](../../packages/services/src/credential/credential.ts#L11), [hook](../../packages/ui/src/hooks/useCredentials.ts#L8).
- O serviço local é criado e registrado em `createLocalServices`; o main do Desktop ainda cria o mesmo tipo de serviço de arquivo para relay e telemetry, portanto não se pode descrevê-lo como existindo apenas uma instância de Host acessando o arquivo. [services/node.ts](../../packages/services/src/node.ts#L1213), [main/index.ts](../../packages/desktop/src/main/index.ts#L675).
- O conjunto de serviços de workspace SSH/WSL/Docker cria explicitamente o serviço local de credenciais/OAuth; o Server remoto por sua vez encaminha para os serviços do destino de conexão. São duas fronteiras de posse diferentes. [remoteWorkspaceServiceCollection.ts](../../packages/desktop/src/host/remoteWorkspaceServiceCollection.ts#L83), [ramo do Server](../../packages/desktop/src/host/remoteWorkspaceServiceCollection.ts#L315).
- Embora o OAuth do navegador reutilize os nomes `oauth:active_provider`, `zcodejwttoken`, `oauth:zai:*`, seu armazenamento local não é o `credentials.json`. O estado de login do próprio navegador e os serviços do Host conectado devem ser acompanhados separadamente. [browserOAuthCredentialRepo.ts](../../packages/web/src/auth/browserOAuthCredentialRepo.ts#L11).
- Este documento não altera a fronteira de restauração de mensagens do desktop contínuo ou do celular replayable; a posse de credenciais não pode ser usada como base para concluir que se deve criar outro Agent/runtime no celular.

### Formato do arquivo, criptografia e compatibilidade

O nível superior é `Record<string, string>`. Valores complexos são serializados primeiro como string JSON e depois todo o value é criptografado; os nomes das chaves continuam salvos em texto claro. O arquivo não tem versão de nível superior, id de conta global nem rótulo de tipo de token; a semântica é decidida pelo chamador de cada key.

```text
Valor de negócio / string JSON
    --> AES-256-GCM
    --> "enc:v1:<base64url(iv)>.<base64url(authTag)>.<base64url(cipherText)>"
    --> credentials.json[key]
```

| Item | Comportamento atual |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Algoritmo | AES-256-GCM; IV aleatório de 12 bytes, auth tag de 16 bytes |
| Chave | `SHA-256(secret)`; prefere `ZCODE_CREDENTIAL_SECRET`, senão usa `zcode-credential-fallback:<platform>:<homedir>:<username>` |
| Diferença Desktop/CLI | O Desktop usa a variável de ambiente não vazia tal e qual; o CLI faz `trim()` antes e, se sobrar só espaço em branco, volta ao valor padrão |
| Texto claro antigo | Valores que não começam com `enc:v1:` são devolvidos diretamente, sem nova criptografia automática numa leitura |
| Leitura comum | Se a key não existe, retorna `null`; arquivo inexistente é tratado como objeto vazio |
| Arquivo corrompido | Com JSON/schema inválido, guarda um `.corrupt-<hash>.bak` nomeado pelo hash do conteúdo e depois lança o erro; é proibido sobrescrever como objeto vazio |
| Falha de descriptografia | O Desktop lança um credential decrypt error estruturado; o CLI lança um `Error` comum. A camada de negócio decide se limpa a sessão OAuth |

Base de código: [cipher do Desktop](../../packages/services/src/credential/providers/credentialCipherProvider.ts#L6), [cipher do CLI](../../apps/zcode-cli/packages/adapters/src/auth/credential-cipher.ts#L4), [schema](../../packages/shared/src/validation.ts#L365), [backup](../../packages/shared/src/node/privateFilePersistence.ts#L109).

A chave padrão atual é derivada de informações do sistema, e não uma chave aleatória sob custódia do keychain do sistema operacional; o formato AES-GCM não significa que o Electron `safeStorage` é usado. Para mudar a origem da chave seria preciso desenhar separadamente a migração dos textos cifrados antigos; não basta substituir a função de derivação da chave.

A diferença entre os dois lados no tratamento de espaços em branco de `ZCODE_CREDENTIAL_SECRET` foi verificada com a implementação real de cipher e valores sintéticos: strings comuns se descriptografam entre si; a mesma string com espaços nas pontas e a mesma string só com espaços em branco fazem Desktop e CLI falharem na descriptografia mútua. Ao corrigir, é preciso considerar também os textos cifrados históricos escritos pela regra antiga, para não invalidar credenciais antigas só para unificar as novas escritas.

### Escrita atômica não é uma transação de login completa

Os dois armazenamentos reutilizam a mesma trava de arquivo entre processos e a mesma ferramenta de substituição atômica de arquivo:

```text
Requisições de escrita do mesmo processo são enfileiradas
    --> trava de diretório <credentials path>.lock
    --> ler o arquivo mais recente --> alterar a key necessária
    --> arquivo temporário 0600 no mesmo diretório --> substituição por rename --> liberar a trava
```

A trava tem dono, verificação de processo vivo, recuperação de órfãos e limite padrão de espera de 8 segundos; o rename reage a erros comuns de arquivo ocupado no Windows. O backup de corrupção também é criado com `0600`. A semântica de permissão por plataforma ainda depende do sistema de arquivos, e o modo POSIX não pode ser equiparado a uma ACL do Windows. [privateFilePersistence.ts](../../packages/shared/src/node/privateFilePersistence.ts#L46), [atomicFileLock.ts](../../packages/shared/src/node/atomicFileLock.ts#L177).

| Camada | Garantia existente | Fora do escopo da garantia |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `save/delete` do Desktop | Uma alteração de key cobre um read-modify-write completo, sem perder atualizações independentes de key de outros processos | Vários `save/delete` dentro de um login não são uma transação entre processos |
| `saveMany` do CLI / salvamento de login | Várias alterações de key na mesma chamada são publicadas de uma vez | A rede antes da chamada e a atualização de config depois da chamada não estão na transação de arquivo |
| Remoção condicional no CLI | `deleteIfValue`, `deleteManyIfValue` comparam o valor antigo dentro da trava e só então removem | `deleteIfValues` por key não equivale à remoção condicional de um conjunto inteiro de credenciais |
| Fila de mutações OAuth do Desktop | Serializa login concluído, logout etc. da mesma instância de OAuthService | Não é uma fila de nível de login compartilhada entre várias janelas, Hosts ou CLI |
| Leitura | A substituição atômica faz o leitor normalmente ver um arquivo completo de alguma versão; `loadMany` do CLI lê várias keys na mesma leitura | Várias `load` independentes ainda podem cruzar escritas de outros processos; não se pode assumir automaticamente que é um snapshot da mesma sessão |

Base de código: [armazenamento do Desktop](../../packages/services/src/credential/credentialService.ts#L90), [armazenamento do CLI](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L88), [fila OAuth](../../packages/services/src/oauth/oauthService.ts#L366). Esse é um fato sobre a fronteira de concorrência; por si só não afirma que existe vazamento de conta em produção.

O CLI também exporta `loadSharedZCodeCredentialSync`: qualquer erro durante a leitura síncrona devolve `undefined`, sem preservar a evidência de corrupção como o caminho de leitura assíncrono faz. Esta busca não encontrou chamadores em produção, portanto não se pode descrevê-lo como o comportamento de todas as leituras do CLI hoje. [entrada de compatibilidade síncrona](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L234).

### Remoção do arquivo inteiro e migração do diretório de dados

- **Clear All Data é a entrada de remoção de arquivo inteiro.** Depois de o usuário do Desktop confirmar a limpeza de todos os dados, `clearAllDataAndRelaunch` faz a remoção recursiva do `credentialsDir` informado; esse diretório vem do `getAppConfigDir()` atual, por padrão `~/.zcode/v2`, e também pode seguir um diretório de dados customizado. A operação remove junto as credenciais e configurações de OAuth do App, MCP, Bot, conexões remotas, relay etc. que estão nesse diretório, e não apenas os campos OAuth; em seguida limpa o armazenamento do navegador e reinicia. O comando também invoca a limpeza da partição WebView de compras. Isso difere da remoção direcionada de um logout normal do App e também não é a remoção de dados de um Server remoto. [implementação da limpeza](../../packages/desktop/src/main/desktopCommandHandlers.ts#L162), [origem do diretório](../../packages/desktop/src/main/desktopRuntimeEnv.ts#L81), [dispatch do comando](../../packages/desktop/src/main/desktopCommandHandlers.ts#L763).
- **Alterar o diretório de dados copia o arquivo de credenciais.** O serviço de configurações chama `copyDataDirectory` copiando o `.zcode/v2` antigo para a nova posição. O filtro exclui `setting.json` e seus arquivos temporários irmãos e links simbólicos, não exclui especificamente credentials.json e também não descriptografa e recriptografa os valores nele; esse helper faz cópia e não apaga o diretório original. Portanto, resolver a nova路径 com sucesso não significa que a cópia antiga foi destruída, e copiar entre usuários/sistemas diferentes ainda pode falhar ao descriptografar por causa do material de chave diferente. [chamador](../../packages/services/src/setting/settingService.ts#L452), [implementação da cópia](../../packages/services/src/paths.ts#L587).

### Limites de log e arquivamento

- O log de sucesso comum do middleware RPC registra apenas canal, comando e duração, sem parâmetros de requisição nem valores de retorno de credencial; logs de falha anexam o objeto de erro. [logging-middleware.ts](../../packages/rpc/src/logging-middleware.ts#L40).
- A exportação de logs do Desktop exclui por nome de arquivo `credentials.json` e `.credentials.json`; o arquivamento de fallback do feedback usa correspondência de caminho que inclui `credentials.json`. Os demais logs de negócio ainda devem ser verificados chamador por chamador; não se pode concluir a partir destes dois pontos que nenhum token entra em log. [exportação do Desktop](../../packages/desktop/src/main/exportLogs.ts#L716), [arquivamento do feedback](../../packages/services/src/feedback/compactLogArchive.ts#L15).

## Credenciais de login OAuth / das plataformas ZCode: fatos de código

Neste capítulo, "plataforma" designa o domínio de identidade Z.AI / BigModel, não macOS / Windows / Linux.

### A restrição de plataforma única confirmada e a implementação existente

Este levantamento adota a regra confirmada pelo usuário: **o login limpa todos os JWTs de plataformas antigas e, após o login concluído, apenas uma identidade de plataforma pode estar ativa.** O JWT da plataforma antiga não é mantido como uma conta coexistente. O usuário ainda não definiu se a limpeza deve ocorrer ao clicar em login ou no commit, após a troca ready/token; o tratamento da sessão antiga em caso de cancelamento ou falha também precisa ser definido junto com essa fronteira de commit, e não se pode interpretar "login limpa o antigo" como "clicar em login já desloga". O escopo de limpeza OAuth é definido separado do ciclo de vida das credenciais independentes de SSH, bot e pareamento de controle remoto.

O código existente já comenta `oauth:active_provider` como "fonte única da verdade do domínio de provider mutuamente exclusivo" e também limpa a plataforma oposta antes de persistir com sucesso; a limpeza acontece em `persistOAuthSession`, depois da troca de token concluída, enquanto o início do login apenas substitui o fluxo pendente, e há um rollback que restaura a sessão antiga quando a persistência é cancelada. Esses são fatos do momento atual; manter a sessão antiga na fase pendente não pode ser julgado diretamente como violação da regra do usuário. O caminho de sucesso normal limpa os campos do namespace da plataforma oposta, mas não limpa o legado `auth_token/refresh_token`, então não se pode afirmar com base nisso que "todas as credenciais de plataformas antigas foram removidas".

Base: [oauthCredentialRepo.ts:172](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L172); [oauthService.ts:374](../../packages/services/src/oauth/oauthService.ts#L374), `:554`, `:791`.

```text
Relação de identidade alvo
  Não logado
    -> inicia login da plataforma P
    -> limpa todos os JWTs de login das plataformas antigas na fronteira explícita de commit do login
       (no clique ou no commit ready: ainda não decidido)
    -> login de P concluído: salva apenas o token de negócio de P + o ZCode JWT atual
    -> oauth:active_provider = P

  A qualquer momento: identidade Z.AI XOR identidade BigModel
  Proibido: active provider de P + JWT de negócio de outra plataforma + ZCode JWT da geração anterior

Caminho de sucesso atual do código
  startOAuth / startOAuthWithPolling
    -> cria ou substitui apenas o fluxo pendente; a sessão persistida antiga ainda pode existir
    -> obtém o novo token por deep link ou polling
    -> persistOAuthSession
       -> armazena temporariamente token / profile / active provider dos dois domínios antigos (para rollback)
       -> clearProvider (plataforma oposta): token de negócio, refresh token, user_info, JWT compartilhado
       -> saveTokenSet (plataforma atual): token de negócio, refresh token opcional, novo JWT compartilhado
       -> saveUserProfile (plataforma atual)
       -> saveActiveProvider (plataforma atual)
```

### Campos em credentials.json

Os valores dos campos são salvos como strings através do `ICredentialService`; dados de usuário e atribuição são serializados primeiro em JSON. A criptografia, chave, permissões, trava e caminho do arquivo de credenciais são descritos na seção de armazenamento. O tipo de provider OAuth permite strings arbitrárias, mas os domínios embutidos atuais são `zai` e `bigmodel`; o conjunto conhecido de limpeza por corrupção sempre inclui ambos e pode incluir outros IDs de adapter registrados.

Base: [oauth.ts:56](../../packages/shared/src/oauth.ts#L56), `:132`; [oauthCredentialRepo.ts:13](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L13), `:36`.

| key | Semântica real / origem do dado | Escrita normal | Leitura / limpeza normal |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oauth:active_provider` | Identidade de plataforma atual do App; valores embutidos `zai` / `bigmodel`; não é token | Escrita na última etapa do login; gerenciada por `saveActiveProvider` | Decide a restauração de cache e qual plataforma é usada por modelo/MCP oficial/plano ocioso; removido por logout de active, logout total e recuperação de corrupção |
| `zcodejwttoken` | `data.token` do backend ZCode; JWT compartilhado da identidade de login da plataforma atual, com key não dividida por plataforma | Salvo pelo adapter ZAI / BigModel junto de `OAuthTokenSet.zcodeJwtToken` após a troca | ZCode business, Start Plan, MCP oficial, feedback etc.; o `clearProvider` de qualquer plataforma embutida o remove |
| `oauth:zai:access_token` | **Token de negócio Z.AI / JWT de login MaaS**: resultado da conversão do access token OAuth original do Z.AI pela interface de login de negócio | O adapter ZAI do Desktop converte primeiro nas duas vias (deep link e polling) e só então salva | `/api/biz/*`, `/api/pay/*`, projetos de plano e obtenção de API key de negócio, identidade de plano no MCP oficial, reset; removido no logout ou troca |
| `oauth:bigmodel:access_token` | **Token de negócio BigModel / JWT de login MaaS**: access token de negócio BigModel da resposta do backend | Salvo após normalização pelo adapter BigModel / polling do Desktop | BigModel customer, planos, obtenção de API key de projeto, identidade de plano no MCP oficial, reset; removido no logout ou troca |
| `oauth:bigmodel:refresh_token` | Refresh token BigModel opcional, vindo de `data.bigmodel.refresh_token` / `refreshToken` | Salvo no deep link / polling se houver valor; removido se não houver | A interface genérica de refresh o lê, mas o adapter BigModel embutido hoje não implementa refresh; removido na limpeza da plataforma |
| `oauth:zai:refresh_token` | Campo homônimo suportado pelo Repo genérico; **o adapter ZAI atual não produz refresh token** | O `saveTokenSet` genérico pode receber; um login ZAI normal remove o valor antigo por falta de refreshToken | Sem uso embutido de renovação hoje; removido na limpeza da plataforma |
| `oauth:zai:user_info` | JSON de dados do usuário; quando há rawProfile, salvo como `data.user` do backend sem alteração | Escrito no login; na leitura converte `user_id/name/email/avatar` em dados de exibição | Cache de login, ID de conta / exibição; não é token; removido na limpeza da plataforma |
| `oauth:bigmodel:user_info` | JSON normalizado de dados do usuário com campos de exibição; ao salvar no login recebe a marca do schema de profile atual | Login / migração de background de profile legado | Exibição de cache de login; não é token; removido na limpeza da plataforma |
| `oauth:login_attribution` | JSON: `channel_id`, `utm_source`, `utm_campaign`; não é token | Escrito pelo callback de atribuição / callback de autorização com atribuição; salva apenas strings não vazias | Na leitura aceita apenas esses três campos, com compatibilidade para o antigo `{params, expiresAt}`; hoje sem TTL, o logout não limpa; se não conseguir ser lido ou os campos válidos forem vazios, é removido |
| `auth_token` | Key antiga de access token do BigModel | O login OAuth normal atual não escreve; apenas leitura de compatibilidade histórica é mantida | Lido por `BigModelProviderAdapter.loadLegacyTokenSet` e `useAuthToken.getToken`; `restoreSession` preenche as keys de namespace; o logout OAuth atual / limpeza por corrupção não o remove, e `useAuthToken.clearToken` tem uma remoção especial para BigModel |
| `refresh_token` | Key antiga de refresh token do BigModel | O login OAuth normal atual não escreve | Compatibilidade de leitura pelo legacy loader do BigModel; nem a limpeza OAuth normal nem `useAuthToken.clearToken` o removem; não é alias de escrita dos campos de namespace atuais |

Base: [oauthCredentialRepo.ts:151](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L151), `:226`, `:284`, `:292`, `:321`, `:398`, `:415`; [bigmodelProviderAdapter.ts:196](../../packages/services/src/oauth/providers/bigmodelProviderAdapter.ts#L196), `:274`; [zaiProviderAdapter.ts:364](../../packages/services/src/oauth/providers/zaiProviderAdapter.ts#L364); [oauthService.ts:476](../../packages/services/src/oauth/oauthService.ts#L476), `:753`; [useCredentials.ts:28](../../packages/ui/src/hooks/useCredentials.ts#L28). A entrada do tratamento de schema de profile no salvamento de login está em [oauthService.ts:420](../../packages/services/src/oauth/oauthService.ts#L420).

O tipo `OAuthTokenSet` tem `expiresAt`, e o adapter ZAI também o calcula a partir de `expires_in` do backend; **o OAuthCredentialRepo não salva expiresAt e não o restaura no loadTokenSet**. Não acrescente `oauth:*:expires_at` à lista de campos só por causa do tipo. Base: [oauth.ts:132](../../packages/shared/src/oauth.ts#L132); [zaiProviderAdapter.ts:389](../../packages/services/src/oauth/providers/zaiProviderAdapter.ts#L389); [oauthCredentialRepo.ts:292](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L292), `:321`.

Os valores abaixo não vão para credentials.json em um login normal do Desktop (a divergência do CLI, que hoje persiste o token OAuth ZAI original, está na seção do CLI): a autorização única `code/authCode`, `state`, o `flowId/pollToken/expiresAt` do polling e o access token OAuth ZAI original antes da conversão. Os dados pendentes ficam apenas em `OAuthService.pendingState`; o cache do resolver de token de negócio existe apenas na memória da instância do adapter. Base: [oauthService.ts:43](../../packages/services/src/oauth/oauthService.ts#L43), `:568`, `:638`; [zaiBusinessTokenResolver.ts:17](../../packages/services/src/providers/zaiBusinessTokenResolver.ts#L17), `:35`.

### Os três tipos de credencial não podem ser misturados

1. **ZCode JWT**: `zcodejwttoken`, identifica a identidade de login atual do ZCode.
2. **Token de negócio da plataforma / JWT MaaS**: `oauth:<platform>:access_token`, identifica a identidade de login de negócio da plataforma correspondente e é usado nas interfaces de negócio e na validação de identidade de plano.
3. **API key de modelo / Coding Plan / Team Plan**: usada nas requisições de modelo e de monitor; pode ser obtida chamando a interface de negócio com o token de negócio, mas não é o próprio token de negócio.

O token de negócio do ZAI pode ser ele mesmo um JWT, e o código explicitamente permite que ele seja igual em string ao ZCode JWT; o julgamento deve se basear na origem, no campo e no consumidor, e não apenas na aparência do token ou em igualdade. O BigModel, por sua vez, tem uma defesa específica contra uma escrita errada histórica: se `oauth:bigmodel:access_token === zcodejwttoken`, a entrada de planos recusa esse estado contaminado antigo.

Base: [modelProviderService.ts:968](../../packages/services/src/model-provider/modelProviderService.ts#L968); [bigmodelCodingPlanSubscriptionProvider.ts:813](../../packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts#L813); [official-mcp-auth.ts:15](../../packages/shared/src/official-mcp-auth.ts#L15).

A leitura/serialização da configuração de modelo do App lê `provider[id].options.apiKey` do `config.json`; só a atualização explícita da key do Coding Plan obtém a API key real pela interface de negócio, e a sincronização de presets comuns não trata o ZCode JWT como API key do Coding Plan. `model-provider:<id>:api-key` hoje é escrito no secrets Map em memória do catálogo de modelos do workspace do CLI, não é uma chave persistida em credentials.json; veja a seção do CLI.

Base: [modelProviderServiceStorage.ts:93](../../packages/services/src/model-provider/modelProviderServiceStorage.ts#L93), `:942`, `:1137`; [oauthPresetProviderRepo.ts:535](../../packages/services/src/model-provider/repo/oauthPresetProviderRepo.ts#L535).

### Origem e cadeia de conversão dos tokens

```text
Desktop ZAI deep link
  code + state da autorização do navegador
    -> POST ZCode /api/v1/oauth/token
       body = { provider: "zai", code, redirect_uri, state }
       data.token ---------------------------> zcodejwttoken
       data.zai.access_token (token OAuth original)
          -> POST ZAI /api/auth/z/login
             body = { token: token OAuth original }
             data.access_token / accessToken -> oauth:zai:access_token (token de negócio)
       data.user ----------------------------> oauth:zai:user_info

Desktop BigModel deep link
  authCode/code + state do navegador
    -> POST ZCode /api/v1/oauth/token
       body = { provider: "bigmodel", code, redirect_uri, state }
       data.token ---------------------------> zcodejwttoken
       data.bigmodel.access_token/accessToken -> oauth:bigmodel:access_token
       data.bigmodel.refresh_token/refreshToken -> refresh_token opcional
    -> BigModel getCustomerInfo ----------------> user_info

Desktop polling (ambos os plataformas compartilham a lógica de persistência final)
  pollToken aleatório do cliente
    -> POST /api/v1/oauth/cli/init, Authorization: Bearer pollToken
    -> GET /api/v1/oauth/cli/poll/<flowId>, mesmo pollToken
    -> ready.token + ready.<platform>.access_token + ready.user
       ZAI: ainda passa primeiro pela conversão de token de negócio
       BigModel: lê o refresh_token opcional e usa direto o access token de negócio
    -> runPendingSessionCompletion -> persistOAuthSession
```

A resolução do access token BigModel no deep link mantém compatibilidade com o formato de resposta histórico: lê, em ordem, `data.bigmodel.access_token`, `data.bigmodel.accessToken`, `data.access_token`, `data.accessToken`; o ramo de polling aceita apenas as duas keys dentro de `ready.bigmodel`. O code único do BigModel é entregue apenas à rota de token do ZCode, sem passar antes por `tokenByAuthCode`, e também não é trocado por um JWT usando access token na etapa de consulta de saldo do Start Plan.

Base: [zaiProviderAdapter.ts:318](../../packages/services/src/oauth/providers/zaiProviderAdapter.ts#L318), `:364`; [zaiBusinessTokenResolver.ts:70](../../packages/services/src/providers/zaiBusinessTokenResolver.ts#L70); [bigmodelProviderAdapter.ts:130](../../packages/services/src/oauth/providers/bigmodelProviderAdapter.ts#L130), `:301`; [oauthService.ts:554](../../packages/services/src/oauth/oauthService.ts#L554), `:683`, `:729`; [bigmodelStartPlanZcodeJwt.ts:31](../../packages/services/src/model-provider/bigmodelStartPlanZcodeJwt.ts#L31).

Os endpoints são construídos pelo runtime config conforme o ambiente; os exemplos de produção são `zcode.z.ai`, `chat.z.ai`, `api.z.ai`, `bigmodel.cn`, e o ambiente de teste e as sobreposições explícitas de env mudam o domínio. Não trate os domínios de exemplo como os únicos ambientes de implantação permitidos. Base: [zaiProviderConfig.ts:30](../../packages/services/src/oauth/providers/zaiProviderConfig.ts#L30); [bigmodelProviderConfig.ts:25](../../packages/services/src/oauth/providers/bigmodelProviderConfig.ts#L25).

### Principais consumidores e cabeçalhos reais de autenticação

| Cenário de consumo | Credencial usada | Cabeçalho real / fronteira | Base de código |
| ----------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interfaces de plano, projetos e pagamento do ZAI | token de negócio `oauth:zai:access_token` | `Authorization: <token>`, sem adicionar Bearer | [bigmodelCodingPlanSubscriptionProvider.ts:963](../../packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts#L963), `:1206` |
| Interfaces de negócio do BigModel: customer, planos, projetos etc. | `oauth:bigmodel:access_token` | `Authorization: <token>`; detecta a escrita errada antiga de ZCode JWT | [bigmodelProviderAdapter.ts:245](../../packages/services/src/oauth/providers/bigmodelProviderAdapter.ts#L245); [bigmodelCodingPlanSubscriptionProvider.ts:813](../../packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts#L813), `:1197` |
| Requisição de compensação de userinfo do adapter ZAI | `OAuthTokenSet.accessToken`; no Desktop já é o token de negócio convertido | `Authorization: Bearer <token>`, e não o cabeçalho cru das interfaces de negócio acima; quando já existe user do backend, prefere reutilizar os dados | [zaiProviderAdapter.ts:398](../../packages/services/src/oauth/providers/zaiProviderAdapter.ts#L398) |
| billing preview / claim / saldo do Start Plan no ZCode | `zcodejwttoken` | `Authorization: Bearer <JWT>` | [bigmodelCodingPlanSubscriptionProvider.ts:258](../../packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts#L258), `:322`; [bigmodelUsageQuotaProvider.ts:491](../../packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts#L491) |
| Configuração de execução de modelo do Start Plan | projeção em tempo de execução do ZCode JWT | O JWT do credentialService atual sobrescreve o cabeçalho antigo de provider/runtime; `Authorization: Bearer <JWT>` | [modelProviderService.ts:707](../../packages/services/src/model-provider/modelProviderService.ts#L707), `:1163`, `:1215` |
| reset / histórico de reset do Coding Plan | ZCode JWT + **JWT de negócio da família escolhida** | `Authorization: Bearer <ZCode JWT>`; `X-Bigmodel-Authorization: <JWT de negócio>` (token cru), podendo载 organization/project/target type | [bigmodelUsageQuotaProvider.ts:673](../../packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts#L673), `:1045` |
| Credenciais e cota do MCP oficial do Server | ZCode JWT + JWT de negócio da família Coding Plan escolhida | `Authorization: Bearer <ZCode JWT>`; `X-Bigmodel-Authorization: Bearer <JWT de negócio>`; aqui o Bearer é realmente adicionado, ao contrário do reset | [officialMcpCredentials.ts:216](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L216), `:330`, `:382`; [official-mcp-auth.ts:22](../../packages/shared/src/official-mcp-auth.ts#L22) |
| Uso do Coding Plan monitor / uso do Team Plan | API key real do Coding Plan / do projeto | Usa a API key do provider escolhido ou do projeto de equipe; não pode recorrer ao OAuth, à API key comum, a outra plataforma ou a variáveis de ambiente | [bigmodelUsageQuotaProvider.ts:708](../../packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts#L708), `:834`, `:853` |
| Obtenção de API key de projeto do Team Plan | token de negócio da família correspondente | Primeiro usa a identidade de login de negócio para obter a API key da organização/projeto específico; só esta é usada depois para modelos de equipe/monitor | [bigmodelUsageQuotaProvider.ts:869](../../packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts#L869) |
| Execução do plano ocioso | ZCode JWT + API key do Coding Plan | `Authorization: Bearer <JWT>`; `X-Coding-Plan-Api-Key: <key de negócio do modelo>`; além disso traz ticket e cabeçalhos de identidade de plano. Aqui ainda é o canal de API key, portanto as regras de JWT MaaS do MCP oficial não se aplicam | [offPeakRuntimeModel.ts:251](../../packages/services/src/session/offPeakRuntimeModel.ts#L251), `:403` |
| Interface de feedback | `zcodejwttoken`, adicionado apenas quando existe | `Authorization: Bearer <JWT>`; além disso `X-Device-Mid` | [feedbackService.ts:76](../../packages/services/src/feedback/feedbackService.ts#L76) |
| Upload de snapshot do Repo | tokenSet active atual; prefere o ZCode JWT, com fallback para o accessToken da plataforma quando o código atual está ausente |，最终 `Authorization: Bearer <token>`; é um fallback existente e se é permitido precisa ser julgado pelo contrato do backend, e não classificado como bug só porque o tipo de token difere | [node.ts:1288](../../packages/services/src/node.ts#L1288); [repoSnapshotUploadClient.ts:117](../../packages/services/src/repo-snapshot/repoSnapshotUploadClient.ts#L117) |

O MCP oficial valida na resolução que `settings.providerFamilyDomain === oauth:active_provider` e, ao fim da resolução assíncrona, confere novamente o snapshot de identidade e o JWT de negócio; o plano ocioso também confere a família escolhida com o active provider. Ambos evitam misturar credenciais de gerações ou plataformas diferentes. Algumas entradas de consumo históricas ainda permitem o `provider.apiKey` em cache como fallback de JWT do Start Plan, ou ler o JWT compartilhado quando não há active provider; não se pode concluir daí que "qualquer JWT no arquivo atual é válido".

Base: [officialMcpCredentials.ts:222](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L222), `:341`; [offPeakRuntimeModel.ts:251](../../packages/services/src/session/offPeakRuntimeModel.ts#L251); [bigmodelStartPlanZcodeJwt.ts:18](../../packages/services/src/model-provider/bigmodelStartPlanZcodeJwt.ts#L18); [oauthPresetProviderRepo.ts:587](../../packages/services/src/model-provider/repo/oauthPresetProviderRepo.ts#L587); [bigmodelUsageQuotaProvider.ts:491](../../packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts#L491).

### Entradas de leitura no Renderer, autenticação de compra e cópia no WebView

**`useAuthToken` é o hook de access token, não o hook do ZCode JWT.** `getToken()` consulta primeiro o active provider e depois lê `oauth:<active>:access_token`; somente quando o active é BigModel e o token do namespace está ausente é que recorre ao legado `auth_token`. `setToken()` escreve apenas o access token da plataforma ativa; `clearToken()` apaga apenas esse access token, removendo também `auth_token` quando é BigModel, mas não apaga `zcodejwttoken`, refresh token, user_info nem o active provider. Portanto `clearToken` não é logout OAuth e não pode servir de implementação para "limpar todos os JWTs antigos". É um hook exportado publicamente e a busca no repositório atual não encontrou pontos de chamada; esse fato diz que existe uma API de leitura/escrita, e não afirma que a interface atual esteja chamando-a.

Base: [useCredentials.ts:28](../../packages/ui/src/hooks/useCredentials.ts#L28); [index.ts:43](../../packages/ui/src/hooks/index.ts#L43); [index.ts:70](../../packages/ui/src/index.ts#L70).

**O `authenticated` da página de compra é um julgamento de disponibilidade local.** `readCodingPlanPurchaseTokenState` lê em paralelo o active provider e os dois access tokens de negócio e marca como authenticated apenas quando o "active coincide exatamente com a família e o token de negócio não está vazio", mapeando isso para as entradas de Coding Plan e Start Plan daquela família. Não lê o ZCode JWT, não verifica `exp` e não faz validação remota. `ModelProviderSection.refreshCodingPlanPurchaseTokenState` tem o mesmo julgamento local. Esse booleano não pode ser interpretado como já ter validado que o token da plataforma, o JWT e os direitos do plano estão válidos.

Base: [codingPlanPurchaseAuth.ts:25](../../packages/ui/src/settings/model-provider-section/codingPlanPurchaseAuth.ts#L25); [ModelProviderSection.tsx:648](../../packages/ui/src/settings/ModelProviderSection.tsx#L648).

**O WebView de compra copia as credenciais do Host para o localStorage de uma partição persistente separada.** `getCodingPlanCredentialKeys` retorna para ZAI `oauth:zai:access_token` e `zcodejwttoken`, e para BigModel apenas `oauth:bigmodel:access_token`. Portanto a página de compra do BigModel não obtém o ZCode JWT compartilhado por essa entrada de injeção. O Dialog lê esses valores do credentialService, gera um script e injeta na página de compra confiável atual; ele escolhe o campo pelo provider alvo de compra e a função de injeção em si não lê `oauth:active_provider`, de modo que a correção da identidade depende da seleção externa e da limpeza das credenciais antigas.

```text
Host credentials.json / CredentialService
  -> Renderer CodingPlanEmbeddedWebviewDialog.injectAuth
     -> verifica se a URL atual do webview é uma página coding-plan confiável
     -> lê as credenciais do provider alvo
     -> primeiro limpa as três chaves de credencial do localStorage do webview
     -> escreve o valor do provider atual e despacha zcode-coding-plan-auth-ready
        ZAI:      zai access token + ZCode JWT; apaga o token do BigModel
        BigModel: BigModel access token; apaga o token ZAI + o ZCode JWT
     -> o site oficial conclui a compra usando as credenciais da partição atual

Partição persistente: persist:zcode-coding-plan (independente do renderer do App / do armazenamento do navegador Web)
```

A verificação de confiança é feita sobre a **URL de navegação atual**, não apenas confiando no src inicial; sair da página confiável executa apenas a limpeza daquele origin e não injeta credenciais do App. O retorno do PayPal pelo callback confiável `/coding-plan/payment/callback` continua permitindo a injeção pela regra de returnTo da mesma origem. A limpeza pré-injeção e a injeção executam sequencialmente no mesmo `executeJavaScript`. Ao fechar, tenta-se limpar as três chaves de token e o contexto de relato, mas a falha é permitida quando o WebView já foi destruído; o logout ativo do Root e o unlink de provider na página de configurações enviam um `ClearCodingPlanWebviewStorage` à parte, e o Main limpa a partição persistente inteira; o Clear All Data também limpa explicitamente essa partição.

Base: [CodingPlanEmbeddedWebviewDialog.tsx:149](../../packages/ui/src/settings/CodingPlanEmbeddedWebviewDialog.tsx#L149), `:386`, `:540`; [codingPlanEmbeddedWebview.ts:60](../../packages/ui/src/settings/model-provider-section/codingPlanEmbeddedWebview.ts#L60), `:124`, `:175`, `:257`, `:310`; [useRootWorkspaceActions.ts:298](../../packages/ui/src/root/useRootWorkspaceActions.ts#L298), `:315`; [ModelProviderSection.tsx:1087](../../packages/ui/src/settings/ModelProviderSection.tsx#L1087); [desktopCommandHandlers.ts:213](../../packages/desktop/src/main/desktopCommandHandlers.ts#L213), `:763`.

A mensagem de compra concluída serve para fechar a página de compra e atualizar a key/direitos/projetos de equipe do provider atual, e não grava de volta em credentials.json o novo token do site de compra. Base: [CodingPlanEmbeddedWebviewDialog.tsx:340](../../packages/ui/src/settings/CodingPlanEmbeddedWebviewDialog.tsx#L340); [CodingPlanUpgradeDialog.tsx:52](../../packages/ui/src/settings/CodingPlanUpgradeDialog.tsx#L52), `:66`, `:108`.

**O limite da limpeza de campos legados precisa ser listado à parte.** A troca de login normal atual, o `clearProvider`, o logout OAuth e a recuperação de corrupção não removem o `auth_token/refresh_token` antigo em disco; apenas a lógica especial de `useAuthToken.clearToken` para BigModel remove `auth_token`, e ainda assim não remove o `refresh_token` antigo. A limpeza das três chaves do WebView também não é a limpeza do legado em disco. Quando o usuário pedir "limpar todos os JWTs antigos", é preciso definir a estratégia de limpeza desses campos de compatibilidade histórica; não se pode afirmar que o legado foi totalmente limpo só porque a troca de namespace está correta.

Base: [oauthCredentialRepo.ts:415](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L415), `:432`; [bigmodelProviderAdapter.ts:274](../../packages/services/src/oauth/providers/bigmodelProviderAdapter.ts#L274); [useCredentials.ts:63](../../packages/ui/src/hooks/useCredentials.ts#L63); [codingPlanEmbeddedWebview.ts:257](../../packages/ui/src/settings/model-provider-section/codingPlanEmbeddedWebview.ts#L257).

### Validade, refresh, 401 e recuperação de corrupção

**Validade.** O `resolveJwtExpiration` compartilhado apenas decodifica o `exp` do JWT, sem validar assinatura; por padrão considera expirado 30 segundos antes. A ausência de `exp`, formato anormal etc. retornam `unknown` e deixam a decisão para o servidor. O cached restore do Desktop lê o active provider, o user_info e o JWT compartilhado; explicitamente expirado, ele re-compara generation/provider/profile/JWT dentro da fila de mutações, limpa o login atual e o provider derivado e retorna `reauthentication-required: jwt-expired`. ZAI sem JWT devolve signed-out; BigModel hoje não impõe o mesmo portão de JWT ausente e ainda pode restaurar authenticated a partir do user_info.

Base: [oauth.ts:164](../../packages/shared/src/oauth.ts#L164); [oauthService.ts:177](../../packages/services/src/oauth/oauthService.ts#L177), `:253`, `:266`.

**Refresh.** `OAuthService.refreshToken` existe apenas como ponto de extensão para adapters genéricos: exige que o adapter tenha refreshToken, que o alvo seja o active provider atual e que já exista um refresh token, então troca e salva. Os adapters ZAI / BigModel atuais não implementam esse método, portanto salvar o refresh token do BigModel não equivale a implementar renovação automática e também não garante que o JWT de negócio da plataforma ou o ZCode JWT serão renovados. O deslocamento de 5 minutos do `ZaiBusinessTokenResolver` controla apenas o cache em processo da conversão do mesmo token OAuth original em token de negócio; não é persistência nem um renovador de login em segundo plano.

Base: [oauthService.ts:913](../../packages/services/src/oauth/oauthService.ts#L913); [providerAdapter.ts:31](../../packages/services/src/oauth/providers/providerAdapter.ts#L31); [zaiBusinessTokenResolver.ts:4](../../packages/services/src/providers/zaiBusinessTokenResolver.ts#L4), `:44`, `:99`.

**401.** O client Node da base auditada identifica invalidez pelo fato de o `Authorization` de saída ser exatamente igual ao `Bearer zcodejwttoken` **local e atual naquele momento**. A correção mínima de 2026-09-08 somou a isso o `access_token` de negócio (token cru ou Bearer) do userinfo/customerInfo da plataforma ativa atual, limitado ao origin/path do ambiente atual; pagamento, gestão de API key e outros caminhos de negócio não entram no novo julgamento. Depois da correspondência, o Host ainda deduplica e executa `oauthService.logout()`, limpa o provider derivado e transmite `auth:zcode-jwt-invalid`. Esse mecanismo não renova token, não trata erros de negócio em HTTP 200 e não sobrescreve automaticamente o WebView nem o transporte do Agent. O escopo detalhado está na [spec de logout automático por 401](../oauth/jwt-401-auto-logout.md); a implementação está em [oauthUnauthorizedRequest.ts](../../packages/services/src/oauth/oauthUnauthorizedRequest.ts).

`restoreSession` é outro caminho ativo de validação pela rede: chama o userinfo do provider; quando o texto do erro casa com 401/403/unauthorized/forbidden faz logout, e os demais erros continuam sendo lançados.

Base: [nodeApiClient.ts:134](../../packages/services/src/providers/api/nodeApiClient.ts#L134); [node.ts:1226](../../packages/services/src/node.ts#L1226), `:1872`; [oauthService.ts:518](../../packages/services/src/oauth/oauthService.ts#L518), `:1061`.

**Corrupção na descriptografia.** O OAuthCredentialRepo captura um `CredentialDecryptError` estável ao ler o active provider, o tokenSet e o user_info: limpa o access/refresh/user_info das duas plataformas embutidas e das demais registradas, o JWT compartilhado e o active provider, e depois notifica a limpeza das chaves de modelo derivadas; exceções na limpeza derivada são apenas registradas como warn. Esse caminho não remove chaves não OAuth como SSH e bot, nem o `auth_token/refresh_token` antigo nem a chave de atribuição. A leitura com wrapper OAuth-aware do model-provider também reutiliza este comportamento do Repo.

A falha de descriptografia da chave de atribuição apenas devolve null e não dispara logout de toda a conta. O cached restore atual lê `zcodejwttoken` diretamente, contornando a restauração unificada do Repo, e a corrupção isolada na descriptografia do JWT ainda lança erro; veja a tabela de divergências.

Base: [oauthCredentialRepo.ts:159](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L159), `:241`, `:292`, `:346`, `:432`; [modelProviderService.ts:136](../../packages/services/src/model-provider/modelProviderService.ts#L136); [oauthService.ts:206](../../packages/services/src/oauth/oauthService.ts#L206).

### Logout, cancelamento e fronteiras de concorrência

| Operação | Comportamento atual do código | Significado para a restrição de plataforma única |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Iniciar login comum | Dentro da fila de mutações limpa o pendente e gera novo state; não limpa o login em disco | Hoje o commit concluído é o momento de limpeza; o usuário ainda não decidiu se antecipar para o momento do início |
| Iniciar login por polling | Incrementa a generation do fluxo e substitui o pendente; valida a generation quando o init assíncrono retorna | Um init antigo não sobrescreve o novo fluxo; não é responsável por limpar o login antigo em disco |
| deep link / polling concluídos ao mesmo tempo | O mesmo pendente compartilha a completionPromise; entram em fila na fila de mutações; validam a validade do pendente antes e depois da troca e antes de cada gravação em disco | Evita conclusão duplicada e gravação tardia de login; a IO de múltiplas keys por si só não é uma transação OAuth |
| Login bem-sucedido | Limpa o namespace da plataforma oposta e o JWT compartilhado, e então salva o tokenSet/profile/active provider atuais | Há intenção de plataforma única na conclusão normal; o processo atual ainda tem estados intermediários com várias IO independentes |
| `logout()` | Consulta o active provider atual, limpa o access/refresh/user_info/JWT da plataforma atual e então remove o active; depois cancela o pendente daquela plataforma e limpa as chaves derivadas | Não é uma limpeza total que varre todos os campos legados de plataforma; sem active, não remove JWTs órfãos |
| `logout(provider)` | Só limpa o login quando o argumento é igual ao active provider e notifica a limpeza derivada; além disso cancela o pendente correspondente | O unlink de uma plataforma que não é a atual não deve apagar por engano o JWT compartilhado atual; também não varre ativamente campos legados de outras plataformas |
| `logoutAll()` | Limpa as plataformas de todos os adapters registrados, remove o active, cancela o pendente e limpa as chaves derivadas | O escopo é determinado pelos adapters registrados; difere da limpeza por corrupção do Repo, que sempre inclui os dois domínios embutidos |
| `cancelPending()` / timeout | Invalida o pendente ou a generation do fluxo; o cancelamento comum não limpa diretamente a sessão antiga em disco | Não pode ser entendido como logout; um cancelamento em disco entra no rollback atual, e a semântica de cancelamento deve ser explicitada junto com a fronteira final de commit do login |

Base: [oauthService.ts:367](../../packages/services/src/oauth/oauthService.ts#L367), `:374`, `:431`, `:554`, `:630`, `:791`, `:948`, `:980`, `:990`; [oauthCredentialRepo.ts:284](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L284), `:424`.

O handler padrão de `onProviderLogout` também limpa as API keys de Coding Plan e Start Plan da família correspondente, evitando que, Having removido só os campos OAuth, a configuração de execução ainda segure credenciais derivadas. Ele não trata automaticamente uma API key de modelo comum configurada manualmente como key de sessão OAuth. Base: [oauthProviderLogout.ts:14](../../packages/services/src/oauth/oauthProviderLogout.ts#L14).

### A fronteira independente dos campos homônimos no navegador Web

O `BrowserOAuthCredentialRepo` da Web coloca os campos ZAI homônimos em **localStorage**, e não no credentials.json em disco; os registros de login em andamento `oauth_pending_logins` ficam no mesmo localStorage, diferenciados por nonce. A implementação de navegador atual só suporta active provider ZAI. A troca de token do navegador salva diretamente o `data.zai.access_token` do backend, sem passar pela conversão de negócio do `ZaiBusinessTokenResolver` do Desktop, portanto a semântica de origem do `oauth:zai:access_token` homônimo nas duas armazenamentos não pode ser tratada como a mesma.

O cached restore do navegador exige active = zai e a presença de JWT/access/user_info; qualquer estado incompleto ou JSON de usuário inválido dispara clearAll; JWT explicitamente expirado retorna reauthentication-required. O logout do navegador apenas limpa o próprio localStorage; não é o logout OAuth do credentialService do Desktop. Os limites de attachment de controle remoto / autoridade do Host e de encaminhamento de credenciais são descritos na seção de controle remoto.

Base: [browserOAuthCredentialRepo.ts:11](../../packages/web/src/auth/browserOAuthCredentialRepo.ts#L11), `:58`, `:94`, `:137`; [zaiWebOAuthProvider.ts:102](../../packages/web/src/auth/zaiWebOAuthProvider.ts#L102), `:180`; [webAuthService.ts:128](../../packages/web/src/auth/webAuthService.ts#L128), `:160`.

### Divergências atuais e itens a verificar depois

A seguir estão incluídos problemas de implementação confirmados, resíduos de compatibilidade atuais e limites que precisam ser esclarecidos; o momento de limpeza ainda não decidido não é listado como bug estabelecido. Este capítulo não modificou a implementação.

| Item | Evidência / resultado atual | Classificação e limite |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Momento de commit da limpeza no login e semântica de cancelamento a esclarecer | `oauthService.ts:554`, `:791` só trocam o fluxo; `:390` no rollback grava de volta a sessão antiga dos dois domínios | **Limite a esclarecer**. O que o usuário confirmou é o resultado da limpeza e a identidade de plataforma única, não a limpeza imediata no clique; não se pode projetar o JWT de outra plataforma como login normal coexistente nem mudar o comportamento de cancelamento sem confirmação |
| Campos de sessão inconsistentes no rollback após novo login na mesma plataforma | `oauthService.ts:391` restaura o JWT, `:397` faz clear da plataforma oposta; o Repo em `:420` remove o JWT compartilhado | **Evidência de runtime obtida com credenciais falsas em memória**: tanto ZAI quanto BigModel restauram o access/user/active antigos e perdem o JWT. Isso mostra que o rollback atual gera uma sessão incompleta; a correção concreta deve ser coerente com a semântica final de commit/cancelamento e não pode levar a JWTs de duas plataformas coexistindo |
| Corrupção isolada na descriptografia do ZCode JWT contorna a restauração unificada | `oauthService.ts:206`, `:275` chamam o credentialService diretamente; a limpeza unificada está em `oauthCredentialRepo.ts:432` | **Evidência de runtime obtida com erro de descriptografia controlado**: o cached restore lança diretamente `ZCODE_CREDENTIAL_DECRYPT_FAILED` e o active não é limpo; deve entrar no cenário de corrupção do campo JWT isolado |
| BigModel sem JWT ainda consegue restaurar authenticated | A checagem de JWT ausente no cached restore `oauthService.ts:253` vale só para ZAI; `:262` retorna sucesso unificado | **As condições de restauração das duas plataformas hoje são inconsistentes**. A nova regra de sessão completa de plataforma única precisa eliminar explicitamente os estados incompletos |
| `auth_token/refresh_token` antigos do BigModel podem continuar residindo após a troca normal de plataforma | `oauthCredentialRepo.ts:415` não remove o legado; `bigmodelProviderAdapter.ts:274` ainda lê; `useCredentials.ts:63` só remove `auth_token` de forma especial | **Resíduo de compatibilidade confirmado estaticamente, com limite de limpeza a definir**. Uma troca composta bem-sucedida só prova a limpeza das keys de namespace, não a limpeza total do legado; quando o usuário exigir limpar todos os JWTs antigos é preciso verificar estes dois itens separadamente, sem ampliar para apagar todo o credentials.json |
| Campos OAuth órfãos e conjunto de limpeza do adapter inconsistentes | O logout limpa só o active; a limpeza total usa a lista de adapters; a limpeza por corrupção sempre inclui as duas plataformas embutidas | **É preciso esclarecer o conjunto de limpeza**. Campos remanescentes quando o active está ausente ou o adapter está desabilitado/não registrado precisam de cobertura independente |
| Refresh genérico sem proteção de generation / fila de mutações | `oauthService.ts:936` troca de forma assíncrona e `:945` salva conforme o active mais recente | **Risco da interface de extensão**. Os adapters embutidos hoje não têm refresh, então não se pode descrever isso como uma reescrita concorrente de refresh automático embutido já ocorrendo |
| Alguns consumidores têm fallback de outro tipo ou de cópia | O snapshot do repo `node.ts:1294` recorre ao accessToken de negócio; o helper de JWT do Start Plan permite a cópia provider.apiKey | **Item de auditoria confirmado estaticamente**. Sob a nova semântica de limpeza é preciso verificar se essas cópias ainda permitem requisições da conta antiga; não se pode afirmar diretamente que todos os fallbacks estão usando credenciais erradas |
| `expiresAt` não é persistido e o JWT de negócio não tem cadeia de refresh automática | O Repo só salva access/refresh/JWT; o comentário do MCP oficial também afirma que o JWT de negócio não tem refresh | **Limite de capacidade**. Hoje se depende de novo login ou de recusa pelo servidor; adicionar refresh é uma escolha de design posterior |
| Documento histórico com semântica errada do token ZAI | [oauth-multi-provider-implementation.md:99](../../docs/oauth/oauth-multi-provider-implementation.md#L99), `:105` escrevem `data.token`; `:173` descreve conversão no momento do consumo | **Deriva de fato documental**. O Desktop atual converte no momento do login e salva o token de negócio, com o ZCode JWT salvo separadamente |

As evidências de runtime anteriores desta rodada usaram apenas fixtures em memória e funções carregadas do código-fonte atual, sem ler tokens reais; este capítulo não as repete. Correções formais ainda exigem, conforme exigido pelo repositório, testes/specs antes, cobrindo limpeza de login antigo, cancelamento/falha, troca entre as duas plataformas, corrupção isolada do JWT, limpeza de chaves derivadas e as fronteiras desktop/web de controle remoto.

## Uso de credentials.json pela CLI e pelo MCP

Esta seção segue o código-fonte atual em 2026-09-08 e descreve apenas fatos de código e as verificações de runtime sintéticas já concluídas nesta rodada. Todos os exemplos são esquemas estruturais e não contêm tokens reais. A regra de produto adotada é a definida explicitamente pelo usuário nesta rodada ("só é possível fazer login em uma plataforma; o login precisa remover todos os JWTs antigos"); essa regra se aplica à sessão de login ZAI/BigModel do ZCode App e não se estende automaticamente à remoção de OAuth de MCP de terceiros não relacionados, SSH, Bot ou API keys de modelo independentes.

Caminho de armazenamento, criptografia e trava de arquivo já foram descritos acima; aqui o foco é o comportamento de negócio da CLI e do MCP.

### Lista completa de campos de login da CLI

As constantes dos campos e as entradas de escrita da CLI estão em [shared-credentials.ts:11](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L11) e [shared-credentials.ts:215](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L215). A tabela abaixo descreve os valores **depois da descriptografia**.

| key completa | Estrutura/semântica do valor | Comportamento atual da CLI | Estado |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `oauth:active_provider` | string de provider; o login ZAI da CLI escreve `zai`. É uma marca de escolha de identidade, não um token | Sobrescrito no login; no logout só é removido quando o valor é `zai` | Caminho principal atual |
| `oauth:zai:access_token` | O Desktop exige o JWT de negócio MaaS retornado por `/api/auth/z/login`; a CLI hoje de fato armazena o token OAuth original `ready.data.zai.access_token` | Sobrescrito no login ZAI; removido no logout | Caminho principal atual, com semântica dividida |
| `zcodejwttoken` | `data.token` da resposta ready do backend, JWT de identidade do aplicativo ZCode; a mesma key é compartilhada por ZAI/BigModel | Sobrescrito no login ZAI; removido incondicionalmente no logout | Caminho principal atual |
| `oauth:zai:user_info` | `JSON.stringify(user)`; o user da CLI é `{user_id: string, avatar?: string, email?: string, name?: string}` | Sobrescrito no login ZAI; removido no logout | Caminho principal atual, não é token |
| `oauth:zai:refresh_token` | String de refresh token que writers históricos/outros podem ter deixado | O login da CLI não o produz nem o limpa; removido no logout | A CLI apenas limpa um campo de compatibilidade; não é saída do login novo atual da CLI |

O tipo no código-fonte da resposta OAuth ready da CLI contém apenas `status`, `token`, `user` e `zai.access_token`, sem refresh token nem campo de expiração persistido: [cli-oauth.ts:32](../../apps/zcode-cli/packages/adapters/src/auth/cli-oauth.ts#L32). O método de armazenamento do login da CLI também não tem parâmetro `expiresAt`, portanto não se pode inferir desse método que exista gestão automática de refresh do JWT do aplicativo.

As três keys BigModel abaixo são definidas pelo repo OAuth do Desktop; o login ZAI e o logout atuais da CLI não as processam. Elas são estado de sessão antiga que precisa ser considerado junto ao verificar o "login de plataforma única", e não são a saída gravada pelo setup de Coding Plan do BigModel na CLI atual:

| key completa | Valor após descriptografia | Base de código |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `oauth:bigmodel:access_token` | access token/JWT de negócio do BigModel | [oauthCredentialRepo.ts:24](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L24) |
| `oauth:bigmodel:refresh_token` | String de refresh token opcional | [oauthCredentialRepo.ts:28](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L28) |
| `oauth:bigmodel:user_info` | String JSON de dados do usuário | [oauthCredentialRepo.ts:32](../../packages/services/src/oauth/repo/oauthCredentialRepo.ts#L32) |

### Ciclo de vida do login, logout e key de modelo na CLI

#### Login ZAI da CLI

A sequência real de [loginZCodeCli](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L130):

```text
Gera um poll_token temporário
  |
  +--> POST /oauth/cli/init (Bearer poll_token)
  +--> exibe/abre authorize_url
  +--> GET /oauth/cli/poll/:flow_id (Bearer o mesmo poll_token)
          |
          +--> pending: continua esperando
          +--> failed/timeout/cancel: termina; este método ainda não escreveu credenciais compartilhadas
          +--> ready
                |
                +--> salva active=zai + OAuth access ZAI original + ZCode JWT + user
                |      o namespace BigModel antigo e o refresh ZAI antigo não são limpos agora
                |
                +--> POST api.z.ai/api/auth/z/login (troca o OAuth access original pelo JWT MaaS)
                +--> usa o JWT MaaS para consultar organização/projetos, procurar ou criar zcode-api-key e copiar o secret
                +--> a API key final do modelo é escrita em ~/.zcode/cli/config.json
```

- O `poll_token` de init/poll é apenas a credencial de requisição do fluxo de autorização do dispositivo atual e não é escrito em `credentials.json`: [cli-oauth.ts:88](../../apps/zcode-cli/packages/adapters/src/auth/cli-oauth.ts#L88), [cli-oauth.ts:106](../../apps/zcode-cli/packages/adapters/src/auth/cli-oauth.ts#L106).
- As credenciais compartilhadas são gravadas antes da troca do token de negócio e da atualização de config: [auth-login.ts:165](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L165).
- O token de negócio MaaS é usado dentro do resolver, e o resolver hoje devolve apenas a API key final do modelo, não o token ao shared store: [coding-plan-api-key.ts:96](../../apps/zcode-cli/packages/adapters/src/auth/coding-plan-api-key.ts#L96), [coding-plan-api-key.ts:111](../../apps/zcode-cli/packages/adapters/src/auth/coding-plan-api-key.ts#L111).
- A API key do modelo é escrita no config pelo config adapter, e não pelo armazenamento de credenciais: [file-config.adapter.ts:331](../../apps/zcode-cli/packages/adapters/src/config/file-config.adapter.ts#L331).

#### Setup de Coding Plan do BigModel na CLI / setup manual de API Key

`loginBigmodelCodingPlan()` é o fluxo de "obter a API key do modelo e configurar a CLI": o callback em localhost recebe o auth code, troca pelo access token do BigModel, obtém a API Key, escreve o config e fecha o servidor de callback. Esse método **não tem shared credential store e não escreve `oauth:bigmodel:*` nem `zcodejwttoken`**, portanto não pode ser tratado como outra entrada de login do aplicativo BigModel do Desktop. [auth-login.ts:212](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L212), [auth-login.ts:254](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L254).

O setup manual de API Key também apenas valida que o valor não está vazio e escreve o provider config, sem gravar o estado OAuth do aplicativo: [auth-login.ts:279](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L279).

#### Logout da CLI

`logoutZCodeCli()` chama apenas `clearZaiLoginCredentials()`. Este, em uma única transação de trava de arquivo, remove o access/refresh/user do ZAI e o `zcodejwttoken` compartilhado, mas a marca active só é removida quando ela é igual a `zai`; o namespace BigModel é totalmente preservado. [auth-login.ts:298](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L298), [shared-credentials.ts:70](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L70).

Esse caminho de logout da CLI não remove a API key de modelo de `~/.zcode/cli/config.json` nem percorre ou remove `mcp:oauth:*`. O logout da conta do aplicativo, a credencial de chamada de modelo da CLI e a autorização de MCP de terceiros são três ciclos de vida diferentes no código atual.

### Namespace OAuth do MCP e escopo de isolamento

Somente o OAuth de authorization-code do MCP usa este armazenamento compartilhado. A entrada de runtime `createOAuthClientProvider()` retorna `createMcpOAuthTokenProvider()` para authorization-code HTTP/SSE; stdio e a autenticação oficial não passam por este provider; o modo client-credentials cria diretamente o `ClientCredentialsProvider` do SDK, sem injetar este store nele. [mcp/index.ts:1527](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L1527).

A função de namespace está em [oauth.ts:558](../../apps/zcode-cli/packages/adapters/src/mcp/oauth.ts#L558):

```text
serverName
serverUrl (string original completa)
config.clientId ou ""
config.scope ou ""
config.redirectPath ou ""
        |
        +-- conecta com "\n"
        +-- SHA-256, primeiros 24 caracteres hex
        +-- P = "mcp:oauth:" + hash
```

Escopo real de isolamento:

- Dentro do mesmo arquivo de credenciais, todos os pares OAuth, a trava de refresh e o lease de autorização são compartilhados por CLI/Host/sessão com o mesmo `serverName + serverUrl + clientId + scope + redirectPath`.
- `workspacePath`, `workspaceIdentity`, o provider/conta ZCode atual, o issuer OAuth, `clientSecret` e `clientName` não participam deste hash.
- Mudar name/URL/scope/client ID/redirect path do servidor troca o namespace; o namespace antigo não é removido automaticamente por causa da mudança de key.
- O `issuer` é guardado à parte no canonical, participa da verificação de consistência do cache de discovery e **não participa do namespace de credenciais**.
- Portanto, hoje o isolamento é "arquivo compartilhado + semântica de autorização da configuração do MCP", e não "workspace + conta de login do aplicativo". Se é preciso adicionar este último, isso é uma decisão de produto/arquitetura e não pode ser classificado como bug só por faltar o workspace.

### Todos os campos persistidos do OAuth do MCP

A seguir, `P` designa o `mcp:oauth:<hash>` da seção anterior. Todos os JSONs são primeiro `JSON.stringify` e depois gravados como uma string criptografada no dicionário externo.

| Template de key completa | Estrutura após descriptografia e uso | Estado/origem de escrita atual |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `P:authorization_credentials` | par canônico completo de credenciais; ver a tabela de estrutura a seguir | Registro principal atual; publicado no sucesso de autorização/refresh |
| `P:client_information` | JSON `OAuthClientInformationMixed` do SDK; no mínimo `client_id`, pode conter `client_secret` e campos devolvidos no registro | Espelho de reader antigo ainda mantido; não é lixo que possa ser removido direto |
| `P:tokens` | JSON `OAuthTokens` do SDK; contém `access_token`, `token_type`, pode ter `refresh_token`, `expires_in`, scope e outros campos do SDK/servidor | Espelho de reader antigo ainda mantido |
| `P:discovery_state` | JSON cru `OAuthDiscoveryState` do SDK; o código atual lê `authorizationServerUrl`, `authorizationServerMetadata`, `resourceMetadata` etc. | Cache de metadata atual; não é token de negócio |
| `P:discovery_state_fetched_at` | `String(Date.now())`, string decimal de epoch em milissegundos | Timestamp do cache de discovery atual |
| `P:pending_authorization` | JSON `{attempt_id, authorization_url, baseline_generation?, expires_at, state}` | Estado compartilhado da transação de autorização atual; não é refresh/access token de longa duração |
| `P:code_verifier:<state>` | String original do verifier PKCE | Forma persistida do provider antigo; a Fase 2 atual só o mantém em memória |

As constantes, os tipos e a publicação atômica dos três primeiros keys estão em [oauth-credentials.ts:6](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L6) e [oauth-credentials.ts:143](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L143). As outras quatro categorias estão em [oauth-shared.ts:5](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-shared.ts#L5), [oauth-lease.ts:82](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-lease.ts#L82) e [oauth.ts:535](../../apps/zcode-cli/packages/adapters/src/mcp/oauth.ts#L535).

Estrutura local completa do wrapper de `authorization_credentials`:

| Campo | Significado |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `version` | O reader suporta 1 e 2; o writer atual é 2 |
| `client_information` | objeto de informações de client da mesma autorização dos tokens |
| `tokens` | objeto de tokens da mesma autorização do client |
| `published_by` | publicador/identificador de transação da autorização; o refresh escreve `refresh:<P>` |
| `generation?` | 16 bytes aleatórios hex gerados a cada publicação; não é token. Quando falta em registros antigos, a generation pode ser derivada do hash do texto canônico original |
| `obtained_at?` | epoch em milissegundos da obtenção do token |
| `expires_at?` | `obtained_at + expires_in * 1000`; ausente quando o servidor não devolveu um `expires_in` utilizável |
| `issuer?` | issuer/URL do servidor de autorização, usado na consistência de metadata de discovery e sem mudar a key |

Os tipos e as regras de leitura estão em [oauth-credentials.ts:19](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L19) e [oauth-credentials.ts:62](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L62). O armazenamento completo dos objetos do SDK não significa que exista localmente um schema separado para cada campo de extensão do SDK; o verificador de shape canônico atual verifica sobretudo versão, `published_by`, client ID, access token e token type.

### Autorização, refresh, invalidação e compatibilidade histórica do OAuth do MCP

#### O caminho principal atual tem duas fases

```text
Fase 1: AuthProvider puro (requisições de runtime)
  token()
    +-- lê canonical + espelhos e deriva um par
    +-- não próximo do vencimento: entrega o access token
    +-- próximo do vencimento e com refresh: entra numa trava de refresh independente
    +-- sem token: a requisição segue sem token e o 401 é classificado depois
  onUnauthorized()
    +-- com refresh: atualiza dentro da trava
    +-- sem refresh: exige autorização interativa

Fase 2: transação de autorização interativa
  obtém um lease de authz isolado por P
    +-- follower: observa o pending/generation compartilhado
    +-- leader: listener novo em localhost -> discovery -> DCR/client estático novo
                     -> pending URL/state -> espera o callback -> troca do code
                     -> escrita atômica do canonical + dos dois espelhos
                     -> fecha o listener, remove o pending por attempt, libera o lease
```

A Fase 1 está em [oauth-provider.ts:47](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-provider.ts#L47). A margem de vencimento é de 30 segundos; a ausência de `expires_at` também conta como perto do vencimento, mas sem refresh token usa o access token atual e espera o 401 final do servidor de recursos: [oauth-credentials.ts:179](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L179).

A Fase 2 espera por padrão 5 minutos pela transação de autorização e usa o lease de authz em leader/follower; o TTL do pending só decide exibição/legibilidade e não representa a posse da trava. O client registrado por DCR e o verifier PKCE ficam em memória na transação atual e o par client/token só é publicado quando o token é obtido; a espera pelo callback pode expirar ou ser cancelada, e o lease só é liberado após o settle da troca do code, evitando que o token já tenha sido gravado enquanto a transação antiga libera a trava cedo demais. [oauth-interactive.ts:37](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L37), [oauth-interactive.ts:77](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L77), [oauth-interactive.ts:168](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L168), [oauth-interactive.ts:246](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L246).

#### Refresh e remoção de tokens

O refresh usa um caminho de trava independente do arquivo de credenciais, com orçamento de espera de 45 segundos. Primeiro observa a generation e, após obter a trava, relê: se outro processo já rotacionou, reaproveita o resultado para evitar que vários processos consumam o mesmo refresh token de rotação ao mesmo tempo. Em caso de sucesso, regenera a generation e um único `saveMany` atualiza atomicamente o canonical e os dois espelhos. [oauth-refresh.ts:70](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-refresh.ts#L70), [oauth-refresh.ts:127](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-refresh.ts#L127).

| Condição de gatilho | Tratamento atual |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `invalid_grant` e há snapshot do texto canônico original | Usa o texto canônico original como guarda CAS, remove o canonical e o espelho de tokens e mantém o espelho de client; parte para autorização interativa |
| `invalid_client` / `unauthorized_client` de client dinâmico e há snapshot do texto canônico original | Sob a mesma guarda CAS do canonical, remove canonical, espelho de tokens e espelho de client; parte para autorização interativa |
| `invalid_client` / `unauthorized_client` de client estático | Reportado como erro de configuração, evitando reautorizar indefinidamente com o mesmo client inválido |
| Erros temporários de rede/5xx/discovery | Não tratados como grant definitivamente inválido; o modo proativo pode continuar com o token atual e o reativo lança erro de refresh temporário |
| Par apenas legado, sem `raw` canônico | O helper de remoção por canonical acima não é executado; ainda assim a classificação do erro leva a autorização interativa ou a erro de configuração |

Código: [oauth-refresh.ts:173](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-refresh.ts#L173), [oauth-refresh.ts:190](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-refresh.ts#L190), [oauth-credentials.ts:207](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L207). Aqui a invalidação de `tokens` remove o registro armazenado; não é um pedido de revoke enviado ao servidor OAuth.

#### Metadata, pending e arquivos de trava

- O TTL da metadata de discovery é de 24 horas; sem cache válido, expirado ou com issuer divergente, o retorno é undefined e dispara nova descoberta; a leitura expirada em si não remove a key e o próximo save sobrescreve o state e o timestamp. [oauth-shared.ts:43](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-shared.ts#L43).
- O pending é escrito quando o leader fornece a URL de autorização e, no fim, só é removido por compare-and-delete dentro do attempt a que pertence. Uma leitura expirada é apenas considerada inexistente e não equivale a limpeza física; uma queda de processo pode deixar pending expirado, e autorizações seguintes sobrescrevem/limpam. [oauth-lease.ts:108](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-lease.ts#L108), [oauth-lease.ts:148](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-lease.ts#L148).
- As travas authz/refresh ficam no mesmo diretório das credenciais e usam o prefixo `<P>` sanitizado (sem dois-pontos etc.) para derivar os caminhos de recurso `<P-sanitizado>.authz` / `<P-sanitizado>.refresh`; o diretório de trava底层 acrescenta `.lock`. Essas travas são metadados de exclusão entre processos, não campos de `credentials.json` nem tokens de negócio. [oauth-lease.ts:33](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-lease.ts#L33), [oauth-refresh.ts:285](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-refresh.ts#L285).
- Nesta rodada não foi encontrada, no código atual de adapters CLI/MCP, bootstrap e MCP/plugin de service, nenhuma entrada de negócio que percorra e remova todo o namespace `mcp:oauth:<hash>`. Não se pode afirmar que desconectar, desabilitar ou remover um MCP necessariamente limpa todo o material de autorização; o que está claramente visível hoje é a sobrescrita bem-sucedida, a invalidação CAS definitiva e a limpeza de pending/verifier.

#### Espelhos não são credenciais obsoletas; provider antigo não é o caminho principal atual

`loadCredentialPair()` lê o canonical e os dois espelhos de uma vez e, com base na versão e no conteúdo, mantém compatibilidade com readers/writers antigos. A v1 sem espelhos é um estado normal; a remoção do espelho de tokens na v2 indica que o writer antigo já está inválido e o canonical não pode ressuscitar o token; quando o client não mudou mas os tokens legados mudam, aceita-se o refresh de um processo antigo; quando client e token mudaram e não é possível provar que são da mesma transação, não há tentativa de Costura por adivinhação. [oauth-credentials.ts:239](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L239), [oauth-credentials.ts:289](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-credentials.ts#L289).

`oauth.ts` ainda contém o `ZCodeMcpAuthorizationCodeProvider` antigo completo e `createMcpAuthorizationCodeOAuthSession()`, mas na busca de chamadas do repositório atual apenas `mcp-oauth.e2e.test.ts` usa esse factory de sessão e os pontos de criação em produção já mudaram para o token provider puro. Esse provider antigo ainda grava o verifier PKCE em `P:code_verifier:<state>` e tenta limpá-lo no close, e ainda existe código de compatibilidade de CAS por key. Não se descreva com base nisso que a Fase 2 de produção atual grava o verifier em disco, nem trate o risco de CAS por key do provider antigo como bug de caminho principal em produção comprovado. [oauth.ts:67](../../apps/zcode-cli/packages/adapters/src/mcp/oauth.ts#L67), [oauth.ts:289](../../apps/zcode-cli/packages/adapters/src/mcp/oauth.ts#L289), [oauth.ts:361](../../apps/zcode-cli/packages/adapters/src/mcp/oauth.ts#L361), [mcp/index.ts:1537](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L1537).

### Tokens lidos pelo MCP oficial e o que realmente carrega as requisições

O MCP oficial não introduz uma nova chave de credencial `official-mcp:*` nem usa o par OAuth canônico de MCP de terceiros. A origem é o service do Host resolvendo as credenciais compartilhadas conforme o login atual do aplicativo e o plano de modelo selecionado:

```text
provider family / conexão selecionada do setting do Host
  + oauth:active_provider
  + zcodejwttoken
  + oauth:<family atual>:access_token (JWT MaaS)
        |
        +-- lê o snapshot de identidade antes e depois e verifica se a seleção, o active provider e os dois tokens são consistentes
        +-- constrói os cabeçalhos de identidade
        +-- official auth port, respondendo ao CLI pelo protocolo existente
              +-- MCP oficial HTTP: cabeçalhos da requisição
              +-- MCP oficial stdio: params._meta["com.zcode/official-mcp-auth"]
```

O Host exige que `oauth:active_provider` seja igual à família do setting atual e que exista ZCode JWT, e não pode recorrer a outra MaaS token atravessando a família; o caminho completo de plano também compara o JWT MaaS antes e depois. Sem plano, existe um ramo identity-only que pode enviar apenas o ZCode JWT e deixa o servidor decidir os direitos; havendo provider de plano mas sem JWT MaaS, o resultado é indisponível. [officialMcpCredentials.ts:216](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L216), [officialMcpCredentials.ts:283](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L283), [officialMcpCredentials.ts:330](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L330).

| Cabeçalho | Origem | Quando é enviado |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `Authorization` | `Bearer <zcodejwttoken>` | Enviado depois de resolver a identidade do aplicativo com sucesso |
| `X-Bigmodel-Authorization` | `Bearer <oauth:<family>:access_token>`, que é o JWT MaaS | Quando a identidade completa de Coding Plan está disponível; o ZAI também usa esse cabeçalho de nome histórico |
| `Bigmodel-Target-Type` | `PERSONAL` / `TEAM` | Quando existe scope no wire |
| `Bigmodel-Organization` | organization ID da conexão Team selecionada | Scope TEAM e quando organização/projeto podem ser determinados em par |
| `Bigmodel-Project` | project ID da conexão Team selecionada | Idem |

Constantes e construção: [official-mcp-auth.ts:22](../../packages/shared/src/official-mcp-auth.ts#L22), [officialMcpCredentials.ts:382](../../packages/services/src/official-mcp/officialMcpCredentials.ts#L382). `X-Coding-Plan-Api-Key` é um canal de compatibilidade antigo do servidor e o cliente atual não o envia mais; além disso, segue proibido que plugins o injétem por headers estáticos: [official-mcp-auth.ts:41](../../packages/shared/src/official-mcp-auth.ts#L41).

O adapter HTTP refaz a resolução pelo auth port a cada requisição; quando endpoint/origin não é confiável, ele não resolve credenciais nem envia requisição de rede. **Falha na resolução de identidade e origin não confiável são ramos diferentes**: a implementação HTTP atual envia uma requisição anônima no primeiro caso, deixando o servidor decidir com autoridade e sem usar tokens antigos; uma requisição que já tinha identidade e recebe 401 pode reobter a identidade e tentar mais uma vez, o que não é troca de refresh token OAuth nem remove credenciais. 403 e redirecionamentos são classificados como falhas distintas. [official-auth.ts:115](../../apps/zcode-cli/packages/adapters/src/mcp/official-auth.ts#L115), [official-auth.ts:155](../../apps/zcode-cli/packages/adapters/src/mcp/official-auth.ts#L155), [official-auth.ts:296](../../apps/zcode-cli/packages/adapters/src/mcp/official-auth.ts#L296).

O MCP oficial em stdio injeta o namespace homônimo em cada mensagem de protocolo de saída por meio do `requestMetaProvider`; MCP stdio comum de terceiros não recebe injeção. Sem auth port, ele dá explicitamente `{ok:false, reason:"official_auth_unavailable"}` e não procura uma identidade alternativa nem por env nem pelo arquivo de credenciais. [mcp/index.ts:568](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L568), [mcp/index.ts:599](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L599), [mcp/index.ts:1428](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L1428).

A CLI standalone não constrói automaticamente os cabeçalhos de identidade do MCP oficial só porque existe um arquivo de credenciais local; o auth port do protocolo precisa de contexto de Host e de workspace para solicitar o resolver do service. [official-mcp-auth-port.ts:48](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/official-mcp-auth-port.ts#L48).

### Quais segredos relacionados não são gravados em credentials.json por este caminho

| Segredo/campo | Local atual de gravação ou transmissão | Base e limite |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API key final de modelo da CLI | provider config de `~/.zcode/cli/config.json` | [file-config.adapter.ts:331](../../apps/zcode-cli/packages/adapters/src/config/file-config.adapter.ts#L331); o armazenamento de provider do Desktop está no documento principal, e as regras da CLI não são generalizadas para o Desktop |
| API key de modelo em variável de ambiente | Lida em runtime do provider `apiKeyEnv` ou do nome de env padrão | [registry.ts:493](../../apps/zcode-cli/packages/adapters/src/model/registry.ts#L493); tem precedência o `apiKey` explícito do provider, sem fallback para shared credential |
| `session-secret` de modelo do app-server | secrets Map em memória de `catalog.secrets`, isolado por `workspace.workspaceKey`, com key no formato `model-provider:<providerId>:api-key` | [workspace-model-catalog.ts:1275](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts#L1275), [workspace-model-catalog.ts:1446](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts#L1446); esse nome parecido com credential key não é uma key deste arquivo |
| referência de secret `env` de modelo do app-server | A referência de env é preservada e lida do env informado na resolução | [workspace-model-catalog.ts:1523](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts#L1523) |
| `poll_token` e flow/state do ZAI CLI | Memória do método de login atual e requisições de init/poll | [cli-oauth.ts:88](../../apps/zcode-cli/packages/adapters/src/auth/cli-oauth.ts#L88); não é access/refresh token de longa duração |
| access token intermediário do setup BigModel da CLI | Variável em memória após a troca do callback, usada para obter a API key final do modelo | [auth-login.ts:254](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L254) |
| verifier PKCE da Fase 2 atual do MCP e client DCR ainda sem troca de token bem-sucedida | Memória do provider de autorização interativa atual | [oauth-interactive.ts:246](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L246), [oauth-interactive.ts:409](../../apps/zcode-cli/packages/adapters/src/mcp/oauth-interactive.ts#L409); depois do sucesso o client entra em canonical/mirror |
| `clientId/clientSecret` da configuração client-credentials do MCP | Objeto de configuração do MCP passado ao `ClientCredentialsProvider` do SDK | [mcp/index.ts:1547](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L1547); este branch não injeta no shared store, então não se pode afirmar que `P:tokens` foi escrito |
| Headers estáticos / env de stdio do MCP | Passados diretamente pela configuração do MCP / ambiente de início do processo | [mcp/index.ts:1423](../../apps/zcode-cli/packages/adapters/src/mcp/index.ts#L1423); não são credenciais expandidas automaticamente a partir do shared store |
| `ZCODE_CREDENTIAL_SECRET` | Material de chave de criptografia local no ambiente | [credential-cipher.ts:87](../../apps/zcode-cli/packages/adapters/src/auth/credential-cipher.ts#L87); não é JWT de negócio |

A substituição do registry de modelos limpa os secrets `model-provider:*` antigos em memória, e remover um provider remove o secret correspondente: [workspace-model-catalog.ts:245](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts#L245), [workspace-model-catalog.ts:370](../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts#L370). Isso não equivale a modificar o arquivo de credenciais.

### Os três problemas da CLI verificados nesta rodada

#### CLI-1: divisão do tipo de token na mesma access key do ZAI

A CLI grava em `oauth:zai:access_token` o access token OAuth original do ready; o Desktop deja explícito que essa key deve guardar o JWT MaaS devolvido por `/api/auth/z/login` e o normaliza em seu próprio adapter de polling. A CLI de fato obtém o JWT MaaS depois, mas só o usa dentro do resolver de API Key. O impacto é que o login da CLI pode sobrescrever o token MaaS do qual dependem os consumidores de Desktop, MCP oficial e uso de negócio. [auth-login.ts:166](../../apps/zcode-cli/packages/bootstrap/src/auth-login.ts#L166), [zaiProviderAdapter.ts:307](../../packages/services/src/oauth/providers/zaiProviderAdapter.ts#L307).

Nesta rodada, um harness sintético executou o login real da CLI, o adapter OAuth, o resolver de API key, o armazenamento criptografado e as travas, injetando respostas HTTP sintéticas, com o config writer final como um stub que apenas registra argumentos; resultado: requisição de negócio usando JWT MaaS = true, shared store guardando o token OAuth original = true, shared store guardando o JWT MaaS = false, configuração final da API key do modelo com sucesso = true. Não houve login de rede real.

O [auth-login.test.ts:95](../../apps/zcode-cli/packages/bootstrap/tests/auth-login.test.ts#L95) existente já fornece respostas com token OAuth diferente do JWT de negócio, mas o [auth-login.test.ts:176](../../apps/zcode-cli/packages/bootstrap/tests/auth-login.test.ts#L176) afirma erroneamente que o token OAuth original é gravado na key compartilhada. A correção posterior deve primeiro atualizar esse teste de regressão e a cobertura de contrato dos consumidores entre Desktop e CLI.

#### CLI-2: login bem-sucedido não substitui por inteiro a sessão antiga da plataforma

`saveZaiLoginCredentials()` sobrescreve apenas quatro keys, sem limpar o access/refresh/user do BigModel nem o refresh ZAI antigo. Pelo contrato do usuário de "apenas uma plataforma pode estar logada, limpar os JWTs antigos", essa é uma inconsistência direta após a publicação bem-sucedida, e não se pode achar que a limpeza terminou só por trocar a marca active para zai. [shared-credentials.ts:215](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L215).

#### CLI-3: logout da CLI a partir da sessão atual do BigModel limpa apenas metade

`clearZaiLoginCredentials()` remove incondicionalmente o ZCode JWT compartilhado e preserva active=bigmodel e todo o namespace BigModel. O problema é que **a sessão global única não tem saída completa**; pelas regras mais recentes do usuário, a sugestão de correção não pode ser escrita como "preservar o login da outra plataforma". [shared-credentials.ts:70](../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts#L70).

CLI-2/3 foram executados com dois arquivos temporários independentes, o código-fonte real do armazenamento compartilhado e criptografia/travas reais. Apenas o active provider e a existência das keys são exibidos:

| key / marca | Após o login CLI ZAI vinda de BigModel | Após o logout CLI vindo de BigModel |
| ------------------------------ | ------------------------------ | ------------------------- |
| `oauth:active_provider` | `zai` | `bigmodel` residual |
| `zcodejwttoken` | existe (novo valor sobrescreve o registro de mesmo nome) | não existe |
| `oauth:bigmodel:access_token` | existe, resíduo da sessão antiga | existe, resíduo da sessão antiga |
| `oauth:bigmodel:refresh_token` | existe, resíduo da sessão antiga | existe, resíduo da sessão antiga |
| `oauth:bigmodel:user_info` | existe, resíduo da sessão antiga | existe, resíduo da sessão antiga |
| `oauth:zai:access_token` | existe | não existe |
| `oauth:zai:refresh_token` | existe, resíduo do valor antigo | não existe |
| `oauth:zai:user_info` | existe | não existe |

**Problemas definitivos e momento ainda por decidir, separados:** a publicação bem-sucedida precisa garantir um conjunto único e coerente de credenciais de plataforma, e o logout precisa remover por completo a sessão atual do aplicativo — ambos já podem ser confirmados pelas regras e pelo resultado de execução. "Sair da sessão antiga já ao clicar em iniciar login", "o cancelamento pelo usuário ainda mantém a saída" e "a falha na atualização da API key/config causa rollback do login do aplicativo" são momento de limpeza e fronteira transacional, e não podem ser derivados apenas da regra de plataforma única. Esta rodada não determina esses comportamentos por conta própria e também não inclui OAuth de MCP de terceiros nem keys de modelo independentes no conjunto de limpeza dos JWTs de login do aplicativo.

## Credenciais de Bot, conexões remotas e Relay

Todos os valores da tabela são os valores de negócio após descriptografia. ICredentialService é um dicionário genérico; esta seção lista as famílias de chaves definidas pelos produtores atuais e não é uma lista branca que restrinja o conteúdo de arquivos históricos.

### Credenciais de Bot: mesma chave, conteúdo interpretado por provider

| Regra de chave | Conteúdo após descriptografia | Origem | Principais consumidores |
| -------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `bot:<botId>:credential`, provider=`telegram` | Token de Bot do Telegram | Token que o usuário submete na caixa de credenciais do Bot; normalmente vem do BotFather | `getMe` do Telegram, sincronização de menu, envio de mensagens, long polling |
| `bot:<botId>:credential`, provider=`feishu` / `lark` | app secret do aplicativo Feishu/Lark, não é access token | Digitado manualmente, ou o `client_secret` do resultado do registro por QR code | Troca do app secret por `tenant_access_token`, WebSocket do Feishu e API do aplicativo |
| `bot:<botId>:credential`, provider=`weixin` | Bot token do Weixin iLink | `bot_token` da resposta de login por QR code, campo compatível `token`; o serviço genérico também recebe valores digitados | `Authorization: Bearer ...` e polling das requisições iLink |
| `bot:<botId>:webhook-secret`, provider=`webhook` | shared secret de webhook customizado | Fornecido pelo chamador de `saveBot({ webhookSecretValue })` | Comparação de callback de entrada; na saída usa o nome de header customizado, por padrão `x-zcode-bot-secret` |
| `bot:<botId>:webhook-secret`, provider=`feishu` / `lark` | verification token de callback de eventos | Fornecido pelo chamador de `saveBot({ webhookSecretValue })` | Comparação com o `token` de nível superior do payload ou com `header.token` |

As chaves são geradas em [config.ts:70](../../packages/services/src/bots/config.ts#L70), `:74`. O `botId` passa por trim em `saveBot` e a chave não tem dimensão de workspace nem de provider OAuth do usuário; cada Bot é isolado pelo seu ID. `BotConfig` guarda `credentialRef` / `webhookSecretRef`, e os valores reais ficam em outro repositório de credenciais. O service atual aceita qualquer ref existente, e leitura e remoção seguem o próprio ref; não se pode julgar um registro como inútil apenas pelo nome de chave não padronizado ([bots.ts:96](../../packages/shared/src/bots.ts#L96), [botsService.ts:6127](../../packages/services/src/bots/botsService.ts#L6127), `:6221`).

Evidências de código-fonte das origens e dos usos:

- Salvamento pela UI genérica: [BotsDialog.tsx:347](../../packages/ui/src/BotsDialog.tsx#L347); submissão digitada manualmente: `:816`. Após o QR code concluído usa-se a mesma entrada de salvamento; o `appSecret` do Feishu está em `:438` / `:445` e o `botToken` do WeChat em `:564` / `:572`.
- O registro do Feishu devolve `pollResponse.client_secret` como `appSecret`: [feishuAppRegistration.ts:164](../../packages/services/src/bots/providers/feishuAppRegistration.ts#L164). O Weixin lê `bot_token` / `token` da resposta: [weixinRegistration.ts:167](../../packages/services/src/bots/providers/weixinRegistration.ts#L167).
- O Telegram lê o ref e o coloca em `https://api.telegram.org/bot${token}/getMe`: [telegramProvider.ts:323](../../packages/services/src/bots/providers/telegramProvider.ts#L323), `:327`.
- Troca do app secret do Feishu por tenant access token: [feishuProvider.ts:1093](../../packages/services/src/bots/providers/feishuProvider.ts#L1093). O token obtido fica no `accessTokenCache` do módulo e não é uma nova key de `credentials.json` (`:1105`, `:1130`).
- Leitura do Weixin e cabeçalho Authorization: [weixinProvider.ts:97](../../packages/services/src/bots/providers/weixinProvider.ts#L97), `:105`.
- Validação de callback de webhook/Feishu: [botsService.ts:3273](../../packages/services/src/bots/botsService.ts#L3273), `:3284`. Cabeçalho de saída do webhook: [webhookProvider.ts:211](../../packages/services/src/bots/providers/webhookProvider.ts#L211).
- O wrapper `saveBot` do `BotsDialog` atual passa apenas `credentialValue` ([BotsDialog.tsx:347](../../packages/ui/src/BotsDialog.tsx#L347)); `webhookSecretValue` é um item suportado pela API do service e não deve ser descrito como um campo editável offered por toda a UI de Bot atual.

```text
Secret digitado pelo usuário / devolvido por registro por QR code
            |
            v
BotsDialog -> IBotsService.saveBot
            |
            +-> credentialValue / webhookSecretValue não vazios -> trim
            |      -> credentialService.save (key fixa de bot, secret)
            |      -> BotConfig guarda apenas o ref
            |
            +-> resolveName -> normalize -> validate -> repo.writeConfig
                   -> atualiza o provider runtime

provider runtime / provider adapter
    -> chama credentialService.load pelo ref do BotConfig
    -> usa o valor descriptografado para a autenticação de terceiros
```

Atualização e回收:

1. `saveBot` sobrescreve a mesma chave de bot quando há valor novo não vazio; sem valor novo não vazio, nada é escrito e o que se preserva é o BotConfig/ref vindo do chamador. A ordem de escrever o secret, resolver o nome, validar e gravar a configuração está em [botsService.ts:6127](../../packages/services/src/bots/botsService.ts#L6127), `:6140`, `:6171`, `:6174`.
2. Depois de salvar, os runtimes de Telegram, Weixin e Feishu são atualizados; a impressão digital do runtime inclui as credenciais reais do ref correspondente, de modo que a troca de valor sob o mesmo ref também é reconhecida ([botsService.ts:6175](../../packages/services/src/bots/botsService.ts#L6175); `telegramChannelRuntime.ts:64`, `weixinChannelRuntime.ts:46`, `feishuChannelRuntime.ts:51`, todos no mesmo diretório).
3. `removeBotSecret` para os runtimes relacionados, remove os dois refs e a identidade vinculada, limpa o state e só então remove a credencial apontada pelo ref; o Bot em si é preservado para Allows re-vinculação ([botsService.ts:6183](../../packages/services/src/bots/botsService.ts#L6183), `:6199`, `:6221`).
4. `deleteBot` remove a configuração e o state e apaga as credenciais apontadas pelos dois refs ([botsService.ts:6229](../../packages/services/src/bots/botsService.ts#L6229)). A desativação comum não passa por essas duas entradas de remoção e portanto não equivale a revogar/remover credenciais.
5. `saveConfig` substitui diretamente a configuração de Bot normalizada e atualiza o runtime, sem varrer as credenciais dos Bots removidos para fazer coleta por diferença ([botsService.ts:6099](../../packages/services/src/bots/botsService.ts#L6099)). Até agora não foi visto um GC genérico de credenciais órfãs percorrendo `bot:*`. A limpeza depende das entradas de remoção dedicadas e da preservação dos refs.
6. A credencial principal do Bot não tem estrutura de expiresAt/refresh token; depois de expirar é preciso fornecer o valor de novo ou refazer o QR code. O cache/renovação do token de curto prazo do Feishu pertence à camada de memória do provider e não deve entrar na lista de chaves persistidas.

### Credenciais de conexão remota: isoladas por workspace identity

| Regra de chave | Valor | Campo de configuração associado |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `remote-workspace:<workspaceKey>:password` | Senha SSH, valor bruto preservado, sem trim | `target.passwordCredentialKey` |
| `remote-workspace:<workspaceKey>:private-key-passphrase` | Passphrase da chave privada SSH, valor bruto preservado | `target.privateKeyPassphraseCredentialKey` |
| `remote-workspace:<workspaceKey>:server-token` | Token de conexão a um ZCode Server completo, valor bruto preservado | `target.tokenCredentialKey` |

Os construtores estão em [remoteWorkspaceHistory.ts:30](../../packages/ui/src/lib/remoteWorkspaceHistory.ts#L30), `:34`, `:38`. `workspaceKey = resolvedWorkspaceIdentity?.trim() || workspacePath` (`:402`); a identity de conexão é derivada do `buildRemoteWorkspaceIdentity` unificado (`:202`), com SSH incluindo host, port, username e workspace path, WSL incluindo distro/usuário opcional e Docker incluindo container; o Server reutiliza `buildServerRemoteWorkspaceIdentity`. WSL/Docker hoje não têm as chaves de senha/token acima.

A origem é o `RemoteTarget.password`, `privateKeyPassphrase` e `token` submetidos na conexão/reconexão. `createRemoteTargetSnapshot` converte esses textos claros em refs e coloca apenas parâmetros de conexão não sensíveis e os refs no histórico persistido ([remoteWorkspaceHistory.ts:237](../../packages/ui/src/lib/remoteWorkspaceHistory.ts#L237)). Os refs de snapshots já existentes são reutilizados, então refs antigas ou customizadas também podem continuar válidas; não se pode assumir que todos os refs do histórico voltem a ser calculados pela fórmula atual.

```text
Entrada de conexão RemoteTarget (senha / passphrase / server token)
   -> buildRemoteWorkspaceSessionMutation
      +-> snapshot (host/path/identity + refs de credencial)
      +-> credentialsToSave
      +-> credentialKeysToDelete
   -> commitRemoteWorkspaceSessionMutation
      -> tenta remover as chaves antigas -> grava as novas -> atualiza lastWorkspaceSession

Restauração/reconexão
   -> ref em lastWorkspaceSession.target
   -> credentialService.load
   -> createRemoteTargetFromSnapshot
   -> connectRemoteWorkspaceTarget
```

Leitura e回收:

- A UI restaura a senha SSH, a passphrase da chave privada e o token do Server: [reconnectRemoteWorkspaceHistoryEntry.ts:121](../../packages/ui/src/root/reconnectRemoteWorkspaceHistoryEntry.ts#L121), `:132`; depois de reconstruir o target chama a entrada de conexão (`:136`). A restauração de workspace SSH remoto pelo Bot também lê pelos refs do histórico de settings, conforme [botRemoteWorkspaceBridge.ts:115](../../packages/services/src/bots/botRemoteWorkspaceBridge.ts#L115), `:141`; o ramo explícito de reconstrução de credenciais desse helper hoje cobre apenas o SSH.
- Em caso de alteração, os refs que não são mais usados no snapshot antigo entram na lista de remoção; entradas cuja ref são descartadas por ultrapassarem o limite de 20 itens do histórico também entram na lista de remoção ([remoteWorkspaceHistory.ts:13](../../packages/ui/src/lib/remoteWorkspaceHistory.ts#L13), `:344`, `:429`, `:440`). Os valores salvos estão em `:451`.
- A entrada concreta de gravação tenta remover primeiro, depois grava o valor novo e por fim salva os settings; falha na remoção gera warn e o fluxo continua, falha na gravação lança o erro ([useRemoteWorkspaceHistory.ts:746](../../packages/ui/src/root/useRemoteWorkspaceHistory.ts#L746)). São várias operações de key única mais uma gravação de settings, e não uma transação entre arquivos.
- Ao remover explicitamente um workspace/aba remota, o histórico pós-remoção é salvo primeiro e depois as credenciais referenciadas são removidas, com falha registrada como warn ([useRemoteWorkspaceHistory.ts:1358](../../packages/ui/src/root/useRemoteWorkspaceHistory.ts#L1358), `:1382`, `:1397`). Uma desconexão comum ou a separação temporária do bridge não equivale a remover o histórico e não remove credenciais automaticamente.
- Não existe protocolo independente de expiração/refresh para credenciais remotas; a atualização acontece quando um novo valor de conexão é salvo e não há GC genérico que varra todos os `remote-workspace:*`.

### Credenciais de pareamento do Relay externo

A única chave fixa: `web-remote-control:external-relay:pass_hash` ([webRemoteControlRelayAuthStorageProvider.ts:4](../../packages/desktop/src/main/webRemoteControlRelayAuthStorageProvider.ts#L4)). O valor é a string `passHash`; apesar do nome ser hash, ele é usado para gerar a prova de autenticação e portanto é material de autenticação. `deviceSid` é a identidade não sensível correspondente, guardada em `webRemoteControlExternalRelayDevice.deviceSid` nos settings, e não é outra chave de credencial.

Origem: o primeiro registro gera uma password aleatória de 24 bytes, calcula seu SHA-256 e codifica em base64 como passHash; a prova de autenticação é `HMAC-SHA256(passHash, nonce|role|deviceSid)`, com saída base64url ([webRemoteControlRelayAuthProvider.ts:15](../../packages/desktop/src/main/webRemoteControlRelayAuthProvider.ts#L15)). A password bruta aleatória não é gravada à parte no credentials.json.

```text
Main manager.start
   -> authStorage.load
       +-> já existe {deviceSid, passHash} completo: auth persistida
       +-> ausente: password aleatória -> passHash -> registro no relay
   -> transport pronto + registeredAuth
   -> settings grava deviceSid
   -> credentialService grava passHash

Desafio do relay -> gera proof com passHash
auth persistida inválida / resetPairing
   -> limpa deviceSid dos settings + remove pass_hash
   -> o próximo start registra de novo
```

Cadeia de chamadas e ciclo de vida:

- O Main injeta os services de credencial/settings: [index.ts:931](../../packages/desktop/src/main/index.ts#L931). A leitura no start escolhe entre persistido/registro: [webRemoteControlManager.ts:1327](../../packages/desktop/src/main/webRemoteControlManager.ts#L1327); o salvamento após um registro novo bem-sucedido e pronto: `:1446`.
- `load` lê ao mesmo tempo settings/deviceSid e credential/passHash; se ambos faltarem retorna undefined e, havendo só um lado, limpa primeiro e retorna undefined ([webRemoteControlRelayAuthStorageProvider.ts:54](../../packages/desktop/src/main/webRemoteControlRelayAuthStorageProvider.ts#L54)).
- `save` faz patch dos settings e depois grava passHash (mesmo arquivo `:80`); `clear` limpa primeiro os settings e depois remove passHash (`:44`); o `rotate` público é clear seguido de save (`:96`). Também não é uma transação de dois arquivos, mas o load corrige o estado de ausência em um dos lados.
- O manager chama clear ao receber auth persistida inválida ([webRemoteControlManager.ts:1398](../../packages/desktop/src/main/webRemoteControlManager.ts#L1398)); quando o usuário faz resetPairing, o runtime antigo é parado, há clear e depois start (`:1537`). Um start comum reutiliza o material de pareamento completo, portanto encerrar uma vez o runtime não deve ser descrito como apagar credenciais de pareamento.
- Esta chave não tem sufixo de isolamento de workspace e pertence ao estado de pareamento do relay externo do aplicativo desktop. Não tem relação com OAuth token de serviço de modelo, token de Bot ou token de workspace do Server.

### Fronteiras de posse do Desktop, do Web no celular e do host remoto

```text
Workspace local do Desktop -------------------------> credentialService local
Workspace SSH/WSL/Docker do Desktop -----------------> credentialService local
Mobile /remote -> attachment em shared-host ---------> service do scopeattached
                                                    |
                                     local/SSH/WSL/Docker: credenciais locais
                                     Server remoto: credenciais do próprio Server
Auth de relay externo do Desktop Main ----------------> credentialService local

server-token necessário para conectar a um Server:
  fica no histórico de credenciais do lado que iniciou a conexão; as credenciais de negócio do Server após a conexão são fornecidas pelo próprio Server.
```

- O service de credenciais do desktop é criado em [node.ts:1213](../../packages/services/src/node.ts#L1213) e injetado no Bots (`:1919`).
- O host scope de SSH/WSL/Docker mantém explicitamente o service local de settings/credenciais e ao mesmo tempo faz proxy de arquivos/tarefas remotas; [remoteWorkspaceServiceCollection.ts:83](../../packages/desktop/src/host/remoteWorkspaceServiceCollection.ts#L83), `:239`, `:247`, `:255`. A mesclagem correspondente no renderer cobre apenas os serviços de workspace e preserva os serviços base de credencial/Bot: [remoteWorkspaceSessionServices.ts:3](../../packages/desktop/src/renderer/src/remoteWorkspaceSessionServices.ts#L3). Não se pode gravar a autenticação de Bot/conexão na máquina remota só porque o workspace path atual está lá.
- O Server remoto é a exceção: o Server completo é a autoridade do estado de negócio e os serviços de credencial/Bot são encaminhados diretamente para o Server ([remoteWorkspaceServiceCollection.ts:316](../../packages/desktop/src/host/remoteWorkspaceServiceCollection.ts#L316), `:334`, `:339`; a entrada de mesclagem do Server no renderer está em [remoteWorkspaceSessionServices.ts:53](../../packages/desktop/src/renderer/src/remoteWorkspaceSessionServices.ts#L53)).
- O Web no celular, após estabelecer o bridge, obtém os services pelo protocolo, conforme [main.tsx:1838](../../packages/web/src/main.tsx#L1838); `RemoteServiceAccess` transforma os serviços de credencial/Bot em proxies RPC, conforme [remoteServiceAccess.ts:113](../../packages/client/src/remoteServiceAccess.ts#L113), `:134`. No estado home-only e desconectado, o credential load retorna null ([main.tsx:1109](../../packages/web/src/main.tsx#L1109)) e não cria um credentials.json no lado do navegador.
- O `/remote` do celular se anexa ao scope de shared-host já existente na janela; a posse do arquivo de credenciais é a mesma do attachment e não é criado outro credential store/Agent só porque o celular tem fluxo replayable. O `desktop-continuous` do desktop e o `web-remote-replayable` do celular são fronteiras de entrega de mensagens, e não regras de nomenclatura de chaves deste arquivo. Fonte atual dos fatos: [task-realtime-sync.md:9](../../docs/web-remote-control/task-realtime-sync.md#L9), `:22`; [web-remote-control-task-command-queue.md:20](../../docs/web-remote-control-task-command-queue.md#L20).

### Comportamentos já verificados e questões ainda a verificar

| Item | Nível de evidência | Observação e impacto |
| ------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O provider.test do Webhook reporta sucesso mesmo com valor de armazenamento ausente | Reproduzido com execução sintética | Importando o `createWebhookBotProvider` real com Node v24, quando o ref existe, não há webhookUrl e o load sempre devolve null, a função retorna `{ok:true,message:"Webhook bot is enabled for inbound callbacks."}` e o número de leituras de credencial é 0. Código [webhookProvider.ts:172](../../packages/services/src/bots/providers/webhookProvider.ts#L172). Apenas o ramo de teste de conexão foi verificado, não o service de entrada completo. |
| O callback de Bot pode pular a verificação quando o secret está ausente | Candidato estático de alta confiança, sem execução completa | [botsService.ts:3273](../../packages/services/src/bots/botsService.ts#L3273), `:3284` só rejeitam quando expectedSecret/expectedToken são verdadeiros e diferentes; ref existente com load devolvendo null/string vazia pula essa checagem. A reprodução da linha acima (provider.test) não pode ser tratada como reprodução desta linha. |
| Mesmo após o salvamento do Bot ser rejeitado, ainda é possível atualizar credenciais ou deixar órfãos | Candidato estático, sem execução | Primeiro `credentialService.save` (`botsService.ts:6127`) e depois `validateBotConfig` (`:6171`). Por exemplo, a falha de validação de providerUserId duplicado pode ocorrer depois da escrita do secret; é preciso um fixture completo do service para verificar e determinar a fronteira transacional da correção. |
| Uma reconexão remota que falha pode sobrescrever credenciais corretas já existentes | Candidato estático, sem execução | `remoteWorkspaceHistory.ts:404` preserva o snapshot antigo em caso de failed/currentEntry, mas `:451` ainda monta credentialsToSave com o target submetido. É preciso um teste da cadeia real de falha de conexão/persistência; não se considera isso reproduzido com base apenas nesta leitura. |

## Conclusões da auditoria e registros de verificação

### Evidências de runtime sintéticas obtidas

| Cenário | Resultado | Escopo da conclusão |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Desktop ZAI → BigModel e BigModel → ZAI com commit bem-sucedido | Ambos os sentidos removem as keys de namespace da plataforma oposta; a ordem das operações de JWT é delete → save; o novo JWT é preservado | Verificação sintética dos métodos do Repo e de persistOAuthSession no código-fonte atual. Não foi verificada a limpeza total das keys legadas e isso não equivale a um E2E de UI real aprovado |
| Login ZAI da CLI | A requisição de negócio usa o JWT MaaS obtido pela troca, mas a access key compartilhada continua sendo o token OAuth original | CLI-1 confirmado: semântica de escrita dividida no campo compartilhado |
| Login ZAI pela CLI a partir de uma sessão BigModel antiga | active passa a zai, o novo JWT sobrescreve; o access/refresh/user antigos do BigModel e o refresh ZAI antigo permanecem | CLI-2 confirmado: limpeza de credenciais antigas incompleta; não se pode descrever os campos residuais como dois active providers ativos ao mesmo tempo |
| Logout da CLI a partir de uma sessão BigModel | O JWT desaparece, active=bigmodel e o namespace BigModel são preservados | CLI-3 confirmado: a sessão é limpa apenas pela metade; o problema correto não é ter removido um JWT antigo que deveria ser preservado |
| Cached restore do Desktop encontrando erro de descriptografia do JWT isoladamente | Lança erro e a marca active não é limpa pela lógica de restauração unificada do Repo | Método restore real com injeção de erro; falta o caso de teste de recuperação por corrupção correspondente |
| Cancelamento durante o login do Desktop na mesma plataforma | O rollback grava de volta o access/profile antigos, e o JWT antigo restaurado é depois removido pelo clearProvider da outra domínio | O que se confirma é a inconsistência de estado do rollback atual. Se a sessão antiga deve ser preservada ou o logout mantido depende do contrato de commit/cancelamento, e a correção não pode ser simplesmente recolocar o JWT antigo |
| Variável de ambiente de criptografia do Desktop/CLI contendo espaços em branco | Valores comuns descriptografam nos dois sentidos; tanto espaços nas pontas quanto só espaços em branco falham nos dois sentidos | Verificação sintética de interoperabilidade com o cipher real, sem tokens ou chaves reais |
| test de Webhook somente de entrada | Existe ref mas o sucesso é devolvido sem chamar loadCredential | Apenas o ramo de test foi verificado; não foi apresentado como reprodução da verificação de senha do callback completo |

A tabela acima usa o Node 24 para executar o código-fonte atual ou métodos reais extraídos dele; HTTP, gravação de configuração ou dependências periféricas recebem fixtures injetados por cenário. Eles provam o resultado do caminho de função correspondente e não substituem a validação ponta a ponta do desktop, do celular, de servidores reais e entre sistemas operacionais.

### Limites que precisam continuar sendo verificados ou esclarecidos

- **Momento da transação de login:** clicar para iniciar, o ready/a troca concluída, a publicação das credenciais e a atualização da API key/config do modelo não são o mesmo instante; o estado final quando o usuário cancela ou quando alguma etapa falha deve ser determinado junto com a fronteira de commit.
- **Conjunto de limpeza de sessões antigas:** o legado `auth_token/refresh_token`, JWTs órfãos quando o active está ausente, resíduos de providers não registrados, as credenciais embutidas de Coding Plan / Start Plan correspondentes a sessões OAuth antigas e as cópias no WebView devem entrar na verificação dos cenários de limpeza ([implementação da limpeza derivada](../../packages/services/src/oauth/oauthProviderLogout.ts#L14)). Uma API key de modelo comum digitada manualmente não entra por isso no escopo de limpeza de login do App. O requisito de limpar JWTs antigos não pode ser implementado como esvaziar o arquivo inteiro de credenciais.
- **Consistência entre processos:** a trava de escrita de arquivo já existe, mas múltiplas operações de keys independentes, múltiplas leituras e múltiplas instâncias de OAuthService não formam uma transação de login global. Se é preciso publicação em lote ou leitura por snapshot deve ser decidido com uma reprodução entrelaçada.
- **Candidatos de Bot e remoto:** pular a verificação quando o secret do callback está ausente, gravar o secret antes da falha de validação do Bot e ainda enfileirar gravação de novas credenciais numa reconexão que falhou são candidatos estáticos; a cadeia de chamadas completa não foi executada.
- **Relação entre MCP e conta do App:** o namespace do MCP hoje não tem dimensão de conta/workspace do App e o logout do App não revoga automaticamente as autorizações do MCP. Se é preciso limpar junto com a conta do App é uma escolha de design independente.
- **Migração da criptografia local:** a origem da chave padrão e a diferença de espaços em branco entre os dois lados precisam considerar arquivos antigos; não basta mudar só a derivação da chave nova. A compatibilidade com texto claro e prefixos de criptografia desconhecidos também devem ser definidas junto da estratégia de migração de versão.
- **Variantes de arquivamento:** o Desktop hoje exclui credentials.json pelo nome exato do arquivo e o fallback do feedback exclui por substring do caminho; o tratamento real de backups corrompidos e arquivos temporários nos dois caminhos de arquivamento precisa de casos de teste próprios, e este documento não afirma que todas as cópias de credenciais já foram excluídas.

### Pontos de entrada para conferência com testes e documentos existentes

| Direção de cobertura | Arquivos de teste verificáveis hoje |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criptografia de armazenamento genérico, escrita concorrente, JSON corrompido preservado | [credentialService.test.ts](../../packages/services/test/credentialService.test.ts), [CLI auth.test.ts](../../apps/zcode-cli/packages/adapters/tests/auth.test.ts) |
| Troca de plataforma no login do Desktop, recuperação por expiração/corrupção, cancelamento | [oauthService.test.ts](../../packages/services/test/oauthService.test.ts) |
| Troca de token e gravação de campos no login da CLI | [auth-login.test.ts](../../apps/zcode-cli/packages/bootstrap/tests/auth-login.test.ts); nele, a afirmação de que o token OAuth original vai para a key compartilhada precisa ser corrigida junto com o contrato |
| OAuth do MCP, autorização/refresh entre processos | [mcp-oauth-refresh.test.ts](../../apps/zcode-cli/packages/adapters/tests/mcp-oauth-refresh.test.ts), [mcp-oauth-cross-process.e2e.test.ts](../../apps/zcode-cli/packages/adapters/tests/mcp-oauth-cross-process.e2e.test.ts) |
| Escolha de identidade do MCP oficial | [officialMcpCredentials.test.ts](../../packages/services/test/officialMcpCredentials.test.ts) |
| Armazenamento de login independente do navegador | [browserOAuthCredentialRepo.test.ts](../../packages/web/test/browserOAuthCredentialRepo.test.ts) |
| Entrada de regressão interativa do Desktop | [desktop-auth-config-e2e-cases.md](../testing/desktop-auth-config-e2e-cases.md); ao alterar de fato a interação de login é preciso adicionar o E2E correspondente, e não cobrir apenas métodos privados |

Os documentos existentes não substituem os fatos do código atual: por exemplo, as [notas de implementação do OAuth](../oauth/oauth-multi-provider-implementation.md) ainda têm descrições antigas da origem do token ZAI e do momento da conversão, e o [auth-login da CLI](../../apps/zcode-cli/docs/design/v2/auth-login.md) registra a forma como a CLI atual persiste o token OAuth original, incompatível com o contrato de consumo no mesmo arquivo do Desktop. Alterações futuras devem unificar essas specs e testes para evitar que, depois de corrigir só o código, continue havendo convenções contraditórias.

Desta vez apenas o documento de levantamento foi acrescentado; nenhuma correção foi implementada. A verificação de atualidade da base passou; `pnpm typecheck` e `pnpm lint` foram executados, mas o worktree atual não tem node_modules e, por não existirem tsc / oxlint, não puderam rodar. Não se declara aprovação de Vitest, de E2E do Desktop, de E2E de controle remoto do celular nem de regressão em Windows/Linux.