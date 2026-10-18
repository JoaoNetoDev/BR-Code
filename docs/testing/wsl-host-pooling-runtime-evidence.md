# Evidências de validação em runtime do WSL Host Pooling

## Escopo da validação

- Data: 2026-07-20 (Asia/Shanghai)
- Branch: `fix/wsl-remote-process-cleanup`
- Commit testado: `8a9f553abfcdc53ddb514fce372b118428a2a84b`
- Plataforma: Windows + WSL2 `Ubuntu`, usuário Linux `dev`
- Versão do App: `3.4.0`
- Electron: `41.0.3`
- Recursos de remote: CDN da intranet `http://intranet.example.invalid:12345/zcode/@electron/release/v3.4.0/`
- Variáveis de inicialização: `ZCODE_DEV_REMOTE_ASSET_USE_CDN=1`, com
  `ZCODE_REMOTE_ASSET_CDN_BASE_URL` apontando para a raiz intranet acima.

Esta validação usou o `packages/desktop/out` reconstruído a partir do branch atual, e os parâmetros do Chromium do renderer incluem
`--app-path="E:\GitProject\z-code\z-code\packages\desktop"`. Não foi usada a versão antiga instalada do ZCode.

## Validação automatizada

Chamada direta ao binário local do repositório, evitando que o wrapper do pnpm dispare install no ambiente offline:

```text
vitest desktop affected: 6 files, 54 tests passed
vitest server affected: 5 files, 46 tests passed
vitest services affected: 1 file, 79 tests passed
vitest shared validation: 1 file, 25 tests passed
tsc -b ...: exit 0
oxlint: 0 errors, 52 existing warnings
```

A cobertura incluiu liberação durante o estabelecimento da conexão, fase de shutdown do Host, pool em nível de janela, fake timer de 60 segundos, bloqueio de liberação por task em execução, owner de attachment mobile, Docker dedicated, cache de discovery do WSL, instalador de asset remote, backend WSL e ciclo de vida de stdio.

## Forma de execução

O desktop foi iniciado a partir do branch atual e o preload bridge foi chamado via CDP, na porta fixa `9229` do modo de desenvolvimento:

```js
window.zcode.connectRemote(
  { kind: "wsl", distro: "Ubuntu" },
  requestId,
  { workspacePath, workspaceIdentity },
);
```

A amostragem de processos usou:

```powershell
Get-CimInstance Win32_Process
wsl.exe -d Ubuntu -- bash -lc "ps -eo pid,ppid,rss,lstart,args"
```

## Resultados compartilhados

### Um workspace

A primeira conexão teve sucesso, com logical session
`80b8b530-d2ca-447a-9966-9d3472f76dae`:

| Camada | PID | RSS | Hora de início | Observação |
| --- | ---: | ---: | --- | --- |
| Windows remote UtilityProcess Host | 24868 | não coletado separadamente | 17:26:13 | criação do primeiro WSL workspace |
| WSL `zcode-server` | 1083 | 192188 KiB | 17:26:24 | server único |

### Dois workspaces

A segunda logical session foi `ba41c70a-8a04-46dc-a193-aeaa9062d8f0`. Após a conexão, o Host remote do Windows continuou com PID `24868`, o `zcode-server` do WSL continuou com PID `1083` e a contagem de servers permaneceu em `1`.

### Cinco workspaces concorrentes

Após limpar a rodada anterior, o App foi reiniciado e cinco conexões concorrentes foram executadas com o mesmo distro/usuário e diferentes workspace identity:

```text
elapsedMs=9985
success=5/5
remoteSessionId:
  6de57d48-38ea-4c13-b1cc-2ec5c8d0b180
  9987c0cf-6aa2-4462-9fa0-a66cd96a5616
  e386ab31-8ca7-4db7-ab05-693e42ea9bde
  60557e34-c818-4d4c-943b-a324b4a0d83a
  0e03e8c0-213f-4966-a119-0a4ebfcf6808
```

| Camada | PID | PPID | RSS | Contagem |
| --- | ---: | ---: | ---: | ---: |
| Windows remote UtilityProcess Host | 24708 | 3596 | não coletado separadamente | 1 |
| Windows `wsl.exe` launcher | 26684 | 24708 | não coletado separadamente | 1 cadeia de launcher |
| WSL `zcode-server` | 1106 | 1105 | 198232 KiB | 1 |

Após liberar as logical sessions 4 e 5 e manter três workspaces, o PID do Host continuou `24708`, o PID do server continuou `1106` e a contagem de servers continuou em `1`; o RSS nesse momento era `167216 KiB`.

Conclusão: 1, 3 e 5 logical workspaces na mesma janela, mesmo distro e mesmo usuário reutilizam um conjunto de Host do Windows e um `zcode-server` do WSL. Os attaches seguintes não criaram novos servers.

## Tempo de recolhimento

### Detach de um único workspace

Após fechar a primeira logical session, a segunda session continuava sendo owner: o PID do Host `24868` e o PID do server `1083` foram mantidos, sem matar por engano a conexão compartilhada.

### Último owner e TTL de idle

Ao fechar a última logical session:

```text
T+2s: Host PID 24868 present; server PID 1083 present
cerca de 60s depois: Host PID 24868 absent; zcode-server-count=0
```

Como a amostragem de comandos e a própria inicialização do WSL têm alguns segundos de custo de agendamento, o runtime registra apenas "cerca do limite de 60 segundos"; o `60_000ms` exato é verificado pela asserção de fake timer em `remoteWslHostPool.test.ts`.

### Saída do App sobrepõe o TTL

Após reconectar um workspace:

| Recurso | PID antes da saída | Cerca de 4,0s após o fechamento normal |
| --- | ---: | --- |
| Windows remote Host | 25468 | inexistente |
| WSL `zcode-server` | 1122 | contagem 0 |

Após a janela principal chamar `CloseMainWindow()`, o main process saiu em `741ms`; do início do fechamento até a verificação final de PID foram `4024ms`. Repetindo o fechamento ainda com três workspace owners na segunda rodada, o main saiu em `396ms` e, na verificação em `3641ms`, o PID do Host `24708` e o PID do server `1106` também já haviam desaparecido.

Conclusão: fechar realmente o App inteiro dispensa o TTL de idle de 60 segundos e entra imediatamente na coleta limitada.

## Não coberto e limites

- Nesta rodada nenhuma task real foi iniciada, portanto não houve PID de workspace Agent/MCP; o draining de running-task é verificado por testes unitários.
- Não foi executada uma instalação de update real; apenas o caminho do app/window shutdown manager compartilhado com o update e o runtime de saída do App foram verificados.
- Não foi executada uma conexão real de aparelho mobile replayable; o limite de owner de attachment mobile é coberto pelos testes do desktop manager.
- O Docker não entrou nesta medição prática de PID do WSL; o código e os testes confirmam que ele continua passando por `InitRemoteWorkspace` dedicated, e esta mudança não adicionou pool compartilhado para o Docker.
- Não são chamadas `wsl --terminate` nem `wsl --shutdown`; após a validação a distro pode continuar em execução, e apenas o server pertencente ao ZCode é recolhido.