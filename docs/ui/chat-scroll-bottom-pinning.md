# Chat scroll bottom pinning

> **Fato atual do V4**: `ConversationTimeline` detém a fiação de acompanhamento de fundo e de memória de rolagem; o módulo de memória é
> `packages/ui/src/lib/chatSessionScrollMemory.ts`.

A timeline do V4 mantém uma máquina de estados explícita de fixação ao fundo:

- `isPinnedToBottom=true` indica que o viewport atual está grudado na parte inferior das mensagens, acompanhando automaticamente até o fundo durante a saída em streaming, o thinking shimmer e as mudanças de layout das mensagens.
- `isPinnedToBottom=false` indica que o usuário já saiu da parte inferior, e a saída em streaming não pode sobrescrever a posição de leitura atual do usuário.

```text
                         用户回到底部 / 点击“回到底部”
                    ┌──────────────────────────────────┐
                    │                                  v
┌──────────────────────────┐  用户向上滚动且可离底  ┌──────────────────────────┐
│ FOLLOWING                 │ ─────────────────────> │ DETACHED                  │
│ 内容增长/缩短都继续贴底   │                        │ 所有布局变化都保持阅读权   │
└──────────────────────────┘                        └──────────────────────────┘
          │                                                     │
          │ running -> terminal：live tail 虚拟化、              │ terminal 折叠、测高、
          │ “工作中”历史自动折叠、动态测高                       │ virtualizer 补偿
          └────────────── 保持 FOLLOWING ────────────────────────┴─ 保持 DETACHED
```

`FOLLOWING / DETACHED` expressa a intenção de rolagem do usuário, e não o resultado geométrico instantâneo obtido a cada leitura de
`scrollHeight - clientHeight - scrollTop`. A mudança para o estado terminal faz a live tail migrar para o histórico virtual ao mesmo tempo em que o histórico "工作中" é recolhido como "已工作"; a estimativa do virtualizer, a medição real de altura e a animação de recolhimento alteram o `scrollTop` ao longo de várias fases de layout consecutivas. Essas mudanças não são rolagem do usuário para cima e não podem fazer `FOLLOWING` ser julgado erroneamente como
`DETACHED`.

## Comportamento

- Ao abrir uma task, a memória de rolagem tem prioridade de leitura; se a memória registra que o estado antes de sair era fixado ao fundo, ao voltar executa-se uma rolagem até o fundo e se continua fixado; caso contrário, restaura-se a posição de leitura salva. Sem memória de rolagem, rola-se até o fundo e entra-se no estado fixado.
- Após o usuário rolar, se `distanceToBottom > 48px`, sai-se imediatamente do estado fixado ao fundo.
- Quando o usuário volta para perto da parte inferior ou clica no botão "滚动到底部", restaura-se o estado fixado ao fundo.
- Quando um assistant em running entra em estado terminal, se ainda estava fixado ao fundo antes da troca, a live tail migra para o histórico virtual e, durante o recolhimento automático do histórico do assistant e a medição dinâmica de altura subsequente, continua grudada no fundo.
- Se o usuário já saiu da parte inferior, ou iniciar uma rolagem para cima no mesmo quadro da mudança de layout do estado terminal, a entrada do usuário tem prioridade; a mudança para o estado terminal não pode restaurar a fixação ao fundo nem puxar o viewport de volta para a mensagem mais recente.
- A busca dentro da conversa, o destaque dos resultados da busca global e a âncora de fork são rolagens de posicionamento, e devem sair do estado fixado ao fundo antes de serem disparadas, evitando que a próxima atualização de layout do streaming puxe o resultado da localização de volta para o fundo.
- O botão "回到底部" só aparece quando se está fora do fundo e existe uma render unit; ele não é exibido quando o conteúdo não tem overflow vertical.

## Prioridade dos Eventos de Rolagem

```text
同一帧内：用户滚动意图 > 显式定位动作 > 内容/测高/折叠布局变化
```

| 事件来源                                        | FOLLOWING 时          | DETACHED 时               |
| ----------------------------------------------- | --------------------- | ------------------------- |
| wheel/touch/键盘/滚动条向上离底                 | 立即转 DETACHED       | 保持 DETACHED             |
| 用户滚回底部附近                                | 保持 FOLLOWING        | 转 FOLLOWING              |
| 点击“回到底部”或提交立即开始的新 prompt         | 保持 FOLLOWING 并贴底 | 转 FOLLOWING 并贴底       |
| live delta、terminal 折叠、virtualizer 测高补偿 | 保持 FOLLOWING 并贴底 | 保持 DETACHED，不夺滚动权 |
| 查找、轮次导航、fork 锚点定位                   | 先转 DETACHED 再定位  | 保持 DETACHED             |

## Fronteira de Implementação

- O viewport de rolagem do fluxo da sessão usa `scrollbar-gutter: stable` para reservar o espaço da barra de rolagem vertical nativa, evitando deslocamento horizontal do conteúdo quando a barra aparece ou desaparece; desktop e Web no celular reutilizam a mesma regra.
- A fixação automática ao fundo usa `scrollRef.current.scrollTop = scrollHeight - clientHeight`, evitando o tremor causado por smooth scroll contínuo durante a saída em streaming.
- Quando o usuário clica em "回到底部" ou envia um prompt que precisa ser posicionado na mensagem mais recente, usa-se uma escrita de `scrollTop` instantânea e entra-se imediatamente no estado fixado ao fundo; no mesmo tratamento é obrigatório enviar de forma síncrona a memória de fixação da session atual, sem esperar um `scroll` posterior ou o cleanup do scope, garantindo que uma troca de session imediatamente em seguida ainda seja restaurada como "fixado ao fundo".
- O evento `scroll` só pode alterar a intenção de fixação quando estiver associado a uma entrada de rolagem real do usuário; a própria fixação do componente e as mudanças de `scrollTop` causadas por virtualizer/recolhimento/medição apenas atualizam a contabilidade geométrica e não alteram `FOLLOWING / DETACHED`. A entrada de rolagem do usuário para cima é registrada antes de o navegador despachar o `scroll` e, por isso, também tem prioridade para desfazer o acompanhamento quando ocorre no mesmo quadro do commit terminal.
- A memória de rolagem guarda apenas a posição de leitura renderer-local e a intenção de fixação ao fundo; ao trocar para outra task, se a saída em streaming continuar em segundo plano, a task que estava fixada ao fundo deve voltar a grudar no fundo ao ser retomada, evitando que o `scrollTop` antigo seja tratado como posição de histórico de leitura do usuário.
- A rolagem do usuário, a mudança de scope e o desmonte da timeline salvam o estado atual; a mudança de scope usa o snapshot before-mutation do React para ler o DOM antigo e conferir as rolagens para cima/para baixo ainda não despachadas, evitando que um rápido "rolar e trocar" seja sobrescrito pelo DOM da nova sessão ou armazenado por engano como fixado ao fundo.
- Na restauração da sessão, as rows podem chegar depois do scope da sessão; a visibilidade do botão "回到底部" precisa ser reconferida depois que rows/medição estiverem prontas. Assim que a intenção de restauração for ficar fora do fundo e já houver conteúdo rolável, o botão tem de estar disponível; não pode ser ocultado permanentemente só porque no instante da restauração `rowCount=0`, nem pode aparecer um estado em que o viewport está claramente fora do fundo mas a lógica ainda mostra-se fixada ao fundo.
- session scope, lease e rows têm de vir da mesma sessão: enquanto o lease não corresponder à session alvo, a timeline não consome a projection antiga. Quando uma tail window não vazia ou uma medição incompleta prende a posição fora do fundo em um limite temporário, a intenção original de restauração é preservada e é reaplicada depois que o histórico for completo; nesse meio tempo, a ancoragem por prepend não pode promover a posição temporariamente presa ao ancora final de leitura. A rolagem real do usuário continua com a prioridade máxima e cancela imediatamente a intenção de restauração pendente.
- A memória é isolada por workspace key, pane e scope de session/task, mantendo no máximo 200 itens; ela dura apenas enquanto o renderer atual existir, sem atravessar refresh, reinício do app ou sincronização entre dispositivos.
- Esta funcionalidade afeta apenas a posição de rolagem dentro do renderer e não muda a semântica das mensagens de task do desktop continuous nem do web remote replayable.

## Decisões de Cobertura

- Aceita o caminho de recolhimento/virtualização de running -> terminal com `following=true`, bem como os caminhos de competição com `following=false` e com "usuário rolando para cima no mesmo quadro do terminal".
- O desktop `desktop-continuous` usa E2E de controlled-stream para representar o timing real de streaming e de estado terminal; o corpo final usa texto natural suficientemente longo, de modo que uma altura rolável seja gerada de forma estável mesmo que o modelo não respeite quebras de linha explícitas.
- O Web no celular e o desktop reutilizam a máquina de estados de rolagem do renderer, provando a origem das entradas e a prioridade dos estados com focused tests; esta correção não adiciona snapshot, queue, owner, relay nem estado `web-remote-replayable`, e não sincroniza a posição de rolagem renderer-local do desktop para o celular.
- A forma específica do conteúdo de reasoning/tool/subagent, o tema e o locale não alteram a atribuição do direito de rolagem e não justificam um produto cartesiano; o E2E escolhe um trecho de assistant history recolhível como representante.