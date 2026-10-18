# Assincronização de Requisições de Controle Baseadas em Modelo do ZCode Protocol

## Contexto

O App se comunica com o ZCode Protocol de `apps/zcode-cli` por stdio de subprocesso. O cliente de protocolo trata request comum como requisição de comunicação curta, com timeout padrão de 30 segundos; o transport NDJSON do lado do agente processa as mensagens de entrada em série. Se um handler de protocolo espera sincronamente por uma requisição de modelo, as mensagens seguintes ficam na fila e podem até bloquear a response de um request reverso do agente para o app.

`session/send` faz ACK rapidamente, e o turno real de modelo roda em background, empurrando o progresso por session event / `state.updated`. No passado, `session/compact` e `prompt/enhance` enfrentavam o mesmo problema ao esperar sincronamente por requisições de modelo:

- depois que a requisição de modelo passa do timeout de comunicação comum, o host pode considerar o agent client obsoleto e limpar o processo;
- protocol requests de outras sessions do mesmo workspace ficam bloqueados pela fila serial;
- as responses de requests reversos do agente para o app, como provider runtime headers, permission e user input, podem ser bloqueadas por handlers longos.

## Objetivos

- O ACK de protocolo de requisições de controle baseadas em modelo não carrega o ciclo de vida do modelo.
- As responses / error responses do agente para o app não são bloqueadas por nenhum handler longo.
- Mensagens de controle de stop / cancel podem contornar handlers longos.
- `session/compact` mantém a semântica de turno de session; o resultado continua passando pela timeline de compactação e pelo snapshot.
- `prompt/enhance` mantém a semântica de ferramenta de rascunho do composer; o resultado passa por job notification independente e não é escrito na timeline da session.
- O desktop continua usando a cadeia continuous direta; o `/remote` do celular continua recuperando o estado pela fronteira de shared-host attachment e de session/task replayable.

## Regras de Comunicação

### Transport bypass

O transport NDJSON do lado do agente precisa deixar as seguintes mensagens contornarem a fila de processamento serial:

- response
- error response
- `session/stop`
- `prompt/enhance/cancel`

Motivo: response / error response são sinais de conclusão de um request reverso já existente e não podem esperar o fim do handler atual do request; stop / cancel são sinais de controle e precisam poder interromper operações em background.

### `session/compact`

`session/compact` é uma operação de modelo de escopo de session.

O tratamento da requisição faz apenas:

1. validar session, revision e active turn;
2. tratar compact duplicado: se o active turn atual já for um compact, retornar `already_running`;
3. criar e registrar um `AbortController`;
4. iniciar o turno `/compact` em background;
5. retornar rapidamente o snapshot de ACK.

Estados terminais como conclusão, falha, interrupção e skip continuam expressos pelos eventos de timeline de compactação e pelo snapshot já existentes. O chamador não pode tratar o valor de retorno de `session/compact` como resultado terminal.

Ao chamar `session/compact`, o lado App usa um timeout de ACK dedicado à compactação, em vez do padrão de 30 segundos dos requests comuns. A razão é que a compactação envolve estado de manutenção do modelo, um snapshot de session maior, e agentes antigos/compatíveis ainda podem ter janelas de processamento na casa dos minutos; 30 segundos classificariam como agent obsoleto uma compactação recuperável. Esse timeout longo protege apenas a fronteira do ACK e não muda a semântica de o estado terminal da compactação em background continuar sendo dirigido por timeline / snapshot.

A estrutura de resultado recomendada preserva os campos antigos e adiciona metadata de compactação:

```ts
{
  response: "",
  snapshot,
  compact: {
    state: "accepted" | "already_running",
    inputId?: string,
    operationId?: string
  }
}
```

`session/stop` ainda interrompe a compactação em background por `record.activeAbortController`.

### `prompt/enhance`

`prompt/enhance` é um job de modelo utilitário associado a workspace/session, e não um turno de session.

O protocolo é dividido em:

- `prompt/enhance/start`
- `prompt/enhance/cancel`
- `prompt/enhance/result`, notificação do agente para o app

`start` retorna rapidamente:

```ts
{
  requestId: string,
  accepted: true
}
```

Quando o job em background termina, o agente envia a notificação:

```ts
{
  requestId: string,
  status: "completed" | "failed" | "cancelled",
  enhanced?: string,
  errorMessage?: string
}
```

Os parâmetros de `prompt/enhance/start` devem trazer `requestId` e suportar `sessionId` opcional. Havendo `sessionId`, usam-se a configuração de modelo e os provider runtime headers dessa session; sem session, só então se cria um app temporário por workspace. Assim, múltiplas sessions no mesmo workspace não reutilizam aleatoriamente o estado de modelo da primeira session ativa.

O «取消增强» da UI precisa chamar `prompt/enhance/cancel`, e não apenas invalidar o resultado antigo. A UI ainda precisa manter o requestId para evitar sobreposição, para que um result antigo não sobrescreva a nova entrada depois de um cancelamento ou de o usuário continuar editando.

## Responsabilidades de App / Service

- `ZCodeAgentService.enhancePrompt()` pode continuar expondo uma Promise para a UI, mas internamente deve encapsular start, result notification e cancel.
- O service mantém os jobs de prompt enhance pendentes; relay e desktop main apenas repassam, sem manter estado de negócio.
- `ZCodeSessionService.compactSession()` e o `compactSession()` da facade de tasks deixam de fazer broadcast de snapshot terminal depois de retornar o ACK; o estado terminal é dirigido pela sincronização de session event / snapshot.
- O caminho replayable do celular não pode contornar o shared host nem afundar o estado de job de prompt enhance no relay/main.

## Checklist de Verificação

- O ACK de `/compact` usa o timeout longo dedicado à compactação, e a conclusão da compactação vem por atualização de timeline.
- Durante `/compact`, outras sessions do mesmo workspace conseguem read/create/send.
- Durante `/compact`, `session/stop` consegue interromper a compactação.
- A response de provider runtime headers antes da requisição de modelo da compactação não é bloqueada pela fila.
- Um prompt enhance que passa de 30 segundos não dispara descarte de agent obsoleto.
- O cancelamento de prompt enhance realmente aborta a requisição de modelo do lado do agente, e o result antigo não sobrescreve a entrada posterior do usuário.
- Com múltiplas sessions no mesmo workspace, o prompt enhance usa a configuração de modelo da session atual.
- O estado de compactação do `/remote` no celular é recuperado por snapshot/timeline replayable.

## Roteamento de Sessão das Requisições Reversas e Garantia de Terminação (recorte de 2026-09-09)

### Fenômeno

Nos logs de usuário de 2026-09-09 (`zcode-logs-20260909-035718`, build 3.11.2 / c4d5b5bc), dois dwf runs (`dwfrun-920daa62` com 5 subagentes, `dwfrun-5e8d371f` com 3 subagentes, ambos com provider `builtin:bigmodel-start-plan`) tiveram seus 8 subagentes, cada um, emitir um `model.request.started` e depois nenhum evento por mais 80 minutos, até a exportação dos logs: sem conclusão, sem falha e sem `model.stream.stalled` (o timer de 600 segundos de stream idle só começa após o primeiro evento SSE, ou seja, a requisição nunca chegou a ser enviada). A última linha de cada subagente no CLI é `zcode_protocol.session.require_missing`, e no lado desktop correspondem a 8 mensagens `zcode-agent.respondProviderRuntimeHeaders FAIL … Session is not active: sess_dwf-…`; no mesmo dia, as 38 trocas equivalentes da sessão principal passaram todas OK.

### Cadeia de Causa Raiz

```
2026-09-09T06:35:38Z  dwfrun-920daa62 / actor_1_1..actor_1_5

 actor runtime            CLI protocol server          desktop service        UI
   │ refresh antes da tentativa 1      │                            │                │
   ├─ refreshBeforeModelRequest(sessionId = sess_dwf-…-actor_1_1)              │
   │                            ├─ interaction/requestProviderRuntimeHeaders ─►│
   │                            │                            ├─ verificação de segurança ─────►│
   │                            │                            │◄─ headers ─────┤
   │                            │◄─ updateRuntimeModelConfig(sess_dwf-…) ──────┤
   │                            ├─ requireSession → sessionUnavailable         │
   │                            │  (o throw acontece antes do client.respond)    │
   │                            │                            ╳ respond nunca é emitido │
   │ ⏳ espera permanente: requestClient sem timeout, sem segunda saída além do abort │
   │ 🎫 e o ticket de admissão já está em posse (admitAttempt antes de resolveModelForAttempt) │
```

Duas falhas independentes se somam:

1. **Identidade de roteamento errada**. O runtime filho tem dois eixos de identidade, e o código só tem um:

   ```
   identidade de ledger sessionId                 identidade de roteamento clientSessionId
   ├─ persistência de eventos / transcript       ├─ interaction/requestPermission
   ├─ arquivamento de trace                      ├─ interaction/requestProviderRuntimeHeaders
   └─ session store                              └─ interaction/requestUserInput
      runtime filho = a si mesmo                runtime filho = o pai (recursivamente até a raiz)
   ```

   `ProviderRuntimeHeadersPort.refreshBeforeModelRequest` recebia antes `sessionId` nos parâmetros, e o ponto de chamada no core preenchia `runtime.sessionId`. O subagente embutido do core depende de um wrapper privado (`createSubagentProviderRuntimeHeadersPort`) para trocá-lo pela sessão pai; as duas montagens de dwf actor e de legacy workflow child colocavam `appOptions.providerRuntimeHeadersPort` diretamente nas deps do runtime, de modo que a identidade enviada era a da sessão filha. O mesmo desvio ocorre em `permissionBroker`: o core embrulha com `createSubagentInteractionBroker`, as outras duas montagens não — assim que o permission / AskUserQuestion do dwf actor ocorre, ele entra no mesmo beco sem saída. **A existência do wrapper privado já é, por si só, sinal de que o design da interface está errado**: enquanto o ponto de chamada ainda puder escolher o sessionId, o N-ésimo ponto de montagem de child vai errar de novo.

2. **A response de um request reverso não é incondicional**. O `respondProviderRuntimeHeaders` do desktop primeiro executa um efeito colateral (empurrar o runtime model config para aquela session); quando o efeito lança erro, `pending.client.respond(...)` simplesmente não é executado. O travamento do controle remoto web de 2026-08-16 (com o pedido de headers retido em `pendingProviderRuntimeHeaders`) é outro gatilho do mesmo tipo de falha.

### Contratos

**Contrato 1: a porta voltada ao cliente vincula a identidade de roteamento na fase de construção, e os pontos de chamada não passam sessionId.**

- o `ProviderRuntimeHeadersPort.refreshBeforeModelRequest` do lado runtime **não tem mais** `sessionId` nos parâmetros;
- a implementação de escopo de workspace continua parametrizada por sessão, com o nome próprio `SessionRoutedProviderRuntimeHeadersPort`, aparecendo apenas em `ZCodeAppOptions` e na camada de montagem do protocolo;
- entre as duas existe uma única ponte, `bindProviderRuntimeHeadersPort(port, clientSessionId)`, e a vinculação só acontece quando o create-app monta o runtime **principal**; no sistema de tipos, uma porta não vinculada não entra nas deps do runtime, e portanto não há como o ponto de chamada escolher errado.

**Contrato 2: as portas externas do runtime child só podem ser cunhadas pelo runtime pai.**

- `AgentRuntime.createChildClientPorts(context)` é a única saída, passando internamente por `deriveChildClientPorts`; o `parentSessionId` é preenchido pelo próprio runtime pai e não pode ser fornecido pelo chamador;
- as três montagens de child (core subagent, dwf actor `script-workflow-child-runtime.ts`, legacy `workflow-facade.ts`) obtêm uniformemente `permissionBroker` e `providerRuntimeHeadersPort` por ela, sem mais buscar cada uma por conta própria em `appOptions`;
- qualquer profundidade converge automaticamente para a sessão raiz, sem regra extra:
  - `providerRuntimeHeadersPort` já está vinculado e não tem parâmetro de sessão, portanto repassar é idempotente;
  - `permissionBroker` reescreve `request.sessionId` a cada camada, com **a camada externa (a mais próxima do cliente) escrevendo por último**, de modo que o valor final é o da raiz; o `origin` mantém em sentido inverso o valor existente mais interno, para que a atribuição ao subagente não seja sobrescrita pelas camadas externas.

**Contrato 3: a response de requests reversos é emitida incondicionalmente.**

- a falha do efeito colateral (push do runtime model config) em `respondProviderRuntimeHeaders` não pode engolir a response: em vez disso, exceção no efeito colateral → responder primeiro `respond({ headersApplied: false, errorMessage })` e só então relançar a exceção original ao chamador;
- no lado do CLI, `headersApplied:false` leva a `ProtocolRequestError(-32031)` pelo caminho já existente, e a tentativa falha com a causa real, em vez de ficar pendurada para sempre;
- aqui **não** se adiciona timeout no requestClient: na versão oficial, a interação de verificação de segurança pode legitimamente esperar vários minutos pelo usuário, e o timeout apenas trocaria um palpite por outro; a requisição já é cancelada pelo abort signal do run e, com a response garantida, não é necessária uma segunda saída.

### Checklist de Verificação

| Asserção | Cobertura |
|---|---|
| A refresh de headers do dwf actor passa pelo porto já vinculado do runtime pai, e os parâmetros não têm mais `sessionId` | `bootstrap/tests/script-workflow-child-runtime.test.ts` (cadeia real de tentativa de adapter) |
| O permission broker cunhado pelo pai carrega a identidade da sessão pai + a origin do subagente | o mesmo |
| Com dois níveis de aninhamento, `sessionId` converge para a raiz e `origin` preserva o mais interno | `core/tests/child-client-ports.test.ts` |
| O comportamento de roteamento do core subagent não muda (coberto pela derivação unificada após a remoção do wrapper privado) | `core/tests/subagent-explore.test.ts` (inclui a guarda de regressão de que «o parâmetro da porta não pode mais conter sessionId») |
| Quando o push do runtime model config lança erro no desktop, o CLI ainda recebe a response | `packages/services/test/zcodeAgentService.providerRegistry.test.ts` |
| Um `SessionRoutedProviderRuntimeHeadersPort` não vinculado não entra nas deps do runtime | `pnpm typecheck` (dois tipos incompatíveis, as três montagens de child estão em src) |
| legacy workflow child e dwf actor passam pela mesma derivação | o mesmo ponto de chamada + tipos; a facade hoje não tem montagem de teste, sem caso isolado |

> **Recorte de 2026-09-11 (sincronizado com staging: a forma da implementação do Contrato 1 muda, o Contrato 2 permanece)**
>
> O provider refactor do staging (`docs/working-memory/provider-refactor/`) fez o `ProviderRuntimeHeadersPort.refreshBeforeModelRequest` do core voltar a ter `sessionId` nos parâmetros (a repetição da verificação de segurança da versão oficial também passa por ele), com o runtime principal preenchendo `runtime.sessionId`. Assim, a forma «vinculação na construção, sem sessionId nos parâmetros» deixou de valer, e `bindProviderRuntimeHeadersPort` e `SessionRoutedProviderRuntimeHeadersPort` foram removidos em consequência. A **intenção** do Contrato 1 — o ponto de chamada não escolher a identidade de roteamento errada — passa a ser cumprida pela camada de derivação do Contrato 2: `deriveChildClientPorts` também embrulha `providerRuntimeHeadersPort`, reescrevendo o `sessionId` de parâmetro para a sessão pai; em aninhamento profundo a camada externa escreve por último e o valor final é necessariamente a sessão raiz (a mesma regra do `permissionBroker`). As três montagens de child (core subagent, dwf actor, legacy workflow child) continuam passando apenas por `AgentRuntime.createChildClientPorts`.
> Na checklist de verificação, as duas linhas de «o parâmetro não tem mais sessionId» passam a afirmar `routedSessionId === sessão pai` (`script-workflow-child-runtime.test.ts`, `subagent-explore.test.ts`). Na linha «quando o push do runtime model config lança erro no desktop, o CLI ainda recebe a response»: o staging reescreveu `respondProviderRuntimeHeaders` (falha na resolução do material de autenticação da conta → `headersApplied: false` + motivo, ainda respondendo incondicionalmente), e nosso caso, que cobria o efeito colateral antigo `updateRuntimeModelConfig`, foi removido junto com o caminho antigo; o Contrato 3 é mantido pela nova implementação.

**Contrato 4: Browser Use é a única requisição reversa em que a identidade de ledger «sobe».**

O `sessionId` de `interaction/browserList` / `interaction/browserExecute` não é identidade de roteamento, mas a **atribuição de tab** do browser backend do desktop (`docs/browser-use/2026-07-14-browser-tab-conversation-isolation-spec.md`, com scope key contendo `sessionId`). O service do desktop é um puro relay para esses dois métodos e não procura task por `sessionId`; o que precisa ser resolvido a partir da sessão é apenas o workspace preenchido pelo `buildBrowserRequestContext` no lado CLI (`workspaceKey` / `workspacePath` / `workspaceIdentity` / `remoteSessionId`) e o `clientMode`. Portanto, para as requisições de navegador do dwf actor:

```
actor runtime (sess_dwf-…-actor_2_1)
  │ mcp__node_repl__js  _meta.session_id = actor
  ▼
node_repl broker socket ──► ProtocolBrowserControlBroker (um estado por server context)
                              │ sessions.get(actor) ausente
                              │ childSessionParents.get(actor) = sessão pai  ← registrado por forChildSession
                              │ requireSession(sessão pai) → workspace / clientMode
                              ▼
                  interaction/browserExecute { sessionId: actor, workspace…: o da sessão pai }
                              ▼
                  desktop main: scope = (…, workspaceKey, sessionId=actor, clientMode)
```

- O registro só pode vir da porta derivada do runtime pai: o porto filho devolvido por `BrowserControlPort.forChildSession({childSessionId, parentSessionId})` revoga o registro depois de `closeSession` emitir `{ method: "closeSession", closeTabs: true }`. Qualquer sessão não cliente e sem registro recebe sempre `Session is not active`, sem adivinhar a sessão pai pelo formato do id.
- dwf actor e subagente `Agent` do core recebem o porto filho: o runtime do dwf actor (`tabOwner: "child"`) executa `closeBrowserSession` no dispose do run, fechando as tabs; o subagente do core usa `tabOwner: "parent"`, e o `sessionId` enviado é trocado pela sessão pai (compartilhando tab com a conversa atual, e o painel se expande a partir disso), com turnEnded / closeSession do porto filho não enviados ao desktop, e closeSession apenas revogando o registro (`docs/browser-use/2026-07-16-subagent-browser-unavailable-spec.md`). O `Workflow` child legado não tem cadeia de fechamento, e por isso não recebe uma. Detalhes em `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, seção «Subagent sessions».
- No mesmo server context, `createProtocolBrowserControlBroker` é chamado duas vezes (o broker node_repl de nível de processo e a porta de runtime de cada app). Tanto a memória de conexão (para onde `turnEnded` / `closeSession` devem ir) quanto o registro de sessões filhas precisam ser compartilhados por context: o tráfego node_repl passa pela instância de nível de processo e o ciclo de vida pela instância do app; quando ficam separadas, a instância do app nunca viu a conexão e `turnEnded` / `closeSession` nunca chegam ao desktop.