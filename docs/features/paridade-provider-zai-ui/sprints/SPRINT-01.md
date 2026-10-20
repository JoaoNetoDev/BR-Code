# SPRINT-01 — Welcome screen 100% API key (remoção do modo OAuth)

## Objetivo
Remover por completo o modo de login OAuth da welcome screen (zai e bigmodel), deixando-a abrindo direto no fluxo de API key, sem prioridade de ordenação nem tags de região.

## Depende de
nenhuma

## Onda
1 — sprints da mesma onda rodam em paralelo

## Arquivos previstos
- `packages/ui/src/WelcomeScreen.tsx` — alterar (A1) — remover modo `providers`: `startTrackedLogin` (:114), `getLoginOAuthButtonMessageId`/`getLoginOAuthRegionTagMessageId` (:491-511), `LoginOAuthRegionTag` (:513), `getProviderPriority` (:528), `resolveVisibleLoginProviders` (:542), `resolveLoginRetryProvider` (:550), ramos `waiting` (:374-398) e `error` (:400-451), render de botões OAuth (:319-356), testids `TID_OAUTH_*`, imports `ZAI_PROVIDER_ID`/`BIGMODEL_PROVIDER_ID` (:11, :16); `loginMode` inicializa em `"apiKey"`
- `packages/ui/src/hooks/useOAuth.ts` — remover (R36) — hook sem outros consumidores (único: WelcomeScreen)
- `packages/ui/test/welcomeScreenApiKeyOnly.test.ts` — criar (C2) — welcome abre em API key, sem símbolos OAuth
- `packages/ui/test/rootOAuthCallbackHandling.test.ts` — alterar (poda) — remover cenários de login OAuth da UI; manter handling de callback fora da welcome (se houver)

## Passos de implementação
1. Em `WelcomeScreen.tsx`, remover os símbolos e ramos listados em A1; `LoginPanel` inicializa `loginMode` direto em `"apiKey"`; sobrevivem `shouldCompleteProviderLoginAttempt` e o branch `LoginApiKeyForm`.
2. Confirmar com `pnpm dep:refs --list-exports packages/ui/src/hooks/useOAuth.ts` que `useOAuth` só tem `WelcomeScreen.tsx` como consumidor e deletar o arquivo (R36).
3. Garantir que nenhum caminho de retry restante referencia `providers[0]` ou símbolo do fluxo OAuth.
4. Criar `welcomeScreenApiKeyOnly.test.ts` (C2) substituindo os cenários OAuth de `rootOAuthCallbackHandling.test.ts`; podar o arquivo por caso (R-T4).

## Testes obrigatórios
- Criar `packages/ui/test/welcomeScreenApiKeyOnly.test.ts`: render da welcome sem botões OAuth, sem estado waiting/error/retry, abrindo em `loginMode === "apiKey"`, `shouldCompleteProviderLoginAttempt` com razão `"apiKey"`.
- Podar `rootOAuthCallbackHandling.test.ts`: remover só cenários de login OAuth da welcome.

## Critérios de aceitação
- [ ] CA-01 (RF-01): A welcome screen não renderiza nenhum botão OAuth nem estado waiting/error/retry; abre direto no modo API key (`welcomeScreenApiKeyOnly.test.ts` + inspeção).
- [ ] CA-02 (RF-01, RF-02): `startTrackedLogin`, `resolveVisibleLoginProviders`, `getProviderPriority`, `resolveLoginRetryProvider`, `getLoginOAuthButtonMessageId`, `LoginOAuthRegionTag` não existem mais em `packages/ui` (grep zerado); nenhum peso fixo zai=0/bigmodel=1 sobrevive.
- [ ] CA-03 (RF-03): Nenhuma referência a `login.oauth.regionTag.*` ou tags de região exclusivas de Z.ai/BigModel permanece em código (o bloco de locales `login.oauth.*` é fechado na SPRINT-07 sob CA-18).
- [ ] CA-04 (RF-04): Nenhum caminho de retry restante referencia `providers[0]` ou símbolo do fluxo OAuth removido.

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test:unit -- packages/ui/test/welcomeScreenApiKeyOnly.test.ts
pnpm test:unit -- packages/ui/test/rootOAuthCallbackHandling.test.ts
pnpm test:unit:affected
pnpm architecture:check --changed
```
