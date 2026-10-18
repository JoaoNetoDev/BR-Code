# Cadeia de resolução do modelo atual no envio de mensagens

Data de atualização: 2026-07-15

> **Auditoria histórica de cadeia, substituída pelo Provider Refactor.** O push do workspace Provider
> Registry, o fallback de `runtimeModel` e o duplo diretório App/CLI deste documento não são mais a
> implementação atual. O modelo atual é resolvido pelo Model Selection, Registry e ModelFactory do
> Environment de destino. O design atual está em `docs/working-memory/provider-refactor/design/`.

O `sendText` do V4 não carrega uma segunda decisão de UI sobre "qual modelo usar nesta vez". O modelo
pertence ao session config; o envio apenas entra na mesma CLI session depois do comando de
configuração. Assim, toolbar, fila e runtime não guardam separadamente valores de modelo que se
sobrescrevem.

## Cadeia completa

```text
toolbar config action ─┐
                      ├─> configCommandBarrier（线性化用户操作）
composer sendText ─────┘
  -> V4 command ACK/admission
  -> 当前 session runtime config
  -> prompt turn
  -> ModelSelected/rows/snapshot 投影
```

## Session existente

Ao enviar em uma session existente:

1. `SessionPane.dispatchSendText` coloca a ação de envio dentro do `configCommandBarrier`.
2. Os comandos de modelo, thought, mode e follow-up enfileirados antes dela precisam completar primeiro.
3. O payload de `sendText` carrega apenas o texto, as referências de anexos já prontas e o disposition explícito da held queue.
4. A CLI, conforme o `inputRouting` atual, decide se inicia imediatamente, guia, enfileira ou exige uma escolha; o modelo continua sendo obtido do config atual do runtime da session.
5. O ACK apenas comprova o resultado da admission; a UI final é fechada pela projection da conversa.

Portanto, "trocar de modelo → enviar" usa o novo modelo; "enviar → trocar de modelo" não pode reescrever retroativamente um turn já admitted. Aqui o que se garante é a ordem de operações no mesmo renderer, sem fundir o continuous do desktop com o replayable do web remote em um FIFO global do cliente.

## Primeiro envio de um rascunho

O rascunho não tem session formal, então o modelo precisa ser estabelecido na criação:

- Pré-aquecimento de session já existente: antes do primeiro envio, alinhar `draftConfigRef` novamente ao runtime pré-aquecido e então chamar `sendText`.
- Sem pré-aquecimento: `createSession.config` carrega provider/model/thought/mode/followupMode; sem anexos, pode ser submetido atomicamente junto com `firstInput`.
- Após o primeiro envio bem-sucedido, o draft pane se vincula no lugar ao sessionId retornado; depois disso apenas lê o snapshot config.

Veja os detalhes em `docs/chat/new-task-model-resolution-chain.md`.

## Busy e fila

A queue do V4 é decidida dentro do command core da CLI e não existe mais a antiga fila de conversa local do renderer:

- Com `inputRouting.mode=enqueue`, o input aceito entra na fila autoritativa da session; o command não copia o modelo.
- Com `inputRouting.mode=choice`, o input normal precisa carregar `heldQueueDisposition`, caso contrário a UI exige confirmação.
- Quando o input enfileirado realmente é executado, ele usa o runtime config que já havia sido linearizado e gravado na session naquele momento.
- A semântica de produto de stop/held/auto-drain é decidida pelo snapshot e pelo queue handler da CLI; relay/main não guardam fila.

Isso significa que trocar de modelo pode afetar itens da fila que ainda não começaram. O projeto atualmente não tem uma semântica de produto de "cada prompt enfileirado fixa o modelo no momento da entrada", e a documentação e os testes não devem assumir isso.

## Recuperação e falha de Provider

Se o comando de configuração de modelo retornar `provider.notInRegistry`, a UI sincroniza primeiro o provider registry daquele workspace, depois resolve `runtimeModel` e tenta novamente apenas uma vez. Se a recuperação ainda falhar, não se continua enviando um prompt que aparenta usar o novo modelo; a barreira de envio expõe a falha ao chamador. Uma configuração noop pode prosseguir, porque o runtime já está no valor de destino.

## Entradas de código atuais

- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/v4/configCommandBarrier.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts`