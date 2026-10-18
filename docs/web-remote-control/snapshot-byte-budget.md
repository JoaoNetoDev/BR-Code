# Orçamento de bytes do snapshot do controle remoto Web

## Objetivo

Quando o controle remoto Web no celular abre uma tarefa com histórico grande, a primeira tela não pode ficar bloqueada na transmissão do snapshot completo e na análise do JSON por causa de uma única mensagem de assistant muito grande. A implementação atual só habilita o orçamento de bytes do snapshot no cenário de controle remoto Web; o desktop mantém a restauração completa.

## Implementação

- A requisição de primeira tela do controle remoto da UI carrega `messageLimit=10` e `byteBudget=200KB`.
- A primeira tela do controle remoto da UI atualmente não carrega mais `toolLimit`. As chamadas de ferramenta mantêm a quantidade completa de entradas, aplica-se apenas o recorte por orçamento de bytes no estado da resposta aos campos que influm, evitando quebrar a ordem original dos assistant parts/tool.
- O servidor primeiro recorta o histórico final pelo número de mensagens e só então calcula o tamanho do JSON de resposta.
- Se o tamanho ainda exceder o orçamento, são recortados o `content` / `thought` das mensagens de assistant, o `input` / `output` / `raw` das chamadas de ferramenta e o `beforeContent` / `afterContent` de `fileChanges`.
- `bodyRefs` contém o nome do campo, o hash do texto completo, o total de bytes do texto completo, o total de bytes da prévia e o `refId` que permite buscar o restante sob demanda.
- Após o recorte, as chamadas de ferramenta retornam `snapshotRefs` no objeto da ferramenta; após o recorte das alterações de arquivo, os snapshots de arquivo retornam `contentRefs`.
- `toolSlice` / `getTaskSnapshotToolCallsSlice()` são mantidos como capacidade do serviço, mas a primeira tela do controle remoto no celular não fatia ativamente por número de ferramentas.
- Ao recortar `raw`, são preservados `toolCallId`, `kind`, `title`, `status`, `_meta.claudeCode.toolName`, `_meta.claudeCode.parentToolUseId`, o pequeno `backgroundAgent` e outros metadados de correlação, evitando quebrar os IDs e as relações pai-filho dos blocos de ferramenta do histórico.
- Quando o celular vê `bodyRefs`, exibe "no momento apenas a prévia é exibida" e oferece o botão "ver mensagem completa".
- Após o clique, chama `getTaskSnapshotBody({ refId })` para buscar o texto completo e, após a verificação do hash, substitui o conteúdo de prévia no store local.

## Limiares atuais

- Orçamento-alvo para o snapshot inteiro da primeira tela do controle remoto: `200KB`. Este é um orçamento flexível no estado da resposta; o servidor primeiro recorta os campos que mais inflam e, se os metadados estruturais restantes já excederem o orçamento, não continua removendo campos estruturais para forçar o tamanho abaixo do orçamento.
- assistant `content` / `thought`: o limite da prévia é `min(32KB, max(2KB, floor(byteBudget / 3)))`.
- tool `input`: acima de `1KB`, é recortado para uma prévia de `256B`.
- tool `output`: acima de `4KB`, é recortado para uma prévia de `512B`.
- tool `raw`: acima de `2KB`, é recortado para uma prévia serializada de `256B`, preservando ao mesmo tempo os metadados de correlação necessários.
- fileChanges `beforeContent` / `afterContent`: acima de `8KB`, são recortados para uma prévia de `4KB`.

## Integridade dos dados

- O recorte ocorre apenas no snapshot do estado da resposta e não é gravado de volta no session JSON local.
- `refId` usa o índice original da mensagem persistida, e não o índice do array após o recorte, evitando buscar a mensagem errada sob `messageLimit`.
- Se o hash não corresponder ou o texto não existir, a UI mantém o estado de prévia e permite nova tentativa.
- Mensagens de assistant temporárias ainda em execução e não persistidas não geram `bodyRefs`, evitando referências que não podem ser buscadas.
- `getTaskSnapshotRef({ refId })` relê o task JSON local e, após a verificação do hash, retorna o valor completo do campo de ferramenta ou do conteúdo do arquivo, garantindo que o recorte não altera a integridade dos dados persistidos.
- Se a fatiação por número de ferramentas for reabilitada no futuro, `getTaskSnapshotToolCallsSlice({ taskId, messageIndex, startToolIndex, limit })` retornará a fatia pela faixa de índices originais das ferramentas; o caminho principal atual depende do recorte por campo, e não de completar por paginação de ferramentas.

## Restrições de interação

- No estado de prévia, o botão de copiar exibe o aviso "carregue a mensagem completa antes de copiar", evitando que o texto de prévia seja copiado como se fosse o texto completo.
- O "carregar mensagens anteriores" do histórico antigo e o "ver mensagem completa" de uma única mensagem grande são duas cadeias independentes: o primeiro completa a contagem de mensagens, o segundo completa o texto de uma única mensagem. A quantidade de chamadas de ferramenta não é atualmente recortada na primeira tela e, por isso, não existe um caminho principal "ver mais chamadas de ferramenta".