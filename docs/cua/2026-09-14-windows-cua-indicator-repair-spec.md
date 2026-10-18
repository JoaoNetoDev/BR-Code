# Spec de correção do indicador de operação CUA no Windows

## Status

Accepted (2026-09-14)

## Objetivo

A barra de aviso no topo do Windows (`ZCode 正在操作电脑` / `ZCode is controlling your computer`) fica visível enquanto o modelo usa
Computer Use e **pode ser fechada em qualquer situação**.

O indicador permanece no lado desktop main (`windowsCuaOperationIndicator.ts`, implementação existente de 2026-08-04);
apenas a trecho da cadeia de decisão quebrado pela refatoração do SDK é corrigido.

Esta spec não altera: a superfície de ferramentas visível ao modelo, a forma do SDK, o protocolo do broker,
o ciclo de vida e o modelo de processo do Helper, o comportamento de PiP no macOS. O producer do zcode-cua fica com
**zero mudanças**, portanto não é necessário subir o pin.

## Por que está quebrado hoje

`bootstrap/src/zcode-protocol/computer-use-operation-event.ts` usa regex para extrair o nome da chamada do SDK
a partir do `input.code` de `mcp__node_repl__js`, e depois compara com a tabela de verbos de ação
(`CUA_SDK_ACTIONS` do tracker). Depois da refatoração do node_repl nenhuma forma real de chamada casa:

| Forma que o modelo realmente escreve (SKILL.md) | Resultado do regex |
| --- | --- |
| `agent.computerUse.getApp("Notes")` | `getApp` (não está no conjunto de ações; o método de fachada é camelCase) |
| `app.click(42)` / `app.typeText(…)` / `app.pressKey(…)` | não casa (o nome da variável é `app`) |
| `agent.computerUse.computer.left_click({…})` | não casa (após `computer` vem `.` e não `(`) |

O único que casa, `agent.computerUse.left_click(…)`, não existe nem no SDK nem na documentação, e aparece somente
na fixture de `bootstrap/tests/computer-use-operation-event.test.ts` — esse teste foi **falso verde** por muito tempo.

Some-se a isso um defeito de granularidade: uma cell pode conter várias ações, mas o agente só enxerga uma tool call, portanto
`AUTO_HIDE_MS = 10_000` não é renovado dentro de uma única cell, e quando a cell passa de 10 segundos a barra apaga
enquanto o computador ainda está sendo operado.

## Design: um único fato booleano

A decisão converge para uma frase — **esta cell está usando Computer Use** — sem se importar mais com qual ação ela está executando.

```
bootstrap  mapComputerUseOperationEvent
  └─ tool-scheduled: code.includes("setupComputerUseRuntime") → { computerUse: true }
        │  sideband (canal existente, nenhum kind novo)
        ▼
services   cuaOperationTurnTracker
  └─ registra o fato no agendamento → honrado no tool-started → reporter
        │  canal host→main existente
        ▼
desktop    windowsCuaOperationIndicator (implementação existente, só ajusta o prazo de fallback)
```

### Por que a âncora é `setupComputerUseRuntime`

Ela é a instrução de bootstrap que o modelo **precisa copiar literalmente**, e isso é uma imposição da arquitetura, não uma
recomendação frouxa da documentação: cada cell do node_repl é um Worker novo e o binding do SDK não atravessa cells, então a
documentação da face do modelo diz que «The first executable statement of every CUA cell must be this bootstrap, and the
bootstrap and the actions must be in the **same** cell» (`zcode-cua-plugin/docs/computer-use.md:25`, `skills/computer-use/SKILL.md`).
Toda cell que usa CUA necessariamente contém essa frase.

Ela também traz proteção de regressão embutida: `zcode-cua-plugin/tests/skill-sync.node-test.mjs` fixa o padrão
`setupComputerUseRuntime({ globals: globalThis })` dentro do SKILL.md, então se a instrução de bootstrap for reescrita o teste fica vermelho.
Exatamente essa camada é o que faltava no regex antigo — ele ancorava em algo que evolui junto com a superfície de ações do SDK,
e ninguém fixava esse ponto.

Browser Use (`agent.browsers.*`) não contém esse bootstrap, então não casa.

### Por que o fato fica preso apenas ao `tool-scheduled`

`ToolCallStartedPayload` não tem campo `input` (`contracts/src/events/session.events.ts:633`),
então no start já não é possível obter o código do modelo; logo, "é CUA ou não" só pode ser decidido no agendamento.

Mas o overlay só acende no `tool-started`: entre o agendamento e o início da execução pode haver uma espera por aprovação de
permissão, momento em que ainda ninguém está operando o computador. Por isso o tracker guarda o fato no agendamento em
`computerUseScheduledCalls` (chave `turnKey\0toolCallId`), e o `tool-started` honra e consome esse registro.

Quando falta o evento de agendamento (por exemplo, porque ele foi descartado por falta de `turnId`) não há ativação — o lado
da falha é **não acender**, não acender por engano.

## Caminhos de fechamento

Há uma única entrada de exibição e seis de fechamento; qualquer um deles encerra:

| Gatilho | Local |
| --- | --- |
| `turn-completed` / `turn-failed` | tracker `clearTurn` → reporter `active:false` |
| `session-closed` | tracker `clearSession` |
| Um novo turno substitui o antigo | tracker `retireTurn` + `clearSession` |
| Workspace fechado / runtime indisponível | `clearWorkspaceKey` / `clearSource` |
| Saída do aplicativo | `dispose()` destrói a janela |
| Todas as promessas acima falharem | Timer de fallback `AUTO_HIDE_MS` |

O prazo de fallback muda de `10_000` para `30_000`. A razão: o fato agora é reportado por cell, então cells posteriores no
mesmo turno renovam o timer, mas uma única cell em si pode rodar por muito tempo, e 10 segundos apagaria o overlay no meio da
operação; 30 segundos preserva ao mesmo tempo a garantia de que, mesmo sem ninguém fechando, ele sempre fecha.

Exceções do reporter e dos callbacks de fronteira são engolidas e registradas apenas como warn (`report` / `notifyBoundary`):
o caminho de exibição jamais pode truncar a cadeia principal de eventos da sessão. Reciprocamente, uma exceção no caminho de
**exibição** deixa o overlay apagado, e uma exceção no caminho de **ocultação** ainda deixa o timer de fallback encerrar.

### Ocultação imediata abandonada

A implementação antiga reconhecia o nome de ação `stop_computer_control` e ocultava imediatamente quando o modelo parava de
controlar ativamente. Com o fato booleano não se obtém o nome da ação, e esse atalho desaparece: se o modelo parar de controlar e
continuar trabalhando, o overlay permanece até o estado terminal do turno ou o fallback de 30 segundos. Esse é o preço de não
depender mais da tabela de verbos de ação em toda a cadeia, e o limite superior é finito.

## Código morto removido

- O regex `nodeReplComputerUseAction` e suas três fixtures de formas fictícias
- tracker: `CUA_SDK_ACTIONS`, `NON_OPERATING_ACTIONS`, `OFFICIAL_CUA_TOOL_PREFIXES`,
  `STOP_ACTION`, `resolveOfficialCuaAction`, `scheduledToolNameByCall`,
  `scheduledOperationActionByCall`
- protocolo: o campo `operationAction` de `tool-scheduled` / `tool-started`

O ramo do prefixo `mcp__computer-use__*` é removido no mesmo lote: o `zcode-cua-plugin` não registra mais nenhum MCP server
(`package.json`: a execução é fornecida pelo host node_repl compartilhado), a configuração antiga é descartada já no bootstrap
e o registro é proibido (`2026-08-24-cua-node-repl-sdk-migration-spec.md`, `cua-dev-mcp-runtime-assets.md`), e o tracker é
alimentado apenas pelo sideband ao vivo (`zcodeAgentService.ts:1910`), de modo que a leitura de transcripts históricos não chega até ele.

**Consumidores verificados** (2026-09-14): as referências a `ZCodeComputerUseOperationEvent` e
`zcodeComputerUseOperationEventSchema` aparecem em apenas três lugares — `packages/shared` (definição e seus
testes), `packages/services/src/zcode-agent/{zcodeAgentService,cuaOperationTurnTracker}.ts` e seus testes, e
`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/computer-use-operation-event.ts`.
UI, desktop main, web e demais pacotes não têm referência alguma, portanto `operationAction` não tem consumidor fora desta cadeia.

`toolName` / `toolCallId` são mantidos: o tracker precisa do `toolCallId` para parear agendamento e início.

## Aceitação

1. Teste unitário do bootstrap: a fixture passa a usar a instrução de bootstrap **real** do SKILL.md; não casam Browser Use puro,
   uma cell comum sem bootstrap e uma ferramenta que não é node_repl carregando o mesmo texto; `tool-started` nunca carrega esse fato.
2. Teste unitário do protocolo: `computerUse` só aceita `true` (`false` e nomes de ação são rejeitados); `tool-started` carregando
   `computerUse` é rejeitado pelo strict schema.
3. Teste unitário do tracker: apenas agendamento não ativa; cell node_repl sem `computerUse` não ativa; `tool-started` sem o fato
   de agendamento não ativa; múltiplas cells no mesmo turno renovam uma a uma; os cinco caminhos de limpeza (estado terminal do
   turno / `session-closed` / novo turno substituindo / `clearWorkspaceKey` / `clearAll`) valem individualmente; erro do reporter
   não afeta o processamento de eventos.
4. Teste unitário do indicador: o prazo de fallback é de 30 segundos e é recontado a cada ativação.
5. Zero ocorrências de `operationAction`, `CUA_SDK_ACTIONS` e `resolveOfficialCuaAction` em todo o `src` do repositório;
   nenhum teste afirma mais a inferência do nome da ação a partir do código do modelo.
6. Máquina real Windows: uma cell de CUA com várias ações e duração total acima de 10 segundos mantém a barra acesa do início ao fim;
   Browser Use e cell node_repl comum não exibem a barra; a barra some ao fim do turno; ao trocar o idioma do aplicativo o texto acompanha.

## Alternativa rejeitada: janela auto-hospedada pelo Helper

Em 2026-09-14 chegou-se a implementar, seguindo a estrutura do PiP do macOS, a ideia de "painel e fato-gatilho no mesmo processo
Helper": o ponto de disparo seria `dispatchRequest` (a única garganta de cada método do broker dentro do Helper), o escopo de turno
reaproveitaria `pip_session_event` e a janela usaria Electron `BrowserWindow`.

A fonte de fatos dessa abordagem é de fato mais confiável que o regex — ela está no próprio ponto de injeção. A razão para abandonar
foi que o custo é desproporcional ao objetivo desta rodada:

- O Helper do Windows é iniciado com `ELECTRON_RUN_AS_NODE=1`, e nesse modo não há API de janela. Para se livrar disso,
  o custo é mais 3 subprocessos Chromium por Helper.
- Seria preciso novo `indicator_set_presentation` (o texto só pode ser passado pelo host, não há i18n do lado Helper),
  a superfície de protocolo iria de 43 para 44 e, por convenção, `CUA_BROKER_IPC_VERSION` teria que subir de 2 para 3.
- Seria preciso escrever uma máquina de estados e uma janela dentro do Helper, entregar em dois repositórios e subir o pin do producer.
- As duas implementações não podem coexistir, e o indicador existente do lado desktop main teria de ser removido depois da aceitação em máquina real.

Do lado do zcode basta corrigir um único ponto de decisão, com zero mudança no producer. Os defeitos reais encontrados e já corrigidos durante
a duração da abordagem ficam registrados à parte: `windowsCuaDevHelperHost.ts` tinha `ELECTRON_RUN_AS_NODE: "1"` hardcoded **depois** de
`...commandEnv`, o que fazia `commandEnv` nunca conseguir sobrescrevê-lo — essa era a raiz de o indicador nunca aparecer nos testes em máquina real.

Dados medidos ficam arquivados (Windows 11 / Electron 41.0.3) e podem ser reutilizados diretamente caso a abordagem seja retomada:

| Item verificado | Resultado |
| --- | --- |
| Helper ready / RPC do broker / saída por `stop()` no modo Electron completo | 2 testes de integração passaram, exit 0 |
| `BrowserWindow` + `setAlwaysOnTop(_, "screen-saver")` + API `screen` | todos funcionais |
| Correspondência de `--socket <valor>` do `helperReaper` | exatamente 1 processo na linha de comando com esse valor; a reivindicação precisa não é afetada |
| Subprocessos Chromium (gpu/utility/renderer) após matar o Helper | os 3 saem com o pai, zero órfãos |

Vale observar também: não se pode usar a negação de `isReadOnlyBrokerMethod` como critério de disparo. Esse conjunto serve à decisão de
**soft timeout** (tudo que tem efeito colateral conta como ação) e o lado não somente-lectura mistura arbitragem de lease, prevenção de roubo de
foco e `pip_session_event` — este último é emitido uma vez a cada `turn-started`, e sua negação deixaria a barra permanentemente acesa.

## Migração e histórico

- 2026-08-04 `2026-08-04-windows-cua-operation-indicator-design.md` estabeleceu o indicador e o texto, com a implementação
  no desktop main.
- 2026-08-24 migração para node_repl + SDK, com o acordo de que o sideband carregaria o `operationAction` resolvido a partir do nome
  da chamada do SDK, implementada à época na forma plana `computerUse.<action>()`.
- 2026-09-13 `e2d7a9f2e9` remodelou o SDK para `getApp()` + objeto vinculado + escape hatch `computer.*`, com nomes de ação
  em fachada camelCase. O regex e `CUA_SDK_ACTIONS` não foram sincronizados e o indicador ficou sem funcionar a partir daí; como esse caminho
  não tem cobertura de typecheck (o diretório de testes não está no `include` de `packages/services/tsconfig.json`) e a fixture
  ficticiou as formas de chamada, o CI ficou verde durante todo o tempo.
- 2026-09-14 houve uma tentativa de "producer publica fatos em nível de ação + notificação MCP devolvida ao agent" (zcode-cua
  `4439fc8a`, revertido por `c0ad9f81`). Essa abordagem exigiria um novo canal entre processos, um novo kind de protocolo e uma fronteira
  de confiança; após revisar a estrutura do PiP confirmou-se que o painel pode ficar no mesmo processo Helper do fato, e todo esse caminho de retorno é desnecessário.
- 2026-09-14 a abordagem de janela auto-hospedada pelo Helper (acima) foi implementada e rejeitada; as mudanças do lado zcode-cua foram resetadas por completo.