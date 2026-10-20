# Permissão do diretório revogada ainda é religada como sessão remota utilizável

Status: done

## Expectativa

O requisito de "falha de diretório individual" do guia SSH do desktop: quando o diretório não
existe, vira arquivo ou a conta atual não tem permissão de acesso, apenas aquele projeto
falha e informa que o diretório está indisponível; o dispositivo e os demais projetos ainda
podem ser recuperados. O diretório não é recriado automaticamente e o histórico não é apagado.

## Evidência atual

- Baseline de negócio: `a13999a28927f629d0c64080a5096cf8b4f23bae`, build do servidor, alvo SSH
  Linux independente.
- case: `conversation-session-ssh-remote-directory-resilience.test.ts`,
  `R3_DIRECTORY_FAILURE_CASE=denied`.
- Lote: `r3-server-20261009170002590-cabde7`, tarefa `directory-denied`.
- Passos: abrir A/B/C no mesmo dispositivo, salvar as conversas reais de A/B; voltar para B e
  desconectar ativamente; alterar as permissões de A para `000`; reconectar B.
- Resultado: B/C foram recuperados, mas o `remoteSessionId` de A continuava não vazio, sem manter
  o estado desconectado como "diretório indisponível". A asserção original falhou ao validar
  que A estava indisponível, e a asserção não foi afrouxada.
- Base estática: `prepareRemoteWorkspaceIdentity` chama apenas o `FileService.stat` remoto e
  verifica se o tipo é directory. No Linux, o `stat` da própria pasta ter sucesso não prova que a
  conta atual consiga percorrer ou ler o conteúdo dela; portanto essa verificação não cobre o
  caso de permissão da pasta folha ter sido revogada.

## Revisão da identidade de execução (2026-10-10)

- Lote `r3-server-20261009221305938-a3e800`, tarefa `directory-denied`.
- `directory-resilience.json` registra o UID do usuário SSH como 1000; em `/proc/<pid>/status` do
  Core, os UIDs real / effective / saved / filesystem são todos 1000; execução sem root.
- Para o mesmo usuário SSH, `test -r` / `test -x` sobre A retornaram `INACCESSIBLE` e `ls`
  retornou `READ_DENIED`.
- Após reconectar B, o `remoteSessionId` de A continuou não vazio, e a segunda execução com alvo
  independente reproduziu o mesmo comportamento. B manteve o caminho de ativação original e A
  não foi isolado com o estado de diretório indisponível. A negação real e o registro de religação
  da session estão no mesmo artifact do case, o que descarta um falso positivo causado por
  privilégios da conta de teste.

## Pendências da rodada de regressão original

A correção de negócio precisa verificar a relação entre acessibilidade do diretório e o portão de
recuperação; não pode considerar o diretório como utilizável apenas porque o `stat` da própria
pasta tem sucesso. Esta tarefa não modifica o negócio. A asserção que falhou permanece como
está, e a verificação posterior pode ser refeita com o mesmo case de falha independente.

Nesta rodada, conforme solicitado, apenas o registro foi feito, sem alteração da lógica de
negócio. A recuperação de permissão foi feita pelo finally do case; todas as falhas ocorreram no
alvo independente desse case.

## Correção da causa raiz (2026-10-10)

Os parágrafos acima preservam as evidências da rodada de regressão original. A correção foi
baseada em `5516284630ccff3552f37466266de270af661188`, cuja versão do código de negócio relevante
é igual à do baseline de teste original.

O `prepareRemoteWorkspaceIdentity` do Host passou a usar o `FileService.readdir` remoto já
existente para ler `diretório/.`. Metadados legíveis do diretório não significam conteúdo
acessível; o sufixo `/.` exige adicionalmente que o diretório de destino seja percorrível, evitando
que um diretório vazio com permissão somente de leitura `0400` seja liberado por um `readdir(diretório)`
comum. A identidade só é vinculada quando a verificação passa, e o caminho verificado não altera a
identidade original do projeto. O erro continua mapeado para o erro original de diretório
indisponível, fazendo falhar apenas aquele projeto; nenhum RPC novo é adicionado, não é exigida
atualização do Server e não é exigida permissão de escrita no diretório.

A regressão cobre a recuperação manual/automática sob permissões reais `000`, `0400` e `0100`, o
isolamento dos demais projetos do mesmo dispositivo, a nova tentativa após restaurar a
permissão, bem como diretórios `0500` legíveis e percorríveis, mas não graváveis. Antes da correção
6 asserções de recuperação de permissão falhavam; depois da correção, 32 testes unitários
direcionados passaram, incluindo o File RPC real e a proteção contra resultados tardios após
cancelamento.

Verificação final:

- `pnpm test:unit:affected --base 5516284630ccff3552f37466266de270af661188`: 405 arquivos Vitest,
  4911 casos de teste e 28 auditorias Node passaram.
- Checagem de tipos raiz, checagem de tipos do E2E, lint, checagem de arquitetura, checagem de
  fixture e checagem de formatação dos arquivos alterados passaram; o lint manteve 81 avisos
  preexistentes.
- macOS Electron → contêiner SSH Linux independente, `R3_DIRECTORY_FAILURE_CASE=denied`:
  `desktop-e2e-20261010-directory-fix-denied-serial` 1/1 passou. O UID 1000 sem root realmente não
  conseguiu ler/perorrer A; A foi preservado com session vazia, e B/C receberam novas sessions; a
  aviso de diretório indisponível, a nova tentativa no local após restaurar a permissão, a
  continuidade de conversa da tarefa original e a preservação do sentinela passaram.
  `directory-resilience.json`, capturas de tela, logs de execução e resumos de código-fonte/build
  foram salvos em `.e2e-artifacts` desse run.
- A rodada anterior `desktop-e2e-20261010-directory-fix-denied`, executada em paralelo com os
  testes unitários afetados, expirou na espera de readiness do Server durante a primeira
  instalação, sem ainda ter entrado na falha de permissão; os logs registraram também timeout de
  `ps` local. A evidência de falha foi mantida, e a reexecução isolada, após o término dos testes
  unitários, usando o mesmo build de correção, um novo HOME e um novo alvo SSH, passou — a
  primeira rodada não é registrada como aprovada nem apagada.
- O build da primeira rodada foi registrado como `fresh-stable`; a reexecução isolada reutilizou o
  build, com o registro original `unverified-reused-build`. Foi feita uma verificação cruzada
  adicional de que os resumos dos 5286 artefatos das duas rodadas são idênticos, e de que o resumo
  do código-fonte dos módulos de admissão da primeira rodada coincide com os arquivos de correção
  atuais; o resultado da verificação foi salvo como `source-reuse-verification.json` no artifact da
  reexecução, sem reescrever o status de build original.

Nesta rodada o E2E completo reexecutou apenas a variante de permissão que falhou; a remoção e a
conversão em arquivo são cobertas pelo registro do E2E completo original e pela comparação com
os testes unitários reais de sistema de arquivos/RPC desta rodada. Não foram revalidados o
Windows nativo, o relay móvel de ponta a ponta nem o desktop host Linux; não houve promoção
manual nem admissão em CI.
