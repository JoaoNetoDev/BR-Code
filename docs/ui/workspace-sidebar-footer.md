# Workspace Sidebar Footer

## Objetivo

Unificar a interação da área de conta no rodapé da barra lateral do workspace e da barra
lateral de Settings, evitando que os dois pontos de entrada tenham comportamentos
inconsistentes.

## Comportamento atual

- Quando não há login, tanto a área do avatar quanto o texto exibem `Login`, e o clique abre
  diretamente o diálogo de login.
- Quando há login, a área do avatar mostra o nome de usuário atual e deixa de funcionar como
  entrada de login.
- Após receber o evento `update-ready` do host, aparece um botão `Update` à esquerda do botão
  de configurações.
- O botão de configurações abre um menu suspenso unificado, com idioma, tema e as operações
  de login/logout.
- O rodapé da barra lateral de Settings reutiliza o mesmo componente de footer, mas o menu
  não repete mais a entrada "Configurações".
- O `Usage Remaining` do Coding Plan não aparece mais no menu de avatar do rodapé:
  - o menu de avatar do rodapé mantém apenas entradas de operação como conta, preferências,
    upgrade/renovação e login/logout.
  - a entrada de upgrade/renovação é sempre exibida; quando o contexto atual não consegue
    resolver o provider, o padrão é o Z.ai Coding Plan.
  - os detalhes da cota restante permanecem na página de Usage e no popover de contexto da
    caixa de entrada do chat, evitando duplicar a mesma informação no menu de avatar.
  - o badge do plano aparece apenas no topo do menu de conta expandido, ao lado do nome de
    usuário; o gatilho no rodapé da barra lateral mostra somente o avatar e o nome de usuário.
    O badge em si não abre o painel de cota restante.

## Exibição e cópia do ID de usuário

- Clicar no avatar ou no nome de usuário no rodapé da barra lateral abre o menu; quando há
  login, o topo exibe as informações da conta: avatar à esquerda e, à direita, o nome de usuário
  na primeira linha seguido de imediato pelo identificador do plano, e na segunda linha
  «ID: {id}» seguido de imediato por um botão de ícone separado de cópia; em seguida, um
  separador leva aos itens originais de idioma, tema etc. Não há mais um item de menu
  independente de copiar o ID no rodapé. O plano reaproveita o status de benefício e o badge
  já existentes no footer; sem plano válido nada é exibido e nenhuma requisição ou estado é
  adicionado. O identificador do plano dentro do menu usa borda clara, fundo transparente e
  peso de fonte normal; as duas linhas da área de conta não recebem espaçamento extra e têm
  padding vertical de 6px.
- O ID usa o tamanho de fonte `text-ui-sm` e a cor secundária de texto; em chinês e inglês usa
  «ID: {id}», sem fundo de tag. Clicar no texto do ID não copia; apenas o botão de ícone ao
  lado copia, com suporte a mouse, toque e ativação por teclado, com a dica «点击复制用户 ID».
  O botão de cópia é transparente por padrão e só mostra fundo no hover ou no foco visível por
  teclado, preservando a área de clique original. Nomes de usuário e IDs longos são
  truncados em uma linha, mas o valor copiado é sempre o ID completo.
- Avatar, nome de usuário e ID reaproveitam o `user` do footer, sem requisição extra de dados
  de conta nem persistência do ID. Quando não há login, todo o cabeçalho de conta e seu
  separador ficam ocultos; quando o ID é vazio, apenas a linha do ID fica oculta.
- A cópia reaproveita a Clipboard API do navegador, coerente com as operações de cópia
  existentes na UI: clicar no botão de cópia → escrever na área de transferência → em caso
  de sucesso, exibir «用户 ID 已复制»; quando indisponível ou quando a escrita falha, exibir
  «复制失败，请重试», sem relatar sucesso indevidamente.
- Chinês e inglês, desktop e Web no celular, Zai Light e Zai Dark mantêm o mesmo comportamento.
- Aceitação: apenas o botão de ícone copia, clicar no ID não copia, o plano fica na mesma
  linha do nome de usuário, o ID é copiado por completo, o ID longo é truncado mas copiado
  por completo, a ativação por teclado funciona, ocultação quando não há login ou o ID está
  vazio, e a mensagem de falha quando a área de transferência é recusada ou está indisponível.
- Caso candidato no navegador:
  `packages/ui/test/browser/manual-review/pending/sidebar-user-id.test.mjs` (componente real de
  footer, com dados de conta e de plataforma vindo de fixture; não equivale à aceitação no
  host Electron).

## Locais de implementação

- Componente da área de conta: `packages/ui/src/WorkspaceSidebarFooter.tsx`
- Montagem na barra lateral de Settings: `packages/ui/src/SettingsPage.tsx`
- Passagem da entrada do diálogo de login: `packages/ui/src/Root.tsx`
- Exibição de uso: `packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx`