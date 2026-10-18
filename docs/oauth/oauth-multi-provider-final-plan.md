# OAuth Multi-Provedor: Plano Final de Mudança (Final)

Status do documento: atualizado conforme a decisão de convergência do OAuth callback de 2026-07-16. O OAuth do Desktop atual suporta apenas o callback unificado `zcode://oauth/callback` e não suporta mais hosts de callback específicos de provider.

Documentos relacionados:

- `docs/superpowers/specs/2026-03-31-bigmodel-oauth-login-design.md`（o plano de provider único BigModel já publicado hoje）

## 0. Escopo e Fronteiras

- Nesta rodada, este plano cobre apenas **Desktop (Electron)**.
- O OAuth da Web não está no escopo de implementação desta rodada; o design e a implementação correspondentes ficam para depois.

## 1. Contexto

O branch atual já concluiu o ciclo de login OAuth do BigModel e, em termos de usabilidade, atende ao «login de provider único».
Mas, caso mais providers OAuth sejam integrados depois (por exemplo GitHub, Google, SSO corporativo), a implementação atual continua inclinada ao provider único tanto na interface de serviço, quanto no roteamento de deep link, no namespace de armazenamento de credenciais e no modelo de UI.

Este documento dá a estrutura objetivo final e o caminho de implantação por fases, com o objetivo de elevar o OAuth a uma arquitetura «plugável, multi-provider e sustentável ao longo do tempo», sem quebrar a experiência de login BigModel existente.

## 2. Problemas Atuais (com base no código atual)

1. A configuração e a implementação do OAuth estão fortemente acopladas aos detalhes do protocolo BigModel: parâmetro `authCode`, contrato de troca `tokenByAuthCode`, campos específicos de user info.
2. A fase histórica de provider único do BigModel usava um deep link específico do provider; hoje isso já foi convergido para o `zcode://oauth/callback` unificado.
3. `IOAuthService` não tem dimensão de provider, então o chamador não consegue expressar «qual login de provider eu quero iniciar».
4. As keys de credencial não têm namespace por provider, e com vários providers no futuro o token e o user info vão se sobrescrever mutuamente.
5. O texto e o modelo de interação da UI são de «um único botão de login BigModel», sem ponto de extensão de lista de providers/estratégia.
6. Atualmente não há uma estratégia explícita de login concorrente (o comportamento de cliques rápidos e consecutivos em providers diferentes na mesma janela não está definido).

## 3. Objetivo Final

### 3.1 Objetivos de Capacidade

1. O mesmo fluxo principal de OAuth pode atender a múltiplos providers (Provider Adapter plugável).
2. Cada provider gerencia de forma independente state, token, userinfo e tratamento de erros, sem se poluir mutuamente.
3. A camada de UI consegue exibir a entrada de providers orientada por configuração, habilitando/desabilitando providers conforme a necessidade.
4. Compatibilidade com os dados e a entrada de login BigModel já existentes, com migração suave.

### 3.2 Estratégia de Produto (restrições explícitas)

1. **Provider ativo único**: em cada momento se mantém apenas um `active_provider`.
2. Depois que o login de um novo provider é bem-sucedido, o `active_provider` passa a ser o novo provider (o token do provider antigo pode ser mantido ou limpo conforme a estratégia do Service).
3. **Um único pending por janela**: só é permitido um fluxo OAuth pendente por janela; ao iniciar um novo login, o pending antigo é cancelado automaticamente.

### 3.3 Objetivo de Arquitetura (seguindo as camadas)

Dentro do domínio de OAuth, manter dependência unidirecional:

`Types -> Config -> Repo -> Service -> Runtime -> UI`

A preocupação transversal (autenticação) passa uniformemente pela entrada de Providers, e a camada de UI/negócio não pode contornar os Providers e montar diretamente os detalhes do protocolo OAuth de terceiros.

## 4. Design da Estrutura Objetivo

### 4.1 Camada de Types

Adicionar em `packages/shared` os tipos de domínio de OAuth:

- `OAuthProviderId` (por exemplo `"bigmodel" | "github" | ...`)
- `OAuthStartRequest` / `OAuthStartResponse`
- `OAuthCallbackParams` (o `code/state/...` já normalizado)
- `OAuthTokenSet`
- `OAuthUserProfile`
- `OAuthProviderMeta`
- `OAuthLogoutScope` (`"active" | "all"`)

Princípio: os tipos expressam apenas semântica de domínio genérica, sem carregar nomes de campo específicos de fabricante.

### 4.2 Camada de Config

- Manter apenas a configuração pública (endereço de autorização, template de redirect, nome de exibição, se está habilitado, ordenação etc.).
- Campos sensíveis como `clientSecret` e parâmetros privados de troca não ficam em `packages/shared` nem em caminho visível ao renderer.
- A configuração sensível é injetada em runtime pelo processo de host.

Restrições desta rodada no Desktop:

1. Ambiente de desenvolvimento: usar o `.env.local` local (já no `gitignore`) injetado no processo de host.
2. Ambiente de empacotamento: injetar variáveis de ambiente de runtime pela pipeline de build, sem escrever no repositório de código.
3. Marcação de risco: se a interface de terceiros exigir que o cliente carregue um `appSecret`, isso é um risco alto em nível de protocolo e a documentação precisa declarar explicitamente que «pode ser extraído por engenharia reversa».
4. Direção recomendada: no médio/longo prazo, descer a troca de tokens para um backend controlado, e o Desktop passa a deter apenas o código de autorização de curta duração.

### 4.3 Camada de Providers (núcleo)

Diretório sugerido: `packages/services/src/oauth/providers/`.

Definir a interface do adapter de provider (ilustrativo):

```ts
interface OAuthProviderContext {
  providerId: OAuthProviderId;
  redirectUri: string;
  state: string;
  now: () => number;
}

interface OAuthProviderAdapter {
  providerId: OAuthProviderId;
  parseCallbackParams(url: string): OAuthCallbackParams; // obrigatório: adaptar diferenças como authCode/code
  buildAuthorizeUrl(ctx: OAuthProviderContext): string;
  exchangeToken(params: OAuthCallbackParams, ctx: OAuthProviderContext): Promise<OAuthTokenSet>;
  fetchUserInfo?(tokenSet: OAuthTokenSet, ctx: OAuthProviderContext): Promise<OAuthUserProfile>;
  refreshToken?(tokenSet: OAuthTokenSet, ctx: OAuthProviderContext): Promise<OAuthTokenSet>;
  normalizeError(error: unknown): Error;
}
```

Restrição: o Adapter trata apenas das diferenças de protocolo, não opera diretamente o `credentialService`, mantendo uma responsabilidade puramente de protocolo.

### 4.4 Camada de Repo

Diretório sugerido: `packages/services/src/oauth/repo/`.

Namespace de keys unificado:

- `oauth:<provider>:access_token`
- `oauth:<provider>:refresh_token`
- `oauth:<provider>:user_info`
- `oauth:active_provider`

A migração das keys antigas usa **migração preguiçosa** (evitando corrida de migração completa no startup):

1. Ler primeiro a key nova.
2. Quando a key nova estiver ausente, fazer fallback para a key antiga (`auth_token` / `refresh_token` / `user_info`).
3. Depois de ler o valor antigo, gravar imediatamente na key nova.
4. Após a gravação bem-sucedida, apagar a key antiga.

### 4.5 Camada de Service

`IOAuthService` é evoluído para provider-aware (ilustrativo):

```ts
interface IOAuthService {
  getProviders(): Promise<OAuthProviderMeta[]>;
  getActiveProvider(): Promise<OAuthProviderId | null>;
  startOAuth(provider: OAuthProviderId): Promise<{ authorizeUrl: string; state: string }>;
  handleCallback(url: string): Promise<UserInfo>;
  refreshToken(provider?: OAuthProviderId): Promise<void>;
  logout(provider?: OAuthProviderId): Promise<void>; // sem argumento, sai do active provider
  logoutAll(): Promise<void>;
  cancelPending(provider?: OAuthProviderId): Promise<void>;
}
```

Estrutura de estado:

- `state -> { provider, createdAt, timeout, sourceWindowId? }`

Estratégia de concorrência:

1. No `startOAuth`, se já houver um pending, executar `cancelPending()` primeiro e só então criar o novo state.
2. Isso evita que logins concorrentes na mesma janela deixem a atribuição do callback indefinida.

Estratégia de logout:

1. `logout()` padrão: sai apenas do `active_provider` atual.
2. `logout(provider)`: sai do provider especificado (compatível com o futuro cenário de «pré-limpeza de provider não ativo»).
3. `logoutAll()`: limpa as credenciais de todos os providers.
4. Depois que o `active_provider` é deslogado, ele é esvaziado ou, conforme a estratégia, alternado para o provider válido mais recente (nesta rodada recomenda-se esvaziar, que é o comportamento mais claro).

### 4.6 Camada de Runtime / Platform

O roteamento de deep link do Desktop main é unificado em uma única entrada:

- Caminho atual: `zcode://oauth/callback?...`
- Caminho antigo removido: `zcode://bigmodel-auth/callback?...`
- Caminho antigo removido: `zcode://zai-auth/callback?...`

Estratégia de convergência:

1. Quando o novo cliente inicia o OAuth, usa `zcode://oauth/callback` como `redirect_uri`, independentemente do provider.
2. O processo Desktop main reconhece apenas o host `oauth`; a atribuição do provider não é inferida pelo host do callback.
3. O roteamento do callback continua tendo o `state` como índice autoritativo; o `OAuthService` do lado do renderer recupera o provider que iniciou o login pelo pending state.
4. Deixa de existir a capacidade de sobrescrever via variáveis de ambiente `ZAI_OAUTH_REDIRECT_URI` / `BIGMODEL_OAUTH_REDIRECT_URI` e o legacy redirect URI, evitando que o ambiente de publicação produza novamente o callback antigo.

`registerOAuthState` pode anexar o provider (opcional), mas o `state` continua sendo o índice autoritativo final.

### 4.7 Camada de UI

- `useOAuth` passa a `startLogin(provider)`.
- O LoginDialog evolui de «botão único» para «lista de providers orientada por configuração».
- O texto de i18n passa a ser um template genérico mais um mapeamento de nome de exibição por provider, removendo o texto hardcoded de BigModel.
- BigModel permanece no topo por padrão, garantindo que o caminho dos usuários atuais não mude.

## 5. Plano de Implementação por Fases

### Fase 0: Segurança e contenção (tem que ser feito primeiro)

1. Remover informações sensíveis hardcoded do código (especialmente `clientSecret`).
2. Concluir a rotação de chaves.
3. Adicionar varredura de secrets no CI (pre-commit + pipeline).
4. Adicionar o alerta documental de «risco de secret no cliente» e uma checagem pré-publicação.

**Critério de saída**: o repositório não tem secret em texto puro; o novo build consegue fazer login no BigModel por configuração de runtime; a declaração de risco está explícita.

### Fase 1: Abstração da camada de serviço (sem mudar o comportamento da UI)

1. Introduzir o Provider Adapter (com `parseCallbackParams`).
2. Definir `OAuthProviderContext`.
3. Introduzir a camada `repo/` e concluir as keys com namespace de provider.
4. Entregar na camada `repo/` a **migração preguiçosa** das keys antigas (quando a leitura da key nova falhar, fazer fallback para a antiga, regravando a nova e apagando a antiga).
5. Adicionar a `IOAuthService` as capacidades de provider, logout e active provider.
6. Manter a UI exibindo apenas BigModel (a abstração é feita só internamente).

**Critério de saída**: a funcionalidade do BigModel não regride; adicionar um novo provider exige apenas um novo adapter + config.

### Fase 2: Roteamento genérico de deep link + compatibilidade de transição

1. O processo main suporta o duplo roteamento de path antigo e novo.
2. Concluir o fluxo de troca do redirect URI (primeiro o cliente, depois o servidor).
3. Completar os testes de roteamento de cold start/múltiplas janelas.

**Critério de saída**: o callback de qualquer provider é roteado corretamente; a migração do BigModel acontece sem interrupção.

### Fase 3: Extensão de UI e i18n

1. Transformar o popup de login em lista de providers.
2. Trocar o texto específico do BigModel por chaves genéricas.
3. Entregar o texto de interação de «provider ativo único» (por exemplo, o aviso de substituição ao fazer login).

**Critério de saída**: a mesma UI consegue iniciar login de múltiplos providers, sem palavra de marca hardcoded.

### Fase 4: Compatibilidade e encerramento

1. Concluir a limpeza das keys antigas (a migração preguiçosa já foi entregue na fase 1).
2. Completar os e2e: múltiplos providers, cancelamento de login, expiração de state, callback anômalo, fechamento de janela etc.
3. Regressão completa: Desktop multiplataforma (macOS, Windows, Linux).

**Critério de saída**: passa por typecheck, lint, testes unitários e os e2e principais; usuários antigos do BigModel migram sem perceber.

## 6. Estratégia de Testes

1. Testes de contrato do Provider Adapter: introduzir `MockProviderAdapter`, com todos os providers compartilhando o mesmo conjunto de casos de contrato.
2. Testes de fixture dos adapters: cada provider complementa apenas fixtures (parâmetros da URL de autorização, exemplos de callback, exemplos de resposta de token/userinfo).
3. Testes de Service:
   - isolamento de estado entre múltiplos providers
   - proteção de concorrência com um único pending
   - troca de `active_provider`
   - comportamento de `logout()` / `logout(provider)` / `logoutAll()`
   - fluxo de migração preguiçosa
4. Testes de integração do Desktop: deep link em cold start/quente, roteamento de múltiplas janelas, compatibilidade de paths antigo e novo.
5. Testes de regressão: com apenas o BigModel habilitado, o comportamento é idêntico ao da versão atual.

## 7. Riscos e Contramedidas

1. **Risco:** as diferenças de contrato entre providers são grandes (nomes de parâmetro, formato de token, diferenças na interface de userinfo).
   **Contramedida:** isolamento obrigatório pela camada de Adapter; o Service consome apenas resultados normalizados.
2. **Risco:** salvar ou usar `clientSecret` no cliente traz risco de extração por engenharia reversa.
   **Contramedida:** injeção em runtime + rotação de chaves + alerta de risco explícito; migração para troca no servidor no médio/longo prazo.
3. **Risco:** credenciais antigas sobrescritas ou perdidas.
   **Contramedida:** keys com namespace de provider + migração preguiçosa + apagar a key antiga só após a escrita atômica.
4. **Risco:** diferenças de comportamento de deep link entre OS causam perda de callback.
   **Contramedida:** manter o lock de instância única, cache de cold start, e2e específico por plataforma e compatibilidade de paths antigo/novo durante a transição.
5. **Risco:** logins concorrentes causam confusão de estado.
   **Contramedida:** um único pending por janela; ao iniciar um novo login, cancelar antes o fluxo antigo.

## 8. Ordem Recomendada de Implantação (sugestão de execução)

1. Fase 0 (segurança)
2. Fase 1 (abstração do serviço)
3. Fase 2 (generalização do deep link)
4. Fase 3 (extensão de UI)
5. Fase 4 (compatibilidade e encerramento)

Essa ordem mantém um «estado publicável» em cada fase e reduz o risco de uma grande mudança de uma só vez.

---

Data de atualização: 2026-04-01