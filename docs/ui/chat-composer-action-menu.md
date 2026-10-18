# Menu de ações do composer do chat

Requisito de produto: [PRD] Adicionar ao botão da caixa de entrada entradas de plugin e contexto: https://internal-docs.example.invalid/redacted

## Contrato de produto

O `+` à esquerda da caixa de entrada abre um Popover com a mesma largura da caixa de entrada, reutilizando o MentionPanel e o componente de linha de candidato.

| Ordem | Categoria | Conteúdo e comportamento de seleção                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | Adicionar | Anexo chama o attachmentAction existente; o objetivo só aparece em sessão nova com entrada vazia e insere a mesma tag de comando de `/goal`; o workflow vem logo após o objetivo, aparece em qualquer sessão com entrada vazia quando o catálogo slash da CLI contém `workflow`, e insere a mesma tag de comando de `/workflow` |
| 2    | Plugins | Usa o mesmo catálogo, a mesma ordenação e o mesmo filtro de enabled do `@` vazio; itens em conflito continuam desabilitados |
| 3    | Arquivos | Workspace atual, arquivos primeiro, do mesmo tipo ordenados por caminho relativo, no máximo 10 itens para consulta vazia |
| 4    | Sessões | Workspace atual, `updatedAt` decrescente, `createdAt` decrescente, ordenação por título; não se estende ao escopo entre projetos do `#` |

Arquivos e sessões ocultam a categoria quando não há candidatos e não há estado de carregamento/erro. Plugins mantêm o estado vazio. O quadro de drawings não entra neste menu.
Um rascunho novo lê o catálogo de plugins atual do workspace; uma sessão existente lê o catálogo session-owned, seguindo o ciclo de vida do `@`.

## Interação e layout

- `/goal` hoje só é interpretado como comando no início da mensagem; sessões existentes ou rascunhos não vazios ocultam o objetivo, evitando inserir um comando inválido no meio.
- `/workflow` é um comando customizado do plugin builtin zcode-guide e também só é expandido no início da mensagem (o padrão `^\/` de `custom-command-prompt.ts`); rascunhos não vazios ocultam o workflow. Como ele não se liga a estado de nível de sessão, é oferecido tanto em rascunhos novos quanto em sessões existentes; quando o catálogo não tem `workflow` (plugin desabilitado), ele é ocultado, evitando enviar ao modelo um texto puro que a CLI não expandiria.
- Clicar num candidato fecha o menu e insere a tag na posição do cursor de antes da abertura; preserva o rascunho dos dois lados do cursor e substitui a seleção quando há texto selecionado. Em seguida, o foco volta ao editor.
- Anexos usam a cadeia de seleção de plataforma já existente; quando o controle remoto do celular não fornece attachmentAction, o item de anexo é ocultado.
- As setas percorrem em ciclo e pulam itens desabilitados; Enter/Tab/Space selecionam; Escape/clique fora fecha.
- Rodapé em linha: `@ 添加上下文`, `/ 选择能力`, `$ 选择技能`, `输入内容以搜索插件、文件和对话`; quebra de linha em telas estreitas, com internacionalização em chinês e inglês.
- As dicas são texto explicativo, não candidatos do menu. O `+` não adiciona uma caixa de busca; a busca continua sendo acionada pelos gatilhos do editor.
- A área de rolagem de candidatos tem no máximo 24rem e encolhe conforme a altura disponível do Popover; os painéis `@`, `/` e `$` mantêm as alturas atuais.
- Usar tokens de tema; as ações permanentes da caixa de entrada continuam sendo `+`, seleção de permissão/modo e os demais slots.

## Dados e fronteiras

```text
+ abrir -> salvar a seleção do Lexical -> provider existente lê os candidatos
          selecionar candidato -> restaurar seleção -> inserir canonical mention -> focar o editor
          selecionar anexo -> fluxo de seleção de anexo da plataforma
```

O editor compartilhado cobre desktop, Web e celular. O workspaceIdentity é repassado e o caminho de execução de arquivos continua sendo o workspacePath.
Esta alteração muda apenas a entrada de candidatos e a edição do rascunho, sem novo protocolo, Host/runtime, persistência ou lógica de envio; as fronteiras de desktop-continuous e web-remote-replayable permanecem como estão.

## Cobertura de aceitação

- PLUS01: agrupamento adicionar/plugins/arquivos/sessões, ordem dos candidatos, menu desabilitado e fronteira de anexo por plataforma.
- PLUS02: objetivo visível apenas em sessão nova com entrada vazia; a seleção de plugin/arquivo/sessão preserva o texto dos dois lados do cursor, com markdown canônico igual ao da entrada original.
- PLUS03: navegação por teclado pulando itens desabilitados, fechamento por Escape, callback de anexo executado apenas uma vez.
- PLUS04: rodapé em linha no desktop, aumento da altura da lista, sem overflow horizontal em tela estreita.
- PLUS05: workflow posicionado após o objetivo; visível em rascunho vazio, oculto em rascunho não vazio; após selecionar, insere `/workflow` e permanece no início da mensagem.

Testes de componente: `packages/ui/test/chatPromptActionMenuInteraction.test.ts`.
Casos candidatos de Electron: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plus-menu.test.ts`.
Os casos novos não passaram por aceitação manual nem por promotion formal, e não se alega entrada na suite de Docker/CI.

## Verificação antes do commit (2026-09-08)

- A base já foi sincronizada com `origin/staging`: `054cf7c06c`, verificação de freshness aprovada.
- UI focada: 10 arquivos, 109 casos aprovados; testes relacionados às alterações do workspace: 312 arquivos, 3000 casos aprovados.
- E2E pending de Electron: 3 casos aprovados; objetivo visível apenas em sessão nova com entrada vazia, referência de plugin/Escape e layouts largo/estreito todos aprovados, com cada caso terminando ao afirmar que o provider capture está vazio.
- Artefato de E2E: `packages/desktop/.e2e-artifacts/desktop-e2e-20260908135636857-p81797-6b6d86ab55faaebc/summary.md` (produto local ignorado, não entra no repositório).
- `pnpm typecheck`, `typecheck:e2e`, lint, fixture check, conversation coverage audit e a verificação de formatação dos arquivos TS/JSON alterados passaram; o lint ficou com os 43 warnings já existentes / 0 errors.
- `verify:pre-push` passou, mas seu affected runner só compara o range de commits e é pulado quando não há commit; os 3000 casos acima foram executados explicitamente passando as alterações do workspace ao mesmo lint-staged related runner.
- O `pnpm fmt:check` do repositório inteiro não passou: já existem muitas diferenças de formatação no repositório e os HTMLs de exemplo em `docs/electron/docs/fiddles/` têm erros de parsing; nenhum arquivo não relacionado foi alterado em massa.
- Não foram verificados o controle remoto real do celular nem Windows/Linux; não foi executado promotion manual nem a suite de Docker. Este caso permanece pending para a aceitação manual seguinte.

## Escopo de leitura da lista de sessões

O front-end não trunca adicionalmente os candidatos do sessions-index, mas também não lê todo o histórico completo. No cold start, a CLI lê no workspace atual até 200 resumos leves não arquivados e então mescla as sessões de runtime já carregadas; isso não é um limite total permanente. A barra lateral e o mention reutilizam a assinatura por endpoint/workspace; o menu limita o DOM com lista virtual. Exibir as 5 primeiras no front-end só reduz o processamento/navegação de candidatos e não substitui paginação ou busca no back-end.

Regressão da restrição da entrada Goal: primeiro confirma-se que os novos testes falham na implementação antiga e só então se verifica que os 10 testes de componente do menu passam; no total, 31 testes focados relacionados passaram e os 3 E2E de Electron mais recentes passaram. A verificação de tipos e o lint passaram novamente.

Regressão final de âncora (2026-09-08): corrigido o problema da âncora customizada ser sobrescrita pela âncora padrão do botão e do menu ter largura zero após a desmontagem do botão antigo. O Electron ganhou a verificação de abrir quatro vezes seguidas e afirmar largura igual à da caixa de entrada, totalizando 4 casos aprovados; os 10 casos de componente do menu passaram. Artefato mais recente: `packages/desktop/.e2e-artifacts/desktop-e2e-20260908141040179-p91755-f8ea6aba86ad30d3/summary.md`. Após o hot reload atual em dev, a verificação manual de abrir/fechar em sequência e da entrada de nova tarefa passou.

Complemento de fronteira na revisão: o objetivo respeita excludedSlashCommandNames (incluindo a desativação de Goal no selection side chat), é oferecido apenas para rascunho com string estritamente vazia, não para espaço em branco; quando o item de adicionar está vazio, a seção é ocultada. Se o rascunho for substituído enquanto o overlay está aberto, o nó de seleção já invalidado não é restaurado e a inserção passa a ocorrer no fim do rascunho atual. O E2E formal de v4-mention verifica em paralelo a dica do rodapé e o caminho de acionamento manual. O coverage audit verifica apenas o contrato de diretório/matriz e não executa o E2E.

Verificação das correções de revisão de 2026-09-09: 3 novos casos de fronteira do menu falharam antes de passar; 3 arquivos focados, 18 casos aprovados (incluindo restauração de seleção com nó Lexical expirado real). O `conversation-session-v4-mention.test.ts` formal passou com 1 caso, evidência `desktop-e2e-20260908162645238-p47690-05cbd56f84b41d2e` no formal worker; o caso de substituição de rascunho do mesmo lote pending descobriu que o menu fecha junto com o preenchimento de volta e foi corrigido conforme o comportamento real, e a reexecução isolada dos 5 casos pending passou integralmente, evidência `desktop-e2e-20260908162845106-p50242-675fde70d62d44fa`. Verificação de tipos, lint (41 warnings já existentes), coverage audit e fixture check formal passaram. SG-03 foi removido depois que dep:refs confirmou que o export antigo era referenciado apenas pelo próprio teste; o texto do anexo é fornecido pelo chamador e consumido no menu.

## Entrada de workflow (2026-09-11)

Registro de decisões do interview:

| Pergunta                          | Decisão                                                                                                          | Fronteira fixada                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origem da existência do item de workflow | **O catálogo slash da CLI é a fonte da verdade**: só aparece quando `slashCommands` do workspace contém `workflow`             | Segue a decisão já existente de que o catálogo de comandos tem a CLI como autoridade; a UI não codifica uma segunda origem de comandos. O objetivo continua hardcoded como está (ele tem gate semântico de nível de sessão, independente do catálogo) |
| Quando é oferecido                 | **Rascunho vazio, qualquer sessão** (rascunho novo e sessão existente)                                             | `/workflow` só expande no início da mensagem, então exige rascunho com string estritamente vazia (mesmo critério do objetivo); não é restrito a sessão nova como o objetivo, porque iniciar um workflow no meio de uma conversa existente é uso legítimo |
| Ordem no painel `/`                | **No lado de montagem do catálogo da CLI**: `workflow` é comando builtin e `APP_PROTOCOL_VISIBLE_BUILTIN_SLASH_COMMAND_NAMES` o coloca depois de `goal` | Fonte única de dados: desktop, Web e controle remoto do celular veem a mesma ordem; a UI não ganha uma whitelist nova de ordenação (um bugfix anterior já removeu a whitelist de comandos da UI). Apenas ajusta a ordem, sem mudar origem, dedupe nem regras de reserved |
| Ícone da tag `/workflow` no editor | **lucide `Workflow`** (`WORKFLOW_COMMAND_MENTION_ICON_NODE`)                                                       | Mesmo ícone do item do menu `+` e do resto da UI do dwf; o mecanismo de ícone dedicado de `/goal` e `/compact` é copiado tal como está                                                       |

Fluxo de dados:

```text
CLI listProtocolSlashCommands
  builtins[goal, workflow, compact, init, plan] + custom[...]
  → ordem fixa [goal, workflow, compact, init, plan, ...custom]        （único ponto de ordenação; com o rollout desligado não há workflow nos builtins）
  → available_commands_update → store.slashCommands
        ├─ painel `/`: exibido na ordem do catálogo (inalterado)
        └─ menu `+` "Adicionar": anexo → objetivo(rascunho vazio em sessão nova) → workflow(rascunho vazio ∧ catálogo contém workflow)
Selecionar workflow → inserir a tag de comando `/workflow` (igual à canônica do painel `/`) → focar o editor
```

O menu `+` tira um snapshot de se o rascunho está vazio no instante da abertura (o mesmo snapshot do objetivo), e os itens objetivo/workflow são decididos por esse snapshot,
evitando que a rolagem dos candidatos durante a abertura do menu embaralhe a seleção por teclado.

Testes: `chatPromptActionMenuInteraction.test.ts` (ordem, visível em qualquer sessão, oculto quando o catálogo falta / rascunho não vazio / nome excluído,
inserção de `/workflow`); `promptMentionNode.test.ts` (nó de ícone);
`apps/zcode-cli/packages/bootstrap/tests/protocol-slash-commands.test.ts` (ordem do catálogo);
caso pending de Electron PLUS05.
