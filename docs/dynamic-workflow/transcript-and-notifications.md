# Dynamic Workflow: Transcrição e Notificações (spec)

Status: implementado. Este documento descreve o que uma execução de workflow deixa para trás
na transcrição do chat e nas notificações do agente principal; seus irmãos `presentation.md` (o
grafo e o painel de execução), `authoring.md` (o sistema de artefatos) e
`apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md` (estados terminais, o
journal) são responsáveis pelo que essas surfaces exibem.

## O que uma execução deixa para trás

Uma execução de workflow vive em segundo plano. Seu dono, o agente principal, toma conhecimento
dela por meio de notificações, e o usuário lê essas notificações na transcrição. Disso resultam
quatro surfaces:

| Surface | Onde | Quando |
|---|---|---|
| a **linha de notificação** | o turno da transcrição que um evento de execução desperta | todo estado terminal, toda pergunta escalada, todo hole, toda parada, todo lembrete de uma decisão deixada em aberto |
| o **cartão de conclusão** | o fim desse turno | apenas execuções concluídas |
| a **transcrição do script** | uma aba no painel lateral, uma por execução | qualquer execução que tenha tocado o projeto |
| o **dobra do epílogo** | a aba de transcrição de um subagente | cada pedido despachado pelo motor |

A regra por trás das quatro: a transcrição mostra o que o motor registrou, nunca o que o
modelo disse sobre isso. Todo número no cartão de conclusão é uma contagem do motor, todo cartão
na transcrição do script é uma linha do journal, toda linha de notificação é construída a partir
de um payload que o emissor cunhou no momento do evento.

## Notificações

Uma notificação de execução tem duas metades, cunhadas juntas no ponto de emissão. O **texto** é
o que o modelo lê: um bloco `<task-notification>` mais orientações sobre o que fazer em seguida. O
**payload** é o que a GUI desenha: um objeto estruturado `workflowNotification` que viaja no
`originMeta` da notificação. Nenhum é derivado do outro. Em particular a GUI nunca faz parse do
texto voltado ao modelo; se o payload estiver ausente, a GUI recorre a uma linha de título puro.

### O payload

`workflowNotification` é uma união discriminada sobre `BackgroundResultOriginMeta`. A fonte
zod é `packages/shared/src/zcode-protocol-v4/rows.ts`; o pacote de contratos carrega um espelho
TypeScript sincronizado à mão.

```ts
workflowNotification?:
  | {
      kind: "terminal";
      status: "completed" | "errored" | "stopped";
      stopReason?: "user" | "model" | "provider" | "interrupted"; // only when stopped
      summary: string;                 // ≤500, the same sentence the model reads
      result?: string;                 // ≤4000, the script's return value, serialized
      resultForm?: "prose" | "json";   // a string return is prose, anything else json
      resultTruncated?: true;
      error?: string;                  // ≤2000
      reports?: { count: number; shown: number; preview: string[] }; // ≤8 × ≤500
      artifacts?: { id; kind; title?; version; contentType?; primary?: true; description? }[]; // ≤8
      artifactsTruncated?: true;
      durationMs?: number;             // the lineage's active time, see "How long it took"
    }
  | { kind: "escalation"; qid: string; actor: string; question: string; context?: string; askedAt?: number }
  | { kind: "hole"; siteId: string; ordinal: number; name: string; type: string; prompt?: string;  // ≤4000
      draftPath?: string; line?: number; before?: string; after?: string; reachedAt?: number }
  | { kind: "stall"; sinceMs: number; reason?: string; cap?: number };
```

O lembrete para um agente principal ocioso ("Removendo um agente principal ocioso", abaixo)
não é membro desta união. Ele viaja em uma chave própria, ao lado de `workflowNotification`,
no mesmo `BackgroundResultOriginMeta`:

```ts
workflowBlocked?: { questions: number; holes: number; sinceMs: number };
```

O motivo é o que um cliente faz com uma linha que ele não consegue ler. Um cliente faz parse
de um quadro inteiro contra a sua própria cópia do schema, e a união é fechada: um `kind` que
o cliente não conhece falha o quadro, não a linha. O snapshot que ele então pede carrega a
mesma linha e falha do mesmo jeito, então o cliente não consegue abrir a sessão de jeito
nenhum. Uma chave que o cliente não conhece é diferente: o objeto que a contém não é
estrito, a chave é descartada, e a linha é lida como uma notificação de workflow sem payload,
o que desenha como a linha de título puro. A CLI e o desktop são publicados juntos, mas a
página remota do celular é implantada no seu próprio ritmo e pode ser mais antiga que a CLI
com quem ela fala. Então a regra para este payload é: um novo kind de notificação ganha uma
nova chave opcional, e `workflowNotification` não ganha membros. Uma linha carrega no máximo
uma das duas chaves.

`workflowBlocked` também é lido de forma tolerante pelos clientes que o conhecem: um valor que
falha contra o schema é tratado como ausente, de modo que uma mudança posterior na forma dele
degrada para a linha de título puro nesses clientes e não custa a sessão a eles.

O payload viaja na linha do cabeçalho do turno pelo protocolo e pelo snapshot, portanto é
limitado. O truncamento é honesto em vez de silencioso: `resultTruncated` significa que a prévia é
parcial e que o valor completo é alcançável por `GetWorkflowRun`; `reports.count` maior que
`reports.shown` significa o mesmo para os reports; `artifactsTruncated` significa que chips foram
cortados pelo limite ou por um kind desconhecido. O emissor trunca antes da construção, porque o
schema compartilhado impõe os mesmos limites e um campo longo demais faria a linha inteira falhar
ao ser persistida.

As entradas de `artifacts` são os entregáveis voltados ao usuário do script (publicados por
`artifact.*`, ver `docs/dynamic-workflow/authoring.md`). São uma coisa diferente de `result`, que
é o valor de retorno de nível superior do script. Apenas campos do tamanho de um chip viajam:
bytes e contagens de itens estão a um clique, no painel lateral. A única exceção é a
`description` do primário (≤500), carregada apenas naquela entrada, para que uma transcrição fria
possa desenhar a linha do entregável com as suas palavras. A lista é ordenada com o primário
primeiro, depois em ordem de publicação, antes de o limite de oito ser aplicado.

Duas coisas que o payload terminal não carrega. Tokens: no momento da emissão o tracker conhece
apenas o snapshot, e o uso vive na projeção da execução, então a GUI faz a junção por run id
quando precisa de um número de tokens. Bytes dos artefatos: o payload nomeia os artefatos; o
cartão e o painel leem seus bytes pelas consultas de artefato.

### Onde o payload é cunhado

| Kind | Emissor | Gatilho |
|---|---|---|
| `terminal` | o caminho de liquidação do tracker de tarefas em segundo plano em `packages/core` (`background-tasks.ts`), tanto para lançamentos de `CreateWorkflow` quanto de `ResumeWorkflowRun` | o snapshot terminal da execução chega |
| `escalation` | `dynamic-workflow-run-progress.ts` em `packages/core`, ao lado do evento de progresso da execução | um evento de execução `escalation-raised` |
| `hole` | `dynamic-workflow-run-hole-notification.ts`, chamado do mesmo lugar | um evento de execução `hole-reached` |
| `stall` | `dynamic-workflow-run-progress.ts` | um evento de execução `run-stalled` |
| o lembrete (`workflowBlocked`) | `dynamic-workflow-blocked-reminder.ts` em `packages/core` | a sessão pai ficou ociosa enquanto uma de suas execuções vivas tem uma pergunta em aberto ou um hole em espera ("Removendo um agente principal ocioso", abaixo) |

O payload terminal existe apenas quando o status do tracker é terminal **e** há um snapshot
presente. Uma execução cujo estado em processo foi perdido não tem snapshot e não recebe payload;
a linha recorre ao título puro. As palavras genéricas do tracker mapeiam-se nas da própria
execução: `failed` vira `errored`, `cancelled` vira `stopped`. Quando o snapshot declara `runStatus`
e `stopReason` (o serviço de execução os projeta a partir do journal), esses prevalecem.

Os emissores de escalation e stall nunca lançam: são observação, e a verdade da execução é o
journal. Um evento malformado é pulado com uma linha de log. Cada `escalation-raised` e cada
`hole-reached` gera exatamente uma notificação da sua própria espécie, nunca reenviada; uma
pergunta respondida ou um hole preenchido não gera nenhuma, porque a resposta foi a própria
chamada de ferramenta do agente principal. Uma decisão que fica em aberto é recolhida pelo
lembrete abaixo, que é uma notificação diferente construída a partir do estado da execução, e
não uma segunda cópia da primeira. Cada segmento de stall gera uma notificação; um sucesso posterior rearma o relógio sem uma mensagem de "destravado". O rótulo da
execução em ambas é a descrição do registro para a execução, senão o run id, e um subagente
anônimo é nomeado por sua referência estrutural `site@ordinal`, o mesmo fallback que o texto usa.

### Removendo um agente principal ocioso

Uma pergunta ou um hole é o único tipo de evento depois do qual a execução não deve nada e o
agente principal deve algo, e nada do lado da execução expira. A notificação da própria
execução desperta um turno. Esse turno pode não dar em nada de três maneiras: ele falha (um
erro de provider, o app fechando no meio da requisição), o modelo o encerra sem responder, ou
ele carregava vários avisos e um deles foi deixado passar. Nenhuma dessas deixa um rastro que
a execução possa ver, e se todos os ramos do script acabarem estacionados a execução nunca
liquida, de modo que também não chega notificação terminal. Então um segundo mecanismo
observa o estado em vez da entrega: **enquanto a sessão pai está ociosa e uma de suas execuções
vivas tem uma decisão em aberto, um relógio corre, e quando ele expira o agente principal é
avisado de novo.**

```
existe uma execução viva desta sessão?
      │ não  ──────────────────────────────▶ nada é armado
      │ sim
a sessão está rodando um turno, ou tem um enfileirado?
      │ sim ──────────────────────────────▶ nada é armado
      │ não: sua fila de comandos acabou de esvaziar (a borda ociosa)
    armado ── qualquer turno começa ──────▶ desarmado; armado de novo na próxima borda ociosa
      │ o atraso passa
lê o snapshot de cada execução devida
      │ pergunta em aberto ou hole em espera ──▶ um lembrete para essa execução
      │ nada em aberto ────────────────────────▶ nada; o próximo atraso, se houver, é armado
```

| Regra | Valor |
|---|---|
| O que o relógio mede | quanto tempo a sessão está ociosa: do momento em que sua fila de comandos esvazia (o último turno terminou, falhou ou foi cancelado) até agora. Um turno de qualquer origem o para, e a próxima borda ociosa o reinicia do zero |
| Primeiro lembrete | depois de 15 minutos ociosos |
| Segundo lembrete | depois de 30 minutos ociosos, contados a partir do fim do turno que o primeiro despertou |
| Depois do segundo | nenhum, até um reinício |
| Reinício para uma execução | seu conjunto em aberto muda: um evento `escalation-raised`, `escalation-resolved`, `hole-reached` ou `hole-filled` dessa execução. Se a sessão estiver ociosa nesse momento, o relógio ocioso também reinicia |
| Reinício para todas as execuções | o usuário envia uma mensagem: um prompt, ou uma mensagem desviada para dentro de um turno em andamento |
| Não é reinício | um turno despertado por outro aviso em segundo plano (um job Bash, uma parada, outra execução terminando), e o turno do próprio lembrete |
| Cobertura | um aviso por execução, listando todas as perguntas e holes que ela tem em aberto; nunca um por decisão |
| Devida | uma execução está devida quando o tempo ocioso alcançou o atraso que a sua própria contagem pede (15 minutos sem lembrete enviado, 30 com um) |

O relógio mede tempo ocioso em vez de tempo desde o momento em que a decisão foi levantada
porque os dois outros casos não precisam de lembrete: enquanto um turno está rodando, a
notificação original está ou na frente do modelo ou enfileirada atrás do turno, e uma segunda
notificação ao lado dela é duplicata. Uma sessão cujo turno está esperando o usuário (um
pedido de permissão, uma pergunta ao usuário) está em um turno, então o relógio dela não corre.

**Uma única fonte de verdade.** O que está em aberto é lido do `pendingQuestions` do snapshot da
execução e dos seus `holes` no estado `waiting` no momento em que o relógio expira, a mesma
projeção que `GetWorkflowRun` imprime. O lembrete não guarda cópia do conjunto em aberto; a
única coisa que ele lembra é quantos lembretes cada execução já recebeu. Os quatro eventos
acima servem apenas para esquecer essa contagem. Uma execução que não está mais viva
(liquidada, ou pertencente a um ramo de conversa que foi rebobinado) é pulada e sua contagem é
descartada.

**Um lembrete conta quando é enfileirado**, não quando o turno dele tem sucesso. Um provider
que continua falhando custa, portanto, dois turnos de lembrete e depois silêncio, em vez de um
laço de retentativa; a próxima mensagem do usuário inicia um par novo.

**O relógio pertence à sessão, não à execução.** A ociosidade é um fato sobre a sessão pai, de
modo que o lembrete não é um evento de execução: o motor não sabe dele e o journal não o
registra, ao contrário de `run-stalled`. Ele vive no processo que possui a sessão. Quando esse
processo sai, uma execução viva é parada como `interrupted` e a sua retomada levanta de novo
cada decisão em aberto com uma notificação da sua própria espécie.

**A entrega não acrescenta nada novo.** Um lembrete é um comando de notificação em segundo plano
comum: a mesma fila, a mesma admissão de ledger, o mesmo cercamento de ramo e a mesma queda por
encerramento das notificações acima, tanto no stream contínuo do desktop quanto no stream
replayable do celular. Com várias execuções bloqueadas, os avisos delas são enfileirados juntos
e seguem a regra comum da fila: os posteriores são desviados para dentro do turno que o
primeiro despertou, ou despertam um turno da sua própria espécie.

### O pipeline e a restauração a frio

O `originMeta` de uma única notificação é encaminhado como um objeto, do comando de runtime
através do ledger, da mensagem sintética de usuário, do payload de `TurnStarted`, do fato do
normalizador e da linha do cabeçalho do turno. O payload vem junto de graça. Três lugares
constroem o objeto campo a campo e portanto nomeiam o payload explicitamente: o schema de linha
zod (o zod remove chaves desconhecidas), o leitor de hidratação da transcrição (a restauração a
frio de outro modo o descartaria) e o espelho dos contratos. A hidratação valida o payload contra
o schema compartilhado e, diante de um valor malformado, mantém os três campos base e descarta
apenas o payload.

Um **turno em lote**, onde várias notificações chegam em um turno e o título vira `a · b · +N`,
deliberadamente não carrega payload. Um turno corresponde a uma linha; reivindicar o payload da
primeira notificação para todo o lote seria um relato incorreto. O turno em lote é renderizado
como uma linha de título puro.

### A linha de notificação

Um turno de resultado em segundo plano cujo `originMeta.backgroundSource` é `workflow` e que
carrega um payload renderiza uma **linha de ferramenta** no lugar do título puro: a mesma gramática
de `ToolLayout` de uma chamada de ferramenta comum, com um ícone, um rótulo de kind, um texto
primário e um corpo expansível. Notificações de bash e de subagente, turnos em lote e transcrições
antigas mantêm a linha de título puro. O contêiner do turno remove seu padding superior quando
começa com essa linha, de modo que o cartão fique no espaçamento de fluxo usual abaixo do turno
anterior.

| Kind | Ícone | Rótulo de kind | Texto primário | Corpo expandido |
|---|---|---|---|---|
| terminal, completed | `Workflow` | Workflow completed / 工作流已完成 | `· <run name>` | o resultado: prosa como parágrafo, JSON com indentação em um bloco de código com a linguagem e a barra de cópia; ambos limitados a 320 px com o corpo rolável |
| terminal, errored | `Workflow` | Workflow errored / 工作流出错 | `· <run name>` | o erro em um painel com borda destrutiva |
| terminal, stopped | `Workflow` | Workflow stopped / 工作流已停止 `· <reason>` | `· <run name>` | o painel de erro quando há erro (provider, interrupted), senão o resultado |
| escalation | `MessageCircleQuestion` | um de três estados vivos, abaixo | a pergunta, uma linha, 160 caracteres | a pergunta por completo, depois o contexto em texto sutil, depois há quanto tempo o subagente espera, depois o link da execução |
| hole | `Pen` | um de três estados vivos, abaixo | `· <run name> · <hole name>` (o type fica no wire para o modelo, nunca na linha) | o prompt por completo (com os valores que o autor interpolou, tal como os carrega), onde o hole se encontra (as fases antes e depois), o caminho do draft, depois há quanto tempo espera, depois o link da execução |
| blocked | `Hourglass` | Workflow waiting on the agent / 工作流等待主代理 | `· <run name>` | uma linha do que estava em aberto quando o lembrete foi enviado, `2 questions · 1 hole · open for 17 min` (uma contagem zero é omitida; os minutos são a espera da decisão em aberto mais antiga), depois o link da execução |
| stall | `Hourglass` | Workflow waiting on the model / 工作流等待模型 | `· <run name>` | uma frase nomeando os minutos, depois as linhas de fato `Retry reason` e `Max concurrency` / 「最大并发数」 quando presentes (a segunda é o limite compartilhado no momento da parada: um teto, então carrega a palavra do teto, nunca uma palavra que se leia como contagem do que está rodando) |

As palavras do motivo de parada são by you / by the agent / model error / process exited
(你停止的 / 代理停止的 / 模型侧错误 / 进程已退出).

A linha blocked, como a linha stall, descreve o momento em que foi enviada e não muda depois.
Se cada decisão foi respondida desde então está na linha da própria decisão, e essa sim muda
(abaixo).

Uma linha terminal é expansível apenas quando tem resultado ou erro; sem nenhum dos dois, não
tem chevron. Reports e uso são carregados no payload e não renderizados. Uma execução com erro
não usa o estilo de falha da linha de ferramenta: esse estilo significa "esta chamada quebrou", e
aqui o rótulo de kind já diz que o workflow falhou.

O cabeçalho recolhido de uma linha terminal termina com os **chips de artefato**: no máximo três
pílulas pequenas de artefato e um overflow `+N` (uma reticência quando o emissor truncou). Os
chips são renderizados sempre que o payload lista artefatos; são clicáveis quando o host fornece
um callback de abertura de artefato, que precisa apenas da sessão pai e do run id, e desabilitados
caso contrário. Um chip passa o `contentType` do payload para esse callback, então um artefato HTML
vai direto para a aba do navegador em vez da aba de artefato (`authoring.md`, "How the user sees
them"); o payload não carrega caminho de origem, então o handler faz essa busca. Quando a linha
está expandida os chips se escondem, porque o corpo fala por si.

O corpo expandido termina com um link **Open run details** (查看实例详情) quando o host consegue
abrir o painel de execução e a projeção da execução conhece o tool call id da execução. A
restauração a frio às vezes não consegue fazer a junção do tool call id; então o link está
ausente e os chips continuam funcionando.

### O estado vivo da linha de escalation

O rótulo de kind da linha de escalation muda conforme a execução avança, usando as perguntas
pendentes da projeção da execução e não qualquer texto:

| O que a projeção da execução diz | Rótulo de kind |
|---|---|
| a execução está presente e suas perguntas pendentes incluem este `qid` | Subagent is waiting for an answer / 子代理正在等待回答, com o tempo de espera atualizado a cada 30 segundos |
| a execução está presente e o `qid` desapareceu | Subagent question answered / 子代理的问题已回答 |
| a execução não está na projeção | Subagent asked a question / 子代理提出了问题 |

O terceiro estado é neutro de propósito: uma execução descartada pelo limite de oito execuções
recentes da projeção não diz nada à GUI sobre se a pergunta foi respondida. A linha nunca cintila;
uma pergunta estacionada espera pelo agente principal, não por trabalho. O texto da resposta nunca
é citado na linha: ele fica no cartão de ferramenta `ResolveWorkflowQuestion` adjacente.

### O estado vivo da linha de hole

O rótulo de kind da linha de hole muda com os `holes` da projeção da execução, nunca com texto:

| Condição | Rótulo de kind |
|---|---|
| a execução está presente e seus holes listam este `siteId` como `waiting` | Workflow waiting for code / 工作流留白 · 等待补全, com o tempo de espera atualizado a cada 30 segundos |
| a execução está presente e o hole está `filled` | Hole filled / 留白已补全 |
| a execução não está na projeção | Workflow left a hole / 工作流留白 |

A linha nunca cintila: um hole espera pelo agente principal, não por trabalho. O corpo nunca é
citado na linha; ele fica no cartão de ferramenta `FillWorkflowHole` adjacente
(`docs/dynamic-workflow/presentation.md`, "Holes on the timeline"). Um hole e uma pergunta são
duas linhas com dois ícones e dois chips, e nunca compartilham um: 「1 个问题」 e 「1 处留白待补全」
ficam lado a lado quando ambos estão pendentes.

### O que o modelo lê

O texto terminal é um `<task-notification>` do tipo `local_workflow`:

```
<task-notification>
<task-id>…</task-id>
<tool-use-id>…</tool-use-id>
<status>completed | errored | stopped</status>
<stop-reason>user | model | provider | interrupted</stop-reason>   (stopped only)
<description>run name</description>
<summary>one sentence</summary>
<result>…</result>                                                 (when the script returned)
<error>…</error>                                                   (when present)
<reports count="N" shown="M">…</reports>                           (when any)
<artifacts count="N" shown="M">…</artifacts>                       (when any)
</task-notification>

<delivery guidance>
```

A frase de summary diz como a execução terminou antes de o modelo ler qualquer campo:

| Desfecho | Summary |
|---|---|
| completed | `Workflow "<name>" completed.` |
| errored | `Workflow "<name>" errored: the script failed.` |
| stopped, user | `Workflow "<name>" was stopped by the user.` |
| stopped, model | `Workflow "<name>" was stopped by you (TaskStop).` |
| stopped, provider | `Workflow "<name>" was stopped on a provider error.` |
| stopped, interrupted | `Workflow "<name>" was stopped: the process that owned it exited.` |
| stopped, superseded | nenhuma notificação: o resultado do `AmendWorkflow` que a parou é o relato do modelo sobre a parada (abaixo) |
| state lost | `Workflow "<name>" failed because its in-process state was lost.` |

`<result>` é o valor de retorno do script serializado; nunca recorre à saída do lançamento, cujo
texto apenas diz que a execução começou. `<reports>` e `<artifacts>` são carregados para todo
estado terminal, já que uma execução que morreu na sua décima segunda pergunta ainda terminou
onze. Os itens de report vêm do snapshot terminal, que carrega os primeiros 256 em ordem de
report, e no máximo 8 MiB deles, como `reports` e o total real da execução como `reportCount`;
`count` é sempre `reportCount`, então uma execução com mais reports do que a seção mostra diz isso
em `count` versus `shown`, o mesmo sinal que a seção já dá quando seu orçamento de caracteres
esgota. A ordem importa para o teto geral de 120.000 caracteres: result e error primeiro, depois
reports, depois artifacts, depois guidance, para que o truncamento corte os suplementos antes do
desfecho. Para uma parada por provider o bloco `<error>` é um texto de forma fixa: o que deu
errado, o que fazer, uma linha de fato (`provider= model= subagent= phase= code=`) e a mensagem
bruta do provider.

A **delivery guidance** após o bloco diz ao agente principal como apresentar o desfecho e qual é
seu próximo passo. É escolhida por status e motivo de parada:

| Desfecho | Guidance |
|---|---|
| completed | apresente o desfecho como um entregável: conclusão, cada achado com sua evidência, o que foi verificado versus o que foi julgado, o que não foi coberto; trate os itens relatados individualmente; não reformule o grafo nem o script |
| stopped, user | o usuário a parou de propósito; não retome com `ResumeWorkflowRun` e não reconstrua com `CreateWorkflow` a não ser que pedido; apresente o que foi concluído e então espere |
| stopped, model | você a parou com `TaskStop`; se a parou para corrigir o script, emende-a agora com `AmendWorkflow`; senão apresente o que foi concluído e retome apenas se o usuário quiser |
| stopped, provider | o bloco de erro nomeia causa e correção; apresente o que foi concluído; resolva a causa com o usuário e então `ResumeWorkflowRun` com o run id; não reconstrua |
| stopped, interrupted | o processo dono saiu; apresente o que foi concluído e então `ResumeWorkflowRun`; passos já concluídos são reproduzidos a partir do journal |
| stopped, motivo desconhecido | ela pode ser retomada; pergunte ao usuário antes de retomar uma execução que você não parou |
| errored | apresente o que foi salvo, explique a falha e então corrija o script e submeta-o com `AmendWorkflow`; `ResumeWorkflowRun` recusará uma execução com erro. Quando a execução registrou um arquivo de script (`docs/dynamic-workflow/launch.md`, "Script files") a guidance o nomeia e diz para editá-lo no lugar e passar `path`, em vez de colar o script; uma execução sem um recebe a frase mais antiga |

Quando a seção `<artifacts>` está presente, mais uma frase diz que os artefatos já estão diante do
usuário como cartões e devem ser referidos pelo título, não colados.

**Quem parou a execução.** O caminho de cancelamento da GUI e a ferramenta `TaskStop` do modelo
convergem em uma única rotina de parada, que passa o iniciador (`user` ou `model`) para a porta
da execução; o motor liquida a execução como `stopped` com esse motivo e o journal a mantém. A
notificação lê o motivo do snapshot; para uma porta antiga que não o relata, o `stopInitiator` em
processo do registro, escrito antes do abort, é o fallback. Um cancelamento do usuário também é o
que faz o próximo `AmendWorkflow` daquela execução pedir confirmação de novo.

**Uma execução substituída não tem notificação terminal.** Quando `AmendWorkflow` para uma
predecessora em execução, a execução liquida como `stopped(superseded)` e a política de notificações
do coordenador de tarefas em segundo plano descarta sua notificação terminal: o resultado de
ferramenta que o modelo já está lendo diz qual execução foi parada e qual a substituiu, e uma
segunda mensagem dizendo ao modelo "você parou a execução A, emende-a agora" o enviaria em
círculo. A entrada do registro ainda é reivindicada, então um `TaskOutput` posterior na
predecessora não ressuscita a mensagem. A sucessora notifica como qualquer execução. Na transcrição
a linha e o cartão da predecessora ficam onde estavam, com a palavra de status "Superseded" e um
link para a sucessora (`docs/dynamic-workflow/presentation.md`).

A mesma distinção chega ao modelo por mais dois canais. O bloco `<resumable>` de `GetWorkflowRun`
acrescenta a frase do motivo: parada de propósito pelo usuário, retomar sem alterações apenas
quando pedido; parada pelo seu próprio `TaskStop`, emendar agora se você a parou para corrigir o
script; um erro de provider a resolver primeiro. Seu rabo `<amendable>` nomeia `AmendWorkflow`, e
uma execução substituída recebe um bloco `<superseded>` apontando para a sucessora no lugar de
`<resumable>`. A descrição da ferramenta `ResumeWorkflowRun` detalha os cinco motivos, afirma que
uma execução que o usuário acabou de cancelar nunca é retomada por iniciativa do agente, que uma
execução interrompida normalmente deve ser, e que uma execução substituída é recusada.

O texto de escalation é um bloco `<workflow-escalation>` (run id, execução, question id,
subagente, pergunta, contexto) seguido do próximo passo, literalmente: chamar
`ResolveWorkflowQuestion` com o `question_id`. Ele afirma que apenas o subagente que perguntou
está estacionado, que o resto da execução continua, que nada expira, e que `GetWorkflowRun` lista
as perguntas em aberto caso a notificação se perca. O texto de stall é um bloco `<workflow-stall>`
(run id, execução, `since-ms`, motivo dominante, teto) seguido de uma frase dizendo que a execução
ainda está rodando, não precisa de nada do agente, e não deve ser cancelada nem reconstruída por
conta própria; o usuário pode pará-la pelo cartão da execução. Os três textos abrem com a faixa
padrão de notificação de sistema, para que o modelo não os leia como entrada do usuário.

O texto de hole é um bloco `<workflow-hole>` (run id, execução, hole id, nome, type, o prompt, o
caminho e a linha do draft, as fases antes e depois) seguido do próximo passo, literalmente: ler o
draft nesse caminho para o contexto, escrever o corpo e chamar `FillWorkflowHole` com o `hole_id`.
Ele afirma que apenas este ramo do script está estacionado e que o resto da execução continua, que
nada expira, que o corpo é compilado onde o hole se encontra e vê cada binding declarado antes
dele, que ele deve retornar o type nomeado, e que `GetWorkflowRun` lista os holes abertos caso a
notificação se perca. Abre com a mesma faixa que os outros três.

O texto do lembrete é um bloco `<workflow-blocked>` seguido do próximo passo. O bloco carrega o
run id e o nome da execução, `<reminder>` (`1 of 2` ou `2 of 2`), `<open-questions count shown>`
com um `<question id subagent waited-ms>` por pergunta, carregando seu texto e seu contexto,
`<open-holes count shown>` com um `<hole id name type line waited-ms>` por hole, e o caminho do
draft quando a execução registrou um. São listadas no máximo oito perguntas e oito holes, cada
texto cortado em 2.000 caracteres; `count` maior que `shown` diz que o resto está em
`GetWorkflowRun`. A prosa depois do bloco diz, nesta ordem:

- a execução ainda está esperando o agente, quantas decisões estão em aberto e há quanto tempo a
  mais antiga espera;
- o próximo passo, literalmente: `ResolveWorkflowQuestion` com cada `question_id`, e
  `FillWorkflowHole` com o `run_id` e cada `hole_id` depois de ler o draft;
- se uma decisão precisa do usuário, diga ao usuário exatamente o que é preciso e encerre o
  turno, e não chute uma resposta para fazer os lembretes pararem;
- no primeiro lembrete, que mais um vem se nada mudar; no segundo, que ele é o último até o
  usuário escrever ou as decisões em aberto da execução mudarem. As duas dizem que os ramos
  estacionados continuam esperando e que nada expira por conta deles.

## O cartão de conclusão

Quando o agente principal digere a notificação de uma execução **concluída**, a resposta que a
consome termina com um cartão: o que a execução entregou e quanto custou. Execuções com erro e
paradas não recebem cartão; sua linha de notificação já declara o erro e carrega seus artefatos
parciais.

### Quando o cartão aparece

`workflowTurnCompletion.ts` resolve um turno para uma entrada de cartão quando todas estas
condições valem: a origem do cabeçalho do turno é `backgroundResult`, a fonte da origem é
`workflow`, o payload é `terminal` com status `completed`, e o título não está vazio. Notificações
de escalation e stall, turnos em lote (sem payload) e notificações de bash ou subagente nunca
resolvem.

O cartão é renderizado uma vez que o turno terminou, nunca enquanto o agente principal ainda
escreve. É o primeiro bloco no fim do turno: depois do último parágrafo da resposta, antes dos
digests de execuções em andamento e de qualquer outro bloco de cauda. Um cartão por turno.

### O cartão

De cima para baixo:

1. **Cabeçalho**, o cabeçalho compartilhado de cartão de workflow: ícone, a palavra de kind
   Workflow completed / 工作流已完成, o nome da execução em monoespaçada, a lâmpada e a palavra
   de status, e um controle de abrir detalhes (⤢) quando o host consegue abrir o painel de
   execução e o tool call id da execução é conhecido. Nenhum chevron: nada no cartão expande. Os
   dois slots do cabeçalho carregam o próximo verbo desta execução — Save, ou Run again assim que
   ela tiver um workflow salvo, com um chip 「已保存」 ao lado do status ("Saving the run, and
   running it again" abaixo).
2. **Artefatos.** Com um primário (o artefato sinalizado, ou o único artefato quando há exatamente
   um): a **linha do entregável**, um fio de régua, e então os outros artefatos como o **índice**,
   uma linha cada, em duas colunas quando o cartão tem espaço para duas colunas de 220 px e em
   uma coluna caso contrário; no máximo seis linhas, e a partir de sete, cinco linhas e uma linha
   "N more" que abre o painel de execução. Sem um primário: apenas o índice, a partir do primeiro
   artefato na ordem de publicação, com o mesmo teto e a mesma porta. Nenhum artefato ganhou uma
   prévia, então nenhuma é desenhada. A porta mostra a contagem real assim que a lista é conhecida
   por completo: o payload é cortado em oito, mas a projeção viva (limitada nos 32 do motor) ou o
   journal responde com todos os artefatos, e o cartão conta o que fundiu. A reticência aparece
   apenas enquanto o payload é a única fonte: uma renderização fria sem sessão, um CLI antigo sem
   as consultas de artefato, ou os quadros antes de o journal responder. Um único artefato nunca se
   estica em um banner: o quadro da linha tem o tamanho de um tile. Sem artefatos a área de
   artefatos é omitida e o cartão ainda é desenhado, porque a execução terminou e custou algo.
3. Um fio de régua, e então **quatro figuras** em uma ordem fixa: tempo, tokens, subagentes,
   fases (时间 · tokens · 子代理 · 阶段). O valor é um número grande em monoespaçada com sua letra
   de unidade em tipo pequeno; o rótulo fica abaixo em texto sutil.

Uma figura que o cartão não consegue obter mostra `—` com o nome acessível Not available /
暂无数据, nunca `0`.

### Tiles de artefato

Um tile é um quadro de prévia (16:10) acima de uma linha de legenda, e o tile inteiro é um botão
que abre o artefato: a aba de artefato, ou a aba do navegador quando o artefato é HTML e o
workspace é local (`authoring.md`, "How the user sees them"). Sem um callback de abertura de
artefato o botão fica desabilitado: o que foi entregue é um fato, se pode ser aberto é uma
capacidade. A legenda é a gramática da pílula do artefato: ícone de kind, título, detalhe em
monoespaçada (`12 KB`, `CSV · 6 KB`, `4 items`) e um slot de cauda que mostra o número da versão
depois que um artefato tem mais de uma versão e troca por ↗ no hover. O mesmo tile é usado na
galeria do painel de execução, então um artefato parece o mesmo em todo lugar onde tem espaço. O
quadro de prévia é inerte e fica ao lado do botão no DOM em vez de dentro dele, porque uma
miniatura pode conter controles próprios (o botão de cópia de uma tabela, um link de arquivo) e um
botão não pode aninhar um botão; a área de clique do botão é estendida sobre o tile inteiro.

**A linha do entregável** é um tile deitado de lado: o mesmo quadro 16:10 em 160 × 100 px
(136 × 85 em um painel mais estreito que 380 px), depois, ao lado, o ícone de kind e o título um
degrau de tipo maior que uma legenda, a descrição do autor limitada a três linhas, e uma linha em
monoespaçada `kind · size` (`Document · 24 KB`, `Board · 9 items`). O slot de cauda é o do tile. A
linha inteira é um botão com a gramática de hover do tile. O destaque vem da posição, da forma e
das palavras, nunca de uma prévia maior e nunca de um rótulo.

**O índice** é o que os outros artefatos se tornam quando uma execução tem um entregável, e o que
todo artefato se torna em um cartão sem um: a linha de legenda do tile sozinha, 26 px de altura,
ícone de kind, o título completo (truncando apenas na borda da coluna), o detalhe mono, e o slot
de cauda. Sem quadro. Uma miniatura em um sexto do cartão é textura, não uma prévia, então a
regra é que uma prévia é legível ou ausente; a hierarquia vem da forma, o entregável pictórico
contra o resto textual, não de um quadro grande contra outros pequenos. As linhas fluem em colunas
`repeat(auto-fit, minmax(220px, 1fr))` no cartão e em uma coluna no painel, separadas da linha pelo
fio das figuras, para que o cartão se leia como três faixas de um recibo: o que foi entregue, o
que mais foi feito, quanto custou. O hover preenche a linha como uma linha de barra lateral, o
ícone vai para o foreground e ↗ substitui a versão. A linha "N more" é uma porta, não um
artefato: um ícone de reticência, texto sutil, ↗ em repouso; não lê bytes.

A prévia mostra o próprio artefato, por kind e tipo de conteúdo:

| Artefato | Prévia |
|---|---|
| markdown, ou `text/markdown` | a abertura do documento, diagramada com o dobro da largura e escalada por 0.5 (uma miniatura do conteúdo, não uma fonte menor), desvanecendo para a cor do painel nos 28 % inferiores |
| `text/plain`, `application/json` | o mesmo, como texto pré-formatado |
| `text/csv` | uma mini tabela das primeiras 6 linhas × 5 colunas, células cortadas em 28 caracteres |
| `image/*` | a imagem, cobrindo o quadro |
| chart, table, metrics, board | o corpo predefinido em forma compacta, alimentado pela consulta de dados do artefato |
| qualquer outra coisa (PDF, binário, muito grande) | um glifo discreto de folha com a extensão como badge |

Bytes são lidos apenas dentro dos limites: texto até 256 KiB, imagens até 4 MiB; além disso o
glifo é desenhado sem leitura. De um artefato de texto apenas os primeiros 8 KiB são decodificados
e os primeiros 1.600 caracteres são mostrados. Enquanto os bytes estão em voo o quadro fica em
branco; um erro de leitura recorre ao glifo. Uma prévia predefinida fica em branco até que sua
spec chegue do journal. Apenas os quadros desenhados leem bytes: no cartão apenas a linha do
entregável, no painel a linha ou os tiles da galeria; linhas de índice e a linha "N more" nunca
leem.

### De onde vêm os números

| Figura | Origem |
|---|---|
| tempo | `durationMs` no payload da notificação, o tempo ativo da linhagem (ver "How long it took"), escrito nas mesmas palavras do rótulo "worked for" do turno: segundos arredondados, no mínimo um segundo, no máximo duas unidades (`1h 3m`, `1 分 42 秒`) |
| tokens | `run.usage.spentTokens` da projeção da execução, juntado por run id; mostrado de forma compacta (`812`, `386.4k`, `1.30M`) com a contagem completa no tooltip. Para uma execução emendada este é o total da linhagem, predecessora incluída (`docs/dynamic-workflow/launch.md`, "The `AmendWorkflow` tool") |
| subagentes | `run.actors.length` da projeção |
| fases | `run.phases.length`, as fases percorridas; um script sem marcadores `phase()` não tem nenhuma, e a figura mostra `—` |

Os artefatos partem da lista do payload, que é persistida com a notificação e sobrevive à
restauração a frio. Em uma sessão viva a consulta de metadados de artefato então preenche tipo de
conteúdo, bytes, caminho de origem, contagem de itens, spec predefinida e descrição por id, e
acrescenta ao fim qualquer artefato que o journal conheça e que o payload tenha cortado. A
identidade permanece a do payload; a ordem é primário primeiro, depois a do payload. Um host sem
contexto de conversa (renderização estática, replay) desenha o cartão frio: artefatos do payload com
glifos, a descrição do primário vinda do payload, e quaisquer figuras que a junção tenha
retornado.

A projeção da execução guarda apenas as oito execuções mais recentes. Quando a execução foi
descartada, as três figuras da projeção mostram `—` e o cabeçalho não tem ⤢; tempo e artefatos
continuam aparecendo. Um reinício não esvazia a projeção, porque o CLI reproduz o journal nela na
partida a frio.

O cartão chega com a animação de entrada padrão; os tiles entram escalonados, e então as figuras.
Cada figura conta de 0 até seu valor ao longo de 640 ms, mas apenas quando o navegador reporta
explicitamente `prefers-reduced-motion: no-preference`; o primeiro quadro é sempre o valor final,
então renderização estática, testes e quem vê com movimento reduzido veem o número em repouso.

### Quanto tempo levou

A figura de tempo é o **tempo ativo da linhagem**: a própria vida da execução mais cada vida das
execuções das quais ela foi emendada, e nada entre elas. Duas coisas reiniciam um relógio que a
figura não deve reiniciar. Uma retomada é uma nova vida do mesmo run id, e uma emenda é um novo
run id que herda o trabalho concluído da predecessora a partir do cache; nos dois casos o processo
que finalmente liquida a execução a esteve segurando apenas pelo rabo do trabalho, e a reprodução
dos nós já concluídos leva segundos. Deixado ao próprio relógio do processo que liquida, um
workflow que trabalhou quatro horas e depois foi emendado uma vez relata os doze segundos da
emenda — ao lado de uma figura de tokens que é de toda a linhagem. As duas figuras respondem à
mesma pergunta e precisam ser contadas sobre o mesmo intervalo.

Uma vida é limitada pelo seu evento `run-started` e pelo último evento que registrou, então a
figura é uma soma sobre vidas lidas do journal: `Σ (último evento − run-started)` para a execução,
mais a mesma soma para cada ancestral alcançado por `resumedFrom`. O tempo ocioso entre vidas é
excluído, porque nada estava rodando nele — uma execução interrompida por um reinício na sexta e
retomada na segunda não trabalhou o fim de semana inteiro. O tempo ocioso *dentro* de uma vida é
incluído: uma execução estacionada em uma escalation está viva e esperando, que é a mesma coisa
que o rótulo "worked for" de um turno conta enquanto uma ferramenta é lenta.

O piso é o que o próprio processo que liquidou observou (`completedAt − startedAt` na sua própria
entrada). A resposta do journal normalmente é maior, já que abrange as vidas que o processo nunca
viu; quando não é — uma execução cujos eventos antecedem esta contabilidade, um journal que não
pode ser lido — a figura recorre à vida observada em vez de relatar menos que um número que sabemos
ser verdadeiro. Um snapshot sem nenhuma evidência de vida não carrega `durationMs`, e a figura
mostra `—`.

### Salvando a execução, e executando-a de novo

Uma execução que terminou é o momento em que o usuário sabe se o workflow valia a pena ser
guardado, então o cabeçalho do cartão carrega o verbo que decorre desse julgamento. O slot de
controle do cabeçalho — o lugar onde o digest da execução mantém Configure, Resume e Stop, vazio
em uma execução concluída — mantém **Save** / 「保存」 antes de o workflow ser salvo e **Run
again** / 「再次运行」 depois, ambos botões de contorno no tamanho do próprio cabeçalho, com os
ícones de salvar e de play. O slot inicial, onde o digest mantém seu chip de perguntas pendentes,
mantém um chip neutro **Saved** / 「已保存」 uma vez que a execução tem um workflow salvo: a forma
do chip de perguntas em `bg-surface`, nunca verde, porque a lâmpada ao lado já é verde e o chip é
um fato sobre um arquivo, não um status de execução. O chip é um botão que abre a página daquele
workflow no hub, com ↗ no hover; onde o hub não pode ser alcançado (o shell web de controle
remoto não o oferece) ele é desenhado como texto simples. Abaixo do cabeçalho nada muda:
entregável, índice e figuras são o recibo que sempre foram. Um cartão mais estreito que 480 px
(container query no cartão) descarta a palavra do botão e mantém seu ícone, com a palavra como
nome acessível e no tooltip.

O mesmo par fica no cabeçalho de status do painel de execução (`presentation.md`, "The run pane"),
no tamanho de botão daquele cabeçalho, antes de Stop, sempre com sua palavra (todo botão naquele
cabeçalho tem uma). A mensagem inicial do painel vai para a sessão pai da execução. Um cartão sem
nenhum contexto de serviço (uma timeline compartilhada somente leitura, uma renderização
estática) não monta nem o chip nem o verbo.

#### O popover

Save abre um popover (`WorkflowSavePopover`, o shell do popover de configurações: `align="end"`,
320 px, `rounded-xl`, título 「保存工作流」). Ele oferece duas formas de salvar, na ordem do valor
delas, e não do custo:

1. **O principal**, um botão primário de largura total: 「让 ZCode 帮我提炼保存」 / "Let ZCode refine
   and save it", com uma linha abaixo — 「ZCode 会帮你提炼出可复用的工作流，再交你确认。」 Um
   script que acabou de rodar é algo de uso único; o que o torna reutilizável é erguer para `args`
   os valores que mudam entre execuções e escrever a descrição e o quando usar, e só um leitor do
   script pode fazer isso. O botão envia uma mensagem de usuário nesta sessão (abaixo), mostra
   「已交给 ZCode…」 naquele momento e fecha. O modelo carrega a skill, chama `SaveWorkflow`, e a
   janela de confirmação existente pede aprovação, tabela de argumentos e tudo mais. Quando a
   sessão não aceita a mensagem (uma fila pausada esperando sua própria confirmação), o popover
   fica aberto e o botão retorna: nada foi entregue.
2. **O caminho literal**, abaixo de um divisor em fio rotulado 「或按原样直接保存」: três campos e
   um 「直接保存」 de contorno. Ele escreve o script exato que a execução executou, por
   `workflows/save` (`launch.md`, "Data path"), sem nenhum turno de modelo.

Os três campos servem a ambos os caminhos: o que for digitado viaja na mensagem que o principal
envia, e é o que o caminho literal escreve.

| Campo | Conteúdo |
|---|---|
| 名称 | o nome do arquivo, mono, com o sufixo `.dwf.ts` em texto sutil. Preenchido com o nome da execução só quando esse nome já satisfaz a regra de workflow salvo (`[A-Za-z0-9_.-]`, no máximo 64 caracteres, `launch.md`, "Names and scopes"); uma execução nomeada na língua do próprio usuário começa vazia, com um placeholder, porque um nome é um nome de arquivo. Linha auxiliar: 「字母、数字、`- _ .`，最多 64 个字符」; um nome inválido a transforma em erro e desabilita 「直接保存」. |
| 作用域 | 「项目」 ou 「全局 · 对所有项目可见」, com padrão projeto. Um projeto remoto oferece apenas projeto, com 「远程项目只能保存到项目里。」: `~` na máquina do agente não é um lugar que este hub leia. |
| 说明 | preenchido com o nome da execução, que é como o modelo chamou esta execução na língua do usuário e se lê como uma descrição de uma linha no hub. Auxiliar: 「「何时使用」和参数可以之后在工作流中枢里补。」 |

Abaixo dos campos, uma linha de consequência em texto sutil: 「将写入 {path}；之后可在「自动化 ›
工作流」按名字再次运行。」 Ela é substituída pelo aviso de sobrescrita — 「本项目已有同名工作流，保存
会覆盖它；已有的运行记录保留。」 em `border-warning/40 bg-warning/10`, com o botão lendo
「覆盖并直接保存」 — assim que um `workflows/get` com debounce diz que o nome está tomado. A mesma
sonda pergunta o outro escopo, e qualquer linha que esteja aparecendo ganha a frase de sombreamento
que o cartão `SaveWorkflow` já usa (「同名的全局工作流将被这一份遮蔽」 / 「本项目里已有同名工作流，
在这里会遮蔽它」) quando o outro escopo tem esse nome: sobrescrever e sombrear são fatos distintos,
e nomear apenas um implicaria que o outro não pode acontecer. Um projeto remoto não pergunta o
escopo global. O caminho na linha de consequência é definido em mono. Uma recusa do agente
substitui a linha pela sua e deixa o popover aberto: nada foi escrito.

Um agente velho demais para conhecer `workflows/save` — detectado do jeito que o hub detecta um
`scope` ausente, pelo erro JSON-RPC da sonda de capacidade abaixo — mostra apenas o principal: sem
divisor, sem campos, e a dica ganha 「当前 agent 不支持直接保存」. O caminho do modelo é o popover
inteiro ali, que também era o que ele era antes de este recurso existir.

Teclado: abrir foca o campo de nome; Tab percorre principal → nome → escopo → descrição →
「直接保存」; `⌘↩` / `Ctrl↩` dispara o principal a partir de qualquer campo; Esc fecha e descarta
o draft. Após um save o foco volta ao slot, agora Run again, e o chip se anuncia uma vez por
`aria-live="polite"` (「已保存到项目」 / 「已保存为全局工作流」).

#### A mensagem que o principal envia

Uma mensagem de usuário, enviada nesta sessão da maneira que o 「提升为全局」 do hub envia a sua
(`launch.md`, "Promote to global"): a GUI a escreve, o usuário não a confirma, e o roteamento da
própria sessão decide se ela começa agora ou vai para a fila. Ela nomeia a execução e seu id, pede
um workflow destilado em vez de uma cópia, passa o que os campos tiverem, e pede ao modelo que
devolva `run_id` ao `SaveWorkflow` para que o save seja atribuído a esta execução. Ela não carrega
o script: o modelo tem a chamada que o produziu, e a ferramenta lê o arquivo de que precisa.

#### Em qual workflow uma execução é salva

"Saved" é derivado, nunca lembrado no cartão: depois de um reload, de um save feito a partir de
outra janela, ou de um save feito no chat, a mesma regra responde. `workflows/forRun` (`launch.md`,
"Data path") responde no agente, onde estão tanto o registro de journal da execução quanto os
arquivos salvos, e devolve a própria entrada, então um workflow que o usuário tenha desde então
apagado deixa de ser um fato sobre esta execução. Três regras, em ordem:

1. **O que a transcrição diz.** Uma linha de ferramenta `SaveWorkflow` nesta sessão que teve
   sucesso e carregou `run_id` para esta execução nomeia um candidato; a consulta o resolve e o
   devolve quando o arquivo está lá. É assim que o caminho do principal aterrissa, já que quem
   nomeia o workflow é o modelo, não o usuário.
2. **O que a execução executou.** Um workflow salvo cujo corpo é byte a byte idêntico ao script
   armazenado da execução, escopo de projeto antes de global. É assim que o caminho literal
   aterrissa, e continua aterrissando depois que a conversa desapareceu.
3. **Como a execução é chamada.** Um workflow salvo cujo nome iguala o nome da execução, a regra
   própria do hub para atribuir histórico de execuções a um workflow (`launch.md`, "Cards"). É
   assim que uma execução iniciada no hub, ou via `CreateWorkflow` com uma fonte `saved`, aparece
   como salva sem que nada tenha sido salvo agora.

A consulta também é a sonda de capacidade: uma resposta de method-not-found marca o agente como
incapaz de salvar diretamente, e o popover mostra apenas o principal. Seu resultado é cacheado por
execução (e por conjunto de candidatos da transcrição, então um save feito no chat é uma nova
pergunta) e descartado sempre que o hub recarrega uma lista, então um delete feito no hub chega ao
cartão. Uma resposta ainda em voo quando o cache é descartado é jogada fora em vez de escrita de
volta. Um save literal vira o próprio cartão de uma vez, mantendo os argumentos da execução que ele
já tinha, e descarta todas as outras respostas, já que sobrescrever um nome pode mudar em qual
workflow outra execução é salva.

#### Executar de novo

Run again é o lançador do hub, a partir do cartão: o mesmo comando `startSavedWorkflow`, a mesma
sessão nova, a mesma navegação (`launch.md`, "The launcher"), com os argumentos desta execução —
os do journal, devolvidos pela mesma consulta — pré-preenchidos no diálogo de lançamento. Um
workflow de projeto sem argumentos começa imediatamente, como no hub; um global sempre abre o
diálogo, porque precisa do seu projeto 「运行于」, que começa no projeto em que esta execução rodou
(a lista do hub de projetos locais, como no hub). Um valor pré-preenchido é usado apenas para um
argumento que o workflow ainda declara. Enquanto a sessão está sendo criada o botão lê
「启动中…」 e fica desabilitado. Uma falha é um toast, ou um erro embutido no diálogo, redigido
pela própria tabela de motivos do lançador.

#### Portões

Save e Run again são retidos exatamente onde Resume é retido: uma conversa somente leitura, e um
workspace onde o modo dynamic-workflow está desligado (`launch.md`, "Gray release") — ambos
escreveriam um arquivo ou iniciariam um motor, e ambos chegam ao cartão pelo mesmo ponto de
fornecimento em `SessionPane`. O chip é um fato e permanece. Um cartão sem contexto de sessão
(renderização estática, replay) não tem controle nenhum e é o cartão que sempre foi.

## A transcrição do script

A timeline de uma fase mostra uma pílula para cada participante. A classe de lane `workspace` é o
próprio script: os passos `files.*`, `git.*` e `world.run` que o script executa sem nenhum modelo
envolvido. Sua pílula é rotulada Script / 脚本 (o identificador `workspace` permanece em código, no
id da lane e no tipo de aba). Clicá-la abre uma aba por execução que reproduz esses passos como
cartões de ferramenta em ordem de execução, aterrissando na fase clicada.

### A coluna do journal

O motor registra cada chamada `files.*` / `git.*` / `world.run` como uma linha `dwf_node` de kind
`world-read` ou `world-run`, chaveada por site e ordinal, com o resultado em `result_json`. A
transcrição também precisa dizer *o que* rodou, então a linha carrega `input_json`: um
`{ op, args, truncated? }` limitado, escrito na admissão junto com o hash da entrada e carregado
sem alteração pelo upsert de liquidação. O limite é 4.096 bytes serializados; uma entrada maior é
substituída por prévias de string por argumento, no máximo 8 argumentos de no máximo 400
caracteres, com `truncated: true`. O hash da entrada não é afetado: ele permanece a chave de cache, a
coluna é uma superfície de auditoria. Uma linha sem entrada registrada (um journal mais antigo)
tem `NULL`; a GUI então recorre ao rótulo de passo do grafo estático e a um kind genérico "Step".

### Duas consultas de leitura

Ambas são consultas de conversa v4 somente leitura, sem estado e seguras para reenvio, sem
parâmetro de sequência ou epoch, porque leem o journal e não há obsolescência contra a qual se
proteger.

| Método | Params | Resultado |
|---|---|---|
| `v4/conversation/workflowRunWorkspace` | `{ sessionId, runId }` | `{ nodes: WorkflowRunWorkspaceNode[], truncated?: true }` |
| `v4/conversation/workflowRunNodeResult` | `{ sessionId, runId, siteId, ordinal, maxBytes? }` | `{ status, result?, error?, truncated, totalBytes }` |

```ts
interface WorkflowRunWorkspaceNode {
  siteId; ordinal; kind: "world-read" | "world-run";
  op?; args?; inputTruncated?: true;           // absent on pre-column rows
  status: "running" | "completed" | "failed";
  error?: { code; message };
  summary?: { resultBytes; resultCount?; exitCode?; stdoutBytes?; stderrBytes? };
  createdAt; updatedAt;                        // journal timestamps; their difference is the step's duration
}
```

A lista nunca carrega um corpo de resultado. O schema de linha é estrito, e a consulta de
armazenamento não seleciona `result_json`; os números de summary são computados em SQL a partir do
JSON: comprimento em bytes do corpo, comprimento do array para resultados em lista e, para um
resultado de `world.run`, o exit code e os comprimentos em bytes de `stdout` e `stderr`. As linhas
voltam na ordem de inserção do journal, que é a ordem de admissão.

| Limite | Valor |
|---|---|
| linhas da lista | 2.000; o gateway corta a cauda e define `truncated` |
| comprimento de `op` | 32 |
| contagem de `args` | 16 |
| mensagem de erro | 2.000 caracteres, cortados pelo host |
| bytes de resultado | 32 KiB, o padrão e o máximo de `maxBytes`; o gateway limita |

**A autorização** é a mesma cadeia das leituras de artefato, e ambas as consultas a percorrem: a
linha da execução precisa existir, e seu `parent_session_id` precisa ser igual à sessão que chama
(um pai `NULL` é recusado). A lista também é autorizada, não só o corpo: os argumentos já são
caminhos e linhas de comando. As três recusas colapsam em uma única resposta, então quem chama não
consegue saber qual metade adivinhou. O gateway transforma uma lista ausente em `{ nodes: [] }` e
um corpo ausente em uma falha `notFound`.

**Limitar um corpo** preserva a forma em vez de recusar: uma string é cortada na cauda em uma
fronteira UTF-8; um array é cortado por elementos inteiros; um resultado de `world.run` mantém
`exitCode` sempre e divide o orçamento de bytes entre `stdout` e `stderr`, cada metade cedendo o
orçamento não usado à outra; qualquer outro objeto é serializado e, quando grande demais, cortado
como texto. A resposta carrega `totalBytes` de antes do corte, então o rodapé pode dizer "showing
the first 200 lines of 38 KB". Isso é a política oposta à das leituras do próprio script, que
recusam um resultado grande demais de plano, porque metade de um grep enganaria o script.

**Capacidade.** O método de lista não está na porta de journal do motor (o motor nunca enumera
nós por kind); ele vem das consultas de introspecção do adaptador de armazenamento e é sondado em
tempo de fiação. Um host ligado a um journal stub não registra nenhum dos métodos; o gateway
responde `capabilityUnsupported`, e o painel mostra "This session cannot show the script's steps.
Update the CLI to read them." em vez de uma execução vazia.

### Abrir a aba

A pílula é um controle apenas em uma execução viva cujo host fornece o callback de abertura; um
cartão estático, um draft e uma execução sem projeção não lhe dão nenhuma alça. A mesma regra
porta a linha do script na lista de fases do painel de execução. As pílulas de subagente e a pílula
do script são portadas separadamente: um host que consegue abrir transcrições de subagente mas
não o script deixa a pílula do script inerte. O rótulo acessível é "Open the script's steps at
{phase}" / 「打开 {phase} 处的脚本步骤」.

A identidade da aba é (workspace, sessão pai, execução), type `workflow-workspace`: uma aba por
execução, de qualquer fase a partir da qual foi aberta. `focusPhaseId` é um ponto de aterrissagem,
não parte da identidade. Abrir de novo funde o pedido na aba existente; um pedido que nomeia uma
fase substitui o ponto de aterrissagem, um pedido sem fase o remove. O título da aba é o nome da
execução (com fallback Script steps / 脚本步骤), seu ícone é um terminal, e seu rótulo de type
aparece no tooltip e na visão geral da aba. Ela tem escopo de sua conversa e nunca é coletada
pela limpeza de sessões de subagente: o journal sobrevive à execução, e a aba também.

### O painel

O painel se inscreve na projeção da sessão pai para o estado vivo da execução e para o grafo
estático, e lê as duas consultas ele mesmo; não há sessão por trás dele, então não embute um
painel de sessão. A lista é buscada na montagem e rebuscada quando o `lastEventSequence` da
execução viva sobe, com debounce de 250 ms porque um passo se liquida por três eventos. Os corpos
são buscados por cartão e cacheados por (sessão, execução, site, ordinal) apenas para linhas
liquidadas, até 256 entradas; um cartão recolhido e reexpandido, e uma segunda aba na mesma
execução, leem do cache.

O painel não é uma segunda timeline. O painel de execução mantém a única timeline; aqui as fases
são capítulos e não há lâmpadas nem trilhos.

- **Cabeçalho**: um tile de terminal, o olho-de-más Script / 脚本, o nome da execução, e a
  lâmpada e a palavra de status da execução. Uma segunda linha resume o livro: `3 phases · 9 steps
  · 4m 12s`, contando fases tocadas, cartões, e o intervalo da primeira admissão à última
  liquidação, avançando a cada segundo enquanto um passo roda.
- **Capítulos**: os cartões são cortados em capítulos por ordem de execução. Cartões consecutivos
  na mesma fase formam um capítulo; reentrar em uma fase inicia um novo capítulo com um badge
  ⟳n contando entradas. O cabeçalho de um capítulo mostra o nome da fase, o badge, uma régua, e
  `n steps · duration`. Cartões cujo site o grafo não consegue posicionar não têm cabeçalho de
  capítulo.
- **Aterrissagem**: ao abrir, o painel rola até o primeiro cartão da fase de aterrissagem, ou até
  o fim quando essa fase ainda não começou; o fundo do cartão aterrissado pisca uma vez. Toda
  abertura re-aterrissa, porque o pedido carrega um horário de abertura novo.
- **Placeholders**: uma execução que não tocou o projeto mostra "The script has not run anything
  yet" / 「脚本还没执行任何步骤」; uma sessão sem capacidade mostra o aviso de indisponível; uma lista
  cortada termina com "Only the first N steps are shown".

### Cartões

O kind de um cartão segue o `op` registrado, que é como os três contêineres de fachada se dividem:

| `op` | Kind | Primeira linha | Linha de resultado (liquidado) |
|---|---|---|---|
| `read` | Read | Read + um chip de arquivo | o caminho, bytes |
| `glob`, `grep` | Search | Searched + padrão, `in` + escopo | `n files` ou `n matches`, duração |
| `git-*` | Git | git + subcomando e argumentos | contagem ou bytes, duração |
| `run` | Terminal | Ran (ou Running) + a linha de comando, entre aspas como um shell | `exit n`, duração, bytes de stdout |
| ausente | Step | o rótulo de passo do grafo estático | contagem, bytes, duração |

Todo cartão tem um tile de kind à esquerda (tingido de vermelho quando falhou, âmbar enquanto
roda), as duas linhas no meio, e uma marca de régua de tempo à direita: `+m:ss` a partir da
admissão do primeiro cartão, ou `now` com uma lâmpada pulsante enquanto roda. O verbo de um cartão
em execução cintila e sua linha de resultado diz "started {ago} ago". Um cartão cujos argumentos
foram encurtados antes do journal encerra sua linha de resultado com uma reticência cujo tooltip
diz isso.

A palavra de status: uma linha falha mostra `timed out` quando o código ou a mensagem de erro diz
isso, senão o código de erro, em vermelho, com a mensagem como tooltip; um comando liquidado
mostra `exit n`, verde para zero e vermelho caso contrário, com a linha de comando como tooltip na
falha. O status vem do journal; a projeção viva apenas sobrepõe um chip `replayed` quando a
projeção marca o nó como um acerto de cache de retomada, ou seja, o comando não rodou de novo.

Cartões de Read não expandem; o chip de arquivo abre o visualizador de código no arquivo como ele
está **agora**, não um snapshot. Todo outro cartão é um botão que alterna seu corpo; o estado
expandido é lembrado por (sessão, execução, cartão) pelo tempo de vida da janela. Cliques dentro do
corpo ou do peek (selecionar texto, Copy, um chip) não alternam.

Um cartão Terminal recolhido e liquidado mostra um **peek**: as últimas três linhas não vazias de
`stdout`, ou de `stderr` quando `stdout` está vazio, com linhas que parecem erros em vermelho. O
corpo é buscado quando o cartão rola a menos de 200 px da viewport e vai para o mesmo cache, então
expandir depois não custa nenhuma leitura.

O **corpo expandido** depende da forma do resultado:

| Resultado | Corpo | Rodapé |
|---|---|---|
| `{ exitCode, stdout, stderr }` | `$ command`, depois `stdout` (até 200 linhas), depois `stderr` em uma seção levemente vermelha, ou "no output" quando ambos estão vazios | `exit n · duration · bytes` e Copy (copia `stdout`) |
| um array (`glob`, `grep`, arquivos alterados) | uma lista numerada, até 200 itens; matches de `grep` mostram o próprio número da linha do match, o caminho e o texto | `n files` ou `n matches`, duração; Copy junta os itens |
| uma string (`read`, `git-diff`, status) | texto pré-formatado, até 200 linhas; um diff colore `+`, `-` e cabeçalhos de hunk | duração, bytes |
| qualquer outra coisa | JSON com indentação | duração, bytes |

Sempre que o corpo foi cortado pelo limite de linhas ou pelo gateway, uma nota sob o rodapé diz
"Showing the first {shown} of {total}; the full result stays in the journal."

O movimento se limita a opacidade, transform e cor de fundo, e desaparece sob movimento reduzido:
o primeiro lote de cartões chega escalonado de 24 ms até 360 ms (cartões posteriores chegam de uma
vez), as réguas de capítulo crescem da esquerda, peeks e corpos se desdobram do topo, e uma palavra
de status alterada troca.

## O dobra do epílogo

Cada pedido que o driver despacha para um subagente é uma mensagem de usuário: as instruções do
script, e então um epílogo de qualidade (`---`, "Standard for this result:", uma lista de regras
sobre evidência e honestidade), e para um pedido tipado um epílogo de schema (`---`, "call the
`submit_result` tool…", o JSON schema indentado, ou uma frase quando o schema já está na
declaração da ferramenta). Um turno de nudge é uma mensagem que é inteiramente texto do motor:
"You ended your turn without submitting a result…". O leitor de uma transcrição de subagente quer
ver o que o script pediu; os epílogos se repetem literalmente a cada pedido, e um schema tipado
muitas vezes é mais longo que as instruções.

O driver portanto marca a fronteira: chama `executeTurn` com `epilogueStart` igual ao
comprimento das instruções, ou `0` para um nudge. A fronteira é um deslocamento, e não um segundo
texto, porque a mensagem persistida precisa permanecer inteira: uma execução emendada copia a
transcrição do subagente para uma nova sessão, mensagem por mensagem, e a devolve ao modelo, e um
texto de exibição armazenado tiraria o epílogo daquele histórico. O modelo recebe o texto completo,
a parte de texto persistida é o texto completo, e o hash de entrada do pedido, computado sobre as
instruções antes de o epílogo ser anexado, não muda.

O deslocamento viaja de dois jeitos para a mesma linha. Ao vivo, `TurnStarted.payload.epilogueStart`
chega ao fato do normalizador e à linha `userInput`. A frio, `persistUserPrompt` escreve o mesmo
valor nos metadados da mensagem, e a hidratação o lê de volta para o mesmo campo da linha,
aceitando apenas um inteiro não negativo. O schema de linha declara `epilogueStart: number, int,
non-negative, optional`. Uma linha sem o campo, na sessão principal, em um subagente comum ou em
uma transcrição antiga, é renderizada como antes.

Na transcrição a bolha desenha `text.slice(0, epilogueStart)` como corpo da mensagem e dobra o
resto em um disclosure rotulado Workflow engine instructions / 工作流引擎附加说明, recolhido por
padrão, colocado dentro da bolha abaixo do corpo e separado do próprio "expand more" do corpo. O
disclosure apara as linhas em branco iniciais do epílogo e o primeiro `---`, já que o próprio dobra
marca essa fronteira, e mantém o `---` posterior entre os dois epílogos. Aberto, mostra o texto
pré-formatado em monoespaçada, sutil, limitado em altura. Um deslocamento além do comprimento do
texto é tratado como ausente: melhor mostrar demais do que comer o corpo. Uma mensagem cujo corpo
está vazio (um nudge) ainda desenha sua bolha, contendo apenas o disclosure; a regra de corpo
invisível que suprime uma bolha é para mensagens só com anexos. O parse de contexto de prompt
(referências a arquivos e afins) vê apenas o corpo. O estado aberto é local à linha e não é
persistido. O TUI mostra o texto completo.

## Alternativas não tomadas

- **Um relógio contado a partir do momento em que a decisão foi levantada**: ele dispara
  enquanto o agente principal está no meio de um turno com a notificação original ainda
  enfileirada, o que acrescenta uma duplicata, e quando o agente já está ocioso ele apenas
  atrasa um lembrete que nada tornaria desnecessário.
- **Lembrar em um intervalo fixo enquanto a decisão estiver em aberto**: cada lembrete é uma
  requisição completa do agente principal sobre a conversa inteira. Um modelo que está
  corretamente esperando o usuário seria perguntado de novo a noite toda; dois lembretes e
  então a próxima mensagem do usuário limitam o custo.
- **Um lembrete por decisão em aberto**: vinte subagentes estacionados produziriam vinte avisos
  para um único fato, "esta execução está esperando você".
- **Reenviar a notificação da própria pergunta ou do próprio hole**: a transcrição mostraria
  duas linhas vivas para uma decisão, e várias decisões em aberto precisariam da forma em lote,
  que não carrega payload.
- **Retentar o turno de notificação que falhou**: ele precisa de um registro durável de qual
  turno entregou qual aviso e se ele terminou. Ler o que ainda está em aberto responde à mesma
  pergunta a partir de um estado que já existe.
- **Registrar o lembrete como um evento de execução**: o journal guardaria um fato sobre a
  ociosidade da sessão pai, e uma execução retomada reproduziria lembretes que pertencem a um
  processo que não existe mais.
- **Uma entrada de notificação em estilo de ledger** (réguas duplas com a legenda encaixada na
  régua de cima, uma grade de alinhamento, marcas de calha): em uma transcrição real introduziu
  novos elementos visuais sem informação; a gramática de linha de ferramenta faz de uma
  notificação uma irmã de toda outra chamada de ferramenta.
- **Renderizar reports e uso na linha de notificação**: a linha diz como a execução terminou; os
  reports pertencem ao painel de execução, e o payload ainda os carrega.
- **Um cartão de conclusão para execuções com erro e paradas**: a linha de notificação já declara
  o erro e carrega os artefatos parciais.
- **Derivar o payload da GUI fazendo parse do texto voltado ao modelo**: mudanças de redação
  quebrariam a renderização silenciosamente; o payload é cunhado a partir dos mesmos fatos de
  snapshot.
- **Linhas por notificação para um turno em lote**: exige um schema de lote; um turno em lote
  degrada para uma linha de título em vez de relatar mal um membro.
- **Uma segunda timeline dentro do painel do script**: o painel de execução possui a única
  timeline; os capítulos mantêm o contexto de fase sem trilhos.
- **Fazer snapshot do arquivo que um cartão de Read abriu**: o chip abre o arquivo atual; um
  snapshot pertenceria ao caminho de artefato copy-on-publish, não ao journal.
- **Armazenar um texto de exibição em vez do deslocamento do epílogo**: corromperia a cópia da
  transcrição que uma execução emendada devolve ao modelo.
- **Adivinhar a fronteira do epílogo a partir de `---` na GUI**: uma mudança de redação a
  quebraria silenciosamente, e um script cujas instruções terminam em `---` seria dobrado errado.
- **Tiles largos de artefato único no cartão de conclusão**: as prévias são miniaturas e não devem
  tomar o espaço do conteúdo. A linha do entregável mantém isso: seu quadro tem o tamanho de um
  tile, e o espaço que ela ganha vai para as palavras.
- **Um rótulo ou badge no primário** ("Primary" / 「主产物」): a forma da linha já diz isso, e uma
  palavra ao lado do título lê como ruído para o usuário.
- **Secundários como mini tiles abaixo da linha** (uma grade de seis colunas de quadros
  pequenos): a um sexto do cartão uma miniatura é textura, as legendas truncadas em dez
  caracteres, e seis quadros emoldurados pesam tanto quanto o quadro do entregável, então a
  hierarquia que a linha construiu se gasta. O índice mantém a legenda, que era a única parte
  legível.
- **Secundários como uma faixa de pílulas abaixo da linha**: pílulas não carregam detalhe, cortam
  títulos em 24 caracteres, e depois de um punhado embrulham em uma textura de cápsulas.
- **Adivinhar o primário** (o último artefato de conteúdo, o documento maior): errado exatamente
  quando importa; a única inferência mantida é o singleton, que não é um palpite.

## Perguntas em aberto

- Um lembrete chega apenas ao agente principal. Depois que os dois são gastos, quem pode mover
  a execução é o usuário, e nada fora das linhas da transcrição diz isso: se uma execução
  bloqueada deve levantar um sinal para o usuário (a barra lateral, uma notificação do SO)
  continua em aberto.
- Uma execução em que todos os ramos estão estacionados espera os mesmos 15 minutos ociosos que
  uma com apenas um ramo estacionado. Distinguir as duas coisas exige um sinal que una os holes
  estacionados do motor com as perguntas estacionadas do driver.
- Tokens não estão no payload terminal, porque o tracker não pode saber o uso no momento da
  emissão; a figura depende da projeção da execução. Uma consulta de uso apoiada no journal
  tornaria o cartão completo sem a projeção.
- Notificações de bash e subagente ainda são renderizadas como linhas de título puras; a gramática
  de linha de ferramenta tem espaço para elas.
- Reports viajam no payload sem renderização. Se a linha algum dia os mostrar, a cauda `count`
  versus `shown` ("N more in the run") é o contrato a honrar.