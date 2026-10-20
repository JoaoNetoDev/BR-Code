# Contrato de coordenadas do Browser Use sob zoom do Desktop

Chamado: ZCT-2096856609784438784. Complementa os limites de zoom da spec responsive-browser-viewport; não envolve reconhecimento visual por modelo.

## Comportamento

- No modo de tamanho livre, viewport, pixels da captura, coordenadas do modelo e coordenadas do DOM mantêm a mesma unidade de pixel CSS.
- A compensação de layout do guest para viewport fixo acontece apenas no renderer, e ampliar e reduzir usam a mesma fórmula: o layout do webview é escalado por `1 / desktopZoom` e depois composto de volta ao frame com `scale(desktopZoom)`. Assim, o viewport natural do guest é igual ao viewport-alvo tanto com quanto sem CDP attached. As metrics do CDP fixam apenas o viewport CSS e o DPR da captura, sem `scale`; os eventos de mouse são enviados como coordenadas CSS, sem conversão (desde 2026-10-16, ver “CDP idle detach depois a página cresce e encolhe” abaixo).
- Ao definir ou reaplicar um viewport fixo, o Main normaliza o guest page zoom para 1, evitando depender da ordem entre o callback do renderer e a propagação do zoom do Electron. Quando o zoom do Desktop muda, o renderer ainda reenvia uma vez o viewport atual, para que o Main normalize de novo o guest zoom no mesmo limite serial.
- Após o CDP idle detach, a próxima captura, mesmo já estando na fila de viewport, deve restaurar as metrics antes. A região crítica da captura em si não equivale a ter o viewport já restaurado; não é permitido enfileirar de novo e esperar por si mesmo ao reentrar.
- A captura comum de viewport fixo lê o `guest.capturePage()` do Main quando a preview é reduzida ou o Desktop é ampliado, e então normaliza para o tamanho CSS. O `surfaceScale=1` reportado pelo renderer indica apenas a proporção de layout da preview e não prova que o raster do CDP cobre o viewport inteiro; clip / fullPage continuam sendo executados pelo CDP.
- A camada de preparação da captura comum não pode exceder a janela visível do host e deriva temporariamente uma preview Fit; isso vale também quando o usuário escolhe 100% / 200%. Caso contrário, sob DPI alto no Windows, o recorte do raster do guest do Chromium deixa bordas faltando na imagem e a normalização posterior estira essas bordas como se fossem a imagem completa. A camada de preparação temporária não altera o viewport do usuário nem a preferência de zoom da preview, e restaura a proporção original ao ser liberada. As requisições `unscaled` de gravação mantêm o layout existente e o contrato de surface 100%.
- Mantêm-se as fronteiras existentes de idle detach, ciclo de vida do guest, isolamento de workspace/session e o roteamento desktop-continuous / web-remote-replayable. A alteração acontece somente no lado de execução compartilhado do guest.

```text
Desktop zoom -> renderer: layout do webview ×1/zoom + scale(zoom)   (layout natural = viewport)
             -> mutação de viewport -> metrics do CDP (sem scale) + guest zoom=1
                                         |
Entradas CSS (x,y,delta) ----------------v
                                  enviados como estão
                                         |
                                         v
                           Chromium -> evento nas coordenadas CSS originais

CDP idle detach -> próxima captura -> restaurar Page / metrics / guest zoom
                                         |
                                         v
                     Fit temporário dentro da janela (preserva a preferência do usuário)
                                         |
                                         v
                      Fit < 1 ou zoom do Desktop > 1
                            /                 \
                          sim                  não
                          |                    |
                  native capturePage       captura via CDP
                          |                    |
                          +--- normalização CSS ---+
```

## Regressões

### CDP idle detach depois a página cresce e encolhe (2026-10-16)

Sintoma: com o aplicativo ampliado um nível e o navegador embutido em tamanho livre (incluindo os 1280×720 trazidos pelo `newTab` do Agent), a página cresce a cada operação do Browser Use e volta ao normal cerca de 1,5s após o comando ficar ocioso. O modo comum não é afetado.

Causa raiz: a compensação de layout do nível de ampliação ficava antes somente no `scale` das metrics do CDP, e as metrics são estado per-session. O detach por ocioso de comando, introduzido para evitar UAF, faz o Chromium limpá-las; durante o ocioso o guest volta ao layout natural do webview (o renderer não faz a compensação de ampliação, guest zoom=1) e o innerWidth passa a ser `viewport × desktopZoom`. O nível de redução já fazia a compensação de layout `1 / zoom` no renderer, então os dois estados eram coerentes.

```text
Antes da correção (zoom=1.1, viewport=1280)
  Durante o comando  CDP attach -> metrics(1280, scale 1.1) -> innerWidth 1280
  Ocioso            idle detach -> metrics limpas -> layout natural -> innerWidth 1408   <- oscila
Após a correção
  renderer: layout do webview ×1/zoom + scale(zoom) -> layout natural innerWidth 1280
  Durante o comando / ocioso sempre 1280; as metrics fixam apenas o viewport CSS e o DPR, sem scale
```

Experimento isolado no Electron 41.0.3 (macOS, Retina): com layout `vw / z` + `scale(z)`, o innerWidth do guest para z=1.1 / 1.21 / 0.9 é igual a vw, os blocos de cor das bordas direita e inferior ficam completos, sem áreas em branco; o layout original do nível de ampliação resulta em `vw × z`. A conclusão de 2026-07-22 “na ampliação, o transform só amplia o DOM do webview e deixa o raster com áreas em branco” vale apenas para “não reduzir o layout, apenas adicionar transform”, e não se aplica a esta solução.

Permanecem inalterados: idle detach, a barreira de restauração do CDP, a normalização do guest zoom, o prepare/release da captura e a distinção entre `natural | emulated`. Com o Desktop ampliado, a captura comum de viewport continua passando por native capture + normalização CSS (proteção já existente contra as bordas faltando no Windows em tiled). `appliedViewportScale` e o multiplicador das entradas de mouse foram removidos junto com o scale das metrics.

Regressão: o E2E de coordenadas de zoom lê o innerWidth/innerHeight do guest em cada rodada após o idle detach e antes do primeiro comando, e precisa ser igual a 1280×720; os testes unitários do manager afirmam que as metrics do nível de ampliação não trazem `scale` e que as coordenadas de entrada não são multiplicadas; os testes unitários de UI afirmam que o layout do webview no nível de ampliação é `1 / zoom` e o transform é `zoom`.

### Limpeza dos multiplicadores após a troca de guest (CR-01)

> Desde 2026-10-16 as metrics não trazem mais scale, o estado de multiplicador descrito nesta seção foi removido e é mantido como histórico.

`appliedViewportScale` é o espelho das metrics de CDP já instaladas no guest atual, e não pode sobreviver à troca de guest ao longo de uma tab lógica. O fallback comum em segundo plano instala o multiplicador quando o aplicativo está ampliado; depois que o guest antigo é destruído ou substituído, se o novo guest usar o viewport natural, as metrics não serão reaplicadas e o multiplicador residual enviaria (300,200) como (330,220).

Limpar o multiplicador aplicado junto com o estado de fallback em `detachGuest`. O ramo de guest não correspondente de mutações assíncronas antigas continua apenas retornando, sem limpar o multiplicador válido do novo guest. A reconexão CDP comum em ocioso reaproveita a barreira de reaplicação das metrics já existente, sem adicionar novo estado ou mecanismo de restauração.

```text
guest antigo + fallback scale=1.1 -> detachGuest limpa o multiplicador -> viewport natural do novo guest -> entrada com as coordenadas originais
```

A regressão do manager cobre a substituição direta após a instalação do fallback, o callback destroyed e um novo reconnect CDP; antes da correção, os dois primeiros testes enviavam (300,200) como (330,220), e depois da correção passam. O Electron real segue o E2E de zoom, com a regressão adicional de queda e reconstrução do guest no modo comum, retorno ao primeiro plano e clique. No macOS, o guest oculto ainda pode manter o tamanho natural e o fallback instalado também pode ser removido ao retornar ao primeiro plano; portanto o E2E nativo comprova apenas que a cadeia real de reconstrução e clique não regrediu, sem afirmar a reprodução completa do resíduo de multiplicador antigo — este é provado pelos testes direcionados do manager. As regressões existentes de viewport fixo, captura natural e fallback do Windows continuam preservadas.

Verificação de 2026-09-08: 129 testes unitários do manager passaram; E2E nativo macOS arm64 / Electron 41.0.3 com 4 cases passou (run `desktop-e2e-20260908-055435-369`, 8 PNG / 20 trusted clicks). Novo cenário guest 2 → 3, com viewport mantido em 368×573 / DPR≈2.2, e clique em (100,200) com ponto de queda real em (100,200). Os artefatos estão no run em `zoom-coordinates/guest-recovery.{json,png}`. typecheck, lint (43 warnings já existentes), verificação de tipos do E2E e de fixtures passaram; nesta rodada não foram reexecutados Windows/Linux nem o controle remoto do celular, e o E2E continua aguardando revisão manual.

### Captura com viewport natural no primeiro plano do modo comum (reprodução em macOS, 2026-09-08)

No ZCode dev real em `4b9c4d51a0` / macOS, sair do tamanho livre e reduzir o aplicativo dois níveis (zoom≈0.826446) reproduziu o problema com o `tab.screenshot()` do Node REPL do produto: antes da captura o viewport era 508×855, durante o prepare passava a 614×1034, e após o release voltava a 508×855. A media query da página moveu assim o centro do botão de (100,200) para (200,200); o trusted click (200,200) após a captura não acertou, enquanto (100,200) acertou.

Causa raiz: o viewport natural não tem metrics de CDP fixando o tamanho lógico, mas reaproveitou a expansão de layout do guest `1 / desktopZoom` do viewport emulado. Depois de dividir pelo layout scale no ready, tudo parece coincidir, mas a página na verdade já sofreu reflow.

Na região crítica da captura, o Main passa explicitamente `viewportMode: natural | emulated` conforme o estado real do viewport. O viewport natural no primeiro plano do modo comum continua aplicando um Fit temporário no tamanho solicitado, mas o guest não se expande e não faz transform inverso; o tamanho livre e o fallback em segundo plano mantêm a compensação do layout emulado. Quando o payload antigo não traz esse campo, o comportamento emulado é preservado, e o contrato de gravação unscaled não muda. Modos de viewport diferentes não compartilham a lease de preparação, e o ready precisa devolver o mode correspondente.

```text
Estado do viewport no Main -> prepare(request.viewport, viewportMode)
  natural  -> frame Fit temporário -> layout original do guest -> capture -> release
  emulated -> frame Fit temporário -> compensação de zoom do guest + metrics do CDP -> capture -> release
```

A regressão precisa passar pela cadeia real do Browser Use, registrando o viewport / DPR / a posição alvo da media query antes da captura, nos eventos de resize e após a release, e conferindo a posição real do alvo no PNG e o trusted click subsequente. O modo natural mantém o guest original, o zoom original e as preferências do usuário. Continuam sendo executadas as regressões existentes de cinco rodadas de zoom em tamanho livre, o fallback comum em segundo plano e a gravação unscaled. Esta alteração adiciona apenas metadados transientes de layout no Main/renderer, sem mudar o protocolo do Agent, o roteamento do Host, o attachment do controle remoto do celular ou as fronteiras continuous/replayable.

A verificação em macOS arm64 / Electron 41.0.3 passou (run `desktop-e2e-20260908-042444-192`): o novo cenário de modo natural manteve o viewport sempre em 531×815, sem resize causado pela captura, o botão permaneceu em (100,200), e o bloco de cor do PNG coincidiu com o trusted click; as cinco rodadas de tamanho livre e o fallback comum em segundo plano também passaram, totalizando 3 cases, 7 capturas e 19 trusted clicks. 244 testes unitários relacionados, typecheck, verificação de tipos do E2E, lint (43 warnings já existentes) e fixture check passaram. As evidências e as fronteiras de plataforma estão em [registro de verificação macOS](../testing/browser-natural-viewport-macos-regression-2026-09-08.json). Windows/Linux, o controle remoto do celular e a gravação nativa não foram reexecutados; o E2E continua como pending.

### Captura com fallback em segundo plano no modo comum (2026-09-08 P2)

O modo comum em segundo plano pode manter um fallback viewport maior que a janela atual. Limitar apenas o tamanho da camada de preparação e passar o Fit não é suficiente para habilitar o layout responsivo; o webview ainda encolhe junto com o contêiner e o ready não consegue casar com o tamanho solicitado. Toda preparação de captura deve habilitar temporariamente o layout responsivo e adotar `request.viewport`: a captura comum usa Fit, a gravação continua em 100%. Após a release, são restaurados o modo original, o tamanho lógico e a preferência de preview, mantendo o mesmo webview / guest e sem gravar nas configurações do usuário.

```text
Tab comum em segundo plano + viewport em cache -> prepare em janela pequena
  -> responsive(request.viewport) temporário -> Fit -> ready -> capture
  -> release -> modo comum original / preferência original / mesmo guest
```

A regressão cobre sondas de layout de componente com largura e altura limitadas, a captura com redução de janela de uma tab comum em segundo plano no Electron real e a release; o E2E de zoom em tamanho livre e os testes unitários de gravação unscaled existentes continuam sendo executados.

Layout responsivo temporário não equivale ao usuário entrar no modo de tamanho livre: o guest zoom do fallback comum em segundo plano continua sendo gerenciado pelo ciclo de vida de metrics do main, e a release não pode restaurar para o desktop zoom. A regressão de componente verifica que, sob zoom de aplicativo diferente de 100%, prepare/release não modifica o guest zoom; a regressão nativa mantém o CDP attached sob zoom de aplicativo de 110%, não reinstala as metrics após a release e verifica o viewport, o guest zoom e três trusted clicks consecutivos.

A reprodução nativa também mostrou que, quando o fallback comum não traz a compensação de ampliação do aplicativo, o ready passa, mas o bloco de cor do PNG ainda é reduzido para `1 / desktopZoom` das coordenadas. As metrics do fallback precisam ler o zoom do aplicativo a partir do renderer ao qual o guest pertence, reutilizando o scale de CDP e a conversão de limites de entrada do tamanho livre; a primeira instalação, o reconnect em ocioso e a captura seguinte devem permanecer coerentes. Reduzir o aplicativo não aumenta o scale das metrics, o guest zoom permanece 1 e, ao voltar ao primeiro plano, o fallback ainda é removido, restaurando o layout natural.

1. O mesmo guest alternando entre 100% -> 110% -> 100% -> reduzir -> ampliar, cobrindo as previews Fit / 100% / 200% / 50%; os trusted clicks reais nos centros fixos dos botões (300,200), (600,400), (1000,600) acertam todos, e o desvio entre o centro do bloco de cor no PNG e as coordenadas do evento não passa de 1 px CSS.
2. Em cada rodada, esperar o CDP idle detach e usar a captura como o primeiro comando após o reconnect: o PNG precisa ser 1280×720, o viewport da página 1280×720, guest zoom=1; a posição do conteúdo na captura e a posição do clique coincidem.
3. Os testes unitários cobrem o caminho do mouse, o delta da roda, o isolamento de tabs, o reset de zoom e a ordem de restauração da captura em estado detached; o E2E no Electron real verifica os eventos reais do Chromium e os pixels da imagem.
4. Executar `pnpm typecheck`, `pnpm lint` e os testes unitários afetados; a verificação em cada plataforma deve informar a versão, o DPI e o escopo realmente executado, sem tomar a verificação histórica como verificação do patch atual.
5. A regressão nativa no Windows deve conferir simultaneamente o conteúdo do PNG e o trusted click, não se bastando as dimensões da imagem e o acerto no DOM; em cada rodada, salvar antes das asserções o PNG, as coordenadas da página, as amostras de cor e as informações de Electron/sistema/display scale, preservando as evidências mesmo nas rodadas com falha.
6. Após o fim da captura, a camada `preparing` precisa ter desaparecido e o `responsiveScale` real precisa ter sido restaurado para o 1 / 2 / 0.5 escolhido pelo usuário; apenas verificar o texto do dropdown não prova que a cadeia de release foi concluída. O layout de gravação unscaled e a restauração de preferências continuam sendo constritos pelos testes unitários correspondentes.

## Regressões complementares no Windows

Em 2026-09-07, reproduzido em Windows 11 x64 / Electron 41.0.3, com zoom de exibição do sistema a 125%: 100% passa, e a 110% as dimensões do PNG e as asserções de clique passam, mas o CDP faz o tiled periódico de um raster nativo menor e o centro do terceiro botão fica branco. A correção segue o caminho já existente de native capture + normalização CSS, incluindo a ampliação do Desktop na condição de escolha, sem adicionar nova tentativa de captura nem afrouxar as asserções de pixel.

Evidência de luz vermelha: `packages/desktop/.e2e-artifacts/desktop-e2e-20260907150411437-p10372-00512ee1039753cb/zoom-coordinates/round-1.png`; o novo teste unitário de `surfaceScale=1` retornava o PNG do CDP antes da correção e passa a ler o PNG nativo depois. As evidências de cada rodada ficam no artifact do run em `zoom-coordinates/`, incluindo PNG, viewport/DPR/trusted events da página e cor nativa, metadados de plataforma, Electron/Chromium e display scale.

Com 200% DPI + Desktop a 110%, reproduziu-se também um PNG nativo de 2747×1584 (o tamanho completo deveria ser 2816×1584), e após a normalização o botão em x=1000 passou a cerca de 1025. O Chromium faz a transform inversa com base no viewport do host e amplia o rect de compositing do guest em 30%, de modo que o conteúdo fora do alcance não entra no raster. Um experimento isolado no Electron que mudou apenas a largura da janela de 960 DIP para 1000 DIP restaurou a largura do PNG de 2721 para 2816, com a altura inalterada, confirmando que era recorte da área visível. A largura e a altura da camada de preparação têm como limite `100vw` / `100vh`, para que o Fit use a tela dentro da janela visível; não se compensa alterando o tamanho da janela do usuário, com novas tentativas atrasadas ou com esticamento não proporcional.

Fronteira de impacto: a seleção de captura de viewport comum no Main e a camada de preparação temporária de captura no renderer; nenhum novo protocolo, host, runtime ou estado persistido. O Web no celular mantém a preview original quando não há requisição nativa de prepare; as requisições de controle remoto continuam roteadas pelo attachment existente para o mesmo guest do desktop, sem alterar a semântica continuous / replayable. Nesta rodada não foram feitas E2E de controle remoto do celular nem de gravação nativa; a gravação `unscaled` mantém o comportamento do ramo original e tem proteção por teste unitário.

## Verificação da correção P2 no Windows (2026-09-08)

Incremento desta rodada, baseado em `28f297339ad2126fdd92e0e69277e432be9ae95a`: layout temporário para capturas de modo comum em segundo plano, fronteira de release do guest zoom e compensação de ampliação das metrics de fallback. Run com luz vermelha nativa da build antiga `desktop-e2e-20260908-024203-610`: requisição de 1280×720, webview real de 960×552 em uma janela de 960×600, modo inactive, prepare com timeout de 3000ms.

| Zoom de exibição do Windows | Resultado da build final            | Artifact run ID                   |
| ---------------------------- | ----------------------------------- | --------------------------------- |
| 125% nativo do sistema       | Os dois cases passaram              | `desktop-e2e-20260908-025710-354` |
| 200% forçado                  | Os dois cases passaram              | `desktop-e2e-20260908-031302-774` |

Cada nível mantém as cinco rodadas existentes de captura e clique com zoom de aplicativo/preview, acrescentando uma rodada de prepare/capture/release de modo comum em segundo plano com janela de 960×600 e aplicativo a 110%, totalizando 12 capturas e 36 trusted clicks. O novo cenário mantém 1280×720 no ready, com os três blocos de cor alvo corretos na captura; após a release, mantém o mesmo guest, o modo comum, guest zoom=1 e o viewport 1280×720, com desvio máximo de 1px em três cliques consecutivos.

O novo cenário nativo usa diretamente as IPC de produção prepare/ready/release, injeta metrics de fallback e executa native capture real e entradas CDP; não simula dimensões de DOM nem ready, mas isso não equivale a uma E2E de cadeia completa com o cache de fallback do manager. Os testes unitários do manager verificam adicionalmente o fallback inicial, a ampliação em estado quente, o reconnect em ocioso, o reset/redução, a escolha do caminho nativo e a compensação de entrada. As evidências legíveis por máquina estão em [registro desta verificação](../testing/browser-normal-fallback-windows-regression-2026-09-08.json).

340 testes unitários relacionados, `pnpm typecheck`, `pnpm lint` (43 warnings já existentes, 0 error), verificação de tipos do E2E e de fixtures passaram. Os zooms de exibição de 100%/150% só têm o registro do commit anterior descrito abaixo; nesta rodada não foram reexecutados macOS/Linux, o controle remoto do celular nem a gravação nativa. O Web, sem native prepare, não muda o layout; o controle remoto continua roteando para o mesmo guest do desktop, com as fronteiras continuous/replayable inalteradas. O comportamento de gravação unscaled é protegido pelos testes unitários existentes. Este case continua em manual-review/pending, e as limitações de cobertura acima devem ser preservadas na merge/release.

## Matriz de verificação no Windows (2026-09-07, commit anterior)

Windows 11 x64 (10.0.26200) / Electron 41.0.3 / Chromium 146.0.7680.80. Abaixo, todos os resultados são do patch final e do mesmo case reforçado; cada nível tem 5 rodadas, 15 trusted clicks, 5 PNG, somando 20 rodadas / 60 cliques. Todos os PNG e os viewports do guest são 1280×720, com DPR=1 na página e guest zoom=1, mantendo o mesmo guest; o desvio máximo do centro dos blocos de cor da imagem é 0 px, o desvio máximo dos cliques reais é 1 px, e tanto a release da captura quanto a restauração da preview passaram.

| Zoom de exibição do Windows | Forma de execução                      | Resultado | Artifact run ID                   |
| ---------------------------- | -------------------------------------- | --------- | --------------------------------- |
| 125%                         | Zoom de exibição nativo do sistema   | PASS      | `desktop-e2e-20260907-153516-455` |
| 100%                         | Chromium com device scale factor 1 forçado | PASS   | `desktop-e2e-20260907-153630-178` |
| 150%                         | Chromium com device scale factor 1.5 forçado | PASS | `desktop-e2e-20260907-153744-604` |
| 200%                         | Chromium com device scale factor 2 forçado | PASS   | `desktop-e2e-20260907-153901-372` |

As informações de plataforma por rodada, viewport, DPR, desvio de coordenadas e o SHA-256 dos PNG foram enviados para [registro de verificação legível por máquina](../testing/browser-zoom-windows-regression-2026-09-07.json). Os PNG / JSON originais estão em `packages/desktop/.e2e-artifacts/<run ID>/zoom-coordinates/`.

Verificação deste patch: 336 testes unitários relacionados, `pnpm typecheck` completo, `pnpm lint` (43 warnings já existentes, 0 error), verificação de tipos do E2E e case-local fixture check passaram. A verificação de tipos foi executada após isolar temporariamente as alterações preexistentes e não relacionadas do workspace; essas alterações não fazem parte deste commit.

Limitações de cobertura e checagem de merge/release: esta rodada resolve a lacuna do SG-01 no Windows, o Linux não foi executado dentro do escopo desta tarefa; o macOS só tem os resultados da linha de base histórica abaixo, o que não permite marcar o patch atual como aprovado nas três plataformas. O E2E continua em `manual-review/pending` e ainda não entrou no gate automático de CI; o registro de merge/release deve preservar as limitações de plataforma acima, e afirmar que a verificação em macOS/Linux passou exige reexecutar nessas plataformas. DPI forçado em uma única máquina não equivale a um teste real com múltiplos monitores ou travessia de telas.

## Verificação da linha de base histórica (2026-09-07)

Registro do branch original `8a669c3b9279bf3bf55d2ae7adbe5239c7644b94` em macOS arm64 / Electron 41.0.3: o replay de modelo case-local aciona o Node REPL real -> Host/Main -> Chromium, com um único guest em 5 rodadas consecutivas 0/+1/0/-2/+2, 15 trusted clicks todos acertados em Fit/50%, desvio máximo de 1 px; todos os PNG são 1280×720, com coordenadas de pixel do botão coerentes e guest zoom=1. 206 testes unitários relacionados, typecheck, lint (43 warnings já existentes), verificação de tipos do E2E e fixture check passaram. O patch do Windows desta rodada ainda não foi reexecutado no macOS.

## Forma de execução no Windows

No PowerShell na raiz do repositório, configure o replay case-local; apenas a decisão do modelo é replay, e Electron / guest / compositor / CDP / trusted input são execução real:

```powershell
$env:ZCODE_E2E_MANUAL_REVIEW = '1'
$env:E2E_PROVIDER_HTTP_MODE = 'replay'
$fixtures = Join-Path (Get-Location).Path 'packages/desktop/test/e2e/fixtures/deepseek'
$env:E2E_PROVIDER_REPLAY_FIXTURE_PATH = "$fixtures/common.json,$fixtures/conversation-session/conversation-session-browser-zoom-coordinates.json"
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-browser-zoom-coordinates.test.ts'
```

As execuções estendidas de DPI usam o mesmo Electron nativo no Windows com `--force-device-scale-factor=1/1.5/2`, o que não representa três máquinas com DPI físicos diferentes. Você pode colocar a configuração temporária a seguir em `packages/desktop/.e2e-artifacts/browser-zoom-dpi.wdio.ts` e executá-la com `pnpm --filter @zcode/desktop exec wdio run ./.e2e-artifacts/browser-zoom-dpi.wdio.ts --spec <spec acima>`:

```typescript
import { config } from "../wdio.conf.js";
const scale = Number(process.env.ZCODE_ZOOM_TEST_DPR);
if (![1, 1.25, 1.5, 2].includes(scale)) throw new Error("Expected DPI scale 1/1.25/1.5/2");
for (const capability of config.capabilities as Array<Record<string, any>>) {
  capability["wdio:electronServiceOptions"].appArgs.push(`--force-device-scale-factor=${scale}`);
}
export { config };
```

Quando já existe uma build deste branch, é possível definir `ZCODE_E2E_SKIP_BUILD=1` e `ZCODE_E2E_SKIP_AGENT_BUILD=1`; o renderer precisa ser construído com `VITE_ZCODE_E2E_STORE_BRIDGE=1`. A saída de host do `pnpm typecheck` e o bundle do tsup compartilham `out/host` e devem ser executados em série com a E2E nativa; se a E2E for executada depois do typecheck, o bundle do tsup precisa ser reconstruído, sem reutilizar o bundle de host sobrescrito pelo tsc.
