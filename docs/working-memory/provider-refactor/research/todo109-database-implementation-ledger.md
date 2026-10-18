# Ledger de implementação do banco Todo109

> Linha de base da implementação: `dfce309227`; linha de base do formato antigo `staging_backup@790884b1ce`. 2026-09-10: implementação, regressão de armazenamento e as aceitações-chave de desktop Pro concluídas; as limitações de verificação conjunta em máquina real para remoto/celular estão na seção D e não se alega aprovação de aceitação em todas as plataformas.

## A. Contrato de armazenamento do Agent e conclusões por tabela

Os SQLs existentes de 0001–0019 são mantidos como estão; o novo `0020_provider_model_selection` foi
adicionado com transformação de dados SQL fixa (sem estender as dependências de conta do runtime nem
alterar checksums históricos). A migração primeiro fixa a seleção atual das sessões antigas e só depois
preenche os novos membros das mensagens/Parts históricos, evitando que a transformação das mensagens
mude a verificação da origem da seleção atual.

| Tabela                                                       | Conclusão comparativa/operação desta rodada                                                                                                    | Status de verificação                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| session_entry                                             | runtime/model_selection ganha modelSelection; todos os membros antigos de data e os metadados são preservados. Outros tipos de entry permanecem | asserções na base original, recuperação e Pro aprovados |
| message                                                    | user.model → modelSelection; assistant providerID/modelID/variant → providerId/modelId/reasoningLevel; a origem histórica não muda a identidade; membros antigos preservados | base original, Reader antigo congelado, update/fork aprovados |
| part                                                       | timeline guarda à parte fromModelSelection/toModelSelection; subtask guarda à parte modelSelection; objetos antigos não são sobrescritos | base original, Reader antigo congelado, update/fork aprovados |
| session_input                                             | O modelSelection/mode não registrado no payload antigo permanece ausente; não há campo antigo a transformar                                             | proteção de toda a tabela, recuperação de protocolo aprovados |
| model_usage                                               | Ajuste do nome em TS; SQL provider_id/model_id/variant inalterados; origem histórica e estatísticas não mudam                                         | proteção de linha inteira original aprovada            |
| turn_usage、tool_usage                                    | O uso de Turn/ferramentas e as associações não mudam por causa do Refactor de Provider                                                                   | proteção de linha inteira e de FK original aprovada   |
| local_setting                                             | Linhas antigas do reasoningLevel global obsoleto são preservadas e não migram para uma Seleção explícita de Sessão                                         | proteção de linha inteira original aprovada            |
| session、todo、permission、input_history                   | Contrato de persistência inalterado; conteúdo, IDs, relações, tempo ou ordem não são modificados                                                          | proteção de linha inteira e de FK original aprovada   |
| session_target                                            | O formato de armazenamento alvo não muda por causa do Refactor de Provider; o estado de execução não é alterado                                             | proteção de linha inteira original aprovada            |
| workflow_definition/run/activity/event、session_task_link | JSONs como opts/result são salvos como estão; link.model é um registro de execução existente e não é renomeado em massa                    | proteção de linha/FK original aprovada; revisão de produção/consumo concluída |
| dwf_run/actor/node/event                                  | Mantém o journal independente da 0019, resolved_model e as ligações; o motor não é implementado antecipadamente                                        | proteção de linha inteira e de FK original aprovada   |
| schema_migration                                          | Acrescenta a 0020; a 0019 e SQLs/ledger/checksums anteriores ou iguais ficam inalterados                                                                    | toda a tabela, reabertura repetida e testes de falha aprovados |

### Contrato do novo Reader / Writer

```text
abertura do banco -> migration 0020 -> Reader atual -> interfaces normais de histórico/execução
campos antigos     -> apenas migration e Reader de rollback
config nova ausente-> conteúdo normal legível, a config exigida pela execução é verificada pelas entradas existentes
```

- O adapter SQLite desembrulha os novos membros de Part para fromModel/toModel/model da Port lógica
  existente; a camada de runtime não toca em campos antigos. A legibilidade precisa tolerar a ausência de
  toModel e não forja string vazia de Provider.
- O novo User/Assistant consome apenas os membros novos; campos de configuração antigos não servem como
  fallback de leitura. Ao salvar linhas antigas, os membros antigos originais são preservados e o snapshot
  antigo não é atualizado continuamente; se registros novos precisam de campos mínimos antigos, isso é
  decidido pelos testes com Reader congelado.
- Remover o migrateLegacyModelSelection por sessão no SessionStorePort e sua chamada na recuperação do
  bootstrap. A migração é delimitada pela versão do banco, não por cada recuperação.
- O SQL de migidação tem como alvo registros com origem antiga bem definida; identidades builtin
  desconhecidas não são vinculadas e mantêm a origem original. Origens de modelo históricas comuns não
  precisam consultar Registry/Account.
- Atualizar o banco não toca no tempo de atividade das tarefas nem muda modo/ordem/vínculos de execução de
  entradas já aceitas. A representação historicamente legítima de um modelSelection existente em mensagens
  antigas precisa ter a origem discriminada na implementação, para não tomar um campo já publicado como um
  estado intermediário ainda não lançado.

## B. Banco do App

TaskIndexRepo/AutomationRepo/OffPeakTaskRepo compartilham tasks-index.sqlite. A criação de tabelas e o
acréscimo de colunas foram normalizados para uma migration versionada no nível do banco, preservando os
comportamentos de inicialização necessários já existentes.

Fronteira de implementação: a entrada unificada pertence ao módulo de banco de tasks de services/session e
é chamada pelos três Repos antes de liberar leitura e escrita; não se reusa o adapter concreto do Agent
através de domínios. Criação de tabela, acréscimo de colunas e índices vão para a 0001 (que assume as
tabelas existentes/parciais), e a transformação de dados de Provider vai para a 0002. O kernel de
transação IMMEDIATE consulta o ledger de nível de banco e faz rollback em caso de falha. SQL/listas de
colunas declarativos participam do checksum; a transformação de dados em TS usa um identificador de versão
semântica congelado e não pode usar function.toString() como checksum (o bundling reescreve o texto da
função), e implementações de transformação publicadas não podem ser editadas no lugar.

A seleção antiga padrão do Automation é escrita explicitamente como JSON null durante a migração; uma
seleção antiga existente mas indeterminada permanece como SQL NULL e a execução exige uma nova escolha. O
dispatch normal não verifica mais a coluna model antiga. Os dados antigos do Off-Peak não têm identidade de
Provider e não podem ser completados com a conta atual dentro de uma transação de banco ou em list/get;
os Tickets e as colunas antigas são preservados, a configuração de exibição fica pendente de correção e a
seleção nova válida atual tem apenas disponibilidade derivada.

A organização dos IDs ACP antigos é uma migração que já existia antes desta rodada e não é uma
oportunidade para mudar suas decisões de produto históricas; a marcação/agrupamento ocioso e a limpeza de
referências excluídas são mantidos pelo Repo de índice e são manutenção de projeção associada repetível,
não transformação de dados de Provider. Registrar o motivo da preservação durante a implementação.

A compatibilidade mínima de escrita já foi localizada: o Reader de troca de modelo da versão antiga acessa
toModel.providerID incondicionalmente, portanto as novas timelines mantêm um objeto toModel antigo; as
atualizações não sobrescrevem o snapshot antigo. A hydration antiga do User tem proteção contra valor
nulo, mas o modelRefFromInternal do mapper de protocolo lê user.model incondicionalmente, então os novos
Users também mantêm um objeto model antigo mínimo. O mapper de protocolo antigo do Assistant constrói um
objeto de origem e continua legível mesmo com campos ausentes, portanto não há escrita dupla em geral.

Fronteira de cópia: o Reader lógico não carrega campos de modelo antigos e um fork não pode usá-lo para
regerar snapshots antigos. A escrita de armazenamento aceita coordenadas opcionais do registro original
(sessionID/id), e o adapter preserva os campos antigos do registro original durante a cópia; o Core só
passa os IDs original/destino e não resolve configuração antiga. O bundle de fork atômico também carrega o
mapa de coordenadas de mensagens/Parts, executado dentro da transação existente; não se cria um serviço de
migração separado nem um fallback de leitura.

Conclusão das oito tabelas do App: o model/provider/thought_level antigos de `automations` geram
model_selection; a `automation_runs` da versão antiga não tem identidade completa e confiável, então não se
adivinha a seleção histórica de execução; `off_peak_tasks` preserva todos os campos de modelo antigos e o
Ticket, e a identidade ausente não é vinculada; `tasks` e as quatro tabelas de associação de
grupo/ordem/workspace mantêm os registros originais. O fixture completo das oito tabelas e o Reader antigo
foram verificados, e o único ledger novo é o `tasks_schema_migration`.

Lógica antiga preservada fora do escopo desta rodada: a organização dos IDs de task ACP do TaskIndex é
anterior ao Refactor de Provider; a marcação/agrupamento ocioso é manutenção de projeção associada; a
transição awaiting_approval → running do OffPeak é uma correção de ciclo de vida antigo e não uma
transformação de seleção de modelo. O `model` do TaskIndex é um fato de exibição de lista e não pode ser
lido como Seleção antiga nem removido por um caminho lateral. Esta rodada não redecide essas semânticas
existentes.

## C. Cadeia de chamadas, revisão de integridade e escopo

- Owner do Agent: `sqlite-session-store.ts` aplica a 0020 pelo `migration-runner.ts` existente após abrir e
  só então permite leitura e escrita dos Repos; Owner do App: a inicialização dos três Repos chama
  uniformemente `tasksDatabase/migrations.ts`. Os dois bancos físicos têm contabilidade e transações
  independentes e não importam um ao outro adapters concretos.
- Origem da transformação: comparação item a item com o formato do repositório da linha de base antiga e
  o `model-selection-migration.ts`, `automationSelectionMigration.ts` e as regras compartilhadas de parsing
  de identidade antiga da linha de base de implementação; os dois arquivos substituídos e a API de migração
  por sessão do SessionStorePort foram removidos. SQL/TS congelados não referenciam em runtime regras
  mutáveis de Provider/Account.
- Entradas normais: os codecs do Agent consomem apenas membros novos; o create-app, o message-mapper e o
  transcript-hydration do bootstrap não restauram mais a seleção antiga. O Automation do App distingue JSON
  null de SQL NULL por padrão e não tem fallback de coluna antiga; `projectModelSelectionIssues` do OffPeak
  projeta apenas erros e não escreve no banco em list/get.
- Producer: a persistência de mensagens do Core ainda passa pela Port; o adapter SQLite define campos
  físicos de compatibilidade. `session-fork.ts` (bundle atômico) e `workspace-checkpoints.ts` passam as
  coordenadas do registro original, e o adapter transporta os snapshots antigos dentro da transação
  existente. A seleção atual de uma sessão filha é uma nova seleção na fronteira do fork e não copia a
  configuração atual da sessão pai; a entry pai original fica inalterada. A importação explícita de sessões
  compartilhadas mantém a fronteira de importação independente e não restaurou o fallback de leitura
  normal.
- Workflow: `repositories/script-workflow-runs.ts`, `script-workflow-activities.ts` e `session-inputs.ts`
  não têm modificações em relação à linha de base antiga; o model do workflow scheduler/expert do Core é
  um fato de evento/resultado de execução, não uma Seleção persistente a reinterpretar pela conta atual.
  JSON original, estatísticas, ordem e associações de subsessões são preservados.
- Buscar em todo o repositório os drivers de banco, criação de tabelas e entradas de caminho; os owners
  SQLite próprios envolvidos pelo Refactor de Provider são os dois bancos acima. O Chrome Cookie do desktop
  lê o banco do navegador, e stability telemetry / remote connect apenas diagnosticam erros de SQLite —
  não são um terceiro owner. Configurações JSON/Markdown, caches externos e bibliotecas de terceiros não
  entram nesta rodada de DB migration.
- Revisão bidirecional: campos e valores antigos são protegidos por asserções no SQL original; o
  protocolo/execução atual não restaura mais a partir de campos antigos; configuração ausente apenas bloqueia
  execuções que exigem modelo e não esconde conteúdo; o mapeamento de Provider não faz consulta de conta nem
  julgamento de entitlement; o provenance histórico não é mapeado; nada alterou owner/workspace identity,
  continuous/replayable ou a política de Tickets.

## D. Evidências de verificação e limitações (2026-09-10)

### Automação e checagens estáticas

- Lote completo do Agent, 10 arquivos, **195/195 aprovados**, cobrindo provider-database-migration (9),
  session-model-selection-migration (16), session-store (44), novos codecs físicos, resume unbound de
  App/Protocol, importação de contexto compartilhado e fork, entre outras cadeias relacionadas.
  `provider-migration-unrelated-tables.ts` fornece fixtures de associação legais para 22 tabelas de
  negócio; a validação cobre linhas inteiras, FKs, ledger antigo, tempo e conteúdo, e não apenas a
  existência das tabelas.
- Lote final combinado do App, **9 arquivos, 137/137 aprovados** (mesma cobertura da rodada anterior de
  123+14, sem acúmulo duplicado), incluindo workspace identity, marcação ociosa e Selection View. Novos
  testes centrais: 9 em `tasksDatabaseMigration.test.ts` e 1 em `tasksDatabaseRollback.test.ts`,
  cobrindo a proteção das oito tabelas, a inicialização dos três Repos, rollback por falha, tomada de
  parte de colunas, checksum, duas threads abrindo simultaneamente convertendo apenas uma vez, offline,
  preservação de Ticket e degradação seguida de reupgrade.
- O Reader congelado está em `tests/fixtures/staging-backup-*-readers.mjs` dos dois lados, derivado das
  funções reais do commit fixo `790884b1ce`, e não referencia o Reader atual. Isso prova que dados novos
  adicionados/modificados pela nova versão podem ser tratados pela cadeia de leitura de conteúdo antigo; não
  é uma declaração de ter iniciado um Electron antigo completo.
- `pnpm typecheck` da raiz, `pnpm lint` (42 warnings existentes / 0 errors), `pnpm
  architecture:check --changed` (0 violations), checagem de tipos de Agent contracts/adapters/core/bootstrap
  e builds relacionados aprovados. Os novos testes usam esbuild diretamente, e a dependência de
  desenvolvimento dos services e o lockfile foram complementados; a checagem de lockfile frozen/offline
  foi aprovada.
- O lint mais rigoroso do próprio Agent ainda relata 8 arquivos longos demais existentes e 3 warnings
  existentes; não foram eliminados apagando migrations históricas ou dividindo arquivos grandes não
  relacionados. O lint da raiz não cobre o Agent e não se pode escrever que a raiz verde significa Agent
  totalmente verde.
- O `pnpm knip` de todo o repositório ainda tem muitos avisos existentes de unused/unlisted e não se alega
  aprovação. As dependências não declaradas do esbuild usadas nesta rodada foram corrigidas; a busca por
  chamadas no código-fonte das APIs/arquivos removidos não deixou resíduo. A ferramenta dep:refs não resolve
  caminhos do Agent, então foi usada a conferência direcionada de referências no código-fonte e não se
  alega que a ferramenta de grafo passou.
- Na regressão ampliada, `runtime-unbound-resume.test.ts` tem uma falha de asserção de texto existente: esperava
  `Select a model before continuing`, mas foi embrulhada como `Model creation failed`. Rodar novamente com o
  código-fonte do Core fixado em `dfce309227` falha igual; a execução ainda rejeita a configuração ausente
  antes da criação do modelo e não está escolhendo modelo por baixo dos panos. Esta rodada não amplia a
  correção desse problema antigo.

### Verificação concentrada no desktop Pro

- Diretório Pro isolado `/Users/dev/Desktop/projects/Z.AI/zcode-db109-e2e.L1ztpm`; sem sobrescrever o
  workspace original nem o banco real do usuário. Uma build do lote completo, reutilizando o pending
  `conversation-session-unbound-resume.test.ts`.
- Run ID: `desktop-e2e-20260910130906791-p75075-7e14793053e6f24c`. O relatório está em
  `packages/desktop/.e2e-artifacts/<Run ID>/summary.md` no diretório acima. **1 spec / 1 test PASS, zero
  flaky, zero falhas de infraestrutura**; um caso encadeia quatro cenários de cold start.
- Verificação: o primeiro start real migra a seleção antiga e preserva os campos originais; ausência de
  faixa / Provider inválido não impede mostrar o histórico; escrita de rollback que apaga campos novos não
  rerodar a 0020 e a seleção de modelo permanece vazia; após o usuário escolher de novo, a mesma Sessão
  confirma com sucesso e recebe uma resposta replay. Nenhum serviço de modelo real foi chamado e nada foi
  promovido a pending automaticamente.
- As asserções-chave de banco/Reader/protocol de DB109-01~13 foram cobertas; DB109-14 é **parcialmente
  verificado**: desktop local em máquina real, os dois clientMode de protocolo e workspace identity por
  teste unitário passaram, mas não foi executado o E2E conjunto de celular shared-host + SSH/WSL reais, e
  teste unitário de protocolo não equivale a verificação conjunta em máquina real. Windows e o binário de
  desktop antigo completo também não foram executados em máquina real.
- A 0020 do Agent apenas transforma JSON e não adiciona tabelas/colunas de negócio; o App adiciona um ledger
  de nível de banco. A coordenação com o responsável da CLI foi perguntada ao usuário e ainda não há
  confirmação; nenhuma mensagem externa foi enviada por conta própria e não se alega sincronização. Ainda é
  necessária a confirmação da equipe antes do lançamento.

## E. Correções das lacunas de revisão (2026-09-10)

O princípio máximo é reiterado: **fazer rollback, ou fazer rollback e depois reupgrade, pode permitir que a
seleção de modelo se torne inválida e o usuário precise escolher de novo; mas não pode fazer com que a
sessão/task não abra, o corpo da conversa se perca ou uma anomalia seja reportada na leitura/exibição.** A
validação de configuração necessária antes da execução é preservada e nada é escolhido às escondidas; isso
não significa engolir corrupção real do banco ou falhas reais de IO.

### As duas correções e suas fronteiras

1. A `0020` produz `modelSelection: null` para o `model` antigo de um User cuja identidade não pode ser
   determinada; o Reader antigo transmitia isso direto, fazendo a validação `info.model` do protocolo falhar.
   O novo teste de regressão reproduz primeiro o ZodError e depois, no Reader SQLite, usa o parse com a
   estrutura pública de Selection para projetar a configuração nova inválida como ausente. Timeline/Subtask
   antes apenas verificavam se era um object, e identidades residuais incompletas também atravessavam o
   protocolo; agora ambos são validados; identidades históricas legítimas, as faixas e os labels de
   Timeline são preservados e o Registry/a conta não são consultados. **O SQL/checksum da migration já
   commitada não é modificado, não há rerun, valores antigos em disco não são apagados nem consertados e
   não há fallback de campos antigos.**
2. O plugin de restore escreve SQL diretamente, contornando o objeto mínimo antigo de User do Writer normal;
   o Reader antigo congelado lança erro porque `model` está completamente ausente. O script de importação
   apenas acrescenta `model: {}`; modelos da versão antiga podem se tornar inválidos, mas o conteúdo
   permanece legível; o uso atual segue apenas `modelSelection`, sem ampliar a escrita dupla do Assistant e
   sem redecidir a identidade de origem do ACP.

```text
primeiro upgrade do banco antigo -> 0020 existente -> validação de estrutura no Reader SQLite -> leitura normal de conteúdo/protocolo
escrita em formato antigo durante rollback -> reupgrade (o ledger não reroda) -> ausência/invalidez da nova seleção não bloqueia o conteúdo
importação por restore explícita -> nova seleção + objeto antigo mínimo -> Reader novo e antigo leem o corpo
```

### Novas provas e revalidações

- `database-rollback-readability.test.ts` executa diretamente as migrations reais, o SessionStore, o mapper/
  schema de protocolo e chama o Reader congelado de `790884b1ce`; cobre objeto antigo vazio, identidade
  meio residual, null, campo novo ausente, faixa de tipo errado e a preservação dos campos originais/do corpo/
  do ledger. O subprocesso real do CLI de restore usa dois SQLite temporários e arquivos de snapshot,
  importa User/Assistant e depois lê o corpo no Reader antigo e no protocolo atual após reupgrade, com
  stderr vazio. Nenhum banco de usuário foi acessado.
- Lote do Agent, **6 arquivos, 96/96 aprovados**; migrações/rollback dos dois bancos do App, **2 arquivos,
  10/10 aprovados**. Os testes falharam antes e passaram depois; a ausência de campo compara legibilidade,
  e uma seleção legal de Provider desconhecido continua preservada, não sendo apagada por não ser
  executável.
- `pnpm typecheck` da raiz, `pnpm lint` (42 warnings existentes / 0 errors), build dos adapters, checagem
  de tipos do bootstrap, `typecheck:e2e` do desktop, checagem de fixtures e architecture check aprovados. O
  lint do codec modificado em arquivo único: 1 file / 96 rules / 0 diagnostics. O lint de todo o repositório
  do Agent foi executado após completar o PATH das chamadas e ainda falha por arquivos longos demais
  não modificados de CLI/contracts; não se alega que o lint de todo o repositório do Agent está verde.
- Reverificação Pro run: `desktop-e2e-20260910150113615-p79512-7b913cccfacc70a8`, mesmo diretório isolado,
  **1 spec / 1 test PASS**, quatro cenários de cold start. O novo `model: {}` de User antigo, após a
  migration, ainda exibe pergunta e resposta e a leitura não acusa formato de configuração ausente;
  depois que o rollback remove os campos novos de User e o app inicia de novo, o ledger antigo não muda, o
  corpo fica visível e, após nova escolha, a mesma Sessão continua com sucesso.
- A tentativa anterior `desktop-e2e-20260910145741668-p78675-f3dd3d3bd47d9881` falhou ao enviar a primeira
  mensagem de preparação e ainda não entrou no fixture de migração; o registro de falha é mantido, não conta
  como aprovação e sua causa raiz também não é afirmada diretamente. Após acrescentar o diagnóstico de
  «expandir detalhes», a repetição acima passou **sem novas modificações no código do produto**. Aqui não se
 não se afirma que a estabilidade da primeira execução já foi provada e o problema de envio isolado não é
  ampliado.
- Ainda não foram executados o binário Electron antigo completo, o conjunto celular shared-host/SSH real e a
  GUI do Windows; as evidências antigas vêm do Reader real congelado e as evidências Pro são do desktop na
  versão atual com cold start. As limitações de coordenação externa permanecem. Esta correção não altera
  estrutura de tabela/ledger de migração, não adiciona itens de coordenação e não faz push automático.