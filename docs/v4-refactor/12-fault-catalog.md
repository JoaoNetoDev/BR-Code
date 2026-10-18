# Fault Catalog: enumeração de erros de protocolo `fault.*` (G-12)

Este documento organiza as falhas de ambiente de [conversation-session-environment-fault-catalog.md](../testing/conversation-session-environment-fault-catalog.md) em um mapeamento de `reasonCode` `fault.*` e `SessionErrorInfo`, e registra as decisões de produto que ainda não foram fechadas.

Fato atual do código: `SessionErrorInfo.code` e o `reasonCode` do ACK ainda são `string` no schema e ainda não foram mecanicamente fechados por um enum do zod; além da tabela de falhas de ambiente abaixo, a implementação também usa erros de execução／transporte como `fault.command.*`, `fault.subscription.*`, `fault.attachment.*`, `fault.projectionEventCommit.*`, `fault.runtime.*`. Portanto, este documento é a tabela-base de falhas de ambiente, não uma enumeração completa de códigos de runtime. Um code novo deve continuar sendo rebuscado na spec correspondente, sem alegar que hoje ele é imposto pelo sistema de tipos.

É preciso distinguir duas definições:

- **Tabela-base de codes de ambiente (definida aqui)**: nomenclatura estável e classificação padrão de provider/network/storage/lifecycle/workspace;
- **Codes de execução e transporte**: definidos pelo código atual de handler／gateway e por `10-protocol-spec.md`; depois devem ser completados na tabela de protocolo deste diretório;
- **Comportamento de produto de cada fault**: ainda decidido item a item pelo decision worksheet. A tabela abaixo mantém `decision-needed`, indicando que o código ainda pode recorrer a um fallback genérico, e não uma semântica de produto já confirmada.

## 1. Estrutura

```ts
interface SessionErrorInfo {
  code: string;                  // 本文 fault.* 词表（或 proto.*，见 10 §6.2）
  message: string;               // 兜底英文；本地化文案由客户端按 code 生成
  recoverable: boolean;          // true → UI 提供重试入口
  at: Timestamp;
  source: "provider" | "runtime" | "tool" | "network";
  attribution?: {
    source?: "provider" | "runtime" | "tool" | "network";
    reason?: string;
    providerId?: string;
    modelId?: string;
    providerKind?: string;
    transport?: "http" | "sse" | "websocket";
    statusCode?: number;
    providerErrorCode?: string;
    retryable?: boolean;
  };
}
```

`attribution` é uma camada opcional de fatos, compatível com eventos antigos e com dados já persistidos, e não carrega política de produto. O CLI a projeta por allowlist a partir do contexto de erro conhecido, mantendo-a consistente entre o TurnError live e a cold hydration persistida; ela não pode carregar URL, header, token, corpo de requisição／resposta, conteúdo de prompt／tool, stack, detail completo nem requestId. Quando `attribution.source` existe, `SessionErrorInfo.source` assume esse valor; quando falta, continua com o fallback `runtime`.
`attribution.retryable` descreve apenas o fato da falha e não substitui o `recoverable` desta camada, portanto não altera a entrada de retry da UI.

Divisão de namespaces (paralela aos namespaces de reasonCode da 10-protocol-spec §6.2):

| Namespace | Semântica | Grupo correspondente do fault catalog |
| --- | --- | --- |
| `fault.provider.*` | o provider devolveu uma resposta de falha explícita | N01–N05、N08 |
| `fault.network.*` | requisição／stream falhou ou foi interrompida na camada de rede | N06–N07、S01–S07 |
| `fault.storage.*` | falha do sistema de arquivos／storage local | D01–D05 |
| `fault.lifecycle.*` | interrupção causada pelo ciclo de vida do processo／aplicativo | L01–L08 |
| `fault.workspace.*` | mudança no ambiente externo do workspace／tool | W01–W05 |

O isolamento entre sessions (X01–X03) não gera codes próprios — eles afirmam que "o fault de A não contamina B" e reutilizam o code do próprio A.

## 2. Vocabulário

A coluna `Decisão` indica o status da decisão de comportamento de produto daquele fault (proveniente do fault catalog / decision worksheet); `recoverable` é o valor padrão do protocolo e a decisão pode sobrescrevê-lo.

### fault.provider.*

| code | 触发 | source | recoverable | 来源 case | 决策 |
| --- | --- | --- | --- | --- | --- |
| `fault.provider.authFailed` | 主请求 401/403 | provider | false（需重新配置凭据） | N01 | decision-needed |
| `fault.provider.notConfigured` | provider 未配置 / API Key 缺失 | runtime | false | N02 | decision-needed |
| `fault.provider.rateLimited` | 429 | provider | true（自动重试候选） | N03 | decision-needed |
| `fault.provider.serverError` | 502/503 | provider | true | N04 | decision-needed |
| `fault.provider.requestFailed` | 500 JSON error body | provider | true | N05 | decision-needed |
| `fault.provider.malformedResponse` | 200 但非法 JSON/SSE | provider | true | N08 | decision-needed |
| `fault.provider.errorEvent` | SSE 流中 provider 主动发 error event | provider | true | S05 | decision-needed |
| `fault.provider.compactFailed` | compact 请求失败（手动或 auto 三连败终态） | provider | true | C01/C02 | **decidido（2026-07-05）**: não entra em `phase=error`, é expresso pelo compact marker `failed`; falha manual mantém completed + entrada de retry, auto com três falhas segue executando sem compactação |

### fault.network.*

| code | 触发 | source | recoverable | 来源 case | 决策 |
| --- | --- | --- | --- | --- | --- |
| `fault.network.unreachable` | DNS/connection refused/proxy/TLS，未拿到响应头 | network | true（TLS 类除外，按子因判定） | N06 | decision-needed |
| `fault.network.timeout` | 长时间无响应头 | network | true | N07 | decision-needed |
| `fault.network.sseDisconnected` | 响应头后 / message_start 后 / 部分 delta 后断流 | network | true | S01–S03 | decision-needed |
| `fault.network.sseMalformedEvent` | SSE event JSON 非法 | network | true | S04 | decision-needed |
| `fault.network.sseStalled` | stream stall 超过阈值 | network | true | S06 | decision-needed |

> S07（evento SSE tardio após stop）não gera code: por protocolo ele precisa ser ignorado silenciosamente (inputId obsoleto rejeitado); é uma asserção de corretude, não um estado de erro.

### fault.storage.*

| code | 触发 | source | recoverable | 来源 case | 决策 |
| --- | --- | --- | --- | --- | --- |
| `fault.storage.historyWriteFailed` | session history 写入 ENOSPC/EACCES | runtime | true（释放空间后） | D01 | decision-needed |
| `fault.storage.workspaceWriteFailed` | tool 写 workspace 失败（磁盘满等） | tool | true | D02 | decision-needed |
| `fault.storage.settingsWriteFailed` | 设置/凭据保存失败 | runtime | true | D03 | decision-needed |
| `fault.storage.snapshotCorrupt` | 启动恢复时 session 数据损坏 | runtime | false（该 session 只读降级） | D04 | decision-needed |
| `fault.storage.logWriteFailed` | 日志/artifact 写失败 | runtime | true（产品流程应继续，仅 warn） | D05 | decision-needed |

### fault.lifecycle.*

| code | 触发 | source | recoverable | 来源 case | 决策 |
| --- | --- | --- | --- | --- | --- |
| `fault.lifecycle.agentExited` | CLI/agent 进程崩溃或异常退出 | runtime | true（可重启续接） | L06 | decision-needed |
| `fault.lifecycle.interruptedByQuit` | running/compacting 中退出 app，重启后发现未收口 turn | runtime | true | L03、L08 | decision-needed |

> L01/L02/L04/L05/L07（background、fechamento de janela、crash de renderer／host, sleep-wake）**não são conversation faults** na arquitetura v4: são eventos da camada de conexão, absorvidos pelo caminho de recuperação `subscribe(base)` (04-sync-and-recovery), e não entram em `SessionErrorInfo`. Essa é a simplificação semântica do v4 em relação à arquitetura antiga — "a exibição é volátil, o fato é persistente".

### fault.workspace.*

| code | 触发 | source | recoverable | 来源 case | 决策 |
| --- | --- | --- | --- | --- | --- |
| `fault.workspace.missing` | workspace 目录被删/改名 | runtime | false | W01 | decision-needed |
| `fault.workspace.fileConflict` | tool 操作中文件被外部修改/删除 | tool | true | W02 | decision-needed |
| `fault.workspace.gitDegraded` | repo 不存在/异常，降级普通目录 | runtime | true | W03 | decision-needed |
| `fault.workspace.remoteDisconnected` | SSH/WSL/Docker 连接断开 | network | true | W04 | decision-needed |

## 3. Restrições

1. **O objetivo é um vocabulário fechado, mas isso ainda não foi implementado mecanicamente**: um code de ambiente novo deve atualizar primeiro este documento; um code de execução／transporte novo deve atualizar em sincronia o protocolo em nível de campo. No fim, o conjunto estável deve convergir para um schema compartilhado, em vez de manter strings arbitrárias por tempo indeterminado.
2. **code ≠ texto de exibição**: o cliente consulta o code na tabela de textos localizados (i18n) e `message` é apenas o fallback em inglês; é proibido fazer a UI ramificar a lógica interpretando a string de message.
3. **`recoverable` dirige a entrada de retry da UI**, e sua relação com o `canRetry` de linha é: o `lastError.recoverable` de nível de sessão controla o botão de retry do banner de erro; o `canRetry` de linha controla a entrada de reexecução daquele turn; os os dois são calculados pelo reducer de forma independente.
4. **As asserções de isolamento do grupo X entram nos testes de ouro**: injete qualquer fault na session A e afirme que a projeção da session B permanece inalterada byte a byte.
5. As 37 decisões de comportamento de produto pendentes seguem o fluxo existente de decision worksheet (o próximo lote recomenda N01–N08 + S01–S07, que determinam a condição de entrada em `phase=error`); o resultado das decisões é rebuscado na coluna `Decisão` deste documento.