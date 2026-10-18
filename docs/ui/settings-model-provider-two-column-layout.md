# Layout de duas colunas de fornecedores de modelo na página de configurações

O `ModelProviderSection` usa uma estrutura de duas colunas com navegação à esquerda e detalhes à direita, unificada sob a rolagem vertical da página à direita dentro das configurações.

## Altura do conteúdo e titularidade da rolagem

- CR-01: em navegação longa ou detalhes longos, o feedback de salvamento/conectividade precisa permanecer na área visível do `main` externo e dentro da coluna de detalhes, e não ser posicionado no fim natural do conteúdo sumindo fora da tela. O feedback mantém o estado existente e o tempo de autoclose já usados, sendo posicionado apenas como uma camada sobreposta com `position: sticky` via CSS que não ocupa espaço no layout; os ancestrais usam `overflow-clip` para preservar o recorte das bordas arredondadas, sem criar contêineres de rolagem adicionais.
- MP-UI-06, após o feedback real de salvamento aparecer, aumenta as colunas esquerda e direita separadamente e rola até o topo, meio e base, verificando que o feedback fica totalmente visível em 1280×600 e 600×500 e sem alterar a altura do conteúdo.

Fronteira da correção de CR-01: com base no snapshot 5cad9f6028 do Reviewer, apenas o recorte do SectionLayout e o posicionamento do ProviderDetailFeedback foram ajustados, junto com o spec, os testes unitários e o E2E correspondentes. O snapshot original continha nós adicionais de CLI/signing, que não entraram no escopo desta alteração de layout. No código antigo, MP-UI-06 mediu `visible=false`; após a correção, MP-UI-01/06 passaram 2/2 (desktop-e2e-20260911-130920-521), os testes unitários de layout passaram 3/3, e typecheck e lint passaram.

- CSS Grid de duas colunas com altura mínima de 36rem (576px por padrão), esticando naturalmente conforme a coluna mais alta, com a outra coluna esticada para a mesma altura.
- Navegação e detalhes deixam de ter rolagem independente e sombra de rolagem nas bordas; título, descrição, botões de ação e todo o contêiner de configurações de modelo rolaram junto com o `main` externo. A navegação de configurações à esquerda continua rolando de forma independente.
- Mantém-se o breakpoint de navegação de 224px / 56px abaixo de `md`, o padding interno dos detalhes e a folga inferior para o feedback; campos de texto internos e popovers independentes continuam roláveis.
- A altura é responsabilidade do CSS, sem acrescentar medição via JS, estado ou persistência; seleção de fornecedor, edição, chamadas de serviço e os limites desktop continuous / celular replayable permanecem inalterados.
- MP-UI-01 usa sondas de altura de conteúdo temporárias para validar janelas larga e estreita, colunas esquerda e direita mais altas em separado, altura igual e acionamento real do scroll externo da página; depois da remoção das sondas, o fluxo original de operações do fornecedor continua.

Registro de verificação (2026-09-11): testes unitários de layout 3/3, MP-UI-01 em Electron/macOS (1280px / 600px) aprovado; typecheck completo, E2E typecheck, lint (0 erros) e verificação de arquitetura aprovados. A verificação em janela estreita cobriu o CSS responsivo, sem substituir a validação em aparelho celular real nem em Windows / Linux.

## Estrutura do layout

- Contêiner externo: `Card` com borda semântica, usando internamente `lg:grid-cols-[224px_minmax(0,1fr)]`.
- Esquerda: barra de navegação de fornecedores, exibida em dois níveis.
  - Primeiro nível (não clicável): `预制模型供应商`、`自定义供应商`.
  - Segundo nível (clicável): nome do fornecedor concreto.
- Direita: área de detalhes do fornecedor selecionado.
  - Pré-configurado/personalizado: exibe endpoint, API Key (mascarada), lista de modelos e mapeamento de slots Claude.
  - Ao selecionar `添加供应商`, a coluna direita entra no formulário de adição.

## 2026-07-02 Camadas de provider family e modo de conexão

- A navegação à esquerda responde apenas pela seleção do provider family ou do provider personalizado. Z.ai / BigModel ocupam 각각 apenas uma entrada à esquerda, sem variar conforme o número de Start Plan, Coding Plan pessoal ou Coding Plan de equipe.
- Start Plan, Coding Plan pessoal, Coding Plan de equipe e API Key são modos de conexão sob o mesmo provider family, alternados apenas no menu "连接方式" no topo dos detalhes à direita.
- O Coding Plan de equipe pode ter vários, todos exibidos como itens do menu "连接方式", sem gerar múltiplos nós na navegação esquerda.
- `selectedNodeKey` representa apenas o nó da navegação esquerda; o item de detalhe atual à direita é derivado das configurações de modo de conexão do family correspondente a `selectedNodeKey` e da key do modo de conexão já salvo.
- A seleção inicial do WelcomeScreen primeiro seleciona o family correspondente e depois escolhe o modo de conexão à direita conforme a intenção da entrada.

## 2026-08-15 Aviso de API Key indisponível no Team Plan

- A disponibilidade da conexão do Team Plan tem como base o resultado do pré-aquecimento da API Key do projeto da equipe retornado pelo pacote corporativo.
- Quando o pré-aquecimento da API Key do projeto da equipe falha e o servidor retorna `apiKeyUnavailableMessage`, o card de status à direita deve exibir prioritivamente esse texto do servidor, por exemplo `您当前暂无有效的团队套餐授权记录，无法创建API Key`.
- Sem texto do servidor, continua-se com o fallback para o texto local fixo `团队套餐未分配，请联系团队管理员。`.
- Esse texto afeta apenas a descrição de indisponibilidade do card de status e não altera a semântica da Team Plan connection key, do provider family, da consulta de uso nem da projeção de runtime key.

## 2026-09-17 Origem dos direitos pessoal e de equipe

- O Coding Plan pessoal usa a API Key pessoal para consultar `GET /api/biz/subscription/list`, identificando a assinatura Coding e exigindo simultaneamente `status=VALID` e `inCurrentPeriod=true` para haver direito. Key ausente, campos ausentes no item Coding adotado ou falha na requisição permanecem como desconhecidos; um array vazio retornado com sucesso significa sem direito. A lista de assinaturas é interpretada item a item, e itens irrelevantes ou não reconhecidos não sombreiam um Coding Plan válido; a existência de um item válido confirma o direito. Sem itens válidos e com item Coding presumivelmente corrompido, permanece desconhecido; nos demais casos, sem direito.
- A entrada de equipe vem da relação de organização/membro de projeto de `GET /api/biz/customer/getCustomerInfo`, e o direito não pode ser inferido pela existência do projeto nem por valores preenchidos no cliente com base em active ou pricing.
- A equipe usa um access token de negócio, carregando `bigmodel-organization` e `bigmodel-project`, para consultar `GET /api/biz/team/subscribe/product/querySubscribeDetail`. Só há direito quando `hasSubscription=true`, `status=EFFECTIVE` e `memberGrantStatus=VALID` valem simultaneamente; `hasSubscription=false`, `EXPIRED` ou `EFFECTIVE + UNASSIGNED` significam sem direito, preservando respectivamente as semânticas de não contratado, expirado ou não atribuído; outros estados não verificados e campos ausentes permanecem desconhecidos.
- As respostas válidas acima do BigModel foram verificadas em 2026-09-17 com uma conta de produção. O Z.ai mantém o domínio do family e o isolamento de autenticação Bearer; interfaces não suportadas ou respostas não reconhecidas permanecem desconhecidas, sem recorrer ao quota para adivinhar direito.
- `includeSubscription` é mantido como parâmetro de compatibilidade, mas o snapshot do Coding Plan sempre consulta e retorna o resumo de assinatura, e a entrada leve também não pode determinar direito apenas pelo saldo.
- O `quota/limit` pessoal e de equipe (incluindo `type=2`) serve apenas à exibição de cota/uso. Saldo zero, falta de data, falha de negócio ou erro de transporte não podem gerar nem revogar assinatura. O snapshot de uso não pode construir assinatura a partir do nível de quota nem anexar a assinatura pessoal à equipe.
- Direito, credencial de chamada pronta e disponibilidade de uso são três fatos independentes; a consulta de equipe não precisa criar/copiar API Key. A falta de Key pessoal não equivale a ausência de direito, e a falha da equipe em obter a chamada Key não revoga um direito já confirmado.
- O owner do direito segue o serviço de conexão de Account e a validação de identidade de requisição já existentes, sem novo cache; o cache de uso existente tem o namespace ampliado e ignora as assinaturas sintetizadas pela versão antiga a partir do quota. Pessoal e equipe são consultados de forma independente e não trocam de conexão atual por falha de quota ou de refresh.

```text
账号身份 -> 个人 API Key -> subscription/list -> 个人权益
账号身份 + org/project -> 业务 token -> querySubscribeDetail -> 团队权益
选中身份 -> 调用 Key -> quota -> 仅用量展示
桌面 / 手机 -> 同一 Host 服务结果；原 continuous/replayable 边界不变
```

Aceitação: pessoal válido/não no período atual/lista vazia/sem Key/erro; equipe válida/não contratada/estado desconhecido/campo ausente/erro; isolamento entre múltiplas organizações e projetos; quota zero, sem data ou com exceção nos dois tipos sem afetar o direito já confirmado; a assinatura de equipe não herda produto nem data de renovação do pessoal.

## Modelo de estado

- `selectedNodeKey`: o nó de segundo nível selecionado atualmente à esquerda.
- `editingId`: se a coluna direita está em modo de edição.
- `isAdding`: se a coluna direita está no formulário "新增供应商".

Regras de sincronização de estado:

- Ao entrar no modo de adição, força a seleção do nó `custom:add`.
- Ao entrar no modo de edição, sincroniza automaticamente a seleção esquerda com o nó daquele fornecedor.
- Quando o nó selecionado fica inválido (por exemplo, após uma exclusão), retorna automaticamente ao primeiro nó selecionável.

## Restrições de interação

- O título de primeiro nível serve apenas como rótulo de agrupamento e não responde a cliques.
- Ao clicar em qualquer nó de fornecedor de segundo nível, a coluna direita exibe apenas os detalhes desse nó.
- `添加供应商` é um nó de segundo nível do agrupamento personalizado e, como os demais, dirige o conteúdo da coluna direita pela seleção.
- Mantêm-se os fluxos de refresh, salvamento e exclusão; o OAuth oficial codex/claude/gemini deixa de ser uma entrada de configuração de fornecedor de modelo.

## 2026-06-13 Resposta da navegação esquerda em janela estreita

- Em janela estreita, a navegação esquerda da página de configurações de fornecedores de modelo encolhe de `224px` para uma barra de ícones de `56px`, e a área de detalhes à direita mantém `minmax(0, 1fr)`, evitando que a coluna da esquerda comprima o conteúdo principal do formulário.
- A ordem responsiva é: a barra lateral externa de Settings colapsa primeiro em `lg`, a navegação de fornecedores de modelo colapsa em seguida em `md`, e por último os cards de Plan/Usage passam a empilhar verticalmente em `sm`.
- No estado compacto, exibe-se apenas o ícone do fornecedor, o estado de carregamento e o ponto de status, e as entradas continuam sendo botões de ícone quadrados; o nome do fornecedor, o badge do modo de conexão e o título do grupo ficam ocultos na camada visual.
- Todos os itens de navegação clicáveis continuam usando o `ControlHintTooltip` encapsulado, exibindo o nome do fornecedor à direita em hover/focus, garantindo que a entrada atual continue identificável no estado recolhido.
- A ordenação por arrastar continua no ícone da entrada de fornecedor personalizado, sem alterar a semântica atual de ordenação de provider id.

## 2026-06-13 Resposta do Plan Card em janela estreita

- Os cards de Coding Plan / Start Plan à direita podem passar de layout horizontal para vertical abaixo de `sm`, e a informação principal, o status e os botões de ação deixam de se comprimir mutuamente.
- O card de resumo de uso dos planos contratados mantém o paralelismo horizontal em tela larga; abaixo de `sm` passa a empilhar verticalmente, preservando o título, a descrição do modelo, a porcentagem e a barra de progresso de cada card.
- As informações de preço e o botão de compra do card de compra do plano passam a se organizar de cima para baixo abaixo de `sm`, com a largura do botão acompanhando o contêiner, evitando que textos longos ou textos localizados estourem o card.

## 2026-04-07 Alinhamento de estilo da navegação esquerda (referência z-work)

- A largura da coluna esquerda é reduzida de `280px` para `224px`, com espaçamento de grupos/itens unificado para reduzir o ruído visual.
- O título de grupo passa a usar um estilo de título inline `text-ui-base + font-semibold`.
- Os nós passam a usar um "estado de seleção por borda" em vez de seleção apenas por fundo:
  - selecionado: `border-primary + text-foreground`
  - não selecionado: `border-transparent + hover:border-border-hover/60`
- Suplemento de ícone de fornecedor à esquerda do nó:
  - fornecedor predefinido: usa o logo do OAuth provider (`Z.AI` / `BigModel`)
  - fornecedor personalizado: usa o ícone genérico `Package`
  - adicionar fornecedor: mantém o ícone `Plus` e usa `text-primary` para reforçar a descoberta
- O ponto de status à direita do nó passa a `CircleIcon`, distinguindo azul (`text-sky-500`) de cinza (`text-gray-400`) conforme a disponibilidade.

## 2026-04-07 Alinhamento de estilo da área de detalhes direita (referência z-work)

- Os cards de detalhes passam a usar uniformemente o estilo de painel `rounded-2xl + border + bg-background/50`.
- O peso do título permanece `font-semibold`, e o tamanho da fonte é reduzido do `text-lg` antes muito grande para `text-ui-lg`.
- Os labels dos campos passam uniformemente a `text-ui-base font-medium text-foreground-subtle`, reduzindo o ruído visual.
- Campos de entrada e exibição somente leitura passam uniformemente a `rounded-lg + bg-input`, visualmente consistentes com os demais formulários de settings.
- O botão "新增 modelo" da lista de modelos passa ao estilo de botão secundário (`secondary`), completando a expressão de fundo no hover.
- A descrição do corpo do card placeholder passa uniformemente a `text-ui-base text-foreground-subtle`.

As respostas de assinatura pessoal e de equipe seguem o contrato de envelope já existente: `code` pode ser omitido e, quando presente, aceita apenas `0` / `200`; `success=false` é sempre rejeitado. A parte de dados continua validada conforme o schema de assinatura correspondente.

Os estados de verificação e de erro da linha de status do plano são mutuamente exclusivos: em `checking`, exibe-se apenas o spinner e o texto de verificação em andamento, sem sobrepor o ícone de erro da rodada anterior da equipe, o laranja ou a mensagem de erro do servidor; após a conclusão da consulta, o aviso é restaurado conforme o estado final. O botão de login mantém o actionStatus/loginLoading independente.

Na seção de detalhes da equipe, uma falha comum na consulta de direito ou na obtenção do Project Key não significa falha de OAuth e deve exibir "重试" em vez de "连接账号". A ordem do retry é: primeiro atualizar a conta/credencial do Host, depois forçar o refresh do direito da organização e do projeto atuais; um plano explicitamente não atribuído continua exibindo o aviso para o administrador, e só um login explicitamente ausente ou inválido entra no fluxo de login.

Quando a assinatura de equipe está explicitamente com `status=EXPIRED`, o direito está indisponível e o motivo expired é preservado; `EFFECTIVE + UNASSIGNED` significa não atribuído. Enumerações desconhecidas e falhas de requisição permanecem unknown e não permitem inferir "não contratado". O snapshot de direito compartilhado carrega um `teamPlanUnavailableReason` opcional em `no_plan`; a UI mostra o aviso de expirado/não atribuído e não mostra conexão, falha de obtenção ou retry. Uma assinatura explicitamente inválida tem prioridade sobre erros antigos do Project Key.

`团队订阅响应 → 服务解析明确原因 → UsageEntitlementSnapshot → 当前团队状态行`; os serviços e o snapshot existentes continuam sendo a única fonte de estado, sem alterar o limite de restauração desktop/celular.

A consulta de assinatura somente leitura da equipe sempre usa o family, a organização e a identidade de projeto do item de navegação selecionado, sem sofrer o portão de disponibilidade do Provider em execução; quando falta identidade, nenhuma requisição de equipe é construída.

Quando não há direito claro, seja pessoal, seja de equipe, a lista de modelos nos detalhes fica oculta (incluindo adicionar, editar, testar e o interruptor), mas a entrada da página de configurações de modelos, o card de status do plano e os banners existentes são mantidos, e nenhuma configuração salva é removida. `notPurchased` pessoal e `not-allocated` / `expired` de equipe são ausência clara de direito; consulta em andamento, consulta falha e falha na obtenção da Key não podem ser inferidas como ausência de direito, e a exibição da configuração de modelos existente é preservada. As regras dos cards de plano e dos banners existentes permanecem inalteradas. A aceitação cobre com direito, sem direito, falha e em consulta, além do estado sem direito sem Effective Provider.

Os detalhes do Start Plan não exibem o banner promocional de plano de experiência (incluindo nos estados não logado e sem direito), mantendo o card de status do plano no topo e o banner pessoal de plano existente; quando pessoal/equipe não está conectado, o banner promocional de experiência também não é exibido e a lista de modelos fica oculta, preservando o card de status de conexão e os banners pessoal/equipe, sem apagar a configuração.

Quando o BigModel está logado mas o plano pessoal não foi contratado, a área de compra exibe simultaneamente os banners de planos pessoal e de equipe do catálogo estático. O marcador de histórico de assinatura da equipe não oculta a entrada de compra da equipe; o preço continua vindo dos produtos do catálogo estático, sem inventar produtos ou preços.

Fallback de validade do Start Plan: a leitura compartilhada de balance usa o HTTP Date como horário desta resposta, quando ausente usa o server_time válido do JSON e, só na ausência de ambos, usa o horário local; um plano active cujo ends_at já passou é normalizado como expired, e os buckets de saldo pertencentes apenas a planos expirados são descartados. A verificação de direito e o snapshot de uso consomem o mesmo resultado. Sem plano válido e com planos expirados existentes, o snapshot carrega startPlanExpired, a UI exibe "体验套餐已过期", oculta o saldo e a lista de modelos e mantém as entradas existentes de upgrade/compra. Em múltiplos planos, o plano válido continua sendo exibido; horário de fim ausente ou inválido não é arbitrado como expirado.

O banner de compra dos detalhes do Start Plan também precisa verificar o direito válido pessoal/da equipe da mesma plataforma da conta: quando existir uma conexão pessoal ou de equipe com status=purchased, os banners de compra pessoal e de equipe são ocultados, e o estado de expiração do Start continua exibido. Histórico subscribed, expirado, não atribuído, falha de consulta e outros direitos de plataforma não podem disparar a ocultação; as regras de compra dos detalhes pessoal/equipe permanecem inalteradas.

Quando já existe um plano pessoal ou de equipe válido na mesma plataforma, o botão "升级 · 150% 配额" do card do Start Plan e sua descrição de campanha são ocultados junto, reutilizando a verificação de direito válido do banner de compra. Os saldos e a lista de modelos dos múltiplos cards Start válidos/em transição mantêm a exibição original; as ações de upgrade dos próprios detalhes pessoal/equipe permanecem inalteradas.

A navegação Zhipu à esquerda da página de configurações recupera a marca: BigModel / Z.ai, e a entrada independente de experiência exibe Start Plan; essas nomes são mantidos tanto nas interfaces em chinês quanto em inglês. Ícone, ponto de status, key de navegação, modo de conexão e o título de marca do fornecedor à direita permanecem inalterados.

A identidade de correspondência da página de configurações da conexão de equipe é a plataforma, a organização e o projeto. Quando o ID de produto salvo difere do ID de produto atual da interface de assinatura, a mesma organização/projeto permanece selecionada; nem a inicialização do snapshot de direito nem a lista posterior de produtos podem exibir "连接不可用" ou opções vazias por causa disso. O ID de produto continua sendo metadado do plano; a correspondência não é escrita de volta na seleção e não altera a autenticação da requisição nem a elegibilidade de execução; plataformas, organizações e projetos diferentes permanecem isolados.