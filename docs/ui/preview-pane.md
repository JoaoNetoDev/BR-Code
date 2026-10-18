# Preview Pane

## Objetivo

O Preview Pane do lado direito serve para pré-visualizar chamadas de ferramenta, links de arquivo e arquivos do workspace em uma tab do side pane. Ele é responsável apenas pela exibição, sem analisar diretamente a semântica de negócio; os dados de pré-visualização são construídos como `CodeViewerSource` por `packages/ui/src/lib/codeViewer.ts` e pelo chamador e depois passados para ele.

## Tipos de Pré-visualização Suportados

- `file`: lê o conteúdo real do arquivo pelo caminho; arquivos de texto de até `256KB` são lidos de uma só vez em sua totalidade e, acima do limite, exibe um aviso localizado de arquivo grande; arquivos binários são despachados por tipo de arquivo para o adaptador de pré-visualização específico (atualmente imagem, mídia, PDF, PPTX), e tipos não adaptados ainda exibem o aviso de não pré-visualizável
- `text`: renderiza diretamente o conteúdo de texto em memória, com realce de código conforme `language`
- `patch`: renderiza unified diff / patch, preservando a semântica de linhas adicionadas e removidas
- `image`: lê a pré-visualização de mídia e exibe a imagem; atualmente reconhece `apng`, `avif`, `bmp`, `gif`, `ico`, `jpeg`, `jpg`, `png`, `svg`, `webp`
- `media`: usa os controles nativos `video` / `audio` para pré-visualizar MP4, MOV, WebM, M4V, MP3, WAV, M4A, OGG, Opus, FLAC e WEBA; arquivos locais do Desktop passam por URL autorizada `zcode-media://`, arquivos do Desktop via SSH/WSL/Docker passam pelo HTTP Range Proxy de loopback do Host, e no `/remote` do celular só se usa leitura inline de arquivos pequenos com escopo de workspace
- `pdf`: renderiza a pré-visualização somente leitura de PDF; atualmente reconhece `pdf` e oferece apenas capacidade de pré-visualização, sem edição. Todas as entradas criam uniformemente uma source `file`, que o `resolvePreviewPanePdfSource` do PreviewPane promove preguiçosamente para `pdf` (o mesmo padrão de promoção do image), garantindo que todas as tab keys passem pela deduplicação em `file:{path}`. O carregamento de dados passa pela leitura segmentada do `fileService` (`stat` para obter o size; abaixo de `2MB`, laço de `readFileRange` para trazer tudo; acima disso, o pdf.js carrega por-demand em segmentos via range), sem limite de tamanho do arquivo inteiro; o remoto antigo (`stat` sem retorno de `size`) faz fallback para o canal antigo `readMediaPreview` com base64 do arquivo inteiro, mantendo seu limite de 8MB
- `office`: pré-visualiza `.xlsx`, `.xlsm`, `.xls`, `.docx` e `.doc` em modo somente leitura; o Excel tem `.xlsx` como caminho de suporte completo, `.xlsm` / `.xls` exibem apenas os dados que a biblioteca de renderização consegue interpretar, e `.docx` / `.doc` vão todos para o renderizador do Word
- `pptx`: renderiza a pré-visualização somente leitura de PPTX; atualmente reconhece `.pptx` e a exibe com uma lista vertical de miniaturas à esquerda e a pré-visualização de uma única página à direita, com uma barra inferior que oferece paginação, salto de página e zoom. Todas as entradas continuam criando uma source `file`, promovida preguiçosamente para `pptx` pelo PreviewPane, garantindo que as tab keys continuem passando pela deduplicação em `file:{path}`. A primeira fase implementa apenas o `PresentationPreviewEngine`; edição, exportação e escrita de volta mantêm apenas interfaces em camadas. O novo Host usa limite de `64MB`; no remoto antigo, quando faltam `stat.size/readFileRange`, mantém-se o limite de compatibilidade de 8MB em base64, exibindo um aviso localizado próprio em vez de reportar `64MB` por engano ou expor o caminho remoto. Veja os detalhes em `docs/ui/pptx-preview.md`

## Regras de Renderização de Arquivo e Texto

- Arquivos `.md` / `.markdown` e sources de texto markdown entram por padrão no modo de pré-visualização e podem ser alternados para o código-fonte pelo menu de mais opções
- Arquivos `.svg` e sources de texto com path `.svg` entram por padrão na pré-visualização de SVG e podem ser alternados para o código; depois de alternar para o modo de código, o interruptor de quebra de linha automática continua disponível
- A pré-visualização de imagens usa um fundo de mosaico de 4px e a área de conteúdo mantém `p-10`; bitmaps são exibidos por padrão no tamanho natural e, quando o nome do arquivo traz multiplicadores como `@2x`, `@3x`, `@1.5x`, o tamanho de exibição CSS é calculado conforme o multiplicador, continuando sujeito às dimensões máximas do contêiner; o SVG, por ser vetorial, se adapta com `contain` ao contêiner e não participa do cálculo de multiplicador de bitmap
- Arquivos Office são lidos em conteúdo binário completo pelo `fileService` com escopo de workspace, e o limite de transporte entre RPCs é de 25 MB; renderizadores e ativos WASM são carregados preguiçosamente por tipo de arquivo, evitando aumentar a carga de primeira tela da pré-visualização de texto comum e de imagens
- A pré-visualização de Excel usa o tema atual Zai Light / Dark; a página do DOCX mantém a semântica de papel branco, e tanto o desktop quanto o Web no celular podem rolar dentro do contêiner de pré-visualização para acessar o conteúdo completo
- Arquivos de código comuns usam realce de sintaxe baseado em tokens do Shiki, e o menu de mais opções oferece o interruptor de quebra de linha automática
- A renderização do código-fonte é estruturada linha a linha: cada linha contém uma área de número de linha `line` não selecionável e uma área de conteúdo `code` selecionável
- Na rolagem horizontal, a área de número de linha `line` permanece fixa com sticky; com a quebra de linha automática ativada, apenas a área de conteúdo `code` sofre quebra
- Arquivos comuns de texto/código têm `256KB` como limite de pré-visualização: dentro do limite são lidos de uma vez e renderizados como um único documento completo, garantindo decodificação UTF-8, numeração de linhas e contexto de rolagem contínuos; acima do limite nenhum conteúdo parcial é renderizado, e exibe-se um aviso localizado que orienta o usuário a abrir o arquivo em outro editor
- O limite de `256KB` restringe apenas a pré-visualização de texto/código comuns; arquivos PDF, PPTX e Office continuam usando suas próprias leituras binárias, limites de tamanho e cadeias de renderização
- Arquivos `.pdf` entram na pré-visualização somente leitura de PDF, renderizados por página e com navegação por rolagem; não há troca para visualização de código-fonte e a versão atual não oferece edição nem anotações
- O cabeçalho de título genérico das pré-visualizações de documentos Word, Excel, PPTX e PDF deve exibir abaixo dele uma linha divisória horizontal `border-border`; pré-visualizações comuns de código, imagem, Markdown e demais mantêm o cabeçalho sem divisória como até agora.
- Arquivos `.pptx` entram na pré-visualização somente leitura de PPTX, e a área principal monta apenas a página selecionada; não oferecem visualização de código-fonte, edição integrada, exportação ou gravação,
  mas o cabeçalho superior mantém o botão genérico "打开外部编辑器" igual ao de XLSX e DOCX, e essa operação não faz parte da edição interna nem da escrita de volta do Preview Pane

## Tratamento de Caminhos

- O Preview Pane normaliza o `CodeViewerSource` na entrada, restaurando o escape de URI dos caminhos locais; por exemplo, `Auto%20Snake` é exibido e lido como `Auto Snake`
- O side pane também executa a mesma normalização antes de gerar a tab key, evitando que o mesmo arquivo seja aberto em duas tabs por causa das formas `%20` e espaço
- O caminho só é usado em contextos de semântica de caminho, como leitura e escrita de arquivo e abertura do editor; o isolamento de workspace continua obedecendo a `workspaceIdentity?.trim() || workspacePath`

## Comportamento do Breadcrumb

- O breadcrumb superior prioriza a exibição por workspace atual, no formato `workspace -> diretório -> arquivo`
- Caminhos longos usam rolagem horizontal, sem comprimir a área de nome do arquivo
- Na primeira abertura ou após trocar de source, o breadcrumb rola por padrão até o extremo direito, priorizando a exibição do diretório final e do nome do arquivo
- A máscara de borda só é exibida quando há conteúdo rolável; quando está à esquerda, ao centro ou à direita, exibe-se respectivamente o fade à direita, dos dois lados ou à esquerda

## Arquivos Relacionados

- `packages/ui/src/PreviewPane.tsx`: shell do pane, breadcrumb, troca de view e ciclo de vida de leitura de arquivo
- `packages/ui/src/components/ui/code-viewer.tsx`: componente genérico `CodeViewer` de visualização de código com Shiki, responsável pela renderização linha a linha, pelo número de linha sticky e pela estratégia de quebra de linha; o side pane e os blocos de código markdown posteriores reutilizam a mesma entrada
- `packages/ui/src/components/ui/pdf-viewer.tsx`: componente genérico `PdfViewer` de pré-visualização somente leitura de PDF, responsável pela renderização por página e navegação por rolagem; usado pelo despacho da source `pdf` do preview pane, sem capacidade de edição; veja os detalhes em `docs/ui/pdf-viewer.md`
- `packages/ui/src/previewPanePdfContent.tsx`: wrapper fino do corpo do pdf, com carregamento preguiçoso do `PdfViewer` (react-pdf tem volume grande e só entra no bundle na primeira abertura da pré-visualização de PDF)
- `packages/ui/src/previewPanePptxContent.tsx`: wrapper fino do corpo do pptx, com carregamento preguiçoso do componente de pré-visualização de PPTX e do `@aiden0z/pptx-renderer`
- `packages/ui/src/lib/shikiHighlighter.ts`: cache genérico de realce Shiki e entrada assíncrona de tokenização, evitando que `components/ui` dependa dos detalhes de implementação de `ai-elements`
- `packages/ui/src/previewPaneContent.tsx`: despacho da renderização do corpo conforme o tipo de `CodeViewerSource`
- `packages/ui/src/previewPaneOfficeContent.tsx`: decodificação binária Office, carregamento preguiçoso e fronteira unificada de erro
- `packages/ui/src/previewPaneOfficeXlsxContent.tsx`: renderização somente leitura do Excel e adaptação de tema
- `packages/ui/src/previewPaneOfficeDocxContent.tsx`: parsing de DOCX, tema de papel branco e contêiner responsivo
- `packages/ui/src/lib/officeFilePreview.ts`: reconhecimento de extensão Office e decodificação base64
- `packages/ui/src/lib/codeViewer.ts`: tipos de source de pré-visualização, extração de pré-visualização de chamadas de ferramenta, reconhecimento de linguagem e de tipo de imagem
- `packages/ui/src/lib/codeViewerSource.ts`: normalização de caminho da source do Code Viewer
- `packages/ui/src/lib/workspaceSidePane.ts`: geração e reuso de tab key do Code Viewer
- `docs/ui/office-file-preview.md`: fronteiras, combinações de estado e contrato de verificação da pré-visualização de arquivos Office