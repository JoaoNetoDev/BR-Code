# Todo 36：Simetria de entitlement da Provider Family e consolidação da semântica de falha

> Status: concluído（o Todo 57 posterior já concluiu a regressão de todo o repositório e a execução real do E2E de Provider no macOS）
>
> Data: 2026-08-28
>
> Origem: revisão de código após a merge do Provider Refactor, e retrospectiva dos problemas reais com Start Plan／Team Plan
>
> Documentos relacionados: [`Z.AI / BigModel Start Plan Provider`](../../../zai-start-plan-provider.md)、
> [`Todo 32`](./todo-32-team-plan-settings-effective-provider-boundary.md)、
> [`Provider Family Merge`](../../../model-provider-family-merge.md)

## 1. Contexto e conclusão

A implementação atual já estabeleceu a semântica de produto correta: Z.AI e BigModel são Provider Families estruturalmente simétricas; cada Family contém Providers de API
Key, Start Plan, Individual Coding Plan e Team Coding Plan. Start Plan é uma conexão independente que pode coexistir com um Coding Plan pago e ser escolhida explicitamente pelo usuário, não um fallback após falha de consulta do Coding Plan.

Mas a implementação ainda carrega a forma de várias rodadas de correções históricas: o mesmo conjunto de Family Provider IDs é mapeado repetidamente via
`family === "zai" ? ... : ...` na UI, na recuperação de OAuth e na consulta de entitlement; as consultas Z.AI/BigModel foram duplicadas em quatro cadeias de Hook; comentários antigos ainda afirmam que o Coding Plan
desabilita o fallback do Start; e algumas páginas até deduzem a Family pelo nome de exibição. A interpretação dos estados de falha também não é consistente entre a página de configurações e a cadeia de recuperação do startup.

Este Todo não altera o design de produto dos planos existente, mas conclui o seguinte:

1. A orquestração de Z.AI e BigModel é inteiramente conduzida por `ModelProviderFamilySpec`;
2. Start, Individual e Team usam o mesmo conjunto de semânticas de estado confirmado／desconhecido／inválido;
3. As diferenças de API reais, material de autenticação e scope de Team continuam na fronteira de Service／Adapter;
4. Somente um resultado autoritativo que prove explicitamente a ausência de entitlement destrói uma escolha existente;
5. A UI não infere mais a Provider Family a partir de nome, texto ou constante BigModel.

## 2. Modelo de domínio já decidido

### 2.1 Family é topologia estática

O `MODEL_PROVIDER_FAMILY_SPECS` em `packages/shared/src/model-provider-family.ts` é o mapeamento único de Family para as identidades de cada Provider:

```text
ModelProviderFamilySpec
├─ id
├─ label
├─ oauthProviderId
├─ apiKeyProviderId
├─ startPlanProviderId
├─ individualCodingPlanProviderId
└─ teamCodingPlanProviderId
```

UI, recuperação de OAuth, navegação de planos, consulta de entitlement e construção de itens de Team não podem criar outra tabela de correspondência de Provider IDs de Z.AI／BigModel nem repetir esse mapeamento com expressões ternárias de dois caminhos.

Endereços de página específicos de cada Family — compra, gestão, registro — também são metadados de exibição／produto da Family. Devem entrar em uma única fonte de metadados de Family e não ficar escondidos no construtor genérico de itens de Team.

### 2.2 Plan é uma conexão independente, não uma cadeia de fallback

```text
一个 Provider Family
├─ Start Plan
├─ Individual Coding Plan
└─ Team Coding Plan
```

- O entitlement de Start é consultado de forma independente quando existe o Account Access correspondente;
- Individual e o Team atualmente selecionado usam seus Provider IDs estáveis próprios;
- A consulta de Team carrega adicionalmente `productId / organizationId / projectId`;
- Coding Plan válido não pode esconder o Start, proibir a consulta do Start nem sobrescrever o Start já escolhido pelo usuário;
- Start válido também não pode sobrescrever a escolha explícita de Individual／Team do usuário;
- A escolha automática só é usada quando não há escolha preservável ou quando a escolha atual já foi explicitamente julgada inválida por um resultado autoritativo.

### 2.3 A semântica de estado deve ser simétrica

Todas as conexões de plano distinguem uniformemente três categorias de fato:

```text
确定可用
└─ 有有效 subscription / quota / remaining 等权威权益事实

确定无权益
└─ 当前协议下服务端明确返回 no_plan

暂时未知
├─ loading
├─ 请求抛错
├─ unavailable
└─ 不完整或无法归类的快照
```

「Temporariamente desconhecido» não pode ser projetado como «não comprado» nem destruir a escolha de conexão já salva. Somente «confirmadamente sem entitlement» pode remover a entrada do Start ou disparar o fallback automático.

`not_authenticated/not_configured` não decide de forma independente a escolha de conexão dentro desta máquina de estados de evidência de plano: quando o Account Source já confirmou que não está conectado, o `accountConnected` externo é projetado diretamente como `disconnected`; o logout explícito é de responsabilidade da cadeia de limpeza de OAuth, Account Source e Provider Family. Entitlement não pode inferir se o usuário já saiu com base nesses dois erros nem reportá-los como «não comprado».

### 2.4 Simetria não significa apagar as diferenças de protocolo

As seguintes diferenças são fatos normais e devem ser preservadas:

- Start Plan usa interface de balance／entitlement e pode retornar membros de modelo exclusivos da conta atual;
- Individual usa o contexto de acesso da conta pessoal;
- Team exige o contexto completo de produto, organização e projeto;
- Z.AI e BigModel podem ter Endpoint, OAuth, página de registro, página de compra e página de gestão diferentes;
- Headers de requisição específicos, obtenção de credenciais e protocolo de erros do servidor ficam a cargo do Service／Adapter.

A fronteira correta é «orquestração e máquina de estados simétricas nos níveis superiores, diferenças entra como entrada via Spec／Access Context, e cada implementação de protocolo cuida da sua parte por baixo», e não fazer a UI julgar Family ou Plan Kind em todo lugar.

## 3. Problemas encontrados

### 3.1 Start temporariamente indisponível é tratado como inválido na cadeia de recuperação

A navegação da página de configurações já preserva corretamente o Start selecionado em `checking/unavailable`, mas
`resolvePreservedStartPlanSelection()` retorna uniformemente «não preservar» para todos os snapshots não nulos e não active. Em caso de falha de rede, o Service devolve:

```ts
{
  unavailableReason: "unavailable",
  subscription: null,
  quota: null,
  remaining: null,
}
```

Esse snapshot não é `null`, então a recuperação de login ou de startup pode reescrever o Start escolhido como Individual／Team. Isso conflita com «somente um `no_plan` explícito permite trocar».

Correção alvo: estabelecer uma função pura mínima que avalia a evidência de entitlement, retornando inactive somente em `no_plan` explícito; active quando já existe um fato de entitlement autoritativo; e unknown para `null`, exceção, `unavailable` e snapshot incompleto, preservando a escolha existente. Essa função não trata logout nem possui o estado de conexão da Account.

### 3.2 O fallback `notPurchased` viola o comentário e o protocolo

O comentário de `resolveCodingPlanEntitlementState()` declara «só se mostra não comprado quando o servidor retorna explicitamente `no_plan`», mas, ao não encontrar nenhum branch conhecido, ainda retorna `notPurchased` incondicionalmente. Isso reporta `not_authenticated` ou estados futuros／incompletos como não comprado.

Correção alvo: fazer uma projeção exaustiva e type-safe de `UsageEntitlementSnapshot.unavailableReason`; o estado desconhecido padrão só pode cair em uma das opções `unavailable/checking/disconnected` que faz sentido no contexto, nunca em `notPurchased`.

Nele, `disconnected` precisa ser determinado por `accountConnected` ou por outro estado autoritativo da Account, e não pela limpeza de conexão baseada apenas no snapshot de entitlement.

### 3.3 O mapeamento de Family Provider IDs está duplicado e hardcoded

Vários módulos repetem hoje o padrão:

```ts
family === "zai"
  ? BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
  : BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan;
```

Confirmado pelo menos em:

- `modelProviderFamilyConnectionSelection.ts`;
- as buscas, construções e julgamento de quota de Individual／Team em `providerFamilyConnectionVisibility.ts`;
- `useEnterpriseCodingPlanProducts.ts`;
- a conversão de array de OAuth para Provider IDs em `oauthProviderFamilySelectionRefresh.ts`.

Correção alvo: usar uniformemente `getModelProviderFamilySpec(family)` ou
`resolveModelProviderFamilySpecByProviderId(providerId)`; remover os mapeamentos duplicados e as leituras `[0]/[1]` baseadas na posição do array.

### 3.4 O Hook de entitlement foi copiado em quatro cadeias

`useCodingPlanEntitlements()` mantém manualmente quatro conjuntos de Access, Fingerprint, Query, Refresh, Result e arrays de dependência: Coding Z.AI, Start Z.AI, Coding BigModel e Start BigModel. Embora o comportamento atual seja basicamente simétrico, qualquer correção posterior tende a tocar apenas um dos lados.

Estrutura alvo:

```text
useProviderFamilyEntitlements(familySpec, selection, settingsView)
├─ resolve Coding target（Individual 或当前 Team）
├─ resolve Start target
├─ 生成各自 Account Access / cache identity
├─ 独立调用 entitlement hook
└─ 返回同构 family result

useCodingPlanEntitlements
├─ 显式调用 Z.AI family hook
├─ 显式调用 BigModel family hook
└─ 合并结果与 refresh
```

A camada externa precisa chamar explicitamente os dois Hooks customizados; não se pode chamar React Hooks dentro de um laço dinâmico. A extração elimina apenas a duplicação de Family e não cria um segundo cache de entitlement, DTO de Provider ou autoridade de estado.

### 3.5 A recuperação de OAuth usa arrays posicionais sem nome e portões redundantes

`resolveCodingPlanProviderIdsFromOAuth()` retorna `[individual, start, team]`, e o chamador lê por índice. Isso torna o terceiro ID de Team fácil de ignorar e também encobre o Family Spec existente.

`ProviderFamilyDomain` já está restrito a `zai | bigmodel`, então escrever novamente
`if (domain === "bigmodel" || domain === "zai")` na recuperação de startup não acrescenta proteção real.

Correção alvo: normalizar primeiro o OAuth Provider em uma Family e só então ler o Family Spec nomeado; remover o array posicional e a lista branca redundante de Families.

### 3.6 O endereço de gestão de Team depende incorretamente de uma constante BigModel

A construção genérica de item de Team escreve hoje `BIGMODEL_CODING_PLAN_TEAM_MANAGE_URL` tanto para Z.AI quanto para BigModel. Isso significa que a ação «管理/升级» do Team de Z.AI também pode abrir a página do BigModel.

Correção alvo:

- o Team de BigModel usa o endereço de gestão de Team do BigModel;
- o Team de Z.AI usa o endereço de gestão correspondente do Z.AI;
- o endereço vem dos metadados de produto da Family;
- se hoje só existe um endereço genérico de gestão de assinatura do Z.AI, configure esse endereço explicitamente e não permita usar a constante BigModel como fallback;
- adicionar testes de alvo de clique para as duas Families.

### 3.7 A UI infere a Family a partir de `providerName`

`StatusCards.tsx` usa atualmente:

```ts
providerName.toLowerCase() === "bigmodel" ? "bigmodel" : "zai"
```

Isso interpreta qualquer nome de exibição que não seja exatamente `BigModel` como Z.AI e faz com que ajustes de localização ou de texto mudem o comportamento do produto. Ícones, dicas de conta e dicas de registro controlados por esse resultado podem ficar errados.

Correção alvo: o card de status recebe um `providerId` ou `family` explícito e resolve a identidade pelo Family Spec; `providerName` serve apenas para exibição e não participa de nenhum julgamento de estado, rota ou interação.

### 3.8 Comentários antigos conflitam com a semântica de fallback já removida

`useCodingPlanEntitlements.ts`, `V4ComposerToolbar.tsx` e testes relacionados ainda contêm comentários de que «a consulta de fallback do Start Plan é desabilitada depois que o Coding Plan é ativado». A implementação já passou a consultar o Start de forma independente, e esses comentários vão induzir mantenedores futuros a reintroduzir uma lógica mutuamente exclusiva.

Correção alvo: remover ou reescrever todos os comentários antigos de fallback, nomes de teste e explicações de variáveis. Se `enabledStartPlanProviderIds` ainda tiver valor real de chamada, ele deve expressar apenas «os Start Providers que atualmente têm identidade para consulta», e não continuar sendo explicado como fallback.

### 3.9 Resolver de seleção sem chamadas em produção

`resolveMissingModelProviderFamilyConnectionSelection()` hoje é referenciado apenas por testes, não tem chamada em produção e tem uma prioridade diferente da `resolveLatestModelProviderFamilyConnectionSelection()` realmente usada. Dois algoritmos semelhantes fazem o design parecer ter duas regras de escolha padrão.

Correção alvo: após confirmar novamente por verificação estática de referências, remover o Resolver sem chamadas e seus testes órfãos; renomear o Resolver mantido conforme seu contexto real de uso, deixando claro que ele serve apenas para «a escolha automática após não ser possível preservar a escolha atual», sem usar o nome ambíguo `Latest/Missing`.

### 3.10 A lista de Team Families e o default legacy estão espalhados pelo fluxo de negócio

`providerFamilyConnectionVisibility.ts` cria à parte `TEAM_PLAN_DOMAINS = ["bigmodel", "zai"]`, e parte dos dados de produto ainda usa `product.family ?? "bigmodel"` em camadas profundas. Esses são potenciais pontos de ruptura de extensão.

Correção alvo:

- a iteração das Team Families vem diretamente de `MODEL_PROVIDER_FAMILY_SPECS`;
- a compatibilidade BigModel para produtos históricos sem `family` só pode existir na fronteira de importer／normalizer;
- antes de entrar na navegação e na construção de estado, o produto já precisa ter uma Family explícita;
- não alterar o resultado de compatibilidade dos dados históricos existentes.

## 4. Estrutura alvo de implementação

```text
MODEL_PROVIDER_FAMILY_SPECS
          |
          +-------------------------------+
          |                               |
          v                               v
Z.AI Family Context               BigModel Family Context
├─ static provider ids            ├─ static provider ids
├─ product/manage URLs            ├─ product/manage URLs
└─ selected connection            └─ selected connection
          |                               |
          +---------------+---------------+
                          |
                          v
              统一 Family Entitlement 编排
              ├─ Coding target
              │  ├─ Individual
              │  `─ Team + product/org/project
              ├─ Start target
              ├─ cache / refresh
              `─ entitlement outcome
                          |
          +---------------+----------------+
          |                                |
          v                                v
连接选择恢复与自动选择                 Settings / Composer 投影
├─ active -> 保留/可选                  ├─ checking
├─ inactive -> 允许回退                 ├─ purchased
`─ unknown -> 保留当前选择              ├─ notPurchased（仅明确无权益）
                                       `─ unavailable/disconnected
```

A conexão da Account e a saída explícita ficam fora do diagrama: o Account Source decide se o Provider está conectado, habilitado e executável; a cadeia de logout cuida da limpeza da conta, das credenciais e da Family atual. O entitlement outcome não participa dessas duas decisões de ownership.

Não se deve adicionar:

- um segundo registro de Provider Families;
- um Account Overlay mantido pelo próprio Renderer;
- DTO de capacidade de plano;
- helpers que deduzem identidade a partir de texto de exibição, URL ou nome de Provider;
- hardcode de negócio em runtime de IDs de modelo ou de Provider específicos.

## 5. Ordem de implementação

### 5.1 Escrever primeiro os testes que falham

1. Quando o Start selecionado recebe um snapshot `unavailable`, tanto a recuperação de login quanto a de startup preservam a seleção e não escrevem em Settings;
2. Quando a consulta do Start selecionado lança erro ou retorna `null`, a seleção continua preservada;
3. Quando o Start selecionado retorna explicitamente `no_plan`, a escolha automática de outra conexão é permitida;
4. `not_authenticated/not_configured/unavailable` não são projetados como `notPurchased`; a semântica de conexão dos dois primeiros é determinada por
   `accountConnected`／Account Source;
5. Z.AI e BigModel compartilham a mesma matriz de estado com testes parametrizados;
6. Start, Individual e Team de Z.AI／BigModel obtêm o Provider ID pelo Family Spec;
7. O botão de gestão do Team de Z.AI abre o endereço do Z.AI, e o do Team do BigModel abre o do BigModel;
8. Alterar o nome de exibição do Provider ou o texto de localização não muda Family, ícone nem interação;
9. A escolha atual do usuário tem prioridade sobre a escolha automática; a escolha automática só ocorre em invalidação explícita;
10. O refresh de entitlement continua usando cache key separada por Provider／scope de Team e mantém a mesclagem de requests em voo.

### 5.2 Corrigir a semântica de falha

- Estabelecer uma função pura mínima que normalize a evidência de plano em `active | inactive | unknown`: apenas `no_plan` explícito é inactive, um fato de entitlement autoritativo existente é active e o resto é unknown;
- o estado da página de configurações e a recuperação de seleção reutilizam em conjunto esse julgamento, sem interpretar cada um por sua conta;
- corrigir a preservação do Start e o fallback `notPurchased`;
- usar checagem exaustiva em uniões de tipo, para que estados novos no futuro apareçam na compilação ou nos testes.
- não incorporar logout, conexão da Account ou limpeza de credenciais a essa função.

### 5.3 Convergir a orquestração de Family

- Usar o `ModelProviderFamilySpec` existente no lugar de todos os mapeamentos ternários duplicados de Provider ID;
- extrair um Hook de entitlement de Family simétrico;
- fazer a recuperação de OAuth／startup ler campos nomeados do Spec;
- unificar a navegação de Team e o julgamento de quota por Spec;
- mover o default de Family legacy para uma única fronteira de normalização.

### 5.4 Corrigir identidade na UI e links de gestão

- Fazer o card de status receber a identidade explícita de Provider／Family;
- remover a inferência de identidade por `providerName`;
- completar os metadados de Family com os respectivos endereços de gestão de Team;
- remover o hardcode da URL BigModel no item de Team genérico;
- manter os nomes de exibição multilíngues apenas com função de texto.

### 5.5 Remover resíduos

- Remover o Resolver sem chamadas em produção;
- remover comentários de fallback distorcidos e descrições de teste;
- remover helpers de mapeamento, listas de constantes e branches substituídos pelo Family Spec;
- usar `rg`, `pnpm dep:refs` e `pnpm knip` para verificar exports órfãos e resíduos da semântica antiga.

## 6. Matriz de verificação

### 6.1 Simetria de Family

A matriz abaixo usa o mesmo conjunto de asserções parametrizadas para Z.AI e BigModel:

| Conexão  | Condição de Access                | Alvo da consulta                  | Contexto adicional |
| -------- | --------------------------------- | --------------------------------- | ----------------- |
| Start    | Existe Start Account Access        | `startPlanProviderId`            | Sem scope de Team |
| Individual | Existe Individual Access        | `individualCodingPlanProviderId` | Personal          |
| Team     | Conexão de Team válida selecionada | `teamCodingPlanProviderId`     | produto/org/projeto |

### 6.2 Estados de falha

| Resultado de Entitlement | Escolha existente | Preserva?    | Estado de UI                    |
| ------------------------ | ----------------- | ------------ | ------------------------------- |
| active                   | Qualquer conexão correspondente | Sim      | purchased                       |
| no_plan                  | Conexão correspondente | Não, fallback automático permitido | notPurchased        |
| unavailable              | Conexão correspondente | Sim      | unavailable                     |
| not_authenticated         | Determinado pelo Account Source | Entitlement não decide sozinho | disconnected/unavailable |
| not_configured            | Determinado pelo Account Source | Entitlement não decide sozinho | disconnected/unavailable |
| Exceção na requisição／null | Conexão correspondente | Sim     | unavailable／checking           |
| Snapshot desconhecido incompleto | Conexão correspondente | Sim   | unavailable                     |

### 6.3 Regressão

- Quando Start e Coding estão válidos ao mesmo tempo, ambos ficam visíveis e a escolha do usuário não é sobrescrita pelo refresh;
- Quando Team e Individual estão válidos ao mesmo tempo, o Team selecionado não é sobrescrito pelo plano pessoal na recuperação de startup;
- Quando o pricing de Team falha temporariamente, o Team selecionado continua preservado;
- As Account Provider Settings continuam lendo o `ProviderSettingsView`, sem reaplicar Overlay;
- A sobreposição de membros de modelo da conta Start, o scope de Team e o comportamento de Request Auth permanecem inalterados;
- Settings, Composer e Sidebar usam a mesma identidade de cache de entitlement;
- O logout explícito continua saindo por completo pela cadeia de limpeza existente de OAuth／Account／Family, e não pelo fallback da máquina de estados de entitlement;
- Desktop, Web e controle remoto do celular não ganham novo owner de estado nem alteram a semântica continuous／replayable.

## 7. Requisitos de automação

Executar e passar:

1. testes unitários direcionados de entitlement de UI, navegação de Provider Family e callback de OAuth／restauração de startup;
2. testes unitários direcionados de usage entitlement do Service e de scope de Team;
3. E2E de interação relacionados às Account Provider Settings;
4. `pnpm typecheck`;
5. `pnpm lint`;
6. `pnpm test:unit`;
7. `pnpm fmt:check` e `git diff --check`.

No baseline de review atual, os quatro arquivos de teste relacionados passam em 49 casos no total, mas falta a prova da preservação da seleção de Start sob um snapshot não nulo `unavailable` e da proibição de projetar `not_authenticated` como `notPurchased`. Este Todo precisa primeiro acrescentar esses dois tipos de teste que falham; o verde existente não pode substituir a verificação de fronteira.

## 8. Critérios de conclusão

- Os Provider IDs de Z.AI／BigModel, o endereço de gestão de Team e a identidade de OAuth vêm de um único Family Spec／metadados;
- O código de negócio da UI não infere mais a Family pelo nome de exibição;
- Não há implementação duplicada de consultas Z.AI／BigModel na orquestração de Family;
- Start／Individual／Team tratam active, inactive e unknown de forma consistente;
- `notPurchased` só é produzido por ausência explícita de entitlement;
- Falhas temporárias de requisição não destroem a conexão salva;
- A limpeza dos comentários antigos de fallback, arrays posicionais, portões redundantes de Family e do Resolver sem chamadas está concluída;
- Os testes unitários relacionados, a validação de interação, o typecheck／lint／unit de todo o repositório passam;
- O commit final segue o Conventional Commit e lista no registro de implementação os branches antigos realmente removidos e as evidências de verificação.

## 9. Registro de implementação（2026-08-28）

- Adicionada a normalização de evidência de plano `active | inactive | unknown`: apenas `no_plan` é inactive; snapshots desconhecidos não são mais reportados como não comprados e também não interpretam de forma indevida o estado de desconexão da Account.
- A recuperação de login e de startup só destrói a escolha existente quando o Start está explicitamente inactive; `unavailable`, exceções de requisição e snapshots incompletos são preservados.
- OAuth, navegação de Team, Sidebar, Composer e a consulta de planos empresariais passaram a ler o `ModelProviderFamilySpec` nomeado, removendo o array posicional, os mapeamentos ternários de Family Provider ID e o segundo Resolver de escolha sem chamadas em produção.
- Os endereços de gestão de Team de Z.AI／BigModel entraram no Family Spec; o card de status resolve a Family por `providerId` e não lê mais o nome de exibição.
- As quatro cadeias de Hook de entitlement escritas à mão foram consolidadas em um Hook de Family, chamado explicitamente duas vezes para Z.AI e BigModel; Start e Coding continuam usando Provider ID, Account Access e cache key independentes.
- A interpretação de BigModel para produtos históricos sem Family foi concentrada em uma única função de normalização, e a navegação e a projeção de uso não escrevem mais fallbacks próprios.
- Removido o comentário distorcido «desabilita o fallback do Start depois que o Coding é ativado»; o Start agora é explicitamente um alvo de consulta independente.

Evidências de review de fase: 6 arquivos de teste de UI relacionados passam em 278 casos no total; `pnpm typecheck` passou; `pnpm lint` com 0 erro
（33 warnings, todos preexistentes e fora desta fase）; `git diff --check` passou. O `test:unit/fmt:check` final foi executado de forma unificada com todas as fases.

Evidências de regressão posteriores: o Todo 57 concluiu, no mesmo baseline final do Provider Refactor, o `typecheck` da raiz, o `lint`, o unit completo
（12.797 casos aprovados）e a execução real de WDIO de Provider／Account／Selection no macOS. O Todo 36 não mantém mais um estado independente de «aguardando a regressão final».