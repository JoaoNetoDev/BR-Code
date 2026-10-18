# Especificação de autenticação MCP e status de cota do Official Server do ZCode

> Status: fatos da implementação atual (2026-08-22)
>
> Este documento é o ponto de entrada atual dos fatos sobre a autenticação do cliente MCP do Official Server, a entrega HTTP/stdio e o status de cota.
> Os designs históricos das fases phase-1 / phase-2 permanecem nos documentos correspondentes, apenas como Decision Log, e não servem mais como base de implementação.

## 1. Identidade e responsabilidades

- Host/service é a autoridade das credenciais do usuário; Renderer, relay e desktop main não possuem credenciais.
- O Agent solicita ao Host os cabeçalhos de identidade desta execução por `interaction/requestOfficialMcpAuthHeaders`.
- O MCP HTTP é validado request a request pelo fetch wrapper do adapter quanto à origin; `server/discover`, `initialize`, notification, `ping`, `tools/list`, o GET probe e `tools/call` resolvem junto ao Host e injetam os cabeçalhos de identidade atuais. Quando a resolução falha, a requisição ainda é enviada de forma anônima, e o servidor decide de forma autoritativa pelo método da requisição; o entitlement do usuário não deve determinar a visibilidade do catálogo de ferramentas.
- O MCP stdio obtém o payload de identidade atual em `_meta["com.zcode/official-mcp-auth"]` de `server/discover`, `initialize`, notification, `ping`, `tools/list` e `tools/call`; as credenciais não podem entrar no env do processo.
- `Authorization` carrega o JWT do ZCode; `X-Bigmodel-Authorization` carrega o JWT MaaS da família atual.
- `X-Coding-Plan-Api-Key` pertence apenas ao canal de compatibilidade legado do lado do servidor; o cliente não deve enviá-lo nem permitir injeção estática por plugin.

## 2. Scope de produto e scope de wire

A atribuição de plano e os cabeçalhos de requisição reais são dois conjuntos de semântica distintos; é proibido inferir o tipo de conexão de produto a partir de campos de wire:

| Conexão                  | planScope (atribuição de cota)   | wireScope (cabeçalho de identidade) |
| ----------------------- | ------------------------------- | ------------------------------- |
| ZAI / BigModel Personal | `PERSONAL`                      | `PERSONAL`                      |
| BigModel Team           | `TEAM + organization + project` | `TEAM + organization + project` |
| ZAI Team                | `TEAM + organization + project` | `null`                          |

O comportamento de wire do ZAI Team é o mesmo do Off-Peak: não envia `Bigmodel-Target-Type`, `Bigmodel-Organization` nem `Bigmodel-Project`, sendo identificado pelo fallback do servidor; mas a atribuição local de cota precisa continuar TEAM, caso contrário o Team request scope do entitlement seria julgado erroneamente como Personal e o `/api/v1/mcp/usage` seria ignorado.

Team keys antigas ou malformadas sem organization/project não devem regredir para Personal. A chamada de ferramenta pode manter o fallback existente, mas não gera um quota scope atribuível com precisão.

## 3. Cota e banner

- O servidor HTTP do MCP oficial valida a identidade ZCode e o Coding Plan quando a requisição entra no roteamento; o cliente carrega de forma unificada cabeçalhos de identidade disponíveis nas requisições de conexão, descoberta e chamada. Quando há login mas não há Coding Plan, carrega apenas o JWT do ZCode, sem o JWT MaaS, e o servidor devolve um código de erro da camada de protocolo; falhas de cota na camada de chamada de ferramenta ainda retornam um resultado estruturado com `isError=true`.
- Se o adapter HTTP não conseguir resolver os cabeçalhos de identidade antes de enviar alguma requisição, ele entrega a requisição sem cabeçalhos ao servidor para decisão autoritativa; não deve promover `official_auth_unavailable` / `official_auth_plan_required` a falha de conexão.
- `/api/v1/mcp/usage` é um data plane opcional do entitlement; a falha apenas limpa `mcpQuota`.
- O `total_usage` do servidor é mapeado para uma única `MCP_USAGE_LIMIT`; o percentual mantém o critério de "proporção já usada".
- O quota scope casa com precisão por family, Personal/Team e organization/project.
- O `quota_exceeded` / `coding_plan_required` estruturado do MCP oficial HTTP pode ser projetado como banner no Composer; o resultado stdio é produzido pelo processo do plugin e não é um fato de UI confiável.
- O descarte de banner é mantido em memória no renderer atual por `(sessionId, dismissKey)`, no máximo 256 entradas; não é gravado em localStorage, Host, snapshot ou relay, e um novo aviso é permitido após reiniciar o app.
- Uma nova chamada bem-sucedida para o mesmo `(serverName, toolName)` sobrescreve a falha anterior; um novo rowId de falha forma uma nova instância do aviso.

## 4. Remoto e auditoria

- A workspace identity usa `workspaceIdentity?.trim() || workspacePath`; o workspacePath é usado apenas para execução/exibição.
- O Host registra em info a emissão da primeira identidade de cada `(pluginId, mcpKey, workspaceKey)` e usa debug nas seguintes.
- Uma resolução de credenciais bem-sucedida precisa registrar em info o tempo de validade restante do JWT MaaS (apenas os segundos, nunca o token): o JWT MaaS não tem cadeia de refresh e, após expirar, o servidor colapsa o 401 upstream em `coding plan is required`, e esse número é a única pista de distinção que o cliente consegue provar por si mesmo; em builds de produção o debug não é persistido, então precisa ser info. A contagem é da mesma ordem de grandeza das requisições de MCP oficial e precisa ser deduplicada com a chave `(providerFamily, planTargetType, bucket de validade em horas | expired | unparsable)` — a mesma chave não gera registro repetido; trocar o token, alternar PERSONAL/TEAM ou cruzar de bucket (inclusive cruzando a meia-noite) necessariamente produz uma nova chave.
- O conjunto de auditoria precisa ser limitado; identities diferentes de SSH/WSL/Docker no mesmo caminho não podem se suprimir mutuamente.
- A validação do Host apenas garante que o fluxo de credenciais vá para a origin da API atual do ZCode; a entrada dos cabeçalhos de identidade stdio no processo do plugin é uma fronteira conhecida.

## 5. Invariantes de aceitação

- Quando não há login ou o estado de login está incompleto, o plano de controle do MCP HTTP continua fazendo requisições com a semântica existente de degradação anônima; com login mas sem Coding Plan, é obrigatório enviar o JWT do ZCode e não enviar o JWT MaaS, para que o servidor consiga distinguir `1006` de `3101`.
- Cada requisição HTTP e cada mensagem de saída do protocolo stdio oficial re-resolve a identidade; login, upgrade ou logout após a conexão passam a valer na próxima requisição sem necessidade de reconectar.
- Chamadas anônimas ou sem entitlement não podem chegar ao gateway/upstream, não verificam nem debitam quota e não escrevem usage.
- Uma origin não confiável continua falhando antes de qualquer requisição de rede e de qualquer leitura de credenciais, e não faz parte do escopo de degradação anônima.
- A quota do ZAI Team é visível, mas os wire headers permanecem inalterados em relação ao Off-Peak.
- Não há vazamento de cota entre Personal/Team/family/project.
- Depois de fechar o mesmo banner, trocar de session/pane e voltar continua oculto; uma nova falha é exibida novamente.
- O 401 final salva o request id do servidor e só então libera o body da resposta.
- As semânticas de entrega desktop continuous e web remote replayable não mudam.

Casos principais:

| ID            | Cenário                 | Asserção                                                                   |
| ------------- | ---------------------- | ----------------------------------------------------------------------- |
| OMCP-CALL-001 | Coding Plan válido      | Conexão, descoberta, GET probe e `tools/call` injetam a identidade mais recente e têm sucesso |
| OMCP-CALL-002 | Sem login ou sem auth port | Requisição com degradação anônima; quando o servidor retorna erro de não autenticado, o request id correspondente é registrado |
| OMCP-CALL-003 | Com login mas sem Coding Plan | A requisição de conexão carrega o JWT do ZCode e não o JWT MaaS; o erro do servidor distingue estado de login de estado de plano |
| OMCP-CALL-004 | Login ou upgrade após a conexão | Sem reconexão; a próxima chamada re-resolve a identidade e tem sucesso |
| OMCP-STDIO-01 | stdio oficial com login | O `_meta` de initialize, tools/list e tools/call carrega o payload de identidade atual |