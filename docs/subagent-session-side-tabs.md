# Subagent Session Side Tabs

## Objetivo

A entrada de detalhes do subagente no bloco de ferramenta de Agent da sessão pai usa o painel compartilhado à direita do workspace, em vez de um split do workbench. Depois de obter o destino da child session, o usuário clica na linha de resumo do Agent ou pressiona Enter/Space para criar ou ativar diretamente uma tab à direita, sem antes expandir os detalhes da ferramenta e clicar em um botão secundário. Cada `childSessionId` corresponde a uma tab de sessão completa em modo somente leitura, ficando assim livre do limite de 4 panes do workbench, enquanto mantém inalterada a capacidade de split de sessões comuns.

Escopo de aplicação: desktop, Web comum e a entrada de detalhes de child do `/remote` no celular. Desktop e Web comum usam tabs à direita; o `/remote` no celular reaproveita o drawer lateral existente. O diretório de subagentes e sua paginação só existem no desktop e no Web comum. Esta funcionalidade não muda owner, lease, snapshot, queue nem a semântica de recuperação replayable.

## Modelo de estado

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
├─ workspace 共享 tabs：Git / Browser / Code Viewer / Terminal / ...
├─ root session A
│  ├─ child A1 -> Explore project structure
│  └─ child A2 -> Analyze dependencies and config
└─ root session B
   └─ child B1 -> Explore source code features

切换父 task：
  tab 条 = workspace 共享 tabs + 当前 parent session 的 child tabs
  其他 parent 的 child tabs 继续挂载和订阅，但隐藏且不获取焦点
  切回 parent 时恢复该组顺序和最后激活项
```

- A UI distingue explicitamente `rootSessionId` (agrupamento de tabs), `parentSessionId` (lineage direta) e `childSessionId` (destino de assinatura de detalhes). Em childs de primeiro nível, root e parent são iguais; a identidade estável da tab de subagent é `workspaceKey + rootSessionId + childSessionId`, e cliques repetidos apenas ativam.
- O título usa uniformemente a task `title` fornecida pela entrada: a linha de resumo do Agent passa seu título visível e o painel Running passa o título projetado por `session/subagents`. Ao reabrir a mesma child, sincroniza-se o title não vazio mais recente; somente quando o title está vazio há fallback para o "子智能体" localizado, e não se pode mais concatenar `subagentType` ou numeração.
- As subagent tabs ficam apenas na memória do renderer e não são restauradas entre reloads. As workspace shared tabs mantêm a semântica de memória em nível de workspace já existente e não passam a ser de nível de sessão.
- Fechar, fechar outras e fechar todas afetam apenas o conjunto visível atual; as child tabs ocultas de outros parents não são afetadas. O registro de fechamento recente é isolado por parent session.
- Todas as child tabs não fechadas mantêm o lease de `SessionDataLayer`. A pré-visualização inline da mesma child e os detalhes à direita reutilizam a contagem de referências da camada de dados, sem criar assinaturas de transporte duplicadas.

## Limites de interação da linha de resumo

```text
Agent / Task 摘要行激活（永远不展开）
├─ childSessionId + open callback 可用
│  ├─ 普通桌面 / 普通 Web -> 创建或激活右侧只读 tab
│
└─ 手机 /remote -> 创建或激活现有右侧抽屉中的只读 tab
   └─ child 尚未投影或启动前失败
   └─ 静态单行摘要；不可点击，不创建临时 tab
```

- No modo de abertura direta, a linha de resumo inteira é um único ponto de entrada de ação, reaproveitando o focus ring existente e suportando mouse, Enter e Space.
- O modo de abertura direta não expõe `aria-expanded`, não mostra seta de expansão e não monta detalhes inline; ativar novamente uma tab existente apenas expande a barra lateral e foca essa tab, sem devolver a barra lateral ao estado fechado.
- Enquanto o child não é projetado, a barra lateral não abre sozinha; quando o destino chega mais tarde, o modo apenas muda para clicável, e só uma ativação explícita posterior abre a barra lateral.
- O botão duplicado "abrir à direita" não é mais mantido ao lado do título do Prompt inline.
- Agent e o alias compatível Task do Claude Code seguem a mesma regra; Workflow activity não faz parte desta funcionalidade.

## Detalhes de conversa somente leitura e exceção de undo de arquivos

Os detalhes à direita reaproveitam o `SessionPane`/conversation projection completo, exibindo a timeline inteira, o estado, os cards de tool, o resumo de arquivos e o diff somente leitura. A capacidade de conversa dos detalhes permanece somente leitura, com composer, retry manual do usuário, edit, fork, stop e respostas de permission/elicitation proibidos; o undo de arquivo workspace-only de um único turno é a única exceção explícita de escrita. O estado somente leitura do retry automático do provider não é a operação de retry manual e pode ser exibido no rodapé do turno em execução.

```text
child turnHeader.actions.canRewindFiles
├─ false -> 撤销按钮 disabled；不发 query/command
└─ true  -> fileRewindPreview(childSessionId, turn target)
            ├─ unsafe/ignored -> 不写文件
            └─ safe -> applyFileRewind(childSessionId, turn target)
                       -> 恢复真实 workspace
                       -> child RewindTriggered(scope=workspace)
                       -> session_entry 持久化撤销状态
                       -> child 文件摘要显示已撤销
```

- O undo segue estritamente a semântica de sessão comum: turno único, workspace-only e all-or-nothing; não desfaz a child session inteira, não recorta nem reescreve o histórico de chat child/parent, e não oferece reapply.
- O gate lê apenas a projection/action da própria child alvo; a task pai pode ainda estar em execução. Modificações do mesmo arquivo por fora ou pela task pai continuam sendo julgadas como unsafe pela verificação de hash do preview, sem novo guarda de busy de nível pai entre sessões.
- O apply atualiza apenas o estado de undo do turno da child e o arquivo real do workspace; não reescreve a linha do Agent pai, o diretório de Subagent, o agregado da task pai nem a timeline da sessão pai.
- O cold resume da child cria um novo epoch de raw event por meio de `SessionResumed`; o gateway apenas redefine o raw cursor, mantendo a transport sequence externa monotônica, garantindo que o subsequente `RewindTriggered` não seja julgado como duplicado pelo antigo high-water da child.
- `readOnly` não pode ser desligado por completo. A UI usa uma exceção explícita de capability de workspace file rewind, evitando abrir por engano o composer, edit/retry/fork/stop ou respostas a solicitações bloqueantes.

A conversa do pai não monta mais a pré-visualização leve da saída do child. Tanto subagents em primeiro plano quanto em segundo plano podem ser abertos pela linha de resumo sempre que houver `childSessionId`. Quando a projection atual da child tem `control.lastError`, os detalhes somente leitura mostram diretamente um notice de erro compacto; não se adiciona timeline row, campo de protocolo ou contrato de persistência para esse notice.

Os detalhes da child também exibem dois tipos de fatos de modelo pertencentes à child:

```text
运行中 provider retry -> snapshot.control.apiRetry -> 当前 turn 底部 x/total
fresh child 实际模型 -> ModelSelected(previousModelRef=null, modelRef=X)
                     -> model_change(undefined -> X) -> 无切换箭头的 "正在使用 X"
```

- O retry do provider vive apenas na memória do CLI/runtime atual; desaparece após progresso efetivo do modelo ou estado terminal do turno, e não é restaurado em cold start.
- O primeiro modelo real é persistido por meio do `model_change` do transcript da child e continua visível após a hydration do cold start.
- A projection pública reconhece apenas a fronteira de modelo explícita `∅→X` e não salva nem julga uma origin específica de Subagent.
- Main e child reaproveitam `SessionPane -> ConversationTimeline` e não podem ganhar um segundo conjunto de componentes de estado para a child.
- Nenhum dos dois tipos de fato entra no card de resumo do Agent pai, não altera o gate somente leitura da child e não adiciona parent mirror.

Os detalhes da child continuam repassando o callback de abertura e herdando explicitamente `rootSessionId`; o runtime atual proíbe subagent derivando subagent, então aqui só se preserva a identidade recursiva de UI e o contrato do reducer, sem restaurar a capacidade de runtime aninhado.

## Limites de eventos em tempo real

Causa raiz: o runtime da child grava os raw child events no event store da child, mas o sink de eventos original converte parte das atividades de ferramenta em apenas parent mirror event. Quando a UI assina `conversation/<childSessionId>` pela primeira vez, ela consegue ler pela hydration do store, mas os raw events seguintes não entram no publisher da child, então o conteúdo fica preso ao snapshot do momento da abertura.

```text
child runtime append
├─ raw child event -> child event store
├─ raw child sink -> route by event.sessionId -> publisher(child)
└─ selected mirror -> publisher(parent)

publisher(child) -> SessionDataLayer -> inline preview + all open child tabs
publisher(parent) -> parent timeline/index/legacy delivery
```

A implementação precisa satisfazer:

- Depois que um raw child event entra no bootstrap sink, apenas `publisher(child)` faz ingest e o retorno é imediato; não pode dar bump no `updatedAt` do pai, entrar na parent legacy delivery nem contaminar a timeline do pai.
- Os selected mirror events existentes continuam seguindo a cadeia do pai com o parent session id.
- Quando a child em execução já tem live publisher, subscribe/hydration de rows não pode fazer um cold resume extra; o histórico da sessão só é recuperado quando tanto o live publisher quanto o session record não existem.
- Uma child histórica concluída continua reabrível e hydratável pela entrada da sessão pai depois de um refresh do renderer.
- O resumo de arquivos usa o artifact reader compartilhado entre o child event log e o runtime pai; a tab de child somente leitura não usa o runtime pai para executar rewind.
- Depois que a child conclui e libera o live runtime, a session entry `runtime/workspace_checkpoint` precisa reconstruir o child checkpoint event no cold resume; preview/apply continuam acertando o runtime da child, e não podem restaurar apenas o resumo leve devolvendo listas safe/unsafe vazias.
- Deltas de alta frequência não escrevem `info` em produção; apenas em `debug` são registrados o registro do publisher, as assinaturas e a decisão de cold-resume.

## Interfaces e compatibilidade

- `SubagentSessionSidePaneTab` e `OpenSubagentSideTabRequest` da UI carregam `rootSessionId`, `parentSessionId`, `childSessionId`, `subagentType` e o `title` visível ao usuário; o workspace scope é injetado pelo App shell. `subagentType` serve apenas para label de tipo e dica de busca, e não participa da geração do título da tab.
- A identidade do workspace e a key de cache precisam usar `workspaceIdentity?.trim() || workspacePath`; a execução do caminho continua usando `workspacePath`, e o workspace remoto preserva `remoteSessionId`.
- Os detalhes em si não adicionam campos de Agent/error no wire; o diretório usa uma query somente leitura separada `session/subagents`, veja [subagent-session-directory.md](./subagent-session-directory.md). Não é preciso afundar o estado de negócio em main/relay.
- O desktop continuous e o perfil de delivery do Web comum existente permanecem inalterados; o `/remote` habilita apenas o drawer de detalhes da child, e não o diretório.
- Ao restaurar grupos antigos do workbench, remove-se o binding histórico de subagent somente leitura; grupos de sessões comuns não são migrados.

## Aceitação

- A mesma task pai pode abrir pelo menos 6 child tabs, sem aumentar o número de panes do workbench e sem criar tabs duplicadas em cliques repetidos.
- As tabs abertas pela linha de resumo do Agent e pelo painel Running usam literalmente o title autoritativo de cada um; não podem exibir títulos como `Explore 1` ou `general-purpose 2`.
- Quando há destino de child, o clique, o Enter e o Space na linha de resumo de Agent/Task abrem ou ativam os detalhes diretamente, sem expandir o Prompt/saída inline; quando falta o destino de child ou há falha antes da inicialização, o resumo permanece como uma linha estática.
- Uma child em execução continua anexando text/reasoning/tool/status após a abertura, e isso não é interrompido nem em grupos de parent não ativos e ocultos.
- Quando ocorre provider retry numa child em execução, os detalhes mostram um estado unificado `x/total` no rodapé do turno atual e ele desaparece após o progresso efetivo; a área de entrada continua inexistente.
- O primeiro turno de uma child criada após a alteração mostra o modelo efetivamente resolvido e continua restaurado após um cold start completo; children antigas não são preenchidas retroativamente e o Main não ganha um novo marker na primeira rodada.
- Trocar de task pai só troca o grupo visível de child tabs; as workspace shared tabs não mudam ao trocar de sessão.
- Raw events da child não alteram a sequência de tópico/tempo de atividade do pai; o estado do parent mirror continua atualizando normalmente.
- A identidade de workspace local/remota é isolada, desktop e Web comum usam tabs à direita e o celular `/remote` usa o drawer existente.
- Quando a child já concluiu e o resumo de arquivos pode ser desfeito, desktop, Web comum e `/remote` no celular conseguem completar preview/apply seguro; após o undo, o arquivo do workspace é restaurado e o resumo da child mostra que foi desfeito, com a task pai e o histórico de chat inalterados.

## Recuperação a frio, isolamento de lista e admissão de entrada do usuário (3.12.2)

### Resolução do diretório de projeto de sub-sessões remotas

Sub-sessões não entram no índice de tasks principal, e não se pode usar o childSessionId para consultar a
atribuição de projeto da task principal e decidir se a assinatura é permitida. O Host usa a query somente leitura
`session/list(sessionIds)` do mesmo Agent para consultar o tipo persistido e a relação pai-filho; após confirmar o
tipo de sessão auxiliar pela tabela abaixo, ele percorre a cadeia de pais até encontrar a task principal e, então,
o serviço de projetos existente valida projeto, Host e diretório. Quando a sub-sessão não tem workspace identity
salva separadamente, a query de ID exato da CLI só retorna se o cwd do child for igual e a cadeia de pais
persistida provar que pertence ao workspace solicitado; uma identidade explicitamente diferente continua sendo
recusada. A listagem comum continua excluindo children, e a query não regrava a identidade nem ativa runtime.
Cada sessão precisa corresponder à workspace identity e ao cwd do attachment atual; pai ausente, ciclo ou
travessia entre workspaces são recusados. Tasks principais remotas comuns continuam exigindo um projeto;
sub-sessões não são reconhecidas por prefixo de ID ou por linhas de índice antigas, não se criam linhas de task
para sub-sessões, e o escopo de diretório não é ampliado.

| Tipo persistido | Resolução de projeto | Lista principal | Entrada do usuário |
| --- | --- | --- | --- |
| `interactive`, `fork`, `workflow_parent` | o projeto da própria task | visível | mantém a admissão existente |
| `subagent_child`, `workflow_child` | após validar a cadeia de pais, usa o projeto da task principal pertencente | oculto | somente leitura |
| `selection_side_chat` | após validar a cadeia de pais, usa o projeto da task principal pertencente | oculto | pode conversar, mantendo as restrições de comando próprias da conversa auxiliar |
| `nested_workflow_child` | tratado como sub-sessão de workflow persistida; nenhuma nova entrada de criação | oculto | somente leitura |

Regressão de 2026-10-19: a correção original reconhecia apenas `subagent_child`, e workflows e conversas
auxiliares ainda consultavam o projeto pelo ID do child. A herança de projeto e a admissão somente leitura
julgam o tipo separadamente; não se pode substituir uma pela outra usando `parentID` ou o mesmo interruptor de
somente leitura; uma cadeia de pais mista é validada camada por camada, e mesmo que o índice antigo de child tenha
projeto, isso não pode pular a cadeia de pais da CLI. Um fork comum pode ter seu próprio projeto, e a herança
precisa parar no fork. Antes de reenviar uma conversa auxiliar, ao salvar a configuração Recent a UI consulta o
projeto usando a sessão principal registrada na barra lateral, e o destino do envio continua sendo o child; não se
pode consultar o projeto de um child que não está no índice principal, nem reescrever o Recent de uma sessão
comum ou de um fork no projeto do pai.

```text
desktop continuous / mobile replayable → mesmo Host → tipo de sessão persistido do Agent
  ├─ task principal → validação do diretório de projeto original
  └─ sub-sessão → validação da identidade da cadeia de pais persistida → validação do diretório de projeto da task principal pertencente
```

A relação pai-filho é mantida apenas pelo armazenamento de sessões da CLI, e a atribuição de projeto apenas pelo
repositório de projetos do Host; a query não adiciona cache, fila nem runtime, e o cold recovery e a assinatura
em execução usam o mesmo caminho. A regressão cobre child remoto em execução/concluído, ressubscrição, os dois
clientMode, o índice antigo de child, task principal sem projeto, e as recusas de pai ausente, ciclo e travessia
entre workspaces.

### Cold recovery e isolamento da lista principal

Causa raiz: depois que a 3.12.1 recicla o publisher detached da child, abrir os detalhes entra em cold recovery; o bootstrap omite o taskType persistido ao criar o record, o default é interactive e o sessions-index transmite a child como se fosse uma task principal.

A única fonte autoritativa de identidade é o taskType do Agent session store. O cold recovery precisa receber esse valor antes de registrar o record e publicar eventos; runtime e record de protocolo ficam consistentes. A lista principal projeta apenas interactive, fork e workflow_parent, e não pode usar a presença de parentID como substituta da visibilidade. O cache de transcripts continua sendo reciclado pelas regras existentes de grace de estado terminal e de liberação da sessão pai.

```text
child 完成 → publisher 回收 → subscribe → 读取持久化 taskType → 注册 subagent_child record
                                                               ├─ hydrate 只读转录
                                                               ├─ 主列表不可见
                                                               └─ 用户输入准入拒绝
桌面 desktop-continuous ─ direct stream ─┐
手机 web-remote-replayable ─ snapshot/gap ┴─ 同一个 Host / Agent 身份与命令准入
```

Comandos de entrada iniciados pelo usuário, como sendText, retry/edit e continuação de goal, rejeitam subagent_child, workflow_child e nested_workflow_child antes da escrita em session_input / input_history; uma child já ativada retorna o reasonCode `guard.subagentReadOnly`, e uma child em execução que ainda não tem record próprio continua sendo rejeitada pelo `proto.sessionNotFound` existente, sem nunca ativar um runtime extra para enviar entrada. O despacho normal de child pela ferramenta Agent continua sendo dirigido pelo runtime pai e não passa pela admissão de entrada do protocolo do usuário; o undo de arquivo workspace-only mantém os limites existentes.

A correção da poluição histórica é executada pelo Host task index syncer depois que a primeira baseline autoritativa de sessions-index do workspace chega: para as tasks que existem localmente mas estão ausentes da baseline, ele chama em lotes a session/list(sessionIds) somente leitura, confirma os tipos de sessão auxiliar ocultos na tabela acima a partir dos metadados persistidos do Agent e então apenas marca o task index correspondente como invisível, limpando as referências de agrupamento/ordenação; não apaga sessions, messages nem parts do Agent. A consulta não cria runtime, não lê transcript e não muda a atribuição. A identidade remota precisa percorrer workspaceIdentity / remoteSessionId, e os resultados assíncronos só se aplicam às gerações de assinatura ainda válidas; um Agent antigo que não suporta consulta explícita, uma session ausente ou uma falha na consulta preservam o índice, com nova tentativa na próxima baseline do workspace. Não se pode apagar apenas com base em ausência na baseline ou em parentID. O session/list comum continua retornando apenas os tipos da lista principal; a consulta explícita por sessionIds retorna as identidades persistidas que correspondem ao workspace (incluindo tipos ocultos), com no máximo 64 por lote, e includeArchived mantém o significado atual.

A sincronização completa por snapshot também não pode escrever os tipos ocultos da tabela acima como task principal; para as abas antigas já abertas e poluídas de subagente somente leitura, a admissão do backend continua rejeitando entrada. A correção não adiciona accepted queue, timer nem owner, e não muda os limites continuous/replayable.

Aceitação: SAT27 cobre warm, reciclagem por grace, liberação pelo pai, reabertura de detalhes após cold start e isolamento de lista; SAT28 cobre entrada do usuário rejeitada sem gravação no banco, tasks principais comuns, fork e despacho pelo Agent funcionando; SAT29 cobre convergência da poluição do índice histórico, isolamento de workspace identity, preservação em falha remota e preservação do transcript original. As duas clientMode são verificadas na camada de protocolo; o E2E do Electron passa por despacho real do Agent, reinício de CLI e clique nos detalhes, afirmando que o corpo da child somente leitura está visível e que não há child no lado esquerdo.
