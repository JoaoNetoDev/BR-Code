# Documento de revisão do refactor v4: convergência da sincronização de estado de Conversation e do protocolo multiplataforma

- Objetivo da reunião: avaliar se a direção do refactor v4 resolve sistematicamente os problemas de dessincronização de estado de conversation, recuperação em rede fraca e divergência de protocolo entre controle remoto e local.
- Escopo de discussão: projeção de produto de conversation, modelo de command, recuperação por assinatura, backpressure de transporte, e o limite unificado de protocolo entre desktop continuous e web remote replayable.
- Fora do escopo de discussão: reformulação visual específica da UI, nomeação TypeScript final de campos individuais e a transformação do relay em camada de negócio.

## Contexto

No passado, muitos bugs de conversation pareciam dispersos: mensagens duplicadas, timeline desalinhada, metade das mensagens perdida após um refresh, estado de stop inconsistente, popups de permissão desaparecendo após reconexão do controle remoto pelo celular, queued prompt perdido ou enviado duas vezes. Por trás deles, porém, há um único problema estrutural: **a conversation não tem uma fonte de verdade autoritativa única para seus fatos de produto**.

Hoje renderer, service, host, desktop main e mobile replay mirror mantêm cada um sua parte do estado de execução em camadas diferentes. Stream e snapshot são por sua vez gravados na memória da UI, e a UI precisa depois mesclar, compensar e adivinhar. Esse modelo ainda se sustenta com remendos em enlaces curtos locais, mas em ambientes de rede como web, controle remoto pelo celular, workspace remoto, RTT de segundos e refresh/desconexão frequentes, amplifica diferenças de sequenciamento até virar bug de produto.

O objetivo do v4 não é adicionar um novo fallback para cada classe de bug, e sim transformar a conversation em:

```text
CLI / agent runtime é a única fonte de verdade
  -> gera a Conversation Product Projection
  -> o host apenas encaminha, faz buffer, backpressure e agenda a recuperação
  -> desktop / web / mobile apenas renderizam a projeção e enviam intents de command
```

Mudança central em uma frase: **o cliente é rebaixado de "reducer de estado" a "renderizador de projeção + proponente de commands".**

## Problemas anteriores e melhorias correspondentes

| Problema anterior | Fenômeno causado | Melhoria correspondente no v4 | Ponto de aceitação da revisão |
| --- | --- | --- | --- |
| A memória do renderer era uma das verdades da conversation, com stream e snapshot fazendo double write no mesmo array de mensagens | Mensagens perdidas após refresh, mensagens duplicadas, timeline desalinhada, agrupamento de turn consertado por remendos | O lado CLI gera a `ConversationProductProjection`, com rows, turn, actionAvailability e sessionControl como projeções autoritativas; o cliente substitui tudo ao receber snapshot e apenas faz apply contínuo ao receber delta | A UI deixa de derivar turn e estado de botões a partir de flat messages; após replay do mesmo evento, as rows ficam estáveis |
| Os action guards ficavam espalhados entre a UI e as operations | `canStop`, `canFork`, roteamento de queue e estado de botões inconsistentes entre plataformas | Todas as ações que alteram a conversation viram command intent; o CLI decide pela revision da projeção e por módulos de regras, e retorna ACK | Qualquer cliente vê o mesmo actionAvailability; stop repetido e resposta de permissão convergem de forma idempotente |
| Havia vários caminhos de recuperação após desconexão, e o nível de base não vivia nem morria junto com o estado da UI | Após um gap de replay no celular, um snapshot antigo era combinado com um stream novo, produzindo um estado que nunca existiu | `subscribe(topic, base?)` unificado: base válida continua a partir dela, base inválida vira snapshot; `logEpoch + seq + subscriptionId` tornam a geração explícita | Quadros atrasados de assinaturas antigas são descartados silenciosamente; um corte dispara apenas um resubscribe single-flight |
| Deltas de alta frequência atravessavam diretamente o relay e o IPC, e o batching acontecia só no cliente | Explosão de quadros em rede fraca, amplificação de RTT, consumo de bateria e queda de quadros no celular | O batching foi antecipado para a camada de canal do host, com o topic declarando coalesce/resync; no nível de quadro restam ACK, heartbeat, replay de reconexão e sinal de congestão | Uma rodada de saída passa de "um quadro por delta" para entrega por janela; em caso de overflow, usa-se snapshot em vez de descartar quadros ao acaso |
| desktop continuous e mobile replayable eram dois caminhos de código | Comportamento inconsistente entre local e remoto, e corrigir um lado quebrando o outro | Usar o mesmo conjunto de topic / snapshot / delta / command, deixando as diferenças apenas como parâmetros de delivery profile | A lógica de apply do cliente não distingue profile; o desktop usa continuous por padrão e o mobile usa replayable por padrão, mas o estado final é o mesmo |
| O remote controller dependia de semântica extra de bridge/mirror | O celular virava um "cliente lateral", podendo contornar as fronteiras locais de host/runtime | O controle remoto mantém shared-host attachment: relay e desktop main apenas repassam `rpc-frame`, e o celular se anexa ao host local/remoto já existente no desktop | relay/main não incorporam estado de negócio de task, stream, queue nem snapshot |
| queued prompt e optimistic UI eram mantidos pela memória local | A fila se perde no refresh, um ACK perdido deixa o pending sem convergência e envios duplicados dependiam de deduplicação heurística | O command carrega `commandId`, e a row/queue item autoritativa carrega `sourceCommandId`; o overlay é exibido apenas por commandId e nunca entra nos dados reais | O lado emissor também precisa ler seu próprio resultado autoritativo no fluxo de assinatura, e o overlay converge pela projeção |
| workspacePath era usado como semântica de isolamento de identidade | Workspaces remotos como SSH/WSL/Docker com o mesmo caminho misturavam estados entre si | Toda chave de identidade/isolamento usa `workspaceIdentity?.trim() || workspacePath`, enquanto a execução de caminho continua usando apenas `workspacePath` | Bridge, snapshot, queue e owner command do workspace remoto carregam a workspace identity |
| Os bugs atuais não tinham evidência de protocolo reproduzível | As correções dependiam de reprodução manual e suposições da UI, e regressões escapavam com facilidade | Construir testes goldens e um dispositivo de caos de rede: atomicidade do snapshot, consistência de estado final entre profiles, tratamento de quadros duplicados/atrasados, guard e projection de mesma origem | Cada classe de bug histórico corresponde a um invariante de protocolo ou a um caso de reducer |

## Propriedade do estado

O v4 primeiro esclarece "quem possui o estado". A raiz da dessincronização não é falta de código de sincronização, e sim o fato de várias camadas acharem que podem gravar os fatos da conversation.

```text
CLI / agent runtime                              # única fonte de verdade da conversation, responsável por recortar os eventos brutos em estado visível ao produto
|-- canonical transcript                         # registro autoritativo da conversa, contendo entrada do usuário, saída do assistant, resultado de tools e demais conteúdo restaurável
|-- runtime facts                                # fatos do estado de execução atual, como active work, pending permission, token usage e tarefas em segundo plano
|-- event log / logEpoch / seq                   # nível da água de recuperação incremental, usado para decidir se o cliente pode continuar a partir de deltas ou precisa reler o snapshot
|-- command guard and idempotency                # adjudicação serial dos commands, deduplicação idempotente e julgamento de guard, evitando que cada plataforma decida por si se pode executar
`-- Conversation Product Projection              # projeção de produto autoritativa voltada à UI, que normaliza transcript e runtime facts em uma visão renderizável
    |-- rows                                     # lista de linhas da timeline, fonte autoritativa para agrupamento de turn, atribuição de mensagens e key de scroll virtual
    |-- actionAvailability                       # conjunto de ações disponíveis no momento, como canStop/canFork/canRetry, evitando que a UI vasculhe estado para adivinhar botões
    |-- inputRouting                             # adjudicação de roteamento de entrada, que decide se uma nova entrada é executada na hora, entra na queue ou é rejeitada pelo guard
    |-- sessionControl                           # estado de controle de nível de sessão, como phase, sessionEnded, stopState e lastError
    |-- queue / pendingInteractions / backgroundWorks # listas de fila, itens aguardando resposta do usuário e trabalhos em segundo plano, restauradas após refresh e em todas as plataformas a partir da mesma projeção

Host / service                                   # camada de conexão e serviço do app, responsável por transporte, assinatura e buffer, sem adicionar semântica de produto de conversation
|-- topic subscription registry                  # registra quais topics cada conexão assinou e o subscriptionId/visibility/profile correspondente
|-- per (connection, topic) flush buffer         # buffer de envio curto por conexão e topic, usado para batching, limitação de taxa e estado macio descartado na desconexão
|-- coalesce / conflation / backpressure         # combina deltas por regra do topic, mantém o estado mais recente e ajusta o ritmo de envio conforme a congestão do transporte
`-- no new conversation product decision         # proibição explícita de o host/service decidir turn, disponibilidade de botões ou estado de produto da sessão

Renderer / Web / Mobile                         # o cliente só se responsavel por exibir e por enviar intenções, sem poder se tornar fonte de verdade da conversation
|-- render projection                            # renderiza as projeções autoritativas emitidas pelo CLI, como rows/sessionControl/actionAvailability
|-- send command intent                          # submete as ações do usuário como command para que o lado autoritativo decida, em vez de alterar localmente o estado real
|-- optimistic overlay by commandId              # usa o commandId para feedback local imediato, convergindo quando a row/queue item autoritativa retorna
`-- local-only UI state                          # mantém apenas o estado de interação local que não afeta os fatos da conversation
    |-- draft                                    # rascunho da caixa de entrada, que pertence à experiência local do cliente atual e não participa da sincronização de fatos entre plataformas
    |-- scroll anchor                            # âncora de rolagem e faixa visível, usada para restaurar a posição de leitura por rowId sem alterar o conteúdo da sessão
    |-- hover / focus                            # estados transitórios de mouse, foco e seleção, que afetam apenas a interface atual
    |-- pane layout                              # preferências de layout como split e painéis, que pertencem ao estado de exibição local do cliente
```

O ganho dessa fronteira é que a semântica de produto da conversation precisa ser provada uma única vez, no reducer do CLI e nos testes de protocolo. Desktop, web e mobile não escrevem mais cada uma sua própria lógica de "como montar uma conversa a partir do stream".

## Assinatura, recuperação e rede fraca

O problema tratado nesta seção é: **como o cliente se realinha ao estado autoritativo do CLI depois de desconectar, dar refresh ou abrir em um dispositivo novo pela primeira vez.**

O v4 para de escrever três lógicas de recuperação separadas para "refresh", "reconexão após desconexão" e "novo QR code no celular". Todos os clientes fazem a mesma ação: assinar o topic da conversation atual. A diferença é apenas se o cliente tem em mãos um estado antigo confiável.

```text
estado local do cliente                  requisição de assinatura                     adjudicação do CLI
------------                         --------                         --------
sem estado antigo
  por exemplo refresh, dispositivo novo  ->     subscribe(topic)            ->    envia o snapshot completo

com estado antigo, e com a marca d'água W lembrada
  por exemplo retorno após uma rede caída por pouco tempo ->     subscribe(topic, base=W)     ->    se W ainda for válida, envia apenas os deltas posteriores a W

com estado antigo, mas com a marca d'água muito antiga ou de outra geração
  por exemplo queda longa, CLI reiniciado ->      subscribe(topic, base=W)     ->    descarta o estado antigo e reenvia o snapshot completo
```

Alguns termos podem ser entendidos de forma coloquial:

```text
topic     = qual sessão está sendo assinada, por exemplo conversation/<sessionId>
snapshot  = o quadro completo atual calculado pelo CLI em certo momento
delta     = as mudanças incrementais ocorridas desde a última marca d'água
seq       = a marca d'água do fluxo de eventos do CLI, indicando "já vi o evento de número tal"
logEpoch  = a geração do processo/log de eventos do CLI; se a geração mudou, o seq antigo não pode mais ser continuado
base      = o que o cliente diz ao CLI: "eu tenho um quadro consistente do momento logEpoch=X, seq=W"
```

O realmente essencial é este invariante: **só é permitido usar `base=W` para continuar a partir dos deltas quando o cliente realmente detém o quadro consistente do momento seq=W.**

Portanto, a cadeia de recuperação fica assim:

```text
rede caída por pouco tempo:

o cliente ainda mantém o quadro (seq=120)
  -> após a rede voltar, assina com base=120
  -> o CLI avalia se 120 ainda está na janela de retenção
  -> envia apenas os deltas 121..now
  -> o cliente conecta e o quadro não suffers interrupção

refresh / novo dispositivo / desconexão longa:

o cliente não tem quadro confiável, ou a base já expirou
  -> assina sem base, ou traz uma base que o CLI considera stale
  -> o CLI envia o snapshot (seq=now)
  -> o cliente substitui por inteiro a projeção local
  -> continua recebendo deltas a partir do seq do novo snapshot
```

Depois de receber um quadro, o cliente também não adivinha nem preenche buracos, e trata tudo pelas cinco regras abaixo:

```text
1. subscriptionId não corresponde  -> é um quadro atrasado da assinatura antiga, descartar
2. o payload é um snapshot         -> substitui a projeção atual por inteiro, sem merge com o array antigo
3. toSeq <= seq local              -> quadro duplicado ou atrasado, descartar
4. fromSeq != seq local            -> houve um corte no meio, reassinar para obter snapshot
5. fromSeq == seq local            -> marca d'água contínua, aplicar deltas com segurança
```

A recuperação em rede fraca acontece em duas camadas:

```text
jitter de centenas de milissegundos a poucos segundos
  -> @zcode/rpc resolve com ACK / heartbeat / replay de reconexão
  -> o topic de conversation não percebe isso, e o seq não se parte

refresh, desconexão longa, reconstrução da página no relay/celular, mudança de geração do CLI
  -> o topic de conversation resolve com subscribe(base)
  -> base disponível completa com delta; base indisponível vira snapshot
```

Isso evita o erro mais fácil hoje: o celular ficar com um quadro antigo e ainda assim continuar costurando um stream novo, fazendo a UI exibir um estado de conversation que o CLI nunca reconheceu.

## Unificação de protocolo: Replay e Continue

O que o v4 quer unificar é o modelo de protocolo, e não achatar a semântica de execução de todas as plataformas.

```text
o mesmo conjunto de protocolo:
  topic = conversation/<sessionId>
  snapshot = a projeção completa atual
  delta = patch de row/state
  command = intenção do usuário
  ack = accepted / rejected / stale / duplicate / failed

delivery profiles diferentes:
  desktop continuous
    - MessagePort local por padrão
    - baixa latência, granularidade de streaming alta
    - mantém o enlace realtime direct continuous

  web remote replayable
    - relay / rede fraca por padrão
    - janela de flush maior
    - produtos de máquina como tool output transmitidos menos por streaming e mais fechamentos por estado final
    - após desconexão, recuperação com snapshot + replay
```

Ou seja, desktop e mobile seguem a mesma semântica `subscribe/apply/command`, mas o delivery profile é uma tabela de parâmetros:

```text
fluxo de eventos do modelo
  -> o reducer do CLI gera o delta autoritativo da projeção
  -> a camada de canal do host faz coalesce por profile do assinante
  -> @zcode/rpc cuida do ACK / heartbeat / replay de reconexão no nível dos quadros
  -> o cliente renderiza com o mesmo algoritmo de apply
```

Assim é possível atender às duas restrições ao mesmo tempo:

- O desktop não é contaminado pela semântica replayable do celular e continua sendo o enlace principal continuous.
- O celular não contorna o limite de recuperação replayable, e após um gap grande precisa se alinhar por snapshot.

## Limite entre controle remoto e enlace local

O controle remoto no v4 não deve transformar o relay ou o desktop main em uma camada de estado de negócio. O fato válido continua sendo o shared-host attachment:

```text
mobile /remote
  -> external relay: auth / pair / heartbeat / payload relay
  -> desktop main: workspace bridge and rpc-frame routing
  -> existing host process
  -> services / runtime / task persistence
  -> CLI / agent runtime
```

Isso significa:

- O relay apenas repassa `rpc-frame`, sem fazer parse de task, session, stream, queue nem snapshot.
- O desktop main apenas faz o agendamento do attachment e não mantém estado de negócio da conversation.
- O celular não pode iniciar um runtime de Agent separado por causa do controle remoto, nem criar uma sessão SSH/WSL/Docker independente.
- A bridge, o snapshot, a queue e os owner commands do workspace remoto precisam propagar `workspaceIdentity` e `remoteSessionId`.

## Command e optimistic overlay

O cliente do v4 não é um escritor, mas um proponente:

```text
UI action
  -> command(commandId, clientId, sessionId, baseRevision, type, payload)
  -> CLI guard / dedupe / enqueue / execute
  <- ACK
  -> projection delta
  -> a UI fecha o overlay pelo sourceCommandId
```

Pontos de design:

- `accepted` significa apenas que o lado autoritativo recebeu, e não que a UI pode gravar mensagens reais localmente.
- O overlay serve apenas para feedback imediato, é montado por commandId e nunca é mesclado nas rows.
- A row userInput autoritativa, o queue item e o marker de timeline precisam carregar `sourceCommandId`.
- Commands não convergidos após uma desconexão são reconciliados com `commands/query`, sem reenvio cego.
- A concorrência entre plataformas é adjudicada serialmente pelo CLI, sem OT/CRDT.

Esse modelo unifica o limite entre "continuar enviando" e "recuperar por replay": continue é um command, replay é a recuperação da assinatura. Os dois convergem em torno da mesma projeção, sem mais uma fila local somada a um fluxo espelho remoto.

## Etapas de implantação

Sugere-se confirmar a revisão em quatro blocos:

| Fase | Objetivo | Principais produtos |
| --- | --- | --- |
| Phase 0: protocolo finalizado | Fixar a propriedade do estado, o conjunto de cinco elementos do topic, o ACK de command, o delivery profile e os invariantes | Atualização da especificação de campos, case catalog, coverage matrix e golden test list |
| Phase 1: projection no CLI | Mover para o reducer do CLI os fatos de produto como rows, actionAvailability, sessionControl e queue | reducer, schema, testes de atomicidade do snapshot, âncora de sourceCommandId |
| Phase 2: assinatura, recuperação e transporte | Unificar subscribe/apply, produção de ACK/reconexão/backpressure e manter o controle remoto em shared-host | runtime de topic, coalesce, logEpoch, subscriptionId, chaos test |
| Phase 3: convergência da UI | A UI remove reducers e lógica de derivação locais e passa a renderizar apenas projection + overlay | v4 chat store, âncora de rowId para scroll virtual, plano de remoção dos enlaces antigos |

## Perguntas centrais da revisão

1. Reconhece-se que "a projection do CLI é a única fonte autoritativa dos fatos de produto da conversation"?
2. Reconhece-se que "unificar o protocolo = o mesmo conjunto de topic/command/apply, com as diferenças entre plataformas expressas apenas por delivery profile"?
3. Reconhece-se "não fazer fila offline por cliente, com recuperação por snapshot unificada para desconexões longas e refresh"?
4. Reconhece-se que "relay e desktop main não incorporam estado de negócio de task/session/stream"?
5. Reconhece-se o critério de ciclo de vida do command inbox / queue: o renderer pode recuperar-se após desconexão, não se promete continuar executando quando o processo host/CLI encerra, e efeitos já persistidos convergem de forma idempotente pelo `sourceCommandId`?
6. O fault catalog G-12 e a superfície de autenticação G-13 entram como preenchimento obrigatório da Phase 0?

## Benefícios esperados

- Os bugs de conversation deixam de ser um conjunto de remendos por plataforma e passam a ser invariantes de protocolo mais testes de reducer.
- Web e celular em rede fraca deixam de depender de suposições da UI para se recuperar, e refresh e desconexão passam a ser o caminho normal de assinatura.
- O remote controller e o enlace local compartilham o mesmo modelo de protocolo, preservando ao mesmo tempo os limites de diferença entre desktop continuous e mobile replayable.
- As responsabilidades de host/relay/main ficam mais leves, e o estado deixa de se espalhar pela camada de encaminhamento.
- Ao adicionar novas formas de plataforma no futuro, basta implementar transport e capability, sem reescrever o reducer de conversation.

## Documentos relacionados

- [README do refactor V4](./README.md)
- [Especificação de campos do ZCode Protocol v4](./10-protocol-spec.md)
- [Assinatura e recuperação](./04-sync-and-recovery.md)
- [Transporte e backpressure](./05-transport-and-backpressure.md)
- [Review de design do refactor V4](./design-review.md)
- [Arquitetura do Relay externo de controle remoto Web](../web-remote-control/web-remote-control-architecture.md)
- [Sincronização de tarefas em tempo real](../web-remote-control/task-realtime-sync.md)
- [Fila de comandos de tarefas do controle remoto pelo celular](../web-remote-control-task-command-queue.md)