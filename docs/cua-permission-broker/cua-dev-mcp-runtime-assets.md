# Ciclo de vida dos assets de runtime do SDK node_repl no CUA Dev

## Objetivo

O CUA não possui mais um launcher MCP independente. O Dev desktop precisa apenas semear o SDK do CUA, a Skill e a documentação sob demanda, reutilizando o MCP shared `node_repl` compartilhado entre Browser Use e Computer Use (com apenas a ferramenta `js`). O Helper nativo, o frame registry, o kill switch, o input hold e o `possibly_sent` continuam sendo mantidos pela `CuaControlPort` do shared-host; o celular só pode se conectar como attachment a um host já existente.

```text
pnpm dev:desktop
  |
  +-- stage Browser node_repl runtime (the only MCP server)
  +-- stage zcode-cua SDK/docs/skill (no mcpServers entry)
  `-- build Agent bundle and filesystem seed
          |
          v
      node_repl MCP (3 model tools)
          |
          `-- Worker bootstrap -> agent.computerUse -> local bridge
                              -> CuaControlPort -> BrokerClient -> Helper
```

Sem broker/permissão a SDK retorna unavailable de forma explícita; não se cria Helper/CUA runtime adicional no relay, no celular ou em cada session. O desktop usa `desktop-continuous` e o celular usa `web-remote-replayable`.

## Limites de assets e estado

| Fato | Owner autoritativo | Artefato/verificação |
| --- | --- | --- |
| CUA SDK | `@zcode/zcode-cua-plugin` | `scripts/computer-use-client.mjs` + `scripts/check-sdk.mjs` |
| Documentação e Skill do CUA | plugin producer | `docs/computer-use.md`, `skills/computer-use/SKILL.md` |
| node_repl MCP | `@zcode/browser-use-plugin` | `dist/mcp/server.js` + `scripts/computer-use-client.mjs` (shared host runtime) |
| CUA runtime/session/frame | `CuaControlPort` do shared-host | `createComputerUseRuntime()`; isolado por `workspaceKey`/`remoteSessionId`/`sessionId` |
| native capability | CUA Helper + TCC | broker token, frame freshness, kill switch, input cleanup |

## Restrições que precisam ser mantidas

- A projeção de ferramentas de modelo de uma nova sessão tem apenas `mcp__node_repl__js`; as configurações antigas de `mcp__computer-use__*` e o `js_reset` / `js_add_node_module_dir` já removidos são descartados no bootstrap, e o transcript histórico é apenas uma reprodução somente leitura.
- Cada Worker de `js` faz bootstrap da SDK novamente, mas não destrói o runtime CUA do shared-host nem o state de frames.
- As requisições do bridge node_repl precisam carregar `workspaceIdentity`, `workspacePath`, `workspaceKey`, `sessionId`, `remoteSessionId`, `turnId`, `traceId`, `clientMode` e `deliveryKind`; o subagent falha fechado na entrada do bridge.
- Credenciais de broker são injetadas apenas no shared node_repl confiável; o plugin host não aceita mais a entrada antiga de socket argv do CUA.

## Casos de aceitação

| Case | Verificação |
| --- | --- |
| Contrato de 30 métodos da SDK | o manifest/schema do producer corresponde um a um à união de métodos da SDK |
| Reconstrução do Worker | múltiplas chamadas `node_repl js` podem refazer o bootstrap, mantendo o estado de runtime/session do CUA |
| Resultado de imagem | a SDK envia o bloco de imagem do CUA para o `nodeRepl.emitImage` genérico, sem transformar base64 em texto |
| Sem broker/permissão | retorna unavailable/permission error, sem iniciar MCP/Helper independente |
| Limite remoto | desktop continuous e web remote replayable compartilham o attachment, sem colocar o estado do CUA em relay/snapshot |
| Histórico | o antigo `mcp__computer-use__*` pode ser visualizado, mas não reexecutado nem reinjetado |

## Implementações relacionadas

- `apps/zcode-cli/packages/browser-use-plugin/src/cua-bridge.ts`
- `apps/zcode-cli/packages/browser-use-plugin/src/mcp/cua-broker.ts`
- `apps/zcode-cli/packages/browser-use-plugin/src/mcp/server.ts`
- `apps/zcode-cli/packages/zcode-cua-plugin/scripts/computer-use-client.mjs`
- `apps/zcode-cli/packages/bootstrap/src/app/built-in-node-repl.ts`
- `docs/cua/2026-08-24-cua-node-repl-sdk-migration-spec.md`