# Design de Captura Visual do Windows CUA com WGC

## Contexto

O source Helper do Windows já possui árvore de elementos de UI Automation, entrada por ponteiro e área de transferência de texto nativa, mas o caminho visual ainda é uma implementação de placeholder:

- `captureWindowImage` de `ax_native.node` retorna `null` fixamente;
- o `SystemSurface` do Windows declara `supportsScreenCapture=false`;
- `screenshot` não consegue capturar o monitor selecionado;
- `get_app_state(include_screenshot=true)` só consegue retornar o estado de UIA, sem imagem da janela anexada;
- `space:"state_image"` e `space:"screenshot"` já têm semântica de coordenadas, mas não têm fonte de imagem no Windows.

O macOS já forma o ciclo completo de "validação de identidade da janela + imagem da janela + cache de estado". O Windows adota o mesmo limite de produto, mas usa Windows Graphics Capture (WGC) como fonte de pixels, para suportar janelas alvo ocluídas por outras janelas comuns.

Este design cobre apenas o source Helper local do Windows. macOS, Linux, SSH, WSL, Docker, remote workspace, celular `/remote` e a cadeia de empacotamento do produto permanecem inalterados.

## Objetivos

Esta etapa completa de uma vez o ciclo visual local do Windows:

1. `screenshot` captura o monitor selecionado pelo usuário, preservando a origem de monitores com coordenadas negativas;
2. captura um HWND especificado e ainda devolve o conteúdo da janela alvo mesmo que ela esteja totalmente ocluída por outras janelas comuns;
3. `get_app_state(include_screenshot=true)` anexa ao estado a imagem da janela a partir da mesma observação já validada;
4. reutiliza a semântica existente de `state_id`, `space:"state_image"` e do visual-frame mais recente do screenshot, sem novo protocolo de revisão de captura;
5. valida antes e depois da captura a identidade do monitor ou da janela, o processo, o caminho do executável e os limites, recusando montar uma árvore de UIA antiga e uma imagem nova no mesmo estado;
6. a captura nativa e a codificação PNG rodam em worker de segundo plano, sem bloquear a thread principal N-API/V8;
7. a capability só é verdadeira quando existe um caminho WGC completo e chamável;
8. mantém inalterados os nomes, parâmetros e tier/annotation dos 30 ferramentas MCP existentes.

## Não objetivos

Esta etapa explicitamente não inclui:

- refatoração do caminho visual do Electron/macOS/Linux;
- SSH, WSL, Docker, remote workspace ou celular `/remote`;
- pacotes de instalação do produto, assinatura, identidade de loja, manifest do aplicativo e artefatos pré-compilados x64/arm64;
- solicitar ou contornar a capability restrita de "captura sem a borda amarela"; o desenvolvimento de source aceita a borda padrão do WGC do sistema;
- usar BitBlt, PrintWindow, PowerShell, comandos externos, `desktopCapturer` do Electron ou binários privados como fallback;
- criar um novo sidecar em Rust/napi-rs ou processo residente adicional;
- transformar a leitura síncrona de UIA existente em um worker separado;
- introduzir um handle de captura `screenshotId` separado ou modificar o schema das ferramentas MCP;
- vídeo, captura em streaming, picture-in-picture ou diff de múltiplos frames;
- a promessa de "captura bem-sucedida" de janelas minimizadas; um alvo minimizado precisa falhar honestamente;
- gestão completa de cor HDR. A primeira fase produz PNG BGRA8 SDR, e o tone mapping HDR fica como item de qualidade de produto posterior.

## Solução Confirmada

Adota-se o addon C++ do Windows já existente, `ax_native.node`, acrescentando uma implementação C++/WinRT + D3D11 + WIC e expondo-a ao TypeScript por meio de Promise assíncrona via N-API.

Soluções não adotadas:

1. **sidecar em Rust/napi-rs**: adicionaria processo, toolchain, artefato de publicação e fronteira de protocolo, inadequado ao fechamento rápido do source Helper atual.
2. **`desktopCapturer` do Electron**: acopla de volta o Helper Node independente ao renderer/main do desktop, quebrando o limite atual em que o Helper pode ser iniciado de forma independente.
3. **BitBlt/PrintWindow/PowerShell**: não atendem de forma confiável à semântica de janela ocluída e introduziriam comportamentos distintos de permissão, cor, DPI e ciclo de vida.

Base da escolha técnica:

- [`IGraphicsCaptureItemInterop`](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nn-windows-graphics-capture-interop-igraphicscaptureiteminterop) fornece `CreateForWindow` e `CreateForMonitor`, permitindo criar o capture item a partir de HWND/HMONITOR;
- [`Direct3D11CaptureFramePool.CreateFreeThreaded`](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.direct3d11captureframepool.createfreethreaded) dispara o evento de frame usando uma worker thread interna e não exige que a thread chamadora tenha `DispatcherQueue`;
- a [documentação de captura de tela do Windows](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture) exige verificar antes `GraphicsCaptureSession.IsSupported` e explica o ciclo de vida de frame-pool/session do WGC;
- a [documentação de app capability do Windows](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations) explica que uma capability restrita é um limite de manifest/publicação do produto, portanto esta fase não mistura "sem borda do sistema" na aceitação do source runtime.

## Arquitetura e Ordem dos Eventos

```text
screenshot / get_app_state(include_screenshot=true)
  |
  v
TypeScript capability + target identity gate
  |
  v
native Promise
  |
  v
Napi::AsyncWorker（后台 MTA）
  |
  +--> IGraphicsCaptureItemInterop
  |      +--> CreateForMonitor(HMONITOR)
  |      `--> CreateForWindow(HWND)
  |
  v
Direct3D11CaptureFramePool::CreateFreeThreaded
  |
  v
等待第一张有效帧 / target closed / deadline
  |
  v
只复制 ContentSize 到 D3D11 staging texture
  |
  v
WIC 内存 PNG 编码
  |
  v
再次校验 monitor/HWND/PID/exe/bounds
  |
  +--> screenshot：写入最新 visual-frame
  |
  `--> get_app_state：图像与 UIA 状态一起进入 state cache
                         |
                         `--> state_id + space:"state_image"
```

Toda associação de estado continua sendo responsabilidade do broker existente:

```text
显示器 screenshot N
  `--> visual-frame N（原点 = 该显示器物理 bounds）
       `--> space:"screenshot" 只允许引用当前 visual-frame

窗口 capture_app N
  `--> UIA tree N + PNG N + capture bounds N
       `--> state_id N
            `--> space:"state_image" 只允许引用 state_id N 的图像
```

Um screenshot/zoom posterior substitui o visual-frame atual da sessão; um `get_app_state` posterior gera um novo `state_id`. Portanto o protocolo existente já tem um limite de versão da captura, e não é preciso introduzir `screenshotId`.

## ABI Nativa

No addon do Windows são acrescentados exports aditivos e opcionais:

```ts
type NativeScreenCaptureSuccess = {
  ok: true;
  format: "png";
  data: Uint8Array;
  width: number;
  height: number;
  bounds: [number, number, number, number];
};

type NativeScreenCaptureFailure = {
  ok: false;
  error:
    | "unsupported"
    | "unavailable"
    | "busy"
    | "timeout"
    | "invalid_target"
    | "target_changed"
    | "too_large"
    | "device_lost"
    | "capture_failed"
    | "encode_failed";
};

type NativeScreenCaptureOutcome = NativeScreenCaptureSuccess | NativeScreenCaptureFailure;

interface AxWinNativeAddon {
  isScreenCaptureSupported?(): boolean;

  captureMonitorPngAsync?(
    bounds: [number, number, number, number],
  ): Promise<NativeScreenCaptureOutcome>;

  captureWindowPngVerifiedAsync?(
    windowId: number,
    pid: number,
    expectedCanonicalBundleId: string,
    expectedBounds?: [number, number, number, number],
  ): Promise<NativeScreenCaptureOutcome>;
}
```

`data` pode ser carregado por um `Buffer` do Node na implementação, mas a ABI valida como `Uint8Array`, evitando que a camada superior dependa de métodos exclusivos de Buffer. Um outcome de falha não expõe HRESULT, texto de erro do sistema, título da janela, caminho do executável, conteúdo da imagem, pipe ou token.

Os três exports precisam existir em grupo. Addon antigo, meio grupo de exports, valores de retorno anômalos ou Promise rejeitada fazem fail closed, e não é permitido recorrer a uma função de placeholder síncrona.

## Localização do Monitor

O broker já escolheu o monitor e mantém seus bounds físicos. O nativo não confia no valor numérico de `HMONITOR` exposto ao JS como válido a longo prazo, e sim:

1. recebe `[x, y, width, height]`;
2. enumera os monitores atuais procurando o `HMONITOR` com bounds exatamente correspondentes;
3. relê os bounds uma vez antes de criar o item do WGC;
4. confirma novamente após o PNG que o monitor ainda existe e que os bounds não mudaram;
5. qualquer divergência devolve `target_changed`.

O `bounds` do outcome bem-sucedido são os bounds físicos finais e verificados do monitor. `x/y` negativos são preservados sem zerar; o visual-frame usa esses bounds como origem das coordenadas globais para a imagem.

## Identidade e Limites da Janela

A captura de janela recebe HWND, PID esperado, caminho de executável normalizado e os bounds opcionais observados no momento da UIA. A mesma verificação é executada antes e depois da captura:

1. `IsWindow(hwnd)` é verdadeiro;
2. `GetWindowThreadProcessId` é igual ao PID esperado;
3. o canonical executable path consultado é igual ao bundle id esperado;
4. o alvo não é o próprio Helper, o shell da tela de bloqueio nem um desktop de sistema protegido conhecido;
5. o processo alvo não tem nível de integridade superior ao do Helper;
6. `IsIconic(hwnd)` é falso e largura e altura da janela são maiores que zero;
7. `GetWindowRect` devolve coordenadas físicas válidas;
8. se o chamador passou bounds observados pela UIA, eles precisam ser iguais antes do início da captura;
9. após o fim da captura, HWND, PID, exe e bounds precisam continuar idênticos aos do início.

Se a janela, o processo ou os limites mudarem durante a observação, devolve `target_changed`. Para `get_app_state`, esse erro faz toda a observação falhar e exige reobservação, e não se pode combinar uma árvore de UIA antiga com a imagem de outro instante.

As dimensões de pixel dos frames do WGC podem diferir de `GetWindowRect` por causa da borda do sistema ou de detalhes de implementação da plataforma. O `bounds` do outcome bem-sucedido representa a faixa de coordenadas físicas de desktop verificada antes e depois da captura, e `width/height` representa a dimensão em pixels do PNG; a camada superior usa esses dois conjuntos para estabelecer o mapeamento de coordenadas de `state_image`, sem confiar cegamente nos outer bounds anteriores da UIA e sem assumir 1:1 quando os dois divergem.

## Pipeline de Pixels

Cada capture worker destrói a sessão de captura assim que conclui uma imagem:

1. cria um device D3D11 com suporte a BGRA;
2. prefere o adapter de hardware e, em caso de falha, permite um device WARP; WARP ainda é o caminho WGC, e não um fallback de BitBlt;
3. encapsula o device DXGI como um `IDirect3DDevice` do WinRT;
4. cria um frame pool de 2 buffers com `Direct3D11CaptureFramePool::CreateFreeThreaded`, evitando dependência de DispatcherQueue;
5. cria a sessão de captura e a inicia;
6. espera o primeiro frame com dimensão válida, ouvindo simultaneamente item closed e deadline;
7. copia apenas o intervalo `ContentSize` do frame e recusa reutilizar pixels de borda históricos presentes na textura;
8. copia para uma staging texture legível pela CPU e lê segundo o `RowPitch`;
9. usa o WIC para codificar PNG BGRA8 em memória;
10. fecha a session/frame pool e libera staging, D3D, WinRT e os objetos de evento.

A saída é um PNG padrão não entrelaçado. A primeira fase usa SDR BGRA8; a precisão de cor em monitores HDR é uma limitação conhecida, mas isso não pode servir para reportar falsamente sucesso de captura e devolver uma imagem em branco.

## Threads, Concorrência e Limites de Recursos

WGC e codificação não podem rodar na thread principal do JS:

- cada chamada usa `Napi::AsyncWorker`;
- o worker inicializa MTA e captura todas as exceções C++/WinRT dentro do worker;
- `NAPI_DISABLE_CPP_EXCEPTIONS` continua restringindo o node-addon-api; exceções WinRT não podem atravessar a fronteira worker/native ABI;
- usa-se um `std::timed_mutex g_screenCaptureMutex` independente, com no máximo uma captura WGC simultânea por Helper;
- a espera pelo mutex de captura é de no máximo 250ms, com timeout retornando `busy`;
- o deadline do primeiro frame válido é de 2000ms, com timeout retornando `timeout`;
- máximo de 16.384 pixels por lado;
- máximo de 33.554.432 pixels no total (cobre uma tela 8K);
- PNG máximo de 128 MiB;
- ao exceder o limite, devolve `too_large` antes de alocar grandes blocos de memória de staging/PNG.

Ao fechar o Helper, primeiro para-se a admissão de novas chamadas. O worker verifica o estado de shutdown antes de criar a session e depois de obter o frame; workers já aceitos completam a Promise apenas depois de fechar a session, o frame pool e os objetos D3D/WinRT por RAII. Não podem sobrar threads de captura, janelas, processos ou imagens temporárias em disco.

## Capability e Estado

O `supportsScreenCapture` verdadeiro no Windows exige simultaneamente:

```text
platform == win32
AND interactive desktop preflight passed
AND isScreenCaptureSupported() == true
AND typeof captureMonitorPngAsync == "function"
AND typeof captureWindowPngVerifiedAsync == "function"
```

Internamente, `isScreenCaptureSupported()` usa `GraphicsCaptureSession::IsSupported()` e confirma que o sistema em execução suporta `IGraphicsCaptureItemInterop::CreateForWindow/CreateForMonitor`.

Semântica de estado:

- caminho completo disponível: `screenCaptureStatus="granted"`;
- desktop não interativo, tela de bloqueio/desktop seguro ou preflight de start recusando: `"denied"`;
- addon antigo, sistema sem suporte ou ABI incompleta: `"unknown"`, com a capability em false.

A capability indica que o source Helper atual consegue executar captura visual; não significa que o pacote de instalação do produto, a assinatura ou a capability sem borda estejam prontos.

## Integração TypeScript

### Adapter

`createNodeAutomationAdapter` segue o padrão de capability em grupo já usado pela área de transferência nativa:

- quando os três exports completos existem no Windows, faz await direto da captura nativa;
- o SystemSurface do Windows continua sendo uma surface fail-closed sem captura, sem fallback externo adicional;
- macOS/Linux continuam usando o SystemSurface existente;
- outcome malformado, throw síncrono e Promise rejeitada são todos mapeados para erros de broker higienizados.

`captureScreenPng(area)` chama a captura de monitor e converte o resultado bem-sucedido para a estrutura de captura de tela existente. Ela não mantém uma segunda cópia da imagem em cache; o visual-frame da sessão continua sendo construído pelo backend existente.

### App state

`createAxWinReadOnlySource` ganha um callback injetável de captura de janela verificada:

- com `includeScreenshot=false`, não inicia o WGC;
- com `includeScreenshot=true`, obtém primeiro o snapshot de UIA e a identidade da janela e só então chama a captura verificada;
- em sucesso, anexa o PNG, os bounds reais e a dimensão em pixels;
- `invalid_target` / `target_changed` faz toda a observação falhar;
- com identidade estável mas `busy`, `timeout`, `device_lost`, `capture_failed` ou `encode_failed`, permite manter a árvore de UIA com `screenshot=null` e anexa um warning aditivo e higienizado `screenshot_error`;
- um state sem imagem não cria um visual target `state_image`, e um `space:"state_image"` posterior precisa recusar explicitamente e exigir reobservação.

Assim não se perde informação de UIA utilizável por causa de uma falha visual somente leitura, nem se deixa o modelo acreditar que aquele state contém imagem.

## Mapeamento de Erros

| Native error                        | Semântica do broker                    | Regra de retry                          |
| ----------------------------------- | -------------------------------------- | --------------------------------------- |
| `busy` / `timeout`                  | `timeout`                              | observação somente leitura pode ser repetida explicitamente pelo chamador |
| `unsupported`                       | capability false / `not_authorized`    | não repetir nesta sessão                |
| `unavailable`                       | `internal` ou capability false no start | repetir explicitamente após o ambiente se recuperar |
| `invalid_target` / `target_changed` | `element_unavailable`, exige reobserve | não reutilizar o state antigo          |
| `too_large`                         | `invalid_request`                      | repetir após reduzir o alvo            |
| `device_lost`                       | `internal` retryable                   | não reproduzir ações automaticamente, apenas repetir a captura somente leitura |
| `capture_failed` / `encode_failed`  | `internal` higienizado                 | repetir explicitamente                 |

A captura visual é uma operação somente leitura e pode ser repetida explicitamente; quaisquer ações posteriores de clique e digitação continuam seguindo o delivery-state original, e uma falha visual não pode disparar reprodução automática de ações.

## Consistência de Coordenadas

O processo do Windows já usa `PER_MONITOR_AWARE_V2`, portanto UIA, `GetWindowRect`, bounds do monitor e bounds de captura do WGC são todos interpretados em pixels físicos.

### `space:"screenshot"`

```text
全局物理坐标 = screenshot 图片坐标 + selected monitor bounds 原点
```

Coordenadas negativas de monitores não principais precisam ser preservadas. Um screenshot ou zoom posterior substitui o visual-frame atual, e coordenadas do screenshot antigo não podem continuar em uso.

### `space:"state_image"`

```text
全局物理坐标 = state_image 图片坐标 + state capture bounds 原点
```

O state cache guarda os bounds reais e a dimensão em pixels do outcome nativo bem-sucedido. Se a dimensão real em pixels divergir da largura e altura dos bounds, a camada superior precisa escalar explicitamente conforme o image transform existente; não se pode assumir 1:1 e clicar silenciosamente na posição errada. Mover, redimensionar, minimizar, destruir a janela ou reutilizar HWND/PID invalidam o state antigo.

## Segurança e Privacidade

- desktop não interativo, tela de bloqueio e desktop seguro não são capturados;
- alvos com nível de integrância elevado não são capturados;
- logs nativos e TypeScript não contêm PNG, resumos de pixels, título da janela, caminho do executável ou conteúdo do usuário;
- por padrão o PNG não é gravado em disco;
- capturas de alta frequência só permitem estatísticas de ciclo de vida de nível `debug`, registrando apenas categoria de resultado, duração e dimensão, nunca conteúdo;
- mensagens de erro usam apenas códigos de erro fixos;
- o live smoke usa marcadores não sensíveis e não imprime marcador nem conteúdo de imagem na saída.

A fase de desenvolvimento de source aceita a borda de captura nativa do Windows, que faz parte do que o sistema mostra ao usuário como comportamento de captura; ela não é contornada por janela oculta, engano de manifest ou API privada.

## Estratégia de TDD e Verificação

Na fase de implementação, escreve-se primeiro o teste que falha e depois a implementação mínima, estritamente nesta ordem:

1. **testes de ABI/tipos**
   - só habilita com os três exports presentes;
   - item faltante, addon antigo, valor não função, outcome malformado e Promise rejeitada fazem fail closed;
   - Buffer pode ser consumido como Uint8Array.
2. **testes de adapter**
   - sucesso de monitor/window;
   - mapeamento de cada native error para broker error;
   - o Windows não faz fallback de SystemSurface;
   - o caminho macOS/Linux não lê a ABI do Windows.
3. **testes do state source**
   - `includeScreenshot=false` não chama a captura;
   - imagem bem-sucedida e bounds reais entram no mesmo state;
   - mudança de identidade/bounds faz toda a observação falhar;
   - falha transitória preserva a árvore de UIA, mas sem target `state_image`.
4. **testes do native source**
   - CreateForWindow/CreateForMonitor;
   - frame pool free-threaded;
   - ordem de device hardware/WARP;
   - crop de ContentSize, RowPitch, PNG do WIC;
   - mutex, deadline, guardas de tamanho, limpeza por RAII;
   - validação de identidade e bounds antes/depois;
   - códigos de erro fixos e sem vazar texto de HRESULT.
5. **checagens do addon compilado com MSVC**
   - os três exports existem;
   - a capability retorna verdadeiro de fato em sistemas suportados;
   - bounds/HWND inválidos devolvem falha estruturada, sem crash.
6. **testes de broker/source Helper**
   - `broker_info.capabilities.screen_capture`;
   - `screenshot` constrói o visual-frame correto do monitor;
   - `get_app_state` constrói um state com imagem;
   - sem imagem, `state_image` faz fail closed;
   - o Helper fecha normalmente e sem órfãos.
7. **portões completos**
   - testes focados/completos de zcode-cua, build, typecheck e lint;
   - testes focados de ZCode CUA, `pnpm typecheck` e `pnpm lint`;
   - se ainda existirem falhas de baseline não CUA, elas precisam ser listadas à parte e não reportadas como tudo verde.

## Smoke em Máquina Real

O smoke em máquina real vem desligado por padrão, exige opt-in explícito e só roda em um desktop comum desbloqueado. O teste usa janelas de teste controladas ou aplicativos comuns iniciados durante o teste, sem depender do conteúdo de janelas que o usuário já tenha.

Ordem de verificação:

1. iniciar o source Helper e confirmar a capability como verdadeira;
2. capturar o monitor selecionado, analisar o header do PNG e validar largura, altura e origem do monitor;
3. iniciar uma janela de teste identificável e registrar HWND/PID/bounds;
4. capturar a janela alvo pela primeira vez;
5. ocluir totalmente a janela alvo com outra janela de teste e capturar novamente pelo HWND;
6. validar que antes e depois da oclusão a imagem alvo é válida e não vazia, e que não é o conteúdo da janela que oclui;
7. chamar `get_app_state(include_screenshot=true)` e confirmar que a imagem retornada, o novo `state_id` e os capture bounds estão corretos;
8. verificar que a conversão de coordenadas de `state_image` atinge o alvo seguro pré-definido dentro da janela de teste;
9. minimizar a janela alvo e confirmar fail closed;
10. restaurar todos os estados de primeiro plano, as posições das janelas e os recursos de teste, fechar o Helper e confirmar que não há órfãos.

Qualquer falha de restauração faz o smoke falhar. Tela de bloqueio, LockApp, ausência de foreground e ambiente de desktop não interativo são registrados apenas como "ambiente não atendido" e não podem reportar aceitação live aprovada.

## Critérios de Aceitação

- a capability `screen_capture` do source Helper do Windows é true sob a ABI WGC completa;
- `screenshot` devolve um PNG válido do monitor selecionado e trata corretamente a origem com coordenadas negativas;
- com um HWND especificado totalmente ocluído por uma janela comum, ainda se obtém a imagem da janela alvo;
- `get_app_state(include_screenshot=true)` devolve a árvore de UIA, o PNG, os bounds e o novo `state_id` da mesma observação de janela validada;
- `space:"state_image"` usa somente a imagem e os capture bounds do state correspondente;
- não há state misto quando a identidade do alvo ou os bounds mudam;
- minimização, integridade elevada, tela de bloqueio/desktop seguro e HWND inválido fazem fail closed;
- addon antigo ou de implementação parcial não reporta capability falsamente;
- não existe BitBlt, PrintWindow, PowerShell, comando externo ou fallback do Electron;
- o worker nativo não bloqueia a thread principal do JS e, após a saída do Helper, não sobram threads, processos ou imagens temporárias;
- macOS/Linux, a surface de 30 ferramentas e o caminho remote/mobile não têm mudança de comportamento;
- os portões automáticos atingem os requisitos já existentes de cada repositório e o live smoke opt-in em desktop comum desbloqueado tem evidência explícita.

## Riscos Conhecidos e Fechamento de Produto Posterior

- a borda padrão do sistema do WGC pode entrar na experiência visual; a ausência de borda exige revisão de identity/manifest/capability do produto;
- cor e brilho de HDR para SDR podem não ser totalmente consistentes e exigem tone mapping posterior;
- em algumas GPUs/driver pode ocorrer device lost, e hoje isso só devolve um erro reconhecível, sem ocultação automática;
- pode haver divergência de borda do sistema entre WGC, `GetWindowRect` e o limite do conteúdo visível, e o mapeamento precisa usar os capture bounds/dimensões retornados;
- o pico de memória de um PNG 8K é elevado; já existem proteções de limite de pixels e de PNG, mas a fase de produto ainda precisa de teste de estresse;
- o addon pré-compilado x64/arm64, a assinatura do instalador, a compatibilidade de upgrade e o smoke de lançamento oficial ficam para o fechamento de produto posterior.

Esses riscos não mudam a escolha desta fase: primeiro fazer o ambiente de desenvolvimento de código-fonte formar um ciclo visual Windows com WGC repetível e verificável, e só então entrar em lançamento e productização.
