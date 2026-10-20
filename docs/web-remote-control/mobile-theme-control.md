# Controle de tema do controle remoto no celular

O controle de tema do controle remoto no celular é tratado em duas etapas:

1. O link do QR code não acrescenta mais o parâmetro de query `theme`, evitando que o tema do desktop continue acoplado ao fluxo de primeira entrada no celular.
2. Quando `/remote` é aberto pela primeira vez no celular, se o navegador local não tiver `localStorage["zcode-theme"]`, será usado o padrão `zai-dark` como tema inicial; depois disso, apenas a preferência local do celular é usada.

Assim, garante-se que as duas pontas não se afetem depois: trocar o tema no celular altera apenas o armazenamento local do navegador do celular, e trocar o tema no desktop altera apenas o armazenamento local do renderer do desktop.

A página inicial de tasks do celular compartilha a sidebar de projetos com o desktop, e a entrada de tema fica no submenu de tema do menu de configurações no rodapé da sidebar; a página de chat renderiza `WebRemoteControlThemeMenu` à direita do header no topo. Ambos usam o mesmo conjunto de opções: apenas `system`, `zai-dark` e `zai-light`, sendo `zai-dark` / `zai-light` exibidos respectivamente como Dark Theme / Light Theme.

## Sincronização das superfícies do navegador

O controle remoto no celular roda em uma página comum de navegador, então a troca de tema não pode alterar apenas a subárvore React. A entrada Web deve sincronizar o mesmo tema resolvido com as seguintes superfícies de nível de navegador:

- `html`, `body` e `#root` usam o `--color-background` do tema atual, e não podem herdar o fundo raiz transparente exigido pelo Electron vibrancy.
- `color-scheme` declara o esquema de cores claro/escuro adotado pela página atual, para que controles nativos e superfícies padrão do navegador usem o mesmo esquema.
- `meta[name="theme-color"]` usa a cor de fundo de página do tema atual, para que navegadores que suportam esse padrão coloram a própria interface.

Essa sincronização é um limite de capacidade do navegador e não faz branching por Safari, Chrome, Firefox ou versão específica do sistema. Na primeira carga, `index.html` conclui isso antes da execução do bundle de negócio, com base na preferência local do celular; as trocas em runtime e as mudanças de tema do sistema no modo `system` continuam sendo atualizadas pelo `applyTheme()` compartilhado, usando o mesmo tema resolvido. O Desktop Electron não declara opt-in de superfícies de navegador e continua preservando o fundo raiz transparente e o vibrancy nativo da janela.

```text
localStorage / system preference
              |
              v
       resolved light/dark
              |
      +-------+-------------------+
      |                           |
      v                           v
React theme classes       browser theme surface (Web only)
dark / theme-zai-*        root background + color-scheme + theme-color
```