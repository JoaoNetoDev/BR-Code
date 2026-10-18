# Todo158: Acesso Total no Diálogo de Aprovação de Permissão e Sincronização de Permissão da Fila Pendente

> Estado: em 2026-09-17 a implementação e a aceitação no desktop foram concluídas; a aceitação geral não foi totalmente encerrada. As alterações de workspace preexistentes foram preservadas; as falhas de CLI lint/testes de baseline e as lacunas da cadeia completa no celular estão na seção 9.

## 1. Objetivo e decisão mais recente

Reduzir aprovações repetidas durante a execução de ferramentas, oferecendo «完全访问» (acesso total) dentro do diálogo de aprovação de permissão, de modo que uma única ação explícita faça a tarefa atual, o Composer da tarefa atual e todas as mensagens da fila pendente usarem `mode=yolo`.

- **Somente o «完全访问» do diálogo de aprovação dispara a sincronização em lote**; o menu de permissões comum do Composer continua editando apenas o rascunho da próxima Submission.
- Runtime, Composer e cada item da fila mantêm seus próprios `planEnabled`; não se pode aplicar uniformemente o Plan do Runtime nem sair do Plan por trocar a permissão.
- A ação vale para a tarefa atual: não define como yolo a permissão padrão do projeto, de outras tarefas ou o padrão de novas tarefas; não adiciona uma mensagem de usuário, nem para ou reinicia o turno atual.
- A fila altera apenas os campos de permissão. Corpo, anexos, modelo, nível de raciocínio, Plan, identidade, ordem e forma de entrega mantêm o valor original.
- O item atual só é liberado depois que a atualização em lote é concluída; a falha não pode exibir sucesso total, e cliques repetidos ou respostas duplicadas entre dispositivos não podem produzir efeitos colaterais repetidos.

Este item dá continuidade a [Todo71: Rascunho persistente do Composer](./todo-71-persistent-composer-draft-and-submission-state.md) e [Todo151: Estado independente de Plan](./todo-151-independent-plan-state-draft.md). Ele só acrescenta a exceção explícita de modificação de permissão de fila para o acesso total do diálogo de aprovação, sem reabrir a seleção de modelo nem a semântica comum de fila. O conflito histórico está em [C26](../design-v2/evidence-and-contradictions.md#c26-审批框完全访问是否可以修改已接纳队列的权限).

## 2. Opções de Aprovação e Apresentação

A aprovação comum de comandos é apresentada na seguinte ordem; por padrão continua selecionado o item 1:

| Nº   | Opção                        | Descrição e efeito                                                                                   |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Permitir                     | Permite somente desta vez, preservando a semântica existente de allow_once                                |
| 2    | Sempre permitir este comando | No escopo do projeto, comandos iguais deixam de perguntar; preserva a geração e o casamento das regras allow_project existentes |
| 3    | 完全访问                    | Concede ao Agent acesso total, sem nova confirmação. Executa a sincronização da tarefa atual, do Composer e da fila definida neste Todo |
| 4    | Recusar                      | Recusa esta operação, preservando o comportamento existente de Deny                                   |
| 5    | Dizer ao modelo o que fazer em seguida… | Preserva a linha de entrada independente de feedback anexado à recusa e sua forma de envio     |

- Atalhos numéricos, setas, Tab, Enter, foco e botão de confirmação são atualizados conforme o layout real das opções. O `5` foca o feedback sem enviar; o comportamento do método de entrada e a compatibilidade da entrada no celular são preservados.
- A linha de feedback continua condicionada a a requisição declarar suporte a feedback; não se pode fabricar uma resposta de feedback para entradas sem essa capacidade.
- O item 2 continua exibindo o prefix/exact scope real informado pelo Agent; apenas mudar o título para «此命令» não pode alterar o casamento nem ampliar a autorização.
- Arquivos, rede, MCP, CUA oficial e outras superfícies de aprovação compartilhadas preservam o texto de escopo de ferramenta e a semântica de grupos de capacidade confiável existentes; não podem ser renomeadas todas como «comando».
- O acesso total não desliga o Plan; `yolo + planEnabled=true` continua sujeito às regras existentes das ferramentas de planejamento. AskUserQuestion, ExitPlanMode e outras perguntas ao usuário não são respondidas automaticamente pela nova opção.
- Desktop e celular compartilham componente, semântica e internacionalização; a resposta de protocolo não é deduzida pelo número da opção.

## 3. Fatos Atualizados do Código e Problemas

| Fato                                                            | Implicação para a implementação                                          | Entradas                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O menu do Composer só altera o rascunho do scope atual          | Reutilizar o callback do menu não resolve a aprovação atual              | [SessionPane](../../../../packages/ui/src/v4/SessionPane.tsx)、[useDraftConfigControl](../../../../packages/ui/src/v4/composer/useDraftConfigControl.ts)                                                  |
| A troca imediata de comandos ainda é usada por Bot, automação, CLI/TUI e caminhos de compatibilidade | Não pode ser tratada como código morto nem removida, e a sincronização em lote não pode ser estendida a todos os chamadores | [task adapter](../../../../packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts)、[session facade](../../../../apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts)                       |
| `app.setMode()` atualiza o Runtime e ainda grava o `permission/mode` do projeto | A autorização em nível de tarefa não pode herdar o efeito colateral da preferência do projeto | [session facade](../../../../apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts)、[runtime config](../../../../apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts)                      |
| Passar apenas `mode=yolo` é normalizado como `planEnabled=false`  | A atualização exclusiva de aprovação precisa preservar explicitamente o Plan; não se pode alterar às cegas a regra compartilhada de decodificação de compatibilidade | [execution-state](../../../../packages/shared/src/execution-state.ts)                                                                                                                                     |
| O mode do Runtime é lido no início de cada chamada de ferramenta, e as aprovações existentes aguardam o broker | É possível trocar em execução, mas não há liberação automática do pending nem refazimento de chamadas que já leram o mode antigo | [call-runner](../../../../apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts)、[permission-flow](../../../../apps/zcode-cli/packages/core/src/tool/executor/permission-flow.ts)                |
| Itens de fila carregam mode/Plan independentes, reaplicados no consumo | Alterar só o Runtime ou a UI pode fazer a próxima saída da fila voltar à permissão antiga | [product projection](../../../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts)、[turn-model](../../../../apps/zcode-cli/packages/core/src/runtime/methods/turn-model.ts) |

`permission/mode` é o fallback de modo do projeto no momento da criação do Agent; `permission/ruleset` é o conjunto de regras de «Sempre permitir este comando»; o Session execution state e o Composer Recent são fontes de fato diferentes. Este Todo não os unifica, não escreve padrões de projeto nem adiciona regras de permissão.

Nesta rodada, a execução real com o `resolveExecutionState()` existente confirmou: `build + Plan=true` passando apenas `mode=yolo` vira `yolo + Plan=false`; só carregar explicitamente o Plan original mantém true. A implementação atual já complements as regressões de Runtime, SQLite, broker/race, projeção V4 e UI; os resultados reais de verificação estão na seção 9.

## 4. Atribuição de Estado, Fronteira da Fila e Ordem

```text
Desktop continuous / Mobile replayable
  → o diálogo de aprovação escolhe «完全访问» (session + interaction + command identity)
  → o mesmo Agent owner valida se a requisição ainda é válida e coordena o vencedor da resposta e a ordem de saída da fila
  → atualiza o Runtime.mode=yolo atual, preservando o Runtime.planEnabled
  → atualiza para mode=yolo todos os itens da fila já aceitos e ainda não executados
      cada item preserva o planEnabled / modelSelection / content / order / delivery original
  → sincroniza o resultado autoritativo e a projeção da fila para o cliente
      o Composer da Session correspondente é atualizado de forma direcionada para mode=yolo, preservando o restante do rascunho
  → libera a requisição de aprovação atual e continua o Turn original
```

### Fronteira de Modificação da Fila

- Os itens afetados são determinados pela ordem serial no momento em que o Agent aceita esta ação de aprovação, cobrindo as entradas pendentes durante a execução, a fila pausada/held e os Guides ainda não consumidos na fila.
- Coordenação com reserve/promote/drain: durante a atualização em lote, os itens alvo não podem iniciar com a configuração antiga; mensagens que já começaram a executar não voltam a ser itens de fila e os registros históricos de envio não são reescritos.
- Modifica-se o dado autoritativo realmente usado na execução, sincronizando os registros de entrada necessários e os eventos/projeções, para que memória, consultas ou edição de retirada não obtenham valores antigos. Não basta alterar a exibição do renderer nem apenas o snapshot.
- Após a atualização, a saída automática, o «Enviar imediatamente» e a edição de retirada usam o mode atualizado; ID da fila, ordem, estado de pausa e as demais configurações são preservados.
- Esta é uma atualização explícita, e não uma camada de sobrescrita permanente; novas submissões posteriores continuam processadas conforme sua própria Submission explícita e a ordem de aceitação do servidor. Após a sincronização, o Composer envia normalmente usando yolo.

```text
Runtime：build + Plan=true  → yolo + Plan=true
Composer：edit + Plan=false → yolo + Plan=false
Fila A：build + Plan=true   → yolo + Plan=true
Fila B：edit + Plan=false   → yolo + Plan=false
```

### Aprovação, Falha e Multidispositivo

- A troca de permissão, a alteração da fila e a resposta atual são fechadas por uma única ação explícita de aprovação; a UI não envia dois comandos sem relação supondo sucesso atômico.
- Reutiliza-se o mecanismo existente de atualização de estado do Runtime, do interaction broker e de idempotência de comandos. O Agent é o owner da fila e das permissões; não se cria uma segunda accepted queue no Renderer, no Host ou no Relay.
- Valida-se a pertença da interaction à task/session. Quando a requisição já foi recusada, cancelada ou tratada por outro dispositivo, uma ação tardia não pode continuar ampliando a permissão; a corrida entre Hook e resposta do usuário ainda precisa garantir um único vencedor.
- Se qualquer passo de persistência de estado, atualização da fila ou submissão de eventos falhar, é preciso haver um resultado conciliável e um caminho de retentativa idempotente; não se pode aprovar a ferramenta e só depois descobrir que a fila não foi atualizada. Na implementação, o ponto de commit, a recuperação de falha e as evidências de injeção de falha devem ficar explícitos, sem usar vários `await` para fingir uma transação.
- O Composer trata de forma direcionada esse resultado explícito pelo owner de rascunho existente; entre dispositivos e reconexões da mesma tarefa, evita-se aplicação duplicada, e um snapshot comum ainda não pode sobrescrever continuamente o rascunho. Um resultado tardio não pode modificar outro scope nem sobrescrever uma atualização já explicitamente tratada.
- Esta ação não escreve no Composer Recent; quando uma Submission real posterior for aceita, as regras existentes de Recent continuam valendo.
- Quando a tarefa pai assumiu a aprovação de um Agent filho, é preciso conferir a atribuição de origin, do broker e do Runtime realmente em execução; não basta alterar o Runtime onde a exibição acontece para afirmar que o child foi efetivado, e o escopo de autorização de outras tarefas e de children independentes não é ampliado por uma relação de chamada estática. Antes de mudar um contrato de herança existente, é preciso registrar o impacto concreto.

## 5. Fatias de Implementação e Restrições de Compatibilidade

- [x] Ler, com a baseline mais recente, as regras de diretório, o architecture-governance, as fronteiras de runtime e a cadeia de mudança de ferramentas, confirmando protocolo, owner e consumidores reais; a investigação desta rodada não substitui a conferência anterior à implementação.
- [x] Completar neste Working Memory o schema da ação de aprovação, o contrato de commit/recuperação e a matriz mínima de estados, cobrindo primeiro as regressões que provam a expectativa e só então implementando. As partes que reutilizam contratos existentes não criam interfaces duplicadas.
- [x] O Agent implementa a atualização de permissão em nível de tarefa que preserva o Plan, a atualização em lote das entradas pendentes e a orquestração da resposta de aprovação; as correções necessárias da API comum de mode são explicadas separadamente, sem reescrever opportunisticamente o Bot, a automação nem o comportamento padrão da CLI.
- [x] A UI integra a nova opção e a sincronização direcionada do Composer correspondente, atualizando atalhos, numeração da linha de feedback, i18n e exibição de erro/retry.
- [x] As diferenças de capacidade entre clientes/Agents antigos são tratadas explicitamente: quando a ação completa não é suportada, não se exibe uma entrada utilizável nem se mapeia opção desconhecida como permissão comum; o legacy TUI/Bot não ganha silenciosamente a nova semântica em lote.
- [ ] Marcar a conclusão geral depois de fechar todos os limiares de verificação necessários; a implementação atual, a documentação de longo prazo e as evidências obtidas já foram atualizadas, e as falhas de baseline / cadeia completa no celular restantes estão na seção 9.

Aprovar apenas a requisição atual é escopo confirmado; outras requisições de permissão independentes já pendentes não podem ser presumidas como tratadas por simplesmente deixarem de aparecer com a nova permissão. Este Todo não se estende para opções de autorização em nível de tarefa, interface de gerenciamento/revogação de regras, otimização do casamento de Bash nem limpeza do modo padrão do projeto.

## 6. Aceitação e Plano de Evidências

Os limites de aceitação aceitos são os abaixo; a cobertura real e os itens não verificados estão na seção 9, e a existência de um caso de teste não substitui a execução real. Os casos de interação são mantidos por e2e-case-lifecycle, em coordenação com o case catalog/coverage matrix vigente, sem sobrescrever alterações já existentes no workspace.

| Case     | Cenário                                                | O que precisa provar                                                                                                                |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| PA158-01 | Aprovação comum de comando                             | Ordem das cinco linhas, «Permitir uma vez» como padrão, navegação correta das opções 1–4 e do feedback na linha 5; sem fabricar entrada quando o feedback não é declarado |
| PA158-02 | Tarefa build/edit em execução aguardando aprovação, escolhendo acesso total | Sem parar o turno e sem nova mensagem; o Runtime passa a yolo, a ferramenta atual é executada e as ferramentas seguintes são julgadas pela nova permissão |
| PA158-03 | Runtime, Composer e fila com Plans diferentes           | Todos os modes alvo são yolo, preservando respectivamente true/false; yolo+Plan continua respeitando as restrições de planejamento    |
| PA158-04 | Várias filas comuns, fila held e Guide não consumido     | Todos os itens alvo são atualizados, com configuração/anexos/ordem/pausa inalterados; sem escrita de mode antigo no consumo automático nem no «Enviar imediatamente» |
| PA158-05 | Edição de retirada de um item de fila já atualizado    | O Composer recebe a permissão atualizada do item, além do Plan/modelo/corpo originais; os demais itens da fila não mudam                    |
| PA158-06 | Atualização em lote intercalada com nova submissão e reserve/promote/drain | A fronteira é determinada pela ordem do owner; sem item alvo perdido, sem execução duplicada e sem sobrescrever a escolha independente do usuário aceita depois |
| PA158-07 | Cliques em vários dispositivos, resposta de Hook, recusa/cancelamento, ACK perdido | Um único vencedor de resposta, ações expiradas sem elevação de privilégio e retentativa conciliável sem efeitos colaterais duplicados |
| PA158-08 | Falha de persistência/atualização da fila/submissão de eventos | Sem exibir sucesso total falso e sem liberar antes a ferramenta atual; fatos consistentes após recuperação ou retentativa                      |
| PA158-09 | Menu comum, permitir uma vez, sempre permitir no projeto, recusa/feedback | Mantém o comportamento original; o menu comum não atualiza a fila em lote e o scope das regras do projeto não é ampliado                    |
| PA158-10 | Desktop, reconexão no celular e troca de scope          | continuous/replayable verificados separadamente; resultado consistente na mesma tarefa, rascunho não sobrescrito por snapshot comum, sem misturar workspaceIdentity/session |
| PA158-11 | Preferências de tarefa/projeto e chamadores compartilhados | Esta ação não escreve mode/ruleset do projeto nem Recent, não altera outras tarefas; regressão dos chamadores existentes de Bot/automação/CLI |
| PA158-12 | Aprovação com origem de Agent filho e combinações de versões antigas | O roteamento de origin coincide com a permissão realmente executada; ações completas não suportadas não liberam indevidamente nem se ampliam para tarefas não relacionadas |

Verificações necessárias: `pnpm typecheck` da raiz, `pnpm lint`, `pnpm architecture:check --changed` e os testes afetados; a CLI executa checagens próprias conforme as regras do seu submódulo. A UI cobre desktop/celular, temas claro e escuro e chinês e inglês, e toda interação precisa de um E2E correspondente; a verificação parcial no navegador não se faz passar por passagem da cadeia nativa completa nem do controle remoto no celular, e casos que não passaram na admissão não são promovidos automaticamente. Depois das checagens necessárias, faz-se a autoconferência do diff e são commitados apenas alterações desta rodada; o push/MR é disparado separadamente pelo usuário.

## 7. Entregas da Rodada e Problemas Restantes

- O acesso total é concluído pelo `resolveInteraction` original, pelo registry, pelo owner do Runtime e pela transação SQLite; a ferramenta é liberada após a confirmação da projeção V4. A API comum de mode mantém o comportamento de preferência de projeto, e esta ação não a chama.
- A UI acrescenta a entrada de capacidade completa, a navegação de teclado das cinco linhas, o retry de erro e a sincronização única do Composer; a edição de retirada preserva a marca de tratamento da autorização.
- UI antiga / Agent antigo mantêm compatibilidade pelo campo separado `fullAccessOption`; origem de child e perguntas/confirmações independentes não declaram capacidade incompleta.
- O contrato oficial foi destilado em [documento de aprovação de permissão](../../../permission-project-approval.md); a hierarquia de testes e as lacunas permanecem na matriz de cobertura, sem promover automaticamente o que está pending.
- Antes de todas as verificações necessárias passarem, o workspace é preservado e não há commit automático; alterações não relacionadas preexistentes ficam fora do escopo de entrega deste Todo.

## 8. Contrato de Implementação (2026-09-17)

### Resumo de Impacto e Entradas

Isto pertence a presentation, validation, commit-effect, persistence e recovery; após o planning, a implementação segue direto.

| Cenário/entrada             | Implementação compartilhada                 | Rascunho/padrão       | Validação e commit                                    | Autoritativo/persistência                                        | Fronteira e isolamento                       |
| --------------------------- | ------------------------------------------ | --------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| Aprovação comum desktop/celular | PermissionDialog / V4InteractionDialogs    | Permitir uma vez como padrão | O Agent declara a opção fullAccess; resolveInteraction original | interaction registry → Runtime → session store, commit atômico  | continuous/replayable seguem ocadeia original |
| Menu comum do Composer      | useDraftConfigControl                      | Rascunho de scope independente | Callback de rascunho original                           | Rascunho no Renderer                                              | Não altera a fila em lote                    |
| Sempre permitir no projeto  | option builder existente                   | prefix/exact do Agent | permissionUpdates originais                            | ruleset do projeto                                               | Não amplia a regra                           |
| Sub Agent / legacy          | Superfície de aprovação original           | Opções originais      | Não declara a capacidade fullAccess completa por enquanto | broker child real                                            | Não troca o pai indevidamente nem forja sucesso do child |

Verificações obrigatórias: resposta única do registry/broker, projeção pendingInputs/held do Core, session_input e execution entry do SQLite, patch de mode/queue do V4 e sincronização direcionada do Composer. Precisam de regressão: Plan, Guide, reserve/promote, edição de retirada, Hook e retry de comando. Bot/TUI/API comum de mode são invariantes de isolamento; os testes unitários relacionados são evidência e não outro owner.

A ferramenta de codegraph não está disponível neste ambiente, e usa-se no lugar dela a verificação explícita de referências diretas das entradas; a profundidade da varredura se limita a entrada→owner→persistência/projeção, e não se afirma ter concluído a validação do índice de codegraph. O grafo de funcionalidades atual não tem a aresta semântica do acesso total da aprovação comum, que precisa ser complementada na implementação; no mapeamento do domínio da fila, a descrição antiga de renderer/host como detentores da accepted queue não corresponde ao owner CommandInbox atual e não serve de base para a implementação.

### Commit, Competição e Recuperação

- Reutiliza-se `resolveInteraction`, com ID de opção estável `fullAccess`, e a autorização não é deduzida pelo número. Somente o Agent com capacidade de salvamento atômico declara isso para requisições de permissão da tarefa principal comum; sub Agents, perguntas, aprovações de Plan e workflows que exigem confirmação independente de ferramenta não declaram suporte.
- O Registry valida session, tipo de requisição e capacidade de opções, e obtém o direito de resposta. A corrida de permission responder do Core oferece broker claim: se o Hook já venceu, não é possível fazer claim; após o claim, o Hook sai da disputa. Em caso de falha a aprovação é preservada, permitindo retry/recusa explícitos, sem liberação automática.
- O Runtime bloqueia o consumo/promoção da fila alvo dentro da mesma tarefa; quando há consumo de Guide ou reserve já em curso, retorna uma falha retentável, assumindo o conjunto fixo de IDs aceitos e não consumidos; o admission serial do CommandInbox restringe submissões posteriores. O Plan original de cada item e os demais campos são preservados.
- O commit atômico do SessionStore escreve simultaneamente o execution state atual, a permissão do session_input alvo e um receipt deduplicado por interactionId; usa as tabelas existentes e não adiciona estrutura de banco. Falhas antes do commit da transação não alteram a memória; falhas após o commit preservam o receipt e o retry completa apenas memória/eventos, sem buscar a fila de novo nem sobrescrever entradas posteriores. Modos posteriores e consumo de fila completam primeiro os commits não publicados; retry de projeção é reconstruído a partir do log original, preservando a ordem dos eventos.
- Um único evento SessionModeChanged carrega a marca explícita de permissão concedida e os IDs de fila, e as projeções Core/V4 mudam a permissão de forma sincronizada, sem reescrever o histórico original de submissões. A projeção autoritativa é aguardada antes do ACK; a ferramenta atual só recebe allow depois que todas as atualizações têm sucesso.
- O Composer consome apenas IDs de concessão explícitos, persiste a marca de já tratado e aplica uma única vez por scope, preservando o próprio Plan e sem deixar uma seleção manual posterior ser sobrescrita repetidamente por snapshots comuns. A reconexão lê a mesma marca de concessão; um restart de processo preserva o execution state atual, e a fila continua obedecendo ao contrato de descarte no restart já existente.

```text
resolveInteraction(fullAccess) → session FIFO → registry claim（Hook sai da disputa）
 → barreira de consumo de fila do Runtime → SQLite execution + inputs + receipt atômicos
 → memória do Runtime + um único evento → V4 config/queue → Composer aplica uma vez por grant ID
 → allow do broker atual → ferramenta atual continua → ACK/query conciliável
Falha (antes do commit)→ preserva o estado original e a aprovação; falha (após o commit)→ o receipt de retry completa a publicação
```

### Dimensões, Podas e Entrega da Aceitação

Segue-se PA158-01…12: as dimensões principais são o vencedor da aprovação, a fase da transação, o ciclo de vida da fila, os Plans individuais, scope e delivery; não se expande o arranjo completo ferramentas×modelos. O usuário já confirmou a sincronização em lote de permissões e a preservação do Plan, e não será perguntado novamente. Quando o sub Agent não suporta a ação completa, o fullAccess é podado e a aprovação original é preservada, verificando que não há elevação indevida da tarefa pai; o menu comum e as perguntas não entram nesta ação.

Camadas de regressão: testes de falha atômica do SQLite, Core/runtime/race, schema/projeção/handler do V4, rascunho/navegação da UI; no desktop, E2E pending com aprovação de ferramenta controlada e janela de enfileiramento, e no celular, replayable verificado separadamente. As evidências de execução ainda não obtidas continuam marcadas como pending e não são promovidas automaticamente. Não há hoje nenhuma questão de produto pendente de decisão do usuário.

## 9. Evidências Reais e Limiares de Conclusão

Todos os logs temporários desta rodada estão em `/tmp/zcode-todo158/`; os arquivos de teste e as asserções reais são evidências reproduzíveis.

| Verificação                                                            | Resultado                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` da raiz, `pnpm --dir apps/zcode-cli typecheck` da CLI | Aprovado; 28 tarefas da CLI com sucesso                                                                     |
| `pnpm lint` da raiz, `pnpm architecture:check --changed`                | Aprovado; lint com os warnings preexistentes, arquitetura com 0 violações                                    |
| Transação SQLite / alvo fixo / rollback / cancelamento / isolamento de task | 3 aprovadas, `adapters/tests/permission-full-access.test.ts`                                                  |
| Permissão do Core / Hook claim / Plan                                  | 24 aprovadas, `permission-full-access`, `permission-responder-race`, `independent-plan-state`                |
| Contracts event reducer                                                | 27 aprovadas                                                                                                |
| Bootstrap broker / registry / projection / cadeia de aprovação original | 120 aprovadas                                                                                              |
| Fila Bootstrap reserve/promote/retirada                                | 34 aprovadas, `v4-native-queue.test.ts`                                                                      |
| Recuperação pós-commit de continuous / replayable do V4                | 2 novas aprovadas; no mesmo arquivo há 1 falha de baseline antiga de revision                               |
| UI aprovação/atalhos/capacidade de compatibilidade/Composer           | 67 aprovadas; 1 falha de baseline SHARE32 reproduzida separadamente e não incluída no resultado direcionado |
| Fila de UI retirada / transição de Plan                               | 22 aprovadas; a nova regressão falhou antes e passou depois, restaurando mode/Plan/modelo e reasoning do item da fila |
| Verificação de tipos e fixtures do E2E de Desktop                      | Aprovado; o texto de fila da fixture é usado apenas para enfileirar/retirar e não executa requisição de modelo, portanto o aviso de matcher foi preservado |
| CLI lint                                                                | Não aprovado; a baseline também tem erros max-lines (incluindo telemetry/debug/bootstrap), sem refatoração por oportunidade |

Isolamento da baseline: em `/tmp/zcode-todo158/baseline` no mesmo HEAD, foi aplicado o patch original salvo no início da tarefa e a execução foi feita, reproduzindo SHARE32, as asserções antigas de revision do gateway, as asserções de timing de notificação em background e a falha de CLI lint. Os casos desta funcionalidade estão listados à parte; não se pode alegar que todos os testes do repositório estejam verdes.

Ainda não obtido: E2E real de reconexão/toque repetido entre dispositivos do shared-host do celular, execução real em Windows/macOS. A evidência atual de continuous/replayable é uma assinatura de protocolo real do mesmo Gateway com testes unitários de recuperação de falha, e não se faz passar por cadeia completa do celular. A não disponibilização de acesso total para sub Agent foi testada, sem estender seu contrato de herança.

Execução real no desktop: Linux Electron `1/1` aprovado, run `desktop-e2e-20260917101937381-p869276-572a8de9c7ed2705`, exit 0. A execução pela ferramenta Write original salvou o arquivo, a saída do turno continuou, a ordem das duas mensagens da fila e o corpo foram preservados, e após a retirada ficaram respectivamente `yolo + Plan=true/false`. O E2E revelou e corrigiu uma lacuna préexistente em que o caminho de retirada restaurava apenas corpo/anexos: agora os mode, Plan e modelSelection (incluindo reasoning) já registrados no item são restaurados, e campos não registrados de itens antigos seguem o rascunho existente. O teste concluiu a primeira execução guiada pela UI real, aguardou a janela SSE controlada e não falsificou snapshot de negócio; o caso continua em manual-review/pending.

Execução real do componente compartilhado no navegador: `permission-full-access.test.mjs` **4/4** aprovado, 390/1200 × light/dark; 390 usou chinês e `isWebRemoteControl=true`, 1200 usou inglês. Verificados o texto das cinco linhas, o número 5 focando o feedback sem enviar, o número 3 + Enter devolvendo o ID estável fullAccess e a ausência de overflow horizontal. As capturas estão em `packages/desktop/.e2e-artifacts/permission-full-access-browser/` e são apenas evidência do componente compartilhado e da largura móvel, não substituem um E2E real de relay no celular.

As alterações não commitadas preexistentes foram preservadas separadamente; o catálogo/matriz sobrepostos apenas acrescentam PA158, e o armazenamento de rascunho do Composer apenas ganha a marca de tratamento da autorização. Em 2026-09-17 o usuário exigiu explicitamente combinar o staging mais recente, commitar, fazer push e criar MR; a entrega segue esse pedido, preservando as falhas de baseline e as lacunas da cadeia completa no celular, sem marcar a aceitação geral como aprovada.

Reverificação após combinar o `origin/staging` mais recente (2026-09-17): excluindo as alterações não commitadas preexistentes, a versão realmente entregue passou no typecheck da raiz e da CLI, no lint da raiz e na arquitetura; UI 79, Core 24, SQLite 3, Contracts 27, aprovação/fila de Bootstrap 154 e 2 casos PA158 de Gateway aprovados, além das quatro combinações no navegador. Nova execução no Linux Electron 1/1 aprovada, run `desktop-e2e-20260917120736651-p895163-873605a2d4994754`. A primeira build falhou porque a dependência Zod antiga da máquina foi barrada pela verificação de versão do staging; após alinhar a instalação local à 4.6.5 exigida pelo repositório, a build e o E2E foram bem-sucedidos, sem alterar o manifesto de dependências nem o lockfile. O CLI lint continua sendo a falha max-lines original. O grafo de funcionalidades, com novos nós/seeds/arestas, não introduziu problemas novos; dois endpoints já ausentes (`capability.mcp-oauth-authorization`, `persistence.desktop-user-data-root`) foram registrados como lacunas de baseline.

Antes da publicação, `ZCODE_PRE_PUSH_BASE=origin/staging pnpm verify:pre-push` foi aprovado (lint, arquitetura, testes alterados e testes afetados relacionados). Os novos testes de compatibilidade que expôs a verificação do Zod 4.6.5 estavam sem `detail` e foram completados e reverificados; a lógica de produto não mudou por causa disso.

### Reverificação das Correções CR-01 / CR-02 (2026-09-17)

- CR-01: cada tentativa de fullAccess tem uma notificação de falha independente, e falhas de commit/projeção liberam a resposta legacy que já estava em espera ou expirada; o retry cria uma nova barreira e o sucesso ainda aguarda a resposta do V4. Foram adicionadas regressões de chegada antes/depois da falha, de resolve/reject, de retry e de cancelamento; a implementação original reproduziu primeiro 8 falhas e, após a correção, 128 casos de broker/registry/cadeia de aprovação original passaram.
- CR-02: na recuperação, as marcas de concessão antigas são limpas, e registros de receipt corrompidos, de campos futuros ou entre sessions são pulados após diagnóstico, com o histórico e o execution state já salvo continuando a ser recuperados; o retry idempotente da concessão continua rejeitando estritamente receipts corrompidos. Recuperação, concessão, corrida com Hook e Plan independente somaram 30 casos aprovados. A execução adicional de `runtime-unbound-resume` teve 1 falha de asserção de mensagem de erro já existente, reproduzida numa baseline isolada sem modificar a implementação.
- O typecheck da CLI com 28 tarefas, o lint da raiz e a arquitetura passaram. O lint da CLI continua sendo a falha max-lines original. O typecheck da raiz não foi concluído nesta rodada por esgotamento de memória de heap do Node; mesmo ampliando para 8 GB e dividindo em verificações por projeto, ainda houve OOM na fase de services sem modificações, e não é marcado como aprovado.
- E2E de aprovação no Linux Electron 1/1 aprovado, run `desktop-e2e-20260917130117737-p944581-034f7d67ab10c80c`, exit 0. Passaram a ferramenta original, a fila, os Plans individuais e a cadeia de edição de retirada; o shared-host do celular, o ACK entre dispositivos e Windows/macOS continuam sob as fronteiras não verificadas acima.
- Os logs desta rodada estão em `/tmp/zcode-todo158/cr-*.log`. O usuário exigiu explicitamente corrigir e fazer push, e alterações desta rodada foram commitados conforme essa instrução, preservando as limitações de verificação acima; o MR original !2718 já foi mergeado, e as correções desta rodada são commits posteriores no branch original.