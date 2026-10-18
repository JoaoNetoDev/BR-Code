# Roadmap de migração da refatoração de Provider

> Status: planejamento de trabalho
>
> Última atualização: 2026-08-24
>
> Fase atual: M4 e os Todos de limpeza conhecidos concluídos; em execução a verificação final em
> escala total do Provider Refactor

## Estratégia de migração

A migração converge gradualmente para cima ao longo da cadeia principal de chamada de modelo: primeiro
unifica a interface de execução do modelo, depois organiza o Registry e as fontes de Provider e,
por fim, converge Submission, configuração e propriedade de Environment.

Cada fase pode ser dividida em múltiplos fatias de código mescláveis, mas, ao fim da fase, não pode
sobrar semântica de negócio paralela. O sistema antigo só pode entrar nas novas abstrações por uma
entrada de compatibilidade explícita e única.

## Visão geral das fases

| Fase     | Tema                                          | Status                                                     | Marco de conclusão                                                                                                 |
| -------- | --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| M0       | Arquitetura macro e mapa da situação atual    | Primeira rodada concluída                                   | O objetivo de trabalho e os principais bifurcamentos históricos foram registrados em disco                                               |
| M1       | Model e ModelRequest                          | Concluída                                                    | Todas as chamadas de modelo de produção usam o Model unificado                                                                     |
| M2       | Configuração de Provider, Registry e criação de Model | Concluída, servindo de fatiabase para o Merge Request atual de M3 | A configuração de três camadas e a criação comum de Model entraram na cadeia unificada; Snapshot antigo, fallback de Workspace Provider Catalog e código morto saíram |
| M3       | Cutover da arquitetura de Provider e fechamento do formato de Model | Concluída                                  | Config/Registry, Submission atômico, seleção de modelo, página de configurações e formato de entrada/saída formam uma cadeia de produção única                   |
| M4       | Cadeia de execução de modelo, tarefas ociosas e Subagent | Concluída                                                | Tarefas ociosas usam o Provider hidden completo, o mesmo Registry/ModelFactory e autenticação em tempo de requisição, sem alterar o Session Selection                     |
| M5       | Fronteira de armazenamento de Config e montagem Built-in | Escopo do Provider Refactor concluído                    | O invólucro de armazenamento foi privatizado; Built-in/Personal/Selection são montados apenas pelo Source/Repository oficial                        |
| M6       | Account Provider                              | Escopo do Provider Refactor concluído                     | Seleção estruturada, Account Overlay, Access completo e autenticação em tempo de requisição formam uma cadeia única                            |
| Tópico independente | Configuração de Environment e Provisioning  | Fora deste Provider Refactor                               | Configurações remotas, login, sincronização de configuração e as capacidades de produto do Environment de alvo são desenhadas à parte           |

A ordem das fases pode ser ajustada levemente conforme os fatos da implementação. Ao ajustar, atualize
este roadmap e o Working Memory; não crie código temporário só para preservar a numeração.

## M0: arquitetura macro e mapa da situação atual

O M0 estabeleceu a linguagem de trabalho atual:

```text
事实来源
    -> Provider 构造
    -> Registry 聚合
    -> Model
    -> ModelRequest
```

Também concluiu a primeira rodada de investigação de Runtime, Registry, Provider Options, Reasoning,
Plan, tarefas ociosas, Subagent e chamadas de modelo periféricas.

Depois do M0, apenas novas evidências de fato são acrescentadas, sem carregar detalhes de
implementação.

## M1: Model e ModelRequest

> Concluído em 2026-08-12, integrado ao `staging` pelo MR !2006.

O M1 colocou todas as chamadas de modelo de produção sob uma fronteira pública final única. O objetivo
da fase era unificar "como o modelo é chamado", sem exigir ao mesmo tempo a refatoração final do
Registry e das fontes de Provider:

```text
Model
├─ Properties
├─ Option Specs
├─ Options
├─ bind()
├─ generateText()
└─ streamText()
```

Principais fatias:

1. M1.1: fixar os tipos (incluindo ModelResult / ModelEvent), estabelecer o Model Adapter Wrapper e
   testes unitários.
2. M1.2: migrar o Agent Loop principal, o Automatic Compact, o Usage e o Trace.
3. M1.3: migrar o Child Agent, Title, o verifier de Goal e o Project Memory.
4. M1.4: migrar Git, generateText do workspace, WebFetch e WebSearch.
5. M1.5: migrar o Repo Wiki.
6. M1.6: remover a leitura, pelos chamadores de negócio, do estado de model do Runtime, das options de
   Provider, do ModelPort e dos clientes de Provider independentes.

O Runtime, o Registry, o Plan e as entradas temporárias de modelo existentes entram na nova cadeia
por uma Model Factory de compatibilidade única. O M1 não exige refatorar ao mesmo tempo o Registry
Service, o Builtin Provider, a página de configurações, o Submission atômico ou o refresh de
configuração, mas o novo Model precisa conseguir absorver essas entradas existentes.

Ao fim do M1, todas as chamadas de modelo de produção usam `Model.generateText()` ou
`Model.streamText()`. São permitidos merges parciais dentro da fase; o fim da fase não mantém clientes
de modelo de negócio paralelos.

## M2: configuração de Provider, Registry e criação de Model

O plano de implementação do M2 está em
[`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md), e o design objetivo em
[`../design/registry/registry.md`](../design/registry/registry.md). A Config de três camadas do
Provider comum de longo prazo, a agregação do Registry, a criação de Model e as principais montagens
de produção já foram concluídas, e o resultado da aposentadoria está em
[`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md). Essas
mudanças servem de fatiabase para a branch de implementação do M3 e são concluídas junto com a
Submission, o estado de seleção e a página de configurações em um cutover único.

A investigação sobre agregação do Registry, notificação e cadeia de refresh cross-process no início
do M2 está em [`../research/m2-registry-aggregation-and-refresh.md`](../research/m2-registry-aggregation-and-refresh.md).

O M2 converte a montagem de compatibilidade da primeira fase no Registry oficial:

```text
ProviderConfigService
├─ ZCode Built-in Provider Config
├─ Account Provider Config
├─ Personal Provider Config
├─ ZCode Built-in Model Config Rules
└─ Personal Model Config Rules
                   |
                   v
            ProviderRegistryService
                     ├─ Provider[] / { modelId, config: ModelConfig }[]
                     └─ createModel(selection)
                                  |
                                  v
                             ModelFactory
                                  |
                                  v
                                Model
```

Problemas principais:

- Semântica de cobertura ordenada e campo a campo de ProviderConfig e ModelConfigRules.
- O Account Source produz Account Provider Config e, após o Built-in e antes do Personal, insere o
  `accessId` e os `models` de account-kind.
- As Views de Provider/ModelConfig do Registry, os índices de consulta, a notificação de mudanças e o
  ciclo de vida dos objetos.
- Views dedicadas da Facade de configurações e da Facade de seleção de modelo.
- ModelFactory, Adapter e dependências de autenticação dinâmica.
- A cadeia de refresh de escrita das configurações, de modificação de arquivos externos e de
  atualizações oficiais.
- Reuso de resolução de Runtime Model de transição e ModelFactory para tarefas ociosas, com o ciclo de
  vida restrito a uma única execução.

Após o M2, o Agent Loop obtém o Model atual do Registry de nível de processo; uma atualização cria um
objeto novo e o Loop antigo continua segurando o Model antigo.

O M2 só estabelece as fronteiras necessárias para que o Account Provider e a cadeia de transição de
tarefas ociosas possam entrar no ModelFactory unificado, preservando o comportamento da época.
A identidade, os benefícios, as credenciais dinâmicas e o estado de refresh do Account Provider são
refatorados no M6; a semântica de submissão e de ciclo de vida de tarefas ociosas e Subagents é fechada
no M4, que remove essa cadeia de Runtime Model de transição.

## M3: cutover da arquitetura de Provider

O plano de implementação completo está em
[`03-provider-architecture-cutover.md`](./03-provider-architecture-cutover.md), e a semântica objetivo
em [`../design/interaction/interaction.md`](../design/interaction/interaction.md) e
[`../design/registry/settings.md`](../design/registry/settings.md).

O M3 combina a base Config/Registry já concluída no M2 com o Submission atômico, o estado de seleção
de modelo, a página de configurações de Provider e o formato de entrada/saída de Model em um cutover
completo. A implementação está concentrada na mesma branch de integração, mantendo internamente áreas
de commit e revisão com responsabilidades claras.

A cadeia principal de interação troca o atual "primeiro troca o modelo e depois envia o texto" por um
Submission atômico:

```text
Submission
├─ prompt
├─ attachments
├─ mode
└─ modelSelection
```

Ao mesmo tempo é preciso convergir o Composer Draft, o App Recent, o Session Selection, a Queue,
Guide/"立即", Edit, Retry, o Prompt CLI e a TUI na semântica de modelo, concluir o salvamento
automático da página de configurações, a reordenação e os testes oficiais de conectividade de Model, e
remover o ModelRef, o estado de modelo mutável compartilhado do Runtime e o Connectivity Probe
independente.

A Session persiste apenas a Selection. Quando o Submission inicia um novo Agent Loop, o Model é obtido
do Registry e as Options são vinculadas.

O M3 é concluído em um único MR grande. Dentro da fase a revisão é dividida por Config/Registry,
Submission, CLI admission, aposentadoria do ModelRef, Settings Service, Settings UI, Connectivity,
Model Format e testes de limpeza; no fim nenhuma das áreas encerra isoladamente com semântica de
dois trilhos de longo prazo.

## M4: cadeia de execução de modelo, tarefas ociosas e Subagent

O design oficial da fase está em [`04-model-execution-cutover.md`](./04-model-execution-cutover.md), e
a semântica objetivo de longo prazo em
[`../design/execution/execution.md`](../design/execution/execution.md).

O M4 não cria tipos especiais de Model; ele fecha as tarefas ociosas na cadeia comum de execução de
modelo:

- `builtin:offpeak-idle-plan` passa a ser um Built-in Provider completo com `visibility: "hidden"`;
  hidden afeta apenas a página de configurações e o seletor de modelos.
- O Provider usa `access.type = "request-auth"`, com a autenticação dinâmica injetada em cada
  requisição e falha antes da requisição de rede quando ausente.
- O Submission ocioso carrega uma ModelSelection padrão e um execution context estreito, criando o
  Model pelo mesmo Registry/ModelFactory.
- A execução ociosa não escreve App Recent, Configured Default, Session Selection nem Queue comum e,
  portanto, não tem etapa de restauração.
- Após a aprovação ou negação de permissão, o turno automático continua usando o Provider ocioso, sem
  handoff de Provider.
- O Child Agent ocioso em primeiro plano usa a seleção e o contexto de acesso ociosos e cria o Model
  por conta própria; o Child Agent em segundo plano é explicitamente recusado.
- Override de Subagent comum, Goal, Background, Guide e Compact mantêm sua própria posse de Selection.

O M4 remove o `executionOnly` não publicado, o Provider Overlay do Runtime e o `setModel` temporário;
não cria interface especial de criação de Model, uma segunda vinculação de modelo nem um segundo
Registry.

## M5: fronteira de armazenamento de Config e montagem Built-in

O Provider Refactor já concluiu a fronteira de armazenamento físico e a montagem Built-in da
configuração dentro de um único Environment:

- Persistência da configuração Personal e escuta de modificações externas.
- Entrada da configuração ZCode Built-in no Registry pelo arquivo de publicação único, pelo Node
  Source, por watch/revision e pela montagem na inicialização de Desktop/CLI.
- Host, Prompt CLI e TUI usando a mesma implementação de leitura/escrita de configuração dentro de seu
  próprio Environment de destino.
- Migração e limpeza da configuração antiga do CLI e da Config do Environment atual.

A compatibilidade da configuração antiga fica concentrada na fronteira de leitura do Storage e não
entra na resolução do Registry nem na criação de Model.

O Provisioning cross-Environment, a sincronização de configuração do local para o remoto, a edição
remota e o login remoto são um tópico de produto independente e não são condição de conclusão do M5 nem
deste Provider Refactor.

## M6: Account Provider

As fronteiras estática e dinâmica estão em
[`../design/environment/environment.md`](../design/environment/environment.md) e
[`../design/registry/model-creation.md`](../design/registry/model-creation.md).

Esta refatoração já concluiu a cadeia de identidade e de estado de execução do Start Plan, do
Individual Coding Plan e do Team Plan:

- As Settings salvam uma seleção estruturada de conexão.
- O Account Resolver produz um Account Overlay a partir do `family + planKind` declarado pelo Built-in
  Provider.
- O Registry/Active Model fixa o Account Access completo.
- O Request Auth resolve o material dinâmico em cada requisição e valida que a conta atual ainda
  corresponde ao Access.
- Off-Peak e Official MCP reutilizam o mesmo Account Access e não resolvem mais a antiga string key.
- Os membros de modelo retornados pela API de Account restringem apenas o Account Provider
  correspondente e não se tornam uma fonte de fato independente de Model Config.

Lógica de produto como compra de pacote, cota e autorização final de serviços remotos continua
pertencendo a seus serviços originais e não faz parte do fato estático de Provider.

## Tópico independente posterior: configuração de Environment e Provisioning

Este tópico não pertence a este Provider Refactor e não é condição de conclusão do M4 nem de todo o
Provider Refactor.

A semântica objetivo está em [`../design/environment/environment.md`](../design/environment/environment.md).

Os Environments Local, SSH e Cloud acabam salvando e executando cada qual sua configuração de Provider:

```text
Entry
  |
  v
Target Environment
├─ Provider facts
├─ Registry Service
└─ Agent execution
```

A sincronização de configuração é uma operação explícita e não se torna uma dependência online das
requisições de modelo. O Management Service publica o Catalog e as informações de gerenciamento, e o
Environment continua capaz de rodar com a configuração existente mesmo quando ele está offline.

## Restrições entre fases

- Novas abstrações usam a semântica final e não criam tipos de transição de longo prazo.
- A lógica de compatibilidade fica concentrada no lado que ainda não foi migrado.
- Um novo chamador não pode ler simultaneamente o novo Model e o estado antigo de Runtime/Registry.
- O Usage, o Trace e os erros de cada Model Request precisam ser atribuídos ao Model real.
- Quando o protocolo de comandos compartilhados mudar, faz-se apenas uma confirmação de regressão
  representativa de que a Desktop continuous, a Mobile replayable e a Remote Workspace identity não
  foram afetadas por engano; esses mecanismos de entrega e restauração não pertencem ao Provider
  Refactor.
- Cada fatia atualiza primeiro o design da fase e os testes e só então implementa o código.
- Concluída a fase, atualiza-se o documento correspondente da fase, o Roadmap e a entrada geral do
  Working Memory.