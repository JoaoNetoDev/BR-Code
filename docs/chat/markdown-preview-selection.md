# Referência por Seleção no Markdown Preview

## Comportamento do Produto

O corpo da pré-visualização do Markdown Preview (arquivos `.md` / `.markdown` ou texto Markdown
passado diretamente) oferece suporte a seleção com mouse, teclado e toque. Uma seleção válida e não
vazia exibe "Adicionar à tarefa atual"; ao clicar, o texto selecionado é adicionado às referências a
enviar da tarefa principal atual, preservando o rascunho e sem envio automático. Também é oferecido
"Perguntar na conversa auxiliar", e a visualização de código-fonte continua usando as interações de
código existentes.

Quando a tarefa principal atual ainda não criou sessão, a referência entra no escopo de rascunho
desse workspace. A referência reaproveita o chip de referência da conversa, a remoção, os limites
atômicos e a serialização de envio: no máximo 8.000 caracteres por item, no máximo 8 itens e 16.000
caracteres no total; fontes e textos repetidos não são adicionados de novo. A origem Markdown registra
explicitamente o caminho do arquivo ou a identidade da pré-visualização de texto, sem forjar row de
mensagem ou sessão; o envio reaproveita o bloco userselect: a seleção de arquivo contém path/text, e
texto sem caminho e a seleção da conversa contêm apenas text.

Os dois extremos da seleção devem estar ambos dentro do mesmo corpo de pré-visualização; são
recusados espaço em branco, botões/campos de entrada e seleção entre pré-visualizações. O corpo vale
entre parágrafos e em tabelas. A camada flutuante é fechada ao rolar, ao pressionar Escape, ao
recolher a seleção, ao trocar de arquivo, ao atualizar o corpo, ao trocar de task/workspace ou ao
ocultar a pré-visualização. A camada flutuante não pode transbordar em telas estreitas e segue os
tokens de tema e os textos em chinês e inglês.

## Fluxo de Dados e Limites

```text
AnimatedSidePanePanel (activeTaskId + workspaceKey)
  -> PreviewPane -> MarkdownPreviewContent
                     -> Selection action
                        -> reference scope[workspaceKey, taskId | draft]
                           -> Composer draft + reference chips
                              -> user sends -> existing userselect serialization
```

O workspaceKey usa estritamente workspaceIdentity?.trim() || workspacePath; quando a origem da
pré-visualização não corresponde ao workspace de destino, nenhuma entrada é oferecida. O destino de
"Adicionar à tarefa atual" é a tarefa principal atual, sem adivinhar pelo último input auxiliar
focado. Todas as alterações ficam na camada de UI de referências a enviar; o desktop
desktop-continuous e o celular web-remote-replayable continuam usando suas fronteiras próprias de
transporte e recuperação, sem novo estado de runtime/host ou fila.

## Contrato de Validação

- MPS01: adicionar após selecionar o corpo em um arquivo/pré-visualização de texto, preservando o
  rascunho, com chip correto, removível e sem envio automático.
- MPS02: distinção de origem, deduplicação de mesma origem e mesmo texto, rejeição atômica de limite,
  envio de arquivo com path/text e texto sem caminho contendo apenas text.
- MPS03: rejeição entre regiões/controles/espaço em branco; limpeza da camada flutuante ao rolar,
  com Escape e quando a origem ou o destino muda.
- MPS04: `selectionchange` por toque no celular, layout em tela estreita, tema claro/escuro e
  internacionalização.
- MPS05: isolamento entre mesmo caminho com identity remota diferente; isolamento entre rascunho e
  task.

Essas semânticas foram aceitas; os novos E2Es de desktop permanecem em manual-review/pending, e a
promoção a caso oficial segue o processo de revisão humana.

## Registro de Validação (2026-09-04)

- 80 testes unitários de UI relevantes aprovados: incluindo origem/serialização/limite,
  `selectionchange` por toque, posicionamento em tela estreita, isolamento de rascunho e identity
  remota, mudanças de origem/destino e comportamento de fechamento, além da regressão das seleções
  de pré-visualização e de conversa já existentes.
- E2E de Desktop no macOS aprovado: abrir um arquivo Markdown real pela árvore de arquivos do projeto,
  selecionar texto, adicionar referência, preservar o rascunho, deduplicar e remover; mantendo
  rascunho do início ao fim, sem envio automático.
- Artefato do E2E: `desktop-e2e-20260904025826214-p12794-fec18ab46a7b3c1d`; `markdown-selection-tooltip.png`
  e `markdown-selection-composer.png` foram verificados (tema escuro).
- `pnpm typecheck` e `pnpm --filter @zcode/desktop typecheck:e2e` passaram; `pnpm lint` sem erros,
  com as 40 warnings já existentes do repo.
- Validações de ambiente ainda pendentes: long-press nativo em aparelho real, cadeia de attachment
  remoto real, Windows/Linux e inspeção visual no tema claro. Eventos em celular/tela estreita e
  isolamento de identidade têm testes unitários; os dois temas usam os tokens semânticos existentes, e
  os textos em chinês e inglês reaproveitam os existentes. Não houve mudança em host/runtime/protocolo.
- Os novos E2Es continuam como candidatos pending, sem promoção a caso oficial nem admissão no suite
  de Docker.

## Entrada pela Conversa Auxiliar

MPS06 (aceito): a seleção Markdown é roteada pelo workspaceKey + sessionId da tarefa principal atual
até o SessionPane principal já registrado, passando a referência Markdown. Reaproveitam-se as regras
de reaproveitamento do active child da seleção de mensagens, de criação de um novo quando não há
active child, de substituição de child inválido e de deduplicação de criação pendente; os rascunhos
principal e auxiliar são preservados, sem envio automático. Quando a tab Markdown está ativa
normalmente não há active child, e não se adivinha a tab auxiliar usada recentemente.

MPS07 (aceito): quando ainda não há sessão principal, em viewport somente leitura/no celular ou
quando o controlador principal não está pronto, a ação auxiliar é desabilitada com uma explicação
localizada; a ação de referência também é desabilitada quando a tarefa principal ou a conversa auxiliar
de destino tem uma interação bloqueante. O "Adicionar à tarefa atual" existente continua disponível. O
launcher sem referência continua forçando a criação de um novo e não é afetado pelo estado bloqueado
da ação de referência.

Revisão de merge de 2026-09-07: ao adaptar manualmente o SessionPane em `0ed79bae571`, os parâmetros
de referência e as marcações de bloqueio do callback registrado foram perdidos. MPS06/MPS07 foram
restaurados, sem restaurar o antigo Provider Store, a sincronização de Registry antes do envio nem a
troca em massa de modelo da conta. É obrigatório validar o callback registrado por um SessionPane
real, e não apenas testar o helper de Runtime; usar o E2E oficial de Markdown para verificar que o
input auxiliar realmente recebe a referência. A revisão suave do Workspace Hook não conta como
interação bloqueante.

```text
Markdown reference -> scoped registered main opener
  -> reference present: existing selection creation/reuse route
  -> no reference (existing launcher): force new child
  -> child composer references; never auto-send
```

Apenas se estende o parâmetro opcional de referência na entrada do controlador de renderer já
existente; não se adiciona protocolo nem estado de Host/CLI, e não se expande a fronteira da conversa
auxiliar no celular.

### Validação da Entrada Auxiliar (2026-09-04)

- 86 testes unitários relevantes aprovados, com nova cobertura de repasse da referência, roteamento
  preciso por workspace/parent, desabilitação quando não está pronto, bloqueio que rejeita apenas a
  ação de referência e compatibilidade do launcher sem referência.
- E2E de Desktop no macOS (replay case-local) aprovado; artefato
  `desktop-e2e-20260904031854602-p40021-80167b00527a3467`, com `markdown-side-conversation.png`
  verificado: o rascunho principal é preservado, o input da sessão auxiliar tem uma referência Markdown
  e o corpo vazio, sem envio automático.
- typecheck, E2E typecheck, lint e fixture check passaram; o lint continua com as 40 warnings já
  existentes. Os markers sem correspondência do fixture correspondem a asserções de rascunho não
  enviado/corpo de pré-visualização/resposta.
- A conversa auxiliar no celular segue a fronteira de indisponibilidade já existente; aparelho real,
  attachment remoto real, Windows/Linux e inspeção visual no tema claro continuam sem validação. Não
  há novo protocolo nem fila de runtime.

### Consistência Visual do Menu de Seleção (MPS08, aceito)

Markdown e fluxo de conversa reutilizam o mesmo menu de seleção: disposição horizontal, largura de
conteúdo adaptativa, separadores verticais, com fonte, espaçamento, tema, raio de canto e estilos de
hover/disabled unificados. Os limites do viewport são restringidos conforme a dimensão real do menu, e
em tela estreita a disposição horizontal é mantida, permitindo quebra de linha no texto dos botões.
Apenas a exibição e o posicionamento do menu são compartilhados; a origem da referência, o
roteamento e as condições de desabilitação da ação auxiliar permanecem inalterados.

Validação: estender o mesmo E2E pending, verificando os dois botões em linha, a adaptação do menu e
os limites do viewport; os caminhos existentes de adição e de referência auxiliar continuam em
regressão.

- 27 testes unitários relevantes, typecheck, E2E typecheck e E2E de Desktop no macOS aprovados; lint
  sem erros, continuam as 40 warnings já existentes.
- Artefato do E2E: `desktop-e2e-20260904033127818-p66016-259b1e7c9730d08e`;
  `markdown-selection-tooltip.png` foi verificado visualmente, com o menu em linha e acima da seleção.
  A ação auxiliar do rascunho continua desabilitada pelas regras originais.
- Aparelho real, Windows/Linux e inspeção visual no tema claro não foram complementados; segue o mesmo
  escopo de validações de ambiente pendentes acima. O E2E permanece pending.

### Textos dos Botões em Inglês

O fluxo de conversa e o Markdown Preview compartilham os textos em inglês: `Add to chat`,
`Add in side chat`. Reaproveita-se a mesma chave de internacionalização, ajustando apenas a exibição
em inglês; o chinês e o comportamento das ações não mudam.

### Preservação da Origem de Arquivo (MPS09, aceito)

A referência Markdown de arquivo carrega explicitamente um path opcional (caminho real, sem usar
workspaceIdentity ou sourceKey como substituto). Em item único exibe "Nome do arquivo · Referência";
com vários itens, quando há arquivos, exibe uma contagem genérica de referências; o detalhe mostra
cada caminho e sua seleção. Pré-visualizações de texto sem caminho permanecem only-text. O envio
continua reaproveitando o bloco de texto userselect, com item de arquivo `{path,text}` e item de
conversa `{text}`; o parser do histórico preserva strings path legais e não vazias, a compatibilidade
com text-only antigo e formatos legados é mantida, e estruturas ilegais não engolem o corpo.

```text
preview source.path -> reference.path -> userselect JSON -> history parser -> shared chip
```

Não há mudança em Host/protocolo/fila, e o链路 continuous de desktop e replayable de celular
permanece como está; o caminho é usado apenas como origem, e o escopo de workspace continua isolado
por identity. Chinês/inglês, truncamento em tela estreita e separadores de caminho do Windows precisam
ser compatíveis. MPS09 cobre o round-trip de teste unitário e os casos sem caminho/dados ilegais,
além da exibição do nome do arquivo no E2E pending existente para os casos principal e auxiliar.

Validação (2026-09-04): 35 testes unitários relevantes, typecheck, E2E typecheck, lint (as 40 warnings
já existentes) e E2E de Desktop no macOS aprovados. Artefato
`desktop-e2e-20260904034329498-p80782-46211801b16015b3`, com o rótulo de nome de arquivo verificado
visualmente e conferência de que o userselect capturado do provider contém de fato o path real e o
text da seleção; o E2E também faz asserção sobre os inputs principal e auxiliar e sobre o nome do
arquivo no histórico após o envio. Caminho ausente e caminho ilegal são cobertos por testes unitários.
Aparelho real, attachment remoto real, Windows/Linux e inspeção visual no tema claro não foram
complementados; o E2E continua pending.

Reforço da evidência de envio do MPS09: o E2E extrai o userselect JSON do texto de usuário da
requisição real do provider e faz a asserção precisa de que a referência única é igual a
`{path: filePath, text: marker}`, rejeitando ausência, path errado, alteração da seleção e campos
internos extras; não se considera aprovado apenas porque o nome do arquivo aparece na evidência
completa.

Validação da asserção precisa (2026-09-04): E2E de Desktop no macOS aprovado, artefato
`desktop-e2e-20260904040834255-p21311-c0e910d3b5a7b258`. A primeira execução falhou na entrada da
árvore de arquivos; o log mostrou que o botão de disparo por foco ainda não estava montado; o teste
passou a aguardar a montagem do React antes de clicar e a reexecução passou. typecheck, E2E typecheck,
fixture check e lint passaram (as 40 warnings já existentes). Não houve mudança em código de produto,
respostas de fixture ou status de admissão de casos oficiais.

### Promoção a Caso Oficial (2026-09-04)

Após a confirmação do usuário, a promoção foi feita com promote dry run/apply e auditoria de admissão
de cobertura, e o caminho oficial é
`packages/desktop/test/e2e/conversation-session/conversation-session-markdown-preview-selection.test.ts`.
O replay com common + case-local isolado passou
(`desktop-e2e-20260904042625480-p37746-25eba58058f16338`), e o replay padrão passou
(`desktop-e2e-20260904042658298-p39023-d345d8e8f357eb39`). fixture check, E2E typecheck, typecheck e
lint passaram, com o lint nas 40 warnings já existentes.

A auditoria de admissão encontrou inconsistências entre a ordem/descrição do manifesto e o fixture de
provider em assistant-preview-cards e hooks-lifecycle já existentes; elas foram sincronizadas
mecanicamente com o fixture de provider, sem alterar respostas ou comportamento de teste. Por pedido
do usuário o caso não foi incluído no conjunto de verificação de Docker e a admissão em Docker não foi
executada; o registro pending anterior é estado histórico e esta seção prevalece.