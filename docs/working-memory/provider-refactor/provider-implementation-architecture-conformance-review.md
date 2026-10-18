# Revisão de Conformidade Arquitetural da Implementação de Provider

## Status do documento

- Status: rascunho em discussão
- Baseline da revisão: `bcb119437370b74b6460b89975afae2ef5cdea33..6ddf899d6863d7cdede91a47fa6d718541284326`
- Objeto da revisão: a implementação de produção já commitada do Provider Refactor
- Fora do escopo desta rodada: limpeza do código antigo anterior ao baseline, o M4 Model Execution Cutover, mudanças não commitadas no workspace atual e a capacidade de produto de sincronização remota de configuração
- Objetivo: registrar a consistência da implementação atual em relação ao Design estabelecido, as pontes estruturais e as fronteiras ainda pendentes de decisão; este documento não aprova diretamente a solução final

"Limpo" é facilmente entendido como estilo de código, tamanho de arquivo ou limpeza subjetiva. Aqui usamos "conformidade arquitetural" para checar especificamente se a implementação executa a atribuição de estado já confirmada, a ordem de Overlay, o Source/Repository, o Registry, o Facade e as fronteiras de Account.

## Divisão de trabalho com a revisão de limpeza de código antigo

Existe hoje, em paralelo, outra revisão com foco em "limpar o código antigo existente". A divisão entre as duas revisões é:

```text
老代码清理审查
└─ 基线之前已经存在的旧实现、旧入口和兼容链

本审查
└─ Provider Refactor 新增代码
   ├─ 是否直接表达目标 Design
   ├─ 是否新增了长期合理的边界 Adapter
   └─ 是否把旧问题重新包装成新的桥接层
```

Esta revisão não enumera nem planeja a remoção do código antigo anterior ao baseline. Se um trecho de código novo se conecta a um sistema antigo, esta revisão apenas julga "se essa nova conexão é um Adapter temporário razoável, se vaza para o domínio alvo e se tem uma fronteira de saída explícita"; a implementação antiga conectada em si pertence à revisão de limpeza de código antigo.

As cerca de 2.850 linhas explícitas de legacy/transition glue no documento servem apenas para ilustrar a composição geral do código novo e evitar mal-entendidos estatísticos; não constituem a lista de correção de código antigo desta revisão. As duas revisões podem se citar e depender entre si, mas não podem reivindicar a mesma tarefa de limpeza.

## Objetivos da revisão

Esta revisão responde às seguintes perguntas:

1. No novo código de produção, o que é de fato a implementação de domínio do estado alvo?
2. O que são Adapters necessários de longo prazo nas fronteiras entre processos, serialização, arquivos e rede?
3. Que código, embora na cadeia principal formal, é essencialmente uma ponte estrutural criada para compensar abstrações que não foram levadas até o fim?
4. Que problemas já são conflito direto entre Design e implementação, e quais ainda exigem decisão de produto ou de arquitetura?
5. O que a limpeza posterior deve apagar, o que deve reescrever e quais fronteiras razoáveis precisam ser preservadas?

A revisão não julga a natureza de um arquivo pelo nome. Um arquivo sem nome `legacy` ou `compat` também pode estar fazendo dedução reversa de estado, reparseando protocolos implícitos ou tapando buracos entre camadas; um arquivo Adapter também pode ser uma parte formal necessária de longa prazo da arquitetura alvo.

## Critérios de classificação

| Categoria                 | Definição                                                                              | Exemplos típicos                                                        |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Implementação central do estado alvo | Expressa diretamente o modelo de domínio e a atribuição de estado já confirmados     | Config Overlay, Resolver, Registry, Facade, projeção de Account Config |
| Adapter de fronteira de longo prazo | Transformação de forma ainda necessária na arquitetura alvo                         | Serialização RPC, IO de arquivo Node, Network API Adapter              |
| Ponte estrutural            | Dedução reversa, reparsing ou exceções mantidas por falta de estado autoritativo ou de fronteira de abstração | Deduzir Personal a partir do Effective, UI interpretando `accessId` |
| Cola de migração explícita  | Compatibilidade temporária mantida para formatos antigos ou chamadores antigos       | legacy importer, antigo reader de Provider store                        |
| Boilerplate mecânico       | Não desvia do Design, mas a forma de implementação gera duplicação                   | Config Input/Object/Class, Overlay, `toJSON()`, boilerplate de validação de integridade |

## Estimativa atual de volume

Cerca de 19.250 linhas tinham sido classificadas antes como "implementação central do Design". Depois de revisar novamente por cadeia semântica, a estimativa provisória é:

| Categoria                              | Linhas novas estimadas | Observação                        |
| -------------------------------------- | ---------------------: | --------------------------------- |
| Executa de fato o design alvo          |      cerca de 14.000–15.000 | Continua sendo o corpo principal da implementação nova |
| Adapter de fronteira razoável de longo prazo | cerca de 1.400–1.900 | Não deve ser apagado só para reduzir linhas |
| Ponte estrutural causada por abstração incompleta | cerca de 2.100–2.800 | O foco deste documento      |
| Boilerplate abstrato mecânico          |          cerca de 600–900 | Otimizável, mas não equivale a desvio de arquitetura |

Essas são estimativas semânticas, e não uma contagem precisa de LOC calculável mecanicamente por caminho. Cerca de 4.000–4.800 linhas de implementação formal estão na superfície de código afetada, mas o mesmo arquivo costuma conter ao mesmo tempo lógica de domínio correta e lógica de ponte; estima-se que as pontes estruturais realmente apagáveis ou significativamente reduzíveis por redefinição de fronteira sejam cerca de 2.100–2.800 linhas.

As cerca de 2.850 linhas de legacy/transition glue explícitas estão fora das 19.250 linhas acima. Somando as duas, a dívida ampla de migração ou de estrutura no código de produção novo é de cerca de 5.000–5.700 linhas.

## Feature Summary

| Campo            | Valor                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Revisar se a implementação formal do Provider Refactor executa a arquitetura estabelecida e montar uma lista de problemas para as decisões seguintes |
| Capacidade       | Provider Config, Account Overlay, Registry, Settings/Selection Facade, Repository                                                              |
| Camada de mudança | option-source / validation / commit-effect / persistence                                                                                      |
| Modo de operação | impact-only; registra apenas as descobertas e direções candidatas                                                                              |
| Seeds principais  | `ProviderConfigService`, `projectEffectiveProvidersToPersonalConfig`, `ProviderConfigDocument`, `AccountProviderService`, `ModelSelectionFacade` |
| Fora de escopo   | M4, ciclo de vida do Model, capacidade de produto de sincronização remota de configuração, semântica de fila e de recuperação                    |

## Estrutura alvo já confirmada

A ordem do Provider Overlay mantém a decisão já existente:

```text
ZCode Built-in Provider Config
              |
              v
 overlay Account Built-in Provider Config
              |
              v
Effective Built-in Provider Config
              |
              v
 overlay Personal Provider Config
              |
              v
    Effective Provider Config
```

`Effective Built-in Provider Config` representa "o resultado do ZCode Built-in após resolução e restrição pelos fatos atuais de Account Built-in".
É uma camada conceitual formal e a baseline somente-leitura de Settings; não exige um novo objeto persistido nem um Source independente, e a implementação pode mantê-lo
como um valor derivado no Resolver/Registry Snapshot.

Dois invariantes valem ao mesmo tempo:

- Account trata apenas os Providers de conta já declarados pelo Built-in e não lê nem restringe Providers Personal-only.
- Personal entra em vigor depois de Account e é a cobertura final do usuário.

## Descobertas atuais

### F1. A cadeia de salvamento de Settings reconstrói Personal na direção inversa a partir do Effective

Estado: `must-inspect`, candidato a conflito com o Design, prioridade máxima.

Cadeia atual:

```text
Effective Provider Config
          |
          v
Renderer 克隆完整 Effective Draft
          |
          v
saveEffectiveProvider()
          |
          v
只相对 Built-in/Official 计算 Personal diff
          |
          +--> 特判丢弃 Account accessId
          `--> 其他 Account 结果可能进入 Personal
```

Evidências:

- `packages/ui/src/lib/providerSettingsFormProjection.ts` copia `effectiveConfig` e o `effectiveConfig` de modelos inteiros para o estado do formulário.
- `packages/ui/src/lib/providerPersonalSave.ts` entrega o Draft completo para `saveEffectiveProvider()`.
- `packages/provider/src/config-service.ts` lê apenas a Source Built-in/Official ao salvar.
- `packages/provider/src/personal-config-projection.ts` só consegue excluir manualmente `zhipu-account.accessId`.

Riscos:

- Membros de modelo Built-in retornados por Account podem ser cristalizados no Personal quando o usuário modifica um campo sem relação.
- Mudanças posteriores nos membros de modelo da conta ficam encobertas pela lista inteira do Personal.
- Cada novo campo dinâmico de Account pode exigir mais uma blacklist de campos.
- A baseline de salvamento não coincide com a baseline de Overlay que gerou o Effective Config.

Existem também conflitos de formulação no interior do Design que precisam ser decididos:

- `registry/configuration.md` exige que o Personal permaneça esparso e que a Effective View não contamine o Personal na direção inversa.
- `registry/settings.md` escreve que o Personal é calculado em relação à baseline do ZCode Built-in.

Direções candidatas, não decididas diretamente aqui:

1. Salvar o Draft Effective completo, mas calcular o Personal em relação ao `Effective Built-in Provider Config` da mesma revision.
2. O Renderer ou o Facade submete diretamente a intenção esparsa de Personal, sem diff reverso de um Draft Effective completo.
3. Manter o diff Built-in atual e continuar mantendo exceções de campos de Account; essa opção prolonga a ponte estrutural e não é recomendada como estado alvo.

#### Decisão posterior (2026-08-24)

Este item já foi decidido no Design formal e as três opções acima deixam de existir:

- Settings percebe diretamente o `Effective Built-in Provider Config` e o Personal Config esparso, e submete somente o
  Overlay de Personal esparso que o usuário realmente modificou; o Renderer não deduz Personal a partir do Effective Config;
- um item de configuração individual exposto por completo ao usuário continua sendo substituído por inteiro, e valores herdados não tocados não podem ser materializados por causa de um salvamento sem relação;
- a associação de modelos de Provider deixa de usar o `models[]` com sobreposição conjunta de três camadas e passa a ser dividida em
  `builtinModelIds`, de posse de Built-in/Account Built-in, e `modelIds`, de posse de Personal;
- quando os dois campos de associação têm o mesmo nome, isso forma um conflito explícito de Model ID. A configuração Personal antiga do modelo em conflito
  não é executável, e Settings, o seletor de modelos e o editor de modelos mostram em conjunto um diagnóstico e exigem que o usuário renomeie ou remova o modelo Personal;
- o Model Config ganha `enabled`, e a página de Provider oferece diretamente a operação de liga/desliga. IDs Built-in não podem ser removidos, e o usuário gerencia
  o conjunto de candidatos do seletor de modelos comum por meio de `enabled`.

Os fatos formais estão em
[`design/registry/model-membership-and-enablement.md`](./design/registry/model-membership-and-enablement.md)
e [`design/registry/configuration.md`](./design/registry/configuration.md).

### F2. `Config Document` já entrou na camada de domínio de Provider

Estado: `must-inspect`, confirmado como inconsistente com o Design.

O Design determina: Config Map, Rules e Effective Config são objetos de domínio; `schemaVersion`, o envelope JSON, o nome do arquivo e a migração pertencem a Source/Repository.

A implementação atual, porém, expõe:

- `ProviderConfigDocument` em `packages/provider/src/config/document.ts`;
- `ModelSelectionConfigDocument` em `packages/provider/src/model-selection-config.ts`;
- funções de projeção de Personal que devolvem `ProviderConfigDocument`;
- Node Repository, Official Source e Importer construídos em torno do Document.

Migração de versão, validação JSON, backup e escrita atômica são capacidades de persistência necessárias de longo prazo. O problema não é esse código existir, e sim o envelope do Repository ter sido moldado como objeto público do Provider Domain.

Fronteira alvo candidata:

```text
Provider Domain
└─ ProviderConfigMap + ModelConfigRules + Layer Update
                    |
                    v
Repository Boundary
├─ schemaVersion
├─ JSON envelope
├─ migration
├─ backup
└─ atomic write
```

O ponto pendente de decisão é a forma final da API pública e a ordem da migração, e não se o armazenamento versionado deve ser mantido.

### F3. `accessId` é interpretado como protocolo de produto em várias camadas

Estado: `must-inspect`, design de fronteira pendente de decisão.

A responsabilidade já estabelecida de `accessId` é ser uma identidade de conexão de conta estável e não sensível. Hoje ele ainda é usado em várias camadas para deduzir:

- Start / Individual / Team Plan;
- Provider Family;
- organization/project;
- Credential key;
- agrupamento, rótulos e Badge na UI.

O Account Resolver, o Request Auth, o Team Plan Runtime Key e a UI interpretam separadamente prefixos como `start-plan:`, `coding-plan:` e `team-plan:`. Em especial, `packages/ui/src/lib/modelSelectionGroups.ts` decide a exibição de produto diretamente por `accessId.startsWith(...)`.

Isso transforma o accessId de uma identity opaca em um protocolo de string entre camadas sem definição de tipo centralizada.

Direções candidatas:

```text
Provider Config
└─ accessId（保持稳定、opaque）

Account/Product Facade View
├─ family
├─ planKind
├─ connectionId
├─ organization/project display
└─ presentation label/badge
```

Esse candidato não exige adicionar campos de exibição de plano ao Provider Config nem criar uma nova Registry Source. O que precisa ser discutido é qual Service/Facade existente possui a projeção tipada de Account/Product e como o lado de autenticação de requisição garante que exista apenas um parser de accessId.

### F4. O last-known-good de Account usa um snapshot atômico inteiro (decidido)

O Account Built-in Provider Config é um snapshot atômico produzido pela mesma passagem de Settings, conta atual, seleção de conexão e resolução de entitlement. Quando a atualização
tem sucesso em sua totalidade, o conjunto é publicado de uma vez; quando qualquer dependência externa falha, nenhum resultado novo parcial é publicado e continua sendo mantida a Snapshot bem-sucedida anterior inteira.

Esta rodada não implementa last-known-good parcial por Family ou por Provider. A obsolescência breve é recuperada pela atualização seguinte; credenciais dinâmicas continuam sob responsabilidade do
Request Auth e da autorização do servidor, e não se pode contornar a autorização só porque se exibe uma Snapshot antiga. Em comparação com misturar várias gerações de resolução, a semântica de snapshot inteiro é mais
simples e dispensa manter geração de conta, revision de seleção e escopo de falha de dependência.

O ramo atual `unknown + previousProviders`, por Provider, é um mecanismo de recuperação pela metade que se sobrepõe à semântica alvo; o Todo 07 pode simplificar isso ao mexer no
Account Resolver, mas não se cria uma tarefa separada para isolamento de falhas.

### F5. A fronteira entre View e validação do Selection Facade é inconsistente

Estado: decidido, entra em
[`steps/todo-12-model-selection-validation-boundary-cutover.md`](./steps/todo-12-model-selection-validation-boundary-cutover.md).

`ModelSelectionFacade.getView()` filtra Providers hidden, mas `validate()` delega diretamente ao Registry completo. Assim, um Provider hidden que o usuário não vê na View de candidatos ainda pode passar pela validação do Facade do usuário.

Isso é inconsistente com o design existente:

- candidatos do usuário e validação da escolha do usuário seguem os candidatos visíveis do Selection Facade;
- capacidades internas de produto usam o Registry completo por ID preciso.

Uma auditoria adicional de chamadas confirmou que a UI comum consome apenas a View, e que o principal chamador de produção de `validate()` do Facade é justamente o despacho hidden de Off-Peak.
A decisão final é não manter validação de execução no Facade do usuário: apagar `validate()` do Facade/Service, fazer o Off-Peak usar uma verificação antecipada estreita do Registry interno e deixar toda Selection ser
validada finalmente pelo Registry/ModelFactory do Agent atual no momento de realmente submeter a tarefa e construir o Model.

### F6. Há Invólucros duplicados na composição do Provider Runtime

Estado: já entra no rascunho pendente de decisão
[`steps/todo-11-provider-runtime-composition-boundary-cleanup.md`](./steps/todo-11-provider-runtime-composition-boundary-cleanup.md),
e não deve ser implementado.

As implementações a seguir encapsulam ciclos de vida de Config/Registry muito semelhantes:

- `packages/provider-node/src/provider-config-runtime.ts`
- `packages/provider-node/src/provider-registry-runtime.ts`
- `packages/services/src/model-provider/providerRuntime.ts`
- `packages/services/src/model-provider/providerConfigRuntime.ts`

Injeção de caminho de arquivo, watcher, Facade de RPC e Account Source são fronteiras razoáveis. O problema é a duplicação de Empty Account Source, start/dispose, ready promise e montagem de Config/Registry.

Uma revisão de código mais aprofundada confirmou que essas quatro camadas correspondem a duas raízes de composição reais e distintas: o Host é responsável por Settings/Selection e o processo do Agent é responsável por
ModelFactory/execução; cada um dos lados ter seu próprio Registry é a fronteira correta. O rascunho registra a direção candidata de um recurso de Config Node compartilhado mais duas raízes de composição explícitas,
mantendo ao mesmo tempo a estrutura atual e alternativas como um Runtime unificado, aguardando decisão item a item.

Também foi encontrado um bug candidate de ciclo de vida concreto: o `dispose()` externo de `startProcessProviderRegistryRuntime()` também é responsável pelo
Model Selection Repository e, no modo Standalone, pela subscription de credencial; o entrypoint de Protocol chama diretamente o
`runtime.dispose()` interno e contorna a limpeza do Repository externo. Na fase de rascunho isso é apenas registrado, sem correção por conta própria.

### F7. A nomenclatura física `official` ainda se espalha para a API de domínio

Estado: decidido, entra em
[`steps/todo-10-zcode-builtin-provider-config-naming-cutover.md`](./steps/todo-10-zcode-builtin-provider-config-naming-cutover.md).

`officialProviders`, `officialSource` e `OfficialProviderConfigSource` ainda existem em grande quantidade. A semântica de domínio está unificada como
ZCode Built-in Provider Config.

Tipos de domínio, serviços, Source, Facade, variáveis, arquivos físicos, variáveis de ambiente e assets de SEA precisam migrar na mesma troca para
a semântica `zcodeBuiltin*` / `zcode-builtin`. O branch atual ainda não foi publicado, então não se mantêm campos antigos, caminhos antigos, alias, fallback ou importer.

### F8. As Model Properties completas ainda são propagadas entre camadas como estado desconhecido

Estado: `must-inspect`, Design já esclarecido, aguardando implementação.

O `ModelProperties` alvo define todos os `support_*` como boolean obrigatório, e a Model Rule Built-in genérica também é responsável por fornecer o padrão
completo. No entanto, depois que o Resolver termina com sucesso em `validateComplete()`, ele ainda publica o tipo esparso `ModelConfig` diretamente para o Registry, fazendo com que o
camada downstream se adapte repetidamente a um estado de "capacidade desconhecida" que na verdade não deveria existir:

- o Bootstrap Runtime usa `requireCompleteProperties()` para checar e copiar campo a campo de novo;
- a Selection envia as `properties` de Protocolo só quando todos os campos existem e, caso contrário, as omite silenciosamente;
- as folhas de formato do Protocolo são obrigatórias, mas `ZCodeModelOption.properties` é optional como um todo;
- o Draft de Settings completa defaults com `support_text ?? true` e os demais formatos com `?? false`;
- o Adapter continua aceitando `properties/input_format` optional na conversão de modelos já resolvidos e de mensagens;
- o merge do Catalog antigo fixa true/false quando falta capacidade.

```text
Sparse Model Config Rule                    正确
          |
          v
resolve + validateComplete
          |
          +--> 继续发布 Sparse ModelConfig  当前根因
                       |
                       +--> Runtime 再校验
                       +--> Protocol 可省略
                       +--> Settings 补默认
                       `--> Adapter optional
```

O objetivo é fechar a fronteira de tipo no ponto de publicação do Resolver/Registry: Rule e Personal Overlay podem ser esparsos, enquanto Effective/Registry
Model, assim como Protocol, Active Model, Runtime e Adapter, só podem ver boolean completos. Campo ausente é erro de configuração, não
`unknown`; o downstream não pode completar defaults nem omitir silenciosamente.

Isso não envolve o `unknown` de TypeScript do JSON aberto. O Legacy importer ainda pode ler o formato antigo numa fronteira pontual, mas só pode produzir um Personal
Config esparso composto por fatos antigos explícitos; itens ausentes herdam a Rule Built-in, sem default de migração nem formar um fallback geral de Runtime. Depois do upgrade forçado que ultrapassa a janela de compatibilidade,
o importer, o parser, as dependências de Catalog e os testes do formato antigo sem versão são removidos por completo. O plano de implementação está em
[`steps/todo-03-provider-model-ownership-and-property-totality.md`](./steps/todo-03-provider-model-ownership-and-property-totality.md).

## UI Surface Matrix

| Cenário do usuário     | Entrada de UI                        | Owner de exibição/draft             | Fonte de default/herança        | Validação/gating                                  | Ação de commit              | Autoridade/persistência | Deve permanecer isolado de            |
| ---------------------- | ------------------------------------ | ----------------------------------- | --------------------------------- | ------------------------------------------------- | --------------------------- | ----------------------- | ------------------------------------- |
| Editar Provider       | Provider Settings                    | Renderer Personal Draft esparso     | Effective Built-in + Personal     | Facade Preview / completude do Registry           | Salvar Personal Overlay     | Personal Repository    | Resultados dinâmicos de Account não podem ser solidificados sem querer |
| Selecionar modelo visível ao usuário | Model selector         | Draft local de cada Surface          | Model Selection Facade View       | Selection Facade validate                          | Ação de commit de cada Surface | Owner de estado próprio | Providers hidden, estado de outras Surfaces |
| Exibir Provider de plano | Model selector / Provider Settings | Projeção do Renderer                | Effective Provider + dados de produto | Availability da conta                        | Nenhuma ou ação de conexão por produto | Account/Product Service | A UI não interpreta o protocolo de Request Auth |
| Ligar/desligar modelo  | Lista de modelos do Provider / editor de modelos | Renderer Personal Draft | Effective Model Config | enabled + completude + conflito | Salvar Rule Personal precisa | Personal Repository | Não altera membros Built-in nem autorização do servidor |
| Tratar conflito de Model ID | Lista de Providers / editor / seletor | Renderer mostra apenas o diagnóstico autoritativo | Model Inventory source-aware | `id-conflict` do Resolver | Renomear ou remover o item Personal | Personal Repository | Não reescreve automaticamente o Personal nem a origem da seleção |

## State Owners And Commit Sinks

| Estado/fato                         | Owner de draft/exibição       | Owner autoritativo                 | Comando/serviço de commit    | Persistência/cache                    |
| ----------------------------------- | ----------------------------- | ---------------------------------- | ----------------------------- | ------------------------------------ |
| Built-in Provider/Model Config      | Projeção somente-leitura de Settings View | Built-in Config Source | Publicação de produto | `config/provider/zcode-builtin.json` |
| Account Built-in Provider Config    | Projeção de Settings/Selection View | Account Provider Service | Account refresh | last-known-good local ao processo |
| Personal Provider/Model Config      | Renderer Draft                  | Personal Config Repository         | Provider Settings Service     | Personal Config do Environment atual |
| Effective Provider Config           | Facade View                     | Resolver/Registry Snapshot          | Source refresh/rebuild        | Sem persistência independente       |
| Credencial de requisição da conta   | A UI não possui                | Account Request Auth Service        | A cada tentativa de request   | Credential Store/interfaces dinâmicas |
| Candidatos de modelo visíveis ao usuário | Exibição de cada Surface | Model Selection Facade | Registry refresh | Sem persistência independente       |
| Associação de modelos Built-in       | Projeção somente-leitura de Settings View | Effective Built-in Config | Built-in/Account refresh | `builtinModelIds`                    |
| Associação de modelos Personal       | Renderer Personal Draft         | Personal Config Repository         | Provider Settings Service     | `modelIds`                           |
| Conflito de Model ID                | Diagnóstico somente-leitura do Renderer | Resolver/Registry Snapshot | Source refresh/rebuild | Sem persistência independente       |
| Model enabled                       | Renderer Personal Draft         | Effective Model Config             | Atualização de Rule Personal  | Personal Model Config Rules          |

## Feature Relationships

| Rank           | De                                | Aresta semântica                    | Para                        | Por que inspecionar                                  |
| -------------- | --------------------------------- | ----------------------------------- | --------------------------- | ----------------------------------------------------- |
| must-inspect   | Provider Settings Draft           | commits-effective-config-to         | Personal Config projection | Hoje há dedução inversa do Effective e risco de vazamento de campos de Account |
| must-inspect   | Account Provider Service          | overlays                            | Built-in Provider Config    | Determina a baseline correta do salvamento de Personal |
| must-inspect   | Account connection identity       | authenticates-through                | Account Request Auth        | O accessId precisa ser estável e ter parsing centralizado |
| must-inspect   | Account product presentation      | projects-to                         | Settings/Selection UI       | A UI não deve interpretar strings de identity de autenticação |
| must-inspect   | Selection Facade                  | validates-visible-candidate-for     | User selection surfaces     | Hoje validate usa o Registry completo                 |
| must-inspect   | Built-in/Personal membership      | conflicts-by-same-model-id          | Settings/Selection/Editor   | A mesma identidade de execução não pode escolher silenciosamente a fonte de configuração |
| must-inspect   | Personal Model Rule               | controls-enabled-for                | Model Selection Facade      | disabled fica em Settings, mas sai dos candidatos comuns |
| must-inspect   | Complete Model Config             | freezes-properties-for              | Protocol/Model/Runtime      | O tipo esparso vaza e gera compatibilidade de unknown em várias camadas |
| should-inspect | Repository envelope               | serializes                          | Provider Config Layer       | O versionamento precisa ser mantido, mas não entrar na camada de domínio |
| should-inspect | Provider Runtime composition      | assembles                           | Config/Registry/Facade      | Pode reduzir duplicação sem quebrar a fronteira de Source |

## Must-Preserve Invariants

1. A ordem do Provider Overlay é sempre ZCode Built-in -> Account Built-in -> Personal.
2. O Account Built-in só lê os account Providers do ZCode Built-in e não lê Providers Personal-only.
3. Personal é a cobertura final do usuário e permanece esparso; fatos dinâmicos de Account não editados não podem ser gravados por engano no Personal.
4. O Effective Config não é persistido de forma independente e não pode se tornar a fonte de fato que contamina na direção inversa o Source de origem.
5. `accessId` é identidade de conexão não sensível, e não capacidade estática de modelo, resultado de autorização do servidor ou protocolo de produto da UI.
6. Credenciais de requisição da conta não entram no Provider Config, na Settings View nem no Personal Config persistido.
7. Visibility afeta apenas o Facade do usuário; lookup interno preciso no Registry não introduz conceito de permissão ou de "confiável".
8. Envelope JSON, schema version, migration e escrita atômica pertencem ao Repository, não ao Provider Domain.
9. Desktop, Web, Mobile e Remote Environment usam o Provider Service do seu próprio Environment alvo; esta revisão não altera a fronteira de produto existente de sincronização remota.
10. Uma Model Rule pode ser esparsa; depois de `resolve + validateComplete`, as Model Properties do Effective/Registry devem ser completas, e o
    downstream não pode manter capacidade unknown nem completar defaults.
11. O Legacy importer migra apenas fatos antigos explícitos e não adivinha capacidades; depois do upgrade forçado que ultrapassa a janela de compatibilidade, toda a cadeia de importação do formato antigo sem versão é removida,
    mas a migration normal de schemaVersion continua pertencendo ao Repository.

## Adapters razoáveis e itens proibidos de remoção indevida

O código a seguir não pode ser apagado apenas por ser "cola", mesmo tendo muitas linhas:

- file lock, escrita atômica, watcher, backup e migration do Node Repository;
- o RPC Service projetando Config Class como objeto comum serializável;
- as diferenças reais de negócio de Account API, Start Plan, Personal Coding Plan e Team Plan;
- as interfaces de Provider Source/Repository e o Registry local ao processo;
- a materialização física da configuração Built-in em ambiente SEA;
- o Schema de runtime do Protocolo;
- o Overlay de três estados do Config e a validação de integridade.

Classes de Config como `ModelPropertiesConfig` têm boilerplate mecânico evidente, mas esse é o custo de implementação decorrente da insuficiência das ferramentas de Overlay declarativo e não equivale automaticamente a desvio de arquitetura.

## Evidence And Limitations

Esta rodada percorreu os seguintes caminhos até a profundidade 2:

```text
Provider Settings UI
  -> Provider Settings Service/Facade
  -> ProviderConfigService
  -> Personal projection
  -> Personal Repository

Built-in Config
  -> Account connection resolver
  -> Account Provider Service
  -> Provider Resolver/Registry
  -> Settings/Selection Facade

accessId
  -> Account Config
  -> Request Auth
  -> Product UI presentation
```

O ambiente atual não oferece uma interface de codegraph chamável; chamadores diretos e cadeias de estado foram conferidos com o código atual, `rg`, o Design alvo e evidências de teste. Antes de entrar na implementação, deve-se rodar mais uma vez a verificação de codegraph impact/affected-tests para confirmar que não há chamadores novos.

## Graph Drift Candidates

| Candidato                                     | Evidência no código vivo                     | Relação ausente/desatualizada no grafo                                  | Seguimento proposto                                   |
| --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Projeção inversa Effective -> Personal       | Settings Draft e `saveEffectiveProvider`      | O feature graph só registra a persistência de Settings e não registra a dependência de baseline de Account | Completar o grafo depois de decidir a semântica de salvamento |
| Apresentação de produto de Account interpretando accessId | `modelSelectionGroups.ts` e afins   | Falta a aresta de projection de apresentação entre Provider Registry e Plan Entitlements | Completar o grafo depois de confirmar o owner do Facade |
| Validação hidden do Selection Facade          | Filtro na View, validate delegando ao Registry completo | O grafo não distingue visible validation de internal exact validation | Completar o grafo depois de confirmar a semântica da API |
| Posse de membros / conflito de id de Model    | O novo Design já foi confirmado               | O grafo originalmente não tinha membros Built-in/Personal nem arestas de conflito | Já foram adicionados o capability invariant e a aresta Settings/Selection |
| Properties completas -> Runtime               | Ainda há optional/defaults compatíveis depois do Registry | A aresta alvo já existe, mas a implementação não fecha a fronteira de tipo entre Rule esparsa e Model completo | Apertar o tipo de publicação do Registry conforme o TODO 03 e apagar os fallbacks do downstream |

Este documento está na fase impact-only e não modifica o feature graph.

## Pontos em discussão e decisão

### D1. Entrada autoritativa do salvamento de Personal (decidido)

- O Renderer submete diretamente o Overlay de Personal esparso produzido pelas modificações reais;
- a Settings View fornece simultaneamente Effective Built-in, Personal e o Effective Config autoritativo, mas o Effective não é entrada de salvamento;
- um item de configuração exposto por completo, uma vez modificado, salva o valor substituto completo, e itens não modificados não são materializados.

### D2. Consistência da baseline de Account no salvamento (decidido)

O salvamento carrega a revision da Settings View; o Service aplica o Overlay de Personal sobre o Effective Built-in atual, e uma resposta expirada não pode
sobrescrever o Draft atualizado. Membros de modelo de Account/Built-in entram em `builtinModelIds` e membros de usuário entram em `modelIds`, de modo que a atualização do upstream
não precisa mais fazer rebase de uma lista de membros compartilhada. Nomes duplicados são tratados pelo `id-conflict` explícito.

### D3. API do envelope do Repository

É preciso confirmar se `ProviderConfigDocument` e `ModelSelectionConfigDocument` vão para a implementação privada do `provider-node` ou se permanecem como helper de serialização não domínio dentro do pacote Repository; ambas as opções não podem continuar como estado público do Provider Domain.

### D4. Owner da projeção tipada de Account/Product

É preciso escolher o owner entre o Account Service existente, o Provider Settings Facade ou um Facade de produto separado. É proibido continuar codificando semântica de exibição da UI dentro do accessId, e também não se deve enfiar campos de UI de produto no Provider Config.

### D5. Granularidade de falha recuperável da conta (decidido)

Não se estabelece granularidade de falha parcial. O Account Built-in Config é publicado atomicamente por inteiro quando tem sucesso e, quando falha, mantém por inteiro a Snapshot bem-sucedida anterior.

### D6. Semântica dos chamadores de validate do Selection Facade

Decidido: o Facade do usuário só projeta candidatos visíveis e não expõe mais `validate()`. Tarefas comuns são validadas de forma autoritativa na fronteira de construção do ModelFactory;
produtos internos como Off-Peak usam diretamente a validação precisa do Registry, e visibility não se torna permissão nem identidade de execução especial.

### D7. Momento de fechamento da composição de Runtime

O Todo 11 já foi criado para guardar o estado atual, as duas raízes de composição entre processos, as opções candidatas e os itens pendentes de decisão. Está explicitamente em espera; pode ser independente das decisões
semânticas anteriores, mas o Design formal não pode ser atualizado nem a implementação iniciada antes de ser compreendido por pessoas e confirmado item a item.

## Ordem sugerida de discussão

1. D1 + D2 já foram concluídos; a revisão de implementação deve, com base neles, apagar a projeção inversa Effective -> Personal e a ponte do `models[]` compartilhado.
2. D3: confirmar a fronteira de serialização entre domínio e Repository.
3. D4: confirmar a identity de Account e a projeção de produto; D5 já foi decidido como Snapshot atômico inteiro.
4. D6: já decidido e dentro do Todo 12, aguardando implementação.
5. D7: o Todo 11 já guardou o rascunho, aguardando retomar a discussão mais adiante e não entrando na sequência de implementação atual.

Depois que cada decisão for concluída, o Provider Design deve ser reescrito primeiro e só então são definidos os planos de teste e de implementação. Este documento é responsável por preservar a trajetória da revisão e não deve substituir o Design final.