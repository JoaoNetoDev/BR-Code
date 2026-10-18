# ZCode CLI Especificação de Encerramento Limitado

> Status: accepted, 2026-07-22.

O ciclo de vida do CLI de protocolo é definido pela [Agent Server spec](../apps/zcode-cli/docs/design/v2/zcode-protocol-agent-server.md#协议进程生命周期):
seu deadline começa no primeiro EOF/sinal/erro fatal, cobrindo a inicialização e as requisições em
voo; não depende do retorno de `run()` para iniciar o watchdog. As regras já existentes para o
comando único e o plugin-host permanecem inalteradas abaixo.

## Feature/change summary

| Campo               | Decisão                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change              | Corrige o problema de o CLI de comando único ficar permanentemente vivo por causa de pipes herdados, `close` de Browser pendente ou outros handles de adapter após a conclusão do modelo |
| Entradas visíveis ao usuário | `zcode --prompt`, `--target` e saída da TUI; Desktop/remote host reusa as mesmas invariantes de limpeza de sessão |
| Owner do estado    | O Execution adapter detém o grupo de processos do comando e o stdio; o managed CDP adapter detém o Chromium; o session facade orquestra o teardown; a entry do CLI só detém a fronteira final de saída |
| Critério de sucesso | Limpeza normal tem prioridade; quando qualquer close externo nunca faz settle, o ZCode CLI ainda termina dentro de um teto fixo, sem esperar processos órfãos morrerem naturalmente |
| Out of scope       | Garantia multiplataforma pura de Node para matar qualquer processo de terceiros que já tenha feito `setsid`/daemonize e se desvinculado do grupo de processos original; alterar a semântica de desktop continuous / mobile replayable |

## Clarification log

| Pergunta                                        | Entrada do usuário / evidência de campo                                                                                       | Fronteira fixada                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Basta corrigir apenas o pipe herdado            | Ainda reproduz mesmo depois de empacotar `fix(cli): clean up inherited subprocess pipes` isoladamente                       | O encerramento deve cobrir execution, browser, MCP e a entry do CLI; não tratar a correção de pipe como teardown global     |
| `process.exit()` direto como correção principal? | O log de teardown pode completar, mas o event loop do Node ainda pode ser mantido vivo por handle desconhecido            | Fazer primeiro a limpeza limitada de todos os recursos conhecidos; só o watchdog força a saída quando `run()` já retornou e o event loop continua vivo |
| O retorno de `run()` sempre significa que o processo deve sair? | Após o `server.connect()` do MCP de `__zcode-plugin-host`, `main()` retorna, mas o serviço stdio deve continuar rodando | O watchdog pertence apenas ao CLI de comando único; o plugin-host tem seu ciclo de vida mantido pelo MCP stdio/pai, não entra na política de saída única |
| É necessário matar qualquer daemon               | Após nova sessão POSIX / reparent no Windows, o PID pai ou o PGID original não bastam mais para endereçar                  | Matar descendentes do mesmo grupo como melhor esforço; ao perder ownership, destruir o pipe local e garantir a saída do CLI; containment absoluto em nível de OS é outra capacidade |

## Boundary decisions

| Limite                       | Decisão                                                                                                          | Comportamento proibido                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `exit` do shell root         | Representa apenas o fim dos processos filhos diretos, não a conclusão do pipe/descendentes do execution             | Não remover do active ownership o background execution enquanto o pipe não deu EOF     |
| Drain de pipe em foreground  | Aguardar no máximo um drain limitado; depois limpar o grupo de processos e destruir o fluxo de leitura local        | Não bloquear o prompt com `await closePromise` sem limite                              |
| Fechamento de sessão de background | Continuar enviando TERM/KILL ao grupo de processos original mesmo que o líder do grupo já tenha saído; por fim destruir o pipe | Não pular o cancel por causa de `exited === true`                                   |
| Runtime admission            | O primeiro passo do teardown fecha a admission de notificações de background/wake de modelo                         | Não deixar o evento terminal do cancel do execution abrir um novo turno de modelo durante o fechamento do banco |
| Resource teardown            | Browser session, Execution, MCP e o broker do Node REPL são tolerantes a falhas e têm deadline; uma falha não pode pular os outros | Não parar para sempre em um `await` serial de um close que nunca faz settle           |
| Managed Chromium             | context, browser e late launch todos usam close limitado; o CLI adapter ainda responde pela recuperação best-effort           | Não bloquear a limpeza do execution por `context.close()` ou `browser.close()` pendente |
| CLI entry                    | Após o retorno de `run()` do comando único, define um watchdog unref; se o event loop se esgotar naturalmente não dispara, caso contrário força a saída preservando o exit code existente | Não chamar `process.exit()` antes de a resposta do modelo/a saída stdio terminarem |
| plugin-host entry            | Após iniciar com sucesso o MCP server, `__zcode-plugin-host` deixa o stdio/processo pai decidir a sobrevivência e o fechamento, sem registrar watchdog de CLI único; falha na inicialização ainda tem força de saída limitada | Não tratar handles stdio válidos do MCP server como vazamento nem deixar handles residuais de plugin com falha manterem o processo vivo para sempre |

## Domain scope and high-risk cross-products

O domínio principal é architecture/process boundary, background Bash lifecycle, managed Browser lifecycle e CLI release.

| Cross-product                                           | Risco                                                                    | Tratamento                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| background Bash × root exited × inherited stdout/stderr | O evento `close` depende do EOF do processo neto, mantendo o CLI vivo para sempre | accepted: manter ownership, matar o grupo, destruir o fluxo        |
| detached descendant × lost PGID                         | Serviço de terceiros ainda vivo e o pipe original não dá EOF            | accepted: liberação local + watchdog do CLI; a reciclagem do processo só promete best-effort |
| BrowserContext close × página WS/SSE                    | O close do Playwright pode nunca resolver                               | accepted: deadline por operação, continuando a limpeza de execution/MCP |
| prompt normal × handle ativo desconhecido                | Todo teardown conhecido terminou mas o event loop não está vazio        | accepted: watchdog na entry                                            |
| plugin-host × handle ativo de MCP stdio                 | Após o retorno de `server.connect()` o handle stdio é condição de sobrevivência do serviço, não um vazamento de comando único | accepted: pular o watchdog de saída do CLI; sair naturalmente quando o pai fecha o stdin |
| entrega desktop/mobile/remote × cleanup                  | Confundir o cleanup do host com uma regra de replay de conversa          | pruned: não alterar protocol, snapshot, queue, clientMode ou deliveryKind |

## State sequence

```text
model terminal
  -> runtime.beginShutdown()          # 封住新 notification/model wake
  -> [browser session | execution | MCP | REPL broker] bounded cleanup
       | timeout/error on one stage
       +---------------------------------> other stages still run
  -> session store close
  -> CLI-owned browser runtime bounded close
  -> run() returns exitCode
  -> process role
       | one-shot CLI  -> unref exit watchdog
       |                  | event loop empty -> natural exit
       |                  + handles remain   -> process.exit(existing exitCode)
       + plugin-host   -> MCP stdio owns lifetime -> parent closes stdin / signal exits
```

## Candidate combinations and pruning

| Case       | Setup / ação                                                                    | Asserções                                                                                     | Classificação / evidência                                            |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| CLI-SD-001 | wrapper em foreground sai, processo neto herda o pipe                        | Após drain limitado o grupo de processos netos é limpo; fluxo destruído; resultado recolhido     | accepted; integração com processos reais                           |
| CLI-SD-002 | wrapper em background sai, processo neto herda o pipe, depois session close    | Antes do close a task segue running; depois do close cancelled/killed, o CLI não fica vivo pelo pipe | accepted; integração com processos reais                          |
| CLI-SD-003 | O processo neto cria outra sessão/grupo de processos e continua segurando o pipe | O pipe local é por fim destruído, o close tem teto; não se afirma que processos escapados sejam obrigatoriamente mortos | accepted; integração com processos reais + fixture de limpeza no finally |
| CLI-SD-004 | `close()` do BrowserContext nunca faz settle                                  | O close do Browser ainda é tentado; a limpeza de Execution/MCP ainda é executada                | accepted; teste focado de adapter/session                          |
| CLI-SD-005 | `browser.close()` ou `close()` do app nunca faz settle                        | A limpeza de prompt/TUI retorna; o watchdog da entry força a saída usando o exit code original | accepted; teste focado de CLI                                       |
| CLI-SD-006 | Todos os closes normais, event loop se esgota naturalmente                    | O watchdog é unref, não atrasa artificialmente a saída normal                                 | accepted; teste focado de CLI                                       |
| CLI-SD-007 | Árvore de processos no Windows                                              | `taskkill /T /F` best-effort, fallback de pipe e watchdog idênticos                            | accepted pairwise; o macOS atual não permite validar taskkill em máquina real |
| CLI-SD-008 | Todas as permutações de mobile replayable / remote identity                  | O cleanup não lê nem altera o estado de delivery/workspace                                     | pruned; invariante do lado do host                                  |
| CLI-SD-009 | O `main()` do plugin-host retorna após o connect do MCP, o pai mantém stdin aberto | Após passar o deadline do watchdog único o host continua vivo; o pai fecha stdin e ele sai normalmente | accepted; integração com subprocesso CLI real + smoke do SEA   |
| CLI-SD-010 | A inicialização do plugin-hold ocupa stdin e então lança erro                 | Preserva o exit code de falha, e o watchdog força a saída de forma limitada                     | accepted; integração com subprocesso CLI real                    |

## Coverage matrix / E2E handoff

- conversation background catalog: `BG40`, cobertura focada de adapter/runtime, sem novo GUI E2E.
- Browser Use matrix: `BCP-212` / `HCDP-013`, cobrindo close pendente e o cleanup subsequente.
- A camada CLI se apoia principalmente em integração com subprocessos reais e testes focados de Node; o plugin-host precisa cobrir "permanece vivo mantendo stdin além do deadline do watchdog, sai ao fechar stdin"; E2E de GUI não pode ser mais forte que a evidência de PID/pipe handle.
- Linux/Windows aguardam no CI o process-tree em máquina real; o macOS local valida POSIX PGID, escape detached e a saída final limitada.
