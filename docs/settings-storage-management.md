# Planejamento de Gerenciamento de Armazenamento (Storage Management)

> Status: **Implementado (2026-09-10)**. Registro das decisões em §8, pontos de implementação em §11.
> Local: **Janela do Gerenciador de Recursos → aba 「Armazenamento」** (decisão de 2026-09-10: migrado por completo da página de Configurações 「Dados e Estatísticas」 para o Gerenciador de Recursos, ao lado de CPU / Memória; a página de Configurações não tem mais entrada). A arquitetura da janela em si está em `docs/electron/resource-manager.md`.

## 1. Contexto e situação atual

### 1.1 Necessidade do usuário

Assim que a seção é aberta, calcular imediatamente o uso de disco do ZCode, apresentando:

- quanto espaço `.zcode` ocupa em cada disco (volume);
- os dados de cada disco quebrados por categoria (banco de dados, logs, trajetórias...), com drill-down de detalhes por categoria;
- ações de limpeza para as categorias limpáveis (como as trajetórias de chamadas de modelo).

### 1.2 Dívida histórica: na verdade há duas raízes de dados

O App permite definir o 「Caminho de armazenamento de dados」 (`setting.json.dataBaseDir`), mas **apenas o `v2` do lado do app acompanha**; os dados do lado do agente permanecem sempre no diretório home do usuário. Situação atual:

| Escritor | Resolução da raiz | Acompanha o 「Caminho de armazenamento de dados」? | Código |
| --- | --- | --- | --- |
| app services (host process) | `{dataBaseDir}/.zcode`, padrão `~/.zcode` | Sim | `packages/services/src/paths.ts` `getZCodeDataRootDir()` |
| Migração ao trocar o 「Caminho de armazenamento de dados」 | Copia apenas `.zcode/v2`, e copia em vez de mover | — | `packages/services/src/paths.ts` `copyDataDirectory()` |
| zcode-cli (agent process) | `storage.dir` de `~/.zcode/cli/config.json`, padrão `~/.zcode`; o app **não envia** `ZCODE_STORAGE_DIR` | Não | `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts:184` |
| model-io das trajetórias de chamada de modelo | Diretamente `homedir()/.zcode/cli/{debug,rollout}` | Não (hardcoded) | `apps/zcode-cli/packages/adapters/src/model/runner-debug.ts` `getModelIOBaseDir` |
| hooks trust store / subagents / skills / commands | Lê `storage.dir` de `~/.zcode/cli/config.json` | Não | `packages/services/src/hooks/hooksService.ts:153-173` etc. |
| Computer Use Helper, referências ao diretório cli na exportação de logs | `homedir()/.zcode/...` | Não (hardcoded) | `packages/desktop/src/main/exportLogs.ts:34-48` |
| O próprio `v2/setting.json` | Sempre escrito no HOME real (bootstrap file) | Deliberadamente não acompanha | `packages/services/src/setting/settingService.ts:36-46` |
| Diretório de configuração de workspace do provider GLM | `getDataBaseDir()/.zcode/cli/...`, coexistindo com os dois pontos de vista do CLI lendo `~/.zcode/cli` | Sim | `packages/services/src/paths.ts:295-299, 355-362` |
| Visualizador de trajetórias lendo model-io | Varre simultaneamente `homedir()` e `dataBaseDir` | Lê os dois | `packages/services/src/zcode-agent/modelTrajectoryFileTail.ts:16-22` |

Conclusão: o gerenciamento de armazenamento precisa varrer as duas raízes:

```text
R1 = ~/.zcode                       (sempre existe: cli/, agents/, computer-use/, cópias antigas de v2…)
R2 = {dataBaseDir}/.zcode           (só existe quando o caminho de armazenamento de dados é definido e ≠ HOME: v2/, workspace/, export-log/, feedback/…)
```

Nesta entrega apenas **apostamos fielmente** as duas raízes, sem corrigir a divisão em si; se o CLI deve acompanhar o `dataBaseDir` é uma decisão de design independente (ver §8). Note que o E2E existente `conversation-session-configurable-data-directory.test.ts` afirma explicitamente que 「após a troca `{custom}/.zcode/cli` não existe e `~/.zcode/cli/db/db.sqlite` continua lá」, ou seja, trata-se de uma fronteira de produto mantida de forma intencional.

### 1.3 Levantamento dos diretórios reais da máquina (2026-09-10, máquina de desenvolvimento, 25 GB no total)

| Caminho | Tamanho | Escritor / uso | Categoria |
| --- | --- | --- | --- |
| `cli/db/backup`, `cli/db/backups`, `cli/db/*.bak`, `cli/db/*.backup-*` | ≈6 GB | Backups anteriores à migração do banco do CLI | Backups |
| `cli/db/db.sqlite(+wal/shm)` | 0.77 GB | Banco de sessões/tarefas do CLI (em uso) | Registros de sessão e bancos de dados |
| `backup/*` (session-projects, before-*-restore…) | 7.2 GB | Backups de scripts/migrações, incluindo cópias completas de cli-db e v2 | Backups |
| `v2/dev/stdio-traffic` | 2.4 GB | Capturas do protocolo stdio em modo dev (`zcodeStdioTapDevConfig.ts`) | Capturas de diagnóstico de desenvolvimento |
| `v2/migrations`, `v2/backup`, `v2/*.bak`, `v2/setting.json.corrupt-*`, `v2/config.json.pre-*` | ≈0.8 GB | Snapshots antes de migração / arquivamento de arquivos corrompidos | Backups |
| `v2/acp-config`, `v2/acp-traffic-proxy`, `v2/acp-auth` | ≈0.8 GB | Diretórios do runtime ACP desativado (exportLogs já pula diretórios desativados) | Capturas de diagnóstico de desenvolvimento / Configuração |
| `cli/debug` (modo dev), `cli/rollout` (produção) | 1.35 GB | Trajetórias de chamada de modelo model-io JSONL | Trajetórias de chamada de modelo |
| `cli/agents/sess_*` | 0.94 GB | Artefatos de execução de subagentes | Saídas de ferramentas e artefatos de subagentes |
| `cli/exec` | 0.65 GB | Saída persistida da ferramenta Bash (norma de recolhimento em tmpdir) | Saídas de comandos e cache temporário |
| `cli/plugins/{cache,data,marketplaces}` | 0.62 GB | Cache e dados de plugins | Runtime do agente e plugins |
| `cli/artifacts`, `cli/image-cache` | 0.64 GB | Arquivo de resultados de ferramentas, cache de imagens | Saídas de ferramentas e artefatos de subagentes / Saídas de comandos e cache temporário |
| `lite/releases/*`, `bundled-agents/*.tgz`, `agents/{claude-code,opencode,codex,gemini-cli}`, `computer-use/*` | ≈2.2 GB | Pacotes de release do runtime do CLI, agentes externos embutidos, app CUA Helper | Runtime do agente e plugins |
| `export-log`, `export-log-stage`, `feedback` | ≈1 GB | Resultados de exportação de logs / staging residual anômalo / pacotes de feedback | Exportações e pacotes de feedback |
| `v2/logs`, `cli/log`, `logs`, `agent/logs`, `v2/crash` | ≈0.15 GB | Logs do app (rotação de 14 dias), logs do CLI (rotação de 7 dias), logs antigos, capturas de crash | Logs e relatórios de crash |
| `v2/sessions`, `v2/session-bindings`, `v2/checkpoints`, `agent/sessions` (antigo) | ≈0.2 GB | Snapshots de sessão / bindings / checkpoints (`agent/` é resíduo antigo→outros) | Registros de sessão e bancos de dados |
| `v2/*.sqlite*` (tasks-index, automation, task-index) | ≈20 MB | Índice de tarefas do app / banco de automação (em uso) | Registros de sessão e bancos de dados |
| `v2/*.json`, `cli/config.json`, `security`, `v2/certs`, `v2/provider`, `cli/models`, `cli/memories`, `cli/workflows`, `commands`, `skills`, `agents/*.md`, `workspace/` | Pequeno | Configuração, credenciais, memórias, workspace padrão de conversa (inclui arquivos do usuário) | Configuração, credenciais e workspace |

Conclusão do levantamento: os verdadeiros gigantes são as categorias 「Backups」, 「Capturas de diagnóstico de desenvolvimento」 e 「Trajetórias de chamada de modelo」, com mais de 80% do total, e todas são limpáveis.

#### 1.3.1 Resultado da verificação de alguns diretórios fáceis de confundir

| Diretório | Escritor | Conteúdo | É relido? |
| --- | --- | --- | --- |
| `cli/artifacts/<sess>/` | `apps/zcode-cli/packages/adapters/src/storage/index.ts` `createNodeToolArtifactStore` | **Não são anexos do usuário**. É o arquivo de resultados de ferramentas: saída Bash muito longa (`.txt`), snapshots antes/depois de Edit/Write e structuredPatch (`.json`), screenshots (`.png`), referenciados como `zcode-artifact://<sess>/<id>` | Sim: agregação/rollback de checkpoints de mudança de arquivo (`cold-file-change-summaries.ts`), referência a anexos de mídia históricos em turnos posteriores (`prompt-input.ts`), visualização da saída completa da ferramenta na UI |
| `cli/agents/<sess>/<agent>/` | `apps/zcode-cli/packages/core/src/subagent/runner.ts` | Artefatos de execução de subagente: `metadata.json`, `output.txt`, `task.output`, `transcript.jsonl` (um único arquivo pode chegar a 64 MB) | Apenas relido por `task.outputFile` ao retomar um subagente em andamento; sessões encerradas não são mais lidas |
| `cli/sessions/<sess>/workflows/` | `script-workflow-tool-port.ts` | Scripts de workflow gerados dentro da sessão | Dentro da sessão |
| `v2/sessions/<hash>/<taskId>.json` | `packages/services/src/paths.ts` `getLegacyTaskSessionSnapshotPath` | Snapshots de tarefa no formato antigo; **ainda em uso**: leitura de fallback em `readLegacyTaskSnapshot`; a importação de sessões nativas do Claude (`persistImportedClaudeTask.ts`) ainda escreve aqui | Sim |
| `agent/sessions/`, `agent/logs/` | Nenhum escritor no código atual (resíduo da era ACP de 2026-04/05) | JSON/JSONL de sessões antigas | Não |


## 2. Objetivos / não objetivos

Objetivos:

- Nova seção de Configurações 「Gerenciamento de Armazenamento」, que ao ser aberta dispara de forma assíncrona a varredura das duas raízes de dados, agregando por disco (volume) e quebrando por categoria, exibindo progresso durante a varredura.
- Cada categoria pode abrir o drill-down de detalhes (subdiretórios / arquivos, tamanho, raiz de origem).
- Ações de limpeza para as categorias marcadas como limpáveis, com confirmação e retorno de resultado.
- As regras de classificação são fonte única da verdade (catálogo na camada services), cobertas por testes unitários.

Não objetivos:

- Não alterar os caminhos de escrita de nenhum módulo, não corrigir o 「CLI não acompanha o caminho de armazenamento de dados」 (§8 é um item independente).
- Não fazer limpeza automática agendada, nem alertas de cota (pode ser estendido depois sobre o mesmo catálogo).
- Não limpar nenhum caminho fora de `.zcode` (por exemplo `~/.claude`, TMPDIR do sistema).
- Celular `/remote` e Web não exibem esta seção na primeira entrega (§6.3).

## 3. Catálogo de classificação (catalog)

A classificação é uma tabela estática da camada services `storageCatalog.ts`: cada regra = `{ categoryId, root?: "home" | "dataBaseDir", pattern(correspondência de caminho relativo à raiz), cleanable, protect?: [...] }`. A correspondência é por **prefixo mais longo primeiro**; entradas sem correspondência vão para 「Outros」.

| id | Nome | Caminhos correspondentes (relativos à raiz) | Limpável | Regra de limpeza |
| --- | --- | --- | --- | --- |
| `sessionStore` | Registros de sessão e bancos de dados | `v2/*.sqlite{,-wal,-shm}`, `cli/db/db.sqlite{,-wal,-shm}`, `v2/sessions`, `v2/session-bindings`, `v2/checkpoints` (exceto pending/tmp) | Não | Passa pela exclusão de tarefas / arquivamento automático, não é limpa aqui |
| `subagentTranscripts` | Artefatos de subagentes | `cli/agents/<sess>/<agent>/transcript.jsonl` | Sim | Limpa apenas diretórios de sessão **não atualizados há 24 horas** (evita apagar registros de subagentes em andamento); agregado por diretório de sessão |
| `toolOutputs` | Saídas de ferramentas e cache temporário | `cli/artifacts`, `cli/agents` (exceto transcript.jsonl), `cli/sessions`, `cli/exec`, `cli/image-cache`, `cli/pdf-cache`, `clipboard`, `git-checkpoint-index`, `editor-icon`, `tmp`, `cache`, `v2/coding-plan-cache.json`, `v2/bots-model-cache*.json`, `v2/checkpoints/**/{pending,tmp}` | Não (decisão de 2026-09-10: temporariamente não pode ser apagado, aguardando confirmação item a item) | — |
| `modelTrajectory` | Trajetórias de chamada de modelo | `cli/debug`, `cli/rollout` | Sim | Apaga todos os `model-io-*.jsonl`; arquivos em escrita que falharem ao ser apagados vão para `failures`, sem bloquear |
| `devTraces` | Capturas de diagnóstico de desenvolvimento | `v2/dev`, `v2/acp-traffic-proxy`, `v2/acp-stream-diagnostics` | Sim | Apaga o conteúdo dos diretórios; preserva `v2/dev/zcode-stdio-tap.json` (estado do toggle) |
| `logs` | Logs e relatórios de crash | `v2/logs`, `cli/log`, `logs`, `agent/logs`, `v2/crash`, `v2/perf`, `feedback/logs`, `computer-use/run/*.log` | Sim | Apaga arquivos de log **que não sejam do dia corrente**; `v2/crash/live`, `computer-use/run/.tokens` não são apagados |
| `backups` | Backups | `backup`, `v2/backup`, `v2/migrations`, `cli/db/backup`, `cli/db/backups`, `cli/db/*.bak*`, `cli/db/*.backup-*`, `v2/*.bak`, `v2/*.backup.json`, `v2/setting.json.corrupt-*`, `v2/config.json.pre-*`, `cli/config.json.bak-*` | Sim (exige segunda confirmação) | Apaga tudo |
| `exports` | Exportações e pacotes de feedback | `export-log`, `export-log-stage`, `feedback` | Sim | Apaga tudo |
| `runtimes` | Runtime do agente e plugins | `agents/<runtime>/`, `bundled-agents`, `lite`, `computer-use`, `cli/plugins` (incluindo cache, decisão de 2026-09-10: não pode ser apagado) | Não | Gerenciado pelo fluxo de instalação / atualização |
| `config` | Configuração, credenciais e workspace | `v2/*.json`, `v2/agent-config`, `v2/bots-runtime-locks`, `v2/certs`, `v2/acp-auth`, `v2/acp-config`, `v2/provider`, `cli/config.json`, `cli/models`, `cli/memories`, `cli/workflows`, `security`, `commands`, `skills`, `agents/*.md`, `workspace`, `mailbox`, `server`, `controller`, `launcher`, `dev-signing`, `cua-helper-dev-identity`, `perf-task-manifests`, `plugin-workspace` | Não | — |
| `other` | Outros | Caminhos sem correspondência; toda a cópia antiga `~/.zcode/v2` quando um caminho de dados customizado é ativado; `agent/` (resíduo antigo) | Não | O drill-down mostra os caminhos concretos,, para facilitar completar as regras depois |

Restrições:

- Regras `cleanable` só podem apagar **os caminhos casados pela própria regra**; antes de apagar, valida-se novamente com `path.relative(root, target)` que não há saída da raiz, e alvos de link simbólico são rejeitados.
- A lista branca de arquivos protegidos (`setting.json*`, `credentials.json`, `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`, `v2/dev/zcode-stdio-tap.json`) nunca é apagada em nenhuma categoria.
- O catálogo é semanticamente consistente com as listas de pulo já existentes em `exportLogs.ts` (`RETIRED_ACP_RUNTIME_ARCHIVE_PATHS`, `HIGH_VOLUME_RUNTIME_ARCHIVE_PATHS`, `NON_LOG_STATE_ARCHIVE_PATHS`); depois exportLogs pode referenciar o mesmo catálogo, nesta entrega exportLogs não muda.

## 4. Modelo de dados

```ts
// packages/services/src/storage/storage.ts
export type StorageRootId = "home" | "dataBaseDir";
export type StorageCategoryId =
  | "sessionStore" | "subagentTranscripts" | "toolOutputs" | "modelTrajectory" | "devTraces"
  | "logs" | "backups" | "exports" | "runtimes" | "config" | "other";
export type StorageCleanability = "none" | "safe" | "confirm";

export interface StorageVolume {
  /** chave estável do mesmo volume físico: stat().dev; raízes com o mesmo dev são mescladas no mesmo cartão de disco */
  deviceId: string;
  /** ponto de montagem obtido subindo até o dev mudar: caminho em mac/Linux, letra de unidade no Windows */
  mountPoint: string;
  totalBytes: number;
  freeBytes: number;
}

export interface StorageEntryUsage {
  relativePath: string;   // relativo à raiz
  bytes: number;
  fileCount: number;
}

export interface StorageCategoryUsage {
  id: StorageCategoryId;
  bytes: number;
  fileCount: number;
  cleanability: StorageCleanability;
  entries: StorageEntryUsage[]; // detalhe de drill-down: agregado por caminhos de primeiro nível casados pela regra
}

export interface StorageRootUsage {
  id: StorageRootId;
  path: string;
  volume: StorageVolume | null; // null quando statfs falha, mostra apenas o uso e não a capacidade do disco
  bytes: number;
  categories: StorageCategoryUsage[];
}

export interface StorageUsageSnapshot {
  jobId: string;
  status: "scanning" | "complete" | "cancelled" | "failed";
  startedAt: number;
  finishedAt?: number;
  roots: StorageRootUsage[];
  errors: Array<{ path: string; code: string }>; // EACCES/ENOENT etc., não interrompem a varredura
}

export interface IStorageService {
  startScan(): Promise<{ jobId: string }>;
  cancelScan(jobId: string): Promise<void>;
  getSnapshot(jobId: string): Promise<StorageUsageSnapshot | null>;
  /** evento de progresso: com throttling a cada ≥300ms, payload é o snapshot completo após o incremento */
  onScanProgress(listener: (snapshot: StorageUsageSnapshot) => void): () => void;
  clean(params: { rootId: StorageRootId; categoryId: StorageCategoryId }): Promise<{
    freedBytes: number;
    deletedCount: number;
    failures: Array<{ path: string; code: string }>;
  }>;
}
export const IStorageService = createServiceDescriptor<IStorageService>("storage");
```

Critério de tamanho: soma de `lstat().size`, sem seguir links simbólicos; hard links/APFS clone podem contar em duplicidade, o texto da UI marca como 「valor estimado」.

Reuso: o desktop já tem um scanner recursivo de tamanho usado apenas para telemetria (`packages/desktop/src/main/zcodeDataSizeScanner.ts`, executado dentro de um Worker, sem seguir links simbólicos, chamado por `desktopZCodeDataSizeTelemetry.ts`). Esta funcionalidade o rebaixa para a camada services e o estende para 「acumular por classificação do catálogo + callback de progresso + cancelamento」, com a telemetria passando a chamar a mesma implementação, evitando duas lógicas de travessia de diretórios.

A fiação do RPC segue o padrão já existente do `ISettingService`: `packages/shared/src/channels.ts` ganha `ServiceChannels.Storage` → definição do descritor e da implementação no services → host collection (`packages/desktop/src/host/remoteConnectionServiceCollection.ts`) `.register` → proxy em `packages/client/src/remoteServiceAccess.ts` adicionado ao `IServiceAccessor` → a UI chama por `useServices().storageService`.

## 5. Sequência e estado

```text
Renderer <StorageSection>                 Host StorageService                       FS
  │ entra na seção                                      │                                      │
  ├─ startScan() ───────────────────────────────▶│ cria job(jobId, AbortController)       │
  │                                              │ resolve raízes: R1=~/.zcode              │
  │                                              │        R2={dataBaseDir}/.zcode (opcional)│
  │                                              │ por raiz: stat dev → sobe até o mount → statfs ─▶│
  │                                              │ readdir(withFileTypes) concorrência limitada(8) ─▶│
  │◀─ onScanProgress(snapshot com throttling 300ms) ─┤ lstat item a item → catalog.classify → acumula │
  │   UI: 「Calculando…」 + números já acumulados saltando ao vivo │                              │
  │◀─ onScanProgress(status=complete) ───────────┤                                      │
  │  sai da seção ─ cancelScan(jobId) ─────────────▶│ abort → status=cancelled              │
  │                                              │                                      │
  │ clica em 「Limpar」→ caixa de confirmação(confirm) ─ clean() ─▶│ resolve alvos pelo catálogo → valida fora da raiz/protegido ─▶│ rm
  │◀─ {freedBytes, failures} ────────────────────┤                                      │
  │ toast de resultado → chama startScan() de novo │                                      │
```

Restrições de estado:

- No máximo um job em andamento por vez; um novo `startScan` cancela antes o job antigo (usuário clica em 「Recalcular」 ou entra de novo na seção).
- Varredura e limpeza rodam no processo host, tudo assíncrono com `fs/promises`; proibido `readdirSync`/`statSync`.
- Eventos deProgresso vão pelo canal de eventos de serviço já existente (o mesmo mecanismo de assinatura de eventos de serviços como `IUsageStatsService`); a UI só consome o snapshot, não acumula por conta própria.
- Esta funcionalidade envolve apenas o disco local, não entra na cadeia de realtime de task e não toca na semântica `desktop-continuous` / `web-remote-replayable`.

Restrições de desempenho (decisão Q7: atualização em tempo real, desempenho primeiro):

- Ciclo de vida acoplado à seção: só faz `startScan` ao entrar em 「Gerenciamento de Armazenamento」; ao trocar de seção / fechar a página de Configurações / a janela perder o foco por mais de 60s, faz `cancelScan` imediatamente; ao voltar, recomeça. Não há varredura residente em segundo plano.
- A travessia roda numa thread Worker (reaproveitando a forma de Worker de `zcodeDataSizeScanner.ts`); o event loop principal do host recebe apenas o progresso com throttling; dentro do Worker tudo é `fs/promises`, `readdir({ withFileTypes: true })` para reduzir o número de stats, concorrência limitada por diretório (padrão 4, configurável), e `setImmediate` a cada N itens processados para ceder o controle.
- Cancelamento via `AbortSignal`, verificado uma vez a cada diretório visitado; após cancelar, o Worker para imediatamente em vez de terminar e descartar o resultado.
- Ao entrar na seção, se houver em memória um snapshot `complete` da última vez, mostra primeiro o valor antigo e revarre em segundo plano (stale-while-revalidate), evitando que cada entrada comece do zero saltando números.
- Eventos de progresso no máximo a cada ≥300ms e só quando os números mudam; o tamanho do snapshot é controlado: `entries` só agrega até o caminho de primeiro nível casado pela regra, sem lista de arquivo a arquivo.
- A limpeza também é assíncrona, com remoção concorrente limitada; ao retornar a UI revarre; os outros botões de limpeza ficam desabilitados durante a limpeza.

## 6. UI

### 6.1 Layout (referência: screenshot dado pelo usuário)

```text
┌─ Armazenamento ───────────────────────────────────────────────────────────┐
│ Uso total 25.0 GB · último cálculo 12:03  [Recalcular]                    │
│ ┌ Disco Macintosh HD ───────────┐  ┌ Categorias (disco selecionado) ───────────┐ │
│ │ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇░░░░░░░ │  │ ▤ Backups           12.9 GB  [Limpar] › │ │
│ │ Uso do ZCode 25.0 GB / livre 6.9 GB│  │ ▤ Capturas diag. dev   3.2 GB  [Limpar] › │ │
│ │ ● Backups             12.9 GB      │  │ ▤ Trajetórias de modelo  1.4 GB  [Limpar] › │ │
│ │ ● Capturas diag. dev    3.2 GB      │  │ ▤ Runtime do agente e plugins 2.2 GB      › │ │
│ │ ● Trajetórias de modelo 1.4 GB      │  │ ▤ Dados de sessão e tarefa  1.8 GB      › │ │
│ │ ● …                            │  │ ▤ Logs e relatórios de crash 0.15 GB [Limpar] › │ │
│ │ Raiz: ~/.zcode (25.0 GB)        │  │ ▤ Banco de dados      0.8 GB          › │ │
│ └────────────────────────────────┘  │ ▤ Outros              …                 › │ │
│ ┌ Disco /Volumes/Data ───────────┐  └──────────────────────────────────────────┘ │
│ │ …(só aparece quando R2 está em outro disco)│                                    │
│ └────────────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Coluna esquerda: um cartão por volume (`bg-card border-card-border rounded-xl`); a barra de progresso é colorida por categoria, a legenda é ordenada por tamanho decrescente; o rodapé do cartão lista as raízes naquele volume e seus usos. Com mais de um cartão, clicar troca a lista de categorias da direita; com apenas um, não há estado selecionado.
- Coluna direita, linha de categoria: ícone + nome + tamanho + (quando limpável) botão 「Limpar」 + `›`. O clique abre a visão de detalhe (página de segundo nível dentro da mesma seção, retorno por breadcrumb, reaproveitando a navegação do detalhe de plugins): lista `entries`, cada linha com tamanho, raiz de origem e 「Mostrar no gerenciador de arquivos」.
- Durante a varredura: o uso total e os números de cada linha se atualizam com os eventos de progresso, `Loader2` girando no canto superior direito; quando `errors` não está vazio, um caption no rodapé avisa 「parte dos diretórios não pôde ser lida」.
- Confirmação de limpeza: `safe` executa direto + toast; `confirm` abre um Dialog cujo corpo explica as consequências (ver §3), com botão principal em vermelho com semântica destrutiva.
- Tela estreita (< 900px): as colunas viram empilhamento vertical; todas as fontes usam `text-ui-*`; temas claro e escuro, textos zh/en completos (prefixo de chave i18n `settings.storage.*`).
- Registro da seção: `settingsPageConfig.ts` adiciona no grupo `dataAndStats` o item `{ id: "storage", icon: HardDrive, titleId: "settings.storage.title" }`; `settingsNavigation.ts` recebe o id.

### 6.2 Ícones das categorias

Registros de sessão e bancos de dados `Database`, saídas de ferramentas `FileOutput`, trajetórias `Route`, capturas `Activity`, logs `FileText`, backups `Archive`, exportações `PackageOpen`, cache `Layers`, runtime `Blocks`, configuração `KeyRound`, outros `Folder` (lucide).

### 6.3 Multi-plataforma

- Desktop: funcionalidade completa, serviço registrado na service collection do host local.
- Web / celular `/remote`: **não exibido** (decisão Q5), ocultado por `createSettingsPageConfig({ isDesktop })`, com o mesmo gating do Computer Use.

## 7. Testes

Testes unitários (`packages/services/src/storage/*.test.ts`):

- catálogo: árvore fixture classificada corretamente caminho a caminho; prefixo mais longo primeiro; caminho desconhecido → `other`; arquivos protegidos nunca entram em alvos limpáveis.
- scanner: fixture de diretório temporário → bytes/fileCount exatos por categoria; links simbólicos não são seguidos; EACCES vai para `errors` e não interrompe; após `cancelScan` não há mais progresso; duas raízes com o mesmo dev viram um volume, devs diferentes viram dois volumes (mock de `stat`).
- cleaner: apaga apenas caminhos casados; rejeita caminhos fora da raiz; `logs` preserva os arquivos do dia; `confirm` não executa sem confirmação (a camada de serviço não tem conceito de confirmação, este item é testado na UI); falhas vão para `failures`.

E2E (`packages/desktop/test/e2e/settings/settings-storage-management.test.ts`, fixtures seed dentro de um HOME isolado):

| Case | Setup | Action | Assertion |
| --- | --- | --- | --- |
| SM-01 scan | Seed em HOME: `cli/debug` com 2 arquivos, `v2/logs` com ontem+hoje, `backup/x` | Abrir Configurações › Dados e Estatísticas › Gerenciamento de Armazenamento | Aparece o estado de varredura; ao terminar, o total = soma das fixtures; as linhas de categoria batem com o tamanho na legenda |
| SM-02 drill-down | Idem | Clicar em 「Trajetórias de chamada de modelo」 | O detalhe lista os 2 arquivos e a raiz `~/.zcode`; o breadcrumb permite voltar |
| SM-03 clean safe | Idem | Clicar em 「Limpar」 na linha da trajetória | Sem caixa de confirmação; toast com tamanho liberado; arquivos apagados; tamanho da linha vira 0 |
| SM-04 clean confirm | Idem | Clicar em 「Limpar」 na linha 「Backups」 → cancelar / confirmar | Cancelar não apaga; confirmar apaga |
| SM-08 stop on leave | Seed de muitos arquivos pequenos | Durante a varredura, trocar de seção e voltar | Ao sair, o host recebe o cancel (sem evento de progresso); ao voltar recomeça e primeiro mostra o resultado anterior |
| SM-09 tool outputs guard | Seed de um `cli/artifacts/sess_*` com mtime de 1 hora atrás e outro de 3 dias atrás | Limpar 「Saídas de ferramentas e artefatos de subagentes」 | Apaga apenas o diretório de 3 dias |
| SM-05 logs keep today | Idem | Limpar logs | Arquivo de ontem é apagado, arquivo de hoje é preservado |
| SM-06 two roots | `setting.json.dataBaseDir` apontando para outro diretório, com seed de `v2` | Abrir a seção | O cartão de disco lista as duas raízes e seus usos; no mesmo disco continua sendo um único cartão |
| SM-07 i18n/theme | — | Mudar para en + light | Textos e cores corretos (amostra representativa) |

## 8. Registro de decisões (2026-09-10)

| # | Questão | Decisão |
| --- | --- | --- |
| 1 | Granularidade da classificação | 「Banco de dados」 e o antigo 「Dados de sessão e tarefa」 foram fundidos em **Registros de sessão e bancos de dados** (não limpável); `cli/artifacts`, `cli/agents`, `cli/sessions` viraram separados como **Saídas de ferramentas e artefatos de subagentes** (limpáveis com confirmação, com proteção de 24h). Verificação em §1.3.1: artifacts não são anexos do usuário, são arquivo de resultados de ferramentas |
| 2 | Saídas de comandos e cache temporário são limpáveis | Limpáveis, com `confirm` e explicação das consequências |
| 3 | Backups e resíduos de migração | Limpáveis (com `confirm`), a categoria passa a se chamar **Backups** |
| 4 | Cópia antiga `~/.zcode/v2` após ativar um caminho customizado | Entra em **Outros**, sem ação de limpeza |
| 5 | Escopo de plataforma | Só desktop |
| 6 | Causa raiz de o CLI não acompanhar o caminho de armazenamento de dados | Não corrigida nesta entrega, apenas gerenciada (mesmo corrigindo, ainda haveria problemas de resíduo) |
| 7 | Progresso | Atualização em tempo real; ao sair da seção para, ao voltar recalcula; IO assíncrono, desempenho primeiro (ver restrições de desempenho em §5) |
| 8 | Saídas de ferramentas / cache podem mesmo ser apagadas (adicionado em 2026-09-10) | Dividido em duas: **Artefatos de subagentes** = `cli/agents/**/transcript.jsonl`, pode ser limpo diretamente (preservando sessões ativas em até 24h); **Saídas de ferramentas e cache temporário** = o resto do antigo 「Saídas de ferramentas e artefatos de subagentes」 + o antigo 「Saídas de comandos e cache temporário」, temporariamente não pode ser apagado, aguardando confirmação item a item |

## 9. Divisão da implementação (após as decisões)

1. MR-1 `feat(storage): catalog + scanner + cleaner + IStorageService` (camada services + testes unitários)
2. MR-2 `feat(settings): seção de gerenciamento de armazenamento` (registro no host, varredura e exibição na UI, i18n, E2E SM-01/02/06/07)
3. MR-3 `feat(settings): ações de limpeza de armazenamento` (caixa de confirmação, toast, E2E SM-03/04/05)

Cada MR roda primeiro `pnpm architecture:check --changed`, `pnpm typecheck`, `pnpm lint`.

## 10. Design da arquitetura de código (conforme a skill `architecture-governance`)

Com base em `.agents/skills/architecture-governance/SKILL.md` e `references/ai-guidance.md`: primeiro o registro de decisão, depois a camada e os contratos dos módulos gerenciados, e por fim os pontos de fiação. Antes de implementar, rodar `pnpm architecture:context storage`; depois de implementar, rodar `pnpm architecture:check --changed`, e só é permitido commitar com zero novas violações.

### 10.1 Registro de decisão

```text
owner:              instância única de StorageService em packages/services/src/storage (novo módulo gerenciado),
                    única dona de 「job de varredura atual, último snapshot completo, flag de limpeza em andamento」.
                    O Renderer guarda apenas projeções (snapshot atual + disco/categoria selecionados), não acumula por conta própria nem mantém uma segunda fonte da verdade.
command path:       UI <StorageSection> → useStorageUsage() → IStorageService(RPC ProxyChannel)
                    → StorageService.startScan/cancelScan/clean → ScanRunnerPort(Worker) → fs
derived views:      snapshot.roots[].categories[].entries são todos obtidos por funções puras de domínio a partir dos
                    (relativePath, bytes, mtimeMs) reportados pelo Worker; o agrupamento por volume vem do fold por deviceId;
                    a legenda/barra de progresso/detalhe da UI são projeções do snapshot.
ordering/idempotency: jobId crescente monotonicamente; startScan aborta o job antigo antes de criar o novo; os eventos de progresso carregam jobId,
                    e a UI descarta eventos com jobId ≠ o atual; cancelScan(jobId) é no-op para um job que não é o atual;
                    clean() cancela o job atual se houver varredura em andamento, e ao terminar a remoção a UI chama startScan de novo.
delivery:           apenas desktop-continuous (disco local, não entra no realtime de task; não registrado em Web/celular).
contracts/spec/tests: §3/§4/§5 deste documento; storage/contract.ts + contract.test.ts;
                    packages/services/src/storage/**/*.test.ts; E2E SM-01..09.
```

Formas rejeitadas (comparando com os antipadrões do ai-guidance):

- Renderer varrendo o disco com `fs` direto ou criando sua própria fila ❌ — passa apenas por `IStorageService`.
- Um segundo navegador de diretórios ❌ — a lógica de travessia do `zcodeDataSizeScanner.ts` do desktop main migra para os adapters deste módulo, e o Worker de telemetria passa a importar a mesma implementação.
- `fs` / `path.resolve(homedir)` / timers aparecendo no domínio ❌ — classificação, fold e plano de limpeza são funções puras.
- Import profundo `@zcode/services/src/storage/app/...` ❌ — só `contract.ts` é permitido.

### 10.2 Layout do módulo e camadas

`architecture-policy.yaml` ganha o novo módulo gerenciado (semântica de layerOrder: camadas anteriores não podem importar camadas posteriores):

```yaml
  - id: storage
    roots: [packages/services/src/storage]
    managed: true
    requires: [shared, rpc]          # se o checker reclamar de deep-import em ../descriptors.js, adicionar services em requires e mover a criação do descritor para contract.ts; vale o primeiro resultado do architecture:check
    publicEntrypoints: [packages/services/src/storage/contract.ts]
    layers: { domain: domain, app: app, adapters: adapters }
    layerOrder: [domain, app, adapters]
    owner: desktop-settings
```

```text
packages/services/src/storage/
├─ module.ts                 { id:"storage", requires:["shared","rpc"], provides:["storage-service"], publicEntrypoints:["contract.ts"] }
├─ contract.ts               IStorageService + todos os tipos públicos (§4) + createServiceDescriptor (≤300 linhas, ≤12 métodos)
├─ contract.example.ts       demonstra com uma porta falsa 「entrar na seção→assinar progresso→cancelar→limpar」
├─ contract.test.ts          asserções de comportamento contratual (evento com jobId, cancel idempotente, estrutura retornada por clean)
├─ CONTRACT.md               invariantes que tipos e testes não conseguem expressar (ver 10.3)
├─ domain/                   funções puras, sem IO
│  ├─ storageCatalog.ts      tabela de regras + classify(relativePath) → {categoryId, cleanability, protected}
│  ├─ usageAggregate.ts      fold(entries) → StorageRootUsage; entries agregados até o caminho de primeiro nível casado pela regra
│  ├─ volumeGrouping.ts      une várias raízes num só volume a partir do deviceId
│  └─ cleanPlan.ts           planClean(listing, categoryId, now) → caminhos a apagar; inclui proteção de 24h, lista branca de protegidos, rejeição fora da raiz
├─ app/                      orquestração de casos de uso, só depende de domain e das portas
│  ├─ ports.ts               ScanRunnerPort / VolumeProbePort / FsCleanerPort / RootsResolverPort
│  ├─ scanJob.ts             ciclo de vida de um job: jobId, AbortController, throttling de 300ms, máquina de estados
│  └─ storageService.ts      createStorageService(deps: ports) → IStorageService; Emitter<snapshot>
└─ adapters/                 implementações de IO
   ├─ fsWalker.ts            travessia opendir/lstat (migrada do desktop main zcodeDataSizeScanner), concorrência limitada, AbortSignal, setImmediate para ceder, produz (relativePath, bytes, mtimeMs)
   ├─ volumeProbe.ts         stat().dev + busca do ponto de montagem subindo + statfs → StorageVolume
   ├─ fsCleaner.ts           rm assíncrono com concorrência limitada conforme o cleanPlan, coletando failures
   └─ scanWorkerProtocol.ts  tipos de mensagem do Worker e guarda isSnapshot (a entrada do Worker em si fica no pacote desktop)
```

Fronteira do Worker (mantém o event loop do host ocioso):

```text
desktop/src/host/storageScanWorker.ts   (nova entry do tsup "host/storageScanWorker")
   └─ import { walk } from services/storage/adapters/fsWalker
      import { classify, fold } from services/storage/domain/*     ← funções puras podem rodar dentro do Worker
      postMessage(snapshot parcial) a cada 300ms; para ao receber a mensagem de abort
desktop/src/host/storageScanWorkerClient.ts  implementa ScanRunnerPort: new Worker(new URL(...)) + terminate on abort
desktop/src/main/zcodeDataSizeWorker.ts      passa a importar o fsWalker do services (remove a implementação duplicada de travessia no main)
```

Razão: classificação e fold são feitos dentro do Worker, a thread principal recebe apenas o snapshot agregado e não há mensagem entre threads por arquivo; os testes in-process usam `createInProcessScanRunner()`, chamando o mesmo walker + domain, garantindo que a versão com Worker e a de teste percorram o mesmo caminho.

### 10.3 Invariantes a escrever no CONTRACT.md

- No máximo um job em execução por vez; `startScan` cancela implicitamente o job antigo.
- O snapshot de progresso é monotônico: dentro do mesmo job, `bytes` só aumentam; `status` só vai de scanning → complete | cancelled | failed.
- `clean` só apaga caminhos casados explicitamente pelo catálogo e validados por `cleanPlan`; a lista branca de protegidos nunca é apagada em nenhuma categoria; os `failures` retornados são por caminho, e nenhuma exceção global é lançada.
- `entries` não contém lista de arquivo a arquivo, só chega ao caminho de primeiro nível casado pela regra; o tamanho do snapshot é independente do número de arquivos.
- A resolução das raízes vem da `RootsResolverPort` injetada (desktop passa `homedir()` e `getDataBaseDir()`); o módulo não lê variáveis de ambiente.

### 10.4 Pontos de fiação (lista de mudanças)

| Local | Mudança |
| --- | --- |
| `architecture-policy.yaml` | Novo módulo gerenciado `storage` (10.2) |
| `packages/shared/src/channels.ts` | `ServiceChannels.Storage = "storage"` |
| `packages/shared/src/test-ids.ts` | `TID_SETTINGS_STORAGE_*` |
| `packages/services/src/storage/**` | Novo módulo (10.2) |
| `packages/services/src/accessor.ts` | `IServiceAccessor.storageService` |
| `packages/services/src/node.ts` | Exporta `createStorageService` e as fábricas de adapters |
| `packages/client/src/remoteServiceAccess.ts` | `ProxyChannel.toService<IStorageService>` |
| `packages/desktop/src/host/index.ts` | Montagem próxima de `createSettingService()`: roots resolver, scan runner via Worker, fs cleaner, volume probe |
| `packages/desktop/src/host/remoteConnectionServiceCollection.ts` | `.register(IStorageService, ...)` (nível de conexão, escopo de máquina; não registrado na collection de nível workspace) |
| `packages/desktop/src/host/storageScanWorker.ts` + `storageScanWorkerClient.ts` | Entrada do Worker e implementação de ScanRunnerPort |
| `packages/desktop/tsup.config.ts` | Nova entry `"host/storageScanWorker"` no host |
| `packages/desktop/src/main/zcodeDataSizeWorker.ts` / `zcodeDataSizeScanner.ts` | A implementação de travessia migra para services; no main resta apenas a entrada do Worker |
| `packages/ui/src/hooks/useStorageUsage.ts` | Assina `onScanProgress`, faz `startScan` no mount, `cancelScan` no unmount / após 60s sem foco, filtra por jobId |
| `packages/ui/src/settings/storage/` | `StorageSection.tsx`, `StorageDiskCard.tsx`, `StorageCategoryList.tsx`, `StorageCategoryDetail.tsx`, `StorageCleanConfirmDialog.tsx`, `storageCategoryPresentation.ts` (ícones/ids de texto/cores) |
| `packages/ui/src/settings/settingsPageConfig.ts`, `lib/settingsNavigation.ts`, `SettingsPage.tsx` | Registro da seção `storage` (gating por `isDesktop`) |
| `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts` | `settings.storage.*` |
| `packages/desktop/test/e2e/settings/settings-storage-management.test.ts` | E2E do §7 |

### 10.5 Onde ficam os eventos e os tipos

- O evento de progresso segue a convenção `onXxx: Event<T>` do RPC (`packages/rpc/src/proxy-channel.ts` reconhece automaticamente propriedades com prefixo `on` como eventos e faz buffer); o contrato escreve `onScanProgress: Event<StorageUsageSnapshot>`, sem introduzir um novo canal de broadcast.
- Métodos públicos de `IStorageService`: `startScan`, `cancelScan`, `getSnapshot`, `onScanProgress`, `clean`, num total de 5. 「Mostrar no gerenciador de arquivos」 reaproveita a capacidade `openInFileManager` já existente na plataforma; a UI chama direto com `root.path + relativePath`, sem passar pelo serviço de armazenamento.
- A formatação de bytes reaproveita a ferramenta de formatação de tamanho já existente na UI (na implementação, primeiro fazer grep por `formatBytes`/`formatFileSize`; é proibido escrever uma segunda).

## 11. Pontos de implementação (2026-09-10, z-code-2 staging)

> Diferenças após a migração para o Gerenciador de Recursos em 2026-09-10: a instância do serviço passou a ser mantida pelo **desktop main** (não é mais registrada como serviço RPC do host, sem ServiceDescriptor / channel), e o renderer chama por `window.resourceManager.storage` do preload (`StorageManagementBridge`); os tipos de dados ficam unificados em `packages/shared/src/storage.ts`; a UI fica em `packages/ui/src/resource-manager/storage/`; 「Mostrar no gerenciador de arquivos」 passa por `StorageRevealPath`, e o main valida que o caminho está dentro das raízes de dados antes de chamar `shell.showItemInFolder`. A tabela abaixo traz os pontos após a migração.

| Camada | Arquivo | Descrição |
| --- | --- | --- |
| policy | `architecture-policy.yaml` | Módulo gerenciado `storage`: `requires: [shared, rpc, services]`, layerOrder `domain → app → adapters` |
| shared | `packages/shared/src/storage.ts`, `channels.ts`, `test-ids.ts` | Tipos de dados e `StorageManagementBridge`; `PlatformChannels.Storage*`; `TID_RESOURCE_MANAGER_STORAGE_*`, `TID_RESOURCE_MANAGER_TAB` |
| services/domain | `storage/domain/{storageCatalog,usageAggregate,cleanPlan}.ts` | Regras de classificação, agregação limitada (no máximo 100 entries por categoria, o resto vira `…`), plano de limpeza; o agrupamento por volume `groupStorageRootsByVolume` fica no shared |
| services/app | `storage/app/{ports,scanJob,storageService}.ts` | Portas, throttling e estado terminal de um único job, `IStorageService` como owner único |
| services/adapters | `storage/adapters/{fsWalker,volumeProbe,fsCleaner,inProcessScanRunner,rootsResolver}.ts` | Travessia cancelável com concorrência limitada, sondagem de volume por statfs, remoção com concorrência limitada + recolha de diretórios vazios, `runStorageScan` (único caminho de varredura compartilhado entre a entrada do Worker e os testes unitários), resolução das duas raízes |
| desktop main | `main/resourceManagerStorage.ts`, `main/storageScanWorker.ts`, `storageScanWorkerClient.ts`, `storageScanWorkerProtocol.ts`, `tsup.config.ts` | Superfície ipc + única instância de StorageService; entrada do Worker (entry `main/storageScanWorker`) e implementação de ScanRunnerPort; terminate forçado após 500ms de tolerância de abort; cancela a varredura ao fechar a janela |
| desktop preload | `preload/resourceManager.ts` | Ponte `window.resourceManager.storage` |
| ui | `resource-manager/ResourceManagerApp.tsx` (tab), `resource-manager/storage/*` (incluindo `useStorageUsage`), i18n `resourceManager.storage.*` | Aba de armazenamento, cartão de disco, lista de categorias, detalhe, caixa de confirmação |
| tests | `packages/services/test/storage*.test.ts`, `storage/contract.test.ts`, `packages/ui/test/resourceManagerStorage{Presentation,Usage}.test.ts`, `desktop/test/e2e/resource-manager-storage.test.ts` | Testes unitários + E2E SM-01~05 |

Diferenças em relação a §4/§10:

- O serviço não passa mais por RPC: `IStorageService` é só a interface de uma instância mantida pelo main (`StorageManagementApi` + `onScanProgress` + `dispose`), sem descriptor / channel; a entrada de `useStorageUsage` é a ponte do preload em vez de `useServices()`.
- 「Mostrar no gerenciador de arquivos」 passa por `StorageRevealPath`, e o main valida com `isPathInsideStorageRoots` antes de chamar `shell.showItemInFolder`.
- Os tipos do contrato e o `groupStorageRootsByVolume` ficam em `packages/shared/src/storage.ts` (compartilhados pela ponte do renderer, pelo main e pelos services, evitando também a dependência circular contract ↔ domain).
- Os casos SM-08 (para ao sair da seção) e SM-09 (proteção de 24h) de tamanho de dados passam a ser cobertos por testes unitários (`useStorageUsage.test.ts`, `storageCleanPlan.test.ts`), sem repetição no E2E.
- O scanner de telemetria `zcodeDataSizeScanner.ts` do desktop main ainda não foi trocado pelo `walkStorageRoot` dos services, ficando para um MR posterior pequeno (substituição equivalente em comportamento, preservando a semântica parcial de file/time limit).