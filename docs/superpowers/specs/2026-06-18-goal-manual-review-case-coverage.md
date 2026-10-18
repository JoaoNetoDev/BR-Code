# Cobertura de casos de revisão manual de goal

## Contexto

Os e2e de goal já cobrem parte das asserções automáticas, mas ainda há várias combinações de
estado sem um ponto de entrada de aceitação manual que possa rodar automaticamente. A necessidade
atual não é transformar todas essas combinações em asserções e2e fortes, mas primeiro fazer os
casos rodarem automaticamente até um estado observável e registrar evidências de UI, fila, rede e
estado de execução em artifacts, para a aceitação manual item a item.

## Escopo

Esta rodada completa os manual-review cases dos caminhos não excepcionais:

- completed sem goal, definindo goal: observar o target na UI, requisições de rede, estado de
  execução e pistas de persistência.
- completed já com goal, atualizando o goal: observar se a troca de objetivo mantém apenas o
  objetivo atual.
- running sem goal / já com goal, enviando `/goal`: observar que apenas entra na fila, sem
  requisição imediata, e que o objetivo é atualizado no consumo posterior.
- goal continuation interrompido por stop: observar a semântica completed/interrupted, a ausência de
  paused, a fila preservada e o consumo automático desativado por padrão.
- fase de goal verification: observar que a UI não exibe um estado de prohibiting validating
  independente e coletar o estado dos controles compact/fork/edit.
- múltiplos goals na fila, texto comum e `/compact` misturados: observar ordem, goal kind, edição,
  exclusão, reordenação e o consumo por "conduzir imediatamente".
- combinação de compact manual / automático com goal na fila: observar o estado atual em caso de
  sucesso, stop e falha não disparada; o caminho de falha não exige asserção obrigatória.
- combinações de fork/edit/troca de session: observar que os controles ficam desabilitados com
  goal running, são restaurados após a conclusão, a semântica do objetivo após editar uma query
  antiga e que goal/fila/modelo não se misturam após trocar de session.

Esta rodada explicitamente não cobre caminhos excepcionais: 429, 503, interrupção de SSE, falha do
sidecar, perda de rede, disco cheio.

## Estratégia de implementação

- Estender `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-goal-run-cases.test.ts`.
- Manter a entrada com `ZCODE_E2E_MANUAL_REVIEW=1` e o modo de capture, continuando a gerar para
  cada step o screenshot, chat root, queue, messages, tool blocks e network summary.
- Para cenários instáveis ou que exigem injeção real de falha, adotar a estratégia "observe but do
  not fail": aguardar uma janela curta e, se o estado alvo não for observado, registrar o estado não
  observado no artifact e continuar a execução do caso.
- Aprimorar o resumo de requisições do manual review summary para mostrar se a requisição mais
  recente ao modelo contém `/goal`, goal marker e compact sentinel, ajudando na judgment manual
  sobre se a camada de protocolo repassou `/goal` como uma user message comum.

## Forma de aceitação

Após rodar a spec de manual-review, verificar manualmente
`manual-review/goal-run-cases/<case>/summary.md`:

- Se `chat.targetObjective` / `chat.targetStatus` correspondem ao case atual.
- Se o `kind` e a ordem da `queue` estão conforme o esperado.
- Se as goal requests em `network.recentModelRequests` correspondem ao protocolo esperado.
- Se `messages` oculta goal continuation / system reminder.
- Se o estado dos controles, o snapshot do store e o compact marker em `details` correspondem à
  definição de produto.