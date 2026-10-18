# Conversa Lateral por Seleção na Conversa

## Resumo da funcionalidade

A linha do tempo da sessão principal, tanto no Electron desktop quanto na Web desktop, permite selecionar uma linha de texto e oferece duas ações:

1. **Adicionar à tarefa atual**: anexa a seleção ao composer principal como um chip de referência estruturada.
2. **Perguntar na conversa auxiliar**: prioriza anexar a seleção à child tab `selection_side_chat` ativa no momento; quando não há conversa auxiliar ativa, cria um novo child oculto e continua a conversa de múltiplos turnos no Side Pane à direita.

A página inicial do painel vazio do Side Pane à direita e o menu `+` no topo oferecem ambos a entrada **Conversa Auxiliar**. A entrada e a ação de seleção compartilham a capacidade de criação do `SessionPane` principal, mas a entrada fixa cria e ativa um novo tab de conversa auxiliar a cada clique. A mesma sessão pai pode manter simultaneamente múltiplos children, rascunhos de composer e interações bloqueadas.

O painel `/` do composer principal oferece adicionalmente o comando de camada App **`/side`** e seu alias equivalente **`/btw`** (adaptados a diferentes hábitos de usuário, exibidos de forma independente no painel). Quando o comando puro é selecionado no painel, um novo tab de conversa auxiliar vazio é criado e ativado, removendo o token de comando da entrada e sem enviar mensagem; ao submeter diretamente `/side <texto>` ou `/btw <texto>`, o texto após o comando é enviado imediatamente como a primeira mensagem comum do novo child. O parâmetro só aceita texto: quando existem anexos de arquivo, comentários de código, elementos web/PPTX ou referências de seleção de texto, o comando não é consumido como comando App e o fluxo de envio original da sessão principal é mantido. Os dois comandos são injetados pela camada de renderização fora do catálogo de slash commands da CLI, sem modificar o catálogo de comandos da CLI; se a CLI retornar um comando com o mesmo nome, a CLI prevalece, ocultando e não consumindo o comando App. Estado de rascunho (sessão ainda não criada), o próprio composer da conversa auxiliar, modo somente leitura e viewport móvel não oferecem esses dois comandos.

O cliente móvel não registra a entrada de seleção; “mais detalhes” não faz parte desta funcionalidade. A tela secundária serve para explicação e exploração leve, permitindo ferramentas normais, modificação de arquivos e interação de permissões, mas não oferece goal, edit/retry nem fork.

## Registro de esclarecimentos

| Boundary            | Decision                                                                                                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseline do child   | Derivado do limite de persistência estável mais recente da sessão pai; enquanto o turno pai está sendo gerado, mantém o user input já submetido e exclui incrementos incompletos de assistant/tool                                                                                                                                                                                          |
| linha de histórico selecionada | Afeta apenas o conteúdo da referência, não altera o baseline de fork do child                                                                                                                                                                                                                                   |
| ciclo de vida       | O avanço da tarefa principal, a troca de tarefa e o longo tempo sem uso não expiram automaticamente; não há implementação de TTL/recuperação por quantidade nem de card expirado                                                                                                                                                                                        |
| fechamento          | Fechar o tab, fechar outros/todos, exclusão/arquivamento da tarefa pai e saída da janela fecham o runtime live e removem o tab                                                                                                                                                                                               |
| reinício            | Não restaura tabs, rascunhos ou vínculos de UI pai-filho; o histórico de children ocultos pode continuar no SQLite                                                                                                                                                                                                   |
| child ausente       | `proto.sessionNotFound` remove o tab diretamente; esta ação de seleção pode recriar uma vez, sem exibir página inválida                                                                                                                                                                                               |
| blocked             | Quando o composer da sessão principal é ocultado por Permission/AskUserQuestion/ExitPlanMode, a camada flutuante não é exibida; quando a tela secundária está blocked, “Adicionar à tarefa atual” continua permitido e a ação da tela secundária fica desabilitada                                                                                     |
| limitação de capacidade | Envio normal, compact, ferramentas e interações de permissão na tela secundária; protocolo e UI proíbem simultaneamente goal, edit/retry, fork                                                                                                                                                                                           |
| seleção em assistant | Corpo de assistant completed e streaming, Markdown e código permitem seleção; o texto selecionado é congelado no momento da ação e deltas posteriores não reescrevem a referência                                                                                                                                                                       |
| payload de envio     | Novos envios usam o bloco estrutural `# userselect:` / `userselect`, cujos elementos de array mantêm apenas `{ text }`; o campo de origem é usado somente para deduplicação antes do envio e blocos estruturais completos antigos continuam compatíveis em modo somente leitura                                              |
| entrada fixa         | A página inicial do painel vazio e o menu `+` do topo oferecem “Conversa Auxiliar”; cada clique cria um novo tab; continua disponível quando a tarefa principal está running/blocked, e é oculta sem active task e no cliente móvel                                                                                                                |
| comandos `/side` `/btw` | Comandos de camada App com alias equivalente, injetados pela camada de renderização fora do catálogo da CLI, sem alterar a CLI (em caso de conflito, a CLI prevalece); comando puro selecionado cria um tab auxiliar vazio e remove o token, com parâmetro de texto submete a primeira mensagem do child; anexos/contexto estruturado não são consumidos; não disponíveis em rascunho, na própria conversa auxiliar, em somente leitura e no móvel; o texto de descrição se adapta por locale entre chinês e inglês, e a busca casa simultaneamente `side`/`btw` e “conversa auxiliar” |
| roteamento multiabertura | A mesma tarefa pai pode ter múltiplas conversas auxiliares abertas ao mesmo tempo; a seleção de texto é anexada ao tab auxiliar ativo; quando o item ativo não é uma conversa auxiliar, um novo é criado e ativado                                                                                                                                                                          |
| visibilidade do histórico | O histórico pai continua como provider context, mas a timeline do child, a busca, a paginação, a navegação de turnos e a contagem de linhas visíveis começam do zero                                                                                                                                                                                          |
| Goal na tarefa pai   | `active`, `paused`/`budget_limited` e `complete` permitem criação; ao copiar o corpo, o child remove `anchor.goalBoundary` e não copia session target, verifier entries, queue nem active work                                                                                                                                                                         |
| densidade visual     | A camada flutuante de seleção usa cerca de 32px de altura, fonte de 12px, padding compacto, `rounded-lg` e `shadow-md`; o texto para o usuário é unificado como “Conversa Auxiliar”                                                                                                                                                                              |
| troca de fork       | Quando a tarefa pai já tem uma conversa auxiliar, o fork para o child apenas oculta o tab vinculado ao pai; ao expandir o child, o Side Pane mostra a página inicial, e voltar à tarefa pai restaura o tab, o child e o rascunho originais                                                                                                                                       |

## Estado e propriedade

```text
Seleção válida na timeline principal
    |
    +-- Adicionar à tarefa atual ----> chip de referência no composer principal
    |
    +-- Ação da tela secundária
           |
           v
Consultar o activeTabId atual do Side Pane
           |
           +-- tab auxiliar live da tarefa pai atual ---> validar child, ativar tab, anexar referência deduplicada
           |
           +-- tab não auxiliar / sem tab ativo ---> criar child oculto, abrir novo tab, anexar referência
           |
           +-- mesmo gesto de criação ainda pending ------> mesclar a promise pending, evitando criação duplicada por duplo clique

Side Pane página inicial / menu + do topo / `/side`, `/btw` do composer principal
    |
    +-- sem active task / rascunho / móvel --> não exibe a entrada “Conversa Auxiliar”, o painel `/` não tem `/side`, `/btw`
    |
    +-- com active task (incluindo running/blocked)
           |
           +-- clique / seleção de comando puro --> criar child oculto, abrir novo tab, focar composer vazio
           |                                   (remove o token de comando da entrada)
           +-- submissão com parâmetro de texto --> criar e registrar o child, o primeiro texto é enviado no child startNow, abrir novo tab
           |                                   (queue/guide da tarefa pai permanecem inalterados)

Avanço da tarefa principal / troca de tarefa / longo tempo sem uso
    ---> não alteram o ciclo de vida do child

Fechar tab / exclusão-arquivamento da tarefa pai / sessionNotFound / saída do app
    ---> fecha o runtime live ---> remove o tab
```

| State / fact                       | Authority                            | Renderer state                                 | Persistence                    |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------- | ------------------------------ |
| child conversation e estado de ferramenta/permissão | CLI runtime/session store            | V4 projection                                  | SQLite hidden child            |
| parent → children/active da janela atual | renderer Side Pane registry          | tab único por child, `activeTabId` define o alvo da seleção de texto | não persistido                  |
| rascunho do composer e referências pendentes | o composer correspondente              | estado com escopo de session/tab                 | não persistido                  |
| chip de referência já enviado       | CLI session user message             | array de texto `# userselect:`                  | persistido com a user message   |
| isolamento de workspace             | session workspace ref                | `workspaceIdentity?.trim() \|\| workspacePath` | tab key e command route         |
| visibilidade da lista live          | CLI sessions-index/task-index filter | cache da lista de tarefas                      | root query exclui parented child |

## Recomendação de Start com o mesmo modelo

Antes de criar e submeter a primeira mensagem em `/side <texto>` / `/btw <texto>`, usa o provider/model/thought já em vigor no snapshot da sessão pai para determinar a recomendação de Start com o mesmo modelo; não lê o rascunho de modelo ainda não submetido pelo Composer pai. Quando falta uma escolha de herança completa e verificável, mantém o comportamento de herança do Host original e pula a recomendação.

Confirmar a troca passa o `firstInput.modelSelection` completo junto com o comando único `createSelectionSideSession`, e o Host o usa para criar o child e iniciar a primeira entrada; “Não” omite esse campo e mantém a herança original; fechar o diálogo não envia comando nem cria child, preservando a entrada original. Comandos puros e a entrada de tela secundária vazia não fazem recomendação. Os limites de ACK admission, deduplicação e continuous/replayable permanecem inalterados.

## Contrato de seleção e referência

- O escopo de escuta pertence a `SessionPane/ConversationTimeline`, não depende do DOM de input e não escuta o Side Pane.
- Suporta seleções de uma única row geradas por mouse e teclado. O conteúdo selecionável é o corpo de usuário/assistente, código, raciocínio e resultados de ferramentas.
  A região selecionável do assistant precisa estar em um contêiner DOM real e não pode depender de props de componentes Markdown que não repassam `data-*`; vale tanto para assistant completed quanto streaming.
- A referência de assistant streaming é congelada pelo `Selection.toString()` atual no momento em que o usuário clica na ação; deltas posteriores do modelo não reescrevem a `ConversationSelectionReference` já criada.
- Quando os extremos da seleção caem em um controle, menu, rótulo de status ou diálogo de bloqueio, nenhuma entrada é gerada; dentro da mesma região selecionável, ao atravessar de Markdown comum para uma célula de tabela, a barra de ferramentas de tabela com `select-none` intercalada na ordem do DOM não conta como seleção de controle e a entrada ainda é gerada. Seleções entre rows, apenas espaços em branco e rows virtuais já desmontadas não geram entrada.
- Rolagem, Esc, colapso da seleção, troca de tarefa e entrada no estado bloqueado da sessão principal fecham a camada flutuante.
- `ConversationSelectionReference` contém `id`, `sourceSessionId`, `sourceRowId`, `contentType` e o `text` original. A chave de deduplicação inclui todos os campos de origem e o texto; o mesmo texto em rows diferentes não é duplicata.
- No máximo 8.000 caracteres por item, no máximo 8 itens por composer e no máximo 16.000 caracteres no total. Excedentes são rejeitados atomicamente com uma mensagem localizada, sem truncar, sem limpar referências ou rascunhos existentes.
- A referência do composer antes do envio continua com os campos de origem completos, para deduplicação precisa, limites e hover de pendente; no envio, apenas o array `{ text }` é anexado ao bloco estrutural `# userselect:` com rótulo de linguagem `userselect`, evitando expor session, row, content type e ids internos ao modelo. Após a análise da timeline, apenas o corpo e os chips de referência são exibidos, e o hover de um chip já enviado mostra somente o texto selecionado persistido.
- Os antigos blocos `# Conversation selections:` completos, com rótulo de linguagem `zcode-conversation-selections`, continuam sendo analisados em modo somente leitura, garantindo que os chips de histórico existentes fiquem visíveis; novas mensagens não gravam mais o formato antigo e mensagens já persistidas não são migradas. Quando há simultaneamente Web element context, o Web element block final é analisado primeiro, e depois o selection block.

Novo formato de envio:

````text
# userselect:
```userselect
[{"text":"云计算"}]
```
````

## Contrato de protocolo e runtime

- O V4 adiciona o comando não CAS `createSelectionSideSession`. A sessão pai é especificada pelo `sessionId` do command envelope, e o payload é `{}` ou `{ firstInput: { text } }`; quando há `firstInput`, o child reaproveita o caminho de admission/startNow do `sendText` inicial. O resultado do ACK é
  `{ type: "createSelectionSideSession", sessionId, input? }`, e repetir com o mesmo commandId não pode criar nem enviar em duplicidade.
- O servidor deriva do record pai a referência completa de workspace, a identidade remota, model, thought, mode, followup mode e as regras de permissão; a UI não transmite campos de workspace identity montados por conta própria.
- O task type do child é `selection_side_chat`, com `parentSessionId`. Não copia goal, queue, tarefas em background, continuation inbox nem pending interaction.
- O histórico pai copiado é marcado item a item como `model-only`, `uiVisibility=hidden`, `providerVisibility=visible`; a hydration live e a cold devem usar a mesma projection policy. O histórico oculto não entra nas rows visíveis do child, no total count, em load-older, no conversation find nem no turn navigator.
- Após o copied history é gravado um boundary model-only: o histórico herdado serve apenas como referência e não continua a tarefa pai; apenas novas perguntas feitas na tela secundária são processadas; modificar o workspace precisa ser solicitado explicitamente pelo usuário na tela secundária.
- O boundary é registrado como reminder persistido de `selection_side_chat`, com channel `history_continuity` e lifecycle `resume_history`. O bundle de fork atômico guarda o raw text e os metadados de part source-aware; tanto a primeira montagem do child quanto as restaurações posteriores o hidratam como Runtime Attachment. Essa source pula explicitamente o MCS e sempre é emitida pelo projetor compartilhado como user `<system-reminder>` antes da nova pergunta do child, alinhando a posição do lembrete de `/btw`; a projeção MCS de outras sources mantém as regras originais.
  Não há pré-empacotamento de tags no corpo persistido, nem lembrete repetido a cada turno, nem migração de side chats antigos sem part metadata.
- `sendGoalCommand`, `resumeGoal`, `editUserQuery`, `retryTurn` e `forkAssistant` retornam `guard.selectionSideChatRestrictedCommand` para esse kind.
- O sessions-index e o task-index live, bem como as listas de projetos/conversas/grupos/fixados/arquivados, filtram esse kind; assinar diretamente o topic de conversation do child continua funcionando.

## Regressão E2E do lembrete de primeira rodada (SSC33)

O caso oficial `conversation-session-side-chat-reminder.test.ts` roda, na mesma execução de default replay, dois cenários independentes MCS/non-MCS. Depois que a sessão pai conclui uma chamada de ferramenta somente leitura, abre um child vazio pelo `/btw` puro, aguarda o campo de entrada do child ficar editável, envia uma pergunta comum que exige uma resposta fixa e aguarda a conclusão dessa resposta.

- non-MCS usa o `deepseek-v4-flash` padrão e o endpoint de replay local.
- MCS adiciona e seleciona `claude-opus-4-8` pela página de configurações, disparando a detecção de capacidade do modelo de produção; a requisição ainda é enviada ao replay local.
- Ambos os cenários afirmam: os metadados de part source-aware do fork boundary são preservados; o histórico herdado não aparece na timeline do child, mas entra no provider context; o corpo do lembrete aparece exatamente uma vez, como user `<system-reminder>` antes da nova pergunta; as mensagens da sessão pai não são reescritas pela entrada do child.
- Verifica-se separadamente, na requisição, se há outras mensagens `role: system`: no cenário MCS elas existem e no cenário non-MCS não existem, evitando interpretar a desativação total do MCS como exclusão correta da source do side chat. A resposta é fixada por uma fixture sintética local do caso e não é usada como evidência de identidade de modelo. Um teste unitário do core verifica adicionalmente a restauração por round-trip a partir do JSON real do fork bundle.

```text
fork: inherited history -> selection_side_chat Attachment -> child question
wire (MCS / non-MCS): user [<system-reminder>boundary</system-reminder>, question]
```

```bash
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/conversation-session-side-chat-reminder.test.ts'
```

A regressão oficial mantém apenas asserções de UI, persistência e requisição ao provider; o relatório de execução e as evidências de rede são coletados uniformemente pelo E2E runner compartilhado, sem gravar dumps completos de sessão, cópias de model-io ou screenshots duplicados nos casos.

## Side Pane e ciclo de vida

- Por janela e por `(workspaceKey, parentSessionId)` podem existir múltiplos children live simultaneamente; não é exigida sincronização da lista de tabs ou do alvo ativo entre janelas.
- A stable tab key usa `workspaceKey + parentSessionId + childSessionId`. Cada clique concluído da entrada fixa cria um novo child; cliques durante o período pending do comando são mesclados, e falhas não deixam tab vazio.
- Tabs auxiliares do mesmo pai são nomeados como “Conversa Auxiliar N” localizado; `N` é o menor inteiro positivo ainda não usado pela tarefa pai atual, e o número pode ser reutilizado após o fechamento, mas a identidade do tab é sempre determinada pelo childSessionId.
- Uma nova referência preserva o rascunho de pergunta do child de destino; uma duplicata exata apenas ativa o tab de destino, sem adicionar chip. Rascunhos, referências e estado blocked de children irmãos não são afetados.
- Quando o Side Pane está recolhido ou exibe outros tabs, o tab de destino é expandido e ativado, preservando os demais.
- A página inicial do painel vazio e o menu `+` do topo compartilham o mesmo resolvedor de item “Conversa Auxiliar”; a entrada só aparece no Electron desktop/Web desktop e quando existe uma sessão pai ativa.
- A entrada fixa não é afetada por running, Permission, AskUserQuestion ou ExitPlanMode da sessão pai; ela não anexa referências e sempre cria um child vazio novo. Children já existentes (inclusive o próprio blocked) continuam preservados e o usuário pode lidar com eles trocando de tab.
- Trocar a tarefa principal apenas oculta, sem fechar; voltar à tarefa pai restaura a session live, o rascunho e as referências originais.
- Se o Side Pane deve exibir o tab strip deve ser decidido pelo conjunto de tabs visíveis após filtrar pela tarefa atual. Mesmo que o workspace registry ainda guarde tabs ocultos de outras tarefas, quando o conjunto visível da tarefa atual está vazio a “página inicial de abrir abas” deve ser exibida, sem renderizar um shell de tab vazio.
- Todos os caminhos de fechamento chamam o `deleteSession`/close lifecycle do child; não entram em “fechados recentemente”.
- Não existe estado expirado visível para o usuário; uma desconexão temporária de rede segue a UI de reconexão já existente, sem criar um runtime substituto.

## Limites remotos e de entrega

```text
desktop renderer / desktop Web
        |
        v
parent session attached host --createSelectionSideSession--> child runtime
        ^
        |
relay / desktop main apenas autentica, despacha attachments e faz pass-through de rpc-frame
```

- Tanto localmente quanto via SSH/WSL/Docker, o child é criado a partir do shared-host attachment da sessão pai.
- O caminho remoto atravessa `workspaceIdentity` e `remoteSessionId`; é proibido casar apenas por `workspacePath`.
- O `desktop-continuous` do desktop mantém continuous direto; o `web-remote-replayable` remoto Web mantém os limites de recuperação snapshot/gap/owner/lease.
- O viewport móvel não exibe a entrada nem inicia um runtime separado para esta funcionalidade.

## Casos aceitos e podagem

| ID    | Setup / action                                                      | Expected evidence                                                                                               | Status                                                                                            |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| SSC01 | Primeira seleção de uma linha de texto comum e abertura da tela secundária | novo hidden child + active tab + chip pendente, sem envio automático | accepted |
| SSC02 | Nova seleção depois de já ter digitado uma pergunta no tab auxiliar ativo | reutiliza o active child, preserva o rascunho e anexa a referência | accepted |
| SSC03 | Seleção repetida com origem e texto idênticos                            | ativa o tab original, sem chip duplicado                                                                          | accepted |
| SSC04 | Seleção durante uma geração comum da sessão principal                 | permite criação; copia o limite de entrada estável, exclui saída em streaming, envio segue queue/guide        | accepted |
| SSC05 | Permission/AskUser/ExitPlanMode na sessão principal                    | toda a camada flutuante de seleção não aparece e é restaurada após a liberação                              | accepted |
| SSC06 | A própria tela secundária está blocked                                 | a ação da tarefa principal funciona; a ação da tela secundária fica desabilitada e é restaurada após o tratamento | accepted |
| SSC07 | sessionNotFound no child                                              | sem página expirada; o tab antigo é removido e esta ação cria um novo child                                   | accepted |
| SSC08 | Fechamento manual/fechar outros/fechar todos                           | runtime fechado, tab removido, fora de “fechados recentemente”                                                    | accepted |
| SSC09 | Reinício do app                                                       | os tabs não são restaurados; nova seleção cria um novo child                                                      | accepted |
| SSC10 | Trocar a tarefa principal e voltar                                    | ocultar/restaurar por tarefa pai, sem misturar session, workspace ou rascunhos                                  | accepted |
| SSC11 | Entre rows, acima do limite, texto de controle, cliente móvel           | nenhuma session criada; limite excedido mostra mensagem localizada                                              | accepted |
| SSC12 | Mesmo caminho remoto com identity diferente                            | vínculo preciso do shared host, sem misturar remoto nem iniciar runtime separado                                | accepted |
| SSC13 | Ferramentas e requisições de permissão de múltiplos turnos na tela secundária | executam normalmente e bloqueiam a interação, mas não entram na lista de tarefas                     | accepted |
| SSC14 | Adicionar à tarefa atual com seleções consecutivas                     | o composer principal preserva rascunho e acumula chips; novos blocos persistem só `{ text }` e os antigos são legíveis | accepted |
| SSC15 | A tarefa principal entra em um turno real subsequente do usuário        | a tela secundária original continua aceitando entrada, sem expirar nem ser recriada automaticamente            | accepted |
| SSC16 | Tentativa de goal/edit/retry/fork na tela secundária                    | a UI não tem entrada e a chamada direta pelo protocolo é rejeitada pelo guard unificado                        | accepted |
| SSC17 | Seleção no corpo do assistant completed/streaming                      | ambas as ações aparecem; a referência é congelada no texto do momento da ação, contentType=assistant            | accepted |
| SSC18 | Clique em “Conversa Auxiliar” na página inicial ou no `+` do topo       | as duas entradas têm a mesma semântica; cada clique cria e ativa um novo composer vazio                          | accepted |
| SSC19 | Primeira abertura ou cold restore do child após herdar o histórico pai | o provider mantém o histórico; todas as timeline/search/page/count de UI ficam vazias                            | accepted |
| SSC20 | Clique na entrada fixa com a tarefa principal running/blocked           | a entrada continua disponível; não aparece sem active task nem no cliente móvel                                | accepted |
| SSC21 | Ações em chinês e inglês na camada flutuante de seleção                | cerca de 32px de altura, fonte de 12px; em chinês o termo é unificado como “Conversa Auxiliar”                 | accepted |
| SSC22 | Fork para o child depois de a tarefa pai ter uma conversa auxiliar     | o child expande a barra lateral e mostra a página inicial; voltar à tarefa pai restaura o mesmo tab/child/rascunho | accepted |
| SSC23 | Tarefa pai com Goal em active, paused ou complete                      | os três estados criam child; o corpo do provider é preservado e o estado de execução ou a identity do Goal não são herdados | accepted |
| SSC24 | Seleção dentro da mesma row de assistant, de Markdown comum para célula de tabela com barra de ações | a camada flutuante aparece normalmente; botões da barra com `select-none` intercalados no Range DOM não fazem a seleção ser interpretada como de controle | accepted |
| SSC25 | Cliques consecutivos na entrada fixa de conversa auxiliar do mesmo pai | cria dois tabs com childSessionId distintos, com títulos exibidos como Conversa Auxiliar 1/2                     | accepted |
| SSC26 | Vários tabs auxiliares no mesmo pai; após ativar um deles, seleção de texto na timeline principal | a referência entra apenas no active child e seu rascunho é preservado; tabs irmãos não ganham referências | accepted |
| SSC27 | existem tabs auxiliares no mesmo pai, mas o tab ativo é de navegador/código etc. | a seleção na timeline principal cria e ativa um novo child auxiliar, sem adivinhar o tab usado recentemente | accepted |
| SSC28 | `/side` ou `/btw` puro no composer principal, selecionado pelo painel `/` | os dois comandos são exibidos de forma independente e têm comportamento equivalente: criam e ativam um tab auxiliar vazio; o token de comando é removido da entrada, nenhuma mensagem é enviada e o comando não é gravado no catálogo da CLI | accepted |
| SSC29 | Painel `/` aberto em rascunho (session não criada) ou no composer da própria conversa auxiliar | o painel não contém `/side` nem `/btw`; a lista de comandos retornada pela CLI não é afetada                 | accepted |
| SSC30 | Sessão principal desktop idle, com `/side 你好` ou `/btw 你好` no composer principal | submete o parâmetro de texto diretamente | cria e ativa um novo child; o primeiro user input do child é `你好` e é enviado imediatamente; `/side 你好` não aparece na timeline do pai | accepted |
| SSC31 | Sessão principal desktop running (pode haver active turn/queue existente) | submete `/btw 继续查一下` | a primeira mensagem do child é enviada no startNow; o active turn do pai continua e a queue/guide do pai e o workspace permanecem inalterados | accepted |
| SSC32 | Composer principal com anexo, comentário de código, elemento web/PPTX ou referência de seleção | submete `/side 你好` | não consome o comando App nem cria child; envia pelo caminho de entrada original da sessão principal | accepted |

Podagem: no cliente móvel verifica-se apenas a ausência da entrada, sem fazer o produto cartesiano da UI de seleção com a restauração física replayable; theme/locale são cobertos por componentes e representantes visuais; geração comum, queue/guideline verificam apenas que as rotas existentes não regrediram; família de ferramentas é coberta por uma ferramenta somente leitura representativa, uma ferramenta de escrita de arquivo e uma permissão, sem enumerar todas; caminho remoto igual é combinado apenas com identity/attachment, sem se espalhar para o estado de negócio do relay. SSC22 foi confirmado em 2026-07-16 para manter apenas o caminho representativo de conversa auxiliar do desktop continuous; outros tipos de tab session-scoped, remote/mobile e theme/locale não são repetidos em cruzamentos. SSC23 enumera apenas active (sem verifier), paused (verifier failed) e complete (verifier passed); `budget_limited` pertence à mesma classe de equivalência de paused, ou seja, “snapshot de Goal não concluído”, e não é mais cruzado com cliente, provider ou tema. SSC24 mantém apenas o caminho representativo “Markdown comum → célula de tabela” na mesma row de assistant; a seleção inversa compartilha o mesmo Range após a normalização do navegador, e streaming, theme, locale e remote/mobile não são repetidos em cruzamentos. SSC25/26/27 cobrem apenas desktop continuous, workspace local e dois tabs auxiliares; a identity remota continua coberta por SSC12 e não é cruzada com quantidade de aberturas, tipo de bloqueio ou theme/locale. SSC28/29 verificam apenas a injeção de camada App, a abertura por seleção e as barreiras de rascunho/tela secundária; as combinações de `/side` com quantidade de aberturas e locale são cobertas por testes unitários de palavras-chave i18n, sem cruzamento E2E. SSC30/31 mantêm apenas o parâmetro de texto, desktop continuous e workspace local nos dois estados representativos idle/running; SSC32 é coberto por testes focados de composer/parser e não é cruzado com cada classe de contexto estruturado.

## Handoff E2E

- SSC01/02/05/07/08/09/13/14/15/17/18/20/22/25/26/27/28/29/30/31 entram primeiro em `manual-review/pending` de conversation-session, usando marcadores `E2E_SSC_*` estáveis.
- SSC03/04/06/10/11/12/16/19/21/23/24/32 são cobertos principalmente por testes focados de componente, protocolo e service/core; SSC22 usa ainda um focused test de visibilidade do Side Pane para cobrir o branch de renderização compartilhado; os detalhes de construção sugerida, parsing de parâmetros e idempotência dos comandos de SSC28/29/30/31 são cobertos por testes unitários/de protocolo.
- A fixture de provider usa o `fast-text` local do caso; a permissão de SSC13 usa a fixture de interação já existente, e SSC07 usa uma injeção determinística de sessionNotFound, sem simular por sleep.
- Só após a confirmação manual são executados promote, fixture check, default replay e Docker admission.