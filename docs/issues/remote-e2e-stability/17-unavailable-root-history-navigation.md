# O histórico da tarefa original não abre após a invalidação do diretório principal remoto

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
No lote `r3-server-20261011125749338-152f05`, `directory-missing`, `directory-file` e
`directory-denied` falharam em 188,4, 191,2 e 190,0 segundos, todos travados ao abrir a
tarefa original do diretório invalidado A.

O patch 08 e o lote `r3-server-20261011143037600-31012b` revalidaram as três
variantes usando o ponteiro real da linha de tarefa visível dentro do projeto.
As três entradas `historyNavigation` registram expectedTaskId=A, mas há apenas um pane
primary visível, ainda vinculado a B; o path/identity de A é preservado enquanto o
remoteSessionId fica vazio. A explicação de um clique global no DOM que teria escolhido
a linha oculta foi descartada.

## Fatos de execução

Os três cenários removem, respectivamente, o diretório principal, transformam o diretório
principal em um arquivo comum e revogam a permissão de travessia do diretório pai
exclusivo. O cenário de permissão confirma que o Core sem privilégios e a sonda de
acesso realmente recebem a negativa. Após o reconectar do Source, B/C recuperaram o
novo attachment e B conseguiu continuar a conversa.
A entrada de projeto e a linha de tarefa de A são preservadas, os botões de nova tarefa e
de ver arquivos ficam desabilitados e o aviso de diretório indisponível aparece
corretamente.

Após clicar na tarefa original de A, o pane primary continua mostrando, por 30 segundos
seguidos, as mensagens da primeira rodada e da continuação de B. O último frame do vídeo
do caso `missing` também mostra B; no snapshot o identity/path de A é preservado, mas sem
remoteSessionId. O log do Desktop não fornece eventos de navegação suficientes para
atribuir uma causa raiz única, nem para afirmar que os dados de A foram perdidos.

```text
A/B/C online → desconectar o Source → diretório principal de A invalida → reconectar
  → B/C recuperam, B consegue continuar a conversa
  → A proíbe nova tarefa/arquivos, a linha de tarefa é preservada
  → clicar na tarefa original de A → a página continua sendo B
```

O [contrato de disponibilidade do diretório principal](../../project-primary-root-availability.md)
exige que a leitura do histórico não dependa da existência do diretório e proíbe reconstruir
o diretório para ler o histórico. O resultado atual não atende a esse item; a correção
posterior do diretório e a continuação da tarefa original ainda não foram alcançadas.
O código de negócio não foi modificado. A relação com o
[problema de navegação após reload do Renderer](14-renderer-reload-task-navigation.md)
ainda não foi confirmada.

As evidências estão nos diretórios dos três casos `directory-*` do lote acima, que contêm
`directory-resilience.json`, o vídeo da falha e os logs.
