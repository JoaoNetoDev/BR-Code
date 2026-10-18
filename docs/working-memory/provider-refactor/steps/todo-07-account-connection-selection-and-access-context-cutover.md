# 07 Seleção de Account Connection e Contexto de Access

> Status: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Design alvo: [`../design/registry/configuration.md`](../design/registry/configuration.md),
> [`../design/registry/runtime.md`](../design/registry/runtime.md),
> [`../design/registry/model-creation.md`](../design/registry/model-creation.md)
>
> Pré-requisito: [`todo-03-provider-model-ownership-and-property-totality.md`](./todo-03-provider-model-ownership-and-property-totality.md)
> Estabelecer primeiro o limite de tipos completo do Registry único; esta tarefa reforça in loco o Access estruturado e a completude do `zhipu-account`.

## 0. Entrega real

- Settings passou a guardar apenas `providerFamilyConnectionSelections`; o estado duplo antigo de mode/selected-key saiu da cadeia de produção oficial;
- Start, Individual e Team são declarados pelo próprio Built-in Provider com `family + planKind` fixos, e o Account Resolver produz um Account Overlay completo a partir da selection estruturada, sem manter tabela de runtime de Provider ID para pacote;
- O Access completo de um Account Provider enabled é fixado no Registry/Active Model, a autenticação da requisição consome apenas essa estrutura, e o `accessId` permanece opaque para os consumidores;
- Off-Peak e Official MCP já consomem o Account Access completo, sem resolver connection key nem comparar ID scoped/unscoped;
- Account accessId, cache de credenciais, invalidação de troca de conta e Team scope são tratados pela mesma cadeia Credential/Auth;
- Campos antigos de Settings e chaves string antigas existem apenas em testes/entrada de migração unique, sem entrar no AppSettings, Protocol, Registry ou Request Auth atual.

## 1. Objetivo da tarefa

Convergir a seleção de conexão do usuário do Provider Family, o fato de Account Connection, a Account Built-in Provider Config e a autenticação em tempo de requisição em uma única cadeia estruturada, removendo o protocolo implícito formado pela resolução de string `selectedConnectionKey` e `accessId`.

```text
当前

AppSettings
├─ modelProviderFamilyModes[family]
└─ modelProviderFamilySelectedKeys[family]
          |
          | preset:/coding-plan:/team-plan: 字符串
          +--------------------+----------------------+------------------+
          |                    |                      |                  |
          v                    v                      v                  v
Account Resolver       Settings / Usage       Off-Peak / MCP       Task / Session
          |                    |                      |                  |
          `-------- 各自 parse / match / rebase / startsWith -----------'
                               |
                               v
                  scoped accessId 再次编码账号身份

目标

AppSettings.providerFamilyConnectionSelections
          |
          | 结构化用户选择意图
          v
Account Connection Resolver
├─ current account（内部事实）
├─ entitlement / availability
└─ selected structured connection
          |
          v
Account Connection Result
├─ status
├─ resolved access { family, planKind, Team scope?, opaque accessId }
└─ models?
          |
          v
Account Built-in Provider Config
          |
          +--> Registry / Model 固定 Account Access
          +--> Request Auth
          +--> Off-Peak
          `--> Official MCP
```

O objetivo desta tarefa não é renomear `selectedConnectionKey` nem centralizar o parser de string atual em outro helper. O objetivo é fazer Settings armazenar apenas a intenção de seleção estruturada, tornar o Account Connection Resolver o único interpretador e fazer com que os consumidores de execução leiam diretamente o Account Access já resolvido na Provider Config.

O Todo 03 não implementa antecipadamente o Access de conta estruturado desta tarefa, nem cria um DTO temporário de Account Access. O `RegistryProviderConfig` do Todo 03 é primeiro restringido conforme o Access Schema que existia na época; quando esta tarefa modifica o `ZhipuAccountAccessConfig`, o mesmo `CompleteProviderAccessConfig`, `requireComplete` e o contrato completo de serialização são ampliados em conjunto.

## 2. Decisões confirmadas

### 2.1 A seleção do usuário usa um único campo estruturado

Remover os dois estados de Settings que precisavam ser mantidos atomicamente:

- `modelProviderFamilyModes`;
- `modelProviderFamilySelectedKeys`.

Substituir por:

```ts
type ProviderFamilyConnectionSelection =
  | { kind: "api-key"; providerId: string }
  | { kind: "start-plan" }
  | { kind: "individual-coding-plan" }
  | {
      kind: "team-coding-plan";
      productId: string;
      organizationId: string;
      projectId: string;
    };

interface AppSettings {
  providerFamilyConnectionSelections?: Partial<
    Record<ProviderFamilyDomain, ProviderFamilyConnectionSelection>
  >;
}
```

`kind` já contém API Key/OAuth e a forma concreta do pacote, portanto não se mantém mais um mode separado. `providerFamilyDomain` continua expressando o Provider Family atualmente ativo e não é removido nem unificado nesta tarefa.

A seleção de Account Plan não armazena Built-in Provider ID e não infere o pacote a partir do Built-in Provider ID. A Family externa, o `kind` e o Team Scope são as entradas estruturadas que o Account Connection Resolver usa para localizar a conexão; a seleção por API Key preserva o Provider ID realmente escolhido pelo usuário. A conta conectada no momento participa da resolução internamente pelo Account Connection Service e não entra em Settings nem na Provider Config.

### 2.2 Start, Individual e Team são Built-in Providers independentes

Start Plan, Individual Coding Plan e Team Coding Plan do mesmo Family são definidos como ZCode Built-in Providers independentes. O `access.family` e o `access.planKind` de cada Provider são fixos, e não se permite que um Coding Plan Provider se transforme em tempo de execução entre Individual e Team.

O fluxo normal de Settings seleciona apenas uma das conexões de conta mutuamente exclusivas do mesmo Family; o Account Built-in Overlay completa o Access apenas para o Provider que corresponde a `family + planKind` e o define como enabled, definindo os demais Providers de conta como disabled. O Resolver examina o Access declarado pelo próprio Built-in Provider e não mantém uma tabela de Built-in Provider IDs de Start/Individual/Team.

Individual e Team podem declarar os mesmos IDs de modelo; a identidade do Registry continua sendo `providerId + modelId`. No fluxo normal de seleção apenas um Provider está enabled, de modo que a Selection só exibe os modelos da conexão atual. Quando o usuário habilita manualmente múltiplos Providers pelo Personal Config, a semântica comum de Config se aplica, sem verificação de permissão de origem adicional.

As identidades Built-in alvo usam nomes explícitos e não preservam a semântica oficial de "um Coding Plan Provider representa dois Plan ao mesmo tempo":

```text
builtin:zai-start-plan
builtin:zai-individual-coding-plan
builtin:zai-team-coding-plan

builtin:bigmodel-start-plan
builtin:bigmodel-individual-coding-plan
builtin:bigmodel-team-coding-plan
```

Os antigos `builtin:*-coding-plan` existem apenas em importers unique de Settings/Personal/Selection. O migrador mapeia para o novo Provider correspondente quando consegue determinar com clareza Individual ou Team a partir da seleção estruturada da mesma migração; configurações manuais indeterminadas geram um diagnóstico explícito, não são copiadas para os dois Providers e não mantêm alias de runtime por muito tempo. O importer e as constantes de ID antigas são removidos após o fim da janela de upgrade forçado.

### 2.3 Account Connection é a autoridade do fato de conexão

O Account Connection Resolver lê a Family atual, a seleção estruturada, a identidade da conta conectada, os entitlements, o Credential Port e a Plan API, e emite um resultado distinguível por Provider:

```ts
type AccountProviderConnectionResult =
  | {
      providerId: string;
      status: "available";
      access: CompleteZhipuAccountAccessConfig;
      models?: readonly string[];
    }
  | {
      providerId: string;
      status: "unavailable";
    };
```

Renderer, Usage, Off-Peak, Official MCP, Task e Session deixam de interpretar cada um suas próprias strings de Settings.

### 2.4 A Provider Config fixa o Account Access estruturado

Estrutura alvo do Access de `zhipu-account`:

```ts
type ZhipuAccountAccessConfig =
  | {
      type: "zhipu-account";
      accessId?: string | null;
      family: "zai" | "bigmodel";
      planKind: "start-plan" | "individual-coding-plan";
    }
  | {
      type: "zhipu-account";
      accessId?: string | null;
      planKind: "team-coding-plan";
      family: "zai" | "bigmodel";
      productId?: string | null;
      organizationId?: string | null;
      projectId?: string | null;
    };
```

A ZCode Built-in Provider Config declara primeiro `family + planKind` fixos; o Scope específico do Team e o `accessId` de todos os Plan podem ficar ausentes. O Account Connection Resolver usa esses campos, a seleção de Settings, a conta atual e os entitlements para localizar a conexão; a Account Built-in Provider Config é substituída integralmente pelo Access completo do mesmo Plan. O Registry exige que um Account Provider enabled tenha `accessId` não vazio, e o Team também exige o Scope completo.

A Account Built-in Provider Config é o snapshot imutável necessário à execução do Provider/Model. O `accessId` é uma identidade de conexão estável e não sensível, mas os consumidores devem tratá-lo como um valor opaque, sem conseguir identificar Plan, Family, Team Scope ou identidade de conta a partir dele. A identidade da conta atual é usada apenas internamente pelo Account Connection Service para gerar, localizar e invalidar o `accessId`; após a troca de conta o `accessId` antigo não obtém mais credenciais, e o `accountIdentity` não é copiado para a Provider Config.

Esta tarefa pode manter temporariamente o formato de bytes atual do accessId e a chave do Credential Store para evitar migração de credenciais desnecessária; "manter o formato atual" não constitui permissão para continuar interpretando esse formato. Após o fim da janela de compatibilidade, apenas o código de migração de formato antigo que ainda for realmente necessário dentro de Account Source/Importer pode permanecer até o ponto único de aposentadoria.

### 2.5 Editabilidade pela UI não é permissão do Schema

A página de configurações pode não exibir o Account Access nem pode tornar campos Built-in somente leitura, mas o Config Schema não proíbe por isso que o usuário escreva esses campos manualmente. O Personal continua usando o Overlay genérico como um todo:

```text
UI 不提供 Account Access 编辑
        !=
Personal Schema 禁止表达 Account Access
```

Schema e Registry verificam apenas estrutura, discriminant e completude do Effective Config; não verificam se o `accessId` ou os campos de Access de conta foram produzidos pela Account Built-in Source. Quando o usuário escreve manualmente uma conexão estruturalmente completa mas inválida de negócio, a falha vem do Request Auth ou da autenticação do servidor, sem introduzir um sistema de permissão de Source.

### 2.6 Off-Peak e Official MCP pertencem a esta tarefa

Off-Peak e Official MCP hoje relêm Settings e resolvem `selectedConnectionKey`. Esta tarefa é responsável por migrar ambos para Account Connection / Effective Account Access, sem deixar para M4 ou outras tarefas.

Off-Peak tem hoje um bug candidate explícito: o `accessId` do Account Provider de produção tem escopo de conta, enquanto `selectedConnectionKey` não tem, e o código compara os dois diretamente, o que classifica conexões válidas como indisponíveis. A implementação alvo remove essa comparação e não adiciona um helper de compatibilidade do tipo "remover o escopo e depois comparar".

## 3. Fatos atuais e superfície de impacto

Uma varredura textual precisa e atual mostra que `modelProviderFamilySelectedKeys` ou `selectedConnectionKey` aparecem em pelo menos 37 arquivos que não são testes unitários: UI 18, Services 11, Shared 5, Desktop 3.

| Escopo                       | Responsabilidade atual                          | Alvo                                                       |
| -------------------------- | ---------------------------------------- | --------------------------------------- |
| AppSettings / Schema       | Persistir mode e chave string                 | Uma única selection estruturada                    |
| Provider Settings          | Navegação, troca, restauração e pending state         | Editar a selection estruturada                    |
| Account Resolver           | Resolver Plan/Team key e gerar accessId       | Localizar a conexão pelos campos de Access e gerar accessId   |
| Request Auth               | Identificar Plan, conta e Team Scope a partir do accessId | Consumir o Account Access completo                 |
| Usage / Entitlement        | Gerar o contexto de consulta a partir da selected key           | Consumir a Account Connection View            |
| Session / Task / Repo Wiki | Passar selected keys camada a camada                   | Remover o repasse e usar Registry/Account Service |
| Off-Peak                   | Resolver Settings e comparar dois IDs               | Consumir o Account Access atual                 |
| Official MCP               | Resolver Plan e Team Scope novamente              | Consumir o Account Access atual                 |
| Desktop remote host        | Construir temporariamente um mapa de selected key para obter a Team Key    | Passar diretamente o Account Access estruturado             |

### 3.1 UI Surface Matrix

| Cenário do usuário            | Entrada de UI                   | Owner de Draft/exibição        | Destino do envio             | Mudança nesta tarefa               | Limite de isolamento                      |
| --------------------- | ------------------------- | ----------------------- | -------------------- | ------------------------ | ----------------------------- |
| Trocar a conexão por API Key/pacote | Provider Settings         | Pending selection local  | AppSettings          | Enviar uma única selection estruturada | Não altera o Personal Provider Config |
| Ver a conexão e o pacote atuais    | Provider Settings / Usage | Account Connection View | Nenhum ou requisição de Usage      | Não resolver accessId/key      | A cota dinâmica não entra no Registry       |
| Selecionar modelo              | Controle de modelo do Composer    | Composer Draft          | Comando de Session/Task | Candidatos vêm apenas do Registry      | Não trocar conexão no seletor de modelos        |
| Criar tarefa ociosa          | Entrada de Off-Peak            | Visão de suporte do Off-Peak   | Serviço de Off-Peak     | O Host consome o Account Access | Não enviar credenciais ao Renderer         |
| Restaurar a conexão após login OAuth  | Callback raiz             | AppSettings             | Setting Service      | Gravar a selection estruturada       | O mount de Settings não reordena a seleção válida |

Automation, Subagent e Repo Wiki apenas compartilham os candidatos de modelo do Registry e não possuem a selection de Account Connection. O código que hoje repassa selected keys para esses caminhos é uma ponte a ser removida e não representa semântica de produto.

### 3.2 Owner de estado e destino de envio

| Estado/fato                    | Owner autoritativo                        | Persistência/cache                      | Consumidores                        |
| ---------------------------- | --------------------------------- | -------------------------------- | ----------------------------- |
| Intenção de seleção de conexão atual do usuário         | AppSettings structured selection  | `setting.json`                   | Account Resolver, Settings UI |
| Identidade da conta atual e entitlements           | Serviços OAuth/Account/Plan       | Seus caches existentes                     | Account Resolver              |
| Account Connection disponível atual  | Account Provider Service          | Last-known-good Account Source   | Registry, Account Views       |
| Account Access de execução do Provider | Effective Provider Config / Model | Registry revision / Active Model | Request Auth                  |
| API Key/JWT/Team Secret      | Serviço Credential / Request Auth | Credential Store existente            | Uma tentativa de request          |
| Ticket/Auth do Off-Peak         | Contexto de execução do Off-Peak        | Memória do dispatch atual                     | idle Model request-auth       |

## 4. Impact Brief

| Campo             | Conclusão                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Developer intent | Remover o protocolo de string de conexão de conta e o repasse entre camadas, unificando seleção, Provider Access e autenticação da requisição                                           |
| Capability       | Provider Registry, Plan Entitlements, Provider Settings, Off-Peak, Official MCP                                  |
| Change layer     | `persistence`, `option-source`, `validation`, `commit-effect`                                                    |
| Operating mode   | implementation-handoff                                                                                           |
| Primary seeds    | `AccountProviderConnectionResolver`, `AppSettings`, `resolveOffPeakCredentials`, `resolveOfficialMcpCredentials` |
| Out of scope     | Refazer a lógica de produto dos pacotes, Provisioning remoto, refatoração do centro de credenciais, Queue/Recovery, ciclo de vida da seleção de Model                            |

| Nível           | Relação                                                    | Motivo                                           |
| -------------- | ------------------------------------------------------- | ---------------------------------------------- |
| must-inspect   | AppSettings -> Provider Settings -> Account Resolver    | Cadeia principal de persistence/commit da selection           |
| must-inspect   | Account Resolver -> Account Built-in Config -> Registry | Única cadeia de projeção do fato de conexão estruturado                     |
| must-inspect   | Active Model -> Request Auth                            | Na troca de conta, o Model antigo não pode seguir a nova conta              |
| must-inspect   | Account Access -> Off-Peak / Official MCP               | Hoje resolve strings repetidamente e há um ponto de falha de comparação de ID em o modo ocioso       |
| should-inspect | Usage / Entitlement / Sidebar                           | Hoje reconstrói o contexto de produto a partir de selected key/accessId    |
| conditional    | Local/Remote Host Account Source                        | O Environment remoto precisa usar seu próprio Account Source |
| invariant-only | desktop continuous / mobile replayable                  | Esta tarefa não muda a semântica de recuperação de task/session/stream      |
| evidence-only  | Testes existentes de helper de connection-key                        | Apenas provam o comportamento do protocolo antigo, não que a abstração antiga deva ser preservada           |

O grafo funcional já registra a autoridade da origem de Account Connection, o snapshot de execução do Provider e o invariante de decoupling entre UI/Schema. O ambiente atual não tem ferramenta codegraph invocável, então esta superfície de impacto foi revisada com grafo semântico e chamadas precisas de `rg`; antes da implementação ainda é preciso complementar a evidência em nível de símbolo com `dep:refs`, TypeScript e testes.

## 5. Escopo e ordem de implementação

### Step A: congelamento de testes e seleção estruturada

- Escrever primeiro testes que falham para a seleção por API Key, Start, Individual, Team project e restauração após reinício;
- Definir a seleção estruturada e o Schema estrito em Shared;
- Mudar AppSettings para o único `providerFamilyConnectionSelections`;
- O pending state de Provider Settings, o salvamento, a restauração pelo callback OAuth e a inicialização padrão enviam uma única selection completa;
- `providerFamilyDomain` permanece independente.

### Step B: Account Connection e Provider Access

- Definir Built-in Providers de Start, Individual e Team separadamente para cada Family; remover o Provider compartilhado por Individual/Team;
- Cada Provider declara fixamente `access.family + access.planKind`, e o Effective Access de Team carrega adicionalmente o Scope completo;
- O Account Resolver localiza a conexão pelo Access estruturado e pela selection, sem manter tabela de Built-in Provider IDs;
- `AccountProviderConnectionResult.available` devolve o `ZhipuAccountAccessConfig` completo;
- O Account Connection Service usa internamente a conta atual para gerar e invalidar o accessId opaque, sem projetar accountIdentity na Config;
- A Account Built-in Config projeta o Access completo para o Provider selecionado, `builtinModelIds` opcionais e enabled=true; os demais Account Providers no mesmo escopo mutuamente exclusivo são projetados com enabled=false;
- Em caso de sucesso o Account Resolver publica atomicamente o resultado inteiro; em caso de falha de dependência externa o Service mantém o Snapshot anterior inteiro, sem LKG parcial;
- Remover o ramo de recuperação pela metade de `unknown + previousProviders` por Provider, sem novo protocolo de isolamento de falha por Family/Provider;
- `validateComplete` / `requireComplete` validam a completude estrutural, não a origem dos campos nem os entitlements reais;
- ModelFactory/Model fixa o Account Access completo como está.

### Step C: Request Auth e convergência dos consumidores

- O Request Auth escolhe o fluxo de autenticação por `family + planKind` e obtém o material dinâmico correspondente pelo accessId opaque;
- Team Key/Header usa o Scope explícito do Access, sem resolver o accessId;
- Remover os mapeamentos hardcoded de Family/Plan para Built-in Provider ID no Request Auth e no Account Resolver;
- Usage, Entitlement, Reset, Sidebar e Provider Settings usam a Account Connection View;
- O Host deixa de decidir pelo prefixo `start-plan:` se precisa de verificação de segurança da versão oficial; o Request Auth expressa isso pela interação tipada/fronteira de erro existente;
- Manter a chave atual do Credential Store construída com o accessId completo, a menos que os testes provem que a migração é necessária.

### Step D: remoção do repasse de selection entre camadas

- Remover os parâmetros de selected keys em ZCodeTask, ZCodeSession, Agent, workspace prepare, Repo Wiki e thought catalog;
- O Runtime obtém o Access de execução apenas pelo Provider/Model do Registry;
- O Renderer só modifica a selection em Provider Settings e não a coloca em ModelSelection ou no estado de Session;
- O Remote Workspace continua recebendo a Account Built-in Config do Account Source do Environment alvo.

### Step E: Off-Peak e Official MCP

- O Off-Peak obtém o Account Access Individual/Team atual e válido; Start/API Key continuam sendo rejeitados conforme as regras de produto;
- Remover a comparação direta entre o accessId scoped e a selected key unscoped;
- `OffPeakCredentialSnapshot` e `OffPeakCodingPlanSupport` removem `selectedConnectionKey`;
- O Official MCP usa o mesmo Account Access para determinar o scope Individual/Team;
- A verificação de consistência continua sendo executada antes e depois da resolução de credenciais, mas comparando a revision do Account Source/a conexão estruturada, sem concatenar credenciais de duas gerações;
- O Renderer não recebe JWT, API Key, Team Secret ou outras credenciais dinâmicas.

### Step F: migração e remoção mecânica

- Ao ler o AppSettings antigo, o Repository executa a migração unique mode/key -> seleção estruturada;
- Migrar apenas `preset:`, `coding-plan:` e `team-plan:` completo e claramente identificáveis; valores corrompidos não são adivinhados;
- Migrar o Provider ID genérico antigo `builtin:*-coding-plan` para o ID de Individual ou de Team conforme a mesma seleção estruturada;
- Migrar Settings, chaves de Provider Personal e ModelSelection persistido que ainda precisa de restauração; configurações manuais ambíguas geram diagnóstico, sem cópia para os dois novos Providers;
- Não fazer dupla escrita de campos antigos nem leitura dupla de longo prazo em código de negócio oficial;
- Após o fim da janela de compatibilidade do upgrade forçado, remover as funções de migração, os campos antigos de schema e os testes de parser/matcher;
- Remover os helpers create/parse/matches/rebase de connection-key e o parser de accessId legacy sem chamadores.

## 6. Testes primeiro

### 6.1 Settings e migração

1. Round-trip estrito das selections de API Key, Start, Individual e Team;
2. Migração atômica de mode e selected key para um único valor estruturado;
3. A migração de Team preserva product/organization/project;
4. Key antiga corrompida não adivinha Plan nem Team Scope;
5. O callback OAuth atualiza apenas a Family alvo; as selections das outras Families não mudam;
6. O mount de Settings não sobrescreve uma selection salva ainda válida;
7. A troca de conexão pelo usuário é gravada em uma única operação, sem estado meio atualizado de mode/key.
8. O Provider ID genérico antigo de Coding Plan é migrado para Individual ou Team conforme a selection explícita; entradas ambíguas não são adivinhadas nem duplicadas.

### 6.2 Account Provider e Registry

1. Start, Individual e Team correspondem a Built-in Providers independentes, e o tipo de Plan não se transforma em runtime;
2. Team gera adicionalmente product/organization/project completos;
3. O Resolver consegue obter o accessId a partir de family/planKind/Team Scope estruturados, sem tabela de Built-in Provider IDs;
4. Ao selecionar Individual normalmente apenas o Provider Individual fica enabled; ao selecionar Team apenas o Provider Team fica enabled;
5. A renovação de Token/Runtime Key não altera o Account Access; a troca de conta ou de Team project gera um Access novo;
6. Quando a atualização da Account tem sucesso o resultado inteiro é publicado; quando qualquer dependência externa falha o Snapshot anterior inteiro permanece inalterado;
7. O Personal pode sobrescrever o access por inteiro, sem verificação de elegibilidade de origem;
8. Um fake access manual estruturalmente completo passa pela completude de Config, e o Request Auth ou o servidor falha;
9. Um Account Provider enabled sem accessId, ou um Team sem Scope, não pode entrar no Registry.

### 6.3 Request Auth, Off-Peak e MCP

1. O Request Auth de Start, Individual e Team não resolve a string do accessId;
2. Após a troca de conta, o accessId antigo não obtém as credenciais da nova conta e falha antes da rede;
3. Team Header/Key usa o Scope explícito do Access;
4. O Account Access scoped do Off-Peak é resolvido normalmente, sem disparar mais o `connection_unavailable` incorreto;
5. Se a troca de seleção ocorrer durante a resolução de credenciais, o turno inteiro é refeito, sem misturar credenciais de duas gerações;
6. O scope Individual/Team do Official MCP é consistente com o Account Access;
7. Os gates de produto existentes de Start/API Key para Off-Peak/MCP permanecem inalterados;
8. O support/outcome visível ao Renderer não contém Secret.

### 6.4 Multiplataformas e regressão

1. As páginas de configurações de Desktop, Web e celular usam o mesmo Setting Service para a mesma selection;
2. Cada Environment Local/Remote gera sua própria Account Built-in Config;
3. Os candidatos de Composer, Automation, Subagent e Repo Wiki continuam vindo do Registry, e cada sink de Draft/commit permanece inalterado;
4. desktop continuous, mobile replayable, Queue, snapshot e workspace identity não sofrem mudança de semântica de protocolo;
5. Um Active Model já criado continua segurando o Access antigo após uma troca global de conta/conexão e não pode seguir silenciosamente.

IDs de caso estáveis:

| Case ID | Setup                              | Action                          | Assertions                                         |
| ------- | ---------------------------------- | ------------------------------- | -------------------------------------------------- |
| AC-01   | Salvar a selection de Team                | Reiniciar Settings                   | organization/project são restaurados como estão, sem parse de string      |
| AC-02   | Account A cria um Model               | Requisitar o Model antigo após trocar para Account B   | Incompatibilidade de identidade antes da rede, sem usar credenciais de B                    |
| AC-03   | Team project P1 Active             | Trocar para P2                         | O Model antigo mantém P1, o novo Model usa P2                 |
| AC-04   | Personal escreve um fake Account Access manual  | Criar e requisitar um Model                | O Schema não rejeita por origem; o Request Auth falha explicitamente         |
| AC-05   | Account Access scoped válido         | Criar um ticket de Off-Peak            | Sem comparação com a key unscoped, dual credenciais obtidas normalmente             |
| AC-06   | Trocar de conexão durante a resolução de credenciais                 | Resolver Off-Peak/MCP               | Não mistura JWT/API Key/scope de duas gerações                       |
| AC-07   | Remote Environment                 | Sincronizar/atualizar o Provider              | Usa o Account Source remoto, sem ler a selection local para executar |
| AC-08   | Providers Individual e Team ambos existem | Trocar a connection selection estruturada | Apenas o Provider correspondente fica enabled, os candidatos de modelo mostram só a conexão atual    |

## 7. Não objetivos

- Não refazer SKU, compra, desconto, cota ou a lógica de produto de autorização do servidor dos pacotes;
- Não colocar API Key dinâmica, JWT, Team Secret, Header de verificação de segurança única ou Ticket na Provider Config;
- Não estabelecer um Credential Center unificado;
- Não mudar o ciclo de vida de ModelSelection, Session Selection, App Recent ou Active Model;
- Não mudar Provisioning remoto, configurações remotas ou capacidades de produto de login;
- Não mudar Queue, continuous/replayable, snapshot ou workspace identity;
- Não alterar o formato de bytes atual do accessId nem a chave do Credential Store por causa desta tarefa;
- Não adicionar permissão de Source ou uma verificação especial do tipo "proibir escrever accessId de conta" para a configuração manual do usuário;
- Não colocar Badge, Label ou texto de exibição de pacote no Account Access.

## 8. Condições de conclusão

Zeragem mecânica:

```text
AppSettings.modelProviderFamilyModes                                   = 0
AppSettings.modelProviderFamilySelectedKeys                            = 0
selectedConnectionKey em domínios/proTOCOLO de produção                                = 0
Repasse de family selected keys em Task/Session/Repo Wiki/workspace prepare   = 0
create/parse/matches de connection key de Team/Coding/Preset em código de negócio         = 0
UI/Host/Off-Peak/MCP decodificando Plan/Family/Team/account identity a partir do accessId = 0
Mapeamento de Built-in Provider ID para pacote em Account Resolver / Request Auth          = 0
Provider ID genérico antigo builtin:*-coding-plan em Config/Registry oficiais          = 0
provider.accessId !== selection.selectedConnectionKey                  = 0
selectedConnectionKey em support/snapshot do OffPeak                         = 0
zhipu-account enabled sem family/planKind/accessId/Team Scope completos      = 0
```

O `key` local dentro do componente Select genérico, usado apenas para a identidade de option do React, não está no escopo da zeragem; o que é proibido é usar a chave string como protocolo de conexão de conta atravessando Settings, Services, Protocol e Runtime.

Aceitação de comportamento:

- A seleção de conexão do usuário tem apenas um estado estruturado persistido;
- O Account Connection Resolver é o único interpretador da intenção de seleção para o fato de conexão de conta;
- A Account Built-in Provider Config é o único snapshot estático do Account Access necessário à execução;
- Start, Individual e Team são Built-in Providers independentes de tipo fixo, e no fluxo normal apenas a seleção atual fica enabled;
- Request Auth, Off-Peak e Official MCP consomem o mesmo Account Access estruturado;
- O accessId é tratado como identidade opaque por todos os consumidores;
- A editabilidade pela UI não altera a capacidade de expressão do Personal Schema;
- A troca de conta/conexão não faz um Model já criado passar silenciosamente a usar outro conjunto de credenciais;
- Não há dupla escrita, dupla leitura nem DTO de compatibilidade duradouro.

## 9. Verificação e envio

Executar pelo menos:

```bash
pnpm test:unit:affected
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm knip
```

Usar `pnpm dep:refs`, TypeScript e `rg` para reconferir os itens de zeragem mecânica. Alterações de UI executam os E2E de Desktop relevantes para Provider Settings, reconexão OAuth, troca de Team project e entrada de Off-Peak, e verificam o comportamento responsivo do Web móvel. Se o ambiente remoto não puder ser validado por completo, a descrição do envio precisa listar a superfície de impacto do Local/Remote Account Source e as evidências ainda faltantes.

Ao concluir, atualizar o status deste Todo e a entrega real, registrar o limite único do importer que ainda está na janela de upgrade forçado e enviar como um Conventional Commit independente.