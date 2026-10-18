# ZCode Official Server MCP: aviso na caixa de entrada quando indisponível (quota esgotada / sem benefício do Coding Plan) — especificação

- Status: T1 (código de erro do servidor → aviso na caixa de entrada) implementado; T2 (classificação local ao sair do login e trocar a API Key) não implementado, ver §10.2
- Os fatos atuais de autenticação unificada e de scope estão em `zcode-official-server-mcp-auth-spec.md`; este documento mantém apenas o comportamento de produto de quota/banner.
- Pré-requisito: `zcode-official-server-mcp-client-phase-1-spec.md` (doravante "phase-1"). O critério de decisão de confiança, o conjunto de cabeçalhos de identidade, a resolução de credenciais e a classificação de falhas são todos herdados do phase-1 e não são repetidos aqui.
- Repositórios envolvidos: `z-code` (cliente) e `zcode-server` (servidor); os dois lados compartilham o mesmo conjunto de tool error codes.
- Necessidade que motiva: o Official Server MCP tem um portão de benefício e uma quota diária. Quando qualquer um dos dois não passa, o usuário não recebe nenhuma explicação na interface: só vê o modelo dizer que "a chamada de ferramenta falhou" e deduzir sozinho.
- Os números de linha citados vêm do staging de 2026-08-20 e servem apenas para localização, migrando com o código; o contrato da §4 tem como autoridade o `internal/domain/servermcp/toolerror.go` do servidor.

## 1. Objetivo

Quando o Official Server MCP estiver indisponível por **benefício insuficiente** ou por **quota do dia esgotada**, exibir acima da caixa de entrada um aviso legível dizendo qual dos dois motivos é, qual tipo de cota é, quando volta e, no caso de benefício insuficiente, oferecer um ponto de upgrade.

A forma reaproveita o `ConversationQuotaBanner` existente — ou seja, a mensagem de cota que o usuário de Coding Plan vê hoje.

## 2. Situação atual: por que nada aparece agora

### 2.1 No servidor, as duas falhas são apenas texto

Toda tool call do MCP oficial passa por `Service.authorize` (`internal/domain/servermcp/service.go:155`):

1. `CheckEligibility` — retorna `ErrCodingPlanRequired` quando não há Coding Plan utilizável (`internal/domain/servermcp/billing.go:58`);
2. `CheckQuota` — retorna `ErrQuotaExceeded` quando a cota do bucket do dia se esgota (`internal/domain/servermcp/quota.go:63`).

Os dois são "achatados" em string por `fmt.Errorf` e involve camadas de wrappers; no fim, os 5 handlers locais de tool retornam direto `return nil, nil, fmt.Errorf(...)` (`internal/interfaces/web/controller/mcp_controller.go`). O go-sdk, em `mcp/server.go:381`, converte o error comum devolvido pelo handler em `CallToolResult{IsError: true}` mais content de texto puro.

Resultado: **o cliente recebe apenas um texto livre**, sem código de erro, sem nome de bucket e sem tempo de recuperação — e todos esses campos já existiam em `CheckQuota` (`used` / `limit` / `conf.NextRefreshAt(now)`), apenas perdidos na stringificação.

### 2.2 O cliente não obtém um "estado de erro"

O `isError: true` in-band do MCP conta como **execução bem-sucedida** no lado do CLI: `turn-tools.ts:269` só passa `isError` para a mensagem do modelo, e `result.success` continua `true`. Portanto, a row `toolCall` do v4 fica com `status: "success"` e sem `error.code`.

⇒ O aviso não pode depender do estado de erro da row; só pode se apoiar em **o próprio resultado da ferramenta carregando um identificador estruturado**.

### 2.3 O caminho "sair do login e trocar a API Key" nem chega a enviar requisição

Este é o segundo cenário coberto aqui, e também o mais fácil de passar despercebido:

O usuário loga primeiro com Coding Plan, configura o MCP oficial e depois sai do login para usar uma API Key. Nesse momento `resolveOfficialMcpCredentials` (`packages/services/src/official-mcp/officialMcpCredentials.ts:173`) classifica como `official_auth_plan_required` e, conforme o phase-1 §6.3.3, **não emite um único byte**; a conexão do MCP oficial falha, a ferramenta não entra no registro e o modelo não tem como chamá-la.

⇒ Os códigos de erro de benefício do servidor **nunca chegam ao cliente** nesse caminho. E essa classificação de falha hoje só vai para o log (`apps/zcode-cli/packages/adapters/src/mcp/index.ts:898`), sem entrar no `McpServerStatus`, então a UI não consegue obtê-la.

### 2.4 O roteamento do MCP não verifica o plano

`internal/interfaces/web/router.go:163` usa `WithCodingPlanContext()` — que apenas analisa os cabeçalhos de identidade e **não faz verify**; cabeçalho ausente retorna 400 direto (é `WithCodingPlan`, com verifier, que só aparece em `/api/v1/mcp/usage`). A invalidade do plano é barrada dentro da tool call por `CheckEligibility` e chega como in-band isError, não como erro HTTP.

### 2.5 O banner já tem um padrão pronto

`provider-limited` (`packages/ui/src/v4/sessionQuotaBannerState.ts:198`) já é a implementação de "exibir direto a message do backend + dispensável". Um novo kind só precisa copiá-la; não é preciso nenhum componente de UI novo.

## 3. Escopo

### 3.1 Dentro do escopo

- Tipar as duas classes de falha no servidor e trazer um identificador estruturado no tool result;
- O cliente interpretar esse identificador, passando por tool result display → row do v4 → banner;
- O cliente promover a classificação local `official_auth_plan_required` para dentro do estado do MCP, cobrindo o cenário de §2.3;
- Textos bilíngues, regras de deduplicação e prioridade, e os testes correspondentes.

### 3.2 Fora do escopo

- Bloquear o envio (`blocksSubmit` permanece `false`): MCP indisponível não afeta a conversa com o modelo;
- Exibição de valores de cota: o popover da caixa de entrada já tem a célula de cota do MCP; aqui só fazemos o aviso de "indisponível";
- A política de quota do próprio servidor (divisão em buckets, cotas por nível);
- Interfaces além do `SessionPane` do v4 (o quota banner atual também só existe ali).

## 4. Contrato de protocolo: o `error_code` dentro do content de tool error

> Esta seção foi corrigida conforme a implementação do servidor de 2026-08-20. O rascunho inicial do design supunha que o identificador ficaria na chave `com.zcode/mcp-unavailable` de `CallToolResult._meta`; o servidor optou por renderizá-lo dentro do **texto JSON do tool error content**, e o cliente foi implementado conforme essa segunda opção.

### 4.1 Forma

O `ToolError.Error()` do servidor, em `internal/domain/servermcp/toolerror.go`, emite uma linha JSON como text content do tool error (`IsError: true`):

```json
{"error_code":"quota_exceeded","message":"daily quota exceeded for bucket search_image (5/5), retry tomorrow or upgrade your coding plan","request_id":"..."}
```

Dois caminhos de produção: o handler de tool local retorna `ToolErrorFor(err, requestID)` (o go-sdk converte o error comum em resultado `IsError`), e o encaminhamento para upstream usa `ToolErrorResult` para construir diretamente um resultado de mesma forma.

### 4.2 codes

| code | Significado | Comportamento do cliente |
|---|---|---|
| `quota_exceeded` | Cota do bucket do dia esgotada / nenhuma cota disponível | Avisar "a cota de hoje acabou", dispensável, sem ação |
| `coding_plan_required` | Nenhum Coding Plan disponível (contexto ausente ou verificação de assinatura falha) | Avisar "é necessário um Coding Plan", dispensável, com ponto de upgrade |
| `internal_error` | Máscara de cobertura para todas as demais falhas | **Não reconhecer, não avisar** — o detalhe fica só no log do servidor e o usuário não consegue resolver sozinho |

### 4.3 Convenções

- `error_code` é a única base de roteamento. **Não há fallback por casamento de texto**: isso faria uma mudança de uma frase no servidor falhar silenciosamente;
- `message` é em inglês e serve só para log e diagnóstico. Todo texto de interface passa por i18n, portanto o cliente não o traz para o banner (isto difere de `provider-limited`, cuja message é um texto de negócio em chinês);
- `request_id` serve para conferir contra os logs do servidor;
- Parsing estrito: precisa ser um objeto JSON e `error_code` precisa casar um code conhecido; caso contrário, ignora-se tudo;
- Declaração única: `packages/shared/src/official-mcp-tool-error.ts`, com `OFFICIAL_MCP_TOOL_ERROR_CODES` e `parseOfficialMcpToolError`, consumidos por três lugares — CLI core, schema de row do v4 e UI — evitando que, ao adicionar um code, um lado reconheça e o outro descarte.
- Diante de `code` desconhecido, campo ausente ou tipo incompatível, o cliente **ignora tudo**, sem chute de cobertura e sem aviso;
- `IsError` continua `true` e o `content` continua carregando o mesmo texto — o comportamento do lado do modelo não muda; o identificador é apenas informação adicional.

## 5. Implementação no servidor (`zcode-server`, concluída)

### 5.1 `ToolError` como container único

`internal/domain/servermcp/toolerror.go`:

- `ToolError{Code, Message, RequestID}`, com `Error()` renderizando o JSON da §4.1; `Unwrap()` retorna o sentinel interno (`ErrQuotaExceeded` / `ErrCodingPlanRequired`), preservando a semântica de `errors.Is` sem expor a cadeia interna de erros ao cliente;
- `ToolErrorFor(err, requestID)` mapeia o erro de serviço para a forma visível ao cliente: um `ToolError` existente é repassado direto (completando o request id), os dois sentinels são mapeados para o code correspondente e **todo o resto** (upstream, gateway, falhas de infraestrutura) é mascarado uniformemente como `internal_error`, deixando o detalhe apenas no log do servidor;
- `ToolErrorResult(err, requestID)` é a versão para handlers nus (encaminhamento upstream), construindo o resultado `IsError` diretamente.

### 5.2 Pontos de interceptação

- `CheckQuota` (`quota.go`) retorna `ToolError{Code: quota_exceeded}` nos três casos: bucket sem titularidade, nível sem cota e dia já esgotado (o texto contém o nome do bucket e used/limit);
- `CheckEligibility` (`billing.go`) retorna `ToolError{Code: coding_plan_required}` nos dois casos: contexto de Coding Plan ausente e verificação de assinatura falha;
- Os 5 handlers locais de tool e o encaminhamento upstream já estão conectados (`mcp_controller.go`).

### 5.3 Campos não usados pelo cliente

O texto do servidor traz o nome do bucket e used/limit, mas **não** traz `next_refresh_at`. Por isso a interface não promete um horário específico de recuperação e diz apenas "volta amanhã" — o reset por dia natural é garantido por `QuotaConfig.NextRefreshAt`, e a célula de cota do MCP no popover da caixa de entrada mostra a data exata de reset.

## 6. Implementação no cliente (`z-code`, T1 concluído)

| Fonte de disparo | Cenário | Sinal | Status |
|---|---|---|---|
| T1 | Com credenciais e requisição já enviada: quota esgotada / plano inválido | `error_code` no tool error content | Implementado |
| T2 | Saiu do login trocando por API Key, sem login: a requisição não é enviada | `official_auth_plan_required` local | Não implementado, ver §10.2 |

### 6.1 Declaração única do contrato

`packages/shared/src/official-mcp-tool-error.ts`: `OFFICIAL_MCP_TOOL_ERROR_CODES` e `parseOfficialMcpToolError`. Fica em shared porque três consumidores de pacotes diferentes precisam da mesma fonte — CLI core (parsing do resultado), schema de row do v4 (validação do code) e UI (escolha de texto e ação pelo code).

`McpToolDescriptor` ganha `official?: boolean` (ver §6.2).

### 6.2 Só confiar no MCP oficial http (relevante para segurança, não pode ser omitido)

Sem determinar a origem, **qualquer MCP server conseguiria enfiar o mesmo payload no resultado e forjar um aviso de Coding Plan**. Nenhum credencial vazaria, mas o usuário seria enganado a comprar/upgrade um plano.

O critério é **quem produziu o resultado**, e não "de quem é o plugin" (correção SG-02):

| Forma | Produtor do resultado | Pode forjar `error_code` | Define o sinal |
| --- | --- | --- | --- |
| `http` + `auth.type=zcode_official` | Backend do ZCode (a conexão viva já significa que a verificação de origin por requisição passou e é fail closed) | Não — o plugin só consegue enviar requisições ao ZCode real, e o corpo da resposta não é escrito por ele | ✓ |
| `stdio` + `auth.type=zcode_official` | O próprio processo do plugin | **Sim**, qualquer string | ✗ |
| Outros | Server de terceiros | Sim | ✗ |

**Deliberadamente não se decide por "o plugin veio do marketplace oficial"**: isso quebraria de cara plugins oficiais instalados por fonte não oficial (teste local, `zcode-plugins-test`), e isso também não é uma barreira real (ver a seção de "riscos residuais conhecidos" de `isOfficialMcpOriginTrusted`).

Custo conhecido: falhas de plugins oficiais via stdio (video-agent-kit) não disparam mais aviso. Na prática isso não constitui perda de capacidade — a saída deles é o próprio texto de erro (`[ERROR] zcode_speech transcription failed: …`), que de todo modo não casa com o parsing estrito de `parseOfficialMcpToolError`. Se no futuro o stdio realmente precisar repassar falhas estruturadas do servidor, será preciso um canal próprio com aval do host, e não afrouxar este ponto.

- `apps/zcode-cli/packages/adapters/src/mcp/index.ts`: o ponto de chamada de `normalizeMcpToolDescriptor` passa official conforme `config.type === "http" && config.auth?.type === ZCODE_OFFICIAL_MCP_AUTH_TYPE`; `descriptor.ts` repassa;
- `apps/zcode-cli/packages/core/src/mcp/index.ts` leva a marca para dentro do `mcpPresentation`;
- `mcpPresentation` em `core/src/tool/types.ts` ganha o campo correspondente.

### 6.3 Display de nível de resultado → row do v4

- `core/src/tool/executor/result-display.ts`: `createMcpToolDisplay` ganha o parâmetro de entrada opcional `output`; quando a origem é oficial, lê `error_code` do text block de `output.content` e, havendo casamento, acrescenta `unavailable: { code }` no display de `mcp_tool`. `createToolResultDisplay` repassa o resultado para dentro (`call-runner.ts` já o chama com `output`, sem necessidade de mudar chamadores);
- **Os dois schemas `.strict()` recebem o mesmo campo**, senão a row é rejeitada na validação: `apps/zcode-cli/packages/contracts/src/tools/tool-result-metadata.ts` (`mcpToolResultDisplayPayloadSchema`) e `packages/shared/src/zcode-protocol-v4/rows.ts` (`toolCallMcpDisplaySchema`); a enumeração de codes nos dois lugares vem da declaração única da §6.1;
- `product-projection.ts` já repassa `payload.result.display` inteiro para dentro da row `toolCall`, então a camada de projeção não muda.

### 6.4 Banner

- `packages/ui/src/v4/mcpUnavailableBannerNotice.ts`: `resolveMcpUnavailableNotice(rows)` produz `{ code, serverName, toolName, rowId }` a partir da row `mcp_tool` com `display.unavailable` **mais recente** da janela. Escolhe-se a mais recente e não a primeira: a mesma sessão pode bater na quota primeiro e depois, ao trocar de conexão, bater no benefício, e o aviso precisa acompanhar o fato mais recente;
- `sessionQuotaBannerState.ts`: novos kinds `mcp-quota-exhausted` / `mcp-plan-required`, **inseridos depois de `provider-limited` e antes do retorno antecipado de Start-Plan-only** (uma sessão de Coding Plan sempre atinge esse retorno antecipado, então ficariam para sempre inativos depois dele); dois novos campos de state, `mcpServerName` / `mcpNoticeRowId`, sendo o segundo parte da dismiss key;
- `ConversationQuotaBanner.tsx`: dois mapeamentos em `MESSAGE_IDS`, com `server` passado como variável de texto;
- `useV4SessionQuotaBanner.ts`: nova entrada `mcpUnavailableNotice` ( resolvida pelo chamador a partir das rows — é uma projeção de eventos da sessão, sem relação com o serviço de entitlement, então não cabe buscá-la dentro deste hook);
- `SessionPane.tsx`: resolve o notice em `useMemo` e o passa ao hook. A condição de renderização não muda — quando há composer error, o erro continua tendo precedência.

## 7. Especificação de exibição

| Item | `mcp-quota-exhausted` | `mcp-plan-required` |
|---|---|---|
| Texto | `chat.quota.mcp.quotaExhausted` (nomeia o server e diz que volta amanhã) | `chat.quota.mcp.codingPlanRequired` (nomeia o server e diz que é necessário um Coding Plan) |
| Ação | Nenhuma (esperar o reset do dia natural) | Reaproveita o `onUpgrade` já existente do banner (diálogo de upgrade/compra do Coding Plan) |
| Dispensável | Sim | Sim |
| Bloqueia o envio | Não | Não |
| Prioridade | 6 | 8, ambas abaixo de todos os kinds de cota de modelo |
| Chave de dedup | `kind` + `serverName` + `rowId` | Idem |

Duas exigências rígidas:

- **Prioridade abaixo dos kinds de cota de modelo**: o esgotamento da cota do modelo afeta a conversa em si e não pode ser tapado por um aviso de MCP;
- **Texto via i18n e não a message do servidor.** Isso difere de `provider-limited`, cuja message é um texto de negócio em chinês e pode ser exibida direto; a message do MCP oficial é em inglês (`daily quota exceeded for bucket ...`), e exibi-la numa interface em chinês é inaceitável. A message do servidor só vai para o log.

O efeito de a chave de dedup carregar `rowId`: depois de dispensar o aviso uma vez, a mesma chamada não abre de novo; uma nova chamada com falha abre novamente; trocar de MCP server também abre de novo.

As chaves i18n já foram adicionadas em en-US e zh-CN.

## 8. Testes

Servidor: `toolerror_test.go` já cobre o mapeamento de codes e a máscara `internal_error`. Cliente:

- shared: `packages/shared/test/officialMcpToolError.test.ts` — parsing normal, campos opcionais ausentes, `internal_error` e code desconhecido não reconhecidos, texto não-JSON sem fallback por texto;
- core: `apps/zcode-cli/packages/core/tests/tool-result-display.test.ts` — produção dos dois codes passando pelo schema strict, **origem não oficial precisa ser ignorada**, e code desconhecido / não-JSON / resultado com sucesso não produzem identificador;
- ui: `packages/ui/test/v4SessionQuotaBannerState.test.ts` — roteamento por code, não bloquear o envio, kind de cota de modelo com prioridade maior, dismiss key seguindo server e rowId, e `resolveMcpUnavailableNotice` pegando a mais recente.

## 9. Aceite

1. Servidor: `go test ./internal/domain/servermcp/... ./internal/interfaces/web/controller/...`;
2. Cliente: `pnpm typecheck` (dois schemas strict foram alterados, atenção à compilação entre pacotes) + `pnpm lint` + os vitest acima;
3. **Quota**: configure a cota diária de algum bucket bem pequena (configuração mcp quota em `internal/config`) → suba o servidor local → no zcode, empurre a ferramenta oficial do MCP desse bucket para além do limite → o aviso aparece acima da caixa de entrada nomeando o server; depois de dispensado, não abre de novo; um novo disparo de falha depois abre de novo;
4. **Benefício**: faça `CheckEligibility` falhar (remova o contexto de Coding Plan ou faça o verify falhar) → o aviso muda para "é necessário um Coding Plan", com ponto de upgrade;
5. **Verificação de falsificação**: use um MCP local de terceiros (`scripts/dev-official-mcp-server.mjs` configurado com auth não oficial) retornando o mesmo `{"error_code":"quota_exceeded"}` e confirme que o banner **não** aparece.

## 10. Lacunas e escolhas conhecidas

1. **`rows.window` é uma visão de janela**: depois de rolar muito longe na sessão, um identificador antigo pode sair da janela e o banner desaparecer junto. Uma chamada recém-ocorrida com certeza está na janela, o que é aceitável; se for preciso retenção estrita, é preciso promovê-lo a state de nível de sessão em vez de campo de row.
2. **T2 (sair do login e trocar por API Key) não implementado.** Nesse caminho o cliente já classifica localmente como `official_auth_plan_required` e a requisição nem é enviada, então o code do servidor nunca chega ao cliente; para cobri-lo seria preciso promover essa classificação do log para dentro do `McpServerStatus` e fazer a UI recorrer a ela. O custo é que, no modo API Key, cada sessão nova exibiria um aviso uma vez (dispensável); se vale fazer é decisão de produto.
3. **`isError` in-band do MCP continua deixando a row com `status: "success"`** (nada foi mudado), e o banner também não assume o composer error — são dois canais de informação independentes.
4. **`internal_error` não abre aviso.** É a máscara de cobertura do servidor para todas as demais falhas, e o usuário não consegue resolver sozinho.
5. **O servidor não envia `next_refresh_at`**, então o texto diz apenas "volta amanhã", sem prometer horário. A data exata de reset aparece na célula de cota do MCP no popover da caixa de entrada.
6. **A marca official não pode se perder em nenhuma etapa da cadeia**: config do Plugin → descriptor → `mcpPresentation` → ponto de construção do display; qualquer elo que a perca degrada para "qualquer MCP pode forjar um aviso de Coding Plan". Ao alterar esses pontos é preciso manter esse invariante.