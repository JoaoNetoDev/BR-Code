# Correção da Ordem do Histórico de Ferramentas

2026-09-10, com base em `origin/staging` no commit `fa70e896834a88e17290739c54995437b03aceee`.
Escopo da implementação: as escritas existentes de ToolPart passam a anexar o índice de declaração, e o hydration do histórico do provider escolhe o registro mais recente de cada chamada, restaurando depois a ordem de declaração.

## Causa Raiz

`model.ts` aceita e deduplica as declarações de ferramentas, e o histórico live submete chamadas e resultados na ordem de declaração.
Ferramentas somente leitura podem executar antes do fim do stream; mas o `part.sequence` do SQLite é determinado pela primeira escrita.
O hydration original usava diretamente a ordem do SQLite, fazendo com que o histórico do modelo em resume, edit/rewind e fork diferisse do live.

```text
模型声明     Bash(0) ---------> Read(1)
执行时机     等待 finish         提前执行
首次落盘     后写 Bash           先写 Read
live         calls [Bash, Read] -> results [Bash, Read]
旧 hydrate   calls [Read, Bash] -> results [Read, Bash]
修复 hydrate calls [Bash, Read] -> results [Bash, Read]
```

A inversão foi reproduzida com SQLite real e um ModelFactory controlado antes da correção: tanto a solicitação de cold recovery após conclusão normal, erro de ferramenta e queda de stream recuperável quanto os testes de ordenação, erro/interrupção e fork da hydration pura falhavam primeiro.

## Contrato de Dados e Comportamento

- ToolPart ganha no topo o campo opcional `declarationIndex?: number`, cujo sentido é a ordem das chamadas executadas pelo cliente aceitas pelo runtime dentro do mesmo assistant, começando em 0; declarações repetidas e providerExecuted não consomem índice.
- O caminho de streaming reaproveita o `acceptedToolCalls` já deduplicado, e os caminhos normal/de recovery reaproveitam `coreToolCalls`.
  O índice é salvo no JSON de part.data junto das escritas existentes de pending, running e completed/error.
- A lógica de ordenação não adiciona leitura/escrita de armazenamento, não move pontos de escrita e não introduz filas, awaits, registro de partID, timeouts ou catch.
  `onStreamToolCall` continua retornando de forma síncrona; a falha da execução antecipada continua com o catch existente fazendo fallback para a execução após o fim do stream.
- O fallback após exceção na execução antecipada e o synthetic recovery mantêm o comportamento existente de criar nova part, preservando o mesmo
  `callID` e `declarationIndex`; o partID da tentativa que falhou não é registrado, passado nem reutilizado.
- O hydration do modelo, dentro de cada assistant, seleciona por `callID` a part criada por último, com base na ordem de persistência original, sem comparar hora de atualização nem priorizar o estado de sucesso. Se a part mais recente for pending/running, mantém-se o interrupted result; o mesmo callID em mensagens diferentes não é mesclado.
- O índice é gerado pela enumeração do runtime; quando todas as parts selecionadas têm índice, a ordenação é feita e lacunas são permitidas; quando todos ou alguns estão faltando, preserva-se a ordem relativa original das parts selecionadas. Calls e results compartilham o mesmo resultado de seleção e ordenação.
- Não muda o SQL sequence, o message.parts original, o transcript da UI nem o agendamento/permissão/cancelamento/resultado das ferramentas.
  Não muda o protocolo V4 nem os limites de desktop continuous e celular replayable.
- O fork reaproveita a cópia de parts existente e o remapeamento de IDs; índices numéricos não são referências de ID entre mensagens e não exigem nova lógica de fork.
- Versões antigas podem ignorar esse campo JSON. Uma versão antiga reescrevendo a mesma part pode perder o campo, e a nova é compatível com as regras dos registros antigos.

## Verificação

- core `tests/tool-history-order.test.ts`: ordenação válida, legacy/parcialmente ausente, múltiplas tentativas da mesma chamada, estado mais recente de sucesso/falha/não concluído, isolamento entre mensagens, lacunas, array original inalterado e remapeamento de callID no fork.
- core `tests/runtime-streaming-tool-part-identity.test.ts`: fallback com sucesso, com falha, nova falha de escrita, synthetic recovery e início de batch atrasado; o registro original pode ter várias entradas, mas o histórico do modelo tem apenas uma chamada e um resultado.
- bootstrap `tests/tool-fallback-read-state.test.ts`: SQLite real e handlers de Read/Edit, em que o mesmo arquivo é lido primeiro por outro Read, depois modificado por uma ferramenta tipo Bash e por fim lido pelo Read de fallback; o histórico do modelo permanece consistente após cold recovery e rewind, e o Edit executa com sucesso usando o snapshot lido mais recente.
- bootstrap `tests/tool-history-order.test.ts`: SQLite real, com read escrito primeiro e write depois; as calls/results da requisição live real, da requisição cold após fechar e reabrir o banco e da próxima requisição após rewind são idênticas.
  Cobre também conclusão normal, erro de ferramenta, synthetic result de queda de stream, escrita pending lenta/rejeitada e Stop.
  A escrita lenta é controlada por deferred, provando que os eventos de modelo seguintes continuam sendo consumidos; não depende de sleep para especular sobre condição de corrida.
- Desktop D19: uma rodada anterior completa Bash→Read, envia uma pergunta seguinte e então edita a pergunta mais recente; compara o tool_use/tool_result real do provider.
  O caso está em manual-review/pending, com fixture synthetic, aguardando revisão manual.
- Aprovado: 20 novas regressões, 218 testes existentes de hydrator/runtime-tool-loop/session-fork,
  `pnpm typecheck`, `pnpm lint` (43 warnings já existentes), verificação de arquitetura, verificação de tipos de contracts/core,
  verificação de tipos de Desktop E2E e verificação de fixtures.
- Replay D19 em Electron macOS aprovado (1/1), com as requisições reais atingindo `d19-tools`, `d19-followup`,
  `d19-title`, `d19-later` e `d19-edited`, sem falta de fixture. Relatório:
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260910122250619-p1669-f4f6ced2e19e5429/summary.md`.
  Casos aguardando revisão não contam como cobertura formal de E2E; Windows/Linux e remoto do celular não foram executados.
- O runner de casos pendentes usa por padrão uma janela de 240 tokens, o que dispara compact adicional. Este caso compara histórico não comprimido e precisa usar a janela de
  128000 tokens. A primeira preparação falhou por falha de resolução do caminho relativo do fixture, e a segunda por compact não configurado devido à janela pequena padrão; o comando abaixo
  passou depois de corrigidas as condições de preparação e não envolve ajuste de código de produto.

```sh
ZCODE_E2E_MANUAL_REVIEW=1 \
ZCODE_E2E_DEEPSEEK_CONTEXT_WINDOW=128000 \
ZCODE_E2E_DEEPSEEK_MAX_OUTPUT_TOKENS=32768 \
E2E_PROVIDER_HTTP_MODE=replay \
E2E_PROVIDER_REPLAY_FIXTURE_PATH="$PWD/packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-tool-history-order.json" \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-tool-history-order.test.ts
```

### 2026-09-11: escolher a tentativa mais recente por chamada

- Regressões primeiro, código depois: antes da modificação, 19 de 25 testes direcionados falhavam, incluindo Read/Edit reais reportando stale incorretamente após cold resume e rewind; após a correção, os 25 passaram.
- Executados 10 arquivos de teste relacionados com o código atual de core, SQLite e adapters de sistema de arquivos, com 335 testes aprovados;
  cobrindo histórico do modelo, fallback, queda de stream, cancelamento, fork, estado de arquivo e hydration do transcript da UI.
- Replay D19 synthetic em Electron macOS 1/1 aprovado; o runner reconstruiu desktop e Agent e continuou verificando
  a consistência de calls/results na live, na pergunta seguinte e na requisição após edição. Relatório:
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260911095916848-p74882-7ee773cd74562b10/summary.md`.
- Build do core, typecheck da raiz, lint da raiz, verificação de arquitetura, verificação de tipos de Desktop E2E e verificação de fixtures aprovados.
  O lint da raiz tem warnings já existentes; os erros do lint isolado do core estão nas mesmas posições/regras de antes da correção e incluem os arquivos longos originais.
  Na verificação estrita manual dos testes novos/modificados, os erros restantes vêm apenas de `test-runtime-model.ts`,
  `test-agent-runtime.ts` e `runtime-output-token-continuation-test-helpers.ts`, que não foram alterados.
- E2E de Windows/Linux e remoto do celular não foram executados; D19 continua como caso pendente de revisão e não é promovido nesta rodada.

## Limites de Escopo

Esta correção restaura somente a ordem dos registros de ferramentas que têm um índice de declaração completo; ela não consegue reconstruir dados antigos nem garantir que todos os cache miss
desapareçam. Múltiplas parts com o mesmo callID são mescladas apenas no hydration do modelo; nenhum registro do banco é removido ou migrado, e o conjunto de chamadas não persistidas no momento do Stop não muda.
O estado de leitura de arquivos e a UI continuam consumindo as parts originais.
Os contratos de fallback e de recuperação de queda de stream estão em
[Fluxo de Ferramentas em Streaming e Recuperação](../../../../apps/zcode-cli/docs/design/v2/model/streaming-tool-execution-and-recovery.md).

Reutilizar o partID de uma tentativa que falhou preservaria a posição da primeira inserção, fazendo com que uma leitura de fallback do mesmo arquivo concluída mais tarde fosse sobrescrita por outro Read mais antigo ao restaurar o estado do arquivo. Por isso preserva-se a ordem existente dos registros de execução da nova part, corrigindo apenas a seleção do histórico do modelo:

```text
原始 parts：Read A(pending,1) -> Read B(old,2) -> Bash(0) -> Read A(new,1)
                         |
         +---------------+------------------+
         v                                  v
模型 hydrate：同 callID 取最后 part     文件状态：原顺序的 completed parts
再排序 Bash(0), A(new,1), B(old,2)      B(old) -> A(new)，恢复 new
```