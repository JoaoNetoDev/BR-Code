# Todo 69: Compatibilidade prática de rollback da refatoração de Provider

> Decisão complementar de escopo de banco de dados em 2026-09-10: a implementação posterior segue o [Todo109](./todo-109-database-migration-consolidation-and-rollback-readability.md), com o baseline antigo fixado em staging_backup@790884b1ce. Evitar dual-write na medida do possível, mas quando o conteúdo de uma tarefa/mensão/sessão não puder ser aberto após o rollback é preciso uma escrita de compatibilidade mínima necessária; perder configuração e ter que reselecionar é aceitável. Consolidar a migração de todos os bancos relevantes, preservando os campos/valores antigos e sem repetir a complementação de migração na leitura normal da nova versão. O antigo escopo deste documento de "nunca dual-write" e o de permitir que conteúdo individual fique ilegível não restringem mais esse trabalho de banco de dados; as evidências históricas e as decisões fora do banco de dados são preservadas.

> Atualização de atribuição de verificação (2026-09-09): as pendências de teste/falhas/promoções manuais remanescentes neste documento foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente neste documento; a evidência histórica é preservada e a transferência não significa que os testes passaram.

> Status: implementação e aceitação por fases concluídas (2026-09-03); o rollback completo do App antigo não foi executado e a extensão da evidência está no relatório de implementação.
>
> Atualização: 2026-09-03. Este documento substitui o plano anterior de dual-write contínuo em múltiplas áreas.
>
> Baseline de revisão: branch atual `eb8b9deee500` e o workspace; o alvo de rollback é somente `origin/staging@6e781fdd9029`.
>
> Decisão posterior de 2026-09-09: o usuário deixou claro que que campos antigos não podem ser apagados ou esvaziados por causa da adoção de uma nova seleção; os dois pontos de edição de Off-Peak e salvamento de Wiki precisam preservar os valores antigos, sem exigir dual-write reverso contínuo; para Session já foi decidido mudar para adicionar modelSelection em entry.data original preservando a identidade antiga / os campos de nível. O Markdown de Subagent segue as decisões de legibilidade e a migração de campos no diretório do usuário já decididas no [Todo97](./todo-97-subagent-markdown-in-place-migration-and-legacy-read-audit.md); listá-lo antes como item pendente de re-revisão foi um registro errado e foi revogado. Ver [Todo104 §6.18](./todo-104-pre-release-schema-review.md) (m2, antigo Todo99). Esses são complementos ainda a implementar, não alteram os fatos de verificação já existentes do Reader congelado deste documento nem restauram a gravação do arquivo original do Bot.

## 1. Objetivo e decisão final

Depois de voltar para a versão de staging acima, o App antigo consegue iniciar e os principais dados anteriores ao upgrade ainda abrem. Permite-se que mensagens, tarefas e seleções de modelo individuais criadas ou modificadas pela nova versão se degradem; não se exige que a versão antiga compreenda por completo a arquitetura atual de Provider.

Tratar apenas os problemas de compatibilidade críticos que fariam um arquivo, coleção ou App inteiro ficar ilegível, sem manter muito código antigo pela perda semântica de um único registro novo.

```text
Dados escritos pela versão atual
        |
        v
Reader real do staging
        |
        +-- pode ignorar campos/colunas/arquivos novos
        |      `--> não se adiciona escrita de compatibilidade
        |
        +-- afeta apenas uma mensagem ou tarefa nova
        |      `--> aceita a degradação explicitamente listada, sem se adicionar escrita de compatibilidade
        |
        `-- um registro novo faz o arquivo ou coleção inteiro ser rejeitado
               `--> corrige a fronteira de compatibilidade física
```

Escopo final:

- Provider Config, Session, Off-Peak, Automation, Account Settings, Subagent e Repo Wiki não fazem dual-write contínuo de campos antigos.
- SQLite mantém mudanças de Schema incrementais e anuláveis, sem executar downgrade destrutivo.
- **Bot Config e State são o único risco de falha de domínio inteiro determinado nesta revisão, e usam isolamento por versão de arquivo, sem dual-write contínuo.**
- Model/Reasoning são tratados junto com o registro a que pertencem, sem criar Encoder genérico de versão antiga, DTO de compatibilidade ou um segundo fato de modelo.
- A leitura de atualização unidirecional da versão atual sobre dados antigos precisa ser preservada; cancelar o dual-write de downgrade não significa apagar o Importer de atualização.

## 2. Fronteiras de leitura verificadas

Esta rodada confrontou o Writer atual com os nomes de arquivo, Schemas estritos, tratamento de nulos, parsing de listas e extensão de falha do commit de staging congelado. A tabela abaixo é fato de código e não usa mais "se a versão antiga não suportar" como base de implementação.

| Área               | Comportamento real de leitura do staging                                               | Degradação de rollback permitida                                     | Decisão           |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------- | -------------- |
| Provider Config    | Lê o antigo `config.json`; a versão atual só grava o novo `provider_config.json`          | Usa a configuração anterior ao upgrade e não vê as modificações de Provider/Template da nova versão  | Sem dual-write         |
| Session            | Já conhece `runtime/model_selection`; message, Part e Entry são leitura JSON tolerante | Metadados de modelo novo, Reasoning ou mensagens novas individuais podem degradar na exibição | Sem dual-write         |
| Off-Peak           | O antigo `model/thought_level` pode ser nulo e colunas extras não afetam a leitura                      | Tarefas novas podem usar o modelo default original do staging                | Sem dual-write         |
| Automation         | O antigo `model/provider/thought_level` pode ser nulo e colunas extras não afetam a leitura             | Tarefas e Runs novos não preservam com precisão a escolha congelada da nova versão              | Sem dual-write         |
| Account Settings   | Schema não estrito, ignora campos novos e dá valor default vazio para campos antigos ausentes               | A conexão de conta ou a seleção de pacote pode precisar ser refeita                 | Sem dual-write         |
| Subagent customizado    | O Frontmatter só lê campos conhecidos e não rejeita o arquivo inteiro por causa do novo `modelSelection`     | A seleção explícita de modelo no formato novo degrada para herdada ou default                   | Sem dual-write         |
| Estado de Subagent embutido | Seleciona campos de forma tolerante e ignora os campos novos de override de modelo                                   | O override de modelo é perdido e `disabledAgentIds` é preservado            | Sem dual-write         |
| Repo Wiki          | Reader novo e antigo fazem parsing tolerante do JSON                                          | O conteúdo do Wiki é legível e a regeneração pode exigir reseleção de modelo            | Sem dual-write         |
| Bot Config/State   | As Options antiga e nova no mesmo arquivo são ambas estritas, mas os conjuntos de campos são incompatíveis entre si               | Não se aceita que a configuração/estado inteiro do Bot seja rejeitado                     | Isolamento de arquivo versionado |
| Model/Reasoning    | Não há meio de persistência independente                                                   | Decidido junto com a área a que pertence                                     | Sem camada de compatibilidade genérica |

O que se prova aqui é que os campos relacionados à refatoração de Provider não serão rejeitados no domínio inteiro por um Reader antigo, e isso não equivale à aceitação completa em dispositivo real de inicialização, exibição e execução do App antigo. O registro de implementação precisa distinguir revisão estática, testes direcionados e evidência de rollback em dispositivo real.

### 2.1 Provider Config

O arquivo oficial atual é `provider_config.json`. O antigo `config.json` só é usado como entrada de atualização única; o Repository atual não o reescreve nem gera backup. O teste existente `packages/services/test/providerConfigRuntime.test.ts` — "importa `provider_config.json` do `config.json` antigo do mesmo diretório, sem reescrever o arquivo antigo e sem backup" — fixa esse fato.

Portanto, depois do rollback do staging continua-se usando a configuração anterior ao upgrade. Instâncias de Template, Providers e Personal Model Rules adicionados pela nova versão não são sincronizados de volta. É proibido restaurar uma dupla autoridade de configuração de Provider só porque alguns modelos novos não executam após o rollback.

### 2.2 Session

O staging congelado já definiu `runtime/model_selection`; o Session Store usa `JSON.parse` em `message.data`, `part.data` e `session_entry.data` e lê depois conforme o caminho de consumo, sem aplicar um Schema estrito novo/antigo mutuamente exclusivo sobre a Session inteira.

Os campos de identidade Provider/Model da Session Selection continuam legíveis, e o `options.reasoningLevel` atual pode ser ignorado pela versão antiga. Os novos metadados de modelo de User/Assistant/Timeline/Subtask também podem não ser entendidos pelos caminhos antigos de exibição ou execução, mas disso não se pode deduzir que o banco ou a lista inteira de sessões fica ilegível.

Não se adicionam os seguintes aliases de rollback:

- os antigos `model.providerID/modelID/variant` de User Message;
- os antigos `providerID/modelID/variant` de Assistant Message;
- os antigos campos de Selection de Timeline/Subtask;
- o antigo `thoughtLevel` de Session Entry.

A leitura de Sessions antigas pela versão atual, o reconhecimento de escolhas inválidas e a garantia de histórico abrável são tratados pelo Todo 70, e este Todo não se expande para dual-write.

### 2.3 Off-Peak

O `off_peak_tasks` atual ganhou um `model_selection` anulável, preservando as colunas antigas. A lógica de criação atual grava:

```text
model_selection = ModelSelection completo
model            = NULL
thought_level    = NULL
```

O tipo Row e o `rowToTask()` do staging congelado aceitam explicitamente as colunas antigas nulas, mapeando-as separadamente como `undefined`. Portanto, mesmo que `list()` faça direto `map(rowToTask)`, essas linhas novas não derrubam a lista por falta dos campos de modelo antigos.

O caminho de dispatch do staging só usa os campos de modelo antigos quando eles existem e, caso contrário, segue sua própria lógica default existente. Depois do rollback, tarefas novas podem deixar de usar o Provider/Model/Reasoning exatamente selecionado antes; essa é a degradação explicitamente aceita nesta rodada, sem dual-write de `model/thought_level`.

Atenção à diferença de direção: linhas antigas sem o `model_selection` atual fazendo a **versão atual** falhar na recuperação é um problema de Decoder de atualização/tolerância de recuperação, e não um motivo para exigir dual-write reverso do Writer atual.

### 2.4 Automation

O `automations` atual também preserva colunas antigas anuláveis e ganha um `model_selection` anulável; em tarefas novas os antigos `model/provider/thought_level` ficam nulos. O Reader do staging congelado faz mapeamento de compatibilidade de nulo nessas colunas e consegue carregar a lista.

Depois do rollback, tarefas novas podem adotar o modelo default do staging, e `automation_runs.model_selection` também não pode ser compreendido com precisão pela versão antiga. Não se implementa um mapeamento reverso do ID de Provider do Registry atual para a enumeração antiga de Provider do Agent, nem se faz dual-write das colunas de modelo antigas.

### 2.5 Account Settings

O campo atual é `providerFamilyConnectionSelections`; o staging usa `modelProviderFamilyModes/modelProviderFamilySelectedKeys`. O Schema de Settings do staging congelado não é estrito, ignora campos novos e usa objeto vazio como default para campos antigos ausentes, então o Settings inteiro continua carregável.

Depois do rollback o usuário pode precisar escolher de novo a conexão de conta. Uma gravação posterior de Settings pelo staging também pode remover campos novos que ele não conhece, exigindo nova escolha no próximo upgrade. Isso é uma degradação de configuração reconstruível, e não se mantém uma projeção reversa contínua das escolhas antigas e novas de Family.

### 2.6 Subagent

O Parser de staging do Markdown de Agent customizado só seleciona campos conhecidos de Frontmatter, ignora o `modelSelection` atual e não rejeita o Agent inteiro por causa disso. A seleção de modelo pode degradar para herdada ou default.

O Reader de staging de `agents-state.json` também apenas faz parsing tolerante e seleção:

```text
staging                              versão atual
-------                              --------
builtInModelOverrides                builtInModelSelectionOverrides
builtInThoughtLevelOverrides
disabledAgentIds                     disabledAgentIds
```

Portanto, o estado de desativação dos Agents embutidos continua legível, o override de modelo atual é ignorado pelo staging e isso não faz o conjunto inteiro de Agents desaparecer. Nenhum dos dois armazenamentos faz dual-write de campos de modelo antigos.

### 2.7 Repo Wiki

O `repoWikiStorage.ts` usa `JSON.parse` tolerante para Wiki e Draft, e não um Schema estrito novo/antigo mutuamente exclusivo. Depois do rollback o corpo do Wiki continua legível e, quando o `modelSelection` atual não é reconhecido, a regeneração pode usar o default antigo ou exigir nova escolha.

Não se gera reversamente `generationModel/generationOptions.thoughtLevel`.

### 2.8 Bot: a exceção dura determinada

A versão atual e o staging usam `bot-config.json` e `bot-state.v2.json`. Mas `botCurrentOptionsSchema/botDraftOptionsSchema` são `.strict()`:

```text
Options do staging                Options atuais
---------------                    ------------
model / thoughtLevel               modelSelection
mode / ...                         mode / ...
```

Depois que a versão atual grava o mesmo arquivo na estrutura nova, o staging rejeita o arquivo por causa do `modelSelection` desconhecido. O Repository dele então faz fallback do Bot Config para vazio e do Bot State para o arquivo legacy ou estado vazio. Isso afeta todos os dados do Bot, não apenas a perda de uma escolha nova.

Gravar campos novo e antigo ao mesmo tempo é inútil: o staging rejeita os campos novos e o Schema estrito atual também rejeita os campos antigos. É preciso isolar arquivos físicos.

Verificação adicional: o Bot Model Cache Repository já foi removido e `bots-model-cache.v2.json` não é mais gravado; o cache antigo fica intocado e o staging pode continuar usando, sem necessidade de um novo plano de compatibilidade de cache.

## 3. Design mínimo de implementação do Bot

```text
Arquivos anteriores ao upgrade (não são mais reescritos)
├─ bot-config.json
└─ bot-state.v2.json
          |
          | importação unidirecional quando o arquivo v3 correspondente não existe
          v
Arquivos da versão atual
├─ bot-config.v3.json
└─ bot-state.v3.json
          |
          `--> única autoridade lida e escrita pelo Repository atual

Rollback para o staging
└─ continua lendo os arquivos antigos anteriores ao upgrade, sem conhecer nem tocar os v3
```

Requisitos de implementação:

1. Config e State precisam de isolamento por versão; não se pode migrar só o State e esquecer o Config estrito.
2. O nome do arquivo e a versão do conteúdo sobem juntos para v3.
3. Quando o arquivo v3 correspondente não existe, lê-se a partir dos arquivos antigos existentes, reutilizando a conversão unidirecional e gravando o v3; os arquivos antigos não são reescritos nem apagados.
4. Depois que o v3 existe, não se completa, corrige nem sobrescreve o dado atual a partir dos arquivos antigos; um arquivo atual corrompido não pode fazer fallback silencioso para configuração velha.
5. Sem arquivo antigo, começa-se normalmente com um v3 vazio, sem criar uma cópia falsa da versão antiga.
6. Criar, editar e apagar Bot e atualizar Draft/State gravam apenas o v3.
7. Campos de modelo antigos determináveis são convertidos para o ModelSelection atual; escolhas não determináveis ficam vazias, os dados principais do Bot são preservados e nenhum Provider é adivinhado.
8. Reutiliza-se o mecanismo existente de escrita de arquivo e a fronteira de Repository, sem adicionar transação distribuída entre os dois arquivos nem agendador genérico de dual-write.

"Reutilizar a conversão unidirecional" não significa chamar `bots/storageMigration.ts` como está: o `findUniqueProviderByModel` existente procura outros Providers por nome de modelo quando o Provider antigo não bate, e o `migrateDraftOptions` ainda deixa o `thoughtLevel` antigo sobrescrever o `modelSelection.options.reasoningLevel` novo já existente. Essas duas lógicas antigas precisam ser removidas/corrigidas antes de conectar o v3, substituídas pela conversão de identidade explícita do Todo 72; uma escolha nova existente só reconhece os próprios campos e, quando não determinável, fica vazia, sem mudar o roteamento por nome de modelo.

Os arquivos antigos são um snapshot anterior ao upgrade, e não uma cópia sincronizada. Depois do rollback o usuário vê a configuração e o estado dos Bots de antes do upgrade; Bots adicionados, apagados ou modificados durante o uso da nova versão não têm garantia de aparecer na versão com rollback. Essa é uma fronteira de produto explicitamente aceita.

A primeira importação pode completar o outro arquivo v3 ainda não gerado na inicialização seguinte; esse tipo de importação única não pode ser implementado por engano como gravação contínua a cada salvamento.
A gravação de cada arquivo continua usando o mecanismo de escrita segura já existente, e a falha não é disfarçada de sucesso.

O contexto de importação é injetado pela camada de montagem do serviço: a configuração default de um Bot comum usa o modelo do Host proprietário e a conexão atualmente conectada; um estado antigo com `workspaceIdentity` só pode usar os fatos de modelo daquele remoto e não pode explicar um Coding Plan antigo com a conta local.
Se o remoto estiver inacessível na ocasião, ou não houver contexto de conta obtenível, os vínculos não confirmados ficam vazios e o estado principal é importado normalmente.
Erros de parsing/IO dos arquivos novos são expostos ao chamador, sem reler os arquivos antigos e sem reescrever o arquivo corrompido como vazio.

## 4. Restrições de escopo e relação com os Todos adjacentes

As mudanças de produção ficam restritas ao isolamento de arquivos de Bot Config/State e à sua entrada de atualização unidirecional. As outras áreas mantêm a leitura de atualização unidirecional atual, sem nova escrita de downgrade.

Proibido:

- sincronização reversa de Provider Config;
- gravação contínua de aliases antigos em Session, Off-Peak, Automation, Settings, Subagent e Repo Wiki;
- transformar silenciosamente o nível de Reasoning para compatibilidade ou adivinhar o Provider antigo do Agent;
- Encoder genérico de Selection da versão antiga, DTO de compatibilidade ou uma segunda autoridade de Config/Registry;
- cópia de banco inteiro ou migração de downgrade destrutiva do SQLite;
- a versão atual lendo continuamente arquivos antigos congelados para reparar dados atuais.

```text
Todo 69: versão atual -> rollback de downgrade para staging
└─ evita que dados do domínio inteiro sejam rejeitados por um Reader antigo; o ponto duro atual é o isolamento de arquivos do Bot

Todo 70: Session antiga -> atualização e recuperação na versão atual
└─ julgamento de campos novo/antigo, migração confiável, Selection inválida e abertura do histórico

Todo 71: Composer -> Submission dentro da versão atual
└─ rascunho persistente e estado de envio, sem assumir dual-write de campos entre versões

Todo 72: configuração de Provider e seleção persistidas antigas -> identidade atual
└─ corrige categorias embutidas, migra apenas a API Key Built-in e converte a identidade antiga de Coding Plan pela conexão atual no momento da migração
```

As regras de identidade de atualização estão no [Todo 72](./todo-72-legacy-builtin-provider-and-model-selection-migration.md), incluindo a conversão de identidade necessária para a importação única do Bot; isso não amplia o escopo de compatibilidade de downgrade deste documento nem restaura dual-write contínuo.

O escopo de dual-write original do Todo 69 é cancelado, sem revogar os princípios de atualização já confirmados: quando a estrutura atual existe não se completa valor a partir de campos antigos; só registros realmente antigos permitem um Decoder determinístico; quando não dá para recuperar com confiabilidade, reporta-se conforme a área a que pertence ou entrega-se ao usuário para correção.

Nada muda no Registry de Provider/Model, Account Family, fila, ciclo de vida da Selection ou em qualquer cadeia de execução. As chamadas local e remota do Bot continuam passando pelo mesmo Repository, e não se pode reintroduzir bypass de arquivo antigo no Remote/Bot Bridge.

## 5. Testes e aceitação

### 5.1 Bot com testes primeiro

- Usando Config/State representativos do staging congelado como entrada, provar o conflito strict de mesmo arquivo antes da importação.
- A primeira inicialização gera o v3 e os dados principais do Bot e a Selection determinável são convertidos corretamente.
- Depois de criar, editar e apagar Bot na versão atual e de atualizar Draft/State, os bytes dos dois arquivos antigos permanecem inalterados.
- Quando o v3 já existe, não se relê o arquivo antigo para completar valores; a leitura e escrita atuais do v3 seguem o Schema estrito atual.
- Quando só um entre Config/State foi gerado, a inicialização seguinte importa apenas o que falta e não sobrescreve o que já existe.
- A Selection de um Bot antigo isolado não ser conversível não derruba os outros Bots nem perde a configuração principal.
- Mesmo que apenas outro Provider ofereça um modelo com o mesmo nome, a escolha antiga não é migrada para ele; quando a Selection atual conflita com o thoughtLevel antigo, o valor atual não muda.
- Ler os arquivos antigos preservados com o strict Reader do staging congelado obtém os dados do Bot de antes do upgrade.
- Com os arquivos antigos ausentes, a configuração atual vazia é criada normalmente, sem gerar cópia antiga.

Apenas fixa o contrato de leitura necessário do staging atual, sem estabelecer um framework de compatibilidade de múltiplas versões e sem exigir recuperação reversa de modificações de Bot da nova versão.

### 5.2 Validação mínima das outras áreas

- Reutilizar os testes de Provider Config para provar que o antigo `config.json` não muda.
- Usar o Row Reader de Off-Peak/Automation do staging para verificar que linhas novas representativas com colunas de modelo antigas nulas são legíveis; não se exige obter a escolha nova precisa.
- Confirmar que as novas colunas SQLite são colunas nulas que a versão antiga consegue ignorar e que nenhuma tabela/coluna antiga sofre remoção destrutiva.
- Para Session, Settings, Subagent e Wiki, usar entradas representativas com campos novos e verificar que a entrada de leitura antiga não rejeita o domínio inteiro; preferir a reutilização dos testes existentes e só complementar as fronteiras sem evidência direta.
- Não adicionar um teste de "todos os valores de modelo novos e antigos precisam ser semanticamente equivalentes", que não é o objetivo deste Todo.

### 5.3 Verificação completa

- Testes direcionados de Bot, Services e camada adaptadora de armazenamento afetados;
- `pnpm typecheck`;
- `pnpm lint`;
- Verificação de formatação dos arquivos modificados nesta rodada e `git diff --check`;
- Smoke de rollback em diretório temporário do tipo "versão atual importa e modifica Bot -> staging Reader lê o arquivo antigo congelado".

Não fazer testes de rollback destrutivos no diretório real do usuário, em conta de Bot ou em banco de dados em execução. Sem ter executado a inicialização em dispositivo real do App antigo, o registro de implementação só pode declarar Reader/storage smoke aprovado e não pode alegar aceitação de ponta a ponta do App antigo.

## 6. Ordem de implementação e critérios de conclusão

Ordem de implementação:

1. Conferir o alvo de staging congelado e adicionar os testes de falha do Bot.
2. Conectar a conversão de identidade de Provider já testada do Todo 72 e só então implementar o Schema, o caminho e a Import única dos dois arquivos v3.
3. Consolidar todas as entradas atuais de leitura e escrita do Bot e confirmar que os arquivos antigos não mudam.
4. Executar a regressão mínima das demais áreas e confirmar que nenhum dual-write contínuo foi introduzido.
5. Atualizar o registro de implementação, as degradações de rollback permitidas e os resultados de verificação e então commitar.

A ordem conjunta está no Todo 72: sua base de conversão de identidade vem antes da aceitação da primeira importação do Bot, e as demais entradas de persistência são conectadas depois.
Não se gera primeiro um v3 com identidade errada para depois consertar por migração; a fronteira de que, uma vez existente, o v3 não relê os arquivos antigos permanece.

Critérios de conclusão:

- O Bot atual tem o v3 como única autoridade, os arquivos antigos anteriores ao upgrade nunca mudam e o staging não rejeita mais todos os dados do Bot por causa de campos novos.
- Fora do isolamento de versão do Bot, nenhum dual-write contínuo nem abstração de compatibilidade genétrica foi adicionado.
- A leitura de atualização unidirecional atual não foi apagada por engano ao reduzir o escopo de rollback.
- A estrutura física do SQLite permanece incremental e compatível.
- Todas as degradações permitidas de registro individual e de configuração reconstruível estão listadas aqui.
- Testes direcionados, tipos, Lint, formatação e verificação de diff passam; o estado da verificação em dispositivo real é registrado com fidelidade.

## 7. Índice de evidências de código desta rodada

Os caminhos abaixo têm como base o commit congelado no topo desta seção, e mudanças posteriores de linha faute de refatoração não afetam o contrato de leitura:

| Área       | Principais caminhos de evidência                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider   | `packages/services/src/model-provider/providerConfigRuntime.ts`; `packages/services/test/providerConfigRuntime.test.ts`                                       |
| Session    | `apps/zcode-cli/packages/adapters/src/storage/session-store/codecs.ts`; `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`              |
| Off-Peak   | Schema, create e rowToTask/list de `packages/services/src/session/offPeakTaskRepo.ts`                                                                          |
| Automation | Schema, create e rowToAutomation/list de `packages/services/src/session/automationRepo.ts`                                                                     |
| Settings   | `packages/shared/src/validationAppSettings.ts`                                                                                                                |
| Subagent   | `packages/services/src/subagents/subagentMarkdown.ts`; `packages/services/src/subagents/subagentsService.ts`                                                  |
| Wiki       | `packages/services/src/repo-wiki/repoWikiStorage.ts`                                                                                                          |
| Bot        | `packages/shared/src/bots.ts`; `packages/services/src/bots/config.ts`; `packages/services/src/bots/repo.ts`; `packages/services/src/bots/storageMigration.ts` |

A evidência de implementação está no [relatório de implementação 68–72](./68-72-implementation-report.md). O v3 do Bot, a importação única e a preservação dos arquivos antigos já foram implementados; o estado antigo não é mais reescrito por um Service em execução. A aceitação de rollback é a fronteira de leitura estrita/de bytes de arquivo, e não uma aceitação completa do App antigo em dispositivo real.