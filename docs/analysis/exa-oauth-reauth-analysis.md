# Análise de causa raiz do problema de reautenticação OAuth do Exa MCP

> Data da análise: 2026-08-13
> Baseline da análise: `exa-oauth-analysis` / `bfc91c54a9507beae4820c58f86a25fc3c44104d`
> Escopo: apenas análise, sem modificar código de produção e sem executar autorização OAuth nem requisições de token
> MCP server: `plugin:exa:exa`

## 1. Resumo das conclusões

### Questão 1: por que a reautenticação é exigida depois de algum tempo

O mecanismo direto confirmado é:

1. A implementação atual do ZCode persiste e carrega o refresh token; após um refresh bem-sucedido ela também atualiza atomicamente o par client/token. Não foi encontrado bug de código do tipo "refresh token sempre se perde ao reiniciar depois de um salvamento normal".
2. Quando o MCP responde não autorizado, o MCP SDK prioriza o refresh token já salvo. Se a Exa retornar `invalid_grant`, o SDK apaga o token, mantém o client, tenta novamente e entra na autorização pelo navegador.
3. O estado observado na máquina é exatamente "só sobrou client/discovery, sem token/par canônico", portanto o estado atual necessariamente entra em reautorização, em vez de continuar o refresh.
4. Os logs de 2026-08-12 mostram que a Exa ainda estava conectável em `08:54:49Z` e em `09:00:13Z` já estava em autorização interativa, o que é compatível com a linha do tempo "o access token expirou, o refresh não o recuperou e o token foi tratado como inválido".

Entretanto, os logs existentes não registram o status de resposta nem o OAuth error code do token endpoint da Exa, portanto apenas com as evidências atuais não é possível determinar de forma única a causa upstream da falha de refresh:

- a Exa expirou ou revogou ativamente o refresh token;
- versões antigas históricas ou autorizações concorrentes já geraram um par client/token sem correspondência;
- outra política de servidor da Exa ou erro transitório.

A implementação atual de credenciais já trata a intercalação client/token com par canônico, lock de arquivo entre processos e compare-and-delete. Portanto, "o código atual do desktop e da CLI ainda sobrescreve tokens um do outro de forma trivial" não é uma causa raiz confirmável neste momento; escritas de processos antigos não atualizados em legacy key ainda constituem um risco da janela de compatibilidade.

**Qualificação:**

- reautorização após falha de refresh: comportamento de degradação normal do OAuth.
- ausência de registro do error code do token endpoint, que impede distinguir expiração de token, revogação, client mismatch e erro de servidor: **defeito de design de observabilidade**.
- ausência atual de token: **fato confirmado**; o motivo específico da remoção foi influenciado pela operação manual de reset de 2026-08-11 e não pode ser atribuído inteiramente ao programa.
- múltiplos runtimes independentes podem disparar ao mesmo tempo o OAuth/DCR do mesmo MCP: **defeito de design de arquitetura**, que amplifica a instabilidade de troca de credenciais e reautenticação.

### Questão 2: por que a segunda autenticação dá timeout

A causa raiz direta está confirmada:

- O caminho de start da Session codifica o limite de espera do OAuth humano com **15 segundos**.
- Esse valor sobrepõe o padrão de **5 minutos** de `oauth.ts`.
- Após 15 segundos, a conexão é marcada como `MCP server plugin:exa:exa OAuth authorization timed out`, o callback server local é fechado e o PKCE verifier do state atual é limpo.
- O usuário normalmente não consegue terminar de forma estável dentro de 15 segundos o login no navegador, a seleção de team, a leitura da página e o clique em Authorize.

A própria conexão em segundo plano da página de configurações geralmente não passa 15 segundos e usa 5 minutos; mas o lease da página de configurações e o lease da Session são construídos por padrão com isolamento de session, portanto eles têm `mcpConnectionId`, porta de callback, state e URL de navegador diferentes. A espera de 5 minutos da página de configurações não consegue estender nem assumir os 15 segundos de OAuth da Session.

**Qualificação:**

- a Session limitando a autorização humana no navegador a 15 segundos: **bug de implementação / bug de comportamento de produto**.
- a página de configurações e a Session criando múltiplas transações de autorização independentes para a mesma identidade OAuth, sem single-flight entre lease/process: **defeito de design de arquitetura**.
- a limpeza por timeout do callback listener e do state PKCE está, em si,basically correta e não é a causa raiz de state stale.

### Erro `Server Components render` da Exa

O gatilho mais forte do lado do ZCode é:

1. No registro DCR, a porta localhost aleatória daquel rodada é gravada em `redirect_uris`.
2. Cada sessão OAuth posterior passa a escutar outra porta aleatória diferente.
3. O ZCode prioriza o reaproveitamento do `client_id` antigo persistido.
4. Por isso, após uma falha de refresh, a reautorização pode emitir "antigo `client_id` + novo `redirect_uri`".

A porta do redirect URI do client registrado na máquina atual é `54735`; a autorização que falhou em 2026-08-13 usou portas novas como `58670` e `58676`. Se a Exa fizer correspondência exata do redirect URI do DCR, isso dispara uma falha de validação de redirect; quando a página de autorização Next.js da Exa não converte isso em uma página de erro OAuth normal, pode se manifestar como um erro genérico de Server Components em produção.

Essa é uma **inferência de alta confiança, não uma stack de servidor da Exa capturada diretamente**. A RFC 8252 permite que um cliente nativo loopback use qualquer porta na autorização, e um servidor conforme pode ignorar a diferença de porta; não há trace de rede autenticado desta análise, então não é possível confirmar se a Exa implementa essa exceção. Em uma sonda anônima somente leitura, os dois redirects retornaram `307` para a entrada de login, o que indica que a Exa adia a validação final para depois do login e não foi possível confirmar nem descartar o mismatch na fase anônima.

Além disso, múltiplas conexões concorrentes produzindo múltiplos client/state/authorization URL fazem o usuário poder clicar em uma URL já expirada ou na URL de uma conexão que não é a alvo; esse é um fator de amplificação confirmado. A própria página da Exa substituir erros OAuth estruturados por um erro SSR genérico também é um problema de robustez da página do outro lado.

## 2. Limites de fato e níveis de evidência

Este documento usa as seguintes marcações:

- **Confirmado**: pode ser provado diretamente por código, logs ou estado persistido local.
- **Inferência fortemente consistente**: o comportamento da implementação corresponde à forma observada, mas faltam logs do token endpoint ou do servidor da Exa.
- **Candidato a gatilho**: válido no protocolo, mas as evidências atuais não permitem ordená-lo como causa raiz única.

Evidências-chave não obtidas:

- status HTTP, `error` e `error_description` da Exa `/api/oauth/token` para o refresh que falhou.
- Network trace do navegador em `dashboard.exa.ai` / `auth.exa.ai` com sessão autenticada e o digest do Next.js.
- client registry, validação de redirect e stack de Server Components do servidor da Exa.

Portanto, este documento não escreve `invalid_grant`, `invalid_redirect_uri` ou a remoção do DCR client pela Exa como fatos observados diretamente.

## 3. Configuração real do plugin e OAuth discovery

### 3.1 Configuração real do plugin carregado

Manifest real do plugin oficial:

`~/.zcode/cli/plugins/cache/claude-plugins-official/exa/3.4.0/.claude-plugin/plugin.json:10-17`

```json
{
  "exa": {
    "type": "http",
    "url": "https://mcp.exa.ai/mcp?client=claude-code-plugin",
    "headers": {
      "x-exa-source": "claude-code-plugin"
    }
  }
}
```

O diretório raiz do plugin também tem `mcp.json:3-9`, cujo parâmetro de URL é `client=agent-plugin`. Mas o loader atual procura por padrão `.mcp.json` (com ponto inicial), e esse diretório não tem `.mcp.json`; a definição real vem do manifest. Se existisse `.mcp.json`, o loader usaria `{ ...fromFile, ...fromManifest }`, com o manifest sobrescrevendo itens de mesmo nome, conforme:

- `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts:17-24`
- `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts:34-42`

Portanto, a configuração real atual e o prefixo de credenciais correspondem à URL `claude-code-plugin`, e o `mcp.json` da raiz não entra nesse caminho de carregamento.

O manifest não tem configuração OAuth explícita. Para MCP HTTP/SSE sem Authorization header, o ZCode habilita automaticamente o discovery authorization_code:

- `apps/zcode-cli/packages/adapters/src/mcp/index.ts:1012-1025`

### 3.2 Discovery observado em 2026-08-13

Foi feita uma requisição somente leitura e sem credenciais no endpoint MCP:

```text
HTTP 401
WWW-Authenticate:
  Bearer resource_metadata="https://mcp.exa.ai/.well-known/oauth-protected-resource/mcp"
```

resource metadata:

```text
resource              https://mcp.exa.ai/mcp
authorization_server  https://auth.exa.ai
scope                 mcp:tools
```

authorization server metadata:

```text
authorization_endpoint              https://auth.exa.ai/oauth/authorize
token_endpoint                      https://auth.exa.ai/api/oauth/token
registration_endpoint               https://auth.exa.ai/api/oauth/register
grant_types_supported               authorization_code, refresh_token
code_challenge_methods_supported    S256
token_endpoint_auth_methods         none
```

A Exa declara explicitamente suporte a refresh token e a public client. O scope dela não contém `offline_access`, mas não se pode afirmar a partir disso que ela não emita refresh token; o MCP SDK só adiciona esse scope automaticamente quando o servidor declara `offline_access`.

## 4. Linha do tempo da primeira autorização

A linha do tempo abaixo combina código e logs reais de 2026-08-11. Três conexões OAuth apareceram no mesmo dia; duas falharam em cerca de 15 segundos e a outra teve sucesso após cerca de 74 segundos.

```text
Usuário/navegador     Lease da página de config  Lease Session A/B     OAuth Provider     Exa Auth      Arquivo de credenciais
    |                  |                       |                       |                 |              |
    |                  | connect              | connect               |                 |              |
    |                  +---------------------->|                       |                 |              |
    |                  |                       +---------------------->|                 |              |
    |                  |                       |   cada conexão cria seu próprio callback server     |              |
    |                  |                       |   portas 54723 / 54726 / 54735                     |              |
    |                  |                       |<----------------------|                 |              |
    |                  |                       |                       | discovery       |              |
    |                  |                       |                       +---------------->|              |
    |                  |                       |                       | DCR: redirect_uri=porta da rodada    |              |
    |                  |                       |                       +---------------->|              |
    |                  |                       |                       |<-- client_id ----|              |
    |                  |                       |                       | save client_information         |
    |                  |                       |                       +------------------------------->|
    |<-----------------+-----------------------+--- exibe uma ou mais authorization URL ----|              |
    |                  |                       |                       |                 |              |
    |                  |                       |-- timeout de 15 s ----X                 |              |
    |                  |                       | close callback + limpa verifier do state atual  |              |
    |                  |                       | failed / tools=0                        |              |
    |                  |                       |                       |                 |              |
    | login/seleção de team/clique em Authorize (cerca de 74 s) |                       |                 |              |
    +---------------------------------------------------------------->|<-- callback code-|              |
    |                  |                       |                       | code exchange    |              |
    |                  |                       |                       +---------------->|              |
    |                  |                       |                       |<-- tokens de access/refresh --|
    |                  |                       |                       | saveMany(canonical, client, tokens)
    |                  |                       |                       +------------------------------->|
    | connected / 2 tools   |                       |                 |              |
```

Logs reais (campos minimizados, sem URL, code ou token):

```text
~/.zcode/cli/log/zcode-2026-08-11.jsonl

3779  11:25:53.335Z authorization.required connection=9df9... callback=54723
3781  11:25:53.627Z authorization.required connection=06c8... callback=54726 session=yes
3785  11:25:54.502Z authorization.required connection=85a0... callback=54735
3819  11:26:08.351Z failed connection=9df9... OAuth authorization timed out
3824  11:26:08.631Z failed connection=06c8... OAuth authorization timed out
3936  11:27:08.338Z authorization.completed connection=85a0...
3948  11:27:11.248Z connected connection=85a0... tools=2
```

De `11:25:54.502Z` a `11:27:08.338Z` são cerca de 73,8 segundos, o que prova diretamente que o tempo necessário para a autorização humana pode ser muito maior que 15 segundos e menor que 5 minutos.

## 5. Questão 1: armazenamento, carregamento e invalidação do refresh token

### 5.1 A implementação atual salva e carrega o refresh token

O OAuth provider lê client e tokens a partir do mesmo credential pair:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:182-199`
- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:213-215`
- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:434-505`

Após o token exchange ou o refresh, `saveTokens` publica:

- `authorization_credentials`: par canônico client/token;
- `client_information`: espelho legacy do client;
- `tokens`: espelho legacy dos tokens;

por meio de uma única operação `saveMany`:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:217-250`

`saveMany` atualiza múltiplas keys em um read-modify-write:

- `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts:152-161`

Todo o read-modify-write é protegido por um lock de arquivo entre processos e depois gravado de volta de forma atômica:

- `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts:260-270`

As permissões do arquivo de credenciais no local são `0600`.

Conclusão: na implementação atual, o refresh token não existe apenas em memória nem é sobrescrito sem lock por desktop e CLI sobre o arquivo inteiro.

### 5.2 Proteção do pareamento client/token

A lógica canônica v2 atual trata explicitamente os seguintes casos concorrentes:

- ao apagar o token legacy, não ressuscita o token antigo a partir do canônico: `oauth.ts:439-447`
- só continua usando o par canônico quando o token legacy coincide com o token canônico: `oauth.ts:448-460`
- quando o client não muda, pode aceitar um novo resultado de refresh gravado por um processo antigo: `oauth.ts:461-467`
- quando client e token mudam e não é possível provar que pertencem à mesma transação, mantém o client e descarta o token não confiável: `oauth.ts:468-476`
- ao invalidar um snapshot antigo usa compare-and-delete, sem apagar o novo par que outra transação acabou de gravar: `oauth.ts:334-373`

Testes correspondentes:

- isolamento de state PKCE entre adapters concorrentes: `mcp-oauth.e2e.test.ts:248-349`
- DCR client vinculado à sua própria transação: `mcp-oauth.e2e.test.ts:351-375`
- publicação atômica do par canônico: `mcp-oauth.e2e.test.ts:482-512`
- leitura/escrita de versões mistas: `mcp-oauth.e2e.test.ts:514-601`
- rejeição da combinação de client/token legacy de transações diferentes: `mcp-oauth.e2e.test.ts:603-643`
- compare-and-delete: `mcp-oauth.e2e.test.ts:645-680`
- refresh usando o par canônico vencedor: `mcp-oauth.e2e.test.ts:686-773`

Portanto, na versão atual, a afirmação de que "client e refresh token são frequentemente sobrescritos de forma concorrente em combinações erradas" não tem sustentação estática nem por testes. Versões antigas realmente tinham esse risco, e essa é justamente a razão das correções de compatibilidade e da lógica canônica descritas acima; se processos não atualizados estiverem rodando simultaneamente na máquina, escritas legacy ainda podem fazer o novo reader descartar o token por não conseguir provar o pareamento e exigir reautorização.

### 5.3 Comportamento do SDK após a expiração do access token

Travado no repositório:

`apps/zcode-cli/packages/adapters/package.json:105`

```text
@modelcontextprotocol/client 2.0.0
```

Verificação somente leitura do pacote publicado no npm `@modelcontextprotocol/client@2.0.0/dist/index.mjs`:

- `754-779`: quando existe refresh token, chama primeiro o token endpoint e, após um refresh bem-sucedido, chama `provider.saveTokens`.
- `780-790`: quando não há refresh utilizável ou quando ocorre um erro de refresh do qual é possível recuar, gera nova authorization URL e novo PKCE verifier e entra na autorização interativa.
- `610-624`:
  - `invalid_grant`: invalida os tokens e tenta novamente;
  - `invalid_client` / `unauthorized_client`: invalida client e tokens e tenta novamente.

A implementação de invalidate do provider do ZCode está em:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:296-305`
- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:334-373`

Portanto, o caminho após a invalidação do access token é:

```text
MCP 401
  -> o SDK tenta refresh_token
     -> sucesso: saveTokens, novo access token persistido
     -> invalid_grant: apaga o token, mantém o client, vai para autorização no navegador
     -> invalid_client: apaga client + token, refaz DCR/autorização
     -> alguns server_error: pode recuar direto para a autorização no navegador, sem necessariamente apagar antes o client antigo
```

### 5.4 Estado das credenciais na máquina

O arquivo de credenciais autoritativo é:

```text
~/.zcode/v2/credentials.json
mode: 0600
Prefixo de credencial Exa: mcp:oauth:c50fd1fa63fb88a233be0688
```

Atualmente há apenas:

```text
discovery_state
client_information
```

Atualmente não há:

```text
tokens
authorization_credentials
code_verifier
```

As informações atuais do client estão registradas apenas como resumo anonimizado:

```text
Primeiros 12 caracteres do SHA-256 do client_id: d31ae07a373b
client_name: ZCode plugin:exa:exa
client_secret: nenhum
client_id_issued_at: 2026-08-11T11:25:54Z
grant_types: authorization_code, refresh_token
redirect URI registrado:
  http://127.0.0.1:54735/oauth/callback/mcp/plugin%3Aexa%3Aexa
```

`credentials.json:27-28` também mostra apenas as duas keys da Exa acima; este documento não leu nem registrou nenhum token em texto claro.

As keys da Exa nos arquivos históricos de backup/reset manual também têm apenas client/discovery/verifier, sem token, e o client mudou várias vezes:

```text
credentials.json.exa-backup-20260725-215609   client hash c27de9b37128
credentials.json.exa-backup-20260725-215921   client hash 1ed8dd1faa86
credentials.json.exa-backup-20260725-220036   client hash a040da9c8465
credentials.json.exa-reset-20260811-192515    client hash fa0c35e0d90f
credentials.json                              client hash d31ae07a373b
```

Os próprios nomes de arquivo indicam que o local contém backup/reset manuais. Logo:

- "atualmente não há token" é fato;
- "todos os tokens foram apagados anormalmente pelo programa" não é uma conclusdemonstrável;
- a geração repetida de novos DCR clients é fato, consistente tanto com a concorrência de múltiplas transações de autorização quanto com resets manuais.

O `~/.zcode/db` indicado pelo usuário não existe nesta máquina; o SQLite real está em `~/.zcode/cli/db/db.sqlite`. Seu schema não tem tabela de credenciais OAuth/MCP, e a fonte autoritativa das credenciais OAuth continua sendo `~/.zcode/v2/credentials.json`.

### 5.5 Linha do tempo de execução

```text
~/.zcode/cli/log/zcode-2026-08-12.jsonl

1816  08:54:49.770Z  Exa connected, tools=2
1899  09:00:13.958Z  Exa authorization.required, callback=61820
1909  09:00:28.969Z  OAuth authorization timed out
```

"Conectar com sucesso primeiro e, cerca de 5 minutos depois, uma nova conexão entrar em autorização" descarta a hipótese de que "a primeira autorização nunca foi salva/nunca teve efeito". Isso é consistente com o token ter sido invalidado depois ou não ser renovável por refresh.

### 5.6 Conclusões de causa raiz da Questão 1

| Camada | Conclusão | Nível de evidência | Qualificação |
|---|---|---:|---|
| Gatilho direto | Não há token utilizável, então o SDK só pode reautorizar | Confirmado | Fato de estado |
| Fluxo de refresh | Quando há refresh, ele é carregado, é tentado e é persistido após o sucesso | Confirmado | Implementação correta |
| Após falha de refresh | `invalid_grant` apaga o token; `invalid_client` apaga client+token | Confirmado | Degradação razoável |
| Erro de refresh específico | Não registrado nos logs, impossível determinar de forma única | Lacuna confirmada | Defeito de design de observabilidade |
| Sobrescrita multiprocesso atual | Par canônico + lock de arquivo já protegem as gravações normais | Confirmado | Não é a causa raiz principal atual |
| Escrita mista de processo antigo/legacy | Descarta o token quando não consegue provar o pareamento | Comportamento de código confirmado | Risco de compatibilidade |
| OAuth/DCR concorrente | Leases/processos diferentes podem autorizar e registrar clients repetidamente | Confirmado | Defeito de design de arquitetura |

## 6. Questão 2: a cadeia de timeout de 15 segundos e o isolamento das conexões

### 6.1 De onde vem os 15 segundos

Definição no runtime da Session:

- `apps/zcode-cli/packages/core/src/runtime/methods/mcp.ts:5`

```ts
const MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS = 15_000;
```

Passado no start da Session:

- `apps/zcode-cli/packages/core/src/runtime/methods/mcp.ts:37-46`

```ts
connectConfiguredServers(servers, {
  oauthAuthorizationTimeoutMs: MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS,
  // ...
})
```

O adapter o repassa para a sessão OAuth:

- `apps/zcode-cli/packages/adapters/src/mcp/index.ts:680-719`
- `apps/zcode-cli/packages/adapters/src/mcp/index.ts:770-787`

```ts
authorizationTimeoutMs:
  oauthAuthorizationTimeoutMs ?? this.mcpOAuth?.authorizationTimeoutMs
```

Ao aguardar o callback, o que é realmente usado é `oauthSession.timeoutMs`:

- `apps/zcode-cli/packages/adapters/src/mcp/index.ts:570-600`

```ts
withTimeout(
  oauthSession.waitForAuthorizationCallback(),
  oauthSession.timeoutMs,
  `MCP server ${name} OAuth authorization timed out`,
)
```

O padrão de 5 minutos do módulo OAuth só vale quando o chamador não sobrescreve:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:20`
- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:96-107`

```ts
timeoutMs:
  input.options?.authorizationTimeoutMs
  ?? DEFAULT_MCP_OAUTH_CALLBACK_TIMEOUT_MS
```

Portanto, se a segunda autenticação for disparada pelo startup da Session, ela certamente atinge 15 segundos, e não 5 minutos.

### 6.2 Por que a página de configurações não consegue salvar a Session

A `mcp/list` da página de configurações não passa `oauthAuthorizationTimeoutMs` ao iniciar a conexão em segundo plano:

- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts:81-105`

Essa conexão normalmente usa o padrão de 5 minutos. Os logs mostram várias conexuções sem session que só deram timeout depois de cerca de `300xxx ms`, por exemplo:

```text
~/.zcode/cli/log/zcode-2026-08-11.jsonl:1920
durationMs=300864
error=MCP server plugin:exa:exa OAuth authorization timed out
```

Porém, o entrypoint do protocolo dá leases diferentes à página de configurações e à Session:

- página de configurações: `protocol-settings`
- Session: `appOptions.sessionId`

Conforme:

- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts:101-115`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts:126-133`

O isolamento padrão do pool de conexões é `session`, e a connection key usa `leaseId` para servidores sem isolamento por workspace:

- `apps/zcode-cli/packages/adapters/src/mcp/pool.ts:296-308`
- `apps/zcode-cli/packages/adapters/src/mcp/pool.ts:317-328`

Portanto:

```text
lease protocol-settings
  -> conexão A
  -> porta de callback A
  -> state A
  -> padrão de 5 minutos

lease de session
  -> conexão B
  -> porta de callback B
  -> state B
  -> 15 segundos
```

O reaproveitamento de conexão pending em `index.ts:153-168` só vale dentro do mesmo adapter/record e não pode ser compartilhado entre entradas do pool.

### 6.3 Evidência de runtimes concorrentes em 2026-08-13

```text
~/.zcode/cli/log/zcode-2026-08-13.jsonl

6657  08:25:15.711Z required
      connection=461a95... session=yes callback=58676 state=17f0...
6658  08:25:15.747Z required
      connection=fb8aa7... session=no  callback=58670 state=7c51...

6680  08:25:30.722Z connection=461a95... timed out
6683  08:25:30.754Z connection=fb8aa7... timed out
```

Duas conexções estabeleceram, ao mesmo tempo, portas de callback e states diferentes para o mesmo servidor Exa, e ambas falharam cerca de 15 segundos depois. Isso prova diretamente que o runtime atual não forma um OAuth single-flight global.

### 6.4 Linha do tempo da falha na segunda autorização

```text
Session/página de config    OAuth Provider       Arquivo de credenciais    MCP SDK         Exa Auth/Página      Navegador
     |                    |                   |                 |                    |               |
     | connect            |                   |                 |                    |               |
     +------------------->| carrega client/tokens                 |                    |               |
     |                    +------------------>|                 |                    |               |
     |                    |<-- client antigo; token pode existir/não existir |                    |               |
     |                    |                   |                 | MCP 401 / refresh |
     |                    +------------------------------------>|------------------->|
     |                    |                   |                 |                    |
     |                    |                   |      refresh falhou/indisponível             |
     |                    |<------------------------------------|                    |
     |                    | invalida token (erro específico não registrado) |                    |
     |                    +------------------>| apaga o token   |                    |
     |                    |                   |                 |                    |
     |                    | nova porta de callback aleatória + novo state   |                    |
     |                    | reutiliza o client_id antigo                   |                    |
     |                    +------------------------------------>| requisição authorize |
     |                    |                                     | client_id antigo     |
     |                    |                                     | novo redirect_uri    |
     |                    |                                     +------------------->|
     |                    |                                     |                    | página Authorize
     |                    |                                     |                    | pode haver SSR error
     |                    |                                     |                    |
     |<-- authorization URL/status -----------------------------+                    |
     |                                                                 15 s de timer      |
     |--------------------------- 15 segundos ------------------------------X               |
     |                    | fecha o callback server                                   |
     |                    | limpa o verifier do state atual                          |
     |<-- failed/tools=0  |                                                         |
     |                                                                 usuário clica depois  |
     |                                                                 callback na porta antiga
     |                                                                 -> fechada/falha  |
```

Se for uma conexão independente da página de configurações, o último ponto de tempo é normalmente 5 minutos; ele ainda pode existir em paralelo à transação de 15 segundos da Session.

### 6.5 O timeout deixa state stale?

callback server:

- escuta aleatoriamente `127.0.0.1:0`: `apps/zcode-cli/packages/adapters/src/auth/localhost-callback.ts:69-83`
- verifica estritamente path, state e code: `localhost-callback.ts:32-59`
- `close()` fecha o HTTP server: `localhost-callback.ts:83-90`

Sessão OAuth:

- `close()` fecha primeiro o callback server e depois o provider: `oauth.ts:96-100`
- o `close()` do provider limpa o verifier do state atual: `oauth.ts:312-331`
- a key do verifier inclui o state completo: `oauth.ts:538-545`

Atualmente não há `code_verifier` da Exa nas credenciais, o que é consistente com uma limpeza bem-sucedida. `discovery_state` é mantido, e isso é discovery metadata reutilizável, e não callback stale state.

O que realmente sobra é:

- authorization URLs ainda abertas no navegador cujo callback port já foi fechado;
- DCR clients já registrados no servidor da Exa e que não são mais usados;
- o usuário virando-se para múltiplas URLs sem saber qual ainda é válida.

Portanto:

- listener de callback local não limpo: **não, nada encontrado**.
- apagamento ou resíduo cruzado de verifier PKCE entre states: **a implementação atual e o estado observado não sustentam essa conclusão**.
- URL de browser stale / DCR client stale: **existe um caminho de geração por design**.

## 7. Cadeia de evidências do erro de Server Components da Exa

### 7.1 Client antigo e novo redirect URI

Cada sessão OAuth cria um novo state e uma porta aleatória:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:67-80`
- `apps/zcode-cli/packages/adapters/src/auth/localhost-callback.ts:69-83`

O metadata do DCR usa a URL de callback completa da rodada:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:163-175`

Depois ele lê e prioriza o client armazenado:

- `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts:182-199`

Ao construir a requisição de autorização, o MCP SDK usa:

- `clientInformation`: o client antigo;
- `provider.redirectUrl`: a nova porta aleatória atual.

Conforme o pacote npm:

- `@modelcontextprotocol/client@2.0.0/dist/index.mjs:698-730`
- `@modelcontextprotocol/client@2.0.0/dist/index.mjs:780-790`

Comparação local:

```text
Porta de redirect registrada: 54735
Exemplos de portas em logs posteriores: 61820, 58670, 58676
```

Isso prova que o ZCode de fato constrói a combinação "client persistido + nova porta de callback".

### 7.2 Por que só é possível classificar como inferência de alta confiança

Foi feita uma sonda somente leitura, sem sessão autenticada e sem clique de autorização, contra o client anonimizado atual:

```text
redirect registrado  -> HTTP 307 -> auth.exa.ai /?callbackUrl=...
redirect divergente   -> HTTP 307 -> auth.exa.ai /?callbackUrl=...
```

As duas requisições entram primeiro na página de login, e a resposta anônima não expôs o resultado final da validação de redirect nem gerou erro de Server Components. Portanto:

- não é possível afirmar que `invalid_redirect_uri` já foi capturado;
- não é possível descartar que a Exa permita corretamente a variação de porta loopback conforme a RFC 8252;
- o erro SSR genérico na página autenticada ainda precisa de confirmação por Network trace ou logs da Exa.

A página ainda exibe `Authorize ZCode plugin:exa:exa`, o que mostra que ela pelo menos conseguiu obter a informação de exibição do client; isso reduz a probabilidade de "client_id completamente inexistente", mas não descarta estado de client incompleto, vínculo de time anômalo ou registro de autorização anômalo.

### 7.3 Outros candidatos a gatilho

Ordenados pelas evidências atuais:

1. **Anomalia na validação/tratamento de página do redirect com DCR client antigo + nova porta de callback**
   A combinação do ZCode está confirmada; não se confirmou se a Exa a rejeita.
2. **authorization URLs concorrentes / URLs já expiradas**
   Múltiplas conexões, múltiplos states e múltiplas portas já foram confirmadas nos logs. O usuário pode fazer login ou clicar na transação errada.
3. **Anomalia de dados no servidor do Exa Personal team / account**
   Compatível com o erro de Server Components da página, mas não há evidência do lado do ZCode para verificá-lo.
4. **Conflito do próprio DCR repetido**
   Está confirmado que o ZCode gera múltiplos clients; mas o DCR normalmente permite registrar múltiplos clients e não há evidência de conflito retornado pela Exa.

### 7.4 Qualificação

- O ZCode reaproveitar por muito tempo um DCR client atrelado a um callback URI específico e ao mesmo tempo usar uma porta de callback aleatória a cada uso: **defeito de fronteira de implementação/design**. Mesmo que a Exa suporte a exceção de porta loopback, não se deve depender de um comportamento permissivo do servidor que não foi verificado.
- Falta de single-flight do ZCode para uma mesma identidade OAuth, gerando múltiplas URLs e múltiplos DCR clients: **defeito de design de arquitetura**.
- A página da Exa exibindo problemas de parâmetros OAuth/dados de conta como um generic Server Components production error: **bug de robustez da página da Exa**.

## 8. Cobertura de testes e lacunas

Testes já existentes cobrem:

- reaproveitamento de OAuth pending dentro de um único adapter, com timeout do caller limitado sem fechar a conexão compartilhada: `mcp.test.ts:880-932`
- timeout de OAuth por conexão em vigor: `mcp.test.ts:994-1032`
- isolamento de PKCE entre dois adapters concorrentes: `mcp-oauth.e2e.test.ts:248-349`
- vínculo transacional do DCR client, par canônico, versões mistas e refresh: ver a seção 5.2.

Lacunas principais:

1. Não há teste de "quando o DCR client é reconstruído após recriar a session, a porta registrada difere da nova porta de callback".
2. Não há simulação estrita da correspondência exata de `redirect_uri` pelo servidor de autorização ou da exceção de porta loopback da RFC 8252.
3. Não há cobertura da autorização paralela do mesmo servidor por `lease protocol-settings + lease de session`.
4. Não há teste do estado completo do ZCode, dos logs e da URL de segunda autorização depois que o refresh retorna `invalid_grant`.
5. Não há teste de comportamento de produto para autorização humana que leva mais de 15 segundos.
6. Não há asserção de que o erro do token endpoint é registrado de forma anonimizada e diagnosticável como event.

## 9. Sugestões de correção (apenas sugestões, sem implementação)

### P0: corrigir o timeout de 15 segundos da autorização humana

Não deixar que o orçamento de bloqueio do startup da Session seja igual ao ciclo de vida da transação OAuth:

```text
Orçamento de start da Session: 15 segundos
  -> apenas decide se esta Session continua aguardando
  -> não fecha a transação OAuth global / da página de configurações

Ciclo de vida da transação OAuth
  -> 5 minutos independentes ou cancelamento do usuário
  -> o estado permanece visível na página de configurações
  -> após o sucesso, as Sessions seguintes reutilizam as credenciais automaticamente
```

Se não for possível separar os ciclos de vida por enquanto, ao menos não usar um fechamento rígido de 15 segundos para uma transação OAuth que já entrou na interação do navegador.

### P0: adicionar single-flight para a mesma identidade OAuth

A chave de coordenação deve se basear na identidade da credencial OAuth, e não no lease da conexão:

```text
serverName + serverUrl + clientId + scope + redirectPath
```

Apenas um líder é permitido:

- executar discovery/DCR;
- manter o callback server/state/verifier;
- expor uma única authorization URL;
- publicar o par client/token.

As demais conexões de settings/session apenas assinam o resultado dessa transação, e o timeout de 15 segundos do waiter de startup de cada uma não pode cancelar o líder.

Entre processos Node são necessários lock/lease de arquivo ou gerenciamento centralizado em um host compartilhado; `record.connecting` dentro de um único adapter não basta.

### P0: estabilizar a relação entre DCR e callback URI

Sugere-se avaliar por prioridade:

1. usar um callback broker estável / deep link e deixar o ZCode encaminhar para a transação atual;
2. se insistir no loopback, registrar um redirect nativo sem porta fixa e confirmar que a Exa suporta qualquer porta conforme a RFC 8252;
3. se a Exa aceitar apenas URIs exatos, ao descobrir que o callback URI atual não está no conjunto registrado do client, invalidar primeiro o client antigo e refazer o DCR, sem reutilizar o client antigo;
4. incorporar a compatibilidade de redirect ao cache de capability de discovery/DCR e aos testes.

### P1: adicionar eventos de diagnóstico OAuth anonimizados

Deve-se registrar, mas nunca registrar token, code ou client secret:

```text
event=mcp.oauth.refresh.failed
mcpServerName
oauthErrorCode=invalid_grant | invalid_client | server_error | transport_error
httpStatus
clientIdHash
credentialPairVersion
credentialSource=canonical | legacy
willInvalidate=client | tokens | none
willStartInteractive=true/false
```

Na falha da página de authorize, também se deve registrar:

```text
clientIdHash
registeredRedirectOrigin/path/portHash
currentRedirectOrigin/path/portHash
stateIdHash
connectionId
leaseId/isolation
```

### P1: melhorar a UX de URLs stale

- Depois que a authorization URL expira, a página de configurações deve mostrar claramente "este link expirou, gere um novo link".
- Quando várias conexões pedem o mesmo OAuth, mostrar apenas a URL do líder.
- Quando o callback chega a uma porta já fechada, se for adotado um broker, exibir uma página recuperável em vez de uma falha de conexão do navegador.

### P1: completar os testes de regressão

Adicionar no mínimo:

- `refresh invalid_grant -> tokens invalidated -> one interactive transaction`
- `stored DCR client + new loopback port`
- `settings lease + N session leases -> one DCR/one URL`
- `session waiter 15s timeout -> leader remains alive -> callback at 60s succeeds`
- `old browser URL after replacement -> explicit stale response`
- `OAuth error log contains code/status but never contains token/code/secret`

## 10. Tabela final de qualificação

| Questão | Causa raiz / fatores | Qualificação |
|---|---|---|
| Reautenticação exigida depois de algum tempo | O token não existe mais; após o refresh não recuperar, entra em autorização interativa | Mecanismo direto confirmado |
| O refresh token é salvo/carregado | A implementação atual salva, carrega e atualiza após o refresh | Não é bug |
| Por que o refresh falhou desta vez | Falta o error code do token endpoint, impossível determinar de forma única | Defeito de design de observabilidade |
| Sobrescrita de client/token entre processos | O par canônico atual e o lock de arquivo já protegem; processos antigos ainda têm risco de compatibilidade | Não é a causa raiz principal atual / risco de implementação histórica |
| A segunda autenticação deu timeout | A Session codifica 15 segundos e fecha a própria sessão OAuth | Bug de implementação |
| Por que os 5 minutos da página de configurações são inúteis | Settings e session são leases e conexões diferentes | Defeito de design de arquitetura |
| Callback/verifier após o timeout | Listener fechado e verifier do state atual limpo | Implementação basicamente correta |
| State stale | URL antiga no navegador, DCR client obsoleto e múltiplas URLs coexistindo | Defeito de design |
| Erro de Server Components da Exa | Mais provavelmente disparado por client antigo/redirect novo ou por URLs stale concorrentes; o erro de servidor não foi capturado | Defeito de fronteira do ZCode + bug de robustez da página da Exa |

## 11. Causa raiz em uma frase

O ZCode implementou incorretamente "a Session espera no máximo 15 segundos pelo MCP" como "a transação de autorização OAuth humana só pode viver 15 segundos", e ao mesmo tempo a página de configurações e a Session criam transações OAuth/DCR separadas por lease; quando o refresh deixa de estar disponível, o sistema reutiliza ou recria o client em múltiplas portas de callback aleatórias e gera várias authorization URLs, o que resulta em um timeout curto sempre reproduzível e com alta probabilidade de disparar o tratamento pouco robusto da página de autorização da Exa para client/redirect/transação stale.