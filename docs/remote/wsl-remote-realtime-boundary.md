# Correção de fronteiras do realtime em workspace remoto WSL

> **Status: registro histórico de falha; as conclusões de fronteira continuam válidas.** O `sendPrompt`/dynamic stream citado no texto é a entrada antiga no momento da correção;
> hoje o link principal de conversation já migrou para command/topic do V4, mas conexões desktop comuns de WSL/server ainda não devem registrar
> o `relay_bridge` usado pelo replayable do celular.

## Contexto

O workspace remoto WSL comum do desktop deve continuar usando o link principal `desktop-continuous`.
O link de anexação replayable do controle remoto pelo celular, assim como o comportamento de relay dos remote runtimes existentes de SSH / Docker / Bot, permanecem inalterados por enquanto, para não ampliar a superfície de regressão.

## Problema

Os feedbacks atuais dos usuários se concentram em workspaces remotos WSL comuns.
Anteriormente, o processo principal também registrava esse link de desktop como `relay_bridge`.

Isso causa:

1. O host remoto assina adicionalmente o `onDynamicStreamEvent` remoto ao enviar o `sendPrompt`
2. Cada evento de stream é espelhado como `task_stream_mirror_batch`
3. O próprio host desktop não precisa consumir esse mirror replayable, mas o host bridge ainda deduplica por `eventId`
   e mantém um cache
4. No cenário WSL o tráfego é maior e, em pouco tempo, causa inchaço da memória do host; o swap Windows/WSL e o VHDX
   também crescem rapidamente, se manifestando como "vazamento de memória + aumento disparativo do uso de disco"

## Fronteira desta correção

- WSL Remote Host comum de desktop: não registrar `relay_bridge`
- Workspace remoto comum SSH / Docker: manter inalterado o comportamento atual de `relay_bridge`
- Remote runtime de Bot /link de anexação replayable do celular: continuar usando `relay_bridge`
- O cache de deduplicação por `eventId` do realtime bridge no host ganha um limite fixo superior, como defesa geral, evitando novo consumo linear de memória em caminhos anômalos

## Pontos de verificação

- Ao abrir um workspace WSL comum no desktop, nenhum host `relay_bridge` é criado
- O workspace remoto SSH mantém o registro original de `relay_bridge`
- O remote runtime de Bot mantém `relay_bridge`, sem afetar o controle remoto pelo celular nem o link do bot
- O host bridge permite que `eventId` antigos sejam aceitos novamente após a janela de deduplicação, mantendo a memória residente limitada