# Plano de Implementação da Telemetria de Espera por Permissão

> Status (2026-07-15): implementado; este documento é mantido como plano histórico de implementação. O contrato atual dos campos está em
> `packages/ui/src/lib/messageTelemetry.ts`, `docs/monitoring/business-monitoring.md` e
> `docs/monitoring/performance-telemetry-catalog.md`; o caminho antigo de hook task-stream abaixo serve apenas para rastreabilidade.

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** restaurar a agregação de espera por permissão para `message_completion` e expor o mesmo tempo de espera por ferramenta nos eventos `agent_step` existentes, sem adicionar um novo tipo de passo.

**Arquitetura:** manter o estado dos intervalos de permissão dentro de `messageTelemetry.ts`, indexado por `requestId` e associado a `toolCallId`. Encerrar cada intervalo exatamente uma vez na resposta de permissão, na terminação da ferramenta ou na terminação da tarefa, atualizando tanto o agregado do prompt quanto o passo de ferramenta ativo correspondente.

**Stack tecnológico:** TypeScript, React hooks, Vitest, pnpm.

---

### Tarefa 1: adicionar testes que falham para a máquina de estados da telemetria

**Arquivos:**
- Modificar: `packages/ui/test/messageTelemetry.test.ts`

- [x] Adicionar testes que iniciam um passo de ferramenta, abrem/fecham intervalos de permissão e verificam:

```ts
expect(toolStep.eventExtraDetail).toMatchObject({
  duration_ms: "300",
  waiting_ms: "150",
});
expect(completion.eventExtraDetail).toMatchObject({
  duration_ms: "600",
  waiting_ms: "150",
});
```

- [x] Cobrir múltiplas chamadas de ferramenta, requisição/resposta repetidas, ferramentas sem correspondência e encerramento terminal.
- [x] Executar `pnpm vitest run packages/ui/test/messageTelemetry.test.ts`.
- [x] Confirmar que as falhas RED são causadas pela ausência da API de espera com escopo de requisição e da `agent_step.waiting_ms`.

### Tarefa 2: implementar a agregação de espera com escopo de requisição

**Arquivos:**
- Modificar: `packages/ui/src/lib/messageTelemetry.ts`

- [x] Substituir o campo único `permissionRequestedAt` por um `Map` indexado por `requestId`.
- [x] Adicionar `waitingMs` a `ActiveAgentStep`.
- [x] Tornar o registro da requisição de permissão idempotente e resolver `toolCallId` a partir do payload do evento.
- [x] Encerrar os intervalos na resposta, nos eventos terminais de ferramenta e nos eventos terminais de tarefa.
- [x] Adicionar `waiting_ms` a todo `agent_step` finalizado; passos que não são de ferramenta permanecem `"0"`.
- [x] Manter inalteradas as duas fórmulas existentes de `duration_ms`.
- [x] Executar o teste focado e confirmar GREEN.

### Tarefa 3: conectar os caminhos de resposta desktop e remoto

**Arquivos:**
- Modificar: `packages/ui/src/hooks/taskStreamEventHandlers.ts`
- Modificar: `packages/ui/src/hooks/useChatTaskControlActions.ts`
- Modificar: `packages/ui/src/lib/zcodeTaskRuntimeMonitor.ts`
- Testar: testes relevantes de handlers do runtime/UI quando necessário

- [x] Registrar as requisições de permissão com seu evento de stream completo.
- [x] Encerrar respostas locais bem-sucedidas depois que a chamada de serviço retorna.
- [x] Encerrar eventos `permission_response` do stream para que outro cliente possa concluir o intervalo.
- [x] Aplicar as mesmas chamadas idempotentes no monitor de runtime em segundo plano.
- [x] Executar os testes focados da UI.

### Tarefa 4: atualizar a documentação de telemetria

**Arquivos:**
- Modificar: `docs/monitoring/business-monitoring.md`
- Modificar: `docs/monitoring/performance-telemetry-catalog.md`

- [x] Documentar que `duration_ms` é tempo de relógio de parede e inclui a espera por permissão.
- [x] Documentar `agent_step.waiting_ms` e a soma em nível de mensagem.

### Tarefa 5: verificar e commitar

- [x] Executar `pnpm vitest run packages/ui/test/messageTelemetry.test.ts`.
- [x] Executar `pnpm typecheck`.
- [x] Executar `pnpm lint`.
- [x] Executar `git diff --check`.
- [x] Revisar o diff contra todos os casos da spec de design.
- [ ] Commitar com uma mensagem de Conventional Commit.