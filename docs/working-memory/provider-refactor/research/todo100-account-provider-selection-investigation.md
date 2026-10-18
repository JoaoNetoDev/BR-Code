# Investigação do Todo100: situação atual e direção de fechamento de Account / Provider / Effective Selection

> 2026-09-09; investigação pura concluída, produto não corrigido. Correspondente a [Todo100](../steps/todo-100-account-provider-selection-architecture-investigation.md).
> Baseline comitado: `86bbe157c88e8e599694afb53c39f6dac125ac08`. Os arquivos afetados pelo experimento suspenso foram conferidos com `git show HEAD:<path>`; não se pode provar que o baseline já está corrigido por tentativas de modificação no workspace. Nenhum código de produto, teste, conta real, configuração remota ou deploy foi modificado.

## 1. Conclusão

Não é "não existe nenhuma arquitetura compartilhada", nem "basta adicionar um campo na sincronização e
tudo fica resolvido". Já existem um snapshot público de Registry, o algoritmo de seleção efetiva e a
assinatura de UI; a lacuna principal está na montagem e nas fronteiras de consumo.

O que tratar com prioridade:

1. Fazer o processo de execução real obter os fatos completos de Account, e fazer a confirmação da
   sincronização refletir o snapshot efetivamente aplicado.
2. Ligar à resolução pública já existente as entradas que ainda criam o modelo direto a partir da escolha
   original, como o Subagent explícito — sem escrever mais uma cópia do algoritmo correspondente.
3. Verificar se a seleção efetiva se perde entre a resolução e o despacho. Já foi encontrado que o adaptador de
   tarefa, no ramo com anexo, deixa de repassar a seleção corrente; e que o Bot, ao enviar a próxima mensagem de
   uma tarefa já existente, não volta a obter a seleção efetiva.
4. Distinguir claramente "resolver nova intenção" de "execução já fixada" na fronteira de chamada, e não trocar
   de modelo às escondidas de forma unificada dentro do ModelFactory.

O mecanismo temporário de sincronização não justifica uma refatoração grande primeiro. Basta corrigir a
integridade, a confirmação de aplicação e o ciclo de vida; a semântica pública de seleção de modelo não deve
depender da existência de longo prazo dele. A montagem completa de contas do CLI terminal independente
permanece sem alteração, conforme a decisão do usuário.

Classificação de evidências: **confirmado** significa que a cadeia de código é clara ou há reprodução em
memória; **lacuna condicional** significa que é possível determinar o comportamento do ramo, mas ainda é
preciso distinguir se um usuário real dispara isso e qual é o limite de produto; **risco** significa que ainda
não é possível afirmar que ocorre um erro. Ao longo do texto não é reportado como Bug todo lugar que não chama o
resolver.

## 2. Camadas atuais e posse de estado

```text
一个执行环境的 Host
  Settings / OAuth / Team 查询 / Built-in / Personal
       |                    |
       v                    v
  AccountProviderService   ConfigService
  Overlay + states         Built-in + Personal
       |                    |
       +----------+---------+
                  v
        ProviderRegistryService
        [config + account + resolution + registry] 已应用快照
                  |
          +-------+--------------------+
          v                            v
  ProviderSettingsFacade       ModelSelectionFacade
  展示/编辑事实                 原 Selection -> Effective Selection

受 Host 管理的 Worker（普通 / Wiki 等）
  本进程 Config Source <---- 同环境配置文件/刷新机制
  Mutable Account Source <-- 当前临时 Account 协议
                  |
                  v
        相同 ProviderRegistryService / Resolver
                  |
                  v
        ModelFactory -> 固定 Model -> 请求期鉴权
        ^
        基线显式 Subagent 没有接公共 Effective Selection
```

Alguns pontos fáceis de confundir:

- `providerFamilyConnectionSelections` é a escolha persistente do usuário; o `current` do Account é um fato de
  runtime, e não se cria uma segunda cópia persistente de current.
- O Overlay do Account e os states do Account são duas projeções do mesmo cálculo de conta; states não são
  credenciais e também não podem ser descartados entre processos só porque "não são configuração de requisição".
- Worker e Host já reutilizam o código central de Provider, mas **os dados injetados e a montagem da entrada são
  diferentes**. Reutilizar o mesmo Resolver não garante o mesmo resultado.
- `ModelSelectionFacade` é uma camada puramente pública. Ela lê o mesmo snapshot já aplicado e devolve os
  candidatos e a seleção efetiva correspondentes à entrada; não precisa que cada negócio conheça
  pessoal/Team/Start.
- A orquestração de contas de rede do Host fica nos services; o CLI independente hoje monta apenas uma fonte de
  pacotes pessoais simplificada. Não é "o algoritmo precisa depender do Host", é que a montagem de serviços ainda
  não está alinhada.

### SSH / celular não são outro algoritmo de negócio

```text
桌面环境 -- 初始/变更 provisioning --> 远端环境配置存储
                                      |
                                      v
                                 远端 Host
                                 /       \
                            View 服务    远端 Worker

手机 /remote -- shared-host attachment --> 已存在的目标 Host
```

O provisioning da ambiente remoto Desktop→remoto e a sincronização de Account Host→Worker são arestas
diferentes. Não se deve criar outro runtime só para o celular por causa da segunda, nem adicionar uma barreira
de "alcançar a configuração mais recente do Desktop antes de cada envio comum". Os alvos de serviço, o cache e a
posse da resposta continuam isolados por `workspaceIdentity?.trim() || workspacePath`; as operações reais de
arquivo continuam usando workspacePath.

## 3. Mecanismos já corretos: preservar, não reescrever

| Mecanismo | Resultado da investigação | Entrada de evidência (baseline) |
| --- | --- | --- |
| Aplicação completa do Registry | Lê config/account de forma concorrente e verifica a generation de refresh; quando o Built-in no qual a Account se baseia não bate, mantém o snapshot completo anterior | `packages/provider/src/registry-service.ts:180` |
| Resolução a partir do mesmo snapshot pela Facade | Os candidatos do Registry e os states da Account vêm de um único `getSnapshot()`; não se busca o valor mais novo de cada um dos dois serviços e se monta por cima | `packages/provider/src/facades.ts:483` |
| Revision da Account | A identidade já inclui a origem Built-in, o Overlay e os states; mesmo só a mudança de current provoca alteração, e não é preciso inventar outro sistema de revision | `packages/provider/src/sources.ts:60` |
| Refresh da Account | Mescla pending reasons e roda serialmente; em falha mantém o resultado anterior; eventos novos durante a falha continuam sendo processados; uma falha inicial deixa somente a conta em fail-closed | `packages/provider/src/account-provider-service.ts:95` |
| Isolamento por escopo de conta | O Resolver escolhe resultados antigos reutilizáveis por escopo de identidade/conexão e não herda fatos de disponibilidade de outra conta só porque uma consulta falhou | `packages/services/src/model-provider/accountProviderConnectionResolver.ts:76` |
| Isolamento assíncrono da UI | O Hook público trata owner, mudança de entrada, geração de requisição e respostas antigas; ao receber uma notificação genérica de change com entrada presente, ele volta a buscar a View com a escolha original | `packages/ui/src/hooks/useModelSelectionView.ts` |
| Intenção original no Composer | O rascunho guarda a intenção original e exibe/submete a seleção efetiva derivada; uma falha de leitura não apaga a intenção original do armazenamento, e a escrita de volta do accepted tem limite próprio | `packages/ui/src/v4/composer/useDraftConfigControl.ts:173` |
| Criação final do Model | Valida com precisão o Provider/Model/faixa já dados e só então cria o Model com a configuração congelada; não cai de volta no primeiro modelo do pacote | `apps/zcode-cli/packages/bootstrap/src/app/provider-registry-model-runtime.ts:43` |

Portanto, "resolver o estado intermediário de forma unificada" não é colocar um lock em todo o repositório nem
apagar mecanismos corretos que já existem. Deve ficar explícito: a Account publica o resultado completo, o
Registry publica o resultado efetivamente aplicado, e todo consumidor que precisa combinar fatos lê o segundo; a
produção a partir de origens assíncronas ainda precisa de garantias direcionadas de consistência de escopo.

## 4. Problemas confirmados e impacto

### P100-01: perda de states entre processos, elegibilidade de execução inconsistente (confirmado, corrigir primeiro)

A revision da Account do Host já contém os states, mas o envelope enviado em `zcodeAgentService.ts:1169` só
traz revision, basedOnZCodeBuiltinRevision e providers. O protocolo do baseline e o caminho de recebimento do
Worker também não conectam os states.

O Resolver usa `accountStates?.[providerId]?.current !== false`. Isso tem uso estabelecido para Providers comuns
/ Off-Peak que não definem current, mas, depois que a informação se perde, também deixa passar uma conta comum
não-current.

```text
Host:   entitled=true, current=false -> 该套餐模型不进入执行 Registry
传输:   只保留 entitled=true，丢掉 states
Worker: entitled=true, current=undefined -> current 条件放行
```

O impacto não se limita ao Subagent, atingindo também a criação precisa de modelo e a validação de modelo de
protocolo que usam esse Registry do Worker. Uma autenticação posterior pode recusar a requisição de novo, mas
não se pode tratar a falha mais tardia como prova de que o passo anterior estava correto.

Outro caminho: ligar apenas o Worker à seleção efetiva pública, sem completar os states, faz com que a escolha
de uma conta comum seja resolvida como vazia por não haver um current único. Os doisArranjos precisam ser
verificados em conjunto.

Sugestão: o protocolo temporário atual transporta o mesmo snapshot completo; o limite do Worker gerenciado
deve deixar explícito "inicialização fail-closed" e "fatos completos de conta", evitando que states faltantes
sejam tratados como estado executável normal. Não se pode simplesmente tornar current obrigatório para todos os
Providers, nem dar current ao Off-Peak.

### P100-02: receber não é aplicar; o ACK pode reportar uma versão errada (reproduzido em memória, corrigir primeiro)

Cadeia:

- `bootstrap/src/zcode-protocol-entrypoint.ts:239` substitui o Account Source e espera o refresh do Registry, mas
  não confere o applied snapshot devolvido.
- `bootstrap/src/zcode-protocol/account-provider-config.ts` responde incondicionalmente o `snapshot.revision` de
  entrada como `appliedRevision`.
- O Host guarda esse resultado no cache de confirmação de cada Client e, depois, pula o mesmo revision.
- O Registry permite que o refresh devolva o snapshot antigo quando a origem Built-in não bate, e esse é um
  **comportamento correto do Registry**.

```text
Worker 正在使用 A
  -> 收到账号 B，配套 Built-in B 尚未到达
  -> Account Source=B；Registry 仍为完整 A
  -> 协议回复 appliedRevision=B       [错误发生在这里]
  -> Host 认为 B 已完成，不再发送同一份
```

Em 2026-09-09, sem conta e apenas em memória, executar `ProviderRegistryService` deu:

```json
{
  "sourceAccount": "account-B",
  "refreshReturnedAccount": "account-A",
  "appliedAccount": "account-A",
  "oldHandlerWouldAck": "account-B"
}
```

O último item é derivado da lógica do handler do baseline e não é uma alegação de ter executado todo o processo
antigo de protocolo. Os três primeiros são resultados reais de execução.

Sugestão: o ACK deve ser derivado do applied snapshot real; "ainda não aplicado" precisa ser distinguido
explicitamente e não pode ser registrado como sucesso. Não se exige bloquear até o mais novo, nem resolver com
espera infinita/atraso. A forma de representar accepted-but-not-applied pode escolher a menor mudança de
protocolo na especificação de implementação.

### P100-03: Subagent explícito não está ligado à resolução pública (confirmado, foco do consumo)

O helper de nome equivalente em `core/src/runtime/methods/subagent.ts` no baseline só usa
`profile.modelSelection` ou a escolha do pai e não chama
`packages/provider/src/effective-model-selection.ts`. Depois, usa o ModelFactory preciso.

Assim, a intenção antiga de um Provider pessoal também não corresponde automaticamente quando existe o mesmo
modelo no Team atual. Quando os states se perdem, ele pode passar pelo Registry de forma errada primeiro e,
depois de completar os states, falhar de forma mais explícita — então "o problema fica mais visível depois de
completar a sincronização" não é motivo para restaurar um portão permissivo.

Sugestão: quando um profile explícito começa uma nova execução, injetar a capacidade pública de
leitura/resolução do mesmo processo, usando o snapshot completo já aplicado pelo Worker. O Profile não é
escrito de volta. Child aninhado e child de workflow/script precisam atravessar a mesma dependência. Herança
implícita e override interno não passam por essa nova resolução.

### P100-04: mensagens seguintes de uma tarefa de Bot existente não são re-resolvidas (lacuna condicional, fronteira de consumo precisa)

Em `botsService.ts:4842`, a criação inicial da tarefa lê a View com a escolha original e cria a tarefa usando
effectiveSelection; isso está correto.

Mas o ramo de activeTask existente em `botsService.ts:4934` é resume + send. `sendPromptInBackground:4764` não
passa modelSelection; o adaptador de tarefa não compensa com resolução, e o Core em `turn.ts:105`, quando a
intenção está ausente, congela diretamente a escolha já salva da Session.

Conclusão: se a mesma Bot task já estiver ociosa e o usuário trocar de pessoal → Team e então enviar a próxima
mensagem, esse caminho **não corresponderá automaticamente ao mesmo modelo por causa da atualização de Account**.
Aqui "activeTask" é reutilização de longo prazo de um ID de tarefa e não significa que um turno ainda esteja em
execução.

Sugestão conforme o objetivo desta rodada: uma mensagem nova de uma task ociosa é um novo despacho e deve obter a
seleção efetiva; entrada já em admission, execução já fixada, retry eorientações em execução não podem ser
re-resolvidos de forma genérica. Onde exatamente a entrada busy do Bot congela precisa ser implementado ao longo
da semântica já existente do CommandInbox, sem reconstruir a fila do Host. Aqui fica registrada a fronteira
semântica, sem mudar todas as entradas seguintes para o mesmo comportamento por conta própria.

### P100-05: o ramo com anexo do envio de tarefa perde a escolha (lacuna de ramo confirmada, sem reprodução em máquina real até agora)

O `sendPromptToAgent` em `zcodeTaskServiceAdapter.ts:363` recebe modelSelection/modelExecution.

- Sem anexo: envia o sendText do V4 carregando os dois itens.
- Com anexo: chama o antigo `zcodeAgentService.sendPrompt`, e ao reconstruir os parâmetros manualmente não
  carrega nenhum dos dois.

Isso não faz com que todo envio com anexo falhe de forma obrigatória: se a Session por acaso já estiver na mesma
escolha, o comportamento pode parecer normal. Mas, se o chamador depende desta escolha para sobrescrever ou
para um escopo de execução dedicado, o ramo com anexo não consegue preservar a mesma semântica. O
"já chamamos getView" da camada superior não basta para provar que a execução final está correta.

Sugestão: restaurar a passagem equivalente conforme a capacidade real do protocolo, deixando explícito o limite
execution-only; não se pode simplesmente fazer um setModel global na Session já em execução. Não é exigido
concluir nesta rodada a migração completa do protocolo de anexos.

## 5. Tabela de revisão de consumo por entrada

| Entrada | Comportamento real no baseline | Conclusão da investigação / atribuição posterior |
| --- | --- | --- |
| Composer: criação nova e rascunho de sessão existente | O Hook lê o serviço alvo com a escolha original; deriva draftConfig; só escreve de volta a seleção efetiva com sucesso quando é accepted | Já ligado ao algoritmo público; manter as proteções de escopo/requisição contra corrida e não realimentar continuamente o snapshot da Session |
| Turn comum do Core | Congela antes do admission a intenção passada ou a escolha da Session; depois cria o Model com precisão | Deve manter a camada de execução sem remap secreto; exigir que as entradas de nova intenção upstream passem o resultado completo |
| Primeiro despacho de tarefa agendada | Com a escolha original, `automationModelSelection.ts` faz getView(input) e o despacho devolve o resultado | Correto; não validar só o editor, é preciso manter esta cadeia de background |
| Run já fixado / retry de tarefa agendada | O ramo fixedSelection devolve direto; o chamador usa a escolha do run | Exceção correta; não recorresponder a conta |
| Exibição de rascunho / criação inicial do Bot | A exibição devolve uma cópia do valor efetivo; a criação resolve e submete o valor efetivo | Já ligado; P100-04 é outro ramo, o de tarefa já existente |
| Mensagem nova em tarefa já existente do Bot | Segue a escolha da Session | P100-04; distinguir turno novo e ocioso de entrada de execução já admitida |
| Ramo de anexo do adaptador de tarefa | Não repassa a escolha/o contexto de execução | P100-05; com anexo e sem anexo precisam chegar ao mesmo contrato de escolha |
| Nova geração de Wiki | `resolveGenerationConfig` lê a View alvo com a escolha original, valida a issue e fixa a configuração de geração | Já ligado à resolução pública; `repoWikiModelClient.ts:95` |
| Retry de geração fixa de Wiki | `resolveConfig` não reinterpreta mais a escolha de conta | Exceção correta; não mudar retry para getView e trocar de pacote |
| Subagent explícito | A escolha original do profile vai direto para a fábrica | P100-03; a entrada de execução real, a cobertura JSON integrada e o resultado da análise do Markdown do usuário são tratados uniformemente |
| Subagent implícito | Herda o Active Model do pai, com fábrica de modelo congelada | Exceção correta; a atualização de current em background não pode trocar o modelo da task filha |
| Child de workflow / script | Montagem de child runtime própria; as dependências precisam atravessar | Ao ligar a capacidade pública, é preciso cobrir essa montagem e não escrever outra tabela de correspondência |
| Título / título de Goal | `title-generation-sidecar.ts:103` pega a configuração de título ou a Session Selection e depois cria o Model com precisão | Não é consumo de UI; configuração explícita independente é um ponto de ligação potencialmente perdido. Verificou-se que a criação pelo Host hoje normalmente só liga/desliga o título e não há entrada de UI comum de escolha de modelo independente; não exagerar como falha de usuário já confirmada |
| Compact | Herda quando há Model de entrada; quando não, cria com precisão o Model da Session | Manter a herança em execução; a nova intenção de Compact manual independente e a execução já fixada devem ser distinguidas na entrada, sem re-resolver cada model step interno |
| Memory Extraction / Dream | `project-memory-agent.ts:34` prefere o Model de entrada, senão cria a partir da Session | A herança do Extraction está correta; o caminho default do Dream precisa, na especificação de entrada posterior, esclarecer se é trabalho novo ou herança, sem forçar a unificação no latest account |
| Teste de conexão | Testa o Provider/Model explicitamente configurados e consulta o modelo real no Worker | Não deve virar a medição de outro pacote por remap de conta comum. A correção da sincronização se aplica; o público "correspondência do pacote atual" não se aplica incondicionalmente |
| Off-Peak | Pega o Ticket na criação; valida no despacho e usa o contexto de requisição do Ticket | Manter o vínculo original, o domain original e o escopo de execução dedicado; não incorporar ao remap automático de conta comum; P100-05 não pode perder o contexto de execução |
| Controle remoto do celular | Compartilha os serviços/comandos de tarefa do Host alvo, e a UI usa o Hook público compartilhado | Não precisa de novo cálculo de Account no celular; é preciso manter a restauração replayable, a workspaceIdentity e o limite de attachment |
| CLI terminal independente | Mesmo núcleo de Provider, origem de Account simplificada, montagem incompleta de Team/Start | O usuário já excluiu; basta registrar a diferença |

### A autenticação no momento da requisição não é um segundo seletor de modelo

`accountProviderRequestAuthService.ts` / `accountProviderConnectionResolver.ts:253` obtêm as credenciais atuais
pelo family/mode do acesso estático; se o mode não bater, a requisição é recusada, e a camada de requisição não
troca um Provider pessoal por um Provider de Team. Materiais de segurança como API Key/JWT e verificações
efêmeras não fazem parte da configuração estática de Model.

O congelamento aqui é **Provider/Model/configuração estática de requisição e a escolha desta execução**, e não
congelar para sempre um OAuth Token. O código atual permite que materiais de requisição compatíveis com
family/mode sejam atualizados por requisição (incluindo o escopo de Team atual); isso é diferente da semântica
mais forte de "o mesmo Model fica sempre amarrado à conta original". Este item não cria por conta própria um
bloqueio de conta antiga/Team antigo, nem usa o snapshot completo para enfiar o Token dentro dele. Off-Peak tem
regras próprias de vínculo de Ticket, e o comportamento de requisição comum não pode ser estendido a ele.

## 6. Sincronização temporária: corrigir a correção, não criar uma segunda plataforma

### Timing, frequência e ciclo de vida

| Item | Fato atual | Julgamento |
| --- | --- | --- |
| Gatilho de invalidação upstream | Mudanças de configuração de family/connection/endpoint, mudanças de origem de configuração; login/logout/compra e refreshes explícitos do negócio | Dirigido por evento; a leitura de Account costuma ler cache, o que não equivale a consultar o remoto a cada vez |
| Push quente | Após a mudança de Account, percorre `activeClientsByWorkspaceKey` | O Worker comum está aqui; não é broadcast de processo inteiro |
| Verificação sob demanda | Criação/retomada de sessão, algumas leituras/assinaturas, generateText, teste de conexão e prontidão de inicialização etc. | Já se divide um sync helper, não uma sincronização de rede escrita em cada lugar; mas as entradas de estratégia estão dispersas |
| Envio comum do V4 | A verificação de sincronização está no ramo de createSession, e não em cada sendText comum forçando o alcance da configuração Desktop→SSH | Manter a barreira sem envio global já decidida |
| Dedupe | Cada Client guarda a revision confirmada em um WeakMap; valores iguais são pulados | Pode continuar em uso depois que os dados e o ACK estiverem corretos; a revision é identidade de conteúdo, e não um número comparável de novo/velho |
| Serialização | Fila de Promises por Client; a falha não envenena a próxima tarefa | Já existe, não é preciso empilhar outra fila; o snapshot é lido antes de entrar na fila, então não se pode alegar ordem fora de execução só pela string de revision |
| Reconstrução do Worker | O cache de confirmação tem o objeto Client como key; um objeto novo não herda a confirmação antiga, e o WeakMap não cria referência forte permanente | Não se deve fabricar uma tabela de confirmação permanente por workspace |
| Worker de Wiki | Process manager próprio; já com os handlers do Host wire; não está na lista de push quente do active map comum e verifica antes do generateText | Não é "sem sincronização nenhuma". É permitido um snapshot completo antigo; se no futuro ele iniciar trabalho novo por conta própria, é preciso definir o escopo de inicialização/refresh |
| Worker dedicado de Plugin / MCP | Manager dedicado, voltado à gestão de plugin/MCP | Não forçar a capacidade de leitura pura a esperar a conta ficar pronta só por "unificar" |

Sugestão mínima de fechamento: manter o sync helper/fila atuais e deixar explícito, no contrato de
inicialização/uso do Worker de execução de modelo, quais fatos são necessários; corrigir P100-01/P100-02. Não
se busca eliminar todas as chamadas de ensure nesta rodada, nem colocar verificação de conta em cada RPC
alheio. Quando o transporte temporário for removido depois, isso não deve exigir mudar o algoritmo de seleção
efetiva nem a semântica de armazenamento de cada negócio.

## 7. Estados intermediários: a camada que realmente precisa ser unificada

```text
来源读取 / Account 查询（可以异步、可以失败）
             |
             v
同一次作用域的完整 Account 结果
             |
             v
Registry 检查来源配套 -> 发布完整 applied snapshot
             |
       +-----+----------------+
       v                      v
设置/候选/有效选择         传输应用确认
读取这一份结果             确认实际应用结果
```

Não se pode entender "consistência global" como todos os processos trocando para B ao mesmo tempo. Um A completo
antigo pode continuar atendendo; uma combinação nova e não autoconsistente simplesmente não é publicada.

Já está provado que o Registry tem essa camada de proteção e que a Facade a consome corretamente. **Ainda não é
possível provar que a origem assíncrona de Account é naturalmente autoconsistente**: o settings é lido no início
da consulta e a identidade e os materiais de API vêm depois de forma assíncrona; o AccountService serializa os
refreshes, mas não descarta consultas vencidas por generation de atualização no retorno de cada rodada como o
Registry faz. Esta rodada não reproduziu, com troca de conta real, a mistura de "escolha antiga + identidade/
resposta nova".

Isso deve ser listado como um risco direcionado de corrida no lado de produção, R100-01, e não como "já está tudo
quebrado em toda parte". A verificação mínima seguinte é usar portas de identidade/elegibilidade com atraso
controlado, trocar de conexão ou de conta durante a consulta e observar se o escopo, o current, o modelo e o LKG
publicados pertencem à mesma rodada. Se não pertencer, corrigir a captura de escopo/a publicação de resultado
vencido na camada de produção, em vez de adicionar timeout em cada UI.

R100-02: o snapshot de sincronização é lido antes de entrar na fila, e o canal só reconhece valor igual, não
ordem. Atualmente a leitura de Account é um snapshot de cache e as requisições do Client são serializadas; esta
rodada não reproduziu aplicação fora de ordem. Não se introduz um segundo relógio global de versão por causa de
um risco hipotético. Depois basta verificar com cenário de read/reconnect atrasado.

## 8. Como se espera que a refatoração fique

O objetivo não é fazer cada negócio "saber sincronizar", e sim fazer cada negócio apenas declarar qual tipo de
entrada está entregando:

```text
保存配置 / 当前草稿                 已固定 Selection / Active Model / Ticket
        |                                        |
        v                                        | 原样使用
公共 Selection 读取入口                         |
  = 同一 applied snapshot + 原意图              |
        |                                        |
        v                                        |
effectiveSelection + issue + View                |
        |                                        |
        +--------------> 新派发边界 <-------------+
                              |
                              v
                       精确 ModelFactory
                       固定本次 Model
                              |
                       请求期合法鉴权
```

Responsabilidades sugeridas:

- `packages/provider`: continua sendo dono da abstração de orquestração de Account, do applied snapshot do
  Registry e das regras puras de seleção efetiva. Não importa Host/rede/arquivo nem salva escolha de negócio.
- Camada de montagem do ambiente: fornece as origens de configuração, as origens de fatos de Account e o
  classificador de identidade; Host e Worker gerenciado montam o mesmo conjunto de capacidades de seleção. O
  transporte temporário é apenas um adaptador de Account source.
- Core: resolve **nova intenção explícita** por porta de dependência; as dependências passam do runtime pai para
  child/workflow. Não pode depender de um Runtime concreto de services nem fazer RPC reverso a cada resolução.
- UI: continua usando o Hook público, sem duplicar tratamento de correspondência de conta, refresh ou resposta
  vencida.
- Bot/Automation/Wiki: cada um tem sua intenção e seu registro de execução; a regra pública devolve valores e o
  negócio os usa nos pontos de novo despacho já estabelecidos. Não transformar getView em uma varredura que
  reescreve arquivos de tarefa.
- Factory/adapter: execução precisa, sem fallback secreto e sem reselecionar modelo a cada retry HTTP.

Os tipos de entrada devem ser expressos primeiro por funções/portas claras e pelo escopo de execução já
existente, sem pressa de criar um "grande objeto de contexto" genérico ou de refazer o framework de estado. Mover o
serviço de Account para outro processo no futuro é uma decisão de deploy, não um pré-requisito do algoritmo puro
de resolução.

## 9. Ordem sugerida de correção e pontos pendentes de decisão

Esta seção é uma sugestão da investigação, não uma implementação autorizada:

1. **Fechar o ciclo mínimo de estado em conjunto**: fatos completos de P100-01 + confirmação de aplicação real
   de P100-02. Cobrir mudança só de current, Built-in incompatível, Client novo e retry após falha; não
   substituir a comparação de resultado de Registry nas duas pontas por um round-trip bem-sucedido de campo
   opcional.
2. **Ligar a cadeia pública completa de consumo**: a chamada real de modelo do Subagent explícito e todas as
   montagens de child; quando o perfil original estiver inválido ou o mesmo modelo não existir, é preciso reportar
   o resultado conforme as regras públicas, e não herdar o modelo do pai para mascarar a falha.
3. **Corrigir perdas no despacho e conferir o turno novo**: passagem pelo protocolo de anexos em P100-05; nova
   entrada ociosa do Bot em P100-04. Manter estritamente o run já fixado, o admission busy e o Ticket, sem
   reescrever entradas já admitidas.
4. **Complementar a evidência de corrida no lado de produção**: escopo com consulta atrasada em R100-01; checar
   se mudança de identidade e refresh de Config conseguem publicar um resultado misturado. Se confirmado, corrigir
   a montante, preservando as proteções já existentes no Registry/Hook.
5. **Só então fazer a simplificação estrutural necessária**: montagem da Facade pública e a centralização da inicialização
   da capacidade de execução do Worker; não tratar a unificação total da sincronização temporária como
   pré-requisito de conclusão.

Os limites de produto que precisam de discussão estão concentrados em: entrada busy/fila do Bot versus título
independente, Compact manual e a fronteira entre "trabalho novo" e "herdar o trabalho atual" no Dream. Child
implícito, Compact/Extraction em execução, run fixo de Wiki e Off-Peak não precisam de nova decisão.

O serviço de contas completo do CLI independente, a remoção da sincronização temporária, a consistência
imediata em todos os cliente e refazer a estrutura persistente estão fora do objetivo mínimo de correção desta
rodada.

## 10. Verificação, experimento suspenso e limite de cobertura

### Executado nesta rodada

- A verificação de freshness do workspace passou; o baseline foi fixado em `86bbe157c8`.
- rastreamento somente leitura das entradas da tabela, da montagem Host/Worker, do protocolo, da autenticação de
  requisição e do modelo factory; nenhum arquivo de produto foi alterado.
- Os testes unitários existentes de Registry/Resolver: **2 arquivos, 21 casos, passando**.
- Os testes unitários existentes de Facade/AccountService/Account resolution: **3 arquivos, 31 casos,
  passando**.
- Reprodução de P100-02 puramente em memória; sem requisição real, credencial de conta ou dado de usuário.
- O primeiro conjunto de comandos continha o caminho inexistente `effective-model-selection.test.ts`; o Vitest
  rodou de fato apenas os outros dois arquivos. Depois foi executado o `facades.test.ts`, que contém o
  comportamento relevante; aqui se registra pelo arquivo/quantidade reais, e não se afirma que um teste inexistente
  passou.

Esses 52 casos verificam mecanismos públicos já existentes e não provam que o transporte ponta a ponta ou as
lacunas de produto foram corrigidas. Os arquivos de teste e o núcleo de Provider testado não foram modificados
nesta rodada.

### Revisão do experimento suspenso do Todo99

As tentativas no workspace acrescentaram transporte de states, montagem de Facade compartilhada, porta de
resolução opcional no Core e helper de Subagent explícito. A direção cobre parte de P100-01/P100-03, mas:

- não corrige o ACK de P100-02; não se pode dizer que o snapshot completo foi aplicado ponta a ponta;
- a rigidez/semântica de ausência de states opcional não virou um contrato completo;
- não cobre P100-04/P100-05 nem as fronteiras de consumidores auxiliares;
- um mock helper bem-sucedido não equivale a o child real ter emitido a requisição correta; workflow, herança
  implícita e override precisam de prova combinada;
- os testes de bootstrap antes falhavam por fixture antigo com schema/configuração incompleta, e o build de tipo
  local tinha problemas de freshness de artefato de dependência; esta rodada não continuou corrigindo essas
  falhas nem declarou o experimento pronto para commit.

Portanto, a suspensão continua, sem adoção automática e sem rollback automático; depois da decisão, mantém-se
apenas o necessário. As mudanças de teste e de produto do experimento não podem ser misturadas nesta entrega de
"investigação pura concluída".

### Não executado e requisitos de aceitação posteriores

- Não foi feita verificação real de troca de múltiplos pacotes/contas, SSH em máquina real, attachment do
  celular, anexos e múltiplos turnos do Bot, nem requisição de rede real de Subagent.
- Não se provou que R100-01/R100-02 ocorrem em produção; não podem ser listados como incidentes já reproduzidos.
- Após a implementação, é preciso verificar o Provider/Model/faixa real da requisição e o escopo de execução, e
  não apenas o texto de UI ou o Schema recebido; trocar em execução não pode mudar o Model antigo, e o próximo
  trabalho novo explícito precisa conseguir corresponder.
- Esta rodada é somente de docs, e não usa resultados históricos de typecheck/lint de todo o repositório nem de
  E2E para endossar o experimento suspenso; os testes unitários acima servem apenas como evidência da
  investigação.

## 11. Mapeamento de impacto / sugestão de reescrita do grafo

Adotada a rota impact-only do feature-boundary-planner; desta vez o usuário pediu explicitamente o Todo e o
relatório de investigação, e nenhuma matriz de implementação foi gerada nem o feature graph foi alterado
diretamente. A ferramenta codegraph não estava disponível, então foram usados sementes do grafo funcional mais
busca direcionada de arquivos/chamadas, sem alegar que uma auditoria automática de referências de todo o
repositório foi concluída.

Nós principais: AccountProviderService → ProviderRegistryService → ModelSelectionFacade → UI Hook / novo
despacho de background / child explícito → ModelFactory; o transporte temporário de Account é uma aresta de
source, e não o owner da regra de seleção efetiva.

Fatos do grafo que precisam ser atualizados conforme a implementação real:

- O antigo "o Subagent explícito precisa estender uma RPC de resolução do Host" não é uma restrição
  obrigatória; a Facade pura já existente pode ser reutilizada pelo snapshot aplicado localmente no Worker.
- "O Bot já está ligado à resolução pública" precisa ser dividido entre rascunho/criação inicial e mensagens
  seguintes de tarefa já existente; o primeiro não representa cobertura total.
- "O Worker já compartilha o Resolver" não permite deduzir que os states da Account estejam igualmente completos;
  a lacuna de transporte deve ser marcada separadamente.
- "Sincronização bem-sucedida" precisa distinguir recebimento da source e aplicação no Registry; o applied
  snapshot existente pode servir de fonte de evidência.

A investigação concluída apenas indica que esta rodada tem conclusões item a item e evidências rastreáveis; não
significa que o sistema não tenha outros Bugs, nem autoriza retomar automaticamente o Todo99.