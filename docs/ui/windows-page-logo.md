# Logo no canto superior esquerdo da página no Windows

## Escopo

- Adiciona o logo do aplicativo no canto superior esquerdo do `SettingsPage` do desktop Windows.
- Apenas acrescenta a identidade da marca: não cria nenhum comportamento de clique nem altera as interações existentes de voltar, abrir workspace, seções de configurações etc.

## Implementação

- A UI usa `packages/ui/src/WindowsTopLeftLogo.tsx`, reutilizando de forma unificada o `ZCodeStartupLogoBadge` estático.
- `SettingsPage` renderiza esse componente somente sob a condição `isWindowsDesktop`, preservando o `app-region:drag` no topo.

## Migração de estilo do Logo do desktop

- O canto superior esquerdo do workspace em Windows/Linux e a página de configurações do Windows reutilizam a aparência compact do `ZCodeStartupLogoBadge`: base em gradiente de 20px, raio de 4px, borda de 1px white/20 e SVG inline de 13px de largura, mantendo a altura proporcional e desativando a animação de respiração.
- O workspace mantém a área de clique existente de 28px, a posição de navegação, o callback de alternância da sidebar e o ícone de hover; o foco por teclado também exibe o ícone da sidebar. A página de configurações mantém o posicionamento e a semântica de exibição existentes, sem novo comportamento de clique.
- O placeholder externo do Logo tem 20px; o workspace mantém a área de clique de 28px e o placeholder externo da página de configurações mantém 17px/19px no canto superior esquerdo, preservando o ponto central original. O Logo padrão de 96px da página de inicialização e da página de onboarding, assim como as entradas macOS/Web/mobile, mantêm a aparência existente.
- Não há migração de barra de título independente, controles nativos da janela, botões de painel, raio de canto ou espaçamento. O estado continua sendo gerido pelo owner atual da Sidebar, sem adicionar estado, protocolo ou cadeia de mensagens remotas.
- Regressão: os testes de componente validam o SVG estático, as dimensões e o hero padrão; SPT-E2E-000 valida as dimensões do Logo do workspace, o hover e a alternância por clique; UP-00 valida o Logo da página de configurações e o posicionamento nos dois temas. Os resultados da execução são registrados na matriz de cobertura correspondente.
- O pré-requisito de E2E reutiliza o mock do plano de controle de conta local, evitando que credenciais simuladas disparem 401 em produção e ocultem as capturas de tela; o workspace usa o helper padrão de preparação de inicialização para aguardar a primeira tela e pular a introdução profissional, sem substituir a verificação por alteração do estado de login do produto ou por ocultação de popups.

Verificação final de dimensões: base de 20px, SVG de 13px, raio de 4px e área de clique do workspace de 28px. 8 testes de componente, typecheck, typecheck:e2e, lint e a checagem de arquitetura passaram; no Windows, SPT-E2E-000 run desktop-e2e-20261009074039183-p26228-1224c47db4432985 e UP-00 run desktop-e2e-20261009074139434-p10168-0faa703391ebcbc2 passaram. Falta a máquina real Linux.
