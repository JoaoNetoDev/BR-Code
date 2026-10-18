# Página de configurações de MCP servers: o botão de refresh não atualiza o status de conexão do MCP

> Tipo: Bug (pool de conexões + UI)
> Superfície afetada: página de configurações de `packages/ui` → Plugins → MCP servers; pool de conexões MCP de `apps/zcode-cli`
> Estado: Corrigido (ver a seção «Correção»)

## Fenômeno

1. Configurações → Plugins → aba **MCP servers**, um determinado MCP server exibe "conectado e disponível"
2. O processo/serviço desse MCP server é encerrado
3. Clica-se no **botão de refresh** da barra de ferramentas dessa aba
4. **O status continua exibindo "conectado e disponível"**, e a partir daí, por mais tempo que se espere e por mais vezes que se clique, nunca muda

A única recuperação manual confiável: alternar o MCP server (desligar → ligar), ou reiniciar o app.

## Causa raiz: o lease em nível de processo acerta a reutilização do pool de conexões, e o modo connect simplesmente não volta a sondar

Cadeia (antes da alteração):

1. `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts:115` — a `mcpPort`
   usada pela página de configurações é um único lease em **nível de processo**:
   `acquireLease({ leaseId: "protocol-settings" })`.
2. O `connectionKey` de `apps/zcode-cli/packages/adapters/src/mcp/pool.ts` =
   `serverName + leaseId (isolamento de sessão por padrão) + stableStringify(config)`.
   O mesmo lease + configuração inalterada ⇒ **key idêntica**.
3. Quando `acquire` acerta uma entry existente, ele apenas faz "limpar closeTimer, somar ref" e depois
   `return await entry.connecting` — devolve o **promise já resolvido da primeira conexão**:
   não fecha, não reconecta, não sonda, não registra log.
4. Embora o `mcp/list` da página de configurações chame `connectConfiguredServers`, ele passa pela
   **implementação do lease do pool**, e não pela implementação do `McpAdapter` que "fecha o record e
   reconecta". Ou seja, "o modo connect realmente reconecta" só vale para o adapter conectado
   diretamente, não para o lease com pool.
5. O snapshot vem de `entry.adapter.status()`, isto é, dos records do adapter. A morte do subprocesso
   stdio tem um fallback em `client.onclose` (`adapters/src/mcp/index.ts`) que vira `disconnected`;
   **quando um serviço HTTP/SSE é parado, não há nenhum evento de close**, e o record fica
   permanentemente em `connected`.

Um segundo defeito de mesma forma, sobreposto: depois que um serviço stdio morto é marcado como
`disconnected` pelo onclose, clicar em refresh apenas devolve aquele `disconnected` obsoleto e
**nunca tenta reconectar**.

"Uma falha conhecida do lado da sessão não é despejada de volta na página de configurações" também é
resultado da mesma regra de key: o lease de sessão usa o seu próprio leaseId, recebendo uma entry
diferente e um adapter diferente.

### Evidência medida

Log `~/.zcode/cli/log/zcode-<data>.jsonl`, `sess=-` é o lease `protocol-settings` da página de configurações:

```text
08:40:04.732  mcp.server.connect.started   sess=-   plugin:official-tools:server
08:40:04.778  mcp.server.connected         sess=-   plugin:official-tools:server   ← 46ms, assinatura HTTP
(depois o serviço é parado e o refresh é clicado várias vezes, zero novos eventos MCP)
```

"Zero eventos" é justamente a assinatura do caminho de reutilização de entry: o ramo de reuso do pool
só registra `mcp.pool.lease.acquired` quando `previousKey !== key`; ao acertar o reuso, nenhuma linha
de log é produzida. E cada clique em refresh limpa o closeTimer, de modo que a entry nem chega a ser
reciclada por 30s de ociosidade — assim o estado fica congelado para sempre.

O texto "conectado e disponível" exibido na UI vem de `settings.mcp.plugin.connectedDescription`
(`zh-CN.ts`, "该插件 MCP 服务器已连接并可用。"), ou seja, do snapshot obsoleto das 08:40.

## Um item que já foi corrigido a montante e deixou de ser causa

A análise inicial considerava que o botão de refresh estava ligado ao `refreshAfterPluginChange()` de
`PluginsSection.tsx` (que só atualiza a lista de plugins). Isso deixou de valer após
`f876db289e feat: settings page upgrage` (2026-08-14): aquele botão em `PluginsSection.tsx:508`
pertence à **aba plugins** (renderizado dentro de `PluginList`), e a aba mcps renderiza
`McpSettingsSection`, que tem suas próprias header actions e chama
`requestMcpServerStatusList()`. O despacho por aba já foi feito.

## Correção

### ① O pool de conexões suporta verificação de vivacidade (P0, causa raiz)

- `contracts/src/interfaces/mcp.port.ts`: `McpConnectOptions` ganha `revalidate?: boolean`;
  `McpPort` ganha o opcional `pingServer?(name, { timeoutMs })`.
- `adapters/src/mcp/index.ts`: implementa `pingServer`, usando o `client.ping()` do protocolo
  básico do MCP (teto de 5s). Falha em nível de transport (SdkError com code em string, como
  `REQUEST_TIMEOUT` / `CONNECTION_CLOSED` / …) é considerada morte; ao mesmo tempo o record vira
  `disconnected` e é registrado `mcp.server.ping.failed`;
  se o servidor devolveu um erro JSON-RPC (code numérico, por exemplo ping não implementado), é
  considerado vivo, e a conexão disponível não pode ser derrubada por causa disso.
- `adapters/src/mcp/pool.ts`: quando `acquire` acerta uma entry existente e `revalidate` é
  verdadeiro, roda primeiro `revalidateEntry`:
  - `connected` → ping; se vivo, reusa (`mcp.pool.connection.revalidated`);
  - `connected` mas o ping julga morto, ou já está `disconnected` / `failed` / falha na primeira
    conexão → reconecta **no lugar, na mesma entry** (`mcp.pool.connection.stale`). Manter a
    identidade da entry é essencial: os outros leases que compartilham essa conexão não caem em
    `MCP server is not leased by this session`;
  - `connecting` (incluindo OAuth aguardando autorização) / `disabled` / `untrusted` → devolve como
    está, para não atrapalhar um handshake em andamento, o que invalidaria a URL de autorização já
    aberta no navegador e o PKCE/state.
  - Refreshes concorrentes compartilham a mesma verificação (`entry.revalidating`), sem ping
    duplicado nem reconexão duplicada.
- `bootstrap/src/zcode-protocol/mcp.ts`: os modos padrão/connect passam `revalidate: true`;
  `mode: "status"` (polling de OAuth de 1s) permanece somente leitura, sem pagar o custo do ping.

### ② O refresh manual deixa de falhar silenciosamente (P1)

`packages/ui/src/settings/McpSettingsSection.tsx`:

- `requestMcpServerStatusList` ganha `trigger: "auto" | "manual"`, e o guard é concentrado no
  `resolveMcpStatusListRefreshSkipReason`, testável. Toda verificação de consistência de workspace é
  mantida (não se pode enviar a configuração de A para B), mas um `serverStatusListKey` vazio
  bloqueia apenas o refresh automático — quando há apenas MCP embutidos de host/plugin e nenhum MCP
  do usuário, essa key é uma string vazia, e o usuário clicou em refresh: a requisição precisa
  realmente sair.
- Quando é pulado, registra `[mcp] manual status refresh skipped` + o motivo, para que, ao
  reproduzir, seja possível distinguir pelo log entre "não enviou requisição" e "enviou mas leu um
  estado antigo".
- `handleManualRefresh`: primeiro `loadMcpFromUserDirectory`; quando a configuração ainda não está
  pronta, complementa com um `ensureLoadedForWorkspace` (e sincroniza também a refresh input ref,
  senão a requisição no mesmo tick ainda seria pulada por `config-not-ready`), e então dispara o
  refresh em modo manual; durante isso o botão entra em estado de loading.
- Falha na requisição exibe um toast `settings.mcp.refreshFailed`.

### Testes de regressão

- `apps/zcode-cli/packages/adapters/tests/mcp-connection-pool.test.ts`: ping vivo não reconecta /
  morto reconecta no lugar / já disconnected reconecta direto e não faz ping / handshake OAuth não é
  perturbado / ausência de capacidade de ping é considerada vida / sem revalidate não faz ping /
  refreshes concorrentes compartilham uma única verificação.
- `apps/zcode-cli/packages/adapters/tests/mcp.test.ts`: ping bem-sucedido mantém connected; falha de
  transport vira disconnected e alerta; erro JSON-RPC é considerado vivo; server desconhecido é
  considerado morto.
- `apps/zcode-cli/packages/bootstrap/tests/mcp-protocol.test.ts`: modo connect carrega `revalidate`;
  modo status não dispara `connectConfiguredServers`.
- `packages/ui/test/mcpSettingsSectionStatusList.test.ts`: manual não é bloqueado por key vazia; o
  guard de consistência de workspace continua valendo para manual.

## Não feito (pode ser aberto à parte)

- **Frescor passiva**: `McpSettingsSection` ainda não tem atualização periódica voltada ao status de
  conexão; o refresh em focus / visibilitychange é bloqueado por
  `!pendingMcpOAuthAuthorizationRefreshKey`, e portanto não funciona para MCP sem fluxo OAuth.
  Opções possíveis: rodar um refresh em modo connect com baixa frequência (por exemplo 60s) enquanto a
  página de configurações estiver visível, ou fazer o agent enviar uma notification quando o status do
  MCP mudar e a página se inscrever (mais preciso e sem custo de polling).
  Atenção: o modo connect também reconecta servers já mortos (stdio relança o processo), o que é uma
  decisão de produto.
- A `serverStatusListKey` do refresh automático ainda é calculada só a partir das **listas**
  servers/plugins, e é insensível a mudanças de status de conexão. O refresh manual já a contorna; para
  fazer a atualização passiva é preciso projetar isso junto.