# Tooltip de Workspace Remoto via SSH

## Objetivo

Workspaces remotos sem alias no SSH config ainda precisam ser distinguidos por servidor na lista de tarefas da esquerda. Quando o usuário passa o mouse sobre a área do rótulo principal da tab da barra lateral de um workspace remoto SSH, um tooltip com as informações de conexão é exibido.

## Comportamento

- O tooltip é exibido apenas para workspaces remotos SSH; workspaces locais, WSL e Docker permanecem como estão.
- O tooltip mostra informações de conexão não sensíveis:
  - `Alias`: exibido apenas quando `remoteTarget.sshConfigAlias` existe.
  - `Host`: exibe `username@host:port`; quando a porta está ausente, é exibida a porta padrão do SSH, `22`.
  - `Path`: exibe o caminho atual do workspace remoto.
- O tooltip serve apenas para identificar o workspace e não participa de ordenação, desduplicação, chaves de persistência nem do cálculo da identidade do workspace.
- Os tooltips dos botões de ação que já existem à direita (nova task, árvore de arquivos, reconexão, log de erros) permanecem inalterados.

## Notas de implementação

- A origem dos dados é `WorkspaceTabState.remoteTarget` e `workspacePath`; nenhuma credencial é lida e senha, caminho de chave privada ou passphrase não são exibidos.
- Apenas a camada de apresentação da UI é alterada; nenhum estado de session/task realtime, snapshot, queue, stream, owner command ou web remote-control do ZCode é adicionado ou modificado.
- Desktop e Web compartilham os componentes de `packages/ui`; a página inicial de tarefas do controle remoto no celular não usa a barra lateral do desktop e não é afetada por esse tooltip.