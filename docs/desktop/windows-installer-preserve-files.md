# Windows: especificação de preservação de arquivos do diretório de instalação na atualização

## Objetivo

A atualização por sobrescrita gerenciada limpa apenas os arquivos declarados como pertencentes ao
pacote de distribuição do ZCode; arquivos não relacionados colocados pelo usuário ou por outros
programas no diretório de instalação devem ser preservados. O instalador não pode mais usar
`RMDir /r $INSTDIR` como estratégia de limpeza desse caminho de atualização; upgrades históricos sem
manifest não estão no escopo de garantia desta especificação.

## Lista de propriedade

- A fase de empacotamento gera `.zcode-install-manifest` na raiz do diretório de saída do
  aplicativo Windows, com um caminho relativo de arquivo por linha (separado por barras
  invertidas, UTF-8, terminado em quebra de linha). O manifesto contém apenas os arquivos que o
  pacote de distribuição realmente carrega.
- O arquivo de manifesto é instalado junto com o pacote do aplicativo, para ser lido pelo antigo
  desinstalador na próxima atualização; o próprio manifesto também é um arquivo pertencente ao
  ZCode.
- `customRemoveFiles` apaga somente os arquivos listados no manifesto; não apaga a raiz do
  diretório de instalação nem arquivos/diretórios não listados. Uma falha de remoção encerra
  imediatamente o antigo desinstalador e preserva os arquivos não processados, deixando o
  instalador reportar a falha.
- Quando o caminho do manifesto está ausente ou não pode ser lido, adota-se a estratégia segura para
  migração: o desinstalador atual não apaga nenhum arquivo do diretório de instalação, a instalação
  continua e os resíduos da versão antiga são preservados. Atenção: a primeira atualização a partir de
  uma versão antiga sem manifesto ainda executa o antigo desinstalador; ele pode apagar o diretório
  inteiro recursivamente, e esta especificação não promete a preservação de arquivos não
  relacionados nesse caminho, exigindo uma implementação posterior separada de migração legacy com
  rollback.
- O manifesto é gerado pelo fluxo de empacotamento, e não por entrada do usuário. A implementação
  continua rejeitando caminhos absolutos e caminhos com `..`, evitando que um manifesto malicioso
  ou corrompido apague arquivos fora do escopo.

## Limites de versão

- O manifest é um marcador de capacidade da limpeza por propriedade; a partir da primeira versão com
  manifest, as atualizações por sobrescrita entre versões subsequentes estão no escopo da garantia
  forte.
- Na primeira atualização a partir de uma versão histórica sem manifest, o antigo desinstalador
  ainda pode executar a limpeza de toda a árvore ou retornar mensagem de erro nativa. Esta
  especificação não adiciona backup, restauração nem rollback de migração para esse caminho; o
  usuário pode concluir a atualização desinstalando e reinstalando ou fazendo a migração manual.
- Conforme as versões avançam, adicionam-se proteções e diagnósticos apenas para falhas ainda
  reproduzíveis entre versões novas, sem buscar compatibilidade de uma só vez com todos os estados
  históricos de instalação.

## Compatibilidade e limites

- A desinstalação comum (sem `--updated`) continua sendo tratada pelo fluxo padrão do
  electron-builder; esta especificação altera apenas a fase de limpeza da atualização por
  sobrescrita.
- O diretório de dados fora do diretório de instalação (por exemplo `%USERPROFILE%\.zcode`) está
  fora do escopo do manifesto e não é limpo pela atualização.
- O manifesto registra apenas arquivos e não apaga ativamente diretórios vazios, portanto arquivos
  não relacionados e a estrutura de diretórios são preservados.

## Requisitos de verificação

- Verificação com fixture isolado do NSIS: com o manifesto presente, os arquivos antigos listados
  são apagados e o `user-data.txt` não listado é preservado; com o manifesto ausente no novo
  desinstalador, todos os arquivos antigos são preservados; quando a remoção é bloqueada por um
  file handle do Windows, retorna-se um código diferente de zero e são gravados `cleanup-failed` e o
  PID numérico. A limpeza recursiva legacy do antigo desinstalador está fora do escopo desta etapa.
- O fixture usa o compilador NSIS real correspondente ao electron-builder e não grava em
  diretórios reais de instalação, na área de trabalho, no menu Iniciar ou no registro de produtos.