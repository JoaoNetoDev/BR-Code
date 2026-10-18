# 00 Roteiro de Limpeza da Unificação da Abstração de Modelo

> Status: concluído
>
> Data: 2026-08-25
>
> Revisão de origem: [`../research/model-abstraction-unification-cleanup-audit.md`](../research/model-abstraction-unification-cleanup-audit.md)
>
> Design alvo: [`../design/design.md`](../design/design.md)

## 0. Resultado da Conclusão

Os Todo 01–10 foram todos implementados. A cadeia principal de produção mantém apenas `ModelSelection -> Provider Registry -> ModelFactory -> Model`:
o Core não consulta mais o Connection Registry nem o Adapter Registry; a capacidade do modelo e a compatibilidade de requisição vêm somente do Model Config completo; a seleção de conexão de conta,
Off-Peak e o ZCode Built-in Config também passaram a usar a mesma cadeia de fatos estruturada.

O novo Todo 11 guarda apenas a revisão subsequente do limite de composição do Provider Runtime; atualmente está como "rascunho/não deve ser implementado". Os Todo 12–14 foram concluídos:
a seleção de Facade do usuário foi separada da validação de execução; o Host alvo, o workspaceKey, a Selection estruturada e esparsa do produto e as Settings de Subagent Local-only
foram consolidados; MCS, Factory Contract, DTO legado e resíduos mortos mecânicos também chegaram a zero. Esse trabalho subsequente não altera a conclusão de conclusão dos Todo
01–10.

A revisão reversa pós-conclusão de 2026-08-27 encontrou: algumas declarações de conclusão dos Todo 05/07/12–14/20/21 ainda divergem do código atual, incluindo o `accessId` público,
`ForkModelRef`, a string de Selection, a transação de edição de Model e a UI de herança. O Todo 23 fechou as lacunas transacionais de Selection e Settings; o Todo 24 substituiu seu
fatia de Access pela decisão final, removendo a vinculação de conta na criação e consolidando a autenticação e a assinatura em tempo de requisição; o Todo 25 também aposentou a
entrada de produto ZAPI. A conclusão de zero mecânico deste roteiro já cobre essas lacunas da revisão reversa.

Os campos antigos remanescentes existem apenas em limites explícitos de leitura histórica: o codec do Session Store e o importador de Personal Config da CLI. Eles apenas
convertem dados publicados na estrutura atual e não expõem tipos antigos ao Registry, ao Runtime ou aos novos caminhos de escrita. O script de restauração de sessões antigas
passou a escrever diretamente no contrato de mensagens atual, sem manufacture novos dados legados.

## 1. Objetivo do Planejamento

O Provider Refactor já estabeleceu a cadeia principal `ModelSelection -> Provider Registry -> ModelFactory -> Model`, e o M4 também incorporou a essa
cadeia execuções especiais como tarefas ociosas, Compact e Subagent. Este roteiro é responsável por concluir o próximo passo: apagar fisicamente as abstrações antigas que ainda conseguem
expressar, montar ou executar modelos, de modo que o sistema termine com apenas um conjunto de semântica de modelo de negócio.

A divisão entre este roteiro e a revisão paralela de "conformidade do código novo de Provider/M4" é a seguinte:

```text
Revisão de conformidade do código novo
`- Verifica se o novo Config / Registry / ModelFactory implementa corretamente o design confirmado

Este roteiro de limpeza
`- Remove as antigas interfaces de execução, interfaces de consulta e tipos de identidade mistos que sobreviveram à criação da nova cadeia
```

A estrutura final é:

```text
Persistência / Protocol
    ModelSelection
          |
          v
Provider Config Efetivo + Regras de Model Config Efetivas
          |
          v
  Provider Registry de negócio
          |
          v
      ModelFactory
          |
          | resolve e congela uma vez os fatos estáticos de Provider / Model
          v
      Model Ativo
      |- providerId / modelId
      |- properties / optionSpecs / options
      `- generateText / streamText
          |
          v
      Implementação de execução AI SDK interna do Adapter
 |- Codificação da API do Provider
 |- execution-provided resolvido por attempt
 |- proxy / CA / endpoint routing / signing
 |- retry / stream recovery / normalização de erro
 `- status / telemetry (mantido como está neste ciclo)
          |
          v
      Provider API
```

## 2. Abstrações Paralelas que Desaparecerão

```text
Resíduos após a conclusão dos Todo 02/03

Core ------------------> ModelConnectionPort
  |
  +--> ModelFactory --> Model --> Closure de execução privada do Adapter --> AI SDK
  `--> ModelRef ainda expressa simultaneamente várias semânticas: identity / result / event

Alvo

Core --> ModelFactory --> Model --> Closure de execução privada do Adapter --> AI SDK
  |
  +--> A seleção futura usa somente ModelSelection
  `--> A execução atual usa somente Model
```

O que deve ser aposentado não é a capacidade de rede do Adapter, mas o segundo conjunto de semânticas de montagem e consulta de modelo que ele expõe à camada de negócio.

## 3. Limites Confirmados

### 3.1 Abstração de negócio única

- `ModelSelection` expressa o que Model será criado no futuro; pode ser persistido e transmitido entre processos;
- `ModelFactory` é a única entrada da camada de negócio para criar o Model raiz de execução; um `Model` já existente pode derivar, via `Model.bind()`, um Model vinculado com a mesma identidade,
  os mesmos fatos estáticos e o mesmo Executor;
- `Model` é o único objeto de modelo usado na execução atual; o Core não conhece diretamente Adapter nem Connection;
- O Adapter apenas transforma em chamadas da Provider API os fatos estáticos e as requisições já resolvidos.

### 3.2 Não criar novo estado intermediário de negócio

Neste ciclo não introduzimos `ExecutionModelBinding`, `ExecutionModelConfig`, `ModelIdentity` nem outro Execution Registry.
O interior do Adapter pode usar objetos de parâmetro privados, closures e cache, mas eles não se tornam estado de modelo de negócio selecionável, consultável, persistível ou sincronizável.

### 3.3 Ciclo de vida

```text
Registry revision N ----> cria Model A ----> A fixa os fatos estáticos da revision N

Registry revision N+1 --> cria Model B ----> B usa a revision N+1

Request Auth em tempo de requisição ----> resolve materiais de acesso dinâmicos por attempt
                                         `- não reescreve endpoint, api.type ou properties de A/B
```

Atualizações de Config afetam apenas Models criados depois. Um Model já criado não troca a quente Endpoint, tipo de API, Provider Options ou capacidade de modelo por meio do Adapter Registry.
A autenticação dinâmica ainda pode ser renovada a cada tentativa de requisição do Model atual.

### 3.4 Telemetry

O design atual de Telemetry tem outros problemas, mas nesta rodada está explicitamente fora do refactor:

- Não adicionar novo Telemetry Context ou Observation DTO;
- Não criar `ModelIdentity` aproveitando a limpeza de `ModelRef`;
- Não separar Product Status de Telemetry;
- As migrações de tipo necessárias ficam limitadas a preservar o comportamento atual dos eventos.

## 4. Todos em Fases

O status usa apenas três valores estáveis: `rascunho` indica que ainda precisa de discussão item a item e não deve ser implementado diretamente; `pendente` indica que a decisão já está clara e pode ser implementado ou está em implementação, mas a aceitação ainda não foi concluída; `concluído` indica que implementação, testes, documentação e commit estão todos concluídos.

| Todo                                                                         | Status    | Tarefa                                        | Objetivo                                                                                                   | Dependência principal                        |
| ---------------------------------------------------------------------------- | --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`01`](./todo-01-core-model-adapter-boundary-cleanup.md)                     | concluído  | Limpeza do limite Core Model Adapter          | Remover o `modelAdapter` do Core, o Compatibility Model, o antigo ModelPort e a entrada de execução direta do Adapter | M4 concluído                                 |
| [`02`](./todo-02-ai-sdk-execution-registry-retirement.md)                    | concluído  | Aposentadoria do Execution Registry do AI SDK | Remover o Provider Registry mutável do Adapter e a superfície de consulta inversa, montando tudo de uma vez na criação do Model | Concluído em sincronia com o Todo 03         |
| [`03`](./todo-03-provider-model-ownership-and-property-totality.md)          | concluído  | Consolidação da conformidade de Provider/Model | Completar propriedade de membros, enabled/visibility e totalidade de Properties                             | Concluído em sincronia com o Todo 02         |
| [`04`](./todo-04-core-model-connection-port-retirement.md)                   | concluído  | Aposentadoria do Core Model Connection Port  | Capacidade apenas lendo Active Model.properties, Connection permanece na implementação privada do Adapter    | Todo 02 e 03 concluídos                      |
| [`05`](./todo-05-model-ref-retirement.md)                                    | concluído  | Aposentadoria do ModelRef                     | Selection usa ModelSelection, execução usa Model, removendo campos de identidade redundantes por consumidor  | Todo 01 concluído                            |
| [`06`](./todo-06-config-storage-envelope-repository-privatization.md)        | concluído  | Privatização do envelope de armazenamento de Config | Document, envelope de versão e migration saem do Provider Domain                                    | Recomendado: Todo 03 e 05                    |
| [`07`](./todo-07-account-connection-selection-and-access-context-cutover.md) | concluído  | Consolidação do Account Connection            | Seleção de conexão estruturada, Account Access, Request Auth, Off-Peak e MCP usando a mesma cadeia de fatos | Limite de tipos completo do Todo 03           |
| [`08`](./todo-08-legacy-model-catalog-retirement.md)                         | concluído  | Aposentadoria do Legacy Model Catalog          | Remover Catalog/override e Reasoning State, e projetar o MFJS Tool Schema a partir do Config               | Todo 02 e 03 concluídos                      |
| [`09`](./todo-09-off-peak-model-selection-legacy-projection-retirement.md)   | concluído  | Aposentadoria da projeção antiga de modelo Off-Peak | Unificar candidatos, Reasoning e dupla validação para Providers ocultos via scoped Selection View | Todo 03 e 08                                |
| [`10`](./todo-10-zcode-builtin-provider-config-naming-cutover.md)            | concluído  | Troca de nomenclatura do ZCode Built-in Config | O domínio `official`, o código e a nomenclatura física do Provider Config saem atomicamente, sem manter compatibilidade | Pode ser executado de forma independente     |
| [`11`](./todo-11-provider-runtime-composition-boundary-cleanup.md)           | rascunho  | Limpeza do limite de composição do Provider Runtime | Revisar recursos de Node Config, raízes de composição Host/Agent e o owner único de ciclo de vida     | Aguarda decisão humana item a item           |
| [`12`](./todo-12-model-selection-validation-boundary-cutover.md)             | concluído  | Consolidação do limite de validação de Model Selection | O Facade só oferece candidatos ao usuário; Registry/ModelFactory assumem a validação autoritativa de execução | Pode ser executado de forma independente     |
| [`13`](./todo-13-target-host-model-selection-authority.md)                   | concluído  | Consolidação da autoridade de seleção de modelo do Host alvo | local/remote lê o Host alvo, remove a seleção temporária por App/string e isola o estado por workspaceKey | Recomendado após o Todo 12                  |
| [`14`](./todo-14-post-refactor-mechanical-zero.md)                           | concluído  | Zero mecânico final do Provider Refactor      | Corrigir o Full Compact MCS, endurecer a Factory, privatizar o Legacy DTO e remover código morto            | Coordenado com os Todo 12/13                 |
| [`23`](./todo-23-provider-refactor-decision-gap-closure.md)                  | concluído  | Consolidação de lacunas de decisão e transação de Settings | Remover a ID pública de conexão/ModelRef de mesma forma, consolidando as transações de Selection e edição de Model | O Todo 24 substitui os detalhes de Access     |
| `24` (o documento mantém apenas a versão oficial)                            | concluído  | Consolidação do contrato de Access e validação de segurança de requisição | Estreitar o Account Overlay, autenticar pela conexão atual, zerar mecanicamente o Access Type e a admissão de validação de segurança | Substitui o Access do Todo 23                |
| [`25`](./todo-25-zapi-product-entry-retirement.md)                           | concluído  | Aposentadoria da entrada de produto ZAPI     | Remover a identidade de produto atual, o Gate exclusivo, a entrada de UI e o caso especial de migração legada | Decisão de produto independente              |

Os números representam a identidade estável da lista de limpeza. Durante a implementação, o avanço é item a item, com confirmação item a item; a cadeia final de dependências já está toda fechada:

```text
Todo 01 concluído e aceito
        |
        v
Todo 02–10 decididos e implementados item a item
        |
        v
Zero mecânico, verificação completa e auditoria final
```

Os Todo 02/03 estabelecem Properties de Model completas e o limite de tipos único do Registry; os Todo 04/05 em seguida removem a consulta de Connection do Core e a identidade
de modelo misturada; o Todo 06 retoma o envelope de armazenamento; o Todo 07 estabelece o Account Connection estruturado; os Todo 08–10 removem finalmente o Catalog, a projeção
antiga de Off-Peak e a nomenclatura incorreta de Official. O Todo 11 é um rascunho de limite de composição independente descoberto após a conclusão do trabalho acima, não entra na
cadeia de conclusão existente e não pode ser implementado antes de uma decisão humana; o Todo 12 é uma limpeza de limite de validação já decidida e independente; o Todo 13 consolida, sobre o limite
final de validação do Todo 12, os fatos de seleção do usuário do Host, o padrão do Workspace e a persistência do produto; o Todo 14 apenas completa o zero mecânico final dos
contratos confirmados. O refactor completo de Telemetry não faz parte deste roteiro.

## 5. Impact Brief

### 5.1 Resumo Funcional

| Campo             | Conclusão                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Developer intent  | Remover as antigas abstrações de modelo, unificando os limites de montagem e execução de Provider/Model |
| Capability        | Provider Registry, criação de Model, execução de modelo                                 |
| Change layer      | `commit-effect`, `validation`, `persistence contract`                                    |
| Operating mode    | incremental cleanup                                                                     |
| Primary seeds     | `AgentRuntime`, `ApiProviderModelRuntime`, `ModelConnectionPort`, `ModelRef`            |
| Out of scope      | Refactor de Telemetry, design de produto de autenticação de conta, semântica de produto de seleção de modelo, Queue/Recovery, Remote Provisioning |

### 5.2 Matriz de Superfície de UI

Além da ativação/desativação de modelos de Provider, visibilidade, origem de membros e interações de conflito já definidas no Todo 03, nenhum outro Todo planeja modificar a UI. As
entradas a seguir compartilham o fato de candidatos, mas cada uma mantém estado e ponto de commit independentes:

| Cenário do usuário               | Entrada de UI               | Fonte autoritativa                            | Requisito desta rodada       | Isolamento obrigatório                    |
| -------------------------------- | --------------------------- | --------------------------------------------- | --------------------------- | ---------------------------------------- |
| Seleção comum de modelo          | Composer model control      | Model Selection Facade / Session Selection    | Filtrar disabled/hidden     | Active Model não é alterado a quente pela UI |
| Configurações de Provider       | Provider Settings           | Settings Facade / Personal Config             | Exibir e salvar enabled    | Não expor Provider oculto                 |
| Automation/Subagent/Repo Wiki   | Controle de modelo próprio  | Draft/Persistence próprios + Selection Facade | Origem das opções inalterada | Não unificar seus commit sinks individuais |

### 5.3 Superfície de Impacto Graduada

| Nível           | Relação                                     | Por que precisa ser inspecionado                                        | Evidência                                                                 |
| --------------- | ------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| must-inspect    | Core Runtime -> ModelFactory/Model          | Remover as antigas entradas de Adapter e Connection                   | `apps/zcode-cli/packages/core/src/runtime`                                 |
| completed       | Bootstrap -> Provider Registry -> Adapter   | Segunda cópia mutável do AI SDK Registry removida; montagem única na criação do Model | `provider-registry-model-runtime.ts`                                       |
| must-inspect    | Adapter runner -> AI SDK                    | Preservar todo o comportamento de IO de Provider, reduzindo a interface de montagem | `adapters/src/model/runner.ts`, `model-execution.ts`                       |
| must-inspect    | Contracts -> ModelRef/Result/Event          | `ModelRef` mistura identidade, seleção e variant                    | `contracts/src/model/index.ts`, `events/session.events.ts`                 |
| should-inspect  | Compact/Memory/Subagent/Title/Tools         | Vários ramos de execução de modelo devem consumir apenas o Active Model | Pontos de chamada do Core e testes do Todo 01                             |
| conditional     | Protocol/session persistence                | Entra apenas quando o Todo 05 remover ou migrar campos                | Session events, timeline/message persistence                               |
| invariant-only  | Off-Peak/Goal/Background                    | Continua usando Selection/Factory/Active Model comuns                 | M4 execution spec                                                          |
| invariant-only  | desktop/mobile/remote                       | Não altera continuous, replayable, Queue nem workspace identity        | Design de Provider Environment                                             |
| completed       | Testes do antigo Registry do Adapter        | Reorganizados por responsabilidade de rede, sem semântica de consulta de Registry | `adapters/tests/registry.test.ts` etc.                                    |

### 5.4 Owner de Estado e Ponto de Commit

| Estado/fato                      | Owner autoritativo                        | Resultado desta rodada                                        |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Fatos estáticos de Provider/Model | Provider Registry de negócio              | O Adapter não replica mais como Registry mutável de consulta  |
| Seleção futura de modelo         | Estado de produto onde vive o ModelSelection | Não expressa com ModelRef nem Provider padrão do Adapter      |
| Modelo de execução atual         | Active Model do Agent Loop                | Capacidade e execução do Core leem unidamente dele            |
| Recursos de rede do Provider     | Closure de execução privada do Adapter/serviço de processo | Não se torna uma visão de Registry de negócio                 |
| Request Auth dinâmico            | Dependência de requisição do Model        | Resolvido por attempt; não entra em Config/Selection/Persistence |
| Eventos/histórico de Session     | Session contract/persistence existente    | O Todo 05 decide campo a campo entre manter Selection, identidade achatada ou remover |

### 5.5 Invariantes que Precisam Ser Mantidos

1. Todas as chamadas de modelo de produção passam por um Model criado pelo ModelFactory;
2. Um Loop/Step usa um Active Model determinado; atualizações de Config não o alteram a quente;
3. Compact automático usa o Active Model atual; Subagent cria o seu próprio Model;
4. Um Provider oculto continua sendo um membro comum e completo do Registry, apenas invisível no Facade do usuário;
5. A ausência de execution-provided falha antes da rede e cobre apenas materiais de acesso dinâmicos;
6. Codificação de SDK do Provider, proxy, CA, Endpoint Routing, assinatura, Retry, Stream Recovery e normalização de erro não se perdem;
7. Não altera Session Selection, App Recent, Queue, Goal, Background nem a admissão de Off-Peak;
8. Não espalha a semântica de restauração replayable para o desktop continuous nem altera a workspace identity;
9. Não adiciona um segundo conjunto de DTO de capability, identity, connection ou execution config;
10. O comportamento de Telemetry permanece como está; a limpeza não amplia payload nem introduz novo context.

### 5.6 Fatos de Código e Deriva do Grafo

- `AiSdkModelRegistry`, a atualização a quente de Config e a sincronização total do Bootstrap já foram zerados no Todo 02;
- `ModelConnectionPort` se espalhou via barrel export para o Core Runtime, Tool, WebSearch, MCS e Embedded Search;
- `ModelRef` ainda aparece em cerca de 50 arquivos de produção que não são de teste;
- O glob padrão de `dep:refs` do repositório não inclui `apps/zcode-cli/packages/*`, então é preciso passar
  `--scope apps/zcode-cli/packages`; barrel import subestima o resultado de símbolos para parte das interfaces, portanto a aceitação da remoção também deve combinar
  `rg`, TypeScript e testes de pacote;
- O grafo de funcionalidades já tem nós de Provider Registry, capacidades de Model e execução de Off-Peak; este plano acrescenta seeds de limpeza de abstrações de execução
  e invariantes, sem adicionar superfície de UI.

## 6. Planejamento e Poda de Casos de Uso

### 6.1 Dimensões Principais

| Dimensão                | Valores representativos                                       | Tratamento                            |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------- |
| Ciclo de vida do modelo | Atualização de Config antes/depois da criação                    | Obrigatório                           |
| Access                  | api-key / zhipu-account / execution-provided                     | Obrigatório                           |
| Forma da requisição     | generate / stream / retry                                        | Obrigatório                           |
| Origem da execução      | main / compact / subagent / off-peak                             | Cobertura representativa              |
| Provider API            | Anthropic / OpenAI Responses / OpenAI-compatible                  | Projeção obrigatória                   |
| Cliente/modo remoto     | desktop continuous / mobile replayable / remote workspace        | Regressão de invariantes, sem expandir o acúmulo de estado |
| Telemetry               | status / trace / usage                                           | Apenas regressão, sem projetar novo estado |

### 6.2 Decisões de Poda

- Não enumerar superfície de UI × Provider API: nesta rodada não modificamos a UI nem a geração de candidatos;
- Não enumerar Queue/Recovery × implementação do Adapter: não há mudança de estado ou de semântica de protocolo, apenas regressão da cadeia principal;
- Não criar um caso de uso por ID de modelo: a capacidade vem do Config e não é permitido hardcode de modelId;
- Não migrar literalmente cada teste unitário antigo do Adapter Registry; em vez disso, reorganizar os testes comportamentais por responsabilidade de rede preservada;
- Não criar um case catalog novo para Telemetry; apenas verificar que os eventos existentes não perderam campos-chave por causa da migração de tipos.

### 6.3 Casos de Aceitação Estáveis

| Case ID | Setup                                     | Action                            | Assertions                                        |
| ------- | ----------------------------------------- | --------------------------------- | ------------------------------------------------- |
| MAU-01  | Registry revision N cria o Model A        | Atualizar para N+1 e continuar requisitando A | API/Endpoint/Properties de A permanecem inalterados |
| MAU-02  | Registry já atualizado para N+1           | Criar o Model B                   | B usa N+1                                          |
| MAU-03  | Model com execution-provided              | Iniciar requisição sem Source     | Falha tipada antes da rede                         |
| MAU-04  | Model com execution-provided              | Renovar auth no Retry             | Só o auth muda; os fatos estáticos de execução permanecem |
| MAU-05  | Main/Compact/Subagent                     | Executar uma requisição em cada   | O Core passa apenas pelo Model, sem fallback de Adapter/Connection |
| MAU-06  | Capability de Image/PDF/Video             | Permitir/negar requisição        | Lê apenas Model.properties; as restrições de codificação do Adapter seguem valendo |
| MAU-07  | Persistência de ModelRef legado           | Restaurar dados históricos       | Converte para a semântica atual só na fronteira; o domínio deixa de guardar ModelRef |
| MAU-08  | desktop/mobile/remote representativo      | Executar uma requisição de modelo | Selection, filas e semântica de recuperação inalteradas |

Esses são Case IDs estáveis entre Todos. Os arquivos de teste unitário específicos e as asserções mais detalhadas vão em cada Todo; o E2E cobre apenas o que realmente atravessa
processos ou a regressão da cadeia principal existente, sem adicionar grandes E2E de UI para simples remoções de abstrações puramente TypeScript.

## 7. Regras de Implementação Unificadas para Cada Todo

1. Antes de começar, esperar ou evitar arquivos sobrepostos em árvores de trabalho paralelas;
2. Atualizar primeiro o spec/Todo correspondente, depois escrever o teste que falha;
3. Migrar primeiro a montagem de produção e os helpers de teste, depois remover a interface;
4. Não estender abstrações antigas com alias deprecated, `any` ou fallback de compatibilidade;
5. Cada Todo é aceito com a condição de zero via `rg`/`dep:refs`, testes unitários afetados, `pnpm typecheck`, `pnpm lint` e
   `pnpm fmt:check`;
6. Em princípio, cada Todo deve permanecer revisável de forma independente; quando houver dependência na mesma cadeia de fatos e troca atômica, eles podem ser
   combinados em um único Conventional Commit;
7. Se for necessário descobrir que mudar o estado de produto, a restauração de Protocol ou a semântica de Telemetry, parar aquele Todo e decidir separadamente, sem ampliar o escopo por conta própria.

## 8. Questões Subsequentes Ainda sem Número

As questões a seguir são conhecidas, mas a discussão de design item a item ainda não foi concluída e elas não entram nos Todos acima:

- Propriedade de longo prazo das credenciais dinâmicas do Account Provider e do refresh de headers de runtime;
- Refactor completo de Telemetry, Status, Context e Observation.

Esses itens serão discutidos um a um mais adiante. Antes da decisão, é permitido remover nos Todos anteriores código morto que já perdeu seus chamadores, mas não se pode inventar novas abstrações de
longo prazo nem alterar a semântica do produto.