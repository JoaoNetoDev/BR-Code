# Posicionamento do Localizar no Chat

A caixa de busca dentro da task aberta por `Cmd/Ctrl+F` pertence à área de chat atual, e não aos controles globais da barra de título da janela.

A caixa de busca deve ser renderizada dentro dos limites visuais do painel de conversa do workspace, acima do conteúdo do chat e centralizada horizontalmente. No desktop ela é montada diretamente no painel de conversa; no Web remoto do celular, via o slot de overlay de chat do shell, de modo que a camada flutuante continue acompanhando a área de conteúdo do chat sem se tornar descendente do DOM do corpo do chat. Assim, no desktop ela continua seguindo a coluna do chat mesmo com a barra lateral expandida, o side pane de Git/Browser e o terminal dividido, e no celular não ocupa a navegação global nem a área de botões da janela.

O estado da busca continua sendo mantido de forma unificada por `App`, que ainda alimenta o realce do corpo do chat e o realce de alterações de arquivo. `TaskFindDialog` responde apenas pela entrada, troca de escopo e navegação entre resultados; não acrescenta estado de runtime cross-plataforma nem altera a cadeia de mensagens de desktop continuous e web remote replayable.

Os botões de ícone dentro da caixa de busca devem fornecer tooltip. Os botões de navegação de resultados devem mostrar tooltip mesmo quando desabilitados por ausência de resultados, evitando que controles puramente icônicos tenham significado invisível. O tooltip do botão de troca do escopo de busca usa o texto fixo “切换搜索范围会话/文件”, enquanto o `aria-label` do próprio botão continua expressando o escopo para o qual o próximo clique vai trocar.

## Hierarquia da gaveta de overlay no Web do celular

Quando o Web no celular abre o side pane de Git/Browser, a gaveta em overlay define a superfície de chat subjacente como `inert` e `aria-hidden`. Esse isolamento é um limite de segurança já existente que impede que controles sob o overlay, como o composer e o seletor de modelo, continuem respondendo a cliques; ele não deve ser removido nem afrouxado por causa da funcionalidade de busca.

`TaskFindDialog` deve ser hospedado pelo slot `chatOverlay` próprio do `WebRemoteControlMobileShell`. Esse slot está no mesmo nível da superfície de chat e do overlay do side pane, não herda o `inert` / `aria-hidden` da superfície de chat e usa um nível superior ao da máscara da gaveta. Depois de trocar para o escopo de alterações de arquivo, o campo de entrada, o botão de anterior/seguinte, a troca de escopo e o botão de fechar precisam continuar focalizáveis e clicáveis; ao voltar para o escopo de conversas, a mesma instância do componente e o estado local de query/scope são reaproveitados, sem provocar remontagem por mover o componente entre a árvore do chat e a árvore da gaveta.

As seguintes abordagens não são adotadas:

- Remover o `inert` da superfície de chat: isso restauraria a passagem de cliques através do overlay e quebraria o isolamento de interação móvel já existente.
- Migrar o componente entre a árvore do chat e a árvore do side pane conforme o escopo de busca: isso introduziria externalização de scope e remontagem do componente, aumentando o risco de perda de query, foco e versão de navegação.

A regressão de DOM no mobile precisa provar que o overlay de busca está fora da superfície de chat `inert` e que, depois de abrir o side pane, os controles interativos continuam presentes. O E2E pendente do desktop continua provando que sessão real / rolagem do Git é recentralizada; enquanto não houver infraestrutura E2E mobile replayable separada, o caso de desktop não deve ser descrito como prova end-to-end no celular.

## Prioridade do Escape

O posicionamento no chat usa um listener na fase de bubble da window para completar a semântica de fechamento por Escape. O listener precisa checar primeiro `event.defaultPrevented`: quando uma camada flutuante aninhada ativa ou um controle já consumiu o Escape, a caixa de busca permanece aberta; somente um Escape não tratado faz a caixa de busca chamar `preventDefault()` e fechar. Os testes devem cobrir os dois caminhos, tratado e não tratado.

## Semântica de navegação entre resultados

O estado da busca precisa distinguir “qual hit está atualmente selecionado” de “o usuário iniciou uma nova navegação”. O termo de busca e o índice do hit descrevem a seleção atual; uma versão de requisição de navegação independente e monotonicamente crescente descreve se o usuário pediu uma nova localização. Não se pode decidir apenas por `(query, activeIndex)` se é necessário rolar, pois, com um único hit, anterior, próximo, `Enter` e `Shift+Enter` dão a volta e chegam ao mesmo índice.

Os pontos de entrada a seguir devem adotar a mesma semântica:

- Clicar no resultado anterior ou no seguinte.
- Pressionar `ArrowUp`, `ArrowDown`, `Enter` ou `Shift+Enter` no campo de busca.
- Os dois escopos de busca: corpo da conversa e alterações de arquivo.

Quando o usuário rola para longe do hit atual, qualquer ponto de entrada de navegação de resultados deve rolar esse hit novamente para o centro da viewport, mesmo que o índice alvo não tenha mudado. Com múltiplos hits, a troca continua seguindo a ordem circular já existente; com zero hits, os botões e a navegação por teclado permanecem desabilitados e não geram nova versão de requisição de navegação.

A versão de requisição de navegação pertence apenas ao estado de UI local do renderer; não entra em session/task runtime, protocolo, snapshot, filas ou persistência. O corpo da conversa e as alterações de arquivo mantêm versões independentes cada um, evitando que a troca de escopo dispare rolagem mútua. O hook de realce de texto continua com a deduplicação de mutações do DOM, mas uma nova versão de navegação do usuário precisa ultrapassar a deduplicação de rolagem do mesmo `(query, activeIndex, matchCount)`.

O desktop e o Web no celular reutilizam o mesmo `TaskFindDialog` e o mesmo hook de realce, portanto a semântica de interação permanece consistente; esta mudança não toca nos limites de recuperação de mensagens de `desktop-continuous` e `web-remote-replayable`.