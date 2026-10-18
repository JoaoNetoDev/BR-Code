# Prontidão em duas fases do Helper CUA no Windows

## Objetivo

O named pipe do Windows não tem a semântica atômica de cessão `.pending -> final` do Unix socket do socket Unix. Em uma
inicialização a frio do Helper, o Host precisa obter, antes da conclusão da inicialização das funcionalidades, um
transport tuple já com a vinculação de autenticação feita, para que o Agent possa iniciar imediatamente o MCP
`zcode-cua`; enquanto a camada de funcionalidades ainda está inicializando, as chamadas de ferramentas são
representadas pelo broker com uma resposta retryable `broker_unavailable` indicando warming-up.

## Estado e sequência

```text
Host                         Helper                         Agent / MCP
 |                            |                               |
 | fork(socket, token)       |                               |
 |--------------------------->| bind + authenticate           |
 |                            |-- transport_ready ----------->|
 |<---------------------------|                               |
 | publish socket/token       | load native + build backend  |
 |--------------------------->|                               |
 |                            |-- ready + broker_info ------->|
 |<---------------------------|                               |
 |                            |                               | tool call
 |                            |<------------------------------|
 |                            | warming_up => broker_unavailable
 |                            |------------------------------>|
```

`transport_ready` significa apenas que o named pipe já foi vinculado pelo processo filho atual e que a configuração de
autenticação por bearer-token foi concluída; não significa que UIA, captura de tela ou capacidade de entrada já estejam
prontas; `ready` continua representando o sucesso do health probe completo. Quando um Helper antigo envia apenas `ready`,
o Host o trata simultaneamente como transport ready, mantendo a compatibilidade com versões anteriores.

## Restrições

- O Host aceita somente o child PID exato que ele próprio fez fork e o nome de pipe que ele próprio mintou, e só publica
  o tuple para o Agent após receber `transport_ready`.
- O Windows não reutiliza o pipe antigo nem simula uma troca atética fechando e revinculando; quando o Helper falha ou
  sai, o tuple já publicado entra no recovery/recycle barrier existente.
- O processo MCP do Agent permanece vivo, e `broker_unavailable` só pode ser usado para novas tentativas de warm-up de
  requisições ainda não enviadas; requisições de ações continuam obedecendo ao delivery-state, sem replay automático de
  possíveis efeitos colaterais já enviados.
- Uma falha completa de `ready`/health continua seguindo o caminho de limpeza original; a solução elimina apenas o Agent
  que ficava sem saída (stranded) na fase normal de cold start por causa da janela de 1 segundo.