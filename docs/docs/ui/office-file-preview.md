# Pré-visualização de arquivos Office

## Resumo da Funcionalidade

| Campo         | Conteúdo                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Mudança       | Preview Pane ganha pré-visualização somente leitura de Excel e Word (`.docx` / `.doc`)                      |
| Entrada do usuário | Árvore de arquivos do workspace, links de arquivo e outras entradas de pré-visualização que geram `CodeViewerSource` |
| Biblioteca de renderização | `@extend-ai/react-xlsx@^0.16.0`, `docx-preview`; o caminho de compatibilidade para `.doc` binário antigo mantém `@extend-ai/react-docx` |
| Dono do estado | Os bytes do arquivo são lidos pelo `fileService` de escopo do workspace; o estado de parsing e pré-visualização é mantido pelo Preview Pane atual |
| Fora de escopo | Edição, salvamento, exportação, descriptografia por senha de arquivos Office e sincronização do estado de pré-visualização entre dispositivos |

## Limite de Segurança do Conteúdo de Documentos

Arquivos Office são conteúdo não confiável. Qualquer renderer de DOCX/XLSX/PPTX/DOC antigo/PDF não deve entregar URLs contidas no documento tal e qual à navegação de DOM ou ao caminho de execução de scripts do renderer principal.

- Links externos só permitem `http:` e `https:`; dentro do documento só são permitidos `#anchor` validados.
- `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, ofuscação por caracteres de controle e variantes com codificação de protocolo devem ser rejeitados.
- O renderer ainda precisa fazer uma varredura defensiva de `a[href]` / `a[xlink:href]` após gerar o DOM, observando nós e atributos adicionados de forma assíncrona; o `href` de recursos não interativos, como imagens, não pode ser removido indevidamente.
- O observador de DOM, na primeira instalação, varre o nó raiz completo da pré-visualização; mutations posteriores varrem apenas o alvo do atributo alterado ou a subárvore de `addedNodes`, sem repetir a varredura de toda a árvore do documento por causa de montagem em lotes pelo renderer de terceiros ou remontagem por virtualização.
- A pré-visualização de PDF hoje força `renderAnnotationLayer={false}`, portanto anotações de link não entram no DOM do renderer principal; se a annotation layer for habilitada no futuro, é obrigatório conectar o mesmo saneamento de links e o callback controlado de link externo no ponto de montagem do PDF, sem depender apenas do comportamento de navegação padrão do pdf.js.
- Os renderers Office de terceiros atuais não têm uma interface unificada de interceptação de relationships, portanto o portão de DOM é o fechamento obrigatório; se o parser expuser um Target hook no futuro, deve-se reutilizar a mesma rejeição antecipada por allowlist.
- Se no futuro o renderer precisar manter a interação de links internos do documento, isso deve ficar em um sandbox iframe sem preload, sem Node e sem navegação/popups; o renderer principal não pode hospedar diretamente scripts de documentos de terceiros.
- A abertura de link externo precisa passar por um callback controlado; não é possível passar `href` não confiável diretamente para `window.zcode` ou `shell.openExternal`.

A regressão de segurança precisa cobrir a allowlist de protocolos, bypass por codificação/caracteres de controle, o relationship real de hyperlink do DOCX e a aceitação manual após clique no renderer principal do Desktop.
Também é preciso fixar o estado de desligamento da annotation layer do PDF e verificar que links adicionados de forma assíncrona saneiam apenas a subárvore alterada, sem varrer novamente a raiz completa da pré-visualização.

## Resumo de Impacto

### Matriz de Superfície de UI

| Cenário do usuário                    | Entrada de UI                                                       | Implementação compartilhada                                            | owner de exibição / rascunho                                          | Validação / gating                                                | Ação de commit                                                                   | Fonte autoritativa                                          | Limite de modo                                                                 | Isolamento obrigatório                                            |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Abrir arquivo Word / Excel do workspace | Árvore de arquivos do workspace, links de arquivo e outras entradas `CodeViewerSource` | `PreviewPane` → `PreviewPaneContent` → `PreviewPaneOfficeContent` | Leitura, parsing, zoom e state de erro do Preview Pane atual; sem rascunho persistente | Roteamento por extensão, limite de leitura binária de 25 MB, fronteira de erro do parser | Chamada somente leitura a `fileService.readBinaryPreview` de escopo do workspace; sem commit de escrita | Os bytes do arquivo correspondente a `source.path` no workspace atual | Injeção de service compartilhada por Desktop / Web / workspace remoto; o state de pré-visualização não entra no fluxo de mensagens | task/session, desktop continuous, web remote replayable, outras abas de pré-visualização |

### Comportamento Compartilhado e Divergente

| Preocupação    | Compartilhado                                                             | Intencionalmente diferente                                                                          | Significado para esta substituição                                   |
| -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Leitura de arquivo | Todos os tipos Office usam a mesma leitura binária restrita e retorno por RPC em base64 | Nenhum                                                                            | Não altera o file service, a workspace identity nem o limite de 25 MB |
| Roteamento e erro | `PreviewPaneOfficeContent` centraliza lazy loading, estado de loading em branco e estado de erro localizado | `.xlsx`, `.docx` e `.doc` entram em chunks de renderer separados                                     | `.docx` pode trocar a implementação sem afetar Excel nem o `.doc` antigo |
| Renderização   | Todos são conteúdo somente leitura do Preview Pane                        | `.docx` usa `docx-preview`; `.doc` usa o `react-docx` legado; Excel usa `react-xlsx`                 | `docx-preview` não suporta `.doc` OLE, exigindo desvio explícito    |
| Multiplanilha do Excel | O workbook do Excel compartilha o mesmo controller somente leitura         | A navegação de sheets customizada do ZCode mostra apenas as abas visíveis do workbook, sem ativar a barra de edição/exportação da biblioteca | A troca de planilha não pode custar nova leitura do arquivo nem abertura de escrita |
| Paginação do DOCX | As páginas devem preservar os limites de section OOXML e suas respectivas margens | Usa o comportamento padrão oficial de agrupamento de sections do `docx-preview`; não habilita `lastRenderedPageBreak` extra | Sections de mesmo tamanho também podem ter margens diferentes; é proibido mesclar |
| Responsividade | A pré-visualização de Word compartilha a regra de `calculateDocxPreviewFit` que só reduz e nunca amplia | DOCX mede o wrapper HTML gerado; `.doc` legado mede a tela do editor                                | Preserva a semântica de layout em barra lateral estreita do desktop e em telas pequenas |
| Ciclo de vida  | Limpa o conteúdo visível atual quando o source muda                       | O `renderAsync` do DOCX não tem API de cancelamento; usa DOM destacado + active guard                 | Resultados assíncronos antigos não podem sobrescrever o arquivo mais recente |

### Relacionamentos da Funcionalidade

| Rank           | De                                | Aresta semântica      | Para                                       | Condição / motivo                        | Evidência                                     |
| -------------- | --------------------------------- | --------------------- | ------------------------------------------ | --------------------------------------- | --------------------------------------------- |
| must-inspect   | Office file preview               | renders-in            | Superfície Office do Preview Pane          | Única entrada visível ao usuário         | `PreviewPane.tsx`, `previewPaneContent.tsx`   |
| must-inspect   | Superfície Office do Preview Pane | reads-through         | Workspace binary preview service           | O parsing Office precisa dos bytes completos e restritos | `PreviewPane.tsx`, `fileService.ts`           |
| must-inspect   | Superfície DOCX                   | renders-with          | `docx-preview.renderAsync`                 | Apenas `.docx`                           | `previewPaneOfficeDocxContent.tsx`            |
| conditional    | Superfície Word legada            | renders-with          | `@extend-ai/react-docx`                    | Apenas caminho de compatibilidade OLE `.doc` | `previewPaneOfficeLegacyDocContent.tsx`       |
| invariant-only | State de render local do Preview Pane | must-remain-isolated-from | desktop continuous / web remote replayable | Pré-visualização não é task runtime nem state de recuperação | Restrição de arquitetura + state local de UI |
| evidence-only  | Implementação de Office preview   | covered-by            | unit + runtime + build smoke               | Não declara nova dependência de produto | `officeFilePreview.test.ts`, Verification     |

### Donos de Estado e Destinos de Commit

| Estado / fato                                  | Owner de exibição                | Owner autoritativo                | command / service           | Persistência    | Evidência               |
| ---------------------------------------------- | -------------------------------- | --------------------------------- | --------------------------- | --------------- | ----------------------- |
| Bytes do arquivo Office                        | `PreviewPane`                    | File service do workspace atual   | `readBinaryPreview`         | Sem nova persistência | `PreviewPane.tsx`       |
| DOM gerado do DOCX, loading, erro, fit         | `PreviewPaneOfficeDocxContent`   | Preview Pane montado atualmente   | `docx-preview.renderAsync`  | Nenhuma         | component + unit test    |
| Tipo de arquivo                               | `getOfficeFilePreviewKind`       | Extensão do path do source        | Sem commit                  | Nenhum          | helper test             |

### Invariantes a Preservar

| Invariante                                                                                                    | Superfície / modo                            | Prova                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `.docx` não entra mais em `@extend-ai/react-docx`; `.doc` não entra em `docx-preview`                          | Desktop / Web / local / remoto              | Testes unitários do helper de roteamento e dos dois lazy chunks separados, artefato do build de produção |
| Results de `renderAsync` antigos não podem ser commitados no DOM visível após a troca de source                 | Todas as pré-visualizações DOCX             | Componente de teste de render obsoleto                      |
| Sections adjacentes de mesmo tamanho devem renderizar como páginas separadas, usando cada `pgMar`                | Todas as pré-visualizações DOCX             | Fixture real de duas sections + teste de regressão do renderer |
| Páginas de papel branco do DOCX usam sombra clara de baixo contraste, não a sombra padrão de 50% preto do renderer | light / dark / Zai Light / Zai Dark          | Component test de estilo de superfície de página + computed style via CDP |
| A pré-visualização não lê arquivo substituto do mesmo caminho na máquina para workspace remoto                    | SSH / WSL / Docker / Web                    | Continua reutilizando o wiring existente do workspace service |
| O state de pré-visualização não entra no snapshot de task/session nem no fluxo de mensagens                      | desktop continuous / web remote replayable  | Sem mudança de protocolo, store, main ou relay                |
| O conteúdo do documento mantém papel branco e as próprias cores; o exterior usa apenas tokens semânticos de tema | light / dark                                 | Screenshot de runtime + verificação de `DESIGN.md`           |

### Evidência de Codegraph

A sessão atual não forneceu a ferramenta de codegraph, portanto foi usado o fallback da skill com varredura textual precisa de símbolos para validar chamadores diretos, com profundidade de expansão 2.

| Seed                           | Consulta          | Chamadores diretos / caminho                              | Profundidade | Conclusão                                                     |
| ------------------------------ | ----------------- | --------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `getOfficeFilePreviewKind`     | direct callers    | `PreviewPane.tsx`                                          | 1           | A extensão só decide o roteamento Office do Preview Pane     |
| `PreviewPaneOfficeContent`     | direct callers    | `previewPaneContent.tsx`                                   | 1           | A UI Office tem um único ponto de despacho compartilhado     |
| `PreviewPaneOfficeDocxContent` | direct callers    | dynamic import em `previewPaneOfficeContent.tsx`           | 1           | O renderer DOCX pode ser trocado e dividido de forma independente |
| `readBinaryPreview`            | direct callers    | `PreviewPane.tsx`                                          | 2           | Não é preciso alterar service / RPC / workspace identity     |
| Testes de Office preview       | affected tests    | `officeFilePreview.test.ts`, `previewPane.test.ts`          | 2           | Cobrem roteamento, opções de render, recuperação de erro e stale guard |

### Graph Drift e Delta

| Status            | Nó / aresta                                                                                      | Motivo                                                     | Ação                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| confirmed drift   | O grafo original não tinha a capability / surface / owner de render local / binary preview service de Office file preview | A capacidade de produto já existe no código live e nas specs | Foi complementado `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml` |
| confirmed delta   | A superfície Office lê através do workspace file service e é isolada de desktop continuous / web remote replayable | Esta substituição mantém as fronteiras existentes            | Nó, aresta e code seed foram gravados; a integridade do YAML e a verificação dos arquivos de seed passaram |

### Perguntas em Aberto

Nenhuma. O usuário já definiu o renderer alvo para `.docx`; manter a capacidade existente para `.doc` é uma decisão de compatibilidade determinada em conjunto pelo formato da nova biblioteca e pelo contrato de produto atual.

### Handoff de Planejamento

| Item                       | Objetivo                                                                          | Status     |
| -------------------------- | --------------------------------------------------------------------------------- | ---------- |
| Atualização de spec        | Este documento                                                                    | complete   |
| Catálogo de casos / cobertura | `Candidate Combinations` e `Accepted Cases` deste documento                      | complete   |
| Backlog de decisões        | Nenhuma semântica de produto pendente                                             | complete   |
| Handoff de E2E             | Não envolve conversation/session; component + Web runtime + production build bastam | not-needed |

## Decisões de Fronteira

| Fronteira              | Decisão                                                                                                                                     | Motivo                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Extensões do Excel     | Suporta `.xlsx`, `.xlsm`, `.xls`; `.xlsx` é o caminho com suporte completo, e `.xlsm` / `.xls` são exibidos conforme a capacidade limitada de parsing da biblioteca | `react-xlsx` declara oficialmente suporte principal a OOXML `.xlsx`; formatos antigos mostram apenas o que o parser subjacente consegue ler |
| Extensões do Word      | `.docx` OOXML usa a API estável `renderAsync` do `docx-preview`; o binário antigo `.doc` continua usando o editor viewer somente leitura do `@extend-ai/react-docx` | O `docx-preview` é voltado a DOCX ZIP/OOXML e não faz parsing de `.doc` OLE; separar o roteamento troca a cadeia de renderização DOCX mais problemática sem perder a capacidade já existente de `.doc` |
| Modo de interação     | Uniformemente somente leitura; não expõe edição, salvamento, copiar/colar ou exportação | A responsabilidade de produto do Preview Pane é exibir, não ter semântica de escrita de arquivos |
| Origem do arquivo       | Continua usando `workspacePath`, `workspaceIdentity` e `workspaceRemoteSessionId` do source atual para resolver o `fileService` de escopo do workspace | Mantém o mesmo limite de serviço compartilhado por local, SSH / WSL / Docker, Web independente e controle remoto pelo celular |
| Leitura do arquivo     | Nova interface genérica e restrita de leitura de preview binário, retornando o arquivo completo em base64 através do RPC; limite de 25 MB | O parsing de ZIP/OLE do Office precisa dos bytes completos; evita que a UI acesse direto o sistema de arquivos do Node e evita transporte entre processos sem limite |
| Forma de carregamento | Componentes de renderização Office e bibliotecas de terceiros são carregados sob demanda por tipo de arquivo; o WASM do Excel é carregado como asset de build | Evita que a pré-visualização de texto/imagem comum pague o custo de tamanho e inicialização dos parsers Office |
| Feedback de carregamento | Mantém a superfície de pré-visualização em branco durante leitura, lazy loading e parsing, deixando apenas o estado invisível `aria-busy`, sem exibir o texto “正在加载 Office 文件预览” | O tempo real de carregamento é curto, e o piscar de texto causaria um salto visual desnecessário |
| Tema                   | O Excel recebe o tema light/dark atual; o DOCX mantém o papel branco e a margem de página neutra, e o tema escuro só muda o workspace externo | As cores próprias do documento são semântica de conteúdo e não podem ser reescritas arbitrariamente pelo tema do aplicativo |
| Multiplanilha do Excel | Mantém `showDefaultToolbar={false}` e renderiza apenas as abas visíveis do workbook pelo render prop `toolbar`; ao selecionar uma aba, chama `setActiveTabIndex` do mesmo controller | A barra padrão hospeda tanto sheet tabs quanto ações de edição/download; a pré-visualização só precisa de navegação multiplanilha, sem reabrir entradas de escrita ou exportação para mostrar sheets |
| Caminho ZIP do Excel   | Aceita `.xlsx` cujas ZIP entries usem o separador de barra invertida não padrão do Windows, com normalização feita pelo `react-xlsx@0.16.0` na fronteira de leitura unificada antes do parsing | Alguns escritores de Excel geram entries como `xl\worksheets\sheet1.xml`; versões antigas acusavam falsamente arquivos recuperáveis como sem parte obrigatória |
| Hierarquia de página   | As páginas DOCX reutilizam a sombra de papel claro original do `react-docx` `0 2px 10px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.05)`, sobrescrevendo a sombra preta padrão de 50% do `docx-preview` | O papel é uma superfície de conteúdo comum, não um overlay; a sombra de baixo contraste distingue a página do fundo sem formar uma borda preta pesada |
| Responsividade         | A raiz da pré-visualização preenche o Preview Pane; tabelas do Excel rolam dentro do próprio contêiner; o DOCX mede o wrapper de página gerado após `renderAsync` e reduz proporcionalmente quando a largura é insuficiente, recalculando em tempo real quando o contêiner alarga, mas nunca ampliando além do tamanho original do documento | Desktop e Web no celular não alteram a semântica funcional, e ao mesmo tempo evitam que a largura original em pixels do papel estoure o Preview Pane |
| Paginação do DOCX       | `ignoreLastRenderedPageBreak` mantém o valor padrão oficial do `docx-preview`, `true`; sections adjacentes, mesmo com dimensões de papel iguais, precisam gerar páginas separadas e aplicar seus próprios `pgMar` | Com essa opção como `false`, o `docx-preview@0.4.0` mescla sections sem page break explícito e com dimensões de papel iguais, fazendo o corpo seguinte herdar a margem zero da capa |
| Limite de segurança do DOCX | Desabilita renderização de HTML via `altChunk`; imagens e fontes usam URLs em base64; ao trocar de arquivo ou desmontar, descarta resultados de render obsoletos e limpa o DOM gerado | O arquivo pré-visualizado pode vir de um workspace não confiável; evita injetar HTML embutido no renderer e evita que um documento antigo concluído de forma assíncrona sobreponha o arquivo atual |
| Erros                 | Arquivo ausente continua usando o aviso fraco existente; limite excedido, falha de parsing e arquivo corrompido exibem estado de erro localizado, registrando uma falha pelo UI logger | Preserva a hierarquia de erros atual do Preview Pane e fornece evidência diagnosticável |

## Escopo de Domínio

| Domínio                                | Incluído | Observação                                                                            |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| File / workspace service               | Sim      | Arquivos binários precisam ser lidos pelo workspace service após injeção de dependência |
| UI shell / tema / responsividade / i18n | Sim      | Novos contêineres de renderização, estados de loading e erro e textos em chinês/inglês |
| Renderização / performance             | Sim      | Dependências e parsing do Office carregados sob demanda, com transferência protegida pelo limite de 25 MB |
| Workspace identity / remote runtime   | Sim      | O isolamento continua usando `workspaceIdentity?.trim() \|\| workspacePath`; o path do arquivo serve só para leitura |
| Session / task realtime                | Não      | A pré-visualização é state local de UI e não entra no fluxo continuous ou replayable    |
| Persistência                          | Não      | Não salva número de página, sheet, zoom nem estado de documentos Office               |

## Combinações Candidatas

| ID     | Arquivo / ambiente                                | Ação                        | Resultado esperado                                                                        | Status                        |
| ------ | ------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| OFP-01 | `.xlsx` local                                     | Abrir pela árvore de arquivos | Lê os bytes completos e mostra o workbook somente leitura, com troca de sheet          | accepted                      |
| OFP-02 | `.docx` local                                     | Abrir pela árvore de arquivos | Mostra documento paginado somente leitura via `docx-preview.renderAsync`                  | accepted                      |
| OFP-03 | `.xlsm` / `.xls`                                   | Abrir pela árvore de arquivos | Tenta exibir os dados suportados pelo parser subjacente; em caso de falha entra no estado de erro unificado | accepted            |
| OFP-04 | Workspace SSH / WSL / Docker / Web                | Abrir arquivo Office         | Usa o `fileService` de escopo do workspace correspondente, sem ler o mesmo caminho local | accepted                      |
| OFP-05 | Preview Pane estreito no celular ou desktop        | Abrir arquivo Office         | As páginas DOCX geradas são reduzidas proporcionalmente à largura disponível, sem overflow horizontal, e a última página é acessível ao rolar | accepted |
| OFP-06 | Arquivo maior que 25 MB                           | Abrir                       | Recusa a leitura via RPC e exibe erro localizado de limite excedido                     | accepted                      |
| OFP-07 | Arquivo corrompido, criptografado ou não suportado pelo parser | Abrir            | Mostra erro localizado de impossibilidade de pré-visualização, sem afetar outras abas   | accepted                      |
| OFP-08 | Texto comum, Markdown, SVG, imagem                | Abrir                       | Mantém a renderização e o comportamento de menu existentes                               | accepted                      |
| OFP-09 | `.doc` binário antigo                              | Abrir pela árvore de arquivos | Lê os bytes completos e mostra o documento paginado pela cadeia de renderização Word somente leitura | accepted            |
| OFP-10 | Edição/salvamento de arquivo Office                | Operar no Preview Pane       | Essa capacidade não é oferecida                                                         | pruned: fora da responsabilidade da pré-visualização somente leitura        |
| OFP-11 | Qualquer arquivo Office com suporte                | Abrir pré-visualização       | Mantém em branco durante o carregamento, sem piscar texto de loading visível; exibe o conteúdo ao concluir | accepted           |
| OFP-12 | DOCX com duas sections, capa sem margens e corpo com margens | Abrir pré-visualização | Gera duas páginas independentes; o corpo mantém suas próprias margens esquerda/direita e não é mesclado com a section da capa | accepted |
| OFP-13 | `.xlsx` com ZIP entry usando barra invertida        | Abrir pré-visualização       | Normaliza o path do entry e exibe o workbook normalmente, sem cair no erro de arquivo corrompido | accepted            |

## Casos Aceitos

| Case ID | Setup                                    | Ação                            | Asserções                                                                                                                       | Evidência                                                          | Estado de automação |
| ------- | ---------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| OFP-01  | `.xlsx` pequeno com múltiplos sheets     | Abrir o preview e trocar de sheet | Reconhecido como Excel; chama a leitura binária; mostra todos os nomes de sheet visíveis; ao selecionar chama `setActiveTabIndex` e atualiza o sheet ativo; não exibe barra de edição/exportação | UI helper + component interaction test + CDP runtime                 | covered            |
| OFP-02  | `.docx` com parágrafos                     | Abrir o preview do arquivo      | Reconhecido como DOCX; chama a leitura binária; chama `docx-preview.renderAsync` com opções seguras                             | UI helper + component test + CDP runtime                            | covered            |
| OFP-04  | Source com parâmetros de workspace remoto | Abrir o preview do arquivo      | Continua repassando a tripla de workspace para `useWorkspaceServices`                                                         | Wiring existente do Preview Pane + regression test                  | covered            |
| OFP-05  | Largura original do papel DOCX maior que o contêiner do preview | Abrir, ajustar a largura e rolar até o fim | A escala é `min(1, largura disponível / largura original)`; a largura/altura do wrapper e o transform usam a mesma escala; o contêiner não tem overflow horizontal e a última página é acessível | component test + CDP scaled-scroll regression | covered |
| OFP-06  | Arquivo binário maior que 25 MB            | Ler o preview                   | O service rejeita antes da leitura e não devolve o conteúdo do arquivo                                                        | service unit test                                                   | covered            |
| OFP-07  | Bytes de Office inválidos                  | Renderizar o preview            | O erro do parser é convertido pela fronteira de erro em um estado de erro legível                                            | component test                                                      | covered            |
| OFP-08  | Source existente de texto / imagem         | Abrir o preview                 | Segue pelo caminho existente de texto em blocos ou de mídia                                                                  | existing tests                                                      | covered            |
| OFP-09  | `.doc` OLE Compound Document               | Abrir o preview do arquivo      | Reconhecido como Word legado; chama a leitura binária; entrega ao `react-docx` apenas nesse caminho de compatibilidade       | UI helper + teste de roteamento do PreviewPane + parser real/runtime smoke | covered    |
| OFP-11  | Leitura ou parsing de arquivo Office ainda em andamento | Abrir o preview do arquivo | Superfície de preview em branco com `aria-busy`, sem renderizar texto de loading visível                                       | component test                                                      | covered            |
| OFP-12  | Duas sections de mesmo tamanho e margens diferentes | Abrir o preview do arquivo | `docx-preview` gera duas `section`; a segunda página usa o `pgMar` do corpo e não herda o `padding: 0` da capa               | regressão real do renderer DOCX + CDP runtime                       | covered            |
| OFP-13  | ZIP entry com barra invertida em part OOXML obrigatório | Abrir o preview do arquivo    | O controller do `react-xlsx` conclui o parsing, sem erro `Missing required part`, e gera as abas de worksheet                  | real renderer integration test                                       | covered            |

## Contrato de Implementação

- `packages/shared` declara o tipo genérico de retorno da pré-visualização binária; `IFileService` expõe o método de leitura com limite de tamanho.
- `packages/services` verifica o tamanho após `stat` e antes de `readFile`, com padrão e teto rígido de 25 MB.
- `packages/ui/src/PreviewPane.tsx` é responsável apenas por reconhecimento, ciclo de vida da leitura e normalização de erros; a renderização Office fica em um módulo separado.
- Arquivos Office não podem entrar primeiro no binary fallback de `readTextFile`; ao trocar de source é preciso descartar resultados de requisições antigas.
- Renderers de terceiros precisam ser carregados dinamicamente. O Excel viewer precisa de `readOnly` explícito, e o WASM precisa ser fornecido por assets de build relativos utilizáveis por Vite / Electron.
- O renderer de Excel precisa usar `@extend-ai/react-xlsx@^0.16.0` ou versão compatível mais alta, garantindo que a ZIP entry não padrão com barra invertida seja normalizada na fronteira de leitura compartilhada por worker, main thread e deferred load.
- O Excel precisa manter `showDefaultToolbar={false}`, evitando abrir entradas de edição, salvamento e exportação; a navegação multiplanilha precisa ler `controller.tabs` pelo render prop `toolbar` e trocar com `controller.setActiveTabIndex` dentro do mesmo controller de workbook, sem mostrar apenas o primeiro sheet e sem reconstruir ou reparsear o workbook para trocar de sheet.
- `.docx` e `.doc` precisam continuar contornando `readTextFile` e obtendo os bytes completos pela interface de leitura binária restrita; não podem cair no preview de código só porque `.doc` pode conter texto extraível.
- `.docx` precisa chamar `docx-preview.renderAsync` e não pode mais entrar na cadeia model/editor do `@extend-ai/react-docx`. As opções de renderização precisam desativar `renderAltChunks`, desativar debug e usar URLs em base64; só o resultado assíncrono do source atual pode ser commitado no DOM visível.
- `.docx` não pode sobrescrever `ignoreLastRenderedPageBreak` como `false`; é preciso preservar o comportamento oficial de agrupamento de sections do `docx-preview`, garantindo que sections de mesmo tamanho ainda paginem de forma independente e apliquem suas respectivas margens.
- As páginas geradas pelo `docx-preview` precisam sobrescrever a sombra padrão `0 0 10px rgba(0, 0, 0, 0.5)`, usando uniformemente a sombra de papel claro original do `react-docx`; não se pode voltar a deixar a página branca com sombra escura por causa do tema escuro do aplicativo.
- O binário antigo `.doc` mantém isoladamente o caminho de compatibilidade `useDocxEditor` + `DocxEditorViewer mode="read-only"`; esse caminho não pode ser reutilizado para `.docx`.
- O DOCX precisa preservar a proporção original do documento e só reduzir quando a largura da página gerada exceder a largura disponível do contêiner; a largura/altura placeholder após o scale precisam ser atualizadas junto, sem usar apenas `transform` e deixar uma área de rolagem não escalada.
- A etapa de carregamento Office não pode exibir texto de loading visível; o estado em branco continua exposto a tecnologias assistivas por `aria-busy`.
- Novos estilos só podem usar tokens semânticos de `DESIGN.md`, validando ao mesmo tempo Zai Light, Zai Dark e telas estreitas.
- O log de erros de UI usa uniformemente `packages/ui/src/logger.ts` e não pode chamar `console` diretamente.

## Verificação

- service unit: base64 normal, limite de tamanho padrão/customizado, rejeição de diretório.
- UI unit: reconhecimento de extensão, nomes e interação de troca de múltiplos sheets do Excel, desativação da barra de edição padrão do Excel, parsing real de Excel com ZIP entry de barra invertida, desvio entre `.docx` / `.doc`, arquivos Office sem menu de quebra de linha de código, ramos de loading e erro, opções seguras de `renderAsync`, paginação e margens de duas sections de mesmo tamanho, sombra de página clara do DOCX, props somente leitura do `.doc` antigo.
- Desktop runtime: abrir um `.xlsx` real com múltiplos sheets e verificar que todas as abas de sheet ficam visíveis, que clicar troca o conteúdo do sheet ativo sem reler o arquivo.
- Web runtime: abrir uma pré-visualização real usando a fixture DOCX oficial `page-layout` do `docx-preview`; o papel original de 794px é escalado para `0.531486` dentro de um Preview Pane de 422px, sem alert no DOM visível e sem page error no navegador.
- build smoke: tanto o renderer do Desktop quanto o build de produção do Web resolvem os pacotes Office, o worker e os assets de WASM do Excel.
- repository gates: `pnpm typecheck`, `pnpm lint`.