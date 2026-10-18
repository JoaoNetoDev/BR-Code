# Todo 26：Troca do contrato de Access Mode da Zhipu e aposentadoria dos campos de protocolo pseudo-genéricos

> Status: Concluído
>
> Data: 2026-08-27
>
> Precedência: O Todo 24 concluiu a limpeza de `accessId`, da vinculação na criação da conta e do tratamento especial por pathname na validação de segurança da requisição; este Todo, com base nas decisões posteriores de produto,
> substitui a estrutura-alvo dos três Access `api-key / zhipu-account / execution-provided`, do `planKind` e dos
> campos genéricos `challenge / requestSigning / executionProtocol` definidos no Todo 24. As demais conclusões do Todo 24 —
> autenticação dinâmica de conta, estreitamento do Account Overlay,
> isolamento de Credential privado e autorização final no servidor — continuam válidas.

## 1. Decisão final

O Provider Access deixa de descrever o protocolo do produto por meio de um conjunto de campos opcionais que parecem ortogonais, mas que só podem ser executados por produtos Zhipu específicos. A estrutura oficial mantém apenas dois Access Type
de primeiro nível:

```ts
type ProviderAccessConfig = ApiKeyAccessConfig | ZhipuAccountAccessConfig;

interface ApiKeyAccessConfig {
  readonly type: "api-key";
  readonly apiKey?: string | null;
  readonly apiKeyManagementUrl?: string | null;
}

type ZhipuAccountMode =
  | "api-key"
  | "start-plan"
  | "individual-coding-plan"
  | "team-coding-plan"
  | "off-peak";

interface ZhipuAccountAccessConfig {
  readonly type: "zhipu-account";
  readonly family?: "zai" | "bigmodel" | null;
  readonly mode?: ZhipuAccountMode | null;
}
```

Nesta rodada, `mode` é apenas um valor de enumeração comum; não se cria um objeto, uma Class ou uma discriminated union de segundo nível:

```json
{
  "type": "zhipu-account",
  "family": "bigmodel",
  "mode": "team-coding-plan"
}
```

A política de acesso específica dos produtos Zhipu é despachada somente por `access.type + access.mode`; `family` continua fornecendo o parâmetro do sistema de acesso, e o
Provider API Config continua fornecendo o Endpoint e o protocolo de API. Não se deve mais expor nem persistir as seguintes opções pseudo-genéricas:

```text
planKind
challenge
requestSigning
executionProtocol
execution-provided
```

Isso não é devolver os fatos de protocolo ao Provider ID, ao Model ID ou à URL, e sim fazer com que o conjunto limitado e real de acessos Zhipu se torne um fato discriminante oficial da Config.

## 2. Princípios de design

### 2.1 Type e Mode expressam o produto de acesso real

```text
access.type
├─ api-key
│  └─ acesso por API Key estático para serviços de modelo comuns
│
└─ zhipu-account
   ├─ family = zai | bigmodel
   └─ mode
      ├─ api-key
      ├─ start-plan
      ├─ individual-coding-plan
      ├─ team-coding-plan
      └─ off-peak
```

`zhipu-account` representa aqui a conta Zhipu e o sistema de acesso de produtos, incluindo a entrada em que a conta fornece a API Key dentro de uma Family fixa.
Não representa uma Config de Provider que gerencia credenciais dinâmicas de conta; a API Key, o JWT, o Ticket e o escopo de Team específicos são
resolvidos pelo Account/Credential Service do Environment atual.

### 2.2 Não criar campos de Config genéricos para o comportamento de um único produto

- A validação de segurança de acesso à versão oficial pertence apenas a `zhipu-account/start-plan`;
- A admissão estática do ZCode V4 pertence apenas a `zhipu-account/api-key`, `individual-coding-plan` e `team-coding-plan`;
- Fila Off-Peak, expiração de Ticket e retry pertencem apenas a `zhipu-account/off-peak`;
- Um `api-key` comum nunca entra automaticamente no ZCode V4 por causa de Endpoint, Provider ID ou Model ID;
- Ao adicionar um novo produto de acesso real, adicionar um valor de enumeração `mode`, o comportamento do ramo de Schema estrito e testes exaustivos — não inserir campos opcionais em todos os Access.

### 2.3 A Config encapsula chamadas, não decide autorização

O Provider Config determina como o cliente obtém o material da requisição, como encapsula as chamadas de API de modelo e como interpreta o protocolo do produto. Ele não comprova que a API Key, a conta, o plano ou a permissão do modelo são válidos, nem assume a autenticação final. Se as credenciais atuais estão utilizáveis e se a requisição está autorizada são decididos, respectivamente, pelo serviço de conta/credenciais do Environment atual e pelo servidor de modelos.

### 2.4 O Built-in possui a identidade estática da Zhipu

Para o Provider Zhipu Built-in fixo:

```text
ZCode Built-in Provider Config
├─ access.type
├─ access.family
└─ access.mode
        |
        v
Account Overlay
├─ não modifica o Access
├─ projeta o enabled correspondente ao estado da conta
└─ no Start projeta adicionalmente os builtinModelIds específicos da conta
        |
        v
Personal Overlay
└─ sobrescreve apenas os campos de usuário permitidos pelo seu Source Schema
```

`family/mode` não são estados dinâmicos do Account Service, nem opções genéricas da página de configurações. O Account Connection fornece apenas o login atual, a conexão atual, o plano,
o escopo de Team e o estado das credenciais. O Personal continua sendo a última camada de Overlay, mas não ganha por isso permissão para reescrever fatos exclusivos da origem Built-in como `group/family/mode`.
O Personal Overlay do Provider fixo `account:*` não escreve `access`; a API Key digitada manualmente pertence apenas ao Provider comum
`api-key`.

## 3. Mapeamento preciso dos Built-in Provider

### 3.1 Provider de API comum

Os seguintes Providers são pontos de entrada comuns de configuração e não usam o ZCode V4:

| Provider ID    | Access                | V4  |
| -------------- | --------------------- | --- |
| `zai-api`      | `{ type: "api-key" }` | Não |
| `bigmodel-api` | `{ type: "api-key" }` | Não |

Eles continuam com `group="standard-builtin"`, são gerenciados pelo fluxo comum de “Adicionar fornecedor” e ficam isolados do Account Connection, das
credenciais de conta, do enabled e da ordem fixa dos Family Provider.

### 3.2 Family API Key Provider

| Provider ID                | Access                                           | V4  |
| -------------------------- | ------------------------------------------------ | --- |
| `account:zai-api-key`      | `zhipu-account / family=zai / mode=api-key`      | Sim |
| `account:bigmodel-api-key` | `zhipu-account / family=bigmodel / mode=api-key` | Sim |

Eles pertencem à UI de Family fixa. O Built-in apenas declara `type/family/mode`; a API Key real é fornecida pelo sistema de contas atual,
resolvida em tempo de requisição pelo Account/Credential Service, e não é gravada no Personal Config, no Account Overlay, no Registry nem no Active Model.

A implementação atualmente publicada transformou esses dois Providers `account:*` também em Providers de API Key digitada manualmente, salvando a Key no Personal
Config. Esse é um estado intermediário que este Todo deve substituir diretamente, não o contrato de produto final.

A correção da implementação está em [`Bugfix 09：Limpeza da deriva de propriedade da Account API Key`](./bugfix-09-account-api-key-ownership-drift.md):
a página de configurações de Account API, a lógica de restauração do Family mode e a entrada de Key manual do Welcome não tratam mais o Provider de conta como um Provider de API Key
comum, e o limite de escrita rejeita mecanicamente o `access` Personal de um Account Provider fixo.

### 3.3 Coding Plan, Start e Off-Peak

| Entrada de produto                       | Access Mode              | Comportamento estático                                        |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| Z.ai / BigModel Start Plan             | `start-plan`             | Cadeia de material da validação de segurança da versão oficial; não entra no V4 |
| Z.ai / BigModel Individual Coding Plan | `individual-coding-plan` | Autenticação da requisição na conexão atual; tem admissão estática do V4 |
| Z.ai / BigModel Team Coding Plan       | `team-coding-plan`       | Escopo de Team e autenticação da requisição atuais; tem admissão estática do V4 |
| Z.ai / BigModel Idle Plan              | `off-peak`               | JWT, Plan Key, Ticket e protocolo de falha Off-Peak em tempo de execução; não entra no V4 |

Cada Provider mantém o Provider ID preciso existente, o `group`, a `visibility`, o Endpoint e os membros de modelo. O ID fixo continua sendo usado para a identidade do Provider,
ModelSelection e a persistência de tarefas, e não para deduzir o Mode.

## 4. Config, Schema e Overlay

### 4.1 Propriedade do Source Schema

| Source          | Fatos de Access que pode gravar                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| ZCode Built-in  | `type` completo; `family + mode` completos para Provider Zhipu; entrada de gestão de Key para Provider de API comum |
| Account Overlay | Não pode gravar nem substituir `access`                                                            |
| Personal        | Só permite API Key Access para Provider `api-key` comum/Personal; `account:*` fixo não permite gravar `access` |

O Schema oficial deve rejeitar estritamente campos que excedam a origem. A página de configurações não exibe editores de `family/mode` da Zhipu nem expõe a validação de segurança da versão oficial, o V4 ou o Off-Peak como
chaves booleanas avançadas.

### 4.2 Config esparsa e Effective completo

Nesta rodada não se cria uma união de Mode de segundo nível. A Config esparsa ainda pode deixar uma folha permitida como ausente ou explicitamente `null`, mas o Access Effective precisa ser completo:

```text
api-key
├─ type completo
└─ o Provider em execução tem uma API Key não vazia

zhipu-account/todos os Modes
├─ family completo
├─ mode completo
└─ não existem campos de configuração apiKey/apiKeyManagementUrl
```

A ausência de credenciais dinâmicas de conta não torna estruturalmente incompleta a Config estática do Provider; na requisição real, é o Request Auth que falha antes da rede.

### 4.3 Regras de Overlay

- Entre os Sources que podem gravar `access`, quando o `access.type` externo é igual, o Overlay ocorre por folha daquela Access Class;
- Quando o `access.type` externo de um Provider comum/Personal difere, o ramo Access inteiro é substituído;
- `mode` é uma folha de enumeração comum, sem protocolo de merge de segundo nível nem de substituição de segundo nível;
- O `access` dos Provider Zhipu Built-in fixos é declarado apenas pelo Built-in; Account e Personal não produzem nenhum Overlay de Access;
- A Config Effective não é persistida de forma independente e não pode ser escrita de volta no Source Built-in, Account ou Personal.

## 5. Despacho único em tempo de execução

```text
Provider Access Efetivo
          |
          v
Active Model congela type/family/mode
          |
          v
cada tentativa de request entra em um Handler único por type/mode
```

### 5.1 API Key comum

```text
type=api-key
└─ usa a API Key estática da Config
   └─ Transport comum, não entra no ZCode V4
```

### 5.2 Family API Key

```text
type=zhipu-account, mode=api-key
├─ resolve do Account/Credential Service da Family atual a API Key fornecida pela conta
├─ não lê a API Key do Personal Provider
└─ tem admissão estática do ZCode V4
```

### 5.3 Start, Individual e Team

```text
mode=start-plan
└─ conexão Start compatível atual + material da validação de segurança da versão oficial

mode=individual-coding-plan
└─ conexão Individual compatível atual + Coding Plan Key + admissão estática do V4

mode=team-coding-plan
└─ product/org/project + Team Key + admissão estática do V4 resolvidos na mesma conexão atual
```

O Active Model antigo congela apenas `type/family/mode` estáticos; a cada requisição o serviço de contas pode resolver o material conforme a conexão compatível atual e sua própria política de cache/refresh. Ele não vincula
a conta, o projeto de Team, as credenciais ou a versão da conexão no momento da criação.

### 5.4 Off-Peak

```text
type=zhipu-account, mode=off-peak
├─ family vem direto do Access, não é derivado de provider.group
├─ conexão Individual/Team compatível atual
├─ esta execução injeta JWT + Coding Plan Key + Ticket + Team Headers
└─ o Adapter habilita a fila Off-Peak, a expiração de Ticket e a semântica de retomada
```

O Off-Peak precisa resolver o escopo de Team e as credenciais a partir da mesma seleção de conexão e relê-los ou falha quando a conta/a seleção muda; não pode combinar materiais de duas gerações.

### 5.5 ZCode V4

A admissão estática do V4 é determinada apenas pelo seguinte conjunto de modos:

```text
zhipu-account/api-key
zhipu-account/individual-coding-plan
zhipu-account/team-coding-plan
```

A chave dinâmica de lançamento da validação de segurança de requisição da versão oficial e a implementação de protocolo permanecem inalteradas (os detalhes só são mantidos na versão oficial). Não se deve restaurar a inferência por URL, pathname, Provider ID ou Model ID.

## 6. Limites de Account, Credential e autorização

| Estado ou fato                            | Owner autoritativo                     | Entra no Provider Config？ |
| ---------------------------------------- | -------------------------------------- | -------------------------- |
| Built-in `type/family/mode`              | ZCode Built-in Provider Config          | Sim                        |
| Conta atual, estado de login e Family atual | Account Service do Environment atual | Não                        |
| Conexão de plano atual                    | Account Connection Selection            | Não                        |
| Team product/org/project                 | Account Connection Selection            | Não                        |
| Identidade de conta e Key física do Credential Store | Implementação privada do Credential Service | Não      |
| `enabled` da conta e projeção de modelos do Start | Account Overlay               | Sim, apenas os campos correspondentes |
| API Key comum digitada manualmente       | Personal Provider Config                | Sim, apenas `api-key`      |
| API Key/JWT/Ticket/Headers fornecidos pela conta | Account/Credential/Request Auth | Não                   |
| Chave dinâmica de lançamento do V4       | Runtime Config remoto                   | Não                        |
| Resultado da autorização final           | Servidor de modelos                     | Não                        |

A Config pública de produção, o Registry, o Active Model, o Protocol e a UI não podem reintroduzir `accessId`, `accountConnectionVersion`,
`bindingId` nem espelhos de identidade de conta. O Account/Credential Service pode manter a identidade privada necessária para isolamento de conta, escopo LKG, Credential Key física e single-flight;
essas chaves internas não podem atravessar para a configuração estática do modelo.

O last-known-good da conta só pode ser reutilizado dentro do mesmo escopo privado de conta. Quando o escopo de conta mudou, o Overlay antigo da conta não pode continuar fornecendo enabled nem o
conjunto de modelos do Start; enquanto o novo estado não for resolvido com sucesso, deve-se aguardar ou falhar de forma fechada.

## 6.1 Resultado da implementação（2026-08-27）

- O Provider Config e o Runtime foram convergidos para `api-key | zhipu-account`, e o acesso estático Zhipu usa `family + mode`.
- Built-in, Provider Schema, Registry, Active Model, Adapter e Bootstrap removeram
  `execution-provided`, os campos estáticos `planKind`, `challenge`, `requestSigning` e `executionProtocol`.
- O Account Overlay projeta apenas `enabled` e o conjunto de modelos de conta do Start; o Personal Source de um Provider `account:*` fixo
  rejeita estritamente `access`.
- O `ZCodeAccountAccess.planKind` dinâmico ainda expressa o resultado da resolução da conexão de conta atual, e não um campo estático do Provider Config.
- O Off-Peak mantém o Provider ID fixo, o Group e a semântica de runtime de Ticket/retry; o comportamento especial é
  conduzido por `access.type=zhipu-account + mode=off-peak`.
- A regressão direcionada de Provider, Provider Node, Services, Adapter e Bootstrap passou; na suíte completa do Adapter restam apenas duas falhas preexistentes sem relação com esta rodada
  (limpeza de processos descendentes, forma antiga esperada do Session Store).

## 7. Limites do Environment

Cada Environment de execução possui de forma independente os fatos de Provider e de conta:

```text
Environment Built-in/LKG
        +
Environment Account Overlay
        +
Environment Personal Config
        |
        v
Environment Registry / Active Model
        |
        v
Environment Account/Credential Service
```

Desktop Local, SSH, WSL, Docker e Standalone Server executam todos com os fatos locais do Environment de destino. O Desktop não envia Registry de Providers nem configurações de conta para o remoto.
Este Todo não altera Remote Provisioning, workspace identity, desktop continuous, mobile replayable, Session/Task Queue, Snapshot nem a semântica de recuperação.

## 8. UI Surface Matrix

| Cenário do usuário                       | Origem de exibição/draft              | Owner de submissão ou execução            | Comportamento deste Todo                              | Deve permanecer isolado                          |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Configuração de Provider comum           | Personal API Key Draft                | Provider Settings Service                | `zai-api/bigmodel-api` continuam como API Key comum, sem V4 | Não entram no fluxo Family Account         |
| Family API Key Z.ai/BigModel             | Account Connection e estado das credenciais | Account/Credential + Request Auth   | Mode Built-in fixo em `api-key`, sem digitação manual de Key | Não grava Personal access                   |
| Login e requisição de Start              | Account Connection + UI de validação de segurança | Account/Request Auth            | Entra na validação de segurança apenas por `mode=start-plan` | Não afeta a API Key comum            |
| Requisição Individual/Team               | Account Connection                    | Request Auth + Adapter                   | Resolve a Key atual por Mode, com admissão do V4    | Não congela a conta nem o escopo de Team          |
| Criação e execução Off-Peak              | Fixed Provider Selection + conta atual | Off-Peak Service + Adapter             | Executa por `mode=off-peak`                         | Não contamina o Session Selection comum          |
| Usage/Entitlement                       | Account/Subscription Service          | Usage Services                           | Não infere o estado dinâmico do produto a partir do Access Effective | Não altera a política de refresh e cobrança |

## 9. Fatias de implementação

### Slice A：Design oficial e testes de falha

1. Atualizar o Design de configuration, runtime, settings, model creation e access protocol com o `type + mode enum` de segundo nível deste Todo;
2. Marcar que os três Access Type do Todo 24 e a estrutura de campos genéricos de protocolo foram substituídos por este Todo;
3. Atualizar no Feature Graph o `accessId`, os campos genéricos de protocolo e as invariantes antigas de `request-auth`;
4. Adicionar primeiro os testes de falha de Schema estrito, propriedade do Source, mapeamento Built-in e despacho de Mode em runtime.

### Slice B：Config, Schema e Built-in

1. `ApiKeyAccessConfig` remove os campos genéricos de protocolo;
2. `ZhipuAccountAccessConfig` usa `family + mode enum` e remove `planKind`;
3. Remover `ExecutionProvidedAccessConfig` e `ProviderAccessProtocolInput`;
4. Atualizar Source Schema, Overlay, serialização, projeção Personal e validação de integridade;
5. Migrar todos os Built-in Provider; `zai-api/bigmodel-api` permanecem explicitamente como API Key comum e sem V4;
6. Family API Key, Individual, Team, Start e Off-Peak gravam o Mode preciso;
7. `ZhipuAccountAccessConfig` não declara campos de API Key, e o Personal Source não pode gravar `access` para o `account:*` fixo.

### Slice C：Account e autenticação em tempo de requisição

1. O Account Resolver trata apenas `zhipu-account`, enumera exaustivamente a disponibilidade por `mode`; o Start projeta adicionalmente o conjunto de modelos da conta;
2. O Account Overlay deixa de reconhecer `execution-provided`, `planKind` ou campos genéricos de protocolo;
3. O Request Auth resolve a conexão atual por `family + mode`; `mode=api-key` obtém a API Key fornecida pela conta atual, sem ler o Personal Config;
4. Team e Off-Peak mantêm a consistência de escopo/credencial da mesma seleção;
5. O Account LKG ganha ou mantém um escopo privado de conta contra mistura de estados, sem entrar na cadeia pública.

### Slice D：Protocol, Active Model e Adapter

1. O Protocol Shared/Agent usa a mesma estrutura `type/family/mode`;
2. O Active Model congela o Access Effective completo como está, sem criar DTO de capacidade;
3. O Adapter escolhe por Mode a Key estática, o Request Auth, a validação de segurança da versão oficial e o Handler Off-Peak;
4. Remover o consumo em runtime de `requestSigning`, `challenge`, `executionProtocol` e `execution-provided`;
5. Preservar o rollout dinâmico do V4 e a implementação do protocolo do Signer, sem restaurar nenhuma decisão de negócio por URL/ID/path.

### Slice E：Services, UI e limpeza

1. A UI de validação de segurança da versão oficial passa a reconhecer `zhipu-account/start-plan`;
2. A UI de Family mostra apenas as entradas de produto correspondentes ao Mode Built-in, sem controles de edição de Mode ou de API Key;
3. O formulário de API Key de login Family existente não persiste mais API Key Personal em `account:*`; a Key manual entra apenas no Personal Config dos Providers comuns
   `zai-api/bigmodel-api`;
4. A seleção Off-Peak continua usando o Provider ID fixo, e o comportamento de acesso olha apenas o Mode;
5. Usage/Entitlement continua lendo Account/Subscription, sem inferir estados dinâmicos a partir do Access;
6. Sincronizar o Design atual, o Feature Graph, o índice de passos e a nota de supersession do Todo 24.

## 10. Plano de testes e casos de aceitação

### 10.1 Config e limites de origem

- Parsing estrito dos dois Access Type de primeiro nível, Overlay, `null` e round-trip de JSON;
- Parsing completo dos cinco valores de enumeração de `zhipu-account.mode`;
- O Schema oficial rejeita `planKind/challenge/requestSigning/executionProtocol/execution-provided`;
- O Schema de Account rejeita `access`; o Schema Personal rejeita gravar qualquer `access` para o `account:*` fixo;
- Todos os Modes de `zhipu-account` rejeitam `apiKey/apiKeyManagementUrl`;
- Um Access Effective sem `family/mode` não pode entrar no Registry.

### 10.2 Mapeamento Built-in

- `zai-api/bigmodel-api` são `api-key` comuns e não entram no V4;
- Os dois Family API Key Provider são `zhipu-account/api-key`;
- Os Providers Z.ai/BigModel de Start, Individual, Team e Off-Peak declaram a Family/Mode corretas;
- O JSON Built-in não contém API Key real nem campos antigos de protocolo.

### 10.3 Prova vertical de runtime

- API Key comum usa Key estática e Transport comum;
- Family API Key resolve a Key do Account/Credential Service atual, não lê o Personal Config e só entra na validação de segurança de requisição quando a chave dinâmica está ligada;
- `zai-api/bigmodel-api` manual não chama o Account Request Auth e não entra na validação de segurança mesmo com a chave dinâmica ligada;
- Start entra apenas na cadeia de validação de segurança de acesso da versão oficial;
- Individual/Team resolvem a conexão compatível atual a cada requisição e entram na validação de segurança conforme a chave dinâmica;
- Após a troca de conta ou de projeto de Team, usa o escopo/key resolvido nesta execução;
- Off-Peak injeta JWT/Key/Ticket, habilita a semântica existente de fila/expiração e não entra na validação de segurança;
- Falha antes da rede quando a conexão atual é incompatível ou falta material;
- Uma atualização do Registry afeta apenas Models criados depois; o Access estático do Model antigo não muda, mas pode resolver credenciais compatíveis atuais.

### 10.4 Estado e entre ambientes

- Uma falha de refresh da mesma conta pode manter o LKG; após trocar de conta, uma falha de refresh não pode reutilizar o Overlay da conta antiga;
- O Account Overlay é publicado atomicamente com a revision do Built-in correspondente;
- Local, SSH/WSL/Docker e Standalone usam os serviços de Provider/Account do Environment de destino;
- ModelSelection, a fila comum, a identidade de tarefas Off-Peak e os limites de recuperação desktop/mobile não mudam.

## 11. Zero Mecânico

Na conclusão, a cadeia pública de produção deve satisfazer pelo menos:

```text
access.planKind                              = 0
access.challenge                             = 0
access.requestSigning                        = 0
access.executionProtocol                     = 0
Access Type execution-provided               = 0
ProviderAccessProtocolInput                  = 0
ExecutionProvidedAccessConfig                = 0
accessId na cadeia pública de produção        = 0
access.accountConnectionVersion na cadeia pública de produção = 0
Access family derivada de provider.group     = 0
V4 ou Mode derivados de URL/path/Provider ID/Model ID = 0
Admissão de V4 em zai-api / bigmodel-api      = 0
ZhipuAccountAccessConfig.apiKey                   = 0
ZhipuAccountAccessConfig.apiKeyManagementUrl      = 0
Personal access em account:* fixo               = 0
API Key de conta resolvida do Personal Config  = 0
```

É permitido manter:

- Evidências de campos antigos em documentos históricos de implementação;
- A identidade de conta privada, a Key física e o escopo LKG do Credential Service;
- A chave dinâmica e o estado interno de protocolo da validação de segurança de requisição da versão oficial;
- O Provider ID fixo, o ID de tarefa, o marcador de Ticket e a máquina de estados existente do Off-Peak;
- O `kind` de seleção de conexão do próprio Account Connection, mas sem reprojetá-lo como `planKind` do Provider.

A verificação mecânica deve auditar exceção por exceção; não se pode esconder resíduo de produção com uma allowlist ampla.

## 12. Não objetivos e invariantes

Este Todo não trata de:

- Remote Provisioning;
- Portão de liberação de integridade de negócio do Provider Release;
- Verificação manual unificada entre contas reais e artefatos oficiais;
- Estruturação do protocolo de erro de string do Off-Peak;
- Refatoração de Model Properties, Reasoning, seleção de modelo, fila ou recuperação;
- discriminated union de Mode de segundo nível; só será desenhada separadamente quando surgir a necessidade real de estender a estrutura exclusiva de um Mode.

Deve ser mantido:

1. A ordem de Overlay do Provider continua sendo ZCode Built-in -> Account -> Personal;
2. O Account Overlay só restringe o Provider Zhipu Built-in e não trata Provider exclusivamente Personal;
3. O Personal é a última camada de sobrescrita dos campos permitidos, mas não pode ultrapassar o Source Schema para reescrever a identidade exclusiva do Built-in;
4. O Provider Config não gerencia credenciais dinâmicas de conta e não assume a autorização final no servidor;
5. Os fatos estáticos do Active Model são imutáveis; o material de conta em tempo de requisição pode ser resolvido conforme a conexão compatível atual;
6. `provider.group` responde apenas pela classificação de exibição e `access.family` apenas pelo sistema de acesso Zhipu;
7. O `zai-api/bigmodel-api` comum salva a Key manual e não tem V4; o Family API Key Provider usa apenas a Key fornecida pela conta e pode entrar no V4;
8. O ID fixo, o group, a visibility oculta e a identidade de seleção de tarefa do Off-Peak continuam preservados;
9. Não criar um segundo Registry, DTO de capacidade de Access, centro de credenciais ou Model exclusivo de execução.

## 13. Definição de conclusão

Só é possível concluir quando todas as condições abaixo forem satisfeitas:

1. Os dois Access Type de primeiro nível e a enumeração de Mode da Zhipu entram na Config, no Schema, no Registry, no Protocol e no Adapter oficiais;
2. Todos os Built-in Provider migram para o type e o Mode corretos; a API comum Z.ai/BigModel sai explicitamente do V4 e o Family API Key
   passa explicitamente a ter a conta como fonte de credencial;
3. Account Overlay, Request Auth, a validação de segurança da versão oficial e o Off-Peak despacham apenas por `type/mode`;
4. Os antigos campos genéricos de protocolo e `execution-provided` foram zerados mecanicamente na produção;
5. O escopo LKG privado da conta impede reutilização entre contas, sem que uma vinculação pública de conta volte a entrar na cadeia do modelo;
6. A autoridade de Provider/Account local do Environment e a atomicidade dos Overlay existentes permanecem inalteradas;
7. O Design atual, o Feature Graph, a nota de supersession do Todo 24 e os fatos da implementação estão consistentes;
8. Os testes direcionados de Provider, Provider Node, Services, Shared, Adapter, Bootstrap e UI passam;
9. `pnpm typecheck`, `pnpm lint`, as verificações de formato relevantes, `pnpm knip` e a verificação mecânica de resíduos passam;
10. As regressões de API Key comum, Family API Key, Start, Individual, Team, Off-Peak e Remote Environment afetadas passam,
    e a alteração é submetida com Conventional Commit.