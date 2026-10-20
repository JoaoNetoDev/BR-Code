# Contrato de diagnóstico de timeout do capture_app

## Contexto

No macOS, `capture_app` percorre a árvore de Accessibility da janela alvo no worker assíncrono
do Helper. Quando o app alvo está momentaneamente sem resposta, a árvore AX é muito grande ou
o worker está enfileirado, a chamada é interrompida por um fence de 8 segundos de wall-clock.
No passado o único erro era “exceeded the 8 second wall-clock deadline”, o que não permitia
distinguir se o travamento estava na resolução da janela, no primeiro warm do AX, na árvore de
janelas, na árvore de menus ou na leitura de alguma propriedade AX específica.

## Objetivos

- Ao estourar o timeout, carregar no erro do MCP a diagnóstico estruturada mais recente, garantindo que o
  model I/O trace sirva como evidência direta.
- O Helper também escreve a mesma diagnóstico no `--exit-log` controlado, cobrindo o modo de
  inicialização do produto em que o LaunchServices descarta o stderr.
- A diagnóstico native registra somente fase, última operação AX, contagem de nós, tempo
  decorrido, PID e window id; não deve registrar texto de controles, área de transferência,
  token, socket, título da janela ou outro conteúdo do usuário.
- Capturas normais e rápidas não gravam log; grava-se uma única linha apenas no timeout, para
  evitar desgaste de disco pelo fluxo de mensagens.

## Campos de diagnóstico

`captureAppDiagnostic(pid, windowId?)` é uma native ABI aditiva que retorna os dados da última
coleta correspondente:

- `phase`: fase atual/final, por exemplo `capture_lock`, `window_resolve`, `tree_traversal`,
  `menu_traversal`, `native_complete`.
- `last_ax_operation`: nome da operação registrada antes de entrar na API AX que pode bloquear.
- `nodes_visited`: quantidade de nós AX cuja leitura já foi iniciada.
- `elapsed_ms`: tempo decorrido pelo relógio monotônico desde o admission N-API, incluindo a
  fila do libuv.
- `deadline_exceeded`: se, no momento da leitura da diagnóstico, o deadline native absoluto já
  foi ultrapassado.
- `pid` / `window_id`: usados apenas para vincular a diagnóstico a esta requisição, sem material
  de autorização.

Se a ABI de diagnóstico estiver ausente, retornar uma forma inválida ou lançar erro na leitura,
o erro de timeout original deve continuar sendo retornado normalmente: o caminho de diagnóstico
não pode alterar a semântica de falha de `capture_app`.

## Local do log

Tanto o produto ZCode quanto o modo standalone passam `--exit-log <socket>.exit.log` ao iniciar
o Helper. O Helper acrescenta uma linha `[capture-app-timeout] ...` no timeout; ao mesmo tempo, o
texto do erro original recebe o mesmo resumo de campos, de modo que, mesmo que o arquivo de log
seja limpo pelo sistema, o trace do modelo preserva a diagnóstico.
