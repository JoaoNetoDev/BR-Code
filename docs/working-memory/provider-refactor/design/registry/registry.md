# Configuração de Provider e Registry

> Status: design vigente
>
> Atualizado em: 2026-08-26

O Provider Registry responde a duas perguntas: quais Providers/Models completos existem no Environment atual e, dado um ModelSelection, é possível localizar e validar a configuração completa correspondente. A criação de Models é responsabilidade do ModelFactory.

```text
ZCode Built-in Provider Templates + Account Providers
              |
              v
Account Built-in Provider Config + Personal Provider Config
              |
              v
    Effective Provider Config ------------------+
                                                  |
ZCode Built-in Model Config Rules                |
              +                                  |
Personal Model Config Rules                      |
              |                                  |
              v                                  |
Effective Model Config Rules --------------------+
              |
              v
      Provider Registry
      ├─ ordered Provider / Model View
      ├─ lookup by providerId / modelId
      ├─ visible Settings / Selection projection
      └─ validate selection
              |
              v
         ModelFactory
              |
              v
         Active Model
```

O Registry gerencia a visão estática e reconstruível de Providers/Models. Token, Ticket, Header de verificação de segurança pontual, estado de rede, saldo, limitação de taxa e autorização final do servidor são tratados no momento da requisição e não entram no Registry.

## Fontes de entrada

### ZCode Built-in Provider Config

O ZCode fornece junto com o produto as declarações de Provider Template e de Providers de conta. O Domain, o código e a nomenclatura física usam uniformemente `zcodeBuiltin*` / `zcode-builtin`; o arquivo publicado é `config/provider/zcode-builtin.json`. `official` não é um alias desta cadeia de Provider Config e nenhuma entrada de compatibilidade é mantida. A implementação da troca está em
[`../../steps/todo-10-zcode-builtin-provider-config-naming-cutover.md`](../../steps/todo-10-zcode-builtin-provider-config-naming-cutover.md).

### Account Built-in Provider Config

O AccountProviderService lê somente os Providers do ZCode Built-in com `access.type = "zhipu-account"`, projetando o Account Built-in Provider Config conforme a conta, o plano e a conexão de equipe atuais. Ele participa do Overlay depois do ZCode Built-in e antes do Personal:

O Provider Config Snapshot deve carregar separadamente `zcodeBuiltinRevision` e `personalRevision`; o Account Snapshot deve carregar `basedOnZCodeBuiltinRevision`. O Registry só pode resolver e publicar quando ambos forem iguais:

```text
B0 + A0
   |
   | Built-in -> B1
   v
B1 + A0  -- não publica, continua servindo o Registry antigo
   |
   | Account -> A1 basedOn B1
   v
B1 + A1  -- publicação atômica
```

Essa revision apenas comprova a origem derivada do Overlay de Account do cliente; não exige que o servidor de Account e a interface de publicação do Built-in compartilhem versão. Uma atualização apenas Personal não altera `zcodeBuiltinRevision`, portanto continua resolvendo e publicando imediatamente. Na primeira inicialização, antes de o Snapshot oficial de Account chegar, o processo pode gerar um Overlay inicial de mesma revision, com todos os Providers de conta como `access.entitled=false`, baseado no Built-in atual, concluindo o Registry ready de forma fail-closed; é proibido usar wildcard revision.

```text
ZCode Built-in account Provider
        +
current account connection
        +
entitlement result
        |
        v
Account Built-in Provider Config
├─ access.entitled（se a seleção estruturada atual e os direitos da conta permitem o uso）
└─ builtinModelIds（quando a interface realmente os fornece）
```

O Account não lê, restringe nem reescreve Providers exclusivamente Personal, e não fornece propriedades de Model, Reasoning, context ou max output. O Account Built-in Config não armazena Token de conta, Runtime Key ou Header. O Account Connection é a autoridade de origem dos campos de conexão acima; o Account Built-in Provider Config, por sua vez, é o snapshot estruturado do lado de execução do Provider.

### Personal Provider Config

O Personal armazena os Personal Providers criados a partir de Templates ou totalmente customizados, bem como as sobreposições finais permitidas sobre os Account Providers. Um Provider de API comum pode armazenar aqui sua API Key. O Personal compartilha a linguagem de Overlay em nível de campo; a gravação normal nas configurações mantém `modelIds` e não oferece interação para modificar `builtinModelIds`. Isso é uma responsabilidade de manutenção, não um sistema de permissões de campos por Source.

### Model Config Rules

As ZCode Built-in e Personal Model Config Rules são concatenadas na ordem do array, com o Personal depois. As Rules apenas resolvem membros do Inventory efetivo de Provider, com ciência da origem; elas não adicionam nem removem Models de um Provider. Em caso de nomes duplicados entre conjuntos, apenas a identidade Built-in é mantida; uma Rule exclusivamente Personal com o mesmo `providerId/modelId` continua sendo um Overlay normal do usuário sobre aquele Built-in Model.

## Duas rodadas de resolução

### Primeira rodada: Provider

```ts
const effectiveBuiltinProviders = zcodeBuiltinProviders.overlay(accountBuiltinProviders);
const effectiveProviders = resolveProviderTemplates(
  zcodeBuiltinProviderTemplates,
  effectiveBuiltinProviders,
  personalProviders,
);
```

O Overlay preserva a posição das chaves já existentes na camada anterior; chaves com o mesmo nome na camada posterior sobrescrevem campo a campo; chaves novas na camada posterior são adicionadas ao final na sua própria ordem.
Os membros de Model são combinados por propriedade, sem aplicar Overlay a uma lista compartilhada:

```text
ZCode Built-in builtinModelIds
      |
      v  Account Built-in sobrescreve a lista inteira quando fornece
Effective Built-in builtinModelIds
      |
      +------------------+
                         |
Personal modelIds -------+
                         |
                         v
             source-aware Model Inventory
```

O conjunto de Models do Account Built-in é o fato dinâmico sobre quais membros aquele Provider de conta permite usar no momento. O Personal ainda pode declarar seus próprios `modelIds`; o servidor faz a autenticação e autorização finais no momento da requisição real.

Os dois campos de membros permanecem esparsos e em três estados na Config; ao gerar o Inventory, conjuntos finalmente ausentes ou `null` são normalizados para array vazio.
Um conjunto de membros vazio é válido. Duplicatas no mesmo conjunto mantêm a primeira ocorrência; duplicatas entre conjuntos aplicam Built-in-wins e produzem apenas uma identidade Built-in.
As Configurações normais proíbem criar duplicatas, e salvar o Provider relacionado normaliza itens duplicados e obsoletos. Duplicatas não geram um DTO de conflito nem invalidam o Provider inteiro.

### Segunda rodada: Model

```ts
const effectiveModelRules = new ModelConfigRules([
  ...zcodeBuiltinModelRules.rules(),
  ...personalModelRules.rules(),
]);

for (const [providerId, provider] of effectiveProviders) {
  for (const entry of resolveModelInventory(provider)) {
    const modelId = entry.modelId;
    effectiveModelRules.resolve(providerId, modelId, provider.api?.type);
  }
}
```

O `api.type` final participa do casamento de Rules, portanto a sobreposição do Personal sobre a API do Provider altera o Option Map final e os campos do Request Body original. Renderer, fábricas do Shared, protocolo e Adapter não escrevem casos especiais de negócio por modelId; quando for necessário fornecer um padrão por convenção de nome, use-se uma Built-in Rule declarativa.

## Integridade

Antes de publicar um Provider, o Registry valida recursivamente a Effective Provider Config e cada Effective Model Config.

O Resolver chama o único ponto de criação de tipo completo e reutiliza seu resultado unificado para gerar diagnósticos Resolved/Settings ou o valor executável do Registry. Candidatos com falha podem permanecer nas Settings para correção, mas não podem entrar no Registry; após o sucesso, os camadas a jusante não podem mais tratar Properties ou Option Specs como opcionais. O tipo completo é apenas a expressão de tipo do resultado da validação, não uma nova camada de configuração, objeto persistido ou autoridade independente.

Todos os Providers, independentemente da `visibility`, devem ter:

- `access.type`;
- `api.type`;
- `api.baseURL` não vazio;
- um Model Inventory válido e ordenado, já produzido pelo Resolver a partir de `builtinModelIds` e `modelIds`;
- para cada identidade executável, `enabled`, `properties` e `optionSpecs` completos, com os campos exigidos pelo tipo atual.

O tipo publicado pelo Registry é `RegistryProviderConfig` e `RegistryModelConfig`. Eles são a expressão de tipo estática do mesmo objeto de Config efetivo após a validação de integridade e não formam uma nova camada de configuração, objeto persistido ou DTO de Runtime. O tipo de Provider apenas endurece os campos obrigatórios de execução como Access/API/Endpoint; a qualificação de membros já foi projetada em `Provider.models`, e consumidores de execução não relêm o array de membros. A serialização do tipo completo também deve retornar a estrutura estática completa, sem vazar novamente Properties opcionais para Selection ou Protocol por meio de um `toJSON()` de classe base esparsa.

Duplicatas de Model ID entre conjuntos aplicam Built-in-wins e publicam apenas a identidade Built-in; duplicatas no mesmo conjunto mantêm a primeira ocorrência. Itens posteriores são ignorados de forma determinística na leitura, são normalizados quando o Provider relacionado é salvo nas Settings, e não criam objeto de conflito nem uma segunda identidade pausada.

Requisitos específicos por Access:

| Access type     | Requisito de integridade da Config | Requisito no momento da requisição                          |
| --------------- | --------------------------------- | --------------------------------------------------------- |
| `api-key`       | `apiKey` não vazio                 | usa a Key estática da Config                                |
| `zhipu-account` | `family + mode` completos         | o Account Request Auth resolve material dinâmico a partir da conexão compatível atual |

A ausência de material dinâmico de conta não é uma Config incompleta, mas um erro de autenticação no momento da requisição; o Adapter deve falhar antes de enviar a requisição de rede. Rede inacessível, Token expirado, saldo insuficiente, limitação de taxa e erros do provedor de serviço também não fazem parte da filtragem estática do Registry.

## Visibility

O Provider usa um único campo genérico de visibilidade para o usuário:

```ts
type ProviderVisibility = "visible" | "hidden";
```

O padrão é `visible`. A Visibility afeta apenas as Facades voltadas ao usuário:

```text
Provider Registry
├─ visible Provider
└─ hidden Provider
       |
       +--> Settings Facade filters hidden
       +--> Selection Facade filters hidden
       `--> internal lookup keeps hidden
```

Hidden não significa confiável, permissão de sistema, execução temporária ou dispensa de autenticação. Ele não contorna `enabled`, a integridade da Config nem o ModelFactory. Quando uma capacidade interna de produto conhece a Selection exata, ela usa o lookup normal do Registry e cria pelo mesmo ModelFactory; não se adiciona uma interface especial de criação de Model nem um segundo Registry.

O `executionOnly` atualmente não publicado acumula simultaneamente visibilidade e isenção de integridade; M4 o remove diretamente, e ele não entra no histórico de compatibilidade oficial.

## Registry View e índices

A View interna completa do Registry preserva ordem e identidade:

```ts
interface Provider {
  providerId: ProviderId;
  config: RegistryProviderConfig;
  models: readonly {
    modelId: ModelId;
    config: RegistryModelConfig;
  }[];
}
```

O Model Config não possui mais visibilidade. Modelos com `enabled=false` e com configuração incompleta não entram na Registry View; as Settings mantêm esses membros separadamente pelo resultado da resolução de configuração, para edição e reativação.

Os índices internos referenciam apenas esta View:

```text
Provider[]
└─ providerById
   └─ modelById
      └─ lookup / validate
```

Os índices não formam um segundo conjunto de fatos de configuração. Depois que qualquer Config Source é atualizado, o Registry cria uma nova View e novos índices; um Model já criado continua segurando a configuração antiga até o fim do seu ciclo de vida.

## Facades de Settings e Selection

```text
Provider Config Service ─ Personal Config ─┐
                                            ├─ Provider Settings Facade
Provider Registry ─ Effective View ─────────┘

Provider Registry
└─ Model Selection Facade
```

Settings Facade:

- filtra Providers hidden;
- mantém Models desabilitados, para edição e reativação;
- retorna Built-in efetivo, campos explícitos do Personal, Config efetiva, membros de Model explicitamente marcados como `builtin`, problemas de integridade, e enabled/executable/selectable;
- Provider e Model são salvos separadamente: operações de Provider só escrevem na Personal Provider Config, e operações de um único Model só escrevem na Personal Model Config Rule exata; adicionar, excluir, renomear e reordenar Models usam operações atômicas do domínio de membros;
- gravações no mesmo Provider são concluídas na ordem das ações do usuário; Providers diferentes podem ser processados em paralelo;
- após a gravação, aguarda o Registry observar a nova revision.

Selection Facade:

- filtra Providers hidden, bem como Models desabilitados e incompletos;
- não gera candidatos para `enabled=false` e para modelos incompletos; nomes duplicados entre conjuntos continuam usando o candidato Built-in;
- organiza candidatos por Provider;
- valida `providerId`, `modelId` e as Options gerais;
- não gerencia Composer Draft, App Recent, Session Selection ou Active Model.

A Selection Facade apenas projeta candidatos visíveis e eventos de revision/change, e não oferece um `validate()` geral. O Renderer pode usá-la para exibir "indisponível", mas não pode copiar o validador autoritativo de opções. Quando a execução realmente começa, o ModelFactory do Agent atual deve revalidar a Selection com o Registry completo; capacidades internas de produto podem fazer verificações estreitas por ID exato antes de salvar ou despachar. O uso direto do Registry por ID exato dentro do produto é uma diferença de View/contexto de chamada, não uma fronteira de segurança e autorização.

## Conexão dinâmica de Account

O Access `zhipu-account` do Provider Config fixa apenas `family + mode`. A identidade da conta, o produto concreto e o escopo de equipe pertencem ao Account Connection/Subscription Service e não entram no Registry nem no Active Model. Cada tentativa de requisição lê a conexão compatível atual conforme as restrições estáticas; quando não há conexão compatível ou credencial, a falha ocorre antes da rede. O servidor continua sendo a autoridade final de autorização.

## Orthogonalidade entre Access e API

`access.type` descreve como o material de acesso é obtido; `api.type` descreve o protocolo público de requisição. São ortogonais: API Key, conexão de conta e injeção no momento da requisição podem todos acessar Anthropic Messages, OpenAI Responses ou OpenAI Chat Completions.

```text
ProviderConfig
├─ access.type -> credential acquisition
└─ api.type    -> Adapter/request shape
```

Os tipos internos de SDK do Adapter não entram no Provider Config. Headers estáticos pertencem ao Provider Config; headers dinâmicos de conta ou de nível de chamada pertencem ao Request Auth e são combinados no momento da requisição.

## Notificações de mudança e ciclo de vida

O Registry assina simultaneamente as Config Sources e a Account Source:

```text
Built-in / Personal changed ─┐
Account changed ─────────────┼─> invalidate -> rebuild -> new revision
                             └─> notify Facades / Model runtime
```

A primeira leitura é uma barreira de readiness. Quando a atualização falha, cada Source segue sua própria regra de last-known-good; o Registry não recupera um outro conjunto de fatos a partir do Provider Store antigo, do Workspace Catalog ou de um Runtime Snapshot.

Para os Sources, processos e cadeia de refresh específicos, veja [`runtime.md`](./runtime.md); para criação de Model e autenticação dinâmica, [`model-creation.md`](./model-creation.md); para interação de configurações, [`settings.md`](./settings.md).

## Invariantes

- O Overlay de Provider é ZCode Built-in -> Account Built-in -> Personal.
- O Account Built-in lê apenas os account Providers do ZCode Built-in, e não o Personal.
- As Model Rules são Built-in + Personal, e atuam sobre o Provider efetivo.
- Na montagem normal, Built-in/Account Built-in mantêm `builtinModelIds` e o Personal mantém `modelIds`; não se cria um sistema de permissões de campos por Source.
- Dupla origem com o mesmo ID é um conflito explícito; um Model normalmente desabilitado não entra na Selection, mas é sempre visível nas Settings.
- Com o mesmo ID em Built-in/Personal, a identidade Built-in continua sendo executada; a Rule Personal exata conflitante fica pausada.
- A visibilidade de Provider/Model afeta apenas as Facades do usuário; membros enabled completos de Providers hidden continuam no Registry.
- Todos os Providers visible/hidden usam a mesma validação de integridade, o mesmo Registry e o mesmo ModelFactory.
- A forma de obtenção do Access é ortogonal ao protocolo de API.
- O Access de conta estático armazena apenas family e mode; o Team Scope é lido no momento da requisição a partir da Connection atual.
- A decisão da UI sobre abrir edição não altera a capacidade expressiva do Schema; a Configuração manual Personal não aceita validação de qualificação de origem.
- Credenciais dinâmicas não entram no Registry; o servidor faz a autorização final.
- Atualizações de Config não alteram retroativamente Models já criados.