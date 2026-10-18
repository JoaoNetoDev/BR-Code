# Abertura externa da prévia de HTML local

## Objetivo

O "Abrir no navegador" do cartão de prévia de HTML local no desktop deve entregar o caminho do arquivo diretamente ao aplicativo padrão do sistema operacional; quando a abertura falha, deve-se dar retorno ao usuário e registrar no log do processo principal. Links externos comuns de `http`/`https` continuam sendo abertos por URL no navegador do sistema, e Web e workspace remoto mantêm o comportamento atual. O "Abrir no navegador padrão" da barra de ferramentas do navegador embutido segue a mesma restrição para páginas locais.

## Restrições de comportamento

- O cartão HTML local do desktop mantém o caminho absoluto do arquivo, e a ação de menu chama a interface de abertura por caminho, sem entregar mais URL `file://` ao `shell.openExternal`.
- O IPC `openExternal` do processo principal faz uma separação uniforme para URLs `file:`: após decodificação com `fileURLToPath` (incluindo percent-encoding de chinês e espaços, removendo hash/query), chama `shell.openPath`; isso cobre entradas como a barra de ferramentas do navegador embutido que obtêm a file URL percent-encoded de `webview.getURL()`. Em caso de falha de conversão, registra-se log no processo principal, sem fallback para `shell.openExternal`.
- O resultado da abertura por caminho é retornado como `{ success, error? }`; quando `success=false`, a UI exibe um toast internacionalizado.
- O processo principal registra a abertura de arquivo local bem-sucedida ou falha, o caminho e a mensagem de erro, facilitando a localização de erros do Windows ShellExecute a partir dos logs exportados.
- URLs externas comuns ainda passam por `shell.openExternal`, mas a Promise rejeitada precisa ser capturada e registrada, evitando que outras entradas continuem falhando em silêncio.

## Aceitação

1. Caminhos absolutos do Windows, com chinês e com espaços chamam `shell.openPath`, retornam erro vazio em caso de sucesso e não disparam `shell.openExternal`.
2. Quando `shell.openPath` retorna erro ou lança exceção, o log do processo principal contém o erro e o cartão HTML exibe o toast de falha.
3. Links externos `http`/`https` e cartões HTML remotos não alteram o caminho de abertura original.
4. Depois que o navegador embutido abre um HTML local com caminho contendo chinês e espaços, a opção de menu "Abrir no navegador padrão" abre via `shell.openPath` usando o caminho local decodificado, sem disparar `shell.openExternal` (ZCT-202610-8F404D97).