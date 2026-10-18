# Parada da árvore de processos POSIX em Background Task

## Estado

- Data: 2026-08-14
- Estado: accepted
- Tipo: bugfix

## Problema

`NodeExecutionAdapter` inicia a execution no POSIX com `detached: true`. A lógica antiga de parada enviava `SIGTERM` apenas para o grupo de processos correspondente a `-rootPid` e, após 750ms, `SIGKILL` para o mesmo grupo de processos.

Bash job control, pipeline, `xargs -P` ou PTY podem fazer com que processos que ainda pertencem à árvore de descendentes do PPID raiz entrem em um PGID diferente. Ao enviar sinais apenas para o grupo de processos raiz, esses descendentes não param junto com `TaskStop` ou com o fechamento da sessão.

## Contrato de comportamento

Esta mudança implementa apenas a parada da árvore de processos POSIX do Bash, sem alterar Windows, o protocolo TaskStop, a UI, a notificação de background, o desktop continuous nem o comportamento de web remote replayable.

```text
cancel / close
      |
      +--> leitura assíncrona única de `ps -A -o pid= -o ppid=` (espera máxima de 500ms)
      |          |
      |          +--> SIGTERM no grupo de processos raiz; em caso de falha, degrada para o root PID
      |          +--> SIGTERM nos descendentes transitivos de PPID presentes neste snapshot
      |
      +--> espera fixa de 1500ms
                 |
                 +--> SIGKILL no grupo de processos raiz (best effort)
                 +--> nova leitura de `ps`, depois SIGKILL nos descendentes transitivos que ainda estiverem sob o root
```

Requisitos obrigatórios:

1. Cada sinal para a árvore de processos calcula primeiro os descendentes transitivos de PPID usando um snapshot de `ps` independente, com espera máxima de 500ms.
2. Sempre primeiro se envia o sinal ao grupo de processos raiz; quando o sinal de grupo falha, há fallback para o root PID; em seguida o mesmo sinal é enviado individualmente aos descendentes do snapshot.
3. O primeiro `SIGTERM` não bloqueia o ACK de parada; após 1500ms a escalação para `SIGKILL` é executada incondicionalmente, sem polling antecipado de saída.
4. A escalação usa um novo snapshot de PPID, não memoriza os descendentes da primeira rodada, não lê tempo de início e não acrescenta verificação de identidade de PID.
5. Se o `ps` falhar ao iniciar, der erro ou exceder o tempo limite, o conjunto de descendentes é tratado como vazio, e o grupo de processos raiz / fallback do root PID continua.
6. Uma execution individual e o ACK de parada não aguardam explicitamente a Promise de escalação; o shutdown do adapter aguarda o timer de escalação de 1500ms já registrado e o snapshot real de PPID / envio de sinais da rodada de escalação, referenciando seu handle de limpeza para mantê-lo vivo.
   Em 2026-09-08 foi adicionado: após a escrita direta do Bash não se pode depender do pipe para manter tudo vivo, nem supor que apenas fazer await de uma Promise impede o Node de encerrar.
7. O Windows mantém o caminho existente com `taskkill /T /F`.
8. Este contrato se aplica somente à execution de Bash com `command.shellProfile === "posix-bash"`. Shell genérico, argv, hooks e expansão de comandos customizados continuam com a estratégia de parada por grupo de processos POSIX já existente: `SIGTERM` imediato no grupo de processos raiz e, após 750ms, `SIGKILL` apenas se o grupo de processos ainda estiver vivo; não é permitido enumerar descendentes de PPID nem registrar escalação de Bash para essas executions.
9. Em 2026-09-08 o contrato atual de escrita direta do Bash ficou assim: a saída natural do root já encerra a execução, sem entrar em foreground pipe drain e sem limpar ativamente os descendentes. A parada da árvore de processos do Bash só é acionada por caminhos reais de terminação, como cancelamento de task, fechamento do adapter, abort/timeout e output limit; esta correção de shutdown com keep-alive não restaura o comportamento histórico de drain.

## Limites conhecidos

Os limites abaixo são mantidos de propósito e não são reforçados nesta mudança:

- Descendentes cross-PGID que já fizeram reparent após o primeiro TERM e ignoram TERM não aparecerão no segundo snapshot de PPID e podem continuar vivos.
- Não há verificação de identidade por PID/start-time entre o snapshot e o envio de sinal PID a PID.
- Nenhum cgroup, systemd scope, Windows Job Object, ownership de processo adicional ou nova stop surface é introduzido.

## Verificação

- Teste de processos reais no POSIX: Bash de background cria via job control um worker cooperativo com PGID independente; após o stop, tanto o launcher quanto o worker encerram e o resultado é consolidado como cancelled.
- Teste de processos reais no POSIX: execution com argv genérico cria um worker com PGID independente; o cancelamento para apenas o grupo de processos original, o worker permanece vivo e é limpo pelo próprio teste, provando que a estratégia de mata-árvore do Bash não se espalhou para quem chama a ExecutionPort genérica.
- Regressão da escrita direta atual do Bash: a saída natural do root já encerra a execução, os descendentes ainda podem gravar arquivos e o teste é responsável pelo cleanup; não se exige mais o histórico de foreground Bash pipe drain. O pipe drain e a estratégia de parada do argv/Hook genéricos continuam mantidos.
- Regressão em processo Node separado: após abort, close, Stop de background, timeout e output limit, a chamada de adapter close deve terminar o worker do mesmo grupo que ignora TERM, e o close deve ter sido concluído antes da saída do Node, sem depender do IPC do framework de testes para keep-alive.
- Regressão com relógio controlado: após o timer de 1500ms expirar, o shutdown ainda precisa aguardar a consulta assíncrona de SIGKILL e o envio dos sinais.
- Os testes existentes de descendentes do mesmo grupo, pipe herdado / foreground drain de executions genéricas, adapter close e tree-kill no Windows continuam mantidos.
- `pnpm typecheck` e `pnpm lint` devem passar.