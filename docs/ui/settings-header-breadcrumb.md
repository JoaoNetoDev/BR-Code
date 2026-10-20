# Breadcrumb do topo em Settings

## Objetivo

A área de arraste da janela no topo do painel de conteúdo de Settings exibe a hierarquia atual, ajudando o usuário a manter a noção de posição entre as seções e os detalhes dentro de uma seção.

```text
当前分区 > 分区内部详情...
```

## Contrato de produto

- O primeiro nível é, por padrão, o título da seção atual de Settings, sem exibir um nó raiz fixo "Ajustes". Ao entrar na gestão de plugins pelo marketplace de plugins independente, o primeiro nível pode projetar o nó de origem `Plugin Marketplace`, que atravessa o limite de Settings, para preservar o caminho de volta do usuário; quando se entra diretamente por Settings, o primeiro nível continua sendo `Plugins`.
- Com apenas o primeiro nível, a barra superior permanece vazia; o breadcrumb só aparece ao entrar em uma navegação de página de segundo nível ou mais profundo.
- Uma seção pode acrescentar níveis de detalhe somente leitura. Project Memory acrescenta sequencialmente o nome do projeto e o nome do arquivo, formando `Memory > projeto > arquivo`.
- O breadcrumb apenas projeta o estado de navegação existente, não sendo dono nem persistidor desse estado. Exceto o nível atual, os níveis superiores reutilizam a ação de retorno já existente da seção e voltam ao nível correspondente ao clicar; o nível atual permanece como texto somente leitura.
- O separador usa `ChevronRight` e `text-foreground-subtlest`; os níveis superiores usam botões `ghost + default`, com `text-foreground-subtle` por padrão e `text-foreground` no Hover; o último nível usa o texto principal. Todos os níveis são truncados em uma única linha e não podem ocupar a área segura à direita do Help, do caption menu do Linux ou dos caption controls do Windows.
- O container do path de Settings usa padding horizontal `px-2.5`, mantendo consistência com a densidade compacta da barra de título.
- Os níveis do breadcrumb e os dois lados do separador usam uniformemente `gap-0`; o espaçamento vem do próprio padding do conteúdo de cada nível.
- O texto do nível atual usa o mesmo tamanho de fonte, altura de linha e padding horizontal `px-2` de `text-ui-base/relaxed`, igual a `Button size="default"`.
- O container do breadcrumb mantém `pointer-events-none`, e os botões de nível superior restauram individualmente `pointer-events-auto` e `[app-region:no-drag]`; a barra de título fora dos botões continua como `[app-region:drag]`.
- Quando o breadcrumb chega ao segundo nível, o grande título de seção duplicado no exterior de Settings é ocultado (por exemplo `Memory`), e o botão Back original da página de detalhes é removido; a ação de retorno passa a estar uniformemente a cargo do botão de nível superior do breadcrumb. As páginas de primeiro nível restauram o grande título de seção. O caminho de origem do marketplace de plugins é a exceção: o primeiro nível de `Plugin Marketplace > Plugins` é uma origem externa, e não a seção atual, então a área de conteúdo continua exibindo o grande título `Plugins`, garantindo que o título da página atual fique claro após entrar na gestão de plugins; depois de entrar nos detalhes de um plugin, MCP ou Skill, o nível intermediário `Plugins` é preservado.
- O título do conteúdo atual de criação/edição de Command, Subagent, MCP e Hook usa `text-ui-xl`.
- O grande título da section externa de Settings usa `text-ui-settings-title lg:text-ui-settings-title-lg`, preservando no tamanho de fonte padrão a altura de linha de 24px / 32px em telas estreitas e de 30px / 36px a partir de `lg`, escalando conforme o ajuste de tamanho de fonte da interface. Usa tokens semânticos dedicados, evitando classes de tamanho de fonte genéricas que violariam a verificação do design system.
- Model Settings e Usage Stats não usam breadcrumb; elas sempre mantêm o grande título na área de conteúdo. A navegação interna de providers de Model Settings e as abas de Usage Stats são trocas dentro da mesma página e não são promovidas a nível de página.
- Desktop, Web comum e Mobile reutilizam a mesma semântica de hierarquia; em ambiente não-Electron basta ignorar os estilos de app-region.

## Cadeia de estado

```text
SettingsPage.activeSection ----------------+
                                           |
active section page-level navigation state +--> breadcrumb items --> header
```

Os subníveis só participam da exibição quando a seção à qual pertencem está ativa. Depois de trocar de seção, os detalhes antigos não podem vazar para outra seção.

## Escopo de cobertura

- Memory: projeto, arquivo.
- Plugins: detalhes de plugin e gestão de plugins instalados; o nome do nível atual nos detalhes e nos cartões da lista, assim como o título dos detalhes, usam uniformemente o nome de exibição localizado, e não o canonical name interno. Quando não há `displayName` configurado, nomes separados por `-` / `_`, como `cloudbase-skills`, são formatados como `Cloudbase Skills`. Ao entrar diretamente nos ajustes de plugins, o caminho começa em `Plugins`; ao entrar pelo marketplace de plugins, começa em `Plugin Marketplace`, mantendo o nível intermediário `Plugins` na página de gestão e nas subpáginas de plugin, MCP e Skill.
- Subagents, MCP, Commands, Hooks: páginas de criação ou edição.
- Automação: páginas de criação ou edição de tarefas agendadas e de tarefas ociosas.
- A navegação de providers/planos de Model Settings, as abas de Usage Stats, e os detalhes, caixas de confirmação, autorização, sincronização, busca, filtros, scope e abas internas de formulário da seção independente Skills não são níveis de página e não entram no breadcrumb. Os detalhes da aba de Skill dentro de Plugins pertencem a uma subpágina de gestão de plugins e entram no breadcrumb pelo caminho de plugin.

## Aceitação

| ID    | Setup            | Action             | Assertions                                 |
| ----- | ---------------- | ------------------ | ------------------------------------------ |
| SHB01 | Settings General | abrir os ajustes          | a barra superior não mostra breadcrumb e mantém a área de arraste e a margem segura à direita |
| SHB02 | lista de projetos do Memory | abrir o Memory      | a barra superior não mostra breadcrumb |
| SHB03 | detalhes de projeto do Memory | clicar no projeto   | exibe `Memory > Nome do projeto` |
| SHB04 | corpo de arquivo do Memory | clicar no arquivo  | acrescenta o nome do arquivo |
| SHB05 | detalhes do Memory | voltar ou trocar de seção | o breadcrumb encolhe junto e não deixa níveis antigos |
| SHB06 | corpo de arquivo do Memory | clicar no botão do projeto | volta à lista de arquivos do projeto e o breadcrumb encolhe para dois níveis |
| SHB07 | qualquer página de segundo nível | clicar no botão da seção | reutiliza a ação de retorno daquela seção para voltar à página de primeiro nível |
| SHB08 | qualquer página de segundo nível | entrar nos detalhes | oculta o grande título de seção externo e não mostra Back duplicado |
| SHB09 | Model Settings | trocar de provider ou plano | sem breadcrumb na barra superior e grande título continuamente visível na área de conteúdo |
| SHB10 | Usage Stats | trocar de aba de uso | sem breadcrumb na barra superior e grande título continuamente visível na área de conteúdo |
| SHB11 | lista de plugins em Settings | abrir os detalhes do plugin | exibe `Plugins > Example Plugin` |
| SHB12 | marketplace de plugins | abrir os detalhes de um plugin do mercado | exibe `Plugin Marketplace > Example Plugin` |
| SHB13 | marketplace de plugins | clicar em gerenciar instalados | exibe `Plugin Marketplace > Plugins` e mantém o grande título `Plugins` na área de conteúdo |
| SHB14 | gestão de plugins de origem do mercado | abrir subpágina de plugin, MCP ou Skill | exibe `Plugin Marketplace > Plugins > página atual`; clicar em `Plugins` volta à página de gestão |