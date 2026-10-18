# Goal Command durante execução (fato atual)

`/goal` usa o `sendGoalCommand` da V4. Ele preserva o texto original do comando visível ao usuário e também atualiza o estado do goal dentro do CLI; a UI não chama mais o antigo `session/goal` contornando a admission de entrada.

## Decisões

- Quando a sessão está pronta, o `sendGoalCommand` pode executar imediatamente.
- Quando existe um turn ativo, o comando entra na fila do runtime do CLI com a identidade própria de `sendGoalCommand`, sem rejeição, sem furar fila e sem interromper o turn atual.
- Em held queue, vale `inputRouting.mode = choice`: o usuário escolhe explicitamente entre manter ou limpar a fila existente antes do envio.
- O comando só é executado quando o CLI considera que pode consumi-lo; a UI não infere o estado ready a partir do fim da linha do assistant, de verification markers ou de um timer local.
- Pausa/retomada do goal, a barreira de stop e a retomada automática são decididos pelo reducer/command handler do CLI.

```text
/goal input
  -> sendGoalCommand
  -> active turn?
       ├─ no  -> execute now
       └─ yes -> enqueue as goal command
  -> authoritative queue/goal projection
  -> desktop and mobile converge
```

Entrada atual da implementação: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/goal-compact.ts`.