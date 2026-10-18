# Especificação E2E P0 de SSH Remoto

## Definição

O P0 de SSH não é um único caso, mas o conjunto de casos centrais de “o usuário consegue conectar, desenvolver,
conversar e continuar trabalhando após os ciclos de vida comuns”.

```text
Ubuntu 24.04 + SSH por senha
  |
  +-- connect/auth ----> diretório ----> identidade de workspace/sessão remota
  |                                         |
  |                                         +-- árvore de arquivos / terminal / Git
  |                                         |
  |                                         +-- task / requisição / resposta
  |                                         |
  |                                         +-- fechar / reiniciar / desconectar / reconectar
  |
  +-- um BrowserWindow ----> um Window Host ----> uma conexão SSH compartilhada
                                               +--> sessão lógica do workspace A
                                               +--> sessão lógica do workspace B
```

Cada caso precisa ter seu próprio setup, action e assertion; não é possível alegar que um estado está coberto
apenas porque um fluxo longo o atravessa.

## Confirmação do usuário e limites de ambiente

Em 2026-08-10 o usuário confirmou que a primeira fase usa apenas um servidor existente: Ubuntu 24.04, root, SSH
por senha. As credenciais são injetadas pelo ambiente de execução; documentação, spec, fixture, artifact e
mensagens de erro não podem armazenar a senha.

| Dimensão              | Incluído na primeira fase                                                   | Podado na primeira fase                                               |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| target             | Um único servidor SSH Ubuntu 24.04                                     | Vários servidores, mesmo caminho com identidade de host diferente                          |
| auth               | senha                                                         | Alias do SSH config, chave privada, passphrase, agent forwarding |
| workspace          | Vários caminhos absolutos sob o mesmo target                                         | Outros targets SSH, combinações de escala com mais de 3 workspaces              |
| client             | Desktop `desktop-continuous`                                     | Celular `web-remote-replayable`, Bot, entre janelas                   |
| Capacidade do usuário    | connect, directory, file, terminal, Git, task, restart/reconnect | tool/MCP, anexos, queue, stop, permission, Goal, compact      |
| Ciclo de vida interno | Início a frio do App, desconexão do SSH Host e reconexão manual                              | renderer reload; coberto pelo `R1-RELOAD-01` independente                 |

## Conjunto de casos P0

### A. Conexão e autenticação

| Case ID        | Setup                                                                                        | Action                                                                                                      | Assertions                                                                                                                                                                             | Estado                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SSH-P0-CONN-01 | Workspace E2E local pronto; servidor alvo acessível                                                     | Abre o assistente de SSH pelo menu de workspace do composer, conecta com senha e escolhe um diretório remoto                                   | Deploy/handshake/diretório RPC bem-sucedidos; path, `workspaceIdentity` e `remoteSessionId` da tab corretos; apenas um Window Host; tab/store/log sem segredos                                                   | formal                                                                                         |
| SSH-P0-CONN-02 | Servidor alvo acessível                                                                               | Conecta com senha errada, vê a falha e depois tenta de novo com a senha correta                                                    | Erro visível e sem segredos; a falha não submete tab de workspace nem deixa sessão lógica/Agent utilizável; a nova tentativa conecta com sucesso                                                                                      | formal                                                                                         |
| SSH-P0-CONN-03 | Servidor alvo acessível; o proxy de teste local mantém pending a primeira conexão TCP e repassa as seguintes ao SSH real | Inicia a conexão com a senha antiga e confirma o cancelamento na fase pending; em seguida tenta de novo imediatamente com a senha correta no mesmo host/porta/usuário | A primeira conexão é fechada sem sessão lógica/escrita remota; a nova tentativa usa nova requisição/credencial, entra na escolha de diretório e abre o workspace; o PID do Host não muda; não afeta a semântica de cancelamento de WSL/Docker/Server                                  | pending (`manual-review/pending/conversation-session-ssh-remote-cancel-retry.test.ts`)         |
| SSH-P0-CONN-04 | Servidor alvo acessível; página de configurações com proxy HTTP local; o CDN de teste de recursos remotos só pode responder através desse proxy                | Seleciona “baixar localmente e enviar” e conecta ao workspace SSH                                                                    | O proxy captura cada requisição de manifest novo obrigatória no deploy; o domínio falso do CDN não pode ser acessado direto; deploy/handshake e abertura do workspace bem-sucedidos; PID do Host não muda. O roteamento da mesma porta arquivado pelo componente é coberto por cache miss forçado em `remoteDeploy.test.ts` | pending (`manual-review/pending/conversation-session-ssh-remote-local-download-proxy.test.ts`) |
| SSH-P0-CONN-05 | Credenciais de sincronização corrompidas localmente, target SSH acessível | A conexão falha, as credenciais são recuperadas, o modelo padrão inválido é mantido e a tentativa é repetida | O erro inicial e o log de conexão contêm um source-read-failed seguro; sem credenciais; nenhuma tab suja; a nova tentativa tem sucesso e a preferência padrão não é sobrescrita | pending (manual-review/pending/conversation-session-ssh-provisioning-failure.test.ts) |

### B. Capacidades básicas de desenvolvimento remoto

Os dados de teste ficam apenas em diretórios isolados `/root/.zcode-e2e/ssh-p0-*` criados pelo caso; setup e
cleanup são feitos pela conexão de controle do teste, sem modificar arquivos do usuário fora do diretório
isolado.

| Case ID       | Setup                                        | Action                                                               | Assertions                                                                                   | Estado   |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| SSH-P0-DEV-01 | Diretório remoto isolado contém um arquivo marker único               | Conecta nesse diretório, expande a árvore de arquivos e abre um arquivo; o Terminal cria um arquivo e a árvore é atualizada | A listagem e a pré-visualização vêm do remoto; o novo arquivo é visível; o caminho local de mesmo nome não participa; a semântica de execução de path está correta                          | formal |
| SSH-P0-DEV-02 | Workspace remoto isolado já conectado                     | Abre o Terminal e executa `pwd`, um marker de Ubuntu/sistema e comandos de escrita de arquivo       | A saída vem do Ubuntu remoto; o cwd é igual ao `workspacePath` remoto; a escrita vai só para o remoto; a conexão de controle reconfirma o arquivo remoto     | formal |
| SSH-P0-DEV-03 | Diretório remoto isolado é um repo Git com commit de baseline | Modifica um arquivo remoto e abre o pane/status do Git                                   | O pane do Git mostra mudanças tracked/untracked do repo remoto; a conexão de controle reconfirma o marker modificado; nenhum commit de teste é criado | formal |

### C. Tasks, requisições e múltiplos workspaces

| Case ID        | Setup                                                                                                | Action                                                | Assertions                                                                                                                                        | Estado                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SSH-P0-TASK-01 | Replay de provider local do caso acessível ao Agent remoto por um reverse tunnel SSH de teste; dois diretórios existem no mesmo target | Cria uma task em cada workspace A/B e envia a primeira; alterna de volta para A/B e envia mais mensagens | A linha da task fica no workspace correto; running→idle sem erro; as quatro requisições e respostas são visíveis; A2 carrega só o histórico de A e B2 só o de B; identity/session independentes; PID do Window Host não muda | formal                                                                                   |
| SSH-P0-TASK-02 | A/B conectados e cada um com uma task concluída                                                                          | Fecha o workspace A, volta para B e continua enviando; depois reabre A   | Fechar A libera só seus próprios attachments/session; a task, as requisições e as respostas de B continuam funcionando; reabrir A reutiliza o Host compartilhado e não sobrescreve B                                            | pending (`manual-review/pending/conversation-session-ssh-remote-task-lifecycle.test.ts`) |
| SSH-P0-TASK-03 | A conectado e com task concluída; a resposta de continuação do replay local do caso tem atraso de 15s                                        | Após a continuação entrar em streaming, abre e fecha a página de configurações; aguarda a task terminar   | Durante a continuação a linha da task na barra lateral gira; o toggle da página de configurações não cria uma segunda assinatura do sessions-index (mesmo attachment e mesmo topic são substituídos silenciosamente pelo CLI); ao terminar, o estado running some da barra lateral e fica consistente com a área de conversa | pending (`manual-review/pending/conversation-session-ssh-remote-settings-overlay-sidebar-status.test.ts`) |

### D. Persistência, desconexão e recuperação

| Case ID        | Setup                        | Action                                                                       | Assertions                                                                                                                         | Estado                                                                                     |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SSH-P0-LIFE-01 | A/B conectados e cada um com task concluída  | Reinicia por completo Electron/Main/Host; reconecta manualmente a partir do workspace desconectado e continua a task original | O início a frio não conecta sozinho; o item persistido mantém path/identity e sem segredos; após a reconexão manual a task e o histórico são recuperados; a continuação acerta a task original; nenhum workspace duplicado é criado   | pending (`manual-review/pending/conversation-session-ssh-remote-cold-reconnect.test.ts`) |
| SSH-P0-LIFE-02 | A/B compartilham o mesmo SSH Host e estão online | Encerra apenas o `zcode-server` remoto iniciado por este caso, sem tocar no `sshd`; depois clica em reconectar em A    | A/B ficam desconectados ao mesmo tempo e o workspace local não é afetado; apenas um novo SSH Host é criado; A/B recebem `remoteSessionId` novos e são recuperados; o roteamento de task/arquivo não se mistura | pending (`manual-review/pending/conversation-session-ssh-remote-server-fault.test.ts`)   |

## Invariantes compartilhadas

| Invariante                                  | Prova no P0                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Apenas um Host por BrowserWindow        | Antes e depois de todos os casos o Process Monitor só mostra o mesmo PID de Window Host; exceto no início a frio do App, quando só pode surgir um Host novo   |
| Workspaces do mesmo target compartilham a conexão SSH | A/B não repetem deploy/handshake; há só um `zcode-server` correspondente no remoto; as sessões lógicas são independentes                              |
| Identity e path não se confundem                 | Isolamento/key usam `workspaceIdentity?.trim() \|\| workspacePath`; cwd de file/git/terminal usa `workspacePath` |
| Execução remota, app-global local               | file/git/terminal/Agent vêm do remoto; setting/credential/provider vêm do local e são sincronizados explicitamente                         |
| desktop continuous não espalha replayable    | O P0 não cria attachment de celular e não assere gaps/snapshots replayable                                                 |
| Segredos não são persistidos nem entram em evidências | A senha vem apenas de `ZCODE_E2E_SSH_PASSWORD`; tab, settings, fixture, capture, logs e textos de falha não contêm a senha    |

Em 2026-08-19 o usuário confirmou a podagem de estado do cancelar/retry de SSH: aceita-se apenas “o último SSH
pending waiter cancelado” como nova semântica de abort de baixo nível; waiters compartilhados e o cache de SSH
online continuam usando os casos de contrato existentes; WSL, Docker e Server mantêm o ciclo de vida de transport
original, sem produto cartesiano com SSH. SSH-P0-CONN-03 usa um proxy TCP de mesma porta que bloqueia a primeira
conexão e repassa as seguintes, fixando a janela pending sem usar sleep ou a velocidade de resposta de senha
errada. Esse caso não envia prompt e a provider request policy é none.

## Fixture e restrições de execução

- Variáveis de ambiente obrigatórias: `ZCODE_E2E_SSH_HOST`, `ZCODE_E2E_SSH_PORT`, `ZCODE_E2E_SSH_USERNAME`, `ZCODE_E2E_SSH_PASSWORD`.
- A descoberta completa formal padrão só inclui os specs reais de SSH quando `ZCODE_E2E_SSH_HOST`, `ZCODE_E2E_SSH_USERNAME` e `ZCODE_E2E_SSH_PASSWORD` existem; a porta continua aceitando o padrão 22. Sem credenciais, o suite padrão deve excluir esses casos de ambiente e não pode contar “ambiente não configurado” como falha de produto. A execução direcionada explícita do spec de SSH continua fail-closed e reporta as variáveis que faltam, facilitando a verificação da configuração por quem mantém o ambiente.
- Os caminhos de workspace usam `ZCODE_E2E_SSH_WORKSPACE_PATHS`; para conversa o padrão é `/root,/home` e para as capacidades básicas de desenvolvimento são usados os case-local `/root/.zcode-e2e/ssh-p0-*`.
- Os casos de provider usam uma fixture de replay OpenAI-compatible local do caso; o reverse tunnel transporta apenas o tráfego do provider de teste e a conexão SSH do produto continua sendo estabelecida pela UI real.
- A fixture remota precisa ter um prefixo único deste run e ser limpa no `finally`. Casos de desconexão só podem encerrar o `zcode-server` iniciado pela conexão da janela atual; é proibido modificar `sshd`, a rede do sistema ou processos de outros usuários.
- Todos os specs começam em `manual-review/pending` e não são promovidos a formal sem revisão humana.
- O proxy/CDN de `SSH-P0-CONN-04` precisa ser totalmente fornecido por processos locais do caso, sem acessar o CDN de publicação real; a URL alvo do teste é insolúvel no caminho direto e só o mock de proxy pode devolver manifest, provando mecanicamente que não há silent direct fallback.

## Evidências de execução

- `SSH-P0-TASK-01`: em 2026-08-10, no Ubuntu 24.04, replay formal padrão concluído em `/root,/tmp` (1 passing, artifact `desktop-e2e-20260810-074921-918`) e replay case-local explícito (1 passing, artifact `desktop-e2e-20260810-075053-683`).
- `SSH-P0-CONN-01/02`: em 2026-08-10, no mesmo Ubuntu 24.04, replay formal padrão concluído, 1 passing, artifact `desktop-e2e-20260810-073137-368`.
- `SSH-P0-DEV-01/02/03`: em 2026-08-10, no repo case-local `/tmp`, replay formal padrão concluído, 1 passing, artifact `desktop-e2e-20260810-073248-576`.
- `SSH-P0-TASK-02`, `SSH-P0-LIFE-01/02/03` permanecem `pending` até passarem em uma execução real; evidências de unit/integration não podem substituir o estado do E2E Electron com SSH real.
- `SSH-P0-TASK-03` (novo em 2026-09-04): originado de feedback de usuário de WSL 3.11.1 — a barra lateral ficava girando para sempre após abrir a página de configurações com um workspace remoto em execução; a causa raiz e as evidências de unit estão em `docs/wsl-task-status-inconsistency.md` T3. A verificação do contrato da fixture passou (`pnpm --filter @zcode/desktop e2e:fixture:check`) e o caso permanece `pending` até passar em uma execução SSH real.

## Implementação pending do ciclo de vida

Os specs pending abaixo foram escritos com o mesmo harness de Ubuntu por senha SSH + replay por reverse
tunnel e ainda não são declarados formal/covered; a promoção só pode ocorrer depois de capture/replay em um
ambiente SSH real e revisão humana:

- `conversation-session-ssh-remote-task-lifecycle.test.ts`: fechar A, validar a continuação em B e reabrir A.
- `conversation-session-ssh-remote-cold-reconnect.test.ts`: reiniciar a frio com `browser.reloadSession()`, preservar o item desconectado, clicar na entrada de reconexão de A e recuperar A/B.
- `conversation-session-ssh-remote-server-fault.test.ts`: encerrar apenas o PID de `zcode-server` novo e registrado nesta conexão, verificando a desconexão de A/B e a reconexão por grupo; não chama `sshd`, `wsl --terminate` nem `wsl --shutdown`.
- `conversation-session-ssh-remote-cancel-retry.test.ts`: manter a primeira conexão pending, confirmar o cancelamento e tentar de novo imediatamente no mesmo target com a senha correta; não envia requisições ao provider.

A fixture de replay case-local e o manifest desses casos já foram montados e a verificação da fixture passou;
antes da execução real ainda é preciso confirmar o stream do provider, a atribuição do PID do servidor SSH, os
eventos de desconexão e o comportamento de agrupamento da reconexão.