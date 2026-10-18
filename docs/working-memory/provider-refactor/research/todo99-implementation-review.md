# Todo99 — Revisão da implementação e livro-razão de verificação

Data: 2026-09-09. Baseline `86bbe157c88e8e599694afb53c39f6dac125ac08`; a implementação foi feita no worktree de recovery, sem
cobrir as outras alterações de documentos/migrações de Provider existentes em paralelo. O escopo segue a decisão de redução do
[Todo99](../steps/todo-99-worker-account-selection-repair.md).

## 1. Superfície de impacto e propriedade de estado

Esta rodada não adicionou páginas, menus nem ModelFactory. A UI continua consumindo a View do mesmo Host de destino; o que mudou foi
a entrega Host/Worker, a resolução explícita de subtarefas e o despacho de Bot/anexos. A superfície de exibição é a mesma em desktop e
celular, o que não significa que delivery ou identidade de workspace possam ser misturados.

```text
设置/身份/权益 -> Account 结果 -> Host 已应用 Registry
                        |
                  既有 Client 队列（read + RPC）
                        |
                 Worker Source：received
                        |
             配置来源匹配 -> Registry 整体 applied
                        |
           公共 Facade + 原选择 -> 临时有效选择
                        |
                提交/派发固定本次选择
                        |
                ModelFactory 精确校验
```

| Status | Owner único | O que esta rodada explicitamente não faz |
| --- | --- | --- |
| Seleção persistida original | Armazenamento original da Session, tarefa ou profile | Não grava vazio na consulta/atualização; não cria nova seleção de binding de Bot |
| current/direitos/modelos dinâmicos da conta | O mesmo resultado do Account Source do Host | Não grava current na configuração do Provider; não amplia para Provider comum/Off-Peak |
| Conjunto executável do Worker | Registry já aplicado no Worker | Não trata Source recebido como já aplicado |
| Modelo desta rodada | Selection fixada no admission / Active Model | O Factory não faz remap e não substitui a requisição fixada por causa de atualização em segundo plano |
| Conexão e recuperação do celular | Anexo shared-host / replayable já existente | Não inicia Host/Agent separado no celular e não altera o continuous do desktop |

## 2. Revisão item a item das cinco correções

| Item | Implementação e evidência | O que não foi exagerado |
| --- | --- | --- |
| P100-01 states completos | schema estrito compartilhado, serialização do Host e parse/source do Worker carregando tudo; conta comum hospedada com entitled=true e sem current é rejeitada. Testes reais de Built-in verificam a coleção do Registry e o resultado do Facade em pessoal→Team→pessoal | Ida e volta dentro de um processo não equivale à verificação de upgrade de implantação real via SSH |
| P100-02 recebido/aplicado | Passou a receivedRevision; em caso de falha não registra recebimento bem-sucedido. replace=false com o mesmo valor ainda faz refresh. O Server do protocolo chama o método de entrega de produção para verificar Source B/Registry A e, depois, a configuração B é aplicada | Reaproveita ensure/fila, sem reconstruir o ciclo de vida nem adicionar nova barreira de latest |
| P100-03 child explícito | Construtor do Node Facade compartilhado por Host/Worker; passado por DI a Core, Workflow e Script. Override tem prioridade; falha explícita não é herdada; o implícito mantém o Active Model do pai | A configuração atual de child comum e Script child desabilita a criação de Subagents; não se inventa uma funcionalidade de aninhamento ilimitado só para os testes |
| P100-04 Bot | Após o binding, read Session obtém a seleção original completa→mesma View→send com a seleção válida; quando inválida, não despacha nem altera a intenção original. `/model` e reasoning salvam imediatamente na mesma Session; o setter completo valida antes de salvar | Um harness de Bot sintético não substitui a evidência de requisições reais do Feishu/Worker |
| P100-05 anexos | task adapter, parâmetros de Agent, protocolo estrito e o intent do Core carregam Selection/modelExecution; credenciais de execução entram apenas em dependências não persistentes. No legacy, o backend espera o completion real antes de liberar a atribuição/controller desta rodada | Não transforma o legacy send em um novo caminho de replay/ACK do V4 |

Nova evidência na cadeia real de criação: `workflow-effective-selection.test.ts` executa um child real de Workflow e, pela ferramenta Agent
dele, inicia um Subagent explícito, afirmando que a execução final do modelo usa o novo Provider e que a Session pai e o profile não
mudaram.

`session-selection-cold-resume.test.ts` cria uma Session real já persistida, faz um setModel completo, fecha App/SQLite, reabre o banco e
o App e retoma; a execução final do modelo observa o mesmo Provider/modelo/high; uma seleção completa inválida não deixa meia
modificação. O Model executor é um substituto isolado, portanto é evidência de integração de runtime, e não deve ser descrita como
modelo em produção nem como E2E entre dispositivos.

## 3. Conclusões por entrada de consumo

| Entrada | Resultado da verificação / decisão |
| --- | --- |
| Composer | `useModelSelectionView` assina o serviço de destino; consumidores que carregam a intenção original relêm após o evento, sem aceitar diretamente o resultado transmitido de uma intenção sem chamador; generation/requestId descarta respostas antigas. Falha de leitura preserva a View pronta. Testes existentes passam; esta rodada não alterou React |
| Tarefas agendadas | `automationModelSelection.ts` faz getView(selection) na nova fronteira de envio, falha com issue/variante ausente e retorna effectiveSelection; só usa preferred quando nenhuma seleção é especificada. Execuções fixas não são re-resolvidas. Testes existentes passam |
| Wiki | `RepoWikiModelClient.readConfig(resolveIntent)` distingue explicitamente nova geração e página fixada preenchida depois. A primeira carrega a seleção para obter um valor válido; a segunda mantém a configuração já fixada; workspaceIdentity é repassado à leitura de destino. Testes existentes relacionados passam |
| Subagent explícito/implícito | O explícito passa pela porta local pública do Worker; o implícito, o override interno e o escopo de execução não fazem remap. Testes reais da ferramenta Agent e de retomada do child com nova entrada têm asserções de requisição |
| Workflow | O profile explícito do runtime filho real do Workflow foi verificado; o próprio Workflow pai herda as convenções de execução da Session original, sem escolha automática de outro modelo para ele |
| Script | `agent(..., opts.model)` é o parâmetro explícito atual de chamada programática, com seleção exata qualificada por provider; sem argumento, herda a seleção do pai. Script child é proibido de iniciar Subagents, mas o DI ainda é repassado. Esta rodada não alterou a semântica dessa interface de programa |
| Título / título do Goal | O sidecar usa a configuração explícita de title ou a seleção da Session, aplicando após a criação exata as opções auxiliares já existentes de baixo custo; não é consumo de um rascunho de UI arbitrário. Nenhuma entrada nova de seleção de modelo na UI foi adicionada; esta rodada não altera o contrato e não afirma que ele já siga a conta automaticamente |
| Compact | Em execução, prioriza reutilizar o Active Model da entrada; o caminho independente padrão cria pelo valor exato da Session. Não se pode tratar cada requisição interna da compactação como nova intenção do usuário; mantido nesta rodada, sem troca sorrateira no Factory |
| Memory | A Extraction captura o Model que produziu o trabalho; o Dream cria pelo valor exato da Session por padrão. `captureProjectMemoryAgentContext` fixa modelo e contexto; esta rodada não redefine o contrato de agendamento do Dream |
| Off-Peak | Ticket/selectionScope/requestAuth são fixados junto com a entrada; os anexos completam as dependências de execução e o Ticket original não migra entre contas; o override interno não é bloqueado por falha de profile |
| Bot busy/Guide/fila | A resolução desta rodada foi adicionada apenas ao ramo de nova entrada ociosa. O ramo busy existente mantém a semântica de CommandInbox/entrada já aceita, sem remap de desfila nem segunda fila de aceitação |
| Celular/SSH | A nova leitura usa o workspaceIdentity do target da tarefa; o setter de Session/o protocolo de anexos reaproveita o serviço original, sem alterar attachment, owner/lease nem deliveryKind. Implantação real e a mesma Session em vários dispositivos ainda exigem evidência de produto separada |

Aqui "manter" não significa que todas as funcionalidades auxiliares históricas já implementam o futuro produto multi-conta; significa
apenas não confundir com a nova intenção/junção de execução decididas no Todo99. O Todo101 não está no escopo desta rodada.

## 4. Duas corridas parciais

### R100-02: reproduzida e corrigida localmente

Um atraso controlável em Source.read fez com que a ordem de entrega de registros da implementação antiga fosse account-4→account-3; a
fila original só serializava o RPC, não a leitura. Mover o read para a mesma fila Client original fez o teste falhar e depois passar, e
os testes completos de host providerRegistry passaram 14/14. Não se adiciona fila de merge, relógio nem retry.

### R100-01: troca de escopo observável reproduzida e parcialmente protegida

Experimento isolado em memória: readSettings obtém primeiro a seleção pessoal de A; em seguida a identidade passa a B e as
configurações passam a Team; a consulta de identidade/API usa B, mas a saída mostra pessoal current=true e Team current=false. Não é uma
suposição do tipo "toda assincronia tem problema".

O Resolver agora copia as configurações desta rodada e relê identidade e configurações no final; se houver mudança observável, rejeita o
resultado da rodada. Em especial garante que previousScopes não seja atualizado antes da rejeição, para que o B não publicado não
contamine a avaliação last-known-good. Os dois testes de intercalação (troca de conexão, troca de identidade) falharam e depois passaram, e
um turno bem-sucedido seguinte continua resetando previous corretamente.

Limitação: não foi introduzida uma generation global monotônica de conta, e não se pode afirmar que isso resolve toda a atomicidade entre
serviços de cenários A→B→A ou de troca após a conclusão da consulta. Reaproveita-se o AccountService existente e sua recuperação de
falhas, permitindo que um snapshot antigo completo esteja temporariamente disponível; uma futura reestruturação da montagem global de
contas será tratada à parte.

## 5. Livro-razão de verificação (append contínuo, sem passar aprovação parcial por completo)

Executado nesta rodada:

- Bootstrap de conta, seleção de protocolo, facade de Session, runtime de Provider, Workflow: 6 arquivos, 28 testes aprovados; além
  disso, 1 novo teste de recuperação fria em SQLite aprovado.
- Conjunto completo Core/Subagent/Script/Workflow/protocolo: 167 aprovados, 1 falha. A falha é o denylist remoto de Cron do
  baseline, detalhado na seção seguinte; não está tudo verde.
- providerRegistry do Host: 14 aprovados, incluindo regressão de leitura atrasada em ordem invertida.
- Resolver de conta + AccountService: 24 aprovados.
- Hook do Composer, despacho agendado, cliente/target do Wiki, AccountService: 5 arquivos, 38 aprovados.
- `pnpm typecheck` da raiz aprovado; `tsc --noEmit` do bootstrap aprovado; `pnpm lint` com 0 error e 39 warnings existentes. Essas
  verificações precisam ser executadas de novo após o incremento final.

Correção de fixture: o template antigo de process-provider-registry-runtime não tinha nameMap/wrapper de config, o modelo não tinha o
reasoningLevel obrigatório e a fixture de Personal carregava matchRules obsoletos, causando 4 falhas. Apenas as entradas de teste foram
alinhadas, sem afrouxar o Schema de produção e sem adicionar compatibilidade de formato não publicado; as 10 casos voltaram a passar.

Verificação de produto: no Air foi criado um diretório isolado `/Users/dev/zcode-todo99-e2e.AurUlf`, sem tocar no App diário em uso; a
instalação offline ainda falhou com o erro de chaveiro -25308 por causa da dependência Git privada do CUA. O usuário autorizou migrar
para o Pro, com SSH administrativo já disponível, e o diretório isolado `/Users/dev/zcode-todo99-e2e.1lO3PN`. W99-E01..06 continuam
pending até a obtenção das respectivas evidências de requisição/processo/cross-device; não se pode promover apenas com base nos testes
de integração desta página.

### Outras falhas existentes encontradas

O teste "SSH/WSL remoto desabilita todos os Cron por padrão" de `zcode-protocol.test.ts` continua falhando: o denylist real tem apenas
o Bash, enquanto o esperado tem mais 4 Crons. O baseline já tinha a mesma diferença; o código-fonte de produção mantém constantes de
ferramentas remotas e um import de identity sem uso. Não se apagou a asserção para deixar o item verde, nem se alterou unilateralmente a
semântica de produto do Cron; é preciso conferir à parte o contrato original de desabilitação.

## 6. Correções de documentação e do grafo

O codegraph está indisponível; a revisão seguiu pelos símbolos e cadeias de chamada reais, sem alegar indexação de todo o repositório. A
antiga afirmação do grafo de funcionalidades de que "Subagent explícito ainda aguarda design de protocolo" foi atualizada conforme a
montagem real de DI desta rodada; foram acrescentados o Node Facade, os codeSeeds do resolver de Subagent e o link do Todo99. Ciclo de
vida unificado, CLI independente, migração e Todo101 ficam explicitamente fora.

Também foi corrigido o trecho obsoleto na documentação da cadeia da ferramenta Agent: o campo oficial em Markdown já foi decidido no
Todo97 como `model` / `thoughtLevel` e não pode continuar sendo escrito como prioridade de dupla leitura do `modelSelection` não
publicado; trata-se de correção de documentação, e esta rodada não adicionou código de migração.

## 7. Verificação real no Pro e encerramento final (2026-09-09)

Diretório de testes `/Users/dev/zcode-todo99-e2e.1lO3PN`, Node 24.14.0, Electron/Chrome 146; foi usada uma cópia isolada do código do
worktree atual, sem alterar os dados diários nem o checkout Git do Pro e sem operar o chaveiro. O baseline de código é o do topo da
página, mais as alterações do Todo99 aguardando commit. Como `.git` está ausente na build, a versão aparece como unknown, e portanto a
versão embutida na build não pode substituir a origem registrada aqui.

| Caso / run | Resultado e evidência real |
| --- | --- |
| `conversation-session-model-provider-effective-selection`, `desktop-e2e-20260909104713317-p13081-192c13543a9c637f` | 2/2 aprovados: não enviado o original mantém a seleção, requisição real Team/high, seleção agendada antiga realmente despachada |
| `conversation-session-worker-effective-selection`, `desktop-e2e-20260909111544019-p19700-8c54b26069ee4be6` | 3/3 aprovados: W99-E01, E02/E03/E06, E04; ver a estratificação de evidência abaixo |
| `bots/manual-review/pending/bot-effective-selection`, `desktop-e2e-20260909112059410-p20639-1fd964b954aa4d72` | 5/5 aprovados: disponível/indisponível após binding, definição ativa da variante máxima, primeira dispensa/menu preservando a intenção original; este grupo continua sendo harness de tarefa sintético |

O `summary.json`, `summary.md` e `test-results.ndjson` de cada run estão em `packages/desktop/.e2e-artifacts/<run>/` dentro do diretório
de testes acima; a evidência de requisições de modelo está também em `network-capture/coding-plan-data-plane.json` e
`upstream-provider.json`. Logs volumosos do WDIO não entram no Git.

- E01 usa Electron, Host, ferramenta Agent e child Runtime reais, capturando adapter model-io: o Provider pessoal original do profile →
  Team real com o mesmo modelo/high, a sessão pai continua usando DeepSeek e os bytes do Markdown não mudaram.
- E02/E03/E06 são Node Host real→Worker stdio real em máquina real, sem alegar que uma página de celular foi clicada. A entrada de Bot
  reaproveita o task adapter de produção; apenas o IM e o upstream de conta/HTTP de modelo são substitutos isolados. A requisição
  seguinte é Team/high, `/model` aplica max imediatamente, `/think low` salva imediatamente e, após descartar o Worker, o resume mantém
  low; os anexos usam execution/high e FIRST/SECOND ordenados, e a Session low não é sobrescrita.
- E04 mantém de forma controlada o Worker A e o Host B; o teste original expôs um defeito real, não apenas problema de fixture: o
  ModelFactory falhava dentro do catch do Turn externo, apenas registrava log e não gerava TurnError/erro do V4. Um novo teste
  vermelho do Core prova que o evento é 0; a correção local envolve o catch de criação do Model, reutilizando o outcome existente, e o
  teste unitário e o Pro passaram. A aceitação inclui `turn.failed`, `phase:error` do V4, ausência de nova requisição de modelo e
  seleção original da Session inalterada; após a entrega de B, um novo envio realmente tem sucesso. Nenhuma barreira de sincronização de
  envio foi adicionada.
- Os 3 casos novos não são promovidos diretamente a formal. O check de fixture passa, mas há marker warning: as requisições de conta são
  tratadas pelo plano de dados mock de Coding Plan já existente e independente; o marker de rejeição não deveria disparar HTTP;
  `E2E_PLAN_NON_DEFAULT_MODEL` é um nome de constante e PARENT_DONE é texto de resposta. As duas requisições pai do DeepSeek estão
  registradas no manifest local do caso como synthetic/fast-text. A promoção posterior para Docker/formal precisa reunir os fixtures
  correspondentes pelo processo manual original, sem tratar o warning atual como anomalia de requisição em produção.

Verificações finais: `pnpm typecheck` da raiz aprovado; `pnpm lint` com 0 errors e 39 warnings existentes; build do Core, typecheck do
Bootstrap e typecheck:e2e do desktop aprovados. Host/shared direcionado, 7 arquivos, **257 aprovados**; Agent/Core/Bootstrap direcionados,
10 arquivos, **81 aprovados**; regressão existente de desktop/remote/web services, 6 arquivos, **42 aprovados**. Essas contagens são
por rodada de escopo e não somam execuções repetidas como número de casos independentes. A falha existente de Cron do grupo completo
de protocolo continua registrada na seção 5, sem se passar por verde em todo o repositório.

**Decisão final secundária:** o usuário respondeu "还没有，你甭管了先",adiando explicitamente a página Web da mesma versão e o teste conjunto
real no celular shared-host＋SSH do W99-E05. A implementação e a revisão desta rodada podem ser encerradas, sem alegar aprovação desse
item. Ciclo de vida sincronizado, transação global A→B→A, CLI independente e Todo101 continuam fora de escopo conforme a decisão
original. Publicar Host/Worker exige usar o mesmo lote de artefatos de protocolo; esta rodada não implantou o pacote Web para o usuário.

### Reverificação independente do código já commitado

Commit de implementação: `b4ffe44db0` (`fix(provider): complete worker account selection repair`), não enviado. Após o commit, os
outros fontes/testes de migração não commitados da cópia isolada do Pro foram restaurados para os arquivos desse commit, sem alterar o
workspace local original. Desktop e Agent foram reconstruídos e a spec de seleção efetiva do Worker **passou 3/3 novamente**:
`desktop-e2e-20260909112629814-p20925-4b9a692d8243878d`, com o mesmo padrão de caminho dos artifacts.

Também foi conferido por Git blob SHA-1 o conteúdo de `.ts/.tsx/.json/.mjs/.cjs/.yaml` em `packages`, `apps/zcode-cli` e `config`:
**6.754 arquivos idênticos ao commit de implementação, 0 diferenças** (a única diferença inicial foi um novo teste unitário do Core ainda
não sincronizado, depois completado; isso não afeta os artefatos de execução anteriores). Isso evita usar resultados de testes com
outro código de produção sujo misturado como aval do commit. A versão unknown do pacote implantado, o cache de build e registros
antigos de aprovação não foram usados como prova de origem.