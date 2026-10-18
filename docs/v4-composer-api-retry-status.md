# Status de Retry da API de Conversa V4

## Resumo

A conversa V4 deve mostrar o status de retry da API de modelo a partir de
`ConversationSnapshot.control.apiRetry` no rodapé do turno em execução atual.
Sessões principais e sessões Subagent somente leitura compartilham a mesma
apresentação de timeline. O composer não renderiza mais esse status.

A autoridade de retry pertence à `ProductProjection` do CLI. O renderer apenas
renderiza o snapshot atual da sessão e não deve inferir estado de retry a partir
de logs de requisição, tempo decorrido ou observações locais de rede.

## Comportamento

```text
Agent/runtime retry event
  -> ProductProjection
  -> ConversationSnapshot.control.apiRetry
  -> SessionPane
  -> ConversationTimeline current live turn
  -> ChatApiRetryStatus
```

- `apiRetry: null` não renderiza rótulo de retry.
- Um estado de retry não nulo é renderizado apenas no slot de cauda do turno em
  execução atual, depois do trabalho de assistente já existente no turno.
- O rótulo de retry substitui o indicador genérico `ChatLoading` enquanto o retry
  está ativo; os dois status nunca são renderizados juntos.
- O rótulo de retry ativo mantém o `text-ui-base`, o `font-medium` e o movimento
  de shimmer do rótulo de Thinking em execução, mas reduz seu peso visual com a
  cor de pico semântica `foreground-subtle`. Ele reutiliza deliberadamente o soft
  stop de baixa opacidade do shimmer base para que o vale em movimento continue
  visível; portanto o Retry evita o pico preto/branco puro do Thinking sem achatar
  o contraste da animação.
- Turnos históricos nunca recebem o estado `apiRetry` atual. Se não houver um
  turno ao vivo em execução, o renderer não anexa o status a um turno mais antigo.
- `model_retry_scheduled` define o estado de retry para toda razão de
  provider/rede retryable classificada pelo runtime, e não apenas para HTTP 429.
- A recuperação do stream SSE central (`StreamRecoveryStarted`,
  `StreamRecoveryRetryStarted`, ou uma requisição de modelo marcada como
  recuperação) usa o mesmo estado. `retryNumber/maxRetries` é convertido para a
  forma V4 `attempt/maxAttempts`.
- A V4 mantém `maxAttempts` na forma do protocolo. A UI exibe a contagem de
  retries, portanto `maxRetries = max(maxAttempts - 1, attempt)`. Por exemplo,
  `maxAttempts=11` converte uma tentativa para a forma de contagem de usuário
  `1/10`; o limiar de apresentação abaixo decide se essa contagem inicial é
  visível.
- `nextRetryAt` é calculado com o relógio de eventos do CLI. A timeline atual não
  renderiza uma contagem regressiva porque um único snapshot não é um relógio
  que avança.
- As chaves de i18n existentes continuam sendo a única fonte de texto voltado ao
  usuário: `chat.apiRetryStatus`. Mover o status para a timeline preserva o texto
  que antes ficava no composer: `重新连接中... x/y` / `Reconnecting... x/y`.

## Limiar de apresentação planejado (2026-08-17)

Quando `apiRetry.attempt <= 2`, a UI não mostra a contagem de reconexões, nem
mostra o texto `重新连接中... x/y`; o running turn atual continua usando o mesmo
slot de `ChatLoading`, para que o usuário trate as duas primeiras recuperações
breves como um carregamento comum. Só a partir de `attempt >= 3` o texto de
reconexão aparece, e a contagem mantém a proporção de usuário já existente (por
exemplo `3/10`). Aqui `attempt` é a "qual tentativa de retry" já convertida pela
camada de projeção, e não o número total de tentativas original `maxAttempts`.

```text
ProductProjection.control.apiRetry
              |
              v
      TurnChatLoadingSlot
        | attempt 1/2 --------------> ChatLoading
        | attempt 3+ ----------------> Reconnecting... 3/10
        | progress / terminal --------> apiRetry cleared
        v
  current live turn only
```

Esse limiar existe apenas na apresentação da timeline; não se deve converter 1/2
tentativas de retry para `null` em `normalizeZCodeApiRetryStatus`,
`ProductProjection`, no service tracker ou no schema do protocolo, pois isso
perderia o estado de recuperação e afetaria a consistência de recuperação do
snapshot, do desktop continuous e do mobile replayable. Quando `attempt <= 2` e o
turn atual está bloqueado por permissão/pergunta/manutenção, o gating existente
continua valendo e nenhum loading genérico adicional é exibido.

## Ciclo de vida do estado

```text
model_retry_scheduled / stream recovery
                 |
                 v
       apiRetry = current retry
                 |
       +---------+-------------------+
       |                             |
       | next request started        | retryable request failed
       | (no model progress yet)     | before scheduling
       |                             |
       +---------- keep -------------+
                 |
      first meaningful model progress
      (text/reasoning/tool lifecycle)
                 |
                 v
          apiRetry = null

request completed / non-retryable failure / turn terminal / next turn
                 |
                 v
          apiRetry = null
```

`model_request_started` da tentativa 2+ do adapter não prova recuperação e não
deve limpar o rótulo. Um delta de texto/reasoning não vazio ou um evento de tool
significativo de fato prova progresso visível ao usuário e o limpa. Isso evita
que o status pisque e desapareça durante a própria requisição de retry.

## Entrega e isolamento

```text
                         +-> desktop-continuous
one CLI projection -----+
                         +-> web-remote-replayable
```

- `control.apiRetry` tem escopo de sessão. Uma sessão em segundo plano não pode
  sobrescrever o status de timeline de outra sessão.
- Ambos os perfis de entrega recebem o mesmo estado de controle. A diferença entre
  continuous e replayable muda apenas o comportamento de entrega/backpressure; não
  cria uma segunda autoridade de retry.
- Um snapshot replayable pode restaurar um retry em andamento. Relay, Electron
  main e o roteamento do host não são donos nem sintetizam o estado de retry.
- Retry é estado em memória do runtime: refresh do renderer, troca de task e
  reconexão do celular dentro do mesmo runtime de CLI podem restaurar um retry
  ativo a partir do snapshot; um cold restart do CLI/runtime o limpa.

## Limites

- Nenhuma mudança de protocolo ou schema.
- Nenhuma parte de transcrição de retry ou linha de timeline é persistida. A
  exibição é um slot transitório de turno ao vivo, dirigido apenas por
  `control.apiRetry`.
- A linha `retryNotice` existente permanece reservada para a semântica de retry de
  assistente disparado pelo usuário e não é reutilizada nem estendida.
- Nenhuma mudança no comportamento de envio, fila, parada ou retry de linha.
- Nenhuma mudança na contagem de retries, no backoff, na classificação de retry ou
  no comportamento de falha final. Casos do catálogo de falhas como N03/N04
  continuam sendo donos dessas decisões.
- A regra `attempt <= 2` é apenas de apresentação: contagem de retries do runtime,
  backoff, classificação de retry, limite de limpeza e comportamento de falha
  final permanecem inalterados.
- Nenhuma mudança nas semânticas de entrega `desktop-continuous` do desktop nem
  `web-remote-replayable` do celular.
- O detalhe Subagent somente leitura ainda proíbe comandos de retry manual;
  mostrar o status de retry do provider não torna a timeline interativa.

## Evidência de regressão

- Os testes de projeção devem cobrir o agendamento de retry do adapter, a retenção
  no início da tentativa, a limpeza por progresso significativo, a limpeza no
  término da requisição e a recuperação do stream central.
- O snapshot projetado deve passar no schema de runtime da V4.
- O mesmo delta de retry de `state.updated` deve sobreviver aos dois filtros de
  perfil de entrega.
- Os testes de timeline provam que `maxAttempts=11` renderiza `3/10` apenas quando
  `attempt=3`, que `attempt=1/2` renderiza o `ChatLoading` genérico sem texto de
  retry, que o status de retry substitui `ChatLoading` em `attempt=3` e que
  `apiRetry=null` não renderiza nada.
- Testes de `SessionPane` somente leitura provam que os detalhes do filho recebem
  o mesmo estado enquanto o composer permanece ausente.
- O E2E de falha de stream no desktop SAT25 exercita os dois donos em uma única
  execução: a Main observa as tentativas iniciais ocultas e um `3/10` visível antes
  de limpar na resposta de tool bem-sucedida; o filho gerado observa o retry
  inicial oculto em seu pane de detalhe somente leitura e limpa no progresso de
  texto.

## Status de implementação (2026-08-17)

1. Já foi adicionado, em `packages/ui/src/v4/ConversationTurnGroup.tsx` dentro de
   `TurnChatLoadingSlot`, o `visibleRetryStatus` apenas de apresentação:
   `attempt=1/2` volta para `ChatLoading` e só `attempt>=3` entra em
   `ChatApiRetryStatus`; o loading gate existente que bloqueia interação permanece
   inalterado.
2. Já foi coberto em `packages/ui/test/v4ConversationTurnGroup.test.ts` os
   attempts `1`, `2`, `3`, além da exclusão mútua entre loading e retry sob
   interação bloqueada.
3. `ChatApiRetryStatus`, a normalização da projeção, o snapshot de runtime, o schema
   do protocolo, o i18n e o ciclo de vida de retry não foram modificados; o
   fixture/manifest do SAT25 apenas acrescenta o segundo e o terceiro 429 da Main,
   para que a UI possa observar as tentativas iniciais ocultas e o `3/10` visível.
4. Resultado da verificação: focused UI test 53/53, `pnpm typecheck`, `pnpm lint`
   (0 erro) e a auditoria de cobertura de conversa passaram. O build do E2E WDIO do
   SAT25 foi concluído, mas o ambiente atual não possui o Chromedriver macOS
   arm64 baixável, então a fase de inicialização falhou, aguardando nova execução
   quando houver o driver.