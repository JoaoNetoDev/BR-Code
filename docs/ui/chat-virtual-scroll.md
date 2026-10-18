# Rolagem virtual do chat

> **Fato atual do V4**: o viewport de rolagem, a virtualização, o seguimento do fundo e a memória de rolagem local do renderer são mantidos por
> `packages/ui/src/v4/ConversationTimeline.tsx`; os fatos das mensagens continuam vindo de
> `packages/shared/src/zcode-protocol-v4/` e `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/`.

## Objetivo

Conversas longas renderizam apenas os turnos de mensagem próximos ao viewport atual, reduzindo a quantidade de DOM no renderer em sessões longas e o custo de atualizações do React.

## Estratégia de renderização

- `ConversationTimeline` usa `ConversationTurnRenderUnit` como unidade de rolagem virtual, em vez de uma única linha de projection row.
- Cada linha virtual corresponde a um turno de saída user + assistant/tool, evitando que retry, fork, resumos de alteração de arquivos e o loading do turno atual sejam fragmentados.
- Usa o `@tanstack/react-virtual` já existente no projeto, com altura dinâmica escrita de volta via `measureElement`.
- A busca na conversa primeiro indexa as projection rows e depois usa o virtualizer para localizar e destacar no DOM já montado.

## Seguimento do fundo durante resize

`ConversationTimeline` é o único dono da rolagem, mantendo o `followingRef` e a adjudicação existente da intenção do usuário. A rolagem para cima do usuário encerra imediatamente; voltar ao fundo ou clicar em "voltar ao fundo" restaura o seguimento; busca, localização de turno, memória de rolagem da sessão e pré-inserção de histórico mantêm o contrato original, sem uma opção forçada de fixar no fundo.

- No estado de seguimento, o reflow causado por mudança de largura do viewport ou da coluna de conteúdo usa processamento em lote antes da pintura: ler a altura das linhas → atualizar o cache do virtualizer → submeter de forma síncrona a altura e a posição dos placeholders do React → então reconfirmar o direito de seguimento → fixar no fundo. Não se espera o temporizador de estabilização da largura, nem se deixa o ponto de repouso intermediário sob alturas antigas de placeholder para o próximo quadro.
- O observer da biblioteca pode já ter atualizado o cache e ainda estar enfileirado aguardando a submissão do React, portanto o lote deve disparar explicitamente a submissão do layout; não se pode depender de medições repetidas sem delta para provocar render. A submissão síncrona ocorre apenas dentro do callback do ResizeObserver, e outros efeitos de conteúdo não ficam à frente para fixar no fundo durante o lote.
- Quando fora do fundo, mantém-se a proteção original contra mudança de largura: a compensação de rolagem linha a linha é pausada durante o resize, sem fixação forçada no fundo; após estabilizar, a compensação normal de medição de altura é restaurada. Este documento não introduz ancoragem de leitura que mantenha coordenadas de tela por frase.
- A intenção mais recente do usuário é verificada antes e depois de cada lote; rolagem para cima, busca ou troca de sessão durante o resize não podem ter o direito de rolagem recuperado pelo dimensionamento subsequente. Os observers escutam o viewport e a coluna de conteúdo e, antes da submissão síncrona, cancelam temporariamente a observação de tamanho da coluna de conteúdo e da camada de máscara do pai das mensagens, retomando a subscrição no quadro seguinte, evitando que a escrita da própria altura dispare notificações em laço, mantendo cobertura contínua das transições de largura do CSS; a medição de altura e a fixação no fundo não são adiadas e as linhas virtuais não são subscritas novamente. Quando o conteúdo da mensagem fica mais alto, ele continua passando pela lógica original de medição e submissão de conteúdo. O lote mede apenas as linhas já montadas, sem polling nem renderização completa do histórico.
- A lógica é compartilhada entre Web desktop e mobile; rascunhos vazios mantêm o layout seguro no topo, sem alterar o protocolo de mensagens nem a fronteira continuous/replayable.

```text
Mudança de tamanho → ConversationTimeline verifica o direito de seguimento
  Seguindo → medição de altura em lote → submissão síncrona do layout → nova verificação do direito de seguimento → fixar no fundo
  Fora do fundo → proteção original de mudança de largura e posição de leitura
Rolagem para cima / busca → encerrar seguimento (prioridade sobre callbacks de layout)
Voltar ao fundo → restaurar seguimento
```

Aceitação: ao ampliar/reduzir continuamente, o ponto de repouso do seguimento e as alturas de placeholder da lista ficam corretos; após rolar para cima durante o resize, mantém-se fora do fundo; clicar para voltar ao fundo restaura o seguimento. A memória de sessão original, a localização por busca e a pré-inserção de histórico passam na regressão. Em runtime, registra-se o erro entre o fundo real das linhas antes da pintura e a altura de placeholder, além da distância do fundo, verificando-se a imagem visível; é permitido erro de arredondamento subpixel de 1px; não se pode substituir a verificação do processo pelo ponto de repouso após soltar o arraste.

Regressão de navegador: `node --test packages/ui/test/browser/manual-review/pending/conversation-timeline-resize.test.mjs`. Cobre o timeline real, os componentes de mensagem e a lista virtual em layouts desktop/mobile compactos, temas claro e escuro e a transição de largura independente da coluna de conteúdo; os dados são fixtures determinísticos e a transmissão do controle remoto do mobile não faz parte da cobertura desse teste. A sessão real do desktop continua coberta por `conversation-session-v4-scroll.test.ts` para saída em streaming e memória de rolagem.

## Limites de rolagem

- A antiga máquina de estados de auto-follow com múltiplos flags, `useChatAutoFollow`, foi removida; hoje resta apenas um pequeno estado de bottom-lock e um container de rolagem manual comum.
- `ConversationTimeline` usa um pequeno estado de bottom-lock: sessões novas sem memória de rolagem começam habilitadas, e o acréscimo de mensagens, o crescimento por detalhes de markdown/tool e mudanças do ResizeObserver continuam gravando o `scrollTop` do fundo mais recente.
- O botão "rolar até o fundo" no canto inferior direito é controlado apenas pela posição atual da barra de rolagem: aparece quando o container não está no fundo e some ao chegar nele; o usuário rolando manualmente de volta para perto do fundo ou clicando no botão para rolar até o fundo reabilita o bottom-lock, evitando perder o travamento enquanto o conteúdo em geração continua crescendo. A camada flutuante inferior onde fica o botão usa uma máscara em gradiente para cima do token `background`, evitando uma borda dura sobre a última mensagem.
- Quando o conteúdo das mensagens é curto demais para gerar barra de rolagem vertical, não há posição histórica de leitura a preservar no viewport; o ChatView considera isso um estado em que o bottom-lock pode ser habilitado, para que o conteúdo em streaming, ao criar a barra de rolagem, continue fixando no fundo.
- No estado normal de conversa, o composer é renderizado por `bottomDock` dentro do mesmo viewport de rolagem do timeline e usa `sticky bottom-0` para grudar; o botão "voltar ao fundo" é ancorado acima do dock.
- A troca de sessão prioriza a leitura da memória de rolagem local do renderer. A chave da memória é composta por `workspaceIdentity?.trim() || workspacePath`, `paneId` e o escopo de sessão/task; panes diferentes no mesmo renderer não compartilham a posição de leitura, e janelas desktop distintas ou renderers Web do mobile também não compartilham memória.
- Se a memória foi salva no estado de bottom-lock, ao voltar rola-se até o fundo **atual** mais recente e o bottom-lock continua habilitado; caso contrário, restaura-se o `scrollTop` em pixels salvo, limitado ao intervalo válido pela altura atual do conteúdo e mantendo o estado fora do fundo. Se não houver memória, posiciona-se no fundo ao abrir e habilita-se o bottom-lock.
- A restauração escreve uma vez na fase de layout e, no animation frame seguinte, corrige de novo após a primeira rodada de medição do virtualizer; se o usuário já tiver rolado, a segunda correção deve ceder o direito de escrita.
- Resultados de busca, busca por destaque, origem de fork e saltos do turn navigator são todos rolagem de posicionamento; após posicionar, mantém-se fora do fundo, e essa posição pode ser substituída pela memória de uma troca de task posterior.
- Após completar histórico antigo, a posição de rolagem continua restaurada pelo acréscimo de altura, evitando que o viewport pule para o topo do histórico.
- Quando a largura do conteúdo da conversa muda continuamente, as linhas dinâmicas são remedidas em lotes por causa da quebra de linha do texto. No estado de leitura fora do fundo, o `scrollTop` atual deve ser mantido, proibindo que o virtualizer compense linha a linha acima do viewport e provoque oscilação; o estado fixado no fundo usa o processamento em lote de medição acima e fixa no fundo com as novas alturas já submetidas a cada resize do viewport. Depois que a largura estabiliza, a compensação normal de medição dinâmica de altura é restaurada; o bottom-lock normal de novas mensagens e conteúdo em streaming não é afetado.
- O bottom-lock não é gravado em localStorage, relay, processo principal, processo host ou runtime de task; a memória de rolagem existe apenas durante o ciclo de vida atual do renderer e é reciclada por uma LRU de 200 itens.

## Renderização preguiçosa do histórico de detalhes

- A área de histórico de `AssistantMessage` só chama `renderHistoryParts` quando expandida; por padrão, fechada, mantém apenas a linha de resumo.
- `ToolLayout` suporta `renderContent`, e os detalhes da ferramenta só são construídos quando expandidos ou expandidos à força, evitando que ferramentas fechadas montem antecipadamente muito DOM de markdown, diff e subferramentas.
- Os estados expandido das áreas de histórico e de ferramenta são guardados na memória do renderer por message/tool key, de modo que o desmontar e remontar de componentes causado pela rolagem virtual não perca os detalhes que o usuário acabou de expandir.
- Saída em streaming, estados interrompido e settling ainda forçam a expansão da área de histórico, garantindo que o conteúdo em andamento não seja ocultado; ao fim do streaming volta-se automaticamente ao estado de resumo.

## Cache de renderização e limites de memo

- Mensagens markdown concluídas seguem sempre o modo estático do `Streamdown`; apenas animações reais de streaming entram nos caminhos de streaming/block, evitando que o remount repetido de mensagens concluídas por rolagem virtual e renderização preguiçosa de histórico dispare laços de atualização internos do Streamdown.
- `DiffViewer`, edit inline diff, `ToolLayout`, `ToolCallBlock`, `AssistantMessage`, `ChatMessage` e as bordas de grupo de turno usam `memo`, reduzindo commits duplicados de mensagens históricas quando o componente pai é atualizado.
- Os callbacks de retry, troca de arquivo, feedback e fork passados a mensagens individuais dentro do grupo de turno são estabilizados com `useCallback`, evitando que o memo seja anulado por functions inline dentro do map.
- O diff estabiliza apenas as options e as entradas do viewer, sem cachear o DOM real; mudanças de tema, tamanho de fonte, quebra de linha e numeração de linha ainda causam re-render normal.

## Limites do controle remoto

Esta alteração afeta apenas a camada de renderização da UI, sem mudar o fluxo de mensagens de task do ZCode, o snapshot, a queue ou a semântica de recuperação:

- No desktop, `desktop-continuous` mantém a cadeia principal continuous direta.
- No controle remoto do mobile, `web-remote-replayable` continua exibindo mensagens através da fronteira de recuperação de snapshot/gap replayable.
- O histórico completo do controle remoto continua sendo controlado por carregamento explícito e não é retransmitido como snapshot completo implícito por causa da rolagem virtual.