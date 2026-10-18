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
  code: string;                  // vocabulário fault.* deste documento (ou proto.*, ver 10 §6.2)
  message: string;               // fallback em inglês; o texto localizado é gerado pelo cliente a partir do code
  recoverable: boolean;          // true → a UI oferece entrada de retry
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

| code | Gatilho | source | recoverable | Case de origem | Decisão |
| --- | --- | --- | --- | --- | --- |
| `fault.provider.authFailed` | requisição principal 401/403 | provider | false (exige reconfigurar as credenciais) | N01 | decision-needed |
| `fault.provider.notConfigured` | provider não configurado / API Key ausente | runtime | false | N02 | decision-needed |
| `fault.provider.rateLimited` | 429 | provider | true (candidato a retry automático) | N03 | decision-needed |
| `fault.provider.serverError` | 502/503 | provider | true | N04 | decision-needed |
| `fault.provider.requestFailed` | 500 com corpo JSON de erro | provider | true | N05 | decision-needed |
| `fault.provider.malformedResponse` | 200 mas com JSON/SSE inválido | provider | true | N08 | decision-needed |
| `fault.provider.errorEvent` | provider emite ativamente um error event no stream SSE | provider | true | S05 | decision-needed |
| `fault.provider.compactFailed` | requisição de compact falhou (manual ou estado final de três falhas do auto) | provider | true | C01/C02 | **decidido (2026-07-05)**: não entra em `phase=error`, é expresso pelo compact marker `failed`; falha manual mantém completed + entrada de retry; no auto, após três falhas a execução segue sem compactação |

### fault.network.*

| code | Gatilho | source | recoverable | Case de origem | Decisão |
| --- | --- | --- | --- | --- | --- |
| `fault.network.unreachable` | DNS/connection refused/proxy/TLS, sem obter headers de resposta | network | true (exceto casos de TLS, julgado pela subcausa) | N06 | decision-needed |
| `fault.network.timeout` | longa ausência de headers de resposta | network | true | N07 | decision-needed |
| `fault.network.sseDisconnected` | stream interrompido após os headers / após message_start / após parte dos deltas | network | true | S01–S03 | decision-needed |
| `fault.network.sseMalformedEvent` | JSON inválido no SSE event | network | true | S04 | decision-needed |
| `fault.network.sseStalled` | stall do stream acima do limiar | network | true | S06 | decision-needed |

> S07（evento SSE tardio após stop）não gera code: por protocolo ele precisa ser ignorado silenciosamente (inputId obsoleto rejeitado); é uma asserção de corretude, não um estado de erro.

### fault.storage.*

| code | Gatilho | source | recoverable | Case de origem | Decisão |
| --- | --- | --- | --- | --- | --- |
| `fault.storage.historyWriteFailed` | escrita do session history falha com ENOSPC/EACCES | runtime | true (depois de liberar espaço) | D01 | decision-needed |
| `fault.storage.workspaceWriteFailed` | tool falha ao escrever no workspace (disco cheio etc.) | tool | true | D02 | decision-needed |
| `fault.storage.settingsWriteFailed` | falha ao salvar configurações／credenciais | runtime | true | D03 | decision-needed |
| `fault.storage.snapshotCorrupt` | dados da session corrompidos na recuperação da inicialização | runtime | false (aquela session degrada para somente leitura) | D04 | decision-needed |
| `fault.storage.logWriteFailed` | falha ao escrever log／artifact | runtime | true (o fluxo do produto deve seguir, apenas warn) | D05 | decision-needed |

### fault.lifecycle.*

| code | Gatilho | source | recoverable | Case de origem | Decisão |
| --- | --- | --- | --- | --- | --- |
| `fault.lifecycle.agentExited` | processo CLI／agent quebrou ou saiu de forma anormal | runtime | true (pode reiniciar e retomar) | L06 | decision-needed |
| `fault.lifecycle.interruptedByQuit` | app fechado durante running/compacting; na reinicialização, um turn não finalizado é descoberto | runtime | true | L03、L08 | decision-needed |

> L01/L02/L04/L05/L07（background、fechamento de janela、crash de renderer／host, sleep-wake）**não são conversation faults** na arquitetura v4: são eventos da camada de conexão, absorvidos pelo caminho de recuperação `subscribe(base)` (04-sync-and-recovery), e não entram em `SessionErrorInfo`. Essa é a simplificação semântica do v4 em relação à arquitetura antiga — "a exibição é volátil, o fato é persistente".

### fault.workspace.*

| code | Gatilho | source | recoverable | Case de origem | Decisão |
| --- | --- | --- | --- | --- | --- |
| `fault.workspace.missing` | diretório do workspace apagado／renomeado | runtime | false | W01 | decision-needed |
| `fault.workspace.fileConflict` | arquivo modificado／removido externamente durante operação de tool | tool | true | W02 | decision-needed |
| `fault.workspace.gitDegraded` | repo inexistente／anômalo, degradação para diretório comum | runtime | true | W03 | decision-needed |
| `fault.workspace.remoteDisconnected` | conexão SSH/WSL/Docker interrompida | network | true | W04 | decision-needed |

## 3. Restrições

1. **O objetivo é um vocabulário fechado, mas isso ainda não foi implementado mecanicamente**: um code de ambiente novo deve atualizar primeiro este documento; um code de execução／transporte novo deve atualizar em sincronia o protocolo em nível de campo. No fim, o conjunto estável deve convergir para um schema compartilhado, em vez de manter strings arbitrárias por tempo indeterminado.
2. **code ≠ texto de exibição**: o cliente consulta o code na tabela de textos localizados (i18n) e `message` é apenas o fallback em inglês; é proibido fazer a UI ramificar a lógica interpretando a string de message.
3. **`recoverable` dirige a entrada de retry da UI**, e sua relação com o `canRetry` de linha é: o `lastError.recoverable` de nível de sessão controla o botão de retry do banner de erro; o `canRetry` de linha controla a entrada de reexecução daquele turn; os dois são calculados pelo reducer de forma independente.
4. **As asserções de isolamento do grupo X entram nos testes de ouro**: injete qualquer fault na session A e afirme que a projeção da session B permanece inalterada byte a byte.
5. As 37 decisões de comportamento de produto pendentes seguem o fluxo existente de decision worksheet (o próximo lote recomenda N01–N08 + S01–S07, que determinam a condição de entrada em `phase=error`); o resultado das decisões é rebuscado na coluna `Decisão` deste documento.