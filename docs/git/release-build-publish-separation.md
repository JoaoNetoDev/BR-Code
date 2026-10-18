# Separação entre build de release e metadados de publicação

## Objetivo

O pacote instalador, a assinatura, a notarização, o blockmap e o `latest.yml` gerado pelo Electron Builder são concluídos na etapa de build. O log de release é editado pela infra diretamente via API no manifesto de atualização do diretório compartilhado; a confirmação manual do z-code CI apenas decide se o upload/publicação continua, sem ler o changelog do repositório nem reescrever o manifesto de atualização.

## Sequência atual do CI

```text
pnpm release（默认 release-it）
   version + CHANGELOG.md + release commit/tag/push
   |
   v
commit/tag
   |
   +--> build:macos/windows/linux
   |      installer + blockmap + 基础 latest.yml
   |      共享目录中的候选制品保持未注入 releaseNotes
   |
   v
   release:approve  <--- infra 完成日志编辑后人工放行
          |
          v
   release:validate
      校验六个平台 update YAML、日志、安装包摘要和 remote components
          |
          v
   release:upload:* (RELEASE_ARTIFACT_MODE=publish)
          |
          v
   CDN preload -> gray publish -> stable publish
```

Antes do `release:approve` não há chamada de upload oficial para o OSS nem à API de release. O instalador fica no diretório compartilhado do runner de CI; após o approve, o validate é executado primeiro e, só com a validação passando, o upload job faz a leitura.

## Limite do release-it

`pnpm release` executa apenas as capacidades de publicação padrão de `.release-it.mjs` e o `@release-it/conventional-changelog`: atualizar a versão, manter o `CHANGELOG.md` da raiz, criar o commit/tag de release e fazer push. O repositório não monta mais para o release-it plugins de reescrita por IA, revisão pelo Feishu ou geração local de `changelogs/vX.Y.Z*.md`; a cadeia de publicação do CI também não consome mais o `CHANGELOG.md` da raiz.

A edição do log é responsabilidade da infra e vai direto para o `latest.yml` no diretório compartilhado do runner. Depois que todos os builds terminam e a infra conclui a edição do log, o responsável pela publicação faz a liberação manual pelo gate `release:approve`; em seguida `release:validate` verifica de forma unificada a versão dos seis plataformas, o log não vazio, as referências do update YAML, o tamanho dos arquivos e os digests, exigindo que o remote manifest contenha exatamente as quatro plataformas `darwin-arm64`, `darwin-x64`, `linux-arm64` e `linux-x64` e que o `platformArch` interno corresponda ao nome do arquivo. Só com a verificação de integridade passando os upload jobs de cada plataforma leem o conteúdo mais recente do diretório compartilhado para fazer o upload.

`build:remote:assets` limpa, a cada coleta da versão atual, apenas os antigos `manifest-*.json` e `components/` da raiz compartilhada de publicação, sem tocar nos diretórios `macos-*`, `windows-*` e `linux-*` escritos pelas builds de plataforma em paralelo. Assim, um retry da mesma versão não mistura o remote manifest ou os componentes da rodada anterior no conjunto candidato atual.

## Arquivos-chave

- `scripts/ci-collect-artifacts.mjs`: apenas coleta e corrige os artefatos básicos, sem injetar release notes.
- `scripts/validate-release-artifacts.mjs`: após a liberação do approve e antes do upload, valida a integridade das seis plataformas e dos remote assets.
- `scripts/upload-oss.sh`: o upload oficial usa `RELEASE_ARTIFACT_MODE=publish` e lê do diretório compartilhado o manifesto editado pela infra; falta o `releaseNotes: |-` de nível superior resulta em fail-closed.
- `.gitlab/ci/50-release.yml`: `release:approve` confirma que o log da infra está pronto e, em seguida, `release:validate` fornece o gate de integridade unificado; os upload jobs de cada plataforma dependem do validate.

## Falhas e retries

- A infra ainda não escreveu o log no `latest.yml` do diretório compartilhado: não é possível clicar em approve; uma liberação antecipada faz a etapa de validate recusar a publicação.
- Divergência em versão, arquivo referenciado, size, sha512, conjunto de quatro plataformas do remote manifest ou remote component: a etapa de validate recusa a publicação.
- Falha de upload em uma única plataforma: não é preciso reconstruir; basta tentar novamente o upload job correspondente a partir do mesmo diretório candidato compartilhado.