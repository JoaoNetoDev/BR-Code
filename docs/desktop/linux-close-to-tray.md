# Spec de close-to-tray (residência no tray ao fechar janela) no Linux

## Contexto e objetivo

O Windows já suporta "ocultar na bandeja e permanecer ao fechar a janela" (configuração
`closeToTrayOnWindows`, ligada por padrão). No Linux hoje fechar a janela significa sair via
"confirmar saída → `app.quit()`", o que contraria a intenção de produto do ZCode, um app de
background pensado para tarefas longas (evitar que um fechamento acidental interrompa a sessão do
agent).

O "fechar janela sem sair" do macOS depende do modelo de ciclo de vida de app em nível de sistema
(Dock permanente + indicador de execução), que o desktop Linux não tem; no Linux o único mecanismo
de residência com entrada visível é a bandeja do sistema (StatusNotifierItem). Portanto o Linux se
alinha ao **modo de bandeja do Windows**, e não ao modo do mac.

O suporte a bandeja nos ambientes de desktop Linux não é uniforme:

- KDE / XFCE fornecem nativamente um host de StatusNotifierItem
- Desde o GNOME 3.26 a bandeja do sistema foi removida por padrão e o usuário precisa instalar uma extensão do tipo AppIndicator
- O `new Tray()` do Electron no GNOME sem host **cria com sucesso mas não renderiza e não reporta erro** — falha silenciosa

Por isso o princípio central de design é: **a capacidade de residência não depende de a bandeja ter sido criada com sucesso, e sim de a bandeja realmente poder ser renderizada; se não for detectada, há degradação para o caminho existente de "confirmar saída", e o usuário nunca fica sem saída**.

## Matriz de comportamento

| Plataforma / ambiente | Chave de configuração | Default | Comportamento ao fechar | Bandeja |
| --- | --- | --- | --- | --- |
| Windows | operável (estado atual inalterado) | ligada | oculta e permanece (estado atual inalterado) | permanente |
| Linux + bandeja disponível | operável | **desligada** | depois que o usuário ligar: oculta e permanece | criada após a detecção de capacidade passar |
| Linux + bandeja indisponível | **desabilitada e travada em desligada** | — | caminho existente de "confirmar saída", igual ao de hoje | não criada |
| macOS | a configuração não aparece | — | padrão do sistema (fechar não sai, Dock mantém vivo) | nenhuma (estado atual inalterado) |

Entrada de recuperação da permanência oculta: o ícone da bandeja (clique ou duplo clique para
trazer de volta, menu com sair) + a recuperação por `second-instance` já existente (clicar no ícone
pin ou no ícone da área de trabalho, já implementado e sem necessidade de mudanças).

## Detecção de capacidade da bandeja

### Sinais de detecção

Se o name `org.kde.StatusNotifierWatcher` na session DBus tem owner:

- com owner → existe host de SNI (KDE/XFCE satisfaz nativamente; o GNOME satisfaz depois da extensão AppIndicator instalada) → bandeja disponível
- sem owner / consulta falha / timeout → tratar como "indisponível" (default seguro)

**Não se mantém uma lista hardcoded de ambientes de desktop** (não se usa um julgamento do tipo "se
for GNOME, não suporta"); um único sinal cobre naturalmente todos os ambientes de desktop e
ambientes novos não exigem mudança de código.

`XDG_CURRENT_DESKTOP` contendo `gnome` (sem diferenciar maiúsculas/minúsculas) → marca
`gnomeLike`, usada apenas para decidir se o texto de desabilitado acrescenta a dica "instalar a
extensão AppIndicator".

### Implementação da detecção

Zero dependências novas: tenta-se em sequência usar ferramentas de sistema para consultar
`org.freedesktop.DBus.NameHasOwner` no session bus:

1. `gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher` (padrão da família GNOME, saída `(true,)` / `(false,)`)
2. `busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus NameHasOwner s "org.kde.StatusNotifierWatcher"` (padrão da família systemd, saída `b true` / `b false` — booleano sem aspas; o parser aceita também a variante com aspas)
3. `qdbus org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher` (família QT, saída `true` / `false`)

Qualquer ferramenta que dé um resultado explícito encerra a detecção; ferramenta inexistente, falha de
execução ou timeout (cerca de 1,5 s) → tratar como indisponível. As três ferramentas cobrem as
distribuições principais; em ambientes extremos sem nenhuma delas o resultado é o default seguro, com
comportamento igual ao default do GNOME (não permanece), sem risco de o usuário ficar sem saída.

### Cache e refresh (monitor)

O caminho de fechamento de janela `handleDesktopWindowCloseRequest` é um callback síncrono e não pode
fazer await na detecção; por isso o processo main mantém um **cache síncrono**:

```
createCloseToTrayCapabilityMonitor
  ├─ getSync(): Linux 返回缓存值;启动后未完成首次探测时返回 null(视为不可用,走安全路径)
  └─ refresh(): 异步探测并更新缓存
```

Momento de refresh (sem polling periódico, para evitar processo residente):

- primeira detecção depois que o app fica ready
- quando a página de configurações consulta via IPC (se o cache estiver stale por mais de 10 s, uma nova detecção é feita) — depois que o usuário instala a extensão e abre a página de configurações, o switch já aparece desbloqueado

Observação sobre o timing de startup: no cenário de autostart, o StatusNotifierWatcher do Linux pode
surgir depois do ZCode; a primeira detecção dá false e depois, quando o usuário abre a página de
configurações, uma nova detecção corrige o valor; nesse intervalo o fechamento de janela segue o
caminho seguro (confirmar saída), o que é aceitável.

### Momento de criação da bandeja e unificação da "capacidade de ocultar" (CR-01)

- Windows: criada depois que o app fica ready, `trayReady` é posto pelo resultado da criação
- Linux: **criada depois que a detecção de capacidade passa** (se a detecção falha, não cria, evitando registrar um name de DBus que ninguém renderiza); a criação da bandeja acompanha a capacidade, não a chave de configuração (consistente com a semântica do Windows: a configuração só controla se o fechamento mantém o app vivo, não a permanência da bandeja); quando a consulta IPC da página de configurações percebe que a capacidade ficou disponível e a bandeja ainda não existe, ela é criada
- O ícone da bandeja no Linux usa PNG (dev: `build/icon.png`; empacotado: `resources/icon.png`, e extraResources já empacota incondicionalmente, sem necessidade de mudar a configuração de empacotamento); o Windows continua usando `tray_icon.ico`

**Decisão final sobre a capacidade de ocultar (`resolveCloseToTraySupported`)**: a existência do
watcher no DBus só prova que o desktop pode ter um host, mas não prova que a instância `Tray` do
Electron foi criada com sucesso (ícone ausente, sessão não pronta etc. fazem `new Tray()` lançar
erro). Antes de ocultar a janela é obrigatório verificar que a entrada real do usuário final existe:

```
win32:  trayReady
linux:  trayReady ∧ DBus 能力探测通过
其它:   不可隐藏
```

Tanto o branch de fechamento da janela quanto a consulta de capacidade da página de configurações
(IPC) leem esse resultado unificado; se qualquer condição falhar, trata como indisponível e segue
confirmar sair ou deixa desabilitado, eliminando o caso "DBus disponível mas criação do Tray falhou e
esconder ficou sem saída".

## Caminho de fechamento da janela

A condição do branch de ocultação de `handleDesktopWindowCloseRequest` é generalizada:

```
关窗请求
  ├─ (win32 或 (linux 且 closeToTraySupported)) + 设置开 + 非强制退出/显式退出
  │     → win.hide() 驻留(现有 Windows 分支行为)
  ├─ darwin / 非最后窗口 → 系统默认
  └─ 其余(Linux 无托盘、或设置关)
        → 现有"最后窗口确认退出"路径(生产环境 + 运行中会话时弹确认框)
```

`closeToTraySupported` vem do cache síncrono do monitor (vazio equivale a false, default seguro).
Com a configuração ligada mas a capacidade indisponível no instante do fechamento → não permanece,
segue confirmar saída, e nunca ocorre "escondeu mas não tem como recuperar".

`window-all-closed` não precisa de mudanças: `win.hide()` apenas oculta e não destrói a janela, e
portanto não dispara.

## Item de configuração

### Compatibilidade da storage key

Mantém-se a storage key e o schema `closeToTrayOnWindows` (para evitar custo de migração de
configurações existentes), apenas estendendo a semântica ao Linux. Nomenclaturas internas como
parâmetros de função passam a ser o `closeToTray`, neutro em relação ao significado.

### Migração do default no Linux

Problema: usuários Linux existentes já tiveram `closeToTrayOnWindows` definido como `true` por
`migrateCloseToTrayOnWindowsDefault` (shared não tem conceito de plataforma), e o Linux antes
**não tinha entrada de configuração** (a UI só aparecia no Windows), portanto um `true` existente não
pode ter sido uma escolha explícita de um usuário Linux.

Solução: novo campo de marcação `closeToTrayLinuxMigrationInitialized` (schema default false); no
bootstrap do processo main, ao carregar as configurações:

```
Linux && !closeToTrayLinuxMigrationInitialized
  → closeToTrayOnWindows 强制 false(归位默认关)+ 写入 initialized=true
Linux && 已初始化 → closeToTrayOnWindows ?? false(尊重用户显式选择)
非 Linux        → 现状不变(closeToTrayOnWindows ?? true,标记字段不读)
```

Usuários Linux de instalação nova completam a reposição no primeiro startup, com default desligado.

**Timing de persistência (CR-02)**: a escrita da migração precisa ser concluída com `await` antes de
continuar o startup (antes de criar a janela / de o renderer ler as configurações), garantindo que a
página de configurações sempre leia o valor pós-migração; o custo da escrita do JSON local é
irrelevante. **Falha na escrita** (disco cheio / somente leitura etc.): o valor em memória volta ao
valor atual do arquivo de persistência (`resolveCloseToTrayRuntimeValue`), mantendo "o arquivo é a
única fonte confiável" — o comportamento do main e o que a página de configurações mostra ficam
consistentes (ambos o valor do arquivo), evitando duas fontes de dados; a migração é tentada de
novo no próximo startup e, durante a falha, usuários Linux mantêm o comportamento antigo com a
migração incompleta.

### Canal (hierarquia de estado)

```
main 进程(唯一数据源)
  closeToTrayCapabilityMonitor ──缓存──→ 关窗分支(getSync)
  mainSettingService(设置持久化)──closeToTrayOnWindows──→ 关窗分支
        │ ipcMain.handle(GetCloseToTrayCapability)
        ▼
preload bridge(window.zcode.getCloseToTrayCapability)
        ▼
renderer desktopPlatform(IPlatformService 适配)
        ▼
SettingsPage(置灰判断;Web/远控无桥不实现,设置项本就仅桌面显示)
```

DTO retornado: `{ supported: boolean; gnomeLikeWithoutTray: boolean }` (o segundo = gnomeLike &&
!supported, que decide o texto).

### UI na página de configurações

- A condição de exibição passa de `isWindowsDesktop` para `isWindowsDesktop || isLinuxDesktop`
- No Linux, enquanto `capability` está em consulta/indisponível → Switch desabilitado (`disabled`)
- Texto descritivo do estado desabilitado: "当前桌面环境未提供系统托盘,无法启用关闭驻留" (o ambiente de desktop atual não fornece bandeja do sistema, não é possível habilitar a permanência ao fechar); quando `gnomeLikeWithoutTray`, acrescentar: "GNOME 用户可安装 AppIndicator 类扩展后重启应用启用" (usuários GNOME podem instalar uma extensão do tipo AppIndicator e reiniciar o app para habilitar)
- O Windows não consulta capability e o switch fica disponível diretamente (estado atual inalterado)

## i18n

- Reaproveitar o `settings.closeToTrayOnWindows` existente (o texto "关闭窗口时隐藏到托盘" é neutro em relação à plataforma)
- Adicionar `settings.closeToTrayUnavailable` e `settings.closeToTrayGnomeHint` (chinês e inglês)

## Limitações e trabalhos futuros (fora deste ciclo)

- **Asset do ícone da bandeja**: no Linux, com 22~24 px, usar o PNG colorido do app diretamente tem legibilidade mediana; futuramente será lançado um ícone no estilo symbolic monocromático (uma versão para tema claro e outra para escuro)
- **Escuta dinâmica de capacidade**: é possível assinar o `NameOwnerChanged` do DBus para perceber em tempo real a subida/descida do watcher e criar/destruir a bandeja dinamicamente; neste ciclo o cenário principal é coberto pela "refresh na consulta da página de configurações"
- **Itens de verificação em máquina real** (o CI em container não tem sessão de desktop, não cobre): interação com a bandeja em KDE/XFCE, GNOME antes e depois da extensão, os quatro formatos de pacote AppImage/deb/rpm/pacman; listados como pendentes de validação no MR
- No GNOME o comportamento do clique com o botão esquerdo depende da implementação da extensão AppIndicator (pode abrir um menu em vez de disparar `click`); o `double-click` e a entrada de menu servem de fallback

## Requisitos de teste

- Detecção de capacidade: mock do executor de subprocesso, cobrindo o parsing da saída de gdbus/busctl/qdbus, ferramenta ausente, timeout e pass-through em não-Linux
- Branch de fechamento: teste unitário da matriz linux + supported/unsupported × configuração ligada/desligada (complemento do `desktopWindowLifecycle.test.ts` existente)
- Reposição do default no Linux: função pura extraída e testada unitariamente (não inicializado força false; inicializado respeita o valor explícito; não-Linux não muda)
- Monitor: refresh do cache e semântica de stale