# Todo 44：Repo Wiki Agent Runtime Headers e cadeia de cancelamento

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: investigação de runtime no MacBook Air por ausência de artefatos do Repo Wiki

## 1. Sintoma do problema

Após disparar a geração do Repo Wiki para vários repositórios no MacBook Air, a interface permanecia em execução por muito tempo, sem Catalog, rascunhos de página ou Wiki final.
A tarefa podia falhar接近 de uma hora depois, registrando:

```text
Timeout da requisição de modelo do Wiki (900000ms)
```

Não se trata de problema de banco de dados, velocidade do modelo ou projeção de páginas do Wiki. As evidências de runtime mostram que:

- o chat comum, o Session Title e a Web Search do mesmo Team Plan recebem SSE do modelo normalmente;
- o Repo Wiki Agent já concluiu a inicialização, o Provider/Model Readiness e a criação do Active Model;
- a requisição do Repo Wiki não tem log de recebimento correspondente dos Host Runtime Headers;
- o processo do Repo Wiki Agent não estabeleceu conexão TCP com o serviço de modelo;
- o fluxo do modelo não tem chunk SSE, incremento de texto ou chamada de ferramenta;
- `draft.json` não é escrito antes do Catalog ter sucesso, portanto não há nenhum artefato intermediário para exibir.

Conclusão: a primeira requisição de modelo do Repo Wiki ficou travada na etapa de preparação do material de acesso em tempo de execução do Provider da conta, sem ainda ter enviado o HTTP.

## 2. Cadeia normal de chamada de modelo

```text
Repo Wiki Service
        |
        | workspace/generateText
        v
Desktop Local Host / Services
        |
        | ZCode Protocol over stdio
        v
repo-wiki Agent Process
        |
        | Registry -> ModelFactory -> Active Model -> Adapter
        v
Preparação do material de acesso em tempo de execução do Account Provider
        |
        | interaction/requestProviderRuntimeHeaders（RPC reverso）
        v
Host Account Credential Service
        |
        | Runtime Headers response
        v
Agent Adapter
        |
        | HTTP / SSE
        v
Serviço de modelo
```

O API Key Provider permite que o Agent obtenha material de acesso estático a partir do Personal Provider Config; o material de acesso em tempo de execução dos Providers de conta (Team, Individual, Start Plan etc.) é fornecido pelo serviço de contas do Host. O Host não reconstrói o Model nem forma um segundo conjunto de Provider Config; ele apenas responde à RPC reversa de Runtime Headers emitida pelo Agent antes da requisição formal de modelo.

## 3. Causa raiz confirmada

### 3.1 O cliente do Repo Wiki não instala os Host Protocol Handlers

O Agent Client comum executa `wireClient(client, workspace)` após obter o client. Essa função não só consome notificações, como também registra as RPCs reversas de Agent -> Host, incluindo `interaction/requestProviderRuntimeHeaders`.

Para isolar a geração em segundo plano de vários minutos, o Repo Wiki usa um `repoWikiProcessManager` independente. Atualmente `getRepoWikiClient()` apenas executa:

```ts
const client = await repoWikiProcessManager.getClient(params);
repoWikiProcessManager.markReady(params, client);
return client;
```

Não há chamada a `wireClient(client, params)`. O resultado é:

```text
O Agent emite uma Runtime Headers Request
        |
        v
O Host ZCodeProtocolClient resolve com sucesso
        |
        v
requestEmitter.fire(request)
        |
        v
0 ouvintes
        |
        v
Ninguém responde, a Promise do Agent permanece pendente
```

A premissa "não wirear handlers de notificação (o Wiki só precisa de requisição-resposta)" existente em `docs/repo-wiki/repo-wiki-agent-lane.md` está errada: ela só considera o par requisição-resposta Host -> Agent e esquece as requisições reversas Agent -> Host. O isolamento de Lane deve isolar apenas processo, fila e ciclo de vida, sem cortar a capacidade de Host Protocol.

### 3.2 A requisição reversa de Runtime Headers realmente não tem timeout padrão

O `requestClient()` do Agent só cria um timer quando o chamador fornece explicitamente `options.timeoutMs`:

```ts
if (options?.timeoutMs !== undefined) {
  pending.timeout = setTimeout(...);
}
```

A porta de Runtime Headers só repassa o `AbortSignal` da requisição de modelo pai, sem repassar `timeoutMs`. Portanto essa Promise só termina nos seguintes eventos:

```text
Resposta normal do Host
Disparo do AbortSignal pai
Fechamento da conexão de Protocol
```

Não existe um timeout de RPC reversa oculto de 3 minutos ou outro valor padrão. O default de 3 minutos do Protocol Client comum Host -> Agent é outra camada; o Repo Wiki ainda sobrescreve explicitamente essa camada com "Wiki Deadline + buffer de cancelamento de 30 segundos", o que não deve ser confundido com as requisições reversas Agent -> Host.

### 3.3 `workspace/cancelGenerateText` não consegue entrar no Agent em execução

O Deadline de um único modelo do Repo Wiki é de 900 segundos. Ao atingir o Deadline, o Host interrompe a espera local e envia `workspace/cancelGenerateText`, esperando acionar o `AbortController` que o Agent guardou para esta operation.

Porém o NDJSON Transport do Agent processa as requisições de forma serial, e hoje apenas `session/stop` pode ultrapassar requisições em voo:

```text
workspace/generateText
└─ aguardando Runtime Headers, o handler não retorna

workspace/cancelGenerateText
└─ enfileirado depois de generateText, não pode executar
```

Forma-se então:

```text
generateText espera o AbortSignal
AbortSignal espera o handler de cancelamento
handler de cancelamento espera generateText retornar
```

O cancel RPC no lado do Host expira em 5 segundos, mas esse timeout best-effort é explicitamente isento do回收 de processo pelo Process Manager; o `AbortController` interno do Agent não é acionado, e a Promise de Runtime Headers e a antiga requisição física continuam vivas.

### 3.4 A retry amplia uma falha determinística para cerca de uma hora

O Repo Wiki usa `maxRetries = 3` por padrão, com semântica de primeira requisição mais três retries. Cada Deadline local do Host é de 15 minutos:

```text
attempt 1：15 minutos
attempt 2：15 minutos
attempt 3：15 minutos
attempt 4：15 minutos
-------------------
falha final após cerca de 60 minutos
```

Como a requisição física antiga não é cancelada, as requisições posteriores de cancel e generate se acumulam atrás da primeira requisição em voo. A camada de Service termina repetidamente a espera local, mas a fila do Agent realmente não avança.

## 4. Decisões de design

### 4.1 O isolamento de Lane não altera as capacidades do Host

```text
Chat Lane
├─ 独立进程与请求队列
└─ 完整 Host Protocol Wiring

Repo Wiki Lane
├─ 独立进程与请求队列
└─ 完整 Host Protocol Wiring
```

Todo Client produzido por `ZCodeAgentProcessManager` e que tenha permissão de executar um Model formal deve instalar os Host Protocol Handlers. Não se deve duplicar para o Repo Wiki uma lógica de Account Auth, Runtime Headers ou resolução de Provider.

### 4.2 A mensagem de cancelamento pertence ao plano de controle

`workspace/cancelGenerateText`, assim como `session/stop`, precisa ultrapassar a espera assíncrona da requisição anterior, entrando no handler e建立起 o AbortController. A requisição de cancelamento não pode ficar enfileirada atrás da conclusão da operação que está sendo cancelada.

### 4.3 O cancelamento do pai é o principal limite de prazo deste ciclo

Este ciclo não mascara o problema 增加ando um timeout fixo arbitrário para Runtime Headers. A resposta automática do Host para Team/Individual e a interação em tempo de execução que o Start Plan pode exigir não têm a mesma semântica de duração; Runtime Headers pode continuar herdando o `AbortSignal` da requisição de modelo pai, desde que o cancelamento do pai realmente chegue ao Agent.

Se futuramente for necessário um prazo curto independente para Headers automáticos de conta, isso deve ser definido como um contrato separado, distinguindo por comportamento de Account Access, e não ser incluído aqui por conveniência.

### 4.4 A requisição física antiga precisa terminar antes da retry

Antes de iniciar qualquer retry do Repo Wiki, a operation do Agent da attempt anterior já deve ter terminado ou recebido um cancel acknowledgement explícito. É proibido encerrar apenas a Promise local de Services e continuar empilhando requisições de modelo por baixo.

A retry existente cobre resposta vazia, JSON inválido, saída truncada e erros temporários de Provider. Este Todo primeiro prova que não ocorre sobreposição de requisições físicas; se vale ainda excluir timeout, autenticação, configuração e erros de Protocol do conjunto retryável, o fechamento mínimo deve se basear na classificação de erros atual revelada pelos testes, sem criar uma abstração genérica de Retry Policy.

## 5. Plano de implementação

### 5.1 Testes primeiro: Runtime Headers reversos do Repo Wiki

Estender os testes da Lane do Repo Wiki, sem se limitar a um Mock retornado com sucesso direto por `client.request()`. O Client de teste deve emitir ativamente `interaction/requestProviderRuntimeHeaders` e afirmar que:

1. o Client do Repo Wiki instalou o Host Request Handler;
2. o Host respondeu usando o serviço formal de Account Runtime Headers;
3. o Agent só continuou a requisição de modelo após receber a response;
4. não foi introduzido Host Registry Snapshot, Provider Config exclusivo do Repo Wiki ou uma segunda implementação de autenticação.

### 5.2 Corrigir o Wiring do Client

- `getRepoWikiClient()` executa o `wireClient(client, params)` idempotente antes de `markReady` e do retorno;
- manter a semântica de instalação única de `wiredClients`;
- atualizar `repo-wiki-agent-lane.md`, removendo a conclusão incorreta "Repo Wiki não wireia";
- a Lane continua fora do `activeClientsByWorkspaceKey` do Chat, sem alterar o isolamento de processo e o回收 de estado terminal.

### 5.3 Testes primeiro: cancelamento via Transport real

Usar um `ZCodeProtocolNdjsonConnection` real, em vez de chamar `server.handleMessage()` diretamente:

```text
generateText handler 已开始并挂起
        |
        v
发送 workspace/cancelGenerateText
        |
        v
cancel 越过在飞请求
        |
        v
Agent operation AbortSignal 触发
        |
        v
Runtime Headers request 拒绝
        |
        v
generateText 结束并释放队列
```

Afirmar que a cancel response é `cancelled: true`, que a requisição em voo terminou e que as requisições comuns seguintes ainda podem executar.

### 5.4 Corrigir a fila de cancelamento

Em `shouldBypassProcessingQueue()` do Transport, colocar `workspace/cancelGenerateText` na mesma fronteira de plano de controle que `session/stop`.
Continuar aguardando, antes do bypass, que a requisição anterior realmente entre no handler, para evitar que o cancel vire uma operação vazia antes do registro do AbortController.

### 5.5 Prova de concorrência das retries

Adicionar testes de Deadline/Retry registrando entrada, saída e contagem de concorrência das attempts físicas de baixo nível:

```ts
maxConcurrentPhysicalRequests === 1;
```

É preciso provar que a attempt N+1 só começa depois de a attempt N ter sido abortada e liberada. Se o Service atual ainda conseguir retry imediatamente quando o cancel não é confirmado, corrigir a temporização de forma mínima, sem criar uma segunda fila de tarefas.

### 5.6 Trilha de diagnóstico

Manter logs de ciclo de vida de baixa frequência, suficientes para distinguir:

```text
Runtime Headers requested
Runtime Headers applied / failed
HTTP request started
SSE first chunk received
attempt aborted / completed
retry scheduled
```

Cada chunk SSE e conteúdo de alto volume continuam em debug, sem aumentar a enxurrada de logs em produção e sem registrar o corpo de Headers ou credenciais.

## 6. Fora de escopo explícito

- não aumentar o Deadline de 15 minutos do Repo Wiki;
- não aumentar o número padrão de retries;
- não criar Registry, Config, Model, Headers DTO ou Account Auth exclusivos do Repo Wiki;
- não deixar o Host reconstruir o Active Model;
- não impor um timeout fixo arbitrário único a todas as RPCs reversas Agent -> Host;
- não fazer uma grande reformulação de protocolo "já processado?" para o Event Emitter;
- não modificar as fronteiras de estado de Session/Task do Chat comum, do Desktop continuous ou do Mobile replayable.

## 7. Plano de verificação

1. testes direcionados de Services da Lane do Repo Wiki;
2. testes direcionados de Services de Account Runtime Headers;
3. testes de requisições bidirecionais do ZCode Protocol no Bootstrap e de cancelamento via Transport real;
4. testes direcionados de Deadline, Retry e回收 de estado terminal do Repo Wiki;
5. uma validação vertical local do Repo Wiki cada para API Key Provider e Account Provider;
6. confirmação em runtime da ocorrência de Runtime Headers applied, TCP/HTTP com o serviço de modelo e o primeiro pacote SSE no Account Provider;
7. após parada ou Deadline, confirmar que não há operation remanescente no Agent e que a próxima geração pode começar imediatamente;
8. typecheck dos pacotes relacionados, `pnpm typecheck` na raiz, `pnpm lint`, verificação de formatação e `git diff --check`.

Se o HTTP já foi efetivamente enviado mas o modelo ainda falhar, usar captura de rede em `/v1/messages` para localizar Provider, corpo da requisição ou SSE; antes da etapa HTTP não se deve substituir a verificação da causa raiz de Protocol por uma captura vazia.

## 8. Critérios de conclusão

- o Account Provider do Repo Wiki consegue completar a RPC reversa de Runtime Headers e emitir um HTTP de modelo real;
- o comportamento do API Key Provider não regride;
- após o sucesso do Catalog, `draft.json` é gravado normalmente e o fluxo de geração de páginas e `wiki.json` é restaurado;
- `workspace/cancelGenerateText` consegue executar durante um `workspace/generateText` em voo e acionar o AbortSignal do Agent;
- Deadline, parada do usuário e estado terminal da tarefa não deixam requisições físicas do Repo Wiki nem operations do Agent pendentes;
- a concorrência máxima das requisições físicas de retry é 1;
- a documentação, os testes e a implementação da Repo Wiki Lane são consistentes quanto à "Wiring completo de Host Protocol";
- não criar uma segunda autoridade de Provider/Model/Account, nem mascarar falhas aumentando timeout ou retries.

## 9. Registro de implementação

2026-08-28 concluído:

- o Client independente do Repo Wiki reutiliza o `wireClient()` formal antes de entrar em Ready, e o `interaction/requestProviderRuntimeHeaders` do Account Provider já é respondido pelo serviço de contas do Host;
- `workspace/cancelGenerateText` e `session/stop` entram no mesmo bypass de plano de controle do Transport, mas ainda aguardam que o `workspace/generateText` anterior tenha estabelecido o operation controller, evitando que um cancel antecipado vire operação vazia;
- a implementação de Deadline e retry de Services foi mantida inalterada. O teste NDJSON real provou que o cancel libera primeiro a requisição antiga e só então a requisição comum seguinte entra no handler, com `maxConcurrentPhysicalRequests === 1`; portanto não há necessidade de uma nova fila de confirmação de cancelamento ou de Retry Policy;
- foram adicionados logs de ciclo de vida de baixa frequência para Runtime Headers requested / applied / failed, sem registrar o corpo de Headers ou credenciais;
- atualização dos fatos atuais da Repo Wiki Lane: a Lane isola processo, fila e ciclo de vida, não a capacidade de Host Protocol.

Resultados da verificação:

- testes direcionados da Repo Wiki Lane, de Account Runtime Headers e de Deadline/Retry de Services aprovados;
- 13 itens do arquivo completo de Bootstrap Transport aprovados, bem como o teste direcionado de cancelamento de workspace do Server;
- typecheck de `@zcode/bootstrap`, `pnpm typecheck` da raiz, `pnpm lint` da raiz, lint dos arquivos modificados e `git diff --check` aprovados;
- o `format:check` completo do CLI ainda relata 296 arquivos de baseline de formatação preexistentes; os arquivos do CLI modificados nesta alteração foram formatados individualmente e a verificação não apontou novos problemas.