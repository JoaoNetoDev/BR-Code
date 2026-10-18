# Cadeia de decisão de rollout do Desktop Context Prompt e gate do primeiro Host

> Documento de spec / trilha: como o rollout do servidor (Desktop Context Prompt, abreviado Desktop SP / DSP) decide se o Agent emite a diretiva `::code-comment`; e o problema corrigido em CR-01, de "a decisão de rollout não tem caminho efetivo quando o primeiro Host é criado".

## 1. Contexto: o que é o Desktop Context Prompt

O servidor distribui um rollout de funcionalidade única por `/api/v1/client/configs`: `data.configs.desktopContextPrompt.enabled`.
- `enabled: true`: o Agent inicia na **desktop surface**, e o system prompt injeta o bloco de diretivas `::code-comment{...}` (`apps/zcode-cli/packages/core/src/context/sections/desktop.ts`), fazendo o assistente emitir code-comments inline.
- `enabled: false` ou não distribuído: o Agent inicia na **terminal surface**, pula esse bloco e emite o terminal prompt comum.

## 2. Cadeia congelada (fato central)

Uma vez que a decisão sai do desktop main, ela é congelada em várias fronteiras de processo. A cadeia inteira é:

```
desktop main (processo)
  └ createDesktopContextPromptRollout          ← busca + cache do veredito (TTL 1h, timeout de requisição 3s)
        │  getSnapshot().enabled (live, atualizado a cada refresh bem-sucedido)
        ▼
  └ resolveDesktopContextPromptEnabledForHost()  ← leitura síncrona do snapshot no fork do Host
        ▼
  └ spawnHostProcess(env: ZCODE_DESKTOP_CONTEXT_PROMPT_ENABLED="0"|"1")  ← gravado no env do subprocesso
        │  (desktopHostProcess.ts:291)
        ▼
Host subprocesso (Local Host / Remote Host)
  └ services/node.ts:614-621 — const de nível superior lê o env uma única vez → desktopContextPromptEnabled
        ▼
  └ resolveZCodeAgentPresentationSurface({...})  ← calculado uma única vez, só na inicialização do Host
        ▼
  └ ZCodeAgentProcessManager.presentationSurface (congelado durante o ciclo de vida do Host)
        ▼
  └ spawn CLI: --surface desktop | (padrão) --surface terminal
        ▼
Agent subprocesso (CLI)
  └ run.ts:192 normalizePresentationSurface → "zcode_desktop" | "terminal"
  └ zcode-protocol-entrypoint.ts:31 runtimeConfig.presentationSurface (congelado no processo)
  └ context/builder.ts:114 injeta a desktop context section somente quando "zcode_desktop"
```

Os **dois pontos de congelamento** decidem: um Host／Agent em execução não reavalia o rollout. Apenas um **Host recém-forkado** lê o snapshot mais recente. Portanto, a "alcançabilidade" da decisão depende inteiramente de: no momento do fork do Host, `getSnapshot()` já refletia a verdade do servidor.

## 3. Problema CR-01: a decisão não tem caminho efetivo na criação do primeiro Host

### Causa raiz (tensão de design)

- Restrição de contorno: o comentário em `index.ts` é explícito — "requisições de rede não podem bloquear Local/Remote Host". Tanto o `void rollout.refresh()` do bootstrap quanto o `void rollout.refresh()` em `resolveDesktopContextPromptEnabledForHost()` são **fire-and-forget**.
- Restrição de congelamento: a surface é congelada na inicialização do Host／Agent (ver seção 2).

Somando as duas, **o resultado assíncrono bem-sucedido não tem caminho efetivo para o primeiro Host／Agent já criado**:

```
t=0      app.whenReady → void refresh() (dispara a requisição, ≤3s, sem await)
t≈500ms  primeiro Local Host dom-ready → resolveDesktopContextPromptEnabledForHost()
           ├ void refresh() (acerta o inFlight, reaproveita a requisição de t=0)
           └ return snapshot.enabled  ← leitura síncrona → false (a requisição ainda não resolveu)
         spawnHostProcess(env="0")  ← gravado de forma definitiva
t≈1.8s   rede bem-sucedida enabled=true → snapshot é atualizado (mas o primeiro Host já subiu com "0")
         → Host/Agent congelado → toda a sessão do app segue usando o terminal prompt, sem ::code-comment
```

Só o caso em que "a requisição resolve antes do fork do primeiro Host" (rede rápida／cache atingido) acerta o rollout; em rede lenta a primeira sessão sempre perde, e costuma ser preciso criar uma nova janela ou reiniciar para recuperar. Um workspace remoto que reaproveite aquele Local Host também herda a decisão errada.

### 4. Correção: gate de decisão limitado antes da criação do primeiro Host

Dá-se ao "resultado bem-sucedido" um **caminho efetivo limitado**: aguardar uma vez a decisão antes do fork do primeiro Host, mantendo fail-open em caso de falha／timeout.

```
app.whenReady
  ├ void rollout.refresh()                  ← aquecimento (dispara a requisição mais cedo, reaproveita o inFlight)
  └ ensurePrimaryWindow → createWindow
        └ handler de dom-ready (async):
              … setup síncrono (cancel/gen/win32 show/oldChild) permanece igual …
              if (awaitFirstHostSpawnDecision)            ← novo: gate limitado
                  await awaitFirstHostSpawnDecision()     ≤2s, latch permanente apenas na primeira vez
              spawnLocalHost()                            ← neste momento o snapshot já é o veredito do servidor
```

### Pontos-chave de design

1. **`rollout.awaitFirstDecision(timeoutMs)`** (`desktopContextPromptRollout.ts`)
   - `Promise.race([refresh(), setTimeout(timeoutMs)→snapshot])`.
   - Reaproveita a dedupe TTL／inFlight de `refresh()` e o timeout interno de requisição de 3s; ambos os ramos resolvem (o `refresh` já faz catch internamente e o timeout volta ao snapshot atual), nunca rejeitam.
   - **Sem estado** — o latch first-only é mantido pelo chamador (desktop main).

2. **`firstHostSpawnDecisionPromise` + `awaitFirstHostSpawnDecision()`** (`index.ts`)
   - Latch permanente em nível de módulo (não é limpo após a primeira criação). Todos os forks após o primeiro Host aguardam uma promise já resolvida, com custo próximo de 0ms.
   - Timeout `DESKTOP_FIRST_HOST_SPAWN_DECISION_TIMEOUT_MS = 2_000` (< o timeout interno de requisição de 3s, mantendo margem).
   - Mesmo que o primeiro Host caia no fallback `false` por timeout, quando a requisição em background tiver sucesso final `getSnapshot()` passa a true — os **Hosts seguintes** (nova janela／reload) leem de forma síncrona o snapshot live e já acertam, sem necessidade de rearme do latch.

3. **Caminho Local** (`desktopWindowLifecycle.ts`)
   - O handler de dom-ready passa a `async`; após os early-return de reattach e antes de `spawnLocalHost` é inserido `if (options.awaitFirstHostSpawnDecision) { await options.awaitFirstHostSpawnDecision(); }`.
   - **Usa guarda `if` em vez de `await cb?.()`**: quando o cb está ausente, **nenhum await é disparado** e o handler async roda de forma síncrona — chamadores e testes existentes que não injetam o gate têm regressão zero.
   - A assinatura／o tipo de retorno de `spawnHostProcess` **não mudam**, e `spawnLocalHost` continua síncrono.

4. **Caminho Remote** (`desktopRemoteSessions.ts`)
   - `createRemoteWorkspaceSession` (que cobre os três pontos de fork SSH／WSL／Dedicated) e `createBotRemoteWorkspaceRuntimePort` (o 4º ponto de fork, que não passa por `createRemoteWorkspaceSession`) aguardam o gate depois da checagem de `appShutdownStarted`.
   - **Re-check no teardown**: tomando como referência a proteção já existente em `:1841`, de que "durante um await a janela／o app podem sofrer teardown", depois de cruzar o ponto do await é preciso revalidar `appShutdownStarted` e `win.isDestroyed()`; havendo acerto, deve-se lançar, proibindo um novo fork fora da barreira de saída.
   - A assinatura／os tipos de `spawnHostProcess` **não mudam**; os 4 pontos de fork não precisam se tornar async nem exigem mudanças em pool.

### Semântica de timeout／latência

| Cenário | Atraso do primeiro Host |
|---|---|
| Rede rápida／cache atingido (requisição < 500ms) | ~0ms (o gate já resolveu antes do dom-ready) |
| Rede lenta (requisição > 2s) | no máximo +2s (fail-open segue com `false`) |
| Todos os forks após o primeiro Host | ~0ms (o latch já resolveu; leitura do snapshot live) |

Em rede lenta, os +2s são adicionados antes da "primeira abertura de workspace", não antes da exibição da janela. Já foi confirmado como um trade-off aceitável.

## 5. Compatibilidade entre plataformas／bordas

- **Desktop**: o gate existe apenas no processo desktop main; Local e Remote (SSH／WSL／Docker) compartilham o mesmo latch first-only.
- **Web／celular**: não há host fork, portanto não são afetados. O `/remote` do celular se conecta via shared-host attachment ao Local／Remote Host já existente na área de trabalho e herda a decisão existente no momento da criação desse Host — é exatamente esse o valor que o gate garante ao decidir corretamente no primeiro Host.
- **Proteção do controle remoto Web**: o gate não baixa nenhum estado de session／task／stream para o relay／main; é apenas um await único dentro do processo main. Não afeta os limites de cadeia `continuous` (desktop) e `replayable` (celular).

## 6. Índice de cobertura de testes

| Arquivo | Cobertura |
|---|---|
| `packages/desktop/test/desktopContextPromptRollout.test.ts` | Parsing do rollout, TTL, dedupe inFlight, timeout de 3s; `awaitFirstDecision` com resposta lenta／fallback por timeout／concorrência; **CR-01 de forma integrada** (resposta lenta `enabled=true` + await limitado → leitura síncrona do snapshot como valor verdadeiro) |
| `packages/desktop/test/desktopWindowLifecycle.test.ts` | Fluxo Local de dom-ready → spawn; **não faz spawn antes do gate resolver, faz spawn depois de resolver** |
| `packages/desktop/test/desktopRemoteSessions.test.ts` | Cada ponto de fork do Remote; **gate bloqueia o spawn e a sessão é concluída após o resolve**; **teardown durante o await do gate → o re-check bloqueia e não faz spawn** |

## 7. Constantes／variáveis de ambiente relacionadas

| Nome | Local | Descrição |
|---|---|---|
| `ZCODE_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV` | `packages/shared/src/runtimeEnv.ts` | Nome do env de Main→Host (`"0"`/`"1"`) |
| `DESKTOP_CONTEXT_PROMPT_REQUEST_TIMEOUT_MS` | `desktopContextPromptRollout.ts:9` | Timeout de uma requisição: 3s |
| `DESKTOP_CONTEXT_PROMPT_CACHE_TTL_MS` | `desktopContextPromptRollout.ts:10` | TTL do cache de sucesso: 1h |
| `DESKTOP_FIRST_HOST_SPAWN_DECISION_TIMEOUT_MS` | `packages/desktop/src/main/index.ts` | Timeout do gate do primeiro Host: 2s |