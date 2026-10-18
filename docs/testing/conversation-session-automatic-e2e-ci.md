# CI de E2E Manual Formal do Desktop

## Contexto

É necessária uma entrada de CI que rode, de forma experimental, os E2Es de desktop que já
completaram a admissão formal do V4, usada para localizar regressões de desktop em pipelines de
MR/web. A entrada coleta os cases formais a partir do glob direct-root de conversation-session e
inclui explicitamente os specs formais de domínio cruzado já verificados manualmente;
`manual-review/pending` não é recolhido pelo glob não recursivo.

Estado atual: opcional e manual. `test:e2e:conversation-session:auto` e
`test:e2e:conversation-session:auto:windows` aparecem como jobs manuais na fase `approve-mr`; não
clicar não bloqueia o fluxo subsequente `build-app` / `build`, e falhar depois de clicar é tratado
com `allow_failure=true`. O nome do job preserva a nomenclatura histórica de conversation-session,
mas a cobertura já inclui o subconjunto formal de desktop admitido.

## Conjunto formal manual

`ZCODE_E2E_SPEC` usa atualmente globs de diretórios formais:

```bash
./test/e2e/conversation-session/*.test.ts,
./test/e2e/plugins/*.test.ts,
./test/e2e/workspace-file-tree-refresh.test.ts
```

O glob de conversation-session coleta mecanicamente e de forma dinâmica os specs formais do
direct-root, sem usar uma quantidade fixa como portão. Cada spec precisa antes passar pela auditoria
de admissão formal: é proibido usar o aggregate helper antigo, é obrigatório ter case manifest,
fixture de provider local ao case e um request ledger consistente com o manifest. O glob de plugins
coleta os casos de domínio de plugin já promovidos; `workspace-file-tree-refresh.test.ts` é o caso
formal de domínio cruzado já promovido do domínio de árvore de arquivos: não dispara requisições ao
provider e usa fixtures reais de workspace para validar o botão de refresh e a cadeia de refresh em
tempo real do watcher.

A CI não mantém mais uma segunda `ZCODE_E2E_EXCLUDE_SPEC` de quarentena. A elegibilidade para coleta
formal é decidida em conjunto pela posição do diretório e pela auditoria de admissão; cases que
ainda não satisfazem o contrato ficam em `manual-review/pending` e não podem ser colocados primeiro no
direct-root e depois excluídos pela CI.

## Regras de disparo

- Após a criação de um merge request pipeline no GitLab, aparecem dois jobs manuais de e2e para macOS / Windows; clique manual apenas quando for necessário investigar.
- Pipelines criados manualmente pela Web UI do GitLab também exibem o job manual de e2e e não consomem runner automaticamente.
- Fases posteriores como `test` / `build-app` / `build` não dependem mais do e2e formal de desktop; não clicar, pular ou falhar não bloqueia o fluxo posterior.
- `build:desktop:app` aguarda apenas a confirmação manual de `approve:merge-request`; os jobs de empacotamento das plataformas macOS / Windows / Linux dependem apenas do artifact de `build:desktop:app`.
- O escopo de branch alvo segue a regra do workflow: pipelines só são criados para MRs cujo branch de destino é `main` ou `staging`.

## Comando de execução

O job de CI usa um shell runner macOS para executar no host o E2E de WDIO Electron do desktop:

```bash
E2E_PROVIDER_HTTP_MODE=replay \
ZCODE_E2E_SPEC='./test/e2e/conversation-session/*.test.ts,./test/e2e/workspace-file-tree-refresh.test.ts' \
pnpm --filter @zcode/e2e-report build:node

E2E_PROVIDER_HTTP_MODE=replay \
ZCODE_E2E_SPEC='./test/e2e/conversation-session/*.test.ts,./test/e2e/workspace-file-tree-refresh.test.ts' \
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts
```

`ZCODE_E2E_SPEC` é entregue apenas como variável de ambiente para o `wdio.conf.ts` interpretar. A CI
não anexa mais o mesmo glob ao `--spec` da CLI do WDIO, evitando duas entradas de filtro de spec e
impedindo que o job só chegue a `onPrepare` / à fase de build sem um agendamento estável de worker.

O replay comum inicia um replay server local de fixture de provider, não acessa o upstream real de
modelo e não depende de API key na CI. Esta entrada não sobe Docker.

## Isolamento da toolchain paralela no Windows

O job do Windows usa `parallel` do GitLab para gerar quatro jobs independentes. Os quatro jobs não
usam mais slices nativos contínuos do WDIO; antes de iniciar o WDIO, o job expande o mesmo glob
formal, lê `packages/desktop/test/e2e/conversation-ci-spec-duration-weights.json`, usa uma alocação
LPT determinística baseada na duração histórica por worker para distribuir em quatro buckets e então
usa `CI_NODE_INDEX` para selecionar o bucket atual e reescreve o `ZCODE_E2E_SPEC` explícito. Isso
equilibra ao mesmo tempo specs longos, specs com muitos cases e o fallback de specs novos, sem
depender da ordem dos nomes de arquivo para que o primeiro shard carregue permanentemente as
coleções pesadas de background/goal. O summary de cada job valida somente o subconjunto explícito
que ele escolheu; os testes do alocador provam que a união dos quatro buckets é igual ao conjunto
formal completo, sem duplicatas e com tempo estimado controlado.
O profile atual vem da duração de ciclo de vida dos workers de uma execução completa bem-sucedida de
78 specs / 200 cases, e specs novos usam fallback de 20 segundos. As durações absolutas em diferentes
plataformas podem escalar em bloco, já que o LPT consome apenas os pesos relativos entre specs; assim
que houver um novo artefato de execução completa bem-sucedida no Windows, o profile pode ser
atualizado com a mesma métrica de duração por `worker`.

A distribuição recalculada para a mesma amostra de runtime, comparando o slice nativo contínuo antigo
com o novo LPT, é a seguinte. A coluna de duração é uma estimativa do profile e não se passa por
wall-clock novo do CI no Windows; ela serve para provar que o algoritmo de alocação não pressiona
mais specs pesados sempre para o primeiro bucket.

| Método de alocação   | Número de cases por shard | Duração estimada do shard | Razão máx/mín |
| ---------------- | -------------------- | ------------------------------- | ---------------: |
| WDIO native slice | `88 / 45 / 39 / 28`  | `633s / 316s / 270s / 293s`     |             2.35 |
| historical LPT    | `52 / 55 / 41 / 52`  | `375s / 381s / 375s / 380s`     |             1.02 |

```text
formal glob -> expand -> historical duration profile -> LPT bucket 1..4
                                                     -> CI_NODE_INDEX
                                                     -> explicit ZCODE_E2E_SPEC
                                                     -> WDIO -> subset summary gate
```

Os quatro jobs ainda podem cair na mesma máquina de shell runner. O diretório de instalação do NVM é
estado compartilhado no nível da máquina, e o setup do job proíbe criar ou sobrescrever ali o
`pnpm.ps1` do Corepack. Cada job precisa criar, com `CI_JOB_ID`, um diretório de shim do Corepack
independente dentro do diretório temporário do projeto, colocar esse diretório no início do `PATH`
do processo atual e verificar mecanicamente, antes de rodar o pnpm, que o comando realmente vem
dele.

```text
Windows runner
  ├─ job A -> .tmp/corepack-<job-A>/bin/pnpm.ps1 -> weighted bucket 1
  └─ job B -> .tmp/corepack-<job-B>/bin/pnpm.ps1 -> weighted bucket 2

禁止：job A/B -> NVM_HOME/<node-version>/pnpm.ps1（共享覆写）
```

Se a versão de Node do processo atual já satisfaz `NODE_VERSION`, o setup deixa de chamar o `nvm use`
que trocaria symlinks de nível de máquina; a cadeia existente de use/install/use só é usada quando a
versão não bate. O isolamento do shim do Corepack altera apenas o caminho de inicialização das
ferramentas de CI, e não o pnpm store, o workspace, o HOME do E2E, os artifacts ou o escopo de shards
nativos.

## Preparação automática dos assets de remote SSH

O glob formal de conversation inclui `conversation-session-ssh-remote*.test.ts`. Quando o runner
está configurado com `ZCODE_E2E_SSH_HOST` + `ZCODE_E2E_SSH_USERNAME` + `ZCODE_E2E_SSH_PASSWORD` (ou
qualquer um dos `ZCODE_E2E_SSH_HOST` / `ZCODE_E2E_SSH_A_HOST` / `ZCODE_E2E_SSH_B_HOST`), o
`stageDesktopE2EAppOutput` do `onPrepare` do WDIO faz o stage de
`packages/desktop/mock-cdn/releases/<repo version>` para um diretório isolado por runId, para uso do
runtime de remote SSH.

Esse diretório de release é produzido por `pnpm --filter @zcode/desktop prepare:remote-assets`. Os
problemas históricos: na CI apenas o job `build:remote:assets` executa esse comando, e ele roda no
slot de trabalho de um runner com tag `macos`, enquanto o e2e de conversation roda em um runner e2e
dedicado; embora `mock-cdn` seja excluído por `GIT_CLEAN_FLAGS` para persistência de workspace, os
dois diretórios de trabalho não se comunicam e os diretórios são nomeados por número de versão — após
cada bump de versão o runner dedicado necessariamente fica sem o diretório da nova versão e o
`onPrepare` dá fatal direto (o `SSH remote assets missing: .../mock-cdn/releases/3.12.0` do MR 2606 de
2026-09-11 é exatamente esse problema).

Comportamento atual: quando o ambiente SSH está pronto mas o diretório de release está ausente, o
`onPrepare` executa automaticamente `pnpm --filter @zcode/desktop prepare:remote-assets` e depois faz
o stage; se o diretório já existe, pula (idempotente, reutilizando o produto persistido da mesma
versão). Se o diretório continuar ausente depois do prepare, a execução continua abortando em
fail-closed. Assim o job de conversation e2e e o e2e SSH local não dependem mais do compartilhamento
implícito de produtos do workspace entre outros jobs / outros slots de runner.

```text
wdio onPrepare (stageDesktopE2EAppOutput)
  └─ SSH env 就绪?
       ├─ 否 → 跳过 remote release stage
       └─ 是 → mock-cdn/releases/<version> 存在?
              ├─ 是 → stage 到 runId 隔离目录
              └─ 否 → 自动跑 prepare:remote-assets
                       ├─ 产出成功 → stage
                       └─ 仍缺失 → fail-closed fatal
```

## Artifact

Cada execução manual grava sempre em `packages/desktop/.e2e-artifacts/<run-id>/`, mantido como
artifact de job do GitLab. Os arquivos principais incluem:

- `summary.md`
- `summary.json`
- `test-results.ndjson`
- `ci-pnpm-install.log`
- `ci-electron-install.log`
- `ci-desktop-e2e.log`
- `perf/container-samples.ndjson`
- `network-capture/`

## stdout da CI

Este job define por padrão `ZCODE_E2E_CI_STDOUT_MODE=summary`. Nesse modo, o stdout/stderr completo da
instalação de dependências, do reparo do binário do Electron e do E2E do WDIO é gravado em arquivos
de artifact, e o console do GitLab imprime apenas:

- o caminho do arquivo de log da etapa atual
- o run id, o exit code, o tempo decorrido e as contagens de sucesso/falha depois que o E2E termina
- o título e o resumo de erro dos cases que falharam
- o log de cauda quando não foi possível gerar o `summary.json`

Isso evita que os logs de alta frequência do WDIO / Electron / app-server estourem o stdout do job
no GitLab, mantendo ao mesmo tempo todo o material de investigação.

Quando for necessário ver a saída em tempo real, é possível sobrescrever
`ZCODE_E2E_CI_STDOUT_MODE` para `verbose` no web pipeline.

## Limites

- A entrada manual atual cobre dinamicamente os specs formais admitidos do direct-root de conversation `desktop-continuous` do desktop, os specs formais do domínio de plugins e cases de UI de desktop já promovidos que não dependem de provider, como o refresh da árvore de arquivos.
- `manual-review/pending` não entra nesta entrada; a falha da auditoria de admissão formal é bloqueada no portão mecânico contra uma promoção indevida.
- Os presets Docker históricos `conversation-session-admission`, `conversation-session-needs-docker-fix` e `conversation-session-tool-cross-product` saíram da configuração atual e não podem servir como fato de admissão formal do V4.
- O `replay-isolated` do Docker continua reservado para a admissão formal de Docker e para a navegação no ambiente de container; esta entrada roda apenas replay comum.
- A semântica de recuperação `web-remote-replayable` do `/remote` no celular continua coberta pela regressão específica de remote control e não é provada por este job.