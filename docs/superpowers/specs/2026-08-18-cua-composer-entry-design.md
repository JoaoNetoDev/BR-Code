# Botão de Entrada Permanente de CUA no Campo de Entrada (Primeira Etapa: Botão + Máquina de Estados)

- Data: 2026-08-18
- Status: design confirmado, aguardando implementação
- PRD upstream: 《PRD do ZCode CUA — botão permanente no campo de entrada e experiência gratuita v0.2》(título original: 《ZCode CUA 输入框常驻按钮&免费体验 PRD v0.2》, wiki do Feishu EEE7wZ06Ti7Gx5kGWU8cthX9nOg)
- Branch: `feat/cua-composer-entry`
- Alterações posteriores: ver «Alteração de 2026-09-11: Controle de Computador Desligado por Padrão» no fim deste documento — essa alteração removeu o estado de UI
  «未启用» (`plugin-disabled`) descrito em vários pontos deste texto; ao ler a tabela de estados e o diagrama ASCII abaixo,
  consulte também essa seção final.

## Contexto

Hoje o CUA tem apenas um ponto de entrada acionável pelo usuário: o interruptor geral do plugin `zcode-cua` em
`设置 → 电脑控制 (Computer Use)` (`packages/ui/src/settings/ComputerUseSection.tsx`). A percepção do usuário é fraca e o custo de descoberta é alto, o que o PRD §2.1
identifica como o problema central.

O esquema completo do PRD inclui uma camada de orientação de experiência gratuita e um sistema de cota gratuita. **Nesta etapa implementamos apenas a entrada e a apresentação de estado**, porque a
cadeia de cota (entitlement `cua-trial`, reserve/settle de tokens, Provider oficial de teste + modelo multimodal de teste,
congelamento de tarefas de experiência, popup de upsell) não tem nenhuma base no repositório atual e depende do
serviço de billing da z.ai entregar os dados; o próprio PRD também marca
«rascunho, aguardando aprovação final de faturamento». Implementar a UI de cota no cliente antes de a semântica do servidor
estar definida só produziria retrabalho.

## Escopo

### Implementado nesta etapa

1. O botão permanente «电脑操作» à direita do seletor de modo de permissão em `V4ComposerToolbar`
2. 5 estados de UI externos + ponto de status de baixa intensidade (não habilitado cinza / habilitando cinza girando / habilitado verde / permissão ausente amarelo / erro vermelho)
   (2026-09-11: o estado «未启用» foi removido, agora são 4 estados; não habilitado passou a não renderizar)
3. 6 textos de tooltip (5 estados + estado desabilitado de sessão em execução), em chinês e inglês
   (2026-09-11: `…tooltip.disabled` foi removido junto com o estado «未启用», agora são 5)
4. Cobertura de interatividade `session-busy`: qualquer turn em execução dentro do workspace → desabilita tudo
5. Gate de plataforma: remote / linux / Web comum / controle remoto do celular não renderiza
6. Comportamento de clique: todos os estados visíveis → vai para a seção `computerUse` da página de configurações; não responde apenas quando há cobertura de session-busy
   (alteração de 2026-08-20; antes era «não habilitado e permissão ausente clicáveis, demais estados apenas com hover de tooltip», ver a seção «Comportamento de clique» abaixo)
7. Interruptor «在输入框显示电脑操作按钮» na página de configurações (exibido por padrão, ocultado de forma persistente quando desligado)
   (2026-08-21 passou a ser ocultado por padrão; a partir de 2026-09-11 esse interruptor fica esmaecido quando o Controle de Computador está desligado e o texto de dica muda)

### Explicitamente fora desta etapa

| Seção do PRD             | Item não feito                                  | Motivo                                                                                     |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| §4.2 / §6.2             | Popup de orientação da experiência gratuita       | Decisão de produto: esta etapa não introduz popup; o botão vai direto para a página de configurações |
| §7 / §7.1 / §7.2        | Cota gratuita, modelo de teste, tarefas de experiência, popup de upsell | Depende do servidor de billing da z.ai, com semântica não aprovada definitivamente  |
| §4.2 passo 2 / §4.3 item 4 | Evento de protocolo `capability-changed`      | Exige estender `@zcode/protocol` + `apps/zcode-cli`; nesta etapa usa toggling de plugin + health do Helper como aproximação |
| §4.5                    | Janela flutuante de múltiplas tarefas            | Acoplada às regras de cota/concurrency                                                  |
| §4.6                    | Funil de telemetria                             | O principal elemento do funil é a taxa de conversão da camada de orientação; sem a camada, o funil não faz sentido |

**Critério de prontidão degradado**: o PRD §4.3 exige 5 itens Approved nesta etapa. Na prática se julgam 3 — escrita de plugin enabled bem-sucedida,
permissão do Helper aprovada (no mac, `isCuaPermissionTccGranted`: os dois itens do TCC granted) e estado do Helper utilizável.

**Por que não usar sonda de funcionalidade** (corrigido em 2026-08-19): este item foi escrito inicialmente como `isCuaPermissionStatusFullyReady`
(os dois itens do TCC + as duas sondas de funcionalidade ok), mas na implementação verificou-se que era uma condição sempre falsa. O `shouldRunCuaScreenCaptureProbe`
a montante exige `includeFunctionalProbes` explícito (captura de tela ativa tem de ser intenção do usuário), a entrada permanente usa apenas
refresh somente leitura, e portanto `screenCaptureProbeOk` é sempre `false` — usuários que já concluíram a autorização ficariam
eternamente no ponto amarelo «缺少 macOS 权限». Passa-se a usar a semântica de TCC com a mesma origem da linha de permissões da página
de configurações; falhas de chamada de ferramenta chegam ao modelo como um MCP error comum e o modelo pode chamar, conforme
necessidade, o `request_access` somente leitura. O Renderer não infere permissões automaticamente a partir do texto de erro nem abre a orientação de autorização sozinho.

**Risco conhecido**: o conjunto de ferramentas de uma sessão viva pode ainda não ter sido atualizado, e o usuário vê o ponto verde
sem ainda ter as ferramentas de CUA nas mãos do Agent. Essa é a consequência direta da ausência de `capability-changed`, e precisa ser resolvida na próxima etapa.

## Visibilidade e Derivação de Estado

```
                    ┌──────────────────────────────────────────────┐
  可见性门（2026-09-11 起四层，任一不过 → 不渲染 DOM，不是渲染成 disabled）│
  ├ 平台门 : macOS desktop || Windows desktop 且本地 workspace       │
  │          remote / linux / web / 手机远控 → unsupported          │
  ├ 设置门 : AppSettings.computerUseComposerEntryHidden === true     │
  │          → hidden                                              │
  ├ 服务门 : mac 下 services.cuaPermissionService 缺失 → 不渲染      │
  └ 插件门 : cuaPlugin.enabled !== true 且不在 toggling 中 → 不渲染   │
             （2026-09-11 新增，见文末变更节）                        │
                    └──────────────────────────────────────────────┘
                                    ↓ 全部通过
  ┌──────────────── 底层状态（三路数据源汇聚） ────────────────┐
  │ ① pluginManagementStore : cuaPlugin.enabled / togglingPluginId
  │ ② useCuaPermissionStatus: accessibility / screenRecording + probes
  │                           （仅 mac 且 ①enabled 为真时才查询）
  │ ③ session 运行事实      : 当前 pane snapshot.control.canStop
  │                           || workspace runtime running/activeInputId
  │                           || visible task index status=running
  └──────────────────────────────────────────────────────────┘
                                    ↓
   内部态                →  UI 态       状态点     点击行为
   ────────────────────────────────────────────────────────────────
   plugin-disabled       →  （2026-09-11 删除：改为不渲染，见插件门）
   starting (toggling)   →  启用中      subtle spin  跳设置页 computerUse
   permission-required   →  权限缺失    amber      跳设置页 computerUse
   ready                 →  已启用      green      跳设置页 computerUse
   error                 →  错误        red        跳设置页 computerUse
   ────────────────────────────────────────────────────────────────
   session-busy ── 可交互性覆盖，不改底层态 ──→ 置灰 + 禁用 tooltip + 不响应点击
```

### Comportamento de clique (alteração de 2026-08-20)

O design original só permitia clique em `plugin-disabled` e `permission-required`, sendo `starting` / `ready` / `error`
três estados puramente indicators (PRD §3 item 6). A sensação real após a implementação ficou ruim: depois de o usuário seguir o
guia, concluir a autorização TCC e ver o botão ficar verde, um novo clique não produzia nenhuma reação — um controle
com aparência de botão, com tooltip no hover e com resposta zero ao clique só seria entendido como defeito pelo usuário, e não
como «este estado foi projetado para não ter ação».

Agora passa a ser **visível é clicável, sempre indo para a seção `computerUse` da página de configurações**, com a única exceção da cobertura
session-busy (nesse caso o botão já fica esmaecido e troca para o tooltip «会话进行中»; permitir a navegação seria
contraditório com a expressão visual).

A base dessa decisão é o próprio destino: a seção `computerUse` da página de configurações tem algo a fazer para o usuário em qualquer
estado — o interruptor geral do plugin, a linha de permissões do mac e o botão de autorização, os detalhes do erro e o
interruptor «在输入框显示电脑操作按钮». No estado pronto é possível desligar; no estado de erro é possível ver a causa; no estado
habilitando é possível ver a linha do plugin sincronizando. Não existe estado de «fui para lá e não havia nada a fazer»,
portanto a lista de estados clicáveis não tem valor de retenção. Na implementação, `CLICKABLE_STATES` é removido diretamente e `clickAction` passa a ser
determinado apenas por `interactionDisabled`.

### Fontes de Determinação de Cada Estado Interno (contrato de implementação)

| Estado interno         | Condição de determinação                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `starting`             | `togglingPluginId === ZCODE_CUA_OFFICIAL_PLUGIN_ID` (maior prioridade, sobrepõe todos os estados abaixo)                                                                                                                                                                                                                                                                            |
| `error`                | ①`pluginManagementStore.error` não vazio e o alvo desta operação é o zcode-cua (a atribuição é registrada pelo `lastFailedPluginId` do store: falhas de operações com pluginId escrevem esse id, falhas de marketplace/validate/load sem alvo de plugin escrevem null — CR-01, evitando que um error compartilhado mapeie falhas não relacionadas para o estado de erro do botão); ou ②no mac com plugin habilitado mas estado do Helper `!isCuaPermissionStatusAvailable(status)` (falha de inicialização do Helper / não saudável) |
| ~~`plugin-disabled`~~ | ~~`cuaPlugin?.enabled !== true`~~ —— removido em 2026-09-11: não habilitado deixou de ser um estado de UI e passa a ser barrado pela porta de plugin antes da renderização                                                                                                                                                                                                                                           |
| `permission-required`  | mac + plugin habilitado + estado do Helper utilizável + `!isCuaPermissionTccGranted(status)`                                                                                                                                                                                                                                                                                   |
| `ready`                | plugin habilitado e (Windows) ou (mac e `isCuaPermissionTccGranted(status)`)                                                                                                                                                                                                                                                                                                  |

A prioridade faz curto-circuito de cima para baixo. Quando o estado de permissão ainda não retornou pela primeira vez (`status === null`, janela de cold start), o tratamento é
`starting` e não `error` — evitando que um ponto vermelho pisque assim que a janela é aberta.

### Diferenças de Plataforma

- **macOS**: requer medição de permissão. ② participa de toda a determinação.
- **Windows**: sem TCC, ② é totalmente pulado; `plugin.enabled === true` já é `ready`.
- Tem exatamente a mesma origem da determinação de plataforma já existente em `ComputerUseSection`, reutilizando
  `supportsLocalMacCuaPermissionOnboarding` / `IS_MACOS_DESKTOP` (`lib/cuaPlatform.ts`) e
  `isRemoteWorkspaceIdentity`, sem escrever novos critérios de plataforma.

### Limite Semântico do session-busy

Ele é uma «cobertura de interatividade», não o 6º estado de UI, e não altera o estado subjacente: quando todos os turns terminam, o
estado original e a cor original do ponto são restaurados automaticamente. O pane atual usa `snapshot.control.canStop` como
autoridade de menor latência; o fallback em nível de workspace verifica simultaneamente runtime running,
`activeInputId` e o estado `running` do índice de tasks visível, evitando destravar por erro quando alguma projeção volta
momentaneamente a ready. A granularidade da determinação é **workspace** (não uma única task) — alternar o estado de habilitação do plugin muda o conjunto de ferramentas de
todas as sessões daquele workspace e invalida o cache de prompt, e a superfície de impacto e a superfície de desabilitação precisam
coincidir.

O botão de parar do campo de entrada não é afetado por essa desabilitação (ele passa pela cadeia de controle de parada já existente), caso
contrário tarefas em execução não poderiam ser abortadas.

### Restrição de Custo da Consulta de Permissão

> Reescrito em 2026-08-19: esta seção antes descrevia «backoff exponencial começando em 1s, com timer independente por instância, caindo
> para 10s depois de tudo granted», e exigia que o composer passasse um intervalo inicial maior. A polling foi removida por
> completo; abaixo está a arquitetura atual.

`useCuaPermissionStatus` não tem mais nenhum timer comum. O estado fica no cache compartilhado em memória de processo de
`lib/cuaPermissionStatusStore` (compartimentado por workspace), e a página de configurações e a entrada do campo de entrada leem a mesma cópia, então não fazem uma consulta cada
nem exibem resultados diferentes. O refresh é **dirigido por evento, em três momentos**:

1. na montagem (entrada na página de configurações / primeira renderização da entrada no campo de entrada); quando montagens se sobrepõem, a posterior usa `ensure` para se apoiar na consulta em voo da anterior;
2. quando a janela retoma o foco (o usuário acabou de voltar de autorizar nas configurações de sistema do macOS);
3. `refresh` explícito do chamador (interruptor do plugin, reinício do Helper, cadeia de recuperação do retorno da autorização).

O motivo de remover o polling não é só o custo de RPC: cada rodada de consulta precisa colocar `fresh` de volta como false, e o texto do botão de autorização da página de configurações
ficaria alternando entre «打开系统设置» e «验证中…», com a largura mudando junto. Por isso a exibição passou a acompanhar `settled`
(válido quando há conteúdo a exibir, só sobe e não desce), e `fresh` é usado apenas para decisões.

**O único timer** é a convergência transitória: durante o cold start do Helper / o recreate logo após o plugin ser habilitado, o `getStatus`
do lado main retorna unavailable de forma fidedigna. Se essa amostra fosse tratada como estado terminal, a entrada ficaria
com ponto vermelho e o error não seria clicável, deixando o usuário preso no app sem caminho de autocura. Por isso, para «resultado
unavailable ou consulta rejeitada» há retentativa com backoff limitado por `TRANSIENT_RETRY_DELAYS_MS` (1s/2s/4s); durante as
tentativas a amostra não é publicada e o estado anterior é mantido; depois de esgotar o orçamento, o unavailable é publicado
como estado de erro de forma fidedigna e o reject mantém lastKnown até o próximo evento real. No regime estável não há timer algum.

Os gates que permanecem: **consultar apenas quando `cuaPlugin.enabled === true` e na plataforma mac**. O motivo é que a apresentação
de UI do estado não habilitado é independente de permissão (antes era sempre o ponto cinza «未启用»; a partir de 2026-09-11 simplesmente não renderiza), e puxar permissão não traz ganho de
informação. Essa restrição tem testes unitários correspondentes (ver «Testes»), para impedir que uma refatoração posterior coloque a consulta fora do gate sem querer.

## Divisão de Componentes e Arquivos

| Arquivo                                                      | Responsabilidade                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/cuaComposerEntryState.ts`（novo）        | Função pura `resolveCuaComposerEntryView(inputs)` → `{ visible: false }` ou `{ visible: true, uiState, tone, spinning, tooltipMessageId, clickAction, interactionDisabled }`. Zero dependências de React / de store |
| `packages/ui/src/hooks/useCuaComposerEntry.ts`（novo）        | Hook de orquestração: agrega as três fontes de dados, condiciona a consulta de permissão pelo enabled e chama a função pura acima                                                                          |
| `packages/ui/src/v4/composer/V4ComposerCuaEntry.tsx`（novo）  | Componente de duas camadas: camada externa com o gate de plataforma + camada interna de exibição (ver abaixo)                                                                                             |
| `packages/ui/src/lib/cuaPlatform.ts`（alterado）              | A determinação de plataforma muda de constante de módulo para função preguiçosa, e o novo gate de Windows                                                                                                |
| `packages/ui/src/v4/ConversationComposer.tsx`（alterado）     | Inserção dentro de `leadingActionsNode`, depois de `V4ComposerModeSwitch`                                                                                                                                     |
| `packages/ui/src/settings/ComputerUseSection.tsx`（alterado） | Adiciona a linha «在输入框显示电脑操作按钮» dentro do cartão do interruptor geral                                                                                                                              |
| `packages/shared/src/protocol.ts`（alterado）                 | `AppSettings` ganha `computerUseComposerEntryHidden?: boolean`                                                                                                                                              |
| `packages/shared/src/validationAppSettings.ts`（alterado）    | Validação sincronizada                                                                                                                                                                                       |
| `packages/shared/src/test-ids.ts`（alterado）                  | Adiciona `TID_V4_COMPOSER_CUA_ENTRY`                                                                                                                                                                          |
| `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`（alterado）   | Novos textos                                                                                                                                                                                                  |

Extrair a derivação de estado para uma função pura sem dependências é o núcleo deste design: o espaço de combinação de estados é grande
(plataforma × interruptor de ocultação × estado do plugin × estado de permissão × busy), e só uma função pura permite medir essa matriz
completamente, sem precisar montar um conjunto de mocks de store para cada combinação.

### Por que o componente é dividido em duas camadas

`V4ComposerCuaEntry` na camada externa chama apenas `useOptionalPlatform` / `useOptionalServices` para avaliar o gate de plataforma e
retorna null direto se ele não passar; apenas a camada interna `V4ComposerCuaEntryMounted` chama `useCuaComposerEntry`. Dois motivos:

1. **Semântica**: quando o gate de plataforma não passa, não se cria assinatura de settings, não se lê o store de plugins e não se inicia consulta de permissão — o que cumpre «se não é visível, não deve haver nenhum custo de fundo» de forma mais completa do que decidir na camada interna e depois retornar null.
2. **Robustez** (encontrado empiricamente durante a implementação): o composer é renderizado em hosts sem `PlatformProvider` / `ServiceProvider` — foi assim nos 3 testes existentes de componentes do composer. O `usePlatform` / `useServices` usado na camada interna lança exceção quando falta provider e derrubaria o composer inteiro (na primeira integração, derrubou 22 testes existentes). A camada externa usa as
   variantes opcionais e degrada silenciosamente para não renderizar na ausência.

Da mesma forma, o tab store dentro do hook usa `useOptionalTabStore`: sem provider, `openSettingsTab` degenera em noop e o
botão ainda pode ser renderizado e receber hover, apenas o clique não navega, em vez de derrubar a árvore inteira.

### Determinação de Plataforma Virando Função Preguiçosa

O `IS_MACOS_DESKTOP` original de `cuaPlatform.ts` era uma constante de módulo, avaliada no momento do import. Isso fazia com que
testes unitários de plataforma por UA não conseguissem cobrir várias plataformas no mesmo processo (mudar `navigator.userAgent`
não tem efeito sobre uma constante já avaliada). Passa a usar as funções preguiçosas
`isMacOsDesktopUserAgent()` / `isWindowsDesktopUserAgent()`, com comportamento de runtime equivalente — em ambiente real a UA
não muda no meio da execução. O critério de capability do gate de Windows usa `executeDesktopCommand` (injeção exclusive de
desktop), e não `openCuaPermissionOnboarding` — o Windows não tem TCC e nunca teve esse método.

### Especificação Visual

Segue `DESIGN.md`:

- o trigger usa o mesmo conjunto de determinação em Draft e em sessões existentes, no desktop e no Web mobile: o owner único de layout da barra de ferramentas aplica cumulativamente as sete faixas de compactação a seguir conforme a largura realmente disponível, parando em cada faixa assim que o espaço for suficiente e pulando controles inexistentes:
  1. Computer Use encolhe para um botão de ícone quadrado de 28px.
  2. mode encolhe para 28px quadrados, mantendo o texto de Plan, think e do provedor.
  3. Plan encolhe para 28px quadrados, com think e provedor continuando com texto.
  4. think recolhe o texto e a seta de dropdown, mantendo o ícone + a barra verde pequena; provedor e nome do modelo continuam exibidos por completo.
  5. oculta provider-text, think mantém a barra verde pequena e o nome do modelo continua exibido por completo.
  6. think remove a barra verde pequena e encolhe para 28px quadrados; o nome do modelo ainda aparece completo.
  7. model encolhe para um botão de ícone quadrado de 28px. Não existem faixas extras para omitir primeiro o texto do modelo ou para trocar para ícone abaixo de 80px.
- não se usa mais breakpoint de largura de container para ocultar antecipadamente os textos acima; quando há espaço, o nome do modelo e do provedor aparece completo, sem truncar previamente em 256px. Entre os dois grupos é fixo um espaçamento de 12px, o botão de envio continua utilizável e é proibido quebrar linha. Os botões de ícone mantêm a operação original, o Tooltip e o nome de acessibilidade.
- a lógica de faixas do think é mantida: o progresso é calculado pela ordem configurada, com itens fechados / valores inválidos valendo zero; quando o texto é recolhido o Tooltip mostra a faixa atual (priorizando o motivo da desabilitação), e a semântica de leitura única em uma faixa e de escolha em várias faixas não muda. Apenas o composer passa às três formas de exibição acima; os demais chamadores mantêm a lógica responsiva original.
- quando o espaço é recuperado, a decisão é refeita a partir do layout completo e a restauração é feita em ordem inversa: primeiro o nome do modelo, depois a barra verde pequena do think, depois o provedor, depois o texto do think, depois o texto do Plan, depois o texto do mode e por último o texto de Computer Use. Computer aparecendo atrasado, mudanças de modelo/idioma e redimensionamento da janela disparam nova medição; ao ativar ou desativar a redução de animação do sistema, o provedor e o modelo permanecem na mesma linha de texto, sem quebra de linha nem corte vertical por mudança de hierarquia do DOM.
- aceitação: estreitar/alargar a barra de_tools gradualmente e conferir a ordem das sete faixas, com cada faixa recolhendo/restaurando de forma independente; verificar especialmente que a barra verde pequena do think e o provedor, e o quadrado do think e o quadrado do modelo, não sejam fundidos na mesma faixa, que a ausência de Plan / Computer / think seja pulada, e os casos de think de várias faixas / uma faixa, provedor longo, modelo longo, chinês/inglês, desktop/mobile, tema claro/escuro e animação normal/reduzida. Conferir que a barra verde pequena está realmente visível, que a altura da faixa está correta e que todos os controles preservam sua capacidade original de operação.
  ```text
  尺寸或内容变化 → 工具栏唯一布局 owner → 测量完整按钮
    → Computer Use 正方形
    → mode 正方形（Plan、think 与供应商文字保留）
    → Plan 正方形（think 与供应商文字保留）
    → think 小绿条（供应商保留）
    → 隐藏 provider-text（think 小绿条保留）
    → think 正方形（小绿条隐藏，模型名称保留）
    → model 正方形
    （每档测量，够用即停；放宽时从完整布局重算，逆序恢复）
  ```

- o indicador de estado usa um ponto compacto, colocado como um item flex normal à direita do conteúdo do botão, sem posicionamento absoluto; quando o texto é recolhido o ponto
  continua aparecendo logo após o ícone.
  A cor de estado continua expressando por completo não habilitado/habilitando, permissão ausente, pronto e erro; o habilitando é representado por um pulso leve indicando um estado transitório.
- use apenas tamanhos de fonte `text-ui-*` (restrição de prioridade máxima do DESIGN.md)
- o ponto de estado reaproveita os tons `subtle/green/amber/red` da máquina de estados e é mapeado para cores de fundo semânticas; não habilitado/habilitando usam
  cor de primeiro plano secundária, e permissão ausente, pronto e erro usam warning, success e destructive respectivamente; `spinning` é mapeado no ponto como
  efeito de pulso. O `StatusDot` já existente na página de configurações não é afetado.
- **sem destaque forçado**: o estado padrão tem o mesmo peso visual dos demais controles da toolbar, evitando enganar o usuário em cenários indisponíveis

## Interruptor na Página de Configurações

- Campo `AppSettings.computerUseComposerEntryHidden?: boolean`
- Adota a semântica `hidden` em vez de `visible`: `undefined` significa exibição por padrão e usuários antigos não precisam de migração de dados
- Leitura via `useSettings()` (snapshot compartilhado + broadcast entre janelas) e escrita via `services.settingService.update()`
- Essa flag é persistida e não se autocorrige nem em reinício nem em atualização de versão; só pode ser reativada na página de configurações (PRD §4.1)
- Ocultar a entrada não afeta tarefas em andamento

## Textos (texto original do PRD §6.1 / §6.4)

| message id                                       | 中文                                                                 | English                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `chat.toolbar.computerUse.label`                 | 电脑操作                                                             | Computer Use                                                                                             |
| ~~`…tooltip.disabled`~~                          | ~~体验电脑操作 · 让 ZCode 直接操作你的电脑~~（2026-09-11 删除）      | ~~Try Computer Use — let ZCode operate your computer~~                                                   |
| `…tooltip.starting`                              | 正在启用电脑操作插件…                                                | Enabling Computer Use plugin…                                                                            |
| `…tooltip.ready`                                 | 电脑操作已就绪 · 直接描述你想让 ZCode 做的事                         | Computer Use ready — just describe what you want ZCode to do                                             |
| `…tooltip.permissionRequired`                    | 缺少 macOS 权限，点击完成授权                                        | Missing macOS permissions — click to grant                                                               |
| `…tooltip.error`                                 | 电脑操作启用失败 · 重启 ZCode 应用后重试，或让 ZCode 排查日志        | Computer Use enablement failed. Please restart ZCode app and retry, or ask ZCode to investigate the logs |
| `…tooltip.sessionBusy`                           | 会话进行中，暂不能切换电脑操作；任务结束后可再试                     | A conversation is running. Computer Use can't be toggled right now — try again after it finishes.        |
| `settings.computerUse.composerEntry.label`       | 在输入框显示电脑操作按钮                                             | Show Computer Use button in the composer                                                                 |
| `settings.computerUse.composerEntry.description` | 关闭后输入框不再显示电脑操作按钮，也不会自动恢复；可随时在此重新开启 | When off, the composer button is hidden and stays hidden until you turn this back on.                    |

O PRD §6.1 risca «启用中», mas a lista de estados do §3 item 2 ainda mantém esse estado. Este design mantém esse texto:
o risco é entendido como «não ser um destino de orientação independente», e não como «não dar nenhuma indicação ao usuário» — o toggling é
um estado intermediário real, e sem qualquer aviso durante ele o usuário pensaria que o clique não surtiu efeito. (Esse estado
também não era clicável; desde 2026-08-20 ele vai para a página de configurações como os demais estados visíveis.)

## Testes

Seguindo o AGENTS.md «escreva os testes antes do código»:

1. **`cuaComposerEntryState.test.ts`（principal, 23 casos）**: matriz de derivação de estado. Plataforma (mac/win/outros) ×
   interruptor de ocultação × estado do plugin (disabled/toggling/enabled/error) × estado de permissão (granted/denied/stale/sonda não aprovada/
   unavailable/não retornado) × busy, com asserção por combinação de `{visible, uiState, tone, spinning, tooltipMessageId,
   clickAction, interactionDisabled}`; um dos casos percorre todos os 5 estados para travar «tudo é clicável exceto session-busy»,
   impedindo que a lista de estados clicáveis seja reintroduzida
2. **`useCuaComposerEntry.test.ts`**: fatos de integração. O núcleo é a restrição de custo «nenhuma consulta de permissão quando o plugin está desabilitado / a lista ainda não carregou / está oculto pela página de
   configurações», além de workspace remoto e sessão remota não renderizando, clique navegando, e o travamento
  respectivamente de canStop, active input do runtime e task index running, bem como o destravamento por task index terminal
3. **`v4ComposerCuaEntry.test.ts`（7 casos）**: mapeamento fiel da camada de exibição ao view — não renderizar quando invisível, atributos data,
   tooltip acompanhando, `clickAction` decidindo se dispara onActivate, estado desabilitado sem responder ao clique mas preservando DOM com hover,
   e a fronteira responsiva `@2xl/composer` de Computer Use
4. **`computerUseComposerEntrySetting.test.ts`（5 casos）**: exibição padrão do interruptor da página de configurações, gravação de true/false e
   rollback em caso de falha de gravação

**sem E2E**: a verdade do botão depende do TCC do macOS e do estado do processo do Helper, e não é possível extrair asserções significativas em contêineres de CI; só seria
possível verificar o caso trivial «não renderizar». Reavaliar depois que `capability-changed` e a cadeia de cota estiverem implementados e o comportamento puder ser construído em contêiner.

## Superfície de Impacto Multiplataforma

- **Desktop mac/win com workspace local**: novo botão, caminho principal
- **Workspace remoto no desktop (SSH/WSL/Docker)**: `isRemoteWorkspaceIdentity` atingido → não renderiza
- **`/remote` no celular**: restrição de proteção do controle remoto → não renderiza
- **Web comum**: o gate de plataforma não passa → não renderiza
- **Linux local**: o Host de produto ainda não foi conectado → não renderiza

Não toca no fluxo de mensagens realtime de session / task, não envolve a fronteira `clientMode` / `deliveryKind` e não altera a
cadeia owner / lease / snapshot. ② é uma consulta somente leitura de host RPC já existente e ③ é uma leitura de store local do renderer.

## Alteração de 2026-09-11: Controle de Computador Desligado por Padrão

Uma decisão de produto reverteu o Controle de Computador (CUA) de «ligado por padrão no primeiro uso» para «desligado por padrão, o
usuário liga explicitamente na página de configurações». Os três pontos afetados neste design:

1. **Estado padrão do plugin**: `official-plugin-definitions.ts` não declara mais `defaultEnabled` para computer-use, e a
   lista padrão de habilitação em `packages/shared/src/plugin-marketplaces.ts` remove a entrada correspondente (o teste unitário de
   bootstrap compara mecanicamente as duas listas). A expressão de determinação é `enabledPlugins[id] ?? defaultEnabled`, portanto usuários que já
   ligaram manualmente na página de configurações já têm `true` gravado em disco e não são afetados; usuários que nunca
   alternaram passam a estar desligados.

2. **Acréscimo do gate de plugin à visibilidade**: não habilitado já não renderiza o botão, em vez de renderizar um ponto cinza como chamariz de aquisição. Na semântica de desligado por padrão, esse
   ponto cinza equivale a colocar um espaço de promoção permanente na frente de cada novo usuário; e, quando o usuário desliga o Controle de Computador na página de configurações, o botão continua lá e parece que não
   desligou direito. A exceção é `pluginToggling`: durante o toggle, `pluginEnabled` ainda é o valor antigo de antes da troca, e barrá-lo
   junto transformaria o spinner de «启用中» em um vão vazio.

3. **Remoção do estado de UI `plugin-disabled` / «未启用»**: depois do gate, esse estado é inalcançável (a única combinação não habilitada que
   passa pelo gate é toggling, e toggling retorna `starting` primeiro), e o texto `chat.toolbar.computerUse.tooltip.disabled`
   é removido junto, evitando deixar branches inalcançáveis e textos órfãos. Os estados de UI externos caem de 5 para 4.

Ajuste anexo na página de configurações: quando o Controle de Computador está desligado, o interruptor «在输入框显示电脑操作按钮» fica
esmaecido e a descrição passa a ser
`settings.computerUse.composerEntry.requiresEnabled` («需先开启电脑控制…»). Do contrário, ele seria um
interruptor clicável e gravável cujo botão nunca aparece, e o usuário apenas concluiria que o interruptor quebrou.