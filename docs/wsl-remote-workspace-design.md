# Proposta de suporte a workspace remoto WSL

## Contexto

Atualmente o ZCode suporta conexões remotas por SSH e Docker. Este documento registra a proposta de
implementação do suporte a WSL (Windows Subsystem for Linux).

## Estado da implementação

### ✅ Concluído

- [x] classe `WSLBackend` (`packages/server/src/remote/wsl-backend.ts`)
- [x] utilitário `WSLDetect` (`packages/server/src/remote/wsl-detect.ts`)
- [x] factory `createRemoteBackend` com suporte a wsl (`packages/server/src/remote/create-backend.ts`)
- [x] opção de WSL adicionada ao KindStep na camada de UI
- [x] SettingsStep da camada de UI com suporte ao formulário de WSL
- [x] ConnectingStep da camada de UI com suporte a WSL
- [x] textos de internacionalização (en-US / zh-CN)
- [x] módulo de feedback com suporte a falha de conexão WSL

## Diferenças centrais entre SSH e WSL

| Dimensão       | SSH                                   | WSL                                |
| -------------- | ------------------------------------- | ---------------------------------- |
| Modo de conexão| protocolo de rede TCP, biblioteca ssh2 | subprocesso local, wsl.exe        |
| Autenticação  | senha/chave privada/SSH Agent        | identidade do usuário Windows (sem autenticação) |
| Sistema de arquivos | SFTP / exec pipe             | mapeamento de caminhos Windows `\\wsl$\Distro` |
| Caminho de deploy | remoto `~/.zcode/server`     | caminho no WSL `/home/user/.zcode/server` |

## Ciclo de vida de liberação atual

O WSL usa um Remote Host compartilhado com escopo de janela: sessions de workspace lógico com a mesma
janela e o mesmo distro/usuário normalizado compartilham um Host, um launcher de server `wsl.exe` e um
`zcode-server`. Cada session continua com `remoteSessionId`, attachment e `workspaceKey` próprios.
Minimizar, ocultar para a bandeja, recarregar o renderer e desconectar o attachment `/remote` do
celular não destroem diretamente o Host.

```text
Fechamento da última referência do workspace
  -> o Host libera preparation/Agent runtime por workspace generation
  -> com task em execução, aguarda o estado terminal
  -> reabertura rápida do mesmo workspace espera o ACK de acquire e só então faz attach da porta RPC

Fechamento do último owner de Host
  -> mantém idle TTL de 60 segundos, período em que o mesmo Host/server pode ser reutilizado

Fechamento real da janela / quit do app / instalação de update
  -> RemoteSessionManager tira um snapshot e deduplica os Remote Hosts
  -> o Main envia Host Dispose e aguarda a saída do Host
  -> o Host libera services em fases
  -> RemoteConnection sincroniza stdin.end() e aguarda o fechamento do stdio remoto
  -> o WSLBackend aguarda a saída do subprocesso wsl.exe que ele mesmo criou
  -> após o grace timeout, mata apenas o child registrado por aquele backend
```

O processo de liberação proíbe chamar `wsl --terminate` ou `wsl --shutdown`. A distro do WSL ainda
pode aparecer como Running, o que é o estado de execução da distribuição e não significa que o Host do
ZCode, o `wsl.exe` ou o `zcode-server` remoto ainda estejam retidos. Qualquer fallback só pode atingir
o subprocesso explicitamente gerado pelo backend atual; é proibido varrer ou encerrar por nome de
processo outras tarefas do usuário na mesma distro.

O conjunto de Remote Hosts do Main inclui o Host compartilhado de WSL/SSH, o Host dedicado de
Docker/Server e o runtime remoto de Bot. A saída do app e a instalação de update usam a mesma barreira
de espera idempotente; depois que a barreira começa, novos Remote Hosts são recusados, evitando que
processos novos fiquem fora do snapshot.

## Proposta: modo de composição + interface unificada

### Ideia central

Reaproveitar a interface `IRemoteBackend` (`packages/server/src/remote/backend.ts`), criando a classe
de implementação `WSLBackend`, que substitui ssh2 por um subprocesso `wsl.exe`.

### Estrutura de diretórios

```
packages/server/src/remote/
├── ssh-backend.ts          # implementação SSH existente
├── wsl-backend.ts          # nova implementação WSL
├── backend.ts              # interface IRemoteBackend
├── connect.ts              # orquestração do fluxo de conexão (precisa de alteração)
└── detectEnv.ts            # detecção de ambiente (pode ser reaproveitada)
```

### Implementação do WSLBackend

```typescript
// packages/server/src/remote/wsl-backend.ts
import { spawn, execSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { Emitter } from "@zcode/rpc";
import type {
  IRemoteBackend,
  RemoteEnvironment,
  StdioStream,
} from "@zcode/server/remote/backend.js";

export interface WSLBackendOptions {
  distribution?: string;  // nome da distribuição WSL, como "Ubuntu"
}

export class WSLBackend implements IRemoteBackend {
  private readonly distro: string;
  private disposed = false;
  private readonly disconnectEmitter = new Emitter<RemoteDisconnectEvent>();
  readonly onDidDisconnect = this.disconnectEmitter.event;

  constructor(options: WSLBackendOptions = {}) {
    this.distro = options.distribution || "Ubuntu";
  }

  // 1. detectar ambiente: executa o comando wsl diretamente
  async detect(): Promise<RemoteEnvironment> {
    const platform = await this.execSimple("uname -s").catch(() => "Linux");
    const arch = await this.execSimple("uname -m").catch(() => "x86_64");
    return { platform, arch };
  }

  // 2. enviar arquivo: caminho Windows -> caminho WSL
  async upload(localPath: string, remotePath: string): Promise<void> {
    const wslDest = this.toWSLPath(remotePath);
    // usar wsl.exe cp ou exec cat
    await this.execSimple(`mkdir -p "$(dirname '${wslDest}')" && cat > '${wslDest}'`);
  }

  // 3. executar comando: wsl.exe --exec
  //    é preciso usar --exec e não `--`: sem --exec o wsl.exe entrega a linha de comando inteira ao
  //    shell padrão do usuário via `-c`, e as aspas duplas adicionadas pelo Node fazem o shell externo
  //    expandir `"$var"` antes — as variáveis locais viram string vazia antes de chegar ao bash -lc
  //    (causa raiz do falso positivo «remote sem tar» na conexão WSL em 2026-09-14).
  //    O --exec é analisado por CommandLineToArgvW e faz exec direto.
  async exec(command: string): Promise<StdioStream> {
    const proc = spawn("wsl.exe", ["--distribution", this.distro, "--exec", "bash", "-c", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      stdin: proc.stdin!,
      stdout: proc.stdout!,
      stderr: proc.stderr!,
      onClose: (callback: (code: number) => void) => {
        proc.on("close", (code) => callback(code ?? 0));
      },
    };
  }

  // 4. verificar existência do arquivo
  async exists(remotePath: string): Promise<boolean> {
    const wslPath = this.toWSLPath(remotePath);
    const result = await this.execSimple(`test -f "${wslPath}" && echo OK`);
    return result.trim() === "OK";
  }

  // 5. ler arquivo
  async readFile(remotePath: string): Promise<string> {
    const wslPath = this.toWSLPath(remotePath);
    return this.execSimple(`cat "${wslPath}"`);
  }

  // método utilitário: caminho Windows -> caminho WSL
  private toWSLPath(path: string): string {
    // ~ expande para /home/user/
    if (path.startsWith("~")) {
      return path.replace("~", this.getHomeDir());
    }
    return path;
  }

  private getHomeDir(): string {
    try {
      return execSync(`wsl.exe --distribution ${this.distro} --exec bash -c "printf %s \\$HOME"`, {
        encoding: "utf-8",
      }).trim();
    } catch {
      return "/home/user";
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disconnectEmitter.dispose();
  }
}
```

### Alterações no fluxo de conexão

```typescript
// packages/server/src/remote/connect.ts
import { SSHBackend } from "./ssh-backend.js";
import { WSLBackend } from "./wsl-backend.js";
import type { IRemoteBackend } from "./backend.js";

export type RemoteBackendType = "ssh" | "wsl";

export interface RemoteConnectOptions {
  type: RemoteBackendType;
  // opções de SSH
  host?: string;
  port?: number;
  username?: string;
  // opções de WSL
  distribution?: string;
  // opções comuns
  privateKeyPath?: string;
  password?: string;
}

export function createRemoteBackend(options: RemoteConnectOptions): IRemoteBackend {
  switch (options.type) {
    case "wsl":
      return new WSLBackend({ distribution: options.distribution });
    case "ssh":
    default:
      return new SSHBackend({
        host: options.host!,
        port: options.port,
        username: options.username!,
        privateKeyPath: options.privateKeyPath,
        password: options.password,
      });
  }
}
```

## Detalhes importantes de implementação

### 1. Conversão de caminhos WSL

O WSL tem duas formas de acesso:
- caminho interno do WSL: `/home/user/.zcode`
- Windows acessando o WSL: `\\wsl$\Ubuntu\home\user\.zcode`

Mas, para manter a consistência com o SSH, recomenda-se usar o caminho interno do WSL.

### 2. Otimização do envio de arquivos

Hoje o SSH usa SFTP com fallback para exec; o WSL pode:
- arquivos pequenos: `wsl.exe --exec cat` + stdin pipe
- arquivos grandes: considerar `wsl.exe cp` ou gravar direto no caminho `\\wsl$\Distro`

### 3. Deploy do zcode-server

Idêntico ao SSH:
```bash
# SSH
ssh user@host "ZCODE_SERVER_RUNTIME_ROOT=~/.zcode/server ~/.zcode/server/node ..."

# WSL
wsl.exe --exec bash -c "ZCODE_SERVER_RUNTIME_ROOT=~/.zcode/server ~/.zcode/server/node ..."
```

### 4. Detectar distribuições WSL disponíveis

```typescript
export async function listWSLDistributions(): Promise<string[]> {
  const output = execSync("wsl.exe --list --quiet", { encoding: "utf-8" });
  return output.split("\n").map((s) => s.trim()).filter(Boolean);
}
```

## Alterações na camada de UI

O diálogo de conexão precisa de:
1. adicionar a escolha do tipo de conexão: SSH / WSL
2. no modo SSH: mostrar host, port, username e forma de autenticação
3. no modo WSL: mostrar a seleção de distribuição (por padrão lendo a lista disponível)

## Riscos e observações

1. **Versão do WSL**: é necessário WSL2 (suporta `wsl.exe --exec`)
2. **Separador de caminho**: o Windows usa `\`, o WSL usa `/`
3. **Permissões**: o WSL roda com a identidade do usuário Windows atual, sem autenticação extra
4. **Desempenho**: a comunicação com o WSL é mais rápida que a do SSH (processo local em vez de TCP)
5. **Limitação de plataforma**: disponível apenas no desktop Windows

## Ordem de implementação

1. ✅ definir a interface `IRemoteBackend` (já existe)
2. 📝 implementar a classe `WSLBackend`
3. 📝 alterar `connect.ts` para suportar a criação do backend WSL
4. 📝 adicionar a opção de conexão WSL na camada de UI
5. 📝 testar o fluxo de deploy