# Planejamento da Matriz de Regressão Gigante de Seleção de Modelo e Provedor

## Resumo da Funcionalidade

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | Listar todos os fatores relacionados a provedor de modelo, seleção de modelo, profundidade de raciocínio, capacidade do modelo, projeção da requisição e funcionalidades de produto ligadas a modelos, fornecendo entradas estáveis para o produto cartesiano posterior, a poda e a geração de testes.                                                                     |
| Capacidade            | Model selection / Provider Registry / Model Runtime / Model Request Projection                                                                                                                                                                                                                                                            |
| Camada de mudança     | option-source、draft-default、validation、commit-effect、persistence、recovery；presentation acts apenas como dimensão cruzada de baixo peso                                                                                                                                    |
| Modo de operação      | planning                                                                                                                                                                                                                                                                                                                                  |
| Catálogo principal    | [model-selection-regression-factor-catalog.yaml](./model-selection-regression-factor-catalog.yaml)；decisões implícitas em [backlog](./model-selection-regression-decision-backlog.yaml)，[questionário de decisões](./model-selection-regression-decision-questionnaire.md) pronto para preenchimento                                          |
| Código de produto atual | [ModelSelection](/Users/dev/workspace/z-code-3/packages/shared/src/model-selection.ts)、[Provider Resolver](/Users/dev/workspace/z-code-3/packages/provider/src/resolver.ts)、[V4 model command handler](/Users/dev/workspace/z-code-3/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts) |
| Fora de escopo        | Esta rodada não escreve código de produto, não gera E2E formal diretamente, não trata `undefined` ou `bug-candidate` como asserções aceitas e não faz permutação irrestrita de todos os IDs de modelo literais.                                                                                                                       |

## 1. Camadas semânticas

```text
Provider / account / entitlement / personal config
                         │
                         ▼
              Resolver + Provider Registry
                         │
                         ▼
               visible candidates / preferred
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
        Chat Draft   Session Runtime  Automation/Subagent
           │             │             │
           └─────────────┼─────────────┘
                         ▼
                V4 Command / Service
                         ▼
                 Canonical Submission
                         ▼
                 ModelFactory / Model
                         ▼
       API format / auth / history / option projection
                         ▼
              provider request + usage + events
```

É preciso afirmar separadamente as quatro camadas:

1. `ModelSelection`: provider/model mais sobreposições explícitas de option.
2. Active Model: o objeto de execução criado pelo ModelFactory após completar os padrões a partir do Registry atual.
3. Request Projection: as formas de requisição para Anthropic, OpenAI Chat, OpenAI Responses e OpenAI-compatible.
4. Provenance: o provider/model efetivamente usado nos resultados como resposta final, compactação, título, Subagent e Automation.

O ID de modelo é um valor opaco. O estado de exibição pode ser codificado como `providerId/modelId$variant`, mas o V4 command, o snapshot do Agent e a persistência não devem tratar essa string de exibição como um novo protocolo entre processos; `/`, `:` e `$` no model ID precisam manter seus significados originais.

## 2. Matriz de Superfícies de UI

| Cenário do usuário      | Entrada                         | Owner de rascunho/exibição      | Padrão/herança                         | Validação                         | Sink de commit                       | Ponto de chegada autoritativo    | Isolamento obrigatório                                  |
| ----------------------- | ------------------------------- | ------------------------------- | -------------------------------------- | --------------------------------- | ------------------------------------ | --------------------------------- | --------------------------------------------------------- |
| Nova conversa          | V4 composer toolbar             | renderer draft                  | Recent -> Host preferred -> fallback    | target Host Registry              | `createSession.config` / `firstInput` | Session runtime + Snapshot        | Não altera Sessions existentes                           |
| Troca de modelo em conversa existente | V4 composer toolbar             | Conversation Snapshot           | config atual da Session                 | CAS, capacidade do model alvo     | `switchModelConfig`                  | CLI session runtime               | Não altera outras Sessions                              |
| Retomada de tarefa histórica | Session/task switch             | Snapshot hydrator               | config persistida da Session           | cold-resume + Registry            | caminho de resume                    | Session timeline                  | O índice de Tasks não é authority                        |
| Edição de Automation   | `AutomationEditView`            | rascunho do form de automation   | herdar ou registro de automation       | model options da automation        | gravação da automation               | automation record/run snapshot    | Não altera Chat Session                                  |
| Execução de Automation | scheduler / manual dispatch     | snapshot da execução             | selection salva                        | Registry/auth em tempo de execução | dispatch                             | execução da automation            | Não relê o Chat Draft                                   |
| Edição Off-Peak        | `OffPeakEditView`               | form Off-Peak                   | task record                            | modelo exato oculto + entitlement | offpeak save                         | Off-Peak task record              | Não escreve em Recent/default                            |
| Execução Off-Peak      | scheduler                       | task/run record                 | selection persistida                   | ticket, JWT, escopo de Team        | task dispatch                        | Off-Peak runtime                  | Não cria um Chat runtime comum                          |
| User Subagent          | `SubagentsSection`              | profile/Markdown                | herança do pai                         | child profile + Registry          | salvamento de Markdown / criação do child | child runtime/timeline        | child readonly sem picker                               |
| Built-in Subagent      | Built-in model control          | built-in override               | built-in profile                       | Registry                          | salvamento do built-in override      | child runtime                     | Não polui a timeline do pai                             |
| Configuração de Provider | seção de settings do provider  | form de settings                | sobreposição de source                 | schema/complete/revision          | facade de Provider                   | personal/account config + Registry | Não cria direto o model do runtime                    |
| Seleção inicial no login | login/welcome                  | form de login                   | primeiro model do family/provider      | key/OAuth/entitlement              | conexão de conta                     | account settings                  | Não contorna o Provider Registry                        |
| Bot                    | Bot `/model`                    | config do bot                   | padrão do bot                          | visualização de seleção de modelo | serviço do bot                       | bot config/request                | Não assume o estado da toolbar do Chat                  |
| MCP oficial            | credenciais do MCP oficial      | seleção de account/family       | provider do plano ativo                | acesso ao coding plan             | serviço de credenciais              | contexto de auth                  | Não trata fatos de MCP provider como owner do Registry  |
| Mensagem de commit Git | git generator                   | local à requisição              | model atual/explícito                  | orçamento de saída 256            | generateText                        | proveniência do resultado do commit | Não altera o thought da sessão principal              |
| Título de Title/Goal    | sidecar                         | local à requisição              | model de título configurado/model atual | JSON/sem tools                    | requisição sidecar                   | proveniência do título            | Reasoning desativado à força                           |
| Verificador de Goal   | verificador do runtime          | snapshot no início              | model da Session                       | política do verificador           | requisição do verificador            | execução do goal                  | Não acompanha troca de modelo no meio                  |
| Compact                | compact runtime                 | local à requisição              | model atual                            | contexto/orçamento de saída       | requisição de compactação            | timeline de compactação            | Não gera uma linha de usuário comum                    |
| Memória de projeto     | helpers de memória              | local à requisição              | model atual                            | política de memória                | generateText                        | resultado da memória              | Não cria um turno de produto extra                      |
| Conectividade          | teste de provider/model         | local à requisição              | model explícito                        | credenciais/fatos do provider     | serviço de conectividade            | apenas o resultado                 | Não modifica o model da Session                        |
| CLI/TUI                | `/model`、`/effort`、`/variant` | config do CLI                   | config atual do CLI                    | validação em runtime              | comando do CLI                      | CLI runtime                       | Validar separado da camada de exibição da UI            |

UI compartilhada não significa comportamento compartilhado. `ModelConfigSelect`, `buildModelSelectGroups` e `useModelSelectionView` apenas
compartilham a origem dos candidatos ou as convenções de exibição; o rascunho, o padrão, o commit e a persistência de cada superfície devem ser afirmados de forma independente.

## 3. Owners de estado, pontos de validação e persistência

| Estado/fato           | Authority                       | Mirrors/cache                       | Validação/commit                              | Persistência                                        |
| --------------------- | ------------------------------- | ----------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| Fatos de Provider/Model | target Host Provider Registry   | facade de Settings/Selection        | `ProviderConfigResolver`、`validateComplete`  | Config Built-in/Account/Personal                   |
| Seleção do usuário    | rascunho local à superfície ou record de produto | toolbar、form、recent | target Worker Registry + ModelFactory       | record de Session/Automation/Subagent/Off-Peak   |
| Active Model          | runtime do CLI                  | Snapshot、usage、provenance          | ModelFactory、verificações de capability do Adapter | session model timeline / message provenance |
| Config da Session     | runtime da Session do CLI       | Conversation Snapshot、Renderer     | barreira/CAS do V4 command                    | persistência de Session                            |
| Queue Submission     | CommandInbox/FIFO do CLI        | journal otimista do renderer        | admission/queue guard                         | queue facts/discard ledger                         |
| Seleção recente      | storage do renderer por workspace | inicializador de rascunho         | verificação de selecionabilidade              | workspaceKey: trim de identidade, senão usa path   |
| Plan/entitlement      | serviços de conta/plano         | badges de UI de provider/usage      | resolução de acesso de conta/provider        | account settings/usage data                        |
| Auth da requisição    | serviço de execução/acesso ao provider | apenas local à requisição   | falha antes da rede                           | não grava credenciais dinâmicas em disco           |
| Perfil de entrega     | attachment do Host confiável     | subscription de conexão             | injeção do host                               | não escolhido pelo renderer                        |

## 4. Limites de entrega

```text
desktop / SSH / WSL / Docker
  -> window-scoped Local Host
  -> Local Agent or Remote Workspace connection
  -> desktop-continuous

mobile /remote
  -> attach existing shared host
  -> same CLI Session Runtime
  -> web-remote-replayable
```

É preciso manter:

- relay e main apenas fazem autenticação, pareamento, heartbeat, encaminhamento e agendamento de attachment; não são donos de Session/Task/Queue/Snapshot.
- O celular não inicia Agent, Local Host nem runtime remoto independente.
- Desktop continuous e mobile replayable são dois contratos de entrega e não podem ser combinados entre si.
- Requisições remotas percorrem `workspaceIdentity` e `remoteSessionId`.
- `workspacePath` é usado para execução e exibição; `workspaceIdentity` é usado para isolamento de identidade e para a key.
- O input aceito tem um único FIFO autoritativo: o CommandInbox do CLI/runtime.

## 5. Fatores e estratégia de combinação

Os fatores completos são mantidos no [catálogo YAML](./model-selection-regression-factor-catalog.yaml), com a primeira camada de dimensões como:

```text
surface × operation × provider/access/entitlement
        × api/auth/endpoint
        × model capability/reasoning/max-output
        × selection/default/draft/session/queue
        × recovery/persistence/delivery/workspace
```

Não expandir direto no produto cartesiano global. Os modelos adotam a seguinte assinatura de classes de equivalência:

```text
provider access profile
+ API transport profile
+ auth profile
+ model capability profile
+ reasoning wire profile
+ context/max-output profile
+ lifecycle/recovery profile
+ product operation profile
```

Regras de geração:

1. Primeira rodada pairwise, cobrindo cada dimensão de comportamento e cada owner compartilhado.
2. Relações de alto risco como Provider/API/reasoning, Registry/session/queue, remote/recovery são feitas em 3-wise.
3. Expandir o produto cartesiano completo apenas dentro de cross-products explicitamente declarados.
4. Dimensões de apresentação como cor, tema, idioma, viewport, teclado/mouse usam um representante de UI compartilhado e não são combinadas com todos os modelos.
5. Só `accepted` pode entrar no E2E formal; `undefined` exige uma decisão antes; `bug-candidate` precisa de confirmação do contrato de produto antes de virar regressão.
6. Cada poda precisa ter um guard ou invariante explícito; não se pode removercombinações com o argumento de "são combinações demais".

## 6. Primeiro lote de cases de alto risco

Os seed cases completos já estão no YAML. A linha principal a ser implementada primeiro é:

| Case             | Cenário                                         | Foco da evidência                             |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| MSR-REG-001      | Seleção e primeiro envio de Provider customizado pessoal | UI、Registry、request body real、persistência |
| MSR-REG-002      | Modelos com o mesmo nome em dois Providers      | identidade completa de provider/model          |
| MSR-REG-003      | Registry remoto em loading sem fallback local   | authority do target Host                       |
| MSR-REG-004      | Revisão Built-in/Account incompatível           | publicação atômica do Registry                 |
| MSR-AUTH-002     | entitlement em loading preserva selection salva | gating de plano                                |
| MSR-REASON-001   | GLM-5.2 max/high/nothink                         | mapeamento de reasoning no wire               |
| MSR-REASON-002   | Toggle Qwen/Kimi/MiMo                            | projeção mínima em extra-body                 |
| MSR-REASON-003   | Budget fixed/adaptive do Anthropic               | max output e thinking budget                   |
| MSR-REQ-001      | modality/tool/structured output                  | preflight do adapter + request body            |
| MSR-DRAFT-002    | Primeiro envio após troca de modelo no rascunho | freeze de createSession/firstInput             |
| MSR-SESSION-002  | switch noop/stale/duplicate/failed               | ACK/CAS de protocolo                           |
| MSR-SESSION-003  | Corrida entre barrier de switch e send          | ordenação de comandos                          |
| MSR-SESSION-004  | provider.notInRegistry com um refresh/retry      | identidade remota                              |
| MSR-SESSION-005  | Troca de modelo durante o stream                 | imutabilidade do model em voo                  |
| MSR-QUEUE-002    | Input busy de Desktop + mobile no mesmo FIFO     | CommandInbox + delivery                        |
| MSR-RECOVERY-001 | Reparo de reasoning unsigned do Anthropic        | imutabilidade do histórico canônico            |
| MSR-RECOVERY-002 | Retry de completion vazia                       | output exactly-once                            |
| MSR-REMOTE-001   | Isolamento de identidade do workspace remoto     | workspaceKey + reconnect                       |
| MSR-SURFACE-001  | Execução após salvar Automation                  | snapshot de record/run                         |
| MSR-SURFACE-002  | Herança/modelo explícito do Subagent             | authority/provenance do child                  |
| MSR-OFF-001      | Execução interna de provider Off-Peak oculto     | Registry oculto + ticket                       |
| MSR-SIDE-001     | title força ausência de reasoning                | projeção do sidecar                            |
| MSR-SIDE-002     | Semântica explícita de thought no commit Git     | comportamento específico por querySource        |

## 7. Resultado da auditoria de decisões implícitas

A versão anterior listava apenas 3 hard blockers, o que comprimia demais o escopo. O decision backlog mantido separadamente tem 114 itens, mas eles não exigem 114 decisões do produto:

| Categoria               | Quantidade | Significado                                              | Próximo passo                  |
| ---------------------- | ---------- | ------------------------------------------------------- | ------------------------------ |
| `undefined`            | 64         | comportamento real de produto indefinido, precisa de decisão | cortar 3–7 por rodada       |
| `contract-conflict`    | 12         | specs antigas/novas, implementação e cases existentes se contradizem | definir a口径 autoritativa e então mudar docs/testes |
| `resolved-needs-proof` | 38         | já há desenho ou tendência de implementação forte, não se deve perguntar de novo ao produto | provar com unit/integration/E2E/logs |
| **Total**              | **114**    |                                                          |                                |

### 7.1 Os 12 conflitos de contrato que precisam ser convergidos primeiro

- Registry: `DEC-019`、`DEC-020`、`DEC-021` — se a origem legacy antiga, o identity scope e o atomic publish continuam válidos.
- Entitlement: `DEC-030` — se o silent fallback dos antigos I56/I58/I61 ainda é o comportamento atual.
- Reasoning: `DEC-041` já decidido como Submission frozen; no consumo da queue não se pode reescrever com a Selection mais recente da Session o Provider, o Model e a profundidade de raciocínio já enfileirados.
- Session: `DEC-046` já decidido: Provider, Model e thought de um item de queue ficam congelados no admission.
- Superfície de produto: `DEC-065`、`DEC-066`、`DEC-067` — herança de Automation/Subagent e momento de escrita de Recent.
- Migração: `DEC-091`、`DEC-092` — como reclassificar e migrar snapshots/cases antigos.

A cadeia atual de evidências do conflito de Queue é:

```text
accepted input
      │
      ▼
CommandInbox admission
      │ freeze complete Submission: provider/model/thought
      ▼
queue wait ───────────────┐
                          │ refresh latest provider facts/credentials only
                          ▼
                   ModelFactory
                          │
                          ▼
                 request + provenance

desktop-continuous  ─────┐  o fato de negócio é o mesmo
web-remote-replayable ───┘  só mudam os limites de entrega e recuperação de snapshot/gap/owner
```

O design de interação com Provider mais recente, `conversation-product-state-space.md` e o `input-intent.ts` atual
sustentam o Submission frozen; `conversation-protocol-declaration.md` /
`conversation-product-protocol.md` já foram unificados como
`queuedSubmissionPreservesSelection`.
Portanto `MSR-QUEUE-001` e seus itens relacionados podem entrar no formal E2E com a semântica de Submission frozen.

### 7.2 Os 64 domínios de borda que realmente exigem decisão de produto

Perguntas, opções, sugestões, evidências e cases bloqueantes completos estão expandidos item a item no backlog. A cobertura inclui:

1. Seleção vazia, Recent, Host preferred, provider default, nomes iguais de provider/model e rollback atômico do rascunho.
2. Mudança de Registry após abrir o Picker, disabled/deprecated, revision, snapshots antigos e authority do target Host remoto.
3. entitlement em loading, troca de conta, refresh de OAuth, chave pessoal/proxy da equipe, policy da organização e capacidades em nível de operação.
4. thought missing/default/explicit-off, prioridade de effort/budget, nothink no wire, conflito entre reasoning e tools/schema.
5. Admission de queue, FIFO, fronteira de Guide, cancelar/parar/timeout, Edit/Retry, compact, Goal e Submission interno.
6. Automation, Subagent, Off-Peak, Bot/TUI/CLI, MCP, commit Git, Title, Verifier, Memory.
7. desktop continuous e mobile replayable, attachment de shared-host, workspaceIdentity, remoteSessionId, owner/lease, recuperação de gap.
8. Ordenação/busca/teclado/toque/acessibilidade de listas longas, dois temas/i18n/tela estreita, além de migração, correlation ID, logs com mascaramento, classificação de erros e pruning report.
9. Persistência em Node: schema/corrupção/import legacy/watcher/dispose do Configured Default, além de Bundled/Active/LKG do Built-in Release, revision, provider retired, lease de refresh remoto, backoff, escrita atômica.

Recomenda-se decidir estes 7 itens na primeira rodada; suas respostas afetam a poda do produto cartesiano na maior escala:

1. `DEC-046`: já decidido que a Queue congela a Submission Selection; a config do Provider é lida em_create com os fatos mais recentes ao criar o Model.
2. `DEC-067`: Recent é escrito no picker, no ACK do switch ou na Submission aceita.
3. `DEC-030`: se um explicit model indisponível permite silent fallback.
4. `DEC-066`: a fonte de herança de um Subagent sem model explícito.
5. `DEC-001`: o estado vazio e o comportamento de envio quando não há nenhum selectable model.
6. `DEC-016`: se mudanças de endpoint/config do Provider afetam o Active Model.
7. `DEC-091`: como retomar quando um snapshot antigo não tem informações de provider/thought.

### 7.3 Os 29 itens que já têm um critério definido, mas precisam de evidência

Esses não são "mais uma preferência de produto a perguntar", e sim coisas para as quais é preciso complementar teste ou evidência de runtime: round-trip estruturado de ModelSelection, momento de Recent na Submission aceita,
imutabilidade do Provider config sobre o Active Model, reparo de reasoning, Edit/Retry copiando a selection completa, provenance de queue entre plataformas,
isolamento de Automation/Subagent/Off-Peak, authority de snapshot remoto, migração de workspaceKey, logs com mascaramento e pruning report.

## 8. Drift do grafo e lacunas de escopo

- Não há índice de codegraph ativo, então a evidência de código deste diretório é marcada como source-reading/rg evidence; não se pode interpretar "não indexado no grafo" como "funcionalidade inexistente".
- `OffPeakEditView` é a entrada real de seleção de modelo, mas a descrição de superfície independente dela no feature graph está incompleta.
- Login, Bot, MCP oficial, commit Git, título, verificador de Goal e Project memory são consumidores reais de modelo, mas o grafo atual expressa apenas parcialmente as arestas semânticas deles com model-selection.
- Caminhos de client-config antigo, `magic_name`, fallback e tombstone só podem servir como border de migration/legacy e não devem continuar como origem do Provider Registry atual.
- O backlog adicionado nesta rodada registra deliberadamente as arestas implícitas descobertos por cruzamento de spec, resolver, input-intent, ModelFactory e case catalog fora do code graph, sem encaixá-las silenciosamente em um único fator `surface`.
- `packages/provider-node` não é um armazenamento simples de arquivos: ele também decide o Configured Default, o Bundled/Active Release, o lease de sincronização remoto e a disponibilidade inicial do Registry; por isso `DEC-098`–`DEC-114` foram adicionados e não se pode cobrir apenas o renderer picker.

## 9. Regras de passagem para E2E

O E2E formal dedicado a modelos precisa seguir o fluxo de E2E de conversa já existente:

1. Um case aceito escreve primeiro setup/action/assertion e pelo menos uma camada de evidência não-UI.
2. Requisições de Provider usam fixture local ao case; funcionalidades comuns usam `fast-text`, cenários de temporização usam `controlled-stream` e cenários de falha usam `fault-stream`.
3. Cases apenas de UI para picker/teclado declaram explicitamente `providerRequestPolicy: none` e não podem usar fixture vazio para mascarar configuração faltante.
4. Cases de Desktop têm `desktop-continuous` por padrão; cases de Remote verificam adicionalmente o boundary de snapshot/gap/owner de `web-remote-replayable`.
5. Só colocar em E2E cases representativos da assinatura de capability de provider/model; os detalhes de mapeamento ficam por conta dos testes provider-unit e adapter-wire.
6. Passar primeiro pelo fixture check e pelo replay local, e só depois entrar na promoção formal/preset de Docker.

Atualmente não se gera a spec `manual-review/pending`, porque o contrato de Queue, o fallback antigo, o timing de Recent, a herança de Subagent/Automation,
a migração de snapshot legacy e afins ainda têm itens pendentes ou conflitantes. Depois que esses problemas forem decididos, os cases aceitos do YAML serão preenchidos de volta no case catalog e na coverage matrix dedicados.

## 10. Ordem de execução posterior

```text
YAML factor catalog
        │
        ▼
决策回填（undefined / contract-conflict）
        │
        ▼
实现证明（resolved-needs-proof）
        │
        ▼
生成合法组合 + pruning report
        │
        ▼
按 owner 分派 unit / integration / desktop E2E / remote replay
        │
        ▼
回填 conversation case catalog + coverage matrix
```