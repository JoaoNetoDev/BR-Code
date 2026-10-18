# Badge de não lidas no Desktop

## Objetivo

O Desktop exibe a contagem de não lidas das tasks do ZCode no Dock / badge do launcher do aplicativo, com base no `unreadAt` do meta da task, ou seja, "o número de tasks que concluíram em segundo plano e ainda não foram abertas".

## Fluxo de dados

1. A autoridade persistida de não lida de uma task é o `unreadAt` do meta do tasks-index. O `sessions-index` do V4 não carrega esse campo de estado organizacional, então a lista faz uma leitura paralela via `taskListMembershipSets` e faz join com o session summary.
2. O `countAllUnreadTasks` da UI conta as não lidas a partir do meta das tasks visíveis em cada workspace e deduplica usando `workspaceIdentity?.trim() || workspacePath + taskId`; o map temporário antigo só é usado por compatibilidade quando a lista ainda não foi carregada.
3. `useRootPlatformEffects` chama `IPlatformService.syncWindowUnreadCount(count)`, sincronizando apenas o total da janela atual, sem fazer a UI perceber o Electron diretamente.
4. O preload / renderer bridge do Desktop envia ao main por `PlatformChannels.SyncWindowUnreadCount`.
5. O main mantém um map `windowId -> unreadCount`, recalcula o total do aplicativo quando uma janela é atualizada ou fechada e chama `app.setBadgeCount(totalUnread)`; no Windows, decidir se o badge é exibido fica a cargo da implementação de plataforma, sem casos especiais na UI.

## Restrições

- O badge não mistura outros estados de UI, como ponto vermelho de falha ou permission request, para evitar deriva de semântica.
- Quando o schedule / manual run da automation recebe o estado final `succeeded`, `failed` ou `stopped` correspondente ao `traceId` da rodada, o host deve persistir o `unreadAt` da task associada via `setTaskUnread(..., true)`. Essa regra não infere "está sendo lido" a partir da sessão ativa do renderer; após o usuário clicar explicitamente na task, `useWorkspaceTaskNavigation` limpa o estado persistido e sincroniza o valor otimista do cache de query da task.
- A plataforma Web mantém uma implementação vazia, garantindo que desktop / web compartilhem a mesma interface `IPlatformService`.
- Ao fechar uma janela, o registro de não lidas correspondente é limpo, evitando que o badge fique travado.

## Pontos de entrada no código atual

- `packages/ui/src/lib/unreadTaskCount.ts`
- `packages/ui/src/lib/taskListMembershipSets.ts`
- `packages/ui/src/root/useRootPlatformEffects.ts`
- `packages/desktop/src/main/desktopMainIpcPlatform.ts`
- `packages/desktop/src/main/desktopWindowLifecycle.ts`
- `packages/desktop/src/main/unreadBadge.ts`