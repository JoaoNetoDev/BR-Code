# Design do aviso de operação no topo no Windows CUA

> **Parcialmente substituído (2026-09-14)**: a **decisão de disparo** e o **timer de segurança de 10 segundos** deste documento mudaram.
> O disparo não é mais "cada `tool-started` de ferramenta oficial do CUA" — depois da refatoração de node_repl + SDK, a chamada de ferramenta em nível de ação deixou de existir, e agora a decisão é por célula (o fato booleano de sideband `computerUse`, com âncora na frase de inicialização `setupComputerUseRuntime`); o timer de segurança foi ampliado de 10 para 30 segundos e explicitamente rebaixado a fallback, sendo os caminhos de limpeza explícitos, como o estado terminal do turn, que lideram o ocultamento. A forma da janela, os textos, a posição, o clique atravessante,
> a agregação `host source + cuaTurnKey` e a semântica de múltiplas janelas permanecem inalterados.
> Ver `docs/cua/2026-09-14-windows-cua-indicator-repair-spec.md`.

## Contexto e objetivo

Quando usuários de Windows observam ou operam a área de trabalho pelo Computer Use dentro do ZCode, hoje só é possível saber se ainda há execução em andamento olhando o cartão de ferramenta da sessão e o resultado da operação. Quando a janela do ZCode fica coberta por outros aplicativos, essas informações ficam invisíveis e o usuário não consegue confirmar continuamente se a máquina ainda está sendo operada pelo Agent.

Esta funcionalidade exibe no topo da área de trabalho do Windows um aviso leve que não rouba o foco e é atravessante por cliques:

> O ZCode está operando o computador

O aviso aparece quando um turn começa realmente a executar pela primeira vez uma ferramenta oficial do Computer Use, e desaparece quando esse turn termina ou quando o link de controle é encerrado anormalmente. Ele não oferece botões de pausar, parar ou assumir o controle; essas capacidades de controle estão fora do escopo desta vez.

## Escolhas de design

- O estado ativo é mantido por `session_id + turn_id`: a primeira chamada de ferramenta do Computer Use de um novo turn dispara o aviso; quando um novo turn substitui o antigo, o antigo é encerrado primeiro; `end_turn`, fechamento de pipe/socket e dispose encerram o turn ativo.
- O aviso é hospedado por uma janela de overlay de desktop independente e não depende da árvore React da janela principal.
- Picture-in-Picture é exclusivo do macOS e não serve de base para a implementação do Windows; a visibilidade é consolidada no nível de disparo da ferramenta CUA.

## Escopo

### Incluído

- Computer Use desktop-local do Windows.
- Computer Use na própria máquina iniciado diretamente pela janela do desktop, ou iniciado pelo `/remote` do celular reutilizando o mesmo Host desktop-local.
- O aviso não interativo de operação no topo da tela atual.
- Textos em chinês e inglês, tema claro/escuro, DPI, múltiplos monitores e reduced-motion.
- Encerramento nos estados terminais de sucesso, falha, parada, fechamento de sessão, restart de runtime, saída do Host e saída do aplicativo.

### Não incluído

- PiP ou modo de background no macOS.
- Aviso no topo do Linux.
- Renderização do aviso pelo próprio Web/celular.
- Botões interativos como pausar, parar ou assumir manualmente o controle.
- Imagem ao vivo, lista de passos, título da janela alvo ou texto por ação.
- Modificação do broker/protocolo wire nativo do `zcode-cua`.

## Princípios de design

1. **A CLI fornece o ciclo de vida autoritativo e o Host possui o estado de projeção de desktop.** A CLI envia notificações de bypass temporárias e enxutas a partir dos eventos brutos do runtime; o Host mantém o turn ativo, e o Main apenas consome o estado projetado reportado pelo Host e gerencia a janela nativa, sem adivinhar a partir do cartão de ferramenta ou do DOM do Renderer.
2. **Disparo em nível de ferramenta + exibição limitada.** Cada `tool-started` real de ferramenta CUA redispara o aviso e estende o prazo de visibilidade em 10 segundos; a janela nativa não é recriada durante a mesma chamada de ferramenta. Sem ferramentas CUA seguintes, o aviso fica no máximo 10 segundos após o disparo mais recente.
3. **Disparo por ferramenta CUA real.** Turnos comuns de Agent e ferramentas MCP comuns não exibem o aviso.
4. **fail closed para oculto.** Quando o ciclo de vida do Host/runtime é interrompido, o registro ativo correspondente precisa ser removido, sem deixar overlay permanente.
5. **Não entra na captura.** O overlay precisa habilitar a exclusão de captura do Windows, evitando ser devolvido ao modelo pela captura do CUA.
6. **Hífen em todo o fluxo.** O código novo apenas gera e verifica a identidade canônica oficial `computer-use`, sem criar nenhuma cadeia de nomenclatura `computer_use`.
7. **Não depende de assinatura de projeção de conversation.** As notificações do ciclo de vida do CUA não podem ser afetadas pelo `deliveryKind` do antigo `session/event` nem pela existência de uma subscription de conversation do v4, e também não podem entrar em snapshot, replay, conversation frame ou fluxo de eventos persistido.

## Estado e temporização

### Chave autoritativa

Dentro do Host, a seguinte chave isola um turn CUA ativo:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
cuaTurnKey   = workspaceKey + NUL + sessionId + NUL + turnId
```

Exceto `session-closed`, as notificações de ciclo de vida carregam o `turnId` bruto do runtime; `tool-started` permite compatibilidade com eventos de runtime sem `turnId`. Nesse caso o tracker usa o turnId do `turn-started` mais recente recebido daquela session; quando ambos faltam, o aviso não é ativado, evitando espalhar um estado de origem desconhecida para outras sessions.

O tracker também mantém o watermark monotônico de `sequenceNumber` da session, os `eventId` já processados e um conjunto limitado de turns aposentados. Eventos atrasados abaixo do watermark já processado, eventos duplicados, eventos posteriores de um turn já substituído por um novo ou já em estado terminal são todos ignorados, evitando retrocesso do turn antigo ou reativação do aviso depois do estado terminal. A limpeza de runtime/workspace limpa também esses índices temporários. As notificações de bypass são a única fonte de eventos de protocolo do tracker e não se misturam ao domínio de numeração independente do antigo `session/event`.

### Fluxo de eventos

```text
CLI runtime              CLI protocol sideband       Host tracker           Desktop Main       Overlay
    | turn_started              |                         |                       |                 |
    |-------------------------->| computer-use/           |                       |                 |
    |                           | operation-event         |                       |                 |
    |                           |------------------------>| remember turn         |                 |
    |                           |                         |                       |                 |
    | tool_call_scheduled       |                         |                       |                 |
    |-------------------------->|------------------------>| remember id/name      |                 |
    | tool_call_started         |                         |                       |                 |
    |-------------------------->|------------------------>| each CUA tool        |                 |
    |                           |                         |-- active(turnKey) --->| add key         |
    |                           |                         |                       |-- show -------->|
    | ... more CUA tools ...    |------------------------>| refresh deadline      | extend 10s      |
    | turn_complete/error       |                         |                       |                 |
    |-------------------------->|------------------------>|-- inactive(turnKey) ->| remove key      |
    |                           |                         |                       |-- hide -------->|

v4 conversation frame -----------------------------------------------> Renderer（既有链路，不参与提示状态）
旧 session/event（无 deliveryKind 时不存在）--------------------------X Host tracker
```

### Regras de disparo

`tool-scheduled` serve para estabelecer o mapeamento `toolCallId -> toolName`; só `tool-started` ativa ou refresca o aviso. Como o `toolName` no payload de started do runtime é um campo opcional, o tracker lê primeiro o nome que veio no próprio started e depois recorre ao mapeamento do scheduled. A CLI envia apenas o nome da ferramenta e o identificador da chamada, sem tool input, tool result, texto do modelo ou conteúdo de captura de tela.

Escopo de reconhecimento:

- Aceita o nome canônico oficial `mcp__computer-use__*` e os nomes de ferramenta `computer-use` com o namespace do plugin oficial;
- Captura de tela, leitura de estado de aplicativo, clique, rolagem, arrastar, teclado, digitação e abrir aplicativo ativam;
- `wait` e `request_access` não ativam, porque não representam estar observando ou operando a área de trabalho;
- `stop_computer_control` não ativa e, quando seu `tool-started` chega, limpa imediatamente o turn CUA atualmente ativo daquela session.

### Regras de encerramento

Os seguintes eventos removem a chave ativa correspondente:

- `turn-completed`
- `turn-failed`
- `session-closed`
- started de `stop_computer_control`
- 10 segundos sem um novo disparo de ferramenta CUA após o último `tool-started` de CUA
- restart/dispose do runtime do workspace
- saída do processo do Host
- saída do app do ZCode

A CLI não envia notificação de bypass para um `tool_call_result|tool_call_error` isolado. O resultado da ferramenta não oculta o aviso ativamente; o aviso é consolidado pelo timer de segurança de 10 segundos após o último `tool-started` de CUA, e ferramentas CUA seguintes reiniciam a contagem. Assim não há piscada entre ferramentas consecutivas nem resíduo permanente por falha de ferramenta ou perda de notificação terminal.

O Main mantém o conjunto por `host source + cuaTurnKey` e, para cada chave ativa, o prazo de 10 segundos do último disparo de ferramenta CUA. O aviso é exibido enquanto o conjunto não está vazio e só é ocultado depois que um estado terminal ou o timer limpa a última chave, cobrindo assim múltiplas janelas e sessions paralelas.

As notificações de bypass da CLI e o Reporter são bypass de projeção de desktop best-effort. Falhas na construção da notificação, races no fechamento do MessagePort do Host ou exceções no reporte só podem registrar `warn` e nunca podem truncar frames de conversation do v4, notificações de protocolo comuns ou a execução da ferramenta CUA.

## Fronteiras de componente

### App ↔ Agent: `computer-use/operation-event`

Nova notificação unidirecional com validação estrita em `packages/shared/src/zcode-protocol/index.ts`, cujo method é fixado como `computer-use/operation-event`. `computer-use` e `operation-event` usam hífen em todas as partes. O payload é a seguinte união discriminada:

```ts
type ZCodeComputerUseOperationEvent =
  | {
      kind: "turn-started" | "turn-completed" | "turn-failed";
      eventId: string;
      sequenceNumber: number;
      sessionId: string;
      turnId: string;
      timestamp: number;
    }
  | {
      kind: "tool-scheduled";
      eventId: string;
      sequenceNumber: number;
      sessionId: string;
      turnId: string;
      timestamp: number;
      toolCallId: string;
      toolName: string;
    }
  | {
      kind: "tool-started";
      eventId: string;
      sequenceNumber: number;
      sessionId: string;
      turnId?: string;
      timestamp: number;
      toolCallId: string;
      toolName?: string;
    }
  | {
      kind: "session-closed";
      eventId: string;
      sequenceNumber: number;
      sessionId: string;
      timestamp: number;
    };
```

Na entrada `onSessionEvent` do runtime da CLI, antes de qualquer julgamento de `record.deliveryKind`, `TurnStarted`, `ToolCallScheduled`, `ToolCallStarted`, `TurnComplete`, `TurnError` e `SessionEnded` são mapeados para a notificação acima. A notificação preserva o `eventId` e o `sequenceNumber` brutos do runtime, permitindo lacunas de sequência mas exigindo monotonicidade; não envia notificação para streaming comum, progress/result de ferramenta ou conteúdo do modelo.

Essa notificação é enviada apenas pela conexão stdio App ↔ Agent que já existe. Ela não cria um novo Agent runtime, não escreve no event store e não entra em topic do v4, snapshot, recuperação replayable nem no estado de negócio do relay remoto. Quando um Agent antigo não suporta essa notificação, o aviso do Windows permanece oculto, sem recorrer a adivinhação pelo Renderer/DOM.

### Services: `CuaOperationTurnTracker`

Responsabilidades:

- Consumir as notificações temporárias de ciclo de vida já validadas por `zcodeComputerUseOperationEventSchema`;
- Manter o turn atual, o nome da ferramenta e o turn CUA ativo;
- Chamar o reporter apenas nas transições inactive → active ou active → inactive;
- Limpar todo o estado relacionado em dispose de workspace/runtime;
- Enviar as notificações de ciclo de vida apenas para log `debug`, podendo usar `info` nas transições de estado.

Ele não depende de UI, Electron ou de uma implementação específica de Helper.

Depois de validar `computer-use/operation-event`, `ZCodeAgentService.wireClient` a repassa direto para o tracker. O `session/event` existente continua servindo consumidores do protocolo antigo, mas deixa de ser entrada do tracker de CUA, evitando que o `sequenceNumber` bruto e o `seq` da projeção de protocolo se sobrescrevam mutuamente.

### Mensagem de Host → Main

Nova mensagem unidirecional com schema estrito:

```ts
type HostCuaOperationStateResponse = {
  type: "cua-operation-state";
  active: boolean;
  sessionId: string;
  turnId: string;
  workspacePath: string;
  workspaceIdentity?: string;
};
```

Apenas o Host com `serviceAuthorityMode="desktop-local"` monta o reporter. Host de workspace remoto, server e Web comum não enviam essa mensagem. Quando o `/remote` do celular reutiliza o Host desktop-local, o aviso ainda é disparado na tela física do Windows, mas o Renderer do celular não cria uma segunda cópia do aviso.

### Desktop Main: `WindowsCuaOperationIndicator`

Responsabilidades:

- Agregar as chaves ativas de diferentes Hosts/janelas;
- Criar preguiçosamente um `BrowserWindow` leve;
- Atualizar textos e paleta conforme o locale/tema atual do app;
- Quando um novo round muda o conjunto de vazio para não vazio, posicionar centralizado no topo da work area do display onde o mouse está;
- Destruir a janela no app quit.

O Main não interpreta `tool.updated`, não mantém estado de negócio de session e não escreve de volta para Host/Agent.

## Visual e atributos de janela do overlay no Windows

Visual padrão:

- Texto: em chinês `ZCode 正在操作电脑`; em inglês `ZCode is controlling your computer`;
- Espaçamento superior: a borda superior do cartão visível fica `12px` abaixo da borda superior da work area;
- Altura do cartão visível mantida em `38px`; as larguras em chinês/inglês são mantidas em `234px`/`308px`;
- A janela transparente reserva uma área segura de sombra fora do cartão, de `8px` à esquerda/direita, `6px` acima e `12px` abaixo, de modo que a janela em chinês/inglês mede `250px × 56px`/`324px × 56px`; a própria janela é deslocada `6px` para cima, garantindo que a posição do cartão visível não mude após a ampliação da tela;
- Container: raio de canto compacto, fundo e borda com semântica de popover; usa apenas uma sombra discreta de duas camadas desenhada em CSS, sem sombra nativa de janela do Windows;
- À esquerda usa uma animação de respiração de três pontos de baixo contraste, sem adicionar ilustração de marca;
- Entrada: `opacity 0 -> 1`, `translateY(-6px) -> 0`, `140ms`;
- Saída: animação inversa, `120ms`;
- Com `prefers-reduced-motion: reduce`, o deslocamento e a animação em loop são cancelados, mantendo apenas mostrar/ocultar direto.

Restrições da janela:

```ts
{
  alwaysOnTop: true,
  focusable: false,
  frame: false,
  resizable: false,
  show: false,
  skipTaskbar: true,
  transparent: true,
  hasShadow: false,
}
```

### Camada de always-on-top e reuso após ocultamento

O `alwaysOnTop: true` nos parâmetros de construção do `BrowserWindow` só garante o pedido de topo na primeira criação. No Windows, depois de executar `hide()` em uma janela transparente, o `WS_EX_TOPMOST` nativo pode ser removido; chamar apenas `showInactive()` depois disso só recupera a visibilidade e não garante recuperar o Z-order, de modo que uma janela comum em primeiro plano pode cobrir a barra de aviso.

Toda exibição de janela precisa executar a mesma cadeia de topo sem foco, inclusive a exibição após o primeiro `loadURL` concluído e o reuso da janela oculta por um turn posterior:

```text
showInactive()
      |
      v
setAlwaysOnTop(true, "screen-saver")
      |
      v
moveTop()
```

- `showInactive()` preserva o foco de teclado do app de destino;
- A camada `screen-saver` mantém a barra de aviso acima de janelas comuns, da barra de tarefas do sistema e de janelas fullscreen comuns;
- `moveTop()` move a janela para a frente da camada atual sem ativá-la;
- Essas chamadas não alteram a travessia do mouse, a ocultação na barra de tarefas nem a exclusão de captura;
- A área de segurança do Windows (por exemplo UAC), a tela de bloqueio e alguns programas fullscreen exclusivos não estão no alcance de cobertura de janelas de aplicativo, e a barra de aviso não promete aparecer acima dessas superfícies do sistema.

### Propriedade da sombra e fronteira de recorte

A implementação antiga colocava o cartão de `234px × 38px` em uma janela transparente de `236px × 40px`, com apenas `1px` de folga em volta, mas a sombra CSS era `0 4px 12px rgba(..., 0.20)`. A sombra CSS era portanto recortada pelo limite da janela e, ao mesmo tempo, `BrowserWindow.hasShadow` fica ligado por padrão, fazendo o DWM desenhar uma segunda camada de sombra nativa retangular. O resultado visual era a borda dura do fundo do cartão somada a uma faixa cinza retangular larga, em vez de uma difusão natural ao longo dos cantos arredondados.

Depois da correção, o dono da sombra pode ser apenas um:

- `BrowserWindow` define `hasShadow: false` explicitamente, proibindo o DWM de desenhar a sombra retangular;
- `body` usa `padding: 6px 8px 12px` para fornecer a área segura transparente, e `.indicator` ocupa todo o content box;
- A sombra clara usa `0 1px 2px rgba(15, 23, 42, 0.08), 0 6px 12px -6px rgba(15, 23, 42, 0.18)`;
- A sombra escura usa `0 1px 2px rgba(0, 0, 0, 0.18), 0 6px 12px -6px rgba(0, 0, 0, 0.28)`;
- A sombra, a borda e a área segura transparente ficam todas dentro do BrowserWindow com captura excluída, sem alterar a travessia do mouse, o foco ou a semântica de exclusão de captura.

Após a criação, é obrigatório chamar:

```ts
window.setIgnoreMouseEvents(true);
window.setContentProtection(true);
```

O overlay não pode se tornar a key/focused window, não bloqueia o mouse, não aparece no Alt+Tab nem na barra de tarefas, e também não aparece nas capturas de tela do sistema nem no WGC capture do Windows 10 2004+.

## Tratamento de exceções e invariantes

- Quando o Host envia active/inactive repetidos, precisa ser idempotente.
- Uma chave inactive desconhecida é ignorada diretamente.
- Quando um Host sai, o Main limpa todas as chaves daquele Host e não pode depender de o Host ter enviado inactive com sucesso antes de sair.
- Falha na criação do BrowserWindow, na configuração dos atributos de segurança ou no loadURL registra apenas warn e não pode afetar a execução da ferramenta CUA; falha síncrona de criação/configuração faz fail-hidden e, dentro do epoch ativo atual, permite no máximo um retry automático, proibindo formar um laço de retry.
- Depois que a janela de overlay é fechada inesperadamente pelo sistema, o conjunto ativo é mantido; o Main agenda imediatamente um reconcile no callback `closed` e recria a janela quando o conjunto não está vazio, evitando esperar pela próxima mensagem de estado do Host.
- Cada disparo de ferramenta CUA define um prazo de segurança de 10 segundos; disparos posteriores estendem o prazo daquela chave. Um turno longo legítimo pode continuar rodando, mas sem um novo disparo de ferramenta CUA o aviso aparece por no máximo 10 segundos.
- O estado `continuous` do desktop e `replayable` do celular não entra nessa máquina de estado de UI; ela só consome as notificações temporárias de ciclo de vida recebidas pelo Host local, não persiste, não entra em snapshot e não é transmitido para a Web. O `/remote` do celular pode disparar o mesmo aviso físico do Windows ao reutilizar o Host local pelo shared-host attachment, mas o relay e o celular não são donos desse estado.
- `workspaceIdentity` serve apenas para isolamento de identidade, enquanto `workspacePath` continua sendo usado para a semântica de caminho; é proibido misturar os dois.

## Estratégia de testes

### Testes de protocolo Shared/CLI

- O schema aceita os seis payloads legítimos de ciclo de vida e rejeita id vazio, sequência negativa, campos obrigatórios de turn/tool ausentes e kind desconhecido.
- A CLI continua enviando a notificação de bypass com `record.deliveryKind` não definido e apenas com subscription do v4 presente.
- Só projeta turn start/terminal e tool scheduled/started; não vaza input, result, texto do modelo nem captura de tela.
- Um erro no notify do sideband registra apenas um aviso e não bloqueia os frames do v4 existentes nem a execução da ferramenta.

### Testes unitários de Services

- Turnos comuns e ferramentas MCP comuns não ativam.
- `tool-scheduled` registra o nome e `tool-started` ativa o `computer-use` canônico.
- Cada `tool-started` de CUA canônico envia uma vez um refresh de active para o Main, para o overlay reiniciar o timer de 10 segundos; `eventId` repetido ainda precisa ser deduplicado.
- Com toolName no próprio started, não depende do scheduled.
- Várias ferramentas CUA no mesmo turno reportam o refresh de active separadamente, sem recriar a janela nativa.
- Result/error de ferramenta não oculta.
- Turn completed/failed reportam inactive uma vez cada.
- Fechamento de sessão, ferramenta de parada e limpeza de runtime/workspace limpam o estado.
- Sem um turnId determinável, não ativa.
- Múltiplas sessions, múltiplos workspaces e o fallback de `workspaceIdentity` ficam isolados entre si.
- Um `turn-started` atrasado com `sequenceNumber` baixo não pode substituir o turn atual, e eventos de ferramenta atrasados de um turn terminal/aposentado não podem ressuscitar o aviso.
- `eventId` repetido não pode produzir transições duplicadas.
- Um erro do Reporter não pode afetar a máquina de estado nem a entrega dos eventos principais do v4/protocolo.
- `unavailable` do runtime (protocolo fechado, processo crashed, request com timeout) precisa limpar o estado ativo do tracker do workspace correspondente, mesmo sem um restart de runtime posterior.

### Testes unitários Shared/Host

- Os schemas `computer-use/operation-event` e `cua-operation-state` aceitam payloads legíveis completos.
- Rejeitam sessionId/turnId ausente, active inválido ou workspacePath vazio.
- Apenas o Host local injeta o reporter; workspace remoto não reporta.

### Testes unitários do Desktop Main

- O primeiro active cria e exibe a janela.
- Active repetido é idempotente.
- Agregação de múltiplos Hosts/turns, e somente o último inactive oculta.
- A saída de um Host limpa todas as suas chaves ativas.
- A janela tem always-on-top, foco impossível, barra de tarefas oculta, travessia de mouse e content protection.
- Tanto a primeira exibição quanto o reuso após ocultação restauram o topo em nível de sistema na ordem `showInactive -> setAlwaysOnTop(true, "screen-saver") -> moveTop`, sem ativar a janela.
- A janela desliga explicitamente o `hasShadow` nativo, a tela transparente tem a área segura de `6px 8px 12px` e a sombra CSS não é mais recortada pelo limite da janela no estado estável.
- Posicionamento centralizado no topo da work area do display onde está o mouse, respeitando as coordenadas de DPI.
- Após ampliar a tela transparente, o cartão visível mantém o tamanho original e sua borda superior continua em `+12px` da work area.
- Cada vez que a agregação muda de vazio para não vazio, o reposicionamento pelo display atual do mouse acontece de novo; a entrada de uma source paralela não salta de tela.
- Cada refresh de active estende o timer de segurança da chave correspondente para 10 segundos; quando o timer expira, a chave precisa ser ocultada mesmo sem inactive, e uma ferramenta CUA seguinte pode exibir de novo.
- Exceção na criação da janela ou na configuração dos atributos de segurança faz fail-hidden, com apenas um retry limitado.
- Atualização de locale/tema refresca o conteúdo sem roubar o foco de novo.

### Verificação em runtime no Windows

1. Iniciar a versão de desenvolvimento do ZCode e abrir o Bloco de Notas em primeiro plano.
2. Iniciar um turno de CUA contendo captura de tela, clique e digitação.
3. Observar o aviso aparecendo depois que a primeira ferramenta CUA começa e sem piscar durante operações consecutivas.
4. Verificar que o app alvo mantém o foco o tempo todo e que o aviso não é clicável.
5. Verificar que a captura de tela do CUA não contém o aviso.
6. Verificar separadamente o comportamento de ocultamento após sucesso, falha de ferramenta, Stop, fechamento de task, restart do Host e saída do app.
7. Em dois monitores, iniciar um novo turno a partir de cada um dos monitores e verificar o posicionamento no display em que o mouse estava no momento.
8. Observar a sombra ao redor dos cantos em fundos claro e escuro e confirmar que não há faixa cinza retangular do DWM, borda com recorte duro nem sombra dupla.
9. Verificar que o aviso se oculta sozinho 10 segundos após um único disparo de ferramenta CUA e que um disparo posterior dentro desses 10 segundos reinicia a contagem.
10. Verificar que, com o processo do Agent crashed, o protocolo fechado e o request em timeout e sem restart de runtime, o aviso se oculta em no máximo 10 segundos e o tracker não fica com resíduo.

## Atualização de documentos e do mapa de capacidades

Atualizar junto com a implementação:

- `docs/product-capability-map-office-computer-use.md`: remover a descrição antiga de que o CUA do Windows ainda não foi resolvido;
- `surface.computer-use-task-experience` no capability graph: acrescentar o producer/consumer do indicador de operação de desktop do Windows;
- A cadeia de estados no mapa de capacidades passa a ser `CLI runtime lifecycle -> computer-use/operation-event -> desktop-local Host tracker -> cua-operation-state -> Desktop Main overlay`;
- O controle/takeover live dedicado continua como planned; aqui só se acrescenta um aviso de estado somente leitura, sem alegar que o takeover já é suportado.

## Critérios de aceite

- Depois que a primeira ferramenta real do Computer Use de um turno de CUA do Windows começa, o aviso no topo fica visível.
- Cada disparo real de ferramenta CUA exibe ou refresca o aviso; ferramentas consecutivas não piscam, o aviso desaparece sozinho 10 segundos após o disparo mais recente, e o estado terminal do turno pode consolidar antes.
- O comportamento é o mesmo quando se usa apenas conversation do v4, sem assinatura do antigo `session/event`.
- Turnos comuns de Agent/MCP nunca exibem o aviso.
- O aviso não rouba o foco, não bloqueia a entrada e não entra na captura do CUA.
- O tamanho e a posição do cartão do topo não mudam, a sombra é desenhada apenas por CSS e não aparece sombra retangular do sistema nem recorte no estado estável.
- Múltiplas janelas e múltiplas sessions não causam ocultamento prematuro nem resíduo permanente.
- A semântica de macOS, Linux, Web, celular replayable e o comportamento existente de Helper/PiP permanecem inalterados.
- Os testes direcionados, `pnpm typecheck` e `pnpm lint` passam todos.