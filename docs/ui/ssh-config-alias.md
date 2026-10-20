# SSH Config Alias

## Objetivo

Suportar, no modal de conexão SSH, a seleção direta de um `Host alias` do `ssh config` da máquina local, reduzindo o
custo de preencher manualmente `host/port/user/privateKey`.

## Comportamento

- No modo SSH, é adicionado um dropdown `SSH Config Alias`, com carregamento preguiçoso dos candidatos sob demanda.
- Após selecionar o alias, os campos são preenchidos automaticamente:
  - `HostName -> host`
  - `Port -> port`
  - `User -> username`
  - `IdentityFile -> privateKeyPath`
- Quando o alias contém `IdentityFile`, o método de autenticação muda automaticamente para `privateKey`.
- Se o usuário alterar manualmente depois algum campo-chave do SSH (host/port/username/privateKey), o estado "alias selecionado" é limpo, para evitar indução ao erro.
- Um workspace remoto SSH estabelecido via alias grava o alias como metadado de conexão não sensível no remote target snapshot.
- Quando um dispositivo Source é identificado pela primeira vez via alias, o alias passa a ser o nome padrão do dispositivo; dispositivos que já existem ou que já foram renomeados manualmente não são sobrescritos por handshakes posteriores.
- Se um SSH remote workspace da lista de tasks à esquerda ou do header da área de chat tiver alias, o título do workspace é exibido como `<workspaceName> [SSH: <alias>]`, por exemplo `root [SSH: linux-arm64]`; quando não houver alias em uso ou o registro histórico não tiver alias, mantém-se o nome do workspace original / as informações auxiliares do host original.
- No Web, em cenários que não sejam de remote-control, a lista retornada é vazia, mantendo a compatibilidade.

## Notas de implementação

- A capacidade de parsing fica em `packages/services/src/system/sshConfigAlias.ts`; o main do desktop apenas faz o encaminhamento pelo canal de plataforma.
- Suporta expansão de `Include` e filtro de alias único (exclui `*`/wildcard/padrões de negação/linhas Host com múltiplos padrões).
- Preferência por `ssh -G` para obter a configuração final; com estratégias de proteção:
  - timeout por alias (1.5s)
  - limite de concorrência (3)
  - limite de quantidade de aliases (200)
  - TTL de cache (30s)
  - isolamento de falhas com fallback para o resultado do parsing local
- `SSHConnectOptions` / `SSHRemoteTargetSnapshot` guardam o campo opcional `sshConfigAlias`; esse campo não participa do cálculo de workspace identity, evitando que renomear o alias ou a variação de alias para o mesmo destino resulte em um mesmo workspace remoto ser dividido indevidamente.
- O nome padrão do dispositivo Source só lê o alias quando o registro é criado no primeiro handshake; o alias continua fora da identidade do dispositivo, da deduplicação de Profile e do workspace identity.
- Recuperação de desconexão, registro de falha de reconexão e persistência de tab continuam usando `workspaceIdentity?.trim() || workspacePath` como chave de isolamento; o alias é usado apenas para exibição na UI.
- Compatível com macOS / Linux / Windows:
  - o ponto de entrada de configuração resolve `~/.ssh/config` de forma unificada a partir de `os.homedir()`
  - no Windows, são sondados adicionalmente os caminhos comuns de `ssh.exe` do OpenSSH/Git
  - sem executável `ssh`, há fallback automático para o parsing local

