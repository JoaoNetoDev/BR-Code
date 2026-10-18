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

## 6. Cabeçalhos de autenticação e atribuição de credenciais

### 6.1 Cabeçalhos de `jwt_token`

Para cada requisição HTTP de um MCP confiável, são gerados dinamicamente:

```http
Authorization: Bearer <current-zcode-jwt>        # validado pelo requireAuth do servidor, sempre enviado
X-Bigmodel-Authorization: Bearer <current-family-maas-jwt>   # enviado apenas quando há Coding Plan Provider válido + JWT MaaS disponível
Bigmodel-Target-Type: PERSONAL | TEAM            # enviado apenas quando existe o wire scope correspondente
Bigmodel-Organization: <organization-id>         # apenas TEAM, e junto com project
Bigmodel-Project: <project-id>                   # apenas TEAM, e junto com organization
```

Base do contrato do servidor (conferida com o código atual de `zcode-server`): o middleware `WithCodingPlan` lê os cinco cabeçalhos
`X-Coding-Plan-Api-Key`、`X-Bigmodel-Authorization`、`Bigmodel-Organization`、`Bigmodel-Project`、
`Bigmodel-Target-Type`, enquanto o `Authorization` do JWT é lido separadamente por `requireAuth`. Pontos principais:

- **`Bigmodel-Target-Type` só é enviado quando existe o `wireScope` correspondente**, com valor `PERSONAL` / `TEAM`.
  Para BigModel Personal/Team, os wire scopes são PERSONAL/TEAM; o wire scope do ZAI Team é `null`, e portanto esse cabeçalho não é enviado,
  caindo no branch de fallback do servidor. Para requisições identity-only (Start Plan, modo API Key ou Registry sem Coding Plan Provider válido), o cabeçalho
  também não é enviado; essas requisições carregam apenas o JWT do ZCode. Quando o cabeçalho é enviado como TEAM, organization e project devem existir em par;
  se faltar qualquer um, nenhum dos dois é enviado.
- `CodingPlanContext.Valid()` no servidor exige, quando `TargetType=TEAM`, que organization e project estejam ambos não vazios.
  Portanto o cliente também respeita a atomicidade do par: se faltar qualquer um, nenhum é enviado; enviar metade do conjunto de cabeçalhos de identidade seria
  julgado diretamente como bad request;
- **Canal de credencial (mudança de 2026-08; esta cláusula substitui a decisão da Fase 1)**: no servidor, `X-Bigmodel-Authorization` e
  `X-Coding-Plan-Api-Key` são canais **mutuamente exclusivos** (`credential := cmp.Or(Authorization, APIKey)`, com Authorization prioritário). A decisão da Fase 1 era "manter `X-Coding-Plan-Api-Key` e não enviar o JWT MaaS", registrando a troca como dívida técnica; após a confirmação do
  backend (`middleware/coding_plan.go` já comenta o canal de API Key como "apenas compatibilidade com clientes legados; novas integrações devem usar o cabeçalho de
  JWT MaaS"), o MCP oficial passa a enviar **somente `X-Bigmodel-Authorization`** quando a credencial de plano está disponível. Requisições identity-only
  continuam enviando apenas o JWT do ZCode. Três pontos:
  - **É troca de credencial, não apenas de nome de cabeçalho.** O novo cabeçalho precisa conter o **JWT de login MaaS**
    (`oauth:<family>:access_token`, o mesmo usado pelas interfaces de reset/usage do Coding Plan); o servidor faz
    `ParseWithoutVerification` para extrair o `customer_id` e exige que ele corresponda ao usuário atual. Colocar a chave de negócio do Coding Plan
    no novo cabeçalho falharia na análise;
  - **Os dois cabeçalhos não podem ser enviados juntos.** O JWT vence na vinculação à ZAI e na consulta de cota, mas a validação de titularidade da API key
    (`validateIdentityFromApiKey`) continua rodando uma vez; uma key expirada ou pertencente a outra pessoa faria a requisição inteira retornar 403/3101.
    Portanto trata-se de substituição, não de acúmulo;
  - **O valor leva o prefixo `Bearer `.** O servidor usa `strings.CutPrefix(..., "Bearer ")`, e também aceita token cru;
    aqui enviamos na forma especificada por `zcode-server/docs/api_server_mcp.md`.
    Off-Peak e o model relay continuam usando `X-Coding-Plan-Api-Key` (família de interface e contrato de servidor diferentes), e isso não é alterado de propósito;
- Os nomes de cabeçalho não diferenciam maiúsculas (o servidor normaliza via `textproto` no `GetHeader` do Gin), e basta enviar conforme o bloco http acima,
  sem adaptação específica por caixa.

#### 6.1.1 Implementação independente, sem reutilizar o código de Off-Peak (decisão desta fase)

A resolução de credenciais e a construção dos cabeçalhos de identidade do MCP oficial são **um conjunto separado**, equivalente à lógica de Off-Peak mas com
código independente:

- **Não reutiliza** funções de Off-Peak como `resolveOffPeakCredentials(...)`、`buildOffPeakPlanIdentityHeaders(...)`、
  `resolveSelectedOffPeakCodingPlan(...)`, nem as transforma em helpers compartilhados;
- **Não modifica** nenhuma exportação ou comportamento existente de `packages/services/src/session/offPeakRuntimeModel.ts`:
  a cadeia de Off-Peak fica com zero alterações e zero risco de regressão;
- Recomenda-se que a nova implementação fique em um local próprio (por exemplo `officialMcpCredentials.ts` /
  `officialMcpAuthHeaders.ts` sob `packages/services/src/official-mcp/`), sem nomes de negócio de Off-Peak.

Razão: as regras de julgamento dos dois são **atualmente iguais, mas se espera que se separem no futuro** — o limiar de plano do MCP oficial, o escopo de suporte a
Team e o canal de credencial (a dívida técnica `X-Bigmodel-Authorization` de §6.1) podem evoluir de forma independente. Um helper compartilhado transformaria qualquer
ajuste de um dos lados numa mudança que exige avaliar o impacto nos dois; o custo de duplicação de duas implementações é muito menor que o custo do acoplamento.

O custo é ter duas implementações das mesmas regras, e a consistência precisa ser protegida por testes: OMCP-021 de §8.2 cobre o mapeamento completo de credential kind para cabeçalhos,
e OMCP-025 protege a ausência de regressão em Off-Peak. Havendo divergência de comportamento entre as duas implementações, vale o §6.1 deste spec, e não o estado atual de Off-Peak.

Quatro características da implementação atual de Off-Peak precisam ser **replicadas em semântica, mas codificadas de forma independente** na nova implementação:

1. **`Bigmodel-Target-Type` hoje não tem nenhum produtor**, ou seja, é uma capacidade nova (mapeada por credential kind);
2. **`zai-team` permanece consistente com Off-Peak (decisão desta fase)**: o `buildOffPeakPlanIdentityHeaders` de Off-Peak retorna um objeto vazio
   antecipadamente quando `kind !== "bigmodel-team"`, e portanto `zai-team` não envia organization/project — ainda que o `resolveSelectedOffPeakCodingPlan`
   já tenha resolvido esses dois valores. A nova implementação adota esse comportamento. **Restrição correspondente**: como
   `CodingPlanContext.Valid()` no servidor exige organization e project não vazios quando `TargetType=TEAM`, `zai-team` também **não pode** enviar
   `Bigmodel-Target-Type: TEAM` (seria julgado como bad request). Portanto `zai-team` não envia `Bigmodel-Target-Type`, cai no branch de fallback do servidor
   e herda o mesmo risco conhecido de Off-Peak (esse branch consulta PERSONAL/TEAM em paralelo, e a falha de qualquer um delas derruba a operação inteira).
   Assim, o `Bigmodel-Target-Type` de §6.1 não é enviado incondicionalmente: ZAI Team e todos os snapshots identity-only não enviam esse cabeçalho. Se mais tarde
   for preciso suportar o wire scope exato do ZAI Team, basta liberá-lo isoladamente no lado do MCP oficial, sem alteração sincronizada em Off-Peak;
3. **A verificação de consistência de credencial anti-corrida deve ser preservada e precisa cobrir todos os caminhos identity-only**: a cada rodada lê-se primeiro o
   snapshot de identidade formado por `providerFamilyDomain`, impressão digital da conexão selecionada, `oauth:active_provider` e `zcodejwttoken`;
   antes de devolver credencial apenas de identidade ou credencial Coding Plan completa, lê-se novamente. Se qualquer campo divergir entre as leituras, a rodada
   inteira é refeita; se ainda assim não estabilizar em duas rodadas, retorna `official_auth_unavailable`. O caminho de credencial completa também precisa incluir o
   JWT MaaS da family atual na mesma verificação de consistência da rodada. Isso bloqueia tanto a mistura entre families quanto a rotação de token na mesma family; o JWT
   em claro é comparado apenas em memória, sem ir para logs nem mensagens de erro;
4. **Credencial mock não pode ser habilitada por padrão**: o `resolveOffPeakCredentials` de Off-Peak devolve JWT/Key placeholders quando `ZCODE_OFFPEAK_MOCK=1`
   e não foi passado explicitamente `allowMockCredentials: false`. A nova implementação **não deve introduzir esse branch mock**;
   o MCP oficial não tem gateway mock correspondente, e os testes basta substituírem a origem da credencial por injeção de dependência. Se for realmente necessário manter
   a flag, ela deve ser desligada por padrão e usar uma variável de ambiente própria, sem reutilizar `ZCODE_OFFPEAK_MOCK`.

A restrição de plano do Start Plan é **codificada explicitamente na nova implementação** (e não por herança de Off-Peak): quando a conexão selecionada é Start Plan,
retorna `official_auth_plan_required`, mas ainda permite que as requisições de conexão/descoberta enviem o JWT do ZCode apenas de identidade. Não reutilizar as
strings de reason de Off-Peak como `start_plan_not_supported`; se a chamada de ferramenta é liberada ou não é decidido pela verificação de plano do servidor.

Autenticação de identidade e credencial de plano são duas dimensões independentes. Quando o Coding Plan está selecionado, mas o Registry filtrou todos os Providers sem
direito, essa situação precisa ser reconhecida **antes** de exigir o JWT MaaS, devolvendo um snapshot identity-only contendo apenas o JWT do ZCode; não se pode rebaixar para
anônimo uma requisição já autenticada só porque o JWT MaaS está ausente. No snapshot identity-only, `planScope` / `wireScope` são ambos `null` e não há
`codingPlanAuthorization`.

### 6.2 Owner do estado

- fonte autoritativa do JWT: a identidade de login ZCode atual no `credentialService` do host;
- fonte autoritativa do estado de seleção do Coding Plan, do JWT MaaS e do contexto de Team: os settings atuais do host, o credentialService e o mesmo
  snapshot do registry de providers; a chave de negócio não é credencial de saída do MCP oficial;
- a config do Plugin apenas declara "de que tipo de autenticação precisa"; não guarda, não gera e não renova credenciais;
- o Agent/adapter MCP consome apenas os headers necessários à requisição em curso e não grava headers em `McpServerConfig`, snapshot de Session,
  cache de Plugin ou logs.

A resolução dos cabeçalhos de identidade não pode ser adiada até o momento em que o modelo realmente emite `tools/call`: antes de chamar ferramentas, o MCP precisa
completar `initialize` e `tools/list`, e essas duas requisições também exigem autenticação. Portanto a resolução acontece **antes do envio de cada requisição HTTP do MCP**,
cobrindo `initialize`、`tools/list`、`tools/call` e as requisições de protocolo posteriores.

#### 6.2.1 Deduplicação in-flight é permitida; cache por tempo é proibido

O custo de resolver uma vez por requisição não é baixo: uma resolução inclui ida e volta entre processos, duas leituras de settings (comparando a impressão digital antes e
depois para evitar que a conexão seja trocada durante a leitura), um snapshot do registry de providers e uma nova resolução quando a impressão digital não bate. E a frequência
de chamadas do MCP é de uma por requisição de protocolo — um agent loop chamando N ferramentas em sequência são N resoluções, todas no caminho crítico de espera do usuário.

Por isso a Fase 1 permite, e apenas permite, **deduplicação in-flight**:

- Se, no mesmo instante, já há uma resolução em andamento, as requisições seguintes reutilizam a mesma Promise pendente, sem disparar outra;
- Assim que essa Promise é concluída, ela é **descartada imediatamente**, e a próxima requisição resolve tudo de novo;
- Nenhum cache por dimensão de tempo (sem cache de N segundos, sem permanência por Plugin/conexão, sem escrita em nenhuma camada persistente).

A segurança não muda: apenas requisições realmente concorrentes compartilham o resultado, e requisições concorrentes já deveriam ver o mesmo snapshot de credenciais; nenhuma requisição
lê credenciais antigas já substituídas. Isso é um mecanismo diferente de "cachear por alguns segundos", que tem janela de expiração e que esta fase explicitamente não adota.

O único critério de deduplicação é: existe uma resolução em andamento neste momento. O escopo é **global do host**, sem particionamento por `pluginId` /
`mcpKey` / `targetOrigin` / workspace — a credencial é estado global do host (§7.1), e neste mesmo instante requisições de Plugins, MCPs e workspaces diferentes já deveriam
receber a mesma credencial. Particionar por dimensão só enfraqueceria a deduplicação, sem aumentar o isolamento.

### 6.3 Isolamento do OAuth e semântica própria de falha de autenticação de `zcode_official`

`zcode_official` e o OAuth do MCP são dois caminhos de autenticação mutuamente exclusivos. A falha de autenticação oficial é um **problema de identidade/plano do usuário**,
que só pode ser resolvido pelo próprio login do ZCode e pela seleção de Coding Plan, e jamais pela autorização OAuth do MCP de destino; entregar um 401 ao OAuth
apresentaria "faça login novamente no ZCode" de forma enganosa como "autorize este MCP".

#### 6.3.1 O fallback implícito de OAuth deve ser desligado

Como registrado em §2, um MCP `http`/`sse` sem o campo `oauth` recebe **por padrão** `{type:"authorization_code"}`, e sua única saída é a existência de
`authorization` nos `headers` estáticos — e §5.2 exatamente proíbe esse cabeçalho estático. Portanto esta solução precisa de um novo curto-circuito
antes dos branches na resolução da config de OAuth:

```text
resolveAuthorizationCodeOAuthConfig(config):
  if auth?.type === "zcode_official" -> return undefined   # novo, antes de todos os branches existentes
  ...branches existentes permanecem inalterados
```

Daí resultam os requisitos rígidos:

- `authProvider` deve ser `undefined`; nenhuma sessão OAuth pode ser criada e nenhum servidor de callback localhost pode ser subido;
- não escrever o campo `authorization` no status do record MCP, não chamar `onAuthorizationRequired`,
  não chamar `openAuthorizationUrl`;
- o comportamento padrão de MCP normal e de MCP com `oauth` explícito permanece completamente inalterado — este curto-circuito vale só para `zcode_official`.

#### 6.3.2 A injeção dos cabeçalhos de identidade deve ser a última etapa e com semântica de sobrescrita

Os cabeçalhos de identidade só podem ser injetados dentro do `fetch` passado ao transport (isto é, o wrapper que envolve `createMcpTransportFetch(...)`), que é a
única saída depois que o SDK montou `_commonHeaders()` e `requestInit`.

- Para cada cabeçalho de identidade de §6.1 use semântica de **sobrescrita** (`set`); é proibido `append` e é proibido o "só completa se faltar". `append` produziria
  um `Authorization` com múltiplos valores concatenados por vírgula, e o "só completa se faltar" deixaria sobreviver um valor preexistente indesejado;
- o wrapper não pode modificar `mcp-session-id`、`mcp-protocol-version`, nem remover o `accept` / `content-type` definidos pelo SDK.

#### 6.3.3 Classificação de falhas e tratamento das respostas

As requisições MCP de `zcode_official` são tratadas conforme a tabela abaixo; quando faltam credenciais, não há fallback para OAuth nem leitura de variáveis de ambiente
para adivinhar credenciais:

> Esta tabela se aplica a `type:"http"`. A semântica de falha da forma stdio é **intencionalmente diferente** (entrega `{ok:false, reason}` em vez de
> marcar como failed, porque um plugin que não consegue obter os cabeçalhos nem chega a chamar o endpoint oficial, logo não existe requisição anônima), ver
> `zcode-official-server-mcp-stdio-meta-phase-2-spec.md` §6.3.

| Situação | Classificação | Comportamento |
| --- | --- | --- |
| host auth port indisponível (ex.: CLI standalone) | `official_auth_unavailable` | conexão marcada como failed, sem enviar requisição alguma |
| Não autenticado, ou sem provider family / conexão selecionada no momento | `official_auth_unavailable` | conexão marcada como failed, sem enviar requisição alguma |
| Autenticado, mas com Start Plan, modo API Key, ou o Coding Plan Provider selecionado foi removido do Registry | `official_auth_plan_required` | as requisições de conexão/descoberta enviam apenas o JWT do ZCode, sem JWT MaaS nem cabeçalhos de scope; o direito de plano para chamada de ferramentas continua sendo avaliado pelo servidor |
| Falha na validação de Origin/provenance (validação local do adapter) | `official_mcp_origin_untrusted` | conexão marcada como failed, com 0 requisições de rede |
| Segunda validação de Origin no host não confere | `official_mcp_origin_untrusted` | o host rejeita antes de ler credenciais, com `resolveHeaders` nunca chamado; do lado do agent, marcado como failed |
| 401 do backend | `official_auth_rejected` | tenta uma vez conforme as regras abaixo; se continuar 401, marca como failed |
| 403 do backend | `official_auth_forbidden` | sem nova tentativa, marca como failed. 403 significa identidade válida, mas sem permissão/plano insuficiente; obter de novo a mesma credencial não mudaria o resultado |
| 3xx do backend | `official_auth_redirect_blocked` | não segue o redirect, marca como failed (§5.2 `redirect: "manual"`) |

`official_auth_plan_required` precisa ser uma classificação independente, sem reutilizar as reasons de Off-Peak como
`start_plan_not_supported`, e sem ser fundido em `official_auth_unavailable` — esta última representa "falta de ambiente/sessão de login", e a outra representa
"nível de plano não atendido"; as ações subsequentes são diferentes (relogin vs. upgrade de plano) e precisam chegar de forma distinguível ao record status e aos logs. Na Fase 1,
a manifestação visível ao usuário das duas é apenas o MCP estar failed, sem nenhum guia.

Regras de nova tentativa para 401 (o único caminho de retry permitido):

- resolve os cabeçalhos de identidade novamente e tenta de novo, **no máximo uma vez**, sem condição (sem comparar se a credencial mudou);
- se a nova tentativa ainda der 401 → marca como failed, classificação `official_auth_rejected`; o limite rígido de tentativas é 1, sem possibilidade de laço;
- essa nova tentativa vale apenas para `zcode_official` e não altera o comportamento de 401 já existente de MCP normal e MCP OAuth.

A razão de tentar sem condição, em vez de decidir "só tento de novo se a credencial mudou": os cabeçalhos de identidade são resolvidos a cada requisição (§6.2), e num 401 a
credencial foi obtida milissegundos antes; a única corrida estreita que a repetição poderia curar é "a credencial foi justamente renovada depois de o pedido ter sido enviado".
Introduzir detecção de mudança de credencial entre processos por causa disso não compensa; e uma conexão que dá 401 continuamente já é marcada como failed na etapa de `initialize`,
sendo o custo da repetição sem condição apenas um pedido extra por tentativa de conexão.

Essas classificações só entram no status do record MCP e nos logs (com os campos de log restringidos por §5.2). A Fase 1 **não** mostra nenhum guia de login, prompt de autorização
ou outra UI por causa delas; `packages/ui` permanece sem nenhuma alteração. A manifestação visível ao usuário é simplesmente o MCP estar failed,
igual à renderização de estados de falha já existente.

#### 6.3.4 O fluxo GET SSE não é habilitado na Fase 1

O MCP com `zcode_official` **não habilita** o stream de server push GET `text/event-stream` do SDK.

O motivo: os cabeçalhos desse stream são calculados uma única vez no instante da abertura, e depois a conexão fica pendurada por muito tempo, sem uma "próxima requisição" para
reinjetar cabeçalhos. Se fosse habilitado, a exigência de §11 de "não reutilizar header antigo após trocar a identidade de login ou a conexão Coding Plan" não se sustentaria
para esse stream, o que deixaria uma conexão longa retendo credenciais vencidas.

Acordos de implementação com o backend (conferidos com o comportamento real do SDK):

- Esse stream GET **não** é aberto no `start()`. O gatilho no SDK é: depois que o cliente envia `notifications/initialized`, **se o servidor responde a essa notificação com
  202 Accepted**, o SDK abre o fluxo GET; os outros dois gatilhos (`send` recebendo `resumptionToken` e o método público `resumeStream(...)`) não são chamados por esta solução;
- Portanto, a forma de concretização de "não habilitar" é: o servidor responde ao GET desse endpoint com **qualquer coisa não-2xx**, e o SDK trata isso como "o servidor não suporta
  push" e retorna normalmente, sem repetir e sem erro. O cliente emite exatamente um GET de sondagem (com os cabeçalhos de identidade normais), o que é um custo fixo aceitável;
- Situação medida: a documentação de `StreamableHTTPOptions{Stateless: true}` do go-sdk declara 405 para GET/DELETE, mas o gin registra apenas POST para esse caminho
  (`router.go`), então o GET sequer chega ao handler e o retorno real é **404**. É equivalente para o comportamento do SDK, sem necessidade de mudança no backend;
- Reforço opcional: o fetch wrapper pode locally fazer curto-circuito do GET para esse Origin e sintetizar uma resposta 405, sem nem enviar a sondagem.
  Não é obrigatório na Fase 1, mas, se adotado, precisa garantir um caminho de tratamento idêntico ao de um 405 real;
- Portanto, na Fase 1, o MCP oficial tem apenas semântica de requisição/resposta client→server, sem push ativo server→client.

Se mais tarde for habilitado o push, três coisas precisam ser preenchidas juntas, e não basta o servidor passar a suportar GET: GET SSE no servidor com eventos contendo `id:`
(caso contrário a recuperação por `Last-Event-ID` seria inútil e uma queda de stream perderia eventos), detecção de mudança de credencial e mecanismo de troca de stream no cliente,
e ajuste de `reconnectionOptions` (o padrão do SDK, `maxRetries: 2`, é baixo demais para conexões longas). Dentre elas, o `id:` dos eventos do servidor é
preferível já na primeira versão do backend — corrigir depois é uma alteração de camada de protocolo, mais cara do que fazer no cliente.

## 7. Fronteira de implementação no cliente

### 7.1 Nova porta

O adapter MCP não depende diretamente de `packages/services`; consome os cabeçalhos de identidade por injeção de dependência:

```ts
type OfficialMcpAuthFailureReason =
  | "official_auth_unavailable"
  | "official_auth_plan_required";

type OfficialMcpAuthHeadersResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; reason: OfficialMcpAuthFailureReason };

interface OfficialMcpAuthHeadersPort {
  resolveHeaders(input: {
    pluginId: string;
    mcpKey: string;
    targetOrigin: string;
    workspaceIdentity?: string;
    workspacePath?: string;
    signal?: AbortSignal;
  }): Promise<OfficialMcpAuthHeadersResult>;
}
```

Pontos do contrato:

- **Falha via valor de retorno e não por exceção**, retornando a classificação definida em §6.3.3; o adapter não pode extrair a causa da falha do texto de erro.
  Erros de rede (401/403/3xx) não são responsabilidade desta porta; o adapter os classifica sozinho ao receber a resposta;
- `workspaceIdentity` / `workspacePath` são usados **apenas para contexto de requisição e auditoria, sem participar da escolha de credencial**. A fonte autoritativa da
  credencial é a identidade de login e os app settings globais do host, sem isolamento por workspace — não implemente identidade por workspace com base nisto.
  Também **não são usados para roteamento**: a resposta volta pela `client.respond(request.id, ...)` para a própria conexão stdio que originou a requisição, e o
  roteamento é determinado pela própria conexão. Ainda assim a porta deve respeitar a convenção do repositório
  `workspaceKey = workspaceIdentity?.trim() || workspacePath` e repassar a identity por completo (revisão de CR, CR-01),
  caso contrário workspaces remotos com o mesmo caminho e identidades diferentes ficam indistinguíveis no contexto de auditoria.
  **Lacuna restante**: o processo do agent da CLI hoje não tem fonte de workspaceIdentity
  (`RunZCodeProtocolAgentOptions` só tem cwd/env/… e não há variável de ambiente correspondente), logo esse campo na prática degenera em
  workspacePath. O que a porta garante é "repassa corretamente a identity quando ela existe", e não "a identity sempre existe";
  se a auditoria precisar da identidade remota real, é preciso passar a identity ao agent no spawn ou na camada de protocolo, fora do escopo desta fase;
- `pluginId` / `mcpKey` / `targetOrigin` são usados para a **segunda validação no host** e para logs, sem participar da escolha de credencial.
  Essa validação já está implementada no host (revisão de CR, CR-01): o handler de `zcodeAgentService` valida a tripla com o mesmo registry shared
  **antes** de chamar a resolução de credenciais, e, sem acerto, retorna `official_mcp_origin_untrusted`; `resolveHeaders` não é chamado e
  portanto nenhuma credencial é lida para a memória. Com o validator ausente, tudo é recusado (fail closed), sem degradar para "só validar o schema e entregar credenciais".

  **Por que não basta só o adapter**: o fetch wrapper do adapter roda dentro do processo do agent, e o host é a autoridade de identidade. No cenário de
  remote anexado ao desktop o agent roda no lado remoto e o host detém a identidade local do usuário; se a validação ficasse apenas no adapter, o runtime
  remoto bastaria emitir esse RPC para obter o JWT local e a Coding Plan key; e, se o wrapper do lado do agent fosse corrompido ou contornado, não haveria
  salvaguarda. Seria equivale a deixar a parte auditada ser a própria auditora.

  Note que a flag de dev `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS` precisa valer **também** para o host
  (com `env` passada na montagem em `node.ts`), caso contrário o auto-teste local seria recusado unilateralmente pelo host.

Separação de responsabilidades:

1. Loader de Plugin: analisa `auth` estritamente e anexa o provenance oficial gerado pelo host;
2. Bootstrap: constrói o registry de Origins confiáveis a partir de `OFFICIAL_PLUGIN_DEFINITIONS` e o injeta no adapter MCP;
3. Adapter MCP: no fetch dinâmico, valida primeiro provenance/Origin e só então chama `OfficialMcpAuthHeadersPort`;
4. Adapter MCP: quando `zcode_official` é acionado, faz curto-circuito na resolução da config de OAuth, passa `authProvider` como `undefined` e classifica sozinho
   401/403/3xx conforme §6.3.3;
5. host/service: resolve a identidade atual e a credencial de Coding Plan e retorna headers condicional (implementação independente, sem branch mock, ver
   §6.1.1);
6. Adapter MCP: envia a requisição após mesclar, com semântica de sobrescrita, os headers estáticos não reservados com os cabeçalhos de identidade dinâmicos (§6.3.2).

### 7.2 Protocolo do Agent

O processo de Agent iniciado pelo Desktop não pode se tornar sozinho a autoridade de identidade do usuário. Adiciona-se uma requisição interna de schema estrito:

```text
interaction/requestOfficialMcpAuthHeaders
```

A nomenclatura e a classificação já têm precedente: `interaction/requestProviderRuntimeHeaders` também é uma requisição de headers iniciada pelo Agent, respondida
automaticamente pelo host e sem qualquer UI. Portanto o prefixo `interaction/` não significa "exige interação do usuário", e esta requisição segue a mesma
convenção, sem necessidade de criar um namespace novo.

A requisição carrega apenas contexto não sensível:

```json
{
  "requestId": "mcp-auth-...",
  "workspace": {
    "workspacePath": "/repo",
    "workspaceIdentity": "optional-remote-identity"
  },
  "pluginId": "zcode-tools@zcode-plugins-official",
  "mcpKey": "image-search",
  "targetOrigin": "https://mcp.zcode.example"
}
```

A resposta trafega apenas no enlace privado existente de host attachment stdio/remote. Em caso de sucesso:

```json
{
  "ok": true,
  "headers": {
    "Authorization": "Bearer <jwt>",
    "X-Bigmodel-Authorization": "Bearer <maas-jwt>",
    "Bigmodel-Target-Type": "TEAM",
    "Bigmodel-Organization": "<org-id>",
    "Bigmodel-Project": "<project-id>"
  }
}
```

Em caso de falha:

```json
{ "ok": false, "reason": "official_auth_plan_required" }
```

O schema usa `.strict()` (consistente com os protocolos existentes), e `reason` é a enumeração de §6.3.3, e não texto livre. A resposta **não contém**
`errorMessage`: a causa da falha precisa ser enumerável, para evitar que o chamador ramifique por texto.

O schema do protocolo fica em `packages/shared/src/zcode-protocol/index.ts`. Ao recebê-la, o host deixa o service resolver e responder automaticamente, sem gerar
evento de renderer e sem passar por React controller.

Se a CLI standalone não tiver um host auth port utilizável, na Fase 1 ela precisa falhar com `official_auth_unavailable`, sem
cair em requisições sem autenticação e sem varrer variáveis de ambiente para adivinhar credenciais. O resolvedor local de identidade Coding Plan da CLI standalone
é tratado como escopo separado posterior.

### 7.3 Temporização das requisições

```text
User            ZCode host/service        Agent + Plugin loader       HTTP MCP backend
 |                      |                           |                         |
 | start/resume task    |                           |                         |
 |--------------------->| create/reuse Agent        |                         |
 |                      |-------------------------->| load official Plugin    |
 |                      |                           | parse per-MCP auth       |
 |                      |                           | verify official provenance
 |                      |                           | verify exact Origin      |
 |                      |                           |                         |
 |                      |<--------------------------| request auth headers    |
 |                      | resolve one credential snapshot                     |
 |                      | ZCode JWT + 条件化套餐头（MaaS JWT / wire scope）     |
 |                      |-------------------------->| private response         |
 |                      |                           | inject headers           |
 |                      |                           |------------------------>|
 |                      |                           | initialize / tools/list  |
 |                      |                           |<------------------------|
 | model selects tool   |                           |                         |
 |------------------------------------------------->| resolve headers again   |
 |                      |<--------------------------|                         |
 |                      |-------------------------->|                         |
 |                      |                           | tools/call + headers     |
 |                      |                           |------------------------>|
 |                      |                           |<------------------------|
 |<--------------------------------------------------------------------------|
```

### 7.4 Fronteira local / remote / web

- Desktop local: a requisição é concluída pelo Local Host com escopo de janela atual e seu enlace de Agent via stdio;
- SSH/WSL/Docker anexados ao desktop: continuam reaproveitando o Remote Host existente e o
  roteamento por `workspaceIdentity` / `remoteSessionId`, sem criar um runtime de Agent novo para MCP; os cabeçalhos de identidade só podem ser respondidos ao
  Agent client pareado que originou a requisição;
- mobile `/remote`: reaproveita apenas o runtime Agent/MCP que já existe no attachment de shared host do desktop; relay e
  desktop main não guardam JWT, Coding Plan key nem estado de sessão MCP;
- as semânticas de entrega de conversa do desktop `continuous` e do mobile `replayable` não mudam. A autenticação do MCP oficial é uma
  capacidade de transport de rede e não adiciona estado de snapshot/queue de conversa.

O Agent remoto mantém por breve tempo, dentro do seu processo, o header desta requisição — condição necessária para executar HTTP MCP no lado remoto; o header não pode
entrar em runtime config, persistência ou logs. A implementação precisa adicionar um teste de protocolo direcionado para o remote anexado ao desktop; sem poder montar um
ambiente remoto real, isso deve ser listado explicitamente como pendente no registro de validação, e testes locais não podem ser declarados como remote verificado.

## 8. Fake Plugin e design de testes

### 8.1 Diretório e identidade

O fake Plugin usa fixture de teste e não entra em `OFFICIAL_PLUGIN_DEFINITIONS`, asset SEA, bundle do Desktop nem na
lista de prebuild do remote. Diretório sugerido:

```text
apps/zcode-cli/packages/bootstrap/tests/fixtures/zcode-official-http-mcp/
  .zcode-plugin/plugin.json
  .mcp.json
```

O teste injeta essa raiz via `officialPluginRoots` e injeta, por opção do adapter, um Origin loopback válido apenas para este teste.
O servidor HTTP MCP fake escuta em `127.0.0.1` numa porta aleatória, evitando conflito de portas fixas.

### 8.2 Planejamento de casos

| Case ID | Setup | Action | Assertions | Camada de evidência |
| --- | --- | --- | --- | --- |
| OMCP-001 | fixture oficial + auth válido | Resolver o Plugin | runtime name é `plugin:<name>:fake-official-search`; auth/provenance preservados | Adapter unit |
| OMCP-002 | Plugin inline/de terceiros copiando o mesmo auth | Resolver/conectar | não solicita cabeçalhos de identidade, MCP falha fechado | Adapter unit |
| OMCP-003 | identidade oficial, mas Origin da URL diverge do mapeamento | Conectar | `official_mcp_origin_untrusted`; número de requisições de rede é 0 | Adapter unit |
| OMCP-004 | identidade oficial + Origin loopback exato | initialize/list/call | as três classes de requisição do fake server recebem o JWT ZCode atual; com credencial de plano válida recebem também o JWT MaaS e o wire scope correspondente | Adapter HTTP integration |
| OMCP-005 | snapshot BigModel Team completo | Enviar requisição MCP | organization/project aparecem em par | Services + integration |
| OMCP-006 | snapshot Team sem um dos campos | Enviar requisição MCP | os dois headers de Team estão ausentes | Services unit |
| OMCP-007 | header estático do Plugin sobrescrevendo um cabeçalho reservado | Resolver | MCP desabilitado e com diagnostic explícito | Plugin unit |
| OMCP-008 | backend retorna 3xx | Requisição | não segue o redirect, o Origin de destino não recebe credenciais | Adapter HTTP integration |
| OMCP-009 | JWT/credencial de plano/host auth port ausentes | Conectar | no cenário identity-only envia apenas o JWT do ZCode; com host auth port indisponível o status é failed; os logs não contêm segredos | Adapter/Bootstrap unit |
| OMCP-010 | dois MCPs do mesmo Plugin, com key/origin diferentes | Conectar separadamente | cada um é autorizado conforme o mapeamento, sem compartilhar nem cruzar identity | Bootstrap integration |
| OMCP-011 | workspace identity de remote anexado ao desktop (mesmo `workspacePath` do local, `workspaceIdentity` diferente) | Solicitar auth | a resposta volta apenas para o Agent client que originou a requisição e para seu request id; o client local de mesmo caminho tem zero chamadas; requisições intercaladas não se cruzam | Services protocol unit |
| OMCP-012 | pool de conexões MCP reutilizado por várias sessions | Requisições concorrentes | cada requisição HTTP usa o credential snapshot resolvido no momento, sem cristalizar o segredo da primeira session na config | Adapter pool unit |
| OMCP-013 | fixture oficial + `zcode_official`, sem campo `oauth` e sem `authorization` estático | Estabelecer conexão | `authProvider` é `undefined`; nenhuma sessão OAuth criada; nenhuma porta de callback localhost em escuta | Adapter unit |
| OMCP-014 | o mesmo, fake server retorna 401 em todas as requisições | initialize | classificação `official_auth_rejected` e status failed; `onAuthorizationRequired` / `openAuthorizationUrl` com zero chamadas; sem campo `authorization` no status do record; nenhum navegador aberto | Adapter HTTP integration |
| OMCP-015 | o mesmo, fake server retorna 403 | initialize | classificação `official_auth_forbidden`; número de requisições exatamente 1 (sem retry) | Adapter HTTP integration |
| OMCP-016 | primeiro 401, segunda tentativa com 200 após re-resolução | initialize | exatamente 1 retry e sucesso ao final; a segunda requisição carrega a credencial re-resolvida | Adapter HTTP integration |
| OMCP-017 | 401 persistente | initialize | exatamente 1 retry e então failed; número de requisições exatamente 2, sem prosseguir | Adapter HTTP integration |
| OMCP-018 | `zcode_official` e `oauth` configurados juntos | Resolver o Plugin | `plugin_mcp_server_disabled` e desabilitado, sem arbitragem de precedência | Plugin unit |
| OMCP-019 | MCP HTTP normal (sem `auth`, sem `oauth`, sem `authorization` estático) | Estabelecer conexão | continua obtendo o comportamento de fallback authorization_code já existente, sem regressão pelo curto-circuito oficial | Adapter unit |
| OMCP-020 | `headers` estáticos sobrescrevendo `bigmodel-target-type` ou `mcp-session-id` | Resolver | MCP desabilitado e com diagnostic explícito | Plugin unit |
| OMCP-021 | três credential kinds: pessoal / BigModel Team / ZAI Team | Enviar requisição MCP | wire scopes respectivamente `PERSONAL` / `TEAM` / `null`; organization/project em par apenas em `TEAM` | Services unit |
| OMCP-022 | já existe `Authorization` no header antes da injeção dos cabeçalhos de identidade | Enviar requisição MCP | a requisição final tem exatamente um `Authorization`, com o valor do JWT atual (sobrescrita, e não append) | Adapter unit |
| OMCP-023 | autenticado, mas conexão selecionada é Start Plan | Estabelecer conexão | envia apenas o JWT do ZCode, sem JWT MaaS; registra a classificação de erro de login/plano devolvida pelo servidor | Services + Adapter unit |
| OMCP-024 | `ZCODE_OFFPEAK_MOCK=1` | Enviar requisição MCP | o MCP oficial não é afetado por essa variável (a nova implementação não tem esse branch) e não envia nenhuma credencial placeholder | Services unit |
| OMCP-025 | antes e depois de executar todos os casos do MCP oficial | Executar a suíte de testes existente de Off-Peak | comportamento de Off-Peak sem qualquer mudança, testes todos verdes (valida o isolamento de §6.1.1) | Services regression |
| OMCP-026 | disparar N requisições MCP em paralelo | Concorrência | a resolução de credenciais do nível inferior roda exatamente 1 vez (deduplicação in-flight em vigor); as N requisições recebem o mesmo header | Services unit |
| OMCP-027 | enviar outra requisição depois de uma resolução ser concluída | Duas requisições em sequência | a segunda volta a resolver tudo por completo (sem cache por tempo); após trocar a conexão Coding Plan, a segunda recebe o novo header | Services unit |

Esta fase não tem comportamento de UI, não adiciona E2E de WebdriverIO/UI e não modifica o catálogo de casos de conversation session nem a matriz de cobertura.
A evidência principal deve estar nos unit/integration tests de contracts schema, parser de Plugin, adapter MCP, Bootstrap e protocolo de services.

## 9. Impact Brief

### 9.1 must-inspect

| Relação | Superfície de mudança | Razão |
| --- | --- | --- |
| Contrato de configuração | `contracts/interfaces/mcp.port.ts`、parser MCP de Plugin | `auth` precisa entrar no runtime a partir da configuração em arquivo, e só é permitido em HTTP |
| Saída das requisições | `adapters/src/mcp/index.ts`、`network.ts` | todas as requisições MCP Streamable HTTP precisam injetar dinamicamente na única saída e validar o redirect |
| Isolamento do OAuth | `resolveAuthorizationCodeOAuthConfig`、`createAuthorizationCodeOAuthOptions` em `adapters/src/mcp/index.ts`、`adapters/src/mcp/oauth.ts` | `zcode_official` precisa fazer curto-circuito no fallback implícito de authorization_code e tratar 401/403 sozinho; ao mesmo tempo, não pode afetar o fallback já existente de MCP normal |
| Identidade oficial | `bootstrap/official-plugin-definitions.ts`、descoberta de Plugin | o mapeamento de Origin e o provenance oficial empacotado são pressuposto da autorização |
| Autoridade de identidade | novo resolvedor de credencial do MCP oficial (ex.: `services/official-mcp/`)、montagem de services | JWT, Plan key e Team context precisam vir do mesmo snapshot atual; independente da implementação de Off-Peak (§6.1.1) |
| Isolamento de Off-Peak | `services/session/offPeakRuntimeModel.ts` e seus chamadores | nesta fase é **apenas referência de leitura**, sem modificar exportações, assinaturas ou comportamento; os testes existentes de Off-Peak precisam ficar todos verdes |
| Protocolo entre processos | shared zcode protocol、servidor de protocolo do bootstrap、zcodeAgentService | o Agent não detém a autoridade de identidade, e a implementação não pode depender de resposta de UI |
| Isolamento do pool | pool de conexões MCP | conexões compartilhadas não podem cristalizar nem repassar a credencial da primeira session/workspace às requisições seguintes |

### 9.2 should-inspect

- o control-plane `mcp/list` e o session runtime compartilham o adapter; quando falta a autenticação oficial, ambos devem devolver um estado failed consistente,
  não pode sondar anonimamente na página de configurações e se autenticar no session runtime;
- o cache de Plugin/official root pode ser modificado por arquivo local, e portanto apenas o mapeamento de Origin fixado no Bootstrap pode servir como fato de
  confiança de endpoint;
- HTTP proxy, CA customizada e No Proxy continuam valendo por `createMcpTransportFetch`; o wrapper de auth oficial só pode envolvê-lo,
  sem contornar a política de rede existente.

### 9.3 invariant-only

- não modificar `packages/ui`;
- não modificar nenhum caminho de código existente de Off-Peak (`offPeakRuntimeModel.ts` etc.); o MCP oficial é uma implementação independente (§6.1.1);
- não alterar o comportamento de headers/OAuth de MCP HTTP/SSE normal;
- não alterar MCP stdio、`node_repl`、a negociação de versão do MCP e o `_meta` de tool;
- não afundar o estado de autenticação no relay, no desktop main, no snapshot de conversa ou na persistência de session;
- não adicionar `serverId` / `capabilityId`, nem inferir identidade oficial por path de URL, nome de tool ou saída de modelo.

### 9.4 Delta sugerido do feature graph

Ao entrar na implementação, pode-se adicionar `capability.zcode-official-server-mcp-auth`, relacionado a:

```text
official Plugin definition
  -> plugin MCP parser
  -> trusted Origin registry
  -> MCP HTTP transport
  -> host Coding Plan credential resolver
  -> private Agent protocol bridge
```

Aqui escreve-se apenas o spec, sem modificar diretamente o feature graph.

## 10. Ordem de implementação

É obrigatório seguir tests first:

1. primeiro adicionar os testes de sucesso e falha de contracts/parser;
2. em seguida adicionar os testes de adapter de Origin confiável, header reservado e redirect;
3. depois adicionar os testes de adapter do curto-circuito de OAuth e da classificação 401/403/3xx (OMCP-013 ~ OMCP-019、OMCP-022);
4. depois adicionar os testes de host Coding Plan header resolver e de protocolo do Agent (incluindo `Bigmodel-Target-Type` e
   isolamento de mock, OMCP-021 / OMCP-024 / OMCP-025);
5. depois adicionar o integration test de fake Plugin + fake HTTP MCP;
6. por fim implementar contracts, parser, registry do Bootstrap, ponte de protocolo, resolvedor do service e fetch dinâmico;
7. rodar os testes direcionados e então executar `pnpm typecheck` e `pnpm lint`.

## 11. Critérios de aceitação

- o MCP HTTP do Plugin oficial pode habilitar `zcode_official/jwt_token` pela declaração de `auth` por MCP no `.mcp.json`;
- nos quatro casos — identidade oficial correta com Origin errado, Origin correto com Plugin de terceiros, cópia do campo auth e redirect de outro Origin —
  nenhum cabeçalho sensível é enviado;
- `initialize`、`tools/list`、`tools/call` do MCP carregam o JWT ZCode atual (`Authorization`); `X-Bigmodel-Authorization` só é carregado quando
  existe um Coding Plan Provider válido no Registry e o JWT MaaS da family atual está disponível, e `Bigmodel-Target-Type` só quando existe o `wireScope` correspondente.
  Com wire scope `TEAM`, organization e project precisam aparecer em par;
- o MCP com `zcode_official` não cria sessão OAuth, não ocupa porta de callback localhost e tem `authProvider` como
  `undefined`; com 401/403 do backend é marcado como failed conforme §6.3.3, com `onAuthorizationRequired` /
  `openAuthorizationUrl` com zero chamadas e sem campo `authorization` no status do record;
- 401 gera no máximo uma nova tentativa, e em 401 persistente o número de requisições é exatamente 2, sem prosseguir;
- MCP oficial com Start Plan, modo API Key ou Registry sem Coding Plan Provider válido é classificado como
  `official_auth_plan_required`, e as requisições de conexão e descoberta de `initialize` / `tools/list` / `tools/call` enviam apenas
  o JWT do ZCode (sem JWT MaaS nem cabeçalhos de target/scope), distinguível de `official_auth_unavailable`;
- após trocar a identidade de login ou a conexão Coding Plan, as requisições seguintes não reutilizam o header antigo;
- o fake Plugin existe apenas em fixture de teste e não entra nos assets oficiais empacotados;
- MCP normal, MCP OAuth, MCP stdio e o comportamento existente de proxy/CA passam na regressão, e o fallback implícito de authorization_code
  permanece inalterado para MCPs que não sejam `zcode_official`;
- nenhuma alteração em `packages/ui`;
- `pnpm typecheck` e `pnpm lint` passam.

## 12. Acordos de interface com o backend

A implementação do backend está fora do escopo desta fase (desenvolvida separadamente depois). Esta seção fixa o que o cliente **já está definido a enviar** e **como interpretar
as respostas**, para que o backend possa implementar sem precisar voltar a mudar o cliente. O cliente pode avançar implementando o que está nesta seção, sem bloqueio.

### 12.1 Requisições enviadas pelo cliente (já definidas)

Para cada requisição HTTP de cada MCP oficial confiável:

| Header | Valor | Condição |
| --- | --- | --- |
| `Authorization` | `Bearer <zcode-jwt>` | sempre |
| `X-Bigmodel-Authorization` | `Bearer <JWT de login MaaS da family atual>` | enviado apenas quando existe um Coding Plan Provider válido no Registry e o JWT MaaS está disponível (substitui `X-Coding-Plan-Api-Key` desde 2026-08) |
| `Bigmodel-Target-Type` | `PERSONAL` \| `TEAM` | enviado apenas quando existe o wire scope correspondente; omitido quando não há scope |
| `Bigmodel-Organization` | organizationId | apenas `TEAM`, em par com project |
| `Bigmodel-Project` | projectId | apenas `TEAM`, em par com organization |

Também são enviados os cabeçalhos unificados existentes (`User-Agent`、`X-Platform` etc.), com semântica idêntica à de outras interfaces de negócio do ZCode, sem campos novos.
**Exceção dos ids de encadeamento**: `X-Request-Id` / `X-Trace-Id` não são enviados, sendo lidos de volta apenas dos cabeçalhos de resposta, pelo motivo e critério descritos no último item de §5.2.
O transporte é o protocolo MCP Streamable HTTP, e o body é gerado pelo SDK do MCP.

O canal de credencial foi trocado em 2026-08: quando as condições da tabela acima são satisfeitas, o cliente envia apenas `X-Bigmodel-Authorization` (JWT de login
MaaS), **sem mais enviar** `X-Coding-Plan-Api-Key`; requisições identity-only enviam apenas `Authorization`. O motivo e o "por que não enviar os dois cabeçalhos" estão em §6.1.
O item aberto da Fase 1 sobre "aguardar confirmação do backend sobre a obrigatoriedade do canal de JWT MaaS" fica com isso encerrado.

### 12.2 Interpretação das respostas pelo cliente (já definida)

Basta ao backend garantir que a semântica caia na tabela abaixo; o cliente não depende do texto de códigos de negócio específicos:

| Resposta | Comportamento do cliente |
| --- | --- |
| 2xx | processa normalmente a resposta do protocolo MCP |
| 401 | credencial inválida/vencida. Conforme §6.3.3, no máximo uma nova resolução e tentativa, e então failed. **Não** dispara o fluxo de autorização OAuth |
| 403 | identidade válida, mas sem permissão/plano insuficiente. Sem nova tentativa, direto para failed |
| 3xx | não segue (`redirect: "manual"`), direto para failed. O endpoint formal precisa ser configurado como URL canônica, para evitar depender de
  redirect por barra final ou normalização de caixa |
| 405 (fluxo GET) | tratado como "push do servidor não suportado", situação normal, sem erro |

Portanto o backend **não deve** depender de `WWW-Authenticate` para disparar OAuth discovery no cliente — o caminho do MCP oficial desligou explicitamente essa
capacidade (§6.3.1). Falhas de autenticação devem ser expressas com 401/403.

Restrições de requisição do lado do cliente, para o backend conhecer o perfil de tráfego: o MCP oficial é direito exclusivo do Coding Plan (§3.2). Usuários do Start Plan
e usuários sem conexão Coding Plan ainda podem alcançar o backend na etapa de conexão/descoberta, mas carregando apenas um JWT ZCode não vazio, sem
`X-Bigmodel-Authorization`; o mesmo vale quando o item selecionado ainda aponta para Coding Plan, mas o Provider sem direito foi removido do Registry. O backend
deve, a partir disso, distinguir autenticado de não autenticado e executar a própria verificação de plano. O critério do cliente é "a forma da conexão
selecionada + se o Registry atual ainda tem Provider utilizável", e não se o JWT MaaS ou a chave de negócio existem; só quando existe um Coding Plan Provider
válido no Registry a ausência do JWT MaaS significa sessão de login incompleta (desde 2026-08 a chave de negócio não é mais credencial nemserve de barreira).

### 12.3 Valores que precisam ser fornecidos pelo backend/lado de release

Confirmado (`zcode-server`, medido em 2026-08):

1. **Endpoint e rota**: `POST /api/v1/mcp/server/:mcp_group` (`internal/interfaces/web/router.go`).
   Duas restrições rígidas: `:mcp_group` é **obrigatório** (escrever só `/api/v1/mcp/server/` retorna 404) e **não pode ter barra final**
   (`…/image_search/` retorna 307, e o cliente com `redirect: "manual"` classifica como
   `official_auth_redirect_blocked`, com mensagem de erro sem relação com a causa real);
2. **Middleware de autenticação**: **reutiliza** `requireAuth` + `WithCodingPlan`, igual ao off-peak; o contrato dos 5 cabeçalhos de §6.1 se sustenta;
3. **Lista de groups**: atualmente apenas `image_search` (`MCPGroupTools` em `internal/domain/servermcp/service.go`),
   expondo a tool `search_image`. Cada group é um endpoint independente, correspondendo a uma entrada MCP independente no cliente;
4. **Sem session**: o handler usa `StreamableHTTPOptions{Stateless: true}` e **não emite**
   `Mcp-Session-Id`. Portanto, no endpoint real, um session id vazio é o esperado; apenas o fake server emite um.

Ainda aguardando confirmação do backend:

1. ~~a escolha de `X-Bigmodel-Authorization` no fim de §12.1~~ — **encerrado (2026-08)**: o backend confirmou que o canal de API Key é apenas
   compatibilidade legada, e o MCP oficial passa a enviar apenas `X-Bigmodel-Authorization` + JWT de login MaaS quando a credencial de plano está
   disponível (§6.1); requisições identity-only enviam apenas `Authorization`;
2. mecanismo de notificação quando um novo group entra no ar — cada group é um endpoint, o que significa que adicionar um group ainda exige mudar o
   `.mcp.json`, criando tensão com o objetivo de "adicionar um MCP oficial sem nenhuma mudança" (ver as restrições de deploy abaixo).

O Origin HTTPS canônico **não é mais um item a ser travado**: o MCP oficial precisa ter o mesmo origin da API ZCode, resolvido pelo cliente em runtime (§5.1).
Se o backend quiser hospedar o MCP oficial em um domínio separado, é preciso voltar a uma lista explícita e arcar com o atrito de publicação — é uma restrição
de deploy que precisa ser alinhada de antemão.

Enquanto o acima não estiver definido, o cliente consegue completar o fake fixture e todos os testes com injeção de dependência (auto-teste local via a flag de dev
para loopback).

## 13. Localização da implementação

O lado do cliente já está implementado conforme este spec. Correspondência entre arquivos e responsabilidades:

| Responsabilidade | Arquivo |
| --- | --- |
| Conjunto de cabeçalhos / lista de cabeçalhos reservados (mesma fonte nos dois lados, §5.2) | `packages/shared/src/official-mcp-auth.ts` |
| Schema do protocolo do Agent (§7.2) | `packages/shared/src/zcode-protocol/index.ts` |
| Resolução de credencial + construção dos cabeçalhos de identidade + deduplicação in-flight (§6.1 / §6.2.1) | `packages/services/src/official-mcp/officialMcpCredentials.ts` |
| Tratamento da requisição inversa vinda do host (§7.2) | `packages/services/src/zcode-agent/zcodeAgentService.ts` |
| Montagem (o host como única autoridade de identidade) | `packages/services/src/node.ts` |
| Contrato de configuração e tipos de porta (§4.2 / §7.1) | `apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts` |
| Análise estrita de Plugin + provenance (§4.2) | `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts` |
| Injeção dinâmica + validação de Origin + classificação de falhas (§6.3.2 / §6.3.3) | `apps/zcode-cli/packages/adapters/src/mcp/official-auth.ts` |
| Curto-circuito de OAuth (§6.3.1) | `resolveAuthorizationCodeOAuthConfig` / `createOfficialAuthFetch` em `apps/zcode-cli/packages/adapters/src/mcp/index.ts` |
| Registry de Origins confiáveis (§5.1) | `packages/shared/src/official-mcp-auth.ts` |
| Porta de auth do lado do Agent (§7.1) | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/official-mcp-auth-port.ts` |
| Montagem em runtime | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` |

Localização dos casos: `plugin-official-mcp-auth.test.ts` (análise)、`packages/shared/test/officialMcpTrust.test.ts` (confiança)、
`mcp-official-auth.test.ts` (injeção e classificação)、`mcp-official-auth-integration.test.ts` (fake ponta a ponta)、
`officialMcpCredentials.test.ts` (credencial)、`officialMcpAuthProtocol.test.ts` (schema do protocolo)、
`officialMcpAuthRemoteRouting.test.ts` (roteamento do remote anexado ao desktop)、
`official-mcp-auth-port.test.ts` (construção dos parâmetros porta→protocolo, incluindo a distinguibilidade de mesmo caminho com identity diferente).
São 87 casos no total, com OMCP-001 ~ OMCP-027 todos com as assertions correspondentes (OMCP-025 é uma ação de regressão de Off-Peak, com o comando registrado no
comentário de cabeçalho de `officialMcpCredentials.test.ts`).

### 13.1 Três fatos esclarecidos durante a implementação

1. **A sondagem GET de §6.3.4 foi fixada por medição**: o SDK, após receber 202 em `notifications/initialized`, faz **exatamente um** GET, e o servidor
   respondendo 405 faz ele desistir com segurança, mantendo a conexão connected. Esse número é travado por uma assertion em
   `mcp-official-auth-integration.test.ts`, evitando que depois se acredite que "o cliente não faz GET nenhum";
2. **A lista de cabeçalhos reservados só vale no caminho de autenticação oficial**: para MCP HTTP normal/de terceiros, carregar `authorization`
   estaticamente é uso legítimo já existente (`resolveAuthorizationCodeOAuthConfig` depende disso para sair do fallback de OAuth),
   e uma interceptação global causaria regressão. OMCP-019 trava essa fronteira;
3. **A classificação de falha não pode ser lida do objeto de erro**: a negociação de versão do SDK reembala `OfficialMcpAuthError`
   como um `Error` comum (prefixo de message `Version negotiation probe failed: `, perdendo a identidade do objeto), e portanto
   `instanceof` é pouco confiável em `failConnection`; já decifrar pelo texto do erro viola a regra de "não depender de texto de erro para decisões de fluxo".
   A solução final é reportar a classificação **no ponto de lançamento** via `onAuthFailure`, e o adapter usa uma área de armazenamento temporário por server para
   consumi-la em `failConnection` e limpá-la imediatamente depois, além de limpá-la no início de cada connect para evitar mistura entre servidores.
   Assim, as classificações de §6.3.3 ficam pesquisáveis nos logs de produção pelo campo `officialAuthKind`.

### 13.2 Registro de validação em máquina real (2026-08-16)

Validado no desktop local (`pnpm dev:desktop`) + fake MCP oficial local (`scripts/dev-official-mcp-server.mjs`)
+ identidade de login real e Coding Plan pessoal: o log do agent apresenta `mcp.server.connected`
(`plugin:dev-official-mcp:dev-search`), com zero `mcp.server.failed` e zero falhas de autenticação `official MCP`; o
fake server recebeu `initialize` / `tools/list` com os cabeçalhos de identidade completos, e a sondagem de push GET foi
abandonada com segurança pelo 405.

Duas instalações locais necessárias para o auto-teste:

- `scripts/dev-official-mcp-server.mjs` — fake MCP em loopback, que imprime os cabeçalhos de autenticação de cada requisição
  (com JWT e Coding Plan key ofuscados, e `Bigmodel-Target-Type` / organization / project exibidos como são);
- `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS` — flag de dev local, que aceita **apenas** http loopback
  (o modo `"loopback"` de `normalizeTrustedOrigin` rejeita https e hosts não-loopback,
  evitando que uma variável de ambiente envie um JWT real para o remoto). Sem ela, o comportamento é idêntico ao de antes da implementação.

Armadilhas encontradas no auto-teste (para economizar tempo em futuras reproduções):

- o plugin local é carregado por `plugins.dirs` em `~/.zcode/cli/config.json`, **não** por
  `~/.zcode/v2/config.json` (que é a config de desktop/services), e nem pelo «Adicionar marketplace» da página de configurações
  (esse caminho exige um diretório de marketplace);
- o marketplace de plugin carregado via `dirs` é fixo como `inline`, logo o pluginId fica no formato
  `dev-official-mcp@inline`. Esse sufixo **não afeta a autorização** (§5.1 removeu a verificação de marketplace), e a
  única coisa que decide se o auto-teste local passa é o Origin: um endpoint https precisa ser igual ao origin atual da API ZCode, e um
  http loopback precisa estar listado em `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS`;
- a conexão MCP é iniciada uma única vez na criação da session, e após falhar permanece em failed sem reconectar automaticamente; é preciso **subir o fake server
  antes de iniciar o desktop**. A exibição de status MCP do desktop tem atraso de refresh (só fica consistente com o estado real do agent após reiniciar),
  o que é comportamento já existente e fora do escopo desta fase (§9.3 não altera `packages/ui`).

### 13.2.1 Momento de refresh do status na página de configurações (comportamento existente, não introduzido aqui)

No auto-teste verificou-se que "o agent já está connected, mas a página de configurações ainda mostra o estado antigo, e só após reiniciar fica correto". Investigou-se
que o resultado é a sobreposição de um mecanismo de refresh já existente com uma característica do MCP oficial, e **não é corrigido nesta fase** (§9.3 invariant-only:
sem alterar `packages/ui`); fica registrado aqui para um projeto futuro.

`McpSettingsSection.tsx` tem apenas três fontes de disparo de refresh:

| Fonte de disparo | Condição | Para o MCP oficial |
| --- | --- | --- |
| refresh automático por mudança de key | só refresca se `autoStatusListRefreshKey` mudar (`previousKey !== nextKey` em `transitionMcpAutoStatusListRefreshKey`). Essa key = workspaceIdentity + workspacePath + `serverStatusListKey`, e esta última é calculada a partir da **lista** de servers/plugins | ❌ mudanças de estado de conexão não alteram a lista, a key não muda |
| polling de 1 segundo | exige existir um server OAuth com autorização pendente (`pendingMcpOAuthAuthorizationRefreshKey` não vazio), com teto de 5 minutos | ❌ a autenticação oficial não tem `authorizationUrl` por §6.3.1 |
| focus da janela / visibilitychange | também condicionado por `pendingMcpOAuthAuthorizationRefreshKey` | ❌ o mesmo |

Ou seja: **não existe assinatura para "mudança de estado de conexão", nem polling para servers sem OAuth**. As três vias não funcionam para o MCP oficial.

**Conclusão medida (2026-08-16, corrigindo inferências anteriores)**: com o fake server desligado, trocar o tab de configurações, trocar de workspace e
**ligar/desligar o plugin** não fazem o status virar falha. Ao ligar/desligar o plugin, o enlace de configurações é de fato acionado
(aparece um lease `protocol-settings` com `sess=-` sendo tomado/devolvido), mas **não gera nenhum evento de sondagem do dev-search**,
e portanto o que aparece continua sendo o snapshot antigo. Evidência em log — depois das 13:55
todos os eventos MCP traziam `sessionId` e `mcpIsolation: session`, sem nenhuma um vinda do lease
`protocol-settings` da página de configurações:

```text
13:50:27  mcp.server.connected  sess_fb0c0db  session   （服务在）
13:55:36  mcp.server.failed     sess_8517a98  session   （服务已关）
13:55:36  mcp.server.failed     sess_95448b8  session
13:55:37  mcp.server.failed     sess_72bae46  session
13:55:37 ~ 13:59 切 workspace / 切设置 tab → 零条新事件
```

O motivo é que `serverStatusListKey` é calculado apenas pela **lista** de servers/plugins, e mudanças de estado de conexão não alteram essa key;
ao trocar de tab na página de configurações o componente permanece montado, `lastAutoStatusListRefreshKeyRef` não é resetado e portanto
`transitionMcpAutoStatusListRefreshKey` retorna `shouldRefresh: false`.
**Reiniciar o app é hoje o único jeito confiável de reconstruir esse store.**

É preciso distinguir dois enlaces: a página de configurações usa o lease `protocol-settings` do entrypoint, e a session usa o lease da própria
session; ambos compartilham o pool de conexões, mas o estado não reflui entre eles. Portanto "falha conhecida do lado da session" não aparece na página de configurações.

Também se confirmou: o modo padrão (connect) de `mcp/list` **realmente reconecta** (`connectConfiguredServers` em
`bootstrap/src/zcode-protocol/mcp.ts`), e não é apenas uma leitura de cache. Logo o problema não é "leu cache velho", e sim "ninguém foi ler".

O mesmo vale para a lista de plugins: `pluginManagementStore.initialize` é chamado por workspace dentro de um `useEffect`, e
`refresh()` só é disparado ativamente após mudanças de habilitação/desabilitação/instalação/remoção, sem timer. Portanto, editar manualmente
`plugins.dirs` em `~/.zcode/cli/config.json` não é descoberto pela UI.

O impacto em MCP normal é limitado (os que têm OAuth passam por polling; os que não têm normalmente conectam rápido o bastante, completing antes ou logo depois da primeira montagem),
mas a conexão do MCP oficial é iniciada sob demanda em nível de session e, no tempo, costuma ser posterior à montagem da página de configurações, portanto
é certo ver o estado antigo. Direção de correção futura: adicionar uma assinatura de mudança de estado de conexão além de `serverStatusListKey`, ou
habilitar um polling de baixa frequência para servers sem OAuth. Ambas são alterações de camada de UI e devem ser um projeto à parte.

### 13.2.2 Injeção local de falhas para caminhos excepcionais

`scripts/dev-official-mcp-server.mjs` suporta injeção de falhas, para validar as classificações de §6.3.3. Dois parâmetros:
`--mode ok|401|403|redirect|tool-quota`、`--fail-on all|initialize|tools/call`.

| Cenário | Comando | Esperado |
| --- | --- | --- |
| sem cota na conexão | `--mode 403 --fail-on initialize` | `officialAuthKind=official_auth_forbidden`; MCP failed; log de injeção **apenas uma vez** (403 não faz retry) |
| chamada após conectar bate em 403 | `--mode 403 --fail-on tools/call` | o MCP permanece connected e a tool já está montada; apenas aquela chamada de tool falha |
| cota esgotada na tool call | `--mode tool-quota` | erro de negócio HTTP 200 + `isError: true`; o MCP permanece connected |
| credencial rejeitada | `--mode 401` | `official_auth_rejected`; log de injeção **exatamente duas vezes** (1 original + 1 retry); mais que isso é defeito de laço |
| sequestro por redirect | `--mode redirect` | `official_auth_redirect_blocked`；o Origin de destino não recebe requisição alguma |

**Distinção essencial**: `--fail-on tools/call` e `tool-quota` **não** produzem `officialAuthKind` — o primeiro acontece em uma única chamada depois
de a conexão ser estabelecida, e o segundo nem é um problema de autenticação. Erros de negócio do MCP passam por `isError` in-band e não por status HTTP,
e portanto "cota esgotada" não deve desconectar a conexão. Isso é o design esperado, e não uma omissão de relatório.

Um cenário de fail closed **que não exige servidor** (validando "não vaza credencial ao recusar", mais importante que falha de servidor):

- `official_mcp_origin_untrusted`：iniciar sem definir `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS`, também com zero requisições.

Interpretação unificada：`grep '"officialAuthKind"' ~/.zcode/cli/log/zcode-<data>.jsonl`.
Note que falhas na conexão exigem reiniciar o desktop para reconectar (a janela cega de refresh de §13.2.1), enquanto falhas na tool call não exigem.

### 13.3 Itens conhecidos ainda não conectados

- ~~o `OFFICIAL_PLUGIN_DEFINITIONS` formal ainda não registra nenhum `trustedMcpOrigins`~~：esse mecanismo foi removido junto com a mudança
  de decisão de §5.1. O registry não mantém mais um mapa, e o julgamento passou a ser "o origin de destino é igual ao origin da API ZCode
  resolvido em runtime", de modo que não existe etapa de "Origin a preencher"; quando o origin não é resolvido, ainda assim há falha fechada
  (`zcode_origin_unresolved`);
- o **teste de protocolo direcionado do remote anexado ao desktop foi adicionado** (`officialMcpAuthRemoteRouting.test.ts`,
  OMCP-011): cobre o roteamento das respostas de dois enlaces independentes com o mesmo `workspacePath` e `workspaceIdentity`
  diferente, requisições intercaladas sem cruzamento, passagem intacta de plan-required, `official_auth_unavailable` sem resolver, e
  parâmetros malformados indo por `respondError` sem disparar resolução de credencial.
  **Risco restante**：esse teste valida o roteamento e o canal de resposta na camada de service com um client de Agent falso，e não foi executado
  num ambiente SSH/WSL/Docker real. A inicialização de processo, o transporte e a saída de rede do remoto real continuam sem verificação，
  e isso é explicitamente preservado conforme a exigência de §7.4，sem afirmar "remote real verificado".