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
| E6 | Strings de banner de claim manual: `manualClaimPlan.banner.tag` = "Limited-time offer", `manualClaimPlan.banner.claim`, diálogos de sucesso/falha | `packages/ui/src/i18n/locales/en-US.ts:226-259` |
| E7 | Recomendação de plano no chat: `startPlan.recommendation.*` (title, description, switch, decline, dismiss) | `packages/ui/src/i18n/locales/en-US.ts:4-13` (espelhado em `zh-CN.ts:4-9`) |
| E8 | Strings de promoção do Coding Plan em settings: `settings.modelProvider.codingPlan.start.freeEquityTitle` = "Start free plan", `start.loginTrial` = "Connect Z.ai", `product.firstPromo` = "First-time subscription discount" | `packages/ui/src/i18n/locales/en-US.ts:3418-3424` e `:3651` |
| E9 | Cards de preço, produtos e saldo do Coding Plan na seção de provedores | `packages/ui/src/settings/model-provider-section/codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`, `StartPlanBalanceCard.tsx` |
| E10 | Card de saldo do Start Plan na toolbar do chat | `packages/ui/src/chat-input-toolbar/StartPlanContextBalance.tsx` |
| E11 | Resolução de entitlement/usage com `preferredProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan` (e o equivalente bigmodel na linha 463), com `requirePreferredProvider: true` | `packages/ui/src/SettingsPage.tsx:408-451` (:444, :450; bigmodel em :411-437, :463) |
| E12 | Login OAuth disparado a partir das settings para presets de assinatura | `packages/ui/src/settings/model-provider-section/oauthActions.ts:10-36` (`startPresetSubscriptionLogin`) |

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

- **C1 (P1):** Na welcome screen, o usuário vê apenas caminhos neutros de configuração (API key ou provedores que ele mesmo configurar); não vê botões OAuth dedicados a Z.ai/BigModel nem entrada destacada no topo.
- **C2 (P2):** Na settings, o usuário seleciona Z.ai ou BigModel na lista de provedores e configura a API key, exatamente como faria com qualquer outro provedor.
- **C3 (P3):** Nenhum banner "Limited-time offer", nenhuma recomendação de Start Plan e nenhum card de saldo/promo do Coding Plan aparece em chat ou settings.
- **C4 (usuário avançado):** Quem preferir OAuth pode continuar usando `zcode login` no CLI; a UI não oferece esse caminho, mas não o impede.

---

## 3. Objetivos e não-objetivos

### Objetivos

- O1. Tornar Z.ai e BigModel visualmente equivalentes a qualquer outro provedor por API key em toda a UI (welcome screen, settings, chat).
- O2. Eliminar toda oferta/promoção de Coding Plan e claim de plano da superfície de UI.
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

- **RF-01.** Remover os botões OAuth dedicados a Z.ai/BigModel da welcome screen: o caminho OAuth por provider (E1, E4) deixa de existir para esse par. A welcome screen passa a oferecer exclusivamente o fluxo de API key (botão "use API key") e o fluxo já existente para provedores não-Z.ai/BigModel, se houver.
- **RF-02.** Remover a ordenação preferencial: eliminar `getProviderPriority` com pesos fixos (zai=0, bigmodel=1) (E2) e qualquer lógica em `resolveVisibleLoginProviders` (E3) que posicione Z.ai/BigModel acima dos demais. Provedores remanescentes, se houver, seguem ordem neutra (`order`).
- **RF-03.** Remover tags de região exclusivas (`LoginOAuthRegionTag` e `getLoginOAuthRegionTagMessageId`) junto com os botões a que pertencem (E1).
- **RF-04.** Revisar `resolveLoginRetryProvider` (`WelcomeScreen.tsx:550-560`): com OAuth de Z.ai/BigModel removido da UI, o fallback para `providers[0]` não deve mais cair implicitamente em Z.ai/BigModel.

### Settings (provedores de modelo)

- **RF-05.** Remover o login OAuth a partir das settings para presets de assinatura Z.ai/BigModel: `startPresetSubscriptionLogin` e `reportPresetSubscriptionSuccess` (`oauthActions.ts:10-55`, E12) deixam de ser alcançáveis da UI; o arquivo deve ser removido ou reduzido ao que sobrar de uso real (decidir na implementação, ver Q3).
- **RF-06.** Remover os cards de preço e produtos do Coding Plan (`codingPlanPricingCards.ts`, `useCodingPlanProducts.ts`), o card de saldo Start Plan (`StartPlanBalanceCard.tsx`) e componentes relacionados de status/promo de Coding Plan da seção de provedores (E9), incluindo `StartPlanCard.tsx`, `StartPlanQuotaStatusCard.tsx` e strings `settings.modelProvider.codingPlan.start.*` / `product.firstPromo` (E8).
- **RF-07.** Remover o card de saldo do Start Plan da toolbar de chat (`chat-input-toolbar/StartPlanContextBalance.tsx`, E10).
- **RF-08.** Remover dicas/hints de registro específicas de BigModel na UI de provedores (`BigModelRegistrationHint.tsx`) ou generalizá-las para provedores por API key — nenhuma menção preferencial a BigModel.

### Entitlement / usage

- **RF-09.** Remover a preferência de provider na resolução de entitlement/usage em `SettingsPage.tsx:408-451`: eliminar `preferredProviderId: zaiIndividualCodingPlan` (:444, :450), o paralelo bigmodel (:463) e `requirePreferredProvider`/`allowDisabledPreferredProvider` associados (E11). A aba de usage não deve assumir nenhum provedor preferido; se o usuário não tiver provedor configurado, mostra estado neutro/vazio.
- **RF-10.** Garantir que a usage de provedores configurados via API key continue funcionando sem a camada de preferência (o caminho genérico por provider configurado é a fonte única).

### Marketing / ofertas

- **RF-11.** A UI não deve mais renderizar nem acionar banners/toques de marketing com claim de plano: remover os caminhos de `claim_zcode_plan` e `claimManualPlan` do lado da UI (`MarketingTouchProvider.tsx:250-295, :365-372`, E5), incluindo banner, diálogos de dismiss/sucesso/falha e o prewarm de verificação. Ações de marketing neutras (ex.: `open_url`) permanecem, se desejado (ver Q4).
- **RF-12.** Remover recomendações de plano no chat: `startPlan.recommendation.*` (E7) e o componente/gatilho que as exibe deixam de existir.

### Paridade de provedor

- **RF-13.** Z.ai e BigModel permanecem na lista de provedores configuráveis via API key, com fluxo, cards, validação e ordenação idênticos aos de qualquer outro provedor por chave (sem logo em destaque, sem badge "Free", sem "Connect Z.ai").
- **RF-14.** Nenhum caminho de UI deve invocar serviços de OAuth ou Coding Plan para Z.ai/BigModel após a mudança (a UI não pode mais disparar `startOAuth` para esses providers nem `claimManualPlan`).

### i18n

- **RF-15.** Limpar strings órfãs em `en-US.ts` e `zh-CN.ts` (e qualquer outro locale espelhado): `manualClaimPlan.*` (E6), `startPlan.recommendation.*` (E7), `settings.modelProvider.codingPlan.start.*`, `settings.modelProvider.codingPlan.product.firstPromo`, `login.oauth.button.zai` / `.bigmodel` / `login.oauth.regionTag.*` e demais strings que ficarem sem referência. Rodar verificação de strings não usadas para fechar o conjunto.

---

## 5. Requisitos não funcionais

- **RNF-01 (Performance):** A remoção não deve degradar o tempo de renderização da welcome screen e da settings; espera-se melhora (menos consultas de entitlement/produtos no mount). Nenhum fetch fantasma deve permanecer: hooks removidos (`useCodingPlanProducts`, entitlement probing com preferred provider) não devem disparar requisições.
- **RNF-02 (Acessibilidade):** Estados vazios criados pelas remoções (ex.: aba usage sem provedor) devem ter texto acessível e foco gerenciado; remoção de banners não pode deixar regiões aria-live vazias referenciadas.
- **RNF-03 (Observabilidade/telemetria — proposta):**
  - Remover junto com os componentes os eventos de telemetria que só eles emitem (ex.: `add_model_success` com `login_default: "1"` em `oauthActions.ts:38-55`).
  - **Não** remover eventos genéricos de configuração de provider por API key — pelo contrário, aproveitar para garantir que configuração de Z.ai/BigModel via API key emita o mesmo evento genérico dos demais provedores (paridade mensurável).
  - Proposta: adicionar um evento único de migração (ex.: `zai_ui_parity_visible`, tipo `pv`) na welcome screen/settings por uma release, para medir adoção e detectar usuários que procuravam OAuth (ver Métricas). Removê-lo na release seguinte.
- **RNF-04 (Consistência visual):** Seguir `DESIGN.md`; reutilizar os cards/fluxos genéricos de provider por API key existentes.
- **RNF-05 (Build):** `pnpm typecheck`, `pnpm lint` e `pnpm knip` limpos após remoções (knip deve confirmar que não sobraram exports órfãos dos arquivos deletados).

---

## 6. Métricas de sucesso

- **M1:** 0 referências a `claim_zcode_plan`, `claimManualPlan`, `startPlan.recommendation`, `getProviderPriority`, `preferredProviderId: zaiIndividualCodingPlan` no `packages/ui` (verificável por grep).
- **M2:** Taxa de conclusão da configuração inicial via API key mantida ou melhorada vs. baseline anterior (sem queda atribuível à remoção dos botões OAuth).
- **M3:** Nº de configurações bem-sucedidas de Z.ai/BigModel via API key ≥ nível que evidencie que o caminho continua descobrível (meta: sem queda > 10% vs. soma histórica de entradas OAuth + API key do par, janela de 2 releases).
- **M4:** Zero tickets de "não consigo mais usar Z.ai/BigModel" causados por falta de descoberta (distinguindo de usuários que queriam OAuth, cenário aceito — ver Risco R2).
- **M5:** `pnpm knip` sem exports órfãos relacionados à remoção.

---

## 7. Escopo de release e faseamento

**Fase 1 — Núcleo de paridade (release alvo da feature):**
1. RF-01–RF-04 (welcome screen sem OAuth Z.ai/BigModel e sem prioridade).
2. RF-09–RF-10 (entitlement/usage sem preferred provider).
3. RF-13 (paridade via API key garantida e testada).

**Fase 2 — Remoção de ofertas:**
4. RF-11, RF-12 (banners de claim e recomendações de plano fora da UI).
5. RF-05–RF-08 (settings: oauthActions, cards de preço/saldo/promo, hints).

**Fase 3 — Limpeza:**
6. RF-14 (auditoria de que nenhum caminho de UI chama OAuth/Coding Plan services).
7. RF-15 (i18n órfão) + telemetria de migração (RNF-03).

**Critério de corte por fase:** cada fase termina com `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` verdes e testes/E2E dos cenários atualizados (welcome screen e settings são superfícies com E2E existentes — cenários de OAuth na welcome screen precisam ser removidos/substituídos pelos de API key).

---

## 8. Riscos de produto e questões em aberto

### Riscos

- **R1 — Usuários Z.ai/BigModel sem API key à mão:** quem usava o login OAuth na UI perde o caminho de 1 clique e precisa gerar uma chave no portal. Mitigação: o provedor permanece configurável via API key com fluxo padrão; considerar link para o portal (neutro, sem destaque) — ver Q5.
- **R2 — Percepção de regressão ("sumiu o login com Z.ai"):** comunicação em changelog/release notes é necessária; CLI continua oferecendo `zcode login`.
- **R3 — Dead code de marketing do lado servidor:** o backend pode seguir entregando toques com `claim_zcode_plan`; se algum outro cliente ainda renderizar, tudo bem, mas a UI removida não deve deixar handlers mortos gerando warnings. Mitigação: ação desconhecida deve ser ignorada silenciosamente (log debug).
- **R4 — Acoplamento oculto do entitlement:** `SettingsPage.tsx` e a aba usage podem ter fluxos (children panels, refresh de access) dependentes do preferred provider; remover sem mapear os dependentes pode quebrar a usage de provedores comuns. Mitigação: inventário de usos de `useUsageEntitlement` e `resolveEntitledAccountProviderAccess*` antes da Fase 1.
- **R5 — Estados vazios na aba usage:** sem provedor preferido, a aba pode ficar vazia para usuários novos; precisa de estado neutro bem resolvido.

### Questões em aberto

- **Q1:** A welcome screen deve manter algum caminho de login além de API key (ex.: OAuth genérico para provedores futuros), ou fica 100% API key nesta release? *Hipótese de default: 100% API key.*
- **Q2:** `resolveLoginRetryProvider` e `startTrackedLogin` permanecem se não sobrar nenhum provider OAuth visível na welcome screen — remover o modo "providers" inteiro ou mantê-lo genérico? *Default proposto: remover o modo se não houver providers não-Z.ai/BigModel registrados.*
- **Q3:** `oauthActions.ts` é deletado ou mantido morto? *Default proposto: deletar se RF-14 confirmar que nenhum outro ponto da UI o usa (confirmar com `pnpm dep:refs --list-exports`).*
- **Q4:** Ações de marketing neutras (`open_url`) e o restante do `MarketingTouchProvider` (poller, banner de imagem sem claim) permanecem? *Default proposto: manter o mecanismo, remover apenas os caminhos de claim de plano.*
- **Q5:** Incluir link "obter API key" no card de Z.ai/BigModel (como já existe `BigModelRegistrationHint`)? *Default proposto: generalizar o hint para todos os presets por API key que o declarem, sem tratamento especial de Z.ai/BigModel.*
- **Q6:** Telemetria de migração (RNF-03) é aprovada? Qual o nome e a duração do evento?
