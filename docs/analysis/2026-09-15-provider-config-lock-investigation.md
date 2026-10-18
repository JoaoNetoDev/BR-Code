# ZCT-2099792881319157760: investigação de lock de arquivo de Provider e desaparecimento de configuração

- Data da investigação: 2026-09-15.
- Evento principal: 2026-09-13, desktop Windows 3.12.1, build de release `dfc10615`.
- Material: anexo de feedback `284720`, `zcode-logs-full-20260915-173012.zip`. Foram revisados seis logs de execução Desktop / CLI dos dias 13 a 15 de setembro, somando 58.443 linhas.
- Escopo: investigar a falha de lock de arquivo de configuração, o desaparecimento de Providers pessoais e o comportamento de recuperação do dia 13 de setembro. A falha de validação de configuração do dia 15 de setembro foi confirmada pelo acompanhaodor de feedback como alteração manual da configuração pelo usuário e tratada como problema separado.
- Status: relatório de investigação, sem correção implementada. Os defeitos de degradação e de recuperação da configuração foram confirmados; o fator disparador específico das repetidas expirações de lock no ambiente real ainda não foi definido.

Conclusão: vários processos fazem polling exclusivo do mesmo arquivo de configuração de Provider pessoal, o que gera uma corrida persistente entre leitores. No ambiente real houve, em alguns períodos, expirações no aquisição do lock, e a camada de leitura converte a exceção em configuração pessoal vazia, o que faz Providers desaparecerem do estado disponível e pode bloquear a execução de mensagens seguintes. Depois que a leitura se recupera, pode ainda faltar a notificação de recuperação porque a versão do conteúdo em disco não mudou. O atraso de operações anormais no domingo tem relação com a minimização frequente, mas os materiais existentes não permitem determinar se o atraso veio de agendamento do sistema, I/O, carga de jogo ou bloqueio de tela.

## 1. Reconstituição completa do caminho do problema

### 1.1 Arquivos e estados envolvidos

| Objeto                                     | Função                                          | Relação com este problema                                                         |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `provider_config.json`                   | guarda a configuração de Providers pessoais, regras de modelo etc.             | arquivo alvo das falhas de leitura                                                   |
| `provider_config.json.lock/owner-*.json` | implementa lock exclusivo entre processos com diretório e arquivo de owner           | mesmo em polling puramente de leitura, cria, escreve e apaga esses metadados de lock                             |
| Provider Registry em memória               | fornece os Providers disponíveis para config de modelo, seleção de modelo e runtime | pode receber uma configuração pessoal vazia e continuar com o estado degradado após a recuperação da falha                       |
| `setting.json` e seu lock de arquivo independente | guarda preferências do aplicativo, último workspace etc.                | salvamento repetido é uma descoberta secundária; não ocupa diretamente o lock do arquivo de Provider                         |
| Banco SQLite de sessões                            | guarda sessões e dados relacionados                            | pertence a um mecanismo diferente do lock de diretório dos arquivos JSON acima; não há evidência de que uma falha de migração tenha disparado diretamente esta falha |

### 1.2 Cadeia completa

```text
Host e múltiplos Agents usam o mesmo caminho de Personal Provider config
Cada Repository agenda por padrão um polling a cada ~1 segundo
                         ↓
Leitura e atualização usam a mesma lock exclusivo, e os leitores esperam entre si
Toda aquisição bem-sucedida precisa criar o diretório, escrever o owner e reconfirmar a propriedade
                         ↓
Em alguns períodos as operações ficam claramente mais lentas, o que pode amplificar a contenção de lock
【inferência: qual PID e qual passo ficaram lentos no ambiente real ainda não foi confirmado】
                         ↓
Algumas requisições não têm sucesso dentro do orçamento de espera pela aquisição do lock e reportam expiração de lock
                         ↓
A falha do polling emite poll-error, o que dispara um refresh na camada superior e uma nova leitura
                         ↓
O novo read() também falha, captura a exceção e retorna com sucesso um Personal Overlay vazio
                         ↓
O Registry publica um novo estado disponível com base nessa configuração pessoal vazia
Os Providers pessoais / os modelos desaparecem e as mensagens seguintes podem não conseguir criar o modelo
                         ↓
Depois, o polling tem sucesso e lê a mesma versão de conteúdo do disco, R1
O Repository ainda lembra R1, considera que o conteúdo não mudou e não envia change
                         ↓
O downstream pode continuar mantendo a visão degradada até outro refresh ou restart
```

O padrão de 8 segundos é um orçamento de espera de relógio de parede para a aquisição de lock entre processos; não inclui o enfileiramento FIFO dentro do processo anterior, e não é o timeout de um único `readFile` nem o prazo de uma operação que segura o lock. A expiração não significa que outro processo segurou o lock por 8 segundos seguidos; o orçamento também pode ser esgotado por várias disputas, retries ou atraso acumulado de conclusão de operações.

A próxima rodada só é agendada depois que a atual termina; não se pode converter o intervalo padrão de 1 segundo em uma execução estritamente fixa a cada segundo durante o período de anomalia. Um `read()` comum também inclui a importação de configuração antiga e a normalização de formato com escrita de volta; o polling puro não modifica o corpo da configuração, mas igualmente adquire o lock.

### 1.3 Linha do tempo

A tabela abaixo usa o tempo interno das mensagens do Host. O tempo externo nos logs do Desktop é o momento em que o Main recebe e encaminha, e pode haver atraso em relação ao anterior.

| Hora                         | Fato registrado no log                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| 15:44                        | após atualizar para 3.12.1, carregamento normal, com `providerCount=8` no Host Registry                       |
| 18:07:56–58                  | o Host 30660 carrega a configuração normalmente; em seguida quatro Agents concluem a verificação de migração do banco                       |
| 18:38:10–19:08:02            | primeira rodada: 11 alertas de polling, 16 quedas na leitura, totalizando 26 expirações de lock e 1 `mkdir EPERM`        |
| 19:10:10                     | o novo Host 31780 carrega normalmente, voltando a 8 Providers, com a mesma versão de conteúdo da configuração pessoal que no início normal |
| 19:23:51–19:27:06            | segunda rodada: 1 alerta de polling, 5 quedas na leitura, todas por expiração de lock                                   |
| 19:28:59                     | o novo Host 25264 carrega normalmente, voltando novamente a 8 Providers, com a mesma versão de conteúdo           |
| 20:24:48–20:28:50            | terceira rodada: 4 alertas de polling, 4 quedas na leitura, todas por expiração de lock                                   |
| 20:34:49、20:35:03、20:35:12 | a mesma tarefa aceita três entradas curtas consecutivas, todas falhando na etapa de criação do modelo com `provider_not_found`       |
| 21:40、22:11                 | as inicializações seguintes continuam carregando normalmente 8 Providers, com a mesma versão de conteúdo                           |
| 22:13–22:14                  | há 1 RPC de sucesso de exclusão de Provider e 2 de salvamento de Provider Overlay                     |
| 22:15                        | na inicialização do Host são carregados 7 Providers, com mudança na versão de conteúdo da configuração pessoal                          |

No dia inteiro somam 16 alertas de polling e 25 quedas na leitura, ou seja, 40 expirações de lock e 1 falha ao criar o diretório do lock. Não se pode atribuir toda a contagem do dia à primeira rodada. A contagem de Providers foi comparada apenas usando o evento `Provider Registry 已就绪` do Host, sem misturar o `providerCount` de outras camadas.

Essa linha do tempo sustenta que, durante as falhas, o que ocorreu principalmente foi degradação da configuração em memória, e que a configuração original em disco ainda pôde ser lida após um restart. O `read()` que retorna configuração vazia nesta rodada não sobrescreve o disco; o `update()` relê o disco dentro do lock antes de aplicar a modificação, e não se pode deduzir que "qualquer salvamento após a degradação escreveria o disco vazio".

### 1.4 Impacto e fronteiras de recuperação

- Durante a primeira rodada ainda há registros de conclusão de rede de modelo de 31 requisições diferentes, sendo 24 com o modelo do fornecedor personalizado original e 7 com o modelo da conta. Tarefas em execução e a lista de configuração podem estar em estados diferentes, e não se pode usar o fato de a tarefa continuar produzindo para provar que a visão de configuração está saudável.
- Os três `provider_not_found` das 20:34–20:35 mostram que as mensagens seguintes realmente podem não conseguir executar. O RPC de envio do Host retornar `OK` significa apenas que a requisição foi aceita, e não que a execução posterior da tarefa teve sucesso.
- Os alertas de polling reaparecem várias vezes no mesmo Host, enquanto o código só alerta na primeira falha consecutiva e reseta após uma leitura com sucesso. Portanto, houve polls bem-sucedidos no meio, e não se pode afirmar que a noite toda ficou bloqueada pela mesma lock residual.
- Das 40 expirações, 33 têm no cause aninhado o campo nativo `mkdir EEXIST`, e 7 trazem apenas `code=EEXIST`. Estas últimas apontam fortemente para o ramo de reconfirmação de propriedade após a criação do lock, mas, sem a message/stack original, não é possível confirmar a subcondição específica de falha.
- Uma sonda isolada já validou o mecanismo de "Registry fica vazio após falha de leitura, o Registry não se recupera automaticamente quando a leitura do disco se recupera, e a recuperação ocorre após um refresh explícito". A injeção de falhas de atraso de lock e de falha de exclusão apenas prova que o defeito pode ocorrer, não que o ambiente real passou pelas mesmas condições de injeção.

## 2. Particularidades do ambiente de sistema na época

### 2.1 Comparação entre domingo, segunda e terça

| Métrica                    | 13 de setembro, domingo | 14 de setembro, segunda | 15 de setembro, terça |
| ----------------------- | ---------------: | ---------------: | ---------------: |
| Comandos de minimização              |            21 vezes |             5 vezes |             2 vezes |
| Pares na etapa de salvamento de configurações      |              264 |              211 |              265 |
| Duração mediana na etapa de salvamento de configurações    |              7ms |              5ms |              5ms |
| Duração máxima na etapa de salvamento de configurações    |         16,626ms |             26ms |             36ms |
| Etapas de salvamento de configurações acima de 1 segundo |             3 vezes |             0 vezes |             0 vezes |
| Expiração de lock do arquivo de Provider     |            40 vezes |             0 vezes |             0 vezes |

A etapa de salvamento é pareada pelos tempos internos `writing settings` / `write done` do mesmo Host, sem registros sem par. Essa duração inclui operações de diretório, leitura de campos de compatibilidade, aquisição de lock, escrita, retries de substituição e agendamento de execução; não é a duração da escrita física no disco nem cobre todo o RPC `setting.update`.

Segunda e terça continuaram usando a 3.12.1 e o mesmo Provider personalizado, ou seja, o problema não desapareceu por causa de uma atualização com correção. Na segunda, a maioria das inicializações ainda teve quatro Agents, e houve períodos com um Agent de subprojeto adicional; na terça, o período principal de uso também teve quatro Agents. Nos dois dias houve modificações reais de configuração e execução de tarefas, com 159 e 149 requisições de modelo concluídas na rede, respectivamente.

Na segunda houve outros erros de parâmetros de modelo, respostas do upstream e de rede, mas nenhuma degradação no carregamento da configuração de Provider. Na terça, a falha de validação de configuração a partir das 17:20 pertence à alteração manual já confirmada e não pode ser unida ao problema de lock de arquivo do domingo. O anexo da terça cobre apenas até 17:30, então os resultados de degradação posteriores não são comprovados diretamente por ele.

### 2.2 A minimização é uma pista relacionada, mas sozinha insuficiente

A correlação de tempo da terceira rodada de falha é mais concentrada:

| Minimização   | Próximo alerta de polling de Provider |     Intervalo |
| -------- | ------------------------ | -------: |
| 20:24:30 | 20:24:48                 | cerca de 18 segundos |
| 20:25:04 | 20:25:18                 | cerca de 14 segundos |
| 20:26:03 | 20:26:18                 | cerca de 15 segundos |
| 20:27:40 | 20:27:51                 | cerca de 12 segundos |

Mas em vários momentos anteriores do domingo a minimização ocorreu normalmente, e depois das 20:35 não houve mais alerta de lock. Na segunda, às 09:31 e 14:44, e na terça, às 12:47, também houve minimização com tarefas em execução, e as tarefas seguintes concluíram sem expiração de lock. Portanto, "vários Agents + minimização" não é uma condição de disparo suficiente.

O comportamento do usuário parece ser o de consultar repetidamente o aplicativo durante a execução de tarefas longas e, depois da falha, verificar as configurações e tentar recuperar: entre 18:42 e 18:44 há uma leitura concentrada das configurações e da visão de Providers, às 18:59 ele abre o explorador de arquivos embutido do ZCode, e às 19:10 e 19:29 retoma a tarefa original após o restart e continua digitando. Alguns RPCs são consultas automáticas e não podem ser interpretados um a um como cliques; como falta um rastro completo de focus/restore, também não é possível reconstruir quanto tempo cada permanência em segundo plano durou.

### 2.3 Julgamento atual e conclusões que não podem ser tiradas

A direção mais bem sustentada hoje é: em alguns períodos do domingo houve um atraso anormal de execução, que amplificou a disputa do polling exclusivo de múltiplos processos; segunda e terça não voltaram a apresentar o mesmo comportamento. A origem específica do atraso continua pendente de confirmação.

- Não há registro do ambiente real sobre processos de jogo, outros aplicativos em primeiro plano ou carga de recursos da máquina inteira, e não se pode afirmar que o usuário estava jogando ou com os recursos esgotados.
- A 3.12.1 não registrou eventos de bloqueio de tela, desbloqueio, suspensão e retomada do sistema, e não se pode excluir esses comportamentos com base na ausência de logs. Bloqueio de tela não é o mesmo que suspensão do sistema; e o log de execução também não sustenta que toda a janela da falha permaneceu em suspensão tradicional do sistema.
- Em todos os três dias, a opção de "manter o computador ligado" estava desligada, mas isso não permite deduzir que o sistema realmente entrou em suspensão.
- Os logs não têm erros de disco cheio como `ENOSPC` ou `SQLITE_FULL`, nem dados de espaço livre no momento da falha; não se pode afirmar disco cheio, nem alegar que a falta de espaço foi completamente descartada.
- O grupo mais recente de verificações de migração do banco concluiu às 18:07:58, e o primeiro erro de Provider ocorreu às 18:38; não há evidência de que uma falha de migração tenha disparado diretamente essa falha de lock.

A documentação da Microsoft descreve que a visibilidade da janela afeta o QoS do processo e de seus descendentes, e que minimizar ou ocultar completamente corresponde a Low; algumas políticas de economia de energia têm condição de operação com bateria. Isso oferece uma direção de investigação do lado do agendamento do sistema, mas não prova a origem específica do atraso deste caso. [Windows QoS](https://learn.microsoft.com/en-us/windows/win32/procthread/quality-of-service)

Depois disso, é possível usar os eventos de bloqueio de tela, desbloqueio, suspensão e retomada do Electron para completar o registro de estado, sem precisar varrer outros aplicativos do usuário. [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)

## 3. Defeitos de design centrais do Provider

### 3.1 Até a leitura somente de alta frequência usa lock exclusivo

A mudança de configuração precisa ser sincronizada entre Host e Agents, e o propósito funcional de leitura periódica é legítimo. A implementação atual faz vários processos fazerem polling do mesmo arquivo de forma independente, exclui até os leitores entre si e executa escrita e exclusão de metadados de lock antes e depois de cada leitura bem-sucedida, o que gera disputa contínua e torna o mecanismo sensível a atrasos anormais de conclusão.

O objetivo de melhoria deve ser reduzir leituras repetidas e a exclusão desnecessária entre leitores, e isso não equivale a especificar diretamente que "tem que virar um lock de leitura/escrita". Como o `read()` comum inclui importação e escrita de volta de normalização, é preciso primeiro distinguir leitura pura de operação de leitura e modificação, e só então definir o esquema de consistência entre processos. Simplesmente remover o lock de todas as leituras ou aumentar o timeout não é um design completo.

### 3.2 Tratar uma falha temporária de leitura como configuração vazia válida

Uma expiração de lock significa que a configuração mais recente não foi obtida, e não que o usuário apagou todos os Providers pessoais. Atualmente o `read()` captura o erro e retorna com sucesso um Personal Overlay vazio, e por isso o Registry substitui o estado anterior por uma configuração aparentemente legítima.

As restrições a manter: indisponibilidade temporária não pode se passar por configuração vazia real; e, quando já existe um snapshot válido, uma falha temporária de leitura não deve esvaziá-lo. No caso de primeira inicialização, sem nenhum snapshot válido, a indisponibilidade também precisa ser expressa claramente, sem se passar por "o usuário ainda não configurou nada".

### 3.3 A recuperação da falha só olha o conteúdo do arquivo e não cobre o estado do downstream

O Repository já registrou a versão de conteúdo R1; depois da falha de leitura o Registry recebeu a configuração vazia, mas a versão observada pelo Repository pode continuar sendo R1. Quando o polling volta a ter sucesso e relê R1, ele retorna mais cedo porque a versão é a mesma e não envia a notificação de recuperação necessária ao downstream.

```text
Normal: disco R1, versão observada R1, Registry normal
Falha: disco R1, versão observada R1, Registry degradado para vazio
Recuperação: disco R1, versão inalterada → sem notificação → o Registry ainda pode estar vazio
```

As restrições a manter: conteúdo do arquivo inalterado não significa estado de serviço inalterado; quando a leitura se recupera de uma falha, o consumidor precisa poder voltar a um estado válido. A UI já assina o Registry, e não se pode diagnosticar uma ausência do evento de recuperação do upstream como uma página que não responde a mudanças do Registry.

Prioridade de correção: primeiro garantir que uma falha de leitura não destrói a configuração disponível já existente e que a recuperação atualiza corretamente; depois otimizar a leitura e a disputa de lock. Antes de qualquer implementação, é preciso registrar em separado o design e os cenários de regressão; este relatório não indica que a solução final de lock já está definida.

## 4. Problemas encontrados em passant

### 4.1 As informações de workspace não mudaram e mesmo assim setting.json é salvo de novo

O objetivo de salvar as informações do workspace é restaurar, na próxima inicialização, o último workspace aberto, a ordem e o item ativo. O `TabStore` salva ao mesmo tempo as abas de workspace/configurações, a aba ativa atual e o estado de expansão da barra lateral; o listener de persistência assina o store inteiro e só após um debounce de 300ms extrai `lastWorkspaceSession` e `lastActiveTabIndex`.

A camada de listener não compara o resultado da extração, e a camada de serviço também não compara as configurações antigas e novas depois da mesclagem. Assim, mudanças efetivas como abrir/fechar/reordenar workspaces geram salvamento, mas operações que não alteram esses dois campos, como abrir a página de configurações, recolher projetos ou reativar um workspace já existente, também podem gerar salvamento.

```text
Abrir a página de configurações ou recolher um projeto
          ↓
TabStore notifica → debounce de 300ms
          ↓
A lista de workspaces extraída e o índice ativo são os mesmos de antes
          ↓
Ainda assim chama setting.update → mescla as configurações completas → escrita de substituição em arquivo temporário
```

O debounce de 300ms apenas agrupa eventos densos e não é responsável por deduplicação de conteúdo; também não é um salvamento a cada 300ms fixamente. O próprio comando de minimização só minimiza a janela e não salva configurações diretamente, e por isso os logs de salvamento após a minimização não podem ser interpretados como prova de que a ação de minimização grava em disco.

Dos 264 salvamentos de domingo, 263 pares de objetos adjacentes têm 261 pares iguais. Essa estatística não foi afetada por placeholders de redação, mas o log não traz argumentos de chamada nem pilha de chamadas, e não se pode atribuir todas as escritas repetidas a essa única entrada de listener; a escrita real em disco também faz merge de campos de compatibilidade, e não se afirma que os bytes em disco sejam idênticos a cada gravação.

A relação com o problema principal tem apenas duas camadas:

1. o salvamento repetido aumenta operações de arquivo, metadados de lock e carga de agendamento, e é uma sobrecarga extra que pode ser reduzida.
2. o salvamento anormalmente lento no mesmo período serve como evidência indireta de que o ambiente de execução compartilhado apresentava atraso.

`setting.json.lock` é diferente de `provider_config.json.lock`, e salvar configurações comuns de workspace não ocupa diretamente o lock do Provider. Não há prova de que o salvamento repetido causou esta expiração de lock; segunda e terça ainda tiveram muitos salvamentos repetidos sem a falha.

### 4.2 A falha de liberação do lock na camada inferior é ignorada e o diagnóstico é insuficiente

Na liberação, as exceções ao excluir o arquivo de owner e o diretório do lock são ignoradas. Se o arquivo de owner sobrar e o PID correspondente ainda estiver vivo, as requisições seguintes podem continuar tratando-o como lock ativa, formando uma espera contínua. Esse risco existe na ferramenta de baixo nível, mas não é a causa já confirmada no ambiente real; o único `EPERM` ocorreu claramente no `mkdir` e não pode ser explicado como falha de exclusão na liberação.

Trata-se de um problema da ferramenta comum encontrado em passant, e colocá-lo nesta seção não significa que o impacto potencial seja pequeno. É preciso tornar visíveis os erros de liberação e registrar um resumo necessário ao final de uma requisição lenta ou com falha: PID de quem espera e do owner, juízo de vivacidade, número de tentativas, durações de fila/aquisição/held/liberação, condições de falha da reconfirmação de propriedade e o tipo original do erro. Quando necessário, ler de forma assíncrona o espaço disponível do volume na falha.

Esses registros devem ficar restritos a requisições lentas, anomalias e transições de estado do sistema, sem imprimir a cada rodada e sem conter o corpo da configuração nem API Key. A duração de conclusão de uma operação de arquivo continua não devendo ser chamada diretamente de latência física de disco.

### 4.3 Base da investigação e handoff seguinte

O código-fonte foi conferido contra o build de release `dfc10615`, e os arquivos centrais abaixo não têm diferenças em relação ao workspace no momento da investigação:

| Ponto de atenção                         | Entrada no código-fonte                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Leitura, escrita, polling e degradação da configuração pessoal | `packages/provider-node/src/personal-provider-config-repository.ts`: `read`, `update`, `#pollOnce` |
| Encaminhamento da camada de configuração e publicação do Registry     | `packages/provider/src/config-service.ts`, `packages/provider/src/registry-service.ts`             |
| Enfileiramento dentro do processo e orçamento do lock de arquivo         | `packages/shared/src/node/privateFilePersistence.ts`: `withFileLock`                               |
| Reconfirmação de propriedade e liberação entre processos         | `packages/shared/src/node/atomicFileLock.ts`: `acquireFileLock`                                    |
| TabStore e listener de persistência          | `packages/ui/src/store/tabStore.ts`, `packages/ui/src/hooks/useTabPersistence.ts`                  |
| Campos de serialização do workspace               | `packages/ui/src/root/remoteWorkspaceSessionPersistence.ts`: `buildRemoteWorkspacePersistPatch`    |
| Atualização de configurações e escrita real em disco             | `packages/services/src/setting/settingService.ts`: `update`, `writeSettings`                       |

Os pontos de localização principais dentro do anexo original estão abaixo, com números de linha contados após decodificar o arquivo original e sem qualquer conteúdo de configuração do usuário:

| Arquivo                                    | Número da linha                       | Conteúdo                                         |
| --------------------------------------- | -------------------------- | -------------------------------------------- |
| `logs/2026-09-13.log`                   | 11184、11187               | primeira falha de lock de polling e a queda de leitura subsequente               |
| `logs/2026-09-13.log`                   | 11965                      | o `EPERM` ao criar o diretório do lock                         |
| `logs/2026-09-13.log`                   | 14186、14189               | etapa de salvamento de configurações de 16.626 segundos                        |
| `logs/2026-09-13.log`                   | 14652、16404、23497、23872 | as inicializações seguintes recarregam a configuração normalmente                     |
| `logs/2026-09-13.log`                   | 22729、22733、22734、22735 | minimização, salvamento de 12.314 segundos e alerta de lock de Provider no mesmo período  |
| `.zcode/cli/log/zcode-2026-09-13.jsonl` | 5216、5221、5226           | três mensagens seguintes falhando na execução por `provider_not_found` |

Alguns placeholders de redação expostos nos logs exportados pela CLI fazem a análise do JSON falhar; durante a investigação os placeholders só foram normalizados em memória antes da leitura, sem modificar o original e sem usar isso como evidência de arquivo corrompido. O log completo do usuário não entra no repositório junto deste relatório e deve ser obtido pelo anexo do ticket de feedback.