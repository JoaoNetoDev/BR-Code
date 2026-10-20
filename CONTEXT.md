# Loja de Plugins do ZCode (Plugin Store)

Glossário de domínio da página de configurações de plugins e da experiência de navegação/instalação de marketplaces. O redesenho de loja de 2026-07 introduziu uma série de termos que causam confusão; este arquivo é a única fonte de arbitragem.

## Language

### Marketplaces e fontes

**Official Marketplace (marketplace oficial)**:
O único canal de distribuição operado oficialmente pelo ZCode, com id de marketplace `zcode-plugins-official`; conteúdo = plugins built-in + plugins de CDN. É um "canal de distribuição", não uma "atribuição de autoria" — pode conter plugins de autores da comunidade.
_Evitar_: chamar o claude-plugins-official de "marketplace oficial"; usar "oficial" para qualquer marketplace confiável

**Builtin Plugin (plugin integrado)**:
Plugin distribuído junto com o pacote da aplicação e semeado no Official Marketplace na inicialização. É um subconjunto dos plugins oficiais.
_Evitar_: plugin pré-instalado, bundled plugin (aceitável na fala; na documentação, use sempre "integrado")

**CDN Plugin (plugin de CDN)**:
Plugin do Official Marketplace distribuído como zip verificado por sha256 via CDN oficial, com download e instalação sob demanda.
_Evitar_: plugin de rede, plugin online

**Personal Source (fonte pessoal)**:
Qualquer fonte de plugins adicionada pelo próprio usuário: claude-plugins-official, marketplaces git/GitHub/URL/diretório local, plugins inline.
_Evitar_: marketplace de terceiros (o claude-plugins-official também se encaixa nesta categoria; "terceiros" seria um rótulo incorreto)

**Catalog Auto-Refresh (atualização automática de catálogo)**:
Atualização em segundo plano com throttle do catálogo do Official Marketplace ao entrar na página da loja, imperceptível para o usuário; cobre apenas o marketplace oficial.
_Evitar_: confundir com Manual Refresh; chamá-lo de "verificar atualizações" (o badge de atualização é apenas um subproduto da atualização)

**Manual Refresh (atualização manual)**:
Atualização de todos os marketplaces disparada pelo botão de atualizar na barra superior da página da loja, sem sofrer o throttle da atualização automática.
_Evitar_: "atualizar", "verificar atualizações" (aceitável na fala; na documentação, use sempre "atualização manual")

### Estrutura da página da loja

**Public Segment (segmento público)**:
Um dos segmentos da página de listagem da loja, exibindo os itens mantidos pela equipe de produto no marketplace oficial; o campo de publicação `publisherType` é `official` e, quando o catálogo antigo não informa o campo, o padrão é público.
_Evitar_: tab oficial, tab da loja

**Community Segment (segmento comunitário)**:
Plugins externos mantidos por terceiros e incluídos no marketplace oficial; publicados a partir de `external_plugins/` com `publisherType: community`, como dimensão independente das categorias de finalidade.

**Personal Segment (segmento pessoal)**:
O outro segmento da página de listagem da loja, exibindo o catálogo de todas as fontes pessoais, agrupado por marketplace.
_Evitar_: tab de terceiros, tab "meus"

**Featured (destaque)**:
Bloco de curadoria no topo do segmento público; a lista é controlada remotamente pelo campo `featured` do catálogo do CDN oficial. Existe apenas no segmento público.
_Evitar_: confundir com Recommended

**Recommended (recomendado)**:
Bloco de curadoria no topo do segmento pessoal; a lista é mantida pelo `recommendedPlugins.json` do repositório (atualmente recomenda os plugins em destaque do claude-plugins-official). Existe apenas no segmento pessoal.
_Evitar_: confundir com Featured

**Manage Installed View (visão de gerenciamento de plugins)**:
A entrada "gerenciar plugins" no canto superior direito do mercado abre a visão de gerenciamento dentro da mesma página; mantém o padrão global e as sobrescritas por projeto, permite voltar à navegação preservando busca, origem e escopo de gerenciamento. O menu adicional oferece apenas pausar/ativar e desinstalar; atualizar e restaurar herdados usam operações independentes.

**UI Plugin (plugin de interface)**:
O manifesto declara `ui.surfaces` válidos e o diretório de publicação carrega `componentTypes: ["ui", …]`. Enquanto não está instalado, valem as capacidades do catálogo; depois de instalado, vale o manifesto real; pausar não muda a classificação. Titularidade, finalidade e capacidade de UI são dimensões independentes. A área dedicada de UI e a busca ficam restritas ao segmento de origem atual.

**Default UI Recommendations (recomendações padrão de interface)**:
Lista curada independente no Side Pane, distribuída pelo campo `uiPluginRecommendations` da interface de configuração do cliente, associada ao catálogo completo do marketplace e capaz de recomendar plugins não instalados ou não ativados; ao clicar, o cliente instala, ativa ou abre o painel real. A instalação em desenvolvimento e a instalação do usuário não entram automaticamente, ao contrário da área de UI completa do marketplace.

### Metadados

**Store Listing (informações da loja)**:
Metadados de exibição carregados pela entrada do catálogo: nome de exibição, ícone, categoria, desenvolvedor, links de site/política de privacidade/termos de serviço, imagem hero, prompts de exemplo. Descreve "como o plugin é apresentado na loja" e não afeta a funcionalidade do plugin.
_Evitar_: metadados do plugin (ambíguo; pode se referir ao manifest)

**Plugin Manifest (manifesto do plugin)**:
Definição funcional do `plugin.json` dentro do pacote do plugin (commands/agents/skills/hooks/mcpServers/userConfig…). Descreve "o que o plugin é e o que faz".
_Evitar_: marketplace.json (isso é o catálogo, não o manifesto)

**Example Prompt (prompt de exemplo)**:
Prompt clicável fornecido pelo Store Listing; ao clicar, cria uma nova sessão e pré-preenche (não envia automaticamente). É a única entrada de "nova sessão" da página de detalhes (o antigo botão "Experimentar agora" foi removido em 2026-07-14).
_Evitar_: comando rápido, template de prompt, "experimentar agora"

### Estados de ciclo de vida

**Plugin Lifecycle (ciclo de vida do plugin)**:
O caminho completo de produto percorrido pelo usuário, desde a descoberta do plugin, passando por visualização, instalação, configuração, ativar/desativar, uso, verificação de atualizações, upgrade, restauração persistida, até a desinstalação ou a restauração de um plugin integrado. Cada estágio deve verificar tanto o estado visível da UI quanto o resultado correspondente de persistência ou de runtime.
_Evitar_: tratar "instalação bem-sucedida" como o ciclo de vida completo

**Restorable Builtin (plugin integrado restaurável)**:
Builtin Plugin desinstalado pelo usuário e colocado em estado persistido de supressão. A aplicação não deve resemear automaticamente na reinicialização; ele continua aparecendo no Public Segment, e a restauração limpa é feita pela entrada "Instalar".
_Evitar_: plugin de CDN não instalado, plugin integrado temporariamente desativado

**Orphaned Installed Plugin (plugin instalado órfão)**:
Plugin cuja Personal Source correspondente foi excluída, mas cujo diretório de instalação e dados do usuário permanecem preservados. Ele ainda pode ser usado, configurado, ativado/desativado e desinstalado; não pode ser atualizado enquanto a fonte não for readicionada, e a associação de catálogo é restaurada ao readicionar a mesma fonte.
_Evitar_: instalação corrompida, manifest ausente, plugin desinstalado
