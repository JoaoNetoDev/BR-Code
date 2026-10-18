# Especificação de integração do cliente para o reset de cota de cinco horas/semanal do Coding Plan

## Contexto e conclusão

O cliente já possui a UI de 「oportunidades de reset, reset manual e aviso de conclusão de reset automático/operacional」. Esta entrega conecta a interface de reset mais recente do ZCode Server, para que tanto o Personal Coding Plan quanto o Team Plan tenham o estado do servidor como fonte autoritativa.

Documento do backend: `coding_plan_reset_mechanism_design.md` (versão de 2026-08-11).

A semântica de produto já está confirmada: **a oportunidade de reset é julgada e concedida pelo servidor, e o cliente não faz julgamento local de elegibilidade**. O contrato de backend mais recente exige que o cliente chame `/opportunity` para disparar um julgamento de elegibilidade no servidor; essa chamada não é a interação de 「solicitar uma oportunidade」 pelo usuário. O cliente chama nesta entrega:

- `GET /api/v1/coding-plan/reset/status`
- `POST /api/v1/coding-plan/reset/opportunity`
- `POST /api/v1/coding-plan/reset/use`
- `POST /api/v1/coding-plan/reset/history/read`

`GET /status` apenas lê oportunidades já concedidas e não cria oportunidades. O cliente chama `POST /opportunity` quando o status não tem oportunidade válida (FIVE_HOUR ou WEEK) nem um histórico concluído recém-descoberto; `/opportunity` é uma requisição em nível de scope e uma única chamada cobre tanto as oportunidades de cinco horas quanto as semanais. O backend decide se concede com base no uso, na janela de tempo e no número de vezes do dia. O cliente não exibe um botão 「solicitar oportunidade」 e também não julga nem concede oportunidades por conta própria com base em thresholds locais de cota.

## Escopo

- Só entram no julgamento de oportunidades os scopes Personal Coding Plan ou Team Plan; a entrada de reset só é exibida quando o `status` do servidor devolve uma oportunidade válida.
- As cotas de cinco horas e semanal suportam de forma independente o reset manual e o aviso de conclusão de reset automático/operacional; os badges de oportunidade são fundidos em um só, com a contagem das duas somando e a contagem regressiva tomando a faixa que expira primeiro. Os botões 「重置」 ao lado dos títulos de cota em 「Configurações → Estatísticas de uso」, no cartão de status do Provider do modelo e no painel de uso de contexto da caixa de entrada apenas abrem o diálogo unificado de reset; eles não liquidam diretamente e não filtram pelo tipo de clique; oo real `/use` só é disparado pelo botão 「重置」 do tipo correspondente dentro do diálogo. O reset manual da cota semanal envia `reset_type: "WEEK"` e, ao concluir, reescreve otimisticamente o próximo horário de reset para 7 dias depois.
- Personal e Team usam isolamento de estado pelo source scope completo; a Team key precisa conter organization + project, e não apenas o provider id.
- Durante o reset manual, mostra-se processing; após o sucesso, status e entitlement/quota reais são atualizados.
- O reset automático/operacional é exibido como completed quando a detecção por polling percebe mudança em `latest_five_hour_reset_history.used_at` ou `latest_week_reset_history.used_at`. O backend não tem campo de processing, e o julgamento de negócio e a correção de cota dependem somente do `used_at` do servidor; o gatilho do Composer apenas sintetiza por cerca de 1 segundo uma sensação visual de 「正在重置」 antes de mudar para 「已重置」, e essa fase sintetizada é puramente visual no front-end e não reescreve nenhum estado do servidor.
- O horário de conclusão usa o `used_at` em milissegundos Unix do servidor e não usa `Date.now()` do cliente como critério de conclusão.
- `observed_at` indica apenas o instante em que o cliente observou o `used_at` atual pela primeira vez, e serve para garantir que, após a detecção por polling de 5 minutos de um reset automático/operacional, a notificação curta ainda seja reproduzida por completo; a exibição em hover/focus e o julgamento de negócio continuam usando apenas o `used_at` do servidor.
- Quando `has_unread_history=true` e o aviso de conclusão já foi escrito no estado do cliente, o history read é reportado.
- Suporta desktop, Web, celular `/remote`, tema claro/escuro, chinês/inglês e reduced motion.

Fora desta entrega:

- Julgamento local do cliente sobre elegibilidade a reset ou thresholds de cota.
- Processing/SSE/WebSocket no servidor; o backend não forneceu esses contratos.
- Escrever o estado de reset no relay, no desktop main, no Agent runtime ou no fluxo realtime de session/task.

## Limites de serviço e processo

```text
Desktop renderer / Web remote renderer
              |
              | chamada por hook; não lê credential e não faz fetch direto
              v
       IUsageStatsService (Host RPC existente)
              |
              | lê o JWT do zcode + a credential atual do Coding Plan
              | constrói os headers de scope Personal/Team
              v
       ZCode Server /api/v1/coding-plan/reset
              |
              | status / opportunity / use / history-read
              v
       Zustand reset state local à window
         |             |             |
         v             v             v
   Composer       Config Provider      Página de Uso
```

- O Desktop em janela local continua usando o Local Host com escopo de window.
- O celular `/remote` continua usando o host service já existente no desktop via shared-host attachment, sem criar um Agent, local host ou runtime remoto independente.
- Esta funcionalidade não modifica o stream de task/session, snapshot, queue nem owner/lease; portanto não altera os limites de `continuous` no desktop e `replayable` no Web remoto.
- A UI acessa `IUsageStatsService` apenas por hook; a camada de Service não referencia implementações concretas de Runtime.

## Contrato de API

### Requisição de scope

```ts
interface CodingPlanResetScopeRequest {
  preferredProviderId: string;
  organizationId?: string | null;
  projectId?: string | null;
}
```

O Service constrói o seguinte a partir do scope:

```text
Authorization: Bearer <zcode_jwt>
X-Bigmodel-Authorization: <current_provider_business_jwt>
Bigmodel-Target-Type: PERSONAL | TEAM
Bigmodel-Organization: <TEAM only>
Bigmodel-Project: <TEAM only>
```

Restrições:

- O JWT é lido de `zcodejwttoken` no credential service.
- `X-Bigmodel-Authorization` envia o JWT de negócio correspondente à família de provider do Coding Plan atual, direto e sem `Bearer`, e **não é a API key do Coding Plan**: a família Z.ai usa `oauth:zai:access_token` do credential service e a família BigModel usa `oauth:bigmodel:access_token`. É proibido o fallback mútuo entre os dois tipos de credencial, para evitar que a identidade do provider atual seja misturada com a identidade validada pelo servidor (correção de autenticação do reset Z.ai em 2026-08-14).
- A resolução do provider de Coding Plan é usada para confirmar que o plano está configurado, escolher o JWT de negócio consistente com a família do provider e derivar o scope Personal/Team; o scope Team é carregado inteiramente pelos headers `Bigmodel-Organization` / `Bigmodel-Project`, e o cliente não replica mais a API key do projeto de equipe nas requisições de reset.
- Valores de credential não podem ir para log, nem entrar no store da UI, nem ser persistidos.
- A URL usa `buildRuntimeZCodeApiUrl(env, path)`, que acompanha a configuração de endpoint test/production/custom.

### Mapeamento de status

```ts
interface CodingPlanResetStatusSnapshot {
  availableFiveHourResets: Array<{ expireAt: number }>;
  availableWeekResets: Array<{ expireAt: number }>;
  latestFiveHourResetHistory: { usedAt: number } | null;
  latestWeekResetHistory: { usedAt: number } | null;
  hasUnreadHistory: boolean;
}
```

A camada de serviço precisa validar em runtime o envelope e os campos e não pode confiar no JSON remoto; o cliente não pode fazer branch por `msg`.

### Julgamento de opportunity e idempotência

```ts
interface CodingPlanResetOpportunityRequest extends CodingPlanResetScopeRequest {
  idempotencyKey: string;
}

interface CodingPlanResetOpportunityResult {
  granted: boolean;
  nextTryAt: number | null;
}
```

O corpo da requisição é fixo:

```json
{
  "idempotency_key": "<uuid>"
}
```

- Cada novo julgamento de elegibilidade no servidor gera um novo UUID, com no máximo 64 caracteres.
- Chamadas simultâneas para o mesmo service + scope são combinadas pelo cliente em single-flight, e uma mesma requisição de rede usa apenas uma chave de idempotência.
- Depois de `granted=true`, `nextTryAt=null` e `/status` é atualizado imediatamente à força, tomando como autoridade o conteúdo de opportunity devolvido pelo servidor; o Coordinator só faz o próximo julgamento de elegibilidade ao menos 10 minutos depois.
- O código de negócio `3301` precisa retornar `granted=false` e o timestamp Unix em milissegundos `next_try_at`; o Service mapeia para `nextTryAt` e o Coordinator guarda esse horário do servidor, consultando apenas status enquanto ele não vence.
- Quando o servidor não devolve um `nextTryAt` válido, usa-se o fallback de 10 minutos; um horário já passado é adiado ao menos 5 minutos, evitando julgamentos repetidos em pouco tempo. Uma oportunidade existente de algum tipo não bloqueia permanentemente o julgamento em nível de scope, e após o vencimento o servidor ainda pode avaliar o outro tipo.
- `granted=false` / `3301` mantêm a entrada oculta e não exibem toast de erro; `code=2007`, interrupção de rede e timeout e outros erros transitórios usam nova tentativa fixa em 5 minutos, reutilizando a chave de idempotência da requisição que falhou.
- O backend pode retornar HTTP 429 cru (sem envelope 3301 e sem `next_try_at`) quando a requisição é rápida demais ou há competição por lock de cartão. O Service mapeia isso para o erro estável `coding_plan_reset_opportunity_throttled`; o Coordinator aplica um cooldown fixo de 10 minutos e só então gera uma nova chave para julgar. Erros estáveis como autenticação, recusa de negócio e parsing de protocolo também esperam 10 minutos e geram uma nova chave, evitando polling vazio de alta frequência e spam de warn em produção quando faltam credenciais.
- O cliente não pode pular nem forjar a concessão com base em thresholds como 「uso atual de cinco horas abaixo de 80%」; o backend é a única fonte do julgamento de elegibilidade.

### Idempotência de use

```text
novo clique do usuário -> gera novo UUID (<= 64 caracteres)
falha na mesma requisição -> mantém o UUID
usuário clica em tentar de novo -> reutiliza o UUID original
sucesso com used=true -> limpa o UUID
```

O corpo da requisição é fixo:

```json
{
  "idempotency_key": "<uuid>",
  "reset_type": "FIVE_HOUR"
}
```

## Modelo de estado

```text
                status: sem oportunidade, sem histórico novo           opportunity: granted=true
HIDDEN / IDLE ------------------------------> CHECKING ------------------------+
     |                                                                         |
     | status: há opportunity FIVE_HOUR válida                                 |
     +------------------------------------------------------------------> AVAILABLE
     ^                                                            |
     | opportunity: false / 3301 + next_try_at                    | o botão da página abre o diálogo; clique em reset dentro do diálogo
     | (durante o cooldown apenas consulta status, sem novo POST opportunity)  v
     |                                                      LOCAL_PROCESSING
     |                                                            |
     |                                     falha no use (mantém a key)  | use com used=true
     |                                      +---------------------+
     |                                      |                     v
     |                                      +--------------- REFRESH_STATUS
     |                                                            |
     |                             o latest used_at do status muda  v
     +-------------------------------------------------------- COMPLETED
                                                                  |
                                                                  | após exibir o aviso de conclusão
                                                                  v
                                                          history/read
```

COMPLETED é ortogonal ao saldo de oportunidades (a mesma snapshot de status fornece as duas informações ao mesmo tempo):

```text
dimensão de conclusão  used_at / observed_at / quota_override_pending / next_reset_at
          └─ aviso de "已重置", cobertura otimista de 100%, fallback de horário de reset
dimensão de oportunidade  opportunity_count / opportunity_expires_at（oportunidades válidas restantes na mesma snapshot）
          └─ número no badge, 「重置」 ao lado do título de cota, pílulas de contagem e contagem regressiva na linha do diálogo, liberação de reset()

COMPLETED(restam 0) ── 「已重置」 ao lado do título; a linha do diálogo recolhe após o feedback de sucesso
COMPLETED(restam N) ── 「重置」 ao lado do título; a linha do diálogo permanece e mostra N e a contagem regressiva da próxima
      │
      └─ novo clique em reset dentro do diálogo ─> LOCAL_PROCESSING ─> /use ─> novo used_at no status ─> COMPLETED(restam N-1)
         （sem precisar esperar o próximo polling ceder o lugar a AVAILABLE, e sem reabrir o diálogo）
```

Regras:

- AVAILABLE vem de `available_five_hour_resets` / `available_week_resets` não expirados do servidor, tomando o `expire_at` válido mais próximo de cada um como contagem regressiva; as cotas de cinco horas e semanal não se afetam.
- `has_unread_history` é um único cursor compartilhado entre cinco horas e semana, mas `latest_{five_hour,week}_reset_history` são independentes entre si. Um tipo só 「possui」 a marca de não lida e entra no estado de conclusão quando o seu `used_at` é o mais recente entre os dois: `ownsUnread = has_unread_history && latestUsedAt != null && (otherUsedAt == null || latestUsedAt >= otherUsedAt)`. Assim, quando um reset semanal levanta a marca compartilhada, um histórico de cinco horas expirado não é julgado erroneamente como recém-concluído (e vice-versa).
- O botão ao lado do título de cota da página apenas abre o diálogo unificado de reset; ele não entra em LOCAL_PROCESSING nem chama `/use` diretamente. LOCAL_PROCESSING só é disparado pelo botão 「重置」 do tipo correspondente dentro do diálogo, e o botão do diálogo exibe loading/desabilitado.
- A operação ao lado do título de cota tem o estado definido por 「ainda é possível liquidar」: quando ainda há oportunidade liquidável daquele tipo, exibe o 「重置」 clicável (que abre o diálogo); caso contrário, COMPLETED exibe 「已重置」 com o horário de conclusão do servidor. Na conclusão automática/operacional com oportunidades restantes do mesmo tipo, o painel não tem um ponto de ancoragem 「已重置」, a reposição dos confetes é pulada e o arm é mantido até o estado de conclusão ceder, quando é limpo; o feedback de conclusão fica por conta do Tooltip do gatilho do Composer.
- Após um reset manual sair de LOCAL_PROCESSING para COMPLETED, o botão primeiro exibe um tique de sucesso por 600ms e toca uma vez os fogos de artifício, e só depois muda para 「已重置」; não exibe Tooltip de 「正在重置」 nem de 「已重置」.
- O traço de liquidação manual é compartilhado entre várias entradas de UI por service + scope. Depois que uma entrada clica em reset, as outras entradas que observam o mesmo novo `used_at` também precisam identificar isso como conclusão manual, e não podem disparar o aviso de reset automático/operacional na caixa de entrada.
- O reset automático/operacional não tem sinal de processing do servidor: quando o polling descobre um novo `used_at`, entra direto em COMPLETED. O gatilho do Composer sintetiza com isso um breve 「正在重置」 (cerca de 1 segundo, puramente visual no front-end) e depois muda para 「已重置」, e esse Tooltip 「已重置」 permanece até o usuário passar o mouse no gatilho e expandir o painel de cota, quando é recolhido.
- COMPLETED usa o `used_at` do servidor; o 「正在重置」 sintetizado do reset automático/operacional é contado a partir do `observed_at`, isto é, do instante em que o cliente observou aquele `used_at` pela primeira vez, e o polling repetido da mesma história não pode reproduzir nem renovar isso. Ao expandir o painel de cota com hover, os fogos de artifício são repostos uma vez a partir da posição do item 「已重置」 dentro do painel (a mesma posição do reset manual), deduplicados por `used_at` e tocados apenas uma vez. A ação 「已重置」 e o horário em hover/focus continuam usando o `used_at` do servidor até a correção posterior de status/quota.
- O arm de fogos de artifício do reset automático/operacional só pode ser consumido depois que o DOM 「已重置」 já estiver montado dentro do painel e a função de fogos tiver sido realmente chamada; se, logo após a abertura da camada flutuante, a âncora ainda não estiver pronta, o arm precisa ser preservado e os fogos repostos depois que a âncora for montada, sem marcar como já reproduzido antes da hora.
- O Root Store registra, por source + tipo, o par `(used_at, auth_session_seq)` da **primeira observação** da conclusão automática. O polling posterior do mesmo `used_at` não pode reescrever o registro de observação para a sessão de autenticação atual; depois que a página de Configurações ou a página de Uso escreve o estado de conclusão **na mesma sessão de autenticação**, o Composer montado depois ainda precisa exibir aquele novo reset automático; só quando o usuário sai do estado autenticado e entra de novo, `auth_session_seq` mudou e o `used_at` continua o mesmo, é que `observed_at` é esvaziado, evitando a repetição de Tooltip/confetes antigos após logout e novo login. Atualizar informações do usuário ou conectar providers adicionais enquanto autenticado não avança esse número; uma escrita assíncrona de status vinda da sessão de autenticação anterior que ainda não concluiu precisa ser rejeitada atomicamente pelo Store.
- O aviso de conclusão automática **é tocado apenas uma vez entre várias janelas da mesma aplicação desktop** (correção de bug: a limpeza do cursor `has_unread_history` tem um atraso de segundos, e o polling independente de várias janelas tocaria em duplicidade). Uma escrita de status significa apenas 「uma conclusão foi observada」, e entradas não Composer como a página de Configurações e a página de Uso não podem ocupar a_eligibilidade de exibição com base nisso. Antes de exibir o Tooltip/confetes, o Composer precisa solicitar ao BroadcastHub uma reservation temporária com token usando `(sourceKey, reset_type, used_at)`; somente quando o componente confirma que ainda está montado, que o source/candidate ainda casa e que vai exibir, a reservation é commitada como claim permanente, gravando played, entrando no Tooltip sintetizado de processing/completed, armando os fogos e transmitindo played. Se durante a espera pela reservation o componente desmontar, trocar de source ou o o candidateinvalidado, o winner precisa usar release com o token; o Main também precisa recolher ocupações não commitadas no logout do host ou quando o TTL da reservation vence. Um claim busy significa apenas que outra janela está se preparando para exibir, e o loser não pode com isso gravar played nem esvaziar `observed_at`; ele só pode esperar a transmissão real de played, ou tentar de novo depois que a reservation temporária for liberada/expirar. O BroadcastHub guarda apenas reservations/claims opacos e limitados, e não hospeda estado de negócio do Coding Plan; em ambientes Web/sem parentPort, a reservation em processo do broadcast service oferece a mesma semântica. A transmissão de played serve para que outras janelas recolham avisos já observados mas ainda não tocados, e essa combinação precisa ser monotônica por `used_at`, com transmissões antigas chegando tarde sem sobrescrever o registro mais recente.
- Quando a oportunidade expira, a entrada é ocultada imediatamente e a próxima rodada de status corrige.
- Enquanto aquele tipo tiver uma oportunidade válida não expirada, as três entradas (badge de oportunidade, botão 「重置」 ao lado do título de cota e linha de reset do diálogo) precisam ser exibidas, mostrando o restante; 100% de cota restante não é mais condição para ocultar. Correção de bug: a liquidação reescreve otimisticamente a cota restante correspondente para 100% (ver abaixo); se a entrada fosse ocultada por 「com 100% restante o reset não traz benefício」, o usuário que acabou de usar uma delas deixaria de ver as oportunidades restantes e acharia que o cartão foi engolido. A oportunidade é um ativo do usuário e, com a cota cheia, se vale a pena liquidar é decisão do usuário; o botão 「重置」 permanece clicável. A entrada só desaparece quando as oportunidades acabam ou todas expiram.
- COMPLETED é mantido dentro do mesmo ciclo de `used_at` (o polling repetido não limpa o estado de conclusão); mas, quando o backend entrega de novo uma oportunidade válida dentro do mesmo ciclo, o estado de conclusão cede o lugar a AVAILABLE (considerado início de um novo ciclo), senão as novas oportunidades ficariam permanentemente encobertas pelo estado de conclusão. Uma conclusão não lida recém-descoberta ainda tem prioridade sobre as novas oportunidades por uma rodada, e a reconciliação de processing do `/use` manual não é afetada.
- COMPLETED também carrega as oportunidades válidas restantes na mesma snapshot de status (contagem e `expire_at` mais próximo). Há um único julgamento para 「ainda é possível liquidar」: não ser LOCAL_PROCESSING, contagem > 0 e o vencimento mais próximo ser posterior ao momento atual; AVAILABLE e COMPLETED usam isso para decidir o número no badge, o 「重置」 ao lado do título, a linha do diálogo e se `reset()` libera. As oportunidades restantes no estado de conclusão podem ser liquidadas de novo diretamente (COMPLETED → LOCAL_PROCESSING, gerando uma nova chave de idempotência), e a reconciliação obrigatória contra dupla liquidação entre entradas continua sendo executada. Correção de bug: a implementação antiga zerava a contagem/expiração ao entrar em COMPLETED, e os cartões restantes só voltavam no status seguinte (polling de até 5 minutos, ou correção imediata disparada ao reabrir o diálogo ou remontar a entrada); nesse intervalo a linha do diálogo renderizava a expiração vazia como 「0 分 0 秒后过期」 e o novo clique era ignorado silenciosamente por `reset()`, mesmo assim tocando o feedback de sucesso. A reconcilidação local de contagem mantida no diálogo para contornar esse problema é uma segunda fonte de dados e foi removida junto.
- No estado completed, a UI pode sobrescrever otimisticamente a cota restante correspondente para 100%, marcar `quota_override_pending=true` e forçar a atualização do entitlement; quando a atualização real da quota tiver sucesso, a marca é removida, e o polling repetido do mesmo `used_at` não pode reativar a cobertura, com a interface obedecendo à quota do servidor. O próximo horário de reset reescrito otimisticamente é calculado por tipo: para a cota de cinco horas, `used_at + 5h`; para a cota semanal, `used_at + 7d`.

```text
clique manual:  AVAILABLE -> LOCAL_PROCESSING -> SUCCESS(600ms) -> COMPLETED
feedback da UI:   botão de reset   botão loading       tique de sucesso + fogos no botão   "已重置"
Tooltip:         fechado          fechado              fechado                           fechado

automático/operacional: HIDDEN/AVAILABLE ----polling descobre novo used_at----> "正在重置" sintetizado (~1s) -> COMPLETED --hover no gatilho--> recolhe o Tooltip
feedback da UI:                                     spinner sintetizado no gatilho   "已重置" residente no gatilho   fogos repostos no painel na mesma posição do manual
Tooltip:                                           "正在重置"                       "已重置" (residente)              fechado
```

## Polling, compartilhamento e temporização

Dentro do mesmo Renderer, um Coordinator compartilhado é estabelecido por `authSessionSeq + usageStatsService + preferredProviderId + organizationId + projectId`. O gatilho do Composer, o HoverCard do Composer, o cartão de Provider nas Configurações e a página de Uso apenas assinam o estado e não criam timers próprios nem conduzem diretamente as requisições periódicas. Scopes pessoais/de equipe diferentes são polled separadamente; nesta entrega não há leader election no front-end entre janelas diferentes, e a idempotência e o rate limiting do servidor servem de salvaguarda.

```text
Composer Trigger ───┐
Composer HoverCard ─┤
Provider Card ──────┼── subscribe ──> scope Coordinator
Usage Page ─────────┘                     |
                                         | document visible: primeiro imediato + a cada 5min
                                         v
                                  GET /reset/status
                                         |
                          processing / conclusão nova neste ciclo?
                              | yes              | no
                              |                  v
                              |          now >= nextOpportunityAt?
                              |             | no       | yes
                              |             |          v
                              |             |   POST /reset/opportunity
                              |             |          |
                              |             |     granted / next_try_at
                              |             |          |
                              |             |     atualiza o horário de agendamento compartilhado
                              |             |          |
                              |             |   GET status forçado quando granted=true
                              v             v
                             projeção de estado Zustand compartilhada
```

```text
nº de assinantes 0 --primeira entrada monta--> 1: vincula visibility + inicia o único timer de 5min + correção imediata
nº de assinantes N --outras entradas montam--> N+1: apenas assina, sem novo timer e sem ampliar requisições de rede
nº de assinantes 1 --última entrada desmonta--> 0: para o timer + remove visibility; preserva o horário de agendamento do scope
nº de assinantes 0 --entradas remontam--> 1: consulta status imediatamente; não consulta opportunity antes de nextOpportunityAt
```

- Com o document visible, o Coordinator consulta imediatamente na primeira vez e depois a cada 5 minutos o `/status`; quando hidden, as requisições de rede param e, ao voltar a visible, a correção é imediata.
- Para o mesmo service + sessão de autenticação + scope há apenas um owner de polling periódico; `/status` e `/opportunity` ainda combinam cada um suas requisições in-flight, e a reconciliação do reset manual pode furar a frescura do status para forçar a atualização.
- Cada rodada lê o status primeiro. Quando há processing de liquidação manual ou um histórico concluído recém-descoberto neste ciclo, o opportunity é pulado; em outros cenários (inclusive quando algum tipo ainda tem oportunidade) o julgamento em nível de scope continua depois que o agendamento compartilhado vence, evitando que a existência permanente de uma oportunidade semanal cate a oportunidade de cinco horas.
- Quando `granted=false` e o servidor devolve um `nextTryAt` válido, ele é guardado como `nextOpportunityAt` daquele Coordinator; até vencer, apenas o status é consultado e o julgamento de elegibilidade não é disparado de novo. Um horário já passado é adiado ao menos 5 minutos, evitando julgamentos repetidos em pouco tempo pela interface de oportunidades.
- Depois de `granted=true`, a reconciliação é forçada furando a frescura do status, e o opportunity só é verificado de novo ao menos 10 minutos depois.
- Quando o servidor não devolve um `nextTryAt` válido, usa-se o fallback de 10 minutos; o 429 usa um cooldown fixo de 10 minutos.
- Erros de rede/dependência usam nova tentativa fixa em 5 minutos, sem backoff exponencial; a tentativa reutiliza a chave de idempotência de opportunity deste ciclo, que é limpa ao se obter um resultado de negócio explícito, e a próxima rodada de julgamento gera uma nova chave.
- Quando `authSessionSeq` muda, usa-se uma nova chave de Coordinator, e o cooldown, as chaves de idempotência e o polling da sessão de login anterior não podem vazar para a nova sessão de login.
- O Coordinator para o timer quando o número de assinantes vai a zero, mas preserva o estado de agendamento do scope, evitando que reabrir o HoverCard chame opportunity repetidamente de imediato.
- Quando o `/use` manual começa, são registrados o traço em nível de service + scope e o `used_at` anterior ao clique; quando o novo `used_at` chega, o horário de conclusão é vinculado a esse traço, para que Composer, página de Configurações e página de Uso identifiquem em conjunto. Quando um `used_at` diferente aparece depois, o traço antigo é limpo e o caso passa a ser tratado como reset automático/operacional.
- LOCAL_PROCESSING só entra em COMPLETED quando o status devolve um `used_at` **diferente da linha de base anterior ao clique** (isto é, quando o traço acima é vinculado a um novo horário de conclusão). Quando o status ainda lê o `used_at` da linha de base, mantém-se LOCAL_PROCESSING para continuar reconciliando, mesmo com `has_unread_history` ainda true (o history/read do cartão anterior ainda não surtiu efeito); se as 4 reconciliações depois do `/use` não virem um novo `used_at`, entra no caminho de recuperação por falha. Correção de bug: a decisão antiga exigia apenas processing e `used_at` não vazio. Ao liquidar de novo a partir de COMPLETED(restam N), a linha de base é o `used_at` da cartão anterior, de poucos segundos atrás, e com uma pequena defasagem na leitura do servidor a primeira reconciliação já toma o histórico antigo como se fosse a conclusão atual: o diálogo toca o feedback de sucesso antes da confirmação do servidor, a contagem na linha fica presa no snapshot anterior ao consumo, um novo clique é ignorado silenciosamente por não haver traço vinculado e, ainda assim, o feedback de sucesso toca de novo.
- Ao clicar em reset, se já existir um traço de liquidação manual para o mesmo service + scope + tipo (iniciado por outra entrada desta janela), é feita primeiro uma reconciliação forçada: se o `/use` do outro lado ainda estiver em andamento, ou se depois da reconciliação esta entrada não estiver mais available (a cota já foi liquidada), não é disparado um segundo `/use`, evitando liquidação duplicada carregando uma nova chave de idempotência; só é liberado como uma nova liquidação se, após a reconciliação, continuar available (uma nova oportunidade foi concedida). Essa trilha não é compartilhada entre janelas nem com o celular `/remote`, e a concorrência entre janelas é coberta pelo servidor pelo consumo da oportunidade.
- Depois de um sucesso manual, a frescura é furada e o status é atualizado imediatamente.
- Depois de descobrir um novo `used_at`, cada source toca a animação de conclusão apenas uma vez e força a atualização de entitlement/quota.
- Depois de observar `has_unread_history` concluído, o history read é reportado **imediatamente**, sem esperar a atualização forçada de entitlement terminar (correção de bug: a implementação antiga aguardava a atualização de entitlement, que leva segundos, antes de marcar como lido, alongando a limpeza do cursor no servidor e amplificando a janela de exibição duplicada entre janelas; mesmo com a falha da atualização, o reporte de leitura não pode ser bloqueado).

```text
janela A Composer              Main BroadcastHub              janela B Composer
      | status(T)                    |                             | status(T)
      | escreve só a observation     |                             | escreve só a observation
      | acquire(key=T) ------------->|                             |
      |<-- reservation(token=A) -----|<------------- acquire(key=T)
      |                               |------------- busy(retryable) ->|
      | mounted/source/candidate OK   |                             | mantém observed_at
      | este componente entra na fronteira de exibição |             | espera played ou tenta depois
      | commit(token=A) ------------>|                             |
      | grava played(T) + transmite  |                             |
      | exibe o Tooltip / arma fogos |                             |
      |---------------- played(T) ---------------------------------->|
      |                               |                             | grava played / observed_at=null

a janela A é desmontada ou troca de source durante a espera do acquire
      | acquire(key=T) ------------->|
      |<-- reservation(token=A) -----|
      | mounted/source/o candidateinvalidado |
      | release(token=A) ----------->|
      |                               | remove a reservation não commitada
      |                               |<------------- a janela B tenta acquire de novo
      |                               |------------- reservation(token=B) ->|
      |                               |                             | commit + played + exibição

não Composer (página de Configurações / página de Uso)
      status(T) -> escreve só observation / estado de conclusão / atualização de cota, sem chamar acquire
```

```text
a página de Configurações descobre primeiro uma conclusão automática (mesma sessão de login)
    status(new used_at) -> Store(entry + auth_session_seq=N)
    Composer monta depois -> seq ainda é N -> mantém observed_at -> toca normalmente

sair e entrar de novo no login
    setUser(null) -> setUser(user) -> auth_session_seq=N+1
    Composer/status lê o mesmo used_at
        -> o registro do Store ainda é N
        -> silencia o observed_at antigo e avança o registro de observação para N+1
    novo used_at depois -> completedAt diferente -> toca normalmente
```

## Tratamento de erros

| Cenário                                     | Comportamento do cliente                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| 401                                     | Não exibe oportunidades, registra warn e espera a recuperação do estado de login/credential. |
| 400 / code 3001                         | Oculta a entrada do scope com erro e não reescreve o scope automaticamente.    |
| 403 / code 3101                         | Mostra que o reset falhou e espera a correção do vínculo da conta/credential.   |
| 429 / code 3002                         | Volta ao estado re-executável, mantendo a chave de idempotência desta tentativa. |
| 500 / code 2001/2002/2007               | Volta ao estado re-executável, mantendo a chave de idempotência desta tentativa. |
| resposta malformada                      | Tratada como erro de protocolo e não entra em completed.                      |
| falha no status                             | Mantém o último estado já exibido e a correção pelo polling em segundo plano continua. |
| opportunity `granted=false` / code 3301 | Guarda `next_try_at`; antes do vencimento só consulta status, e a primeira rodada visível após o vencimento usa uma nova chave para julgar de novo |
| opportunity `2007` / interrupção de rede / timeout | Mantém o status; nova tentativa fixa em 5 minutos reutilizando a chave de idempotência deste ciclo. |
| opportunity 429                         | Mantém o status; cooldown fixo de 10 minutos com uma nova chave de idempotência. |
| opportunity de autenticação / recusa de negócio / erro de protocolo | Mantém o status; cooldown fixo de 10 minutos com uma nova chave de idempotência, evitando polling vazio de alta frequência em erros estáveis |

Se uma resposta não 2xx ainda carregar o envelope unificado, o cliente precisa extrair `code` primeiro e convertê-lo no identificador de erro estável
`coding_plan_reset_api_error:<code>`, sem depender do texto de `msg`. Assim, quando o ambiente de teste devolve
`HTTP 403 / code=3101`, o log e o julgamento de nova tentativa não ficam só com a string instável `coding plan is required`.

## Registro de integração do ambiente de teste de 2026-08-10

A cadeia de runtime do cliente antigo só chegava à interface de status do reset, e o status em si não concede oportunidades:

```text
renderer
  -> IUsageStatsService RPC
  -> Local Host BigModelUsageQuotaProvider
  -> GET /api/v1/coding-plan/reset/status
  -> code=0, available_five_hour_resets=[]
```

A causa raiz é que o cliente não chamava `POST /opportunity`; o backend nunca recebia a requisição de julgamento de elegibilidade, então `/status` só podia devolver oportunidades vazias. Esta correção completa a chamada de opportunity; o cliente continua proibido de recorrer a uma API key comum, a uma key pessoal ou a fabricating oportunidades localmente.

Logs:

- O ciclo de vida e as falhas do Service usam `createServiceLogger("usage-stats")` e não podem registrar token nem API key.
- Os detalhes de polling de alta frequência da UI usam apenas `debug` de `packages/ui/src/logger.ts`; falhas usam `warn`.

## UI e responsividade

- Reaproveitar os componentes `Button`, `ControlHintTooltip`, os ícones Lucide existentes e os tokens do usage chart.
- Todos os tamanhos de fonte usam `text-ui-*`, sem adicionar cores de tema fixas.
- Durante o processing, o botão é desabilitado e mostra spinner, evitando envio duplicado; o fluxo manual não exibe Tooltip de processing.
- O fogo de artifício no botão só é tocado depois que o use tem sucesso e o status devolveu o histórico do servidor; o tique de sucesso dura 600ms e então aparece 「已重置」, o fluxo manual não exibe Tooltip de completed e a falha da requisição não toca confetes.
- O reset automático/operacional sintetiza no gatilho do Composer cerca de 1 segundo de 「正在重置」 e depois muda para um Tooltip 「已重置」 residente, mantido até o usuário passar o mouse no gatilho; ao expandir o painel de cota com hover, o Tooltip é recolhido e os fogos de artifício são repostos uma vez a partir da posição do item de reset dentro do painel (a mesma do manual).
- O hover/focus de 「已重置」 mostra o horário de conclusão do servidor.
- Quando o total de oportunidades é 1, mantém-se a entrada compacta: exibe 「1 次重置额度」 e a contagem regressiva daquela oportunidade, preservando ao lado da barra de cota a ação de item único 「重置」.
- Quando o Composer exibe automaticamente o lembrete de oportunidades de cota de reset, clicar no gatilho ou no conteúdo do lembrete mantém a exibição; clicar em outra área da página marca a fase atual como lida e fecha. Um clique externo na fase inicial não impede que a mesma oportunidade volte a exibir o lembrete urgente nos últimos três minutos.
- Quando o total de oportunidades é maior que 1, a entrada fundida passa a ser um 「获得 N 次重置额度」 clicável, onde N é o total de oportunidades válidas atuais; a entrada em si não exibe contagem regressiva e, ao clicar, abre o diálogo 「可重置额度」. A página de Uso das Configurações e o HoverCard do Composer precisam manter o respective botão 「重置」 ao lado dos títulos das cotas de cinco horas e semanais, permitindo liquidar o tipo correspondente diretamente, sem obrigar a passar antes pelo diálogo.
- O diálogo de múltiplas oportunidades usa o estado atual do servidor como única fonte de dados: o título mantém apenas o texto 「可重置额度」 e não soma mais as contagens; 「剩余用量」 mostra as cotas atuais de cinco horas, semanal e de ferramentas; 「可重置额度」 lista apenas os tipos `FIVE_HOUR` / `WEEK` que realmente são liquidáveis e trazem benefício após o reset, chamando o `reset()` já existente em cada um.
- Cada item de reset do diálogo mostra a contagem regressiva de expiração independente da oportunidade mais próxima daquele tipo; quando o mesmo tipo tem várias oportunidades, exibe ao lado do nome do tipo uma pílula de contagem 「N 次」 (na cor de confirmação igual à do badge) e marca o texto da contagem como 「最快 …」 para evitar que se leia como um prazo uniforme; com uma única oportunidade não há pílula e o texto original da contagem é mantido. A liquidação manual continua tendo como base de sucesso um novo `used_at` retornado pelo status depois do `/use` e diferente da linha de base anterior ao clique, e depois do sucesso os foges de artifício são tocados uma vez a partir do botão clicado, sem disparar o Tooltip de reset automático/operacional; ao fim do feedback de sucesso (600ms), a permanência da linha é decidida pela projeção mais recente do servidor: se ainda houver oportunidades liquidáveis do mesmo tipo, a linha é mantida e mostra diretamente o restante e a contagem regressiva da próxima, com 「重置」 clicável de novo, sem precisar fechar ou reabrir o diálogo; a linha só recolhe quando as oportunidades acabam, e durante a animação de recolher a linha da contagem fica vazia, sem renderizar a expiração vazia como 「0 分 0 秒」. O diálogo não mantém reconciliação local de contagem.
- Ao abrir o diálogo, o HoverCard do Composer permanece montado; o HoverCard só é recolhido depois de o diálogo ser fechado, evitando que o Dialog Portal feche instantaneamente por causa do desmonte da camada pai.
- No Web do celular, a largura do diálogo não ultrapassa `calc(100vw - 2rem)`; os cards de uso restante são empilhados verticalmente, os botões são focáveis e clicáveis e não há overflow horizontal.
- Com reduced motion, fogos de artifício e animações desnecessárias são pulados.

Estados de interação com múltiplas oportunidades:

```text
status do servidor
    |
    +-- total de oportunidades válidas = 1
    |      └─ badge compacto + contagem regressiva da oportunidade única
    |             └─ 「重置」 de item único ao lado da barra de cota -> reset(type) correspondente
    |
    +-- total de oportunidades válidas > 1
           ├─ 「获得 N 次重置额度」（sem contagem regressiva na entrada）
           │      └─ clique
           │          └─ Dialog de quotas resetizáveis
           │              ├─ linha FIVE_HOUR -> resetUi.reset()
           │              └─ linha WEEK      -> resetUi.week.reset()
           └─ a página de Uso das Configurações e o HoverCard do Composer mantêm a ação direta ao lado do título da cota
                  ├─ 「重置」 de cinco horas -> resetUi.reset()
                  └─ 「重置」 semanal     -> resetUi.week.reset()

clique em reset dentro do Dialog
    -> POST /use
    -> reconciliação forçada do status
    -> used_at do servidor atualizado
    -> feedback de sucesso do botão + fogos de artifício (sem disparar o Tooltip de reset automático)
    -> decide a permanência da linha pela projeção mais recente
         ├─ restam N do mesmo tipo -> a linha permanece, mostra N e a contagem regressiva da próxima, e o botão volta a 「重置」 (pode liquidar de novo direto)
         └─ restam 0       -> a linha recolhe (a linha da contagem fica vazia durante o recolhimento)
```

## Casos de aceitação

| ID        | Cenário                                                                    | Esperado                                                                                                                                                                              |
| --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR-INT-01 | O status Personal devolve 1 oportunidade FIVE_HOUR      | As três entradas compartilham a exibição de 1 oportunidade e da contagem regressiva de expiração.                                                                                   |
| QR-INT-02 | Consulta de status de Team                              | A requisição contém TEAM, organization e project, e o estado é isolado pela source key completa.                                                                                     |
| QR-INT-03 | Plano não assinado                                     | Oportunidades e histórico vazios, sem entrada de reset.                                                                                                                              |
| QR-INT-04 | Clique em reset                                        | Botão em processing; sem Tooltip; corpo da requisição com FIVE_HOUR e a nova chave de idempotência.                                                                                 |
| QR-INT-05 | Nova tentativa depois de falha de dependência do use   | Volta ao estado clicável; a nova tentativa reutiliza a chave de idempotência original e não toca confetes.                                                                            |
| QR-INT-06 | use com sucesso                                        | Atualização forçada de status + entitlement; conclusão com o used_at do servidor; botão mostra tique de sucesso por 600ms e confetes, e então 「已重置」; sem Tooltip de conclusão.                |
| QR-INT-07 | Reset automático/operacional                            | O polling descobre o novo used_at, o gatilho sintetiza cerca de 1 segundo de 「正在重置」 e depois fica com 「已重置」 residente; o hover no gatilho recolhe o aviso e repõe uma vez os fogos no painel, na mesma posição do manual. |
| QR-INT-08 | has_unread_history                                     | O history/read é chamado depois que o estado de conclusão é escrito.                                                                                                                 |
| QR-INT-09 | Várias entradas montadas ao mesmo tempo                | As requisições de status do mesmo scope são combinadas, sem aparecerem 3~4x requisições.                                                                                            |
| QR-INT-10 | Oportunidade expirada                                  | A entrada é ocultada quando a contagem regressiva local vence, e o polling corrige em seguida.                                                                                      |
| QR-INT-11 | Celular `/remote`                                      | Reaproveita o shared host service; não cria novo runtime e não afeta a recuperação replayable.                                                                                       |
| QR-INT-12 | Chinês/inglês, dois temas e reduced motion             | Textos, cores, interação e animações seguem o DESIGN.md.                                                                                                                          |
| QR-INT-13 | O `used_at` do reset automático é anterior em mais de 5 minutos à detecção pelo polling | Na primeira detecção, 「正在重置」 sintetizado é contado a partir de `observed_at` e depois fica 「已重置」 residente; o horário no hover continua sendo o `used_at` do servidor; status repetido não reproduz a fase sintetizada nem repõe confetes. |
| QR-INT-14 | Envelope HTTP 403 devolve `code=3101`                  | O erro do cliente é `coding_plan_reset_api_error:3101`, sem branch por `msg`.                                                                                                       |
| QR-INT-15 | Status sem oportunidade e sem histórico novo           | Chama opportunity; `granted=false`/3301 mantém oculto, sem toast.                                                                                                                 |
| QR-INT-16 | opportunity com `granted=true`                         | Atualiza o status imediatamente à força e exibe a entrada com a oportunidade FIVE_HOUR válida devolvida.                                                                            |
| QR-INT-17 | As quatro entradas montadas no mesmo scope             | Só uma sessão de auth + service + scope inicia o polling de 5 minutos; só um status/opportunity é enviado na primeira vez.                                                        |
| QR-INT-18 | O status já tem oportunidade de um único tipo ou um completed history recém-descoberto | Uma oportunidade de tipo único não bloqueia o julgamento de scope depois do vencimento; quando houve conclusão neste ciclo, o opportunity é pulado.                            |
| QR-INT-19 | opportunity 3301 devolve `next_try_at` futuro          | A entrada segue oculta e sem toast; o Coordinator só consulta status antes do vencimento, e a primeira rodada visível após o vencimento usa uma nova chave de idempotência.             |
| QR-INT-20 | Reset manual pela página de Configurações/Usage e o Composer faz polling da história nova | Todas as entradas identificam como conclusão manual por service + scope; o Composer não exibe o Tooltip de reset automático nem dispara fogos no gatilho.                                 |
| QR-INT-21 | Clique em reset enquanto outra entrada da mesma janela está liquidando ou acabou de liquidar | A reconciliação forçada substitui um segundo `/use`; sem liquidação duplicada e sem consumir oportunidades extras; o clique após a concessão de uma nova oportunidade é liberado normalmente. |
| QR-INT-22 | A página de Configurações descobre a conclusão automática e o Composer monta depois, na mesma sessão de login | O `observed_at` é preservado e o Composer toca normalmente aquele 「正在重置→已重置」 e os fogos, sem julgar o Store compartilhado como um histórico de login antigo.            |
| QR-INT-23 | Saída e novo login, com o status ainda devolvendo o mesmo `used_at` | Com `auth_session_seq` alterado, o estado de conclusão antigo é silenciado; um `used_at` diferente posterior é tocado normalmente.                                                         |
| QR-INT-24 | Total de oportunidades válidas igual a 1                | As três entradas continuam exibindo a contagem regressiva da oportunidade única e não abrem o diálogo de múltiplas oportunidades.                                                      |
| QR-INT-25 | Total de oportunidades válidas maior que 1              | As três entradas fundidas exibem o 「获得 N 次重置额度」 clicável sem contagem regressiva; a página de Uso das Configurações e o HoverCard do Composer mantêm ao mesmo tempo os botões 「重置」 das cotas de cinco horas e semanais, permitindo liquidar direto ou o clique na entrada fundida para abrir o diálogo. |
| QR-INT-26 | Dados do diálogo de múltiplas oportunidades              | O título não soma as contagens; quando o mesmo tipo tem várias oportunidades, a linha exibe a pílula 「N 次」 e a contagem regressiva 「最快」, e com uma única não há pílula; só lista FIVE_HOUR/WEEK com cota real e oportunidade válida (inclusive com 100% restante), e o uso restante e as barras de progresso usam a quota atual. |
| QR-INT-27 | Clique em reset de um tipo dentro do diálogo            | Chama apenas o reset do tipo correspondente; após o used_at ser confirmado pelo servidor, exibe o feedback de sucesso e os fogos e recolhe o item, sem disparar o Tooltip de reset automático do Composer. |
| QR-INT-28 | Abertura do diálogo de múltiplas oportunidades dentro do HoverCard do Composer | O HoverCard não desmonte enquanto o Dialog está aberto; o diálogo interage normalmente e o HoverCard é recolhido depois de fechar.                                                      |
| QR-INT-29 | Abertura do diálogo de múltiplas oportunidades no Web do celular | A largura não ultrapassa a viewport menos 32px, os cards de cota são empilhados e a lista de resets rola sem overflow horizontal.                                                       |
| QR-INT-30 | O Composer é desmontado, troca de source ou o candidato muda durante a espera da reservation | Não grava played, não transmite e não exibe; a reservation com token é liberada (ou recolhida por logout do host/TTL), e outras janelas ainda válidas podem continuar disputando e concluir a exibição. |
| QR-INT-31 | acquire retorna busy e nenhum played foi transmitido    | `observed_at` e o candidato são preservados e busy não é tratado como já exibido; a reservation temporária pode ser tentada de novo e um claim permanente apenas espera o played real/supressão pelo cursor local de played.  |
| QR-INT-32 | HoverCard fechado e reaberto                            | Reutiliza o horário de agendamento original do Coordinator; pode corrigir o status imediatamente, mas não chama opportunity de novo antes de `next_try_at`.                                   |
| QR-INT-33 | Recuperação depois de erro de rede/dependência no opportunity | Nova tentativa fixa em 5 minutos reutilizando a chave de idempotência da requisição que falhou; após uma resposta de negócio explícita, a próxima rodada gera uma nova chave.                        |
| QR-INT-34 | opportunity retorna 429                                | Nenhuma requisição de opportunity por 10 minutos; o polling de status não é afetado.                                                                                             |
| QR-INT-35 | Saída e novo login no mesmo provider/scope               | `auth_session_seq` isola o Coordinator antigo e a nova sessão executa imediatamente a própria correção inicial.                                                                         |
| QR-INT-36 | opportunity com erro de autenticação, recusa de negócio ou protocolo | Nenhuma requisição de opportunity por 10 minutos; depois do cooldown usa-se uma nova chave de idempotência e o polling de status não é afetado.                                             |
| QR-INT-37 | HoverCard desmonta e remonta enquanto a atualização da entrada antiga não terminou | A nova entrada reutiliza imediatamente o in-flight/cache compartilhado para completar sua projeção de estado, sem esperar o próximo tick de 5 minutos e sem nova requisição de opportunity.                   |
| QR-INT-38 | Após liquidar uma, a cota restante é 100% e ainda há oportunidades do mesmo tipo | As três entradas continuam exibindo a entrada daquele tipo e o restante (inclusive quando resta só 1), e o botão 「重置」 permanece clicável; só depois de as oportunidades acabarem ou todas expirarem a entrada é ocultada. |
| QR-INT-39 | Várias oportunidades do mesmo tipo, liquidando uma no diálogo sem fechar o diálogo | A linha mostra imediatamente o restante e a contagem regressiva da próxima (sem 「0 分 0 秒」), o 「重置」 ao lado do título fica clicável e o badge contabiliza o restante; um novo clique envia de fato `/use` e conclui a liquidação, e a linha recolhe quando as oportunidades acabam. |
| QR-INT-40 | Nova liquidação a partir de COMPLETED(restam N), em que o status depois do `/use` ainda devolve o `used_at` do cartão anterior (inclusive com unread não limpo) | Mantém processing e não toca o feedback de sucesso; só conclui ao ler um novo `used_at` e passa a mostrar o restante pela nova snapshot; se as 4 reconciliações não virem um novo `used_at`, entra na recuperação por falha, sem sucesso silencioso. |

Registro de verificação (2026-09-28, QR-INT-39): novos testes unitários de lib / hook / diálogo / ação ao lado do título e os testes unitários relacionados já existentes totalizam 18 arquivos e 429 itens passando. No macOS Electron, `coding-plan-team-usage.test.ts` rodou o arquivo inteiro com 26 itens passando, sem skips e sem novas tentativas (incluindo o novo QR-E2E-14 e o QR-E2E-03 após o ajuste do helper de leitura do estado do diálogo), com registro de execução `desktop-e2e-20260928035551264-p84306-4690b59ecaa7b158`. Typecheck (incluindo o tsconfig de e2e), lint (0 erros; 62 avisos preexistentes não estão nas linhas alteradas) e `architecture:check --changed` passaram; Windows/Linux e aparelhos móveis reais não foram executados.

Registro de verificação (2026-09-30, QR-INT-40): a lib ganhou o caso de snapshot defasado e o hook ganhou os casos 「leitura defasada em 2 vezes (unread não limpo / já limpo)」 e 「as 4 reconcilizações defasadas levam à recuperação por falha」; antes da correção 4 itens falhavam, depois da correção lib + hook somaram 45 itens passando; 12 arquivos de teste de UI relacionados a reset somaram 156 itens passando. No macOS Electron foi adicionado o QR-E2E-15 (resultado de `/use` mockado delayado 600ms para aparecer no status): antes da correção falhava, com a linha de cinco horas parada em 「1 小时 59 分后过期 / 重置」 clicável; depois da correção `coding-plan-team-usage.test.ts` rodou o arquivo inteiro com 27 itens passando, sem skips e sem novas tentativas, com registro de execução `desktop-e2e-20260930-032927-012`. Typecheck, lint (0 erros) e `architecture:check --changed` passaram; Windows/Linux e aparelhos móveis reais não foram executados.

## Riscos de integração

1. O status do backend não tem campo de processing; o 「正在重置」 do gatilho do Composer é uma sensação puramente sintetizada no front-end (cerca de 1 segundo), não representa uma fase real de processamento no servidor, e o julgamento de negócio e a correção de cota continuam dependendo apenas do `used_at` do servidor.
2. `/opportunity` é 「disparar o julgamento no servidor」 e não um pedido do cliente nem um julgamento local; se o backend mudar no futuro para concessão ativa e periódica, essa chamada de disparo precisa ser removida junto.
3. `history/read` é um cursor compartilhado por todos os scopes do usuário; depois que uma entrada reporta, o unread dos outros scopes também é limpo, o que faz parte do contrato de backend atual.
4. Se o CORS do ambiente de teste não liberar headers como `X-Bigmodel-Authorization`, a versão Web falhará; o host do Desktop, que conecta direto, não é sujeito às limitações de CORS do navegador.

## Aviso do Composer na camada de Configurações

- Ao abrir a aba de Configurações, o workspace continua montado, mas os avisos em Portal dele não podem atravessar a página de Configurações. O primeiro aviso de oportunidade, o de vencimento próximo e o Tooltip de estado de reset compartilham a mesma barreira de visibilidade do workspace.
- Durante as Configurações, o listener de clique externo que marca os avisos do Composer como lidos fica pausado; ocultar não é o mesmo que estar lido, e ao voltar ao workspace a exibição é decidida pelas oportunidades válidas atuais e pelo estado lido original. Os Badge/Dialog de oportunidade da própria página de Configurações não são afetados.
- Motivo: a opacity/inert do workspace não alcança o Tooltip Portal montado no body, e a condição de exibição original só checava o estado de negócio. Reutiliza o mesmo julgamento de aba de Configurações ativa do Root, sem alterar requisições de serviço, execução de reset, `continuous` do desktop ou cadeia replayable do celular.
- Regressão: estende QR-E2E-09/10; depois que o primeiro aviso/aviso de vencimento aparece, alterna para Configurações, clica no conteúdo das Configurações e volta ao workspace; verifica que a camada flutuante desaparece nos ajustes sem marcar como lido indevidamente. Testes unitários cobrem a primeira chegada de oportunidade nos ajustes, a troca de aba sem desmonte e a restauração do listener de leitura.

Registro de verificação (2026-09-11): duas novas regressões de componente falharam antes e passaram depois; 19 testes unitários relacionados passaram. No macOS Electron, QR-E2E-09/10 passaram, sem skips, com registro de execução `desktop-e2e-20260911-042939-508`, usando o estado real de navegação de Configurações para verificar o desaparecimento do Portal, o clique nos ajustes sem leitura indevida e a restauração ao voltar. Typecheck, typecheck:e2e e lint passaram (44 avisos preexistentes); Windows/Linux e aparelhos móveis reais não foram executados, e esta entrega não declara cobertura de todo o fluxo de cotas.