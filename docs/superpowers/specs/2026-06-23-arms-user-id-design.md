# Injeção do userId da conta logada no user.id do ARMS RUM — Design

Data: 2026-06-23
Branch: feat/launch-to-input-telemetry

## Contexto e problema

O desktop atualmente tem dois conjuntos de telemetry, com dimensões de usuário completamente diferentes:

1. **ARMS RUM (`@arms/rum-electron`, init no processo principal do electron)**: `armsRum.init(...)` (`appARMSBootstrap.ts`) **não passa `user`**, e o `buildArmsBrowserInitConfig()` do renderer (`armsRumShared.ts`) também não. Portanto o "usuário" visto no backend do ARMS é apenas uma **sessão anônima** gerada automaticamente pelo SDK. A única dimensão ligada à identidade são três chamadas `armsRum.setConfig("properties", { device_mid, ... })`, onde `device_mid = sha256(app.getPath("userData")).slice(0, 32)` (`index.ts:353`) — **um valor por dispositivo, sem relação com a conta logada**.

2. **Telemetry core próprio (`@zcode/shared` / `packages/services`, `createTelemetryCore`, roda no host filho derivado por fork)**: usa o `userId` real da conta, obtido de `createTelemetryUserIdLoader` (`node.ts:453`), ou seja, o OAuth `loadUserProfile(activeProvider).id`.

**Conclusão**: hoje não há userId de nível de conta no monitoramento ARMS, apenas sessão anônima + `device_mid` de nível de dispositivo. O objetivo é injetar o `userId` real de conta do segundo conjunto no `user.id` do ARMS RUM.

## Fatos arquiteturais-chave

- O SDK do ARMS é inicializado no **processo principal do electron**; o hook de logout OAuth (`oauthService.onProviderLogout`) fica no **host filho derivado por fork** (`utilityProcess`), e o `armsRum` do processo principal não alcança o evento de logout do filho.
- Mas o **próprio processo principal mantém `appTelemetryCredentialService`** (`index.ts:220`), podendo ler o userId diretamente (`createTelemetryUserIdLoader` é baseado nele), sem necessidade de cruzar processos.
- O SDK Electron do ARMS suporta atualização dinâmica em tempo de execução: `armsRum.setConfig("user", { id })` (README L243-246; `IConfiguration.user?: { id?, name?, tags? }`, de `types/client.d.ts` do `@arms/rum-core`).
- No init do processo principal, via autoInject o `user:{ id: getUserId() }` é injetado junto no browser SDK do renderer, portanto **alterar apenas um ponto no processo principal já cobre o envio do processo principal + do processo de renderização**, sem precisar alterar renderer/web.

## Decisões de design (já alinhadas com o usuário)

- **Estratégia de sincronização: sincronização dinâmica**. Tentar definir uma vez no init; atualizar no fim do callback de login e quando a janela recebe foco, para que login/logout/troca de conta sejam refletidos no ARMS.
- **Fallback sem login: preencher com device_mid**. Quando `userId` estiver vazio, usar `device_mid` como `user.id`, garantindo que todo envio tenha uma dimensão de usuário não vazia (granularidade de dispositivo); após o login, sobrescreve com o id real da conta.

## Solução

### Novo módulo: `packages/desktop/src/main/armsUserIdentity.ts`

Responsabilidade única: resolver o "user.id de ARMS que deve ser enviado agora" e gravá-lo no SDK, com deduplicação.

- `createArmsUserIdentitySync(deps)`, com injeção de dependências:
  - `loadUserId: () => Promise<string>` (reaproveita o `createTelemetryUserIdLoader(appTelemetryCredentialService)` já existente no processo principal)
  - `deviceMid: string`
  - `setUser: (user: { id: string }) => void` (por padrão envolve `armsRum.setConfig("user", ...)`, e nos testes pode-se injetar um stub)
- Expõe `refresh(): Promise<void>`:
  1. `const userId = (await loadUserId()) || deviceMid;` (string vazia preenche com device_mid)
  2. Compara com o id gravado por último, **pulando se não mudou** (evita um setConfig a cada focus)
  3. Quando muda, chama `setUser({ id: userId })` e armazena em cache
  - Internamente serializa/ignora refreshes concorrentes para evitar que uma corrida reescreva um valor antigo (abordagem simples: marca de em andamento + nova execução ao final).
- Seguro contra falhas: quando `loadUserId()` lança erro, trata como não logado (preenche com device_mid), sem propagar e sem afetar a inicialização.

### Ligação (`packages/desktop/src/main/index.ts`)

Após o `await armsInitPromise` já existente no processo principal (L1221), que configura os três pontos de telemetry do desktop. Nesse ponto construir `armsUserIdentitySync` (o `loadUserId` reaproveita o loader existente em L229, e o `deviceMid` o de L353):

1. **Primeira definição**: após `await armsInitPromise`, `void armsUserIdentitySync.refresh()` (normalmente ainda sem login nesse momento → cai em device_mid).
2. **Imediato no login**: disparar `refresh()` ao lado do listener `OAuthCallbackHandled` de `desktopMainIpcRemote` (`desktopMainIpcRemote.ts:155`, o sinal IPC já existente de conclusão do processamento do callback de login). Optou-se por este ponto em vez de alterar `appTelemetryRuntime` para reduzir a superfície de mudança da interface pública; a forma concreta é injetar nesse módulo um callback opcional `onOAuthCallbackHandled` ou passar diretamente o handle do sync, acrescentando `void armsUserIdentitySync.refresh()` dentro do handler existente.
3. **Fallback de logout/troca de conta**: aproveitando o `app.on("browser-window-focus", syncAppTelemetryInteractiveState)` já existente (`index.ts:249`) — acrescentar `void armsUserIdentitySync.refresh()` dentro desse handler. Cobre a lacuna de o processo principal não ter um sinal imediato após o logout no host (após o logout, ao voltar para a janela, atualiza).

### O que não muda

- O host filho e o telemetry core próprio (sua cadeia de userId permanece igual).
- As três chamadas `setConfig("properties", { device_mid })` (mantidas como dimensão de dispositivo, convivendo com user.id).
- O `armsBrowserInit.ts` do renderer / o lado web (o user.id é repassado automaticamente pelo autoInject).

## Testes

Testes unitários para `armsUserIdentity` (vitest, injetando stubs, sem depender do SDK real):

- Sem login (`loadUserId` retorna string vazia) → `setUser` recebe `{ id: deviceMid }`.
- Com login (`loadUserId` retorna `"acc-123"`) → `setUser` recebe `{ id: "acc-123" }`.
- Dois refreshes consecutivos sem mudança de id → `setUser` é chamado só uma vez (deduplicação).
- Login e depois logout (id: conta → vazio) → o segundo refresh preenche com device_mid e dispara setConfig.
- `loadUserId` lança erro → tratado como não logado (cai em device_mid), sem lançar.

A camada de ligação não precisa de novos testes (segue os caminhos de integração de telemetry já existentes).

## Verificação

- O `pnpm typecheck` da raiz não cobre o main do desktop; por convenção, verificar `packages/desktop` separadamente com `tsc -p` (ver memory: typecheck coverage gap).
- `pnpm vitest run packages/desktop/test/armsUserIdentity.test.ts`.
