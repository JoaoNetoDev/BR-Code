# Materialização de anexos de prompt remoto

> **Estado atual**: o primeiro parágrafo abaixo, que descreve `zcodeTaskService.sendPrompt`, é preservado como contexto de falha anterior ao V4;
> a implementação atual é regida pela seção "V4 eager staging" e pelo `IPromptAttachmentTransferService`.

## Contexto

Em workspaces remotos WSL/SSH/Docker, o renderer do desktop e o host continuam rodando na máquina local, enquanto o runtime do ZCode Agent roda no ambiente remoto. `ZCodePromptAttachment.localPath` antigamente expressava apenas "um caminho local", sem indicar se esse caminho pertencia ao desktop host ou ao runtime remoto.

Isso quebra as seguintes cadeias no remote WSL:

- Ao colar texto longo acima do limite, o desktop main grava primeiro em `.zcode/tmp/paste-attachments/...` no lado Windows e depois envia o `localPath` do Windows como anexo de arquivo.
- A seleção de arquivos no desktop, o arraste de arquivos e as imagens grandes também priorizam enviar o `localPath`, para evitar o aumento de tamanho em base64.
- Se um anexo de imagem com caminho de cache local entrar no runtime remoto, as ferramentas subsequentes que lerem esse caminho acessarão o sistema de arquivos da máquina errada.

Depois de receber esses anexos, o agente remoto executa `stat/read` desse `localPath` no sistema de arquivos do runtime remoto. No WSL, ler `C:\Users\...` ou outro caminho do host falha, o que se manifesta como conteúdo colado/anexo ilegível.

## Restrições

- Não fazer o agent/core runtime entender caminhos do Windows; o core deve ler apenas caminhos acessíveis na máquina onde ele está.
- Não reenviar arquivos grandes e textos longos como inline/base64, evitando ampliar novamente o payload RPC e o contexto do prompt.
- Workspaces locais do desktop continuam usando `localPath` como antes.
- Workspaces remotos concluem a materialização dos anexos antes da fronteira host -> remote, mantendo o链路 web remote shared-host sem iniciar outro runtime.

## Solução

Ao envolver o `zcodeTaskService.sendPrompt` remoto no desktop host, o host faz materialize dos anexos do prompt:

1. Percorre `attachments` procurando anexos com `localPath`.
2. Envia os anexos legíveis pelo host para um diretório temporário privado do usuário, legível pelo runtime remoto: `~/.zcode/tmp/prompt-attachments/<trace>/<random>/...`.
3. Substitui o `localPath` do anexo pelo remote path após o envio e só então chama o `sendPrompt` remoto.
4. Preserva `sourceKind: "clipboard-text"`, e a colagem de texto longo continua sendo uma deferred file reference, sem ser inserida antecipadamente no corpo do prompt.
5. Se o corpo do prompt contiver o caminho do anexo substituído, substitui-o também pelo remote path, evitando que cenas como imagens em cache indiquem ao modelo a leitura de um caminho do host.

Isto é apenas um reparo de fronteira. A semântica de protocolo mais completa a longo prazo pode adicionar um campo de localidade do anexo, codificando explicitamente as três origens: host-local, runtime-local e inline.

## V4 eager staging

O composer do V4 não espera mais o clique em enviar para materializar. Após selecionar um anexo host-local, o renderer solicita imediatamente, via `IPromptAttachmentTransferService`, o staging no Local/Remote Host que hospeda o escopo do workspace atual; o serviço publica progresso no nível da conexão por operation id e suporta cancel/cleanup.

```text
renderer composer (Desktop continuous / Mobile shared-host replayable)
  -> attachment do Host já existente na janela atual
     ├─ local: transfer local, localPath zero-copy, staged=false
     ├─ SSH/WSL/Docker: transfer no escopo do attachment
     │    -> capacidade de transferência de arquivos da generation atual do SourceServerConnectionManager
     │    -> exec + upload(progress, signal) do mesmo Transport Adapter / backend
     │    -> ~/.zcode/tmp/prompt-attachments/... privado do usuário Source, staged=true
     └─ Server dev direto: mantém o service do Source; não expõe o staging localPath do desktop

attachment fechado / troca de Source -> abort das operações não concluídas + cleanup dos arquivos não adotados
já adotado -> ciclo de vida do ref já aceito pelo CLI, não é removido pelo fechamento do attachment
```

### R3 fiação e ciclo de vida (2026-09-16)

Causa raiz: ao remover o antigo mixed service factory, R3 também removeu o staging entre máquinas; todo o
encaminhamento apontava para o `createLocalPromptAttachmentTransferService` do Source, que apenas devolve o
`localPath` original com `staged:false`. Isso é a falta de conversão de fronteira de sistema de arquivos, e não
pode ser corrigido restaurando o JWT local, removendo a proteção do composer ou forçando `staged`.

O staging entre máquinas é gerenciado pelo owning attachment do Window Host atual, e não é um RPC de negócio comum
que o Source Core possa executar diretamente. O Host sobrescreve `IPromptAttachmentTransferService` ao expor o
attachment; o service do Source no contrato RPC é mantido para a semântica de caminho local do Source. Somente
attachments SSH/WSL/Docker oferecem a capacidade entre máquinas. O Transport Adapter expõe apenas a capacidade
estreita `exec/upload`, reutilizando o backend já estabelecido; o Manager liga a capacidade à conexão online atual, e
operações novas de uma generation antiga falham de forma fechada, sem criar novas conexões SSH/WSL/Docker nem novos
Agents. Provider, JWT e estado de arquivo/sessão do Source continuam mantidos no lado remoto, sem voltar à autoridade
mista antiga.

- Há apenas um registro de operation dentro do attachment; o Host valida no scope confiável `workspaceIdentity`,
  `workspacePath` e `remoteSessionId`, e recusa stage entre scopes. Main/relay não guarda progresso, tarefas, filas
  nem cópias.
- Uma repetição com o mesmo operationId invalida primeiro o registro antigo e aborta; um resultado atrasado só pode
  limpar a si mesmo, sem apagar o registro novo.
- cancel/cleanup/dispose removem o registro de forma síncrona e abortam; mesmo que o upload conclua tarde, ele não
  pode publicar ready, e o arquivo precisa ser recolhido.
- O fechamento do attachment aplica esse fechamento a todas as operações não adotadas; a adoção remove o registro de
  staging e mantém a referência já aceita pelo CLI. Em caso de queda de rede o cleanup é best-effort, e o janitor de
  24 horas continua limpando os arquivos remanescentes; não há reconexão nem troca de linha por causa da limpeza.
- O desktop usa continuous, e o celular continua usando apenas o Host já existente em attachment; colar arquivos
  temporários segue o mesmo contrato de staging, e bytes inline continuam pelo transaction de attachment do V4 já
  existente. O staging não altera a semântica de stream/queue/replay.

- O isolamento de identidade usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`; o roteamento da conexão remota continua passando `remoteSessionId`.
- Quando o composer decide se um anexo precisa obrigatoriamente de materialização remota, para qualquer `workspaceIdentity` não vazio ele falha de forma fechada (fail closed) como alvo remoto, sem exigir que a identity já seja reconhecível pelo resolvedor atual; o próprio `remoteSessionId` já prova que o alvo é remoto.
  Quando a identity já está estabelecida mas o session id ainda não foi injetado, o anexo host-local deve permanecer em `waitingSession` e só ser staged quando a sessão estiver pronta; é proibido que uma identity não canônica ou de novo formato degrade para o caminho local de `localPath` zero-copy durante a janela de injeção.
- O accessor de serviço de sessão de workspaces SSH/WSL/Docker deve usar explicitamente o `promptAttachmentTransferService` remoto. Não pode herdar esse serviço dos `baseServices` locais, caso contrário o eager stage aconteceria na máquina local do desktop e entregaria host paths como `/Users/...` e `C:\Users\...` ao CLI remoto.
- Anexos host-local remotos, depois de chamar `stage`, devem obrigatoriamente obter `staged: true`. `staged: false` indica que o serviço de transferência não cruzou a fronteira de sistema de arquivos host -> remote; o composer deve falhar de forma fechada e manter o portão de envio, sem empacotar o host path retornado como um `AttachmentRef` pronto.
- Os registros de staging em execução pertencem ao Local/Remote Host que hospeda o escopo daquele workspace; relay/main não mantém espelho.
- Após o envio bem-sucedido, o arquivo staged é marcado como adopted para que o runtime o leia na sessão/fila atual; se for removido ou cancelado antes do envio, a limpeza é imediata.
- O eager stage que não for explicitamente limpo é recolhido por um janitor de 24 horas, evitando arquivos órfãos por crash/queda de conexão do renderer.
- Quando o SSH SFTP falha e há fallback para exec pipe, o mesmo operation id é preservado e o progresso não retrocede; WSL/Docker também usam o mesmo contrato de progress/cancel.
- Após a troca de runtime, refs não submetidos são considerados inválidos e o renderer faz novo stage conforme o orçamento de retentativas por anexo; `AttachmentRef`s que já entraram na fila/transcript do CLI continuam gerenciados pelo estado autoritativo do CLI.

Os testes de regressão devem injetar instâncias distintas de transfer service para o accessor local e o remoto e afirmar:

- O workspace local seleciona a instância do Local Host da janela, `stage` retorna `staged: false` e preserva o `localPath` local, sem chamar `IRemoteBackend.upload`.
- Um workspace remote comum seleciona a instância remota, de modo a disparar `IRemoteBackend.upload`.
- O workspace remote Server mantém o accessor server-authoritative, com todos os serviços fornecidos pelo remoto.
- Quando a identity remota (incluindo identities não canônicas/de novo formato que o resolvedor atual ainda não reconhece) é conhecida mas o `remoteSessionId` está ausente, o arquivo host-local permanece em waiting; após a injeção do id, apenas o `stage` remoto é chamado, sem passar pelo caminho local `attachmentPut`/zero-copy.
- Quando o `stage` remoto retorna `staged: false`, o anexo entra em permanent failed e `prepareForSend` retorna null.

## Estados e fronteira multi-dispositivo

```text
desktop remote composer（renderer-local draft）
  | workspaceIdentity=remote:*，remoteSessionId 暂缺
  v
waitingSession --remoteSessionId ready--> queued/uploading
  |                                      |
  |                                      v
  |                              remote transfer stage
  |                                      |
  |                         staged:true  |  staged:false
  |                              ready <-+-> permanent failed
  |                                           |
  +-------------------------------------------+-> 禁止 sendText admission

mobile /remote
  -> 继续 attachment 到桌面已有 shared host
  -> 不创建新 runtime，不在 relay/main 保存附件状态
  -> replayable 只恢复已 admission 的 conversation intent，不恢复 renderer-local 上传进度
```