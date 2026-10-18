# Casos de integração de client configs do Coding Plan

Data: 2026-07-23

## Resumo da feature/mudança

| Campo                  | Valor                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Mudança                | "Upgrade do Coding Plan" passa a consumir de forma unificada os dados estáticos de pessoal, equipe e Start Plan de `client/configs` |
| Superfícies visíveis ao usuário | Seleção de plano na página de upgrade, seleção de ciclo pessoal, seleção de plano de equipe, cartão do Start Plan |
| Docs existentes        | `docs/bigmodel-coding-plan-subscription.md`, `docs/coding-plan-purchase-panel-flow.md` |
| Owners de código existentes | `codingPlanSubscriptionService` do host, hooks/painel de compra da UI |
| Fora de escopo         | Protocolo de pagamento, criação de pedido, entitlement, mudanças de protocolo em provider registry e realtime pricing |

## Registro de esclarecimentos

| Rodada | Pergunta                                | Resposta do usuário                        | Limite fixado                                  | Necessário acompanhamento |
| ------ | --------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ------------------------- |
| 1      | De onde vêm os planos e textos estáticos | Usar `client/configs`                      | configs é a fonte autoritativa do catálogo estático | não                  |
| 2      | Como ler dados de teste no desenvolvimento local | Usar `ZCODE_ENV=test`         | Conectar ao endpoint do ambiente de teste do ZCode | não             |
| 3      | Como isolar o provider                  | Team distingue Z.AI/BigModel; atualmente Z.AI não tem plano de equipe | Correspondência estrita de provider key, sem fallback entre marcas | não |
| 4      | Como tratar o Start Plan                | Incluir configs completos                  | Manter o `startPlanPreview` neutro em relação a provider | não              |
| 5      | Texto de descrição dos planos pessoais após a migração | `description` recupera o texto do cartão anterior à migração | Recuperar apenas a descrição, sem reverter produto, preço ou entitlement | não |

## Decisões de limite

| Limite         | Decisão                     | Inclui                                    | Exclui / poda                        | Origem         |
| -------------- | --------------------------- | ----------------------------------------- | ------------------------------------- | -------------- |
| Catálogo estático | configs como fonte autoritativa | Identidade do produto, nome, ciclo, preço estático, texto do cartão | Substituir o remoto por constante local | usuário    |
| Texto ausente  | Permanecer vazio            | Entitlement de pessoal/equipe, descrição e texto do Start | Fallback de texto hardcoded no front-end | usuário    |
| Estado em tempo real | preview/pricing sobrescrevem campos dinâmicos | Preço final, comprável, esgotado, estado de assinatura | Sobrescrever o texto remoto do cartão | spec existente |
| Ambiente de teste | `ZCODE_ENV=test`            | `client/configs` do ambiente de teste remoto | Mock de desenvolvimento local      | usuário        |
| Provider de Team | provider key exato        | BigModel com 8 SKUs, Z.AI com array vazio | Fallback de BigModel → Z.AI       | usuário        |
| Start            | Preview independente        | planId/name/entitlements                  | Fingir ser um SKU de pagamento       | spec existente |

## Escopo de domínio e cross-products de alto risco

| Domínio                           | Inclui? | Motivo                                                |
| --------------------------------- | ------- | ----------------------------------------------------- |
| Config de Model/provider          | sim     | provider key, catálogo estático, merge em tempo real  |
| Limites de arquitetura/processo   | sim     | renderer obtém a configuração do host pelo service    |
| Locale/responsividade da UI       | sim     | BigModel em chinês, Z.AI em inglês; layout inalterado |
| Remoto mobile/replayable          | podado  | O serviço de config global do App não altera a semântica realtime de task |

A combinação de alto risco é `provider × audience × config result × realtime result`. Mock e endpoint de produção alteram apenas a origem da configuração, não o algoritmo de merge.

## Owners de estado

| Estado / fato         | Autoridade                                  | Cache/espelho                    | Evidência                |
| --------------------- | ------------------------------------------- | -------------------------------- | ------------------------ |
| Catálogo estático pessoal | `client/configs.codingPlanStaticProducts`     | cache em memória de um dia no host + UI | resultado do service / cartão da UI |
| Catálogo estático de equipe | `client/configs.codingPlanStaticTeamProducts` | cache de client-config do host | resultado do service / cartão da UI |
| Start Preview          | `client/configs.startPlanPreview`             | cache do host + UI               | resultado do service / cartão da UI |
| Estado realtime pessoal | `batch-preview`                              | snapshot do hook da UI           | rede + ação do cartão    |
| Estado realtime de equipe | enterprise pricing                         | snapshot do hook da UI           | rede + ação do cartão    |

## Combinações candidatas e poda

| Candidate ID | Setup                                      | Efeito esperado                             | Status              |
| ------------ | ------------------------------------------ | ------------------------------------------ | ------------------- |
| CPCFG-01     | BigModel personal config + preview success | Texto estático preservado, preço/estado em tempo real sobrescreve | aceito |
| CPCFG-02     | Z.AI personal config + preview failure     | Cartão estático da Z.AI preservado, sem cruzar marcas | aceito |
| CPCFG-03     | BigModel team config + pricing success     | Texto estático e estado em tempo real mesclados por productId | aceito |
| CPCFG-04     | BigModel team config + pricing failure     | Cartão estático de equipe preservado com erro de exibição | aceito |
| CPCFG-05     | Array vazio de team na Z.AI                | Nenhum produto de equipe exibido            | aceito |
| CPCFG-06     | Start Preview presente                     | Cota calculada a partir de entitlements    | aceito |
| CPCFG-07     | Start Preview ausente                      | Start Plan oculto                           | aceito |
| CPCFG-08     | Mock não habilitado explicitamente         | Acesso ao endpoint normal de runtime       | aceito |
| CPCFG-09     | Env de mock definido em build de produção  | Mock ignorado, config local proibida em produção | aceito |
| CPCFG-10     | desktop/mobile/remote workspace            | Usa o mesmo resultado do service global do App | podado por invariante |

## Lista de cases aceitos

| Case ID  | Setup                                  | Ação                | Asserções                                             | Camadas de evidência       | Status   |
| -------- | -------------------------------------- | ------------------- | ----------------------------------------------------- | -------------------------- | -------- |
| CPCFG-01 | BigModel config + preview fixture      | Abrir página de upgrade pessoal | Nome/texto vêm do config, preço/botão vêm do preview | unit + E2E rede/UI | planejado |
| CPCFG-03 | BigModel team config + pricing fixture | Alternar para equipe | As duas linhas, equity e description, vêm do config, e o estado em tempo real é mesclado | unit + E2E rede/UI | planejado |
| CPCFG-04 | Falha no pricing de Team               | Alternar para equipe | O cartão estático continua existindo e o erro é exibido | unit | planejado |
| CPCFG-05 | `[]` de team na Z.AI                   | Abrir página de upgrade da Z.AI | Nenhum cartão de equipe de outra marca | unit | planejado |
| CPCFG-06 | Start fixture                          | Abrir página de upgrade | Nome do Start e o resumo do entitlement de 5M corretos | unit + E2E UI | planejado |
| CPCFG-08 | `ZCODE_ENV=test`                       | Requisitar configs   | Usa o endpoint do ambiente de teste e acrescenta os parâmetros de cliente | unit | verificado |

## Notas de passagem para E2E

- Fixture de Provider: reaproveitar `packages/desktop/test/e2e/fixtures/coding-plan-client-configs.json`; é proibido copiar arrays de produtos.
- Timing: os testes do cache de client-config dentro do App exigem limpeza explícita.
- Desktop/mobile: a página de compra já tem implementação responsiva; esta rodada não adiciona estado realtime de conversation.
- Risco de revisão: ao mesclar o pricing de equipe por `productId`, é obrigatório preservar o enterprise product bruto; os parâmetros de pagamento continuam vindo do product em tempo real.