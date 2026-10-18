# Matriz de Cobertura E2E de Escrita Atômica de File Tools

## Escopo

Esta matriz cobre o caminho real de sistema de arquivos dos file tools da CLI até `NodeFileSystemAdapter.writeTextFile`, com o objetivo de evitar que `Write` / `Edit` percam o bit de execução ao modificar scripts executáveis já existentes.

A matriz tem duas camadas: `FT-AW-01` a `FT-AW-03` são regressões determinísticas no nível CLI/adapter, que não entram no fluxo `manual-review/pending` de conversation-session; `FT-AW-04` é um candidato a replay de conversation-session aguardando revisão manual e re-promoção, que usa uma fixture DeepSeek local do caso e o case manifest para validar o comportamento de permissões em uma sessão desktop real, mas não faz parte do quality gate padrão.

Critério de implementação: a escrita padrão com `atomic: true` de `NodeFileSystemAdapter` usa arquivo temporário com `O_NOFOLLOW`, cópia das permissões do arquivo original, sync e rename; se o caminho atômico falhar, o temporário é limpo e há fallback para escrita não-atômica do arquivo alvo com `O_TRUNC`. Esse fallback pode truncar o alvo existente em caso de erro de disco inesperado; nesta rodada de regressão de permissões aceitamos temporariamente esse comportamento, sem adicionar salvaguardas extras nem hooks de fault-injection na implementação.

Esta matriz cobre apenas a preservação de permissões e a recusa de symlink; não cobre `ZCODE_E2E_FS_FAULTS`, recuperação de falhas de temp/rename atômico nem semântica de disco cheio. Essas falhas de armazenamento continuam pertencendo à confirmação de semântica de produto `D02`.

## Índice de Casos

| ID | Status | Spec / harness | Setup | Ação | Asserção |
| --- | --- | --- | --- | --- | --- |
| FT-AW-01 | covered | `apps/zcode-cli/e2e/file-tools-atomic-write/run.mjs` / `write-preserves-executable-mode` | Workspace temporário POSIX; `write.sh` existente com `0755`; read state preparado para `Write` | Chamar `writeToolEntry.handler` do dist compilado para sobrescrever o conteúdo do arquivo | Conteúdo do arquivo atualizado; mode continua `0755` |
| FT-AW-02 | covered | `apps/zcode-cli/e2e/file-tools-atomic-write/run.mjs` / `edit-preserves-executable-mode` | Workspace temporário POSIX; `edit.sh` existente com `0755` | Chamar `editToolEntry.handler` do dist compilado para substituir o texto | Conteúdo do arquivo atualizado; mode continua `0755` |
| FT-AW-03 | covered | `apps/zcode-cli/e2e/file-tools-atomic-write/run.mjs` / `write-rejects-symlink-target` | Workspace temporário POSIX; `link.sh` apontando para `target.sh` | Chamar `writeToolEntry.handler` do dist compilado para escrever no caminho do symlink | Lança `Refusing to write through symlink: ...`; o conteúdo do target real não é reescrito |
| FT-AW-04 | partial | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-file-tools-atomic-write.test.ts` / `Write 和 Edit 修改可执行脚本后应保留 POSIX 执行位` | Workspace padrão Electron/WDIO; dois scripts existentes com `0755`; replay de provider local do caso fixando `Read -> Write -> Read -> Edit` | Enviar prompt pela UI, com o conversation runtime real executando os tool handlers `Write` e `Edit` | A spec candidata já tem asserções de UI, conteúdo e mode; precisa de revisão manual conforme o comportamento atual do V4 e de promoção antes de entrar no gate E2E padrão |

## Comandos de execução

Executar a partir da raiz do repo:

```bash
pnpm --filter @zcode/contracts build
pnpm --filter @zcode/shared-types build
pnpm --filter @zcode/adapters build
pnpm --filter @zcode/core build
node apps/zcode-cli/e2e/file-tools-atomic-write/run.mjs
```

No Windows, `run.mjs` retorna skipped, porque o Windows não tem uma semântica de mode equivalente ao POSIX `0755`.

Replay E2E em nível de janela:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-file-tools-atomic-write.test.ts
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-file-tools-atomic-write.json \
  pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-file-tools-atomic-write.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-file-tools-atomic-write.test.ts'
```

Caso `FT-AW-04` venha a ser incluído no suite Docker `conversation-session-verified`, executar também a admissão em container:

```bash
E2E_SPEC=./test/e2e/conversation-session/conversation-session-file-tools-atomic-write.test.ts pnpm run test:e2e:container
pnpm --filter @zcode/desktop e2e:docker:admit -- --spec ./test/e2e/conversation-session/conversation-session-file-tools-atomic-write.test.ts --verified --artifact packages/desktop/.e2e-artifacts/<run-id> --apply
pnpm run test:e2e:container:conversation
```

## Decisão de lifecycle

- `manual-review/pending`: `FT-AW-04` está atualmente nesse diretório e só pode servir como evidência candidata. Embora a semântica venha de um bugfix de sistema de arquivos já confirmado, ainda precisa passar pela revisão de replay no V4 atual antes de ser promovido.
- `fixtures/upstream` / `fixtures/cases`: `FT-AW-01` a `FT-AW-03` não são usados; `FT-AW-04` precisa usar a provider fixture local do caso e o case manifest, fixando o contrato de chamadas de ferramentas `Read -> Write -> Read -> Edit`.
- `e2e:fixture:check`: execução obrigatória para `FT-AW-04`, para provar que fixture, manifest, spec marker e contrato de requisição estão consistentes.
- `e2e:promote`: depois da confirmação manual de que as asserções de UI / network / snapshot do V4 atual estão estáveis, usar esse fluxo para promover `FT-AW-04` de volta ao diretório padrão de conversation-session e sincronizar o status desta matriz.
- Docker admission: usado apenas quando `FT-AW-04` precisar entrar no suite de container `conversation-session-verified`; antes disso é obrigatório passar no `replay-isolated` de spec única e depois sincronizar o preset Docker e a documentação de admissão com `e2e:docker:admit`.
- `pnpm --filter @zcode/desktop typecheck:e2e`: mantido como gate final de lifecycle, para impedir que as mudanças nesta infraestrutura de teste quebrem o ambiente de tipos do E2E.