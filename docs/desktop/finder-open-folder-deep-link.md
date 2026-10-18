# Abrir pasta pelo menu de contexto do sistema no Desktop

## Contexto

O menu de contexto de pastas do gerenciador de arquivos do sistema precisa oferecer uma entrada que entregue
ao ZCode a pasta local atualmente selecionada pelo usuário. A semântica dessa entrada equivale ao `Open folder`
do menu de estado vazio acima da caixa de entrada da interface principal: pula o diálogo de seleção de
diretório e abre o diretório indicado diretamente como workspace.

## Escopo

- O ponto de disparo é o serviço de menu de contexto de pasta do Finder no macOS, sem nova UI dentro do app
  ZCode.
- O nome de exibição do serviço do Finder acompanha o idioma do app ZCode: `zh-CN` exibe «在ZCode中打开»
  (“Abrir no ZCode”) e `en-US` exibe `Open in ZCode`.
- Apenas uma pasta é suportada. Em seleções múltiplas, o script de serviço do sistema deve passar apenas o
  primeiro diretório.
- Apenas caminhos absolutos locais são suportados: não há suporte a workspace remoto, ao `/remote` do celular
  nem ao diretório atual na área em branco do gerenciador de arquivos.
- No lado macOS, aceita-se `zcode://workspace/open?path=<encoded-absolute-directory>`.
- No lado Windows, aceita-se `--open-workspace <absolute-directory>` ou `--open-workspace=<absolute-directory>`.

## Fluxo de dados no macOS

1. O ZCode Desktop instala ou atualiza `~/Library/Services/Open in ZCode.workflow` na inicialização do macOS e
   ao trocar o idioma do app; o nome do arquivo workflow permanece estável, evitando múltiplos serviços
   residuais do Finder após upgrades, e o nome de exibição do menu de serviço grava o idioma atual do app.
2. O Finder Quick Action / Service recebe o caminho de uma única pasta.
3. O script do serviço aplica `encodeURIComponent` ao caminho absoluto e chama
   `/usr/bin/open "zcode://workspace/open?path=..."`.
4. O processo main do Electron faz o parse do deep link e valida scheme, host, path e a existência do diretório.
5. O processo main envia o caminho do diretório ao renderer via IPC `OpenWorkspacePath`; no cold start o caminho
   é cacheado primeiro e entregue quando o renderer estiver pronto.
6. O renderer reutiliza `handleSelectProject(path)`, preservando a deduplicação de tabs existentes, a ativação
   entre janelas e a lógica de atualização de recentProjects.

O workflow instalado precisa ser compatível com a estrutura de bundle tanto de workflow no diretório do usuário
quanto de workflow do sistema: `Contents/document.wflow` e `Contents/Resources/document.wflow` recebem o mesmo
conteúdo. `workflowMetaData` usa o mesmo `serviceApplicationBundleID` dos workflows embutidos do sistema e marca
o input type como `com.apple.Automator.fileSystemObject.folder`.

## Fluxo de dados no Windows

1. O ZCode Desktop instala ou atualiza as chaves de registro do menu de contexto do Explorer para o usuário atual
   na inicialização do Windows.
2. O registro grava `HKCU\Software\Classes\Directory\shell\ZCode.OpenInZCode`, com o texto de menu
   `Open in ZCode` e o ícone apontando para o executável atual do ZCode.
3. O registro grava `HKCU\Software\Classes\Directory\shell\ZCode.OpenInZCode\command`, com o comando
   `"<ZCode.exe>" --open-workspace "%1"`.
4. Em paralelo, grava `HKCU\Software\Classes\Drive\shell\ZCode.OpenInZCode`, permitindo abrir a raiz de uma
   letra de disco pelo menu de contexto.
5. Após o disparo do Explorer, um segundo processo do ZCode é iniciado; o single-instance do Electron extrai
   `openWorkspacePath` por `additionalData` ou por argv.
6. O processo main reutiliza a validação de diretório local e o IPC `OpenWorkspacePath`; no cold start o caminho
   é cacheado primeiro e entregue quando o renderer estiver pronto.
7. O renderer reutiliza `handleSelectProject(path)`, preservando a deduplicação de tabs existentes, a ativação
   entre janelas e a lógica de atualização de recentProjects.

O Windows não usa `zcode://workspace/open` como comando de menu do Explorer porque o comando de registro pode
passar `%1` diretamente como argv, evitando que espaços, `&`, `#` e `%` do caminho passem pela cadeia de
codificação/decodificação de URL. A gravação no HKCU não exige permissões de administrador; a extensão COM de
menu moderno de nível superior do Windows 11 não é implementada por enquanto, e o item de menu aparece no menu
shell tradicional padrão do sistema.

## Boundaries

- Seleção múltipla: apenas o primeiro diretório é processado; os demais são ignorados.
- Arquivo selecionado: a configuração do menu do sistema deve ficar restrita a pastas; o lado do app rejeita
  caminhos que não sejam diretórios.
- Caminhos no macOS com espaços, chinês, `&`, `?`, `#`: o script do serviço precisa codificar, e o app decodifica
  pela query da URL.
- Caminhos no Windows com espaços, chinês, `&`, `?`, `#`: o Explorer passa argv por `"%1"`; o app não faz
  decodificação de URL.
- Caminho no Windows igual à raiz de uma letra de disco: passado pela chave de registro `Drive\shell`, por
  exemplo `C:\`.
- Caminho no Windows vindo de UNC ou de diretório inexistente: o app rejeita após a validação; a funcionalidade
  atual só promete diretórios absolutos locais.
- App não iniciado: após o cold start do deep link, a abertura do diretório continua quando o renderer estiver
  pronto.
- App já com janela: o envio vai para a janela em foco ou para a primeira janela disponível, e a UI trata a
  deduplicação entre janelas via `activateOrSetWorkspace`.
- `allowOpenWorkspace=false`: o lado do renderer recusa a execução, evitando que o serviço do sistema burle a
  restrição do modo atual.

## Referência do script de serviço do Finder

O app grava esse workflow automaticamente; o script abaixo é a lógica real da action `Run Shell Script`,
servindo como referência para diagnóstico.

```bash
first=""
for item in "$@"; do
  if [ -d "$item" ]; then
    first="$item"
    break
  fi
done

if [ -n "$first" ]; then
  encoded=$(/usr/bin/osascript -l JavaScript -e 'function run(argv) { return encodeURIComponent(argv[0]); }' "$first")
  /usr/bin/open "zcode://workspace/open?path=${encoded}"
fi
```