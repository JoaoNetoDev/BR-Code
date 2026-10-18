# Remote Workspace Session in a Workspace Window (fato atual)

O workspace remoto abre como uma session/tab lógica dentro da janela de workspace atual, sem criar uma BrowserWindow por workspace; o escopo local e o remoto são hospedados uniformemente pelo único Window Host da janela. SSH compartilha a conexão dentro do Host por `remoteHostKey`, WSL compartilha a conexão dentro do Host por `normalized(distro,user)`; Docker/Server usam conexão dedicada, mas sem criar um PID de Host adicional.

```text
Workspace Window
  └─ Window Host（唯一 PID）
      ├─ LocalSource -> local workspaceKey -> local zcode-cli
      └─ RemoteConnectionRegistry
          ├─ shared SSH connection (remoteHostKey)
          │  ├─ remoteSessionId A -> ssh workspaceKey A
          │  └─ remoteSessionId B -> ssh workspaceKey B
          ├─ shared WSL connection (normalized distro/user)
          │  ├─ remoteSessionId C -> wsl workspaceKey C
          │  └─ remoteSessionId D -> wsl workspaceKey D
          ├─ dedicated Docker connection -> docker workspaceKey
          └─ dedicated Server connection -> server workspaceKey
```

## Identidade e Roteamento

- `workspaceIdentity` representa a identidade de isolamento, `workspacePath` representa o caminho real no ambiente de destino.
- session, tab, CLI, cache, filas, histórico e chaves de controle remoto usam
  `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
- Operações de arquivo e cwd de comandos usam `workspacePath`.
- O workspace remoto precisa passar um `workspaceIdentity` construído de forma unificada; o controle remoto ainda precisa passar `remoteSessionId`.
- O renderer escolhe o escopo de workspace pelo workspace service resolver, sem poder casar apenas por caminho.

## Ciclo de Vida

```text
select/connect remote workspace
  -> establish remote workspace scope
  -> register workspaceIdentity + remoteSessionId
  -> Main forwards request to the window Host
  -> Window Host allocates remoteSessionId and resolves/creates connection
  -> Window Host creates identity-validated scoped attachment
  -> pane subscribes session projection
  -> mobile may attach to the same Host/CLI
```

Fechar um pane ou trocar de workspace não deve matar o CLI de outro workspace; fechar um attachment individual não destrói o Window Host nem as conexões ainda em uso.
Ao fechar uma logical session WSL, o runtime correspondente é liberado por workspace generation, mantendo um idle TTL de 60 segundos depois que o último owner desaparece;
as dedicated connections de Docker/Server são recicladas conforme o ciclo de vida da logical session. Main/relay apenas faz o agendamento de requisições de conexão, portas e attachments, sem copiar o estado de session remota.

## Fronteiras de Regressão

- O mesmo caminho com remote identity diferente precisa ser isolado.
- desktop continuous e mobile replayable precisam se conectar ao mesmo workspace CLI.
- Após trocar de workspace, o cwd de arquivos/terminal usa o novo `workspacePath`, e cache e session ficam isolados por workspaceKey.
- O celular não pode iniciar um Host ou runtime de Agent separado; ele só pode se conectar ao escopo existente do único Window Host da janela do desktop.
- O registry do Window Host não é compartilhado entre BrowserWindows, evitando que identidade, portas e domínio de falha atravessem a fronteira da janela.