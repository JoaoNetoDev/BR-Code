# Exibição do estado de edição de tarefas agendadas

## Objetivo

Depois que uma tarefa agendada entra na página de edição, a aba `Settings` precisa exibir o estado atual da tarefa no topo do formulário, para que o usuário possa confirmar se a tarefa ainda está em execução antes de modificar título, agendamento e instruções.

## Sincronização de idioma do título padrão na página de criação

Ao criar uma nova tarefa agendada sem um rascunho de template, o campo Task title usa o título localizado padrão da interface atual. Depois que o usuário alterna entre chinês e inglês na página de criação, a caixa de entrada que mantém esse valor automático padrão deve trocar imediatamente para o idioma de destino, evitando que o restante da página já tenha mudado enquanto o título continua no idioma antigo.

- Sincronizar apenas o título padrão preenchido automaticamente pela página de criação; títulos modificados manualmente pelo usuário, títulos vindos do template More ideas e títulos de tarefas já salvas são dados do usuário e não podem ser sobrescritos ao trocar de idioma.
- Sincronizar o título padrão não é edição do usuário: não pode marcar o formulário como dirty, não pode disparar a confirmação de saída com alterações não salvas e não pode resetar prompt, agendamento, projeto, modelo ou nível de raciocínio.
- Esse comportamento é compartilhado por `AutomationEditView` entre desktop e Web comum; não toca no scheduler, na persistência de tarefas nem na cadeia replayable do `/remote` no celular.

## Semântica de âncora para intervalos em minutos

Quando o usuário expressa "a cada N minutos", a semântica do produto é contar a partir do momento da criação da tarefa ou da última modificação do agendamento, não disparar antecipadamente conforme os minutos do relógio do cron padrão. `*/N * * * *` continua sendo salvo como expressão de exibição compatível, mas o agendamento deve salvar simultaneamente `unit = minute`, `interval = N` e `anchorAt`, e calcular o tempo com `scheduleRule` como autoridade.

```text
11:46 create "every 10 minutes"
  -> anchorAt = 11:46
  -> first run = 11:56
  -> next runs = 12:06, 12:16, ...

not:
11:46 create -> cron wall-clock tick 11:50
```

- Ao criar uma nova tarefa, `anchorAt` corresponde ao momento em que a camada de serviço realmente recebeu a requisição de criação.
- Ao alterar o agendamento para "a cada N minutos", `anchorAt` é redefinido para o momento desta alteração, e a primeira execução ocorre N minutos depois.
- Quando o scheduler atrasa a verificação ou o despacho, as execuções seguintes continuam avançando com o mesmo `anchorAt`, sem acumular deriva em relação ao horário real de despacho.
- As demais regras de horário fixo (dia, semana, mês, ano) continuam usando o calendário local, sem alterar sua semântica de relógio de parede.

## Cron compatível para intervalo mensal customizado

"A cada N meses" é expresso por `scheduleRule = { unit: monthly, interval: N, ... }`, e `scheduleRule` é a fonte autoritativa para calcular a próxima execução. O campo de mês do cron de cinco segmentos só pode usar `1-12`; não é possível escrever um N arbitrário como `*/N`. Por exemplo, "a cada 29 meses" escrito como `*/29` falha na etapa de validação do cron em `AutomationService.create`.

```text
UI: every 29 months on day 1 / 15 / 16 at 09:00
      |
      +-- cronExpr ----------> 0 9 1,15,16 * *   (expressão mensal candidata válida)
      |
      +-- scheduleRule ------> unit=monthly, interval=29, monthDays=[1,15,16]
                                      |
                                      v
                           authoritative next-run calculation
```

- O cron compatível de regras mensais customizadas usa sempre `month = *`, mantendo apenas minuto, hora, dia do mês ou primeiro dia da semana; o intervalo mensal não é codificado no cron.
- A criação e a atualização continuam devendo salvar `scheduleRule`, e o scheduler continua calculando o horário real de disparo a partir de `scheduleRule`, sem despachar pela frequência candidata mensal do cron compatível.
- Os cartões da página de administração e o resumo da página de edição devem priorizar `scheduleRule`; o fallback para analisar `cronExpr` só ocorre quando registros antigos não têm `scheduleRule`. Por isso, "a cada 30 meses" não pode ser exibido como "mensal" por causa do `month = *` do cron compatível.
- Essa regra cobre toda a faixa de intervalo permitida pela UI e não gera cron inválido por `N > 12`; desktop e Web comum compartilham o mesmo builder, e o `/remote` no celular não ganha lógica de agendamento independente.
- `scheduleRule` é um fato de domínio. Antes de gravar no banco, `AutomationService` deve validar `interval` inteiro positivo, o intervalo de hora/minuto e os campos de data obrigatórios da unidade; regras mensais permitem no máximo um intervalo de 1200 meses. Regras inválidas devem ser rejeitadas por completo: não se pode depender da função de cálculo arredondar silenciosamente, preencher padrões ou retornar `null`, sob pena de persistir uma tarefa ativa que nunca terá `nextRunAt`. O limite legítimo de 1200 meses ainda precisa ser capaz de calcular a próxima rodada, sem ser truncado antes pela busca do limite superior.

## Reflexão do agendamento para tarefas originadas de sessão

O editor deve decidir se assume a regra de agendamento com base na origem da tarefa, e não se o cron atual por acaso pode ser interpretado pelo builder da UI. Tarefas com `targetTaskId` não vazio são consideradas de origem de sessão: mesmo que a regra seja um intervalo de minutos interpretável como `*/10 * * * *`, a página de edição exibe apenas a linha somente-leitura "Personalizado", sem controles de frequência, ícone de agendamento, próxima execução, e sem abrir o diálogo de repetição customizada.

```text
open existing automation
          |
          v
targetTaskId is non-empty? ---- no ----> UI schedule builder
          |
         yes
          v
read-only "Custom" schedule
          |
          +-- edit another field --> preserve cron + scheduleRule unchanged
          |
          +-- remove schedule -----> empty schedule
                                          |
                                          v
                                 UI schedule builder
```

- A determinação de origem de sessão usa apenas `targetTaskId`, sem depender da capacidade de visualização do cron nem do conteúdo de `scheduleRule`.
- Enquanto o agendamento somente-leitura não for removido, salvar título, instruções, modelo e outros campos deve preservar exatamente o `cronExpr` e o `scheduleRule` existentes; apenas abrir e voltar também deve manter o formulário clean.
- Somente depois que o usuário remove a linha "Personalizado" é que o fluxo padrão de agendamento da UI é assumido, permitindo redefinir a tarefa com regras suportadas pela UI.
- Tarefas originadas da UI não são afetadas; o mesmo cron de minutos continua sendo exibido e editado pelo builder existente.
- Essa regra afeta apenas o formulário de edição do desktop e da Web comum; não altera o scheduler, o fluxo de mensagens continuous do desktop nem a fronteira de restauração replayable do `/remote` no celular.

## Origem do estado

A página de edição exibe apenas o estado somente-leitura e não altera o ciclo de vida dentro do formulário. A determinação do estado reutiliza a semântica da página de listagem:

```text
automation.lifecycleStatus / enabled
        |
        v
+-----------------------------+
| failed / completed terminal |
+-----------------------------+
        | no
        v
+-----------------------------+
| paused or enabled = false   |
+-----------------------------+
        | no
        v
+-----------------------------+
| active                      |
+-----------------------------+
```

- `failed` e `completed` têm prioridade sobre `enabled`, porque são estados terminais.
- `paused` inclui `lifecycleStatus = paused` ou `enabled = false`.
- Nos demais casos, exibe-se `active`.

## Restrições de UI

- As páginas de criação/edição exibem a área completa de título abaixo do breadcrumb e acima das abas Settings/History: no modo de edição o título principal fixo é "Editar tarefa agendada"; na criação, "Nova tarefa agendada". O nome específico da tarefa aparece apenas no breadcrumb, evitando duplicação. O estilo do título principal é `text-ui-xl font-semibold`. Abaixo do título principal aparece um subtítulo dinâmico: na criação, explica a configuração do horário de execução, das instruções e da forma de execução; na edição, explica o ajuste dos mesmos conteúdos. O subtítulo usa `text-ui-base` e cor de texto secundária. Os textos fixos devem ser internacionalizados.
- Exibido apenas ao editar uma tarefa agendada existente; uma nova tarefa não tem estado persistido, então essa linha não é mostrada.
- Usar tokens semânticos para o ponto de estado e o texto: active usa success, paused usa warning, failed usa destructive e completed usa texto fraco.
- A linha de estado usa um layout compacto de campo de formulário, compatível com a quebra de linha em telas estreitas do desktop e do Web no celular.
- Os textos de estado passam por i18n, sem inglês ou chinês fixo em código.

## Confirmação de saída com alterações não salvas

Antes de voltar da página de edição para a listagem, é preciso verificar se o formulário tem alterações não salvas. O diálogo protege apenas os campos que seriam salvos, evitando falsos positivos ao apenas abrir a página ou alternar para a aba History.

```text
User clicks breadcrumb back
        |
        v
+-------------------+
| form dirty?        |
+---------+---------+
          |
    no    | yes
    v     v
  back  Unsaved Changes dialog
          |
          +--> X / overlay / Esc: close dialog, stay on edit page
          |
          +--> Discard: abandon local form changes and back
          |
          +--> Save: submit same payload as header Save
                    |
                    v
              save success? ---- no ---> keep dialog/page for retry
                    |
                   yes
                    v
                  back
```

Escopo da comparação dirty:

- Título, instruções, expressão cron e hora de término.
- `scheduleRule` de tarefas que não foram criadas dentro de uma sessão.
- Modelo, modo e intensidade de raciocínio.
- Apenas campos realmente operados pelo usuário participam da comparação dirty. A normalização assíncrona após a inicialização da página em metadados de modelo, intensidade de raciocínio e builder de cron é preenchimento do sistema e não pode fazer "apenas abrir e voltar" disparar o diálogo de alterações não salvas.
- O primeiro quadro ao editar uma tarefa existente deve inicializar o formulário de agendamento diretamente com o cron, o `scheduleRule` e o `endAt` persistidos, sem renderizar primeiro um agendamento padrão e preencher depois via effect. Callbacks gerados pela montagem/registro dos controles de agendamento não contam como modificação do usuário; em particular, um plano customizado criado dentro da sessão deve permanecer clean quando apenas aberto e devolvido.
- Depois que o usuário devolve um campo operado ao valor inicial, esse campo volta a ser clean.

```text
persisted automation ----> form initialization ----> runtime normalization
         |                                               |
         +-------------- initial baseline ---------------+
                                                         |
user interaction ----> touched fields -------------------+
                              |
                              v
                 compare touched fields only
                              |
                      equal / different
                       clean / dirty
```

## Limites de exibição das ações do topo

As ações do topo da página de edição são restringidas conforme a aba atual:

```text
AutomationEditView
        |
        +-- Settings tab: Run now + Save + More actions
        |
        +-- History tab: More actions only
```

A aba `History` serve apenas para consultar o histórico de execuções e não hospeda ações de edição de formulário; por isso não exibe `Run now` nem `Save`, evitando que o usuário acredite que a lista de histórico também será salva ou executada imediatamente.

## Navegação para o histórico de execuções

O "ir para a sessão" do histórico de execuções é um session deep link explícito e precisa restaurar tanto o workspace alvo quanto a sessão alvo, não apenas fechar a visão principal de Automations. Automations é uma lista entre projetos, e o workspace local ao qual a tarefa histórica pertence pode já não estar na aba da janela atual; por isso o ponto de entrada de navegação precisa garantir que a aba do workspace local exista e então definir a active task desse workspace.

```text
run history click(sessionId + workspacePath + workspaceIdentity?)
        |
        +-- existing matching tab --> activate tab
        |
        +-- missing local tab ------> add and activate local tab
        |
        +-- missing remote identity attachment --> reject, keep Automations visible
        |
        v
set target activeTaskId --> switch main view to chat
```

- O casamento de identidade usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`; não é permitido acertar uma aba remota apenas pelo path.
- Quando o workspace local não informa `workspaceIdentity`, é permitido abrir a aba por `workspacePath`; isso é restauração de navegação da UI, não cria um novo runtime de Agent nem altera o workspace de pertencimento da sessão.
- Um workspace remoto sem um shared-host attachment já existente na janela atual deve falhar de forma fechada (fail-closed), proibindo criar uma pseudo aba remota apenas com path ou identity.
- Só depois que a seleção do workspace/sessão alvo é aceita pela camada de navegação é que a visão principal volta de Automations para o chat; em caso de falha, a página original é mantida.
- Esta mudança afeta apenas a navegação continuous da UI do desktop/Web comum; o `/remote` no celular não expõe Automations e não altera os limites de snapshot, queue ou reconexão do `web-remote-replayable`.

## Salvar e executar imediatamente

Na aba `Settings` do modo de edição, `Run now` usa o formulário atual como única configuração de execução. Ao clicar, é preciso enviar primeiro o mesmo payload de `Save` e, só após o sucesso do salvamento, executar imediatamente o mesmo `automationId`; não é permitido contornar o formulário e executar diretamente o snapshot antigo da automation com que a página foi aberta. Se o salvamento falhar ou o formulário for inválido, a execução não é disparada e a página permanece no modo de edição para correção.

```text
Run now click
  -> validate current form
  -> save current title / prompt / model / mode / schedule
       | failure -> stay on edit page, do not run
       v success
  -> runAutomationNow(existing automationId)
  -> stay on edit page
```

A ação combinada de salvar e executar imediatamente permanece single-flight; cliques rápidos repetidos não podem submeter o salvamento duas vezes nem criar múltiplos manual runs.

A identidade de execução do manual run precisa atravessar o despacho até o estado terminal, sem reutilizar o session trace gerado na criação da sessão:

```text
manual runId
  -> sendPrompt.traceId / inputId
  -> services activePromptInputIds
  -> terminal outcome.inputId
  -> settle run outcome + release manual claim
  -> dispose terminal subscription / claim heartbeat
```

O `createTask.traceId` de uma tarefa sem vínculo significa apenas a criação da sessão e não participa da reivindicação desta execução. Exceções no despacho precisam limpar a escuta e o heartbeat pela mesma subscription key `taskId + runId`; o estado terminal só aceita eventos com `inputId === runId`, evitando que um turno de execução antigo feche o manual run atual.

## Critério de contagem de execuções

O "número de execuções" no cartão da tarefa agendada mostra apenas o total acumulado de despachos, e não `atual / máximo`. `maxRuns` continua sendo usado para a decisão de ciclo de vida de agendamentos finitos, mas não é o denominador da estatística do cartão, evitando que a execução manual seja interpretada como consumo da cota de um plano finito.

```text
定时触发
  -> schedule run 首次派发成功
  -> runCount + 1
  -> 推进 nextRunAt / maxRuns / lifecycle

立即运行
  -> manual run 首次派发成功
  -> runCount + 1
  -> 保持 nextRunAt / maxRuns / lifecycle / manual claim
  -> turn 真实终态后释放 manual claim
```

- `runCount` contabiliza o total de execuções schedule e manual cujo primeiro despacho foi aceito com sucesso; falhas de despacho e misfire skipped não contam.
- Planos finitos precisam usar uma contagem de despachos schedule independente para julgar `maxRuns`; é proibido avançar o ciclo de vida com o `runCount` de exibição. Na migração do banco de dados, a contagem schedule é inicializada com o `runCount` anterior à migração, e manual runs após a migração atualizam apenas a contagem acumulada de exibição.
- Confirmações de sucesso duplicadas ou tardias do mesmo manual `runId` precisam ser idempotentes, sem incrementar `runCount` novamente.
- O manual run afeta apenas a exibição acumulada e `lastRunAt`; não consome o `maxRuns` de tarefas finitas nem avança cron, estado de atividade ou ciclo de vida. O manual single-flight claim continua sendo finalizado pelo estado terminal real do turno.
- O cartão usa uniformemente o texto `automations.runCount` no desktop e na Web; em chinês e inglês apenas o `count` acumulado é inserido.

## Escrita de volta da configuração de despacho

Quando uma tarefa agendada é disparada, o modelo, o Think e o modo atualmente salvos da tarefa precisam ser escritos de volta na sessão vinculada antes de enviar o prompt. O modelo é atualizado atomicamente pelo V4 `switchModelConfig`, que atualiza runtime e projeção da conversa, depois o Think é explicitamente convergido no modelo alvo e, por fim, o modo de permissões é convergido via `switchCollaborationMode`. É proibido passar antes pelo `session/setModel` legado, pois, com o runtime já trocado, a escrita complementar pode retornar noop e fazer a barra de ferramentas da conversa continuar mostrando o modelo antigo.

```text
automation dispatch
  -> V4 switchModelConfig(model + think + runtimeModel)
  -> V4 state.updated.config
  -> V4 switchModelConfig(target think)
  -> V4 switchCollaborationMode(permission mode)
  -> send prompt
```

- Garante-se apenas que este disparo use a configuração atualmente salva da tarefa; não há migração nem reparo de dados de tarefas históricas.
- O `desktop-continuous` do desktop continua consumindo a projeção da conversa; o celular mantém os limites de restauração command/snapshot do `web-remote-replayable`.
- O ponto de entrada de troca manual de modelo em sessões comuns e o caminho de compatibilidade `setModel` existente permanecem inalterados.

Ao trocar de modelo na edição de uma tarefa agendada, o Think precisa ser reconvergido conforme a capacidade do modelo alvo, sem reaproveitar o valor salvo do modelo de origem. Antes de o metadado do modelo alvo carregar, o salvamento não é permitido; se o carregamento falhar, é preciso entrar em um estado de falha não submisso e oferecer re-tentativa, sem interpretar a falha como "não suporta Think". Quando há suporte a Think, salva-se o nível validado do modelo alvo; quando não há suporte, é obrigatório enviar explicitamente `thoughtLevel: null` no update para limpar o valor antigo. O campo não pode ser omitido, porque o `undefined` no update significa "não modificar", o que deixaria níveis antigos como `max` do modelo anterior e dispararia `Unsupported reasoning effort` na execução seguinte.

Quando o modelo salvo não está entre os candidatos atuais, o disparador de modelo do editor continua exibindo o nome daquele modelo histórico; ao abrir o menu, apenas os candidatos atuais são exibidos, sem readicionar o modelo histórico ao menu. Essa regra altera apenas a exibição, sem mudar a origem dos candidatos, a validação do formulário, o salvamento, o despacho ou a semântica de resolução de modelo do runtime.

A exibição da capacidade de Think no editor de tarefas agendadas precisa usar exatamente os mesmos provider model metadata do composer da conversa. Quando os metadados do modelo alvo declaram explicitamente os reasoning levels, esse conjunto é a fonte autoritativa tanto para exibição quanto para validação ao salvar; o catálogo de runtime do workspace antigo só pode servir como fallback de compatibilidade quando os metadados estão ausentes. Enquanto o runtime preview ainda não retornou, enquanto nenhum `thought_level` foi projetado, ou quando o conjunto de níveis antigos não vazios retornado diverge dos metadados, é preciso continuar usando os níveis dos metadados, para que a projeção antiga não sobrescreva as capacidades do novo modelo já adotadas pela caixa de conversa. Só quando nem os metadados do provider nem um preview bem-sucedido tiverem níveis é que o controle de Think é ocultado e a tarefa é salva como um modelo sem Think.

```text
select target model
  -> provider model metadata (same source as conversation composer)
     -> Think options available -> render target levels immediately
     -> no Think option         -> keep control hidden while preview resolves
  -> load target runtime preview
     -> pending                 -> disable save
     -> options match metadata  -> validate/persist metadata thoughtLevel
     -> stale options conflict  -> retain metadata levels for composer parity
     -> no runtime option + metadata options
                                -> retain metadata levels for composer parity
     -> metadata unavailable    -> fall back to runtime thought levels
     -> no option from either   -> persist thoughtLevel: null
     -> failed                  -> disable save and expose retry
  -> next dispatch uses target model without stale Think
```

## Limite de atribuição de rodada do CronCreate

Sessões de tarefas agendadas proibem criar tarefas agendadas recursivamente. O critério de permissão atual usa apenas o `automationId` passado explicitamente pelo Host admission nesta rodada; o ponto de entrada de compatibilidade, caso ainda mantenha um run id `automation-*`, trata esse run id apenas como fallback do fato de automation desta rodada. `sendText` não consulta mais os metadados da tarefa nem adivinha a atribuição da rodada a partir do `cronAutomationId` salvo no histórico da sessão. A política antiga de fail-closed, que injetava um denylist de `CronCreate` no prompt comum quando a consulta de atribuição falhava, foi descartada.

```text
Host admission
      |
      +-- automationId / automation run id present
      |       -> automation turn
      |       -> deny CronCreate + CronUpdate + CronDelete
      |
      +-- no current-turn automation fact
              -> explicit user turn
              -> do not query task metadata
              -> do not inherit historical cronAutomationId permissions

Cron mutation tool execution
      -> executor marks current automation turn
      -> CronCreate / CronUpdate / CronDelete handler: reject
      -> CronList handler: allow
      -> otherwise CronCreate additionally checks bound session
             -> automation/checkTaskBinding(targetTaskId)
                    -> workspace-scoped EXISTS query
                    -> bound: reject
                    -> unbound: automation/create
                    -> -32601 Method not found
                           -> compatibility fallback: automation/list
                           -> filter targetTaskId in current session
                           -> bound: reject
                           -> unbound: automation/create
                    -> other query failure: reject create only
```

- As três ferramentas de escrita têm duas camadas independentes de guard: a requisição ao provider primeiro oculta `CronCreate` / `CronUpdate` / `CronDelete`; mesmo que um ponto de entrada antigo ou um provider com falha contorne o filtro de visibilidade, o executor de ferramentas continua passando o fato de automation desta rodada ao handler, e os três handlers precisam rejeitar antes de chamar `AutomationPort`. `CronList` é uma consulta somente-leitura e ainda pode ser chamada em um automation turn.
- Em um turno comum, o `CronCreate` também é validado por `AutomationPort` através do `automation/checkTaskBinding` dedicado, que verifica se a sessão atual já está vinculada a uma tarefa. O Host executa apenas a consulta de existência de `target_task_id` dentro do workspaceKey atual, sem ler nem serializar a lista completa de automations; por isso, campos de exibição corrompidos de tarefas históricas (título, modelo, modo de permissão) não podem mais derrubar a decisão de atribuição do novo Host.
- Quando um novo CLI/bootstrap se conecta a um Host antigo, esse Host responde explicitamente com o JSON-RPC `-32601 Method not found` para `automation/checkTaskBinding`. Esse erro significa apenas que a capacidade não existe: é preciso fazer fallback para `automation/list`, já suportado pelo Host antigo, e julgar o vínculo apenas pelo `targetTaskId` atual. Se a consulta de fallback também falhar, o caso é tratado como desconhecido e a criação é rejeitada. Erros de banco, transporte, timeout e validação de protocolo que não sejam `-32601` continuam em fail-closed e não podem enviar `automation/create`, evitando que uma falha real seja interpretada como "não vinculado". Isso é uma fronteira diferente da ausência de consulta a metadados de tarefa no `sendText` do V4 e não deve mais ser descrita como uma mesma "consulta de atribuição".
- Ao ler o `mode` histórico, o repositório de automation só aceita as enumerações de permissão atualmente suportadas; valores em branco ou desconhecidos são tratados como não definidos, evitando que um único dado antigo faça a validação de protocolo de todo o lote de `automation/list` falhar. As escritas de criação/atualização continuam rejeitando valores ilegíveis pelos tipos estritos e pelo schema de protocolo, para que não sejam criados novos dados sujos.
- `automationId` vazio significa que esta rodada é uma sessão de usuário comum. Mesmo que os metadados da tarefa da sessão vinculada tenham `cronAutomationId` salvo, os turnos de usuário subsequentes não podem ser rebaixados permanentemente para somente-leitura.
- O admission precisa passar o fato de automation junto com o comando desta rodada até a camada inferior, sem completar a informação com consultas assíncronas a metadados; por isso não existe o estado intermediário de "continuar o prompt mas ocultar CronCreate após falha na consulta".
- O `desktop-continuous` do desktop e o `web-remote-replayable` do celular reutilizam o fato de admission desta rodada; esta consolidação não altera a semântica de shared-host attachment, command queue ou restauração por snapshot.

## Limite de execução da biblioteca interna de tarefas via Bash

`tasks-index.sqlite` é o armazenamento interno dos serviços de domínio do Host, não a API Bash. O modelo não deve ler nem gravar esse banco diretamente via Bash; a leitura e escrita de definições de automations passam uniformemente por `CronList` / `CronUpdate` / `CronDelete` e pelo `AutomationService`.

Esta versão remove por completo a proteção específica do banco interno de automations na cadeia genérica de execução Bash: não se adiciona sandbox de SO, capability probe, wrappers `bwrap` / Seatbelt ou campos de protocolo de recursos protegidos, e nem se identifica e rejeita acesso ao banco a partir da string do comando. As semânticas de variáveis, cwd, scripts, links simbólicos e expansão multiplataforma do shell não podem ser fielmente reconstruídas por palavras-chave ou regex; manter verificações heurísticas apenas criaria uma falsa sensação de segurança onde a fronteira já está estabelecida.

```text
Bash request
    -> preserve the existing generic Bash execution path
    -> ExecutionPort

AutomationService / Repo ---------------------------> internal database allowed
```

- `AutomationService` é a API suportada de modificação de definições de tarefas, mas isso não equivale a isolamento de permissões do Bash em relação ao arquivo de banco; esta versão não promete impedir o acesso do Bash a `tasks-index.sqlite`, e a verificação da string de comando não pode ser descrita como uma fronteira de segurança de acesso a arquivos.
- `ExecutionSandboxPolicy` mantém apenas a configuração genérica de sandbox que o Bash já tinha, sem carregar informações de recursos específicas de automation; a semântica de `dangerouslyDisableSandbox` também não pode ser reescrita pela funcionalidade de automation.
- Se no futuro for necessário estabelecer uma fronteira de segurança forte sobre `~/.zcode`, deve-se antes criar um design independente de isolamento de execução multiplataforma, explicitando compatibilidade com desktop, controle remoto Web, macOS, Windows, Linux, contêineres e remote workspace, e só então ser integrado de forma unificada como uma capacidade de produto — não injetado localmente a partir da funcionalidade de automation em todas as requisições Bash.

## Restrição de criação recursiva no prompt do CronCreate

A descrição da ferramenta `CronCreate` e a descrição do campo prompt devem exigir que o modelo preencha diretamente o trabalho de negócio a ser concluído a cada disparo, e não devem pedir no prompt que se crie ou configure novamente uma tarefa agendada nem que se chame `CronCreate`. Essa restrição pertence ao contrato de ferramentas do modelo e não deve ser adivinhada por palavras-chave ou expressões regulares em contracts ou handlers.

```text
CronCreate description
      |
      v
model writes direct final-work prompt
      |
      v
AutomationPort.create

scheduled / manual automation turn
      |
      v
tool denylist: CronCreate + CronUpdate + CronDelete
```

- A `description` da ferramenta, as `modelInstructions` e a description do campo prompt usam semântica consistente, proibindo explicitamente agendamento de segunda ordem.
- Não se mantém uma lista de palavras-chave em chinês e inglês, e não há recusa em tempo de execução só porque o prompt contém `CronCreate` ou termos como "tarefa agendada", evitando classificar erroneamente como tarefas de diagnóstico, documentação ou resumo de resultados.
- A fronteira dura que realmente impede um turno de execução de automation de modificar definições de tarefas continua sendo o denylist de ferramentas de mutação com escopo de turno; descrições de modelo não podem servir como fronteira de permissão.
- Essa restrição não adiciona novos estados de negócio em desktop main, relay ou Host; o desktop continua usando `desktop-continuous` e o `/remote` no celular continua usando shared-host attachment e a cadeia de restauração `web-remote-replayable`.

## CronUpdate dentro da sessão

Sessões de usuário comuns podem obter o ID da tarefa do workspace atual via `CronList` e então usar `CronUpdate` para modificar aquela mesma definição de tarefa agendada. A atualização precisa reutilizar o `AutomationService.update` existente e o registro de automation, e é proibido simular a edição com `CronDelete + CronCreate`.

```text
conversation CronUpdate
  -> strict patch schema（id + 同步后的 title + 可选定义字段）
  -> AutomationPort.update
  -> automation/update protocol（workspace 由 Host 注入）
  -> AutomationService.update
  -> same automationId / targetTaskId / run history
  -> 本轮完成后展示同款定时任务结果卡片（按 automationId 打开详情）
```

- Os campos atualizáveis são apenas `title`, `cron`, `prompt`, `recurring` e `maxRuns`.
- Cada `CronUpdate` dentro da sessão precisa enviar um `title` não vazio e sincronizado. O título precisa descrever a semântica da tarefa após a atualização; quando o agendamento muda, a frase de tempo em linguagem natural precisa ser atualizada junto (por exemplo, ao mudar `每5分钟` para `每6分钟`, o título não pode continuar com `每5分钟`); quando a semântica do prompt muda, o título também precisa ser ajustado. Essa restrição é verificada mecanicamente na camada de contrato do Agent e não pode depender apenas de o modelo decidir passar ou não `title`.
- `recurring: true` significa alternar para repetição infinita; nesse caso a camada de domínio precisa garantir `maxRuns` vazio: quando o chamador omite `maxRuns`, o `AutomationService.update` o normaliza automaticamente para `null` e limpa atomicamente o limite finite existente; submeter explicitamente um valor numérico em `maxRuns` é uma combinação contraditória e precisa ser rejeitada antes da gravação.
- `maxRuns: null` ainda só pode ser submetido junto com `recurring: true`. `recurring: false`, ou `recurring` não explicitamente submetido junto com `maxRuns: null`, precisa ser rejeitado antes da gravação; não se pode converter a ausência de limite em tarefa de execução única e classificar incorretamente como completed.
- A entrada precisa conter `id` e o `title` sincronizado; patches sem título são rejeitados na camada de contrato do Agent.
- A tarefa precisa pertencer ao workspace atual; o Host valida a atribuição usando `workspaceKey = workspaceIdentity?.trim() || workspacePath`, retornando erro quando não a encontra.
- A atualização não altera `automationId`, `targetTaskId`, workspace, sessão, model/provider/mode/Think, `runCount` nem o histórico de execuções, e também não é responsável por pausar/retomar.
- O recálculo de cron, de contagem finita e de ciclo de vida continua sendo responsabilidade do `AutomationService.update`; o Agent não duplica a lógica de domínio.
- Quando apenas `recurring=true` é alternado, somente o antigo `maxRuns` é limpo; se `cron` / `scheduleRule` não foram submetidos, o `scheduleRule` existente precisa ser preservado (inclusive o intervalo autoritativo maior que 12 meses), sem degradar para um cron de calendário candidato.
- `CronUpdate` é uma operação de escrita no workspace e precisa do mesmo nível de aprovação do usuário e da mesma auditoria de `CronCreate`.
- Após o sucesso de `CronUpdate`, o cartão de resultado de tarefa agendada do fim do turno é compartilhado com `CronCreate`, mostrando o título e o resumo de agendamento atualizados; clicar abre os detalhes da tarefa pelo `automationId` original. Em caso de falha, cancelamento ou enquanto o turno ainda está em execução, o cartão não é exibido. Múltiplas operações Create/Update na mesma rodada e para a mesma tarefa mostram apenas o estado final, e um Delete bem-sucedido posterior remove o cartão.

```text
CronUpdate recurrence patch
          |
          +-- recurring=true + maxRuns omitted --> normalize maxRuns=null --> clear old limit
          |
          +-- recurring=true + maxRuns=null ----> clear old limit
          |
          +-- recurring=true + maxRuns=N -------> reject before repo.update
          |
          +-- maxRuns=null without true --------> reject before repo.update
```

- O cartão já é o resumo autoritativo da UI para o resultado da atualização; depois que o modelo chama `CronUpdate` com sucesso, ele deve fazer apenas uma confirmação curta em texto e não repetir título, horário, conteúdo e status em um bloco de código cercado por `text` ou em um pseudo cartão de arquivo.
- O turno de execução disparado pela própria automation não pode gerenciar definições de tarefas; esse turno precisa ocultar `CronCreate`, `CronUpdate` e `CronDelete`, mantendo apenas o `CronList` somente-leitura, evitando que a tarefa se altere, se delete ou se crie recursivamente. O alcance do isolamento precisa se basear no `automationId` ou no automation run id portado por esta rodada, e não pode rebaixar toda a sessão vinculada para somente-leitura só porque os metadados da tarefa mantêm `cronAutomationId` persistido.
- Uma nova rodada iniciada ativamente pelo usuário na mesma sessão vinculada é um turno de usuário comum e precisa reexpor `CronUpdate` / `CronDelete`, permitindo modificar a tarefa pelo serviço de domínio; `cronAutomationId` serve apenas para atribuição e exibição e não pode servir como permissão de ferramenta.
- Os caminhos suportados de modificação de definição de automation são `CronList` / `CronUpdate` / `CronDelete` e `AutomationService`, com o serviço de domínio garantindo o recálculo atômico de cron, `scheduleRule`, `nextRunAt`, retry e ciclo de vida. Modificar `~/.zcode/v2/tasks-index.sqlite` diretamente via Bash é comportamento não suportado, mas esta versão não afirma no handler do Bash que consegue bloquear mecanicamente isso por correspondência de texto de comando.

```text
same bound session
      |
      +-- scheduled/manual dispatch turn
      |     automationId/runId present
      |       -> hide CronCreate/CronUpdate/CronDelete
      |
      +-- later explicit user turn
            no automationId/runId
              -> expose CronUpdate/CronDelete
              -> update through AutomationService
              -> supported path does not write tasks-index.sqlite from Bash
```

- Esta ferramenta apenas adiciona capacidade de escrita dentro da sessão, sem mudar o fluxo de mensagens, snapshot, queue ou a semântica de owner do `desktop-continuous` do desktop e do `web-remote-replayable` do celular.

## Tarefa de calendário única que perde o minuto alvo

O cron de cinco segmentos não inclui o ano. Quando uma tarefa de execução única usa a expressão fixa `minute hour day-of-month month *` e o processo de criação cruza por acaso o minuto alvo, a próxima ocorrência do cron rola naturalmente para o ano seguinte. Esse caso não pode ser exibido nem agendado como uma tarefa anual recorrente.

Ao criar, dentro de uma sessão, tarefas com tempo relativo como "daqui a 5 minutos", o modelo precisa gravar o número de minutos relativos em `CronCreate.delayMinutes` e não pode adivinhar o horário atual nem converter para um cron absoluto. O `AutomationService` do Host gera um `scheduleRule` de intervalo em minutos de execução única ancorado no `Date.now()` do recebimento da requisição, de modo que `nextRunAt` é exatamente o instante de recebimento mais os minutos relativos; simultaneamente é gerado um cron de calendário fixo como campo de exibição compatível, mas o agendamento segue o `scheduleRule`. Para planos de calendário absolutos, envia-se `delayMinutes=null` e usa-se `cron`.

```text
“3 分钟后提醒”
        |
        v
CronCreate { delayMinutes: 3 }
        |
        v
protocol relativeDelayMinutes=3
        |
        v
AutomationService: Date.now + 3min -> one-shot minute scheduleRule
        |
        v
persist cronExpr / nextRunAt
```

```text
recurring=false calendar cron
              |
              v
      compute previous / next
              |
      +-------------------+------------------------+----------------+
      | age < 60 seconds  | age 60s..5min         | otherwise
      | next rolled year  | next rolled year      |
      v                   v                        v
  due immediately     reject before write      keep next run
      |                   |
      v                   v
 dispatch once        retry with delayMinutes
 -> completed         or a confirmed future cron
```

- Vale apenas para tarefas com contagem finita; planos anuais com `recurring=true` mantêm a semântica original.
- A janela de menos de 60 segundos cobre apenas o caso em que a confirmação de permissão ou a chamada de ferramenta cruza exatamente a marca de minuto; fora dela, um horário passado incorreto não pode mais ser executado como se fosse uma tarefa imediata.
- A camada de serviço rejeita alvos obsoletos e não grava enquanto dentro da janela original de detecção de perda de 5 minutos; requisições relativas devem usar `delayMinutes`. Fora dessa janela, não é possível distinguir apenas com um cron sem ano entre "horário obsoleto" e "usuário especificou explicitamente o próximo ano", portanto a semântica normal de cron para horários futuros é mantida.
- Tarefas de execução única normalmente agendadas para o futuro, seu `scheduleRule` e tarefas recorrentes não são afetados por essa proteção.
- Despacho, trava de execução e escrita de resultados continuam sendo feitos pela cadeia original de scheduler/host, sem um segundo conjunto de timers.