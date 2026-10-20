# zcode-cua incorporado ao monorepo z-code

## Objetivo

`@zcode/zcode-cua` (CUA producer: MCP server, runtime do Helper, `ax_native.node`, SDK do node_repl, Skill oficial) sai do repositório independente `git.example.invalid/codegeex/zcode-cua` e passa a morar em `packages/zcode-cua/` dentro do z-code, como um pacote comum do workspace:

- Os consumidores passam a usar `workspace:*` de forma unificada, sem pinos por SHA de git e sem precisar de credenciais de repositório privado como `ZCODE_CUA_GIT_TOKEN`.
- `dist/` não entra no git; é produzido por `pnpm build:cua`; o `prepare` da raiz e a instalação do CI constroem automaticamente.
- Os testes unitários, os evals e o e2e em máquina real da CUA passam a integrar o CI do z-code; o empacotamento do desktop do z-code usa diretamente os artefatos construídos dentro do workspace.
- A licença acompanha a do z-code (Apache-2.0) e o toolchain (TypeScript etc.) fica alinhado ao repositório raiz.

Baseline de importação: `zcode-cua@4a3c507dd16f3ed840e87bc92e709ce339e6a4f3` (v0.6.4), aplicado como um único commit de snapshot squash, com a nota de rodapé `Imported-From` registrando a origem.

## Diretório

```
packages/zcode-cua/
  src/            Código-fonte TypeScript (MCP server, broker, Helper, SDK); src/native/ é o código-fonte N-API do ax_native
  binding.gyp     Descrição de build do ax_native.node
  test/           Testes unitários vitest (projeto cua do vitest raiz)
  tests/          unittest do python, fixtures de paridade (mantém-se apenas amostras <1MB)
  evals/          zcode-gui-eval (lockfile independente, fora do workspace)
  scripts/        build / native / live smoke / gate de e2e em máquina real
  plugin/         Fonte única da verdade da Skill oficial (SKILL.md) e do plugin.json
docs/cua/producer/ Documentos do CUA producer válidos para o público
```

## O que não é trazido na migração

| Conteúdo                                                                                            | Motivo                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `dist/`                                                                                             | Passa a ser artefato de build                                  |
| CI do repositório independente (`.gitlab-ci*`, trailer de lore, merge gate, AI review, freshness do dist, package smoke) | Substituído pelo CI do z-code e pelas normas de MR           |
| remote smoke (act-verify remoto em Linux/Windows, portão remoto de frame-pixel)                       | Depende de máquinas remotas privadas, não é reproduzível dentro do repositório |
| Fixtures de paridade de grande volume (11 conjuntos de amostras ≥1MB e seus derivados)                | Tamanho do repositório; o oracle é aparado em conjunto e as amostras restantes ainda cobrem todos os caminhos de codificação |
| Documentos de processo internos (evidências de teste, planos, problemas conhecidos, fluxo de CI)      | Só são válidos para a manutenção de processo do repositório original |
| LICENSE MIT original, lockfile independente                                                         | Licença e bloqueio de dependências acompanham o z-code       |

## Versão e pinos

- Fonte única da verdade da versão da CUA: o `version` de `packages/zcode-cua/package.json`. Em tempo de build ela ainda é embutida em `SERVER_VERSION`.
- Ferramentas de pin removidas: `bump-zcode-cua-producer.mjs`, `check-cua-baseline.mjs`, `sync-skill-from-zcode-cua.mjs`, `upstream.json`.
- `check-version-coherence.mjs` lê diretamente o `package.json` do pacote do workspace e `plugin/`; a Skill do lado do plugin é sincronizada a partir de `packages/zcode-cua/plugin/`, e o guard de orçamento de 14 KiB é mantido.
- O nome do artefato do Helper para Windows, `@zcode/zcode-cua-helper-runtime`, é mantido como nome de artefato publicado e deixa de ser um alias de dependência npm.

## Cadeia de build

```
pnpm install
  └─ hook de instalação do zcode-cua: node-gyp compila ax_native.node (fora do macOS / em caso de falha: best-effort)
  └─ prepare da raiz: husky && pnpm build:cua
        └─ tsc -b tsconfig.build.json && node scripts/build.mjs  → packages/zcode-cua/dist
Consumidores (desktop / services / cli adapters / core / node-repl-host / zcode-cua-plugin)
  └─ resolvem @zcode/zcode-cua → dist/** pelo symlink do workspace
```

`typecheck`, `test:unit`, `dev:desktop`, `build:cua-helper` e a etapa de instalação do CI dependem de `dist` já existir.

O teste de regressão de dependências do eval verifica simultaneamente que a instalação do CI ocorre antes da execução do evaluator e que o `prepare` da raiz chama `build:cua` apontando para o producer do workspace. O CI não executa mais `pnpm build:cua` separadamente, e os testes não podem continuar exigindo esse comando removido.

O lint dentro do pacote usa o próprio `packages/zcode-cua/.oxlintrc.json` (regras padrão do oxlint, iguais às do repositório original) e não herda o `max-lines` da configuração raiz; o `pnpm lint` da raiz pula este pacote via `ignorePatterns`.

## CI

| job                  | Gatilho                                                                                    | Conteúdo                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cua:unit:macos`     | MR alterando `packages/zcode-cua/**` (liberado por `approve:merge-request`) ou pipeline manual web/api | install (o prepare da raiz constrói o dist) → typecheck + oxlint → projeto cua do vitest |
| `cua:eval:macos`     | O mesmo                                                                                    | Validação da definição do zcode-gui-eval, node test e todos os unittest do python |
| `cua:real-e2e:macos` | acionamento manual em MR / web / api; falhas não bloqueiam                                   | Sobe o broker do produto e roda o gate de e2e da CUA em máquina real   |
| Build/pacote do Helper | Regras existentes                                                                         | O SHA do producer vem de `CI_COMMIT_SHA` e a versão vem do pacote do workspace |

Docker / Jenkins não reescrevem mais a URL do git nem injetam credenciais do zcode-cua (o `zcode-cua.gitlab-read` do Jenkins pode ser removido):

- web-share: em tempo de execução e de build não há nada de CUA; a imagem não contém git e não copia `packages/zcode-cua`.
- web-remote-control v4: coloca `packages/zcode-cua` no contexto de build e, após `pnpm install --ignore-scripts`, executa `pnpm build:cua` antes de construir o Web.

As duas imagens instalam com `--ignore-scripts`, o que naturalmente pula a compilação nativa.

## Verificação

- Após `pnpm install`, `packages/zcode-cua/dist` e `ax_native.node` existem.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (incluindo o projeto cua) e `pnpm verify:pre-push` passam.
- `pnpm build:cua-helper` consegue produzir o Helper.
- `ZCODE_CUA_DEV_MODE=1 pnpm dev:desktop` consegue subir o Helper e completar uma chamada CUA real.
