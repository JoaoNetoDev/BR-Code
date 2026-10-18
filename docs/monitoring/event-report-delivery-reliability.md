# Confiabilidade de entrega do `/event/report` no desktop

> Status: especificação de implementação da primeira fase.
>
> Objetivo: fazer com que os eventos de negócio já gerados fiquem o mais alinhados possível aos dados de negócio, sem bloquear o negócio e sem introduzir uma outbox persistente.

## Escopo

A primeira fase altera apenas a estratégia de entrega de `/api/v1/event/report` do `TelemetryCore` comum no Desktop Main.

Os pontos de chamada do Renderer, `IPlatformService`, o schema IPC, o payload dos eventos, ARMS, a telemetry OTLP da CLI e o `web-remote-replayable` de Web/mobile permanecem inalterados.

Resultados de negócio, toast, navegação, login/logout e execução de tarefas não podem aguardar a telemetry. Crash, kill forçado, queda de energia, offline prolongado, fonte de evento que não gera evento e reenvio persistido não estão no escopo da primeira fase.

## Contrato de entrega

### Cabeçalhos de requisição (2026-09-16)

Somente o `/api/v1/event/report` do App reutiliza os cabeçalhos comuns completos de `buildZCodeSourceHeadersFromContext`: User-Agent, HTTP-Referer, X-Title, X-ZCode-App-Version, X-Platform, X-Release-Channel, X-Client-Language, X-Client-Timezone, X-Os-Category, X-Os-Version, X-Device-Mid. Idioma, fuso horário e device ID são consistentes com o contexto deste evento; a origem do ambiente é o endpoint atual, e versão/plataforma vêm do contexto do App. Valores ausentes ou inválidos seguem as regras de normalização da função comum.

O serviço de credenciais continua sendo o único owner da identidade de login; o Main injeta um Authorization loader somente leitura, e a cada envio (inclusive nas retentativas) lê `zcodejwttoken` da conta ativa corrente. Quando a conta é consistente com o `user_id` do evento e o token não é vazio, envia `Authorization: Bearer <ZCode JWT>`; em caso de anônimo, logout, troca para outra conta ou falha na leitura das credenciais, envia sem esse cabeçalho. É proibido substituir por OAuth token / API key, proibido cachear o JWT e proibido gravar o JWT no corpo do evento ou em logs. Após a leitura, reconferir a conta ativa e o `user_id`, descartando resultados assíncronos entre contas.

As requisições de reporte desabilitam o redirecionamento automático, para evitar que um 3xx do servidor encaminhe os cabeçalhos de identidade/dispositivo para outro endereço; em caso de falha continua valendo a retentativa limitada, sem ampliar o destino.

```text
contexto do evento + deviceMid persistido → cabeçalhos comuns (sem leitura extra de disco)
cada attempt → serviço de credenciais lê e reconfere a conta atual → Bearer JWT opcional → HTTP POST
```

As requisições web da página de recompensas não injetam esses cabeçalhos; o reporte do Website está fora do escopo desta alteração. Os limites de login/tema/idioma do Bridge, o continuous do desktop e o replayable do celular permanecem inalterados.

Aceitação: cabeçalhos comuns completos consistentes com o payload; login/anônimo, logout e troca de conta, rotação de token, releitura de credenciais nas retentativas, degradação anônima em caso de erro de leitura; observar em Electron local que o reporte do App carrega os cabeçalhos e que as requisições inicial/de atualização da página de recompensas não injetam mais cabeçalhos exclusivos do App e que o Bridge funciona.

Registro de verificação: em 2026-09-16, 9 arquivos de teste unitário com 65 casos passaram; regressão formal de Rewards em Electron macOS local `desktop-e2e-20260916-043702-139` 3/3 passou, runner exit 0. Fixture HTTP isolado observou o reporte do App após login/logout, assertando todos os cabeçalhos comuns e o formato opcional do Bearer (sem imprimir o JWT); primeira carga/atualização da web sem cabeçalhos exclusivos do App, Bridge claro/escuro/idioma e fluxo de menu preservados. Typecheck raiz, typecheck:e2e do desktop, lint (47 warnings pré-existentes / 0 erros) e architecture check passaram. Não foi usado Docker; não foram verificados assinatura pelo servidor real, máquinas reais Windows/Linux ou deploy em produção.

Um evento lógico constrói endpoint, corpo completo da requisição e `event_id` apenas uma vez, e todos os attempts reutilizam os mesmos valores:

```text
logical event (stable event_id + body)
  -> attempt 1
       +-- 2xx ----------------------> delivered
       +-- network/timeout/408/5xx --> wait 300ms -> attempt 2
       +-- 429 ----------------------> wait 1s ----> attempt 2
       `-- other 4xx ----------------> failed
```

- Timeout de 5 segundos por requisição; no máximo dois envios.
- 2xx é considerado sucesso de recebimento pelo servidor, sem parsear o response body em busca de código de negócio.
- Após a segunda falha, `TelemetryCore` mantém a semântica de reject; o helper de UI existente continua engolindo as falhas e o negócio não sofre rollback.
- `TelemetryCore` registra um único warn final, anonimizado, contendo apenas nome do evento, event ID, número de attempts, classificação de status e duração;
  detalhes por attempt ficam apenas em debug.
- O servidor deduplica por `event_id`; o requisito de aceitação é duplicidade de negócio igual a zero após a deduplicação, e requisições originais com o mesmo `event_id` são permitidas.

## Drain na saída

`TelemetryCore` rastreia, dentro do processo Main, os relatórios lógicos que ainda não kolidiram (settled). Na saída normal,
`flushPendingReports({ timeoutMs: 2000 })` entra em paralelo com a limpeza de Host, Cron e configurações de janela na barreira
`prepareAppQuit`.

O flush continua aguardando, dentro do deadline, os in-flight que surgirem durante a espera; retorna mais cedo assim que o conjunto fica vazio. Ao expirar, registra apenas a quantidade restante,
sem cancelar o negócio, sem alterar o resultado da saída e sem estender a saída indefinidamente.

## Limites de performance

- O caminho normal 2xx continua com uma única requisição; os cabeçalhos comuns não adicionam IO de disco, e o Authorization é lido e reconferido de forma assíncrona a cada attempt pelo serviço de credenciais existente.
- As retentativas só ocorrem em falhas recuperáveis, com no máximo uma requisição extra.
- O timeout de 5 segundos substitui o travamento indefinido, tornando memória e conexões limitadas no cenário de falha.
- A saída aguarda em paralelo por no máximo 2 segundos, sem amplificar serialmente o orçamento de saída existente.

## Verificação e aceitação

Os testes unitários cobrem sucesso após erro de rede, 408/429/5xx, 4xx permanente, abort da requisição, corpo/event ID estáveis, alerta final,
drain dinâmico e timeout de drain. O teste de saída do desktop verifica que o flush de telemetry já entrou em paralelo na barreira existente.

Após o lançamento, contar apenas clientes desktop que contenham a versão corrigida, observando continuamente três dias naturais completos. Usar como denominador o `off_peak_task_id` deduplicado criado com sucesso e como numerador o número deduplicado de tarefas com telemetry correspondente, atribuídos pelo dia de criação da tarefa de negócio.
O objetivo é elevar de cerca de 87,6% para pelo menos 95%, com melhoria absoluta de no mínimo 5 pontos percentuais.

Se o objetivo não for atingido, desenhar separadamente uma outbox persistente, recuperação na inicialização e reenvio para offline prolongado.