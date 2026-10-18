# Reconexão de Workspace Remoto no Celular

A lista de workspaces do controle remoto Web no celular mantém os projetos SSH remotos que estão na janela atual do desktop, mesmo que o projeto já esteja desconectado. Os itens desconectados exibem seu estado por meio de `connectionState: "disconnected"` e do opcional `lastConnectionError`, mas não criam workspace bridge.

A reconexão é feita pelo celular enviando o app payload `workspace-reconnect-request` ao desktop main, que então chama, via renderer IPC, o fluxo de reconexão de workspace remoto já existente no desktop. O renderer continua sendo o único dono da conexão SSH, das credenciais e do estado das tabs; o celular apenas dispara a reconexão e atualiza a lista.

Um workspace remoto desconectado não pode abrir nem criar tasks antes da reconexão bem-sucedida. Após a reconexão bem-sucedida, a próxima workspace list trará o novo `remoteSessionId`; só então o celular pode criar o bridge e entrar no chat.

Após entrar no chat, o fluxo de mensagens continua sendo restaurado conforme a semântica replayable do controle remoto no celular:

- O bridge do celular se conecta ao remote session host que já existe no desktop, sem criar uma nova sessão SSH/WSL/Docker.
- Após uma reconexão por queda, o bridge é restaurado primeiro e então a task atual é alinhada por meio do task snapshot.
- `runtime.streamWatermark` é usado para verificar se o snapshot cobre o replayable stream gap.
- `pendingPermissions`, `pendingElicitations` e `pendingCommands` são restaurados junto com o snapshot, evitando que permissões, askUserQuestion ou a fila de envio já aceita existam apenas na memória da página do celular.