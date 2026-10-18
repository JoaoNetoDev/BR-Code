# Limite Desktop do Root Startup Render Block

## Contexto

`isStartupRenderBlocked` é a proteção de inicialização do desktop: depois que o React assume o root, ele aguarda a restauração das tabs, a injeção do workspace inicial ou a definição do estado de autenticação antes de exibir a interface oficial. O controle remoto web do celular entra pelo caminho de shared-host attachment, e a página de carregamento de pareamento já cobre o processo de estabelecer a workspace bridge; ao entrar no `Root`, não se deve mais usar o ramo de bloqueio de inicialização do desktop.

## Design

- Usar `RootProps.isDesktop` como única fronteira de plataforma em execução.
- `Root.tsx` só chama `shouldBlockRootRender(...)` e entra no ramo `isStartupRenderBlocked` quando `isDesktop === true`.
- O lado Web e o controle remoto web do celular não usam `isStartupRenderBlocked`.
- Depois que o controle remoto web do celular entra no `Root`, se a tab inicial do workspace ainda não tiver sido injetada pelo effect, o `Root` usa o `initialWorkspaceLoadingFallback` passado pela entrada Web para continuar exibindo a mesma página "pareado, carregando o workspace..." até que `workspaceShellPath` apareça.
- O desktop e a entrada comum do Web server não passam `initialWorkspaceLoadingFallback` e não são afetados pela página de transição do celular.
- `RootStartupLoading` mantém a responsabilidade de casca de inicialização do desktop, sem introduzir verificação de viewport ou de user agent.

## Verificação

- Novo teste SSR do Root cobrindo a renderização de `data-testid="root-startup-loading"` quando a inicialização do desktop é bloqueada.
- Novo teste SSR do Root cobrindo que o lado Web não chama `shouldBlockRootRender(...)`.
- Novo teste SSR do Root cobrindo a renderização do loading fallback passado antes da injeção do workspace inicial no controle remoto web do celular.
- Executar `pnpm typecheck` e `pnpm lint`.