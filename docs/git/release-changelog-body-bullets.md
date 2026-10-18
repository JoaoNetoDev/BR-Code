# Bullets no corpo do changelog de release

Data de atualização: 2026-05-08

`npm run release` usa o `release-it` para gerar o changelog de versão. A configuração de publicação foi migrada para `.release-it.mjs`, porque o `writerOpts.transform` e o template do `@release-it/conventional-changelog` exigem funções JavaScript, que não podem ser expressas em uma configuração JSON.

Regras de geração:

- o header do commit continua sendo agrupado por Conventional Commits, por exemplo `feat` vai para `Features` e `fix` para `Bug Fixes`
- bullets independentes no corpo do commit no formato `- xxx`, `* xxx` ou `+ xxx` são acrescentados abaixo da entrada daquele commit
- parágrafos que não são bullet não entram no changelog
- `BREAKING CHANGE` / `BREAKING-CHANGE` continuam sendo tratados pelo mecanismo de notes do conventional changelog e não são emitidos como bullets comuns de corpo

Exemplo:

```text
fix(web-remote): harden mobile reconnect flow

- add safe home-only services
- extend workspace reconnect timeout
```

Gera:

```md
* **web-remote:** harden mobile reconnect flow ([38dd68b](...))
  * add safe home-only services
  * extend workspace reconnect timeout
```

Implementação relacionada: `scripts/release-it/changelog-writer.mjs`.