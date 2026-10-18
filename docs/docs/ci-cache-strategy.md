# Estratégia de cache de CI: persistência do workspace no lugar do GitLab Cache

> Documento de spec prévio. Este documento define a única estratégia legítima para caches de dependências Node como `.pnpm-store` / `.npm-cache` na CI,
> além das regras de validação do guard de regressão. Antes de alterar a estratégia de cache, é preciso atualizar este documento.

## 1. Contexto e problema

Medições reais (pipeline #260842, MR !1954, 2026-08-13) mostram que o tempo de vários jobs é consumido pela arquivamento/descompactação do GitLab cache:

| Job | Tempo total | restore_cache | archive_cache | Proporção |
| --- | --- | --- | --- | --- |
| `build:desktop:app` | 670s | 173s | 474s | 97% |
| `build:remote:assets` | 939s | 271s | 611s | 94% |
| `build:linux:arm64` / `x64` | 340s / 356s | 26s | 89s | ~34% |

Cadeia de causas:

1. **Não há servidor de cache compartilhado**. O log do job imprime explicitamente `No URL provided, cache will not be uploaded to shared cache server`;
   o zip do cache só existe no disco local do runner e nunca chega a outras máquinas.
2. **O workspace do shell runner é reutilizado entre jobs**. `GIT_CLEAN_FLAGS` já exclui `.pnpm-store/` `.npm-cache/`,
   e esses diretórios sobrevivem naturalmente entre dois jobs; a «descompactação por cima» do cache tem conteúdo idêntico ao do workspace, sendo uma ação puramente inútil.
3. **O inchaço da store amplifica o custo**. `.pnpm-store` acumulou 738.472 arquivos (a store do pnpm só cresce, nunca diminuiu;
   o workspace de um único runner já instalou a união das dependências de lockfile de todos os branches; `pnpm store prune` foi deliberadamente
   desabilitado por conflito de reflink com jobs paralelos (`ERR_PNPM_ENOENT`), ver o comentário maintain-node-cache em `.gitlab/ci/10-scripts.yml`);
   o custo de uma única arquivação piorou dos 40~60s estimados no comentário do template para 474s/611s.

Já existe contraexemplo validado no próprio repositório: no job de empacotamento no Windows (pull-only, sem acerto de cache local) o `pnpm install` leva apenas 25s;
no macOS, apenas 7,3s; o `ELECTRON_CACHE` (de vários GB) nunca passa pelo GitLab cache, dependendo inteiramente da persistência de workspace via `GIT_CLEAN_FLAGS`.
**«Persistência de workspace» é um padrão já validado e viável nas três cadeias Windows/macOS/Electron.**

## 2. Decisão

```
【Descontinuado】                          【Única opção legítima】
GitLab cache empacota deps Node           GIT_CLEAN_FLAGS exclusões + reutilização do workspace
  fim do job: enumera+comprime 730 mil arquivos   fim do job: nenhuma ação (0s)
  início do job: descompacta por cima do mesmo conteúdo   início do job: acerta direto no workspace (0s)
```

- **Caches de dependências Node (`.pnpm-store` / `.npm-cache` / `.next/cache`) nunca declaram GitLab cache.**
  A persistência de workspace (itens de exclusão de `GIT_CLEAN_FLAGS`) é a única fonte da verdade.
- **`packages/desktop/mock-cdn/` (binários de remote assets) também passa a persistência de workspace**;
  o gerenciamento de invalidação depende da lógica já existente de limpeza de releases antigos dentro do script `build:remote:assets`,
  e o mecanismo de agregação de chaves `remote-assets-cache-key.txt` que existia para servi-lo é descontinuado e excluído.
- Cold start (runner novo / workspace limpo) aceita uma `pnpm install` completa:
  medido em 25s (Windows, espelho npmmirror) a ~121s (macOS completo), desprezível frente ao desperdício de arquivamento.
- `.ci:maintain-node-cache` (verify de `npm cache` a cada 24h + isolamento/reconstrução com retry de store corrompida) é mantido,
  responsável pela saúde da store do workspace e pelo governance de disco.

## 3. Lista de alterações

| Arquivo | Alteração |
| --- | --- |
| `.gitlab/ci/00-workflow.yml` | Excluir os templates `.ci:npm-cache` / `.ci:npm-cache:pull`; acrescentar `-e packages/desktop/mock-cdn/` ao `GIT_CLEAN_FLAGS` |
| `.gitlab/ci/30-build.yml` | Remover todas as referências a cache em `build:desktop:app`, `.build:linux:template`, `build:remote:assets` (dois caches) e nos templates macos/cua-helper/web-remote-control/windows |
| `.gitlab/ci/remote-assets-cache-key.txt` | Excluir (mecanismo de agregação de cache key descontinuado) |
| `scripts/ci/ci-lint-pipeline.mjs` | Novo guard (regras em §4) |
| `scripts/test/ci-lint-pipeline.test.mjs` | Teste unitário do guard (node:test) |
| `docs/desktop-ci-cd.md` | Sincronizar a descrição de 00-workflow.yml (remover «npm/pnpm 缓存模板») |

## 4. Regras do guard anti-regressão

`node scripts/ci/ci-lint-pipeline.mjs` varre `.gitlab-ci.yml` e `.gitlab/ci/*.yml`, com as regras:

- **R1**: em qualquer declaração `cache:` (bloco, lista `paths:`, lista de flow, referência `!reference`), os caminhos
  não podem conter `.pnpm-store` / `.npm-cache` / `.next/cache`.
- **R2**: não pode haver referência `!reference` a `.ci:npm-cache` / `.ci:npm-cache:pull` (os templates foram removidos; sua presença é uma referência quebrada).
- **R3**: o `GIT_CLEAN_FLAGS` de `00-workflow.yml` precisa conter as exclusões
  `.pnpm-store/`, `.npm-cache/` e `packages/desktop/mock-cdn/` (pré-requisito da persistência de workspace; evita que uma remoção acidental zere todo o cache).

Se no futuro for preciso restaurar o GitLab cache para algum diretório, os critérios de decisão (só é permitido se todos forem atendidos, e é preciso antes atualizar este documento e o guard) são:
1. O diretório seria apagado pelo git clean de `get_sources` (não é possível depender da persistência de workspace); e
2. O custo de obtê-lo novamente for significativamente maior que o custo de arquivar/descompactar; e
3. Já houver um servidor de cache compartilhado configurado (caso contrário o cache fica sempre só na máquina local e a arquivação é trabalho jogado fora).

## 5. Governança do inchaço da store (camada de disco)

Após a troca de estratégia, o inchaço passa de «perder 20 minutos por pipeline» para «crescimento lento do disco». Opções de governança:

- **A (recomendada)**: pipeline agendada noturna no horário de baixa demanda, com um único job ocupando o runner, fazendo `rm -rf .pnpm-store` e reconstruindo
  (job único e exclusivo não tem conflito de reflink concorrente; o custo é a instalação completa do primeiro job do dia, ~2min).
- **B**: aceitar o estado atual e limpar manualmente quando o nível de água do disco do runner disparar alerta.

## 6. Efeito esperado

| Job | Antes | Depois |
| --- | --- | --- |
| `build:desktop:app` | 11m10s | ~25s |
| `build:remote:assets` | 15m39s | ~60s |
| `build:linux:arm64` / `x64` | 5m41s / 5m57s | ~4m05s / ~4m20s |
| Pipeline completo (MR) | ~34min | ~23min (caminho crítico é `build:windows:arm64`, 22.5min) |
