# Plano de implementação de suporte nativo a WSL

> Status (2026-07-15): implementado e absorvido pela arquitetura unificada de Remote Target; este documento é mantido como plano histórico.
> Os fatos atuais são governados por `docs/architecture/remote-target-abstraction.md`,
> `packages/server/src/remote/wsl-backend.ts` e pela UI unificada de conexão remote; o plano independente de
> `InitWSL` / `WSLDialog` abaixo não se tornou a interface atual.

## Visão geral

Suportar conexão WSL nativa no Windows, iniciando o host process diretamente via `wsl.exe`, sem passar pelo protocolo de rede SSH. Reaproveita-se a abstração `IRemoteBackend` existente, trocando apenas a camada de transport.

## Ideia central

Arquitetura remote SSH existente:
```
Main → spawnHostProcess(InitRemote) → Host Process → SSHBackend → servidor remoto
```

Arquitetura WSL:
```
Main → spawnHostProcess(InitWSL) → Host Process → WSLBackend → wsl.exe → server dentro do WSL
```

A diferença está apenas na implementação do backend: SSH usa conexão de rede + SFTP; WSL usa `child_process.spawn("wsl.exe", ...)` + acesso direto ao sistema de arquivos (`\\wsl$\`).

---

## Step 1: implementação do WSLBackend

**Arquivo**: `packages/server/src/remote/wsl-backend.ts`

Implementa a interface `IRemoteBackend`, usando `wsl.exe` no lugar do SSH:

```typescript
interface WSLBackendOptions {
  distro?: string; // usa por padrão a distro padrão do WSL
}
```

### Estratégia de implementação por método

| Método | Implementação SSH | Implementação WSL |
|------|---------|---------|
| `detect()` | `ssh exec "uname -s/-m"` | `wsl.exe -d <distro> -- uname -s/-m` |
| `upload(local, remote)` | upload por SFTP | `fs.copyFile(local, wslToWindowsPath(remote))`, copiando direto pelo caminho UNC `\\wsl$\<distro>\` |
| `exec(cmd)` | `ssh exec cmd` | `child_process.spawn("wsl.exe", ["-d", distro, "--", "bash", "-c", cmd])`, devolvendo stream de stdio |
| `exists(path)` | `ssh exec "test -f"` | `wsl.exe -- test -f <path>` ou diretamente `fs.access(wslToWindowsPath(path))` |
| `readFile(path)` | `ssh exec "cat"` | `fs.readFile(wslToWindowsPath(path))` ou `wsl.exe -- cat <path>` |
| `dispose()` | `client.end()` | nenhuma limpeza especial necessária |

### Utilitário de conversão de caminhos

```typescript
// caminho Linux → caminho UNC do Windows
// ~/.zcode/server/node → \\wsl$\Ubuntu\home\user\.zcode\server\node
function wslToWindowsPath(linuxPath: string, distro: string): string
```

- `~` precisa ser resolvido antes via `wsl.exe -d <distro> -- echo $HOME` para obter o diretório home real
- Usar o prefixo `\\wsl$\<distro>` ou `\\wsl.localhost\<distro>` (o segundo é o recomendado no Win11)

### Observações

- `upload()` copia direto com `fs.copyFile` do Node.js pelo caminho UNC, o que é muito mais rápido que `wsl.exe -- cp`
- O `StdioStream` devolvido por `exec()` precisa envolver o stdin/stdout/stderr de `child_process.ChildProcess`
- `chmod +x` ainda precisa ser executado via `wsl.exe -- chmod +x` (o fs do Windows não suporta bits de permissão Unix)

---

## Step 2: utilitários de detecção de WSL

**Arquivo**: `packages/server/src/remote/wsl-detect.ts`

Oferece detecção de disponibilidade de WSL e a lista de distros:

```typescript
// verifica se o sistema atual é Windows e tem WSL instalado
async function isWSLAvailable(): Promise<boolean>

// lista as distros WSL instaladas
interface WSLDistro {
  name: string;       // e.g. "Ubuntu-22.04"
  isDefault: boolean;
  state: "Running" | "Stopped";
  version: 1 | 2;    // WSL 1 ou 2
}
async function listWSLDistros(): Promise<WSLDistro[]>
```

### Forma de implementação

- `isWSLAvailable()`: `process.platform === "win32"` + tentativa de executar `wsl.exe --status`
- `listWSLDistros()`: executa `wsl.exe -l -v --all` e faz o parse da saída em tabela
  - Atenção: a saída de `wsl.exe -l -v` é codificada em UTF-16LE e precisa ser decodificada corretamente
  - A distro padrão é marcada com `*`

### Observações

- O WSL 1 não suporta acesso por caminho UNC `\\wsl$\`, então precisa ser marcado e a UI deve avisar o usuário para migrar para WSL 2
- Em plataformas não-Windows, `isWSLAvailable()` retorna simplesmente `false`

---

## Step 3: extensão das definições de tipo e do protocolo de mensagens

### 3.1 novo WSLConnectOptions

**Arquivo**: `packages/shared/src/index.ts`

```typescript
export interface WSLConnectOptions {
  distro?: string; // se não preenchido, usa a distro padrão
}
```

### 3.2 nova validação Zod

**Arquivo**: `packages/shared/src/validation.ts`

```typescript
export const wslConnectOptionsSchema = z.object({
  distro: z.string().optional(),
});

export const hostInitWSLMessageSchema = z.object({
  type: z.literal("init-wsl"),
  wslOptions: wslConnectOptionsSchema,
  remoteAssets: remoteAssetDirsSchema,
});
```

Atualizar a união discriminada `hostIncomingMessageSchema` para incluir `hostInitWSLMessageSchema`.

### 3.3 extensão de HostMessageTypes

**Arquivo**: `packages/shared/src/channels.ts`

```typescript
export const HostMessageTypes = {
  InitLocal: "init-local",
  InitRemote: "init-remote",
  InitWSL: "init-wsl",       // novo
  Dispose: "dispose",
  Broadcast: "broadcast",
} as const;
```

### 3.4 novos PlatformChannel

```typescript
export const PlatformChannels = {
  ...
  ConnectRemote: "zcode:connect-remote",
  ConnectWSL: "zcode:connect-wsl",    // novo
  ListWSLDistros: "zcode:list-wsl-distros", // novo
  ...
};
```

Adicionar os mapeamentos de tipo correspondentes em `PlatformChannelMap`.

---

## Step 4: extensão do Host Process

**Arquivo**: `packages/desktop/src/host/index.ts`

Adicionar um ramo `InitWSL` ao lado dos ramos `InitLocal` / `InitRemote` existentes:

```typescript
} else if (msg.type === HostMessageTypes.InitWSL) {
  logger.info(`initializing WSL connection, distro=${msg.wslOptions.distro ?? "default"}`);
  try {
    const connection = await setupWSLConnection(msg.wslOptions, msg.remoteAssets);
    // a lógica de registro de serviços seguinte é idêntica à de InitRemote
    // file/system/terminal/zcode task/session → vêm do WSL (remoto)
    // setting/credential/broadcast → local
    ...
    parentPort.postMessage({ type: HostResponseTypes.Connected });
  } catch (err) {
    parentPort.postMessage({ type: HostResponseTypes.Error, error: String(err) });
  }
}
```

### setupWSLConnection

```typescript
async function setupWSLConnection(
  options: WSLConnectOptions,
  remoteAssets: RemoteAssetDirs,
): Promise<RemoteConnection> {
  const { WSLBackend } = await import("@zcode/server/remote");
  const backend = new WSLBackend(options);
  return connectRemote(backend, remoteAssets);
  // connectRemote() é totalmente reaproveitado — ele só depende da interface IRemoteBackend
}
```

---

## Step 5: extensão do Main Process

**Arquivo**: `packages/desktop/src/main/index.ts`

### 5.1 nova função createWSLWindow

Seguindo `createRemoteWindow`, criar `createWSLWindow`:

```typescript
async function createWSLWindow(options: WSLConnectOptions) {
  // mesma estrutura de createRemoteWindow
  // diferenças:
  // 1. título da janela: `ZCode - WSL (${options.distro ?? "default"})`
  // 2. envia a mensagem InitWSL em vez de InitRemote
  // 3. a lógica de resolução de remoteAssets é a mesma
}
```

### 5.2 registrar o IPC handler

```typescript
ipcMain.handle(PlatformChannels.ConnectWSL, async (_event, rawOptions) => {
  const parsed = wslConnectOptionsSchema.safeParse(rawOptions);
  if (!parsed.success) return { success: false, error: formatZodError(parsed.error) };
  try {
    await createWSLWindow(parsed.data);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(PlatformChannels.ListWSLDistros, async () => {
  const { listWSLDistros } = await import("@zcode/server/remote");
  return listWSLDistros();
});
```

---

## Step 6: extensão do Preload Bridge

**Arquivo**: `packages/desktop/src/preload/index.ts`

Adicionar em `window.zcode`:

```typescript
connectWSL: (options: WSLConnectOptions) =>
  ipcRenderer.invoke(PlatformChannels.ConnectWSL, options),
listWSLDistros: () =>
  ipcRenderer.invoke(PlatformChannels.ListWSLDistros),
```

---

## Step 7: extensão da interface de Platform Service

**Arquivo**: `packages/shared/src/platform.ts`

Adicionar em `IPlatformService`:

```typescript
connectWSL(options: WSLConnectOptions): Promise<{ success: boolean; error?: string }>;
listWSLDistros(): Promise<WSLDistro[]>;
```

**Arquivo**: `packages/desktop/src/renderer/src/main.tsx`

A implementação do Desktop conecta `window.zcode.connectWSL` / `window.zcode.listWSLDistros`.

**Arquivo**: `web/src/main.tsx`

A implementação Web retorna `{ success: false, error: "WSL not supported in web mode" }` e um array vazio.

---

## Step 8: UI — diálogo de conexão WSL

**Arquivo**: `packages/ui/src/WSLDialog.tsx`

Bem mais simples que o SSHDialog, precisa apenas de um seletor de distro:

### Fluxo de interação

1. O usuário clica no botão “Conectar ao WSL”
2. O diálogo abre e chama `listWSLDistros()` automaticamente para obter a lista de distros disponíveis
3. Exibe a lista de distros (radio ou select), com a distro padrão selecionada por padrão
4. Depois de escolher a distro, o usuário clica em “Conectar”
5. Chama `connectWSL({ distro })` → uma nova janela é aberta

### Tratamento de estados

- Loading: detectando a lista de distros
- Empty: WSL não instalado ou sem distros, exibindo instruções de instalação
- Error: falha na conexão, exibindo a mensagem de erro
- Distro WSL 1: exibida, mas marcada como não selecionável, com um tooltip avisando que é necessário migrar para o WSL 2

### Local da entrada

Ao lado da entrada de conexão SSH:
- Novo botão de conexão WSL em `ChatEmptyState`
- Nova opção de conexão WSL em `WorkspaceSidebar`
- Exibido apenas quando `process.platform === "win32"` (verificado via `systemInfo.platform`)

---

## Step 9: internacionalização

**Arquivo**: os arquivos de locale correspondentes em `packages/ui/src/i18n/`

Novas chaves:
```
wsl.trigger: "连接到 WSL" / "Conectar ao WSL"
wsl.title: "WSL 连接" / "Conexão WSL"
wsl.description: "选择要连接的 WSL 发行版" / "Selecione uma distribuição WSL para conectar"
wsl.distro: "发行版" / "Distribuição"
wsl.distro.default: "默认" / "Padrão"
wsl.connecting: "正在连接…" / "Conectando…"
wsl.success: "连接成功" / "Conectado"
wsl.noDistro: "未检测到 WSL 发行版" / "Nenhuma distribuição WSL encontrada"
wsl.wsl1Warning: "WSL 1 不受支持，请升级到 WSL 2" / "O WSL 1 não é suportado, migre para o WSL 2"
wsl.connect: "连接" / "Conectar"
wsl.cancel: "取消" / "Cancelar"
```

---

## Step 10: exports e registro de módulos

### 10.1 exports do pacote server

**Arquivo**: `packages/server/src/remote/index.ts`

Novos exports:
```typescript
export { WSLBackend } from "./wsl-backend.js";
export type { WSLBackendOptions } from "./wsl-backend.js";
export { isWSLAvailable, listWSLDistros } from "./wsl-detect.js";
export type { WSLDistro } from "./wsl-detect.js";
```

### 10.2 exports do pacote shared

Garantir que `WSLConnectOptions`, `WSLDistro` e `wslConnectOptionsSchema` sejam exportados corretamente pelo pacote shared.

---

## Ordem sugerida de implementação

1. **Step 1 + Step 2** — WSLBackend + utilitários de detecção (núcleo, testável de forma isolada)
2. **Step 3** — tipos e protocolo de mensagens (sem impacto de runtime)
3. **Step 4 + Step 5** — Host Process + Main Process (conectar o pipe)
4. **Step 6 + Step 7** — Preload + interface de Platform (abrir caminho até o renderer)
5. **Step 8 + Step 9** — UI + internacionalização (entrada visível ao usuário)
6. **Step 10** — limpeza de exports

## Pontos de risco

1. **Codificação da saída de `wsl.exe -l -v`**: é UTF-16LE e o formato é instável, com possíveis diferenças entre versões do Windows, então é preciso fazer um parse robusto
2. **Compatibilidade de caminhos UNC**: `\\wsl$\` não está disponível em algumas versões do Windows 10, sendo preciso tentar também `\\wsl.localhost\`
3. **Pré-compilado do node-pty**: é preciso preparar o arquivo pré-compilado do node-pty para linux-x64 usado no WSL (o mesmo conjunto já reaproveitado na conexão remote SSH para Linux)
4. **WSL 1 vs WSL 2**: o WSL 1 não tem um kernel Linux completo e algumas funcionalidades podem ser incompatíveis; recomenda-se suportar apenas o WSL 2
5. **Permissões de caminho no Windows**: arquivos copiados por caminho UNC podem ficar sem permissão de execução, e o `chmod +x` precisa ser executado via `wsl.exe`