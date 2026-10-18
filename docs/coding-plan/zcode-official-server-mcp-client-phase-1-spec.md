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
- lógica de rollout gradual (灰度) de `/api/v1/client/configs`; na Fase 1 apenas se mantém inalterada a capacidade de rollout existente;
- alterações de UI como página de configurações do MCP, página de configurações de Plugin, exibição de status e guias de login;
- novos registros de usage ou interfaces de capabilities (os endpoints em si já foram implementados pelo backend, ver §12.3);
- emissão de Token de curto prazo. Na Fase 1 `jwt_token` usa o JWT de usuário existente, sem gerar novo Token no cliente;
- publicar o fake MCP junto do instalador oficial.

## 4. Contrato de configuração do Plugin

### 4.1 Exemplo de `.mcp.json`

O formato de configuração do Plugin de teste é o seguinte:

```json
{
  "mcpServers": {
    "fake-official-search": {
      "type": "http",
      "url": "${ZCODE_FAKE_OFFICIAL_MCP_URL}",
      "auth": {
        "type": "zcode_official",
        "provider": "jwt_token"
      },
      "timeoutMs": 30000
    }
  }
}
```

Semântica dos campos:

| Campo | Semântica |
| --- | --- |
| `mcpServers.fake-official-search` | key do MCP dentro do Plugin; serve apenas como identificador de atribuição para resolução de credencial e logs (não participa da autorização, §5.1), sem redeclarar `serverId` |
| `type: "http"` | usa o client MCP Streamable HTTP existente |
| `url` | endpoint do MCP; pode continuar usando a resolução de templates de Plugin existente, mas o resultado precisa passar por validação de Origin |
| `auth.type` | valor exato `zcode_official` (distingue maiúsculas); não aceita apelidos ou variantes de caixa como `zcode-official_auth`, `zcode-official`, `zcode_official_auth`, evitando bifurcação de semântica da configuração |
| `auth.provider` | na Fase 1 só é permitido `jwt_token`; se mais tarde for adicionado um Token de curto prazo, deve-se adicionar um novo provider em vez de mudar a semântica existente desse valor |
| `timeoutMs` | reutiliza o timeout de requisição do protocolo MCP existente |

`auth` fica na definição concreta do MCP, e não no topo de `plugin.json`. Um Plugin pode conter vários MCPs, e cada
MCP pode usar uma URL ou modo de autenticação diferente; uma declaração no nível do Plugin ampliaria incorretamente o escopo de injeção de credenciais.

### 4.2 Tipos

```ts
export interface ZCodeOfficialMcpAuthConfig {
  type: "zcode_official";
  provider: "jwt_token";
}

export interface McpHttpServerConfig extends McpServerConfigBase {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  auth?: ZCodeOfficialMcpAuthConfig;
}
```

Restrições:

- `auth` só pode aparecer em `type: "http"`; quando aparece em stdio/sse, o loader de Plugin reporta
  `plugin_mcp_server_disabled` e desabilita aquele MCP;
  **revisado pela Fase 2**: stdio agora também pode declarar `zcode_official`, e os cabeçalhos de identidade passam pelo
  `_meta` de `tools/call`, ver `zcode-official-server-mcp-stdio-meta-phase-2-spec.md`. `sse` continua rejeitado;
- Na Fase 1 não é permitido configurar `oauth` e `zcode_official` simultaneamente no mesmo MCP; quando ambos aparecem, o loader de Plugin
  reporta `plugin_mcp_server_disabled` e desabilita aquele MCP, sem arbitragem de precedência;
- Quando `zcode_official` é acionado, o fallback implícito de OAuth daquele MCP deve ser **desligado explicitamente**: `authProvider` recebe `undefined`,
  sem criar sessão OAuth e sem subir servidor de callback localhost. Apenas "não escrever o campo `oauth`" não basta para isso,
  pelos motivos do comportamento padrão descrito em §2 e de §6.3;
- A identidade oficial não é provada apenas pela string `auth`. O loader de Plugin ainda gera um provenance de runtime não controlável pelo `.mcp.json`:
  `pluginId`, `mcpKey` original, `source`; eles servem à atribuição em logs e à resolução de credenciais, **mas desde 2026-08 não participam mais do julgamento de confiança** (ver §5.1);
- Portanto, um Plugin de terceiros que copie o mesmo campo `auth` e aponte a url para o origin da API ZCode **de fato consegue obter os cabeçalhos de identidade**.
  Esse é um resultado aceito intencionalmente após a remoção da verificação de marketplace: as credenciais só fluem para o backend ZCode real, e o risco é abuso, não vazamento,
  coberto pelas verificações de direito/cota do lado do servidor. Detalhe no risco residual nº 1 de §5.1.

## 5. Modelo de confiança e mapeamento de Origin

### 5.1 Mapeamento autoritativo

O julgamento de confiança está implementado em `packages/shared/src/official-mcp-auth.ts`
(`isOfficialMcpOriginTrusted` / `createOfficialMcpTrustedOriginRegistry`).

**Regra (a decisão mudou duas vezes; esta é a atual)**:

```text
origin de destino === origin da API ZCode atual (https)
```

**Por que não exigir mais que o pluginId venha do marketplace oficial (mudança de decisão de 2026-08)**: essa verificação existiu como segundo controle
(exigia que o pluginId terminasse com `@zcode-plugins-official`). Há dois motivos para sua remoção:

1. **Ela impedia que o plugin oficial se auto-teste antes da publicação.** O id de um plugin instalado localmente é `official-tools@inline`
   (`plugins.dirs`) ou `official-tools@<marketplace local>`, e nunca obtém o sufixo oficial. E a flag de loopback em dev só libera o loopback http, o que não salva o
   auto-teste apontado para endpoints https reais. O resultado é um deadlock: "para testar o backend real é preciso antes publicar no marketplace oficial";
2. **O cenário que ela defendia já é coberto por outras capacidades.** Se um plugin de terceiros quiser reivindicar credenciais, ele também pode trazer hook /
   command, que é código arbitrário executado com a identidade do usuário e consegue ler diretamente as mesmas credenciais em `~/.zcode`. Portanto essa
   verificação não é uma barreira real de "terceiros não obtêm credenciais".

**Por que não manter mais uma whitelist por mcpKey**: o plugin oficial não é enviado junto de cada versão do app e pode ser atualizado por canais fora de banda.
Manter uma lista de mcpKeys obrigaria que "um MCP novo dentro de uma atualização de plugin" só pudesse ser usado após a próxima versão do cliente, criando atrito real de
publicação; além disso essa lista quase não tem valor defensivo contra adulteração local (o nome está na própria constante, basta copiar). Por isso
`OfficialPluginDefinition` não declara mais `trustedMcpOrigins`, e não existe tabela de domínios canônicos.

**Por que o domínio é resolvido em runtime em vez de fixo no código**: o origin da API ZCode muda conforme o ambiente (production/test,
ambiente self-hosted); fixar o domínio de prod faria todo ambiente não-produtivo falhar fechado. O critério de resolução é o mesmo das tarefas off-peak
(no host, `resolveCurrentZCodeEndpointOrigin`, incluindo override de settings; na CLI, `resolveRuntimeZCodeEndpointOrigin(env)`).

**Por que incluir esse origin na confiança não amplia a superfície de confiança**: o mesmo origin **já** recebe o mesmo lote de credenciais — tarefas off-peak enviam
`authorization` + `x-coding-plan-api-key` (`offPeakServerClient`), e as interfaces de reset/usage do Coding Plan enviam
`authorization` + `x-bigmodel-authorization`, que é exatamente o caminho usado pelo MCP oficial desde 2026-08 (§6.1).
Portanto trata-se de um argumento de equivalência, e não de "domínio oficial, logo confiável".

**Por que ficar em shared e não no bootstrap da CLI**: o julgamento tem dois consumidores em pacotes mutuamente invisíveis — o adapter MCP
(antes do envio da requisição) e o host/services (segunda verificação no limite de autoridade de identidade, dependendo apenas de `@zcode/shared`). Fonte única é um requisito
duro; dois julgamentos divergentes fariam um lado liberar e o outro recusar. O arquivo do lado da CLI apenas encaminha.

**O único controle e os riscos residuais**:

| Controle | O que impede |
| --- | --- |
| igualdade de origin (https, sem username/password) | credenciais serem dirigidas ao servidor de um atacante — **único elemento portante** |

Como sobrou apenas uma barreira, esta verificação deve permanecer estrita: https, rejeição de URLs com credenciais e igualdade caractere a caractere com o resultado resolvido em runtime.

Há cinco riscos residuais, todos conhecidos e aceitos:

1. **Qualquer plugin pode declarar autenticação oficial** (risco novo após a remoção da verificação de marketplace). Um plugin de terceiros basta ter
   `auth.type = zcode_official` e url apontando para o origin da API ZCode para fazer o cliente injetar cabeçalhos de identidade para ele.
   As credenciais só fluem para o backend ZCode real, **o que não configura vazamento**, mas configura abuso: consumir cota e acionar interfaces oficiais com efeito
   colateral usando a identidade do usuário. A mitigação depende do servidor — os endpoints do MCP oficial usam `requireAuth` + `WithCodingPlan`, e o servidor
   continua fazendo verificação de direito e de cota a cada chamada;
2. Um atacante local capaz de escrever no diretório de cache do plugin oficial pode adicionar um MCP ao plugin oficial e obter a injeção de credenciais. Também é abuso, não
   vazamento, e a whitelist por mcpKey já seria inútil nesse cenário;
3. A validação só restringe "quais requisições aprovamos", não o que o agent faz com os bytes depois. Depois que o host devolve os cabeçalhos de identidade ao
   agent, um agent comprometido (em especial o remote anexado ao desktop) pode usá-los por conta própria. Resolver isso por completo exigiria o host fazer as
   requisições por conta própria e as credenciais nunca saírem do host, uma mudança de design bem maior, fora desta fase. Portanto o posicionamento do design atual é
   **defesa em profundidade** (proteger contra bugs do lado do agent e contra código novo que não passe pelo wrapper), e não contra um agent já comprometido.
   A título de correção, uma inferência já escrita de forma errada antes (SG-03): a validação de targetOrigin **não impede "a parte que conhece esse origin"** —
   o agent já o conhece via `ZCODE_BASE_URL`, e o plugin também pode escrevê-lo na configuração. O papel dela é apenas fixar o **destino** das credenciais no origin do ZCode;
4. **Não há confirmação de autorização visível ao usuário.** O plugin declara a autenticação oficial, o host emite os cabeçalhos de identidade, e o usuário não percebe
   nada ao longo de todo o processo. Acrescentar uma confirmação única é uma direção de endurecimento (ver a última parte de `isOfficialMcpOriginTrusted`), é decisão de
   produto e não foi feita;
5. **A granularidade de auditoria chega apenas à "primeira emissão"**. Hoje o host registra uma mensagem de nível info `官方 MCP 身份头已解析` na primeira emissão,
   dentro do processo, para cada (pluginId, mcpKey, workspaceKey) (`firstIssuance: true`); a mesma tripla depois disso continua em debug. Assim é possível responder
   "qual plugin retirou as credenciais", mas não "quantas vezes foram retiradas". Registrar tudo em info causaria um inchaço de logs de ordem de grandeza,
   e não é feito nesta fase.

**Se mais tarde for necessário endurecer de novo**: não restaurar a verificação de sufixo de marketplace (isso causaria o deadlock descrito acima). O caminho correto é dar ao
cenário de dev uma via explícita, ou mudar "o plugin declara autenticação oficial" para exigir uma autorização única visível ao usuário.

### 5.2 Regras de segurança

```text
Configuração MCP do Plugin
      |
      v
auth é exatamente zcode_official/jwt_token? -- não --> caminho MCP normal
      | sim
      v
URL.origin é === o origin da API ZCode resolvido em runtime e é HTTPS? -- não --> falha fechada
      |                                                        (official_mcp_origin_untrusted)
      | sim
      v
Solicita ao host os cabeçalhos de identidade atuais --> injeção dinâmica nesta requisição HTTP
```

O julgamento não contém mais os passos "é um plugin do marketplace oficial" e "(pluginId, mcpKey) atinge o mapeamento confiável";
pluginId / mcpKey continuam acompanhando a requisição, mas servem apenas à atribuição em logs e de credencial.

O julgamento da forma stdio tem entradas diferentes (não há URL para validar; o targetOrigin é resolvido pelo próprio cliente), ver
`zcode-official-server-mcp-stdio-meta-phase-2-spec.md` §5.

- O julgamento formal só aceita `https:` e rejeita username/password na URL;
- Testes unitários/integrados, via injeção de dependência, acrescentam `http://127.0.0.1:<porta-efêmera>`; o auto-teste local registra explicitamente o origin loopback
  em `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS`; nenhum dos dois pode liberar hosts não-loopback;
- fetch autenticado usa `redirect: "manual"`. Na Fase 1, um 3xx falha imediatamente, evitando que o Bearer Token seja levado por um redirect de outro origin;
  o endpoint formal deve ser configurado como URL canônica;
- Os `headers` estáticos do Plugin não podem conter (sem distinção de caixa) nenhum cabeçalho reservado: `authorization`,
  `x-coding-plan-api-key`、`x-bigmodel-authorization`、`bigmodel-target-type`、
  `bigmodel-organization`、`bigmodel-project`, nem os cabeçalhos de protocolo `mcp-session-id`、
  `mcp-protocol-version`; na análise o MCP é desabilitado diretamente, sem sobrescrita silenciosa. O motivo de os cabeçalhos de protocolo irem para a lista está
  em §2: na montagem do SDK, `requestInit.headers` tem prioridade sobre os cabeçalhos de protocolo, e a config estática pode sobrescrever o session id;
- A lista de cabeçalhos reservados e o conjunto realmente injetado em §6.1 devem ter a mesma fonte: a constante fica em `packages/shared` e é referenciada tanto pelo parser de
  Plugin quanto pelo adapter MCP, de modo que adicionar um cabeçalho de identidade exige mudar um único lugar; a imposição também é reaplicada no ponto de merge do fetch
  wrapper de §6.3.2, e não apenas na fase de análise;
- Os logs registram apenas `pluginId`, `mcpKey`, Origin, classificação de falha, status HTTP e request/trace id; é proibido registrar JWT, Coding Plan key,
  cabeçalhos completos ou impressões digitais de credencial;
- **Critério de conciliação do request id do servidor**: o cliente não envia `X-Request-Id` / `X-Trace-Id` (o servidor gera o seu próprio via `logx.RequestID()` e não adota
  o valor de entrada), lendo de volta apenas `x-request-id` dos **cabeçalhos de resposta**, como única chave de ligação entre o log do cliente e o log do servidor. Portanto:
  - respostas bem-sucedidas são registradas em `debug` (alta frequência e, em caso de sucesso, não é preciso conciliar);
  - **qualquer resposta não-2xx deve ser registrada em `warn`**, com campos incluindo `httpStatus` e `serverRequestId`. A razão é que o logger das builds de produção tem
    nível mínimo `Info` (`getDefaultMinLevel`), e registrar apenas em debug equivale a não ter esse id no momento do erro;
  - os erros classificados de §6.3.3 (401 / 403 / 3xx) anexam esse id à mensagem, para que ele fique visível junto do motivo de falha do record MCP, e não apenas no log;
  - **falhas in-band (HTTP 200 + `isError: true`, como cota esgotada) também devem carregar esse id**. Para a camada HTTP trata-se de sucesso, e portanto não são cobertas pelo
    warn de não-2xx acima; além disso, somente o fetch wrapper enxerga os cabeçalhos de resposta (acima dele está o SDK MCP, que entrega apenas o resultado JSON-RPC). Por isso o
    wrapper reporta o id ao adapter por callback, e o adapter o correlaciona ao `tools/call` desta chamada pelo **span**: escreve um warn de `mcp.tool.call` e anexa
    `zcode/officialMcpServerRequestId` no `_meta` do resultado (sem isso no caminho de sucesso, para não inflar cada chamada com campos de diagnóstico).
  - A chave de ligação precisa ser o span e não o traceId: o traceId cobre toda a sessão de topo e é compartilhado por várias chamadas da mesma sessão, o que geraria mistura de registros. Quando não há
    span (`initialize` / `tools/list` não têm `_meta`, ou o chamador não passou trace), esse campo **não é preenchido**, e jamais se usa "a última resposta" como fallback — isso
    colaria o id de uma chamada anterior nesta falha, o que é pior do que não ter nada.