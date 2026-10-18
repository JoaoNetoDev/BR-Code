# Layout da Barra Lateral da Página de Configurações

A página de configurações usa uma estrutura de layout desktop com divisão esquerda/direita, convergindo
uniformemente para os tokens semânticos de [DESIGN.md](../../DESIGN.md#color-palette):

- O contêiner externo usa `bg-background + border-border`, formando uma área de trabalho de configurações
  independente.
- A navegação à esquerda usa `bg-sidebar` e hospeda o botão de voltar, a navegação por grupos e a descrição do
  grupo atual.
- A navegação à esquerda precisa responder à largura da janela: em `lg` e acima mantém uma barra lateral de
  texto de 264px, ou seja, 256px de conteúdo mais 8px de margem de segurança; abaixo de `lg` converge para uma
  barra lateral de ícones de 64px, ocultando o texto visível e expondo por tooltip os títulos das entradas de
  voltar, grupos e onboarding, evitando que a janela estreita comprima o conteúdo de configurações à direita.
- A área de conteúdo à direita mantém `bg-background`, com título separado do conteúdo de configurações e
  largura de texto corporal limitada a uma coluna de leitura média.
- Os cards de item de configuração usam uniformemente `bg-card + border-border`, e os divisores dentro das linhas
  usam uniformemente `border-border`.
- Os controles interativos priorizam `bg-input / border-input-border / bg-hover / bg-selected`, evitando que a
  página componha localmente novos valores de cor neutra.
- A classe base `Card` genérica também converge para `bg-card + border-card-border + text-foreground`, evitando
  que componentes da página reescrevam manualmente a semântica de contorno de card.

## Grupos de Navegação

As entradas de configurações mantêm a semântica de rotas existente, mas são divididas em três grupos visíveis por
tarefa do usuário:

- Configurações básicas: Geral, Interface, Configurações de modelo, Navegador.
- Capacidades do Agent: Plugins, Skills, Subagentes, Servidores MCP, Comandos, Hooks. Plugins, como entrada
  unificada das capacidades de extensão do Agent, ficam no início do grupo, e comandos e hooks permanecem
  vizinhos das demais configurações do Agent.
- Dados e estatísticas: Índice, Uso.

Os títulos de grupo pertencem à estrutura de navegação e não são entradas clicáveis. A barra lateral larga exibe
os títulos localizados; abaixo de `lg`, ao convergir para a barra de ícones de 64px, os títulos visíveis são
ocultados e um divisor fraco preserva as fronteiras dos grupos. Cada grupo usa um nome de acessibilidade de
grupo independente, e as entradas dentro do grupo mantêm tooltip, `aria-current` e os test ids existentes. A
entrada de onboarding não pertence a nenhum grupo de configurações e continua depois da lista de grupos.

Os grupos afetam apenas o visual de navegação e a estrutura semântica da página de configurações compartilhada
entre desktop e web, sem alterar o id das seções de configurações, a seção acessada recentemente, a intenção de
navegação explícita, o roteamento de conteúdo ou a persistência. O `/remote` do celular hoje não tem entrada
para a página de configurações, portanto não há nova interação específica para mobile; a janela estreita apenas
valida o comportamento da barra de ícones responsiva.

As responsabilidades atuais de cada entrada são:

- Geral: gerencia o tema e o idioma da interface.
- Models: usa o ícone Lucide `Package`.
- Plugins: usa o ícone Lucide `Blocks`, consistente com o ícone padrão de plugin na página de configurações.
- MCP: usa o ícone Lucide `Server`.
- Pré-visualização de código: gerencia o tema dos blocos de código, números de linha, quebra automática de linha e
  tamanho da fonte, mantendo a pré-visualização dupla clara/escura.
- Provedores de modelo: gerencia os provedores de modelo, as credenciais e os modelos disponíveis usados pelo
  ZCode Agent.
- Skills: gerencia skills de nível de projeto e de usuário.
- Servidores MCP: gerencia as configurações MCP usadas pelo ZCode Agent e as genéricas.
- Comandos: gerencia os arquivos de comando `.md` dos diferentes Agent CLIs.
- Hooks: gerencia os hooks do ciclo de vida de tarefas.
- Índice: gerencia as capacidades relacionadas à indexação do workspace.
- Navegador: gerencia a ativação do plugin oficial Browser Use, a importação única de dados do Chrome e a
  limpeza dos dados do navegador integrado.
- Uso: exibe o uso do app e dos planos de programação.

Intenções de navegação para seções ocultas remanescentes de janelas históricas caem de volta para a seção padrão
visível, evitando abrir uma página de configurações em branco.

## Isolamento de Interações Bloqueantes

Depois que a página de configurações é aberta, ela se torna a única superfície principal interativa da janela. O
workspace subjacente continua montado para preservar a assinatura da sessão, rascunhos, terminal e estado de
layout, mas precisa ser marcado simultaneamente como `aria-hidden` e `inert`; usar apenas opacidade e
`pointer-events` não basta, porque o autofoco do cartão de permissão ainda pode roubar o foco do formulário de
configurações.

```text
CLI pending interaction
  -> o conversation snapshot continua sendo atualizado
  -> workspace coberto pela página de configurações (mounted + aria-hidden + inert)
       |-> não foca Permission / AskUserQuestion
       |-> não recebe interação de teclado ou ponteiro
       `-> os badges de task / as notificações do sistema ainda podem avisar

O usuário volta explicitamente ao workspace ou clica na notificação da task
  -> a camada de configurações fecha
  -> o workspace remove o inert
  -> a interação pendente é exibida no bottom dock da task original
```

| Superfície atual | Evento em background | Resultado esperado |
| --- | --- | --- |
| Página de configurações | Requisição de permissão comum | A página de configurações, os valores do formulário e o foco atual permanecem inalterados; a requisição continua na task original |
| Página de configurações | `AskUserQuestion` | Usa as mesmas regras de isolamento de superfície da permissão comum; não força o retorno à conversa |
| Página de configurações | Requisição concluída ou encerrada automaticamente | Atualiza apenas a projeção da task em background; a página de configurações não troca |
| Workspace | Permissão ou pergunta ainda pendente | Exibe na interação pelo bottom dock existente e permite responder |

Essa boundary restringe apenas as superfícies do renderer e a propriedade do foco; ela não modifica
`pendingInteractions`, a contagem regressiva das requisições, a resposta de permissões, as notificações de task,
nem os protocolos e a semântica de restauração do `desktop-continuous` do desktop ou do
`web-remote-replayable` do celular. O `/remote` do celular, sem a camada de sobreposição de configurações do
desktop, continua usando a interação mobile existente, e nenhum comportamento novo de controle remoto é derivado
deste caso.

Esta alteração modifica apenas a estrutura de UI e a hierarquia visual; ela não muda o estado subjacente das
configurações, a forma de persistência nem a lógica de configurações compartilhada entre desktop e web.