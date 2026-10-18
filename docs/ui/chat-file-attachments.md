# Chat File Attachments (fatos atuais)

Os anexos são gerenciados pelo composer do V4. Depois que o usuário seleciona, cola ou arrasta um anexo, ele é pré-enviado imediatamente; somente anexos `ready` que já possuem um
`AttachmentRef` podem ser enviados em `sendText.attachments`.

A admissão de envio usa de forma unificada a regra “corpo de texto ou anexo, pelo menos um”: `text.trim()` não vazio, ou a existência de pelo menos um
`AttachmentRef` válido, bastando um deles. Draft só com anexos, envio em idle, fila enquanto em running e edição de query são todas entradas legítimas; quando corpo e anexos estão ambos vazios, retorna `proto.invalidPayload`.

## Estados e Portões

```text
waitingSession -> queued -> uploading -> committing -> ready
                              |
                              +-> transient failure -> 500ms 后自动重试一次
                              +-> failed -----------> 用户手动重试
```

O renderer guarda o estado de upload por `workspaceKey + composer scope`; o `workspaceKey` é sempre obtido de
`workspaceIdentity?.trim() || workspacePath`. Esse estado não entra no relay/main nem persiste `File` no navegador,
mas ainda pode ser restaurado e continuar o upload atual depois de uma troca de task ou de um desmonte parcial do composer.

- O limite de uploads simultâneos é 2; o progresso é monotônico, chega a no máximo 99% antes do commit e mostra 100% por cerca de 300ms após o commit bem-sucedido.
- Quando qualquer anexo não está `ready`, tanto o botão de envio quanto os dois botões de seleção da held-queue ficam desabilitados; a entrada de submit valida de novo, proibindo gerar `sendText` ou qualquer queue command.
- A retentativa automática ocorre no máximo 1 vez; a retentativa manual abre um novo orçamento de retentativas. Upload bem-sucedido não envia automaticamente.
- Remover um anexo aborta a transação em andamento e limpa o conteúdo temporário. A troca de geração do CLI/runtime invalida refs não submetidos e reenvia o arquivo conforme o orçamento de retentativas original.
- Essa limpeza vale apenas para anexos ainda não submetidos do composer. Ao editar uma query já enviada, remover um anexo apenas atualiza a lista de refs do novo active branch e não apaga arquivos locais, artifacts ou conteúdo temporário remoto usados pelo branch antigo.
- Drafts de anexo e estado de upload são isolados por `workspaceKey + composer scope`; trocar de task não cancela uploads em segundo plano, e ao voltar eles continuam sendo exibidos.

## Rotas de Transporte

```text
本地 desktop localPath ----------------------------> ready（零拷贝）
SSH/WSL/Docker localPath -> host transfer -> remote stage -> ready
Web/inline bytes --------> V4 begin/chunk/commit ---------> ready
```

- Um localPath real do desktop local não fabrica progresso de upload.
- Web/inline usa a transação de chunks V4 já existente, sem mudança no schema do wire; o put de alto nível oferece progresso e cancelamento.
- Em SSH/WSL/Docker, o host desktop envia o path local do host para um caminho temporário legível pelo runtime remoto; não é permitido entregar um caminho do desktop diretamente ao Agente remoto.
- relay e desktop main apenas repassam RPC e não guardam draft de anexo, progresso, fila nem estado de negócio de sessão.

## Caminho Derivado de Imagens Coladas

Imagens do clipboard continuam tendo como fato persistido um artifact de data URL com escopo de sessão. Depois que o commit do artifact é concluído, o
CLI materializa eagerly um arquivo de imagem real em um diretório separado de image cache com escopo de sessão; esse arquivo é apenas um
cache derivado e reconstruível, e não é gravado no `AttachmentRef`, no transcript da conversa nem no snapshot replayable.

```text
<storageRoot>/cli/
  ├─ artifacts/<sessionId>/...                              # durable artifact
  └─ image-cache/<sessionId>/image-<artifact-uri-hash>.<ext> # derived image
```

Esta seção define apenas o isolamento de caminho entre a imagem derivada e o durable artifact; não acrescenta limpeza periódica nem semântica de migração de caminhos antigos.

```text
paste -> durable data URL artifact -> eager image file
send  -> ensure image file path
          ├─ 写入中：等待同一任务
          ├─ 已存在：复用
          └─ 不存在：从 durable artifact 重建一次
```

O ciclo de vida do singleflight da URI é independente de uma query específica e não recebe `AbortSignal` pertencente ao chamador. O paste e o envio
reusam e aguardam diretamente o mesmo Promise de materialização, evitando que o cancelamento de uma requisição se propague para a tarefa de cache compartilhada.

## Anexos PDF no Composer

PDF é um tipo de prompt attachment independente, mas reaproveita os limites de admissão, artifact, FilePart,
derived cache, restauração e projeção de capacidade antes da requisição que image e video já têm. Na UI o PDF continua sendo um cartão de arquivo de documento e não entra na grade de mídia;
tanto o draft do Composer quanto a user row já enviada podem abrir o PdfViewer existente.

```text
local/staged path 或 V4 upload bytes
  -> TurnAttachment(type=pdf)
  -> 校验 MIME、20MiB 上限和 %PDF magic
  -> durable zcode-artifact:// URI
  -> part.data 中的 FilePart link + metadata
  -> <storageRoot>/cli/pdf-cache/<sessionId>/pdf-<uri-hash>.pdf
  -> request 前 materialize path，再按 supportsPdf 做 omit/restore
```

- PDF Web/inline segue o V4 já existente com 20MiB, chunk de 512KiB e a atual transação de upload; PDF Desktop local/staged não é embutido em base64 no renderer e é lido de forma limitada pelo Agent no momento da admissão.
- O artifact é a fonte de verdade do anexo; `part.data` não guarda base64 nem caminho de cache, e `pdf-cache` é um arquivo derivado reconstruível, que não entra em transcript, snapshot nem evento replayable.
- O live turn atual pode reusar um path local/staged acessível ao runtime; a restauração a frio, mensagens históricas e troca de modelo devem priorizar `artifact -> pdf-cache` e não podem deixar um local path antigo sobrescrever o conteúdo do artifact.
- A pré-visualização de um PDF enviado é autorizada pela combinação exata de sessão/row/part e lida em fatias de offset/limit via `attachment/read`;
  quando o artifact existe mas a materialização falha, há apenas o rebaixamento para chunks do artifact, sem voltar para o caminho original mutável.
- `supportsPdf=true` mantém o bloco de arquivo PDF e o `[PDF: source: <path>]`; `supportsPdf=false` omite apenas os dados de PDF visíveis ao provider e mantém o texto de source. A projeção é refeita a cada requisição, sem modificar o histórico persistido.
- Nenhuma nova tabela de attachments no banco é criada. FileParts `application/pdf` existentes são hidratados diretamente; apenas anexos históricos com local path antigo tentam ser re-artifactados antes da requisição e, quando o arquivo de origem não existe mais, mantêm um texto de source claramente indisponível, proibindo a decodificação como arquivo comum em UTF-8.

A requisição final ao provider acrescenta texto comum
`[Image: source: <absolute-path>]` no mesmo conteúdo real do usuário: modelos com suporte a imagens recebem o image block e o path; somente quando há explicitamente
`supportsImages === false` o image block é substituído pelo texto existente de media-omitted, e o path é preservado.
O path não passa por system reminder, runtime attachment nem MCS. Com várias imagens, todos os blocos image/omitted vêm primeiro e todos os blocos de path disponíveis vêm depois. Imagens que já têm um caminho local real reusam o caminho original e não geram cópia derivada.
Quando o cache derivado não suporta determinado MIME de imagem, o comportamento é best effort: a cadeia provider de image/base64 original é preservada e apenas o cache/path daquela imagem é pulado; falhas de IO real ou de durable artifact para MIME suportado ainda falham explicitamente antes da chamada ao provider.

## UI

- Imagens seguem com miniatura compacta, com um anel de progresso circular e porcentagem sobreposto ao centro.
- Anexos que não são imagens exibem um estado de texto equivalente; o estado de falha oferece retentativa e remoção.
- O estado não pode depender apenas de cor: é preciso fornecer `aria-label` / `role=status|alert` localizados.
- O drop de arquivos do V4 é assumido de forma única pela raiz do pane de conversa inteiro: linha do tempo, estado vazio, área de status e composer pertencem todos à mesma drop surface; a caixa de entrada principal não registra mais o drop de arquivos. A barra de título leve de nova task do desktop exibe uma drop mask temporária depois que o drag em nível de janela é ativado, e se conecta ao composer de draft principal. Essa estrutura é consistente com o antigo `ChatView`.
- O `WORKSPACE_FILE_DRAG_MIME` da árvore de arquivos do workspace não vira anexo de upload, e sim insere uma menção de arquivo do workspace; somente arquivos do sistema operacional entram na fila de pré-envio de anexos. Essa semântica é consistente com o antigo `ChatView`.
- O Web do celular não tem entrada de arrastar/selecionar arquivos do sistema; aqui apenas se reaproveita o roteamento de drop local do renderer do composer do V4, sem acrescentar semântica de runtime, host, relay ou transporte `web-remote-replayable`.
- O editor inline de uma query enviada permite apenas remover anexos já existentes e não oferece seleção de arquivo, arrastar, colar convertendo em anexo nem reenvio.
  No composer comum, colar que atinge 5120 caracteres ainda vira anexo de texto pela regra existente; um texto do mesmo tamanho no edit inline
  permanece como corpo de `editUserQuery.newText`.
- Ao copiar células de Excel ou de um programa de planilha, a área de transferência do sistema pode expor ao mesmo tempo `text/plain`, HTML do Excel e um
  `image/png` sintético. Quando o composer comum detecta marcação de HTML do Excel ou texto separado por tabulação, ele precisa priorizar o texto:
  conteúdo curto vai para a colagem do editor e só vira anexo clipboard-text ao atingir 5120 caracteres; nunca tratar o
  PNG sintético do mesmo payload como uma imagem colada deliberadamente pela pessoa usuária. Screenshots, cópia de imagem e arquivos `.xlsx` sem evidência de texto de tabela continuam indo como anexo.

## Edição de Anexos de Query Enviada

```text
row.attachments
  -> 打开 edit 时复制为 renderer-local editAttachments
       -> 删除一个或多个 ref
          -> accepted: editUserQuery.attachments 原样替换 active branch
          -> failed/stale/blocked: 保留本地编辑状态
          -> cancel: 丢弃本地状态，下次从 row 重新初始化
```

O contrato de três estados de `editUserQuery.attachments`: campo ausente significa manter os anexos canônicos originais; array não vazio significa
substituir pela ordem dada; `[]` explícito significa limpar todos os anexos. Remover um anexo já enviado não chama API de transferência, abort
ou cleanup de anexo, evitando quebrar o histórico antigo e as referências de outros branches.

## Pré-visualização de Imagens Enviadas

A user row enviada continua guardando apenas o `AttachmentRef`. Anexos de imagem (`mime` começando com `image/`) são clicáveis;
anexos que não são imagem permanecem estáticos, sem button, cursor de mão ou semântica de abertura por teclado. O renderer não trata o `File` anterior ao envio,
object URL ou base64 como fato histórico, e tanto o live, o cold resume quanto o restart do app passam pela mesma
consulta somente leitura a partir do ref da row atual.

```text
ConversationRow.userInput.attachments
  -> 图片点击
     -> workspace service（沿当前 workspaceIdentity / remoteSessionId attachment）
        -> v4/attachment/read(sessionId, previewRef ?? ref, offset, limit)
           -> CLI 先验证 ref 属于当前 session 的图片 row
              -> zcode-artifact:// ref：读取持久化 artifact
              -> local / SSH / WSL / Docker path：由该 session 所在 runtime 读取
           -> <= 512 KiB decoded chunk，NDJSON 返回 base64
        -> renderer 拼成 Blob URL -> 图片预览 dialog
        -> close / target change / unmount -> URL.revokeObjectURL
```

```text
desktop-continuous row -------------------+
                                          +-> 同一个只读 attachment/read query
web-remote-replayable row -> attached host+

relay / desktop main：只转发，不保存 bytes、cache、row 或 preview 状态
```

- A query precisa trazer o `sessionId` exato, e o CLI só aceita o `ref` ou
  `previewRef` do anexo de imagem na projeção atual daquela sessão; é proibido transformar qualquer caminho do renderer em interface de leitura de arquivo.
- O wire devolve no máximo 512 KiB de bytes decodificados por vez; o transporte de alto nível da UI se encarrega de puxar tudo seguindo `nextOffset`, evitando que
  um anexo de 20MiB estoure o envelope NDJSON de 1MiB. O CLI pode fazer um cache curto e limitado de leitura do mesmo ref, mas não pode persistir isso em
  relay/main nem deixá-lo entrar em snapshot/event de conversa.
- Quando a leitura falha, o dialog mostra o “图片不可预览” localizado, mantendo o nome do arquivo para explicar o histórico; em seguida esse cartão perde a
  semântica de abertura e o cursor de mão falso. A falha não modifica row, branch, contexto do provider nem o arquivo do anexo.
- O `/remote` do celular não cria um runtime de Agente próprio; ele acessa o host de sessão local/remoto da janela do desktop já existente por meio do shared-host attachment. O isolamento de identidade remoto continua usando uniformemente
  `workspaceIdentity?.trim() || workspacePath`, e a execução de caminho continua usando `workspacePath`/runtime ref.
- Quando o histórico antigo não tem ref legível, o arquivo foi movido/removido ou o artifact já foi reciclado, não se tenta adivinhar o caminho nem se recorre a enfiar base64
  na row; o estado fica explicitamente como não pré-visualizável.

```text
文件拖入 pane / 桌面草稿标题栏
  -> 目标 SessionPane 的 ConversationComposer drop controller
       -> workspace-file MIME -> 插入 mention
       -> OS File[]           -> 附件预传（原有 V4 路由）

主输入框不单独注册 drop
  -> 同一事件只由外层 SessionPane 消费一次
```

Pontos de entrada da implementação: `packages/ui/src/v4/ConversationComposer.tsx` e
`packages/ui/src/v4/composer/useComposerAttachments.ts`.