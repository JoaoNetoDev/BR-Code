# Desktop CI/CD

O ponto de entrada de CI/CD desktop do `z-code` é o `.gitlab-ci.yml` na raiz, com os jobs específicos separados por responsabilidade em `.gitlab/ci/*.yml`. O lançamento oficial acontece no pipeline de tag comum com `approve -> validate -> upload -> preload -> publish -> release-notify`. O log de lançamento é editado diretamente pela infra API no `latest.yml` do diretório compartilhado do runner; o CI do z-code, após confirmação manual e antes do upload, valida de forma unificada seis plataformas e os remote assets, envia apenas artefatos estáticos versionados, não lê o changelog do repositório, não gera uma lista independente de locales e não sobrescreve o antigo generic stable feed do CDN.

## Estrutura dos arquivos de configuração

- `.gitlab-ci.yml`: mantém apenas o ponto de entrada de include local, carregando os fragmentos de CI em ordem.
- `.gitlab/ci/00-workflow.yml`: `workflow.rules`, `stages` e variáveis globais. O cache de dependências Node não usa mais o template de cache do GitLab, dependendo uniformemente da persistência de workspace com exclusões de `GIT_CLEAN_FLAGS` (a estratégia e os guardas anti-regressão estão em `docs/ci-cache-strategy.md`).
- `.gitlab/ci/10-scripts.yml`: fragmentos de script de setup, guard e manutenção de store reutilizados entre jobs. Como arquivos de include do GitLab não podem compartilhar âncoras YAML, aqui se usa `!reference` para reutilizar os scripts, evitando alterar o conteúdo de execução por causa da divisão.
- `.gitlab/ci/20-test.yml`: job de E2E manual de conversation-session (macOS compartilhado, quatro shards no Windows, instância única em macOS Runner dedicado), além dos jobs de lint/typecheck/test unit no Windows.
- `.gitlab/ci/30-build.yml`: job de build do app desktop independente de plataforma, jobs de empacotamento macOS/Windows/Linux e job de build de remote assets. O job de empacotamento macOS conclui a notarização do DMG logo após a coleta dos artefatos.
- `.gitlab/ci/40-notarize-notify.yml`: notificação de artefatos de build.
- `.gitlab/ci/50-release.yml`: approve manual, geração de metadados de lançamento, upload para OSS, pré-aquecimento de CDN, publicação oficial e notificação de sucesso do lançamento.
- `.gitlab/ci/preview-child.yml`: subpipeline interno de pacote de teste disparado pelo comando manual `build:preview` em MRs; reutiliza apenas workflow, scripts, build e notify, sem carregar test/release.

O CI desktop não hospeda a implantação dos recursos estáticos de controle remoto; as páginas móveis de teste e de produção são publicadas por pipelines OSS de múltiplas versões independentes, veja [Remote v4 静态部署](./web-remote-control/remote-v4-static-deployment.md).

## Estágios do pipeline

- `test`: executa `pnpm lint`, `pnpm typecheck` e `pnpm test:unit` no Windows
- `build-app`: `build:desktop:app` constrói `packages/desktop/out/` independente de plataforma e, via `needs` do DAG, aguarda apenas a confirmação manual do MR; o E2E de conversa oferece no estágio `approve-mr` três entradas manuais opcionais — macOS compartilhado, Windows e macOS Runner dedicado — e falhas não bloqueiam o agendamento dos jobs de build seguintes.
- `build`: runners macOS / Windows / Linux são responsáveis pelos runtime assets, assinatura e geração de instaladores da sua plataforma; o empacotamento oficial executa apenas preparação de assets, validação estática e construção de artefatos, sem rodar `test:native-search:e2e`, `test:sea-runtime-tools:e2e` ou outros E2E comportamentais — esses comandos permanecem como entradas de verificação independentes; `build:cua-helper:arm64` e `build:cua-helper:x64` rodam automaticamente em todos os pipelines aceitos pelo workflow, e o job macOS da mesma arquitetura espera e consome o artefato Helper deste pipeline; o job macOS executa a notarização do DMG logo após coletar os artefatos; Windows e Linux constroem em dois jobs paralelos, x64 / arm64, e o Linux ainda produz três formatos de instalador (AppImage, deb, rpm); há também o `build:remote:assets` independente, responsável apenas pelo descriptor do Source Server e pelos archives das quatro plataformas.
- `notify`: envia ao Feishu as notificações de artefatos por plataforma quando o build tem sucesso; a notificação de macOS depende do `build:macos:*` correspondente, portanto só aparece depois que o empacotamento e a notarização daquela arquitetura foram bem-sucedidos. Cada plataforma tem ainda um Job de notificação de falha, que envia o mesmo resumo com o endereço do Job do GitLab anexado, sem exibir endereços de download.
- `approve`: barreira manual que aparece depois que todos os builds terminaram e a infra editou os logs das seis plataformas; após a confirmação manual, entra automaticamente na verificação de integridade
- `validate`: após o approve, valida automaticamente a versão, o log, os arquivos referenciados e size/sha512 dos `latest.yml` das seis plataformas, além da versão, dos quatro targets, do nome de arquivo, size/sha256, da URL relativa e do `zcode-server-*.tar.gz` real do `source-server-release.json` na raiz da versão; `manifest-*.json` / `components/` remanescentes da época da linha de base ou archives não referenciados pelo descriptor falham diretamente; o upload só pode rodar após o sucesso deste estágio
- `upload`: envia ao OSS as builds versionadas de macOS / Windows / Linux incluídas no lançamento oficial, além do descriptor/archive do Source Server; artefatos Electron são gravados em `<version>/<platform>-<arch>/`, por exemplo `v3.3.3/macos-arm64/`; este estágio resolve os metadados de atualização, gera `release-meta-*.json`, mas não sobrescreve o stable feed.
- `preload`: `release:preload:cdn` pré-aquece automaticamente os artefatos versionados por plataforma/arquitetura e o descriptor/archive do Source Server após o sucesso do upload; este estágio precisa ser bem-sucedido antes de permitir o publish, evitando que, depois de publicar o manifest no servidor, o cliente baixe um instalador ou blockmap ainda não pré-aquecido.
- `publish`: `release:publish:gray` roda automaticamente após o sucesso do pré-aquecimento. O job chama primeiro diretamente a interface de controle de rollout da API do backend `https://zcode-api.z.ai/api-admin/v1/releases/gray` (pode ser sobrescrita por `ROLLOUT_API_URL` ou `ZCODE_RELEASE_GRAY_API_URL`) enviando `Authorization: Bearer $ROLLOUT_ADMIN_TOKEN`, e redefine o switch de rollout como desligado com proporção zerada; só depois de o reset bem-sucedido chama a release API do backend para gravar `status=3`, evitando que a nova versão herde a política de rollout da rodada anterior. `release:publish:stable` fica no mesmo estágio e, via `needs`, espera o gray; quando acionado manualmente, reutiliza o mesmo lote de `release-meta-*.json` para gravar `status=1`; branches `ci*` só permitem por padrão a verificação automática até o gray, e o script impede que elas gravem o status stable oficial por padrão.
- `release-notify`: lê manualmente o `releaseNotes` editado pela infra em `macos-arm64/latest.yml` no diretório compartilhado e envia a notificação de sucesso de lançamento no Feishu

O build desktop Linux e o `notify:feishu:linux:*` já estão habilitados; nas tags oficiais, macOS, Windows e Linux x64/arm64 entram na cadeia principal de upload, preload e publish. A cadeia de verificação sandbox/test-tag mantém o escopo de upload atual de macOS arm64. O runtime remoto é produzido de forma unificada por `build:remote:assets` como descriptor/archive.

## Nomenclatura dos jobs de release

| job                                  | Gatilho                       | Responsabilidade                                                                                                                                |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `release:approve`                    | manual após todos os builds    | Confirmar que a infra concluiu a edição dos logs das seis plataformas e liberar a verificação de integridade                                          |
| `release:validate`                   | automático após approve       | Validar instaladores, manifest de atualização, logs e descriptor/archive do Source Server das seis plataformas no diretório compartilhado; em caso de falha o upload não abre  |
| `release:upload:<platform>:<arch>`   | automático                     | Enviar instaladores versionados e o descriptor/archive do Source Server, gerando `release-meta-*.json` e a lista versionada de pré-aquecimento do CDN                         |
| `release:upload:sandbox:macos:arm64` | roda automático no pipeline manual sandbox | Validar a cadeia de upload do sandbox sem tocar o caminho de lançamento oficial                                                    |
| `release:preload:cdn`                | automático após approve       | Pré-aquecer instaladores por plataforma/arquitetura, manifest de atualização, blockmap e URLs de CDN do Source Server                           |
| `release:preload:cdn:sandbox`        | manual                        | Pré-aquecer as URLs de CDN dos artefatos versionados do sandbox                                                                                 |
| `release:publish:gray`               | automático após approve       | Após o sucesso de `release:preload:cdn`, desligar primeiro o switch de rollout e zerar a proporção para `0`, e só então chamar a release API do backend para publicar o estado gray `status=3` |
| `release:publish:stable`             | manual após confirmação gray  | Reutilizar os metadados de upload para chamar a release API do backend e publicar o estado completo `status=1`, sem enviar o stable feed; branches `ci*` são bloqueados por padrão pelo script, evitando que pacotes de verificação virem stable oficial |
| `release:notify:feishu`              | manual                        | Enviar a notificação oficial de lançamento no Feishu                                                                                             |

## Nomenclatura dos jobs manuais de MR

| job                                          | Gatilho         | Responsabilidade                                                                                                                            |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `approve:merge-request`                      | manual, blocking | Liberar o DAG do pacote de aceitação de production do MR atual                                                                            |
| `build:preview`                              | manual, optional | Iniciar o Preview child pipeline do mesmo commit do MR; não herda as variáveis padrão do parent, apenas repassa explicitamente as variáveis de controle do Preview, fixa `ZCODE_ENV=test` e não bloqueia o DAG do pacote de aceitação de production |
| `test:e2e:conversation-session:auto`         | manual, optional | Executar em um único job, no Runner compartilhado `macos + e2e`, o conjunto oficial de replay de conversation/plugin/workspace-file-tree                    |
| `test:e2e:conversation-session:auto:windows` | manual, optional | Gerar quatro shards WDIO nativos e agendá-los no pool de Runners `windows-e2e + e2e`                                                         |
| `test:e2e:conversation-session:auto:mac`     | manual, optional | Gerar apenas um job e agendá-lo em um Runner darwin/arm64 com tag dedicada                                                                  |

## Comparação da cadeia de lançamento antes e depois da mudança

| Etapa                    | Antes                                                                                            | Depois                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| update metadata         | Build e injeção de log aconteciam no mesmo estágio, e alterar o log podia exigir reempacotamento   | O build só produz o `latest.yml` básico, a infra edita o log no diretório compartilhado e o validate verifica após o approve, sem gerar arquivo de locale separado |
| `upload`                | Ao enviar artefatos versionados, o stable feed era sobrescrito e o cliente podia ver um novo `latest*.yml` antes da release API do backend | Envia apenas artefatos versionados e o descriptor/archive do Source Server, produzindo só `release-meta-*.json` e URLs versionadas de pré-aquecimento, sem sobrescrever o stable feed |
| `release:preload:cdn`   | Pré-aquecedor artefatos versionados após o upload, e os jobs de publicação seguintes precisavam esperar | Estágio `preload` independente; após o approve e o sucesso do upload, pré-aquece artefatos por plataforma/arquitetura e só permite o publish depois do sucesso |
| `release:publish:*`     | Podia entrar automaticamente ou seguir estágios anteriores; a responsabilidade de sobrescrever o stable feed era indefinida | Tanto o rollout gray quanto o completo chamam apenas a release API do backend, e a visibilidade stable/preview passa a ser controlada pelo manifest do servidor, sem envio de stable feed |
| `release-notify`        | Podia notificar automaticamente após o publish                                                     | Há um job de notificação manual após o sucesso do publish completo                                                          |
| Notarização macOS e notificação de artefatos | `notarize:macos:*` era um estágio/job independente de notarização, que enviava a notificação de artefatos macOS no after_script | `build:macos:*` conclui assinatura, coleta e notarização na fase de build; `notify:feishu:macos:*` envia a notificação de artefatos macOS separadamente na fase de notify |

## Regras de disparo

- tag (sem `test`): lançamento oficial, com diretório de artefatos `release/$CI_COMMIT_TAG/`
- tag (com `test`, sem distinção de maiúsculas): alterna automaticamente para `SANDBOX_RELEASE=1`, e o caminho de upload passa a ser `OSS_PATH_PREFIX_SANDBOX/$CI_COMMIT_REF_SLUG`, usado para validar o pipeline de CI/CD sem poluir o feed de atualização oficial
- push em branches `ci*`: ponto de entrada de verificação da cadeia real de release fora de tag, com diretório de artefatos `@electron/ci/$CI_COMMIT_REF_SLUG/` e caminho de upload `OSS_PATH_PREFIX_SANDBOX/$CI_COMMIT_REF_SLUG`; após o `release:approve` liberar, executa automaticamente validate, upload, preload e o publish gray, enquanto o stable promote / release-notify são manuais. Por padrão `ci*` não pode publicar pacotes de verificação como `status=1` oficial; apenas com aprovação explícita do responsável pelo lançamento é possível definir temporariamente `ALLOW_CI_RELEASE_STABLE_PUBLISH=1`.
- Merge Request para `main` / `staging`: por padrão verificação de empacotamento de production, com diretório de artefatos `@electron/dev/$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME/`
- Merge Request para `main` / `staging`: o estágio `approve-mr` exibe adicionalmente `build:preview`; se não for clicado, não bloqueia o pipeline de MR existente e, se clicado, inicia um subpipeline com o mesmo ref/SHA do MR, com diretório de artefatos Preview `@electron-preview/$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME/`
- MR, GitLab Run pipeline, Pipeline Trigger API ou pipeline de API comum passando explicitamente `ZCODE_ENV=test`: também alterna para `@electron-preview/<branch>/` já na criação do job graph pelo workflow; sem o valor ou com `production`, continua gravando em `@electron/dev/<branch>/`. Os caminhos de verificação de publicação por tag e `ci/*` permanecem inalterados.
- MRs cujo branch de origem seja `staging` ou `chore/ci`: permitido rodar CI
- Disparo manual pela GitLab Web UI / Pipeline Trigger API / API comum: o diretório de artefatos de production é `@electron/dev/$CI_COMMIT_REF_NAME/`, e com `ZCODE_ENV=test` explícito usa o caminho Preview. A Trigger API pode receber `ZCODE_BUILD_PLATFORMS=macos-arm64,windows-x64` para打包 automático apenas das plataformas indicadas; plataformas não selecionadas mantêm o job manual não bloqueante.
- Os jobs de-duas-arquiteturas do CUA Helper seguem as mesmas regras de seleção da plataforma macOS correspondente; sem `ZCODE_BUILD_PLATFORMS`, as duas arquiteturas rodam automaticamente e, com a lista informada, as arquiteturas não selecionadas mantêm entradas manuais não bloqueantes.
- Pipelines disparados manualmente por MR e pela GitLab Web UI exibem três entradas manuais opcionais de E2E: `test:e2e:conversation-session:auto`, `test:e2e:conversation-session:auto:windows` e `test:e2e:conversation-session:auto:mac`; não clicar nelas, ou elas falharem, não bloqueia `build:*`. As cadeias de verificação de release por tag e `ci*` não criam esses jobs.

Relação de sharding e agendamento do Runner macOS dedicado:

```text
manual test:e2e:conversation-session:auto:mac
  `-- one GitLab job --> tags: <tag do runner macOS dedicado> --> one dedicated shell runner instance
```

Cadeia manual do Preview:

```text
MR parent pipeline
  `-- build:preview [manual, optional]
        +-- inherit parent default variables: false
        +-- forward: ZCODE_PREVIEW_PIPELINE / ZCODE_ENV / TARGET_OUTPUT_DIR
        `-- child pipeline [same MR ref/SHA, ZCODE_ENV=test]
              +-- resolve temp/cache paths from child runner CI_PROJECT_DIR
              +-- desktop app + macOS/Windows/Linux + Computer Use Helper + remote assets
              +-- artifact notifications
              `-- no tests / Web remote deployment / upload / publish / release
```

## Fluxo fixo dos pacotes de teste do Computer Use Helper

Pacotes de teste relacionados a CUA / broker / permission obrigatoriamente passam por branches `ci*` ou por tags com `test`, com os artefatos em
`/zcode/@electron/ci/<test-build-name>/` ou no caminho sandbox, nunca em
`/zcode/@electron/release/`. `release/` é exclusivo para diretórios de versão oficiais.

Recomenda-se priorizar branches `ci*` para validar a cadeia de producer, porque não exigem criar tag e ainda assim rodam assinatura real,
notarização, staple e sincronização do diretório compartilhado:

```bash
VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
CI_BRANCH="ci/cua-helper-${VERSION}-${STAMP}"

git push origin HEAD:refs/heads/${CI_BRANCH}
glab ci list --ref "${CI_BRANCH}" --sha "$(git rev-parse HEAD)"
```

Aguardar o sucesso destes jobs no mesmo pipeline:

- `build:desktop:app`
- `build:macos:arm64`
- `build:macos:x64`
- `build:cua-helper:arm64`
- `build:cua-helper:x64`

Os dois jobs `build:cua-helper:*` são agendados automaticamente junto com o DAG de build e não precisam ser acionados um a um na UI do GitLab. Falha no build do Helper faz o pipeline falhar pela semântica normal de job de build, evitando que o pacote de aceitação macOS se torne entregável sem um Helper do mesmo pipeline.

O `build:macos:<arch>` depende via `needs` (`optional`) do artefato `build:cua-helper:<arch>` da mesma arquitetura. A verificação de artefatos de release strict
(`scripts/notarize-macos.sh` → `doctor-macos-release-app.sh`, com `ZCODE_CUA_REQUIRE_HELPER=1`)
localiza o `ZCode.app/Contents/Resources/cua-helper/ZCode Computer Use.app` final e define
`ZCODE_CUA_HELPER_APP_PATH`, portanto valida a cópia embutida entregue de fato no DMG, e não um artefato intermediário nem o estado residual de `${ZCODE_HOME:-$HOME/.zcode}` no runner. Helper ausente no pacote causa falha fechada.

Após o sucesso, as entradas fixas de download são as seguintes, onde `<slug>` é o `$CI_COMMIT_REF_SLUG` do GitLab:

```text
http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/macos-arm64/ZCode-<version>-mac-arm64.dmg
http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/macos-arm64/ZCode-<version>-mac-arm64.zip
http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/macos-x64/ZCode-<version>-mac-x64.zip
http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/macos-x64/ZCode-<version>-mac-x64.zip

http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/pipeline-<pipeline-id>/cua-helper-macos-arm64/ZCode-CUA-Helper-<version>-mac-arm64.zip
http://intranet.example.invalid:12345/zcode/@electron/ci/<slug>/pipeline-<pipeline-id>/cua-helper-macos-x64/ZCode-CUA-Helper-<version>-mac-x64.zip

（`pipeline-<pipeline-id>` 是候选 Helper 的隔离目录；Helper plist 的
`ZCODECUAHelperBuildId` 形如 `pipeline-<pipeline-id>-<short-sha>`，按 build id
中的 pipeline id 定位下载目录。）
```

Os jobs do Helper também sincronizam a URL de dependência padrão, amigável ao resolver:

```text
http://intranet.example.invalid:12345/zcode/deps/zcode-cua-helper-<version>/ZCode-CUA-Helper-<version>-mac-arm64.zip
http://intranet.example.invalid:12345/zcode/deps/zcode-cua-helper-<version>/ZCode-CUA-Helper-<version>-mac-x64.zip
```

Registre o SHA-256 de todos os pacotes que serão entregues aos testadores:

```bash
shasum -a 256 ZCode-<version>-mac-arm64.zip \
  ZCode-CUA-Helper-<version>-mac-arm64.zip
```

Evidência mínima de producer antes de enviar o pacote:

```bash
glab api 'projects/:fullpath/pipelines/<pipeline-id>/jobs?per_page=100' \
  | jq -r '.[] | select(.name=="build:macos:arm64" or .name=="build:macos:x64" or .name=="build:cua-helper:arm64" or .name=="build:cua-helper:x64") | [.id,.name,.status,.web_url] | @tsv'

glab api 'projects/:fullpath/jobs/<helper-job-id>/trace' \
  | rg 'provenance ok|notary result: status=Accepted|staple and validate action worked|Job succeeded'
```

Para validação de CUA com qualidade de release, não pare na produção do pacote. Instale o
Helper standalone em `${ZCODE_HOME:-$HOME/.zcode}/computer-use/ZCode Computer Use.app`,
inicie o ZCode.app correspondente e execute os gates de consumidor do zcode-cua. Sockets de
broker do produto são gerados como arquivos aleatórios `broker-<hex>.sock`; não fixe
`broker.sock` em novos scripts de validação.

## Restrições dos Runners

- `build:desktop:app` precisa de um shell runner com a tag `macos`, produzindo os artefatos `packages/desktop/out/` para reutilização pelos jobs de empacotamento por plataforma
- `test:e2e:conversation-session:auto` precisa de um shell runner com a tag `macos`, usando replay de fixtures comum, sem acessar o modelo real do upstream e sem subir Docker; por padrão roda apenas o subconjunto estável de replay de conversa, e cases longos de stop/compact com fila retida precisam ser estabilizados em replay separado antes de entrar no gate automático.
- `test:e2e:conversation-session:auto:windows` precisa de um pool de runners PowerShell com as tags `windows-e2e` e `e2e`, e usa `parallel: 4` para dividir o mesmo conjunto oficial de replay em quatro shards WDIO nativos.
- `test:e2e:conversation-session:auto:mac` casa apenas com a tag do Runner macOS dedicado (o nome da tag está em `.gitlab/ci/20-test.yml`), reutiliza o contrato de replay Bash do macOS e gera um único job; ele não cai no Runner `macos` compartilhado nem participa de jobs de build/publicação.
- `build:macos:*` precisa de um shell runner Apple Silicon com a tag `macos`, com Node.js, corepack, pnpm, Xcode Command Line Tools, `make` / `curl` / `tar` do sistema e Rosetta 2 pré-instalados; os jobs arm64/x64 normalmente baixam o sidecar pré-compilado de native-search correspondente, e pipelines confiáveis só reutilizam a compilação local no próprio runner e publicam `bfs` / `ugrep` quando o deps compartilhado não tem o arquivo auto-produzido. O sidecar auto-produzido fixa `MACOSX_DEPLOYMENT_TARGET=12.0`; o Microsoft rg pode usar um deployment target menor, mas nenhum sidecar pode ser superior a 12.0; após a verificação de dependências Mach-O, assinatura, empacotamento e notarização do DMG são concluídos separadamente
- `build:remote:assets` também roda no runner `macos`; seus artefatos são gravados no diretório compartilhado para reutilização por `release:upload:macos:arm64`
- `build:linux:x64` / `build:linux:arm64` exigem, respectivamente, runners nativos com as tags `linux` + `linux-x64` e `linux` +
  `linux-arm64` (comumente Docker); a imagem precisa rodar as dependências de empacotamento Electron e o
  verificador de native-search. Quando os deps compartilhados já têm arquivo, apenas baixa os binários pré-compilados e não exige Cargo; quando falta o arquivo auto-produzido e a produção extra é permitida, é obrigatório rodar de fato Node 24, glibc 2.28, GCC 12 e G++ 12, além de fornecer binutils, `make`, `curl` e `tar`. O `rg` das duas arquiteturas Linux é um artefato estático musl da Microsoft, e os demais sidecars são construídos pelo producer da arquitetura correspondente, sem fixar nomes de imagem adicionais; mas a maior symbol version de GLIBC do ELF final não pode exceder 2.28. Aqui `x64` significa `x86_64` / `amd64`. O alvo rpm é produzido pelo fpm chamando o `rpmbuild` do sistema (o binário pré-compilado do fpm não o inclui), e a compressão xz padrão do rpm também depende do `xz` do sistema; o job instala como fallback ambos (`rpm` + `xz-utils`), sendo recomendável pré-instalá-los na imagem para evitar instalação no local a cada empacotamento.
- `build:windows:x64` / `build:windows:arm64` precisam de runners com a tag `windows`, com Node.js, Python 3.10+ e Visual Studio Build Tools 2022 (incluindo `VC.Tools.x86.x64`) pré-instalados; hoje o runner Windows x64 gera de forma cruzada os instaladores Electron/NSIS arm64. O job arm64 recompila o addon nativo CUA para a arquitetura alvo e portanto **sempre** exige o componente `VC.Tools.ARM64` do VS 2022 (não mais só no branch de produção extra do `ugrep`). Quando os deps compartilhados não têm o arquivo `ugrep` correspondente e a produção extra é permitida, o runner também precisa fornecer CMake, `curl` e `tar`; o caminho normal de empacotamento que já tem arquivo não exige esses comandos de producer de native-search por causa desse branch de cold start.
- Antes do empacotamento no Windows são executados `scripts/ci-ensure-node-gyp-python.ps1` e `scripts/ci-import-vcvars64.ps1`, garantindo que o ambiente de compilação de `node-gyp` / `electron-rebuild` esteja completo

Os jobs oficiais de empacotamento das três plataformas não podem chamar E2E comportamental de runtime. O E2E de Bash toolcall do native-search e o E2E de runtime-tools SEA de arquivo único continuam como comandos de teste independentes; o SEA valida apenas a entrega de CLI em arquivo único, não sendo pré-requisito do empacotamento Electron desktop.

Os jobs de empacotamento das três plataformas executam `ci:ensure-native-search-deps` antes de `prepare:desktop-runtime` e definem explicitamente `ZCODE_NATIVE_SEARCH_ALLOW_PUBLISH=1` como a entrada de escrita autorizada no deps compartilhado. A etapa verifica diretamente `deps/native-search-tools` na raiz compartilhada: falha imediatamente se o `rg` da Microsoft estiver ausente; se o `bfs` / `ugrep` auto-produzidos estiverem ausentes, constrói e publica no runner da plataforma atual. Jobs com o mesmo `platform-arch` são serializados entre pipelines via `resource_group`. Todos os arquivos de producer precisam ter SHA-256 configurado e passar na verificação antes da publicação, do prepare HTTP e da extração; checksum ausente ou divergente causa falha imediata. Após a publicação, o caminho oficial de prepare HTTP baixa, extrai e verifica novamente, sem consumir diretamente o diretório temporário do job. O script em si mantém a negação por padrão, de modo que entradas locais ou de outro CI não publiquem automaticamente por falta de arquivo.

### Raiz compartilhada de artefatos (macOS / Linux / upload)

- **shell macOS / leitura de `build:remote:assets` / upload**:
  padrão **`ZCODE_CI_SHARED_ROOT=/Users/dev/shared/zcode`**, com caminho completo
  **`${ZCODE_CI_SHARED_ROOT}/${TARGET_OUTPUT_DIR}`**
  por exemplo: `/Users/dev/shared/zcode/@electron/dev/my-branch/`. Instaladores macOS são gravados apenas em **`macos-arm64/`** e **`macos-x64/`**; a raiz guarda somente o descriptor/archive do Source Server, enviados junto pelo job de upload macOS arm64 através de um diretório de origem adicional.
- **Docker Linux**
  Alinhado à configuração comum de runner **`volumes = ["/Users/dev/shared/zcode:/output", ...]`**: dentro do contêiner grava-se
  **`${ZCODE_CI_LINUX_CONTAINER_OUT}/${TARGET_OUTPUT_DIR}`** (padrão **`ZCODE_CI_LINUX_CONTAINER_OUT=/output`**), ou seja, no host **`/Users/dev/shared/zcode/${TARGET_OUTPUT_DIR}`**.
  Se o ponto de montagem não for `/output`, pode sobrescrever **`ZCODE_CI_LINUX_CONTAINER_OUT`** nas variáveis do GitLab CI/CD, ou sobrescrever apenas a raiz de coleta com **`LINUX_SHARED_OUTPUT_ROOT`**. As builds paralelas x64/arm64 gravam primeiro no diretório temporário `.tmp/linux-<arch>-collect` do workspace do job atual e só depois sincronizam para os subdiretórios isolados por arquitetura **`linux-x64/`** e **`linux-arm64/`**; o upload oficial lê apenas o subdiretório correspondente, evitando que os `latest.yml` das duas arquitecturas, após nomenclatura unificada, sobrescrevam um ao outro e cruzem arquiteturas nos metadados de publicação ou no feed de atualização.
- **Windows**
  padrão **`ZCODE_CI_WINDOWS_SHARED_ROOT=//172.16.0.10/shared/zcode`**, com a mesma regra de concatenação do mac. As builds paralelas x64/arm64 gravam primeiro no diretório temporário `.tmp/windows-<arch>-collect` do workspace do job atual e só depois sincronizam para os subdiretórios isolados **`windows-x64/`** e **`windows-arm64/`**; o upload oficial lê apenas o subdiretório correspondente, evitando cruzamento de arquiteturas.
- Todas essas variáveis podem ser sobrescritas por ambiente nas **variáveis CI/CD** do GitLab.

## Formatos de instalador Linux e baseline de glibc

O empacotamento Linux produz três formatos de instalador (`AppImage`, `deb`, `rpm`) nas duas arquiteturas x64 / arm64. O `packageName` de `deb` e `rpm` é separado por flavor (`zcode` / `zcode-preview`), evitando que o gerenciador de pacotes do sistema trate a instalação de um flavor como substituição/atualização do outro. `latest.yml` e o electron-updater no Linux fixam AppImage como artefato de atualização; `deb` / `rpm` servem apenas para a distribuição da primeira instalação e não participam da auto-atualização; o `upload-oss.sh` também força, ao resolver os metadados de atualização, que o artefato de atualização seja AppImage.

O rpm tem como baseline RHEL 8+ (glibc 2.28). O limite de glibc do pacote inteiro foi medido pelas symbol versions `GLIBC_*` do ELF: o prebuild de node-pty incluído e o `bfs` / `ugrep` são 2.28, o binário principal do Electron 41 é 2.25, o `rg` é musl estático sem dependência de glibc, dando floor = 2.28; Ubuntu 20.04+, Debian 10+, RHEL 8+/9 atendem, enquanto CentOS 7, Ubuntu 18.04 e Amazon Linux 2 estão fora do suporte. O nome de arquivo do artefato rpm reaproveita o template único `artifactName`; o electron-builder usa o nome de arquitetura do gerenciador de pacotes (x86_64 / amd64 / aarch64) ao gravar rpm/deb, e o flavor Preview recebe o sufixo `_TEST`; o estágio de coleta `ci-collect-artifacts` normaliza tudo para `-linux-x64` / `-linux-arm64` (independente da extensão, valendo também para `.rpm`), e o `upload-oss.sh` coleta pelo nome normalizado, com os patterns de extensão já incluindo `.rpm`.

O Requires do rpm, além do conjunto padrão do electron-builder (gtk3, nss, libnotify, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid), acrescenta `mesa-libgbm` e `alsa-lib` via `rpm.fpm`: essas duas bibliotecas são dependências DT_NEEDED reais do ELF do Electron mas não estão no conjunto padrão, e em um RHEL mínimo a instalação falha ao iniciar por falta de `libgbm.so.1` (medido em contêiner rockylinux:8); é preciso usar `-d` do fpm em vez de `depends`, que substituiria o Requires padrão inteiro. A cadeia de smoke com rockylinux:8 foi concluída: metadados rpm (nome de pacote por flavor / mapeamento de arch `x86_64`), instalação com resolução de dependências via dnf, execução sem display com `ELECTRON_RUN_AS_NODE`, execução do `bfs` / `ugrep` / `rg` inclusions, varredura completa de GLIBC nos ELFs da árvore instalada (max = 2.28) — tudo aprovado.

## Variáveis CI principais

- `TARGET_OUTPUT_DIR`: caminho relativo, dentro do diretório compartilhado, em que o pipeline atual grava; calculado de forma unificada por `workflow.rules`
  - MR/Preview child com `ZCODE_ENV=test`: `@electron-preview/$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME/`
  - web/API/trigger com `ZCODE_ENV=test`: `@electron-preview/$CI_COMMIT_REF_NAME/`
  - MR/web/API/trigger em production: `@electron/dev/<branch>/`
- `ZCODE_CI_TMPDIR` / `NPM_CONFIG_CACHE` / `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE`: referenciam caminhos locais ao job do checkout do runner. O trigger de Preview não repassa essas variáveis padrão do parent, evitando que, na fase de trigger sem o `CI_PROJECT_DIR` exclusivo de job, os caminhos fiquem fixados em raízes como `/.tmp` e `/.npm-cache`; o job child resolve de novo com as definições padrão do próprio pipeline.
- `ZCODE_CI_SHARED_ROOT`: raiz compartilhada do host usada por macOS/upload (padrão `/Users/dev/shared/zcode`)
- `ZCODE_CI_TEST_REMOTE_ASSET_ROOT`: raiz compartilhada fixa dos recursos do Source Server quando `ZCODE_ENV=test`
  (padrão `/Users/dev/shared/ssh-remote-assets`); o CI sincroniza o descriptor e os quatro archives
  para `${ZCODE_CI_TEST_REMOTE_ASSET_ROOT}/${VERSION}`, com o endereço de acesso correspondente
  `http://intranet.example.invalid:12345/ssh-remote-assets/${VERSION}`
- `ZCODE_CI_LINUX_CONTAINER_OUT`: ponto de montagem compartilhado dentro do contêiner Docker Linux (padrão `/output`)
- `ZCODE_CI_WINDOWS_SHARED_ROOT`: raiz SMB do Windows (padrão `//172.16.0.10/shared/zcode`)
- `ZCODE_NATIVE_SEARCH_DEPS_ROOT`: raiz compartilhada de deps usada por `ci:ensure-native-search-deps`. Os jobs de plataforma a derivam automaticamente das raízes de macOS, contêiner Linux e Windows acima, normalmente sem necessidade de configuração separada
- `ZCODE_NATIVE_SEARCH_ALLOW_PUBLISH`: switch explícito de produção extra. Os templates de empacotamento das três plataformas já definem `1`; outros chamadores devem defini-lo apenas ao confirmarem que têm a responsabilidade de escrita no deps compartilhado. Mesmo em ref protegido, o preenchamento dos arquivos auto-produzidos ausentes é permitido sem configurar essa variável
- `LINUX_SHARED_OUTPUT_ROOT` (opcional, apenas Docker Linux): sobrescreve a raiz de coleta de artefatos dentro do contêiner
- `OSS_BUCKET` / `OSS_PATH_PREFIX` / `CDN_DOMAIN`: variáveis necessárias ao upload no OSS e à geração da URL principal do CDN (padrões no repositório `.gitlab-ci.yml`: `cgx-public`, `zcode/electron/releases`, `cdn-zcode.z.ai`; podem ser sobrescritas nas configurações de CI/CD do GitLab). O fallback de domínio dos scripts de validação de URL, upload e preload do CI também é unificado como `cdn-zcode.z.ai`. `CDN_DOMAIN` e `OSS_BUCKET` aceitam listas separadas por vírgula e correspondem em ordem; `OSS_PATH_PREFIX` aceita um único valor reutilizado ou uma lista de vírgulas com a mesma quantidade. As fases de upload/publish expandem todos os alvos; os pacotes desktop não gravam mais essas variáveis em um feed genérico antigo e configurável.
- `OSS_CONFIG_FILE`: opcional, controla o arquivo de configuração usado ao chamar `ossutil` para cada grupo de alvos OSS. Aceita um único valor reutilizado ou uma lista de vírgulas do mesmo tamanho que `CDN_DOMAIN`; quando vazio, usa a configuração padrão de ossutil do runner. Quando AK/SK ou região de OSS novos e antigos divergem, AK/SK e região devem ser escritos no arquivo de configuração correspondente, ordenando os caminhos de arquivo conforme a ordem de `CDN_DOMAIN`.
- `CDN_PRELOAD_PROFILE` / `ALIYUN_CDN_PROFILE`: opcionais, controlam o perfil do aliyun CLI usado por `cdn-preload.sh` ao chamar a OpenAPI de CDN da Alibaba Cloud. `CDN_PRELOAD_PROFILE` tem prioridade mais alta; aceita um único valor reutilizado ou uma lista de vírgulas do mesmo tamanho que `CDN_DOMAIN`. O script de pré-aquecimento não passa `--region` explicitamente — a região vem do perfil correspondente ou da configuração padrão do aliyun CLI, evitando sobrescrever a configuração de endpoint que cada perfil traz em migrações de múltiplas contas.
- `CDN_PRELOAD_DOMAINS`: variável mantida por compatibilidade histórica; a cadeia atual de upload/preload não a lê mais, e a nova migração de OSS/CDN expande os domínios de pré-aquecimento pela lista `CDN_DOMAIN`.
- `ZCODE_UPDATE_FEED_URL`: variável opcional de diagnóstico em runtime, que sobrescreve a interface padrão de verificação de atualização com a URL completa do manifest do servidor. O cliente continua escrevendo os query params `platform` / `device_mid` / `channel` e os headers correspondentes, sem migrar para o antigo generic feed.
- `ZCODE_ENV`: opcional, `production` gera o pacote oficial e `test` gera o pacote de teste. O nome de arquivo do pacote de teste recebe o sufixo `_TEST`, e a notificação de Feishu do artefato de build coloca o identificador de ambiente no título do card — o ambiente de teste usa fundo vermelho e o oficial o azul padrão. `publish-release.sh` rejeita chamadas com `ZCODE_ENV=test` para a release API oficial.
- `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`: credenciais de notarização do notarytool no macOS
- `APPLE_SIGNING_IDENTITY` ou `CSC_NAME`: identidade de assinatura do macOS
- `APPLE_DEVELOPER_ID_APPLICATION_P12_BASE64` / `APPLE_DEVELOPER_ID_APPLICATION_P12_PASSWORD`: p12 de Developer ID Application do macOS. Quando configurado, o job de build do macOS cria um keychain de uso único para o job e importa o p12, e tanto a pré-assinatura de runtime quanto a assinatura final do electron-builder usam explicitamente esse keychain, evitando `errSecInternalComponent` quando vários jobs compartilham a login keychain do runner
- `CSC_LINK` / `CSC_KEY_PASSWORD`: variáveis de certificado do Windows, consumidas diretamente pelo `electron-builder`
- `ZCODE_FEISHU_NOTIFY_TOKEN`: obrigatório, token de serviço necessário para o envio das notificações Card 2.0 de artefatos de build pelo serviço genérico de notificação Feishu zcode-internal; precisa ter o mesmo valor da configuração do servidor. Opcionalmente, `ZCODE_FEISHU_NOTIFY_BASE_URL` sobrescreve o endereço do serviço (padrão `http://intranet.example.invalid:3011`)
- `FEISHU_RECEIVE_ID` / `FEISHU_RECEIVE_ID_TYPE`: destinatário da notificação de artefatos de build, passado como destinatário explícito ao serviço de notificação; sem configuração, cai no destinatário padrão do cenário da configuração do servidor
- `ZARA_RELEASE_NOTIFY_*`: configuração de envio Zara/Feishu da notificação de sucesso de lançamento, usada apenas no `release:notify:feishu` após um lançamento oficial por tag e liberação por `release:approve`; o CI configura por padrão o grupo destinatário e o diretório remoto de envio
- `RELEASE_API_KEY` / `RELEASE_API_URL` / `RELEASE_API_KEY_TEST` / `RELEASE_API_URL_TEST` / `RELEASE_API_IDEMPOTENCY_KEY` / `RELEASE_API_CONNECT_TIMEOUT` / `RELEASE_API_MAX_TIME` / `RELEASE_API_TEST_RETRY_ATTEMPTS` / `RELEASE_API_RETRY_DELAY_SECONDS` / `RELEASE_STATUS`: variáveis necessárias ao `publish-release.sh` para chamar a interface de lançamento do backend (`RELEASE_API_URL` padrão `https://zcode.z.ai/api/v1/releases`, `RELEASE_STATUS` padrão `3`). Antes de chamar a interface de lançamento, `release:publish:gray` também executa `reset-release-rollout.sh`, que precisa do `ROLLOUT_ADMIN_TOKEN` protegido e mascarado; por padrão chama `https://zcode-api.z.ai/api-admin/v1/releases/gray`, também sobrescrevível por `ROLLOUT_API_URL` ou `ZCODE_RELEASE_GRAY_API_URL`; essa requisição obrigatoriamente passa pelo backend protegido via HTTPS e envia `Authorization: Bearer $ROLLOUT_ADMIN_TOKEN`. O script primeiro lê a configuração de rollout atual e depois envia o payload completo `{ disabled: true, percentage: 0, device_mid_allowlist? }`, evitando que a interface de rollout do backend rejeite payload parcial. Ao configurar `RELEASE_API_URL_TEST` é obrigatório configurar também o `RELEASE_API_KEY_TEST` protegido e mascarado; o script não envia a `RELEASE_API_KEY` de produção para o domínio de teste. O mesmo corpo de requisição de release, após o sucesso na `RELEASE_API_URL` principal, continua sendo enviado em best-effort para a release API de teste; os dois endpoints usam o mesmo header `Idempotency-Key`, cujo padrão é derivado do corpo e do status do release e que pode ser sobrescrito por `RELEASE_API_IDEMPOTENCY_KEY`. A interface de teste tem retry padrão de `3` vezes, com backoff exponencial no intervalo definido por `RELEASE_API_RETRY_DELAY_SECONDS` (padrão `5` segundos). O script valida erros puramente de configuração antes da primeira requisição de rede: `RELEASE_API_TEST_RETRY_ATTEMPTS` aceita `1..5`, `RELEASE_API_RETRY_DELAY_SECONDS` aceita `0..300`, `RELEASE_API_CONNECT_TIMEOUT` aceita `1..60` e `RELEASE_API_MAX_TIME` aceita `1..600`. Qualquer interface que retorne algo diferente de 2xx no final, ou falha de transporte do curl, faz o job de publish falhar e bloqueia o CI seguinte, mas o script não faz rollback automático da release API principal que já teve sucesso — o responsável pelo lançamento precisa fazer a compensação manual com os mesmos metadados de release e a mesma chave de idempotência. Cada POST tem por padrão timeout de conexão de `10` segundos e limite total de `60` segundos; o corpo da resposta é gravado em um diretório temporário `mktemp -d` exclusivo de cada execução do script e limpo na saída, evitando que jobs de publish concorrentes no runner compartilhado apaguem ou leiam em cruzamento arquivos de resposta. `RELEASE_STATUS` aceita apenas um único status numérico: o job gray sempre passa `3`, o job completo sempre passa `1`, e é proibido publicar múltiplos status no mesmo job de publish por meio de uma lista. `CI_RELEASE_BRANCH=1` combinado com `RELEASE_STATUS=1` falha por padrão; defina `ALLOW_CI_RELEASE_STABLE_PUBLISH=1` apenas em um rehearsal de release explicitamente aprovado.

## Scripts principais

- `scripts/assert-node-version.mjs`: garante que a versão de Node no CI atende ao requisito do repositório
- `scripts/ci-collect-artifacts.mjs`: coleta de `packages/desktop/dist` os artefatos de build da plataforma atual, os metadados de atualização e o blockmap
- `scripts/notarize-macos.sh`: executado por `build:macos:*` após a coleta dos artefatos, faz a assinatura Developer ID do DMG, a notarização, o stapler e a aceitação do Gatekeeper; num lançamento oficial por tag a ausência de credenciais Apple ou de identidade de assinatura faz o script falhar, enquanto cadeias não oficiais ainda podem pular e manter a nomenclatura de artefato não notarizado para investigação em testes
  - Ao remover o sufixo `.unnotarized` depois da notarização, o `latest.yml` / `latest.yaml` que referencia o DMG tem seu size e sha512 atualizados; executar o script por um caminho de link simbólico também precisa atualizar, sem pular silenciosamente por causa da forma diferente do caminho de entrada.
- `scripts/upload-oss.sh`: envia os instaladores Electron versionados e resolve o `latest.yml` único para gerar os metadados de lançamento; não lê nem envia listas de atualização de locale/legacy e não sobrescreve o stable feed. O caminho versionado do Electron é `oss://<bucket>/<path-prefix>/$VERSION/<platform>-<arch>/`, por exemplo `.../3.3.3/macos-arm64/`; o descriptor/archive do Source Server entra no mesmo diretório de versão. Quando `CDN_DOMAIN` / `OSS_BUCKET` têm múltiplos valores, cada grupo de alvos envia o diretório de versão completo e os assets do Source Server; os metadados de release usam o primeiro alvo de CDN.
  - O lançamento oficial de tag macOS só permite enviar `*.dmg` já assinados, notarizados e com staple; se ainda existirem `*.unnotarized.dmg` no diretório compartilhado, o upload falha diretamente, evitando que um instalador com verificação Gatekeeper incompleta chegue ao CDN.
  - O job de upload também gera `release-meta-*.json` (especificado por `RELEASE_META_OUT`) para agregação na fase de publish; a cadeia principal de lançamento oficial tem por padrão `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `windows-aarch64`, `linux-x86_64`, `linux-aarch64`.
  - Quando o upload de Linux é executado manualmente, deve existir um `latest.yml` válido, e os metadados de lançamento são gerados a partir do `path` / `sha512` do AppImage contido nele.
  - `EXTRA_UPLOAD_SOURCE_DIR` e `EXTRA_UPLOAD_FILES` permitem enviar em anexo o `source-server-release.json` e os `zcode-server-*.tar.gz`, que são gravados em `CDN_URLS_OUT` para participar do pré-aquecimento
- `scripts/cdn-preload.sh`: pré-aquece as URLs de CDN após o upload. `upload-oss.sh` preserva o primeiro grupo de URLs de CDN para os metadados de release e, ao mesmo tempo, grava todos os domínios em `cdn-urls-*.txt` conforme a lista de alvos `CDN_DOMAIN`; `release:preload:cdn` consome as URLs dos artefatos versionados por plataforma/arquitetura e do Source Server e executa o pré-aquecimento. Por padrão o script processa todos os URLs da lista que tenham size válido, sem mais pular arquivos pequenos por体积; `PRELOAD_MIN_BYTES` existe apenas como interruptor de depuração manual e só filtra pelo tamanho registrado quando definido explicitamente como maior que 0. A região da OpenAPI da Alibaba Cloud e o escopo de pré-aquecimento do CDN são gerenciados pelo perfil do aliyun e pela própria configuração de domínio — o script não passa `--region` nem `--Area`.
- `scripts/publish-release.sh`: lê os `release-meta-*.json`, monta o corpo de requisição `{ releases: [...] }` e chama a release API do backend. O job gray envia `status=3`, o job completo envia `status=1`; com `RELEASE_API_URL_TEST` configurado, faz escrita dupla na release API de teste. O script não executa nenhum upload de feed OSS.
- `scripts/notify-release-feishu.js`: lê o `releaseNotes` do `macos-arm64/latest.yml` no diretório compartilhado, valida que a versão do manifest é igual à versão da notificação e envia um Card 2.0 interativo via Zara Feishu; pipelines de tag usam `CI_COMMIT_TAG`, e um rehearsal de release fora de tag precisa definir explicitamente `ZARA_RELEASE_NOTIFY_VERSION`. Suporta configuração de múltiplos grupos separados por vírgula, `uuid` estável por destinatário, continuar o envio em grupos que falharam e reenvio preciso por `ZARA_RELEASE_NOTIFY_RETRY_RECEIVE_ID`. `ZARA_RELEASE_NOTIFY_DRY_RUN=1` apenas imprime o JSON do card e o tamanho do payload, sem chamar a API do Feishu
- `scripts/notify-feishu.mjs`: notificação de artefatos da fase de build, enviando um Feishu Card 2.0 montado pelo próprio script; o título mostra o estado do build, o ambiente, a arquitetura e o branch, o corpo mostra o autor e a mensagem do commit, e os botões no rodapé abrem o artefato ou o endereço do Job com falha; falhas do card são engolidas pelo script wrapper do CI e não bloqueiam o pipeline principal

## Cache de CDN e do manifest de auto-atualização

- O `latest.yml` único de atualização entra no diretório versionado por plataforma/arquitetura e contém `releaseNotesByLocale`; um diretório de versão deve ser tratado como asset imutável. O CI atual não gera cópias de locale nem do antigo generic stable feed.
- Se o manifest do servidor for publicado e o CDN ainda não tiver concluído o pré-aquecimento do novo diretório de versão, o cliente pode falhar ao baixar por um curto período; por isso o `publish` precisa esperar o sucesso de `release:preload:cdn`.

## Pontos de troubleshooting

- Se `prepare:desktop-runtime` falhar, veja primeiro a URL impressa no log de download — normalmente é acesso à rede externa ou mudança no asset publicado pelo upstream
- Se `build:remote:assets` falhar, verifique primeiro se existe `node/<platform-arch>` em `packages/desktop/mock-cdn/releases/<version>/` e o acesso de rede do runner à fonte de download dos binários upstream
- Se a notarização do macOS falhar, confirme primeiro se as três variáveis `APPLE_*` estão completas e se o runner consegue executar `xcrun notarytool`
- Se o upload reclamar de metadados de atualização ausentes, verifique primeiro se existe `latest.yml` no diretório correspondente à plataforma no diretório compartilhado
- Se alguma plataforma não tiver artefato, verifique primeiro se os nomes de arquivo em `packages/desktop/dist` ainda seguem a convenção `ZCode-{version}-{os}-{arch}`
- Se faltar algum arquivo no diretório compartilhado, confirme primeiro se o `CI_ARTIFACT_OUTPUT_DIR` do job de build aponta para o caminho compartilhado realmente montado no runner