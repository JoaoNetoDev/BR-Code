# Integração do cliente MCP do Server oficial do ZCode (Fase 1, Decision Log histórico)

> Os fatos unificados da implementação atual estão em `zcode-official-server-mcp-auth-spec.md`. Este documento preserva o design por fases e a evolução das decisões,
> e não deve mais ser usado como base direta de implementação para cabeçalhos de autenticação, escopos, cota ou comportamento de UI.

> Data: 2026-08-14 (implementação concluída em 2026-08-15)  
> Status: implementado (lado do cliente; backend pendente de desenvolvimento, ver §12)  
> Escopo: cliente/runtime Agent do ZCode; sem alteração de UI, sem alteração do backend MCP oficial, sem submeter capacidades fake ao diretório de release oficial

## 1. Objetivo

Na Fase 1, permitir que o ZCode carregue um MCP remoto Streamable HTTP a partir de um Plugin oficial e, antes de cada requisição HTTP real,
injete no Origin oficial confiável os cabeçalhos de identidade Coding Plan do usuário atual.

Esta fase entrega as seguintes capacidades:

1. Um único MCP HTTP de um Plugin pode declarar `zcode_official`;
2. O provider `jwt_token` usa o JWT do usuário ZCode atual como Bearer Token; `X-Bigmodel-Authorization` só é anexado quando existe um Coding Plan Provider válido no Registry e o JWT MaaS está disponível, e `Bigmodel-Target-Type` é anexado conforme o `wireScope` correspondente, assim como organization/project do Team (o conjunto completo de cabeçalhos e a exceção identity-only estão em §6.1);
3. O transport MCP só pode obter e injetar cabeçalhos de identidade quando o Origin de destino for igual ao origin da API ZCode atual
   (esta cláusula exigia inicialmente que "identidade de Plugin oficial + MCP key dentro do Plugin + Origin exato" acertassem o mapeamento confiável do host ao mesmo tempo,
   convergindo em 2026-08 para validar apenas o Origin; o raciocínio e os riscos residuais estão em §5.1);
4. Adicionar um Plugin oficial fake e um servidor HTTP MCP fake para testes, cobrindo a resolução do plugin, o julgamento de confiança e os
   cabeçalhos reais das requisições MCP `initialize` / `tools/list` / `tools/call`;
5. Não adicionar nem modificar nenhuma página de UI, componente, store, texto, i18n ou configuração.

`serverId` e `capabilityId` não fazem parte desta solução. A key de `mcpServers` dentro do Plugin já é a identidade do MCP sob aquele Plugin;
em runtime continua sendo usado o namespace existente `plugin:<pluginName>:<mcpKey>` para evitar sobrescrita por Plugins homônimos.

## 2. Fatos atuais do código

| Fato atual | Localização no código | Conclusão desta fase |
| --- | --- | --- |
| A config de runtime do MCP já suporta `stdio`, `http`, `sse`; hoje HTTP só tem `headers` / `oauth` | `apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts` | Estender apenas a declaração de autenticação oficial na config HTTP, sem novo transport MCP |
| O loader de Plugin projeta a key MCP do `.mcp.json` como `plugin:<pluginName>:<mcpKey>`, mas hoje descarta o campo `auth` desconhecido | `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts` | Analisar `zcode_official` estritamente na fronteira de resolução do Plugin, preservando o provenance gerado pelo host |
| O transport Streamable HTTP envia requisições via `createMcpTransportFetch(...)`, e cabeçalhos estáticos entram em `requestInit` | `apps/zcode-cli/packages/adapters/src/mcp/index.ts`、`network.ts` | Cabeçalhos de identidade sensíveis devem ser injetados por um fetch wrapper dinâmico, nunca gravados de volta na config nem mantidos por muito tempo no `requestInit` |
| **`http`/`sse` MCP sem campo `oauth` e sem `authorization` nos `headers` estáticos recebem por padrão `{type:"authorization_code"}`**, criando então sessão OAuth, subindo um servidor de callback localhost e entregando `authProvider` ao transport | `resolveAuthorizationCodeOAuthConfig` / `hasAuthorizationHeader` em `adapters/src/mcp/index.ts`; construção do transport no ramo HTTP do mesmo arquivo | `zcode_official` deve sair explicitamente desse caminho padrão (§6.3). Esta solução proíbe `authorization` estático sem `oauth`; sem desligamento explícito, o MCP oficial cairia inevitavelmente em OAuth implícito |
| Quando há `authProvider`, o SDK converte 401/403 em fluxo de reautorização OAuth e, via `onAuthorizationRequired`, escreve a authorizationUrl no status do record MCP | Ramos 401/403 do client `streamableHttp` do `@modelcontextprotocol/sdk`; `redirectToAuthorization` em `adapters/src/mcp/oauth.ts`; `createAuthorizationCodeOAuthOptions` em `adapters/src/mcp/index.ts` | Conflita com o objetivo de "autenticação automática sem UI". `zcode_official` precisa de semântica própria de 401/403 (§6.3), sem disparar URL de autorização nem navegador |
| Ao montar os cabeçalhos, o SDK dá prioridade a `requestInit.headers` sobre o `Authorization` escrito pelo `authProvider`, e consegue sobrescrever `mcp-session-id` / `mcp-protocol-version` | `_commonHeaders()` do client `streamableHttp` do SDK | A lista de cabeçalhos reservados precisa cobrir os cabeçalhos de protocolo, e a injeção dos cabeçalhos de identidade deve ocorrer no fetch wrapper final (§6.3) |
| O JWT do Coding Plan selecionado, a API Key e o organization/project do Team já podem ser resolvidos num mesmo snapshot de credencial | `packages/services/src/session/offPeakRuntimeModel.ts` | **Servir apenas de referência lógica, sem reutilizar e sem modificar** (§6.1.1). O MCP oficial terá uma implementação equivalente separada, evitando acoplamento com o Off-Peak |
| A identidade, a versão e a raiz de empacotamento embutidas do Plugin oficial são geridas pelo manifesto do Bootstrap | `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` | Esse manifesto **não participa** da autorização do MCP oficial (§5.1 removeu o mapa); a URL declarada pelo Plugin continua não confiável, mas a validação se baseia no origin da API ZCode resolvido em runtime |

Este levantamento usou o código estático do workspace atual e evidências de `rg`; o ambiente atual não fornece índice de codegraph, portanto
relações indiretas não verificadas não foram tratadas como fatos de produto.

## 3. Escopo e não objetivos

### 3.1 Dentro do escopo

- MCP `http` / Streamable HTTP;
- declaração do tipo de autenticação por MCP nos Plugins oficiais;
- resolução pelo host/serviço da identidade Coding Plan atual;
- requisição/resposta de autenticação automática sem UI no protocolo do Agent;
- injeção dinâmica de headers e validação de Origin no transport HTTP do MCP;
- testes direcionados de adapter/bootstrap/service com fake Plugin + fake HTTP MCP.

### 3.2 Fora do escopo

- `zcode_official` para MCP `stdio` e `sse`;
- **direito de chamada de ferramentas do usuário do Start Plan**. A chamada de ferramentas do Server MCP oficial continua sendo direito exclusivo do Coding Plan;
  o Start Plan tem apenas o JWT do ZCode, sem Coding Plan Provider utilizável. O modo API Key ou a ausência de um Coding Plan Provider válido no Registry também seguem a mesma semântica identity-only: as requisições de conexão/descoberta carregam apenas o JWT do ZCode, sem JWT MaaS, deixando o servidor distinguir erro de sessão de login e de erro de plano (`1006` / `3101`);
- implementação de ferramentas do backend MCP oficial, cobrança, limitação de taxa e design das interfaces de negócio;
- lógica de灰度 (rollout gradual) de `/api/v1/client/configs`; na Fase 1 apenas se mantém inalterada a capacidade de rollout existente;
- alterações de UI como página de configurações do MCP, página de configurações de Plugin, exibição de status e guias de login;
- novos registros de usage ou interfaces de capabilities (os endpoints em si já foram implementados pelo backend, ver §12.3);
- emissão de Token de curto prazo. Na Fase 1 `jwt_token` usa o JWT de usuário existente, sem gerar novo Token no cliente;
- publicar o fake MCP junto do instalador oficial.