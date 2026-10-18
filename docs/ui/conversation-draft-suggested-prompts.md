# Prompts sugeridos na página de rascunho de New Task

## Contexto

A nova homepage de New task adiciona a entrada 「推荐提示词」 logo abaixo do Chat composer. O grupo de botões horizontais existente é distribuído pela scene `draft-suggestion` do `clientScenesService`; a lista de recomendações de tarefas proativas usa um pool local mantido por funcionalidade.

## Recomendações de tarefas proativas

- Nesta etapa, as recomendações de tarefas proativas são exibidas apenas no modo de trabalho. O modo de trabalho é uma opção oferecida no terceiro passo do onboarding, marcada por padrão; o modo de programação não exibe essa opção nem a lista de recomendações proativas, e mantém a entrada existente de pequenas cenas do Client Scenes. A página de configurações mantém o interruptor 「主动任务推荐」, explicando que “仅在办公模式下支持”, e ele não é acionável no modo de programação. Mesmo que a configuração antiga tenha as recomendações proativas ativadas, o modo de programação não pode exibir a lista proativa.
- Acima do campo de entrada do rascunho, no modo de trabalho, a entrada de plugins é mantida: exibe em miniatura os ícones dos três primeiros plugins da lista atual e, ao expandir, continua listando esses três e os demais plugins; clicar em um item navega para o mercado de plugins existente, e nenhum dado fictício do mercado de plugins é injetado na funcionalidade de recomendação.
- O texto de exibição é curto e não contém `[占位符]`; o corpo preenchido no clique é completo e executável, podendo complementar informações não obrigatórias com placeholders como `[目标对象]`. Uma tarefa recomendada não pode ter como condição inicial algo como “如果当前仓库是某类项目”.
- Cada painel visível exibe três itens. Na extração, prioriza-se evitar ícones e plugins repetidos na mesma tela e, sempre que possível, evitar os ícones já exibidos em outros painéis; quando faltam candidatos, ainda assim são exibidos três. “换一批” apenas redistribui o painel atual, enquanto os lotes já exibidos nos outros painéis e a âncora de confirmação de plugin permanecem inalterados. A rotação deve fazer cada recomendação do pool alcançável em um número limitado de rodadas. Fechar as recomendações reutiliza a gravação de volta das configurações existentes e do registro de onboarding.
- Os ícones de recomendação usam uma base de 24px sem borda com padding; o material do GitHub com fundo branco é reduzido adicionalmente para 18px, evitando que o quadrado branco fique próximo às bordas da base.
- O `[@插件](plugin://stable-id)` preenchido no corpo do composer forma no Composer uma menção estruturada na posição original; múltiplos plugins podem aparecer simultaneamente. O clique apenas substitui o rascunho e não envia automaticamente.

## Semântica de produto

- Ao clicar em um item recomendado que não referência Plugin, o prompt fixo é **pré-preenchido** imediatamente no Composer, sem envio automático.
- Ao clicar em um item recomendado que referência Plugin, aguarda-se a primeira resolução confiável do Host de destino. Quando a primeira verificação local ainda puder referenciar diretamente, não se exibe feedback adicional e, em `ready`, a menção estruturada de Plugin e o prompt são escritos de uma só vez; quando o corpo já tem a referência desse plugin, a posição original é mantida sem prefixar de novo e, quando o corpo contém múltiplos plugins, cada um é resolvido como um nó de menção. Quando a primeira verificação encontra que não é possível referenciar diretamente, o único Plugin action Popover do item recomendado atual entra imediatamente em loading. Em outros resultados ou em falha de resolução,
  o prompt puro é escrito de uma só vez, evitando a atualização em duas fases em que o corpo aparece primeiro e o chip entra depois.
- O pré-preenchimento **substitui** o rascunho existente, sem append nem merge; o usuário ainda pode continuar editando e enviar manualmente.
- O `on_finish` do prompt item é dividido por vírgulas em inglês, sofre trim e desduplicação e então tem o comportamento mapeado por uma allowlist de `switch` explícita.
  Os seguintes comportamentos de navegação são suportados atualmente e, quando atingidos, encerram este pré-preenchimento do Composer:
  - `NAVIGATE:AUTOMATIONS`: reutiliza a navegação principal do workspace para abrir Automations.
  - `NAVIGATE:AUTOMATIONS:OFFPEAK`: abre Automations e, depois que os dados de tarefas agendadas/de período ocioso estiverem prontos, seleciona automaticamente a tab `Idle-time` somente quando ela realmente existir, mantendo caso contrário a tab padrão de Automations. Se o mesmo item declara as duas actions de Automations, prevalece a `NAVIGATE:AUTOMATIONS:OFFPEAK` mais específica e a navegação acontece apenas uma vez.
    Action desconhecida ou vazia não altera a semântica de pré-preenchimento do prompt comum.
- O celular `/remote` não hospeda Automations; quando a página não tem a capacidade de navegação de Automations, os itens recomendados que declaram qualquer action de navegação de Automations precisam ser filtrados, sem exibir uma entrada inválida nem contornar as fronteiras de terminal já existentes.
- Um item recomendado pode declarar um único Plugin stable ID fixo. Somente quando o Plugin está habilitado e não há conflito de mesmo nome, a primeira escrita acrescenta antes do prompt a referência canonical `[@Plugin](plugin://stable-id)` e cria o chip estruturado de Plugin.
- Durante a primeira resolução confiável do Plugin, registra-se o Composer revision renderer-local no momento do clique; se a entrada do usuário, uma inserção externa ou a restauração do rascunho mudarem o revision,
  essa operation abandona silenciosamente a escrita adiada e o Popover subsequente, e é proibido sobrescrever o rascunho atual com um resultado de recomendação tardio.
- `missing` deve primeiro atualizar somente `zcode-plugins-official` e, após a atualização bem-sucedida, resolver novamente; falha de atualização, candidato desaparecido, origem não confiável ou conflito resultam em
  `unavailable`/`conflict`, e é proibido usar o snapshot antigo para instalar em um clique, mantendo o prompt puro.
- A atualização de `zcode-plugins-official` espera no máximo 10000 ms; ao atingir o timeout, a atualização é abortada ativamente e ocorre fail closed com `marketplace_refresh_failed`, sem continuar lendo candidatos do snapshot antigo e mantendo apenas o prompt puro.
- A instalação em um clique só é permitida para `zcode-plugins-official`, sempre com `scope: "user"`, instalando no usuário atual do Agent Host autoritativo atual; em workspace remoto, a escrita vai para o Host remoto.
- Quando a primeira verificação local encontra que o Plugin de destino não existe e o Marketplace oficial está prestes a ser atualizado, o Agent precisa emitir primeiro o progresso `refreshing` com o `operationId`; ao recebê-lo, a UI coloca imediatamente em loading o Plugin action Popover do item recomendado atual. Quando a primeira resolução confiável retorna diretamente `disabled`, a UI coloca o mesmo Popover em loading antes de escrever o prompt puro.
  `ready`, `conflict`, `unavailable` e falha de resolução não podem criar um segundo Popover apenas por causa da primeira verificação.
- Para cada operation de recomendação existe no máximo um Plugin action Popover em qualquer momento. Loading, confirmação de instalação/ativação, progresso de instalação/ativação e sucesso/falha apenas atualizam a phase/message/action do mesmo
  `PopoverContent`; ao trocar de item recomendado, a mesma instância da operation antiga é limpa primeiro e a nova operation reutiliza esse único ponto de montagem, e é proibida a montagem paralela, aninhada ou sobreposta de um segundo Popover.
- Resultados confiáveis `missing` / `disabled` continuam entregando o prompt puro ao Composer; somente depois que o Composer tiver consumido a solicitação de inserção correspondente e que a área de entrada e o item recomendado tiverem concluído o layout desta rodada, o
  mesmo Popover em loading muda no lugar para o estado de confirmação. O Popover usa o botão do item recomendado atual como âncora e abre `9px` diretamente abaixo do botão, sem roubar o foco do Composer e sem bloquear as outras interações da página, devendo ficar restrito ao viewport atual tanto no desktop quanto na Web móvel. O estado de confirmação tem largura de `240px`, com a altura crescendo naturalmente conforme o conteúdo localizado; não há tempo de fechamento automático. Quando o usuário clica com o ponteiro principal na área externa ao Popover, o Popover fecha, a operation é cancelada e apenas o prompt puro é mantido; mover o foco para fora, clicar dentro do Popover e os estados de loading inicial, de progresso de instalação/ativação e de resultado não podem disparar esse fechamento do estado de confirmação.
- Quando a primeira resolução confiável já retornou `ready`, a substituição por chip + prompt acontece de uma só vez; não havendo Plugin de nível de workspace, não se chama mais `plugins/referenceCatalog`, e o Runtime do rascunho não é invalidado nem a resolução confiável é chamada de novo. Somente após sucesso de instalação ou ativação é que o Runtime do rascunho adiado é invalidado e o estado é resolvido de forma confiável novamente pelo Host de destino.
- O resultado da resolução confiável pode carregar o `icon` display-only do listing oficial do Marketplace; esse campo não participa de identidade, decisão de instalação ou permissão e volta junto com a mesma resolução. A UI o escreve na menção de Plugin; quando ausente ou inválido, usa o ícone de Plugin padrão existente, sem restaurar um RPC de catalog apenas por causa do ícone.
- Após o usuário confirmar a instalação ou ativação, o mesmo PopoverContent converge do estado de confirmação para o progresso persistente; o estado de sucesso só é exibido quando o Host de destino resolver novamente de forma confiável como `ready` e o Composer tiver consumido e limpo o chip requestId de prefixo correspondente. Ao trocar o conteúdo de progresso pelo conteúdo de sucesso, reutiliza-se a estrutura de rolagem vertical da tag de troca de modelo: `AnimatePresence initial={false} mode="popLayout"` mantém o ponto de montagem, o conteúdo de progresso antigo desaparece de `y: 0` para `-0.75em`, o Check de 16px e o texto de sucesso entram de `y: 0.75em + opacity: 0` para `y: 0 + opacity: 1`, com duração `200ms` e easing `[0.4, 0, 0.2, 1]`; sob reduced-motion a substituição é estática e direta. Os estágios de confirmação, falha e retry não disparam essa rolagem. Falhas de instalação/ativação convergem conforme a semântica de falha do Popover e continuam mantendo o prompt puro.
- A operação remota de instalação em um clique espera no máximo 10000 ms; no timeout a instalação é considerada falha, a operation antiga é cancelada, resultados tardios são bloqueados, apenas o prompt puro é mantido e o mesmo Popover volta ao estado de confirmação de instalação para permitir retry, com o registro da falha no UI logger `warn` e em um warning toast. Esse timeout atua apenas sobre a fase de instalação e não limita a conclusão posterior do Composer.
- Cada solicitação de resolução confiável precisa carregar um `operationId` único e, ao mesmo tempo, o `clientMode` e o `deliveryKind` do attachment de destino: `desktop-continuous` no desktop e `web-remote-replayable` no controle remoto do celular; ambos apenas declaram as fronteiras de cadeia já existentes e não criam novos estados de stream ou de restauração.
- Ao clicar em outro item recomendado durante uma instalação ou ativação em andamento, a operation antiga é interrompida; os resultados tardios da operação antiga não podem escrever no rascunho, no Popover ou no chip, e os outros itens recomendados ficam temporariamente desabilitados enquanto o cancelamento ainda não concluiu.
- Quando o Plugin não existe ou não está habilitado, um estado recuperável é exibido com o Plugin label do locale atual e o prompt puro é mantido; em conflito, quando o RPC do workspace não está pronto ou em falha de resolução, degrada-se
  para o prompt puro, sem exibir um chip de Plugin falso. O primeiro clique não instala nem ativa automaticamente, e a instalação/ativação só acontece quando o usuário clica explicitamente na ação de instalação/ativação do fluxo.
- A referência de Plugin é apenas uma dica de capability, não envia automaticamente e não altera permissões nem aprovações de ferramentas; esta rodada não lida com API Key, OAuth ou configuração de plugins do usuário.
- O rascunho continua sendo mantido pelo Composer draft renderer-local; o envio continua passando pelas cadeias existentes de `desktop-continuous` no desktop ou `web-remote-replayable` no celular, sem novos estados de negócio de relay/main/Host.

```text
Clicar numa sugestão
  -> clientScenesService.list()
  -> Encontrar options.prompts.items onde scene == "draft-suggestion"
  -> Resolver item.labels / item.contents pelo locale atual em label / prompt
  -> item.on_finish: dividir por ",", aplicar trim e remover duplicados
     -> Casa NAVIGATE:AUTOMATIONS
        -> Invalidar consultas assíncronas anteriores de Plugin
        -> Reusar onOpenAutomationsMain
        -> Gravar o histórico de navegação do workspace e abrir Automations
        -> Terminar, sem reescrever o Composer
     -> Casa NAVIGATE:AUTOMATIONS:OFFPEAK
        -> Invalidar consultas assíncronas anteriores de Plugin
        -> Gravar automationTab=idle no histórico de navegação renderer-local do workspace
        -> Abrir Automations e esperar os dados das tabs scheduled / idle ficarem prontos
        -> visibleTabs contém idle ------> alternar para Idle-time e consumir o intent
        -> visibleTabs não contém idle ---> manter a tab padrão e consumir o intent
        -> Terminar, sem reescrever o Composer
     -> Nenhuma action suportada
        -> Seguir a cadeia de pré-preenchimento do prompt
  -> Localizar o Plugin opcional pelo option key + item id de item.defaults
  -> Ler prompt / optional pluginStableId
  -> Sem Plugin -------------------------------> escrever de imediato, em uma única vez, o prompt puro
  -> Com Plugin -> registrar a revision do Composer -> assinar o progresso de operationId -> resolução confiável pelo Agent
                  -> a revision muda durante a resolução ---> descartar em silêncio, sem sobrescrever o rascunho atual
                  -> enabled e sem conflito --------> escrever em uma única vez o Plugin chip (com ícone display-only opcional)
                                                 + canonical text + prompt
                                                 -> não lê o workspace catalog
                                                 -> não invalida o Runtime e não resolve de novo
                  -> disabled ----------------> o único Popover entra em loading -> escrever em uma única vez o prompt puro
                                                 + após o Composer consumir, o mesmo Popover muda no lugar para «Ativar o plugin {Plugin label}» + «Confirmar»
                  -> inexistente localmente -> emitir refreshing(operationId) -> o único Popover entra em loading
                  -> missing -> atualizar zcode-plugins-official (timeout de 10000ms)
                               -> timeout --------> marketplace_refresh_failed; abortar a atualização e rejeitar o snapshot antigo
                               -> falha --------> unavailable, proibir a instalação do snapshot antigo; escrever em uma única vez o prompt puro
                               -> sucesso e candidato confiável -> escrever em uma única vez o prompt puro
                                                    + após o Composer consumir, o mesmo Popover muda no lugar para «Instalar o plugin {Plugin label}» + «Confirmar»
                                                    -> clique fora do Popover: cancela em silêncio e mantém apenas o prompt puro
                                                    -> clique: instalação no User-scope
                                                       -> atinge 10000ms -> cancelar e registrar como falha, mantendo apenas o prompt puro
                  -> conflict/unavailable ----> escrever em uma única vez o prompt puro
  -> Enquanto instala/ativa, o Popover fica persistente na âncora original
  -> Após concluir a instalação/ativação, invalidar o Runtime de rascunho atrasado e deixar o Host de destino resolver de novo com confiança
  -> Em seguida, mover o Plugin chip para o início do rascunho mais recente
  -> Após o Composer atualizar, o mesmo Popover converge para o estado de sucesso
  -> Se a instalação falhar, voltar ao estado de confirmação e permitir nova tentativa; se a ativação falhar, exibir o resultado de falha
  -> Substituir o Composer + persistir o rascunho + focar
  -> O usuário envia manualmente
```

```text
operation A active
        |
Clique na sugestão B
        v
Fecha o Plugin action Popover já existente de A (se houver) -> abort A -> plugins/cancelOperation(A) -> limpar os resultados de A
        -> B se torna active imediatamente; todos os resultados tardios de A são descartados
        -> não exibe feedback de cancelamento ou interrupção
```

## Componente

`packages/ui/src/v4/ConversationDraftSuggestedPrompts.tsx`

```tsx
<ConversationDraftSuggestedPrompts className="mt-6" onSelect={(item) => …} />
```

| Prop                  | Descrição                                                       |
| --------------------- | --------------------------------------------------------------- |
| `className`           | nome de classe adicional do contêiner externo                    |
| `items`               | lista de itens recomendados mapeada a partir do `clientScenesService`; array vazio por padrão |
| `onSelect`            | callback de clique, com o argumento sendo a configuração completa do item recomendado |
| `disabled`            | desabilita os itens recomendados enquanto uma operation antiga está convergindo após o cancelamento |
| `pluginActionPopover` | âncora, fase, texto e ação de confirmação do Popover atual de instalação/ativação |

- Ponto de montagem: dentro do `conversationBottomDock` de `packages/ui/src/v4/SessionPane.tsx`, depois de `{composerNode}`,
  renderizado apenas no estado de rascunho (`isDraft`). A página de rascunho é organizada na ordem `welcome -> composer -> suggested slot`; o Container usa um slot fixo de `h-8` no fluxo normal do documento, sem posicionamento absolute. O slot permanece vazio durante o carregamento assíncrono da lista e os botões são preenchidos no mesmo slot quando os dados chegam, evitando mudança de altura antes e depois do carregamento.
- Layout: o grupo de botões mantém `24px` de distância da borda inferior do Composer, usa internamente uma disposição horizontal de linha única com hug-content
  e espaçamento de `gap-4` entre botões. No desktop fica centralizado abaixo do Composer; em tela estreita permanece em linha única e permite rolagem horizontal, sem colapsar em lista vertical
  e sem comprimir o Composer. O próprio grupo de botões não adiciona fundo de card adicional, e o Composer e o slot vazio participam juntos do cálculo como um único layout centralizado.
- Cada item reutiliza o estado de interação `outline` do `Button` compartilhado, com altura de linha `h-8`, usando `rounded-lg` de 8px e `px-3`; à esquerda fica um slot de ícone `size-4` (ícone lucide `size-4` interno) e à direita é exibido preferencialmente o
  `label` do prompt item no locale atual (vindo dos `labels` do Client Scenes). Após o clique, o Composer continua sendo preenchido com o `prompt` (vindo dos `contents`).
- Na primeira renderização da lista do Client Scenes, usa-se um efeito de entrada em waterfall: os botões entram em sequência da esquerda para a direita na ordem do DOM com
  intervalo de `65ms`, cada botão sendo revelado a partir de um recorte no topo e descendo `12px` para se acomodar. A animação não altera
  a altura do layout do grupo de botões. Quando o sistema tem
  `prefers-reduced-motion: reduce`, a animação é totalmente desligada.
- O texto visível e o ícone dos botões usam uniformemente `text-foreground`; a opacidade padrão do conteúdo é `opacity-70` e, no hover, transita por
  `transition-opacity` para `opacity-100`. O texto visível continua sendo apresentado em `text-ui-base` e permanece sempre em linha única com ellipsis.
  Em tela estreita não há quebra de linha e, ao ultrapassar a largura do grupo de botões, a rolagem horizontal dentro do grupo assume, sem deixar a própria página transbordar horizontalmente.
- A configuração `plugin` participa apenas da resolução de capability após o clique; o Plugin label e a referência canonical não são exibidos na lista de recomendações.
- O ícone usa diretamente o `img` do prompt item como nome canônico Lucide (kebab-case, por exemplo `file-text`),
  carregando dinamicamente o SVG correspondente pelo nome. O ícone não tem cor própria e usa `currentColor` herdando o `text-foreground` do slot de ícone;
  quando o `img` está vazio, o nome não pertence à versão atual do Lucide ou o carregamento do módulo falha, há recorrência ao `SquareCode` neutro. Não se lê o
  `imgs.cn` / `imgs.en` relacionados ao locale.
- Os campos i18n do servidor usam `cn` / `en`; `zh-CN` lê `cn`, `en-US` lê `en` e, quando o campo está vazio, há recorrência ao outro idioma.

## Mapeamento do Client Scenes

Consome-se apenas o `options.prompts.items` cujo `ClientSceneConfig.scene === "draft-suggestion"`; o antigo `ai-writing` não é mais usado como fallback e nenhuma outra scene ou option participa da lista de recomendações:

| `DraftSuggestedPromptItem` | Origem                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | o `id` do prompt item                                                                                                             |
| `label`                    | os `labels` do prompt item (`cn` / `en`)                                                                                          |
| `prompt`                   | os `contents` do prompt item (`cn` / `en`)                                                                                        |
| `iconName`                 | o nome canônico Lucide do `img` do prompt item; explicitamente não lê `imgs`                                                     |
| `actions`                  | o `on_finish` do prompt item; após dividir por vírgulas em inglês, mantém apenas as actions explicitamente suportadas pela UI        |
| `plugin.stableId`          | percorre os `defaults` do prompt item; a key localiza `scene.options[key]`, o id dentro do value localiza o item daquela option e lê os `contents` do item correspondente |
| `plugin.label`             | os `labels` (`cn` / `en`) do mesmo item correspondente                                                                            |

Quando `defaults` está ausente, a option key não existe, o id de item não existe ou o Plugin stable ID está vazio, o item recomendado é tratado como sem Plugin.
O `DraftSuggestedPromptItem` atual suporta apenas um Plugin e, portanto, quando existem múltiplas referências válidas em defaults, toma-se a primeira na ordem de declaração do servidor.

O Client Scenes é obtido pelo `useClientScenesResource()` compartilhado: ao montar concorrentemente com os modelos scheduled/off-peak sob a mesma autoridade de Service, apenas uma requisição é emitida. Uma lista vazia é exibida durante o carregamento do cache frio; com cache existente, o catálogo antigo é mapeado e exibido imediatamente e a revalidação em segundo plano
não pode esvaziar a lista. Quando a interface falha na primeira chamada, a resposta tem `code !== 0`, falta a scene `draft-suggestion` ou falta
`options.prompts`, exibe-se uma lista vazia, sem recorrer às recomendações estáticas locais; uma falha de revalidação com cache existente mantém os itens recomendados de last-known-good.
Falhas de interface usam o UI logger `warn` e não afetam o Composer. A troca de locale apenas remapeia os campos i18n do cache e não dispara requisição.
A janela de desduplicação do cache é de 10 minutos; quando a página realmente passa por hidden e volta a visible, é preciso contornar a janela de desduplicação e forçar uma revalidação, e múltiplos consumidores de recomendação ou template sob a mesma autoridade de Service/cache não podem repetir a requisição.

## Poda de estados e cobertura

| Case  | Estado                                            | Expectativa                                                                                                                                                                                                                     | Cobertura     |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| DSP01 | prompt item de `draft-suggestion`, sem defaults     | mapeia o i18n do servidor, substitui pelo prompt puro e não envia automaticamente                                                                                                                                            | focused unit |
| DSP02 | Plugin encontrado por defaults, já ready na primeira resolução | não escreve antes da resolução; após o retorno do resultado, substitui de uma só vez por chip + prompt, sem invalidar o Runtime, sem segunda resolução e sem ler o workspace catalog; o icon opcional vai junto com o chip estruturado | focused unit |
| DSP03 | Plugin missing                                  | após a ausência na primeira verificação local, envia `refreshing` e o único Popover entra em loading; atualiza apenas o mercado oficial, com timeout de 10000ms que aborta e falha de forma fechada; depois escreve de uma só vez o prompt puro e, após o Composer consumir, o mesmo Popover muda no lugar para um estado de confirmação sem prazo, e clicar fora do Popover cancela silenciosamente | focused unit |
| DSP04 | Plugin disabled / conflicted / falha na requisição de catalog | disabled primeiro coloca o único Popover em loading e depois escreve de uma só vez o prompt puro, mudando no lugar para confirmação após o consumo do Composer; conflict/falha não adiciona um segundo Popover; a requisição carrega clientMode/deliveryKind | unit         |
| DSP05 | clicar em outro item recomendado durante instalação ou ativação | fecha silenciosamente o Popover de action de Plugin antigo e cancela a operation antiga; desabilita os outros itens recomendados até a convergência do cancelamento; resultados tardios não sobrescrevem a nova escolha | focused unit |
| DSP06 | instalação concluída e o usuário já editou o rascunho | o progresso do Popover persiste; o corpo é mantido e o único chip de Plugin é prefixado; após a atualização do Composer, o sucesso é exibido no mesmo Popover com a rolagem vertical igual à do tag de modelo, sem envio automático | focused unit |
| DSP07 | falha de instalação ou ativação, ou instalação atingindo 10000ms | a falha de instalação restaura o Popover de confirmação e permite retry; a falha de ativação exibe o resultado de falha; o timeout de instalação cancela a operation e mantém o prompt puro | focused unit |
| DSP08 | falha de scenes / code não bem-sucedido / configuração-alvo ausente | lista vazia, Composer permanece utilizável                                                                                                                         | unit         |
| DSP09 | locale `zh-CN` / `en-US`                     | usa `cn` / `en` respectivamente, com recorrência entre idiomas quando faltam                                                                                  | unit         |
| DSP10 | `img` válido / ausente / falha de carregamento, com qualquer `imgs` | ícone válido; nos demais casos, placeholder de recorrência ignorando `imgs`                                                                                  | focused unit |
| DSP11 | usuário modifica o Composer durante a primeira resolução confiável do Plugin | após a mudança de revision, abandona silenciosamente a escrita adiada e o Popover, sem sobrescrever o rascunho atual | focused unit |
| DSP12 | `on_finish` com vírgula, espaço, repetição ou action desconhecida | mantém apenas as actions suportadas após a desduplicação                                                                                                      | focused unit |
| DSP13 | clicar em um item recomendado `NAVIGATE:AUTOMATIONS` | abre Automations, sem pré-preenchimento e sem envio automático                                                                                              | focused unit |
| DSP14 | clicar em um item recomendado `NAVIGATE:AUTOMATIONS:OFFPEAK` | abre Automations; seleciona automaticamente quando a tab Idle existe                                                                                          | focused unit |
| DSP15 | sem Idle tab depois que os dados da intent OFFPEAK estão prontos | mantém a tab padrão e consome a intent de uso único                                                                                                           | focused unit |
| DSP16 | celular `/remote` sem capacidade de navegação de Automations | filtra os dois tipos de item navegável e o prompt comum permanece utilizável                                                                                  | focused unit |

- Loading de resolução confiável, espera remota e erro de RPC são todos agrupados em “atualmente não verificável”, representados por DSP04, sem expandir o produto cartesiano de tipos de erro.
- “Não instalado” precisa passar por resolução confiável e atualização do mercado oficial; não se pode tratar a ausência no catalog como diretamente instalável nem usar o snapshot antigo de uma atualização que falhou.
- O Popover e a escrita no rascunho compartilham a fronteira latest-wins, e respostas antigas de catalog que chegam tarde não podem sobrescrever o rascunho nem exibir um aviso obsoleto; interrupções causadas pela troca manual de item recomendado são sempre silenciosas.
- Nem loading nem confirmação iniciam temporizador de fechamento automático; apenas a confirmação responde ao clique com o ponteiro principal fora do Popover e cancela a operation atual. Em qualquer momento há no máximo um Plugin action Popover montado globalmente.
- desktop, Web móvel, local e remote compartilham o mesmo prefill de escopo de workspace e o mesmo texto canonical, sem bifurcar para cada estado de Plugin;
  a aceite manual de UI verifica simultaneamente o desktop e a Web móvel.
- O E2E de conversa adota as cadeiras representativas: instalação local no desktop, isolamento de Host User-scope remoto do desktop, recuperação de falha de atualização no controle remoto do celular e, além disso, troca de item recomendado durante a instalação.
  Tema, idioma, action/persistência/clique externo do Popover, foco de teclado, layout móvel e reduced-motion ficam por conta da aceite manual, sem alegar cobertura automatizada de UI.

## Impact Brief

| Campo           | Conclusão                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change layers  | `option-source`, `presentation`, `draft-default`, `validation`, `commit-effect`                                                                                                                                         |
| UI surface     | `ConversationDraftSuggestedPrompts` da página de rascunho de New Task                                                                                                                                                     |
| Draft owner    | renderer-local Composer draft / workspace-scoped insert request                                                                                                                                                         |
| Option source  | `clientScenesService.list()` → `draft-suggestion.options.prompts.items`                                                                                                                                                 |
| Validation     | fronteira de mapeamento do Client Scenes + resolução confiável `plugins/resolveSuggestedReference` do Host de destino                                      |
| Commit sink    | `requestComposerTextInsert`; não chama `onSendText`                                                                                                                                                                     |
| Persistence    | persistência de Composer draft do V4 já existente                                                                                                                                                                       |
| Invariants     | prompt comum substitui e não envia automaticamente; action de navegação não pré-preenche; OFFPEAK só alterna entre as tabs Idle existentes; prompt puro quando o Plugin está indisponível; isolamento por workspaceIdentity; celular `/remote` não adiciona entrada de Automations; a operação carrega clientMode/deliveryKind e pode ser cancelada |
| Graph evidence | `capability.plugin-reference` + nova superfície de suggested-prompts; o ambiente atual não possui codegraph, então são usados seeds do feature graph e a conferência de pontos de chamada exatos em profundidade 2 |

O componente continua sendo apenas uma superfície de exibição e um ponto de entrada de clique; a configuração do servidor fornece apenas candidatos e dicas de capability, a UI consome somente o resultado da resolução confiável do Host de destino,
não lê mais o workspace catalog e mantém o contrato existente de título em linha única, referência de Plugin oculta, substituição do rascunho e ausência de envio automático.

## Telemetria de clique em modelos de prompt

No Desktop, cada clique em um modelo de prompt recomendado — incluindo o pré-preenchimento de prompt comum, a navegação de Automations e a navegação de Off-Peak — reporta uma única vez um evento de produto pelo `reportAppTelemetryEvent()` existente. Web e controle remoto do celular mantêm nesta rodada apenas o comportamento de UI existente e não chamam essa telemetria;
a cadeia real de reporte dos dois lados será completada separadamente. O evento é fixo em:

| Campo | Valor / semântica |
| --- | --- |
| `elementName` | `prompt_template_ck` |
| `eventRegion` | `app.session` |
| `eventType` | `ck` |
| `eventText` | o nome do modelo realmente visto pelo usuário no idioma de interface atual |
| `eventExtraDetail.template_id` | o `item.id` do prompt item do Client Scenes, usado como dimensão de estatística estável entre idiomas e renomeações |
| `eventExtraDetail.template_prompt` | o Prompt completo resolvido no idioma de interface atual; não inclui edições posteriores do usuário |

`eventExtraDetail` contém estritamente apenas `template_id` e `template_prompt`, sem enviar `template_name`,
`template_action`, `talkId` ou `messageId`. A telemetria de clique é disparada no início do tratamento do clique e fica desacoplada das operações assíncronas de Plugin, da navegação
ou do pré-preenchimento do rascunho; uma falha de telemetria não pode bloquear a interação original. O `userId`, o contexto de cliente e os campos de dispositivo do Desktop continuam sendo completados pela cadeia de hospedeiro `/event/report` existente. Web / controle remoto do celular não estão no escopo de estatística `/event/report` desta rodada.