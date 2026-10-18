# Chat Input Context

> **Estado atual**: este documento foi calibrado conforme a fiação do composer do V4. O uso de contexto vem do conversation snapshot do V4,
> e não é mais lido do legacy task runtime/store.

## Objetivo

Mudar o uso de contexto no rodapé da barra de entrada do chat, de texto estático para o componente composto `Context` do AI Elements.

## Implementação Atual

- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`
  - Converte `usage.contextWindow.usedTokens` / `maxTokens` / cache / breakdown do snapshot no modelo de exibição da barra de entrada
  - Reutiliza o `ChatContextUsage` de `packages/ui/src/chat-input-toolbar/contextUsage.tsx`
  - Reutiliza o entitlement de Coding Plan Z.ai / BigModel já carregado, sem repetir requisições de quota no menu de context
  - O `Usage Remaining` do Coding Plan reutiliza as ferramentas de parsing de entitlement/state do Coding Plan pago, mas o ponto de exibição permanece apenas no context da caixa de entrada e na página de Usage
  - O badge do footer e o entitlement de Coding Plan do context da caixa de entrada usam o mesmo cache de impressão de provider/apiKey e alinham os parâmetros de consulta do plano pago, evitando que a cota de mesma origem seja dividida em dois caches
  - Usa `ContextTrigger` como entrada de contexto
  - Usa `ContextContentBody` para exibir a ocupação da janela de contexto, o breakdown, o cache hit rate e o `Usage Remaining` do Coding Plan
  - O cache hit rate só é exibido quando a taxa de acerto acumulada do turno principal é maior ou igual a 78%; valores abaixo de 78% não aparecem no painel compacto de context
  - O uso do Coding Plan dentro do context da caixa de entrada é renderizado de forma independente, sem reutilizar a UI do painel de menu da sidebar
- `packages/ui/src/components/ai-elements/context.tsx`
  - Acrescentou proteção contra limite superior zero, evitando valores inválidos na porcentagem de progresso
  - Passou a formatar porcentagem, números compactos e moeda conforme o locale do ambiente atual
- `packages/ui/src/CodingPlanUsageRemainingPanel.tsx`
  - Hospeda a exibição da linha de número de cota restante reutilizada pela página de Usage e pelo context da caixa de entrada, além da troca de provider
  - Exporta as ferramentas de parsing de entitlement/state para o context da caixa de entrada reutilizar a semântica dos dados
  - As três barras de progresso de cota do Coding Plan no menu de context da caixa de entrada usam em ordem as cores azul, verde e roxa do usage chart, isto é, `--color-usage-chart-1` / `--color-usage-chart-2` / `--color-usage-chart-3`
  - As barras de progresso de cota do Coding Plan no menu de context da caixa de entrada usam a altura compacta do Start Plan da página de configurações, com `h-1.5`
  - O texto das barras de progresso do Coding Plan no menu de context da caixa de entrada é empilhado verticalmente: label sutil e `percent · reset`, com a porcentagem em mono, o horário de reset em `text-ui-xs` e sem mono
  - O uso do Coding Plan no menu de context da caixa de entrada adapta as colunas ao número real de cotas exibíveis: 1 item mostra 1 coluna, 2 itens mostram 2 colunas e 3 itens mostram 3 colunas; dentro de um único item mantém a estrutura compacta com label, porcentagem restante e barra de progresso empilhados
  - O bloco de Coding Plan no menu de context da caixa de entrada segue o padding do body, sem usar mais margem externa de estilo footer nem separador de borda superior
  - A linha de título do Coding Plan no menu de context da caixa de entrada reaproveita o estilo compacto de título de `Context window`, sem usar mais uma camada de header separada
  - O `Today's balance` do Start Plan no menu de context da caixa de entrada é renderizado de forma independente, sem reaproveitar o `StartPlanBalanceCard` da página de configurações nem os componentes do painel de Coding Plan; o layout referencia o título compacto, o meter e o ritmo de separação do Coding Plan
  - O `Today's balance` do Start Plan no menu de context da caixa de entrada só é exibido quando o modelo atual pertence a um provider do Start Plan, e o lado direito do título oferece um botão `Upgrade` que vai direto para a entrada de upgrade de plano do provider Start Plan correspondente
  - O botão `Upgrade` do Start Plan no menu de context da caixa de entrada referencia o botão de upgrade do Start Plan da página de configurações: em desconto ativo usa o estilo de cápsula arredondada com gradiente e exibe um badge de desconto
  - O `Today's balance` do Start Plan no menu de context da caixa de entrada exibe a porcentagem restante, o horário de renovação e a barra de progresso, em que o horário de renovação vem preferencialmente de `subscription.details[0].renewTime`, com fallback para o `nextResetTime` do item de saldo; hoje mostra apenas a hora, no formato `99% · 23:02`, e em outro dia mostra data e hora, no formato `99% · Jun 15 23:02`; não exibe textos de uso, saldo restante ou total, a altura da barra de progresso usa `h-1.5` e a barra mantém o verde `success`
  - O saldo do Start Plan no menu de context da caixa de entrada adapta as colunas ao número real de cotas de modelo exibíveis: 1 item mostra 1 coluna, 2 itens mostram 2 colunas e 3 itens mostram 3 colunas; dentro de um único item mantém a estrutura compacta com o label do modelo, a porcentagem restante e a barra de progresso empilhados
  - Os títulos dos dois sections `Context windows` e `Coding Plan` usam uniformemente `text-ui-base`
  - O resumo used / total à direita do título `Context windows` usa a unidade de token compacta localizada; em inglês usa `K` / `M` / `B` maiúsculos e em chinês usa `万` / `亿`
  - A escala de cores dos segmentos de progresso de `Context windows` parte do azul de Coding Plan `--color-usage-chart-1` e clareia progressivamente conforme a proporção
  - A entrada de detalhes do Coding Plan no menu de context da caixa de entrada é exibida como texto de link `More` com uma seta para a direita
  - Ao clicar na entrada `More` do Coding Plan no menu de context da caixa de entrada, fecha-se primeiro o painel de context e depois abre-se o detalhe de uso, evitando que a camada flutuante persista após a navegação
  - O Coding Plan no menu de context da caixa de entrada só exibe a linha de separação superior e o espaçamento no topo quando o bloco de uso de `Context windows` já foi exibido antes
  - Quando o Coding Plan tem uma oportunidade de reset disponível, o gatilho de context reaproveita o `ControlHintTooltip` unificado do projeto e seu offset padrão, e habilita a fronteira de Provider `standalone` encapsulada para suportar renderização independente em SSR/testes; o Tooltip exibe imediatamente e de forma persistente o ícone de presente e `{count} 次重置额度`; quando o usuário passa o mouse, foca ou toca e abre o painel de context, esta janela recolhe o primeiro lembrete; a camada de negócio controla apenas o estado de exibição e o conteúdo rico, sem compor diretamente as primitivas de Tooltip
  - Quando o horário mais próximo de expiração da mesma oportunidade entra nos últimos 3 minutos, o Tooltip volta a exibir de forma persistente o ícone de alarme e a contagem regressiva em tempo real `重置额度过期 {time}`; se o primeiro lembrete ainda não tiver sido recolhido, ele troca no lugar pelo lembrete de iminência
  - O ícone de presente usa a cor semântica de sucesso do tema e o alarme de iminência usa a cor semântica de aviso; o `{time}` da contagem regressiva do texto de iminência usa o estilo compacto de pill com `h-3.5` fixo (14px), `text-ui-xs px-1.5`, fundo de warning claro, texto de warning e `tabular-nums`; o alarme balança continuamente para os lados e fica parado sob `prefers-reduced-motion`; depois de o lembrete de iminência ser visto, a mesma oportunidade não se repete, e o lembrete recolhe imediatamente quando a oportunidade expira, a cota está cheia ou o prazo passou
  - O botão circular do gatilho de Context expressa de forma independente o estado atual da oportunidade: quando existe uma oportunidade válida com mais de 3 minutos restantes, usa apenas a cor de foreground success e não adiciona fundo de estado; ao entrar nos últimos 3 minutos, passa para um fundo de warning claro com foreground de warning; o usuário fechar o Tooltip não limpa a cor de estado do botão, e a cor padrão é restaurada quando a oportunidade expira ou fica inválida
  - O Tooltip do gatilho de context exibe apenas um estado por vez, com prioridade «正在重置/已重置» > «临期机会» > «首次机会»; o Tooltip é apenas um lembrete e a operação de reset continua sendo concluída no painel de context
  - Tanto o Tooltip inicial quanto o de iminência oferecem um botão de fechar circular à direita; fechar apenas marca a etapa atual como lida, sem abrir o painel de context e sem afetar a própria oportunidade; o estado de leitura é compartilhado pela janela atual do renderer e, portanto, depois de trocar de sessão ou de remontar o componente de sessão, a mesma etapa da mesma oportunidade `sourceKey + earliestExpiresAt` não aparece de novo; esse estado não é gravado em disco nem compartilhado entre janelas, e um novo horário de expiração continua gera um lembrete novo; o botão reaproveita o tamanho `icon-xs` do `Button` compartilhado e é sobrescrito como `rounded-full`, sem usar margem negativa, com rótulos de acessibilidade `关闭提醒` / `Dismiss reminder`
  - Na mensagem de iminência, o alarme e o texto mantêm `gap-1.5`, e o grupo de texto da contagem regressiva e o botão de fechar usam `gap-0`, evitando espaço extra à direita
  - O conteúdo do lembrete de oportunidade mantém o tamanho de fonte `text-ui-sm` do Tooltip de modelo; como o botão circular de fechar é fixo em `20px`, o Tooltip do lembrete usa `bg-background py-0.5 pr-0.5`, fazendo o tamanho total ficar alinhado ao Tooltip de modelo e usando a cor de fundo da página
- `packages/ui/src/i18n/locales/en-US.ts`
- `packages/ui/src/i18n/locales/zh-CN.ts`
  - Acrescentaram os textos explicativos do hover card

## Resultado

- O rodapé da barra de entrada mantém uma entrada de context enxuta
- Ao passar o mouse, o usuário vê uma explicação mais completa do contexto e a cota restante atual do Coding Plan
- A forma do componente permanece consistente com a documentação de context do `elements.ai-sdk`