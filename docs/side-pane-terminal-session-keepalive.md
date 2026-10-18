# Manutenção da Sessão do Terminal do Side Pane ao Trocar de Workspace

> Esta spec é um incremento sobre [`docs/ui/side-pane-terminal-tabs.md`](../ui/side-pane-terminal-tabs.md).
> O design original apenas especificava “manter montado ao trocar de tab dentro do side pane / ao recolher o side pane” (linha 19),
> **sem cobrir a troca entre workspaces**. Esta spec completa esse contrato e propõe uma implementação.

## 0. Relação com o design existente (inegociável)

`docs/ui/side-pane-terminal-tabs.md` já estabelece:

- Linhas 10/16: cada side pane terminal tab é uma **instância de terminal independente**, e o menu `+` cria uma nova a cada uso, sem reutilizar um singleton.
- Linha 18: o **painel Terminal inferior não compartilha o estado de sessão de terminal com os side pane Terminal tabs**.
- Linha 19: fechar a tab descarrega o `TerminalSession` e libera o processo de terminal; **trocar para outro side pane tab / recolher o side pane mantém tudo montado**.

Esta proposta segue isso estritamente: **não compartilha sessão com o painel inferior** e **cada side pane terminal continua independente por `tab.id`**. A única coisa é estender o contrato de manutenção da linha 19 para a **troca entre workspaces**.

## 1. Causa raiz (por que o pool forceMount da primeira versão não funcionou)

`TerminalSession.tsx:309-639` amarra a **instância XTerm + o PTY + as inscrições todas em um único effect**:

```
effect cria:  new XTerm(:318) → term.open(container)(:338) → terminalService.create(:440) → inscrição de data/exit
effect cleanup(:606-628):  terminalService.dispose(mata o PTY,:622) + term.dispose(descarta xterm+scrollback,:626)
dependências do effect(:629-639): [cwd, sessionId, services, onShellLabelChange, vários callbacks de resize, ...]
```

**Assim que qualquer item das dependências muda de referência, o effect roda de novo → cleanup → xterm+PTY são totalmente descartados → o histórico se perde.**

O terminal da barra lateral vive no sistema `sidePaneState` (por workspace, substituído inteiramente por `sidePaneMemoryKey`, `useAppPanels.ts:229-243`). A troca entre workspaces necessariamente dispara o desmonte do componente ou uma mudança de dependência → o effect roda de novo → dispose.

A primeira versão tentou adicionar um pool paralelo e forceMount na camada de renderização para “impedir o desmonte do componente”, mas forceMount não bloqueia mudanças nas dependências do effect e, junto com o mecanismo de substituição do sidePaneState, dois mecanismos paralelos ficam facilmente inconsistentes — ou seja, “nível baixo demais”. **A solução correta é tirar a propriedade do xterm+PTY da árvore de componentes**, de modo que qualquer desmonte/remontagem do componente não os afete.

O painel inferior não perde histórico porque o `panelState` (`Terminal.tsx:99`) nunca esteve no sistema por workspace (state de componente único guarda as sessões de todos os workspaces) e depende do forceMount para que o TerminalSession não seja desmontado. A barra lateral vive no sistema por workspace e não pode trazer esse mecanismo para cá.

## 2. Solução: subir a propriedade de xterm+PTY para um registry de nível de módulo (opção B)

Um singleton de nível de módulo `sidePaneTerminalSessionRegistry` mantém `persistentKey(=tab.id) → { instância xterm, fitAddon, terminalId, disposers de inscrição, cwd, hostEl, profileTheme }`. `TerminalSession` ganha a prop `persistentKey?`: se presente, segue o caminho de reuso via registry; se ausente, segue o caminho original (zero mudanças no painel inferior).

```
                      Singleton de nível de módulo (somente side pane, totalmente independente do panelState inferior)
                  ┌──────────────────────────────────────────────────────────┐
                  │ sidePaneTerminalSessionRegistry                           │
                  │   Map<persistentKey(=tab.id), entry>                      │
                  │   entry = { key, term: XTerm, fitAddon, terminalId,        │
                  │             cwd, workspaceKey, hostEl(div residente,       │
                  │             term.open é feito nele), profileTheme(retornado │
                  │             por create, residente entre remontagens),     │
                  │             dispose(injetado por quem cria) }             │
                  │   + stashDiv(display:none, preso a document.body)          │
                  └──────────────────────────────────────────────────────────┘
                  API: has/get/register/attachDom/detachDom/release/releaseByPredicate
                       （o registry não embute factory — a criação de recursos é feita pelo TerminalSession, que depois faz register）
                           ▲
                           │
              TerminalSession ganha persistentKey?: string + workspaceKey?: string
              ┌────────────────────────────────────────────────────────────┐
              │ com persistentKey (só SidePaneTerminalPane passa = tab.id): │
              │   effect:  get(key) hit→reusar / miss→criar e register        │
              │             attachDom(key, container)                       │
              │   cleanup: detachDom(key)  ← não faz dispose, o hostEl volta│
              │                          para o stash                       │
              │ sem persistentKey (inferior): segue o effect original         │
              │   (byte a byte inalterado)                                   │
              └────────────────────────────────────────────────────────────┘
```

### Sequência

```
[workspace A] abre um side pane terminal tab (tab.id = terminal:uuid1)
  SidePaneTerminalPane(persistentKey=tab.id, workspaceKey=A, cwd=A)   ← sem mais useState(createUuid)
   └ effect do TerminalSession [com persistentKey]
       ├ get(tab.id) hit → reusar; miss → criar: new XTerm + open(hostEl) + criar PTY + inscrições
       │                    → entry.workspaceKey = workspaceKey → register(tab.id, entry)
       ├ termRef/fitAddonRef/terminalIdRef ← as referências da entry
       ├ attachDom(tab.id, containerRef)  → o hostEl sai do stash para o container
       └ fitAddon.fit()                   → resize do PTY conforme o tamanho real

[troca para o workspace B] o sidePaneState é substituído por inteiro, o antigo SidePaneTerminalPane é desmontado
  cleanup do TerminalSession [com persistentKey]
   ├ libera os observers locais do componente (ResizeObserver/MutationObserver)
   └ detachDom(tab.id)  → o hostEl volta para o stashDiv (term/PTY/inscrições não são descartados)

[volta ao workspace A] o SidePaneTerminalPane é remontado (tab.id estável)
  effect do TerminalSession [com persistentKey]
   ├ get(tab.id) → hit, devolve a entry existente
   ├ attachDom(tab.id, containerRef) → o hostEl volta para o container
   └ fitAddon.fit() → o histórico de scrollback é preservado por completo ✓

[fechamento explícito de um side pane terminal tab] (o close único/outros/todos de useAppPanels)
  └ release(tab.id) → entry.dispose()(mata o PTY + descarta o xterm + libera as inscrições) ← reciclagem do processo (cumpre o contrato da linha 19)

[fechamento real de uma workspace tab] (WorkspaceShellLayout escuta openWorkspaceKeys)
  └ releaseByPredicate(entry => entry.workspaceKey não está em openWorkspaceKeys)
       → recicla os PTY residentes remanescentes daquele workspace, simétrico a Terminal.tsx:145-177
```

## 3. Mecanismo de reuso da instância xterm (o ponto técnico crítico)

O scrollback do xterm fica no buffer da instância XTerm. O reuso **precisa preservar a mesma instância XTerm**; não pode fazer dispose+new.

- `term.open(el)` é chamado uma única vez (na primeira criação, aberto no `hostEl` da entry).
- Reusar = mover fisicamente o `hostEl` (com a subárvore DOM `.xterm`) para o container atual via `appendChild`; depois de mover, chamar `fitAddon.fit()` para restaurar o tamanho.
- Detach = mover o `hostEl` de volta para o `stashDiv` (`display:none`, preso a `document.body`, criado preguiçosamente pelo registry), evitando que o desmonte do container pelo React destrua junto o DOM do xterm.
- Precedente na comunidade: a troca de terminal tabs do VS Code já usa o reuso por movimentação do DOM do xterm; com renderer canvas/webgl, basta um fit após a movimentação para recuperar.

### 3.1 As inscrições de entrada precisam ter escopo de registry (contrato chave, já deu problema)

`term.onData` (teclado → PTY) e o fallback de textarea do método de input do Windows **precisam ser guardados em `registryDisposers` (residentes com a entry) e não em `localDisposers`**.

- `localDisposers` são todos descartados no cleanup (detach) — se `term.onData` estiver ali, ele é cancelado no detach, e o caminho de reuso não rebinda nada → **ao voltar para o workspace o scrollback está lá mas não dá para digitar** (o PTY/xterm estão vivos, só a cadeia de entrada foi cortada).
- `registryDisposers` residency junto com a entry e não é cancelado no detach; só no `release` (fechamento de tab / de workspace) o `entry.dispose` limpa tudo.
- O fallback de textarea do Windows dependia originalmente da variável de closure de effect único `ptyCancelled`; depois de movido para o registry essa verificação precisa ser removida (`ptyCancelled` fica true após o detach e tornaria o fallback permanentemente inoperante); no release o disposer remove o listener e, com o PTY descartado, o write vira no-op, o que é seguro.
- **O `onData` do caminho persistentKey precisa ficar alinhado byte a byte com o caminho original** (incluindo a deduplicação de `inputFallbackKeydownCandidate` + a manutenção de histórico de `recordTerminalInputFallbackHandledData`/`recordTerminalInputFallbackRecentData`). Já houve uma simplificação que omitiu esse trecho e fazia o método de input chinês do Windows não conseguir digitar inglês diretamente com Shift (só commitando com Enter). O `customKeyEventHandler` é anexado ao term na primeira criação e reside com o term, gravando o candidate no keydown; o `onData` com escopo de registry consome o candidate e mantém o histórico, e o fallback de textarea consome o histórico depois — os três compartilham a ref da instância criada na primeira montagem, ficando coerentes entre detach/reattach.
- **Depois que o PTY fica pronto é obrigatório chamar `flushTerminalServiceResize()`** (simétrico ao caminho original): os tamanhos que o ResizeObserver enfileirou em `pendingTerminalSizeRef` durante a criação são enviados imediatamente após `terminalIdRef.current = id`; caso contrário `scheduleFitAndResize("init")` seria pulado pela dedupe de pending e o PTY ficaria parado com cols/rows errados.
- **Inscrição de exit simétrica ao caminho original**: se houver `onExit`, chama o callback (autoClose); caso contrário, escreve a mensagem de saída. O side pane hoje não passa `onExit`, então as duas formas são equivalentes; manter a simetria evita problemas quando esse接线 for feito no futuro.

## 4. Estratégia de implementação: caminho de registry isolado, caminho original intocado (garantindo zero regressão no painel inferior)

Para garantir por completo que o terminal inferior (funcionalidade central) não sofra regressão, o caminho persistentKey do `TerminalSession` **escreve um conjunto independente de lógica de criação de recursos** (factory), sem extrair nem perturbar as 300 linhas de criação+inscrição do effect original:

- **Caminho original (sem persistentKey, painel inferior)**: lógica do effect, cleanup e array de dependências **byte a byte inalterados**.
- **Caminho de registry (com persistentKey)**: o effect bifurca no início e segue `ensureSession(key, factory)`; dentro da factory são feitos new XTerm + open(hostEl) + create do PTY + inscrições (logicamente simétrico ao caminho original, mas isolado em uma função e reutilizando a mesma `terminalService`).

Custo: há duplicação entre a factory e a lógica de criação do caminho original. Benefício: risco zero no painel inferior (não se mexe nele) e um caminho de registry isolado, controlável e testável.

## 5. Limites e compatibilidade (respeitando as restrições de multi-plataforma/-controle remoto/workspace)

- **Somente side pane**: `persistentKey` é passado apenas por `SidePaneTerminalPane` (= `tab.id`). `Terminal.tsx` no painel inferior não passa nada e segue o caminho original, com zero regressão (cumprindo a linha 18 de side-pane-terminal-tabs.md).
- **`terminalService` não é alterado**: o PTY continua no singleton compartilhado de nível raiz (workspaces locais compartilham `baseServices`); apenas o momento do dispose passa a ser controlado pelo registry (só quando a tab é fechada explicitamente).
- **O mecanismo de substituição do `sidePaneState` não é alterado**: o comportamento de tabs como browser/subagent/plan continua igual.
- **O registry é isolado por `persistentKey`(=tab.id)**: não há casamento por `workspacePath` (compatível com a restrição de identidade de workspace). O PTY de um workspace remoto continua pertencendo aos services da janela atual (linha 24); o registry guarda apenas a referência do id do PTY, sem alterar a pertença.
- **Não envolve session/task realtime nem cadeias replayable/continuous** (linhas 25-26): é apenas reuso de DOM de terminal no renderer.
- **Pontos de reciclagem completos** (evita PTY órfãos):
  - Fechamento explícito de um side pane terminal tab → `handleCloseSidePaneTab` / `handleCloseOtherSidePaneTabs` / `handleCloseAllSidePaneTabs` de `useAppPanels` chamam `release(tab.id)`.
  - Fechamento real de uma workspace tab → `WorkspaceShellLayout` escuta mudanças em `openWorkspaceKeys` e faz `releaseByPredicate` em lote por `entry.workspaceKey` (simétrico a `Terminal.tsx:145-177`). O `workspaceKey` é repassado por `SidePaneTerminalPane → TerminalSession` e gravado na entry.
  - Descarregamento do registry de módulo / testes → `clearForTest()`.

## 6. Riscos

- Refresh do renderer na movimentação física do DOM do xterm (seção 3) — validar na fase de implementação que o fit recupera; se houver problema, voltar a usar um React Portal para projetar o `hostEl` residente (ainda sem descartar a instância).
- Gerência de memória do registry: é preciso fazer release ao fechar workspace e ao fechar tab, para evitar PTYs órfãos.
- Sincronização de longo prazo entre o código duplicado da factory e do caminho original — hoje é protegida pelo teste de contrato de reuso do `TerminalSession` e pelo `terminalPanelState.test.ts` existente, mas as duas cópias já divergiram 3 vezes (ver seção 8); a solução de fundo é a refatoração de convergência para `wireTerminalProcessing` da seção 8.

## 7. Ordem de execução (primeiro a spec → primeiro os testes → depois o código)

1. **spec**: este arquivo.
2. **Testes (escritos primeiro)**:
   - `sidePaneTerminalSessionRegistry.test.ts`: hit/miss de ensureSession, movimentação de pertença do hostEl em attachDom/detachDom, release descartando de verdade (term+PTY+inscrições), entrada ainda existente após um “detach”, reciclagem em lote por releaseByPredicate.
   - Contrato de reuso de `TerminalSession`/`SidePaneTerminalPane`: com persistentKey vai pelo registry, sem persistentKey vai pelo caminho original (asserções de código-fonte + comportamento).
3. **Código**:
   - Criar `packages/ui/src/terminal/sidePaneTerminalSessionRegistry.ts` (singleton de nível de módulo + stashDiv, com a entry contendo `workspaceKey`).
   - `TerminalSession.tsx` ganha as props `persistentKey?` + `workspaceKey?`, com o effect bifurcando logo no início para o caminho de registry (reuso=attachDom, primeira criação=register, cleanup=detachDom / release de semifinados).
   - `SidePaneTerminalPane.tsx`: `sessionId` vem por prop (= tab.id, estável entre workspaces), passando também `persistentKey={sessionId}` + `workspaceKey`; remover `useState(createUuid)`.
   - `AnimatedSidePanePanel.tsx`: ao renderizar `SidePaneTerminalPane`, repassar `sessionId={tab.id}` + `workspaceKey`.
   - `useAppPanels.ts`: fechamento explícito de side pane terminal tab (único/outros/todos) → `release(tab.id)`.
   - `WorkspaceShellLayout.tsx`: escutar `openWorkspaceKeys` e, ao fechar uma workspace tab, fazer `releaseByPredicate` em lote por `entry.workspaceKey` (simétrico a `Terminal.tsx:145-177`).
4. **Validação**: `pnpm typecheck` + `pnpm lint` + novos testes + regressão `terminalPanelState.test.ts`.
5. **commit**: `fix(ui): keep side pane terminal alive across workspace switch via session registry`.

---

## 8. A refatorar: convergir a lógica de processamento do terminal em um único `wireTerminalProcessing` (rascunho de design, não implementado)

> Esta seção é **design**: registra as falhas de arquitetura expostas depois que a manutenção de sessão entrou e o alvo da refatoração. A implementação atual ainda não foi refatorada assim; fica reservada para um trabalho futuro.

### 8.1 Problema: os dois caminhos são “cópias”, não “compartilhamento”

A forma ideal (e também a intenção do produto): **só existe uma cópia da lógica de processamento do terminal**, e o caminho persistentKey e o caminho original (terminal inferior) só bifurcam no **gerenciamento do container**. Hoje, porém, o effect do `TerminalSession.tsx` tem dois ramos paralelos de cerca de 370 linhas, mantidos alinhados byte a byte à mão por meio de comentários e das asserções estruturais de `terminalSessionFocus.test.ts`.

```
Estrutura atual (o problema):
useEffect(() => {
  if (persistentKey) {
    caminho de reuso: registry.get → attachDom/fit/focus
    caminho de primeira criação: new XTerm → open(hostEl)
              ┌─────────────────────────────────────┐
              │ customKeyEventHandler               │  ◀── processamento
              │ themeObserver / registerLinkProvider│      do terminal
              │ .create().then(flush+opts+data+exit │      (primeira cópia)
              │   +onData+textareaIME)+resize+catch │
              └─────────────────────────────────────┘
    → registryDisposers / localDisposers
    cleanup: detachDom (mantém vivo)          ┐
  }                                           │ gerenciamento de container
  else {                                      │ (bifurcação razoável)
    new XTerm → open(el)                      │
    ┌─────────────────────────────────┐│
    │ a mesma lógica de processamento, ││  ◀── processamento do terminal
    │ escrita de novo                   ││      (segunda cópia)
    └─────────────────────────────────┘│
    → disposables (locais do effect)      │
    cleanup: descarta tudo (destrói)      ┘
  }
})
```

### 8.2 Evidência: 3 divergências já aconteceram

Com duas cópias, qualquer alteração em um ponto é facilmente esquecida no outro. Divergências já confirmadas:

| # | Item | Consequência | Status |
|---|----|-------------|--------|
| 1 | `flushTerminalServiceResize()` | No caminho persistentKey o resize enfileirado durante a criação não era enviado depois que o id ficava pronto, e o PTY ficava parado com cols/rows errados | Corrigido (f8cfca38b7) |
| 2 | A inscrição de exit consulta `exitHandlerRef` | No caminho persistentKey a inscrição de exit não consultava o callback onExit, ficando assimétrica em relação ao caminho original | Corrigido (f8cfca38b7) |
| 3 | Atalho de paste `logger.debug("[Terminal] paste via shortcut")` | No caminho persistentKey o customKeyEventHandler ficou sem esse log de debug | Alinhado (nesta mudança) |

As 3 são produto direto de “duas cópias inevitavelmente divergem”.

### 8.3 Estrutura alvo

Extrair uma função de processamento do terminal **única**, deixando em cada caminho apenas o gerenciamento puro de container:

```
// processamento do terminal: globalmente único
function wireTerminalProcessing(term, host, ctx): {
  termDisposers: IDisposable[],   // segue o ciclo de vida do term (data/exit/onData/linkProvider)
  domDisposers:  IDisposable[],   // segue o ciclo de vida do container DOM (themeObserver/resizeObserver)
  cancelPtyCreate: () => void,    // guarda contra PTY órfão quando o cleanup precede o resolve do create
}
{
  // Tudo abaixo é escrito uma única vez:
  // - attachCustomKeyEventHandler (candidate de IME + Ctrl/C/V)
  // - themeObserver (class do documentElement → paleta)
  // - registerLinkProvider
  // - terminalService.create().then(
  //     flushTerminalServiceResize + options de windowsPty/fonte/tema +
  //     (o tema é gravado em entry.profileTheme, residente entre remontagens;
  //      o observer lê da entry, e a ref local do componente é desabilitada — CR-01) +
  //     onDynamicData + onDynamicExit + onData(dedupe de IME em três etapas) +
  //     fallback de textarea + scheduleFitAndResize("init") + requestFocus)
  // - ResizeObserver (observa o host)
  // - .catch (escreve a mensagem de falha + libera a entry de placeholder do registry:
  //   só faz release se registry.get(key) === a entry desta chamada, evitando que uma
  //   entry zumbi reutilizada pelo caminho rápido seja confundida e deixe o terminal
  //   permanentemente sem conexão; a checagem evita que uma entry nova após remontagem
  //   seja removida por engano)
}

useEffect(() => {
  if (persistentKey) {
    const existing = registry.get(persistentKey)
    if (existing) { attachDom(hostEl); fit; focus; return () => detach }   ┐
    const term = new XTerm({...}); term.open(hostEl)                        │ gerenciamento
    const { termDisposers, domDisposers, cancelPtyCreate } =               │ de container
        wireTerminalProcessing(term, hostEl, {...})                         │ (bifurcação)
    registry.register(persistentKey, { term, termDisposers, workspaceKey }) │
    localDisposers = domDisposers                                          │
    return () => { cancelPtyCreate(); detachDom; drain(domDisposers) }      ┘
  }
  const term = new XTerm({...}); term.open(el)                             ┐
  const { termDisposers, domDisposers, cancelPtyCreate } =                 │ gerenciamento
      wireTerminalProcessing(term, el, {...})                               │ de container
  const disposables = [...termDisposers, ...domDisposers]                  │ (bifurcação)
  return () => { cancelPtyCreate(); drain(disposables); dispose(term+pty) } ┘
})
```

### 8.4 Por que os disposers precisam ser divididos em duas categorias

Este é o **único** ponto não trivial que exige reflexão na refatoração, e é também a razão de o caminho persistentKey usar hoje dois baldes, `registryDisposers` e `localDisposers`:

- **Seguem o term (termDisposers)**: `onDynamicData` / `onDynamicExit` / `term.onData` / `registerLinkProvider`. Eles amarram a cadeia de dados PTY ↔ term; no caminho persistentKey o term sobrevive ao detach, então essas inscrições **precisam** residency com o term (caso contrário, ao voltar o scrollback está lá mas a entrada morre — a causa raiz do bug #1 / commit 9e32c2d2d9).
- **Seguem o DOM (domDisposers)**: `themeObserver` (observa o documentElement) e `ResizeObserver` (observa o `el` atual). No caminho persistentKey cada remontagem tem um nó novo, então os observers precisam ser religados a cada effect.

No caminho original o term não sobrevive ao effect, então as duas categorias podem ir para o mesmo `disposables` — é exatamente a escrita do caminho original depois da refatoração (`[...termDisposers, ...domDisposers]`).

### 8.5 Testes primeiro (na refatoração é obrigatório começar vermelho e terminar verde)

1. **Novo teste de contrato**: afirmar que o effect do `TerminalSession` chama o mesmo `wireTerminalProcessing` nos dois ramos, persistentKey e não persistentKey (em nível de código-fonte: o número de ocorrências no grep = 2, e sem duplicação dentro do mesmo if). É a trava mecânica que garante “só existe uma cópia da lógica de processamento”.
2. **Manter** os contratos de comportamento existentes de `terminalSessionFocus.test.ts` (bytes do onData de IME, simetria do exit, ordem do flush); depois da refatoração, todos precisam continuar verdes.
3. **Regressão**: `terminalPanelState.test.ts` (painel inferior) + `sidePaneTerminalSessionRegistry.test.ts` (manutenção de sessão) não podem regredir.

### 8.6 Riscos e pré-requisitos

- Superfície de mudança: extração de cerca de 250 linhas de código compartilhado, deixando os dois ramos do effect com cerca de 40 linhas cada. É principalmente uma movimentação mecânica, mas envolve **ordem do create assíncrono, flush do resize pendente e a deduplicação em três etapas do composition**, ou seja, uma área sensível a timing e a IME.
- Hoje **não há rede de segurança e2e** (a e2e desta feature estava listada como “opcional posteriormente” no plan original). Antes da refatoração vale adicionar uma e2e de troca entre workspaces + entrada por IME (seguindo o esqueleto de `browser-tab-close-cross-workspace.test.ts`); caso contrário, a regressão só pode ser coberta por teste unitário + smoke test manual.
- A refatoração é **puramente estrutural, com zero mudança de comportamento**: depois da fusão é obrigatório garantir que o comportamento externamente observável das duas plataformas (scrollback preservado, entrada, IME, resize, tema, mensagem de saída) fique alinhado um a um com o de antes da refatoração. Recomenda-se que o commit da refatoração vire um MR isolado, sem nenhuma mudança de comportamento embutida.

### 8.7 O que motivou este design

Em 2026-08-12, ao auditar as diferenças entre o caminho persistentKey e o caminho original, foram encontradas 3 divergências (8.2). O usuário julgou que se trata de um **defeito de design** (ramos duplicados) e pediu primeiro consolidar o design, refatorando depois; por enquanto apenas as divergências encontradas foram alinhadas uma a uma. Esta seção é o produto dessa consolidação.