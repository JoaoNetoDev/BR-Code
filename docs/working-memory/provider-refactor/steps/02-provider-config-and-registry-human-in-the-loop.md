# M2: Configuração de Provider e Registry Human in the Loop

> Status: manutenção contínua
>
> Atualizado recentemente: 2026-08-20

Este documento registra as questões de arquitetura, produto e contrato público que foram submetidas à decisão humana durante a implementação de M2. Ele difere de um implementation log: este guarda as decisões reversíveis tomadas autonomamente pelo Agent apenas para seguir avançando; este guarda as decisões que alteram a abstração-alvo ou o limite de implementação e que precisam de confirmação humana.

Cada registro explica o contexto no momento em que a questão foi levantada, a decisão humana, o design alvo e o impacto na implementação. As conclusões confirmadas são sincronizadas para o nó de Design correspondente; este documento mantém o contexto da decisão e a distância entre a implementação atual e o alvo.

## 1. Account Access reaproveita o Provider Config Overlay

> Status da decisão: confirmada e implementada; o Provider comum de longo prazo saiu da fonte antiga de Snapshot

### Contexto

O modo de acesso de um Provider e sua API pública são duas dimensões independentes: `access.type = "api-key"` usa uma API Key estática, `access.type = "zhipu-account"` usa o login atual, um plano ou uma conexão de equipe; `api.type` descreve, por sua vez, Anthropic Messages, OpenAI Responses ou OpenAI Chat Completions. Modos de acesso diferentes podem usar a mesma API.

O Registry novo inicialmente mantinha o estado de conta em uma lista separada `AccountProviderAccessEntry[]`, e o Resolver montava `modelIds` e `accessId` por `providerId`. A primeira ajusteção renomeou aquilo para Runtime Overlay, mas criou `AccountProviderOverlay`, `AccountProviderAccess` e `allowedModelIds` — essencialmente um segundo conjunto de estruturas de dados de Provider.

Isso conflita com o objetivo do Config Overlay: Official, Personal e o estado de conta estão todos complementando campos do mesmo Provider, sem necessidade de três formas e um algoritmo de filtro especial.

### Decisão

O estado de conta produz diretamente uma terceira camada esparsa `ProviderConfigMap`, usando exatamente a mesma estrutura de dados e o mesmo algoritmo do Provider Config Overlay de Official e Personal:

```text
Official ProviderConfigMap
        |
        | overlay
        v
Personal ProviderConfigMap
        |
        | overlay
        v
Account ProviderConfigMap
        |
        v
最终 ProviderConfigMap
```

A posse das três camadas continua diferente: Official é gerenciado pela equipe oficial, Personal é gerenciado pelo usuário e Account é gerado em tempo real pelo estado da conta e do plano. A camada Account não é persistida nem editada pela página de configurações; essas diferenças são expressas pela Source e pelo ciclo de vida, e não por outro conjunto de tipos de domínio.

### Access Config

Account Access é um ramo discriminante de `ProviderConfig.access`:

```ts
class ProviderConfig extends ConfigOverlay {
  access?: ProviderAccessConfig | null;
  api?: ProviderApiConfig | null;
  models?: readonly ModelId[] | null;
}

class ApiKeyAccessConfig extends ConfigOverlay {
  readonly type = "api-key";
  apiKey?: string | null;
}

class ZhipuAccountAccessConfig extends ConfigOverlay {
  readonly type = "zhipu-account";
  accessId?: AccountAccessId | null;
}
```

`accessId` é a identidade de conexão de conta não sensível, usada para distinguir Start Plan, Personal Coding Plan e um Team Plan específico. Não é um JWT, uma API Key nem um Header.

### A camada Account fornece a composição de modelos

O Account Provider oficial responde por `api.type`, `api.baseURL`, Headers estáticos e outras definições gerenciadas, sem precisar listar antecipadamente os modelos que a conta atual terá disponíveis. A camada Account também fornece o `accessId` em nível de conta e os `models` da conexão atual:

```text
Official
A -> {
  access: { type: zhipu-account },
  api: { type: anthropic-messages, baseURL: ... }
}

Personal
A -> {
  label: "我的 Coding Plan"
}

Account
A -> {
  access: { type: zhipu-account, accessId: account-team-plan:... },
  models: [A, B]
}

Final
A -> {
  label: "我的 Coding Plan",
  access: { type: zhipu-account, accessId: account-team-plan:... },
  api: { type: anthropic-messages, baseURL: ... },
  models: [A, B]
}
```

`models` segue as regras normais de Overlay de campo: quando a camada Account fornece o campo, ela sobrescreve por completo a camada anterior e determina diretamente a composição e a ordem finais. Não existe mais `allowedModelIds`, nem se calcula a "interseção entre modelos configurados e modelos permitidos". Model Properties, Option Specs e Reasoning Mapping continuam sendo resolvidos por ModelConfigRules, o que é uma questão diferente da lista de composição de modelos do Provider.

### Limites de Registry e autenticação

O Registry lida apenas com Config:

```text
三层 ProviderConfigMap
        |
        | overlay + validateComplete
        v
Provider Registry
```

O `ProviderConfig` final pode entrar no Registry assim que tiver `access.type` completo, `accessId` em nível de conta e `models`. O Registry não valida se o `accessId` corresponde a um benefício real, nem estabelece uma trava adicional de `accessAllowed` com base na relação de composição da Account Source.

Mesmo que alguém escreva manualmente um `accessId` inválido, ele não receberá credenciais reais. A autoridade final da autenticação da requisição é o Account Request Auth Service:

```text
Provider.config.access.accessId
        |
        | Model 创建时固定
        v
Model 内部执行身份
        |
        | 每个请求 attempt
        v
Account Request Auth Service
        |
        ├─ 找到当前 JWT / API Key / Header -> 发起请求
        └─ 无法解析或无权限             -> 请求失败
```

Registry e Model não guardam segredos de conta. O Token ou a Runtime Key internos à identidade da conta podem ser renovados, mas um Model já criado não acompanha a troca da conexão global atual para outro Personal ou Team Plan.

### Provider final

O Provider final não aninha mais outro objeto de Account Access:

```ts
interface Provider {
  readonly providerId: ProviderId;
  readonly config: ProviderConfig;
  readonly models: readonly ProviderModel[];
}
```

Quando `provider.config.access.type === "zhipu-account"`, o TypeScript estreita o Access Config para `ZhipuAccountAccessConfig`, e o ModelFactory lê diretamente `provider.config.access.accessId`. `ProviderRegistryProvider` passa a usar o nome de domínio `Provider`.

### Impacto na implementação atual

- A saída da Account Source passa a ser um `ProviderConfigMap` esparso, e não mais `AccountProviderAccessEntry[]` nem `AccountProviderOverlay[]`.
- O Provider Config Snapshot ganha uma camada de Account Provider Config; o Resolver chama o mesmo Overlay na ordem Official, Personal, Account.
- São removidos do Registry `AccountProviderAccess`, `allowedModelIds`, `accessAllowed` e o `accountAccessId` achatado. O protocolo de requisição continua usando `accountAccessId` para passar ao Service de autenticação dinâmica a identidade já fixada no Model.
- `ZhipuAccountAccessConfig` contém `accessId`; a validação final de completude exige que o Provider de conta tenha os campos de Config necessários à execução.
- O ModelFactory fixa o `accessId` a partir do `ProviderConfig.access` final; a cadeia existente de autenticação dinâmica em tempo de requisição permanece inalterada.
- No início da implementação desta decisão, foi permitido que o Snapshot antigo projetasse temporariamente um `ProviderConfigMap` oficial de conta. A M2.8 já removeu essa cadeia de compatibilidade de produção; hoje a Account Source produz Config diretamente, e este documento deixa de considerar a projeção de Snapshot como uma solução aplicável.

## 2. Manter a View de Last-known-good quando a atualização de uma Source falha

> Status da decisão: confirmada; a pessoa revisou e aprovou a estratégia adotada autonomamente pela implementação

### Contexto

O Registry agrega as três rotas de Provider Config — Official, Personal e Account — em uma View completa. Quando qualquer rota muda, o Registry relê, reparseia e revalida todas as entradas ao lado, e só publica a nova View de forma atômica depois de tudo dar certo.

```text
当前完整 View v1
        |
        | Source 发生变化
        |
        v
读取 Official / Personal / Account
        |
        v
构建并校验 View v2
        |
        | 全部成功
        v
原子发布 v2
```

A atualização de uma Source pode falhar porque o arquivo está temporariamente ilegível, o parse do JSON ou do Schema falha, a origem oficial está com problema, ou o serviço de conta e de plano dá timeout. Nesse momento o sistema só consegue confirmar que "não foi possível obter o fato mais recente"; ele não pode concluir, a partir disso, que o usuário apagou a Personal Config, que o oficial tirou o Provider do ar ou que a conta saiu.

Cada camada do Overlay normalmente guarda apenas os campos de que é responsável. Publicar o resultado parcial sem a Source que falhou transforma um erro de leitura em uma deleção de negócio: uma falha em Personal pode fazer a API Key e o Provider do usuário sumirem; uma falha em Official pode impedir que uma Personal Config esparsa forme um Provider completo; uma falha em Account pode fazer todos os modelos de plano sumirem de repente.

Para poder seguir avançando, a implementação já adotou Last-known-good de forma autônoma: quando a leitura ou o parse da atualização falha, o Snapshot atual não é substituído, a atualização explícita é recusada e um evento de erro de atualização é emitido; a próxima atualização bem-sucedida ainda pode publicar normalmente a nova View. Os testes correspondentes já cobrem a manutenção da View antiga utilizável após a falha e a recuperação posterior. Na época, o Design ainda marcava "manter a View antiga ou publicar o resultado parcial" como pendente de decisão, então era necessário que uma pessoa revisasse se essa escolha de implementação passaria a ser o design formal.

### Decisão

Concorda-se em manter a estratégia Last-known-good adotada pela implementação atual e promovê-la a design formal: depois que o Registry possui uma View bem-sucedida, qualquer falha de leitura, parse ou atualização em qualquer Source mantém a View completa anterior, sem publicar um resultado parcial que falte essa Source.

```text
刷新成功
└─ 原子发布新的完整 View

刷新失败
├─ 保留上一份成功 View
├─ 报告具体 Source 与错误
└─ 等待 watcher、主动刷新或后续状态变化恢复
```

"Falha na atualização" e "obtenção bem-sucedida de um estado vazio" precisam ser estritamente distinguidos. Quando uma Source retorna com sucesso uma deleção, desativação, Config Map vazio ou estado de conta inválido, todos esses são fatos novos explícitos, e o Registry precisa construir e publicar a nova View normalmente; o Last-known-good não pode bloquear mudanças de estado válidas.

Na primeira inicialização não há View bem-sucedida a preservar. Se a primeira construção falhar, o Registry falha ao iniciar e expõe o erro, sem disfarçar um estado desconhecido como uma View vazia determinada.

### Relação com a autenticação de requisições

A View de Last-known-good pode manter por um instante curto um Account Provider que já aparecia na lista de modelos, mas isso não estende a permissão da conta. O Account Request Auth Service continua obtendo as credenciais atuais a cada requisição conforme o `accessId` fixado no Model, e continua sendo a autoridade final sobre a permissão da conta:

```text
旧 Registry View 中仍有 Account Provider
        |
        v
Model 发起请求
        |
        v
Account Request Auth Service
├─ 当前身份仍有效 -> 返回凭据
└─ 已退出或无权限 -> 请求失败
```

O Last-known-good do Registry existe para evitar que a projeção oscile violentamente por falhas instantâneas; ele não armazena em cache, não recupera e não forja materiais de autenticação de requisição como JWT, Runtime Key ou Headers de verificação de segurança de uso único.

### Impacto na implementação atual

- O Registry publica somente Views completas construídas e validadas por todas as Sources em conjunto.
- Uma falha na atualização mantém a revision e a View atuais, expondo a causa da falha por evento de erro e log.
- Atualização explícita, file watcher e atualizações da Account Source continuam entrando na mesma cadeia de atualização; a deduplicação de revision evita publicar duas vezes a mesma mudança.
- Estados vazios bem-sucedidos, deleções, desativações e invalidação de conta precisam ser publicados e não podem ser classificados como falha de atualização.
- A formulação pendente de decisão no Design, "manter a View antiga ou publicar o resultado parcial", deve ser substituída por esta conclusão.

## 3. Não dar mais suporte a Model Options arbitrários

> Status da decisão: confirmada; o esquema de compatibilidade autônomo do Agent saiu da implementação

### Contexto

A configuração antiga do CLI e a configuração de Provider do Desktop usavam o mesmo formato subjacente antigo (`provider` → `models` aninhado), de modo que ambas permitiam escrever `options` arbitrários na configuração do modelo:

```json
{
  "models": {
    "model-id": {
      "options": {
        "arbitrary_field": "value"
      }
    }
  }
}
```

Esse formato subjacente em comum provoca um erro fácil de julgamento: ele não é um formato exclusivo do CLI, nem significa que o CLI ou o Desktop já tenha estabelecido Model Options arbitrários como uma capacidade formal de produto.

O CLI antigo levava parte de `model.options` como parâmetros de Provider para a requisição do modelo. O Schema de configuração físico do Desktop também aceita e preserva `model.options`, mas o `ModelProviderModelConfig` formal e a página de configurações não oferecem capacidade de Options arbitrários; o campo de compatibilidade explicitamente interpretado pelo Desktop hoje é principalmente `options.max_tokens`, converto em `maxOutputTokens` formal. As configurações de avaliação interna existentes também só usam `apiKey`, `baseURL` em nível de Provider e campos de capacidade do modelo, sem depender de `model.options` arbitrário.

Portanto, Model Options arbitrários são uma válvula de extensão herdada do formato subjacente, e não um contrato público que a nova arquitetura de Provider precise herdar.

### Esquema autônomo do Agent

Para evitar que a migração da configuração antiga do CLI perca `model.options` arbitrários, o Agent adicionou durante a implementação:

```ts
ModelConfig.requestParameters?: Record<string, unknown>;
```

Esse campo passa pelo Config Overlay, pela projeção da Personal Config e pela cadeia de criação de Model, voltando a formar um canal arbitrário de parâmetros de requisição ao Provider. A solução aumenta a compatibilidade com configurações antigas, mas contorna os limites fortemente tipados já estabelecidos por `ModelOptionSpecs`, `ModelOptions` e `reasoningMapping`, e também cristaliza na nova arquitetura uma capacidade de extensão histórica que ainda não virou um compromisso de produto.

### Decisão

A solução de compatibilidade acima é rejeitada. A nova arquitetura de Provider não dá mais suporte a Model Options arbitrários e também não mantém um `requestParameters` genérico.

A nova configuração de modelo só carrega opções genéricas formalmente definidas:

```text
reasoningLevel
maxOutputTokens
```

Elas passam, respectivamente, por `ModelOptionSpecs`, `ModelOptions` e `reasoningMapping` para realizar a declaração de capacidade, a escolha do usuário, a sobrescrita em nível de requisição e a conversão para o protocolo do Provider. Campos da configuração antiga que tenham semântica formal clara podem ser migrados:

```text
options.max_tokens
        |
        v
maxOutputTokens
```

Outros `model.options` arbitrários não são migrados nem repassados, e também não entram na nova Model Config. Usuários internos de avaliação podem ajustar configurações da CLI que ainda não foram publicadas; não é preciso desenhar uma migração sem perdas para esse canal de extensão histórico.

### Impacto na implementação atual

- Remover `ModelConfig.requestParameters` e sua lógica de Schema, Overlay, projeção, testes e passagem em tempo de execução.
- Remover a migração de `model.options` arbitrários do importador de Personal Config do CLI antigo.
- Manter a migração semântica de `options.max_tokens` para o `maxOutputTokens` formal.
- O armazenamento antigo do Desktop pode manter temporariamente `model.options` desconhecidos como estão, mas a nova cadeia de Config, Registry e execução de Model não os lê.
- O `apiKey` e o `baseURL` historicamente guardados no `options` de nível de Provider não têm relação com esta decisão; eles devem migrar para campos formais de Provider Config.
- Ao adicionar novas opções de modelo no futuro, definir primeiro os campos fixos, o Option Spec, as regras de validação e o mapeamento do Adapter, e só então entrar na nova arquitetura como capacidade pública.

## 4. Header estático pertence apenas ao Provider Config

> Status da decisão: confirmada; o esquema de compatibilidade autônomo do Agent saiu da implementação

### Contexto

O CLI antigo e o Desktop usavam o mesmo formato antigo de configuração de Provider subjacente, e por isso ambos permitiam Headers em nível de Provider e em nível de Model:

```text
Provider 级 Header
├─ provider.headers
└─ provider.options.headers

Model 级 Header
└─ provider.models.<modelId>.headers
```

O CLI antigo combinava esses Headers por camada e os usava nas requisições de modelo. O formato de configuração físico do Desktop também aceita Headers em nível de modelo, mas o tipo de modelo formal e a página de configurações não os estabeleceram como capacidade de produto. A Config oficial atual, as configurações de avaliação internas e as principais cadeias de produto não usam Headers em nível de modelo.

O Header em nível de Provider tem uma semântica de conexão clara: um Header HTTP fixo que precisa ser enviado a cada_req ao acessar um Provider. Ele pode expressar o roteamento de tenant e projeto de um proxy corporativo, uma identidade organizacional adicional, a origem do cliente e a versão do protocolo. É um `Record<string, string>` restrito, diferente das opções arbitrárias de Provider que não têm semântica pública.

Headers dinâmicos de autenticação de conta são outra categoria de dados. JWT, materiais de verificação de segurança de uso único e Headers Runtime dinâmicos são obtidos pelo Account Request Auth Service a cada requisição e não entram no Provider Config persistente.

### Esquema autônomo do Agent

Para compatibilizar com o `model.headers` do CLI antigo, o Agent adicionou durante a implementação:

```ts
class ModelConfig {
  headers?: Record<string, string>;
}
```

Ao criar o Model, o Registry fixa esse conjunto de Headers internamente no Adapter e sobrescreve Headers de Provider com o mesmo nome. O `Model` e o `ModelRequest` públicos não expõem Headers. A solução não vaza detalhes da requisição no nível de abstração, mas traz diferenças de conexão em nível de modelo — que ainda não têm caso de uso formal de produto — para a nova Model Config.

### Decisão

Confirma-se manter o Header estático em nível de Provider e remover o Header em nível de Model:

```text
ProviderConfig.headers
└─ 访问该 Provider 时固定携带的静态 Header

Account Request Auth Service
└─ 每个请求取得的动态鉴权 Header

ModelConfig
└─ 不包含 Header
```

O `provider.headers` e o `provider.options.headers` da configuração antiga migram unificados para `ProviderConfig.headers`. O `provider.models.<modelId>.headers` da configuração antiga não é migrado nem entra na nova cadeia de Config, Registry ou execução de Model.

Se dois modelos realmente precisarem de Headers de conexão fixos diferentes, eles devem ser configurados como dois Providers separados. Quando surgir uma necessidade real de roteamento em nível de modelo que não possa ser expressa pelo limite de Provider, o design será refeito com base no caso concreto.

Na execução da requisição, materiais de autenticação dinâmicos podem sobrescrever campos estáticos com o mesmo nome:

```text
ProviderConfig.headers
        |
        | 动态鉴权材料覆盖同名字段
        v
Account Request Auth Service headers
        |
        v
最终 HTTP 请求 Header
```

### Impacto na implementação atual

- Manter `ProviderConfig.headers` e seu Schema, Overlay, migração e projeção no Adapter.
- Migrar e combinar o `provider.headers` e o `provider.options.headers` antigos em `ProviderConfig.headers`.
- Remover `ModelConfig.headers` e seu Schema, Overlay, projeção e testes.
- Remover a migração de `model.headers` do importador de Personal Config do CLI antigo.
- Remover a preservação implícita de Headers em nível de modelo pela ponte de migração da página de configurações.
- Manter o mecanismo de Headers dinâmicos em tempo de requisição do Account Request Auth Service.
- Por enquanto, o Header estático de Provider pode ser fornecido apenas pelo arquivo de configuração; a página de configurações não precisa adicionar imediatamente um editor avançado de Headers.

## 5. OpenAI Compatible fixa o streaming de Usage na requisição

> Status da decisão: confirmada e implementada; a chave de desligamento no Config saiu

### Contexto

O protocolo de streaming do OpenAI Compatible precisa carregar na requisição:

```json
{
  "stream_options": {
    "include_usage": true
  }
}
```

Só assim o Provider retorna um Token Usage preciso no fim do stream. Usage faz parte do resultado da execução do modelo e depois é usado em capacidades de sistema como estatísticas de consumo, Trace e orçamento de contexto.

O código histórico adicionei, temendo que alguns serviços compatíveis não aceitassem `stream_options.include_usage`, o seguinte na configuração do Provider:

```ts
includeUsage?: boolean;
```

Quando configurado como `false`, o Adapter não envia esse campo. Não foi encontrado no repositório nenhum Provider, caso de uso formal de produto ou configuração de usuário que dependa dessa capacidade de desligamento.

### Esquema autônomo do Agent

Durante a implementação de M2, o Agent incorporou o antigo `includeUsage` como campo de compatibilidade no novo `ProviderConfig` e continuou passando-o pela cadeia de migração de configuração, Overlay, Registry e criação de Model.

A solução preserva a capacidade de expressão da configuração antiga, mas ao mesmo tempo transforma "solicitar Usage ou não" em uma configuração de Provider que o usuário pode desligar. Uma vez desligada, o sistema pode não conseguir obter o consumo real preciso, o que é inconsistente com a semântica fundamental de Usage na cadeia de execução.

### Decisão

Confirma-se que as requisições OpenAI Compatible sempre habilitam explicitamente `includeUsage: true`. Usage é parte do resultado da execução e não pertence à configuração de Provider que o usuário possa desligar. A nova Provider Config não contém `includeUsage`, e esse campo das configurações antigas não é migrado. Serviços compatíveis que não suportam `stream_options.include_usage` estão fora do suporte formal, e também não é oferecido um caminho de degradação que remova o campo e tente novamente.

## 6. O cache de Plan Entitlement precisa de uma identidade de conta não sensível

> Status da decisão: confirmada; `accessId` identifica uma conexão de conta concreta

### Contexto

Usage / Entitlement já usam o `accessId` não sensível do Account Provider para construir a identidade de cache, sem projetar API Key ou JWT no Renderer. Atualmente o `accessId` de Personal e de Start Plan só expressa o tipo de conexão:

```text
start-plan:<providerId>
coding-plan:<providerId>
```

Ele não contém a identidade da conta concreta. Quando duas contas são logadas em sequência na mesma máquina, ambas recebem a mesma chave de cache. A página de Usage exibe primeiro um cache curto com TTL de dez minutos e depois atualiza silenciosamente; se a atualização da nova conta falhar, o Hook existente continua preservando o cache antigo já exibido para não limpar a página por causa de oscilação de rede. Portanto, apenas a atualização em background não garante o isolamento de contas.

### Decisão

O `accessId` identifica uma conexão de conta concreta, e não apenas o tipo de conexão como Start Plan, Personal Coding Plan ou Team Plan. Quando a conta logada efetivamente muda, o `accessId` precisa mudar; a renovação do JWT, da API Key, da Runtime Key ou do OAuth Token dentro da mesma conta não altera o `accessId`.

```text
账号 A 的连接
└─ accessId A
   ├─ Account Provider Config
   ├─ Usage Cache
   ├─ Credential Store
   └─ 已创建 Model 的请求身份

账号 B 的连接
└─ accessId B
   ├─ Account Provider Config
   ├─ Usage Cache
   ├─ Credential Store
   └─ 新创建 Model 的请求身份
```

A Account Source usa a identidade estável não sensível fornecida pelo serviço de contas para gerar o `accessId`. Ele não pode conter JWT, API Key ou Header dinâmico, nem usar hash de Secret como identidade no Renderer. O Team Plan continua incluindo a organização e o projeto concretos; se a mesma organização/projeto não deve compartilhar a identidade de conexão entre contas diferentes, o escopo de conta também entra nela.

No login, logout e troca de conexão ainda é possível limpar proativamente o cache de Usage antigo, mas a limpeza é apenas uma medida auxiliar para reduzir dados obsoletos e consumo de armazenamento; ela não garante a correção do isolamento de identidade.

### Impacto na implementação

- A Account Source precisa obter uma identidade de conta não sensível ao gerar os `accessId` de Personal, Start e Team.
- O cache de Usage / Entitlement continua usando `providerId + accessId`, sem introduzir um `accountCacheIdentity` paralelo.
- O Account Credential Store isola credenciais pelo novo `accessId` em nível de conta. A chave estável em nível de Provider que existe hoje é uma implementação intermediária de M2 ainda não publicada, e não se desenha migração para ela; a Personal Coding Plan Key é obtida novamente para a conta atual, e a Team Key é obtida novamente ou armazenada em cache por conta e organização/projeto.
- Um Model já criado fixa o `accessId` antigo. Depois da troca de conta, ele não pode usar silenciosamente credenciais da nova conta; um novo Agent Loop cria um novo Model a partir da Account Config mais recente.
- Account Provider Config, Usage Source, Credential Store e Model Request Auth compartilham a mesma identidade de conexão.
- O Request Auth, além de buscar a credencial pelo `accessId`, também confere a qual conta a credencial atual pertence. O `accessId(account-A)` de um Model antigo não pode se combinar com uma `credential(account-B)` após a troca para disparar uma requisição.

## 7. `desktop-attached remote` usa a autoridade de Provider remota

> Status da decisão: confirmada; o primeiro passo entra em M2.8, e a sincronização contínua e as operações remotas de configuração são funcionalidades posteriores

### Contexto

O `desktop-attached-remote` em produção funciona assim: o Desktop lê o Snapshot completo local do Provider Registry e o envia ao Remote Host/Worker através de `workspace/updateProviderRegistry`. O Snapshot pode carregar API Key, JWT, Team Plan Key e Headers; e o portão de inicialização do agente remoto também lê a View de modelos do Host base do Desktop.

Por um tempo, M2 formulou a questão restante como "como um Remote Worker solicita o Desktop Account Request Auth através de Host", com candidatos como o relay pelo Renderer ou um Auth Broker de Local Host para Remote Host. As duas opções assumem por padrão que o Remote Worker pertence ao Desktop Provider Environment.

### Decisão

O Remote Environment é um Provider Environment independente. Ele tem Config, Credential, Account Source, Registry e ModelFactory próprios. O Desktop apenas controla remotamente a Session, exibe a Remote View e envia o ModelSelection; não fornece fatos de Provider nem credenciais de requisição ao Remote Worker.

```text
Desktop Entry
└─ remote control
        |
        v
Remote Host
├─ Remote Provider Config
├─ Remote Credential Store
├─ Remote Account Source
├─ Remote Registry
└─ Remote Worker
```

### Migração por fases

O primeiro passo troca a autoridade em tempo de execução e remove a injeção de Snapshot completo, runtimeModel, Account Config e Secret de Desktop → Remote. Se o Remote Environment ainda não tiver Config utilizável, o produto deve reportar claramente que o Provider remoto ainda não foi configurado, sem recorrer aos fatos do Desktop.

O segundo passo é uma funcionalidade de sincronização independente que escreve continuamente a Config e as Credentials locais no Remote Store. A funcionalidade de sincronização cuida apenas de Provisioning; a Remote Source escuta o próprio Store, publica novas revisions e reconstrói o Remote Registry. Objetos de Registry, Account Overlay, Models e Headers de requisição não são transmitidos por essa cadeia de sincronização.

O terceiro passo permite que o App chame diretamente o Remote Settings / OAuth Service, edite remotamente a Remote Personal Config, inicie um login remoto e veja a Remote Settings / Selection View. A troca e a persistência de credenciais acontecem no Remote Environment.

### Impacto na implementação

- Remover o caso especial de autoridade em que `desktop-attached-remote` desativa o próprio Provider Registry.
- O readiness, o menu de modelos e as configurações de um Workspace remoto leem a Remote Facade.
- O Remote Worker cria Models de longo prazo apenas a partir do Remote Registry.
- O Remote Request Auth lê apenas o Remote Credential Store.
- Remover os tópicos de relay de auth pelo Renderer e de Auth Broker de Host para Host.
- `provider/updateAccountConfig` é usado apenas entre Host e Worker do mesmo Environment.
- A sincronização contínua de local para remoto e a capacidade de configuração remota pelo App não bloqueiam a troca de autoridade do primeiro passo.

## 8. Usage / Entitlement saem do Provider Config e do Provider Service antigos

> Status da decisão: confirmada e implementada; o Usage saiu do Provider Service antigo, e a abstração interna será organizada depois

### Comportamento atual

A página de configurações de Usage lista o Personal Coding Plan e todos os Team Projects assinados que a conta atual consegue consultar, permitindo que o usuário veja cada um separadamente; a barra lateral e o Composer mostram apenas a cota da conexão de modelo atual. Esse comportamento de produto permanece inalterado.

Hoje a lista de origens já é produzida principalmente pelo Account Config, pelo Entitlement e pelos Team Products dentro do `ProviderSettingsView`, mas o `BigModelUsageQuotaProvider` do Host ainda lê o antigo `ModelProviderService.getAllCached()`, e depois procura novamente o Provider dentro de `ModelProviderConfig[]`, verifica o estado de habilitação, lê a API Key, infere o endereço da requisição e renova a Coding Plan Key. Isso faz com que o grande objeto antigo de Provider, que já saiu da cadeia principal da UI, continue sendo a fonte de fato da execução do Usage, e também bloqueia a remoção da Config antiga e do Provider Service antigo.

```text
当前 UI 已选择的 Usage Source
├─ providerId
├─ accessId
├─ organizationId?
└─ projectId?
        |
        | 身份在现有链路中丢失或不完整
        v
BigModelUsageQuotaProvider
        |
        v
旧 ModelProviderService / ModelProviderConfig
└─ 再次猜测查询来源与请求凭据
```

### Decisão

Usage / Entitlement precisam sair do `ModelProviderService`, do `ModelProviderConfig` e da Config antigos. Esta migração tem como primeiro objetivo achatar a fonte dos fatos: desde que a cadeia de chamada use por completo os fatos de Provider Config, Account Config e Credential novos, não se mantém dependências antigas apenas para esperar a abstração final de domínio do Usage; problemas de responsabilidade interna encontrados após a migração podem ser tratados como um refactor separado.

Quando a UI já tiver escolhido a Usage Source, a requisição deve carregar a identidade de origem completa e não sensível:

```text
Usage Source
├─ providerId
├─ accessId
├─ organizationId?
└─ projectId?
        |
        v
UsageStatsService
        |
        v
请求期鉴权
├─ Personal Coding Plan -> Account Credential Store
├─ Team Plan            -> Team Plan Request Key Resolver
└─ Start Plan           -> OAuth / ZCode JWT Store
        |
        v
Usage / Entitlement API
```

O Host não escolhe mais a origem com base no array antigo de Providers. Se um Provider está sendo usado para seleção de modelos, se é selecionável no Registry e qual modelo a Session atual está usando não servem como filtro para a Usage Source da página de configurações. Quando o usuário desativa a entrada de modelos de um Account Provider, o Usage ainda pode ser consultado desde que a conexão da conta continue existindo.

Um API Provider comum que ainda precise participar de consultas de monitor/usage lê apenas a nova Effective API Provider Config; o Secret do Account Provider é sempre obtido em tempo de requisição pelo serviço de Credential/Account. Qualquer adaptador de migração só pode projetar entradas estreitas a partir dos fatos novos de Config, Account e Credential, e não pode reler a Config antiga nem o Snapshot antigo de Provider.

O roteamento de Usage dos Account Plans conhecidos pode continuar usando, nesta rodada, a lógica existente de construção de providerId/family e de endereço de serviço, mas sem adivinhar o tipo de plano da conta pelo Endpoint do modelo. Se o roteamento de Usage deve entrar no Official Config é algo para o refactor futuro do domínio de Usage, e não bloqueia a saída da fonte antiga de fatos de Provider.

### Limite de implementação desta rodada

- Completar o `accessId` nas requisições de Coding Plan Usage / Entitlement, preservando o contexto atual de organização/projeto do Team.
- `BigModelUsageQuotaProvider` remove a dependência de `IModelProviderService`, bem como as leituras de `getAllCached()`, `refreshCodingPlanApiKey()` e `ModelProviderConfig[]`.
- Personal, Team e Start Plan reutilizam respectivamente o Credential Store existente, o Team Key Resolver e o OAuth Token Store; nenhum novo cache de Secret é copiado.
- Preservar o comportamento da página de configurações, da barra lateral, do Composer, do reset de plano e da atualização dos caches existentes.
- Esta rodada não exige formar primeiro um framework perfeito e genérico de Usage Source/Authorization. Depois do achatamento, se o `BigModelUsageQuotaProvider` ainda misturar responsabilidades demais, ele é separado em um passo próprio.

O critério de conclusão é: ao remover a Provider Config e o Provider Service antigos, Usage / Entitlement não constituem mais um bloqueio nem reintroduzem a fonte antiga de fatos por meio de fallback de compatibilidade.

## 9. Camadas de Provider Access, API e Model API Adapter

> Status da decisão: parcialmente substituída; as camadas `access/api` do Provider continuam válidas, e `ModelConfig.apiAdapter` foi retirado pela decisão do item 11

### Contexto

A Provider Config anterior expressava com um único `kind` tanto o modo de acesso por API Key quanto por conta, e ainda achatava `apiFormat` e `baseURL` no Provider; do lado do modelo, `reasoningMapping` era colocado diretamente no ModelConfig. Isso mistura "como obter elegibilidade para chamada", "qual API pública usar" e "quais comportamentos fixos de adaptação aquele modelo tem naquela API" em uma única camada.

### Decisão

A Provider Config é dividida em duas sub-configurações ortogonais:

```text
ProviderConfig
├─ access.type
│  ├─ api-key
│  └─ zhipu-account
└─ api.type
   ├─ anthropic-messages
   ├─ openai-responses
   └─ openai-chat-completions
```

O campo discriminante usa uniformemente `type`. `access` expressa a origem da elegibilidade para chamada e `api` expressa o protocolo público de requisição; os tipos internos de Adapter continuam sendo implementação de execução e não entram na Config exposta.

Este item decidiu, na época, concentrado ainda mais os comportamentos fixos da combinação modelo + API em `ModelConfig.apiAdapter`. Auditorias posteriores da AI SDK, das interfaces reais do GLM e das interfaces oficiais de compatibilidade Anthropic dos various fornecedores mostraram que essa camada misturava comportamento inerente ao protocolo, mapeamento de parâmetros de inferência do fabricante e replay de mensagens, e que no fim restava apenas um campo que precisava ser configurado, o `reasoningMapping`. Essa parte da decisão foi retirada; a estrutura abaixo permanece apenas como rastro da evolução da decisão, e o design atual segue o item 11:

```ts
interface ModelConfigRule {
  providerMatch?: string;
  modelMatch: string;
  apiMatch?: string;
  config: ModelConfig;
}

class ModelConfig extends ConfigOverlay {
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
  apiAdapter?: ModelApiAdapterConfig | null;
}

class ModelApiAdapterConfig extends ConfigOverlay {
  reasoningMapping?: ReasoningMappingConfig | null;
  preserveThinking?: boolean | null;
  reasoningContentField?: string | null;
}
```

`apiMatch` usa a mesma semântica de casamento de padrão de `providerMatch` e `modelMatch`; as regras são executadas em ordem e os itens posteriores continuam aplicando Overlay sobre o resultado anterior. `preserveThinking` e `reasoningContentField` são comportamentos fixos de adaptação de API, não Model Options opcionais pelo usuário.

A Provider Config consolida a antiga estrutura `kind/apiFormat/baseURL` em `access/api`, e `apiFormatMatch/reasoningMapping` em `apiMatch/apiAdapter`. Official, Personal e Account continuam reutilizando o mesmo ProviderConfig Overlay; a camada Account apenas complementa a conexão de conta e a composição atual de modelos, sem persistir credenciais de requisição. A versão de Schema usada intermediariamente no branch de desenvolvimento não constitui contrato de publicação; o número de versão final é tratado uniformemente pela próxima decisão.

A API Anthropic de GLM-5.2 e GLM-5.3 expressa adaptive thinking + effort conforme o padrão, sem enviar budget. GLM-5-Turbo mantém temporariamente o comportamento de compatibilidade existente de 1024 fixed-budget. O dialeto de reasoning e o replay de inferência sob OpenAI Chat são escritos em `apiAdapter` por regras de `apiMatch` precisas; Anthropic Messages e OpenAI Responses priorizam seus respectivos protocolos oficiais.

## 10. Personal Config mantém o caminho original e é publicado pela primeira vez com Schema Version 1

> Status da decisão: confirmada; substitui o caminho de arquivo separado e a cadeia de migração de versões da fase de desenvolvimento

### Contexto

Na fase de desenvolvimento de M2, a nova Personal Provider Config era gravada em um `provider-config.json` separado, e usava sucessivamente v1, v2, v3 e v4 conforme o Schema interno mudava, com v5 preparado para a próxima rodada de estrutura. Isso permite validar migrações entre versões adjacentes durante o desenvolvimento, mas esses formatos nunca foram oficialmente lançados e não precisam se tornar versões de histórico mantidas pelo produto a longo prazo.

Ao mesmo tempo, a configuração de Provider de modelos dos usuários oficiais do Desktop já está em:

```text
~/.zcode/v2/config.json
```

Criar um `provider-config.json` mudaria o caminho físico ao qual os usuários estão habituados e criaria um problema de troca de autoridade entre o arquivo novo e o antigo. A arquitetura final não precisa expressar limites de domínio trocando o nome do arquivo.

### Decisão

A Personal Provider/Model Config continua usando o nome de arquivo e o caminho `config.json` originais, sem introduzir um `provider-config.json` formal:

```text
旧格式 ~/.zcode/v2/config.json
        |
        | 迁移前先完整备份
        v
同路径 ~/.zcode/v2/config.json
└─ 新 ProviderConfigDocument
```

Antes de iniciar a migração, a configuração original do usuário precisa ser copiada por inteiro como um backup no mesmo diretório. O sucesso do backup é pré-requisito para modificar o arquivo original; se o backup falhar, a migração é interrompida e a configuração original não é sobrescrita. O arquivo de backup não pode sobrescrever silenciosamente um backup já existente; o sufixo específico e a resolução de conflitos de nome podem ser determinados pelo Repository durante a implementação.

Ao concluir M2 e preparar o primeiro lançamento, o novo documento de Provider Config usa:

```json
{
  "schemaVersion": 1
}
```

As versões v1–v5 surgidas no desenvolvimento são formatos intermediários não publicados. No fechamento de M2, removem-se os ramos de compatibilidade de longo prazo reservados a essas versões internas e a narrativa de versões públicas, adotando o Schema completo final como o v1 oficial. Mudanças de formato após um lançamento real passam a migrar de v1 para v2.

Esta decisão não exige desenhar compatibilidade sem perdas para o formato histórico do Standalone CLI que nunca foi oficialmente aberto. Usuários internos de avaliação podem ajustar a configuração; e se o Entry executar migração sobre arquivos existentes, ele também precisa obedecer à ordem segura de dados "backup primeiro, substituição atômica depois".

## 11. Retirada da camada de configuração Model API Adapter; Reasoning Mapping pertence diretamente ao ModelConfig

> Status da decisão: parcialmente complementada pelos itens 12 e 13; a conclusão de retirar `ModelConfig.apiAdapter` continua válida, as condições de obrigatoriedade e a semântica de `reasoningMapping` seguem o item 12, e os patamares concretos do GLM-5-Turbo seguem o item 13

### Contexto

A decisão do item 9 havia adicionado `apiAdapter` ao `ModelConfig` e planejava usá-lo para carregar `reasoningMapping`, `preserveThinking` e `reasoningContentField`. Auditorias posteriores confirmaram que os três realmente pertencem a questões diferentes:

- `reasoningMapping` descreve como o patamar de Reasoning escolhido pelo usuário forma os parâmetros de requisição exigidos por um Provider/modelo/API específico;
- o salvamento e o replay dos Thinking Blocks, Signatures do Anthropic e Reasoning Items do OpenAI Responses são comportamentos inerentes aos respectivos protocolos;
- o `clear_thinking` do GLM OpenAI Chat é um parâmetro de requisição concreto, que pode virar diretamente a saída do `reasoningMapping`.

A AI SDK já consegue converter `reasoning_content` entre mensagens OpenAI Compatible e Reasoning Parts padrão, e o Adapter do Anthropic também cuida do replay de protocolo dos Thinking Blocks e Signatures. Portanto, a camada de configuração não precisa declarar nomes de campos de resposta nem repetir a estratégia de replay de mensagens.

A verificação das interfaces Anthropic oficiais dos vários fornecedores mostrou ao mesmo tempo que a estrutura básica de Messages já é relativamente unificada, mas o controle de Reasoning não é: DeepSeek, Kimi, MiniMax, Qwen e MiMo adotam, respectivamente, semânticas distintas de interruptor, patamar ou budget. `reasoningMapping` portanto ainda tem valor, mas é um mapeamento de parâmetros de protocolo selecionado por Model Config Rule, e não um objeto de configuração independente de Model API Adapter.

### Decisão

São retirados o `ModelConfig.apiAdapter` e o `ModelApiAdapterConfig`, ainda não publicados. O `ModelConfig` permanece achatado, com o `reasoningMapping` opcional diretamente dentro dele:

```ts
class ModelConfig extends ConfigOverlay {
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
  reasoningMapping?: ReasoningMappingConfig | null;
}
```

`ModelConfigRule.apiMatch` é mantido. Junto de `providerMatch` e `modelMatch`, ele determina a qual Provider, modelo e API pública um determinado `reasoningMapping` se aplica:

```text
providerMatch + modelMatch + apiMatch
                    |
                    v
            ModelConfig Overlay
                    |
                    v
             reasoningMapping
```

O Provider Adapter em tempo de execução continua existindo. O que foi retirado é a camada de wrapper `apiAdapter` do Schema de configuração; isso não muda os limites de execução dos Adapters de Anthropic, OpenAI Responses e OpenAI Compatible.

O item 12 confirma ainda mais: o mapeamento dos parâmetros de Reasoning para OpenAI Responses padrão, Anthropic Messages e OpenAI Compatible também deve ser fornecido explicitamente pela Official Config. O Adapter em tempo de execução continua responsável pela execução do protocolo e pelo replay de mensagens, e não esconde mais uma estratégia padrão que gera parâmetros de requisição a partir de `reasoningLevel`.

`preserveThinking` e `reasoningContentField` saem da Config alvo:

- o `clear_thinking` de que o GLM OpenAI Chat precisa é escrito diretamente no `reasoningMapping` do patamar correspondente;
- a interpretação e o replay do conteúdo de Reasoning são feitos pelo modelo de mensagem e pelo Adapter, e não por um nome de campo especificado na Config;
- os patches históricos de compatibilidade de `reasoning_content` vazio do DeepSeek/MiMo continuam sendo auditados separadamente, e não são expressos pelos campos acima.

A API Anthropic de GLM-5.2 e GLM-5.3 usa o `adaptive thinking + effort` moderno. O GLM-5-Turbo também usa adaptive thinking, mas não promete externamente patamares de effort; a base e o mapeamento concretos estão no item 13. Nenhum dos três envia fixed budget. O GLM-5-Turbo já foi validado pela interface real do BigModel Coding Plan, cobrindo requisição de turno único, o parsing atual da AI SDK, Tool Call, Thinking Block, Signature e o segundo round de replay após um Tool Result. Por isso a conclusão temporária do item 9 de manter `1024 fixed budget` para o GLM-5-Turbo fica retirada.

## 12. Reasoning Mapping é um mapeamento obrigatório de AI SDK Provider Options

> Status da decisão: confirmada; quando o modelo declara `reasoningLevel`, ele deve fornecer um `reasoningMapping` completo

O ZCode usa a AI SDK internamente para chamar os modelos. OpenAI Responses, Anthropic Messages e OpenAI Compatible são executados pelos AI SDK Providers correspondentes. O usuário escolhe um `reasoningLevel` unificado, e `reasoningMapping` converte esse patamar nas Options que o AI SDK Provider atual recebe:

```text
reasoningLevel
        |
        | reasoningMapping
        v
AI SDK Provider Options
        |
        v
AI SDK Provider
        |
        v
模型 API
```

Quando `ModelConfig.optionSpecs.reasoningLevel` declara patamares opcionais, o `ModelConfig` final em vigor precisa fornecer simultaneamente um `reasoningMapping` que cubra todos os patamares opcionais. O mapeamento padrão das APIs padrão também é escrito na Official Config, e não escondido no código do Adapter.

Por exemplo:

```jsonc
// OpenAI Responses
"reasoningMapping": {
  "high": {
    "reasoningEffort": "high"
  }
}
```

```jsonc
// Anthropic Messages
"reasoningMapping": {
  "high": {
    "thinking": {
      "type": "adaptive"
    },
    "effort": "high"
  }
}
```

```jsonc
// GLM OpenAI Compatible
"reasoningMapping": {
  "high": {
    "reasoningEffort": "high",
    "clear_thinking": false
  }
}
```

`reasoningMapping[level]` é o objeto interno de AI SDK Provider Options, relacionado a Reasoning, entregue ao Provider Adapter em tempo de execução atual. Ele não contém namespaces de AI SDK como `openai` e `anthropic`, e também não é o HTTP Request Body final. O Adapter em tempo de execução o coloca no namespace de Provider Options correto conforme o tipo de API atual, e o AI SDK Provider o codifica nos campos reais do protocolo.

`reasoningMapping` pertence diretamente ao `ModelConfig`:

```ts
class ModelConfig extends ConfigOverlay {
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
  reasoningMapping?: ReasoningMappingConfig | null;
}
```

Esse mapeamento carrega apenas Provider Options relacionados a Reasoning, como `reasoningEffort`, `effort`, `thinking`, `enable_thinking` e `clear_thinking`. API Key, Header, Base URL e outros parâmetros de requisição do modelo não pertencem a esse mapeamento.

## 13. GLM-5-Turbo oferece apenas o interruptor de Thinking

> Status da decisão: confirmada; substitui a parte do item 11 que dizia que o GLM-5-Turbo usaria effort

A documentação oficial da Zhipu declara explicitamente que o GLM-5-Turbo suporta `thinking.type = enabled | disabled`, com o padrão ligado; quando ligado, o próprio modelo decide dinamicamente se precisa pensar. O escopo formal de suporte a `reasoning_effort` começa no GLM-5.2 e não inclui o GLM-5-Turbo. A interface real conseguir aceitar um parâmetro não equivale a esse parâmetro já ter se tornado um contrato público do modelo.

Portanto, o `reasoningLevel` do GLM-5-Turbo contém apenas:

```text
enabled
disabled
```

O mapeamento da API OpenAI Compatible usa `thinking.type`. Como o ZCode é um Coding Agent de cadeia longa, ao ativar o pensamento ele também usa `clear_thinking: false` e faz o modelo de mensagem e o Adapter reproduzirem de forma completa, fiel e em ordem todo o `reasoning_content` histórico. Esse comportamento é uma configuração de protocolo fixa e não é exposto como Option ao usuário.

O mapeamento para a API Anthropic Messages é `adaptive` e `disabled`. Quando ligado, `effort` não é enviado e o servidor adota a estratégia de inferência padrão; ao mesmo tempo, nenhum fixed budget é enviado. O `budgetTokens: 1024` que antes existia para compatibilidade com a antiga AI SDK não entra na nova Official Config.

GLM-5.2 e GLM-5.3 continuam oferecendo patamares de effort conforme seu próprio escopo oficial de suporte e não são afetados por esta decisão.

## 14. Tarefas ociosas usam Builtin Provider e materiais de autenticação passados por Turn

> Status da decisão: confirmada; a autenticação de Account comum e a de tarefas ociosas adoptam limites de origem diferentes

### Contexto

Hoje o Host monta um `turnRuntimeModel` antes de cada dispatch de tarefa ociosa. Ele contém ao mesmo tempo a Config estática do Provider e do modelo, e a API Key, o Ticket e os Headers usados nesta execução. O Core Worker adiciona isso temporariamente ao Registry Overlay, cria o Model de execução para o Turn atual e, no fim do Turn, restaura o Runtime Model anterior e limpa o Overlay.

Essa cadeia já tem a semântica de execução de "um snapshot de autenticação fixo por Turn", mas ela monta e transmite juntos os fatos estáticos do Provider e os materiais de autenticação dinâmicos, e depende de lógica temporária de `setModel`/restauração.

### Decisão

A autenticação de um Account Provider comum tem como fonte de fato o próprio Account Request Auth Service do processo Core Worker / CLI. O Host ou outro Entry apenas envia `ModelSelection`; ele não passa nem sobrescreve, junto do Submission, a API Key, os Headers, a Provider Config ou a Model Config de um Account Provider comum. O CLI cria o Model a partir do próprio Registry e, quando a requisição real ocorre, o seu próprio serviço de autenticação obtém as credenciais dinâmicas da conexão atual.

```text
Host / Entry
└─ ModelSelection
        |
        v
CLI Registry
        |
        v
CLI Account Request Auth Service
        |
        v
Model Request
```

Hoje o Desktop Worker obtém materiais de autenticação de Account comuns por um callback de protocolo ao Host, o que é uma cadeia de período de migração que precisa sair; ela não constitui uma segunda fonte de fato na arquitetura alvo.

O Provider das tarefas ociosas passa a ser um Builtin Provider gerenciado pela Official Config. Sua identidade de Provider, tipo de API, Base URL, lista de modelos, Model Properties e Option Specs entram no Registry oficial. Esse Provider é usado para a execução de tarefas ociosas e não aparece na seleção de modelos nem nas interações de configuração comuns.

A cada dispatch de um Turn ocioso, o Host passa adicionalmente apenas os materiais de autenticação dinâmicos necessários a esta execução:

```text
Builtin Provider（Official Config / Worker Registry）
├─ Provider 与 Model 静态配置
└─ 不包含本次执行的 Secret

Host 派发 Turn
├─ ModelSelection
├─ API Key
└─ Headers
   ├─ Coding Plan API Key
   ├─ Off-Peak Ticket ID
   └─ 本次执行需要的其他 Header
```

O Core Worker usa o Builtin Provider do Registry, o `ModelSelection` desta vez e os materiais de autenticação passados para criar um `Model` comum. Esse Model é entregue explicitamente ao Agent Loop atual, e dentro do Loop os Model Steps e o Compact automático continuam usando o mesmo Model e os mesmos materiais de autenticação.

```text
Worker Registry 中的 Builtin Provider
        +
ModelSelection
        +
本 Turn 的 API Key / Headers
        |
        v
      Model
        |
        v
   Agent Loop
```

Os materiais de autenticação não são escritos na Official Config, na Personal Config, na Registry View nem no estado persistente da Session. Eles só valem para este Turn e não podem continuar em uso por execuções posteriores depois que o Turn termina. O Model ocioso também não altera o Session Model Selection do usuário nem o App Recent.

### Expiração do Ticket e retomada

A semântica atual de expiração do Ticket `3102` é mantida:

```text
当前 Turn 收到 3102
        |
        v
当前 Turn 结束
        |
        v
同一 Off-Peak Task 回到 queued
        |
        v
Host 重新取得 Ticket
        |
        v
在同一 Session 提交 Resume Turn
        |
        v
新 Turn 使用新传入的 API Key / Headers 创建新 Model
```

Esse é um novo Turn / Agent Loop dentro da mesma tarefa ociosa e na mesma Session, e não a substituição do Ticket dentro de um Model que já está em execução. Uma falha de autenticação comum por JWT ou API Key não equivale automaticamente a `3102`; se ela precisa de retomada automática não está no escopo desta decisão.

### Banner de troca de modelo do modelo em execução

O banner de troca de modelo é determinado pelo Model realmente usado por segmentos de execução adjacentes. Cada Agent Loop mantém seu próprio Execution Model; quando o Guide troca o Model dentro do Loop, forma-se um novo segmento de execução. No início de um novo segmento, o sistema compara o `providerId/modelId` dele com o do segmento anterior: identidades diferentes exibem o banner de troca de modelo; identidades iguais não exibem. Uma mudança de patamar de reasoning não é vista sozinha como mudança de identidade de modelo.

```text
上一执行段的 Execution Model
              |
              | 比较 providerId / modelId
              v
当前执行段的 Execution Model
              |
              +-- 相同：不显示横幅
              `-- 不同：显示模型切换横幅
```

O Model ocioso entra na sequência de modelos em execução pela mesma regra, e não precisa de um estado de banner exclusivo para tarefas ociosas:

```text
普通 Turn A
    |
    v
闲时 Turn Idle       -> A 与 Idle 不同，显示 A -> Idle
    |
    v
下一普通 Turn B      -> Idle 与 B 不同，显示 Idle -> B
```

Se, após o fim de uma tarefa ociosa, nenhum novo segmento de execução começou, o sistema não exibe antecipadamente o "restaurado para A". Nesse momento não há Model em execução; só depois que A ou B for realmente criado na próxima rodada o banner é gerado a partir do Execution Model real. Assim, quando o usuário muda o Session Selection de A para B durante uma tarefa ociosa, a linha do tempo mostra naturalmente `Idle -> B`, sem passar por um A que nunca chegou a executar.

O Session Model Selection serve apenas para criar Models para execuções futuras e não é a fonte de fato do banner. Cada Turn precisa persistir a identidade do Execution Model real; tanto a projeção em tempo real quanto a recuperação fria reduzem o banner a partir da mesma sequência de execução. `lastExecutionModel` representa somente o último Execution Model realmente executado e não carrega o estado persistente do Session Selection.

O banner usa uma entrada pública explícita:

```ts
recordExecutionModelChangeMarker({
  modelRef: activeModel.modelRef,
  traceContext,
});
```

Essa entrada compara apenas o Execution Model atual desta Session com o `lastExecutionModel` e persiste um Marker `model_change` quando o `providerId/modelId` muda. Ela é chamada no início do Agent Loop principal comum, no início do Agent Loop principal ocioso e quando o novo Model do Guide passa a valer de fato a partir do próximo Model Step. Um Subagent que reutiliza essa entrada escreve apenas na própria Child Session. Tarefas de modelo independentes como Title, Memory, Wiki e Verifier não a chamam.

Essa entrada não cria nem troca Model, e não modifica Session Selection, Provider Config nem Registry.

O Execution Model passa a valer quando o Model é criado com sucesso e entra formalmente no Agent Loop principal, ou quando, após o Guide, ele entra formalmente em um novo Model Step. Nesse momento se chama `recordExecutionModelChangeMarker()`. Se a criação do Model falhar, ou se o Submission for bloqueado antes de entrar no Agent Loop por Admission, Hook ou outros limites, nenhuma nova linha de base de modelo em execução é estabelecida. Depois de entrar no Loop, mesmo que seja cancelado antes do primeiro Model Request, o Model continua sendo o Execution Model em vigor deste segmento e pode gerar um banner.

A retomada do `3102` é um novo Turn da mesma tarefa ociosa. Se o novo Turn continuar usando o mesmo Idle Model, a identidade do modelo em execução não muda e nenhum banner intermediário é adicionado; o próximo segmento de execução que realmente começar depois da tarefa ociosa é comparado com o Idle.

### Limites de autenticação

As tarefas ociosas não ampliam a responsabilidade do Account Request Auth Service comum. Primeiro elas reutilizam os fatos estáticos do Builtin Provider do CLI Registry; e se, neste momento, for difícil para o CLI obter por conta própria todo o conjunto de materiais dinâmicos exigido pelo serviço ocioso, o Host pode passar um Request Auth em escopo de execução junto deste Turn. Essa entrada expressa apenas os materiais de autenticação e o Ticket desta execução ociosa, sem carregar Config estática de Provider ou de modelo.

Se mais tarde o CLI conseguir obter JWT, Coding Plan Key e materiais desse tipo de forma natural, a entrada do Host pode continuar sendo reduzida; essa otimização não muda os limites já confirmados e não bloqueia a migração atual. O Off-Peak Ticket é obtido pelo serviço de dispatch do Host e continua sendo passado junto deste Turn.

A autenticação em tempo de execução precisa satisfazer:

- um Account Provider comum sempre usa o CLI Account Request Auth Service e não aceita sobrescrita de autenticação externa;
- tarefas ociosas permitem que o Host passe API Key, Headers e Ticket junto deste Turn;
- os materiais de autenticação entre Turns diferentes e execuções concorrentes precisam estar isolados;
- um Model usa materiais de autenticação fixos dentro de um Agent Loop;
- depois que o Turn termina, falha ou é cancelado, os materiais de autenticação desta execução precisam ficar indisponíveis;
- Provider e Model continuam sendo executados pela cadeia unificada de ModelFactory e Adapter, sem criar um protocolo de requisição de modelo exclusivo para tarefas ociosas.

## 15. Com o Registry de processo ativado, o Workspace Catalog antigo sai da autoridade de Provider

> Status da decisão: confirmada e concluída

O Registry de processo já constrói Providers e Models a partir das Config oficial, Personal e de conta. Nesse momento, o Workspace Catalog antigo continuar participando da decisão de composição, da sincronização de propriedades ou da merge de projeções faria com que o Host Snapshot voltasse a ser uma segunda fonte de fato. Esse problema não pode ser adiado por completo só porque o código está na camada de compatibilidade do protocolo antigo; tudo que afetaria um Provider comum de longo prazo faz parte do fechamento de alta prioridade atual de M2.

Os limites confirmados são:

```text
进程 Registry 已启用
├─ Provider / Model 成员       -> Registry View
├─ Model Properties / Options -> Registry Model
├─ 模型切换可用性             -> App Registry View
├─ 当前执行的 context window  -> 当前 App Runtime / Model
└─ Provider revision          -> 不再使用旧 Workspace Catalog revision

Workspace Settings
└─ Workspace default / last-used / mode 等交互状态
```

O `runtimeModel` que o Host carrega junto do protocolo antigo deixa de ser gravado no Workspace Catalog dentro do processo de Registry, e deixa de ser usado para complementar Providers comuns de longo prazo. O `runtimeModel` ocioso do período de migração é estreitado pela fatia seguinte para ModelSelection, Request Auth e Ticket; ele não se torna um motivo para manter um Snapshot de Workspace Provider comum.

Este item também confirma os seguintes princípios de implementação:

- `syncAppWorkspaceModelCatalog()` deixa de instalar o Overlay antigo ou de sobrescrever o Runtime no modo de Registry de processo;
- a inicialização do App deixa de gerar `bootstrapModelConfig` a partir do Workspace Catalog antigo;
- o preflight de Session e a troca entre Providers julgam a composição atual a partir do `app.listModels()` apoiado no Registry;
- `workspace/readState` retorna apenas `settings.model`; o campo de protocolo antigo `modelCatalog`, as projeções de Provider e a revision já foram removidos;
- o App deixa de expor `setModelCatalogOverlay` e também deixa de guardar Overlays de Provider/Model em nível de Workspace; execuções isoladas como as ociosas ainda entram por um Turn Overlay separado e não restauram um Workspace Catalog de longo prazo;
- `createZCodeApp` precisa injetar o Registry de processo; testes e ferramentas internas usam um Registry de teste explícito e não entram mais na montagem do Runtime Model Config antigo pela ausência de um parâmetro opcional;
- o context window usado na recuperação fria de usage usa os atributos de modelo já fixados pelo App Runtime atual;
- `workspace/readState` é uma interface de projeção pura: não recebe `runtimeModel` nem modifica a Active Session;
- `workspace/setDefaultModel` grava apenas o ModelSelection e não recebe snapshot de execução do Provider;
- o `createSession` e o `switchModelConfig` do V4 enviam apenas ModelSelection; o Provider alvo é validado pelo Worker Registry e não aceita mais o fallback do `runtimeModel` do Host;
- o bypass de Repo Snapshot usa somente a Selection ou o Model em escopo de execução trazidos explicitamente por este comando; na ausência deles, é permitido que os metadados do modelo fiquem vazios, e não se lê mais `workspace/readState` para adivinhar o Provider;
- estados de seleção/interação como default, last-used e mode ainda podem ficar nas Workspace Settings e são convergidos adiante pelo design de Interaction, sem se confundirem com fatos estáticos de Provider.

Limpezas que não afetam diretamente a autoridade atual do Registry podem ficar para depois, como remover funções auxiliares antigas de hot update que já não têm chamadores, refatorar a autenticação ociosa e a Submission atômica e a semântica de troca dentro de Guide/Loop. O critério é se isso reduz o atualTracks duplo, e não em qual fase estava marcado antes.

## 16. Ratificação das decisões autônomas de M1/M2 em termos de semântica de produto

> Status da decisão: confirmada

As cinco decisões autônomas surgidas durante a implementação e a revisão são agora ratificadas formalmente em termos de semântica de produto.

### Model Property é a verificação unificada antes do envio da requisição

O chamador pode ler uma Property antecipadamente para escolher a estratégia de execução; o Model verifica novamente a Request real antes de enviá-la. Quando a requisição usa imagens, PDF, vídeo, Tool Call ou Structured Output que o modelo declara explicitamente não suportar, o Model retorna um erro claro.

A ModelConfig do Registry alvo precisa ser completa e não mantém `unknown` no final. Os campos atuais de imagem, PDF e vídeo permitem `undefined` apenas porque a capacidade de configuração padrão e a capacidade de configuração ativa do usuário ainda não estão prontas: no período de transição, apenas um `false` explícito bloqueia a requisição, enquanto o valor ausente é temporariamente liberado. Depois que a migração de configuração correspondente for concluída, os campos passam a ser obrigatórios e essa semântica de compatibilidade é removida.

### Tarefas de modelo independentes mantêm o comportamento de reasoning já existente

Title, Git Commit Message e Memory Selector já desligavam o reasoning antes do refactor, e portanto continuam usando o Model derivado com reasoning desligado. Este refactor não muda a estratégia de produto dessas tarefas e também não permite que elas contornem o Model para modificar diretamente parâmetros de Provider.

### Consultas de Account mantêm last-known-good por Provider

As consultas remotas de Start Plan, Personal Coding Plan e Team Plan produzem, respectivamente, `available`, `unavailable` ou `unknown`. Quando uma rota é `unknown`, apenas o último resultado bem-sucedido daquele Provider é mantido; os resultados determinados já obtidos para outros Providers continuam sendo publicados. Um `unavailable` explícito remove o Provider correspondente.

### O design alvo não mantém Providers temporários

As tarefas ociosas selecionam o Official Builtin Provider do CLI Registry e recebem junto do Turn o Request Auth necessário e o Off-Peak Ticket. O Submission não carrega ProviderConfig nem ModelConfig completos. O `runtimeModel` ocioso que ainda existe em M2 é uma entrada de compatibilidade a ser estreitada e não constitui uma nova fonte de fato.

### O comportamento visível ao usuário do Account Provider permanece como está

Este refactor mantém a quantidade atual de Providers, a troca entre conexões Personal/Team e a visibilidade de modelos, e não introduz novas formas de produto como vários Teams e Personal aparecendo simultaneamente no seletor de modelos. A convergência interna de Config, Registry e Request Auth não pode mudar esse comportamento.