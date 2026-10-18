# Estratégia de Logs de Produção no Renderer

## Contexto

A camada renderer roda dentro da janela desktop e da página de controle remoto Web, e as chamadas de log disputam o
tempo da main thread com a renderização React, o processamento do fluxo de mensagens e a cadeia de restauração do
controle remoto. Historicamente os logs de UI iam todos para o console e, no desktop, eram encaminhados ao processo
principal via `window.zcode.log` para gravação em disco; conforme o fluxo da sessão, as chamadas de ferramentas, os
snapshots de tarefa e a sincronização do controle remoto cresciam, essa formatação síncrona, esse encaminhamento por IPC
e essa escrita em arquivo amplificavam o custo de performance da versão de produção.

## Objetivos

- os logs locais do renderer em builds de produção não são emitidos por padrão.
- os logs de UI em builds de produção não são mais encaminhados ao processo principal para gravação em disco via
  `window.zcode.log`.
- builds de desenvolvimento continuam com o console do renderer e a ponte de logs do desktop, para facilitar a
  investigação local.
- o pipeline oficial de monitoramento não está no escopo de desligamento desta política, por exemplo ARMS, telemetry,
  captura de crash, exportação de logs feita pelo usuário e logs do service layer e dos processos host/main.

## Limites de ambiente

O interruptor de logs se baseia no estado de build do Vite `import.meta.env.PROD`, e não em `ZCODE_ENV`. A razão é que
`ZCODE_ENV=production` indica apenas conexão com o ambiente de produto; `dev:desktop:prod` continua sendo um estado de
execução de desenvolvimento local e ainda precisa dos logs do renderer para auxiliar o debug. Somente um build de
produção real deve tornar os logs locais do renderer no-op. Cenários de teste ou diagnóstico podem forçar o desligamento
dos logs do renderer com `globalThis.__ZCODE_RENDERER_DISABLE_LOGGING__ === true`; esse interruptor só pode desligar
logs adicionalmente, nunca religá-los em um build de produção.

## Restrições de implementação

- `packages/ui/src/logger.ts` é o único ponto de entrada de logs da camada de UI; em builds de produção `debug` / `info`
  / `warn` / `error` / `trace` retornam diretamente, sem escrever no console e sem encaminhar para a bridge do desktop.
- logs de conexão voltados ao renderer em `packages/client` devem respeitar o mesmo limite de build de produção, para
  não contornar o logger de UI.
- a única exceção é `logger.logMemoryDiagnostics`: ele é a saída oficial de monitoramento do
  [log local de diagnóstico de memória de processo](../monitoring/memory-diagnostics-log.md), escreve no máximo uma
  linha a cada 60 segundos e somente quando há mudança, e em builds de produção continua sendo gravado em disco pela
  bridge do desktop; na Web, sem bridge, é no-op. Nenhum outro módulo pode usá-lo para emitir logs de negócio.
- saídas de debug em console nas entradas renderer desktop e Web só são permitidas em builds não produção.
- o trace de relay do controle remoto Web continua restrito ao estado de desenvolvimento; logs de mensagens de alta
  frequência não podem entrar no renderer de produção.

## Verificação

- testes unitários cobrem que o build de desenvolvimento emite e o build de produção não emite.
- executar `pnpm typecheck`.
- executar `pnpm lint`.
