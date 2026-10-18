# ZCode Agent Remote Deployment

## Escopo

Para workspaces SSH/Docker/WSL anexados ao Desktop, o Desktop Main inicia ou reutiliza um processo
utilitário local Electron Remote Host. Esse Remote Host conecta ao `zcode-server` e ao runtime do
ZCode Agent na máquina remota, onde arquivo, git, terminal e execução de agente observam o sistema
de arquivos e o ambiente de processos remotos. O Local Host de escopo de janela permanece como um
processo separado; um workspace remoto não o substitui nem recebe um segundo Local Host.

A implantação remota atual apenas prepara o conjunto padrão de recursos do ZCode:

- `server-bundle`
- `node-runtime`
- `node-pty`
- `glm` / runtime do ZCode Agent
- `bfs`
- `ripgrep`
- `ugrep`

Runtimes de agentes e proxies de terceiros aposentados não são implantados.

## Layout do Runtime

Caminho base do servidor remoto:

```text
~/.zcode/server/
├── node
├── zcode-server.cjs
├── build/Release/pty.node
├── agents/glm/
│   ├── .version
│   ├── zcode.cjs
│   └── zcode-agent
├── .asset-components/
│   ├── server-bundle.json
│   └── glm.json
└── tools/
    ├── bfs/
    │   ├── .version
    │   └── bfs
    ├── ripgrep/
    │   ├── .version
    │   └── rg
    └── ugrep/
        ├── .version
        └── ugrep
```

Linux SSH, Docker e WSL implantam os componentes `bfs 4.1.1-2`, `ugrep 7.8.4-1` e
`ripgrep 14.1.1-1` da Microsoft. O remote em Darwin continua implantando apenas o componente
histórico `ripgrep 13.0.0-10`; o remote producer escolhe a cadeia de dependências conforme a
plataforma de destino e não pode remover os assets de release históricos do rg13.

`deployZCodeAgentRuntime()` trata o SHA-256 do artefato do manifesto `glm` como identidade de
implantação em produção, enquanto a versão do App desktop permanece inalterada. Ele só pula a
implantação quando `.asset-components/glm.json` registra o mesmo SHA e plataforma e os assets de
wrapper, bundle e plugin oficial ainda existem. A versão semântica do runtime GLM não participa
dessa decisão: a mesma versão com novos bytes de artefato precisa ser implantada, enquanto uma
mudança no rótulo de versão com SHA de artefato idêntico, por si só, não dispara implantação. Um
marcador legado sem SHA é migrado por uma implantação que grava o SHA atual.

Quando o servidor remoto instalado reporta uma versão de App diferente da do App desktop atual, o
desktop precisa forçar a atualização de `glm` depois de atualizar o servidor. O marcador não é
confiável entre versões de App porque um App mais antigo pode sobrescrever `agents/glm` pelo seu
caminho legado de implantação sem atualizar o marcador mais novo
`.asset-components/glm.json`. Por isso, tanto o modo local-upload quanto o modo remote-download
contornam a decisão de skip por SHA e o cache de componentes já existente, e então buscam novamente
o artefato selecionado pelo manifesto do App atual. A atualização forçada tem escopo de um
componente por implantação: o bundle GLM e a instalação de plugins oficiais precisam reutilizar o
mesmo componente recém-baixado, em vez de apagar e baixar esse componente uma vez para cada caminho
montado. No modo local-upload, esse único componente novo é enviado para substituir tanto o bundle
remoto quanto o diretório de plugins oficiais.

A atualização por versão de App é segura quanto a retentativas. Antes de substituir o servidor
remoto, o desktop substitui o marcador GLM ativo existente por um marcador persistente
`pendingRefreshAppVersion`. Se a substituição do servidor ou qualquer download/upload posterior de
node-pty/GLM, substituição de plugin ou instalação do wrapper falhar, a próxima conexão ainda
observa esse marcador pendente depois que a versão do servidor já avançou. Ela deve continuar
contornando o cache de componentes com o mesmo SHA até que a implantação do GLM tenha sucesso e
sobrescreva o marcador pendente com o SHA do artefato atual. A instalação forçada de
`server-bundle` já concluída permanece válida ao longo dessa retentativa.

```text
remote App version differs
        |
        v
write glm.pendingRefreshAppVersion
        |
        v
force-refresh server-bundle --> deploy node-pty --> force-refresh GLM
        |                            |                    |
        +------------ failure -------+--------------------+
        |                                                 |
        v                                                 v
keep pending marker                              write GLM SHA marker
        |                                                 |
        v                                                 v
next connection forces GLM again                    pending cleared
```

Cada implantação fixa um único snapshot novo do manifesto: o SHA usado para a decisão de skip, o
artefato de componente materializado localmente e o SHA gravado no marcador remoto vêm todos desse
mesmo snapshot. A montagem concorrente de releases locais é isolada por SHA do GLM, de modo que
sessões que observam artefatos republicados diferentes não reutilizam o diretório de release uma
da outra. O snapshot fixado também retém a origem CDN que forneceu o manifesto, de modo que os
downloads de componentes preferem essa mesma origem antes de recorrer a outros candidatos.

Toda requisição a candidato de manifesto tem um timeout finito no nível da aplicação (10 segundos
por padrão) que cobre tanto os cabeçalhos de resposta quanto o corpo da resposta. Um candidato que
estoure o tempo é abortado antes de tentar o próximo candidato CDN. Se nenhum candidato completar, a
busca da identidade nova registra um aviso observável e aborta aquela implantação. Ela não deve
seguir adiante por uma requisição de instalador que pudesse observar um snapshot de manifesto
diferente. Isso evita que a inicialização remota e as tentativas de conexão posteriores compartilhem
uma requisição de manifesto permanentemente pendente.

`server-bundle` também usa o SHA-256 do artefato do manifesto como identidade de implantação em
produção. O App precisa comparar `.asset-components/server-bundle.json` com o manifesto novo antes
de decidir que uma versão de App igual pode pular o upload do servidor. Um marcador legado ausente
ou um SHA diferente dispara uma implantação de servidor e grava o SHA atual somente depois que a
instalação tem sucesso. Isso permite republicar um bundle de servidor sob a mesma versão semântica
de App/componente sem reutilizar os bytes anteriores.

Quando o servidor remoto instalado reporta uma versão de App diferente da do App desktop atual,
`server-bundle` segue o mesmo limite de atualização forçada de `glm`: tanto o modo local-upload
quanto o modo remote-download devem contornar um cache de componente existente com o mesmo SHA,
baixar e verificar novamente o artefato selecionado pelo manifesto do App atual, e implantar esse
componente recém-materializado. Portanto, o limite por versão de App nunca confia em um marcador de
cache `.ready` histórico para nenhum dos dois componentes. Versões de App iguais continuam usando
caches endereçados por SHA e só reimplantam quando o SHA novo do manifesto difere do marcador
ativo ou quando arquivos de runtime exigidos estão ausentes.

O manifesto novo usado na decisão de skip do servidor precisa ser o mesmo snapshot fixado usado para
resolver e instalar `server-bundle`. Tanto no modo local-download-upload quanto no remote-download, a
chave do cache de componentes do servidor é o SHA do manifesto, e não a versão semântica do
componente. Diretórios legados de cache por versão semântica não devem ser migrados para um cache
de servidor chaveado por SHA, porque seu conteúdo não consegue provar a identidade do artefato
solicitado. `node-runtime`, `node-pty` e `ripgrep` mantêm suas decisões atuais de implantação e de
cache de componentes. Bundles locais em modo de desenvolvimento continuam usando o fluxo separado
de hash de conteúdo `.dev-version`.

```text
remote App version vs current App version
        |
        +-- different ----------------> force refresh current server-bundle + GLM artifacts
        |                               deploy server + bundle + plugins + wrapper
        |                               then write current sha256 markers
        |
        +-- equal --------------------> compare GLM manifest sha256
                                                |
                                                v
                               remote .asset-components/glm.json
                                                |
                                                +-- equal + files complete --> skip
                                                |
                                                +-- missing/different --------> deploy
                                                                                then write sha256
```

```text
fresh manifest server-bundle.sha256
                 |
                 v
remote .asset-components/server-bundle.json
                 |
                 +-- equal + version/markers complete --> skip server
                 |
                 +-- missing/different ----------------> SHA-keyed cache
                                                         download + verify
                                                         install server
                                                         write current sha256
```

## Registro de Serviços

A coleção de hosts expostos ao renderer é mista:

- Proxy remoto: serviços de arquivo, git, sistema, terminal, file watcher, task/session/agent do
  ZCode, Provider Settings de escopo de workspace e Model Selection de escopo de workspace.
- Implementação local: settings globais do App desktop, integração de UI do OAuth, apresentação de
  uso/coding-plan e outros estados globais de janela.

Isso mantém fatos de workspace e de execução de modelo no Environment de destino, mantendo o estado
de UI global do App desktop local. A coleção mista não deve ser interpretada como um único processo
que possui todos os fatos: Provider Settings e Model Selection do runtime remoto são sempre
encaminhados a partir do Environment de destino. A página de Settings do Desktop é um editor local
global do App e, intencionalmente, não usa a facade de Provider Settings remota.

## Propriedade do Runtime de Providers

Cada Environment remoto possui seu próprio Provider Config, Credential Store, Registry e
ModelFactory. Seu Host e seu Core Worker constroem instâncias de Registry de forma independente a
partir das fontes desse Environment; eles não consomem um snapshot materializado do Registry do
Desktop.

```text
Desktop Entry
    |
    | remote Provider Settings / Model Selection / task commands
    v
Remote Environment
├─ ZCode Built-in + Personal + Account Provider Config
├─ Credential Store
├─ Host Registry
└─ Core Worker Registry -> ModelFactory -> model request
```

O Host remoto pode enviar seu próprio Account Provider Config Overlay sem segredos ao seu próprio
Core Worker via `provider/updateAccountConfig`. Isso é um limite de processo interno ao Environment,
e não uma sincronização de configuração do Desktop para o remoto. API keys, JWTs, chaves de runtime
de Team e headers dinâmicos não fazem parte desse Overlay.

O protocolo aposentado `workspace/updateProviderRegistry` deve permanecer indisponível. O Desktop não
injeta um Registry completo, Runtime Model, Account Overlay ou credencial de requisição em um Worker
remoto. Um runtime remoto que não está pronto aguarda sua própria inicialização de Provider Runtime;
ele não é inicializado a partir do estado do Desktop.

A sincronização de configuração ou de credenciais é uma funcionalidade separada de provisionamento.
O fluxo automático Local → Remote de nível de Environment está especificado em
`docs/remote/provider-provisioning.md`; ele escreve as stores de Config/Credential do Environment de
destino e deixa que esse Environment reconstrua seu Registry. O Desktop Main apenas coordena a
identidade e as generations do Environment; ele nunca transporta Config ou Secret. Esse fluxo não
deve ressuscitar a injeção de Registry em runtime.

Esse limite de propriedade não altera as semânticas de entrega de tarefas `continuous` do desktop nem
`replayable` da Web mobile. O isolamento de identidade de workspace continua usando
`workspaceIdentity?.trim() || workspacePath`; as operações de sistema de arquivos continuam usando
`workspacePath`.

## Modos de Implantação

O Desktop pode baixar os artefatos de componente localmente e enviá-los por SSH, ou pedir ao servidor
remoto que baixe da CDN.

Os comandos de implantação remota exigem um `sh` POSIX; eles não podem assumir que `bash` está
instalado. Isso mantém alvos Docker/SSH baseados em Alpine ou BusyBox suportados. O detentor do lock
de implantação é escrito em um script remoto temporário e executado por `sh`, enquanto o caminho de
SSH do Desktop já serializado pelo chamador continua pulando o lock remoto como documentado abaixo.

No modo local-download-upload, os arquivos no Docker são escritos pelo usuário atual do container
(`docker exec` + stdin), e não por `docker cp`. Isso preserva o owner necessário para os comandos
posteriores de `chmod`/substituição quando o container roda como usuário não-root. Substituições de
arquivo falhas e não canceladas devem remover apenas seu próprio caminho temporário `.new-*`; o
cancelamento não pode reutilizar um backend já liberado.

O preparo dos assets de build remotos precisa fornecer um SHA-256 para cada arquivo pré-compilado,
incluindo o release legado do ripgrep para Darwin. Um digest ausente é um erro de preparo e precisa
falhar antes de qualquer download de rede.

### Política de rede do lado desktop

Todas as requisições HTTP(S) emitidas pelo Desktop Window Host ao resolver assets remotos precisam
usar o mesmo transporte de rede imutável do Host que as requisições de API gerenciadas pelo App. Isso
inclui leituras do manifesto novo, downloads de arquivos de componente e a requisição `HEAD` opcional
usada para estimar o progresso do download remoto.

- `AppSettings.httpProxy`, `httpProxyNoProxy` e `httpProxyCaCertPath` permanecem como a única
  autoridade do Desktop para esse transporte. Variáveis de proxy e CA do shell ambiente não são uma
  fonte implícita.
- Uma falha explícita de proxy ou de CA é fail-closed para requisições obrigatórias de manifesto e
  de componente; elas não devem tentar novamente por `globalThis.fetch`. O `HEAD` opcional de
  progresso do download remoto mantém seu comportamento de falha best-effort atual, mas não pode
  recorrer a uma requisição direta.
- Requisições de assets remotos reutilizam o snapshot de ciclo de vida e o pool de dispatchers
  pertencentes à coleção de serviços locais base do Window Host. Elas não podem criar uma fonte
  extra de política de proxy específica para download nem um pool de dispatchers extra; as coleções
  de serviços remotos anexados ao desktop existentes mantêm sua propriedade de transporte de API
  inalterada.
- Chamadores de servidor standalone que não recebem o transporte pertencente ao Desktop mantêm seu
  comportamento direto atual.
- No modo `remote-download`, apenas as requisições de manifesto e de metadados de progresso do lado
  desktop usam essa política. O arquivo de componente em si continua sendo baixado pelo `curl` ou
  `wget` da máquina remota e, portanto, segue a configuração de rede da máquina remota.

```text
setting.json
  httpProxy / noProxy / CA
            |
            v
Window Host base-service network transport (lifecycle snapshot)
       |                         |
       v                         v
NodeApiClient             RemoteAssetNetworkPort
                              |        |
                              v        v
                         manifest   archive / HEAD
                              |
                              v
                    local cache -> SSH upload
```

## Serialização da Implantação

Os workspaces SSH do Desktop reutilizam um host SSH compartilhado por janela e por alvo SSH. A
promise de prontidão do host compartilhado serializa a conexão inicial e a implantação, portanto o
caminho `InitRemoteSshHost` precisa declarar serialização do lado do chamador e pular o lock de
implantação da install-root remota. Isso evita manter um canal dedicado de detentor do lock SSH vivo
após a implantação. Caminhos de runtime SSH dedicados não compartilham esse limite de prontidão e
continuam usando o lock remoto.

Essa exceção aceita a restrição de produto de que o desktop tem uma janela e de que múltiplos
clientes não implantam na mesma install-root SSH. Ela também aceita o risco residual de que um
comando remoto de uma implantação SSH desconectada possa sobrepor-se brevemente ao próximo
reconexão.

A implantação em WSL e Docker continua usando o lock da install-root remota. Chamadores que não
declaram explicitamente a serialização do lado do chamador também passam a usar o lock remoto por
padrão, incluindo a API de conexão do servidor Web standalone.

```text
Desktop SSH target
        |
        v
window-scoped shared SSH host readiness
        |
        v
single deployServer transaction ----------> no remote deploy lock

WSL / Docker / unspecified caller
        |
        v
remote install-root deploy lock ----------> deployServer transaction
```

O modo local-download-upload usa o runtime Node do host desktop para criar e extrair arquivos `.tar.gz`
locais. Ele não pode depender de um binário `tar` do sistema local, porque clientes Windows podem não
expor `C:\Windows\System32\tar.exe` ao processo host do Electron.

O modo de download pelo servidor remoto requer:

- `curl` ou `wget`
- `tar`
- `sha256sum`, `shasum` ou `openssl`

Os artefatos de componente baixados são verificados pelo `sha256` do manifesto antes da instalação.
Para `glm` e `server-bundle`, os caminhos locais e remotos de cache de componentes também incluem
esse SHA, de modo que uma implantação disparada por hash não copie acidentalmente bytes cacheados sob
um artefato mais antigo com a mesma versão semântica. Outras semânticas de chave de cache de
componentes permanecem inalteradas.

## Compatibilidade de Pacotes de Recursos

`SSHConnectOptions.resourcePackages.selectedPackageIds` ainda é aceito como entrada histórica, mas as
conexões atuais ignoram escolhas de pacotes aposentados e usam o conjunto padrão de recursos do
ZCode. O runtime remoto em Linux inclui `bfs`, `ripgrep` e `ugrep`; o remoto em Darwin implanta
apenas seu componente `ripgrep` suportado. Configurações antigas não podem desabilitar ferramentas de
runtime ativas nem reabilitar runtimes de agentes de terceiros.

## Arquivos-Chave

- `packages/server/src/remote/deploy.ts`
- `packages/server/src/remote/zcodeAgentDeploy.ts`
- `packages/server/src/remote/runtimeToolDeploy.ts`
- `packages/shared/src/zcode-agent-runtime.ts`
- `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`
- `docs/ssh-remote-app-global-state-authority.md`