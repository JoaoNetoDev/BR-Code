# Prévia de PPTX

## Objetivo

A primeira entrega oferece prévia somente leitura de `.pptx` no Preview Pane do workspace. A prévia usa
`@aiden0z/pptx-renderer` para analisar OOXML dentro do Renderer e renderiza o slide selecionado como DOM. O usuário pode entrar explicitamente
no modo "Selecionar elemento" e adicionar um elemento concreto ao Composer principal atual como referência estruturada; o Agent então usa a skill oficial de PPTX para fazer
verificação por fingerprint, localização OOXML e escrita de retorno de escopo estreito sobre essa referência.

O Preview Pane não oferece edição de DOM, exportação PPTX nem escrita direta de retorno; o Desktop pode exportar o resultado da renderização somente leitura atual como um novo
PDF, mas a interface precisa ser dividida por capacidade, e a implementação posterior não pode depender da estrutura de DOM privada de `@aiden0z/pptx-renderer`. A barra superior do Preview Pane mantém o botão genérico
"Abrir no editor externo", igual ao de
XLSX e DOCX; essa ação sai da prévia embutida e não faz parte da capacidade de edição interna de PPTX.

## Limites de Produto

- Apenas `.pptx` é suportado; `.ppt`, `.pptm`, arquivos criptografados ou corrompidos não estão no escopo da primeira entrega.
- A prévia PPTX embutida permanece somente leitura, sem exibir edição de DOM, salvamento de PPTX ou entrada de colaboração. O Desktop exibe "Exportar como PDF" quando a plataforma oferece ao mesmo tempo
  `printPageToPdf` e `saveFile`; o Web e o `/remote` do celular não exibem a entrada exclusiva de Electron.
- A exportação PDF cria um novo `.pdf` local, não sobrescreve o PPTX de origem nem escreve de volta no workspace remoto. A saída expressa o efeito de impressão Chromium do DOM atual do
  `pptx-renderer`, sem promessa de conversão nativa ou sem perdas do PowerPoint/WPS.
- As referências de elemento da primeira entrega suportam apenas `shape`, `picture`, `chart`, `table` e `table-cell` pertencentes ao slide. Elementos master/layout,
  o próprio group e elementos não textuais dentro do grupo não geram referências selecionáveis; o texto dentro de um grupo pode ser referenciado como texto de shape.
- O clique comum continua responsável por interações de prévia como hyperlinks; os overlays de elemento só assumem o clique depois que o usuário habilita explicitamente o modo "Selecionar elemento".
- Depois de selecionar um elemento, primeiro é exibido o estado local de seleção, e então o usuário executa "Adicionar à tarefa atual"; nenhum prompt é enviado automaticamente.
- As referências só entram no Composer focused/primary atual, isoladas por `workspaceKey + remoteSessionId + draft/session scope`;
  source path, fingerprint, slide part, node id e coordenadas de table cell idênticos são deduplicados de forma exata.
- O chip agregador do Composer serve apenas para expandir a lista de referências; os itens concretos da lista podem abrir o PPTX correspondente e tentar localizar o
  `slideIndex` da referência. Referências de rascunho e referências somente leitura recuperadas de user rows do histórico usam a mesma semântica de navegação.
- Antes de iniciar a navegação de uma referência, é preciso sair do modo de seleção de elementos do Preview Pane e limpar o elemento selecionado localmente. A navegação apenas localiza arquivo e página,
  sem restaurar automaticamente o modo de seleção, sem destacar o elemento antigo e sem modificar a referência estruturada.
- Arquivo inexistente e página de referência inexistente usam dois toasts independentes. Enquanto o arquivo ainda puder ser aberto, mesmo que a página referenciada não exista mais, é preciso
  expandir a prévia do arquivo; um arquivo recém-aberto fica na página padrão e um arquivo já aberto mantém a página atual, sem disfarçar outras páginas após o clamp como
  sucesso de localização.
- Quando o fingerprint do arquivo mudou mas a página original ainda existe, continua-se localizando pela página original e mostra-se um toast não bloqueante avisando que o conteúdo pode estar diferente do momento da referência. Falhas de navegação de arquivo/página não afetam o rascunho do Composer nem as referências do histórico.
- A barra superior exibe o botão genérico do Preview Pane "Abrir no editor externo", usando a mesma seleção de editor, o mesmo julgamento de capacidade e a mesma cadeia `IPlatformService.openInEditor()` de XLSX e DOCX; essa entrada não muda o limite somente leitura da prévia embutida e não carrega a semântica de escrita de volta do arquivo original.
- Não há promessa de fidelidade completa ao PowerPoint. Animações, transições, fórmulas, OLE, EMF/WMF completos, 3D real e afins são degradados conforme a capacidade atual do
  `pptx-renderer`.
- A aceitação final relacionada à UI é feita manualmente no Desktop e no Web do celular.

## Recarregamento Automático de Arquivos Já Abertos

Um PPTX já aberto em uma aba do Preview Pane precisa observar o diretório onde o arquivo de origem está. Quando um evento de escanear arquivo do Host atinge o
`source.path` atual, o Preview Pane relê os bytes completos do arquivo e entrega o novo `ArrayBuffer` ao ciclo de vida da generation do viewer. O watcher, a leitura de arquivo e o estado da prévia não podem ser colocados no desktop main, no relay, no runtime do Agent nem em snapshot de conversa.

```text
open PPTX tab
  -> workspace-scoped fileWatcherService.watch(parent directory)
  -> watcher subscription ready
  -> initial stat + range read + final stat
  -> viewer generation N

target file changed / renamed / recreated
  -> debounced directory event
  -> reload generation latest-wins
  -> stat + range read + final stat
     |-- complete -> dispose viewer N -> reset local preview state -> viewer N+1
     |-- stale read -> ignore; latest generation owns the result
     |-- missing/invalid -> show existing localized read error; keep directory watcher alive
```

### Decisões de Fronteira

| Fronteira          | Decisão                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Objeto observado  | Observar o diretório pai em vez de um handle de arquivo, para ser compatível com o salvamento por arquivo temporário mais rename atômico do PowerPoint/WPS |
| Filtro de alvo   | `FileWatchEvent.changedPath` é opcional; quando aponta explicitamente para outro arquivo, o evento é ignorado, e eventos de Host antigo ou de caminho desconhecido recarregam de forma conservadora |
| Primeira leitura  | Estabelecer a assinatura do watcher antes de ler, evitando que um evento de salvamento anterior à assinatura deixe a prévia presa numa versão antiga |
| Concorrência      | Eventos do watcher apenas incrementam a generation de reload; leituras de range antigas, análises antigas e renders antigos não podem submeter estado |
| Reset de estado   | Depois de receber os novos bytes com sucesso, voltar à página 1, 100% de zoom e sair do modo de seleção de elemento, limpando o elemento selecionado e o rascunho de edição de IA não confirmado |
| Referências no Composer | Referências estruturadas já adicionadas ao Composer ou em mensagens do histórico mantêm o fingerprint original e não são apagadas nem reescritas pelo recarregamento da prévia |
| Local/remoto      | Continuar selecionando os Host watcher/file services existentes via `useWorkspaceServices(workspacePath, remoteSessionId, workspaceIdentity)` |
| delivery          | O recarregamento da prévia é uma projeção local do renderer e não entra no fluxo de mensagens do desktop continuous nem do web remote replayable |
| Exportação PDF    | Esta rodada não muda a transação de exportação; a document generation em andamento na exportação não é reutilizada por engano por callbacks assíncronos do watcher, e a falha continua seguindo o caminho de erro de exportação já existente |

### Combinações de Estado e Poda

| Case ID        | Setup                                           | Evento                                    | Resultado esperado                                                      | Estado                    |
| -------------- | ----------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------- |
| PPTX-RELOAD-01 | Aba de PPTX local já aberta                     | O mesmo arquivo é salvo                   | Relê e exibe a partir do estado padrão com uma generation de viewer totalmente nova | accepted                 |
| PPTX-RELOAD-02 | SSH/WSL/Docker ou `/remote` do celular anexado a um Host existente | O mesmo arquivo remoto é salvo | Chama apenas o watcher/file service do workspace correspondente, sem ler o mesmo caminho local | accepted |
| PPTX-RELOAD-03 | PPTX aberto                                     | Outro arquivo do mesmo diretório muda e o evento contém `changedPath` | Não relê o PPTX                                                        | accepted                 |
| PPTX-RELOAD-04 | Host antigo ou watcher da plataforma que não fornece o caminho concreto da mudança | Recebe um evento de diretório | Relê conservadoramente o PPTX atual                                      | accepted                 |
| PPTX-RELOAD-05 | Vários eventos durante salvamentos ou escritas consecutivos | Leituras concorrentes                     | Apenas a generation de reload mais recente pode submeter bytes, erro e estado de loading | accepted |
| PPTX-RELOAD-06 | Arquivo é deletado com a aba ainda aberta        | Recriado após a exclusão                  | Mostra primeiro o erro de ausência; o watcher do diretório pai é mantido e a prévia é restaurada após a recriação | accepted |
| PPTX-RELOAD-07 | Já existe uma referência PPTX no Composer       | Recarrega o arquivo de origem             | A seleção local do viewer é limpa e a referência do Composer mantém o fingerprint original | accepted |
| PPTX-RELOAD-08 | Não aberto ou aba já fechada                    | O arquivo muda                            | Não existe watcher e nenhuma leitura é disparada                       | podado: não há owner de prévia visível |

Essa capacidade não envolve combinações de estado de conversa/sessão e não acrescenta case catalog nem coverage matrix de E2E de conversa;
a cobertura automática abrange service, hook e ciclo de vida do viewer, enquanto o comportamento real de salvamento do Office e o refresh de UI são aceitos manualmente em cada plataforma.

## Exportação PDF

A exportação PDF do Desktop reutiliza o mesmo `PresentationPreviewDocument`, cria no Renderer um DOM de impressão completo e descartável uma única vez,
e só depois de o handle de renderização da página, as fontes, a decodificação das imagens e dois quadros de pintura estarem prontos o Desktop Main chama `printToPDF()` no
`webContents` atual. O diálogo de salvar só aparece depois que os bytes do PDF foram gerados com sucesso; cancelar o salvamento não gera erro, e falha de impressão ou
de salvamento usa um retorno de falha unificado. O DOM de impressão e o handle de renderização precisam ser liberados tanto no caminho de sucesso quanto nos de falha e cancelamento.

```text
viewer(document ready)
  -- export --> render pages serially in print host
               -> materialize printable font families
               -> await fonts/images/paint frames
               -> desktop main printToPDF
               -> dispose print host
               -> saveFile dialog
                  |-- canceled -> viewer(document ready)
                  |-- saved ----> success toast
                  `-- failed ---> failure toast
```

O tratamento de fontes atua apenas sobre o DOM de impressão descartável e não modifica o DOM principal da prévia:

- A fonte preferida que já está instalada, é mensurável e consegue entrar no PDF do Chromium é mantida como está, evitando que a unificação incondicional de fontes degrade o layout.
- Se a fonte especificada pelo PPTX não está disponível no sistema atual ou sabe-se que não consegue entrar no PDF do Chromium atual, escolhe-se a primeira fonte realmente imprimível da pilha original; se toda a pilha estiver indisponível, escolhe-se um fallback determinístico disponível no sistema operacional atual conforme o texto CJK/Latin e as categorias sans/serif/monospace/narrow. No macOS, `PingFang SC` pode ser usado para desenho na tela no Skia/PDF m146 atual, mas não é gravado no PDF; na exportação é preciso pulá-la e escolher uma fonte CJK imprimível como `Hiragino Sans GB` ou `Arial Unicode MS`.
- Antes da impressão é preciso remover prefixos de fontes indisponíveis e colocar a fonte realmente disponível em primeiro lugar em `font-family`. Apenas esperar
  `document.fonts.ready` não prova que a fonte do sistema existe, nem prova que o pipeline de PDF do Chromium preserva o fallback implícito do lado da tela.
- A substituição de fontes pode alterar a largura dos caracteres e as quebras de linha, então o PDF continua limitado a "uma exportação legível dentro da capacidade atual de prévia"; o fallback não pode ser descrito como fidelidade à fonte original nem como conversão nativa do Office.

## Interface

```text
┌──────────────────────────────────────────────────────────────┐
│ Preview Pane header                                          │
│                                      [Open in editor]         │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  1 [thumb]   │                                               │
│              │       [Select element] selected slide         │
│              │             ┌───────────────┐                  │
│              │             │   AI 编辑     │                  │
│              │             └──────┬────────┘                  │
│              │             ┌──────┴────────┐                  │
│              │             │ selected node │                  │
│  2 [thumb]   │                                               │
│              │                                               │
│  3 [thumb]   │                                               │
│              ├───────────────────────────────────────────────┤
│  ...         │  ‹  [page] / total  ›     −   100%   +       │
└──────────────┴───────────────────────────────────────────────┘
```

- À esquerda há uma lista vertical de miniaturas de semântica fixa; o item selecionado usa `bg-selected` e uma borda visível.
- A área principal monta apenas uma página por vez, preservando a proporção da página e centralizando-a na área disponível.
- A barra de miniaturas da prévia PPTX e a barra inferior de ferramentas usam uniformemente `bg-surface/30`; a moldura do slide, o canvas das miniaturas e o canvas principal da prévia mantêm os níveis de fundo originais, e o conteúdo renderizado do slide, o estado de seleção e a semântica de hover permanecem independentes.
- A barra de ferramentas abaixo da área principal suporta página anterior, próxima página, salto por número de página digitado, redução, exibição do fator de zoom e aumento.
- A barra de ferramentas oferece uma chave explícita de "Selecionar elemento"; uma vez ligada, os overlays de hover/selected usam bounds de elemento estáveis e não leem
  class privado de DOM do `pptx-renderer`, ordem de nós filhos nem store.
- Em elementos sobrepostos, o hit-test usa o z-order do slide e acerta a camada mais alta; table cell tem prioridade sobre o contêiner de table. Acima do elemento selecionado primeiro é exibida uma barra de contexto flutuante contendo apenas "AI 编辑"; ao clicar, entra-se apenas em um rascunho local de opinião de edição do viewer, sem distribuir imediatamente a referência ao Composer.
  A barra flutuante original é substituída por uma caixa de comentário de várias linhas com o estilo dos comentários de código já existente, mais uma barra flutuante de duas fases "Cancelar" e "Adicionar à conversa": cancelar descarta apenas esta opinião e volta ao menu "AI 编辑"; só a confirmação adiciona a referência estruturada ao Composer atual, sem enviar prompt automaticamente, e preserva o destaque do elemento.
  É permitido adicionar uma referência de elemento puro mesmo com entrada vazia; uma entrada não vazia é salva como `comment` após trim. Enquanto a caixa de comentário está expandida, a entrada de teclado pertence à caixa de texto: as setas movem apenas o cursor e não paginam, Esc equivale a "Cancelar" e descarta apenas o rascunho de comentário voltando ao menu "AI 编辑"; no estado de composição do IME chinês/japonês o Esc é um cancelamento de palavra candidata, não fecha a barra flutuante e não descarta o rascunho (lê-se ao mesmo tempo o estado local mantido pelos eventos de composição e o `isComposing` da plataforma, evitando que o timing dos eventos invalide um deles antes da hora); só com a caixa de comentário fechada o Esc sai do modo de seleção.
- Quando um `shape` ou `table-cell` destacado contém texto, dentro dos seus bounds é restaurada a seleção nativa de texto do navegador; a caixa de destaque e a barra flutuante "AI 编辑" continuam sendo mantidas. Arrastar a seleção não muda a seleção estruturada de elemento nem dispara hyperlinks ou saltos de página dentro do PPTX; clicar em outro elemento fora dos bounds continua trocando o destaque atual. Elementos sem texto como picture, chart e contêiner de table mantêm o comportamento de takeover de ponteiro pelo overlay.
- Ao executar "AI 编辑", se o navegador tiver uma seleção de texto não vazia, o `selectedText` da referência salva apenas o texto selecionado que está dentro dos bounds do elemento atualmente destacado e pode ser reconferido contra o texto completo desse elemento; seleções que atravessam outros shapes ou table cells (inclusive elementos com bounds sobrepostos) precisam filtrar o conteúdo dos outros elementos. `text` e `textFingerprint` sempre correspondem ao texto completo do elemento atualmente destacado, o inspect do Agent usa o fingerprint do texto completo para a verificação de conflito, e `selectedText` serve apenas como contexto para o modelo entender a intenção de edição do usuário. Se não houver seleção não vazia atribuível ao elemento atualmente destacado, o `selectedText` não é gerado.
- O `comment` se alinha à semântica existente dos comentários da visão de código, salvando apenas a opinião de modificação digitada pelo usuário para o elemento atual, e é uma instrução opcional de modelo da referência; ele e
  o `selectedText` não participam de `sourceFingerprint`, `textFingerprint`, da localização OOXML, da deduplicação nem da verificação de conflitos.
  O modelo precisa primeiro inspecionar o elemento completo pela referência original e só então gerar o texto de substituição completo combinando `selectedText` e `comment`.
- A barra flutuante usa o overlay do elemento selecionado como âncora de posicionamento, é renderizada através de um Portal da camada de aplicação, mantém um tamanho de UI estável, não escala junto com o zoom do
  slide e não é cortada pelo `overflow-hidden` da página. Por padrão aparece acima do elemento, vira para baixo quando não há espaço e faz desvio de borda dentro do viewport da prévia; ao ampliar, rolar e redimensionar o viewport, ela reposiciona acompanhando a âncora.
- Se o ambiente de execução atual não conseguir manter de forma confiável o posicionamento da âncora após o zoom, a operação de zoom precisa sair do modo de seleção de elemento e fechar a barra flutuante; o menu não pode ficar parado em coordenadas antigas. O caminho atual com Radix Popover/Floating UI suporta âncoras de DOM após transform, então é preferível acompanhar.
- As setas esquerda e direita trocam de página; dentro do campo de número de página o semântica de cursor de texto é preservada.
- Em telas estreitas continuam as miniaturas, a prévia principal e todas as operações essenciais; a barra de miniaturas estreita, e a barra flutuante "AI 编辑" mantém a mesma semântica e fica limitada ao
  viewport da prévia, sem virar uma action sheet inferior independente.
- O botão de abertura externa reutiliza o comportamento genérico da barra superior do Preview Pane; a disponibilidade é decidida em conjunto pela plataforma atual, pelo tipo de workspace e pelos editores externos já descobertos, e o PPTX não acrescenta regras próprias de seleção ou fallback.
- Os itens da lista de referências usam semântica real de botão, suportando mouse, Enter e Space; remover uma referência é um botão irmão independente e não pode disparar a navegação do arquivo por bubbling de evento. Desktop, Web do celular, Zai Light e Zai Dark mantêm a mesma semântica.

## Fronteira de Abstração

A capacidade de Presentation é isolada por interface:

```text
PresentationCapabilities
├─ preview: PresentationPreviewEngine       # 第一期实现
├─ edit?: PresentationEditEngine             # 后续 DOM 编辑
├─ export?: PresentationExportEngine         # 后续 DOM -> PPTX
└─ persistence?: Host document service       # 后续 workspace 写回
```

O `PresentationPreviewEngine` expõe um contrato estável no nível de página:

- `open(data)`: analisa os binários e devolve o preview document.
- `pageCount` / `pageSize`: lista de páginas e dimensões do canvas.
- `renderPage(pageIndex, container)`: renderiza uma única página no container indicado e devolve um handle liberável.
- `getPageElements(pageIndex)`: devolve o modelo de elemento estável e próprio da aplicação, incluindo slide part, node id OOXML, tipo,
  nome, resumo de texto, bounds, z-order e as coordenadas de table cell; devolve somente elementos do escopo atual de produto pertencentes ao slide.
- `dispose()`: destrói os recursos de nível de documento.

Quem chama não pode ler class, ordem de nós filhos nem estilo inline do DOM gerado por terceiros para implementar lógica de negócio. A edição posterior é modelada por um
`PresentationEditEngine` independente e IDs de elemento estáveis; a exportação é feita por um Export DOM independente.

O `container` de `renderPage` precisa ser um leaf mount separado sem nós filhos React. O renderer de terceiros e seu
`dispose`/cleanup só podem adicionar e remover DOM dentro desse nó; nós gerenciados por React como o selection overlay e a barra flutuante de ações precisam existir como irmãos do leaf mount. É proibido compartilhar container ou ref com o renderer, para que a limpeza imperativa não quebre a propriedade do DOM por React.

## Referência Estruturada e Composer

```text
Preview source bytes + source metadata
  -> sha256 source fingerprint
  -> PresentationPreviewDocument.getPageElements(page)
  -> explicit selection overlay
  -> PPTX_ELEMENT_REFERENCE_ADD event
  -> focused/primary ConversationComposer
  -> chip + hidden `# Presentation element comments:` prompt tail
```

Estrutura mínima da referência:

```text
PptxElementReference
├─ id
├─ workspacePath / workspaceIdentity / remoteSessionId
├─ sourcePath / sourceTitle / sourceFingerprint
├─ slideIndex / slidePart
├─ nodeId / nodeType / nodeName / bounds / zIndex
├─ rowIndex? / cellIndex?                  # table-cell only
├─ text? / selectedText? / comment? / textFingerprint?
└─ capturedAt
```

- `sourceFingerprint` é o `sha256:<hex>` dos bytes completos da prévia, não uma aproximação de size/mtime.
- A chave de localização autoritativa é `sourcePath + sourceFingerprint + slidePart + nodeId`; para table cell somam-se
  `rowIndex + cellIndex`.
  `nodeName`, o `text` completo, `textFingerprint` e os bounds servem apenas para reconferência, interpretação e diagnóstico de conflito, e não podem ser adivinhados em caso de ambiguidade;
  `selectedText` expressa apenas o trecho de texto em que o usuário está focado, e `comment` expressa apenas a opinião de modificação do usuário sobre aquele elemento; nenhum dos dois participa da localização ou da verificação de conflitos. O Agent precisa inspecionar primeiro o texto completo do elemento e só então gerar o texto de substituição completo para `update-text`, combinando esses dois campos de contexto; não pode tratar uma substring ou opinião de modificação como um alvo OOXML independente.
- O bloco de prompt enviado de novo reutiliza a semântica de modelo dos comentários de código, com o título `# Presentation element comments:`, e declara de forma fixa antes do JSON: cada `comment` não vazio é uma exigência de modificação do usuário, independente e específica daquela referência, precisa ser tratada uma a uma e não pode ser misturada entre referências.
  Essa declaração e o campo `comment` entram diretamente no prompt do usuário e não dependem de o modelo carregar a skill de PPTX. O bloco de tail JSON histórico
  `# Presentation elements:` continua suportando a análise inversa, mas novas referências não geram mais o título antigo.
- A lista flutuante do chip agregador do Composer segue a hierarquia dos anexos de comentários de código: depois do resumo do elemento e das informações de localização, exibe os `comment` não vazios,
  facilitando a conferência do vínculo de cada referência de elemento com sua opinião de modificação antes do envio.
- O bloco de tail do prompt é separado do protocolo de anexos e não envia o binário do PPTX; depois da análise inversa, um user row histórico exibe apenas o corpo e o chip de referência, ocultando
  o bloco estruturado interno. selection, code comment, web element e presentation element usam uma ordem fixa de tail e o parser consome na ordem inversa.
- Trocar o source limpa o estado de hover/selected dentro do viewer; referências já adicionadas ao Composer são mantidas até o usuário removê-las, o envio ter sucesso ou o scope mudar. Referências não entram em task snapshot nem no runtime replayable.

Estado e timing:

```text
viewer idle
  -- enable selection --> selecting(no selection)
  -- click overlay ----> selecting(selected reference + anchored AI Edit bar)
  -- scroll/resize/zoom> floating bar follows transformed anchor
  -- AI Edit ---------> editing local instruction draft; composer unchanged
                       |-- arrow keys -> caret only; never paginate
                       |-- Esc while IME composing -> IME cancels candidates; draft kept
                       |-- cancel/Esc -> discard draft; return to AI Edit bar
                       `-- add to conversation -> composer receives immutable reference
                                                  with optional comment;
                                                  discard local draft and keep selection
  -- unsupported zoom -> viewer idle; floating bar closes
  -- page/source change> clear local selection
  -- Esc(no draft)/disable -> viewer idle

composer(scope A, focused)
  -- add matching A --> append/dedupe chip
  -- add scope B -----> ignore
  -- open reference ---> close viewer selection; open source file; try referenced page
                       |-- file missing -> file-missing toast
                       |-- page missing -> keep file preview + page-missing toast
                       `-- fingerprint changed + page exists -> navigate + stale toast
  -- send accepted ---> serialize tail, then clear A references
  -- blocked/error ----> keep A references
  -- switch scope -----> clear renderer-local reference draft
```

A navegação de referências usa uma requisição pontual local do renderer e não entra em prompt, task snapshot nem runtime replayable:

```text
PptxReferencePreviewNavigation
├─ requestId                         # 同一引用重复点击仍重新定位
├─ pageIndex                         # zero-based，与引用 slideIndex 一致
└─ expectedSourceFingerprint
```

A tab do Code Viewer continua sendo reutilizada apenas por `workspaceKey + sourcePath`; um source `file` genérico vindo da árvore de arquivos e um source `pptx` vindo da abertura reversa por referência, desde que apontem para o mesmo caminho `.pptx`, precisam ser normalizados para a mesma resource key de PPTX, e o source type da entrada não pode ser tratado como identidade de arquivo diferente. `requestId`, número de página e
`expectedSourceFingerprint` não podem entrar na tab key estável.

Uma nova requisição de navegação para o mesmo arquivo apenas comanda o estado local de página do viewer já carregado e não deve gerar novo range-read nem analisar o PPTX inteiro. O workspace
remoto continua usando o `workspaceIdentity` e o `remoteSessionId` da própria referência para selecionar o Host file service existente;
renderer, relay e desktop main não acrescentam leitura de arquivo nem estado de navegação.

## Resolver do Agent e Escrita de Retorno

> Situação atual: o plugin document-skills embutido já está alinhado à skill de produção `pptx` do mercado e não distribui mais
> `scripts/pptx_reference.py`. O contrato de resolver registrado nesta seção (verificação de fingerprint, mutualidade entre `--replace-source`
> e `--output`, tratamento de conflito fail-closed) continua sendo a linha de base de design dessa capacidade, mas hoje não há implementação embutida que o carregue;
> a referência estruturada do Preview Pane continua injetando no Composer, e a escrita de retorno é feita pelo próprio lado do Agent.

A skill oficial `pptx` oferece uma interface estreita de inspect-before-update; o Preview Pane continua somente leitura:

```text
reference from prompt
  -> pptx_inspect_element(source, reference)
  -> read one source byte snapshot and compute whole-file sha256
  -> locate slidePart + cNvPr@id (+ table cell coordinates)
  -> validate node kind/name/text fingerprint
  -> update shape text or table-cell text in a temporary PPTX
  -> reopen/validate ZIP + OOXML + target
  -> choose output policy
     |-- default structured-reference edit -> replace source path
     |-- user explicitly requests a copy  -> requested new .pptx path
  -> replace-source rechecks source fingerprint
  -> atomic replace selected output path
```

- O escopo gravável da primeira entrega é o texto de shape e o texto de table cell; picture/chart e o contêiner de table podem ser inspecionados com precisão, mas não há mutation genérica definida. O comando de atualização não pode usar o slide inteiro ou um texto semelhante como fallback. Múltiplas referências da mesma source revision precisam ser gravadas em um único batch no mesmo PPTX temporário; sobrescrever a saída a partir do arquivo original uma a cada vez perderia as modificações anteriores.
- Quando o fingerprint do arquivo não bate, o slide/nó não existe, o tipo não confere, as coordenadas de table estão fora do limite, ou há zero ou múltiplos matches, é preciso falhar fechada
  e avisar o usuário para reabrir a prévia e selecionar de novo; é proibido continuar escrevendo.
- O fingerprint e a localização/cópia OOXML precisam consumir a mesma snapshot de bytes de origem. É proibido fazer hash e depois reabrir pelo caminho, para que uma substituição concorrente não separe a revision validada da revision realmente gravada.
- O resolver do Agent precisa completar uma pré-verificação centralizada antes de descompactar qualquer entrada ZIP: o arquivo compactado não pode exceder `64MB`, entradas que não são diretório não podem exceder `4000`, o tamanho descompactado de uma entrada não pode exceder `32MB`, o tamanho total descompactado não pode exceder `256MB`, o tamanho total de `ppt/media/` não pode exceder
  `192MB` e a razão de compressão de uma entrada não pode exceder `200:1`. Os cinco primeiros itens estão alinhados ao limite de leitura atual do Preview Pane e ao
  `RECOMMENDED_ZIP_LIMITS`; a razão de compressão é uma fronteira independente do resolver para impedir que entradas com altíssima compressão consumam recursos do Agent/Host.
- O resolver precisa rejeitar nomes de entrada duplicados, caminhos absolutos, barras invertidas, NUL, segmentos de caminho `.`/`..` e entradas criptografadas. Embora o resolver
  não extraia entradas para um diretório, nomes anormais ainda quebrariam a consistência de localização por OOXML part e de reempacotamento.
- A leitura do XML do slide e o reempacotamento do archive precisam usar blocos de tamanho fixo e reaplicar os limites de entrada e total com base nos bytes efetivamente lidos;
  é proibido usar `ZipFile.read()` para carregar mídia ou objetos incorporados inteiros na memória. Ao estourar o limite e em ZIP inválido, é preciso devolver um `pptx_update_failed` estável, com `reason` igual a `zip_limit_exceeded` ou `invalid_zip_entry`, sem gerar saída.
- A edição de referência estruturada de elemento do Preview Pane cobre por padrão o `sourcePath` da referência; só grava em uma cópia quando o usuário pedir explicitamente "salvar como", quiser preservar o original ou especificar um novo caminho `.pptx`. Esse valor padrão pertence apenas à edição de referência estruturada e não se espalha para criação comum de PPTX, conversão, exportação PDF ou um futuro editor nativo.
- Sobrescrever o arquivo de origem exige `--replace-source` explícito, e salvar uma cópia usa `--output <path>`; os dois modos são mutuamente exclusivos, e é proibido interpretar silenciosamente um parâmetro de saída ausente como sobrescrita destrutiva. Os dois modos precisam escrever primeiro um arquivo temporário no mesmo diretório e concluir a reverificação ZIP/XML/alvo.
- O `--replace-source` precisa ler o caminho de origem novamente e validar o `sourceFingerprint` inicial antes da substituição atômica final. Se um PowerPoint/WPS externo ou outro Agent salvou uma nova revision enquanto o arquivo temporário era gerado, o resolver precisa apagar o arquivo temporário,
  falhar fechada e preservar o arquivo de origem atual; é proibido sobrescrever conteúdo novo com um resultado do modelo baseado na revision antiga.
- O modo de sobrescrita não cria automaticamente backup nem registro de undo; quando o usuário quiser preservar o original, precisa pedir explicitamente uma cópia. A execução em workspace remoto fica a cargo do
  Agent/Host de workspace já existente, sem colocar IO no Renderer, no relay ou no desktop main.
- A escrita de retorno OOXML só promete a substituição de texto de escopo estreito acima, sem promessa de edição sem perdas no PowerPoint, rearranjo de layout, animações ou semântica de colaboração.

### Combinações de Estado de Escrita de Retorno e Poda

| Case ID       | Setup                                          | Evento                                      | Resultado esperado                                                           | Estado                 |
| ------------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------- |
| PPTX-WRITE-01 | Uma ou várias referências estruturadas de elemento da mesma revision | Usuário não especifica política de salvamento | Um único batch usa `--replace-source` e sobrescreve `sourcePath` atomicamente após validar o arquivo temporário | accepted             |
| PPTX-WRITE-02 | Referência estruturada de elemento             | Usuário pede explicitamente salvar como, preservar o original ou especifica novo caminho | Usa `--output` para gravar um novo `.pptx`, mantendo o arquivo de origem intacto | accepted             |
| PPTX-WRITE-03 | O arquivo de origem mudou após a captura da referência | O fingerprint não bate no início do update | Não cria saída confiável e avisa para reabrir a prévia e selecionar de novo | accepted             |
| PPTX-WRITE-04 | A validação inicial passou e o arquivo de origem foi salvo externamente durante a geração da saída temporária | O fingerprint muda de novo antes do commit do replace-source | Apaga a saída temporária, preserva a nova revision externa e retorna um conflito estável | accepted             |
| PPTX-WRITE-05 | A mesma source revision contém várias referências | O modelo executa as modificações          | Só é permitido um único batch de `update-texts`; sobrescrever um a um é proibido por perder modificações anteriores | accepted             |
| PPTX-WRITE-06 | Criação comum de PPTX, conversão, exportação PDF ou futuro editor nativo | Sem referência estruturada do Preview Pane   | Não herda o valor padrão de sobrescrita desta seção e continua obedecendo ao próprio artifact/save contract | podado: fronteira de produto independente |

## Fronteira de Dados e Processo

```text
PreviewPane
  -> workspace-scoped IFileService.stat(path)
  -> readFileRange(path, offset, length)
  -> Uint8Array
  -> PresentationPreviewEngine.open()
  -> preview DOM
```

- A execução de caminho continua usando `workspacePath/path`.
- O isolamento de workspace continua usando `workspaceIdentity?.trim() || workspacePath`, e a cadeia remota mantém o
  `remoteSessionId`.
- O `/remote` do celular usa shared-host attachment com o serviço de arquivos do Host já existente na janela do desktop; não cria um Host local/remoto independente nem um runtime de Agent próprio.
- A prévia de documento e as referências não enviadas não entram no fluxo de mensagens continuous/replayable da conversation task; o texto do prompt estruturado depois de enviado trafega pelo caminho de conversa já existente, sem novo estado de negócio no relay/main.
- O `pptx-renderer` precisa de um ArrayBuffer completo. A primeira entrega lê em segmentos de `256KB`, com limite de arquivo de `64MB`; quando o remoto antigo não tem
  `stat.size`/`readFileRange`, há apenas um fallback para o canal de compatibilidade de `8MB` do `readMediaPreview` existente. Esse desvio de versão não pode ser eliminado por um novo `stat` no Renderer: o Host antigo não devolve o size real e não tem capacidade de range.
- O erro de limite do `readMediaPreview` no remoto antigo precisa ser mapeado para um texto de limite de compatibilidade de `8MB` exclusivo de PPTX e internacionalizável; não pode reutilizar o texto de `64MB` relatando um limiar falso, nem exibir ao usuário o caminho absoluto devolvido pelo service.
- A leitura segmentada precisa satisfazer o invariante de que "a quantidade de bytes efetivamente lida é igual ao primeiro `stat.size`"; chunk vazio ou mudança de `stat.size` após a conclusão da leitura são tratados como arquivo incompleto, e é proibido entregar ao parser de ZIP um buffer aparado.

## Performance e Gerenciamento de Recursos

- Os componentes React de PPTX e o `@aiden0z/pptx-renderer` precisam ser carregados sob demanda e não entram no bundle inicial da prévia comum de código/imagem.
- A análise usa `RECOMMENDED_ZIP_LIMITS`, slide lazy e capacidades de mídia lazy.
- A prévia principal monta apenas a página atual; ao trocar de página e ao desmontar, chama-se o `dispose()` do handle de renderização.
- As miniaturas usam IntersectionObserver para montar perto da tela e liberam o handle do slide quando saem da tela.
- Ao trocar de documento ou desmontar o Pane, são liberados todos os Blob URLs de imagem, instâncias de gráfico e recursos de fonte.
- A análise do documento e a renderização de página precisam estar vinculadas à generation atual do viewer. Depois de trocar de documento ou desmontar, mesmo que o Promise de `ready` do `open()` ou do handle de renderização antigo só então complete ou falhe, ele pode apenas liberar recursos antigos e não pode mais escrever no estado de documento ou erro de carga do viewer atual.

```text
generation N             cleanup / data changed             generation N+1
open(N) ────────────────> invalidate N + dispose handles ──> open(N+1) -> render(N+1)
render(N).ready ── late reject ─────────────────────────────> generation mismatch -> ignore
open(N) ───────── late resolve ─────────────────────────────> dispose old document -> ignore
```

- O `readFileRange` ainda não tem protocolo de abort subjacente; depois de trocar de documento, o estado disposed do effect é verificado a cada retorno de range RPC, parando imediatamente as leituras segmentadas seguintes e as escritas de estado do source antigo.

## Erros e Logs

- Arquivo inexistente, limite genérico de `64MB`, limite de compatibilidade de `8MB` do remoto antigo, leitura incompleta, outras falhas de leitura e falha de análise mostram cada um um
  erro somente leitura internacionalizável.
- Outros erros de leitura de PPTX que contenham o caminho do arquivo de origem atual: o texto visível ao usuário mantém apenas o nome do arquivo; o caminho completo só pode entrar no log local,
  para que o `/remote` do celular ou o workspace remoto não exponha diretórios do servidor na interface.
- Os logs de UI passam uniformemente por `packages/ui/src/logger.ts`; é proibido chamar `console.log` ou
  `window.zcode?.log` diretamente.
- Informações de renderização por nó e de alta frequência não vão para o log de produção; a primeira entrega registra apenas uma falha de carregamento/análise.

## Reservas para Capacidades Futuras

- Edição de DOM: texto, mover, redimensionar, excluir, hierarquia e undo/redo, com o estado de comandos gerenciado pelo `PresentationEditEngine`.
- A barra flutuante de contexto atual implementa apenas "AI 编辑", sem exibir controles de formato desabilitados ou de placeholder. Somente quando a mutation capability correspondente do
  `PresentationEditEngine` existir é possível adicionar ações de edição em linha realmente funcionais à mesma barra de ações; `canSelect`, `canReference` e `canMutate` precisam continuar separados.
- Exportação: o `PresentationExportEngine` consome um Export DOM normalizado e gera uma nova cópia PPTX.
- Salvamento nativo do Preview Pane: se for adicionado futuramente, precisa criar um Host document service com escopo de workspace, responsável por edit lease,
  source fingerprint, verificação de conflitos, arquivo temporário e substituição atômica; não estender `IFileService` para assumir a transação de edição.

## Verificação

Verificações automatizadas:

- Reconhecimento de caminho `.pptx`, upgrade de source e limite de tamanho.
- O botão genérico de abertura externa de `.pptx` mantém a mesma semântica de exibição, desabilitação e chamada de XLSX e DOCX.
- Lógica pura de troca de página, clamp de número de página e clamp de zoom.
- Na troca consecutiva de documentos, o resultado da análise antiga é liberado e erros de renderização tardios da página antiga não poluem o estado do novo documento.
- O watcher precisa entrar em estado ready antes da primeira leitura do PPTX; ao fechar a aba ou trocar o source, a assinatura é liberada e `unwatch` é chamado.
- Evento do arquivo alvo dispara nova leitura; eventos de caminho explicitamente diferentes do mesmo diretório são filtrados; eventos de caminho desconhecido são compatíveis com o Host antigo e recarregam de forma conservadora.
- Eventos consecutivos do watcher adotam generation latest-wins; o sucesso, a falha e o fechamento de loading da leitura antiga não podem sobrescrever a nova leitura.
- Após o recarregamento automático bem-sucedido, são redefinidos número de página, zoom, modo de seleção de elemento, elemento selecionado e rascunho de edição de IA não confirmado; as referências do Composer não mudam.
- Filtro do modelo de elemento, bounds de table cell, hit-test de z-order e limpeza de source generation.
- Validação do payload de referência, isolamento de workspace/remote/scope, deduplicação exata, serialização e análise inversa do prompt.
- Navegação por botão/teclado de itens de rascunho e de histórico, isolamento de evento do botão de remoção, reutilização de tab do mesmo arquivo e reposicionamento em requisições repetidas.
- Sair do modo de seleção de elemento antes da navegação; posicionamento de página válida; semântica de feedback independente para arquivo inexistente, página inexistente e mudança de fingerprint.
- A navegação de página no mesmo arquivo não relê o PPTX; a navegação entre arquivos continua reutilizando a limpeza de generation existente e a proteção contra resultados tardios.
- A seleção parcial de texto mantém o `textFingerprint` completo do elemento, e o `selectedText` pode entrar sem perdas no contexto do Composer; referências de shape/table-cell com seleção parcial ainda conseguem completar o inspect e a atualização do texto completo.
- Fingerprint mismatch, ambiguidade/ausência de nó, atualização de texto de shape e de table-cell e validação de arquivo temporário do resolver.
- Mutualidade entre `--replace-source` e `--output`; sucesso da sobrescrita no caminho original; preservação da nova revision externa quando o fingerprint da origem muda antes do commit; e manutenção do arquivo de origem inalterado quando há um "salvar como" explícito.
- Textos em chinês e inglês e tokens de fonte da UI.
- `pnpm typecheck`, `pnpm lint`.

Aceitação manual de UI:

- Desktop local, workspace remoto SSH/WSL/Docker.
- `/remote` do celular.
- Zai Light / Zai Dark.
- Arquivos comuns, com gráficos, SmartArt, fonte incorporada, arquivos grandes e arquivos corrompidos.
- Seleção de miniatura, página anterior/seguinte, salto de página e zoom por botão e atalho.
- O modo de seleção não polui o clique comum de hyperlink; elementos sobrepostos, table cell, troca de página/arquivo, adição/remoção de chip do Composer.
- Clicar em um item concreto de referência a partir do rascunho e de um user row do histórico; cliques repetidos no mesmo arquivo; o modo de seleção é fechado antes do posicionamento; toasts de arquivo ausente, página ausente e mudança de fingerprint; o Preview Pane ainda expande quando só é possível localizar o arquivo.
- Isolamento de referências entre o Composer principal do Desktop e um Composer de tela dividida não focused, e no cenário shared-host do `/remote` do celular.
- Consistência de visibilidade, estado desabilitado, texto de dica e resultado real de abertura do botão de abertura externa da barra superior de PPTX, XLSX e DOCX.
- Salvamento no lugar do PowerPoint/WPS e salvamento com rename de arquivo temporário disparam reload; salvamentos consecutivos exibem por fim a última versão.
- Arquivo aberto é excluído e recriado, e a prévia é restaurada; depois de fechar a aba, nenhum watcher de Host nem leitura de arquivo é disparado.