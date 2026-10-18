# Registro de Consolidação de Estado da UI do ZCode Agent

## Objetivo

A camada de UI mantém apenas o estado de visualização e o estado otimista de curto prazo estritamente necessário; o estado real de session/runtime é mantido pelo ZCode Agent e pela projection do ZCode Protocol V4. Novas alterações não devem serconstruídas em torno de nomes do protocolo antigo.

## Consolidação atual

- O antigo `workspaceInitByProvider` foi consolidado em um único `workspaceInit`.
- `setWorkspaceInitState` / `setWorkspaceInitAttempts` não recebem mais o parâmetro provider; a semântica de escrita passa a ser o estado de inicialização em nível de workspace.
- `getWorkspaceProviderInitState` foi substituído por `getWorkspaceInitState`, evitando que a UI continue expressando o estado de inicialização de múltiplos agents.
- O workspace state padrão usa uma referência de singleton estável, evitando que seletores que não escreveram no bucket do workspace gerem snapshots diferentes em leituras consecutivas.
- `taskStatus` / `taskError` foram removidos do estado raiz do workspace. O estado de rascunho mantém o `draftRuntime` de curto prazo, e o estado de exibição de tasks existentes é derivado uniformemente do active task runtime por meio de `getWorkspaceDisplayedTaskState`.
- `availableModes` / `currentModeId` foram removidos do estado raiz do workspace. A UI deriva o estado dos modos a partir de `configOptions` por meio de `getWorkspaceModeState`; `setAvailableModes` / `setCurrentModeId` permanecem apenas como camada de compatibilidade de patches de `configOptions` para entradas antigas como `mode_update`.

## Direções futuras

- `configOptions` continuará sendo alinhado ao `ZCodeSessionSettingsState`; a UI não adicionará novos campos espelhados independentes de modelo, modo ou nível de raciocínio.
- `queuedPromptsByTaskId` e o estado espelhado replayable serão migrados posteriormente para o ZCode session runtime / host command queue.