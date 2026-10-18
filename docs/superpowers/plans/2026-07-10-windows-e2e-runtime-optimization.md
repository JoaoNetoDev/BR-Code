# Plano de Implementação da Otimização do Runtime de E2E no Windows

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** reduzir o `pnpm test:e2e` no Windows, hoje com mais de 60 minutos e facilmente truncado pelo timeout externo, para menos de 40 minutos em serial e menos de 25 minutos com dois shards, preservando ao mesmo tempo o isolamento de estado entre specs e a cobertura dos limites de tempo críticos.

**Arquitetura:** primeiro fazer o reporter registrar diretamente as fases do ciclo de vida do WDIO e então provar com A/B e corrigir a longa cauda de saída da session; em seguida comprimir os atrasos de replay não necessários e, depois que a lógica de limpeza tiver isolamento por run, introduzir dois shards do Windows com HOME independente. A CI ganha um portão leve de saúde e um disjuntor de infraestrutura, para evitar que o mesmo erro de inicialização consuma de novo o timeout de todos os specs.

**Stack tecnológico:** WebdriverIO 9, Mocha, Electron, `wdio-electron-service`, TypeScript, Node.js, PowerShell, GitLab CI.

## Restrições Globais

- Não aumentar `ZCODE_E2E_MAX_INSTANCES` diretamente de `1`; hoje os workers compartilham `.e2e-home` e o deletam recursivamente em `beforeSession`.
- Não sacrificar a compatibilidade Windows/macOS/Linux; a otimização no Windows precisa preservar os caminhos de limpeza existentes da plataforma POSIX.
- Não reduzir as asserções de produto dos conversation cases; um case que cobre de propósito o limite de 45 segundos entra em uma slow lane explícita em vez de ser encurtado silenciosamente.
- Cada otimização roda primeiro o spec direcionado e, ao final, roda uma única vez o `pnpm test:e2e` completo, sem ciclos de full run sem evidência.
- Antes de concluir, executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint`.
- O workspace atual já tem modificações não commitadas de DeepSeek V4 e de E2E de edit; na implementação, commitar apenas os arquivos deste plano, sem sobrescrever nem carregar essas mudanças junto.

---

## Relatório de Análise de Tempo

### 1. Escopo dos dados

Amostra principal:

- artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260710-035131-341`
- ambiente: Windows `10.0.26100`, Node `v24.18.0`, x64, 32 GB de memória, Intel Xeon Platinum 8269CY
- configuração: `maxInstances=1`, glob full padrão
- workers: 67 specs, sendo 62 de conversation e 5 general
- resultados registrados: 111 cases, sendo 102 de conversation, 8 general e 1 container

Amostras de comparação:

- sucesso direcionado mais recente: `desktop-e2e-20260710-053440-746`
- CI Windows histórico: `C:/gitlab-runner/builds/yH1yP9nW3/1/codegeex/z-code/packages/desktop/.e2e-artifacts/ci-conversation-windows-232902-632167/ci-desktop-e2e.log`

### 2. Convenções e limitações

O `durationMs` de `test-results.ndjson` cobre apenas o corpo do teste Mocha; não cobre build, `beforeSession`, inicialização do Electron, hooks do WDIO nem a remoção da session. Por isso este relatório reconstrói o wall clock de cada spec a partir dos timestamps do `workers.ndjson` vizinho e decompõe o ciclo de vida usando o horário de início estimado do primeiro teste e o horário de término do último.

O full run mais recente não tem `summary.json`:

- início do run: `03:51:31.341Z`
- primeiro worker: `03:53:13.810Z`
- 67º worker: `04:51:18.376Z`
- única amostragem de processo do 67º worker: `04:51:23.224Z`
- o 67º worker não tem nenhum test result

A última amostragem cai exatamente no minuto 59 e 52 segundo após o início do run, e o summary está ausente. A inferência de alta confiança é que o limite externo de 60 minutos de execução truncou o último spec. Portanto o tempo completo atual só pode ser reportado como "mais de 60 minutos"; não se deve escrever 59 minutos como tempo de conclusão normal.

### 3. Baseline atual

| Métrica                          | Resultado                                  |
| -------------------------------- | ------------------------------------------: |
| Tempo completo                   | `> 60 min`, com o 67º spec truncado          |
| Preparação antes do 1º worker    | `102.5 s`                                   |
| Specs computáveis por completo  | 66                                          |
| Wall clock dos 66 specs          | `3484.4 s` / `58.07 min`                    |
| Soma dos test bodies             | `1320.1 s` / `22.00 min`                    |
| Soma das inicializações de worker| `470.0 s` / `7.83 min`                      |
| Soma dos intervalos entre testes | `5.5 s`                                      |
| Soma das saídas/troca de session de worker | `1689.1 s` / `28.15 min`     |
| raw failure                      | 4                                           |

Composição de tempo dos 66 specs completos:

| Fase                        | Tempo      | Proporção |
| --------------------------- | ---------: | --------: |
| test body                   | 22.00 min  |    37.9%  |
| inicialização de worker     |  7.83 min  |    13.5%  |
| intervalos entre testes    |  0.09 min  |     0.2%  |
| saída/troca de session de worker | 28.15 min |    48.5%  |

Conclusão-chave: a saída/troca de session custa 6.15 minutos a mais do que todas as asserções de teste juntas e é a primeira causa; praticamente não há ociosidade entre os testes.

### 4. Quantis

| Dimensão         |    P50 |    P90 |    P95 |      Max |
| ---------------- | -----: | -----: | -----: | -------: |
| test body do case| 10.2 s | 19.6 s | 36.1 s |  94.7 s  |
| wall clock do spec| 44.0 s | 72.4 s | 95.3 s | 247.0 s  |

A maioria dos specs soma de forma consistente cerca de 30 a 32 segundos fora do test body. Com uma decomposição adicional, a inicialização de um spec comum costuma levar de 4 a 7 segundos e a saída de 25.8 a 26.6 segundos.

### 5. Specs mais lentos

| spec                                                            | nº de cases | Wall clock | test body | Tempo fora do test |
| --------------------------------------------------------------- | ----------: | ---------: | --------: | ------------------: |
| `conversation-session-background.test.ts`                       |          18 |   247.0 s  |   211.2 s |             35.8 s  |
| `conversation-session-model-switch-queue.test.ts`               |           2 |   147.0 s  |   103.6 s |             43.4 s  |
| `coding-plan-team-usage.test.ts`                                 |           5 |    95.7 s  |    65.6 s |             30.1 s  |
| `conversation-session-read-session-context-timeout.test.ts`      |           1 |    95.3 s  |    63.9 s |             31.4 s  |
| `conversation-session-edit.test.ts`                             |           2 |    87.4 s  |    55.9 s |             31.5 s  |
| `conversation-session-model-switch-restore-repro.test.ts`       |           2 |    77.0 s  |    48.5 s |             28.5 s  |
| `conversation-session-compact-actions.test.ts`                  |           1 |    72.4 s  |    41.0 s |             31.4 s  |
| `conversation-session-config-and-multisession.test.ts`          |           1 |    67.5 s  |    36.4 s |             31.1 s  |
| `conversation-session-new-session-inherits-model.test.ts`        |           1 |    64.2 s  |    14.1 s |             50.1 s  |
| `conversation-session-fork.test.ts`                             |           3 |    64.1 s  |    33.7 s |             30.4 s  |

Embora `background.test.ts` tenha o maior tempo total, seus 18 cases compartilham uma única session, de modo que o custo fixo é de cerca de 36 segundos e a amortização é muito boa. Ele não é um alvo prioritário de divisão.

### 6. Cases mais lentos e semântica de tempo

| case                                              | test body | Classificação                          |
| ------------------------------------------------- | --------: | -------------------------------------- |
| Trocar modelo e auto drain antes do consumo de texto enfileirado | 94.7 s | Atraso longo de fixture desnecessário  |
| Extração lite de ReadSessionContext acima de 45 s | 63.9 s    | Cobertura intencional de limite de tempo |
| edit + held queue                                | 45.2 s    | Consome toda a janela de espera após falha |
| compacting actions                               | 41.0 s    | Amplificação por falha/condição de corrida |
| Troca concorrente entre múltiplas sessions        | 36.4 s    | Custo de interação real                 |
| background queue drain                           | 36.1 s    | Fluxo de background controlado         |

Os dois controlled streams de `conversation-session-model-switch-queue.json` colocam os eventos de cauda em `90000/90100/90200 ms`. O segundo case precisa esperar o fim da primeira rodada para validar o auto drain, então os 94.7 segundos são quase todos determinados pelo relógio de fixture de 90.2 segundos. Não são necessários 90 segundos para provar que "a troca acontece na janela running".

`conversation-session-read-session-context-timeout.test.ts`, por outro lado, define explicitamente:

- fixture lite `delayMs = 55000`
- asserção no segundo 46 de que ainda está streaming
- o objetivo é cobrir o timeout histórico de 45 segundos

Esses 63.9 segundos não podem ser tratados com um simples "acelerar o fixture"; a semântica deve ser preservada e o case colocado explicitamente na categoria slow-time-boundary.

### 7. Custo fixo de build

O artifact do sucesso direcionado mais recente teve tempo total de `97.7 s`, com saída de spec do WDIO de `29.3 s` e test body de apenas `1 ms`. Cerca de `68.4 s` foram consumidos no build/prepare antes do worker. No full run mais recente, a partida a frio até o primeiro worker levou `102.5 s`.

O `onPrepare` atual executa a cada run:

1. limpeza de processos Electron remanescentes
2. `build:no-runtime-assets` do desktop
3. build do agent server

Isso representa cerca de 1.7 minuto de um full run completo, mas é muito significativo para depuração direcionada. A entrada padrão deve continuar garantindo fresh build; é mais adequado fornecer uma entrada explícita de reuse-build.

### 8. Causa principal da saída de session

`packages/desktop/wdio.conf.ts` executa, antes de o próprio WDIO remover a WebDriver session:

1. `quitCurrentElectronApp("after")`
2. `electron.app.quit()`
3. espera pelo main process por no máximo 1 segundo
4. o WDIO então executa a remoção da session
5. `afterSession` varre novamente e mata à força os processos remanescentes

Essa lógica foi introduzida por `f93a38d3c fix(desktop-e2e): clean up leftover electron processes`, para garantir que o `before-quit` do Electron consiga recolher host/agent. O comentário do código também admite: enquanto o Chromedriver mantém a session, o Electron pode só sair de verdade no `deleteSession`.

Fatos confirmados:

- a fase de saída dos 66 specs soma 28.15 minutos
- um spec comum leva de forma consistente cerca de 26 segundos
- o próprio `after()` do `wdio-electron-service@9.2.1` só limpa o cache de session do Puppeteer, sem nenhum sleep explícito de 25 segundos

Hipótese única a ser provada por A/B: chamar `app.quit()` antes de `deleteSession` coloca o ChromeDriver no caminho de encerramento lento. Não se pode simplesmente remover esse trecho de limpeza, porque ele resolvia orphan host/agent; é preciso validar simultaneamente o tempo de saída e que os processos remanescentes são zero.

### 9. O número de sessions em série amplifica o custo fixo

111 cases distribuídos em 67 specs:

| Cases por spec | Nº de specs |
| ------------: | ----------: |
|             1 |          51 |
|             2 |           8 |
|             3 |           3 |
|             5 |           1 |
|             6 |           2 |
|            18 |           1 |

Os 51 specs de um único case significam que a imensa maioria dos cases paga isoladamente um custo de inicialização e saída do Electron. A documentação local do WDIO suporta colocar arrays de specs aninhados em ordem no mesmo worker, mas neste projeto o `beforeSession` injeta HOME, configuração de inicialização e replay fixture por spec; o agrupamento precisa validar primeiro conflitos de fixture e limpeza de estado, e não pode ser feito de forma bruta e total.

### 10. Limite da paralelização

Embora a configuração exponha `ZCODE_E2E_MAX_INSTANCES`, hoje:

- `E2E_HOME_DIR` é calculado apenas uma vez, no carregamento da config
- cada `beforeSession` apaga o mesmo HOME
- o marcador de cleanup ainda inclui o `APP_ENTRY_POINT` compartilhado e `out/main`

Portanto, usar `maxInstances=2` diretamente faz os workers se apagarem o HOME um do outro, e o cleanup de um worker pode matar o outro. A paralelização segura exige primeiro HOME, artifact e run id independentes por shard, e estreitar a limpeza de processos para o HOME/run token do próprio shard.

### 11. Efeito de amplificação da CI histórica

Log histórico de CI no Windows fornecido pelo usuário:

- 62 specs, 0 passed, 62 failed
- tempo total `01:27:15`
- worker P50 `125.9 s`, P90 `126.9 s`, P95 `127.4 s`
- 40 workers levaram pelo menos 120 segundos
- os 22 workers seguintes crasharam em menos de 15 segundos

No início do log, o mesmo erro de infraestrutura se repetiu, consumindo o case timeout de 120 segundos por completo; em seguida, os processos Electron acumulados causaram `DevToolsActivePort file doesn't exist` e os workers restantes quebraram rapidamente. Os commits atuais de estabilidade no Windows já corrigiram parte disso, mas a CI ainda precisa de um mecanismo de "parar o despacho quando o portão de saúde falhar", para que o próximo erro de infraestrutura não seja amplificado novamente até o job timeout de 2 horas.

### 12. Comparação das opções de otimização

| Opção                                     | Ganho esperado                        | Risco                        | Recomendação                       |
| ----------------------------------------- | ------------------------------------- | ---------------------------- | --------------------------------- |
| Corrigir a saída de session de 26 s      | Economia de cerca de 18 a 22 min em série | Reintroduzir orphan host/agent | Primeira prioridade, exige A/B   |
| Reduzir o replay de 90.2 s para 15.2 s  | Economia de cerca de 75 s por execução | Janela running curta demais vira corrida | Ganho rápido, validar direcionado |
| Agrupar specs compatíveis e reutilizar session | Economia de 10 a 20 min dependendo dos grupos | Cross-talk de HOME/fixture/estado inicial | Ampliar gradualmente após canary |
| Dois shards com HOME independente        | Wall clock perto da metade             | Recursos dobrados, cleanup se matando | Habilitar após isolar o cleanup  |
| Aumentar `maxInstances` diretamente      | Parece reduzir pela metade             | Hoje necessariamente apaga o HOME um do outro | Proibido                           |
| Tirar o case de limite de 55 s da lane padrão de MR | Economia de cerca de 64 s na lane padrão | Reduz cobertura de limite a cada MR | Manter nightly/slow lane          |
| Portão de saúde / disjuntor de infraestrutura | Cerca de 30 s a mais em execução normal | Mais uma entrada e mais um artifact | Obrigatório na CI                 |

### 13. Budget alvo

Critérios de conclusão da primeira etapa:

- `worker teardown P50 <= 8 s`
- E2E completo no Windows em série `<= 42 min`
- segundo case de `model-switch-queue` `<= 30 s`
- nenhum processo residual `ZCode E2E`, host, agent ou Chromedriver ao fim da execução

Critérios de conclusão da segunda etapa:

- E2E no Windows com dois shards `<= 25 min`
- cada shard gera um summary independente e, após a mesclagem, o total de cases é igual ao não fragmentado
- um mesmo erro de infraestrutura consome no máximo um portão de saúde, sem despachar 62 specs

## Plano de Implementação

### Task 1: Registrar os tempos do ciclo de vida do WDIO

**Arquivos:**
- Modify: `packages/e2e-report/src/shared/types.ts`
- Modify: `packages/e2e-report/src/node/index.ts`
- Modify: `packages/desktop/wdio.conf.ts`
- Create: `packages/e2e-report/test/node-index.test.ts`

**Interfaces:**
- Consumes: os hooks `onPrepare`, `beforeSession`, `before`, `after`, `afterSession` e `onComplete` do WDIO.
- Produces: `lifecycle-events.ndjson` e a agregação `lifecycle` no summary, das quais dependem o A/B de saída posterior, o portão de budget e a mesclagem de shards.

- [ ] **Step 1: Escrever o teste falhando do lifecycle event**

O teste fixa o modelo de eventos:

```ts
export type E2ELifecyclePhase =
  | "prepare"
  | "before-session"
  | "before"
  | "after"
  | "after-session"
  | "complete";

export interface E2ELifecycleEvent {
  cid?: string;
  completedAt: string;
  durationMs: number;
  phase: E2ELifecyclePhase;
  specs: string[];
  startedAt: string;
}
```

O teste deve afirmar que o NDJSON pode ser acrescido, que o mesmo `cid + phase` pode ser agregado e que, na falta de um `onComplete` normal, os eventos já escritos são preservados.

- [ ] **Step 2: Executar o teste unitário do reporter e confirmar a falha**

Run: `pnpm exec vitest run packages/e2e-report/test/node-index.test.ts`

Expected: FAIL, indicando que o lifecycle writer/campos do summary ainda não existem.

- [ ] **Step 3: Implementar o lifecycle writer e a agregação**

Adicionar no objeto retornado pelo reporter de node:

```ts
recordLifecycleEvent(event: E2ELifecycleEvent): void;
```

O summary precisa pelo menos gerar:

```ts
lifecycle: {
  byPhase: Record<E2ELifecyclePhase, {
    count: number;
    p50Ms: number;
    p95Ms: number;
    totalMs: number;
  }>;
}
```

- [ ] **Step 4: Unificar a medição nos hooks do WDIO**

O `onPrepare` chama primeiro `e2eReporter.prepare(configuredSpecs)` para criar o artifact e só então entra na medição; adicionar um helper que garanta que o evento seja gravado tanto no sucesso quanto na exceção:

```ts
async function measureE2ELifecyclePhase<T>(
  phase: E2ELifecyclePhase,
  context: { cid?: string; specs?: string[] },
  run: () => Promise<T> | T,
): Promise<T> {
  const startedAt = new Date();
  try {
    return await run();
  } finally {
    const completedAt = new Date();
    e2eReporter.recordLifecycleEvent({
      cid: context.cid,
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      phase,
      specs: context.specs ?? [],
      startedAt: startedAt.toISOString(),
    });
  }
}
```

- [ ] **Step 5: Executar os testes unitários e o typecheck de E2E**

Run: `pnpm exec vitest run packages/e2e-report/test/node-index.test.ts`

Expected: PASS.

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Expected: PASS.

- [ ] **Step 6: Validar o artifact com dois specs direcionados**

PowerShell:

```powershell
$env:ZCODE_E2E_SPEC='./test/e2e/container-boot.test.ts,./test/e2e/conversation-session/conversation-session-first-send.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

Expected: o summary contém prepare, before-session, before, after, after-session e complete; o número de cases é igual ao dos specs originais.

- [ ] **Step 7: Commitar as mudanças de observabilidade**

```bash
git add packages/e2e-report/src/shared/types.ts packages/e2e-report/src/node/index.ts packages/e2e-report/test/node-index.test.ts packages/desktop/wdio.conf.ts
git commit -m "test(desktop): record e2e lifecycle timings"
```

### Task 2: Provar por A/B e corrigir a saída de session de 26 segundos

**Arquivos:**
- Create: `packages/desktop/test/e2e/helpers/e2e-process-cleanup.ts`
- Modify: `packages/desktop/wdio.conf.ts`
- Create: `packages/desktop/test/e2e-process-cleanup.test.ts`

**Interfaces:**
- Consumes: as métricas de lifecycle `after` e `after-session` da Task 1.
- Produces: uma estratégia de saída validada por evidência, exigindo teardown P50 de no máximo 8 segundos e nenhum processo órfão.

- [ ] **Step 1: Escrever o teste falhando do limite de filtragem de processos**

O teste inclui pelo menos dois HOMEs concorrentes:

```ts
const ownHome = "C:/repo/packages/desktop/.e2e-home-shard-1";
const otherHome = "C:/repo/packages/desktop/.e2e-home-shard-2";
```

Afirmar que o cleanup devolve somente os processos raiz do Electron cuja linha de comando contém `ownHome` e seus filhos, sem selecionar `otherHome` por causa do `out/main` compartilhado ou do app entry point.

- [ ] **Step 2: Executar o teste e confirmar que a implementação atual falha**

Run: `pnpm exec vitest run packages/desktop/test/e2e-process-cleanup.test.ts`

Expected: FAIL, porque o marcador atual inclui o `APP_ENTRY_POINT` compartilhado e `out/main`.

- [ ] **Step 3: Extrair uma função pura de filtragem de processos e estreitar o marcador**

A regra de filtragem fica fixa:

```ts
isOwnE2EProcess = commandIncludesExactHome(item.command, e2eHomeDir);
```

Depois, coletar a subárvore a partir dos processos raiz selecionados, seguindo o PPID. `onPrepare`, `afterSession` e `onComplete` reutilizam a mesma regra.

- [ ] **Step 4: Adicionar a chave de A/B da estratégia de saída**

```ts
type E2EQuitStrategy = "app-quit-before-delete" | "webdriver-owned";

const e2eQuitStrategy: E2EQuitStrategy =
  process.env.ZCODE_E2E_QUIT_STRATEGY === "webdriver-owned"
    ? "webdriver-owned"
    : "app-quit-before-delete";
```

`webdriver-owned` apenas pula `electron.app.quit()` em `after`; `afterSession` continua fazendo a limpeza pelo HOME exato.

- [ ] **Step 5: Rodar o A/B uma vez cada para o mesmo conjunto de specs**

```powershell
$env:ZCODE_E2E_SPEC='./test/e2e/container-boot.test.ts,./test/e2e/conversation-session/conversation-session-first-send.test.ts,./test/e2e/conversation-session/conversation-session-running-actions.test.ts'
$env:ZCODE_E2E_QUIT_STRATEGY='app-quit-before-delete'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts

$env:ZCODE_E2E_QUIT_STRATEGY='webdriver-owned'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

Comparar o P50/P95 de `after` e `after-session` dos dois summaries e verificar a lista de processos.

- [ ] **Step 6: Escolher a implementação final com base na evidência**

Regra de decisão:

- Se o teardown P50 de `webdriver-owned` for `<= 8 s`, todos os specs passarem, o log do main provar o fechamento normal de host/agent e não houver processo do own HOME após `afterSession`, então remover a chave de A/B permanente e adotar `webdriver-owned`.
- Se houver órfãos ou host/agent não passarem pela limpeza, manter a estratégia atual de `app.quit` e não fazer remoção por suposição; priorizar o agrupamento de sessions da Task 4 e os shards da Task 5, e registrar o encerramento lento do ChromeDriver como algo a ser tratado upstream.

- [ ] **Step 7: Executar os testes**

Run: `pnpm exec vitest run packages/desktop/test/e2e-process-cleanup.test.ts`

Expected: PASS.

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Expected: PASS.

- [ ] **Step 8: Commitar a otimização de saída**

```bash
git add packages/desktop/test/e2e/helpers/e2e-process-cleanup.ts packages/desktop/wdio.conf.ts packages/desktop/test/e2e-process-cleanup.test.ts
git commit -m "test(desktop): reduce windows e2e session teardown"
```

### Task 3: Comprimir o controlled stream não essencial de 90.2 segundos

**Arquivos:**
- Modify: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json`
- Modify: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-switch-queue.json`

**Interfaces:**
- Consumes: as asserções existentes de running, queue e captura de modelo em `conversation-session-model-switch-queue.test.ts`.
- Produces: um controlled stream que ainda permite concluir de forma estável a ação de troca de modelo, mas termina os eventos de cauda em 15.2 segundos.

- [ ] **Step 1: Preservar a baseline anterior à falha**

Registrar a partir do artifact o `durationMs = 94706` atual do segundo case como baseline pré-otimização; não rodar de novo o case antigo de 90 segundos.

- [ ] **Step 2: Encurtar os offsets de eventos dos dois streams case-local**

Mudar os dois grupos:

```json
[0, 250, 8000, 16000, 24000, 90000, 90100, 90200]
```

para:

```json
[0, 250, 1500, 3000, 5000, 15000, 15100, 15200]
```

15 segundos ainda é claramente maior que a janela normal de interação de iniciar request, enviar queue e trocar o model, e ao mesmo tempo economiza cerca de 75 segundos.

- [ ] **Step 3: Atualizar o metadata do fixture**

No `syntheticReason` do case manifest, escrever que: essa temporização só precisa cobrir "ainda está running quando a ação acontece", não cobre o timeout de 90 segundos; o limite real de timeout é de responsabilidade do case dedicado slow-time-boundary.

- [ ] **Step 4: Validar o fixture**

Run: `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-model-switch-queue.test.ts`

Expected: PASS.

- [ ] **Step 5: Executar um E2E direcionado**

Run: `pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/conversation-session/conversation-session-model-switch-queue.test.ts`

Expected: 2 passing; o segundo case não passa de 30 segundos; a captura de request continua sendo secondary model/thought.

- [ ] **Step 6: Commitar a otimização do fixture**

```bash
git add packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-switch-queue.json
git commit -m "test(desktop): shorten model switch queue replay"
```

### Task 4: Diluir o custo fixo de session com agrupamento de specs compatíveis

**Arquivos:**
- Create: `packages/desktop/test/e2e/spec-groups.ts`
- Create: `packages/desktop/test/spec-groups.test.ts`
- Modify: `packages/desktop/wdio.conf.ts`

**Interfaces:**
- Consumes: a capacidade de arrays `specs` aninhados do WDIO e a lógica existente de merge de fixture em `beforeSession(specs)`.
- Produces: grupos compatíveis explícitos e auditáveis; o comportamento padrão de `--spec` direcionado não muda.

- [ ] **Step 1: Escrever o teste falhando da seleção de grupos**

O primeiro canary é fixado como sendo só de UI/apresentação:

```ts
export const WINDOWS_E2E_COMPATIBLE_SPEC_GROUPS = [
  [
    "./test/e2e/conversation-session/conversation-session-markdown-table-enhanced-scroll.test.ts",
    "./test/e2e/conversation-session/conversation-session-markdown-table-layout.test.ts",
    "./test/e2e/conversation-session/conversation-session-status-panel-inline-layout.test.ts",
  ],
] as const;
```

O teste afirma que: specs direcionados não são agrupados por padrão; com a chave explícita em `1` e os specs solicitados atingindo o canary por completo, o agrupamento é permitido; ao atingir apenas um subconjunto do canary, tudo permanece separado; e a ordem e a quantidade de specs não agrupados não muda.

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `pnpm exec vitest run packages/desktop/test/spec-groups.test.ts`

Expected: FAIL, pois a função de agrupamento ainda não existe.

- [ ] **Step 3: Implementar o agrupamento opt-in**

```ts
const groupCompatibleSpecs =
  process.env.ZCODE_E2E_GROUP_COMPATIBLE_SPECS === "1";
```

A função de agrupamento só gera arrays aninhados quando todos os membros de um group estão contidos nos configured specs; quando só parte dos membros é atingida, tudo permanece separado. A contagem de configured specs do reporter usa a lista de arquivos após o flatten; `config.specs` do WDIO mantém os arrays aninhados.

- [ ] **Step 4: Executar os testes unitários e o typecheck**

Run: `pnpm exec vitest run packages/desktop/test/spec-groups.test.ts`

Expected: PASS.

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Expected: PASS.

- [ ] **Step 5: Executar um E2E de canary com agrupamento**

```powershell
$env:ZCODE_E2E_GROUP_COMPATIBLE_SPECS='1'
$env:ZCODE_E2E_SPEC='./test/e2e/conversation-session/conversation-session-markdown-table-enhanced-scroll.test.ts,./test/e2e/conversation-session/conversation-session-markdown-table-layout.test.ts,./test/e2e/conversation-session/conversation-session-status-panel-inline-layout.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

Expected: os três arquivos executam em sequência dentro de um worker, o total de cases é o mesmo, há apenas um before-session/after-session e não há fixture mismatch nem cross-talk de estado.

- [ ] **Step 6: Ampliar as regras de admissão do agrupamento**

Um spec só pode entrar em groups posteriores se atender simultaneamente a:

- o `after` faz `clearAppData()` ou restauração equivalente
- não depende de estados iniciais de seed mutuamente exclusivos
- não há conflito de matcher genérico de mesma prioridade após o merge de fixtures case-local
- a contagem de capturas de request é a mesma rodando separado e rodando agrupado

Cada novo group é commitado separadamente; não é permitido mesclar de uma vez os 51 specs de um único case.

- [ ] **Step 7: Commitar o canary**

```bash
git add packages/desktop/test/e2e/spec-groups.ts packages/desktop/test/spec-groups.test.ts packages/desktop/wdio.conf.ts
git commit -m "test(desktop): group compatible windows e2e specs"
```

### Task 5: Adicionar uma entrada segura de dois shards no Windows

**Arquivos:**
- Create: `packages/desktop/scripts/run-windows-e2e-shards.mjs`
- Create: `packages/desktop/test/windows-e2e-shards.test.ts`
- Modify: `packages/desktop/package.json`
- Modify: `package.json`
- Modify: `.gitlab/ci/20-test.yml`

**Interfaces:**
- Consumes: a limpeza precisa de processos por HOME da Task 2, o `--shard=x/y` do WDIO e as portas dinâmicas de mock/replay.
- Produces: dois shards paralelos com HOME, run id e artifact independentes; a entrada total retorna não zero se qualquer um falhar.

- [ ] **Step 1: Escrever o teste falhando da geração de ambiente dos shards**

Cada shard precisa gerar:

```ts
{
  ZCODE_E2E_HOME_DIR: `.e2e-home-${runId}-shard-${index}`,
  ZCODE_E2E_RUN_ID: `${runId}-shard-${index}-of-${total}`,
  ZCODE_E2E_SKIP_BUILD: "1",
}
```

O teste afirma que o HOME, o artifact e o run id dos dois shards são diferentes e que os comandos contêm respectivamente `--shard=1/2` e `--shard=2/2`.

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `pnpm exec vitest run packages/desktop/test/windows-e2e-shards.test.ts`

Expected: FAIL, pois o runner ainda não existe.

- [ ] **Step 3: Implementar o runner build-once + two-shard**

A ordem do runner é fixa:

1. Executar `pnpm --filter @zcode/e2e-report build:node`
2. Executar `pnpm --filter @zcode/desktop build:no-runtime-assets`
3. Executar `node scripts/build-desktop-agent-cli.mjs`
4. Iniciar em paralelo dois `wdio run wdio.conf.ts --shard=x/2`
5. Aguardar os dois subprocessos
6. Se qualquer um for não zero, a entrada total é não zero
7. Exibir os dois caminhos de artifact, sem sobrescrever os summaries individuais

- [ ] **Step 4: Adicionar as entradas de script**

`packages/desktop/package.json`:

```json
"test:e2e:windows:sharded": "node scripts/run-windows-e2e-shards.mjs"
```

`package.json` raiz:

```json
"test:e2e:windows:sharded": "pnpm --filter @zcode/desktop test:e2e:windows:sharded"
```

- [ ] **Step 5: Executar o teste unitário do runner**

Run: `pnpm exec vitest run packages/desktop/test/windows-e2e-shards.test.ts`

Expected: PASS.

- [ ] **Step 6: Fazer o job Windows do GitLab usar dois shards**

Adicionar ao job:

```yaml
parallel: 2
```

O run id precisa conter `$env:CI_NODE_INDEX`, e o comando do WDIO ganha:

```powershell
--shard=$env:CI_NODE_INDEX/$env:CI_NODE_TOTAL
```

Cada checkout de job do GitLab isola o HOME de forma natural; o diretório de artifact continua incluindo o shard index para evitar sobrescrita no upload.

- [ ] **Step 7: Commitar a entrada de shards**

```bash
git add packages/desktop/scripts/run-windows-e2e-shards.mjs packages/desktop/test/windows-e2e-shards.test.ts packages/desktop/package.json package.json .gitlab/ci/20-test.yml
git commit -m "ci(desktop): shard windows conversation e2e"
```

### Task 6: Adicionar portão de saúde, slow lane e budget de tempo na CI

**Arquivos:**
- Create: `packages/desktop/scripts/check-e2e-duration-budget.mjs`
- Create: `packages/desktop/test/e2e-duration-budget.test.ts`
- Modify: `.gitlab/ci/20-test.yml`
- Modify: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-read-session-context-timeout.json`

**Interfaces:**
- Consumes: o lifecycle summary da Task 1 e os shard summaries da Task 5.
- Produces: parada rápida em falha de infraestrutura, classificação explícita de cases lentos e budget de regressão de performance.

- [ ] **Step 1: Escrever o teste falhando da verificação de budget**

O budget é fixado como:

```ts
const WINDOWS_E2E_BUDGET = {
  caseP95Ms: 30_000,
  prepareMs: 120_000,
  teardownP50Ms: 8_000,
};
```

Cases com `timingPolicy: "slow-time-boundary"` podem ultrapassar o budget normal de case P95, mas precisam ser contados separadamente e com a razão de saída.

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `pnpm exec vitest run packages/desktop/test/e2e-duration-budget.test.ts`

Expected: FAIL, pois o script de budget ainda não existe.

- [ ] **Step 3: Marcar ReadSessionContext como slow-time-boundary**

A razão no manifest escreve: o replay de `55s` serve para provar que o mesmo turn continua depois de ultrapassar o timeout histórico de `45s`, e não pode ser substituído pela fast lane comum.

- [ ] **Step 4: Executar o portão de saúde antes da suite principal na CI do Windows**

O portão de saúde roda apenas:

```text
./test/e2e/container-boot.test.ts
```

O portão de saúde é responsável por completar o fresh build; a suite principal define `ZCODE_E2E_SKIP_BUILD=1`. Se o portão de saúde falhar, sair imediatamente e não despachar os conversation specs seguintes.

Em PowerShell, salvar o artifact principal e então dar ao portão de saúde um diretório independente:

```powershell
$mainArtifactDir = $env:ZCODE_E2E_ARTIFACT_DIR
$mainRunId = $env:ZCODE_E2E_RUN_ID
$mainSpecs = $env:ZCODE_E2E_SPEC

$env:ZCODE_E2E_ARTIFACT_DIR = "$mainArtifactDir-preflight"
$env:ZCODE_E2E_RUN_ID = "$mainRunId-preflight"
$env:ZCODE_E2E_SPEC = './test/e2e/container-boot.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:ZCODE_E2E_ARTIFACT_DIR = $mainArtifactDir
$env:ZCODE_E2E_RUN_ID = $mainRunId
$env:ZCODE_E2E_SPEC = $mainSpecs
$env:ZCODE_E2E_SKIP_BUILD = '1'
```

- [ ] **Step 5: Executar o script de budget após o shard principal terminar**

PowerShell:

```powershell
node packages/desktop/scripts/check-e2e-duration-budget.mjs "$env:ZCODE_E2E_ARTIFACT_DIR\summary.json"
```

Expected: summary completo, case P95 comum e teardown P50 dentro do budget; slow-time-boundary reportado separadamente.

- [ ] **Step 6: Executar os testes unitários**

Run: `pnpm exec vitest run packages/desktop/test/e2e-duration-budget.test.ts`

Expected: PASS.

- [ ] **Step 7: Commitar as proteções da CI**

```bash
git add packages/desktop/scripts/check-e2e-duration-budget.mjs packages/desktop/test/e2e-duration-budget.test.ts .gitlab/ci/20-test.yml packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-read-session-context-timeout.json
git commit -m "ci(desktop): add windows e2e runtime budgets"
```

### Task 7: Verificação final e atualização da baseline

**Arquivos:**
- Modify: `docs/superpowers/plans/2026-07-10-windows-e2e-runtime-optimization.md`

**Interfaces:**
- Consumes: os artifacts e summaries das Tasks 1-6.
- Produces: uma nova baseline completa, o ganho real e os riscos residuais.

- [x] **Step 1: Executar as verificações mecânicas**

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS; warnings existentes e novas falhas são reportados separadamente.

- [x] **Step 2: Executar uma vez o E2E completo do Windows**

Run: `pnpm test:e2e`

Result: a entrada padrão do Windows já foi trocada para build-once + two-shard. Rodado uma única vez, os dois shards geram summaries completos e, ao final, não há processo órfão de E2E.

- [x] **Step 3: Validar o E2E com dois shards**

Run: `pnpm test:e2e`

Result: a restrição mais recente do usuário pede que não se rode de novo em ciclo após o full run, então não foi executada uma segunda vez pelo alias. O `pnpm test:e2e` padrão do Windows já executa two-shard e produz dois summaries independentes e um manifest pai.

- [x] **Step 4: Atualizar os resultados medidos deste relatório**

Substituir as previsões pelo run id dos artifacts serial e de dois shards, tempo total, prepare, startup, test body, teardown, slow lane e classificação de falhas; manter a baseline antiga para comparação.

- [x] **Step 5: Commitar a baseline final**

```bash
git add docs/superpowers/plans/2026-07-10-windows-e2e-runtime-optimization.md
git commit -m "docs(testing): record optimized windows e2e baseline"
```

## 2026-07-11 Implementação e medição do full run

### O que foi implementado

1. O lifecycle reporter registra `prepare`, `before-session`, `before`, `after`, `after-session`, `worker` e `complete`.
2. Foi feito um A/B com os mesmos specs entre `app.quit` e o teardown WebDriver-owned: os workers ficaram em `34,911 ms` e `34,959 ms`, respectivamente. Pular `app.quit` apenas move o ponto de espera e não gera ganho, então a semântica de fechamento original foi mantida.
3. O cleanup do Windows passou a casar apenas o marcador de HOME do run/shard atual, reciclando recursivamente seus subprocessos; o nome de produto compartilhado, o app entry e `out/main` não são mais usados como marcador raiz.
4. O `pnpm test:e2e` do Windows passou a construir desktop/agent uma vez e depois iniciar em paralelo dois shards WDIO independentes. Cada shard usa HOME, run id, artifact e diretório de captura de rede próprios.
5. O job de conversation no Windows do GitLab ganhou `parallel: 2`, e cada job continua preservando o contrato de summary independente.

### Resultados do full run

Run id: `desktop-e2e-optimized-full-20260711-final`

Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-optimized-full-20260711-final`

| Métrica                                   | Medido |
| ----------------------------------------- | -----: |
| Wall clock do runner pai                 | `2,926,331 ms` (48 min 46 s) |
| shard 1                                   | `2,608,448 ms` (43 min 28 s), 42 spec workers |
| shard 2                                   | `2,824,532 ms` (47 min 05 s), 41 spec workers |
| Escopo completo                          | 83 spec workers, 184 tests |
| Passando / falhando                       | 177 / 7, pass rate `96.20%` |
| infra / flaky                             | 0 / 0   |
| Soma dos test bodies                      | `2,581,448 ms` (43 min 01 s) |
| Soma dos hooks de worker visíveis         | `203,017 ms` (3 min 23 s) |
| Custos de session/WebDriver não atribuídos | `2,632,773 ms` (43 min 53 s) |
| Soma dos workers                          | `5,417,238 ms` (90 min 17 s) |
| Estimativa serial dos dois children       | `5,432,980 ms` (90 min 33 s) |
| Custo fixo de build-once + pai            | `101,799 ms` (1 min 42 s) |
| Em relação à estimativa serial do mesmo escopo | Economia de `2,506,649 ms` (41 min 47 s), queda de wall clock de cerca de `46.1%` |

A baseline antiga completava apenas 66 specs antes do timeout externo de 60 minutos, e o último spec foi truncado. O novo resultado cobre 83 spec workers e encerra por completo, portanto `48:46` não pode ser lido diretamente como `60 -> 49` do mesmo escopo; pela duração cumulativa real dos dois children desta rodada, o serial do mesmo escopo seria cerca de `90:33`, e o two-shard já está próximo da metade teórica.

### Lista de falhas

As 7 falhas desta rodada foram todas classificadas pelo reporter como falhas de produto/asserção, com `infraFailureCount=0`:

| Spec                                                       | Resumo da causa                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `conversation-session-background.test.ts`                  | A notificação de conclusão do background child não entrou na requisição do modelo pai |
| `conversation-session-compact-actions.test.ts`             | O body de requisição esperado do DeepSeek não foi capturado  |
| `conversation-session-composer-prefix-routing.test.ts`     | O painel de candidatos de skill `/` não abriu                 |
| `conversation-session-deepseek-v4-reasoning-request-shape.test.ts` | O nível de pensamento atual ainda era `high`, sem trocar para `max` |
| `conversation-session-edit.test.ts`                        | Após o stop, o active turn não foi liberado para completed   |
| `conversation-session-markdown-table-enhanced-scroll.test.ts` | Não entrou no estado de escorregamento pela esquerda antes do resize |
| `conversation-session-model-switch-restore-repro.test.ts`  | Depois de reconstruir a session, a lista de tarefas perdeu a task alvo |

Os specs de DeepSeek V4 e de edit eram modificações não commitadas que já existiam na working tree antes da execução; esta otimização não modificou nem commitou esses dois cases.

### Conclusões de runtime

- Os dois shards rodaram simultaneamente durante toda a execução e ambos completaram o summary; ao final não foi encontrado processo residual de Electron, Chromedriver, host ou agent.
- Os dois children diferiram em cerca de 3 min 37 s, então o balanceamento de tempo do shard nativo já está relativamente próximo. Mesmo com ponderação total, a teoria só permitiria reduzir mais cerca de 1 min 49 s, sem alcançar sozinho a meta de 25 minutos.
- O plano original assumia que o teardown P50 poderia cair de cerca de 26 s para 8 s; o A/B refutou o caminho de remover `app.quit`. Os dados desta rodada mostram ainda que os custos de session/WebDriver não atribuídos somam cerca de 43.9 min, comparáveis aos 43.0 min de test body, e essa é a próxima grande fonte de custo.
- O spec worker `tool-cross-product` levou `556,880 ms`, mas ele contém 51 cases reais; não pode ser comprimido mudando a semântica de suas asserções ou de seus fixtures.

### 2026-07-16 Promoção para quatro shards no GitLab Windows

A regressão automática de conversation-session no Windows foi promovida de dois shards nativos do GitLab para quatro. O caminho oficial usa apenas
o `parallel: 4` do GitLab e o `--shard=$env:CI_NODE_INDEX/$env:CI_NODE_TOTAL` nativo do WDIO:

```text
GitLab parallel: 4
  ├─ CI_NODE_INDEX=1 ──> WDIO --shard=1/4 ──> 独立 run id / artifact
  ├─ CI_NODE_INDEX=2 ──> WDIO --shard=2/4 ──> 独立 run id / artifact
  ├─ CI_NODE_INDEX=3 ──> WDIO --shard=3/4 ──> 独立 run id / artifact
  └─ CI_NODE_INDEX=4 ──> WDIO --shard=4/4 ──> 独立 run id / artifact
```

Esta promoção não modifica specs oficiais, fixtures, código de produto nem o ciclo de vida de session do WDIO, e não leva para a CI a amostragem de recursos, os pesos históricos, a partição explícita de specs nem o relatório de avaliação usados no canary local. `CI_NODE_INDEX/CI_NODE_TOTAL` continuam participando do
run id, garantindo que o summary, a captura de rede e as evidências de falha dos quatro jobs não se sobrescrevam. Os testes de contrato de CI focados precisam afirmar ao mesmo tempo
`parallel: 4`, os parâmetros de shard e o isolamento de identidade de shard; se a capacidade do runner elevar a taxa de falhas de infraestrutura, o ponto de rollback
é apenas a quantidade de `parallel` desse job, sem alterar o contrato de teste de conversation-session.

O portão de cobertura dos summaries após o fragmentado precisa usar a mesma alocação ordenada do WDIO 9.27, e não pode deixar que um summary isolado continue sendo comparado
com o `ZCODE_E2E_SPEC` completo. O preflight continua expandindo o glob completo; após a execução, usa-se a ordem dos globs da configuração, a ordenação dentro de cada glob,
e então `specsPerShard = max(round(totalSpecs / shardTotal), 1)` com `slice` contínuos para obter o conjunto esperado exato do shard atual:

```text
完整 formal spec glob ──> WDIO 有序 spec 列表 ──> shard i/N ──> summary i
                              │                                  │
                              └── 同算法 round + slice ──────────┘
                                             精确集合比较
```

Cada shard precisa executar pelo menos um test, e o summary não pode deixar de fora o spec do próprio shard nem misturar specs de outros shards.
Quando os quatro jobs parallel do GitLab passam, a união dos quatro shards mutuamente exclusivos é exatamente o conjunto formal completo obtido no preflight; portanto
nesta fase não se adiciona um quinto job responsável apenas por mesclar summaries.

### Plano de otimizações seguintes

1. Construir pesos históricos de spec a partir do `worker` event desta rodada, usados apenas para estabilizar a alocação de shards; o conteúdo dos cases não muda. Ganho estimado de cerca de 1 a 2 minutos.
2. Adicionar eventos mais granulares à criação da WebDriver session e ao `deleteSession`, distinguindo Chromedriver, CDP bridge, saída do processo Electron e saída de host/agent, para localizar os 43.9 minutos de custo não atribuído.
3. Fazer canary de session reuse apenas para specs com contrato de estado explicitamente compatível; cada grupo ainda precisa executar os cases originais, as assertions originais e um reset obrigatório de HOME entre grupos. O ganho só pode ser ampliado depois de validação mecânica pelo total de cases e pela taxa de aprovação.
4. Adicionar na CI um portão de saúde separado de `container-boot`, para que uma falha de infraestrutura não despache mais o shard completo; isso reduz a amplificação de falhas sem mudar a semântica dos cases normais.
5. Preservar os cases de limite de tempo como `ReadSessionContext >45s`, title sidecar `>15s` e o model-switch de 90 segundos, sem mudar a decisão de aprovação encurtando o fixture.

## Ganhos Esperados

Estimando com os 66 specs completos atuais:

1. teardown P50 caindo de cerca de 26 s para 8 s: economia de cerca de 19 a 20 minutos.
2. model-switch queue caindo de 90.2 s para 15.2 s: economia de cerca de 75 segundos.
3. com a ampliação do canary de agrupamento, cada session eliminada continua economizando cerca de 15 a 33 segundos, dependendo do resultado do A/B de teardown.
4. dois shards seguros: sobre a base da otimização serial, levam o wall clock a cerca da metade.

A meta inicial era 38 a 42 minutos em serial e 20 a 25 minutos com dois shards. O two-shard medido deu 48 min 46 s e não atingiu a meta de 25 minutos; a razão é que o escopo completo atual cresceu para 83 spec workers e o A/B de saída provou que `app.quit` não pode ser removido. A próxima etapa precisa priorizar a redução do custo fixo de session/WebDriver, e não apenas continuar aumentando shards ou encurtando fixtures de case.

## Auto-verificação

- Foram cobertos o full run normal, a depuração direcionada, a falha de infraestrutura histórica da CI e o case slow-time-boundary.
- Não foi sugerido aumentar `maxInstances` diretamente.
- O case de limite de 55 segundos não foi tratado como um fixture lento comum e removido.
- Todas as conclusões de performance distinguem "já provado pelo log" de "precisa de prova por A/B".
- As tarefas de implementação incluem arquivos exatos, interfaces, comandos de verificação, critérios de sucesso e limites de commit.