# Permissões de usuário e de menção de arquivo no WSL

## Contexto

O remote workspace do WSL inicia o host e o agent remotos por meio do `wsl.exe`. O WSL não
precisa de autenticação por senha SSH, mas cada comando ainda roda sob alguma identidade de
usuário Linux. Por padrão, o ZCode usa o usuário padrão da distro.

O menu `@` das menções de arquivo monta recursivamente a lista de candidatos a partir da raiz
do workspace. No Linux, listar um diretório exige permissão de read/execute no diretório;
quando algum subdiretório foi criado por root ou por outro usuário e não é legível pelo
usuário atual, o `readdir` retorna `EACCES` / `EPERM`.

## Design

- A conexão WSL dá suporte a um campo opcional `user`. Valor vazio significa continuar usando
  o usuário padrão da distro; ao preencher `root`, o host / agent / terminal do WSL são
  iniciados com identidade de root.
- Um `user` vazio é a semântica de usuário padrão compatível com versões antigas: não pode
  gerar uma nova workspace identity nem fazer com que conexões WSL históricas sigam um
  caminho de implantação totalmente novo por causa da nova escolha de usuário.
- O `user` do WSL participa da remote workspace identity, evitando que conexões com usuário
  padrão e com usuário root no mesmo caminho compartilhem session, cache, fila ou chave de
  persistência.
- Quando o `user` do WSL não é vazio, aceita-se apenas uma string comum exibível: recusa-se
  caracteres de controle, dois-pontos, barras e contrabarras, e limita-se o comprimento, para
  evitar que nomes de usuário inválidos só falhem na etapa de conexão e também evitar
  poluição de identity e de rótulos de log.
- O `mock-cdn` dos remote assets em modo de desenvolvimento é apenas um cache offline; nesta
  versão, quando o cache não existe, é obrigatório recorrer ao CDN/cache, para evitar que uma
  reconexão WSL a um endereço antigo seja interpretada como falha de conexão por falta de
  pacote na máquina local.
- A UI de conexão exibe um aviso para o usuário root, indicando que os arquivos criados
  depois podem pertencer ao root. O aviso não impede a conexão.
- Ao encontrar um único diretório ilegível ou já removido, o índice de menções de arquivo
  pula esse diretório e continua exibindo os demais arquivos acessíveis. Um diretório
  ilegível não deve fazer o menu `@` inteiro falhar.
- Os anexos de prompt do remote workspace são enviados primeiro do lado do host para um
  diretório privado do usuário remoto, `~/.zcode/tmp/prompt-attachments/<trace>/<random>/...`,
  e depois os caminhos do host no prompt são reescritos como caminhos remotos. Antes do envio
  o diretório recebe `chmod 700` e após o envio os arquivos recebem `chmod 600`, evitando que
  textos longos colados, imagens ou anexos de cache local caiam no `/tmp` público e sejam
  lidos por outros usuários da mesma máquina.
- Nesta versão os diretórios remotos de anexos de prompt não são apagados automaticamente no
  fim da task: esses arquivos ficam em `~/.zcode/tmp` do usuário remoto atual, para facilitar a
  re-tentativa ou a recuperação dentro da mesma sessão. Se mais tarde for introduzida limpeza
  automática, ela deve estar vinculada ao ciclo de vida da task/sessão e apagar apenas o
  diretório privado aleatório deste trace; falhas devem ser registradas apenas como warn.

## Não objetivos

- Não executar sudo automaticamente nem elevar privilégios silenciosamente no menu `@`.
- Não adicionar um campo de senha para o usuário WSL; o `wsl.exe --user` exige que o usuário
  Linux de destino já exista e, por si só, não consome senha.
- Não alterar os limites de realtime do `desktop-continuous` do desktop e do
  `web-remote-replayable` do `/remote` no mobile.
- Não limpar automaticamente, nesta correção, os diretórios de anexos que já foram gravados
  em `/tmp/zcode-prompt-attachments`; os diretórios antigos precisam de tratamento manual pelo
  usuário ou por um script de migração posterior.

## Pontos de verificação

- A conexão com o usuário padrão do WSL continua sem `--user`.
- A conexão com usuário customizado do WSL usa `--user <user>`.
- Uma conexão do WSL com root consegue estabelecer uma workspace identity independente.
- Nomes de usuário WSL inválidos (como os que contêm `/`, `:`, caracteres de controle ou
  excessivamente longos) são recusados na camada de UI e de schema.
- O índice de arquivos `@` não é interrompido ao encontrar subdiretórios com `EACCES` /
  `EPERM` / `ENOENT`.
- Antes do envio, os anexos de prompt remotos criam o diretório privado remoto e o restringem
  a `700`; após o envio, os arquivos são restringidos a `600`, e o caminho remoto contém um
  segmento aleatório imprevisível.