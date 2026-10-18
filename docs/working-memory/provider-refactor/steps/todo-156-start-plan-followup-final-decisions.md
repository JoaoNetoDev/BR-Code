# Todo156：Correções subsequentes do Provider Start independente e decisões finais de página

> Estado: em 2026-09-17 F01–F09 foram implementados conforme autorizado e a auto-revisão foi concluída; a verificação necessária ainda tem falhas de baseline; o usuário, ciente disso, pediu explicitamente o commit e o push. Implementação, evidências de verificação e itens não cobertos estão em §14.
> Origem: revisão posterior à entrega de [Todo154](todo-154-start-plan-independent-provider.md), feedback do Air e discussões item a item seguintes.
> Este item substitui o escopo inicial de implementação de [Todo155](todo-155-start-plan-selection-dependency-cleanup.md); o Todo155 preserva o histórico da investigação e, em caso de conflito, valem as decisões finais deste item.
> Baseline de revisão: `f2b40bda8c`; o rascunho não commitado de etiquetas antes da implementação está em §11; nesta rodada ele também foi revisado.

## 1. Escopo final e atribuição de estado

Esta rodada corrigiu as dependências residuais do Start em relação ao antigo modo de conexão, organizou a exibição de estado do Provider permanente, corrigiu o dropdown de conexão de equipe e adicionou o nome do plano ao aviso de modelo da sessão; a revisão posterior confirmou o preenchimento da recomendação de commit da tela secundária criada com uma pergunta (F08, ver §12), além do compartilhamento do saldo da recomendação, refresh sob demanda e validade de 60 segundos (F09, ver §13). Mantêm-se a semântica dos componentes existentes, do owner dos dados e do protocolo de execução; o contrato de passagem do modelo da primeira mensagem da tela secundária foi completado antes da implementação.

| Fato                         | Fonte autoritativa                                       | Local de exibição／consumo                        |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Modelo usado na próxima submissão | Provider, model e options válidos da caixa de entrada／do formulário | Quota da caixa de entrada, recomendação do mesmo modelo no momento da submissão |
| Modelo executado e erros    | Fato de execução da sessão                               | Saldo da sessão e lembretes de erro de negócio    |
| Trocas de modelo históricas  | fromProvider/fromModel, toProvider/toModel registrados   | Dica de separação da troca, sem ler o rascunho atual nem deduzir pela conexão |
| Identidade e entitlement do Start | Conta logada atual, Account Source                        | Disponibilidade de Provider, Registry, página de configurações |
| Escolha de conexão paga      | Escolha já salva e escolha feita na submissão            | Dropdown pessoal／de equipe, com correspondência completa de identidade de equipe |
| Saldo do plano               | Serviço UsageEntitlement existente                       | Exibição por plano e bucket de cota, sem criar um segundo estado de saldo |

```text
登录账号 → Account Source → Start 权益与 Registry
                                  ↓
输入框有效 Provider / model → 对应额度与提交推荐
会话执行 Provider / model  → 会话余额与错误反馈
历史切换前后 Provider      → 历史套餐名称

已保存付费连接 + 原提交中选择 → 付费下拉选中项 / 团队 scope
                             不作为 Start 的额外门禁
```

`current` continua significando o contexto de acesso da conta correspondente; Start e um Provider pago podem ser true ao mesmo tempo; não é a seleção da caixa de entrada e não é usado para adivinhar o item selecionado do dropdown. Mantêm-se o continuous do desktop, o replayable do celular e o owner original da submissão.

## 2. F01：A quota do Start na caixa de entrada deixa de depender da conexão antiga

**Descoberta**: em `V4ComposerToolbar.tsx`, `resolveV4ContextPlanConnection`, depois de o Start ser selecionado na caixa de entrada, ainda exigia que a seleção global existisse e tivesse kind start-plan. Os estados globais pessoal／equipe／sem seleção retornam none.

**Impacto**: em uma sessão nova, sem uso de contexto, o anel pode desaparecer por completo; havendo uso de contexto, o anel pode aparecer, mas o overlay continua sem o saldo do Start. O anel também comporta o uso de contexto e não pode ser tratado como o ponto de estado do Start.

- [x] Remover a condição extra de conexão do branch do Start e fornecer o saldo correspondente conforme o Provider e o modelo válidos da caixa de entrada.
- [x] Continuar usando o entitlement da conta original, os modelos, a validação de configuração e a entrada de refresh de cota existentes.
- [x] Preservar a dependência das cotas pessoal／de equipe ao scope pago correto, sem alterar a semântica de todos os Providers.

## 3. F02：Falha de preenchimento do time antigo deixa de bloquear o Start

**Descoberta**: `settingService.prepareLegacyAccountConnections` → readAccountProviderSettings em `node.ts` → `accountProviderConnectionResolver.ts`. Quando a equipe antiga não tem organizationId e o preenchimento falha, surgem unresolvedFamilies; hoje isso marca como unknown os Providers da mesma marca, incluindo o Start, e pula a consulta.

- [x] Remover essa restrição para o Start; o Start continua consultando entitlement de forma independente pela conta logada.
- [x] Na falta de informações da equipe, manter a restrição de acesso pago que depende dessas informações, sem adivinhar organização／projeto.
- [x] Não adicionar migration, mecanismo extra de recuperação ou barreiras complexas de corrida.

Um teste existente chegou a afirmar que o Start ficava unknown junto com a marca inteira; isso precisa ser alterado para a nova expectativa correta. Este defeito tem evidência de código e de teste, mas não é uma causa comprovada do fenômeno anterior de expiração de plano no Air.

## 4. F03：Resgate, feedback de sucesso e ver o plano

Dois fluxos precisam ser distinguidos: a entrada／modal de resgate ativo é suportada pelo Marketing Touch; o antigo `manualClaimPlanModelGuideStore` e o consumer da Toolbar esperavam pelo Start global, escolhiam o modelo automaticamente e mostravam «Start 已就绪». O guia antigo não encontrou nenhum solicitante em produção.

**Fluxo final**:

```text
原活动入口 → 原验证与领取 → 成功反馈
                              ├→ 刷新 Provider 权益与余额
                              └→ 用户点击“查看套餐” → 常驻 Start 详情

用户主动选择 Start 模型，或提交时接受既有同模型推荐 → 实际使用 Start
```

- [x] Manter a entrada de resgate original, as operações, o modal de sucesso e as regras de elegibilidade da campanha; o resgate não altera o modelo da caixa de entrada nem a conexão paga global.
- [x] O botão que leva às configurações passa a ser uniformemente expresso como «查看套餐». O conteúdo e os botões reais vêm da configuração remota; na implementação é preciso conferir a entrega real e a ação de navegação, não apenas tratar o texto local.
- [x] O Start fica permanente e, ao clicar, abre os detalhes; enquanto o refresh de entitlement não termina, mostra-se nos detalhes o feedback de carregamento existente, sem criar um fluxo dedicado de espera pela entrada aparecer.
- [x] Tratar separadamente o sucesso da interface de resgate e o sucesso do refresh; falha de refresh não pode reverter o resultado do resgate.
- [x] Limpar o antigo guia de escolha automática de modelo sem entrada em produção e seus resíduos dedicados; não restaurar o «立即使用» com escolha automática de modelo nem adicionar outra camada de dicas na caixa de entrada.
- [x] A entrada de resgate continua independente do plano que o usuário possui no momento, exibida conforme a elegibilidade original da campanha.

## 5. F04：Completar os parâmetros de acesso de conta nas consultas de saldo

**Descoberta**: as chamadas a seguir fornecem preferredProviderId, mas omitem accountAccess; `useUsageEntitlement` não completa os parâmetros e `BigModelUsageQuotaProvider` não deduz apenas pelo ID, então o Start pode retornar not_configured, provider=null e quota=null.

| Local da chamada                                        | Escopo da correção                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `useV4SessionQuotaBanner.ts`                            | completar a descrição de acesso conforme o Provider realmente executado; manter os branches de erro originais do servidor |
| `usePlanIdentitySnapshot.ts`                            | verificar as consultas de Start／pago, completar os parâmetros mas manter o uso original de estatística de identidade de plano |
| Refresh de saldo após resgate em `MarketingTouchProvider.tsx` | completar a descrição de acesso dessa consulta de Start, reutilizando ainda o serviço existente |

- [x] Corrigir essas chamadas de interface, sem exigir que o usuário se conecte de novo e sem copiar credenciais para a UI.
- [x] Cobrir cache frio, cache existente e refresh, evitando que outra entrada preencha o cache e mascare a falta de parâmetros.
- [x] Não vincular o feedback da sessão ao modelo do rascunho ainda não submetido, nem criar novo owner de cota.

## 6. F05：Start permanente e organização do estado do lado direito

### 6.1 Decisão final de produto

**O Provider Start fica permanente. A discussão anterior de «ocultar o Provider quando não há plano» foi retirada.** Mantêm-se as regras de exibição de marca já decididas, o nome Start unificado e o ID real. Decisão complementar em 2026-09-17: os dois planos de experiência compartilham o ícone com a letra Z fornecido pelo usuário; planos pessoal／de equipe mantêm seus respectivos ícones de marca. Uma entrada permanente não significa ter sempre um modelo executável.

O «编程套餐／未连接／配置暂不可用» da captura original misturava ausência de plano, falha de consulta e configuração ausente. Esta rodada corrige a classificação de estados, reutiliza componentes de página existentes e não refaz a página inteira.

| Situação                            | Exibição e ação finais                                  | Natureza original／nova                              |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Não logado                          | Explicação de login exclusiva do Start + entrada de login | Ajuste de texto e de integração, reutilizando o fluxo de login original; não se chama de conectar o Start |
| Primeira consulta, sem conteúdo existente | «查询中＋转圈» original                             | Reutilizado, sem novo skeleton                      |
| Explicitamente sem plano válido     | Nenhum plano de experiência disponível; mantém a apresentação original e a entrada de campanhas aplicáveis | Ajuste necessário do estado vazio do Start |
| Plano válido                        | Card de plano, card de cota, upgrade e gestão de modelos originais | Reutilizado; removidos conectar／desconectar e o dropdown de conexão paga |
| Pendente de vigência                | Tempo «待生效» em verde original                       | Reutilizado, sem prometer que já está executável      |
| Horário de vigência atingido, cota não sincronizada | Botão original «刷新权益»               | Reutilizado                                         |
| Cota esgotada                       | Card original com 0%, barra de progresso vazia, 0 / total; mantém informações do plano e gestão de modelos | Reutilizado, sem novo alerta de esgotamento |
| Falha na primeira consulta          | Estado de falha original com retry conectado            | Correção de classificação e ação; não mostra «sem plano» nem «não conectado» |
| Falha no refresh em segundo plano   | Reutiliza cache／tratamento de erro existente           | Sem nova barra persistente de falha sobre o conteúdo antigo e sem ampliar a regra de retenção de cache |
| Login／credencial claramente inválida | Conecta à ação original de relogar        | Correção de classificação necessária; falha de rede comum só faz retry |
| Falta real de configuração do Provider | Só então exibe configuração indisponível | Correção do julgamento de erro; não pode ser disparada por falta de plano ou falha de saldo |

- [x] Verificar em conjunto `providerFamilyConnectionVisibility.ts`, `Detail.tsx`, `StatusCards.tsx` e as entradas originais de resgate／apresentação, evitando que alterar apenas o texto esconda as ações.
- [x] Com plano, manter o nome original do plano, a informação de expiração, os cards de cota por plano, os buckets de cota por modelo, o upgrade e o layout de gestão de modelos.
- [x] Múltiplos planos continuam agrupados com precisão por plan_id; um bucket de cota esgotado não afeta a exibição dos outros nem limpa a página inteira.
- [x] Só exibir o estado vazio quando a interface provar explicitamente que não há plano válido. Não inferir histórico de resgate nem «已到期» apenas quando retorna no_plan.
- [x] Sem lista dinâmica de modelos, não fabricar modelos; a permanência do Provider e os modelos executáveis do Registry são julgados de forma independente.

### 6.2 O que está explicitamente não sendo adicionado

- Não adicionar uma barra de alerta dedicada de «cota esgotada» nem estilo que fique vermelho após o esgotamento.
- Não adicionar skeleton de primeiro carregamento; reutilizar o texto de consulta e o spinner.
- Não adicionar uma barra persistente de «refresh falhou» sobreposta ao conteúdo antigo; falhas de ação explícita reutilizam o feedback de erro existente.
- Não adicionar um ponto de carregamento do Start, não modificar o significado atual do cinza e não estender o sistema de cores do lado esquerdo. Mantêm-se o cinza desabilitado／verde executável／laranja de indisponibilidade e o feedback de carregamento por grupo já existente.
- Não mudar para manter dados antigos em qualquer erro de refresh. O Hook atual só lança erro mantendo o snapshot para alguns refreshes silenciosos; falhas comuns ou um snapshot indisponível retornado pelo serviço podem limpar／substituir, conforme o contrato original.

### 6.3 O tempo da cota não é um recurso residual

Nos logs reais do Air em `2026-09-17.log`, a resposta de saldo às 01:12:06 (horário de Pequim) de 2026-09-17: entitlement period=daily; dois buckets com expires_at=1789660799 (17 de setembro, 23:59:59); plan ends_at=1790006399 (21 de setembro, 23:59:59). O log prova que esses dois tempos distintos foram realmente retornados.

```text
balance.expires_at → limit.nextResetTime → 本额度桶的时间
plan.ends_at      → expireTime          → 整份套餐到期日期
```

- [x] Manter a exibição de tempo original; cada bucket usa apenas o próprio expires_at, sem recorrer ao tempo de expiração do plano como reserva.
- [x] Não fabricar tempo quando o campo não existe; não prometer adicionalmente que «a cota necessariamente retorna neste horário», pois o último período pode expirar junto com o plano.

## 7. F06：O dropdown de conexão de equipe reflete com precisão a escolha paga

### 7.1 Motivo da introdução

`feeca80bd4` manteve para os usuários antigos do Start a entrada «o único candidato pago ainda pode ser escolhido ativamente», acrescentando o julgamento por `selectedOption.item.provider.accountState.current`. Como o item de equipe herda a antiga estrutura de objeto do Provider pessoal, ele foi mal interpretado; além disso, a dica de value vazio foi escrita no subconteúdo do SelectValue em vez do placeholder, restando apenas a seta.

### 7.2 Correção determinada nesta rodada

- [x] Passar diretamente a escolha paga que já existe na página de configurações (salva + escolhida na submissão original), sem criar novo estado.
- [x] Reutilizar a lógica de correspondência completa existente: pessoal por marca e tipo; equipe por marca, organização, projeto e identidade do plano.
- [x] Remover o julgamento que adivinha o item selecionado a partir do provider.current do item.
- [x] Quando não houver correspondência, não pegar arbitrariamente o primeiro item; passar corretamente o placeholder «请选择套餐».
- [x] Com item único já selecionado, manter o comportamento de ocultação; com item único não selecionado, manter o dropdown operável.
- [x] Equipe temporariamente indisponível não equivale ao usuário cancelar a escolha; não limpar o estado selecionado apenas por mudança de disponibilidade; os detalhes exibem o motivo correspondente.
- [x] Trocar para o Start na caixa de entrada não altera o dropdown global de conexão paga.

### 7.3 Postergação explícita

Os itens de equipe são construídos copiando os dados do plano pessoal, e os três branches podem herdar campos de provider, entitlement, assinatura e cota. Este é um problema estrutural já identificado, mas o usuário decidiu **deixar para uma governança posterior**.

Nesta rodada não se reconstrói explicitamente todos os itens de equipe, não se extrai um construtor único de equipe e não se substituem por completo os campos herdados; apenas corta-se a dependência incorreta do julgamento de seleção do dropdown em relação a esse objeto. Não se pode continuar tratando o «governar de passagem enquanto se faz isso» levantado no meio do caminho como escopo desta rodada.

## 8. F07：O aviso de modelo da sessão ganha identificação do plano

```text
GLM-5.3(个人套餐)
GLM-5.3(体验套餐)
GLM-5.3(团队套餐)

模型已切换 GLM-5.3(团队套餐) → GLM-5.3(体验套餐)
```

- [x] Os dois lados são rotulados separadamente, permitindo distinguir a origem da cota mesmo com modelos de mesmo nome; outros modelos usam o mesmo formato.
- [x] Cobrir a dica de separação da troca na sessão, a primeira dica «正在使用» e o toast correspondente da troca.
- [x] O tipo vem do Provider ID real do próprio registro／dica, com suporte a BigModel, Z.ai e internacionalização.
- [x] O histórico é renderizado diretamente pela nova regra, sem migração; mudanças de conta, conexão, rascunho ou catálogo não corrigem erradamente o plano histórico.
- [x] Providers personalizados mantêm a regra de nomes original; o botão da caixa de entrada, o menu de modelos e as etiquetas de Subagent não têm a modificação ampliada.

## 9. Limites comuns e alinhamento de documentação

- Não migrar dados de sessão, tarefa, automação, Subagent, Bot ou seleção de modelo; manter a leitura de compatibilidade do antigo kind:start-plan.
- Não mesclar os Provider IDs das duas marcas nem iniciar a coexistência completa pessoal／múltiplas equipes do Todo101.
- Start sem entitlement／indisponível não consome silenciosamente cota paga; resgate e navegação não alteram o modelo nem a conexão paga global.
- A recomendação do mesmo modelo mantém a validação de compatibilidade de pensamento e a escrita de volta de original submitted／accepted; disparo de tarefa, execução em segundo plano, execução imediata e Bot não ganham nova recomendação.
- Não adicionar barreiras de corrida de leitura de identidade, reenvio automático, uma segunda fila de accepted, nem estado de conexão ou de cota.
- [x] Antes da implementação, alinhar a spec oficial do Start, o feature graph relacionado e as decisões finais deste item, eliminando descrições antigas como «o Start é uma opção de conexão e, quando invalida, volta automaticamente para o pessoal»; manter o design original dos componentes e não introduzir o candidato já retirado.
- [x] Verificar referências reais antes de deletar o guia antigo e afins; fazer a limpeza apenas para o fluxo descontinuado dedicado, sem remover a leitura de compatibilidade de formatos históricos válidos.

## 10. Regressão e review final

| Número | Cenário que precisa ser verificado                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF-01  | Duas marcas × pessoal global／equipe／sem seleção／Start histórico; o Start selecionado na caixa de entrada fornece normalmente sua cota                                                                 |
| SF-02  | Sessão nova sem contexto, sessão com contexto; anel de cota, conteúdo flutuante e refresh normais; após trocar para pago, exibe o scope correto                                                                      |
| SF-03  | Falha de preenchimento da organização da equipe antiga, o Start ainda consegue consultar de forma independente; o acesso de equipe mantém a restrição original                                                          |
| SF-04  | Saldo da sessão, snapshot de identidade, consulta de saldo após resgate: cache frio／cache existente／refresh passam todos a descrição de acesso correta                                                                  |
| SF-05  | Start permanente: não logado, consultando, sem plano, válido, pendente, falha e login inválido exibem o estado e a ação corretos                                                                                          |
| SF-06  | Cota zero mantém o card original; múltiplos planos e buckets não misturam dados; tempo do bucket separado do expiração do plano, sem fabricar quando o campo não existe                                                                   |
| SF-07  | Após o resgate bem-sucedido não muda modelo／escolha paga; «查看套餐» abre direto os detalhes permanentes; falha de refresh não reverte o resgate                                                                                     |
| SF-08  | Equipe selecionada e pessoal não habilitado, o dropdown mostra a equipe; equipe temporariamente indisponível não é limpa por current; correspondência completa de identidade de equipe                                                     |
| SF-09  | Usuário antigo do Start sem escolha paga mostra «请选择套餐»; o único candidato pessoal pode ser escolhido ativamente; não pegar o primeiro automaticamente                                                                           |
| SF-10  | Duas marcas, três tipos de plano, modelos de mesmo／diferente nome, catálogo ausente e replay histórico: sufixos corretos na dica de separação／primeiro uso／toast                                                                            |
| SF-11  | Etiquetas de Providers personalizados inalteradas; chinês／inglês, temas claro／escuro, desktop e tela estreita do celular sem truncamento／overflow; nenhum novo sistema de estados à esquerda           |
| SF-12  | Parsing exato do Start, autenticação de requisição, recomendação do mesmo modelo, resgate, owners de armazenamento e limites continuous／replayable sem regressão                                                                            |
| SF-13  | Primeira submissão de `/side <问题>`: compatível e com cota pode recomendar; confirmar afeta apenas o child e não herda sua escolha original; fechar não cria／envia e preserva o rascunho; `/side` vazio não dá dica; ambos os modos de entrega mantêm a idempotência e a admission originais |
| SF-14  | Recomendação, página de configurações e overlay da caixa de entrada compartilham o resultado de saldo da mesma conta e do mesmo Start; após refresh a zero na página de configurações, a recomendação não pode continuar usando o saldo positivo antigo; resultados de outras contas／Providers não são misturados |
| SF-15  | Se o saldo da recomendação não passou de 60 segundos, julga pela cota real; passando de 60 segundos ou desconhecido, faz refresh em segundo plano, mantém a escolha original nesta vez e não espera a consulta; após sucesso, a próxima submissão adota o novo resultado |
| SF-16  | Mesma marca A → B: reutiliza o mecanismo de refresh de conta／Provider para ler o saldo de B; permite uso transitório breve, mas para de usar para recomendação uma amostragem antiga que excedeu a validade; falha de consulta mantém o backoff existente e não bloqueia a submissão |
| SF-17  | Troca de sessão, remontagem após desmontar, entrada no dia seguinte não podem fazer um saldo antigo voltar a parecer novo; acessos repetidos reutilizam o throttling de 60 segundos e a mesclagem de requests em voo, sem polling extra quando não há ação                    |
| SF-18  | Verificação da validade do bucket no momento da submissão: mesmo com snapshot novo, um bucket já expirado não é recomendado; o tempo do servidor conta o tempo decorrido desde a amostragem, mantendo a regra original de exibição do tempo do bucket／do plano |
| SF-19  | Resgate／mudança de entitlement dispara a cadeia original de refresh e sincroniza a base da recomendação; quota zero existente que passa a positiva retoma a recomendação, ainda sem troca automática de modelo; cobrir todas as entradas de recomendação e o caminho do celular no mesmo Host |

As expectativas antigas dos testes, «é preciso ter o Start selecionado globalmente para ter cota» e «com falha de preenchimento da equipe antiga o Start também precisa ficar unknown», devem ser corrigidas em conjunto, sem manter asserções contraditórias. Primeiro escreve-se um teste capaz de provar a expectativa correta, só então se implementa.

Portão de implementação: freshness do workspace, git status; typecheck, lint, architecture:check --changed e testes afetados necessários. Por pedido do usuário, os E2E correspondentes foram executados via **Pro admin SSH**, obedecendo ao e2e-case-lifecycle; a verificação de tema claro／escuro e tela estreita não é apresentada como um celular físico nem como um E2E completo de Web shared-host, e os itens não cobertos são listados explicitamente.

- [x] Review completo: problemas, fontes de estado, parâmetros de chamada, atribuição de campos e caminhos de erro foram revisados item a item, com novos cenários de aceitação acrescentados; ver §14.
- [x] Autorização de commit: o lint de baseline da CLI e a verificação de limites do protocolo antigo ainda falham, o que foi explicado ao usuário; em seguida o usuário pediu explicitamente o push das mudanças desta rodada. Os registros de falha foram mantidos e os hooks de verificação do Git foram executados normalmente.

## 11. Pausa antes da implementação, cena e limites de evidência (histórico)

- Durante a investigação, 5 arquivos de teste existentes passaram em 118 casos; ainda havia ali asserções de semântica antiga, que não provam que o problema desta rodada foi resolvido.
- Sondas no código original verificaram oito combinações de conexão entre as duas marcas, e só o antigo start-plan retornava o contexto de cota do Start; consultas sem accountAccess retornavam um snapshot vazio not_configured.
- Antes da pausa havia apenas rascunhos não commitados relacionados a etiquetas: `packages/ui/src/v4/composer/modelTriggerDisplay.ts`, `ConversationRowView.tsx`, `SessionPane.tsx`, `packages/ui/test/v4ConversationRowViewTimelineMarker.test.ts`, e os trechos de regras de etiqueta em `docs/zai-start-plan-provider.md`.
- O rascunho de etiquetas chegou a verificar primeiro 7 falhas; após a modificação, os 2 arquivos relacionados passaram em 28 casos; a verificação completa de código, a validação visual／no dispositivo e o review final não foram concluídos, sem commit／push.
- Esta rodada apenas criou o TODO de decisão e atualizou a entrada, sem continuar a implementação de produto e sem reverter sozinho rascunhos existentes. Ao retomar a implementação, revisar os rascunhos de forma unificada conforme este item, sem marcá-los como concluídos diretamente.
- Na revisão completa da cadeia posterior, o usuário confirmou o acréscimo de F08 e também confirmou o compartilhamento do saldo da recomendação, o refresh sob demanda e a validade de 60 segundos de F09. O usuário permite um breve uso transitório ao trocar de conta, mas não de forma permanente, e não quer que isso sirva de base para novas barreiras complexas de corrida de identidade; a decisão concreta está em §13 e deixa de ser marcada como pendente de discussão.
- Dúvidas condicionais sobre atribuição de cota／chave de lista em múltiplas instâncias foram verificadas contra o baseline: `StartPlanBalanceCard.tsx`, `StartPlanContextBalance.tsx`, `bigmodelUsageQuotaProvider.ts` não têm diferenças em relação ao `2772217134` anterior à mudança nem ao `origin/staging` local no momento da revisão. Sondas com entradas construídas não provam que a interface de produção permite essa combinação, portanto não é listado como defeito comprovado introduzido desta vez, e as regras originais de agrupamento／exibição já determinadas em F05 não são alteradas por conta própria. O histórico `13bb702b38` chegou a retirar o endurecimento da chave sob o contrato de unicidade por entitlement_id, e depois `853b93b2c2` restaurou esse tópico para uma versão anterior; a explicação histórica não substitui a verificação do contrato atual da interface.

## 12. F08：Preencher a recomendação de commit da tela secundária criada com uma pergunta

**Confirmação**: solicitado pelo usuário em 2026-09-17. Hoje o `SessionPane` retorna cedo para `/side <问题>`, chamando `createSelectionSideSession({ firstInput: { text } })`; a CLI, após criar o child, inicia direto a primeira mensagem, contornando a recomendação de plano de experiência no caminho comum de envio. A continuação comum de uma tela secundária normal continua passando pelo caminho de envio compartilhado.

```text
用户提交 /side <问题> → 解析子会话实际继承的有效模型 → 共用同模型推荐
  确认切换 → 用确认后的 Start 选择创建 child 并提交首条
  不了     → 按 child 原选择创建并提交
  关闭     → 保留输入草稿，不创建 child、不发送首条

父会话的模型、运行态和队列保持原语义
```

- [x] Ligar a recomendação compartilhada na fronteira de primeira submissão da criação da tela secundária com texto, mantendo as regras existentes de mesmo modelo, compatibilidade de pensamento, cota e «不再提示».
- [x] Julgar pelo modelo que o child realmente herda e depois de resolvido; não usar diretamente o rascunho da caixa de entrada do pai para fingir a escolha de execução do child.
- [x] A escolha confirmada precisa chegar à execução da primeira mensagem do child e à fronteira original de salvamento; não pode apenas exibir a caixa e ainda executar o modelo pago antigo; não se altera o modelo da sessão pai nem a conexão paga global.
- [x] O comando atual só recebe firstInput.text; antes da implementação, completar o contrato de spec／protocolo de passagem explícita do modelo da primeira mensagem, conferindo os tipos e o schema de runtime dos lados App, Host e CLI.
- [x] Manter a admission, o ACK, a deduplicação e o tratamento de falha originais da criação e da primeira mensagem; não criar outra fila de accepted e não depender de enviar primeiro e depois trocar, nem de reenvio automático.
- [x] `/side` vazio apenas abre a tela secundária, sem recomendar; a continuação comum de tela secundária não é ligada de novo; as regras de exclusão de segundo plano, retry e Bot permanecem inalteradas.
- [x] Cobrir confirmar／não／fechar de SF-13, incompatibilidade de pensamento, cota desconhecida／zero, «不再提示», isolamento entre child e parent; validar o caminho no dispositivo via Pro admin SSH e verificar separadamente os limites originais de recuperação continuous／replayable.

**Limites de evidência antes da implementação**: a investigação original veio do branch de front-end, do schema compartilhado e do handler da CLI, quando o ponto de entrada de build da CLI ainda estava ausente. Na fase de implementação as dependências da CLI foram construídas, e a regressão direcionada e a validação da primeira requisição no Pro foram concluídas; ver §14.

## 13. F09：Compartilhamento do saldo da recomendação, refresh sob demanda e validade

**Confirmação**: em 2026-09-17 o usuário confirmou a solução e pediu que ela fosse registrada. Aqui «推荐弹窗» significa o diálogo «不了／切换套餐／不再提示» exibido antes da submissão／salvamento quando o mesmo modelo pago tem cota de um plano de experiência. Esta seção trata em conjunto do problema da recomendação usar um saldo antigo por muito tempo e do caso de continuar usando o saldo antigo da recomendação depois de trocar de conta na mesma marca.

**Situação atual**: `useStartPlanRecommendation` só habilita refreshOnMount; o branch initial de `useUsageEntitlement` usa validade infinita para o cache compartilhado. A recomendação e a página de configurações usam parâmetros／chaves de cache diferentes, e o refresh da página de configurações não atualiza a base da recomendação. O julgamento da validade do bucket de cota usa o momento da coleta do snapshot, sem contar o tempo decorrido antes da submissão. Sondas de Hook existentes reproduzem: ainda recomendar no dia seguinte, remontar sem consultar, saldo zero na página de configurações mas ainda recomendar, e ainda usar saldo positivo antigo após trocar de conta na mesma marca; essas são evidências do problema, não evidências de correção concluída.

### 13.1 Fato de saldo compartilhado

- [x] Unificar a construção dos parâmetros de consulta de Start e da identidade de cache; quando a recomendação, a página de configurações e o overlay de cota da caixa de entrada leem o mesmo Start do mesmo Host e da mesma conta, compartilham o resultado da consulta e as notificações de atualização do serviço de entitlement original.
- [x] O novo saldo após o refresh da página de configurações／do overlay deve atualizar a base da recomendação, sem continuar formando caches equivalentes que não se atualizam entre si.
- [x] Reutilizar a impressão digital de entitlement de conta／Provider e os eventos de invalidação existentes, mantendo as fronteiras entre contas, marcas, Providers e Hosts; não criar novo owner de saldo nem copiar credenciais para a UI.
- [x] Compartilhar apenas o fato de saldo; cada entrada continua decidindo se exibe a dica conforme sua própria seleção de modelo válido, Registry, compatibilidade de pensamento e preferência de recomendação do Host. Unificar os parâmetros de consulta não pode contornar a elegibilidade original da consulta nem a validação de execução do modelo.

### 13.2 Refresh sob demanda

- [x] Ao entrar numa página com capacidade de recomendação e nas ações originais de recomendação como o usuário enviar uma mensagem／salvar uma tarefa, verificar se é preciso atualizar. O acesso comum reutiliza o throttling de 60 segundos, a mesclagem de requisições concorrentes e o backoff de falha já existentes em `USAGE_ENTITLEMENT_ACCESS_REFRESH_MS`.
- [x] Quando a conta muda, um plano é resgatado ou o entitlement muda, reutilizar a impressão digital de entitlement de Provider já existente na página de configurações e o respectivo mecanismo de refresh, lendo o novo resultado em segundo plano e publicando-o para os consumidores relevantes. O refresh por conta／resgate mantém a semântica de disparo original, sem novo portão de envio síncrono.
- [x] Permitir um breve uso transitório do conteúdo existente durante a transição do refresh por mudança de conta; substituir quando o novo resultado chega. Quando a consulta falha ou demora, um snapshot expirado não pode continuar como base da recomendação.
- [x] Não adicionar polling quando não há ação; «60 segundos» é a janela comum de refresh sob demanda e a validade da base da recomendação, e não significa uma requisição fixa a cada 60 segundos.
- [x] Não adicionar barreiras de corrida de troca de conta, reenvio automático nem uma segunda fila de accepted.

### 13.3 Regras de recomendação no momento da submissão

| Fato de saldo no momento da submissão                                      | Comportamento definido                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A amostragem bem-sucedida mais recente tem menos de 60 segundos, o bucket do mesmo modelo ainda é válido e há cota positiva explícita | Recomenda normalmente quando todas as condições originais de candidato／pensamento／preferência são satisfeitas |
| A amostragem bem-sucedida mais recente tem menos de 60 segundos e o saldo é zero | Não recomenda e mantém a escolha original                                |
| A amostragem de saldo tem mais de 60 segundos ou ainda não foi consultada    | Faz refresh em segundo plano conforme o throttling／backoff existente; nesta vez mantém a escolha original e não espera a consulta de cota |
| Falha na consulta                                                           | Pula a recomendação; a submissão normal não é afetada e novas tentativas seguem a regra de backoff original |
| O snapshot tem menos de 60 segundos, mas o bucket de cota correspondente já expirou | Não recomenda com base nesse bucket; outros buckets válidos do mesmo modelo seguem sendo julgados pelas regras originais |

- [x] A validade da recomendação se baseia na amostragem bem-sucedida real mais recente; ler o cache, remontar ou reapresentar entre entradas não pode zerar a idade; falha de refresh não pode estender a validade da recomendação do saldo positivo antigo.
- [x] Julgar a validade do bucket de cota pelo momento real da submissão. Ao usar o tempo de referência do servidor, contar o tempo decorrido desde a coleta do snapshot, sem ficar sempre fixo em snapshot.serverTime／generatedAt; manter o limite original de tratamento da diferença entre o tempo do servidor e o relógio local.
- [x] Essa limitação de validade se refere à decisão de recomendação; não muda uniformemente o cache de exibição de todas as páginas de plano para ser limpo após 60 segundos, nem adiciona estilo de alerta de esgotamento／falha de refresh.
- [x] A primeira submissão após um período longo de inatividade pode não exibir a recomendação: desta vez o modelo original é usado normalmente e, com o novo saldo obtido em segundo plano, as submissões seguintes julgam normalmente. Não se reabre o diálogo depois que a submissão original já foi enviada nem se muda automaticamente para o Start.

```text
账号／Provider 变化、领取完成 → 原权益刷新机制 → 发布新的 Start 余额
进入页面／用户提交          → 原按需刷新检查（60 秒节流、合并、退避）
                                                  ↓
                               共享余额 → 设置页／浮层／推荐消费者

本次提交 → 快照在 60 秒内且桶当前有效？
  是 → 原同模型、思考、正额度与偏好判断 → 原推荐弹窗／提交路径
  否 → 按需后台刷新；本次原模型照常提交，不等待、不补发
```

### 13.4 Aceitação e escopo de implementação

- [x] Cobrir SF-14～SF-19, verificando especialmente os dois sentidos «saldo positivo antigo passando a zero» e «saldo zero antigo sendo complementado para positivo», além da troca de conta na mesma marca, remontagem, troca de dia, falha e recuperação de refresh.
- [x] Verificar todas as entradas de recomendação compartilhada: Session, Automation, Subagent, Wiki manual e a primeira mensagem da tela secundária de F08; manter o owner original de submissão／salvamento de cada entrada e verificar a origem de identidade e os limites de sincronização do celular no mesmo Host.
- [x] Antes da implementação, atualizar na spec oficial do Start as regras de recomendação para as decisões finais desta seção e acrescentar os testes de regressão relacionados. A restrição anterior, que apenas registrava em disco, foi removida por esta autorização de execução.

O agrupamento de cota／chave de lista em múltiplas instâncias (item 4 da revisão da rodada anterior) não será tratado por decisão do usuário, mantendo um comportamento consistente com o baseline original e não como refactorização anexa de F09.

## 14. Registro de implementação e auto-revisão de 2026-09-17

### 14.1 Comportamentos entregues

- F01/F02: a cota do Start na caixa de entrada é julgada pelo Provider válido; falha de preenchimento da organização da equipe antiga limita apenas os planos pagos e não bloqueia o Start. O scope pago e a autenticação de execução são mantidos.
- F03/F04: removido o antigo guia de escolha automática de modelo sem entrada em produção; o botão real de marketing marca a entrada de detalhes do Start como «查看套餐» conforme a ação de navegação; após o resgate bem-sucedido, Provider e saldo compartilhado são atualizados separadamente, sem alterar o resultado do resgate, o modelo ou a conexão. Saldo da sessão, estatística de identidade de plano e refresh após resgate completam os parâmetros explícitos de acesso da conta.
- F05/F06: o Start fica permanente e reutiliza os cards de estado existentes; distingue-se a ausência de plano, a falha de rede e a invalidação explícita de login, conectando retry／login e sem mais reportar incorretamente «não conectado» ou «configuração ausente». Sem plano não se exibe o botão genérico de compra paga. O dropdown pago lê a escolha salva／da submissão e faz a correspondência pela identidade completa da equipe, sem mais olhar o Provider.current copiado do item pessoal.
- F07: a primeira dica de modelo, a linha de separação da troca e o toast são rotulados como plano pessoal／de experiência／de equipe conforme o próprio ID real de Provider, com suporte às duas marcas e a chinês／inglês; o histórico não é migrado.
- F08: a recomendação da primeira mensagem da tela secundária usa o modelo efetivo do runtime pai como base de herança, e a escolha confirmada é passada ao child por meio de um createSelectionSideSession.firstInput.modelSelection; «不了» mantém a herança original, fechar não cria／envia e preserva o rascunho. O rascunho da caixa de entrada do pai não é reescrito.
- F09: a página de configurações, o overlay, a recomendação e o refresh após o resgate compartilham os parâmetros de consulta de Start e a impressão digital da conta do serviço original. O acesso comum reutiliza o throttling de 60 segundos, a mesclagem de concorrência e o backoff de erro; a recomendação usa apenas amostragens reais de menos de 60 segundos e conta o tempo decorrido até o expiração do bucket. Falhas da consulta compartilhada são propagadas de forma síncrona às entradas de recomendação; sem ação não há polling e nenhum novo owner de saldo.

### 14.2 Regressão e evidência no dispositivo

Os grupos a seguir têm sobreposição e não podem ser somados como um total de casos independentes.

| Verificação                            | Resultado e evidência                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Freshness／workspace antes da implementação | Verificado; documentos originais e rascunho de etiquetas preservados, sem resetar o conteúdo do usuário                                                                                                                                                                                                      |
| Regressão afetada da raiz              | `pnpm exec vitest run --changed HEAD`: 622 arquivos, 7041 casos aprovados, 7 ignorados; `/tmp/start156-unit-changed.log`. `test:unit:affected` foi ignorado porque HEAD é igual ao upstream e não foi contado como evidência de execução                                                                                            |
| Página final／saldo compartilhado direcionado | 4 arquivos, 223 casos aprovados, `/tmp/start156-final-targeted.log`; marketing, 2 arquivos, 12 casos aprovados, `/tmp/start156-marketing-final.log`                                                                                                                                                                        |
| Entrada de submissão Session desktop／celular | 68 casos aprovados, incluindo 6 novos grupos de confirmar／não／fechar da tela secundária, asserções de modelo efetivo do pai e isolamento do rascunho; `/tmp/start156-session-mobile.log`                                                                                                     |
| Verificação de código da raiz           | typecheck, lint e architecture:check --changed aprovados; 54 warnings de lint preexistentes, 0 violações de arquitetura. `/tmp/start156-{typecheck,lint,arch}-reviewed.log`                                                                                                                          |
| Tipos da CLI／chamadores afetados      | 28 tarefas de typecheck aprovadas; 8 casos nativos da tela secundária aprovados; 3 arquivos com 26 casos aprovados para selection child, continuous／replayable e redirecionamento de deduplicação (187 casos filtrados ignorados), `/tmp/start156-cli-typecheck.log`, `/tmp/start156-side-cli-green.log`, `/tmp/start156-cli-integration.log` |
| E2E Desktop no Pro                    | `macbook-pro-admin`, diretório isolado `/Users/dev/zcode-start156-pro-e2e`; run final `desktop-e2e-20260917051754556-p53534-7ee59f80ae96b31e` aprovado. Cobre o dropdown de equipe, anel／etiqueta do Start, recomendação em Subagent／Automation, fechar／não／confirmar no chat, requisição real da primeira mensagem da tela secundária com Provider／pensamento, isolamento do rascunho principal, além de «不再提示» e sua persistência após reinício |
| Estados de página no navegador do Pro  | 64 grupos: duas marcas × 8 estados × desktop／390px, chinês／inglês e tema claro／escuro aprovados; após corrigir campos de fixture pendentes e o botão genérico de compra para plano vazio, 16 grupos direcionados de plano vazio／pendente foram retestados e aprovados. `/tmp/start156-browser.log`, `/tmp/start156-browser-final2.log` (Pro); as capturas foram copiadas para `/tmp/start156-pro-evidence/browser/` local e verificadas visualmente |

Regressão Pro adicional: `marketing-touch-entitlement.test.ts` e `repo-wiki-model-plan-selection.test.ts` passaram, run `desktop-e2e-20260917052049566-p56236-413567dc76597ef7`. As asserções cobrem que o refresh após o resgate não sobrescreve a conexão, que a escolha antiga do Start é preservada, que o único candidato pago é selecionável e a persistência após «não»／confirmação de troca no Wiki. Os summaries dos dois runs finais foram copiados para `/tmp/start156-pro-evidence/{desktop,claim-wiki}/` local.

SF-01～19 foram cobertos pela combinação de componentes／Hooks／serviços／CLI e evidência no dispositivo; isso não significa que cada combinação foi validada em E2E no produto completo. Em especial, a evidência do celular é a regressão de compactForRemoteControl do SessionPane compartilhado, os limites de replayable da CLI e a checagem de navegador em 390px; **não foi executado de fato um E2E conjunto em Safari de celular físico nem um shared-host Web completo**. Electron em Windows／Linux, contas reais e interfaces pagas em produção também não foram executados de fato. Os serviços externos dos E2E usam fixtures isolados; UI, Host／Worker, construção de requisições de protocolo e persistência passam pelo caminho real; os casos novos continuam pending e não foram promovidos por conta própria nem declarados como admissão de CI.

### 14.3 Correções da auto-revisão e limites preservados

- A auto-revisão identificou que a falha de consulta não notificava os outros consumidores de saldo, o que poderia fazer a recomendação continuar usando um saldo positivo antigo; o fato de falha foi publicado no owner original de erro／backoff compartilhado e a regressão «após falha de refresh na página de configurações, a recomendação é pulada» foi acrescentada.
- A auto-revisão trocou a invalidação explícita de login por um fato de exibição estruturado accountLoginRequired, evitando decidir o comportamento de login／retry por uma chave de texto i18n.
- O plano vazio reutilizava o botão genérico de compra; o botão foi removido para o Start, mantendo a apresentação do plano e as regras de elegibilidade de campanhas. Cards originais de upgrade de planos válido／pendente e de cota zero permanecem inalterados.
- Nos E2E corrigiu-se a leitura de texto visível ainda em fase de layout e o modal antigo na animação de saída sendo interpretado como uma segunda recomendação; após aguardar o estado de UI correspondente, o run final passou. Os fixtures visuais pendentes receberam effectiveTime／entitlementId corretos e asserções de estado visível foram acrescentadas.
- As entradas de recomendação compartilhada Session, Automation, Subagent e Wiki manual foram verificadas; a recomendação não foi levada para execução em segundo plano, Bot ou execução imediata; a tela secundária não ganhou nova fila de accepted independente nem envio antes de trocar o modelo.
- Foi feita verificação de referências antes de deletar o export dedicado do guia antigo; a capacidade genérica de guia do menu de modelos e outros consumidores foram mantidos.
- Não há migration, queda automática para o pago nem barreira de corrida de conta nova; a estrutura copiada dos itens de equipe e a atribuição de cota／chave de lista em múltiplas instâncias permanecem como decidido na postergação.

### 14.4 Portões de baseline não aprovados

- `pnpm --dir apps/zcode-cli lint` falha: arquivos originais de telemetry／adapters／contracts／debug excedem o limite existente de 400 linhas, log `/tmp/start156-cli-lint.log`. Por exemplo, `telemetry/src/model-api-recorder.ts` tem conteúdo idêntico ao HEAD. O lint da raiz desta rodada passou, e a falha total da CLI não é atribuída a esta rodada como aprovado.
- A execução estendida de `v4-native-boundary.test.ts` encontrou 3 imports originais de V4 para o protocolo antigo: `commands/handlers/goal-compact.ts`, `commands/handlers/session-flow.ts` e `commands/prompt-turn.ts`; os três arquivos são idênticos, caractere a caractere, ao HEAD. Log `/tmp/start156-cli-tests.log`. O handler de tela secundária modificado nesta rodada não introduziu esse tipo de dependência.
- O Feature graph é parseável, mas o grafo original tem 4 arestas penduradas, e o codeSeed antigo de plan-entitlements aponta para `modelProviderFamilyConnectionSelection.ts`, que não existe mais; esta rodada sincronizou apenas os invariantes de plano já confirmados, sem ampliar a governança do grafo. O serviço de codegraph não está chamável no momento, então a varredura de impacto usou as referências reais e as evidências de regressão, sem alegar que a verificação do índice do grafo passou.

Ao final da implementação, a regra de falha de portão do AGENTS da raiz foi respeitada e o workspace foi mantido sem commit automático; o usuário, ciente das limitações acima, pediu explicitamente o push, então o commit prosseguiu e os hooks de push rodaram normalmente. As falhas conhecidas e os itens não verificados continuam registrados, e este commit não representa aprovação de todos os portões.