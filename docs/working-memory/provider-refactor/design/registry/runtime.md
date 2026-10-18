# Limite de Execução do Registry

O Provider Registry mantém, em um processo, a Provider View do Environment ao qual pertence. O chamador pode ler a view atual consistente a qualquer momento; após mudanças no ZCode Built-in, Account Built-in ou Personal Provider Config, o Registry publica uma nova view e os Models já criados permanecem inalterados.

```text
Config / Account Sources
          |
          | change
          v
       Registry
       ├─ rebuild View
       ├─ replace indexes
       └─ notify consumers
          |
          v
新的查询与 Model 创建使用新 View
旧 Model 继续使用创建时的配置
```

## Registry View

A Registry View é um conjunto ordenado de Providers:

```ts
interface Provider {
  config: RegistryProviderConfig;
  models: readonly {
    modelId: ModelId;
    config: RegistryModelConfig;
  }[];
}
```

Esta é a Registry View executável: contém apenas modelos completos e enabled, incluindo os modelos sob Providers hidden e os Built-in Models que continuam valendo quando têm o mesmo nome de um Personal. Membros disabled e incomplete permanecem na Settings Resolution; membros duplicados são desambiguados na etapa de Inventory pela regra "manter o primeiro, Built-in-wins", e Config opcional ou `status` não são misturados ao Registry. O valor de retorno serializado do tipo completo também precisa continuar completo, sem reexpor aos consumidores de protocolo os campos optional da classe base esparsa.

Configurações e seleção de modelos são exibidas na ordem do array. Ao mesmo tempo, o Registry monta índices leves de consulta:

```text
Provider[]
├─ 对外有序 View
└─ providerById
   └─ modelById
      ├─ lookup
      └─ validate selection
```

Os índices referenciam o `RegistryProviderConfig` e o `RegistryModelConfig` da View, sem copiar um novo conjunto de fatos de configuração. O Registry não coloca na View HTTP Client, pool de conexões, credenciais dinâmicas nem estado de runtime do SDK do Provider.

Ao criar o Active Model, o ModelFactory congela em `Model.properties` o `properties` completo do Effective Model Config, como está. Core, Compact, Memory, Child Agent e Adapter leem diretamente dali o `input_format` / `output_format`; Runtime Config, Turn e Adapter Registry não mantêm um capability map paralelo. Quando não é possível passar o Active Model por uma fronteira assíncrona, só se pode passar um snapshot de Properties imutável com a mesma estrutura. Veja
[`../model/input-output-format.md`](../model/input-output-format.md).

O Registry não cria Models. O ModelFactory primeiro faz o lookup/validate no Registry e então entrega o Provider/Model Config completo ao Adapter como entrada privada para criar o Active Model; o Model público não expõe esses dois Registry Config.

## Active Model nos Passos de Execução

`ModelSelection` expressa apenas a intenção de seleção de Session ou Submission sobre "qual Model criar da próxima vez". Pode ser persistida, mas não pode ser usada para retroinferir um passo de modelo que já começou a executar. Cada passo de modelo cria um Active Model imutável pelo ModelFactory e passa o mesmo Model a todos os consumidores de execução desse passo:

```text
Session / Submission ModelSelection
                 |
                 v
             ModelFactory
                 |
                 v
        immutable Active Model
          |        |        |
          v        v        v
       Context    Tools    Adapter request
```

O Context Source guarda apenas fatos de ambiente como diretório de trabalho, plataforma, Shell, Git e Instructions, e não guarda snapshot do modelo em execução. A descrição do modelo no Context, as projeções de ferramentas ligadas ao modelo e as Options da requisição devem ser geradas a partir desse Active Model no início do passo de modelo; o Builder recebe o Model diretamente e não passa mais pelo campo `envInfo.currentModel`; o Core não mantém um mecanismo de sincronia que copia Session Selection para o Context e o atualiza repetidamente.

- uma Submission comum cria primeiro o Active Model na admission e só então o usa para inicializar o Context, rodar o Hook de SessionStart e disparar a requisição;
- o Off-Peak de escopo de execução usa seu próprio Active Model, mas não reescreve a Session Selection;
- o Guide cria um novo Model no próximo limite válido de model-step e o usa tanto para substituir o Context da requisição quanto as requisições seguintes;
- quando o Subagent herda o modelo pai, child Selection, Context e ModelFactory derivam todos do Active Model pai realmente passado;
- mudanças de Session Selection ou do Registry durante o passo ativo só afetam Models criados depois e não podem contaminar o passo atual.

Veja [`../../steps/todo-68-active-model-context-single-source.md`](../../steps/todo-68-active-model-context-single-source.md).

## Publicando uma Nova View

Após mudanças no ZCode Built-in, Account ou Personal ProviderConfigMap, o Registry executa novamente as duas rodadas de resolução de Provider e Model:

```text
旧 View v1
      |
Source change
      |
      v
构造并校验 View v2
      |
      v
一次性替换 View 与索引
      |
      v
onDidChange(revision)
```

Os consumidores observam apenas uma View completa em qualquer instante. Estados intermediários da construção não são publicados. Models existentes referenciam o ProviderConfig, ModelConfig e Options do momento da criação, portanto a substituição da View não muda silenciosamente um Agent Loop ativo.

Quando a leitura, a resolução ou a atualização de um Source falha, o Registry mantém a última View completa bem-sucedida e reporta o Source específico e o erro; ele não publica uma View parcial sem aquele Source. Quando um Source retorna com sucesso uma remoção, desativação, Config Map vazio ou conta inválida, esses são fatos novos e determinados e devem ser construídos e publicados normalmente.

O primeiro start usa uma restauração em camadas, em vez de tratar todas as entradas como barreiras ready equivalentes:

```text
Bundled 无效 ------------------------------> 启动失败
Active/LKG 无效或不可写 --------------------> 丢弃/绕过，使用 Bundled
Personal 无效 ------------------------------> 保留恢复备份，使用空 Personal Overlay
Account 首次解析失败 ------------------------> 账号 Provider access.entitled=false
Configured Default 无效 --------------------> 丢弃偏好，使用 Registry fallback
Resolver/Registry 内部完整性不变量被破坏 ----> 启动失败
```

Portanto, o Provider Runtime só pode bloquear o start quando não é possível estabelecer uma linha de base Built-in confiável ou quando a prova de integridade interna do código falha. Falhas parciais em cache descartável, preferências do usuário, Personal Overlay ou fatos dinâmicos de Account devem ser degradadas e reportadas, sem serem ampliadas para indisponibilidade do aplicativo inteiro ou do Agent.

## Consultas e Notificações de Mudança

Consumidores de longa duração adotam o padrão "ler, assinar invalidação, ler de novo":

```text
消费者启动
    |
    +--> registry.list...() 读取 View v1
    |
    `--> registry.onDidChange
                    |
                    v
              重新读取 View v2
```

A notificação de mudança indica que a View antiga foi invalidada. Os dados completos continuam sendo fornecidos pela interface de consulta, evitando que o payload do evento e o resultado da consulta formem duas fontes autoritativas. O evento pode conter revision, motivo ou escopo afetado; a granularidade final é definida na implementação conforme a necessidade de atualização da página de configurações e do seletor de modelos.

## Cada Processo Tem Sua Própria Instância

No mesmo Environment, os processos que precisam da capacidade de Provider mantêm cada qual sua instância de Registry:

```text
同一 Environment 的 Provider Facts
               |
       +-------+--------+
       |                |
       v                v
 Host Registry     Worker Registry
       |                |
       v                v
 设置、模型选择       创建 Model、执行

Prompt CLI / TUI
└─ 在自己的进程内使用同一 Registry 实现
```

Objetos Registry e Views em memória não são compartilhados entre processos; as implementações dos domínios Config, Account e Registry são compartilhadas. Quando o Host seleciona um modelo, ele lê o seu próprio Registry e a Submission carrega apenas ModelSelection; o Core Worker usa o Registry do Environment ao qual pertence para criar o Model de execução.

O objeto de montagem de cada processo é chamado de `ProviderRuntime`. Ele não acrescenta novos fatos nem modelos de estado, apenas conecta os componentes necessários ao processo:

```text
ProviderRuntime
├─ ProviderConfigRuntime
│  ├─ ZCode Built-in Config Source
│  └─ Personal Config Repository
├─ injected Account Built-in Config Source
├─ ProviderRegistryService
├─ ProviderSettingsFacade
└─ ModelSelectionFacade
```

O Account Built-in Config Source é injetado pelo Entry. Entries que ainda não oferecem Account Provider podem usar uma Source vazia e os Providers de API comum continuam funcionando por completo; Built-in Providers que precisam de restrição adicional da conta são definidos como `access.entitled=false` por um Overlay inicial fail-closed. Esse padrão expressa apenas que o Entry atual não tem direito de conta e não faz fallback para um Snapshot antigo.

Leitura de arquivos, escrita atômica, file lock, watcher de Built-in e revision polling de Personal pertencem ao ambiente de execução Node.js e não entram no pacote de domínio puro. Eles ficam concentrados em `@zcode/provider-node`:

```text
@zcode/provider
└─ Config / Resolver / Registry / Facade

@zcode/provider-node
├─ ZCode Built-in file source
├─ Personal file repository
├─ Config runtime
└─ process registry runtime
```

O Entry é responsável por localizar os arquivos físicos e injetar os caminhos explicitamente; `@zcode/provider-node` não pressupõe diretórios de instalação de Desktop, Worker, CLI ou TUI. Host e Worker leem cada qual os arquivos do mesmo Environment, e objetos Registry e Views não transitam entre processos.

A sincronização remota do ZCode Built-in pertence ao composition root do Environment. Local Host, Remote Host, Standalone Server e o Prompt CLI/TUI sem Host criam cada qual um owner de sincronização para o Environment ao qual pertencem; o Core Worker comum apenas lê e escuta o mesmo `active.json` injetado pelo Host e não requisita `/client/configs` por conta própria:

```text
Bundled Release ──┐
Active/LKG ───────┼─> 选择 max revision ─> active.json ─> Host Registry
Remote Release ───┘                              └──────> Worker Registry
```

Primeiro os candidatos válidos locais completam o ready, e o refresh remoto é executado em seguida em segundo plano. Vários processos combinam as requisições por meio do `refresh-control.json` ao lado do Active, file locks e leases curtos; Active e controle de refresh são isolados fisicamente conforme o Endpoint de plano de controle ZCode normalizado, sucesso usa TTL na ordem de uma hora, falha aplica backoff incremental e mudança de Endpoint não herda o TTL antigo. Um refresh explícito pode passar pelo TTL, mas não pode passar por um lease ainda válido. Remotamente só se aceita `/api/v1/client/configs.data.configs.zcodeBuiltin`; se a resolução for bem-sucedida e o revision for maior, o Active é substituído atomicamente primeiro e só então a cadeia existente de Source change dispara o refresh de Account e do Registry. Respostas antigas cujo Endpoint já mudou durante a requisição, assim como respostas que chegam após o dispose, não podem escrever em disco nem publicar.

A atualização do Registry continua afetando apenas Models criados depois; um Active Model já criado mantém os fatos congelados no momento da criação. Outros consumidores de Client Config, Session, filas, Continuous/Replayable e Provisioning remoto não pertencem a essa cadeia de sincronização.

Uma execução do Prompt CLI tem apenas um App, portanto o Registry nasce e morre junto com aquele Entry. O TUI pode substituir o App em `/new`, resume e fork; todos esses Apps emprestam o mesmo Registry do processo, evitando recriar o ciclo de observação de arquivos a cada troca de Session. Fechar um App não libera o Registry; a liberação acontece unificada quando o TUI Entry termina.

O Host expõe as Facades por dois canais independentes: `provider-settings` cuida da visualização e modificação do Personal Config e `model-selection` cuida da View de modelos candidatos e da validação de Selection. Os canais transportam apenas objetos comuns serializáveis; Classes de Config, Sources e instâncias de Registry ficam no processo do Host.

A validação de Selection cobre a semântica completa de seleção genérica: Provider e Model devem existir; um `reasoningLevel` explícito deve pertencer à Option Spec do modelo; um `maxOutputTokens` explícito deve ser um inteiro positivo e não ultrapassar o limite declarado pelo modelo. A validação apenas reporta erros e não modifica nem trunca os valores enviados pelo chamador. O Configured Default e as chamadas de Facade reutilizam o mesmo conjunto de validação de Option, evitando conclusões diferentes entre inicialização, página de configurações e entrada de execução.

O start de `ProviderRuntime` é uma barreira ready compartilhada pelas duas Facades. O Host pode registrar os canais RPC antes e iniciar o Runtime de forma assíncrona, mas `getView`, a pré-visualização, a escrita e a validação de Selection devem esperar a conclusão da primeira resolução das Sources de Config / Account. Chamadas concorrentes múltiplas compartilham a mesma cadeia de start do Registry e não cabe ao Renderer tentar de novo um estado interno de inicialização "ainda não iniciado".

O composition root do Host cria primeiro o Config Runtime, depois usa o Config Service dele para criar o Account Provider Service e, por fim, monta o Config Service e a Account Source juntos no Registry. `ProviderRuntime` aceita um Config Runtime já criado e não esconde uma segunda construção por dentro. A Account Source usa o ZCode Built-in Provider Config apenas como limite estático do Provider de conta e depois forma restrições a partir dos fatos da conta; ela não lê nem absorve o Personal Provider Config, e o Personal sempre sobrescreve depois do Account.

```text
ProviderConfigRuntime
└─ ProviderConfigService ─────┬──────────────> ProviderRegistry
                              │                         ^
                              v                         │
                 AccountProviderService                │
                 └─ Account Built-in ProviderConfigMap ─┘
```

O Client cria proxies separados para esses dois canais, e o `IServiceAccessor` compartilhado declara ambos como capacidades obrigatórias. O Local Host, o Remote Workspace Service Collection e o composition root Web home-only precisam todos fornecer uma implementação explícita; o Web home-only usa um serviço de View vazia para expressar "não há Environment anexado no momento" e não usa `undefined` como se fosse negociação de capacidade. Se uma versão remota diferente precisar de decisão de capacidade, deve-se usar a capacidade de protocolo explícita.

Uma implementação antiga enviava do Host um Snapshot completo do Registry para o Worker, que por sua vez mantinha um Workspace Catalog. O M2 já tirou o Entry oficial e o Harness interno dessa cadeia de fatos e passou a exigir a montagem do Process Registry. Os fatos de assinatura e de refresh entre processos da implementação antiga estão preservados em
[`../../research/m2-registry-aggregation-and-refresh.md`](../../research/m2-registry-aggregation-and-refresh.md).

O Account Built-in Provider Config usa uma fronteira de sincronização de nível de processo independente. Host e Worker mantêm cada qual seu Registry; o Host passa ao Worker apenas a Account Built-in Config Source formada pelo estado da conta, e não a View completa do Registry:

```text
Host Account Built-in Provider Source
        |
        | revision + ProviderConfigMap JSON
        v
provider/updateAccountConfig
        |
        v
Worker Account Built-in Provider Source
        |
        v
Worker Registry
```

Esse protocolo conecta apenas Host e Worker dentro do mesmo Environment. O Desktop Local Host e o Remote Host desktop-attached pertencem a dois Environments e não podem compartilhar Account Built-in Config por esse protocolo. O Remote Host precisa produzir o Account Built-in Provider Config a partir do seu próprio Config, Credential e Account Source e só então sincronizá-lo com o Remote Worker que ele gerencia.

```text
Desktop Environment                  Remote Environment
Local Host -> Local Worker           Remote Host -> Remote Worker
     account config                       account config

两个 Environment 之间的 Provisioning Sync
└─ 只写 Remote Config / Credential Store
   不直接调用 provider/updateAccountConfig
```

O diagrama acima define apenas a fronteira de propriedade do Environment. Provisioning remoto, operações de configuração remota, login e sincronização de configuração são capacidades de produto independentes e não fazem parte do escopo de implementação do Provider Refactor nem do M4.

O Provider Config na mensagem é um objeto comum serializável e, ao chegar no Worker, é validado e resolvido pelo mesmo Schema de `@zcode/provider`. A Account Source aceita apenas `builtinModelIds` e só permite sobrescrever `entitled` para o Access fixo `zhipu-account`; o `enabled` de nível de Provider, a identidade de Access, API Key, Secret e materiais de autenticação no momento da requisição não podem entrar no Registry por essa entrada. A mesma revision não é publicada de novo, e um processo novo precisa obter o Account Built-in Config atual antes de iniciar a execução de modelos.

As credenciais dinâmicas do Off-Peak Provider são injetadas apenas na Model request attempt e não pertencem à sincronização do Account Built-in Config. Sem Request Auth, o Model retorna um erro explícito de credencial ausente antes de disparar a requisição de rede; o Registry não guarda Secrets temporários para ele.

O `AccountProviderService` dentro do Host é ao mesmo tempo a Account Source do Registry. Ele lê o ZCode Built-in Provider Config atual do Config Service e resolve conta, plano e conexão de time como Account Built-in Provider Config. A responsabilidade do Account é restringir ainda mais os Providers ligados a conta dentro do Built-in e não participa do Personal Overlay. As requisições remotas são concluídas pelo Account Resolver injetado, e o Service em `@zcode/provider` em si não depende de rede, sistema de arquivos ou implementação de OAuth.

Cada publicação da Account Source registra `basedOnZCodeBuiltinRevision`. Quando o Registry recebe uma mudança de Built-in, ele mantém a última Registry completa até que o refresh de Account correspondente termine e não pode publicar a combinação de Built-in novo com Account antigo; mesmo que o conteúdo do Overlay não mude, uma mudança na revision de origem precisa formar um novo Account Snapshot. Mudanças em Personal não disparam essa espera.

```text
ZCode Built-in Provider Config
          |
          | Account Resolver 施加账号约束
          v
Account Built-in ProviderConfigMap
```

O primeiro `read()` é a primeira tentativa de resolução dos fatos de conta; mudanças posteriores de Config ou eventos de conta chamam `refresh()`. Após um refresh bem-sucedido o Account Snapshot é substituído atomicamente e o Registry é notificado. Quando o refresh falha, o último Snapshot bem-sucedido é mantido e o erro é reportado por evento; quando ainda não há Snapshot bem-sucedido no primeiro refresh, publica-se um Account Overlay fail-closed explícito com `access.entitled=false` baseado na mesma revision de ZCode Built-in, para que Providers de API comuns e Personal Providers continuem podendo iniciar. Essa degradação não forja disponibilidade de conta, membros de modelo ou Access; após um refresh bem-sucedido posterior a substituição é atômica.

## Limite de Refresh das Sources

O Registry recebe apenas o sinal unificado de que uma Source mudou:

```text
设置保存 ───────────────┐
外部配置变化 ────────────┤
ZCode Built-in Config 更新 ┼─> Source invalidate ─> Registry rebuild
Account Built-in Config 更新 ─┘
```

O Account Connection Resolver do lado de Services é responsável por traduzir o estado de produto existente em um Connection Result de domínio. Ele lê o domínio de conta atual, o modo de conexão de cada Provider Family, a conexão Individual/Team selecionada, a identidade da conta atual e o resultado da consulta de direitos; em caso de sucesso produz um conjunto completo de resultados de Provider, em que os Providers disponíveis carregam o estado de disponibilidade e o conjunto opcional de modelos.

O estado bruto de seleção das Settings não entra no Provider Config; quando não se está no domínio de conta atual, o `entitled` do Provider de conta continua sendo resolvido de forma independente pelos fatos de produto da conta; quando há falha de rede ou de serviço remoto, a rodada inteira de resolução falha e o Account Provider Service mantém o Snapshot bem-sucedido anterior por completo, sem publicar resultados parciais.

```text
Account Settings + Credential Port + Plan API
                    |
                    v
      Account Connection Resolver
                    |
                    | status + models?
                    v
        AccountProviderService
                    |
                    v
        Account Built-in ProviderConfigMap
```

Individual, Team e Start correspondem a Built-in Providers independentes de tipo fixo, expressos explicitamente pelo `mode` e pelo `family` do Built-in Access. O Resolver projeta apenas `access.entitled` e os membros de modelo da conta Start; identidade da conta, escopo de Team, Token, Runtime Key e Header ficam por conta do Account Connection/Request Auth. Quando não há resultado remoto dedicado para membros de modelo, o resolvedor de domínio segue a ordem do Built-in Config atual; quando é possível obter um conjunto autoritativo de modelos pela interface de direitos, ele deve ser fornecido junto com o Connection Result.

O composition root de produção do Local Host cria diretamente o `AccountProviderService`. As mudanças de Config são assinadas pelo próprio Service; as configurações de conexão de conta e os fatos de conta disparam, por eventos estreitos separados, a mesma cadeia de `refresh()`:

```text
ObservableSettingService.onDidUpdate
└─ providerFamilyDomain / providerFamilyConnectionSelections / endpoint origin
                                                        │
ModelProviderServiceRuntime.onDidInvalidateAccountFacts │
└─ 登录预置、套餐入口、Coding Plan Key 与可用性变化 ─────┤
                                                        v
                                      AccountProviderService.refresh()
```

Salvamento, remoção de um Provider comum e atualização de runtime header não disparam refresh de conta. O antigo `onDidChangeProviderRegistry` não carrega mais a invalidação de Account local; o conteúdo do refresh é sempre recalculado pelo Connection Resolver a partir de Config, configurações de conta, porta de credenciais e interface de direitos.

A cadeia de compatibilidade de Snapshot histórico de `desktop-attached-remote` já saiu do caminho de produção. O Entry de produção precisa montar o Process Registry; a ausência de Registry é um erro de composition root e não é mais restaurada por antigos tipos de protocolo ou por fallback em runtime. A propriedade dos dados de Provider do Environment remoto permanece sempre no próprio lado remoto.

Watchers de arquivo, revision polling de Personal, mtime, interfaces de Plan remotas, cache e deduplicação de concorrência pertencem à implementação de cada Source ou serviço de configuração. Os chamadores do Registry não têm ciência desses mecanismos.

A implementação atual já usa notificação ativa, observação de arquivos de Source e deduplicação por revision: o salvamento de configurações espera o Repository terminar e depois usa o `refresh()` do Registry como barreira de commit; outras mudanças de processo no Personal Repository se auto-curam por revision polling assíncrono de baixa frequência, e a mesma revision não publica a View de novo. O teste de conexão faz um refresh explícito do Registry do Worker atual antes de procurar Provider/Model, portanto não espera a próxima rodada de polling e não cria Model por um desvio a partir do Snapshot do Host. Chamadores de consulta comuns não são responsáveis por verificar mtime manualmente.
