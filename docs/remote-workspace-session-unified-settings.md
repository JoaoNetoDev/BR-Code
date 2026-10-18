# Remote Workspace Session Unified Settings

## Contexto

Anteriormente, o estado relacionado à sessão de workspace estava disperso em três campos:

- `lastOpenTabs`
- `remoteWorkspaceHistory`
- `lastWorkspaceSession`

Isso fazia com que as três cadeias de restauração, reconexão e remoção mantivessem múltiplas fontes de verdade, o que facilmente provoca drift de estado.

## Estrutura atual

Passa a existir apenas `lastWorkspaceSession`:

```json
[
  {
    "kind": "local",
    "workspacePath": "/Users/dev/ZCodeProject/3DAutoSnake"
  },
  {
    "kind": "remote",
    "workspacePath": "/home/ubuntu",
    "workspaceIdentity": "remote:docker:zcode-ssh-container:/home/ubuntu",
    "target": {
      "kind": "docker",
      "container": "zcode-ssh-container"
    },
    "lastOpenedAt": 1776220448653,
    "lastConnectionStatus": "failed",
    "lastConnectionError": "..."
  }
]
```

Explicação:

- Entradas `local` guardam apenas o caminho do workspace local
- Entradas `remote` guardam simultaneamente o alvo remoto, a chave de identidade e o status da última conexão
- `workspaceIdentity` é mantida, usada para isolamento e deduplicação de workspaces remotos

## Estratégia de migração

- Ao ler um `setting.json` antigo, a migração é feita automaticamente na fase de parsing do schema
- O antigo `lastOpenTabs` é convertido em entradas `local`
- O antigo `lastWorkspaceSession.remote(historyId)` é expandido em uma entrada `remote` completa, combinado com `remoteWorkspaceHistory`
- Os objetos de runtime após a migração não expõem mais `lastOpenTabs` / `remoteWorkspaceHistory`

## Regras de restauração e remoção

- Na inicialização, as tabs são restauradas apenas a partir de `lastWorkspaceSession`
- Workspaces remotos são restaurados apenas como "tab em estado desconectado", sem reconexão automática em segundo plano
- Quando o usuário fecha uma tab remota, isso é considerado remoção explícita:
  - remover de `lastWorkspaceSession`
  - limpar a chave de credencial SSH correspondente (se existir)

## Regras de reconexão

- Para workspaces remotos, só é permitido que o usuário clique manualmente em reconnect na sidebar
- Após uma reconexão manual bem-sucedida, atualizar `lastOpenedAt` / `lastConnectionStatus` da entrada `remote` correspondente
- Após uma reconexão manual malsucedida, atualizar apenas o estado de falha e manter a tab, para facilitar novas tentativas manuais