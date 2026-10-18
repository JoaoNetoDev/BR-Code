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
- A remoção local de uma credência da allowlist remove na sincronia seguinte a credencial de mesmo nome no remoto; credenciais fora da allowlist não são afetadas.
- Os fluxos de tarefa `continuous` do Desktop, `replayable` do Móvel e o roteamento existente de workspace identity permanecem inalterados.

## Gatilhos e Escopo

### Gatilho Automático

Executado apenas para remotos SSH, WSL, Docker e Server, e disparado por uma persistência bem-sucedida ou pelo ciclo de vida do Environment:

- um Remote Environment passa de zero conexões online para pelo menos uma;
- o Personal Provider Config é salvo com sucesso;
- o Configured Default é salvo ou limpo com sucesso;
- as configurações estreitas de conta permitidas pelo Provisioning Envelope são salvas com sucesso;
- uma credência da allowlist é salva ou removida com sucesso.

Cada sincronização sobrescreve o espelho remoto correspondente com o snapshot completo local mais recente, sem verificar se o remoto já tem configuração e sem comparar se as duas pontas são iguais. Quando o Personal Config local está vazio, o valor vazio também é gravado; credenciais da allowlist usam semântica de replace. Na primeira sincronização por conexão, apenas `applied` / `already-applied` pode publicar Remote Workspace ready; quando o primeiro retorno é `failed`, `rollback_failed` ou `unsupported`, a requisição termina pelo canal oficial de falha de conexão. Uma falha de sincronização posterior em um Workspace já publicado não derruba a conexão: deixa apenas um warning estruturado sem Secret e aguarda o próximo gatilho real para reler o snapshot mais recente.

### Coordenação por Environment

Workspace não é a unidade de sincronização. Vários Workspaces e várias janelas do mesmo Remote Environment compartilham uma única lane de sincronização no Desktop Main:

```text
Workspace A ─┐
Workspace B ─┼─> Remote Environment key ─> single-flight lane ─> um Host online executa
Workspace C ─┘
```

O Main guarda apenas Environment key, Host registration, trigger, generation e informações de correlação da requisição; ele não lê nem encaminha configuração e Secret. O Window Host selecionado relê o Local Source mais recente no momento da execução e chama o Remote Target daquele Environment. Um novo gatilho ocorrido durante a sincronização apenas avança a generation; depois que a rodada atual termina, o snapshot mais recente é lido uma única vez para formar uma sincronização trailing, sem enfileirar por evento e sem usar atraso fixo.

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

## Compatibilidade e Semântica de Falha

- Result e o resultado de execução do Host recebem um `errorCode` opcional, aceitando apenas uma enumeração fixa: `source-read-failed` (leitura do snapshot local), `target-call-failed` (chamada remota lançou erro, incluindo validação/pré-leitura/RPC), `target-write-failed` (escrita no Target Store), `target-refresh-failed` (refresh de conta/Registry), `target-commit-failed` (escrita do registro idempotente), `target-apply-failed` (Target antigo só devolve estado de falha), `capability-unavailable`, `session-unavailable`, `host-execution-failed`. `rollback_failed` continua expressando a falha de rollback separadamente e não sobrescreve a etapa original da falha. O código de erro não inclui caminhos, credenciais nem texto livre do remoto.
- O novo Host usa `target-apply-failed` para códigos de erro ausentes ou desconhecidos do Target antigo; resultados antigos continuam legíveis. Isso não altera a versão do Envelope, o estado de sucesso nem a versão do arquivo idempotente, e não infere a falha de causa subjacente que não pode ser confirmada. A correção da preferência padrão exige publicar simultaneamente o bundle do server remoto; atualizando apenas o Host, o Target antigo continua executando a validação estrita original.
- Uma falha na primeira sincronização registra Environment, trigger, status, errorCode e duração antes do reject; o painel de conexão e o feedback recebem ao mesmo tempo uma linha de falha com código de erro seguro. Falhas posteriores em conexões existentes continuam sendo registradas apenas como warning. O `errorMessage` / `error` original não é copiado diretamente para o log do Main ou para o Renderer.

- Quando um remoto antigo da primeira conexão não suporta a capability de Provisioning, o retorno é `unsupported`, sem envio de Secret e sem publicar Remote Workspace ready.
- O `zcode-server` HTTP só expõe o target de Provisioning para Desktop Hosts confiáveis depois que `ZCODE_SERVER_AUTH_TOKEN` está configurado; sem autentração configurada, ele permanece «não suportado», evitando expor a entrada de credenciais entre Environments a conexões anônimas.
- Uma falha de sincronização automática depois que o Remote Workspace já está conectado registra apenas um warning estruturado, não derruba a conexão existente e não muda o feedback de sucesso de salvamento local; esta rodada não adiciona estado de erro de Environment, protocolo, Banner nem entrada na página de Settings. Essa é a semântica transitória antes da entrada em produção do gerenciamento independente de configuração remota.
- Quando uma desconexão de rede torna o resultado desconhecido, a retentativa usa o `syncId`; quando o destino recebe novamente qualquer `syncId` já concluído, ele devolve o resultado anterior e não reaplica o envelope antigo porque uma sincronização posterior sobrescreveu o registro idempotente.
- Quando o Environment está offline, uma intenção de sincronização pendente é mantida e, ao voltar a ficar online, o estado local mais recente é lido e executado; falhas comuns não entram em retentativa em laço e aguardam o próximo gatilho real.

## Regressão de Preferência Padrão e Diagnóstico de Primeira Falha

- Os testes focais cobrem reasoning ausente/inválido, Provider/Model ausente, Registry vazio, padrão válido, falhas de escrita/refresh/commit idempotente e de rollback, além do tratamento seguro de resultados antigos e códigos de erro desconhecidos.
- `SSH-P0-CONN-05` valida por Electron → SSH → Target remoto reais: quando a credencial de sincronização local está corrompida, tanto o erro quanto o log de conexão mostram `source-read-failed`; depois de restaurar a credencial, mesmo com um padrão inválido preservado, é possível entrar no diretório e no workspace remotos. O caso usa a fixture de inicialização sem conta já existente, evitando o popup de expiração de login por causa de um OAuth falso e sem relação.
- 2026-10-09: o E2E SSH de macOS Desktop → Ubuntu 22.04 aarch64 isolado passou, artifact `desktop-e2e-20261009032604472-p1453-8bb89553244ba5cc`. O caso permanece pending e não teve promoção manual. Windows/WSL, outros sistemas remotos e a UI no celular não foram testados em máquina real; como a entrada no local do usuário que reportou o problema não foi obtida, não se afirma ter reproduzido o incidente histórico de cada usuário. O rollback pode reverter este commit, e não há migração de formato persistente.