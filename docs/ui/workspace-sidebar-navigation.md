# Navegação da barra lateral de workspace

## Objetivo

- A barra lateral exibe todos os workspaces abertos, apresentados como um menu de segundo nível `workspace -> task`.
- Nova task, menu `File > New task` e `Cmd/Ctrl+N` convergem todos para o "último workspace active".
- Abrir workspace, menu `File > Open Workspace` e `Cmd/Ctrl+O` convergem todos para a ação de abertura de workspace no nível raiz.

## Design de estado

- `packages/ui/src/store/tabStore.ts`
  - Persiste a ordem dos workspaces abertos na janela (`workspaceTabs`), usada para restauração de sessão e desduplicação entre janelas.
  - `activeWorkspacePath` representa o workspace atual ou o último ativado.
  - Abrir workspace não alterna mais para uma página intermediária independente; menu, atalhos e entradas da barra lateral executam diretamente a ação de abertura no nível raiz.

## Restrições de interação

- O topo da página inicial da barra lateral oferece atalhos "Automações" e "Plugins"; "Plugins" fica sempre fixo abaixo de "Automações", usando o ícone de quebra-cabeça consistente com a página de configurações, e ao clicar abre a página de configurações posicionada na seção `plugins`. O `/remote` do mobile não hospeda Automations e mantém apenas a entrada "Plugins".
- A barra lateral esquerda exibe todos os workspaces abertos, com a lista de tasks expandida por padrão.
- Para cada workspace expandido, a primeira tela da lista de tasks comuns exibe apenas 5 itens; ao clicar em "Mostrar mais" apenas o próximo lote de 5 é adicionado, e a entrada é ocultada depois que todas as tasks ficarem visíveis — não há "Mostrar menos".
- O progresso de paginação é estado temporário local do renderer, isolado por `workspaceKey = workspaceIdentity?.trim() || workspacePath`; carregar mais em um workspace não pode alterar a quantidade visível de outro workspace.
- O progresso de paginação correspondente é limpo ao recolher um workspace individual, recolher a área de projetos, recolher tudo, sair da visão de workspace ou remover o workspace; ao expandir novamente, começa do padrão de 5 itens. Apenas alternar a ordenação created/updated não reseta a quantidade atualmente visível.
- "Fixados", "Projetos" e "Tasks" são títulos de groupings do mesmo nível na barra lateral e usam uniformemente `text-ui-base + font-medium + text-foreground-subtlest`; o tamanho da fonte do título não muda conforme seja ou não recolhível ou arrastável.
- Clicar na linha do workspace funciona como trigger para alternar a expansão/recolhimento da lista de tasks daquele workspace e sincronamente o define como o workspace active atual.
- O botão "Nova task" e o atalho tentam primeiro voltar a `activeWorkspacePath` e então entram no estado de rascunho.
- À direita do botão "Nova task" da barra lateral é exibida a dica de atalho da plataforma atual: `Cmd+N` no macOS, `Ctrl+N` no Windows / Linux.
- No desktop, `Cmd/Ctrl+O` envia o evento de plataforma `OpenWorkspace` pelo accelerator do menu nativo; na Web, um `keydown` fallback no nível raiz intercepta o comportamento padrão de abertura de arquivos do navegador.
- Se não houver nenhum workspace no momento, o Root cria um workspace padrão como fallback, evitando entrar em uma página em branco ou na página intermediária de abertura de workspace.
- `SettingsPage` oferece a entrada "Voltar ao workspace" quando existe um workspace active recente.

## Regras de ordenação

- As subseções de segundo nível "Projetos / Tasks" são ordenadas por drag com um manípulo dedicado, e a ordem é persistida junto com o estado de expansão de cada uma no storage local do renderer `zcode-sidebar-purpose-section-preferences`; a ordem padrão é "Projetos → Tasks".
- A lista de workspaces da esquerda suporta ordenação por drag, reutilizando a subsequência de `workspaceTabs` do `tabStore`.
- Depois que o drag do workspace começa, apenas a lista de tasks do item arrastado é temporariamente recolhida, e o cabeçalho do projeto é exibido por um drag overlay independente; após o drop ou cancel, a semântica de expansão anterior ao drag é restaurada. O recolhimento temporário é um derivado local do renderer durante o drag e não é gravado em `expandedWorkspacePaths` nem no `localStorage`.
- A distância fixa de cedência entre irmãos na ordenação de projetos é calculada pela geometria totalmente recolhida: linha de projeto `32px` mais espaçamento de projeto `8px`, cedência de `40px`; não se deve usar a altura da linha inteira com a lista de tasks expandida, pois ao arrastar para cima o projeto acima seria primeiro empurrado para a posição antiga e depois saltaria de volta.
- Itens de task dentro da seção de projetos podem ser adicionados via drag nativo ao Workbench / split view, mas não participam da ordenação de tasks dentro do projeto; o ponto de entrada do drag da ordenação de projetos continua restrito ao cabeçalho do projeto. O drag preview nativo preserva o conteúdo original do item de task, reutilizando apenas o fundo, a borda e a sombra do Grouped task drag overlay.
- O drag overlay de workspace preserva o fundo, a borda, a sombra, o texto e o estilo de ponteiro do overlay de drag agrupado do Grouped; suas dimensões são alinhadas ao botão da lista de projetos em `h-8 px-2.5 gap-2`, e o ícone do preview é unificado via `[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0`.
- A posição de drop do workspace é pré-visualizada conforme a subsequência de projetos atualmente visível, mas na submissão os ids de projeto devem ser mapeados de volta para o índice global de `workspaceTabs`, para que filtros como o workspace de conversation não alterem o destino.
- Um workspace recém-aberto é inserido por padrão no topo da lista, facilitando o retorno prioritário ao projeto aberto mais recentemente.
- O estado de expansão/recolhimento do workspace é adicionalmente persistido por `workspacePath -> expanded` no `localStorage`, de modo que, ao restaurar o mesmo conjunto de workspaces, o estado dos toggles da barra lateral da última vez seja reutilizado.
- As `task` da esquerda suportam ordenação por drag, e o escopo da ordenação é limitado ao interior do workspace atual, sem permitir arrastar entre workspaces.
- A ordem das tasks é persistida por workspace no armazenamento local; tasks novas, que ainda não foram ordenadas manualmente, aparecem antes do histórico de ordenação manual, evitando serem soterradas pela ordem antiga.

## Aceitação da paginação de tasks do workspace

| Case      | Setup                       | Action                     | Assertion                                    | Status   |
| --------- | --------------------------- | -------------------------- | -------------------------------------------- | -------- |
| `WSTP-01` | workspace tem 0–5 tasks comuns | Expandir o workspace        | Exibe todas as tasks existentes, sem "Mostrar mais" | accepted |
| `WSTP-02` | workspace tem 6 tasks comuns  | Expandir e clicar uma vez em "Mostrar mais" | O visível passa de 5 para 6 e a entrada some | accepted |
| `WSTP-03` | workspace tem 12 tasks comuns | Clicar em "Mostrar mais" repetidamente | O visível incrementa `5 → 10 → 12` e por fim a entrada some | accepted |
| `WSTP-04` | workspaces A/B têm mais de 5 | Clicar em "Mostrar mais" apenas em A | A ganha 5 itens, B mantém o padrão de 5      | accepted |
| `WSTP-05` | workspace já exibe mais de 5  | Recolher por qualquer caminho e expandir de novo | Volta ao padrão de 5                    | accepted |
| `WSDR-01` | workspace A expandido, B expandido | Iniciar o drag de A      | Apenas A é temporariamente recolhido; B continua expandido; o overlay não contém tasks | accepted |
| `WSDR-02` | workspace A expandido       | Arrastar A e soltar             | Ordem submetida; A volta a expandido; a preferência de expansão não foi sobrescrita temporariamente | accepted |
| `WSDR-03` | workspace A expandido       | Arrastar A e cancelar          | A ordem não muda; A volta a expandido         | accepted |
| `WSDR-04` | workspace A originalmente recolhido | Arrastar A e finalizar | A permanece sempre recolhido                  | accepted |

Timeline, fixados, arquivamento, agrupamento e o índice de tasks independentes do controle remoto Web não reutilizam este estado de paginação e pertencem ao escopo podado (pruned) desta alteração; esta alteração não modifica os fluxos de dados de conversation, desktop continuous nem mobile replayable.