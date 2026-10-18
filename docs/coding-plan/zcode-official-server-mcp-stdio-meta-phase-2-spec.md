# ZCode Official Server MCP: plugin stdio obtém cabeçalhos de identidade via `_meta` (segunda fase, Decision Log histórico)

> Os fatos atuais da implementação estão unificados em `zcode-official-server-mcp-auth-spec.md`. Este documento mantém apenas o contexto histórico da solução stdio.

- Status: implementado; os fatos atuais foram fundidos na especificação unificada
- Pré-requisito: `zcode-official-server-mcp-client-phase-1-spec.md` (a seguir "phase-1"). Este documento descreve apenas o incremento; tudo o que não for
  mencionado (critério de julgamento de confiança, conjunto de cabeçalhos de identidade, resolução de credenciais, deduplicação in-flight, restrições de log) é integralmente herdado da phase-1
- Necessidade que motivou: as ferramentas `transcribe` / `tts_generate` do plugin `video-agent-kit` precisam passar a chamar
  `speech_transcribe` / `speech_synthesize` do `zcode-server` (group `video_edit`), removendo a key do Volcengine configurada manualmente pelo usuário

## 1. Objetivo

Permitir que um Plugin MCP server na forma **stdio** também invoque os endpoints oficiais do Server MCP com a identidade do usuário atual, sem credenciais em disco,
sem credenciais no env e sem invalidar por rotação de JWT.

A phase-1 resolveu apenas `type:"http"`: o host injeta os cabeçalhos de identidade request a request em um fetch wrapper (`official-auth.ts`),
e a credencial nunca entra em um processo controlável pelo plugin. O stdio não passa por esse caminho — suas requisições são enviadas pelo próprio processo do plugin.

## 2. Por que não deixar o agent usar o MCP oficial http em seu lugar

Uma ideia natural é: sem mexer no stdio, declarar dentro do plugin mais um MCP `type:"http"` oficial, expor
`speech_transcribe` / `speech_synthesize` como ferramentas para o agent e deixar o modelo orquestrar.

Esse caminho não serve para esta necessidade, por um motivo independente da autenticação: o áudio dessas duas ferramentas entra como `audio_base64` e sai como `audio_base64`
(`internal/domain/servermcp/gateway.go`). Assim que elas viram ferramentas visíveis ao agent, parâmetros e resultados precisam passar pelo
contexto do modelo — do lado do ASR, dezenas de MiB de base64; do lado do TTS, centenas de KiB. Portanto **a chamada precisa ocorrer em um processo que leia e escreva arquivos locais
diretamente**, ou seja, no próprio server stdio do plugin.

Pelo mesmo motivo fica excluída a variante em que "a ferramenta do plugin só envia e recebe caminhos de arquivo e deixa o agent repassar os bytes": os bytes ainda passam pelo contexto.

## 3. Escopo

### 3.1 Dentro do escopo

- `McpStdioServerConfig` passa a suportar `auth: { type: "zcode_official", provider: "jwt_token" }`;
- para o server stdio que declarou essa auth, **a cada `tools/call`** os cabeçalhos de identidade atuais são anexados em `params._meta`;
- o critério de resolução de targetOrigin e a semântica de falha no cenário stdio;
- os correspondentes ajustes no loader de Plugin, na injeção do adapter e nos testes.

### 3.2 Fora do escopo

- a forma `sse` (não há canal correspondente; a rejeição continua);
- injetar os cabeçalhos de identidade no **env** do processo stdio: o env é um valor morto durante o ciclo de vida do processo, enquanto um Plugin MCP server vive a sessão inteira,
  e a rotação do JWT fatalmente provoca 401 sem chance de autocorreção. Esse é exatamente o problema que esta solução quer evitar, portanto é explicitamente rejeitado;
- fazer o host emitir a requisição HTTP inteira do plugin (as credenciais nem saem do host). É a direção mais completa apontada pelo risco residual 3 da phase-1 §5.1,
  mas exige que o host repasse centenas de MiB de tráfego fragmentado, com custo e benefício desproporcionais, ficando para depois;
- requisições customizadas no sentido server→client (como `zcode/officialMcpAuthHeaders`). Teria mais frescor (pode ser rebuscado dentro de uma única tool call),
  mas o `send_request` do SDK em Python é uma union tipada, e enviar um method não padrão exige descer até a camada de JSON-RPC cru e
  tratar o id por conta própria, além de que outros hosts MCP retornam uniformemente Method not found. Não é feito na segunda fase; ver a lacuna conhecida em §7;
- mudanças no backend. Zero mudanças no lado do `zcode-server`.

## 4. Contrato de configuração

```json
{
  "mcpServers": {
    "video-edit": {
      "type": "stdio",
      "command": "python3",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/video_edit_server.py"],
      "auth": { "type": "zcode_official", "provider": "jwt_token" },
      "timeoutMs": 900000
    }
  }
}
```

- A parsing estrita da `auth` reutiliza integralmente o `parseZCodeOfficialAuth` da phase-1 §4.2: valores exatos, diferenciação de maiúsculas/minúsculas,
  sem aceitar apelidos; forma inválida resulta em `plugin_mcp_server_disabled`;
- **não existe `url` em stdio**, e portanto também não existe um "origin declarado pelo plugin". Isso não é um defeito, é um endurecimento: ver §5;
- `oauth` junto com `zcode_official` continua sendo erro de configuração (stdio nunca suportou oauth; é uma declaração inválida e é rejeitada junto);
- o provenance `official` continua sendo gerado pelo host (`pluginId` / `mcpKey` / `source`), e mesmo escrito no `.mcp.json` é sobrescrito;
- a blacklist estática de cabeçalhos reservados (phase-1 §5.2) não se aplica ao stdio — ele não tem campo `headers`. O `env` do stdio **não** entra
  na blacklist: o plugin trazer credenciais de terceiros por env é um uso legítimo já existente (por exemplo, um caminho de fallback), sem relação com o canal de injeção de cabeçalhos de identidade.

## 5. Modelo de confiança: o origin não vem mais da configuração

O julgamento da phase-1 era "`URL.origin` === origin da API ZCode em runtime". O stdio não tem URL, então passou a ser:

```text
targetOrigin := resolveRuntimeZCodeEndpointOrigin(env)     # o cliente resolve por si só, sem ler nenhuma configuração de plugin
```

O critério é consistente com as 4 chamadas existentes em `zcode-protocol-entrypoint.ts` (o `ZCODE_BASE_URL` recebe do host o valor autoritativo via
`resolveSpawnEnv`, ver commit `9c9d1683`).

**Por que isso é mais estrito que o caminho http**: no caminho http o plugin pode escrever a url, e o julgamento serve para "devolvê-lo ao origin oficial";
no caminho stdio o plugin não tem nem como expressar um origin, então os cabeçalhos de identidade só podem ser resolvidos como "credencial do origin atual da API ZCode".
A chamada de `isOfficialMcpOriginTrusted` é mantida como antes (a mesma implementação de `@zcode/shared`), onde ela degenera em uma
afirmação sempre verdadeira — **ela ainda deve ser chamada**, porque ao mesmo tempo valida https e a ausência de username/password, e o switch de loopback de dev
(`ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS`) precisa continuar em vigor.

A segunda validação no host (`zcodeAgentService` validando a tripla com o mesmo registry **antes** de ler as credenciais) permanece inalterada:
o `targetOrigin` reportado pelo agent é exatamente o valor que ele próprio resolveu, e um não-acerto resulta em `official_mcp_origin_untrusted`,
com zero chamadas a `resolveHeaders`.

**Novo risco residual**: os três riscos residuais da phase-1 continuam válidos, e mais um — **os cabeçalhos de identidade entram na memória do processo do plugin**.
No caminho http a credencial aparece apenas dentro do fetch wrapper do processo do agent, e o plugin não consegue obtê-la; no caminho stdio o plugin lê um `Authorization`
em texto claro e pode usá-lo para chamar outro endereço. Isso é da mesma natureza dos riscos residuais 2/3 da phase-1 §5.1 (quem consegue executar código dentro
do plugin já consegue ler a mesma credencial em `~/.zcode`), portanto a posição continua sendo **defesa em profundidade**, e não proteção contra um plugin já comprometido.
A solução completa seria apenas a direção de "host emite a requisição" descrita em §3.2.

## 6. Canal de entrega: reaproveitar o ponto de injeção `_meta` existente

O `callTool` em `adapters/src/mcp/index.ts` já escreve, a cada `tools/call`,
`_meta = mcpRequestMeta(trace, runtimeScope)` (trace_id / session_id / runtime_scope). Os cabeçalhos de identidade viajam na mesma
passagem, sem adicionar canal, porta, token ou superfície de escuta; o cenário de attach remoto também funciona normalmente.

### 6.1 Formato da carga

Apenas chaves com namespace, sem chaves achatadas (diferente da escrita dupla achatada+namespace de `com.zcode/request-context` — os cabeçalhos de identidade
não precisam compatibilidade com nenhum consumidor existente, e um ponto a menos de aparição é um ponto a menos de exposição):

```json
{
  "_meta": {
    "com.zcode/official-mcp-auth": {
      "ok": true,
      "headers": {
        "Authorization": "Bearer <jwt>",
        "X-Bigmodel-Authorization": "Bearer <maas-jwt>",
        "Bigmodel-Target-Type": "TEAM",
        "Bigmodel-Organization": "<org-id>",
        "Bigmodel-Project": "<project-id>"
      }
    }
  }
}
```

Falha:

```json
{ "_meta": { "com.zcode/official-mcp-auth": { "ok": false, "reason": "official_auth_plan_required" } } }
```

- O conjunto de chaves de `headers`, a atomicidade em par do Team e os valores válidos de `Bigmodel-Target-Type` são todos produzidos em um único ponto por
  `buildOfficialMcpAuthHeaders`, com a mesma origem do caminho http (phase-1 §6.1);
- `reason` é o enum `OfficialMcpAuthFailureReason`; não se envia texto livre (é proibido fazer roteamento por texto);
- essa chave aparece **somente** nas requisições de servers stdio que declararam `zcode_official`. Ela não pode aparecer no `_meta` de um server stdio comum
  — senão seria equivale a difundir os cabeçalhos de identidade para qualquer plugin de terceiros.

### 6.2 Frescor

`resolveHeaders` é chamado **a cada** dispatch de `tools/call`, portanto cada chamada de ferramenta obtém credenciais recém-resolvidas;
a deduplicação in-flight e a "proibição de cache na dimensão de tempo" da phase-1 §6.2.1 continuam em vigor.

**Janela conhecida**: em uma execução longa dentro de uma única tool call (por exemplo, a transcrição de um vídeo de 2 horas envia dezenas de requisições HTTP
seguidas dentro de uma mesma chamada), se o JWT for rotacionado no meio o plugin não consegue rebuscá-lo. Convenção: ao receber 401 o plugin **não faz retry** e
reporta `official_auth_rejected` de volta ao agent, para que o agent refaça a chamada inteira da ferramenta e obtenha cabeçalhos novos. Portanto o lado do
plugin precisa marcar 401 como não-recuperável, evitando girar no vácuo com cabeçalhos velhos.

### 6.3 Semântica de falha: **intencionalmente diferente** do caminho http

A phase-1 §6.3.3 é totalmente fail closed para http. O caminho stdio passa a **enviar `{ok:false, reason}` do mesmo jeito**, porque as
superfícies de risco dos dois são diferentes:

- no caminho http, liberar passagem = uma requisição anônima batendo de fato no endpoint oficial, então é preciso fail closed;
- no caminho stdio, um plugin que não recebeu os cabeçalhos **nem chega a chamar o endpoint oficial** (ele segue seu próprio caminho de fallback ou simplesmente
  reporta erro), e portanto não existe requisição anônima; por outro lado, entregar o `reason` ao plugin é o que permite apresentar com fidelidade ao usuário a diferença
  entre "não logado" e "sem plano Coding Plan", em vez de degradar silenciosamente para uma falha inexplicável.

Portanto:

| Situação | O que é enviado | Lado do agent |
| --- | --- | --- |
| host auth port indisponível (CLI standalone) | `{ok:false, reason:"official_auth_unavailable"}` | A conexão continua normal, apenas a chave está em falha |
| Não logado / sem connection selecionada | `{ok:false, reason:"official_auth_unavailable"}` | Idem |
| Start Plan ou sem key de Coding Plan | `{ok:false, reason:"official_auth_plan_required"}` | Idem |
| A segunda validação do host não acertou | `{ok:false, reason:"official_mcp_origin_untrusted"}` | Idem, com zero leitura de credenciais |

Observe que "a conexão continua normal" também difere do "deixar a conexão como failed" do caminho http: normalmente há muitas ferramentas sem relação com o
MCP oficial penduradas no mesmo server stdio (o `video-edit` tem mais de 30), e colocar o server inteiro como failed por não conseguir os cabeçalhos de
identidade as atingiria indevidamente. A disponibilidade dos cabeçalhos de identidade é uma propriedade **de cada chamada de ferramenta**, não da conexão.

### 6.4 Isolamento do OAuth

O curto-circuito da phase-1 §6.3.1 (`resolveAuthorizationCodeOAuthConfig` retornando undefined ao encontrar `zcode_official`)
vale naturalmente para o stdio (stdio não passa pelo ramo de OAuth), mas ainda é preciso garantir que os pontos de curto-circuito existentes de `isOfficialAuthConfig(config)`
não sejam contornados pelo novo ramo stdio.

### 6.5 Logs

Seguem a phase-1 §5.2 e `official-auth.ts:summarizeIdentityHeaders`: registra-se apenas o **nome** do header,
`Bigmodel-Target-Type`, o agrupamento em par e a classificação da falha; **nunca** o valor do header, o JWT ou a key do Coding Plan, e também não se
pode gravar o `_meta` inteiro em nenhum log (o `describeJsonRpc` existente extrai apenas campos estruturais, não `params.arguments`;
campos novos não podem quebrar essa restrição).

## 7. Posicionamento da implementação

| Responsabilidade | Arquivo |
| --- | --- |
| Tipo de configuração stdio | `apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts` (adicionar `auth?` / `official?` a `McpStdioServerConfig`) |
| Parsing no loader de Plugin | `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts` (`officialAuth && type !== "http"` passa a rejeitar apenas `sse`; o ramo stdio carrega auth + provenance) |
| Resolução e injeção dos cabeçalhos de identidade | `apps/zcode-cli/packages/adapters/src/mcp/index.ts` (ponto de injeção `_meta` em `callTool`; extensão de parâmetros de `mcpRequestMeta`) |
| Resolução de credenciais / construção dos cabeçalhos de identidade | Reutiliza `packages/services/src/official-mcp/officialMcpCredentials.ts`, sem alterações |
| Julgamento de confiança | Reutiliza `packages/shared/src/official-mcp-auth.ts`, sem alterações |
| Segunda validação no host | Reutiliza `packages/services/src/zcode-agent/zcodeAgentService.ts`, sem alterações |

Não é preciso mexer em `SANITIZED_RUNTIME_ENV_KEYS`: os cabeçalhos de identidade não vão para o env, e não há nova superfície de vazamento em subprocessos.

## 8. Critérios de aceitação

- um Plugin MCP stdio que declara `auth` carrega normalmente, e o provenance `official` é gerado pelo host e não pode ser forjado pelo `.mcp.json`;
- `sse` + `zcode_official` continua sendo rejeitado com `plugin_mcp_server_disabled`;
- para cada `tools/call` desse server, `_meta["com.zcode/official-mcp-auth"].headers` contém o conjunto de cabeçalhos especificado na phase-1 §6.1;
  no cenário de Team, org/project aparecem em par;
- quando `resolveHeaders` falha, é enviado `{ok:false, reason:<enum>}`, sem a chave `headers`; a conexão não é marcada como failed;
- a chave não aparece no `_meta` de um server stdio comum;
- nenhum valor de header aparece nos logs;
- `pnpm lint`, `pnpm typecheck` e `pnpm test` passam; zero mudanças em `packages/ui`.

## 9. Lacunas conhecidas

1. A janela de execução longa de uma única chamada descrita em §6.2. Uma solução completa exigiria a requisição customizada inversa da §3.2 ou o host.emitindo a requisição; nesta fase é coberta por "401 sem retry +
   retry no nível do agent";
2. Os cabeçalhos de identidade entram no processo do plugin (novo risco residual em §5). Posicionado como defesa em profundidade, com a mitigação dependente das verificações de benefício e cota no lado do servidor;
3. `_meta` é enviado em **todas** as chamadas de ferramenta daquele server, e não apenas nas poucas ferramentas que realmente precisam dele. Apertar isso exigiria
   declarar uma lista branca de ferramentas na configuração; a avaliação atual é que o benefício é insuficiente (no mesmo processo, estreitar a granularidade não muda a superfície de exposição).