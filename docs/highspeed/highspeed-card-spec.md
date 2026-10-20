# Especificação funcional do cartão de aceleração Highspeed

> Status: MVP em desenvolvimento (2026-08-20)  
> Escopo: sorteio no envio, fallback de 1 segundo, cooldown, modelo fixo, marcação da mensagem,
> compartilhamento e ponto de extensão paracarregar notificações globais. A caixa de entrada Highspeed
> inclui a animação de ativação; o cartão de compartilhamento continua com exibição estática.

## 1. Semântica de produto

- Ao clicar em enviar, o cliente tenta primeiro preparar um cartão Highspeed para a Task atual.
- Turnos de entrada disparados por tarefas agendadas/Automation não entram no admission do Highspeed:
  quando existe `automationId` no turno, não se chama draw nem se reaproveita um cartão existente;
  o envio segue direto pelo caminho de inferência normal. Essa verificação considera apenas a
  atribuição do turno atual; é proibido usar o `cronAutomationId` persistido na Task, senão as
  entradas manuais posteriores do usuário na mesma sessão seriam classificadas por engano como
  tarefa agendada.
- O usuário pode criar tarefas agendadas em um turno Highspeed via `CronCreate`; na criação é
  obrigatório persistir o `modelSelection` residente da sessão, e é proibido gravar o Provider do
  cartão de aceleração (`account:*-highspeed-card`) na Automation. Disparos posteriores da tarefa
  agendada continuam usando aquele modelo original pelo caminho de inferência normal, sem falhar nem
  ganhar aceleração por o fato de a criação ter ocorrido durante a aceleração. O próprio Highspeed
  não pode adicionar `CronCreate` ao `toolDisallowlist` do Turn atual do usuário; inversamente, o
  `automationId` do turno real de execução da Automation é a portão final: mesmo que
  `modelExecution` chegue junto por engano, a CLI deve ignorar esse material de execução de turno
  único e continuar ocultando as ferramentas de escrita da Automation.
- Quando o sorteio retorna em até 1 segundo e o cartão pertence à Task atual, o turno usa o
  provider/model vinculados ao cartão e o endpoint de runtime Highspeed.
- Se após 1 segundo ainda não tiver retornado, o turno é enviado normalmente; a requisição continua
  em segundo plano e, se o sorteio for positivo depois, o próximo envio da Task atual o usa
  automaticamente.
- `next_draw_at` é o horário autoritativo de cooldown no servidor; não é permitido sortear
  novamente dentro do período de cooldown.
- Um cartão vincula-se a apenas um `task_id/provider/model`. Quando a Task B observa um cartão da
  Task A, ela faz inferência normal, sem aviso.
- Com o cartão válido e pertencente à Task atual, o seletor de modelos fica travado; após expirar,
  destrava automaticamente.
- O user input do Turn acelerado mantém o estilo de mensagem comum, sem badge, cor de fundo,
  borda ou qualquer outra decoração.
- O output acelerado reaproveita o controle existente "已工作 {duration}" (「已工作」), apenas
  alterando o texto de estado de duração para o destaque roxo definido no Figma `6076:8300`; não
  há novo output badge independente.

## 2. Contrato de backend

### 2.1 Sorteio

```http
POST /api/v1/highspeed/draw
Authorization: Bearer <zcode JWT>
X-Bigmodel-Authorization: <当前 Coding Plan provider family 的业务 JWT>
Bigmodel-Target-Type: PERSONAL | TEAM
Bigmodel-Organization: <TEAM only>
Bigmodel-Project: <TEAM only>
Content-Type: application/json
```

```json
{
  "task_id": "task-abc123",
  "provider": "zai",
  "model": "glm-5"
}
```

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "card": {
      "card_id": "hsc_xxx",
      "task_id": "task-abc123",
      "provider": "zai",
      "model": "glm-5",
      "issued_at": 1786413600000,
      "expires_at": 1786414500000
    },
    "next_draw_at": 1786417200000
  }
}
```

Quando não há sorteio, está em cooldown ou não há capacidade, `data.card = null`, mas `next_draw_at`
ainda é retornado. O sorteio reaproveita o contrato de Coding Plan de JWT duplo já existente:
`X-Bigmodel-Authorization` passa diretamente o JWT de negócio correspondente à família de provider
Coding Plan atual (Z.ai/BigModel), sem `Bearer`; a identidade de organização/projeto do Team é
transmitida somente pelos headers correspondentes.

### 2.2 Inferência acelerada

```http
POST /api/v1/highspeed/anthropic/v1/messages
Authorization: Bearer <zcode JWT>
X-Bigmodel-Authorization: Bearer <当前 Coding Plan provider family 的业务 JWT>
Bigmodel-Target-Type: PERSONAL | TEAM
Bigmodel-Organization: <TEAM only>
Bigmodel-Project: <TEAM only>
X-Highspeed-Card-ID: hsc_xxx
```

A inferência acelerada e o sorteio passam pelo mesmo gateway `/api/v1/highspeed/` e pelos mesmos
middlewares de autenticação, portanto reutilizam o contrato de Coding Plan de JWT duplo
**exatamente igual ao do sorteio em §2.1** (o JWT zcode identifica a identidade da sessão,
`X-Bigmodel-Authorization` carrega o JWT de negócio correspondente à família de provider atual, e
organização/projeto do Team vão pelos headers correspondentes), acrescentando `X-Highspeed-Card-ID`
para identificar o cartão desta execução. Restrição de regressão: houve uma versão que enviava
apenas `Authorization` + `X-Highspeed-Card-ID`; o gateway não conseguia validar o direito do Coding
Plan e retornava `401 auth_failed`. Esses headers de Coding Plan e o ID do cartão devem vir da mesma
resolução de selected connection; é proibido montá-los atravessando Families.

O body é o de Anthropic Messages, e `model` deve ser igual ao model vinculado ao cartão. O cliente
aponta a Selection deste turno para o Provider embutido oculto do cartão de aceleração
(`account:zai-highspeed-card` / `account:bigmodel-highspeed-card`, com endpoint e lista de modelos
vindos do Built-in Provider Config); essa autenticação dinâmica é entregue via
`modelExecution.requestAuth`; `modelExecution.selectionScope = "execution"` garante que vale apenas
para este turno, sem modificar o `modelSelection` residente da sessão.

Os fatos sobre a capacidade dos modelos do endpoint acelerado vêm igualmente apenas do Built-in
Provider Config e são alinhados item a item com o site de Coding Plan (mid-conversation system,
WebSearch nativo do provider, entrada de imagem/vídeo). A aceleração muda apenas a velocidade e não
pode fazer a superfície de capacidades da mesma sessão oscilar conforme o turno tenha ou não
aceleração.

Highspeed e Off-Peak Provider são entradas de execução derivadas da conexão Coding Plan atual e não
possuem direitos independentes. O estado de publicação delas deve herdar o **resultado final de
direitos** da resolução do Account Provider na mesma rodada para o Provider matriz escolhido: quando
a matriz está explicitamente disponível nesta rodada, ela é publicada; quando está explicitamente
indisponível, é despublicada; quando a consulta da matriz retorna `unknown`, primeiro resolve-se a
matriz pela regra de last-known-good do Account Provider e só então o resultado final é projetado
para os Providers derivados. É proibido tratar o `unknown` original como ausência de direitos, pois
isso produziria um estado dividido em que a matriz ainda pode sortear cartas enquanto o Provider
derivado já foi removido do Registry. O last-known-good só vale dentro da mesma conta conectada e da
mesma identidade de Team `organization/project/product`; depois que a conta ou a identidade de Team
muda, tanto a matriz quanto as entradas derivadas devem falhar de forma fechada (fail-closed), sem
ressuscitar direitos antigos.

```text
Consulta original do Coding Plan      Resultado final da matriz          Entrada de execução derivada
available                 -> available                 -> available
unavailable               -> unavailable               -> unavailable
unknown + direitos antigos da mesma identidade -> last-known-good available -> available
unknown + identidade alterada -> fail-closed unavailable -> unavailable
```

Um Turn pode gerar múltiplas requisições Messages por causa de chamadas de ferramenta. Quando
qualquer requisição Highspeed falhar — cartão expirado com `HTTP 400 / provider_code=3402`, falha de
autenticação, rate limit, 5xx, erro de rede, timeout, interrupção de stream, **qualquer falha** — o
Agent deve preservar os resultados de ferramenta já concluídos e o contexto da conversa, trocar as
requisições de modelo restantes do Turn pelo modelo de sessão original de antes do envio e não pode
propagar a falha da requisição acelerada como falha do turno inteiro. Na degradação publica o evento
estruturado `TurnExecutionModelFallback`, e o Renderer exibe um aviso único: para cartão expirado,
「加速卡已到期，本轮后续内容将使用原模型继续生成」; para as demais falhas,
「加速服务暂不可用，本轮后续内容将使用原模型继续生成」.

Essa degradação é expressa de forma declarativa por `modelExecution.selectionFallback`:
`{ providerId, rules: [{ reason, providerErrorCode? }], target? }`. As regras são combinadas na ordem
declarada e a primeira que casar define o motivo do retorno; `providerErrorCode` ausente significa
qualquer falha daquele provider. O cartão de aceleração declara duas regras de período de requisição:
`3402 → highspeed_card_expired`, e todas as demais `→ highspeed_request_failed`. O Core só degrada
quando a falha vier do provider apontado pela Selection de execution deste turno (sem hardcode de
prefixo de provider id, nome de modelo ou texto de erro), e degrada apenas uma vez.

A mesma declaração também cobre o período de criação do modelo, antes do envio da requisição.
Somente quando esta rodada for uma Selection de escopo execution, o provider da Selection for igual
ao provider declarado e o erro de criação for estritamente `ProviderNotFound` ou `ModelNotFound`, o
Core cria o modelo de retorno pela mesma ordem de candidatos e continua esta rodada, publicando ao
mesmo tempo um `TurnExecutionModelFallback` com o motivo `highspeed_selection_unavailable`.
Selection de sessão comum, outros erros de criação e a falha de criação do próprio destino de
retorno não podem ser engolidos; quando todos os candidatos falham, a rodada termina com o erro real
de criação do último candidato de modelo comum, com um `warn` registrado, e o erro de Registry do
Highspeed não pode mais ser mostrado ao usuário. Depois de um retorno bem-sucedido no período de
criação, a declaração de retorno desta rodada deve ser removida, e uma falha posterior do modelo
comum não pode gerar um segundo retorno.

Qualquer falha de criação ou de requisição já atribuída ao Highspeed significa que o cartão atual
não deve continuar travando o Composer. Depois de observar o `TurnExecutionModelFallback`, o Renderer
deve chamar o Highspeed Service para invalidar o cartão, usando o `cardId` da entrada à qual o
evento pertence. Se o destino de retorno também não puder ser criado e nenhum evento for produzido,
o Core publica `error.attribution.highspeedFallbackUnavailable=true` no `TurnError` daquela rodada
(tanto o período de criação quanto o período de requisição publicam esse campo quando não há para
onde retornar), e o V4 projeta isso em `control.lastError.attribution`; o Renderer só invalida o
cartão atual quando `highspeedCardId` for igual ao cartão atual e esse campo for true, sem inferir
pelo código de erro — o `code` de uma falha 3402/de rede no período de requisição é o código de erro
do provider e não um erro de catálogo; estouro da janela de contexto, cancelamento pelo usuário e
falhas locais de runtime não participam do retorno e não carregam esse campo. O Service só limpa o
cartão quando o ID do cartão atual corresponde, e eventos antigos não podem limpar um cartão novo
sorteado em seguida, preservando o fato de cooldown `nextDrawAt` para evitar que o próximo envio
sorteie novamente de imediato e forme um ciclo de falhas. O travamento de modelo e o visual de
aceleração derivam apenas do estado atual do cartão no Service; depois que o cartão correspondente é
invalidado, sai-se imediatamente do estado Highspeed e destrava-se. Quando o retorno tem sucesso,
não se mostra Banner de erro, apenas se avisa uma vez que já houve o retorno ao modelo original; se o
modelo comum também falhar depois do retorno, a rodada termina com o erro real dele, mas nesse
momento o Composer já está destravado e o usuário pode trocar de modelo para continuar trabalhando.

A limpeza do cartão no estado final de erro precisa usar a atribuição de cartão presente nos fatos
de execução. O `intent.highspeed.cardId` do comando Highspeed é a única identidade de cartão da
rodada; a CLI o escreve em `error.attribution.highspeedCardId` ao gerar o `TurnError`, e o V4
projeta isso em `control.lastError.attribution.highspeedCardId`. O Renderer só invalida o cartão
quando esse valor é igual ao ID do cartão atual e `highspeedFallbackUnavailable` é true, sem mais
procurar a linha de entrada por `rows.window`. Quando a criação do modelo falha, é preciso publicar
primeiro o `TurnStarted` e persistir a entrada de usuário já aceita, e só depois publicar o
`TurnError`; a atribuição explícita de erro continua sendo usada para invalidar o cartão correto, e
não se pode usar a presença do userInput na janela histórica como critério de associação. O `inputId`
continua sendo a âncora genérica de entrada do TurnError, mas não carrega a atribuição do cartão
Highspeed. Um Agent antigo sem o campo `highspeedCardId` só pode limpar o cartão de forma
conservadora, pelo código de erro de catálogo `provider_not_found` / `model_not_found` e usando o
horário de emissão do cartão como limite inferior.

Os comandos destrutivos `editUserQuery` / `retryTurn` precisam concluir uma verificação de admissão
de modelo antes do branch cut e do rewind do workspace; depois que o branch cut é submetido, não se
pode recusar o mesmo replacement input com um Provider Registry mutável. Se o Registry mudar depois
da pré-verificação e antes de o Core criar o modelo, o Core pode encerrar a rodada com uma falha
`model_creation`, mas precisa antes promover o replacement input a um user row autoritativo e
recuperável. O estado final só pode ser «nova entrada + erro explícito», nunca apenas um histórico
truncado ou um workspace já revertido.

A rodada com falha de criação não duplica o fluxo de persistência. O Core apenas registra o erro de
criação original e percorre o mesmo ciclo de vida da rodada comum: `TurnStarted`, hook
`UserPromptSubmit`, resolução de anexos e persistência do user row. O estado final de erro é escrito
apenas pelo mesmo catch do ciclo de vida principal. Depois de uma falha na criação do modelo, não se
pode inicializar o Context nem executar o hook `SessionStart`: ambos dependem de um modelo disponível
e ficam antes da persistência da entrada, e a falha sobrescreveria o erro de criação original e
perderia de novo a entrada já aceita; o `SessionStart` também não pode ser consumido pela rodada com
falha e precisa ficar para o próximo Turn em que o modelo possa ser criado.

```text
Falha na criação do modelo pelo Core ──> registra o erro original (sem escrever estado final) ──> pula a inicialização do Context e o hook SessionStart
  └─> TurnStarted ──> hook UserPromptSubmit ─┬─ intercepta ──> completed(success, stopReason), entrada não persistida (regra da rodada comum)
                                             └─ libera ──> resolução de anexos + persistência do user row ──> lança o erro original
                                                                                       │
catch do ciclo de vida principal (único ponto de escrita do estado final de erro) <────────┘
  ├─ falha comum (inclui falha de persistência) ──> TurnError(model_creation, erro de criação original); falhas de persistência só geram warn
  ├─ Stop do usuário ──> completed(cancelled), igual à rodada comum
  └─ fault do host (passado pelo abort signal) ──> TurnError(fault code), igual à rodada comum
```

Essa rodada não entra no model step, portanto recusa o guide (`turn_not_steerable`) e o guide é
redirecionado para a queue comum. Essa rodada também não aplica o modelo, o mode e o plan da
submissão, e não conta como rodada-alvo do goal. O `/compact` não produz user row: quando a criação
falha, publica-se diretamente `TurnError(model_creation)`, sem publicar `TurnStarted`.

O Agent novo publica, para cada `TurnError`, uma atribuição de três estados: uma string representa o
cartão usado nesta rodada, `null` significa que a rodada não usou Highspeed, e a ausência do campo
significa apenas um Agent antigo. Por isso, um erro de catálogo de uma rodada comum enfileirada é
`null` e não pode limpar um cartão alheio durante a posse do cartão; erros residuais atribuídos a um
cartão antigo também não podem limpar o cartão atual. Compatibilidade com Agent antigo: quando o
campo está ausente, mantém-se o comportamento conservador de limpeza pelo código de erro de
catálogo e pelo horário de emissão do cartão como limite inferior; nesse caminho, um erro de catálogo
de uma rodada comum ainda pode limpar o cartão por engano, mas isso só existe no período de
transição em que o App novo se conecta a um Agent antigo.

O destino do retorno é resolvido em ordem: **primeiro o `target` declarado, depois o `modelSelection`
residente da sessão copiado antes da aceitação desta rodada**. `target` é a seleção submetida pelo
solicitante no momento do sorteio (modelo atual do Composer e nível de raciocínio), ou seja,
exatamente aquela que este turno vincularia como seleção de sessão caso não fosse acelerado — o
cartão de aceleração é obrigado a preenchê-la; a seleção residente da sessão é apenas um fallback,
pois a aceitação da mensagem do usuário vincula a seleção de submissão comum, e normalmente as duas
são iguais. O destino candidato não pode ser o próprio provider de execution deste turno; quando o
destino não é resolvível no Registry, passa-se ao próximo candidato. Se nenhum for resolvível, não
há para onde retornar: o turno falha com o erro real, sem ENTERRAR a causa raiz, e o Core precisa
registrar um `warn` com o motivo. O Core guarda o candidato de sessão como um snapshot
`highspeedFallbackSelection` exclusivo do cartão de aceleração, e uma atualização posterior da
Session por entradas do usuário não pode mudar o destino de retorno de rodadas antigas; o retorno
não constrói snapshot de execução adicional nem exige overlay/API de restauração de modelo; a
requisição de retorno usa a autenticação regular do próprio usuário e deixa de carregar o
`requestAuth` desta execução.

Restrição de regressão (o destino de retorno precisa vir na declaração): o destino de retorno já
dependeu só da seleção residente da sessão no runtime. Na recuperação a frio após reiniciar o
desktop, se cair na janela em que o Provider Registry acabou de ficar pronto e os direitos da conta
ainda não foram resolvidos, a seleção de sessão persistida falha na validação por o provider ainda
não publicado e não é vinculada; depois, se apenas turnos acelerados forem enviados (o escopo
execution não vincula seleção de sessão), o runtime fica sem seleção residente, a degradação na
expiração do cartão (3402) é pulada silenciosamente e o turno inteiro falha com `highspeed card is
invalid`, exibindo um banner de erro. Como o solicitante sabe explicitamente qual é o modelo
original no momento do sorteio, o destino passa a ser declarado pelo solicitante, sem apostar no
estado do runtime.

Restrição de admissão no ACK: a Selection de execution do Highspeed pode ser adiada para o Core
resolver, de modo a permitir o retorno no período de criação quando o modelo acelerado está
temporariamente ausente; antes de aceitar a entrada, o Bootstrap precisa confirmar que a Selection de
execution ou o `selectionFallback.target` declarado existe ao menos um deles no Provider Registry
atual do Worker. Quando a Selection de execution está disponível, não se pode recusar apenas porque
o destino de retorno está ausente; quando nenhum dos dois é resolvível, é preciso recusar antes do
ACK com `modelUnavailable`, e não aceitar a entrada e publicar apenas `TurnError(model_creation)`. O
Renderer, diante de uma recusa de admissão do Highspeed desta vez, precisa invalidar o cartão
correspondente, sair do estado de aceleração e destravar o seletor de modelos, ao mesmo tempo em que
o Composer recupera o texto e os anexos, sem mostrar Turn Error nem Banner de erro genérico de envio.
O ACK significa que a entrada já foi aceita de forma confiável; o watchdog de UI não pode ser usado
para recuperar entradas que ainda não produziram a projeção de `TurnStarted` / userInput.

`editUserQuery` / `retryTurn` persistem um active branch cut, e `workspaceMode=rewind` ainda modifica
antes os arquivos do workspace. Eles precisam se basear no canonical intent e no material de
execução que serão reenviados, executando a mesma verificação de admissão de modelo antes de parar o
turno ativo, de reverter os arquivos e de fazer o branch cut. Quando a admissão falha, não se pode
alterar o histórico ativo nem o workspace. A pré-verificação e o reenvio real precisam reutilizar as
mesmas regras de admissão, para que o envio comum e o reenvio por edição não julguem «modelo
disponível» separadamente. Depois de aceito, o `editUserQuery` do Highspeed segue o accepted-input
projection recovery do conversation protocol: se o branch cut já estiver visível e o replacement user
row ficar silencioso, recupera-se apenas a mesma owned subscription, sem reproduzir o comando, sem
fabricar mensagens e sem restaurar o branch antigo.

Limites da degradação:

- **Zero retentativas na requisição acelerada**: o handle de modelo de escopo execution com
  `selectionFallback` fica preso ao orçamento de retentativas `single-attempt`; a camada de adaptação
  não aplica mais o backoff padrão de 10 tentativas para falhas transitórias como 429/5xx/rede/
  timeout, entregando o Core na primeira falha para que ele retorne; caso contrário, quando o endpoint
  acelerado está sobrecarregado o usuário teria de esperar vários minutos para a degradação. O modelo
  de sessão após o retorno recupera o orçamento padrão.
- **Retorno declarativo tem precedência sobre stream recovery do mesmo modelo**: em caso de stream
  interrompido com saída já visível, volta-se diretamente ao modelo original para regerar, sem antes
  tentar de novo no modelo acelerado; se a falha casar com a declaração de retorno, mas todos os
  destinos forem irresolvíveis, falha-se com o erro real, também sem voltar ao modelo acelerado para
  stream recovery. `TurnExecutionModelFallback` precisa marcar os streams de text/reasoning
  descartados como `interrupted` e as linhas de ferramenta `inputStreaming` ainda não finalizadas como
  `cancelled`, evitando que o modelo original, ao continuar o stream, concatene as duas saídas de
  modelo ou marque como concluída uma saída descartada. Ferramentas client-side que já formam um
  `tool_call` completo não podem se limitar a um `tool_abandoned` em memória: antes de trocar de modelo
  é preciso parar o agendamento e fechar as durable parts; resultados concluídos são submetidos pelo
  resultado original, chamadas em execução têm prioridade em submeter um resultado de cancelamento
  explícito e, quando não for possível confirmar o estado, submete-se um synthetic interrupted result;
  ademais, o assistant tool call e o tool result devem entrar aos pares no histórico live/cold
  provider-visible. O modelo de retorno só pode continuar a partir desse anchor estável, sem reexecutar
  cegamente as ferramentas, e também não pode deixar `pending`/`running` parts na persistência. Mesmo
  que todos os destinos de retorno sejam irresolvíveis, o settlement das ferramentas já aceitas
  precisa ser concluído primeiro, e só então se preserva o erro original do provider encerrando o turno;
  «não pedir mais ao modelo acelerado» não pode ao mesmo tempo pular o fechamento das ferramentas, nem
  publicar `tool_abandoned` de novo após o settlement e sobrescrever o estado final.
- **Tool anchor zera o orçamento de continuação de output**: se um retorno bem-sucedido de fato
  submeteu um ou mais resultados de ferramenta, isso significa que um novo limite de execução de
  modelo foi estabelecido, e `outputTokenContinuationCount` precisa ser zerado, como numa resposta
  normal de ferramenta ou na recuperação de ferramenta do mesmo modelo; uma degradação que apenas
  descarta o tail de text/reasoning, sem chamada de ferramenta completa, não pode zerar, para que uma
  falha só de texto não burle o limite de continuação da mesma saída.
- **Falhas que não degradam**: cancelamento pelo usuário (o turno inteiro é encerrado como
  cancelamento), estouro da janela de contexto (entregue ao reactive compact; retornar ao mesmo
  modelo na mesma janela apenas estouraria de novo) e falhas locais de runtime como persistência de
  eventos ou projeção. O «qualquer falha» da regra de fallback significa apenas falhas de requisição
  provider/rede explicitamente atribuídas ao provider de execution deste turno; não se pode
  classificar uma exceção local sem atribuição como falha do endpoint acelerado.
- **Uma vez por turno, e a falha já retira o cartão**: após a degradação, todas as requisições
  restantes do turno usam o modelo de sessão; se o modelo de sessão após o retorno falhar de novo, a
  rodada termina com o erro real dele. Uma falha de criação ou de requisição do Highspeed, assim que
  atribuída, invalida imediatamente o cartão correspondente e preserva o cooldown, e a próxima rodada
  não pode reutilizar a mesma carta; assim, mesmo que o modelo comum também falhe, o Composer já saiu
  do estado Highspeed e o usuário pode escolher outro modelo para recuperar o trabalho.
- **Estado final na recuperação a frio**: o attempt acelerado que sofreu retorno precisa ser
  persistido como um limite uniforme de stream-recovery discarded, e não como um assistant `completed`
  comum. Se o processo sair antes de o modelo de retorno produzir o assistant final, a recuperação a
  frio encerra este Turn como interrupted; se já houver depois um assistant concluído normalmente,
  restaura como success e sem banner de erro. O tool anchor continua sendo recuperado aos pares, como
  no item anterior.
- **Rastro**: na degradação a CLI registra um `warn` com atribuição (providerId, modelId, statusCode,
  providerErrorCode, reason), para que regressões silenciosamente mascaradas por falhas de autenticação ainda
  possam ser encontradas nos logs.
- **Critério de estatística inalterado**: após a degradação, o Turn continua sendo contado como Turn
  completo em `outputTokens/durationMs` e participa do compartilhamento (§2.3). Um Turn cuja primeira
  requisição acelerada já falhou tem output acelerado 0, mas como `highspeedMeta` já foi persistido
  junto da entrada, ele continua sendo exibido e contado como turno acelerado; essa é uma escolha
  conhecida e, para excluí-lo, seria preciso definir outra regra de estatística.

```text
execution Selection
        |
        +-- criação de ProviderNotFound / ModelNotFound
        |       +--> modelo de sessão original criado
        |       |       +--> emite selection_unavailable
        |       |       +--> invalida o cartão correspondente + destrava o seletor
        |       +--> nenhum candidato criado
        |               +--> falha com o erro real do modelo comum
        |               +--> TurnError.attribution.highspeedFallbackUnavailable
        |               +--> invalida o cartão correspondente + destrava o seletor
        |
        +-- falha na requisição --> preserva o contexto/ferramentas do Turn atual
                                +--> destino de retorno criado
                                |       +--> notifica o Renderer uma vez (cartão expirado / requisição falhou)
                                |       +--> invalida o cartão correspondente + destrava o seletor
                                |       +--> as requisições restantes usam o modelo de sessão original
                                +--> nenhum destino de retorno
                                        +--> falha com o erro original do provider (ex.: 3402)
                                        +--> TurnError.attribution.highspeedFallbackUnavailable
                                        +--> invalida o cartão correspondente + destrava o seletor
```

### 2.3 Compartilhamento

- O cartão de compartilhamento é gerado pelo cliente a partir das métricas de Turn em nível de cartão
  já persistidas; não chama mais a interface share do backend e não depende de `share_id`,
  `share_url` nem de resposta remota de compartilhamento.
- Valores de exibição como `token_usage`, `highspeed_tps` e `regular_tps` continuam calculados a
  partir dos fatos locais agregados em nível de cartão; o healthy usage em nível de cartão continua
  obtido por `/api/v1/highspeed/:card_id/healthy`, usado para calcular o TPS alto.
- Copiar imagem e copiar texto usam ambos o conteúdo gerado pelo cliente, e a notificação de
  compartilhamento guarda apenas o snapshot de exibição local mais recente, fechando-se
  automaticamente conforme a regra existente de visibilidade de 24 horas.
- Até o cartão Highspeed atingir `expires_at`, apenas as métricas de cada Turn são acumuladas, sem
  chamar share e sem publicar o cartão de compartilhamento no canto inferior esquerdo. Depois que o
  cartão expira e todos os Turns que ele iniciou entram em estado final, as métricas são agregadas por
  `card_id`; o cartão de compartilhamento do canto inferior esquerdo é tentado automaticamente no
  máximo uma vez no ciclo de vida atual do Renderer, e apenas quando os dados agregados estão
  completos e a taxa geral de aceleração é estritamente maior que `1.2x`. Se não atingir o critério
  (≤`1.2x`) ou não houver dados confiáveis, nada é publicado (portões de publicação em §9 e
  `highspeedTurnStore.listHighspeedCardAutoShareCandidates`).
- Se qualquer Turn sofrer degradação por falha de requisição acelerada (cartão expirado ou outra
  falha, ver §2.2), ele ainda é contado como Turn completo em `outputTokens/durationMs` e participa do
  compartilhamento automático ou manual desse cartão; a estatística de compartilhamento não distingue
  os segmentos de saída antes e depois da degradação.
- Após uma falha no compartilhamento automático, não é permitido repetir imediatamente por causa de
  snapshot, versão do store ou re-render do React, para evitar tempestade de requisições e 429; a
  entrada de compartilhamento manual dos Turns históricos continua disponível.
- O botão de compartilhamento dos Turns históricos gera o conteúdo a partir do metadata de estado
  final Highspeed persistido no transcript a cada clique, sem depender dos registros em memória do
  Renderer; após o sucesso da cópia usa o mesmo Toast de sucesso do cartão do canto inferior esquerdo,
  「已复制分享内容」, sem enviar nem construir link remoto de compartilhamento e sem trocar o cartão
  atual do canto inferior esquerdo.

### 2.4 Logs de diagnóstico de falhas

- `draw`, o healthy usage em nível de cartão e a verificação de saúde de TPS comum da qual depende o
  tempo economizado pelo Highspeed: qualquer falha de rede, HTTP, envelope de negócio ou parsing da
  resposta precisa registrar um `warn`. Falhas de cópia do conteúdo de compartilhamento gerado pelo
  cliente também registram o aviso de UI correspondente; não se registra mais requisição de share API
  inexistente.
- O log contém no mínimo o nome da operação, URL mascarada, status/statusText HTTP, tempo decorrido,
  mensagem de erro e `x-request-id` / `x-trace-id` / `x-span-id` dos headers de resposta; o body da
  resposta guarda apenas um resumo de erro restrito.
- É proibido registrar `Authorization`, `X-Bigmodel-Authorization`, headers completos, JWT, body
  completo da requisição ou output de modelo em streaming. O contexto da requisição registra apenas
  resumos não sensíveis úteis para localização.
- A inferência Highspeed continua pelo caminho de erros de requisição de modelo do Agent; o Host não
  registra novamente chunks de streaming, para não ampliar o diagnóstico de falha em logs de
  comunicação de alta frequência.

## 3. Sequência de envio

```text
User        Renderer coordinator       Highspeed service/API       Session command
 | click send        |                          |                         |
 |------------------>| prepare(task, model)     |                         |
 |                   |------------------------->| draw / reuse card       |
 |                   |                          |                         |
 |                   |<--- card <= 1s ----------|                         |
 |                   | sendText(modelSelection + modelExecution, card metadata) |
 |                   |--------------------------------------------------->|
 |                   |                          |                         |
 |                   |---- OR timeout at 1s ----|                         |
 |                   | sendText(normal fallback)|                         |
 |                   |--------------------------------------------------->|
 |                   |                          | draw continues          |
 |                   |                          |-- result cached --------|
 | next click        | consume cached card      |                         |
```

Regras de corrida:

1. O primeiro envio de uma Task nova cria primeiro uma sessão vazia; só depois de obter o
   `sessionId/task_id` real executa o draw e submete o primeiro turno com `sendText`; é proibido usar
   `createSession(firstInput)` e contornar o admission do Highspeed.
2. Cartão existente, não expirado e pertencente à Task atual: sem draw, acelera diretamente.
3. Cartão existente, não expirado, mas pertencente a outra Task: sem draw, sem aviso, envio normal.
4. `now < next_draw_at`: sem draw, envio normal.
5. Para o mesmo usuário só é permitido um draw em voo por vez; envios simultâneos reutilizam a mesma
   Promise.
6. O limite de 1 segundo restringe apenas a espera do envio atual, sem cancelar o draw. Mas a
   **requisição em si** de draw/healthy precisa ser limitada: o transport aborta após
   `HIGHSPEED_REQUEST_TIMEOUT_MS` (padrão 20s, explicitamente maior que o orçamento de espera de 1s,
   para que um draw lento porém legítimo ainda possa ter efeito na rodada seguinte) e rejeita a Promise; o
   deadline também cobre a leitura do body da resposta; o reject dispara o `finally` do draw em voo,
   liberando-o, de modo que o próximo envio possa sortear novamente. Quando o proxy/servidor aceita a
   conexão e nunca retorna, o «único em voo» não pode degenerar em um disjuntor permanente que só a
   reinicialização recupera.
7. Se este turno tiver `automationId`: fallback direto antes de ler o cartão, checar o cooldown e
   iniciar o draw; não é permitido alterar o cartão atual, `next_draw_at` nem o estado do draw em
   voo. O `cronAutomationId` da Task não participa da verificação.
8. Quando a Task atual está em execução, a nova entrada do usuário ainda precisa ser admitida conforme
   a semântica existente de `queue` e não pode ser rejeitada por carregar
   `modelSelection`/`modelExecution`. O estado de execução precisa ter o `activeTurn` do Core como
   verdade final; mesmo que o controller do adapter ou a rota de projeção ainda não estejam
   sincronizados, enquanto o Core tiver um turno ativo a entrada precisa entrar na fila, sem recorrer
   indevidamente a `startNow`. A única semântica de `QueueItem.modelSelection` é a Selection de
   submissão comum anterior ao envio: ela é persistida, sofre recuperação a frio e é restaurada no
   Composer quando a edição é desfeita, assim como o mode e o Plan; é proibido gravar nela uma
   Selection de execução de turno único como `account:*-highspeed-card`. O `selectionFallback.target`
   só pode servir como Selection de submissão comum quando o Provider Family não é Highspeed; todos
   os caminhos de escrita na fila precisam compartilhar o mesmo resolvedor de Selection comum. Se o
   target for poluído por uma versão antiga ou por um payload anômalo e apontar para um Provider
   Highspeed, é preciso passar à Selection comum residente da sessão, e é proibido escrever um
   Provider interno em `QueueItem.modelSelection`. A fila pode persistir os metadados do cartão
   Highspeed sem credenciais; o `modelSelection` acelerado e o `modelExecution` precisam formar um
   único execution bundle, que reside apenas na memória do processo da CLI, indexado por
   `sourceCommandId`, e só é congelado no contexto de execução deste turno quando a entrada é
   promovida a um novo Turn. A admissão de enfileiramento submete apenas a Selection comum e os
   metadados do cartão, sem `modelExecution`. Quando o host não oferece esse armazenamento
   temporário, é preciso recuar por completo para a Selection comum do próprio QueueItem, sem deixar
   aceleração pela metade.
9. Na promoção de um item da fila Highspeed é preciso revalidar `expiresAt`: com o cartão ainda
   válido, o consumo automático prioriza reaproveitar o execution bundle guardado temporariamente na
   memória da CLI; quando o usuário clica em «立即发送», o Renderer precisa usar a Selection comum do
   próprio QueueItem como entrada de preparo, reaproveitar `modelSelection` + `modelExecution` com
   base na mesma carta válida atual e submetê-los junto do `sendQueuedNow`, evitando que a falta do
   material temporário em memória faça um cartão válido ser degradado por engano; o material
   reaprovido precisa ser da mesma carta (`cardId`/`taskId` coincidentes) e material de outra carta é
   sempre ignorado, evitando troca de credenciais. O limite de promoção usa a Selection acelerada do
   bundle, mas o `selectionFallback.target` precisa ser fixado na Selection comum do QueueItem. Com o
   cartão expirado, ou com o execution bundle ainda indisponível após o novo preparo, apenas se
   remove a marca Highspeed do turno e se usa diretamente a Selection comum já persistida no
   QueueItem; não se pode voltar a olhar a Session Selection, que pode ter sido modificada por
   entradas posteriores. Só se faz compatibilidade de migração para os QueueItem que uma versão
   antiga persistiu incorretamente como `account:*-highspeed-card`, e apenas com base no Provider
   Family, sem depender da presença de metadados de cartão (o reenvio poluído de uma versão antiga
   pode produzir itens desse tipo sem metadados de cartão): na promoção, reescreve-se para a
   Selection residente da sessão; ao desfazer a edição, essa Selection não é restaurada e o Composer
   mantém a escolha atual; é proibido expor o Provider interno na face de erro ou no Composer. Em
   qualquer um dos casos, a entrada do usuário não pode ser perdida nem bloquear o FIFO subsequente.
10. Quando o usuário edita a última entrada real e reenvia, isso precisa ser tratado como um novo
    envio ativo: o Renderer reexecuta o prepare Highspeed da Task atual antes de submeter
    `editUserQuery` e envia junto os metadados do cartão obtidos nesta rodada, mais o `modelSelection` +
    `modelExecution` de turno único. O lado da CLI só aceita cartas desta sessão (`taskId` igual ao
    `sessionId` atual), não expiradas, e cujo `modelSelection` realmente aponte para o Provider
    acelerado; é proibido reutilizar credenciais de carta antiga de turnos históricos editados; se a
    carta atual já estiver inválida ou o prepare fizer fallback, o reenvio usa o modelo comum e não
    mantém a marca Highspeed antiga.
11. Apenas usuários de Coding Plan podem chamar draw: antes de iniciar um novo draw é preciso
    confirmar que existe uma conexão Coding Plan utilizável no momento (reaproveitando a verificação de
    suporte a Coding Plan do off-peak). Usuários sem Coding Plan fazem fallback direto para envio
    normal, sem iniciar draw, sem gerar ruído de warn e sem alterar o cartão atual, `next_draw_at` nem
    o estado do draw em voo; se o processo de verificação lançar exceção, trata-se como não suportado,
    evitando bater na interface de draw com credenciais inválidas. O reaproveitamento de uma carta
    válida existente (regra 2) não é afetado por essa portão.
12. O fechamento do envio não espera dados decorativos. Após um sorteio positivo, a leitura do Decode
    TPS comum (que decide apenas a exibição do tempo economizado, nem autenticação, nem escolha de
    modelo, nem correção da inferência) espera no máximo `min(300ms, 1s 发送预算剩余)`: em timeout
    ou falha, este turno não anexa `regularTps` e não mostra o tempo economizado; `sendText` é
    submetido imediatamente; a requisição em si não é cancelada e o Service a conclui e mantém em cache
    para as rodadas seguintes acertarem. A espera total de `prepareHighspeedSendContext` não pode
    ultrapassar o orçamento de envio de 1s, e é proibido deixar o timeout de 15s da consulta de TPS
    bloquear a submissão do comando principal. O orçamento de espera de 1s de `prepareTurn`, no lado do
    Service, conta a partir da entrada em `prepareTurn` e um único deadline cobre de forma uniforme a
    verificação de portão antes de iniciar um novo draw (regras 11/14), a espera do draw e a resolução
    da autenticação acelerada após um sorteio positivo ou reaproveitamento da carta; é proibido que
    qualquer trecho de await seja cronometrado isoladamente fora do orçamento: se a verificação de
    portão estourar o orçamento, este turno faz fallback com envio comum `unavailable`, sem iniciar
    draw; se a resolução da autenticação acelerada estourar o orçamento, faz fallback com envio comum
    `draw-timeout`, e o resultado de fallback carrega a carta, que é mantida para uso na próxima
    rodada. A verificação com timeout e a requisição de autenticação em si não são canceladas e, ao
    concluírem, o cache subjacente pré-aquece a próxima rodada; elas não alteram a carta,
    `next_draw_at` nem o estado do draw em voo.
13. retry, reenvio por edição e promoção da fila compartilham o mesmo resolvedor de fallback: no
    reenvio/promoção, se não houver uma execution Highspeed válida neste turno (nenhum novo sorteio,
    carta expirada, host sem armazenamento temporário de credenciais) e a Selection histórica/em fila
    apontar para `account:*-highspeed-card`, é preciso reescrever explicitamente para a Selection
    residente da sessão de antes do envio; é proibido remover apenas `modelExecution` e manter a
    Selection acelerada. A Selection acelerada só é válida se aparecer pareada com o requestAuth do
    mesmo turno; mantê-la sozinha faz o Core falhar com ModelRequestAuthMissing e ainda a fixa no
    novo canonical intent, fazendo os envios comuns seguintes continuarem carregando um Provider
    acelerado inutilizável. Essa reescrita afeta somente o intent deste turno e não modifica o modelo
    residente da sessão.
14. Só é permitido iniciar um novo draw quando o modelo de sessão pertence ao catálogo de modelos do
    Provider Coding Plan selecionado: antes de iniciar um novo draw, a camada de Service usa a visão de
    seleção de modelos (`ModelSelectionView.providers[].models`, originada do Built-in Provider Config)
    para confirmar que a combinação atual `providerId/model` existe de fato. Se o modelo não está no
    catálogo (por exemplo, uma combinação obsoleta como um modelo descontinado restaurado pela sessão
    ou um Registry ainda não pronto), ou se a verificação do catálogo não concluiu dentro do orçamento
    de envio (por exemplo, a inicialização do Provider Runtime bloqueou, ver regra 12), faz fallback
    direto para envio comum (reason `unavailable`), sem iniciar draw, sem gerar ruído de warn e sem
    alterar a carta atual, `next_draw_at` nem o estado do draw em voo; se a verificação lançar
    exceção, trata-se como não aprovada, evitando bater na interface de draw com combinação inválida. O
    reaproveitamento de uma carta válida existente (regra 2) e o draw em voo não são afetados por essa
    portão. Cenários de Mock passam por liberação para preservar a semântica de validação local.
15. O prepare Highspeed de um envio ativo do usuário (sendText, incluindo criação de sessão nova e
    promoção de pré-aquecimento) tem a seleção de modelo vinda da mesma origem do `modelSelection` deste
    envio: prefere-se `providerId/modelId/reasoningLevel` da seleção submetida, e campos ausentes caem
    campo a campo na projeção da sessão → rascunho → rascunho inicial. O primeiro envio após trocar de
    modelo precisa fazer admission com a nova seleção: quando o novo provider/model não satisfaz a
    portão de draw (regras 11/14), não se inicia draw e o turno envia normalmente conforme a seleção
    submetida; é proibido sortear com a combinação antiga da sessão e sobrescrever a escolha do usuário
    com o modelo da carta. O reenvio histórico por edição, quando não há seleção de submissão comum,
    faz prepare pela Selection residente da sessão; a promoção manual da fila precisa passar
    explicitamente a Selection comum do próprio QueueItem, sem voltar a olhar a Session Selection,
    que pode ter sido reescrita por admissões posteriores.

```text
running Highspeed turn
        |
        +-- next user prompt --> queue(card metadata + ordinary submission modelSelection)
        |                        + retainQueuedTurnExecution(
        |                            sourceCommandId,
        |                            highspeed modelSelection + modelExecution
        |                          )
        |                             |
        |                             +-- auto promote while valid --> freeze bundle into turn
        |                             |
        |                             +-- manual promote ----------> refresh from queued ordinary Selection
        |                             |
        |                             `-- expired/bundle missing --> use queued ordinary Selection
        |
        `-- edit queued prompt --> restore ordinary Selection to Composer
```

```text
edit accelerated user input
        |
        +-- prepare current task/card again
        |
        +-- valid card + runtime --> rewind + rerun with new Highspeed metadata
        |
        `-- unavailable ----------> rewind + rerun with ordinary session model
```

```text
send admission
  |-- automationId present --> normal send (no card reuse, no draw)
  `-- user turn -----------> existing Highspeed prepare/draw flow
```

## 4. Máquina de estados da carta

```text
                 draw miss / cooldown
        +--------------------------------+
        |                                v
  [idle] --draw--> [drawing] ---------> [cooldown]
                     | hit                  |
                     v                      | now >= next_draw_at
                  [active] -----------------+
                     |
                     | expires_at reached
                     v
                  [expired] ---> [idle/cooldown]

active + task mismatch => foreign-active（当前 Task 静默 fallback）
```

## 5. Metadados de mensagem e estatísticas

O MVP não adiciona novas colunas físicas ao banco de dados de sessão. O campo
`metadata.highspeed` da mensagem de usuário em `message.data` persiste o snapshot da carta usada
neste turno, com estrutura fixa:

```json
{
  "schemaVersion": 1,
  "cardId": "hsc_xxx",
  "taskId": "task-abc123",
  "provider": "zai",
  "model": "glm-5",
  "issuedAt": 1786413600000,
  "expiresAt": 1786414500000,
  "fallbackAt": 1786414500123,
  "fallbackReason": "highspeed_card_expired"
}
```

Esse metadata só é escrito pelo `sendText` que passou pelo admission Highspeed, entrando no SQLite
por `sendText.highspeedMeta -> TurnInputIntentMetadata.highspeed -> persistUserPrompt`; mensagens
antigas sem esse campo são tratadas como mensagens comuns. O Renderer continua registrando as
estatísticas em andamento por `sessionId + sourceCommandId`:

- `fallbackAt` só aparece quando há degradação por falha de requisição acelerada dentro do Turn
  (`fallbackReason` registra o motivo junto: `highspeed_card_expired` /
  `highspeed_request_failed` / `highspeed_selection_unavailable`, e o Renderer escolhe o texto do
  aviso conforme isso, sendo escrito no
  mesmo evento de `fallbackAt`, persistido e recuperado pelas mesmas regras), servindo para projetar o
  aviso de expiração de forma consistente entre desktop continuous e celular replayable; ele não
  altera a elegibilidade para compartilhamento nem o critério de estatística completa deste Turn. É um
  campo de metadata autoritativo: na persistência do tempo em estado final a CLI também escreve no
  transcript o `fallbackAt` já produzido na projeção live, e `HighspeedMetricsUpdated` e o Renderer
  `setHighspeedMetrics` fazem apenas merge campo a campo em `highspeed`, somente adicionando e nunca
  removendo — a atualização de métricas em estado final não pode apagar o `fallbackAt` já produzido
  no mesmo Turn; a hidratação a frio restaura o campo tal e qual, com resultado idêntico entre as
  projeções live e cold.

- `cardId`
- `taskId`
- `provider/model`
- `expiresAt`
- `startedAt`
- `outputTokens/durationMs` após a conclusão

As estatísticas de estado final como `outputTokens/durationMs` continuam salvas apenas na memória do
Renderer atual e com quantidade limitada; a estatística de compartilhamento continua sendo feita por
join via `sourceCommandId`. Já a identidade de exibição Highspeed das mensagens históricas precisa ser
projetada pela CLI a partir do `metadata.highspeed` persistido para o `UserInputRow.highspeed`
correspondente, e o Renderer não pode depender apenas do `highspeedTurnStore` in-processo para
determinar o tempo de trabalho roxo. Assim, depois que a carta expira, a página recarrega ou a sessão
passa por recuperação a frio, o output acelerado continua com a marca roxa “已工作”; mensagens
antigas sem metadata são tratadas como mensagens comuns. O snapshot da carta Highspeed acompanha o
transcript e atende ao mesmo tempo o desktop `continuous` e o celular `replayable`, sem criar mensagem
de recuperação independente, snapshot ou uma segunda fila.

### 5.1 Selection residente de sessões derivadas

A Selection acelerada registrada na mensagem é um fato de execução de turno único com
`selectionScope=execution`, válida apenas quando aparece pareada com o requestAuth do mesmo turno;
turnos acelerados nunca chamam `setSessionModelSelection`, portanto a Selection residente da sessão
pai permanece igual ao modelo original do usuário durante a aceleração.

Os caminhos que derivam uma nova sessão a partir de mensagens históricas — stable fork
(`forkAssistant`), bifurcação antes de uma edição, conversas auxiliares —, ao herdar a seleção de
modelo da mensagem do ponto de bifurcação, devem pular a Selection acelerada e voltar à Selection
residente da sessão pai (mesmo critério da regra 13 em §3):

```text
boundary message selection
  |-- account:*-highspeed-card --> skip ----> parent session resident selection
  `-- ordinary selection ------------------> inherit（缺推理档位时回落常驻档位）
```

A entry `SESSION_ENTRY_MODEL_SELECTION` do filho, o `providerId/modelId` do assistant de aviso de
fork e o `runtimeConfig.model` do host precisam vir do mesmo resultado; a projeção de recuperação a
frio (`sessionModelSelectionOfHydratedMessage`) já tem o mesmo filtro, e o resultado derivado é
idêntico entre live e cold. Quando a sessão pai também não tem Selection residente, deixa-se vazio;
é proibido gravar o Provider acelerado no filho — senão o usuário vê «加速中的会话分叉后原模型没带过来»
(o Provider acelerado é um item embutido oculto, inexistente na lista de modelos), e o primeiro envio
do filho ainda falha com ModelRequestAuthMissing.

O período de recuperação se auto-cura pelo mesmo critério: quando `readSessionModelSelection` lê uma
entry residente apontando para o Provider acelerado, ela é descartada diretamente e a sessão volta
para «não vinculada» em vez de ser completada com um modelo padrão (recuperar não equivale a iniciar
execução), e o usuário escolhe o modelo novamente. Assim, sessões já quebradas antes da correção não
continuam projetando a identidade oculta como estado selecionado na interface e como contextWindow.

O Composer Recent de nível workspace no lado do Renderer segue a mesma restrição: no payload
`sendText` do turno acelerado o `modelSelection` já foi sobrescrito pelo material de execução com o
Provider acelerado; após o aceite, o Recent precisa registrar conforme a seleção original congelada
pelo Composer antes do envio (passada explicitamente pelo chamador; por padrão, cai no valor derivado
do payload), e `captureComposerRecentSubmission` precisa pular por segurança seleções que apontam
para o Provider acelerado. No lado de leitura, `readComposerRecent`, ao encontrar um registro
existente apontando para o Provider acelerado, descarta o `modelSelection` como folha (mantendo
`mode`) e o novo rascunho cai na seleção padrão — senão, numa sessão acelerada, clicar em «新建任务»
mostraria o seletor de modelos vazio (a identidade oculta é resolvida como provider-not-found na visão
de modelos).

## 6. Ponto de carregamento das notificações globais

```text
Domain Producer
  -> GlobalNoticeStore
  -> PresentationArbiter
  -> Desktop/Mobile Surface Adapter
  -> RendererRegistry(type + schemaVersion)
  -> constrained GlobalNoticeCard shell
```

Envelope genérico:

- `noticeId`, `dedupeKey`
- `type`, `schemaVersion`
- `scope`, `priority`, `interruptPolicy`
- `createdAt`, `expiresAt`
- `payload`, `actions`
- `dismissPolicy`, `persistencePolicy`
- `source`, `revision`

Mapeamento Highspeed:

```text
type = highspeed-share
scope = user
dedupeKey = highspeed-share:latest
persistencePolicy = latest-only
dismissPolicy = cooldown 24h
dismissKey = highspeed-share
priority = normal
```

Versões de desenvolvimento antigas podem ter gravado no armazenamento persistente de nível usuário
notificações de compartilhamento `hsc_mock_*` ou `mock.z.ai`. O caminho oficial precisa descartar
automaticamente essas notificações mock legadas ao ler esse armazenamento, sem continuar exibindo-as
nem abrindo endereços mock de compartilhamento após o reinício. As notificações reais de
compartilhamento Highspeed não são afetadas.

Persiste-se apenas o snapshot de exibição mais recente:
`cardId/shareId/shareUrl/shareExpiresAt/dismissedUntilMs`. Não há nova tabela de histórico de
compartilhamento nem alteração nas tabelas de sessão. Depois que o usuário clicar ativamente no X, a
exibição global fica ausente por 24 horas; se o usuário nunca clicar no X, o cartão de
compartilhamento também precisa desaparecer automaticamente 24 horas após a publicação. O prazo de
exibição da notificação é o menor entre «horário de expiração do link de compartilhamento» e «horário
de criação da notificação + 24 horas»; com a página aberta continuamente é preciso atualizar a
visibilidade ativamente no vencimento, sem depender de reinício ou de outros eventos de notificação.
Depois do vencimento não há popup automático, e a notificação só volta a aparecer após a próxima
aceleração concluída. O compartilhamento manual histórico não encerra o silêncio nem substitui o cartão
do canto inferior esquerdo.

A persistência da notificação é uma melhoria de exibição, best-effort: o estado em memória é atualizado
primeiro, e uma falha de escrita no `localStorage` (QuotaExceeded, armazenamento desabilitado) apenas
registra um warn controlado, com os assinantes recebendo a atualização normalmente; é proibito deixar
`publish`/`dismiss` lançar erro — o chamador já fez claim do compartilhamento automático antes do
publish, e um erro deixaria um claim irrecuperável, com o usuário não vendo o cartão e sem recuperação
possível dentro do ciclo de vida atual do Renderer. Quando o próprio `localStorage` está inacessível
(modo privado, sandbox), há fallback para armazenamento em memória, e a notificação continua
disponível durante esta sessão.

## 7. Plano de Mock

Fixtures determinísticos fornecidos por transport/clock injetados via dependência:

- `hit-fast`
- `miss`
- `hit-after-timeout`
- `existing-foreign-task-card`
- `expired-card`
- `share-success`
- `share-refresh`
- `share-expired`
- `hit-invalid-model` (especial de fallback no período de criação)
- `hit-queue-edit` (especial de edição de fila do Highspeed)

O Mock substitui apenas o transport de draw/share do Highspeed, não modifica o deliveryKind da sessão
e não inicia um Agent runtime/host separado. Num acerto comum do Mock o status de negócio retornado
continua sendo `accelerated`, para validar o consumo da carta, o travamento de modelo, a marcação da
mensagem, as estatísticas e o compartilhamento; mas não pode entregar o `modelSelection` /
`modelExecution` do Highspeed — o fluxo da mensagem continua usando o provider/model comum da sessão
atual e a interface de inferência original, evitando que uma carta Mock solicite o endpoint real de
inferência Highspeed e não receba dados. Apenas duas exceções especiais entregam `modelSelection` /
`modelExecution` reais do Highspeed: a Selection de `hit-invalid-model` aponta para um modelo fora
do catálogo, para validar o fallback declarativo do período de criação; `hit-queue-edit` usa um
modelo do catálogo e um fluxo lento controlável, para validar que a fila persiste apenas a Selection
comum e que a execution temporária do Highspeed só é aplicada no limite de promoção. Nenhuma das
duas exceções altera as demais fronteiras do Mock. As cartas dos Mocks comuns não têm execution
bundle: uma entrada enfileirada durante a execução de uma Task é tratada, na promoção, conforme a
regra 9 de §3 para o «bundle indisponível», removendo a marca Highspeed e usando a Selection comum
do QueueItem. Por isso, a marca de mensagem dos Mocks comuns cobre apenas o Turn iniciado
diretamente.

Para encurtar o ciclo de validação manual local, as janelas de tempo do Mock são fixas:

- `next_draw_at` da resposta de draw com sucesso e da resposta de miss = instante de conclusão do
  draw + 2 minutos.
- `expires_at` da carta acertada que não seja `expired-card` = instante de conclusão do draw + 5
  minutos.
- `expired-card` continua retornando um horário já expirado, sem sofrer influência da janela de 5
  minutos.

```text
Mock draw/share  -> Highspeed 卡状态、标识、统计、分享
Mock send        -> 当前 session 普通 provider/model -> 原推理接口
Real send        -> Highspeed modelSelection+Execution -> Highspeed 推理接口
```

O E2E de Desktop injeta o cenário pelo arquivo de spec antes de o Electron iniciar (o `beforeSession`
do wdio escreve `ZCODE_HIGHSPEED_MOCK_SCENARIO`, com o mapa em
`test/e2e/helpers/highspeed-mock-env.ts`). O cenário de Mock é fixo dentro do processo Host e há um
cooldown de 2 minutos após o draw, portanto um arquivo de spec corresponde a apenas um cenário e
completa apenas um draw; cenários novos exigem um novo arquivo de spec com o mapeamento registrado, e
specs não registrados não recebem Mock, evitando que sessões normais sorteiem cartas por acidente. Os
casos da tabela compartilham o mesmo fluxo de preparação (credenciais de Coding Plan, escopo Team,
modelo de sessão), e o caso `hit-fast` é ao mesmo tempo o controle positivo da cadeia de elegibilidade. As
requisições de modelo mantêm o Endpoint HTTPS embutido do Team Coding Plan, com replay pelo plano de
dados de Coding Plan do wdio: na versão oficial a verificação de segurança da requisição é tratada como
indisponível, e cada rodada usa o fixture case-local conforme a marca da última mensagem de usuário. É
proibido reescrever o Provider como um HTTP Mock Endpoint — o Team Coding Plan força a verificação de
segurança da requisição da versão oficial e só aceita HTTPS; após a reescrita, todas as rodadas
falhariam na fase de model creation:

| Caso      | Arquivo de spec                                                             | Cenário             | Asserção                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HS-E2E-01 | `conversation-session-highspeed-card.test.ts`                         | `hit-fast`          | Após o acerto, a caixa de entrada entra em Highspeed, o estado final traz a marca Highspeed e a entrada se dá por `activation`; ao voltar para a Task a apresentação é por `restore` (§9.2)                                                                                                                                         |
| HS-E2E-02 | `conversation-session-highspeed-card-draw-timeout.test.ts`            | `hit-after-timeout` | O draw da primeira rodada ultrapassa o orçamento de 1s: esta rodada envia normalmente, sem marca Highspeed; a carta atrasada é mantida e a próxima rodada da mesma Task acelera direto e traz a marca Highspeed (§1, regra 6 de §3). Não se afirma o estado da caixa de entrada durante a primeira rodada: no envio inicial de um rascunho o pane pode vincular a sessão só depois que a carta atrasada chega, e apresentar essa carta via snapshot por `restore` é exibição legítima |
| HS-E2E-03 | `conversation-session-highspeed-card-draw-miss.test.ts`               | `miss`              | A primeira rodada sem sorteio e a próxima rodada dentro do cooldown enviam normalmente; a caixa de entrada nunca entra em Highspeed e não há marca Highspeed (regra 4 de §3)                                                                                                                                                   |
| HS-E2E-04 | `conversation-session-highspeed-card-admission-retains-draft.test.ts` | `hit-invalid-model` | O envio é recusado antes do ACK porque o modelo acelerado está indisponível, preservando e restaurando o texto da entrada; a carta correspondente é invalidada, o estado Highspeed é encerrado e o seletor de modelos é destravado (§2.2)                                                                                                                                             |
| HS-E2E-05 | `conversation-session-highspeed-card-fallback-unlocks-model.test.ts`  | `hit-invalid-model` | Após a falha na criação do modelo acelerado, há retorno automático ao modelo comum e a rodada conclui; a carta correspondente é invalidada, o estado Highspeed é encerrado, o seletor de modelos é destravado, mostra-se apenas um Toast de degradação e nenhum Banner de erro (§2.2)                                                                                                                  |
| HS-E2E-06 | `conversation-session-highspeed-queue-edit.test.ts`                   | `hit-queue-edit`    | Um novo envio durante a execução do Highspeed entra na fila; desfazer a edição restaura a Selection comum do Coding Plan, e o reenvio modificado continua entrando na fila; `account:*-highspeed-card` não pode aparecer no Composer, na Session nem no Banner de erro (§3 regras 8/9/15)                                                                   |

HS-E2E-04/05/06 estão atualmente em `manual-review/pending/` e ainda não foram promovidos para a CI; a
promoção segue o processo `e2e-case-lifecycle`. Antes de ser promovido, o HS-E2E-06 ainda precisa
conectar o fluxo lento da primeira rodada de `hit-queue-edit` à cadeia de requisições real: esse
cenário usa a Selection de execution do Highspeed, e a requisição vai para o endpoint de inferência do
Highspeed e não para o Team Coding Plan Endpoint; o proxy de plano de dados existente só faz replay do
segundo e não suporta o atraso em blocos `chunks/offsetMs`; sem esse replay, o caso não consegue
provar «enfileirar durante o streaming → desfazer → reenviar».

## 8. Limites multi-dispositivo e de recuperação

- O Desktop mantém `desktop-continuous`, e o Highspeed existe apenas como pré-coordenação do admission
  de envio e como `modelSelection` + `modelExecution` de turno único.
- O Web no celular continua usando `web-remote-replayable` pelo shared-host attachment; é proibido
  iniciar um runtime separado no shell Web.
- A UI de notificação global oferece ao mesmo tempo a surface da barra lateral desktop e a surface de
  tela estreita; nesta entrega é apenas um placeholder estático.
- Tasks de workspace remoto continuam usando `workspaceIdentity/remoteSessionId` do caminho original;
  o estado de Highspeed de nível usuário não pode usar `workspacePath` como key de identidade.
- O modo de entrada da caixa de entrada Highspeed é um estado de exibição local do Renderer: desktop
  `desktop-continuous` e celular `web-remote-replayable` tocam a animação de ativação apenas quando o
  path local de envio obtém um novo acerto de draw; trocar de Task, restaurar por reload ou olhar uma
  carta sorteada pela outra ponta apresenta direto o estado estável (ver §9.2). O modo de entrada não
  passa por sessão, protocolo ou sincronização de controle remoto.
- O store em memória do Renderer hidrata a partir do transcript com **merge idempotente** por
  `sourceCommandId`: campos autoritativos de estado final (`outputTokens/durationMs/divisão de
  tempo/highspeedTps/savedDurationMs`) sobrescrevem valores temporários do período de execução, e uma
  row em execução não pode limpar campos já concluídos; atualizações duplicadas, atrasadas ou de
  metadata parcial produzem apenas a notificação de store estritamente necessária, e uma nova
  hidratação idêntica não notifica. Quando o Renderer Web/celular/controle remoto registra primeiro a
  row em execução e a ponta desktop depois persiste o estado final e projeta no transcript, a nova
  hidratação precisa absorver esses campos para que o TPS de nível de carta, o tempo economizado e os
  candidatos a compartilhamento automático possam ser fechados, e o remoto não pode recalcular por
  conta própria algo divergente dos indicadores autoritativos da CLI.

## 9. Contrato visual do cartão de compartilhamento no canto inferior esquerdo

Nó do Figma: `6430-11379` (redesenho em 2026-08-31; o desenho antigo `6012:18468` está
obsoleto). O cartão de compartilhamento Highspeed na surface de notificação global segue a
implementação visual estática abaixo:

- A largura do cartão ocupa todo o slot ativo da barra lateral e a altura é fixa em `96px`, alinhada
  ao Banner de marketing; o contêiner não tem largura máxima nem padding extra. Ao redimensionar a
  barra lateral apenas o recorte de fundo muda, mantendo o tamanho do texto e dos botões, e a tela
  estreita não pode transbordar a barra lateral.
- O cartão usa raio de `12px`. O tema claro adota uma cor de fundo `#FAFAFA` próxima à do Banner de
  marketing e o traço cinza-claro do tema, com um SVG contendo apenas a marca d'água Z de baixa
  opacidade, sem gradiente prata-cinza e sem ruído; o tema escuro mantém o fundo do SVG composto
  original.
- No canto superior esquerdo usa-se a marca nominal `ZCodeWordmarkLogo` em SVG com largura `52px` e
  opacidade 60%; a linha do modelo fica a `34px` do topo e, no meio, em uma linha independente com
  `text-ui-lg` (16px por padrão) e peso 600 para destacar o nome completo do modelo
  `GLM-5.3-Highspeed`, com um ícone de raio Zap de 16px antes do nome e espaçamento de 4px, usando o
  roxo do tema; o texto usa um gradiente horizontal da família roxa do Highspeed: tema claro
  `#4830C8` → `#6041FF` → `#8955DB`, tema escuro `#9B85FF` → `#B09AFF` → `#CEACFF`, com o gradiente
  distribuído pela largura do texto; quando o recorte de fundo do texto não é suportado, há fallback
  para a cor de texto do tema. Abaixo, com `text-ui-base` (14px por padrão), exibe-se o texto
  secundário 「分享你的加速时刻」 (em inglês, `Share your speedup`). No canto inferior direito mantém-se o
  botão `View`, com `text-ui-base` (14px por padrão) e altura de 24px; o texto secundário reserva
  espaço para o botão, e o transbordo em tela estreita é omitido.
- O botão `View` no canto inferior direito tem um ícone de olho e, ao clicar, abre o popup de
  compartilhamento (`HighspeedShareDialog`) com as estatísticas de aceleração. O cartão de
  compartilhamento do canto inferior esquerdo só é publicado quando os dados agregados em nível de
  carta estão completos e a taxa geral de aceleração é estritamente maior que `1.2x`; sem dados ou
  fora do critério (≤`1.2x`) o cartão do canto inferior esquerdo não é publicado (a portão de
  publicação tem o mesmo critério desta botão; ver
  `highspeedTurnStore.listHighspeedCardAutoShareCandidates`). Portanto, uma carta publicada sempre
  satisfaz a elegibilidade e o botão `View` é sempre renderizado. Para garantir isso, o payload da
  notificação precisa carregar fatos de métricas com **exatamente a mesma precisão** da portão de
  publicação: `durationMs`, `savedDurationMs` (em milissegundos, sem arredondar) e `tokenUsage`; dentro
  do componente esses campos em milissegundos ainda passam pelo mesmo `isHighspeedShareEligible` como
  defesa em profundidade, e nenhum dado não confiável ou fora do critério pode entrar no popup de
  compartilhamento. **O lado de renderização do cartão não pode reavaliar a elegibilidade com base em
  campos de precisão de exibição (valores arredondados em segundos)**: houve um payload que só
  carregava campos em segundos como `ceil(duration)` / `round(saved)`, e reconstruir a taxa a partir dos
  segundos no lado de renderização subestima sistematicamente na fronteira `(1.2, ~1.25]` (por exemplo,
  6100ms/1225ms reais dão 7325/6100≈1.2008x → reconstrução 8/7≈1.14x), ocultando o `View` de uma
  carta já publicada. Valores de exibição em segundos só podem ser derivados dos campos em
  milissegundos no momento da renderização; apenas payloads legados com menos de 24h podem ser lidos
  com fallback `×1000`. Aqui há uma diferença deliberada em relação ao footer do fim do grupo (§10):
  quando o footer não atinge o critério ele ainda é exibido e apenas esconde o botão, enquanto o cartão
  de compartilhamento do canto inferior esquerdo simplesmente não é publicado. O endereço de
  compartilhamento, o share id e a cadeia de cópia do shareUrl correspondente foram removidos do
  compartilhamento Highspeed (ver `docs/highspeed-share-client-generated.md`).
- O botão de fechar no canto superior direito fica a `10px` do topo e da direita, sempre visível tanto
  no desktop quanto em tela de toque; compartilha com o Banner de marketing o botão circular `ghost` /
  `icon-xs` e o tamanho de ícone, sem cor de fundo por padrão, com contraste maior no hover e
  preservando o anel de foco do teclado. Continua acionando a regra de silêncio de 24 horas das
  notificações globais.
- Nesta entrega são implementados apenas o layout estático e os estados básicos de usabilidade como
  hover/focus; nenhuma animação é implementada.
- Sob os temas Light/Dark/Zai o cartão usa respectivamente o SVG de marca d'água clara e a imagem de
  fundo do design escuro; o layout periférico continua usando a surface de sidebar existente.

```text
card expires_at reached -------+
                               +--> aggregate card metrics --> GlobalNoticeStore latest-only snapshot
all accelerated Turns complete +
                                                                          |
                                                                          +--> View opens HighspeedShareDialog (copy image / copy text)
                                                                          +--> Close starts 24h display cooldown
```

### 9.1 Tempo de trabalho do output acelerado

Nó do Figma: `6076:8300`.

- O texto continua reaproveitando `chat.history.workedFor` / `chat.history.workingFor` e a lógica
  existente de formatação de duração.
- O texto de tempo de trabalho do turno Highspeed usa `text-ui-base`, `font-medium`, `leading-5` e a
  cor semântica `icon/purple` (`#9E77ED`).
- O estilo de tempo de trabalho dos turnos comuns não muda; mensagens de input não exibem marca visual
  Highspeed.
- Mantêm-se os comportamentos existentes de colapso, foco de teclado, seta e responsividade; não há
  um segundo conjunto de componentes de history copiado para o Highspeed.

### 9.2 Caixa de entrada Highspeed

Nó do Figma: `6076:8306`.

- O resultado Highspeed antes do envio é montado de forma unificada pelo coordenador de envio do lado
  da UI: o mesmo `prepareTurn` produz simultaneamente a cobertura do payload do comando existente e o
  snapshot da carta necessário às estatísticas do Renderer; o caminho de envio comum não pode chamar
  nem reinterpretar separadamente o resultado do admission. O coordenador não assume a admissão final
  de execução; a CLI continua responsável pelas validações autoritativas de active turn, fila,
  automation, runtime model e validade da carta.
- Continua-se reaproveitando o `ConversationComposer` / `ChatPromptEditor` existente, sem novos
  estados de input, envio ou modelo.
- Quando a carta Highspeed está vigente, a caixa de entrada usa raio de `16px`, contorno roxo Highspeed
  e um brilho externo roxo discreto; o fundo continua usando a surface `input` do tema, compatível com
  claro, escuro e Web no celular.
- Enquanto a carta Highspeed estiver vigente, o círculo de uso de tokens de contexto da barra de
  ferramentas da caixa de entrada é ocultado; com o cartão expirado ou inválido, ele volta junto com o
  estado comum da caixa de entrada. Essa regra altera apenas a exibição, não limpa os dados de usage e
  não afeta a cadeia de estatísticas de context usage do desktop nem do Web no celular.
- Não se exibe uma tag `Fast` adicional, para não alterar o ponto de partida do texto digitado. No
  estado comum continua sendo renderizado o `ModelConfigSelect` interativo; após a transição visual
  Highspeed ele é substituído por uma identificação de modelo somente leitura, sem menu suspenso, sem
  atalhos de troca e sem interação falsa de disabled. A identificação somente leitura usa
  `packages/ui/src/assets/highspeed/lightning.svg` como ícone de raio, com destaque roxo, e mostra o
  `card.model` da resposta do draw acrescido de `HighSpeed`; ao passar o mouse sobre o modelo, um
  Tooltip internacionalizado exibe apenas 「原模型：{model}」, onde `model` é o nome completo de exibição
  do modelo do config de session/draft de antes do Highspeed vigorar. O tempo restante é exibido,
  conforme o Figma `6076:8334`, como um controle `HH:MM:SS` de largura fixa, com a ordem fixa
  «modelo → contagem regressiva → Think»; o ícone de despertador não executa animação de balanço, o
  texto de tempo usa algarismos de largura uniforme e largura fixa, apenas uma camada de texto nítido
  é renderizada e nenhum brilho externo é adicionado, evitando que a atualização de segundos cause
  tremor de layout. Abaixo do breakpoint de container `xl`, o composer colapsa junto com o Think: no
  modelo só permanece o ícone de raio e na contagem só permanece o ícone de relógio, ocultando
  `HH:MM:SS`; ao passar o mouse sobre o relógio, mostra-se o tempo restante em tempo real, evitando
  sobreposição dos controles da barra de ferramentas.
- O estilo da caixa de entrada comum não muda; após o Highspeed expirar, o estilo comum é restaurado
  automaticamente conforme o estado autoritativo da carta.
- Quando o Highspeed expira ou a carta não pertence à Task atual, a entrada de modelo volta a exibir o
  modelo do session/draft config; essa troca de exibição não pode reescrever o modelo residente da
  sessão.
- Depois que a carta vira vigente, após `500ms` toca uma única vez uma textura material de baixa
  resolução em roxo que se expande do centro da caixa de entrada para todas as direções; o trecho final
  da expansão dispara a rolagem para cima do nome do modelo e, em seguida, o Canvas faz o fade out com
  partículas fazendo fade in para concluir a transição. O estado estável exibe continuamente as
  partículas roxas, o contorno `#6041FF` e quatro camadas de brilho roxo, sem alterar a altura da caixa
  de entrada nem a ordem do DOM de negócio. O brilho das partículas precisa ser pré-renderizado uma
  única vez em um Canvas offscreen e reutilizado como sprite; a desenho quadro a quadro do estado
  estável é proibido chamar `shadowBlur`, evitando que a rasterização de sombra por software ocupe
 o thread principal do Renderer por muito tempo.
- A cor de base da expansão de pixels vem de `--color-highspeed-composer-surface` (claro `#FFFFFF`,
  escuro `#151515`) e o roxo vem de `--color-highspeed-accent`; o processo de expansão no tema claro
  não pode exibir mosaico escuro. Restrição de regressão: a build de produção comprime cores com o
  Lightning CSS (por exemplo `#ffffff` → `#fff`, e também pode reescrever como nome de cor), então o
  Canvas precisa entregar o token à normalização do navegador antes de fazer o parsing, e não pode
  usar um parser manual que só reconheça hex de 6 dígitos; só quando o token está ausente ou não pode
  ser interpretado é usada a cor escura de fallback. O Canvas ignora silenciosamente valores que não
  pode interpretar (como `var()`, que o `CSS.supports` aceita) e mantém o `fillStyle` anterior; não é
  possível decidir se o parsing deu certo apenas olhando a leitura depois de uma única atribuição, ou a
  cor preta padrão ou a cor do token anterior seria enganada como resultado.
- Durante a transição de ativação não pode piscar nenhum contorno derivado de `currentColor`.
  Restrição de regressão: no Tailwind v4, quando o shell de input não declara `border-color`
  explicitamente, ele cai para `currentColor` (quase branco no tema escuro), e no instante da ativação a
  `border-width` saltando de `0` para `1px` faz o `border-color` passar desse quase branco para
  `transparent`, piscando um contorno branco. É preciso ancorar o `border-color` de
  `.chat-composer-input-surface` em `transparent` como ponto de partida da transição, garantindo que o
  contorno seja sempre transparente antes e depois da ativação, com o contorno roxo entrando por
  smoothly apenas depois de atingir o estado stable.
- Ao trocar para Highspeed não pode piscar um canto quadrado. Restrição de regressão: na ativação o
  shell de input interno troca de `rounded-2xl bg-input` para `!rounded-none !bg-transparent`, onde o
  `rounded-none` passa a valer instantaneamente e a classe base `transition-colors` faz o fundo
  `bg-input → transparent` graduar por cerca de `150ms`; nesse instante o shell interno ainda é um
  quadrado com cor de fundo, e os quatro cantos afloram para fora do raio do shell externo formando um
  pico que some quando o fundo desaparece. A classe de cobertura do shell interno do Highspeed precisa
  trazer `!transition-none`, para que o fundo troque instantaneamente e nenhum canto apareça no instante
  da troca (sob o Highspeed o shell interno é sempre transparente e sem borda, sem necessidade de
  transição de cor).
- A rolagem do modelo usa deslocamento vertical, inversão no eixo X e transição de opacidade com
  `400ms cubic-bezier(0.55, 0, 0.45, 1)`; após concluir e por `1500ms` em repouso, toca uma única vez uma
  luz varrida roxa horizontal. A contagem regressiva faz apenas um leve deslocamento para cima com fade
  in, sem participar da animação de atualização por segundo.
- A animação de ativação pertence exclusivamente ao novo acerto de draw no path de envio local: só é
  tocada uma vez, conforme descrito acima (expansão de pixels, rolagem do modelo, luz varrida, entrada da
  contagem regressiva e gradiente de contorno e brilho — modo de entrada `activation`), quando
  `prepareTurn` retorna accelerated e aquele `cardId` ainda não havia sido apresentado no SessionPane
  atual. Todas as outras apresentações são `restore` e mostram direto o estado estável: sem montar o
  Canvas de expansão, com a identificação de modelo e a contagem regressiva aparecendo já paradas, sem
  luz varrida, sem transição de contorno e brilho e com as partículas desenhadas direto do estado
  estável em loop, e não emergindo uma a uma do campo vazio. `restore` cobre os seguintes cenários de
  aceite: voltar para uma Task Highspeed; remontagem do composer dentro da mesma Task (por exemplo,
  sair do modo de compartilhamento); restauração via `getSnapshot` após reload do Renderer; envio
  contínuo com a mesma carta, ou envio após voltar; cartas sorteadas pela outra ponta (como o Web no
  celular) ou em segundo plano apresentadas pela primeira vez na restauração local. Restrição de
  regressão: a cadeia de restauração e o acerto de draw compartilham o mesmo caminho de renderização do
  snapshot da carta, e o composer ainda reutiliza a mesma instância entre Tasks; se a animação fosse
  disparada por «a carta apareceu», ao voltar a camada de fundo remontaria a partir de `diffusing` e a
  transição da casca de input já existente seria disparada novamente, se manifestando como animação repetida. Por
  isso o SessionPane registra uma solicitação de ativação de uso único no path de envio, e o composer
  trava o modo de entrada por `cardId` e o consome imediatamente, sem repetir em remontagens
  posteriores. O ponto de partida do envio é congelado na fase síncrona em que o usuário dispara o envio
  (antes de qualquer espera assíncrona como barreiras de configuração, prontidão do modelo de rascunho,
  recomendação de Start, criação de sessão vazia): registra-se a Task vinculada ao pane no momento, ou o
  rascunho. Quando o resultado do prepare retorna, a apresentação e o registro da ativação só ocorrem
  quando o pane está exibindo atualmente a Task à qual a carta pertence, ou quando o ponto de partida do
  envio era um rascunho e o pane ainda está no mesmo rascunho (a sessão criada no primeiro envio ainda
  não foi vinculada de volta ao pane); caso contrário, a carta retornada continua sendo usada neste
  envio, mas não é apresentada no pane atual nem registra ativação, sendo apresentada por snapshot via
  `restore` ao voltar para a Task correspondente. Cenários de aceite: após o envio em A, trocar para B
  antes de o resultado retornar — a caixa de entrada de B não mostra a carta de A nem toca a ativação;
  A → B → A com o resultado já retornado em A é a primeira apresentação no path de envio local, tocando
  como `activation`; se ao retornar o resultado ainda se está em B, ao voltar para A a apresentação é
  `restore`.
- Com `prefers-reduced-motion: reduce` a expansão de pixels, a rolagem e a luz varrida são puladas,
  apresentando direto o material estável; as partículas param em um segmento estático intermediário.
  Esses estados derivam apenas do `HighspeedCardSnapshot` atual e da solicitação de ativação de uso
  único local do Renderer; nada é gravado na sessão, na fila, no protocolo ou nas estatísticas de
  compartilhamento, e a lógica de draw, envio, fallback, expiração e compartilhamento não muda.

### 9.3 Footer de origem do output acelerado

Nó do Figma: `6012:18573`.

- A mesma carta Highspeed pode cobrir vários turnos accelerated consecutivos; esses turnos formam um
  intervalo de aceleração com identidade `cardId`. Só depois que a contagem regressiva da carta
  termina e a output do último turno atual entra em estado final é exibido, uma única vez, «以上由
  Highspeed 生成» e o botão «分享». O estado final inclui conclusão normal, interrupção pelo usuário e
  falha anômala; o footer não pode desaparecer por o fato de o último turno não ser um estado de
  sucesso.
- O footer é decidido pelo conjunto da carta inteira ter produzido output: assim que qualquer turno
  accelerated da carta tenha produzido assistant text, reasoning, output de tool/subagent ou
  `outputTokens > 0` persistido, o footer é exibido no estado final do grupo; somente quando todos os
  turnos accelerated da carta não têm output algum ele não é exibido.
- Quando aparece um novo turno accelerated na mesma carta, o footer se move do fim do grupo antigo para
  o novo fim de grupo; `cardId` diferentes mantêm cada um o seu footer. Turnos comuns e o turno de fim
  de grupo ainda em geração não exibem footer.
- Enquanto a contagem regressiva da carta estiver em andamento o footer não é exibido; a fronteira de
  expiração é disparada pelo relógio de tempo da sessão, sem exigir que o usuário envie outra mensagem. O
  relógio de expiração se baseia em `setTimeout` do renderer, e o congelamento da página/travamento do
  timer quando a janela está oculta ou encoberta é uma limitação da plataforma. Há aqui três
  compensações complementares de reativação de janela, todas escutando `visibilitychange` (quando volta a
  ficar visível) e o `focus` da janela, compensando imediatamente ao voltar, sem depender de nova
  mensagem ou evento de snapshot e sem disparar ao mudar para o estado oculto: a primeira é o relógio de
  exibição do footer de fim de grupo do ConversationTimeline (`liveNowMs`), que ao voltar à janela se
  iguala ao horário atual, fazendo o footer de cartas já expiradas aparecer imediatamente; a segunda é
  a compensação do SessionPane que dispara uma vez a cadeia de agregação de expiração (amostragem de
  TPS de nível de carta → persistência do estado final → disponibilidade da entrada de
  visualizar/compartilhar), tornando os dados de estado final dos botões de visualizar/compartilhar
  disponíveis; a terceira é o relógio de expulsão do estado acelerado do SessionPane — durante a
 a parada do `setTimeout` de expiração de `activeHighspeedCard`, ao voltar, se já estiver expirado pelo
  relógio real a carta é limpa imediatamente (a visual de aceleração da caixa de entrada e o travamento
  de modelo saem junto) e, se não estiver, o timer é remontado com a duração restante; quando o timer
  dispara, a decisão também é tomada pelo relógio real, e se disparar cedo demais por desvio entre o
  relógio monotônico e o relógio de parede (ou um retrocesso do NTP), com o relógio de parede ainda não
  expirado o timer é remontado com a duração restante, sem parar a expulsão por causa disso. Restrição
  de regressão: a contagem regressiva do composer é um interval que lê `Date.now()` a cada segundo e se
  auto-cura ao voltar; sem compensar na limpeza da carta, apareceria uma carta zumbi do tipo «倒计时已
  到 00:00:00 但输入框加速态不消失», que só se recuperaria no prepareTurn da próxima mensagem. Todas as
  entradas da cadeia de agregação (amostragem healthy, persistência de métricas, compartilhamento
  automático) têm proteção de claim/idempotência, então repetir a compensação não tem efeito colateral.
- O footer usa uma linha divisória fraca atravessando a largura do conteúdo, com texto e botão
  centralizados sobrepostos à linha; fundo, borda, texto e hover usam todos tokens semânticos do tema,
  compatíveis com claro, escuro e Web no celular.
- O texto usa `text-ui-base`; o botão reaproveita o `Button` compacto e o ícone de external-link, sem
  copiar uma nova interação de compartilhamento.
- O botão de compartilhar continua chamando a lógica de share da carta Highspeed atual. Quando o
  Renderer atual tem métricas de estado final, a agregação é por `cardId`; na recuperação a frio
  também são agregados os metadados de estado final persistidos de todos os turnos daquela carta, e
  não apenas o turno de fim de grupo. Faltando métricas confiáveis ou com a taxa geral de aceleração
  não maior que `1.2x`, o footer continua sendo exibido, mas o botão é ocultado, e é proibido
  construir estatísticas não confiáveis.
- O footer modifica apenas o intervalo de output do assistant da carta inteira; o input do usuário
  continua com o estilo de mensagem comum.
- Enquanto o output acelerado ainda está sendo gerado, dentro do turno todos os textos de respiração
  com gradiente que reaproveitam `animated-gradient-text` — «思考中…», ferramentas em execução, retry
  etc. — usam uniformemente a cor semântica `icon/purple`; turnos comuns e turnos accelerados já
  encerrados mantêm as cores existentes.

### 9.4 Tempo economizado do output acelerado

Nó do Figma: `6079:8738`.

- À direita do «已工作» de cada output Highspeed é exibida a tag `HighSpeed`; outputs comuns não a
  exibem. «节省约 {duration}» só pode ser exibido depois que o output deste turno entra em estado final e
  o meta de estado final é persistido; durante a geração é proibido exibi-lo antecipadamente.
- É proibido usar constantes fixas como linha de base da velocidade comum. Antes de enviar um turno
  acelerado, um método leve de health apenas solicita os dados de 7 dias de
  Coding Plan `/model-performance-day`, lê o `proMaxDecodeSpeed` válido positivo mais recente e grava
  esse valor amostrado na meta da mensagem Highspeed; é proibido buscar quota, activity, usage detail
  ou dados de health de 30 dias só por causa do TPS.
- O método leve de health é cacheado por 5 minutos na camada de Service, por provider, contexto de
  time e fuso horário, e funde requisições concorrentes com a mesma key; o Renderer não mantém mais um
  segundo cache de TPS. Essa leitura, no caminho de envio, só pode aguardar de forma best-effort
  `min(300ms, 1s 发送预算剩余)` (ver regra 12 de §3): em timeout, este turno não grava `regularTps` nem
  mostra o tempo economizado; a requisição não é cancelada e é cacheada pelo Service para o próximo
  turno acertar direto.
- Enquanto a carta é válida, a CLI acumula `outputTokens` no `turnHeader` correspondente, e o Renderer
  só lê esse valor autoritativo e o tempo real de trabalho quando o Turn é concluído, sem exibir o
  tempo economizado antes. Com o cartão expirado, chama-se uma única vez
  `/api/v1/highspeed/:card_id/healthy`, obtendo a velocidade média alta em nível de carta por
  `highspeedTps = completion_tokens / duration_seconds`; se na expiração o último turno ainda estiver
  gerando, esta amostragem é mantida e só é feita uma nova consulta ao fim do último turno quando a
  amostragem não tiver valor positivo válido ou a requisição falhar.
- O tempo economizado de cada Turn concluído é calculado preferencialmente pela divisão real de tempo
  persistida pela CLI:
  `modelSpeedup = highspeedTps / regularTps`,
  `savedDurationMs = max(0, round(toolDurationMs + otherDurationMs + modelDurationMs × modelSpeedup − (modelDurationMs + toolDurationMs + otherDurationMs)))`.
  O significado do critério: as esperas de ferramentas e outras não encurtam por causa da troca de
  velocidade do modelo; apenas o intervalo de inferência do modelo é convertido de volta ao critério
  comum pelo fator. É preciso ter `modelDurationMs` e `toolDurationMs` válidos simultaneamente para usar
  esse critério; quando `otherDurationMs` está ausente, ele é derivado por
  `max(0, durationMs − modelDurationMs − toolDurationMs)`.
- Em um turno misto, só o tempo das requisições de modelo realmente executadas pelo provider
  `highspeed` pode entrar no cálculo de economia Highspeed de `modelDurationMs`; requisições do
  provider comum após a expiração da carta, novas tentativas de modelo comum e suas esperas não podem
  ser contadas como tempo de modelo Highspeed. `durationMs` continua representando o tempo real de
  trabalho do Turn completo, e as esperas de ferramentas e outras mantêm o critério original.
- Quando as mensagens históricas não têm a divisão real, há fallback para a estimativa 20/80:
  `highspeedShare = 0.2 + 0.8 / modelSpeedup` (assumindo que, no critério comum, ferramentas e outras
  esperas ocupam 20% e a inferência do modelo 80%),
  `savedDurationMs = max(0, round(durationMs / highspeedShare − durationMs))`. Essa estimativa é
  apenas um plano de contingência e é proibido depender dela na nova cadeia.
- Os turnos da mesma carta compartilham o `highspeedTps` em nível de carta. `regularTps`,
  `outputTokens`, `durationMs`, a divisão real de tempo `modelDurationMs/toolDurationMs/otherDurationMs`,
  `highspeedTps` e `savedDurationMs` são persistidos como fatos opcionais de estado final do mesmo
  meta Highspeed; `savedDurationMs` precisa ser calculado e gravado no mesmo lote da divisão, e é
  proibido gravar em banco uma divisão já persistida e ainda assim usar a estimativa 20/80.
- `outputTokens` precisa vir do valor acumulado de Turn único na projeção autoritativa do
  `turnHeader` da CLI: a cada `ModelComplete` do caminho principal, o output usage desta rodada é
  somado ao Turn correspondente, e subagent, sidecar e outros Turns não podem se misturar. O Renderer é
  proibido de derivar tokens de Turn único observando o estado transitório `running` ou subtraindo o
  cumulative usage em nível de sessão; quando a atualização do desktop continuous é agrupada e quando o
  celular replayable já restaura direto o estado final na primeira vez, ainda é preciso obter o mesmo
  resultado.
- Os fatos (`outputTokens`, `durationMs`, divisão real de tempo) são fornecidos autoritativamente pelo
  `turnHeader` da CLI; `savedDurationMs` é calculado uma única vez pelo primeiro Renderer que concluir e
  persistir, pelo critério acima, escrito no transcript pelo comando `setHighspeedMetrics`, e a CLI o
  persiste publicando um evento dinâmico para a mesma user row. A exibição do desktop
  `desktop-continuous` e do celular `web-remote-replayable` consome apenas o mesmo fato projetado, sem
  recalcular por conta própria; só quando mensagens históricas não têm os campos persistidos é feito um
  fallback estimado na agregação.
- Quando o healthy em nível de carta falha ou retorna valor zero, há no máximo uma nova consulta após a
  conclusão do último turno; ainda assim em caso de falha, pode-se reutilizar o TPS em nível de carta de
  uma amostragem bem-sucedida anterior daquela carta. Sem nenhum valor positivo válido, ou sem os
  campos de estado final nas mensagens históricas, não se exibe tempo economizado, e é proibido
  recorrer a um TPS fixo.
- A linha de status usa texto `icon/purple` e uma linha divisória fraca de 32%; à esquerda, a duração de
  trabalho mantém `text-ui-base` e, à direita, o tempo economizado e a tag usam `text-ui-sm`. Em tela
  estreita a linha de status pode quebrar, mas não pode cortar a informação essencial.

### 9.5 Prioridade do slot compartilhado com o Banner de marketing «领 token»

O rodapé do canto inferior esquerdo da barra lateral mantém **apenas um slot de exibição ativo**,
compartilhado entre o cartão de compartilhamento Highspeed (notificação global `highspeed-share`) e o
Banner de marketing «领 token» (`resource_position === "banner"`, ação `claim_zcode_plan`). Quando os
dois acertam ao mesmo tempo, **são colapsados na mesma posição, com o Banner «领 token» por cima**;
só depois que o Banner «领 token» desaparecer ou for fechado é que o cartão de compartilhamento
Highspeed é exibido na mesma posição.

- A prioridade é fixa em **Banner «领 token» > cartão de compartilhamento Highspeed**. A visibilidade
  de cada um continua sendo controlada exclusivamente pelo seu próprio store: o Banner de marketing
  pertence ao `marketingTouchController` e o cartão de compartilhamento Highspeed ao
  `browserGlobalNoticeStore`. O slot apenas projeta de forma somente leitura qual renderizar, sem copiar
  um segundo estado e sem adicionar timers.
- O julgamento de «visível» do Banner reaproveita o único predicado do lado de marketing,
  `isMarketingBannerRenderable` (`banner && resource_position === "banner" && (image ||
  bannerHero)`); durante o período `pending` da reivindicação o Banner continua presente e o Highspeed
  continua cedendo lugar.
- Os caminhos de desaparecimento do Banner (`closeBanner()` deixando vazio / retirada pelo servidor /
  ausência de entrega após o fim do pending) tornam `bannerVisible` falso, e o cartão de
  compartilhamento Highspeed volta a ser exibido **no mesmo slot**, desde que ainda esteja na janela
  de visibilidade de 24h de §6 e não esteja em cooldown de dismiss.
- Durante a cessão, a contagem de 24h do Highspeed **não é pausada**: sua validade é muito maior que o
  tempo de vida do Banner e, depois que o Banner é fechado, `getVisible()` continua filtrando
  expiração/cooldown conforme §6, sem introduzir corrida; o julgamento de expiração e a atualização
  seguem a lógica existente de §6 e de `GlobalNoticeSurface`.

```text
marketingTouchController.banner 可见? ─┐
                                       ├─▶ SidebarBottomActivity（只读仲裁）
browserGlobalNoticeStore.highspeed 可见?┘        │
                                                 ├─ Banner 可见 → 渲染领 token Banner（覆盖在上）
                                                 └─ 否则       → 渲染 Highspeed 分享卡
                                                            （统一槽位 = footer banner 槽）
```

## 10. Fora do escopo desta entrega

- Animação de partículas em movimento, efeitos aguardando confirmação de material de UI e interações
  adicionais fora do desenho visual final.
- Lista de histórico de notificações, contadores de não lidas, marcar tudo como lido em lote,
  carrossel de múltiplas cartas e Inbox genérico no servidor.
- Tabela de histórico de compartilhamento ou campos na tabela de sessão.