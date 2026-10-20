# Ghost cursor: ocultar ativamente ao final do turno de diálogo

## Problema

O ghost cursor só desaparece ao faded após o vencimento da locação de atividade de 20s
(`kPointerActivityLeaseMs`). Quando o diálogo já terminou e o app de destino também foi
movido pelo usuário, o cursor continua parado na posição da última ação durante o prazo
da locação, parecendo um fantasma residual, o que não corresponde ao fato de que o
"Agent já não está operando o computador".

## Decisão

Reutilizar os eventos de ciclo de vida da sessão PiP que o anfitrião já emite, sem adicionar
protocolo:

- O anfitrião (`packages/services/src/cua-permission-broker/cuaPipSessionService.ts`) emite
  `turn-started` / `turn-ended` no início/fim de cada turno de diálogo, e `session-closed`
  quando a sessão é encerrada; o coordenador de sessão PiP dentro do Helper
  (`createPipSessionCoordinator`) primeiro atualiza o estado da sessão e só então chama os
  efeitos colaterais.
- O Helper envolve esse conjunto de efeitos colaterais com `withGhostCursorTurnEndHide`:
  `turnEnded` / `sessionClosed` são encaminhados normalmente ao agendador PiP e, em seguida,
  se **nenhuma sessão estiver em estado running**, chama o native `ghostHide()`.
- `ghostHide()` é um ocultamento de nível de sessão: limpa o alvo, para os temporizadores,
  faz `orderOut` do overlay, mas não desliga o switch enabled; a próxima ação CUA restaura a
  exibição pelo caminho normal de feedback, sem precisar de sinal extra.

### Múltiplas sessões

Quando vários diálogos usam CUA ao mesmo tempo, a ocultação só ocorre quando termina o
último turno ainda em execução, evitando que o fim do diálogo A esconda o cursor do diálogo B
que ainda está operando. O critério vem do snapshot do coordenador (`snapshot().sessions` com
`status === "running"`); o coordenador já colocou a sessão em estado terminal antes de
chamar `turnEnded`, portanto o snapshot reflete o estado posterior ao encerramento.

### O que não será feito

- Não encurtar a locação de atividade de 20s: a locação atende às pausas de reflexão entre
  as células dentro de um turno; encurtá-la faria o cursor piscar dentro do mesmo turno.
- Não exibir o cursor ativamente em `turn-started`: mostrar o cursor sem ação não faz
  sentido; a primeira ação o exibe naturalmente.

## Verificação

- Teste unitário: `withGhostCursorTurnEndHide` chama `hideGhost` uma vez quando o último turno
  em execução termina ou quando a sessão é encerrada; não chama enquanto houver outras
  sessões em execução; os efeitos colaterais originais são sempre encaminhados e executados
  antes da ocultação.
- Em máquina real: após uma rodada de diálogo operar o Maps e terminar, o cursor desaparece
  imediatamente; no próximo turno, a primeira ação faz o cursor aparecer novamente.
