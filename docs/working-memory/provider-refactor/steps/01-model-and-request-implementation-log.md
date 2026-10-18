# Registro de implementação M1

> Status: auditoria de conclusão e correção de lacunas concluídas
>
> Data de início: 2026-08-11
>
> Objetivo da implementação: [`01-model-and-request.md`](./01-model-and-request.md)
>
> Design alvo: [`../design/model/model.md`](../design/model/model.md)
>
> Decisão posterior: Guide/“立即” já foi definido como valendo dentro do Loop atual, conforme [`../design/interaction/interaction.md`](../design/interaction/interaction.md). O corpo do texto preserva o estado pendente da época da implementação.

Este documento registra principalmente as decisões tomadas de forma autônoma durante a implementação que fugiram do plano original, mas foram necessárias para dar continuidade ao trabalho. A baseline inicial, os resultados de validação e a lista de progresso são preservados como evidência de implementação do M1; os implementation logs das fases seguintes não registram mais item a item os commits normais e as saídas de comando de rotina.

O implementation log não altera designs já existentes; ao encontrar conflito, vale o design da fase, e o conflito é levado à revisão da fase ou a uma discussão de Design posterior.

## Continuação da implementação após a auditoria de conclusão

Em 2026-08-12, após reauditar conforme a condição de conclusão da fase, confirmou-se que o ponto de entrada de chamada de modelo já estava convergido, mas as semânticas abaixo ainda não estavam fechadas:

- Microcompact e Reactive Compact não herdavam por completo o Model mantido pelo Agent Loop atual.
- Um Child Agent sem escolha explícita de modelo ainda poderia escolher o modelo novamente a partir do padrão mutável da Session.
- Context Usage, a persistência de Compact e parte do Sidecar Usage ainda poderiam registrar o ModelRef anterior à requisição, e não o Model real.
- `workspace/generateText` ainda misturava atributos do modelo do Runtime atual ao criar o Model alvo.
- Após a migração do Repo Wiki, era preciso reconfirmar a fronteira de erro: preservar a classificação de erro publicável sem escrever em log ou persistir na task o código-fonte ecoado pelo Provider.

Todos esses problemas são decididos diretamente pelas restrições de implementação já existentes em `01-model-and-request.md`, e esta rodada continua a implementação sem adicionar design de fase.

Se o Guide/“立即” substitui o Model dentro do Loop atual ainda é o item pendente que o documento da fase preserva explicitamente. A implementação atual fixa o Loop Model e já difere do comportamento antigo de leitura a cada Step; esta rodada não vai escolher a semântica de Guide sob pretexto de corrigir outros problemas de ciclo de vida, apenas mantém o estado atual e continua registrando a diferença aqui.

A validação de Property antes da requisição já foi implementada conforme o design da fase. O que fazer em caso de falha — erro, degradação ou apenas registro de um evento de observabilidade — ainda não tem uma decisão unificada; esta rodada só complementa herança e atribuição, sem estender essa estratégia.

## Baseline inicial

Antes da implementação, o `38d37ca50a` de `origin/staging` já havia sido mergeado em `provider-refactor`, com o commit de merge `07e4ba350f`. O merge não gerou conflitos.

Na auditoria de conclusão da implementação, `origin/staging` já havia avançado para `d8cf5a49a7`. O branch atual fez o merge novamente e as alterações do workspace de trabalho foram restauradas como estavam pelo Git autostash; as novas correções de estimativa de token do Core não têm conflito de design com a fronteira de chamada de modelo do M1.

O staging mais recente removeu parte da lógica auxiliar de formato de requisição e de admissão de tools e simplificarou alguns testes de chamada de modelo. O caminho principal ainda preserva os seguintes fatos:

```text
业务调用方
    -> ModelTextRequest（携带 model / providerOptions / 传输控制）
    -> AiSdkModelAdapter
    -> 每次请求从可变 Registry resolve ModelRef
    -> Provider SDK
```

Portanto, o objetivo do M1 não precisa de ajuste. A implementação precisa evitar reintroduzir as abstrações auxiliares recém-removidas e estabelecer a nova fronteira diretamente sobre o contrato final de `Model` / `ModelRequest`.

## Decisões autônomas durante a implementação

### 1. O Adapter existente como núcleo de execução do Model da primeira versão

O M1 não reescreve o SDK do Provider, a retomada de stream, a atualização de Headers nem a normalização de erros. O Model da primeira versão encapsula o `AiSdkModelAdapter` existente dentro do pacote de Adapter, e os chamadores de negócio tocam apenas a nova interface de Model. O antigo `ModelTextRequest` se torna temporariamente uma entrada de compatibilidade interna do Adapter e sai da fronteira de negócio à medida que os chamadores do M1 migram.

### 2. O Model fixa na criação o resultado da resolução do Registry comum

O Model comum resolve Provider, model, capability e informação de conexão uma vez na criação. Depois que o Agent Loop mantém esse Model, os Steps seguintes não decidem mais a identidade do modelo nem a API Key comum a partir do Registry mutável. Mudanças de configuração afetam apenas Models criados depois.

Cadeias de Header dinâmico já existentes, como a do Start Plan, ainda permitem que o Adapter atualize o material de autenticação de nível de requisição após uma atualização explícita de Header na execução. Essa exceção não pode mudar `providerId`, `modelId`, Properties nem Options do Model.

### 3. O controle de transporte fica dentro da implementação de Model

`statusSink`, Trace, retomada de stream, idle timeout, fronteira de stream do Provider e atualização de Header em runtime não entram na `ModelRequest` pública. A implementação da primeira versão acolhe essas capacidades por meio do contexto de execução interno injetado na criação do Model. O chamador de negócio não pode montar livremente parâmetros de transporte por requisição.

### 4. ModelResult e ModelEvent primeiro convergem a semântica, depois os nomes antigos são limpos

O M1.1 usa como base de migração os campos já normalizados de `ModelTextResult` e `ModelStreamEvent`, define os nomes públicos finais e remove as entradas que o lado de negócio não deve controlar. Os tipos brutos do SDK do Provider continuam isolados pelo Adapter. Depois que a migração dos chamadores terminar, são removidos os aliases e tipos de requisição que existiam apenas para o antigo `ModelPort`.

### 5. Properties são formadas a partir das capacidades e dos 판단 de conexão existentes

`contextWindow`, imagem, PDF, Tool Call e Structured Output reutilizam primeiro os fatos existentes de `ModelCapability`; Native Web Search e Mid-conversation System são calculados com a lógica de 판단 atual, no momento da criação do Model. O Core passa a ler apenas as Model Properties e não deduce mais capacidade lendo Provider kind, URL ou nome de modelo.

### 6. O Repo Wiki usa o Model unificado e não mantém cliente de Provider próprio

O modo de integração do Repo Wiki precisa ser escolhido conforme a direção real de dependência entre Services e Core. Seja finalmente pela obtenção das capacidades de Model pelo protocolo de workspace já existente, seja pela reutilização de uma implementação de Model de nível mais baixo, no fim do M1 ele precisa usar a mesma semântica de `ModelRequest` e não pode mais resolver por conta própria API Key, Endpoint e requisição de protocolo.

A implementação efetiva aproveitou a fronteira de processo existente: os Services pedem à CLI via `workspace/generateText`, e a CLI cria o Model e executa por dentro. O cliente do Repo Wiki que antes tratava API Key, Endpoint, requisições OpenAI/Anthropic, o Tool loop e o Usage por conta própria foi removido. Para preservar a semântica de cancelamento, a requisição de workspace ganhou um operation id; o AbortSignal do Host encerra ao mesmo tempo a espera local e avisa a CLI a abortar a task de modelo correspondente.

### 7. O contexto interno de chamada usa AsyncLocalStorage

Trace, status sink, recuperação de stream e atualização de Header não entraram na `ModelRequest` pública. O Core grava o invocation context na fronteira de chamada de modelo e o Adapter o lê na mesma cadeia assíncrona. Chamadas com streaming envolvem adicionalmente o `next`, o `return` e o `throw` do AsyncIterator, evitando que o contexto exista apenas na criação do iterador e se perca no consumo real.

### 8. O “desligar reasoning” de tarefas auxiliares começa como intenção de construção do Model

Title, Git Commit Message e Memory Selector antes reescreviam diretamente parâmetros de Anthropic, OpenAI e OpenAI-compatible no código de negócio. O M1 converteu os chamadores para uma entrada de fábrica compatível com `reasoningMode: "disabled"`. A fábrica oficial do Bootstrap entrega essa intenção ao Adapter para conversão; a lógica antiga de dialeto do Provider permanece apenas na única Model Factory de compatibilidade, para uso dos testes antigos que constroem o Core diretamente e das chamadas em migração.

Isso não adiciona nenhum nível público de Reasoning e não altera as faixas escolhíveis pelo usuário. O modelo completo de configuração de Reasoning continua reservado, conforme a pesquisa especializada existente, para a fase futura de Provider/Registry.

### 9. Properties são formados na criação do Model

Os julgamento antigos por Provider kind, URL e nome de modelo de Native Web Search e Mid-conversation System foram movidos para o caminho de criação do Model. O Agent principal, o Compact, a Project Memory e as tools baseadas em modelo leem as Model Properties. A pré-visualização não-executiva do catálogo de tools ainda pode usar o julgamento de conexão antigo sem Model; esse caminho não dispara requisição de modelo e será removido depois que o Registry/Descriptor do M2 virar a fonte oficial de consulta.

### 10. O antigo ModelPort tem apenas uma entrada de compatibilidade

Todos os chamadores de produção usam `Model.generateText()` ou `Model.streamText()`. As chamadas diretas ao antigo `modelAdapter.generateText/streamText` no Core existem apenas na fábrica de compatibilidade de `runtime-model.ts`, para os testes que constroem `AgentRuntime` diretamente sem passar pelo Bootstrap e para chamadas antigas embarcadas. Na segunda fase, ao substituir a origem do Model, essa entrada pode ser removida por inteiro.

### 11. Agent Loop, Compact e Child Agent compartilham um Model imutável

O Agent Loop comum cria o Model no início, e os Steps seguintes, o Compact automático, o Microcompact, o Reactive Compact e o Child Agent sem escolha explícita de modelo seguem usando esse objeto. Um Child Agent que escolhe modelo explicitamente cria seu próprio Model. Mudanças no modelo padrão da Session, no Config ou no Registry durante a execução do Loop não reescrevem o Model comum já referenciado; Providers com Header dinâmico, como o Start Plan, continuam atualizando o material de autenticação pela cadeia existente de atualização antes da requisição, mas não podem trocar a identidade do Model.

### 12. O histórico de execução e o Usage são atribuídos ao Model real

Mensagens de assistant, registros de Compact, diagnósticos de persistência de tool, Context Usage, Usage Fact e Trace deixam de ler o `defaultModelRef` mutável depois que a requisição termina. Esses caminhos recebem o Model que realmente fez a requisição, ou o ModelRef formado a partir dele. Tarefas independentes com reasoning desligado, como Title, formam um Model com `reasoningLevel: "disabled"`, e o Usage registra as opções realmente executadas em vez da faixa antiga de reasoning da Session.

### 13. O orçamento de saída é escolhido pelo chamador e validado estritamente pelo Model

A revisão mostrou que a implementação inicial projetava o orçamento mínimo do fixed thinking do Provider como `maxOutputTokens.min` e oferecia um clamp público para o chamador ajustar a requisição silenciosamente. Isso fazia o dialeto do Provider vazar para o contrato comum de Model e fazia entradas genéricas como `workspace/generateText` alterarem a entrada do chamador.

Depois da correção, a Option pública declara apenas o valor padrão e o máximo. `maxOutputTokens` representa o limite rígido total de geração, compartilhado entre reasoning e resposta final; o Model só aceita inteiros positivos que não ultrapassem o teto. Os orçamentos fixos de Compact, Memory, WebFetch, WebSearch e ReadSessionContext pertencem à política de cada tarefa, e o chamador escolhe explicitamente o menor entre o orçamento da tarefa e o teto do modelo. `workspace/generateText` não ajusta mais a entrada silenciosamente, e o Model devolve um erro quando o valor estoura.

O mapeamento de reasoning existente do Adapter e a wire request permanecem inalterados. O fixed thinking continua, dentro do Adapter, limitando o orçamento da faixa a `maxOutputTokens - 1`, sem expor a restrição correlata como Option Spec pública. A migração de effort/adaptive nativo e a estratégia de distribuição `3/4` do fixed-budget ficam para um tópico futuro de Adapter.

### 14. O Repo Wiki preserva a fronteira de erro segura

O Repo Wiki já usa o Model da CLI via `workspace/generateText`. A exceção original retornada pelo Provider pode conter o corpo da requisição, e o Repo Wiki persiste o motivo da falha na task; por isso, a fronteira de Services só mantém o status HTTP seguro para publicação, e os demais corpos de erro são normalizados em uma mensagem de falha genérica. Abort e o próprio Deadline do Repo Wiki continuam preservando a semântica de controle original.

### 15. Compatibilidade com a injeção do Model Adapter mínimo antigo

O Adapter oficial de produção oferece `createModel()` e `resolveConnection()`, e o Bootstrap usa a Model Factory oficial. Alguns testes unitários e chamadas antigas embarcadas injetam apenas um Adapter mínimo de `generateText/streamText`; o Bootstrap não instala a fábrica oficial para esse tipo de objeto, deixando tudo cair na única fábrica de compatibilidade do Core. Esse ramo não adiciona um segundo conjunto de cadeia de chamada de produção.

### 16. A recuperação de truncamento do Repo Wiki é política de negócio

Depois que o Repo Wiki migrou para `workspace/generateText`, o Model unificado já produz `finishReason` estruturado e Usage, mas a primeira versão do protocolo de workspace devolvia apenas texto e identidade do modelo. Quando o cliente antigo de Wiki foi removido, a retry de escalonamento que dependia de `finish_reason=max_tokens` se perdeu junto: o catálogo podia falhar por JSON truncado, e a página podia salvar Markdown truncado como resultado de sucesso.

Depois da correção, o resultado de workspace repassa `finishReason` e Usage. O Repo Wiki normaliza `length`, `max_tokens` e `max_output_tokens` em erro de truncamento na sua própria fronteira de chamada, e a política de retry existente de Catalog/Page aumenta o orçamento da requisição em um degrau: Catalog vai de 16384 para 32768, e Page de 8192 para 16384. O escalonamento acontece no máximo uma vez e não conta dentro dos retries normais configurados pelo usuário, e a requisição final continua sendo validada pelo Model conforme o teto `maxOutputTokens` do modelo.

Essa política continua pertencendo ao Repo Wiki. O Model só devolve o resultado real da chamada e valida a requisição, sem perceber o escalonamento de orçamento do Wiki e sem restaurar o cliente antigo de Provider, Endpoint ou protocolo do Wiki.

`finishReason` permanece opcional no schema de wire do workspace, para que outras chamadas que não dependem do fim da execução continuem conseguindo ler respostas antigas do app-server. O Repo Wiki não consegue compatibilizar com segurança resultados sem esse campo: Markdown truncado continua estruturalmente válido, e os Services não conseguem recuperar o fato de completude a partir do corpo. Por isso, ao encontrar uma resposta antiga, o Wiki falha explicitamente pedindo a atualização ou reinício do ZCode, sem degradação de tool nem retry normal, e sem salvar o Catalog/Page desta vez.

## Conclusões da revisão pós-implementação

- O conflito de Property da primeira versão retorna `InvalidModelRequest`, e ainda não foi adicionado invariant de OTEL; a estratégia de degradação de produto continua pendente de decisão por Property.
- O contexto de chamada usa AsyncLocalStorage e cobre o limite de consumo de Promise e de AsyncIterable.
- Um Provider com Header dinâmico pode renovar o material de autenticação antes do retry do Adapter; a identidade do modelo depois da renovação precisa ser igual à do Model atual.
- O Repo Wiki se integra pelo protocolo de workspace Host -> CLI já existente, e o problema de estratificação não se espalhou para a interface pública de Model.
- O antigo `ModelPort` e o `ModelTextRequest` continuam sendo objetos de migração internos do Adapter/fábrica de compatibilidade; os chamadores de negócio já não os constroem.
- A varredura de chamadores de produção de todo o repositório não encontrou clientes de modelo Repo Wiki/OpenAI/Anthropic conectados diretamente remanescentes; scripts, ferramentas de teste e documentos históricos não contam como chamadores de produção.
- O Embedded Search ainda usa a informação de Connection antiga para decidir o ramo, mas ele mesmo não dispara requisição de modelo e já está registrado como item de limpeza futuro de Provider/Capability, sem bloquear o M1.
- Guide/“立即” unificado como valendo dentro do Loop: ao entrar com sucesso no Loop atual, alterna ao mesmo tempo a Model Selection e o Model usados pelos Steps seguintes daquele Loop. Uma Submission comum continua fixando seu próprio Model quando o novo Loop começa.

### 17. Entrada de vídeo entra na Model Property unificada

O documento de design já define `supportsVideo` como Model Property, mas o contrato executável do M1 inicialmente implementava apenas imagem e PDF. Ao preparar a integração com a Registry Model Factory do M2, a lacuna foi descoberta e completada:

- `ModelProperties` carrega explicitamente `supportsVideo`;
- O Model valida a entrada de arquivo de vídeo antes da chamada ao Provider;
- A projeção de mídia do Core remove os dados bruts de vídeo quando o modelo não dá suporte explícito a vídeo, preservando um placeholder de texto rastreável;
- Enquanto a Factory antiga não fornece o campo, o tratamento conservador é `false`, e um Model criado pelo novo Registry precisa fornecer o valor explicitamente a partir do Model Config completo.

Essa mudança completa o contrato de Model já existente e não altera a estratificação de Provider Config, Registry ou Adapter.

## Registro de validação

Aprovados:

- `pnpm typecheck` do workspace da raiz.
- Typecheck de 23 pacotes da ZCode CLI, incluindo Contracts, Adapters, Core, Bootstrap e CLI.
- `pnpm lint` do workspace da raiz (0 error; os warnings existentes permanecem inalterados).
- Testes unitários completos do workspace da raiz antes do merge final do staging: 1148 arquivos, 9831 itens aprovados, 8 pulados.
- Testes completos do Adapter: 75 arquivos, 1159 aprovados, 3 pulados.
- Testes-chave de Core do M1: ciclo de vida do Model, Compact, Memory, WebFetch, WebSearch, ReadSessionContext etc.
- Testes-chave de Services: Git Commit Message, Repo Wiki, ZCode Protocol Client.
- Testes de geração de model de workspace e de protocolo de cancelamento do Bootstrap.
- Testes completos de Contracts após as correções de lacuna desta rodada e nova regressão de contexto de chamada com streaming: 28 arquivos, 202 itens aprovados.
- Testes completos do Adapter após as correções de lacuna desta rodada: 77 arquivos, 1191 itens aprovados, 3 pulados.
- Testes-chave de Services após as correções de lacuna desta rodada: 5 arquivos, 82 itens aprovados.
- `pnpm typecheck` e `pnpm lint` do workspace da raiz após as correções de lacuna desta rodada; lint com 0 error e 35 warnings existentes.

Após o merge final de `d8cf5a49a7`, os testes unitários completos do workspace da raiz foram executados novamente: 1171 arquivos, 9989 itens aprovados, 4 falhas e 8 pulados. Todas as falhas vêm de asserções de texto de código-fonte de Settings recém-entregues pelo staging nesta rodada; o branch atual e `origin/staging` não têm diferença nos arquivos de implementação e de teste relevantes. Os 155 testes de regressão pós-merge relacionados a Provider/Core passaram integralmente.

O teste unitário completo final do workspace da raiz após a auditoria de conclusão ficou com 1170 arquivos aprovados, 4 arquivos com falha e 1 arquivo pulado; 9989 itens aprovados, 5 falhas e 8 pulados. As quatro asserções de texto de código-fonte de Settings e o teste de sequência de reconexão do Web Remote estão todos em arquivos não modificados; as falhas de Settings podem ser confirmadas diretamente no código do staging, e o Web Remote é uma falha de sequência independente desta execução completa. As falhas de steering, resume title, marketplace, v4 boundary e telemetry mock nos testes completos do Bootstrap também foram revisadas no staging ou em arquivos não modificados, e não são regressões da migração de Provider.

Algumas falhas existentes nos testes completos de Core da ZCode CLI foram reproduzidas no workspace de staging não modificado, incluindo o teste antigo de steering e a dependência de caminho do cc-run local; essas falhas não foram introduzidas por esta migração. O lint completo da CLI ainda atinge a baseline de max-lines já existente no repositório, e o lint isolado dos arquivos alterados dá 0 error.

## Progresso

- [x] Merge do staging mais recente e verificação das mudanças relacionadas à chamada de modelo.
- [x] M1.1: tipos públicos, Wrapper de Model compatível, testes unitários.
- [x] M1.2: Agent Loop principal, Compact automático, Usage, Trace.
- [x] M1.3: Child Agent, Title, Goal verifier, Project Memory.
- [x] M1.4: Git, generateText de workspace, WebFetch, WebSearch.
- [x] M1.5: Repo Wiki.
- [x] M1.6: remoção das leituras antigas do lado de negócio e portão executável; falhas de baseline já existentes do repositório registradas separadamente.