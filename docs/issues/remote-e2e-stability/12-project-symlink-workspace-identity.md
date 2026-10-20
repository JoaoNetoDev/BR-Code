# Projeto remoto criado a partir de link simbólico não converge para a identidade de realpath

Status: ready-for-human

## Reprodução e evidência de execução

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, build de teste.
Lote `r3-server-20261011105317614-4a6780`, `sourcelines`.

1. Criar no mesmo SSH Source o diretório real A e um link simbólico que aponta para A.
2. Criar o projeto remoto de A e criar um rascunho a partir do projeto, obtendo o anexo de
   workspace canônico.
3. Criar outro projeto para o link simbólico e criar um rascunho a partir desse projeto.
4. Aguardar a identidade da execução atual convergir para A; após 60 segundos ainda falha.

O log de execução registra às 19:00:51 o Host `bound remote workspace context` com o caminho
`/home/dev/r3-workspace-link` e o sessionId `5fd8a173-9662-4a51-8970-602e7b97a241`.
Main/Renderer usam em seguida `remote:server:<mesmo Source ID>:/home/dev/r3-workspace-link`.
Na captura da falha, a identity/path ativa ainda é o caminho do link; a tab do A original mantém
`remote:server:<mesmo Source ID>:/home/dev/r3-workspace-a`, com sessionId
`569d26f6-a878-4c6e-998e-733fa916ce0e`.

```text
projeto A root = realpath → workspace A / attachment 1
projeto B root = symlink → workspace link / attachment 2
esperado: os projetos podem ser diferentes, mas o workspace de execução converge para o mesmo A via realpath remoto
```

## Contrato e impacto

O [contrato de identidade do R3](../../architecture/r3-source-server-remote-architecture.md) §3.2
exige executar realpath no remoto antes de abrir o workspace, evitando que aliases de symlink
produzam duas identidades.
O [contrato atual de projeto](../../superpowers/specs/2026-10-10-session-manage-upstream-integration.md)
permite que vários projetos compartilhem um diretório, portanto a asserção antiga de "não pode
aparecer um segundo projeto" foi migrada; permitir vários projetos não significa permitir várias
identidades de execução para o mesmo diretório real.

O fenômeno foi confirmado nos logs de binding do Host e na captura do Renderer, não pode ser
explicado apenas pela asserção antiga de quantidade de projetos ou pela falha do selector da
sidebar.
O impacto está na reutilização de anexos do mesmo diretório e na atribuição do contexto de
execução da tarefa. O ponto de chamada específico que deixa de aplicar o realpath ainda precisa
ser localizado na correção de negócio;
esta rodada não modifica o código do produto nem troca o caminho esperado pelo symlink para
eliminar a falha.

Diretório de evidências: `packages/desktop/.e2e-artifacts/r3-server-20261011105317614-4a6780-sourcelines/`;
o run log correspondente foi mantido no mesmo lote em `r3-server/run-logs/`. O helper de teste já
recebeu a checagem estrita de prontidão da identidade do projeto,
mas esse patch ainda aguarda revalidação no mesmo baseline, e a checagem estática não é contada
como aprovação de E2E.
