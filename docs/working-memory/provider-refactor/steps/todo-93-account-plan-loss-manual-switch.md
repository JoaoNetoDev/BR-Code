# Todo 93: aviso único de plano indisponível, com troca feita pelo usuário ao clicar

> Transferência da responsabilidade de validação (2026-09-09): toda a dívida de testes restante, falhas e promoções manuais deste documento foram repassadas ao [Todo102](todo-102-verification-debt-closeout.md), e o cronograma de validação independente neste documento foi encerrado; as evidências históricas são preservadas, mas a transferência não significa que os testes passaram.

> Status: implementado e revisado; testes unitários e o E2E do núcleo Pro foram revalidados com sucesso; os itens de validação visual em todas as plataformas estão no fim do documento. 2026-09-08.
> Este item substitui a decisão de produto “ao detectar que a conexão atual está indisponível, salvar automaticamente uma conexão substituta” do Todo88 R06; a implementação antiga e o registro de aprovação dos testes antigos são preservados como histórico.

## 1. Problema e decisão final

Já existem evidências de execução no Air: em 2026-09-08 às 14:06:35.055 o plano pessoal foi salvo e às 14:06:35.990 o Team foi salvo; houve várias repetições no mesmo dia. Hoje o observador na raiz só verifica `current && availability === unavailable`, o que faz com que a escolha manual de um plano não contratado também dispare o fallback automático.

Regra final: quando a mesma conta e a mesma conexão atual passam de available / pending para unavailable de forma explícita, um aviso é exibido uma única vez, com um botão apontando para o plano substituto concreto. Sem clique, não há troca nem escrita de configuração. Se a pessoa usuária escolher manualmente um plano pessoal não contratado, pode permanecer nele sem ser devolvida pelo backend.

| Limite                            | Tratamento já confirmado                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Forma do aviso                    | Reutiliza o Toast existente, por exemplo: “当前体验套餐已不可用。” + “切换至「具体团队名」”; não é abrir primeiro as configurações ou um menu e escolher dali |
| Refresca repetida                 | Uma mesma indisponibilidade gera o aviso apenas uma vez; fechar o aviso, abrir as configurações ou um refresh comum da configuração do Provider não avisa de novo |
| Nova indisponibilidade após recuperação | É uma nova mudança de estado e pode gerar um novo aviso                                               |
| unknown / falha de consulta       | Não conta como indisponibilidade explícita, não limpa o último estado determinado e não usa fatos da conta antiga para julgar a conta nova |
| Troca manual / troca de conta / troca de identidade de Team | A nova identidade estabelece uma nova linha de base; não se pode comparar o available do Team antigo com o unavailable da nova pessoa                                     |
| Startup                           | O primeiro estado determinado só estabelece a linha de base; um unavailable já no startup não gera o aviso “ocorreu uma mudança” nem substitui automaticamente a conexão salva |
| Primeira execução sem escolha salva | Mantém-se a regra de inicialização existente; uma conexão antiga aguardando migração não é a primeira execução sem escolha e continua protegida pela migração |
| Sem alternativa disponível         | Na mesma indisponibilidade, só avisa o estado, sem oferecer botão de troca falso e sem selecionar automaticamente a entrada de compra |
| Persistência                       | Só grava em providerFamilyConnectionSelections quando a pessoa usuária clica e o envio tem sucesso; sem campo de deduplicação, migração ou novo arquivo de configuração |
| Start oculto                      | O filtro da entrada Start existente nas configurações não muda; este item não adiciona invisibilidade nem altera ProviderConfig.visibility |

Aqui se preserva a ação já existente de “escolher manualmente nas configurações salva a conexão”; este item não implementa a “separação entre navegar planos e conexão efetiva” discutida na rodada anterior. O problema do salto de volta é resolvido cancelando o fallback automático; sem entitlement, a execução continua igualmente bloqueada.

## 2. Estado, Observação e Limites de Envio

```text
现有账号 / 连接设置 + Provider Settings View 变更
                    |
                    v
App 根层观察器（内存；不随设置页开关卸载）
    身份切换 -> 新观察代次，废弃旧建议与在途结果
    首份确定状态 -> 基线，不提示
    同身份 available/pending -> unavailable -> 一次失效事件
                    |
                    v
只读计算具体备选套餐 -> Toast（不写设置）
                    |
                  用户点击
                    |
                    v
校验账号 / 原连接 / 目标身份及当前可用性
                    |
           既有设置服务条件写入
                    |
             既有 Provider 刷新
```

- A identidade observada precisa distinguir pelo menos o titular da conta, a Family e a seleção completa de conexão; um Team inclui productId / organizationId / projectId. Não se pode usar apenas o account Provider ID, já que dois Teams podem compartilhar o Provider ID sem representar a mesma conexão.
- A deduplicação do aviso vale para “uma indisponibilidade nesta geração de observação”, e não para o fingerprint JSON de toda a View, nem depende apenas do dedupeKey curto prazo do Toast. A geração é memorizada antes de iniciar a requisição, e resultados atrasados da conta ou seleção antiga não podem gerar aviso nem escrita.
- Indisponibilidades repetidas não são processadas de novo; unknown preserva o último estado determinado. Se a primeira for unknown, espera-se o primeiro estado determinado para estabelecer a linha de base. available → unknown → unavailable continua sendo uma indisponibilidade identificável.
- O ciclo de vida do observador acompanha a observação de conta do App, não a página. Na implementação é preciso conferir as dependências dos effects do React, para que uma atualização comum de configurações ou uma mudança de idioma não reconstrua a linha de base por acidente. Somente logout/troca de conta isola fatos antigos; não se cria outro sistema de polling ou retry.
- Quando a conexão original já foi recuperada, a pessoa usuária já trocou de conta/conexão, ou o alvo do botão também está indisponível, o botão antigo não pode enviar. Cliques repetidos não podem produzir trocas concorrentes.
- O botão fica vinculado a um alvo concreto e à identidade completa, exibindo o nome real do Team. A prioridade dos candidatos reaproveita ao máximo a lógica existente, mas a disponibilidade precisa ser confirmada; existir na lista de times não equivale a ter passado pela validação de entitlement do Team alvo. Não se pode trocar o Team A do botão por Team B, nem concluir que há entitlement apenas porque “existe um modelo”.
- Separe “calcular a alternativa” do “gravar a seleção” no método de coordenação antigo. A consulta assíncrona fica fora da fila de escrita; no envio, reaproveita-se a escrita condicional do serviço de configurações, verificando que conta/seleção não mudaram; sem novo Repo e sem trava de persistência.
- Se a escrita falhar, mantém-se a seleção original real, exibe-se a falha da operação e não se declara a troca; se a escrita tiver sucesso mas o refresh subsequente falhar, reconhece-se que a configuração foi salva e não se finge um rollback. Depois que uma sugestão antiga é invalidada, fecha-se/atualiza-se o aviso, sem escolher outro alvo em segundo plano e continuar enviando.
- Não clicar não modifica a seleção original; entitlement atual, Registry/Model e a resolução de Effective Selection continuam valendo, e não é permitido contornar as verificações de execução com o argumento de “preservar a seleção”.

## 3. Impact Brief

O modo é planning; a camada alterada é presentation, validation, commit-effect e startup recovery, envolvendo o domínio de conta/conexão/configurações. A estrutura de persistência não muda.

| Cenário / entrada de UI                 | Implementação compartilhada e owner de estado                                                        | Origem, validação e ponto de envio                                                        | Modo e isolamento                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Plano atual fica indisponível em runtime / Toast na raiz | useRootOAuthEffects → accountConnectionRefreshObserver; linha de base/indisponibilidade em memória | Estado determinado pelo Account View; somente leitura antes do clique e escrita condicional com settingService.update depois | Desktop/Web usam seus serviços injetados; sem nova sincronização remota |
| Seleção manual de pessoal/Team/Start nas configurações | ModelProviderSection → persistProviderFamilyModeForNavItem         | Continua salvando a conexão explícita da pessoa usuária; o observador cria a linha de base na troca de geração | Sem fallback por falta de entitlement; a regra de visibilidade do Start não é estendida |
| Restauração de uma conexão existente no startup | refreshRestoredOAuthProviderFamilyAfterStartup                       | Atualiza o fato e preserva a configuração existente; não salva mais substitutos automaticamente  | Distinta da inicialização de primeira execução sem escolha e da migração de dados antigos |
| Clique na sugestão do aviso             | actionLabel / onAction do Toast existente; reaproveita a resolução de alternativa | Revalida conta/seleção original/alvo; a escrita autoritativa continua sendo a do serviço de configurações existente | Sem alteração em massa de Session, tarefas, Bot ou Markdown |

| Nível            | O que inspecionar e qual relação semântica importa                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| must-inspect     | a detecção de estado de accountConnectionRefreshObserver.ts; a assinatura/Toast/ciclo de vida de useRootOAuthEffects.ts                     |
| must-inspect     | o caminho de escrita compartilhado no startup e na coordenação subsequente de oauthProviderFamilySelectionRefresh.ts, evitando mexer só no observador e ainda trocar automaticamente no startup |
| must-inspect     | o cálculo de alternativas de lib/modelProviderFamilyConnectionSelection.ts; a identidade completa do Team e a validação de disponibilidade efetiva                          |
| should-inspect   | a escrita de conexão manual, a pending selection e a passagem para a configuração salva em ModelProviderSection.tsx; o botão e o feedback de falha do Toast |
| invariant-only  | as camadas de Account State/Overlay/Registry, Off-Peak/Ticket, a requisição de modelo e a seleção histórica não mudam; sem nova sincronização remota antes do envio e sem alterar desktop-continuous / web-remote-replayable |
| evidence-only   | accountConnectionRefreshObserver.test.ts, os testes de recuperação do Root OAuth, os testes de Toast e os cenários de troca por indisponibilidade do SPMC-08 antigo                     |

A autoridade de estado continua dividida em três camadas: a Family Connection Selection persistida é a escolha da pessoa usuária; o AccountProviderState é o fato em tempo real; o Account Config Overlay é a projeção de configuração. O observador apenas consome fatos e propõe sugestões, não se tornando fonte de entitlement. O cálculo de alternativas e a escrita ainda estão acoplados e precisam ser separados, e o gatilho de envio da escolha explícita nas configurações e o do aviso de indisponibilidade são deliberadamente diferentes.

O codegraph não tem ferramenta chamável no momento, então os caminhos acima foram conferidos por leitura de imports/callers precisos até a profundidade 2, sem alegar varredura de todo o domínio. Graph drift: a surface.provider-settings existente não registra a semente de coordenação de planos na raiz; esta rodada adiciona a origem/semente e o invariante de “ainda não implementado”, sem criar um novo conjunto de entidades de estado de Provider. Os testes listados ainda não foram executados com a nova semântica deste item.

## 4. Registro de Decisões e Plano de Testes

2026-09-08: a pessoa usuadora pediu para cancelar o salto automático e exibir o aviso uma única vez, apenas quando houver mudança; foi escolhido explicitamente o botão “切换至具体目标”, e não abrir um menu. Esta rodada confirmou que no startup o primeiro estado apenas cria a linha de base, sem deduplicação persistida, e que o filtro de Start não é tocado. Não há bloqueios aguardando decisão de produto.

A dimensão usada é transição de estado × geração de identidade × momento do clique × resultado da escrita, com BigModel/Z.ai como caso representativo e simétrico, sem enumerar todas as marcas/modelos. Tema e idioma verificam apenas a legibilidade do Toast existente e o nome do alvo; o estilo do Toast não é redesenhado.

| Case   | Pré-condição / ação                                                              | Asserções obrigatórias                                                       | Evidência / status                                     |
| ------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| C93-01 | O plano disponível atual vira unavailable, com alternativa legítima            | Um aviso contendo o alvo concreto; nada é gravado antes do clique              | accepted; teste unitário do observador + Electron/leitura de disco, pendente |
| C93-02 | Refresh repetido do mesmo estado, abrir/fechar as configurações, fechar o Toast | Nenhum novo aviso e nenhuma escrita; abrir as configurações não reseta a linha de base | accepted; teste unitário + Electron, pendente |
| C93-03 | unavailable → available → unavailable                                           | A segunda indisponibilidade real avisa de novo                                | accepted; teste unitário da sequência de estados, pendente |
| C93-04 | available → unknown → unavailable; unknown inicial → unavailable               | O primeiro só avisa na indisponibilidade determinada; o segundo cria a linha de base sem avisar | accepted; teste unitário, pendente |
| C93-05 | Troca manual de um Team para um pessoal não contratado; troca para outro Team; troca de conta | Sem comparação entre identidades; permanece na página pessoal, sem reescrita automática; resultados assíncronos antigos descartados | accepted; teste unitário + Electron/leitura de disco, pendente |
| C93-06 | unavailable já salvo no startup; primeira execução sem escolha; conexão antiga aguardando migração | O primeiro não avisa nem substitui; os dois outros mantêm seus limites de inicialização/migração | accepted; teste unitário de startup + E2E de cold start, pendente |
| C93-07 | pending → unavailable; pending → available                                    | O primeiro avisa; o segundo não é tratado como indisponibilidade; pendente não é falta de entitlement | accepted; teste unitário, pendente |
| C93-08 | Clicar no botão de um Team concreto e clicar de novo                          | Grava uma única vez a identidade completa apontada pelo botão; depois View e conexão efetiva coincidem | accepted; escrita condicional do serviço + Electron, pendente |
| C93-09 | Depois do aviso, trocar manualmente, trocar de volta, trocar de conta, recuperar o plano original, alvo ficar indisponível | Uma sugestão antiga não pode sobrescrever a nova intenção nem trocar de alvo e enviar sozinha | accepted; teste unitário assíncrono controlado + E2E representativo, pendente |
| C93-10 | Sem alternativa, ou falha na consulta de alternativas                          | Não oferece alvo falsamente disponível, não salva entrada de compra e não gera aviso em ciclo nem retry em segundo plano | accepted; teste unitário, pendente |
| C93-11 | Falha ao salvar depois do clique; sucesso ao salvar e falha no refresh            | Distingue corretamente se a configuração real mudou, com erro visível e sem falso sucesso nem falso rollback | accepted; teste unitário + E2E de falha de operação, pendente |
| C93-12 | Chinês/inglês, tema claro/escuro, tela estreita e operação por teclado          | Alvo claro e botão acessível; injeta-se o mesmo serviço de configurações e o fluxo de mensagens de celular/desktop não muda | accepted; casos representativos de Toast/layout, pendente |

Podas: revisão comum de configuração e indisponibilidade contínua não constituem evento novo; unknown de rede não constitui indisponibilidade; um plano que não é o current não dispara este aviso; Off-Peak não tem current e não entra em sugestão automática; migração de dados, remapeamento de modelos, reformulação da entrada Start e o resgate de “立即体验” estão fora deste item.

Entrega de E2E: antes da implementação, revisar com o e2e-case-lifecycle os fixtures de conta já existentes e o processo de revisão manual; testar com dados isolados e respostas de conta controláveis, sem consumir cota de conta real. Estender o SPMC-08 antigo, revogando sua expectativa de “troca automática ao refrescar”, sem remover a cobertura da cadeia de indisponibilidade. O timing é controlado por eventos/chamadas concluídas e asserções de leitura de disco, sem sleep fixo; o Mac Electron valida o clique e a persistência reais, e um viewport estreito não substitui a aceitação completa do controle remoto no celular.

## 5. Registro de Execução e Revisão

- [x] Confirmar o fenômeno no Air e os caminhos de código atuais, registrando esta decisão de produto.
- [x] Criar este Todo; referenciar de volta o Todo88 R06, a spec de configurações atual, a matriz de cobertura e o mapa de funcionalidades.
- [x] Escrever primeiro os testes de estado/startup/corrida do clique, confirmando que a implementação antiga falha.
- [x] Separar a consulta de alternativas do envio, modificando o observador, a fronteira de startup e a ação do Toast; limpar a lógica de escrita automática que foi substituída.
- [x] Executar os testes unitários afetados, typecheck e lint; validar em Electron isolado as interações-chave de C93 e a leitura de disco.
- [x] Revisão: verificar todos os chamadores de escrita, procurar corridas no closure antigo do Toast/identidade de conta/identidade de Team; conferir que não houve nova migração nem mudança de visibilidade do Start.
- [x] Preencher as evidências de teste e os itens não cobertos; o commit foi junto deste registro.

### 2026-09-08 Implementação e Revisão

- AccountProviderState.connectionKey é um resumo do titular da conta, da Family e da conexão completa da mesma rodada, sem identidade/credencial em texto puro, sem entrar no Config e sem ser persistido. API/Off-Peak comuns não acrescentam current. O teste unitário verifica a estabilidade do resumo, a mudança ao trocar de conta e a ausência do resumo no Config.
- Um hook raiz independente assina o View, e redesenhos de idioma/página não reconstroem a linha de base. Mudanças de intenção de configuração/conta descartam imediatamente o closure antigo; unknown preserva a linha de base determinada. Sem polling, sem deduplicação persistida e sem arquivo de configuração extra.
- O fallback automático compartilhado entre startup e observador foi removido. Uma escolha existente não é reescolhida no startup; a primeira execução sem escolha reaproveita a inicialização original e a proteção de unknown da migração pendente. O login OAuth ativo e sua escrita condicional permanecem com regressão preservada.
- As sugestões verificam pela prioridade já existente de pessoal, Team concreto e Start; o Team é validado pelo projeto completo e o alvo salvo é fixo. Nada é gravado antes do clique da pessoa usuária; sugestão antiga/plano original já recuperado/alvo já indisponível não são gravados, e cliques repetidos não geram escritas concorrentes.
- Uma falha de escrita oferece retentativa explícita para a mesma sugestão; uma falha de refresh após um save bem-sucedido não é disfarçada como rollback. Nomes longos de Team seguem no Toast e permitem quebra de linha no texto do botão.
- Limpeza do antigo onConnectionReplaced / parâmetro onlyIfProviderId, dos textos de troca automática e das expectativas dos testes antigos de substituição automática; os casos de startup foram agrupados em duas Families × três tipos de conexão, preservando a cobertura da corrida de login independente.

Validação: 57 asserções em 6 arquivos direcionados passaram, 11 em dois arquivos de Toast passaram; o typecheck raiz passou e o lint ficou com 0 erros / 40 warnings já existentes.

Diretório Pro isolado: /Users/dev/zcode-todo93-e2e.88xgST. A segunda rodada do SPMC passou 4/4, run desktop-e2e-20260908-100921-925. O SPMC-08 mediu em ambiente real que a indisponibilidade não grava, que o clique com falha de save é tratado, que a retentativa manual após restaurar as permissões do diretório tem sucesso e a leitura de disco; o diretório de conta do dia a dia não foi tocado.

A primeira rodada desktop-e2e-20260908-100502-105 deu 3/4: o SPMC-08 do 93 passou, mas o SPMC-02 antigo não encontrou o botão de refresh depois de publicar o saldo. Os logs confirmam que o backend já havia obtido o novo saldo e que o botão desapareceu normalmente; a mudança foi verificar primeiro a requisição de refresh do cartão e só então publicar o saldo, usando um refresh global estável para verificar a convergência. Apenas a ordem do fixture foi ajustada, sem mudar o produto e sem engolir a falha; a cobertura completa de resgate/navegação/edição dinâmica de modelo/mudança de seleção da segunda rodada foi preservada.

Não coberto: invalidação de entitlement em conta real, controle remoto real no celular e UI no Windows; fixtures de conta falsa/billing não consomem cota da pessoa usuária. O C93-12 completo em chinês/inglês, tema claro/escuro e visual no celular ainda exige revisão manual, e a aprovação no desktop não é apresentada como aprovação em todas as plataformas.

Revalidação final (incluindo a mudança de quebra de linha em nomes longos do Toast): run Pro desktop-e2e-20260908-101239-586, 4/4 aprovado. Comando executado: ZCODE_E2E_MANUAL_REVIEW=1 ZCODE_E2E_SKIP_AGENT_BUILD=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec ./test/e2e/start-plan-manual-claim-experience.test.ts. As duas aprovações completas preservam cliques e asserções de arquivo reais; resultados antigos de troca automática não são usados como evidência da nova regra.

### Revisão complementar antes do push (2026-09-08)

O teste de associação ampliado pelo hook de push encontrou uma lacuna: `rootAccountRefreshLifecycle.test.ts`, depois de mockar o React, executa manualmente apenas o primeiro effect; como a assinatura foi movida para um hook separado, ele executava de fato apenas o effect de invalidação de intenção e por isso reportava ausência de assinatura indevidamente. A primeira regressão de associação deu 469 arquivos aprovados e 1 arquivo reprovado (4721 asserções aprovadas, 1 reprovada, 7 puladas).

Apenas esse teste foi ajustado: passou a usar o `renderHook` real para montar o ciclo de vida completo, completando as dependências de plataforma/difusão e a intenção de conta; confirmou que o erro de refresh de startup já foi capturado, que a assinatura continua existindo e é estabelecida apenas uma vez, e que a desmontagem limpa corretamente. Sem afrouxar asserções, sem modificar comportamento de produção e sem religar o teste por índice de effect. Os dois arquivos direcionados passaram 7/7; as evidências de E2E Pro existentes continuam correspondendo a um código de produto inalterado.