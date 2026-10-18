# Especificação de sincronização de versões dos plugins oficiais: node-repl-host / Browser Use 0.5.0 e Computer Use 0.6.0

> Data: 2026-09-17
> Estado: implementado e verificado
> Alterações relacionadas: Computer Use reconstruído com o SDK node_repl, o host node_repl extraído do Browser Use para algo independente
> Plugin oficial `@zcode/node-repl-host`.

Esta especificação cobre três pacotes ao mesmo tempo, porque desta vez a lista de fontes de verdade de versão deles **mudou estruturalmente**: das cinco fontes de verdade originais do Browser Use, a quinta, `NODE_REPL_SERVER_VERSION`, migrou junto com o host e passou a ser um registro próprio do node-repl-host. A série anterior `docs/browser-use/*-browser-use-plugin-version-*-spec.md`, que descrevia um plugin por versão, descrevia apenas um plugin e não consegue expressar a titularidade após a migração.

## 1. Decisões de versão

| Pacote | Versão antiga | Versão nova | Base da decisão |
| --- | --- | --- | --- |
| `@zcode/browser-use-plugin` | 0.4.2 | 0.5.0 | O conteúdo da unidade de lançamento mudou: o MCP server node_repl deixou de ser carregado por este plugin (`dist/mcp/server.js` saiu da lista do seed), restando ao plugin apenas a skill, o client runtime e a documentação. Isso é uma mudança na composição do artefato publicado, não uma correção de defeito, então é minor. |
| `@zcode/node-repl-host` | 0.4.2 | 0.5.0 | O contrato do host em si mudou: extraído de dentro do Browser Use para uma unidade de seed independente, com a superfície de ferramentas ajustada conforme a reconstrução do Computer Use com o SDK node_repl. Na extração ele herdou o 0.4.2 do Browser Use e, desta vez, foi elevado ao mesmo degrau minor, 0.5.0. |
| `zcode-cua` / `@zcode/zcode-cua-plugin` | 0.5.14 | 0.6.0 | Do lado do producer houve uma reconstrução quebradora (`feat(cua)!`: reconstrução da superfície de ferramentas, da entrada em segundo plano e da superfície de observação); o número de patch é insuficiente para que o downstream diferencie o producer antigo do novo. |

node-repl-host e Browser Use terem o mesmo número **é apenas coincidência de uma história em comum** e não configura acoplamento: os dois sobem de versão de forma independente, e isso já está registrado no próprio comentário de `NODE_REPL_SERVER_VERSION`.

## 2. Fontes de verdade de versão

### 2.1 Browser Use (quatro, mantidas à mão)

1. `apps/zcode-cli/packages/browser-use-plugin/package.json`;
2. `apps/zcode-cli/packages/browser-use-plugin/.zcode-plugin/plugin.json`;
3. Entrada `browser-use` em `OFFICIAL_PLUGIN_DEFINITIONS` do Bootstrap;
4. Entrada `browser-use` em `officialSeaPlugins` do SEA.

A quinta fonte original, `NODE_REPL_SERVER_VERSION`, já não pertence a este plugin — migrou com o host para o node-repl-host.

### 2.2 node-repl-host (cinco + um artefato, mantidas à mão)

1. `apps/zcode-cli/packages/node-repl-host/package.json`;
2. `apps/zcode-cli/packages/node-repl-host/.zcode-plugin/plugin.json`;
3. Entrada `node-repl-host` em `OFFICIAL_PLUGIN_DEFINITIONS` do Bootstrap;
4. Entrada `node-repl-host` em `officialSeaPlugins` do SEA;
5. `NODE_REPL_SERVER_VERSION` em `src/tool-contract.ts`, ou seja, o `serverInfo.version` do MCP.

Além disso, `dist-types/tool-contract.d.ts` é um artefato de declarações versionado no git, que precisa ser submetido em sincronia com o src.

node-repl-host não é um plugin voltado ao usuário: não tem skill, nem listing no marketplace, nem ícone, mas precisa estar sempre embutido no artefato de lançamento, caso contrário não haverá host para executar quando Browser Use ou Computer Use forem habilitados.

### 2.3 Computer Use (derivado por máquina, **não editar à mão**)

A fonte de verdade da versão do CUA é o `package.json.version` do producer resolvido a partir do pin do producer `@zcode/zcode-cua` no catálogo do pnpm. Todos os registros a seguir são reescritos atomicamente por `bump-zcode-cua-producer.mjs`; editar qualquer um à mão será julgado como drift por `check-version-coherence.mjs --check`:

- os dois aliases do catálogo em `pnpm-workspace.yaml` (`@zcode/zcode-cua`, `@zcode/zcode-cua-helper-runtime`);
- a resolução do catálogo e os metadados de resolution do producer em `pnpm-lock.yaml`;
- o `package.json` e o `.zcode-plugin/plugin.json` do wrapper;
- a entrada `computer-use` em `OFFICIAL_PLUGIN_DEFINITIONS` do Bootstrap;
- a provenance de commit/ref/skillSha256 em `upstream.json`;
- o ref do producer no contrato de implementação `docs/superpowers/specs/2026-08-14-cua-final-raster-integrity-contract.md`.

Subir a versão do lado do producer (repositório `zcode-cua`) exige alterar dois registros e reconstruir os artefatos: `package.json`, `plugin/.zcode-plugin/plugin.json` e o `dist/` versionado no git — a versão entra no bundle por define do esbuild `__ZCODE_CUA_VERSION__`, e o consumidor, ao receber apenas `dist/**` pela dependência git, fica com o número de versão antigo se não houver reconstrução. A reconstrução precisa ser feita sob o `node_modules` do próprio repositório; se `node_modules` for um link simbólico para um clone em outro lugar, o esbuild grava chaves de módulo como `../../../../zcode-cua/node_modules/...` e o gate `dist_freshness` fica vermelho.

## 3. Cadeia de lançamento e cache

```text
browser-use:     package / manifest / Bootstrap / SEA            = 0.5.0
node-repl-host:  package / manifest / Bootstrap / SEA / serverInfo = 0.5.0
computer-use:    catalog pin -> lock -> wrapper / Bootstrap        = 0.6.0
                         |
                         v
 filesystem / SEA / Desktop / remote official assets
                         |
                         v
 seed temp -> atomic promote -> <plugin>/<version>
                         |
                         v
 novo runtime entra em vigor junto com sua identidade de versão
```

O nome do diretório de cache oficial carrega o número de versão, então após a subida de versão o seed vai para um diretório novo; o diretório antigo pode ser mantido como cache histórico, mas o discovery oficial deve apontar apenas para a versão nova.

## 4. Limites de compatibilidade

- Não há mudança de protocolo nem de formas de dados existentes como `ToolResultPayload`; desta vez muda apenas a identidade de versão e seus pontos de sincronização.
- As especificações de versões históricas (`0.4.1`, `0.4.2` etc.) continuam registrando os fatos das versões antigas e **não são reescritas** para a nova versão.
- O comentário da entrada SEA do Browser Use antes fixava a versão vigente; desta vez passou a ter redação neutra em relação à versão, eliminando um ponto de drift desnecessário (o comentário da entrada document-skills no mesmo arquivo já era neutro).

## 5. Verificações mecânicas contra drift

| Ponto de verificação | Cobertura |
| --- | --- |
| `plugins.test.ts` «keeps every bundled plugin package, manifest, and seed version aligned» | Compara package / manifest / definição do Bootstrap plugin a plugin oficial |
| `build-sea.test.mjs` «keeps SEA official plugin versions aligned with package and plugin manifests» | Compara package / manifest / lista SEA entrada a entrada |
| `node-repl-host/test/mcp-server.test.ts` | Fixa `serverInfo.version` == `package.json.version` deste pacote |
| `check-version-coherence.mjs --check` | Fixa toda a cadeia do CUA (catálogo / lock / wrapper / definições oficiais / provenance do upstream / contrato de implementação) |
| `scripts/checks/dist_freshness.sh` do `zcode-cua` | Fixa que o `dist/` versionado no git reconstroi limpo, no mesmo commit, consistente com o src |

## 6. Verificação

Ver o registro de verificação deste commit: do lado do producer, typecheck / lint / testes unitários / dist freshness; do lado do consumidor, `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os testes do sub-workspace da CLI.