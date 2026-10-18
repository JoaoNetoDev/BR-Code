# Escopo de regressão do resgate manual do Start Plan

Em 2026-09-08 o Todo93 substitui as expectativas antigas de troca automática descritas abaixo (R06/AS07): em SPMC-08, após o refresh apenas aparece um aviso, e a leitura do disco continua sendo Start; só ao clicar em uma sugestão concreta é que a gravação condicional acontece. Quando não é possível gravar, aparece uma falha, e só depois de restaurar a permissão e clicar em "Tentar novamente" a troca funciona — não há troca automática por meio de um novo refresh. Pro run desktop-e2e-20260908-100921-925 passou o grupo inteiro, 4/4; a corrida entre a atualização de saldo em background e o clique do botão na primeira rodada do SPMC-02 foi ajustada na ordem do fixture, sem mudança de produto. A evidência completa e as fronteiras não testadas na prática estão no Todo93.

> 2026-09-06: conforme o Todo 85, o comportamento de produto do staging fixo (16d999f6a4) foi restaurado, usando a identidade de Provider e o serviço de configurações atuais.
> Registros históricos de aprovação não provam que o código desta rodada passou. O resultado realmente obtido está registrado de forma unificada na
> [tabela de auditoria da restauração](../working-memory/provider-refactor/plan/staging-conflict-restoration-audit.md).

## E2E oficial no Electron

Arquivo: `packages/desktop/test/e2e/start-plan-manual-claim-experience.test.ts`. Esta rodada foi executada em um HOME de teste isolado no MacBook Pro, conforme a exigência mais recente do usuário.

| Case                       | Comportamento verificado                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPMC-01                    | O cancelamento da confirmação de fechamento funciona; confirmar o fechamento não envia requisição de resgate                                                                    |
| SPMC-09                    | A falha no resgate exibe "Entendi"; a atividade atual não reaparece continuamente; o polling das atividades seguintes continua                                 |
| SPMC-02 / 07 / 11 / BSM-20 | Os parâmetros de verificação de segurança são enviados junto do único claim; resultado do resgate e compartilhar/copiar; o polling continua com o diálogo aberto; "Configurações do modelo" apenas navega, sem trocar a conexão; consulta manual do Start e refresh dos direitos creditados; candidatos de Subagent coerentes com a conexão atual; atalho de acesso rápido da quantidade do Start |
| SPMC-08                    | O Banner é restaurado após a abertura do próximo horário; novo resgate e navegação para as configurações do modelo; a navegação de Provider desconhecido gera erro explícito mas a página continua operável, e uma navegação válida posterior se recupera — nada disso altera a preferência de conexão                    |

Os testes substituem apenas a verificação de segurança e as capacidades externas de área de transferência, usando mocks locais de billing/assinatura; a cadeia real Renderer → Host de serviço e a de escrita de configurações ainda são executadas.
Não se dissimula uma falha de comportamento alterando classes CSS ou relaxando o casamento das requisições; e não se mantêm verificações de tamanho de botão ou classe por classe sem contrato de produto.
As afirmações antigas de mode/selectedKey do Family foram migradas para uma seleção estruturada de conexão, sem reimportar o Provider Store antigo.

2026-09-07 Todo 88 / R10: dentro do cenário aceito de crédito do resgate, foi acrescentado o gerenciamento dinâmico de membros. Usando o `glm-5.3-flash` em minúsculas, presente no retorno de balance e ausente da lista estática, modifica-se a janela de contexto pelo diálogo real e salva-se reabrindo; em seguida, arrasta-se `glm-5-turbo` para logo depois. Verifica-se no disco que o Personal só registra a cobertura daquele modelo e a ordem, sem copiar os membros de modelo da Account. O ID do membro da conta permanece somente leitura. Este item não verifica requisições reais de risk control ou de cobrança.

2026-09-07 Todo 88 / R06: ao final do SPMC-08, acrescenta-se o comportamento subsequente quando o Start atual é explicitamente invalidado. Primeiro confirma-se que a conexão persistente atual é o Start; depois o mock local de billing retorna explicitamente sem direitos, e a atualização real do estado da conta é disparada por um refresh na página de configurações do modelo; é preciso ver a notificação de troca automática, e a conexão em disco muda para o plano pessoal, que segue utilizável, com a página de configurações mostrando o plano pessoal em sincronia. Não é permitido substituir a cadeia de produto alterando diretamente as configurações no teste nem chamando a função de recuperação automática; a falta de troca indevida em caso desconhecido/falha de rede é coberta por testes unitários direcionados.

2026-09-08 / AS07: no mesmo cenário, deixa-se o diretório de configurações do HOME isolado temporariamente não gravável, aguarda-se o log real de falha da troca automática e confirma-se que a conexão persistente continua sendo Start e que não há notificação de sucesso; depois de restaurar a permissão, um novo clique em atualizar faz com que o mesmo fato de invalidação ainda dispare a troca automática. A permissão é restaurada no finally, sem tocar o diretório real do usuário. O passo de falha de permissão POSIX só é executado fora do Windows; no Windows permanece o caminho normal de troca por invalidação, e a deduplicação de falhas independente de plataforma e as exceções de refresh são cobertas por testes unitários. Não se pode adicionar um novo retryer temporizado.

## Testes unitários direcionados

2026-09-08 Todo 89 / W89-01–04: nos passos de gerenciamento dinâmico de modelos, confirma-se primeiro que não existe registro de Personal Provider e só então adiciona-se e remove-se um modelo pessoal diretamente pelo diálogo de adição; não se pode antes ordenar para fabricar um registro prévio. Durante a edição dinâmica de membros, altera-se outro modelo por um repositório de configuração isolado e confirma-se que a atualização da View não limpa a entrada, que um salvamento vencido preserva erro e rascunho. Cancelar e reabrir leva ao salvamento normal; depois de ordenar, adiciona-se um novo modelo e verifica-se que a ordem antiga é preservada e que membros herdados não entram no modelIds pessoal. Estende-se o cenário existente, sem novas requisições reais de modelo.

- O `server_time` das respostas de preview/claim/balance passa de segundos para milissegundos; o tempo de vigência continua comparado pela origem da interface correspondente, sem substituir o tempo do servidor pelo generatedAt local.
- `effective_at=0` entra em vigor imediatamente; tempo futuro exibe "pendente"; quando o refresh do saldo falha, a confirmação de resgate bem-sucedido é mantida e usa-se o tempo conhecido do claim.
- Login/novo login visível/refresh agendado; um preview atrasado não sobrescreve uma requisição nova; a deduplicação da falha da atividade atual não engole a atividade seguinte.
- Resgate de duas atividades em sequência: depois de fechar o resultado da primeira, o refresh de direitos atrasado da primeira não pode sobrescrever o tempo do resultado da segunda nem liberar antecipadamente o estado de resgate da segunda; fechar o diálogo não revoga um resgate já concluído.
- Sucesso/falha na cópia afetam apenas o feedback de compartilhamento, sem esconder o resultado do resgate nem a entrada das configurações do modelo.
- Pending, unknown, sem modelo e não selecionado são estados de conta diferentes; os testes não podem usar "experimente agora" para forçar a seleção do Start antes de consultar os direitos.

## O que não é explicitamente restaurado

O ramo "Start using" do staging fixo está desabilitado por padrão. A ação principal é uniformemente "Configurações do modelo", e a falha é "Entendi".
Não se escreve a conexão Start automaticamente, não se despacha a seleção automática de modelo do Composer e não se restaura o menu de captura de tela para compartilhamento.
Requisições reais de modelo, o serviço real de verificação de segurança e a área de transferência do sistema não estão no escopo de prova deste grupo de E2E com mocks locais.

## Escopo de retenção e religação do Todo103

Os contratos abaixo são religados conforme a refatoração de providers e a decisão final do Todo93. O registro de execução na origem, no final, só prova as respective versões históricas e não representa a aprovação deste candidato de merge completo; a evidência do candidato está no razão do Todo103. A ativação automática antiga e o helper de guide não constituem o caminho principal atual de resgate.

### Contrato de polling do preview do Banner

O Banner de resgate manual não pode ler o preview apenas uma vez ao montar o Renderer. A atividade pode reabrir o resgate por hora,
portanto `ManualClaimPlanBanner` precisa continuar reutilizando
`ICodingPlanSubscriptionService.getManualClaimPlanPreviews()`, sem adicionar uma segunda interface de atividades nem rebaixar o estado do polling para
desktop main, relay ou Agent runtime.

```text
mount / login state change / visible again
  -> request preview immediately
      |-- plans -> select by priority -> show or update Banner
      |-- [] --------------------------> hide Banner, keep polling
      `-- error -----------------------> keep last successful snapshot

visible Renderer
  -> production: poll every 10 minutes
  -> development / test: poll every 30 seconds

document hidden
  -> stop timer
document visible again
  -> request immediately, then restart the environment-specific interval

claim request active
  -> polling paused; stale in-flight preview must not overwrite claim refresh
claim response settled
  -> preview single-flight 立即刷新并恢复轮询；结果弹窗、balance 或 provider 刷新不得继续持有轮询生命周期
```

O polling precisa ser serial; ticks de timer que chegam durante uma requisição lenta são simplesmente ignorados, sem acúmulo concorrente. Um mesmo ciclo contínuo de falhas gera apenas um alerta, e uma nova falha só pode gerar novo alerta depois de um sucesso. Depois que o usuário confirma o fechamento do Banner, mantém-se a semântica existente de dismiss local no Renderer:
a exibição e o polling param no ciclo de vida de montagem atual; como o preview existente não tem ID de lote horário, esta etapa não pode adivinhar um novo lote pelo `planId` nem forçar a reapresentação.

Falha no resgate e fechamento feito pelo usuário pelo usuário têm semânticas diferentes: depois que o usuário fecha o diálogo de falha, o Banner atual precisa ser ocultado, mas o polling continua. Como o preview não tem ID de lote horário,
após a falha entra-se no estado de "esperando um intervalo vazio"; um preview não vazio não é reapresentado por enquanto, a primeira resultado vazio libera a supressão, e só uma atividade que apareça novamente depois disso pode ser exibida.

A visibilidade da página segue a Page Visibility API: é pausada quando a janela do desktop é minimizada ou a aba do Web fica oculta; a simples perda de foco do aplicativo não é condição de pausa. Esse polling continua sendo lógica de exposição somente leitura do Renderer compartilhada entre desktop/web, e não altera a semântica de restauração continuous do desktop nem replayable do celular.

A detecção de ambiente lê o modo de build do Vite e o `ZCODE_ENV` de compilação: apenas build de produção com
`ZCODE_ENV=production` usa 10 minutos; tanto Vite development quanto `ZCODE_ENV=test` usam 30 segundos.
Embora o Desktop E2E use bundle de produção, ele precisa atingir o ciclo de 30 segundos por causa do `ZCODE_ENV=test`.

### Contrato de fixture de login e verificação de segurança do E2E

Os casos oficiais de resgate precisam que o seed de credenciais do WDIO na inicialização preserve o fake `zcodejwttoken`. Um E2E comum remove esse campo ativamente,
para evitar que um JWT fake acesse interfaces reais de plano; mas o endpoint de Coding Plan desta spec já aponta fixamente para o mock local do shard,
e `claimManualPlan` lê esse JWT antes de emitir a requisição HTTP. Não se pode depender de uma migração legacy `auth_token` de uso único:
quando a mesma spec usa `reloadSession` para recriar o Electron, a origem da migração pode já ter sido consumida, fazendo o serviço retornar 401 direto,
o que não prova que a fixture de falha foi atingida nem que o header de claim bem-sucedido foi enviado.

```text
WDIO startup credential seed
  -> preserve fake zcodejwttoken for start-plan-manual-claim-experience
  -> Electron reload restores authenticated ZCode session
  -> deterministic verification success
  -> claimManualPlan reads JWT
  -> POST local /api/v1/zcode-plan/billing/claim
       |-- failure case: mock business code -> failure dialog
       `-- success case: code 0 -> success dialog + one verification header
```

O substituto da verificação de segurança precisa cobrir o contrato de callback do SDK da versão oficial vigente (os detalhes são mantidos junto com a spec de verificação de segurança da versão oficial).
Em uma falha do SPMC-02, a spec deve imprimir simultaneamente o request ledger do mock e a etapa da verificação de segurança, distinguindo claramente "nenhum claim enviado", "falha de negócio" e "texto de sucesso divergente".
A conexão inicial BigModel desta spec usa a seleção estruturada de `providerFamilyConnectionSelections.bigmodel`
(por exemplo `{ kind: "individual-coding-plan" }`); não se volta a fazer seed de mode/selectedKey antigos. Compara-se essa seleção antes e depois de abrir as configurações do modelo, para não confundir uma migração histórica com uma escrita de navegação de resgate.

### Relações de funcionalidade

| Rank           | De                          | Aresta semântica       | Para                                  | Por que inspecionar                                                  | Evidência                                                        |
| -------------- | --------------------------- | ----------------------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| must-inspect   | Banner de resgate manual    | resgata através de     | Coding Plan Subscription Service      | Fatos de negócio do resgate e origem dos códigos de erro            | `ManualClaimPlanBanner.tsx`, `codingPlanSubscriptionService.ts`    |
| excluded       | "Start using" retido       | sem entrada de produção| Setting Service                       | Após o resgate não se escreve conexão; apenas rastreamento histórico é mantido, sem restaurar esse caminho | ManualClaimPlanBanner atual                    |
| excluded       | guide de uso único          | sem gatilho de resgate | Composer                              | O resgate atual não dispara seleção automática de modelo e não restaura o fallback de origem | Teste de DOM do resgate atual                 |
| should-inspect | compartilhamento de resultado | usa                  | Captura de tela da plataforma + Clipboard | A falha só gera feedback e não reverte o resgate                 | `ManualClaimPlanResultDialog.tsx`                                |
| conditional    | Seleção do Start Plan       | usa o registry de providers | runtime de workspace local/remoto | Esta rodada não muda a semântica de registry/sincronização remota   | `manual-model-switch-resolution-chain.md`                       |
| invariant-only | UI de resgate               | não deve alterar      | desktop continuous / mobile replayable | Nenhuma mudança de task stream, snapshot ou replay             | O diff atual não tem arquivo de realtime/protocolo               |
| evidence-only  | testes de componente focados| cobre                 | lógica pura e ramos renderizados      | Testes unitários são evidência e não substituem E2E entre componentes | `packages/ui/test/manualClaimPlan*.test.ts`                      |

### Invariantes que precisam ser preservados

| Invariante                                    | Prova necessária                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| O preview só expõe, não ativa plano           | preview e claim distinguíveis no request ledger; no fluxo de fechamento o número de claims é 0          |
| Um resgate bem-sucedido é fato irreversível   | mesmo que a atualização de entitlement/provider falhe, o Dialog de sucesso e as ações são mantidos      |
| O resgate não dispara o guide                 | após as configurações do modelo o requestId não aumenta e a conexão persistente não muda               |
| Não se escolhe modelo pelo primeiro candidato em nome do usuário | O resultado atual só navega; candidatos/seleção vêm da View unificada                 |
| Compatibilidade de UI com tema, idioma e tela estreita | Evidências DOM/visuais de Zai Light/Zai Dark, copy PT/EN e da restrição de viewport do Dialog em 480px |
| Isolamento dos recursos do Hero               | iframe apenas com `allow-scripts`; mensagem de inicialização validando source/instanceId; E2E de recursos ready |
| O guia das configurações do modelo só navega  | clicar na entrada da descrição fecha o Dialog de resultado eposiciona `modelProvider`; a seleção de conexão das settings fica inalterada |
| Sem propagação para a semântica de recuperação remota | Nenhuma mudança em `clientMode`, `deliveryKind`, snapshot, queue, owner/lease                     |

### Evidência de codegraph e drift

O ambiente atual não oferece uma porta de consulta de codegraph, então a verificação em profundidade 2 foi feita com busca precisa de callers de símbolos:

| Seed                                                | Caller direto / caminho principal                            | Profundidade | Interpretação                                    |
| --------------------------------------------------- | ------------------------------------------------------------- | ----------- | -------------------------------------------------- |
| `ManualClaimPlanBanner`                             | `WorkspaceSidebar`                                            | 1           | Única entrada de resgate                          |
| `requestManualClaimPlanModelGuide`                   | o ManualClaimPlanBanner atual não chama                       | 1           | Helper dormente, não é a cadeia de resgate atual  |
| `resolveManualClaimPlanModelSelection`               | ainda no consumidor guide dormente do Composer                | 1           | Não volta a ser ligado por causa da consolidação |
| `shouldDismissContextQuotaResetOpportunityReminder`  | `ChatContextUsage`                                            | 1           | Semântica de clique fora em Tooltip adjacente      |

Graph drift: o feature graph atual só declara `capability.plan-entitlements`, `service.plan-entitlements` e a superfície de uso; a origem chegou a acrescentar as relações de resgate manual e de guide, mas o Todo103 mantém apenas as fronteiras reais de resgate/refresh/navegação e não registra como fato atual a edge de commit de guide já revogada.

## Decisões de fronteira

| Fronteira              | Decisão                  | Inclui                                                                              | Exclui / poda                                                     | Origem                                                    |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Caminho principal de resgate | accepted          | preview, confirmação, verificação de segurança, claim, sucesso, refresh paralelo, navegação para as configurações do modelo | Estoque real e verificação de segurança real   | feature spec                                              |
| Falha no resgate      | accepted                | Código de negócio estável representativo + testes focados de generic/verificação de segurança | Um E2E separado para cada código de negócio | O mesmo failure Dialog/mapper, sem diferença de cadeia |
| Compartilhamento      | accepted                | Entrada visível, cópia direta do texto, feedback de sucesso e falha                   | Matriz de permissões reais da área de transferência do sistema    | A fronteira de Clipboard é coberta por testes de componente focados |
| Seleção de modelo     | excluído do resgate     | A navegação para as configurações do modelo não muda a conexão persistente nem dispara o guide | Fallback pelo primeiro item/seleção automática/requisição real de modelo | A seleção manual atual tem cobertura dedicada |
| Tema/idioma           | accepted representative | Zai Light em PT + Zai Dark em EN                                                   | Arranjo completo tema×idioma×viewport                            | Tema e locale são eixos de apresentação ortogonais        |
| remote/mobile         | pruned                  | Testes unitários de funções puras/componentes React compartilhados                   | Agent remoto independente, snapshot replayable                   | O resgate não tem estado de realtime de task              |
| Context reminder      | accepted focused        | Três alvos: trigger/reminder/outside                                                | Produto cartesiano com o claim                                   | Estado de UI adjacente e independente, sem owner de negócio compartilhado |
| Polling de preview do Banner | accepted        | Primeira carga, ciclo de 10m/30s, recuperação de visibilidade, serialização e isolamento de resultado velho | Nova interface, inferência de lote horário, coordinator entre janelas | Preview somente leitura no Renderer, sem novo owner de negócio |

## Casos aceitos

| Case ID | Setup                                                      | Ação                                                             | Asserções                                                                                                                         | Camadas de evidência                    | Status                                            |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------- |
| SPMC-01 | preview resgatável, já logado                              | abrir a confirmação de fechamento, cancelar e depois fechar mesmo assim | cancel preserva o Banner; o fechamento oculta; o ledger de claims é 0                                                       | DOM do Desktop + ledger de mock         | E2E formal, promovido e aprovado                  |
| SPMC-02 | preview, JWT fake, verificação de segurança com sucesso, claim vigente | claim → conferir Dialog de resultado → configurações do modelo    | Novo título; descrição sem links; configurações do modelo e compartilhar/copiar lado a lado; cópia direta do texto; não altera as settings; o header de claim é enviado só uma vez | DOM do Desktop + ledger de mock + settings | E2E formal, promovido e aprovado                  |
| SPMC-03 | Upgrade de timeout da verificação de segurança da versão oficial | —                                                            | Só se aplica à versão oficial; asserção mantida junto com a spec de verificação de segurança da versão oficial                 | teste unitário de runtime focado        | coberto (versão oficial)                          |
| SPMC-04 | claim retorna falha                                        | claim e confirmar o Dialog de falha                              | Sem Ticket/compartilhar/refresh; erro estável e localizado                                                                    | teste unitário de componente            | coberto                                            |
| SPMC-05 | Resgate bem-sucedido, candidatos incluem o Start            | abrir as configurações do modelo                                | No momento só navega, não escreve conexão automaticamente, não pede guide; o caso de seleção automática por origem não é restaurado | DOM de componente + E2E de Settings     | substituído pelo contrato de navegação atual     |
| SPMC-06 | Context reminder visível                                    | clicar em trigger, reminder e outside                           | Os dois primeiros preservam; o outside dispensa                                                                                  | teste focado de unidade/componente       | coberto                                            |
| SPMC-07 | Coexistem um bucket antigo já vigente e um agendamento novo vencido | abrir Model Settings → o servidor marca o novo bucket como pronto → clicar em atualizar os direitos | O plano antigo não mostra botão de refresh; o novo mostra um outline pill; ao clicar ele pede balance, o novo bucket aparece e o botão some | DOM do Desktop + ledger de mock HTTP local | E2E formal, promovido e aprovado       |
| SPMC-08 | O horário atual já foi resgatado e o preview retorna vazio  | o mock abre o próximo horário de resgate e a spec aguarda o ciclo de 30 segundos do ambiente de teste | O número de requests de preview aumenta; sem reload do Renderer; o Banner se restaura automaticamente             | DOM do Desktop + ledger de mock HTTP local | E2E formal, promovido e aprovado       |
| SPMC-09 | preview, JWT fake, verificação de segurança com sucesso, claim retorna falha de negócio | fechar o Dialog de falha → o horário atual segue vazio → polling posterior | O claim com header de verificação de segurança aumenta exatamente uma vez; o Banner atual fica oculto; o polling não para; não reaparece no mesmo ciclo; a recuperação após o intervalo vazio é coberta com precisão por um teste unitário de timer | timer de componente + ledger de mock do Desktop | E2E formal, promovido e aprovado |
| SPMC-10 | claim retorna tempo de vigência de entitlement e tempo do servidor | resgatar com o relógio do cliente deslocado e fazer o balance retornar um agendamento conflitante | O Dialog decide apenas pelo `entitlements[].effective_at` e `server_time` do mesmo claim; o balance não sobrescreve o Dialog e, com campo ausente, não faz fallback para `starts_at` | mapper de serviço + teste de componente + E2E | coberto                     |
| SPMC-11 | claim bem-sucedido com o Dialog de resultado aberto         | refresh de provider pendente, avançando um ciclo de polling de teste | O preview ainda é solicitado a cada 30 segundos; nem o Dialog de resultado nem os refreshes posteriores seguram o ciclo de vida do polling | timer de componente + ledger do Desktop | coberto                     |

## Decisões de poda

| Decision ID | Combinações podadas                                     | Guarda/invariante                                                  | Cobertura representativa                       |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| SPMC-P01    | 2 temas × 2 locales × desktop/mobile × sucesso/falha     | O owner de negócio e os eixos de apresentação são ortogonais      | SPMC-02 + asserções DOM focadas de i18n/tema   |
| SPMC-P02    | Rodar cada código de erro de claim no Desktop            | O mapper e o Dialog de falha são os mesmos; só muda o id da descrição | Tabela de mapper em teste unitário + SPMC-04 |
| SPMC-P03    | Rede silent/interactive do serviço real de verificação de segurança de terceiros | O estado de terceiros é instável e não pode entrar na CI       | Callback determinístico no teste unitário SPMC-03 |
| SPMC-P04    | "Start using" no Dialog atual e requisições reais de modelo | A UI atual só navega para as configurações do modelo, sem restaurar a troca automática | DOM do resgate + suite de model-switch já existente |

## Evidência de verificação das origens históricas (não é a aceitação do candidato do Todo103)

### Cobertura do diff de branches

A auditoria de cobertura usou `ebae2814f5...HEAD` para obter o conjunto de todos os arquivos de código de produção da branch atual e tomou como candidatos as linhas adicionadas/modificadas de `ebae2814f5` até a árvore de trabalho atual;
só são contabilizadas as linhas executáveis reconhecidas como tal por `getLineCoverage()` do Istanbul no relatório V8 do Vitest focado.
O Desktop Renderer usa granularidade diferente de instrumentation/source map, portanto não é possível mesclar statement ids diretamente, e ele é mantido como evidência entre processos.
Dados de tradução, testes e documentação não entram no denominador.

| Production source                          | Covered executable changed lines |
| ------------------------------------------ | -------------------------------: |
| `modelProviderService.ts`                  |                            6 / 6 |
| `contextQuotaResetOpportunityReminder.tsx` |                            5 / 5 |
| `contextUsage.tsx`                         |                            8 / 8 |
| `ManualClaimPlanBanner.tsx`                |                          10 / 10 |
| `ManualClaimPlanResultActions.tsx`         |                            8 / 8 |
| `ManualClaimPlanResultDialog.tsx`          |                            5 / 7 |
| `manualClaimPlanModelGuideStore.ts`        |                            4 / 4 |
| `manualClaimPlanModelSelection.ts`         |                          16 / 16 |
| runtime de verificação de segurança da versão oficial |                 29 / 30 |
| `SessionPane.tsx`                          |                          17 / 17 |
| `V4ComposerToolbar.tsx`                    |                          10 / 11 |
| **Total**                                  |          **118 / 122（96.72%）** |

As 4 linhas não cobertas estão apenas no feedback de falha de compartilhamento, na instrução de rejeição de duplicado da verificação de segurança e em uma linha condicional de guide do Composer; os comportamentos de usuário correspondentes são verificados, respectivamente, pelo component failure, pela rejeição de duplicado da verificação de segurança e pela asserção do V4 Composer montado, o que não afeta o limiar de 95% de cobertura de linhas.

### Suítes executadas

- Testes unitários/de componente focados: 10 arquivos, 346 testes, todos aprovados; inclui ainda o provider runtime do Start Plan selecionado e o feedback de falha e de fechamento do primeiro envio do SessionPane.
- Desktop E2E (modo de cobertura): `desktop-e2e-20260827-130252-862`, SPMC-01/02, 2 cases, com taxa de aprovação inicial e final de 100%, sem flakiness e sem falha de infra.
- Reexecução final do mock/spec antes do commit: `desktop-e2e-20260827-131853-472`, 2/2 aprovados.
- Reexecução pelo caminho formal após a promoção: `desktop-e2e-20260827133422383-p95897-2b91245a0ba1a93d`, 2/2 aprovados; sem ativar a flag manual-review.
- Reexecução do caminho de refresh de direitos agendados: `desktop-e2e-20260901090249947-p23514-f2968f04d3e97519`, SPMC-01 e
  SPMC-02/07 com 2/2 aprovados; validando a retenção do bucket antigo, a exibição oculta do botão de refresh, o request `billing/balance` após o refresh e a exibição do novo bucket.
- Reexecução da entrada de compartilhamento e do layout lado a lado: `desktop-e2e-20260901092627117-p53937-fef63e3aa58c22a3`, 2/2 aprovados;
  validando que a entrada de compartilhamento está visível e que compartilhar e começar ficam na mesma linha e com a mesma altura.
- Reexecução das credenciais de resgate e da correção dos dois ramos: `desktop-e2e-20260902-113435-283`, 4/4 aprovados; SPMC-09 e
  SPMC-02, cada um adicionou de fato uma vez um claim de sucesso/falha com o header de token do substituto de verificação de segurança, descartando aprovação falsa por 401 de login ou erro de verificação de segurança.
- Artefatos de cobertura do E2E: `packages/desktop/.e2e-artifacts/desktop-e2e-20260827-130252-862/coverage/`;
  relatório dos cases: `summary.md` no mesmo diretório de run.

## Passagem de bastão E2E

- Spec formal: `packages/desktop/test/e2e/start-plan-manual-claim-experience.test.ts`
- Fixture de mock: estende o servidor local do shard de Coding Plan, adicionando o cenário de resgate manual e o request ledger; sem acesso ao backend real.
- Fixture de provider: desnecessário; o case não envia prompt de modelo.
- Fixture de sistema de arquivos: credencial, config de provider e settings no HOME de E2E isolado.
- Timing: `fast-text`; o upgrade de timeout da verificação de segurança só é validado em teste unitário com fake timer.
- Cobertura: definir `ZCODE_E2E_COVERAGE=1` ao rodar a spec e salvar o relatório Istanbul do Renderer; a auditoria de cobertura estrita de linhas de branches divergentes usa o relatório V8 do Vitest focado, evitando misturar statement ids de instrumentações diferentes.
- Promoção: em 2026-08-27, após confirmação manual, migrada para o caminho formal; esse case de auth/config/UI não depende de fixture de replay de provider, e a execução oficial continua usando o mock local determinístico de Coding Plan.

# Nota de migração de 2026-09-10

Atualização de 2026-09-12: o usuário confirmou a promoção dos E2Es de marketing, e o caminho formal atual é `ui-shell/marketing-touch-delivery.test.ts`, `ui-shell/marketing-touch-entitlement.test.ts` e `ui-shell/marketing-touch-anonymous.test.ts`. As explicações pending abaixo são preservadas como histórico de migração; a evidência de execução mais recente está em `marketing-touch-e2e-implementation.md`.

O conteúdo abaixo deste ponto é o registro de cobertura histórico do fluxo antigo de Banner/preview, e não representa mais o contrato atual do Sidebar. A semântica atual e a matriz de aceitação MTC estão em `docs/marketing-touch-client.md`.

O antigo `start-plan-manual-claim-experience.test.ts` foi desmembrado em `ui-shell/manual-review/pending/marketing-touch-delivery.test.ts` e `marketing-touch-entitlement.test.ts`: foram removidos a confirmação de fechamento local, o botão de compartilhamento no Dialog de resultado do resgate e a reapresentação de preview após 30 segundos, todos behaviours já aposentados; foram manturados o Banner/resgate/relato reais, o refresh de direitos adjacente e a articulação de seleção Start/Individual/Subagent. O novo caminho permanece pending até obter confirmação manual e não é promovido automaticamente para a suíte formal. O componente antigo do Banner e seus testes unitários dedicados já foram removidos; os testes independentes do Hero continuam preservados.