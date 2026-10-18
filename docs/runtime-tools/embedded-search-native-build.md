# Spec de Build Nativo do Embedded Search

## Objetivo

O branch de embedded search do Bash do ZCode precisa, no fim, consumir programas de busca nativos distribuídos junto com o pacote de release, em vez de depender de `find`, `grep`, `rg` pré-instalados na máquina do usuário ou de encaminhar novamente para comandos de sistema por subprocesso Node.

Esta etapa conclui a integração de build e execução para macOS, Linux e Windows: `bfs` e `ugrep` são construídos a partir de fontes de versões fixas, e o `rg` de todos os targets usa uniformemente o Microsoft `ripgrep-prebuilt v14.1.1-1`. macOS, Linux e Windows x64 oferecem uma entrada de validação E2E independente de embedded-search real em Bash, mas o empacotamento oficial do desktop não roda E2E de comportamento; o Windows arm64, por enquanto, mantém apenas a cross-build existente no runner x64 e executa o gate estático PE, sem se passar por E2E de runtime da arquitetura alvo. A exposição de ferramentas e o prompt visível ao provider não mudam por causa da troca do backend de execução.

A capacidade-alvo multiplataforma e o estado atual de habilitação na distribuição precisam ser gerenciados separadamente:

| Plataforma          | Ferramentas-alvo no pacote                                     | Habilitado na release atual |
| --------------- | -------------------------------------------------- | ------------ |
| macOS arm64     | `bfs`、`ugrep`、`rg`                               | sim           |
| macOS x64       | `bfs`、`ugrep`、`rg`                               | sim           |
| Linux x64/arm64 | `bfs`、`ugrep`、`rg`                               | sim           |
| Windows x64     | `ugrep.exe`、`rg.exe`; `find` com fallback para Git Bash/system | sim           |
| Windows arm64   | `ugrep.exe`、`rg.exe`; `find` com fallback para Git Bash/system | sim           |

O Windows não oferece `bfs` nativo: o ZCode não porta o `bfs` do Windows por conta própria e também não embrulha o `bfs` Unix upstream em umpseudo-produto nativo.

O Linux desktop/SEA e o Linux remote compartilham o mesmo native-search release plan: o `bfs` continua consumindo `v4.1.1-2`, o `ugrep` e as outras plataformas unificadamente consomem `v7.8.4-1` e o `rg` consome o Microsoft `v14.1.1-1`. O Darwin remote continua implantando apenas o `rg 13.x` histórico, que não pode ser reescrito implicitamente pelo release plan do Linux.

## Switch do usuário e ciclo de vida da Session

A área de configurações de terminal da seção "Geral" da página de configurações oferece o switch `nativeSearchEnhancementsEnabled`, habilitado por padrão. Esse switch só controla se o prelude de startup do Bash mapeia `find` / `grep` para `bfs` / `ugrep`; ele não controla a preparação dos artefatos nativos, o fallback de `rg`, a exposição das ferramentas Glob/Grep nem a matriz de ferramentas visível ao provider. Depois de desativado, o Bash usa naturalmente o system `find` / `grep` do shell atual; o Windows continua não oferecendo `bfs`.

O valor de configuração é uma preferência de inicialização do runtime da Session raiz, não metadata de turno, e não é gravado em Session history, queue, runtime snapshot nem shell init snapshot:

- uma nova Session raiz e um cold resume real leem o valor atual uma única vez do Host pertencente, via `session/requestRuntimePreferences`, durante a materialização do runtime;
- um active resume com runtime já existente não relê o valor e mantém o valor do runtime atual;
- fork, selection side chat e subagent herdam o valor do runtime pai e não relêem o Host;
- alternar o switch não atualiza a quente uma Session em execução ou ainda ativa; apenas Sessions novas ou com cold resume real usam o novo valor;
- `rowsRange`, `plans`, `fileChanges`, `fileRewindPreview`, `attachmentBegin` e `subscribe` são apenas portas de entrada do cold resume, todas entrando na mesma materialização singleflight e sem carregar campos de configuração.

A autoridade da configuração e o caminho remoto ficam fixos assim:

```text
Desktop-local SettingService
        ^
        | typed blocking runtime-preferences request
Desktop shared Host
        ^
        | service-scoped Agent RPC, correlated by requestId
desktop-attached remote Host
        ^
        | ZCode Protocol reverse request
Agent root runtime materialization
```

O workspace local e o standalone server leem o próprio `SettingService` autoritativo do Host onde estão. Um workspace SSH/WSL/Docker attached ao desktop tem o Host remoto fazendo bridge da requisição para o desktop shared Host e lendo então as configurações locais do desktop; o `/remote` do celular reaproveita o mesmo shared-host attachment e não cria um runtime nem uma cópia de configuração independente. Relay e desktop main apenas encaminham e não guardam esse estado de negócio.

`session/requestRuntimePreferences` usa schema estrito e usa `scope` para distinguir `runtime-materialization` de `user-execution`. Esta seção consome apenas o `nativeSearchEnhancementsEnabled` do primeiro. Cada requisição espera no máximo 15 segundos; quando o Host mantém a conexão mas não responde, um erro de timeout bloqueia esta materialização de runtime. Quando um Host antigo retorna `-32601`, ou quando o Agent ainda não conectou ao Host e retorna `-32020`, o padrão é habilitado por compatibilidade com versões antigas; resposta inválida, exceção do resolver de configuração, timeout e outros erros de transporte não podem ser silenciosamente tratados como habilitado.

## Baseline de versões e desvios de segurança

As versões e o baseline de build das ferramentas de embedded search:

- `bfs 4.1.1`.
- o `bfs` usa as flags de configure na ordem: `--enable-release --with-oniguruma --without-libselinux --without-libacl --without-liburing --without-libcap`, e suporta os argumentos fixos anteriores `-S dfs -regextype findutils-default`.
- o baseline inicial era `ugrep 7.5.0`; o ZCode deliberadamente sobe para `ugrep 7.8.4`, obtendo limites de complexidade de DFA state/edge e de position-set, evitando que regex malicioso ou acidentalmente complexo esgote memória em tempo de compilação. Esse é um desvio de segurança e não deve ser descrito como uso da versão inicial de binário.
- `ugrep --version` precisa expor `-z:zlib,bzip2,zstd,brotli,7z,tar/pax/cpio/zip`; o macOS usa `-P:pcre2`, e Linux e Windows usam `-P:pcre2jit`.
- o PCRE2 JIT é configurado por branch de plataforma: desligado no macOS, ligado no Linux e no Windows. `win32-x64` / `win32-arm64` precisam ambos incluir o branch de features do Windows.
- o `rg` de todas as plataformas desktop/SEA é fixado uniformemente no Microsoft `ripgrep-prebuilt v14.1.1-1`, a versão em runtime precisa ser `ripgrep 14.1.1` e precisa expor `features:+pcre2` e PCRE2 10.43; a disponibilidade de JIT continua determinada pelas capacidades da plataforma alvo. Exceto pelo arquivo musl de Linux arm64, que não expõe revision, todos os targets precisam emitir a revision upstream `4649aa9700`. A identidade do conteúdo dos arquivos é garantida por SHA-256 fixo, e não é permitido embrulhar ou modificar binários só para completar a string de exibição.
- o artefato final não pode depender de Homebrew nem de bibliotecas dinâmicas do diretório de build. No macOS, o `bfs` só pode linkar o `libSystem` do sistema; o `ugrep` só pode linkar o `libSystem` e a `libc++` do sistema.
- o sidecar de native search mantém as fronteiras de empacotamento já existentes de cada plataforma: o deployment target do artefato macOS não pode ser maior que macOS 12.0 do Electron 41; o maior GLIBC symbol version de `bfs` / `ugrep` no Linux é fixado em `GLIBC_2.28`, e o producer precisa realmente rodar Node 24, glibc 2.28, GCC 12 e G++ 12; os artefatos de Windows x64/arm64 não podem depender dinamicamente da CRT, do PCRE2 e das bibliotecas de compressão que o contrato de build exige linkar estaticamente.

O gate de compatibilidade do Linux checa o `readelf --version-info` do ELF final e compara numericamente todas as referências `GLIBC_x.y[.z]`. `bfs` / `ugrep` precisam conter pelo menos uma referência GLIBC resolvível e o máximo não pode ser maior que `2.28`; o `rg` musl da Microsoft pode não ter nenhuma referência GLIBC. Checar apenas o `getconf GNU_LIBC_VERSION` do contêiner de build não basta para provar compatibilidade do artefato final, e o gate do artefato não pode ser omitido.

## Distribuição de recursos pré-compilados

O prepare de desktop/SEA comum e o fluxo de desenvolvimento local não compilam as ferramentas de busca nativas on the spot após uma falha de download. Os arquivos de `bfs` / `ugrep` próprios e os arquivos originais do Microsoft `ripgrep-prebuilt v14.1.1-1` são baixados uniformemente de `${ZCODE_DEPS_BASE_URL}/native-search-tools`. O CI de empacotamento por plataforma pode rodar uma vez um deps ensure antes de executar o prepare: ele consulta diretamente o sistema de arquivos de deps compartilhado mapeado pelo runner, conforme o mesmo release plan de `platform-arch`; quando o arquivo do producer está ausente, um pipeline confiável constrói, verifica e empacota de forma determinística no toolchain do target atual e publica no deps compartilhado usando arquivo temporário mais rename no mesmo diretório. Todos os arquivos de producer precisam ter `archiveSha256` configurado no release plan e ser estritamente verificados antes do reaproveitamento, da publicação e do download; quando o digest está ausente ou não bate, a falha é imediata e o empacotamento não pode continuar. O ensure recusa a produção por padrão, e só uma ref protegida ou uma entrada confiável com `ZCODE_NATIVE_SEARCH_ALLOW_PUBLISH=1` explícito entra no ramo de escrita; os templates de empacotamento de macOS, Linux e Windows no repositório são as entradas autorizadas de escrita no deps compartilhado. Jobs de empacotamento do mesmo `platform-arch` precisam usar o `resource_group` do GitLab para serializar entre pipelines e evitar que dois producers publiquem ao mesmo tempo no mesmo caminho de versão fixa; alvos diferentes ainda podem rodar em paralelo. Um arquivo de versão já existente não pode ser sobrescrito; se durante uma chamada manual o alvo já tiver aparecido, só se aceita quando o digest de conteúdo for o mesmo.

Esse ensure não é um fallback do downloader: a ausência do Microsoft `rg` precisa falhar imediatamente, sem virar produção própria nem reempacotamento; timeout HTTP, resposta não 200, SHA-256 ausente ou divergente, falha de extração ou falha de verificação do binário também precisam encerrar o build atual e não podem disparar o producer. Todos os arquivos oficiais do Microsoft `rg` e do `bfs` / `ugrep` próprios precisam ter SHA-256 fixado no release plan e ser verificados antes da extração. Recursos de producer que ainda não foram preparados e não foram produzidos por CI confiável precisam ter a URL padrão retornando 404, e não podem ser preenchidos com o artefato de outra plataforma. O `rg` da rede interna espelha somente os bytes originais do release da Microsoft, sem renomear nem reempacotar.

O downloader acessa por padrão direto o espelho interno `${ZCODE_DEPS_BASE_URL}`. Somente `github.com` e seus release redirect hosts do `githubusercontent.com` podem ler o `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` do ambiente de build; nenhum outro host entra em proxy implicitamente. Todos os downloads precisam falhar explicitamente quando a conexão ficar sem resposta por muito tempo, sem deixar a build machine que não alcança o GitHub esperando indefinidamente e sem deixar endereços de dependência internos sequestrados por um proxy externo.

Os novos recursos ficam unificados em `${ZCODE_DEPS_BASE_URL}/native-search-tools` e são versionados por ferramenta de forma independente:

```text
native-search-tools/
  bfs-v4.1.1-1/
    bfs-v4.1.1-1-aarch64-apple-darwin.tar.gz
    bfs-v4.1.1-1-x86_64-apple-darwin.tar.gz
  bfs-v4.1.1-2/
    bfs-v4.1.1-2-aarch64-unknown-linux-gnu.tar.gz
    bfs-v4.1.1-2-x86_64-unknown-linux-gnu.tar.gz
  ugrep-v7.8.4-1/
    ugrep-v7.8.4-1-aarch64-apple-darwin.tar.gz
    ugrep-v7.8.4-1-x86_64-apple-darwin.tar.gz
    ugrep-v7.8.4-1-aarch64-unknown-linux-gnu.tar.gz
    ugrep-v7.8.4-1-x86_64-unknown-linux-gnu.tar.gz
    ugrep-v7.8.4-1-x86_64-pc-windows-msvc.zip
    ugrep-v7.8.4-1-aarch64-pc-windows-msvc.zip
  ripgrep-v14.1.1-1/
    ripgrep-v14.1.1-1-aarch64-apple-darwin.tar.gz
    ripgrep-v14.1.1-1-x86_64-apple-darwin.tar.gz
    ripgrep-v14.1.1-1-aarch64-unknown-linux-musl.tar.gz
    ripgrep-v14.1.1-1-x86_64-unknown-linux-musl.tar.gz
    ripgrep-v14.1.1-1-aarch64-pc-windows-msvc.zip
    ripgrep-v14.1.1-1-x86_64-pc-windows-msvc.zip
```

O endereço de download upstream dos arquivos pré-compilados da Microsoft é `https://github.com/microsoft/ripgrep-prebuilt/releases/download/v14.1.1-1/`. O diretório alvo do serviço estático interno é fixado em:

```text
/Users/dev/shared/zcode/deps/native-search-tools/ripgrep-v14.1.1-1/
```

O base URL HTTP padrão correspondente é `http://intranet.example.invalid:12345/zcode/deps/native-search-tools/ripgrep-v14.1.1-1/`. Os arquivos que precisam ser espelhados como são são:

| Alvo          | Arquivo da Microsoft                                        | SHA-256                                                            |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| macOS arm64   | `ripgrep-v14.1.1-1-aarch64-apple-darwin.tar.gz`       | `84ff9b227b9aad651be0ac4cf7802a190015bfba3dfa6b015cc7aa89dd8c5c2b` |
| macOS x64     | `ripgrep-v14.1.1-1-x86_64-apple-darwin.tar.gz`        | `cfedd7993342bc5f90310ce73a00cbf5d3b5237654c9bfc18b383f0e829f3b11` |
| Linux arm64   | `ripgrep-v14.1.1-1-aarch64-unknown-linux-musl.tar.gz` | `98c0371366a9db920ed6c196083e8030511055e5f128b3bde2ca56bbddf85b9a` |
| Linux x64     | `ripgrep-v14.1.1-1-x86_64-unknown-linux-musl.tar.gz`  | `1154dd91f7b144cee490b91f1ab27ce04f8f01d8876cde2d9c0eff845c8ab012` |
| Windows x64   | `ripgrep-v14.1.1-1-x86_64-pc-windows-msvc.zip`        | `ede1d7f533f30d7e2870f77139d0fb9d7591daad5260b80d6a525e0bb5bd440e` |
| Windows arm64 | `ripgrep-v14.1.1-1-aarch64-pc-windows-msvc.zip`       | `88660d96f822d2e0329e254031068e82028f9c13efcec9b2d78c5a19d3f9ac47` |

Os digests dos arquivos próprios já fixados ou aguardando preenchimento pelo producer são:

| Alvo          | Arquivo próprio                                          | SHA-256                                                            |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| macOS arm64   | `bfs-v4.1.1-1-aarch64-apple-darwin.tar.gz`        | `696f73eaff50d3c3de8a8ee36746a89693dd6ff0d010b05cd3b4b3eb2a369781` |
| macOS arm64   | `ugrep-v7.8.4-1-aarch64-apple-darwin.tar.gz`      | `01ea803e3fc3b94e796a9376e4d062a5490fe08e5760c6173e72b8f31546a4f3` |
| macOS x64     | `bfs-v4.1.1-1-x86_64-apple-darwin.tar.gz`         | `d993d72530749fa777339a7546f03338499abf235e2147d4adcd086641c6376f` |
| macOS x64     | `ugrep-v7.8.4-1-x86_64-apple-darwin.tar.gz`       | `6a2bedd9ccf53a2ac574d2fa498a36dcbe21e957b40442f9493180c6dad4dea9` |
| Linux arm64   | `bfs-v4.1.1-2-aarch64-unknown-linux-gnu.tar.gz`   | `dabdde935a02f89dd0c48c5cd0ec756a87d300fd5ace85a78e6a9eb51d771118` |
| Linux arm64   | `ugrep-v7.8.4-1-aarch64-unknown-linux-gnu.tar.gz` | `bf3b99c0af41f50c0ec3031b32ab8f67fa95b5581add18fad5163ece978d31ba` |
| Linux x64     | `bfs-v4.1.1-2-x86_64-unknown-linux-gnu.tar.gz`    | `9adf5759000021dd8fcd99670461cc43863f9172fb16f2f9a3e49c700311e7a0` |
| Linux x64     | `ugrep-v7.8.4-1-x86_64-unknown-linux-gnu.tar.gz`  | `13732f50fe63da07f3472f627f611b75359153163d07a0eb01e7c54125ae930e` |
| Windows arm64 | `ugrep-v7.8.4-1-aarch64-pc-windows-msvc.zip`      | `e9de73f1b542105203d586b19b4d57b8ecf2bf780f23e86c66a0fb7f56d51024` |
| Windows x64   | `ugrep-v7.8.4-1-x86_64-pc-windows-msvc.zip`       | `7bbd8e56540d2019a343688f1fc0ddb2ff5f0988090c577d2b9d6f4a8a86be21` |

A revision em `<tool>-v<version>-<revision>` só é incrementada quando, sob a mesma versão upstream, a forma de compilação ou o conteúdo do binário mudam; ela não muda junto com a versão do ZCode CLI. O artefato Linux do `bfs 4.1.1` mantém o `-2` por causa da mudança de baseline GLIBC; depois do upgrade da versão upstream do `ugrep`, todas as plataformas partem do novo namespace `v7.8.4-1`, e o Linux não herda a revision da antiga `v7.5.0-2`. O resource histórico `rg` do remote continua consumindo `${ZCODE_DEPS_BASE_URL}/ripgrep-v13.0.0-10` separadamente; esse recurso de compatibilidade não faz parte do novo release plan de embedded-search do desktop/SEA nem serve como fallback de versão para ele.

Os digests fixos servem para confirmar a identidade do conteúdo baixado; mesmo assim, os binários baixados precisam passar pela verificação de versão, feature, arquitetura e dependências dinâmicas, e os artefatos do producer no Linux também pela verificação de teto GLIBC 2.28. O `.bundle-meta.json` registra tanto o digest do arquivo quanto o digest do binário real: o primeiro invalida caches antigos depois de uma mudança de digest, e o segundo serve para consistência do cache local; um não substitui o outro.

Após um download bem-sucedido ou um build do producer, cada diretório de ferramenta recebe o `.bundle-meta.json` correspondente ao release pré-compilado. Um prepare posterior só pode ser pulado quando o binário existe, o SHA-256 real bate com o metadata e todos os campos de ferramenta, versão, release, plataforma alvo e nome de arquivo do metadata correspondem; em hosts Unix o binário alvo também precisa manter o bit de execução e, se apenas a permissão foi perdida, ele é restaurado no lugar e reaproveitado, sem novo download. Resíduos sem metadata, como o rg 13 histórico, ou com falha de verificação de conteúdo ou metadata divergente precisam ser baixados de novo conforme a release atual, e não podem ser reaproveitados só porque o caminho de saída fixo existe.

O producer ainda pode ser usado como fluxo manual explícito: executar `pnpm run pack:native-search` no producer runner da plataforma correspondente, que por padrão constrói a partir das fontes travadas, verifica e empacota o conjunto próprio de `platform-arch` do host atual, e então gera em `dist/native-search-tools-deps/native-search-tools` uma árvore de arquivos idêntica ao diretório estático acima. O CI de empacotamento por plataforma reaproveita o mesmo producer via `pnpm run ci:ensure-native-search-deps`; ele só constrói quando os deps compartilhados não têm o arquivo do target atual e primeiro escreve no diretório temporário do job, publicando depois apenas os arquivos que faltam. O prepare oficial posterior precisa baixar novamente dos arquivos recém-publicados pelo caminho HTTP interno, de modo que a primeira pipeline de produção também cubra o caminho real de distribuição e extração, sem poder reutilizar diretamente a saída de binário local do producer e pular o download.

Todos os producers tratam apenas `bfs` / `ugrep` e não constroem nem reempacotam o Microsoft `rg`. O Linux precisa ser construído nativamente na arquitetura alvo, e o macOS precisa ser construído no macOS; o Windows segue o runner MSVC x64 existente e gera o `ugrep.exe` da arquitetura correspondente via CMake `-A x64` / `-A ARM64`. Alvos explícitos já suportados podem ser selecionados com `pnpm run pack:native-search -- --platform <platform> --arch <arch>`. Antes da publicação, o prepare baixa o Microsoft `rg` do espelho interno e executa a verificação estática PE machine/import para todos os targets Windows; o E2E completo de runtime roda apenas quando host e target têm a mesma arquitetura. O `prepare:native-search` comum só faz o download e não pode chamar o producer nem escrever nos deps compartilhados.

A origem do `rg` é fixa por target, sem detecção em runtime: macOS arm64/x64 usam os arquivos da Microsoft que só dependem de bibliotecas do sistema, com deployment target 11.0/10.12 respectivamente; Linux arm64/x64 usam os arquivos musl estáticos da Microsoft sem dependência dinâmica de glibc; Windows x64/arm64 usam os arquivos MSVC da Microsoft que passam pelo gate PE machine/import. A política de shell do `rg` é diferente da de `find` / `grep`: `find` / `grep` são shadowed incondicionalmente como `bfs` / `ugrep` no embedded branch, enquanto o `rg` só recebe a implementação nativa embutida quando o shell atual não encontra um executável `rg`, sem sobrescrever o `rg` de sistema que o usuário já tenha.

### Origem dos arquivos: espelho interno e arquivos embutidos no repositório

`scripts/prepare-native-search-tools.mjs` é a única entrada compartilhada pelo `prepare:native-search` do desktop, pelo SEA, pelo staging do server-cli e pela preparação dos assets remotos. A origem é decidida uma única vez por `resolveNativeSearchArtifactSource(env)`, e os chamadores não decidem por conta própria:

| Condição | Origem | Comportamento |
| --- | --- | --- |
| `NATIVE_SEARCH_TOOLS_DOWNLOAD_BASE_URL` está definido, ou `resolveIntranetDepsBaseUrl(env)` consegue resolver um endereço | `intranet` | chama `downloadNativeSearchTools` como está: URL, proxy, SHA-256, bundle meta e semântica de pulo de cache permanecem iguais; o remote Linux/macOS continua executando respectivamente os comandos existentes `download-native-search-tools.mjs` e de rg13 legado `download-ripgrep.mjs` |
| A origem de dependências interna não está configurada (a resolução lança erro ou vem vazia) | `repository` | primeiro verifica o SHA-256 de todos os arquivos deste plan em `apps/zcode-cli/dependencies/native-search`, depois extrai um a um, faz a verificação de arquitetura alvo e escreve o bundle meta; não baixa e não recorre ao espelho |

- O `intranetDefaults.mjs` deste repositório traz o endereço interno padrão, então o padrão é sempre `intranet` e o comportamento de build/CI interno não muda; os arquivos do repositório só valem em ambiente em que a origem de dependências realmente não está configurada (por exemplo, uma árvore open source exportada).
- Os arquivos do repositório e do espelho interno têm o mesmo nome e o mesmo SHA-256, e o release plan fornece simultaneamente `downloadUrl` (apenas `intranet`) e `archivePath`; as duas origens não podem ser misturadas nem servir uma como fallback de falha da outra, e qualquer falha de verificação em um dos caminhos encerra diretamente o processo.
- Os assets remotos usam `resolveRemoteNativeSearchPrebuiltPlan`: Linux e desktop/SEA usam o mesmo plan, e o macOS mantém o rg13; a versão e o digest do rg13 legado continuam sendo mantidos em um único lugar, `native-search-tools-config.mjs`.
- Ambas as origens escrevem, via `stageNativeSearchNotices`, um `THIRD-PARTY-NOTICES.txt` e um `SOURCES.json` em cada diretório de ferramenta antes de retornar (`binary.origin` sendo `intranet-mirror` / `repository-archive`), e o refresh também acontece em cache命中; os componentes remotos concluem a escrita antes de calcular o hash de conteúdo, portanto os arquivos de componente já carregam o material.
- A extração, o localização e a verificação de integridade dos arquivos existem em uma única implementação, `prebuilt-binary-extract.mjs`, reutilizada pelo caminho de download; no Windows os argumentos de tar usam uniformemente barra normal e priorizam o caminho do arquivo relativo ao cwd, evitando que o GNU trate a letra de unidade como um host remoto.
- O empacotamento do producer (`pack:native-search` / `ci:ensure-native-search-deps`) só embute binários, mantendo reprodutibilidade byte a byte com os arquivos de SHA-256 já fixado.

## Fontes e dependências

A entrada de build precisa fixar o commit de origem ou a versão de release e verificar o SHA-256 antes da extração. As três plataformas de build compartilham as seguintes fontes de versão:

| Componente   | Versão fixa                                           | Uso                         |
| --------- | -------------------------------------------------- | --------------------------- |
| bfs       | 4.1.1 / `f220fb5afd8dd7f46b1d1a2ae9c36261eaccf3cd` | backend de `find`              |
| ugrep     | 7.8.4 / `550599a6434fc5315fb6ecd415a5d859e6d846a8` | backend de `grep`              |
| Oniguruma | 6.9.10                                             | semântica de regex GNU find do bfs  |
| PCRE2     | 10.43                                              | `-P` do ugrep                  |
| zlib      | 1.3.1                                              | suporte a gzip/zip/archive do ugrep |
| bzip2     | 1.0.8                                              | suporte a bzip2 do ugrep            |
| zstd      | 1.5.6                                              | suporte a zstd do ugrep             |
| Brotli    | 1.1.0                                              | suporte a Brotli do ugrep           |

Essas dependências participam apenas do build e são linkadas estaticamente ao programa alvo, não sendo distribuídas separadamente como sidecar de runtime.

O archive de commit do GitHub não traz `.git`, e por isso o `build/version.sh` do bfs 4.1.1 regride para `4.1`. O producer precisa fixar a patch version pelo ambiente de build com `VERSION=4.1.1` e não pode passar `./configure --version=4.1.1`; isso poluiria a saída de `CONFFLAGS` em `bfs --version`.

TODO: depois que o build nativo e a integração E2E estiverem completos em todas as plataformas, sincronizar os arquivos de fontes travados acima para a fonte de dependências interna do ZCode e adicionar resolução de endereço de espelho dedicado ao source downloader; até que os artefatos do espelho estejam prontos, continuar usando as URLs oficiais e a verificação de SHA-256, sem assumir que o nome do arquivo de fonte é um recurso já existente sob o `ZCODE_DEPS_BASE_URL` atual.

O baseline observável cobre apenas a versão de topo de `bfs` / `ugrep`, a flag do Oniguruma, o feature set do `ugrep` e as capacidades de ripgrep/PCRE2. Os arquivos da Microsoft vêm da mesma versão upstream de ripgrep 14.1.1 e não exigem identidade de build byte a byte; o alvo atual é a mesma versão, o mesmo feature set, o mesmo comportamento de argumentos e a mesma fronteira de dependências dinâmicas. As versões de dependências transitivas na tabela são versões compatíveis fixadas para um build reproduzível.

## Fronteiras de build

- source manifest, verificação SHA-256, download/extração, parsing de argumentos de CLI, saída do plan e E2E de comportamento pertencem à camada compartilhada multiplataforma.
- O número de versão de `bfs`, `ugrep` e `rg` só pode ser declarado uma vez no manifest compartilhado; os builders de cada plataforma, o mapeamento dos arquivos da Microsoft, o verifier de artefatos e o source plan de cada plataforma precisam reaproveitar essa fonte de versão, sem manter constantes de versão que derivem umas das outras.
- As dependências estáticas de macOS/Linux e o build de `bfs` e `ugrep` pertencem à camada Unix compartilhada; a plataforma só fornece o compiler toolchain, os flags de pré-processamento e a verificação das dependências nativas.
- O Microsoft `rg` não participa de nenhum producer e não reaproveita o build de PCRE2 do ugrep. O Linux continua usando os arquivos musl com SHA-256 fixo.
- O `ugrep.exe` do Windows usa um builder MSVC/CMake independente e seleciona o alvo via `-A x64` / `-A ARM64`; o código-fonte travado do ugrep é UTF-8 sem BOM e o MSVC precisa usar `/utf-8` explicitamente, sem depender da code page do usuário atual do runner para interpretar o fonte. O `rg.exe` vem direto do arquivo MSVC da Microsoft da arquitetura correspondente com SHA-256 fixo. Ambos reaproveitam o download plan e o verifier estático PE; o alvo x64 mantém um E2E de comportamento independente e o alvo arm64 segue a cadeia de cross-build Windows x64 já existente.
- O build no Windows usa runtime MSVC estático fixo e linka estaticamente PCRE2, zlib, bzip2, zstd, Brotli e o decoder 7zip que acompanha o ugrep. O PE final precisa rejeitar a CRT dinâmica como `VCRUNTIME*.dll`, `MSVCP*.dll` e `ucrtbase.dll`, bem como as dependências de build que deveriam ser linkadas estaticamente.
- A liberação do producer Linux se baseia na capacidade real do toolchain, não em uma identidade específica de imagem: o script de build precisa checar antes de baixar o fonte que o Node major é 24, o glibc do builder é 2.28 e que o GCC major de `CC` e o G++ major de `CXX` são ambos 12, e o artefato final passa depois pelo gate de símbolo GLIBC. O runner Apple Silicon do macOS pode usar o `-arch x86_64` do clang do sistema para construir o sidecar x64 e executar o configure probe via Rosetta; a entrada de E2E independente também pode verificar o artefato x64 via Rosetta, mas não é embutida no job oficial de empacotamento. O configure do ugrep precisa usar explicitamente o host `x86_64-apple-darwin`, evitando gravar a identidade do runner arm64 no artefato x64. O x64 continua habilitando o baseline SSE2 e desabilitando AVX2 pelo compiler probe do upstream. Outras cross-compilações Unix não verificadas continuam recusadas.
- O seed/rebuild do Linux é iniciado pela máquina de desenvolvimento com o Docker local, subindo contêineres da arquitetura alvo com `--platform linux/arm64` / `--platform linux/amd64` e usando dentro do contêiner a entrada unificada `pnpm pack:native-search -- --platform linux --arch <arm64|x64>`; o baseline reproduzível atual é o Rocky Linux 8 com glibc 2.28, Node 24 e GCC Toolset 12. macOS e Windows continuam sendo produzidos pelas respectivas máquinas de empacotamento. `ci:ensure-native-search-deps` reaproveita a mesma implementação de empacotamento para produzir o que falta quando o runner atual satisfaz os gates de Node 24 / glibc 2.28 / GCC 12 / G++ 12, sem exigir que o repositório forneça um Dockerfile extra ou um wrapper específico de plataforma; o nome da imagem em si não substitui os gates de runtime acima nem o SHA-256 dos arquivos fixos.
- O deployment target dos sidecars próprios de `bfs` / `ugrep` no macOS é fixado em `12.0`; o deployment target do Microsoft `rg` pode ser menor, mas não maior que `12.0`. A verificação de build precisa ler tanto o `LC_BUILD_VERSION.minos` do Mach-O quanto o `LC_VERSION_MIN_MACOSX.version` do formato antigo, e é proibido que qualquer ferramenta aumente a versão mínima de macOS do Electron 41.
- O `bfs` no macOS precisa bloquear o `posix_spawn_file_actions_addfchdir()` padrão novo do SDK do macOS 26, deixando o upstream escolher o `posix_spawn_file_actions_addfchdir_np()` disponível desde o macOS 10.15; ao mesmo tempo injeta `-Dfdclosedir=__bfs_poison_fdclosedir_macos_26_4`. Ambos servem para impedir que o configure probe do SDK novo faça o artefato com deployment target 12.0 importar fracamente símbolos que só existem em versões de sistema mais altas.
- O `ugrep` no Linux precisa linkar estaticamente o runtime GCC/C++; a allowlist final de dependências não pode aceitar `libstdc++.so`, `libgcc_s.so`, `libc++.so` nem `libc++abi.so`, evitando que uma regressão de flags de build ainda passe pelo verifier e leve riscos de compatibilidade GLIBCXX/CXXABI para o pacote de release.
- O `ugrep` x64 usa configuração de CPU baseline, desabilitando AVX2/AVX512; o arm64 usa o caminho NEON do compilador alvo.
- O build no macOS depende de Xcode Command Line Tools, `make` do sistema, `curl` e `tar`, e não exige Cargo/Rust nem bibliotecas do Homebrew. O build no Linux depende de binutils, `make`, `curl`, `file` e `tar`, também sem Cargo/Rust; `CC` / `CXX` podem ser sobrescritos explicitamente, mas o script precisa executar a detecção de versão do compilador real separadamente, e os dois majors precisam ser 12. O producer do Windows só constrói `ugrep.exe` e depende de VS 2022 Build Tools, CMake, `curl` e `tar`; o target arm64 exige ainda o toolset MSVC ARM64 correspondente.
- O local de saída padrão segue a estrutura de asset de runtime do desktop:
  - `packages/desktop/bundled-tools/darwin-<arch>/{bfs,ugrep,ripgrep}` preparado pela cadeia de download de native search pré-compilado.
  - `packages/desktop/bundled-tools/linux-<arch>/{bfs,ugrep,ripgrep}` preparado pela cadeia de download de native search pré-compilado.
  - `packages/desktop/bundled-tools/win32-<arch>/{ugrep,ripgrep}` preparado pela cadeia de download de native search pré-compilado.
- O host do desktop e o servidor remote Linux descobrem os artefatos habilitados de cada plataforma pelo runtime tool resolver existente e projetam os caminhos absolutos como `ZCODE_BFS_BINARY`, `ZCODE_UGREP_BINARY` e `ZCODE_RG_BINARY`. O Windows não gera nem projeta `ZCODE_BFS_BINARY` e o `find` continua passando pelo Git Bash/system; o diretório das ferramentas descobertas é acrescentado ao `PATH` do runtime do Agent, preservando a prioridade dos comandos do usuário.
- O SEA continua entregando um único executável por target e não pode entregar `bfs`, `ugrep` e `rg` como sidecars no mesmo diretório. No build, as ferramentas nativas habilitadas do target atual e o manifest são escritos nos assets do SEA; em runtime o asset é lido na primeira vez e extraído para `cache/runtime_tools` sob `ZCODE_STORAGE_DIR` (padrão `~/.zcode`).
- `pnpm build:sea` mantém o contrato all-target existente e passa `--all` explicitamente. O producer de cada plataforma alvo precisa primeiro construir, verificar e publicar os arquivos pré-compilados; o build do SEA então baixa, verifica e prepara `packages/desktop/bundled-tools/<platform>-<arch>` para cada target conforme o mesmo release plan e consome tudo de forma unificada. Ferramentas de target externo ausentes precisam falhar de forma fechada, sem degradar comandos públicos para only-host. O E2E de host usa o `sea --target <host-target>` de baixo nível e não altera a entrada de distribuição.
- O cache de runtime tool do SEA precisa ser localizado por `<target>/<tool>/<tool-version>-<binary-sha256>` e não pode conter a versão do CLI. Quando várias versões do CLI carregam exatamente a mesma versão de ferramenta e o mesmo conteúdo binário, a mesma cache precisa ser reaproveitada; a atualização de uma única ferramenta também não pode obrigar as demais ferramentas inalteradas a extrair de novo.
- A extração no SEA precisa verificar o SHA-256 do manifest arquivo a arquivo, escrever em um diretório temporário no mesmo nível e substituir de forma atômica, além de restaurar a permissão de execução. Inicializações concorrentes na primeira vez precisam convergir para o mesmo diretório de cache; um cache já concluído e com marker, tamanho de arquivo, SHA-256 real e permissão de execução válidos é reaproveitado diretamente.
- O manifest de runtime tool do SEA descreve apenas a plataforma alvo, o id da ferramenta, a versão da ferramenta, o nome do binário, o tamanho e o SHA-256. O caminho do cache e o manifest não podem depender da versão do ZCode/CLI; o desktop não-SEA, o CLI de código-fonte e o runtime remote continuam usando suas próprias cadeias de descoberta.
- O Windows x64/arm64 do SEA embute `ugrep 7.8.4` e `ripgrep 14.1.1`; o `find` continua com fallback para Git Bash/system. As duas arquiteturas precisam passar pela verificação de formato PE alvo e de dependências estáticas, e o x64 tem um E2E de runtime real independente; o arm64 continua sendo um item explicitamente pendente de validação até completar o E2E equivalente em uma máquina alvo disponível, e não se pode alegar que a validação de runtime da arquitetura alvo foi concluída só porque o SEA suporta extrair ferramentas arbitrárias.
- O env aceito pelo runtime tool resolver precisa atravessar o caminho de binário explícito, o server runtime root e a busca no PATH, sem ler parte por argumento e parte por leitura implícita do `process.env` global.
- A informação de localização de binários local do desktop e a versão de implantação do pacote de recursos remote são dois tipos distintos de metadata. O manifest do remote Linux reaproveita explicitamente o mesmo native-search release plan e publica `bfs-v4.1.1-2`, `ugrep-v7.8.4-1` e o Microsoft `ripgrep-v14.1.1-1`; o remote Darwin continua publicando o histórico `ripgrep-v13.0.0-10`. O producer remote precisa escolher explicitamente essas duas cadeias de dependências por plataforma alvo, sem deixar o release plan do desktop reescrever o Darwin remote implicitamente e sem apagar assets de release históricos.
- O backend de embedded-search padrão do Agent segura diretamente os caminhos dos três programas nativos `bfs` / `ugrep` / `rg`. O prelude do Bash não inicia mais a camada de forwarding Node via `__internal-search`; quando `bfs` / `ugrep` não são executáveis, ele recorre respectivamente ao system `find` / `grep`; quando o shell já tem um `rg` executável, nada muda, e quando falta, uma função é adicionada para executar diretamente o `rg` embutido.
- Os argumentos fixos de `find` precisam estar na ordem `-S dfs -regextype findutils-default "$@"`.
- Os argumentos fixos de `grep` precisam estar na ordem `-G --ignore-files --hidden -I --exclude-dir=.git --exclude-dir=.svn --exclude-dir=.hg --exclude-dir=.bzr --exclude-dir=.jj --exclude-dir=.sl "$@"`; os argumentos padrão vêm antes e os argumentos do usuário depois.
- O `grep` contorna o `ugrep` e chama direto o system `grep` ao encontrar `-*-filter*`, `-*-pager*`, `-*-view*`, `-*-format-open*`, `-*-config*`, `---*`, `-@*`, `-*-save-config*`, `-[Zz]*`, `-[!-]*[Zz]*`, `--null` ou `--null-data`; os últimos quatro grupos servem para preservar a semântica de null-data/opções curtas do GNU grep, que difere das opções comprimidas do ugrep.
- Para acionar a extração do ugrep por meio do `grep` embutido, usa-se `--decompress`; `-z` / `-Z` e `--null` / `--null-data` ficam reservados ao caminho de compatibilidade do system grep.
- O fallback de `rg` no Bash não adiciona flags padrão e apenas entrega o `"$@"` do usuário como é ao ripgrep do pacote; argumentos como `--no-config`, usados por chamadas internas de busca de arquivos, não fazem parte do contrato da shell function do Bash.
- O E2E pode escrever em um diretório temporário via `--output-dir`, sem poluir o asset de runtime oficial.
- Download, compilação e dependências intermediárias ficam em um diretório de trabalho temporário separado e são limpos por padrão depois de sucesso ou falha. As flags de dependência gravadas nos metadados do binário precisam usar caminhos relativos estáveis e não podem registrar diretórios temporários aleatórios, senão o SHA-256 da mesma versão de ferramenta do mesmo target sofreria drift; apenas argumentos de debug explícitos podem preservar o diretório de trabalho.
- Artefatos de build não são commitados no Git. O `pre-dev` de desenvolvimento usa os mesmos verificadores de versão, feature, arquitetura e ABI do build de release para decidir se o sidecar local de native search é válido; quando o arquivo está ausente ou a verificação falha, o artefato é preparado de novo, e o estado ready não pode ser decidido apenas pela existência do caminho. O fluxo de pacote do desktop prepara os artefatos na etapa de build; o runtime do aplicativo instalado não faz download de fonte nem compilação on the spot.
- O prepare do desktop, a detecção de asset ausente e o `extraResources` precisam ler o mesmo release plan de `platform-arch`. Um novo alvo normalmente só entra no conjunto habilitado para release depois de um build real e de uma validação E2E independente bem-sucedidos, e não pode ser habilitado inteiro só porque a outra arquitetura do mesmo OS passou; cada empacotamento oficial de um alvo já habilitado não repete o E2E de comportamento. O Windows arm64 é o branch de publicação cruzada existente explicitamente retomado nesta rodada; seu gate estático PE não pode ser registrado como E2E de runtime concluído, e continua precisando de validação posterior na máquina alvo.
- Os artefatos pré-compilados precisam passar pela verificação estática de formato Mach-O / ELF / PE e de arquitetura alvo em um caminho de extração temporário, antes de sobrescrever o caminho oficial e escrever o bundle metadata. O bundle metadata só verifica se o arquivo local mudou depois, e não pode usar o SHA-256 calculado do próprio arquivo baixado como prova de confiabilidade da origem; um cache que já tem metadata também precisa passar de novo pela verificação alvo para poder pular o download.
- O release plan precisa distinguir explicitamente a saída de build nativo do sidecar empacotado dinamicamente pelo Electron; os chamadores de desktop/SEA não podem mais montar à mão branches de download do ripgrep legado específicos de plataforma.
- Os pacotes de release do desktop macOS arm64/x64 carregam via `extraResources` os sidecars `bfs` / `ugrep` / `rg` da arquitetura correspondente e reaproveitam uniformemente a cadeia de assinatura e notarização dos bundled-tools. Os dois jobs de pacote do macOS executam apenas o verifier de asset, a assinatura e a notarização, sem rodar o E2E de toolcall do Bash antes da assinatura. O aviso de licença de terceiros continua pertencendo à lista de compliance antes da release oficial; artefatos temporários de E2E não entram no pacote de release.
- O prepare de todas as plataformas precisa baixar o arquivo fixo com SHA-256 do Microsoft `rg 14.1.1`; o producer não pode produzir `rg`. O prepare do desktop e a correção de asset ausente não podem chamar a cadeia de download legada `prepare:rg`.
- Os jobs de CI do Linux x64/arm64 precisam entrar em ambientes de execução consistentes com a arquitetura alvo; podem ser runners nativos ou um ambiente de arquitetura alvo explicitamente escolhido com `docker --platform`. A tag do runner ou o nome da imagem em si não servem como critério de liberação: o arch visto pelo processo de build, os gates reais de Node/glibc/CC/CXX e a verificação final de arquitetura/ABI do ELF precisam corresponder todos.
- O `build:windows:x64` / `build:windows:arm64` oficiais continuam reaproveitando o runner `windows` existente; o runner x64 atual gera cross os artefatos arm64 de Electron/NSIS e de native search. Os dois alvos precisam ler diretamente o PE header e a import table para verificar machine e runtime estático, mas o job de empacotamento não executa o E2E completo de runtime.

## Fronteiras de recursos do Linux remote e do WSL

Depois que a cadeia de producer, os arquivos compartilhados e o consumo de empacotamento do Linux x64/arm64 estiverem validados, o Linux remote (WSL, SSH Linux, Docker Linux) reaproveita o mesmo native-search release plan do desktop/SEA:

```text
Linux x64/arm64 producer
        |
        v
bfs 4.1.1-2 / ugrep 7.8.4-1 immutable archives + Microsoft rg 14 musl archive
        |
        +-------------------------+
        |                         |
        v                         v
Linux desktop / SEA       Linux remote asset manifest
                                  |
                                  v
                         bfs / ugrep / ripgrep components
        |
        v
WSL / Linux SSH / Linux Docker
  -> find: bfs 4.1.1
  -> grep: ugrep 7.8.4
  -> rg: system rg 优先，缺失时使用 bundled rg 14.1.1

Darwin remote asset manifest
        |
        v
legacy ripgrep 13 component
```

O remote resource id, a allowlist de montagem do manifest, o loop de implantação e o runtime descriptor precisam ser conectados na mesma mudança, sem deixar apenas o prelude do Bash vendo um caminho inexistente. Essa integração reaproveita o shared host e o runtime do Agent já existentes, não cria um novo runtime de Agent para WSL, não muda a identidade do workspace e não toca na fronteira de entrega do `desktop-continuous` do desktop nem do `web-remote-replayable` do celular.

## Contrato E2E

O E2E de macOS/Linux/Windows x64 é uma entrada de validação independente que, por padrão, chama o prepare real a partir de um diretório temporário vazio. O runner externo só é responsável por construir o conjunto de producer do alvo, baixar o Microsoft `rg`, executar a verificação de versão/feature/ABI e iniciar uma única execução real de E2E de toolcall do Bash, sem manter um conjunto duplicado de fixtures e asserções de comportamento. A validação no Linux pode primeiro gerar e verificar o `bfs` / `ugrep` próprios no producer da arquitetura correspondente, deixando o prepare completar o Microsoft musl `rg`, e então entregar o mesmo conjunto de artefatos oficiais ao E2E de runtime por `ZCODE_BFS_BINARY` / `ZCODE_UGREP_BINARY` / `ZCODE_RG_BINARY`; não se pode compilar a mesma ferramenta em dois estágios. O Windows usa o `ugrep` próprio e o Microsoft `rg`, deixando o `find` com o Git Bash/system. O fixture cross-target e o verifier PE do Windows arm64 provam apenas o contrato de compilação, coleta e dependências estáticas e não se passam por E2E de runtime da arquitetura alvo. O E2E de toolcall precisa construir os packages prévios do workspace raiz conforme as dependências reais de `@zcode/bootstrap`, sem depender de um `dist` pré-existente no workspace. A cadeia completa cobre pelo menos:

`pnpm test:sea-runtime-tools:e2e` é o E2E de host da entrega de arquivo único do SEA: ele constrói o SEA do target atual, copia o artefato para um diretório isolado sem sidecars, verifica a primeira extração, o reuso na segunda, versão/SHA/permissão de execução e então entrega o caminho extraído para o mesmo E2E real de toolcall do Bash. Esse comando não pode deixar cache de runtime-tool nem diretório temporário no storage root padrão do usuário e não pode ser um passo anterior ao empacotamento Electron do desktop.

Os fixtures cross-target dos testes unitários do SEA verificam apenas o contrato de manifest e de coleta de assets; eles não substituem o build nativo real de cada plataforma, o E2E de host do SEA ou o gate de agregação de artefatos multiplataforma. A regressão de package-script precisa provar que `build:sea` sempre passa `--all`; um target novo e ainda incompleto pode fazer o build de release falhar de forma explícita, mas não pode mudar o comportamento dos comandos existentes.

O empacotamento oficial do desktop gera os artefatos `bundled-tools/<platform>-<arch>` apenas por `prepare:desktop-runtime` e só entra no empacotamento do Electron depois das verificações mecânicas de versão, feature, arquitetura, ABI e assinatura; os templates de empacotamento de macOS, Linux e Windows não podem chamar `pnpm test:native-search:e2e` nem `pnpm test:sea-runtime-tools:e2e`. Quando for preciso validar comportamento, a entrada de E2E independente consome por caminho absoluto os artefatos gerados pelo mesmo release plan.

1. macOS/Linux validam `bfs --version`, Windows valida `find --version` do system; todas as plataformas validam a versão e a string de capacidades de `ugrep --version`.
2. `file` mais as ferramentas de verificação da plataforma validam a arquitetura alvo e a fronteira de dependências dinâmicas do `bfs`, `ugrep` e `rg` finais distribuídos com o pacote: o macOS usa `otool -L` / `vtool -show-build`, o Linux usa `readelf -d` para validar dependências dinâmicas e `readelf --version-info` para afirmar que a maior referência GLIBC de `bfs` / `ugrep` não é maior que 2.28, e o Windows lê diretamente o PE header / import table para verificar machine, rejeitando a CRT dinâmica e as libs PCRE2 e de compressão que deveriam estar linkadas estaticamente.
3. Consultas de diretório, profundidade, tipo, nome e regex de `bfs -S dfs -regextype findutils-default`.
4. Busca recursiva de `ugrep -G --ignore-files --hidden -I` com parâmetros de exclusão de VCS.
5. Arquivos hidden podem ser buscados, arquivos de ignore e diretórios de VCS são excluídos e arquivos binários são excluídos por `-I`.
6. Busca apenas por stdin, código de saída sem match, código de saída de regex inválido e fechamento prematuro do pipe por `head`.
7. `-E`, `-F` e `-P` nos argumentos do usuário conseguem sobrescrever o `-G` padrão, validando o PCRE2 e a capacidade de busca com descompactação gzip, bzip2, zstd, Brotli, zip/archive.
8. O backend padrão resolve os três programas nativos por `ZCODE_BFS_BINARY` / `ZCODE_UGREP_BINARY` / `ZCODE_RG_BINARY` e entra no `NodeExecutionAdapter` pelo handler da entrada real de tool do Bash, sem que o teste construa manualmente um `ExecutionRequest` para pular a fronteira de toolcall.
9. Pelo menos um toolcall Bash completo precisa provar simultaneamente o acerto real de `bfs 4.1.1` (system find no Windows) / `ugrep 7.8.4` / `ripgrep 14.1.1` e cobrir toda a capacidade de integração que o ZCode promete para o embedded search: diretório, profundidade, tipo, nome e regex GNU find do `bfs`; recursão, filtros hidden/ignore/VCS/binary, stdin, `-E` / `-F` / `-P`, desvio para o system grep em argumentos especiais, arquivos compactados e archive, códigos de saída e fechamento prematuro de pipe do `ugrep`; arquivos/glob, hidden, stdin, fixed string, PCRE2, códigos de saída e fechamento prematuro de pipe do `rg`.
10. Um `rg` já executável no shell não pode ser sobrescrito pelo `rg` do pacote; quando o shell não tem `rg`, ele executa `ZCODE_RG_BINARY` diretamente e não pode recorrer a Node, WASM ou à camada de forwarding de CLI interna.
11. O E2E de toolcall precisa desativar explicitamente o execution adapter, apagar os diretórios temporários de fixture/output e habilitar a detecção de async-leak do Vitest; o build não pode deixar workdir de build/E2E, child process, timer ou promise pendente, tanto em caso de sucesso quanto de falha.

A capacidade de integração completa aqui é delimitada pelos parâmetros que o ZCode realmente injeta e pelos comportamentos correspondentes, sem exigir uma enumeração de todos os parâmetros independentes da CLI upstream de `bfs`, `ugrep` e `rg`. `ugrep --version` ainda precisa afirmar o feature set completo compilado; os testes de comportamento precisam executar pelo menos gzip, bzip2, zstd e Brotli, e usar zip e tar como representantes do caminho de busca em archive.

Os testes upstream servem apenas como evidência complementar em upgrades de versão de fonte ou ajustes da cadeia de build e podem ser executados via flags de build explícitas com `ugrep make test` e os unit tests do `bfs`; não são um gate obrigatório de cada release build. O gate de empacotamento oficial tem como referência os SHA fixos de fonte/arquivo e os verificadores de versão/feature/arquitetura/ABI; o E2E real de toolcall do Bash na arquitetura alvo é evidência de validação independente e não é repetido a cada build de instalador. O cross-build atual do Windows arm64 passa apenas pela verificação estática PE e é uma validação de release pendente após o commit do código, e não evidência de E2E concluída. O Bash 3.2 que acompanha o macOS não tem `coproc`, usado pelo harness de teste de integração do bfs, então o E2E do repositório não pode depender desse harness e deve cobrir diretamente as combinações de parâmetros que o ZCode realmente usa.

## Integrações seguintes

macOS arm64/x64 já está integrado ao asset de runtime local do desktop e oferece um E2E de toolcall Bash independente para a arquitetura correspondente. O `bfs` / `ugrep` do Linux são construídos por um producer que passa nos gates de Node 24 / glibc 2.28 / GCC 12 / G++ 12, e o `rg` das duas arquiteturas usa o arquivo musl estático da Microsoft; os artefatos combinados passam por verificações de versão, feature, arquitetura, dependências dinâmicas e teto GLIBC 2.28 no empacotamento de desktop/SEA e de Linux remote, e o E2E completo de toolcall do Bash roda de forma independente. O CI de Windows x64/arm64 gera `ugrep.exe` pelo builder MSVC/CMake e baixa o `rg.exe` da arquitetura correspondente do Microsoft release; os dois alvos precisam passar pela verificação estática de dependências PE, o Git Bash toolcall e o E2E de SEA do x64 permanecem como validação independente e o arm64 segue a cadeia de publicação cross-build existente. O Darwin remote mantém temporariamente o componente histórico rg13, e a migração posterior precisa ser feita como uma mudança separada.

Plataformas sem artefatos nativos continuam com o prelude do Bash recorrer ao system `find` / `grep`, e não podem recorrer à camada de forwarding Node. A integração de novas plataformas não pode mudar o contrato existente do embedded branch visível ao provider.