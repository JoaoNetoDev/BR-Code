# Especificação de Negociação de Versão de Cliente MCP Dual-Era

> Status: implementado.
> Data: 2026-08-04.
> Base de protocolo: MCP `2026-07-28` Versioning and Compatibility, Backward Compatibility de stdio/Streamable HTTP.

## 1. Objetivo

O cliente MCP do ZCode suporta simultaneamente duas classes de server:

- modern: MCP `2026-07-28` e posteriores, usando `_meta` por requisição e `server/discover`, sem enviar
  `initialize` / `initialized`;
- legacy: MCP `2025-11-25` e anteriores, usando o handshake `initialize` / `initialized`.

Em servidores MCP comuns, o client identifica a era automaticamente; o `node_repl` embutido usa modern
`2026-07-28` de forma fixa, mantendo execução stateless por chamada e compartilhamento de processo com escopo de workspace.

## 2. Semântica de Configuração

```ts
protocolVersion?: "legacy" | "auto" | "2026-07-28";
```

| Configuração                                     | Comportamento do client                                                                             | Uso                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Não configurada, `stdio` / `http`                | Equivalente a `auto`                                                                                | MCP de terceiros comum, compatibilidade automática com as duas eras |
| `auto`                                           | Sonda modern primeiro; só volta para `initialize` se for determinado que é legacy                   | Declaração explícita de dual-era                 |
| `legacy`                                         | Não envia a sonda modern e vai direto para o handshake antigo                                       | Server antigo conhecido, evita sibling de stdio |
| `2026-07-28`                                     | fixa modern; falha se o server não suportar, sem permitir fallback                                  | `node_repl` embutido e stateless                  |
| Não configurada ou qualquer configuração não modern, transport `sse` | Vai direto para legacy; o transport HTTP+SSE antigo não carrega a era modern de MCP `2026-07-28` por requisição | Endpoint SSE deprecated já escolhido explicitamente |

Configuração fixa dos servers embutidos:

- `node_repl`: `protocolVersion="2026-07-28"`, `isolation="workspace"`; cada `js` usa um worker/kernel descartável;
- não se registra mais um server embutido `browser_use` separado.

A negociação de versão decide apenas a era no wire e não altera o compartilhamento de processo. Um MCP de terceiros comum, mesmo tendo negociado modern, continua usando
o session isolation padrão; apenas o `node_repl` embutido escolhe explicitamente o isolamento por workspace.

A entrada de configuração do arquivo precisa aceitar e preservar como estão os três valores de enumeração de `protocolVersion` acima, cobrindo stdio/http/sse; quando omitido, nenhum valor padrão é injetado.
Valores de enumeração inválidos ou campos desconhecidos continuam sendo registrados como diagnostics de um único server e ignorados, sem afetar outros servers nem a configuração de plugins.

## 3. Sequência de Conexão

```text
普通 stdio/http server（protocolVersion 未配置或 auto）
        |
        v
server/discover + preferred modern version
        |
        +-- DiscoverResult ----------------------> modern
        |                                           |
        |                                           `-- 每个请求携带 modern _meta
        |
        +-- recognized modern error -------------> modern
        |    例如 UnsupportedProtocolVersion         |
        |                                           `-- 按 supported version 修正；不 initialize
        |
        `-- legacy evidence ----------------------> legacy
             stdio: 非 modern error / 合理超时         |
             HTTP: 4xx 且 body 非 modern error         `-- initialize -> initialized

内置 node_repl
        |
        v
pin 2026-07-28 -> server/discover
        |
        +-- 支持 2026-07-28 -> modern / stateless
        `-- 不支持或无法确认 ----> 连接失败；禁止 legacy fallback
```

A sonda `auto`/pin de stdio é executada pelo MCP TypeScript SDK em um processo irmão descartável. O ZCode
precisa dar à sonda um orçamento limitado: no máximo 5 segundos, e no máximo metade do orçamento total de conexão do server; o orçamento restante é usado para a inicialização do
session child real do server legacy e para o `initialize`. O timeout total de conexão continua sendo controlado pelo `timeoutMs` já existente.

Um timeout na sonda HTTP significa falha de rede e não permite concluir que o server é legacy; o SDK deve retornar falha de conexão. Só uma resposta HTTP legacy conforme a especificação
autoriza o fallback.

## 4. Limites de Estado e Cache

- O resultado da negociação da conexão atual é exposto em `McpServerStatus.protocolEra` como `modern` / `legacy`, usado apenas para diagnóstico e
  exibição no control-plane, e não como substituto do fato de prontidão do tool catalog.
- O evento de log de produção `mcp.server.connected` de cada conexão bem-sucedida precisa registrar simultaneamente:
  - `mcpClientName` / `mcpClientVersion`: a identidade do cliente MCP enviada ao server;
  - `mcpVersionNegotiationMode`: a estratégia `auto` / `legacy` / `2026-07-28` efetivamente adotada pela configuração;
  - `mcpProtocolEra` / `mcpProtocolVersion`: o resultado real da negociação depois que o handshake do SDK foi concluído.
  - `mcpConnectionId` / `mcpIsolation` / `workspaceKey`: o identificador estável de conexão no pool, o escopo de isolamento e a identidade do
    workspace; conexões com session isolation também precisam registrar `sessionId`.
  - `mcpTransportPid`: o PID do subprocesso direto do transport da sessão final em stdio; HTTP/SSE não registram esse campo.
- A política de configuração não é o resultado da negociação; ao investigar problemas, é preciso se guiar por `mcpProtocolVersion`.
- A atribuição de conexão e a lease de sessão precisam ser registradas separadamente. `mcp.pool.lease.acquired` /
  `mcp.pool.lease.released` usam o mesmo `mcpConnectionId` e registram `sessionId`, `workspaceKey`,
  `mcpIsolation` e `refCount`. Uma conexão compartilhada com workspace isolation não pode forjar um `sessionId` único em
  `mcp.server.connected`; o compartilhamento entre múltiplas sessões deve ser expresso pelos eventos de lease.
- `mcp.pool.connection.created` e `mcp.server.closed` precisam carregar o mesmo `mcpConnectionId`, para que os logs permitam
  rastrear criação, reuso e reciclagem ao longo de `sessionId -> lease -> connection -> stdio PID`.
- A era de uma conexão de client fica imutável após a conclusão do connect; um reconexo renegocia.
- Falha na negociação da sonda (`SdkError(EraNegotiationFailed)` / `UnsupportedProtocolVersionError`) é
  mapeada em `McpServerStatus.failureKind` como `protocol_negotiation_failed` (o adapter identifica pelo tipo estruturado do
  erro, sem casar texto de erro); a UI de settings usa isso para exibir a orientação de falha “将协议版本切换为「兼容旧版」”, em vez da
  mensagem enganosa de “网络不可达”. A versão de protocolo pode ser definida manualmente no formulário de edição de MCP server
  (dropdown `protocolVersion`, oculto no formato sse) ou na configuração JSON.
- O ZCode não adiciona persistência de era entre sessões. O SDK/transport pode cachear o resultado da conexão atual, mas não pode reaproveitar o resultado de um server para
  outro server config, outra identidade de workspace ou outro runtime remoto.
- O desktop `desktop-continuous` e o mobile `web-remote-replayable` carregam apenas os eventos de session/tool já existentes; a negociação de versão
  não entra em relay, snapshot, queue nem owner state.

## 5. Regras de Falha e Segurança

1. Não é permitido tratar todo erro de JSON-RPC como legacy. Erros modern reconhecidos, como
   `UnsupportedProtocolVersionError`, provam que o server é modern, e o client só pode corrigir a versão ou falhar.
2. A determinação de legacy em stdio não pode ficar presa a um único código de erro; um server antigo pode retornar
   `-32601`, `-32602`, fechar o child da sonda ou simplesmente não responder dentro de um prazo razoável.
3. `protocolVersion="2026-07-28"` é um pin estrito e não pode rebaixar silenciosamente por “disponibilidade”; isso garante que o
   `node_repl` compartilhado não volte para a semântica de sessão/kernel persistente do legacy.
4. `protocolVersion="legacy"` precisa manter o handshake antigo byte-compatible, sem adicionar header modern nem `_meta`.
5. O broker token, o session registry e a validação de workspace identity do Browser Use não são afetados pelo resultado da
   negociação; o `_meta` modern fornece apenas o contexto de roteamento do host e não pode, sozinho e sem o child/broker privado
   e o `requireSession`, virar um fato de autorização.

## 6. Casos de Aceitação

| ID    | Configuração/Server                      | Expectativa                                                                                                       |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| MVN01 | stdio comum, sem versão configurada, modern | `auto` por padrão, negociação `modern`, sem enviar initialize legacy                                          |
| MVN02 | stdio comum, sem versão configurada, legacy | A sonda sibling determina legacy, o child real completa o initialize e as ferramentas ficam disponíveis            |
| MVN03 | Streamable HTTP comum, sem versão configurada | `auto` por padrão; erro modern reconhecido não rebaixa, apenas resposta legacy rebaixa                           |
| MVN04 | Qualquer transport, `legacy` explícito   | Sem sonda, mantendo o comportamento antigo de initialize                                                         |
| MVN05 | `node_repl` embutido                      | Pin `2026-07-28`, `protocolEra=modern`, falha de conexão quando o server não suporta; o workspace pode compartilhar a conexão |
| MVN06 | legacy explícito / `sse`                  | Fixo em legacy, sem gerar sonda modern descartável                                                               |
| MVN07 | server stdio auto que não responde à sonda | A sonda termina dentro do orçamento limitado; após o fallback/timeout total não sobra sibling process nem processo derivado |
| MVN08 | Qualquer server conectado com sucesso    | `mcp.server.connected` contém ao mesmo tempo a identidade do client, a estratégia de negociação, a era real e a versão exata do protocolo |
| MVN09 | Conexão com session/workspace isolation   | Os logs de conexão, lease e fechamento podem ser correlacionados por `mcpConnectionId`; conexões stdio registram PID e conexões compartilhadas relacionam a sessão por vários logs de lease |

Testes focados de adapter/process provam a negociação e a limpeza; o smoke test do bundle do Browser Use continua provando um server stdio modern real.
Essa mudança não altera a UI de conversa nem o estado de produto, e não adiciona combinações de estado de E2E de conversa.

Foi adicionado também o E2E de processo real no Desktop `packages/desktop/test/e2e/settings/mcp-dual-era-version-negotiation.test.ts`,
que sobe fixtures stdio modern/legacy com a configuração real do CLI em um HOME isolado e lê o JSONL de `mcp.server.connected` a partir do
`ZCODE_LOG_DIR` exclusivo do worker. Esse E2E precisa travar ao mesmo tempo:

- a fixture modern realmente negocia `2026-07-28`, sem initialize legacy;
- a fixture legacy passa pela sonda descartável e depois tem o `initialize` concluído pelo session child real;
- uma fixture independente cujo arquivo de configuração especifica explicitamente `legacy` é preservada, com estratégia de log `legacy` e apenas o handshake antigo no wire, sem `server/discover`;
- a estratégia de configuração, a era e a versão exata do protocolo nos logs são coerentes com o registro de wire da fixture;
- depois que o child da sonda termina, cada consumer ativo mantém apenas o seu próprio processo de sessão verdadeiro; quando existem simultaneamente settings e
  draft/session consumer no Desktop, a E2E identifica PIDs de sonda residuais pela ausência de `tools/list` no wire, em vez de limitar incorretamente
  a 1 o número global de processos vivos da fixture.

Esse caso não envia requisições ao provider; a realismo vem da cadeia completa de processos de produto Electron -> Local Host -> ZCode Agent -> MCP
client -> stdio server.