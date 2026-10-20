# Workspace / App — estado de rascunho na entrada

## Resumo da feature

| Campo                 | Valor                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Mudança               | a entrada de cold start do app e a entrada de abertura em nível de workspace não selecionam mais a última sessão, apenas entram no rascunho vazio                                                    |
| Superfícies visíveis ao usuário | restauração de startup do Desktop, abertura de workspace local/remoto, linha de workspace na barra lateral, foco de workspace do sistema                                         |
| Docs existentes       | `docs/conversation-session-case-catalog.md` TSL、`docs/v4-refactor/06-ui.md`                                               |
| Donos do estado       | a ativação de tab/workspace é mantida pelo tab store; o rascunho/`activeTaskId` é mantido pelo bucket Zustand do workspace; pane/group é estado de UI local do renderer |
| Fora de escopo         | clique explícito em sessão histórica, deep link de notificação/task, restauração do conteúdo da sessão, projeção de CLI, gap/snapshot replayable do celular                  |

## Registro de esclarecimentos

| Rodada | Pergunta                                             | Resposta do usuário          | Limite fixado                                   | Necessário acompanhamento |
| ----- | ---------------------------------------------------- | -------------------- | ------------------------------------------------ | ---------------- |
| 1     | Abrir um workspace ou iniciar o app exige abrir uma sessão por padrão? | Não, apenas o estado de rascunho | a entrada em nível de workspace/app deve manter `activeTaskId=null` | no               |
| 2     | Durante a troca de workspace após uma conexão remota bem-sucedida, o lado direito pode ficar em branco antes de mostrar o rascunho? | Não; ainda é preciso ativar o workspace remoto, mas o lado direito deve entrar direto na nova conversa | a ativação da tab remota e o `startDraft` do workspace de destino devem pertencer à mesma etapa de commit, e a atualização da lista não pode ficar entre as duas | no |
| 3     | Ao ativar pela barra lateral um workspace remoto desconectado, o que o lado direito mostra durante a conexão? | Durante a conexão o conteúdo atual à direita é mantido; só após a conexão ficar ready é que se muda para a nova conversa remota | não se deve ativar primeiro uma tab desconectada sem `remoteSessionId`; só após conexão, identity e services ready se faz o commit atômico de tab + rascunho | no |
| 4     | Ao abrir um workspace desconectado pela entrada de histórico remoto, depois do sucesso apenas a tab é atualizada? | Não; deve ser consistente com o reconexão pela barra lateral, e após o ready é preciso entrar na nova conversa do workspace de destino | a entrada de histórico deve passar um callback unificado de ativação de workspace; a ordem fixa é completar a tab → ativar a identity exata → `startDraft` → atualizar pinned/timeline | no |

## Decisões de limite

### Falha do projeto local padrão (2026-09-15)

Quando o diretório do projeto local selecionado na restauração da inicialização não existe, não é um diretório ou é inacessível, o padrão é entrar no rascunho sem projeto de 「任务」, sem definir o projeto indisponível como o workspace ativo. A entrada do projeto inválido e as tasks históricas são preservadas; não se exclui o projeto nem se cria uma session formal. O rascunho segue o cwd app-owned devolvido por `fileService.ensureConversationWorkspace()`, com `projectId=null` e `activeTaskId=null`.

A escolha da restauração continua sendo calculada uma única vez por `restorePersistedRemoteWorkspaceSessions` e submetida ao TabStore:

```text
Main verifica o diretório local padrão → unavailableWorkspacePath
Host resolve o cwd sem projeto → Renderer calcula a lista de restauração e o índice ativo
  → primeiro frame ativa o workspace sem projeto → primary draft / composer existentes
  → active-first depois completa a entrada inválida, mantendo a escolha atual do usuário
```

Também cobre a restauração da nova `lastActiveWorkspace` e da lista antiga, e a ordem da lista não afeta a escolha de fallback. Quando a resolução do diretório sem projeto falha, a capacidade de restauração de erro/somente leitura existente é preservada, sem passar um diretório inválido por um rascunho enviável. Diretório local válido e navegação explícita por task histórico mantêm a semântica existente; o remoto com o mesmo caminho não usa a marca de indisponibilidade local.
Esta rodada só muda a navegação da inicialização do desktop, e não a atribuição de estado do Host/CLI, o schema de persistência, nem os limites de restauração do shared-host attachment do celular e do `web-remote-replayable`.

Verificação: testes unitários da função de restauração cobrem a versão nova/velha, a ordem, o active-first e a nova escolha do usuário; o Desktop E2E, após um reinício completo, afirma que o rascunho sem projeto aceita entrada, que o diretório inválido continua inexistente e que ainda aceita entrada após um refresh.

| Limite         | Decisão                                             | Inclui                                  | Exclui / poda               | Origem                |
| ---------------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------- | --------------------- |
| cold start do app       | restaura as tabs de workspace, mas não restaura o dono de sessão visível       | tabs locais, SSH/WSL/Docker                  | não apaga sessões históricas              | usuário                  |
| Entrada de nível workspace | toda abertura/ativação explícita de workspace entra no rascunho               | seleção de pasta, linha de workspace, foco do sistema      | navegação explícita de sessão/task          | usuário                  |
| reload do renderer  | preserva a restauração de pane da sessão atual                        | refresh do mesmo renderer, retomada do streaming em andamento            | cold start do processo do app                  | contrato M3 existente  |
| Primeira execução         | somente o primeiro envio ou um comando que precisa se anexar a uma sessão cria/liga a sessão | promoção do rascunho                           | esconde a criação de sessão formal na inicialização/abertura | protocolo de conversa |
| Multiplataforma             | semântica de entrada de workspace consistente; perfil de delivery inalterado        | desktop continuous, web remote replayable | relay/main mantém o estado da sessão    | arquitetura          |
| Conexão remota concluída     | antes do ready mantém o lado direito atual; após o ready ativa a tab remota e troca imediatamente a titularidade do rascunho desse workspace | primeira conexão SSH/WSL/Docker/Server e reuso de tab desconectada | ativar antes a tab `remote-waiting`; só fazer `startDraft` depois da atualização de pinned/timeline | usuário |

## Escopo de domínio e donos do estado

| Domínio                        | Inclui?       | Autoridade / evidência                                                         |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------- |
| Comportamento de conversa/sessão | sim            | `activeTaskId`, DOM do rascunho, primeiro comando `createSession`                      |
| Casca de UI / persistência        | sim            | ativação de tab, layout de pane, workbench group, armazenamento de renderer de last-session  |
| Identidade do workspace            | sim            | `workspaceKey = workspaceIdentity?.trim() \|\| workspacePath`               |
| Replayable no celular             | representativo | apenas prova que a entrada não seleciona sessão; não altera snapshot/gap/owner/lease                      |
| Provider/runtime/fila        | podado         | não altera o comportamento existente após o primeiro envio                                                   |

```text
app cold launch / open workspace
  -> activate exact workspaceKey
  -> deactivate visible workbench group + reset primary pane (desktop only)
  -> activeTaskId = null
  -> render draft

explicit session/task navigation
  -> activate exact workspaceKey
  -> activeTaskId = target sessionId
  -> optionally restore that session's workbench

draft first send
  -> createSession
  -> bind returned sessionId
  -> subscribe continuous | replayable according to trusted attachment

remote workspace selection / disconnected workspace reconnect
  -> keep current active workspace and conversation while connecting
  -> remote services + workspace identity ready
  -> activate/upsert exact remote workspace tab
  -> startDraft for the same workspaceKey in the same interaction stage
  -> render remote draft without an empty intermediate pane
  -> refresh pinned/timeline task lists as async follow-up
```

## Combinações candidatas e poda

| ID do candidato | Estado                                    | Evento                                 | Efeito esperado                                          | Status   | Observações                                        |
| ------------ | ---------------------------------------- | ------------------------------------- | -------------------------------------------------------- | -------- | -------------------------------------------- |
| WED-01       | workspace persistido + última sessão       | cold start do app                       | workspace visível, rascunho primário, nenhuma sessão selecionada    | aceito | dono de pane/group obsoleto não pode sobrescrever o rascunho |
| WED-02       | workspace tem sessões históricas        | abertura/ativação em nível de workspace         | rascunho do workspace de destino                                   | aceito | apenas o bucket de identity exata                   |
| WED-03       | existe sessão histórica                | clique explícito em sessão/deep link de task | abre a sessão de destino                                      | aceito | não é uma entrada exclusiva de workspace                   |
| WED-04       | sessão em execução no renderer atual   | reload do renderer                       | restaura a sessão selecionada e continua a projeção     | aceito | preserva a continuidade de refresh do M3              |
| WED-05       | anexo remoto no celular                 | troca apenas de workspace                 | rascunho sem alterar a recuperação replayable               | aceito | limite de host compartilhado inalterado               |
| WED-06       | o lado direito atual está mostrando o workspace local ou outro; o workspace remoto de destino ainda não está conectado | selecionar um diretório remoto, clicar no workspace desconectado na barra lateral, ou abrir um workspace desconectado pela entrada de histórico remoto | durante a conexão mantém o lado direito atual; quando os services ficam ready, completa primeiro a tab, depois ativa o workspace remoto exato e entra sincronamente no rascunho desse workspace antes de a lista de tarefas concluir a atualização | aceito | proibido expor uma tab ativa `remote-waiting`; as três entradas devem reutilizar a mesma semântica de commit de ativação de tab e de dono do rascunho |
| WED-P01      | combinações de provider/modelo/tema/locale | qualquer entrada WED                         | mesmo resultado de navegação                                   | podado   | essas dimensões não são donas da seleção        |
| WED-P02      | estado de fila/meta/compacto/fork/ferramenta       | entrada de app/workspace                   | a sessão histórica permanece no histórico, sem auto-seleção | podado   | nenhum comando é enviado para essa sessão           |

## Casos aceitos e preenchimento da matriz

| ID do caso | Configuração                                    | Ação                             | Asserções                                                               | Evidência                            | Status do E2E |
| ------- | ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ---------- |
| TSL08   | existem last-session/group/pane persistidos | cold start ou abertura só de workspace | `activeTaskId=null`; um rascunho primário; nenhuma assinatura de sessão restaurada | UI + renderer store + rastro de comandos | planejado    |
| TSL09   | o renderer atual mostra uma sessão em execução | reload do renderer                    | a mesma sessão é religada; a projeção continua                            | UI + subscription/session id        | planejado    |
| TSL10   | rascunho ou outro workspace está visível    | clicar em uma sessão histórica         | a sessão de destino abre; a identity exata de workspace é selecionada                  | UI + renderer store                 | planejado    |
| TSL35   | a conversa do workspace local/outro está visível; o workspace remoto de destino está desconectado | selecionar um diretório remoto ou clicar no workspace desconectado | a conversa atual permanece montada durante a conexão; depois que os services ficam ready, a tab remota exata e seu rascunho primário ficam visíveis antes de a atualização de pinned/timeline assentar | UI + ordem de tab/Zustand + connect/refresh diferido | coberto por unitário |

O E2E usa fixtures de inicialização/navegação sem requisições de provider; a TSL08 deve afirmar, antes do primeiro envio, que não houve comando de conversa `createSession`. A TSL09 continua usando um stream controlado para provar a retomada do streaming no reload, sem misturar cold start do app com reload do renderer numa mesma classe de equivalência.