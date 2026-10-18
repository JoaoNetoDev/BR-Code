# Convergência da superfície de settings do CUA (desativação do estado do helper e das flags experimentais)

- Data: 2026-08-17
- Status: implementado (acompanhando o MR z-code!2068)
- Escopo: apenas as superfícies relacionadas ao CUA; não toca em settings não-CUA nem em outras áreas de funcionalidade

## Contexto

O design de isolamento de instâncias do Helper de 2026-08-15 (zcode-cua `docs/refactor-port-specs/CUA-HELPER-INSTANCE-ISOLATION-PLAN.md`, passo 7)
expôs estado/takeover/stop do controller ao serviço de permissões e renderizou duas UI no desktop:

1. a linha Input controller da seção «电脑控制» (Controle do Computador) da página de settings (badge de owner + botões Take control/Stop);
2. a cápsula de status permanente `CuaControllerStatusControl` na barra de título do workspace.

Além disso, a página de settings passou a ter três flags de inicialização do Helper (Agent pointer feedback / Picture-in-Picture /
Background mode). A conclusão da revisão de produto foi que essas superfícies são redundantes:

- O estado de execução do Helper não tem valor operacional para o usuário (o onboarding de permissões já tem sua própria linha de estado, e a autocorreção de falhas passa pela cadeia de restart);
- O lease do controller é um mecanismo de arbitragem de segurança do lado do Helper, que já entra em vigor automaticamente; o usuário não precisa fazer take/stop manual;
- O Agent pointer feedback e o picture-in-picture já vêm ligadas por padrão e não existe cenário de produto em que o usuário precise desligá-los;
- O Background mode (AX-only, sem roubar o foco) não combina com o modelo de interação atual e deixa de ser oferecido.

## Comportamento desejado

### Página de settings (convergência igual em macOS e Windows)

A seção «电脑控制» mantém apenas:

1. o switch principal (enablement do plugin zcode-cua, ligado a MCP + skill);
2. as duas linhas de permissão do macOS, Accessibility / Screen Recording (com o onboarding via Grant, e o restart do Helper quando estiver stale com o fallback de reiniciar o ZCode — mantida a cadeia de recuperação atual, sem impacto desta mudança).

Quando não há autorização, a ordem das ações à direita da linha de permissão é sempre `[botão Open…] [badge de estado]`; botão e estado pertencem
à mesma área de controle, e o botão Open deixa de ficar na área de detalhes abaixo da linha. As ações de restart do Helper/ZCode quando stale
continuam na área de detalhes, mas sem renderizar novamente o botão Open.
Esse layout largo de controle é usado apenas nas linhas de permissão do Computer Use: em tela larga usa-se uma coluna de ações de 280px, com botão e estado sem quebra de linha;
em tela estreita passa-se a uma única coluna, com a área de controle inteira abaixo da descrição. Os demais `SettingsRow` continuam usando uma coluna de ações de 192px.
A ação Open reaproveita a visual do botão «abrir autorização» do MCP: tamanho `link`, estado de link azul, ícone ExternalLink;
em telas pequenas permanece apenas o ícone, mas a operação continua exposta por completo via `aria-label` / `title`.

Linhas removidas: linha de estado de execução do Helper (versão/caminho/badge Running/ícone de restart), linha Input controller,
linha Agent pointer feedback, linha Picture-in-Picture e linha Background mode.

### Barra de título

Remover `CuaControllerStatusControl` e sua integração (`showCuaControllerStatus`) em `WorkspaceHeader` /
`WorkspaceHeaderActionSection`. A barra de título não exibe mais nenhum
estado de CUA.

### Valores padrão em runtime (não mais configuráveis)

| Capacidade                                  | Antes                           | Agora                                              |
| ------------------------------------- | ------------------------------ | --------------------------------------------------- |
| Agent pointer overlay (ghost cursor) | `cuaGhostCursorEnabled` ligado por padrão | Sempre ligado (product factory do producer fixa true) |
| Float do Picture-in-Picture               | `cuaPipMode` ligado por padrão  | Sempre ligado (product factory do producer fixa true) |
| Background mode (sem roubar o foco)          | `cuaBackgroundMode` desligado por padrão | Removido (o host não passa mais esse parâmetro de inicialização) |

### Armazenamento de settings

As três chaves `AppSettings.cuaGhostCursorEnabled` / `cuaPipMode` / `cuaBackgroundMode` são removidas de
`packages/shared/src/protocol.ts` e de `validationAppSettings.ts` (schema completo e de patch).
As chaves antigas na configuração de usuários existentes são ignoradas naturalmente pela semântica de strip do zod, sem migração.

## Limites (o que fica explicitamente fora)

- **O lease do controller em si é mantido**: a arbitragem de lease em nível de usuário no Helper do zcode-cua (coexistência de múltiplas instâncias,
  apenas o owner pode despachar efeitos colaterais e overlay) é um mecanismo de segurança; esta mudança remove apenas a UI manual do desktop.
- **A facade de controller do desktop foi aposentada**: o producer 0.5.7 já removeu
  `takeController/stopController/getHelperStatus` de `ICuaPermissionService`, e o z-code removeu em sincronia a implementação sem chamadas. O protocolo
  de controller do broker em nível bruto, o lease/admission e a mecânica interna de takeover explícito do Helper não são afetados.
- O fluxo de onboarding de permissões (onboarding, restauração após o retorno da autorização, verificação de stale, fallback de reiniciar o ZCode) tem comportamento inalterado;
  a superfície de serviço `restartHelper` / `getStatus` não muda.

## Lista de superfícies afetadas

- UI: `packages/ui/src/CuaControllerStatusControl.tsx` (remover),
  `WorkspaceHeader*.tsx/shared.ts` (remover a integração), `settings/ComputerUseSection.tsx` (remover linhas e remover o
  polling de heartbeat do helper), chaves de i18n `settings.computerUse.controller*/pipMode*/backgroundMode*/
  ghostCursor*/helper{Label,Running,NotRunning}` (remoção sincronizada em zh/en).
- Protocolo/validação: remoção das três chaves de `AppSettings`.
- services: product factory do producer fixa ghost cursor/PiP=true e `node.ts` deixa de passar o getter pseudo-dinâmico;
  remoção da facade de consulta/comando de controller do desktop, preservando o limite de segurança do controller do broker em nível bruto.
- Testes: remover `cuaControllerStatusControl.test.ts`; reescrever
  `computerUseWindowsSettings.test.ts` (afirmando o conjunto de linhas convergido),
  `computerUseNoAutoPermissionModal.test.ts`, `workspaceHeader.test.ts` e
  `appSettings.test.ts`; `cuaGhostCursorSettingsWiring.test.ts` passa a fixar a integração de «sempre ligado».

## Verificação

- `pnpm vitest run` (suítes de CUA em ui/shared/services)
- `pnpm typecheck`, `pnpm lint`
- Os três gates de integridade (skill-sync / version-coherence) permanecem verdes sobre a base do merge