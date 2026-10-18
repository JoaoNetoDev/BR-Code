# Continuidade de Plan File no Plan Mode após Compact

## Contexto

Atualmente, o `ExitPlanMode` do ZCode ainda carrega o plan completo pelo campo `plan` do tool input. Se um compact for disparado logo após a aprovação do `ExitPlanMode`, o summary pode não ter preservado o plan completo, e após o compact/resume o modelo não consegue recuperar de forma estável o plan já aprovado.

## Objetivo

O `ExitPlanMode.plan`, após a aprovação, precisa ser gravado de forma síncrona em um plan file determinístico sob a raiz do workspace. Após um compact bem-sucedido, o runtime precisa persistir o caminho desse plan file e seu conteúdo completo, como um model-only reminder de `plan_file_reference`, no histórico posterior ao compact.

## Contrato de caminho

O caminho do plan file é:

```text
${workspaceRoot}/.zcode/plans/plan-${sanitizedSessionId}.md
```

`workspaceRoot` representa a raiz do workspace; não se deve usar o `workingDirectory`, que pode ser alterado por um `cd` do Bash. `sanitizedSessionId` mantém apenas `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`; os demais caracteres são substituídos por `-`, e os `-` iniciais e finais são removidos.

## Contrato de escrita

`ExitPlanMode` grava o plan file depois que o usuário aprova e após aplicar o input final devolvido pelo permission broker. O conteúdo gravado deve ser a string original final do `plan`, sem trim, sem adicionar quebra de linha e sem qualquer outra normalização; um plan vazio serve apenas para validação de input. A escrita usa `FileSystemPort.writeTextFile()`, e os argumentos devem incluir `createParents: true`, `atomic: true` e `encoding: "utf8"`. Uma falha na escrita afeta apenas a continuidade posterior ao compact e não bloqueia a saída do plan mode já aprovada pelo usuário.

## Contrato de compact

Após um compact bem-sucedido, se o plan file determinístico existir e tiver conteúdo não vazio, o runtime acrescenta em `postCompactReminderEntries` um model-only reminder com source `plan_file_reference`, no seguinte formato:

```text
A plan file exists from plan mode at: ${planFilePath}

Plan contents:

${planContent}

If this plan is relevant to the current work and not already complete, continue working on it.
```

Esse reminder vem antes dos generic read-state reminders e é persistido junto do compact summary pelo `persistCompactSummary()` já existente; se qualquer etapa da persistência falhar, vale o rollback de persistência de compact já existente.

## Não objetivos

- Não alterar o input schema de `ExitPlanMode` visível ao provider.
- Não implementar `plan` / `planFilePath` injetados pelo runtime.
- Não alterar o output shape de `ExitPlanMode`.
- Não adicionar exibição na UI.
- Não incluir o plan file no generic read-state reminder.
- Não tratar a recuperação após o usuário apagar manualmente `.zcode/plans`.
- Não implementar a limpeza de retenção padrão de plan files dentro desta mudança de compact continuity; se for implementada depois, ela deve ser guiada pela configuração do ciclo de retenção e limpar os `.md` expirados do diretório padrão de plans, e não uma remoção imediata em `ExitPlanMode`, no compact ou no fim da sessão.