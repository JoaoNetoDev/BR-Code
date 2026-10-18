# Contrato de runtime de read-state do Bash Read File

## Contexto

Atualmente o active path não depende de `# Using your tools` para exigir que o modelo faça um Read antes; em vez disso, mantém-se um produtor de read-state dentro do runtime do Bash: comandos Bash de leitura simples identificados de forma conservadora escrevem o conteúdo do arquivo em readFileState, de modo que o guard de read-before-write de Edit/Write subsequentes considere aquele arquivo já lido.

## Escopo desta rodada

- Suportar backfill de read-state, de forma conservadora, para os comandos Bash `cat`, `head`, `tail`, `sed -n` e `grep`/`egrep`/`fgrep`; quando o stdout do Bash ou a leitura de arquivo via FileSystemPort for truncada, não há backfill.
- Suportar o `staleReadFileStateHint` para quando comandos Bash de escrita modificam um arquivo já lido.

## Fora de escopo

- Não implementar seed read state.
- Não implementar NotebookEdit.
- Não modificar o prompt nem a lista de tools visível ao provider.
- Não persistir os metadados de read-state gerados pelo Bash.

## Ordem de execução no runtime

1. O foreground command do Bash termina de rodar.
2. O runtime monta primeiro o `BashOutput` normal.
3. Se o comando for do tipo escrita, o runtime examina o readFileState existente antes da execução; se o mtime tiver avançado após o início do Bash, acrescenta um stale hint. O texto do hint mostra os 5 primeiros caminhos relativos ao cwd, com `and N more` quando houver mais, usando singular/plural de `file`/`files`.
4. Se o comando for um comando Bash de leitura identificado de forma conservadora e o stdout do Bash não estiver truncado, o runtime relê o arquivo real pelo FileSystemPort e escreve em readFileState; se a leitura via FileSystemPort for truncada, o backfill também é pulado, evitando falsificar como "lido" um arquivo completo que o modelo não viu.
5. Background, image output e interrupted não geram stale hint nem fazem backfill de read-state.
6. provider-error que não seja falha semântica é tratado como shell error, não gerando stale hint nem backfill de read-state; `grep`/`egrep`/`fgrep` só fazem backfill quando o exit code é 0.