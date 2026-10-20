# Sistema de Design do ZCode

Sistema de design portátil para trabalho de UI assistido por IA neste repositório.

Este documento é a fonte única de verdade para as regras de design e a intenção dos tokens.
Os valores dos temas são definidos em [styles.css](packages/ui/src/styles.css), incluindo os
temas de fallback e as sobrescritas ativas Zai Light / Zai Dark; não mantenha uma cópia
separada de seus valores numéricos de cor na documentação.

Este arquivo é destinado a agentes de codificação. Ao gerar ou editar UI neste repositório, siga este arquivo antes de inventar novas regras visuais.

## Restrição de UI de maior prioridade

A escala dedicada `text-ui-*` é uma restrição obrigatória em todo o repositório para a tipografia da interface da aplicação:

- Os componentes de UI devem usar `text-ui-xl`, `text-ui-lg`, `text-ui-base`, `text-ui-caption`, `text-ui-sm` ou `text-ui-xs`.
- O cabeçalho compartilhado de seção de Settings pode usar o papel dedicado `text-ui-settings-title` / `lg:text-ui-settings-title-lg` definido abaixo.
- Não introduza os utilitários nativos do Tailwind `text-base`, `text-sm` ou `text-xs` para a UI da aplicação.
- Não introduza tamanhos de fonte arbitrários de UI, como `text-[13px]` ou valores inline de `font-size`.
- As únicas exceções no nível de conteúdo são a renderização de código, Diff e terminal, que consomem suas próprias configurações numéricas independentes de tamanho de fonte. Seus controles, rótulos, cabeçalhos e metadados ao redor ainda devem usar `text-ui-*`.
- Campos de entrada editáveis no Mobile Web que precisam evitar o zoom de foco do iOS usam o token de compatibilidade fixo `text-mobile-input-safe` (16px). Não o use como um token geral de hierarquia de UI.
- Nunca implemente o dimensionamento da fonte da interface alterando o `fontSize` de `html` ou `document.documentElement.style`; atualize apenas `--ui-font-size`.

Trate violações desta seção como defeitos do sistema de design, não como preferências estilísticas.

## Caráter do Produto

O ZCode é um workspace de IA desktop-first e compatível com a web. A interface deve parecer calma, densa e operacional, em vez de decorativa.

Projete para:

- sessões longas
- alta densidade de informação
- saída de chat e de ferramentas legível
- fluxos de trabalho orientados a teclado
- paridade entre desktop e web
- compatibilidade com macOS, Windows e Linux
- internacionalização e comprimento variável de texto
- temas claro e escuro, além das variantes Zai já suportadas pelo codebase

Evite:

- espaçamentos exagerados de estilo marketing
- gradientes lúdicos como linguagem de UI padrão
- preenchimentos de marca vibrantes cobrindo superfícies inteiras
- hierarquia ambígua entre as superfícies de background, card e popover

## Modos de Tema

### Overlays desktop de página inteira

As superfícies de Login, upgrade do Coding Plan e Rewards devem manter os controles de minimizar, maximizar/restaurar e fechar janela acessíveis no topo à direita no Windows e Linux. Reutilize
`DesktopWindowControls` e as variantes CSS de plataforma existentes. Mantenha os controles
fora do conteúdo rolável e acima da decoração da página, com uma área de clique não arrastável.
A ação de fechar página do site embutido permanece separada de fechar janela.
O macOS mantém os traffic lights nativos; o Web comum e o Mobile Web ocultam os controles de desktop.
Verifique as três superfícies em ambos os temas, incluindo janelas estreitas, maximizar/restaurar,
minimizar e o comportamento de fechar página versus fechar janela.

As escolhas de tema voltadas ao usuário são:

- System
- Light Theme, baseado no Zai Light
- Dark Theme, baseado no Zai Dark

As variáveis CSS padrão de claro e escuro ainda existem como fundações de fallback, mas a nova UI deve ser validada contra o Zai Light e o Zai Dark como as experiências ativa de claro/escuro.

## Paleta de Cores

### Cores semânticas principais

- **Brand**: `--color-brand`
  Use para ênfase principal, links importantes, indicadores ativos e ações com acento da marca. Nunca use como background de página inteira.
- **Icon Blue**: `--color-icon-blue`
  Use para links no estilo navegador e ênfase azul de ícones que segue o papel `icon/blue` do Figma. Mantenha os ícones de tipo de arquivo em suas próprias cores descritivas.
- **Icon Purple**: `--color-icon-purple`
  Use para a ênfase de duração do Highspeed e outras UI explicitamente mapeadas ao papel `icon/purple` do Figma. Não reutilize diretamente cores de tarefas ociosas ou de terminal.
- **Highspeed Composer Material**: `--color-highspeed-composer-border-idle` com `--color-highspeed-glow-*`
  Use apenas para a casca ativa do composer Highspeed. Sua superfície estável e camada de partículas são definidas pela folha de estilo dedicada de ativação do Highspeed e não devem vazar para entradas comuns.
- **Accent Surface**: `--color-accent`
  Use para blocos de ênfase fraca, destaques de seleção e superfícies com marca de baixa intensidade.
- **Background**: `--color-background`
  Background padrão da página e do workspace da aplicação.
- **Background Alt**: `--color-background-alt`
  Background alternado de região da página quando o layout precisa de uma separação suave.
- **Header / Panel / Sidebar**: `--color-header`, `--color-panel`, `--color-sidebar`
  Apenas superfícies estruturais de layout. Não reutilize como cores genéricas de card.
- **Surface**: `--color-surface`
  Superfície de contêiner de baixa elevação.
- **Surface Hover**: `--color-surface-hover`
  Estado hover para superfícies de baixa elevação.
- **Remote Continuity Panel**: `--color-remote-continuity-panel`, `--color-remote-continuity-panel-surface`, `--color-remote-continuity-panel-foreground`, `--color-remote-continuity-panel-subtle`
  Reservado para a comparação de primeiro conectar local-offline / remoto-em-execução. Permanece escuro em ambos os temas para que a passagem de contexto fique visualmente estável; não o reutilize como um card escuro genérico.
- **Card**: `--color-card`
  Background padrão de cartão de conteúdo.
- **Card Selected**: `--color-card-selected`
  Background de card selecionado ou ativo.
- **Popover**: `--color-popover`
  Background de diálogo, popover e painel flutuante.
- **Menu**: `--color-menu`
  Superfície de dropdown e menu.
- **Menu Hover**: `--color-menu-hover`
  Estado hover para itens de menu.
- **Input**: `--color-input`
  Background padrão de campo editável.
- **Input Focused**: `--color-input-focused`
  Background de campo editável em foco.

### Cores de texto

- **Text Primary**: `--color-foreground`
  Texto principal de leitura.
- **Text Secondary**: `--color-foreground-subtle`
  Metadados, descrições, rótulos de apoio.
- **Text Tertiary**: `--color-foreground-subtlest`
  Placeholders, dicas fracas, texto próximo ao estado desabilitado.
- **Text Inverse**: `--color-foreground-inverse`
  Texto sobre preenchimentos escuros, com marca ou com cor de estado.

### Cores de borda

- **Desktop Resize Handle**: `--color-resize-handle` usa sky-500 nos temas claros e sky-400 nos temas escuros. Use apenas para os indicadores de redimensionamento de workspace do desktop; mantenha a geometria e os estados de interação existentes.

- **Border**: `--color-border`
  Borda e separador padrão.
- **Border Hover**: `--color-border-hover`
  Estado de borda com hover.
- **Card Border**: `--color-card-border`
- **Popover Border**: `--color-popover-border`
- **Input Border**: `--color-input-border`
- **Input Border Hover**: `--color-input-border-hover`
- **Input Border Focused**: `--color-input-border-focused`

### Cores de feedback semânticas

- **Success**: `--color-success` com `--color-success-foreground`
- **Warning**: `--color-warning` com `--color-warning-foreground`
- **Destructive**: `--color-destructive` com `--color-destructive-foreground`
- **Success surface**: `--color-success-surface` com `--color-success-surface-foreground`
- **Warning surface**: `--color-warning-surface` com `--color-warning-surface-foreground`
- **Destructive surface**: `--color-destructive-surface` com `--color-destructive-surface-foreground`
- **Idle-time task**: `--color-idle-task` com `--color-idle-task-surface`
  Use apenas para tags de fila de tempo ocioso e pausadas, para que permaneçam visualmente
  distintas do tratamento verde das tarefas agendadas.
- **Diff Added**: `--color-diff-added` com `--color-diff-added-foreground`
- **Diff Removed**: `--color-diff-removed` com `--color-diff-removed-foreground`

Use cores semânticas apenas para estados semânticos reais. Não pegue emprestadas as cores de success, warning ou destructive apenas para fazer um bloco parecer mais chamativo.
Use `*-surface` para chips de estado translúcidos e banners; combine-o com o `*-surface-foreground` correspondente e nunca adicione alpha ad hoc em um componente. Os valores de foreground de superfície devem preservar pelo menos 4.5:1 de contraste nos temas distribuídos.

### Cores de interação bloqueante

- **Ask Interaction**: `--color-interaction-ask-surface`, `--color-interaction-ask-foreground`, `--color-interaction-ask-fill`
  Tokens de compatibilidade legados de superfície/primeiro plano para `AskUserQuestion`; badges de espera não usam mais um tratamento azul separado. O ask fill é reservado para o progresso da contagem regressiva.
- **Confirmation Interaction**: `--color-interaction-confirmation-surface`, `--color-interaction-confirmation-foreground`
  Use para todos os badges de espera, incluindo `AskUserQuestion`, permissões e `ExitPlanMode`.

Os badges de espera usam um único tratamento verde de confirmação para que um texto de espera idêntico não apareça como estados diferentes. Não substitua por `--color-success` uma confirmação de espera.

### Cores da timeline de workflow

A timeline de dynamic-workflow (spec: `docs/dynamic-workflow/presentation.md`) desenha com uma
família de tokens com escopo de feature:

- **Rule**: `--color-workflow-rule`
  Sub-hairline para mobiliário repetido. Mais fraca que `--color-border`; não a use como
  separador geral.
- **Trace / Trace Strong**: `--color-workflow-trace`, `--color-workflow-trace-strong`
  Ramp de traço do trilho e do arco: ainda não percorrido vs. controle já passou. O segmento
  em marcha sobrepõe traços de `--color-warning`; não existe uma terceira cor de traço.
- **Fill frame**: o frame de um hole preenchido é desenhado em `--color-workflow-trace` (1px), e em
  `--color-warning` (1.5px) apenas nos dois segundos seguintes ao join do preenchimento; nunca uma
  superfície tingida (spec: `docs/dynamic-workflow/presentation.md`, "Holes on the timeline").
- As lâmpadas de estação e as pills de agente usam as cores semânticas de status (`--color-success`,
  `--color-warning` para em execução, `--color-destructive`); os avatares dos agentes usam a paleta HEX fixa de nove cores definida na spec do workflow,
  atribuída pelo índice de instância (fallback por hash de nome), e nunca codificam status.
- Uma linha de feedback de compilação (um script que não compilou, então nada rodou) usa uma lâmpada vazada:
  `--color-warning` enquanto é o rascunho mais recente, `--color-foreground-subtlest` quando existe um
  rascunho mais novo. Nunca `--color-destructive`, que nesta feature pertence a uma run que falhou com erro
  (spec: `docs/dynamic-workflow/presentation.md`, "Compiler feedback").

### Cores de overlay e utilitárias

- **Toast**: `--color-toast`
  O toast compartilhado usa `bg-toast/60` com blur de background e uma casca `rounded-2xl`.
  Mantenha o posicionamento da pilha no componente de toast compartilhado; não adicione offsets por chamada.
- **Tooltip**: `--color-tooltip`
- **Tooltip Text**: `--color-tooltip-foreground`
- **Tooltip Tag**: `--color-tooltip-tag`
- **Tooltip Tag Text**: `--color-tooltip-tag-foreground`
- **Tag**: `--color-tag`
- **Find Highlight**: `--color-find-highlight`, `--color-find-highlight-active`
  Use apenas para destaques de resultados de busca na página/texto. O token base marca todas as correspondências; o token ativo marca a correspondência selecionada no momento.
- **Hover**: `--color-hover`
- **Selected**: `--color-selected`
- **Primary**: `--color-primary`
- **Primary Foreground**: `--color-primary-foreground`
- **Secondary**: `--color-secondary`

### Tokens de cores especializados

| Token | Propósito |
| --- | --- |
| `--color-markdown-inline-code` | Background de código inline em Markdown; herda a hierarquia de cápsula de tag / label |
| `--color-popover-header` | Cabeçalho de popover |
| `--color-tab` | Background padrão de tab |
| `--color-tab-active` | Tab ativa atual |
| `--color-tab-border` | Separador de tabs |
| `--color-feedback-privacy-hint` | Texto e ícone de exclamação do aviso de privacidade da captura de tela de feedback; linha própria, com tamanho de fonte auxiliar |
| `--color-git-none` | Estado Git sem alterações; herda a cor comum de nome de arquivo |
| `--color-git-modified` | Git modified: arquivo rastreado com modificações não commitadas |
| `--color-git-added` | Git added: arquivo novo que entrou na working tree / staging area |
| `--color-git-deleted` | Git deleted: arquivo rastreado foi excluído |
| `--color-git-renamed` | Git renamed: arquivo rastreado foi movido ou renomeado |
| `--color-git-untracked` | Git untracked: arquivo novo que o Git ainda não rastreia |
| `--color-git-ignored` | Git ignored: herda a hierarquia de texto enfraquecida |
| `--color-git-descendant` | Git descendant: diretório cujos descendentes contêm alterações |
| `--color-file-node` | Background do nó de menção a arquivo |
| `--color-file-node-hover` | Background hover do nó de menção a arquivo |
| `--color-file-node-foreground` | Texto / ícone do nó de menção a arquivo |
| `--color-skill-node` | Background do nó de menção a skill |
| `--color-skill-node-hover` | Background hover do nó de menção a skill |
| `--color-skill-node-foreground` | Texto / ícone do nó de menção a skill |
| `--color-command-node` | Background do nó de menção a command |
| `--color-command-node-hover` | Background hover do nó de menção a command |
| `--color-command-node-foreground` | Texto / ícone do nó de menção a command |

Os status de arquivo do Git devem usar `text-git-*` / `bg-git-*`, em vez de pegar emprestados tokens de diff ou de warning.
Os tokens de menção pertencem aos nós de menção do prompt-editor e do UserPrompt; seus papéis de background, hover
e foreground devem permanecer juntos. O código inline em Markdown usa seu próprio token de background,
atualmente mapeado para `--color-tag`.

## Regras de Uso de Cor

- Use tokens semânticos, não valores de cor pontuais.
- Prefira `bg-background + text-foreground` para as raízes de página.
- Prefira `bg-card` ou `bg-surface` para contêineres comuns de conteúdo.
- Prefira `bg-popover` ou `bg-menu` para overlays; combine com `border-popover-border` ou `border-border`.
- Prefira `bg-hover` para hover genérico e `bg-selected` para seleção.
- Prefira `bg-primary text-primary-foreground` para o botão primário padrão.
- Prefira a hierarquia de texto para criar densidade de informação antes de adicionar mais bordas ou cores.
- Mantenha o uso da cor de marca esparso e intencional.
- Nunca misture `bg-background`, `bg-card` e `bg-surface` sem um motivo claro de camadas.
- Nunca substitua tokens semânticos por valores ad hoc como `text-white/60`, `border-white/10` ou preenchimentos alfa neutros arbitrários.

- `DesktopWindowFrame` usa `bg-background-alt` no desktop do macOS. Windows, Linux e Web mantêm `bg-background-win-alt`; as cores das superfícies filhas permanecem independentes.
- O desktop do Linux usa um raio de casca de janela externa de `16px` ao redor dos painéis de workspace de `12px` e seu inset externo de `4px`. Mantenha o raio da casca e o clip path do compositor iguais; janelas maximizadas usam `0px`.

### Transparência de primeiro plano do Lucide

- Os níveis secundário e terciário de primeiro plano do Lucide desenham o ícone completo com traço opaco e depois o misturam com o background como um todo, evitando o escurecimento nos cruzamentos de múltiplos paths. O secundário usa 60%; o terciário usa 40% no tema claro e 30% no escuro.
- Mantenha as chamadas existentes `text-foreground-subtle` / `text-foreground-subtlest`; também é suportado que a classe de cor esteja diretamente no ícone ou herdada do elemento pai. O texto continua usando as cores semitransparentes originais.
- Os estados hover, group-hover, focus, disabled e data dos utilities de cor devem sincronizar com a hierarquia do ícone; quando um filho usa explicitamente outra cor, a hierarquia enfraquecida herdada é limpa. Os `opacity-*` existentes continuam se sobrepondo de forma independente, e `opacity-0` ainda oculta o ícone.
- O escopo desta adaptação são os utilities de cor do Tailwind; cores e filtros em CSS customizado / inline não são pontos de entrada da hierarquia, e SVGs que não sejam Lucide não são reescritos globalmente. O `stroke="currentColor"` do Lucide padrão é o ponto de entrada da adaptação.
- Suporta modificadores de cor percentuais comuns (como `/50`) e ícones sólidos com `fill-current`. Navegadores sem suporte à sintaxe relativa de cores mantêm a renderização original.
- Aceitação: 390px / 1200px, Zai Light / Zai Dark, verificando separadamente cores diretas/herdadas sobre página, painel e fundos coloridos, pixels em cruzamentos e fora deles consistentes, cor de texto inalterada, sobrescrita de cores de interação e transparência adicional.

## Tipografia

### Famílias de fonte

- **UI Sans**: use o stack padrão `font-sans` da aplicação para praticamente todo o texto de interface.
- **UI Mono**: use `font-mono` para caminhos, comandos, código, identificadores, atalhos, hashes de commit, IDs de modelo e dados com aparência de terminal.

### Tokens de fonte de UI

Cada utility `text-ui-*` mapeia para o token CSS `--text-ui-*` correspondente.

Toda a tipografia da interface deve usar a escala dedicada `text-ui-*`. A configuração de Appearance controla `--ui-font-size`, cujo padrão é `14px`:

| Token             | Fórmula                | Padrão |
| ----------------- | ---------------------- | -----: |
| `text-ui-xl`      | `--ui-font-size + 4px` |   18px |
| `text-ui-lg`      | `--ui-font-size + 2px` |   16px |
| `text-ui-base`    | `--ui-font-size`       |   14px |
| `text-ui-caption` | `--ui-font-size - 1px` |   13px |
| `text-ui-sm`      | `--ui-font-size - 2px` |   12px |
| `text-ui-xs`      | `--ui-font-size - 4px` |   10px |
| `text-ui-2xs`     | `--ui-font-size - 5px` |    9px |

`text-ui-2xs` é uma exceção restrita abaixo do piso de `text-ui-xs`: é permitido
apenas para **mobiliário de eixo** de gráficos — rótulos de marcação da linha de tempo, códigos de canal e sufixos
de unidade na timeline de workflow — nunca para conteúdo, rótulos ou metadados.
Trate qualquer outro uso como um defeito do sistema de design.

O cabeçalho compartilhado de seção de Settings usa `text-ui-settings-title` com
`lg:text-ui-settings-title-lg`: `--ui-font-size + 10px` / `+ 16px` (24px / 30px
na configuração padrão), com razões de line-height de `4 / 3` / `1.2` (32px / 36px
por padrão). Esses tokens preservam o cabeçalho responsivo maior enquanto seguem a
configuração de fonte da interface. Eles são reservados para este cabeçalho de página;
títulos de seção comuns e controles mantêm a escala padrão.

`text-mobile-input-safe` é um token fixo de 16px de compatibilidade entre plataformas. É
reservado para controles editáveis em superfícies de Mobile Web onde é preciso evitar
o zoom de foco do iOS e, portanto, não escala com `--ui-font-size`.

- Alterar o tamanho da fonte da interface atualiza apenas `--ui-font-size`; nunca mude o tamanho da fonte raiz do `html`.
- Ícones, espaçamentos, raios e outras geometrias baseadas em `rem` não devem escalar junto com a configuração de fonte da interface.
- Conteúdo de código, Diff e terminal mantém suas configurações independentes de tamanho de fonte; apenas seus controles de interface ao redor usam `text-ui-*`.
- Entradas no Mobile Web que exigem o piso de 16px do zoom de foco do iOS usam `text-mobile-input-safe`.

### Papéis de tipo

A escala `text-ui-*` expressa papéis semânticos estáveis. Escolha um token pelo papel do conteúdo, e não por preferência visual isolada:

| Token             | Papéis principais                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `text-ui-xl`      | Markdown `h1` e cabeçalhos de leitura equivalentes de primeiro nível                                                |
| `text-ui-lg`      | Markdown `h2` e cabeçalhos de leitura equivalentes de segundo nível                                                 |
| `text-ui-base`    | Markdown `h3`-`h6`, corpo de texto, botões comuns, títulos de workspace e de seção, e outros textos primários de UI |
| `text-ui-caption` | Texto de apoio compacto que deve permanecer um passo abaixo do corpo de texto, como o anúncio da feature New Task   |
| `text-ui-sm`      | Texto secundário, informação de apoio, texto de ajuda, conteúdo de Tooltip e código inline de Markdown              |
| `text-ui-xs`      | Atalhos de teclado de tooltip, badges, rótulos compactos, contadores e metadados muito fracos                       |

- Markdown `h3`-`h6` compartilham `text-ui-base`; diferencie sua hierarquia pelo peso: `h3`-`h4` usam `font-semibold`, `h5` usa `font-medium` e `h6` usa `font-normal`.
- Corpo de texto e controles comuns normalmente usam `text-ui-base font-normal`; títulos e rótulos podem reforçar o peso sem mudar seu papel semântico de tamanho.
- Combine texto secundário com uma cor semântica apropriada, geralmente `text-foreground-subtle`. Combine metadados fracos com `text-foreground-subtlest`. O tamanho da fonte e a hierarquia de cor são decisões independentes.
- **Tooltip**: títulos, descrições simples e conteúdo de log usam `text-ui-sm`; rótulos de atalho de teclado usam `text-ui-xs`. Conteúdo rico como notas de versão em Markdown mantém sua hierarquia tipográfica de conteúdo, em vez de achatar cabeçalhos e links ao tamanho do texto de Tooltip.
- **Code / Command / Path**: use `font-mono`, geralmente com `text-ui-base`; o código inline de Markdown usa `text-ui-sm`.
- Ao migrar um tamanho legado explícito de `13px` de UI sem um papel deliberado de caption compacto, use `text-ui-base`. Use `text-ui-caption` apenas onde o produto exige explicitamente um tratamento estável de caption um passo abaixo do corpo. Não colapse nenhum dos dois em `text-ui-xs`; `text-ui-xs` é reservado para papéis em escala de badge e metadados muito fracos.

### Escala de tipos do Markdown

O Markdown renderizado pela resposta compartilhada do assistente usa uma hierarquia orientada à leitura, enquanto a UI operacional ao redor permanece compacta:

- **Contêineres de mensagens do usuário e do assistente**: `text-ui-base`
- **Corpo**: `text-ui-base`
- **Links**: `text-ui-base`
- **Código inline**: `font-mono text-ui-sm`
- **Corpo de bloco de código**: `14px` padrão, configurável nas configurações de preview de código
- **Cabeçalho de bloco de código**: `text-ui-base`
- **Tabelas**: `text-ui-base`
- **h1**: `text-ui-xl`
- **h2**: `text-ui-lg`
- **h3**: `text-ui-base`
- **h4**: `text-ui-base`
- **h5**: `text-ui-base`
- **h6**: `text-ui-base`

### Regras de tipografia

- Mantenha o texto de UI compacto e legível.
- Prefira `font-medium` para cabeçalhos e rótulos; evite pesos pesados, a menos que haja um forte motivo.
- Use monoespaçada apenas onde o conteúdo é inerentemente técnico.
- Use `text-ui-base` como o tamanho de texto padrão compacto da aplicação. Mantenha `text-ui-base` para títulos de workspace e tratamentos de título mais fortes.
- Respeite a expansão de i18n. Não codifique layouts que só funcionam para rótulos curtos em inglês.
- Não dependa de truncamento agressivo como a única forma de um componente sobreviver à tradução.

## Espaçamento

A unidade base de espaçamento é `4px`.

Ritmo recomendado:

- `4px`: espaçamento estreito entre ícone/texto
- `8px`: padding compacto de controles e gaps inline
- `12px`: itens de lista densos e linhas de menu
- `16px`: padding padrão de cards e painéis
- `20px` a `24px`: seções maiores ou interiores de diálogos

Regras de espaçamento:

- Mantenha a UI operacional densa compacta por padrão.
- Prefira um pequeno conjunto de gaps e paddings repetidos em vez de valores arbitrários.
- Em layouts flex com texto, adicione `min-w-0` onde for necessário truncar ou encolher.
- Em layouts de scroll aninhado ou painéis divididos, adicione `min-h-0` onde o scroll deve ser permitido.
- Prefira `w-full + max-w-*` em vez de larguras fixas quando possível.

## Raio

O raio segue o aninhamento de contêineres arredondados visíveis, não a importância do componente ou a profundidade do layout. Estas regras são a especificação alvo; os padrões existentes de componentes ainda podem precisar de migração.

### Hierarquia de contêineres

- Regiões de layout, wrappers comuns, grupos e separadores não contam como níveis de raio.
- O primeiro contêiner arredondado começa em `rounded-xl`, esteja ele dentro ou fora de uma região de layout.
- Contêineres arredondados aninhados descem por `rounded-lg` → `rounded-md` → `rounded-sm`; `rounded-sm` é o mínimo.
- Conte o contêiner arredondado real mais próximo, não wrappers intermediários do DOM. Contêineres irmãos no mesmo nível usam o mesmo raio.
- Cards, bolhas de chat, blocos de ferramenta e cascas comuns de entrada composta seguem esta hierarquia; tamanho ou importância por si só não justificam `rounded-2xl`.

### Exceções 2xl aprovadas

As seguintes exceções explícitas podem manter `rounded-2xl`; não as estenda a outros componentes baseando-se apenas em tamanho ou importância:

- **Casca principal de entrada de chat**: a casca de entrada do `ChatPromptEditor` em si pode usar `rounded-2xl`. Seu overlay de arraste corresponde à casca, pois cobre a mesma superfície, em vez de introduzir um contêiner aninhado.
- **Painel flutuante de status de conversa**: a casca compartilhada pode manter `rounded-2xl` nas apresentações recolhida e expandida.
- **Composer flutuante da visão completa do Side Pane**: na visão completa do Side Pane a casca principal de entrada de chat flutua por conta própria (sem moldura externa); o drawer que desliza para fora por trás dela e a bolha de resposta exibida acima dela usam `rounded-2xl` para corresponder à casca; o estado minimizado e o botão de fechar da bolha de resposta são círculos deliberados (`rounded-full`).
- **Toast**: a casca independente de notificação pode manter `rounded-2xl`.
- **Backplates de ícone de marca**: a arte de marca da tela de boas-vindas e os ícones de detalhe de plugin podem manter `rounded-2xl` como parte de sua forma de ícone. Esta não é uma exceção geral para botões de ícone ou cards de conteúdo.

A região principal do composer, incluindo seu wrapper de layout do context-header, é layout e não conta como nível de raio. Seu raio decorativo existente não força a casca de entrada real a descer um nível. Esta classificação, por si só, não prescreve alterar o raio decorativo do wrapper de layout.

Estas exceções não concedem automaticamente `2xl` a controles aninhados ou contêineres de conteúdo. Controles básicos ainda usam a tabela abaixo. Cascas de diálogo seguem suas regras separadas.

### Controles básicos

Botões, botões de abertura de menu, Input comum, Textarea e triggers de Select usam `rounded-lg` por padrão. Ajuste-os conforme o contêiner pai arredondado mais próximo:

| Pai arredondado mais próximo     | Raio do controle |
| -------------------------------- | ---------------- |
| Nenhum, ou `rounded-xl` ou maior | `rounded-lg`     |
| `rounded-lg`                     | `rounded-md`     |
| `rounded-md` / `rounded-sm`      | `rounded-sm`     |

O tamanho do controle e a ênfase de ação primária/secundária não alteram o raio de forma independente.

### Diálogos

- Cascas de diálogo, incluindo diálogos de alerta e confirmação, usam `rounded-2xl`.
- Apenas os diálogos de preview de anexo de chat, preview de captura de feedback e preview de captura do CUA mantêm cascas `rounded-xl`.
- A casca do diálogo não conta para a hierarquia de seu conteúdo. O primeiro contêiner de conteúdo arredondado recomeça em `rounded-xl`, seguido por `rounded-lg` → `rounded-md` → `rounded-sm`.
- Controles básicos dentro de diálogos seguem a tabela de controles; um wrapper de layout não introduz um nível extra.

### Menus e overlays de seleção

- Menus dropdown, menus de contexto, painéis expandidos de Select e overlays similares de opções/ações usam cascas `rounded-lg`. Isso inclui o painel de sugestões `@` / `/` da entrada principal; ele não herda a exceção da entrada principal.
- Itens de menu e backgrounds de hover/seleção de opções usam `rounded-md`.
- Contêineres ou controles arredondados aninhados dentro de uma opção usam `rounded-sm`.
- Cada submenu é um overlay independente: sua casca recomeça em `rounded-lg`, e suas opções usam `rounded-md`.
- O raio de overlay não herda a hierarquia do pai do trigger. Os triggers em si seguem a tabela de controles básicos.
- Outros contêineres de popover independentes seguem a hierarquia comum de contêineres, começando em `rounded-xl`.

### Exceções de forma e consistência

- `rounded-full` é reservado exclusivamente para formas de pílula deliberadas ou círculos.
- Botões, tags, contadores e botões de ícone não se qualificam para `rounded-full` meramente pelo seu tipo de componente.
- Não introduza valores de raio arbitrários nem use o utility ambíguo `rounded` puro.
- Use `rounded-none` ou remoção de raio específica de lado apenas onde superfícies unidas precisam formar uma forma contínua.
- Aplique as mesmas regras no desktop e no Mobile Web, entre plataformas e temas.

## Dimensionamento

### Linhas de base comuns de tamanho

- **Tamanhos de ícone**: `size-3`, `size-3.5`, `size-4`, `size-5`, `size-6`
- **Alturas de controle**: `h-6`, `h-7`, `h-8`, `h-9`
- **Botões de ícone quadrados**: `size-6`, `size-7`, `size-8`, `size-9`

### Regras de dimensionamento

- `size-4` é a linha de base padrão para ícones de UI.
- Reutilize os tamanhos de botão existentes em vez de criar novos sistemas de altura.
- Prefira larguras fluidas para contêineres de conteúdo.
- Larguras fixas são aceitáveis para menus, popovers, diálogos e painéis laterais estáveis.
- Evite `w-[...]` e `h-[...]` arbitrários para UI comum de negócio.
- Prefira as variantes `size` do Button compartilhado, incluindo `icon*`, em vez de sobrescritas separadas de largura/altura. As variantes atuais são `default(h-7)`, `xs(h-5)`, `sm(h-6)` e `lg(h-8)`; as linhas de base genéricas de controle não substituem esses contratos de componente.
- Entradas comuns preferem `h-9`; filtros compactos e entradas inline podem usar `h-7` ou `h-8`.
- Use `w-full`, `w-fit`, `max-w-full` e `min-w-0` para larguras de conteúdo. Overlays fixos podem usar `w-52`, `w-64`, `w-80` ou `max-w-sm/md/lg/xl` quando uma largura estável for necessária.
- Raízes de página usam `h-full` ou `min-h-screen`. Contêineres aninhados de scroll e preview precisam de `min-h-0` e `min-w-0` conforme apropriado; `overflow-auto` sozinho não estabelece uma região flex encolhível.
- Prefira `max-h-*` a uma altura fixa para conteúdo rolável. Não combine `size-*` com `w-*` / `h-*` conflitantes, a menos que uma forma não quadrada seja deliberada.

## Componentes

### Botões

O sistema de botões preferido corresponde a `packages/ui/src/components/ui/button.tsx`.

- **Primary**: `bg-primary text-primary-foreground`
- **Outline**: baseado em borda, superfície neutra, hover sutil
- **Secondary**: `bg-secondary text-foreground`
- **Ghost**: transparente até o hover
- **Destructive**: preenchimento semântico destrutivo
- **Link**: apenas texto, com sublinhado no hover

Tamanhos preferidos:

- `xs`: controles muito compactos
- `default`: a maioria dos botões de ação
- `sm`: botões compactos em listas densas
- `lg`: botões de maior ênfase
- `icon-*`: ações apenas com ícone

Regras de botões:

- Use primeiro as variantes de botão existentes.
- Mantenha os botões apenas com ícone quadrados.
- Não promova toda ação a primária.
- Preserve uma hierarquia de ações clara dentro de cada painel.

### Inputs

- Padrão: `bg-input border-input-border text-foreground`
- Hover com `border-input-border-hover`
- Foco com `border-input-border-focused` e `bg-input-focused`
- Campos de formulário comuns usam `rounded-lg` por padrão, descendo conforme o pai arredondado mais próximo nas regras de Raio.
- Cascas comuns de entrada composta seguem a hierarquia de contêineres, começando em `rounded-xl`; a casca principal de entrada de chat é uma exceção aprovada de `rounded-2xl`.

Regras de input:

- Inputs devem parecer calmos e integrados, não brilhando por padrão.
- Use estilo de estado de erro semântico apenas para problemas reais de validação.
- Não estilize inputs comuns como cards.

### Cards e Painéis

- Cards padrão usam `bg-card border-card-border`; o raio segue a hierarquia de contêineres, começando em `rounded-xl`.
- Contêineres de baixa ênfase usam `bg-surface`
- Cards selecionados podem usar `bg-card-selected`
- Cards de conteúdo principal geralmente usam `16px` de padding horizontal e texto compacto

Regras de card:

- Cards devem ficar claramente acima do background da página, mas abaixo dos overlays.
- Mantenha as superfícies de card mais silenciosas que os overlays.
- Evite misturar múltiplos estilos de background de card na mesma visualização, a menos que eles codifiquem hierarquia real.

### Menus, Popovers, Diálogos

- Menus usam `bg-menu`, linhas compactas, `rounded-lg` e `shadow-md`
- Menus usam `border border-popover-border` e tipicamente `p-1`
- Menus dropdown, menus de contexto e popovers de select devem compartilhar a mesma linguagem de superfície de menu
- Linhas de opções adjacentes em dropdowns, menus de contexto e popovers de select usam um gap vertical fixo de `2px` (`gap-0.5`) na camada compartilhada da pilha de opções
- Popovers e diálogos usam `bg-popover` e `border-popover-border`. Popovers independentes comuns começam em `rounded-xl`; diálogos usam `rounded-2xl`, exceto as três exceções de preview nas regras de Raio.
- Toasts usam `bg-toast`, padding compacto e sombra mais forte

Regras de overlay:

- A UI flutuante deve parecer precisa e compacta.
- Overlays interativos como dropdowns, menus de contexto, selects e popovers devem renderizar acima de tooltips passivos quando ambos estiverem abertos. Tooltips nunca devem cobrir opções ou controles em um overlay interativo ativo.
- As superfícies de menu dropdown devem manter sua sombra de overlay do primeiro frame de abertura através do foco por teclado e do hover do ponteiro. Regras globais de focus-reset não devem limpar a sombra do menu enquanto a raiz do conteúdo detém o foco.
- Mantenha as linhas de menu densas e altamente escaneáveis.
- Evite popovers gigantes com espaçamento frouxo, a menos que a tarefa realmente precise disso.
- Não estilize menus como cards nem reutilize `bg-card` / `bg-surface` para conteúdo comum de menu.
- Itens de menu devem ser lidos como linhas compactas de ação, não botões em miniatura.
- Prefira linhas de base estáveis de itens, como altura compacta, `rounded-md`, `px-2`, `gap-2` e `text-ui-base`.
- Use estados de hover sutis como `bg-menu-hover`; evite preenchimentos fortes ou bordas por linha para itens de menu comuns.
- Itens desabilitados devem manter seu layout e hierarquia, e geralmente apenas caem para uma cor de texto mais fraca.
- Prefira separadores fracos e ordenação para agrupar ações; evite construir menus como sub-cards empilhados.
- Reutilize o mesmo conteúdo de lista de ações entre os pontos de entrada de dropdown e menu de contexto quando o conjunto de ações for o mesmo.
- Para itens selecionados, prefira checkmarks, indicadores de rádio ou marcadores de estado ao final, em vez de preenchimentos fortes de seleção de linha inteira.
- Triggers compostos com uma ação primária e um chevron devem usar uma casca segmentada: ação principal à esquerda, abertura de menu à direita.
- Triggers de Select devem continuar seguindo a semântica de estilo de input, mesmo quando sua superfície expandida combina com o estilo de menu.
- Menus dropdown padrão geralmente devem alinhar-se à borda inicial do trigger, a menos que o trigger esteja no lado final de um layout.
- Use alinhamento ao final quando ajudar os menus a abrir de volta em direção à área principal de conteúdo ou evitar aglomeração nas bordas.
- Menus de contexto devem priorizar o contexto do ponteiro e aparecer próximo ao ponto de interação, em vez de imitar a ancoragem de botões.
- Popovers de select devem preservar uma relação estável com a largura e as bordas do trigger sempre que for prático.
- Mantenha o offset do menu pequeno e consistente, para que o menu pareça preso ao seu trigger, deixando espaço suficiente para separação por borda e sombra.
- Aumente o offset apenas quando necessário para evitar colisão de bordas, fusão de sombras ou aglomeração de layout.

### Tabs e Estados de Seleção

- Tabs inativas padrão permanecem neutras
- Tabs ativas usam um contraste de superfície mais forte, não blocos preenchidos com a marca
- Use `bg-selected` para linhas de lista ou tabs selecionadas quando apropriado

### Chat, Ferramentas e UI de Desenvolvedor

- Bolhas de chat seguem a hierarquia de contêineres, começando em `rounded-xl`. Cascas principais de entrada de chat podem manter `rounded-2xl` sob a exceção aprovada.
- Saída de ferramentas, blocos com aparência de terminal, caminhos, hashes e comandos devem tender ao monoespaçado
- A UI de Diff deve usar cores semânticas específicas de diff, não cores genéricas de success/destructive
- Painéis operacionais densos são preferidos em vez do estilo de card de marketing

## Elevação e Profundidade

O ZCode deve usar profundidade contida. Crie camadas primariamente através de contraste de background, bordas e raio antes de recorrer a sombras pesadas.

Níveis de elevação recomendados:

- **Base**: sem sombra; a estrutura vem do contraste de background
- **Surface**: separação muito sutil liderada por borda
- **Overlay**: `shadow-md` para menus, popovers, diálogos
- **Attention**: `shadow-lg` apenas para toast, cards flutuantes importantes ou painéis enfatizados raros

Regras de profundidade:

- Não dependa de sombras grandes e suaves para o layout comum.
- Menus e diálogos podem parecer elevados, mas ainda compactos e controlados.
- O camadas de background geralmente é mais importante que a força da sombra.

## Movimento

- Mantenha as transições rápidas e discretas.
- Prefira fade, zoom e deslize direcional sutis para overlays.
- O movimento deve esclarecer a mudança de estado, não decorar a tela.
- Evite animações longas, com mola ou lúdicas no workspace principal.

## Layout do workspace

O conteúdo de workspace do desktop e do Web em telas largas usa frames independentes de conversa, terminal inferior e Side Pane. O frame de conversa contém o WorkspaceHeader e a conversa; o terminal opcional tem seu próprio frame abaixo dele, e o Side Pane possui sua própria barra de tabs. Os frames usam seu próprio background e borda, com gaps redimensionáveis de 4px correspondentes ao inset externo do macOS. As alças de redimensionamento mantêm uma área de clique transparente de 4px e mostram uma linha de 2px em foreground terciário (`foreground-subtlest/50`) no hover, foco ou arraste. O indicador se estende ao longo da borda do painel, com inset pelo raio do painel em ambas as extremidades, com pontas arredondadas e sem máscara. Frames de layout não contam para os níveis de raio de conteúdo. O controle remoto mobile mantém sua apresentação de coluna única com drawer. Veja [workspace independent panels](docs/design/workspace-independent-panels.md) para os detalhes de chrome por plataforma e os limites de persistência.

## Comportamento Responsivo

O produto é desktop-first, mas a UI deve permanecer funcional em telas menores.

Regras:

- Comece com um layout base estável e depois aprimore com breakpoints.
- Use breakpoints principalmente para mudanças de layout, largura, visibilidade e densidade.
- Não altere o significado semântico dos componentes entre breakpoints.
- Prefira alterar `max-width`, `grid`, `flex` e visibilidade em vez de mudar a identidade do componente.
- Preserve as ações primárias em todos os breakpoints; não esconda fluxos de trabalho essenciais atrás de affordances exclusivas de desktop.

### Papéis dos breakpoints

| Breakpoint | Uso preferido |
| --- | --- |
| `sm:` | Largura de diálogo, arranjo de botões, correções de layout em telas pequenas |
| `md:` | Colunas de grid e expansão do layout de formulários |
| `lg:` | Visibilidade de toolbar de desktop e densidade de informação secundária |
| `xl:` | Arranjos de chat e conteúdo complexo |
| `2xl:` | Limites de largura de leitura em telas largas, não comportamento comum de página |

Comece com o layout sem prefixo e depois adicione o mínimo de breakpoints necessário. Prefira alterar
layout, `max-width` e visibilidade a alternar repetidamente dimensões fixas ou cores,
bordas e raios semânticos. Mantenha as ações essenciais disponíveis abaixo dos breakpoints de desktop.
Diálogos devem reutilizar padrões como `sm:max-w-*`; grids crescem a partir de uma coluna, em vez de
começar largos no desktop e serem reduzidos repetidamente. Corrija o layout base instável antes
de adicionar sobrescritas de breakpoint.

## Acessibilidade e Internacionalização

- Suporte navegação por teclado como um caminho de interação de primeira classe.
- Preserve o estilo de foco de componente estabelecido no repositório. Não adicione um outline compartilhado com `!important` aos descendentes de diálogo, aos controles remotos ou à navegação de configurações. Inputs compostos usam sua borda externa ou ring existentes, sem um outline interno adicional. Isso também se aplica no modo forced-colors; test IDs não são contratos de estilo.
- Garanta que o contraste permaneça seguro nos modos claro, escuro e Zai.
- Escreva layouts que tolerem traduções mais longas.
- Evite significado apenas por ícone quando um rótulo de texto for prático.
- Use cores de status semânticas junto com texto legível, nunca apenas por cor.

## Orientações de Implementação

- Reutilize utilities semânticos existentes do Tailwind antes de adicionar novos tokens.
- Reutilize as primitivas de componente em `packages/ui/src/components/ui/` antes de inventar variantes pontuais.
- Siga a densidade e as proporções de componente já estabelecidas no repositório.
- Se surgir uma nova necessidade de UI, primeiro decida se ela pertence à estrutura, à superfície, à interação ou ao estado. Depois escolha os tokens de acordo.
- Em caso de dúvida, prefira uma UI mais discreta e uma hierarquia de informação mais forte.

## Faça

- use tokens de cor semânticos de forma consistente
- preserve a distinção entre background de página, card e superfícies de overlay
- mantenha os controles compactos e operacionais
- use a hierarquia de texto para expressar densidade
- use monoespaçada para valores técnicos e conteúdo semelhante a comandos
- suporte todos os temas distribuídos
- projete para as restrições de renderização de desktop, web e multiplataforma
- considere localização e rótulos longos

## Não faça

- use cores pontuais cruas no trabalho comum de UI
- preencha superfícies grandes com a cor da marca
- adicione raios, sombras, larguras ou alturas arbitrários sem um motivo de sistema estável
- deixe menus e diálogos arejados quando deveriam ser densos
- use cores semânticas de erro ou sucesso para decoração não semântica
- crie componentes que só parecem corretos em um tema
- troque clareza por novidade visual em telas com muitas ferramentas

## Progresso de conexão remota (RDUX-03)

`--color-progress-surface` / `--color-progress-surface-foreground` expressam trabalho em andamento, incluindo conexão, recuperação automática e atualização. Use `bg-progress-surface` com `text-progress-surface-foreground`; o foreground também pode colorir indicadores de progresso e bordas. Quatro temas definem o par e todos os backgrounds pais devem manter um contraste de texto de 4.5:1.

Mapeamento de estado remoto: conectado → success (nuvem neutra nas linhas de projeto); conectando/atualizando → progress; desconectado → surface neutra / foreground sutil; precisa de atenção → warning; falhou → destructive. Os tokens SSH/WSL/Docker são reservados para rótulos de tipo de conexão, nunca para status de conexão. Sempre inclua texto de status visível fora do estado conectado; tentativas de recuperação são texto visível. Consulte a especificação de UX de dispositivos remotos para o mapeamento autoritativo e o glossário.

Texto auxiliar legível do remoto: `--color-remote-foreground-muted` / `text-remote-foreground-muted` é usado no assistente remoto, nos cards de dispositivo e no texto auxiliar de log, nos rótulos de dispositivo da barra lateral e na navegação de configurações; o alternador de visão de tarefa/projeto compartilhado da barra lateral, as ações de agrupamento e os atalhos de busca também seguem este nível de texto auxiliar legível, `#595959` no tema claro e `#b3b3b3` no escuro, mantendo pelo menos 4.5:1 sobre sidebar / popover / surface / card / selected / background. O foreground do rótulo de tipo SSH no Zai Light é `#0867ce`, mantendo pelo menos 4.5:1 sobre o fundo `#ebf4ff`.
