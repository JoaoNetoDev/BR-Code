# Spec do Runtime de Produto CUA no Windows

## Objetivo

Permitir que o pacote de instalação do ZCode para Windows x64/arm64 inicie o Computer Use Helper
local sob demanda, sem depender de um diretório de código-fonte local do `zcode-cua` e sem controlar
workspaces SSH/WSL/Docker/remotos, reutilizando o `@zcode/protocol` existente, o CUA broker, o plugin
oficial `zcode-cua` e o ciclo de vida do host local do desktop.

O desenvolvimento por código-fonte continua permitindo o override dos recursos de produto via
`ZCODE_CUA_DEV_ROOT`; por padrão o pacote de instalação lê apenas o próprio
`resources/tools/cua-helper`, não busca diretórios vizinhos, não baixa o Helper e não recorre à
implementação de macOS.

## Conclusões de Design

O Windows segue a fronteira já validada no macOS de "o Agent se conecta apenas ao broker e o Helper
detém a capacidade de automação de forma independente", mas não replica a forma do macOS de publicar um
`.app`/SEA separado só para autorização TCC. O Windows não tem requisito equivalente de sujeito de
autorização TCC, então o Helper é iniciado pelo runtime Electron Node dentro do pacote de instalação, e
o `ax_native.node` nativo é publicado como recurso de instalação.

`@zcode/zcode-cua` é a única identidade de pacote do JavaScript do Helper, do source nativo, do addon e
da verificação de versão; não se pode declarar novamente um alias de helper-runtime para o mesmo commit
do Git. O CI de macOS/Windows precisa reconstruir o addon da arquitetura alvo a partir do pacote
canônico, e deve falhar de forma fechada quando faltar `binding.gyp` ou o source da plataforma.

```text
构建期

固定提交的 @zcode/zcode-cua（或构建期显式 ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR）
  ├─ package.json:zcodeCuaRuntime.windows.entry
  ├─ package.json:zcodeCuaRuntime.windows.nativeAddon
  └─ 外置运行依赖 express / sharp
                 |
                 v
prepare:windows-cua-helper
  ├─ 校验 package 身份、目标 win32 架构和 PE machine
  ├─ 复制最小运行文件
  └─ 生成带 SHA-256 的 runtime-manifest.json
                 |
                 v
bundled-tools/win32-{x64|arm64}/cua-helper
                 |
                 v
electron-builder extraResources + Windows signExts(.node/.dll)
  ├─ 复制时先签名最终目录中的 .node/.dll
  ├─ afterPack 按实际 context 校验 win32/arch 与配置目标一致
  ├─ 只用最终已签名字节刷新 manifest.sha256
  └─ 再严格校验 manifest / PE / hash / 依赖闭包 / realpath containment
                 |
                 v
<安装目录>/resources/tools/cua-helper
```

```text
运行期（仅 desktop-local）

官方 CUA 插件启用
  -> host 延迟解析 Windows runtime
     -> 若 ZCODE_CUA_DEV_ROOT 非空：严格使用显式源码根
     -> 否则：严格使用 process.resourcesPath/tools/cua-helper
        -> 校验 manifest / win32 / arch / Electron 版本 / 文件哈希
           -> Electron.exe + ELECTRON_RUN_AS_NODE=1 fork windows-helper.js
              -> Helper 加载 ax_native.node
                 -> named pipe broker ready + health PID 复核
                    -> Agent 获得 socket/token/pluginAuthority
```

`desktop-attached-remote`, `standalone-server` e hosts com remote workspace identity continuam não
criando Helper padrão. Esta mudança não adiciona runtime, local host nem sessão SSH/WSL/Docker, e também
não altera a semântica de replayable, owner, queue, snapshot ou workspace identity do `/remote` do
celular.

## Contrato dos Recursos Publicados

O produtor deve expor em `package.json` um contrato de runtime Windows estrito e versionável:

```json
{
  "zcodeCuaRuntime": {
    "schema": 1,
    "windows": {
      "entry": "dist/windows-helper.js",
      "nativeAddon": "build/Release/ax_native.node"
    }
  }
}
```

O objeto de contrato e o subobjeto Windows não permitem campos desconhecidos; os dois artifacts devem
ser caminhos relativos canônicos separados por `/`, não podem ser iguais e não podem conter barra
invertida, caminho absoluto, segmento vazio, `.`, `..`, dois-pontos de ADS ou NUL. O consumidor não
pode mais fixar a versão do produtor ou o diretório de artifacts.

O diretório de produto é fixado em `resources/tools/cua-helper` e contém no mínimo:

- `runtime-manifest.json`
- `package.json` (declara `"type": "module"`; a version é igual a `packageVersion` do manifest)
- o arquivo Helper apontado pelo `entry` do contrato
- o módulo nativo apontado pelo `nativeAddon` do contrato
- `node_modules/express` e seu fechamento de dependências de runtime
- `node_modules/sharp` e os pacotes pré-compilados `@img/*` da plataforma alvo

A declaração de módulo em `package.json` é uma exigência rígida
(ZCT-2093176018262081536): o entry é um ESM com `import` cru; se a raiz do runtime não tiver o
package.json mais próximo, o Node só pode recorrer à detecção sintática de módulo. Qualquer
package.json solto com `"type"` na cadeia de diretórios do disco de instalação desativa essa detecção e
faz o Helper falhar com `SyntaxError`, exit 1,aparecendo como `broker_unavailable`. O staging é responsável por
gerar esse arquivo, e o verificador do afterPack por checar sua existência, seu tipo e a consistência de
versão.

A versão do schema do manifest é `1` e os campos são fixos:

```json
{
  "schemaVersion": 1,
  "packageName": "@zcode/zcode-cua",
  "packageVersion": "0.5.2",
  "platform": "win32",
  "arch": "x64",
  "electronVersion": "41.0.3",
  "entry": "dist/windows-helper.js",
  "addon": "build/Release/ax_native.node",
  "sha256": {
    "entry": "<lowercase hex>",
    "addon": "<lowercase hex>"
  }
}
```

Os caminhos e versões do exemplo servem apenas para ilustração. O staging deve gravar em `entry`/`addon`
os caminhos de contrato do produtor atual exatamente como são, e em `packageVersion` a versão do
package atual exatamente como é, como rastreamento de origem; o runtime só exige que seja uma string não
vazia e não compara com a constante de versão dentro do ZCode. A escolha real da versão publicada
continua sendo gerenciada pelo commit exato do lockfile.

`arch` aceita `x64` ou `arm64`. O build precisa verificar a PE machine do `.node`: `0x8664`
corresponde a x64 e `0xaa64` a arm64. Quando o alvo não corresponde, o build falha imediatamente, e é
proibido instalar por engano um artefato x64 do host em um pacote arm64.

A dependência publicada precisa ser fixada em um commit exato de `zcode-cua` obtenível remotamente; não
se pode usar referência flutuante de branch, adivinhação por diretório vizinho ou compilação temporária
na instalação. `ZCODE_CUA_DEV_ROOT` serve apenas como override explícito de desenvolvimento local.

## Admissão em Runtime e Semântica de Falha

1. Quando a plataforma não é `win32`, o resolver do Windows retorna `unsupported-platform` estável.
2. Quando `ZCODE_CUA_DEV_ROOT` não está vazio, ele precisa ser um caminho absoluto, e as validações de
   package/entry/addon continuam sendo executadas; com configuração errada o sistema falha de forma
   fechada, sem recorrer aos recursos de produto.
3. Sem o override de desenvolvimento definido, é preciso que exista um `resourcesPath` absoluto, e a
   raiz de produto é derivada de forma fixa como `tools/cua-helper`.
4. No modo produto é preciso validar o schema do manifest, packageName, platform, arch, a versão do
   Electron, os caminhos relativos de entry/addon e o SHA-256.
5. O diagnóstico reporta apenas reason estável e artifact relativo, sem emitir variáveis de ambiente
   alheias, tokens ou conteúdo de arquivos.
6. O Helper continua com inicialização tardia; com a feature desligada ou o plugin oficial não
   habilitado, ele não inicia, não é sondado e não gera subprocesso.
7. start/stop/restart/health, ready PID, health PID, token de named pipe e semântica de bloqueio no
   encerramento seguem o host Helper de Windows existente, sem introduzir um segundo ciclo de vida por
   causa da produtização.

A admissão de source e o staging não podem checar apenas caminho lexical. O source root precisa ser um
diretório sem link; `package.json`, entry e addon precisam ser arquivos regulares sem link, e o
`realpath` de cada um precisa estar fisicamente contido no `realpath` do source root. Assim, mesmo que
diretórios intermediários sejam substituídos por junction/reparse point, nenhum arquivo de fora do
repositório é trazido para o runtime de desenvolvimento ou para o pacote de instalação.

## Assinatura e Limites de Instalação

- O build de publicação do Windows continua sendo assinado uniformemente pelo hook vsigntool do
  repositório.
- `electron-builder.win.signExts` precisa conter `.node` e `.dll`, para que o addon do CUA, o
  addon/libvips do Sharp e outras dependências nativas do pacote entrem no mesmo momento de assinatura.
- Builds locais sem certificado podem gerar um pacote de teste não assinado, mas não podem declarar que a
  verificação de assinatura de publicação foi concluída.
- O electron-builder 26 assina `.node`/`.dll` pelo transformer do Windows ao copiar `extraResources`, e a
  assinatura altera os bytes do arquivo. O `afterPack` precisa primeiro validar os campos fixos do
  manifest, os caminhos, a arquitetura PE, o fechamento de dependências e a relação de contenção
  física, refreshing apenas o SHA-256 de entry/addon no diretório final, e então executar mais uma
  verificação estrita que inclui os hashes; não se pode continuar usando o hash dos bytes não assinados da
  fase de staging.
- O `afterPack` do Windows precisa obter o os/arch reais a partir do context do electron-builder e ser
  estritamente igual ao alvo de configuração; em cross-build `--win` ou com variáveis de ambiente
  inconsistentes, precisa falhar, sem retornar skipped nem aceitar pela arquitetura errada.
- O update do pacote reutiliza o canal de atualização já existente do app desktop; o Helper não
  estabelece estado de download/atualização independente.

```text
staging manifest（未签名字节 hash）
  -> extraResources copy
     -> Windows transformer 签名 .node/.dll
        -> afterPack 校验实际 win32/arch
           -> 校验固定契约 + PE + dependency closure + realpath containment
              -> 刷新最终字节 hash
                 -> 严格复验最终 manifest
                    -> 后续 EXE/app.asar 签名（不再改 resources/tools/cua-helper）
```

## Aceitação

A automação precisa cobrir no mínimo:

- os dois caminhos de resolução, source override e runtime empacotado;
- source override com configuração errada sem fallback;
- qualquer incompatibilidade de schema/platform/arch/Electron/hash do manifest causar falha fechada;
- a feature do Windows ainda consegue criar o host de produto tardio sem `ZCODE_CUA_DEV_ROOT`;
- ambientes não desktop-local e remote workspace identity continuam recusando a criação;
- a verificação de PE machine de x64/arm64 no staging;
- source/staging recusando symlink e escape físico causado por junction/reparse point;
- o electron-builder incluindo os recursos do Helper, as extensões de assinatura `.node`/`.dll`, a
  asserção de alvo do context, e o refresh de hash após a assinatura com reverificação estrita no
  afterPack;
- carregamento direto do `ax_native.node` em staging pelo Electron 41;
- inicialização do Helper a partir da raiz de produto staged/packaged, completando ready/health e,
  após a saída, confirmando que o named pipe não aceita conexão e que não sobrou subprocesso Helper;
- os smoke tests atuais de source/live das 30 ferramentas no Windows sem regressão.

Os gates de nível de repositório continuam sendo `pnpm typecheck` e `pnpm lint`. Falhas de
`test:unit:affected` já existentes no branch atual e sem relação com CUA precisam ser listadas
separadamente, sem se passar por regressão de CUA.

## Registro de Aceitação Local de Produto (2026-07-29)

A aceitação do `--dir` no Windows precisa carregar explicitamente o nome de arquivo de configuração não
padrão do repositório; rodar `electron-builder --win --x64 --dir` sem opções não carrega
`electron-builder.config.js` e reporta erroneamente que falta version no `package.json` do desktop antes
da injeção de `extraMetadata.version`. O comando correto é:

```powershell
Remove-Item Env:ZCODE_CUA_DEV_ROOT -ErrorAction SilentlyContinue
$env:ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR='D:\path\to\zcode-cua'
$env:ZCODE_SKIP_REMOTE_ASSETS='1'
$env:ZCODE_TARGET_OS='win32'
$env:ZCODE_TARGET_ARCH='x64'
pnpm --filter @zcode/desktop build
pnpm --filter @zcode/desktop exec electron-builder `
  --config electron-builder.config.js --win --x64 --dir
Remove-Item Env:ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR
```

Nesta máquina, o produtor local foi selecionado explicitamente por
`ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR` para concluir o staging de `@zcode/zcode-cua`; o
workspace/lockfile continua mantendo a dependency fixada e exata, obtenível remotamente, com alvo
win32/x64 e PE machine do addon `0x8664`. O diretório de recursos do artefato é
`<workspace>\packages\desktop\dist\win-unpacked\resources` e o manifest é
`resources\tools\cua-helper\runtime-manifest.json`. Depois de uma interrupção de download no GitHub, foi
reaproveitado o `electron-v41.0.3-win32-x64.zip` já em cache e verificado pelo `checksums.json`
oficial do Electron; o SHA-256 do zip é
`93346b31dfcd779c4c4cdfdfb2e3f9642e7a9888e388a8971ff3e95dbf948887`.

O limite de 20 minutos do executor de comandos local foi interrompido exatamente enquanto o `rcedit`
modificava o branded `ZCode Preview.exe`; a versão do exe remanescente continuou sendo Electron `41.0.3`,
e o hash também difere do `electron.exe` original do cache; por isso o Windows Application Control
recusou iniciá-lo. Aquele comando não tem um exit code final confiável e não pode ser registrado como
sucesso de branded unpacked build. Executar de forma independente o mesmo
`verifyPackagedWindowsCuaHelper` do afterPack já verificou nos resources finais o manifest, os hashes de
entry/addon, o PE, o fechamento de dependências express/Sharp e a relação de contenção física,
retornando `verified`.

Para verificar somente os resources empacotados e a ABI alvo, o Electron `41.0.3` x64 original foi
extraído do zip exato acima (SHA-256 do exe
`c3ff0b19217c3f3521bd392899cffa65b0f0c0aae500ee0291e85490a52327d4`) e executado no mesmo diretório dos
recursos do Electron unpacked; sua versão é Electron `41.0.3`, Node embutido `24.14.0` e N-API `10`. O
teste de integração de produto usa esse executable apenas para cobrir o `command` do resolver, enquanto
todo o restante — root/entry/addon/node_modules — vem dos resources empacotados acima. O Helper PID
registrado no gate especial final é `39992`; ready, health e o PID de `broker_info` são totalmente
iguais, após `stop()` uma nova conexão de named pipe é recusada em 500 ms, o PID exato sai e o token não
aparece no argv nem nos logs capturados.

Todos os smoke tests live com o mesmo entry/addon/node_modules empacotados saem com exit `0`:

- pointer: mover, rolagem zero, observação/restauração de posição, interrupção de hold e clean exit do
  Helper passam todos;
- clipboard: leitura de texto, escrita/leitura de marker, conferência de restauração do texto original e
  clean exit do Helper passam todos;
- screen: WGC de display/window, equivalência de oclusão, `capture_app`, `state_image`, falha fixa ao
  minimizar, restauração do cursor e clean exit de Helper/fixture passam todos;
- superfície canônica de ferramentas: as 30 ferramentas estão válidas, com 28 ferramentas de
  observation/display/pointer/keyboard/semantic/focus/runtime passando; os dois itens de clipboard são
  cobertos pelo smoke companion.

Esta máquina não tem certificado de publicação, então a aceitação de ABI/resources acima não pode ser
extrapolada para a aceitação do executable branded/assinado final. O CI/build de assinatura ainda
precisa rodar por completo `rcedit -> .node/.dll/exe signing -> afterPack` e executar novamente o teste
de ciclo de vida do branded exe; não se pode desativar o Windows Application Control por causa da
aceitação local.

## Fora de Escopo

- Não controlar nem adicionar SSH, WSL, Docker, workspace remoto, runtime de `/remote` do celular.
- Não criar um downloader, instalador ou auto-updater separado para o Helper no Windows.
- Não adicionar elevação de administrador no Windows; alvos de alta integridade continuam falhando de
  forma fechada.
- Esta fase não promete gestão precisa de cor HDR/ICC; a correção da captura de desktop comum do WGC
  segue a conclusão da fase de código-fonte.