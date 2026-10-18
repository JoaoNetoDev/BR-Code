# Texto de falha de login OAuth e interação no estado de falha

## Contexto

Quando o login OAuth falha, o serviço subjacente pode devolver erros específicos de provider, de rede, de token exchange ou do estado da conta de negócio. A entrada de login voltada ao usuário precisa apenas dar um feedback claro e retentável, sem exibir o texto do erro subjacente diretamente na página de login.

## Regras

- O texto de falha de OAuth exibido na entrada de login é uniformemente: `登录失败，请重试` ("Falha no login, tente novamente").
- Falhas de callback OAuth na camada Root e falhas ao iniciar o OAuth pela entrada de login usam o mesmo texto compartilhado.
- A causa específica do erro é gravada apenas no UI logger e não entra no store `oauthError` nem no estado visível `error` de `useOAuth`.

## Interação no estado de falha (desde 2026-09-07)

- A UI de estado de falha é um trio: Alert de warning + 「重新登录」 ("Entrar novamente", default, reaproveitando o canal da falha mais recente para retry) + 「取消」 ("Cancelar", outline, com o mesmo estilo do cancelamento do estado de espera).
- Durante a falha, a lista de botões de canal não é renderizada (condição de renderização `status === "idle" && !oauthError`). Anteriormente, a falha disparada pelo `oauthError` na camada Root fazia reset do estado local para idle, fazendo o bloco de falha e os botões de canal aparecerem na mesma tela, com estados misturados; as três entradas de falha (falha de init / falha de polling / falha de callback por deep link) passam a ter a mesma aparência visual.
- 「取消」 se alinha à semântica de cancelamento do estado de espera: encerra este fluxo de falha e volta à lista de canais, sem fechar a entrada de login; para trocar de canal o usuário usa 「取消 → lista de canais」, e para repetir o canal original usa 「重新登录」. Anteriormente o estado de falha só tinha 「重新登录」 pelo canal original, o que facilitava falhas repetidas e não oferecia saída para trocar de canal.
- Antes de iniciar um novo login (`startTrackedLogin`), o `oauthError` residual do store é removido de forma unificada, evitando que a mensagem de falha e o estado de espera do novo fluxo apareçam na mesma tela (como ao fechar a entrada de login após uma falha e depois retomar o login automaticamente a partir da página de configurações).
- Retry, troca de forma de login (API key) e as demais interações permanecem inalteradas.

## Compatibilidade

- Desktop e Web compartilham a entrada de login em `packages/ui`, portanto a convergência do texto acontece na camada de UI.
- Não modifica o protocolo OAuth, o host process, o relay nem as cadeias realtime de session/task, e não afeta a semântica de desktop `continuous` nem de mobile remote `replayable`.