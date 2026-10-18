# Header de atribuição das requisições de modelo do agent

## Contexto

Quando o agent faz uma requisição de modelo, a camada de adapter já grava `TraceContext.traceId` no header de requisição `x-zcode-trace-id`, usado para ligar as requisições de rede do lado do provider aos logs locais, eventos e capturas de rede de debug.
Mas sob o mesmo trace podem existir várias classes de requisições de modelo, como sessão principal, subsessão, requisições de modelo secundárias de tools, compact/title etc. Apenas o trace não basta para agregar rapidamente por sessão no servidor e na captura de pacotes; além disso, cada requisição HTTP de modelo precisa de um `x-request-id` estável, usado para alinhar os logs de entrada do backend, a captura de pacotes e o `ModelStatusContext.requestId` local.

## Objetivos

- Todas as requisições de modelo do agent continuam enviando o `x-zcode-trace-id` existente, sem renomeá-lo para `x-trace-id`.
- Todas as requisições de modelo do agent devem enviar `x-request-id`, com o valor do `ModelStatusContext.requestId` atual.
- Todas as requisições de modelo do agent devem enviar adicionalmente `x-session-id`, com o valor do session id do agent atual removendo o prefixo interno `sess_`.
- Todas as requisições de modelo do agent devem enviar `x-zcode-session-type`, cujo valor só pode ser `main`, `subagent`, `side_chat` ou `other`, usado para estatísticas e diagnóstico da origem da requisição no servidor.
- Quando houver um `metadata.querySource` legítimo, enviar `x-zcode-query-source`, deixando o servidor filtrar diretamente por uso da chamada (compact, Memory, geração de título etc.), sem depender da classificação grosseira da sessão do host.
- `x-request-id` / `x-session-id` / `x-zcode-session-type` são usados apenas para observabilidade, auditoria e atribuição de requisições, nunca como base para autenticação, cobrança, limitação de taxa ou roteamento de negócio.
- `streamText` com streaming, `generateText` sem streaming, os retries internos do adapter e os caminhos de chamada de modelo principal/secundário compartilham a mesma construção de headers.
- As requisições do OpenCode Go enviam adicionalmente `x-opencode-session`, com o ID de atribuição estável da conversation/session atual; as requisições de generate, stream, retry, title e compact da mesma session permanecem inalteradas.

## Fora de escopo

- Não modificar `headers` da configuração estática do provider, para evitar armazenar em cache valores dinâmicos de nível de sessão no provider registry.
- Não mudar o schema do protocolo app/agent; o `TraceContext` e os metadados de requisição de modelo atuais já suportam `sessionId`.
- Não mudar `x-zcode-trace-id` para `x-trace-id`.
- Não enviar esse header para o OpenCode Zen comum (`/zen/v1`) nem para outros caminhos.

## Design

Os headers de requisição de modelo continuam sendo mesclados em `apps/zcode-cli/packages/adapters/src/model/runner-options.ts`:

1. O header estático do provider entra primeiro na requisição.
2. O adapter gera os headers de atribuição de observabilidade a partir do `ModelStatusContext`.
3. Os headers de atribuição sobrescrevem headers de provider com o mesmo nome, garantindo que request/trace/session/type de nível de requisição não sejam contaminados pela configuração estática.

`x-zcode-session-type` representa o tipo da sessão à qual a requisição pertence, e `x-zcode-query-source` representa o uso desta requisição; os dois são independentes. Não é possível inferir o tipo de sessão a partir do prefixo de `sessionId`, do `querySource` ou do `actorKind` de telemetry. O runtime vincula a classificação de forma unificada ao criar o handle do modelo em `createRuntimeModel`, e a camada de chamada apenas declara o uso; após vinculado, `generateText`, `streamText` e `bind` preservam a classificação, e requisições internas de título, Memory e tools não sobrescrevem mais para `other`.

```text
runtime.taskType ──→ session-type ──┐
调用方 querySource ─→ query-source ├─→ adapter → HTTP headers
工作区请求 scope ──→ other ────────┘
```

| Escopo da requisição | `x-zcode-session-type` |
| --- | --- |
| interactive, fork, workflow parent | `main` |
| subagent child | `subagent` |
| selection side chat (incluindo `/side`, `/btw`) | `side_chat` |
| workflow child, nested workflow child | `other` |
| compact dentro da sessão, goal verification, título de session/goal, Memory, requisições internas de tools de modelo | herda a classificação do host acima, independente do uso |
| requisições independentes de nível de workspace, como Repo Wiki, textos de Git, teste de conexão | `other` |

Requisições de nível de workspace podem tomar emprestado o runtime de uma sessão existente sem pertencer a ela; o ponto de entrada de criação do modelo especifica explicitamente `scope: "workspace"`, o que afeta apenas a classificação de atribuição deste handle de modelo, sem modificar a configuração do runtime nem o que é passado ao provider factory. O scope padrão é session, e não é adicionada allowlist de correspondência por uso. Esta mudança ajusta apenas a atribuição, não habilita caminhos de Memory/título que antes não estavam habilitados e não muda a seleção de modelo, retries, admissão, execução de tools nem a semântica de entrega de UI/controle remoto.

`side_chat` mapeia diretamente o `taskType: "selection_side_chat"` já existente, sem adicionar novo tipo persistido nem campo no protocolo app/agent. Requisições comuns, compact, título, Memory e requisições internas de tools dessa sessão herdam `side_chat`; o `querySource` mantém o valor de uso original, e requisições comuns continuam sendo `main_turn`. Requisições independentes de workspace continuam sendo `other`. O servidor que recebe esse header precisa aceitar o novo valor; este repositório é responsável apenas pelo envio pelo cliente e não pode, com isso, confirmar que serviços externos já são compatíveis.

O System prompt não inicia uma requisição de modelo por conta própria; ele acompanha a classificação do agent step a que pertence, e o próximo agent step após uma chamada comum de tool também continua usando a classificação do host. Em chamadas antigas sem classificação explícita, o adapter só pode fazer uma dedução de compatibilidade a partir de `agent_step + main/subagent actor`, e todo o restante cai para `other`. O novo cliente envia esse header em cada requisição física de modelo; quando o cliente antigo não envia ou o servidor recebe um valor desconhecido, o servidor deve contabilizar como `other` e não deve rejeitar a requisição.

A origem de `ModelStatusContext.sessionId` permanece como está: lê primeiro `request.traceContext.sessionId` e depois `request.metadata.sessionId`. O agent runtime já grava o `sessionId` atual ao criar o trace context raiz, e os trace contexts filhos o herdam; portanto o turn principal, o compact, a geração de título, o prompt enhance, a goal verification e as chamadas de modelo secundárias de tools carregam o mesmo session header. O tipo interno `SessionId` costuma ter a forma `sess_xxx`; ao gravar o header do provider, remove-se apenas o `sess_` do início, e se a entrada não tiver esse prefixo o valor é mantido.

A origem de `ModelStatusContext.requestId` permanece como está: lê primeiro `request.metadata.requestId` e, sem valor explícito, o adapter gera um UUID. Ao gravar `x-request-id` usa-se o mesmo valor, garantindo que o model status event, os logs locais e a requisição HTTP real tenham o mesmo ID de atribuição de nível de requisição.

O retry do adapter atualiza `x-request-id` para cada nova requisição física, mas o `x-zcode-session-type` da mesma chamada lógica precisa permanecer inalterado. Esse header não contém credenciais nem conteúdo do usuário, então pode entrar no registro de depuração de headers de requisição que passa pela redação unificada.

### Header de query source

`x-zcode-query-source` vem apenas do `metadata.querySource` da requisição atual, entra pelo `ModelStatusContext.querySource` no header builder unificado; não é inferido a partir do prompt, do tipo de sessão ou do `modelCall.operation`, e não adiciona novo estado de negócio nem campo no protocolo app/agent.

```text
调用方 metadata.querySource
  → Adapter ModelStatusContext.querySource
  → 统一 attribution header builder
  → generateText / streamText（每次重试重新装配）
  → Provider HTTP header: x-zcode-query-source
```

- O valor é repassado como está depois de remover espaços das pontas, permitindo de 1 a 128 letras ASCII, dígitos, sublinhados, pontos, dois-pontos ou hifens. Quando está ausente, vazio ou inválido, o header é omitido, e um campo de observabilidade nunca faz a requisição de modelo falhar.
- Não se mantém uma allowlist de enumerações de uso; novos identificadores de uso legítimos podem ser passados diretamente. Valores comuns são `main_turn`, `subagent`, `compact`, `session_title`, `goal_summary_title`, `project_memory_extract`, `project_memory_dream` e `project_memory_recall`.
- Este header é um campo reservado de nível de requisição. Itens com o mesmo nome nos headers estáticos do provider (incluindo os headers padrão do SDK factory) são removidos por regra case-insensitive e então injetados conforme a requisição atual; uma origem ausente ou inválida também não pode recorrer ao valor estático. A configuração persistida não é modificada.
- A remoção do valor estático de mesmo nome vale apenas para `x-zcode-query-source`; os outros headers mantêm a ordem de merge do objeto original e o comportamento do SDK, e os problemas preexistantes de conflito de maiúsculas/minúsculas dos headers de atribuição não são ajustados por esta funcionalidade.
- Retries da mesma chamada lógica mantêm o mesmo query source; requisições concorrentes usam cada qual a sua própria origem. O `x-zcode-session-type` original continua seguindo a classificação do host, e o compact pode carregar `main` e `compact` ao mesmo tempo.
- `skipTranscript` controla apenas o registro de model-io e não afeta este header; Memory Extraction/Dream ainda podem ser identificados pelo servidor a partir dos headers da requisição. O body da requisição não ganha `querySource`.
- Este campo é usado apenas para observabilidade, filtro e auditoria e não participa de autenticação, cobrança, limitação de taxa ou roteamento de negócio. Quando um cliente antigo não tem o campo, o servidor trata a origem como desconhecida e não rejeita a requisição.
- Chamadas do desktop local, do workspace remoto e da Web/celular reutilizam o mesmo Agent Adapter; esta mudança não modifica a semântica de entrega, fila ou recuperação de `desktop-continuous` / `web-remote-replayable` e não traz mudança de interação na UI.

### Header de sessão do OpenCode Go

`x-opencode-session` só é enviado quando o host da base URL da requisição for `opencode.ai` ou um subdomínio dele e o path normalizado for `/zen/go/v1` (ignorando maiúsculas/minúsculas e permitindo barra final). A combinação de host + path evita confundir o Zen comum `/zen/v1` ou outra API da OpenCode com a entrada Go, e não depende de um provider id que pode mudar. O valor reaproveita o resultado de `normalizeModelSessionIdForAttribution()`: usa primeiro `traceContext.sessionId`, depois `metadata.sessionId`, removendo o prefixo interno `sess_`/sub agent; sem session id, o header é omitido. Essa lógica está no attribution header builder unificado, e o header estático do provider continua sendo sobrescrito pelos valores de atribuição do runtime.

## Validação

- Testes table-driven de contracts/core cobrem todos os session task type; os testes de runtime cobrem o título dentro da sessão, a Memory, a herança do host nas requisições de tools, generate/stream/bind e o isolamento entre requisições concorrentes, além de as requisições de workspace continuarem como `other`.
- `side_chat` cobre o mapeamento de task type, a herança no runtime, a validação no adapter e o header HTTP real de generate/stream nos três formatos de API; as classificações existentes main/subagent/workflow mantêm seus valores.
- Testes unitários do adapter cobrem que `generateText` e `streamText` carregam `x-request-id`, `x-zcode-trace-id`, `x-session-id` e `x-zcode-session-type`.
- Testes unitários de options cobrem que os dois caminhos de requisição, `generateText` / `streamText`, mesclam `x-request-id` e o session type, e que um header estático do provider com o mesmo nome não sobrescreve a classificação do runtime.
- Testes unitários de retry cobrem a atualização do request id a cada requisição física e a manutenção do session type.
- A validação de query source cobre sessão principal, compact, título, Memory, origem legítima desconhecida, valor vazio/inválido, conflito de maiúsculas/minúsculas com header estático e omissão quando ausente; a captura de requisições HTTP pelo SDK oficial cobre os caminhos de generate/stream nos três formatos de API, verificando a estabilidade da origem no retry, o isolamento entre concorrentes e que `skipTranscript` não afeta o header.
- Preservar o resultado de merge existente do SDK nos casos de conflito de maiúsculas/minúsculas de outros headers de atribuição e verificar que o novo header de origem não altera por efeito colateral os headers antigos.
- Testes unitários do OpenCode Go cobrem a fronteira entre domínio raiz/subdomínio e o path `/zen/go/v1`, o Zen comum e outros paths não casando, e generate/stream e retry carregando sempre o `x-opencode-session` estável.
- Ao concluir, executar os testes relacionados de contracts/core/adapters, o typecheck/lint do workspace da CLI e, conforme exigido pelo repositório, o `pnpm typecheck` e o `pnpm lint` da raiz.