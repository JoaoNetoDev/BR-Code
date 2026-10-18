# Todo 51: semântica de consumo do Provider Access e consolidação da autenticação Off-Peak

> Status: concluído
>
> Data: 2026-08-31
>
> Pré-requisitos: Todo 47, 49 e 50 concluíram a troca dos contratos centrais; este Todo consolida o drift da camada de consumo encontrado na Review, a montagem duplicada de autenticação e os resíduos de abstrações antigas.

## 1. Objetivo

Nesta rodada não se altera mais a estrutura central do Provider Config; o objetivo é fazer com que todos os consumidores realmente respeitem o fato único já definido:

```text
ZCode Built-in Provider Config
Account Provider Config
Personal Provider Config Overlay
              |
              v
Effective Provider Config
├─ enabled                         se entra na configuração atual
├─ access.type/family/mode         forma estática de acesso
├─ access.entitled                 elegibilidade de produto da conta
└─ configuração completa de chamada
              |
       +------+--------------------+
       |                           |
       v                           v
Settings View                  Provider Registry
lê placement/estado             recebe só Provider/Model executável
```

Ao mesmo tempo, consolidam-se duas cadeias adjacentes:

- A API Key digitada manualmente no Welcome salva apenas um Personal Overlay esparso para o Provider de API Built-in fixo, sem criar Provider customizado, sem copiar fatos Built-in e sem alterar secretamente a Family Connection Selection;
- O Off-Peak continua usando as três materiais de requisição já existentes (JWT do ZCode, Project Key do Coding Plan e Off-Peak Ticket), mas a seleção de Provider/conta e o Request Auth são resolvidos apenas uma vez; o Desktop Host não varre mais a Settings View para adivinhar o Coding Plan atual.

## 2. Limites confirmados

### 2.1 `enabled`, `entitled` e `executable`

| Fato | Único significado | Owner | Consumidores permitidos |
| --- | --- | --- | --- |
| `provider.enabled` | Se o Provider entra na configuração atual; um Built-in comum fica, por isso, na lista principal ou no menu de adição | Built-in + Personal Overlay | placement das Settings, primeira camada de execução do Resolver |
| `access.entitled` | Se a conta atual tem a elegibilidade de produto correspondente da Account | Account Overlay | UI de estado da Account, gate de execução de Account do Resolver |
| `provider.executable` / existência no Registry | O Provider está habilitado, elegível, com configuração completa e com ao menos um modelo executável | Resolver / Registry | seleção de modelo, teste de conexão, execução real, busca interna exata |
| descritor de acesso da Account | Descrição estática de acesso como `type/family/mode` | Built-in Provider Config | despacho de exibição, resolução do material de requisição da conta; não pode virar um booleano "conectado" |

Não se pode mais inferir conta conectada, comprada ou com direito a partir de `enabled`, nem inferir entitlement apenas pela existência de um descritor de acesso de Account. O Renderer não replica a fórmula do Resolver; quando precisar de capacidade de execução, consome diretamente `executable` ou o Registry oficial.

### 2.2 A API Key do Welcome escreve só o Personal Overlay

```text
Usuário escolhe BigModel e informa a Key
              |
              v
Localiza o Built-in `bigmodel-api`
              |
              v
Salva um Personal Provider Overlay esparso
{
  access: {
    type: "api-key",
    apiKey: "..."
  }
}
              |
              v
Atualização do Effective Config / Registry
```

- O Provider ID, group, Endpoint, API Schema, modelos Built-in e a ordem de `zai-api` / `bigmodel-api` continuam vindo do Built-in;
- O Welcome não cria dinamicamente um Provider `standard-personal` nem copia campos Built-in para o Personal Config;
- O Welcome não escreve `providerFamilyConnectionSelections`. Uma escolha explícita já existente de forma de conexão mantém seu valor; a existência do Overlay de API Key não é uma segunda autoridade para a forma de conexão atual;
- O domínio de Family existente do Welcome e o comportamento de modelo padrão após o login permanecem inalterados; este Todo não usa o salvamento da API Key para redesenhar navegação ou seleção de modelo;
- A troca ativa de forma de conexão pelo usuário na página de Settings continua tratada pelo contrato da própria interação, sem se confundir com o "salvar material de chamada" do Welcome em um único提交.

O ponto de entrada genérico de escrita atual `savePersonalProvider` na verdade salva o "Personal Config Overlay de qualquer Provider", e o nome é facilmente entendido como se salvasse apenas o Provider `standard-personal`. Renomeia-se uniformemente para `savePersonalProviderOverlay`, atravessando Facade, Service, Runtime, UI helper, mock e testes. A função de conveniência da API Key apenas mescla `access.apiKey` e chama esse ponto de entrada genérico, sem criar outro protocolo de persistência.

### 2.3 As três materiais de requisição do Off-Peak e a única fonte de resolução

```text
ZCode JWT                  identidade de login atual
Coding Plan Project Key    material de requisição de modelo do plano Individual/Team atual
Off-Peak Ticket            admissão de agendamento desta execução em horário ocioso
          \                   |                   /
           +------------------+------------------+
                              |
                              v
                   Off-Peak Request Auth
```

Os três têm responsabilidades diferentes; o Ticket não substitui a Coding Plan Key. Nesta rodada mantém-se o contrato de Header do servidor existente, sem alterar cobrança, cota, máquina de estados do Ticket ou autorização final.

O composition root atual já usa resolução de Provider via Registry para o material de conta no Off-Peak Server Client, no status de suporte e no Mock Upstream; no entanto, ao despachar, o Desktop Host varre novamente a Settings View e procura o Provider Individual/Team pela semântica antiga de `provider.enabled`. Depois que o Account Provider passou a ter `enabled=true` fixo, essa varredura atinge vários Providers ao mesmo tempo: é ao mesmo tempo implementação duplicada e uma causa de falha na resolução da autenticação da requisição.

Cadeia alvo:

```text
Provider Registry + Account Request Auth
                 |
                 v
O composition root cria um único Off-Peak Credential Resolver
        +--------+------------------+
        |                           |
        v                           v
Server Client / Support       Host Dispatch(ticketId)
                                    |
                                    v
                           buildOffPeakRequestAuth
```

- Monta-se as dependências do Off-Peak credential resolver apenas uma vez, no composition root de Node/Host;
- O despacho do Local Host envia somente `ticketId` e obtém o Request Auth desta execução, sem ler a Settings View, sem 판단 de plano e sem resolver Provider;
- Credenciais dinâmicas continuam apenas em memória no Host/Services, sem entrar no Renderer, DTO de RPC, Provider Config, Session Selection ou persistência;
- Não se adiciona a `IOffPeakTaskService` público nenhum método que exponha segredos ao Renderer/cliente remoto; reutiliza-se a fronteira existente de capability/lookup privada do host, ou fornece-se no mesmo composition root um closure privado estreito equivalente;
- O Off-Peak continua usando o Registry comum, o ModelSelection padrão e o ModelFactory oficial, sem criar um segundo Registry de execução.

### 2.4 Limites da Family Connection Selection

`ProviderFamilyConnectionSelection` é a escolha explícita de conexão na página de Settings; não é Personal Provider Config nem um espelho da completude da configuração de API Key. Se o `kind: "api-key"` atual ainda deve ser mantido é uma interação de produto sobre forma de conexão; nesta rodada não se remove nem redesenha isso com base no comportamento do Welcome; fixa-se apenas que:

- Salvar a Key no Welcome não modifica a selection;
- O Account Overlay pode ler a selection explícita para decidir a conexão da conta atual, mas não pode tratar `enabled` como selection/entitlement;
- A executabilidade do Provider continua sendo decidida pelo Effective Config/Registry; a selection não pode se tornar um segundo Registry.

## 3. Problemas confirmados atualmente

### 3.1 A UI ainda consome o antigo `enabled = account connected`

É preciso limpar um a um:

- `connectedAccountProviderIds` coleta Account Providers por `provider.enabled`;
- `resolveAccountProviderAccess()` acumula a leitura do descritor e o booleano "connected";
- A conclusão de assinatura, a primeira sincronização de entitlement, o status de plano e a exibição de quota/uso tratam a existência do descritor como "conectado";
- A telemetria do funil do Coding Plan reporta "purchased" por `enabled`;
- Comentários, variáveis e fixtures de teste ainda dizem "Account Overlay habilitado".

Princípios de tratamento:

- Quando for necessária descrição estática, ler `access.type/family/mode`;
- Quando for necessária elegibilidade da conta, ler `access.entitled === true`;
- Quando for necessária capacidade de execução, ler `executable`/Registry;
- Remover conversões ambíguas nullable/Boolean; não criar um grande DTO `AccountProviderState` nem uma segunda máquina de estados derivada.

### 3.2 Resolução duplicada de Provider no Host do Off-Peak

O Desktop Host e o composition root de Services mantêm cada um sua cópia de `resolveAccountProvider`. Remove-se a varredura de Settings View no lado do Host e mantém-se uma única fonte de resolução baseada no Registry oficial e no Account Request Auth.

### 3.3 Nome incorreto da interface pública do Personal Overlay

`savePersonalProvider`, os mutation targets relacionados e os nomes de helper não expressam a semântica de Overlay. Faz-se uma renomeação mecânica e remove-se a exportação antiga, sem alias, para evitar que no futuro um Built-in Provider Overlay seja confundido com a identidade de um Provider Personal-only.

### 3.4 Abstrações antigas e lógica morta

- Remover `ModelProviderFamilyModeSettings`, `resolveModelProviderFamilyMode` e `shouldShowModelProviderForFamilyMode`, que não têm chamador em produção; a selection estruturada oficial não tem mais um mode paralelo `oauth | apiKey`;
- Renomear e estreitar `loadProviderApiKey`, que na verdade só carrega a Project Key do Coding Plan dentro do Account Connection Resolver, para `loadCodingPlanApiKey`; um Provider `api-key` comum nunca passa por essa interface;
- Remover o branch morto que atualiza entitlement após comparar a API Key do formulário de Account Provider; o Account Provider já não hospeda Key digitada manualmente;
- Limpar comentários/nomes de teste obsoletos sobre o Account API Provider antigo, o `enabled` de Account, `accessId` e "Personal Rule decide a permissão de edição".

## 4. Feature Impact Brief

### 4.1 Camadas alteradas

| Layer | Conteúdo desta rodada |
| --- | --- |
| validation | O julgamento de connected/entitled/executable da Account volta para casa |
| commit-effect | O Welcome só submete o Personal Overlay; a seleção de conexão das Settings continua independente |
| persistence | `provider_config.json` continua sendo o único destino do Personal Provider Overlay; a selection das App Settings não é modificada pelo Welcome |
| option-source | O Registry é a única fonte de Provider/Model executável |
| architecture/process | O Host do Off-Peak reutiliza uma única fonte privada de Request Auth |

### 4.2 UI Surface Matrix

| Cenário | Exibição/rascunho | Ação de commit | Owner autoritativo | Isolamento obrigatório |
| --- | --- | --- | --- | --- |
| Key digitada no Welcome | rascunho local de API Key | `savePersonalProviderOverlay` | Personal Provider Config | não escreve Account Overlay/Family selection, não copia Built-in |
| API por uso em Provider Settings | Effective Config + rascunho de Key | mesmo ponto de entrada de Overlay | Personal Provider Config | não entra no Account Request Auth |
| Coding Plan em Provider Settings | acesso/entitlement da Account + status do plano | selection explícita de conexão/operação de conta | App Settings + Account Overlay | não salva Key digitada, não infere entitlement por enabled |
| teste de conexão | linha de Provider/Model | testa o Model oficial após o flush do rascunho de Provider | Registry/ModelFactory | não reescreve Model Rule, não adivinha estado da conta |
| criação e despacho do Off-Peak | status de suporte + selection ociosa | Ticket + Request Auth privado do host | Off-Peak Service + Registry + Account Request Auth | não expõe credenciais, não altera a Session Selection comum |

### 4.3 Relações de alto risco

| Rank | Relação | Risco |
| --- | --- | --- |
| must-inspect | Account Overlay -> Settings/telemetry | `enabled=true, entitled=false` reportado por engano como conectado/comprado |
| must-inspect | Registry -> despacho do Host do Off-Peak | A varredura das Settings atinge vários Providers e o despacho fica sem credenciais |
| must-inspect | Welcome -> Personal Config | Gravar a selection errada ou copiar o Built-in cria dois fatos concorrentes |
| should-inspect | Provider Settings -> teste de conexão | Os gates connected/executable não podem ser misturados de novo |
| invariant-only | desktop continuous / mobile replayable | Esta rodada não altera session stream, queue, snapshot nem semântica de recuperação |
| invariant-only | remote workspace | A sincronização existente do Provider Registry fica inalterada, sem nova fonte privada de autenticação remota |

### 4.4 Graph Drift

O Feature Graph ainda descreve o Account Overlay projetando o `enabled` e o `accessId` de topo e "habilitando apenas o Provider selecionado", o que é inconsistente com os Todo 49/50 e com o Resolver atual. Quando este Todo foi criado, corrigiu-se primeiro para: Built-in de Account com `enabled=true` fixo, Account Overlay projetando apenas `builtinModelIds + access.entitled` e credenciais dinâmicas de conta resolvidas pelos Services no momento da requisição.

## 5. Ordem de implementação

1. Adicionar primeiro os testes que falham para `enabled=true + entitled=false`, cobrindo Settings, status de plano, sincronização, telemetria e Registry;
2. Separar na UI o consumo de descritor, entitlement e executable da Account; remover os velhos 판단 por enabled e os nomes ambíguos;
3. Adicionar testes de regressão do Off-Peak com múltiplos Account Providers, provando primeiro que o Desktop Host hoje falha na resolução;
4. Consolidar as dependências do Off-Peak credential resolver em um único composition root e remover a varredura de Settings no Desktop;
5. Renomear mecanicamente `savePersonalProvider` para `savePersonalProviderOverlay` e fazer os helpers de API Key do Welcome/das Settings o reutilizarem;
6. Adicionar testes verticais do Welcome: só grava o Overlay de API Key, a selection não muda e os campos Built-in não são copiados;
7. Remover os resíduos: Family mode, atualização de entitlement por API Key de Account e o nome incorreto de Coding Plan Key;
8. Atualizar o Design atual, o Feature Graph, os resultados de implementação dos Todo 49/50 e os comentários de código; Todos históricos mantêm apenas o rastro histórico e são marcados como substituídos;
9. Fazer uma varredura mecânica dos símbolos antigos e executar validação direcionada, completa e interativa; após a Review, submeter o Conventional Commit.

## 6. Plano de testes

### 6.1 Provider / Services

- Account Provider `enabled=true, entitled=false`: visível nas Settings, ausente do Registry;
- Account Provider `enabled=true, entitled=true` e completo: entra no Registry;
- A existência do descritor com `entitled=false` não pode ser interpretada como connected/purchased;
- O Account Resolver projeta apenas `builtinModelIds + access.entitled`;
- A Project Key do Coding Plan Individual/Team continua sendo resolvida pela mesma identidade e limites de cache; a API comum por uso não usa essa cadeia.

### 6.2 UI

- Não logado, não comprado, falha de interface e entitlement=false explícito não pulam a primeira sincronização nem reportam assinatura bem-sucedida antes da hora;
- Status de plano, quota/uso e telemetria do funil não leem mais o `enabled` do Account Provider como direito;
- Salvar a Key Z.ai/BigModel no Welcome só atualiza o Personal Overlay do Provider correspondente;
- `providerFamilyConnectionSelections` fica completamente inalterado antes e depois de salvar;
- O Personal Overlay contém só a Key digitada pelo usuário e os campos Personal já existentes, sem copiar Endpoint, Schema, models ou group do Built-in;
- A lista principal/o menu de adição das Provider Settings continuam projetando apenas por `enabled`.

### 6.3 Off-Peak

- Quando a Settings View tem vários Account Providers com `enabled=true` ao mesmo tempo, o único Provider do Registry com entitlement ainda consegue gerar o Request Auth;
- O Request Auth preserva JWT, Coding Plan Key, Ticket e o Header de identidade de Team;
- Start Plan/selection de API Key/sem entitlement/troca de conta continuam falhando de forma explícita;
- Status de suporte, Ticket client, despacho real e Mock Upstream usam o mesmo credential resolver;
- O Desktop Host não importa mais a lógica de seleção de Account Provider da Settings View; credenciais não entram em RPC/Renderer/persistência.

### 6.4 Mecânico e de regressão

- `rg` / `dep:refs` provam zero resíduo do antigo `savePersonalProvider`, dos helpers de Family mode, do `loadProviderApiKey` de Account e dos textos antigos sobre enabled;
- Testes unitários direcionados de Provider, Services, UI, Desktop Host e CLI;
- E2E afetados: Welcome, API Key das Provider Settings, entitlement de Account, teste de conexão e Off-Peak;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm test:unit`;
- Verificação de formatação dos arquivos desta rodada e `git diff --check`.

## 7. Critérios de conclusão

- `enabled`, `entitled` e `executable` têm um único significado em código de produção, testes e documentos;
- A UI não infere mais connected/purchased da Account por `enabled` nem pela existência do descritor;
- O Welcome só salva o Personal Overlay do Provider de API Built-in fixo; as outras escolhas de conexão ficam inalteradas;
- O nome da interface pública do Personal Overlay é explícito e não confunde mais Overlay com Provider Personal-only;
- O Off-Peak continua usando as três materiais de requisição existentes, mas com uma única implementação de resolução via Registry/Account Request Auth;
- O Desktop Host não contém varredura especializada de Account Provider, e credenciais dinâmicas não cruzam a fronteira privada do Host;
- Family mode morto, nome incorreto de Coding Plan Key, atualização inválida de entitlement e fatos antigos de documentação são zerados;
- Testes que falham vêm primeiro; a validação direcionada/completa e a Review são concluídas antes do commit.

## 8. Resultado da implementação (2026-08-31)

Este Todo concluiu a seguinte consolidação de código:

- O helper de acesso de Account no Renderer, a navegação de planos, os cartões de status, a atualização de cota e as métricas de funil passam a interpretar apenas `access.entitled === true` como "a conta atual tem direito"; `enabled` não participa mais do julgamento de conta conectada/comprada;
- O ponto de entrada genérico de escrita de Personal Provider foi renomeado, sem alias, para `savePersonalProviderOverlay`, expressando uniformemente "salvar Overlay esparso" do Config Service, Facade e Services até o helper de UI, sem mais sugerir a criação de um Provider Personal-only;
- A API Key Z.ai/BigModel do Welcome continua gravando apenas o Personal Overlay esparso do Provider de API Built-in fixo e preserva os campos Personal já existentes; nada de Endpoint, Schema, membros de modelo ou group do Built-in foi copiado, e a selection de conexão não foi reescrita;
- A dependência de credenciais do Account Connection Resolver foi renomeada e estreitada para `loadCodingPlanApiKey`, deixando claro que não é uma API Key de Provider genérica;
- O Desktop Host removeu a segunda varredura de Account Provider da Settings View. O composition root de Services agora expõe, apenas por um WeakMap privado do Host, o mesmo builder de Off-Peak Request Auth baseado no Registry; esse closure reutiliza o Account Request Auth oficial e as três materiais de requisição, sem entrar em RPC, Renderer, Config ou persistência;
- `ModelProviderFamilyModeSettings`, o mode padrão e o helper de filtro antigo, sem chamador, foram removidos, mantendo os tipos de seleção de conexão ainda em uso;
- A atribuição de origem `main/subagent/other` do `x-zcode-session-type` continua sendo um fato por requisição e não entrou no Provider/Model Config.

Resultados da validação:

- Testes direcionados de Provider/Services/UI, `typecheck` da raiz, `lint`, a verificação de formatação dos 41 arquivos desta rodada e `git diff --check` passaram;
- A varredura mecânica dos símbolos antigos passou: o antigo `savePersonalProvider`, os helpers de Family mode e o `loadProviderApiKey` de Account não existem mais no código de produção;
- A suíte unitária completa ficou em `12749 passed / 25 skipped / 2 failed`; as duas falhas não têm relação com as mudanças de Provider desta rodada e são reproduzíveis de forma independente: asserção de texto de exibição do gatilho de modelo V4 e asserção de stable identity do CUA permission broker;
- O `fmt:check` de todo o repositório continua bloqueado por HTML inválido já existente em um exemplo upstream do Electron e por falha de leitura em `apps/zcode-cli/tests/gb2312.js`; todos os arquivos alterados nesta rodada passaram individualmente em `oxfmt --check`.