# Plano de automação Docker de Conversation Session

Este documento define como o E2E formal de conversation do V4 entra na automação Docker. Os registros de execução da suite legacy histórica servem apenas como contexto e não representam mais o estado de admissão do preset V4 atual.

## Objetivos

- Permitir que um case que possua o contrato formal V4 atual e evidência Docker `replay-isolated` seja executado com um único comando dentro do contêiner `Dockerfile.desktop-e2e`.
- Manter o container smoke padrão leve por enquanto, evitando ampliar de uma só vez a duração da porta padrão e a superfície de instabilidade.
- Somente specs que satisfaçam simultaneamente a aprovação no caminho local padrão e o `replay-isolated` em Docker entram na Docker conversation suite.

## Docker Presets

O nome da suite comum é `conversation-session-verified` e ela cobre apenas as specs formais V4 direct-root que já obtiveram evidência verde de Docker `replay-isolated` no código e fixtures atuais.

Até 2026-08-10, `conversation-session-verified` está vazia; quando chamado, o script falha explicitamente e orienta a fazer a admissão de uma spec individual, em vez de executar silenciosamente um conjunto vazio ou um caminho antigo incorreto. Os Assistant Preview Cards já concluíram a revisão manual, a promoção formal e o replay local, mas a tentativa de Docker da spec individual falhou com `EOF` na requisição de token do Docker Hub ao resolver a configuração da imagem `docker/dockerfile:1.7`, e ainda não chegou à execução `replay-isolated` do WDIO; portanto não pode ser registrada como verified.

O CDD01 já foi migrado para o caminho formal, mas a execução individual em Docker `replay-isolated`
`packages/desktop/.e2e-artifacts/desktop-e2e-20260810-122428-44907/summary.md` deu `0/1 failed`:
ao copiar `.zcode/v2` houve corrida com a escrita atômica de `setting.json`, e o `setting.json.lock`
transitoriamente ausente causou `ENOENT`. Essa falha entrou no WDIO, não é um bloqueio de infraestrutura nem
uma evidência verde de admissão, portanto não pode ser registrada como verified.

Depois do conserto do filtro de cópia em 2026-08-11, a mesma spec individual foi executada novamente, e
`packages/desktop/.e2e-artifacts/desktop-e2e-20260811-080633-76555/summary.md` deu `1/1 passed`,
confirmando que o lock/arquivo temporário da escrita atômica de `setting.json` não bloqueia mais a migração. Esse
artifact prova no momento apenas a aprovação de `replay-isolated`; enquanto a revisão manual e a aplicação
formal da admissão não forem concluídas, ele continua não sendo escrito no preset `conversation-session-verified`.

Os presets históricos `conversation-session-admission`, `conversation-session-needs-docker-fix` e
`conversation-session-tool-cross-product` foram removidos. Para localizar um case, use `E2E_SPEC` indicando a
spec direct-root; somente após obter evidência verde ela pode ser registrada no conjunto verified com
`e2e:docker:admit`.

| Spec | Estado da migração |
| --- | --- |
<!-- conversation-session-verified-table-end -->

Entrada de execução:

```bash
pnpm run test:e2e:container:conversation
```

Equivalente, respectivamente, a:

```bash
E2E_SPEC_PRESET=conversation-session-verified pnpm run test:e2e:container
```

## Estratégia de execução em lote da suite

`conversation-session-verified` só pode servir como entrada de regressão em lote depois que pelo menos um case formal V4 concluir a admissão Docker. O script passa as specs da suite como `ZCODE_E2E_SPEC` separado por vírgulas para uma mesma execução do WDIO, reutilizando a mesma imagem, a mesma subida de contêiner e a mesma compilação do desktop app / agent server.

A execução Docker de spec individual serve apenas para provar a admissão e localizar falhas:

- Antes de um novo case entrar na suite, rode uma vez `replay-isolated` isoladamente, confirmando que seus próprios fixtures, sistema de arquivos e ambiente Docker formam um circuito fechado.
- Depois que o case entrou na suite, a CI e a validação em lote rodam `pnpm run test:e2e:container:conversation`.
- Só cases com capture real, injeção de falha, sensibilidade de desempenho/tempo, risco de poluir configuração global ou necessidade de rede/sistema de arquivos especial são separados em um preset próprio ou em uma execução Docker própria.

## Admissão de case individual

Uma nova spec formal não altera o preset diretamente. Primeiro prove, com uma spec individual, em Docker com replay sem rede:

```bash
E2E_SPEC=./test/e2e/conversation-session/<case>.test.ts \
  pnpm run test:e2e:container
```

Na primeira admissão da nova spec não defina `SKIP_IMAGE_BUILD=1`: a imagem Docker copia a árvore de trabalho atual e, se a imagem antiga não tiver a nova spec ou o novo fixture, o WDIO acusará `pattern ... did not match any file`. Depois que a mesma imagem já contiver a spec, as execuções seguintes podem usar `SKIP_IMAGE_BUILD=1` para acelerar.

Depois de passar, registre em `conversation-session-verified`:

```bash
pnpm --filter @zcode/desktop e2e:docker:admit -- \
  --spec ./test/e2e/conversation-session/<case>.test.ts \
  --verified \
  --artifact packages/desktop/.e2e-artifacts/<run-id> \
  --apply
```

`e2e:docker:admit` sincroniza `scripts/test-desktop-e2e-container.sh` e a tabela de suites deste documento.
Ele aceita apenas specs do caminho formal; `manual-review/pending` continua proibido de entrar diretamente em um preset Docker.

## Registros históricos de execução (caminhos legacy já invalidados)

Os registros abaixo ocorreram antes da reorganização do diretório formal V4 e provam o comportamento Docker dos arquivos e fixtures da época. As specs relacionadas foram depois movidas para `manual-review/pending`, portanto esses resultados não podem ser registrados como evidência verified do formal direct-root V4 atual nem restaurados como caminho de preset.

Em 2026-06-24, em `staging`, foi executado `pnpm run test:e2e:container:conversation`, com diretório de artefatos:
`packages/desktop/.e2e-artifacts/desktop-e2e-20260624-103921-58999`.

Essa validação executou em Docker `replay-isolated` as 13 specs conversation-session da época:
8 passaram e 5 falharam. As falhas foram movidas na época para o preset `needs-docker-fix`, hoje removido, e as 8 aprovadas entraram no preset verde antigo; nenhum dos dois é o conjunto verified V4 atual.

Em 2026-06-24, em `staging`, foi executado
`SKIP_IMAGE_BUILD=1 SKIP_DRIVER_PREFETCH=1 pnpm run test:e2e:container:conversation`,
com diretório de artefatos: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-105312-79607`.

Essa validação executou em Docker `replay-isolated` as 8 specs verdes: 8 passaram, 0 falharam,
com duração total de 3 minutos e 35 segundos.

Em 2026-06-24, em `staging`, foi executado
`E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/conversation-session-running-actions.test.ts pnpm run test:e2e:container`,
com diretório de artefatos: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-110228-90545`.

Após reconstruir a imagem Docker com a árvore de trabalho atual, a spec individual `conversation-session-running-actions`
passou em Docker `replay-isolated`: 1 aprovada, 0 falhas, com 19 segundos de duração no WDIO.

Em 2026-06-24, em `staging`, foi executado
`SKIP_IMAGE_BUILD=1 SKIP_DRIVER_PREFETCH=1 pnpm run test:e2e:container:conversation`,
com diretório de artefatos: `packages/desktop/.e2e-artifacts/desktop-e2e-20260624-110705-92301`.

Essa validação executou em Docker `replay-isolated` as 9 specs verdes, incluindo a recém-adicionada
`conversation-session-running-actions`: 9 passaram, 0 falharam, com duração total de 3 minutos e 54 segundos no WDIO.

Em 2026-07-09, em `feat/markdown-table-inline-scroll`, foi executado
`E2E_SPEC=./test/e2e/conversation-session/conversation-session-markdown-table-enhanced-scroll.test.ts pnpm run test:e2e:container`.

Essa admissão Docker não chegou ao replay do WDIO: na fase de build da imagem, o `apt-get install` recebeu
continuamente `400 Bad Request [IP: 198.18.0.158 80]` ao baixar vários pacotes Debian de `deb.debian.org`, e o
build falhou com exit code 100 na camada de instalação de dependências de sistema do `Dockerfile.desktop-e2e`. Esse
resultado não pode servir como conclusão de replay Docker de `conversation-session-markdown-table-enhanced-scroll`;
o case já concluiu o caminho formal, o replay default local, o replay com fixture case-local e o `e2e:fixture:check`.

Em 2026-07-09 esse case não obteve admissão Docker. `verified-local-docker-skipped` representa apenas que, na época,
o caminho formal e o replay local já tinham sido promovidos, e não que o Docker `replay-isolated` foi verificado; para entrar no conjunto verified atual, é preciso rodar de novo a admissão da spec individual com base na spec direct-root, no manifest e nos fixtures atuais.

## Limites de rede e de controle remoto

- Por padrão usa-se `E2E_NETWORK_MODE=replay-isolated`; dentro do contêiner não há acesso ao upstream DeepSeek real.
- Esta suite cobre apenas o comportamento de conversation `desktop-continuous` do desktop.
- A semântica de recuperação `web-remote-replayable` de `/remote` no celular não é verificada por esta suite e continua coberta pela regressão específica de controle remoto.

## Regras de admissão daqui em diante

Para que uma nova spec entre em `conversation-session-verified`, é preciso satisfazer simultaneamente:

1. a spec já foi migrada de `manual-review/pending` para `packages/desktop/test/e2e/conversation-session/`;
2. a spec alvo passa no caminho local padrão;
3. a spec alvo passa em Docker `replay-isolated`, mantendo o caminho do artifact no registro de execução ou na descrição do PR;
4. `docs/testing/conversation-session-e2e-coverage-matrix.md` já aponta para o caminho padrão;
5. o registro em `conversation-session-verified` é feito com `e2e:docker:admit`.

Specs em `manual-review/pending` são proibidas de entrar diretamente em um preset Docker.