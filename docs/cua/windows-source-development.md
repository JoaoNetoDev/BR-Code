# Manual de Desenvolvimento e Execução do CUA no Windows a partir do Código-fonte

Este manual cobre apenas o caminho de desenvolvimento local na área de trabalho do usuário conectado no Windows. Ele não se aplica a SSH, WSL, Docker, workspace remoto ou `/remote` no celular; esses caminhos não conseguem iniciar nem se anexar ao Windows Computer Use Helper.

## Preparar o Helper de código-fonte

Primeiro, na raiz de código-fonte do `zcode-cua`, construa o Helper JavaScript e o addon N-API nativo:

```powershell
$zcodeCuaRoot = 'D:\path\to\zcode-cua'
Set-Location $zcodeCuaRoot
pnpm install
pnpm rebuild:native
pnpm build
pnpm test
```

Após a build, os dois arquivos declarados em `package.json.zcodeCuaRuntime.windows` precisam existir. O exemplo atual do contrato é:

```text
<zcode-cua>\dist\windows-helper.js
<zcode-cua>\build\Release\ax_native.node
```

Sempre que modificar o código-fonte de `zcode-cua`, execute novamente `pnpm rebuild:native` (ao alterar o addon nativo) e `pnpm build`. Não é preciso reempacotar o produto ZCode.

Se o Windows Smart App Control estiver em modo obrigatório, o `ax_native.node` recém-compilado e não assinado pelo Trusted Root Program CA será rejeitado no carregamento pelo Code Integrity; compilar com sucesso não significa que ele é executável na máquina atual.
Nesse caso, o live smoke sai com código 2 antes de criar o Helper/fixture e reporta native addon blocked ou
unavailable. Não desligue automaticamente políticas de segurança do sistema para a aceitação do código-fonte; use um build com assinatura de desenvolvimento confiável ou revalide em uma máquina de desenvolvimento dedicada que permita módulos nativos locais não assinados. A assinatura de produto e o ciclo fechado do instalador não fazem parte da etapa deste manual.

## Iniciar o ambiente de desenvolvimento desktop

O plugin oficial `zcode-cua` precisa estar habilitado. Em seguida, na raiz do código-fonte do ZCode, execute:

```powershell
$zcodeRoot = 'D:\path\to\z-code'
Set-Location $zcodeRoot
$env:ZCODE_CUA_DEV_MODE='1'
$env:ZCODE_CUA_DEV_ROOT=$zcodeCuaRoot
pnpm dev:desktop:prod
```

`ZCODE_CUA_DEV_MODE=1` é o bundle one-knob já existente: ele também habilita a feature interna de desenvolvimento. Não o substitua nem o quebre em novas variáveis de ambiente. `ZCODE_CUA_DEV_ROOT` é usado apenas para resolver artefatos de build do código-fonte e só pode ser usado pelo Windows Host local do desktop.

`ZCODE_CUA_DEV_ROOT` precisa apontar diretamente para a raiz física do código-fonte: a raiz não pode ser symlink/junction,
`package.json`, a entry do contrato e o nativeAddon também precisam ser arquivos comuns não-ligados, e o `realpath` precisa estar
dentro dessa raiz. Em caso de reprovação na admissão não há fallback para recursos do instalador; corrija o layout de diretórios e não use links para contornar o isolamento.

Se `ZCODE_CUA_DEV_ROOT` não for definido, `pnpm dev:desktop:prod` se conecta por padrão ao producer já instalado neste repositório
(`<repo>\node_modules\@zcode\zcode-cua`, ou seja, a versão fixada no catálogo do `pnpm-workspace.yaml`, de mesma origem que o staging do
produto), correspondente a `scripts/dev-desktop-cua-env.mjs`. Isso é apenas o padrão: ao validar suas próprias
mudanças de producer, defina a variável explicitamente conforme acima; um valor explícito sempre tem precedência. Em dev, o
`process.resourcesPath` do Electron aponta para `node_modules/electron/dist/resources`, onde não existe
`tools/cua-helper`; portanto, sem definir nenhum valor, o branch de produto inevitavelmente falha com `invalid-runtime-manifest`.

Os processos e o encadeamento de comunicação esperados são:

```text
ZCode desktop Host Process
  └─ Node/Electron child: package.json 声明的 entry
       ├─ package.json 声明的 nativeAddon
       └─ \\.\pipe\zcode-cua-<random>

official zcode-cua plugin ── authenticated broker RPC ──┘
```

A autenticação por broker token foi removida por completo na refatoração do node_repl: o portão de conexão passou a ser native peer-identity (code-signature /
`parentProcessPid`), e nenhum broker token é mais injetado no ambiente do Helper. `ZCODE_CUA_PERMISSION_BROKER_TOKEN` agora existe apenas como **entrada hostil que precisa ser removida**
(ver `must-not-be-forwarded` em `windowsCuaDevRuntime.test.ts` e os testes `zcode-cua-plugin-host-authority` do lado do CLI), e não é mais uma fonte de credenciais; não há mais nenhum injetor no código-fonte. Não o
confunda com o `ZCODE_NODE_REPL_BROWSER_BROKER_TOKEN` do browser-use, que pertence ao node_repl browser
broker, outra cadeia. As credenciais oficiais restantes são apenas a tupla socket + `pluginAuthority`, entregue pelo Host ao plugin oficial por meio de
`buildCuaProductHelperAgentEnv()`, sem aceitar sobrescrita por configuração de plugin escrita pelo usuário.
`pluginAuthority` é a única credencial sensível atual e não pode aparecer em argv do child, título do processo, logs, textos de erro,
telemetry ou textos de UI copiáveis.

## Validar o Helper de código-fonte

Primeiro confirme que o Helper de código-fonte foi construído conforme a seção anterior e então execute o teste opt-in em máquina real:

```powershell
Set-Location $zcodeRoot
$env:ZCODE_CUA_DEV_MODE='1'
$env:ZCODE_CUA_DEV_ROOT=$zcodeCuaRoot
pnpm exec vitest run packages/services/test/windowsCuaDevHelper.integration.test.ts
```

`ZCODE_CUA_DEV_MODE=1` também é obrigatório aqui, assim como ao iniciar o ambiente de desenvolvimento desktop: ele é o bundle one-knob que habilita o runtime/feature interno de
desenvolvimento (ver acima) e não basta definir apenas `ZCODE_CUA_DEV_ROOT`.

O portão de conexão do broker é native peer-identity (`getPeerCredentials` / code-signature /
`parentProcessPid`), e a validação de peer do lado Windows ainda não foi implementada. **Desde o producer `37a0c9ef` esse portão está temporariamente aberto no
Windows** (a constante do lado do producer `WINDOWS_PEER_IDENTITY_GATE_TEMPORARILY_OPEN`; de outro modo a build empacotada estruturalmente não consegue obter a isenção de dev — o `ZCODE_RUNTIME_ENV=production` injetado por `app.isPackaged` torna todos os critérios de localDev sempre false e o Helper necessariamente falharia ao iniciar). Portanto, hoje o broker não reporta mais `refusing to start an unauthenticated broker` por falta de opt-in, e sim inicia sem autenticação com uma linha de
aviso em stderr (`peer identity verification temporarily disabled`): no Windows, qualquer processo local pode se conectar a essa named pipe. Depois que as primitivas nativas de peer do M5 forem implementadas, a constante é removida, o portão se fecha automaticamente e o comportamento de recusar a inicialização é
restaurado.

Esse teste só roda quando as quatro condições são satisfeitas: Windows, `ZCODE_CUA_DEV_ROOT` definido, contrato do produtor válido e
entry/nativeAddon declarados no contrato existentes. Ele valida o child real, a named pipe aleatória, health/`broker_info`,
a listagem de aplicativos somente leitura, a tupla de ambiente do plugin oficial, o não vazamento de `pluginAuthority` e a saída do child após `stop()`. O nome da tool MCP pública é `list_apps`; o nome real da RPC somente leitura do broker de código-fonte é `list_applications`, e o teste chama por esse mapeamento já existente, sem adicionar alias nem mudar a superfície de tools do plugin.

Observe que esse arquivo não está coberto por `pnpm typecheck` (o `include` de `packages/services/tsconfig.json` cobre apenas `src`) e por padrão é ignorado no CI. Portanto, quando os símbolos da camada de serviço referenciados por ele são removidos por refatoração, não haverá nem erro de tipo nem falha de teste: só estourará como `ReferenceError` na primeira execução local em máquina real no Windows. Depois de mudar o contrato de credenciais do CUA, é obrigatório executar esse arquivo localmente uma vez; não se pode confiar no verde do CI.

## Validar recursos empacotados

A aceitação de recursos do produto e o override de código-fonte são dois caminhos independentes. Ao construir o produto é preciso remover
`ZCODE_CUA_DEV_ROOT` e passar explicitamente o arquivo de configuração do repositório para o comando `--dir`:

```powershell
Set-Location $zcodeRoot
Remove-Item Env:ZCODE_CUA_DEV_ROOT -ErrorAction SilentlyContinue
$env:ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR=$zcodeCuaRoot
$env:ZCODE_SKIP_REMOTE_ASSETS='1'
$env:ZCODE_TARGET_OS='win32'
$env:ZCODE_TARGET_ARCH='x64'
pnpm --filter @zcode/desktop build
pnpm --filter @zcode/desktop exec electron-builder `
  --config electron-builder.config.js --win --x64 --dir
Remove-Item Env:ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR
```

`ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR` apenas escolhe o producer da fase de build; ele não ativa o override de runtime do código-fonte do instalador; em tempo de execução só `ZCODE_CUA_DEV_ROOT` é reconhecido. Quando o commit local do producer ainda não foi enviado, é preciso usar o
primeiro para concluir o staging, mantendo ao mesmo tempo workspace/lockfile apontando para o commit upstream obtenível remotamente.

Os arquivos nativos do Windows são assinados quando o electron-builder copia `extraResources`, portanto o hash do
manifest de staging descreve apenas os bytes anteriores à cópia. O `afterPack` do Windows verifica primeiro o
win32/arch do contexto de build real, depois atualiza o hash com base nos bytes finais já assinados e revalida estritamente. Quando as variáveis de ambiente alvo não correspondem a `--win/--x64`
(ou `--arm64`), a build falha diretamente.

`electron-builder.config.js` não é o nome de arquivo padrão descoberto automaticamente pelo electron-builder. Omitir
`--config` contorna `extraMetadata.version`, o `extraResources` de CUA no Windows e a configuração de afterPack,
portanto não é um comando válido de build de produto.

A aceitação do ciclo de vida real usa duas variáveis explícitas, evitando que o teste leia por acaso diretórios de desenvolvimento ou o processo atual:

```powershell
$env:ZCODE_CUA_PRODUCT_RESOURCES_PATH = `
  (Join-Path $zcodeRoot 'packages\desktop\dist\win-unpacked\resources')
$env:ZCODE_CUA_PRODUCT_EXECUTABLE = '<可运行的 Electron 41.0.3 x64 executable>'
pnpm exec vitest run packages/services/test/windowsCuaProductHelper.integration.test.ts
Remove-Item Env:ZCODE_CUA_PRODUCT_RESOURCES_PATH
Remove-Item Env:ZCODE_CUA_PRODUCT_EXECUTABLE
```

O teste primeiro resolve o manifest do produto usando o resources path, a arquitetura atual e o Electron `41.0.3`; ele sobrescreve apenas o `command` do resultado da resolução com o executable explícito; root, entry, addon e o fechamento de dependências continuam fixos vindo dos recursos
empacotados. Ele valida ready/health/`broker_info` com PID consistente e então chama `stop()` e confirma, dentro de um deadline limitado, que a nova conexão ao pipe falha, que o PID exato e pertencente desapareceu e que o token não está no argv nem nos logs capturados. Quando as duas variáveis estão ausentes, os casos reais de ciclo de vida devem aparecer como skipped; o caso de raiz empacotada inválida roda sempre e afirma o estável
`WindowsCuaDevRuntimeResolutionError`.

Máquinas com Windows Application Control habilitado podem rejeitar o exe com marca que ainda não concluiu a assinatura de
publicação; não desligue as políticas do sistema. Nesse caso é possível concluir a aceitação de packaged-resources/ABI com um executable Electron 41.0.3 exato, com hash verificado e a mesma ABI,
mas o relatório deve deixar explícito que isso não equivale à aceitação do exe final branded/signed. A conclusão final ainda
exige que a CI/a máquina de assinatura concluam por completo `rcedit`, a assinatura dos arquivos nativos/EXE, o afterPack e o ciclo de vida do branded
exe. Os caminhos, versões, hashes, live smoke e limitações de build local específicos de 2026-07-29 estão registrados em
`docs/cua/windows-product-runtime.md`.

O smoke real de ponteiro do Windows precisa de opt-in explícito em uma área de trabalho interativa já desbloqueada:

```powershell
Set-Location $zcodeCuaRoot
pnpm rebuild:native
pnpm build
$env:ZCODE_CUA_WINDOWS_POINTER_LIVE='1'
pnpm smoke:windows:pointer
Remove-Item Env:ZCODE_CUA_WINDOWS_POINTER_LIVE
```

O smoke aceita apenas um único aplicativo live em primeiro plano com `active=true` e usa seu
`{pid,bundle_id,name}` exato como `app_ref`. Ele move o cursor para o centro do display em que ele está em no máximo 24 unidades
de coordenada, envia um probe de rolagem com `amount:0` pelo mesmo caminho de escopo e então, no `finally`, restaura a posição original
e verifica uma tolerância de dois pixels; por fim, usa um `hold_key` de cinco segundos para verificar que o shutdown do Helper consegue acordar a espera em 1,5 segundo, soltar as teclas e sair de forma limpa. O script é opt-in por padrão e não inicia o Helper nem move o cursor sem o opt-in.

O smoke da Área de Transferência de texto nativo do Windows também precisa de opt-in explícito em uma área de trabalho interativa já desbloqueada:

```powershell
Set-Location $zcodeCuaRoot
pnpm rebuild:native
pnpm build
$env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE='1'
pnpm smoke:windows:clipboard
Remove-Item Env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE
```

Esse script inicia seu próprio Helper, o único que ele reconhece, confirma `clipboard=true`, lê o texto original, grava um marker
aleatório, lê de volta de forma exata e, no `finally`, restaura e reconfirma o texto original. O stdout imprime apenas um resumo booleano, não o texto original, o marker,
o token ou o pipe. O script é opt-in por padrão e sai antes de iniciar o Helper quando o opt-in não está definido. Antes de executá-lo, é preciso atentar para:
o smoke de `CF_UNICODETEXT` só salva e restaura texto; se a Área de Transferência do sistema também contiver imagens, listas de arquivos ou formatos privados de aplicativos,
esses formatos não textuais não podem ser restaurados por esse script; o operador deve confirmar antes que a sobrescrita é aceitável.

O smoke visual de WGC no Windows também precisa de opt-in explícito em uma área de trabalho interativa comum já desbloqueada:

```powershell
Set-Location $zcodeCuaRoot
pnpm rebuild:native
pnpm build
$env:ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE='1'
pnpm smoke:windows:screen-capture
Remove-Item Env:ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE
```

Ele cria apenas duas janelas WPF controladas: um alvo checkerboard verde/magenta e um ocluder azul opaco.
O script verifica automaticamente `screen=true`, `screenshot=true`, o PNG/bounds do display selecionado, a equivalência de pixels da janela alvo
antes e depois da oclusão total, `capture_app(include_screenshot=true)`, o `state_id` retornado pelo MCP oficial
`get_app_state`, o clique no botão seguro de `state_image`, a falha fixa de minimização e a
saída limpa do Helper/fixture. O stdout imprime apenas valores booleanos, dimensões, códigos de resultado fixos e fatos de saída; não imprime imagens,
títulos de janela, caminhos temporários, token ou pipe. Sem opt-in, com a tela bloqueada, fora do input desktop padrão ou quando a política de
assinatura nativa bloqueia, o script sai com código 2 antes de iniciar qualquer Helper/fixture.

A aceitação total da superfície canônica de 30 tools do Windows roda na mesma área de trabalho controlada:

```powershell
Set-Location $zcodeCuaRoot
pnpm rebuild:native
pnpm build
$env:ZCODE_CUA_WINDOWS_TOOL_SURFACE_LIVE='1'
pnpm smoke:windows:tool-surface
Remove-Item Env:ZCODE_CUA_WINDOWS_TOOL_SURFACE_LIVE
```

Esse script chama diretamente 28 tools não-clipboard pelo `buildServer` oficial + cliente MCP, verificando
`open_application({app:{pid}})` resolvendo/ativando apenas o fixture WPF já existente sem um segundo launch, observação UIA/WGC,
display, `state_image`, todos os ponteiros/teclado, ações de elemento/foco, wait e stop.
`read_clipboard` / `write_clipboard` continuam por conta do clipboard companion smoke, que restaura o texto original de forma exata;
a união dos dois precisa coincidir exatamente com o manifest canônico de 30 tools. O script salva e restaura o cursor, solta
inputs retidos e espera a saída limpa do Helper/fixture; por padrão, ou quando a pré-verificação falha, nenhum subprocesso é criado.

Depois valide o limite fail-closed do plugin oficial:

```powershell
pnpm --filter @zcode/zcode-cua-plugin test
```

Esse comando executa diretamente `tests/zcode-cua-plugin-host-authority.node-test.ts`. Esse arquivo contém apenas os testes de limite de credenciais do Host authority; o script não depende mais de `--test-name-pattern` do Node, portanto arquivo ausente, impossibilidade de carregamento ou falha de asserção fazem o comando de validação falhar, sem gerar um falso verde com zero correspondências.

Três itens devem ser conferidos: sem credenciais de broker, as ferramentas CUA disponíveis são zero ou retornam unavailable explícito; credenciais válidas injetadas pelo Host preservam a configuração do server oficial; o token em uma configuração de plugin escrita pelo usuário nunca é aceito.

Esse comando roda primeiro os testes do próprio launcher do plugin, depois constrói as dependências da CLI e executa os testes de credenciais de autoridade do `__zcode-plugin-host` oficial. Estes últimos verificam que a configuração canônica de product/broker/socket injetada pelo Host é preservada e que sobrescritas via env ou argv escritas pelo usuário das credenciais do broker são rejeitadas; ele não aceita token do usuário como fonte de credenciais.

Ao rodar testes unitários gerais do broker no Windows, os casos live de server/client precisam se conectar a um
`\\.\pipe\zcode-cua-test-<random>` único por caso, e não entregar o `b.sock` de um diretório temporário ao `net.listen()` do Node.
Autenticação, protocolo, dispatch, timeouts e ordem de encerramento ainda devem rodar em named pipes reais;
as asserções de `0600/0700`, symlink, socket Unix obsoleto e unlink, que dependem de nós de arquivo POSIX, rodam apenas em
macOS/Linux. Os limites correspondentes são:

```text
win32 ──> \\.\pipe\zcode-cua-test-<random> ──> live transport / protocol tests
posix ──> <private tmpdir>/broker.sock       ──> live transport + fs security tests
```

## Logs, segurança e limitações

Durante o desenvolvimento, priorize o rastreamento do ciclo de vida de session/Helper pelos logs de serviço do ZCode e por `~/.zcode/cli/log`, `~/.zcode/cli/debug`, `~/.zcode/cli/rollout`; o stderr do Helper serve apenas para diagnóstico local. Antes de copiar ou commitar logs, é preciso verificar e remover broker tokens, caminhos de pipe aleatórios e outras credenciais de conexão.

Tela de bloqueio do Windows, Session 0 ou área de trabalho de usuário não interativa devem falhar de forma fechada: o Helper não pode injetar entrada nem disfrazar um estado não interativo como disponível. As operações de ponteiro no Windows exigem que o PID do `app_ref` alvo ainda seja o único aplicativo em primeiro plano no instante do despacho; monitores secundários com coordenadas negativas usam o mapeamento do virtual desktop; `left_mouse_up` serve apenas como limpeza de um botão de mouse já pressionado e pode ser liberado após mudança de foco. A Área de Transferência de texto nativo do Windows usa `CF_UNICODETEXT` e um N-API async worker, e só reporta `clipboard=true` quando a pré-verificação da área interativa e as exportações de leitura e escrita simultaneamente são verdadeiras; não usa PowerShell, comandos externos nem fallback de Electron. A captura de tela do Windows usa WGC com N-API async worker: monitores são capturados conforme os bounds selecionados, janelas são reconferidas duas vezes por HWND/PID/executable completo/bounds; minimização, tela de bloqueio, mudança de alvo e nível de integridade mais alto falham de forma fixa e fechada. O PNG atual é BGRA SDR de 8 bits, mantém a borda de captura padrão do sistema e não promete fidelidade de HDR/gerenciamento de cores. O isolamento adicional do worker UIA ainda não foi concluído e não se pode fingir sucesso com pixels em branco ou outro fallback.

### Identidade de processo do launcher e da GUI no Windows

Antes de iniciar, `open_application` precisa coletar de forma assíncrona um snapshot de PID/identidade da aplicação UIA uma vez. Se o PID do launcher puder ser resolvido de forma confiável via UIA, ele sempre deve ter precedência; apenas no Windows é permitido reassociar um launcher sem janela a um child GUI, e o child precisa satisfazer simultaneamente: não estar no snapshot anterior ao lançamento, ter uma identidade canonical executable não vazia, ser exatamente igual à identidade resolvida pelo launcher, ainda estar exposto pela UIA e ser um candidato único. Processos antigos, somente name/basename iguais, homônimos em caminhos diferentes ou múltiplos candidatos novos devem falhar de forma fechada; é proibido adivinhar por `active` ou pelo primeiro item da enumeração.

O `notepad.exe` no Win11 é um App Execution Alias; não é possível assumir que o texto do comando ou o basename é a identidade do processo. A implementação atual consulta imediatamente após o `spawn` retornar o PID, via native `processExecutablePath(pid)`, o caminho completo do executable desse processo; em máquina real retorna o `...\Notepad\Notepad.exe` real dentro de WindowsApps. O rebind entre PIDs só pode usar esse caminho completo, nunca recorrer ao texto do alias, ao name ou ao basename. O registro UIA em máquina real pode ocorrer cerca de 2 segundos depois do spawn, por isso o resolver usa uma espera limitada de `30×100ms`; estender o orçamento não afrouxa as condições de snapshot, caminho completo, revalidação live nem unicidade. Plataformas não-Windows mantêm a semântica original de resolução por bundle/name e não entram no rebind launcher→child GUI.

O PID direct preferred/launcher do Windows também não é, sozinho, uma identidade estável e confiável. Antes de aceitar `applicationInfo(preferredPid)`, o resolver precisa normalizar o `bundle_id` live dele para o caminho completo do executable e comparar com precisão o caminho completo canonical lido imediatamente após o launch; quando os dois divergem, ele não deve retornar esse PID e deve continuar procurando um único candidato GUI novo que satisfaça todas as restrições do parágrafo anterior, falhando de forma fechada se não houver candidato seguro. Quando o lookup canonical está ausente, lança erro ou retorna um caminho não absoluto, o PID preferred não pode ser tratado como evidência de sucesso deste launch, mesmo que a UIA já o veja diretamente. Essa regra evita a reutilização de PID e o TOCTOU de "ler a identidade do launcher e, antes de a UIA aceitar, a identidade do processo mudar"; o PID direct não-Windows mantém o comportamento original.

Quando `axSource` / UIA estão ausentes no Windows, o backend precisa recusar `open_application` antes do spawn, e o resolver precisa retornar `null` de forma defensiva, nunca `launchHint`; fora do Windows permanece o fallback existente sem `axSource`.

Apps empacotados no Windows não podem reutilizar o rebind por caminho de executable acima. Aplicações como a Calculadora são hospedadas por
`ApplicationFrameHost.exe`, cujo executable de host não é um AUMID nem prova a identidade de um aplicativo específico.
Um app empacotado precisa receber o AUMID exato via `bundle_id`, ser ativado pelo
`IApplicationActivationManager` nativo e então ter seu PID único resolvido com precisão a partir do `PKEY_AppUserModel_ID` do
HWND de topo visível; 0 ou mais de um candidato de PID deve falhar de forma fechada. As ações e o
`get_app_state` subsequentes preferem o PID retornado por `open_application`. Apps Win32 comuns continuam passando
o nome explícito do executable (por exemplo `notepad.exe`), e as regras de validação de caminho completo permanecem as mesmas; é proibido adivinhar por título localizado,
basename, estado active ou pelo primeiro item da enumeração.

Os nomes de ferramentas do provider CUA oficial visíveis continuam sendo apenas `mcp__computer-use__*`. O Agent aceita, apenas para o server oficial já validado pela autoridade do Host, um alias unidirecional
de runtime `mcp__computer_use__*` gerado ocasionalmente pelo modelo, restaurando o nome canônico antes de
permission, hook, event, history e MCP dispatch.
Servidores MCP de terceiros não recebem esse alias, e é proibida a normalização global de hífen e sublinhado.

## Registro de aceitação em máquina real (2026-07-29)

Nesta rodada, em Windows 11 10.0.26200 x64, Session 1 interativo, Node 24.18.0 (ABI 137) e pnpm 10.33.2, a cadeia oficial `computer-use@zcode-plugins-official` foi iniciada e validada a partir do desktop de código-fonte. A aceitação ficou restrita à cadeia local desktop continuous; SSH, WSL, Docker, workspace remoto e `/remote` no celular não foram iniciados nem anexados, e a Phase 1 não pediu capturas de tela em momento algum.

A máquina real expôs primeiro dois defeitos de identidade de inicialização no Windows: o `windowsHide: true` do runner padrão fazia o processo moderno do Notepad iniciar com sucesso, mas a primeira janela GUI iniciava oculta; e o Notepad moderno repassa o PID de launcher retornado por `spawn` para outro child PID que detém a janela visível. A correção final fez o runner exibir a GUI explicitamente e completou o rebind exclusivo do Windows com "snapshot de PID antes do lançamento + caminho completo do executable do launcher + PID novo após o lançamento + revalidação live por `applicationInfo` + candidato único". Janelas ativas antigas com o mesmo nome, basename idêntico em caminhos diferentes, múltiplos candidatos e identidade somente por name foram travados como fail closed por RED tests.

Os resultados preservados do live smoke do plugin oficial são:

- Após o Managed Host injetar socket/token/authority, o `__zcode-plugin-host` inicializou com sucesso o MCP `zcode-cua` e listou 30 ferramentas;
- `list_apps`, `open_application(notepad.exe)` sem shell e `get_app_state` UIA sem captura de tela foram bem-sucedidos;
- O editor foi clicado com element target, `type` escreveu `ZCode Windows CUA Phase 1` e a verificação exata foi feita por UIA state atualizado;
- Após o sucesso de `Ctrl+A` apenas foi feita uma reobservação somente leitura, sem replay da ação; o `type` substituto escreveu `ZCode Windows CUA Phase 1 Replacement` e a verificação exata foi feita por UIA state atualizado;
- A varredura de logs não encontrou token nem pipe completo; os eventos de ciclo de vida do Helper são `info`/`warn` de baixa frequência e não usaram o caminho Helper.app/TCC do macOS, SSH, WSL ou Docker.

O smoke de recuperação do mesmo `WindowsCuaHelperHost` real também passou: o child de generation 1 foi encerrado após validação exata de PID/parent/executable/entry e o pipe antigo recusou conexões; o mesmo Host gerou então a generation 2, com pipe e token rotacionados e `pluginAuthority` exatamente igual; após o `stop()` final o child saiu. Com o ZCode de código-fonte fechado, não restaram órfãos de main, Host, Helper e plugin-host oficial, e o pipe existente antes do fechamento passou a recusar conexão depois dele.

A task orientada por provider continua incompleta: o primeiro retry limitado após a janela de backoff ainda foi limitado por taxa; depois disso o backoff continuou por cerca de 45 minutos e foi iniciada uma nova task `sess_049c964a-c225-4e7f-8147-dcdd53a24c4f` a partir do desktop de código-fonte atual, enviando uma única instrução completa de Notepad. O I/O de modelo correspondente contém a superfície de tools oficial `mcp__computer-use__*`, mas `tool_use=0`, `tool_result=0`; o modelo "trabalhou por 1 segundo" e ainda retornou `The service is currently rate limited. Please retry later.` antes da primeira tool call. Não houve segundo envio, o Notepad não iniciou e não há captura/replay que possa substituir isso. O app de código-fonte então esperou a limpeza do Host pelo caminho normal de app-quit e saiu, sem órfãos de Helper, plugin-host, watcher ou Notepad desta rodada. Portanto não se pode passar o smoke direto do plugin oficial por sucesso de task do modelo, e o status permanece `BLOCKED/NEEDS_CONTEXT`.

Após concluir a governança de portabilidade dos testes unitários do CUA no Windows e novamente recuar no backoff, foi criada uma nova task `sess_70f5f0a4-f1de-4bda-9840-e9693cb6e3da` no desktop de código-fonte, enviando de novo apenas uma única instrução completa de Notepad. O único I/O de modelo `main_turn` dessa task foi limitado por taxa em 941ms; a requisição já havia injetado 48 ferramentas, das quais 30 são as ferramentas oficiais `mcp__computer-use__*`, mas a resposta ainda teve `tool_use=0`, `tool_result=0`. A UI exibiu "trabalhou por 2 segundos" e retornou o mesmo texto de rate limit. O gerador de título de session teve mais 6 retentativas internas de limitação, sem ferramentas; elas não são reenvios de instrução do usuário nem entraram no CUA. O Notepad não iniciou e nenhuma ação de escrita foi despachada. Na saída, primeiro foi desligado o close-to-tray deste processo por meio de uma setting não persistente do main-process, e depois seguindo o fluxo formal `before-quit -> Host dispose -> agent/plugin/Helper cleanup`; ao final não restou resíduo do Electron de código-fonte, do Windows Helper, do plugin-host CUA de código-fonte, do app-server, do watcher, das portas 5174/9229 nem do Notepad, e o close-to-tray persistido pelo usuário continuou `true`. Esta rodada ainda não consegue concluir a aceitação do Notepad orientada por provider, o status continua `BLOCKED/NEEDS_CONTEXT` e nenhum novo envio pode ser feito automaticamente.

No gate anterior da Task 8, o typecheck, o lint, o build e o test completo do zcode-cua tiveram todos exit 0; naquela época o completo era 107 passed / 6 skipped files, 1952 passed / 67 skipped / 18 todo tests. O C1 focused após o reforço das duas revisões foi de 2 files / 24 tests e o C2 delivery-state focused foi de 4 files / 116 tests, ambos com exit 0. `pnpm test:unit:affected` foi executado naquele HEAD e em um worktree clean isolado no exact `bb8798db1c`, usando o mesmo ambiente Windows / Node / pnpm / lockfile: a base foi 29 failed files / 100 failed tests / 1 unhandled e o HEAD desta rodada foi 31 / 102 / 1. A diferença de conjuntos mostra que todas as 29/100 falhas de baseline da base continuam presentes no HEAD; as exclusivas do HEAD são o timeout de 30 segundos de `animatedSidePanePanelLayout` e o timeout de 15 segundos de `workspaceShellRemoteMobileLayout`, ambas fora do caminho de código da Task 8, e uma revisão independente anterior obteve 29/100 no mesmo HEAD, tratando-se de timeouts não estáveis relacionados à carga da suíte completa. Essa comparação não encontrou regressão em C1/C2, mas o exit-0 gate do brief não pode ser autoconvertido em aprovado; ainda é preciso que o gate owner conceda um waiver ou que a baseline completa do Windows seja governada de forma independente.

Depois, a governança da baseline de testes unitários do Windows continuou: os testes live gerais de broker/auth/Node Helper passaram a usar uma named pipe única por caso, e o `.app` do macOS, LaunchServices, codesign, `/usr/bin/unzip` e as asserções de mode/symlink POSIX passaram a ser classificados com precisão por plataforma. Após uma revisão independente, o round-trip/lifecycle do broker, a máquina de estados de injeção do installer, a evidência de PID do Helper e a lógica de decisão pura de owner/reaper voltaram a ser obrigatórios no Windows; `pnpm exec vitest run packages/services/test/cua` agora tem 38 files passed, 788 tests passed, 35 platform skips, 2 todo, exit 0. Toda autenticação, NDJSON, dispatch, timeout, graceful-stop e ciclo de vida do Node Helper continua rodando em named pipes reais no Windows. Ao executar novamente `pnpm test:unit:affected`, o resultado caiu de 31 files / 102 tests / 1 unhandled para 17 files / 17 tests / 0 unhandled, com 936 files / 8017 tests passed; as falhas restantes não estão em arquivos de CUA, o gate continua com exit 1 e não se declara aprovação de todo o repositório.

Nesta rodada também foi concluída a cadeia de Área de Transferência de texto nativo do Windows: o adapter TypeScript só reporta capacidade quando a pré-verificação da área interativa passa e o
addon nativo possui simultaneamente as exportações assíncronas de leitura e escrita, e o broker aguarda a conclusão da Promise; a camada nativa usa
`CF_UNICODETEXT`, um orçamento de mutex dedicado de 250ms, retentativa limitada de `OpenClipboard` de `8×10ms` e um limite de 8 Mi de code units UTF-16. Não foi introduzido PowerShell, comando externo nem fallback de Electron, e SSH, WSL, Docker, workspace remoto e `/remote` no celular não foram modificados.

O primeiro clipboard live smoke de 2026-07-29 não pode ser registrado como aprovado: o Helper ficou ready normalmente e
`broker_info.capabilities.clipboard=true`, mas `OpenClipboard(NULL)` já retornou access denied antes da leitura do texto original; o aplicativo em primeiro plano no mesmo ambiente era `LockApp`. O script não gravou marker, não alterou a Área de Transferência e
saiu de forma limpa com seu próprio Helper. As 20 diagnosecs somente leitura retornaram `unavailable`, e o diagnosec somente leitura do Win32 também confirmou que
era negação de acesso do `OpenClipboard`; portanto não se afrouxou o gating da área interativa nem se adicionou fallback. Depois, em uma área de trabalho interativa comum e desbloqueada,
o pointer live smoke passou integralmente e restaurou o cursor, e o clipboard live smoke gravou, leu de volta um marker Unicode aleatório e restaurou o texto original
exatamente; o Helper saiu com 0 nos dois casos. A verificação de formato somente leitura antes da execução foi
`formatCount=2`, `textOnly=true`; essa evidência só prova o ciclo fechado de texto da Área de Transferência e não pode ser extrapolada para formatos de imagem ou arquivo.

No gate mais recente após a conclusão da implementação de clipboard, a reconstrução nativa, o typecheck, o lint, o build e o test completo do zcode-cua
tiveram todos exit 0; o focused de clipboard foi de 8 files / 139 tests e o completo de 115 passed /
6 skipped files, 2016 passed / 67 skipped / 18 todo tests. A integração de subprocesso real do Helper de código-fonte do ZCode foi de 1 file / 2 tests,
a regressão de serviços CUA de 38 files / 788 passed / 35 skipped / 2 todo, o build do plugin oficial e os limites de credenciais de 6 tests, e o typecheck/lint do repositório principal com exit 0. O mais recente
`pnpm test:unit:affected` continua com exit 1: 13 files / 17 tests failed, 940 files /
8135 tests passed, e as 17 falhas não estão em arquivos de teste de CUA; elas estão distribuídas em timeouts de UI/asserções de texto de código-fonte,
bot lock, Git/CI e ambiente desktop. Portanto o gate focused de CUA passa, mas ainda não se declara aprovação dos testes unitários de todo o repositório.

No mesmo dia, o loop visual de WGC foi concluído: o addon nativo ganhou ABI de captura assíncrona de monitor/janela, o broker
`screenshot` preserva a origem do monitor secundário selecionado, o `capture_app` vincula o PNG/bounds de janela já validado ao snapshot UIA e o
`state_image` é projetado conforme esses bounds. O fixture WPF controlado realmente criou HWND, gravou o
handshake PID/HWND/bounds, respondeu ao sinal privado de fechamento e saiu com 0; o gate padrão do smoke visual e o gate de tela de bloqueio simulado provaram que a saída ocorre antes da criação de subprocessos. No carregamento inicial houve Smart App Control / Code Integrity
3077/3033, mas depois de limpar e reconstruir o addon nativo o binário de código-fonte carregou com sucesso na mesma máquina,
com `isScreenCaptureSupported=true`. O smoke live completo de WGC passou em seguida: PNG/bounds do display selecionado, equivalência de pixels da janela
antes e depois da oclusão total, `capture_app`, o MCP oficial `get_app_state` →
clique em `state_image` event, falha fixa de minimização e clean exit de Helper/fixture.
Isso prova que o ciclo fechado de desenvolvimento a partir do código-fonte funciona; a assinatura pelo Trusted Root Program CA, o instalador e a publicação do produto continuam como
ciclo fechado posterior e não podem ser deduzidos como resolvidos a partir de um pass de código-fonte.

Na mesma rodada, o live smoke canônico de tool-surface ficou todo verde: as 30 ferramentas registradas pelo server oficial coincidiram
exatamente com o manifest, as 28 ferramentas não-clipboard tiveram chamadas MCP reais, e as duas de clipboard foram cobertas pelo companion
smoke acima. Durante o processo, duas falhas de projeto foram encontradas e corrigidas em máquina real: o ramo de PID já enviava o título da janela para o launcher, causando um segundo
launch; e o handler de teclado `*_to_app` no Windows retornava unavailable por falta da primitiva macOS por-PID antes de validar o PID em primeiro plano. Agora o PID apenas resolve/ativa por dupla confirmação um processo já existente; o teclado no Windows só
converte para `SendInput` global depois que a UIA prova que `app_ref.pid` é o único aplicativo em primeiro plano. No final, os grupos observation/display/pointer/
keyboard/semantic/focus/runtime foram todos true, o cursor foi restaurado e o Helper/fixture WPF saíram com 0.
Essa mudança continua fora de SSH, WSL, Docker, workspace remoto, `/remote` no celular, do instalador e do ciclo fechado de publicação.

No fechamento final, o smoke de WGC ficou verde três vezes consecutivas após a correção. Nesse meio-tempo,descobriu-se que o próprio fixture de aceitação tem dois
problemas de compatibilidade com o Windows PowerShell 5.1: delegates de Dispatcher não podem depender de closure local de
HWND/window/timer em StrictMode; e comentários em chinês em UTF-8 sem BOM + LF podem ser lidos pelo 5.1 como code page ANSI,
engolindo a quebra de linha e incorporando a instrução seguinte ao comentário. O fixture agora usa explicitamente HWND/window/
timer vivos em escopo de script; ambos os fixtures WPF mantêm asserções de regressão de BOM UTF-8. O sinal de minimização só é confirmado depois que
`IsIconic(HWND)` é verdadeiro,
e não se pode mais substituir o fato do estado do Win32 por "sinal consumido".

O gate mais recente de código-fonte é: zcode-cua Windows focused 16 files / 158 tests, completo 122 passed /
6 skipped files, 2105 passed / 67 skipped / 18 todo tests, com native rebuild, build,
typecheck e lint todos em exit 0; os quatro smokes reais de screen, pointer, clipboard e superfície de 30 tools
terminaram todos em exit 0, o texto da Área de Transferência e o cursor foram restaurados, e não há órfãos de Helper/fixture. A integração focused do ZCode
foi de 4 files / 175 passed / 1 skipped, `pnpm --filter @zcode/zcode-cua-plugin test`
totalizou 6 tests, e o typecheck/lint do repositório principal terminaram com exit 0. Rodar o `node --test` do plugin sem o package não é um gate válido,
porque falta a pré-condição `build`; é preciso usar o comando de test do pacote acima.

O mais recente `pnpm test:unit:affected` continua com exit 1: 13 failed files / 20 failed tests,
940 passed files / 8132 passed tests / 104 skipped / 2 todo. As falhas estão distribuídas em timings de agente já existentes,
timeouts de UI, bot lock, Git/CI e asserções de texto do desktop, sem arquivos de código-fonte CUA ou de teste CUA. Portanto
a funcionalidade local de CUA via código-fonte no Windows e a evidência de execução das 30 tools estão consolidadas, mas essa conclusão não pode ser extrapolada para assinatura formal,
instalador, HDR/gerenciamento de cores, para se o provider realmente escolhe chamar as ferramentas, ou para a baseline não-CUA de todo o repositório.

## Encerramento limpo

Ao fechar o aplicativo desktop ou interromper o processo de desenvolvimento, o Host primeiro para de aceitar novos trabalhos e então envia o shutdown do Helper, fecha a named pipe e aguarda a saída do child. É possível confirmar no Gerenciador de Tarefas que não restou nenhum child Node/Electron de `windows-helper.js`; se ainda existir, preserve logs redigidos e pare de usar esse broker até que a causa seja corrigida.