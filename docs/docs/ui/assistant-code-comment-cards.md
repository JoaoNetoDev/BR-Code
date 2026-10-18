# Cartões de Comentário de Código do Assistant

## Status

- Este documento é a especificação funcional de parsing, exibição e navegação somente leitura de Code Review para a saída `::code-comment{...}` do Assistant no ZCode Renderer.
- O recurso deriva apenas UI, sem novos estados de ZCode Protocol, session snapshot, relay, Host ou runtime do Agent.
- A capability é desativada por padrão; o workspace bridge do Desktop e do `/remote` no celular a habilita explicitamente, enquanto a entrada comum do Web Server permanece desligada. Quando desligada, mantém-se a exibição atual da directive original, evitando que o Renderer engula silenciosamente uma opinião de revisão já emitida pelo Agent.

## Resumo da Funcionalidade

| Campo | Conclusão |
| --- | --- |
| Camada de alteração | presentation, validation, commit-effect |
| Entrada | `::code-comment{...}` em rows de texto do Assistant já persistidos |
| Saída | texto de projeção no corpo + grupo de cartões de code review de linha única, local ao turno |
| Efeito do clique | abre diretamente o CodeViewer `code-review` com escopo de workspace, posiciona a linha e exibe o comentário do modelo em somente leitura com o estilo de comentário existente; não exige que o arquivo esteja em alteração do Git |
| Owner do rollout | capability de raiz do Renderer `assistantCodeCommentCardsEnabled`, padrão `false`; o workspace bridge do Desktop e do `/remote` no celular marca explicitamente `true` |
| Restauração | reconstrução determinística a partir do texto original do row, sem persistir estado de cartão independente |
| Fora de escopo | verificação de existência de arquivo na fase de geração do cartão, cota de 15→10 dos Assistant Preview Cards, rascunhos code-comment do Composer, snapshots de diff do Git e de diff histórico |

## Contrato da Directive

```text
::code-comment{title="[P1] 空指针风险" body="user 为空时仍会访问 user.id" file="src/user.ts" start=42 end=45 priority=1}
```

- Obrigatórios: `title`, `body`, `file`, que devem estar não vazios após trim.
- Opcionais: `start`, `end`, `priority`.
- `start` / `end` são inteiros positivos base 1; quando só há `start`, `end=start`; quando `end < start`, o intervalo de linhas não é preservado, mas o cartão de comentário ainda pode ser exibido e posicionar o arquivo.
- `priority` aceita apenas `0`, `1`, `2`, `3`; valores inválidos são rebaixados para sem prioridade, sem descartar o comentário inteiro.
- Outros argumentos sintaticamente corretos são temporariamente ignorados.
- Suporta aspas simples/duplas, escape de aspas e barra invertida, Unicode, espaços, letras de drive do Windows e caminhos UNC.
- Não gera cartão quando há erro de sintaxe da directive, quando falta um campo obrigatório, ou quando o row mais recente do Assistant entra em `failed`; as directives do turno inteiro com `failed` não são removidas do corpo, evitando que comentários do início sejam perdidos silenciosamente.
- Exemplos em fenced code, inline code e HTML code/pre não são tratados como directives reais.

## Projeção no Corpo e Atribuição dos Cartões

```text
raw assistant text rows
        |
        +--> projection per row --> visible Markdown（完整有效 directive 被删除）
        |
        `--> merge whole turn text --> comments[]
                                      |
                                      `--> latest terminal assistant text row
                                           complete / interrupted
```

- Com o rollout habilitado, a directive completa e válida não entra no Markdown do corpo: quando ocupa uma linha inteira, a linha é removida; quando é inline, é substituída por um espaço.
- Um `::code-comment{` não fechado no final do streaming é temporariamente ocultado do corpo; cartões só se formam nos estados terminais `complete` / `interrupted`. Row com `failed` e conteúdo ainda inválido no terminal voltam a ser corpo comum.
- A ocultação só ocorre quando o conteúdo não fechado ainda é um prefixo válido de argumentos; se a saída sem `}` já estiver seguida de corpo comum, se o formato dos argumentos estiver claramente corrompido, ou se o protocolo estiver dentro de um exemplo de código, o texto original é preservado, evitando que uma saída anormal do model engula a resposta seguinte.
- Os cartões ficam presos apenas à última row de texto do Assistant em estado terminal do mesmo turno: durante o streaming, mesmo que a directive já esteja fechada, apenas a projeção do corpo é atualizada e nenhum cartão é gerado antecipadamente; em `complete` / `interrupted` todos os cartões válidos são reconstruídos de uma vez. Cauda de streaming não fechada, `failed` e rows que não estão no fim do turno não são exibidos. Quando o fim do turno é `failed`, a projeção de directives do turno inteiro é desligada e o texto original é restaurado.
- Os cartões são ordenados pela ordem em que as directives aparecem no corpo, sem seguir a regra de ordem inversa dos Assistant Preview Cards.
- Colapsados por padrão; clicar na linha de título exibe todos os comentários de uma vez; no máximo 50 são projetados por turno e o excedente não é exibido.
- Não chama `fileChanges` nem `fileService.checkFilesExist`. O arquivo de destino só é lido pelo Preview Pane, após o clique, via o service de workspace atual.
- Cópia e busca na sessão usam somente o corpo visível, sem atingir nem copiar a sintaxe original de directives já ocultas; a primeira versão não adiciona à busca de texto completo da sessão o title/body que exista apenas nos cartões ou na área de comentários do Review.

## Semântica de Rollout

| Chave | Corpo | Cartões | Motivo |
| --- | --- | --- | --- |
| `false` (padrão) | mantém a directive original atual | não exibidos | compatibilidade com o Desktop Agent já iniciado, que ainda pode emitir directives, evitando que comentários sejam descartados silenciosamente |
| `true` | oculta directives completas e válidas; fragmentos de streaming não piscam | exibidos | usuários do rollout ganham experiência de revisão estruturada |

Se mais tarde for exigido “nunca exibir a directive original mesmo com a chave desligada”, a mesma chave de capability deverá controlar simultaneamente a exigência de saída de directives no contexto do Desktop; apenas ocultá-la no Renderer, sem controlar a saída do Agent, não é seguro.

O `/remote` no celular tem dois caminhos de montagem de workspace bridge, external relay e token/WebSocket, e ambos precisam ser habilitados explicitamente; o Web Server comum e a entrada home-only, que não hospeda corpo de sessão, permanecem desligados por padrão. A chave apenas controla a exibição derivada pelo Renderer do mesmo row persistente do Assistant, não entra no Host, no relay nem no snapshot, e não altera a semântica de restauração `web-remote-replayable`.

## Interface do Cartão

```text
┌──────────────────────────────────────────────┐
│  [>] 4 条评论                                  │
├──────────────────────────────────────────────┤
│              默认折叠，点击标题行展开          │
└──────────────────────────────────────────────┘
```

- O contêiner externo usa `bg-card border-border rounded-xl shadow-none`, igual ao cartão de status do Git; o hover do título usa `bg-hover`.
- No topo usa a contagem de comentários localizada (como `2 comments` / `2 条评论`), sem exibir mais os dois trechos separados “代码审查” e a contagem; mostra `>` por padrão e, ao clicar na linha de título, expande todos os comentários e muda para indicador para baixo.
- Cada cartão pode ocupar apenas uma linha: `priority → title → path:range`, sem seta à direita; títulos e caminhos muito longos são truncados no próprio trecho, e o caminho usa a fonte UI sans comum, não monoespaçada.
- A lista expandida usa `border-t border-border`; cada item é composta por uma base externa `bg-background/50` e uma linha clicável interna `hover:bg-hover/30`, mantendo a mesma relação de sobreposição de fundo das linhas de arquivo do Git. Não há divisores entre linhas.
- O cartão não exibe o `body` no corpo do Assistant, evitando misturar o corpo da revisão com respostas comuns; o `body` só aparece após abrir o CodeViewer `code-review`, com o estilo de comentário de código existente.
- O texto do cartão permite seleção explicitamente. Seleções de texto formadas por arrasto dentro do mesmo cartão não disparam navegação; clicar em área vazia, clique que não formou seleção e Enter/Space do teclado ainda abrem o Review.
- O title, o priority, o intervalo de linhas e o body do source `code-review` vêm todos deste source local ao Renderer; nesse caso o bloco de comentários do CodeViewer exibe apenas o intervalo de linhas e o body coerentes com o comentário do usuário, e title/priority continuam sendo expressos pelo cartão. Nada é gravado no Git, no session snapshot ou no comment store do Composer.
- P0-P3 usam badge de texto; a cor é apenas auxiliar e não pode ser a única fonte de informação.
- Se o title já começa com o mesmo `[P0]`…`[P3]`, o prefixo duplicado é removido na exibição, sem alterar os dados originais.
- A linha inteira é clicável e suporta Enter/Space do teclado; em telas estreitas de celular continua em linha única, mantendo uma lista de revisão compacta por truncamento em segmentos em vez de quebra de linha.
- Cartões são renderizados separados dos Assistant Preview Cards e não compartilham limite de quantidade, verificação de arquivo nem roteamento de clique.

## Source de Code Review e Máquina de Estados de Navegação

O clique produz um `CodeViewerSource` local ao Renderer; nenhum novo tipo de side-pane de primeiro nível é criado:

```ts
interface CodeReviewAnchor {
  requestId: string;
  title: string;
  body: string;
  priority?: 0 | 1 | 2 | 3;
  startLine?: number;
  endLine?: number;
}

interface CodeReviewCodeViewerSource extends CodeViewerWorkspaceScope {
  type: "code-review";
  title: string;
  path: string;
  review: CodeReviewAnchor;
}
```

```text
card click
  -> 构造 CodeReviewCodeViewerSource（path + workspace scope + review）
  -> openCodeViewerSidePane()
  -> Preview Pane 使用 workspace-scoped fileService.readTextFile()
  -> 合法行范围：复用 CodeViewer selectedLines + CommentAnnotation
  -> requestId 变化：滚动到目标行
  -> 无行号或越界：在代码区顶部展示同样的只读评论样式
```

- O caminho de arquivo da directive continua sendo resolvido pelo construtor do cartão como caminho absoluto dentro do workspace; `workspacePath` é usado para leitura e exibição do arquivo, e o isolamento de tab usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
- A tab key de `code-review` usa `workspaceKey + code-review + path`, sem incluir `requestId`: outro comentário do mesmo arquivo reaproveita a mesma tab e atualiza a âncora; tabs normais de `file` e tabs `code-review` permanecem separadas.
- Com números de linha válidos e intervalo dentro do arquivo: realça `startLine...endLine` e exibe o `CommentAnnotation` existente após a linha final; o comentário continua rolando junto com o código e, quando `requestId` muda, o scroll vertical é ajustado para deixar o comentário perto da borda inferior da área visível, mantendo a posição atual de scroll horizontal.
- Sem número de linha: abre o arquivo e exibe o mesmo bloco de comentário somente leitura no topo da área de código, sem forjar números de linha ou realce.
- Número de linha além da extensão do arquivo: ainda abre o arquivo e exibe o comentário no topo, sem forjar realce, e avisa que a linha de destino não existe.
- Arquivo inexistente: reutiliza o erro de leitura com escopo de workspace do Preview Pane; não atualiza o Git nem recorre ao Git Review.
- Markdown/HTML são exibidos como código-fonte no modo `code-review`; arquivos binary/too-large mantêm o estado de erro já existente no Preview Pane.
- O comentário do model é passado ao CodeViewer apenas como dado temporário de somente leitura dentro do source; não lê nem escreve `useCodeCommentPreviewStore`, e não oferece gutter, seleção de caixa, nem interação de adicionar ou remover comentários.
- O Desktop local/remote e o `/remote` no celular compartilham o side pane / overlay de code-viewer existente; as duas Roots de workspace bridge do celular, assim como o Desktop, habilitam a capability explicitamente. O remote usa o `workspaceIdentity` e o `workspaceRemoteSessionId` carregados no source para escolher o service de workspace correto, sem alterar os estados de delivery/replayable. A entrada comum do Web Server continua usando o valor padrão `false` da capability.

## Matriz de Superfície de UI

| Cenário | Entrada de UI | Owner de exibição | gating | Clique/envio | Estado autoritativo | Limite de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Corpo do Assistant | `AssistantTextRowView` / `MessageResponse` | projeção pura do row original | feature flag + validade da directive | nenhum | texto do row da sessão | desktop continuous e mobile replayable reconstroem com as mesmas regras | não modifica row/snapshot |
| Cartão de revisão | `AssistantCodeCommentCards` | model derivado local ao turno | row terminal mais recente (complete / interrupted), limite de 50 | abrir `CodeReviewCodeViewerSource` | sem persistência independente | no celular usa o overlay de side pane já existente | não ocupa cota de preview de arquivo, não escreve no Composer store |
| Code Review somente leitura | `PreviewPane` / `CodeViewer` / `CommentAnnotation` | source.review + conteúdo do arquivo do workspace | escopo de workspace + leitura de arquivo; intervalo de linhas julgado pelo conteúdo real | reaproveita tab de code-viewer, atualiza a âncora e rola | File Service com escopo de workspace | serviços local/remote injetados são diferentes, a semântica de UI é a mesma | não lê/grava Git, não cria comentários no Composer, não troca de workspace |

## Resumo de Impacto

| Rank | Relação | Conclusão |
| --- | --- | --- |
| must-inspect | rows brutos do Assistant -> projeção Markdown | a remoção de directives não pode quebrar GFM, tolerância a streaming, cópia e busca |
| must-inspect | projeção do turno -> cartões code-comment | exibição na row terminal mais recente; durante o streaming apenas oculta a cauda não fechada; cold resume reconstrói de forma determinística |
| must-inspect | clique no cartão -> source de Code Review | source key, workspace service, adaptação do comentário somente leitura e posicionamento da linha pertencem à mesma transação de navegação |
| should-inspect | prompt de contexto do Desktop | com o rollout desligado ainda pode emitir directives, que não podem ser removidas silenciosamente |
| conditional | remote/mobile | reaproveita o File Service com escopo de workspace e o overlay de code-viewer existente, sem alterar a restauração replayable |
| invariant-only | comentários de código do Composer | store/evento de comentários do usuário ao Agent não são reutilizados nem modificados |
| invariant-only | Assistant Preview Cards | não chama fileChanges/stat, não compartilha a cota 15→10; o arquivo alvo só é lido após o clique em code-comment |

O ambiente de ferramentas atual não tem codegraph, então a análise de impacto usa declarações do feature graph, chamadores exatos de código e testes focados como evidência; após a implementação, atualizar os code seeds do grafo e rodar a validação completa do grafo.

## Casos e Podas

| ID | Setup | Action | Assertions | Status |
| --- | --- | --- | --- | --- |
| ACC01 | chave ligada, turno complete com duas directives válidas | renderizar e selecionar o texto do cartão | corpo sem sintaxe original; cartões exibidos em ordem, em linha única, com priority/title/path/range, sem body; texto selecionável e a seleção não dispara navegação | accepted |
| ACC02 | arquivo alvo e intervalo de linhas válidos existem no workspace | clicar no cartão | abre o CodeViewer `code-review`, realça e rola até o intervalo alvo; exibe o body em somente leitura com o estilo de comentário existente; sem interação de adicionar/remover e sem escrita no Composer store | accepted |
| ACC03 | chave desligada | renderizar o mesmo texto | nenhum cartão exibido, a directive original permanece como está | accepted |
| ACC04 | streaming pela metade, directive fechada, complete, interrupted, failed | avançar o estado | fragmento de streaming não pisca; sem cartão durante o streaming; cartão só em complete/interrupted; turno failed e estado terminal inválido restauram o corpo | accepted |
| ACC05 | turno histórico já persistido | cold resume/remontagem de linha virtual | reconstrói o mesmo corpo e cartões a partir do texto do row, sem novos RPC | accepted |
| ACC06 | arquivo sem alteração no Git, sem número de linha, linha fora da faixa, arquivo inexistente, ou múltiplos comentários no mesmo arquivo | clicar | o estado do Git não afeta a abertura; sem número de linha/fora da faixa o comentário somente leitura aparece no topo e a fora da faixa há aviso; arquivo ausente mostra erro de leitura; o mesmo arquivo reaproveita a tab code-review e atualiza a âncora, sem trocar de workspace | accepted |
| ACC07 | Desktop Host já persistiu turno terminal com directive válida, celular faz hydration via external relay ou bridge `/remote` por token/WebSocket e alterna entre workspace local/remote | ver o mesmo turno e clicar no cartão | ambas as Roots de bridge do celular ligam a capability; o corpo não vaza a directive original e os cartões são deterministicamente iguais aos do Desktop; após trocar de workspace a capability continua ligada e a navegação preserva `workspaceIdentity` / `remoteSessionId`; a entrada comum do Web Server continua desligada | accepted |

Podas: a primeira versão não faz diff do Git nem snapshot de diff histórico; não faz o produto cartesiano de desktop/web/mobile com todas as combinações de priority/path/source; caminhos Windows/UNC são cobertos por testes focados e o local do Desktop serve de representante da primeira janela E2E. O fixture E2E só precisa preparar arquivos de código de workspace que existam/não existam de fato, sem exigir alteração do Git e sem falsificar a verificação de existência de arquivo na fase de geração do cartão.

## Principais Arquivos de Implementação

- `packages/ui/src/lib/assistantDirectiveParser.ts`
- `packages/ui/src/lib/assistantCodeComment.ts`
- `packages/ui/src/AssistantCodeCommentFeatureProvider.tsx`
- `packages/ui/src/AssistantCodeCommentCards.tsx`
- `packages/ui/src/lib/codeViewer.ts`
- `packages/ui/src/lib/workspaceSidePane.ts`
- `packages/ui/src/PreviewPane.tsx`
- `packages/ui/src/previewPaneCodeReview.ts`
- `packages/ui/src/previewPaneContent.tsx`
- `packages/ui/src/previewPaneCodeContent.tsx`
- `packages/ui/src/components/ui/code-viewer.tsx`
- `packages/ui/src/v4/ConversationRowView.tsx`
- `packages/ui/src/v4/ConversationTurnGroup.tsx`
- `packages/ui/src/v4/conversationRowContext.ts`
- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/App.tsx` e a remoção do wiring antigo de callback de navegação Git no app-shell
