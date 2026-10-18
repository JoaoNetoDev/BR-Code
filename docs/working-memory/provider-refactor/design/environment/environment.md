# Blueprint do Environment em que o Provider está

> Este documento é um modelo mental para entender a propriedade do Provider, o modo de implantação e os limites de longo prazo; não é uma descrição da implementação atual nem o escopo de construção que o refactor de Provider desta rodada precisa concluir de uma vez.

O design do Provider precisa servir simultaneamente à máquina local, ao SSH e ao futuro Cloud Environment. Aqui as responsabilidades de cada parte são descritas por papéis lógicos; um papel pode rodar no mesmo processo ou ser hospedado por um Host, um Worker ou um serviço remoto.

## Papéis lógicos

```text
Entry
├─ Desktop App
├─ Prompt CLI
├─ TUI
└─ Web / Remote Client
        |
        v
Environment
├─ Provider Config e fatos de conta
├─ Provider Registry
├─ Execução de Session e Agent
├─ Arquivos, comandos e capacidades de Git do Workspace
└─ Dados persistidos do Environment
        |
        v
Model Provider
```

Entry expressa a ação do usuário. Environment possui a configuração e os fatos de execução reais. Atravessando processos ou rede, a Environment API se responsabiliza por transporting parte das capacidades expostas; Services internos do Environment, como Agent, Registry e arquivos, cooperam por interfaces in-process ou injeção de dependência.

A Environment API é um limite de implantação; não exige que todos os Services se tornem Servers separados.

## Propriedade do Provider

O Environment que executa o Agent possui o Provider Config, os fatos de conta e o Registry:

```text
Local Environment
└─ Local Provider facts / Registry

SSH Environment
└─ Remote Provider facts / Registry

Cloud Environment
└─ Cloud Provider facts / Registry
```

Desktop, Prompt CLI, TUI ou Web são apenas Entries diferentes. Eles consultam, selecionam e executam modelos através do Environment alvo. O SSH Environment acaba usando os Provider facts remotos próprios; o App local não deve se tornar a fonte permanente de fatos da configuração de Provider remota.

## Limite do domínio de Provider

O domínio de Provider recebe as seguintes entradas:

```text
ZCode Built-in Provider Config
Account Built-in Provider Config
Personal Provider Config
ZCode Built-in Model Config Rules
Personal Model Config Rules
ModelSelection
Service de autenticação na requisição
Dependências do Provider Adapter
```

Ele expõe para fora:

```text
Provider Registry View
Model selection / settings facades
Model creation
Model request execution
Usage / Trace identity
```

O domínio de Provider não percebe se a configuração vem de JSON, banco de dados, memória do Host, RPC ou de um serviço de gerenciamento remoto. Renderer, React, Electron, Session Runtime e implementações concretas de persistência também não viram dependências dos módulos centrais do Provider.

## Reuso in-process

`zcode-cli` é o pacote e o executável físico, contendo três papéis de Entry／execução além de um Core comum:

```text
zcode-cli package / executable
│
├─ Shared Core
│  └─ Agent, Submission, Registry, Model, Adapter
│
├─ Core Worker
│  └─ empacota o Shared Core como um processo de protocolo stdio
│
├─ Prompt CLI
│  └─ invoca o Shared Core no processo atual
│
└─ TUI
   └─ invoca o Shared Core no processo atual
```

Prompt CLI, TUI e Core Worker reutilizam a mesma implementação do domínio de Provider. Prompt CLI e TUI podem montar no processo atual arquivos, comandos, rede e Session Store locais; não precisam iniciar um Server para chamar o Core.

Gerenciamento de janelas, Workspace remoto, sincronização operacional e integrações nativas de plataforma ficam a cargo do Host ou de Services de Environment dedicados, e não precisam ser duplicados dentro do CLI／TUI.

## Mapeamento atual do Desktop

A seguir descreve-se apenas como o processo Desktop atual hospeda os papéis lógicos acima:

```text
Renderer
    |
    | MessagePort / Service RPC
    v
Local Host
├─ Provider settings e capacidades periféricas de conta
├─ Ciclo de vida de Workspace / Worker
├─ Agendamento de tarefas off-peak
└─ Remote connection
    |
    | stdio Agent Protocol
    v
Core Worker
├─ Shared Core
├─ Agent Loop
├─ Model / Adapter
└─ Session execution
```

O App atual gerencia o Core Worker por Workspace, para isolar o crash de um Worker do impacto sobre outros Workspaces e sobre o Host. Essa é uma estratégia de implantação e estabilidade, e não define que o domínio de Provider precisa replicar sua implementação por Workspace.

Host e Worker usam a mesma implementação do domínio de Provider e constroem cada um seu Registry a partir dos fatos do Environment ao qual pertencem. O Snapshot completo do Registry já saiu da cadeia oficial de fatos; o M4 também removeu o `turnRuntimeModel` / Runtime Overlay que as tarefas off-peak usavam. O Host fornece apenas a Selection padrão e o Request Auth dinâmico em cada dispatch, sem mais distribuir snapshots estáticos de Provider／Model.

## Implantação SSH e Cloud

```text
Desktop / Web Entry
        |
        | SSH / HTTP
        v
Remote Host Server
        |
        | local protocol / stdio / in-process
        v
Remote Core Worker
        |
        v
Shared Core
```

O Remote Host Server expõe capacidades entre redes e responde por conexão, autenticação e ciclo de vida do Worker. O Remote Core Worker continua usando as mesmas interfaces de Registry, ModelFactory, Model e Adapter da máquina local.

Capacidades de alta frequência, como arquivos e comandos, podem ficar em um cluster de serviços diferente, no mesmo datacenter do Agent; se isso cruza ou não processos é decisão de implantação. O Core depende de interfaces de capacidade e não escreve a forma do RPC na lógica de execução do Agent.

## Publicação da Built-in Config do ZCode e sincronização do Environment

O servidor publica atomicamente a ZCode Built-in Provider Config e as ZCode Built-in Model Config Rules pelo endpoint já existente `/api/v1/client/configs.data.configs.zcodeBuiltin`:

```text
Bundled / Remote ZCode Built-in Release
├─ Provider Config
└─ Model Config Rules
        |
        | Environment owner fetch / cache
        v
Environment `<platform>/<appVersion>/<endpointKey>/active.json`（também responde pelo LKG desse Endpoint）
├─ Host Registry
└─ Core Worker Registry
```

Cada Environment guarda em cache apenas o seu próprio Active; o Desktop não envia Built-in local a um Environment remoto. O Host responde pela atualização remota e o Worker apenas consome o arquivo ativo. Quando não há Host, Prompt CLI／TUI assumem a mesma responsabilidade pela sua própria Entry. Se o serviço estiver temporariamente indisponível, continua-se usando o Bundled ou o LKG; a versão é ordenada por revisão de Release, e o cliente não adivinha o que é mais novo pelo horário do arquivo.

Aqui, Endpoint é a Origin do plano de controle do ZCode configurada atualmente no Environment, não o Endpoint de API de modelo. Endpoints diferentes usam Active／LKG e diretórios de controle de atualização diferentes; não há comparação ou rollback de revisões entre Endpoints.

Essa implementação não uniformiza outras requisições de Client Config, nem altera Overlay de Personal／Account, credenciais ou a autorização final do servidor.
Os gates de integridade de negócio, canário e auditoria da publicação Built-in continuam sendo trabalho seguinte do processo de release.

## Autoridade de Provider do Remote Environment

Quando o Desktop se conecta a um Workspace remoto, o Remote Environment continua possuindo seu próprio Provider Config, Credential Store, Registry e ModelFactory. `desktop-attached` expressa apenas que o Desktop pode operar esse Environment remotamente; não significa que o Provider Runtime do Desktop Environment se estenda ao remoto:

```text
Desktop Entry
├─ exibe Remote Settings / Selection View
├─ submete ModelSelection
└─ controla Remote Session
        |
        v
Remote Environment
├─ Remote Provider Config
├─ Remote Credential Store
├─ Remote Provider Registry
└─ Remote ModelFactory
```

O Desktop não injeta no Remote Worker o Snapshot completo do Registry, o Runtime Model, o Account Built-in Config nem credenciais de requisição. O Remote Worker sempre cria o Model a partir do Registry do Remote Environment ao qual pertence.

Como configuração e credenciais chegam ao remoto é uma capacidade de produto de Provisioning independente; não muda a autoridade de runtime nem faz parte do escopo de implementação deste Refactor de Provider ou do M4. Abaixo ficam apenas os limites de propriedade que precisam ser preservados:

```text
Passo 1: o remoto se torna a única fonte de fatos de execução
└─ remover a injeção de Provider Runtime de Desktop -> Remote

Passo 2: a funcionalidade de sincronização independente continua gravando no Store remoto
Local Config / Credential
        |
        | automatic provisioning sync de nível Remote Environment
        v
Remote Config / Credential Store
        |
        v
o próprio Remote Registry se reconstrói

Passo 3: o App opera remotamente as configurações e o login remotos
└─ chamar Remote Settings / OAuth Service
```

O Passo 2 tem o Remote Environment como única unidade de sincronização: múltiplos Workspaces／janelas compartilham uma única faixa single-flight do Desktop Main, e o Main apenas coordena identidade, geração e Host online; o Window Host selecionado lê a Local Source na hora e chama o Remote Target. O produto da sincronização precisa primeiro cair dentro dos limites de configuração e credenciais do próprio Remote Environment, e só então o Remote Source publica a mudança. A cadeia de sincronização não constrói diretamente Registry, Model ou cabeçalhos de requisição, nem se torna uma dependência online de cada requisição de modelo. Mesmo que a sincronização pare temporariamente, o remoto continua rodando com os fatos locais da última gravação bem-sucedida.

Editar a configuração remota diretamente no App ou iniciar um login remoto mais tarde é, do mesmo modo, apenas uma operação remota sobre o Service do Remote Environment. A troca e a persistência de credenciais acontecem no Remote Environment; o Desktop não trata o seu próprio Credential Store como fonte de autenticação das requisições remotas.

## Sincronização de configuração entre Environments

É possível sincronizar configuração explicitamente entre Environments. O Environment alvo grava o resultado da sincronização no seu próprio limite de configuração e recompõe o Effective Provider usando a sua própria ZCode Built-in Config e a Account Built-in Provider Config:

```text
Environment A Personal Config
          |
          | explicit sync
          v
Environment B Provider Config Service
├─ Environment B ZCode Built-in Config
├─ Environment B Account Built-in Provider Config
└─ synced Personal Config
          |
          v
Environment B Registry
```

O protocolo de sincronização ainda precisa definir o Environment alvo, o tratamento de conflitos e a política de credenciais e de campos gerenciados. A sincronização pode rodar continuamente, mas responde apenas por atualizar o Store do Environment alvo; a atualização do Registry e a execução de modelos continuam acontecendo por inteiro dentro do Environment alvo.

## Os dois tipos de estado do Account Built-in Provider

```text
Fatos estáticos de seleção
├─ ZCode Built-in Provider Config
├─ ZCode Built-in Model Config Rules
└─ Account Built-in Provider Config
   └─ enabled + membros de modelos da conta Start

Estado dinâmico de requisição
├─ Token de login
├─ Verificação de segurança pontual / Header dinâmico
├─ Cache e atualização
└─ Atualização forçada após falha de autenticação
```

O Registry usa os fatos estáticos de seleção para decidir quais Providers e Models existem no momento. O estado dinâmico de requisição é gerenciado por um Service dedicado e fornecido quando o Model／Adapter realmente faz a requisição. Os limites detalhados estão em [`../registry/model-creation.md`](../registry/model-creation.md).

Start Plan, Individual Coding Plan e Team Plan têm cada um seu `providerId` estável e compartilham o tipo Account Provider e a infraestrutura de execução; o Provider Family serve apenas para agrupamento de produto e não substitui o `providerId`. A seleção normal de conexão estruturada habilita apenas um Provider correspondente, de modo que a Model Selection só exibe a conexão atual; as Settings podem exibir simultaneamente esses Providers fixos e seu estado de habilitação, sem deixar o mesmo Provider se metamorfosear em runtime entre Individual e Team.