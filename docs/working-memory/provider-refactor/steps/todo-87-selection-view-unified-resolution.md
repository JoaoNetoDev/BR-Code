# Todo 87: Resolução Unificada de Seleção de Modelo Guiada pela Selection View

> Atualização de atribuição da verificação (2026-09-09): toda a dívida de subtestes/falhas/promoção
> manual remanescente neste documento foi transferida para o
> [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente
> previsto aqui; as evidências históricas são preservadas, e a transferência não significa que os testes
> passaram. A antiga cláusula de suspensão do Subagent explícito foi substituída pela implementação do
> Todo99; a exceção do Ticket Off-Peak e a fronteira de não adicionar sincronização antes do envio
> permanecem inalteradas.

> Status: implementado e verificado/commitado por grupos em 2026-09-07; o novo E2E permanece pending
> aguardando promoção manual. A intenção original é separada do resultado atualmente válido, e as
> evidências específicas estão na tabela de auditoria de recuperação do Todo85; Subagent explícito e a
> migração de Ticket entre contas em horário ocioso foram explicitamente excluídos.
> Origem: D02 do Todo 85. Não se trata de restaurar o antigo helper de troca automática de modelo por
> Family, e sim de implementar a mesma experiência dentro da arquitetura de seleção atual.
>
> Continuidade de 2026-09-08: o [Todo96](todo-96-selection-offline-migration-and-resolution-consolidation.md)
> mudou a migração de Selection antiga comum para uma conversão offline determinística e verificou todas
> as entradas de intenção original para View; a resolução de execução no Host do Subagent explícito
> solicitou um veredito de protocolo à parte, e enquanto ela não for concluída continua proibido afirmar
> que o background foi unificado. A exclusão de Ticket em horário ocioso permanece inalterada. O formato
> Markdown do usuário e o escopo de migração são decididos em sequência pelo Todo97.

## 1. Objetivo e Decisões

Conexão de conta, Personal Config e atualização de Built-in Config passam todas pela cadeia de refresh
existente para formar um novo fato de seleção. O chamador passa o ModelSelection original que guardou
(na edição, a intenção mais recente do usuário) e obtém, por uma entrada unificada, uma View com
effectiveSelection. O recálculo automático não sobrescreve a intenção original; Composer, tarefas
agendadas, Bot e tarefas ociosas não podem escrever cada um seu próprio tratamento de substituição ou
invalidação de conta.

```text
Account / Personal / Built-in 更新
               |
               v
目标 Host 发布一致的选择事实
（模型候选、档位、账号连接，同一 revision）
               |
原 ModelSelection -> 统一读取/解析入口 -> 带 effectiveSelection 的 View
                                             |
                         +-------------------+------------------+
                         v                                      v
                  临时展示/准备执行                   明确保存/提交成功边界
                         |                                      |
                         v                                      v
              固定本次执行 -> ModelFactory                  才允许写回原选择
```

- Provider comum: verifica-se apenas o Provider/Model original; modelo inválido é esvaziado, e nível
  inválido limpa apenas o nível, sem procurar outro fornecedor.
- Provider de plano de conta comum: mapeia-se para o Provider alvo conforme a conexão de conta atual do
  Host alvo, priorizando preservar exatamente o mesmo modelId e reasoningLevel; sem o mesmo nível, o
  nível é esvaziado; sem o mesmo modelo, a seleção de modelo é esvaziada.
- Os níveis casam por valor, e não por nome de exibição em chinês, posição no array ou conversão por
  "semelhança aproximada"; os modelos casam por ID oficial, sem normalização de caixa, nome de exibição
  nem adivinhagem de correspondência única de nome de modelo entre fornecedores.
- Valor ausente não é preenchido com o nível mais alto/mais baixo; quando a intenção original é vazia, o
  effectiveSelection é vazio e não é preenchido com preferredSelection. A regra de inicialização de um
  rascunho realmente novo não muda. Quando a intenção original é não vazia mas o resultado temporário é
  vazio, a intenção original é preservada; após a restauração da configuração, deve ser possível resolver
  novamente um resultado válido.
- Não se exige observar um evento de troca de conta; cold start e o reuso de uma tarefa antiga também
  resolvem pela View atual. Só porque o Provider de conta original ainda está entre os candidatos, isso
  também não pode fazer pular a regra de correspondência da conta atual.
- Nesta rodada, Off-Peak não faz substituição automática entre contas; a seleção existente verifica
  apenas o Provider/Model/nível original e não corresponde a outro Off-Peak da conta atual. Uma seleção
  de conta comum também não pode cair em Off-Peak. Em horário ocioso apenas se convergem a resolução
  somente leitura e a proteção da intenção original, e o ciclo de vida do Ticket segue o mecanismo
  existente de staging fixo. Instâncias de modelo e Providers customizados não introduzem current.
- Não se adiciona sincronização de configuração remota nem espera antes do envio. Usa-se a View legível
  pelo Host alvo no momento, e a execução final continua sendo validada pelo Registry alvo.

## 2. Local de Implementação e Fronteira de Interface

### 2.1 Apenas Uma Entrada Pública

O nome da interface é provisoriamente `getSelectionView({ selection })`; ela evolui sobre o
`IModelSelectionService` existente, sem criar um serviço de estado de negócio cruzado. O Host alvo é
determinado pelo binding do serviço existente. O retorno traz revision, modelos/níveis candidatos,
preferredSelection, além do effectiveSelection correspondente a esta entrada e do motivo mínimo de
incompletude.

- A UI usa o `useModelSelectionView({ target, selection })` público para a primeira leitura, a
  assinatura, o recálculo por mudança de entrada, a recuperação de leitura e o isolamento de respostas
  antigas. A página não lê a View primeiro e depois chama por conta própria a função de resolução.
- Tarefas agendadas/Bot, quando precisarem em background, chamam diretamente a mesma entrada de
  serviço, obtêm o resultado atualmente válido e só então despacham; não se exige assinatura de longo
  prazo nem montar contexto de conta manualmente.
- preferredSelection continua sendo usado apenas na inicialização de nova seleção já existente; ele não
  pode subir automaticamente quando o effectiveSelection estiver vazio.
- O snapshot público de candidatos pode ser compartilhado; o valor de retorno com effectiveSelection
  pertence a uma entrada específica e não pode ser cacheado como seleção global única do Host. A
  correlação de cache/resposta precisa incluir o serviço alvo e a geração da entrada, e não apenas a
  revision da View; sob a mesma revision, o usuário pode mudar a seleção.
- O menu comum continua não exibindo Providers ocultos. A entrada de produto Off-Peak reaproveita a
  projeção restrita oculta já existente para seleção, sem resolver isso adicionando todos os modelos ocultos à View comum; sua seleção válida é resolvida pelo serviço interno com o mesmo fato autoritativo.

### 2.2 Apenas Um Algoritmo Puro Interno

`packages/provider` é responsável pelo algoritmo puro: snapshot consistente + Selection original ->
Selection atualmente válida. O serviço de leitura/RPC o encapsula; o algoritmo puro não faz IO, não
escreve em banco, não modifica a entrada e não notifica o usuário. Se o hook público recalcular
localmente usando um snapshot já chegou, ele só pode reutilizar este mesmo algoritmo, sem implementar
outro conjunto de regras.

A classificação de identidade fica concentrada em uma entrada interna. A camada de montagem do serviço
reaproveita `isBuiltinModelProviderId` e `OFF_PEAK_PROVIDER_IDS` para injetar no Provider Facade a
classificação `ordinary / account-plan / account-offpeak`, sem duplicar a tabela de IDs nem fazer o módulo
puro de Provider importar o pacote shared inteiro. Provider comum e Off-Peak mantêm a identidade
original, mas o segundo permite resolver candidatos ocultos restritos, e um Provider oculto comum não
pode se misturar na seleção genérica por causa disso. Não se adivinha por prefixo/URL/nome; um ID
desconhecido que não é encontrado resulta em incomplitude.

```text
原 providerId -> 集中分类
  ordinary        -> 原 Provider
  account-plan    -> 当前账号连接的普通套餐 Provider
  account-offpeak -> 原 Off-Peak Provider（本轮不跨账号替换）
                         |
                         v
             精确匹配 modelId -> 检查原 reasoningLevel
```

A finalidade do reconhecimento não pode depender da lista opcional atual: um Provider de conta antigo
oficial pode não estar mais entre os candidatos. Aqui só se reconhecem IDs oficiais vigentes, sem
aliases legados nem migração de runtime. O alvo atual do plano de conta comum é determinado pelo fato de
conta do mesmo snapshot, com suporte às mudanças de domínio atuais de Z.AI/BigModel, e não pode ser
adivinhado pelo primeiro item da lista nem pelo nome do modelo; Off-Peak mantém a identidade original e
não cruza a fronteira com o plano comum.

### 2.3 Snapshot e Fronteira de Execução Final

`ModelSelectionView` hoje só tem revision, providers e preferredSelection. É preciso permitir que a camada
de resolução obtenha o contexto de conta autoritativo do Host; chamadores comuns não podem ler
Settings/credenciais por conta própria para montar isso. Os dados adicionados são fatos de runtime, sem
credenciais e sem escrita em arquivo do usuário.

Candidatos e fatos de conta vêm do mesmo snapshot de Account/Registry já aplicado; não se pode combinar uma
lista antiga com uma conexão nova. Mesmo que o fato de conta mude e os candidatos não, é preciso que a
mudança consiga induzir a re-resolução necessária. O estado desconhecido é tratado pelo ciclo de vida
das fontes existentes, sem fabricar um pseudo-snapshot de "confirmado sem modelos".

O ModelFactory continua validando apenas a Selection explícita; uma resolução bem-sucedida não promete
que a execução futura terá sucesso, e a camada de execução não pode trocar secretamente o modelo/nível.
A migração de estruturas antigas do Decoder não entra no caminho normal de resolução.

## 3. Estado, Salvamento e Momento de Execução

### 3.1 Intenção Original e Resultado Válido Não Coexistem

- A seleção original continua tendo apenas os campos persistidos existentes; na edição, usa-se a intenção
  mais recente do usuário. O effectiveSelection é mantido temporariamente, e cada recálculo automático
  parte da intenção original, sem usar como entrada o resultado anterior de um esvaziamento automático ou
  de troca de conta.
- Mudanças comuns de configuração ou conta alteram apenas o resultado válido e não podem, pelo salvamento
  automático do Draft existente do Composer, esvaziar ou substituir a seleção original; mesmo quando
  a edição de texto/anexo leva a um salvamento, a intenção original precisa continuar sendo salva.
- Quando o usuário seleciona ou limpa ativamente um modelo/nível, forma-se uma nova intenção conforme a
  semântica original de edição/salvamento; depois de limpar, não se repõe a partir de Recent/Session. Na
  escolha de modelo não se pode misturar "Provider alvo + modelo/nível antigo" em uma combinação
  inexistente.
- Intenção original não vazia -> resultado atual vazio -> configuração restaurada -> resultado atual
  novamente válido é o comportamento esperado, e não se chama de recuperação a partir de campo antigo.
  Nenhuma sombra de persistência ou campo de compatibilidade extra foi adicionado.
- A inicialização de um rascunho realmente novo é separada da resolução de uma seleção existente.
  Seleção de modo normal, edição de texto e chegada de Snapshot não podem disparar secretamente um
  fallback de modelo padrão.

### 3.2 Como Recuperar Quando a Primeira Leitura Falha

Mantém-se o loading/unavailable/error/ready da camada de leitura, sem adicionar um "temporariamente
impossível resolver" genérico ao resultado puro. Um resultado normal é apenas uma seleção válida completa
ou incompleta (com modelo ou nível podendo ser vazio, com o motivo mínimo); um erro de leitura não pode se
disfarçar de modelo inválido.

```text
公共 hook：先订阅，再首次读取
  配置/账号变化 -> 新事实到达 -> 重算
  用户意图变化 -> 用当前事实重算
  目标重连     -> 重新绑定/订阅/读取
  初次读取临时失败且没有新事件
               -> 公共读取层有限重试 -> 仍失败显示错误，可手动 reload
```

Depois de uma primeira falha de leitura, o hook existente mantém a assinatura, mas sem eventos
seguintes não se recupera sozinho; uma falha na inicialização do serviço limpa o startPromise e permite
nova leitura. Por isso não se pode apenas afirmar que "esperar onDidChange basta". A camada de leitura
pública permite um retry automático de leitura limitado e cancelável; na implementação usa-se a
ferramenta de retry já existente e registra-se uma contagem/espaçamento uniforme, para que a página não
crie timers próprios e para não repetir em resultado comum incompleto, escrita de configuração, retirada
ou despacho.

O retry visa apenas a falhas de leitura recuperáveis; sem alvo, com alvo destruído ou em erro de
autenticação/configuração explícita, não se faz retry cego. Quando há sucesso de nova View, troca de
alvo/entrada ou cancelamento após unmount, respostas e timers antigos são cancelados; mesmo após a
primeira falha, se a revision do snapshot restaurado não mudou, deve-se sair do estado de erro. Um
reconexão bem-sucedida pode iniciar um novo ciclo de leitura, sem que uma falha esgotada fique cacheada
para sempre como falha.

Uma falha de leitura única em background é devolvida ao fluxo existente de agendamento/erro de preparação
de tarefa, sem criar assinatura de longo prazo nem retry de tarefa. Source query unknown e desconexão
não podem autorizar indevidamente; last-known-good da mesma conta segue as regras de origem existentes, e
os antigos benefícios não são reutilizados após trocar de identidade. Pending explícito/sem
benefício/Ready com candidatos vazios podem produzir resultado incompleto, e a intenção original é
preservada.

### 3.3 Escrita Explícita e Momento Fixo

- A resolução automática nunca escreve de volta diretamente. Apenas fronteiras de sucesso já existentes,
  como o salvamento do usuário na página de edição ou o aceite autoritativo de uma submissão, podem
  adotar o valor válido; falha de preparação, falha de envio ou cancelamento da edição não podem sobrescrever
  a intenção original por causa disso.
- Antes de implementar, listar o evento de sucesso exato de cada entrada; não se pode tomar o
  disparo de um RPC ou uma exibição otimista como sucesso, nem escrever genericamente "envio com
  sucesso". Prioriza-se as fronteiras de aceite/salvamento já existentes, sem esperar extra pela conclusão
  de toda a geração. Se o contrato original não tiver uma fronteira clara, registra-se e discute-se.
- A escrita de volta precisa estar associada a esta entrada e a este alvo; se o usuário modificar a
  intenção durante um envio bem-sucedido, um valor válido mais antigo não pode sobrescrever a nova
  intenção. Recent, Draft e Session seguem as suas próprias fronteiras autoritativas e não são escritos
  juntos por causa de uma atualização da View.
- A configuração de longo prazo de uma tarefa agendada e o run atual são dois registros diferentes. O
  primeiro resultado de resolução em background fixa o run atual; isso não muda a configuração de longo
  prazo por conta própria. Só o salvamento normal de edição pode alterar a configuração da tarefa.
- Depois que run, Submission e Active Model estão fixos, não há re-resolução; um retry no mesmo run não
  troca de conta, e só uma próxima execução independente re-resolve. O histórico exibe a seleção real
  executada e não é reinterpretado conforme a conta atual.
- Em horário ocioso, a criação já obtém o Ticket no momento (`offPeakTaskService.createTask`), portanto
  queued não significa que a identidade ainda não foi fixada. Nesta rodada não há substituição
  automática de seleção entre contas em horário ocioso, e não se adiciona cancelamento, troca de ticket,
  reconstrução de tarefa ou persistência de snapshot de credenciais após uma troca de conta. Mantêm-se as
  verificações existentes de modelo/conta antes da execução e as requisições de ticket; a expiração
  existente e a troca de ticket com 3102 para continuar a execução seguem como sempre, sem prometer
  continuação entre contas ou reuso do ticket original em outra conta. Uma seleção válida somente
  leitura não pode sobrescrever fatos de execução já vinculados.
- O Composer não exibe erro de campo vazio; tarefas que ainda podem executar mantêm aviso/bloqueio de
  resultado incompleto, e tarefas ociosas já encerradas não ganham erro novo. O controle pode exibir o
  resultado atualmente válido, o registro do run atual salva o valor efetivamente adotado e não se
  adiciona notificação global por item.

## 4. Superfície de Impacto e Checklist de Integração

Trata-se de uma mudança em option-source, validation, draft-default e commit-effect; não altera o schema
de armazenamento, não adiciona migração nem reescrita em lote de background.

| Entrada/nível | Fato atual e ponto de partida de código | Fronteira de integração e salvamento |
| --- | --- | --- |
| Camada pública, must-inspect | `packages/provider/src/facades.ts`; `packages/services/src/model-provider/providerFacadeServices.ts`; `packages/ui/src/hooks/useModelSelectionView.ts` | Recebe a seleção original e devolve a View com effectiveSelection temporário; assinatura pública/retry limitado de leitura, mantendo somente leitura e isolamento por entrada, com tipos Host/RPC consistentes |
| Composer, must-inspect | `packages/ui/src/v4/composer/useDraftConfigControl.ts`; `packages/ui/src/lib/composerRecent.ts` | Hoje a verificação de revision atual limpa diretamente draft.modelSelection e persiste automaticamente, e precisa virar derivação temporária; a edição de texto não grava o resultado válido por acaso, e o sucesso da escrita evita que uma submissão antiga sobrescreva a nova intenção |
| Edição de tarefa agendada, must-inspect | `packages/ui/src/settings/AutomationEditView.tsx` | Já lê o Host alvo via useModelSelectionView; resolução do formulário, avisos e salvamento usam o mesmo resultado, e cancelar não escreve |
| Tarefa agendada em background, must-inspect | `packages/desktop/src/scheduler/index.ts`; `packages/desktop/src/host/index.ts`; `packages/services/src/session/automationRepo.ts` | Hoje fixa automation.modelSelection no run antes de despachar. A resolução pelo Host alvo precisa acontecer antes dessa primeira fixação, ou a posição de fixação dessa cadeia existente precisa ser ajustada; não pode ser corrigido apenas na página, nem as regras de conta podem ser enfiadas no scheduler/Main |
| Bot, must-inspect | `packages/services/src/bots/botsService.ts` | O rascunho já lê o ModelSelectionService alvo; exibição e primeira submissão usam a resolução unificada, preservando o contexto e a fronteira de salvamento próprios do Bot |
| Wiki, should-inspect | `packages/ui/src/repo-wiki/RepoWikiPane.tsx`; `packages/services/src/repo-wiki` | A seleção explícita de geração reaproveita as regras; revisar os pontos de partida em background. A configuração de geração e a seleção do chat atual não se alteram mutuamente |
| Subagent, conditional | `packages/ui/src/settings/SubagentsSection.tsx`; camada de execução alvo | Conferir a integração da entrada de seleção com override explícito; sem override, continua herdando o Parent Active Model e não passa a usar o modelo padrão da conta atual. Se o lado de execução não obtiver o mesmo fato de seleção, reportar a fronteira antes de criar aliases temporários |
| Off-Peak, must-inspect | `packages/services/src/model-provider/offPeakModelSelectionView.ts`; `packages/services/src/session/offPeakTaskService.ts` | Sem troca automática de modelo nem migração de Ticket entre contas; Provider original indisponível apenas forma resultado incompleto temporário, mantendo a proteção de execução. O repairLegacyModelSelections existente em list/get/sync invalida e escreve no banco quando a Selection nova existente não casa, e esse caminho que quebra a intenção original precisa ser cortado; a migração de estruturas realmente antigas permanece separada, e histórico/Ticket não são reinterpretados |

Desktop e Web reutilizam o algoritmo de resolução sem alterar a entrega continuous/replayable. Quando a
View remota não está pronta, não há fallback para o Local Host; o isolamento continua usando
workspaceIdentity, remoteSessionId e o service owner existente. Não se pode transformar a troca de conta em
uma segunda sincronização remota.

## 5. Relação com Outros Todos

### Decisão durante a execução de 2026-09-07: Subagent explícito entra depois, separadamente

O usuário concordou explicitamente: nesta rodada a validação do modelo original do Subagent explícito é
mantida, e a correspondência não é apenas automática na página de configurações. O
`runtime/methods/subagent.ts` do Agent fixa o modelo da subtarefa a partir de profile.modelSelection ou da
seleção do Runtime pai; hoje não há Host Account State, e a correspondência completa exige um desenho de
protocolo à parte. O caminho de herança do Parent Active Model não muda, não lê o padrão da conta e não
adiciona aliases de runtime. Este é um item de exclusão explícita e não conta como correspondência
unificada implementada.

- Todo 85: D01 foi decidido como não restaurar a sincronização antes do envio; a experiência de D02 é
  assumida por este Todo, sem restaurar o antigo comando de troca de modelo do SessionPane. As outras
  recuperações do 85 podem ter review/commit independente, e não se pode escrever o 87 não implementado
  como D02 entregue.
- Todo 83/85: fornecem o Account State correto, o Overlay e a identidade da conta atual, que são a base
  de entrada deste Todo.
- Todo 86: responsável por como o refresh da fonte empurra de forma confiável a View; este Todo é
  responsável por como resolver a seleção depois que a View chega. Os dois se conectam, sem exigir a
  execução prévia do 86 ainda não decidido, e o 87 não cria seu próprio framework de refresh.
- Todo 70/71/72/81/84: controles em branco quando inválido, nível ausente sem preenchimento e fato de
  execução já submetido inalterado continuam válidos. Este Todo substitui explicitamente "limpar
  automaticamente e sobrescrever a Selection salva original": agora o resultado válido temporário fica
  vazio e a intenção original não se perde. A correspondência entre contas inclui apenas o plano comum, e
  Off-Peak fica excluído nesta rodada; a migração de estruturas antigas e a estratégia de rollback de
  arquivos não são modificadas.

## 6. Ordem de Implementação e Condições de Conclusão

1. Complementar primeiro o `design/interaction/selection-state.md` formal e o diretório de
   casos/matriz relevante, anotando a diferença entre "comportamento atual" e a nova semântica deste Todo;
   congelar a interface somente leitura de entrada/resultado, o contexto de conta, os eventos de escrita de
   sucesso de cada entrada e a posição de fixação do run. Manter a restrição de que o Off-Peak shared não
   migra silenciosamente entre Families e não mudar o mecanismo de Ticket por causa da resolução unificada.
2. Escrever primeiro os testes de proteção da intenção original, de resolução pública, de consistência da
   View e de recuperação da primeira leitura; só então implementar o algoritmo, a interface de leitura e o
   hook público. Provar que atualizações comuns de configuração/conta reaproveitam a mesma entrada, sem
   novo fallback padrão e sem que um resultado dependente da entrada entre no snapshot global
   compartilhado.
3. Integrar o Composer e a edição de tarefas agendadas; remover a resolução duplicada e separar a
   intenção do resultado derivado. Depois integrar tarefas agendadas em background, Bot e Off-Peak,
   revisando Wiki/Subagent explícito, com atenção especial aos caminhos de escrita automática já
   existentes e à fronteira de identidade congelada.
4. A cada etapa concluída, revisar a cadeia de chamadas e os testes; ao final, verificar de forma
   reversa se ainda existe alguma omission em que algo só tem efeito na UI enquanto o background consome
   diretamente uma seleção não resolvida.
5. Rodar typecheck, lint e os testes unitários relevantes; o E2E de interação roda em diretório isolado no
   MacBook Air, cobrindo o Composer, a tarefa agendada em background sem abrir a página de edição e as
   fronteiras de seleção/ticket de Off-Peak. Providenciar evidência da identidade/nível real da requisição,
   de arquivo inalterado ou de ausência de requisição, sem afirmar apenas mudança de menu.
6. Commit independente, com relatório de implementação indicando pontos de integração, entradas não
   cobertas, resultados de teste e qualquer item pendente de decisão. É proibido declarar apenas "o helper
   público está concluído".

## 7. Casos de Aceitação e Poda (contrato; o nível real de cobertura está na coverage matrix)

| ID | Pré-condição e ação | O que precisa provar | Evidência |
| --- | --- | --- | --- |
| SR87-01 | Troca pessoal/Team, novo Provider tem o mesmo modelo/nível | Só o Provider muda; modelo/nível preservados; DeepSeek comum intocado | Teste unitário público + requisição do E2E do Composer |
| SR87-02 | Alvo só perde o nível ou perde o modelo | Apenas o resultado válido é esvaziado em camadas; intenção original e arquivo inalterados, sem escolher padrão e sem mapear por índice de nível | Teste unitário + bloqueio de controle/submissão + arquivo |
| SR87-03 | Atualização Personal/Built-in de nível, model enabled ou membro de modelo | Usa a mesma entrada de resolução da atualização de conta; seleção válida inalterada e parte inválida esvaziada | Integração de configuração/View + UI |
| SR87-04 | View atrasada/desconhecida, troca de Host, usuário mudando a seleção nesse meio | Sem esvaziamento errado, sem cruzar Host e sem sobrescrever a seleção mais recente do usuário; só candidatos vazios autoritativos em Ready declaram invalidez | Testes de estado/serviço |
| SR87-05 | Após reinício, ler seleção de conta antiga sem observar evento de troca | Faz a correspondência de conta só com a View atual; estruturas legadas antigas seguem no Decoder | Teste público/de integração de recuperação |
| SR87-06 | Tarefa agendada com modelo de conta antiga salva, acionada após a troca sem abrir a edição | O primeiro run fixa a seleção correta; a requisição real é consistente; retry no mesmo run não troca de modelo | E2E no Air + registro do run/requisição |
| SR87-07 | Rascunho antigo de Bot, configuração explícita do Wiki usada de novo | Reaproveita a resolução; os registros próprios não poluem Composer/Recent | Integração de negócio; interação com E2E conforme os casos aceitos |
| SR87-08 | Subagent por herança, registros em execução/concluídos | Não acompanha a substituição pela conta atual e não reescreve histórico/objetos de execução | Teste de invariantes direcionado |
| SR87-09 | Enviar uma requisição remota imediatamente após a sincronização de configuração não terminar | Não adiciona barreira de sincronização antes do envio; o Host alvo valida por conta própria | Testes de sincronização existentes + verificação da fronteira de chamada |
| SR87-10 | Seleção original temporariamente inválida, edição de texto e depois restauração da configuração | Salvar o texto não limpa a seleção original; o resultado válido se recupera e uma limpeza explícita do usuário não é recuperada | Testes de Draft/arquivo + E2E do Composer |
| SR87-11 | Primeira leitura falha temporariamente e depois se recupera com a mesma revision e sem evento de mudança | Retry limitado de leitura na camada pública recupera; esgotado permite reload; troca de alvo/destruição cancela e resultado incompleto não é repetido | Testes de hook/serviço com falha controlada |
| SR87-12 | Dois consumidores passando seleções diferentes; mudar a entrada sob a mesma revision ou editar após a submissão | effectiveSelection não é compartilhado; resposta antiga/sucesso de submissão antiga não sobrescreve a nova intenção; falha não escreve de volta | Testes de leitura pública e de submissão |
| SR87-13 | Troca de domínio Z.AI/BigModel, seleção Off-Peak salva que não casa com a conta atual | Sem troca automática de Provider; resultado somente leitura incompleto e intenção original inalterada, e a verificação antes da execução continua bloqueando; sem troca automática de ticket por causa da troca de conta | Testes públicos/de serviço + interação com mock no Air e evidência de ausência de despacho |
| SR87-14 | Ticket ocioso já existente/queued/continuação; list/get/sync; voltar à conta original | Leitura/ polling não limpa a Selection nova nem rebinda outra conta a partir de campos de reparo antigos; ao voltar, é possível recalcular um resultado de modelo válido (sem garantia de validade do Ticket); histórico inalterado e o tratamento existente de expiração/3102 preservado | Testes de integração de serviço/armazenamento/Ticket |

Poda de combinações: não se faz arranjo completo para cores, cada marca fornecedora ou cada nível de
reasoning; pessoal/Team usa um representante de mudança de conexão, Start usa um representante de
pending/modelo vazio, Off-Peak usa um representante de troca de domínio Z.AI/BigModel sem alterar a
intenção original e com bloqueio de execução, e Provider comum usa um representante de mudança de
configuração. Remoto usa representantes de isolamento de identidade e de recuperação de leitura;
Subagent por herança cobre apenas invariantes. Escolher o primeiro modelo quando não há o mesmo, adivinhar
o nível por posição em chinês/intensidade, gravação automática em lote, substituição automática entre
contas em horário ocioso e migração de tickets são explicitamente excluídos.

Handover de E2E: depois de registrar o mapeamento SR87 no case catalog/coverage matrix, preparar fixtures
de conta/Provider case-local conforme `e2e-case-lifecycle`; não retirar créditos reais, não enviar
mensagens reais de Bot e não alterar a configuração diária do Air. Esperar por condições de View
revision/registro de run, sem usar sleep fixo para adivinhar o fim da sincronização; não é preciso rodar
E2E de desktop para cada combinação de função pública.

## 8. Viabilidade, Riscos e Registro da Investigação

No geral é uma mudança de porte médio-grande e transversal a entradas, e não se resolve adicionando um
helper; não foi encontrado obstáculo rígido que exija derrubar a arquitetura ou migrar o schema de
armazenamento. O algoritmo público é pequeno e serviços/assinaturas existentes podem ser reaproveitados. As
dificuldades se concentram em: separar a intenção original do resultado válido no Composer e evitar a
escrita automática em disco por outras edições; o timing atual em que a tarefa agendada em background fixa
o run primeiro; o fato de que a criação ociosa já obtém o ticket e de que list/get escreve estado de
invalidez; e a recuperação da primeira leitura quando não há eventos seguintes.

A implementação foi validada com verificação direta da cadeia de chamadas no código vivo, cerca de dois
saltos; a ferramenta codegraph não estava disponível e nenhum resultado de consulta ao grafo foi
alegado. O Feature Graph foi atualizado com a implementação e as sementes de código exatas. As novas
evidências de SR87 ficam separadas das regressões antigas, e aprovações antigas não são tratadas como
cobertura de funcionalidade nova.

No momento não há questão de produto que impeça a gravação em disco. Se, na implementação, o alvo de
conta não puder ser determinado de forma única, se forem necessários modelId oficiais diferentes para a
correspondência, se o ponto de fixação em background não couber dentro das fronteiras de Host existentes,
ou se houver o desejo de que uma tarefa com Ticket já vinculado continue executando entre domínios,
registre-se o fato e discuta-se. Não se adiciona alias difuso, varredura de dados, nova retirada
automática de ticket ou fallback na camada de requisição para aumentar a taxa de correspondência.

Na abertura do item nenhum código havia sido alterado; hoje a implementação está concluída. Camada pública
`cd6c4ff87c`, Composer `ac00daec9c`, Wiki `a3517b732f`, Automation/Off-Peak `e401dbcbb4`, Bot
`f0047c4430`. Durante a implementação foram mantidos o Todo86 paralelo e outras mudanças de nomenclatura/
migração, e nada foi enviado.

### Decisão adicional de 2026-09-07: continuação entre contas em horário ocioso não é expandida agora

Comparando com o staging fixo mesclado na época, `16d999f6a48b180b691a4d909479c063580d2ad0`, e não com
o staging posterior:

- O staging já obtém o Ticket na criação da tarefa, e as requisições posteriores resolvem novamente as
  credenciais da conta atual; ele não persistia as credenciais da conta original de cada Ticket.
  `offPeakServerClient.ts` não tem diferença em relação a essa baseline.
- As tarefas do staging só guardam model/thought antigos e constroem o modelo da rodada no despacho; não
  existe ali o comportamento novo de "comparar o Provider da Selection nova ao ler a tarefa e limpar o
  banco". Essa leitura destrutiva não pode ser atribuída ao comportamento original do staging, e não se
  reintroduz o antigo runtimeModel para restaurar o comportamento antigo.
- O staging já tem reobtenção de ticket em expiração e troca de ticket com 3102 para continuar a execução; o
  ramo not_found da consulta de ticket não tem um fluxo completo de recuperação entre contas. As
  evidências do cliente atual não provam que o ticket necessariamente falha após trocar entre
  Z.AI/BigModel, nem provam que pode ser reusado; nesta rodada nenhuma interface real de ticket foi
  chamada para verificar.
- O atual `offPeakTaskService.repairLegacyModelSelections()`, em list/get/sync, trata a Selection nova já
  existente e, quando não casa, chama `offPeakTaskRepo.invalidateModelSelection()`, escrevendo
  `model_selection=NULL, schedulable=0`. Campos novos já existentes não podem mais seguir esse caminho de
  esvaziar e depois rebindar por um campo de reparo antigo; a migração de dados realmente antigos continua
  mantida de forma independente.

```text
已有闲时原选择 + 当前账号/配置
               |
               v
只检查原 Provider 的当前有效性，不跨账号换 Provider
       |                         |
     可用                       不可用
       |                         |
  保留执行前检查            临时不完整、阻止执行
       +------------+------------+
                    |
             原持久选择不因读取改写
```

Fica determinado nesta rodada: a continuação entre contas não é expandida agora, e uma seleção existente
não deve ser quebrada. O mecanismo existente de Ticket não muda, não se adiciona armazenamento de
identidade de ticket de longo prazo e não se cancela/reconstrói tarefas do usuário. A resolução de
melhor esforço de mesmo modelo/mesmo nível do plano de conta comum não é afetada por essa redução.

### Status Atual das Decisões (não equivale a desenvolvimento concluído)

| Item | Conclusão | Seguimento |
| --- | --- | --- |
| Todo 85 D01: sincronização de configuração remota antes do envio | Claramente não restaurada | Não entra mais como pendente de decisão |
| Todo 85 D02: seleção de modelo após troca de conta | Resolução unificada por este Todo, sem restaurar a reescrita em lote orientada a eventos antigos | Aguardando implementação e verificação |
| Tarefa ociosa entre contas e Ticket | Sem substituição automática entre contas nem migração de ticket nesta rodada; corrigir a leitura que quebra a intenção original | Implementar conforme o escopo reduzido acima |
| Todo 86: responsabilidade de refresh | Rascunho independente, ainda em discussão | Não bloqueia o fechamento do Todo 85 e não amplia automaticamente este Todo |

Até esta rodada, não há novo item pendente entre as decisões de produto listadas no registro de recuperação
do staging fixo; o review final, o commit do grupo de recuperação não commitado e a implementação do
Todo 87 continuam incompletos, e não se pode afirmar com isso que o incidente foi totalmente encerrado. Se
a implementação encontrar um conflito real com as fronteiras listadas na seção 8 deste arquivo, discuta-se
com fatos específicos.