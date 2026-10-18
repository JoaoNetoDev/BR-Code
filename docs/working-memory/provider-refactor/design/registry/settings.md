# Página de Configurações de Provider

> Estado: design vigente
>
> Atualização mais recente: 2026-09-08

A página de configurações de Provider edita o Personal Config e interage com o Config e o Registry do Environment alvo através do Provider Settings Service no Host. A página usa salvamento automático: durante a digitação o rascunho local é mantido e, quando uma ação de edição termina, o Personal Provider Draft depois dessa edição é submetido; só depois que o Host conclui a persistência e atualiza o Registry a página confirma que o salvamento foi bem-sucedido.

```text
Renderer Draft
      |
      | 编辑动作完成
      v
Provider Settings Service
      |
      | 原子更新 Personal Config
      v
Provider Config Service
      |
      | invalidation + refresh
      v
Provider Registry
      |
      | 返回最新 Settings View
      v
Renderer 显示保存成功
```

A página de configurações não lê o arquivo de configuração físico nem executa Overlay, validação de integridade ou julgamento de membro do Registry no Renderer. A página de configurações remota chama o mesmo Service do Environment alvo; o Desktop não trata a configuração de Provider local como um fato remoto.

## Salvamento automático

### Troca de conexão após perda do plano da conta (Todo93)

Decisão de 2026-09-08: quando, na mesma conta e na mesma conexão completa, o estado passa de available/pending para unavailable explicitamente, mostra-se um aviso uma única vez e oferece-se o botão "Alternar para o plano específico"; a conexão real só muda depois que o usuário clica, revalida e a escrita condicional tem sucesso. Indisponibilidade contínua não repete o aviso, unknown não é tratado como perda e uma nova perda depois da recuperação é um evento novo. A primeira inicialização/troca de identidade apenas estabelece a linha de base e não compara o estado de planos diferentes; escolher manualmente um plano individual não contratado não volta automaticamente. Mantêm-se a inicialização sem escolha da primeira vez e a proteção de migração da conexão antiga.

Os registros de observação são mantidos apenas em memória no nível raiz, sem novos campos persistidos nem migração. `AccountProviderState.connectionKey` é um resumo da identidade da conta e da conexão completa na mesma rodada e serve só para isolamento de observação, não entra no Config Overlay. A seleção manual na página de configurações continua usando a entrada de salvamento original, o filtro da entrada de conexão Start e a visibility de Provider permanecem inalterados e o gate de execução de modelos não é contornado. Detalhes do estado, invalidação de recomendações antigas e fronteiras de teste estão em [Todo93](../../steps/todo-93-account-plan-loss-manual-switch.md). Isso substitui a decisão de troca automática do R06 do Todo88; a implementação atual só faz a escrita condicional depois do clique e da revalidação.

### Decisão final sobre o diálogo de modelo (Todo90 / Todo92)

Implementado conforme esta seção em 2026-09-08 e aprovado na aceitação conjunta do Pro; as evidências são registradas em Todo90/92, e em caso de conflito com as descrições históricas de "restaurar padrão" e de borda de foco abaixo, esta seção prevalece.

- Mantém-se o interruptor na mesma linha de salvar/cancelar, e o texto visível passa a ser "智能配置" (configuração inteligente). Descrição: "根据模型 ID 自动匹配推荐配置，允许单独修改。" (o texto de UI permanece como está).
- Ligado: faz correspondência por Model ID e herda a configuração recomendada, permitindo sobrescrita pessoal; desligado: preenche com o rascunho efetivo atual por completo, todos os campos passam a ser obrigatórios, sem correspondência por ID nem preenchimento por recomendação, e sem exibir o estilo de sobrescrita pessoal.
- Religar limpa a sobrescrita de configuração do modelo e restaura a recomendação com base no ID atual; as edições posteriores são preservadas. Todas as trocas alteram apenas o rascunho: salvar passa a valer e cancelar descarta, sem alterar ID/estado liga-desliga/pertinência de membro. Campos de modo existentes são mantidos, sem nova migração.
- A borda expressa apenas "sem sobrescrita/com sobrescrita", com borda fina em cor neutra/acento suave; ao reabrir após salvar, o marcador de origem é preservado. Valores, modais, capacidades e cada item de MFJS são independentes; ao modificar nome de nível, quantidade ou ordem, todas as caixas de nível são realçadas juntas, e o Mapping é realçado separadamente. O contêiner externo não é realçado.
- Hover e foco compartilham uma leve mudança de fundo, sem modificar a borda e sem adicionar contorno de foco extra; o fundo ligado/desligado das opções e o foco de teclado continuam precisam ser distinguíveis. Ajusta-se apenas o editor de modelo, sem alterar globalmente os componentes base compartilhados.
- MFJS usa o mesmo estilo de botão das opções de capacidade, sem ícone e sem checkbox inicial; o ramo visual "renderizar checkbox quando não há ícone" é removido por completo, preservando a semântica de acessibilidade.
- Mantém-se o contêiner externo de raciocínio e a área de edição interna de níveis/Mapping, removendo o título duplicado "推理设置" (configuração de raciocínio); as configurações avançadas mantêm título e contêiner. Não há texto "自定义" (personalizado) nem botão de restaurar padrão no nível do grupo ou global.

A implementação e a aceitação estão em [Todo90](../../steps/todo-90-model-add-edit-shared-recommended-draft.md) e [Todo92](../../steps/todo-92-model-smart-config-and-override-feedback.md).

Atribuição da implementação: um hook de rascunho de edição compartilhado por adicionar/editar; o marcador de origem dos campos pessoais pertence à intenção de edição e não é deduzido pelo resultado da validação do formulário inteiro. O Host devolve a baseline recomendada e a UI apenas projeta os controles não sobrescritos sobre a baseline, sem fazer correspondência de regras por conta própria. Modos fixos param as requisições de recomendação; o Host verifica a integridade na escrita, e a resolução de execução só adota a configuração pessoal completa (com `enabled` ainda tratado pela regra independente de liga/desliga), sem complementar lacunas com Built-in.

### Complemento de escrita e transação de edição (Todo 89)

Providers Built-in/de conta ainda podem não ter um registro de Personal Provider. Ao modificar membros ou ordem, o Config Service
cria uma cobertura esparsa conforme a necessidade; editar a configuração de um modelo não exige nem cria um registro de Provider adicional. A origem dos membros vem uniformemente do mesmo snapshot do Facade, e não pode ser trocada pelo Registry executável nem por uma lista estática. Ao adicionar um modelo, a ordem relativa dos membros existentes é preservada e o novo membro é acrescentado.
Um Provider Personal-only removido não pode ser recriado por um salvamento atrasado.

A liga/desliga de modelo usa uma atualização de folha independente que, dentro de uma transação atômica, lê a configuração pessoal mais recente, altera apenas `enabled` e preserva o modo de configuração e os demais campos.
O formulário de Provider submete apenas os itens de configuração editados e preserva campos não tocados, como headers; sem edição, não há salvamento.

Ao abrir o diálogo de modelo, ficam fixados o modelo original, o rascunho e a revision desta edição. Atualizações externas de View não sobrescrevem esse rascunho, e o salvamento continua verificando a versão;
em caso de conflito ou falha, a entrada é preservada, e só cancelar e reabrir carrega os valores mais recentes. Modelos com configuração incompleta continuam oferecendo entrada de edição e de liga/desliga;
membros pessoais podem ser removidos, enquanto membros herdados não podem ser removidos nem renomeados. Editável não significa executável, e a validação de integridade do Registry permanece inalterada.

A associação de modelos e a configuração passam a exibir diretamente a View devolvida pelo Host e não mantêm mais uma cópia com rollback da tabela inteira em caso de falha de adição/remoção;
apenas o arraste preserva a ordem otimista existente. O diálogo de adição só fecha depois que o salvamento real é concluído, e a falha é tentada novamente no rascunho original;
um diálogo explícito não oferece ações de notificação de nova tentativa fora do rascunho. Conta e detalhes de fornecedor comum compartilham o mesmo conjunto de callbacks de escrita de modelo.
Quando o Start Plan já é confirmado como disponível pelo snapshot de Account, um estado vazio temporário decorrente de uma nova consulta o cartão de cota/plano não pode desmontar a área de edição de modelo;
isso também não permite que um Start Plan não retirado exiba modelos, nem altera o cache de consulta de entitlement, a troca de plano ou o gate de execução.

A entrada de texto, durante a edição, altera apenas o Draft dentro do componente. Após 1200ms contínuos sem nova entrada, a submissão é automática; ao perder o foco,
ao o usuário pressionar Enter ou ao trocar para outro Provider, a atualização do Personal Provider Draft é submetida imediatamente. Caixas de seleção, interruptores e arrastes são submetidos assim que a operação é concluída.

```text
输入字符
├─ 更新本地 Draft
└─ 1200ms 无新输入 -> 自动保存

失去焦点 / Enter / 切换 Provider
├─ Provider 字段：保存 Personal Provider Draft
└─ Model 字段：保存该模型的 Personal Exact Draft

选择 API Format / 切换 Enabled / 拖动结束
└─ 立即保存操作后的 Personal Draft
```

O idle-trigger de texto agenda apenas um salvamento do Draft do Provider atual; cada nova entrada cancela o timer anterior, e uma digitação contínua salva apenas o valor final.
Perda de foco, Enter e troca de Provider cancelam o timer e fazem flush imediato. O salvamento automático não pode criar uma segunda fila accepted;
respostas obsoletas continuam isoladas pela revision do Provider Draft.

Ao adicionar e ao editar um Model ID, usa-se o mesmo idle-trigger de 1200ms para agendar `resolveModelConfig()`. Esse método resolve `inheritedConfig/effectiveConfig/issues` apenas com base no
Provider atual e no Model Draft esparso não salvo, sem persistir e sem alterar a revision do Registry. Perda de foco, Enter ou salvamento explícito fazem flush imediato; o botão de salvar espera a Resolução atual terminar e continua a submissão na mesma operação.

O aviso de correspondência da configuração recomendada usa "已为模型匹配到推荐配置" (inglês: Recommended settings matched for this model) e
não é mais chamado de "已加载模型默认配置". Aqui apenas o texto do aviso é ajustado, sem mudar a resolução, o momento do aviso ou o comportamento de salvamento.

Um salvamento submete apenas o Personal Draft ao qual a operação pertence, e não trata o conjunto atual da página como um snapshot do Repository: campos de Provider só
escrevem o Provider Config; campos de Model só escrevem a Rule específica `type="provider-model"` daquele modelo. Ao adicionar um Personal Model, grava atomicamente
a associação de membros `modelIds`, o `modelOrder` completo e a Rule específica inicial `enabled=true`; remoção, renomeação e reordenação também usam suas operações atômicas de domínio.
Nenhum salvamento comum percorre nem substitui as outras
Model Rules do mesmo Provider, nem copia o Effective Config de volta para o Personal.
Um item de configuração exposto por completo é submetido com seu valor substituto completo depois de modificado pelo usuário; valores herdados não modificados não são materializados pelo carregamento do formulário nem por um salvamento de campo sem relação.
O Provider Settings Facade gera a Settings View a partir do Effective Built-in e do Personal da mesma revision, e o
Personal Repository atualiza a configuração atomicamente. O método de salvamento só retorna depois que o Registry correspondente termina a atualização, portanto uma resposta bem-sucedida significa simultaneamente:

1. o Personal Config foi persistido;
2. o Registry do processo atual já observou esta versão;
3. a Settings View devolvida corresponde aos fatos posteriores a esta submissão.

Exibir, travar ou ocultar um campo na página de configurações é apenas uma decisão de produto da UI, e não uma fronteira de permissão do Config Schema. A UI formal pode
não expor campos como Account Access, Built-in Model ID e PDF/Audio, mas o Schema não ganha por isso uma validação de origem do tipo "o usuário não pode escrever".
Quando o usuário edita manualmente o Personal Config, o mesmo Overlay, as mesmas estruturas e as mesmas regras de integridade continuam valendo; conexões de conta invalidas para o negócio mas estruturalmente completas são tratadas pelo Request Auth ou por falha de requisição do servidor.

O Draft de formato de modelo mantém diretamente `properties.input_format` / `properties.output_format`. A página de entrada exibe apenas Text travado e
Image, Video e PDF editáveis; Audio fica oculto mas precisa ser preservado como está. A página de saída exibe apenas Text travado.
O Facade não gera Rules Personal na direção inversa a partir da baseline Built-in. Ele calcula o Effective Config autoritativo a partir do Effective Built-in e do Personal Overlay existente;
o Renderer submete apenas as folhas materializadas pelas modificações reais do usuário, e campos ocultos não tocados não geram nova cobertura. Detalhes em
[`../model/input-output-format.md`](../model/input-output-format.md).

A View da edição normal fornece por origem `templateConfig?`, `effectiveBuiltinConfig?`, `personalConfig` esparso e `effectiveConfig` autoritativo;
um Personal Provider criado por Template não fabrica `effectiveBuiltinConfig`. O Renderer copia apenas `personalConfig` como Personal Draft. Valores herdados podem servir como valor de exibição de um controle, mas um item de configuração só é materializado no Draft quando o usuário o toca. Campos comuns podem ser removidos do Personal pelo "restaurar padrão"; o interruptor `enabled` da lista de modelos não oferece "restaurar padrão", e cada alternância salva um valor booleano Personal explícito. O Renderer não chama o diff Effective →
Personal, nem monta sozinho a associação de membros ou calcula conflitos.

A página mantém uma revision incremental para cada Provider Draft. Somente quando a revision da resposta é igual à revision do Draft atual a entrada atual pode ser exibida como salva;
uma resposta atrasada de uma requisição mais antiga não pode sobrescrever uma entrada nova nem exibir sucesso indevidamente. As escritas de Provider/Model/membros do mesmo Provider são executadas na ordem em que ocorrem; rename espera as operações do ID antigo e troca as identidades subsequentes, delete é uma operação terminal e o teste de
conexão espera pelos salvamentos relacionados. Atualizações externas de View só atualizam campos não editados e campos dirty mantêm a entrada local; uma falha de salvamento preserva a entrada e a entrada de nova tentativa.

## Feedback de salvamento

O Renderer continua usando internamente a revision do Draft para distinguir edição local, salvamento em trânsito e resposta obsoleta, mas não exibe o texto `dirty` ao usuário e não mantém
outro conjunto de estado de salvamento na área de conteúdo do Provider. Uma operação de salvamento é projetada como uma única notificação no rodapé da janela, substituída no lugar pela mesma chave estável:

```text
saving（不自动消失）
  |
  +-- success -> 同 key 替换，短暂停留后淡出
  |
  `-- failure -> 同 key 替换，延长停留并提供重试/关闭
```

O botão de salvar do diálogo de modelo continua mostrando um Spinner durante a requisição e bloqueia submissões duplicadas; esse é o estado de um controle de operação, e não um segundo conjunto de feedback de salvamento. Só depois que o Host
confirma a revision correspondente o success pode substituir o saving. Respostas atrasadas de requisições mais antigas não podem sobrescrever a operação atual, e a informação de falha não pode ser expressa apenas por cor.

## Identidade e nome do Provider

`providerId` é a identidade de execução imutável após a criação; `label` é o nome de exibição editável. Os dois não são mais convertidos entre si por rename.
Um Personal Provider criado recebe um ID padrão livre no momento da criação:

```text
new-provider
new-provider-2
new-provider-3
```

Alterar o nome na página de configurações escreve apenas o Overlay de `label` Personal. Um label em branco significa voltar a herdar; todos os labels de Effective Provider
precisam ser únicos ignorando maiúsculas e minúsculas, evitando entradas homônimas indistinguíveis na página de configurações e no seletor de modelos. `providerId` continua não vazio, sem espaços nas pontas e globalmente único. O estado interno e o protocolo entre processos usam o `ModelSelection` estruturado; o `provider/model` do Prompt CLI
é apenas uma abreviação de entrada humana na fronteira de Entry.

Os IDs do ZCode Built-in e do Account Built-in Provider são gerenciados pelo ZCode Built-in Provider Config e não podem ser renomeados pela página de configurações.
Eles ainda podem fornecer, pelo Built-in Config, `label` somente-leitura e informações de marca; o `providerId` é sempre a identidade de execução e o fallback de exibição quando não há label.

`visibility` é um fato de visibilidade de produto do Provider Config, e não um controle da página de configurações. O Provider Settings Facade retorna apenas
Providers com `visibility = "visible"`; um Provider hidden não aparece na página de configurações, e a página também não oferece operação para alternar esse campo.
O ocultamento afeta apenas a entrada de produto, e não a associação do Registry, a validação de integridade ou a execução interna.

O Model Config não tem mais `visibility` independente. Se um modelo aparece no seletor comum é decidido em conjunto pela visibility do Provider, pelo enabled do Model e pela integridade;
as Settings continuam exibindo modelos desabilitados, para que o usuário possa editá-los ou reativá-los.

## Agrupamento, adição e remoção de Providers

A página de configurações exibe apenas Providers reais; o Template aparece somente na página de seleção de Templates, à direita:

```text
zai-family / bigmodel-family
└─ 固定 Account Family 区域
   ├─ Start Plan
   ├─ Individual Coding Plan
   └─ Team Coding Plan

Provider Templates
└─ 顶部“添加供应商”打开的创建基线
   ├─ Z.AI API / BigModel API
   ├─ DeepSeek / Moonshot / MiniMax
   └─ 其他官方模板

standard-personal
└─ 已创建的普通 Personal Provider
```

O Provider não salva uma flag `builtin` extra nem um `enabled` de topo, e o agrupamento não é inferido por uma lista branca de IDs de Provider. Template não é
Provider: não tem `providerId` de runtime, estado executável ou página de detalhes em Settings.

A ação do topo reaproveita a hierarquia de ações de cabeçalho da página de configurações de Subagents: Refresh primeiro, usando `outline + icon-md`; "添加供应商" depois, usando o botão de ação principal `default + default` com ícone Plus; ambos alinhados à direita e mantendo `gap-2`. Após clicar em adicionar, a navegação de Providers da esquerda permanece igual e os detalhes da direita mudam para
`ProviderTemplatePicker`. A página de seleção consome diretamente o `ProviderSettingsView.providerTemplates` do Host alvo e exibe, na ordem de publicação, cartões de Template
com altura fixa e nome de no máximo duas linhas, sem criar outro Catalog, busca, tabela de ordenação por ID ou lista de marcas no Renderer. A página oferece retorno e,
após a criação bem-sucedida, entra nos detalhes do novo Provider. Nomes longos que passam de duas linhas são truncados e o nome completo é exibido em um Tooltip.

"添加模型" nos detalhes do Provider é uma operação de criação secundário subordinada ao Provider atual, usando o botão `secondary + default` com ícone Plus; o botão
fica à direita do título "模型列表", e o contêiner pai da linha de título usa `mb-1`, mantendo `4px` de distância do corpo da lista, sem encostar nem cobrir a borda da lista.

A página de seleção tem duas entradas de criação com efeito imediato:

```text
添加供应商
└─ 选择 Provider Template
   └─ 每次创建一个新的 Personal Provider 实例
      ├─ 记录 templateId
      ├─ UI 按当前 Locale 从 Template nameMap 解析 label 种子
      ├─ Host 在创建原子更新内生成唯一 providerId / label
      └─ 原子写入 Personal Config 与 providerOrder

创建自定义供应商
└─ 立即创建不引用 Template 的 Personal Provider
   ├─ 写 group=standard-personal、access.type=api-key
   │  └─ API Key 允许暂时缺省；Access 判别字段不能缺失
   ├─ 不猜 API type、Endpoint 或模型
   └─ 进入完整自定义详情
```

O `standard-personal` atualmente suporta apenas Access `api-key`. O Renderer escolhe o formulário de configuração correspondente apenas com base no `access.type` efetivo
e não pode criar um conjunto paralelo de inferências de UI a partir do group do Provider. A criação por Template e a criação em branco chamam uniformemente
`createPersonalProvider({ templateId?, label?, initialConfig? })`; o `initialConfig` não pode carregar `label`, evitando contornar a desduplicação.
O nome do Template serve apenas como semente de criação; o `label` Personal criado é estável, editável e não muda automaticamente com o idioma da interface ou com atualizações do Template.
A entrada de API Key do Welcome também chama a mesma operação de criação atômica e não pode manter
Providers de runtime fixos `zai-api` / `bigmodel-api` nem uma interface de salvamento dedicada.

Um novo Provider incompleto pode aparecer na Settings View e exibir problemas de integridade, mas não entra no Registry.
O rascunho estruturado de um Personal Provider pode ser salvo: Base URL vazia, API Key vazia ou associação de modelos vazia não devem bloquear a persistência; valores vazios não são escritos como
URL pseudo-inválida, mas mantidos como campo ausente. O Host continua marcando esse Provider como não executável pelas regras formais de integridade. Uma URL não vazia, mas com formato incorreto,
continua sendo rejeitada como erro de campo, evitando confundir erro de entrada com "ainda não configurado".

A página de configurações do Provider não oferece um controle geral de liga/desliga. A exibição da elegibilidade de plano da conta lê `access.entitled`; se um Personal Provider comum existe
é expresso pela sua raiz Personal. Nenhum dos dois pode mais ser inferido por um `enabled` de topo do Provider.

A ordem de publicação do Provider Template determina a ordem padrão do menu "添加供应商". Serviços de modelos nacionais como Zhipu, Moonshot, MiniMax, DeepSeek,
Alibaba Model Studio e Xiaomi vêm antes de serviços 해외 como OpenAI, Anthropic e xAI; o Renderer não mantém mais uma tabela de ordenação exclusiva do menu.

A navegação de Providers, o título dos detalhes, a página de seleção de Template e os detalhes de Account lêem uniformemente a referência estruturada `logo` do Provider Config, com
o resolvedor de recursos da UI mapeando `logo.key + tema realmente atual` para o asset empacotado. Ausência, chave desconhecida ou falha de carregamento do recurso caem para o ícone genérico de Package;
o Renderer não infere a marca pelo ID do Provider. Upload de Logo não é suportado por enquanto em Providers puramente personalizados.

Ao remover um Provider comum, a raiz de definição do Personal Provider e suas Personal `provider-model` Rules são removidas; o Template não é afetado e
uma nova instância pode ser criada depois. Providers de Account Family não oferecem entrada de remoção, e o estado da conta é atualizado pelo Account Overlay. Rules
Personal `match` comuns não são removidas junto com o Provider.

## Lista e edição de modelos

A lista de modelos comporta navegação, liga/desliga, teste, edição, remoção de modelos Personal e ordenação de todos os membros. A lista precisa exibir diretamente
o estado `enabled` e os botões de operação; Model ID, Properties e Option Specs são modificados em uma página de
edição de modelo separada, e a linha da lista não oferece edição de nome em linha.

```text
模型列表行
├─ Model ID
├─ context window 摘要（紧跟 Model ID 左对齐）
├─ 状态：正常 / 已关闭 / 配置不完整
├─ Properties 摘要
├─ 测试
├─ 删除（仅 Personal）
├─ 编辑图标 -> Model 编辑弹窗
├─ enabled 开关（固定在最右侧，不提供“恢复默认”）
└─ Model ID 与非交互空白均可启动整行拖动（Built-in 与 Personal）
```

O Model ID faz parte da identidade `providerId/modelId`. O Built-in Model ID é somente-leitura; ao editar um Personal Model ID
a página de edição executa uma operação de renomeação atômica explícita, em vez de tratá-lo como texto de exibição comum.

O interruptor `enabled` exibe o Effective Model Config e, ao ser alternado, escreve uma Rule Personal `type="provider-model"` específica, mantendo um booleano explícito;
a lista de modelos não oferece uma entrada de "restaurar padrão" para remover essa folha. Modelos disabled continuam aparecendo na página do Provider, mas ficam ocultos no seletor de modelos comum. O interruptor não é igual a
`selectable`: um Provider com configuração incompleta, uma conta sem entitlement ou um Provider hidden ainda podem tornar um modelo enabled não selecionável.

A linha de navegação de um Personal Provider comum não exibe um bloco de arraste independente; o nome, o ícone ou o espaço não interativo do Provider formam a mesma região de arraste da linha inteira.
Clicar continua selecionando o Provider, e só a ordenação é ativada depois que o arraste passa da distância de ativação, evitando confundir um clique comum com arrasto. Os botões reais dentro da linha continuam excluídos da região
de ativação do arraste; o texto arrastável proíbe a seleção de texto do navegador, e não pode aparecer um falso estado de arraste do tipo "texto selecionado, mas sem reordenação".

`executable` e `selectable` são resultados derivados pelo Host, e não campos salvos: o primeiro é determinado pelo entitlement da conta (tipo de conta), pela integridade do Provider,
pelo enabled do Model e pela identidade de membro; o segundo exige ainda que a visibility do Provider seja visible. hidden não é igual a disabled.

Quando `builtinModelIds` e `modelIds` têm o mesmo nome, vale Built-in-wins: produz-se apenas um modelo Built-in que funciona normalmente. A UI normal
proíbe criar membros duplicados; duplicatas em configuração manual são normalizadas no próximo salvamento relacionado. O sistema não cria DTO de conflito, não suspende identidades nem cria um segundo modelo com o mesmo nome.
O Host ainda devolve `builtin` explicitamente, usado apenas para o Model ID somente-leitura e para a permissão de remoção, e o Renderer não adivinha a origem pelo ID ou pelo diretório.

A edição de modelo usa Draft local e salvamento manual. O diálogo permite editar os campos de Model Config abertos para o produto: enabled, context, formatos de entrada e saída,
booleanos de capacidade, MFJS, níveis de Reasoning, Reasoning Mapping e máximo de tokens de saída. O Reasoning Mapping usa uma caixa de texto técnico de altura fixa:
o Personal Map é o value, o Inherited Map é o placeholder, e limpar significa voltar a herdar. O máximo de tokens de saída usa uma
entrada numérica separada, exibida diretamente e fora da dobra "avançado"; o Max Output Map não abre por enquanto uma segunda entrada de edição e precisa ser preservado como está ao salvar os demais campos.
O interruptor de ativação compartilha a primeira linha com o Model ID e não ocupa sozinho um cartão de estado. A ordem dos campos principais é fixa como
`Model ID/启用 -> context -> 最大输出 Token -> 输入类型 -> 输出类型 -> 模型能力`, com o JSON complexo e o MFJS
depois desses campos comuns.

context, máximo de tokens de saída e os dois slots de JSON complexo usam apenas a cobertura Personal como valor de entrada; o valor herdado/em vigor atual aparece como placeholder
da mesma caixa de entrada, sem uma segunda pré-visualização somente-leitura, e o valor herdado não pode ser pré-preenchido como entrada do usuário. Branco significa herdar, e uma expressão Map explicitamente preenchida significa
cobertura de folha Personal. A área de edição de JSON/Map mantém apenas a borda da própria caixa, a altura fixa e o scroll interno, sem um segundo contêiner com borda; antes do interruptor MFJS usa o
título de grupo "其他设置", evitando que o JSON complexo fique visualmente grudado nos booleanos seguintes. O número máximo de saída `N` expressa diretamente
`optionSpecs.maxOutputTokens.max=N` e não salva mais Option Default. O rodapé do diálogo sempre oferece "全部恢复默认", desabilitado quando não há Personal Overlay; essa ação limpa todas as coberturas Personal
de Model Config daquele modelo exceto identidade/membro; o salvamento continua escrevendo apenas a Rule Personal esparsa que realmente mudou em relação ao Effective Built-in. Cancelar, X e Esc não geram Mutation. Campos de PDF/Audio não são exibidos na UI,
mas qualquer outra edição precisa preservar os valores existentes. Enquanto o diálogo estiver aberto, seu conteúdo e o overlay precisam ficar fora da região de ativação do arraste da linha inteira do modelo;
a propagação de eventos React pelo Portal não pode atravessar o diálogo e iniciar a ordenação de modelos em segundo plano.
O diálogo de desktop mantém uma altura máxima média e centralizada, formulários longos rolam apenas na área de conteúdo e não encostam nas bordas superior e inferior da janela formando um layout quase de tela cheia;
em telas estreitas ele ainda encolhe com segurança conforme a altura útil do viewport.

Formatos de entrada/saída, booleanos de capacidade e MFJS usam o mesmo Boolean Model Option. O estado checked expressa apenas o valor efetivo; a presença de uma folha Personal esparsa
é expressa por uma moldura externa mais saturada e pela borda do Checkbox, sem texto "padrão/modificado" e sem inferir a origem pelo fato de o valor ser igual ao
Built-in. Text travado expressa apenas que não é editável.

Ao adicionar um Personal Model, a Resolução de Model Config do Host é a baseline de herança daquele `providerId/modelId/api.type`. O Renderer
usa números e JSON como placeholder e mantém formatos e booleanos de capacidade em cache como estado de exibição do formulário; esse cache de exibição não pertence ao Personal Config, e
uma Resolução atrasada também não pode sobrescrever campos que o usuário já tocou. Ao salvar, o Overlay Personal esparso continua sendo gerado a partir da baseline de herança, e é proibido materializar na direção inversa os fatos default das
ZCode Built-in Model Config Rules.

O salvamento de Provider/Model e o feedback de conexão de modelo usam o Toast de nível de janela já existente no aplicativo, fixo na parte inferior do viewport; objetos diferentes se empilham para cima e o saving, success e failure de um mesmo objeto
são substituídos por chave. Falhas de salvamento ou de conexão permanecem por mais tempo que o sucesso e oferecem as entradas de nova tentativa ou de fechamento necessárias. Mensagens de nível de modelo
precisam conter o Model ID e, quando necessário, também a identidade do Provider. A posição estática do Toast só pode ser determinada pelo inset `top`/`bottom`; transform no eixo Y
é usado apenas para a animação de entrada da própria mensagem, e o contêiner inferior não pode ser deslocado para fora do viewport.

A UI completa, a atribuição de estado e os casos de aceitação estão em
[`model-membership-and-enablement.md`](./model-membership-and-enablement.md).

O container de divisão esquerda/direita da configuração de Provider usa altura estável e não é esticado pela quantidade de Providers, pela quantidade de Modelos nem pelo comprimento do formulário à direita. O cartão externo corta o overflow,
e a navegação de Providers à esquerda e os detalhes do Provider à direita têm áreas de rolagem vertical independentes; rolar uma lista longa de modelos não pode arrastar a navegação de Providers, e vice-versa.
As duas áreas de rolagem precisam ter `min-height: 0`, garantindo que os itens Grid/Flex realmente encolham e produzam scroll interno, em vez de continuar esticando a página.
A página de configurações de modelo usa uma coluna de conteúdo mais larga que um formulário de Settings comum, reservando espaço horizontal suficiente para a navegação fixa de Providers e para o formulário completo de detalhes; as duas áreas de rolagem
não podem gerar barra de rolagem horizontal. Em telas estreitas ainda é possível recolher o texto da navegação e deixar os campos de detalhes quebrarem a linha ou serem truncados, sem depender de arraste horizontal para acessar um campo.

Um Personal Provider criado por Template e um Personal Provider totalmente personalizado usam o mesmo conjunto de hierarquia de informações de detalhes. Base URL e API Schema herdadas de um Template
devem ser visíveis, mas com controles somente-leitura ou exibição congelada equivalente; o usuário ainda pode editar API Key, configuração de modelo e os campos Personal que permitem sobrescrita.
O Provider ID e o Built-in Model ID permanecem somente-leitura. Não se pode esconder toda a área de fatos de conexão só porque o Endpoint é somente-leitura, nem
criar outro DTO de detalhes exclusivo de Template.

Uma Personal Model Config Rule não determina se um campo é editável; ela é apenas o resultado esparso e persistente formado depois que o usuário modificou explicitamente o campo. Se a página de configurações permite a edição é decidido
pela propriedade do campo e pela interação de produto; uma vez permitida a edição, tanto modelos Built-in quanto Personal salvam a cobertura pela mesma Personal Rule. Se a associação de modelos permite
renomear ou remover é decidido de forma independente pela origem do membro, e o Builtin Model ID é somente-leitura e não pode ser removido.

As Coding Plan Individual / Team da conta são a exceção de produto às regras de exibição acima: a página de configurações oculta completamente Endpoint e API Schema e exibe apenas
o estado do plano e a configuração efetiva de modelos. Ocultar não significa que o Config esteja sem campos; Endpoint/API Schema continuam presentes no Effective Provider
Config e são consumidos normalmente por Registry, ModelFactory e Runtime. O Renderer não recorta nem reconstrói o Account Provider Config por causa disso,
nem permite que plano, cota, credencial ou erro de requisição decidam se a área de configuração de modelos existe.

## Ordenação de Providers e modelos

Provider e Model usam campos de ordem Personal explícitos e não dependem da ordem de inserção do Map. Providers de Family ficam fixos na frente e não participam da
ordenação comum; as duas operações fixas de criação vêm logo após as Families; todos os Providers `standard-personal` ficam depois das operações e podem ser arrastados de forma unificada. A ordem de Providers
é determinada pelos membros válidos de `providerOrder` mais a cauda de Personais ainda não ordenados.

```text
Personal:       [A, B, C, X, Y]
providerOrder:  [C, X, A, Y, B]

用户把 X 拖到 Y 前面

保存完整 providerOrder，去重复、删 stale、补遗漏
```

Todos os membros de Model Effective Built-in/Personal podem ser arrastados; o Builtin só não pode ser removido. O arraste salva o
`modelOrder` completo, mas não altera a propriedade de membros de `builtinModelIds` / `modelIds` nem a prioridade das ModelConfigRules.
A linha inteira do modelo é a região de ativação do arraste, e Switch, teste, edição e remoção dentro da linha precisam ficar excluídos; o texto arrastável proíbe a seleção de texto. O ponteiro usa um
limiar de movimento, o toque preserva a rolagem vertical e o teclado oferece capacidade de ordenação equivalente.

O arraste usa exibição otimista: salva imediatamente após a conclusão da operação; se o salvamento falhar, a ordem original é restaurada e o erro é exibido na lista correspondente.

## Teste de conectividade

O teste de conectividade é uma capacidade de Provider Settings que o Host oferece ao Renderer. Como o salvamento é automático, o teste não precisa manter um "Registry temporário" nem um snapshot de execução não publicável:

```text
点击模型“测试”
        |
        v
提交当前尚未保存的 Provider 与目标 Model Draft
        |
        v
等待 Personal Config 写入与 Registry 刷新
        |
        v
Registry 根据 providerId/modelId 创建正式 Model
        |
        v
Model.streamText() 发出最小真实请求
        |
        v
正式 Adapter / Request Auth / Provider API
```

O botão de teste pode usar o `executable` do item de modelo para o estado normal da UI, mas o Host não copia o algoritmo de admissão do Registry. Modelos disabled, com configuração
incompleta ou duplicados dentro de um mesmo conjunto não podem ser testados; quando há nomes iguais entre conjuntos, o teste usa o Built-in X normalmente executável.

O Renderer não prepara Header de validação de segurança e não monta Endpoint, parâmetros de Reasoning ou corpo de requisição de protocolo. O Registry cria o Model com o ProviderConfig, ModelConfig e Model Options formais já salvos; a tentativa de request obtém o material de autenticação dinâmico (API Key, JWT, Runtime Key, Header de validação de segurança de uso único etc.) pelo Request Auth Service formal.

As entradas de configuração, entitlement e Usage de um Provider de conta também só podem ler, a partir da Settings View, o `access: { type: "zhipu-account", family, mode }` estático do Registry.
O Renderer não interpreta esse campo com o Schema de Account Access dinâmico e não disfarça o plano atual ou o escopo de Team como Effective Provider Config:

```text
Provider Settings View.access { family, mode }
                    |
                    v
Host Account Request Auth Service
                    |
                    v
当前连接 { planKind, productId?, organizationId?, projectId? }
                    |
                    v
Entitlement / Usage / Reset / Model Request
```

Os fatos dinâmicos da conta são resolvidos no momento da chamada pelo serviço de conta do Environment alvo. A lista de usage de Team pode combinar a resposta de produtos assinados com o modo estático
`team-coding-plan` para formar o escopo da consulta, mas não pode gravar esse escopo de volta no Personal Config, no Account Overlay ou no Registry.

O teste usa o mesmo caminho de Adapter de streaming do Agent e envia fixamente duas mensagens: system `You are ZCode connectivity probe.`, user `hi`, consumindo o stream completo. Texto, papéis e ordem são um contrato de whitelist relevante, e nenhum histórico, ferramenta, system extra ou texto de internacionalização é adicionado (Todo 91); isso não afeta outras requisições auxiliares. O teste de conexão usa de forma independente um orçamento de saída de 1 Token, e o Reasoning usa explicitamente o primeiro item da lista ordenada de níveis, sem reutilizar o orçamento de 5.000 Tokens da geração de conteúdo auxiliar (Todo144). Um finish normal (incluindo length) é sucesso e não exige corpo; stream anormal ou finish ausente ainda é falha. O caminho de teste não depende do Option Default já descontinuado e não pressupõe que o Model já esteja vinculado a Options default implícitos. Timeout, falha de autenticação, rejeição de parâmetros de orçamento, modelo inexistente, limitação de taxa, erro do servidor e erro de parsing da resposta são normalizados pela fronteira formal de erros de Model/Adapter e então projetados como resultado da página de configurações, sem aumentar o orçamento nem trocar de modelo automaticamente.

Um teste bem-sucedido significa que o Model formal, depois de salvo, conseguiu completar uma requisição real, e não apenas que um Probe HTTP independente recebeu um status de sucesso. Start Plan, Coding Plan e Provider de API comum usam a mesma entrada; as diferenças entre eles terminam dentro do Provider, do Request Auth e do Adapter.

Um teste retorna apenas um resultado único de sucesso/falha, sem manter `results[]` de elemento único, agregação de Endpoint ou inferência de tipo de API no Host.
A admissão final é feita pelo ModelFactory do Registry atual do Environment alvo; o teste não modifica nenhuma seleção de modelo nem o Active Model.

## Limites de implementação

Renderer, Host e Environments local e remoto usam o mesmo contrato de Settings Service. A página de configurações não cria um Registry temporário,
um Connectivity Probe Adapter nem um segundo algoritmo de Overlay/integridade.

## Salvamento e feedback do formulário de Provider

O formulário principal dos detalhes do Provider usa a mesma semântica de salvamento automático: após a alteração de uma entrada de texto, quando o usuário para de digitar por um curto período o Provider Draft completo mais recente é submetido; perda de foco, Enter, troca de Provider ou desmontagem fazem flush imediato. Entradas consecutivas no mesmo Provider compartilham um
debounce, sem criar vários salvadores por campo. Seletores, Switches e outras operações discretas continuam salvando imediatamente.

```text
连续输入 --重置定时器--> 停顿阈值 --保存最新完整 Draft
     |
     +-- blur / Enter / 切换 --> 取消定时器 --> 立即保存
```

O Model Metadata Dialog continua sendo uma transação explícita: apenas o clique em "保存" submete e "取消" precisa poder descartar o rascunho inteiro, portanto ele não participa do
salvamento automático por ocioso do formulário principal do Provider.

Após a submissão de adição e edição, não são aceitos submissão duplicada, Esc nem fechamento por overlay antes de o salvamento retornar, evitando que uma requisição antiga encerre um rascunho novo reaberto.
O salvamento bem-sucedido fecha o diálogo; a falha preserva a entrada, restaura a capacidade de editar/cancelar e permite tentar de novo no rascunho original, sem iniciar outro salvamento por uma notificação externa.

O feedback de salvamento e de conectividade do modelo pertence à coluna de detalhes do Provider atual, e não a um Toast global de viewport. O contêiner de feedback é fixo na parte inferior da coluna de detalhes à direita,
sem rolar junto com listas longas de Providers ou Modelos; objetos diferentes se empilham para cima e o saving / success / failure de um mesmo objeto é substituído no lugar.
O success usa uma faixa com cor de sucesso e um visto, e o failure permanece por mais tempo e pode ser fechado ou tentado novamente.