# Composição do Chat View

> **Estado histórico**: este documento registra o plano de divisão do `ChatView` antes da migração V4; os componentes e hooks relacionados já foram removidos.
> A entrada atual de orquestração da página é `packages/ui/src/v4/SessionPane.tsx`, `V4ChatPane.tsx`,
> `ConversationTimeline.tsx` e `ConversationComposer.tsx`; o conteúdo abaixo não é a especificação da implementação atual.

## Objetivo

Dividir `ChatView` e `ChatViewConversation` por fronteiras de domínio, reduzindo a complexidade de wiring de um arquivo único e permitindo que a área de input inferior, a área de rolagem das mensagens, o carregamento do histórico e a máquina de estados de rolagem evoluam de forma independente.

## Responsabilidades por Camada

- `ChatView` é a camada de orquestração da página: coleta hooks/state, decide os ramos de exibição de summary, empty, conversation e composer, e detém a estrutura DOM do `scrollRef` e do `contentRef` da área de mensagens.
- `useChatViewGoalVerificationSummaries` recebe o cache dos resumos de verificação de goal e a mesclagem dos resumos de runtime/message, evitando que o `ChatView` mantenha diretamente os detalhes de deduplicação de resumos.
- `useChatViewSummaryPanelRoom` recebe o ResizeObserver e a verificação de largura disponível do layout inline do summary panel; o `ChatView` apenas consome `hasInlineRoom`.
- A recuperação automática e o fluxo de retentativa da verificação de segurança da versão oficial ficam em um hook separado, preservando a injeção de dependências de provider/workspace e evitando misturar efeitos colaterais de recuperação aos ramos de renderização da página.
- `useChatViewStartPlanQuotaBanner` recebe a captura de erro da banner de cota/concorrência do Start Plan, a dismiss key, o bloqueio de submissão e a atualização automática.
- `useChatViewRestoredHistoryPreviewCutoff` recebe o tempo de desabilitação dos preview cards durante a restauração do histórico, evitando que a adição assíncrona de altura das mensagens interfira na primeira tela.
- `ChatBottomDock` é a área de ancoragem inferior do chat: responsável por `chat-composer-region`, layout sticky bottom, dicas de erro/cota/fila, popups de permissão e de pergunta, além da montagem do `ChatViewComposer`.
- `ChatViewConversation` é a área de conteúdo das mensagens: responsável pelo loader de histórico, pelos grupos de turno das mensagens, pelo destaque de busca e pelas âncoras de fork; não renderiza o contêiner `overflow-y-auto` nem mantém o slot do bottom dock.
- O contêiner principal de rolagem da Conversation V4 carrega apenas rolagem vertical e precisa usar simultaneamente `overflow-x-hidden overflow-y-auto`; conteúdos de largura fixa como tabelas e blocos de código fornecem a rolagem horizontal em seus próprios scroll containers internos, e a barra de rolagem horizontal não pode vazar para a conversa inteira.
- `ChatConversationContent` recebe posteriormente a renderização de grupos de turno, o loader de histórico e o placeholder de geração do controle remoto, sem manter estado de rolagem.
- `useChatConversationScroll` recebe posteriormente o bottom-lock, a memória de rolagem, o botão de scroll-to-bottom, o ResizeObserver e as fronteiras de rolagem por posicionamento.
- `useChatConversationHistory` recebe posteriormente o sentinel superior, o carregamento do histórico e a reposição do scrollTop após o carregamento.

## Regras de Fronteira

- `ChatView` renderiza `scrollRef -> contentRef -> ChatViewConversation + ChatBottomDock`; a propriedade do DOM dos contêineres de rolagem e de conteúdo não desce para a conversation.
- `contentRef` usa `flex min-h-full flex-col`, e a camada externa da conversation usa `flex-1`; sem barra de rolagem, o espaço restante do flex empurra o `ChatBottomDock` para baixo; com barra de rolagem, o conteúdo cresce naturalmente e continua usando sticky.
- `chat-composer-region` permanece dentro do `contentRef` e usa `sticky bottom-0` para grudar no fundo do contêiner de rolagem.
- Em `SessionPane`, a raiz de conteúdo comum entre o status panel e o `ConversationTimeline` fornece um container nomeado `conversation`; o status panel automático exibe mini abaixo de `1280px` e se expande ao atingir o limiar. Os modos automático e sempre expandido só deslocam `168px` (`-translate-x-42`) para a esquerda a coluna de mensagens, a entrada de carregamento de histórico e o composer dock quando `@min-[1280px]/conversation` é atingido; contêineres estreitos e o modo sempre recolhido não deslocam. Sessão vinculada usa `w-full` com `conversation < 864px`, passa a usar `calc(100% - 96px)`, `max-w-4xl` ao atingir `864px`, e alterna uniformemente para `calc(100% - 384px)`, `max-w-6xl` ao atingir `1280px`. Um rascunho realmente novo continua usando `max-w-2xl`.
- A largura da coluna principal da Conversation, a largura do rascunho, o limite de container de `1280px` do status panel, o deslocamento de `168px` e o mapeamento de layout `auto / panel / mini` são definidos de forma unificada em `conversationLayout.ts`; os chamadores não podem dividi-los em módulos de largura e deslocamento que não se conhecem.
- As transições de largura dos três contêineres de conteúdo V4 acima são graduadas por breakpoint de container: o padrão (`< 1280px`) usa `transition-[width,max-width,transform] duration-150 ease-out`, deixando a troca de largura média `w-full ↔ max-w-4xl` suave; ao atingir `1280px`, `@min-[1280px]/conversation:transition-[transform]` degrada para transicionar apenas o transform, de modo que o `max-w-6xl` disparado pela abertura de espaço para o painel e o deslocamento de `168px` para a esquerda não animem a largura ao mesmo tempo, evitando um jitter perceptível causado pela sobreposição de uma mudança ampla com o deslocamento.
- O composer dock de uma sessão vinculada sempre usa `px-4 pb-4`, mantendo 16px nas laterais e no rodapé até no mobile; não pode mais ser sobrescrito para `px-2` ou `pb-2`.
- Cada turno de mensagem usa `px-4` por padrão; o container nomeado `conversation`, ao atingir `md`, aumenta o padding horizontal via `@md/conversation:px-6`, e não usa mais o inverso `@max-md` ou o `max-md` de viewport.
- A camada de mensagens, ao rolar para longe do fundo, usa uma máscara em dois segmentos: os `96px` inferiores do viewport são totalmente transparentes, a faixa de `24px` entre `120px` e `96px` do fundo vai de totalmente visível até transparente, e o restante fica totalmente visível; não se mede a altura do Composer ou do dock. Ao encostar no fundo, a máscara é desligada.
- O botão "rolar para o fim" é renderizado como um slot interno do `ChatBottomDock`, e o comportamento de clique é fornecido pela máquina de estados de rolagem mantida pelo `ChatView`.
- A cadeia de controle remoto afeta apenas a renderização e a estratégia de carregamento do histórico, sem espalhar a semântica de restauração replayable para dentro da cadeia principal de rolagem continuous do desktop.

## Ordem de Migração

1. Extrair `ChatBottomDock`, reduzindo primeiro o JSX da área de ancoragem inferior do `ChatView`.
2. Extrair os subcomponentes de banner/dialog do composer, comprimindo ainda mais as props da region.
3. Extrair `ChatConversationContent`, separando a renderização de grupos de turno da máquina de estados de rolagem.
4. Extrair `useChatConversationHistory`, mantendo separadamente o carregamento do histórico e a reposição da rolagem após o carregamento.
5. Extrair `useChatConversationScroll`, migrando por último o bottom-lock e a memória de rolagem.
6. Extrair do `ChatView` a derivação de resumos, a largura inline do summary panel, os efeitos colaterais de recuperação da verificação de segurança, o estado da banner de cota do Start Plan e o cutoff de preview da restauração de histórico, deixando o componente principal apenas com o wiring da página.
