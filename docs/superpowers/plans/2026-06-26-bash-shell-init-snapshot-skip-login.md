# Plano de Shell Init Snapshot e Skip Login no Bash

**Objetivo:** implementar a estratégia de shell init snapshot: a primeira toolcall do Bash usa login shell para gerar um snapshot `.sh` real; depois de fazer source do snapshot, pula o `-l`.

**Escopo:** afeta apenas o runtime da ferramenta Bash. O content visível ao provider, a exposição de tools, a descrição de tools e os system prompts de Explore/Main/Plan não mudam por causa deste plano.

## Semântica do ciclo de vida do snapshot

- O comando de criação é `shellPath -c -l <script de criação do snapshot>`.
- O env de criação inclui explicitamente o shell resolvido: `SHELL=shellPath`, `GIT_EDITOR=true`.
- Após a criação bem-sucedida, retorna-se apenas o caminho deste snapshot no processo atual, e registra-se um callback de cleanup que faz `unlink(snapshotPath)` no final.
- Antes de executar cada comando Bash seguinte, verifica-se se o caminho do snapshot ainda está acessível; se estiver, faz-se source do snapshot e usa-se `["-c", command]`; se não estiver, há fallback para `["-c", "-l", command]`.
- Cold resume / novo processo não restauram o caminho do snapshot a partir do disco nem vasculham snapshots antigos.
- A limpeza por retenção remove apenas arquivos `.sh` no nível superior de `shell-snapshots/` que excedam o cutoff padrão de 30 dias.

## Alvo ZCode

- POSIX e Git Bash suportam shell init snapshot; CMD e legacy shell mantêm o comportamento original.
- O arquivo de snapshot fica em `shell-snapshots/snapshot-${shell}-${timestamp}-${random}.sh` no storage do ZCode.
- O script de criação do snapshot grava o arquivo usando host path; o Git Bash só converte o path no source posterior do snapshot.
- O manager faz cache da promise de criação por adapter/root/shell/dialect; em caso de falha o cache é `undefined` e as chamadas seguintes continuam com fallback para login shell.
- O snapshot criado com sucesso no processo atual é limpo em `NodeExecutionAdapter.close()`.
- O retention cleanup é executado na construção do adapter, removendo `.sh` obsoletos do nível superior.
- O startup script do ZCode continua sendo um `.sh` interno separado, e a ordem de execução é: source do shell init snapshot -> source do startup script do ZCode -> comando do usuário -> trailer de captura de cwd.
- Não se habilita a injeção de alias find/grep/rg; a busca bundled em separado tratará isso depois.

## Checklist de Implementação

- [x] `shell-init-snapshot.ts`
  - [x] Criar um caminho de snapshot aleatório no nível superior.
  - [x] `getOrCreate()` retorna apenas snapshot pronto ou `undefined`.
  - [x] O creation script cobre source de rc, export de function/option/alias e export de PATH.
  - [x] O path de source do Git Bash usa `windowsPathToGitBashPath()`.
  - [x] Cleanup do processo atual e retention cleanup de 30 dias.
- [x] `index.ts`
  - [x] Criar/revalidar o snapshot de forma assíncrona antes do spawn.
  - [x] Quando o snapshot está pronto, fazer source dele e pular `-l`.
  - [x] O env de criação do snapshot usa o overlay do shell resolvido.
  - [x] Cancelamento/close durante a criação do snapshot não segue para o spawn do comando do usuário.
- [x] `bash-startup-script.ts`
  - [x] Suportar a inserção de um source opcional inicial antes do startup script do ZCode.
- [x] Testes
  - [x] Testes unitários do creation script cobrindo bash/zsh/no-rc/path do Git Bash.
  - [x] Testes unitários de cleanup cobrindo cleanup de processo e retention de nível superior.
  - [x] Testes de integração de exec cobrindo skip-login, fallback por snapshot ausente, fallback por falha de criação, env de shell resolvido, cancel/close e captura de cwd.
- [x] Documentação
  - [x] Atualizar `docs/runtime-tools/bash-effective-shell-snapshot.md`.

## Comandos de Validação

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters exec vitest run \
  tests/shell-init-snapshot.test.ts \
  tests/shell-init-snapshot-cleanup.test.ts \
  tests/bash-startup-script.test.ts \
  tests/exec.test.ts

pnpm --dir apps/zcode-cli --filter @zcode/adapters typecheck

git diff --check
```

Os gates de workspace completo permanecem:

```bash
pnpm lint
pnpm typecheck
```

## Limites

- Não grava env de marca adicional; implementa apenas a semântica de runtime do shell snapshot.
- Não implementa a injeção de alias `rg`/`find`/`grep`; essa capacidade depende de assets de busca bundled e será desenhada à parte.
- A varredura de cleanup é disparada no lifecycle do adapter, sem introduzir um orquestrador global de cleanup.