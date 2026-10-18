# Plano de Implementação da Migração E2E de Conversation Session V4

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Atualizar a suíte E2E de conversation-session após o refactor v4, aposentando as asserções antigas do helper ChatView, reescrevendo as semânticas de produto ainda válidas contra os helpers v4 e mantendo o catálogo de cases e a matriz de cobertura à frente das mudanças de testes executáveis.

**Arquitetura:** Tratar `docs/conversation-session-case-catalog.md` como a fonte de verdade das semânticas de produto e `docs/testing/conversation-session-e2e-coverage-matrix.md` como o registro de cobertura de automação. O E2E formal v4 deve usar `packages/desktop/test/e2e/helpers/v4-conversation.ts` e `TID_V4_*` para o estado de root/composer/message/queue/action, além de fixtures locais do case e replay determinístico. Specs que ainda chamam `prepareConversationE2E()` ou importam o antigo helper agregado só são corpus de migração depois do corte rígido v4 de 2026-07-05. Test ids de tool/history/toolbar/summary-panel compatíveis e submodules de helper focados podem permanecer nas specs formais V4.

**Stack técnico:** E2E desktop com WebdriverIO, protocolo de projeção de conversa v4, fixtures de replay de provider, TypeScript, scripts de audit em pnpm, verificação headless em Docker.

## Restrições globais

- Atualizar `docs/conversation-session-case-catalog.md` e `docs/testing/conversation-session-e2e-coverage-matrix.md` antes de criar, reescrever ou apagar specs E2E de conversation-session.
- Não deixar specs antigas de helper ChatView no portão formal padrão. Um case migrado é ou uma spec formal v4, ou um item documentado de revisão manual/pendente, ou uma exclusão documentada de semântica de produto.
- Preservar as fronteiras de `desktop-continuous` no desktop e `web-remote-replayable` no mobile. Verificações de recuperação replayable não devem ser afirmadas contra a cadeia principal contínua do desktop, a menos que o catálogo diga explicitamente isso.
- Usar fixtures locais do case sob o diretório de fixtures E2E correspondente. Não adicionar novas fixtures compartilhadas do estilo provider-basic.
- Usar imports absolutos e as APIs de helper existentes. Qualquer helper ausente deve ser adicionado primeiro à camada de helper v4, não duplicado dentro das specs.
- Para trabalhos de E2E que afetem a UI, ler o `DESIGN.md` da raiz antes de tocar em `packages/ui`; este plano de migração não modifica código de UI.
- A implementação final precisa rodar `pnpm typecheck` e `pnpm lint`. Reescritas de E2E focadas também precisam rodar seu fixture de replay e, quando promovidas ao portão, a verificação headless em Docker.

## Baseline do estado atual

- Após a Task 2 de 2026-07-11 há 121 specs de conversation-session: 29 formais, 92 em `manual-review/pending`.
- Os 32 legacy formal que realmente chamavam `prepareConversationE2E()` foram rebaixados como estão para pending; no conjunto formal, o número de arquivos que importam exatamente o antigo helper agregado e chamam `prepareConversationE2E()` é 0.
- Após a Task 3 de 2026-07-11, os 29 formais compatíveis com V4 possuem manifest de case exato e fixture de provider local do case: formal/manifest/fixture local do case = 29/29/29, verificação de fixture por spec = 29 pass, 0 error. Os 29 fixtures registram ao todo 32 sidecars de título específicos de case (3 cases de split de dupla sessão com 2 cada), sem deixar mais a requisição de título do replay padrão recorrer ao `provider-basic.json` legado. Essa admissão só prova que o contrato de entrada determinística está completo e não promove o status de cobertura.
- `manual-review/pending` (incluindo os 32 specs legacy movidos nesta rodada) só pode servir como corpus de migração ou evidência de revisão manual; não pode ser descrito como aprovação do portão formal V4 atual.
- O baseline RED da Task 1 de 2026-07-11 é a falha de `pnpm audit:conversation-session-coverage`: roadmap sem A11/B08/B09/D11, E10 já covered ainda remanescente e com status deslocado, 4 Markdown gerados stale. A Task 1 só corrige fatos de documentação e o audit, sem mover specs, sem completar manifests e sem alterar scripts de CI/Docker.
- As estatísticas antigas 111/56/55/28/28, os inventários 121/61/60/29/32/25 da Task 1 e a tabela de triage inicial de 28 linhas abaixo têm apenas valor de análise histórica; após a Task 2, execução e aceitação seguem a contagem acima de 121/29/92/0 legacy formal/25 lacunas de admissão.

## Ondas de execução de 2026-07-11

Esta seção é a ordem de execução para decompor o brief de tarefas atual. Ela cobre as estatísticas antigas da numeração de tarefas abaixo, mas não altera as restrições gerais de catalog-first, matrix-first e do helper V4.

```text
Task 1 文档/audit 基线
        |
        v
Task 2 32 个 legacy formal -> manual-review/pending
        |
        v
Task 3 29 个 V4 formal admission（其中 25 个补 manifest/fixture）
        |
        v
Task 4 audit guard：阻止 legacy/pending 被计为 V4 formal
        |
        v
Task 5 CI / Docker 路径修正（本轮不运行 Docker）
        |
        v
Task 6 非 Docker replay + typecheck + lint + 全门禁
```

| Onda | Status | Fronteira e entregas |
| --- | --- | --- |
| Task 1: baseline de documentação | concluída (2026-07-11) | Fatos de catalog/matrix/roadmap corrigidos e documentos de decisão regerados mecanicamente; `pnpm audit:conversation-session-coverage` passou. Sem alterar código de teste, CI ou Docker, e sem executar Docker. |
| Task 2: rebaixamento dos legacy formal | concluída (2026-07-11) | Os 32 legacy formal que realmente chamavam `prepareConversationE2E()` foram movidos como estão para `manual-review/pending`; `conversation-session-v4-load-older` passou a usar a task selection segura do helper V4 e `conversation-session-fork-merged-assistant` foi mantido como formal. |
| Task 3: admissão V4 | concluída (2026-07-11) | Os 29 formais compatíveis com V4 passaram um a um pela verificação de fixture; as 25 lacunas foram complementadas com manifest de case real, registrando ao todo 72 requisições sintéticas locais de case (63 `fast-text`, 9 `controlled-stream`, incluindo 28 de título); os 29 manifests completos somam 85 requests (75 `fast-text`, 10 `controlled-stream`, incluindo 32 de título), formal/manifest/fixture local do case = 29/29/29. Sem executar replay WDIO/Docker e sem promover o status de cobertura por causa da admissão. |
| Task 4: guard do audit | concluída (2026-07-11) | Novo inspector reutilizável de admissão formal e focused tests com diretório temporário real; lacunas de helper legacy em formal direct-root, de manifest/fixture/path/policy/synthetic reason e de id/order/metadata do request ledger bloqueiam `pnpm audit:conversation-session-coverage --check`. Currently 29 admitted / 0 rejected / 92 pending, com pending/legacy não contando como admissão formal; nenhum status de cobertura foi promovido e WDIO/Docker não foram executados. |
| Task 5: caminhos de CI / Docker | concluída (2026-07-11) | O CI manual de macOS/Windows passou a usar o glob formal direct-root e removeu o antigo quarantine; o smoke padrão do Docker removeu os caminhos antigos de conversation, o preset histórico de diagnostic saiu, e `conversation-session-verified` ficou explicitamente indisponível sem evidência V4 de Docker atual; conjuntos vazios podem ser escritos atomicamente no preset e nas tabelas de documentação pela ferramenta de admissão. 31 focused tests e uma revisão independente passaram. Esta onda não executa Docker nem escreve os 29 formais non-Docker admitidos como Docker verified. |
| Task 6: verificação non-Docker | pendente | Executar replay local do case/padrão, verificação de fixture, audit de cobertura, `pnpm typecheck`, `pnpm lint` e os portões non-Docker aplicáveis; riscos de Docker e verificações pendentes ficam listados à parte. |

## Fluxo de estado e evidência

```text
catalog product semantics
        |
        v
coverage matrix row status
        |
        v
old formal / pending spec inventory
        |
        +--> obsolete product behavior ----> catalog/matrix deletion note
        |
        +--> still-valid behavior ---------> v4 helper rewrite
        |
        +--> covered by newer v4 spec -----> matrix evidence merge
        |
        v
focused replay fixture run
        |
        v
desktop continuous gate evidence
        |
        v
optional mobile replayable check where catalog requires it
```

## Matriz de triage P0 de formal com helper antigo (lista histórica inicial de 28 linhas)

Esta tabela foi formada sobre o baseline antigo e cobre apenas os 28 legacy formal identificados na época. Ao executar a Task 2 em 2026-07-11 é preciso usar o novo inventário de 32 legacy formal como conjunto completo, gerar primeiro o inventory completo e só então decidir o caminho de rebaixamento; não se pode tratar apenas as 28 linhas desta tabela e declarar o portão formal limpo.

| # | Spec formal antiga | Semântica atual | Ação de migração |
|---|---|---|---|
| 1 | `conversation-session-agent-step-message-scope.test.ts` | A segunda completion da mesma sessão deve contar apenas os agent steps da mensagem de usuário atual. | Reescrever como formal v4 com evidência de projection/timeline e asserções de requisição ao provider. Manter como case independente porque ele protege o scoping de turno. |
| 2 | `conversation-session-ask-user-question-custom-click-multi-question.test.ts` | Respostas customizadas de múltiplas perguntas enviadas por clique devem preservar todas as respostas. | Mesclar em uma spec v4 de resposta customizada do AskUserQuestion que acione `V4InteractionDialogs`. Preservar o caminho de clique como uma linha na nova spec. |
| 3 | `conversation-session-ask-user-question-custom-enter-manual-multi-question.test.ts` | Respostas customizadas de múltiplas perguntas enviadas por Enter devem preservar a digitação manual. | Mesclar na mesma spec v4 de resposta customizada do AskUserQuestion. Manter a digitação manual porque ela pega regressões de IME/controle de texto. |
| 4 | `conversation-session-ask-user-question-custom-enter-multi-question.test.ts` | Enter em uma pergunta customizada que não é a final avança em vez de enviar prematuramente. | Reescrever com a semântica de teclado v4 e asserções explícitas de etapas do diálogo. |
| 5 | `conversation-session-ask-user-question-custom-enter-single-question.test.ts` | Enter em uma única pergunta customizada envia imediatamente. | Reescrever com o fixture v4 de pergunta única; pode ficar ao lado da spec v4 de múltiplas perguntas. |
| 6 | `conversation-session-ask-user-question-custom-mixed-manual-multi-question.test.ts` | Respostas customizadas mistas de mouse e Enter não devem descartar as perguntas do meio. | Mesclar na spec v4 de AskUserQuestion por teclado/mouse; manter como cenário distinto dentro daquele arquivo. |
| 7 | `conversation-session-ask-user-question-keyboard-navigation.test.ts` | Enter customizado, retorno por Escape, preseleção por setas, seleção de opção por Space/Enter. | Reescrever como spec v4 de navegação por teclado no diálogo. Não depender da antiga ordem de foco do ChatView. |
| 8 | `conversation-session-background.test.ts` | Agent/Bash em segundo plano, notificação de task, fila/send-now, verificador de goal, atualizações de tool do child, comportamento de stop. | Dividir. Manter a semântica de notificação/fila/stop/goal, mas separar em specs v4 menores e testes nativos de projeção. Remover as asserções obsoletas de renderização de linhas antigas. |
| 9 | `conversation-session-bash-read-state.test.ts` | Uma leitura com Bash seguida de Edit deve expor a proteção de leitura obsoleta e a dica de formatter. | Reescrever contra os tool cards v4 mais evidência de filesystem. Manter como formal porque protege a corretude do estado de tool. |
| 10 | `conversation-session-built-in-subagent-model-overrides.test.ts` | O override de modelo do subagent embutido deve chegar à requisição de provider do child. | Reescrever como helper de envio v4 mais inspeção da requisição ao provider. As asserções de UI são secundárias. |
| 11 | `conversation-session-composer-prefix-routing.test.ts` | Menções de `@`, `$`, slash, subagent e skill passam pelas sugestões do composer. | Comparar com `conversation-session-v4-composer-toolbar.test.ts`; reescrever apenas o roteamento de `@`/`$`/subagent/skill não coberto. Mesclar a cobertura duplicada de slash na matriz. |
| 12 | `conversation-session-file-tools-atomic-write.test.ts` | Write/Edit devem preservar o bit executável POSIX. | Reescrever como formal v4 com asserções de modo de arquivo. Manter o fixture de provider local. |
| 13 | `conversation-session-fork-merged-assistant.test.ts` | Fork após o assistant final visível de um tool-call deve preservar a resposta final e o arquivo de handoff. | Reescrever como spec v4 de fork e manter marcada como candidata a bug até `E10` passar. Esta é uma probe falhando prioritária. |
| 14 | `conversation-session-markdown-table-layout.test.ts` | Layout de tabela Markdown, cópia, download e comportamento de preview. | Reescrever apenas os comportamentos de `MessageResponse` v4 que ainda existem no produto. Mover a paridade puramente visual para testes de componente de UI se o E2E ficar frágil. |
| 15 | `conversation-session-model-switch-image-strip.test.ts` | Trocar para um modelo sem imagem remove a entrada de imagem antes da requisição ao provider. | Reescrever com os controles de composer/modelo v4 e verificação da requisição ao provider. Manter porque protege a projeção de capacidade de modelo. |
| 16 | `conversation-session-native-file-picker-attachments.test.ts` | Fronteiras de anexo do seletor de arquivos nativo para seleção de texto/imagem/arquivo. | Reescrever com as superfícies de anexo do composer v4. O comportamento do seletor nativo exclusivo do desktop continua formal. |
| 17 | `conversation-session-oversized-inline-image-attachment.test.ts` | Limites de anexo de imagem grande demais e superfície de erro. | Reescrever com a validação de anexo do composer v4. Manter a asserção de não-envio ao provider para entrada rejeitada. |
| 18 | `conversation-session-plan-approval-feedback-user-message.test.ts` | O feedback customizado de `ExitPlanMode` persiste como mensagem de usuário visível. | Reescrever com o diálogo de aprovação de plano v4 e asserção da linha de usuário. |
| 19 | `conversation-session-plan-file-compact-continuity.test.ts` | O arquivo de plano produzido por `ExitPlanMode` continua visível após um compact manual. | Reescrever com o fluxo de compact v4. Garantir que o compact contínuo do desktop não adote semânticas de recuperação de gap replayable do mobile. |
| 20 | `conversation-session-plan-mode-capabilities.test.ts` | O modo plano bloqueia tools mutantes, permite leituras, e a recusa interrompe o turno atual. | Dividir em asserções de política de runtime e uma spec v4 de fluxo de recusa na UI. |
| 21 | `conversation-session-plan-mode-mcp-permission.test.ts` | O modo plano permite MCP não destrutivo e rejeita MCP destrutivo. | Reescrever ou mover para teste de protocolo nativo se não houver comportamento de UI exigido. Manter a evidência do diálogo de permissão apenas para o caminho visível ao usuário. |
| 22 | `conversation-session-read-session-context-timeout.test.ts` | Extração lite lenta acima de 45s ainda deixa o turno atual completar. | Preferir teste nativo de runtime/protocolo mais uma asserção de conclusão na timeline v4. Evitar depender do antigo texto do spinner. |
| 23 | `conversation-session-subagent-interaction-delegate.test.ts` | Perguntas de AskUserQuestion e pedidos de permissão do child são delegados ao pai. | Reescrever contra os diálogos de interação e permissão v4. Preservar a semântica de owner/delegação. |
| 24 | `conversation-session-subagent-prompt-assembly.test.ts` | Forma da montagem do system prompt do subagent. | Reescrever como evidência de envio/requisição ao provider v4. A asserção de timeline da UI é desnecessária, a menos que o catálogo diga que o conteúdo visível importa. |
| 25 | `conversation-session-subagent-provider-registry-cold-start.test.ts` | O cold start de um provider alternativo deve funcionar para subagent. | Reescrever com o helper de envio v4 e evidência do registry de providers. Manter o fixture de isolamento de cold start. |
| 26 | `conversation-session-title-generation-timeout.test.ts` | Mensagem inicial com skill-link e sidecar de título lento gravam o título da task dentro do timeout. | Reescrever com evidência de título/sidebar v4. Manter o timeout generoso e o fixture determinístico. |
| 27 | `conversation-session-tool-error-surface.test.ts` | O tool card de falha mostra a causa raiz real do provider e não bloqueia o tool irmão. | Reescrever com os seletores de tool card v4 e asserção de conclusão do tool irmão. |
| 28 | `conversation-session-webfetch.test.ts` | O sucesso de `WebFetch` `HttpClientPort` injeta o tool result no turno. | Reescrever com tool card v4 mais evidência de provider/tool-result. |

## Ordem dos batches de helper antigo pendentes

| Batch | Quantidade | Escopo | Decisão |
|---|---:|---|---|
| main-queue-stop | 11 | Fila, Send Now, stop, ações interrupted/running. | Fazer triage imediatamente depois do P0 porque muitas semânticas já têm cobertura v4 e alguns cases antigos devem ser mesclados em `conversation-session-v4-queue*` ou `conversation-session-v4-stop-queue*`. |
| compact | 7 | Compact manual, continuidade de contexto, continuidade de plano. | Migrar depois dos cases P0 de plan mode para que as asserções de compact compartilhem helpers. |
| goal | 6 | Estado de goal, verificador, lembretes. | Migrar junto com a divisão de background porque o verificador de goal interage com trabalho em segundo plano. |
| fork-edit | 3 | Comportamento de branch de edit/fork. | Tratar primeiro o case de fork falhando `E10` e então portar as linhas pending restantes. |
| model-provider | 22 | Seleção de provider/modelo, capacidade de mídia, registry. | Migrar depois que os cases P0 de image-strip de troca de modelo e de provider de subagent estabelecerem os padrões de fixture. |
| tools-subagent-plan | 21 | Tool cards, subagents, permissões, plan mode. | Migrar em grupos semânticos pequenos; evitar um único PR gigante de ressurreição. |
| composer-rendering | 5 | Roteamento do composer e markdown/renderização. | Migrar apenas as linhas não cobertas depois do audit de composer/toolbar/table v4. |
| other | 7 | Diversas continuidades de runtime/sessão. | Fazer triage depois que o portão formal estiver limpo. |
| multi-session-config | 1 | Configuração e múltiplas sessões. | Manter pending até que a cobertura v4 de multi-pane/vínculo de sessão esteja confirmada. |

## Task 1: Normalizar o baseline de documentação

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modificar: `docs/testing/conversation-session-decision-review-queue.md`
- Modificar: `docs/testing/conversation-session-next-decision-review.md`
- Modificar: `docs/testing/conversation-session-next-decision-answer-template.md`

**Interfaces:**
- Consome: a saída atual do audit de `pnpm audit:conversation-session-coverage`.
- Produz: contagens de catalog e matrix que batem com o script de audit, com as linhas faltantes conhecidas explicitamente listadas.

- [x] **Passo 1: Corrigir a deriva de abreviações**

Substituir as referências `MR` desconhecidas de `I22`/`I23` por uma abreviatura definida na legenda da matriz, ou adicionar uma entrada de abreviatura documentada se `MR` for mesmo a fonte canônica de evidência pretendida.

- [x] **Passo 2: Regerar os documentos de review obsoletos**

Usar o script existente do repositório que gerou os documentos de decisão/review. Se o nome do script não estiver claro, localizá-lo com:

```bash
rg "decision-review|next-decision|conversation-session-coverage" package.json packages docs scripts
```

- [x] **Passo 3: Executar o audit**

```bash
pnpm audit:conversation-session-coverage
```

- [x] **Passo 4: Commitar o baseline de documentação**

```bash
git add docs/conversation-session-case-catalog.md docs/testing/conversation-session-e2e-coverage-matrix.md docs/testing/conversation-session-decision-review-queue.md docs/testing/conversation-session-next-decision-review.md docs/testing/conversation-session-next-decision-answer-template.md
git commit -m "docs(testing): normalize conversation session coverage matrix"
```

## Task 2: Remover as specs formais antigas do portão

**Arquivos:**
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Mover ou reescrever: `packages/desktop/test/e2e/conversation-session/conversation-session-*.test.ts`
- Modificar conforme necessário: `packages/desktop/test/e2e/conversation-session/manual-review/pending/*`

**Interfaces:**
- Consome: a matriz de triage P0 de 28 linhas acima.
- Produz: zero specs formais padrão que importem exatamente o antigo `helpers/conversation-session.js` ou chamem `prepareConversationE2E()`; o estado de root/composer/message/queue/action vem do helper V4.

- [x] **Passo 1: Gerar a lista de formais antigos**

```bash
rg -l 'prepareConversationE2E\s*\(' packages/desktop/test/e2e/conversation-session -g '*.test.ts' -g '!**/manual-review/**'
```

- [x] **Passo 2: Mover as 32 specs legacy formal sem reescrever as asserções**

A decisão de execução de 2026-07-11 escolheu uma única ação para o conjunto mecânico completo: mover
as 32 specs que chamam `prepareConversationE2E()` sem alterações para `manual-review/pending`. Preservar
`conversation-session-fork-merged-assistant.test.ts` como formal. Manter
`conversation-session-v4-load-older.test.ts` como formal e substituir seu único import legado de
`selectTaskById` por `selectV4TaskById` do helper V4.

- [x] **Passo 3: Executar a verificação de higiene do portão**

```bash
rg -n "from ['\"][^'\"]*helpers/conversation-session\\.js['\"]" packages/desktop/test/e2e/conversation-session -g '*.test.ts' -g '!**/manual-review/**'
rg -n 'prepareConversationE2E\s*\(' packages/desktop/test/e2e/conversation-session -g '*.test.ts' -g '!**/manual-review/**'
```

Saída esperada após esta tarefa: os dois comandos não têm nenhuma correspondência. Não usar todos os `TID_CHAT_*`
como guarda: specs formais compatíveis com V4 ainda reutilizam com segurança test ids de
tool/history/toolbar/summary-panel e submodules de helper.

## Task 3: Reescrever os cases de interação do AskUserQuestion

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-ask-user-question*.test.ts`
- Modificar: `packages/desktop/test/e2e/helpers/v4-conversation.ts`

**Interfaces:**
- Consome: diálogos de interação v4, controle de input customizado, despacho de eventos de teclado, fixtures de replay de provider.
- Produz: cobertura v4 das linhas P0 2 a 7.

- [ ] **Passo 1: Adicionar linhas ao catálogo ou mapear linhas antigas para linhas existentes**

Registrar Enter customizado de pergunta única, Enter de múltiplas perguntas, envio por clique, mistura de mouse/teclado, retorno por Escape, preseleção por setas e seleção de opção por Space/Enter como semânticas aceitas.

- [ ] **Passo 2: Adicionar os seletores de helper v4 que faltam**

Expor helpers para o índice da pergunta do diálogo, o input customizado, os botões de opção, o botão de continuar/enviar e o comportamento de fechar/retornar do diálogo.

- [ ] **Passo 3: Escrever specs v4 focadas**

Dividir em dois arquivos: um para persistência de resposta customizada e outro para navegação por teclado.

- [ ] **Passo 4: Executar o replay focado**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec packages/desktop/test/e2e/conversation-session/conversation-session-v4-ask-user-question*.test.ts
```

## Task 4: Dividir a cobertura de background, fila, stop e goal

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-background*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-queue*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-stop*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-goal*.test.ts`

**Interfaces:**
- Consome: trabalho ativo da projeção v4, estado de fila, estado de stop, estado de goal, superfície de notificação do desktop.
- Produz: specs menores e determinísticas no lugar de `conversation-session-background.test.ts` e dos cases pendentes relacionados de fila/goal.

- [ ] **Passo 1: Dividir o monólito antigo por owner de estado**

Usar testes de projeção/nativos para transições de estado puras e WDIO apenas para comportamento de UI visível.

- [ ] **Passo 2: Preservar as fronteiras de entrega**

Documentar para cada linha migrada se ela é só desktop continuous, só web remote replayable ou cobertura semântica compartilhada.

- [ ] **Passo 3: Executar as specs focadas**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-background*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-queue*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-stop*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-goal*.test.ts"
```

## Task 5: Reescrever os cases de tool, runtime e filesystem

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-tool*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-bash*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-webfetch.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-file-tools*.test.ts`

**Interfaces:**
- Consome: tool cards v4, replay de provider, verificações de modo de arquivo, `HttpClientPort`, controles de timeout.
- Produz: cobertura v4 das linhas P0 1, 9, 12, 22, 27 e 28.

- [ ] **Passo 1: Adicionar asserções de helper para os tool cards v4**

Expor seletores estáveis para o status do tool, o texto de erro do tool, a conclusão do tool irmão e o texto do tool result injetado.

- [ ] **Passo 2: Portar as specs sensíveis a filesystem**

Afirmar o modo e o conteúdo reais do arquivo em disco, além do estado de conclusão visível do v4.

- [ ] **Passo 3: Executar as specs focadas**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-tool*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-bash*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-webfetch.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-file-tools*.test.ts"
```

## Task 6: Reescrever os cases de provider, modelo e subagent

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-model*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-subagent*.test.ts`

**Interfaces:**
- Consome: controles de modelo do composer v4, registry de providers, captura de requisição ao provider, roteamento de interação pai/child de subagent.
- Produz: cobertura v4 das linhas P0 10, 15, 23, 24 e 25.

- [ ] **Passo 1: Estabelecer os fixtures de requisição ao provider**

Criar um fixture por linha semântica para que as asserções de override de modelo, image strip, montagem de prompt e cold start não compartilhem estado mutável.

- [ ] **Passo 2: Portar os caminhos visíveis de delegação**

Usar WDIO apenas para a delegação de AskUserQuestion e permissão do child, porque são comportamentos de diálogo do pai visíveis ao usuário.

- [ ] **Passo 3: Executar as specs focadas**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-model*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-subagent*.test.ts"
```

## Task 7: Reescrever os cases de composer, anexo, markdown, plano, compact, fork e título

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-composer*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-attachment*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-markdown*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-plan*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-compact*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-fork*.test.ts`
- Criar ou modificar: `packages/desktop/test/e2e/conversation-session/conversation-session-v4-title*.test.ts`

**Interfaces:**
- Consome: composer v4, store de anexos, `MessageResponse`, diálogo de aprovação de plano, comando de compact, comando de fork, sidecar de título.
- Produz: cobertura v4 das linhas P0 11, 13, 14, 16, 17, 18, 19, 20, 21 e 26.

- [ ] **Passo 1: Resolver a sobreposição com as specs v4 existentes**

Usar a matriz para mesclar o comportamento já coberto por `conversation-session-v4-composer-toolbar`, `conversation-session-v4-fork*`, `conversation-session-v4-compact*` e `conversation-session-v4-permission*`.

- [ ] **Passo 2: Manter `E10` visível como probe falhando até ser corrigido**

Não marcar o fork de assistant mesclado como aceito/coberto até que a spec v4 passe com replay de provider e evidência do arquivo de handoff.

- [ ] **Passo 3: Executar as specs focadas**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-composer*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-attachment*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-markdown*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-plan*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-compact*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-fork*.test.ts" \
  --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-title*.test.ts"
```

## Task 8: Promover e verificar

**Arquivos:**
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `packages/desktop/test/e2e/conversation-session/**`

**Interfaces:**
- Consome: todas as specs e fixtures migradas.
- Produz: um portão formal limpo e uma fila de revisão manual restante explícita.

- [ ] **Passo 1: Executar o audit de cobertura**

```bash
pnpm audit:conversation-session-coverage
```

- [ ] **Passo 2: Executar typecheck e lint**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Passo 3: Executar o grupo E2E focado**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec "packages/desktop/test/e2e/conversation-session/conversation-session-v4-*.test.ts"
```

- [ ] **Passo 4: Executar o portão headless em Docker antes de uma promoção ampla**

Usar o comando Docker de E2E desktop existente documentado no repositório. Se o comando exato tiver mudado, localizá-lo com:

```bash
rg "docker.*e2e|wdio.*docker|conversation-session-v4" package.json packages docs scripts
```

- [ ] **Passo 5: Commitar a migração**

```bash
git add docs/conversation-session-case-catalog.md docs/testing/conversation-session-e2e-coverage-matrix.md packages/desktop/test/e2e/conversation-session
git commit -m "test(e2e): migrate conversation session cases to v4"
```