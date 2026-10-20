# Spec de Governança de Permissões do Navegador Integrado

## Contexto

O relatório CNVD `ZCode 内置浏览器未授权访问` (「acesso não autorizado do navegador integrado do ZCode», risco médio): o navegador integrado não tem controle de permissões com negação padrão para páginas não confiáveis; uma página atacante pode obter de forma silenciosa capacidades sensíveis como câmera/microfone, área de transferência e geolocalização, sem nenhum popup de confirmação do produto.

Verificação do estado atual (2026-10-08):

- O navegador integrado é um `<webview>` padrão do Electron 41 (`packages/ui/src/browser-use/BrowserViewportSurface.tsx:151`), e a session usa a partition persistente `persist:zcode-embedded-browser` (`packages/desktop/src/main/browserDataManager.ts:32`).
- Essa partition não registra nenhum `setPermissionRequestHandler` / `setPermissionCheckHandler` / `setDevicePermissionHandler`; `desktopNetworkPolicy.ts` cobre apenas proxy e certificados. O comportamento padrão do Electron é **aprovar automaticamente todas as solicitações de permissão**, portanto requisições de páginas maliciosas como `getUserMedia` / `clipboard.readText` / `geolocation` são liberadas silenciosamente, sem UI e sem log.
- O endurecimento existente (`desktopWindowChrome.ts` `will-attach-webview`: sandbox / contextIsolation / lista de protocolos de URL / roteamento de abertura de janela) faz apenas isolamento de processo, não barreira de capacidade. A partition de sandbox de plugin já tem uma barreira de permissões (`pluginSandbox/session.ts` + `permissionGate.ts`), e seu modo de consentimento em memória com deduplicação de inflight é reaproveitado por esta spec.
- Categorias de dispositivo (WebHID/WebUSB/WebSerial/bluetooth), no Electron, quando os eventos `select-*` não são escutados, **concedem silenciosamente a autorização do primeiro dispositivo correspondente**; o compartilhamento de tela falha imediatamente quando `setDisplayMediaRequestHandler` não está registrado.

## Objetivos

- Nenhuma solicitação de permissão da partition do navegador integrado é liberada automaticamente por padrão: a lista de permissões inofensivas é liberada silenciosamente, as capacidades sensíveis passam por um popup de nível de produto decidido pelo usuário, e todas as demais são explicitamente negadas.
- Três popups de produto: balão de confirmação de permissão (quatro estados: "仅本次允许/访问此网站时允许/不允许/关闭"), seletor de fonte de compartilhamento de tela e seletor de dispositivo.
- Registro persistente de consentimento por site + gestão de "网站权限" na página de configurações (permitir/bloquear/perguntar).
- Cada decisão de permissão gera um log de auditoria (nível info, baixa frequência, mantido em produção).
- Câmera, microfone, leitura da área de transferência, geolocalização, notificações, MIDI, USB, HID, Serial, bluetooth, compartilhamento de tela e demais capacidades entram todas nessa governança.

## Não objetivos

- Não alterar o comportamento de permissões de defaultSession, Coding Plan, Rewards, sandbox de plugin e session temporária de gravação de tela (o escopo foi reduzido, pela decisão de 2026-10-08, à apenas a partition do navegador integrado).
- Não mudar a estratégia de persistência da partition (o estado de login é uma funcionalidade do produto; a recomendação do CNVD de "partition de isolamento não persistente" é respondida com a governança de permissões por negação padrão como principal linha de defesa).
- Não implementar a autorização de dispositivos por site no estilo Chrome (para categorias de dispositivo, o seletor aparece a cada vez); não fazer o escopo por tab do "仅本次允许" (o escopo é o período de execução do aplicativo).
- Não fazer a condução de autorização em nível de sistema (TCC) do macOS; mesmo após a camada web permitir, a restrição do sistema continua valendo, o que é comportamento da camada Chromium.
- Não afetar o lado Web nem o link de controle remoto pelo celular; os popups de permissão existem apenas no painel do navegador integrado do desktop, que hospeda o `<webview>`.

## Arquitetura e cadeia de decisão

O processo main ganha um novo módulo `embeddedBrowserPermissionPolicy`, que registra todos os handlers de uma só vez para `fromPartition(EMBEDDED_BROWSER_PARTITION)` na inicialização do aplicativo (logo após `applyDesktopChromiumNetworkPolicies`):

```text
a página guest dispara a requisição
  │
  ├─ permission request ──► ① lista de permissões inofensivas? ──sim──► liberar + log info
  │                            │não
  │                            ▼
  │                    ② consultar o registro de consentimento (sessionAllow em memória → JSON persistente)
  │                       ├─ acerto em allow (em qualquer camada)──► liberar + log info
  │                       ├─ acerto em deny persistente ────────► negar + log info (não abre popup)
  │                       └─ sem registro ──► popup A: balão de confirmação
  │                                      允许/仅本次/阻止/✕超时 → gravar o registro + log
  ├─ getDisplayMedia ──► setDisplayMediaRequestHandler
  │                       └─► popup B: seletor de fonte (pergunta a cada vez, não memoriza)
  ├─ requestDevice（hid/usb/serial/蓝牙）──► listener de eventos select-*
  │                       └─► popup C: seletor de dispositivo (pergunta a cada vez, não memoriza)
  │                       （o próprio registro do listener bloqueia o caminho padrão de "autorizar silenciosamente o primeiro dispositivo"）
  └─ permission check ──► consistente com o registro de consentimento: allow (em qualquer camada) → granted, o resto → não granted
```

Sequenciamento do popup: o request handler suspende o callback → o main notifica o renderer da janela principal via IPC → o popup é renderizado dentro do painel do navegador integrado (mesma origin + deduplicação de permissão, um único popup, reaproveitando o modo de inflight do pluginSandbox) → ação do usuário ou timeout de 20s → o renderer devolve ao main → callback → a página recebe o resultado. Quando o painel não está visível, o popup não pode ser interagido e o timeout de 20s nega naturalmente — páginas executadas em background pelo agent são negadas por natureza, sem ramo especial.

## Tabela de classificação de permissões

| Nível | Permissão | Estratégia de memorização |
|---|---|---|
| Liberação silenciosa | `clipboard-sanitized-write`、`fullscreen`、`pointerLock`、`mediaKeySystem` | Nenhuma |
| Popup A: balão de confirmação | `media`（com `details.mediaTypes` indicando câmera/microfone）、`clipboard-read`、`geolocation`、`notifications`、`midi`、`midiSysex`、`idle-detection`、`speaker-selection`、`window-management`、`storage-access`、`top-level-storage-access`、`keyboardLock`、`fileSystem` | Ver os quatro estados do popup A |
| Popup B: seletor de fonte | `display-capture`（compartilhamento de tela） | Perguntar a cada vez, não memorizar |
| Popup C: seletor de dispositivo | `hid` / `usb` / `serial` / bluetooth | Perguntar a cada vez, não memorizar |
| Negação explícita | `openExternal`（a abertura de protocolo externo já tem uma rota própria de "abrir no navegador padrão"）、`unknown`、`deprecated-sync-clipboard-read` | — |

Qualquer string de permission que não esteja na tabela acima é explicitamente negada e gera log warn (fail-closed, para impedir novas enumerações em versões futuras do Electron).

## Interação dos popups

### A. Balão de confirmação (abaixo da barra de endereço, à esquerda, dentro do painel do navegador integrado, exibido automaticamente)

```text
┌──────────────────────────────────────┐
│ example.com 想要使用            [✕]  │
│  🎥 摄像头                           │
│ ╭──────────────────────────────────╮ │
│ │ ●  访问此网站时允许                │ │
│ ╭──────────────────────────────────╮ │
│ │ ●  仅本次允许                     │ │
│ ╭──────────────────────────────────╮ │
│ │ ●  不允许                        │ │
│ ╰──────────────────────────────────╯ │
└──────────────────────────────────────┘
```

O popup aparece automaticamente assim que a requisição chega (balão ancorado no estilo Chrome, cartão popover `w-80`: `rounded-xl` +
`bg-popover` + `border-popover-border` + `shadow-md`). O cabeçalho traz o título da origin e o fechamento ✕;
o corpo traz a lista linha a linha de ícones de capacidade (câmera/microfone/área de transferência etc., reaproveitando os glifos de `BrowserPermissionIcon`);
as três opções são botões cápsula empilhados verticalmente (`rounded-full` secondary, alinhados à esquerda, com quebra de linha).
Definição final medida em 2026-10-08: não há botão "永久阻止" — após um clique acidental, a anomalia do site é difícil de se recuperar sozinha, e o deny persistente é mantido apenas na gestão de permissões de site
(o popup não o oferece). O fechamento ✕ equivale a "不允许" como negação desta vez sem memorização.

| Ação | Semântica | Armazenamento |
|---|---|---|
| 访问此网站时允许 | Liberação persistente, sem novas perguntas depois | Camada persistente `origin+permission → allow` |
| 仅本次允许 | Liberação durante esta execução do aplicativo, inválida após reinício | Memória do main `Map<origin, Set<permission>>` |
| 不允许 / timeout de 20s | Negação desta vez, sem memorização, volta a aparecer na próxima | Nenhum |

### B. Dialog do seletor de fonte (compartilhamento de tela)

Lista de miniaturas de `desktopCapturer.getSources()` (tela inteira / cada janela) → selecionar significa compartilhar aquela fonte (`callback({ video: source })`); cancelar/timeout → `callback({})`, e a página recebe `NotAllowedError`.

### C. Dialog do seletor de dispositivo (WebHID/USB/Serial/bluetooth)

Nome do site solicitante + lista de dispositivos (nome/fabricante/número de série) + permitir/cancelar → `event.callback(dispositivo selecionado)` ou `callback(undefined)`.

Os três popups seguem o `DESIGN.md`, bilíngues + com dois temas, cobrindo tanto a exibição no desktop quanto no controle remoto pelo celular.

## Modelo de dados e persistência

- Camada persistente: um JSON independente (`embedded-browser-site-permissions.json`, leitura/escrita atômica no main), com estrutura `{ [origin]: { [permission]: "allow" | "deny" } }`; sem registro = perguntar. Não entra no settings global, para evitar acoplamento com a broadcast entre janelas.
- Camada em memória: `sessionAllow` do processo main (仅本次允许) + `inflight` (deduplicação por mesma origin+permissão).
- O escopo de "仅本次" = o período desta execução do aplicativo.

## Limpeza dos dados de permissões de site

A seção "内置浏览器" da página de configurações **não oferece mais** o bloco "网站权限" (decisão de 2026-10-09: a entrada de edição converge para a aba de configurações de permissões de site, evitando entrada dupla). A ação "清空数据" continua limpando em sincronia o JSON de permissões de site e o armazenamento da partition embedded (corrige o problema incidental de que, hoje, a limpeza em `desktopCommandHandlers.ts` só limpa a defaultSession e se esquece da partition do navegador integrado).

## Aba de configurações de permissões de site (novo, consolidado em 2026-10-09)

Única entrada de produto para edição das permissões de site, localizada dentro do painel do navegador:

- **Entrada**: ícone permanente de sliders à esquerda do campo de URL da barra de endereço (não muda com as solicitações de permissão; fica oculto ao focar a edição da URL e não resolve nenhuma requisição pendente). O clique abre um pequeno balão mostrando a origin do site atual e a única ação "权限设置", que leva a uma aba de configurações independente.
- **Aba de configurações**: aba de configurações independente dentro do sidepane, reutilizada por escopo de workspace/conversa (abrir no mesmo escopo de novo reusa a mesma aba). Não cria webview, não conta como página viva do site e não é exposta ao Agent como página operável.
- **Capacidades da página**: exibe o estado de cada permissão que o site já tem registrado na camada persistente do main, com ajuste item a item para 询问/允许/阻止 (perguntar remove o registro e volta a perguntar a cada vez); suporta reset do site inteiro (`resetSite(origin)` no main, que limpa todas as decisões persistentes daquela origin); o estado temporário "仅本次" não é exibido (coerente com o bloco da página de configurações).
- **Fonte de dados única**: todas as leituras e escritas passam pelo store de permissões de site do main (`getEmbeddedBrowserSitePermissions` / `setEmbeddedBrowserSitePermission` / `resetEmbeddedBrowserSitePermission`); a página mantém estados explícitos e separados de falha de leitura/falha de escrita com retry explícito, sem inferir a autorização modificada e sem cache de autorização, retry automático ou fila de operações.
- A URL da barra de endereço fica centralizada quando não está em edição e alinhada à esquerda, com o ícone da esquerda oculto, quando o campo está em foco.

## Registro das decisões de consolidação (2026-10-09)

O branch `fix/missing_tool` (ZP-20260916-09, spec em seu `2026-09-24-embedded-browser-permissions-spec.md`)
e esta spec (CNVD) são implementações paralelas do mesmo modelo de governança de permissões. Conclusões da consolidação:

- **A lógica segue esta spec**: a cadeia de decisão no main, a tabela de classificação de permissões, a semântica dos três popups, o timeout de 20s, o fail-closed, a
  estrutura da camada persistente e o log de auditoria são mantidos; a implementação no main e o wiring de protocolo do `fix/missing_tool` são descontinuados.
- **O visual dos popups adota o branch fix**: a estrutura de cartão do balão de confirmação, a lista de ícones de capacidade, os botões cápsula empilhados verticalmente e o fechamento ✕;
  a interação continua sendo a exibição automática e a semântica de três estados desta spec (o terceiro botão é "不允许·本次", e não o "从不允许" persistente do branch fix).
- **A aba de configurações de permissões de site adota o branch fix**: entrada de sliders na barra de endereço + aba de configurações independente + reutilização do escopo do sidepane,
  com a camada de dados adaptada ao store do main desta spec. O bloco original "网站权限" da página de configurações foi removido em seguida (definição final do usuário em 2026-10-09: entrada única, para evitar divergência entre duas superfícies de edição); suas chaves de i18n dedicadas e os testes mortos foram removidos junto,
  e o protocolo `clearEmbeddedBrowserSitePermissions` foi mantido (a cadeia "清空 dados" e a capacidade de limpeza por site inteiro continuam no lado do main).
- A interação do branch fix de "ícone da barra de endereço mudando conforme a requisição, com clique expandindo o balão de solicitações" não é adotada (o balão de requisição aparece automaticamente);
  suas melhorias de cancelamento em nível de iframe, refatoração do ciclo de vida da requisição e handshake por MessagePort no lado do main também não são adotadas (pertencem à lógica descontinuada).

## Log de auditoria

```text
[embedded-browser-permission] decision=granted|denied origin=… permission=… source=allowlist|site-setting|session-allow|user-prompt|prompt-timeout|device-picker|source-picker|default-deny
```

Nível info (baixa frequência, mantido em produção); o volume de logs dos caminhos com popup é da mesma ordem de grandeza do número de solicitações de permissão (frequência muito baixa).

## Superfície de impacto em compatibilidade (verificada item a item)

| Cadeia | Impacto |
|---|---|
| agent browser-use (captura via CDP, área de transferência virtual) | Impacto zero — a captura usa `Page.captureScreenshot`, e a colagem usa um `ClipboardEvent` sintético + `execCommand` (`browserVirtualClipboardPageScript.ts`); nenhuma delas dispara permission |
| Botão de copiar da página / site de vídeo com DRM / tela cheia da página | Não afetado (lista de permissões) |
| `window.open` / roteamento de nova tab / "abrir no navegador padrão" | Não afetado (já existe o mecanismo independente `setWindowOpenHandler`) |
| Compartilhamento de tela | Deixou de falhar silenciosamente e passa a ser controlado por popup, com o seletor de fonte fazendo a guarda |

## Requisitos de teste

- O E2E de permissões deve primeiro disparar a requisição da página sem esperar que ela termine, depois clicar na barra de confirmação do produto e, por fim, ler o resultado na página.
  `executeJavaScript` espera o Promise retornado; ao disparar `getUserMedia` use `void`, para o próprio teste não esperar a decisão do usuário e não conseguir clicar.
  Ordem: disparar a requisição -> a barra de confirmação fica visível -> clicar em permitir/negar -> asseverar o resultado e o comportamento da requisição seguinte.

- Testes unitários: enumeração completa da tabela de decisão (lista de permissões/registro encontrado/sem registro e sem capacidade de popup nega/permissão desconhecida com fail-closed), consistência entre check e request, leitura/escrita da camada persistente e escrita atômica, ciclo de vida do sessionAllow, deduplicação de inflight, negação por timeout de 20s, callbacks de negação de `select-*` e displayMedia.
- E2E (desktop e2e): o balão de confirmação aparece -> para cada um dos três botões e do ✕, o resultado do lado da página e o comportamento da requisição seguinte; a memória persistente vale após reiniciar; alterar o estado na página de configurações tem efeito; selecionar uma fonte no seletor de fontes faz `getDisplayMedia` ter sucesso, e cancelar faz falhar; `requestDevice` abre o seletor de dispositivos, com asserção negativa de que "sem escolher um dispositivo, o primeiro não é mais autorizado silenciosamente".

### Consistência de origin entre consulta e requisição de permissão

Depois de corrigido o deadlock em que o próprio teste esperava o Promise de permissão, `browser-permission-prompt.test.ts` ainda falhava na
asserção de `permissions.query('camera')` após a permissão persistente. O log de runtime mostra que `getUserMedia` já retornou `ok`, mas a consulta continuava como
`denied`: a autorização foi gravada na origin padrão, enquanto o callback de check do Electron passa a origin com `/` final, e a consulta feita sem normalização não encontrou. A
evidência está em `packages/desktop/.e2e-artifacts/desktop-e2e-accountless-diagnosis-20261014b/` local.
Request e check usam ambos a normalização por URL.origin para consultar o mesmo registro; a permissão persistente e a permissão desta vez seguem essa restrição.
Os testes unitários cobrem origin crua, barra final, caminho da página, além do isolamento por protocolo, site e permissão; o E2E mantém a asserção de `granted` após a autorização.

## Ordem de implementação (quatro commits, cada um verificável de forma independente)

1. Módulo de política no main: registro completo dos handlers de request/check/device + listeners de `select-*` / displayMedia; antes da implementação dos popups, todo item sensível é negado + log (ciclo de segurança fechado, publicável isoladamente para fechar o vazamento).
2. Camada de popups: balão de confirmação + seletor de fontes + seletor de dispositivos (IPC + UI + deduplicação + timeout).
3. Persistência + página de configurações: lista de permissões de site + integração da limpeza de dados.
4. Complemento dos testes unitários/E2E e fechamento da documentação.

## Critérios de aceitação

- Nenhuma página consegue obter, sem confirmação do usuário, as capacidades de câmera, microfone, leitura da área de transferência, geolocalização, notificações, MIDI, dispositivos e compartilhamento de tela (não existe caminho de liberação automática).
- Cada decisão sobre permissões sensíveis é auditável; as permissões da lista de permissões não geram falhas funcionais (copiar, tela cheia e reprodução com DRM funcionam normalmente).
- As regressões existentes do agent browser-use (captura via CDP, colagem pela área de transferência virtual, ciclo de vida de tab) não são afetadas.
