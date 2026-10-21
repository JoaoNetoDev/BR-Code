# SPEC — Identidade BR Code na primeira tela e login por API key genérica

- **Status:** Rascunho para aprovação
- **Data:** 2026-10-21
- **Fronteira:** `packages/ui` (renderer) e `packages/desktop/src/renderer` (HTML de startup). Nenhuma mudança em `packages/shared`, `packages/provider`, `packages/services`, `packages/desktop/src/main` ou `apps/zcode-cli`.
- **Spec relacionada:** `docs/features/paridade-provider-zai-ui/SPEC.md` (RF-01: a welcome screen oferece exclusivamente o fluxo de API key) — esta spec **completa** aquela, que deixou o formulário preso aos dois presets branded.

---

## 1. Contexto

O fork BR-Code é uma adaptação brasileira do ZCode. Duas coisas do primeiro contato com o app ainda pertencem ao upstream:

1. **A identidade.** A welcome screen mostra o logo "Z" e o título "Welcome to ZCode". O fork já tem a marca própria (`public/logo/br-code.png`), usada apenas no README.
2. **O login.** O formulário de API key oferece duas opções: "Z.ai" e "BigModel" — os dois providers branded da Z.ai. Não existe caminho para um endpoint compatível com OpenAI que o usuário traga com a própria chave, que é o caso de uso mais comum fora da Z.ai.

O objetivo do fork (SPEC de paridade, O1) é que providers sejam configuráveis "como qualquer outro provedor". Hoje o formulário de login contradiz isso: ele é a única porta de entrada e só conhece dois presets.

---

## 2. Decisões do dono

- **D1 — Identidade só na primeira tela.** A troca de marca vale para o caminho de entrada do app (welcome screen e startup). Rebranding do nome do produto empacotado, ícones do sistema operacional, diálogo About e as demais strings "ZCode" do i18n é um trabalho de empacotamento, com consequência em `appId`, `productName`, canal de update e diretório de dados do usuário — fica para uma spec própria.
- **D2 — O logo entra como imagem.** A arte do BR Code existe só como PNG (escudo circular). Não há SVG; desenhar um equivalente seria inventar marca. A UI consome o PNG, redimensionado para uso em tela.
- **D3 — "Genérica" é um provider pessoal completo.** A opção genérica não é um atalho: sem `api.baseUrl`, `api.type` e ao menos um modelo, o provider não é publicado no registry (`resolver.ts:107-118`, `222-257`) e não aparece na seleção de modelo. Logo, o formulário coleta os quatro dados no ato.
- **D4 — Presets continuam existindo.** Z.ai e BigModel seguem disponíveis como atalhos: eles preenchem base URL e modelo sozinhos. A opção genérica é a terceira via, não a única.
- **D5 — "Skip for now" não vale para genérico.** O atalho grava `providerFamilyDomain`, que só existe para `zai`/`bigmodel` (`ProviderFamilyDomain` em `packages/shared/src/model-provider-family.ts:7`). Com a opção genérica selecionada, o botão fica desabilitado.

---

## 3. Requisitos funcionais

### 3.1 Identidade

- **RF-01.** A welcome screen exibe a marca BR Code no lugar do "Z" (`ZCodeAboutLogo` → marca do fork), com `aria-label` "BR Code".
- **RF-02.** As strings `login.title` e `login.description` passam a dizer BR Code, em `en-US` e `zh-CN`.
- **RF-03.** A tela de startup (shell do `index.html` do renderer e o badge de `RootStartupLoading`) usa a mesma marca, para que a primeira pintura não mostre o "Z" do upstream.
- **RF-04.** O título da janela do renderer (`<title>` do `index.html`) passa a "BR Code".

### 3.2 API key genérica

- **RF-05.** O seletor de provider do formulário de login passa a ter três opções: Z.ai, BigModel e **Genérica**.
- **RF-06.** Com "Genérica" selecionada, o formulário coleta: **Base URL**, **Formato da API**, **API key** e **Modelo**. Os quatro são obrigatórios; o formato tem default `openai-chat-completions`.
- **RF-07.** Ao continuar com a opção genérica, o app cria um provider pessoal **sem template**, com `api.type`, `api.baseUrl` e `access.apiKey`, e adiciona o modelo informado — o mesmo esqueleto que o caminho "custom" do `ProviderTemplatePicker` produz, fechado no mesmo passo.
- **RF-08.** Com a opção genérica selecionada, o botão "Skip for now" fica desabilitado (D5).
- **RF-09.** Erros de campo (base URL inválida, modelo vazio, key vazia) aparecem no alerta existente do formulário, com mensagem específica.

---

## 4. Contratos de código

### 4.1 `packages/ui/src/login/LoginApiKeyForm.helpers.ts`

```ts
export type ApiKeyProviderChoice = "zai" | "bigmodel" | "custom";
export function resolveLoginApiKeyTemplateId(choice: ApiKeyProviderChoice): string | undefined;
// "zai" -> "zai-api"; "bigmodel" -> "bigmodel-api"; "custom" -> undefined
export function resolveLoginApiKeyProviderLabel(choice: ApiKeyProviderChoice): string;
// "custom" -> "Genérica"
export function resolveLoginApiKeyProviderFamilyDomain(
  choice: ApiKeyProviderChoice,
): ProviderFamilyDomain | undefined;
// "custom" -> undefined (o atalho skip não grava domínio)
```

O tipo de retorno de `resolveLoginApiKeyTemplateId` deixa de ser literal (`"zai-api" | "bigmodel-api"`) e passa a aceitar `undefined` — o consumidor (`LoginApiKeyForm.tsx`) passa a bifurcar: com template, o caminho atual; sem template, o caminho genérico.

### 4.2 `packages/ui/src/login/LoginApiKeyForm.tsx`

- `providerChoice` aceita `"custom"`.
- Quando `providerChoice === "custom"`, além do input de API key, o formulário renderiza:
  - `baseUrl` — `Input` de texto, placeholder `https://api.example.com/v1`;
  - `apiFormat` — select com `PROVIDER_CONNECTION_API_FORMATS` (`packages/ui/src/settings/model-provider-section/ProviderApiFormatSelect.tsx:15-19`), default `openai-chat-completions`;
  - `modelId` — `Input` de texto.
- `saveApiKeyProvider` bifurca:
  - **com template** (comportamento atual, inalterado);
  - **sem template**: `createPersonalProvider({ providerName, initialConfig: { api: { type, baseUrl }, access: { type: "api-key", apiKey } } })` e, em seguida, `addPersonalModel(created.providerId, modelId, ModelConfig.empty())`.
- O botão de skip é desabilitado quando `providerChoice === "custom"`.

### 4.3 `packages/ui/src/components/ui/BrCodeAboutLogo.tsx` (novo)

Componente com o mesmo contrato de `ZCodeAboutLogo` (`{ className?: string }`), renderizando o asset do fork:

```ts
const brCodeLogoUrl = new URL("../../assets/br-code-logo.png", import.meta.url).href;
```

O caminho segue o padrão já usado em `packages/ui/src/UpdateStatusDialog.tsx:16` (`new URL("../../../public/icon_512@2x.png", import.meta.url).href`), que o Vite resolve em build.

### 4.4 Assets

- `packages/ui/src/assets/br-code-logo.png` — 256×256 RGBA, derivado de `public/logo/br-code.png` (1446×1446, 1,8 MB), redimensionado para uso em tela. O master em `public/logo/` não é alterado.
- `packages/desktop/src/renderer/public/br-code-logo.png` — mesma arte, para o shell de startup do `index.html` (o `publicDir` do Vite do renderer é `packages/desktop/src/renderer/public`).

---

## 5. Cenários de aceite

| # | Cenário | Resultado esperado |
| --- | --- | --- |
| CA-01 | Abrir o app em ambiente limpo | Welcome screen com a marca BR Code e o título "Welcome to BR Code" |
| CA-02 | Observar a primeira pintura | Nenhum "Z" do upstream em tela; o startup usa a marca BR Code |
| CA-03 | Abrir o formulário de API key | Três opções: Z.ai, BigModel, Genérica |
| CA-04 | Selecionar "Genérica" | Aparecem Base URL, Formato da API e Modelo, junto do campo de API key |
| CA-05 | Genérica com base URL inválida | Alerta de erro; nenhum provider criado |
| CA-06 | Genérica com modelo vazio | Alerta de erro; nenhum provider criado |
| CA-07 | Genérica válida | Provider pessoal criado com tipo, base URL e key; modelo adicionado; app segue para o workspace |
| CA-08 | Genérica + "Skip for now" | Botão desabilitado |
| CA-09 | Z.ai ou BigModel (comportamento atual) | Inalterado: provider criado pelo template, sem campos extras |
| CA-10 | `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` | Sem erro novo |

---

## 6. Fora de escopo

- Nome do produto empacotado (`productName`, `appId`, `runtimeApplicationName`), ícones do sistema operacional, diálogo About e as demais strings "ZCode" do i18n (settings, onboarding, remoto, about) — trabalho de empacotamento, com impacto em update e diretório de dados (D1).
- O `zcode login` do CLI e o resto do ecossistema OAuth do backend.
- Fluxo de provider personalizado em Settings (já existe e não muda).
- E2E de desktop novo: a cobertura do caminho genérico é unitária, e o E2E existente de login por API key continua verde.

---

## 7. Verificação

- `pnpm typecheck`
- `pnpm lint`
- `pnpm architecture:check --changed`
- `pnpm vitest run packages/ui/test/loginApiKeyForm.test.ts` (helpers) e o novo teste do caminho genérico
- `packages/ui/test/welcomeScreenApiKeyOnly.test.ts` (contrato da welcome screen)
- `packages/desktop/test/e2e/container-boot.test.ts` (título da janela)
