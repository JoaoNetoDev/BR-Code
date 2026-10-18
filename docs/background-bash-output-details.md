# Detalhes da saída do Bash em segundo plano

## Contrato

A entrada de Bash em segundo plano pode abrir a aba `bash-output` à direita; o mesmo workspace scope, root session,
sessão efetiva e workId reutilizam a aba. A aba existe apenas em memória e não é restaurada para um novo runtime.
A entrada em subagentes lê o Bash da própria subsessão e não copia o diretório de tarefas em segundo plano para a
sessão raiz.

```text
Bash -> canonical output file
                 ^
visible selected tab -> scoped service -> V4 readonly query -> runtime -> execution port
                 |
                 +-> current status + bounded tail (8192 raw bytes)
```

Abrir/reativar consulta imediatamente e depois consulta a cada segundo, com no máximo uma requisição em trânsito.
Ocultar, trocar de workspace ou fechar interrompe a consulta e descarta resultados atrasados; fechar não cancela a
tarefa. Rolar para cima congela a exibição atual, enquanto a obtenção do tail mais recente e do status continua, mantendo
no máximo duas cópias de texto limitado: a janela congelada e a janela mais recente. Rolar manualmente de volta ao
fundo (mantendo a tolerância de 8px existente) ou clicar na seta flutuante para baixo consulta imediatamente, retoma o
acompanhamento e oculta a seta.
O estado terminal precisa ler o tail uma vez, depois que o estado terminal já foi confirmado, e então parar o polling,
mantendo a aba. Durante a leitura pausada não há salto.
Arquivo vazio e falha de leitura são estritamente distinguidos; em caso de falha o último conteúdo bem-sucedido é
mantido, o polling para e uma opção de retry é oferecida.

A área de detalhes usa uma região de saída em texto puro com fundo no estilo Bash, exibindo apenas uma dica leve de
status enquanto em execução.
Não exibe cabeçalho do comando, tempo decorrido, botão de parar, contagem de linhas ou de bytes; a parada continua
sendo feita pela entrada original do item em segundo plano.
A barra de status superior exibe apenas o estado de execução e o link para o arquivo completo, usando space-between com
alinhamento nas duas pontas: status à esquerda, link à direita (reaproveitando o Code Viewer), ambos com a mesma cor de
texto atenuada. Não exibe a dica de omissão do conteúdo antigo no tail, de forma consistente em zh/en; após o fim da
tarefa ou a quebra de linha em tela estreita o link continua à direita, e o caminho usa o workspace congelado na aba. O
contrato de leitura de tail de 8 KiB e de arquivo completo permanece inalterado.
Ao pausar o acompanhamento, um botão circular com seta para baixo é exibido de forma independente no centro inferior da
janela de saída, reaproveitando o tamanho, o estilo outline e os tokens de tema do "voltar ao final" da conversa.
O botão não ocupa espaço na barra de status nem no layout do corpo, fica fora da máscara; possui apenas ícone, e seu
nome acessível e seu title usam a tradução existente de "voltar ao final".
Ao clicar, o resume existente é executado: consulta imediata da janela mais recente e retomada do acompanhamento, sem
introduzir um outro conjunto de estado de rolagem/consulta.
A área de rolagem do corpo reaproveita o fade de 24px no topo e na base do `ScrollFadeViewport` compartilhado (extraído do componente
de feedback existente), desvanecendo apenas a extremidade que ainda tem conteúdo oculto.
A máscara CSS fica fixa nas bordas da viewport, e o texto que rola para fora da janela se torna gradualmente
transparente; a máscara não acompanha a rolagem do corpo.
Sem overflow não há fade; no topo e na base, respectivamente, a primeira linha e a última linha são preservadas; em
posição intermediária as duas extremidades desvanecem. A rolagem ou a mudança de tamanho atualiza a máscara sem alterar
os contratos de pausa de acompanhamento, retomada, consulta e estado terminal; a máscara não cobre o status superior, o
link do arquivo nem o botão flutuante, e é compatível com o tema da UI compartilhada e com o layout mobile.
Tanto no primeiro plano quanto em segundo plano, o componente restaura o julgamento simples baseado na posição de
rolagem; a restauração indevida causada por mudança de tamanho continua sendo um problema conhecido, com os limites
descritos em [前台输出视口与跟随](bash-background-parity.md#前台输出视口与跟随2026-09-10). Detalhes ocultos não
consultam.

```text
top: running                              full-file link
output viewport -> scroll up -> paused -> floating down arrow
                                          | click / scroll to bottom
                                          v
                            existing resume -> latest output -> follow bottom
```

## Limites de somente leitura

Novo `v4/conversation/backgroundBashOutput`; a requisição tem apenas sessionId/workId; a camada de serviço injeta a
conexão confiável e roteia por workspaceIdentity/remoteSessionId. A camada de execução fixa a leitura de tail em 8192
bytes, reaproveita a decodificação do Bash e não aceita caminho de arquivo nem limite de leitura fornecidos pelo usuário.
O Runtime delega ao registro de execução a validação do tipo Bash, da sessão proprietária e da identidade de segundo
plano.
A resposta de sucesso contém apenas kind, workId, status, output, truncated e outputPath; não retransmite o comando, os
tempos de início/fim, o exit code e o tamanho do arquivo, que os detalhes não exibem. O registro de execução guarda
apenas a marca de tipo Bash, sem reservar o texto do comando para consultas.
Erros distinguem unavailable/unsupported/read_failed. O estado é registrado antes da leitura, para evitar que a resposta
de estado terminal carregue o tail anterior à saída.
Os métodos obrigatórios do app facade são chamados diretamente; a capability de execução opcional e a fronteira do
protocolo antigo continuam retornando unsupported.
Os logs de RPC de polling bem-sucedido do Desktop Host passam pelo debug logger existente e não são gravados em disco
em execuções normais; as falhas continuam pelo caminho original de warn, e o nível dos demais logs de RPC não muda.
Nenhum protocolo ou configuração de log é adicionado.

A codificação da saída é resolvida uma única vez pelo `run()` do execution adapter, após a verificação de cancelamento;
o registro da tarefa guarda apenas o valor de codificação resolvido nessa ocasião, para ser reaproveitado na troca entre
primeiro e segundo plano e nos detalhes de estado terminal, sem reexecutar o `chcp` do Windows na criação do registro nem
na consulta.
O registro não mantém collector nem buffer de saída completo; a escrita direta em arquivo e a leitura limitada
permanecem inalteradas.

A observação reaproveita apenas o runtime existente, sem iniciar/retomar sessão, sem alterar o estado de consumo das
notificações e sem gerar requisições de modelo.
Depois que a tarefa some da lista de ativas, os registros de execution/runtime existentes ainda podem ser consultados; a
indisponibilidade do registro gera um erro explícito.
O corpo não entra em snapshot, event log ou persistência. Os contratos já existentes de TaskOutput, progresso de
primeiro plano, platform flags, watchdog de 5 GiB/5 segundos, Stop/close ativo com morte da árvore de processos e saída
natural permanecem inalterados.

Desktop continuous e mobile replayable continuam sendo determinados por attachment; a consulta não cria eventos de
topic/replay.
O Side Pane compartilhado continua usando o overlay existente no celular. A TUI não muda; o serviço genérico de
arquivos não é estendido.

## Aceitação

| ID  | Cenário                                              | Asserção |
| --- | ---------------------------------------------------- | -------- |
| BGV01 | Em segundo plano explícito, saída em dois blocos separados por barrier | ambos os blocos vistos antes da saída; cliques repetidos reutilizam a aba; nenhuma nova consulta de modelo; execução normal não registra log de polling bem-sucedido |
| BGV02 | converting to background por timeout, mais de 8 KiB, saída multilinha | o novo tail fica visível, o cabeçalho antigo é descartado e o arquivo completo não é truncado |
| BGV03 | rolagem para cima, ocultar/ativar, tarefa concluída | a pausa não salta, o retorno ao mais recente retoma; ocultar não consulta; o estado terminal é mantido e a atualização para |
| BGV04 | múltiplas sessões/workspaces, subsessão e scope remoto | as requisições sempre atingem o scope congelado, sem misturar saídas; tarefas/caminhos externos são rejeitados |
| BGV05 | arquivo ausente, resposta lenta, fechamento, saída do runtime | erro explícito mantendo o último conteúdo, sem sobreposição/atualização atrasada, sem iniciar o runtime |
| BGV06 | observar os detalhes após Stop no item original | os detalhes não têm Stop; após cancelar pela entrada original, a saída de estado terminal é mantida e o processo sai |

Os testes unitários cobrem schema, autorização do runtime, leitura de tail em arquivo real e codificação pelo adapter,
isolamento de abas e a temporização dos hooks.
O Desktop E2E usa fixtures de provider/file locais do caso e barrier; em 2026-09-10, após a confirmação do usuário por
demonstração ao vivo, os casos foram promovidos pelo fluxo de promotion.
Verificação de reaproveitamento do fade superior/inferior: em `desktop-e2e-20260910-142038-231`, BGV03 e o BDO07 de
primeiro plano passaram 2/2, cobrindo a máscara fixa da viewport, a direção das bordas de rolagem, ocultar/ativar e
pausa/retomada; 23 testes unitários de UI relacionados passaram.
Verificação da barra de status superior e do botão flutuante: em `desktop-e2e-20260910-144308-382`, BGV01/02/03
passaram 3/3, cobrindo a barra de status acima do corpo, o botão circular de ícone centralizado e flutuante sem
influência da máscara, e o comportamento existente de pausa/estado terminal/retomada;
o print `background-bash-paused.png` foi conferido. Testes unitários relacionados 10/10, typecheck, E2E typecheck e
verificação de arquitetura passaram; o lint ficou em 43 warnings já existentes e 0 erros. Esta rodada foi a verificação
no Desktop em macOS, sem execução da UI real em celular.
Verificação da retomada manual ao chegar ao fundo: `desktop-e2e-20260910-151014-649` reproduziu bottomGap=0 e
following=false antes da correção; após a correção, BGV01/02/03 em `desktop-e2e-20260910-151207-002` passaram 3/3,
cobrindo link com a mesma cor, ocultação da seta ao chegar manualmente ao fundo com a atualização continuando, novo
congelamento ao rolar para cima e restauração do botão no estado terminal.
Regressão dos contratos existentes de Bash em primeiro/segundo plano, TaskOutput, 5 GiB, Stop e expansão em primeiro
plano; não se executa o E2E global.

### Atribuição de execução das subsessões

Um subagent em execução compartilha a execution port ancestral; o registro de execução em segundo plano é mantido
sempre por esse adapter e não migra quando a subsessão é concluída.
Depois que o publisher da subsessão é liberado, uma sessão comum pode fazer cold resume e obter um bootstrap record
independente que mantém um novo adapter; portanto, um record existente não é necessariamente o owner da tarefa. A
consulta de saída parte da sessão da requisição e percorre os records existentes seguindo o parentID persistido,
chamando um a um o já existente readBackgroundBashOutput(workId, sessionId original): apenas quando o resultado é
unavailable continua-se a busca nos ancestrais; output, read_failed e unsupported são retornados diretamente; quando
nenhuma task corresponde, retorna-se unavailable. A própria consulta não pode fazer cold resume.
O registro de execução congela o trace.sessionId do momento de inicialização, e a consulta precisa casar workId,
sessionId original e o tipo Bash em segundo plano.
Nenhum índice de owner, migração de tarefa ou retenção de runtime é adicionado; os detalhes são totalmente somente
leitura, sem extensão da admission de comandos nem da capacidade de parar subsessões.
BGV04 mantém a aba de saída a partir da entrada de runtime, fecha os detalhes da subsessão e espera a liberação do
publisher; expande o histórico de execução da sessão pai, faz cold resume da subsessão pelo resumo do Agent e então
reativa a aba de saída já existente. O cold resume não adiciona um novo diretório de tarefas em segundo plano ao
histórico.
Este caso usa o grace real de 120s e o passo de limpeza de 60s; o WDIO envolve o timeout antes do test body, e por isso
apenas para esta spec foi configurado um orçamento externo de 360s, sem depender apenas do this.timeout do caso e sem
modificar temporizadores do produto.

```text
child query -> live child adapter -> unavailable -> existing ancestor adapter -> output
                       cada nível usa o child sessionId original para validar a titularidade da task
```

### Regressão de consulta com cold resume (2026-09-11)

- Antes da correção o teste de regressão de owner retornava unavailable; após a correção, 27 testes unitários
  relacionados de adapter/runtime/bootstrap e 5 testes de ciclo de vida do gateway passaram.
- Uma sonda real do adapter Node confirmou: antes e depois de adicionar o novo child adapter, o workId original
  retornou output/running.
- macOS / Node 24.14.0 Desktop BGV04: `desktop-e2e-20260910-190613-523` passou. O log registra, na ordem,
  `19:11:22.806Z` liberação do child publisher, `19:11:25.112Z` criação do cold resume e `19:11:26.059Z` conclusão do
  cold resume.
  No mesmo diretório, `background-bash-cold-resume.json` guarda a sessão filho/pai, o workId original, a contagem de
  requisições e a evidência dos dois novos trechos de saída; o caso também afirma que o producer estava vivo antes de
  sair, que a consulta não aumenta as requisições de modelo e que a saída final é mantida ao final.
- As execuções iniciais foram bloqueadas pelo orçamento externo de 120s do runner, pela entrada de histórico não
  expandida e pela pré-condição de que o cold resume não reconstrói o diretório de tarefas em segundo plano; após a
  correção das operações de teste, a reprodução isolada passou, e essas tentativas com falha não são contadas como
  execuções aprovadas. Outras 6 regressões de BGV do mesmo arquivo passaram na primeira rodada.
- Root/CLI bootstrap/E2E typecheck, fixture check e architecture (0 violations) passaram; lint com 41 warnings já
  existentes e 0 erros.
  Esta rodada não repetiu a verificação de UI no Windows/Linux nem no controle remoto por celular; não houve mudança
  em protocolo, leitura/escrita de arquivos por plataforma nem nos limites continuous/replayable.

## Verificação desta rodada (2026-09-09)

Relatórios locais salvos em `packages/desktop/.e2e-artifacts/`; o caso de fixture fixa a chamada de tool do provider, e
Bash, arquivos, barrier, processos e UI são execuções reais.

| Verificação | Resultado / diretório de relatório |
| --- | --- |
| Novos detalhes somente leitura, UI apenas de saída | 7/7, `desktop-e2e-20260909-121113-619` (com `background-bash-live.png`) |
| Dica de execução movida para a parte inferior | BGV01 1/1, `desktop-e2e-20260909-122021-611`; asserção de que fica abaixo da área de saída, imediatamente antes da dica de truncamento, e desaparece após o estado terminal |
| Escrita direta pelo Bash / refresh em primeiro plano / TaskOutput | 8/8, `desktop-e2e-20260909-120207-834` |
| Regressão de filtro do ciclo de vida do Bash | 8/8, `desktop-e2e-20260909-120412-010` |
| Parada de segundo plano existente do V4 | 1/1, `desktop-e2e-20260909-120552-318` |
| 5 GiB reais | escritas reais em primeiro e segundo plano: 5 GiB ainda vivos após 5,5 s de espera; ao acrescentar 1 byte o watchdog encerra, o processo sai e o diagnóstico e a notificação única passaram |
| Consulta real multiplataforma | macOS/Linux Node 24.14.0 com 2/2 cada; Windows Git Bash/CMD × explícito/timeout em segundo plano, Node 24.14.0 e 25.9.0 com 4/4 cada; descarte da janela de tail, zh/CRLF/sem quebra de linha, estado terminal e exclusão de arquivo passaram |
| Testes unitários e verificações | testes unitários direcionados de adapter/runtime/gateway/service/schema/hook/tab passaram; typecheck, build da CLI, architecture (0 violations) e lint (0 erros, 46 warnings já existentes) passaram |

O Windows usa um Node 24.14.0 independente dentro do diretório de teste, sem trocar o Node 25 padrão; os relatórios JSON
originais de plataforma estão em `.tmp/background-output-{macos,linux,windows24,windows25}.json`. A consulta somente
leitura de subsessão segue o parentID existente para achar o owner existente, sem modificar o CommandInbox nem o fluxo
de parada.

O caso de shutdown timeout existente do Node isolado apresentou `Worker did not start` (timeout de execução de 2
segundos) em uma execução paralela de teste; sem alterar a lógica de produção nem os limiares de teste, a reexecução
isolada do arquivo passou 5/5. Essa falha é registrada e não contada como uma execução aprovada.

Limites: não foi executado o E2E completo de UI do workspace remoto do Desktop nem do controle remoto por celular; o
scope e o comportamento continuous/replayable foram validados por testes unitários de service. A verificação no
Windows/Linux validou a cadeia real de execução/consulta, não a UI completa do Desktop. Os novos E2E foram promovidos em
2026-09-10 com a confirmação do usuário e ainda não passaram pelo admission de Docker. Não há codegraph no momento; a
superfície de impacto foi conferida pela cadeia de chamadas real e pelo mapa de funcionalidades.

Correção de reaproveitamento da codificação: 5 novos casos de regressão reproduziram primeiro a análise duplicada e a
sondagem antes do cancelamento; após a correção, a regressão relacionada da CLI teve 155 passed / 3 platform skips; a
barreira de arquivo assíncrona do novo caso de start excedeu o padrão de 1 segundo em execução paralela, e o teste
passou a esperar no máximo 5 segundos, com o grupo inteiro passando. A sonda real do adapter teve 5/5 no macOS Node
24.14.0 e 10/10 no Windows Node 24.14.0 / 25.9.0 (Git Bash/CMD); sem definir overrides de codificação, a contagem de
chamadas reais de `chcp` foi: uma em primeiro plano, uma em segundo plano explícito/por timeout e uma em start, zero
quando cancelado antes de iniciar, e zero em consultas múltiplas de detalhes.
Os registros originais estão em `.tmp/encoding-reuse-{macos,windows24,windows25}.json`.
Esta correção não envolve campos de UI ou de protocolo, e o Desktop E2E não foi reexecutado.

### Verificação de convergência da consulta (2026-09-10)

- Os testes unitários direcionados de resposta enxuta, validação de tipo Bash, scope, hook, nível de log e capability
  opcional somaram 75 aprovações; os 22 casos da CLI foram reexecutados com Node 24.14.0 e passaram.
- Desktop BGV01–BGV06 passou 7/7, relatório `desktop-e2e-20260909163455688-p59507-a912dda0f382e864`. A nova asserção de
  BGV01 confirma que o polling bem-sucedido não é gravado em disco durante o refresh real; o log completo do Desktop
  contém 334 outros registros de RPC, e o polling bem-sucedido de saída em segundo plano totalizou 0.
- Root typecheck, Desktop E2E typecheck, CLI adapter/bootstrap typecheck, verificação de arquitetura e verificação de
  formatação passaram; o lint da raiz ficou em 46 warnings já existentes e 0 erros. Ao passar o lint diretamente nos
  arquivos da CLI, o problema preexistente de max-lines do v4-bridge continua presente (HEAD 1579/atual 1585, esta
  limpeza removeu 1 linha); os demais arquivos afetados da CLI não tiveram warnings nem erros, e nenhuma regra do
  repositório foi afrouxada.
- Esta rodada não modifica interação de UI, ciclo de vida de execução ou operações de arquivos multiplataforma; nenhuma
  verificação nova de UI no Windows/Linux ou remoto/celular foi adicionada e os limites de verificação existentes seguem
  inalterados.

### Aceitação da promoção dos casos oficiais (2026-09-10)

- Após a confirmação do usuário com uma demonstração ao vivo longa, BGV01–BGV06 foram promovidos pelo promotion dry
  run, apply e coverage audit, totalizando 7 testes; não foram adicionados ao preset do Docker.
- Após a promoção, a reprodução com apenas common + fixture local do caso passou 7/7: `desktop-e2e-20260909-171215-094`;
  a reprodução com o fixture padrão também passou 7/7: `desktop-e2e-20260909-171508-564`. Ambas em macOS Node 24.14.0.
- O root typecheck final, o Desktop E2E typecheck, architecture (0 violations) e diff check passaram; o lint ficou em 46
  warnings já existentes e 0 erros. O fixture check passou, e `E2E_BGV_PARENT_DONE` é uma marca de saída de
  encerramento e não um request matcher, mantendo essa verificação.
- O workspace remoto / celular com UI completa, a UI do Desktop no Windows/Linux e o admission de Docker continuam sem
  cobertura adicional, e esta aceitação não amplia os limites de verificação existentes.

### Pré-condições de integração no staging (2026-09-10)

Após o refactor de Provider, o build do novo draft voltou ao modo build, e os casos BGV/BDO precisam definir
explicitamente Full access após cada criação de draft. Definir apenas uma vez no before da suite faz o segundo caso
parar na aprovação de permissões, e não se pode concluir daí que a atualização da saída falhou. Este item apenas fixa a
pré-condição de um teste de ciclo de vida já existente e não muda a política de permissões do produto.

Após integrar `origin/staging` `beb9751d9f`:

- foi restaurado o import de `createServiceLogger` ainda usado pelo polling de segundo plano do Host; a primeira
  verificação de tipo capturou a ausência e, após a correção, o root/E2E typecheck passou.
- 207 testes unitários relacionados passaram; uma execução paralela do direct execution estourou o timeout de 5
  segundos e, reexecutado isolado sem ajustes, o arquivo passou 16/16.
- Todos os 7 casos reais de BGV do Desktop, 1 caso de loading/expansão em primeiro plano e 3 casos de
  BDO02/03/07 passaram: `desktop-e2e-20260910-073512-809` (macOS / Node 24.14.0). O
  `desktop-e2e-20260910-073014-129`, anterior à correção, registra explicitamente o bloqueio de aprovação do novo draft
  `build` / `mode.build.highRisk` e não é contado como aprovação.
- Lint com 43 warnings / 0 errors e architecture com 0 violations; nesta rodada não foi feita cobertura multiplataforma,
  de controle remoto nem do conjunto completo de funcionalidades upstream.
- O conversation coverage audit global não passou; ao exportar o `beb9751d9f` puro de staging e rodá-lo de forma
  independente, os 9 erros de metadados de fixture anexo, referências antigas I03/I04, estatísticas e documento gerado
  foram idênticos aos do merge, e nenhum conteúdo de auditoria não relacionado foi alterado neste merge.