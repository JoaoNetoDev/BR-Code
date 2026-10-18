# Side Pane Terminal Tabs

## Contexto

O Workspace agora tem um painel Terminal na parte inferior e também tabs de side pane à direita. Os usuários querem
criar um Terminal tab diretamente no menu `+` do side pane, para que o terminal possa permanecer lado a lado com
Browser, Review, Code Viewer e outros conteúdos no contêiner de tabs à direita.

## Definição de comportamento

- o side pane ganha um novo tipo de tab `terminal`.
- cada clique em Terminal no menu `+` cria um novo Terminal tab do side pane, sem reutilizar um singleton.
- o Terminal tab externo do side pane é nomeado conforme o nome do workspace atual:
  - primeiro: `workspace-name`
  - segundo: `workspace-name 2`
  - terceiro: `workspace-name 3`
- o nome do workspace vem do último diretório do caminho atual do workspace; se não for possível resolver, o fallback é
  `Terminal`.
- cada Terminal tab do side pane corresponde a uma instância de terminal independente; não há terminal tabs aninhados
  internamente nem um botão de criação de terminal de segundo nível.
- o Terminal tab do side pane reaproveita as capacidades de `TerminalSession` subjacentes, mantendo suporte a tema xterm,
  abertura de links e comportamentos de copiar/colar.
- o painel Terminal inferior mantém o comportamento original e não compartilha o estado da sessão de terminal com o
  Terminal tab do side pane.
- fechar um Terminal tab do side pane descarta o `TerminalSession` interno daquele tab e libera o processo de terminal
  correspondente; trocar para outro tab do side pane ou recolher o side pane mantém tudo montado, sem interromper
  comandos em execução.

## Limites de compatibilidade

- a nomeação no nível do workspace continua usando o caminho atual do workspace; o isolamento entre serviços
  remotos/locais continua sendo carregado pelos services da janela atual e pelo contexto `workspaceIdentity`.
- o workspace remoto continua criando terminais pelos services da janela atual e pelo `workspacePath`, sem novos runtimes
  de Agent independentes, local host ou sessões SSH/WSL/Docker.
- essa funcionalidade altera apenas o local de exibição na UI; não modifica o fluxo de mensagens realtime de
  session/task do ZCode nem envolve os limites de transporte `desktop-continuous` e `web-remote-replayable`.
- o controle remoto Web no celular reaproveita o caminho de renderização de overlay de side pane existente; o Terminal tab
  não altera a semântica de restauração replayable.

## Pontos de entrada da implementação

- `packages/ui/src/lib/workspaceSidePane.ts`: novo tipo de estado `TerminalSidePaneTab` e função de criação.
- `packages/ui/src/hooks/useAppPanels.ts`: novo handler para abrir um Terminal tab do side pane, gerando um título único
  a partir do nome do workspace.
- `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`: integração do Terminal de instância única no menu `+` e na área
  de conteúdo dos tabs.
- `packages/ui/src/SidePaneTerminalPane.tsx`: hospeda um único `TerminalSession` sem tabs embutidas.
- `packages/ui/src/app-shell/SidePaneTabTrigger.tsx` / `SidePaneTabOverview.tsx`: título, ícone e rótulo de busca
  adicionais.
