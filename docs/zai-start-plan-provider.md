# Provider Z.AI / BigModel Start Plan

## Arquitetura atual de Provider (Todo154: Start independente)

A seleção de conta continua salvando `providerFamilyDomain` e `providerFamilyConnectionSelections`; nenhuma migração é adicionada.
O Account Source publica a cada rodada simultaneamente o estado da conta (availability/current/effectiveAt) e o Config Overlay
(entitled/membros de modelo dinâmicos), e Settings e Registry consomem a mesma revision. O Off-Peak mantém o
`hidden` estático, sem definir `current`; Providers Personal/Template comuns também não são restringidos por `current`.

```text
Consulta de conta + seleção de Family
  -> estado de Account + Overlay (mesma rodada)
     -> Settings: pode ver available/pending
     -> Registry: corresponde ao contexto de acesso da conta atual + entitled + modelos completos e habilitados
```

A consulta de saldo do Start é independente da consulta do Coding Plan pessoal; o Team exige uma identidade concreta de organização/projeto e não se pode adivinhar um time.
Quando ainda vai entrar em vigor, fica pending/entitled=false, preservando `effectiveAt` em segundos Unix; quando já está em vigor mas sem modelos, continua entitled=true,
com a lista de membros de modelo vazia e sem reaproveitar a whitelist antiga. Quando a consulta é desconhecida, apenas se preserva o último resultado bem-sucedido da mesma conta/Time.
Conexão inválida apenas exibe um aviso e volta à entrada de configurações acionável, sem reescrever a seleção de Family salva nem substituir o modelo da sessão.
O resultado do resgate por padrão apenas abre as configurações de modelo, sem trocar para o Start; o antigo automático "experimente agora" não faz parte do comportamento padrão do staging fixo.

O Start acompanha o login atual do App e não exige conexão separada. `current` significa que o contexto de acesso da conta corresponde: o Start da mesma marca e o pessoal/time atual podem ser true ao mesmo tempo; o connectionKey do Start não inclui a escolha do plano pago. Expiração, desconhecido, modelo desabilitado etc. continuam validados pelas regras originais de entitlement e Registry; login não significa resgate automático.

A página de configurações exibe um `Start Plan` independente, lado a lado no grupo "智谱"; as duas marcas compartilham o ícone Z fornecido pelo usuário (`model-provider-start-plan.png`, o mesmo arquivo original nos temas claro e escuro), preservando os IDs `account:*` originais; os planos pessoal/time continuam usando seus respectivos ícones de marca. Os detalhes do Start preservam entitlement, cota, resgate e gestão de modelos, removendo conectar/desconectar e o dropdown de conexão paga; navegar e resgatar não alteram a conexão paga.

No menu de seleção de modelos, o título do grupo dos planos de experiência das duas marcas é uniformizado como `Start Plan`, e o rótulo em cápsula mostra "gratuito" em chinês e "Free" em inglês; chat, tarefas agendadas, subagentes e Wiki usam a mesma regra de exibição. O grupo mantém a lista real de modelos e as etiquetas de capacidade existentes, sem alterar os valores de seleção de Provider/modelo.

A seleção de Start salva é resolvida com precisão pelo Provider ID, modelo e opções originais, sem mapeamento cruzado entre marcas e sem recuo para a cota paga. Pessoal/time continuam mapeando pela conexão paga única atual. Sessões, tarefas, Automation, Subagent, Bot e Wiki históricas não são reescritas em massa; Session mantém a gravação original após a execução bem-sucedida; o antigo `kind: start-plan` mantém a leitura, e iniciar não ativa mais o Start escrevendo nele.

Na troca de modelo dentro da sessão, o texto separador, o aviso de primeiro uso e o toast de troca correspondente usam `模型名(套餐类型)` para modelos de plano de conta de BigModel/Z.ai: plano pessoal, plano de experiência, plano de equipe. Por exemplo `GLM-5.3(团队套餐) → GLM-5.3(体验套餐)`; mesmo com nomes de modelo iguais, a origem da cota fica distinguível. Os tipos são tirados respectivamente dos Provider IDs antes e depois registrados no aviso, sem ler a conexão global atual nem o rascunho do campo de entrada; quando o Provider já não está no catálogo atual, os pacotes embutidos continuam reconhecíveis. Os nomes de plano são traduzidos conforme o idioma da interface; suppliers personalizados comuns continuam usando as regras de nome originais; desktop e celular usam a mesma lógica de exibição e os dados históricos não precisam de migração.

Quando o usuário envia uma nova mensagem, salva uma tarefa agendada após criar/modificar um modelo, gera manualmente um Wiki ou salva um modelo explícito de Subagent, se a seleção válida atual for um modelo pago, e o Start tiver um modelo executável igual com opções de pensamento compatíveis e cota positiva explícita, o uso do plano de experiência pode ser recomendado. Cota desconhecida ou falha de consulta pula a recomendação; não se espera uma atualização forçada de cota para o envio. Depois que o usuário clica em "trocar plano", a seleção de Start deste ponto de entrada é lembrada dentro dos limites originais de envio/salvamento; clicar em "não" continua com a seleção original; fechar mantém o rascunho e não executa a operação.

Na parte inferior do diálogo de recomendação, "não mostrar novamente" fica à esquerda e o grupo de botões "não / trocar plano" à direita, na mesma linha e centralizado verticalmente; em telas estreitas ou quando traduções longas deixarem espaço insuficiente, o grupo de botões quebra de linha como um todo e permanece alinhado à direita.

`startPlanRecommendationDismissed` é a preferência de persistência unificada do App/Host atual. Marcar "não mostrar novamente" e confirmar qualquer botão encerra apenas a recomendação, e cada ponto de entrada continua usando seu próprio modelo salvo no próximo uso; fechar o diálogo não salva a marcação. Outro ponto de entrada ou o celular conectado ao mesmo Host relê essa preferência no próximo envio. Erros reais de cota/autenticação continuam sendo exibidos normalmente, sem adicionar sincronização de conta na nuvem entre Hosts.

Bot, execução em segundo plano, "executar agora" na lista de tarefas, desidratação de filas existentes, retry, recuperação da página de falha do Wiki, herança de Subagent/apenas-pensamento ou modificação de texto não geram aviso. O aviso global de invalidação de conexão de conta observa apenas a conexão paga; o Start mantém sua própria cota e feedback de indisponibilidade. Os limites completos e a aceitação SIP-01–21 estão em [Todo154](working-memory/provider-refactor/steps/todo-154-start-plan-independent-provider.md).

Os `builtin:*` nas descrições de interfaces antigas abaixo são identidades anteriores à migração; hoje correspondem a `account:*`, e o Provider Store antigo não pode ser restaurado.

O Start Plan é representado por ids de model provider embutidos dedicados:

```txt
builtin:zai-start-plan
builtin:bigmodel-start-plan
```

Ambos os providers reutilizam intencionalmente o mesmo endpoint de runtime `zcode-plan` e o
mesmo conjunto de modelos gratuitos. A sincronização de presets OAuth deriva cada provider
de Start Plan do seu próprio domínio de login da marca, de modo que as chamadas de modelo em
runtime continuem usando o mesmo endpoint `zcode-plan` enquanto as credenciais permanecem
isoladas por id de provider.

As verificações de status são separadas das verificações do Coding Plan pago. `builtin:zai-start-plan`
lê a identidade do plano gratuito ativo e o horário de renovação do bucket de cota diária a
partir de uma única requisição de saldo:

```http
GET https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>
Authorization: Bearer <zcodejwttoken>          # Z.AI
Authorization: Bearer <zcodejwttoken>          # BigModel
X-Device-Mid: <telemetry-state.json deviceMid>  # obrigatório; ausente -> 400 {"code":3001,"msg":"parameter error"}
```

O `X-Device-Mid` é exigido pelo backend para este endpoint, embora seja um campo opcional nas
regras genéricas de cabeçalho de origem. Portanto, todo runtime que emite esta requisição
(Host do Desktop, `zcode-server` remoto, CLI) deve garantir que seu próprio `deviceMid` exista
antes da primeira consulta de saldo; veja `docs/zcode-endpoint-device-mid-header.md`. Um
`400 parameter error` aqui é classificado como disponibilidade `unknown` e desabilita os
modelos de Start executáveis, portanto um cabeçalho ausente nunca deve ser tratado como falha
do backend.

`billing/current` está obsoleto para o Start Plan. A resposta de `balance` deve incluir
`data.plans` para detecção de plano ativo e metadados de assinatura, além de `data.balances`
para exibição de cota/restante. Os clientes não devem chamar `current` antes de `balance` nem
emitir uma segunda requisição de `balance` para o mesmo snapshot.

`app_version` sempre usa o `ZCODE_VERSION` atual do app, incluindo builds de desenvolvimento,
para que o gating do backend observe a mesma identidade de versão do app em execução.

`zcodejwttoken` é o JWT de backend OAuth salvo durante o login do Z.AI ou do BigModel.
O BigModel repassa o `code` de callback de uso único diretamente para
`https://zcode.z.ai/api/v1/oauth/token` com `state`, `redirect_uri` e
`provider: "bigmodel"` para salvar o mesmo formato de JWT usado pelo Z.AI Start Plan.
Os providers de Coding Plan pago continuam usando `/api/biz/subscription/list`;
as APIs de monitoramento de cota permanecem reservadas para as telas de uso/limite do Coding Plan.

## Seleção e disponibilidade independentes

O Start é uma entrada permanente de Provider para a marca de login atual, independente da seleção da conexão paga. Sem entitlement ativo, uma consulta com falha ou ativação pendente muda apenas o painel de status, não a existência desta entrada. O menu de modelos executáveis continua controlado pelo Account Source e pelo Registry; um Start indisponível nunca recai para a cota paga.

- A cota do composer segue o Provider/modelo efetivo daquele composer. O Start não exige um `kind: start-plan` salvo; a cota paga continua usando o escopo exato pessoal/time.
- Identidade de time legada não resolvida bloqueia apenas esse acesso pago; não interrompe a descoberta de entitlement do Start.
- A seleção da conexão paga usa a seleção de family salva/pendente e a identidade exata de org/projeto/produto, não o `provider.current` de um item de navegação copiado. Sem escolha correspondente, exibe-se o placeholder normal; uma única opção não selecionada continua acionável.
- Os detalhes do Start reutilizam o texto/spinner de carregamento existente, os cartões de assinatura ativo/pendente, os buckets de cota, a apresentação de saldo zero, o horário de reset e a gestão de modelos. Não há novo skeleton, aviso de esgotamento, overlay persistente de falha de refresh ou sistema de cores de ponto de status.
- O Start sem login oferece login; uma ausência conclusiva de plano mostra que não há plano de experimental disponível nem a introdução/campanha elegível existente. Uma falha na primeira consulta oferece retry, expiração explícita de autenticação oferece login, e configuração indisponível fica reservada para configuração realmente ausente. O refresh silencioso mantém os dados existentes apenas sob as regras de cache/erro já existentes.
- O sucesso do resgate continua sendo sucesso se um refresh subsequente falhar. A ação de configurações é "查看套餐 / View plan"; nenhum guia automático de modelos ou mutação implícita de modelo/conexão paga permanece.

### Frescor da recomendação e mudanças de conta

Recomendação, configurações e saldo do composer usam a mesma identidade de requisição/cache do Start para o mesmo Host/conta/Provider. Reutilize a impressão digital de entitlement de Provider existente, os eventos de refresh e o cache de UsageEntitlement; não introduza outro dono do saldo. O refresh das configurações publica a nova cota para o consumidor da recomendação.

A entrada na página e o envio interativo realizam uma verificação de atualidade de acesso com o throttle existente de 60 segundos, mesclagem de requisições em voo e backoff de erro. Mudanças de conta/resgate usam o caminho de refresh de auth/compra existente. Nenhuma sondagem ociosa é introduzida.

Somente um snapshot bem-sucedido amostrado há no máximo 60 segundos pode sustentar uma recomendação. Ler ou remontar não renova sua idade. No momento do envio, some o tempo local decorrido desde a amostragem ao tempo de referência do servidor antes de verificar a expiração do bucket. Um bucket expirado nunca sustenta uma recomendação, mesmo em um snapshot recente. Cota ausente/desatualizada dispara refresh em segundo plano e este envio prossegue com sua seleção original, sem esperar e sem reenviar depois. Falhas de consulta pulam recomendações; elas não estendem a validade de cota positiva antiga. Este limite se aplica às decisões de recomendação, não à limpeza automática dos cartões de plano visíveis.

```text
account/claim change → existing entitlement refresh → shared quota snapshot
page entry/submit  → access freshness check ────────↗
submission → fresh snapshot + valid bucket + compatible same-model quota?
  yes → existing recommendation/choice → original owner commit
  no  → original selection commits; quota refresh stays in background
```

### First input de conversa lateral

`/side <text>` também é um primeiro envio interativo. Resolva o modelo efetivo herdado pelo filho antes da recomendação; nunca substitua por um rascunho não enviado do composer pai. `createSelectionSideSession.firstInput` aceita um `modelSelection` completo opcional, usado na criação do filho e no primeiro envio, preservando as opções de reasoning. Payloads antigos só com texto mantêm sua herança existente. Cancelar mantém a seleção herdada; fechar a recomendação deixa o rascunho e não envia comando de criação. `/side` vazio apenas abre um filho e não recomenda.

O comando atômico existente de criação/primeira entrada, seu id de comando, a admissão e o ACK são responsáveis pela execução e pela deduplicação. O modelo/fila do pai e a conexão paga global permanecem inalterados. O desktop contínuo e o mobile reexecutável continuam usando o mesmo dono e os caminhos de recuperação originais. As regressões aceitas são SF-01 até SF-19 em [Todo156](working-memory/provider-refactor/steps/todo-156-start-plan-followup-final-decisions.md).

O painel de status das configurações usa a identidade de provider do Start Plan para apresentar um
estado de plano gratuito com uma entrada de upgrade para o Coding Plan pago. A projeção do painel é
consciente de múltiplos planos:

```text
billing/balance (server priority order)
  plans[] -------------------------------> one card per active plan
     | plan_id                                  | title / plan expiry
     |                                          v
     +---- balances[].plan_id ------------> only this plan's quota buckets
                                                | bucket expires_at
                                                v
                                           bucket-local reset time

  balances[].capabilities ----------------> model id union
                                                |
                                                v
                                      read-only Models section at the bottom
```

Contrato de campos (garantido pelo servidor, sem recuos legados no cliente):

- cada entrada de `plans[]` carrega `plan_id`, `status` e `ends_at`
- cada entrada de `balances[]` carrega `plan_id` e `expires_at`
- cada bucket de `balances[]` pertence a uma entrada `plans[]` ativa: o servidor
  não deve retornar buckets cujo `plan_id` esteja ausente ou mapeie para um plano
  inativo. O provider registra um warn de armadilha
  (`warnOnUnattributedStartPlanBuckets`) quando este contrato é violado,
  porque o caminho de múltiplos cartões das configurações descarta silenciosamente
  esses buckets enquanto a bolha da entrada de chat ainda os mostra.
- O agrupamento dos cartões de plano continua usando `plan_id`; os rótulos de reset usam `expires_at`,
  sem recuar para `period_end`. Os lembretes de bucket preservam adicionalmente
  `bucket_id`, `user_plan_id`, `period_start` e `period_end`: o bucket e o período
  identificam um único lembrete, enquanto `user_plan_id` faz a junção com o rótulo do
  período de entitlement para a instância exata do plano do usuário. Veja `start-plan-daily-quota-banner.md`.

- Os planos ativos são renderizados na ordem exata retornada por `data.plans`; o
  cliente não deve ordená-los novamente, porque o servidor já aplicou a
  prioridade de produto.
- Cada plano reutiliza a superfície existente de Plan Card e mostra seu próprio nome
  remoto, `ends_at` e buckets de cota.
- Um bucket pertence a um cartão apenas quando seu `plan_id` corresponde a esse plano. Um bucket
  sem `plan_id` correspondente não é anexado a nenhum cartão; o cliente não deve
  recorrer a buckets sem plano, caso contrário o mesmo bucket seria copiado
  para cada cartão.
- Cada bucket de cota formata seu próprio `expires_at` como seu horário de reset; um
  horário de reset de nível de plano ou o mais cedo nunca deve ser copiado para buckets irmãos.
  Os cartões do Start Plan não renderizam nenhum horário de renovação de nível de plano. A bolha de
  saldo contextual da barra da entrada de chat segue a mesma regra: cada medidor lê
  apenas o `expires_at` de seu próprio bucket (`limit.nextResetTime`), nunca o
  `remaining.nextResetTime` agregado nem o horário de renovação do plano. A formatação do horário de
  reset do bucket é alinhada ao Coding Plan pelo `formatQuotaResetTime({ format: "adaptive" })`
  compartilhado: resets no mesmo dia renderizam apenas `HH:mm`, resets em outros dias renderizam apenas a data.
- A seção Models somente leitura permanece fora de todos os cartões de plano, no final
  do detalhe do provider. Seu conteúdo é a união sem distinção de maiúsculas das capacidades
  de modelo de todos os buckets retornados, preservando a ordem de primeira ocorrência.
- Esta apresentação não muda a obtenção do saldo, a seleção de provider,
  o roteamento de runtime ou a sincronização de modelos. O snapshot de entitlement apenas
  preserva a identidade de plano/bucket já presente na mesma resposta de saldo para que a UI de configurações possa renderizar o agrupamento correto.

Impacto na identidade de telemetria: `subscription.details` agora carrega todos os planos ativos
na ordem de prioridade do servidor, portanto o `plan_product_id` reportado pela telemetria
`send_btn` lê `details[0]` — o plano ativo de maior prioridade. A reordenação
intencional do servidor inverte este id. Veja
`docs/monitoring/business-monitoring.md` para o contrato de reporte.

O comportamento compartilhado do Plan Card permanece:

- título: `{provider} - Start Plan`
- metadados de compra: badge `Start Free` e o horário de expiração do plano vindo de
  `balance.data.plans[].ends_at`, renderizado apenas como data (ano omitido para o
  ano atual). Os horários de reset dos buckets vêm apenas do `expires_at` de cada bucket.
- o botão de upgrade é exibido; os cartões de preços permanecem ocultos até o usuário clicar em
  upgrade
- as ações de gerenciar e desvincular ficam ambas ocultas para os cartões de plano do Start Plan: o
  nível gratuito não tem página de gerenciamento e o estado de login é gerenciado no
  nível da conexão da family; o cartão mantém apenas a data de expiração e a
  ação de upgrade para o Coding Plan (com seu badge de desconto de faturamento)

O formulário de detalhes das configurações não expõe campos de conexão manual para o Start
Plan. `Base URL`, `API Format` e `API Key` são substituídos por um cartão do Start Plan,
porque esses valores são mantidos pelo sync OAuth/preset e não devem parecer editáveis pelo usuário.

O catálogo de modelos do Start Plan continua sendo gerenciado em conjunto por `billing/balance` e `client/configs.builtinModels`; o usuário não pode adicionar, remover ou renomear modelos, nem modificar o Token máximo de saída, modais de entrada/saída e outros
fatos de modelo do servidor. A linha de modelo abre apenas duas operações locais:

- modificar a janela de contexto; o valor do usuário salvo após a gravação deve ser preservado no refresh do provider e passado ao runtime registry.
- testar a conectividade do modelo atual; o teste continua usando as credenciais atuais do Start Plan e o endpoint fixo.

Portanto a página de configurações deve manter o ID do modelo somente leitura, esconder as entradas de adicionar/remover e renderizar na janela de edição restrita apenas os campos de janela de
contexto. O refresh remoto ainda pode atualizar a lista de modelos e os metadados fora do contexto; se um modelo já não estiver na lista autoritativa de entitlement, ele deve ser removido normalmente, sem ser mantido só porque o contexto foi modificado localmente.

## Preview sem login

Quando um usuário abre qualquer uma das entradas do Start Plan antes de fazer login, o painel de
configurações mostra a prévia gratuita do Start Plan seguida pelos cartões de preços do Coding
Plan pago:

```tsx
<StartPlanCard />
<CodingPlanPricingCards />
```

Ambas as seções leem do mesmo endpoint de configuração do cliente sem autenticação, e a
camada de serviço deve compartilhar um único payload `client/configs` entre o cartão de prévia,
os cartões de preços e quaisquer outros consumidores de configuração do cliente na mesma
instância de provider:

```http
GET https://zcode.z.ai/api/v1/client/configs?app_version=<ZCODE_VERSION>&platform=<platform>-<arch>
```

`StartPlanCard` usa `configs.startPlanPreview`:

```ts
interface StartPlanPreviewConfig {
  planId: string;
  name: string;
  entitlements: {
    grantUnits: number;
    meter: string;
    period: string;
    showName: string;
    unitType: string;
  }[];
}
```

O payload atual é neutro em relação ao provider, portanto o Z.AI Start Plan e o BigModel Start
Plan mostram a mesma prévia do Start Plan. A diferença específica do provider está
na lista de preços paga logo abaixo:

- cartão de prévia de `builtin:zai-start-plan`: `configs.startPlanPreview`
- cartões de preços de `builtin:zai-start-plan`:
  `configs.codingPlanStaticProducts["builtin:zai-coding-plan"]`
- cartão de prévia de `builtin:bigmodel-start-plan`: `configs.startPlanPreview`
- cartões de preços de `builtin:bigmodel-start-plan`:
  `configs.codingPlanStaticProducts["builtin:bigmodel-coding-plan"]`

Se `configs.startPlanPreview` estiver ausente, a superfície do Start Plan sem login não
deve renderizar a prévia gratuita do Start nem o conteúdo do SKU Start gratuito / 体验套餐. Os cartões
de preços do Coding Plan pago ainda podem ser renderizados a partir de `codingPlanStaticProducts`; o
conteúdo gratuito do Start é controlado apenas por `startPlanPreview`, e não por um
fallback local codificado em definitivo.

O banner de escolha de compra sem login da BigModel segue a mesma regra. A entrada do Start
Plan só é renderizada quando `configs.startPlanPreview` existe e possui entitlements `model_usage`
exibíveis. Seu título usa `startPlanPreview.name`, sua métrica grande de cota é calculada a partir
do entitlement `grantUnits`, e sua descrição lista os nomes remotos de modelos de entitlement e os grupos de cota. Quando o
preview está ausente, as entradas de compra pessoal/time podem continuar visíveis, mas a entrada do
Start Plan e todo texto específico do Start devem estar ausentes.

Quando o usuário desvincula a sessão OAuth ativa do Z.ai / BigModel enquanto a mesma
family ainda tem uma API key, o domain da family permanece selecionado, mas o detalhe atual de
Start/Coding deve voltar para a visão do Start sem login. Isso preserva o contexto das
configurações da family e reexibe o preview do Start mais os cartões de preços quando
`startPlanPreview` está presente, em vez de deixar o usuário em um cartão de Coding Plan
desconectado sem próxima ação.

## Banner de resgate manual

A barra lateral do workspace consulta `GET /api/v1/zcode-plan/billing/preview` com a
versão/plataforma atuais do cliente. Um JWT do ZCode é anexado quando disponível, enquanto a
prévia sem login é enviada sem Authorization. Ela renderiza um banner
diretamente acima do rodapé do perfil somente quando `data.plans` contém um plano
resgatável. Múltiplos planos são resolvidos por `priority` descendente, depois por `plan_id`
ascendente para exibição determinística. Uma resposta vazia ou uma falha de requisição
não renderiza banner na primeira leitura. Uma falha transitória de refresh preserva a última
prévia bem-sucedida; uma resposta vazia autoritativa a remove. Ler a prévia nunca resgata nem ativa um plano.

O `data.server_time` de `preview`, `claim` e `balance` é a autoridade de negócio para os campos de tempo dentro de cada resposta,
com unidade unificada em segundos Unix; quando exposto ao Renderer, o Service converte tudo para milissegundos. O cliente não pode substituir
`server_time` por `generatedAt`: o primeiro ainda representa o tempo de geração do snapshot local, o segundo é usado para comparar
`starts_at`, `ends_at`, `effective_at` e `expires_at` dentro da mesma resposta. Para compatibilidade com servidores antigos, a ausência do campo é
permitida com recuo para `Date.now()`, e valores inválidos são tratados como ausentes; não se pode reutilizar um `server_time` antigo entre interfaces. `server_time` não é ID
de lote de campanha nem altera os ciclos de polling de 10 minutos/30 segundos; a próxima campanha continua sendo definida pelo resultado resgatável
do novo preview.

### Interação de resgate manual

`preview` é uma interface pública de exposição: requisições sem login vão sem Authorization, e após o login o ZCode
JWT pode ser anexado. `claim` exige login; a versão oficial ainda executa uma verificação de segurança antes do claim (estágio `verifying` no diagrama). A máquina de estados após o clique no Banner é:

```text
idle -> checking-auth -> verifying -> claiming -> success-dialog -> refreshing -> hidden/idle
                                \-> failure-dialog ---------------------------> idle
```

- Sem login, o clique apenas inicia o login, sem chamar a verificação de segurança nem o claim; após o login concluído, o usuário confirma o resgate novamente.
- Ao clicar no botão de fechar no canto superior direito do Banner, o Banner não pode ser ocultado de imediato: deve-se primeiro exibir um diálogo de confirmação padrão, cujo título avisa que o usuário vai perder uma oportunidade de resgate e cuja descrição explica que as oportunidades desta campanha são limitadas e que fechá-la pode fazer o usuário perder esta oportunidade; o texto de confirmação não pode descrever o Start Plan como campanha nem afirmar que não é possível resgatar de novo.
  "确认领取" fecha o diálogo de confirmação e reutiliza a mesma máquina de estados de resgate; "关闭" é que oculta o Banner no ciclo de renderização atual.
  Pressionar Escape, clicar no overlay ou qualquer outra forma de cancelamento apenas fecha o diálogo de confirmação, sem ocultar o Banner e sem disparar claim.
- Existe no máximo uma requisição de resgate por vez; durante o pending o Banner proíbe cliques repetidos.
- Na versão oficial, a verificação de segurança pré-resgate só chama o claim depois de ter sucesso; falha, cancelamento ou timeout total da interação encerram o pending e exibem o
  resultado de falha do resgate, proibindo que o Banner gire indefinidamente.
- `POST /api/v1/zcode-plan/billing/claim` usa o ZCode JWT atual, com body
  `{ "plan_id": plan.planId }`; o resultado da verificação de segurança da versão oficial é passado por cabeçalho de requisição.
- Quando a requisição tem sucesso, exibe-se um diálogo de resultado exclusivo do Start Plan; quando falha, reutiliza-se o template padrão `AlertDialog`. O diálogo de sucesso tem, na parte superior, uma área Hero temática de exibição de entitlement
  em `4:3` que escala responsivamente com a largura do diálogo (480 × 360px a 480px de largura),
  com um cartão de plano em estilo de ticket; a seção inferior de
  descrição e ação cresce naturalmente conforme conteúdo, espaçamento e padding; a largura total do diálogo no desktop é `480px`, a altura total não é mais
  fixa e encolhe até a área segura da viewport em telas estreitas.
  A descrição de conteúdo do Hero é gerada por `createWeekendPlanResultDialogMock()` conforme o futuro protocolo de nuvem; o starfield, o ticket,
  a entrada, o efeito opressivo de repouso, a inclinação do ponteiro, a iluminação dinâmica, o flip no clique e o Replay já foram migrados para um recurso
  `weekend-plan-hero.html` independente, carregado via `CloudDialogHero` num iframe sandbox com apenas `allow-scripts`. O recurso recebe apenas tema, idioma, redução de movimento e os dados de entitlement
  desta claims via `postMessage` com ID de instância, e não pode acessar o DOM do Renderer, Node, preload nem Services de negócio. Nesta fase não se pede conteúdo real à nuvem;
  a URL do recurso de mock é gerada pelo bundle do Vite. A integração real com a nuvem, a assinatura de recursos e o contrato de cache estão em
  `docs/cloud-content-dialog.md`.
  O diálogo de falha usa `AlertDialogContent`, Header, Title, Description, Footer e Action padrão,
  exibindo apenas o título de falha, a descrição de falha localizada pelo código de negócio e o botão de confirmação; não deve renderizar ícone de status, botão de fechar, Hero,
  Ticket, starfield, Replay, texto de compartilhamento ou ação de imagem, nem adicionar dimensões especiais, layout centralizado ou forma de botão customizada.
  O Banner é o caso especial visual de marketing; fora do Banner, o diálogo de resgate deve seguir o `DESIGN.md` da raiz: fonte de interface da aplicação
  usa apenas `text-ui-*`, e diálogos, área de status inferior, campos de entrada, botões e menus usam cores semânticas e os componentes de UI existentes, compatíveis com Zai Light / Zai Dark. O fundo do ticket
  deve compartilhar `bg-primary` com a frente: preto tanto no Zai Light quanto branco no Zai Dark; essa regra visual de marketing não pode se espalhar para controles comuns e texto corrido.
  O título do resultado inferior usa `text-ui-xl` e a descrição usa `text-ui-base/relaxed`.
  A descrição de sucesso renderiza, no idioma atual, a semântica "**{showName}** is ready to use.", com `showName` lido do
  entitlement `show_name` desta claim, usando `<b>` real e `font-semibold text-foreground`; não pode ser implementado parseando HTML de tradução nem regredir para o texto fixo `Start Plan`.
  O diálogo de sucesso da Claim lê apenas `plan.entitlements[].effective_at` da resposta desta Claim; se algum entitlement exibido no Ticket ainda
  não estiver em vigor, usa o `effective_at` mais tardio entre eles como horário de início do entitlement completo. Quando esse horário é posterior ao `data.server_time` da mesma
  resposta de Claim, significa que o entitlement foi resgatado mas ainda não começou: a descrição de sucesso passa para a semântica "{showName} will be available on {time}.", com o horário formatado conforme o idioma atual e o
  fuso local. Seja o entitlement imediato ou pendente, o botão principal padrão mostra "模型设置 / Model settings";
  ao clicar, fecha o diálogo e vai até a seção de providers das configurações de modelo, sem gravar configurações de conexão do Start Plan e sem disparar o guia de entrada de modelos.
  O botão secundário mostra "复制分享 / Copy & share" e, ao clicar, copia diretamente o texto de compartilhamento, sem abrir um painel secundário.
  O diálogo não pode ler o balance após o resgate nem inferir o estado de vigência do entitlement pelo `plan.starts_at` da resposta de Claim. Quando o Claim não tem `effective_at` válido, a resposta é de disponibilidade imediata; o refresh de balance após o resgate só atualiza o plano, a cota e o status do Provider no Model Settings e não pode sobrescrever
  ao contrário o resultado de resgate já exibido.
  A descrição de pendência usa `text-foreground-subtle`; nela, o nome do plano e o horário formatado usam
  `font-semibold text-foreground` com ênfase independente; o horário também usa sublinhado tracejado, mas mantém o cursor padrão do mouse,
  sem expressar semântica clicável e sem usar color tokens indefinidos.

  A descrição de sucesso do resgate (tanto para disponibilidade imediata quanto pendente) não pode usar o `Start Plan` fixo: deve ler o
  `show_name` do entitlement resgatado nesta claim. Quando imediato, em chinês mostra "`{showName}` 已可使用" e em inglês
  "`{showName}` is ready to use". Quando pendente, lê-se o `show_name` do entitlement que determina esse tempo de espera; em chinês mostra
  "`{showName}` 将于 `{time}` 生效" e em inglês "`{showName}` will be available on
  `{time}`". O horário completo forma um todo inline inseparável, evitando que data e hora quebrem linha separadamente. Quando há vários entitlements com o mesmo horário de vigência, os nomes são deduplicados e concatenados conforme o idioma.
  `effective_at = 0` continua sendo tratado como imediato, sem exibir a descrição de pendência.
  Depois que a cópia do texto do painel de compartilhamento tem sucesso, o botão de cópia deve trocar momentaneamente no lugar para "✓ 已复制", evitando que o olhar do usuário saia da ação atual;
  a cópia de imagem bem-sucedida usa o Toast global. Em falha de clipboard ou de geração de imagem, mostra-se um Toast de falha, não bastando escrever log e encerrar em silêncio.
  O texto de compartilhamento deve conter a entrada `https://zcode.z.ai` e convidar o destinatário a baixar e instalar o ZCode para resgatar. O link em chinês ocupa sozinho a última linha;
  em inglês o link vem logo após a frase completa. Nenhuma das duas línguas usa dois-pontos para introduzir o link, e o link deve ficar no fim do texto, evitando que plataformas sociais identifiquem erroneamente o texto seguinte como parte da URL.

  No cartão de plano Start Plan das configurações, se o `effective_at` do entitlement do plano for posterior ao momento atual, a linha de status mostra
  "待生效 `{date} HH:mm` · 过期时间 `{date} HH:mm` / Pending `{date} HH:mm` · Expires `{date} HH:mm`"; quando o horário de vigência for no dia ou no dia seguinte da data local do cliente, as datas são simplificadas para "今天 / Today" e "明天 / Tomorrow", por exemplo
  "待生效 明天 22:00 / Pending Tomorrow 22:00"; datas mais distantes continuam mostrando mês e dia. Os dois itens usam metadados comuns,
  sem renderizar o horário de vigência como badge; o texto do horário de vigência usa a cor semântica de sucesso, e o ponto separador e o horário de expiração
  mantêm a cor de texto secundária. Quando o horário agendado chega mas o balance ainda não retornou o bucket de cota correspondente ao `plan_id`, a linha de status muda para um
  botão outline compacto "刷新权益 / Refresh access" e o horário de expiração; o botão usa contorno de cor de sucesso, fundo semitransparente de cor de sucesso e texto de cor de sucesso,
  usando antes do texto um ícone de refresh no estilo outline que troca no lugar por um ícone de loading rotativo durante o refresh e desabilita o botão. O botão reutiliza
  a cadeia existente de refresh de provider, entitlement e cota do Model Settings. Depois de obter com sucesso o bucket de cota desse plano, o botão desaparece
  e resta apenas o horário de expiração.
  Entitlements imediatos com `effective_at = 0` ou sem horário agendado não podem exibir esse botão. A área de saldo continua sendo exibida só depois que o balance retorna
  o bucket de cota correspondente ao `plan_id`.

  `effective_at = 0` é o valor sentinela do servidor para "imediato" e não pode ser interpretado como Unix Epoch nem tratado como campo ausente.
  O botão entra direto no estado disponível e a interface não mostra horário de 1970.
  A área de resultado inferior usa `bg-popover` com padding unificado `p-6`; o campo de entrada somente leitura da segunda linha e o botão outline "获取图片"
  usam `bg-background` separadamente, e o campo de entrada mantém esse fundo ao receber foco.
  A área visual do Ticket mostra apenas `plan.ends_at`, exibido centralizado em uma linha como "有效期至 / Valid until + horário" conforme o idioma atual e o fuso local, com
  layout de linha única e o horário deemphasizado por peso de fonte e tamanho maiores; quando o campo está ausente, mostra-se um placeholder e não se usa o tempo do preview
  para inferir o prazo real do entitlement. A descrição de pendência usa apenas o `effective_at` do entitlement retornado na mesma Claim,
  sem usar balance nem `plan.starts_at`, e a área de tempo do Ticket não repete o horário de início.
  Quando o ponteiro do desktop se move dentro do ticket, o cartão produz um leve pressed 3D, brilho dinâmico e sombra de contorno conforme a posição do ponteiro em relação ao centro; ao pressionar, afunda ainda mais e, após o clique, completa uma rotação horizontal de 360° em torno do eixo Y, mostrando durante a passagem pelo verso um texto sem espelhamento e um fundo temático da mesma cor da frente, retornando à frente ao final. Esse feedback não altera o comportamento de resgate e é desativado em `prefers-reduced-motion`.
  Quando não há ponteiro sobre o ticket, ele simula um ponteiro invisível percorrendo em ciclo os quatro cantos superior esquerdo, superior direito, inferior direito e inferior esquerdo, movendo-se suavemente entre os cantos, com ponto de pressão, brilho, inclinação e sombra sincronizados;
  quando um ponteiro real entra, o movimento automático para imediatamente e passa a seguir o ponteiro, e ao sair volta ao contorno dos quatro cantos.
  A direção do flip no clique precisa seguir a posição pressionada: clicar na metade esquerda do ticket rotaciona `-360°` em torno do eixo Y para a esquerda, e clicar na metade direita
  rotaciona `+360°` para a direita, usando o centro geométrico do cartão como divisor.
  O Ticket usa `cursor-default`; os feedbacks de pressão e flip não usam o cursor de mão de link.
  Quando o diálogo aparece pela primeira vez, o ticket se aproxima vindo de uma frente pequena e distante e gira 180° em torno do eixo Y,
  parando na frente próxima; a animação de entrada é executada apenas uma vez e não substitui o flip de 360° posterior no clique. O Hero oferece no canto superior esquerdo um botão de ícone circular
  Replay, usado para reiniciar e repetir todo o Hero: a galáxia e os rastros estelares recomeçam, o ticket entra novamente vindo de um verso distante com cor temática e o
  cronômetro de pressão dos quatro cantos zera; o controle Replay não entra na imagem de compartilhamento exportada.
  O botão Replay reutiliza a especificação `Button` do botão de fechar do Dialog: `ghost + icon-sm`, `top-4`, circular e com
  o comportamento no-drag idêntico, mudando apenas a posição do canto superior direito para o superior esquerdo. Ambos flutuam sobre um Hero Galaxy escuro fixo e são uma exceção local de cor semântica temática: independentemente do tema claro/escuro do sistema, usam sempre ícone branco semitransparente, fundo de hover branco suave e anel de foco branco,
  sem perder contraste ao alternar com `foreground`.
  Na entrada, o ticket começa em uma frente pequena na profundidade, aproxima-se e dá duas voltas completas em torno do eixo X,
  assentando na frente em cerca de `0.9s`; a rotação usa a curva `ease-in-out`, mais lenta no início e no assentamento e acelerando no meio. Todas as fases de verso mostram apenas um fundo temático independente, opaco e igual ao `bg-primary` da frente;
  o flip manual após o clique continua girando lateralmente em torno do eixo Y.
  A linha tracejada central do Ticket usa `h-px` (1px), mantendo o estilo de segmentos longos.
  O fundo temático deve permanecer opaco também na fase de distância; a sensação de profundidade vem só da profundidade de campo, escala e rotação, e não de baixar a
  opacidade do ticket inteiro para deixar o fundo do Hero aparecer.
  Frente e verso devem usar camadas de composição independentes e ser deslocadas ao longo do eixo Z por uma distância muito pequena, evitando que camadas coplanares se atravessem durante a rotação ou
  façam z-fighting, o que poderia misturar a cor do fundo temático na frente ou no Hero. O eixo de pré-rotação do fundo deve usar o eixo X de forma consistente com a animação de entrada e definir explicitamente o `--color-primary` opaco e o `backface-visibility`; não pode reutilizar o fundo do eixo Y durante o flip vertical.
  Para contornar o Chromium ignorar ocasionalmente o ocultamento do verso sob máscara e composição 3D aninhada, frente e verso da entrada também devem limitar explicitamente a visibilidade por intervalo de rotação: nos intervalos `180°`–`540°` só o fundo temático é visível, e nos intervalos `360°`–`720°` só a frente é visível; a troca ocorre com o cartão de lado para a câmera. Após a entrada, o gating termina e o 3D de dois lados normal é restaurado.
  Durante o gating de entrada, o fundo temático deve temporariamente permitir a desenho dos dois lados, evitando que o Chromium oculte de novo o fundo já selecionado pelo
  recorte de verso; essa sobrescrita existe apenas dentro da animação de entrada e depois se restaura `backface-visibility: hidden`.
  Na implementação, usa-se uma máscara de cor temática de dois lados que serve apenas à entrada: visível no intervalo do verso, oculta no intervalo da frente; o verso 3D comum fica totalmente oculto durante a entrada e só é restaurado depois
  da animação para o flip por clique, evitando que as duas responsabilidades se interfiram.
  O flip precisa usar uma curva de velocidade contínua e de segmento único, evitando pausas em quadros-chave intermediários. A pressão automática dos quatro cantos só deve começar após a entrada terminar,
  evitando que dois conjuntos de transformações 3D e cálculos de sombra rodem juntos na primeira tela e causem travamento.
  O fundo do Hero usa uma galáxia de espaço profundo com núcleo brilhante, disco de nebulosa elíptico e braços espirais, sobrepostos por pontos estelares radiais de baixa densidade no centro e trilhos de luz curtos em ciclos; a camada de animação não recebe eventos de ponteiro, não
  pode encobrir o conteúdo do ticket e é ocultada quando há redução de movimento.
  A área de resultado inferior mantém as cores semânticas temáticas originais e ajusta apenas o layout do conteúdo: título e descrição com composição centralizada, sem ícone de sucesso adicional. O título de sucesso
  usa a construção "You now have access to {plan}", e em chinês usa o mais conciso "{plan} 领取成功", onde `{plan}`
  vem do nome real do plano exibido no resultado desta claim, sem adicionar aspas editoriais. A descrição de sucesso mantém apenas modelo e estado: quando imediato, "{showName}
  已可使用"; quando pendente, "{showName} 将于 {time} 生效"; em inglês, respectivamente, "{showName} is ready
  to use" e "{showName} will be available on {time}". O horário pendente continua destacado com sublinhado tracejado, mantendo
  data e hora como um todo sem quebra de linha. A descrição não pode conter link para as configurações de modelo. A área de ação usa botões primário e secundário lado a lado
  `h-10 min-w-32 rounded-full`: o botão principal "模型设置 / Model settings" cuida da navegação, e o
  botão secundário "复制分享 / Copy & share" copia diretamente o texto de compartilhamento para Twitter/X; após a cópia bem-sucedida, mostra momentaneamente no lugar "内容已复制 / Text copied", sem expandir um painel adicional.
  O tweet é localizado no idioma atual e contém apenas o entitlement do modelo, `#ZCode` e `@zcode_ai`, sem repetir o nome do plano, a cota total ou o
  período de início/fim, evitando texto social longo demais. Exemplo em chinês: `我在 ZCode 领取了 {权益明细}。#ZCode @zcode_ai`.
  Entre o botão principal e o de copiar compartilhamento usa-se `gap-2`. O título e a descrição de sucesso do resgate formam uma
  área de estado centralizada, usando `gap-3` internamente; o contêiner externo entre a área de estado e a área de ação usa `gap-6`.
  O texto de falha é localizado pelo código de negócio; erros desconhecidos e de rede usam o texto de falha genérico, sem expor ao usuário erros internos do servidor.
  `1005` indica que a cota de resgate do dia acabou: a resposta de falha do claim precisa preservar `data.plan.ends_at`, avaliado no fuso local do usuário; quando a campanha termina no mesmo dia, mostra "今日领取名额已用完，欢迎下次再来"; quando termina amanhã ou depois, mostra "今日领取名额已用完，请明天再来"; quando o campo está ausente ou inválido, mostra apenas "今日领取名额已用完".
  `1001`, `1002`, `1003`, `1004`, `3001`, `3007` e a invalidação de login continuam usando seus respectivos textos estáveis, e só códigos desconhecidos
  caem no texto de falha genérico. O botão de confirmação do estado de falha usa "知道了 / Got it"; o `AlertDialog` padrão não ganha ícone de status
  nem botão de fechar. O estado de falha não inicia quadros de animação do Ticket nem constrói ou executa o fluxo de compartilhamento.

- Após um resgate bem-sucedido, o diálogo de sucesso aparece imediatamente e, durante a exibição do diálogo, a releitura de preview, o refresh do billing
  balance e do Account Source / provider/model acontecem em paralelo, sem esperar o usuário fechar o diálogo para começar.
  O sucesso da Claim é um fato de negócio irreversível; todos os refreshes pós-resgate acima são best-effort. A falha de qualquer refresh só pode gerar log de degradação,
  sem reescrever o resultado de sucesso como falha de resgate e sem impedir o usuário de fechar ou abrir as configurações de modelo.
  Quando o refresh de preview tem sucesso, ele atualiza o Banner de forma independente; mesmo que o refresh de entitlement ou de provider falhe, esse resultado não pode ser descartado.
  Enquanto o entitlement ainda não voltou, o diálogo de sucesso já precisa estar visível, mas a ação principal fica temporariamente desabilitada; após o snapshot ser concluído ou falhar, o estado de pendência é atualizado no lugar e "查看套餐 / View plan" é habilitado. O fechamento no canto superior direito do diálogo de sucesso fecha apenas o diálogo.
  Em 2026-09-06, restaurado conforme o comportamento padrão do staging fixo: não habilitar o interruptor histórico "Start using", o fluxo de resgate não grava
  `providerFamilyConnectionSelections` e não despacha comandos de seleção automática de modelo no Composer. O refresh de Provider/entitlement é feito pelo
  ProviderSettingsService e UsageEntitlementService atuais, sem restaurar o Provider Store antigo.
  O estado de falha reutiliza diretamente o template padrão `AlertDialog`: usa Content, Header, Title, Description,
  Footer e Action padrão, sem ícone de status, ícone de fechar, dimensões especiais, layout centralizado ou forma de botão customizada.
- O guia histórico de seleção automática de modelo e seu consumer dedicado foram aposentados; um resgate bem-sucedido não despacha requisição de troca de modelo.
- O canto superior direito do Banner tem um botão de fechar; fechar apenas oculta o Banner no ciclo de renderização atual, sem disparar claim,
  sem modificar o preview do servidor e sem persistir como fechamento permanente. O Banner inteiro é a área de disparo do resgate e suporta clique de mouse
  e Enter/Space do teclado; o subtítulo de modelo e a cápsula de estado de resgate à direita ficam na mesma linha;
  o espaçamento entre os dois usa `gap-1.5`;
  a cápsula de estado de resgate é responsável apenas pela decoração e exibição de loading, não é um botão independente; visualmente usa os estilos padrão `outline` e
  `xs` da biblioteca de componentes, mantendo o formato de pill com `rounded-full`,
  o texto do botão usa `text-xs`, a borda usa `border-foreground` variando com o tema,
  e é alinhada à direita da área de conteúdo do Banner; somente a linha de título superior
  reserva espaço para o botão de fechar no canto superior direito. Durante o resgate, o texto da cápsula é substituído por um ícone de loading rotativo `size-3`,
  e o Banner proíbe resgatar de novo; o ícone de fechar no canto superior direito permanece igual, mas desabilitado temporariamente.

O topo do Banner é organizado como `ZCode 图标与 wordmark SVG [gap-1.5] plan.name`, sem ponto separador;
para evitar repetição da marca, um `ZCode` isolado (ignorando maiúsculas/minúsculas) é removido de `plan.name` antes da exibição
e espaços extras são limpos. O nome da campanha usa a cor de primeiro plano comum em vez de azul e é truncado dentro da largura restante. O `plan.name` original do servidor também é usado como
nome do plano no Ticket do resultado de resgate. A altura mínima do Banner é `96px`, usa `gap-1.5` internamente e o conteúdo é
verticalmente centralizado como um todo no contêiner; quando o conteúdo cresce, ele pode se expandir naturalmente. O título principal usa o maior `grant_units` entre todas as entitlements
`model_usage`, adiciona separadores de milhar conforme o locale atual e mostra a contagem completa de
Tokens, sem converter para `Million` ou "亿"; `Tokens` aparece como unidade em tamanho de fonte menor logo após a cota,
por exemplo `300,000,000 Tokens`. O subtítulo do Banner mostra apenas os nomes de modelo `show_name`, usando `·` para separar múltiplos modelos, sem mostrar informações de período de cota como `daily`, `one_time`,
Daily, One-time ou bonus, e sem ícone de raio. Quando o tamanho de fonte da interface aumenta,
os nomes de modelo são truncados na largura restante. O Banner usa hierarquia de tamanho de fonte fixa `10px / 18px / 12px`, sem seguir o escala global de fonte da UI.

O Ticket exibe as entitlements linha a linha conforme cada `model_usage`, sem mais juntar em uma frase modelos de períodos diferentes:
cada linha é composta por ícone de presente, `show_name`, o `period` desse item e `grant_units`; `daily` exibe "每日" e
`one_time` não exibe período adicional.

O Banner deve suportar ao mesmo tempo Zai Light e Zai Dark: o contêiner claro usa `bg-neutral-50`, `border-card-border` e
`shadow-md/5`, e o texto principal junto com o
wordmark do ZCode usa `text-foreground`, enquanto o texto auxiliar usa `text-foreground-subtle`. O tema escuro, via `.dark`,
restaura o fundo preto `neutral-950` original do Banner de campanha, a borda branca suave, a sombra interna de brilho e o texto cinza neutro; o botão de fechar e a
cápsula de estado de resgate também mantêm respectivamente a cor semântica clara e o visual escuro original. Não se pode substituir a textura escura do Banner de campanha pelo
`bg-card` escuro comum.

## Contrato de testes e cobertura

As dimensões de estado, decisões de poda, candidatos de Desktop E2E e a métrica de cobertura de branches do resgate manual da experiência estão registrados de forma unificada em
[`docs/testing/start-plan-manual-claim-e2e-coverage.md`](testing/start-plan-manual-claim-e2e-coverage.md).
A cobertura desta feature precisa usar o commit conjunto `ebae2814f5`, anterior à primeira integração, como baseline de diff; como os commits da feature já entraram em
`staging`, é proibido alegar cobertura concluída usando o diff vazio do `origin/staging` atual. A aceitação exige que as linhas executáveis do código-fonte de produção novo atinjam mais de 95% na
cobertura de linhas padrão do Istanbul em unit/component tests focados; a cobertura de Desktop E2E conta separadamente como evidência de cadeia entre processos, e é proibido combinar statement ids de instrumentações diferentes para inflar a cobertura.