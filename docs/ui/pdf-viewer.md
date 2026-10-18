# PDF Viewer

`packages/ui/src/components/ui/pdf-viewer.tsx` é o componente genérico `PdfViewer` de pré-visualização somente-leitura de PDF, encapsulado sobre a dependência `react-pdf`. O componente é responsável apenas por renderização e interação de navegação, sem assumir capacidades de edição ou anotação; os dados do PDF são passados por quem chama.

## Renderização

- O worker do pdf.js é importado via `?url` do Vite a partir de `pdfjs-dist/build/pdf.worker.min.mjs`, com `GlobalWorkerOptions.workerSrc` definido uma vez no carregamento do módulo; a declaração de tipo do `?url` é fornecida por `packages/ui/src/assets.d.ts`
- As builds Vite de Desktop e Web devem publicar `pdfjs-dist/cmaps` em `pdfjs/cmaps/` sob a base de build corrente. O `PdfViewer` usa o mesmo conjunto de options estáveis em nível de módulo para todas as sources (documento inteiro e range), passando `cMapUrl` e `cMapPacked: true`; sem isso, PDFs CJK que usam CMaps predefinidos como `UniGB-UCS2-H` e não embutem o mapeamento de caracteres perdem texto não latino no pdf.js. As requisições de CMap leem apenas os recursos estáticos da própria aplicação e não entram no file service do workspace, no Host/relay nem na cadeia de mensagens continuous/replayable da task
- A prop `source` aceita `string` (URL / data URL), `Blob`, `ArrayBuffer`, `Uint8Array` e a variante de range para carregamento sob demanda de arquivos grandes, `{ totalBytes, initialData?, requestRange(offset, length) }`; internamente o valor é memoizado e normalizado para o argumento `file` do react-pdf, evitando que mudanças de referência recarreguem o documento. Entradas binárias são copiadas antes de serem entregues ao pdf.js, para que o transfer para o worker não deixe o buffer do chamador como detached
- A variante de range constrói internamente o `PDFDataRangeTransport` do pdf.js (`requestDataRange` → `requestRange` → `onDataRange`), e usa options constantes de módulo para ativar `disableAutoFetch` / `disableStream` e `rangeChunkSize = 256KB` (alinhado ao tamanho de segmentação padrão do `readFileRange` na camada de service), buscando sob demanda apenas o trecho de bytes necessário à página atual; quando o request por segmento falha, exibe o texto de falha de carregamento e chama `onLoadError`, e na troca de documento ou no unmount executa `abort()` no transporte
- Modo de página única: renderiza apenas a página atual por vez; quando o tamanho da página excede o contêiner, a área de conteúdo rola por conta própria, e quando a página é menor que o contêiner ela é centralizada horizontalmente
- A camada de texto permanece ligada, permitindo seleção e cópia; a camada de anotações/links fica desligada, evitando que links internos do PDF disparem navegação de janela inteira no desktop
- Estados de carregando, falha de carregamento e documento vazio renderizam textos de aviso; os textos são injetados pela prop `labels` (inglês por padrão), e o componente não depende diretamente de intl
- Após trocar `source`, reseta para a página 1 e o zoom para 100%
- O componente entra no preview pane por lazy loading em `packages/ui/src/previewPanePdfContent.tsx`, e o react-pdf não entra no bundle principal

## Área de ações inferior

- Layout: separador com `border-t`, controles centralizados: botão de página anterior, campo de número da página + `/ total`, botão de próxima página, divisor, botão de reduzir zoom, porcentagem do zoom, botão de ampliar
- Zoom: padrão `100%`, passo do botão `25%`, faixa `25%`–`400%`; ao atingir a borda, o botão correspondente fica desabilitado
- Botões de navegação: na página 1, o de página anterior fica desabilitado; na última página, o de próxima página fica desabilitado
- Campo de número da página: valor de rascunho controlado, submetido por Enter ou ao perder o foco; em caso de erro de parsing, volta à página atual, e quando fica fora da faixa é limitado (clamp) ao intervalo válido
- Enquanto o documento não termina de carregar, todos os controles da área de ações ficam desabilitados

## Interação de navegação

- Teclado: o contêiner do componente tem `tabIndex=0` e, ao receber foco, `ArrowLeft` / `ArrowRight` navegam entre páginas; quando o foco está dentro do campo de número da página, as setas não são interceptadas, preservando a semântica de cursor do campo
- A roda do mouse rola apenas o conteúdo da página atual e não participa da navegação
- Após navegar (por botão, teclado ou salto para uma página), a posição de rolagem volta ao topo da página

## Interação de zoom

- Tecla modificadora + roda para zoom contínuo: no macOS usa `command`, nas demais plataformas (Windows/Linux) usa `ctrl`, e o detección de plataforma reaproveita `isAppleKeyboardPlatform`
- O zoom varia continuamente por `exp(-deltaY * 0.002)` (compatível com o delta pequeno e de alta frequência do trackpad e com o delta grande de um entalhe de roda do mouse), compartilhando a faixa `25%`–`400%` com os botões
- Tecla modificadora + roda é reservada ao gesto de zoom, com `preventDefault`, e deixa de rolar o conteúdo da página; como o `onWheel` delegado do React é um listener passive e não consegue aplicar `preventDefault`, é registrado um listener wheel nativo não-passive no contêiner de rolagem
- Antes de o documento terminar de carregar, os listeners de zoom não são registrados, mantendo consistência com o estado desabilitado dos controles
- **Renderização em dois estágios preview→commit (evita piscada)**: o react-pdf oculta e limpa o canvas quando `scale` muda, até que a renderização assíncrona termine, e commits consecutivos fariam a tela piscar continuamente. Por isso a taxa é dividida em `displayScale` (valor-alvo visto pelo usuário, atualizado em tempo real pela roda/botão) e `renderScale` (valor efetivamente passado a `<Page>`): durante o gesto, a caixa de layout da página reserva desde já a largura e a altura finais conforme `displayScale`, e o canvas já renderizado internamente faz a pré-visualização imediata com `transform: scale(displayScale / renderScale)` e `transform-origin: top left`; após uma pausa de `200ms`, `displayScale` é confirmado de uma vez como `renderScale`. A caixa de layout alvo tem o mesmo tamanho antes e depois do commit, evitando que a página oscile quando passa do estado centralizado para o estado com rolagem horizontal por causa da troca da base de layout. A exibição da porcentagem de zoom é vinculada a `displayScale`
- **Buffer duplo na fase de commit**: a key de scale de `<Page>` desmonta o canvas antigo, e o novo canvas fica oculto até o desenho assíncrono terminar. Antes do commit, o canvas já desenhado é copiado para uma camada de sobreposição, usando diretamente a largura e a altura da caixa de layout alvo; a sobreposição só é removida quando o `onRenderSuccess` do novo canvas chega. A sobreposição do bitmap antigo e o novo canvas compartilham o mesmo canto superior esquerdo e o mesmo tamanho alvo, de modo que zoom por botão, zoom contínuo pela roda e mudanças rápidas da taxa-alvo não geram quadros em branco nem desalinhamento perceptível
- **Ancoragem de rolagem por ponteiro**: antes do zoom com tecla modificadora + roda, registra-se a coordenada normalizada do ponto do conteúdo do PDF sob o ponteiro; depois que `displayScale` é atualizado e a caixa de layout alvo é reflowada, `scrollLeft` / `scrollTop` são corrigidos pela nova posição em um `useLayoutEffect`, mantendo o mesmo ponto de conteúdo o mais possível sob o ponteiro. Os botões de zoom, que não têm coordenada de ponteiro, usam o centro da viewport. O commit do canvas real não usa mais a metade da diferença de `scrollWidth` como compensação posterior, porque a caixa de layout se mantém estável antes e depois do commit

## Arquivos relacionados

- `packages/ui/src/components/ui/pdf-viewer.tsx`: implementação do componente (inclui `PdfViewerRangeSource` e a adaptação do `PDFDataRangeTransport`)
- `packages/ui/src/components/ui/usePdfZoomOverlay.ts`: layout de zoom, ancoragem por ponteiro e sobreposição com buffer duplo de canvas na fase de commit
- `packages/ui/src/previewPanePdfContent.tsx`: camada de integração por lazy loading do preview pane
- `packages/ui/src/assets.d.ts`: declaração de tipo para importações de recursos Vite `?url`
- `packages/services/src/file/fileService.ts`: leitura segmentada por `readFileRange` e campo `size` de `stat` (origem dos dados do carregamento por range)
- `docs/ui/preview-pane.md`: convenções de dispatch da source `pdf` e da estratégia de carregamento de dados do preview pane