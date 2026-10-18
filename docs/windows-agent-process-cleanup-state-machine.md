# Máquina de estados de limpeza da árvore de processos do Agent no Windows

## Contexto

O Host de desktop inicia o Agent CLI para cada workspace. Ao fechar um workspace, reiniciar o
runtime, rotacionar as credenciais do Computer Use Helper e sair do App, é obrigatório recolher o
processo raiz do Agent e os descendentes de runtime/MCP que ele derivou. O Windows não usa
process group POSIX; em vez disso, a árvore de processos é fechada por meio de `taskkill /T` e de
`taskkill /T /F` após revalidação de identidade.

O caminho de espera existente é o seguinte, e é proibido adicionar um segundo conjunto de semântica
de espera:

```text
ZCodeAgentProcessManager
  -> ZCodeProtocolClient.disposeAndWait
  -> ZCodeStdioTransport.disposeAndWait
  -> terminateProcessTreeAndWait
  -> waitForProcessTreeTermination
```

O `terminateProcessTree` não-bloqueante continua sendo usado para dispose best-effort; as chamadas
bloqueantes precisam obter e observar o voo do taskkill dentro do mesmo caminho.

## Defeitos confirmados

Os logs de runtime confirmaram três corridas que se sobrepõem:

1. A coleta bloqueante inicia o `taskkill /T` gracioso sem expor seu voo, de modo que o waiter não
   consegue observar a conclusão do comando;
2. quando o `taskkill /F` já teve sucesso e o PID do SO já desapareceu, o
   `ChildProcess.exit` do Node pode ser entregue com 1-10 ms de atraso; depois que o waiter retorna
   com sucesso, o transport usa o `exitCode` atrasado para anexar de volta o PID raiz ao resultado
   de residuais;
3. a consulta à tabela de processos compartilhada por múltiplos workspaces pode começar antes do
   spawn de um novo Agent. Se o cleanup da nova raiz reutilizar essa tabela antiga, ela não encontra
   a si mesma, falha corretamente de forma fechada e, por isso mesmo, não consegue enviar o taskkill.

Todos os três são erros de implementação da máquina de estados de limpeza, não lógica de
atualização automática do app nem o usuário ainda executando o ZCode.

## Invariantes de segurança

1. Um PID representa apenas um número, não propriedade; antes de um kill forçado é obrigatório
   casar a identidade de criação do processo, ou provar propriedade por meio de um handle de root
   vivo e gerenciado pelo Host que detenha o `ChildProcess`. A exceção de handle vale apenas para
   a raiz, nunca para descendentes.
2. Quando a consulta de identidade falha ou expira, descendentes não revalidados e
   `unverifiedRootOnly` devem falhar de forma fechada; é proibido enviar `/F` para um PID cru. Uma
   raiz gerenciada que não entrou em `unverifiedRootOnly` e cujo handle ainda confirma vida não é um
   PID cru.
3. O snapshot da árvore de processos em vida continua sendo a única base para reivindicar
   descendentes depois que a raiz sai.
4. A coleta não bloqueante não pode bloquear o event loop do Host.
5. A coleta de múltiplos workspaces deve ocorrer em paralelo; é proibido voltar a uma execução
   síncrona ou a taskkill serial por workspace.
6. Somente PIDs que, após o deadline absoluto, ainda pertencem à árvore original são residuais
   confirmados.
7. Resíduos confirmados devem continuar sendo reportados ao chamador; é proibido engolir falhas
   reais de limpeza.

## Máquina de estados

```text
running
  -> snapshot-query
       |-> query-started-after-root -> verified snapshot
       `-> query-started-before-root -> start fresh query
  -> stdin-eof-requested
  -> graceful-taskkill-in-flight
       |-> os-tree-exited -> wait-child-exit-event ----------> success
       `-> force-deadline
            -> verify-current-identities-in-parallel
                 |-> verified root/descendant -> force-taskkill-in-flight
                 |-> managed root handle live -> root-only force-taskkill-in-flight
                 `-> unverified descendant/root-only -> skip-that-pid-and-observe
                                      |
                                      |-> child-exited ------> success
                                      `-> cleanup-deadline --> confirmed-residual
```

`graceful-taskkill-in-flight`, o voo forçado e o `exit` do ChildProcess devem ser observados em
paralelo. O retorno do comando taskkill não significa que o Node já entregou o evento exit; da
mesma forma, a saída da raiz não significa que todos os descendentes do snapshot já saíram.

## Contrato de deadline

A coleta bloqueante no Windows usa dois limites superiores e toma o mais cedo:

1. o transport fixa, no ponto de início do cleanup de `disposeAndWait`, um deadline absoluto de
   ponta a ponta, cobrindo o snapshot da tabela de processos, o EOF de stdin, o taskkill e a
   observação de exit;
2. o waiter ainda calcula o deadline relativo desta fase a partir do estado de propriedade já
   fixado, evitando esperas inúteis quando não há alvo de sinal.

```text
transportDeadlineAt = cleanupStartedAt
  + forceBudgetMs
  + windowsTaskkillTimeoutMs
  + boundedExitObservationGraceMs

waiterDeadlineAt = waiterStartedAt
  + remainingForceAfterMs
  + ownedTargetTaskkillBudgetMs
  + boundedExitObservationGraceMs

effectiveDeadlineAt = min(transportDeadlineAt, waiterDeadlineAt)
```

O orçamento de taskkill do waiter é distribuído conforme o estado de propriedade já fixado:

```text
                         +---------------------------+
                         | 至少一个已验证信号目标？  |
                         +-------------+-------------+
                                       |
                 +---------------------+---------------------+
                 | yes                                       | no
                 v                                           v
waiterDeadline = waiterStartedAt                waiterDeadline = waiterStartedAt
  + forceAfterMs                                  + forceAfterMs
  + windowsTaskkillTimeoutMs                      + boundedExitObservationGraceMs
  + boundedExitObservationGraceMs
```

- `forceAfterMs` tem padrão de 2.000 ms.
- O limite padrão por taskkill na camada de processo é de 2.000 ms; o caminho bloqueante do transport
  do ZCode usa explicitamente 1.000 ms.
- O taskkill gracioso corre em paralelo com o timer de force desde o início da espera; não se adds
  um timeout separado para cada um dos comandos gracioso e forçado; o deadline reserva apenas uma
  cota final de taskkill depois da margem de force.
- Quando a consulta de identidade está indisponível e não há nenhuma identidade verificada, o
  conjunto de alvos do gracioso e do forçado será necessariamente vazio; nesse caso não se reserva
  timeout de taskkill sem comando correspondente, apenas a margem de force e a tolerância de
  observação de exit.
- Enquanto existir qualquer alvo verificado, o deadline relativo do waiter reserva o orçamento
  completo de taskkill. É proibido encurtar o limite temporariamente conforme uma Promise estar ou
  não settled em determinado instante; mas o deadline absoluto de ponta a ponta do transport
  continua sendo um teto rígido, e o tempo consumido por um snapshot lento não pode ser
  reabastecido.
- `boundedExitObservationGraceMs` serve apenas para absorver a diferença de entrega entre o callback
  do taskkill e o evento exit do ChildProcess; não pode se transformar em sleep incondicional.
- A revalidação de identidade continua coberta pelo orçamento de force; não é um período serial
  adicional.
- Antes do force é obrigatório revalidar em paralelo e de forma direcionada, dentro da mesma janela
  limitada, a raiz e cada descendente da propriedade inicial; apenas identidades cujo CreationDate
  ainda corresponde entram no conjunto genérico de alvos `/F`. A única exceção é a raiz que não
  entrou em `unverifiedRootOnly` e cujo `ChildProcess` gerenciado original ainda satisfaz
  `exitCode/signalCode` ambos `null`, com handle capaz de enviar sinal e PID confirmado vivo:
  enquanto a revalidação direcionada não terminar, é permitido executar `/T /F` nessa raiz, mas não
  é permitido redescobrir ou reivindicar descendentes ao longo desse PID. A falha de revalidação
  de um único descendente apenas pula aquele PID e não deve impedir o fechamento dos demais alvos
  verificados.
- Múltiplos workspaces compartilham o mesmo deadline relativo e fecham em paralelo; o tempo total
  de espera não pode crescer com a quantidade de workspaces.
- O transport fixa, no ponto de início do cleanup, o deadline
  `cleanupStartedAt + 2.000 + 1.000 + 250 = 3.250 ms` e o repassa ao waiter. Mesmo que o snapshot
  CIM e o EOF já tenham consumido a janela de force, o waiter só pode usar o tempo restante dessa
  deadline, de modo que o teto rígido de ponta a ponta continua sendo 3.250 ms, abaixo da fase
  service-dispose de 3.500 ms do desktop Host e do ciclo de vida stdio do server.

## Limites de testabilidade

O runner de taskkill do Windows é uma dependência da camada de processo, e a implementação padrão
continua usando `execFile` assíncrono. Os testes podem injetar um runner para controlar a ordem
started, completed, failed e de travamento, mas a injeção não pode contornar a validação de
identidade de PID em produção.

É obrigatório cobrir:

- não reportar residuais antes de o taskkill gracioso terminar;
- exit chegando 1-10 ms depois ainda resulta em sucesso;
- uma nova raiz não reutiliza a tabela de processos compartilhada que começou antes do próprio
  spawn;
- em caso de reutilização de PID ou falha na consulta de identidade, não enviar `/F` para
  descendentes não revalidados nem para `unverifiedRootOnly`; a exceção do handle de root vivo
  gerenciado só pode enviar `/T /F` da raiz, sem trazer descendentes para o conjunto explícito de
  alvos `/F`;
- quando a revalidação direcionada via CIM falha, o handle de root vivo gerenciado ainda dispara o
  `/F` apenas da raiz, e os descendentes não revalidados são pulados;
- quando o voo gracioso trava, o force envia `/F` separadamente para a raiz e os descendentes que
  ainda correspondem, e pula os descendentes já reutilizados;
- retornar os PIDs restantes quando o deadline chega e os PIDs de identidade original ainda estão
  vivos;
- quando o snapshot CIM leva mais tempo que a janela de force, o taskkill/observação de exit não
  pode redefinir o deadline de ponta a ponta para trás;
- taskkill concorrente em múltiplos workspaces;
- restart de workspace, saída do App e rotação de credenciais do CUA Helper reutilizam a mesma
  máquina de estados.

## Diagnóstico

Logs de limpeza de baixa frequência devem registrar taskkill started/completed/failed, o resultado
da verificação de identidade, motivos de skip de force, a observação de exit, o deadline e os PIDs
restantes. Os logs não podem conter prompt, token ou conteúdo do usuário.

## Registro de verificação de 2026-08-24

- `zcodeAgentProcessManager.test.ts` passou 10 rodadas consecutivas com permissões reais: 360/360;
- conjuntos de testes do process terminator, do stdio transport e do manager: 55 passed / 11
  skipped;
- casos determinísticos cobrem voo de taskkill, atraso de exit, deadline acumulado, reutilização de
  PID, falha na consulta de identidade e frescor da tabela de processos compartilhada; nela, o ramo
  unverified sem alvo de sinal não reserva timeout de taskkill, e o ramo unverified com descendentes
  verificados mantém o timeout completo;
- após 10 rodadas consecutivas não foram encontrados órfãos de Node Agent de teste; os diretórios
  temporários gerados nesta rodada puderam ser removidos após a saída dos processos;
- `pnpm typecheck` e `pnpm lint` passaram; o lint mantém 110 warnings preexistentes sem relação com
  esta mudança;
- sandboxes restritos sem permissão de leitura de `Win32_Process` entram em unverified fail-closed
  por desenho seguro; a regressão de árvore de processos em Windows real precisa rodar em um
  ambiente de teste com permissão de leitura via CIM.

## Registro de verificação de coleta de descendentes após force em 2026-08-25

- a revalidação direcionada de identidade e a ordem de force da raiz e dos descendentes passaram 10
  rodadas consecutivas: 160/160;
- com permissões reais do Windows, os conjuntos de testes de limpeza do process terminator, do
  stdio transport e do Agent manager: 59 passed / 11 skipped;
- os casos de reutilização de PID de descendentes confirmam: identidades sem correspondência não
  recebem `/F`, outros alvos correspondentes ainda podem ser fechados em paralelo, e identidades
  antigas não confirmadas continuam sendo reportadas por fail-closed em vez de serem julgadas
  incorretamente como sucesso.