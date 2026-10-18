# Limites de processo, workspace e cadeia em tempo real

Leia antes de modificar as responsabilidades de processo de main/host/services, o isolamento de workspace, session/task, a fila de entrada, stream, snapshot ou a cadeia de controle remoto. Aqui ficam apenas as restrições entre módulos; a implementação concreta deve seguir o documento de fatos atuais correspondente e o contrato correspondente.

## Propriedade dos processos

- O App se comunica com o Agent pelo stdio de subprocessos, com o protocolo `@zcode/protocol`.
- O Main é responsável apenas por janela/dialog nativo, fork de processo, retransmissão de broadcast, recebimento de logs e também pela autenticação/pareamento/heartbeat do controle remoto, repasse de payload e agendamento de attachments do host; os estados de negócio de session/task, stream, queue e snapshot permanecem no owner de negócio.
- Cada BrowserWindow tem exatamente um Local Host de escopo de janela, conectado ao renderer diretamente por MessagePort. Várias tabs de workspace local da mesma janela compartilham esse Host, e os serviços são isolados por workspaceKey; não transforme o escopo de serviço de workspace em um processo Host independente.
- O Local Host hospeda file/system/terminal/setting/credential/broadcast por `createLocalServices({ parentPort })` e gerencia o Agent CLI local por workspaceKey.
- Workspaces SSH/WSL/Docker/Server têm a conexão criada ou reutilizada pelo `RemoteConnectionRegistry` do mesmo Local Host, abertos como tab/session lógicos; não se cria um Desktop Remote Host separado, e o broadcast continua sendo comportamento local do desktop.
- O `/remote` do celular se conecta, via shared-host attachment, ao local host já existente no desktop ou ao remote workspace session host. Criar um runtime, local host ou sessão SSH/WSL/Docker independente para o celular é uma mudança de arquitetura: é preciso comunicar antes, atualizar a documentação de arquitetura e concluir a regressão desktop/celular.
- O relay externo tem apenas autenticação, pareamento, heartbeat e repasse de payload `rpc-frame`/app, sem manter estado de negócio.

## Inicialização concorrente e liberação

A inicialização da execução de modelo para o mesmo `workspaceKey` é coberta por uma única Promise em andamento dentro do Service, abrangendo a leitura de readiness do Provider, a reuso/inicialização do runtime somente-leitura e a elevação da capacidade de execução de modelo. Warmup, pré-aquecimento de rascunho e primeiro envio concorrentes compartilham esse resultado; não se pode interpretar a remoção do registro de espera por conta de outra chamada bem-sucedida como workspace já liberado.
Um `disposeWorkspace` real ainda cancela a identity de espera antiga, e uma continuation antiga não pode ressuscitar o runtime; reabrir o mesmo caminho usa uma nova identity. Quando o Provider não está pronto, nada é iniciado, e os eventos ready posteriores ainda permitem nova tentativa.
Se um evento ready se entrelaça com uma leitura de readiness antiga, primeiro aguarde o fechamento da tentativa antiga, depois confirme a identity em espera e leia o novo estado; um evento novo não pode reaproveitar um resultado antigo de não-prontidão e simplesmente desaparecer.

```text
warmup / createSession / sendText → workspace startup Promise → ready → 各自命令
                                            │
                            disposeWorkspace → cancelled → 旧调用失败
```

Este estado controla apenas a inicialização do runtime e não assume o CLI CommandInbox; o continuous do desktop e o replayable do celular continuam usando seus respectivos clientMode confiáveis, os owners/leases originais e o mesmo runtime de shared-host.

## Identidade do workspace

- `workspaceIdentity` é identidade/isolamento, e `workspacePath` é o caminho real de arquivo. Toda decisão de identidade usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
- A semântica de identidade inclui deduplicação de tab, vínculo de session, chaves de cache/fila/persistência, correlação de requisições entre processos, isolamento de diretórios de configuração do workspace e correspondência de histórico remoto.
- Leitura e escrita de arquivos, cwd de comandos, operações Git, exibição de caminhos e entrada de caminho do usuário continuam usando `workspacePath`.
- Workspaces remotos devem passar `workspaceIdentity`; construção/parsing reutilizam utilitários unificados, como `buildRemoteWorkspaceIdentity`, e as regras de concatenação não são escritas à mão no código de negócio.
- O local continua permitindo não passar identity, usando o fallback por path, sem criar um novo formato de identity local. A interface de isolamento de workspace suporta identity opcional, mantendo compatibilidade com chamadas antigas.
- A cadeia de controle remoto atravessa `workspaceIdentity` e `remoteSessionId`; bridge, snapshot, queue, owner command e chaves de cache/deduplicação não podem casar apenas por path.

## Entrada e mensagens em tempo real

```text
桌面 desktop-continuous ─ direct continuous 实时链路 ─┐
                                                    ├─ 同一 task owner
手机 web-remote-replayable ─ snapshot + gap 恢复 ──────┘

桌面/手机提交输入 → 可信 attachment 注入 clientMode → owner/lease 路由
                 → CLI/runtime CommandInbox 串行 admission → FIFO 执行
Renderer：未提交草稿 + pending optimistic overlay
```

- O desktop usa direct continuous por padrão; o controle remoto do celular usa replayable por padrão. O desktop não concatena as mensagens de recuperação de estado de execução do celular, e o celular não contorna a recuperação por replayable gap/snapshot.
- Ao modificar `getTaskSnapshot`, eventos dinâmicos de task, stream mirror, snapshot de runtime, queued prompt, command de task, permission/elicitation, stop generation ou recuperação de reconexão, passe/verifique explicitamente `clientMode` e `deliveryKind`.
- Entradas busy/running já submetidas são recebidas uniformemente pelo `CommandInbox` da CLI/runtime, e o FIFO segue a ordem de admission serial da CLI. O owner/lease do Host apenas roteia e não guarda uma segunda fila de entradas aceitas; o command preserva o clientMode injetado pelo attachment confiável.
- owner/lease/owner command continuam responsáveis por um único owner de task em execução, roteamento entre hosts, resposta a requisições bloqueantes e proteção contra runs obsoletos. Não remova essas verificações só porque o caminho principal de shared-host existe; qualquer mudança precisa provar que as dependências de remote workspace, bot/proxy e fallback entre hosts foram tratadas.

Antes de alterar os comportamentos de controle remoto/tempo real acima, leia os seguintes documentos de fatos atuais conforme o problema; plans/specs históricos servem apenas como contexto:

- [Arquitetura de controle remoto](../web-remote-control/web-remote-control-architecture.md): attachment, responsabilidades de processo e workspace remoto.
- [Sincronização em tempo real](../web-remote-control/task-realtime-sync.md): continuous/replayable, snapshot, gap e reconexão.
- [Fila de entrada](../web-remote-control-task-command-queue.md): CommandInbox, admission e roteamento de commands entre dispositivos.

## Evidências de runtime

- O canal RPC usa [LoggingChannelServer / LoggingChannelClient](../../packages/rpc/src/logging-middleware.ts) para registrar canal, comando e duração; aproveite os logs existentes para localizar a cadeia de chamadas.
- O rastro de sessão do Agent fica em `~/.zcode/cli/rollout` ou `~/.zcode/cli/debug`, e os logs da CLI em `~/.zcode/cli/log`.
- Para reprodução de interface, prefira o agent-browser; em caso de falha, depure diretamente por CDP, lembrando que a porta padrão de desenvolvimento é a 9229 e que a porta efetivamente em escuta deve ser verificada antes de conectar.
- A validação cobre separadamente os caminhos afetados de desktop local e de controle remoto do celular, registrando evidências de owner, ordem de eventos, identity e limites de delivery; ambientes ausentes necessários seguem as regras de bloqueio do AGENTS.md raiz.