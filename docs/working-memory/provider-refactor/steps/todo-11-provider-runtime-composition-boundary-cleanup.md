# 11 Limpeza dos limites de composição do Provider Runtime

> Estado: rascunho
>
> Data: 2026-08-25
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Designs relacionados: [`../design/registry/runtime.md`](../design/registry/runtime.md), [`../design/environment/environment.md`](../design/environment/environment.md), [`../design/registry/configuration.md`](../design/registry/configuration.md)
>
> Tarefas relacionadas: [`06`](./todo-06-config-storage-envelope-repository-privatization.md), [`08`](./todo-08-legacy-model-catalog-retirement.md), [`10`](./todo-10-zcode-builtin-provider-config-naming-cutover.md)

## 0. Limites do rascunho

Este documento guarda apenas o resultado da revisão de 2026-08-25 sobre os limites de composição da nova implementação de Provider. A discussão atual ainda não terminou; a estrutura alvo, a API pública, a nomenclatura e o escopo de remoção **ainda não foram decididos**. Enquanto o estado não mudar de "rascunho" para "pronto para execução":

- não se deve modificar código de produção com base neste documento;
- não se deve escrever estruturas candidatas como Design formal;
- não se deve remover a casca de Runtime existente nem alterar o ciclo de vida do processo;
- não se deve tratar os nomes de exemplo aqui como contratos estáveis.

Este trabalho fica em espera. Ao retomar a discussão, deve-se começar pelas questões pendentes da seção 8, e não executar diretamente as direções candidatas da seção 6.

## 1. Questões em revisão

Esta rodada não revisa a M4 nem continua a limpeza da abstração antiga de modelo. Ela responde apenas a uma nova questão de implementação: a montagem do Config, Registry, Settings Facade e do processo de execução atual formam, por não terem levado a abstração a seu limite, várias camadas duplicadas de casca de Runtime, propriedade de recursos ambígua e código de ponte desajeitado?

Os objetos em foco são:

1. `NodeProviderConfigRuntime`;
2. `NodeProviderRegistryRuntime`;
3. `ProviderConfigRuntime` de Services;
4. `ProviderRuntime` de Services;
5. as duas raízes de composição reais, do processo Host e do processo de execução do Agent.

## 2. Situação atual confirmada pelo código

### 2.1 Quatro camadas de casca de Runtime

| Objeto atual                     | O que realmente possui ou monta                                                                                        | Situação atual das chamadas                                            | Fato da revisão                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NodeProviderConfigRuntime`      | Source de arquivo Built-in do ZCode, Repositório Personal, `ProviderConfigService`, watcher/dispose               | Usado pelas duas camadas acima; `createNodeProviderConfigRuntime()` não tem chamada de produção | É sobretudo um conjunto de recursos de IO do Node; `start()` apenas chama `configService.read()`, sem estado de execução próprio |
| `NodeProviderRegistryRuntime`    | O Config Runtime acima, `ProviderRegistryService`, Account Source opcional                                          | Em produção, usado pelo process root do Agent; a factory não tem chamada de produção | Embrulha mais uma camada de ciclo de vida de Registry e embute um segundo fallback de Empty Account                 |
| `ProviderConfigRuntime` de Services | Node Config Runtime, caminho Personal padrão, Legacy Personal importer                                          | Usado pela raiz de composição de produção do Host                       | O comentário de arquivo já diz que é uma "camada de montagem de compatibilidade"; depois que o limite de leitura Legacy for realmente aposentado, a responsabilidade de longo prazo pode ser apenas a resolução de caminhos |
| `ProviderRuntime` de Services    | Config, Registry, Facade de Settings/Selection, adaptador de serviço RPC, promise de prontidão, dispose do Account Source | Usado pela raiz de composição de produção do Host; a factory genérica é usada sobretudo por testes | O comportamento de Host é uma necessidade real, mas o nome e a superfície pública descrevem a montagem específica do Host como um Runtime genérico |

Nem todos esses objetos são código errado. O Source de arquivo do Node, o Repositório Personal, o Registry, o Facade, o Account Source e o watcher têm responsabilidades reais. O problema é que eles são embrulhados várias vezes como "Runtime", fazendo `start`, `dispose`, Source vazio e propriedade se expressarem repetidamente em camadas diferentes.

### 2.2 Duas raízes de composição reais de processo

O sistema atual não tem apenas um Provider Runtime, mas duas entradas de montagem de processo com propósitos diferentes:

```text
                         同一份静态 Config 文件事实
                                   |
                   +---------------+---------------+
                   |                               |
                   v                               v
            Host 进程组合根                 Agent 执行进程组合根
                   |                               |
       Account Service / Source          Account Snapshot / Source
                   |                               |
                   v                               v
          Host-local Registry              Worker-local Registry
          |              |                         |
          v              v                         v
   Provider Settings  Model Selection          ModelFactory / Core
       RPC Facade       RPC Facade                模型执行
```

Cada lado manter seu Registry dentro do processo é o design existente, não uma duplicação a eliminar:

- o Registry do Host serve às Provider settings, à pré-visualização de escrita Personal e aos candidatos de modelo do usuário;
- o Registry do Agent serve ao `ModelFactory` e à execução de modelos;
- os dois leem os mesmos fatos estáticos de Config, mas possuem seus próprios índices em memória e ciclo de vida;
- o Host sincroniza para o Agent a Model Selection padrão e o snapshot/revision de Account Config, sem passar um snapshot mutável do Registry.

### 2.3 Responsabilidades concretas da raiz de composição do Host

O Host monta hoje, em `packages/services/src/node.ts`, na seguinte ordem:

```text
createProviderConfigRuntime
        |
        v
createAccountProviderConfigSource(configService, settings, account services)
        |
        v
createProviderRuntimeFromConfigRuntime
        |
        +--> ProviderRegistryService
        +--> ProviderSettingsFacade / RPC service
        +--> ModelSelectionFacade / RPC service
        `--> Account refresh/dispose ownership
```

Suas características reais são:

- vive por um longo prazo junto com o Local Host / Service Collection de escopo de janela;
- o Config Service precisa ser criado primeiro, porque o próprio Account Source depende do mesmo Config;
- Settings pode modificar o Personal Config e ler a pré-visualização efetiva autoritativa;
- os canais RPC podem ser registrados sincronamente primeiro, portanto várias primeiras chamadas precisam compartilhar a mesma promise de Registry pronto;
- o teste de conectividade passa pelo Agent, mas a View autoritativa de configurações e seleção continua no Host;
- não deve alterar as semânticas de Desktop continuous, Mobile replayable, remote workspace ou fila de tarefas.

### 2.4 Responsabilidades concretas da raiz de composição do processo de execução do Agent

O Agent hoje usa `startProcessProviderRegistryRuntime()` para servir ao Protocol Worker, ao Prompt CLI e ao TUI:

```text
resolveNodeProviderRuntimePaths
        |
        +--> NodeProviderRegistryRuntime
        |      |- Config Runtime
        |      `- Process-local Registry
        |
        +--> MutableAccountProviderConfigSource
        +--> Model Selection Config Repository
        +--> Standalone credential subscription（仅 Prompt/TUI）
        `--> request-auth/runtime-header port（按入口需要）
```

Suas características reais são:

- o Protocol Worker recebe do protocolo do Host o snapshot de Account Config;
- Prompt/TUI standalone derivam o Account Config do Credential Store local e escutam mudanças de credenciais;
- o Worker só precisa ler Config/Registry e não oferece entrada de escrita de Provider Settings;
- o Registry precisa terminar a inicialização explicitamente antes do uso por App/ModelFactory, sem a barreira lazy de prontidão via RPC do Host;
- o Prompt tem o ciclo de vida do comando; o TUI compartilha os recursos de processo entre `/new`, resume e fork; o Protocol Worker vive junto com o processo.

### 2.5 Problemas concretos de ciclo de vida já identificados

`startProcessProviderRegistryRuntime()` retorna dois objetos liberáveis:

```text
outer result.dispose()
|- 取消 Credential Store subscription
|- dispose Model Selection Repository
`- runtime.dispose()
   |- dispose Registry
   `- dispose Config watchers/repositories

outer result.runtime.dispose()
`- 只执行最内层 Registry/Config 清理
```

Prompt e TUI chamam o `dispose()` externo; o entrypoint do Protocol atualmente chama `providerRegistryRuntime?.runtime.dispose()`. Portanto a limpeza do Protocol contorna o Model Selection Repository pertencente à camada externa. Se alguma entrada standalone que possua uma subscription de credenciais também chamar o dispose interno, essa subscription vazará do mesmo modo. Este é um bug candidate concreto exposto por owners aninhados, e não apenas uma preferência de nomenclatura.

Esse defeito funcional não espera pela decisão de arquitetura deste documento; a semântica completa de liberação é restaurada separadamente por [`Todo 11A`](./todo-11a-provider-runtime-disposal-functional-fix.md). Este documento continua discutindo apenas os limites de composição e não implementa as refatorações candidadas por ocasião dessa correção.

## 3. Limites atuais que são razoáveis

Independentemente de como for decidido no fim, os seguintes fatos não devem ser removidos por "descolagem":

1. Host e Agent possuem cada qual seu Registry dentro do processo;
2. o Source de arquivo do Node, o watcher, as travas, a escrita atômica e o dispose do Repositório Personal são responsabilidades reais de IO;
3. Account Source e Source de Config estático são fontes de fatos diferentes;
4. o alvo de mutação das Provider Settings e o adaptador de facade RPC são portas reais; o Renderer não deve operar o Repositório diretamente;
5. a dependência de execução do Worker é um Registry somente leitura, enquanto a dependência de configurações do Host é mutação Personal; os dois lados não precisam das mesmas capacidades públicas;
6. Account Snapshot, Model Selection e Request Auth continuam pelas fronteiras padrão existentes;
7. não criar um Runtime onipotente com dezenas de parâmetros opcionais que seja ao mesmo tempo compatível com Host/Worker/Prompt/TUI.

## 4. Candidatos para o limite de recursos de Config do Node

A rodada anterior de discussão propôs que `NodeProviderConfigRuntime` é essencialmente mais próximo de um conjunto de recursos de Config compartilhados do Node do que de um novo Runtime de domínio. Essa é uma **compreensão candidata, não uma nomenclatura ou API já decidida**.

### 4.1 Conteúdo candidato

- Source de arquivo Built-in somente leitura do ZCode no Node: parsing estrito, revision de conteúdo, eventos de watch/change, dispose;
- Repositório Personal do Node: read/update, trava de arquivo, escrita privada atômica, revision, deduplicação de watch, dispose;
- `ProviderConfigService`: combina as camadas ZCode Built-in e Personal, fornecendo leitura em camadas e mutação Personal;
- o dispose simétrico único dos recursos acima;
- schema/migration privados do repositório; o Legacy importer só existe temporariamente durante o prazo de compatibilidade.

### 4.2 O que o candidato não inclui

- Account Provider Source;
- Effective Provider Registry;
- Facade de Provider Settings / Model Selection;
- credenciais de Account, Request Auth ou runtime headers;
- Model Selection Config Repository;
- `ModelFactory`, Active Model, Adapter;
- serviço RPC;
- decisões de caminho padrão e lógica de materialização de pacote do Host/CLI.

Se essa camada for mantida, sua saída mínima pode ser apenas:

```ts
{
  configService,
  dispose,
}
```

Se precisa ser uma class, uma factory, um export público, e até mesmo se ainda deve usar a palavra `Runtime`, tudo está pendente de decisão.

## 5. Diferenças candidatas entre as duas raízes de composição

A tabela abaixo explica por que as duas entradas não podem ser forçadas em um único Runtime onipotente; ela não equivale ao design final de API.

| Dimensão                     | Raiz de composição do Host                             | Raiz de composição do processo de execução do Agent          |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Consumidores principais     | Provider Settings, Model Selection RPC                 | ModelFactory, Core, Adapter                                  |
| Capacidade de Config       | leitura + mutação Personal                             | o consumidor de execução precisa apenas leitura              |
| Origem da Account           | Account Service dirigido por Settings/OAuth/Entitlement | snapshot do Protocol ou Credential Store standalone          |
| Sequência de início         | o RPC pode ser registrado primeiro, primeira visita compartilha a barreira de prontidão | `await` explícito do início do Registry antes de criar o App |
| Model Selection             | fornece View de candidatos e validação do usuário      | lê o padrão configurado para o ModelFactory criar o Model    |
| Capacidade de configurações | sim                                                     | não                                                          |
| Subscription de credenciais | gerenciada pelos serviços de conta do Host             | possível em Prompt/TUI standalone; o Protocol Worker não deriva localmente |
| Ciclo de vida               | acompanha o Local Host / Service Collection             | Prompt de comando único, TUI de processo longo, processo do Protocol Worker |
| Resultado externo           | objeto de registro de Services/RPC                     | Registry, repo de Selection, porta de auth conforme a entrada |
| Princípio de liberação       | o owner mais externo do Host libera uma vez todos os recursos criados | o owner mais externo do process root libera uma vez todos os recursos criados |

## 6. Direção candidata de fechamento (não decidida)

O Candidato B é a direção que a revisão anteriorconsidered mais limpa: manter os recursos de Config compartilhados do Node e montar diretamente, nas raízes de composição reais de Host e Agent, as capacidades restantes.

```text
                   Node Config resources
                   |- Built-in Source
                   |- Personal Repository
                   |- ProviderConfigService
                   `- dispose
                            |
                +-----------+-----------+
                |                       |
                v                       v
       Host composition root   Execution process root
       |- Account Source       |- Account Source
       |- Registry             |- Registry
       |- Settings Facade      |- Selection Repository
       |- Selection Facade     |- optional auth resources
       `- one dispose          `- one dispose
```

Ele pode trazer as seguintes limpezas, mas nenhuma pode ser implementada agora:

- remover `ProviderConfigRuntime` de Services, deixando o Host decidir explicitamente o caminho Personal e o importer temporário;
- remover `NodeProviderRegistryRuntime`, deixando o process root do Agent montar o Registry diretamente;
- estreitar `ProviderRuntime` de Services para owner de composição exclusivo do Host, em vez de um framework de Runtime genérico;
- tornar o Account Source uma dependência explícita da raiz de composição, sem criar silenciosamente um fallback Empty nas camadas internas;
- achatar o valor de retorno de cada raiz de composição, permitindo que apenas o owner mais externo exponha `dispose()`;
- remover as factories de conveniência sem chamadas de produção e as entradas amplas que existem só para testes;
- o Worker consome Config apenas por interfaces somente leitura como `ProviderSource<ProviderConfigSnapshot>`, mesmo que o mesmo objeto também possua mutação Personal.

Nomes de exemplo como `createNodeProviderConfigResources`, `createHostProviderServices` e `startProcessProviderEnvironment` servem apenas para ajudar a discussão e não são decisões de nomenclatura.

## 7. Alternativas

### Opção A: manter as quatro camadas atuais e corrigir apenas o bug de ciclo de vida

- Vantagens: menor mudança, menor risco;
- Desvantagens: Runtime duplicado, fallback Empty, owner ambíguo e API pública ampla continuam existindo;
- Pré-requisito de aplicabilidade: a equipe considera que a conveniência dessas cascas é maior do que o custo de compreensão de longo prazo.

### Opção B: recursos de Config compartilhados do Node + duas raízes de composição explícitas

- Vantagens: os limites coincidem com as responsabilidades reais de processo; owner único de dispose; menos wrappers sem comportamento;
- Desvantagens: exige migrar em sincronia Host, Protocol, Prompt, TUI e helpers de teste;
- Risco: se a limpeza remover por engano um dos dois Registries independentes ou levar a capacidade de escrita do Host para o Worker, afasta-se do design existente.

### Opção C: estabelecer um Provider Runtime unificado

- Vantagens: superficialmente, o menor número de entradas;
- Desvantagens: exige muitas dependências opcionais e chaves de modo, mascarando as diferentes capacidades de início, escrita e origens de Account de Host/Worker;
- Tendência da revisão atual: não recomendado, mas deixado para a decisão oficial; este rascunho não declara a eliminação.

## 8. Decisões pendentes item a item

Ao retomar a discussão, é preciso confirmar item a item:

1. Se reconhece a fronteira de que "Config do Node é um conjunto de recursos de IO, não um Runtime de domínio";
2. Se esse conjunto de recursos usa class, factory ou apenas um helper privado da raiz de composição, e se é exportado publicamente;
3. Se `NodeProviderRegistryRuntime` deve ser removido, deixando o process root do Agent montar o Registry diretamente;
4. Depois que a leitura de compatibilidade do Legacy Personal importer realmente sair, se `ProviderConfigRuntime` de Services deve ser removido;
5. Se `ProviderRuntime` de Services é mantido e explicitamente alterado para exclusivo do Host, ou totalmente inline na raiz de composição do Host;
6. Se o Account Source deve ser fornecido explicitamente por cada raiz de composição; se a entrada sem conta deve criar explicitamente um Source vazio;
7. Se se deve unificar a regra de que "apenas o owner mais externo expõe dispose", proibindo owners aninhados liberáveis individualmente;
8. Se a barreira de prontidão do Host e o início eager do Worker são mantidos separadamente, sem mais abstração para um mesmo estado de início;
9. Se o Todo 11 ainda tem dependências pré-requisito reais com os Todo 06/08/10 já concluídos, ou pode ser implementado de forma independente;
10. Como os nomes finais, os exports públicos e as responsabilidades de nível de pacote serão expressos.

Antes de confirmar esses pontos item a item, este documento não pode entrar em "pronto para execução".

## 9. Impact Brief (rascunho)

### 9.1 Superfície de impacto

| Nível           | Relação                                    | Motivo                                                                   |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| must-inspect   | runtime de Config/Registry do `provider-node` | objeto direto da remoção ou estreitamento candidata                      |
| must-inspect   | composição de Host em Services              | Account Source, Facade de Settings/Selection, owner de ready/dispose    |
| must-inspect   | runtime de processo do Bootstrap             | Registry, repo de Selection, subscription de credenciais de Protocol/Prompt/TUI |
| must-inspect   | encerramento do Protocol                    | já existe um bug candidate que contorna o outer dispose                   |
| should-inspect | testes de Provider Node/Services/Bootstrap  | os testes atuais dependem muito diretamente da factory ampla de Runtime |
| invariant-only | semântica de Resolver/Registry de Provider Domain | não altera Overlay, integridade ou regras de candidatas                   |
| invariant-only | UI e estado entre plataformas               | não altera interação de configurações, estado de seleção, continuous/replayable, remote workspace |

Esta rodada não tem capacidade de consulta de codegraph disponível. As evidências da situação atual vêm da leitura do código-fonte alvo, de varreduras precisas de pontos de chamada com `rg` e da verificação de referências de export; antes da implementação oficial ainda é preciso rodar novamente o grafo de dependências e a descoberta de testes afetados.

### 9.2 Owner de estado

| Estado/recurso                                | Owner atual                                   | Alvo candidato                                  |
| --------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| watcher de Built-in Source / Repositório Personal | Node Config Runtime                          | owner de recursos de Config do Node            |
| mutação de Personal Config                    | ProviderConfigService                        | inalterado                                      |
| Account Source do Host                        | composição de Host em Services                | inalterado, mas entregue explicitamente ao owner do Host |
| Account Source do Agent                       | runtime de processo                           | inalterado, mas entregue explicitamente ao owner do processo |
| promise de prontidão do Registry do Host      | `ProviderRuntime` de Services                 | continua gerido pelo owner exclusivo do Host    |
| início do Registry do Agent                   | `NodeProviderRegistryRuntime` + process root  | candidato: await explícito pelo process root    |
| Model Selection Repository                    | resultado externo do process root             | continua gerido pelo process root               |
| Subscription de credenciais                   | resultado externo do process root             | continua gerido pelo process root               |
| liberação de todos os recursos               | `dispose()` em múltiplas camadas              | candidato: um único outer dispose por raiz de composição |

### 9.3 Invariantes que precisam ser mantidos

1. Os Registries de Host/Agent continuam existindo separadamente e não trocam Registries mutáveis;
2. Settings do Host só escreve Personal Config, e o Effective Preview continua calculado de forma autoritativa pelo servidor;
3. a execução de modelos do Agent continua passando por Registry -> ModelFactory -> Model;
4. os protocolos de snapshot/revision de Account Config e de Model Selection não mudam;
5. o comportamento existente de atualização de watcher de Config, revision, trava de arquivo, escrita atômica e importer não se perde por causa da mudança de wrapper;
6. em falha de start ou falha parcial de criação, todos os recursos já criados são liberados simetricamente conforme o owner;
7. dispose é idempotente e não pode ser contornado por objetos aninhados para fugir do owner externo;
8. não alterar Desktop continuous, Mobile replayable, remote workspace, Queue nem estado de recuperação;
9. não introduzir um segundo conjunto de fatos de Config, Registry, Account ou Model;
10. não usar a limpeza de composição para alterar a semântica de Account, Access, Request Auth ou de produtos de modelo.

## 10. Casos de aceite candidatos (ainda não aceitos)

Os Case IDs abaixo existem apenas para preservar a estrutura para a próxima discussão; antes de o Todo entrar em "pronto para execução" não constituem promessa de teste.

| Case ID | Setup                                         | Action                     | Asserção candidata                                                                                       |
| ------- | --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| PRC-01  | o Host precisa de Settings e Selection ao mesmo tempo | primeiras chamadas concorrentes aos dois RPC | o Registry é iniciado apenas uma vez, com resultado de prontidão compartilhado                     |
| PRC-02  | Config do Host e Account Source já montados   | salvar Personal Config     | o Effective Preview/Registry autoritativo é atualizado e o Account Source continua usando o mesmo Config Service |
| PRC-03  | o Protocol Worker já recebeu o snapshot de Account | criar o App e executar um modelo | o Registry local do Worker termina a inicialização antes do App, sem depender do objeto Registry do Host |
| PRC-04  | TUI standalone já iniciado                   | `/new`, resume, fork       | o mesmo Registry/watchers de processo são compartilhados, sem recriar recursos                       |
| PRC-05  | Prompt/Protocol/TUI encerrados separadamente  | chamar o respective outer dispose | Registry, config watcher, repo de Selection e subscription de credenciais são todos fechados         |
| PRC-06  | falha de início em qualquer etapa            | observar a limpeza         | todos os recursos criados são liberados e o erro original não é sobrescrito por erro de limpeza        |
| PRC-07  | Config ou Account Source são atualizados      | Host e Agent atualizam separadamente | os Registries locais dos dois lados acabam lendo o mesmo fato, sem passar snapshot de Registry     |
| PRC-08  | caminhos representativos de Desktop/mobile/remote | configurações, seleção, execução | a semântica de estado de UI, fila, replayable e workspace identity permanece inalterada          |

## 11. Não objetivos

- não tratar a M4;
- não continuar a limpeza de Core, ModelRef, Catalog ou Off-Peak;
- não alterar a semântica de Overlay de Provider/Model, propriedade de membros, enabled, visibility ou conflitos;
- não alterar Account Connection, Access ID, resolução de credenciais ou autenticação no servidor;
- não refatorar a UI de Provider Settings, o Model Selector ou o protocolo entre processos;
- não mesclar os Registries de Host/Agent;
- não criar novos estados intermediários de domínio;
- não aproveitar para tratar Telemetry, Queue, Recovery ou Remote Provisioning.

## 12. Portão de saída do rascunho para a execução

Somente se todas as condições abaixo forem satisfeitas o estado pode mudar para "pronto para execução":

1. a seção 8 tem todas as decisões humanas concluídas item a item;
2. as conclusões finais são escritas no Design formal e no Feature Graph;
3. a superfície real de chamadas é atualizada com grafo de dependências, `rg` e verificação de exports de TypeScript;
4. ficam definidos os objetos mantidos/removidos, a nomenclatura final, a API pública de nível de pacote e o owner único de dispose;
5. a seção 10 é transformada em um plano de teste aceito, com testes falhando escritos primeiro;
6. fica definido o escopo de regressão de falha de início e de liberação de Host, Protocol, Prompt e TUI;
7. confirma-se que as fronteiras de estado de Desktop continuous, Mobile replayable e remote workspace não mudam.