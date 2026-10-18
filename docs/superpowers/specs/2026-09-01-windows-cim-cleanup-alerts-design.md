# Design de Limpeza de Processos via CIM no Windows e Redução de Alertas

## Objetivo

Em ambientes Windows 10 e superiores, remover o backend de consulta de processos via WMIC, usar uniformemente o PowerShell `Get-CimInstance Win32_Process` e convergir os alertas de erro da limpeza de processos do Agent para a falha final de retry, reduzindo os falsos alarmes de `runtime process tree cleanup incomplete`, mantendo a proteção contra reuso de PID e a fronteira de segurança fail-closed.

## Não objetivos

- Não alterar o protocolo de inicialização do Helper em duas fases, `transport_ready` / `functional_ready`.
- Não é permitido chamar `taskkill /PID /T /F` apenas com um PID nu; o handle `ChildProcess` root mantido e confirmado como vivo pelo Host continua sendo evidência de propriedade independente e não é tratado como PID nu.
- Não introduzir Windows Job Object; essa solução será desenhada à parte.
- Não ampliar o deadline de limpeza de processos no Windows.

## Design

### CIM capability

O ciclo de vida do Local Host mantém o estado de capacidade de PowerShell/CIM. A primeira consulta CIM completa já realiza a confirmação real de capacidade e armazena em cache o resultado, sem iniciar um processo de sondagem adicional; a detecção de capacidade deve verificar a chamada real de `powershell.exe` e de `Get-CimInstance Win32_Process`, e não apenas a existência do executável.

O estado de capacidade distingue pelo menos:

- `cim`: o Host atual consegue executar consultas CIM.
- `identity-unavailable`: o PowerShell não existe, está bloqueado por política ou indisponível nesta rodada de consulta.

Falhas graves podem ser armazenadas em cache durante o ciclo de vida do Host; um timeout isolado não deve contaminar permanentemente as limpezas seguintes, e ainda é preciso permitir nova tentativa na próxima rodada.

### Process snapshot and force verification

No início da limpeza do Agent é executada uma consulta CIM completa assíncrona, com índice por PID, guardando `pid`, `parentPid` e o `CreationDate` normalizado. Os descendentes são deduzidos apenas a partir deste snapshot e do ciclo de vida das roots gerenciadas.

Após a espera pela saída graciosa, a fase de força ainda precisa fazer uma reverificação de identidade CIM direcionada para as roots/descendentes conhecidos do snapshot. Um descendente só pode executar `taskkill /PID /T /F` quando PID e CreationDate corresponderem simultaneamente; em caso de falha de consulta, timeout ou divergência de identidade, continua-se fail-closed. A root tem uma exceção restrita: se a limpeza não entrou em `unverifiedRootOnly` e o `ChildProcess` original mantido pelo Host ainda satisfaz `exitCode/signalCode` ambos `null`, o handle pode enviar sinais e o PID é confirmado vivo, pode-se executar apenas para essa root o fallback gracioso `/T` ou `/T /F` dentro do deadline. Essa exceção não permite redescobrir ou reivindicar descendentes a partir do PID da root, nem adicionar descendentes não reverificados aos alvos de `/F`.

```text
Host init
  -> CIM capability (cached)
  -> cim / identity-unavailable

Agent spawn
  -> one full CIM snapshot
  -> PID index + parent links + CreationDate

cleanup
  -> EOF + graceful taskkill
  -> targeted CIM identity recheck
  -> exact match: taskkill /PID /T /F
  -> managed root handle still live: root-only /T /F fallback
  -> unavailable/mismatch descendant: no bare PID force, observe deadline
  -> unverifiedRootOnly: no handle fallback, observe deadline
```

### Alert policy

A primeira falha de `cleanupManagedProcessWithRetry` registra apenas um `warn` recuperável e preserva o erro original; quando o retry tem sucesso, a limpeza final é considerada bem-sucedida e não gera alerta de error. Somente quando o retry também falha é registrado um `error` final único, preservando o erro final como valor de retorno.

## Critérios de aceitação

1. O código e os testes não iniciam mais `wmic.exe`.
2. A ausência de WMIC não gera mais o warning `wmic.exe ENOENT`.
3. Com PowerShell/CIM disponível, o snapshot completo, a reverificação de identidade direcionada e o comportamento de força permanecem corretos.
4. Os caminhos `identityVerification: "unavailable"` / `unverifiedRootOnly` continuam fail-closed e não enviam `/F` com PID nu; a exceção do handle de root gerenciado e viva só pode atuar sobre a root, sem se propagar para descendentes não reverificados.
5. Quando a primeira falha da limpeza é seguida de retry bem-sucedido, não há error final; duas falhas produzem apenas um error final.
6. Os testes unitários relevantes de Windows e do Agent process manager passam.
7. Os testes de regressão cobrem o fallback root-only `/F` gerenciado quando a reverificação CIM direcionada falha, e a ausência de qualquer root `/F` sob `unverifiedRootOnly`.