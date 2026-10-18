# Snapshot de Shell Efetivo do Bash

## Contexto

A escolha de shell da Bash tool afeta simultaneamente três comportamentos:

- Qual shell executa de fato os comandos Bash.
- Qual Shell aparece no `# Environment` visível ao provider.
- Qual ambiente de execução e qual ambiente de prompt as subtarefas Explore herdam.

No passado essas informações vinham separadamente de variáveis de ambiente, do adapter de execução e de settings/runtime config, o que tornava fácil o modelo ver um shell diferente daquele em que o Bash realmente executava. Este documento define o contrato de runtime unificado.

## Contrato central

O runtime mantém um `ExecutionShellSelection` de nível de sessão, que é o snapshot de shell efetivo da Bash tool. O estado inicial de uma sessão nova é não inicializado; o shell candidato atual só é inicializado como snapshot de session-start antes de aceitar de fato o primeiro prompt do usuário.

- A criação normal de sessão e o pré-aquecimento de deferred draft não resolvem a shell selection configurada pelo usuário.
- `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts` é o único owner do session shell environment, responsável por inicialização, leitura, patch de EnvInfo, persistência e restauração no resume.
- Antes de a sessão aceitar entrada pela primeira vez, a fronteira unificada de execução do usuário lê uma única vez do Host de referência o valor atual do shell candidato, via o scope `user-execution` de `session/requestRuntimePreferences`, e então chama `initializeSessionShellEnvironmentIfNeeded()` para inicializar. Essa requisição espera no máximo 15 segundos; em timeout, um erro de protocolo bloqueia a primeira execução do usuário, sem retry nem fallback silencioso para outro shell.
- O campo `Shell` do `# Environment` inicial mostra apenas o `display.name` desse snapshot de session-start.
- A execução da Bash tool usa a mesma selection.
- O ambiente de prompt das subtarefas Explore e o runtime filho herdam a mesma selection.
- Se o usuário trocar de shell dentro da mesma sessão, a sessão atual não é atualizada a quente; é preciso criar uma nova sessão para a troca valer.
- Uma sessão deferred draft é apenas um estado oculto de pré-aquecimento de nova conversa, não uma sessão estável já iniciada pelo usuário. Na criação do pré-aquecimento, a shell selection configurada pelo usuário não é lida.
- O legado `session/send`, o `sendText` do V4 e create/resume/subscribe não carregam valor de shell candidato; a leitura no Host acontece apenas na fronteira unificada de primeira execução do usuário do Agent, e não é permitido que desktop/mobile ou cada entrada de command mantenham ramificações próprias.
- O prompt comum do app, a goal external activity, o expert workflow e o script workflow compartilham a mesma fronteira de execução do usuário. Qualquer entrada que crie o primeiro fato visível ao usuário, inicie um turn de modelo ou um workflow child agent precisa chamar essa fronteira para inicializar o snapshot do shell antes de persistir a sessão ou criar o runtime filho.
- `session/create` / `session/resume` do protocolo não aceitam valor de shell candidato, evitando que o chamador acredite poder sobrescrever o shell da sessão na fase de criação ou retomada.
- Quando a sessão for realmente persistida pela primeira vez, o runtime grava a shell selection do momento da criação no `session_entry`.
- No cold resume, o core runtime lê preferencialmente essa selection persistida para reconstruir o runtime config, em vez de reler os settings mais recentes.
- O cold resume primeiro verifica se a selection persistida ainda está disponível: `legacy-shell` pode não ter path; o fallback de `cmd.exe` do Windows continua sendo aceito pela semântica original; outros paths de shell concretos ainda precisam ser arquivos executáveis. Quando inválida, o path antigo não é entregue ao executor Bash, e há fallback para a selection atual já resolvida na entrada de resume.
- Se uma sessão legada não tiver selection persistida, ou se a selection persistida já tiver expirado, só é possível restaurar de forma best-effort pela lógica de resolução automática atual; quando o Shell do `# Environment` histórico divergir do shell de execução atual, o modelo deve ser avisado por meio de um attachment `shell_environment_change`. Quando uma sessão legada do Windows é assumida pelo auto Git Bash atual, mesmo que o `# Environment` histórico não tenha um campo Shell confiável, um lembrete de shell Git Bash é inserido uma vez, para evitar que o modelo siga com o antigo hábito de shell.

## Snapshots `.sh` do Bash Runtime

O runtime da Bash tool tem três snapshots de nomes parecidos, mas responsabilidades diferentes:

1. session shell selection snapshot
   - Gerenciado por `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`.
   - Determina o shell efetivo da sessão atual, o campo Shell do `# Environment` visível ao provider e o shell display herdado pelo Explore.
   - Depois que a sessão é criada, não é atualizado a quente por troca de settings.

2. shell init snapshot
   - Gerenciado por `apps/zcode-cli/packages/adapters/src/exec/shell-init-snapshot.ts`.
   - Em POSIX/Git Bash, na primeira vez o adapter usa um login shell para executar o snapshot creation script, faz source dos arquivos rc do usuário e grava functions, aliases, opções de shell e PATH em `shell-snapshots/snapshot-${shell}-${timestamp}-${random}.sh`, sob o storage da ZCode.
   - Política de exportação de functions/options/aliases: só exporta quando o rc do usuário existe, filtra functions de completion com underscore único, limita a saída de options/aliases a 1000 linhas e filtra aliases de `winpty` em Git Bash/MSYS/Cygwin.
   - O snapshot creation script usa o host path do lado do adapter para escrever o arquivo; a conversão de path do Git Bash só ocorre depois, quando um comando real faz source do snapshot.
   - Depois de criado com sucesso, os comandos seguintes da Bash tool fazem primeiro source deste snapshot e então executam o comando real com shell não-login, ou seja, os spawn args passam de `-c -l <command>` para `-c <command>`.
   - Se a criação falhar, há degradação para o comportamento original, continuando com `-c -l <command>`.
   - Se o hot resume ainda reutiliza o mesmo adapter/manager, pode continuar reutilizando o snapshot ready do processo atual.
   - O cold resume não restaura o path do arquivo de snapshot; após restaurar a session shell selection, a primeira chamada de Bash recria o shell init snapshot.
   - Cold resume ou um novo adapter não varrem nem ressuscitam snapshots antigos, nem reutilizam arquivos de mesmo nome por sessão/hash; o novo processo cria um novo arquivo de snapshot aleatório e os resíduos antigos ficam só com a limpeza por retenção.
   - Antes de cada execução real de comando Bash, verifica-se novamente se o arquivo de snapshot em cache continua acessível; se o arquivo foi perdido, desta vez há fallback para login shell, sem omitir o `-l`.
   - Se o usuário cancelar o comando ou fechar o adapter durante a criação do snapshot, o comando real do modelo não continua sendo spawnado.
   - O snapshot criado com sucesso no processo atual é tentado como unlink em `NodeExecutionAdapter.close()`; resíduos excepcionais são limpos pela limpeza por retenção.
   - A limpeza por retenção remove por padrão arquivos `.sh` no nível superior de `shell-snapshots/` com mtime de mais de 30 dias.
   - CMD e shell legado não criam nem fazem source de shell init snapshot.

3. ZCode startup script snapshot
   - Gerado e materializado por `apps/zcode-cli/packages/adapters/src/exec/bash-startup-script.ts` a partir do `bashPrelude` da execution request; não existe mais o descriptor `bash-startup.ts` no lado do core.
   - Esse script é infraestrutura interna de execução da ZCode, não conteúdo de prompt visível ao provider, e não altera o schema das tools.
   - O fallback de `rg` é sempre mantido; se `find` / `grep` são mapeados para `bfs` / `ugrep` é decidido pela preferência de busca aprimorada fixada na materialização pelo runtime da sessão raiz, habilitada por padrão.

A ordem de execução é: primeiro faz source do shell init snapshot, depois do ZCode startup script, e então executa o comando do modelo e o trailer de captura de cwd. O path do arquivo de snapshot não é persistido como estado de sessão; após um cold resume, o adapter cria preguiçosamente um novo snapshot aleatório com base na shell selection restaurada. Arquivos antigos não podem ser restaurados diretamente como snapshot ready.

## Estrutura de Selection

`ExecutionShellSelection` é a única estrutura de dados de shell selection, compartilhada entre contracts, adapters, core e bootstrap.

- `dialect`: semântica de wrapper de execução, hoje `posix`, `git-bash`, `cmd` ou `legacy-shell`.
- `source`: origem da selection, hoje `auto-detected`, `user-config` ou `legacy-fallback`.
- `path`: caminho de executável já resolvido. O fallback legado pode não ter caminho.
- `display.name`: nome estável visível ao provider, por exemplo `zsh`, `bash`, `Git Bash`, `CMD`, `system shell`. Aqui é proibido exibir caminho absoluto.
- `id` / `label`: metadados de exibição em settings ou diagnóstico, que não fazem parte do contrato visível ao provider.

O runtime config usa apenas `bashShellSelection` como source of truth. O command do execution adapter de baixo nível continua carregando essa selection no campo já existente `shellOverride`, mas o runtime / tool context não mantém mais um segundo estado `bashShellOverride`.

## Regras de resolução

macOS / Linux:

- Resolve primeiro um `zsh` / `bash` disponível.
- Se o próprio `$SHELL` for um `zsh` ou `bash` executável, pode-se usá-lo diretamente.
- Se o usuário usa um shell não compatível com Bash, como `fish`, o `fish` não é usado como shell da Bash tool; a resolução continua buscando `zsh` / `bash` no `PATH` e em caminhos fixos.
- Sem encontrar `zsh` / `bash`, retorna `legacy-fallback`, preservando o comportamento antigo de fallback para shell genérico.

Windows:

- Quando o usuário escolhe Git Bash explicitamente, essa selection tem precedência.
- Quando o usuário escolhe CMD explicitamente, o CMD tem precedência.
- No modo automático, Git Bash tem precedência.
- Sem encontrar Git Bash, retorna `legacy-fallback`, preservando o comportamento antigo de fallback para cmd / ComSpec.

## Prompt e cache

O `# Environment` é um snapshot de session-start e não é reescrito porque o usuário trocou de shell dentro da mesma sessão. Isso evita que o prompt-cache sejainvalidado por uma mutação do system context inteiro.

Trocar de shell não acrescenta um attachment `shell_environment_change` a sessões existentes. Como a execução do Bash continua usando a selection de session-start, o `# Environment` inicial visto pelo modelo e o ambiente real de execução do Bash permanecem coerentes.

A exceção é o cold resume de sessão legada sem snapshot utilizável: essas conversas não têm uma session-start shell selection estável a recuperar, e o runtime só pode continuar a execução com a selection atualmente resolvida. Se no Windows a assunção final for do auto Git Bash, um lembrete curto é inserido via `shell_environment_change`, dizendo ao modelo que os próximos comandos Bash estão sendo executados com Git Bash. Isso não é um hot update de shell dentro da mesma sessão, nem uma leitura dos settings mais recentes do usuário sobrescrevendo um snapshot já utilizável.

`apps/zcode-cli/packages/bootstrap/src/app/create-app.ts` solicita preguiçosamente uma única vez o valor candidato do Host na fronteira unificada de execução do usuário e reutiliza esse resultado ao longo do ciclo de vida do app. Quando o candidato do Host é inválido ou não há escolha explícita, a resolução automática do ambiente de execução da CLI assume com `resolveEffectiveBashShellSelection()`. Sessões que já têm ou têm persistida uma selection ignoram o valor candidato; a leitura da selection persistida, a validação de disponibilidade e a aplicação de fallback ficam uniformemente a cargo de `AgentRuntime.resumeFromStore()`.

O pré-aquecimento de deferred draft não congela o shell; ele só é lido antes da primeira execução real do usuário. desktop continuous, web-remote replayable, prompt legado/V4, goal external activity, expert workflow e script workflow devem passar pela mesma admissão de app/runtime. Um remote com desktop anexado solicita, pelo serviço de Agent de escopo de workspace, de volta ao `SettingService` local do Host compartilhado do desktop; o `/remote` do celular reutiliza esse Host. relay/main não guarda configuração de shell, e o `~/.zcode/v2` remoto também não é fonte autoritativa para workspaces com desktop anexado.

Quando o Host antigo retorna `-32601`, ou quando o Agent ainda não conectou ao Host e recebe `-32020`, mantém-se a resolução automática da CLI; outros erros de protocolo, de resolver ou de transporte falham como são. Aqui não se adiciona pull por envio, broadcast de settings, sincronização de cache nem snapshot de settings em nível de Session.

## Herança do Explore

Subtarefas Explore herdam a shell selection efetiva do runtime pai:

- O `EnvInfo.shell` do prompt filho usa o `display.name` da selection do pai.
- A execução da Bash tool do runtime filho também usa a mesma selection.

Assim, o Shell que o modelo vê dentro do Explore e o caminho real de execução do Bash permanecem coerentes.

## Não objetivos

- Não expor caminho absoluto de shell no texto visível ao provider.
- Não copiar a configuração de shell global do app como setting de escopo remoto; o remoto só lê uma vez, sob demanda, pelo Host compartilhado de referência.
- Não fazer a Bash tool falhar com spawn error por causa de falha na resolução automática; uma falha de resolução continua pelo fallback genérico de shell original.