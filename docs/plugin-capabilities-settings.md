# Página de Configuração de Capacidades de Plugin

## Objetivo

A página de configurações mantém apenas uma entrada chamada `plugin`, com o section id oficial `plugin`, gerenciada de forma centralizada por `PluginsSection.tsx` para os Plugins, MCPs e Skills já configurados; MCP, habilidades, comandos e Hooks são seções independentes que reutilizam o mesmo shell de capacidades, detalhadas em «Convergência das páginas de configuração independentes». O antigo id `customize` é removido por completo e não participa de tipos, resolução ou migração; os valores de navegação históricos `plugins`, `mcp` e `skills` servem apenas para a migração de compatibilidade. O mercado de plugins é uma página principal de Workspace no mesmo nível da automação, renderizada por `PluginStorePage.tsx`, e não faz parte da página de configurações.

## Arquitetura de Informação

As Agent capabilities da barra lateral de configurações seguem sempre a ordem `Memory → subagentes → plugin → MCP → habilidades → comandos → Hooks`; a entrada de plugin usa o ícone `Blocks` e a entrada de MCP usa o ícone `Cable`. Os servidores diretos na lista de MCPs continuam usando `Server`, para distinguir a capacidade de navegação da instância de serviço concreta.

```text
Plugin（设置页导航）
└─ 插件（页面标题）
   ├─ Scope：User / Workspace 1 / Workspace 2 / ...
   ├─ Plugins：当前 Scope 已安装插件
   ├─ MCPs：当前 Scope MCP 与待处理状态
   └─ Skills：当前 Scope Skill，按自身与插件来源分组
```

O Scope no topo e as Tabs de capacidade são dois estados independentes: trocar o Scope preserva a Tab atual, e trocar a Tab preserva o Scope atual. Na primeira entrada, User e Plugins são selecionados por padrão. O Scope é uma fronteira de dados estrita compartilhada pelos três Tabs e não exibe itens herdados de outros Scopes.

Na linha de controle superior, o Scope e as Tabs de capacidade ficam à esquerda, e à direita fica a caixa de busca da Tab atual. Quando a caixa tem conteúdo, o lado direito usa um botão de ícone `X` para limpar a busca da Tab atual, e não um controle nativo de fechamento de texto do navegador; o botão reaproveita o tamanho `icon-sm` do `Button` e usa `rounded-full`, com ícone `size-3.5`. Plugins busca nome e origem do plugin, MCPs busca nome do servidor e conteúdo de configuração, e Skills busca nome e descrição; a busca dos três Tabs ignora maiúsculas e minúsculas. Cada Tab mantém seu próprio termo de busca; ao trocar de Scope, a filtragem do novo Scope continua usando o termo de busca da Tab atual. Quando Plugin usa a caixa de busca do topo, ela não repete as caixas de busca internas que MCPs/Skills já tinham; as páginas independentes de MCP e Skills mantêm a interação de busca original.

## Semântica de Scope

- `User` exibe Plugins instalados pelo usuário, Built-in Plugins, MCP/Skills independentes do usuário, além dos MCP/Skills contribuídos por esses Plugins. Na Tab de Plugins, os Built-in ficam abaixo do grupo Installed e são contados separadamente; Built-in não entram na contagem de Installed.
- Workspace exibe os Plugins instalados naquele Workspace, os MCP/Skills independentes daquele Workspace, além dos MCP/Skills contribuídos por esses Workspace Plugins.
- O menu de Scope só exibe Workspaces que podem ser conectados no momento: diretórios locais indisponíveis são ocultados; uma identidade/target remoto sem o `remoteSessionId` correspondente é considerada não conectada e é ocultada. Workspaces locais disponíveis usam `Folder`, e Workspaces remotos conectados usam `Cloud`; o botão gatilho e os itens do menu precisam usar a mesma semântica de ícone. Quando a seleção atual fica inválida, a página de configurações retorna ao scope User.
- A atribuição de recursos contribuídos por plugin segue o scope de instalação do plugin de destino; `Skill.scope=plugin` ou a origem de um MCP de plugin, por si só, não permite contornar o Scope.
- Built-in é determinado pela ausência de registro de instalação no marketplace e por `source=official` no runtime, e pertence ao User Scope; quando existe registro de instalação, ele deve seguir o scope user/workspace do registro, sem que o uso do cache oficial leve a um falso Built-in.
- O título do grupo Plugins usa texto principal em tamanho base, e a quantidade usa texto secundário em tamanho sm, evitando que a quantidade dispute o nível visual com o nome do grupo.
- O contêiner de ícone da lista de Plugins usa `bg-background`, diferenciando-se do nível `bg-surface` da lista.
- Clicar no item de plugin da lista entra na página de detalhes inline, reutilizando o `PluginStoreDetailView` da loja de plugins (introdução, Hero, prompt de exemplo, lista de capacidades e área de informações), e não abre mais um diálogo de gerenciamento simplificado; no estado instalado, as ações de habilitar/desabilitar, atualizar, desinstalar e configuração avançada continuam reutilizando o mesmo conjunto de ações. Ao entrar nos detalhes, o Scope/Tabs/Search são ocultados, e o breadcrumb da página de configurações retorna à lista.
- A entrada da loja de plugins na linha de título Installed aparece como `New`, usando o variant default do Button, o tamanho default e `rounded-lg`.
- Os Tabs superiores Plugins, MCP e Skills são exibidos como `Name count`; o count usa texto secundário em tamanho sm e é atualizado conforme o Scope atual, o termo de busca e o resultado do filtro da lista. Os três painéis de conteúdo são pré-carregados por meio de `forceMount` e, ao mesmo tempo, usam `data-[state=inactive]:hidden` para garantir que apenas o item ativo fique visível, garantindo que todas as contagens carreguem sem precisar clicar em um Tab e sem que os conteúdos fiquem lado a lado.
- O count do Tab superior usa `text-foreground-subtle` no item ativo e o `text-foreground-subtlest`, ainda mais fraco, no item inativo; nome e contagem compartilham o mesmo estado de seleção, mas preservam a hierarquia textual.
- A lista de MCPs reutiliza a hierarquia visual de Plugins: contêiner sem borda `bg-surface`, hover de linha `bg-hover`, contêiner de ícone arredondado `bg-background` e um elemento de divisória independente `bg-border/50`; os estados de MCP, os marcadores de origem, a autorização e as interações de switch permanecem inalterados.
- MCP, Skills e Commands adotam de forma unificada a arquitetura de informação «Installed direto + um grupo separado por Plugin». Configurações diretas entram apenas em Installed; MCPs de plugin são agrupados pelo `pluginId` estável, com título usando o display name normalizado do Plugin e a quantidade filtrada. Plugins com o mesmo nome, mas ids diferentes, não são mesclados.
- O Needs Attention global e o grupo plano de Plugins são removidos. Estados como autorização, falha de conexão e desativação não alteram a atribuição do recurso; as linhas que exigem ação ficam antes das linhas normais apenas dentro do seu próprio grupo.
- Depois do nome de um MCP de plugin, não se repete User/Workspace, marketplace ou o Badge `Plugin`; o título do grupo já expressa a origem. Status, botão de autorização, contagem de ferramentas e informações de diagnóstico específicos de MCP continuam sendo mantidos.
- A linha de um MCP contribuído por plugin usa, no início, o ícone da loja do plugin de destino, associado ao listing por pluginId e reaproveitando o `PluginStoreAvatar`; sem ícone ou em caso de falha de carregamento, usa o fallback unificado desse componente. MCPs diretos usam o ícone Cable.
- Os títulos de grupo Plugins e MCPs do Plugin usam uniformemente `h-7 items-center`, garantindo a mesma altura nos títulos Installed, Built-in, Needs Attention e Plugins.
- MCPs de plugin não exibem a descrição de página “Manage MCP server configurations used by ZCode Agent.”; as ações Import e New ficam à direita do título do grupo Installed e referenciam o botão New de Plugins, usando tamanho default e `rounded-lg`. A página normal de configurações de MCP mantém a descrição e a área original de operações Import/Create no topo, e as operações de sincronização remota não são movidas junto.
- Quando o Scope atual realmente não tem instalação direta, o Installed de Plugins exibe a orientação Browse plugins, e o Installed de MCPs exibe as orientações New MCP server e Import; quando existem Built-in ou recursos contribuídos por plugin, a orientação vazia do Installed é mantida. Quando existe termo de busca, cada Tab exibe apenas os grupos com correspondências: quando o Installed direto é 0, o título, a quantidade e as ações New/Import são ocultados junto; Built-in, Needs Attention e os grupos por origem de plugin seguem a mesma regra. Quando nenhum grupo tem resultado, exibe-se apenas o feedback unificado «sem correspondências» com borda tracejada transparente, evitando que um resultado de busca vazio seja confundido com «não instalado».
- O contêiner compartilhado de orientação «ainda não instalado» de Plugins, MCPs e Skills, assim como os estados vazios de Plugin sem correspondência ou indisponível, usam fundo transparente e borda tracejada `border-border`, sem se confundirem com a lista normal `bg-surface`; os botões de ação dentro do contêiner usam uniformemente `size="lg"`. O estado de loading do Plugin reutiliza o mesmo nível de contêiner e o mesmo respiro.
- Plugin Skills mantém a estrutura de origem «habilidades diretas do Scope atual + um grupo separado por plugin». O grupo de habilidades diretas é uniformemente chamado de `Installed`, e o Scope é expresso apenas pelo seletor do topo; depois do nome da habilidade não se repetem mais os rótulos User, Workspace ou Plugin. Título do grupo, contêiner da lista, divisória explícita, cor de fundo do ícone e hover de linha ficam alinhados aos de MCPs; à direita do título ficam apenas Import e New, sem oferecer refresh manual, e a lista é atualizada automaticamente após importações, criações, sincronizações ou alterações de habilitação. Skills não oferecem um menu de filtro por estado de habilitação, e a lista sempre inclui as habilidades habilitadas e desabilitadas do Scope atual. Quando o Scope atual não tem habilidades diretas, exibe-se a orientação de criação ou importação, e as habilidades de plugin continuam exibidas agrupadas por plugin; um resultado de busca vazio não exibe a orientação de instalação.
- As habilidades diretas de Plugin Skills usam o ícone padrão WandSparkles; as habilidades de plugin exibem o ícone do plugin através do marketplace listing correspondente, com fallback para o ícone padrão quando não há plugin correspondente.
- O título dos grupos de plugin em Plugin Skills reaproveita `formatCanonicalPluginName` para a conversão de nome, mantendo consistência com o nome de exibição de plugin em Plugins e MCPs; nesse caso, os tokens `mcp`, `aws` e `zcode` são sempre exibidos como `MCP`, `AWS` e `ZCode`, enquanto a key interna do grupo continua usando o nome normalizado original.
- A ação de autorização de MCP usa uniformemente o botão variant link `<ExternalLink size-4> Authenticate`, com `text-sky-500 dark:text-sky-400` explícito e as cores de hover correspondentes; não se pode usar `text-brand`, que no tema Zai fica preto/branco. MCPs diretos e MCPs de plugin permanecem consistentes.
- O ícone padrão de um MCP direto é sempre Cable, e MCPs de plugin usam o ícone do plugin correspondente. O dot de status dos dois tipos de MCP é sobreposto uniformemente no canto inferior direito do contêiner de ícone e deixa de ocupar espaço na linha do nome; o contêiner pai é fixado em `size-4 bg-background` com conteúdo centralizado, e o ponto estático usa `size-2.5`, garantindo que a dimensão externa não oscile ao alternar para o estado rotativo de «conectando». As cores de status e o Tooltip com o motivo permanecem inalterados.
- Ao entrar nas subpáginas de criação ou edição de MCP, a barra de ferramentas de Scope, Tabs e Search do Plugin é ocultada, e o espaçamento superior do estado de lista é removido; ao voltar à lista após salvar, excluir ou cancelar, a barra de ferramentas é restaurada.
- Os formulários de criação/edição de MCP reaproveitam o menu completo de Scope do topo (User e todos os Workspaces da janela atual), e não mais o Select simplificado com apenas User/Workspace. Ao abrir, o formulário de criação captura um snapshot do Scope do pai; o formulário de edição exibe e bloqueia a atribuição real do recurso, evitando que uma edição migre a configuração implicitamente. Trocar de Scope dentro do formulário de criação altera apenas o destino desta gravação e não modifica o Scope do pai; depois de fechar o formulário, o pai continua exibindo a seleção anterior à abertura do formulário.
- A alternância entre os modos Form/JSON do formulário de MCP reaproveita as Tabs de seção de configurações dos detalhes de automação em Settings/History, com um invólucro circular `bg-surface`, item ativo circular `bg-background`; os dois pontos são mantidos pelo mesmo componente genérico, sem duplicar classes visuais.
- Antes de salvar um novo MCP, é obrigatório resolver o workspace target concreto conforme o Scope do formulário e aguardar o carregamento completo da configuração MCP correspondente a `workspacePath + workspaceIdentity`; User usa o diretório de usuário do host disponível, e Workspace grava no `.zcode/config.json` do Workspace escolhido. Durante a troca de destino, não se pode usar o path do workspace anterior nem o remote directory service.
- Workspace não mistura recursos de User; User não mistura recursos de nenhum Workspace; e Workspaces diferentes também não compartilham a projeção de recursos.
- A lista de Workspaces vem das workspace tabs abertas na janela atual, mantendo a ordem das etiquetas e deduplicando por workspace identity.
- Workspace exibe o tab label; a key de identidade precisa usar `workspaceIdentity?.trim() || workspacePath`.
- O User no menu de Scope usa o ícone `Monitor`, expressando a configuração de usuário da própria máquina; quando existe nome de usuário, a etiqueta `User` é exibida apenas após o nome de usuário no dropdown. Depois de selecionar User, o gatilho do topo exibe somente o Monitor e o nome de usuário, sem repetir a etiqueta. Sem nome de usuário, exibe-se apenas o texto localizado de User. Workspace continua usando o ícone Folder e não exibe a etiqueta User.
- As chamadas de serviço continuam passando o `workspacePath` real; um workspace remoto passa também `workspaceIdentity`, `remoteSessionId` e `remoteTarget`.
- Depois de fechar o workspace selecionado, há retorno para User; quando o host de que o User depende está indisponível, exibe-se um estado vazio de indisponibilidade, sem iniciar outro runtime.

## Tab de Plugins

- O título é `Installed N`, e apenas os plugins instalados no Scope atual são exibidos.
- A linha exibe ícone, nome do plugin e origem.
- `New` entra na entrada do mercado de plugins; os botões de gerenciamento da área Installed do mercado de plugins também retornam a esta Tab.
- Clicar em uma linha comum entra no detalhe completo e reutilizado do plugin; a linha da lista oferece diretamente as ações de habilitar/desabilitar, atualizar e desinstalar, sem criar um segundo conjunto de estado de instalação.

## Tab de MCPs

- Itens que precisam de autenticação, com configuração ausente ou com conexão anômala permanecem no seu grupo direto ou de Plugin e são exibidos primeiro dentro do grupo.
- MCPs contribuídos por plugin expressam a origem pelo grupo do Plugin específico; itens autenticáveis oferecem a ação principal `Authenticate`.
- Há uma entrada fixa `New MCP Server / Add a Custom MCP Server`, para criar um MCP no Scope atual.
- MCPs diretos ficam em Installed, e MCPs de plugin são agrupados pelo display name do Plugin específico; as três páginas reutilizam o mesmo componente de título de grupo, contêiner de lista, espaçamento e divisória explícita.

## Tab de Skills

- Primeiro filtra estritamente por Scope e depois agrupa por origem. As Skills pertencentes ao próprio Scope atual ficam no grupo `User` ou do workspace; Skills contribuídas por plugin são agrupadas pelo display name do plugin específico.
- O título do grupo exibe a quantidade; cada linha exibe ícone, nome, descrição e mais ações.
- `New` afeta apenas o Scope gravável atual e não grava arquivos nos grupos de contribuição de plugin.

## Estado e Temporização

```text
scope/tab change
      │
      ▼
resolve workspace target ──失败──> unavailable empty state
      │
      ▼
request with path + identity
      │
      ├─ target key unchanged ──> commit result
      └─ target key changed   ──> discard stale result

parent scope ── open new ──> form scope snapshot
server owner ── open edit ─> locked form scope
form scope change ────────> resolve form-only target
save ────────────────────> await target config -> persist
cancel/save ─────────────> restore unchanged parent scope
```

O desktop mantém a cadeia `desktop-continuous`; o controle remoto do celular mantém a cadeia `web-remote-replayable`. Plugin só consome os serviços de shared-host existentes, não cria novos hosts local/remoto e não altera a semântica de snapshot, queue, owner ou recuperação de reconexão.

## Responsividade e Acessibilidade

- No desktop, o topo exibe Scope e Tabs na mesma linha; em telas estreitas, a quebra de linha é permitida e os Tabs podem rolar horizontalmente.
- O menu de Scope é limitado à largura visível em telas estreitas; nomes longos de workspace são truncados, mas o accessible name completo é preservado.
- Todos os gatilhos suportam operação por teclado e foco visível; botões de ícone devem fornecer um accessible label localizado.
- Usar cores semânticas, tamanhos de fonte `text-ui-*` e componentes básicos existentes como Button, Tabs e DropdownMenu, compatíveis com os temas claro, escuro e Zai.

## Aceitação

1. A página de configurações exibe apenas uma entrada de gerenciamento de capacidade 「插件」, sem exibir Plugin nem a antiga entrada do mercado de plugins.
2. O conteúdo de configurações de plugin exibe por padrão User + Plugins; o 「插件」 do Workspace Sidebar abre a página principal independente do mercado de plugins.
3. O menu de Scope lista User e todos os workspaces abertos, isolando por workspace identity.
4. A seleção dos três Tabs é mantida após a troca de Scope, a lista exibe somente os dados do Scope alvo, e MCP/Skills contribuídos por plugin precisam estar associados ao registro de instalação de plugin do Scope atual.
5. A caixa de busca do topo acompanha a Tab com o placeholder e as regras de filtro correspondentes; os termos de busca dos três Tabs são independentes entre si, e a busca continua filtrando o Scope atual após a troca de Scope.
6. Desktop e Web no celular funcionam; nenhum runtime novo é adicionado e a fronteira de replayable remoto não é quebrada.
7. Depois de o pai selecionar User ou qualquer Workspace e abrir New, o formulário exibe o mesmo Scope; o formulário de criação pode selecionar a lista completa de Scopes e, após a troca, a seleção do pai permanece inalterada, com a gravação indo para o alvo escolhido no formulário. O formulário de edição exibe a atribuição real do MCP e não permite migração.

## Convergência das Páginas de Configuração Independentes

- A barra lateral de configurações registra sete seções oficiais sob Agent capabilities: `memory`, `subagents`, `plugin`, `mcp`, `skill`, `commands` e `hooks`, com base no registro de `settingsPageConfig.ts`; `plugin`, `mcp` e `skill` compartilham o mesmo shell de gerenciamento de capacidades. A página de Plugin continua com os três Tabs Plugins, MCPs e Skills; as seções independentes de MCP e Skill vão direto às mesmas listas de MCP/Skill, sem duplicar a implementação de lista, Scope, busca ou CRUD.
- As entradas que reutilizam o mesmo shell compartilham o modelo de estado de Scope: o filtro User/Workspace, a atribuição de recursos contribados por plugin e a passagem da workspace identity remota precisam permanecer consistentes. As páginas independentes de MCP/Skill ocultam os Tabs de capacidade alternáveis, mas mantêm um separador vertical e o texto de contagem somente leitura `MCPs N` / `Skills N` à direita do Scope, com a busca e a lista correspondente continuando à direita; a quantidade é atualizada conforme o Scope atual e o resultado da busca.
- O antigo `customize` deixa de existir; ao encontrar esse valor, ele é tratado como seção de configuração inválida, limpo e revertido; o histórico `plugins` migra para `plugin`, o histórico `skills` migra para `skill`, e `mcp` passa a ser diretamente a entrada oficial.
- `McpSettingsSection` e `SkillsSection` mantêm apenas o modo embutido de Plugin; remover o título explicativo, a busca interna, a lista de grupos antigos, as etiquetas de Scope e o layout de operações do cabeçalho que eram exclusivos da página independente.
- As capacidades de carregamento, edição, importação, criação, habilitação, exclusão, autenticação, diagnóstico e sincronização remota de MCP/Skills permanecem inalteradas; continuam sendo executadas pelo `workspacePath` real e isoladas por `workspaceIdentity?.trim() || workspacePath`.
- Essa convergência altera apenas a navegação de configurações e o contrato dos componentes de exibição; não modifica os serviços, o protocolo nem o formato de persistência de MCP/Skills, e não altera a cadeia desktop continuous nem a cadeia mobile replayable.
- Os botões de gerenciamento da área Installed do mercado de plugins entram diretamente na Tab de Plugins da página de configurações 「插件」; o mercado de plugins deixa de manter uma subpágina independente «gerenciar instalados», evitando duas listas de instalados, dois filtros e duas entradas de detalhe em paralelo.

# Integração da capacidade de Commands

- O gerenciamento de Plugins expõe três Tabs de capacidade: Plugins, MCPs e Skills. Commands não é uma Tab da página de Plugin.
- Commands continua sendo uma entrada independente das Settings e continua reutilizando o shell de capacidades com escopo compartilhado. Os commands fornecidos por plugin permanecem visíveis ali, em grupos de plugin.
- O scope pai User/Workspace controla tanto os commands visíveis quanto o destino padrão dos novos commands criados. O scope User inclui commands diretos do usuário e commands de plugins de escopo user; o scope Workspace inclui commands diretos do projeto e commands de plugins de escopo workspace.
- New/Edit Command reaproveita o mesmo `PluginScopeMenu` do cabeçalho de capacidades do pai. New herda o scope do pai e pode selecionar outro scope disponível; Edit exibe o scope persistido do command e desabilita a migração de scope. O menu do formulário é alinhado ao final.
- Commands seguem as mesmas convenções de cabeçalho, busca, loading, estado vazio de busca, estado vazio de instalação, lista agrupada, fundo, divisória, ícone e dimensionamento de ações que Skills.
- Commands diretos aparecem em Installed. Commands de plugin são agrupados pelo display name canônico do plugin e usam o ícone do plugin correspondente quando disponível.

## 2026-09-16 Localização de Plugins e entrada de adição

A lista de gerenciamento de Plugins e o feedback de habilitação/desabilitação são associados ao listing da loja pelo pluginId completo, e nome e descrição usam a mesma resolução localizada da loja; traduções ausentes fazem fallback para o texto original. Plugins com o mesmo nome em marketplaces diferentes não compartilham metadados. A busca de Plugins cobre nome/descrição no idioma atual e também nome original, ID e marketplace, ignorando maiúsculas e minúsculas; compartilha com o mercado a busca por pinyin completo e por iniciais do nome chinês (por exemplo feishu, fs), também suportada na interface em inglês. Veja [Convenção de busca](plugin-creator.md#插件搜索).

O antigo botão New da visão User passa a ser um menu 「添加」, com 「创建插件」 e 「添加插件市场」; a criação apenas pré-preenche a referência ao Skill oficial plugin-creator, e a adição de marketplace passa pelo diálogo unificado da loja. A visão de configuração por Workspace permanece sem entrada de marketplace. O contrato e a aceitação estão em [Entrada de criação de plugin](plugin-creator.md).