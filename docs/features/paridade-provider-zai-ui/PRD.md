# PRD — Paridade de provedor na UI: remoção do tratamento preferencial de Z.ai / BigModel (GLM)

- **Status:** Rascunho para aprovação
- **Data:** 2026-10-18
- **Área:** `packages/ui` (superfície de UI apenas)
- **Profundidade:** SOMENTE UI. Nenhuma mudança em `packages/shared`, `packages/services`, `packages/desktop` (máquina) ou `apps/zcode-cli`.

---

## 1. Problema e evidência

Hoje a UI trata os provedores de conta Z.ai (`zai`) e BigModel (`bigmodel`) como casos especiais: eles recebem botões de login OAuth dedicados, ordenação fixa no topo da lista de login, banners e toques de marketing com claim de plano, cards de preço/promoção/saldo do Coding Plan e uma preferência implícita na resolução de entitlement/usage. Isso cria dois problemas de produto:

1. **Experiência assimétrica:** o primeiro contato do usuário (welcome screen e settings) sugere que Z.ai/BigModel são "o provedor oficial" do app, enquanto os demais provedores por API key aparecem como cidadãos de segunda classe.
2. **Ofertas agressivas sem paridade:** banners de "Limited-time offer" e recomendações de plano (Start Plan) são exibidos para todos os usuários, independentemente de terem escolhido outro provedor.

A decisão do dono do produto é remover todo tratamento preferencial e toda oferta desses provedores da UI, mantendo-os configuráveis como provedores comuns via API key.

### Evidência confirmada (arquivo:linha, lida e verificada)

| # | Evidência | Local |
|---|-----------|-------|
| E1 | Mapeamento de provider id → botões OAuth dedicados (`login.oauth.button.zai` / `login.oauth.button.bigmodel`) e tags de região exclusivas de Z.ai/BigModel | `packages/ui/src/WelcomeScreen.tsx:491-511` (`getLoginOAuthButtonMessageId`, `getLoginOAuthRegionTagMessageId`) |
| E2 | Prioridade de ordenação fixa: Z.ai = 0 (topo), BigModel = 1, demais = `10 + order` | `packages/ui/src/WelcomeScreen.tsx:528-540` (`getProviderPriority`) |
| E3 | `resolveVisibleLoginProviders` mostra os logins OAuth (incl. Z.ai/BigModel) ordenados por prioridade quando deslogado | `packages/ui/src/WelcomeScreen.tsx:542-548` |
| E4 | Botões OAuth renderizados por provedor visível na welcome screen | `packages/ui/src/WelcomeScreen.tsx:319-356` |
| E5 | Toque de marketing com ação `claim_zcode_plan` ("Limited-time offer") chamando `claimManualPlan` | `packages/ui/src/components/marketing-touch/MarketingTouchProvider.tsx:262` (claim) e `:370` (predicado `claim_zcode_plan` do banner) |
| E6 | Strings de banner de claim manual: `manualClaimPlan.*` (banner, claim, dismiss, share) — o bloco vai de :226 até :283 (`manualClaimPlan.claim.share.twitterTextLabel` é a última) | `packages/ui/src/i18n/locales/en-US.ts:226-283` |
| E7 | Recomendação de plano no chat: `startPlan.recommendation.*` (title, description, switch, decline, dismiss) | `packages/ui/src/i18n/locales/en-US.ts:4-13` (espelhado em `zh-CN.ts:4-11`, verificado) |
| E8 | Strings de promoção do Coding Plan em settings: `settings.modelProvider.codingPlan.start.freeEquityTitle` = "Start free plan", `start.loginTrial` = "Connect Z.ai", `product.firstPromo` = "First-time subscription discount" | `packages/ui/src/i18n/locales/en-US.ts:3418-3424` e `:3651` |
| E9 | Cards de preço, produtos e saldo do Coding Plan na seção de provedores | `packages/ui/src/settings/model-provider-section/codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`, `StartPlanBalanceCard.tsx` |
| E10 | Card de saldo do Start Plan na toolbar do chat | `packages/ui/src/chat-input-toolbar/StartPlanContextBalance.tsx` |
| E11 | Resolução de entitlement/usage com `preferredProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan` (e o equivalente bigmodel na linha 463), com `requirePreferredProvider: true` | `packages/ui/src/SettingsPage.tsx:408-451` (:444, :450; bigmodel em :411-437, :463) |
| E12 | Login OAuth disparado a partir das settings para presets de assinatura | `packages/ui/src/settings/model-provider-section/oauthActions.ts:10-36` (`startPresetSubscriptionLogin`) |
| E13 | O tipo `OAuthProviderId` só tem casos brandados para `BIGMODEL_PROVIDER_ID` e `ZAI_PROVIDER_ID` — não existem adapters OAuth de outros provedores | `packages/shared/src/oauth.ts:56-59` |
| E14 | Ecossistema preferred-provider na UI além da SettingsPage: `CodingPlanUsagePanel.tsx` usa `preferredProviderId: zaiIndividualCodingPlan` (:134) e `bigmodelIndividualCodingPlan` (:152), além de `:169-171`; `WorkspaceSidebarFooterUsageSummary.tsx`, `chat-input-toolbar/CodingPlanContextUsage.tsx` (:215), `v4/composer/V4ComposerToolbar.tsx` e `v4/SessionPane.tsx` consomem o mesmo ecossistema | `packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx:134,152,169-171` e arquivos listados |
| E15 | Oferta de troca de modelo de subagente para o Start Plan: `useStartPlanRecommendation` usado em `settings/SubagentsSection.tsx:2,609,674,817,1008` e `settings/AutomationEditView.tsx:2`; hook em `hooks/useStartPlanRecommendation.ts`, entitlement em `hooks/useStartPlanEntitlement.ts` | arquivos citados |
| E16 | Inventário marketing/claim: `components/manual-claim-plan/manualClaimFailureMessage.ts` e `manualClaimPlanStartUsing.ts`; `components/marketing-touch/MarketingDialogs.tsx`; `request-security-edition/claim.ts` (stub: `prepareRequestVerificationClaim` já retorna `{}` sem tocar serviço); visibilidade do banner compartilhada com a sidebar via `MarketingBanner`/`useMarketingBannerVisible` | `packages/ui/src/sidebar-activity/SidebarBottomActivity.tsx:1,19-20`, `components/marketing-touch/useMarketingBannerVisible.ts`, arquivos citados |

**Correções/ajustes em relação à evidência inicial recebida:**
- `StartPlanContextBalance.tsx` fica em `packages/ui/src/chat-input-toolbar/` (não em `model-provider-section/chat-input-toolbar/`).
- `MarketingTouchProvider.tsx` centraliza a execução da ação de claim (`claimManualPlan` em :262), mas os banners de claim também têm UI dedicada de banner/diálogo dentro do mesmo diretório `marketing-touch/`; o PRD cobre o conjunto.

### Fora de escopo (confirmado intacto e que permanece intacto)

- `packages/services/src/oauth/*` — maquinaria OAuth.
- `packages/services/src/coding-plan-subscription/*` — assinatura de Coding Plan.
- `apps/zcode-cli/packages/cli/src/login-command.ts` — `zcode login` (default "zai") continua funcionando.
- `packages/shared/src/official-glm-model-id.ts` e todo o protocolo compartilhado.

---

## 2. Usuários e cenários de uso

**Personas:**
- **P1 — Usuário novo do app:** abre o app pela primeira vez e precisa escolher como conectar um provedor.
- **P2 — Usuário com conta Z.ai/BigModel:** já usa GLM e deseja continuar usando, agora via API key como qualquer outro provedor.
- **P3 — Usuário de outro provedor (Anthropic, OpenAI, etc.):** não deveria ver ofertas de um provedor que não escolheu.

**Cenários:**

- **C1 (P1):** Na welcome screen, o usuário vê apenas o caminho de configuração via API key (DECISÃO: o modo de login OAuth da welcome screen é removido por inteiro — ver RF-01 e Q1/Q2 resolvidas).
- **C2 (P2):** Na settings, o usuário seleciona Z.ai ou BigModel na lista de provedores e configura a API key, exatamente como faria com qualquer outro provedor.
- **C3 (P3):** Nenhum banner "Limited-time offer", nenhuma recomendação de Start Plan (nem a oferta de troca de modelo de subagente) e nenhum card de saldo/promo do Coding Plan aparece em chat ou settings.
- **C4 (usuário avançado):** Quem preferir OAuth pode continuar usando `zcode login` no CLI; a UI não oferece esse caminho, mas não o impede.

---

## 3. Objetivos e não-objetivos

### Objetivos

- O1. Tornar Z.ai e BigModel visualmente equivalentes a qualquer outro provedor por API key em toda a UI (welcome screen, settings, chat).
- O2. Eliminar toda oferta/promoção de Coding Plan e claim de plano da superfície de UI — incluindo todas as superfícies de upgrade/compra: `CodingPlanUpgradeDialog`, cards de preço, preview Start Plan, purchase auth e catálogos de produtos (individuais e enterprise). Backend/services intocados.
- O3. Eliminar preferência de provider (Z.ai) na resolução de entitlement/usage exibida ao usuário.
- O4. Limpar strings i18n órfãs resultantes das remoções (en-US e zh-CN).
- O5. Zero regressão na capacidade de configurar Z.ai/BigModel via API key.

### Não-objetivos

- **NÃO remover a maquinaria OAuth ou de Coding Plan** de `packages/services` (oauth, coding-plan-subscription), do CLI (`zcode login` segue funcional, com default "zai") ou do protocolo (`packages/shared`). Nenhuma mudança de protocolo.
- NÃO remover os providers Z.ai/BigModel do catálogo: o usuário pode configurá-los via API key como qualquer outro.
- NÃO alterar o backend de marketing (as ofertas podem continuar sendo entregues; a UI simplesmente não as renderiza nem aciona).
- NÃO mexer em outros provedores por OAuth, caso existam no futuro — a remoção aqui é específica do par Z.ai/BigModel e dos caminhos de Coding Plan.
- NÃO alterar comportamento do desktop main/host nem do servidor web.

---

## 4. Requisitos funcionais

### Welcome screen

- **RF-01.** **Remover por completo o modo de login OAuth da welcome screen** — para zai E bigmodel. Como só existem adapters OAuth brandados para esses dois provedores (`packages/shared/src/oauth.ts:56-59`, E13), não há caso genérico a preservar: saem os botões OAuth (incluindo o caso default `login.oauth.button`, E1/E4), `startTrackedLogin`, `resolveVisibleLoginProviders` (E3), os estados waiting/error/retry, os testids (`TID_OAUTH_*`) e `getProviderPriority` com os pesos fixos zai=0/bigmodel=1 (E2). A welcome screen passa a oferecer exclusivamente o fluxo de API key (botão "use API key", `WelcomeScreen.tsx:344-354`).
- **RF-02.** (Dobrada no RF-01.) Nenhuma ordenação preferencial de Z.ai/BigModel sobrevive na welcome screen — a ordenação existia só para o modo OAuth removido.
- **RF-03.** Remover tags de região exclusivas (`LoginOAuthRegionTag` e `getLoginOAuthRegionTagMessageId`, E1) junto com o modo OAuth.
- **RF-04.** Remover `resolveLoginRetryProvider` (`WelcomeScreen.tsx:550-560`) junto com o fluxo OAuth; nenhum caminho de retry pode sobrar referenciando `providers[0]`.

### Settings (provedores de modelo)

- **RF-05.** Remover o login OAuth a partir das settings para presets de assinatura Z.ai/BigModel: os botões que acionam `startPresetSubscriptionLogin`/`reportPresetSubscriptionSuccess` (`oauthActions.ts:10-55`, E12) saem da UI. Rodar `pnpm dep:refs --list-exports packages/ui/src/settings/model-provider-section/oauthActions.ts` para definir o que fica órfão; expectation: o arquivo é deletado se nenhum outro consumir (ver Q3).
- **RF-06.** Remover os cards de preço e produtos do Coding Plan (`codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`), o card de saldo Start Plan (`StartPlanBalanceCard.tsx`) e componentes relacionados de status/promo de Coding Plan da seção de provedores (E9), incluindo `StartPlanCard.tsx`, `StartPlanQuotaStatusCard.tsx` e strings `settings.modelProvider.codingPlan.start.*` / `product.firstPromo` (E8).
- **RF-07.** Remover o card de saldo do Start Plan da toolbar de chat (`chat-input-toolbar/StartPlanContextBalance.tsx`, E10).
- **RF-08.** Remover dicas/hints de registro específicas de BigModel na UI de provedores (`BigModelRegistrationHint.tsx`) ou generalizá-las para provedores por API key — nenhuma menção preferencial a BigModel.

### Entitlement / usage

- **RF-09.** Remover o ecossistema preferred-provider da UI inteira, não só a SettingsPage:
  - `packages/ui/src/SettingsPage.tsx` — `preferredProviderId: zaiIndividualCodingPlan` (:444, :450) e o paralelo bigmodel (:411-437, :463), com `requirePreferredProvider`/`allowDisabledPreferredProvider` (E11);
  - `packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx` — `preferredProviderId: zaiIndividualCodingPlan` (:134), `bigmodelIndividualCodingPlan` (:152) e bloco :169-171 (E14);
  - `packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx`;
  - `packages/ui/src/chat-input-toolbar/CodingPlanContextUsage.tsx` (:215);
  - `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`;
  - `packages/ui/src/v4/SessionPane.tsx`;
  - `packages/ui/src/v4/useV4SessionQuotaBanner.ts` — comparações hardcoded contra `zaiIndividualCodingPlan`/`zaiStartPlan`/`bigmodelIndividualCodingPlan`/`bigmodelStartPlan` (:31-35) e `preferredProviderId: upgradeProviderId` com `requirePreferredProvider: true` (:186-188). O banner de quota do Coding Plan no v4 (e o `CodingPlanUpgradeDialog` que ele dispara) é **removido da UI junto** com o ecossistema preferred-provider.
  Nenhuma superfície de usage pode assumir provedor preferido; sem provedor Coding Plan, exibe estado neutro/vazio.
- **RF-10.** **Não existe hoje caminho genérico de entitlement por preferred provider para provedores API-key — e este PRD não cria um.** DECISÃO DE PRODUTO: as superfícies de usage que dependem de `preferredProviderId`/`accountAccess` builtin (listadas no RF-09) são **removidas junto**, não reescritas. A usage de provedores API-key continua pelo caminho que já existe hoje e já é independente de Coding Plan: `AppUsagePanel` (`packages/ui/src/settings/usage-stats/AppUsagePanel.tsx:37-38`) via `useAppUsageStats` → `usageStatsService` (`packages/ui/src/hooks/useUsageStats.ts:191-206`), sem preferred provider. O que existe de genérico é esse painel de usage por app; entitlement no sentido Coding Plan é conceito exclusivo do par Z.ai/BigModel e sai com ele.

### Marketing / ofertas

- **RF-11.** A UI não deve mais renderizar nem acionar banners/toques de marketing com claim de plano: remover os caminhos de `claim_zcode_plan` e `claimManualPlan` do lado da UI (`MarketingTouchProvider.tsx:250-295, :365-372`, E5), incluindo banner, `MarketingDialogs.tsx`, diálogos de dismiss/sucesso/falha, prewarm de verificação e `request-security-edition/claim.ts` (que já é stub: `prepareRequestVerificationClaim` retorna `{}`, E16). Inventário completo no escopo: `components/manual-claim-plan/` (`manualClaimFailureMessage.ts`, `manualClaimPlanStartUsing.ts`). O predicado de visibilidade do banner é compartilhado com `sidebar-activity/SidebarBottomActivity.tsx` (`MarketingBanner`/`useMarketingBannerVisible`, :1,19-20, E16) — **alterar em conjunto** para não recriar o drift já comentado no código. Ações de marketing neutras (`open_url`) permanecem (Q4).
- **RF-12.** A recomendação de plano some inteira, **incluindo as ofertas de troca de modelo de subagente**: remover `hooks/useStartPlanRecommendation.ts` e `hooks/useStartPlanEntitlement.ts` e seus pontos de uso em `settings/SubagentsSection.tsx` (:2, :609, :674, :817, :1008), `settings/AutomationEditView.tsx` (chamada real do hook em :1770; o import em :2) e `v4/SessionPane.tsx` (:1754, :2490, :2525) (E15). **A troca manual de modelo permanece** — só a oferta/proativa some. Strings `startPlan.recommendation.*` (E7) saem junto.
- **RF-12a.** Os badges promocionais de plano no modo de conexão (`connectionMode.startPlan` / `startPlanBadge` / `codingPlanBadge`, referenciados em `settings/AutomationEditView.tsx:1494-1505` e no paralelo de `SubagentsSection.tsx:1320-1321`) são removidos: são promo Start Plan/Coding Plan na UI, não parte da troca de modelo. As strings `settings.modelProvider.connectionMode.startPlan*`/`codingPlanBadge` entram no inventário do RF-15.
- **RF-12b.** Todas as superfícies de upgrade/compra do Coding Plan saem da UI (backend/services intocados): `settings/CodingPlanUpgradeDialog.tsx` (incl. `CodingPlanUpgradeDialogProvider`), `model-provider-section/useStartPlanPreview.ts`, `model-provider-section/codingPlanPurchaseAuth.ts`, `model-provider-section/enterpriseCodingPlanProducts.ts` e `useEnterpriseCodingPlanProducts.ts`. Consumidores desses módulos (`SettingsPage.tsx`, `WorkspaceSidebar.tsx`, `MarketingTouchProvider.tsx`, `CodingPlanEntryButton.tsx`, `AutomationsSection.tsx` — verificados por grep) são ajustados em conjunto; os pontos de entrada viram estado neutro (sem CTA de upgrade). Strings `startPlan.recommendation.*` (E7) saem junto.
  - **Arquivos de teste afetados** (verificados por grep): `packages/ui/test/startPlanRecommendation.test.ts`, `startPlanRecommendationFreshness.test.ts`, `useStartPlanRecommendation.test.ts`, `v4SessionPaneModelSwitchRecovery.test.ts`, `highspeed/sessionPaneHighspeedActivation.test.ts` e `highspeed/highspeedVisibilityRefresh.test.ts` (os dois últimos mockam `useStartPlanRecommendation`; cenários de highspeed em si devem ser preservados).

### Paridade de provedor

- **RF-13.** Z.ai e BigModel permanecem na lista de provedores configuráveis via API key, com fluxo, cards, validação e ordenação idênticos aos de qualquer outro provedor por chave (sem logo em destaque, sem badge "Free", sem "Connect Z.ai").
- **RF-14.** Nenhum caminho de UI deve invocar serviços de OAuth ou Coding Plan para Z.ai/BigModel após a mudança (a UI não pode mais disparar `startOAuth` para esses providers nem `claimManualPlan`).

### i18n

- **RF-15.** Limpar strings órfãs em `en-US.ts` e `zh-CN.ts` (e qualquer outro locale espelhado): `manualClaimPlan.*` (E6 — bloco `en-US.ts:226-283`, verificado), `startPlan.recommendation.*` (E7 — `zh-CN.ts:4-11`, verificado), `settings.modelProvider.connectionMode.startPlan*`/`codingPlanBadge` (RF-12a), `settings.modelProvider.codingPlan.start.*`, `settings.modelProvider.codingPlan.product.firstPromo` e demais strings de upgrade/compra (RF-12b), `login.oauth.button` (incl. variants `.zai`/`.bigmodel`) / `login.oauth.regionTag.*` e demais strings que ficarem sem referência. Rodar verificação de strings não usadas para fechar o conjunto.

---

## 5. Requisitos não funcionais

- **RNF-01 (Performance):** A remoção não deve degradar o tempo de renderização da welcome screen e da settings; espera-se melhora (menos consultas de entitlement/produtos no mount). Nenhum fetch fantasma deve permanecer: hooks removidos (`useCodingPlanProducts`, entitlement probing com preferred provider) não devem disparar requisições.
- **RNF-02 (Acessibilidade):** Estados vazios criados pelas remoções (ex.: aba usage sem provedor) devem ter texto acessível e foco gerenciado; remoção de banners não pode deixar regiões aria-live vazias referenciadas.
- **RNF-03 (Observabilidade/telemetria — decisão):**
  - Remover junto com os componentes os eventos de telemetria que só eles emitem (ex.: `add_model_success` com `login_default: "1"` em `oauthActions.ts:38-55`).
  - **Não** remover eventos genéricos de configuração de provider por API key.
  - **Único evento de migração aprovado:** um evento só (ex.: `zai_ui_parity_surface`, tipo `pv`) emitido na welcome screen/settings, com campo de desfecho: visibilidade da superfície e conclusão (ou não) da configuração de provedor via API key na mesma sessão. Vive por exatamente 1 release e é removido na seguinte. M2/M3 (Métricas) são coletados apenas por esse evento.
- **RNF-04 (Consistência visual):** Seguir `DESIGN.md`; reutilizar os cards/fluxos genéricos de provider por API key existentes.
- **RNF-05 (Build):** `pnpm typecheck`, `pnpm lint` e `pnpm knip` limpos após remoções (knip deve confirmar que não sobraram exports órfãos dos arquivos deletados).

---

## 6. Métricas de sucesso

- **M1:** 0 referências em `packages/ui` a: `claim_zcode_plan`, `claimManualPlan`, `startPlan.recommendation`/`useStartPlanRecommendation`/`useStartPlanEntitlement`, `getProviderPriority`/`resolveVisibleLoginProviders`/`startTrackedLogin`, `preferredProviderId` apontando para `zaiIndividualCodingPlan`/`bigmodelIndividualCodingPlan` (incl. CodingPlanUsagePanel, WorkspaceSidebarFooterUsageSummary, CodingPlanContextUsage, V4ComposerToolbar, SessionPane, SettingsPage, useV4SessionQuotaBanner), `startPresetSubscriptionLogin`, e às superfícies de upgrade/compra do RF-12b (`CodingPlanUpgradeDialog`, `useStartPlanPreview`, `codingPlanPurchaseAuth`, `useEnterpriseCodingPlanProducts`) (verificável por grep + `pnpm knip`).
- **M2 (coletada só pelo evento de migração do RNF-03, 1 release):** % de sessões que viram a welcome screen/settings e concluíram configuração de provedor via API key. Sem baseline histórico comparativo — a meta é ter leitura, não bater número anterior; objetivo declarado como **não-medido contra baseline nesta release**.
- **M3:** Absorvida em M2 (mesmo evento, campo de desfecho).
- **M4:** Zero tickets de "não consigo mais usar Z.ai/BigModel" causados por falta de descoberta (distinguindo de usuários que queriam OAuth, cenário aceito — ver Risco R2).
- **M5:** `pnpm knip` sem exports órfãos relacionados à remoção.

---

## 7. Escopo de release e faseamento

**Fase 1 — Núcleo de paridade (release alvo da feature):**
1. RF-01–RF-04 (welcome screen sem modo OAuth — zai E bigmodel — e sem prioridade; deletar `oauthActions.ts` se `pnpm dep:refs` confirmar órfão).
2. RF-09–RF-10 (ecossistema preferred-provider removido da UI inteira; superfícies dependentes removidas, usage API-key segue via AppUsagePanel/useAppUsageStats).
3. RF-13 (paridade via API key garantida e testada).

**Fase 2 — Remoção de ofertas:**
4. RF-11 (banners de claim, `manual-claim-plan/`, `MarketingDialogs.tsx`, `claim.ts`, predicado compartilhado com `SidebarBottomActivity.tsx` alterado em conjunto), RF-12/RF-12a (recomendações de plano, ofertas de troca de subagente, badges de connection mode — com os 6 arquivos de teste listados) e RF-12b (superfícies de upgrade/compra do Coding Plan).
5. RF-05–RF-08 (settings: oauthActions, cards de preço/saldo/promo, hints).

**Fase 3 — Limpeza:**
6. RF-14 (auditoria de que nenhum caminho de UI chama OAuth/Coding Plan services).
7. RF-15 (i18n órfão: `en-US.ts:226-283`, `zh-CN.ts:4-12`, blocos de settings) + telemetria de migração (RNF-03, único evento, 1 release).

**Critério de corte por fase:** cada fase termina com `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` verdes e testes/E2E dos cenários atualizados (welcome screen e settings são superfícies com E2E existentes — cenários de OAuth na welcome screen precisam ser removidos/substituídos pelos de API key).

---

## 8. Riscos de produto e questões em aberto

### Riscos

- **R1 — Usuários Z.ai/BigModel sem API key à mão:** quem usava o login OAuth na UI perde o caminho de 1 clique e precisa gerar uma chave no portal. Mitigação: o provedor permanece configurável via API key com fluxo padrão; considerar link para o portal (neutro, sem destaque) — ver Q5.
- **R2 — Percepção de regressão ("sumiu o login com Z.ai"):** comunicação em changelog/release notes é necessária; CLI continua oferecendo `zcode login`.
- **R3 — Dead code de marketing do lado servidor:** o backend pode seguir entregando toques com `claim_zcode_plan`; se algum outro cliente ainda renderizar, tudo bem, mas a UI removida não deve deixar handlers mortos gerando warnings. Mitigação: ação desconhecida deve ser ignorada silenciosamente (log debug).
- **R4 — Acoplamento oculto do entitlement:** as superfícies de usage listadas no RF-09 têm fluxos interdependentes (children panels, refresh de access, fingerprints em `SettingsPage.tsx:422-437`). Mitigação: inventário de usos de `useUsageEntitlement`, `resolveEntitledAccountProviderAccess*` e `useStableAccountAccess` antes da Fase 1; remoção em conjunto, não reescrita (RF-10).
- **R5 — Estados vazios na aba usage:** com as superfícies Coding Plan removidas, a aba usage fica só com `AppUsagePanel`; para usuários sem nenhum provedor configurado precisa de estado neutro bem resolvido.

### Destino de hooks potencialmente órfãos (decisão)

- **`hooks/useStartPlanEntitlement.ts`:** consumido apenas por `MarketingTouchProvider.tsx` (verificado por grep) — **removido junto com a Fase 2**.
- **`hooks/useMarketingTaskCompletionRefresh.ts`:** consumido por `App.tsx` e `MarketingTouchProvider.tsx`, com teste dedicado `marketingTaskCompletionRefresh.test.ts` — seu único propósito é refrescar estado de marketing pós-conclusão de task para o fluxo de claim; **removido junto com a Fase 2** (incl. teste), a menos que a implementação encontre consumidor não-relacionado a claim (validar com `pnpm dep:refs` antes de deletar).

### Questões em aberto

- **Q1 — RESOLVIDA (decisão do dono):** a welcome screen fica 100% API key. O modo de login OAuth é removido inteiro, pois só existem adapters zai/bigmodel (`packages/shared/src/oauth.ts:56-59`).
- **Q2 — RESOLVIDA (decisão do dono):** `startTrackedLogin`, `resolveVisibleLoginProviders`, `resolveLoginRetryProvider`, estados waiting/error e testids OAuth são removidos por completo; nada é mantido "genérico".
- **Q3:** `oauthActions.ts` é deletado ou mantido? *Decidido em RF-05: deletar se `pnpm dep:refs --list-exports` confirmar que nenhum outro ponto da UI consome após remover os botões.*
- **Q4:** Ações de marketing neutras (`open_url`) e o restante do `MarketingTouchProvider` (poller, banner de imagem sem claim) permanecem? *Default proposto: manter o mecanismo, remover apenas os caminhos de claim de plano (RF-11).*
- **Q5:** Incluir link "obter API key" no card de Z.ai/BigModel (como já existe `BigModelRegistrationHint`)? *Default proposto: generalizar o hint para todos os presets por API key que o declarem, sem tratamento especial de Z.ai/BigModel.*
- **Q6 — RESOLVIDA (RNF-03):** telemetria de migração aprovada como evento único `zai_ui_parity_surface`, visível por 1 release.
