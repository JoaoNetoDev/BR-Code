# Roteamento de gatilhos do Composer e layout do Mention Panel

> Status: implementado e aprovado nos focused tests e no Desktop E2E (2026-07-31); em 2026-08-20 foi acrescentado o
> ciclo de vida de workspace/session do catálogo de Skills do Composer, veja
> [conversation-skill-catalog-lifecycle.md](./conversation-skill-catalog-lifecycle.md).
> Esta rodada ajusta apenas as entradas principais da caixa de entrada, a ordem dos grupos e os avisos padrão, sem remover candidatos antigos de capacidade, gatilhos, Markdown canônico, análise de histórico ou compatibilidade de restauração.

## Decisões de produto

O Composer usa `@`, `/` e `$` como três entradas principais de descoberta:

| Entrada principal | Ordem dos grupos principais    | Semântica                                                                                            |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@`    | 1. Plugins；2. Arquivos；3. Conversas | Referencia o contexto necessário à tarefa atual. O grupo de arquivos contém arquivos e pastas; conversas mantém o sessions-index do workspace atual. |
| `/`    | 1. Comandos；2. Skills；3. Subagent | Escolhe o comando ou a capacidade a executar.                                                          |
| `$`    | Skills                          | Seleção direta de skill.                                                                             |

Capacidades antigas continuam disponíveis:

- O grupo Whiteboards já existente dentro de `@` continua sendo exibido, posicionado depois dos três grupos principais acima, sem remover capacidades de provider, chip ou renderização histórica.
- `#` ainda abre diretamente o painel de candidatos de conversas original.
- `$`, `¥`, `￥` ainda abrem diretamente o painel de candidatos de Skills original, com `¥` e `￥` continuando normalizados para `$`.
- Menções de file, whiteboard, session, skill e subagent geradas por rascunhos antigos, mensagens de histórico e entradas externas continuam sendo analisadas e exibidas no formato original.
- Outras capacidades não alocadas nos grupos principais continuam utilizáveis via prompt comum em linguagem natural; esta rodada não remove nenhuma capability de runtime.

O action menu `+` da caixa de entrada destaca explicitamente `@`, `/` e `$` e deixa de exibir o item de atalho `#` para conversas, porque as conversas já entraram na entrada principal `@`; mas quando o usuário digita `#` manualmente, o painel de candidatos original continua abrindo normalmente.
O texto de busca de query vazia do painel `@` lista apenas plugins, arquivos e conversas, sem mais mencionar whiteboards.

```text
Composer
├─ @  referenciar contexto
│  ├─ 1. Plugins
│  ├─ 2. Arquivos / Pastas
│  ├─ 3. Conversas
│  └─ 4. Whiteboards (capacidade antiga preservada)
├─ /  escolher capacidade
│  ├─ 1. Comandos
│  ├─ 2. Skills
│  └─ 3. Subagent
├─ $  escolher skill
├─ #  candidatos de conversa (entrada de compatibilidade preservada)
└─ ¥ / ￥  candidatos de Skills (entrada de compatibilidade preservada)
```

## Desacoplamento entre entrada e portador canônico

A entrada de descoberta apenas define "em qual painel encontrar o candidato" e não pode alterar o portador estável após o envio:

| Candidato          | Entrada de descoberta       | Portador canônico mantido após a seleção |
| ------------- | --------------------------- | -------------------------------------------- |
| Plugin        | `@`                         | `[@Plugin](plugin://stable-id)`              |
| Arquivo / Pasta | `@`                         | link Markdown file/directory existente            |
| Conversa          | `@` ou `#` compatível              | `[#Title](#sess_id)` / `#sess_id` existente       |
| Whiteboard    | `@`                         | whiteboard mention existente                      |
| Comando          | `/`                         | `/command`                                   |
| Skill         | `/` ou `$` / `¥` / `￥` compatível | `$skill` existente ou link Markdown de Skill com caminho |
| Subagent      | `/`                         | `@agent-name` existente                           |

Portanto, adicionar "Conversas" ao `@` não cria um novo protocolo de session-reference; colocar Skill e Subagent sob `/` também não os serializa como slash command. Envio, edição, queue, retry, fork e cold resume continuam consumindo o texto canônico original.

## UI Surface Matrix

| Cenário do usuário                               | Entrada de UI                          | Origem dos candidatos                                                                  | Estado local                                | Resultado do envio                                     | Limite de modo                                                    | O que precisa ser isolado                                                             |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Referenciar Plugin / Arquivo / Conversa / Whiteboard | Painel `@` do `MentionPlugin`      | plugin reference catalog、file provider、sessions-index、whiteboard provider  | Lexical active trigger + selected index | Inserir o Markdown canônico original correspondente                | Compartilhado por Desktop/Web/Mobile; remote usa os workspace services de destino | Não alterar o congelamento do Plugin catalog, a semântica de caminhos de arquivo ou a autoridade do session catalog |
| Escolher Comando / Skill / Subagent            | Painel `/` do `SlashCommandPlugin` | CLI command catalog、Skills、Subagents                                        | Lexical active trigger + selected index | Inserir `/command`, Skill mention e `@agent` respectivamente | O isolamento por workspace identity permanece inalterado                            | Não executar Skill/Subagent por engano como command                              |
| Usar entradas compatíveis                           | `#`、`$`、`¥`、`￥`              | sessions/skills provider；apenas `#` agrega o workspace sessions-index sob a mesma authority | trigger state original                        | Markdown canônico original                        | `#` não cruza Agent Host；os demais gatilhos seguem como antes                   | Não mudar o escopo de conversas de `@` nem quebrar rascunhos antigos por causa da expansão de `#`                           |
| Descobrir entradas pelo menu `+` da caixa de entrada              | `ChatPromptActionMenu`           | Entradas estáticas                                                                      | Sem estado persistente                              | Insere os caracteres de gatilho `@`, `/` ou `$`                | Cada plataforma só adapta o layout                                            | Não expor `#` em duplicidade, mas sem afetar a digitação manual de `#`                             |

## Comportamento compartilhado e diferenças

- `@` e `/` continuam reutilizando a lista virtual, a navegação por teclado, o estado desabilitado e a máscara de rolagem do `MentionPanel`.
- Os dois painéis principais compartilham o layout, mas não a autoridade dos candidatos: Plugin, arquivos, conversas, comandos, Skill e Subagent continuam sendo responsabilidade dos respectivos provider/hook.
- Os candidatos de arquivo são indexados de forma unificada por `listWorkspaceFiles` do Host ao qual o workspace pertence, e seguem o [filtro padrão de busca de arquivos do Workspace](../superpowers/specs/2026-08-07-workspace-file-search-default-filter-design.md); a UI não mantém uma segunda lista negra. Diretórios ocultos comuns ocultam apenas o candidato do diretório e continuam escaneando os descendentes; regras personalizadas futuras entram substituindo o filtro do service, sem fonte de configuração nesta entrega. A busca na Workspace File Tree do lado esquerdo reutiliza o mesmo índice de arquivos e a mesma ordenação de correspondência, mas não herda os grupos do painel `@`, o preview limit de query vazia, o envio de candidatos por teclado nem a inserção de menção Markdown canônica; os resultados da árvore de arquivos continuam abrindo a pré-visualização ou localizando o diretório conforme a semântica da árvore.
- A busca entre grupos do `@` exibe na ordem fixa de grupos, sem reordenação global por relevância; dentro de cada grupo valem os filtros e ordenação existentes.
- O `/` mantém a ordem fixa Comandos → Skills → Subagent; a seleção padrão pelo teclado ainda pode usar a melhor correspondência entre grupos, sem alterar a ordem visual dos grupos.
- Os candidatos de Skill do `/` e de `$`/`¥`/`￥` compartilham a mesma autoridade de catálogo: um rascunho novo lê o diretório atual do workspace antes de o prewarm ficar ready e, depois de ready, lê o diretório congelado do runtime correspondente a `prewarmSessionId`; uma Session já existente lê o diretório congelado do runtime correspondente ao `sessionId` oficial; após cold resume / restart de runtime, é consultado de novo junto com o novo runtime.
  O gerenciamento de diretório em tempo real nas Settings permanece independente e não pode retropreencher nem atualizar a quente Sessions já existentes. A sequência completa está em
  [Ciclo de vida do Composer Skill Catalog](./conversation-skill-catalog-lifecycle.md).
- Com query vazia, mostra-se a prévia de cada grupo; com query, apenas o texto auxiliar padrão é ocultado, nunca os estados de resultado vazio, loading ou erro.
- O provider de conversas escolhe o escopo conforme o gatilho: `@` mantém o workspace atual, e apenas `#` agrega todos os workspaces sob a mesma authority de Agent service/session store; em `#` os candidatos do workspace atual têm prioridade, os demais são ordenados pela última atualização e o nome do workspace continua aparecendo na descrição do candidato. Com query vazia, `#` mostra no máximo as 20 entradas mais recentes por workspace; na busca, casa primeiro com todo o histórico daquele workspace e mantém no máximo 20 resultados correspondentes. Essa restrição não se aplica ao `@`.

## Layout e interação

- A lista de candidatos é exibida preferencialmente acima do painel; o texto auxiliar de query vazia fica abaixo da lista.
- A lista mantém densidade compacta de menu, com títulos de grupo usando `text-ui-base`, `text-foreground-subtle` e `h-8` (32px) centralizados verticalmente, e altura de linha virtual igual à dos itens de comando, 34px; seguindo também as superfícies de menu e estilos de foco de teclado definidos em `DESIGN.md`.
- Na rolagem da lista virtual, aplica-se máscara de esmaecimento superior e inferior no container de rolagem; ela só aparece quando ainda há rolagem possível na direção correspondente.
- Enter e Tab selecionam o candidato atual; as setas navegam continuamente entre grupos; Esc fecha apenas o painel atual, sem reescrever a entrada.
- Plugins desabilitados permanecem visíveis e exibem o motivo do conflito; o estado desabilitado não pode ser selecionado por Enter ou Tab.
- Desktop, Web comum e Mobile mantêm a mesma semântica de grupos; telas estreitas apenas ajustam dimensões e quantidade visível, sem alterar grupos ou portador canônico.

## Limites e podas

- O agrupamento de entradas de 2026-07-31 pertence a `presentation + option-source` e não modificou o protocolo de mensagens. O complemento de ciclo de vida de Skill de 2026-08-20 adiciona a query somente-leitura `skills/referenceCatalog` e a projeção de catálogo do runtime de Session, mas não modifica provider request, entrada canônica, stream de session/task, continuous/replayable ou a cadeia de restauração remota.
- `@` e `#` continuam reutilizando o mesmo provider e a authority do Agent Host atual, mas o escopo dos gatilhos é isolado explicitamente: `@` pega apenas o workspace
  atual, e só `#` ativa a agregação entre workspaces.
- O "todos os workspaces" de `#` tem como limite os workspaces já abertos ou restaurados no Tab Store com escopo de window atual e que compartilham a mesma authority de armazenamento
  de sessões do composer. local-local e a mesma authority remote podem agregar; local-remote e authorities remote diferentes não compartilham o session store SQLite, então foram podados nesta rodada para evitar que `ReadSessionContext` não encontre a sessão após a seleção.
- Skill compartilha o mesmo catálogo filtrado por provider sob `/` e `$`/`¥`/`￥`, sem duas semânticas separadas de enable/filter.
- Whiteboard, tema, idioma, fase da task e modelo/provider não fazem produto cartesiano com a ordem dos grupos; isso é coberto por invariantes de componentes compartilhados e por casos representativos no Desktop.
- Workspace remoto valida a agregação de múltiplos workspaces sob a mesma authority de `remoteSessionId`/service, e que authorities remote diferentes e remotes não conectados não entram como candidatos; nenhum escopo remote pode regredir para o base service local.

## Aceitação

- Ao digitar `@`, os grupos principais aparecem sempre em Plugins → Arquivos → Conversas, com Whiteboards como grupo preservado logo depois.
- Ao digitar `/`, os grupos aparecem sempre em Comandos → Skills → Subagent.
- Ao digitar `#`, `$`, `¥`, `￥`, os painéis de candidatos originais ainda abrem e permitem seleção.
- Ao digitar `#`, é possível selecionar conversas de outros workspaces já abertos ou restaurados sob a mesma authority de armazenamento de sessões; o workspace atual tem prioridade e a linha do candidato exibe o nome do workspace de origem. Ao digitar `@` continuam aparecendo apenas conversas do workspace atual.
- O limite de candidatos de `#` é agrupado por `workspaceIdentity?.trim() || workspacePath`, com no máximo 20 entradas por workspace; não se pode usar um limite global de 20 que deixe um workspace deslocar os demais; a busca continua cobrindo sessões de histórico além das 20 mais recentes.
- O action menu `+` exibe diretamente adicionar, plugin, arquivo e sessão; no rodapé explica os símbolos de atalho na ordem `@`, `/`, `$`, sem item de atalho `#` separado.
- A conversa selecionada em `@` continua sendo gravada como session mention canônico `#sess_...`; Skill/Subagent selecionados em `/` continuam sendo gravados como Skill / `@agent` mention existentes.
- O texto auxiliar de query vazia fica abaixo da lista; some depois que uma query é digitada.
- O texto auxiliar de query vazia do `@` sugere apenas buscar plugins, arquivos e conversas; whiteboards não aparecem nem em português nem em inglês.
- Setas, Enter, Tab, Esc, máscara de rolagem e estado desabilitado de Plugin continuam funcionando.
- Whiteboard, Session, Skill e Subagent mentions em rascunhos antigos e no histórico continuam sendo exibidos corretamente.

## Implementação e verificação

- `MentionPlugin` fixa a ordem plugins → files → sessions → whiteboards do `@` por meio de uma tabela de roteamento pura, preservando ao mesmo tempo o sessions provider de `#` e o Skills provider de `$` (incluindo a normalização de Yen).
- `ChatPromptActionMenu` exibe candidatos de adicionar, plugin, arquivo e sessão; `@`, `/` e `$` aparecem apenas como aviso no rodapé.
- A função de serialização dos candidatos não mudou: a seleção de conversa em `@` continua sendo gravada como `#session` canônico, e a entrada compatível de Skills continua sendo gravada como o Markdown de Skill original.
- O sessions provider só monta o conjunto de escopos de mesma authority a partir das workspace tabs da janela atual sob o gatilho `#`; o `@` continua montando um escopo único do workspace atual. Ambos reutilizam o registro sessions-index;
  os detalhes de authority, a poda entre Hosts e a cobertura estão em
  [Cross-Workspace Session Mention](../superpowers/specs/2026-08-04-cross-workspace-session-mention-design.md).
- Os focused tests cobrem a ordem das entradas principais, o roteamento das entradas compatíveis, o conjunto de ações do menu `+`, a normalização de Yen e a construção do canônico existente.
- O Desktop E2E oficial `conversation-session-v4-mention.test.ts` cobre o sessions-index compartilhado por `@` / `#`, a seleção de skills por `$` / `¥` / `￥`, o aviso de rodapé `@` / `/` / `$` no menu `+`, a abertura dos candidatos de skills digitando `$` manualmente após o fechamento, e em S08 verifica o diretório de Skill congelado de uma Session antiga e a redescoberta real de `SKILL.md` em uma tarefa nova.
- As combinações completas de interação por teclado para plugin/file/session/whiteboard e command/skill/subagent continuam no corpus manual-review pending; a matriz de cobertura não vai se passar por concluída usando apenas os portões representativos acima.

A classificação atual do `+` e o aviso de rodapé estão em [chat-composer-action-menu.md](chat-composer-action-menu.md): seleção direta de anexo, alvo, plugin, arquivo e sessão; `@`, `/` e `$` ficam como explicação no rodapé e não são mais itens de menu independentes.