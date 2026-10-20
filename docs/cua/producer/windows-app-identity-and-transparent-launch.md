# Identidade de aplicativo no Windows e inicialização transparente

## Status

Documento de fatos atuais + spec de implementação. Substitui `docs/open-application-activation-contract.md` (a ativação não é mais uma capacidade de superfície de ferramenta independente; a semântica é absorvida por `get_app_state`).

Objetivo: **remover a ferramenta `open_application`**, fazendo com que `get_app_state(app_ref={name})` seja autossuficiente no Windows — consegue encontrar pelo nome do aplicativo um app já em execução; se não encontrar, primeiro o inicia, e quando precisar de pixels e a janela não estiver visível, a torna visível. Redução líquida de uma ferramenta na superfície, sem nenhuma ferramenta ou parâmetro novo.

Declaração de escopo: este documento não cobre Linux (o cua atualmente não precisa suportar Linux). No macOS, `open_application` já foi removida da superfície de ferramentas em 2026-09-11; esta é a mesma retração levada ao Windows, somada à capacidade de inicialização que faltava no Windows.

---

## 1. Situação atual (medição em máquina real, 2026-09-14, Windows 11 26200)

Todas as conclusões são medições na máquina local, não inferências de leitura estática.

### 1.1 Windows segue um caminho de código independente

`selectPlatformAxSource` (`src/broker/server/platformAxSource.ts:109`) usa `createAxWinReadOnlySource` (`src/native/win.ts`, 413 linhas) no branch win32, **sem passar por `nativeAxSource.ts`**. Portanto, o fluxo de controle de inicialização transparente do macOS (`nativeAxSource.ts:1676-1751`) nunca é executado no Windows.

| Capacidade | macOS | Windows |
| --- | --- | --- |
| Implementação de `captureApp` | `nativeAxSource.ts` | `src/native/win.ts` |
| Inicialização transparente em segundo plano | Sim (`openApplicationInBackgroundAsync`, `ax_macos.mm:8883`) | **Sem exportação** |
| Nome → identidade canônica | `resolveApplicationBundleId` (LaunchServices, `macosApplicationResolver.ts:106`) | Apenas uma tabela com 5 entradas hardcoded (abaixo, em 1.2) |
| Aguardar a árvore AX estabilizar após a inicialização | `settleFreshlyLaunchedTree` | **Não** |
| `window_id` participa do capture | Sim | Sim (`win.ts:313`, e valida que o `window_id` devolvido é consistente) |

### 1.2 "Iniciar pelo nome" hoje é apenas uma tabela de aliases da calculadora

`windowsSystemSurface.ts:34`:

```ts
const WINDOWS_PACKAGED_APP_ALIASES = new Map<string, string>([
  ["calculator", CALC], ["windows calculator", CALC],
  ["calc", CALC], ["calc.exe", CALC], ["计算器", CALC],
]);
```

Nomes fora da tabela caem em `openRunner([name])` → `spawn("记事本")` → ENOENT → `open_application failed: could not launch "记事本"`.
**`{name:"计算器"}` funcionar não é projeto, é o fato de ela estar por acaso nessa tabela.**

### 1.3 `app.name` é o título da janela, não o nome do aplicativo

`BuildAppInfoFromHwnd` (`ax_win.cc:1294`) preenche `name` com `WindowTitleW(hwnd)`. Medido com `listApplications()`:

```
{"pid":2888, "name":"无标题 - Notepad",   "bundle_id":"...\\Notepad.exe",              "aumid":null}
{"pid":28932,"name":"◐ agent-cli",        "bundle_id":"...\\WindowsTerminal.exe",      "aumid":null}
{"pid":13036,"name":"agent-cli changelog - agent-cli Docs - Google Chrome", ...}
```

`win.ts:118 windowsNameMatches` é uma correspondência de **substring sem distinção de maiúsculas/minúsculas**. Três comportamentos concretos:

| `app_ref.name` | Resultado | Motivo |
| --- | --- | --- |
| `"计算器"` | ✅ Acerto | O título da janela da calculadora é exatamente igual ao nome do aplicativo |
| `"记事本"` | ❌ `capture_app: could not be resolved` | O título é `无标题 - Notepad`, que não contém "记事本" |
| `"设置"` | ⚠️ Escolhe errado em silêncio | Atinge dois registros ao mesmo tempo (ver 1.4); `win.ts:188` pega `active` ou o primeiro, **sem lançar erro de ambiguidade** |

A própria semântica de substring também é perigosa: `{name:"cli"}` acerta a janela de terminal `◐ agent-cli`.

### 1.4 Um aplicativo UWP produz dois registros, e ambos são cloaked

Medição real com "设置":

```
applicationInfo(348)   name=设置 bundle_id=...\SystemSettings.exe        aumid=null
  listWindows(348)     window_id=198526  bounds=[0,1,938,701]
applicationInfo(14556) name=设置 bundle_id=...\ApplicationFrameHost.exe  aumid=windows.immersivecontrolpanel_...
  listWindows(14556)   window_id=722794  bounds=[88,77,956,711]
applicationInfoByAumid(设置).pid = 14556
```

Medido no DWM, os dois HWND têm `cloaked=2` (DWM_CLOAKED_SHELL, estado suspenso), `visible=True`, `iconic=False`.

- `EnumerateUserHwndsForPid` (`ax_win.cc:2223`, via `listWindows`) **não filtra cloaked**; `screenCaptureProbeWindows` (`ax_win.cc:2267`) filtra. Os dois critérios não coincidem.
- `PickPrimaryHwndForPid` (`ax_win.cc:929-952`) toma "a janela não minimizada de maior área" — janelas cloaked não são iconic, então também entram na disputa. Logo, quando o pid do host é compartilhado, **qual identidade é reportada depende da geometria das janelas naquele instante**. Evidência medida: o mesmo pid 14556 reportou "计算器" numa sessão e "设置" na seguinte (a calculadora havia sido encerrada).

### 1.5 Assimetria entre "iniciar" e "vincular" no canal AUMID

O comentário em `ax_win.cc:2185` diz que "o broker ainda deve usar `applicationInfoByAumid` para completar o vínculo final de identidade a partir das propriedades do HWND". Medido, essa frase está errada para apps desktop **empacotados**:

```
applicationInfoByAumid(Microsoft.WindowsNotepad_...!App)  => null   （记事本正在运行）
applicationInfoByAumid(windows.immersivecontrolpanel_...) => pid 14556  ✅

activateApplicationByAumid(Microsoft.Paint_...!App) => pid 1936
  FOREGROUND_CHANGED = false                       ← 冷启动未抢焦点
  applicationInfoByAumid(Microsoft.Paint_...!App)  => null
  applicationInfo(1936)  => name="无标题 - 画图" bundle_id=...\mspaint.exe
  listWindows(1936)      => [{window_id:1313674, focused:false}]
```

Causa raiz: `PKEY_AppUserModel_ID` só existe em janelas UWP hospedadas por `ApplicationFrameHost`. O novo Bloco de Notas e o novo Paint são apps desktop empacotados, e suas jananas não têm essa propriedade.

**Conclusão: o vínculo deve priorizar o pid e usar o AUMID como fallback**, cada um cobrindo metade:

| Forma do aplicativo | pid devolvido na ativação | O pid tem janela visível | Vínculo por AUMID | A adotar |
| --- | --- | --- | --- | --- |
| Desktop empacotado (Paint/Bloco de Notas) | O próprio app | ✅ | ❌ null | **pid** |
| UWP (Configurações/Calculadora) | Processo real (como 348) | Janela cloaked / frame não visual | ✅ pid do host | **AUMID** |

### 1.6 Registro de aplicativos instalados: `shell:AppsFolder`

Medido: 134 entradas, com `Name` + `System.AppUserModel.ID` + `System.Link.TargetParsingPath` completos:

```
计算器        aumid=Microsoft.WindowsCalculator_8wekyb3d8bbwe!App    target=(无)
Google Chrome aumid=Chrome                target=C:\Program Files\Google\Chrome\Application\chrome.exe
微信          aumid=D:\Weixin\Weixin.exe  target=D:\Weixin\Weixin.exe
CC Switch     aumid=com.ccswitch.desktop  target=...\cc-switch.exe
```

`IsValidAppUserModelId` (`ax_win.cc:821`) exige **exatamente um `!`**, então `Chrome` / `com.ccswitch.desktop` / `Microsoft.AutoGenerated.{GUID}` são todos rejeitados pelo canal AUMID atual — hoje só 38 de 134 são alcançáveis.

Classificando por "AUMID válido ou alvo `.exe`":

| Classificação | Quantidade | Forma de inicialização |
| --- | --- | --- |
| AUMID válido | 38 | `ActivateApplication(AO_NONE)` |
| Alvo `.exe` | 75 | `CreateProcess(target)` |
| Não inicializável (`.url` / `.msc` / `.html` / CLSID do shell) | 21 | Rejeitar |

**113/134 (84%) são inicializáveis**; as 21 rejeitadas são todas links de documentos, consoles de gerenciamento e itens de namespace do shell — que não deveriam ser tratados como aplicativos de qualquer forma.

Custo da enumeração (automação COM via PowerShell, incluindo duas leituras de propriedade por entrada; nativamente é mais rápido): 386 / 281 / 280 ms.

### 1.7 Semântica de foco: dois caminhos diferentes, e o Win32 não dá para impedir

| Caminho | Medido | Observações |
| --- | --- | --- |
| `ActivateApplication(AO_NONE)` | **Não rouba foco** (duas medições independentes, incluindo cold start) | Equivalente a `activates=NO` do macOS |
| `CreateProcess` / `spawn` | **Rouba foco** (`FOREGROUND_CHANGED=true`, nova janela `focused:true`) | |
| `CreateProcess` + `STARTF_USESHOWWINDOW` + `SW_SHOWNOACTIVATE` | **Ainda rouba foco** | O próprio charmap chama `SetForegroundWindow`; nCmdShow é apenas uma dica |
| `ShowWindow(SW_SHOWNOACTIVATE)` para desfazer a minimização | **Rouba foco** (`focused=true`, foreground 32324→25792) | Restaurar uma janela minimizada não permite evitar a transferência de foco |
| `PreventActivation` / `IsFocusStealPrevented` | Honest no-op (`ax_win.cc:3345-3357`, "Windows has no equivalent") | Não há mecanismo de supressão disponível |

**Decisão: aceitar que o branch Win32 rouba o foco.** Não tentar mais suprimir. A descrição da ferramenta deve informar isso com honestidade; não pode afirmar "inicialização em segundo plano".

### 1.8 Matriz de capacidade de observação: desempenho medido de `get_app_state` nos quatro estados do alvo

"Observar precisa de ativação?" não é uma pergunta de sim/não — entre os quatro estados, dois precisam, e o custo dos dois é completamente diferente.

| Estado do alvo | Árvore UIA | Captura de tela da janela | O que é preciso | Custo de foco |
| --- | --- | --- | --- | --- |
| Não está em execução | — | — | Iniciar | Empacotado **não rouba**; Win32 **rouba** |
| Em execução, janela normal (pode estar encoberta por outras janelas) | ✅ 229 elementos | ✅ 112.795 B | **Nada** | — |
| Em execução, UWP suspenso (`cloaked=2`) | ❌ **Apenas 1 elemento** | Quadro residual 20.478 B | `ActivateApplication(AUMID)` | **Não rouba** |
| Em execução, minimizado (`iconic=True`) | ✅ Completa | ❌ `invalid_target` | Desfazer minimização | **Rouba de forma inevitável** |

Medições-chave:

```
# 后台拉起、从未获得焦点的窗口 —— 观察完全正常
listWindows → focused:false ; captureApp → 229 元素 ; PNG → 112,795 B ; 焦点全程未动

# 挂起的 UWP 被 AUMID 唤醒（无焦点代价）
激活前: cloaked=2 focused=false elements=1
激活后: cloaked=0 focused=false elements=129   FOREGROUND_STOLEN=false

# 最小化窗口：树完好，UIA 写入仍生效
最小化后 elements=61（与最小化前一致，element ref 稳定）
setValue(最小化中) = {"ok":true} ; readElement.value = "minimized-uia-write-ok"
```

**Portanto, Windows.Graphics.Capture não exige foreground e não é afetado por oclusão** — `ValidateWindowTarget` (`screen_capture_win.cc:267-269`) só rejeita `IsIconic || !IsWindowVisible`, sem critério de foreground.

### 1.9 Defeito: hoje um aplicativo minimizado é completamente inobservável

`win.ts:370-377` promove o `invalid_target` da captura a um erro geral:

```
capture_app: the verified Windows capture target is unavailable (invalid_target);
re-observe before acting.
```

Assim, o `get_app_state` de um aplicativo minimizado **falha por completo**, embora sua árvore UIA esteja intacta e seja gravável. E essa mensagem para o modelo nunca leva a lugar nenhum: observar de novo dá exatamente o mesmo resultado. Hoje a única saída é `open_application(activate=true)` — em `ActivateApplication(pid)` (`ax_win.cc:3228`) há `if (IsIconic(target)) ShowWindow(target, SW_RESTORE); SetForegroundWindow(target);`.

A correção proposta nesta spec não é "degradação" nem "nova ferramenta", e sim fazer o caminho de observação **realizar as ações mínimas necessárias para completar a observação solicitada** (2.2): se a árvore basta, não mexe na janela; só a restaura quando o modelo pede explicitamente pixels. Isso é o mesmo princípio que já governa esse mesmo caminho ao iniciar aplicativos que não estão em execução.

Atenção: `ActivateApplication(AUMID)` **não** restaura janelas minimizadas (medido: após reativar, `iconic` continua True e a captura segue com `invalid_target`) — ele só levanta a suspensão do UWP. As duas coisas precisam ser tratadas separadamente.

### 1.10 A entrada raw já traz a ativação embutida

`activateConcreteWindow` (`electronInputHandlers.ts:951-979`) chama `adapter.activateWindow(pid, bundleId, windowId)` antes de despachar entrada raw em nível de janela, completando atomicamente raise + focus + activate + verify; em caso de falha, `action_sent=false` com fail-closed.

Portanto, "remover a ativação inviabilizaria o uso de teclado e mouse raw no Windows" não se sustenta — **a própria entrada raw traz a janela alvo para o primeiro plano**. Somado a isso, ações em elementos UIA não precisam de foreground (medido em 1.8: `setValue` em janela minimizada continua `ok:true`), o único cenário que de fato falta na superfície do modelo é: **precisar dos pixels de uma janela que o modelo não consegue ver**.

Toda a cadeia `activateWindow(pid, expectedCanonicalBundleId, windowId)` já existe: exportada em `ax_win.cc:3258` → envolvida em `nodeAutomationAdapter.ts:238` → tipada em `electronNativeBackendTypes.ts:380`. O que falta é apenas uma ferramenta visível ao modelo.

---

## 2. Design

### 2.1 Novidades nativas (`src/native/ax_win.cc`)

O `shobjidl.h` / `propsys.h` / `propkey.h` já linkados são suficientes; **esta parte não precisa de WinRT** (o próprio WinRT já está na build — `screen_capture_win.cc` usa `Windows.Graphics.Capture`; apenas o AppsFolder não aproveita); o nome resolvido de `shell:AppsFolder` já foi usado em `ApplicationIconPngForPid` (`ax_win.cc:3056`).

```ts
// 已安装应用清单。来源 shell:AppsFolder，读 PKEY_ItemNameDisplay +
// PKEY_AppUserModel_ID + PKEY_Link_TargetParsingPath。
listInstalledApplications(): {
  name: string;
  aumid: string | null;        // 仅当通过 IsValidAppUserModelId 时非 null
  target_path: string | null;  // 仅当以 .exe 结尾时非 null
}[]

// 按身份拉起。aumid 非空走 ActivateApplication(AO_NONE)（不抢焦点）；
// 否则 CreateProcess(target_path)（会抢焦点，见 1.7）。返回 pid 或 null。
launchApplicationAsync(aumid: string | null, targetPath: string | null): Promise<number | null>
```

`BuildAppInfoFromHwnd` (`ax_win.cc:1293`) passa a preencher `window_id`: o HWND já está em mãos, e a conversão pode ser copiada de `BuildWindowFromHwnd` (`ax_win.cc:1328`). Assim, a identidade reportada por `listApplications` / `applicationInfo` carrega "de qual janela ela foi lida", e `captureApp` não precisa reexecutar por conta própria a heurística de área.

`PickPrimaryHwndForPid` passa a excluir janelas cloaked — alinhando o critério com `screenCaptureProbeWindows`. Razão: uma janela cloaked não tem pixels na tela; escolhê-la como janela principal equivale a entregar ao modelo uma árvore que ele não vê nem consegue clicar. `listWindows` mantém as janelas cloaked, mas cada uma ganha `cloaked: boolean` (o chamador precisa saber que a janela existe, mas está suspensa).

`listApplications` passa a produzir resultados **por identidade** e não por pid: quando um pid hospeda múltiplos AUMID distintos, produz múltiplas entradas. A avaliação de risco foi reduzida — o `resolvePid` de Windows em `src/native/win.ts:188`, em caso de múltiplos acertos, pega `active` ou o primeiro e **não lança erro de ambiguidade**, de modo que pids duplicados são toleráveis (o que lança erro de ambiguidade é `nativeAxSource.ts:1374`, no macOS, fora deste caminho). A fatia de 128 entradas é mantida.

### 2.2 JS (`src/native/win.ts`)

`resolvePid` → `resolveTarget(appRef): { pid: number; windowId?: number } | null`, com a resolução de nome em duas camadas:

1. **Correspondência exata com o nome do aplicativo instalado** (sem distinção de maiúsculas/minúsculas, autoritativa) → obtém `{aumid, target_path}` e, a partir disso, procura o processo vivo:
   - `aumid` válido → `applicationInfoByAumid(aumid)` → pid + window_id
   - caso contrário → em `listApplications()`, casa por `bundle_id === target_path`
2. **Correspondência por substring no título da janela** (mantém a semântica de hoje, preservando usos já existentes como `{name:"Notepad"}`)
3. Ambas as camadas vazias, mas a camada 1 encontrou o aplicativo instalado → entrar na inicialização
4. Múltiplos acertos na camada 2 → **lançar erro de ambiguidade listando os candidatos** (alinhado ao macOS, substituindo a escolha silenciosa de hoje)

Os passos prévios de `captureApp` passam de "sem processo, então iniciar" para **"tornar o alvo observável"**, cobrindo os três estados anormais de 1.8:

```
resolveTarget(appRef)
  ├─ null（没有活进程）
  │    → listInstalledApplications() 精确匹配 name
  │        命中 → launchApplicationAsync(aumid, target_path)
  │                 → 绑定：pid 有非 cloaked 窗口 ? 用 pid
  │                        : aumid ? applicationInfoByAumid(aumid)
  │                        : 按 target_path 在活进程里重解
  │                 → settleFreshlyLaunchedTree（移植 macOS 版本，见下）
  │        未命中 → 抛错，文案只给真能走的路
  │
  ├─ 命中但主窗口 cloaked（UWP 挂起）且有 aumid
  │    → activateApplicationByAumid(aumid) 唤醒 → 重读
  │      免费：实测不抢焦点，树从 1 元素长到 129
  │
  └─ 命中但主窗口 iconic（最小化）
       ├─ include_screenshot=false（默认）→ 什么都不做，返回完整树
       └─ include_screenshot=true         → 恢复窗口（会抢焦点）后再截图
```

O último item é o único lugar em que esta spec mantém a "ativação", e ele não exige ferramenta nova nem parâmetro novo: **`include_screenshot` é o interruptor de foco**.

`include_screenshot` é um parâmetro já existente, visível ao modelo, com `default(false)` (`schemas/observation.ts:45`); a descrição da ferramenta já diz "só defina true quando precisar de algo visual". Portanto, o fato de "o modelo pedir pixels explicitamente" já tem forma de expressão, e uma janela minimizada é **fisicamente** incapaz de produzir pixels sem ser restaurada (`ValidateWindowTarget` rejeita `IsIconic`, `screen_capture_win.cc:268`). Assim, a condição de disparo é precisa e autossuficiente:

| Situação | Mexe na janela? | Custo de foco |
| --- | --- | --- |
| Janela normal (inclusive totalmente encoberta) | Não | Nenhum |
| Janela iconic, `include_screenshot=false` | Não, devolve só a árvore | Nenhum |
| Janela iconic, `include_screenshot=true` | Restaura | **Sim** |
| UWP suspenso (cloaked) | Desperta via AUMID | Nenhum |

Ou seja, **o caminho padrão nunca rouba o foco**; o foco só é roubado quando o modelo diz explicitamente "quero ver a tela" e essa tela de fato não pode ser obtida.

Isso resolve de passagem o defeito de 1.9: `invalid_target` deixa de lançar erro quando a janela está iconic — ou a restauração já teve sucesso, ou segue o caminho de árvore pura de `include_screenshot=false`. Os demais `invalid_target` / `target_changed` (a janela realmente mudou ou sumiu) mantêm intacta a semântica de erro, pois isso é deriva de identidade e precisa ser fail-closed.

A ação de restauração deve deixar log no lado do broker (alinhada ao `[cua-captureapp-launch]` já existente, adicionando `[cua-captureapp-restore]`): é uma mudança de desktop visível ao usuário e precisa ser rastreável. A superfície do modelo **não ganha** nenhum campo de saída novo — o próprio sucesso da captura já indica que a janela foi tornada visível, e o comportamento fica escrito na descrição da ferramenta.

`settleFreshlyLaunchedTree` precisa ser portado. A causa raiz observada no macOS (`nativeAxSource.ts:1731`) vale igualmente para o Windows: a árvore AX de um app recém-iniciado ainda está crescendo, e o índice de elemento que o modelo anotou na primeira célula aponta para outro nó na célula seguinte. Medido: a janela do Paint leva cerca de 3,5 s para aparecer após a ativação.

O caso em que o pid do inicializador é diferente do pid da GUI segue o mecanismo já existente: `processExecutablePath(launcherPid)` obtém o caminho canônico e a resolução é refeita entre os processos vivos (`electronNativeBackend.ts:1683-1700` já tem essa lógica, a ser transferida para win.ts).

O resultado da enumeração de `AppsFolder` é cacheado durante o ciclo de vida do Helper; **quando o nome não for encontrado, reenumerar uma vez antes de declarar falha**, para que aplicativos recém-instalados não exijam reiniciar o Helper.

### 2.3 Superfície de ferramentas: remoção de `open_application`

A própria ferramenta desaparece; não é uma retração de plataforma. Em cascata, são removidos:

| Objeto removido | Local |
| --- | --- |
| Definição da ferramenta (~183 linhas) | `src/tools/observation.ts:1038-1220` |
| Registro / tier / política / mapeamento legacy | `manifest.ts:138`, `tier-table.ts`, `action-policy.ts`, `legacyToolMap.ts:26` |
| Schema de entrada | `src/tools/schemas/openApplicationAppArg.ts`, `schemas/index.ts`, `schemas/jsonSchemas.ts` |
| Método e handler do broker | O nome do método em `broker/types.ts`, as duas exceções em `broker-client.ts`, o handler em `electronNativeBackend.ts` (688 linhas) + os helpers que servem apenas a ele (`resolveAppByPid` / `rollbackFreshApplication` / `discoverFreshApplicationForRollback` / `settleActivatedAppByPid` / `positiveWindowId` / `activateMacFilePanelSurface`, 378 linhas no total) + a flag de capacidade `broker_info` |
| Mecânica de inicialização no Windows | `openApplication` em `windowsSystemSurface.ts`, a tabela de aliases da calculadora, todo o conjunto `openRunner` / `WindowsAumidActivator` (173 → 44 linhas); junto, as opções `windowsOpenRunner` / `windowsActivateApplicationByAumid` de `nodeSystemSurface` e os pontos de injeção em `helperMain` / `windowsDevHelperMain` |
| Mecanismo de retração de plataforma (vira código morto quando esvazia) | `src/tools/platform-surface.ts` inteiro + `tools/index.ts:61-62`, `manifest.ts:241-242`, `computer-use-runtime.ts:111-167` |
| Documento de contrato de ativação | `docs/open-application-activation-contract.md` (a ativação deixa de ser um contrato independente; a semântica é absorvida por `get_app_state`) |
| Branch de rejeição de `prevent_activation` | `electronNativeBackend.ts:1386-1389`. Ele protege a solicitação explícita de ativação pelo modelo, e essa solicitação deixa de existir; além disso, essa trava nunca tem efeito no Windows (`IsFocusStealPrevented()` está hardcoded como false, `ax_win.cc:3353`), então mantê-la seria código morto |

**Uma spec errou; corrigida pelos fatos**: `adapter.openApplication` (a capacidade de inicialização da camada de adaptador) **deve ser mantida**.
`reopenWindowlessApp` (exclusivo de darwin) a usa dentro de `capture_app` para reabrir apps sem janela do macOS — é exatamente o precedente já existente de "o caminho de observação realiza as ações mínimas necessárias para completar a observação". Portanto, o que se remove é a **ferramenta** e o **método do broker**, não essa capacidade. `NodeSystemSurface.openApplication` passa a ser **opcional**: o macOS a implementa, o Windows deixa de implementá-la (a inicialização no Windows passa pelo `launchApplicationAsync` nativo, e o caminho inteiro fica no `captureApp` de `src/native/win.ts`, sem passar pela superfície de sistema), e `nodeAutomationAdapter` a expõe condicionalmente conforme a presença da capacidade na superfície de sistema.
`settleApplicationWindow` e `hasOnscreenWindow` seguem mantidos pelo mesmo motivo — têm chamadores fora do handler.

**A ativação deixa de ser uma capacidade e passa a ser a ação mínima que `get_app_state` executa para completar a observação.** Quebrando "ativação" em partes, cada uma tem seu lugar:

| Capacidade | Pertence a | Custo de foco |
| --- | --- | --- |
| Despertar UWP suspenso | Automático dentro de `get_app_state` (2.2) | **Nenhum** |
| Trazer para o primeiro plano (para a entrada raw) | Feito pela própria entrada raw no despacho (1.10 `activateConcreteWindow`) | Sim, mas já é a semântica existente da entrada raw |
| Restaurar janela minimizada (para obter pixels) | `get_app_state` + `include_screenshot=true` (2.2) | Sim, disparado explicitamente pelo modelo |

Nenhuma das três exige uma ferramenta independente. Já foi considerada a adição de uma ferramenta estreita `activate_window`, mas ela foi rejeitada: teria um único cenário de uso (obter os pixels de uma janela invisível), e esse cenário já é responsabilidade do próprio `get_app_state`; adicionar mais uma ferramenta não reduz o que o modelo precisa entender, apenas troca `open_application` de nome.

`file-url-window-verification` (`src/lib/`) perde seus chamadores junto com o parâmetro `urls` (só é referenciado em `electronNativeBackend.ts:63` e `observation.ts:63`) e é removido junto.

### 2.4 Mudanças no contrato da superfície do modelo

A semântica de `app_ref.name` passa de "substring do título da janela" para "nome de exibição do aplicativo instalado (exato) ou título da janela (substring)"; a descrição precisa ser reescrita.

A descrição de `window_id` **permanece intacta** (hoje diz que é exclusiva do painel de arquivamento do macOS e que não se deve adivinhar valores de placeholder como 1) — toda a resolução de janelas fica dentro do broker, e o modelo não precisa nem deve fornecê-la para a observação no Windows.

A descrição de `get_app_state` precisa declarar com honestidade três coisas: quando o alvo não está em execução, ele será iniciado (empacotado em segundo plano; os demais obtêm o foco em primeiro plano); quando o alvo está suspenso, ele será despertado (sem custo de foco); quando o alvo está minimizado e `include_screenshot=true`, **a janela será restaurada e, por isso, o foco será obtido** — mantenha o padrão `include_screenshot=false` sempre que a árvore bastar, para não incomodar o usuário.

O total de ferramentas cai de 15 para 14 (`open_application` sai, nada entra). Os dois comentários "canonical 15-tool surface" e "Source: `tool_manifest.py`, verbatim" no `manifest.ts` precisam ser alterados — desta vez há um fork intencional em relação ao manifest Python upstream, e não alterá-los seria mentir. `APP_ASSOCIATION_MODE_BY_TOOL` também remove a entrada correspondente (o drift gate força essa etapa).

Portanto, **não há nada de novo para o modelo aprender na superfície de ferramentas**: nenhum parâmetro de `get_app_state` mudou; o comportamento passa a ser "fazer as ações mínimas necessárias para te entregar o que você pediu".

---

## 3. Plano de testes (testes primeiro)

Novos:

- `test/native/windows-installed-app-resolution.test.ts` — classificação dos três formatos de AppID, rejeição de `.url`/`.msc`, correspondência exata de nome com precedência sobre substring de título, uma reenumeração após um miss.
- `test/native/windows-transparent-launch.test.ts` — cadeia completa não-em-execução → iniciar → vincular → settle; empacotados usam vínculo por pid, UWP usa AUMID como fallback (fixa linha a linha as duas linhas da tabela de 1.5); re-resolução quando o pid do inicializador é diferente do pid da GUI.
- `test/native/windows-name-ambiguity.test.ts` — múltiplos acertos por substring de título lançam erro de ambiguidade e listam os candidatos (substituindo a escolha silenciosa).
- `test/native/windows-observability-states.test.ts` — fixa linha a linha a matriz de quatro estados de 1.8: janela normal (inclusive totalmente encoberta) produz árvore e pixels sem nenhuma ativação; cloaked → desperta via AUMID e relê; iconic + `include_screenshot=false` → devolve só a árvore e **não mexe na janela**; iconic + `include_screenshot=true` → restaura e a captura tem sucesso; `invalid_target` / `target_changed` **continuam lançando erro** quando a janela realmente some ou deriva.
- cloaked: `PickPrimaryHwndForPid` não escolhe janelas cloaked; `listWindows` continua reportando-as, mas com `cloaked:true`.
- O caminho de inicialização precisa rejeitar desinstaladores (nome ou caminho de alvo contendo `uninstall` / `卸载`).

Reescritos / removidos (~3.200 linhas):

| Arquivo | Linhas | Tratamento |
| --- | --- | --- |
| `test/windows-open-application-identity.test.ts` | 771 | Remover; as asserções de semântica de identidade migram para o novo conjunto transparent-launch |
| `test/open-application-new-instance.test.ts` | 584 | Remover (`new_instance` desaparece junto com a ferramenta) |
| `test/open-application-identity-conjunction.test.ts` | 474 | Remover |
| `test/open-application-args.test.ts` | 423 | Remover |
| `test/open-application-error-taxonomy.test.ts` | 268 | Remover; as asserções de taxonomia de erro migram para `get_app_state` |
| `test/broker/windowsSystemSurface.test.ts` | 201 | Enxugar (remover openApplication e a tabela de aliases) |
| `test/get-app-state-transparent-launch.test.ts` | 205 | Ampliar: adicionar o branch de Windows |
| `test/native/windows-app-ref-resolution.test.ts` | 278 | Reescrever `resolveTarget` |
| `test/tool-platform-surface.test.ts` | 47 | Remover (`open_application` é a única entrada; o mecanismo vira código morto) |
| `test/resolve-opened-app-active-settle.test.ts` | 237 | Remover (`settleActivatedAppByPid` é removido junto; a ativação nativa já traz o laço de verificação de foreground) |
| `test/manifest.test.ts` / `tier-table` / `schemas-*` / `skill-tool-signatures` / `tool-return-shape.parity` | — | Sincronizar a contagem de ferramentas e as assinaturas (15 → 14) |

E2E: `docs/cua-act-verify-windows-scenarios.md` precisa de um caso de "iniciar a frio e observar pelo nome do aplicativo em chinês" (hoje `{name:"记事本"}` falha com certeza).

---

## 4. Fases

| Fase | Conteúdo | Verificável isoladamente |
| --- | --- | --- |
| A | Nativo: `listInstalledApplications` + `launchApplicationAsync` + `window_id` + critério de cloaked | ✅ Apenas novas exportações, sem alterar comportamento existente |
| B | `win.ts`: `resolveTarget` + inicialização transparente + restauração de iconic + settle + erro de ambiguidade | ✅ `get_app_state({name})` ponta a ponta |
| C | Remover toda a superfície de `open_application` + mecanismo de retração de plataforma + documento de contrato | ✅ Remoção líquida |

C depende de B (primeiro a capacidade substituta, depois remover a ferramenta antiga); B depende de A. A restauração de iconic em B não envolve código nativo novo — `activateWindow` / `activateApplication` já existem e ambas contêm `IsIconic → SW_RESTORE` (`ax_win.cc:3300` / `3228`).

---

## 5. Itens não verificados e riscos

- O roubo de foco na inicialização via Win32 só foi testado no charmap (n=1). Aplicativos diferentes respeitam `nCmdShow` em graus diferentes, e é possível que algum aplicativo de fato não roube o foco. **Isso não muda o design** (já aceitamos o roubo de foco), apenas afeta o rigor do texto.
- `launchApplicationAsync` não foi projetado para alvos `.exe` com argumentos (o `TargetParsingPath` do AppsFolder não contém argumentos de atalho). Aplicativos iniciados com argumentos podem se comportar de forma diferente.
- As 134 entradas de `listInstalledApplications` incluem desinstaladores ("卸载微信"). A correspondência exata de nome ajuda, mas se o modelo realmente passar esse nome, o desinstalador será executado. **É preciso rejeitar explicitamente na camada de resolução**: iniciar não é permitido quando o nome ou o caminho de alvo casa com `uninstall` / `卸载`. Esta é a única nova superfície de perigo deste design e precisa de teste.
- O custo da enumeração do AppsFolder em máquinas com muitos aplicativos não foi medido (aqui: 134 entradas / 280 ms).
- Depois que `listApplications` passar a produzir por identidade, a fatia de 128 entradas pode ser atingida com mais facilidade.
- A eficácia de `setValue` em janela minimizada foi medida, mas na mesma rodada o foreground de fato mudou (a própria minimização entrega o foreground à próxima janela; se `setValue` rouba foco adicionalmente não é possível separar a partir dessa medição n=1). Isso não afeta o design de 2.2, mas a frase "operar um aplicativo minimizado é totalmente livre de efeitos colaterais" não pode entrar no texto da superfície do modelo.
- ~~O fluxo ponta a ponta "restaurar minimizado → captura com sucesso" disparado por `include_screenshot=true` não passou por verificação em máquina real~~ — a fase B já cobriu: após minimizar o charmap, `screenshot=false` devolve 27 elementos e a janela permanece minimizada, com o foco intacto; `screenshot=true` restaura a janela e devolve uma captura de 38.140 B (o foco foi roubado, já aceito).
- Esse efeito colateral de restauração da janela não tem campo de saída próprio na superfície do modelo, apenas o sinal indireto de uma captura bem-sucedida + log do broker. É uma escolha deliberada para não ampliar a superfície de ferramentas; caso se descubra no futuro que o modelo passa a inferir mal o estado do desktop do usuário por causa disso, considera-se adicionar um campo no payload de observação.
- **Assimetria conhecida (escolha de implementação da fase B)**: a camada de "nome de exibição do aplicativo instalado" exige uma enumeração assíncrona e participa apenas do `captureApp`; `list_windows` / `application_info` continuam com apenas a camada de substring do título da janela. Assim, `list_windows({name:"记事本"})` ainda não resolve, mas `get_app_state({name:"记事本"})` resolve. Não há fallback (a implementação antiga não resolvia nenhum dos dois), mas os critérios ficam desalinhados — para nivelar seria preciso mudar `AxReadOnlySource.listWindows` para assíncrono, o que é uma mudança de contrato do broker em todas as plataformas e está fora do escopo desta spec.
- **`cloaked` / `minimized` não chegam à superfície do modelo**: são fatos nativos, e `adaptSnapshot` não os carrega ao mapear para o `AxRawWindow` do broker. O modelo, portanto, não consegue inferir de `list_windows` que uma janela "existe mas não tem pixels". Para incluir isso seria preciso mexer em `AxRawWindow` (contrato entre plataformas), o que esta fase não faz.
- Com addons antigos (que não reportam `window_id`), todo o bloco de verificação do estado da janela é pulado: `makeObservable`, ao não conseguir `window_id`, não adivinha e deixa a escolha da janela para o `PickPrimaryHwndForPid` nativo (que é mais confiável do que o primeiro do z-order do EnumWindows em `listWindows` — é justamente desse último que vem o problema da janela auxiliar 136x39 do shell citado no comentário dele). O custo é que, nesse tipo de addon, as duas saídas de resgate (cloaked / minimized) não funcionam — é a semântica de degradação já existente do ABI aditivo.

- **O eval harness não foi atualizado junto com esta remoção (trabalho posterior)**: 16 arquivos em `evals/zcode-gui-eval/src/evaluators/`, com cerca de 104 referências a `open_application`, dos quais `cua-open-application-tasks.mjs` e `zcode-agent-open-application-tasks.mjs` foram escritos inteiramente para ele. O drift mirror entre repositórios (`evals/zcode-gui-eval/tool-manifest.json`) já foi sincronizado, `zge validate --all --definition-only` continua com 37 aprovações / 0 falhas e o gate visível no CI está verde; a quebra só apareceria na lane de máquina real macOS. **Esses casos já estavam invalidados antes desta remoção**: são condicionados por `process.platform !== "darwin"` e só rodam no macOS, e a superfície mac já excluiu `open_application` em 2026-09-11. Arrumá-lo exige uma máquina real macOS e não pode ser verificado no Windows — mexer às cegas em um harness que não roda é pior do que deixá-lo como está.
- `test/macos-background-application-open.test.ts` é **podado** e não removido: 15 casos exercitam o método de broker removido, e outros 3 exercitam diretamente `adapter.openApplication` (cobertura de ABI completion-backed da capacidade mantida) — estes últimos ficam.
- O limite de 14 KB do SKILL.md (orçamento de pré-carregamento residente) está quase estourado: com as duas exceções de foco do Windows são 14.322 / 14.336. Para abrir espaço, uma frase antiga que duplicava o novo parágrafo foi comprimida. Antes de adicionar mais coisa ao SKILL, meça o tamanho. (Atualização de 2026-09-16: após o rebase para `dbae0665`, o próprio upstream comprimiu um pouco; agora são 14.275 / 14.336, com 61 bytes de folga.)

- **Limitação conhecida, e por decisão não corrigida: `list_apps` esconde inteiramente os aplicativos UWP atrás de um host compartilhado.** A causa é que `ListApplications` deduplica por pid (`seenPids.insert(pid)`), e todos os UWP compartilham o único pid do ApplicationFrameHost, de modo que apenas uma linha aparece, com o nome tirado do título da janela mais ao topo no z-order do EnumWindows. Medido em 2026-09-16: com a calculadora e as Configurações despertas ao mesmo tempo no pid 19076, `list_apps` ainda devolve 7 entradas, e a entrada do AFH se chama "计算器", enquanto **"设置" simplesmente não existe em `list_apps`**. Mesmo fenótipo: `application_info({pid})` reporta, no AFH, o nome e o AUMID da janela de maior área.

  O motivo de não corrigir não é "o impacto é pequeno", e sim que **a metade que poderia causar operação errada já está fail-closed**: `{pid:host}` não devolve mais silenciosamente a árvore de outro aplicativo, o despertar durante a observação também não ativa mais o AUMID errado, e o erro em questão entrega diretamente ao chamador a lista de janelas do host. O que resta é puramente **descoberta incompleta**. A correção de verdade seria fazer o host compartilhado produzir **entradas por janela** (cada uma com seu próprio `window_id` e identidade AUMID) em vez de uma entrada por pid, mas isso muda a forma pública do método central `list_apps`: muitos testes fixam a estrutura dele, e o modelo mental de "um aplicativo, um pid" de `app_ref.pid` também se afrouxaria; o ganho (integridade da descoberta) não compensa essa superfície de risco.

  As consequências concretas que ficam no lugar são apenas duas, e nenhuma causa operação errada: o modelo, ao ser perguntado sobre "quais aplicativos estão abertos", deixa de relatar o UWP que divide o host; e `application_info({pid})` reporta o nome do aplicativo errado no AFH. **Contorno**: vincular pelo nome do aplicativo (caminho principal, disponível), ou obter o `window_id` a partir do erro do host compartilhado.

- **A linha de base de falhas totais nunca passou por triage item a item, então "N = N" só serve como barreira de regressão, não como prova de saúde.** Este repositório tem há muito tempo cerca de 50 falhas no Windows, sempre resumidas como "os contratos de macOS / PiP necessariamente ficam vermelhos no Windows". Em 2026-09-16, ao investigar uma delas item a item, verificou-se que `test/windowsDevHelperMain.test.ts > runs the source Windows Helper against the real native addon` não era diferença de plataforma, e sim **um teste quebrado em dois pontos, que nunca passou**: primeiro, no `fork` não era passada a variável `ZCODE_CUA_DEV_MODE=1` (esse combination root do Helper de código-fonte faz uma autoverificação de primitivas de peer no ponto de carregamento do native, e o Windows ainda não tem isso — sem opt-in explícito ele necessariamente se recusa a iniciar, e o comportamento do produto está correto); segundo, o handshake de inicialização enviava `transport_ready` antes de `ready`, enquanto o teste usa `once()` e exige que a primeira mensagem seja `ready`. O custo é que o sinal "o Helper em modo dev consegue subir contra o addon real" sempre esteve vazio. Já corrigido (a linha de base foi de 52 → 51). **Implicação**: entre as 51 restantes ainda pode haver problemas reais; ao julgar regressões, "falhas novas = 0" é confiável, mas esse número não deve ser tomado como "todo o resto é diferença de plataforma".
