# Auditoria Atual da Cadeia de Modelos

Data de atualização: 2026-07-17

> **Auditoria histórica, substituída pelo Provider Refactor.** O que este documento registra é o App Provider Snapshot, o fallback de `runtimeModel` e a cadeia de catálogo de workspace anteriores à migração, e não a implementação atual. Os fatos atuais sobre o modelo são produzidos em conjunto pela Effective Provider Config do Environment de destino, pelas Model Config Rules, pelo Provider Registry e pelo ModelFactory; o design atual está em `docs/working-memory/provider-refactor/design/`.

Este documento resume as quatro cadeias atuais a seguir e registra a complexidade e as lacunas que ainda existem:

- `docs/chat/task-switch-model-resolution-chain.md`
- `docs/chat/new-task-model-resolution-chain.md`
- `docs/chat/manual-model-switch-resolution-chain.md`
- `docs/chat/send-prompt-model-resolution-chain.md`

## Conclusão da Auditoria

O V4 já removeu a antiga cadeia principal em que "config da task na UI, meta da task, default do workspace, snapshot de sessão e cache de `runtimeModel`" decidiam em conjunto o modelo atual. O limite atual pode ser resumido em três camadas:

```text
preferência de rascunho / provider registry do workspace
  -> createSession.config ou CAS da sessão de prewarm
  -> config de runtime da sessão na CLI (única autoridade de escrita)
  -> ModelSelected (compartilhado entre troca do usuário e fallback do registry)
  -> ConversationSnapshot.config (projeção somente leitura)
  -> barra de ferramentas do V4
```

A autoridade do modelo de uma session já existente está no runtime da CLI; a preferência de rascunho só determina o valor inicial de uma nova sessão; o catálogo da UI só determina o que é selecionável. O envio não carrega mais um modelo independente, e a configuração e o envio são ordenados pela mesma barreira.

## Complexidade que Precisa Ser Preservada

| Complexidade                        | Motivo da preservação                                        | Limite                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| provider registry do workspace     | credenciais e metadados de modelo de custom provider ficam do lado app/service | sincronizados por identidade de workspace e sessão remota                                           |
| fallback único de `runtimeModel`    | instala um overlay de client quando o registry da CLI ainda não viu o novo provider | apenas uma nova tentativa, depois de `provider.notInRegistry`                                        |
| cache derivado de `runtimeModel` do service | o hot refresh de header/capability de provider precisa da configuração de execução do modelo | reconstruído pela ordem da decisão após accepted/noop; duplicate não escreve; o Agent valida model+thought e não pode carregar a intenção de troca |
| prewarm de rascunho                 | evita criar sessão temporária no primeiro envio e a escrita lenta do default do workspace | deferred, em memória, limpo se não for promovido                                                       |
| semente global de rascunho          | um novo rascunho continua a última escolha do usuário        | não pode sobrescrever a escolha explícita daquele rascunho                                           |
| fallback de registry do Agent       | uma sessão histórica continua conversável após o modelo ser removido do registry | o Agent decide por default, last-used, primeiro do catálogo e publica a projeção; a UI não escreve    |
| barreira de comandos de config      | impede que "trocar modelo → enviar imediatamente" saia de ordem | lineariza apenas a admissão deste renderer; não promete FIFO global entre clientes                   |

## Fontes de Fato Antigas Removidas

Os conceitos abaixo ainda podem aparecer em planos históricos de 2026-06, registros de migração de testes ou adapters de compatibilidade, mas já não decidem o modelo atual da conversation do V4:

- O branch de active-task de `ChatInputToolbar` / `useToolbarModelChange`;
- A resolução de resume hint de `useZCodeChatSendPrompt`;
- `taskConfigOptionsByTaskId` como autoridade de config da conversation;
- Fila de prompt busy local do renderer;
- `session/setModel` e `workspace/setDefaultModel` como entradas de escrita de sessão do V4;
- Derivar o valor atual da barra de ferramentas a partir do último model da mensagem ou da meta da task.

`zcodeSessionStore` ainda atende o shell de workspace, a lista de tasks, não lidas, a projeção de serviço de compatibilidade e o catálogo de rascunhos; isso não significa que ele ainda seja dono do transcript da conversation do V4 ou da config de sessão.

## Invariantes Verificados

1. O valor da barra de ferramentas de uma sessão vinculada só pode ser confirmado pela config do snapshot.
2. A escolha explícita do rascunho tem prioridade sobre a semente global hidratada de forma assíncrona.
3. `createSession.config` é aplicado antes de `firstInput`; a sessão de prewarm é alinhada de novo antes do primeiro envio.
4. Entre modelos, o thought do modelo de origem não é forçado por escrito no modelo de destino.
5. Config de mesmo valor é noop; revision obsoleta tem nova tentativa limitada; a recuperação do provider registry só é tentada uma vez.
6. `sendText` não carrega uma segunda seleção de modelo, e a input enfileirada também não fixa o modelo no momento da entrada na fila.
7. desktop continuous e mobile replayable compartilham os fatos de sessão, mas mantêm mecanismos distintos de delivery/recovery.
8. relay e o main do desktop não guardam estado de negócio da conversation como modelo, queue ou snapshot.
9. O fallback automático após a falha do provider registry é decidido apenas pelo Agent; o menu de modelos da UI é uma projeção do catálogo e não grava de volta o primeiro item do menu na sessão.
10. O fallback automático e a troca manual compartilham `setModel → thought efetivo → ModelSelected`; modelo, thought e catálogo de capacidades não podem ser publicados separadamente.
11. create/resume/fork, escritas legadas, escritas do V4, fallback de registry e runtime refresh compartilham a mesma região crítica de session model-config; quando o `runtimeModel` antigo é inconsistente com o model/thought atual, ele só pode ser ignorado, sem gravação de volta da seleção.

## Lacunas Atuais

- O guard de troca da context window ainda não foi migrado de volta para o V4; uma sessão em execução hoje permite trocar de modelo diretamente.
- A falha na aplicação de `createSession.config` adota a semântica de "sessão criada com sucesso, configuração rebaixada para o padrão do runtime"; é preciso depender da barreira da UI, de logs e do snapshot subsequente para expor a divergência, e não é possível simplificar um create aceito como "o modelo especificado foi aplicado com sucesso".
- A configuração simultânea da mesma sessão por múltiplos clientes depende apenas de revision/CAS para convergir; não há semântica de produto de que "algum cliente possui permanentemente a escolha de modelo".

## Entradas de Auditoria

- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/v4/composer/useDraftConfigControl.ts`
- `packages/ui/src/v4/composer/useDraftSessionPrewarm.ts`
- `packages/shared/src/zcode-protocol-v4/command.ts`
- `packages/shared/src/zcode-protocol-v4/snapshot.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-mgmt.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`