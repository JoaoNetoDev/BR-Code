# Limite do Turno em Execução no ChatLoading

## Contexto

`ChatLoading` expressa que o turno atual da sessão principal ainda está em execução. O assistant já ter
saído texto, reasoning, ferramentas comuns ou cartões de Agent/SubAgent não significa que o turno
terminou. Assim que o último turno principal ainda estiver como running e não houver um blocker de
espera do usuário ou de manutenção, exiba imediatamente; novos eventos de projection apenas atualizam o
conteúdo deste turno, sem redefinir nem atrasar o loading.

## Estado e temporização

```text
latest main turn enters running
              |
              v
       blocker currently active?
              |
              +---- yes: AskUserQuestion / permission / compact / goalVerifier
              |                         |
              |                         +---- hide ChatLoading
              |                                      |
              |                                      +---- blocker resolved
              |                                                   |
              |                                                   +---- show immediately if still running
              |
              +---- no
                                        |
                                        +---- show ChatLoading immediately
              |
              v
 success / failure / cancelled / stopped
              |
              v
         hide ChatLoading
```

## Regras

- Julgue apenas o último turno renderizado; linhas running remanescentes de turnos históricos não
  exibem `ChatLoading`.
- Quando o turno possui `turnHeader`, `turnHeader.state` é o fato autoritativo de running/terminal; um
  header já terminal não pode ser empurrado de volta a running por linhas de trabalho remanescentes ou
  atrasadas do mesmo turno.
- Apenas para compatibilidade com projeções antigas sem `turnHeader`, é permitido derivar running por
  fallback a partir das linhas de trabalho; tool/subagent com `backgrounded=true` pertencem a trabalho
  somente em background e não participam desse fallback.
- `ChatLoading` renderiza visualmente apenas a animação de loading, sem exibir "正在思考" nem outro texto
  visível; o nome de acessibilidade usa a semântica genérica de "carregando".
- Exiba `ChatLoading` imediatamente quando o último turno principal for `running` e não houver blocker,
  sem aguardar janela de silêncio.
- assistant text, reasoning, tool comum, Explore, Agent/SubAgent e suas tool descendentes não encerram o
  loading; quando uma nova revision de projection chega, mantenha a visibilidade atual do loading.
- Oculte `ChatLoading` quando o snapshot atual tiver uma pending interaction comum de permissão, ou uma
  pending interaction de userInput com `toolName="AskUserQuestion"`. O diálogo de permissão/caixa de
  perguntas já expressa "aguardando o usuário" e não deve exibir simultaneamente "正在思考".
- `toolCall.status="pendingApproval"` é o fallback em nível de linha para projeção de interaction ausente,
  recuperada ou em janela de reordenação; também oculta `ChatLoading`.
- Depois que a interaction for resolvida, se o último turno principal ainda for `running`, restaure
  `ChatLoading` imediatamente.
- Oculte `ChatLoading` sempre que `control.activeWorks` contiver `compact` ou `goalVerifier`; ambos já
  possuem feedback de timeline/status próprio.
- `primaryTurn`, `foregroundSubagent`, `goalContinuation` e `turnSteer` não são blockers de active-work e
  são exibidos imediatamente quando running.
- Oculte `ChatLoading` após o turno principal entrar em estado terminal como sucesso, falha, cancelamento
  ou parada.
- Não exiba `ChatLoading` quando tarefas de background ainda estiverem rodando mas o turno principal já
  estiver ocioso. Tarefas de background são expressas pela UI de controle de background e não podem manter
  a área principal de chat permanentemente em loading.
- Turnos comuns de assistant e turnos estruturados de resultado de background usam as mesmas regras de
  ciclo de vida de running.

## Layout e temporização de rolagem

O último turno em execução não pode continuar carregando `ChatLoading` como uma linha virtual com
posicionamento absoluto. Turnos históricos permanecem virtualizados, e o último turno running é renderizado
como live tail no fluxo normal do documento:

```text
timeline scroll viewport
├─ virtual history spacer
│  └─ completed / historical turn（absolute + measured）
├─ running live tail（normal flow）
│  ├─ streaming assistant / tool rows
│  └─ ChatLoading reserved slot
└─ sticky composer dock
```

- Quando chega uma revision de projection, o layout effect da timeline executa uma sincronização de
  rolagem ao fundo uma vez; mas subárvores como Markdown e blocos de código podem só terminar a medição
  real de altura depois do effect pai, portanto não se deve assumir que o commit da revision já contém a
  altura final.
- O `ResizeObserver` do live tail é o ponto de ancoragem final das mudanças reais de altura: o callback
  armazena em cache a altura necessária para a troca de estado terminal e, enquanto `following=true`,
  sincroniza a rolagem ao fundo novamente antes da pintura. Se o usuário já tiver rolado para cima, ou
  houver uma rolagem para cima ainda não contabilizada por scroll event, apenas armazena a altura em cache,
  sem retomar o controle da rolagem.
- Durante o período running elegível, o slot reservado e a animação de loading ficam visíveis de forma
  sincronizada; revisions de projection não aumentam nem reduzem a altura do slot.
- Após o fim do running, o turno retorna à lista virtual histórica; o estado terminal não exibe
  `ChatLoading`.

## Decisões e poda

| Estado candidato                                                       | Decisão                       | Razão                                                         |
| ------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------- |
| running + primary/foreground subagent/goal continuation/turn steer | accepted（显示 imediato）       | O turno principal ainda está avançando, o loading segue o fato de running |
| chegada de qualquer revision de projection durante running          | accepted(manter visibilidade atual) | A atualização do conteúdo de projection não muda o fato de running do turno principal |
| permission / AskUserQuestion / pendingApproval                     | pruned                     | A UI está aguardando ação do usuário, não expressa "正在思考"                      |
| active work contendo compact / goalVerifier                              | pruned                     | Já existe feedback dedicado de manutenção/verificação                                  |
| turno terminal ou trabalho somente em background                              | pruned                     | O turno principal já terminou, não se pode manter o loading do chat com fatos de background               |
| desktop continuous / web remote replayable                         | accepted(mesma regra de UI)   | Consome apenas o mesmo snapshot V4 após a convergência da sua cadeia de entrega, sem mudar o protocolo de recuperação |

## Limites multiplataforma

Esta regra altera apenas a projeção de exibição de `isRunning` do turno V4 pela UI; não modifica o ZCode
Protocol, snapshot, stream mirror, queue, owner ou estado de runtime:

- O desktop continua usando `desktop-continuous` direct realtime.
- O controle remoto por celular continua usando recuperação por snapshot / gap de `web-remote-replayable`.
- Ambos os lados consomem a mesma projeção de running/terminal do turno, `control.activeWorks` e
  `pendingInteractions`; após a recuperação, decidem imediatamente pelo estado atual do turno principal e
  pelo blocker se devem exibir `ChatLoading`.
- background tool/subagent podem continuar atualizando pela UI de controle de background, pelo painel de
  status e por turnos de resultado independentes; essas atualizações não podem ressuscitar um main turn já
  terminal como running, nem restaurar o `ChatLoading` do rodapé por causa delas.