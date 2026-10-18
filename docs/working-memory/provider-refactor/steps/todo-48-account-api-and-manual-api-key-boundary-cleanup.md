# Todo 48：Limpeza da fronteira entre Account API e API Key digitada manualmente

> Status: pesquisa concluída / registro de decisão; não funciona como Todo de implementação independente
>
> Data: 2026-08-31
>
> Origem: revisão da página de configurações do Account Provider e do fluxo de Welcome API Key após a consolidação do Todo 26

## 1. Problema

O refactor de Provider chegou a definir `account:zai-api-key` e `account:bigmodel-api-key` como
`zhipu-account / mode=api-key`, supondo que a conta conectada no momento forneceria automaticamente uma API Key de
pagamento por uso durante as requisições.

O rastreamento vertical do `origin/staging` mais recente prova que esse não era o comportamento original do produto. O modo
de conexão `API Key` do staging é o usuário digitando a Key; o código de criação/cópia de Key de projeto a partir do estado
logado atende apenas à renovação de credenciais do Coding Plan e não constitui um "Account API Provider de pagamento por
uso" independente. O branch atual também possui simultaneamente os Providers de Key comum `zai-api` / `bigmodel-api`, de modo
que o mesmo Endpoint, os mesmos membros de modelo e o mesmo API Schema acabaram modelados duas vezes.

```text
用户手填 API Key
   |
   v
Built-in API Provider + Personal Key
   |
   v
正式 Model                                  staging 的 API Key 链

当前登录账号
   |
   +--> Start / Individual / Team / Off-Peak
   |
   `--> Coding Plan 所需项目 Key 的创建/复制   staging 的账号链
```

O erro não é "a página de Account API esqueceu de esconder o campo de entrada", e sim o próprio Account API Provider — sem
fundamentação no produto — entrando na Config oficial, no Resolver, no Runtime e na UI.

## 2. Fronteiras confirmadas

### 2.1 A Key digitada manualmente do staging é um preset de Built-in Provider

O fluxo real do `origin/staging@5ebc182b61` mais recente:

```text
Welcome 选择 Z.ai / BigModel 并输入 Key
        |
        v
builtin:zai / builtin:bigmodel（启动前已存在）
        |
        +--> 只更新 apiKey、enabled、updatedAt
        +--> Endpoint / API Schema / models 保持 Built-in 预设
        +--> Family mode 写为 apiKey
        `--> 默认模型选择为该 Provider 的首个模型
        |
        v
Registry 在 apiKey mode 精确选择该 Built-in Provider
        |
        v
Runtime 直接使用 Provider 中保存的 apiKey
```

Ele não cria dinamicamente um Provider customizado nem copia Endpoint, Schema e a lista de modelos no momento do envio. A
semântica de execução se aproxima de "criar um Provider customizado com Endpoint/Schema/models já preenchidos e deixar o
usuário preencher apenas a Key", mas a identidade de produto continua sendo um Built-in Provider fixo, que participa da
seleção de conexão da Family.

### 2.2 A verdadeira finalidade da criação/cópia automática de API Key

O `OAuthPresetProviderRepoProviderResolvers.resolveProviderApiKey()` do staging realmente obtém a Key verdadeira pela
cadeia da conta pessoal:

```text
OAuth / 业务 access token
        |
        v
getCustomerInfo
        |
        v
个人 organization / project
        |
        v
查找或创建 zcode-api-key
        |
        v
copy secret
```

Ele obtém a Key real. Porém o chamador `loadSinglePresetProvider(..., shouldResolveApiKey)` cria
`builtin:zai-coding-plan` / `builtin:bigmodel-coding-plan`, e somente a chamada explícita
`refreshCodingPlanApiKey()` abre esse ramo. A sincronização Built-in do `builtin:zai` / `builtin:bigmodel` comum grava
explicitamente uma Key vazia, aguardando o usuário digitá-la.

O Team Coding Plan não reutiliza a cadeia de identidade de "descoberta automática da organização/projeto pessoal". Ele usa
o `organizationId/projectId` já selecionado e validado pelo usuário para obter a Key do projeto de equipe. Individual e Team
podem compartilhar a API subjacente de Key de projeto, mas a origem da identidade, a chave de cache e o owner das
credenciais devem permanecer separados.

Portanto "existir uma capacidade subjacente de obter a Key automaticamente" e "existir uma entrada de produto de Account API
por uso" são coisas distintas. A primeira existe; a segunda não tem evidência no staging.

### 2.3 Fronteira de acesso-alvo

- `api-key`: Key digitada pelo usuário, salva no Personal Provider Config;
- `zhipu-account`: usado apenas para Start, Individual, Team e Off-Peak, que de fato dependem de conta, plano ou material de
  conta em tempo de requisição;
- `zhipu-account / mode=api-key` é removido do contrato oficial;
- `account:zai-api-key` / `account:bigmodel-api-key` são removidos, sem duplicar o API Provider comum;
- `zai-api` / `bigmodel-api` passam a ser o único API Provider manual de cada Family; seu Endpoint fixo, API Schema e
  membros de modelo Built-in vêm do Built-in do ZCode, e o Personal guarda apenas a Key e o Overlay permitido;
- `zai-api` / `bigmodel-api` usam respectivamente `zai-family` / `bigmodel-family`, ocupando de forma fixa a vaga de "API por
  uso" da Family e deixam de entrar nos candidatos comuns de "adicionar fornecedor";
- os dois API Providers de pagamento por uso das Families têm `enabled=true` no Built-in, indicando entrada fixa na
  configuração da Family. Quando falta a Key, permanecem visíveis, mas com configuração incompleta e não executável, sem
  simular completude por meio da gravação automática de `enabled=false`;
- o `kind=api-key` da seleção de conexão da Family aponta para o API Provider comum acima e não entra no Account Overlay nem
  no Account Request Auth;
- a capacidade de resolução automática de Key de projeto do Coding Plan permanece na cadeia de credenciais das requisições
  do Coding Plan e não pode servir como prova de um Account API Provider inexistente.
- a elegibilidade de plano do Account Provider é projetada apenas como `access.entitled`, sem reutilizar o `enabled` de nível
  superior do Provider.

### 2.4 A UI decide a exibição diretamente pelo Effective Access

A página de configurações do Provider lê diretamente a união discriminada de `access` do Effective Provider Config, sem
adicionar `hideApiKeySection`, `readOnlyEndpoints` ou booleanos exclusivos da página de Family como um segundo conjunto de
fatos sobre o tipo de acesso:

```text
Effective Provider Config.access
        |
        +-- type = api-key
        |      `--> 展示并保存手动 API Key
        |
        +-- type = zhipu-account
        |      `--> 展示账号连接、套餐、额度和自动凭据状态
        |
        `-- 其他 access type
               `--> 按该 access 的正式契约展示
```

O Provider de conta real não exibe, não lê e não salva API Key digitada manualmente. A seleção de "API por uso" na Family,
embora exibida lado a lado com os planos de conta, obtém naturalmente o formulário de API Key por causa de
`access.type=api-key`, sem se passar por Account Access.

### 2.5 Texto de produto

O `kind: "api-key"` interno da seleção de conexão da Family pode ser mantido, mas a interface exibe uniformemente "API por
uso". Ele indica explicitamente o uso da API padrão de modelos por uso, com a Key digitada pelo usuário ao entrar nos
detalhes.

### 2.6 Fronteira de escrita

O Provider Config Service rejeita mecanicamente o `access` Personal de um Built-in Provider `zhipu-account` fixo antes de
gravar o Personal Overlay. Não é permitido que uma configuração inválida seja gravada em disco para só então ser rejeitada
inteira pelo Personal Source Schema na leitura seguinte.

## 3. Escopo de implementação decidido

O conteúdo a seguir é implementado de forma unificada por
[`todo-49-manual-api-key-and-coding-plan-credential-boundary-cutover.md`](./todo-49-manual-api-key-and-coding-plan-credential-boundary-cutover.md);
este arquivo mantém apenas as evidências de pesquisa e as decisões de produto, evitando que dois Todos se tornem listas de
execução que derivam uma da outra.

1. Remover dos Built-in, das constantes de ID, do Account Resolver, do Request Auth, do Protocolo, da UI e dos testes os
   dois Account API Providers fictícios;
2. Migrar `zai-api` / `bigmodel-api` para o grupo de cada Family correspondente; o item de conexão por API Key da Family
   passa a referenciá-los; os detalhes exibem o formulário manual por causa de `access.type=api-key`, e o "adicionar
   fornecedor" comum deixa de listá-los;
3. A Key digitada no Welcome atualiza o Personal Overlay do Built-in API Provider correspondente, sem escrever Account Access;
4. Remover `restoreFamilyApiKeyProviderForApiKeyMode` e a persistência/helper duplicados de API Key;
5. O Account Resolver deixa de tratar `mode=api-key`; a resolução automática de Key de projeto do Coding Plan é mantida e
   renomeada conforme sua responsabilidade real;
6. O Config Service continua rejeitando o `access` Personal de um Account Provider real;
7. O texto de usuário de API Key da Family passa a ser "API por uso";
8. Atualizar Provider Settings Design, Access Protocol Design, Feature Graph e o Todo 26, revertendo a conclusão incorreta
   sobre Account API.

## 4. Verificação

- A página de "API por uso" da Family exibe e salva a Key manual;
- API Providers Built-in comuns e API Providers customizados continuam usando a cadeia oficial `api-key`;
- Os ramos de UI leem apenas o `access.type` efetivo e não existe parâmetro booleano de página controlando o mesmo fato;
- Gravar `access` Personal em um Account Provider fixo deve falhar;
- A Key digitada no Welcome usa o Built-in API Provider correspondente, não cria Provider customizado e não entra no
  Account Request Auth;
- No Registry não existem, na mesma Family, dois API Providers com Endpoint/models idênticos duplicados apenas por uma
  suposição errada de Access;
- `rg` e `dep:refs` provam zero resíduo dos antigos helpers de restauração de Key de Family e da persistência de Account Key;
- Completar testes unitários de UI, Provider e Services e os E2E relacionados; executar typecheck, lint, verificação de
  formatação e `git diff --check`.

## 5. Critérios de conclusão

- Não existe Account API Provider sem fundamentação de produto no staging;
- A Key digitada manualmente pertence apenas ao Provider `api-key` Built-in/Personal único, preservando a entrada de produto de
  "API por uso" da Family;
- A origem de credenciais, o local de gravação e a forma de UI da Key automática de projeto do Coding Plan e da Key de
  pagamento por uso digitada manualmente estão completamente separados;
- Não foi adicionado booleano de exibição exclusivo de Family nem um segundo conjunto de fatos de discriminação de Access;
- Após a conclusão da implementação, da limpeza, dos testes e da sincronização do Design, é feito um commit Conventional
  Commit.