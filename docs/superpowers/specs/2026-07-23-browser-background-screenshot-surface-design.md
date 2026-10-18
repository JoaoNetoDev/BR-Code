# Sincronização da Superfície de Screenshot de Tab em Segundo Plano do Navegador Embutido

> Status: implementado; em 2026-07-30 foi acrescentado um activity lease limitado por owner renderer + guest alvo,
> em substituição ao throttling permanente de segundo plano; no mesmo dia foi acrescentada a justiceabilidade de event loop do pump em `preparing`,
> bem como um bootstrap transparente de primeiro frame para guest nascido hidden após close-to-tray em macOS /
> Windows.
> Data: 2026-07-23.
> Especificações relacionadas:
> `docs/browser-use/2026-07-15-browser-turn-final-screenshot-spec.md`,
> `docs/browser-use/2026-07-15-responsive-browser-viewport-spec.md`,
> `docs/testing/browser-use-codex-parity-coverage-matrix.md`.

## 1. Problema e evidência de runtime

A imagem original do screenshot de fim de turno reportada pelo usuário era `1274 × 720`. A comparação de pixels mostrou que o conteúdo se repete quase exatamente com periodicidade de `800px` na horizontal e `450px` na vertical. Na persistência há apenas um fato de imagem `source=browser_turn_end`,
portanto a repetição não é causada por colagem na UI de conversa nem por compressão de imagem.

O encadeamento de runtime é o seguinte:

```text
browser-use tab 不是侧栏当前活动 tab
  -> TabsContent(forceMount) 仍挂载，但 data-[state=inactive]:hidden 令其 display:none
  -> Electron guest 保留最后一次可见时的 800 × 450 compositor surface
  -> 页面继续运行，CDP 读取到的当前 CSS viewport 已变为 1274 × 720
  -> Page.captureScreenshot(fromSurface=true) 按 1274 × 720 输出
  -> Chromium 用旧 800 × 450 surface 周期性填充目标 PNG
```

Uma reprodução com um `<webview>` Electron isolado prova que:

- um `BrowserWindow` comum não repete com os mesmos parâmetros CDP;
- `<webview>` guest reproduz de forma estável quando o tamanho de layout, a superfície de composição visível e o CSS viewport divergem;
- adicionar `clip`, `captureBeyondViewport` ou `Emulation.setVisibleSize` não corrige;
- `fromSurface=false` pode retornar imagem preta ou tamanho incorreto em guest em segundo plano/oculto, portanto não serve como fallback.

A causa raiz é a ausência de um limite de sincronização "a superfície capturável já foi composta de acordo com o viewport atual" antes do screenshot do guest em segundo plano, e não um problema de codificação de imagem,
persistência de fim de turno ou camada de exibição.

### 1.1 Livelock do processo principal sob window hidden

Uma reprodução real em macOS em 2026-07-30 revelou outra cadeia de falha independente: depois que o usuário fecha a última janela, o aplicativo oculta a janela conforme a política do produto em vez de sair; em seguida o BUA dispara um screenshot na owner window oculta. O log para em screenshot request,
sem novo surface ready, backend settled ou app quit, a CPU do processo principal fica continuamente em 100%, e não há crash dump.
Uma amostragem do Electron browser process travado mostra que a main thread executa continuamente Promise/microtask do V8.

```text
hidden owner window
  -> activity controller 启动 owner + guest continuous capture pump
  -> Electron capturePage(1×1) 立即 resolve
  -> async continuation 在 microtask 中同步创建下一份 capture
  -> 下一份又立即 resolve，continuous 分支没有 macrotask yield
  -> Promise microtask 永不清空
  -> renderer Ready IPC / 1500ms timeout / 35s watchdog / second-instance 事件都无法调度
  -> 已隐藏的单实例进程仍占锁，新窗口无法打开，用户感知为 “ZCode 崩溃打不开”
```

Não se trata de um crash nativo nem de falha na limpeza ao fechar a janela; a causa raiz é o design de agendamento do activity pump permitir que
"captures que completam imediatamente" ocupem indefinidamente o event loop principal do Electron. O limite da correção precisa ficar no próprio pump,
e não pode depender de timeout do coordinator ou de watchdog como rede de proteção, porque esses timers e IPCs são justamente as tarefas que ficam sem agendamento.

### 1.2 Guest novo dentro de window hidden não tem primeiro frame

Após a correção de justiceabilidade do event loop, logs reais em macOS expuseram um problema independente posterior:

```text
20:35:41.963  用户关闭窗口 -> Darwin close policy 执行 hide()
20:36:23.173  BUA newTab；guest 在 owner 已隐藏后 attach / navigate
20:36:31.363  screenshot request
20:36:31.541  guest activity capture failed
20:36:38.103  重试 screenshot，capture 一直 pending
20:36:52.930  用户重新激活 ZCode
20:36:53.533  同一份 screenshot 成功
```

Um experimento isolado com Electron 41 confirma ainda mais:

- um guest criado em owner oculto pode, mesmo após completar a navegação, ainda na primeira `capturePage()` retornar vazio,
  lançar `UnknownVizError` ou ficar pending indefinidamente;
- `invalidate()`, o full capture do owner e o CDP `Page.startScreencast` não conseguem estabelecer o primeiro frame do guest;
- `showInactive()` consegue estabelecer o primeiro frame, mas chamá-lo diretamente exibiria de novo a janela que o usuário acabou de fechar;
- definir primeiro a opacity da janela como `0`, depois chamar `showInactive()`, aguardar o capture do primeiro frame do guest, refazer `hide()` e
  restaurar a opacity original, resulta em capturas subsequentes não vazias; o estado final medido permanece
  `visible=false / focused=false / opacity=原值`.
- iniciar duas `capturePage()` sobrepostas para owner/guest imediatamente no mesmo turno síncrono após `showInactive()` dispara
  `UnknownVizError`, e um smoke isolado do Electron já levou o browser process a `SIGSEGV`; deve haver um presentation grace limitado entre o evento de show da
  janela e a inicialização da Viz surface, e não se pode conectar o pump existente de forma síncrona logo após `showInactive()`.

A causa raiz não é a frequência do capture pump nem a camada de captura do renderer, mas o fato de o guest nascer depois de a owner window já estar
oculta e nunca ter obtido uma oportunidade de apresentação de compositor no nível da janela. O capturer count do Electron
só consegue manter uma surface existente; ele não faz bootstrap do primeiro frame do zero para esse guest.

## 2. Objetivos e não objetivos

### 2.1 Objetivos

1. Antes de capturar uma browser-use tab em segundo plano e inativa, preparar uma Electron guest surface consistente com o CSS viewport natural atual.
2. A preparação do screenshot não pode trocar a tab ativa do usuário na barra lateral, roubar o foco, aceitar eventos de mouse/teclado nem produzir piscamento visível.
3. O main só pode chamar `Page.captureScreenshot` após receber um recibo explícito de ready do renderer.
4. Quando a preparação falha, encerrar explicitamente este screenshot, sem continuar retornando uma surface antiga com risco conhecido de ladrilhamento.
5. Todos os caminhos de sucesso, falha, cancelamento, timeout e reconstrução de guest devem liberar o estado de surface temporário.
6. Manter inalterados os contratos existentes de screenshot, clip, fullPage, persistência de imagem de fim de turno e orçamento de imagens.
7. Quando não houver screenshot em preparação ou captura em andamento, a owner BrowserWindow precisa voltar ao throttling de segundo plano padrão do Electron;
   não se pode manter acordando continuamente o renderer da janela inteira, o guest e a GPU só porque a browser-use tab existe pelo tempo de vida do processo.
8. O activity wake-up deve ser limitado por fase: após o surface Ready o owner renderer não participa mais, e a frequência de `capturePage()` do guest alvo
   precisa ter um teto fixo, sem converter uma lease de recurso de até 35s em readback de GPU sem intervalo.
9. Mesmo que `capturePage()` complete de forma síncrona ou imediata na fase preparing, é preciso ceder um macrotask entre cada rodada de renovação do pump;
   IPC do renderer, cancelamento, timeout, watchdog e eventos de ciclo de vida do aplicativo precisam continuar agendáveis.
10. Depois que o usuário fecha a janela no macOS, ou depois que o usuário fecha para a bandeja no Windows, o guest novo criado pelo BUA ainda precisa
    concluir o screenshot explícito ou de fim de turno; durante o bootstrap a janela não pode ficar visível, focada, piscar ou reaparecer na taskbar do Windows, e depois
    deve continuar no estado hidden anterior ao fechamento. Se o usuário reabrir ativamente a janela durante o bootstrap, a limpeza não pode ocultá-la novamente.

### 2.2 Não objetivos

- Não mascarar o erro de compositor cortando a região repetida, fazendo detecção de correlação de imagem ou reamostrando após a captura.
- Não forçar a browser-use tab a se tornar a tab ativa atual do usuário.
- Não adicionar novo estado de negócio de task/stream/snapshot no relay, no desktop main ou no cliente móvel.
- Não modificar `@zcode/protocol`; este design adiciona apenas coordenação transitória de plataforma entre desktop main e owner renderer.
- Não resolver nesta correção a limitação independente do Electron em que um "responsive viewport explícito maior que a área compostável da janela".
  Se não for possível preparar uma surface do mesmo tamanho nesse cenário, é preciso falhar em vez de gerar uma imagem ladrilhada; a cobertura Electron real do viewport grande do BCP-199
  continua como um item de trabalho separado.
- Não usar opacity para simular janela transparente no Linux; `setOpacity()` do Electron no Linux é no-op e chamar
  `showInactive()` causaria piscamento real. Além disso, o fechamento da última janela no Linux ainda entra em `app.quit()` e não mantém owner/guest
  disponíveis para screenshot do BUA. O bootstrap transparente só é habilitado no wiring desktop de macOS e Windows, que possuem opacity de janela reversível.

## 3. Escolha da abordagem

Adotada: "preparação de superfície de screenshot em segundo plano + ACK do renderer".

Abordagens não adotadas:

1. `fromSurface=false`: um webview em segundo plano pode devolver imagem preta, e o tamanho da saída deixa de coincidir com o sistema de coordenadas CSS da Browser API.
2. Ativar a tab do browser antes do screenshot e voltar depois: força a atualização da surface, mas rouba o foco do usuário e produz piscamento,
   e com múltiplas tarefas concorrentes ainda embaralha a semântica de dono da tab.
3. Cortar a primeira região repetida e esticar: não prova que a primeira região cobre o viewport inteiro, reduz a qualidade da imagem e quebra a correspondência de coordenadas de clique.

## 4. Design em camadas

### 4.1 BrowserScreenshotSurfaceCoordinator

Adiciona-se ao domínio de browser-use do desktop um coordenador de superfície de screenshot injetável. `BrowserGuestManager` depende apenas
dessa interface, sem acessar diretamente React, DOM ou uma implementação concreta de IPC.

```ts
interface BrowserScreenshotSurfaceCoordinator {
  prepare(input: {
    requestId: string;
    windowId: number;
    workspaceKey: string;
    sessionId: string;
    browserId: string;
    browserGeneration: number;
    tabId: string;
    webContentsId: number;
    viewport: { width: number; height: number };
    signal: AbortSignal;
  }): Promise<{
    viewport: { width: number; height: number };
    release(): void;
  }>;
}
```

- O wiring local do desktop usa uma implementação via IPC do renderer.
- Os testes podem injetar um coordinator falso para verificar ordem de chamada, cancelamento e liberação.
- Sem owner renderer disponível, `prepare` falha explicitamente e não faz fallback para screenshot da surface antiga.
- `groupsByReadyRequestId` é o único request registry de correlação de Ready; requests pendentes não mantêm mais uma cópia espelhada de Map
  que nunca participa de nenhuma busca.
- `leaseReleases` é a única fonte de verdade dos leases atualmente válidos do group. A surface/activity só é devolvida depois que a última release closure sai do Set;
  não se deve mais manter um `leaseCount` separado de forma síncrona, evitando que em reentrância de abort/watchdog/dispose o contador derive do conjunto real de recursos.

### 4.2 Mensagens transitórias entre Main e renderer

Adicionam-se mensagens de plataforma com correlação estrita de `requestId`:

- `BrowserViewScreenshotSurfacePrepare`
- `BrowserViewScreenshotSurfaceReady`
- `BrowserViewScreenshotSurfaceRelease`

As mensagens devem carregar `workspaceKey`, `sessionId`, `browserId`, `browserGeneration`, `tabId` e
`webContentsId`; o prepare também carrega o `timeoutMs` atual real do main, e o renderer usa um padrão compartilhado como fallback quando o payload antigo não traz o campo. O renderer só processa requests com scope completo e tab/guest atual correspondentes; o main só aceita ready do mesmo
`requestId`, descartando recibos atrasados ou de generation antiga.

Essas mensagens expressam apenas preparação transitória de renderização e não entram no estado persistido do Zustand, em conversation fact, no relay ou em
replayable snapshot.

### 4.3 Superfície de screenshot no renderer

Após receber o prepare, a browser-use tab alvo entra em um estado temporário `preparing`:

1. `TabsContent` inativo deixa de usar `display:none`, `visibility:hidden` ou
   `content-visibility:hidden`;
2. ele é colocado em uma camada de captura de segundo plano dentro da área de conteúdo da barra lateral, mantendo o tamanho real de layout, mas abaixo do conteúdo ativo atual;
3. a camada de captura desabilita pointer events, foco de teclado e exposição de acessibilidade, e não pode alterar a seleção de tab atual;
4. responsive viewport, zoom do guest e override de viewport existentes não são reescritos aqui;
5. um `ResizeObserver` observa o webview e, após dois animation frames consecutivos com largura e altura estáveis e maiores que zero, lê
   `getBoundingClientRect()`;
6. o renderer devolve `webContentsId` e o viewport DOM estável, e entra em `ready`.

A camada de captura precisa estabelecer um stacking context próprio, mantendo o tab ativo com seu fundo e nível de interação originais. O CSS
concreto precisa ser provado por um smoke real do Electron de que a guest surface continua compondo enquanto está coberta pelo conteúdo ativo; não é suficiente considerar concluído apenas porque o elemento não está `display:none` no JSDOM.

### 4.4 Portão de screenshot do Main

`BrowserGuestManager`, antes de executar screenshot, clip screenshot ou fullPage screenshot:

1. lê o CSS viewport atual via CDP;
2. chama `prepare` do coordinator;
3. valida que o `webContentsId` do ready não mudou e que o viewport coincide com o CSS viewport natural atual dentro de uma tolerância de arredondamento de `1px`;
4. quando não há coincidência, continua esperando um recibo estável dentro do orçamento de prepare;
5. só depois chama o `executeBrowserCommandOnView` existente;
6. chama `release` no `finally`.

A exclusão mútua `inFlightScreenshots` já existente para a mesma tab é mantida. A preparação da superfície é contabilizada no mesmo orçamento da requisição de screenshot
e não pode contornar timeout/backpressure.

### 4.5 Activity lease de owner renderer + guest alvo

`backgroundThrottling: false` do Electron não é um interruptor de isolamento por guest: quando qualquer WebContents de um BrowserWindow desativa o throttling, a janela inteira e seus outros WebContents passam a desenhar continuamente; além disso, desativá-lo já na criação da janela mantém o Page Visibility como `visible`. Por isso não é possível desativar permanentemente o throttling de segundo plano ao criar a janela principal, nem fingir que o webview alvo oferece isolamento por tab.

O runtime também refutou a primeira versão da abordagem "definir dinamicamente como false e voltar a true depois". No Electron 41, chamar `setBackgroundThrottling(true)` em WebContents ocultos faz o getter voltar a `true`, mas internamente ainda chama
`RenderWidgetHostImpl::WasShown()` e não reaciona com `WasHidden()`; em um smoke real o rAF continua rodando e a CPU não retorna ao normal. Essa API não serve como lease reversível.

A abordagem final usa a semântica nativa de capturer-count do `capturePage()` do Electron: uma página oculta é considerada visível enquanto o capturer count é diferente de zero, e quando a capture Promise settle o Chromium devolve a count automaticamente e restaura o agendamento hidden.
O `<webview>` guest e o owner renderer são WebContents diferentes: capturar apenas o owner não acorda o guest, e capturar apenas o guest também não conduz o handshake de ready do `ResizeObserver + rAF` do owner renderer. Por isso o activity
controller divide-se em duas fases conforme o ciclo de vida da surface, e outros guests da mesma janela nunca participam:

```text
preparing:
  owner: start A -> start B before awaiting A -> A settle -> macrotask yield -> start C -> ...
  target guest: start A -> start B before awaiting A -> A settle -> macrotask yield -> start C -> ...
  invariant: even if A/B settle immediately, no target may chain another pump turn in the same microtask drain
ready:
  owner: stop creating captures -> final captures settle -> hidden
  target guest: one 1×1 capture at most every 200ms
sibling guest: no capturer
release
  -> stop creating target guest captures
  -> await the final capture settle
  -> capturer count returns to zero
  -> Chromium restores background scheduling
```

A capture `1 × 1` serve apenas para manter activity reversível e não lê, registra nem persiste imagem da página. A ordem de sobreposição na fase prepare garante que o owner renderer consiga concluir `ResizeObserver + 2 rAF` de forma contínua, com no máximo duas captures não settle por alvo. Depois que cada capture anterior settle, é preciso passar primeiro por um limite de macrotask antes de entrar na próxima rodada;
isso preserva a semântica de sobreposição "iniciar a próxima antes" e garante que o IPC de Ready e os timers de recolhimento limitado possam rodar. Depois do Ready o owner já cumpriu seu papel e deve parar o pump imediatamente; o guest alvo mantém apenas um único pulso in-flight, com intervalo mínimo de início de `200ms`. Um smoke real do Electron precisa provar que essa frequência ainda faz o guest oculto avançar a renderização,
enquanto o owner e os siblings já voltaram a/ou mantêm o throttling.

O desktop main ganha um screenshot activity controller injetável:

```ts
interface BrowserScreenshotActivityLease {
  readonly invalidated?: AbortSignal;
  markPrepared?(): void;
  release(): void;
}

interface BrowserScreenshotActivityController {
  acquire(input: {
    windowId: number;
    webContentsId: number;
    requestId: string;
    reason: "browser-screenshot";
  }): BrowserScreenshotActivityLease | undefined;
}
```

Posse de estado e restrições:

1. `desktopWindowChrome` não define mais `backgroundThrottling: false` permanente, usando o padrão `true` do Electron.
2. Quando o coordinator ativa um preparation group, ele precisa obter primeiro o activity lease de owner renderer + guest alvo,
   e só então enviar o `Prepare` ao renderer; caso contrário um renderer oculto, minimizado ou totalmente encoberto ainda pode ser incapable de retornar `Ready` por causa de rAF e compositor congelados.
3. O controller precisa validar que o `hostWebContents.id` do guest alvo pertence à owner window; em caso de divergência, falha de forma controlada, proibindo despertar guest da janela errada.
4. A primeira lease do mesmo owner + guest inicia, na fase preparing, uma pump sobreposta de `capturePage()` `1 × 1` para cada lado. Leases posteriores do mesmo alvo apenas aumentam a contagem de referências, sem criar novas pumps. Outros guests da mesma janela não são acordados.
5. Um preparation group mantém apenas uma activity lease desde o início do prepare até a liberação real de todas as screenshot surface leases. Requisições concorrentes do mesmo guest compartilham o group; groups enfileirados não acordam antecipadamente.
6. Após o `Ready` do renderer, o coordinator precisa chamar `markPrepared()`: a pump do owner para e a pump do guest alvo muda para modo capturing com intervalo mínimo de início de `200ms` e um único in-flight.
7. Ao fazer settle do group, envia-se primeiro o `Release` ao renderer e só então se libera a activity lease; a última lease interrompe a renovação do pump e espera as últimas captures já criadas terminarem naturalmente. `release()` precisa ser idempotente.
8. A interrupção do pump pela última lease é adiada em um microtask; se o coordinator ativar sincronamente o próximo group enfileirado, a nova aquisição cancela a interrupção, evitando que o capturer count zere brevemente e cause agendamento hidden/visible repetido.
9. Quando qualquer capture de activity de owner/guest falha, o controller precisa colocar o signal `invalidated` em estado aborted;
   o coordinator rejeita imediatamente o prepare antes do Ready e, depois do Ready, invalida a surface lease já entregue. Não basta parar o pump e depois esperar silenciosamente todo o orçamento de timeout do prepare.
10. O activity controller pertence ao estado transitório de recursos do desktop main e não entra no Zustand do renderer, no relay,
    em conversation fact nem em web remote replayable snapshot.
11. Cada rodada concluída da continuous pump precisa passar por um delay de macrotask capaz de acordar o processamento; se durante ele ocorrer
    `markPrepared()`, `release()` ou invalidação, o delay deve terminar imediatamente e reler a phase, sem criar uma capture adicional.

### 4.6 Bootstrap transparente de guest hidden-born em macOS / Windows

O activity por capturer-count é eficaz para um guest "que já teve surface e agora está com agendamento hidden", mas não consegue estabelecer
o primeiro frame de um guest hidden-born. Por isso o wiring desktop habilita a capability `transparentWindowBootstrap` nos ciclos de vida hidden-but-alive de hide-close no macOS e de
close-to-tray no Windows; o controller não espalha esse comportamento para Web, móvel ou Linux.

Quando a primeira activity lease descobre que a owner window já está oculta, antes de iniciar as pumps de capture de owner/guest:

```text
snapshot originalOpacity
  -> Windows: setSkipTaskbar(true)
  -> setOpacity(0)
  -> subscribe focus
  -> showInactive()                 # 不激活 app、不抢焦点；窗口对用户透明
  -> 100ms presentation grace       # 禁止并发 CopyFromSurface
  -> owner + target guest pump 建立/维持首帧
  -> renderer Ready
       -> if 用户未聚焦: hide() -> restore originalOpacity
       -> if 用户已聚焦: restore originalOpacity，保留 visible
       -> Windows: setSkipTaskbar(false)
  -> guest paced capturer 维持 surface
  -> Page.captureScreenshot
```

Restrições:

1. A opacity precisa ser zerada antes de `showInactive()`; nenhuma exceção pode exibir primeiro uma janela opaca.
2. A opacity original precisa ser restaurada a partir do snapshot, sem assumir um valor fixo de `1`.
3. No Windows é preciso aplicar temporariamente `setSkipTaskbar(true)` antes de `showInactive()` e restaurar `false` em qualquer caminho hidden/focus/error; o estado original do contrato de produto da janela principal é estar visível na taskbar. Caso contrário, mesmo com uma janela transparente sem pixels,
   o botão ou a prévia da taskbar pode reaparecer.
4. O bootstrap pertence apenas ao primeiro estado de activity owner + guest; leases concorrentes do mesmo guest são reaproveitadas, sem repetir show/hide.
5. Após `showInactive()` é preciso manter `100ms` de presentation grace; dentro do grace não se inicia nenhuma activity
   `capturePage()`, evitando CopyFromSurface concorrente antes de a Viz surface estar estabelecida. O Ready do renderer e o screenshot real podem aproveitar a janela transparente visível dentro do grace, sem precisar esperar por esse timer.
6. Renderer Ready, timeout de prepare, falha de capture, abort, watchdog, destruição da window e dispose do coordinator devem limpar o bootstrap de forma idempotente.
7. Se um `focus` da owner chegar durante o bootstrap, isso é tratado como o usuário restaurando ativamente a janela: restaurar imediatamente opacity/taskbar
   e proibir que os后续 cleanups chamem `hide()`. A decisão de focus e o hide/restore, dentro do main monothread, precisam concluir no mesmo segmento síncrono de limpeza, evitando ocultar de volta a janela do usuário.
8. `showInactive()` apenas repõe a oportunidade de apresentação em nível de janela e não altera a tab ativa da Browser API, a seleção de tab do
   renderer, workspaceKey, session owner ou a semântica de persistência de imagens.
9. O bootstrap não é iniciado quando a window já está visível ou em estado minimized, evitando restaurar incorretamente um estado minimized como
   hidden; o wiring Linux mantém a capability desligada e segue a capture activity existente.

A activity lease precisa ter um recolhimento limitado independente. O budget padrão de transporte de screenshot do host é de `30s`,
e o budget de screenshot de elemento do Playwright é de no máximo cerca de `32s`; o watchdog seguro da activity lease é de `35s`.
O watchdog apenas força a restauração da capture layer do renderer e para a pump de capture de activity, sem falsificar que o screenshot do Chromium subjacente terminou.

Após o cancelamento do screenshot podem existir dois fatos distintos:

```text
caller timeout / cancel
  -> activity lease: 立即释放，停止 owner renderer 与目标 guest 后台持续跑帧
  -> inFlightScreenshots: 继续保留，直到 Chromium Promise 真实 settle
```

O CDP `Page.captureScreenshot` não tem uma API confiável de cancelamento por requisição. Mesmo que o chamador já tenha dado timeout, a Promise subjacente ainda pode continuar executando; uma nova tentativa na mesma tab precisa continuar sendo bloqueada por `inFlightScreenshots`, mas o throttling de segundo plano não pode ser desligado por tempo indeterminado só para esperar um resultado tardio.

## 5. Sequência temporal

```text
CLI/runtime screenshot(tabId)
  -> desktop main / BrowserGuestManager
       -> enter per-tab viewport mutation queue
            -> CDP read CSS viewport
            -> coordinator.prepare(requestId, full scope, webContentsId, viewport)
                 -> activityController.acquire(owner window, target guest)
                      -> macOS / Windows hidden owner: opacity=0 + showInactive() bootstrap
                      -> preparing: start owner + target guest continuous 1×1 capture pumps
                           -> each completed turn yields to Electron main event loop
                 -> owner renderer
                      -> target inactive tab: hidden -> background capture layer
                      -> ResizeObserver + 2 stable animation frames
                      -> ready(requestId, webContentsId, DOM viewport)
                 <- ready
                 -> activityLease.markPrepared()
                      -> 未被用户激活时 hide() + restore opacity
                      -> owner stops; target guest switches to 200ms paced capture
            -> validate guest identity + viewport
            -> Page.captureScreenshot
            -> finally coordinator.release(requestId)
                 -> renderer removes capture layer state
                 -> activity lease release
                      -> target guest stops; Chromium restores hidden scheduling
  <- PNG or structured screenshot failure
```

Essa sequência sincroniza apenas a superfície de renderização e não altera o dono da tab, a tab ativa da Browser API ou a seleção do usuário na barra lateral.

## 6. Erros e limpeza

- O prepare espera no máximo `3000ms`; esse budget existe apenas para acomodar a estabilização de surface do renderer em máquinas lentas ou janelas em segundo plano, e não substitui a validação de identidade do guest, viewport, frames estáveis consecutivos e conteúdo raster. Destruição de janela,
  renderer sem resposta, viewport zero, mudança do id do guest ou cancelamento da requisição resultam todos em falha de screenshot.
- O main precisa colocar o `timeoutMs` real e atual no payload de prepare; o deadline de segurança de validação local do renderer é
  `timeoutMs + 1000ms` (padrão `4000ms`). O caminho normal continua sendo limpo antecipadamente pelo main, que envia `Release` quando o prepare settle; os 1000ms extras apenas impedem que o laço de validação sobreviva para sempre caso o Release se perca, sem encurtar o budget efetivo do main.
- Em caso de falha não se executa `Page.captureScreenshot`, evitando persistir uma imagem conhecida como corrompida como fato de fim de turno.
- `release` precisa ser idempotente e é executado após sucesso, exceção CDP, timeout, abort e completion tardio.
- Abort, timeout, falha de envio, destruição de janela ou dispose do coordinator durante a fase prepare precisam liberar a
  activity lease; abort após o ready precisa liberar automaticamente a surface lease correspondente, sem depender apenas do settle da Promise CDP subjacente.
- Quando o activity watchdog expira, força-se o settle do group, para-se a capture pump e registra-se `warn`; o screenshot subjacente ainda mantém o
  tombstone em `inFlightScreenshots` até o settle real.
- Quando a própria capture de activity falha, a preparação termina imediatamente via invalidação de lease; se a surface já está em Ready,
  o manager verifica novamente a invalidação antes de retornar a imagem, e não pode tratar uma imagem tardia que perdeu a garantia de activity como sucesso.
- A continuous pump não pode ficar em espera por rotação em Promise microtask até o renderer ficar Ready; mesmo uma capture que complete
  imediatamente precisa ceder antes uma chance de agendamento a timers, IPC, second-instance e ciclo de vida da janela.
- Na limpeza do bootstrap transparente, se a janela já foi destruída não se chamam mais `hide()` / `setOpacity()` /
  `setSkipTaskbar()`; se a janela já foi focada pelo usuário, restaura-se apenas opacity/taskbar e a janela permanece visível.
  Em caso de falha de `showInactive()`, da opacity ou das configurações de taskbar do Windows, a activity deve falhar de forma controlada, sem recorrer a um `show()` visível.
- O renderer ignora diretamente releases desconhecidos; um novo prepare pode sobrescrever um request antigo já encerrado na mesma tab, mas não pode sobrescrever um request diferente ainda ativo.
- Prepares/readys/releases de alta frequência usam apenas `logger.debug` da UI e logs debug de service/main; os logs não registram
  base64 de imagem, corpo da página nem URL completo.
- O screenshot automático de fim de turno é best-effort: quando a preparação da superfície falha, mantém-se a semântica existente de "registrar e pular a imagem, sem afetar a conclusão da conversa";
  a API explícita de screenshot retorna um erro estruturado.

## 7. Limites multiplataforma e de identidade

- O desktop `desktop-continuous` e o móvel `web-remote-replayable` continuam lendo o mesmo fato de imagem persistido com sucesso.
- Os comandos de controle remoto do celular continuam chegando pela shared-host attachment até a owner desktop window; não é criado browser runtime nem host independente no celular.
- `workspaceIdentity` continua isolando via
  `workspaceKey = workspaceIdentity?.trim() || workspacePath`; o roteamento existente de `remoteSessionId` para workspace remoto não muda.
- prepare/ready/release não entram no relay e não carregam semântica de recuperação de stream, queue, snapshot ou clientMode.
- macOS, Windows e Linux compartilham o mesmo contrato de coordinator; o bootstrap de janela transparente do wiring desktop
  só é habilitado em macOS/Windows, onde o Electron suporta opacity, e no Windows a entry da taskbar é temporariamente oculta.
  DPI alto no Windows é uma superfície de risco que precisa ser verificada; os contratos de screenshot surface e raster em si não recebem tratamento especial por plataforma.

## 8. Testes e aceitação

### 8.1 Automatizado

1. UI: uma browser-use tab inativa que recebe prepare deixa de usar `display:none`, sem alterar active tab,
   focus, pointer e acessibilidade; após o release, tudo é restaurado.
2. IPC do renderer: não fica ready quando qualquer um entre scope, generation, tabId, webContentsId e requestId não casa.
3. Coordinator: ready, timeout, abort, window destroyed, late ready e release idempotente.
   A activity lease precisa ser obtida antes do prepare; um group do mesmo guest obtém apenas uma; groups enfileirados não obtêm;
   há troca de activity phase no Ready; e a invalidação de activity, o abort após prepare/send/ready, o watchdog, o
   window destroyed e o dispose liberam tudo.
4. Manager: o prepare precisa vir antes do screenshot CDP; release em success/error/abort; quando o prepare falha
   não se chama `Page.captureScreenshot`; não se retorna imagem de sucesso depois da invalidação da surface; o prepare precisa ser
   obtido dentro da per-tab viewport mutation queue, e a activity não pode girar ociosamente fora da fila.
5. Os testes existentes de screenshot, clip, fullPage e backpressure de in-flight continuam passando.
6. Smoke real do Electron: primeiro deixa o guest visível em `800 × 450`, depois deixa a tab inactive e ajusta a barra lateral
   para `1274 × 720`; após o prepare, o screenshot deve corresponder ao CSS viewport atual, com os quatro sentinels de canto distintos entre si,
   e sem repetição periódica de `800 × 450`.
7. Smoke real de activity do Electron: com a janela oculta, owner renderer, guest alvo e sibling guest
   entram todos em throttling; a fase preparing só devolve a execução de frames ao owner renderer + guest alvo; após `markPrepared()` o
   owner volta ao throttling, o guest alvo continua avançando com pulsos de capture de no máximo 5Hz e o sibling permanece sempre com throttling;
   após a liberação e o settle da última capture, os três voltam a ficar com throttling. O smoke também precisa injetar uma falha de capture,
   provando que a pump para e reporta a invalidação explicitamente. Durante todo o processo `getBackgroundThrottling()` permanece `true`.
8. Regressão de agendamento do controller: fazer com que `capturePage()` de owner/guest resolve imediatamente de forma consecutiva; antes do primeiro timer
   turn, cada alvo tem no máximo apenas as captures sobrepostas iniciais, sem esgotar toda a fila síncrona de resultados; o timer
   precisa conseguir rodar, e depois `markPrepared()` / `release()` conseguem parar a renovação do pump.
9. Regressão de estado de janela do controller: um owner oculto executa `setOpacity(0) -> showInactive()` em sequência antes da primeira capture pump; após o Ready, quando não há ativação do usuário, executa em sequência o vencimento do
   presentation grace e, com o capturer do guest alvo já iniciado, `hide() -> restore originalOpacity`. Antes do grace, a contagem de captures de owner/guest precisa ser zero, evitando
   `UnknownVizError` / crash nativo. Se um `focus` chegar durante o bootstrap, a opacity precisa ser restaurada imediatamente,
   e Ready/release não devem mais ocultar; owner visível e plataformas sem a capability habilitada não podem chamar essas APIs.
   No Windows é preciso afirmar ainda que `setSkipTaskbar(true)` ocorre antes de `showInactive()` e que `false` é restaurado na limpeza hidden/focus/error.
10. Smoke real de hidden-born do Electron: primeiro oculta o owner, depois faz attach/navigate dinâmico do guest; antes do bootstrap
    transparente a capture está vazia ou falha, e depois do bootstrap tanto o primeiro frame do guest quanto a captura final são não vazios; após a limpeza, afirmar
    `isVisible() === false`, `isFocused() === false`, opacity restaurada, e que capturas ocultas subsequentes continuam funcionando.
    O smoke roda em macOS e Windows; no Windows a cobertura inclui também a ocultação temporária da taskbar.

### 8.2 Aceitação

- Com o usuário mantendo a conversa ou outra tab da barra lateral ativa, o screenshot de fim de turno não troca a UI, não pisca e não produz colagem repetida.
- O conteúdo, o tamanho e a posição de rolagem do screenshot da mesma página são iguais entre active e background.
- DPI de 125%/150%/160% no Windows passa por pelo menos um smoke manual ou Electron real; não se pode depender apenas de mock.
- `pnpm typecheck` e `pnpm lint` precisam passar.
- Guest hidden-born precisa estar coberto em Electron real no macOS; close-to-tray no Windows exige CI no Windows ou smoke manual, e o ambiente não Windows atual só consegue cobrir teste unitário do ciclo de vida da taskbar; o Linux não habilita bootstrap transparente.
- Se o CI não conseguir cobrir outras versões do macOS, close-to-tray no Windows, Linux ou o compositor de janela minimizada,
  a descrição do commit precisa listar os riscos e os itens pendentes.

## 9. Superfície de impacto e podagem de casos

Este trabalho pertence a `commit-effect + recovery + rendering/performance + app-shutdown-policy`. A activity
lease altera apenas a estratégia de energia/composição do Electron durante a preparação da superfície de screenshot no desktop e estabelece temporariamente uma oportunidade de apresentação de janela transparente após hide-close no macOS /
close-to-tray no Windows; não altera a Browser API, os fatos de imagem, o ciclo de vida das tabs, a workspace identity nem os contratos de recuperação multiplataforma. A ferramenta de grafo de código não está disponível neste workspace, então a superfície de chamadas foi determinada por busca precisa de símbolos, expandindo dois níveis para cima nos direct callers.

| Item de impacto   | Conclusão                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Capability principal | `capability.browser-screenshot-surface`; os pontos de entrada continuam sendo os screenshots explícitos/de fim de turno do browser |
| Owner de runtime  | `DesktopBrowserScreenshotActivityController` no main do Electron; o renderer só recebe prepare/release                  |
| Cadeia de chamada direta | `BrowserGuestManager -> DesktopBrowserScreenshotSurfaceCoordinator -> activity controller -> BrowserWindow` |
| Limite de entrega | Afeta apenas o recurso transitório local de `desktop-continuous`; precisa permanecer isolado de `web-remote-replayable`, relay e snapshot |
| Invariantes       | workspaceKey, tab/session ownership, fatos de imagem, UI selection, protocol shape e focus do usuário permanecem inalterados |
| Evidência         | teste unitário do estado do controller + testes existentes de coordinator/manager + smoke/runtime trace real de hidden-born |

| Caso    | Estado inicial                        | Evento                            | Efeito esperado                                                          | Classificação                 |
| ------- | ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| BAS-001 | owner window em segundo plano, sem screenshot | browser-use tab persiste           | mantém o throttling padrão e não fica rodando frames continuamente     | accepted                      |
| BAS-002 | owner window em segundo plano        | screenshot explícito ou de fim de turno | acorda owner + guest alvo antes do prepare e para a pump após o settle | accepted                      |
| BAS-003 | prepares concorrentes do mesmo guest  | dois requests ficam ready          | compartilham o surface group e uma única activity lease                  | accepted                      |
| BAS-004 | requests de guests diferentes enfileirados | screenshot anterior ainda não liberou | apenas o guest alvo do group ativo é acordado                            | accepted                      |
| BAS-005 | timeout/abort antes do ready         | falha na preparation               | libera renderer e activity lease sem executar o screenshot               | accepted                      |
| BAS-006 | backend pendurado após o ready       | cancelamento/watchdog do host      | restaura o throttling e mantém o bloqueio de reentrada in-flight da mesma tab | accepted                    |
| BAS-007 | destruição da owner window           | em qualquer estágio                | limpeza idempotente sem acessar WebContents destruído                   | accepted                      |
| BAS-008 | recuperação replayable no celular    | lê o screenshot já persistido      | não propaga activity lease nem cria runtime no celular                   | pruned; invariante local do desktop |
| BAS-009 | owner oculto; capture completa imediatamente | renovação da continuous pump em preparing | cede macrotask por rodada; IPC/timer rodam e a contagem de captures fica limitada | accepted; regressão da causa raiz deste ciclo |
| BAS-010 | owner já oculto no macOS             | attach de guest depois disso e requisição de screenshot | bootstrap transparente de primeiro frame; screenshot bem-sucedido com a janela mantendo hidden/unfocused | accepted; regressão da causa raiz deste ciclo |
| BAS-011 | bootstrap transparente em andamento  | usuário foca ativamente o ZCode     | restaura a opacity imediatamente; Ready/release não podem ocultar de novo a janela do usuário | accepted; corrida de estado da janela |
| BAS-012 | owner já oculto na bandeja do Windows | attach de guest depois disso e requisição de screenshot | bootstrap transparente; a taskbar não reaparece; após o screenshot continua oculto na bandeja | accepted; caminho paritário no Windows |
| BAS-013 | Linux ou owner visible/minimized     | requisição de screenshot            | não inicia bootstrap transparente; segue o ciclo de vida de activity/close existente | accepted; limite de plataforma |

As combinações representativas se concentram em "group ativo × evento de ciclo de vida", sem fazer a permutação completa com número de tabs, tipo de workspace ou
`desktop-continuous` / `web-remote-replayable`; o escopo completo continua sendo provado pelos testes de identidade já existentes do coordinator.