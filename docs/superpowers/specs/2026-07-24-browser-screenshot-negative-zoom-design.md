# Design da Correção da raster surface de screenshots do Browser Use sob Zoom Negativo e Fit no Windows

Data: 2026-07-24
Status: corrigido e implementado com base em evidências de runtime do Electron no Windows

## 1. Problema e evidência de runtime corrigida

Quando o zoom global do Desktop no Windows é `-2` (factor `0.826446...`), a primeira correção trocou o
timeout fixo de `1500ms` de surface preparation da screenshot do Browser Use por um retorno bem
sucedido, mas o PNG `1280 × 720` retornado apresentava tiling interno preciso:

- o período de repetição horizontal era de `800px`;
- o período de repetição vertical era de `450px`;
- após um deslocamento vertical de `450px` o erro de amostragem de pixel era `0`;
- há apenas uma imagem no resultado da ferramenta, portanto não é inserção duplicada da UI de conversation.

O rastro de mensagens
`C:\Users\dev\.zcode\cli\debug\model-io-sess_5c7bc8b8-f95f-43eb-b075-cf9f59d5278a.jsonl`
mostra que o modelo chamou explicitamente `tab.screenshot()` apenas uma vez. O log do Desktop main
registra ao mesmo tempo:

1. a screenshot explícita das `21:18:14`;
2. uma screenshot de fechamento de turno, disparada pelo Browser runtime às `21:18:24`, antes do `turnEnded`.

A screenshot de fechamento de turno é um comportamento best-effort já existente e não é a causa do
tiling interno de uma única PNG.

## 2. Causa raiz

O tamanho lógico do viewport responsivo é `1280 × 720`, mas a pré-visualização Fit, dentro da barra
lateral atual, só aloca uma compositor surface real de `800 × 450`. A combinação do display scale do
Windows, do zoom negativo do Desktop e da guest surface do Electron não oferece, como acontece com o
Retina do macOS, um backing raster suficiente para cobrir o CSS viewport alvo.

A primeira correção apenas converteu o raw layout após a compensação do zoom negativo:

```text
1549 × 871 / layoutScale 1.21 ≈ 1280 × 720
```

de volta para o viewport lógico e enviou o ready com base nisso. Esse valor só prova que o
sistema de coordenadas CSS/layout do guest está correto; não prova que o raster nativo do compositor
já cobre a mesma dimensão. Depois de receber um ready incorreto, o main chama
`Page.captureScreenshot` e o Chromium passa a preencher a saída `1280 × 720` periodicamente com a
surface de `800 × 450`.

```text
CSS viewport 1280 × 720
  -> responsive Fit visualScale = 0.625
  -> Windows guest compositor surface = 800 × 450
  -> renderer 仅按 logical layout 误报 ready
  -> Page.captureScreenshot target = 1280 × 720
  -> 800 × 450 surface 被周期平铺
```

Isso mostra que o protocolo de preparação de screenshot está faltando uma segunda dimensão: além do
logical viewport, ele precisa carregar o scale atual de compositor/pré-visualização e usar isso para
escolher uma fonte de screenshot realmente disponível.

Sondas reais posteriores em Electron provaram ainda mais:

- `Emulation.setDeviceMetricsOverride(scale: 1 / surfaceScale)` continua gerando tiling;
- `dontSetVisibleSize: false` é rejeitado pelo guest widget e ainda gera tiling;
- `captureBeyondViewport: true` não corrige o quadro inteiro e captura contínua de tiles pode travar;
- alterações temporárias em `deviceScaleFactor`, page scale e guest zoom não suprem o raster;
- executar `guest.capturePage()` diretamente no processo main fornece a surface já composta e sem tiling; depois de normalizá-la em alta qualidade para o viewport lógico, os quatro sentinels de canto ficam corretos e não há período de `800 × 450`.

Portanto a causa raiz não pode ser corrigida pelo metrics scale do CDP. A solução final mantém o
contrato de `surfaceScale`, mas lê a guest surface do main no screenshot de viewport comum quando
`surfaceScale < 1`.

## 3. Objetivos e não objetivos

### 3.1 Objetivos

1. Com zoom do Desktop no Windows `< 1` e Fit responsivo `< 100%`, a screenshot continua emitindo um PNG do mesmo tamanho do CSS viewport, com conteúdo correto nos quatro cantos e sem tiling periódico.
2. Manter inalterados a pré-visualização Fit/proporção fixa atual do usuário, as tabs da barra lateral, o foco, o mapeamento do mouse e os estados de acessibilidade.
3. macOS Retina, alto DPI do Windows, Linux, zoom do Desktop `>= 1` e viewport não responsivo continuam reutilizando o mesmo caminho multiplataforma, sem escrever casos especiais de plataforma.
4. Se qualquer passo de prepare, capture ou restauração falhar, não retornar nem persistir uma imagem que se sabe poder estar com tiling.
5. A screenshot explícita e a de fechamento de turno compartilham a mesma correção; a contagem extra de screenshots de fechamento de turno não está no escopo desta mudança.

### 3.2 Não objetivos

- Não detectar, recortar nem deduplicar tiles já corrompidos; a normalização de tamanho atua apenas sobre a surface composta correta devolvida por `capturePage()`.
- Não trocar temporariamente a pré-visualização responsiva para `100%`, evitando salto visível, corte e mudança de foco.
- Não criar um segundo Browser runtime, um segundo guest nem uma cadeia de screenshot dedicada ao mobile.
- Não modificar o conversation stream, o snapshot, a queue, owner/lease nem a semântica `desktop-continuous` / `web-remote-replayable`.

## 4. Escolha da solução

Adotado "ready reportando o preview surface scale + captura da guest surface no main + normalização
para o tamanho CSS".

### 4.1 Contrato de ready do renderer

Além da identidade completa e do logical viewport já existentes, o ready da screenshot surface
reporta também o scale atual de pré-visualização responsiva:

```ts
interface BrowserViewScreenshotSurfaceReadyPayload {
  // 既有 identity 与 viewport 字段
  surfaceScale: number;
}
```

A semântica de `surfaceScale` é a razão de pré-visualização da surface de compositor do guest atual
em relação ao logical viewport:

- Fit responsivo/proporção fixa usa o visual scale que o renderer já aplicou de fato;
- o modo comum é `1`;
- precisa ser finito e maior que `0`;
- o renderer só envia o ready depois que dois animation frames consecutivos confirmam simultaneamente a estabilidade do guest id, do logical viewport e do surface scale.

Não se pode mais interpretar "offset normalizado igual ao logical viewport" como raster pronto; esse
valor cuida apenas da validação do logical viewport.

### 4.2 Captura da guest surface no main

O `BrowserGuestManager`, enquanto detém o lease da surface:

1. valida a identidade do guest e o logical viewport do lease;
2. em screenshot de viewport comum com `surfaceScale < 1`, chama `guest.capturePage()` diretamente no processo main para ler a surface visível já corretamente composta pelo Electron;
3. usa a capacidade de resize de alta qualidade do `nativeImage` do host já existente para normalizar o PNG da surface para o tamanho do logical viewport;
4. com `surfaceScale >= 1`, clip e fullPage continuam pelo caminho de screenshot CDP existente;
5. tanto no sucesso, na exceção, no cancelamento ou no settle tardio, o lease da surface é liberado após a operação de baixo nível terminar.

Essa chamada ocorre no `webContents` do guest do main, e não no `<webview>.capturePage()` do renderer;
este último já provocou V8 FATAL historicamente e continua proibido. O caminho final não altera
metrics, DPR, media query, geometria de DOM, estado das tabs nem o foco do usuário, e não tem branch
de plataforma Windows.

### 4.3 Erros e recuperação

- `surfaceScale` inválido ou instável: prepare não fica ready e o fluxo segue até o timeout estruturado já existente.
- Falha na captura da guest no main ou na normalização para o tamanho CSS: a requisição explícita retorna `execution_error` estruturado e não faz fallback para a imagem CDP de viewport que se sabe gerar tiling.
- Guest mudou antes da captura: a requisição é encerrada e o lease antigo não é usado com o novo guest.
- A screenshot automática de fechamento de turno continua sendo best-effort e pulando imagens com falha, sem afetar o encerramento normal da task.

Detalhes de alta frequência de prepare/ready/capture/release vão apenas para `debug`; é proibido
registrar o base64 da imagem ou o texto da página.

## 5. Sequência

```text
Browser screenshot request
  -> main read logical viewport
  -> renderer compose target guest
       -> stable guest id
       -> stable logical viewport 1280 × 720
       -> stable surfaceScale 0.625
       -> ready
  -> main acquire surface lease
  -> verify guest identity
  -> main guest.capturePage() 读取正确的 800 × 450 已合成 surface
  -> nativeImage 高质量归一化到 1280 × 720 CSS 尺寸
  -> release surface lease
  -> return PNG
```

Essa cadeia não altera a geometria do frame responsivo vista pelo guest ou pelo usuário.

## 6. Soluções não adotadas

### Trocar temporariamente o DOM frame responsivo para 100%

Isso ampliaria a surface, mas o mesmo guest também é a pré-visualização visível atual; a troca
causaria cintilação, corte ou mudança de scroll extent da barra lateral e criaria dois conjuntos de
comportamento para tabs ativas/inativas.

### `fromSurface=false` ou apenas mexer em `captureBeyondViewport`

A validação de isolamento do Electron já existente provou que um guest em segundo plano ou encoberto
pode devolver imagem preta ou tamanho errado, e isso não corrige o tiling de surfaces antigas.

### Reconhecer e recortar/deduplicar imagens corrompidas

Não é possível provar que o primeiro tile cobre o viewport inteiro, e isso quebraria a correspondência
entre as coordenadas da screenshot e as coordenadas dos cliques seguintes.

### CDP metrics scale apenas na captura

As sondas de Electron no Windows já provaram que os caminhos de `scale`, DPR, page scale, guest zoom e
visible size não conseguem fazer uma surface pequena cobrir o logical viewport, e que a requisição de
visible size ainda é rejeitada pelo guest widget. Não se pode continuar dependendo de combinações de
parâmetros CDP que só valem em mock.

## 7. Testes e aceitação

Implementação estritamente por TDD:

1. Shared/UI: o payload de ready é validado e reporta um `surfaceScale` estável; o raw layout de zoom negativo continua sendo usado apenas para o logical viewport e não representa mais raster ready.
2. Coordinator: validação completa de identity, viewport e surfaceScale; ready inválido, tardio ou alterado não pode estabelecer lease.
3. Manager: screenshot de viewport comum com `surfaceScale < 1` precisa chamar `guest.capturePage()` no main e normalizar para o logical viewport; sucesso, exceção, cancelamento e mudança de guest liberam o lease depois do settle da operação de baixo nível.
4. Executor: apenas o screenshot de viewport comum usa a guest surface injetada; clip, fullPage e o re-capture de qualidade mantêm o contrato CDP/CSS em pixels já existente.
5. Smoke do compositor Electron:
   - logical viewport `1280 × 720`;
   - surface histórica/visível `800 × 450`;
   - scale factor do Windows `1.25` e zoom do Desktop `-2`;
   - antes da correção o teste precisa identificar o tiling periódico de `800 × 450`;
   - depois da correção o PNG é `1280 × 720`, com os quatro sentinels de canto diferentes e taxa de correspondência de período horizontal/vertical abaixo do limiar.
6. Regressão de produto: reiniciar o dev desktop, com zoom `-2`, deixar um modelo real abrir `example.com` e tirar uma screenshot explícita; é obrigatório olhar de fato a imagem e não passar só com `ok=true` e o tamanho IHDR.
7. Executar `pnpm typecheck` e `pnpm lint`.

## 8. Fronteiras multiplataforma e de arquitetura

- A mudança acontece apenas na coordenação transitória de screenshots do renderer owner do Desktop e do main.
- Web/mobile não criam um embedded browser runtime próprio e continuam lendo o fato de imagem persistido com sucesso pelo desktop via shared-host attachment.
- `workspaceKey = workspaceIdentity?.trim() || workspacePath`, `remoteSessionId` e a identidade completa de browser/session/tab continuam atravessando prepare/ready/release.
- Não se cria novo estado de negócio no relay e o estado da screenshot surface não é escrito no snapshot replayable.
- Se a máquina atual não cobrir macOS/Linux, a descrição do commit precisa deixar explícito o risco de que o Windows foi verificado e os demais aguardam regressão na CI.