# Cadeia de resolução do modelo atual após a troca de task

Data de atualização: 2026-07-17

No V4, a troca de task/session é a troca do vínculo de pane e da assinatura de topic. O modelo
atual não é mais adivinhado pelo renderer em vários níveis a partir da meta da task, do
histórico de mensagens e dos valores padrão do workspace; `ConversationSnapshot.config` é a
única autoridade de exibição da session já vinculada.

## Troca e assinatura

```text
resumo sessions-index da barra lateral
  -> pane vinculado ao sessionId
  -> subscribe conversation/<sessionId>
  -> initial snapshot (ou replayable recovery snapshot)
  -> substituição atômica no ConversationProjectionStore
  -> SessionPane / V4ComposerToolbar leem snapshot.config
```

- `sessions-index` só fornece o resumo da lista, a phase e contagens leves de interaction, e não o conversation config completo.
- O conversation snapshot contém rows, phase, config, inputRouting, actions e control; a UI não monta o primeiro frame da nova session a partir do cache de store da session antiga.
- O snapshot é validado por subscription/generation/seq. Um gap dispara recovery; durante a recuperação, um frame online atrasado não pode sobrescrever o novo snapshot.
- O desktop usa frames online continuous; o controle remoto do celular usa replayable recovery; o snapshot de estado final é o mesmo nos dois casos.

## Exibição e recuperação do modelo

Antes de o snapshot chegar, a toolbar fica em estado não pronto e não usa o modelo padrão do workspace para se passar pelo modelo histórico da session. Depois que ele chega:

1. `snapshot.config.provider/model/thought` determina a exibição atual.
2. O `configOptions` do workspace só fornece o catálogo selecionável e os metadados de provider.
3. A UI não grava de volta na session com base em o modelo "ainda estar visível"; entitlement loading, filtro de menu e ordenação afetam apenas a exibição do catálogo.
4. Se o modelo atual tiver sido removido pelo Agent workspace registry, o Agent escolhe o fallback no limite seguro do idle ou da admissão do próximo turno, conforme `default → last-used → catalog first`, e projeta atomicamente modelo, thought efetivo e thoughtLevels via `ModelSelected`.
5. Antes e depois de o snapshot chegar, não é permitido que o renderer envie o primeiro item do menu como troca automática; a escolha explícita do usuário passa apenas uma vez por `switchModelConfig`, fechada por revision/CAS e pela projection do Agent.

Na recuperação a frio, o CLI reconstrói a projection e o runtime config a partir dos fatos persistidos de message/part/session. `rowId`, o store do renderer e o summary do sessions-index não são autoridades persistentes de modelo.

## Isolamento entre workspace e session

- Session já existente: o modelo vem do runtime/projection dessa session.
- draft pane: o modelo vem da semente do rascunho e do default do workspace, até que createSession estabeleça a autoridade da session.
- Trocar de session não grava o default de workspace do rascunho na session histórica.
- A identidade do workspace usa `workspaceIdentity?.trim() || workspacePath`; a recuperação remota também precisa manter `remoteSessionId`, e é proibido reutilizar assinatura, cache ou provider registry apenas por caminho.

## Diferenças ao reabrir

Ao reabrir, é possível atingir o cache de UI do projection store local, exibindo mais rápido, mas a assinatura ainda precisa ser calibrada com o snapshot initial/recovery. Se o record da CLI ainda estiver em memória, isso afeta apenas o custo da recuperação, não a origem do modelo; após uma mudança de runtime epoch é preciso assinar novamente, e a projection antiga não pode ser tratada como autoridade para continuar enviando.

## Pontos de entrada no código atual

- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/v4/conversationProjectionStore.ts`
- `packages/ui/src/v4/agentConversationTransport.ts`
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`