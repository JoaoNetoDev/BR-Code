# Especificação de UI/UX do Plugin Marketplace V2 —— Redesenho da loja de plugins

> Reescrita completa em 2026-07-14. Esta versão refaz a página de configurações de plugins como uma "página de loja de plugins" de exibição,
> substituindo a arquitetura de informação da versão de 2026-06, com「Installed / Marketplace」em duas tabs e barra lateral de troca de mercado.
> A IA antiga, a estratégia de limite por agrupamento de mercado, o layout da página de navegação e afins estão integralmente revogados (conteúdo no git history);
> As especificações ainda válidas e herdadas por esta versão são: o protocolo de detalhes de componentes sob demanda `plugins/describe`, a enumeração autoritativa de componentes do CLI
> (`ZCodePluginInfo.components`), o princípio de degradação honesta e a renderização em duas linhas「nome — descrição」.
>
> Os termos seguem o [CONTEXT.md](../CONTEXT.md) na raiz; decisões-chave em
> [ADR-0001（listing fica na camada de catálogo）](./adr/0001-store-listing-in-marketplace-catalog.md) e
> [ADR-0002（desvio deliberado do estilo contido do DESIGN.md）](./adr/0002-plugin-store-style-deviation.md).

## Contexto e objetivos

Visual e interação das páginas de listagem e de detalhe:

- Página de listagem: título grande + subtítulo, caixa de busca de largura total, faixa de instalados (engrenagem à direita), segmentação público/pessoal,
  grande seção Featured + fluxo de cartões em duas colunas por blocos de categoria, todos os grupos expandidos por padrão, com recolhimento manual.
- Página de detalhe: icon grande + nome + descrição de uma linha,「…」e「立即试用」no canto superior direito, cápsulas de prompt de exemplo embutidas na imagem hero,
  descrição longa, seções de componentes como「MCP 服务器」「技能」, seção「信息」(desenvolvedor/categoria/versão/site/
  política de privacidade/termos de serviço).

A segmentação pública corresponde ao mercado oficial `zcode-plugins-official` (plugins embutidos + plugins zip do CDN, fonte de catálogo
`https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json`); a segmentação pessoal abriga todas as demais
fontes pessoais (claude-plugins-official, mercados adicionados pelo usuário, inline).

### Identidade única do mercado oficial e contrato de merge

`zcode-plugins-official` é o único id do mercado oficial da ZCode. Plugins embutidos e plugins do CDN não são dois mercados,
mas duas fatias de catálogo do mesmo mercado; não se deve mais registrar, exibir ou gerar o mercado `zcode-plugins` nem
ids de plugin `<name>@zcode-plugins`.

```text
应用内置目录分片 ─┐
                  ├─ 按 name 合并（CDN 优先）─> zcode-plugins-official/marketplace.json
CDN 目录分片 ─────┘                    └─ 所有插件 id: <name>@zcode-plugins-official
```

Decisões de limite (confirmadas pelo usuário em 2026-07-15):

| Limite           | Decisão                                                                               | Poda / não objetivo                                             |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Identidade do mercado | Embutidos e CDN usam uniformemente `zcode-plugins-official`                         | Não se mantém alias `zcode-plugins` nem se migram dados de teste antigos |
| Semântica de refresh | O refresh do mercado oficial substitui apenas a fatia do CDN e a remergeia com a fatia embutida atual do app | O refresh do CDN não pode apagar nem reescrever o cache de plugins embutidos |
| Conflito de nome    | A entrada de mercado do CDN tem prioridade e a entrada de diretório embutida homônima é ignorada | Isso altera apenas a escolha do catálogo mesclado, sem apagar nem reescrever o cache embutido do app |
| Fonte de atualização | A fatia embutida muda com a versão do app; a fatia do CDN muda com o refresh do mercado | Não se transforma o binário de plugin embutido em hot update via CDN |
| UI                 | O gerenciamento de fontes de mercado mostra apenas um mercado oficial da ZCode, com refresh | Não se exibe uma linha de source embutido nem uma linha de source do CDN |

Propriedade do estado e persistência:

| Estado                        | Fonte autoritativa                                                  | Projeção local                                            | Evidência de verificação     |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| Fatia de catálogo embutida    | bundle do app atual / assets SEA                                     | snapshot da fatia embutida no catálogo do mercado oficial | teste unitário de seed, cache marker |
| Fatia de catálogo do CDN      | manifesto do CDN oficial                                              | snapshot da fatia do CDN no catálogo do mercado oficial   | teste unitário de refresh, resposta de rede |
| Catálogo mesclado             | as duas fatias acima mescladas por name                             | `marketplaces/zcode-plugins-official/marketplace.json`     | testes de overview / install |
| Fonte de mercado e hora de refresh | o único registro `zcode-plugins-official` em `known_marketplaces.json` | resumo de marketplace na UI                    | resultado de protocolo, página de configurações |

Casos de regressão aceitos:

| Caso                         | Setup                          | Ação                      | Asserções                                                   | Evidência               |
| ---------------------------- | ------------------------------ | ------------------------- | ----------------------------------------------------------- | ----------------------- |
| `official-merge-initial`     | novo storage, apenas fatia embutida do app | abrir a página de plugins | mercado oficial único; plugins embutidos visíveis; source apontando para o CDN | manifest + overview     |
| `official-merge-refresh`     | fatia embutida existente, CDN devolve plugin novo | atualizar o mercado oficial | o plugin novo usa `@zcode-plugins-official`; os plugins embutidos ainda existem | manifest + protocolo    |
| `official-merge-conflict`    | o CDN contém uma entrada com o mesmo nome de uma embutida | atualizar o mercado oficial | a entrada do CDN é mantida e a entrada de diretório embutida homônima é ignorada | manifest + teste de adapter |
| `official-merge-reseed`      | fatia do CDN já em cache       | reiniciar / reseed dos plugins embutidos | as entradas do CDN ainda existem; o catálogo mesclado é reconstruído com a nova fatia embutida | teste de filesystem     |

Desktop, web e celular compartilham o `IPluginManagementService` e o mesmo contrato de storage do CLI; esta rodada não adiciona
client mode, workspace identity ou ramo replayable. Testes unitários de UI representativos cobrem os componentes compartilhados, e o runtime usa
CDP do desktop para verificar a interação de refresh. O espaço de estados do E2E de conversation não é afetado e, portanto, o catálogo de casos de conversation não é modificado.

## Não objetivos (não feitos nesta rodada, YAGNI)

| Item                                                                                 | Motivo / âncora futura                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interruptor individual de ligar/desligar MCP server / skill (Switch por linha e engrenagem na linha de MCP) | O backend só tem `plugins/setEnabled` em nível de plugin. Nesta rodada a seção de componentes **apenas lista, sem interruptores**; o interruptor individual exige nova configuração de desativação por componente + método de protocolo + efeito no runtime (merge de MCP, descoberta de skills), em outra iteração. |
| Pills duplas「插件 / 技能」no topo | Skills são uma área de configuração independente e não são mescladas nesta rodada.                                                                                        |
| Dropdown「本地 / 远程」no topo | A entrada existente de sincronização remota SSH é recolhida na visão de instalados gerenciados, sem troca de visão.                                                       |
| Scaffold「新建插件」                                             | O botão New do topo abre diretamente「添加市场源」nesta rodada.                                                                                                            |
| Ícones de filtro/ordenação à direita da linha de segmentação público/pessoal | A semântica não está definida e os blocos de categoria já cobrem a navegação; omitido por enquanto.                                                           |
| Avaliações, número de downloads, renderização de README       | Sem fonte de dados.                                                                                                                                                        |

### Lacunas conhecidas do E2E de Lifecycle

O caso de lifecycle de gestão de plugins de 2026-07-15 só estabelece contratos verdes para as entradas hoje existentes e com semântica de produto já confirmada.
As entradas abaixo são inconsistentes com a especificação ou com a capacidade subjacente e são registradas como bug candidates; nesta rodada de E2E elas não são mascaradas
contornando a UI ou afrouxando as asserções:

| Bug candidate                    | Fato atual                                                                       | Limite do teste nesta rodada                        |
| -------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| Entrada de cancelamento de instalação ausente | O botão de instalar só mostra loading/disabled; o protocolo tem capacidade de cancelar, mas a UI da loja não tem ação de cancelar | Verificar o estado busy da instalação, sem alegar cobertura de cancelamento |
| Entrada Validate/Diagnose de origem ausente | Adicionar origem faz validação; a página de gerenciamento de origens só expõe atualização e remoção | Cobrir adição com validação, atualização e remoção, sem alegar cobertura de diagnóstico independente |
| Uninstall exposto para plugins inline | O menu genérico da loja renderiza a remoção, mas inline não tem registro de instalação de marketplace para um uninstall normal | Cobrir apenas exibição e disponibilidade de inline, sem executar a remoção |

### Semântica dos plugins instalados ao remover uma Personal Source

Remover uma origem remove apenas a descoberta de catálogo e a relação de atualização, sem cascatear a remoção de plugins já instalados, configurações ou dados. Depois que um plugin entra no
estado `Orphaned Installed Plugin`, ele continua presente na faixa de instalados, na página de detalhe e na página de gerenciamento, e continua suportando configuração, ligar/desligar,
execução e remoção; a entrada de atualização precisa ser ocultada ou desabilitada, com um aviso honesto de origem ausente. Depois de adicionar a mesma origem novamente,
o plugin recupera os detalhes de catálogo e a capacidade de atualização. A decisão completa está em
[ADR-0003](./adr/0003-marketplace-source-removal-keeps-installed-plugins.md).

## Arquitetura de informação

A área de conteúdo da página de configurações de plugins é totalmente substituída pela **página de loja de plugins** (o hospedeiro permanece: continua em Settings → seção 插件,
sem mexer na navegação global nem no contêiner `SettingsPage`). Três visões:

```mermaid
flowchart TD
    Store["商店列表页（默认）"]
    Detail["插件详情页"]
    Manage["管理已安装视图"]

    Store -- "点卡片 / 点已安装条图标" --> Detail
    Detail -- "← 返回（保持分段与滚动位置）" --> Store
    Store -- "已安装条右侧齿轮" --> Manage
    Manage -- "← 返回" --> Store
    Manage -- "点插件行" --> Detail

    Store -- "顶栏 New → 添加市场源" --> AddSource["添加市场源浮层（现有能力收编）"]
    Store -- "顶栏齿轮 → 市场源管理" --> Sources["市场源管理（更新/校验/删除已有源）"]
    Detail -- "Try now" --> NewPluginDraft["标准新建任务（只预填 canonical Plugin 引用，不自动发送）"]
    Detail -- "示例提示词" --> NewPromptDraft["标准新建任务（canonical Plugin 引用 + 提示词预填，不自动发送）"]
```

A alternância entre visões ocorre dentro do mesmo contêiner (mantendo o padrão existente de troca no local list↔detail), sem novas rotas.

## Especificação da página de listagem

De cima para baixo:

### 1. Barra superior

- Esquerda: nada (a tab「插件/技能」não é feita). À direita, o grupo de ações, nesta ordem:
  - **Refresh**(Manual Refresh): dispara `plugins/marketplace/update(null)`（todos os mercados), reutilizando o estado de loading existente; não é afetado pelo throttling do refresh automático.
  - **Catalog Auto-Refresh**(refresh automático de catálogo): após entrar na página da loja, atualiza apenas `zcode-plugins-official`,
    com o critério `now - max(lastUpdated, lastAttemptAt) >= 10 minutos`. `lastUpdated` vem da persistência de catálogo em nível de usuário do Host;
    `lastAttemptAt` é o horário de tentativa dentro do módulo do Renderer, com placeholder ao iniciar, preservado ao remontar a página entre navegações
    e zerado ao reiniciar o processo. Falhas dentro da janela e requisições em voo não são reiniciadas ao reentrar na página; um refresh manual bem-sucedido atualiza o tempo persistido.
    Não se adiciona polling por timer, nem busca automática de `claude-plugins-official` ou de origens pessoais, evitando que mercados Git ainda não carregados executem requisições com timeout longo a cada entrada. O refresh automático não mostra toast de atualização disponível e mantém o feedback de loading/erro existente.
    Desktop e Web compartilham esta UI e este serviço, sem alterar user inventory, workspaceIdentity ou o roteamento de requisições.
  - **Engrenagem**: entra em **gerenciamento de fontes de mercado** — a capacidade existente de gerenciamento de marketplace source muda de lugar (lista origens existentes:
    atualizar/validar/remover/diagnosticar).「Adicionar」não fica aqui.
    As linhas de origem de mercado são ordenadas pelas regras a seguir: `zcode-plugins-official` e `claude-plugins-official` ficam fixos no topo;
    as demais origens customizadas são ordenadas por `lastUpdated` decrescente; origens customizadas sem `lastUpdated` vão para o fim; em caso de empate de horário, ordenação estável pelo nome de exibição localizado.
  - **New**: botão de icon com texto usando `default`, `size="lg"`, que abre diretamente「添加市场源」, recolhendo as capacidades existentes do AddMarketplacePopover de
    github / git / URL / caminho local (incluindo arrastar e soltar). Zero adição de backend.

O diálogo「添加插件市场」e o diálogo「市场源」usam uniformemente título `text-ui-lg`, corpo `text-ui-base` e informação auxiliar.
Os botões de ação de texto do diálogo de adição usam `size="lg"`; as ações só com ícone dentro da linha de origem de mercado usam `size="icon-lg"`.
As caixas de entrada mantêm a altura padrão do componente com `size="lg"`, sem sobrescrever a altura.

As ações à direita do título na página de detalhe seguem o tamanho unificado da página de configurações: o menu "mais" usa `outline + icon-lg` e hospeda
as ações de habilitar/desabilitar; a linha do título não exibe um `Switch` separado. Try now e o botão de instalar usam `size="lg"`. Try now
usa o raio padrão do botão e não herda o raio de cápsula do prompt do Hero; a ação de prompt na área do Hero mantém o raio de cápsula.
O grupo de ações é alinhado verticalmente ao centro e os cartões da lista continuam usando o tamanho compacto.

### 2. Área de título

- Título grande no nível Display「插件」+ um subtítulo (redação da ZCode, i18n bilíngue; texto final definido na implementação).

### 3. Caixa de busca

- Largura total, bordas arredondadas, prefixo de lupa, placeholder「搜索插件」.
- Nomes em chinês suportam pinyin sem tom e iniciais (feishu, fei shu, fs), e a interface em inglês também usa o nome em chinês presente no listing. Compartilha o matcher com a página de gerenciamento, sem correspondência aproximada de erros de digitação nem alteração de ordenação.
- **O escopo da busca atravessa público + pessoal**(mantendo a lógica de busca total existente). Quando a entrada não está vazia, o layout de segmentação/Featured/categoria
  cede lugar a um fluxo unificado de cartões de resultado (duas colunas, o mesmo estilo de cartão); limpar restaura.

### 4. Faixa de instalados (Installed Strip)

- Correção de recorte de 2026-09-15: o viewport de rolagem horizontal precisa reservar espaço para o botão de atualização no canto superior direito, o zoom no hover e o anel de foco por teclado; o lado esquerdo do primeiro item e o lado direito do último item também não podem ser recortados, e a caixa de dica do nome não pode cobrir o canto de atualização. Mantém-se o alinhamento original dos ícones, o espaçamento superior e a capacidade de rolagem horizontal, com estilos compartilhados entre desktop e web móvel. O layout é de responsabilidade exclusiva de `PluginStoreListView`, sem alterar o comando de atualização nem o estado de instalação.

- Uma fileira de ícones de plugins instalados (incluindo os embutidos), com PDF, PPT, Excel e Word oficiais priorizados nesta ordem, e os demais plugins embutidos/inline ordenados de forma estável pelo nome de exibição;
  os demais plugins instalados de mercados são ordenados por tempo de instalação decrescente, com transbordo em rolagem horizontal.
- Ao passar o mouse ou focar por teclado um ícone, exibe-se o nome do plugin no Tooltip unificado do app.
- Clicar no ícone → página de detalhe daquele plugin.
- Título「已安装」no início da linha e **engrenagem → gerenciar a visão de instalados** no fim.
- Os ícones da Faixa de Instalados mantêm a opacidade original do recurso e não ficam globalmente mais transparentes conforme o estado de habilitação; o estado de habilitação é expresso
na visão「管理已安装」.
- Quando há plugins atualizáveis (`canUpdatePluginItem`, excluindo plugins órfãos), um botão de atualização circular `size-4` é sobreposto no canto superior direito do ícone
(fundo success + ícone `Download`, virando spinner durante a atualização), e o clique dispara a atualização no local, sem precisar entrar na
página de detalhe; fica desabilitado enquanto alguma operação de plugin estiver em andamento.
  > Revisão de 2026-09-02: antes, a entrada de atualização só ficava escondida na área recolhida de「高级信息」da página de detalhe, e depois que o usuário conferia as atualizações não dava para ver
  > qual plugin tinha atualização nem encontrava a entrada. A faixa de instalados, o cartão e a visão de gerenciamento de instalados expõem de forma unificada o canto e a
  > entrada de atualização na linha, e o julgamento reaproveita o mesmo `canUpdatePluginItem`.

### 5. Segmentação público / pessoal

- Controle de segmentação em pílulas, com「公开」por padrão. Trocar altera apenas o conteúdo do catálogo abaixo; a caixa de busca e a faixa de instalados permanecem.

### 6. Conteúdo da segmentação pública

- **Grande seção Featured**: a lista vem do `featured: string[]` de nível superior do catálogo do CDN (na ordem). O título da seção é
  "Featured" (i18n). Cartões em duas colunas.
- **Blocos de categoria**: os demais plugins são agregados por `category`, todos expandidos por padrão. Acima de 6 cartões, a entrada "recolher" é mantida;
  depois que o usuário recolhe manualmente, apenas os 6 primeiros são exibidos e o restante é recolhido em uma linha no rodapé: `[小 icon do 前 3 个] 查看 A、B，以及另外 N 个`,
  e o clique expande novamente. Nesta rodada não há recolhimento automático por quantidade, e os grupos recém-criados também aparecem expandidos por padrão; a escolha manual do usuário é preservada na página atual. Plugins sem `category` vão para a seção「其他」(por padrão no final).
- Categorias e plugins dentro de cada categoria suportam ordenação enviada pelo servidor conforme o modo de interface; veja
  [contrato de ordenação por modo](plugins/plugin-store-mode-order.md). O modo de programação usa `code` e o modo geral usa
  `work`; itens não configurados são adicionados na ordem original, e a configuração explícita permite reposicionar「其他」. Destaques e as demais listas não são afetados.
- O Divider de título do bloco de categoria usa a cor semântica `surface`; o padding superior e inferior soma 32px (16px cada), formando um espaçamento estável de 32px entre categorias vizinhas. Esse espaçamento vale apenas para as categorias de catálogo e não altera o layout da busca,
  da Faixa de Instalados ou do controle de segmentação.
- Plugins **embutidos** desinstalados (recuperáveis) aparecem normalmente na segmentação pública, e o botão do cartão é「安装」（via
  `plugins/restoreBuiltin`）.
- O nome de exibição de categoria segue um mapeamento conhecido de i18n (como `productivity` → 生产力/Productivity）,
  e category desconhecida é exibida como está.
- A categoria de guias já foi fundida em utilitários, e o cache do antigo diretório `guides` também foi fundido em `utilities`. `legal` aparece como
  Legal/Legal, seguindo a regra de exibir o bloco apenas quando há plugins; nenhuma Legal plugin nova é adicionada agora.

### 7. Conteúdo da segmentação pessoal

- Exibição agrupada por mercado dos plugins candidatos de cada fonte pessoal (título do grupo = nome de exibição do mercado), com grupos em `lastUpdated`
  decrescente — o mercado atualizado/adicionado mais recentemente fica no topo (ao chegar aqui após adicionar, ele é a primeira coisa vista); mercados sem horário de atualização
  vão para o fim e, em caso de empate ou ausência, a ordenação alfabética pelo nome de exibição é o fallback. Cartões em duas colunas dentro do grupo, todos expandidos por padrão, com o mesmo comportamento manual de recolher/expandir das categorias públicas.
- Plugins inline e mercados de diretório local são exibidos igualmente em grupo.
- A seção de recomendados (Recommended) foi desativada: a segmentação pessoal não coloca mais no topo a lista curada interna.

### 8. Cartões

- Estrutura: ícone (40px, cantos arredondados) · nome de exibição (negrito) · descrição truncada em uma linha · ações à direita.
- Ações à direita: não instalado → botão de cápsula「安装」(virando spinner durante a instalação, cancelável, mantendo o fluxo de operações existente);
  instalado → menu「…」: habilitar/desabilitar, atualizar(somente quando há atualização e a origem ainda existe), remover
  (a remoção passa pelo diálogo de confirmação existente).
  > Revisão de 2026-07-17: os cartões da loja em duas colunas permanecem compactos e não repetem o Switch de nível de plugin; ligar/desligar continua possível pelo
  > menu「…」. Quando for necessário ver explicitamente o estado atual de habilitação, o cabeçalho da página de detalhe e a visão「管理已安装」continuam
  > oferecendo um Switch de nível de plugin visível (o interruptor individual de componentes continua fora do escopo desta rodada, ver os limites do ADR).
- Quando instalado e com atualização disponível: o canto「可更新」é acrescentado à direita do título (ícone `Download` `size-3` +
  `settings.plugins.list.updateAvailable`, cápsula com cor semântica success, `text-ui-sm`, lado a lado com a especificação do badge de plano); a área de ações à direita ganha um botão de cápsula「更新」antes do menu「…」(virando spinner durante a atualização),
  e o item de atualizar do menu「…」é mantido. A condição de exibição do canto e do botão é exatamente a mesma da entrada de atualização da página de detalhe.
- Clicar no corpo do cartão (fora da área de botões) → página de detalhe.

## Especificação da página de detalhe

De cima para baixo, coluna única centralizada (max-width conforme o design):

1. **Cabeçalho**: após o ícone grande (64px), o nome de exibição e as ações permanecem na mesma linha horizontal:
   `显示名 | 插件级启停 Switch | 「…」菜单 | Try now / 安装`. O nome de exibição pode encolher e truncar,
   a área de ações não encolhe; a descrição de uma linha e o aviso de origem ausente ocupam a linha seguinte sozinhos e não podem ficar entre o nome e as ações.
   - **Switch de ligar/desligar do plugin**(quando instalado e há runtime info, explicitando o estado).
   - Menu「…」: igual ao menu do cartão (habilitar/desabilitar, atualizar, remover); plugins órfãos não exibem o item de atualizar antes de a origem ser reassociada.
   - Botão principal: instalado →「立即试用 / Try now」; não instalado →「安装」.
     Clicar em「立即试用」reaproveita a ação padrão de nova tarefa do Root, preenchendo apenas
     a mention estruturada `[@Plugin](plugin://stable-id)`, sem anexar texto de exemplo e sem enviar automaticamente.
2. **Área do Hero**(renderizada apenas se houver `heroImage`): imagem de banner arredondada, sobre a qual são empilhadas verticalmente as **cápsulas de prompt de exemplo**
   (de `examplePrompts`, cada uma: ícone do produto de documentos + prefixo com o nome do plugin + prompt + botão →). Os exemplos de Document Skills
   usam `documents@2x.png`, `pdf@2x.png`, `spreadsheets@2x.png` empacotados com a UI: DOCX/Word mapeia para documents, PDF mapeia para pdf e XLSX/Excel/CSV mapeia para spreadsheets; quando não reconhecido, há fallback para documents,
   sem exibir novamente o avatar do plugin.
   O banner no desktop adota uma proporção baixa e larga de cerca de `3:1` com cantos muito arredondados, e no celular mantém uma altura mínima; por baixo, reaproveita o gradiente colorido com pontos de luz, sensível ao tema, do `ThemeHeroVisual` do diálogo de onboarding, com a imagem sobreposta de forma semitransparente e uma máscara escura leve.
   Sem imagem, com imagem transparente ou em caso de falha de carregamento, o fundo colorido é mantido e não degrada para uma lista comum de botões.
   Os prompts são dispostos no centro visual com a largura natural do conteúdo. As cápsulas usam fundo escuro semitransparente e raio grande, o corpo permite quebra de linha
   e não é truncado em linha única; o nome do plugin usa uma cor enfraquecida, o prompt usa branco principal e a seta fica em uma superfície circular fraca independente.
   Clicar em uma cápsula → a mesma ação padrão de nova tarefa do Root usada por「立即试用」, que sai de Settings e preenche
   `[@Plugin](plugin://stable-id) + espaço + prompt de exemplo` na caixa de entrada, **sem envio automático**.
   O link canônico precisa reutilizar o construtor do Picker `@` do Composer, e o lado do Agent continua reconhecendo apenas o destination stable ID,
   sem criar um segundo estado de referência de Plugin. Quando o plugin não está instalado, clicar na cápsula primeiro orienta a instalação (equivalente a clicar em「安装」）,
   permanecendo na página de detalhe e sem criar sessão; depois de concluída a instalação, um novo clique entra no rascunho.
   Sem `heroImage` mas com `examplePrompts` → lista apenas de cápsulas sem imagem; sem nenhum dos dois → a área inteira não é renderizada.
3. **Descrição longa**: `description` do listing (por locale, pega `description_i18n`, com fallback `description`).
4. **Seções de componentes**: na ordem「MCP 服务器」「技能」「命令」「子智能体」「Hooks」,
   renderizando apenas grupos não vazios. Cada seção: título + contador + divisor + linhas de itens (avatar de ícone pequeno/iniciais + nome +
   descrição truncada), com o mesmo estilo de linha aplicado às cinco categorias. **Nesta rodada não há interruptor individual nem engrenagem na linha**(ver não objetivos).
   Os ícones de recurso devem manter a mesma semântica das listas de configurações: servidores MCP usam `Server`, skills usam
   `WandSparkles`, comandos usam `Terminal`, subagentes usam `Bot` e Hooks usam `Anchor`;
   a página de detalhe não pode criar um conjunto próprio de ícones aproximados e inconsistentes.
   - A fonte de dados não muda: instalado → `ZCodePluginInfo.components` (enumeração autoritativa do CLI);
     candidato não instalado → busca sob demanda com `plugins/describe` (regras de loading / degradação por falha / cache mantidas da V1:
     em caso de falha, fallback para rótulos de componentTypes + aviso honesto, nunca inventando).
5. **Seção de informações**: duas colunas rótulo-valor: 开发者 · 类别 · 版本 · 网站 ↗ · 隐私政策 ↗ · 服务条款 ↗.
   Os links usam ícone de link externo, abrem no navegador do sistema e só permitem https. Os valores seguem a "prioridade de listing"; se uma linha não tiver valor, a linha inteira é omitida.
6. Detalhes de Hook, itens de configuração de userConfig, rootPath e afins: seção recolhida「更多详情」,
   reaproveitando o `PluginConfigControls` existente e a renderização de detalhes de hook, fora da camada visual principal. Havendo atualização e origem ainda existente,
   a área recolhida exibe acima dela o aviso e o botão de atualização; plugins órfãos não podem exibir essa entrada de atualização.

Plugins de fontes pessoais seguem o mesmo layout de detalhe e convergem naturalmente pela matriz de degradação (normalmente sem hero/área de prompts, com avatar de iniciais e
seção de informações reduzida ao fallback de manifesto com desenvolvedor/site/versão).

## Modelo de dados e extensões de schema

### Completude de ícones do mercado oficial da Claude

O catálogo upstream de `claude-plugins-official` não garante `icon` para cada plugin. Ao atualizar esse mercado, o Agent
pode obter um mapeamento opcional de ícones a partir do CDN da ZCode em
`https://cdn-zcode.z.ai/zcode/official-plugin/assets/icon-sources.json` e, pelo `name` do plugin, completar as entradas de catálogo sem `icon`:

- Vale apenas para `claude-plugins-official`; mercados adicionados pelo usuário, plugins inline e instalações órfãs não aplicam o mapeamento por nome,
  evitando que plugins homônimos entre mercados usem o ícone errado.
- O `icon` próprio da entrada do marketplace tem prioridade e o mapeamento não pode sobrescrevê-lo.
- O mapeamento consome apenas `name`, `icon`, `mimeType` e `sha256`; campos de proveniência de material não podem entrar no protocolo, nos logs ou na UI.
- O `icon` precisa ser um caminho PNG relativo e seguro, e a URL final sempre cai sob
  `https://cdn-zcode.z.ai/zcode/official-plugin/assets/`.
- O manifesto do mercado é o dado mestre e o mapeamento de ícones é um aprimoramento opcional. Falha no download ou no parse do mapeamento não pode fazer a atualização do mercado falhar;
  havendo cache antigo, ele continua em uso e, sem cache ou sem acerto, há degradação para o ícone Blocks padrão.
- O mapeamento é obtido e cacheado na etapa de atualização do marketplace; `plugins/overview` não inicia uma requisição de rede de ícone por entrada.
- Migração de dados existentes: quando o processo do Agent processa pela primeira vez o `plugins/overview` de um determinado plugin storage, ele dispara um enriquecimento icon-only em background, best-effort, para o catalog `claude-plugins-official` existente. O overview retorna imediatamente o
  catalog atual; a migração não rebaixa o marketplace do Git, não modifica `lastUpdated`, não mantém o lock do plugin storage durante a obtenção pela rede, e só o trava brevemente antes de gravar, relendo o manifesto. Falhas não afetam o overview e são retentadas no próximo início do processo do
  Agent; o resultado da completude fica visível a partir dos overviews seguintes.

```text
update claude-plugins-official
  ├─ fetch marketplace manifest
  └─ fetch icon-sources.json（失败可降级）
            ↓
     校验并缓存 name → icon
            ↓
     仅补齐缺失 listing.icon
            ↓
     plugins/overview → PluginStoreAvatar

existing catalog after upgrade
  → first plugins/overview returns current catalog immediately
  → background fetch/cache icon-sources.json（网络阶段不持锁）
  → acquire plugin storage lock
  → re-read + enrich cached claude-plugins-official/marketplace.json
  → later plugins/overview → PluginStoreAvatar
```

### Novos campos nas entradas de catálogo do CDN / do mercado (todos opcionais)

O `marketplace.json` de nível superior já tem `name` / `description(_i18n)` / `owner` / `plugins[]`; adiciona-se:

| Campo                                     | Nível     | Tipo                                     | Uso                                                   |
| ---------------------------------------- | --------- | ---------------------------------------- | ----------------------------------------------------- |
| `featured`                                | superior  | `string[]`(plugin name)                | lista e ordenação do Featured da segmentação pública  |
| `displayName` / `displayName_i18n`        | entrada   | `string` / `Record<locale,string>`       | nome de exibição no cartão/detalhe(fallback `name` slug) |
| `icon`                                    | entrada   | `string`(URL https ou caminho relativo no pacote) | ícone do cartão, da faixa de instalados e do cabeçalho de detalhe |
| `homepage`                                | entrada   | `string`(URL https)                   | seção de informações·site                              |
| `privacyPolicy`                           | entrada   | `string`(URL https)                   | seção de informações·política de privacidade           |
| `termsOfService`                          | entrada   | `string`(URL https)                   | seção de informações·termos de serviço                 |
| `heroImage`                               | entrada   | `string`(URL https ou caminho relativo no pacote) | banner hero da página de detalhe                       |
| `examplePrompts` / `examplePrompts_i18n`  | entrada   | `string[]` / `Record<locale,string[]>`  | cápsulas de prompt da área hero                       |
| `requiresPaidPlan`                        | entrada   | `boolean`(só `true` tem efeito)        | badge cor de damasco do plano de programação à direita do título no cartão/detalhe |

Os campos já disponíveis continuam sendo repassados: `category`, `author{name,url?}`, `description_i18n`, `keywords`.

- Aviso de plano pago: `requiresPaidPlan` só tem efeito com o booleano explícito `true`, e formas ambíguas como
  `"true"` / `1` são sempre tratadas como sem plano, evitando que um erro no catálogo acople um aviso pago a um plugin gratuito. O campo descreve a "condição de uso"
  (é preciso ter um plano pago para que funcione bem) e não significa que o próprio plugin seja um produto pago — é uma marca puramente de exibição e não participa de gate de instalação
  nem de faturamento. O nome é deliberadamente não ligado a nenhum nome comercial de plano, para que uma mudança de nome ou de redação do plano não obrigue a mudar o campo.
- Cartão e título de detalhe usam o visual de cápsula cor de damasco, com um pequeno ícone de coroa `size-3` antes do texto; no tema claro usa-se como referência o fundo `#FFE3C8` com texto `#4B280F`,
  e no tema escuro um fundo escuro e texto claro do mesmo matiz; as cores precisam vir de um token específico do badge de plano do plugin. O texto do badge usa
  `text-ui-sm`, exibindo「编程套餐」em chinês e「Coding Plan」em inglês; a explicação completa da condição permanece em
  Tooltip de hover/foco, sem ler a configuração da campanha de 150%.

- Campos de imagem: entradas do CDN usam URL https absoluto; **plugins embutidos** completam metadados de listing isomórficos no `official-plugin-definitions.ts`
  dentro do repositório. Para plugins embutidos oficiais que precisam cobrir caches antigos ou ainda não possuem material publicado no CDN, um parser de ícones compartilhado
  pode selecionar o ícone empacotado no cliente pelo id oficial completo do plugin; hoje Documents, PDF,
  Presentations, Spreadsheets, Image Search e Plugin Creator usam esse caminho, e plugins pessoais homônimos não podem reutilizá-lo. Os demais icon/hero são distribuídos como recursos empacotados junto com o app (gravando um caminho local resolvível no marketplace.json ao gerar o seed). Apenas https e recursos locais controlados são aceitos como origem; os demais schemes são descartados.
- A regra de leitura do i18n é unificada da seguinte forma: `x_i18n[locale] ?? x`.

### Propagação dos tipos de wire

Os campos de listing são repassados desde a camada de parse do adapter (`PluginMarketplaceEntry`):

- `AvailablePluginSummary` / `InstalledPluginSummary` (overview) e `ZCodePluginInfo`
  (plugins/list) ganham campos opcionais de listing (displayName/icon/category/author/homepage/
  privacyPolicy/termsOfService/heroImage/examplePrompts).
- Os registros de marketplace de `PluginsOverviewResult` ganham `featured?: string[]`.
- **Fallback de manifesto**: do lado do CLI, quando é possível obter a raiz do plugin (instalado/embutido/já resolvido por describe),
  o `author` / `homepage` do plugin.json também são levados; na exibição da UI **o listing tem prioridade e o manifesto é o fallback**
  (ADR-0001). Candidatos pessoais não instalados e não descritos não têm valor de fallback e são normalmente omitidos.

### Fluxo de dados

```mermaid
sequenceDiagram
    participant UI as 商店页 (renderer)
    participant Store as pluginManagementStore
    participant Svc as zcodeAgentService
    participant Boot as bootstrap handlers
    participant Ad as adapters
    participant CDN as cdn-zcode.z.ai

    UI->>Store: 进入页面
    Store->>Svc: getPluginsOverview()
    Svc->>Boot: plugins/overview
    Boot->>Ad: 读 known_marketplaces + 各市场 marketplace.json
    Ad-->>Boot: 目录（含 listing 字段、featured）
    Boot-->>Store: marketplaces / availablePlugins / installedPlugins
    Store-->>UI: 公开(官方目录) / 个人(其余) 分桶渲染

    UI->>Svc: 点「安装」 installPlugin(name, marketplace)
    Svc->>Boot: plugins/install
    Boot->>Ad: resolvePluginSourceRoot
    Ad->>CDN: 下载 plugin.zip（sha256 校验、安全解压）
    Ad-->>Boot: 落缓存 + installed_plugins.json
    Boot-->>UI: 进度/完成（现有操作流）

    UI->>Svc: 打开未安装候选详情 describePlugin()
    Svc->>Boot: plugins/describe（沿用 V1 协议）
    Boot-->>UI: 组件「名称 + 描述」/ 诊断降级
```

Regra de bucketing público/pessoal (puramente na camada de UI, por id de mercado): `zcode-plugins-official` → público;
todo o resto (incluindo `claude-plugins-official`, `inline` e os adicionados pelo usuário) → pessoal.

## Matriz de degradação

| Ausente                                             | Página de listagem                                                     | Página de detalhe                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `icon`                                             | contêiner quadrado com cantos arredondados `bg-surface` + ícone Blocks neutro padrão, sem borda | idem (64px, mantendo o raio da página de detalhe)   |
| `displayName`                                      | fallback `name` slug                                                    | idem                                                             |
| `heroImage`                                        | —                                                                       | sem imagem; se ainda houver prompts, lista só de cápsulas, senão a área inteira não é renderizada |
| `examplePrompts`                                   | —                                                                       | o hero fica só com a imagem do banner; sem heroImage também, a área inteira não é renderizada |
| `category`                                         | vai para o bloco「其他」                                                | a linha de categoria da seção de informações é omitida            |
| `homepage` / `privacyPolicy` / `termsOfService`    | —                                                                       | a linha de informação correspondente é omitida (só após o fallback de manifesto continuar ausente) |
| `author`                                           | —                                                                       | linha de desenvolvedor: listing → manifest → omitida             |
| `requiresPaidPlan`(ausente ou diferente de `true`) | sem badge de plano de programação à direita do título do cartão         | sem badge de plano de programação à direita do título do detalhe  |
| `featured` vazio/ausente                           | a segmentação pública não tem a grande seção Featured e vai direto para os blocos de categoria | —                                                   |
| Falha no carregamento de imagem                    | idem ao ausente (fallback de avatar), sem imagem quebrada               | idem; falha no hero faz a área inteira ser tratada como sem imagem |
| Falha/timeout no describe                          | —                                                                       | a seção de componentes volta para rótulos de componentTypes + aviso honesto (regra da V1) |

## Visão de gerenciamento de instalados

As capacidades de gerenciamento da tab Installed existente são migradas inteiramente, sem reduzir funcionalidades:

- Uma linha por plugin: ícone + nome de exibição + versão + badge de origem + badge de atualização + **Switch de ligar/desligar do plugin**.
  O badge de atualização é o canto「可更新」（o mesmo componente do cartão), logo após o nome de exibição; havendo atualização, um botão「更新」na linha é fornecido antes do menu「…」no fim da
  linha, e o item de atualizar do menu é mantido.
- Clicar na linha → página de detalhe; a remoção é concluída na página de detalhe e a atualização pode ser feita na linha ou na página de detalhe.
- No topo: filtro por estado de habilitação (todos/habilitados/desabilitados), verificar atualizações (todas), entrada de sincronização remota SSH
  (o RemotePluginSyncDialog existente é recolhido aqui).

## i18n e tema

- Todos os textos novos vão para `packages/ui/src/i18n/locales/{en-US,zh-CN}.ts`（o namespace `settings.plugins.*`
  continua), sem hardcode.
- Os campos `*_i18n` do listing são resolvidos conforme o locale atual; os nomes de exibição de categoria mantêm uma tabela de mapeamento conhecido e os desconhecidos são exibidos como estão.
- Temas claro e escuro (Zai Light/Dark) precisam ser validados; o gradiente do hero e as cápsulas são camadas de imagem/semitransparentes
  e não dependem de cores hardcoded (ADR-0002: o espaço em branco e a escala visual da página da loja podem se desviar das regras de contenção do DESIGN.md,
  mas tokens semânticos e acessibilidade não ficam isentos).

## Checklist de aceitação

Página de listagem:

- [ ] Settings → 插件 apresenta a página da loja: título grande, subtítulo, caixa de busca, faixa de instalados, segmentação público/pessoal, fluxo de cartões, com visual conforme o design (espaçamento/fonte/raio/grade de duas colunas).
- [ ] A faixa de instalados mostra o ícone de todos os plugins instalados (incluindo embutidos, com fallback do ícone Blocks neutro), exibe o nome do plugin no hover/foco e leva ao detalhe ao clicar; a engrenagem leva à visão de gerenciamento.
- [ ] A segmentação pública = apenas o mercado oficial: seção Featured (dirigida pelo `featured` do CDN, pode estar vazia) + blocos de categoria; cada seção é exibida completa por padrão; cada seção com mais de 6 pode ser recolhida manualmente e expandida de novo por "查看 A、B，以及另外 N 个".
- [ ] A segmentação pessoal = seção de recomendados (recommendedPlugins.json) + as demais origens agrupadas por mercado (incluindo claude-plugins-official, inline).
- [ ] A busca atravessa as duas segmentações e, ao digitar, vira um fluxo unificado de resultados; limpar restaura (segmentação e posição de rolagem preservadas).
- [ ] Cartão: não instalado mostra「安装」(incluindo os estados em andamento/cancelamento), instalado mostra「…」(habilitar/desabilitar, atualizar, remover); a remoção tem diálogo de confirmação.
- [ ] Atualização disponível: o canto「可更新」no título do cartão + a cápsula「更新」na linha, o botão de atualização no canto superior direito do ícone da faixa de instalados e o canto/botão na linha da visão de gerenciamento de instalados aparecem simultaneamente; sem atualização ou em plugin órfão, nenhum dos três aparece.
- [ ] Barra superior: o refresh dispara update de todos os mercados; a engrenagem abre o gerenciamento de fontes de mercado (atualizar/validar/remover); New abre diretamente「添加市场源」, com github/git/URL/caminho local e arrastar e soltar todos funcionais.
- [ ] Refresh automático de catálogo: ao entrar na página da loja, o mercado oficial é atualizado automaticamente e só ele; reentrar dentro de 10 minutos não atualiza; falha no refresh ou reentrada com requisição em voo não reinicia; o refresh manual não é afetado por throttling (PLM-LC-018/019).
- [ ] Plugins embutidos desinstalados aparecem na segmentação pública e podem ter a instalação restaurada.
- [ ] Refresh automático de catálogo: apenas o catálogo oficial da ZCode expirado é atualizado; reentrada dentro de dez minutos e reentrada após falha não reiniciam; o refresh manual contorna o throttling (PLM-LC-018/019).

Página de detalhe:

- [ ] O cabeçalho tem ícone/nome/descrição e as ações à direita (instalado = switch de ligar/desligar +「…」+「立即试用」; não instalado = botão principal「安装」).
- [ ]「立即试用」preenche apenas a mention canônica de Plugin; a cápsula de prompt de exemplo preenche mention + prompt; nenhum dos dois envia automaticamente e, quando não instalado, ainda só a entrada de instalação é exibida.
- [ ] Hero/prompts/linhas de informação são renderizados conforme a matriz de degradação, sem imagem quebrada, sem bloco vazio e sem campo inventado.
- [ ] As seções de componentes são renderizadas por MCP servidor/skill/comando/subagente/Hooks com nome+descrição, sem interruptor individual; candidatos não instalados passam por `plugins/describe` (loading→conteúdo, falha com degradação honesta, segunda chamada usa cache).
- [ ] Seção de informações: desenvolvedor/categoria/versão/site/política de privacidade/termos de serviço, com o listing prioritário e o manifesto como fallback, e links externos abrindo no navegador do sistema e apenas https.
- [ ] Plugins de fontes pessoais degradam naturalmente com o mesmo layout, sem cascas vazias de blocos exclusivos do oficial.

Visão de gerenciamento e transversal:

- [ ] A visão de gerenciamento de instalados preserva: switch de nível de plugin, badge de atualização, remoção, filtro de estado, verificação de atualizações e entrada de sincronização remota SSH.
- [ ] Chinês e inglês completos, temas claro e escuro sem quebrar, e layout sem overflow em viewport estreito (larguras web/mobile): o fluxo de cartões vira uma coluna, a faixa de instalados rola horizontalmente e a página de detalhe se adapta em coluna única.
- [ ] A verificação por capturas de CDP cobre: página de listagem (público/pessoal/estado de busca/recolher-expandir), página de detalhe (listing completo e os dois estados degradados) e visão de gerenciamento.

## Menu Adicionar de 2026-09-16

O New da barra superior passou a ser“添加 ▾”, com um menu contendo apenas“创建插件”e“添加插件市场”, cobrindo desktop/celular e os idiomas chinês/inglês, bem como os temas claro e escuro. Esta seção substitui a restrição da especificação antiga de que o New só abriria o gerenciador de fontes de mercado; a criação entra em um novo rascunho por meio da Skill embutida plugin-creator. A adição de mercado continua reutilizando o diálogo existente. Veja [插件创建入口](plugin-creator.md).

### Registros de configuração ausentes e catálogo da loja(2026-09-17)

Após a divisão/despublicação de plugins, `plugins.enabledPlugins` ou `plugins.options` ainda podem conter IDs antigos.
O Agent mantém os registros com `source: missing` / `packageStatus: missing` como dados de diagnóstico de configuração de User/Workspace;
esse registro de configuração, por si só, não prova que o plugin possa ser instalado. A loja constrói entradas apenas a partir de availablePlugins, restorableBuiltins ou de pacotes de plugin realmente
encontrados: registros sem pacote e sem origem de catálogo/restauração não geram cartão de produto, resultado de busca nem entrada de instalação.
Plugins sem pacote mas com origem de catálogo ainda podem ser instalados; entradas embutidas restauráveis e plugins órfãos realmente instalados mantêm o comportamento original.
Essa projeção não remove configurações, caches ou registros de instalação do usuário e vale para a implementação de loja compartilhada entre desktop e web móvel.

Cadeia: configuração do usuário → diagnóstico de pacote ausente no Agent → o protocolo preserva os dados de diagnóstico; o join da loja primeiro preserva entradas de catálogo/restauração e só então complementa com pacotes reais.
Cenário de regressão: `PLM-MISSING-CONFIG`, ver o catálogo de casos de lifecycle e a coverage matrix.

### Ordenação padrão dos plugins de documentos(2026-09-17)

Os IDs oficiais completos `pdf`, `presentations`, `spreadsheets`, `documents`(todos de `zcode-plugins-official`)
ocupam as quatro primeiras posições da faixa de ícones instalados e dos grupos pré-definidos da página de gerenciamento, na ordem PDF → PPT → Excel → Word. Plugins ausentes são pulados, desativação não afeta a ordenação e plugins pessoais homônimos não são promovidos ao topo.
As categorias públicas e os seletores de referência que reutilizam sua ordenação priorizam, por padrão, a ordem acima dentro da mesma categoria; a ordenação explícita de categorias/plugins do servidor continua prevalecendo e as demais regras são mantidas.
Desktop/celular, chinês/inglês e os temas claro e escuro usam a mesma ordem. A ordenação altera apenas a exibição, e não a instalação, o ligar/desligar, a configuração ou o array original.