# Abstração de Remote Target

## Contexto

A implementação principal docaminho remoto já não é exclusiva de SSH:

- `packages/server/src/remote/connect.ts` depende apenas de `IRemoteBackend`
- deploy / stdio handshake / RPC proxy podem ser reutilizados

O que realmente amarrava a capacidade ao SSH era, antes, a camada de entrada desktop → main → host:

- O tipo compartilhado usava `SSHConnectOptions`
- O payload antigo de init do remote Host usava `sshOptions`
- O host criava `SSHBackend` diretamente no branch de entrada

Isso fazia com que, a cada nova modalidade de remote (WSL, Docker), fosse necessário duplicar um conjunto de `ConnectWSL` / `InitWSL` / `setupWSLConnection`.

## Mudanças desta rodada

Já foram concluídas três fases:

- Fase 0: unificar o contrato de conexão, sem alterar o fluxo principal de deploy / handshake
- Fase 1: conectar os backends WSL / Docker ao target unificado
- Fase 2: conectar a detecção de plataforma e a UI unificada de conexão remota às entradas desktop / web

### Target unificado

A camada compartilhada passou a ter a discriminated union `RemoteTarget`:

- `kind: "ssh"`
- `kind: "wsl"`
- `kind: "docker"`

`IPlatformService.connectRemote()`, `PlatformChannels.ConnectRemote` e o payload `ConnectRemoteWorkspace` de Main→Window Host passam todos a enviar `target`. Depois do R1, Main apenas repassa a requisição de forma fina, e o `RemoteConnectionRegistry` dentro do Window Host hospeda a reutilização de conexão e o ciclo de vida da logical session.

### Fábrica de backend

`packages/server/src/remote/create-backend.ts` é responsável por converter `RemoteTarget` em `IRemoteBackend`:

- SSH: lê a chave privada e então cria `SSHBackend`
- WSL: cria `WSLBackend`
- Docker: cria `DockerBackend`

Dessa forma a camada de controle do Window Host não se preocupa mais com o transport concreto, sendo responsável apenas por:

1. Receber `ConnectRemoteWorkspace { requestId, target }`
2. Chamar `createRemoteBackend(target)`
3. Entregar para `connectRemote()`
4. Alocar `remoteSessionId` e expor o scoped attachment com validação estrita de identity/path

### Detecção de plataforma e UI unificada

`IPlatformService` ganhou três novas capacidades de host:

- `isDockerAvailable()`
- `listWSLDistros()`
- `listDockerContainers()`

O Desktop chama dinamicamente as funções de detecção de `@zcode/server/remote` pelo main process, e o lado Web mantém implementações vazias.

A entrada de UI não continua mais separando `SSHDialog` / `WSLDialog` / `DockerDialog`, e sim foi unificada em um único diálogo de conexão remota:

- SSH é sempre exibido
- WSL é exibido apenas no desktop Windows
- Docker é exibido apenas quando o Docker daemon local está disponível

Assim, ao adicionar um novo transport, a camada de entrada precisa apenas complementar:

1. o tipo target compartilhado
2. o branch da fábrica de backend
3. a capacidade de detecção de plataforma
4. um mode no diálogo unificado

## Resultado

- O caminho SSH existente continua funcionando
- O WSL já reutiliza o o mesmo caminho de deploy / handshake / RPC, sem necessidade de novo protocolo host/main
- O Docker já reutiliza o o mesmo caminho de deploy / handshake / RPC, sem necessidade de novo protocolo host/main
- A nomenclatura da entrada remota não está mais atrelada a um transport concreto

## Estado atual

- `kind: "ssh"`: disponível
- `kind: "wsl"`: disponível, com prioridade para cópia direta de arquivos via `\\wsl.localhost\` / `\\wsl$\`; quando indisponível, faz fallback para upload em streaming pelo shell
- `kind: "docker"`: disponível, conectando direto ao container local via `docker exec` + escrita em streaming por stdin; os arquivos enviados são criados pelo usuário atual do container, evitando divergência de propriedade em substituições posteriores
- UI do desktop: já é possível escolher SSH / WSL / Docker pelo diálogo remoto unificado
- UI web: mantém apenas SSH; as capacidades de detecção de WSL / Docker são implementações vazias e as entradas correspondentes não são exibidas

## Recomendações seguintes

1. Preservar e validar que o “Docker via SSH” não regride
2. Complementar a cobertura e2e mais detalhada para o diálogo remoto (troca de aba WSL/Docker, seleção de container)
3. Adicionar mais backend capability conforme necessário (por exemplo, Docker all containers / WSL default distro metadata)