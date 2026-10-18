# Assistant Row Actions (fato atual)

A área de ações de um assistant turn oferece copy, like, dislike, fork e retry, e exibe no final o horário de criação
daquela mensagem de assistant. A área de ações é fixada apenas após o último trecho de corpo de assistant concluído do turno; quando um turno tem múltiplos text parts,
ela não é repetida nos parts intermediários.

## Comportamento

- Copy copia o corpo de assistant merged daquele turno, e não apenas o último part.
- Like / dislike são feedbacks mutuamente exclusivos. Clicar novamente no item selecionado limpa o feedback; clicar no outro item troca diretamente.
- O feedback fica salvo apenas no estado local do componente `ConversationAssistantTextActions` atual; ele é limpo ao remontar o componente, ao recarregar ou
  ao reabrir a tarefa, e não é gravado no transcript, no banco de dados nem no renderer store.
- O clique apenas atualiza o estado do botão atual e reporta telemetria do app; não envia V4 command, não entra no histórico
  visível ao provider e não injeta nada no prompt do Agent seguinte.
- A disponibilidade de Fork é totalmente decidida pelo `row.actions.canFork` projetado pela CLI; uma assistant row estável em running
  também pode ser liberada pelo stable resolver da CLI, e o pane não adivinha por conta própria a partir da phase.
- Retry envia o V4 `retryTurn`, com alvo no turn/row correspondente.
- Fork envia o V4 `forkAssistant`; um ACK bem-sucedido retorna o child sessionId e, em seguida, sessions/projection autoritativos convergem.
- O horário vem do `AssistantTextRow.createdAt` projetado pela CLI e representa o momento de criação da mensagem, não a duração do trabalho deste turno.
  No mesmo dia mostra apenas hora e minuto; ontem mostra "ontem + hora e minuto"; no mesmo ano e antes disso mostra mês, dia, hora e minuto; em outro ano mostra ano, mês, dia, hora e minuto; timestamps inválidos ou não positivos não são exibidos, evitando a data placeholder de 1970.

## Origem do horário

```text
live ModelStreaming event.timestamp ──┐
cold message.info.time.created ───────┤
                                      v
                           AssistantTextRow.createdAt
                                      |
                            locale/timezone formatter
                                      |
                    completed assistant action toolbar
                         /                         \
          desktop hover/focus          mobile /remote 常显
```

O live continuous usa diretamente o horário do evento da CLI; o cold hydration precisa passar o `info.time.created` da mensagem de assistant do transcript para o evento sintético `text_start`, sem degradar para "horário da primeira mensagem da sessão + número sintético". A ordem total dos eventos continua sendo decidida pelo `sequenceNumber`, e o timestamp serve apenas para exibição. Desktop continuous e mobile replayable acabam consumindo o mesmo fato `row.createdAt`, formatando cada um no seu locale/timezone local.

## Cadeia de estado do feedback

```text
desktop / mobile assistant action toolbar
                    |
                    v
          localReaction: null / like / dislike
                    |
          +---------+---------+
          v                   v
  aria-pressed / style   fire-and-forget telemetry
```

O feedback não tem fato autoritativo que atravesse o ciclo de vida do componente e também não participa da cadeia de mensagens desktop continuous ou mobile replayable. CLI, host, relay, desktop main, transcript e banco de dados não leem nem salvam esse estado.

## Exibição e acessibilidade

- A UI reaproveita o estilo ghost/icon compacto de `MessageAction` e os tokens de cor semântica; o estado selecionado mantém um feedback de fundo claro.
- Usa `aria-pressed`, label localizado e estado de focus visível.
- No desktop, aparece com hover/focus do assistant turn; no `/remote` do celular não há hover, então a área de ações fica diretamente visível e
  não envolve os botões em Tooltip, evitando que o primeiro toque na tela sensível ao toque seja engolido pelo hover/portal.
- O horário aparece e desaparece junto com a área de ações, posicionado depois de todas as ações disponíveis; é metadado somente leitura e não aumenta a área clicável.
- A animação de seleção ao toque respeita `prefers-reduced-motion`.

Ponto de entrada da implementação: `ConversationRowView.tsx` e o test id compartilhado.