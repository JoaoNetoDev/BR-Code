# ZCode CUA SDK v3 — projeto da API (superfície visível ao modelo, apenas CUA)

> Status: Draft, aguardando revisão
> Data: 2026-09-10
> Plano do upstream: [Plano técnico de refatoração do ZCode CUA: de 30 ferramentas MCP para execução de código via node_repl](https://internal-docs.example.invalid/redacted)
>
> **Registro de revisões**
> - rascunho v2 (mesmo dia, descartado): objeto de vínculo no estilo ZCode, nomes de método e assinaturas desenhados livremente.
> - rascunho v3 (mesmo dia, descartado): a API do objeto de vínculo foi fixada como a menor superfície para o modelo, mas as capacidades exclusivas do ZCode foram apenas "rebaixadas" para a
>   saída de escape, e as 30 ferramentas foram mantidas integralmente.
> - **v3.1 (este documento)**: a revisão refutou o "rebaixar basta". **Os membros visíveis ao modelo são fixados nos 17 membros de superfície de interação já existentes +
>   `requestAccess` + `stop`; para qualquer capacidade nova, pergunta-se primeiro se ela pode ser removida; se não pode ser removida e nem substituída por composição,
>   ela só pode aparecer em chaves de opções opcionais ou em parâmetros opcionais finais**. Capacidades que podem ser substituídas por composição ou por mecanismo do SDK
>   são removidas diretamente da camada de ferramentas, sem saída de escape; **os métodos de broker que perderam consumidores são removidos junto com as implementações nativas**,
>   sem manter primitivas "para o futuro". `zoom` também é removido. Entrada independente: "compact sempre carrega `actions`, e `detail` é removido". Superfície de ferramentas
>   **30 → 14**, protocolo de broker **63 → 49**; veja §3. A revisão confirmou a aceitação de duas reduções de capacidade: "segurar → observar → soltar" e a leitura da área de transferência.

Escopo deste documento: refatorar a API do SDK `@zcode/cua` visível ao modelo, suas camadas internas e **uma redução explícita da superfície de ferramentas e do protocolo de broker**.
Não altera a autenticação do Helper (M1), o ciclo de vida do Helper (M2), a normalização de AX (M3) nem a superfície de ferramentas MCP do node_repl;
mas **fará o bump da versão do protocolo IPC do broker** (1 → 2) para remover métodos que perderam consumidores, seguindo o caminho de falha fechada (`fail-closed`)
`version_mismatch` já existente em M2 (§7.3).
**Não funde Browser Use**: `agent.browsers` / `browser-use-plugin` sem nenhuma alteração.

---

## 0. TL;DR

### 0.1 Forma final

A API de CUA vista pelo modelo é um objeto global `cua` em camelCase (sem a metade de browser).
Os membros visíveis ao modelo são fixados nos 17 membros de superfície de interação já existentes + `requestAccess` + `stop`;
as assinaturas, os nomes de método, os nomes de parâmetro, os nomes de opção e os tipos de retorno estão em §2:

```js
const state = await cua.getState();            // 展示 app 清单
const app   = await cua.getApp("Notes");       // 绑定 + 展示初始 AX 全树
await app.click(42);
await app.typeText("hello");
await app.pressKey("Return");
await app.getAXState();                         // 自动展示；返回 string
```

A superfície visível ao modelo converge para **dois métodos de segurança + quatro bolsas de opções opcionais**, sem nenhum membro adicional.

### 0.2 Três contagens

| Dimensão | Situação atual | v3.1 |
|---|---|---|
| Ferramentas / métodos visíveis ao modelo | 30 ferramentas MCP | 19 membros do SDK (17 membros de superfície de interação + `requestAccess` + `stop`) |
| Superfície de ferramentas de baixo nível (`cua.computer`) | 30 | **14** (remove 16, §3.2-3.5) |
| Métodos do protocolo de broker | 63 | **49** (remove 15 + adiciona `paste`; removendo mais 6 sondas de teste, chega-se a 43, §3.6) |
| Membros adicionais na superfície do modelo | —— | **0** |
| Opções adicionais na superfície do modelo | —— | 4 bolsas de opções, com 5 chaves no total (`modifiers` / `strategy` / `holdSeconds`) |

### 0.3 Duas semânticas especiais (precisam ser declaradas explicitamente na documentação do modelo)

1. **Ciclo de vida do Worker**: a cada `js` do node_repl há um Worker novo (especificação sem estado de 2026-07-28);
   `const app` não sobrevive até a próxima célula, e a documentação do modelo não pode ensinar o modelo a guardar handles entre chamadas com `const`. Mitigação em §5.1.
2. **Prevenção de reenvio com `possibly_sent`**: a assinatura pública das ações é `Promise<void>`; a informação "pode já ter sido enviada"
   não ocupa lugar na assinatura e fica escondida no objeto de erro. Veja §5.2.

---

## 1. Princípios de minimização da superfície do modelo

> **R1｜Membros visíveis ao modelo são fixos.** Os membros visíveis ao modelo são fixados nos 17 membros de superfície de interação já existentes + `requestAccess` + `stop`.
> Não se faz "renomear melhor", não se adiciona parâmetros posicionais, não se muda tipos de retorno.
>
> **R2｜Para nova capacidade, pergunte primeiro se dá para remover.** O critério não é "é útil?", e sim
> **"dá para substituir por duas linhas de JS, por uma chamada composta ou por um mecanismo interno do SDK"**. O que dá para substituir, remova;
> o que não dá para substituir e tem evidências a favor só pode aparecer em chaves de opções opcionais dos métodos existentes ou em parâmetros opcionais finais.
>
> **R3｜Semântica de segurança só se esconde, não se remove.** Validação rígida de `state_id`, grade exata de frame, `possibly_sent`,
> lease do controller e kill switch são todos mantidos, mas passam a ser campos internos ou erros tipados, sem ocupar lugar na assinatura.

R2 é a mudança central do v3.1 em relação ao rascunho v3. A versão anterior enfiava toda capacidade exclusiva em
`cua.computer` como saída de escape, com o argumento de que "a saída de escape não custa nada ao modelo". Esse argumento vale apenas para o modelo,
não para o repositório: cada ferramenta exige um schema, um handler, uma entrada na tabela de tiers, uma anotação, um oráculo de e2e
e um cenário de act-verify por plataforma. Metade das 30 ferramentas é resíduo da era "30 ferramentas MCP" — naquela época cada ida e volta a mais custava
um turno do modelo, então comprimir operações repetidas em parâmetros era o certo; depois da mudança para execução de código, esses parâmetros e ferramentas
viraram peso puro de manutenção.

---

## 2. Superfície visível ao modelo

### 2.1 Declaração TypeScript completa

`// + ZCode` indica um item acrescentado conforme R2 (apenas chave opcional / parâmetro opcional final).

```ts
// ───────────────────────────────────────────── 标量
type Vec2 = [x: number, y: number];
type Direction = "up" | "down" | "left" | "right" | "u" | "d" | "l" | "r";
type MouseButton = "left" | "right" | "middle" | "l" | "r" | "m";
type SelectionType = "text" | "cursor_before" | "cursor_after";

interface ObservationOptions {
  /** Display the observation to the model. Defaults to true. */
  emit?: boolean;
}
interface StateOptions extends ObservationOptions {
  disableDiffing?: boolean;
}                                                   // ← detail 已删除（§3.3）
interface ClickOptions {
  mouseButton?: MouseButton;
  clickCount?: number;
  modifiers?: string;                               // + ZCode（"cmd+shift"）
  strategy?: "auto" | "a11y" | "event";             // + ZCode（默认 auto）
}
interface SelectTextOptions {
  prefix?: string;
  suffix?: string;
  selectionType?: SelectionType;
}
interface PasteOptions {
  format?: "text" | "md" | "html";
}                                                   // ← restoreClipboard 已删除（§3.4）
interface StateAndScreenshot {
  state: string;
  screenshot?: Uint8Array;
}
interface PressKeyOptions {                         // + ZCode（整个第二参数是附加的）
  holdSeconds?: number;                             //   > 0 时走 hold_key
  strategy?: "auto" | "a11y" | "event";
}                                                   // ← repeat 已删除（§3.4）
interface ScrollOptions {                           // + ZCode
  strategy?: "auto" | "a11y" | "event";
}                                                   // ← amount 已删除（§3.4）
interface DragOptions {                             // + ZCode
  modifiers?: string;
  strategy?: "auto" | "a11y" | "event";
}

// ───────────────────────────────────────────── 交互面（12 个成员）
/** The shared interaction surface of an explicitly bound app. */
interface Target {
  /** Display and return the current accessibility state. */
  getAXState(options?: StateOptions): Promise<string>;
  /** Display and return the screenshot. */
  getScreenshot(options?: ObservationOptions): Promise<Uint8Array>;
  /** Display and return accessibility state and its screenshot, when available. */
  getAXStateAndScreenshot(options?: StateOptions): Promise<StateAndScreenshot>;

  paste(text: string, options?: PasteOptions): Promise<void>;
  click(target: number | Vec2, options?: ClickOptions): Promise<void>;
  drag(from: Vec2, to: Vec2, options?: DragOptions): Promise<void>;
  pressKey(key: string, options?: PressKeyOptions): Promise<void>;
  scroll(target: number | Vec2, direction: Direction,
         pages?: number, options?: ScrollOptions): Promise<void>;
  selectText(elementIndex: number, text: string,
             options?: SelectTextOptions): Promise<void>;
  setValue(elementIndex: number, value: string): Promise<void>;
  typeText(text: string): Promise<void>;
  performSecondaryAction(elementIndex: number, action: string): Promise<void>;
}
// ← Target.zoom 已删除（§3.2）。附加成员数量：0。

/** 无任何额外文档化成员。 */
interface App extends Target {}

// ───────────────────────────────────────────── 数据
interface AppInfo {
  // listApps 直通 producer 的 list_applications wire 形状（工具层不做映射）。
  pid: number;
  name: string | null;
  bundle_id: string | null;                         // macOS bundle id / Windows AUMID
  active: boolean;                                  // 是否 frontmost
}
interface State {
  apps: AppInfo[];
  // ZCode 不融合 BUA，该键**不存在**（§5.3）。
}

// ───────────────────────────────────────────── 根对象
declare const cua: {
  getState(options?: ObservationOptions): Promise<State>;
  getApp(target: string): Promise<App>;
  listApps(options?: ObservationOptions): Promise<AppInfo[]>;
  computer: Computer;                               // 内容见 §3.5

  /** + ZCode：安全面。刻意放顶层，不藏进逃逸口。 */
  requestAccess(capabilities?: string[]): Promise<AccessStatus>;
  stop(reason?: string): Promise<void>;
};
```

### 2.2 Lista de membros e diferenças de opções

Os 12 membros de `Target` têm todos o mesmo nome e a mesma assinatura; a diferença está apenas nas bolsas de opções:

| Membro | Diferença |
|---|---|
| `getAXState` / `getScreenshot` / `getAXStateAndScreenshot` | Nenhuma |
| `paste` | Nenhuma |
| `click` | `ClickOptions` ganha `modifiers` / `strategy` |
| `drag` | Ganha os parâmetros opcionais finais `DragOptions` |
| `pressKey` | Ganha os parâmetros opcionais finais `PressKeyOptions` |
| `scroll` | Ganha os parâmetros opcionais finais `ScrollOptions` (apenas `strategy`) |
| `selectText` / `setValue` / `typeText` / `performSecondaryAction` | Nenhuma |

Objeto raiz `cua`: `getState` / `getApp` / `listApps` / `computer` formam a superfície base,
`State` não tem a chave `browsers`; acrescidos `requestAccess` / `stop`.
A metade de browser (`browsers` / `getBrowser` / `createBrowserTab` / `getTab` /
`listBrowsers` / `listTabs`) **não existe**.

### 2.3 Regras semânticas (não apenas assinaturas)

A semântica visível ao modelo é definida em `apps/zcode-cli/packages/zcode-cua-plugin/docs/computer-use.md`, sem alterações por arbitrio:

- **Os métodos de observação exibem o resultado automaticamente**; os métodos de ação, não. `{emit:false}` desliga.
- **Vincular é observar**: `cua.getApp(...)` exibe a árvore AX **completa** daquele app antes de retornar.
- **O texto AX usa diff por padrão**; `{disableDiffing:true}` obtém a árvore completa; "se um `getAXState()` isolado reportar nenhuma mudança, não o repita imediatamente sem nenhuma ação intermediária".
- **Settle embutido, é proibido o modelo fazer sleep** (cerca de 1s, aumentando para 5s quando há sinais de loading).
- **Validade dos índices**: após uma ação, chame `getAXState()` de novo antes de decidir o próximo passo.
- **Lote**: ações determinísticas + um `getAXState()` final na mesma célula.
- **Falha é exceção**: ações são `Promise<void>`, sucesso não retorna valor.
- **Divulgação progressiva da documentação no primeiro uso**: a primeira chamada, qualquer que seja, exibe a API completa.
- "Attempting an action is not completion: verify that the returned
  UI state visibly shows the requested result" é mantida como está.

---

## 3. Redução da superfície de ferramentas: 30 → 14

### 3.1 Critério

Para cada ferramenta, duas perguntas; só permanece se a resposta for não para ambas:

1. Pode ser substituída por uma chamada composta?
2. Pode ser substituída por duas linhas de JS ou por um mecanismo interno do SDK (settler / vínculo / composição de paste)?

### 3.2 Remoção de um cluster inteiro: subsistema de pixels de tela cheia (5)

`screenshot` (tela cheia), `zoom`, `list_displays`, `switch_display`, `cursor_position`.

Esses cinco formam um **cluster acoplado**, resíduo da era das 19 ferramentas pixel-CUA:
`screenshot` captura "a tela selecionada por `switch_display`", o valor de retorno de `cursor_position` traz
`selected_display` (`electronNativeBackend.ts:1036`), e `zoom` recorta de uma grade retida.

A evidência decisiva para a remoção: **a captura por app não depende do monitor selecionado**.
Não há nenhuma referência a `selectedDisplay` em `axReadOnly.ts` / `axSkyshot.ts`;
o estado de seleção de monitor é consumido apenas por `screenshot` e `cursor_position`.
Logo, remover este cluster não afeta `getApp` / `getAXState` / `app.getScreenshot()` (caminho por app).

`zoom` merece uma explicação à parte. Não é uma capacidade, é uma **compensação pela compressão com perdas de si próprio**: as capturas do ZCode usam uma escada de qualidade JPEG;
quando não cabe no orçamento de bytes, o tamanho é reduzido em cadeia (`jpeg-budget.ts:124`), o texto pequeno borra,
e por isso é preciso ampliar e recapturar.
Removê-lo traz um benefício extra: `frame-registry.ts:31` diz que os bytes da grade exata são
"retained **only** for frame-bound zoom"; sem o zoom, o frame registry não precisa mais
reter em memória cada grade já entregue.

**Infraestrutura interna que precisa ser mantida**: `display-topology` / `display-provenance`
são usados por `axReadOnly.ts` e `electronInputHandlers.ts` para conversão de coordenadas DIP e despacho de entrada,
**manter**. O que é removido é apenas a camada de "estado de seleção de tela" (`selectedDisplayId` em `electronDisplaySelection.ts`,
e o estado de mesmo nome em `session.ts`).
A permanência do método de broker `screen_size` precisa ser verificada na implementação (`electronNativeBackend.ts:999`,
aparentemente usado só internamente / para diagnóstico).

**Custo aceito**: o modelo perde a capacidade de "olhar a área de trabalho inteira". O caminho alternativo é
`listApps()` + `getApp()`; no macOS, anexos da barra de menus, central de notificações e Dock são processos com AX,
e o `getApp` os cobre. Em cenários com múltiplos monitores, a captura por app funciona na tela onde a janela está, sem necessidade de selecionar tela.

### 3.3 Remoção de `detail`: compact sempre carrega `actions` (correção de defeito independente)

`detail:"full"` acrescenta apenas duas coisas em relação ao compact: `bounds` e `actions`
(`format.ts:135-139`). E:

- `bounds` é algo que o modelo tem **proibição de usar**. `SKILL.md:465` na íntegra: bounds é
  informação de diagnóstico de ponto global de tela, não pixel de grade, "**never** copy them into a
  coordinate target".
- `actions` é a **única** fonte legítima de valores para `performSecondaryAction`,
  e o SKILL exige "use apenas as actions declaradas pelo elemento, não adivinhe".

O nível padrão é o compact. Ou seja, **o nível padrão esconde os dados necessários para as ações semânticas,
e para obtê-los é preciso trocar para o nível que também despeja o campo proibido**. Essa não é a forma que um interruptor deveria ter.

Mudança: o compact carrega `actions` incondicionalmente, nunca carrega `bounds`, e o parâmetro `detail` é
removido por completo (tanto da camada de ferramentas quanto de `StateOptions`). Este item pode entrar primeiro como um PR pequeno e independente.

### 3.4 Dobragem em opções: 4 variantes de clique + hold_key (5)

| Ferramenta removida | Substituição | Lado do broker |
|---|---|---|
| `double_click` | `click(t, {clickCount: 2})` | `click` já carrega button + clicks, zero alteração |
| `triple_click` | `click(t, {clickCount: 3})` | Idem |
| `right_click` | `click(t, {mouseButton: "right"})` | Idem |
| `middle_click` | `click(t, {mouseButton: "middle"})` | Idem |
| `hold_key` | `pressKey(key, {holdSeconds})` | `hold_key` / `hold_key_to_app` permanecem como primitivas |

**Parâmetros** removidos na mesma leva:

- `repeat` de `key` — substituído por duas linhas: `for (let i = 0; i < 3; i++) await app.pressKey("Down")`.
  Ele ainda trazia três regras especiais (rejeição de negativos, `0` como no-op, clamp para 1..100),
  que ocupavam um ramo e um texto específicos em `keyboard-runtime.ts`.
- `amount` de `scroll` — `pages` é mais semântico.
- `restoreClipboard` de `paste` (adicionado por mim no rascunho v3) — a semântica de paste
  **é** justamente restaurar depois de colar; dar um interruptor equivale a permitir que o modelo contamine a área de transferência do usuário.

### 3.5 Remoção conjunta de ferramentas e métodos de broker (6 ferramentas)

| Ferramenta removida | Por quê | Método de broker correspondente |
|---|---|---|
| `wait` | Com o settler, chamar wait é容积_profile contra o SDK; o settle embutido proíbe explicitamente sleep | Nenhum (sleep local) |
| `read_clipboard` | Conteúdo que o AX não consegue ler é fallback de fallback | `read_clipboard` **remover** |
| `write_clipboard` | Substituída por `paste` | `write_clipboard` **remover** |
| `mouse_move` | Tooltip por hover é raro | `move_to` **remover** |
| `left_mouse_down` | Pressionar sem par tem superfície de vazamento de retenção de entrada | `mouse_down` **remover** |
| `left_mouse_up` | Idem | `mouse_up` **remover** |

O único uso real combinado de `mouse_move` + `left_mouse_down` + `left_mouse_up` é
"segurar → observar → soltar" (arrastar sobre uma pasta para expandir por hover, ajuste fino de slider). **O v3.1 não expõe primitivas de segurar**,
`drag(from, to)` é a única entrada de arraste.

Benefício adicional: o modelo nunca mais obtém um `left_mouse_down` sem par,
e a **superfície de vazamento do lado do modelo** de `InputHoldRegistry` + `pointerHoldGuard` desaparece por completo
(`hold_key` continua vivo, então a limpeza interna mantém `cancel_input_holds`).

**Redução de capacidade aceita (confirmada na revisão)**: três itens são abandonados de forma direta:
arrastar com expansão por hover, ajuste fino de slider e leitura da área de transferência.
Não se mantêm primitivas de broker "para o futuro" — para restaurar, é preciso adicionar de novo o método, adicionar a implementação nativa e fazer o bump da versão do protocolo;
o custo está explicitado em §9.

### 3.6 Redução do protocolo de broker: 63 → 49

Depois da remoção da camada de ferramentas, um lote de métodos de broker ficou sem nenhum consumidor. A revisão decidiu **removê-los junto, sem manter primitivas**.

**Já eram métodos mortos (sem relação com esta refatoração, já sem consumidores): 6**

| Método | Situação atual |
|---|---|
| `screen_size` | Zero pontos de chamada em src |
| `get_skyshot` | Zero pontos de chamada em src (a captura por app na verdade passa por `capture_app`) |
| `click_element_at_point` | Zero pontos de chamada em src (coordenada via AX na verdade passa por `element_at_point` + `element_press`, ver `target-utils.ts`) |
| `key_down` / `key_up` | Só há implementação no lado do Helper (`electronInputHandlers.ts:4284-4301`), sem chamador |
| `type_text_into_current_focus` | Idem (`:4208-4223`) |

**Perderam consumidores com a remoção das ferramentas: 9**

`screenshot`, `list_displays`, `set_display`, `cursor_position`, `move_to`,
`mouse_down`, `mouse_up`, `read_clipboard`, `write_clipboard`.

**Novo: 1**

`paste` — implementação nativa (dentro do Helper: salvar / gravar no NSPasteboard / enviar a tecla de colar / restaurar),
veja §6.6. É uma ação nativa do Helper, não montada no lado do host com primitivas de área de transferência.

**Limpeza opcional junto: 6 sondas exclusivas de teste**

`pip_live_probe_start_test_panel` / `_window_bounds` / `_drag_panel` /
`_move_test_panel` / `_sample_ownership` / `_initial_hit_surface`.
Os únicos consumidores são `scripts/pip_live_*` e `test/pip-live-*` — **seis métodos que existem só para teste
vivem no protocolo de broker de produção**. Recomenda-se movê-los para trás de uma porta de build DEBUG, ou passar a conduzir os painéis por uma entrada exclusiva de teste.
Depois disso, 63 → 43.

**O bump da versão de protocolo é uma operação prevista no design**: o comentário em `ipcVersion.ts` diz, na íntegra,
que "mudanças semânticas (**adição ou remoção de métodos**, formato de requisição/resposta, modelo de autenticação) exigem bump",
e que o descasamento entre novo e velho segue o caminho de `version_mismatch` (sem retry, com aviso para atualizar).
Portanto, remover métodos de broker não é contornar M1 / M2, e sim seguir o caminho que eles já prepararam:
`CUA_BROKER_IPC_VERSION` muda de `1` para `2`.

### 3.7 As 14 ferramentas sobreviventes (`cua.computer`)

```
list_apps  open_application  list_windows  get_app_state
left_click  scroll  left_click_drag
type  set_value  select_text  key
perform_action
request_access  stop_computer_control
```

O papel de `cua.computer` é expor a **API de computer de baixo nível específica de cada plataforma** (a semântica está em
`apps/zcode-cli/packages/zcode-cua-plugin/docs/computer-use.md`).
A documentação do modelo menciona isso uma vez, sem desenvolver.

As capacidades exclusivas do ZCode que moram aqui: **endereçamento de janela** (`list_windows` + `app_ref.window_id`, §4.1),
**seleção exata por pid**, **`activate` / `confirm_focus_steal` / `new_instance` / `urls` de `open_application`**
(pré-requisito do fluxo com `strategy=event`; `cua-14-tool-e2e-validity.md`
afirma que o painel de arquivos exige "confirmed open_application followed by a fresh observation"),
**a forma em range de `select_text`** (implementação interna da correspondência de texto, §6.3).

### 3.8 As três capacidades que precisam ser mantidas, com evidências

| Capacidade | Evidência |
|---|---|
| `strategy: "event"` | `cua-14-tool-e2e-validity.md`: renomear no Finder (M01/M04), estilo de caractere no TextEdit (M08-M10), navegação por teclado no Chromium (C16) **exigem** `strategy=event` + `window_id` exato, senão o AX retorna sucesso mas o modelo do documento não muda (a realidade das responder chains). O "não roubar o foco do usuário" do ZCode é um argumento central de venda, e o custo é exatamente precisar dessa válvula de escape |
| Endereçamento de janela | O mesmo documento: M01 / M04 / M08-M10 / C16 exigem vincular a janela exata. A descrição de ferramenta em `observation.ts:1008-1011` é justamente ensinar o modelo a preencher `window_id` de volta |
| `modifiers` | cmd+click (abrir em nova aba) e shift+click (seleção por intervalo) não podem ser expressos por composição — as teclas modificadoras precisam ter efeito no instante da pressão |

`strategy: "a11y"` (força AX, sem ações disponíveis resulta em fail-closed) é usado muito pouco,
mas como chave de opção custa zero e é o único meio de impedir a degradação silenciosa para coordenadas, então é mantido.

---

## 4. Três tratamentos que precisam de explicação especial

### 4.1 Endereçamento de janela

A superfície de ferramentas do ZCode usa nomes unificados nas três plataformas (a decisão central do §2 do AGENTS.md), e `getApp` está disponível
nas três plataformas, sem ser dividido por plataforma em duas formas de vínculo. R1 tem prioridade:

- **Superfície documentada**: `App` não tem membros de janela. `getApp` vincula a janela principal / a janela-chave.
- **Saída de escape**: `cua.computer.list_windows({app_ref})` + devolver o `window_id` para o `app_ref`.
- **Membro não documentado**: `cua.getWindow(app: string, windowId: number): Promise<App>`,
  devolvendo um `App` vinculado a essa janela (a mesma interface `Target`). Não entra no SKILL nem em `documentation.get()`.

**Benefício de correção preservado**: hoje, ao passar um `window_id` inválido, o Helper degrada silenciosamente para a janela mais à frente,
devolvendo apenas `window_id_fallback: true` mais uma nota (`axReadOnly.ts:1235-1244`), e o modelo facilmente deixa isso passar,
seguindo operando na janela errada. `cua.getWindow()` **lança diretamente** `STALE_STATE` no fallback.

**Lacuna conhecida**: trazer uma única janela para o primeiro plano (`activate_window`). A capacidade nativa existe
(`activateWindow(pid, bundleId, windowId)` em `electronNativeBackendTypes.ts:352`,
com raise + focus + activate atômicos e revalidação de identidade), mas não foi exposta como método de broker,
e só é chamada por dentro do raw input de escopo de janela (`electronInputHandlers.ts:963-970`).
Entra em funcionamento quando S5 adicionar o método de broker `activate_window`.

### 4.2 Visão estruturada de AX: uma escolha que precisa ser medida

R1 exige `getAXState(): Promise<string>`. Isso tem um **custo real**:
hoje o SKILL ensina a completar "observar → encontrar o elemento de forma estruturada → agir" em uma única célula,
e um retorno textual não permite isso; quando o índice é desconhecido, uma descoberta custa um round trip a mais.

Tratamento: a superfície documentada devolve `string` conforme R1; `app.elements(): Promise<AppElement[]>` preserva a visão estruturada;
durante o período de release gradual de S4, a GUI eval mede o round trip e a taxa de aprovação das duas versões e, se o fluxo textual for
significativamente pior, `elements()` é promovido a membro documentado. **Esta é a única decisão de superfície mínima de todo o documento que preserva margem de reversão.**

**Conclusão de S4 (2026-09-16, a reversão já está em vigor)**: `elements()` foi promovido a **membro documentado**. O critério não foi token nem
round trip, e sim "quando a árvore é podada, o modelo não tem outra saída": `targeting/format.ts` seleciona elementos por prioridade quando ultrapassa
o limite e recompõe a cadeia de ancestrais, e a nota diz `indices are sparse; N hidden` (em máquina real 736 → 300). Nesse ponto, os índices dos
elementos ocultos simplesmente não aparecem no texto da árvore e o modelo só pode adivinhar — enquanto a tabela estruturada devolvida por `elements()` é sempre a tabela inteira
("texto pode ser diff, estrutura deve ser completa"), a única saída confiável. Por isso ela aparece no trecho de Keyboard do SKILL e no
trecho de API de `computer-use.md`; no lado da implementação ela continua com `enumerable: false` (R2 restringe a superfície
**enumerável**, não proíbe uma saída de escape nomeada).

A declaração de segurança que acompanha é indispensável: `elements()` observa mas não exibe, então precisa passar `tree_shown_to_model: false`
junto com `bindApp` / `getScreenshot`, e limpar o `treeSeen` do lado do SDK (caso contrário, o próximo `getAXState` daria um diff
em relação a uma árvore que nunca foi exibida). A revisão de 2026-09-16 descobriu que as duas coisas estavam faltando na época; já foram corrigidas e há teste de regressão
(o "every silent observation declares..." de `tests/sdk.node-test.mjs` no z-code).

Tirar `state_id` da superfície do modelo é ganho líquido, sem relação com a visão estruturada: o índice é resolvido pelo SDK usando o `stateId`
atual daquele target (§5.5), o modelo já não pode escrever um `state_id` errado, e stale é sempre fail-closed, mais estrito que hoje.
O reforço de 2026-08-25 do z-code, "AppState estruturado é a única fonte de verdade do Worker",
tinha como premissa (o próprio modelo montar `{state_id,index}`) algo que já não se sustenta no v3.1,
e é rebaixado a **invariante interna**: a bridge ainda lança `CUA_STRUCTURED_STATE_UNAVAILABLE` ao receber uma resposta sem AppState estruturado,
apenas deixa de exigir que ela seja repassada ao Worker.

### 4.3 Um descongelamento explícito de um contrato congelado

`TOOL_NAMES` (30) + `TIER_TABLE` + `TOOL_REGISTRY` + o manifesto de evaluator entre repositórios
formam uma barreira de 4 vias contra drift (comentário em `manifest.ts` + `test/manifest.test.ts`),
e `docs/cua-14-tool-e2e-validity.md` é o contrato normativo de regressão,
onde `protocol.all_30_tools_have_passing_oracles` exige que os 30 nomes tenham oráculos aprovados.

O objetivo dessa barreira é **impedir drift acidental**, não proibir remoções intencionais. A remoção de ferramentas do v3.1 é um
**descongelamento intencional**, e precisa ser declarada simultaneamente na mensagem do commit e naquele documento normativo:
a lista de remoções, o caminho de substituição de cada item e a nova contagem de ferramentas.
A barreira em si é mantida (as 14 vias continuam consistentes entre as quatro partes); apenas o número de base muda de 30 para 14.

---

## 5. Semânticas especiais e limites

### 5.1 Worker sem estado e estado entre células

O ZCode segue a especificação sem estado de 2026-07-28: a cada `js` há um Worker descartável, e `const app` não sobrevive até a próxima célula.

Mitigação: `stateId` / `frameId` / linha de base do diff / marcador de documentação de primeiro uso são mantidos pela **session de runtime
do shared host**. Na célula seguinte, `await cua.getApp("Notes")` é um **novo vínculo, não uma nova observação**:
quando é possível recuperar o `stateId` mais recente daquele app, exibe-se apenas uma linha `reattached: Notes (stateId=…)`,
sem despejar a árvore inteira. A documentação do modelo não declara "state is persistent across calls";
em vez disso, traz um template de bootstrap por célula (§7.4) e explica que "o vínculo não atravessa células, mas o estado de UI atravessa".

### 5.2 Prevenção de reenvio com `possibly_sent`

A assinatura pública das ações é `Promise<void>`; em caso de falha, lança
`ComputerUseError{code, errorName}` (código de erro em string).
A informação "a ação pode já ter sido enviada" não ocupa lugar na assinatura: `action_sent` / `dispatch_status`
do ZCode são orientados por incidentes:
um clique pode já ter sido aplicado, e um retry cego causaria clique duplo. R3 exige apenas esconder, nunca remover:

```ts
declare class ComputerUseError extends Error {
  readonly code: ComputerUseErrorCode;   // 字符串码，映射自 BrokerErrorCode
  /** 动作是否已下发。false 才可以安全重试同一个非幂等动作。 */
  readonly actionSent: boolean;
  readonly dispatchStatus?: "accepted" | "possibly_sent";
  readonly retry: "reobserve" | "retry" | "never";
  readonly details: Readonly<Record<string, unknown>>;
}
```

| Recibo do runtime | Comportamento no v3.1 |
|---|---|
| `action_sent:true, dispatch_status:"accepted"` | resolve (void) |
| `action_sent:true, dispatch_status:"possibly_sent"` | **reject**, `actionSent:true`, `retry:"reobserve"` |
| `action_sent:false` | reject, `actionSent:false`, `retry` conforme o code |

Códigos de erro: `PERMISSION_DENIED` `NOT_AUTHORIZED` `APP_NOT_FOUND` `AMBIGUOUS_APP`
`LAUNCH_FAILED` `INVALID_APP` `ELEMENT_UNAVAILABLE` `STALE_STATE` `NOT_SETTABLE`
`NOT_SELECTABLE` `ACTION_UNAVAILABLE` `FOREGROUND_REQUIRED` `CONTROLLER_BUSY`
`CONTROL_STOPPED` `SCREEN_LOCKED` `HELPER_UNAVAILABLE` `VERSION_MISMATCH` `TIMEOUT`
`STRUCTURED_STATE_UNAVAILABLE` `INTERNAL`.

A segunda coisa preservada: o **contrato da grade exata de frame**.
O `frame-contract/` do ZCode + `official-frame-integrity-v1` precisam ser mantidos,
e a forma de fazer isso é internalizá-los por completo: `getScreenshot()` devolve um `Uint8Array` cru, o `frameId` é guardado pelo SDK no target,
as ações por coordenada são vinculadas internamente, e o modelo nunca vê nem precisa passar nada disso.

### 5.3 Não fundir com BUA

- `browsers` / `getBrowser` / `createBrowserTab` / `getTab` / `listBrowsers` / `listTabs` **não existem** em `cua`; `State` **não contém** a chave `browsers`.
- `Target` é implementado apenas por `App`, sem compartilhar tipo nem implementação com o `Tab` de browser.
- `agent.browsers` continua sendo fornecido de forma independente pelo Browser Use; o CUA não lê, não escreve e não sobrescreve.
- A cadeia de delegação de `agent.documentation.get(name)` permanece como está: o CUA trata apenas de `"computer-use"`.
- Cada plugin mantém o seu próprio `computer-use-client.mjs`; nesta rodada muda-se apenas o do CUA; a bridge é compartilhada e não muda.

### 5.4 O que explicitamente não será feito

Gravação de áudio, lista negra de apps em nível de organização e diálogos de aprovação por app
(o ZCode cobre necessidades equivalentes com lease de controller + kill switch + aprovação única de alto risco no `js` externo;
o plano do upstream já está definido: nenhuma nova aprovação por ação na camada interna).

### 5.5 Resolução de índices e coordenadas

```ts
function bindTarget(t: number | Vec2, ctx: TargetSession): ResolvedTarget;
// number → {type:"element", state_id: ctx.stateId!, index: t}
//          stateId 缺失 → throw STALE_STATE（消息给出 `await app.getAXState()`）
// [x,y]  → {type:"coordinate", frame_id: ctx.frameId, x, y}
//          frameId 缺失 → throw STALE_STATE（消息给出 `await app.getScreenshot()`）
```

**Não há reposição automática de observação**. Reobservar automaticamente transformaria "o modelo acha que clicou em A, mas clicou em B" em um erro silencioso.
Em `drag(from, to)`, cada ponta é vinculada separadamente.

---

## 6. Camadas internas e implementação

### 6.1 Camadas

```
Worker（código do modelo）
  globalThis.cua / App                     ← reescrever: scripts/computer-use-client.mjs
       │  bridge.call(method, input)        ← sem alteração（Symbol zcode.node-repl.computer-use-bridge）
       ▼
host compartilhado：CuaRuntimePool                 ← sem alteração
  └─ ComputerUseRuntime.execute({toolName, arguments, context})
       ├─ withActionPolicy（§6.2）
       ├─ ActionSettler（§6.4）
       ├─ TargetBinder（§5.5）
       └─ TargetSessionStore（§6.5）
       ▼
  14 handlers sobreviventes（observation/pointer/keyboard-runtime/semantic）
       ▼
  BrokerClient → Helper com assinatura
```

Em S0-S4, **zero alterações no protocolo do Helper**: remover a camada de ferramentas não exige remover métodos de broker.
A limpeza dos métodos mortos do lado do Helper fica em um PR separado (§7.3), para não se misturar com a assinatura de M1 / o ciclo de vida de M2.

### 6.2 `withActionPolicy`

Reúne em um único decorador as preocupações transversais espalhadas pelos handlers:

```
killSwitch.ensureRunning()          // hoje: withKillSwitchPreflight
  → setAppDisplaySideband(target)   // hoje: runWithTargetAppDisplayContext（indicador de PiP / Win）
  → controllerLease.ensure()        // → CONTROLLER_BUSY
  → settler.wait(targetKey)
  → handler(args)
  → settler.defer(targetKey)
  → telemetry({durationMs, terminalStatus, toolName, appId})
```

O endurecimento de TOCTOU (revinculação posterior do alvo de binding a partir do `pid` / `window_id` do `app_ref`) já existe e é mantido.
**Não se introduz diálogo de aprovação por app**.

### 6.3 `selectText` por correspondência de conteúdo

A assinatura na superfície do modelo é `selectText(elementIndex, text, {prefix, suffix, selectionType})`,
e a existente no ZCode é `select_text({target, text_range:[start,length]})`.

**Não exige alteração no Helper**: o SDK lê o value do elemento (pelo `read_element` já existente),
o lado do host usa `prefix` / `suffix` para localizar a correspondência única, calcula `[start, length]`
e chama o `element_select_text` já existente. Correspondência ambígua → lança `NOT_SELECTABLE` informando o número de candidatos.
`selectionType` é mapeado para uma seleção recolhida com `length:0`.

### 6.4 `ActionSettler`

Novo `ActionSettler` (`defer()` empurra o deadline, `wait()` espera até o deadline),
atuando em todas as plataformas, com agrupamento por target. Parâmetros: `postActionMs` com padrão 100ms entre ações consecutivas;
espera base de cerca de 1000ms antes da observação, aumentando para no máximo 5000ms quando há sinais de loading / busy.
O segundo é implementado em S3 com um critério local de estabilidade ("a tabela de elementos dá o mesmo hash duas vezes"), sem alteração no Helper;
em S5 o Helper passa a fornecer um sinal de busy. Isso torna possível a remoção da ferramenta `wait` (§3.5).

### 6.5 `TargetSessionStore`

Cada target vinculado mantém, no lado do host,
`{ appRef, stateId, frameId, diffBaseline, appInstructionsShown, settleDeadline }`.
Usos: base de resolução de índices / coordenadas, linha de base do diff, reattach no rebind feito por `getApp`,
exibição de dicas específicas do app apenas uma vez (dedup com `Set`).
O ciclo de vida acompanha a session de runtime, não o Worker.

### 6.6 `paste` (método de broker nativo)

**Forma de implementação: ação nativa do Helper, não montagem no lado do host.**
Dentro do Helper: salvar a área de transferência → gravar → enviar a tecla de colar → restaurar.

O ZCode passa a ter um método de broker `paste`, com parâmetros `{app_ref, target?, text, format}`,
implementado nativamente no lado do Helper (NSPasteboard no macOS, API de área de transferência própria no Windows / Linux),
com o salvamento e a restauração totalmente dentro do Helper.

Por que não usar a composição no lado do host (`read_clipboard` → `write_clipboard` → tecla de colar → restauração):
seria preciso manter duas primitivas de área de transferência no broker, e em v3.1 elas já não têm nenhum outro consumidor (§3.6).
Colocar a lógica de restauração dentro do Helper ainda resolve uma condição de corrida: entre os quatro passos da composição no lado do host,
o usuário ou outro processo pode reescrever a área de transferência, e a restauração sobrescreveria o conteúdo novo do usuário.

Valor: `typeText` digita caractere a caractere, e historicamente teve defeitos de unicode no macOS; texto com várias linhas ainda dispara
autoindentação / autocompletar; para conteúdo formatado e texto multilinha, prefira `paste`.

**Impacto no cronograma**: `paste` depende de alteração no Helper, então cai em S0c (o PR de redução de protocolo),
e não em S1. `md` / `html` exigem um pasteboard com múltiplos formatos — S0c faz apenas `text`,
e passar `md`/`html` lança `ACTION_UNAVAILABLE` com aviso de degradação; S5 completa.

### 6.7 Normalização de apelidos de tecla

O modelo tem prévias sobre nomes de tecla no estilo xdotool / keysym.
Antes de `findUnsupportedKeyToken` entra uma camada de normalização:

| Apelido de entrada | Token canônico |
|---|---|
| `Return` `Enter` `KP_Enter` | `return` |
| `Control_L` `Control_R` `Control` `Ctrl` | `ctrl` |
| `Alt_L` `Alt_R` `Meta_L` | `alt` |
| `Super_L` `Super_R` `Super` | `cmd`(darwin) / `super`(linux) / `win`(win32) |
| `Shift_L` `Shift_R` | `shift` |
| `Escape` | `esc` |
| `Prior` / `Next` | `pageup` / `pagedown` |
| `period` `comma` `greater` `slash` `minus` `equal` | `.` `,` `>` `/` `-` `=` |
| `KP_0`…`KP_9` | Exige mapeamento pelo Helper; quando falta, lança um erro explícito em vez de descartar em silêncio |

Apenas compatibilidade do lado da entrada; o conjunto interno de tokens não muda, e as regras de teclas modificadoras entre plataformas não mudam
(macOS `cmd`, Linux / Windows `ctrl` — a documentação continua explicitando isso).

### 6.8 Arquivos a criar / modificar / remover

| Arquivo | Mudança |
|---|---|
| `z-code .../zcode-cua-plugin/scripts/computer-use-client.mjs` | **Reescrever**: global `cua`, `Target`/`App`, emit automático, mapeamento de erros, `cua.computer`(14), membros não documentados |
| `z-code .../zcode-cua-plugin/docs/computer-use.md` | Reescrever como referência do v3.1 (sem a metade de browser + trecho de bootstrap por célula) |
| `z-code .../zcode-cua-plugin/skills/computer-use/SKILL.md` | Reescrever |
| `zcode-cua/plugin/skills/computer-use/SKILL.md` | Reescrever (fonte de verdade do producer) |
| `zcode-cua/src/tools/zoom.ts` | **Remover** (480 linhas) |
| `zcode-cua/src/broker/server/electronDisplaySelection.ts` | **Remover** (S0c; camada de estado de seleção de tela, o topology fica em `lib/display-topology.ts`) |
| `zcode-cua/src/tools/manifest.ts` | `TOOL_NAMES` 30 → 14; `APP_ASSOCIATION_MODE_BY_TOOL` em sincronia |
| `zcode-cua/src/tools/tier-table.ts` | `TIER_TABLE` / `READ_ONLY_TOOLS` / `SAFETY_CONTROL_TOOLS` em sincronia (`left_mouse_up` sai de SAFETY_CONTROL) |
| `zcode-cua/src/tools/schemas/{observation,pointer,keyboard,runtime}.ts` | Remover os schemas de 16 ferramentas; remover `detail` / `repeat` / `amount` |
| `zcode-cua/src/tools/{observation,pointer,keyboard-runtime}.ts` | Remover os handlers correspondentes; `type`/`key` sem o ramo de repeat |
| `zcode-cua/src/targeting/format.ts` | Compact carrega `actions` incondicionalmente, nunca carrega `bounds`; remover o ramo de `detail` (§3.3) |
| `zcode-cua/src/targeting/frame-registry.ts` | Não reter mais os bytes da grade exata para o zoom; remover a menção a `zoom` do texto de erro |
| `zcode-cua/src/targeting/session.ts` | Remover o estado `selectedDisplayId` |
| `zcode-cua/src/tools/observation.ts` | Liberar o delta: os três estados são mapeados para um AppState interno completo; remover os dois `force_full:true` incondicionais (:644, :1092) |
| `zcode-cua/src/broker/server/axReadOnly.ts` | Respostas de delta / no_change completam com a tabela `elements` inteira + emitem um novo `state_id` |
| `zcode-cua/src/runtime/action-settler.ts` | Novo (§6.4) |
| `zcode-cua/src/runtime/target-session-store.ts` | Novo (§6.5) |
| `zcode-cua/src/tools/action-policy.ts` | Novo (§6.2), substitui os pontos de chamada de `withKillSwitchPreflight` |
| `zcode-cua/src/tools/target-binder.ts` | Novo (§5.5) |
| `zcode-cua/src/broker/types.ts` / `ipcVersion.ts` | **S0c**: `BROKER_METHODS` 63 → 49; versão IPC 1 → 2 (§7.3) |
| Camada nativa do Helper | **S0c**: remover as exportações nativas que perderam consumidores; adicionar o `paste` nativo (uma implementação por plataforma, §6.6) |
| `zcode-cua/src/tools/keyboard-runtime.ts` | Apelidos de tecla (§6.7); correspondência de conteúdo em `select_text` (§6.3) |
| `zcode-cua/src/tools/legacyToolMap.ts` | Acrescentar duas colunas: `computer` (as 14 sobreviventes) e `v3`; as ferramentas removidas ficam marcadas como `removed` + caminho de substituição |
| `zcode-cua/docs/cua-30-tool-e2e-validity.md` | **Renomear e alterar o conteúdo**: 30 → 14, conjunto `FULL_SURFACE_ORACLE_CHECKS` reduzido, com o motivo do descongelamento escrito (§4.3) |

---

## 7. Compatibilidade, varredura e testes

### 7.1 Canais de compatibilidade

1. **`cua.computer.*`**: os 14 métodos sobreviventes, com schema e envelope de retorno preservados literalmente.
2. **`agent.computerUse`**: mantém-se uma versão como alias de `cua`; removido em S5.
3. **`legacyToolMap`**: as ferramentas removidas são marcadas como `removed` + caminho de substituição, servindo apenas para a leitura de transcripts
   antigos e para diagnóstico, sem volta a executar.

### 7.2 Lista de varredura das remoções (esforço real de S0)

| Consumidor | O que fazer |
|---|---|
| Barreira de drift de 4 vias em `test/manifest.test.ts` | Base 30 → 14, as quatro partes continuam consistentes |
| `test/tier-table.test.ts` / `annotations.test.ts` | Sincronizar |
| `docs/cua-14-tool-e2e-validity.md` (normativo) | `protocol.all_30_tools_have_passing_oracles` → 14; `FULL_SURFACE_ORACLE_CHECKS` sem as entradas correspondentes; registrar o descongelamento |
| `evals/zcode-gui-eval/` | Remover ou reescrever os cenários que visam as ferramentas removidas (o caso C18, de cobertura da superfície completa, é o mais afetado) |
| `scripts/cua_act_verify*.py` + `docs/cua-act-verify-{,windows-,linux-}scenarios.md` | Varrer os cenários das três plataformas; `hold_key` / `wait` / `select_text` aparecem nos cenários e precisam ser reescritos na nova forma |
| `scripts/windows-*-live-smoke.mjs` / `verify_linux_*.mjs` | Sincronizar |
| `test/legacy-tool-map.test.ts` | Acrescentar asserções de `removed` |
| Demais `docs/` | Passagens que referenciam as ferramentas removidas |

### 7.3 Redução do protocolo de broker (S0c, dentro deste escopo)

A lista de remoções está em §3.6: 15 remoções + 1 adição (`paste`), com a opção de remover mais 6 sondas de teste.
**Vira um PR independente**, mas **deixa de ser empurrado para o fim** — `paste` depende dele, então ele vem antes da refatoração do SDK.

O que muda junto:

| Item | Mudança |
|---|---|
| `src/broker/types.ts` | `BROKER_METHODS` 63 → 49; `READ_ONLY_BROKER_METHODS` sem os itens removidos |
| `src/broker/ipcVersion.ts` | `CUA_BROKER_IPC_VERSION` 1 → 2 (o comentário em `ipcVersion.ts` já determina que adicionar ou remover métodos exige bump) |
| `src/broker/server/electronInputHandlers.ts` | Remover os handlers de `move_to` / `mouse_down` / `mouse_up` / `key_down` / `key_up` / `type_text_into_current_focus` / `read_clipboard` / `write_clipboard`; adicionar `paste` |
| `src/broker/server/electronNativeBackend.ts` | Remover os handlers de `screenshot` / `list_displays` / `set_display` / `cursor_position` / `screen_size` / `get_skyshot` / `click_element_at_point` |
| `src/broker/server/electronDisplaySelection.ts` | Remover por completo (o topology fica em `lib/display-topology.ts`) |
| Camada nativa | Remover as exportações de addon correspondentes (`moveTo` / `mouseDown` / `mouseUp` / `keyDownGlobal` / `keyUpGlobal` / `screenshot` de tela cheia / a parte da enumeração de monitores que existia só para seleção de tela); adicionar o `paste` nativo (NSPasteboard / Win / Linux, um para cada) |
| `test/broker/*` | `types.readOnlyMethods.test.ts` e demais atualizados pela nova lista |
| Compatibilidade entre versões | Helper antigo + host novo segue o caminho de `version_mismatch` (sem retry, com aviso para atualizar), que já existe em M2 |

**Granularidade de rollback**: S0c é um commit / PR isolado. Reverter o S0c reverte também o `paste`,
então os testes de `paste` a partir de S1 precisam poder ser pulados, e não falhar, quando o método `paste` estiver ausente.

### 7.4 Lista de mudanças nos testes de contrato

| Teste | Asserção atual | Mudança |
|---|---|---|
| `z-code .../zcode-cua-plugin/tests/sdk.node-test.mjs` | `METHOD_NAMES.length === 30` | Mudar para: `cua.computer` com 14 itens + os 12 membros de `Target` presentes + `cua` sem nenhum membro de browser |
| O mesmo | O resultado da ação contém `action_sent` / `dispatch_status` | Sucesso resolve como `undefined`; `possibly_sent` faz reject com `actionSent === true` |
| `zcode-cua/test/skill-keyboard-contract.test.ts` | Fixa `nodeRepl.write(nextState.text)`, `return_state="none"`, o limite de 22KB | Mudar para fixar "os métodos de observação exibem automaticamente", "proibido write sobre o resultado de uma observação", "bootstrap por célula" |
| `zcode-cua/test/observation-tools.test.ts` | delta / no_change → `null` | Inverter: os três estados devolvem um AppState interno completo |
| Novos | —— | Asserção exata de surface (§7.5), `target-binder.test.ts`, `action-settler.test.ts`, `key-alias.test.ts`, `paste.test.ts`, `error-mapping.test.ts`, `compact-carries-actions.test.ts` |

### 7.5 Barreira de surface

`apps/zcode-cli/packages/zcode-cua-plugin/tests/sdk.node-test.mjs` faz asserções exatas de surface
sobre a superfície visível ao modelo:

1. Os 12 membros de superfície de interação de `Target` **existem e os parâmetros posicionais têm o mesmo nome e a mesma ordem**;
2. Em relação ao núcleo de interação, **os itens novos só podem ser** chaves de opções opcionais ou parâmetros opcionais finais,
   ou membros de lista branca (lista branca atual: `cua.requestAccess`, `cua.stop`, `cua.computer`);
   **o número de membros adicionais em `Target` precisa ser 0**;
3. Não há membros de browser em `cua`, e `State` não tem a chave `browsers`.

Qualquer acréscimo fora da lista branca faz o teste falhar, obrigando quem mexer na API na próxima rodada a tomar uma decisão explícita.

### 7.6 Template de bootstrap

```js
const root = process.env.ZCODE_CUA_PLUGIN_ROOT ?? process.env.ZCODE_PLUGIN_ROOT
  ?? process.env.CLAUDE_PLUGIN_ROOT;
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupComputerUseRuntime } = await import(
  pathToFileURL(join(root, "scripts", "computer-use-client.mjs")).href);
await setupComputerUseRuntime({ globals: globalThis });   // 装配 globalThis.cua

const app = await cua.getApp("Notes");
await app.click(42);
await app.getAXState();
```

`setupComputerUseRuntime` é idempotente e precisa rodar em cada célula. `cua.getState()` só é chamado quando for preciso ter a lista de apps;
a documentação de referência é obtida sob demanda (`agent.documentation.get("computer-use")`), sem push no primeiro uso.

---

## 8. Implementação por fases

| Fase | Conteúdo | Aceitação |
|---|---|---|
| **S0a** | **PR pequeno e independente**: compact carrega `actions` incondicionalmente, nunca carrega `bounds`, remoção de `detail` (§3.3) | `compact-carries-actions.test.ts`; `perform_action` não precisa mais de `detail:"full"` |
| **S0b** | **Redução da superfície de ferramentas 30 → 14** (§3.2 / §3.4 / §3.5) + varredura completa (§7.2) + documentação do descongelamento (§4.3) | Barreira de drift de 4 vias com base 14 e as quatro partes consistentes; evals / act-verify / smoke todos verdes; `pnpm typecheck` passa depois da remoção de `zoom.ts` |
| **S0c** | **Redução do protocolo de broker 63 → 49 + `paste` nativo** (§3.6 / §7.3), incluindo a remoção da camada nativa e de `electronDisplaySelection.ts`, e a versão IPC 1 → 2 | Helper antigo + host novo segue o caminho de `version_mismatch`; build do Helper passa nas três plataformas; `paste`(text) tem um oráculo de colagem real |
| **S1** | Global `cua` + `Target`/`App` + `TargetBinder` + `TargetSessionStore` + mapeamento de erros + `cua.computer` | Asserções de surface de `sdk.node-test.mjs` verdes (0 membros adicionais em `Target`); `error-mapping.test.ts` cobrindo todos os codes |
| **S2** | Emit automático + divulgação da documentação no primeiro uso + liberação do delta (o Helper completa `elements` e emite um novo `state_id`) | Tokens de observação da mesma tarefa caem ≥60% em relação a S1; `no_change` não dispara mais force_full; sem saída duplicada |
| **S3** | `ActionSettler` + `withActionPolicy` | Todo o texto do SKILL que diz "o modelo espera sozinho" é removido; a taxa de aprovação do act-verify não cai |
| **S4** | Correspondência de conteúdo de `selectText`, apelidos de tecla, `getWindow` (permanece não documentado) / `elements` (já promovido a documentado); medição da escolha de §4.2 | 4 grupos novos de testes unitários + um cenário novo de act-verify por plataforma; produzir a conclusão sobre se `elements()` é promovido a membro documentado |
| **S5** | Sincronização de SKILL / `computer-use.md` / legacyToolMap / provenance; release gradual; remoção do alias `agent.computerUse`; `activate_window`; `md`/`html` de `paste` | Testes de contrato todos verdes; `pnpm typecheck` `pnpm lint`; a GUI eval não regride |
| **S6** (opcional) | Remover as 6 sondas de teste `pip_live_probe_*` (63 → 43), sinal de busy, keysym `numpad` | —— |

S0a pode começar imediatamente, não depende de nenhuma decisão de superfície do modelo. S0b vem primeiro porque reduz pela metade a superfície de mudança das etapas seguintes.
S0c precisa vir antes de S1, porque `paste` depende dele.
O interruptor de release gradual é `ZCODE_CUA_SDK_SURFACE=v1|v3` (padrão v1, virando v3 depois do período de observação).

---

## 9. Riscos

| Risco | Contramedida |
|---|---|
| Depois de remover 16 ferramentas + 15 métodos de broker, descobrir que alguma era realmente necessária | **O custo de restauração já não é pequeno**: seria preciso devolver o schema + o handler + o método de broker + a implementação nativa nas três plataformas + mais um bump da versão IPC. Por isso, o motivo da remoção e o caminho de substituição de cada item ficam registrados (§3.2-3.6, Apêndice B); S0b e S0c viram PRs separados, o que facilita um rollback completo. A revisão confirmou a aceitação desse custo |
| Perder "segurar → observar → soltar" e a leitura da área de transferência | A revisão já confirmou a aceitação (§3.5). Não se mantêm primitivas de broker "para o futuro" |
| Perder a observação de tela cheia | Substituído por `listApps()` + `getApp()`; no macOS a UI do sistema é composta por processos com AX |
| Depois de remover o zoom, o texto pequeno fica ilegível | É preciso quantificar, em S0b, a taxa de escala real da captura por app. Se a escala for realmente grave, a saída correta é ajustar o orçamento da captura por app, e não restaurar o zoom |
| O rollback de S0c reverte também o `paste` | Os testes de `paste` a partir de S1 são pulados, e não falham, quando o método `paste` está ausente (§7.3) |
| O `paste` nativo precisa de uma implementação por plataforma, com mais trabalho e mais superfície de regressão do que a composição no lado do host | Em troca, ficam duas primitivas de broker a menos e a condição de corrida da restauração é corrigida (§6.6); S0c faz apenas `text`, e `md`/`html` vão para S5 |
| `getAXState()` devolver string faz "encontrar o elemento" custar um round trip a mais | `app.elements()` serve de rede de proteção; em S4 a conclusão foi promover a membro documentado (§4.2) |
| `possibly_sent` deixa de ser um aviso em texto e vira throw, e o Electron/Chromium pode lançar erros com frequência | Em S1, primeiro apenas **contabiliza** (continua resolvendo e marcando a frequência); depois de confirmada a linha de base, vira throw; mantém-se `ZCODE_CUA_POSSIBLY_SENT=throw\|warn` |
| Com o delta liberado, o modelo reaproveita índices antigos | O delta também emite um novo `stateId`; o índice é resolvido pelo SDK usando o `stateId` atual; stale é sempre fail-closed (mais estrito que hoje) |
| O emit automático e o sink estruturado do host escrevem em paralelo e geram saída duplicada | Reutiliza-se a fronteira atual `hostProjectionResult` / `imageAuthorityResult`; `format-model-facing-budget.test.ts` ganha uma verificação de duplicidade |
| O vínculo não atravessar células ser entendido como "o estado se perdeu" | A documentação escreve explicitamente "refaça `getApp` a cada célula; o estado de UI e o stateId são mantidos pelo host"; o reattach emite só uma linha |
| O descongelamento do contrato de 30 ferramentas enfraquece a proteção contra drift | A barreira é mantida, só a base muda; o motivo do descongelamento e a lista de remoções entram no documento normativo e na mensagem do commit |
| A semântica de `getApp` no Windows / Linux diverge da do macOS | O ZCode **não** lança erro em plataformas que não o macOS (a uniformidade entre as três plataformas é uma vantagem já existente); a falta de capacidade vira erro tipado: no Linux, sem elemento AX → `ELEMENT_UNAVAILABLE`; no Linux/Windows, teclado sem direcionamento por pid → `FOREGROUND_REQUIRED`. `cua.computer.target` expõe a plataforma para o modelo ramificar |

---

## Apêndice A: casos de uso do v3.1

```js
// ── 配方 1：绑定 → 动作 → 观察
const app = await cua.getApp("Notes");       // 展示初始全树
await app.click(42);
await app.typeText("hello");
await app.pressKey("Return");
await app.getAXState();                       // 自动展示 diff

// ── 配方 2：坐标兜底（canvas / Electron / 无 AX 元素）
const app2 = await cua.getApp("Figma");
const png = await app2.getScreenshot();       // per-app 截图，建立内部 frameId 并展示
await app2.click([640, 240]);                 // 像素取自这张栅格
await app2.getAXStateAndScreenshot();

// ── 配方 3：ZCode 附加项（只在选项袋里）
await app.click(42, { mouseButton: "right", modifiers: "cmd", strategy: "a11y" });
await app.pressKey("Return", { holdSeconds: 0.5 });
for (let i = 0; i < 3; i++) await app.pressKey("Down");   // 取代已删除的 repeat
await app.paste("多行\n内容");

// ── 配方 4：逃逸口（多窗口）
const wins = await cua.computer.list_windows({ app_ref: { name: "Preview" } });
const w = await cua.getWindow("Preview", wins[1].window_id);   // 未文档化成员
await w.click(7);
await w.getAXState();

// ── 配方 5：错误处理
try {
  await app.performSecondaryAction(7, "Show Menu");
} catch (e) {
  if (e.code === "ACTION_UNAVAILABLE") {
    await app.getAXState({ disableDiffing: true });   // compact 已带 actions，看清合法取值
  } else if (e.code === "CONTROLLER_BUSY") {
    nodeRepl.write(`another ZCode Computer Use session owns control: ${e.details.owner}`);
  } else if (e.actionSent) {
    await app.getAXState();                            // 可能已落地，先看状态再决定
  } else throw e;
}
```

---

## Apêndice B: destino das 30 ferramentas

| Ferramenta | Destino | Caminho de substituição |
|---|---|---|
| `list_apps` | **Manter** | `cua.listApps()` |
| `open_application` | **Manter** (saída de escape) | `getApp` já inicia de forma transparente; `activate` passa pela saída de escape |
| `list_windows` | **Manter** (saída de escape) | `cua.getWindow()` (não documentado) |
| `get_app_state` | **Manter** | `app.getAXState()` / `getAXStateAndScreenshot()` / `getScreenshot()` |
| `left_click` | **Manter** | `app.click(t, opts)` |
| `scroll` | **Manter** | `app.scroll(t, dir, pages)` |
| `left_click_drag` | **Manter** | `app.drag(from, to)` |
| `type` | **Manter** | `app.typeText(text)` |
| `set_value` | **Manter** | `app.setValue(i, v)` |
| `select_text` | **Manter** (saída de escape = forma em range) | `app.selectText(i, text, opts)` |
| `key` | **Manter** (sem `repeat`) | `app.pressKey(key, opts)` |
| `perform_action` | **Manter** | `app.performSecondaryAction(i, a)` |
| `request_access` | **Manter** | `cua.requestAccess()` |
| `stop_computer_control` | **Manter** | `cua.stop()` |
| `screenshot` (tela cheia) | **Remover** | `app.getScreenshot()` (por app) |
| `zoom` | **Remover** | Nenhum (ajustar o orçamento da captura por app) |
| `list_displays` | **Remover** | Nenhum (a captura por app funciona na tela onde a janela está) |
| `switch_display` | **Remover** | Idem |
| `cursor_position` | **Remover** | Nenhum (puramente diagnóstico) |
| `wait` | **Remover** | Settler embutido no SDK |
| `double_click` | **Remover** | `click(t, {clickCount: 2})` |
| `triple_click` | **Remover** | `click(t, {clickCount: 3})` |
| `right_click` | **Remover** | `click(t, {mouseButton: "right"})` |
| `middle_click` | **Remover** | `click(t, {mouseButton: "middle"})` |
| `hold_key` | **Remover** | `pressKey(key, {holdSeconds})` |
| `mouse_move` | **Remover** | Nenhum; o `move_to` do broker também é removido |
| `left_mouse_down` | **Remover** | `drag(from, to)`; o `mouse_down` do broker também é removido |
| `left_mouse_up` | **Remover** | Idem; o `mouse_up` do broker também é removido |
| `read_clipboard` | **Remover** | Nenhum; o método do broker também é removido |
| `write_clipboard` | **Remover** | `app.paste(text)` (o `paste` nativo do broker); o método antigo do broker também é removido |

Sobrevivem 14, são removidas 16. Das removidas, 9 têm equivalente direto, 5 (o cluster de pixels de tela cheia) têm a capacidade coberta pelo caminho por app,
e 2 (`read_clipboard` e as primitivas de segurar) são reduções de capacidade confirmadas pela revisão.

O protocolo de broker acompanha em 63 → 49 (15 remoções + o `paste` nativo novo), com a opção de remover mais 6 sondas de teste, chegando a 43. Veja §3.6.
