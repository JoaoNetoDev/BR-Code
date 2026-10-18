# Orçamento de Leitura para a Contagem de Linhas de Arquivos Não Rastreados

Data de atualização: 2026-09-14

## Motivo e escopo

Nos logs do Windows 3.12.1, o Host apresentou diversas vezes um pico de memória fora do heap de
cerca de 2.67 GiB, acompanhado de refresh do Git. O `buildUntrackedStats` atual faz `readFile`
concorrente em todos os arquivos não rastreados e só identifica binários depois de carregar tudo
completamente. Na reprodução isolada, um arquivo binário de 256 MiB aumentou a memória fora do
heap em cerca de 256 MiB e, ao final, tudo retornou zero linhas. O limite de saída de 512 KiB do
`git status` restringe apenas a lista de caminhos e não o tamanho do conteúdo dos arquivos.

Esta correção trata da contagem de arquivos não rastreados no refresh do status do Git; não ajusta
comandos do Git, a contagem de arquivos rastreados nem a pré-visualização de diff.

## Contrato de comportamento

- O limite de contagem por arquivo é 1 MiB; arquivos acima do limite mantêm a entrada de mudança e
  usam `added=0, removed=0`, como os arquivos não contáveis.
- Texto comum mantém a contagem exata de linhas dentro do orçamento: arquivos vazios, LF, CRLF,
  ausência de quebra de linha final e quebras de linha entre blocos são suportados.
- O tipo e o tamanho do arquivo são verificados primeiro, e só arquivos comuns são lidos; no
  máximo 64 KiB são lidos por vez, e um NUL encontrado em qualquer bloco faz o arquivo ser
  tratado como binário, retornando zero linhas.
- Cada contagem usa no máximo quatro workers, cada um reutilizando um Buffer de 64 KiB; o total do
  buffer de leitura é de no máximo 256 KiB e não cresce com a quantidade de arquivos nem com o
  tamanho total.
- Quando o arquivo continua crescendo após a verificação, são lidos no máximo 1 MiB + 1 byte para
  decidir o estouro; havendo estouro, retorna zero linhas, e não uma contagem parcial.
- Deleção, falha de leitura e arquivos não comuns mantêm o fallback de zero linhas; handles
  abertos são fechados nos caminhos de sucesso, binário, estouro e exceção.
- Nenhum cache persistente, timer de background, segunda cópia do status do Git ou nova RPC é
  adicionado.

## Propriedade e ordem

```text
Refresh de Git existente em desktop/mobile Web/workspace remoto
  → GitCliRepo.getStatus do serviço onde está o workspace
  → entradas não rastreadas → quatro workers → verificação de tamanho → contagem em blocos → o mesmo snapshot de status
                                          └─ arquivo grande/binário/falha → zero linhas, entrada mantida
```

O orçamento de leitura e os workers pertencem apenas a uma consulta de repo; a coalescência existente
de requisições in-flight e a decisão da UI sobre resultados atrasados permanecem iguais. Os
caminhos de arquivo continuam usando workspacePath/repoRoot; nenhum cache de identidade é
adicionado e o isolamento por workspaceIdentity não muda. A implementação compartilhada de
services cobre Windows/macOS/Linux e execuções local e remota; não envolve o Agent runtime,
CommandInbox, owner, snapshot, nem os caminhos de desktop continuous ou mobile replayable.

## Contrato de verificação

- Testes unitários verificam a contagem de linhas de arquivos pequenos reais, a não leitura de
  conteúdo de arquivos acima do limite, a parada antecipada em binários, o limite de quatro
  workers, a corrida de crescimento e o fechamento de handles.
- As regressões existentes de Git repo/service verificam que as entradas e o comportamento
  staged/unstaged permanecem compatíveis.
- Arquivos pending do SP13 recebem uma regressão de recursos independente: após o refresh
  automático do watcher real, o arquivo pequeno passa a `+4 -0`, o texto acima do limite não
  conta linhas, e o pico do working set do Host é registrado; sem depender da navegação do Git
  pane.
- A sonda de memória antes da correção é repetida com os mesmos 8 arquivos binários de 32 MiB,
  para comparar o incremento de memória fora do heap.

## Verificação desta rodada (2026-09-14)

- Com os mesmos 8 arquivos binários de 32 MiB, executando direto o helper real: antes da correção
  o incremento de memória fora do heap era de cerca de 256 MiB, depois cerca de 0.3 MiB; nas duas
  vezes o resultado da contagem foi zero linhas.
- Git helper / repo / service: 35 testes unitários passaram; os novos testes de orçamento de
  leitura falhavam 4 e passavam 1 na implementação antiga e, após a correção, passaram todos.
- A regressão de recursos em macOS Electron real passou: após o refresh automático a barra de
  status ficou `+4 -0`, com incremento de pico do working set do Host de 1.648 KiB; uma repetição
  independente deu 464 KiB (1 case passou), sem chamada ao modelo. O relatório está em
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260914-041207-001/summary.md`.
- `pnpm typecheck`, `typecheck:e2e` do desktop, `pnpm lint` e
  `pnpm architecture:check --changed` passaram; o lint mantém as 42 warnings originais, sem
  errors.
- O cenário pending SP13 original de `Changes` abrindo o Git pane falhou nesta rodada e não chegou
  à leitura de arquivos grandes; a regressão de recursos adicional foi executada de forma
  independente, e não se afirma que o problema de navegação ou todo o cenário de pending foi
  corrigido.
- A auditoria de cobertura de conversation continua reportando I74/I75 como siglas desconhecidas,
  com contagem e documento gerado desatualizados; executar com o HEAD atual em um diretório limpo
  temporário reproduz os mesmos erros, e esta rodada não altera a linha de base da auditoria.
- Windows, Linux, controle remoto do mobile e workspace remoto não foram verificados em hardware;
  a implementação compartilhada de repo não alterou protocolo/isolamento de identidade, e o E2E
  dispara o refresh por mudanças de metadados do Git para ser compatível com a escuta não
  recursiva do Linux.

Comando da regressão de recursos executada de forma independente:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts \
  --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-git-review-entry.test.ts \
  --mochaOpts.grep 'Git 自动刷新'
```