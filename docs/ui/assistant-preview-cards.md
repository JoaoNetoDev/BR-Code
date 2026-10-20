# Cartões de Pré-visualização de Arquivos do Assistente

Os cartões de pré-visualização de arquivos do Assistente são renderizados dentro da
última linha do assistente no terminal, acima das ações de mensagem e antes do
resumo de alterações por turno. O texto do corpo do Assistente mantém o
comportamento existente do Streamdown: menções de nome de arquivo comuns não são
automaticamente reescritas em links clicáveis. Uma diretiva completa
`::zcode-file-citation{...}` é uma projeção separada e explícita, e é
renderizada com a mesma UI de link de arquivo e o mesmo comportamento de
abertura de um link Markdown `[label](path)`.

`::zcode-file-citation{...}` continua sendo a sintaxe canônica emitida por prompts e
Skills. O renderizador também aceita a forma de compatibilidade com o modelo
`:zcode-file-citation{...}`, com um dois-pontos inicial faltando. Essa tolerância é
limitada a citações de arquivo: ambas as formas compartilham o mesmo parsing de
parâmetros, validação de caminho, projeção de link no corpo e elegibilidade para
cartão de pré-visualização, enquanto outras diretivas como `::code-comment{...}`
permanecem estritas.

## Escopo

- Tipos de arquivo de cartão de pré-visualização: Markdown, HTML, DOCX, XLSX, PPTX, PDF, MP4, MOV,
  WebM, M4V, MP3, WAV, M4A, OGG, Opus, FLAC e WEBA.
- Todo cartão de pré-visualização usa um ícone inicial de 24 x 24 px para site, arquivo
  reconhecido e arquivo de fallback, dentro do contêiner de ícone de cartão existente.
- O registro de tipos de arquivo é dono da extensão, do subtítulo e do comportamento de
  abertura, para que outro tipo de arquivo pré-visualizável possa ser adicionado sem
  alterar o pipeline de extração.
- A extração de cartões suporta links de arquivo explícitos em Markdown e menções de
  caminho de arquivo comuns. O extrator compartilhado aceita nomes de arquivo e
  diretório Unicode, caminhos com espaços, caminhos Unix e caminhos com letra de
  unidade do Windows para todo tipo de arquivo registrado, incluindo Markdown e HTML.
- Referências a arquivos locais aceitam aspas ASCII balanceadas (`"..."`, `'...'`) e
  aspas curvas chinesas (`“...”`, `‘...’`) em torno de parâmetros de citação,
  destinos Markdown e menções de caminho comuns. Aspas desbalanceadas ou não fechadas
  são mantidas como texto bruto e não se tornam links de arquivo, de modo que uma
  saída malformada do modelo não possa alterar silenciosamente o caminho de destino.
- Caminhos relativos ao home começando com `~/` ou `~\\` são resolvidos contra o
  `homedir` informado pelo Host do workspace atual. Isso se aplica de forma
  consistente a cartões de pré-visualização, links no corpo do Assistente, citações,
  comentários de código e imagens Markdown locais. O renderizador nunca expande `~`
  com o home do seu próprio processo; quando o Home do Host está indisponível, o
  caminho falha de forma fechada em vez de ser tratado como caminho relativo ao
  workspace.
- Referências relativas ao workspace são normalizadas lexicalmente entre os
  separadores `/` e `\\` antes de se tornarem cartões. Segmentos `.` são removidos,
  segmentos `..` só podem cancelar um segmento anterior, e qualquer travessia que
  moveria acima da raiz do workspace é rejeitada antes do I/O de arquivos do Host.
  Formas seguras como `./a/../report.pdf` resolvem para o caminho normalizado do
  workspace; formas inseguras como `foo/../../private.pdf` não geram cartão.
- Caminhos absolutos explícitos permanecem uma capacidade de produto separada e
  existente. Eles não são concatenados ao resolvedor relativo ao workspace nem
  autorizados por ele; abri-los continua usando o Host local ou remoto selecionado e
  suas permissões de acesso a arquivos existentes.
- Menções de nome de arquivo comuns no texto do corpo do Assistente não são
  auto-ligadas. O tratamento existente de links Markdown explícitos permanece fora
  deste recurso de cartões e mantém seu comportamento pré-existente.
- `zcode-file-citation` aceita `path`, `purpose` e `artifact_kind` como seus
  parâmetros comuns atuais. `path` é obrigatório; `purpose` é analisado mas não
  altera a apresentação nem o comportamento de abertura. Outros parâmetros
  sintaticamente válidos são tolerados e ignorados por esta projeção.
- Um caminho de citação válido é renderizado no corpo do Assistente como um link de
  arquivo cujo rótulo é o nome folha do caminho. Links no corpo de citação não são
  limitados às extensões de cartão de pré-visualização e não fazem uma verificação
  de existência antecipada.
- Cartões de pré-visualização de citação são limitados a DOCX, XLSX, PPTX, PDF, vídeo e
  áudio. O mapeamento `artifact_kind` suportado é `document -> docx`, `presentation -> pptx`,
  `workbook -> xlsx`, `video -> video` e `audio -> audio`; quando `artifact_kind` está
  ausente, o tipo é inferido pela extensão do caminho. Um `artifact_kind` desconhecido
  ou incompatível com a extensão suprime apenas o cartão de citação, e não um link no
  corpo que seria válido.
- Uma citação completa ocupa um intervalo de extração protegido. Seu caminho interno
  não é extraído novamente como referência Markdown, HTML ou de arquivo comum, de modo
  que a elegibilidade para cartão de citação não possa ser contornada pela regex
  genérica de caminho.
- Durante o streaming, uma citação não fechada na última linha isolada é ocultada do
  corpo até ser fechada. Uma cauda inline de aparência válida é tratada do mesmo
  jeito. Se a saída malformada já tiver continuado em prosa posterior, o texto bruto
  é retido para que um `}` ausente não possa engolir o resto da resposta. Exemplos
  cercados por cercas de código e em código inline nunca são projetados.
- Candidatos a cartão são ordenados pela ocorrência inversa no corpo e depois
  deduplicados por caminho de arquivo resolvido ou URL.
- No máximo os primeiros 15 candidatos ordenados são verificados. O Host verifica
  esses arquivos concorrentemente, armazena em cache os resultados positivos e
  negativos por um minuto, e a UI renderiza no máximo os primeiros 10 cartões válidos.
  Candidatos inválidos não são preenchidos a partir de posições após os primeiros 15.
- A validação do renderizador é indexada pela assinatura semântica do cartão e pelo
  serviço de arquivos do workspace selecionado. Renderizar de novo uma lista de
  cartões equivalente com uma nova identidade de array reutiliza o resultado de
  validação já resolvido sem outro RPC ao Host; alterar a assinatura do cartão ou o
  serviço de arquivos do workspace inicia uma nova validação.
- Cartões Markdown e HTML exigem um arquivo ativo correspondente no `fileChanges` do
  turno atual. Cartões de Office, PDF e vídeo/áudio não usam esse portão.
- Requisições de `fileChanges` do turno atual são deduplicadas acima das linhas
  virtualizadas em `SessionPane`. Requisições de turno em execução incluem a revisão
  atual da projeção em sua chave e compartilham apenas a promise em voo; o resultado
  resolvido é removido porque esse turno ainda pode crescer. Requisições de turno
  terminal usam `sessionId + logEpoch + turnHeader rowId + entityId + fileChanges state`,
  compartilham tanto os resultados em voo quanto os bem-sucedidos, e permanecem no LRU
  local do renderizador de no máximo 20 entradas. Uma transição de projeção de
  `active` para `reverted` portanto não pode reutilizar o resultado anterior ao
  rewind. Requisições com falha são sempre removidas.
- A extração de referências a arquivos é memoizada uma vez por texto de turno terminal
  e caminho de workspace. O portão `fileChanges` de Markdown/HTML e o construtor
  final de cartões consomem as mesmas referências extraídas; reconstruir um array
  equivalente de linhas do assistente não repete o parsing de Unicode/caminho.

## Projeção e limite de estado

Os cartões de pré-visualização permanecem uma projeção somente de UI a partir de
linhas V4 já entregues. Eles não adicionam linhas de protocolo, campos de snapshot,
eventos replayable, estado de relay ou metadados do lado do agente.

```text
linhas assistantText (hidratação desktop continuous / mobile replayable)
  |
  +-- zcode-file-citation completo
  |     +-- corpo: renderiza o link de nome folha pelo MessageFileLink existente
  |     `-- cartões: só admite referências docx/xlsx/pptx/pdf compatíveis
  |
  +-- linha streaming / failed / non-tail ----------------------> sem cartões
  |
  `-- última linha complete|interrupted
        |
        +-- junta o texto do assistente em ordem de corpo uma única vez
        +-- extrai referências de arquivo uma vez; reutiliza para portão + construção de cartões
        +-- extrai candidatos localhost
        +-- busca os fileChanges deste turno com o alvo do turnHeader quando houver md/html
        |     +-- running: chave de revisão + apenas em voo
        |     +-- terminal: alvo + chave active|reverted + sucesso resolvido, LRU compartilhado <= 20 entradas
        |     `-- apenas caminhos md/html ativos
        +-- ordem de ocorrência inversa + dedupe
        +-- pega os primeiros 15 candidatos
        `-- fileService.checkFilesExist() no escopo do workspace
              |
              +-- cache do Host: instância do host do workspace + caminho, TTL 60 s
              +-- verificações concorrentes: no máximo 15
              `-- mantém candidatos válidos, pega os primeiros 10 -> renderiza os cartões
```

A instância do serviço de arquivos do Host já pertence a um host de workspace local
ou remoto. As entradas do cache são portanto isoladas por instância de host; o
código do renderizador deve resolver o serviço com `useWorkspaceServices(workspacePath,
remoteSessionId, workspaceIdentity)` para que caminhos remotos sejam verificados pelo
host de workspace remoto.

O mesmo Host no escopo do workspace fornece `systemService.info().homedir` para
caminhos do Assistente relativos ao Home. O desktop local usa o Home do Host local;
SSH/WSL/Docker e o Web `/remote` usam o Home do Host remoto anexado. O resultado do
Home é cacheado por `workspaceIdentity?.trim() || workspacePath` mais
`remoteSessionId` e é atualizado quando a instância do serviço do Host muda.

A seleção de serviço no escopo do workspace identifica qual Host faz o I/O de
arquivos; por si só ela não prova que um caminho de entrada está sob o diretório do
workspace. Esse limite de diretório é imposto antes, para referências relativas de
cartão do Assistente, pelo resolvedor lexical compartilhado. Candidatos de cartão
rejeitados nunca devem chegar a `checkFilesExist`, ao Preview Pane, ao Browser ou a
ações de editor externo.

Links no corpo de citação permanecem deliberadamente fora deste pipeline de
validação antecipada. Eles reutilizam o caminho de clique de link de arquivo Markdown
existente, incluindo seu escopo de workspace, rejeição de travessia, normalização
Windows/UNC e stat de arquivo no momento do clique. O cache de um minuto de
`checkFilesExist` é usado apenas quando uma citação se torna candidata a cartão de
pré-visualização.

## Portão de fileChanges do turno atual

Markdown e HTML são formatos similares a código-fonte que aparecem com frequência em
discussões. Seus cartões de pré-visualização só são exibidos quando o turno terminal
reporta um resultado `active` de fileChanges contendo o caminho resolvido. Um alvo
ausente, uma função de busca indisponível, um resultado revertido ou uma requisição
com falha não produzem cartões Markdown ou HTML. Essa falha não suprime cartões
DOCX/XLSX/PPTX/PDF/vídeo/áudio.

O `fileChanges.state` do cabeçalho do turno é o estado de rewind autoritativo. Quando
ele muda para `reverted`, a projeção de cartões limpa imediatamente os caminhos
Markdown/HTML carregados antes e não espera uma consulta de detalhe para
rediscoverir o estado. O mesmo estado primitivo faz parte da chave compartilhada da
consulta terminal, de modo que o painel de resumo de arquivos não possa reutilizar
uma Promise/resultado `active` após o rewind.

O alvo da consulta precisa ser a linha `turnHeader` do mesmo turno. A linha
`assistantText` terminal permanece a âncora de renderização de corpo/cartão, mas não
é um alvo válido de ação `fileChanges` do V4. Se o cabeçalho do turno ou seu id de
entidade estiver indisponível, a UI falha de forma fechada para cartões
Markdown/HTML em vez de consultar com uma linha de assistente.

O portão compara caminhos normalizados do workspace. Para um nome isolado, ele só
pode resolver para um caminho de fileChanges quando esse nome identifica um arquivo
correspondente no turno atual; caso contrário, é usada a resolução normal de cartão
relativo ao workspace.

O cache compartilhado vive acima da virtualização de `ConversationTimeline`, então
rolar um turno concluído para fora da vista e de volta não repete a consulta de
detalhe completo. Um turno em execução pode expor um resumo de arquivos parcial;
portanto os consumidores o solicitam com uma política de apenas-em-voo e revalidam
depois que o cabeçalho entra em um estado terminal. Isso impede que uma revisão de
projeção anterior suprima os cartões Markdown/HTML finais ou deixe um painel de
alterações de arquivo remontado incompleto. Ele é recriado quando a sessão, o
`logEpoch` ou o transporte de fileChanges muda; falhas nunca são retidas. Esse cache
é separado do cache de existência de arquivos de um minuto do Host porque armazena
resultados de diff de turno, incluindo linhas de patch, em vez de booleanos de
existência de caminho.

## Comportamento de abertura

- DOCX, XLSX, PPTX, PDF, vídeo/áudio suportado e Markdown abrem no Preview Pane usando uma
  fonte de arquivo que carrega `workspacePath`, `workspaceIdentity` opcional e
  `workspaceRemoteSessionId` opcional.
- Depois que o último turno do Assistente atinge `complete`, o renderizador abre
  automaticamente os cartões PPTX que sobreviveram ao limite de candidatos existente e
  à validação de existência de arquivo. Turnos `interrupted`, `streaming`, `failed`,
  históricos e retomados a frio não acionam a abertura automática.
- Quando um turno concluído produz múltiplos cartões PPTX visíveis, cada cartão é
  aberto como uma aba separada do Code Viewer à direita. As abas existentes são
  reutilizadas pela chave de fonte normal no escopo do workspace, e o primeiro cartão
  PPTX na ordem dos cartões se torna a aba ativa. Isso é pré-visualização em abas, não
  um novo layout de painel dividido.
- HTML local do desktop mantém o comportamento de painel lateral do Browser.
- HTML de workspace remoto no Desktop degrada da navegação `file://` no Browser para o
  Preview Pane de arquivo, porque o browser não consegue resolver com segurança o
  caminho do host de workspace.
- O Web `/remote` não projeta cartões de URL localhost/127.0.0.1 nem cartões de saída
  HTML. Sem encaminhamento de porta ou um proxy de URL, essas URLs não alcançam o
  host do Desktop, e o Preview Pane mostraria apenas o código-fonte HTML em vez da
  página renderizada. Cartões Markdown, DOCX, XLSX, PPTX, PDF e vídeo/áudio permanecem
  disponíveis.
- Cartões HTTP localhost do Desktop mantêm o comportamento de painel lateral do
  Browser. Quando uma URL mapeia para um arquivo HTML gerado, o arquivo de suporte
  também precisa passar na verificação de existência.
- Workspaces locais e remotos do Desktop suportam a abertura automática de PPTX
  porque expõem um Preview Pane à direita. O Web `/remote` mantém os cartões
  visíveis, mas não abre automaticamente quando a superfície atual não tem um
  Preview Pane utilizável à direita.

## Compatibilidade

- O Desktop continua no caminho de mensagens `desktop-continuous` existente.
- O Web remoto continua em `web-remote-replayable`; a projeção de cartões roda
  somente após a hidratação das linhas e não entra na recuperação de gap/snapshot.
  Candidatos locais de URL e HTML não suportados são filtrados na projeção do
  renderizador antes da janela de verificação de existência de 15 cartões, sem
  adicionar estado de protocolo ou de Host.
- O cache de `fileChanges` é estado de consulta local do renderizador. Ele não
  adiciona relay, Host, snapshot ou estado replayable e não altera as semânticas de
  entrega.
- Nenhum serviço ou chave de cache usa `workspacePath` como identidade de workspace.
  O roteamento remoto continua carregando `workspaceIdentity` e `remoteSessionId`
  pelo acessor de serviço de workspace existente.
- Os renderizadores existentes de Office/PDF do Preview Pane são reutilizados; este
  recurso não adiciona outro parser de documentos.
- A abertura automática é um efeito colateral local do renderizador. Ela não adiciona
  linhas de protocolo, campos de snapshot, estado de relay ou metadados do Agent. Uma
  chave de disparo único no escopo de workspace, sessão, época de log, turno e
  assinatura do cartão impede que remontagens virtualizadas e re-renderizações
  equivalentes reabram uma aba depois que o usuário a fecha.

## Menus de ação do cartão

O cartão inteiro suporta um menu de contexto. O botão Open existente e seu dropdown
mantêm seus rótulos originais, a lista de aplicativos plana, a largura e a ordem das
ações de caminho. Somente o menu de contexto do cartão adiciona novas ações; ambos os
pontos de entrada reutilizam os mesmos handlers de abertura. Os menus de contexto de
arquivo oferecem Preview, Open (o aplicativo padrão do sistema), um submenu Open
with, e depois a cópia dos caminhos relativo e absoluto. O menu de contexto omite Open
containing folder e seu separador. Os rótulos chineses são 预览 e 打开.
Cartões de site usam os mesmos rótulos Preview e Open para as ações de painel lateral e
browser, seguidos da cópia da URL; HTML local com backing de arquivo oferece também as
ações de caminho. O botão principal do cartão continua exibindo Open para todos os
tipos de cartão.

As ações nativas de arquivo exigem a capacidade explícita `canOpenLocalFiles` da
plataforma. Web e mobile as omitem. Arquivos remotos nunca usam o aplicativo padrão
local; Open with mantém o casamento exato de identidade/sessão do workspace existente.
Ações de plataforma indisponíveis são omitidas, enquanto escolhas de aplicativo
temporariamente em carregamento exibem uma linha de carregamento desabilitada. Preview
mantém a fonte com escopo existente e a apresentação de painel no mobile.

```text
menu de contexto do cartão / dropdown Open inalterado
              -> dono de ação compartilhado (OpenSplitButton)
              -> callback de preview existente / porta de plataforma / hook de ação de arquivo
```

O menu é dono apenas de estado transitório de UI. Ele não adiciona fila de runtime,
protocolo, snapshot ou estado de recuperação; a entrega contínua do desktop e a
replayable do mobile permanecem inalteradas. A descoberta assíncrona de aplicativos é
limitada ao alvo e ignora resultados obsoletos depois que o alvo muda ou é desmontado.
Ambos os menus reutilizam as primitivas do design system, a navegação por teclado, os
tokens de tema claro/escuro e os rótulos localizados.

Aceitação APC14: clicar com o botão direito em um cartão real de Office, verificar que
seu dropdown permanece inalterado, afirmar os rótulos compactos e a ausência da
entrada de diretório, pré-visualizar o arquivo e verificar a chamada de shell do
aplicativo padrão com um mock. Testes de componente focados cobrem links de site,
caminhos HTML, preview indisponível, exclusão de capacidade no Web e nativo remoto.
