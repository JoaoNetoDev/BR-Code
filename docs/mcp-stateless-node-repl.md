# Especificação MCP 2026-07-28 — Node REPL sem estado

> Status: em implementação.
> Data: 2026-08-06.
> Base de protocolo: MCP `2026-07-28`, SEP-2567 Sessionless MCP.
> Limite de produto: o Browser Use continua usando `mcp__node_repl__js`, sem adicionar um server `browser_use` visível ao modelo, context handle ou semântica de ferramenta alternativa.

## 1. Objetivo

Esta alteração muda apenas o ciclo de vida de runtime do `node_repl` e a era do fio MCP:

1. O `node_repl` embutido usa fixamente o MCP `2026-07-28`, e sessões com o mesmo `workspaceKey = workspaceIdentity?.trim() || workspacePath` reutilizam um frontend MCP.
2. Cada chamada `js` usa um worker descartável próprio e um `NodeReplSession`; ao fim da chamada o worker é destruído, proibindo que `globalThis`, timers, cache de módulo de import dinâmico, response meta ou wrappers de Browser atravessem de uma chamada para a outra.
3. Browser Use e Computer Use compartilham a mesma entrada de modelo `mcp__node_repl__js` (na redação desta spec havia apenas Browser Use; o CUA passou a usar o mesmo host em 2026-08). Páginas, tabs, permissões e backend generation continuam sendo gerenciados pelo BrowserControl/session registry existente; o modelo faz bootstrap de novo a cada chamada e recupera a página pelo tab id estável; no lado do CUA, corresponde ao `CuaControlPort` do shared-host e ao frame registry.
4. Preserva-se a compatibilidade do runtime code-only, para não alterar identidades de ferramentas existentes nem o contrato de replay. `js_reset` e `js_add_node_module_dir` foram removidos em 2026-09-18 junto com a capacidade de moduleDirs (veja “As duas ferramentas removidas” abaixo), e o contrato de replay passa a ser suportado pelo mapeamento de nomes na UI.
5. MCP de terceiros comuns continuam usando o dual-era `auto`; servers legacy conhecidos e SSE continuam pelo legacy.

“Sem estado” refere-se especificamente ao kernel de execução sem estado; não significa apagar toda configuração de compatibilidade nem significa desligar páginas de navegador:

```text
sessão A ─┐
           ├─ lease ─> node_repl MCP frontend de escopo de workspace (2026-07-28)
sessão B ─┘                         |
                                      +─ js(A) -> worker descartável A -> dispose
                                      +─ js(B) -> worker descartável B -> dispose
                                      `─ config pequena de module-dir por session key

Autoridade de Browser/página
sessionId -> BrowserControlPort.requireSession -> workspace/remote/clientMode
          -> Browser backend/tab registry (owner existente; não é estado do frontend MCP)
```

## 2. Contrato de ferramentas visível ao modelo

O modelo vê apenas uma ferramenta de host:

- `mcp__node_repl__js`

As server instructions do `node_repl` e a descrição dessa tool declaram “Browser Use and Computer Use only” (na redação original era “Browser Use only”; após a entrada do CUA, os dois textos passaram a limitar o escopo às duas capacidades oficiais). Não pode ser transformada em uma ferramenta genérica de JavaScript, arquivos, shell, inspeção de pacotes ou processamento de dados, e também não se pode sugerir ao modelo que use uma ferramenta `browser_use` dedicada.

O guidance para o modelo tem como linha de base de conteúdo a skill `control-browser` anterior ao upgrade e a documentação da Browser API. Exceto pelas frases abaixo, que entram em conflito direto com o ciclo de vida do kernel, as regras de navegação, localização, recuperação de popup, screenshot, segurança, ciclo de vida de tabs e recuperação de erros devem ser preservadas:

- `persistent kernel/binding/module cache` passa a ser fresh a cada chamada `js`;
- O reaproveitamento de `globalThis.browser/globalThis.tab` entre cells passa a exigir, após cada bootstrap, obter novamente o browser conforme a escolha atual do usuário e então recuperar a tab com os facts completos da tab e o id estável;
- `js_reset` e `js_add_node_module_dir` foram removidos; o guidance não deve mais mencioná-los nem sugerir que exista um kernel persistente a ser reconstruído ou raízes de busca de módulos configuráveis pelo modelo.

É proibido comprimir ou reescrever os demais guidance apenas para explicar a ausência de estado. O exemplo de bootstrap de cada chamada serve apenas para carregar `scripts/browser-client.mjs` e executar `setupBrowserRuntime`, e não deve codificar `agent.browsers.getDefault()` em um template genérico, para não sobrescrever o backend IAB, extension ou CDP que o usuário já tenha escolhido explicitamente.

### `js`

- O schema de modelo de `tools/list` continua exigindo `code + title` e mantém `additionalProperties: false`.
- A descrição do campo `code` precisa valer tanto para o REPL de compatibilidade do core quanto para o MCP de kernel fresh, e não pode continuar declarando “persistent Node REPL session” ao modelo de Browser Use nem falsificar estado entre chamadas.
- O parser de runtime continua aceitando entrada code-only histórica; a UI usa o fallback de localização já existente para dados antigos.
- `timeout_ms` continua com valor padrão de 60 segundos, teto de 120 segundos e o texto de timeout já existente.
- Cada chamada cria um worker descartável; dentro do worker são criados o `NodeReplSession`, injetado o Browser bridge, a execução acontece, o resultado é devolvido e tudo é destruído.
- O import no código do modelo suporta apenas módulos embutidos `node:*` e URLs `file://` absolutas baseadas no skill root oficial; nomes de pacote puro não são resolvidos (`resolveSpecifier` e moduleDirs foram removidos junto com as ferramentas).
- Chamadas `js` da mesma sessão são seriais; sessões diferentes podem ser concorrentes.

### As duas ferramentas removidas (2026-09-18)

`js_reset` e `js_add_node_module_dir` foram removidos por completo de `tools/list`, dos handlers e da cadeia de execução, e o `node_repl` passou a manter apenas `js`. Chamá-las retorna `Tool not found`. O volume de chamadas medido das duas foi 0 (310 sessões locais, 17134 chamadas reais de `js`).

`js_reset`: depois da mudança para kernel fresh ela não tem mais semântica executável — a próxima `js` já é um kernel novo, e seu único comportamento residual era entrar na fila serial da mesma sessão, mas o tool_use do modelo já é serial e sessões diferentes usam sessionKeys diferentes, de modo que essa barreira é sempre vazia. Ela carrega cerca de 117 tokens de definição de ferramenta por requisição e, como sempre retorna sucesso e nunca falha, modelos fracos não mudam de estratégia (ticket ZCT-2100503886992535552: 155 sessões seguidas, 19 minutos e 48,37 milhões de tokens de entrada até dar 429). O resultado de falha é justamente o sinal de que o modelo precisa mudar de estratégia.

`js_add_node_module_dir`: ela empurrava a responsabilidade do host para o modelo. O modelo não consegue saber sozinho qual `node_modules` passar, e a única coisa que poderia lhe dizer é a documentação da skill, cujos caminhos o próprio host sabe injetar. O bootstrap dos dois SDKs oficiais usa apenas módulos embutidos `node:*` mais URLs `file://` absolutas baseadas no skill root, e nunca precisou resolver nomes de pacote puro. Junto foram removidos `NodeReplExecuteInput.moduleDirs`, a cadeia de passagem do worker, os `moduleDirs`/`addModuleDir`/`getModuleDirs` do `NodeReplSession` e o `resolveSpecifier` (os dois ramos dele tinham guarda `moduleDirs.length > 0` e nunca foram acionados no caminho de produção, que é sempre vazio, portanto a remoção não altera nenhum comportamento existente). Se no futuro um skill oficial precisar Really carregar pacotes de terceiros, o host injeta isso ao criar o runtime, sem reabrir uma ferramenta de configuração para o modelo.

A remoção só atua sobre o caminho executável. A renderização de transcripts históricos continua dependendo do mapeamento de nomes em `packages/shared/src/tool-identity.ts` e `packages/ui/src/lib/nodeReplToolDisplay.ts`, e esses devem ser preservados: eles leem apenas o toolName do histórico, não têm relação com o `tools/list` atual, e removê-los faria os blocos de chamada de sessões antigas degradarem para um renderer fallback desconhecido.

## 3. Browser Use e identidade de requisição

O `_meta` do MCP `2026-07-28` é o envelope/contexto da requisição, não uma credencial de autorização independente. O encadeamento embutido valida na seguinte ordem:

```text
tools/call _meta["com.zcode/request-context"]
  -> node_repl lê apenas o namespace do host, e não os campos de sessão nos parâmetros do modelo
  -> child usa um broker socket privado de processo + token de 256 bits
  -> o broker valida o token (não rejeita mais subagent por runtimeScope)
  -> BrowserControlPort.list/execute
  -> requireSession(sessionId; sessões filhas são registradas via forChildSession e mapeadas para a sessão pai)
  -> restaura workspaceIdentity / remoteSessionId / clientMode
  -> política de backend/tab/permissão da sessão atual
```

Portanto não se pode “confiar apenas em `_meta.session_id`”; a fronteira de confiança é sustentada em conjunto pelo child stdio privado, pelo token privado do broker, pelo request context namespaced escrito pelo host e pelo session registry. A continuidade de página não precisa mais de um handle opaque adicional: o `BrowserControlPort` já gerencia tabs/páginas por sessão, e o kernel fresh apenas reconstrói o wrapper temporário `agent/browser/tab`.

Subagentes podem usar Browser Use: depois que o runtime pai registra via `BrowserControlPort.forChildSession` (`tabOwner: "parent"`), as requisições da sessão filha são despachadas com a tab pertencendo à conversa atual, o subagente enxerga todas as tabs da conversa, as tabs que ele abre são expandidas no painel e não são fechadas ao final (`docs/browser-use/2026-07-16-subagent-browser-unavailable-spec.md`). Sessões filhas não registradas, um `_meta.session_id` de topo forjado, workspace path ou browser id forjado não conseguem contornar o session registry.

## 4. Compartilhamento, reciclagem e logs

- `node_repl` é configurado com `protocolVersion="2026-07-28"` e `isolation="workspace"` fixos.
- A key do pool de conexões permanece `server config fingerprint + workspaceKey`; servers de terceiros continuam por padrão em isolamento de sessão.
- Cada sessão mantém um lease; depois que o último lease é liberado, o frontend é fechado conforme o grace period já existente.
- `mcp.server.connected` registra `mcpConnectionId`, `workspaceKey`, `mcpIsolation=workspace`, `mcpProtocolEra=modern`, `mcpProtocolVersion=2026-07-28` e o PID do stdio.
- `mcp.pool.lease.acquired/released` registra cada sessionId separadamente com o mesmo `mcpConnectionId`; logs de conexão compartilhada não forjam um owner único.
- Após um crash do frontend, a próxima chamada reconecta conforme a lógica de adapter já existente. Como o kernel não tem estado persistente, a reconexão não precisa restaurar JavaScript; tabs/páginas do Browser continuam sendo determinadas pelos owners já existentes do Agent/host.

## 5. Limites multiplataforma

```text
desktop / desktop-continuous ──┐
                               ├─ shared host existente -> Agent -> lease do node_repl
mobile / web-remote-replayable ┘

relay/main: apenas auth + attachment + transporte de frames
Agent: pool MCP + roteamento de requisições
BrowserControl/desktop guest manager: autoridade de tab/página
```

- O `/remote` do celular apenas faz attachment ao host/Agent já existente da janela do desktop, não inicia outro Agent, MCP ou browser runtime.
- Esta alteração não adiciona task event, snapshot, queue, owner nem estado de replay.
- O desktop continuous não concatena mensagens de recuperação replayable; o mobile replayable não contorna os limites de gap/snapshot.
- A identidade de workspace remoto continua atravessando `workspaceIdentity + remoteSessionId` e não pode degradar para `workspacePath`.

## 6. Aceitação

- A identidade de ferramenta é apenas `mcp__node_repl__js`; `js_reset` e `js_add_node_module_dir` não estão em `tools/list`, chamá-las retorna `Tool not found`; não existem ferramentas de modelo `mcp__browser_use__*` ou `mcp__computer-use__*` embutidas.
- Em duas chamadas `js` consecutivas: a segunda não enxerga globals da primeira, nem timers, nem modificações de singleton de módulo importado, nem response meta; o DOM/page state do mesmo Browser tab continua contínuo.
- No full-chain do Desktop IAB e no replay multi-tab, cada `js` independente faz bootstrap de novo; a chamada seguinte executa `tabs.get` usando o tab id dinâmico presente no tool result real anterior. Primeiro se afirma completed e o marker de resultado em cada estado terminal de ferramenta; quando a projection V4 estiver atrasada, vale o `tool_result.is_error` recebido pelo modelo; falhas como `ReferenceError` precisam ser expostas diretamente na fronteira da ferramenta, sem degradar para timeout posterior de UI ou de matcher do provider.
- Duas sessões no mesmo workspace mantêm apenas um frontend/PID `zcode-node-repl-mcp` estável; globals, module dirs, tool results, permissões e tabs de A/B ficam isolados.
- `tools/list` continua exigindo title; chamada direta de runtime aceita code-only.
- A documentação `control-browser` e a Browser API preservam todo o guidance não estatal anterior ao upgrade; apenas persistent/fresh, binding entre cells e a semântica de reset são substituídos. O bootstrap genérico não escolhe backend padrão.
- O schema de `js.code` visível ao modelo não contém texto persistent em conflito com o kernel fresh.
- As descrições visíveis ao modelo de `js_reset` e `js_add_node_module_dir`, seus handlers, schemas e a cadeia de execução de moduleDirs foram totalmente removidos; o mapeamento de nomes da UI é preservado para a renderização de replay histórico.
- Browser Use funciona tanto no main quanto em subagentes; o subagente compartilha as tabs da conversa atual e as tabs permanecem após o fim; ao voltar ao main, a tab/página original continua utilizável.
- Passam a regressão de negociação de MCP de terceiros modern/legacy, os focused tests, o E2E pendente de Desktop, `pnpm typecheck` e `pnpm lint`.