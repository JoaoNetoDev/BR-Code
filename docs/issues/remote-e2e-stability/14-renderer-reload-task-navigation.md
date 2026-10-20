# Tarefas remotas prontas não podem ser alternadas após o reload do renderizador

Status: ready-for-human

## Reverificação com ponteiro real

A baseline de negócio permanece inalterada, patch de teste 07; o `renderer` do lote
`r3-server-20261011125749338-152f05` falhou após 143,5 segundos. Desta vez as linhas de
tarefa foram limitadas pela identidade do projeto e, depois de esperar a visibilidade,
foi feito um clique com ponteiro real via WebDriver. O Main ainda registra um ACK válido
de reload ready para cada uma das duas sessions originais A/B, e o Renderer ficou
operável após 2026ms.

`beforeSelectingA` mostra que a página atual é B e o cache de navegação não tem A; após o
clique real em A o cache ainda não tem A e o active continua sendo B.
`afterSelectingA.panes` tem apenas um pane visível, o
`session_18e17db7fc3de951f1952295a7f6d8cd`, cujo sessionId é o de B. Portanto, desta vez a
falha não se deve a ter clicado apenas na linha oculta antiga, nem a o probe ter lido
antes um pane oculto; a página realmente visível não alternou.

A cadeia atual de navegação de tarefas chama primeiro `ensureTaskNavigationWorkspace` /
`activateTabByPath`; há um ramo de rejeição quando falta a tab remota. Isso é compatível
com os fatos de "attachment já ready, item ausente no cache de navegação e clique sem
efeito", mas não há logs suficientes para localizar a única causa raiz nesse ramo. A
correção precisa conferir a handover entre o attachment real e a entrada de navegação;
não basta adicionar uma tab falsa sem porta. Nesta rodada o código de negócio e as
asserções que falharam foram preservados.

```text
Renderer reload → attachments originais de A/B ready
  → atualmente B, cache sem A
  → clique real na tarefa original do projeto A
  → B continua sendo o único pane visível (falha após 30 segundos)
```

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011125749338-152f05-renderer/`.

## Descoberta inicial e itens excluídos

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 06.
Lote direcionado `r3-server-20261011123601821-eca14c`, `renderer`, falhou após 184,6
segundos.

Após o reload o Renderer ficou operável em 2232ms; o Main gravou um ACK válido de
`renderer-reload` ready para cada um dos dois remoteSessionId originais, portanto não se
pode continuar atribuindo esse resultado a dois attachments não restaurados. O caso
abriu A com sucesso pela barra lateral e depois disparou um DOM click na task B pelo test
id; após 30 segundos o primary pane ainda era A. O último frame do vídeo de falha mostra
o título de A e o corpo da primeira rodada, o que impede explicar o resultado apenas
pelo probe de cache como uma troca de interface com detecção errada.

A task de B é `session_bcb5ecb4a2c7bc043954b54e1f376f6c`. O log do Desktop confirma que
a assinatura da conversation de B teve sucesso no reload; após alternar para A, B
liberou a assinatura e não foi vista nova assinatura de B depois. A causa direta da não
troca ainda não foi confirmada. A leitura do código encontrou, na navegação de tarefas,
um ramo que decide a admissão remota pelo resultado da ativação da tab, mas os logs
deste caso não provam explicitamente que esse ramo foi atingido, por isso ele não é
escrito diretamente como causa raiz.

```text
Renderer reload → attachments originais de A/B ambos ready
  → seleção de A na barra lateral → A visível
  → seleção de B via DOM → A continua visível (falha)
  → próximo passo: clique real limitado ao projeto + registro das tabs / panes visíveis antes e depois
```

A suspeita sobre a operação de DOM acima foi descartada pela reverificação com ponteiro
real no início desta página. A restauração não foi feita criando uma nova sessão no
lugar da tarefa original.

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011123601821-eca14c-renderer/`,
contendo `renderer-reload.json`, o vídeo de falha e os logs do Desktop.
