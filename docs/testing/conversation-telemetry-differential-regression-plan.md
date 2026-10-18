# Plano de testes de regressão e diferencial da telemetria de conversa entre versões antiga e nova

Este documento define o método diferencial de telemetria de runtime entre `z-code-2` e o caminho principal de conversation do V4, além do contrato de regressão automatizada que precisa sobreviver depois da confirmação do diferencial. O objetivo não é apenas fazer uma captura manual única, mas converter a compatibilidade legada em golden, integration e Electron E2E repetíveis, para impedir que uma futura refatoração de conversation apague novamente pontos de telemetria ou entradas de disparo de negócio.

## Resumo da mudança

| Campo | Conclusão |
| --- | --- |
| Natureza da mudança | Recuperação de compatibilidade e proteção de regressão após a refatoração de conversation do V4 |
| Base de compatibilidade | O comportamento real de desktop de `~/workspace/z-code-2`; as exceções já confirmadas do spec do V4 têm prioridade |
| Superfícies principais | composer do V4, session pane, assistant feedback, quota banner, banner de erro |
| Relatórios efetivamente usados | `/event/report` e o custom event do ARMS |
| Escopo de cliente | `desktop-continuous` no desktop reporta de fato; Web/celular apenas validam no-op e isolamento |
| Escopo de provider | Telemetria genérica usa qualquer scripted provider; quota usa a classe equivalente do Start Plan; o case de verificação de segurança da versão oficial usa a classe equivalente do endpoint `zcode-plan` |
| Não objetivos | Compra de produto/ciclo/pagamento/resultado, performance de inicialização, travamento da caixa de entrada, estabilidade/recursos/rede globais do ARMS |

## Registro de esclarecimentos

| Rodada | Pergunta | Confirmação do usuário | Limite fixado |
| --- | --- | --- | --- |
| 1 | Se deve iniciar a aplicação antiga e a nova com o mesmo case e comparar o relato final | Sim | Estabelecer um diferencial de runtime, sem substituir a interseção de código estático |
| 2 | Se valores dinâmicos como timestamps e número de versão precisam ser idênticos valor a valor | Não | Existência do campo, tipo e relações precisam estar corretos; apenas valores dinâmicos explicitamente declarados podem ser normalizados |
| 3 | Se devem ser construídos primeiro os cases que cobrem os cenários | Sim | O catálogo de cases e a poda vêm antes do runner diferencial e do código de E2E |
| 4 | Se o fluxo de compra precisa ser restaurado | Não, só restaurar as entradas relacionadas a conversa | Em quota só se validam o banner de conversa, o guard de envio, a abertura do painel de Upgrade e a passagem de contexto |
| 5 | Se é obrigatório usar GLM | Não | A telemetria principal é provider-neutral; apenas quota e a verificação de segurança da versão oficial usam classes equivalentes de negócio |
| 6 | Se é obrigatório deixar código de regressão | Sim, teste unitário ou E2E | Cada case aceito precisa estar vinculado a pelo menos uma camada de contrato automatizado |

## Escopo

### O que precisa ser comparado e ter regressão

`/event/report`:

- `send_btn`
- `message_completion`
- `agent_step`
- `context_compaction`
- `assistant_message_feedback`

ARMS:

- `perf_ui_first_token`
- `perf_ui_message_complete`
- `perf_ui_turn_breakdown`
- `perf_ui_stream_stall`
- `perf_ui_tool_call_detail`
- `plan_request`
- `plan_ttft`
- `chat_error_banner`

Entradas de negócio de conversa:

- like, dislike, toggle none do assistant feedback, rollback em caso de falha e persistência ao reabrir.
- exibição, dismiss, guard de envio, refresh de entitlement e abertura do painel de Upgrade já existente do quota banner de sessão.
- recuperação limitada da verificação de segurança da versão oficial dentro da chamada de modelo (apenas para a versão oficial).

### Explicitamente fora do escopo

- `purchase_product_select_ck`, `purchase_billing_cycle_select_ck`, `purchase_pay_ck`,
  `purchase_result` e o comportamento do backend de pagamento. A implementação de telemetry de compra não está ausente por causa da refatoração de conversation do V4.
- `perf_ui_launch_*`, `perf_ui_input_lag`, e ARMS main stability/resource/network.
- Relato de rede real em Web/celular.
- Qualidade de saída real dos modelos, SLA dos fornecedores, corretude de entitlement de contas em produção.
- Reenvio de telemetria para sessões históricas, ou gravar o estado de telemetria em snapshot/transcript.

## Estado e cadeia de evidências

```text
case-local provider fixture / synthetic fault
                   |
                   v
        +----------+----------+
        |                     |
        v                     v
 legacy z-code-2        current z-code V4
 isolated E2E home      isolated E2E home
        |                     |
        +----------+----------+
                   |
          capture final boundaries
          |                    |
          v                    v
 /event/report HTTP body   ARMS main sendCustom
          |                    |
          +---------+----------+
                    v
          normalize explicit dynamics
                    |
                    v
 inventory -> keys -> types -> values -> relations -> order
                    |
                    v
         approved legacy golden + regression tests
```

Owner de estado e evidências:

| Estado/fato | Owner autoritativo | Espelho/cache | Evidência de regressão |
| --- | --- | --- | --- |
| session/turn/tool/terminal | CLI V4 runtime | fato vivo do host, supervisor do renderer | replay de provider, fato de protocolo, payload final |
| prompt seed/sourceCommandId | supervisor de workspace do renderer | apenas em memória | ACK de command, relação talk/message, exactly-once |
| refs de sessão em foreground | supervisor de workspace do renderer | refs de visibilidade de pane | estado de UI/pane, presença em ARMS |
| body de `/event/report` | fetch final do serviço de telemetria | sem persistência de negócio | chamadas mockadas de `net.fetch` do Electron |
| body de custom do ARMS | IPC bridge do desktop main | buffer limitado apenas para E2E | argumentos da chamada `armsRum.sendCustom` |
| feedback | linha do assistant + persistência no CLI | estado otimista na UI | ACK de command, linha, reabertura, body do evento |
| quota | usage entitlement service + provider/error da sessão | estado local de dismiss do hook | DOM do banner, guard do composer, contexto do dialog |

## Dimensões de estado e classes de equivalência

| Dimensão | Valores/classe equivalentes incluídos | Forma de poda |
| --- | --- | --- |
| prompt admission | draft create ACK, direct, queued, promotion, rejected | rejected não gera send; promotion é mesclada com o command original |
| terminal | success, failed, interrupted, stop sem terminal | stop sem terminal só gera o case negativo de relato zero |
| stream shape | text, thought, generation, tool success, tool failed, permission wait, chunk filho com parent | Não se enumeram todos os nomes de ferramenta; representam-se por lifecycle/perf equivalentes |
| visibility | foreground, background, pane closed, split pane | vários panes da mesma sessão são colapsados em um; sessões diferentes podem ter foreground independente |
| delivery | live, duplicate live, initial, hydration, recovery | Só live pode produzir fato |
| timing | first token negativo, stall 3000/3001, limpeza de stall por ferramenta, permission wait | Limites exatos usam fake clock/stream gravado, sem replicar todos os valores de duração |
| model network | started, completed, failed, retry_scheduled, stream_stalled | Não inferir a partir de accepted/queued/apiRetry |
| provider | generic, custom hostname, Start Plan, endpoint `zcode-plan` | Não enumerar todos os nomes de modelo ou marcas de fornecedor |
| compaction | success, failed, interrupted, non-terminal, duplicate | status terminal vira golden; foreground/background vira E2E representativa |
| error banner | visible, suppressed, duplicate com a mesma chave, chave nova, 3007 | Deduplicação dentro do mount; invisível não reporta |
| workspace | local, mesmo path com identity/remoteSession diferente, substituição por geração do serviço | Exibição de caminho não se mistura com isolamento de identidade |
| client | desktop continuous, web remote replayable | Web/celular só fazem a prova negativa de no-op/não assinável |

## Decisões de poda

| ID | Combinação podada | Invariante/motivo | Cobertura representativa |
| --- | --- | --- | --- |
| TDP-P01 | Todos os providers concretos × todos os modelos | A telemetria de conversa não tem guard de negócio por marca de modelo | generic + custom hostname; classes equivalentes específicas de quota/segurança da versão oficial |
| TDP-P02 | theme × locale × terminal | Não altera a máquina de estados dos eventos; campos de locale/timezone são cobertos pelo golden do builder | Um único locale de E2E, golden de contexto |
| TDP-P03 | SO × cada case de Electron | Os campos de plataforma do payload são responsabilidade do normalizador shared | E2E na plataforma atual + testes unitários shared/matriz de plataformas do CI |
| TDP-P04 | Enumeração completa de famílias de ferramenta | A telemetria só se importa com lifecycle, permission, allowlist de perf e relação pai-filho | tool success/fail/permission/parented representativos |
| TDP-P05 | Repetir no Web/celular todos os cases de desktop | A especificação legada não prevê relato de rede em Web/celular | reporter no-op + guard de assinatura de telemetria |
| TDP-P06 | purchase product/cycle/pay/result | A implementação de compra não está ausente e não faz parte da recuperação da refatoração de conversation | A passagem de contexto do dialog de quota já encerra |
| TDP-P07 | ARMS de UI em background, compaction em background | Confirmado que a especificação legada é de relato zero | Case negativo dedicado |
| TDP-P08 | Inferir `plan_request` a partir de accepted/queued | O spec do V4 já define que só estados reais de rede do modelo são consumidos | Case de status de rede + relato zero dos estados auxiliares |

## Cases de regressão aceitos

Os `TDP` abaixo são cases de execução atomizados dos `TEL01-TEL09`. Em 2026-07-18, para cada TDP01-TDP19 já foram iniciadas duas instâncias Electron reais (legada e current),
usando a mesma sequência de fatos controlada e comparando o body HTTP final de `/event/report` com o payload
final de ARMS do main. 「Já verificado」 aqui não equivale a promoção para E2E formal: os novos specs diferenciais continuam em pending review.

| ID | TEL correspondente | Setup / Action | Asserções-chave | Contrato automatizado |
| --- | --- | --- | --- | --- |
| TDP01 | TEL01 | Primeiro envio de um novo draft, create ACK e conclusão em texto puro | send preserva o horário original da ação; talkId é definido após o ACK; send/completion/step compartilham sourceCommandId; uma ocorrência cada | Electron E2E + golden de payload completo |
| TDP02 | TEL01 | Dois turnos consecutivos de texto puro na mesma sessão | talkId igual, messageId diferente; step/count do segundo turno não acumulam o primeiro | E2E diferencial Electron novo/antigo; reusa a fixture existente de TEL01 |
| TDP03 | TEL03 | Enviar um prompt queued enquanto está em running e então fazer promotion | send acontece uma única vez, só na primeira aceitação; promotion não reenvia; não há completion antes do terminal | E2E de stream controlado + fake clock do supervisor |
| TDP04 | TEL01 | prompt success, com usage/model request e estado final de texto | completion success com todos os campos legados; token/model/provider/hostname corretos | golden do builder + integração de serviço |
| TDP05 | TEL01 | prompt failed, estado final com e sem usage e com detalhe de erro | campos de fail, string vazia e usage acumulado iguais aos da versão antiga; sem poluição por campos só de success | golden de payload completo |
| TDP06 | TEL01 | terminal interrupted; em outro caminho, stop sem terminal | completion interrupted conforme a especificação legada; sem terminal não se sintetiza completion | golden de payload completo + E2E de stream controlado |
| TDP07 | TEL05 | thought -> text -> terminal | ordem de reasoning e generation step, loop_index, duration e finalização do tail corretos | golden com fake clock |
| TDP08 | TEL05 | tool-first, tool success, tool failed, permission wait, text/thought filho com parent, terminal | A primeira ferramenta principal pode ser o first token; status/waiting do tool step; agregação no completion; tool detail só quando há perf; text com parent não conta como generation mas preserva TTFT/stall legados; thought com parent preserva reasoning/TTFT/stall legados | golden com fake clock + E2E representativa de ferramentas |
| TDP09 | TEL02 | Fluxo A em streaming, troca para B, fecha o pane de A, passa do keep-warm, A terminal e reabertura | completion/step em background uma vez cada; ARMS de UI zerado; o initial de reabertura não reenvia | Electron E2E de stream controlado |
| TDP10 | TEL05 | first token de text/tool/sem token, gap de 3000/3001ms, limpeza por ferramenta, split pane | first token negativo vira zero; o `-1` legado sem token ainda espelha o valor de UI=0 mas não envia plan TTFT; 3000 não reporta, 3001 reporta; ferramenta limpa o tracker; múltiplos panes da mesma sessão contam uma vez | fake clock + Electron E2E de stream gravado |
| TDP11 | TEL04 | compact success/failed/interrupted/non-terminal/duplicate; modelo custom; apenas compactReason; alternância foreground/background | payload completo dos três terminais; modelo custom usa a codificação antiga de UI; compactReason não preenche o reason antigo; non-terminal/duplicate/background sem eventos extras | golden de payload completo + Electron E2E representativa |
| TDP12 | TEL05/TEL09 | Os cinco status reais de model network, alcançados em foreground e background; auxiliares accepted/queued/apiRetry | Contagem de `plan_request`, status/value/hostname anonimizado corretos; estados auxiliares sem relato | golden de payload completo + integração de fato vivo do host |
| TDP13 | TEL05 | plan TTFT normal, negativo, provider ausente, background | Só o valor válido em foreground é reportado; negativo/provider ausente/background não reportam | golden com fake clock |
| TDP14 | TEL06 | Erro comum visível, suprimido por quota/erro local, re-render com a mesma chave, chave nova | Real visível uma vez; suprimido zero vezes; mesma chave no mesmo mount uma vez; truncamento de trace/detail e tipos corretos | teste de componente + Electron E2E |
| TDP15 | TEL07 | like, dislike, toggle none da mesma reação, falha de command, reabertura | Payload legado imediato; entityId é o messageId; rollback em falha; persistência em sucesso | componente + integração de command/projeção + E2E de reabertura |
| TDP16 | TEL08 | Snapshot de quota do Start Plan/gatilho de erro exibindo banner, dismiss, bloqueio/não bloqueio, refresh, Upgrade | Limite/prioridade iguais aos da versão antiga; o dialog realmente abre; `upgradeSource=session_quota_alert`; não valida os eventos de compra subsequentes | integração de estado/componente + Electron E2E |
| TDP17 | TEL06 | Chamada de modelo do Start Plan embutido retorna 3007 (recusa da verificação de segurança da versão oficial) | Aplicável apenas à versão oficial; as asserções são mantidas junto com a especificação de verificação de segurança da versão oficial | integração de adapter/service + E2E de stream com falha |
| TDP18 | TEL09 | live convivendo com duplicate/initial/hydration/recovery; reload do renderer | live exactly-once; demais fontes sem relato; reload não reenvia seed/terminal histórico | integração de gateway/service + Electron E2E de reload |
| TDP19 | TEL09 | identity/remoteSession diferentes com o mesmo workspacePath; substituição de geração do serviço; reporter Web | Isolamento do supervisor e destruição da geração antiga; reporter de Web/celular no-op e sem assinatura do feed real | integração de serviço + teste de fronteira desktop/remote |

## Estratégia de Provider e conta

- TDP01-TDP15, TDP18-TDP19 usam por padrão um scripted provider local; não exigem conta real, API key ou GLM.
- Os cases de provider custom precisam apenas de uma fixture de hostname/path de endpoint, para provar que só o hostname é reportado e que path/query não vazam.
- TDP16 usa o provider ID do Start Plan e uma fixture de entitlement; não depende de uma conta real com quota.
- TDP17 usa uma fixture de provider cujo endpoint termina em `/zcode-plan` ou `/zcode-plan/anthropic`;
  a configuração da verificação de segurança e o 3007 são simulados por um serviço local, sem exigir que o modelo se chame GLM (aplicável apenas à versão oficial).
- Contas/modelos reais são usados só em um smoke de produção opcional depois que toda a automação passa, e não entram no contrato de CI.

## Contrato de captura e comparação entre as duas versões

### Execução isolada

As versões antiga e atual usam diretórios independentes de `ZCODE_E2E_HOME_DIR`, captura de rede, artefatos e log de runtime.
Os pares do mesmo case rodam em série, evitando interferência mútua entre portas, registro de protocolo, replay de provider e carga da máquina. Cada artefato registra:

- SHA de git legacy/current, versão de build e ID do case.
- SHA da fixture e estratégia de timing.
- SO, locale, timezone, tamanho da tela.
- O inventário dos eventos-alvo capturados.

### Pontos de captura

- `/event/report`: o request body final do mock de `net.fetch` do Electron.
- ARMS no renderer: o ring buffer limitado que o build de teste atual já tem, usado para localizar diferenças antes do builder/IPC.
- ARMS no main: captura limitada apenas para E2E adicionada antes de `armsRum.sendCustom`, comparando os parâmetros finais depois que o main completa as dimensões comuns.
- O repositório antigo usa apenas instrumentação E2E temporária; é restaurado limpo depois da execução e ganchos de teste não são tratados como modificação do comportamento antigo.

Builds de produção não podem criar globais de captura, buffers persistentes ou expor IPC de leitura. A captura de teste não pode enviar de verdade para o
`/event/report`/ARMS de produção.

### Whitelist de normalização

Valores diferentes são permitidos desde que o campo exista e o tipo esteja correto:

- UUID de event/request, timestamp de captura.
- `app_version`, SHA de build/git.
- `device_mid`, `renderer_id`.
- IDs opacos como session/message/turn/tool/request.
- Durações reais de relógio de parede produzidas pela execução de dois processos independentes, incluindo `total_ms` de tool e `stall_ms` de stream gravado; ainda se validam fórmula a fórmula `> 3000ms`, `value=metric_value`, itens parciais não excedendo o total, etc.
- O nível de token do runtime context na compaction; runtimes prompt/template antigos e novos podem gerar uma pequena diferença de tokens, mas campo, tipo não negativo e a relação `post/pre` e `true_post` ainda precisam ser validados. O usage de `message_completion` do main-turn comum não é normalizado, e vazamento por sidecar/title continua sendo tratado como falha.

IDs não são removidos: são mapeados pela primeira ocorrência para aliases estáveis como `SESSION_1`, `MESSAGE_1`, `TOOL_1`, continuando a validar as relações entre eventos.
`input_id`, `query_id` e `request_id` usam espaços de alias independentes, validando-se a estabilidade entre started/completed de cada um;
não se compara se esses três IDs são iguais entre si. A versão antiga gerava separadamente os IDs de UI de message/input/query, enquanto o protocolo de command do V4 aprovado usa o mesmo `sourceCommandId` como âncora de input/query; isso é uma mudança na estratégia de geração de valores opacos, não nos campos reportados nem nas relações de disparo.
Campos desconhecidos não entram automaticamente na whitelist; qualquer nova regra de normalização precisa atualizar este spec e explicar o motivo.

As seguintes diferenças são sempre falha:

- Evento ausente, duplicado ou novo inesperado dentro do escopo-alvo.
- key set, nome de campo ou tipo string/number/boolean diferentes.
- `""`, missing, `null` ou valores zero fixos diferentes.
- status/result/model/provider, região/tipo/texto do evento diferentes.
- Associação talk/message/tool/sourceCommand ou ordem de negócio estável diferentes. Na versão antiga, o `agent_step`/`message_completion` do mesmo terminal era enviado por duas chamadas assíncronas fire-and-forget, então a ordem relativa de conclusão na rede já era instável; o diferencial casa pelo nome do evento e pela ocorrência de mesmo nome, e não trata esse tipo de intercalação de terminales diferentes como diferença de especificação. A ordem das fases de negócio dentro do mesmo evento (por exemplo `plan_request started → completed`) ainda precisa ser idêntica.
- Limites de disparo diferentes em foreground/background, live/recovery, 3000/3001, etc.
- Valores zero fixos da versão antiga virarem não zero por campos novos do runtime V4, ou campos novos como `compactReason` alterando a string vazia antiga.

Campos de duração não são apagados por completo. Durações afetadas por agendamento são comparadas por janela de fixture e invariantes; valores zero fixos, clamp de negativos,
relações entre itens parciais e o total, stall threshold e permission waiting precisam satisfazer exatamente as fórmulas antigas. A fixture controlada
deixa um intervalo positivo explícito para a fase de reasoning; mas execuções repetidas nas duas versões provaram que as duas chamadas de `Date.now()` do renderer antigo ainda podem ser
comprimidas no mesmo milissegundo pelo event loop, então apenas `reasoning agent_step.duration_ms` pode ser normalizado dentro da faixa de inteiros não negativos.
Diferenças de zero/valor positivo em steps como `generation` e `tool_call` continuam falhando.

### Artefatos do diferencial

```text
packages/desktop/.e2e-artifacts/telemetry-parity/<run-id>/<case-id>/
├── legacy/capture.raw.json
├── legacy/arms-final.raw.jsonl
├── current/capture.raw.json
├── legacy.normalized.json
├── current.normalized.json
├── diff.json
└── legacy|current/{home,network,wdio}/
```

`capture.raw.json` salva simultaneamente o `/event/report`-alvo, o ARMS final e a fase de captura; `diff.json` salva case/run,
commit legacy/current, caminho de captura, fase de captura e as diferenças estruturadas, portanto não se gera mais um manifest separado.

As categorias de diff são fixas: `MISSING_EVENT`, `EXTRA_EVENT`, `MISSING_FIELD`, `EXTRA_FIELD`,
`TYPE_MISMATCH`, `VALUE_MISMATCH`, `RELATION_MISMATCH`, `ORDER_MISMATCH`,
`TIMING_INVARIANT_MISMATCH`.

Os artefatos brutos ficam só localmente e não podem ser commitados. Só o payload normalized legado, passado por alias de IDs e verificado quanto a privacidade, pode ser promovido a
golden do repositório atual. Corpo de prompt, input/output de tool, path/query de URL, token/header, se aparecerem em algum fato ou golden, fazem o teste falhar diretamente.

## Ordem de implementação e promoção

1. **Fatia vertical**: com TDP02, estabelecer o runner de dois repositórios, os pontos de captura finais, o normalizador e o diff estruturado.
2. **Completude do golden**: concluir os testes de payload completo/fake clock de TDP04-TDP08, TDP10-TDP13.
3. **E2E de ciclo de vida**: concluir os specs pending de TDP01-TDP03, TDP09, TDP11, TDP14-TDP19.
4. **Certificação da versão antiga**: rodar `z-code-2` e a versão atual case a case, tratando todos os diffs fora da whitelist.
5. **Golden legado**: após review humano, commitar o golden normalized anonimizado; o CI diário roda apenas a versão atual e não depende de `~/workspace/z-code-2`.
6. **Promoção formal**: verificação de fixture pending -> replay explícito -> replay default -> Docker isolado -> review/promoção humana -> admissão do preset Docker.
7. **Verificação final**: rodar os testes focados, o typecheck do E2E de desktop, `pnpm typecheck`, `pnpm lint`, e então fazer mais um smoke de runtime de desktop em produção, registrando as condições externas que ainda não podem ser cobertas.

### Resultado da execução de 2026-07-18

- `20260718-tdp-all-final/TDP01..TDP19`: os 19 cases capturaram o body HTTP final de
  `/event/report` a partir do `net.fetch` do Electron, e o payload final de ARMS a partir de antes do
  `armsRum.sendCustom` no processo main; os 19 `diff.json` tiveram `equal=true`, `differences=[]`.
- Cobertura de direct/queued/terminal, thought/text/tool/permission, foreground/background, stall de 3000/3001ms,
  três terminais de compact, cinco estados de model request, erro visível/suprimido, feedback, quota, verificação de segurança da versão oficial, live-only/
  recovery, workspace/remote/Web no-op. TDP16/TDP17/TDP19 executaram ainda as asserções positivas de estado de quota/segurança/Web em produção, proibindo que 「vazio dos dois lados」 sirva de aprovação.
- `20260718-tdp02-final/TDP02` e `20260718-core-i/TDP-CORE` continuam como evidência de execução representativa com provider/replay real,
  cobrindo dois turnos consecutivos, sucesso de ferramenta, compact success, reasoning, stall de 3001ms e interrupt, com diff ainda 0.
  Os cases atômicos usam sequências de fatos controladas para fabricar de forma estável condições instáveis de provider como falha, espera de permissão e limites exatos em milissegundos.
- O inventário-alvo confere com a auditoria dos pontos de chamada de produção do repositório antigo: `/event/report` tem apenas `send_btn`,
  `message_completion`, `agent_step`, `context_compaction`, `assistant_message_feedback`; o ARMS tem apenas os cinco
  `perf_ui_*`, `plan_request`, `plan_ttft` e `chat_error_banner`. Eventos internos do módulo de compra não fazem parte deste escopo.
- A regressão focada passou em 14 arquivos e 152 itens; a verificação de fixtures, o typecheck completo e o lint completo passaram.

A captura em duas rodadas também provou que a ordem de conclusão na rede de `agent_step`/`message_completion` da versão antiga troca entre turnos adjacentes, então o runner
compara apenas a ordem de negócio estável e não confunde a flutuação concorrente de fire-and-forget com uma diferença de especificação. Os specs diferenciais continuam em
`manual-review/pending`, contando apenas evidências automatizadas já executadas e não antecipando um gate formal. Os artefatos brutos ficam só localmente.

## Definição de conclusão

- Cada um de TDP01-TDP19 tem captura da saída final Electron dupla (legada/current) e um diff independente; os cases com relato esperado zero ainda têm asserções positivas de que o estado de produção de fato foi alcançado.
- Os eventos-alvo legados de `/event/report` e do ARMS não têm ausência, duplicação nem erro de campo/tipo/relação na versão atual.
- As fronteiras negativas (Web/celular, initial/hydration/recovery, ARMS de UI em background) têm prova automatizada.
- A regressão de quota para na passagem da entrada de Upgrade da conversa e não disfarça o fluxo de compra como resultado desta recuperação.
- O catálogo de cases, a matriz de cobertura, o manifest de fixtures e o estado real dos specs ficam sincronizados; pending não conta como gate formal.
- Os artefatos brutos do diferencial não são commitados e o golden anonimizado passa nos testes de privacidade.