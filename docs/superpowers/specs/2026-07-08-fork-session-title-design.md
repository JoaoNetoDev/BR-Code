# Fork Session Title Design

## Contexto

O usuário relatou que o `sess_0f8d6d7c-d682-49ec-b925-f91552c2fa73` gerado por fork aparece na lista com o título "新任务", mas o fork child deveria exibir `Fork of <parent title>`. A apuração em runtime mostrou:

- `~/.zcode/cli/db/db.sqlite` já tem `session.title` igual a `Fork of Checkpoint复现目标`, com `title_source=generated`.
- No delta downlink de `v4/conversation/frame` sob `sessions-index`, a mesma session sempre traz `title: ""`, `titleSource: "default"`.
- Ao ver o título vazio, a UI usa o fallback `task.forkedFromTaskId ? taskList.forkedUntitled : taskList.untitled`, e por isso exibe "新任务".

## Causa Raiz

O título persistido do fork child é gravado apenas no session store e não entra nos próprios event/projection v4 do child. O resumo live do sessions-index do v4 é derivado de `ConversationSnapshot.meta.title`, e o `ProductProjection` só atualiza `meta.title` ao receber o evento `SessionTitleUpdated`. Após o resume do fork child só é produzido `SessionResumed`, sem reenvio do fato de título já persistido.

Além disso, o `getSessionIndexMeta` live retorna apenas `createdAt` e `lastActivityAt`, sem `parentSessionId`, o que faz a relação de fork se perder também no resumo live do sessions-index.

```text
fork parent
  -> create child session in DB
       title = "Fork of <parent title>"
       parent_id = parent session
  -> create child runtime record
  -> child runtime resume
       before: SessionResumed only
       after : SessionTitleUpdated(generated) + SessionResumed
  -> child ProductProjection.meta.title
  -> sessions-index summary.title / parentSessionId
  -> UI task row/header
```

## Design

1. Persistir o título de forma síncrona no event stream do runtime atual, dentro do caminho de resume.
   - Quando `session.title` não for vazio, fazer append de `SessionTitleUpdated`.
   - O `source` usa o `session.titleSource` persistido; a lógica de normalização de `first_input` continua mapeada para `generated` pela projection v4.
   - O evento precisa ser appendado pelo próprio child runtime atual, evitando que eventos do runtime pai sejam enviados ao publisher pai.

2. Preservar a relação com o pai do fork no live record de bootstrap.
   - `ZCodeProtocolSessionRecord` ganha o novo campo opcional `parentSessionId`.
   - `createRecord` inicializa esse campo a partir de `params.parentSessionId`.
   - Ao criar o record do fork, passar `parentSessionId: fork.parentSessionId`.
   - Ao retomar sessões antigas, preencher a partir do `parentID` do session store.
   - O `getSessionIndexMeta` do bridge v4 repassa esse campo.

3. Cobrir nos testes o sessions-index live, e não apenas o DB.
   - Nova regressão de resume no core: o título generated persistido do fork child precisa reenviar `SessionTitleUpdated` antes de `SessionResumed`.
   - Estender a integração de cold-resume do v4: como o fork child não está no seed do store com `roots: true`, o resumo live do sessions-index ainda precisa conter `parentSessionId`.
   - Manter o teste existente de título de fork no DB do core.

## Fora de escopo

- Não alterar o texto de fallback da UI.
- Não descer a lógica de `Fork of ...` para a UI.
- Não mudar a fronteira de recuperação entre desktop continuous e web remote replayable; as duas pontas continuam consumindo os mesmos fatos de event/sessions-index do v4.