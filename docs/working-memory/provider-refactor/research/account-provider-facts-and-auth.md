# Configuração, escopo de acesso e autenticação de requisição do Account Provider

> Data da investigação: 2026-08-17
>
> Escopo de aplicação: desenho de limites entre a M2 Account Access Source e o ModelFactory subsequente
>
> Identidade do documento: pesquisa do estado histórico. A configuração de Account Config, a autenticação em tempo de requisição e o limite de autoridade do Remote Environment já foram decididos por
> [`../steps/02-provider-config-and-registry-human-in-the-loop.md`](../steps/02-provider-config-and-registry-human-in-the-loop.md)
> e entraram no Design e na implementação M2 atuais; o texto mantém o contexto da época da investigação.

Este artigo organiza a atribuição de fatos nas cadeias existentes de Start Plan, Personal Coding Plan e Team Plan. Ele registra o estado atual e os limites de migração, sem alterar o comportamento atual de seleção de Provider Family.

## Conclusão

A implementação existente coloca três tipos de dados com ciclos de vida diferentes no mesmo snapshot do Provider Registry:

```text
definição estática de Provider / Model
        +
escopo permitido pela conta e pelo plano
        +
JWT / Runtime API Key / Header de verificação de segurança de uso único
        |
        v
antigo ZCodeProviderRegistrySnapshot
```

A nova cadeia precisa separar por ciclo de vida dos fatos:

```text
Official Config
├─ providerId, label, apiFormat, baseURL do Account Provider
├─ o conjunto completo de modelos declarados pelo Provider e sua ordem
└─ Model Properties, Option Specs e reasoning mapping

Account Access
├─ os Account Providers que a conta atual realmente permite publicar
├─ os modelId que cada Provider permite publicar atualmente
└─ a identidade de acesso de conta não sensível que precisa ser fixada ao criar o Model

Request Auth
├─ Token de login / JWT
├─ Personal Coding Plan API Key
├─ Team Project Runtime API Key
├─ Header de verificação de segurança de uso único
└─ estratégia de refresh e retry após falha
```

O Registry combina apenas as duas primeiras categorias de fatos. A autenticação em tempo de requisição não entra no Registry e não é serializada para o Renderer.

## Por que o Account Access ainda precisa de uma identidade de acesso

Hoje o Personal Coding Plan e o Team Plan podem compartilhar o mesmo `providerId`. Se o Model salva apenas `providerId + modelId` e cada requisição volta a ler a "conexão atualmente selecionada", ocorre a seguinte sequência:

```text
Loop A cria o Model
└─ naquele momento estava selecionado o Personal Coding Plan

usuário troca para o Team Plan
└─ a conexão atual do Account Service muda

próxima requisição do Loop A
└─ se as credenciais forem obtidas só por providerId, passa a usar silenciosamente o Team Plan
```

Isso viola o ciclo de vida de Model já estabelecido: a identidade de modelo e a configuração de execução mantidas por um trecho contínuo de execução devem permanecer estáveis. Portanto, as entradas que o Account Access publica no Registry precisam conter uma identidade de acesso fixável. Ela apenas localiza "de qual conexão de conta/plano pedir as credenciais da requisição" e não contém o Secret.

A M2 usa a seguinte semântica:

```ts
interface AccountProviderAccessEntry {
  providerId: ProviderId;
  modelIds: readonly ModelId[];
  accessId: string;
}
```

O ModelFactory copia o `accessId` ao criar o Model. A cada requisição de modelo, o Request Auth Service usa esse ID para obter as credenciais atualmente válidas. Uma renovação de Token pode afetar a próxima requisição, mas não pode trocar uma conexão Personal por uma Team, nem trocar o Provider ou o Model.

## Comportamento atual de Family

`filterResolvedProviderFamiliesForRegistry()` hoje escolhe um Provider efetivo em cada uma das Families Z.ai e BigModel:

```text
modo API Key
└─ API Provider

modo OAuth
├─ Team Plan selecionado -> Coding Plan Provider
├─ Personal Coding Plan disponível -> Coding Plan Provider
└─ caso contrário -> Start Plan Provider
```

Esse comportamento carrega ao mesmo tempo a escolha de produto e a desduplicação do antigo Registry. A M2 não altera esse comportamento. A Account Access Source deve primeiro projetar o mesmo "Provider efetivo atual + escopo de modelos", e só então um design independente posterior decide se a mesma Family pode publicar múltiplas conexões simultaneamente.

## Estado atual dos fatos estáticos de modelo

Os fatos estáticos atuais vêm de vários lugares:

- `/client/configs` fornece Providers remotos, modelos e Schema.
- `presetModelDefaults.ts` fornece o conjunto de modelos fallback do GLM Provider.
- `modelProviderServiceStorage.ts` fornece Provider, Endpoint e modelos fallback.
- `model-provider-types.ts` guarda os casos especiais do Start Plan para modelos gratuitos e reasoning.
- O China LLM Catalog e o código de runtime continuam complementando Properties, Option Specs e Provider Options Patch.

No design alvo essas fontes não podem continuar participando do Registry de forma independente. Os fatos estáveis precisam migrar para o Official Config; os IDs de modelos disponíveis retornados pela interface de conta servem apenas como filtro de escopo do Account Access.

O Start Plan hoje é o exemplo mais claro: `billing/balance` retorna os IDs de modelos permitidos pelo plano, e `client/configs.builtinModels` completa os fatos desses IDs. No novo design, o Official Config deve manter o conjunto completo de fatos de modelo e o Balance deve retornar apenas o subconjunto atualmente disponível. Quando Balance e Official divergirem temporariamente, é preciso adotar explicitamente last-known-good no Account Source ou reportar a inconsistência de configuração, sem criar no Registry um modelo semiconcreto que contenha apenas modelId.

## Endpoint e ambiente de produto

O Endpoint do Account Provider tem hoje ramificações por ambiente, como produção e teste. Por exemplo, o Z.ai Coding Plan usa `resolveZaiBusinessBaseUrl(process.env)`, e o Start Plan usa o gateway zcode-plan derivado do Endpoint atual do ZCode.

Depois que o Official Config se torna a única fonte de verdade, o Registry e o Provider Factory não podem reescrever esses campos com `process.env`. Cada ambiente de produto deve obter uma Official Config já completamente resolvida:

```text
Production Official Config
└─ production endpoints

Test Official Config
└─ test endpoints

Dev / injected Official Config
└─ local or developer endpoints
```

Todas usam o mesmo Schema e podem ser geradas por ambiente pelo serviço de publicação; a Source em runtime continua lendo apenas um documento completo. Assim, a escolha de ambiente pertence à publicação e injeção do Official Config e não se torna uma quarta fonte de verdade do Registry.

## Estado atual da autenticação de requisição

Os três tipos de plano têm credenciais de requisição diferentes:

```text
Start Plan
├─ o zcode JWT gerado pelo login
└─ Header de verificação de segurança de uso único obtido antes do attempt da requisição

Personal Coding Plan
├─ OAuth access token usado para consultar conta e plano
└─ API Key de chamada de modelo criada ou copiada via interface de negócio

Team Plan
├─ organization / project selecionado
└─ Runtime API Key criada ou copiada para esse projeto
```

A implementação antiga às vezes escrevia/projetava a Key copiada ou o JWT como `apiKey` do Provider. A nova Account Access Source não pode manter essa forma. O Request Auth Service precisa obter o material da requisição por identidade de acesso fixa, tratando por conta própria cache, refresh e refresh forçado após falha de autenticação; essas estratégias não alteram a Registry View.

## Ainda precisa de decisão antes da implementação

A implementação da Account Access Source precisa determinar antes uma semântica de produto:

```text
Opção A: cada Provider Family publica apenas a conexão efetiva atual
Opção B: publica múltiplas conexões disponíveis ao mesmo tempo e faz ModelSelection incluir a identidade da conexão
```

A Opção A mantém o comportamento atual e mantém `providerId + modelId + options` suficiente para expressar a Selection. A Opção B amplia o seletor, a persistência de Session, o protocolo de Submission e o limite de identidade do Model. A M2 adota a Opção A; independentemente de qualquer expansão futura, o Model deve fixar o `accessId` da criação, para evitar deriva durante a execução conforme a seleção global.