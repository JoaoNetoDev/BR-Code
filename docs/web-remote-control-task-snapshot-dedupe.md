# Dedupe de Snapshot de Task em Andamento no Controle Remoto Web

## Contexto

Na primeira renderização do controle remoto por celular, vários hooks de UI chamam `zcodeTaskService.getTaskSnapshot(...)` de forma concorrente.
Em cenários de tasks grandes, isso faz com que o host devolva sucessivamente vários snapshots muito grandes e com que o relay envie pacotes grandes repetidamente.

## Mudança

Em `packages/ui/src/hooks/useZCodeTaskService.ts`, foi adicionado dedupe de concorrência para `getTaskSnapshot`:
- Dimensão: `workspacePath + workspaceIdentity + taskId + messageLimit + byteBudget + toolLimit + clientMode`
- Comportamento: requisições concorrentes com a mesma key reutilizam o mesmo Promise, disparando a RPC apenas uma vez
- Ciclo de vida: assim que a requisição termina, a entrada é removida imediatamente do mapa de in-flight

O `clientMode` precisa participar da key. Os snapshots do desktop `desktop-continuous` e do celular `web-remote-replayable` têm semânticas de restauração diferentes: no celular pode haver restauração de estado de execução, concatenação de active prompt, estado de replayable command e orçamento de bytes; o desktop mantém a semântica antiga de full continuous. Quando uma chamada antiga não passa `clientMode`, ela é tratada como `desktop-continuous`.

## Efeito

- Reduz as chamadas RPC duplicadas de `getTaskSnapshot` no mesmo instante
- Reduz diretamente os envios de mensagens grandes duplicadas pelo relay do controle remoto
- Mantém as interfaces existentes inalteradas, sendo transparente para os chamadores