# Highspeed: migração para o contrato de modelo pós-refatoração de Provider

> Status: em implementação (2026-09-14)
> Escopo: migrar o roteamento de inferência de turno único do cartão de aceleração Highspeed do já descontinuado `turnRuntimeModel` para
> `modelSelection` + `modelExecution{selectionScope:"execution"}`, e adicionar para as requisições aceleradas o
> Access mode `highspeed` da `zhipu-account`.
> Relacionado: [highspeed-card-spec.md](./highspeed-card-spec.md),
> `docs/working-memory/provider-refactor/steps/todo-142-start-offpeak-signing-exceptions.md`

## 1. Contexto e problema

O Highspeed foi entregue antes da refatoração de Provider; ele usava `turnRuntimeModel` (`zcodeModelRuntimeConfigSchema`)
para empacotar 「qual modelo usar neste turno」 e 「com qual endpoint/credencial chamar」 num único objeto enviado junto com a mensagem:

```ts
// contrato descontinuado: fatos estáticos e credenciais dinâmicas misturados em um objeto
turnRuntimeModel: {
  revision: `highspeed-${cardId}`,
  model: { providerId: "highspeed", modelId: card.model },
  provider: {
    providerId: "highspeed",
    kind: "anthropic",
    baseURL: `${origin}/api/v1/highspeed/anthropic`,  // fato estático
    apiKey: { source: "inline", value: jwt },          // credencial dinâmica
    headers: { Authorization: `Bearer ${jwt}`, "X-Highspeed-Card-ID": cardId },
    models: [{ modelId: card.model }],
  },
}
```

A refatoração de Provider removeu toda a família de contratos `zcodeModelRuntimeConfigSchema` / `zcodeModelRefSchema` /
`zcodeModelProviderInputSchema`, sendo substituída pela regra de **separação estático/dinâmico**:

- Endpoint, formato de API, capacidades do modelo e demais **fatos estáticos** só podem vir do ZCode Built-in Provider Config;
- Apenas o **material de autenticação dinâmico de uma execução isolada** (`apiKey` / `headers`) é enviado junto com a mensagem.

Ao mesmo tempo, o critério de isenção da verificação de segurança de requisições da versão oficial foi convergido de 「lista branca de caminhos de endpoint」 para um Adapter compartilhado que decide pelo Access mode; o Todo142 proíbe explicitamente isenções decididas por Provider ID, nome de modelo, conteúdo de Key ou caminho de endpoint.
A isenção por lista branca de caminhos de endpoint da qual o Highspeed dependia foi removida junto com a refatoração.

## 2. Decisões de migração

Highspeed e Off-Peak são **o mesmo tipo de problema**: turno único, não persistente, credenciais dinâmicas, Provider oculto,
gateway compartilhado `zcode.z.ai` e isento da verificação de segurança de requisições da versão oficial. Off-Peak já concluiu a migração durante a refatoração, portanto
Highspeed reaproveita diretamente o mesmo mecanismo, sem criar um pipeline paralelo.

| Aspecto                    | Highspeed antigo                       | Após a migração (alinhado ao Off-Peak)          |
| -------------------------- | -------------------------------------- | ----------------------------------------------- |
| Endpoint/formato de API    | `turnRuntimeModel.provider.baseURL`    | `api.baseUrl` do Built-in Provider Config        |
| Modelo                     | `turnRuntimeModel.model`               | `modelSelection{providerId, modelId}`            |
| Credenciais                | `provider.apiKey` + `provider.headers` | `modelExecution.requestAuth{apiKey, headers}`    |
| Semântica não persistente  | Instala turn overlay, restaura no fim do turno | `modelExecution.selectionScope = "execution"` |
| Isenção da verificação de segurança (versão oficial) | Lista branca de caminhos de endpoint | Decidido por `access.mode`                      |

A semântica de `selectionScope: "execution"` é estritamente mais forte que o overlay antigo: ela nunca escreve na seleção persistente da sessão,
portanto não existe a temporalidade de 「instalar/restaurar em par」 e não é necessária limpeza idempotente. Os antigos
`applyTurnRuntimeModelForPrompt` / `host.applyTurnRuntimeModel` /
`host.clearTurnRuntimeModel` foram descontinuados junto.

## 3. Mudanças de contrato

### 3.1 Novo Access mode

`zcodeProviderAccountAccessSchema.mode` ganha `"highspeed"`:

```ts
mode: z.enum([
  "start-plan",
  "individual-coding-plan",
  "team-coding-plan",
  "off-peak",
  "highspeed",
]),
```

> Limite de nomenclatura: aqui `highspeed` designa a categoria de acesso por conta do **cartão de aceleração**, sem relação com o nome de modelo
> `GLM-5.1-Highspeed` (uma variante comum de modelo rápido) e com o
> `e2e-glmhighspeed` das fixtures de E2E; é apenas coincidência literal.

### 3.2 Novo Built-in Provider (fatos estáticos)

`providerConfigRules.providerRules` em `config/provider/zcode-builtin.json` ganha, de forma isomórfica ao Off-Peak, dois Providers ocultos. O `accountType` do Access é um enum obrigatório e o cartão de aceleração é uma extração dos benefícios de Coding Plan da conta atual, portanto **é obrigatório dividir por Family da conta**, sem migração silenciosa entre Families:

| providerId                        | accountType | baseUrl                                         |
| --------------------------------- | ----------- | ----------------------------------------------- |
| `account:zai-highspeed-card`      | `zai`       | `https://zcode.z.ai/api/v1/highspeed/anthropic` |
| `account:bigmodel-highspeed-card` | `bigmodel`  | o mesmo                                         |

Ambos têm `visibility: "hidden"`, `api.type: "anthropic-messages"`, e `builtinModelIds`
alinhados com o Provider de Coding Plan da mesma Family — o cartão de aceleração reflete o modelo atualmente escolhido pelo usuário
(`card.model` é justamente o model enviado na requisição), a aceleração vem da troca de endpoint e não da troca de modelo.

**As regras de capacidade do site precisam ser adicionadas junto.** `modelConfigRules.providerSiteRules` casa por `baseUrl`,
e sem regra para o novo endpoint ele cai silenciosamente nos valores padrão conservadores de `modelRules`. O endpoint acelerado precisa ficar alinhado item a item com os sites de Coding Plan
(`api.z.ai` / `open.bigmodel.cn` / `zcode-plan`), por isso são adicionadas duas regras:

| Casamento                                               | Propriedades                                                                | Alinhado a qual site                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `https://zcode\.z\.ai/api/v1/highspeed/anthropic/?` | `inputFormat.supportsImage/supportsVideo = true`                           | o mesmo que `zcode-plan`                                              |
| o mesmo + `apiTypeMatch: anthropic-messages`         | `supportsMidConversationSystem = true`, `supportsNativeWebSearch = true`   | o mesmo que `zcode-plan`, **diferente de `off-peak`** (o Todo140 só desliga a busca ociosa) |

A razão é que os fatos de capacidade precisam ser estáveis dentro da mesma sessão, e não oscilar conforme o turno é acelerado ou não:

- `supportsMidConversationSystem` determina se o bloco system pode permanecer no meio da conversa. No mesmo transcript, um
  turno normal `true` e um turno acelerado `false` fariam o mesmo trecho de histórico ser reescrito de duas formas. Todos os sites Zhipu
  (incluindo `off-peak`) são `true`; não há ambiguidade aqui.
- `supportsNativeWebSearch` determina se `shouldExposeWebSearch` expõe o WebSearch ao modelo
  (`apps/zcode-cli/packages/core/src/runtime/methods/config.ts`, que lê o **Active Model deste turno**).
  Definir como `false` faria o conjunto de ferramentas do turno acelerado perder uma ferramenta, o que equivale a transformar 「apenas mudar a velocidade」 em 「mudar o conjunto de ferramentas por efeito colateral」.
- `inputFormat` determina se os anexos podem entrar neste turno. Se a sessão suporta imagens no turno normal mas não no acelerado, uma entrada de imagem já escrita perde a validade no instante do envio.

**O comportamento antigo antes da migração era diferente**: `buildHighspeedTurnRuntimeModel` montava o `baseURL` por conta própria, a configuração não tinha esse site,
então o turno acelerado recebia os valores padrão de `modelRules` (MCS, busca e imagens tudo `false`).
Isso não é uma conclusão de projeto, é apenas o efeito colateral de não haver regra de site. Se o backend confirmar que o endpoint acelerado de fato não repassa native
web search, basta mudar esta propriedade para `false`, sem impacto no restante da superfície da migração.

**O pacote de release do ambiente de teste precisa ser derivado junto.** O arquivo de produção `config/provider/zcode-builtin.json` é a única fonte de edição,
e `config/provider/zcode-builtin.test.json` é derivado mecanicamente por `pnpm provider:config:sync-test`
(o `ZCODE_ENV` escolhe qual é realmente carregado). O script de derivação reescreve o `baseUrl` de `zhipu-account` pela lista branca de endpoints
e copia as regras de site, portanto o novo endpoint acelerado precisa registrar também o endpoint gêmeo de teste, senão `pnpm provider:config:check-test`
lança direto `Unknown account Provider endpoint` e o cartão de aceleração também não obtém Provider no ambiente de teste:

| Local                                                                            | Conteúdo                                                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountEndpoints` em `scripts/sync-test-builtin-provider-config.mjs`           | `https://zcode.z.ai/api/v1/highspeed/anthropic` → `https://zcode.z.ai/api/v1/highspeed/anthropic`                                          |
| `pairs` e as asserções de contagem em `scripts/test/sync-test-builtin-provider-config.test.mjs` | O teste mantém sua própria tabela de endpoints para validar que a lista branca do script não foi alterada errado; ao adicionar um Provider de conta embutido, a contagem de `providerRules` e a de cópias de regras de site derivadas (atualmente 10 / 9) precisam ser atualizadas juntas |

### 3.3 Material de execução de turno único

O ramo `accelerated` de `HighspeedPrepareTurnResult` deixa de retornar `turnRuntimeModel` e passa a retornar
o material de execução que pode ser projetado diretamente no protocolo:

```ts
| {
    kind: "accelerated";
    card: HighspeedCardSnapshot;
    nextDrawAt: number;
    /** O mock mantém apenas a semântica de negócio da aceleração; omitir este campo faz o fluxo continuar na rota de inferência comum da sessão. */
    execution?: {
      modelSelection: ModelSelection;
      requestAuth: { apiKey: string; headers: Record<string, string> };
    };
  }
```

No envio, submetido pelos campos de protocolo já existentes, sem adicionar campos novos:

```ts
sendText({
  modelSelection: execution.modelSelection,
  modelExecution: {
    selectionScope: "execution",
    requestAuth: execution.requestAuth,
  },
  highspeedMeta, // o snapshot do cartão ainda entra como fato de entrada em message.data, sem credenciais
});
```

A semântica de `highspeedMeta` não muda: ele é o **snapshot do cartão usado para projeção**, sem credenciais nem headers, podendo ser persistido;
as credenciais ficam apenas em `modelExecution.requestAuth`, são aceitas somente por `startNow` ocioso e não entram no
`CommandInbox` comum, portanto a superfície de persistência da fila não muda — o que é coerente com a regra antiga 「a fila persiste apenas metadados de cartão sem credenciais」.

### 3.4 Isenção da verificação de segurança

A verificação de segurança de requisições da versão oficial decide a isenção por `access.mode`: `highspeed`, assim como `start-plan` e `off-peak`,
pertence aos modos de conta isentos de verificação. A lista branca de caminhos de endpoint não é restaurada — o Todo142 proíbe decidir exceções por caminho de endpoint.
A implementação concreta existe apenas na versão oficial e não é detalhada aqui.

### 3.5 Fallback de turno único declarativo: `modelExecution.selectionFallback`

**Este é o campo novo que esta migração acrescenta ao contrato de staging** (`packages/shared/src/model-execution.ts`).
A implementação antiga usava a interface de restauração do overlay para voltar ao modelo original nas requisições restantes depois do cartão expirar; como `selectionScope: "execution"`
nunca reescreve a Session Selection, não existe esse passo de 「restauração」, e o solicitante precisa **declarar** qual erro conta como
「credencial de execução inválida neste turno»:

```ts
selectionFallback: {
  providerId: string,
  // casados na ordem declarada; a primeira regra casada determina o motivo do fallback; providerErrorCode ausente significa qualquer falha deste provider
  rules: Array<{
    reason: "highspeed_card_expired" | "highspeed_request_failed",
    providerErrorCode?: string,
  }>,
  // alvo do fallback: a seleção enviada no momento do sorteio do cartão (modelo original da sessão + tier). Só na ausência deste é que se usa a seleção persistente da sessão do runtime.
  target?: ModelSelection,
}
```

O cartão de aceleração declara `[{ reason: "highspeed_card_expired", providerErrorCode: "3402" }, { reason: "highspeed_request_failed" }]`:
cartão expirado é diferenciado por motivo na mensagem, e qualquer outra falha (autenticação, rate limit, 5xx, rede, timeout, interrupção de stream) também faz fallback.

O lado do CLI faz apenas casamento puro (`turn-execution-fallback.ts`, chamado por `turn-model-step.ts`): o `providerId` da execution
Selection deste turno casa com o valor declarado e a atribuição da falha não aponta para outro provider, e então o primeiro item casado na ordem das regras é usado para um único fallback.
**Nada é hardcoded por prefixo de provider id, nome de modelo ou texto de erro** — é a mesma disciplina do Todo142. O motivo do fallback vem da regra casada; o CLI não interpreta códigos de erro por conta própria.

O alvo do fallback vem primeiro do `target` declarado e depois da Session Selection persistente da sessão do runtime. A seleção de escopo execution nunca reescreve a
Session Selection, então normalmente os dois são iguais; mas a seleção persistente da sessão só existe na memória do runtime, e uma recuperação a frio caindo na janela em que o Registry acabou de ficar pronto e os benefícios da conta ainda não foram resolvidos falha na validação e não é vinculada; depois, mesmo que só hajam turnos acelerados, ela nunca mais é vinculada (ver a restrição de regressão abaixo),
portanto o solicitante precisa enviar a seleção do momento do sorteio do cartão como `target` junto com a declaração. A requisição de fallback não carrega mais os `requestDependencies` desta execução, ou seja, usa a autenticação regular do próprio usuário.

Os limites precisam ser mantidos:

- **Fallback apenas uma vez**: após o fallback, `state.selectionFallback` é limpo; se o modelo comum falhar de novo, o turno inteiro falha com o erro real.
- **Falhar obrigatoriamente quando não há para onde recuar**: quando o `target` declarado e o `modelSelection` persistente da sessão estão ambos ausentes ou não resolvíveis,
  o turno falha com o erro real. Na implementação antiga o `if (fallbackModel)` era sempre verdadeiro e enterrava esse ramo sob outro erro;
  agora a tentativa é modelada pela ordem dos candidatos, um candidato não resolvível (inexistente no Registry) é apenas pulado sem interromper e, quando todos falham, é registrado um
  `warn` de `model.execution_selection.fallback_unavailable` e o erro original é devolvido.
- **Restrição de regressão (retrospectiva de logs de 2026-10-09)**: o alvo do fallback chegou a depender apenas da seleção persistente da sessão do runtime. A recuperação a frio após reiniciar o desktop
  é concluída em até 600ms depois do Provider Registry ficar pronto; nesse momento o provider de conta ainda está `entitled:false` e sem modelos publicados, a
  validação da seleção persistida dá `provider-not-found` e nada é vinculado; depois disso os dois turnos seguintes são turnos acelerados, o runtime nunca tem seleção persistente,
  e no 3402 o downgrade era pulado em silêncio e o turno falhava por completo. Com o `target` declarado pelo solicitante, nada mais depende dessa temporalidade.
- **Falhas que não fazem downgrade**: o cancelamento do usuário e o estouro da janela de contexto não casam com nenhuma regra; o estouro de janela continua sendo delegado ao reactive compact. Falhas locais do runtime sem atribuição de provider/rede, como persistência de eventos e projeção, também não podem ser jul erroneamente como falha de requisição acelerada pelas regras de fallback.
- **O fallback tem precedência sobre o stream recovery do mesmo modelo**: a ordem de tratamento da falha é fallback declarativo → stream recovery →
  nova tentativa de Start Plan admission → compact por estouro de janela → falha do turno inteiro. Se a falha casar com a declaração de fallback mas todos os alvos forem não resolvíveis,
  é obrigatório falhar direto com o erro real, sem continuar fazendo stream recovery no modelo acelerado. Se o fallback viesse depois do recovery, uma interrupção de stream tentaria de novo no
  modelo acelerado até esgotar o orçamento. Quando `TurnExecutionModelFallback` chega à projeção, os streams de text/reasoning descartados precisam ser marcados como `interrupted` primeiro,
  e as linhas de ferramenta `inputStreaming` ainda não consolidadas como `cancelled`; a saída posterior do modelo original
  precisa abrir uma nova linha, não pode ser concatenada com a saída acelerada nem rotular a saída descartada como concluída.
- **Handle de execução com 0 retentativas**: um handle de modelo de escopo de execução com `selectionFallback` cuja Selection aponta para o provider declarado
  é vinculado a `ModelRetryBudget.SingleAttempt` (`createTurnModel(..., { retryBudget })`), e a camada de adaptação reduz o `maxAttempts` dessa requisição para 1; o handle do modelo de sessão após o fallback mantém o orçamento padrão por taskType.

### 3.6 Validação de protocolo: `modelExecution` não pode aparecer sozinho

`modelExecution` só descreve 「como chamar」; a Selection é quem diz 「chamar quem」。Depois da separação dos dois, é preciso garantir na camada de protocolo
que nunca apareça uma requisição 「com credenciais mas sem seleção」, senão a fase de execução usará as credenciais do cartão de aceleração para chamar o Provider padrão da sessão.
Cada uma das três comandos em `packages/shared/src/zcode-protocol-v4/command.ts` ganha uma superRefine:

| Comando             | Antes da migração | Depois da migração                                  |
| ------------------- | ----------------- | --------------------------------------------------- |
| `sendText`          | já tinha          | mantido                                              |
| `editUserQuery`     | não tinha         | **novo** `modelExecution requires modelSelection`   |
| `sendQueuedNow`     | não tinha         | **novo**, o mesmo                                   |

`editUserQuery` / `sendQueuedNow` são as duas únicas entradas pelas quais o Highspeed pode iniciar novamente um turno acelerado;
antes da migração elas carregavam o modelo por conta própria via `turnRuntimeModel` e por isso não precisavam de validação.

### 3.7 Resolução de Access: o cartão de aceleração não é um plano independente

Tanto `off-peak` quanto `highspeed` não são planos independentes, e sim pontos de entrada de execução derivados de um 「Coding Plan pessoal/equipe já conectado」:
a autenticação no momento da requisição vem, respectivamente, do ticket e do JWT do cartão de aceleração, e não há uma Key de plano em si validável.
`accountProviderConnectionResolver.ts` extrai as três decisões literais de `mode === "off-peak"` que existiam em staging para `isCodingPlanDerivedMode(mode)`, cobrindo ao mesmo tempo os dois modos derivados:

1. O conjunto de candidatos da validação de disponibilidade do Coding Plan (modos derivados não contam como plano configurado);
2. A projeção de disponibilidade (a disponibilidade de um Provider derivado acompanha a escolha atual de Coding Plan);
3. `resolveCurrentAccountAccess`: modos derivados exigem apenas que a escolha atual seja um Coding Plan individual/equipe,
   sem comparar diretamente por `selection.kind === mode`.

Assim, o `access.mode = "highspeed"` estático do Provider de aceleração é resolvido como o fato de acesso **atual** do Coding Plan individual/equipe do usuário, e os benefícios antigos não ficam congelados depois de trocar de conta.

### 3.8 Estatísticas de tempo economizado: `CodingPlanRegularTpsRequest.accountAccess`

`CodingPlanRegularTpsRequest` em `packages/shared/src/usage-stats.ts` passa de
`organizationId` / `projectId` para `accountAccess` obrigatório:

```ts
accountAccess: ZCodeProviderAccountAccess | ZCodeAccountAccess;
```

Causa do bug: antes essa requisição só carregava org/project e a autenticação no momento da requisição dependia de o host adivinhar a conta por provider.
Após a refatoração de Provider, a autorização do Coding Plan é resolvida uniformemente por `accountAccess` (o escopo Team já está contido nele),
e quando ausente `resolveAuthorization` necessariamente devolve `null`, e o 「tempo economizado」 é silenciosamente não exibido.
A chave de cache passou a ser o objeto de access inteiro, e não mais a tupla org/project.

### 3.9 Payload do evento: renomeação de campos em `TurnExecutionModelFallbackPayload`

`ModelRef` foi removido junto com a refatoração, e os dois campos do evento de fallback foram renomeados (`contracts/src/events/session.events.ts`):

| Antes da migração                  | Depois da migração                        |
| ---------------------------------- | ----------------------------------------- |
| `fromModelRef: ModelRef`           | `fromModelSelection: ModelSelection`      |
| `toModelRef: ModelRef`             | `toModelSelection: ModelSelection`        |

Esta é uma **mudança no formato do payload de evento persistido**, mas o evento é exclusivo do Highspeed e só é produzido quando o cartão expira,
sem superfície de compatibilidade entre versões: o ramo highspeed anterior à migração nunca foi publicado.

### 3.10 Caminho de envio do Renderer

O `dispatchCommand` em `packages/ui/src/v4/SessionPane.tsx` insere o 7º parâmetro posicional `highspeedCard`
depois do 6º argumento `telemetrySeed`, e o 7º original de staging `onEnvelopeCreated` passa para a 8ª posição. Todos os pontos de chamada foram conferidos, não há nenhum local passando o callback como se fosse o snapshot do cartão.

O primeiro envio de uma sessão em rascunho não pode mais reutilizar `createSession.firstInput`: o sorteio do cartão precisa obter o `sessionId` real
(usado para atribuição de sorteio in-flight e reaproveitamento de cartão), portanto o primeiro envio passa uniformemente por `createSession` + um `sendText` separado.
**Custo: mesmo um primeiro envio sem anexo ganha uma ida e volta a mais.** Isso é para fazer o sorteio e o envio compartilharem a mesma identidade de sessão,
evitando um estado pendente no caminho firstInput do tipo 「cartão sorteado mas id da sessão desconhecido».

## 4. Sequência (após a migração)

```text
Renderer                       Highspeed service            CLI admission            Adapter
   | prepare(task, model)              |                          |                     |
   |---------------------------------->| draw / reuse card        |                     |
   |                                   |                          |                     |
   |<-- accelerated{card, execution} --|                          |                     |
   |                                                              |                     |
   | sendText{modelSelection, modelExecution{execution, auth},     |                     |
   |          highspeedMeta}                                       |                     |
   |-------------------------------------------------------------->|                     |
   |                                          selectionScope=execution                   |
   |                                          => não escreve a seleção persistente da sessão │
   |                                          => dispensa instalar/restaurar overlay          |
   |                                                              |                     |
   |                                          resolve provider by providerId             |
   |                                          (Built-in Config: baseUrl/api/models)      |
   |                                                              |-------------------->|
   |                                                              |  access.mode=highspeed
   |                                                              |  => isento da verificação de segurança da versão oficial
   |                                                              |  => envia a requisição direto com requestAuth
```

## 5. Semânticas que não mudam

As regras existentes abaixo não são afetadas por esta migração e precisam ser mantidas na implementação:

- O turno disparado por Automation (quando existe `automationId` neste turno) não participa do sorteio de cartão; mesmo que receba material de execução por engano,
  o CLI precisa ignorá-lo e continuar ocultando a escrita de ferramentas da Automation.
- Fallback de 1 segundo, autoridade do cooldown `next_draw_at`, um único sorteio in-flight, cartão externo enviado silenciosamente como comum.
- Quando o cartão expira no meio do Turn (`HTTP 400 / provider_code=3402`), o contexto é preservado, as requisições de modelo restantes voltam ao
  modelo de sessão original de antes do envio e há apenas uma notificação. O modelo original ainda precisa ser resolvido a partir do catálogo de modelos de workspace atualmente válido.
- Em runtime, o Core `activeTurn` é a fonte final da verdade; carregar material de execução não muda a semântica de admissão da `queue`.
- Quando o mock é sorteado, ele ainda devolve apenas o estado de negócio `accelerated`, sem `execution`, e o fluxo de mensagens continua pelo provider/model comum da sessão e pela interface de inferência original.

## 6. Desvios residuais conhecidos

Os dois itens abaixo foram descobertos nesta migração, mas **são dívidas já existentes do próprio staging**, não fazem parte do escopo desta migração e são registrados aqui para não serem depois Tomados como introduzidos pela migração:

### 6.1 A proibição de ponte do `v4-native-boundary` já está vermelha

`v4-native-boundary.test.ts` afirma que nenhum arquivo sob `zcode-protocol-v4/` pode importar
`zcode-protocol/`. O próprio staging já tem 3 violações (`session-flow.ts`, `goal-compact.ts`,
`prompt-turn.ts`). Esta migração faz `fork-edit-retry.ts` e `queue.ts` também buscarem
`createModelExecutionContext` de `../../../zcode-protocol/model-execution.js`, somando 2 linhas à
lista de violações.

A escolha foi manter a mesma forma de import do staging (`session-flow.ts` busca exatamente o mesmo símbolo, no mesmo caminho),
sem criar um shim só para o caminho acelerado; a correção é mover `model-execution.ts` para a árvore v4 e corrigir as 5 ocorrências de uma vez,
o que faz parte do trabalho de fechamento M4 do staging.

### 6.2 Arquivos de teste do CLI não entram no typecheck

O `include` de `apps/zcode-cli/packages/bootstrap/tsconfig.json` cobre apenas `src/**/*`,
então arquivos de teste não entram no `tsc --noEmit`. A consequência já aconteceu de fato: em `transcript-hydration.test.ts`, as fixtures
relacionadas ao Highspeed ainda usavam, após a refatoração de Provider, os nomes de chave removidos `providerID` / `modelID`,
todas as selections viravam `undefined` silenciosamente e a asserção 「o turno acelerado não participa da linha de base de troca de modelo comum」 passava **falsamente** por um longo tempo
(0 markers contra 0 markers). Só depois de corrigir os nomes de chave o teste passou a valer de fato.

## 7. Verificação

- `pnpm typecheck`, `pnpm lint`
- shared: `zcodeProtocolV4Command.test.ts`
- services: `highspeedCardService.test.ts`
- provider-node: `builtin-provider-build.test.ts` (inclui o contrato `sync-test`: o arquivo de produção é consistente com o pacote de teste derivado)
- ui: `highspeed/highspeedSend.test.ts`
- CLI bootstrap: `v4-native-commands.test.ts`, `v4-native-queue.test.ts`,
  `v4-native-fork-edit-retry.test.ts`, `automation-port.test.ts`,
  `transcript-hydration.test.ts`, `session-persistence.test.ts`
- e2e: `conversation-session-highspeed-card.test.ts`