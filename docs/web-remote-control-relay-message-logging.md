# Web Remote Control Relay Message Logging (Desativado)

## Objetivo

Registrar o desenho histórico do encadeamento de mensagens do relay de controle remoto e a atual estratégia de desligamento, evitando que resumos de mensagens de alta frequência continuem sendo gravados em `~/.zcode/v2/logs/web-remote-control`.

## Ambiente de vigência

O desktop atualmente não ativa o relay message trace nem em ambiente de desenvolvimento nem em produção, e não grava mais `~/.zcode/v2/logs/web-remote-control/web-remote-control-relay-YYYY-MM-DD.log`.

Os logs de ciclo de vida normais do Web remote control não são afetados e continuam sendo gravados no log principal `~/.zcode/v2/logs/YYYY-MM-DD.log`.

## Escopo de cobertura

- Desktop: `packages/desktop/src/main/web-remote-relay/webRemoteControlTransport.ts`

## Conteúdo dos logs

O trace histórico permite somente a saída de resumos de mensagem, nunca o payload completo. Caso se queira reativá-lo no futuro, é preciso primeiro atualizar este arquivo e reavaliar o volume de logs e o risco de informações sensíveis.

Campos dos resumos históricos incluem:

- `type`
- `pair_status` (se houver)
- `role` (se houver)
- `code` (se houver)
- Resumo de `payload`: `zcode_type` / `requestId` / `bridgeSessionId`
- No desktop, `recv` traz ainda `bytes`

## O que não é registrado

Atualmente não se registra o relay message trace. Mesmo que seja reativado no futuro, continua proibido gerar a saída do corpo completo de `data.payload`, evitando:

- O volume de logs crescer linearmente com o fluxo de mensagens
- Vazamento de informações sensíveis (conteúdo de texto, caminhos, parâmetros de requisição)
- Pressão de I/O e oscilações de desempenho em produção

## Prefixo típico de log

- Desktop desativado: `[web-remote-control][relay-message]`
