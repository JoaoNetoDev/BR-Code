# Análise de estabilidade do controle remoto Web no celular

> Status: análise de contexto de estabilidade; alguns dos "riscos atuais" já foram corrigidos por implementações posteriores.
>
> A arquitetura vigente é shared-host attachment + fluxo de mensagens `continuous` do desktop / `replayable` do celular.
> A semântica específica de recuperação de mensagens é definida por `docs/web-remote-control/task-realtime-sync.md`
> e `docs/web-remote-control/web-remote-control-architecture.md`.

Este documento analisa os principais motivos pelos quais o controle remoto Web no celular "sempre cai" e aponta direções de otimização de experiência que podem ser implementadas.

## Conclusão

A fronteira de estabilidade da implementação atual não é um problema único. Ela é afetada simultaneamente por três tipos de fatores:

1. Limitações da plataforma Web no celular: quando o navegador do celular vai para segundo plano, a tela é bloqueada, a bateria está fraca ou a memória está apertada, a página pode ser ocultada, congelada ou descartada, e nem WebSocket nem timers de JS têm garantia de continuar rodando.
2. A estratégia atual de recuperação do mobile transport é grosseira demais: depois do pareamento, um socket close provoca recarregamento direto da página inteira, faltando uma máquina de estados de recuperação no local disparada por `visibilitychange` / `pageshow` / `online`.
3. O relay externo e o link de rede têm risco de meia queda: o código já corrigiu problemas reais como falso `waiting`, via de mão única e `INTERNAL` do relay, o que mostra que a estabilidade não depende só do navegador.

Portanto, não se pode simplesmente atribuir a culpa a "stack Web ruim". O julgamento correto é: **a Web pode fazer essa funcionalidade, mas não é possível prometer que a página do celular mantenha uma conexão de controle em tempo real por longos períodos em segundo plano; o produto e a implementação técnica precisam ser desenhados em torno de "tempo real em primeiro plano, recuperável em segundo plano".**

## Modelo de conexão atual

O `/remote` atual usa um relay externo:

```text
mobile browser /remote
  -> WebSocket terminal
  -> external relay wss://zcode.z.ai/ws
  -> WebSocket device
  -> desktop main
  -> shared-host attachment
  -> existing workspace scope in the single Host Process
```

Pontos-chave:

- O desktop conecta ao relay com o papel de `device`.
- O mobile web conecta ao mesmo relay com o papel de `terminal`.
- As duas pontas usam `pair_status_query` / `pair_status_ack` para um heartbeat com média de 10 segundos e jitter limitado de 8 a 12 segundos; quando o último ACK não é atualizado por mais de 30 segundos, o watchdog local dispara o reconexão.
- Todas as mensagens de negócio do ZCode são encapsuladas em `data.payload` do relay.
- A UI do mobile reconstrói via `rpc-frame` um `IMessagePassingProtocol` e reaproveita o `Root` existente.
- O celular não tem um processo de host de Agent próprio; o reconexão apenas reconstrói o attachment de bridge e não destrói o host/runtime que continuam rodando.

Implementação correspondente:

- `packages/web/src/webRemoteControlTransport.ts`
- `packages/web/src/main.tsx`
- `packages/desktop/src/main/webRemoteControlTransport.ts`
- `packages/desktop/src/main/webRemoteControlManager.ts`
- `docs/web-remote-control/web-remote-control-architecture.md`

## Fronteiras rígidas da Web no celular

### Trocar de App ou de aba do navegador

Quando o usuário do celular sai para outro App, a página normalmente entra em estado hidden. Navegadores modernos, para economizar energia e memória, podem congelar ou descartar a página.

Isso traz consequências:

- Timers de JS podem deixar de rodar no horário, e o heartbeat de 10 segundos pode atrasar bastante.
- O WebSocket pode se manter por um tempo ou pode ser fechado pelo sistema ou pela camada de rede.
- Quando a página é descartada, não há callback de JS que possa rodar, e a recuperação equivale a um novo carregamento.
- `beforeunload` / `unload` são pouco confiáveis no celular e não podem servir como mecanismo central de gravação e recuperação de desconexão.

Referências externas:

- Chrome Page Lifecycle: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- MDN Page Visibility API: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN WebSocket close event: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event

### Bloqueio e desligamento de tela

Bloquear ou desligar a tela é mais agressivo do que simplesmente ir para segundo plano. Mesmo que o navegador não feche o WebSocket imediatamente por um curto período, não se pode depender de que ele fique disponível por muito tempo.

O Screen Wake Lock pode melhorar o caso de "o usuário está controlando remotamente em primeiro plano, mas o celular desliga a tela sozinho", mas não resolve a preservação em segundo plano depois de trocar de App. O Wake Lock só se aplica a document active / visible e é liberado quando a página fica oculta, quando a bateria está baixa ou no modo de economia.

Referências externas:

- MDN Screen Wake Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- MDN WakeLockSentinel: https://developer.mozilla.org/en-US/docs/Web/API/WakeLockSentinel

## Fronteiras de estabilidade na implementação atual

### 1. Socket close depois do pareamento no mobile não recarrega mais a página

Na implementação inicial, `WebRemoteControlTerminalTransport` chamava `reloadPage()` ao receber close depois de já estar pareado. A implementação atual virou uma máquina de estados de conexão:

- `connecting`
- `authenticating`
- `waiting`
- `paired`
- `reconnecting`
- `suspended`
- `kicked`
- `error`

Socket close já pareado, mudança de rede e retorno do segundo plano entram preferencialmente em `reconnecting` / `suspended` e tentam a recuperação no local. `reloadPage` permanece apenas como ponto de injeção defallback, e não como estratégia principal de close já pareado.

Ainda é preciso se preocupar com:

- Quando o tempo de recuperação é longo demais, a UI ainda precisa mostrar um estado explícito de reconnecting/suspended.
- Frames RPC antigos não podem ser replayed cegamente; a recuperação forçada deve ter como limite realinhar o attach da bridge com um snapshot.
- Comandos de negócio não idempotentes ainda precisam de accepted ack de camada de negócio ou chave de idempotência, em vez de depender de reenvio do transport.

### 2. O mobile já tem uma máquina de estados de recuperação do ciclo de vida da página

A entrada atual já escuta os principais eventos de ciclo de vida do celular:

- `visibilitychange`
- `pagehide`
- `pageshow`
- `online`
- `freeze` / `resume` do Chrome

Quando a página é recuperada, `recoverConnection()` é disparado e o workspace/task atual é realinhado pelo snapshot de bridge/runtime. O que ainda precisa de atenção é se, após um longo período em segundo plano, o host ainda existe, se o relay continua matched e se o snapshot cobre o gap do replayable.

### 3. O lado desktop ainda é mais estável que o mobile

O device transport do desktop faz `scheduleReconnect()` automaticamente após socket close. O `INTERNAL` do relay também é tratado como erro recuperável.

O terminal transport do mobile agora também tem `recoverConnection()` e estados recuperáveis, mas o congelamento em segundo plano do navegador móvel, o bloqueio de tela e o recolhimento pelo sistema continuam sendo fronteiras rígidas. Portanto, a semântica de produto ainda deve ser "tempo real em primeiro plano, recuperável em segundo plano", sem prometer permanência em segundo plano por longos períodos.

Isso cria uma experiência assimétrica: o desktop pode rodar por muito tempo e continuar segurando host/runtime; quando o celular volta, ele precisa recuperar a visão pelo stream replayable e pelo snapshot.

### 4. O relay já apresentou meia queda e problemas de roteamento

Comentários no código existente indicam que várias classes de problemas de relay já foram encontradas:

- A camada de borda do relay externo pode fragmentar apenas por `query.mid`, e depender só de `X-Device-ID` faz o desktop e o celular caírem em backends diferentes.
- Em sessões já pareadas, o heartbeat ocasionalmente retorna `waiting`.
- O relay ocasionalmente mantém só a via de mão única do celular para o desktop; o desktop já respondeu, mas o celular não recebe.
- Em refresh/reconexão rápidos do terminal, o relay pode retornar `INTERNAL` por um instante.

Esses não são limites de segundo plano do navegador móvel, e sim problemas de estabilidade da camada de relay / rede / balanceamento.

### 5. RPC de alta frequência depende do mesmo canal de relay

O RPC de negócio atual, a bridge de workspace e o mirror realtime de task usam todos o mesmo data channel do relay. O stream mirror já faz agregação, detecção de seq gap e fallback para snapshot, mas, quando o link oscila, as mensagens de controle e as atualizações em tempo real ainda compartilham o mesmo canal.

Riscos:

- Muitos frames de stream da UI podem afetar a latência de resposta das requisições de controle.
- Depois que um request pendente dá timeout, é difícil para as camadas superiores saber se o desktop não processou, se o relay cortou de forma unidirecional ou se o celular não recebeu.
- O gap do stream replayable pode recorrer a um snapshot, mas frames RPC na camada de transport ainda não podem ser replayed de forma genérica.

## Cenários de desconexão perceptíveis pelo usuário

| Cenário | Causa principal | Comportamento atual | Direção de otimização |
| --- | --- | --- | --- |
| Celular vai para WeChat/navegador em segundo plano por alguns minutos e volta | Página hidden / frozen / socket close | Recarrega ou página de falha | Reconexão automática e recuperação de workspace/task ao voltar para primeiro plano |
| Celular bloqueia a tela e volta | Desligamento de tela desconecta o WebSocket ou pausa o JS | Recarrega, trava ou mostra relay unavailable | Wake Lock + máquina de estados de recuperação |
| Rede móvel muda de Wi-Fi para 5G | TCP/WebSocket desconecta | Timeout ou falha na requisição | Evento `online` dispara reconnect + replay de requests |
| Oscilação breve do relay | relay close / INTERNAL / falso `waiting` | O desktop pode se recuperar, o mobile pode falhar | O mobile usa a mesma estratégia de reconexão |
| Via de mão única no relay | O mobile envia e não recebe a resposta do desktop | Timeout em bootstrap/list | Diagnóstico de timeout por requisição + reconstrução do socket do terminal |
| Outro celular faz o scan do QR | relay kick / session conflict | O celular atual é desconectado | Mantém a falha terminal, mas o texto explica o motivo |

## Sugestões de otimização

### P0: tratar "vai cair em segundo plano" como comportamento de produto

Objetivo: não deixar o usuário achar que é uma falha irrecuperável.

Sugestões:

1. Quando a página entra em hidden, salvar o estado mínimo de recuperação:
   - `deviceSid`
   - `currentWorkspaceKey`
   - `currentTaskId`
   - `bridgeSessionId`
   - horário do último pair bem-sucedido
   - horário do último payload de desktop recebido
2. Quando a página volta a visible / pageshow / online, executar a recuperação:
   - Verificar o readyState do socket.
   - Se o socket estiver indisponível, criar um novo socket de terminal.
   - Esperar o pair matched.
   - Reenviar `bootstrap-request`.
   - Enviar `workspace-bridge-open` conforme o workspace/task salvo.
   - Re-renderizar o Root ou disparar o reload de snapshot.
3. A UI mostra um estado explícito:
   - "A conexão está pausada"
   - "Recuperando o controle remoto"
   - "Falha na recuperação, escaneie o QR de novo"

Princípio-chave: não se promete tempo real em segundo plano, mas a recuperação em primeiro plano precisa ser o mais automática possível.

### P0: reformular a estratégia de close do mobile transport

Objetivo: um close depois do pareamento não recarrega a página diretamente.

Estados sugeridos:

```ts
type WebRemoteControlTerminalTransportState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "waiting"
  | "paired"
  | "reconnecting"
  | "suspended"
  | "kicked"
  | "error";
```

Estratégia:

- `KICKED` / `AUTH_FAILED` / `DEVICE_NOT_FOUND`: falha terminal.
- `close` / `error` / `desktop-bootstrap-timeout`: entra em `reconnecting`, com backoff exponencial.
- `document.hidden`: entra em `suspended`, interrompe operações de alta frequência e salva o estado de recuperação.
- `document.visible`: tenta a recuperação imediatamente.

Atenção aos requests pendentes:

- Requisições idempotentes: `bootstrap-request` e `workspace-list-request` podem ser replayed automaticamente.
- Troca de bridge: pode ser replayed, mas a relação entre o `bridgeSessionId` antigo e o novo precisa ficar explícita.
- Frames RPC: não podem ser replayed cegamente e dependem da reconciliação por snapshot da camada superior.

### P0: adicionar logs de diagnóstico de desconexão

Objetivo: fazer com que o "sempre cai" possa ser atribuído a uma causa.

No lado mobile, sugere-se registrar metadados seguros:

- Transição de estado do transport.
- `code` / `reason` / `wasClean` do close do WebSocket.
- `document.visibilityState`.
- `navigator.onLine`.
- Duração do período hidden.
- Horário do último payload enviado / recebido.
- Tipo do request pendente e seu timeout.
- pair status ack: `matched` / `waiting` / `kicked`.

Cuidados com os logs:

- Não registrar a URL do QR em texto original.
- Não registrar `hash` / `passHash`.
- Não registrar o JSON original do payload.
- Stream / frames RPC de alta frequência registram apenas contagem e comprimento, nunca o corpo.

### P1: adicionar Wake Lock em primeiro plano

Objetivo: reduzir "o usuário está olhando a página de controle remoto, mas o celular desliga a tela sozinho e a conexão cai".

Sugestões:

- Pedir `navigator.wakeLock.request("screen")` no `/remote` depois de entrar em uma bridge ativa.
- A UI oferece um interruptor dispensável, por exemplo "Manter a tela acesa".
- Escutar o `release` do WakeLockSentinel e pedir de novo automaticamente quando a página está visible.
- Sem suporte a Wake Lock, degradar silenciosamente, apenas avisando o usuário para manter a tela ligada.

Fronteiras:

- Wake Lock não preserva a página em segundo plano.
- Ele é liberado pelo sistema com bateria baixa, no modo de economia e quando a página fica oculta.

### P1: priorizar a reconciliação por snapshot na recuperação

Objetivo: a task continua rodando durante a desconexão e o usuário vê o estado mais recente ao voltar.

Sugestões:

1. Depois que o terminal volta a estar matched, abrir primeiro a bridge.
2. Com a bridge pronta, buscar ativamente:
   - lista de workspace tasks
   - snapshot da task ativa
   - status de runtime da task atual
3. Se o owner run ainda estiver rodando, reassinar o evento de task dinâmica.
4. Se o stream replayable tiver gap, não buscar preencher cada chunk: primeiro esperar um snapshot com `runtime.streamWatermark` que cubra a lacuna e depois continuar conectado ao stream seguinte.

Isso é coerente com o documento de realtime sync existente: o stream replayable é responsável pela continuidade do estado de execução durante a recuperação da desconexão, e o snapshot é responsável pela consistência final e pelo alinhamento de gaps grandes.

### P1: adicionar geração de conexão e observabilidade na camada do relay

Objetivo: distinguir reconexão normal, conexão antiga atrasada, via de mão única e incompatibilidade de roteamento.

Sugestão de metadados seguros no payload relay/app:

- `connectionId`
- `connectionGeneration`
- `lastPairMatchedAt`
- `lastHeartbeatAckAt`
- shard de roteamento por `mid` de device e terminal
- classificação do motivo de close do relay

Os logs do mobile e do desktop usam esses IDs para correlacionar uma desconexão.

### P2: priorizar requisições de controle sobre frames de stream

Objetivo: quando o link está congestionado, priorizar a resposta às ações do usuário.

Sugestões:

- Adicionar priority ao payload do app:
  - high: resposta de permissão, stop generation, troca de workspace
  - normal: bootstrap, lista de workspace, requisição de plataforma
  - low: lote do stream mirror
- Se o relay suportar fila, encaminhar high / normal primeiro.
- Continuar combinando batches de mirror no desktop main e, quando necessário, pausar o mirror enquanto o celular está invisível, mantendo apenas a invalidação de snapshot.

### P2: otimizações de PWA / modo instalado

Objetivo: melhorar a entrada e a experiência em primeiro plano, sem tratar isso como solução de preservação em segundo plano.

Sugestões:

- Adicionar um Web App Manifest para o usuário poder adicionar à tela inicial.
- No modo standalone, reduzir a interferência da UI do navegador.
- Salvar o último estado de recuperação do controle remoto.

Fronteiras:

- PWA em iOS / Android também não garante a sobrevivência de WebSocket em segundo plano por longos períodos.
- PWA não substitui a capacidade de execução em segundo plano de um App nativo.

## Ordem recomendada de implementação

1. **Logs de diagnóstico primeiro**: adicionar logs de visibility, close code, request pendente e status de pair, e confirmar em que tipo de cenário a desconexão do usuário ocorre de fato.
2. **close no mobile sem recarregar**: trocar close já pareado por `reconnecting` e manter a página de falha apenas para erros irrecuperáveis.
3. **Máquina de estados de recuperação em primeiro plano**: implementar a recuperação automática em visible / pageshow / online e restaurar workspace/task.
4. **Wake Lock**: reduzir desconexões por desligamento de tela em primeiro plano.
5. **Observabilidade do relay**: acrescentar logs de geração de conexão e de shard.
6. **Priorização de payload e protocolo de recuperação**: otimizar o conflito entre stream de alta frequência e mensagens de controle pelo canal.

## Critérios de aceite

### Cenários manuais

1. Celular faz o scan e entra no controle remoto, sai para outro App por 30 segundos e volta: deve recuperar automaticamente o mesmo workspace/task.
2. Celular faz o scan e entra no controle remoto, bloqueia a tela por 1 minuto e desbloqueia: deve recuperar automaticamente ou mostrar um estado explicitamente re-tentável.
3. Após o celular trocar entre Wi-Fi / rede celular, deve reconectar automaticamente e não cair direto em uma página de falha permanente.
4. Depois que o relay do desktop se recupera de uma queda breve, o mobile não precisa refazer o scan.
5. Quando outro celular faz o scan e derruba o celular atual, o celular atual deve mostrar session conflict e não deve reconectar em laço infinito.

### Testes automatizados

Sugestão de testes unitários adicionais:

- close depois de paired entra em reconnecting, em vez de reload.
- `visibilitychange hidden -> visible` dispara recover.
- O evento `online` dispara recover.
- Requisições idempotentes são replayed depois do recover.
- `KICKED` não reconecta.
- `AUTH_FAILED` não reconecta.
- Frames RPC pendentes não são replayed cegamente.

### Métricas de observabilidade

Estatísticas sugeridas:

- Número de closes do socket de terminal do mobile e distribuição de close code.
- Proporção de desconexões depois de hidden.
- Taxa de sucesso de recuperação automática depois de visible.
- Tempo médio de recover.
- Taxa de timeout de bootstrap / workspace-list / workspace-bridge-open.
- Número de `waiting` do relay depois do pareamento.
- Número de suspeitas de via de mão única no relay: request do mobile enviado, resposta do desktop registrada como enviada, mas timeout no mobile.

## Sugestão de texto para o usuário

Vale deixar explícito na página de controle remoto ou na documentação de ajuda:

> O controle remoto Web no celular é adequado para operação em tempo real em primeiro plano. Ao trocar de App, bloquear a tela ou trocar de rede, o navegador do celular pode pausar a conexão; ao voltar para a página, o ZCode se recupera automaticamente no workspace e na task mais recentes. Para uma experiência mais estável, mantenha a página em primeiro plano durante o controle remoto e permita que a tela fique acesa.

Isso é mais fiel às fronteiras reais da Web móvel do que prometer "sem queda de conexão", e reduz o mal-entendido do usuário.

## Status de implementação do P0

O primeiro lote de otimizações de estabilidade P0 já foi implementado:

1. O terminal transport do mobile ganhou os estados `reconnecting` / `suspended`.
2. Socket close já pareado não recarrega mais a página inteira, virando reconexão no local com disparo de bootstrap depois de voltar a paired.
3. O `/remote` escuta `visibilitychange` / `pagehide` / `pageshow` / `online` / `freeze` / `resume`, pausando o heartbeat quando a página fica oculta e reconstruindo o socket do terminal ao voltar para primeiro plano ou quando a rede se recupera.
4. Os logs de diagnóstico registram apenas metadados seguros: transições de estado, close code/reason/wasClean, visibility, online, duração do período hidden e status de pair, sem URL de QR, hash, passHash ou corpo de payload de negócio.
5. Testes automatizados adicionais cobrem close pareado sem reload, hidden suspended e visible/pageshow/online recover.

Wake Lock, connection generation do relay, payload priority e o replay completo de requests ainda não foram implementados; eles exigem interruptor de UI ou extensão do protocolo de payload relay/app, e recomenda-se avançar P1/P2 de forma independente.