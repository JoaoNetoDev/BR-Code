# Novidades no Menu de Ajuda

- O menu de Ajuda do Desktop ganhou a entrada `What's New` / `更新日志`.
- O link é roteado pelo processo principal de forma unificada conforme o idioma atual do aplicativo: `zh-CN` abre `https://zcode.z.ai/cn/changelog` e os demais idiomas abrem `https://zcode.z.ai/en/changelog`.
- O texto do menu vem de `packages/shared/src/desktopMenu.ts` e o comportamento de clique vem de `DesktopCommandIds.OpenChangelog -> desktopCommandHandlers.openChangelog`, evitando que as regras de URL fiquem espalhadas pelo template do menu.

## Menu de interrogação em Workspace / Settings

- O header do Workspace, o header de nova task e a página de Settings compartilham o mesmo componente de menu de interrogação.
- O menu de interrogação concentra uniformemente as ações de ajuda de alta frequência: reportar problema, solicitar uma funcionalidade ao produto, comunidade de usuários, documentação do produto e exportar logs.
- A exportação de logs não acessa a API do Electron diretamente na camada de UI e continua passando por `IPlatformService.exportLogs()` e pelo estado unificado de toast, garantindo a consistência da fronteira de fallback entre Desktop / Web.
- A página de Settings coloca a entrada de interrogação no topo do painel de conteúdo à direita e reutiliza o deslocamento de desvio dos botões de janela da nova task, evitando conflito de área de clique com os botões de controle de janela desenhados pelo próprio app em Windows / Linux.
- O menu de conta do footer da Sidebar não exibe mais em duplicidade o feedback de problemas, a comunidade de usuários, a exportação de logs e a entrada de configurações, evitando que o mesmo grupo de ações apareça em dois pontos de entrada; fora do footer, o botão de engrenagem de configurações é mantido, e o menu de conta mantém as ações de uso, tema, idioma, zoom e estado de login.