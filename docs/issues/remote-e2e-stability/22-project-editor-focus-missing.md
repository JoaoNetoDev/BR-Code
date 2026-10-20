# Foco continua no body da página depois de abrir o editor pelo menu do projeto

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 08.
O `uipairwise` do lote `r3-server-20261011143037600-31012b` falhou em 132,2 segundos.

## Evidências de execução

No cenário em inglês, tema escuro, 960×700, ao clicar em Edit project pelo menu real do projeto, o editor e o diretório correto já foram exibidos.
O teste esperou 5 segundos e exigiu que o activeElement estivesse dentro do editor visível; ao final, `focusFailure={tag: "BODY", testId: null}`.
O último frame da gravação mostra o campo de entrada do editor sem anel de foco. Desta vez não houve focus manual no campo de entrada, nem leitura imediata do primeiro frame de montagem com falha.

```text
Menu do projeto → Edit project → editor exibido
  → aguardar o foco visível entrar no editor (5 segundos)
  → activeElement ainda é BODY
```

O campo de nome do `ProjectEditor` declara autoFocus e o menu do projeto abre o editor por `onSelect`.
É preciso conferir a ordem entre a devolução do foco no fechamento do menu e o gerenciamento de foco do Dialog; as evidências atuais ainda não localizam de forma única um callback específico.
Nesta rodada não se altera a implementação de negócio, nem se força focus no teste para mascarar o problema. A matriz subsequente de idioma chinês/tema claro, offline e reconexão não chegou.

Este item corresponde ao requisito de usabilidade de foco do [R3A-UI-03](../../testing/r3-remote-automation-case-matrix.md).
As evidências estão no `ui-pairwise.json`, na gravação da falha e nos logs do `uipairwise` do lote acima.
