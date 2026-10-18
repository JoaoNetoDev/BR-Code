# Registro de Implementação do M3

> Status: implementação da linha de base atual concluída, aguardando decisão de integração e portão de lançamento
>
> Última atualização: 2026-08-21
>
> Objetivo da fase: [`03-provider-architecture-cutover.md`](./03-provider-architecture-cutover.md)

Este documento registra as decisões de engenharia tomadas durante a implementação do M3 que extrapolaram o plano estabelecido, mas que puderam ser concluídas de forma autônoma com base nos princípios de design existentes. Modificações de código normais e saídas de comando não são listadas item a item; questões que alteram a semântica de produto, as abstrações públicas ou os limites da fase ainda precisam entrar no Human in the Loop.

## 1. A árvore de trabalho atual como linha de base da implementação

O M3 começou a ser implementado a partir do `7f413be9de` desta árvore de trabalho. Esse commit é o resultado da reconstrução local do M2 sobre um staging mais recente; o `origin/staging` local passou por mais uma reescrita de histórico e divergiu bidirecionalmente desta árvore de trabalho. O usuário pediu explicitamente para não lidar com o branch remoto por enquanto, portanto neste ciclo não fazemos merge, rebase nem restauração da implementação antiga de staging, e M3.0 não é registrado erroneamente como concluído.

O M3 primeiro avança sobre a linha de base atual do M2, seguindo o Design para Submission atômica, Selection, Session Model, aposentadoria do estado antigo e convergência das Settings. A aceitação final de lançamento ainda mantém a decisão de topologia do staging e o portão de integração; os commits de implementação anteriores à decisão mantêm responsabilidade única, para facilitar uma futura reprodução em formato de auditoria.

## 2. Spec e testes primeiro

O comportamento oficial da Submission atômica foi escrito primeiro na Conversation Protocol Declaration e na Conversation Product State Space. Os testes correspondentes de Shared, Core, Bootstrap e UI foram migrados antes da implementação de produção, para travar os seguintes invariantes:

- prompt, attachments, mode e ModelSelection são recebidos de forma atômica;
- a Queue fixa a Selection no momento da entrada na fila;
- o Guide troca no limite do Model Step;
- Edit, Retry e Goal preservam ou herdam uma intenção de Submission explícita;
- a Selection do Composer não grava mais antecipadamente o modelo do Runtime atual.

## 3. Camadas de tipos de domínio e de wire

O Shared V4 define o wire schema serializável da Submission, com semântica de campos alinhada ao `ModelSelection` do Provider; a admissão no CLI converte para valores de domínio usados por Contracts/Core na fronteira. O Shared não depende inversamente do Provider Registry nem do comportamento de Model, evitando empurrar dependências de domínio de Provider para todos os consumidores de protocolo.

## 4. O Guide troca no limite do Step do Core

A Queue e o Guide guardam a intenção completa da Submission. Quando o Guide realmente faz o drain, o Core usa o ModelFactory para criar um novo Model e atualiza simultaneamente o Loop atual e a Selection da Session; o Bootstrap não ganha um novo callback de troca de modelo de longa duração do Core para o Bootstrap. Requests já emitidos continuam usando o Model antigo; o próximo Model Step passa a usar o novo Model.

## 5. Selection de Goal, Edit e Retry

O Goal usa na primeira rodada a Selection congelada na Submission do usuário; as rodadas automáticas de continuação não guardam outro continuation model, lendo a Selection da Session vigente no momento do início. Edit e Retry herdam da fonte canônica de entrada a Selection e o mode da Submission original, sem ler o Composer atual nem o estado da Session que mudou depois.

## 6. O Renderer mantém apenas a intenção da próxima submissão

As seleções de modelo, reasoning e mode do Composer não enviam mais `switchModelConfig` ou `switchCollaborationMode` antecipadamente. No momento do envio, o Renderer forma a Submission completa por meio de `resolveComposerSubmissionConfig()`; o App Recent continua sendo atualizado depois que a Submission é aceita. Assim, os controles de seleção deixam de funcionar como uma projeção mutável do Model Ativo ou da Selection da Session.

## 7. Limite de verificação deste corte

O build TypeScript do workspace raiz passou; os 64 testes específicos de Submission atômica de Shared/UI passaram; os 7 testes específicos de ciclo de vida de Model e de Guide do Core passaram. As 138 asserções dos cinco arquivos relacionados no Bootstrap passaram, mas casos de timeout existentes com fake-timer produziram três rejections não tratados, fazendo o processo Vitest sair com 1; esse tipo de erro não serve como prova verde deste corte, e a aceitação integral posterior mantém esse risco de linha de base. Ao construir o CLI com dependência até o Bootstrap, restam apenas dois erros de tipo já existentes do legacy personal provider importer.

## 8. A Selection da Session usa um formato estruturado persistido

Contracts fornecem funções de parsing de `ModelSelection` independentes de protocolo e de projeção da Selection a partir do Model real. A entrada de Session salva diretamente `providerId`, `modelId` e options genéricas, de modo que o reasoning level e o max output tokens sejam restaurados junto com a Session. O `thoughtLevel` de topo das entradas antigas só é compatível de forma unidirecional na fronteira de leitura a frio; as novas gravações não produzem mais esse campo.

## 9. O ModelFactory recebe diretamente a Selection

`RuntimeModelFactoryInput` passou a receber diretamente a `ModelSelection` estruturada. Provider, Model, reasoning level e max output tokens entram no Registry ModelFactory pela mesma entrada, em vez de o Factory remontá-los a partir de `ModelRef.variant` e de um campo separado de max output. Adapters ainda não migrados obtêm apenas uma projeção temporária de ModelRef na fronteira final de montagem; o uso da chamada continua sendo expresso pela operation e pelo execution context.

## 10. A Selection da Session se torna o fato do modelo em runtime

O Agent Runtime mantém apenas `sessionModelSelection` e lê e escreve a Selection atual da Session por `getSessionModelSelection()` / `setSessionModelSelection()`; a fase de construção apenas converte uma vez, de forma unidirecional, a configuração antiga `modelRef` ainda não migrada, sem voltar a guardar `defaultModelRef` nem outro estado de modelo mutável. Persistência, fork, compact, title, subagent, hook e turn loop leem a mesma Selection. Os Adapters antigos que ainda exigem `ModelRef` projetam sob demanda via `getModelRef()` por enquanto; o M3.5 vai removê-lo junto com a antiga entrada de escrita de configuração.

Este corte trava com nove arquivos de teste do Core a Selection da Session, a troca de step do Guide, a persistência e os fluxos derivados: 17 falhas antes da migração, 190 passed depois.

## 11. A troca e a recuperação do Bootstrap gravam a Selection

O `setModel` do Registry no Bootstrap, a alteração de reasoning level e a recuperação a fria chamam uniformemente `setSessionModelSelection()`, sem mais reescrever o fato do modelo da Session via `updateConfig({ modelRef })`. A entrada de Session lê e salva a Selection completa a partir do Runtime, portanto o reasoning level e os max output tokens padrão ou explícitos são restaurados junto. A configuração de compatibilidade do período de execução devolvida pelo Turn Overlay permanece por ora e entra na limpeza de Adapters do M3.5.

As fixtures de teste migraram primeiro para longe da antiga API `updateConfig({ modelRef })`; como essas fixtures chamam o Core diretamente, permanecem verdes tanto na implementação antiga quanto na nova: 240 passed em 4 arquivos. No Bootstrap, configuração de modelo, recuperação a fria e off-peak overlay: 67 passed em 3 arquivos. Dos 8 testes do App Runtime do Provider Registry, 1 passou e 7 foram bloqueados antes de chegar às asserções pelos artefatos de build do seed do Browser Use ausentes nesta árvore de trabalho; o build do Bootstrap continua reportando apenas os dois erros de tipo já existentes do legacy personal provider importer.

## 12. Remoção da entrada de escrita ModelRef do Runtime Config

Depois que a auditoria global de referências confirmou que os chamadores de produção já saíram de `updateConfig({ modelRef })`, o Core removeu esse campo dos tipos públicos e da implementação de `updateConfig`. Isso cria uma fronteira mecânica entre a atualização de parâmetros de execução e a escrita da Selection da Session: atualizações de parâmetros como context window e max output tokens não podem reescrever implicitamente a Selection, e a intenção de modelo só pode entrar por `setSessionModelSelection()` ou pela admissão de Submission.

Os novos testes de fronteira, somados aos de ciclo de vida de modelo, totalizam 16 passed, e o build TypeScript do Core passou. O `dep:refs` atualmente não consegue carregar o package aninhado `apps/zcode-cli` no projeto raiz; por isso a auditoria de remoção também usou o knip completo e o grafo de chamadas textual sem escopo, e a falha da ferramenta não pode ser registrada como prova de zero referências.

## 13. O novo Runtime recebe diretamente ModelSelection

`AgentRuntimeConfig` ganhou a `modelSelection` estruturada; a inicialização do Registry no Bootstrap e os filhos de Workflow, de Script Workflow e de Subagent passam a Selection diretamente; o resultado do parsing do Registry também carrega a Selection normalizada, e o App não precisa mais construir um `ModelRef` de Session. O construtor do Core mantém temporariamente a leitura unidirecional do antigo `modelRef`, servindo apenas a testes ainda não migrados, Entry de protocolo e configuração de compatibilidade; os runtimes filhos de produção já saíram desse campo.

Os dois testes prévios falharam como esperado na implementação antiga; depois da implementação, 37 passed entre Core e Bootstrap. O build do Core e dependentes passou; o Bootstrap ainda reporta apenas os dois erros já existentes do legacy importer.

## 14. A entrada de Session do protocolo é convertida em Selection

O `session/create` do ZCode Protocol ainda aceita um DTO de modelo estruturado na camada de wire, mas antes de entrar no App Runtime é convertido diretamente em `ModelSelection`, com o reasoning variant indo para `options.reasoningLevel`, sem mais construir um `ModelRef` inicial. O generate text de Workspace continua sendo uma tarefa de modelo independente e mantém temporariamente sua própria entrada antiga; ela será tratada em um corte de migração de tarefa independente.

O novo teste de entrada de protocolo confirma que o Runtime recebe a Selection completa e que não existe `modelRef` na configuração; o teste alvo passou (1 passed).

## 15. O uso de execução deixa de ser codificado como ModelRole

Title, Subagent, Registry Main e Turn Overlay não escrevem mais `ModelRole` na identidade do modelo. Title é identificado por `modelCall.operation=session_title_generation` e Subagent pelo child runtime/task context; a identidade do modelo mantém apenas Provider, Model e o reasoning variant ainda pendente de migração. Não há mais construção de `ModelRole.*` no código-fonte de produção de Core, Bootstrap, Adapter e Contracts.

O teste de evento de modelo inicial do Subagent falhou primeiro na implementação antiga; após remover o role, passou junto com o teste de Title operation, 2 passed; o build do Core, do Adapter e dependentes passou, e o Bootstrap continua parado nos mesmos dois erros de base do legacy importer.

## 16. O debug e a criação de modelo não propagam mais metadados de origem antigos

O Adapter Registry, a seleção padrão do Core e o debug de Model IO não constroem nem emitem mais `ModelRefSource`; o barrel interno do Core também parou de reexportar `ModelRole` / `ModelRefSource`. A semântica de origem permanece na Submission, no query source, no trace context e no task context, sem mais se disfarçar de campo de identidade do modelo.

O teste de debug de Model IO confirmou primeiro que o registro antigo ainda contém role/source e falhou; após a limpeza, 2 passed e o build TypeScript do Adapter passou. Os tipos antigos e o parse/schema em Contracts permanecem temporariamente para os testes e o protocolo ainda não migrados; o próximo corte continua a remoção.

## 17. Contracts remove ModelRole e ModelRefSource

Contracts removeu `ModelRole`, `ModelRefSource`, os campos de `ModelRef` correspondentes, as opções de parse e as properties do JSON Schema; não há mais esses dois símbolos em nenhum fonte TypeScript ou teste do repositório. O uso antigo não consegue mais entrar no sistema por tipos públicos ou schemas, e o Lite role é oficialmente aposentado junto.

Os testes de Contract falharam primeiro enquanto o parser antigo ainda emitia metadata key undefined; após a remoção, 4 passed; nos 8 arquivos de teste do Core migrados, 175 passed; 2 passed no debug do Adapter; e o typecheck do workspace raiz passou. A persistência de session do Bootstrap continua bloqueada pela ausência dos artefatos de seed do Browser Use, sem relação de asserção com este corte.

## 18. Remoção da configuração Lite do Runtime

`AgentRuntimeConfig`, a montagem de configuração do Bootstrap, o seletor de Project Memory e o filho de Subagent removeram `liteModelRef` / `liteModelProviderOptions`. A tarefa independente passa por padrão a herdar a Selection da Session atual, expressando a política da tarefa por `modelCall.operation` e pela política de reasoning; o tratamento especial `lite` do perfil de Subagent também foi removido, sem mais converter um alias de uso em um segundo estado de modelo compartilhado.

Os testes prévios confirmaram que o Bootstrap antigo ainda gerava duas keys Lite undefined e falharam; após a limpeza, 103 passed entre Runtime Config, Subagent, Memory e Profile, e o build do Core e dependentes passou. O helper de Registry dos testes também passou a coletar a `modelSelection` estruturada.

## 19. Remoção de AgentRuntimeConfig.modelRef

A configuração de construção do Runtime no Core e a inicialização do Registry no Bootstrap removeram a entrada antiga `modelRef` e a leitura de compatibilidade; o Runtime só pode ser inicializado por `modelSelection`. Testes de baixo nível e Runtimes placeholders sem Selection fornecida usam um valor placeholder estruturado explícito `zcode-unconfigured/missing-model`, em vez de gerá-lo por um parser de string interno. As entradas de produção de Protocol, Workflow e Subagent já havia concluído a migração para Selection.

61 fixtures de construção em 12 arquivos de teste do Core e 3 testes/bases de testes do Bootstrap foram migrados primeiro: 393 passed no Core e 420 passed incluindo Runtime Config. O Telemetry também removeu o caminho que projeta `modelRole` a partir de ModelRef; o teste vermelho prévio ficou verde, 5 passed. O build do Core, do Adapter e do Telemetry e dependentes passou, e o Bootstrap voltou aos dois erros de base do legacy importer.

## 20. Persistência e exibição leem diretamente a Selection da Session

O fork de Session, a persistência de message/timeline, os metadados de prompt de Context/Hook e a exibição de Workflow não chamam mais `getModelRef()`. Quando o DTO de persistência antigo ainda exige campos branded de provider/model, a Selection é validada e projetada apenas na fronteira de escrita; o reasoning é lido de `options.reasoningLevel`. As chamadas de produção a `getModelRef()` caíram de 62 para 40, com as restantes concentradas em tarefas de modelo independentes ainda não migradas, eventos antigos e entradas de Adapter.

Os fake runtimes relacionados migraram primeiro para `getSessionModelSelection()`; Session Fork 25 passed, Hook admission 19 passed, Runtime persistence 61 passed, e o build do Core e dependentes passou. Os testes de workflow do Bootstrap continuam bloqueados pela ausência dos artefatos de seed do Browser Use.

## 21. A facade de Session sai da leitura de ModelRef do Runtime

A exibição de modelo da facade de Session, a determinação de titularidade do Registry, a leitura/troca de reasoning e o estado anterior à troca de modelo passam a ler uniformemente `getSessionModelSelection()`; `ModelRef` é projetado temporariamente apenas na fronteira de escrita do evento de mudança de modelo ainda não migrado, sem mais obter do Runtime um segundo fato do modelo. Quando Overlay e Registry têm o mesmo nome, o Overlay com escopo de execução continua prevalecendo, e o reasoning atual vem diretamente das options da Selection.

Um novo teste de regressão define `getModelRef()` como lançador de erro ao ser chamado, cobrindo a exibição de modelo, o reasoning padrão/atual, a lista de níveis e a troca de reasoning; a implementação antiga falhou como esperado e, após a migração, 3 testes passaram. Ainda há 7 testes do App do Provider Registry bloqueados antes das asserções pela ausência dos artefatos de seed do Browser Use, e 1 passou; o build do Bootstrap continua reportando apenas os dois erros de tipo já existentes do legacy personal provider importer.

## 22. A projeção de protocolo do Bootstrap sai da leitura de ModelRef do Runtime

Os comandos de modelo do V4, a admissão de create-session config, o fallback do Registry, o seed de config do V4 e a admissão de Submission do lado emissor antigo leem diretamente a `ModelSelection` do Runtime. O evento `ModelSelected` ainda não migrado projeta a Selection temporariamente como o DTO de evento antigo apenas na fronteira de publicação; o config seed entre processos e a Submission canônica mantêm provider/model/options estruturados e não leem mais o ModelRef do Runtime. Não há mais nenhuma referência a `getModelRef` no código-fonte de produção do Bootstrap.

Os testes prévios substituíram pelo getter de Selection o getter antigo dos comandos de modelo, do fallback do Registry e do seed de config do V4, produzindo na implementação antiga 18, 1 e 2 falhas respectivamente; após a migração, os comandos de modelo e o fallback somaram 35 passed e a recuperação a fria completa 32 passed.

## 23. A leitura do modelo padrão na persistência usa Selection

A mensagem do Assistant e o summary/reminder do Compact projetam o DTO de persistência antigo a partir da Selection da Session quando o chamador não passa um execution model explícito; o snapshot de requisição passado explicitamente pelo caminho de requisição de modelo continua prevalecendo, evitando que a troca do Guard afete a atribuição de requisições em voo. A persistência padrão não lê mais o `getModelRef()` do Runtime.

Os dois testes prévios travam a fronteira com "o getter antigo lança ao ser chamado" e falham 1 cada na implementação antiga; após a migração, 5 passed na persistência específica, 61 passed em Runtime persistence e 68 passed em Runtime compact, e o build do Core e dependentes passou.

## 24. Remoção de AgentRuntime.getModelRef

A interface pública, a interface interna e o prototype de `AgentRuntime` removeram `getModelRef()`. Execução normal, title, goal verifier, compact, project memory, MCS, embedded search, subagent e montagem de ferramentas passam a ler uniformemente da Selection da Session; os pontos que ainda exigem o DTO antigo de Adapter/evento de execução o projetam temporariamente na fronteira de consumo, sem mais expor um segundo getter de Runtime compartilhado. Os getters de mesmo nome restantes no Core pertencem apenas ao request context com escopo de execução do próprio Tool Executor e continuam migrando conforme o tipo ModelRef for aposentado.

Dois testes de ciclo de vida de modelo afirmaram primeiro que o Runtime não expõe mais o getter antigo e falharam como esperado na implementação antiga; após a migração, 289 passed em 8 arquivos de teste relacionados, e o build do Core e dependentes passou. O build do Bootstrap continua com apenas os dois erros de tipo já existentes do legacy personal provider importer.

## 25. O Service de Settings ganha renomeação de identidade atômica

O Provider Config Service, a facade de Settings e o contrato de Service entre processos ganharam `renamePersonalProvider` e `renamePersonalModel`. O rename de Provider mantém a posição ordenada e migra todos os Model Configs exatos dentro de uma mesma atualização do Personal Repository; o rename de Model substitui simultaneamente o item da lista de modelos do Provider e a regra exata. Ambos recusam sobrescrever identidades Official ou Personal já existente — Official Provider/Model não podem ser renomeados pelas Settings de Personal.

Os três testes prévios falharam na implementação antiga por ausência dos métodos; após a implementação, 115 passed no Provider completo, e o build do Provider e o typecheck do workspace raiz passaram. A UI ainda não conecta essas duas operações; o próximo corte continua removendo a edição de identidade baseada em label/exclusão-recriação.

## 26. Adicionar Provider passa a ser criação atômica

"Adicionar provedor" não entra mais no formulário de salvamento secundário em que o Renderer segura UUID, nome, endpoint, chave e modelo. O Provider Config Service verifica Official e Personal na mesma atualização atômica do Personal Repository, aloca `new-provider`, `new-provider-2`, `new-provider-3` em sequência, grava um Personal Provider habilitado por padrão mas ainda incompleto, e a facade de Settings retorna `{ providerId, view }` depois de aguardar a atualização do Registry. Ao clicar no item de adicionar da esquerda, o Renderer chama esse Service diretamente e já seleciona a nova identidade para entrar na edição de detalhes já existente.

O antigo `AddProviderCard`, o gerador de rascunho de UUID e toda a suíte de testes do formulário de criação foram removidos, evitando manter um segundo caminho "primeiro montar o Provider completo na UI e depois salvar" da era anterior. Os testes prévios falharam por falta de criação atômica no Config Service, na facade e na ação de navegação; após a implementação, 116 passed em Provider, 8 passed em Settings Runtime, 199 passed em Settings UI e typecheck do workspace raiz aprovado.

## 27. A UI de Settings conecta a renomeação atômica de identidade

Na página de Settings de um Provider somente-Personal, o nome agora lê `providerId` diretamente, e o envio do nome chama `renamePersonalProvider(oldId, newId)`; em caso de sucesso, a seleção de navegação atual é migrada para a nova identidade. Não se cria mais um segundo fato de nome via `config.label`. O Config Service limpa ativamente o `label` histórico ao salvar um Effective somente-Personal e durante o rename atômico, de modo que as configurações antigas convergem naturalmente na próxima edição ou renomeação. Official Provider continuam com o label somente-leitura do Official Config.

A edição de modelo chama `renamePersonalModel(providerId, oldId, newId)` antes de alterar o Model ID e só salva Properties / Option Specs depois que a migração atômica da lista ordenada de modelos e do Model Config exato termina. Os testes prévios travam a ordem rename-before-save e a limpeza de label Personal; após a implementação, 117 passed em Provider, 233 passed nos testes relacionados de Settings/UI/Runtime e typecheck do workspace raiz aprovado. O estado de revision do feedback de salvamento ainda será conectado no próximo corte.

## 28. O teste de conectividade passa a usar o Model oficial do Environment de destino

O "testar modelo" da página de Settings não monta mais à mão no Host URLs HTTP Anthropic/OpenAI, cabeçalhos de autenticação, body de reasoning e requisições descartáveis a partir de um rascunho. A UI chama primeiro `saveEffectiveProvider` com o Draft Efetivo completo e só confirma, na Settings View devolvida, que o Provider é selecionável e que o Model existe; em seguida, passa apenas o workspace de destino e a `ModelSelection` pelo protocolo entre Service e Agent. O CLI cria o `Model` oficial a partir do Registry daquele Environment, envia a requisição mínima e consome `streamText` por completo até o finish. API Client, Account Config, Runtime Headers dinâmicos, a verificação de segurança da versão oficial do Start Plan, o Provider Adapter e a semântica de erros passam a compartilhar a mesma cadeia da execução normal.

A página de Settings remota agora resolve a Service Collection de destino por `workspacePath + workspaceIdentity + remoteSessionId/remoteTarget`; `useModelProviders` passa a ler o `ServiceProvider` atual e a assinar a Settings View daquele Environment, evitando que um rascunho remoto seja salvo por engano no Host local. O Host continua responsável apenas pela sincronização de Overlay de conta e pelo encaminhamento de protocolo, sem manter outra cópia da configuração de execução de Provider.

O antigo `modelProviderConnectivityProbe`, os helpers HTTP, o builder de body de requisição, o wrapper de logging e os dois conjuntos de testes de sondagem direta foram removidos, com um saldo líquido de cerca de 1.200 linhas da implementação da era anterior. Os testes prévios cobrem o consumo de stream do Model oficial, os apps active/temporary do protocolo, o roteamento por identidade de workspace do Agent, a ordem salvar-depois-de-testar e a normalização de erros: 8 passed no Core, 2 passed no Bootstrap, 33 passed em Services/UI e typecheck do workspace raiz aprovado. O lint ficou com 0 error e 38 warnings preexistentes sem relação com este corte; o build do Bootstrap ainda reporta só os dois erros de tipo já existentes do legacy personal provider importer.

## 29. A UI de Settings exibe feedback de salvamento automático com Draft revision

Os detalhes do Provider agora mantêm uma revision monotônica para o Draft local e exibem o estado `dirty -> saving -> success/failure`. A conclusão do salvamento só vale quando a resposta corresponde à revision atual; se houver uma edição depois de uma requisição em voo, a resposta antiga não pode sobrescrever o novo estado dirty nem exibir sucesso indevidamente. O sucesso fica brevemente visível e depois desaparece; a falha mantém o ícone, um texto de erro acessível e a entrada de retentativa. O salvamento da camada pai não engole mais exceções, de modo que o resultado real da falha fica visível perto dos campos.

Base URL, API Key e o nome do Provider continuam sendo enviados no blur, agora com envio por Enter completado; API Format, Enabled, mudanças de modelo e arrastar continuam salvando imediatamente após a conclusão da operação, e a falha ao arrastar modelo continua restaurando a ordem original. Os testes cobrem o gating por revision, dirty/saving/success, a retentativa em caso de falha e o envio por Enter; 221 passed nos testes de UI relacionados e typecheck do workspace raiz aprovado.

## 30. A cadeia de geração independente do workspace sai do protocolo ModelRef

Os parâmetros e resultados entre processos de `workspace/generateText`, o App do Bootstrap, o Runtime do Core e os consumidores em Services passam uniformemente a usar a `ModelSelection` estruturada. A mensagem de commit do Git e o Repo Wiki passam `options.reasoningLevel` diretamente; o Core cria o `Model` oficial a partir da Selection e o resultado é projetado de volta a partir do Model real. O antigo `modelRef.variant` é projetado localmente apenas nos Adapters, na autenticação e nas fronteiras de evento ainda não migrados, deixando de ser o fato de entrada deste protocolo e desta tarefa independente.

Git, Repo Wiki, protocolo e testes de Runtime foram migrados junto, e foram adicionadas asserções do protocolo até o App confirmando que a entrada preserva `selection` e não envia mais `modelRef`. 15 passed nos testes relacionados do Core, 6 passed no protocolo/conectividade do Bootstrap, 73 passed em Services e typecheck do workspace raiz aprovado.

## 31. A configuração de geração de título sai do ModelRef

A sobrescrita de modelo de `AgentRuntimeConfig.titleGeneration` passa a ser `modelSelection`; a sobrescrita vazia continua lendo a Selection da Session vigente no momento da execução real, e a sobrescrita explícita preserva integralmente as options de reasoning. O sidecar de título cria o `Model` oficial diretamente a partir da Selection e devolve a Selection projetada a partir do Model real. Quando o evento de título antigo e a porta de Runtime Headers dinâmicos ainda exigem o DTO antigo, a projeção temporária acontece só na fronteira de escrita/chamada correspondente, sem voltar a expor `ModelRef` na configuração de título nem no resultado do sidecar.

O `titleGenerationModelRef`, sem semântica própria, e o `session-title-runtime-headers.ts`, com um único chamador, foram removidos, e as fixtures de teste também não constroem mais `modelRef` aninhado. Os testes prévios travam o comportamento de sobrescrita com uma Selection de título diferente da da Session; 88 passed nos testes de título/persistência do Core, 12 passed nos de título/protocolo do Bootstrap e typecheck do workspace raiz aprovado. O build do Bootstrap não gained erros novos além dos dois já existentes do legacy personal provider importer.

## 32. A verificação de conclusão de Goal consome diretamente a Selection da Session

O verificador de conclusão de Goal não projeta mais a Selection da Session como `ModelRef` para acrescentar o orçamento de saída e depois converter de volta para Selection. No início da verificação, uma Selection é congelada diretamente, e o `Model` oficial é criado após mesclar o orçamento de requisição em `options.maxOutputTokens` dessa cópia; requisição, retentativas e usage continuam compartilhando esse snapshot congelado. A identidade exigida pelo evento antigo de ModelRequest e pela porta de Headers dinâmicos é projetada localmente a partir do modelo real apenas na fronteira de execução.

4 testes relacionados à verificação de conclusão/post-turn de Goal passaram, e o build do Core passou.

## 33. O sidecar de Project Memory congela a Selection diretamente

Extração, dream e recall de Project Memory não projetam mais `ModelRef` a partir da Selection da Session para depois reconstruírem a Selection. A Selection estruturada é congelada no momento do agendamento, e o `Model` oficial é criado após mesclar o orçamento de saída na cópia; o Agent Context que atravessa fronteiras assíncronas guarda essa Selection ao mesmo tempo, e a construção da mensagem do Provider lê diretamente dela. O getter antigo do Tool Executor e a porta de Headers dinâmicos continuam usando a projeção local de ModelRef apenas em suas fronteiras de compatibilidade.

94 passed nos testes de Memory agent/extraction/dream/permission, 13 passed em Memory recall e o build do Core passou.

## 34. A mesclagem do orçamento de saída da Selection converge para uma função pura

O Core ganhou `withModelSelectionMaxOutputTokens`, que sobrescreve o orçamento de saída da Selection sem modificar o objeto de origem; o verificador de Goal, o Project Memory e o ramo de Session comum do Compact passam a usá-la uniformemente. Quando o Compact já tem o `Model` oficial, ele obtém a Selection diretamente do Model real; apenas o `turnExecutionModel` explícito continua entrando pelo `runtimeModelSelectionFromRef` no overlay com escopo de execução do M4. Esse helper antigo de conversão inversa deixou de ser chamado por qualquer caminho de Session comum ou de sidecar.

Os testes unitários prévios cobrem a mesclagem de options e a clonagem sem override; 12 passed em Selection, 72 passed em Compact, 107 passed em Memory e o build do Core passou.

## 35. Remoção das janelas de proteção inválidas de troca de modelo em rascunho e de exports mortos

As duas antigas janelas de proteção baseadas em TTL Map na UI foram removidas: as duas entradas de mark de `draftModelConfigSwitchGuard` têm zero chamadas no código de produção, então a única chamada de preserve restante sempre enfrenta um Map vazio e apenas devolve o valor original; `thoughtLevelConfigUpdateGuard` só é referenciado pelos próprios testes. Manter esse estado induz o leitor a crer que o Renderer ainda mantém uma cópia do modelo já submetido e mascara o fato de que a Submission já carrega a Selection atomicamente. Após a remoção, `setConfigOptions` executa apenas normalização e deduplicação por equivalência e não imprime mais logs de configuração a cada chamada.

A mesma rodada de auditoria de referências também estreitou a superfície pública dos helpers de salvamento de Provider e de exibição de modelo do Composer, removendo três exports sem referência e corrigindo comentários obsoletos que ainda falavam em `defaultModelRef` na recuperação a fria. O `dep:refs` foi usado para conferir as referências de exports de UI do workspace raiz; como ele subnotifica imports com alias, os candidatos à remoção foram reconferidos um a um com o grafo de chamadas textual de todo o repositório, sem tratar a subnotificação da ferramenta como prova de zero referências.

Após a remoção, 98 passed nos 6 arquivos de rascunho de config, Session Store, restauração do Composer, seed global de modelo, confirmação de preferência de modelo e Settings de Provider; o typecheck do workspace raiz passou e o lint ficou com 0 error, mantendo apenas warnings preexistentes sem relação com este corte.

## 36. A aceitação integral encontrou fixtures esquecidas pela migração reversa

`test:unit:affected` degradou automaticamente para testes unitários de todo o repositório por causa de arquivos já removidos na base remota relativa. Essa execução encontrou duas categorias de fixtures antigas diretamente ligadas ao M3: o snapshot de continuidade do SessionPane não trazia provider/model/mode completos, fazendo a Submission atômica rejeitar corretamente; e o mock de workspace service da SettingsPage não implementava o novo resultado de resolução do Environment de destino. Ambos foram completados conforme o contrato oficial, sem afrouxar as validações de produção.

Os testes específicos do Bootstrap continuaram encontrando asserções de recuperação a fria e dois fakes de app que ainda inicializavam a partir de `runtimeConfig.modelRef`. A base de testes passou a ler `runtimeConfig.modelSelection` (com a option de reasoning), e a recuperação a fria também afirma que o campo antigo não existe; o fake runtime do Guide também não constrói mais a configuração `modelRef` compartilhada que foi removida. Após a migração, 11 passed nos dois arquivos de UI, 33+1 passed na recuperação a fria e no comportamento de protocolo do Bootstrap e 1 passed no Guide do Core.

## 37. Correção da fonte de verdade de tipos na fronteira de importação do CLI antigo

O build do E2E do Desktop expôs os dois erros de tipo que estavam sempre mascarados no Bootstrap: o `ZCodeConfigFileSchema` comum deixa o antigo `provider` deliberadamente como unknown de passthrough, mas o importador de uso único primeiro o interpretava e depois assumia que esse unknown já era o tipo antigo de Provider. O `parseLegacyCliModelConfig` dedicado já executava a validação completa do formato antigo; agora ele devolve diretamente o `provider` já validado e projetado, e o importador consome apenas essa fonte de verdade; o Runtime Config comum continua sem campos de Provider.

O teste prévio do Adapter confirma que a projeção dedicada contém a definição completa de Provider/Model; após a implementação, esse teste, os 9 testes do importador do Bootstrap e o build do Adapter/Bootstrap passaram, zeronando os dois erros de base que bloqueavam o E2E do Desktop.

## 38. O E2E de Settings migra para o ciclo de vida atômico de Provider

Os casos de estreia oficial, os casos de UI de Settings, os dois helpers compartilhados de Provider e os quatro casos de reasoning em revisão ainda operavam o `AddProviderCard` já removido: preenchiam um rascunho no Renderer e depois clicavam no segundo botão "Adicionar provedor". Esse caminho conflita com o contrato de criação atômica e de salvamento automático campo a campo do M3.6, e também produziria falsos positivos ao reativar pending cases no futuro.

O E2E agora compartilha um único helper atômico de Settings: clicar em `custom:add`, esperar a card de detalhes comum já persistida, chamar a renomeação de identidade e então salvar automaticamente por meio do blur de Base URL e API Key e do select de API Format; o popup de metadata de modelo conclui a configuração ao ser salvo, sem procurar um segundo botão de envio. Nome, Base URL e API Format receberam test ids unificados, travados por testes unitários de UI que primero falham e depois passam; helpers obsoletos de DOM setter/select/save da versão copiada foram removidos junto, com um saldo líquido de cerca de mil linhas de código de teste. O MP-UI-01 de Settings UI passou a afirmar que os campos comuns de detalhes aparecem imediatamente após a criação atômica e que o footer antigo não existe.

23 passed nos testes unitários de UI relacionados e a verificação TypeScript completa do E2E do Desktop passaram, e não há mais nenhuma referência a `model-provider-add-custom-*` ou `clickAddProviderAction` no repositório. A reprodução oficial local concluiu primeiro os builds de Desktop, CLI, Adapter e Bootstrap; o host inicialmente não tinha `xvfb-run` e depois iniciou um X Server real com um Xvfb extraído temporariamente e bibliotecas dinâmicas do Electron, mas a session do Chrome WebDriver ainda saiu antes do carregamento da página de negócio. Ao tentar a verificação de um único spec em Docker conforme a norma replay-isolated, o ambiente não tinha o comando `docker`. Nenhum dos dois caminhos chegou às asserções de negócio, portanto não pode ser registrado como falha de caso nem como admissão verde; a aceitação final do M3 mantém essa verificação ambiental pendente.

## 39. As fixtures de E2E de Memory saem do Lite ModelRef

A auditoria final de símbolos antigos encontrou que o E2E do runtime de Memory ainda construía o App com `modelRef + liteModelRef` e passava o antigo `modelConfig` a um Adapter que já só aceita Registry Config. Antes da migração, o comando completo falhava no início do cenário com `createModelAdapter requires registryConfig`; a fixture passou a montar o Adapter pelo `createAiSdkModelRegistryConfig` oficial e a passar apenas a `modelSelection` estruturada ao Runtime.

A primeira execução após a migração expôs uma suposição de concorrência em uma asserção de trajectory preexistente: se a primeira Extraction no-op já tiver iniciado, a trajectory completa tem 6 execuções; se o próximo envio do usuário chegar antes, o Scheduler combina o snapshot antigo conforme a semântica de `latest pending` já estabelecida e a trajectory tem 5 execuções. A verificação de evidência agora aceita apenas esses dois resultados legítimos, e a trajectory de ferramentas em três passos da Extraction explícita, o no-op de next-session, o cancelamento no encerramento e o resultado em arquivo continuam afirmados de forma independente. Os 4 testes unitários de evidência correspondentes e o build, a execução e a verificação de artefatos completos de `pnpm --dir apps/zcode-cli test:e2e:memory` passaram.

## 40. Estado final de aceitação da linha de base atual

A implementação da linha de base atual de M3.1 a M3.9 foi fechada. A auditoria de símbolos antigos no código-fonte de produção confirma que `defaultModelRef`, `liteModelRef`, `liteModelProviderOptions`, `ModelRole`, `ModelRefSource` e o Connectivity Probe independente saíram do sistema; `runtimeModelSelectionFromRef` sobrou apenas para o `turnExecutionModel` execution-scoped overlay explicitamente mantido no M4. O `pnpm typecheck` raiz passou, `pnpm lint` está com 0 error e 38 warnings preexistentes sem relação com esta fase, e a verificação de formatação direcionada aos arquivos alterados passou.

Os testes affected completos chegaram a degradar para execução de todo o repositório, e todas as falhas de fixtures antigas diretamente ligadas ao M3 foram corrigidas; as falhas restantes se concentram em dependências de CUA/plataforma, seed do Browser Use ausente, notarização de empacotamento e rejections preexistentes de fake-timer. O `fmt:check` do repositório continua bloqueado por HTML inválido preexistente na documentação Electron do repositório e por uma fixture GB2312. O E2E de estreia oficial de Settings atômicos do Desktop não obteve admissão porque o ambiente atual não tem Docker e a session de WebDriver do host sai antes do carregamento da página. A topologia de staging remota continua aguardando decisão, conforme pedido do usuário. Por isso registramos aqui "implementação da linha de base atual concluída", sem registrar erroneamente como concluída a fase M3 inteira ou o portão de lançamento.